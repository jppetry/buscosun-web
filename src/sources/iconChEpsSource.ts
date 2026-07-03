/**
 * MeteoSchweiz ICON-CH1/CH2-EPS — Kontrolllauf als coarse `ForecastGrid` für den
 * Per-Land-Modell-Switcher (Phase 4.2, `docs/model-switcher-gate0.md`).
 *
 * Die Modelle liegen im OGD-Katalog nur als natives **icosahedrales** Gitter vor
 * (GDT 101, DRT 0 — simple packing; CH1 ~1,15 M Zellen/1 km, CH2 ~284 k/2 km).
 * Der erweiterte `gribDecode` (GDT 101 + `decodeGrib2All`) liest das; die
 * Zellkoordinaten kommen aus dem Collection-Level-Asset
 * `horizontal_constants_*.grib2` (clat/clon, zeitinvariant, schon in Grad).
 *
 * **Zugriff:** STAC (`data.geo.admin.ch`, CORS-frei) → pre-signed S3-Hrefs auf
 * `rgw.cscs.ch` (CORS-blockiert → `/_cscs`-Proxy). Der Katalog kennt weder Feld-
 * noch Step-Filter (nur `datetime`/`bbox`, keine sort/query/CQL2-Extension) und
 * paginiert id-**aufsteigend** — der neueste Lauf läge am Ende. Deshalb wird der
 * neueste Lauf per **Gültigzeit-Fenster** isoliert: an einer festen Gültigzeit
 * sind ~8 Läufe präsent; der mit `max(reference_datetime)` ist der aktuelle.
 *
 * **Kostenrealität:** das gebündelte `perturbed`-File (10 Member) ist ~23 MB je
 * (Variable, Step) → ein Full-Ensemble-Mittel wären hunderte MB. Der erste
 * gegatete Schnitt nutzt daher NUR den `ctrl`-Member (deterministischer
 * Kontrolllauf, ~2,3 MB CH1 / ~0,6 MB CH2) und ist eng gedeckelt (wenige Steps).
 * Das Ensemble-Mittel ist eine spätere Ausbaustufe (Katalog-`pipelineNote`).
 */

import { decodeGrib2All, type GribField } from './gribDecode';
import { correctCloudBias } from './cloudBias';
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const KELVIN = 273.15;
const STAC_ROOT = 'https://data.geo.admin.ch/api/stac/v1';

/** Deckelung (Perf): so viele 3-stündliche Steps ab jetzt. */
const MAX_STEP_DEFAULT = 6;

export type ChModelId = 'icon-ch1-eps' | 'icon-ch2-eps';

interface ChModelCfg {
  collection: string;
  constantsAsset: string;
  /** Ausgabe-Gitter über die Schweiz (+ kleiner Rand). */
  bounds: ForecastBounds;
}

const CH_MODELS: Record<ChModelId, ChModelCfg> = {
  'icon-ch1-eps': {
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch1',
    constantsAsset: 'horizontal_constants_icon-ch1-eps.grib2',
    bounds: { lngMin: 5.8, lngMax: 10.7, latMin: 45.7, latMax: 47.9 },
  },
  'icon-ch2-eps': {
    collection: 'ch.meteoschweiz.ogd-forecasting-icon-ch2',
    constantsAsset: 'horizontal_constants_icon-ch2-eps.grib2',
    bounds: { lngMin: 5.8, lngMax: 10.7, latMin: 45.7, latMax: 47.9 },
  },
};

/** STAC-`forecast:variable` (uppercase) → interner Schlüssel. */
const VARS = [
  { key: 't_2m', stac: 'T_2M' },
  { key: 'u_10m', stac: 'U_10M' },
  { key: 'v_10m', stac: 'V_10M' },
  { key: 'clct', stac: 'CLCT' },
  { key: 'tot_prec', stac: 'TOT_PREC' },
] as const;
const WANTED_STAC = new Set<string>(VARS.map((v) => v.stac));

export interface IconChEpsOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

// --- rohes GRIB via /_cscs-Proxy, gecacht per STABILEM Objekt-Key --------------
// (die signierte STAC-Href wechselt je Enumeration → Query als Cache-Key wäre nie
//  ein Treffer; deshalb cachen wir unter dem laufinvarianten Objektnamen.)

const RAW_CACHE = 'icon-ch-eps-grib-v1';
const RAW_CACHE_MAX = 80;
let rawCacheP: Promise<Cache | null> | null = null;
function rawCache(): Promise<Cache | null> {
  if (!rawCacheP) {
    rawCacheP = typeof caches !== 'undefined' ? caches.open(RAW_CACHE).catch(() => null) : Promise.resolve(null);
  }
  return rawCacheP;
}
async function pruneRawCache(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - RAW_CACHE_MAX; i++) await cache.delete(keys[i]);
  } catch { /* ignore */ }
}

/** rgw.cscs.ch-Href → same-origin Proxy-URL. Im Browser blockiert CORS den
 *  direkten Zugriff → `/_cscs`-Proxy. In Node (Verify-Harness, kein `window`)
 *  gibt es kein CORS → Href direkt zurückgeben. */
function proxied(href: string): string {
  if (typeof window === 'undefined') return href;
  return href.replace(/^https:\/\/rgw\.cscs\.ch/, '/_cscs');
}

/** Holt eine signierte S3-Href über den Proxy und cacht die Bytes unter `key`. */
async function fetchRawCached(href: string, key: string, signal?: AbortSignal): Promise<Uint8Array> {
  const cache = await rawCache();
  const cacheKey = `https://cache.local/${key}`;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const res = await fetch(proxied(href), { signal });
  if (!res.ok) throw new Error(`ICON-CH-EPS: ${res.status} (${key})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (cache) {
    cache.put(cacheKey, new Response(bytes.slice().buffer)).then(() => pruneRawCache(cache)).catch(() => {});
  }
  return bytes;
}

// --- STAC-Enumeration ----------------------------------------------------------

interface StacItem {
  id: string;
  properties: Record<string, unknown>;
  assets: Record<string, { href: string }>;
}

/** Paginiert eine STAC-`items`-Abfrage (Gültigzeit-Range) bis `cap` Seiten. */
async function stacPage(collection: string, range: string, cap: number, signal?: AbortSignal): Promise<StacItem[]> {
  let url: string | undefined =
    `${STAC_ROOT}/collections/${collection}/items?limit=100&datetime=${encodeURIComponent(range)}`;
  const out: StacItem[] = [];
  for (let p = 0; p < cap && url; p++) {
    const res: Response = await fetch(url, { signal });
    if (!res.ok) break;
    const j: { features?: StacItem[]; links?: { rel: string; href: string }[] } = await res.json();
    const feats: StacItem[] = j.features ?? [];
    if (feats.length === 0) break;
    out.push(...feats);
    url = (j.links ?? []).find((l) => l.rel === 'next')?.href;
  }
  return out;
}

function iso(t: number): string {
  // "2026-07-03T18:00:00Z" (STAC erwartet ganze Sekunden ohne Millis).
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Ein 1-Minuten-Fenster um eine Gültigzeit (ein exakter Instant liefert 0). */
function instantRange(t: number): string {
  return `${iso(t)}/${iso(t + 60_000)}`;
}

interface ChRun { runAt: number; steps: number[]; }

/**
 * Bestimmt den neuesten Lauf + verfügbare Ziel-Steps. Basis = nächste 3-h-Grenze
 * ≥ jetzt; an dieser Gültigzeit sind mehrere Läufe präsent — `max(ref)` ist der
 * aktuelle. Danach die weiteren 3-h-Steps dieses Laufs prüfen.
 */
async function resolveRun(collection: string, cap: number, signal?: AbortSignal): Promise<{ run: ChRun; itemsByStep: Map<number, StacItem[]> }> {
  const now = Date.now();
  const base = Math.ceil(now / (3 * 3600_000)) * 3 * 3600_000; // nächste 3-h-Grenze
  const stepHours: number[] = [];
  for (let h = 0; h <= cap; h += 3) stepHours.push(h);

  // 1) Basis-Gültigzeit: neuesten Lauf ermitteln.
  const baseItems = await stacPage(collection, instantRange(base), 12, signal);
  if (baseItems.length === 0) throw new Error('ICON-CH-EPS: keine Items an Basis-Gültigzeit');
  let runAt = -Infinity;
  for (const it of baseItems) {
    const r = Date.parse(String(it.properties['forecast:reference_datetime']));
    if (Number.isFinite(r) && r > runAt) runAt = r;
  }
  if (!Number.isFinite(runAt)) throw new Error('ICON-CH-EPS: kein reference_datetime');

  // 2) Für jede Ziel-Gültigzeit die ctrl-Items des Ziel-Laufs sammeln.
  const itemsByStep = new Map<number, StacItem[]>();
  const steps: number[] = [];
  for (const h of stepHours) {
    const valid = base + h * 3600_000;
    const step = Math.round((valid - runAt) / 3600_000);
    if (step < 0) continue;
    const items = h === 0 ? baseItems : await stacPage(collection, instantRange(valid), 12, signal);
    const mine = items.filter((it) =>
      Date.parse(String(it.properties['forecast:reference_datetime'])) === runAt &&
      it.properties['forecast:perturbed'] === false &&
      WANTED_STAC.has(String(it.properties['forecast:variable'])));
    if (mine.length > 0) { itemsByStep.set(step, mine); steps.push(step); }
  }
  if (steps.length === 0) throw new Error('ICON-CH-EPS: keine ctrl-Items im Horizont');
  return { run: { runAt, steps: steps.sort((a, b) => a - b) }, itemsByStep };
}

// --- clat/clon aus dem Collection-Constants-Asset (per Modell gecacht) ---------

interface CellCoords { lat: Float32Array; lon: Float32Array; n: number; }
const coordsCache = new Map<ChModelId, Promise<CellCoords>>();

function fieldRange(f: GribField): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < f.values.length; i++) { const v = f.values[i]; if (v < min) min = v; if (v > max) max = v; }
  return { min, max };
}

/** clat/clon per Wertebereich detektieren (robust gegen Nachrichten-Reihenfolge):
 *  Breite ~42..51, Länge ~-1..18 (CH-ICON-Domäne), beide schon in Grad. */
function detectCoords(fields: GribField[]): CellCoords {
  let lat: GribField | undefined, lon: GribField | undefined;
  for (const f of fields) {
    const { min, max } = fieldRange(f);
    if (min > 40 && max < 54 && max - min < 12) lat = f;
    else if (min > -8 && max < 24 && max - min > 12) lon = f;
  }
  if (!lat || !lon) throw new Error('ICON-CH-EPS: clat/clon in constants nicht gefunden');
  return { lat: lat.values, lon: lon.values, n: lat.ni };
}

async function getCellCoords(model: ChModelId, signal?: AbortSignal): Promise<CellCoords> {
  let p = coordsCache.get(model);
  if (!p) {
    p = (async () => {
      const cfg = CH_MODELS[model];
      const collRes = await fetch(`${STAC_ROOT}/collections/${cfg.collection}`, { signal });
      if (!collRes.ok) throw new Error(`ICON-CH-EPS: collection ${collRes.status}`);
      const coll = await collRes.json();
      const asset = coll.assets?.[cfg.constantsAsset];
      if (!asset?.href) throw new Error('ICON-CH-EPS: constants-Asset fehlt');
      const raw = await fetchRawCached(asset.href, `${model}-constants`, signal);
      return detectCoords(decodeGrib2All(raw));
    })().catch((e) => { coordsCache.delete(model); throw e; });
    coordsCache.set(model, p);
  }
  return p;
}

/** Je Ausgabepunkt den Index der nächsten icosahedralen Zelle (linearer Scan). */
function nearestIndex(coords: CellCoords, lats: number[], lngs: number[]): Int32Array {
  const out = new Int32Array(lats.length);
  const { lat, lon, n } = coords;
  for (let p = 0; p < lats.length; p++) {
    const la = lats[p], lo = lngs[p];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dLa = lat[i] - la, dLo = lon[i] - lo;
      const d = dLa * dLa + dLo * dLo;
      if (d < bestD) { bestD = d; best = i; }
    }
    out[p] = best;
  }
  return out;
}

/** ctrl-Feld eines (Variable, Step) an den Ausgabepunkten abtasten. */
async function sampleField(
  item: StacItem, model: ChModelId, keyLabel: string, idx: Int32Array, signal?: AbortSignal,
): Promise<Float32Array> {
  const asset = Object.values(item.assets)[0];
  const raw = await fetchRawCached(asset.href, `${model}-${keyLabel}`, signal);
  const fields = decodeGrib2All(raw);
  const f = fields[0];
  const out = new Float32Array(idx.length);
  for (let p = 0; p < idx.length; p++) {
    const v = f?.values[idx[p]];
    out[p] = Number.isFinite(v) ? (v as number) : NaN;
  }
  return out;
}

/**
 * Lädt den ICON-CH1/CH2-EPS-Kontrolllauf als coarse `ForecastGrid`. Bewusst eng
 * gedeckelt (≤ MAX_STEP_DEFAULT h, nur ctrl-Member) — das gebündelte perturbed-
 * File ist ~23 MB je Feld. Der FusionEngine interpoliert das coarse Gitter per
 * IDW auf die dichte Karte; das Raster trägt daher den Engine-Qualitäts-Badge.
 */
export async function fetchIconChEpsGrid(model: ChModelId, options: IconChEpsOptions = {}): Promise<ForecastGrid> {
  const cfg = CH_MODELS[model];
  const cols = options.cols ?? 16;
  const rows = options.rows ?? 10;
  const total = cols * rows;
  const cap = Math.min(options.hours ?? MAX_STEP_DEFAULT, MAX_STEP_DEFAULT);

  const { run, itemsByStep } = await resolveRun(cfg.collection, cap, options.signal);

  // Ausgabe-Gitter über die CH-Domäne.
  const lats = new Array<number>(total), lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = cfg.bounds.latMin + (j / Math.max(1, rows - 1)) * (cfg.bounds.latMax - cfg.bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = cfg.bounds.lngMin + (i / Math.max(1, cols - 1)) * (cfg.bounds.lngMax - cfg.bounds.lngMin);
      lats[j * cols + i] = lat; lngs[j * cols + i] = lng;
    }
  }

  const coords = await getCellCoords(model, options.signal);
  const idx = nearestIndex(coords, lats, lngs);

  // Je (Variable, Step) das ctrl-Feld abtasten. fieldData[key][stepIndex] = grid.
  const steps = run.steps;
  const stepIndex = new Map(steps.map((s, i) => [s, i]));
  const fieldData: Record<string, Float32Array[]> = {};
  for (const v of VARS) fieldData[v.key] = steps.map(() => new Float32Array(total).fill(NaN));

  await Promise.all(steps.flatMap((step) => {
    const items = itemsByStep.get(step) ?? [];
    return VARS.map(async (v) => {
      const it = items.find((x) => String(x.properties['forecast:variable']) === v.stac);
      if (!it) return;
      const grid = await sampleField(it, model, `${v.key}-${step}`, idx, options.signal).catch(() => null);
      if (grid) fieldData[v.key][stepIndex.get(step)!] = grid;
    });
  }));

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < steps.length; h++) {
    times.push(new Date(run.runAt + steps[h] * 3600_000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const tK = fieldData.t_2m[h][k];
      const t = Number.isFinite(tK) ? tK - KELVIN : null;
      const u = Number.isFinite(fieldData.u_10m[h][k]) ? fieldData.u_10m[h][k] : null;
      const v = Number.isFinite(fieldData.v_10m[h][k]) ? fieldData.v_10m[h][k] : null;
      const clRaw = fieldData.clct[h][k];
      const total100 = correctCloudBias(Number.isFinite(clRaw) ? clRaw : null);
      // tot_prec ist akkumuliert → Rate = Differenz zum Vorschritt.
      const accNow = fieldData.tot_prec[h][k];
      const accPrev = h > 0 ? fieldData.tot_prec[h - 1][k] : 0;
      const precip = Number.isFinite(accNow) && Number.isFinite(accPrev) ? Math.max(0, accNow - accPrev) : null;
      arr[k] = {
        temperature: t, u, v,
        cloudLow: total100 != null ? total100 * 0.55 : null,
        cloudMid: total100 != null ? total100 * 0.30 : null,
        cloudHigh: total100 != null ? total100 * 0.15 : null,
        precipitation: precip,
        model: model === 'icon-ch1-eps' ? 'icon_ch1_eps' : 'icon_ch2_eps',
      };
    }
    points.push(arr);
  }

  return { cols, rows, bounds: cfg.bounds, times, points, fetchedAt: Date.now() };
}
