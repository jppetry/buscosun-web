/**
 * Punktabfrage auf einem north-up-Äquirekt-Canvas (RG = u/v) — der Wind-Sampler,
 * der bis AF2 in `src/qa/layerSampler.ts` lebte (V-AF-4).
 *
 * Herausgezogen, weil die Brandansicht (`src/fire/activity/dynamics.ts`) den
 * Windvektor am Brandort braucht und das QA-Modul dafür `temperatureLabels`
 * mit in den Fire-Chunk zöge. Gleiche Mathematik, gleiche Signatur;
 * `layerSampler.ts` re-exportiert von hier.
 *
 * Achtung Zeitachse: `windFrameAtValidTime` interpoliert relativ zu `runAt` —
 * ein Zeitpunkt VOR dem Lauf klemmt auf den ersten Frame. Wer vergangene
 * Zeitpunkte abfragt (Überflüge), muss den Abstand selbst prüfen; deshalb
 * gibt `sampleWindAt` den benutzten `validAtMs` mit zurück.
 */
import { windFrameAtValidTime, type IconD2Wind } from './iconD2WindSource';

export interface Decoded { w: number; h: number; data: Uint8ClampedArray; }
const rgCache = new WeakMap<HTMLCanvasElement | HTMLImageElement, Decoded>();

/** Canvas/Bild einmal in Bytes lesen (Cache je Bild). */
export function decodeImage(img: HTMLCanvasElement | HTMLImageElement): Decoded {
  const cached = rgCache.get(img); if (cached) return cached;
  const w = (img as HTMLCanvasElement).width || (img as HTMLImageElement).naturalWidth;
  const h = (img as HTMLCanvasElement).height || (img as HTMLImageElement).naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d: Decoded = { w, h, data: ctx.getImageData(0, 0, w, h).data };
  rgCache.set(img, d); return d;
}

/**
 * Texel-Koordinate aus einer normierten uv — **Außenkanten-Konvention**, also
 * exakt das, was `texture2D` im Shader tut: Texelmitten liegen bei `(i+0,5)/n`,
 * die Ränder werden geklemmt (CLAMP_TO_EDGE).
 *
 * Vorher rechnete diese Datei `u·(n−1)`, unterstellte also **Zellmitten** an den
 * uv-Rändern. Zusammen mit den Außenkanten-Bounds der Quellen lasen Karte und
 * Punktabfrage dadurch bis zu eine halbe Ausgabezelle auseinander
 * (audit/karten-layer-verortung.md, B3). EINE Konvention, hier definiert.
 */
export function texelCoord(uv: number, n: number): number {
  return Math.min(n - 1, Math.max(0, uv * n - 0.5));
}

export function bilinear(d: Decoded, u: number, v: number, ch: 0 | 1 | 2 | 3): number {
  const x = texelCoord(u, d.w), y = texelCoord(v, d.h);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(d.w - 1, x0 + 1), y1 = Math.min(d.h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => d.data[(yy * d.w + xx) * 4 + ch];
  const c0 = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const c1 = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return c0 * (1 - fy) + c1 * fy;
}

export interface WindSample {
  u: number; v: number; speed: number;
  /** Meteorologische Richtung in Grad — „kommt aus". */
  dir: number;
  /** Gültigkeitszeit des benutzten Frames (ms UTC) — zum Abstandscheck durch den Aufrufer. */
  validAtMs: number;
}

/** Wind (m/s + met. Richtung °, „kommt aus") am Punkt — RG-Decode + Denorm. */
export function sampleWindAt(wind: IconD2Wind | null, targetMs: number, lon: number, lat: number): WindSample | null {
  if (!wind || wind.frames.length === 0) return null;
  const f = windFrameAtValidTime(wind, targetMs);
  const [x0, y0, x1, y1] = wind.uvBounds;
  const ux = (lon + 180) / 360, uy = (90 - lat) / 180;
  const tu = (ux - x0) / (x1 - x0), tv = (uy - y0) / (y1 - y0);
  if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return null;
  const d = decodeImage(f.image);
  const u = f.uMin + (bilinear(d, tu, tv, 0) / 255) * (f.uMax - f.uMin);
  const v = f.vMin + (bilinear(d, tu, tv, 1) / 255) * (f.vMax - f.vMin);
  return { u, v, speed: Math.hypot(u, v), dir: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360, validAtMs: f.validAt.getTime() };
}
