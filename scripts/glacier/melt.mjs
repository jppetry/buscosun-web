#!/usr/bin/env node
/**
 * GL-3 — melt run of the glacier line (plan §8): buscosun Fusion in Node at the median elevation of every glacier, the band model of `lib/meltcore.mjs`
 * (calibrated in `gate-c.mjs`), scenario sums with a spread, unit or index according to the calibration gate.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/melt.mjs \
 *        --data=<v1 dir of the glacier data repo> --cube=<checkout of buscosun-data with point/> --out=<dir> [--patch=<dir>] [--archive-out=<dir>]
 *        [--calibration=<json>] [--now=<iso>] [--only=<ids>] [--limit=N] [--classes=A,B,C] [--always] [--weather=0] [--phase=temperature|psnow] [--heights=median|three]
 *        [--precip=gate-c|country] [--snowcal=<json>] [--snowpack=off|shadow] [--snowpack-start=state|cold] [--density=helfricht|board]
 *
 * Rules (each one tested in verify:glacier-melt):
 *  - needs `public/climaGrid.json` (the climatology of buscosun Fusion): without it the engine runs WITHOUT distributions and would write nothing true — the job is RED (V-SW-18);
 *  - runs only for a new tier-2/3 run of the cube (`repeatVerdict` style: same inputs ⇒ skipped), at most 4 × a day;
 *  - class C glaciers take the forcing of the nearest class A/B glacier of their region within 60 km (own bands, neighbour's forcing) instead of an own Fusion call;
 *    one without such a neighbour gets its own Fusion point (23 of 2 203 glaciers) — a glacier is never skipped for lack of a neighbour;
 *  - a spread of a sum is the quantile of the sums of K scenarios, never a sum of hourly quantiles; the hourly p10/p90 are single-hour spreads only;
 *  - the unit "mm w. e." is written ONLY when the calibration says `gate.unit === true` (Gate C passed); otherwise the file carries the unitless index and no
 *    millimetre field at all.
 *
 * Phase GW ("Wetter am Gletscher", `--weather=0` switches it off): the SAME Fusion answers also give the weather at the glacier — `melt/wx/<run>.json` (daily, 14 days)
 * and `melt/wx/<run>/<region>.json` (hourly, 48 h), contract `src/glacier/glacierWeatherContract.ts`, core `lib/weathercore.mjs`. No extra Fusion call; a failure of
 * this part never touches the melt document (the weather is then not written and the status names why).
 *
 * Phase GS (snow fields, audit/gletscher-schneefelder.md): the hourly chunk also carries the snowfall line per hour and new snow per hour at the three
 * elevations, the daily document the spread of the sums and of the gust. The solid share follows the PRODUCER SWITCH `--phase=temperature|psnow` (or the
 * environment variable `GLACIER_WEATHER_PHASE`; default `WEATHER_PHASE_DEFAULT` of the core): `temperature` = the ramp of the melt core as before,
 * `psnow` = the `pSnow` of the answer. Every run computes both and adds one line to `melt/wx/phase.json`; the status line carries the verdict.
 *
 * Phase GM (audit/gletscher-schneemodell.md, GM-2): the PRODUCER SWITCH `--heights=median|three` (or `GLACIER_WEATHER_HEIGHTS`; default
 * `WEATHER_HEIGHTS_DEFAULT` of the core). `median` = one answer per glacier and the lapse to tongue and top, the run exactly as before. `three` = two more
 * answers of buscosun Fusion per glacier with own forcing (flat terrain at the tongue and at the top): the weather rows carry THEIR temperature and phase,
 * and next to the snowfall line of the answer stands an own one, the elevation at which the solid share of the run's rule is one half (`slo`, `rules.levels`).
 * The melt document never reads them.
 *
 * Phase GM (GM-3b, E-GM-7; audit §3d): the PRODUCER SWITCH `--precip=gate-c|country` (or `GLACIER_SNOW_PRECIP`; default `SNOW_PRECIP_DEFAULT` of
 * `lib/snowcal.mjs` — `country` since 23.11.2026, E-GM-12, audit §3e). `gate-c` (the fall back) = the precipitation factor of Gate C and the set 4 % per
 * 100 m, the run exactly as before GM-3b; the calibration table of the snow model is not opened. `country` = the accumulation of every band is `F · P · solid share` with the level `F` of the glacier's region from
 * `snow-calibration.json` (`--snowcal=<json>` names another file) and NO profile with elevation; the document says so in `params.precip` (its `pf` then
 * does not apply), the status line carries `precip: country`. A table that is missing, breaks its rules or does not know a region of the catalogue stops
 * the run with the reason (red job) — never a silent fall back to the other factor. An unknown word stops the run as well.
 *
 * Phase GM (GM-3c; audit §3f): the PRODUCER SWITCH `--snowpack=off|shadow` (or `GLACIER_SNOWPACK`; default `SNOWPACK_DEFAULT` of `lib/snowpackcore.mjs`,
 * `off`). `off` (the fall back) = nothing of the snowpack line is read or written, every file as before. `shadow` = the snow core runs per glacier at
 * tongue, median elevation and top on the temperature and the solid share of the weather row and on the precipitation factor of the run; the run writes
 * `snowpack/<run>.json` (depth in cm, water equivalent in mm, new snow; contract `src/glacier/glacierSnowpackContract.ts`, every value `computed`) and the
 * carried state `snowpack/state.json`. No page reads them. The new-snow density follows the precipitation switch unless `--density=helfricht|board`
 * (`GLACIER_SNOW_DENSITY`) names one (E-GM-15). The step needs a state — the seed of `snowpack-seed.mjs` or the one of the previous run — unless the run
 * says `--snowpack-start=cold`; a state computed with other switches is not continued. A failure of this step (no state, weather part off, a contract
 * violation) writes no snowpack file, leaves the state in the data repo as it is and names the reason in the status line; the melt and the weather
 * documents are not touched by it. An unknown word of one of its switches stops the run before anything is read.
 *
 * Phase GM (GM-3d, V-GM-32; audit §3g): the PRODUCER SWITCH `--melt-state=ahead|run-hour` (or `GLACIER_MELT_STATE`; default `MELT_STATE_DEFAULT` of
 * `lib/meltstate.mjs`, `ahead`). `ahead` (the fall back) = the carried snow state is stored 6 h after the run hour and taken when 0–30 h old, every file
 * as before — a run 3 h after its predecessor starts cold. `run-hour` = `melt/state.json` holds the state AT the run hour and the forcing of the next
 * `GLACIER_MELT_STATE_PEND_H` hours; the next run advances it to its own hour with the melt core, whatever the distance, and the document says so
 * (`state.mode`, `state.replayedH`; `state.ageH` = hours beyond the stored forcing). A file without forcing is judged by the old rule; `ahead` reads a
 * file with forcing as a plain state of that age.
 *
 * Phase GM (GM-5b, E-GM-9, E-GM-31; audit §3j): two more PRODUCER SWITCHES of the MELT run, both off by default, both only next to `--precip=country`.
 *  - `--glacier-factor=off|on` (`GLACIER_SNOW_GLACIER_FACTOR`): `on` = a glacier with an entry in `snow-calibration-glaciers.json` (`--snowcal-glaciers=`
 *    names another file) runs on ITS precipitation factor instead of the one of its region; an entry at a bound of the search range is not used.
 *  - `--glacier-shape=off|on` (`GLACIER_SNOW_GLACIER_SHAPE`): `on` = such a glacier spreads the accumulation over its bands by its persistent shape,
 *    area-weighted mean-free (the mean of the glacier stays with the factor).
 *  Every other glacier keeps the value of its region. The document names the ids (`params.precip.glaciers`), the status line counts them. With both
 *  `off` the table is not opened and every byte stays.
 *
 * Phase GM (GM-10b, E-GM-44; audit gm10-diagnose.md §13): `--glacier-factor=predicted` = `on` PLUS the table of predicted factors for the other Swiss
 * glaciers, named by `--glacier-factor-table=<json>` (`GLACIER_SNOW_GLACIER_FACTOR_TABLE`; contract and reader `lib/snowcalPredict.mjs`). The table is
 * computed, not measured; the document names its hash, rule, counts and rows per basis (`params.precip.glaciers.predicted`). No table, an unreadable one
 * or one that does not fit the run stops the run with the reason. With the factor switch on (`on` or `predicted`):
 *  - V-GM-91: `melt/state.json` names the rule and the factor of every glacier not on its region's value (`fac`); a glacier whose factor changed since
 *    begins anew (counted as `state.respun`), never with snow of two factors. `snowpack-seed.mjs --melt-respin` re-spins such glaciers beforehand.
 *  - V-GM-86: the snowpack runs every glacier on the SAME factor; its state names the rule (`rules.factor`) and is continued only by a run of that rule
 *    (a new seed from 1 October with `snowpack-seed.mjs --glacier-factor=…`); with spreads the head adds the measured pair of every basis (`now.bases`).
 *
 * Phase GM (GM-5a, E-GM-32 … E-GM-35; audit §3i): one more PRODUCER SWITCH, off by default.
 *  - `--snowpack-spread=off|scenarios` (`GLACIER_SNOWPACK_SPREAD`; default `SNOWPACK_SPREAD_DEFAULT` of `lib/snowpackcore.mjs`, `off`; read only with the
 *    snowpack on): `scenarios` adds to every snowpack row on OWN answers the p10 / p90 of `GLACIER_SNOWPACK_SPREAD_RULE.k` scenarios per elevation and day
 *    (`hsq`, `hnq`) and the spread of the sum of the days 8–14 (`hnw`); rows on a neighbour's answers say `sq: 'neighbour'`; the head names the rule,
 *    the counts and ONE pair for the run hour (`now.factor`). No expected value, no other file and not the state change. `off` computes no scenario:
 *    every file is byte for byte what it was.
 *
 * Phase GM (GM-4, E-GM-20/22; audit §3h): two more PRODUCER SWITCHES, both off by default.
 *  - `--snowpack-pairs=off|on` (`GLACIER_SNOWPACK_PAIRS`; default `SNOWPACK_PAIRS_DEFAULT` of `lib/snowpackcore.mjs`, `off`; read only with the snowpack
 *    on): `on` writes `snowpack/pairs/<run>.json` — per glacier with an assigned snow station the snowpack at the station elevation next to the station's
 *    measurement at the run hour (contract `src/glacier/glacierSnowpackPairsContract.ts`). A comparison: no value of the snowpack changes. Inputs are the
 *    station mapping named in `index.stations.map` and the station hour file of the run hour (or the hour before) in the read view; when one is missing or
 *    unusable the pairs file is not written and the status line names the reason; the snowpack is not touched by it.
 *    GM-5c (V-GM-79; audit §3k), no switch of its own: in a run with BOTH `--snowpack-pairs=on` and `--snowpack-spread=scenarios` every pair also carries
 *    the forecast of the snow depth at the station elevation for +24 / +48 / +72 h — the expected value (`fm`) and, on a row with a spread, the p10 / p90
 *    of the scenarios read AT that elevation (`fq`), else the row's reason (`sq`); the head says so (`forecast`). The snowpack document is byte for byte
 *    the one of the run with spreads alone; without the spread switch the pairs file is byte for byte what it was and the mapping is not read earlier.
 *  - `--sat-nudge=every|once` (`GLACIER_SAT_NUDGE`; default `SAT_NUDGE_DEFAULT` of `lib/meltstate.mjs`, `every`): `every` (the fall back) = a season row
 *    nudges the melt state in every run while it is at most 20 days old, every file as before. `once` = a row nudges a carried state once; `melt/state.json`
 *    names per glacier the date of the row it took (`sat`), the document counts applied and held scenes (`state.sat`). The snowpack never takes the nudge.
 *
 * Phase GM (V-GM-81; audit §3l), no switch: the status line of the melt run carries the memory of the run, `lines.melt.mem` = { rssMb: the highest
 * resident set size of the process, heapMb: the highest JavaScript heap in use seen once per glacier (an upper bound of what is held), heapLimitMb: the
 * heap size at which Node stops } (`lib/runmem.mjs`). Three numbers in the status line; no document, no state and no pointer change by it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
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
  glacierMeltRunPath, GLACIER_MELT_STATE_PATH, GLACIER_MELT_STATE_PEND_H, meltIndexOf, meltProblems, meltStateProblems, meltLeadDoc,
} from '../../src/glacier/glacierMeltContract.ts';
import { meltStateModeOf, meltStateVerdict, pendOfForcing, forcingOfPend, stateRowOf, stateOfRow, satNudgeModeOf, satRowDue } from './lib/meltstate.mjs';
import { MELT, bandsOf, emptyState, simulate, cosZenith, clearSky, cloudFactor, scenarioPaths, quantile } from './lib/meltcore.mjs';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_HOURS, GLACIER_WEATHER_RUN_RE, GLACIER_WEATHER_PHASE_PATH, glacierWeatherRunPath, glacierWeatherHourlyPath, weatherProblems,
  weatherHourlyProblems, weatherSnowProblems, weatherHourlySnowProblems, weatherLevelProblems, weatherHourlyLevelProblems, phaseVerdict,
} from '../../src/glacier/glacierWeatherContract.ts';
import { weatherSeriesOf, weatherOfGlacier, weatherHead, weatherPhaseOf, weatherHeightsOf, phaseRunOf, phaseDocWith, WEATHER_PHASE_RULE, WEATHER_SPREAD_RULE, WEATHER_LEVELS_RULE, solidFraction, shareAtElevation, tempAtElevation, precipAmountOf } from './lib/weathercore.mjs';
import { snowPrecipOf, precipRunOf, meltPrecipProblems, snowSwitchesOf, snowCoreSetup } from './lib/snowcal.mjs';
import { glacierFactorModeOf, glacierShapeModeOf, glacierRunOf } from './lib/snowcalGlaciers.mjs';
import { factorTableRunOf, factorRuleOf } from './lib/snowcalPredict.mjs';
import { SNOW, SNOW_ORIGIN, SNOW_SOURCES, newSnowDensitySpan } from './lib/snowcore.mjs';
import { snowpackModeOf, snowpackStartOf, driveOf, bareAlbedo, levelsOfEntry, advanceEntry, normalizeLevel, snowpackOfGlacier, placeLevels, stateRefusal, snowpackPairsModeOf, pairsOf, snowpackSpreadModeOf, spreadOfGlacier, shiftLevels, stationLevelsOf } from './lib/snowpackcore.mjs';
import { GLACIER_SNOWPACK_PAIRS_WINDOW_MIN, GLACIER_SNOWPACK_PAIRS_NOTE, GLACIER_SNOWPACK_PAIRS_FC_HOURS, GLACIER_SNOWPACK_PAIRS_FC_ELEVATION, glacierSnowpackPairsPath, snowpackPairsProblems } from '../../src/glacier/glacierSnowpackPairsContract.ts';
import { glacierStnHourPath, glacierStnMapPath } from '../../src/glacier/glacierStationContract.ts';
import { memWatch } from './lib/runmem.mjs';
import { glacierWeatherColumnPath, openAtmo, httpAtmo, dirAtmo, columnModeOf, columnShadowOf, LAPSE_STD_K_PER_M, FREE_REF_ABOVE_LOWEST_M } from './lib/column.mjs';
import {
  GLACIER_SNOWPACK_DAYS, GLACIER_SNOWPACK_WINDOWS, GLACIER_SNOWPACK_HEIGHTS, GLACIER_SNOWPACK_PEND_H, GLACIER_SNOWPACK_NOTE, GLACIER_SNOWPACK_STATE_PATH, glacierSnowpackRunPath,
  snowpackProblems, snowpackStateProblems, GLACIER_SNOWPACK_SPREAD_RULE, GLACIER_SNOWPACK_NOW_FACTOR,
} from '../../src/glacier/glacierSnowpackContract.ts';

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
/** Run id `yyyymmddhh` → ms UTC. */
const runMs = (run) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));

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
  // `params.pGrad` (phase GM, E-GM-7): the gradient that goes with the factor in use; left out = the set 4 % per 100 m of the core
  // `params.corrOf` (phase GM, GM-5b, E-GM-31): the multiplier per band of a measured glacier's shape, or `null` — then the gradient as always
  const corr = params.corrOf ? params.corrOf(bands) : null;
  return simulate({ bands, ela, t: tAt, g: forcing.g.subarray(0, n), p: forcing.p.subarray(0, n), zT: zMed, zP: forcing.zRef, pf: params.pf, TF: params.TF, SRF: params.SRF, state, model: 'eti', ...(params.pGrad == null ? {} : { pGrad: params.pGrad }), ...(corr ? { corr } : {}) });
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
  // V-GM-81: the memory of the run for the status line (sampled once per glacier below); nothing else reads it. `opts.memWatch` is a seam of the
  // verifier only (like `opts.forecast`), the command line cannot set it
  const mem = (opts.memWatch ?? memWatch)();
  // Phase GW: weather at the glacier from the same answers (`--weather=0` = the run exactly as before)
  const wxOn = !(opts.weather === '0' || opts.weather === 0 || opts.weather === false);
  // Phase GS: the phase rule of this run (producer switch); an unknown word stops the weather part with its reason, the melt run goes on
  let wxPhase = null, wxPhaseError = null;
  if (wxOn) { try { wxPhase = weatherPhaseOf(opts.phase ?? process.env.GLACIER_WEATHER_PHASE); } catch (e) { wxPhaseError = String(e?.message ?? e); } }
  // Phase GM: one answer and the lapse (`median`, as before) or an own answer at tongue and top (`three`); an unknown word stops the weather part like the phase switch
  let wxHeights = null;
  if (wxOn && !wxPhaseError) { try { wxHeights = weatherHeightsOf(opts.heights ?? process.env.GLACIER_WEATHER_HEIGHTS); } catch (e) { wxPhaseError = String(e?.message ?? e); wxPhase = null; } }
  const lvStat = { rows: 0, fallback: 0, clipped: 0, clippedWet: 0, ms: 0 };
  // GLACIER_COLUMN (shadow): the height cube atmo/v1 read once; corrected temperatures and the column wind go into an own section `col` of the
  // hourly chunk. Never fails the run: an unknown word or an unreadable cube leaves the section out and names the reason in the status line.
  let colSt = null;
  if (wxOn) {
    let mode = 'off';
    try { mode = columnModeOf(opts.column ?? process.env.GLACIER_COLUMN); } catch (e) { colSt = { mode: 'shadow', error: String(e?.message ?? e) }; }
    if (mode === 'shadow') {
      try {
        const dir = opts['column-dir'] ?? process.env.GLACIER_COLUMN_DIR;
        const atmo = await openAtmo(opts.atmoSource ?? (dir ? dirAtmo(resolve(dir)) : httpAtmo()));
        colSt = atmo.why ? { mode, error: atmo.why } : { mode, atmo, glaciers: 0, values: 0, hourly: new Map() };
      } catch (e) { colSt = { mode, error: String(e?.message ?? e).split('\n')[0] }; }
    }
  }
  // Phase GM (E-GM-7): which precipitation factor this run accumulates with; an unknown word stops the run before anything is read or written
  const precipRule = snowPrecipOf(opts.precip ?? process.env.GLACIER_SNOW_PRECIP);
  // Phase GM (GM-3d, V-GM-32): where the carried state of the melt run stands — 6 h ahead as always (`ahead`) or at the run hour with its forcing
  // (`run-hour`); an unknown word stops the run here
  const stMode = meltStateModeOf(opts['melt-state'] ?? process.env.GLACIER_MELT_STATE);
  // Phase GM (GM-3c): the snowpack line. `off` reads nothing of it (not even the density switch); an unknown word or `board` next to `gate-c` stops the run here
  const spOn = snowpackModeOf(opts.snowpack ?? process.env.GLACIER_SNOWPACK) === 'shadow';
  const spStart = spOn ? snowpackStartOf(opts['snowpack-start'] ?? process.env.GLACIER_SNOWPACK_START) : null;
  const spDensity = spOn ? snowSwitchesOf({ precip: precipRule, density: opts.density ?? process.env.GLACIER_SNOW_DENSITY }).density : null;
  // GM-4 (E-GM-20): the shadow pairs — read only with the snowpack on; an unknown word stops the run here
  const spPairs = spOn ? snowpackPairsModeOf(opts['snowpack-pairs'] ?? process.env.GLACIER_SNOWPACK_PAIRS) === 'on' : false;
  // GM-5a (E-GM-32): the spread of the snowpack forecast from scenarios — read only with the snowpack on; an unknown word stops the run here
  const spSpread = spOn ? snowpackSpreadModeOf(opts['snowpack-spread'] ?? process.env.GLACIER_SNOWPACK_SPREAD) === 'scenarios' : false;
  // the rule of the spread; `opts.spreadRule` is a seam of the verifier only (like `opts.forecast`), the command line cannot set it — the document names the rule it ran with
  const spSpreadRule = opts.spreadRule ?? GLACIER_SNOWPACK_SPREAD_RULE;
  // GM-4 (E-GM-22): how often a satellite scene nudges the melt state; an unknown word stops the run here
  const satMode = satNudgeModeOf(opts['sat-nudge'] ?? process.env.GLACIER_SAT_NUDGE);
  // GM-5b (E-GM-9, E-GM-31): factor per measured glacier and its shape per band in the MELT run; an unknown word stops the run here
  // GM-10b (E-GM-44): `predicted` = the own factors plus the table of predicted factors for the other Swiss glaciers
  const glFactorMode = glacierFactorModeOf(opts['glacier-factor'] ?? process.env.GLACIER_SNOW_GLACIER_FACTOR);
  const glFactor = glFactorMode !== 'off';
  const glShape = glacierShapeModeOf(opts['glacier-shape'] ?? process.env.GLACIER_SNOW_GLACIER_SHAPE) === 'on';
  // calibration: the parameters and whether Gate C released the unit
  const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const cal = J(resolve(opts.calibration ?? join(here, 'melt-calibration.json')));
  const unit = cal.gate?.unit === true;
  const params = { pf: cal.fit.pf, TF: cal.fit.TF, SRF: cal.fit.SRF };
  installNodeShims();
  const index = J(join(dataDir, 'index.json'));
  const build = index.static.build;
  const catAll = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
  // `country`: the table of the snow model, checked against its rules and the regions of the catalogue (throws with the reason); `gate-c` never opens it
  let precip = null, snowTable = null;
  if (precipRule === 'country') {
    const file = resolve(opts.snowcal ?? join(here, 'snow-calibration.json'));
    let table;
    try { table = J(file); } catch (e) { throw new Error(`Eichtabelle des Schneemodells nicht lesbar (${file}): ${String(e?.message ?? e).split('\n')[0]}`); }
    precip = precipRunOf(table, [...new Set(catAll.map((g) => g.region))]);
    snowTable = table;
  }
  // GM-3c: the constants of the snow core for the density of this run (`board` reads the table checked above; it is refused without `country`)
  const spSetup = spOn ? snowCoreSetup({ density: spDensity, base: SNOW, baseOrigin: SNOW_ORIGIN, table: snowTable }) : null;
  // GM-5b (E-GM-9, E-GM-31): the table per measured glacier — only with one of its two switches; needs the precipitation rule `country` (its factors are
  // factors against the same analyses), checked against its rules and the catalogue (throws with the reason)
  let glTab = null;
  if (glFactor || glShape) {
    if (precipRule !== 'country') throw new Error('Faktor je Gletscher / Form je Band gelten nur mit dem Niederschlagsfaktor „country“');
    const file = resolve(opts['snowcal-glaciers'] ?? join(here, 'snow-calibration-glaciers.json'));
    let table;
    try { table = J(file); } catch (e) { throw new Error(`Gletscher-Eichtabelle nicht lesbar (${file}): ${String(e?.message ?? e).split('\n')[0]}`); }
    glTab = glacierRunOf(table, { factor: glFactor, shape: glShape }, new Set(catAll.map((g) => g.id)));
    glTab.sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  }
  // GM-10b (E-GM-44): the table of predicted factors — only with `predicted`; a missing, unreadable or unfitting table stops the run with the reason
  let predTab = null;
  if (glFactorMode === 'predicted') {
    const named = opts['glacier-factor-table'] ?? process.env.GLACIER_SNOW_GLACIER_FACTOR_TABLE;
    if (!named) throw new Error('Faktor je Gletscher „predicted“ braucht die Tabelle vorhergesagter Faktoren (--glacier-factor-table=<json> oder GLACIER_SNOW_GLACIER_FACTOR_TABLE)');
    const file = resolve(named);
    let raw;
    try { raw = readFileSync(file); } catch (e) { throw new Error(`Tabelle vorhergesagter Faktoren nicht lesbar (${file}): ${String(e?.message ?? e).split('\n')[0]}`); }
    let table;
    try { table = JSON.parse(raw.toString('utf8')); } catch (e) { throw new Error(`Tabelle vorhergesagter Faktoren kein JSON (${file}): ${String(e?.message ?? e).split('\n')[0]}`); }
    const regionOf = new Map(catAll.map((g) => [g.id, g.region]));
    predTab = factorTableRunOf(table, { own: glTab, ownSha: glTab.sha, countryOf: (id) => precip.factorOf(regionOf.get(id)), catalog: new Map(catAll.map((g) => [g.id, g])), tableSha: createHash('sha256').update(raw).digest('hex') });
  }
  // V-GM-91 / V-GM-86: the factor rule of this run — `null` with the factor switch off (every glacier on its region, every byte as before)
  const factorRule = glFactor ? factorRuleOf(glFactorMode, predTab ? predTab.block.table : glTab.sha) : null;
  const glApplied = { factor: [], shape: [], predicted: [], 'predicted-shrunk': [] };
  /** The factor a glacier runs on when it is NOT the value of its region (own or predicted), else `null`. */
  const glacierFactorOf = (g) => (glTab ? glTab.factorOf(g.id) ?? predTab?.factorOf(g.id) ?? null : null);
  const paramsOf = (g) => {
    if (!precip) return params;
    if (!glTab) return { ...params, pf: precip.factorOf(g.region), pGrad: precip.gradient };
    let memo = null;
    return { ...params, pf: glacierFactorOf(g) ?? precip.factorOf(g.region), pGrad: precip.gradient, corrOf: (bands) => (memo ??= { c: glTab.corrOf(g.id, bands.zb, bands.w) }).c };
  };
  /** V-GM-86: what the snowpack document says about the factor of its rows with the factor switch on — the rule and the rows per basis. */
  const snowpackFactorBlock = (spRows) => {
    const by = { own: [], predicted: [], 'predicted-shrunk': [] };
    for (const r of spRows) { if (glTab.factorOf(r.id) != null) by.own.push(r.id); else { const b = predTab?.basisOf(r.id); if (b === 'predicted' || b === 'predicted-shrunk') by[b].push(r.id); } }
    return { rule: glFactorMode, factor: factorRule, own: { table: glTab.sha, method: glTab.block.method }, ...(predTab ? { predicted: predTab.block } : {}), applied: by };
  };
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
  // GM-3d: `ahead` judges the file as always (0–30 h old, else cold); `run-hour` advances a file that carries forcing to this run's hour
  const sv = meltStateVerdict(stateIn, stMode, t0Ms, MELT_STATE_MAX_AGE_H);
  const stateAgeH = sv.ageH;
  const carry = sv.carry ? (stateIn.g ?? null) : null;
  const pendIn = new Map();   // forcing owner → the stored forcing, read once
  const pendOf = (id) => { const owner = stateIn.pend.o?.[id] ?? id; if (!pendIn.has(owner)) pendIn.set(owner, forcingOfPend(stateIn.pend.f?.[owner])); return pendIn.get(owner); };
  const stStat = { replayed: 0, held: 0 };
  // GM-4 (E-GM-22): with `once`, the row date each carried glacier state took last; `satNext` goes into the state file
  const satSeen = satMode === 'once' && carry ? (stateIn.sat ?? {}) : {};
  const satNext = {}, satStat = { applied: 0, held: 0 };
  const pendOut = { h: GLACIER_MELT_STATE_PEND_H, f: {}, o: {} };
  // GM-3c: the snowpack step of this run (`null` with the switch off). `error` = why the step writes nothing; the melt run goes on either way.
  let sp = null;
  if (spOn) {
    sp = { rows: [], skipped: [], next: {}, error: null, state: null, source: null, since: null, ageH: null, replayed: 0, started: 0, ms: 0, spreadMs: 0, rules: { precip: precipRule, density: spDensity, ...(factorRule ? { factor: factorRule } : {}) } };
    if (!wxOn) sp.error = 'braucht den Wetterteil des Laufs (--weather=0)';
    else if (!wxPhase) sp.error = `braucht den Wetterteil des Laufs (${wxPhaseError})`;
    else {
      const file = join(dataDir, GLACIER_SNOWPACK_STATE_PATH);
      let st = null;
      if (existsSync(file)) {
        try { st = J(file); } catch (e) { sp.error = `Zustand nicht lesbar: ${String(e?.message ?? e).split('\n')[0]}`; }
        const pr = st ? snowpackStateProblems(st) : [];
        if (pr.length) sp.error = `Zustand verletzt den Vertrag: ${pr.slice(0, 3).join('; ')}`;
      }
      if (!sp.error) {
        if (!st && spStart === 'cold') { sp.source = 'cold'; sp.since = new Date(t0Ms).toISOString(); }
        else {
          const why = stateRefusal(st, sp.rules, t0Ms);
          if (why) sp.error = why;
          else { sp.state = st; sp.source = st.source === 'seed' ? 'seed' : 'carried'; sp.since = st.since; sp.ageH = Math.round((t0Ms - st.atMs) / H); }
        }
      }
    }
  }
  // GM-5c (V-GM-79): only with pairs AND spreads — the elevation of each glacier's snow station, so that the scenarios can be read AT it. A mapping that
  // cannot be read leaves the snowpack as it is; the pairs step after the loop reads it again and names the reason.
  let spAt = null;
  const spAtQ = new Map();   // glacier id → { zs, q: [p10 per day, p90 per day] } at the station elevation
  if (sp && !sp.error && spPairs && spSpread) { try { spAt = stationLevelsOf(J(join(dataDir, glacierStnMapPath(index?.stations?.map)))); } catch { spAt = null; } }
  const t0H = Math.round(t0Ms / H);
  /** GM-3c: the entry of a glacier that got no row in this run, brought to the run hour with the forcing it carries (then without stored forcing). */
  const spCarry = (g, z) => {
    const e = sp.state?.g?.[g.id];
    if (!e) return false;
    const a = advanceEntry(e, sp.state.atMs, t0Ms, z.map((zz) => ({ TF: params.TF, SRF: params.SRF, aBare: bareAlbedo(zz, g.z[1]) })), spSetup.c);
    sp.next[g.id] = [e[0], e[1] + a.holes, a.levels.map((lv) => normalizeLevel(lv, spSetup.c)), a.levels.map((lv) => Math.round(lv.aS * 1000)), null];
    return true;
  };

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
    // Phase GW: the weather series of the same answer (wind, gusts, direction, p10/p90 of the temperature, snowfall line)
    if (wxOn) { try { f.wx = weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }); } catch { f.wx = null; } }
    forcings.set(g.id, f);
    return f;
  };
  // Phase GM: the answer of buscosun Fusion at ONE more elevation of the glacier (the same call, flat terrain at `zz`); only the weather part reads it.
  const levelOf = async (g, zz) => {
    const io = { ...io0, terrain: false, terrainOverride: flatTerrain(zz, g.lat, g.lon) };
    clearCubeForecastCache();
    const fc = await (opts.forecast ?? getPointForecastFromCube)({ lat: g.lat, lng: g.lon, country: g.country, hours: GLACIER_MELT_HOURS, pointSource: 'cube', includeRadarNowcast: false }, io);
    if (!fc.cube?.v2?.axis?.steps?.length) throw new Error('kein Cube-Ergebnis');
    const f = forcingFromForecast(fc, { lat: g.lat, lon: g.lon, zRef: zz, t0Ms });
    for (let h = 0; h < GLACIER_WEATHER_DAYS * 24; h++) if (!Number.isFinite(f.t[h])) throw new Error('Temperaturlücke');
    return { t: f.t, sg: f.sg, wx: weatherSeriesOf(fc, { t0Ms, hours: GLACIER_MELT_HOURS }) };
  };

  const rows = [], nextState = {};
  // Phase GW: rows of the weather document, hourly rows per region, skips with their reason
  const wxRows = [], wxSkipped = [], wxHourly = new Map(), wxCmp = [];
  let nudged = 0;
  const respun = [];   // V-GM-91: glaciers whose carried state came from another factor
  const tStart = Date.now();
  const mk = (g, hyp, f) => {
    const bands = bandsOf(hyp);
    const ela = g.z[1];   // the equilibrium line is not known for most glaciers: the median elevation is the set stand-in (the albedo of bare surfaces only)
    let st = null;
    let c = carry?.[g.id];
    // V-GM-91: the state names the factor each glacier's snow came from (`fac`; none = its region's value). A glacier whose factor changed since is
    // re-spun — it begins again here, as the whole state once began — never continued with snow of two factors. `fac` is absent unless a run had the
    // factor switch on, so a run with the switch off on a state without it changes nothing.
    if (c) {
      const was = stateIn?.fac?.f?.[g.id] ?? null, now = glacierFactorOf(g);
      if ((was == null) !== (now == null) || (was != null && Math.abs(was - now) > 1e-9)) { c = null; respun.push(g.id); }
    }
    if (c && c[0].length === bands.zb.length) st = { swe: Float64Array.from(c[0]), aS: Float64Array.from(c[1], (v) => v / 1000) };
    if (st && sv.replayH > 0) {
      // GM-3d: the hours between the stored state and this run, with the forcing the file carries (the glacier's own bands and parameters, the owner's forcing)
      const fo = pendOf(g.id);
      if (fo && fo.t.length >= sv.replayH) { st = stateOfRow(stateRowOf(meltOfForcing({ bands, ela, forcing: fo, params: paramsOf(g), state: st, hours: sv.replayH }).state)); stStat.replayed++; }
      else stStat.held++;
    }
    const carriedHere = !!st;
    st ??= emptyState(bands.zb.length);
    const sr = satRows.get(g.id);
    // GM-4 (E-GM-22): the scene this glacier's carried state took last (only `once` keeps a record; a state that was not carried has none)
    const seen = carriedHere ? satSeen[g.id] ?? null : null;
    if (seen != null) satNext[g.id] = seen;
    if (sr && g.area?.km2 != null && glacierSatClass(g)) {
      const ageDays = (t0Ms - Date.parse(`${sr[0]}T12:00:00Z`)) / 86_400_000;
      if (ageDays >= 0 && ageDays <= MELT_SAT_MAX_AGE_DAYS) {
        if (satRowDue(satMode, sr[0], seen)) { nudged += nudgeState(st, bands, sr) > 0 ? 1 : 0; satStat.applied++; satNext[g.id] = sr[0]; }
        else satStat.held++;
      }
    }
    return { st, ela };
  };
  // A/B first (own Fusion call), then C with the neighbour's forcing
  const order = [...cat.filter((g) => g.klass !== 'C'), ...cat.filter((g) => g.klass === 'C')];
  for (const g of order) {
    mem.sample();
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
      const out = runGlacier({ g, hyp, forcing: f, params: paramsOf(g), state: st, ela, run, unit });
      rows.push(out.row);
      // GM-5b: which rows ran on a factor of their own and which on a shape per band (named in the document, counted in the status line)
      if (glTab) { if (glTab.factorOf(g.id) != null) glApplied.factor.push(g.id); if (glTab.shape && glTab.has(g.id)) glApplied.shape.push(g.id); }
      // GM-10b: the rows that ran on a PREDICTED factor, by basis (`country` rows of the table ran on their region and are not listed)
      if (predTab) { const b = predTab.basisOf(g.id); if (b === 'predicted' || b === 'predicted-shrunk') glApplied[b].push(g.id); }
      if (stMode === 'run-hour') {
        // GM-3d: the state this run started from (after the nudge) and the forcing of the next hours, once per forcing owner
        nextState[g.id] = stateRowOf(st);
        const owner = f.from === 'own' ? g.id : f.from;
        if (owner !== g.id) pendOut.o[g.id] = owner;
        pendOut.f[owner] ??= pendOfForcing(f);
      } else nextState[g.id] = [out.next.swe, out.next.aS];
      let wOut = null;   // GM-3c: what the weather row of this glacier was computed from, for the snowpack step below
      if (wxOn && wxPhase) {
        // weather at tongue, median and top from the forcing this glacier just ran on; its own try: the melt row above stays whatever happens here
        try {
          const zb = bandsOf(hyp).zb;
          const z = [zb[0], g.z[1], zb[zb.length - 1]];
          // Phase GM: with `three`, tongue and top get their own answer; a failure there leaves the row as before and marks it (`lv: 'lapse'`)
          const own = (f.from ?? 'own') === 'own';
          let lv = null;
          if (wxHeights === 'three' && own && f.wx) {
            const tL = Date.now();
            try {
              const lo = await levelOf(g, z[0]), hi = await levelOf(g, z[2]);
              lv = { tz: [lo.t, f.t, hi.t], sg: [lo.sg, f.sg, hi.sg], rh: [lo.wx.rh, f.wx.rh, hi.wx.rh], ps: [lo.wx.ps, f.wx.ps, hi.wx.ps] };
            } catch { lv = null; }
            lvStat.ms += Date.now() - tL;
          }
          const tzW = lv ? lv.tz : z.map((zz) => tempAt(f, zz));
          const w = weatherOfGlacier({ id: g.id, z, tz: tzW, from: f.from ?? 'own', p: f.p, n: f.n, wx: f.wx, sg: f.sg, phase: wxPhase, seed: seedOf(run, g.id), levels: lv ? { sg: lv.sg, rh: lv.rh, ps: lv.ps } : null });
          wOut = { w, z, tz: tzW };
          if (w.skip) wxSkipped.push({ id: g.id, reason: w.skip });
          else {
            if (wxHeights === 'three' && own) { if (lv) { lvStat.rows++; lvStat.clipped += w.stat.clipped; lvStat.clippedWet += w.stat.clippedWet; } else { w.row.lv = 'lapse'; lvStat.fallback++; } }
            wxRows.push(w.row); if (!wxHourly.has(g.region)) wxHourly.set(g.region, {}); wxHourly.get(g.region)[g.id] = w.hourly; if (w.cmp) wxCmp.push(w.cmp);
            if (colSt?.atmo) {
              try {
                const cs = columnShadowOf(await colSt.atmo.column(g.lat, g.lon), z, tzW, colSt.atmo.run, t0Ms, GLACIER_WEATHER_HOURS);
                if (cs.ok) colSt.glaciers++;
                colSt.values += cs.values;
                if (!colSt.hourly.has(g.region)) colSt.hourly.set(g.region, {});
                colSt.hourly.get(g.region)[g.id] = cs.e;
              } catch (e) { colSt.fails = (colSt.fails ?? 0) + 1; }
            }
          }
        } catch (e) { wxSkipped.push({ id: g.id, reason: `error: ${String(e?.message ?? e).split('\n')[0]}` }); }
      }
      if (sp && !sp.error) {
        // GM-3c: the snowpack at the three elevations of the weather row; its own try — the rows above stay whatever happens here
        const tS = Date.now();
        try {
          if (!wOut) throw new Error('keine Wetterzeile');
          const { w, z, tz: tzW } = wOut, hoursSp = GLACIER_SNOWPACK_DAYS * 24, own = (f.from ?? 'own') === 'own';
          if (w.skip === 'elevations' || w.skip === 'temperature-gaps') throw new Error(w.skip);
          const ramp = () => tzW.map((t) => Float64Array.from(t.subarray(0, hoursSp), solidFraction));
          let tz3 = tzW, share3, lapse = false;
          if (own) {
            // own answers: temperature and solid share of the weather row (a row the weather part skipped for wind or quantiles takes the temperature ramp)
            if (w.shares) { share3 = w.shares; lapse = !w.ctx; } else { share3 = ramp(); lapse = true; }
            if (w.ctx) f.sp = w.ctx;
          } else if (f.sp) {
            // a neighbour's forcing (E-GM-16): its three answers placed on the own elevations
            ({ tz: tz3, share: share3 } = placeLevels(z, hoursSp, { temp: (zq, h) => tempAtElevation(zq, h, f.sp), share: (zq, h) => shareAtElevation(zq, h, f.sp) }));
          } else { share3 = ramp(); lapse = true; }
          // V-GM-86: the snowpack runs on the SAME factor as the melt run of this glacier (own or predicted with the factor switch on, else its region)
          const factor = precip ? z.map(() => glacierFactorOf(g) ?? precip.factorOf(g.region)) : z.map((zz) => params.pf * (1 + (MELT.pGrad * (zz - f.zRef)) / 100));
          const drive = driveOf({ tz: tz3, share: share3, p: f.p, g: f.g, factor, hours: hoursSp });
          const pars = z.map((zz) => ({ TF: params.TF, SRF: params.SRF, aBare: bareAlbedo(zz, g.z[1]) }));
          const e = sp.state?.g?.[g.id] ?? null;
          let levels, holes = 0, begin = t0H;
          if (e) { const a = advanceEntry(e, sp.state.atMs, t0Ms, pars, spSetup.c); levels = a.levels; holes = e[1] + a.holes; begin = e[0]; sp.replayed = Math.max(sp.replayed, a.replayed); }
          else { levels = levelsOfEntry(null); sp.started++; }
          const o = snowpackOfGlacier({ id: g.id, z, from: f.from ?? 'own', lapse, levels, drive, pars, c: spSetup.c, t0Ms, begin, holes });
          if (begin > Math.floor(Date.parse(sp.since) / H)) o.row.from = new Date(begin * H).toISOString().slice(0, 10);
          if (spSpread) {
            // GM-5a: the spread of the forecast — only on own answers that name a precipitation distribution (E-GM-35); `levels` is the run hour, untouched
            const tQ = Date.now();
            if (!own) o.row.sq = 'neighbour';
            else if (!f.wx?.pDist?.some((d) => d)) o.row.sq = 'no-distribution';
            else {
              const ctx = w.ctx ?? null, fin = Number.isFinite;
              // the temperature of a scenario: the expected one plus the sigma of the answer times the path — per elevation with three answers (the rule
              // functions of the weather core then give the share); without them the sigma of the one answer and `shiftLevels` of the core
              const place = ctx
                ? (zT) => { const cs = { ...ctx, tz: ctx.tz.map((arr, l) => { const o = new Float64Array(hoursSp), s = ctx.sg?.[l]; for (let h = 0; h < hoursSp; h++) o[h] = arr[h] + (s && fin(s[h]) ? s[h] : 0) * zT[h]; return o; }) }; return placeLevels(z, hoursSp, { temp: (zq, h) => tempAtElevation(zq, h, cs), share: (zq, h) => shareAtElevation(zq, h, cs) }); }
                : (zT) => shiftLevels({ tz: tzW, share: share3, sg: f.sg, zT, hours: hoursSp, ramp: solidFraction });
              // GM-5c: with pairs, the same scenarios read at the station elevation (the elevations of the ROW, as the pairs read them); kept next to the rows, never in one
              const zs = spAt?.get(g.id);
              const { at: atq, ...q } = spreadOfGlacier({ levels, pars, c: spSetup.c, t0Ms, seed: (seedOf(run, g.id) ^ 0x9e3779b9) >>> 0, rule: spSpreadRule, p: f.p, g: f.g, factor, amount: precipAmountOf(f.p, f.wx.pDist, hoursSp), place, ...(zs != null ? { at: { z: o.row.z, zs, days: GLACIER_SNOWPACK_PAIRS_FC_HOURS.length } } : {}) });
              Object.assign(o.row, q);
              if (atq) spAtQ.set(g.id, { zs, q: atq });
            }
            sp.spreadMs += Date.now() - tQ;
          }
          sp.rows.push(o.row); sp.next[g.id] = o.entry;
        } catch (e) {
          sp.skipped.push({ id: g.id, reason: `error: ${String(e?.message ?? e).split('\n')[0]}` });
          try { if (wOut) spCarry(g, wOut.z); } catch { /* the entry is dropped; the glacier begins again in a later run and says since when */ }
        }
        sp.ms += Date.now() - tS;
      }
    } catch (e) { skipped.push({ id: g.id, reason: `error: ${String(e?.message ?? e).split('\n')[0]}` }); }
  }
  if (!rows.length) throw new Error(`kein Gletscher mit Ergebnis (${skipped.length} übersprungen, z. B. ${skipped[0]?.reason ?? '—'})`);

  const doc = {
    schema: 1, kind: 'glacier/melt', run, runAt: new Date(nowMs).toISOString(), origin: 'model', engine, cube: cubeRuns,
    params: { ...params, origin: { pf: 'measured', TF: 'measured', SRF: 'measured' }, report: cal.report ?? 'audit/gletscher.md §GL-3', ...(precip ? { precip: glTab ? { ...precip.block, glaciers: { ...glTab.block, applied: { factor: glApplied.factor, shape: glApplied.shape }, ...(predTab ? { predicted: { ...predTab.block, applied: { predicted: glApplied.predicted, 'predicted-shrunk': glApplied['predicted-shrunk'] } } } : {}) } } : precip.block } : {}) },
    gate: { unit, reason: cal.gate?.reason ?? 'ohne Angabe' },
    scenarios: { k: GLACIER_MELT_SCENARIOS, rho: GLACIER_MELT_RHO, origin: 'set', sums: 'scenarios' },
    ref: { dailyMm: GLACIER_MELT_REF_DAILY_MM, origin: 'set' },
    state: { source: carry ? 'carried' : 'cold', ageH: carry ? stateAgeH : null, nudged, ...(stMode === 'run-hour' ? { mode: stMode, replayedH: carry ? sv.replayH : 0, held: stStat.held } : {}), ...(satMode === 'once' ? { sat: { rule: 'once', applied: satStat.applied, held: satStat.held } } : {}), ...(respun.length ? { respun: respun.length } : {}) },
    build, glaciers: rows, skipped,
  };
  const rowIds = new Set(rows.map((r) => r.id));
  const problems = [...meltProblems(doc, new Set(catAll.map((g) => g.id))), ...meltPrecipProblems(doc.params.precip, precip ? [...new Set(catAll.filter((g) => rowIds.has(g.id)).map((g) => g.region))] : null)];
  if (problems.length) throw new Error(`Vertrag verletzt: ${problems.slice(0, 5).join('; ')}`);

  // output tree = everything that stays in `v1/melt/`: the new run, the runs of the last 72 h, the state
  mkdirSync(join(outDir, 'melt'), { recursive: true });
  for (const f of prevRuns) {
    const d = readJson(join(meltDir, f));
    if (d && f !== `${run}.json` && nowMs - Date.parse(d.runAt) <= GLACIER_MELT_KEEP_MS) copyFileSync(join(meltDir, f), join(outDir, 'melt', f));
  }
  writeFileSync(join(outDir, glacierMeltRunPath(run)), JSON.stringify(doc));
  const stateOut = stMode === 'run-hour'
    ? { schema: 1, kind: 'glacier/melt-state', atMs: t0Ms, g: nextState, pend: pendOut }
    : { schema: 1, kind: 'glacier/melt-state', atMs: t0Ms + MELT_STATE_ADVANCE_H * H, g: nextState };
  // GM-4 (E-GM-22): the scene record travels with the states it belongs to (a glacier without a row in this run has no state and no record)
  if (satMode === 'once') {
    stateOut.sat = Object.fromEntries(Object.entries(satNext).filter(([id]) => nextState[id]));
    const pr = meltStateProblems(stateOut);
    if (pr.length) throw new Error(`Zustand verletzt den Vertrag: ${pr.slice(0, 5).join('; ')}`);
  }
  // V-GM-91: with the factor switch on, the state names the factor of every glacier that did not run on its region's value
  if (factorRule) {
    stateOut.fac = { rule: factorRule, f: Object.fromEntries(rows.map((r) => [r.id, glacierFactorOf({ id: r.id })]).filter(([id, F]) => F != null && nextState[id])) };
    const pr = meltStateProblems(stateOut);
    if (pr.length) throw new Error(`Zustand verletzt den Vertrag: ${pr.slice(0, 5).join('; ')}`);
  }
  if (stMode === 'run-hour') { const pr = meltStateProblems(stateOut); if (pr.length) throw new Error(`Zustand verletzt den Vertrag: ${pr.slice(0, 5).join('; ')}`); }
  writeFileSync(join(outDir, GLACIER_MELT_STATE_PATH), JSON.stringify(stateOut));
  // Phase GW: the weather documents of this run (after the melt document, which is complete at this point)
  let weather = null;
  if (wxOn) {
    try {
      if (wxPhaseError) throw new Error(wxPhaseError);
      weather = writeWeather({ outDir, dataDir, run, runAt: doc.runAt, nowMs, version: engine.version, cube: cubeRuns, build, rows: wxRows, skipped: wxSkipped, hourly: wxHourly, catalogIds: new Set(catAll.map((g) => g.id)), phase: wxPhase, cmp: wxCmp, heights: wxHeights, levels: lvStat, ...(colSt?.atmo ? { column: colSt } : {}) });
    } catch (e) { weather = { error: String(e?.message ?? e).split('\n')[0] }; }
    if (weather.error) log(`Wetter am Gletscher nicht geschrieben: ${weather.error}`);
  }
  // GM-3c: the snowpack document and its state (after the melt and the weather documents, which are complete at this point)
  let snowpack = null;
  if (sp) {
    try {
      if (sp.error) throw new Error(sp.error);
      // glaciers of the state that got no row in this run keep their entry (brought to the run hour); one that left the catalogue is dropped
      let carried = 0, dropped = 0;
      const byId = new Map(catAll.map((g) => [g.id, g]));
      for (const id of Object.keys(sp.state?.g ?? {})) {
        if (sp.next[id]) continue;
        const g = byId.get(id);
        let ok = false;
        try { const zb = g ? bandsOf(hypOf(g.region)[g.id]).zb : null; ok = !!zb?.length && spCarry(g, [zb[0], g.z[1], zb[zb.length - 1]]); } catch { ok = false; }
        if (ok) { carried++; sp.skipped.push({ id, reason: 'not-run' }); } else dropped++;
      }
      snowpack = writeSnowpack({
        outDir, run, runAt: doc.runAt, t0Ms, engine, cube: cubeRuns, build, rows: sp.rows, skipped: sp.skipped, next: sp.next, catalogIds: new Set(catAll.map((g) => g.id)),
        phase: wxPhase, rules: sp.rules, setup: spSetup, melt: { TF: params.TF, SRF: params.SRF },
        precipBlock: precip ? (factorRule ? { ...precip.block, glaciers: snowpackFactorBlock(sp.rows) } : precip.block) : { rule: 'gate-c', pf: params.pf, gradient: MELT.pGrad, origin: { pf: 'measured', gradient: 'set' } },
        ...(spSpread && predTab ? { nowBases: predTab.spread } : {}),
        state: { source: sp.source, since: sp.since, ageH: sp.ageH, replayedH: sp.source === 'cold' ? null : sp.replayed, started: sp.started },
        ...(spSpread ? { spread: spSpreadRule } : {}),
      });
      snowpack.carried = carried; snowpack.dropped = dropped; snowpack.seconds = Math.round(sp.ms / 1000);
      if (snowpack.spread) snowpack.spread.seconds = Math.round(sp.spreadMs / 1000);
    } catch (e) { snowpack = { error: String(e?.message ?? e).split('\n')[0] }; }
    if (snowpack.error) log(`Schneedecke nicht geschrieben: ${snowpack.error}`);
  }
  // GM-4 (E-GM-20): the shadow pairs of this run — only with their switch and a written snowpack; a failure writes no pairs file and names the reason
  let pairs = null;
  if (spPairs) {
    try {
      if (snowpack?.error) throw new Error('Schneedecke nicht geschrieben');
      pairs = writeSnowpackPairs({ outDir, dataDir, index, run, runAt: doc.runAt, t0Ms, rows: sp.rows, rules: sp.rules, ...(spSpread ? { forecast: { rule: spSpreadRule, at: spAtQ } } : {}) });
    } catch (e) { pairs = { error: String(e?.message ?? e).split('\n')[0] }; }
    if (pairs.error) log(`Schattenpaare nicht geschrieben: ${pairs.error}`);
  }
  const colLine = colSt && (colSt.error ? { mode: colSt.mode, error: colSt.error } : { mode: colSt.mode, run: colSt.atmo.run, glaciers: colSt.glaciers, values: colSt.values, ...(colSt.bytes != null ? { bytes: colSt.bytes } : {}), ...(colSt.fails ? { fails: colSt.fails } : {}) });
  const spStatus = snowpack && (snowpack.error ? { at: doc.runAt, mode: 'shadow', error: snowpack.error }
    : { at: doc.runAt, mode: 'shadow', glaciers: snowpack.glaciers, skipped: snowpack.skipped, coverage: snowpack.coverage, precip: sp.rules.precip, density: sp.rules.density, state: snowpack.state, carried: snowpack.carried, dropped: snowpack.dropped, bytes: snowpack.bytes, stateBytes: snowpack.stateBytes, seconds: snowpack.seconds });
  if (spStatus && snowpack.spread) spStatus.spread = snowpack.spread;
  if (spStatus && pairs) spStatus.pairs =pairs.error ? { error: pairs.error } : { pairs: pairs.pairs, withValue: pairs.withValue, map: pairs.map, slot: pairs.slot, bytes: pairs.bytes, ...(pairs.spread != null ? { spread: pairs.spread } : {}) };
  mkdirSync(patchDir, { recursive: true });
  writeFileSync(join(patchDir, 'index-patch.json'), JSON.stringify({
    melt: { run, runAt: doc.runAt, engine: { name: engine.name, version: engine.version }, cube: cubeRuns, unit, build },
    ...(weather && !weather.error ? { weather: weather.pointer } : {}),
    ...(snowpack && !snowpack.error ? { snowpack: snowpack.pointer } : {}),
  }));
  writeFileSync(join(patchDir, 'status-patch.json'), JSON.stringify({ lines: {
    melt: { at: doc.runAt, glaciers: rows.length, skipped: skipped.length, unit, seconds: Math.round((Date.now() - tStart) / 1000), ...(precip ? { precip: precipRule } : {}), ...(stMode === 'run-hour' ? { state: stMode } : {}), ...(satMode === 'once' ? { sat: satMode } : {}), ...(glTab ? { glacier: { factor: glApplied.factor.length, shape: glApplied.shape.length, ...(predTab ? { predicted: glApplied.predicted.length, predictedShrunk: glApplied['predicted-shrunk'].length } : {}), ...(respun.length ? { respun: respun.length } : {}) } } : respun.length ? { glacier: { respun: respun.length } } : {}), mem: mem.line() },
    ...(weather ? { weather: weather.error ? { at: doc.runAt, error: weather.error, ...(colLine ? { column: colLine } : {}) } : { at: doc.runAt, glaciers: weather.glaciers, skipped: weather.skipped, files: weather.files, bytes: weather.bytes, phase: weather.phase, ...(weather.levels ? { levels: weather.levels } : {}), ...(colLine ? { column: colLine } : {}) } } : {}),
    ...(spStatus ? { snowpack: spStatus } : {}),
  } }));
  if (opts['archive-out'] || opts.archiveOut) {
    // the lead glaciers' rows of this run for the archive branch (Gate E: model against measurement) — add only, the name carries the run
    const ao = resolve(opts['archive-out'] ?? opts.archiveOut);
    mkdirSync(ao, { recursive: true });
    const leads = new Set(catAll.filter((g) => g.lead).map((g) => g.id));
    writeFileSync(join(ao, `melt-${run}.json`), JSON.stringify(meltLeadDoc(doc, leads)));
  }
  log(`${rows.length} Gletscher, ${skipped.length} übersprungen, Einheit ${unit ? 'freigegeben' : 'gesperrt (nur Index)'}, ${Math.round((Date.now() - tStart) / 1000)} s`);
  return { run, glaciers: rows.length, skipped: skipped.length, unit, outDir, patchDir, engine, cube: cubeRuns, ...(precip ? { precip: precipRule } : {}), ...(weather ? { weather: weather.error ? { error: weather.error } : { glaciers: weather.glaciers, skipped: weather.skipped, files: weather.files, bytes: weather.bytes, phase: weather.phase, ...(weather.levels ? { levels: weather.levels } : {}) } } : {}), ...(spStatus ? { snowpack: spStatus } : {}) };
}

/**
 * Phase GM (GM-3c) — writes `snowpack/<run>.json` and `snowpack/state.json` into the output tree. Throws with a reason when there is nothing true to
 * write (no stand of buscosun Fusion in the answer, no row, a contract violation); the caller keeps the melt run and the state in the data repo stays.
 */
export function writeSnowpack({ outDir, run, runAt, t0Ms, engine, cube, build, rows, skipped, next, catalogIds, phase, rules, setup, melt, precipBlock, state, spread = null, nowBases = null }) {
  if (!Number.isInteger(engine.version)) throw new Error('die Antwort von buscosun Fusion nennt ihren Stand nicht');
  if (!rows.length) throw new Error(`kein Gletscher mit Schneedecke (${skipped.length} übersprungen, z. B. ${skipped[0]?.reason ?? '—'})`);
  const span = newSnowDensitySpan(setup.c), gapped = rows.filter((r) => r.gap != null);
  const coverage = { own: rows.filter((r) => r.f === 'own').length, neighbour: rows.filter((r) => r.f !== 'own').length, lapse: rows.filter((r) => r.lv === 'lapse').length };
  const spreadCount = spread ? { rows: rows.filter((r) => r.hsq).length, none: rows.reduce((m, r) => (r.sq ? ((m[r.sq] = (m[r.sq] ?? 0) + 1), m) : m), {}) } : null;
  const doc = {
    schema: 1, kind: 'glacier/snowpack', run, runAt, origin: 'computed', engine, cube, verified: { measured: false, note: GLACIER_SNOWPACK_NOTE },
    heights: GLACIER_SNOWPACK_HEIGHTS, days: GLACIER_SNOWPACK_DAYS, windows: GLACIER_SNOWPACK_WINDOWS,
    rules: {
      forcing: { rule: 'answers', neighbour: 'placed', phase, order: 'not-more-below' },
      precip: precipBlock,
      density: { source: rules.density, rhoNew: setup.c.rhoNew, p10: r1(span.p10), p90: r1(span.p90), origin: setup.origin.rhoNew },
      melt: { rule: 'eti', TF: melt.TF, SRF: melt.SRF, origin: 'measured', radiation: 'clear-sky-cloud' },
      core: { layerH: setup.c.layerH, newWindowH: setup.c.newWindowH, sources: SNOW_SOURCES.map((s) => s.id) },
      sums: 'expected', spread: spread ?? 'none', newSnow: 'settled',
    },
    state: { ...state, gaps: { glaciers: gapped.length, maxH: gapped.reduce((m, r) => Math.max(m, r.gap), 0) } },
    coverage,
    // GM-5a: only with the spread switch — how many rows carry a spread, how many do not and why, and the one pair for the run hour (E-GM-33)
    // GM-10b: with predicted factors, next to the one pair the measured pair of every basis (one glacier left out; own: one winter left out)
    ...(spread ? { spread: spreadCount, now: { factor: GLACIER_SNOWPACK_NOW_FACTOR, ...(nowBases ? { bases: Object.fromEntries(Object.entries(nowBases).map(([b, x]) => [b, { ...x, origin: 'measured', verified: false }])) } : {}) } } : {}),
    build, glaciers: rows, skipped,
  };
  const problems = snowpackProblems(doc, catalogIds);
  if (problems.length) throw new Error(`Vertrag verletzt: ${problems.slice(0, 5).join('; ')}`);
  const stateDoc = { schema: 1, kind: 'glacier/snowpack-state', atMs: t0Ms, source: 'run', run, since: state.since, rules, pendH: GLACIER_SNOWPACK_PEND_H, g: next };
  const sProblems = snowpackStateProblems(stateDoc);
  if (sProblems.length) throw new Error(`Zustand verletzt den Vertrag: ${sProblems.slice(0, 5).join('; ')}`);
  const a = JSON.stringify(doc), b = JSON.stringify(stateDoc);
  mkdirSync(join(outDir, dirname(GLACIER_SNOWPACK_STATE_PATH)), { recursive: true });
  writeFileSync(join(outDir, glacierSnowpackRunPath(run)), a);
  writeFileSync(join(outDir, GLACIER_SNOWPACK_STATE_PATH), b);
  return {
    pointer: { run, runAt, engine: { name: engine.name, version: engine.version }, build, since: state.since }, glaciers: rows.length, skipped: skipped.length, coverage,
    state: { source: state.source, since: state.since, ageH: state.ageH, replayedH: state.replayedH, started: state.started, gaps: doc.state.gaps }, bytes: Buffer.byteLength(a), stateBytes: Buffer.byteLength(b),
    ...(spread ? { spread: { k: spread.k, ...spreadCount } } : {}),
  };
}

/**
 * Phase GM (GM-4, E-GM-20) — writes `snowpack/pairs/<run>.json`: the snowpack rows of this run at the elevation of each glacier's snow station next to the
 * station's measurement at the run hour. Inputs from the read view: the mapping named in `index.stations.map` and the station hour file of the run hour —
 * or, when the station line has not written that one yet, of the hour before (the age of every value is checked against the run hour either way).
 * Throws with the reason when an input is missing or the document breaks its contract; nothing is written then.
 * GM-5c (V-GM-79): `forecast` = { rule: the spread rule of the run, at: Map(glacier id → { zs, q }) } only in a run with spreads — the pairs then carry the
 * forecast at the station elevation and the head the block `forecast`; the document is checked against the rows it was built from. Without it the bytes
 * are what they were.
 */
export function writeSnowpackPairs({ outDir, dataDir, index, run, runAt, t0Ms, rows, rules, forecast = null }) {
  const mapName = index?.stations?.map;
  if (!mapName) throw new Error('Zeiger ohne Stationszuordnung (index.stations.map)');
  const mapFile = join(dataDir, glacierStnMapPath(mapName));
  if (!existsSync(mapFile)) throw new Error(`Stationszuordnung ${mapName} fehlt in der Lesesicht`);
  const slot = [run, stamp(t0Ms - H)].find((s) => existsSync(join(dataDir, glacierStnHourPath(s))));
  if (!slot) throw new Error(`kein Stationsslot der Laufstunde oder der Stunde davor (${run})`);
  const days = GLACIER_SNOWPACK_PAIRS_FC_HOURS.map((h) => h / 24);
  const { pairs, counts, forecast: fcCount } = pairsOf({ rows, map: J(mapFile), slot: J(join(dataDir, glacierStnHourPath(slot))), t0Ms, windowMin: GLACIER_SNOWPACK_PAIRS_WINDOW_MIN, ...(forecast ? { forecast: { days, at: forecast.at } } : {}) });
  const doc = {
    schema: 1, kind: 'glacier/snowpack-pairs', run, runAt, atMs: t0Ms, origin: 'comparison', origins: { m: 'computed', hn: 'computed', v: 'measured', hsd: 'measured', ...(forecast ? { fm: 'computed', fq: 'computed' } : {}) },
    note: GLACIER_SNOWPACK_PAIRS_NOTE, coupling: 'none', snowpack: { run, precip: rules.precip, density: rules.density },
    stations: { map: mapName, slot, source: 'glacier/v1/stn' }, rule: { elevation: 'linear-between-levels-clamped', windowMin: GLACIER_SNOWPACK_PAIRS_WINDOW_MIN, origin: 'set' },
    counts,
    ...(forecast ? { forecast: { hours: GLACIER_SNOWPACK_PAIRS_FC_HOURS, origin: 'computed', spread: { rule: forecast.rule.rule, k: forecast.rule.k, quantiles: forecast.rule.quantiles, elevation: GLACIER_SNOWPACK_PAIRS_FC_ELEVATION }, ...fcCount } } : {}),
    pairs,
  };
  const problems = snowpackPairsProblems(doc, new Set(rows.map((r) => r.id)), forecast ? new Map(rows.map((r) => [r.id, r])) : undefined);
  if (problems.length) throw new Error(`Schattenpaare verletzen den Vertrag: ${problems.slice(0, 5).join('; ')}`);
  const raw = JSON.stringify(doc);
  mkdirSync(join(outDir, dirname(glacierSnowpackPairsPath(run))), { recursive: true });
  writeFileSync(join(outDir, glacierSnowpackPairsPath(run)), raw);
  return { pairs: counts.pairs, withValue: counts.withValue, map: mapName, slot, bytes: Buffer.byteLength(raw), ...(forecast ? { spread: fcCount.pairs } : {}) };
}

/**
 * Phase GW — writes `melt/wx/<run>.json` and one hourly chunk per region into the output tree, next to the weather runs of the last 72 h. Throws with a reason
 * when there is nothing true to write (no stand of buscosun Fusion in the answer, no row, a contract violation); the caller keeps the melt run.
 */
export function writeWeather({ outDir, dataDir, run, runAt, nowMs, version, cube, build, rows, skipped, hourly, catalogIds, phase = weatherPhaseOf(null), cmp = [], heights = weatherHeightsOf(null), levels = null, column = null }) {
  const three = heights === 'three';
  if (!Number.isInteger(version)) throw new Error('die Antwort von buscosun Fusion nennt ihren Stand nicht');
  if (!rows.length) throw new Error(`kein Gletscher mit Wetter (${skipped.length} übersprungen, z. B. ${skipped[0]?.reason ?? '—'})`);
  const head = weatherHead({ run, runAt, engine: { name: fusionName(version), version, stageCurrent: version === FUSION_CURRENT } });
  const regions = [...hourly.keys()].sort();
  const doc = {
    ...head, kind: 'glacier/weather', cube, days: GLACIER_WEATHER_DAYS, hours: GLACIER_WEATHER_HOURS,
    rules: { phase: { ...WEATHER_PHASE_RULE, rule: phase }, lapse: 'freezing-level', sums: 'expected', day: 'from-run-hour', wind: 'free-height', spread: WEATHER_SPREAD_RULE, ...(three ? { levels: WEATHER_LEVELS_RULE } : {}) },
    regions, build, glaciers: rows, skipped,
  };
  const problems = [...weatherProblems(doc, catalogIds), ...weatherSnowProblems(doc), ...weatherLevelProblems(doc)];
  if (problems.length) throw new Error(`Vertrag verletzt: ${problems.slice(0, 5).join('; ')}`);
  const chunks = regions.map((region) => ({ region, doc: { ...head, kind: 'glacier/weather-hourly', region, hours: GLACIER_WEATHER_HOURS, glaciers: hourly.get(region) } }));
  for (const c of chunks) { const pr = [...weatherHourlyProblems(c.doc, doc), ...weatherHourlySnowProblems(c.doc, doc), ...weatherHourlyLevelProblems(c.doc, doc)]; if (pr.length) throw new Error(`Vertrag verletzt (${c.region}): ${pr.slice(0, 5).join('; ')}`); }
  // output tree = everything that stays in `melt/wx/`: the earlier runs of the last 72 h (document + chunk folder), then this run
  const wxIn = join(dataDir, 'melt', 'wx'), wxOut = join(outDir, 'melt', 'wx');
  mkdirSync(wxOut, { recursive: true });
  for (const f of existsSync(wxIn) ? readdirSync(wxIn) : []) {
    const id = f.replace(/\.json$/, '');
    if (!GLACIER_WEATHER_RUN_RE.test(id) || id === run || nowMs - runMs(id) > GLACIER_MELT_KEEP_MS) continue;
    if (f.endsWith('.json')) copyFileSync(join(wxIn, f), join(wxOut, f));
    else { mkdirSync(join(wxOut, f), { recursive: true }); for (const c of readdirSync(join(wxIn, f))) copyFileSync(join(wxIn, f, c), join(wxOut, f, c)); }
  }
  let bytes = 0;
  const put = (rel, d) => { const s = JSON.stringify(d); mkdirSync(dirname(join(outDir, rel)), { recursive: true }); writeFileSync(join(outDir, rel), s); bytes += Buffer.byteLength(s); };
  put(glacierWeatherRunPath(run), doc);
  for (const c of chunks) put(glacierWeatherHourlyPath(run, c.region), c.doc);
  // GLACIER_COLUMN (shadow): the height-cube section as its own file per region next to the chunk (the site never loads it); not counted in `files`/`bytes`
  let colBytes = 0;
  if (column) for (const c of chunks) {
    const t = JSON.stringify({ ...head, kind: 'glacier/weather-column', region: c.region, hours: GLACIER_WEATHER_HOURS,
      col: { run: column.atmo.run, lapseStd: LAPSE_STD_K_PER_M * 1000, freeAboveM: FREE_REF_ABOVE_LOWEST_M, glaciers: column.hourly.get(c.region) ?? {} } });
    writeFileSync(join(outDir, glacierWeatherColumnPath(run, c.region)), t); colBytes += Buffer.byteLength(t);
  }
  if (column) column.bytes = colBytes;
  // Phase GS: one more line in the comparison of the two phase rules (not a weather document: neither counted in `files` nor in `bytes`)
  const phaseDoc = phaseDocWith(readJson(join(dataDir, GLACIER_WEATHER_PHASE_PATH)), phaseRunOf(run, phase, cmp, heights), nowMs);
  writeFileSync(join(outDir, GLACIER_WEATHER_PHASE_PATH), JSON.stringify(phaseDoc));
  return {
    pointer: { run, runAt, engine: { name: head.engine.name, version }, build, regions }, glaciers: rows.length, skipped: skipped.length, files: 1 + chunks.length, bytes, phase: { rule: phase, ...phaseVerdict(phaseDoc) },
    // Phase GM: rows on three answers, rows that fell back to one, hours the order rule changed a share (all / with precipitation), seconds the extra answers took
    ...(three ? { levels: { rule: 'answers', rows: levels?.rows ?? 0, fallback: levels?.fallback ?? 0, clipped: levels?.clipped ?? 0, clippedWet: levels?.clippedWet ?? 0, seconds: Math.round((levels?.ms ?? 0) / 1000) } } : {}),
  };
}

if (process.argv[1] && /(^|[\\/])melt\.mjs$/.test(process.argv[1])) {
  if (!args.data || !args.cube || !args.out) { console.error('--data=<v1> --cube=<buscosun-data> --out=<Ordner> fehlen'); process.exit(2); }
  main({ data: args.data, cube: args.cube, out: args.out, patch: args.patch, 'archive-out': args['archive-out'], calibration: args.calibration, now: args.now, only: args.only, limit: args.limit, classes: args.classes, always: !!args.always, weather: args.weather, phase: args.phase, heights: args.heights, precip: args.precip, snowcal: args.snowcal, snowpack: args.snowpack, 'snowpack-start': args['snowpack-start'], density: args.density, 'melt-state': args['melt-state'], 'snowpack-pairs': args['snowpack-pairs'], 'snowpack-spread': args['snowpack-spread'], 'sat-nudge': args['sat-nudge'], 'glacier-factor': args['glacier-factor'], 'glacier-factor-table': args['glacier-factor-table'], 'glacier-shape': args['glacier-shape'], column: args.column, 'column-dir': args['column-dir'], 'snowcal-glaciers': args['snowcal-glaciers'], log: (m) => console.error(m) })
    .then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
