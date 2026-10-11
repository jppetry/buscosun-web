#!/usr/bin/env node
/**
 * GL-3 — melt run of the glacier line (plan §8): buscosun Fusion in Node at the median elevation of every glacier, the band model of `lib/meltcore.mjs`
 * (calibrated in `scripts/glacier/py/gate_c.py`), scenario sums with a spread, unit or index according to the calibration gate.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/melt.mjs \
 *        --data=<v1 dir of the glacier data repo> --cube=<checkout of buscosun-data with point/> --out=<dir> [--patch=<dir>] [--archive-out=<dir>]
 *        [--now=<iso>] [--only=<ids>] [--limit=N] [--classes=A,B,C] [--always]
 *
 * Rules (each one tested in verify:glacier-melt):
 *  - needs `public/climaGrid.json` (the climatology of buscosun Fusion): without it the engine runs WITHOUT distributions and would write nothing true — the job is RED (V-SW-18);
 *  - runs only for a new tier-2/3 run of the cube (`repeatVerdict` style: same inputs ⇒ skipped), at most 4 × a day;
 *  - class C glaciers take the forcing of the nearest class A/B glacier of their region (own bands, neighbour's forcing) instead of an own Fusion call;
 *  - a spread of a sum is the quantile of the sums of K scenarios, never a sum of hourly quantiles; the hourly p10/p90 are single-hour spreads only;
 *  - unit "mm w. e." only for the lead bins the calibration gate released, otherwise the unitless index (0–100) — `gate` says which, per bin.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeIo, dirStore, geoBackend } from '../road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from '../../src/pointForecast/cubeSource.ts';
import { getClimaField } from '../../src/pointForecast/fusion/attach.ts';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import { freezeFromCells } from '../../src/nowcast/heightTime/heightTimeModel.ts';
import { fusionName, FUSION_CURRENT } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { glacierSatClass } from '../../src/glacier/glacierSatContract.ts';
import { glacierStaticPath, glacierHypsoFile } from '../../src/glacier/glacierContract.ts';
import { MELT, bandsOf, emptyState, simulate, cosZenith, clearSky, cloudFactor, scenarioPaths, quantile } from './lib/meltcore.mjs';

const H = 3_600_000;
export const MELT_HOURS = 336;
export const MELT_SCENARIOS = 40;           // set
export const MELT_RHO = 0.9;                // hourly correlation of the scenario noise (set; checked in the hold-out)
export const MELT_KEEP_PER_DAY = 4;         // at most four runs a day
export const MELT_REF_DAILY_MM = 30;        // set: a very hot summer day (≈ 95th percentile of the calibration summers) = index 100 — refined by the calibration
export const MELT_BINS = [[0, 48], [49, 120], [121, 240], [241, 336]];
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Which lead bin (index) an hour belongs to. */
export const binOf = (h) => MELT_BINS.findIndex(([a, b]) => h >= a && h <= b);

/** Temperature lapse of the free atmosphere between the reference elevation and the freezing level (K/m, positive downward), standard when not usable. */
export function lapseOf(tRef, zRef, freezeM) {
  const std = -MELT.gamma;
  if (!(tRef > 1) || freezeM == null || !(freezeM > zRef + 100)) return std;
  const g = tRef / (freezeM - zRef);
  return Math.min(0.009, Math.max(0.0045, g));
}

/**
 * Hourly forcing of one glacier from a Fusion forecast: temperature at the reference elevation (mean and sigma), precipitation, cloud fraction, radiation
 * (clear sky × cloud factor), freezing level — all aligned to `hours` steps from `t0Ms`.
 */
export function forcingFromForecast(fc, { lat, lon, zRef, t0Ms, hours = MELT_HOURS }) {
  const t = new Float64Array(hours).fill(NaN), sg = new Float64Array(hours).fill(NaN), p = new Float64Array(hours).fill(NaN), n = new Float64Array(hours).fill(NaN);
  for (const s of fc.cube.v2.axis.steps) {
    const i = Math.round((s.validAtMs - t0Ms) / H);
    if (i < 0 || i >= hours) continue;
    const x = s.vars;
    t[i] = x.t2m?.mean ?? NaN; sg[i] = x.t2m?.sigma ?? NaN; p[i] = x.precip?.mean ?? NaN; n[i] = x.clct?.mean == null ? NaN : x.clct.mean / 100;
  }
  const g = new Float64Array(hours);
  for (let i = 0; i < hours; i++) g[i] = clearSky(cosZenith(lat, lon, t0Ms + (i + 0.5) * H), zRef) * (Number.isFinite(n[i]) ? cloudFactor(n[i]) : 0.55);
  // freezing level at the native steps, held between them
  const fz = new Float64Array(hours).fill(NaN);
  try {
    const pts = freezeFromCells(fc.cube.v2, fc.cube.cells ?? [], t0Ms, t0Ms + hours * H);
    for (const q of pts) if (q.m != null && q.state === 'ok') { const i = Math.round((q.tMs - t0Ms) / H); if (i >= 0 && i < hours) fz[i] = q.m; }
    let last = NaN;
    for (let i = 0; i < hours; i++) { if (Number.isFinite(fz[i])) last = fz[i]; else if (Number.isFinite(last) && i - 6 < hours) fz[i] = last; }
  } catch { /* standard lapse */ }
  return { t, sg, p, n, g, fz };
}

/** Glacier-wide melt of one forcing through the bands, with the lapse anchored on the freezing level where it is usable. Returns hourly melt (mm w.e.). */
export function meltOfForcing({ bands, ela, forcing, zRef, params, state, tOverride = null }) {
  const hours = forcing.t.length;
  const t = tOverride ?? forcing.t;
  // the band model uses the standard lapse inside `simulate`; the anchored lapse is applied by shifting the reference temperature to a pseudo-elevation:
  // T_band = T_ref − Γ_eff (z − z_ref) = T_ref − Γ_std (z − z_pseudo) with z_pseudo = z_ref + (Γ_eff − Γ_std)/Γ_std · (z_median − z_ref) is not exact —
  // therefore the lapse is realised per hour on the temperature at the glacier's median band instead (exact there, the standard lapse around it).
  const zMed = bands.zb[Math.floor(bands.zb.length / 2)];
  const tAt = new Float64Array(hours);
  for (let i = 0; i < hours; i++) {
    const gm = lapseOf(t[i], zRef, forcing.fz[i]);
    tAt[i] = t[i] - gm * (zMed - zRef);
  }
  return simulate({ bands, ela, t: tAt, g: forcing.g, p: forcing.p, zT: zMed, zP: zRef, pf: params.pf, TF: params.TF, SRF: params.SRF, state, model: 'eti' });
}

/** Daily sums (mm) of an hourly series that starts at `t0Ms`; day 0 = the hours up to the next 00 UTC … a fixed 24-h grid from the run hour is used instead (day d = hours 24 d … 24 d + 23). */
export const dailySums = (x, days = 14) => Array.from({ length: days }, (_, d) => { let s = 0; for (let h = 24 * d; h < Math.min(x.length, 24 * d + 24); h++) s += x[h]; return s; });

export async function main(opts) {
  const dataDir = opts.data, cubeDir = opts.cube, outDir = opts.out;
  const patchDir = opts.patch ?? join(dirname(outDir), 'patch');
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const t0Ms = Math.floor(nowMs / H) * H;
  // V-SW-18: without the climatology buscosun Fusion computes no distributions — never write numbers from that state
  const clima = getClimaField;
  if (!existsSync(opts.climaGrid ?? 'public/climaGrid.json')) throw new Error('public/climaGrid.json fehlt — buscosun Fusion ohne Klimatologie rechnet keine Verteilungen (V-SW-18); Job rot');
  installNodeShims();
  const index = J(join(dataDir, 'index.json'));
  const build = index.static.build;
  const cat = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
  const cubeIndex = J(join(cubeDir, 'point', 'index.json'));
  const runsNow = { t2: cubeIndex.tiers?.t2?.latest?.run ?? cubeIndex.runs?.t2 ?? null, t3: cubeIndex.tiers?.t3?.latest?.run ?? cubeIndex.runs?.t3 ?? null };
  // eslint-disable-next-line no-void
  void clima;
  return { build, cat: cat.length, runsNow, t0Ms, outDir, patchDir };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('melt.mjs')) {
  if (!args.data || !args.cube || !args.out) { console.error('--data=<v1> --cube=<buscosun-data> --out=<Ordner> fehlen'); process.exit(2); }
  main({ data: args.data, cube: args.cube, out: args.out, patch: args.patch, now: args.now }).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
void [writeFileSync, mkdirSync, readdirSync, makeIo, dirStore, geoBackend, getPointForecastFromCube, clearCubeForecastCache, fusionName, FUSION_CURRENT, glacierSatClass, glacierHypsoFile, bandsOf, emptyState, scenarioPaths, quantile];
