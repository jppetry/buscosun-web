#!/usr/bin/env node
/**
 * ruc-build.mjs — producer of `ruc/v1/` (phase RUC, `audit/niederschlag-ruc.md` §4.1): ICON-D2-RUC `TOT_PREC` in 5-min
 * intervals 0–27 h, block means on tier t1 of the point cube, one grayscale PNG per chunk plus manifest.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/ruc/ruc-build.mjs --store=<data-repo>/ruc/v1
 *        [--run=YYYYMMDDHH] [--steps=a-b] [--obs=<obs/v1/stations.json>] [--cache=<dir>] [--now=<ISO>] [--concurrency=8]
 *
 * Order of writes: `<store>/.build/<run>/` (chunks, run.json) → rename to `<store>/<run>/` → station series → `latest.json`
 * LAST → prune (3 runs, station series 21 days). A missing step file aborts with a reason — the producer never writes a
 * run with holes it did not count. Never touches `point/`. Last stdout line: JSON `{ changed, run, chunks, bytes, timing }`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '../lib/png.mjs';
import {
  RUC_DIR, RUC_TIER, RUC_STEPS, RUC_KEEP_RUNS, RUC_STATIONS_KEEP_DAYS, RUC_STATION_STEPS, RUC_CHUNK_WIDTH,
  rucRunStamp, rucRunMs, rucChunkFile, makeRucManifest, rucStationsPath, rucStationsCatalogPath, parseRucStationsFile,
} from '../../src/point/rucFormat.ts';
import { buildBlockMeanIndex, sampleBlockMean } from './lib/blockIndex.mjs';
import { intervalRateMmH, encodeChunkImages, rucStatsOf, stationCellsOf, encodeStationSeries } from './lib/rucEncode.mjs';
import { newestCompleteRun, fetchRucCoords, fetchRucSteps, net } from './lib/dwdRuc.mjs';
import { loadRucCoords } from './lib/rucCoords.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const store = args.store;
if (!store) { console.error('ruc-build: --store=<dir> is required'); process.exit(2); }
const nowMs = args.now ? Date.parse(args.now) : Date.now();
const concurrency = Math.max(1, Number(args.concurrency) || 8);
const log = (...x) => console.error('[ruc-build]', ...x);
const t0 = performance.now();
/** A contract path (`ruc/v1/...`) relative to the store, which IS the `v1` directory. */
const inStore = (contractPath) => join(store, contractPath.slice(RUC_DIR.length + 1));

// ── 1 run ──────────────────────────────────────────────────────────────────
let runMs;
if (args.run) {
  runMs = rucRunMs(args.run);
  if (runMs == null) { console.error(`ruc-build: bad --run ${args.run}`); process.exit(2); }
} else {
  runMs = await newestCompleteRun(nowMs);
  if (runMs == null) { console.log(JSON.stringify({ changed: false, reason: 'no complete run within 4 h' })); process.exit(0); }
}
const run = rucRunStamp(runMs);
const runDir = join(store, run);
if (existsSync(join(runDir, 'run.json')) && !args.force) {
  console.log(JSON.stringify({ changed: false, run, reason: 'already built' }));
  process.exit(0);
}
let from = 0, to = RUC_STEPS - 1;
if (args.steps) {
  const m = String(args.steps).match(/^(\d+)-(\d+)$/);
  if (!m) { console.error('ruc-build: --steps=a-b'); process.exit(2); }
  from = Math.max(0, +m[1]); to = Math.min(RUC_STEPS - 1, +m[2]);
}
log(`run ${run} (${new Date(runMs).toISOString()}), intervals ${from}…${to}`);

// ── 2 cell coordinates (domain subset, cached) → block-mean index ──────────
const coordsOpts = { cacheDir: args.cache ?? null, fetchCoords: fetchRucCoords, runMs, log };
const tc0 = performance.now();
let coords = await loadRucCoords(coordsOpts);
let index = buildBlockMeanIndex(coords.lat, coords.lon, RUC_TIER, coords.idx);
const indexMs = performance.now() - tc0;
log(`cells ${coords.n}, in domain ${coords.idx.length} (${coords.cached ? 'cache' : 'fetched'}), index ${index.hits} hits in ${indexMs.toFixed(0)} ms`);

// ── 3 steps: accumulation k → rate of interval k−1 → block mean on t1 ───────
const stepRates = new Array(RUC_STEPS).fill(null);
let prevAcc = null, prevK = -1, sampleMs = 0, minPos = null, negatives = 0;
const ks = []; for (let k = from; k <= to + 1; k++) ks.push(k);
const fetchTiming = await fetchRucSteps(runMs, ks, async (k, field) => {
  if (!field) throw new Error(`step ${k} of run ${run} missing (404) — run incomplete`);
  if (field.values.length !== coords.n) {
    // review I2: a cached grid that no longer matches must not turn the hourly job permanently red — refetch CLAT/CLON once
    if (!coords.cached) throw new Error(`grid changed: ${field.values.length} cells, fresh CLAT/CLON ${coords.n}`);
    log(`grid changed (${field.values.length} cells, cache ${coords.n}) — cache discarded, coordinates refetched`);
    coords = await loadRucCoords({ ...coordsOpts, force: true });
    index = buildBlockMeanIndex(coords.lat, coords.lon, RUC_TIER, coords.idx);
    if (field.values.length !== coords.n) throw new Error(`grid changed: ${field.values.length} cells, fresh CLAT/CLON ${coords.n}`);
  }
  if (prevAcc && k === prevK + 1) {
    const ts = performance.now();
    const r = intervalRateMmH(prevAcc, field.values);
    stepRates[k - 1] = sampleBlockMean(r.rate, index, RUC_TIER);
    if (r.minPosDeltaMm != null && (minPos == null || r.minPosDeltaMm < minPos)) minPos = r.minPosDeltaMm;
    negatives += r.negatives;
    sampleMs += performance.now() - ts;
  }
  prevAcc = field.values; prevK = k;
}, { concurrency });
log(`fetched ${ks.length} files, ${(fetchTiming.bytes / 1e6).toFixed(1)} MB, fetch ${fetchTiming.fetchMs.toFixed(0)} ms, decode ${fetchTiming.decodeMs.toFixed(0)} ms, sample ${sampleMs.toFixed(0)} ms`);

// ── 4 encode → .build → rename ───────────────────────────────────────────────
const te0 = performance.now();
const buildDir = join(store, '.build', run);
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
const images = encodeChunkImages(stepRates, RUC_TIER);
let bytes = 0;
for (const im of images) {
  const png = encodePng(RUC_CHUNK_WIDTH, RUC_STEPS, im.data, 1);
  writeFileSync(join(buildDir, rucChunkFile(im.cy, im.cx)), png);
  bytes += png.length;
}
const stats = rucStatsOf(stepRates, RUC_TIER, minPos);
const encodeMs = performance.now() - te0;

// station series (optional, for the measurement T9)
let stations = null, stationBytes = 0;
if (args.obs) {
  const cat = JSON.parse(readFileSync(args.obs, 'utf8'));
  const sel = stationCellsOf(cat.stations ?? [], RUC_TIER);
  const series = encodeStationSeries(stepRates, sel.cells, RUC_STATION_STEPS);
  const stDir = join(store, 'stations');
  mkdirSync(stDir, { recursive: true });
  const catFile = inStore(rucStationsCatalogPath(sel.catalog));
  if (!existsSync(catFile)) writeFileSync(catFile, JSON.stringify({ catalog: sel.catalog, count: sel.ids.length, steps: RUC_STATION_STEPS, ids: sel.ids }));
  const png = encodePng(series.width, series.height, series.data, 1);
  writeFileSync(join(buildDir, `stations-${run}.png`), png);
  stationBytes = png.length;
  stations = { count: sel.ids.length, steps: RUC_STATION_STEPS, catalog: sel.catalog };
}

const totalMs = performance.now() - t0;
const manifest = makeRucManifest({
  run, builtAtMs: Date.now(), chunks: images.length, stats, stations,
  timing: { fetchMs: Math.round(fetchTiming.fetchMs), decodeMs: Math.round(fetchTiming.decodeMs), sampleMs: Math.round(sampleMs + indexMs), totalMs: Math.round(totalMs) },
});
const extra = { ...manifest, partial: from === 0 && to === RUC_STEPS - 1 ? null : { from, to }, negatives, bytes };
writeFileSync(join(buildDir, 'run.json'), JSON.stringify(extra));

rmSync(runDir, { recursive: true, force: true });
if (stations) renameSync(join(buildDir, `stations-${run}.png`), inStore(rucStationsPath(run, stations.catalog)));
renameSync(buildDir, runDir);
writeFileSync(join(store, 'latest.json'), JSON.stringify(extra));
rmSync(join(store, '.build'), { recursive: true, force: true });

// ── 5 prune ──────────────────────────────────────────────────────────────────
const removed = [];
const runs = readdirSync(store).filter((d) => /^\d{10}$/.test(d) && rucRunMs(d) != null).sort();
for (const d of runs.slice(0, Math.max(0, runs.length - RUC_KEEP_RUNS))) { rmSync(join(store, d), { recursive: true, force: true }); removed.push(d); }
const stDir = join(store, 'stations');
if (existsSync(stDir)) {
  const keepFrom = runMs - RUC_STATIONS_KEEP_DAYS * 86_400_000;
  for (const f of readdirSync(stDir)) {
    const m = parseRucStationsFile(f);
    if (m && rucRunMs(m.run) < keepFrom) { rmSync(join(stDir, f), { force: true }); removed.push(`stations/${f}`); }
  }
}

console.log(JSON.stringify({
  changed: true, run, chunks: images.length, bytes, stationBytes, stats, negatives, partial: extra.partial, removed,
  timing: { ...manifest.timing, encodeMs: Math.round(encodeMs), indexMs: Math.round(indexMs) }, net: { requests: net.requests, bytes: net.bytes },
}));
