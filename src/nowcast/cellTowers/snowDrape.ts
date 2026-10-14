/**
 * 3D stage: the ICON-D2 snow area (layer "Schnee", depth or fresh snow) as an IMAGE for the relief.
 *
 * The 2D map draws it with a `ScalarLayer` (custom layer) — MapLibre terrain does not drape custom layers, so the 3D stage
 * gets a CPU picture of the visible box, like `radarDrape.ts` does for the radar: each output pixel (rows evenly spaced
 * in Web-Mercator) samples the frame (`R = clamp01(cm / vMax)`, `A` = domain mask; equirect grid between `uvBounds`) and
 * colours it with `snowRamp` and the visibility fade of the map layer (< ~1 cm transparent).
 */

import { snowRamp } from '../../radar/precipPhase';
import type { IconD2SnowFrame, SnowMode } from '../../sources/iconD2Snow';
import { rowLat, type DrapeBox } from './radarDrape';

/** Same fade as `SNOW_VIS_RANGE` in `MapView.tsx` (t = cm / vMax). */
const VIS_RANGE: Record<SnowMode, { start: number; end: number }> = {
  depth: { start: 0.007, end: 0.02 },
  fresh: { start: 0.02, end: 0.05 },
};

function parseRgba(s: string): [number, number, number, number] {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}

let _lut: Float32Array | null = null;
/** 256 × RGBA (alpha 0…1) from `snowRamp`, linear between the stops (t = byte / 255). */
function snowLut(): Float32Array {
  if (_lut) return _lut;
  const stops = Object.entries(snowRamp).map(([k, v]) => ({ t: Number(k), c: parseRgba(v) })).sort((a, b) => a.t - b.t);
  const lut = new Float32Array(256 * 4);
  for (let u = 0; u < 256; u++) {
    const t = u / 255;
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1].t < t) k++;
    const a = stops[k], b = stops[Math.min(k + 1, stops.length - 1)];
    const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    for (let ch = 0; ch < 4; ch++) lut[u * 4 + ch] = a.c[ch] + (b.c[ch] - a.c[ch]) * f;
  }
  return (_lut = lut);
}

const pixels = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
function framePixels(frame: IconD2SnowFrame): Uint8ClampedArray | null {
  let px = pixels.get(frame.image);
  if (!px) {
    const ctx = frame.image.getContext('2d');
    if (!ctx) return null;
    px = ctx.getImageData(0, 0, frame.width, frame.height).data;
    pixels.set(frame.image, px);
  }
  return px;
}

const smooth = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Fills rows [j0, j1) of `rgba` (w × h × 4). */
function snowRows(
  px: Uint8ClampedArray, frame: IconD2SnowFrame, uv: [number, number, number, number], mode: SnowMode,
  box: DrapeBox, w: number, h: number, rgba: Uint8ClampedArray, j0: number, j1: number,
): void {
  const lut = snowLut();
  const vis = VIS_RANGE[mode];
  const [x0, y0, x1, y1] = uv;
  const gw = frame.width, gh = frame.height;
  for (let j = j0; j < j1; j++) {
    const lat = rowLat(box, h, j);
    const fy = ((90 - lat) / 180 - y0) / (y1 - y0) * (gh - 1);
    if (fy < -0.5 || fy > gh - 0.5) continue;
    const yi = Math.max(0, Math.min(gh - 2, Math.floor(fy))), ty = Math.max(0, Math.min(1, fy - yi));
    for (let i = 0; i < w; i++) {
      const lon = box.west + ((box.east - box.west) * (i + 0.5)) / w;
      const fx = ((lon + 180) / 360 - x0) / (x1 - x0) * (gw - 1);
      if (fx < -0.5 || fx > gw - 0.5) continue;
      const xi = Math.max(0, Math.min(gw - 2, Math.floor(fx))), tx = Math.max(0, Math.min(1, fx - xi));
      const o00 = (yi * gw + xi) * 4, o10 = o00 + 4, o01 = o00 + gw * 4, o11 = o01 + 4;
      let r: number;
      if (px[o00 + 3] > 0 && px[o10 + 3] > 0 && px[o01 + 3] > 0 && px[o11 + 3] > 0) {
        r = (px[o00] * (1 - tx) + px[o10] * tx) * (1 - ty) + (px[o01] * (1 - tx) + px[o11] * tx) * ty;
      } else {
        const on = (ty < 0.5 ? (tx < 0.5 ? o00 : o10) : (tx < 0.5 ? o01 : o11));
        if (px[on + 3] === 0) continue; // outside the model domain
        r = px[on];
      }
      const a = smooth(r / 255, vis.start, vis.end);
      if (a <= 0) continue;
      const u = Math.max(0, Math.min(255, Math.round(r)));
      const o = (j * w + i) * 4;
      rgba[o] = lut[u * 4]; rgba[o + 1] = lut[u * 4 + 1]; rgba[o + 2] = lut[u * 4 + 2];
      rgba[o + 3] = Math.round(255 * lut[u * 4 + 3] * a);
    }
  }
}

/** Whole picture in time slices (≤ `sliceMs` per task). Resolves null when `isStale()` turns true in between. */
export async function snowImageSliced(
  frame: IconD2SnowFrame, uvBounds: [number, number, number, number], mode: SnowMode,
  box: DrapeBox, w: number, h: number, isStale: () => boolean, sliceMs = 8,
): Promise<Uint8ClampedArray | null> {
  const px = framePixels(frame);
  if (!px) return null;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let j = 0;
  while (j < h) {
    if (isStale()) return null;
    const t0 = performance.now();
    while (j < h && performance.now() - t0 < sliceMs) { snowRows(px, frame, uvBounds, mode, box, w, h, rgba, j, j + 1); j++; }
    if (j < h) await new Promise((r) => setTimeout(r, 0));
  }
  return isStale() ? null : rgba;
}
