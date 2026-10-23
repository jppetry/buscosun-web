/**
 * rucPoint.ts — reads the 5-min precipitation form of ICON-D2-RUC (`ruc/v1/`, phase RUC) at ONE point.
 *
 * `latest.json` is mutable and read raw-first with the CDN as hedge (the same rule as every mutable manifest of the data
 * repo); the chunk path carries the run and is immutable, so it comes from the CDN store as it is. ONE column of ONE chunk
 * is read — the nearest t1 cell, one request (the 2 × 2 block of the cube would need up to four chunks, V-RUC-8).
 *
 * ⚠ PNG decoding is injected (Node: `scripts/lib/png.mjs`, browser: `decodeGrayPngBrowser`) — this file binds to neither.
 * Nothing here decides whether the product is shown: `src/nowcast/rucSeries.ts` (`?ruc=1`) does.
 */
import { cellOf } from '../cubeFormat';
import type { DecodedGrayPng } from '../nowcastSample';
import {
  RUC_CHUNK_WIDTH, RUC_STALE_MS, RUC_STEPS, RUC_STEP_MIN, RUC_TIER,
  decodeRucByte, parseRucManifest, rucChunkOf, rucChunkPath, rucIntervalMs, rucLatestPath, rucPixelOffset, type RucManifest,
} from '../rucFormat';
import { fallbackStore, rawBaseOf, RAW_FALLBACK_HEDGE_MS, type FetchOpts, type PointStore } from './store';

export type RucPngDecoder = (bytes: Uint8Array) => DecodedGrayPng | Promise<DecodedGrayPng>;

export interface RucPoint {
  fromMs: number;
  toMs: number;
  /** mean rate of the interval in mm/h; `null` = no value (byte 0). */
  mmH: number | null;
}

export interface RucPointSeries {
  run: string;
  runAtMs: number;
  builtAtMs: number;
  /** minutes since the run hour at `nowMs`. */
  ageMin: number;
  stepMin: number;
  cell: { iy: number; ix: number };
  chunk: { cy: number; cx: number; column: number };
  points: RucPoint[];
  manifest: RucManifest;
}

export interface LoadRucOptions {
  priority?: FetchOpts['priority'];
  /** an already loaded manifest (saves the pointer read). */
  manifest?: RucManifest | null;
}

/** The store for the mutable pointer: raw first, the CDN as hedge after `RAW_FALLBACK_HEDGE_MS`; the store itself when it has no raw twin. */
export function rucManifestStore(store: PointStore): PointStore {
  const raw = rawBaseOf(store.base);
  if (!raw || !store.withBase) return store;
  return fallbackStore(store.withBase(raw), store, { hedgeMs: RAW_FALLBACK_HEDGE_MS });
}

/** `ruc/v1/latest.json`, strictly parsed; `null` without the product or with another schema. */
export async function loadRucManifest(store: PointStore, opts: LoadRucOptions = {}): Promise<RucManifest | null> {
  try {
    const j = await rucManifestStore(store).json<unknown>(rucLatestPath(), { cache: 'no-cache', priority: opts.priority ?? 'low' });
    return parseRucManifest(j);
  } catch {
    return null;
  }
}

/**
 * The 5-min series at (lat, lon) from the newest run; `null` without product, outside the domain, with a run older than
 * `RUC_STALE_MS`, or when the chunk is not there (a finding, not an error — the caller then shows the hourly bars as before).
 */
export async function loadRucPoint(
  store: PointStore, lat: number, lon: number, nowMs: number, decodeGray: RucPngDecoder, opts: LoadRucOptions = {},
): Promise<RucPointSeries | null> {
  const cell = cellOf(RUC_TIER, lat, lon);
  if (!cell) return null;
  const manifest = opts.manifest === undefined ? await loadRucManifest(store, opts) : opts.manifest;
  if (!manifest) return null;
  if (nowMs - manifest.runAtMs > RUC_STALE_MS) return null;
  const chunk = rucChunkOf(cell.iy, cell.ix);
  try {
    const bytes = await store.bytes(rucChunkPath(manifest.run, chunk.cy, chunk.cx), { priority: opts.priority ?? 'low' });
    if (!bytes) return null;
    const png = await decodeGray(bytes);
    if (png.width !== RUC_CHUNK_WIDTH || png.height !== manifest.steps || png.data.length < png.width * png.height) return null;
    const stride = png.channels || 1;
    const points: RucPoint[] = [];
    for (let k = 0; k < RUC_STEPS && k < manifest.steps; k++) {
      const { fromMs, toMs } = rucIntervalMs(manifest.runAtMs, k);
      points.push({ fromMs, toMs, mmH: decodeRucByte(png.data[rucPixelOffset(chunk.column, k) * stride]) });
    }
    return {
      run: manifest.run, runAtMs: manifest.runAtMs, builtAtMs: manifest.builtAtMs,
      ageMin: Math.round((nowMs - manifest.runAtMs) / 60_000), stepMin: RUC_STEP_MIN,
      cell: { iy: cell.iy, ix: cell.ix }, chunk, points, manifest,
    };
  } catch {
    return null;
  }
}
