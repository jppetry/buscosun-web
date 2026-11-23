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
import { MELT } from './meltcore.mjs';
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

/** May a run continue a state? `null` = yes, else the reason. `rules` = { precip, density } of the run. */
export function stateRefusal(state, rules, t0Ms) {
  if (!state) return 'kein Zustand (snowpack/state.json fehlt): erst den Startzustand einspielen oder mit --snowpack-start=cold beginnen';
  if (state.rules?.precip !== rules.precip || state.rules?.density !== rules.density) return `Zustand aus anderer Rechnung (${state.rules?.precip}/${state.rules?.density} statt ${rules.precip}/${rules.density}): eine Schneedecke stammt aus einer Rechnung`;
  if (!(state.atMs <= t0Ms)) return `Zustand liegt in der Zukunft (${new Date(state.atMs).toISOString()})`;
  return null;
}
