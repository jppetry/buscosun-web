/**
 * Pure, DOM-freie Kernlogik des Wind-RG-Frames: kombiniert ein decodiertes u- und
 * v-GRIB-Feld zu einem subsampelten, north-up RGBA-Byte-Array (R = u, G = v) plus
 * Pro-Frame-Normierung — OHNE Canvas/DOM. Ausgelagert, damit BEIDE Seiten sie
 * nutzen: der Wind-Decode-Worker (off-main, `windFrameWorker`) und der
 * Main-Thread-Fallback in `iconD2WindSource`. Der Main-Thread setzt die Bytes
 * danach nur noch per (billigem) `putImageData` in ein Canvas.
 */

import type { GribField } from '../sources/gribDecode';

export interface WindRgba {
  /** w·h·4 Bytes, north-up (R = u, G = v, B = 0, A = 255). */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

/** Subsamplet u/v auf ~`targetWidth`, flippt north-up und kodiert normiert nach RG. */
export function buildWindRgba(u: GribField, v: GribField, targetWidth: number): WindRgba {
  const { ni, nj } = u;
  const ss = Math.max(1, Math.ceil(ni / targetWidth));
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);

  const us = new Float32Array(w * h);
  const vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      let uVal = u.values[k]; let vVal = v.values[k];
      if (!Number.isFinite(uVal)) uVal = 0;     // außerhalb der Domain → Windstille
      if (!Number.isFinite(vVal)) vVal = 0;
      const o = jj * w + ii;
      us[o] = uVal; vs[o] = vVal;
      if (uVal < uMin) uMin = uVal; if (uVal > uMax) uMax = uVal;
      if (vVal < vMin) vMin = vVal; if (vVal > vMax) vMax = vVal;
    }
  }
  // Mindest-Spanne gegen Division durch 0 im Shader.
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let jj = 0; jj < h; jj++) {
    const y = h - 1 - jj;                        // Quelle: jj=0 = Süden → north-up flippen
    for (let ii = 0; ii < w; ii++) {
      const o = jj * w + ii;
      const idx = (y * w + ii) * 4;
      rgba[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
      rgba[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 255;
    }
  }
  return { rgba, width: w, height: h, uMin, uMax, vMin, vMax };
}
