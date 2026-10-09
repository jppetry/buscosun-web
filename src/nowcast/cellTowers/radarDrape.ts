/**
 * Phase ZT (`audit/zelltuerme-3d.md` ZT-f, E-ZT-6): the radar picture of the slider time as an IMAGE for the relief.
 *
 * The 2D map draws precipitation with `RainLayer`, a custom layer — MapLibre terrain does not drape custom layers. The
 * 3D stage therefore gets a CPU picture of the visible box, built from the SAME frames the HD layers draw
 * (`pickCompositeFrames`, reported by `MapView` via `onProfileRadarPick`): each output pixel takes the country of
 * `fastCountryPicker` (= the HD ownership mask), samples that country's native 1-km grid with the projection of
 * `sampleRadarIndex` and colours it with the ramp the shader uses (log plane where the frame carries one).
 * Rows are spaced in Web-Mercator so the `image` source (linear in Mercator between its corners) puts every row where it
 * belongs. A country without a frame at that time stays transparent — exactly like its HD layer.
 *
 * Pure apart from the time-slicing helper; the verifier calls `drapeRows` directly.
 */

import { sampleRadarIndex, type RadarGridSource } from '../../pointForecast/radarSample';
import { fastCountryPicker } from '../../scalar/radarCountryMask';
import { precipRainRamp, precipRainRampLog, type QuadCorners } from '../../scalar/RainLayer';

export type DrapeCountry = 'DE' | 'AT' | 'CH';

export interface DrapeGrid {
  values: Uint8Array;
  /** HD-3 log plane (0,06 … 200 mm/h), when the frame carries one. */
  values2?: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
}

/** Frames of one validity time per country (null = no frame of that country at that time). */
export interface TowerRadarPick {
  timeMs: number;
  DE: DrapeGrid | null;
  AT: DrapeGrid | null;
  CH: DrapeGrid | null;
}

export interface DrapeBox { west: number; south: number; east: number; north: number }

const SOURCE: Readonly<Record<DrapeCountry, RadarGridSource>> = { DE: 'radolan_rv', AT: 'inca_grid', CH: 'meteoswiss_rzc' };

type Rgba = [number, number, number, number];
function parseRgba(s: string): Rgba {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255)];
}

/** 256-entry LUT: stops at byte positions, linear in between (what the 256-texel ramp texture of the shader holds). */
function lutFromStops(stops: Array<[number, Rgba]>): Uint8ClampedArray {
  stops.sort((a, b) => a[0] - b[0]);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let u = 1; u < 256; u++) {
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1][0] < u) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[Math.min(k + 1, stops.length - 1)];
    const t = p1 > p0 ? Math.max(0, Math.min(1, (u - p0) / (p1 - p0))) : 0;
    for (let ch = 0; ch < 4; ch++) lut[u * 4 + ch] = c0[ch] + (c1[ch] - c0[ch]) * t;
  }
  return lut; // byte 0 stays transparent (dry)
}

let _lutLin: Uint8ClampedArray | null = null;
let _lutLog: Uint8ClampedArray | null = null;
/** Linear byte (`precipToU8`, keys of `precipRainRamp` = fraction of 20 mm/h). */
export function linearLut(): Uint8ClampedArray {
  return (_lutLin ??= lutFromStops(Object.entries(precipRainRamp).map(([k, v]) => [Number(k) * 255, parseRgba(v)])));
}
/** Log byte (`precipToU8Log`); the keys of `precipRainRampLog` are already normalised (`precipToU8Log(mm) / 255`). */
export function logLut(): Uint8ClampedArray {
  return (_lutLog ??= lutFromStops(Object.entries(precipRainRampLog).map(([k, v]) => [Number(k) * 255, parseRgba(v)])));
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/** Latitude of output row `j` (pixel centre), rows evenly spaced in Mercator. */
export function rowLat(box: DrapeBox, h: number, j: number): number {
  const yN = mercY(box.north), yS = mercY(box.south);
  return latOfMercY(yN + ((yS - yN) * (j + 0.5)) / h);
}

/** Fills rows [j0, j1) of `rgba` (w × h × 4). */
export function drapeRows(pick: TowerRadarPick, box: DrapeBox, w: number, h: number, rgba: Uint8ClampedArray, j0: number, j1: number): void {
  const pickCountry = fastCountryPicker();
  const lin = linearLut(), log = logLut();
  for (let j = j0; j < j1; j++) {
    const lat = rowLat(box, h, j);
    for (let i = 0; i < w; i++) {
      const lon = box.west + ((box.east - box.west) * (i + 0.5)) / w;
      const o = (j * w + i) * 4;
      const c = pickCountry(lat, lon) as DrapeCountry;
      const g = pick[c];
      if (!g) { rgba[o + 3] = 0; continue; }
      const idx = sampleRadarIndex(SOURCE[c], g.width, g.height, g.corners, lat, lon);
      if (idx == null) { rgba[o + 3] = 0; continue; }
      const useLog = !!g.values2;
      const u = useLog ? g.values2![idx] : g.values[idx];
      const lut = useLog ? log : lin;
      rgba[o] = lut[u * 4]; rgba[o + 1] = lut[u * 4 + 1]; rgba[o + 2] = lut[u * 4 + 2]; rgba[o + 3] = lut[u * 4 + 3];
    }
  }
}

/** Image corners for a MapLibre `image` source: top-left, top-right, bottom-right, bottom-left. */
export function drapeCorners(box: DrapeBox): [[number, number], [number, number], [number, number], [number, number]] {
  return [[box.west, box.north], [box.east, box.north], [box.east, box.south], [box.west, box.south]];
}

/**
 * Whole picture in time slices (≤ `sliceMs` per task, so no long task on the main thread). Resolves null when
 * `isStale()` turns true in between (a newer time or box replaced the job).
 */
export async function drapeImageSliced(
  pick: TowerRadarPick, box: DrapeBox, w: number, h: number,
  isStale: () => boolean, sliceMs = 8,
): Promise<Uint8ClampedArray | null> {
  const rgba = new Uint8ClampedArray(w * h * 4);
  let j = 0;
  while (j < h) {
    if (isStale()) return null;
    const t0 = performance.now();
    while (j < h && performance.now() - t0 < sliceMs) { drapeRows(pick, box, w, h, rgba, j, j + 1); j++; }
    if (j < h) await new Promise((r) => setTimeout(r, 0));
  }
  return isStale() ? null : rgba;
}
