/**
 * SW-5 — Data client of Seewetter: the expected run and the expected text issues from the clock, one step back on
 * 404, jsDelivr first with raw.githubusercontent as hedge (pattern `fetchRoadJson`, NL-2 / V-FI-5), every file through
 * the contract's client checks before it reaches the page. `status.json` is read for the kill switch and the pointer
 * to the newest wind refresh (raw, short timeout, never blocking — unreachable = not killed, no refresh).
 */
import {
  SEA_CDN_BASE, SEA_RAW_BASE, SEA_MAX_STEP_BACK, SEA_RUN_EVERY_MS, SEA_SPOT_CATALOG_PATH, SEA_SPOT_CATALOG_DK_PATH, mergeSpotCatalogs, SEA_AREAS_PATH, SEA_STATUS_PATH, SEA_SPOT_VARS,
  SEA_MODELS, seaExpectedRun, seaRunStamp, seaRunMs, seaRunJsonPath, seaSpotsPath, seaFieldPath, seaCompPath, seaFreshness, spotSeriesProblems,
  decodeSpotValue, encodeSpotValue, spotCatalogProblems, seaTextPath, seaSpotsWindPath, mergeSpotWind, SEA_WIND_VARS,
  spotQuantileProblems, decodeSpotQuantiles, mergeSpotQuantiles, dropQuantilesWithoutMean, hasQuantiles,
  spotSightProblems, mergeSpotSight, hasSight, sightMetaOf,
  type SeaSpot, type SeaSpotVar, type SeaFreshness, type SeaWindVar, type SeaSpotQuantiles, type SeaSightColumns,
} from './seaContract';
import { DMI_VIS_PARAM, SIGHT_RANGE_M, poiSightLatest, type SightObs } from './seaSightObs';
import type { SeaSightData } from './seaSight';
import { SEA_TEXT_PRODUCTS, seaExpectedIssues, seaTextFreshness, type SeaTextDoc, type SeaTextProduct } from './seaText';
import {
  DMI_OBS_MAX_AGE_MS, DMI_OBS_PARAMS, SEA_DMI_PRODUCT, dmiObsLatest, dmiObsUrl, dmiWindOnAxis, seaDmiProblems, seaDmiStale,
  type SeaDmiDoc, type SeaDmiPointer,
} from './seaDmi';
import { seaCurrentFieldPath, seaCurrentUvPath } from './seaContract';
import {
  SEA_SPOT_CATALOG_LAKES_PATH, lakeObsOf, lakeSeriesProblems, lakeTableProblems, seaLakesDocProblems, seaLakesStale,
  type SeaLake, type SeaLakesDoc, type SeaLakesPointer,
} from './seaLakes';
import { SEA_CURRENT_FIELD, SEA_CURRENT_UV, SEA_CURRENT_WHY, currentLoadOf, currentPrevWanted, decodeUvField, seaCurrentDead, type SeaCurrentLoad, type SeaCurrentPointer, type SeaUvGrid } from './seaCurrent';

/** "Does not exist" (404, or 403 on both ways) — distinct from a hard failure. */
export class SeaNotThere extends Error {}
/** Neither way answered within `SEA_STALL_MS` — the store is not reachable; stepping back to an older file would only wait again. */
export class SeaStall extends Error {}
/** set (Jan 22.11.2026): 1 s instead of 2,5 s, as `RADAR_RAW_HEDGE_MS`. */
export const SEA_RAW_HEDGE_MS = 1_000;
/**
 * No response headers on either way after this long ⇒ the read fails instead of hanging on a stalled connection (`set`, the
 * glacier's `GLACIER_STALL_MS`). Before 10.11. a hanging CDN AND raw left the catalogue and the run „Lädt" for ever; now the
 * page reaches its error text („Der Datenspeicher antwortet nicht" / „ist gerade nicht erreichbar").
 */
export const SEA_STALL_MS = 20_000;

const abortError = (signal: AbortSignal): unknown => signal.reason ?? new DOMException('Aborted', 'AbortError');

/** One file of `sea/v1/`: CDN, after 2.5 s (or on 403/404/5xx/network) raw; a CDN 404 is checked once on raw. */
export function fetchSea(path: string, kind: 'json' | 'bytes', signal?: AbortSignal, bases = { cdn: SEA_CDN_BASE, raw: SEA_RAW_BASE }): Promise<unknown> {
  const cdn = `${bases.cdn}/${path}`, raw = `${bases.raw}/${path}`;
  const acC = new AbortController(), acR = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false, rawStarted = false;
    let cdnErr: unknown = null, rawErr: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stall: ReturnType<typeof setTimeout> | null = null;
    /** a usable response arrived (a 404 on one way does not end the watch over the other) */
    const heard = () => { if (stall) { clearTimeout(stall); stall = null; } };
    const onAbort = () => { acC.abort(); acR.abort(); finish(() => reject(abortError(signal!))); };
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      heard();
      signal?.removeEventListener('abort', onAbort);
      fn();
    }
    const failed = () => {
      if (!cdnErr || (rawStarted && !rawErr)) return;
      if (!rawStarted) { finish(() => reject(cdnErr)); return; }
      const nt = (e: unknown) => e instanceof SeaNotThere;
      finish(() => reject(nt(cdnErr) && nt(rawErr) ? cdnErr : nt(cdnErr) ? rawErr : cdnErr));
    };
    const take = (res: Response, loser: AbortController) => {
      loser.abort();
      (kind === 'json' ? res.json() : res.arrayBuffer().then((b) => new Uint8Array(b))).then((j) => finish(() => resolve(j)), (e) => finish(() => reject(e)));
    };
    const startRaw = () => {
      if (rawStarted || settled) return;
      rawStarted = true;
      fetch(raw, { signal: acR.signal }).then(
        (res) => { if (settled) return; if (res.ok) { heard(); take(res, acC); return; } rawErr = res.status === 404 || res.status === 403 ? new SeaNotThere(`${res.status} ${raw}`) : new Error(`${res.status} ${raw}`); failed(); },
        (e) => { if (!settled) { rawErr = e; failed(); } },
      );
    };
    if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort, { once: true }); }
    timer = setTimeout(() => { timer = null; startRaw(); }, SEA_RAW_HEDGE_MS);
    stall = setTimeout(() => { stall = null; acC.abort(); acR.abort(); finish(() => reject(new SeaStall(`stall ${path}`))); }, SEA_STALL_MS);
    fetch(cdn, { signal: acC.signal }).then(
      (res) => {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (res.ok) { heard(); take(res, acR); return; }
        cdnErr = res.status === 403 || res.status === 404 ? new SeaNotThere(`${res.status} ${cdn}`) : new Error(`${res.status} ${cdn}`);
        startRaw(); failed();
      },
      (e) => { if (settled) return; if (timer) { clearTimeout(timer); timer = null; } cdnErr = e; startRaw(); failed(); },
    );
  });
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

// --- Static ------------------------------------------------------------------------------------------

export interface SeaCatalog { spots: SeaSpot[]; problems: string[]; /** Phase BS: the lake table of `static/spots-lakes.json` (absent without the file). */ lakes?: SeaLake[] }
export async function loadCatalog(signal?: AbortSignal): Promise<SeaCatalog | null> {
  try {
    // Phase BS: the lake spots are a file of their own too; missing, unreadable or with a broken lake table ⇒ no lake spot at all.
    const lkP = (fetchSea(SEA_SPOT_CATALOG_LAKES_PATH, 'json', signal) as Promise<{ product?: string; part?: string; spots?: SeaSpot[]; lakes?: SeaLake[] }>).catch((e) => { if (isAbort(e)) throw e; return null; });
    // Phase DK: the Danish spots are a file of their own; missing or unreadable ⇒ the page is the one before the phase.
    const dkP = (fetchSea(SEA_SPOT_CATALOG_DK_PATH, 'json', signal) as Promise<{ product?: string; spots?: SeaSpot[] }>).catch((e) => { if (isAbort(e)) throw e; return null; });
    const j = await fetchSea(SEA_SPOT_CATALOG_PATH, 'json', signal) as { product?: string; spots?: SeaSpot[] };
    if (j?.product !== 'sea-spots' || !Array.isArray(j.spots)) return null;
    const dk = await dkP;
    const lk = await lkP;
    const lakesOk = lk?.product === 'sea-spots' && lk.part === 'lakes' && Array.isArray(lk.spots) && Array.isArray(lk.lakes) && lakeTableProblems(lk.lakes).length === 0;
    const lakeIds = new Set(lakesOk ? lk!.lakes!.map((l) => l.id) : []);
    const spots = mergeSpotCatalogs(j.spots, dk?.product === 'sea-spots' && Array.isArray(dk.spots) ? dk.spots : null, lakesOk ? lk!.spots!.filter((s) => s.lake && lakeIds.has(s.lake.id)) : null);
    const problems = spotCatalogProblems(spots);
    const bad = new Set(problems.map((p) => p.split(':')[0]));
    return { spots: spots.filter((s) => !bad.has(s.id)), problems, ...(lakesOk ? { lakes: lk!.lakes } : {}) };
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

export interface SeaAreaFeature { type: 'Feature'; properties: { id: string; name: string; kind: 'sea' | 'coast' }; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }
export interface SeaAreas { features: SeaAreaFeature[]; attribution: string }
export async function loadAreas(signal?: AbortSignal): Promise<SeaAreas | null> {
  try {
    const j = await fetchSea(SEA_AREAS_PATH, 'json', signal) as { product?: string; features?: SeaAreaFeature[]; attribution?: string };
    return j?.product === 'sea-areas' && Array.isArray(j.features) ? { features: j.features, attribution: j.attribution ?? '' } : null;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

/** Kill switch from `status.json` (raw, ≤ 4 s); anything but an explicit `true` counts as "not killed". */
export async function loadKillSwitch(signal?: AbortSignal): Promise<{ killed: boolean; status: Record<string, unknown> | null }> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4_000);
    signal?.addEventListener('abort', () => ac.abort(), { once: true });
    const res = await fetch(`${SEA_RAW_BASE}/${SEA_STATUS_PATH}`, { signal: ac.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return { killed: false, status: null };
    const j = await res.json() as Record<string, unknown>;
    return { killed: j?.killSwitch === true, status: j };
  } catch { return { killed: false, status: null }; }
}

// --- Runs ------------------------------------------------------------------------------------------

export interface SeaRunDoc {
  product: 'sea-run'; model: 'cwam'; run: string; runMs: number; maskHash: string;
  steps: { f: number[]; c: number[]; spots: number };
  balance: Record<string, { invalid: number; placeholder: number; ppwwArtefact: number; clipped: number }>;
  dwd: { files: number; completeAt: string | null }; bytes: { f: number; c: number; spots: number };
  wind: { engine: string; version: number | null; computedAt: string; runs: Record<string, string | null>; failed: number } | null;
  builtAt: string; check?: { steps: { step: number; medianAbsM: number | null }[]; observe: string | null } | null;
}
export interface SeaRunLoad { run: SeaRunDoc | null; freshness: SeaFreshness; tried: string[]; reason: 'ok' | 'none' | 'error' | 'invalid' | 'killed' }

/** Newest published run behind the time gate, stepping back ≤ SEA_MAX_STEP_BACK runs on 404. */
export async function loadLatestRun(nowMs: number, killed: boolean, signal?: AbortSignal): Promise<SeaRunLoad> {
  if (killed) return { run: null, freshness: 'dead', tried: [], reason: 'killed' };
  const tried: string[] = [];
  let hard = false;
  for (let i = 0; i <= SEA_MAX_STEP_BACK; i++) {
    const run = seaRunStamp(seaExpectedRun(nowMs) - i * SEA_RUN_EVERY_MS);
    tried.push(run);
    try {
      const j = await fetchSea(seaRunJsonPath('cwam', run), 'json', signal) as SeaRunDoc;
      if (j?.product !== 'sea-run' || j.run !== run || j.runMs !== seaRunMs(run)) return { run: null, freshness: 'dead', tried, reason: 'invalid' };
      return { run: j, freshness: seaFreshness(j.runMs, nowMs), tried, reason: 'ok' };
    } catch (e) {
      if (isAbort(e)) throw e;
      if (!(e instanceof SeaNotThere)) hard = true;
      if (e instanceof SeaStall) break;   // the store does not answer: no step back (it would wait SEA_STALL_MS again per run)
    }
  }
  return { run: null, freshness: 'dead', tried, reason: hard ? 'error' : 'none' };
}

// --- Spot series --------------------------------------------------------------------------------------

export type SeaSeries = Record<SeaSpotVar, (number | null)[]>;
export interface SeaSpotsDoc {
  run: string; runMs: number; steps: number;
  wind: { engine: string | null; version?: number | null; computedAt?: string; runs?: Record<string, string | null>; failed: { id: string; error: string }[] };
  /** Decoded (physical units: m, s, deg, m/s), checked series per spot. */
  series: Record<string, SeaSeries>;
  gustDropped: Record<string, number>;
  rejected: string[];
  /** V-SW-2: hour index from which wind/gust/direction come from a later computation (`wind` then describes that one). */
  windFrom?: number;
  /** Phase DK: spots whose wind columns come from DMI HARMONIE (outside the point cube) — set by `withDmiWind`. */
  windBy?: Record<string, 'dmi'>;
  /** Phase BS: the computation the lake spots' wind comes from (engine, cube run, when) — set by `withLakes`. */
  lakeWind?: SeaLakesDoc['wind'] & { t1: string; from: number; builtAt: string };
  /**
   * Phase SU: q10 … q90 of wind and gust per spot (m/s), only for spots whose file carries them AND whose columns pass the
   * value lock. A spot without an entry (every file before phase SU, a failed lock) is shown without band.
   */
  quantiles?: Record<string, SeaSpotQuantiles>;
  /**
   * Phase SG: the hint columns (showers/thunderstorms, sight) of the spots whose file carries them and whose columns pass
   * the value lock, with the document block that names their source and reach. Absent = a file from before the phase.
   */
  sight?: SeaSightData;
}
/** One spot of a spot file as it is stored (encoded columns). */
export interface SeaSpotRaw { v: Record<SeaSpotVar, (number | null)[]>; q?: SeaSpotQuantiles; s?: SeaSightColumns; gustDropped?: number }

/** Phase SG: the stored hint columns of a spot, or `null` (absent, value lock failed, not one statement). */
export function readSpotSight(s: unknown, hours: number): SeaSightColumns | null {
  if (s == null || spotSightProblems(s, hours).length || !hasSight(s as SeaSightColumns)) return null;
  const c = s as SeaSightColumns;
  return { conv: c.conv.slice(), vis: c.vis.slice() };
}

/** Phase SU: the stored quantile columns of a spot, checked against its own stored wind columns → m/s, or `null`. */
export function readSpotQuantiles(q: unknown, v: Partial<Record<'wind' | 'gust', (number | null)[]>>): SeaSpotQuantiles | null {
  if (q == null) return null;
  if (spotQuantileProblems(q, v).length || !hasQuantiles(q as SeaSpotQuantiles)) return null;
  return decodeSpotQuantiles(q as SeaSpotQuantiles);
}

/** Pure part of `loadSpots`: a stored spot file → the checked, decoded document (or `null` when it is not one of this run). */
export function parseSpotsDoc(j: unknown, run: string): SeaSpotsDoc | null {
  const d = j as { product?: string; run?: string; runMs?: number; steps?: number; wind?: SeaSpotsDoc['wind']; sight?: unknown; spots?: Record<string, SeaSpotRaw> } | null;
  if (d?.product !== 'sea-spots-series' || d.run !== run || !d.spots) return null;
  const series: Record<string, SeaSeries> = {}, gustDropped: Record<string, number> = {}, quantiles: Record<string, SeaSpotQuantiles> = {};
  const rejected: string[] = [];
  const sightMeta = sightMetaOf(d.sight), sightSpots: Record<string, SeaSightColumns> = {};
  for (const [id, s] of Object.entries(d.spots)) {
    if (spotSeriesProblems(s.v).length) { rejected.push(id); continue; }
    const sg = sightMeta ? readSpotSight(s.s, s.v.wind.length) : null;
    if (sg) sightSpots[id] = sg;
    series[id] = Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, s.v[k].map((q) => decodeSpotValue(k, q))])) as SeaSeries;
    if (s.gustDropped) gustDropped[id] = s.gustDropped;
    const q = readSpotQuantiles(s.q, s.v);
    if (q) quantiles[id] = q;
  }
  return { run, runMs: d.runMs ?? seaRunMs(run), steps: d.steps ?? 79, wind: d.wind ?? { engine: null, failed: [] }, series, gustDropped, rejected, ...(Object.keys(quantiles).length ? { quantiles } : {}), ...(sightMeta ? { sight: { spots: sightSpots, meta: sightMeta } } : {}) };
}
export async function loadSpots(run: string, signal?: AbortSignal): Promise<SeaSpotsDoc | null> {
  try {
    return parseSpotsDoc(await fetchSea(seaSpotsPath(run), 'json', signal), run);
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

/** `status.json` → `wind`: the newest wind refresh of a run (V-SW-2). Anything malformed counts as "none". */
export interface SeaWindPointer { run: string; t1: string; path: string }
export function windPointerOf(status: Record<string, unknown> | null | undefined): SeaWindPointer | null {
  const w = status?.wind as Partial<SeaWindPointer> | undefined;
  if (!w || typeof w.run !== 'string' || typeof w.t1 !== 'string' || typeof w.path !== 'string') return null;
  return w.path === seaSpotsWindPath(w.run, w.t1) ? { run: w.run, t1: w.t1, path: w.path } : null;
}

/**
 * V-SW-2: the spot series of `doc` with the wind of the refresh `ptr` (same run only). Without a pointer, on another run,
 * on 404 or on a malformed file: `doc` unchanged. A merged spot that fails the value lock keeps its own wind.
 */
export async function withWindRefresh(doc: SeaSpotsDoc, ptr: SeaWindPointer | null, signal?: AbortSignal): Promise<SeaSpotsDoc> {
  if (!ptr || ptr.run !== doc.run) return doc;
  try {
    const j = await fetchSea(ptr.path, 'json', signal) as { product?: string; run?: string; t1?: string; from?: number; wind?: SeaSpotsDoc['wind']; sight?: unknown; spots?: Record<string, SeaWindRaw> };
    if (j?.product !== 'sea-spots-wind' || j.run !== doc.run || j.t1 !== ptr.t1 || !j.spots || !Number.isInteger(j.from)) return doc;
    return mergeWindDoc(doc, { from: j.from as number, wind: j.wind ?? null, sight: j.sight, spots: j.spots });
  } catch (e) { if (isAbort(e)) throw e; return doc; }
}

/** One spot of a wind refresh as it is stored (encoded wind columns, phase SU: optional quantiles). */
export interface SeaWindRaw { v: Record<SeaWindVar, (number | null)[]>; q?: SeaSpotQuantiles; s?: SeaSightColumns; gustDropped?: number }

/** Pure part of `withWindRefresh` (encoded refresh columns onto a decoded doc). */
export function mergeWindDoc(doc: SeaSpotsDoc, upd: { from: number; wind: SeaSpotsDoc['wind'] | null; sight?: unknown; spots: Record<string, SeaWindRaw> }): SeaSpotsDoc {
  // Phase SG: the hints follow the wind — from `from` on the refresh's own columns; a refresh without the block shows none.
  const sightMeta = sightMetaOf(upd.sight), sightSpots: Record<string, SeaSightColumns> = {};
  const series: Record<string, SeaSeries> = { ...doc.series }, gustDropped = { ...doc.gustDropped };
  const quantiles: Record<string, SeaSpotQuantiles> = { ...(doc.quantiles ?? {}) };
  let applied = 0;
  for (const [id, s] of Object.entries(doc.series)) {
    const u = upd.spots[id]?.v;
    if (!u || SEA_WIND_VARS.some((k) => !Array.isArray(u[k]) || u[k].length !== s[k].length)) continue;
    const decoded = Object.fromEntries(SEA_WIND_VARS.map((k) => [k, u[k].map((q) => decodeSpotValue(k, q))])) as Record<SeaWindVar, (number | null)[]>;
    const merged = { ...s, ...mergeSpotWind(s, decoded, upd.from) };
    const encoded = Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, merged[k].map((x) => encodeSpotValue(k, x))]));
    if (spotSeriesProblems(encoded).length) continue;
    series[id] = merged;
    if (upd.spots[id].gustDropped) gustDropped[id] = upd.spots[id].gustDropped as number; else delete gustDropped[id];
    // Phase SU: the band follows the wind — from `from` on the refresh's own quantiles (none ⇒ no band there), before it the run's.
    const q = mergeSpotQuantiles(doc.quantiles?.[id], readSpotQuantiles(upd.spots[id].q, u), upd.from, s.wind.length);
    dropQuantilesWithoutMean(merged, q);
    if (hasQuantiles(q)) quantiles[id] = q; else delete quantiles[id];
    const sg = sightMeta ? readSpotSight(upd.spots[id].s, s.wind.length) : null;
    if (sg) { const m = mergeSpotSight(doc.sight?.spots[id], sg, upd.from, s.wind.length); if (hasSight(m)) sightSpots[id] = m; }
    applied++;
  }
  if (!applied) return doc;
  const out: SeaSpotsDoc = { ...doc, series, gustDropped, wind: upd.wind ? { ...upd.wind, failed: upd.wind.failed ?? [] } : doc.wind, windFrom: upd.from };
  if (Object.keys(quantiles).length) out.quantiles = quantiles; else delete out.quantiles;
  if (sightMeta) out.sight = { spots: sightSpots, meta: sightMeta }; else delete out.sight;
  return out;
}

// --- Fields ------------------------------------------------------------------------------------------

/**
 * V-AM-18 — one read per file for everybody who asks for it (the map layer, the warm-up of the next hour, the leg of the
 * trip planner). The read runs on a signal of its OWN: a caller's signal ends only that caller's waiting, with an
 * `AbortError`, as before. The read itself ends when the last caller who brought a signal has left and nobody without
 * one holds it — looked at one microtask later, so a caller who leaves and asks again in the same pass (React runs the
 * cleanup of an effect and the next effect back to back: a layer change on the same file) keeps the read that is on its
 * way. Before, the read hung on the signal of whoever asked first and took every other caller down with it.
 * `p` never rejects: a failed or ended read is `null` and is not remembered; an answer is.
 */
interface SeaShared<T> { p: Promise<T | null>; ac: AbortController; waiting: number; held: boolean; done: boolean }
function sharedRead<T>(cache: Map<string, SeaShared<T>>, path: string, read: (own: AbortSignal) => Promise<T | null>, signal?: AbortSignal): Promise<T | null> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  let e = cache.get(path);
  if (!e) {
    const made: SeaShared<T> = { p: Promise.resolve(null), ac: new AbortController(), waiting: 0, held: false, done: false };
    made.p = read(made.ac.signal).then(
      (v) => { made.done = true; return v; },
      () => { made.done = true; if (cache.get(path) === made) cache.delete(path); return null; },
    );
    cache.set(path, made);
    e = made;
  }
  const entry = e;
  if (!signal) { entry.held = true; return entry.p; }
  entry.waiting++;
  return new Promise<T | null>((resolve, reject) => {
    let here = true;
    const leave = () => { if (!here) return false; here = false; entry.waiting--; signal.removeEventListener('abort', onAbort); return true; };
    const onAbort = () => {
      if (!leave()) return;
      reject(abortError(signal));
      queueMicrotask(() => {
        if (entry.waiting || entry.held || entry.done) return;
        if (cache.get(path) === entry) cache.delete(path);
        entry.ac.abort();
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void entry.p.then((v) => { leave(); resolve(v); });
  });
}

export interface SeaFieldImage { width: number; height: number; rgba: Uint8ClampedArray }
const fieldCache = new Map<string, SeaShared<SeaFieldImage>>();
/**
 * `f/<sss>.png` (630 × 387) or `c/<sss>.png` (1260 × 387) → exact RGBA bytes. Canvas path with
 * `colorSpaceConversion/premultiplyAlpha: 'none'` (radar/repack rule — a colour conversion would shift values);
 * water pixels carry alpha 255, so no premultiplication loss.
 */
export function loadField(run: string, kind: 'f' | 'c', step: number, signal?: AbortSignal): Promise<SeaFieldImage | null> {
  const path = kind === 'f' ? seaFieldPath('cwam', run, step) : seaCompPath('cwam', run, step);
  const g = SEA_MODELS.cwam.grid;
  const width = kind === 'f' ? g.ni : 2 * g.ni, height = g.nj;
  const p = sharedRead(fieldCache, path, async (own) => {
    const bytes = await fetchSea(path, 'bytes', own) as Uint8Array;
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    try {
      if (bmp.width !== width || bmp.height !== height) return null;
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
    } finally { bmp.close(); }
  }, signal);
  if (fieldCache.size > 40) fieldCache.delete(fieldCache.keys().next().value as string);
  return p;
}

// --- Texts ---------------------------------------------------------------------------------------------

export interface SeaTextLoad { doc: SeaTextDoc | null; freshness: 'live' | 'stale' | 'none'; tried: string[] }
/** Newest issue of a product behind its gate, stepping back up to 4 issues. */
export async function loadText(product: SeaTextProduct, nowMs: number, killed: boolean, signal?: AbortSignal): Promise<SeaTextLoad> {
  if (killed) return { doc: null, freshness: 'none', tried: [] };
  const tried: string[] = [];
  for (const issue of seaExpectedIssues(product, nowMs, 4)) {
    tried.push(issue);
    try {
      const j = await fetchSea(seaTextPath(product, issue), 'json', signal) as SeaTextDoc;
      if (j?.product !== product || j.issue !== issue || typeof j.raw !== 'string' || typeof j.text !== 'string') continue;
      return { doc: j, freshness: seaTextFreshness(j, nowMs), tried };
    } catch (e) {
      if (isAbort(e)) throw e;
      if (e instanceof SeaStall) break;   // as in loadLatestRun: an older issue would only wait again
    }
  }
  return { doc: null, freshness: 'none', tried };
}
export const SEA_TEXT_TITLES = Object.fromEntries(Object.values(SEA_TEXT_PRODUCTS).map((s) => [s.product, s.title])) as Record<SeaTextProduct, string>;

// --- Measurement at the coast (DWD POI) ------------------------------------------------------------------

export interface SeaPoiObs {
  t: number; ffMs: number | null; ddDeg: number | null; fxMs: number | null;
  /** Where the row came from: the mirror product `obs/v1` (10-min values, gust of the 10-min interval) or the DWD POI file (gust of the last hour). */
  src?: 'obs' | 'poi' | 'dmi';
  /** Set when the `obs/v1` station is another site than the spot's POI station: its name and its distance from the spot. */
  site?: { name: string; km: number };
}

/** `?seaobs=0` ⇒ the old way only (DWD POI file through the proxy). */
function seaObsEnabled(): boolean {
  try { return new URLSearchParams(window.location.search).get('seaobs') !== '0'; } catch { return true; }
}
/** An `obs/v1` station within this distance of the POI station's position counts as its match … */
export const SEA_OBS_MATCH_KM = 3;
/** … and within this one as the same site (beyond it the readout names the `obs/v1` station and its own distance). */
export const SEA_OBS_SAME_SITE_KM = 2;

/**
 * Wind and gust at the spot's station: the mirror product `obs/v1` first (nearest DE station with wind within `SEA_OBS_MATCH_KM`
 * of the POI station's position — the ids differ: WMO number here, DWD station id there), the DWD POI file as the named
 * fallback (no match, no fresh wind value, product not readable, `?seaobs=0`).
 */
export async function loadStationObs(
  station: { id: string; lat: number; lon: number; net?: 'dmi' | 'obs' }, spot: { lat: number; lon: number } | null, signal?: AbortSignal, nowMs = Date.now(),
): Promise<SeaPoiObs | null> {
  // Phase BS: a lake station is named by its obs/v1 id — read there and nowhere else (no POI file, no match by distance).
  if (station.net === 'obs') {
    try {
      const { loadObsLatest } = await import('../sources/obsStore');
      const o = lakeObsOf((await loadObsLatest({ signal })).stations[station.id], nowMs);
      return o ? { t: o.t, ffMs: o.ffMs, ddDeg: o.ddDeg, fxMs: o.fxMs, src: 'obs' } : null;
    } catch (e) { if (isAbort(e)) throw e; return null; }
  }
  // Phase DK: a DMI station is read at DMI (CORS open) — never matched against the German stations of `obs/v1` or the DWD POI files.
  if (station.net === 'dmi') return loadDmiStationObs(station.id, signal, nowMs);
  if (seaObsEnabled()) {
    try {
      const { loadObsStore, obsVarsOf, obsDistanceM, OBS_VAR_MAX_AGE_MS } = await import('../sources/obsStore');
      const store = await loadObsStore({ signal });
      let best: { id: string; name: string; lat: number; lon: number } | null = null, bestM = SEA_OBS_MATCH_KM * 1000;
      for (const st of store.catalog.stations) {
        if (st.country !== 'DE' || !st.vars.includes('ff')) continue;
        const m = obsDistanceM(station.lat, station.lon, st.lat, st.lon);
        if (m <= bestM) { bestM = m; best = st; }
      }
      const r = best ? obsVarsOf(store.latest.stations[best.id], nowMs) : null;
      const ff = r?.vars.ff, fx = r?.vars.fx, dd = r?.vars.dd;
      const lead = ff ?? fx;
      if (best && lead && nowMs - lead.ms <= OBS_VAR_MAX_AGE_MS) {
        const other = bestM > SEA_OBS_SAME_SITE_KM * 1000;
        return {
          t: lead.ms, ffMs: ff?.v ?? null, ddDeg: dd?.v ?? null, fxMs: fx?.v ?? null, src: 'obs',
          ...(other ? { site: { name: best.name, km: spot ? Math.round(obsDistanceM(spot.lat, spot.lon, best.lat, best.lon) / 100) / 10 : Math.round(bestM / 100) / 10 } } : {}),
        };
      }
    } catch (e) { if (isAbort(e)) throw e; }
  }
  const poi = await loadPoi(station.id, signal);
  return poi ? { ...poi, src: 'poi' } : null;
}
/**
 * Newest hourly POI row of a DWD station (`weather_reports/poi/<id>-BEOB.csv`) through the existing opendata proxy
 * (`/_dwd_opendata`, no CORS at the DWD). km/h → m/s; "---" = no value. Measured, not a forecast (provenance `measured`).
 */
export async function loadPoi(id: string, signal?: AbortSignal): Promise<SeaPoiObs | null> {
  try {
    const res = await fetch(`/_dwd_opendata/weather/weather_reports/poi/${encodeURIComponent(id)}-BEOB.csv`, { signal });
    if (!res.ok) return null;
    const rows = (await res.text()).split('\n').map((l) => l.trim()).filter(Boolean);
    const head = rows[0]?.split(';') ?? [], unit = rows[1]?.split(';') ?? [];
    const ci = (n: string) => head.indexOf(n);
    const cff = ci('mean_wind_speed_during last_10_min_at_10_meters_above_ground'), cdd = ci('mean_wind_direction_during_last_10 min_at_10_meters_above_ground'), cfx = ci('maximum_wind_speed_last_hour');
    const num = (c: string[], k: number) => { if (k < 0) return null; const s = c[k]; if (!s || s === '---') return null; const x = Number(s.replace(',', '.')); return Number.isFinite(x) ? x : null; };
    const ms = (c: string[], k: number) => { const x = num(c, k); return x == null ? null : unit[k] === 'km/h' ? x / 3.6 : x; };
    for (const r of rows.slice(3)) {
      const c = r.split(';');
      if (!/^\d\d\.\d\d\.\d\d$/.test(c[0] ?? '') || !/^\d\d:\d\d$/.test(c[1] ?? '')) continue;
      const t = Date.UTC(2000 + +c[0].slice(6, 8), +c[0].slice(3, 5) - 1, +c[0].slice(0, 2), +c[1].slice(0, 2), +c[1].slice(3, 5));
      const o = { t, ffMs: ms(c, cff), ddDeg: num(c, cdd), fxMs: ms(c, cfx) };
      if (o.ffMs != null || o.fxMs != null) return o;
    }
    return null;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

// --- Phase SG: measured visibility of the spot's station (audit/seewetter-sicht-konvektion.md) --------------------

/**
 * Measured visibility at the spot's station, or `null` ("keine Daten" — never an older value): a DWD station from its POI
 * file through the opendata proxy (newest row with a visibility, at most `SIGHT_POI_MAX_AGE_MS` old; two of the 24
 * catalogue stations report none), a DMI station from metObs (10-minute mean, at most `DMI_OBS_MAX_AGE_MS` old; three of
 * the eight report none).
 */
export async function loadStationVisibility(station: { id: string; net?: 'dmi' | 'obs' }, signal?: AbortSignal, nowMs = Date.now()): Promise<SightObs | null> {
  // Phase BS: obs/v1 carries no visibility — a lake station has none ("keine Daten"), no other station in its place.
  if (station.net === 'obs') return null;
  try {
    if (station.net === 'dmi') {
      const res = await fetch(dmiObsUrl(station.id, DMI_VIS_PARAM, nowMs - DMI_OBS_MAX_AGE_MS), { signal });
      const o = res.ok ? dmiObsLatest(await res.json(), DMI_VIS_PARAM, nowMs) : null;
      return o && o.value >= SIGHT_RANGE_M[0] && o.value <= SIGHT_RANGE_M[1] ? { t: o.t, visM: Math.round(o.value), src: 'dmi' } : null;
    }
    const res = await fetch(`/_dwd_opendata/weather/weather_reports/poi/${encodeURIComponent(station.id)}-BEOB.csv`, { signal });
    return res.ok ? poiSightLatest(await res.text(), nowMs) : null;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

// --- Phase DK: DMI (audit/seewetter-daenemark.md) ---------------------------------------------------------------

/**
 * Wind, direction and gust of a DMI metObs station, live from `opendataapi.dmi.dk` (no key, CORS open, CC BY 4.0): three
 * small reads, the newest value of each not older than `DMI_OBS_MAX_AGE_MS`. No wind AND no gust ⇒ `null` ("keine Messung"),
 * never an older value. DMI publishes these as raw values without quality control — the readout says so.
 */
export async function loadDmiStationObs(stationId: string, signal?: AbortSignal, nowMs = Date.now()): Promise<SeaPoiObs | null> {
  const from = nowMs - DMI_OBS_MAX_AGE_MS;
  const one = async (parameterId: string) => {
    try {
      const res = await fetch(dmiObsUrl(stationId, parameterId, from), { signal });
      return res.ok ? dmiObsLatest(await res.json(), parameterId, nowMs) : null;
    } catch (e) { if (isAbort(e)) throw e; return null; }
  };
  const [ff, dd, fx] = await Promise.all([one(DMI_OBS_PARAMS.wind), one(DMI_OBS_PARAMS.dir), one(DMI_OBS_PARAMS.gust)]);
  const lead = ff ?? fx;
  if (!lead) return null;
  // DMI: direction 0 means calm — no direction then.
  return { t: lead.t, ffMs: ff?.value ?? null, ddDeg: dd && dd.value > 0 ? dd.value : null, fxMs: fx?.value ?? null, src: 'dmi' };
}

/** What the page knows about the DMI file: the checked document, or why there is none ("keine Daten", never an old curve). */
export interface SeaDmiLoad { doc: SeaDmiDoc | null; state: 'ok' | 'none' | 'stale' | 'error'; why: string | null }
export const SEA_DMI_NONE: SeaDmiLoad = { doc: null, state: 'none', why: 'Im Datenspeicher liegt noch keine Datei mit den Vorhersagen des DMI.' };
export async function loadDmi(ptr: SeaDmiPointer | null, nowMs: number, signal?: AbortSignal): Promise<SeaDmiLoad> {
  if (!ptr) return SEA_DMI_NONE;
  if (seaDmiStale(ptr.builtAt, nowMs)) return { doc: null, state: 'stale', why: 'Die letzte Datei mit den Vorhersagen des DMI ist älter als 12 Stunden und wird nicht mehr gezeigt.' };
  try {
    const j = await fetchSea(ptr.path, 'json', signal) as SeaDmiDoc;
    if (j?.product !== SEA_DMI_PRODUCT || j.stamp !== ptr.stamp || seaDmiProblems(j).length) return { doc: null, state: 'error', why: 'Die Datei mit den Vorhersagen des DMI ist nicht lesbar (unerwartete Form).' };
    return seaDmiStale(j.builtAt, nowMs) ? { doc: null, state: 'stale', why: 'Die letzte Datei mit den Vorhersagen des DMI ist älter als 12 Stunden und wird nicht mehr gezeigt.' } : { doc: j, state: 'ok', why: null };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { doc: null, state: 'error', why: 'Die Datei mit den Vorhersagen des DMI ist gerade nicht erreichbar.' };
  }
}

/**
 * The spot series with the DMI wind of the spots that lie outside the point cube (`dk.wind === 'dmi'`): their three wind
 * columns come from the DMI file on the run's hour axis, without band; `windBy[id] = 'dmi'` names the source at the spot.
 * A spot the file does not carry keeps its (empty) columns — the page says "keine Daten". Pure.
 */
export function withDmiWind(doc: SeaSpotsDoc, spots: readonly SeaSpot[], dmi: SeaDmiDoc | null): SeaSpotsDoc {
  if (!spots.some((sp) => sp.dk?.wind === 'dmi' && doc.series[sp.id])) return doc;
  const out: SeaSpotsDoc = { ...doc, series: { ...doc.series } };
  const windBy: Record<string, 'dmi'> = {};
  for (const sp of spots) {
    if (sp.dk?.wind !== 'dmi') continue;
    const s = doc.series[sp.id], e = dmi?.wind.spots[sp.id];
    if (!s) continue;
    const empty = () => new Array<number | null>(s.wind.length).fill(null);
    const w = e ? dmiWindOnAxis(e, doc.runMs, s.wind.length) : { wind: empty(), gust: empty(), windDir: empty() };
    out.series[sp.id] = { ...s, ...w };
    windBy[sp.id] = 'dmi';
    if (out.quantiles?.[sp.id]) { out.quantiles = { ...out.quantiles }; delete out.quantiles[sp.id]; }
  }
  if (Object.keys(windBy).length) out.windBy = windBy;
  return out;
}

// --- Phase ST: surface current of the BSH (audit/seewetter-stroemung.md) ----------------------------------------------

/**
 * The current file `status.current` points to — checked, or the reason there is none. A run older than
 * `SEA_CURRENT_DEAD_MS`, an unreadable or unreachable file is "keine Daten": never an older file in its place.
 * ST-N: next to a good file the run before it (`status.current.prev`) is read while the page needs it — for the hours
 * before the newest run begins, nothing else (`currentDocAt`).
 */
export async function loadCurrent(ptr: SeaCurrentPointer | null, nowMs: number, signal?: AbortSignal): Promise<SeaCurrentLoad> {
  if (!ptr || seaCurrentDead(ptr.run, nowMs)) return currentLoadOf(ptr, null, nowMs);
  let doc: unknown;
  try {
    doc = await fetchSea(ptr.path, 'json', signal);
  } catch (e) {
    if (isAbort(e)) throw e;
    return { doc: null, state: 'error', why: SEA_CURRENT_WHY.net };
  }
  const load = currentLoadOf(ptr, doc, nowMs);
  // ST-N: the run before, read only while "now" lies before the newest run (in the evening, after the 12 UTC run of the
  // BSH has appeared). A failed read of it changes nothing: the hours before the newest run then stay "keine Daten".
  const want = currentPrevWanted(ptr, load.doc, nowMs);
  if (!want) return load;
  try {
    return currentLoadOf(ptr, doc, nowMs, await fetchSea(want.path, 'json', signal));
  } catch (e) {
    if (isAbort(e)) throw e;
    return load;
  }
}

const currentFieldCache = new Map<string, SeaShared<Uint8ClampedArray>>();
/** `current/<run>/f/<hhh>.png` (90 × 55) → exact RGBA bytes (same canvas path as `loadField`), or null. */
export function loadCurrentField(run: string, hour: number, signal?: AbortSignal): Promise<Uint8ClampedArray | null> {
  const path = seaCurrentFieldPath(run, hour);
  const { nx: width, ny: height } = SEA_CURRENT_FIELD;
  const p = sharedRead(currentFieldCache, path, async (own) => {
    const bytes = await fetchSea(path, 'bytes', own) as Uint8Array;
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    try {
      if (bmp.width !== width || bmp.height !== height) return null;
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    } finally { bmp.close(); }
  }, signal);
  if (currentFieldCache.size > 80) currentFieldCache.delete(currentFieldCache.keys().next().value as string);
  return p;
}

// --- Early start (load time 10.11.) ---------------------------------------------------------------------------------

/** The official texts the page shows (Seewetterbericht, Vorhersage, Warnlage, Mittelfrist). */
export const SEA_PAGE_TEXTS: readonly SeaTextProduct[] = ['FQDL50', 'FQDL51', 'WODL45', 'FXDL40'];
/**
 * The page's first reads start in the route wrapper (`SeaRoute`), while the page chunk and MapLibre still download — measured,
 * the page asked for its data only ~1 s (desktop) after its chunk had arrived. Same reads, same clock, same order of decisions as
 * the page's own start (the glacier's `warmGlacierStart`); the page takes them once and only while fresh, else reads itself.
 */
const SEA_START_TTL_MS = 60_000;
interface SeaStatic { catalog: Promise<SeaCatalog | null>; areas: Promise<SeaAreas | null> }
interface SeaChain { nowMs: number; kill: ReturnType<typeof loadKillSwitch>; run: Promise<SeaRunLoad | null>; texts: Promise<Array<SeaTextLoad | null>> }
let seaStart: { at: number; stat: SeaStatic | null; chain: SeaChain | null } | null = null;
export function warmSeaStart(nowMs = Date.now()): void {
  if (seaStart && nowMs - seaStart.at < SEA_START_TTL_MS) return;
  seaStart = {
    at: nowMs,
    stat: { catalog: loadCatalog().catch(() => null), areas: loadAreas().catch(() => null) },
    chain: {
      nowMs,
      kill: loadKillSwitch(),
      run: loadLatestRun(nowMs, false).catch(() => null),
      texts: Promise.all(SEA_PAGE_TEXTS.map((p) => loadText(p, nowMs, false).catch(() => null))),
    },
  };
}
const startFresh = () => !!seaStart && Date.now() - seaStart.at < SEA_START_TTL_MS;
/** Catalogue and areas of the early start, once — else `null`. */
export function takeSeaStatic(): SeaStatic | null {
  if (!startFresh()) return null;
  const s = seaStart!.stat; seaStart!.stat = null; return s;
}
/** Kill switch, run and texts of the early start (with its clock), once — else `null`. */
export function takeSeaChain(): SeaChain | null {
  if (!startFresh()) return null;
  const c = seaStart!.chain; seaStart!.chain = null; return c;
}

// --- Phase SR: hourly u/v field of the current (audit/seewetter-riffel.md) -----------------------------------------------

const currentUvCache = new Map<string, SeaShared<SeaUvGrid>>();
/**
 * `current/<run>/uv/<hhh>.png` (315 × 194) → the decoded grid, or null (missing, unreachable, not the contract's image).
 * Same canvas path as `loadField`; the image carries alpha 255 everywhere, so the read loses nothing. The page asks
 * only for the chosen hour and the one after it; a handful of grids stay in memory (≈ 0.55 MB each).
 */
export function loadCurrentUv(run: string, hour: number, signal?: AbortSignal): Promise<SeaUvGrid | null> {
  const path = seaCurrentUvPath(run, hour);
  const { nx: width, ny: height } = SEA_CURRENT_UV;
  const p = sharedRead(currentUvCache, path, async (own) => {
    const bytes = await fetchSea(path, 'bytes', own) as Uint8Array;
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    try {
      if (bmp.width !== width || bmp.height !== height) return null;
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      return decodeUvField(ctx.getImageData(0, 0, width, height).data);
    } finally { bmp.close(); }
  }, signal);
  if (currentUvCache.size > 6) currentUvCache.delete(currentUvCache.keys().next().value as string);
  return p;
}

// --- Phase BS: inland lakes (audit/seewetter-binnenseen.md) -------------------------------------------------------

/** What the page knows about the lake file: the checked document, or why there is none ("keine Daten", never an old series). */
export interface SeaLakesLoad { doc: SeaLakesDoc | null; state: 'ok' | 'none' | 'stale' | 'error'; why: string | null }
export const SEA_LAKES_NONE: SeaLakesLoad = { doc: null, state: 'none', why: 'Im Datenspeicher liegt noch keine Rechnung für die Seen.' };
export async function loadLakes(ptr: SeaLakesPointer | null, nowMs: number, signal?: AbortSignal): Promise<SeaLakesLoad> {
  if (!ptr) return SEA_LAKES_NONE;
  if (seaLakesStale(ptr.builtAt, nowMs)) return { doc: null, state: 'stale', why: 'Die letzte Rechnung für die Seen ist älter als 12 Stunden.' };
  try {
    const j = await fetchSea(ptr.path, 'json', signal) as SeaLakesDoc;
    const pr = seaLakesDocProblems(j);
    if (pr.length || j.run !== ptr.run || j.t1 !== ptr.t1) return { doc: null, state: 'error', why: 'Die Datei mit den Reihen der Seen ist nicht lesbar.' };
    return { doc: j, state: 'ok', why: null };
  } catch (e) { if (isAbort(e)) throw e; return { doc: null, state: 'error', why: 'Die Datei mit den Reihen der Seen ist gerade nicht erreichbar.' }; }
}

/**
 * The spots document with the lake spots: wind, gust and direction of the lake file on the SAME hour axis (the file names
 * the wave run it was computed for — another run ⇒ nothing is added), every wave column `null` (a lake has no wave model
 * here). A lake spot whose columns fail the value lock is left out; the coastal series are untouched. Pure.
 */
export function withLakes(doc: SeaSpotsDoc, lakes: SeaLakesDoc | null): SeaSpotsDoc {
  if (!lakes || lakes.run !== doc.run || lakes.steps !== doc.steps) return doc;
  const n = doc.steps, empty = () => new Array<number | null>(n).fill(null);
  const series: Record<string, SeaSeries> = { ...doc.series }, gustDropped = { ...doc.gustDropped };
  const quantiles: Record<string, SeaSpotQuantiles> = { ...(doc.quantiles ?? {}) };
  const sightMeta = sightMetaOf(lakes.sight), sightSpots: Record<string, SeaSightColumns> = { ...(doc.sight?.spots ?? {}) };
  let added = 0;
  for (const [id, s] of Object.entries(lakes.spots)) {
    if (series[id] || lakeSeriesProblems(s?.v, n).length) continue;
    series[id] = { ...(Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, empty()])) as SeaSeries), ...(Object.fromEntries(SEA_WIND_VARS.map((k) => [k, s.v[k].map((q) => decodeSpotValue(k, q))])) as Record<SeaWindVar, (number | null)[]>) };
    if (s.gustDropped) gustDropped[id] = s.gustDropped;
    const q = readSpotQuantiles(s.q, s.v);
    if (q) quantiles[id] = q;
    const sg = sightMeta ? readSpotSight(s.s, n) : null;
    if (sg) sightSpots[id] = sg;
    added++;
  }
  if (!added) return doc;
  const out: SeaSpotsDoc = { ...doc, series, gustDropped, lakeWind: { ...lakes.wind, t1: lakes.t1, from: lakes.from, builtAt: lakes.builtAt } };
  if (Object.keys(quantiles).length) out.quantiles = quantiles;
  // The hint columns of the lakes stand next to the coast's; without a coastal block the lakes' own block describes them.
  if (doc.sight) out.sight = { ...doc.sight, spots: sightSpots };
  else if (sightMeta) out.sight = { spots: sightSpots, meta: sightMeta };
  return out;
}
