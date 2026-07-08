/**
 * DWD ICON-D2 — Niederschlags-Forecast (Hauptlayer ab +2 h) aus den GRIB2-
 * Rohdaten auf opendata.dwd.de.
 *
 * Quelle: `weather/nwp/icon-d2/grib/<HH>/tot_prec/` —
 *   `icon-d2_germany_regular-lat-lon_single-level_<YYYYMMDDHH>_<SSS>_2d_tot_prec.grib2.bz2`
 *   - ICON-D2, 2,2 km (reguläres lat-lon-Gitter 0,02°), Deutschland + Umfeld.
 *   - Modelllauf alle 3 h (00, 03, 06, 09, 12, 15, 18, 21 UTC), publiziert ~2 h
 *     nach Lauf. Horizont +48 h (03-UTC-Lauf historisch +45 h).
 *   - `tot_prec` ist **akkumulierter** Niederschlag seit Laufbeginn in kg/m² (mm).
 *     Stundenrate = Differenz aufeinanderfolgender Schritte.
 *   - CC BY 4.0, unbegrenzt, kommerziell ok, kein API-Key.
 *
 * **Warum GRIB2 im Browser?** Der DWD-GeoServer hat KEINEN deterministischen
 * ICON-D2-Niederschlags-WMS (nur globales ICON 25 km, ICON-EU 7 km und ICON-D2-
 * EPS-Warnprodukte). Für echtes 2,2-km-ICON-D2 müssen wir die GRIB2 direkt
 * dekodieren. Das Packing ist das einfachste: DRT 0 (simple packing), 16 bit,
 * mit Bitmap — kein JPEG2000/PNG, keine externe Lib nötig.
 */

import { decompress } from './decompress';
import type { QuadCorners } from '../scalar/RainLayer';
import { decodeGrib2, type GribField } from './gribDecode';
import { decodeGridStep, type GridToU8Kind, type DecodedGridStep } from './gribGridDecode';

// Reiner GRIB2-Decoder lebt jetzt in ./gribDecode (browser-unabhängig, headless
// gegen eccodes verifizierbar). Re-Export hält bestehende Importpfade stabil
// (iconD2GustSource, iconD2WindSource, iconEuPressureWind importieren von hier).
export { decodeGrib2, gribCorners, aecDecode } from './gribDecode';
export type { GribField } from './gribDecode';

const D2_GRIB_BASE = '/_dwd_opendata/weather/nwp/icon-d2/grib';

export const ICON_D2_ATTRIBUTION =
  'Niederschlag-Forecast: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> · CC BY 4.0';


export interface IconD2Frame {
  /** Gültigkeitszeit dieser Stundenrate (Ende des Akkumulationsintervalls). */
  validAt: Date;
  /** Vorlaufstunde ab Modelllauf. */
  stepHours: number;
  /** Kompaktes Werte-Grid (1 Byte/Zelle, north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface IconD2Precip {
  runAt: Date;
  frames: IconD2Frame[];
  corners: QuadCorners;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

interface RunInfo { runStr: string; runAt: Date; steps: number[]; }

// Modul-Cache: vermeidet wiederholte (langsame) Directory-Listing-Fetches.
//  • `runCache` (pro Param, TTL): Refresh-Zyklen / Re-Aktivierungen treffen den Cache.
//  • `sharedRun`: hat EIN Layer den Lauf aufgelöst, probieren andere Layer direkt
//    dessen HH (1 Fetch) statt der vollen 6er-Rückwärtssuche — der Lauf ist über
//    alle Params identisch. Hilft dem Kaltstart, wenn mehrere Layer nah laden.
const RUN_CACHE_TTL_MS = 3 * 60 * 1000;
const runCache = new Map<string, { at: number; info: RunInfo }>();
let sharedRun: { runStr: string; runAt: Date; at: number } | null = null;

/** Lädt das Param-Verzeichnis eines konkreten Laufs und parst die Schritt-Liste. */
async function fetchRunSteps(runStr: string, param: string, signal?: AbortSignal): Promise<number[]> {
  const hh = runStr.slice(8, 10);
  const res = await fetch(`${D2_GRIB_BASE}/${hh}/${param}/`, { signal });
  if (!res.ok) return [];
  const html = await res.text();
  const re = new RegExp(
    `icon-d2_germany_regular-lat-lon_single-level_${runStr}_(\\d{3})_2d_${param}\\.grib2\\.bz2`,
    'g',
  );
  const steps = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) steps.add(parseInt(m[1], 10));
  return [...steps].sort((a, b) => a - b);
}

/**
 * Findet den jüngsten publizierten ICON-D2-Lauf. Cache-gestützt (s.o.); Fallback
 * ist die Rückwärtssuche von „jetzt" in 3-h-Schritten (das HH-Verzeichnis wird pro
 * Zyklus überschrieben, kann also kurz noch das alte Datum enthalten).
 */
export async function resolveLatestRun(
  param: string,
  signal?: AbortSignal,
): Promise<RunInfo> {
  const t = Date.now();
  const cached = runCache.get(param);
  if (cached && t - cached.at < RUN_CACHE_TTL_MS) return cached.info;

  // Kürzlich von einem anderen Layer aufgelösten Lauf direkt für diesen Param probieren.
  if (sharedRun && t - sharedRun.at < RUN_CACHE_TTL_MS) {
    try {
      const steps = await fetchRunSteps(sharedRun.runStr, param, signal);
      if (steps.length > 0 && Math.max(...steps) >= 24) {
        const info: RunInfo = { runStr: sharedRun.runStr, runAt: sharedRun.runAt, steps };
        runCache.set(param, { at: Date.now(), info });
        return info;
      }
    } catch { /* fällt auf die volle Rückwärtssuche zurück */ }
  }

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const hh = pad2(cand.getUTCHours());
    const runStr =
      `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${hh}`;
    let steps: number[];
    try {
      steps = await fetchRunSteps(runStr, param, signal);
    } catch {
      continue;
    }
    // Erst akzeptieren, wenn der Lauf hinreichend komplett ist (Schritt ≥ 24 da).
    if (steps.length > 0 && Math.max(...steps) >= 24) {
      const info: RunInfo = { runStr, runAt: cand, steps };
      runCache.set(param, { at: Date.now(), info });
      sharedRun = { runStr, runAt: cand, at: Date.now() };
      return info;
    }
  }
  throw new Error('ICON-D2: kein publizierter Lauf gefunden');
}

// ---------------------------------------------------------------------------
// Decompressed-GRIB-Cache (Cache API). Der teuerste Schritt ist mit Abstand das
// bz2-Entpacken (pure-JS-Lib, ~7 s/Feld!) — Decode (≈18 ms) und Fetch (≈165 ms)
// sind klein. ICON-D2-Dateien sind pro Lauf unveränderlich (URL enthält den
// Lauf) → wir cachen die ENTPACKTEN Bytes. Treffer überspringt fetch + bz2 und
// dekodiert nur neu. Reloads / Re-Aktivierungen werden dadurch quasi sofort.
// ---------------------------------------------------------------------------
const GRIB_CACHE = 'icon-d2-grib-decompressed-v1';
const GRIB_CACHE_MAX = 140; // ~1 voller Lauf mehrerer Layer; Browser evictet bei Quota ohnehin
let gribCacheP: Promise<Cache | null> | null = null;
function gribCache(): Promise<Cache | null> {
  if (!gribCacheP) {
    gribCacheP = typeof caches !== 'undefined'
      ? caches.open(GRIB_CACHE).catch(() => null)
      : Promise.resolve(null);
  }
  return gribCacheP;
}
async function pruneGribCache(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys(); // Einfüge-Reihenfolge → FIFO-Eviction
    for (let i = 0; i < keys.length - GRIB_CACHE_MAX; i++) await cache.delete(keys[i]);
  } catch { /* ignore */ }
}

/** Holt + entpackt ein GRIB2-Feld und cacht die ENTPACKTEN Bytes (ohne Decode).
 *  Der Decode kann so off-main erfolgen (z. B. Wind-Frame-Worker) — der teure
 *  Teil (fetch + bz2) bleibt hier zentral inkl. Cache. */
export async function fetchDecompressedCached(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const cache = await gribCache();
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`ICON-D2: ${res.status} (${url})`);
  const decompressed = await decompress(await res.arrayBuffer());
  if (cache) {
    // Kopie cachen (put konsumiert den Body); fire-and-forget + FIFO-Prune. Die
    // `.slice()` läuft synchron VOR einem etwaigen Transfer des Originalpuffers.
    cache.put(url, new Response(decompressed.slice().buffer))
      .then(() => pruneGribCache(cache)).catch(() => {});
  }
  return decompressed;
}

/** Holt + entpackt + dekodiert ein GRIB2-Feld, mit Cache der entpackten Bytes.
 *  Generisch über die volle URL → auch von anderen Modell-Quellen nutzbar
 *  (z. B. ICON-EU-Druckflächenwind), solange das Packing GDT 0 / DRT 0|1 ist. */
export async function fetchDecodeCached(url: string, signal?: AbortSignal): Promise<GribField> {
  return decodeGrib2(await fetchDecompressedCached(url, signal));
}

function stepFileName(runStr: string, param: string, step: number): string {
  return `icon-d2_germany_regular-lat-lon_single-level_${runStr}_${pad3(step)}_2d_${param}.grib2.bz2`;
}

export async function fetchStepField(
  runStr: string,
  param: string,
  step: number,
  signal?: AbortSignal,
): Promise<GribField> {
  const hh = runStr.slice(8, 10);
  return fetchDecodeCached(`${D2_GRIB_BASE}/${hh}/${param}/${stepFileName(runStr, param, step)}`, signal);
}

/** Wie `fetchStepField`, liefert aber die ENTPACKTEN Bytes (Decode off-main). */
export async function fetchStepBytes(
  runStr: string,
  param: string,
  step: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const hh = runStr.slice(8, 10);
  return fetchDecompressedCached(`${D2_GRIB_BASE}/${hh}/${param}/${stepFileName(runStr, param, step)}`, signal);
}

/**
 * Lädt ein zeitinvariantes ICON-D2-Feld (z. B. `hsurf` = Modell-Orographie).
 * Anderes Dateimuster als die Schritt-Felder (`time-invariant_<run>_000_0_<param>`).
 */
export async function fetchInvariantField(
  runStr: string,
  param: string,
  signal?: AbortSignal,
): Promise<GribField> {
  const hh = runStr.slice(8, 10);
  const name =
    `icon-d2_germany_regular-lat-lon_time-invariant_${runStr}_000_0_${param}.grib2.bz2`;
  return fetchDecodeCached(`${D2_GRIB_BASE}/${hh}/${param}/${name}`, signal);
}

/** Optionen für den generischen ICON-D2-Gitter-Loader. */
export interface IconD2GridOptions {
  /** true: akkumuliertes Feld → Differenz aufeinanderfolgender Schritte (Niederschlag).
   *  false: instantanes Feld, jeder Schritt ist ein Frame (Bewölkung). */
  accumulate: boolean;
  /** Physikalischer Zellwert → Uint8 (precipToU8 / cloudToU8 / capeToU8) —
   *  Diskriminator statt Callback, da Funktionen nicht in den Worker klonbar sind. */
  kind: GridToU8Kind;
  /** Optionaler Horizont-Cap in Stunden (z.B. Wolken: 27). */
  maxStep?: number;
}

const FETCH_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Grid-Decode-Pool: GRIB2-Decode + Diff/Quantisierung (s. gribGridDecode.ts)
// laufen off-main im gribGridWorker — vorher blockierte das kumuliert
// ~1,5-2,5 s Main Thread über die ~27 Schritte eines Laufs (4×-CPU-Throttle,
// gemessen), TROTZ eines Main-Thread-Yields pro Konsumenten-Schritt: mehrere
// Fetches lösen dank FETCH_CONCURRENCY oft im selben Tick auf, ihre
// Decode-Callbacks liefen dann als Mikrotask-Kette VOR dem nächsten Yield.
// Fällt bei fehlendem/abgestürztem Worker transparent auf denselben Code
// zurück (gleiches Muster wie decompress.ts/windFrameWorker/radolanWorker).
// ---------------------------------------------------------------------------
interface GgMsg {
  id: number; ok: boolean; error?: string;
  valuesBuf?: ArrayBuffer; width?: number; height?: number; rawBuf?: ArrayBuffer;
  corners?: [[number, number], [number, number], [number, number], [number, number]];
}
const GG_POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 3));
let ggWorkers: Worker[] = [];
let ggUsable = true, ggInited = false, ggRr = 0, ggNextId = 1;
const ggPending = new Map<number, { resolve: (r: DecodedGridStep) => void; reject: (e: Error) => void }>();

function ggInit(): void {
  if (ggInited) return;
  ggInited = true;
  try {
    for (let i = 0; i < GG_POOL_SIZE; i++) {
      const w = new Worker(new URL('./gribGridWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<GgMsg>) => {
        const d = e.data;
        const p = ggPending.get(d.id);
        if (!p) return;
        ggPending.delete(d.id);
        if (d.ok && d.valuesBuf && d.rawBuf && d.corners) {
          p.resolve({
            values: new Uint8Array(d.valuesBuf), width: d.width!, height: d.height!,
            rawValues: new Float32Array(d.rawBuf), corners: d.corners,
          });
        } else {
          p.reject(new Error(d.error || 'grib grid worker error'));
        }
      };
      w.onerror = () => {
        ggUsable = false;
        for (const [id, p] of ggPending) { ggPending.delete(id); p.reject(new Error('grib grid worker crashed')); }
      };
      ggWorkers.push(w);
    }
  } catch {
    ggUsable = false;
    ggWorkers = [];
  }
}

async function decodeGridStepOffMain(
  bytes: Uint8Array,
  refRawValues: Float32Array | null,
  accumulate: boolean,
  kind: GridToU8Kind,
): Promise<DecodedGridStep> {
  ggInit();
  if (!ggUsable || ggWorkers.length === 0) return decodeGridStep(bytes, refRawValues, accumulate, kind);
  const w = ggWorkers[ggRr++ % ggWorkers.length];
  const id = ggNextId++;
  try {
    return await new Promise<DecodedGridStep>((resolve, reject) => {
      ggPending.set(id, { resolve, reject });
      const bytesBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const refBuf = refRawValues
        ? refRawValues.buffer.slice(refRawValues.byteOffset, refRawValues.byteOffset + refRawValues.byteLength)
        : null;
      const transfer: Transferable[] = refBuf ? [bytesBuf, refBuf] : [bytesBuf];
      w.postMessage({ id, bytesBuf, refBuf, accumulate, kind }, transfer);
    });
  } catch (err) {
    ggPending.delete(id);
    return decodeGridStep(bytes, refRawValues, accumulate, kind);
  }
}

/**
 * Generischer ICON-D2-Gitter-Loader. Lädt die Schritte des jüngsten Laufs
 * **parallel** (begrenzte Concurrency; bz2-Decompress läuft im Worker-Pool),
 * dekodiert off-main (Grid-Decode-Pool, s.o.) in Schritt-Reihenfolge und baut
 * kompakte Uint8-Werte-Grids. Statt strikt sequenziell (≈ 154 ms Fetch × N)
 * überlappen Fetch/Decompress/Decode → Vielfaches schneller. Speicher-schonend:
 * nie mehr als ~Concurrency Felder gleichzeitig (für Akkumulation zusätzlich
 * das rohe Vorgängerfeld).
 *
 * `onProgress` feuert pro fertigem Frame, damit der Slider den nahen Horizont
 * sofort nutzen kann, während ferne Schritte noch laden.
 */
export async function fetchIconD2Grid(
  param: string,
  opts: IconD2GridOptions,
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Precip) => void,
): Promise<IconD2Precip> {
  const resolved = await resolveLatestRun(param, signal);
  const { runStr, runAt } = resolved;
  const steps = opts.maxStep != null
    ? resolved.steps.filter((s) => s <= opts.maxStep!)
    : resolved.steps;

  const frames: IconD2Frame[] = [];
  let corners: QuadCorners | null = null;

  // Producer: hält bis FETCH_CONCURRENCY Fetches in der Luft, legt die
  // ENTPACKTEN (noch undekodierten) Bytes nach Schritt ab — der Decode selbst
  // passiert erst im Konsumenten, off-main (s. decodeGridStepOffMain).
  const bytesByStep = new Map<number, Uint8Array | null>();
  const inflight = new Map<number, Promise<void>>();
  let fetchPtr = 0;
  const pump = () => {
    while (inflight.size < FETCH_CONCURRENCY && fetchPtr < steps.length) {
      const step = steps[fetchPtr++];
      const p = fetchStepBytes(runStr, param, step, signal)
        .then((b) => { bytesByStep.set(step, b); }, () => { bytesByStep.set(step, null); })
        .finally(() => { inflight.delete(step); });
      inflight.set(step, p);
    }
  };

  // Consumer: in Schritt-Reihenfolge (für die Akkumulations-Differenz nötig).
  let prevRawValues: Float32Array | null = null;
  for (const step of steps) {
    pump();
    while (!bytesByStep.has(step) && inflight.size > 0) {
      await Promise.race(inflight.values());
      pump();
    }
    const bytes = bytesByStep.get(step) ?? null;
    bytesByStep.delete(step);

    if (bytes) {
      const decoded = await decodeGridStepOffMain(
        bytes, opts.accumulate ? prevRawValues : null, opts.accumulate, opts.kind,
      );
      if (!corners) corners = decoded.corners;
      if (opts.accumulate) {
        if (prevRawValues && step > 0) {
          frames.push({
            validAt: new Date(runAt.getTime() + step * 3600_000),
            stepHours: step, values: decoded.values,
            width: decoded.width, height: decoded.height,
          });
          if (onProgress && corners) onProgress({ runAt, frames: [...frames], corners });
        }
        prevRawValues = decoded.rawValues;
      } else {
        frames.push({
          validAt: new Date(runAt.getTime() + step * 3600_000),
          stepHours: step, values: decoded.values,
          width: decoded.width, height: decoded.height,
        });
        if (onProgress && corners) onProgress({ runAt, frames: [...frames], corners });
      }
    }
    await new Promise<void>((r) => setTimeout(r)); // ans Event-Loop zurückgeben
  }

  if (!corners || frames.length === 0) throw new Error(`ICON-D2 ${param}: keine Frames erzeugt`);
  frames.sort((a, b) => a.stepHours - b.stepHours);
  return { runAt, frames, corners };
}

/**
 * ICON-D2-Niederschlag: tot_prec (akkumuliert) → Stundenrate mm/h.
 * Auf +27 h gekappt (Spec-Standardhorizont; die seltene +45-h-Reichweite des
 * 03-UTC-Laufs ist bewusst weggelassen, halbiert die Frame-Zahl/Ladezeit).
 */
export function fetchIconD2Precip(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Precip) => void,
): Promise<IconD2Precip> {
  return fetchIconD2Grid('tot_prec', { accumulate: true, kind: 'precip', maxStep: 27 }, signal, onProgress);
}
