/**
 * Phase GM, GM-3c (audit/gletscher-schneemodell.md §3f) — pure core of the snowpack line: the snow core (`snowcore.mjs`) driven per glacier at three
 * elevations (tongue, median, top), the carried state and the row of the document. No network, no files, no buscosun Fusion.
 *
 * Mass at one elevation, per hour — the formulas of the melt core (`simulate` in `meltcore.mjs`; verify:glacier-snowpack compares the two on one band):
 *   accumulation  S = factor · precipitation · solid share   (handed in as `s`, already multiplied)
 *   snow albedo   towards fresh snow with S, else the decay of the melt core
 *   melt          TF · T' + SRF · (1 − albedo) · G above the threshold, T' = damped positive temperature; it takes at most the snow that is there
 * Thickness: `stepPack` of the snow core with the set of constants of the run (`snowCoreSetup`).
 *
 * The state does not depend on the cadence of the runs (audit §3f.1 B: the melt state was dropped by every run 3 h after its predecessor): it belongs to
 * the RUN HOUR and carries, per glacier, the packs, the snow albedo and the forcing of the next `GLACIER_SNOWPACK_PEND_H` hours. The next run computes
 * from there with that stored forcing up to its own run hour (`advanceEntry`) and goes on with its own answers. Hours beyond the stored forcing are
 * counted as hours without forcing, never filled.
 *
 * Reproducible: the forcing is rounded to the resolution of the state BEFORE any step (`driveOf`), and the pack of the run hour is the one the state
 * stores (`normalizeLevel`) — so the next run, replaying the stored hours, walks exactly the path this run forecast.
 */
import { MELT, rng, gauss, quantile } from './meltcore.mjs';
import { emptyPack, stepPack, packSwe, packDepthCm, newSnow, packToRow, packFromRow } from './snowcore.mjs';
import { GLACIER_SNOWPACK_DAYS, GLACIER_SNOWPACK_WINDOWS, GLACIER_SNOWPACK_PEND_H, GLACIER_SNOWPACK_DENSITY_BOUNDS } from '../../../src/glacier/glacierSnowpackContract.ts';

const H = 3_600_000;
const r1 = (x) => Math.round(x * 10) / 10 + 0;
const DECAY = Math.exp(-1 / MELT.tauH);

/** The producer switch `--snowpack=off|shadow` / `GLACIER_SNOWPACK`. `off` (the default and the fall back): nothing of this line is read or written. */
export const SNOWPACK_MODES = Object.freeze(['off', 'shadow']);
export const SNOWPACK_DEFAULT = 'off';
/** `--snowpack-start=state|cold`: `state` (default) needs a state to continue; `cold` lets a run without one begin at zero and say so. */
export const SNOWPACK_STARTS = Object.freeze(['state', 'cold']);
export const SNOWPACK_START_DEFAULT = 'state';
const wordOf = (value, allowed, fallback, name) => {
  if (value == null || value === '') return fallback;
  if (!allowed.includes(value)) throw new Error(`${name}: unbekannte Stellung „${value}“ (erlaubt: ${allowed.join(', ')})`);
  return value;
};
export const snowpackModeOf = (value) => wordOf(value, SNOWPACK_MODES, SNOWPACK_DEFAULT, 'Schneedecke');
export const snowpackStartOf = (value) => wordOf(value, SNOWPACK_STARTS, SNOWPACK_START_DEFAULT, 'Start der Schneedecke');

/** A level without snow: empty pack, aged snow albedo (the start of the melt core). */
export const emptyLevel = () => ({ pack: emptyPack(), aS: MELT.aFirnSnow });
/** Albedo of the bare surface at elevation `z` of a glacier with the equilibrium line stand-in `ela` (the rule of the melt core). */
export const bareAlbedo = (z, ela) => (z < ela ? MELT.aIce : MELT.aFirn);

/**
 * One hour at one elevation. `T` °C, `S` solid precipitation (mm, factor included), `G` radiation (W m⁻²); `par` = { TF, SRF, aBare }.
 * Returns the melt actually taken from the snow (mm). `tMs` = start of the hour.
 */
export function stepLevel(lv, { tMs, T, S, G }, par, c) {
  lv.aS = S > 0 ? lv.aS + (MELT.aFresh - lv.aS) * Math.min(1, S / 5) : MELT.aFirnSnow + (lv.aS - MELT.aFirnSnow) * DECAY;
  const Ti = T <= 0 ? T : MELT.bIce * T;
  const alb = packSwe(lv.pack) + S > MELT.sweMin ? lv.aS : par.aBare;
  const m = Ti > MELT.tT ? par.TF * Ti + par.SRF * (1 - alb) * G : 0;
  return stepPack(lv.pack, { tMs, solidMm: S, meltMm: m, tC: T }, c).melted;
}

/**
 * The forcing of one glacier in the resolution of the state: per elevation the temperature (0.1 °C) and the solid precipitation (0.01 mm), the
 * radiation (1 W m⁻²). `tz` [3][n] °C, `share` [3][n] 0…1, `p` [n] mm (not finite = none), `g` [n] W m⁻², `factor` [3]. Throws on a temperature gap.
 */
export function driveOf({ tz, share, p, g, factor, hours }) {
  const t = [0, 1, 2].map(() => new Array(hours)), s = [0, 1, 2].map(() => new Array(hours)), gg = new Array(hours);
  for (let h = 0; h < hours; h++) {
    const ph = Number.isFinite(p[h]) ? Math.max(0, p[h]) : 0;
    gg[h] = Number.isFinite(g[h]) ? Math.max(0, Math.round(g[h])) : 0;
    for (let l = 0; l < 3; l++) {
      if (!Number.isFinite(tz[l][h]) || !Number.isFinite(share[l][h])) throw new Error('Temperaturlücke');
      t[l][h] = Math.round(tz[l][h] * 10) + 0;
      s[l][h] = Math.round(100 * factor[l] * ph * Math.min(1, Math.max(0, share[l][h]))) + 0;
    }
  }
  return { t, s, g: gg };
}

/** Steps the three levels through the hours `from` … `to − 1` of a drive that starts at `t0Ms`. */
function run3(levels, drive, t0Ms, from, to, pars, c) {
  for (let h = from; h < to; h++) for (let l = 0; l < 3; l++) stepLevel(levels[l], { tMs: t0Ms + h * H, T: drive.t[l][h] / 10, S: drive.s[l][h] / 100, G: drive.g[h] }, pars[l], c);
}

/**
 * A level in the form the state can hold: mass and thickness on 0.1, a layer that rounds to no mass dropped, the density of every layer inside the
 * bounds of the contract, the albedo on 0.001. Returns the row of the pack; `lv` is changed to exactly what the row says.
 */
export function normalizeLevel(lv, c) {
  const raw = packToRow(lv.pack), out = [];
  const fix = (swe, h) => { if (swe <= 0) return [0, 0]; const lo = Math.ceil((100 * swe) / Math.min(c.rhoMax, GLACIER_SNOWPACK_DENSITY_BOUNDS[1]) - 1e-9), hi = Math.floor((100 * swe) / GLACIER_SNOWPACK_DENSITY_BOUNDS[0] + 1e-9); return [swe, Math.min(hi, Math.max(lo, h, 1))]; };
  out.push(...fix(raw[0], raw[1]));
  for (let i = 2; i < raw.length; i += 3) { const [swe, h] = fix(raw[i], raw[i + 1]); if (swe > 0) out.push(swe, h, raw[i + 2]); }
  lv.pack = packFromRow(out);
  lv.aS = Math.round(lv.aS * 1000) / 1000;
  return out;
}

/** The levels of a state entry (`null` = no entry: three empty levels). */
export const levelsOfEntry = (entry) => (entry ? [0, 1, 2].map((l) => ({ pack: packFromRow(entry[2][l]), aS: entry[3][l] / 1000 })) : [emptyLevel(), emptyLevel(), emptyLevel()]);

/**
 * Brings the levels of a state entry from `atMs` to `t0Ms` with the forcing the entry carries. Returns `{ levels, replayed, holes }`: the hours computed
 * from the stored forcing and the hours without forcing (added to the entry's count). `t0Ms` before `atMs` throws: a state from the future is not used.
 */
export function advanceEntry(entry, atMs, t0Ms, pars, c) {
  const gap = Math.round((t0Ms - atMs) / H);
  if (gap < 0) throw new Error('Zustand liegt in der Zukunft');
  const levels = levelsOfEntry(entry), pend = entry[4];
  const n = pend ? Math.min(gap, pend[2].length) : 0;
  if (n > 0) run3(levels, { t: pend[0], s: pend[1], g: pend[2] }, atMs, 0, n, pars, c);
  return { levels, replayed: n, holes: gap - n };
}

/**
 * The row of one glacier and its state entry for the next run.
 *   levels   the three levels AT the run hour (from `advanceEntry`, or empty ones); they are normalized here and then stepped through the forecast
 *   drive    `driveOf` of this run, from the run hour
 *   begin    hour (since epoch) this glacier's calculation began; holes = hours without forcing since then
 * Returns `{ row, entry }` — `row` without the fields the caller adds (`from` when the begin is later than the chain's).
 */
export function snowpackOfGlacier({ id, z, from = 'own', lapse = false, levels, drive, pars, c, t0Ms, begin, holes = 0, days = GLACIER_SNOWPACK_DAYS, pendH = GLACIER_SNOWPACK_PEND_H }) {
  const hours = days * 24;
  if (drive.g.length < hours) throw new Error('Antrieb kürzer als die Vorhersage');
  const rows = levels.map((lv) => normalizeLevel(lv, c));
  const entry = [begin, holes, rows, levels.map((lv) => Math.round(lv.aS * 1000)), [drive.t.map((a) => a.slice(0, pendH)), drive.s.map((a) => a.slice(0, pendH)), drive.g.slice(0, pendH)]];
  const row = {
    id, z: z.map((v) => Math.round(v)), f: from, ...(lapse ? { lv: 'lapse' } : {}),
    hs: levels.map((lv) => r1(packDepthCm(lv.pack))), swe: levels.map((lv) => r1(packSwe(lv.pack))),
    hn: levels.map((lv) => GLACIER_SNOWPACK_WINDOWS.map((w) => r1(newSnow(lv.pack, t0Ms, w, c).cm))),
    hsd: [[], [], []], hnd: [[], [], []],
  };
  // forecast: on copies, so that `levels` stays the state of the run hour
  const fc = levels.map((lv) => ({ pack: packFromRow(packToRow(lv.pack)), aS: lv.aS }));
  for (let d = 0; d < days; d++) {
    run3(fc, drive, t0Ms, 24 * d, 24 * d + 24, pars, c);
    const tEnd = t0Ms + (24 * d + 24) * H;
    for (let l = 0; l < 3; l++) { const hs = r1(packDepthCm(fc[l].pack)); row.hsd[l].push(hs); row.hnd[l].push(Math.min(hs, r1(newSnow(fc[l].pack, tEnd, 24, c).cm))); }
  }
  // the windows of the run hour never exceed each other or the depth by more than the rounding
  for (let l = 0; l < 3; l++) { const a = row.hn[l]; a[2] = Math.min(a[2], row.hs[l]); a[1] = Math.min(a[1], a[2]); a[0] = Math.min(a[0], a[1]); }
  if (holes > 0) row.gap = holes;
  return { row, entry };
}

/**
 * Temperature and solid share of a glacier WITHOUT own answers at its three elevations, from the three answers of its neighbour (E-GM-16): the rule
 * functions of the weather core (`at` = { temp(zq, h), share(zq, h) } on the neighbour's answers), then never more below than above.
 */
export function placeLevels(z, hours, at) {
  const tz = z.map(() => new Float64Array(hours)), share = z.map(() => new Float64Array(hours));
  for (let h = 0; h < hours; h++) {
    for (let l = 0; l < 3; l++) { tz[l][h] = at.temp(z[l], h); share[l][h] = at.share(z[l], h); }
    share[1][h] = Math.min(share[1][h], share[2][h]); share[0][h] = Math.min(share[0][h], share[1][h]);
  }
  return { tz, share };
}

// --- GM-4 (E-GM-20): shadow pairs — the snowpack at the station elevation next to the station. A comparison; nothing here changes the snowpack. ---

/** The producer switch `--snowpack-pairs=off|on` / `GLACIER_SNOWPACK_PAIRS`, read only with the snowpack on. `off` (the default, the fall back): no pairs file. */
export const SNOWPACK_PAIRS_MODES = Object.freeze(['off', 'on']);
export const SNOWPACK_PAIRS_DEFAULT = 'off';
export const snowpackPairsModeOf = (value) => wordOf(value, SNOWPACK_PAIRS_MODES, SNOWPACK_PAIRS_DEFAULT, 'Schattenpaare');

/**
 * A value of the three elevations `z` (ascending; `vals` in the same order) at the elevation `zs`: linear between the two neighbouring elevations,
 * below the lowest the lowest value, above the highest the highest (never extrapolated). Returns `{ v, at }` with `at` = below | inside | above.
 */
export function atElevation(z, vals, zs) {
  if (zs < z[0]) return { v: vals[0], at: 'below' };
  if (zs > z[2]) return { v: vals[2], at: 'above' };
  const l = zs <= z[1] ? 0 : 1, a = z[l], b = z[l + 1];
  return { v: b > a ? vals[l] + ((vals[l + 1] - vals[l]) * (zs - a)) / (b - a) : vals[l], at: 'inside' };
}

/**
 * The pairs of one run. `rows` = rows of the snowpack document (z, hs, hn at the run hour); `map` = the station mapping document (section `ext`: every
 * network and quantity — throws without it); `slot` = the station hour document (sections `stations` and `ext.stations`); `t0Ms` = run hour;
 * `windowMin` = [minutes before, minutes after] in which a station stamp counts. Pairs follow the order of `rows`. Throws when the inputs are not usable
 * — never a pair from a guessed station.
 * GM-5c: `forecast` = { days: [1, 2, 3], at: Map(glacier id → { zs, q }) } only in a run with spreads — every pair then carries `fm` (the expected depth
 * at the end of those days at the station elevation) and either `fq` (`q` = [p10 per day, p90 per day] of `spreadOfGlacier` for exactly this station
 * elevation) or the row's reason `sq`. A row with a spread whose quantiles at the station elevation are missing throws — never the row's own quantiles
 * mixed between two levels instead. Without `forecast` every pair is what it was.
 */
export function pairsOf({ rows, map, slot, t0Ms, windowMin, forecast = null }) {
  const ext = map?.ext;
  if (!ext?.glaciers || !ext?.stations) throw new Error('Stationszuordnung ohne Abschnitt ext');
  if (!slot?.stations) throw new Error('Stationsslot ohne Abschnitt stations');
  const entries = { ...slot.stations, ...(slot.ext?.stations ?? {}) };
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const pairs = [], at = { below: 0, inside: 0, above: 0 }, why = {};
  let withValue = 0, mappedWithoutRow = 0, fPairs = 0;
  const fNone = {};
  const r2 = (x) => Math.round(x * 10) / 10 + 0;
  for (const r of rows) {
    const snow = ext.glaciers[r.id]?.snow;
    if (!snow) continue;
    const [sid, km, dz] = snow, st = ext.stations[sid];
    if (!st || !Number.isFinite(st.elev)) throw new Error(`Station ${sid} ohne Höhe im Katalog der Zuordnung`);
    const m = atElevation(r.z, r.hs, st.elev);
    const hn = [0, 1, 2].map((w) => r2(atElevation(r.z, r.hn.map((h) => h[w]), st.elev).v));
    hn[1] = Math.max(hn[1], hn[0]); hn[2] = Math.max(hn[2], hn[1]);
    const e = entries[sid], p = { g: r.id, s: sid, net: sid.split(':')[0], km, dz, z: st.elev, at: m.at, m: r2(m.v), hn, v: null, age: null };
    const stamp = e ? Date.parse(e.t) : NaN;
    if (!e || !Number.isFinite(e.v?.snow) || !Number.isFinite(stamp)) p.why = 'no-value';
    else {
      const age = Math.round((t0Ms - stamp) / 60_000);
      if (age > windowMin[0]) { p.age = age; p.why = 'stale'; }
      else if (age < -windowMin[1]) { p.age = age; p.why = 'future'; }
      else { p.v = e.v.snow; p.age = age; withValue++; }
    }
    if (e?.hsd && Object.keys(e.hsd).length) p.hsd = e.hsd;
    if (forecast) {
      // GM-5c: the forecast at the station elevation — the expected depth like `m`; the spread as the scenarios gave it AT this elevation, or the row's reason
      p.fm = forecast.days.map((d) => r2(atElevation(r.z, r.hsd.map((a) => a[d - 1]), st.elev).v));
      if (r.sq) { p.sq = r.sq; fNone[r.sq] = (fNone[r.sq] ?? 0) + 1; }
      else {
        const q = forecast.at.get(r.id);
        if (!r.hsq || !q || q.zs !== st.elev) throw new Error(`Spanne in Stationshöhe fehlt (${r.id}, ${sid})`);
        p.fq = q.q; fPairs++;
      }
    }
    at[p.at]++; if (p.why) why[p.why] = (why[p.why] ?? 0) + 1;
    pairs.push(p);
  }
  for (const [id, g] of Object.entries(ext.glaciers)) if (g.snow && !rowOf.has(id)) mappedWithoutRow++;
  return { pairs, counts: { pairs: pairs.length, withValue, at, why, mappedWithoutRow }, ...(forecast ? { forecast: { pairs: fPairs, none: fNone } } : {}) };
}

/**
 * GM-5c (V-GM-79): the elevation of the snow station of every glacier that has one, from the station mapping (section `ext`, as `pairsOf` reads it).
 * Throws without that section; a station without an elevation is left out here — `pairsOf` names it.
 */
export function stationLevelsOf(map) {
  const ext = map?.ext;
  if (!ext?.glaciers || !ext?.stations) throw new Error('Stationszuordnung ohne Abschnitt ext');
  const out = new Map();
  for (const [id, g] of Object.entries(ext.glaciers)) { const zs = g?.snow ? ext.stations[g.snow[0]]?.elev : null; if (Number.isFinite(zs)) out.set(id, zs); }
  return out;
}

// --- GM-5a (E-GM-32 … E-GM-35): the spread of the forecast from scenarios. Nothing here changes an expected value, the row's other fields or the state. ---

/** The producer switch `--snowpack-spread=off|scenarios` / `GLACIER_SNOWPACK_SPREAD`, read only with the snowpack on. `off` (the default, the fall back): no scenario is computed. */
export const SNOWPACK_SPREAD_MODES = Object.freeze(['off', 'scenarios']);
export const SNOWPACK_SPREAD_DEFAULT = 'off';
export const snowpackSpreadModeOf = (value) => wordOf(value, SNOWPACK_SPREAD_MODES, SNOWPACK_SPREAD_DEFAULT, 'Spanne der Schneedecke');

/**
 * Temperature and solid share of ONE scenario for a row that does not run on three answers: the expected temperature `tz` [3][hours] plus the sigma of
 * the answer (`sg` [hours], a missing value = 0) times the path `zT`; the solid share keeps its distance to the temperature rule `ramp` (so a scenario
 * without a temperature error IS the expected share `share`), stays between 0 and 1, and is never more below than above.
 */
export function shiftLevels({ tz, share, sg, zT, hours, ramp }) {
  const tzS = tz.map(() => new Float64Array(hours)), sh = tz.map(() => new Float64Array(hours));
  for (let h = 0; h < hours; h++) {
    const d = (sg && Number.isFinite(sg[h]) ? sg[h] : 0) * zT[h];
    for (let l = 0; l < 3; l++) { tzS[l][h] = tz[l][h] + d; sh[l][h] = Math.min(1, Math.max(0, ramp(tzS[l][h]) + (share[l][h] - ramp(tz[l][h])))); }
    sh[1][h] = Math.min(sh[1][h], sh[2][h]); sh[0][h] = Math.min(sh[0][h], sh[1][h]);
  }
  return { tz: tzS, share: sh };
}

/**
 * The spread of one glacier's forecast: `rule.k` scenarios from the SAME levels of the run hour (`levels`, normalized by `snowpackOfGlacier`; they are
 * not changed here). A scenario is ONE path of the precipitation level and ONE path of the temperature error (AR(1), hourly correlation `rule.rho`,
 * independent), a precipitation factor and a systematic density factor fixed for the scenario, and an event density factor drawn anew per day
 * (log-normal with `rule.sigma`; the density stays between the floor and the maximum of the constants).
 *   p, g, factor   what `driveOf` took for the expected values: precipitation mm [hours], radiation [hours], factor [3]
 *   amount(h, zP)  precipitation of hour `h` at the standard-normal level `zP` (the caller knows the answer's distribution)
 *   place(zT)      `{ tz, share }` [3][hours] for the temperature-error path `zT` (standard normal per hour; the caller knows sigma and the phase rule)
 * Returns per elevation `hsq`, `hnq` = [p10 per day, p90 per day] of the scenario VALUES (cm, 0.1) and `hnw` = [p10, median, p90] of the scenario SUMS
 * of the new snow of the days `rule.week2` — never a sum of daily quantiles.
 * GM-5c (V-GM-79): `at` = { z: the three elevations of the row, zs: one more elevation, days: n } adds `at` = [p10 per day, p90 per day] of the snow depth
 * at `zs` for the first n days — every scenario is read at `zs` between its three levels (`atElevation`), then the quantile is taken; never a mix of
 * the quantiles of two levels. It draws no random number and changes none of the other fields; without `at` the result has no such key.
 */
export function spreadOfGlacier({ levels, pars, c, t0Ms, seed, rule, p, g, factor, amount, place, days = GLACIER_SNOWPACK_DAYS, at = null }) {
  const hours = days * 24, k = rule.k, a = Math.sqrt(1 - rule.rho * rule.rho), sg = rule.sigma, [w0, w1] = rule.week2;
  if (!(Number.isInteger(k) && k >= 1) || !(w0 >= 1 && w0 <= w1 && w1 <= days)) throw new Error('Spanne: Regel unbrauchbar');
  if (at && !(Number.isInteger(at.days) && at.days >= 1 && at.days <= days && Number.isFinite(at.zs) && Array.isArray(at.z) && at.z.length === 3 && at.z.every(Number.isFinite))) throw new Error('Spanne: Stationshöhe unbrauchbar');
  const sa = at ? Array.from({ length: at.days }, () => new Float64Array(k)) : null;
  const start = levels.map((lv) => ({ row: packToRow(lv.pack), aS: lv.aS }));
  const hs = [0, 1, 2].map(() => Array.from({ length: days }, () => new Float64Array(k))), hn = [0, 1, 2].map(() => Array.from({ length: days }, () => new Float64Array(k)));
  const wk = [0, 1, 2].map(() => new Float64Array(k));
  const r = rng((seed >>> 0) || 1), ps = new Float64Array(hours), zTs = new Float64Array(hours);
  for (let s = 0; s < k; s++) {
    let zP = gauss(r), zT = gauss(r);
    const fMul = Math.exp(sg.factor * gauss(r)), rhoSys = Math.exp(sg.densitySystematic * gauss(r));
    for (let h = 0; h < hours; h++) {
      zP = rule.rho * zP + a * gauss(r); zT = rule.rho * zT + a * gauss(r);
      zTs[h] = zT;
      ps[h] = Number.isFinite(p[h]) ? amount(h, zP) : p[h];
    }
    const { tz, share } = place(zTs);
    const drive = driveOf({ tz, share, p: ps, g, factor: factor.map((f) => f * fMul), hours });
    const fc = start.map((x) => ({ pack: packFromRow(x.row), aS: x.aS }));
    for (let d = 0; d < days; d++) {
      const cd = { ...c, rhoNew: Math.min(c.rhoMax, Math.max(c.rhoNewFloor, c.rhoNew * rhoSys * Math.exp(sg.densityEvent * gauss(r)))) };
      run3(fc, drive, t0Ms, 24 * d, 24 * d + 24, pars, cd);
      const tEnd = t0Ms + (24 * d + 24) * H;
      for (let l = 0; l < 3; l++) {
        const v = r1(packDepthCm(fc[l].pack)), n = Math.min(v, r1(newSnow(fc[l].pack, tEnd, 24, cd).cm));
        hs[l][d][s] = v; hn[l][d][s] = n;
        if (d + 1 >= w0 && d + 1 <= w1) wk[l][s] += n;
      }
      if (sa && d < sa.length) sa[d][s] = atElevation(at.z, [hs[0][d][s], hs[1][d][s], hs[2][d][s]], at.zs).v;
    }
  }
  const q = (x, at) => { const srt = Float64Array.from(x).sort(); return at.map((v) => r1(quantile(srt, v))); };
  const pair = (lv) => { const lo = [], hi = []; for (const x of lv) { const [a10, a90] = q(x, [0.1, 0.9]); lo.push(a10); hi.push(a90); } return [lo, hi]; };
  return { hsq: hs.map(pair), hnq: hn.map(pair), hnw: wk.map((x) => q(x, [0.1, 0.5, 0.9])), ...(sa ? { at: pair(sa) } : {}) };
}

/** May a run continue a state? `null` = yes, else the reason. `rules` = { precip, density } of the run. */
export function stateRefusal(state, rules, t0Ms) {
  if (!state) return 'kein Zustand (snowpack/state.json fehlt): erst den Startzustand einspielen oder mit --snowpack-start=cold beginnen';
  if (state.rules?.precip !== rules.precip || state.rules?.density !== rules.density) return `Zustand aus anderer Rechnung (${state.rules?.precip}/${state.rules?.density} statt ${rules.precip}/${rules.density}): eine Schneedecke stammt aus einer Rechnung`;
  if (!(state.atMs <= t0Ms)) return `Zustand liegt in der Zukunft (${new Date(state.atMs).toISOString()})`;
  return null;
}
