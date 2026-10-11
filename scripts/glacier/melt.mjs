#!/usr/bin/env node
/**
 * GL-3 — melt run of the glacier line (plan §8): buscosun Fusion in Node at the median elevation of every glacier, the band model of `lib/meltcore.mjs`
 * (calibrated in `gate-c.mjs`), scenario sums with a spread, unit or index according to the calibration gate.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/melt.mjs \
 *        --data=<v1 dir of the glacier data repo> --cube=<checkout of buscosun-data with point/> --out=<dir> [--patch=<dir>] [--archive-out=<dir>]
 *        [--calibration=<json>] [--now=<iso>] [--only=<ids>] [--limit=N] [--classes=A,B,C] [--always]
 *
 * Rules (each one tested in verify:glacier-melt):
 *  - needs `public/climaGrid.json` (the climatology of buscosun Fusion): without it the engine runs WITHOUT distributions and would write nothing true — the job is RED (V-SW-18);
 *  - runs only for a new tier-2/3 run of the cube (`repeatVerdict` style: same inputs ⇒ skipped), at most 4 × a day;
 *  - class C glaciers take the forcing of the nearest class A/B glacier of their region within 60 km (own bands, neighbour's forcing) instead of an own Fusion call;
 *    one without such a neighbour gets its own Fusion point (23 of 2 203 glaciers) — a glacier is never skipped for lack of a neighbour;
 *  - a spread of a sum is the quantile of the sums of K scenarios, never a sum of hourly quantiles; the hourly p10/p90 are single-hour spreads only;
 *  - the unit "mm w. e." is written ONLY when the calibration says `gate.unit === true` (Gate C passed); otherwise the file carries the unitless index and no
 *    millimetre field at all.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { makeIo, dirStore, geoBackend } from '../road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { terrainScales } from '../../src/pointForecast/fusion/terrainScale.ts';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { freezeFromCells } from '../../src/nowcast/heightTime/heightTimeModel.ts';
import { fusionName, fusionVersionOfNotes, FUSION_CURRENT } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { glacierSatClass } from '../../src/glacier/glacierSatContract.ts';
import { glacierStaticPath, glacierHypsoFile, GLACIER_MELT_KEEP_MS } from '../../src/glacier/glacierContract.ts';
import {
  GLACIER_MELT_DAYS, GLACIER_MELT_HOURS, GLACIER_MELT_SCENARIOS, GLACIER_MELT_RHO, GLACIER_MELT_REF_DAILY_MM, GLACIER_MELT_PER_DAY_MAX,
  glacierMeltRunPath, GLACIER_MELT_STATE_PATH, meltIndexOf, meltProblems,
} from '../../src/glacier/glacierMeltContract.ts';
import { MELT, bandsOf, emptyState, simulate, cosZenith, clearSky, cloudFactor, scenarioPaths, quantile } from './lib/meltcore.mjs';

const H = 3_600_000;
/** Snow water (mm) given to a band the satellite saw snow-covered (`set`); a band seen snow-free is emptied. */
export const MELT_SNOW_NUDGE_MM = 250;
/** The state carried from the previous run is used up to this age (hours), then the run starts cold (named). */
export const MELT_STATE_MAX_AGE_H = 30;
/** Hours of the run after which the state is stored for the next run. */
export const MELT_STATE_ADVANCE_H = 6;
/** A satellite row counts for the nudge up to this age (days; the client's own limit). */
export const MELT_SAT_MAX_AGE_DAYS = 20;
/** Share of hours with a temperature a glacier needs to get a result. */
export const MELT_MIN_HOURS_SHARE = 0.8;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readJson = (p) => { try { return J(p); } catch { return null; } };
const r1 = (x) => Math.round(x * 10) / 10;
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 10);

/** Temperature lapse of the free atmosphere between the reference elevation and the freezing level (K/m, positive downward), standard when not usable. */
export function lapseOf(tRef, zRef, freezeM) {
  const std = -MELT.gamma;
  if (!(tRef > 1) || freezeM == null || !Number.isFinite(freezeM) || !(freezeM > zRef + 100)) return std;
  const g = tRef / (freezeM - zRef);
  return Math.min(0.009, Math.max(0.0045, g));
}

/** Linear fill of gaps of at most `maxGap` hours (a longer gap stays NaN). */
export function fillShortGaps(a, maxGap = 6) {
  const out = Float64Array.from(a);
  for (let i = 0; i < out.length;) {
    if (Number.isNaN(out[i])) {
      let j = i; while (j < out.length && Number.isNaN(out[j])) j++;
      if (i > 0 && j < out.length && j - i <= maxGap) for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1);
      i = j;
    } else i++;
  }
  return out;
}

/**
 * Hourly forcing of one glacier from a Fusion forecast: temperature at the reference elevation (mean and sigma), precipitation, cloud fraction, radiation
 * (clear sky × cloud factor), freezing level — all aligned to `hours` steps from `t0Ms`.
 */
export function forcingFromForecast(fc, { lat, lon, zRef, t0Ms, hours = GLACIER_MELT_HOURS }) {
  const t = new Float64Array(hours).fill(NaN), sg = new Float64Array(hours).fill(NaN), p = new Float64Array(hours).fill(NaN), n = new Float64Array(hours).fill(NaN);
  for (const s of fc.cube.v2.axis.steps) {
    const i = Math.round((s.validAtMs - t0Ms) / H);
    if (i < 0 || i >= hours) continue;
    const x = s.vars;
    t[i] = x.t2m?.mean ?? NaN; sg[i] = x.t2m?.sigma ?? NaN; p[i] = x.precip?.mean ?? NaN; n[i] = x.clct?.mean == null ? NaN : x.clct.mean / 100;
  }
  const tf = fillShortGaps(t), nf = fillShortGaps(n), pf = fillShortGaps(p, 3);
  const g = new Float64Array(hours);
  for (let i = 0; i < hours; i++) g[i] = clearSky(cosZenith(lat, lon, t0Ms + (i + 0.5) * H), zRef) * (Number.isFinite(nf[i]) ? cloudFactor(nf[i]) : 0.55);
  // freezing level at the native steps, held between them
  const fz = new Float64Array(hours).fill(NaN);
  try {
    const pts = freezeFromCells(fc.cube.v2, fc.cube.cells ?? [], t0Ms, t0Ms + hours * H);
    for (const q of pts) if (q.m != null && q.state === 'ok') { const i = Math.round((q.tMs - t0Ms) / H); if (i >= 0 && i < hours) fz[i] = q.m; }
    let last = NaN, since = 99;
    for (let i = 0; i < hours; i++) { if (Number.isFinite(fz[i])) { last = fz[i]; since = 0; } else if (Number.isFinite(last) && ++since <= 6) fz[i] = last; }
  } catch { /* standard lapse */ }
  // where the cube's pressure levels give no freezing level (a glacier above the 700 hPa level, ≈ 3 000 m): the level the standard lapse puts it at, from the temperature at the reference elevation (`zs` says which)
  const fzEst = Float64Array.from(tf, (v) => (Number.isFinite(v) ? Math.min(7000, Math.max(0, zRef + v / -MELT.gamma)) : NaN));
  const sigmaFallback = (i) => Math.min(3, 1 + 0.02 * i);
  const sgf = Float64Array.from(sg, (v, i) => (Number.isFinite(v) ? v : sigmaFallback(i)));
  const hoursWithT = tf.reduce((s, v) => s + (Number.isFinite(v) ? 1 : 0), 0);
  return { t: tf, sg: sgf, p: pf, n: nf, g, fz, fzEst, zRef, hoursWithT, sigmaMissing: sg.reduce((s, v) => s + (Number.isFinite(v) ? 0 : 1), 0) };
}

/** Temperature at elevation `z` for every hour with the lapse anchored on the freezing level where usable (`t` at `zRef`). */
export function tempAt(forcing, z, t = forcing.t) {
  const out = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t[i] - lapseOf(t[i], forcing.zRef, forcing.fz[i]) * (z - forcing.zRef);
  return out;
}

/**
 * Glacier-wide melt of one forcing through the bands. The band model uses the standard lapse inside `simulate`; the anchored lapse is applied by
 * shifting the reference temperature to the temperature at the glacier's median band (exact there, the standard lapse around it).
 * Returns the `simulate` result (hourly melt in mm w.e., end state).
 */
export function meltOfForcing({ bands, ela, forcing, params, state, tOverride = null, hours = null }) {
  const zMed = bands.zb[Math.floor(bands.zb.length / 2)];
  const n = hours ?? forcing.t.length;
  const tAt = tempAt(forcing, zMed, tOverride ?? forcing.t).subarray(0, n);
  return simulate({ bands, ela, t: tAt, g: forcing.g.subarray(0, n), p: forcing.p.subarray(0, n), zT: zMed, zP: forcing.zRef, pf: params.pf, TF: params.TF, SRF: params.SRF, state, model: 'eti' });
}

/** Daily sums of an hourly series that starts at the run hour (day d = hours 24 d … 24 d + 23). */
export const dailySums = (x, days = GLACIER_MELT_DAYS) => Array.from({ length: days }, (_, d) => { let s = 0; for (let h = 24 * d; h < Math.min(x.length, 24 * d + 24); h++) s += x[h]; return s; });

/** Elevation above which `share` of the glacier area lies (class B has no snow line, only a snow share — this is the equivalent line, never shown as one). */
export function impliedSnowline(bands, share) {
  if (share >= 0.999) return -Infinity;
  if (share <= 0.001) return Infinity;
  let acc = 0;
  for (let b = bands.zb.length - 1; b >= 0; b--) { acc += bands.w[b]; if (acc >= share) return bands.zb[b] - 25; }
  return -Infinity;
}

/**
 * Nudge of the snow state by the newest clear satellite scene: bands above the snow line carry snow (at least `MELT_SNOW_NUDGE_MM`), bands below it are
 * bare. `row` = a season row [date, clear, snow, state, sla, aar, …]. Returns the number of bands changed.
 */
export function nudgeState(state, bands, row) {
  const [, , snow, st, sla] = row;
  const line = st === 0 ? -Infinity : st === 2 ? Infinity : (sla ?? impliedSnowline(bands, snow));
  let changed = 0;
  for (let b = 0; b < bands.zb.length; b++) {
    const snowy = bands.zb[b] >= line;
    if (snowy && state.swe[b] < MELT_SNOW_NUDGE_MM) { state.swe[b] = MELT_SNOW_NUDGE_MM; changed++; }
    else if (!snowy && state.swe[b] > 0) { state.swe[b] = 0; changed++; }
  }
  return changed;
}

/** Deterministic seed from a run id and a glacier id. */
export function seedOf(run, id) {
  let h = 2166136261 >>> 0;
  for (const c of `${run}|${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h || 1;
}

/**
 * One glacier: scenario runs, daily index/mm triples, sums, ice share, freezing level, nights above 0 °C at the tongue, and the state for the next run.
 * `unit` = the calibration gate released millimetres.
 */
export function runGlacier({ g, hyp, forcing, params, state, ela, run, unit, k = GLACIER_MELT_SCENARIOS, rho = GLACIER_MELT_RHO }) {
  const bands = bandsOf(hyp);
  const nb = bands.zb.length;
  const st0 = state ?? emptyState(nb);
  const hours = forcing.t.length;
  // deterministic run: the state for the next run is the one after MELT_STATE_ADVANCE_H hours
  const adv = meltOfForcing({ bands, ela, forcing, params, state: st0, hours: MELT_STATE_ADVANCE_H });
  const t50 = forcing.t;
  const paths = scenarioPaths(t50, forcing.sg, k, rho, seedOf(run, g.id));
  const dayMm = [], sumsMm = [];
  for (const path of paths) {
    const r = meltOfForcing({ bands, ela, forcing, params, state: st0, tOverride: path });
    const d = dailySums(r.meltH);
    dayMm.push(d);
    sumsMm.push([d.slice(0, 7).reduce((a, b) => a + b, 0), d.reduce((a, b) => a + b, 0)]);
  }
  const q3 = (arr) => { const s = Float64Array.from(arr).sort(); return [quantile(s, 0.1), quantile(s, 0.5), quantile(s, 0.9)]; };
  const col = (d) => dayMm.map((x) => x[d]);
  const idxDay = Array.from({ length: GLACIER_MELT_DAYS }, (_, d) => q3(col(d).map(meltIndexOf)));
  const meanIdx = (n) => q3(dayMm.map((x) => Math.round(x.slice(0, n).map(meltIndexOf).reduce((a, b) => a + b, 0) / n))).map((v) => Math.round(v));
  const bare = bands.zb.map((z, b) => st0.swe[b] <= MELT.sweMin && z < ela);
  const ice = Math.round(100 * bands.w.reduce((s, w, b) => s + (bare[b] ? w : 0), 0));
  // freezing level (daily maximum) and nights above 0 °C at the tongue
  let fromCells = 0, fromLapse = 0;
  const zf = Array.from({ length: GLACIER_MELT_DAYS }, (_, d) => {
    let m = -Infinity;
    for (let h = 24 * d; h < Math.min(hours, 24 * d + 24); h++) {
      const v = Number.isFinite(forcing.fz[h]) ? forcing.fz[h] : forcing.fzEst?.[h];
      if (Number.isFinite(v)) { m = Math.max(m, v); if (Number.isFinite(forcing.fz[h])) fromCells++; else fromLapse++; }
    }
    return Number.isFinite(m) ? Math.round(m) : null;
  });
  const tTongue = tempAt(forcing, bands.zb[0]);
  let nf = 0;
  for (let d = 0; d < GLACIER_MELT_DAYS; d++) {
    // night = 22–05 UTC (≈ midnight in CET/CEST); only a complete, fully measured night counts
    const from = 24 * d + 22, to = from + 8;
    if (to > hours) continue;
    let mn = Infinity, ok = 0;
    for (let h = from; h < to; h++) if (Number.isFinite(tTongue[h])) { ok++; mn = Math.min(mn, tTongue[h]); }
    if (ok === 8 && mn > 0) nf++;
  }
  const row = {
    id: g.id,
    idx: idxDay.map((t) => t.map((v) => Math.round(v))), ix7: meanIdx(7), ix14: meanIdx(14),
    ice, zf, zs: fromCells && fromLapse ? 'mixed' : fromLapse ? 'lapse' : 'cells', nf, f: forcing.from ?? 'own',
  };
  if (unit) {
    row.mm = Array.from({ length: GLACIER_MELT_DAYS }, (_, d) => q3(col(d)).map(r1));
    row.s7 = q3(sumsMm.map((s) => s[0])).map(r1);
    row.s14 = q3(sumsMm.map((s) => s[1])).map(r1);
  }
  return { row, next: { swe: Array.from(adv.state.swe, (v) => Math.round(v * 10) / 10), aS: Array.from(adv.state.aS, (v) => Math.round(v * 1000)) } };
}

/** May a run start now? `{ run, reason }`. `prev` = the pointer `index.melt` of the data repo, `offered` = the runs `point/index.json` offers. */
export function repeatVerdict({ prev, offered, nowMs, runsToday = 0, always = false }) {
  const yes = (reason) => ({ run: true, reason });
  const no = (reason) => ({ run: false, reason });
  if (always) return yes('--always');
  if (runsToday >= GLACIER_MELT_PER_DAY_MAX) return no(`${runsToday} Läufe heute (höchstens ${GLACIER_MELT_PER_DAY_MAX})`);
  if (!prev?.cube) return yes('kein früherer Lauf');
  if (nowMs - Date.parse(prev.runAt) > 12 * H) return yes('letzter Lauf älter als 12 h');
  if (prev.engine?.version !== FUSION_CURRENT) return yes('anderer Stand von buscosun Fusion');
  for (const k of ['t2', 't3']) if (offered[k] && offered[k] !== prev.cube[k]) return yes(`${k} ${prev.cube[k] ?? '—'} → ${offered[k]}`);
  return no(`t2/t3 unverändert seit Lauf ${prev.run}`);
}

const km = (aLat, aLon, bLat, bLon) => {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLon = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** V-SW-18: without the climatology buscosun Fusion gives no distribution at all — the run stops (red job) instead of writing empty or untrue rows. */
export async function assertClima(io) {
  if (!(await io.clima())) throw new Error('Klimatologie von buscosun Fusion fehlt (public/climaGrid.json nicht im Checkout des Producers) — kein Schmelzlauf (V-SW-18)');
}

/** Flat terrain at elevation `h` built with the engine's own function (as the map fields do): the vertical correction lands on the glacier's median elevation. */
export function flatTerrain(h, lat, lon) {
  return { elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: null, horizonDeg: new Array(8).fill(0), scales: terrainScales(() => h, lon, lat), sinkDepthM: 0 };
}

export async function main(opts) {
  const dataDir = resolve(opts.data), cubeDir = resolve(opts.cube), outDir = resolve(opts.out);
  const patchDir = resolve(opts.patch ?? join(dirname(outDir), 'patch'));
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const t0Ms = Math.floor(nowMs / H) * H;
  const run = stamp(t0Ms);
  const log = opts.log ?? (() => {});
  // calibration: the parameters and whether Gate C released the unit
  const cal = J(resolve(opts.calibration ?? join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'melt-calibration.json')));
  const unit = cal.gate?.unit === true;
  const params = { pf: cal.fit.pf, TF: cal.fit.TF, SRF: cal.fit.SRF };
  installNodeShims();
  const index = J(join(dataDir, 'index.json'));
  const build = index.static.build;
  const catAll = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
  const classes = new Set((opts.classes ?? 'A,B,C').split(','));
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  let cat = catAll.filter((g) => classes.has(g.klass) && (!only || only.has(g.id)));
  if (opts.limit) cat = cat.slice(0, Number(opts.limit));

  // runs offered by the cube; the repeat guard
  const pointIndex = J(join(cubeDir, 'point', 'index.json'));
  const offered = { t1: pointIndex.latestByTier?.t1?.run ?? null, t2: pointIndex.latestByTier?.t2?.run ?? null, t3: pointIndex.latestByTier?.t3?.run ?? null };
  const meltDir = join(dataDir, 'melt');
  const prevRuns = existsSync(meltDir) ? readdirSync(meltDir).filter((f) => /^\d{10}\.json$/.test(f)).sort() : [];
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const runsToday = prevRuns.map((f) => readJson(join(meltDir, f))).filter((d) => d?.runAt?.slice(0, 10) === today).length;
  const verdict = repeatVerdict({ prev: index.melt ?? null, offered, nowMs, runsToday, always: !!opts.always });
  if (!verdict.run) { log(`übersprungen: ${verdict.reason}`); return { skipped: true, reason: verdict.reason, run }; }

  // V-SW-18: without the climatology buscosun Fusion gives no distribution — say so once instead of thousands of empty rows
  const store = dirStore(cubeDir);
  const io0 = (opts.ioFactory ?? makeIo)({ store, cache: geoBackend(null), nowMs });
  await assertClima(io0);

  // hypsometry per region, satellite season rows (newest per glacier), carried state
  const hypCache = new Map();
  const hypOf = (region) => { if (!hypCache.has(region)) hypCache.set(region, readJson(join(dataDir, 'static', build, glacierHypsoFile(region)))?.glaciers ?? {}); return hypCache.get(region); };
  const satRows = new Map();
  for (const [year, regions] of Object.entries(index.sat?.seasons ?? {}).sort()) {
    for (const [region, st] of Object.entries(regions)) {
      const d = readJson(join(dataDir, 'season', year, region, `${st}.json`));
      for (const [id, rows] of Object.entries(d?.glaciers ?? {})) if (rows.length) satRows.set(id, rows[rows.length - 1]);
    }
  }
  const stateIn = readJson(join(dataDir, GLACIER_MELT_STATE_PATH));
  const stateAgeH = stateIn && Number.isFinite(stateIn.atMs) ? (t0Ms - stateIn.atMs) / H : null;
  const carry = stateIn && stateAgeH != null && stateAgeH >= 0 && stateAgeH <= MELT_STATE_MAX_AGE_H ? stateIn.g : null;

  const ab = catAll.filter((g) => g.klass !== 'C');
  const forcings = new Map();
  const skipped = [];
  const engine = { name: fusionName(FUSION_CURRENT), version: null, stageCurrent: false };
  let cubeRuns = { t1: null, t2: null, t3: null, stations: null };
  const forcingOf = async (g) => {
    if (forcings.has(g.id)) return forcings.get(g.id);
    const zMed = g.z[1];
    const io = { ...io0, terrain: false, terrainOverride: flatTerrain(zMed, g.lat, g.lon) };
    clearCubeForecastCache();
    const fc = await (opts.forecast ?? getPointForecastFromCube)({ lat: g.lat, lng: g.lon, country: g.country, hours: GLACIER_MELT_HOURS, pointSource: 'cube', includeRadarNowcast: false }, io);
    if (!fc.cube?.v2?.axis?.steps?.length) throw new Error('kein Cube-Ergebnis');
    const ver = fusionVersionOfNotes(fc.cube.notes);
    engine.version ??= ver; engine.stageCurrent = ver === FUSION_CURRENT;
    const r = fc.cube.v2.provenance?.runs ?? {};
    cubeRuns = { t1: r.t1?.run ?? cubeRuns.t1, t2: r.t2?.run ?? cubeRuns.t2, t3: r.t3?.run ?? cubeRuns.t3, stations: r.stations?.run ?? cubeRuns.stations };
    const f = forcingFromForecast(fc, { lat: g.lat, lon: g.lon, zRef: zMed, t0Ms });
    f.from = 'own';
    forcings.set(g.id, f);
    return f;
  };

  const rows = [], nextState = {};
  let nudged = 0;
  const tStart = Date.now();
  const mk = (g, hyp, f) => {
    const bands = bandsOf(hyp);
    const ela = g.z[1];   // the equilibrium line is not known for most glaciers: the median elevation is the set stand-in (the albedo of bare surfaces only)
    let st = null;
    const c = carry?.[g.id];
    if (c && c[0].length === bands.zb.length) st = { swe: Float64Array.from(c[0]), aS: Float64Array.from(c[1], (v) => v / 1000) };
    st ??= emptyState(bands.zb.length);
    const sr = satRows.get(g.id);
    if (sr && g.area?.km2 != null && glacierSatClass(g)) {
      const ageDays = (t0Ms - Date.parse(`${sr[0]}T12:00:00Z`)) / 86_400_000;
      if (ageDays >= 0 && ageDays <= MELT_SAT_MAX_AGE_DAYS) nudged += nudgeState(st, bands, sr) > 0 ? 1 : 0;
    }
    return { st, ela };
  };
  // A/B first (own Fusion call), then C with the neighbour's forcing
  const order = [...cat.filter((g) => g.klass !== 'C'), ...cat.filter((g) => g.klass === 'C')];
  for (const g of order) {
    try {
      const hyp = hypOf(g.region)[g.id];
      if (!hyp?.a?.some((v) => v > 0)) { skipped.push({ id: g.id, reason: 'no-hypsometry' }); continue; }
      let f;
      if (g.klass !== 'C') f = await forcingOf(g);
      else {
        const near = ab.filter((x) => x.region === g.region).map((x) => ({ x, d: km(g.lat, g.lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.d <= 60) f = { ...(await forcingOf(near.x)), from: near.x.id };
        else f = await forcingOf(g);
      }
      if (f.hoursWithT < MELT_MIN_HOURS_SHARE * GLACIER_MELT_HOURS) { skipped.push({ id: g.id, reason: 'few-hours' }); continue; }
      const { st, ela } = mk(g, hyp, f);
      const out = runGlacier({ g, hyp, forcing: f, params, state: st, ela, run, unit });
      rows.push(out.row);
      nextState[g.id] = [out.next.swe, out.next.aS];
    } catch (e) { skipped.push({ id: g.id, reason: `error: ${String(e?.message ?? e).split('\n')[0]}` }); }
  }
  if (!rows.length) throw new Error(`kein Gletscher mit Ergebnis (${skipped.length} übersprungen, z. B. ${skipped[0]?.reason ?? '—'})`);

  const doc = {
    schema: 1, kind: 'glacier/melt', run, runAt: new Date(nowMs).toISOString(), origin: 'model', engine, cube: cubeRuns,
    params: { ...params, origin: { pf: 'measured', TF: 'measured', SRF: 'measured' }, report: cal.report ?? 'audit/gletscher.md §GL-3' },
    gate: { unit, reason: cal.gate?.reason ?? 'ohne Angabe' },
    scenarios: { k: GLACIER_MELT_SCENARIOS, rho: GLACIER_MELT_RHO, origin: 'set', sums: 'scenarios' },
    ref: { dailyMm: GLACIER_MELT_REF_DAILY_MM, origin: 'set' },
    state: { source: carry ? 'carried' : 'cold', ageH: carry ? stateAgeH : null, nudged },
    build, glaciers: rows, skipped,
  };
  const problems = meltProblems(doc, new Set(catAll.map((g) => g.id)));
  if (problems.length) throw new Error(`Vertrag verletzt: ${problems.slice(0, 5).join('; ')}`);

  // output tree = everything that stays in `v1/melt/`: the new run, the runs of the last 72 h, the state
  mkdirSync(join(outDir, 'melt'), { recursive: true });
  for (const f of prevRuns) {
    const d = readJson(join(meltDir, f));
    if (d && f !== `${run}.json` && nowMs - Date.parse(d.runAt) <= GLACIER_MELT_KEEP_MS) copyFileSync(join(meltDir, f), join(outDir, 'melt', f));
  }
  writeFileSync(join(outDir, glacierMeltRunPath(run)), JSON.stringify(doc));
  writeFileSync(join(outDir, GLACIER_MELT_STATE_PATH), JSON.stringify({ schema: 1, kind: 'glacier/melt-state', atMs: t0Ms + MELT_STATE_ADVANCE_H * H, g: nextState }));
  mkdirSync(patchDir, { recursive: true });
  writeFileSync(join(patchDir, 'index-patch.json'), JSON.stringify({ melt: { run, runAt: doc.runAt, engine: { name: engine.name, version: engine.version }, cube: cubeRuns, unit, build } }));
  writeFileSync(join(patchDir, 'status-patch.json'), JSON.stringify({ lines: { melt: { at: doc.runAt, glaciers: rows.length, skipped: skipped.length, unit, seconds: Math.round((Date.now() - tStart) / 1000) } } }));
  if (opts['archive-out'] || opts.archiveOut) {
    // the lead glaciers' rows of this run for the archive branch (Gate E: model against measurement) — add only, the name carries the run
    const ao = resolve(opts['archive-out'] ?? opts.archiveOut);
    mkdirSync(ao, { recursive: true });
    const leads = new Set(catAll.filter((g) => g.lead).map((g) => g.id));
    writeFileSync(join(ao, `melt-${run}.json`), JSON.stringify({ schema: 1, kind: 'glacier/melt-lead', run, runAt: doc.runAt, engine, cube: cubeRuns, gate: doc.gate, glaciers: rows.filter((r) => leads.has(r.id)) }));
  }
  log(`${rows.length} Gletscher, ${skipped.length} übersprungen, Einheit ${unit ? 'freigegeben' : 'gesperrt (nur Index)'}, ${Math.round((Date.now() - tStart) / 1000)} s`);
  return { run, glaciers: rows.length, skipped: skipped.length, unit, outDir, patchDir, engine, cube: cubeRuns };
}

if (process.argv[1] && /(^|[\\/])melt\.mjs$/.test(process.argv[1])) {
  if (!args.data || !args.cube || !args.out) { console.error('--data=<v1> --cube=<buscosun-data> --out=<Ordner> fehlen'); process.exit(2); }
  main({ data: args.data, cube: args.cube, out: args.out, patch: args.patch, 'archive-out': args['archive-out'], calibration: args.calibration, now: args.now, only: args.only, limit: args.limit, classes: args.classes, always: !!args.always, log: (m) => console.error(m) })
    .then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
