/**
 * 3D-Globus · Wind-Abfrage für den Hover-Readout.
 *
 * Lädt denselben globalen Wind-Datensatz wie die Partikel (`wind.png`+`wind.json`,
 * u/v in R/G) und dekodiert ihn in ein abtastbares Gitter — für die Punkt-Anzeige
 * (Geschwindigkeit + Richtung) unter dem Mauszeiger. Unabhängig von der GPU-
 * Partikel-Engine (die liest dieselben Daten separat).
 */

import { loadImage } from './tempRecolor';

interface WindMeta { width: number; height: number; uMin: number; uMax: number; vMin: number; vMax: number }

export interface WindSample { speedMs: number; dirFromDeg: number }

export interface WindGrid {
  u: Float32Array; v: Float32Array; width: number; height: number;
}

/** Lädt + dekodiert das Windfeld (m/s, u=Ost, v=Nord). */
export async function loadWindGrid(pngUrl = '/wind/wind.png', jsonUrl = '/wind/wind.json'): Promise<WindGrid> {
  const meta = await fetch(jsonUrl).then((r) => r.json() as Promise<WindMeta>);
  const img = await loadImage(pngUrl);
  const w = meta.width, h = meta.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const u = new Float32Array(w * h), v = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    u[i] = meta.uMin + (px[i * 4] / 255) * (meta.uMax - meta.uMin);
    v[i] = meta.vMin + (px[i * 4 + 1] / 255) * (meta.vMax - meta.vMin);
  }
  return { u, v, width: w, height: h };
}

// Wind-Geschwindigkeits-Palette (m/s → RGB) im nullschool-Stil: dunkel-kühl →
// teal/grün → gelb/orange → rot → magenta/violett bei Sturm.
export const WIND_STOPS: Array<[number, [number, number, number]]> = [
  [0, [42, 48, 74]], [3, [38, 92, 110]], [6, [44, 142, 120]], [10, [96, 184, 92]],
  [15, [184, 200, 72]], [20, [232, 176, 60]], [28, [236, 112, 56]], [38, [212, 60, 72]],
  [50, [184, 60, 134]], [70, [222, 162, 220]],
];

export function windSpeedColor(x: number): [number, number, number] {
  const s = WIND_STOPS;
  if (x <= s[0][0]) return s[0][1];
  const last = s[s.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < s.length - 1; i++) {
    const [x0, c0] = s[i], [x1, c1] = s[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return last[1];
}

/** Baut ein äquirektangulares Canvas, eingefärbt nach Windgeschwindigkeit — das
 *  „Wind"-Overlay (wie nullschools farbiger Wind-Hintergrund). */
export function buildWindSpeedCanvas(grid: WindGrid): HTMLCanvasElement {
  const { width: w, height: h, u, v } = grid;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const sp = Math.hypot(u[i], v[i]);
    const c = windSpeedColor(sp);
    const o = i * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Wind an einem Punkt (lng/lat). wind.png ist äquirektangular -180..180 / 90..-90. */
export function sampleWind(grid: WindGrid, lng: number, lat: number): WindSample | null {
  const x = Math.round(((lng + 180) / 360) * (grid.width - 1));
  const y = Math.round(((90 - lat) / 180) * (grid.height - 1));
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return null;
  const i = y * grid.width + x;
  const u = grid.u[i], v = grid.v[i];
  const speedMs = Math.hypot(u, v);
  // Meteorologische Richtung (woher der Wind weht).
  const dirFromDeg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { speedMs, dirFromDeg };
}
