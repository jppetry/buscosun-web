/**
 * SW-5 — Data client of Seewetter: the expected run and the expected text issues from the clock, one step back on
 * 404, jsDelivr first with raw.githubusercontent as hedge (pattern `fetchRoadJson`, NL-2 / V-FI-5), every file through
 * the contract's client checks before it reaches the page. `status.json` is read only for the kill switch (raw, short
 * timeout, never blocking — unreachable = not killed).
 */
import {
  SEA_CDN_BASE, SEA_RAW_BASE, SEA_MAX_STEP_BACK, SEA_RUN_EVERY_MS, SEA_SPOT_CATALOG_PATH, SEA_AREAS_PATH, SEA_STATUS_PATH, SEA_SPOT_VARS,
  SEA_MODELS, seaExpectedRun, seaRunStamp, seaRunMs, seaRunJsonPath, seaSpotsPath, seaFieldPath, seaCompPath, seaFreshness, spotSeriesProblems,
  decodeSpotValue, spotCatalogProblems, seaTextPath, type SeaSpot, type SeaSpotVar, type SeaFreshness,
} from './seaContract';
import { SEA_TEXT_PRODUCTS, seaExpectedIssues, seaTextFreshness, type SeaTextDoc, type SeaTextProduct } from './seaText';

/** "Does not exist" (404, or 403 on both ways) — distinct from a hard failure. */
export class SeaNotThere extends Error {}
export const SEA_RAW_HEDGE_MS = 2_500;

const abortError = (signal: AbortSignal): unknown => signal.reason ?? new DOMException('Aborted', 'AbortError');

/** One file of `sea/v1/`: CDN, after 2.5 s (or on 403/404/5xx/network) raw; a CDN 404 is checked once on raw. */
export function fetchSea(path: string, kind: 'json' | 'bytes', signal?: AbortSignal, bases = { cdn: SEA_CDN_BASE, raw: SEA_RAW_BASE }): Promise<unknown> {
  const cdn = `${bases.cdn}/${path}`, raw = `${bases.raw}/${path}`;
  const acC = new AbortController(), acR = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false, rawStarted = false;
    let cdnErr: unknown = null, rawErr: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => { acC.abort(); acR.abort(); finish(() => reject(abortError(signal!))); };
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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
        (res) => { if (settled) return; if (res.ok) { take(res, acC); return; } rawErr = res.status === 404 || res.status === 403 ? new SeaNotThere(`${res.status} ${raw}`) : new Error(`${res.status} ${raw}`); failed(); },
        (e) => { if (!settled) { rawErr = e; failed(); } },
      );
    };
    if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort, { once: true }); }
    timer = setTimeout(() => { timer = null; startRaw(); }, SEA_RAW_HEDGE_MS);
    fetch(cdn, { signal: acC.signal }).then(
      (res) => {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (res.ok) { take(res, acR); return; }
        cdnErr = res.status === 403 || res.status === 404 ? new SeaNotThere(`${res.status} ${cdn}`) : new Error(`${res.status} ${cdn}`);
        startRaw(); failed();
      },
      (e) => { if (settled) return; if (timer) { clearTimeout(timer); timer = null; } cdnErr = e; startRaw(); failed(); },
    );
  });
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

// --- Static ------------------------------------------------------------------------------------------

export interface SeaCatalog { spots: SeaSpot[]; problems: string[] }
export async function loadCatalog(signal?: AbortSignal): Promise<SeaCatalog | null> {
  try {
    const j = await fetchSea(SEA_SPOT_CATALOG_PATH, 'json', signal) as { product?: string; spots?: SeaSpot[] };
    if (j?.product !== 'sea-spots' || !Array.isArray(j.spots)) return null;
    const problems = spotCatalogProblems(j.spots);
    const bad = new Set(problems.map((p) => p.split(':')[0]));
    return { spots: j.spots.filter((s) => !bad.has(s.id)), problems };
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
}
export async function loadSpots(run: string, signal?: AbortSignal): Promise<SeaSpotsDoc | null> {
  try {
    const j = await fetchSea(seaSpotsPath(run), 'json', signal) as { product?: string; run?: string; runMs?: number; steps?: number; wind?: SeaSpotsDoc['wind']; spots?: Record<string, { v: Record<SeaSpotVar, (number | null)[]>; gustDropped?: number }> };
    if (j?.product !== 'sea-spots-series' || j.run !== run || !j.spots) return null;
    const series: Record<string, SeaSeries> = {}, gustDropped: Record<string, number> = {};
    const rejected: string[] = [];
    for (const [id, s] of Object.entries(j.spots)) {
      if (spotSeriesProblems(s.v).length) { rejected.push(id); continue; }
      series[id] = Object.fromEntries(SEA_SPOT_VARS.map((k) => [k, s.v[k].map((q) => decodeSpotValue(k, q))])) as SeaSeries;
      if (s.gustDropped) gustDropped[id] = s.gustDropped;
    }
    return { run, runMs: j.runMs ?? seaRunMs(run), steps: j.steps ?? 79, wind: j.wind ?? { engine: null, failed: [] }, series, gustDropped, rejected };
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

// --- Fields ------------------------------------------------------------------------------------------

export interface SeaFieldImage { width: number; height: number; rgba: Uint8ClampedArray }
const fieldCache = new Map<string, Promise<SeaFieldImage | null>>();
/**
 * `f/<sss>.png` (630 × 387) or `c/<sss>.png` (1260 × 387) → exact RGBA bytes. Canvas path with
 * `colorSpaceConversion/premultiplyAlpha: 'none'` (radar/repack rule — a colour conversion would shift values);
 * water pixels carry alpha 255, so no premultiplication loss.
 */
export function loadField(run: string, kind: 'f' | 'c', step: number, signal?: AbortSignal): Promise<SeaFieldImage | null> {
  const path = kind === 'f' ? seaFieldPath('cwam', run, step) : seaCompPath('cwam', run, step);
  const hit = fieldCache.get(path);
  if (hit) return hit;
  const g = SEA_MODELS.cwam.grid;
  const width = kind === 'f' ? g.ni : 2 * g.ni, height = g.nj;
  const p = (async () => {
    try {
      const bytes = await fetchSea(path, 'bytes', signal) as Uint8Array;
      const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      try {
        if (bmp.width !== width || bmp.height !== height) return null;
        const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
        const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
        if (!ctx) return null;
        ctx.drawImage(bmp, 0, 0);
        return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
      } finally { bmp.close(); }
    } catch (e) {
      fieldCache.delete(path);
      if (isAbort(e)) throw e;
      return null;
    }
  })();
  fieldCache.set(path, p);
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
    }
  }
  return { doc: null, freshness: 'none', tried };
}
export const SEA_TEXT_TITLES = Object.fromEntries(Object.values(SEA_TEXT_PRODUCTS).map((s) => [s.product, s.title])) as Record<SeaTextProduct, string>;

// --- Measurement at the coast (DWD POI) ------------------------------------------------------------------

export interface SeaPoiObs { t: number; ffMs: number | null; ddDeg: number | null; fxMs: number | null }
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
