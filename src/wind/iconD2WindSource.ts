/**
 * DWD ICON-D2 — 10-m-Wind (u_10m / v_10m) als natives 2,2-km-Gitter für den
 * Wind-Partikel-Layer der Kartenansicht.
 *
 * Ersetzt die bisherige Open-Meteo-Punktgrid-Quelle (20×16, ratenlimitiert,
 * nicht-kommerziell) durch das native DWD-ICON-D2-Gitter (reguläres lat-lon
 * 0,02°, ~2,2 km, DE + Umfeld) direkt aus den GRIB2-Rohdaten — dieselbe
 * Pipeline wie Niederschlag/Bewölkung (`iconD2Precip`/`iconD2Clouds`):
 * resolveLatestRun → fetchStepField (bz2 im Worker) → decodeGrib2.
 *
 * Wind braucht ZWEI Parameter (u + v) → wir kombinieren sie pro Schritt zu
 * einem RG-Canvas (R = u, G = v, north-up), den der WindLayer direkt als
 * Textur nutzt. Pro Frame eigene u/v-Normierung (wie die bisherige Quelle).
 * CC BY 4.0, kein API-Key.
 */

import { resolveLatestRun, fetchStepBytes, gribCorners, decodeGrib2, type GribField } from '../sources/iconD2Precip';
import { buildWindRgba } from './windFrameBuild';

export const ICON_D2_WIND_ATTRIBUTION =
  'Wind: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> · CC BY 4.0';

/** Horizont-Cap (h). Wind = primär „aktuell"; naher Bereich reicht (Slider clamp).
 *  u+v verdoppeln die Fetch-Last ggü. Precip → bewusst kürzerer Horizont. */
const MAX_STEP = 12;
/** Naher Horizont, der auf dem KRITISCHEN Pfad geladen wird (0…NEAR_STEP h). Der
 *  Slider startet bei 0; diese Frames machen den Wind sofort nutzbar. Die fernen
 *  Schritte (NEAR_STEP+1…MAX_STEP) füllen danach im Hintergrund nach, ohne den
 *  Erstpaint zu blockieren. */
const NEAR_STEP = 4;
/** Schritte, die SPEKULATIV (mit dem geratenen Lauf) parallel zur ~1,9-s-
 *  Directory-Auflösung geladen werden — so ist der nahe Horizont da, ohne auf das
 *  Listing zu warten. Bei Fehlgriff (nur am Zyklusrand) werden sie verworfen. */
const SPEC_STEPS = 3;
/** Ziel-Breite nach Subsampling (das 1215er-Nativgitter ist für Partikel-Viz Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;

export interface IconD2WindFrame {
  validAt: Date;
  stepHours: number;
  /** RG-Canvas (R = u, G = v, north-up) als Textur-Quelle. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

export interface IconD2Wind {
  runAt: Date;
  frames: IconD2WindFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

/** RGBA-Bytes in ein 2D-Canvas übertragen (billiger Main-Thread-Schritt). */
function rgbaToCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

/** Kombiniert ein u- und v-Feld zu einem subsampelten, north-up RG-Canvas + Normierung.
 *  Modell-unabhängig (ICON-D2-Surface wie ICON-EU-Druckfläche) → exportiert. Der
 *  teure Kern (`buildWindRgba`) ist DOM-frei und läuft für Wind off-main im Worker;
 *  hier wird das Ergebnis nur noch ins Canvas gelegt (z. B. ICON-EU-Druckwind). */
export function buildWindFrame(u: GribField, v: GribField): Omit<IconD2WindFrame, 'validAt' | 'stepHours'> {
  const b = buildWindRgba(u, v, TARGET_WIDTH);
  return { image: rgbaToCanvas(b.rgba, b.width, b.height), width: b.width, height: b.height, uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax };
}

// ---------------------------------------------------------------------------
// Wind-Frame-Decode-Pool: decodeGrib2 (u+v) + RGBA-Bau laufen off-main im Worker
// (`windFrameWorker`) — bisher pro geladenem Frame (×~26 am Kaltstart) auf dem
// Main-Thread (~2×18 ms Decode + Subsample/Encode). Fetch + bz2 bleiben beim
// bz2-Worker-Pool; hier gehen nur die ENTPACKTEN Bytes rein, ein RGBA-Puffer raus.
// Fällt transparent auf Main-Thread-Decode zurück, wenn Worker nicht verfügbar.
// ---------------------------------------------------------------------------
export interface WindBuilt {
  rgba: Uint8ClampedArray;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
}
interface WfMsg {
  id: number; ok: boolean; error?: string;
  rgba?: ArrayBuffer; width?: number; height?: number;
  uMin?: number; uMax?: number; vMin?: number; vMax?: number;
  corners?: WindBuilt['corners'];
}
const WF_POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 3));
let wfWorkers: Worker[] = [];
let wfUsable = true, wfInited = false, wfRr = 0, wfNextId = 1;
const wfPending = new Map<number, { resolve: (b: WindBuilt) => void; reject: (e: Error) => void }>();

function wfInit(): void {
  if (wfInited) return;
  wfInited = true;
  try {
    for (let i = 0; i < WF_POOL_SIZE; i++) {
      const w = new Worker(new URL('./windFrameWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WfMsg>) => {
        const d = e.data;
        const p = wfPending.get(d.id);
        if (!p) return;
        wfPending.delete(d.id);
        if (d.ok && d.rgba) {
          p.resolve({
            rgba: new Uint8ClampedArray(d.rgba), width: d.width!, height: d.height!,
            uMin: d.uMin!, uMax: d.uMax!, vMin: d.vMin!, vMax: d.vMax!, corners: d.corners!,
          });
        } else {
          p.reject(new Error(d.error || 'wind frame worker error'));
        }
      };
      w.onerror = () => {
        // Worker-Crash (Script-/Load-Fehler): künftige Frames gehen auf den
        // Main-Thread-Fallback (wfUsable=false). In-flight-Anfragen NICHT hängen
        // lassen — ihre Bytes sind bereits transferiert (nicht rückholbar), also
        // ablehnen; loadStep überspringt den Frame dann sauber.
        wfUsable = false;
        for (const [id, p] of wfPending) { wfPending.delete(id); p.reject(new Error('wind frame worker crashed')); }
      };
      wfWorkers.push(w);
    }
  } catch {
    wfUsable = false;
    wfWorkers = [];
  }
}

/** Main-Thread-Fallback: decodiert u+v + baut RGBA lokal (wie zuvor). */
function buildWindOnMain(uBytes: Uint8Array, vBytes: Uint8Array): WindBuilt {
  const u = decodeGrib2(uBytes);
  const v = decodeGrib2(vBytes);
  const b = buildWindRgba(u, v, TARGET_WIDTH);
  return { ...b, corners: gribCorners(u) };
}

/** Decodiert u+v (entpackte GRIB-Bytes) + baut den RGBA-Frame OFF-MAIN. Die
 *  übergebenen Puffer werden an den Worker TRANSFERIERT (danach nicht mehr nutzen). */
function decodeWindFrameOffMain(uBytes: Uint8Array, vBytes: Uint8Array): Promise<WindBuilt> {
  wfInit();
  if (!wfUsable || wfWorkers.length === 0) return Promise.resolve(buildWindOnMain(uBytes, vBytes));
  const w = wfWorkers[wfRr++ % wfWorkers.length];
  const id = wfNextId++;
  return new Promise<WindBuilt>((resolve, reject) => {
    wfPending.set(id, { resolve, reject });
    try {
      w.postMessage(
        { id, uBuf: uBytes.buffer, vBuf: vBytes.buffer, targetWidth: TARGET_WIDTH },
        [uBytes.buffer, vBytes.buffer],
      );
    } catch {
      wfPending.delete(id);
      // Transfer/Worker-Post fehlgeschlagen → Main-Thread. (Puffer ggf. schon
      // detached; buildWindOnMain nutzt sie dann leer → daher hier NICHT nutzen,
      // sondern nur ablehnen, falls Bytes weg sind.)
      try { resolve(buildWindOnMain(uBytes, vBytes)); }
      catch (e) { reject(e as Error); }
    }
  });
}

/**
 * Lädt das native ICON-D2-10-m-Windgitter (u+v) des jüngsten Laufs.
 *
 * Staged/dynamisch: Der NAHE Horizont (0…NEAR_STEP h) lädt auf dem kritischen
 * Pfad und macht den Wind sofort nutzbar; die Promise löst danach auf. Die
 * FERNEN Schritte (…MAX_STEP h) füllen im HINTERGRUND nach (via `onProgress`,
 * ohne Erstpaint/Basemap zu verdrängen). Zusätzlich werden die ersten Schritte
 * SPEKULATIV parallel zur ~1,9-s-Lauf-Auflösung geladen. `onProgress` feuert pro
 * fertigem Frame; das übergebene Objekt teilt sich das wachsende `frames`-Array.
 */
export async function fetchIconD2Wind(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Wind) => void,
  /** Einmal aufgerufen, wenn AUCH der ferne Horizont im Hintergrund fertig ist —
   *  der Aufrufer kann damit genau ein Repaint auslösen (Slider-Parkposition). */
  onSettled?: () => void,
): Promise<IconD2Wind> {
  const frames: IconD2WindFrame[] = [];
  let uvBounds: [number, number, number, number] | null = null;

  const loadStep = async (rs: string, ra: Date, step: number): Promise<boolean> => {
    try {
      // Nur fetch + bz2 (bz2-Worker-Pool) auf dem Aufrufer-Pfad; decodeGrib2 + der
      // RGBA-Bau laufen off-main im Wind-Frame-Worker.
      const [uBytes, vBytes] = await Promise.all([
        fetchStepBytes(rs, 'u_10m', step, signal),
        fetchStepBytes(rs, 'v_10m', step, signal),
      ]);
      const b = await decodeWindFrameOffMain(uBytes, vBytes);
      if (!uvBounds) {
        const c = b.corners;                    // [NW, NE, SE, SW] in [lon,lat]
        uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
      }
      const image = rgbaToCanvas(b.rgba, b.width, b.height);
      frames.push({
        validAt: new Date(ra.getTime() + step * 3_600_000), stepHours: step,
        image, width: b.width, height: b.height, uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax,
      });
      frames.sort((a, b2) => a.stepHours - b2.stepHours);
      if (onProgress && uvBounds) onProgress({ runAt: ra, frames: [...frames], uvBounds });
      return true;
    } catch {
      // Einzelner Schritt fehlt (z. B. v noch nicht publiziert) → überspringen.
      return false;
    }
  };

  // Bounded-Concurrency-Pump über eine Schrittliste (bereits spekulativ geladene
  // Schritte überspringen).
  const pump = async (list: number[], rs: string, ra: Date, conc: number, skip: Set<number>) => {
    let ptr = 0;
    const workers = Array.from({ length: Math.min(conc, list.length) }, async () => {
      while (ptr < list.length) {
        if (signal?.aborted) return;
        const step = list[ptr++];
        if (skip.has(step)) continue;
        await loadStep(rs, ra, step);
      }
    });
    await Promise.all(workers);
  };

  // SPECULATIVE near-step fetch (0…SPEC_STEPS-1). Filenames are deterministic for
  // the current 3 h cycle, so we fetch them in PARALLEL with the (~1.9 s)
  // directory-listing resolution instead of AFTER it — removing the dir-listing
  // wait from the near-horizon cold-start path. On a guess miss (only at a cycle
  // boundary, when the newest cycle isn't a full run yet) the speculative frames
  // are discarded and reloaded from the resolved run — never worse than before,
  // at the cost of a few wasted requests in that window.
  const p2 = (n: number) => String(n).padStart(2, '0');
  const g = new Date(); g.setUTCMinutes(0, 0, 0); g.setUTCHours(g.getUTCHours() - (g.getUTCHours() % 3));
  const guessRunStr = `${g.getUTCFullYear()}${p2(g.getUTCMonth() + 1)}${p2(g.getUTCDate())}${p2(g.getUTCHours())}`;
  const specSteps = Array.from({ length: SPEC_STEPS }, (_, i) => i);
  const specDone = Promise.all(specSteps.map((s) => loadStep(guessRunStr, g, s)));

  const { runStr, runAt, steps } = await resolveLatestRun('u_10m', signal);
  const wanted = steps.filter((s) => s <= MAX_STEP);
  const specResults = await specDone;
  const guessHit = runStr === guessRunStr;
  if (!guessHit) { frames.length = 0; uvBounds = null; }     // guess missed → drop, load normally
  // Nur ERFOLGREICH spekulierte Schritte überspringen (ein fehlender Schritt darf
  // nicht als „geladen" gelten, sonst bliebe er im nahen Horizont leer).
  const specLoaded = new Set<number>(guessHit ? specSteps.filter((_, i) => specResults[i]) : []);

  // Nahen Horizont auf dem kritischen Pfad laden → Wind sofort nutzbar.
  const near = wanted.filter((s) => s <= NEAR_STEP);
  const far = wanted.filter((s) => s > NEAR_STEP);
  await pump(near, runStr, runAt, CONCURRENCY, specLoaded);

  if (!uvBounds || frames.length === 0) throw new Error('ICON-D2 Wind: keine Frames erzeugt');

  // Fernen Horizont im Hintergrund nachfüllen (reduzierte Concurrency, damit er
  // nicht mit Erstpaint/Basemap konkurriert). Aktualisiert die Ref via onProgress;
  // die Promise wartet NICHT darauf. `frames` ist geteilt → das zurückgegebene
  // Objekt wächst mit, der Slider findet ferne Frames sobald sie da sind.
  if (far.length && !signal?.aborted) {
    void pump(far, runStr, runAt, Math.min(CONCURRENCY, 3), specLoaded)
      .then(() => { if (!signal?.aborted) onSettled?.(); })
      .catch(() => {});
  } else {
    onSettled?.();
  }

  return { runAt, frames, uvBounds };
}

/** Nächster Frame zur Vorlauf-Stunde (clamp). */
export function windFrameAtHour(wind: IconD2Wind, hour: number): IconD2WindFrame {
  let best = wind.frames[0], bd = Infinity;
  for (const f of wind.frames) { const d = Math.abs(f.stepHours - hour); if (d < bd) { bd = d; best = f; } }
  return best;
}

// ---------------------------------------------------------------------------
// Zeit-Interpolation zwischen Stunden-Frames (wie Windy: „smooth scrubbing").
// Die u/v-Normierung unterscheidet sich PRO Frame → ein naives Byte-Lerp der
// RG-Canvas wäre falsch. Korrekt: beide Frames in echte m/s dekodieren, die
// Geschwindigkeiten lerpen, neu normieren+kodieren. Ergebnis-Frame wird gecacht
// (gleiche Slider-Position → kein Neuaufbau).
// ---------------------------------------------------------------------------

let _blendCache: { key: string; frame: IconD2WindFrame } | null = null;

function blendWindFrames(a: IconD2WindFrame, b: IconD2WindFrame, t: number): IconD2WindFrame {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = a.image.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const db = b.image.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  const aUs = a.uMax - a.uMin, aVs = a.vMax - a.vMin, bUs = b.uMax - b.uMin, bVs = b.vMax - b.vMin;
  const us = new Float32Array(w * h), vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    for (let ii = 0; ii < w; ii++) {
      const ia = (jj * a.width + ii) * 4, ib = (jj * b.width + ii) * 4;
      const uA = a.uMin + (da[ia] / 255) * aUs, vA = a.vMin + (da[ia + 1] / 255) * aVs;
      const uB = b.uMin + (db[ib] / 255) * bUs, vB = b.vMin + (db[ib + 1] / 255) * bVs;
      const u = uA + (uB - uA) * t, v = vA + (vB - vA) * t;
      const o = jj * w + ii;
      us[o] = u; vs[o] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
  }
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let o = 0; o < w * h; o++) {
    const idx = o * 4;
    img.data[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
    img.data[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
    img.data[idx + 2] = 0;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const validAt = new Date(a.validAt.getTime() + (b.validAt.getTime() - a.validAt.getTime()) * t);
  return { validAt, stepHours: a.stepHours + (b.stepHours - a.stepHours) * t, image: canvas, width: w, height: h, uMin, uMax, vMin, vMax };
}

/**
 * Geschwindigkeitsraum-interpolierter Frame zur (gebrochenen) Vorlaufstunde —
 * smooth Scrubbing wie Windy, konsistent mit Niederschlag/Temperatur. Auf einer
 * exakten Stunde (oder am Rand) wird der Originalframe ohne Neuaufbau geliefert.
 */
export function windFrameInterpolated(wind: IconD2Wind, hour: number): IconD2WindFrame {
  const frames = wind.frames;
  if (frames.length < 2) return frames[0];
  const minH = frames[0].stepHours, maxH = frames[frames.length - 1].stepHours;
  const hr = Math.max(minH, Math.min(maxH, hour));
  let a = frames[0], b = frames[frames.length - 1];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].stepHours <= hr) a = frames[i];
    if (frames[i].stepHours >= hr) { b = frames[i]; break; }
  }
  const span = b.stepHours - a.stepHours;
  const frac = span > 0 ? (hr - a.stepHours) / span : 0;
  if (frac < 0.02) return a;
  if (frac > 0.98) return b;
  const key = `${a.stepHours}|${b.stepHours}|${frac.toFixed(2)}`;
  if (_blendCache?.key === key) return _blendCache.frame;
  const frame = blendWindFrames(a, b, frac);
  _blendCache = { key, frame };
  return frame;
}

/**
 * Wie `windFrameInterpolated`, aber NACH GÜLTIGKEITSZEIT (now-indexiert) statt
 * nach Vorlauf-Schritt — behebt den Valid-Time-Versatz (QA-Befund D1). Die
 * Zielzeit (Date.now() + Slider-Stunde·3600s) wird relativ zum Lauf in eine
 * gebrochene Vorlaufstunde umgerechnet; die Geschwindigkeitsraum-Interpolation
 * (smooth Scrubbing) bleibt unverändert.
 */
export function windFrameAtValidTime(wind: IconD2Wind, targetMs: number): IconD2WindFrame {
  const hour = (targetMs - wind.runAt.getTime()) / 3600_000;
  return windFrameInterpolated(wind, hour);
}

// ---------------------------------------------------------------------------
// Sofort-Erstpaint-Cache: den „jetzt"-Frame (Schritt 0) des letzten Laufs in
// localStorage ablegen, damit der Wind-Layer beim nächsten Seitenaufruf SOFORT
// rendert (statt ~2 s auf den Netz-Fetch zu warten). Wird vom frischen nativen
// Gitter ersetzt, sobald es geladen ist. Das Gitter ist standort-unabhängig
// (immer dieselbe ICON-D2-DACH-Domäne), darum ein einziger globaler Key.
// ---------------------------------------------------------------------------

const WIND_CACHE_KEY = 'bc_wind_now_v2';
/** Cache ignorieren, wenn älter (paar h alter Wind als 2-s-Platzhalter ist ok). */
const WIND_CACHE_MAX_AGE_MS = 24 * 3_600_000;

export interface CachedWindNow {
  image: HTMLImageElement;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  uvBounds: [number, number, number, number];
}

/** Den „jetzt"-Frame als PNG-DataURL + Normierung/Bounds persistieren. */
export function saveWindNowCache(frame: IconD2WindFrame, uvBounds: [number, number, number, number]): void {
  try {
    const payload = {
      dataUrl: frame.image.toDataURL('image/png'),
      width: frame.width, height: frame.height,
      uMin: frame.uMin, uMax: frame.uMax, vMin: frame.vMin, vMax: frame.vMax,
      uvBounds, savedMs: Date.now(),
    };
    localStorage.setItem(WIND_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage voll/nicht verfügbar (Private Mode) → still ignorieren.
  }
}

/** Gecachten „jetzt"-Frame laden (Image aus DataURL dekodiert, kein Netz). */
export async function loadWindNowCache(): Promise<CachedWindNow | null> {
  try {
    const raw = localStorage.getItem(WIND_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.dataUrl || Date.now() - (p.savedMs ?? 0) > WIND_CACHE_MAX_AGE_MS) return null;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('wind cache decode failed'));
      img.src = p.dataUrl;
    });
    return {
      image, width: p.width, height: p.height,
      uMin: p.uMin, uMax: p.uMax, vMin: p.vMin, vMax: p.vMax, uvBounds: p.uvBounds,
    };
  } catch {
    return null;
  }
}
