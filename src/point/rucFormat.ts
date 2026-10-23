/**
 * Phase RUC (`audit/niederschlag-ruc.md`): contract of the 5-min precipitation product `ruc/v1/` in the data repo.
 *
 * ICON-D2-RUC (DWD rapid update cycle, hourly runs, `TOT_PREC` every 5 min to +27 h) sampled as block means onto the
 * t1 grid of the point cube. The product carries only the FORM of precipitation inside an hour; the hourly sums that
 * buscosun Fusion 13 verifies stay the truth — `src/nowcast/rucSeries.ts` scales the form to those sums (E-RUC-4).
 *
 * Layout per run (`ruc/v1/<run>/`, run = YYYYMMDDHH UTC):
 *   `<cy>_<cx>.png`   8-bit grayscale, width 256 = the 16 × 16 cells of the t1 chunk (column p = (iy mod 16)·16 + ix mod 16),
 *                     height 324 = 5-min intervals k = (runAt + 5k, runAt + 5(k+1)] min; value = mean rate mm/h of the interval
 *   `run.json`        manifest (immutable); `ruc/v1/latest.json` the same manifest as mutable pointer (raw first)
 *   `ruc/v1/stations/<run>-<catalog>.png`  the same encoding at the measuring stations (0–12 h), only for the measurement (T9);
 *                     `<catalog>` = the id-list hash of `stations/catalog-<catalog>.json` (column j = id j)
 *
 * Byte encoding (`ruc-log-v1`): 0 = no value, 1 = 0 mm/h, 2…255 = `precipLogCode(x)` of the map fields (`fieldFormat.ts`,
 * the same scale: code 1 is the dry code there too; 255 = 100 mm/h, saturation from 98.75 mm/h, counted). Chunk numbers and
 * cell indices are those of tier t1 (`cellOf`, `CHUNK_CELLS`) so reader, producer and verifier share one geometry.
 */
import { CHUNK_CELLS, chunkOf, TIER_BY_ID, type CubeTier } from './cubeFormat';
import { precipLogCode, precipLogValue } from './fieldFormat';

export const RUC_SCHEMA = 1;
export const RUC_DIR = 'ruc/v1';
export const RUC_ENCODING = 'ruc-log-v1';
export const RUC_STEP_MIN = 5;
export const RUC_HORIZON_H = 27;
export const RUC_STEPS = (RUC_HORIZON_H * 60) / RUC_STEP_MIN;
/** Station series cover 0–12 h (the measurement window of T9). */
export const RUC_STATION_STEPS = (12 * 60) / RUC_STEP_MIN;
export const RUC_KEEP_RUNS = 3;
export const RUC_STATIONS_KEEP_DAYS = 21;
/** Older than this the client shows the hourly bars as before. */
export const RUC_STALE_MS = 3 * 3_600_000;
/** Accumulation deltas below this (mm per 5 min) are noise of the float encoding and count as dry (set, E-RUC-4). */
export const RUC_DRY_MM = 0.001;
/** Cap of the scaling factor Fusion/RUC inside an hour; the remainder is spread flat (set, E-RUC-4). */
export const RUC_CAP_FACTOR = 4;
export const RUC_MODEL = 'icon-d2-ruc';
export const RUC_PARAM = 'TOT_PREC';
export const RUC_LABEL = 'ICON-D2-RUC';
export const RUC_SOURCE_BASE = `https://opendata.dwd.de/weather/nwp/v1/m/${RUC_MODEL}`;
export const RUC_TIER: CubeTier = TIER_BY_ID.t1;
export const RUC_CHUNK_WIDTH = CHUNK_CELLS * CHUNK_CELLS;
export const RUC_STEP_MS = RUC_STEP_MIN * 60_000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Run stamp YYYYMMDDHH (UTC) of the run hour that contains `ms`. */
export function rucRunStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`;
}

/** Inverse of `rucRunStamp`; `null` for anything that is not a valid YYYYMMDDHH. */
export function rucRunMs(stamp: string): number | null {
  if (!/^\d{10}$/.test(stamp)) return null;
  const y = +stamp.slice(0, 4), mo = +stamp.slice(4, 6), d = +stamp.slice(6, 8), h = +stamp.slice(8, 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) return null;
  const ms = Date.UTC(y, mo - 1, d, h);
  return rucRunStamp(ms) === stamp ? ms : null;
}

export function rucLatestPath(): string { return `${RUC_DIR}/latest.json`; }
export function rucRunDir(run: string): string { return `${RUC_DIR}/${run}`; }
export function rucRunManifestPath(run: string): string { return `${rucRunDir(run)}/run.json`; }
export function rucChunkFile(cy: number, cx: number): string { return `${pad2(cy)}_${pad2(cx)}.png`; }
export function rucChunkPath(run: string, cy: number, cx: number): string { return `${rucRunDir(run)}/${rucChunkFile(cy, cx)}`; }
export function rucStationsDir(): string { return `${RUC_DIR}/stations`; }
export function rucStationsPath(run: string, catalog: string): string { return `${rucStationsDir()}/${run}-${catalog}.png`; }
export function rucStationsCatalogPath(catalog: string): string { return `${rucStationsDir()}/catalog-${catalog}.json`; }
/** Parses `<run>-<catalog>.png`; `null` for any other name. */
export function parseRucStationsFile(name: string): { run: string; catalog: string } | null {
  const m = /^(\d{10})-([0-9a-f]{8})\.png$/.exec(name);
  return m && rucRunMs(m[1]) != null ? { run: m[1], catalog: m[2] } : null;
}

/** Chunk of a t1 cell and its column inside the chunk PNG. */
export function rucChunkOf(iy: number, ix: number): { cy: number; cx: number; column: number } {
  const { cy, cx } = chunkOf(iy, ix);
  return { cy, cx, column: (iy % CHUNK_CELLS) * CHUNK_CELLS + (ix % CHUNK_CELLS) };
}

/** Inverse of `rucChunkOf`. */
export function rucCellOfColumn(cy: number, cx: number, column: number): { iy: number; ix: number } {
  return { iy: cy * CHUNK_CELLS + Math.floor(column / CHUNK_CELLS), ix: cx * CHUNK_CELLS + (column % CHUNK_CELLS) };
}

/** Byte offset of (column, interval k) in a grayscale chunk image of width `RUC_CHUNK_WIDTH`. */
export function rucPixelOffset(column: number, step: number): number {
  return step * RUC_CHUNK_WIDTH + column;
}

/** 0 = no value, 1 = dry (also traces below the first log step ≈ 0.0014 mm/h), 2…255 = log code of the map fields. */
export function encodeRucByte(mmH: number | null): number {
  if (mmH == null || Number.isNaN(mmH)) return 0;
  if (!(mmH > 0)) return 1;
  return Math.max(1, precipLogCode(mmH));
}

export function decodeRucByte(b: number): number | null {
  if (!(b > 0)) return null;
  return precipLogValue(b);
}

/** Interval k of a run: (runAt + 5k min, runAt + 5(k+1) min]. */
export function rucIntervalMs(runAtMs: number, k: number): { fromMs: number; toMs: number } {
  const fromMs = runAtMs + k * RUC_STEP_MS;
  return { fromMs, toMs: fromMs + RUC_STEP_MS };
}

export interface RucStats {
  /** t1 cells of the domain. */
  cells: number;
  /** cells without a value (byte 0) in at least one interval. */
  missing: number;
  /** cells with at least one wet interval. */
  wet: number;
  maxMmH: number;
  /** smallest positive accumulation delta seen (mm / 5 min), the measured noise floor; null when all dry. */
  minPosDeltaMm: number | null;
  /** cell-intervals at byte 255. */
  saturated: number;
}

export interface RucTiming { fetchMs: number; decodeMs: number; sampleMs: number; totalMs: number }

export interface RucManifest {
  schema: number;
  run: string;
  runAtMs: number;
  builtAtMs: number;
  stepMin: number;
  steps: number;
  horizonH: number;
  grid: { tier: 't1'; ny: number; nx: number; chunk: number };
  encoding: string;
  source: { model: string; param: string; base: string };
  stats: RucStats;
  timing: RucTiming;
  /** number of chunk PNGs written. */
  chunks: number;
  /** station series of the run (T9): count, intervals (144 = 0–12 h), catalogue hash of the id list (`stations/catalog-<hash>.json`). */
  stations?: { count: number; steps: number; catalog: string } | null;
}

export function makeRucManifest(p: {
  run: string; builtAtMs: number; chunks: number; stats: RucStats; timing: RucTiming; stations?: { count: number; steps: number; catalog: string } | null;
}): RucManifest {
  const runAtMs = rucRunMs(p.run);
  if (runAtMs == null) throw new Error(`ruc: invalid run stamp ${p.run}`);
  return {
    schema: RUC_SCHEMA,
    run: p.run,
    runAtMs,
    builtAtMs: p.builtAtMs,
    stepMin: RUC_STEP_MIN,
    steps: RUC_STEPS,
    horizonH: RUC_HORIZON_H,
    grid: { tier: 't1', ny: RUC_TIER.ny, nx: RUC_TIER.nx, chunk: CHUNK_CELLS },
    encoding: RUC_ENCODING,
    source: { model: RUC_MODEL, param: RUC_PARAM, base: RUC_SOURCE_BASE },
    stats: p.stats,
    timing: p.timing,
    chunks: p.chunks,
    stations: p.stations ?? null,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Strict parse: a manifest of another schema, step or grid is `null` — the client then behaves as without the product. */
export function parseRucManifest(j: unknown): RucManifest | null {
  if (!isObj(j)) return null;
  if (j.schema !== RUC_SCHEMA || j.stepMin !== RUC_STEP_MIN || j.steps !== RUC_STEPS || j.horizonH !== RUC_HORIZON_H) return null;
  if (j.encoding !== RUC_ENCODING || typeof j.run !== 'string') return null;
  const runAtMs = rucRunMs(j.run);
  if (runAtMs == null || j.runAtMs !== runAtMs || !isNum(j.builtAtMs) || !isNum(j.chunks)) return null;
  const g = j.grid;
  if (!isObj(g) || g.tier !== 't1' || g.ny !== RUC_TIER.ny || g.nx !== RUC_TIER.nx || g.chunk !== CHUNK_CELLS) return null;
  const s = j.source, st = j.stats, t = j.timing;
  if (!isObj(s) || typeof s.model !== 'string' || typeof s.param !== 'string' || typeof s.base !== 'string') return null;
  if (!isObj(st) || !isNum(st.cells) || !isNum(st.missing) || !isNum(st.wet) || !isNum(st.maxMmH) || !isNum(st.saturated)
    || !(st.minPosDeltaMm === null || isNum(st.minPosDeltaMm))) return null;
  if (!isObj(t) || !isNum(t.fetchMs) || !isNum(t.decodeMs) || !isNum(t.sampleMs) || !isNum(t.totalMs)) return null;
  let stations: RucManifest['stations'] = null;
  if (j.stations != null) {
    if (!isObj(j.stations) || !isNum(j.stations.count) || !isNum(j.stations.steps) || typeof j.stations.catalog !== 'string') return null;
    stations = { count: j.stations.count, steps: j.stations.steps, catalog: j.stations.catalog };
  }
  return {
    schema: RUC_SCHEMA, run: j.run, runAtMs, builtAtMs: j.builtAtMs, stepMin: RUC_STEP_MIN, steps: RUC_STEPS, horizonH: RUC_HORIZON_H,
    grid: { tier: 't1', ny: RUC_TIER.ny, nx: RUC_TIER.nx, chunk: CHUNK_CELLS }, encoding: RUC_ENCODING,
    source: { model: s.model, param: s.param, base: s.base },
    stats: { cells: st.cells, missing: st.missing, wet: st.wet, maxMmH: st.maxMmH, minPosDeltaMm: st.minPosDeltaMm as number | null, saturated: st.saturated },
    timing: { fetchMs: t.fetchMs, decodeMs: t.decodeMs, sampleMs: t.sampleMs, totalMs: t.totalMs },
    chunks: j.chunks, stations,
  };
}
