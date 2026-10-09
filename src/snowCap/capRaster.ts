/**
 * Phase SK: the cap image and the line — per image pixel the Terrarium height against the Fusion snowfall line.
 *   h ≥ p50          cap (white, alpha dry…wet from the wet sampler, E-SK-3)
 *   p10 ≤ h ≤ p90    band, fine diagonal hatch (on top of the cap where both apply)
 *   no field value / no DEM  transparent (gap, counted)
 * Image rows are equally spaced in Web Mercator (a MapLibre `image` source interpolates linearly in Mercator,
 * audit/karten-layer-verortung.md §14). Line = contour `h − p50 = 0` on a half-resolution grid (`isoRingsGrid`), cut
 * where it touches the image border or a gap, labelled with `fmtSnowLine` at its middle.
 * Pure and DOM-free; the loop yields every `sliceMs` (no long task on a phone).
 */
import type { ElevationTiles } from '../fusion/elevation';
import { isoRingsGrid } from '../precipChance/contours';
import { snowAt, type SnowGrid } from './snowField';
import { fmtSnowLine, SK_ALPHA_DRY, SK_ALPHA_WET, SK_HATCH_ALPHA, SK_HATCH_PERIOD, SK_HATCH_WIDTH, type CapPalette } from './snowCapModel';

export interface CapView { west: number; east: number; north: number; south: number; width: number; height: number }
export type WetSampler = (lat: number, lon: number) => number | null;
export interface CapResult {
  rgba: Uint8ClampedArray; width: number; height: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
  lines: GeoJSON.FeatureCollection;
  stats: { pixels: number; cap: number; band: number; gap: number; noDem: number; ms: number };
}

/** Label points per image (longest runs) — set. */
const SK_LABEL_POINTS = 3; // set

const D2R = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
const latOfMercY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

export function colLon(v: CapView, i: number): number { return v.west + ((i + 0.5) / v.width) * (v.east - v.west); }
export function mercRowLat(v: CapView, j: number): number {
  const yN = mercY(v.north), yS = mercY(v.south);
  return latOfMercY(yN + ((j + 0.5) / v.height) * (yS - yN));
}

const lng2tileX = (lng: number, z: number) => ((lng + 180) / 360) * (1 << z);
const lat2tileY = (lat: number, z: number) => { const r = lat * D2R; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); };
const terr = (d: Uint8ClampedArray, i: number) => d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;

/** Bilinear Terrarium height (same rule as `elevation.ts` `sample`); NaN without tile. */
export function demAt(dem: ElevationTiles, lon: number, lat: number): number {
  return demAtTile(dem, lng2tileX(lon, dem.zoom), lat2tileY(lat, dem.zoom));
}
function demAtTile(dem: ElevationTiles, fx: number, fy: number): number {
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const ix = tx - dem.x0, iy = ty - dem.y0;
  if (ix < 0 || iy < 0 || ix >= dem.nx || iy >= dem.ny) return NaN;
  const d = dem.data[iy * dem.nx + ix];
  if (!d) return NaN;
  const px = (fx - tx) * 256, py = (fy - ty) * 256;
  const i0 = Math.max(0, Math.min(255, Math.floor(px))), j0 = Math.max(0, Math.min(255, Math.floor(py)));
  const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
  const ax = px - i0, ay = py - j0;
  const e0 = terr(d, (j0 * 256 + i0) * 4) * (1 - ax) + terr(d, (j0 * 256 + i1) * 4) * ax;
  const e1 = terr(d, (j1 * 256 + i0) * 4) * (1 - ax) + terr(d, (j1 * 256 + i1) * 4) * ax;
  return e0 * (1 - ay) + e1 * ay;
}

const defaultYield = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildCap(inp: {
  view: CapView; dem: ElevationTiles; snow: SnowGrid; wet: WetSampler; palette: CapPalette;
  sliceMs?: number; yieldFn?: () => Promise<void>; signal?: AbortSignal;
}): Promise<CapResult> {
  const tStart = performance.now();
  const { view: v, dem, snow, wet, palette } = inp;
  const W = v.width, Hh = v.height;
  const sliceMs = inp.sliceMs ?? 8;
  const yieldFn = inp.yieldFn ?? defaultYield;
  const rgba = new Uint8ClampedArray(W * Hh * 4);
  const diff = new Float32Array(W * Hh).fill(NaN); // h − p50, NaN = gap / no DEM
  const stats = { pixels: W * Hh, cap: 0, band: 0, gap: 0, noDem: 0, ms: 0 };
  const colFx = new Float64Array(W), lons = new Float64Array(W);
  for (let i = 0; i < W; i++) { lons[i] = colLon(v, i); colFx[i] = lng2tileX(lons[i], dem.zoom); }
  // Snow field bilinear (same rule as `snowAt`) with the column part precomputed — the per-pixel closure of `snowAt` cost
  // most of the time. Columns outside the field: sx0 = -1.
  const g = snow.grid, GW = g.width, GH = g.height;
  const sx0 = new Int32Array(W), sx1 = new Int32Array(W), stx = new Float64Array(W);
  for (let i = 0; i < W; i++) {
    const fx = (lons[i] - g.lon0) / g.deg;
    if (fx < -0.5 || fx > GW - 0.5) { sx0[i] = -1; continue; }
    const x0 = Math.max(0, Math.min(GW - 1, Math.floor(fx)));
    sx0[i] = x0; sx1[i] = Math.min(GW - 1, x0 + 1); stx[i] = Math.max(0, Math.min(1, fx - x0));
  }
  const smid = snow.mid, shalf = snow.half;
  const aDry = Math.min(1, SK_ALPHA_DRY * palette.alphaScale), aWet = Math.min(1, SK_ALPHA_WET * palette.alphaScale);
  const aHatch = Math.min(1, SK_HATCH_ALPHA * palette.alphaScale);
  let t0 = performance.now();
  for (let j = 0; j < Hh; j++) {
    if (inp.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const lat = mercRowLat(v, j);
    const fy = lat2tileY(lat, dem.zoom);
    const fyS = (lat - g.lat0) / g.deg;
    const rowIn = !(fyS < -0.5 || fyS > GH - 0.5);
    const y0 = Math.max(0, Math.min(GH - 1, Math.floor(fyS))), y1 = Math.min(GH - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fyS - y0));
    const r0 = (GH - 1 - y0) * GW, r1 = (GH - 1 - y1) * GW;
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = k * 4;
      const h = demAtTile(dem, colFx[i], fy);
      if (!Number.isFinite(h)) { stats.noDem++; continue; }
      if (!rowIn || sx0[i] < 0) continue; // outside the field
      const xa = sx0[i], xb = sx1[i], tx = stx[i];
      let ws = 0, mid = 0, half = 0, wq: number, q: number;
      wq = (1 - tx) * (1 - ty); q = r0 + xa; if (wq > 0 && !Number.isNaN(smid[q])) { ws += wq; mid += wq * smid[q]; half += wq * shalf[q]; }
      wq = tx * (1 - ty); q = r0 + xb; if (wq > 0 && !Number.isNaN(smid[q])) { ws += wq; mid += wq * smid[q]; half += wq * shalf[q]; }
      wq = (1 - tx) * ty; q = r1 + xa; if (wq > 0 && !Number.isNaN(smid[q])) { ws += wq; mid += wq * smid[q]; half += wq * shalf[q]; }
      wq = tx * ty; q = r1 + xb; if (wq > 0 && !Number.isNaN(smid[q])) { ws += wq; mid += wq * smid[q]; half += wq * shalf[q]; }
      if (ws <= 1e-9) { stats.gap++; continue; }
      const sMid = mid / ws, sHalf = half / ws;
      diff[k] = h - sMid;
      let a = 0; let rgb = palette.cap;
      if (h >= sMid) {
        const w = Math.max(0, Math.min(1, wet(lat, lons[i]) ?? 0));
        a = aDry + (aWet - aDry) * w; stats.cap++;
      }
      if (sHalf > 0 && h >= sMid - sHalf && h <= sMid + sHalf) {
        stats.band++;
        if ((i + j) % SK_HATCH_PERIOD < SK_HATCH_WIDTH) { a = Math.max(a, aHatch); rgb = palette.hatch; }
      }
      if (a > 0) { rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = Math.round(a * 255); }
    }
    if (performance.now() - t0 > sliceMs) { await yieldFn(); t0 = performance.now(); }
  }
  const lines = contourLines(diff, v, snow);
  stats.ms = performance.now() - tStart;
  return {
    rgba, width: W, height: Hh,
    corners: [[v.west, v.north], [v.east, v.north], [v.east, v.south], [v.west, v.south]],
    lines, stats,
  };
}

/** Contour `diff = 0` on a 2× coarser grid, cut at image border and gaps, ≥ 6 vertices, label in the middle. */
function contourLines(diff: Float32Array, v: CapView, snow: SnowGrid): GeoJSON.FeatureCollection {
  const W = v.width, Hh = v.height;
  const w2 = Math.max(2, Math.floor(W / 2)), h2 = Math.max(2, Math.floor(Hh / 2));
  const g = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    let s = 0, n = 0, nan = false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const val = diff[Math.min(Hh - 1, y * 2 + dy) * W + Math.min(W - 1, x * 2 + dx)];
      if (Number.isNaN(val)) nan = true; else { s += val; n++; }
    }
    g[y * w2 + x] = nan || !n ? NaN : s / n;
  }
  const bad = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > w2 - 1 || y > h2 - 1) return true;
    const xa = Math.floor(x), ya = Math.floor(y), xb = Math.min(w2 - 1, Math.ceil(x)), yb = Math.min(h2 - 1, Math.ceil(y));
    return Number.isNaN(g[ya * w2 + xa]) || Number.isNaN(g[ya * w2 + xb]) || Number.isNaN(g[yb * w2 + xa]) || Number.isNaN(g[yb * w2 + xb]);
  };
  const yN = mercY(v.north), yS = mercY(v.south);
  // Coarse cell (x, y) covers fine pixels 2x…2x+1 ⇒ its centre is fine coordinate 2x + 0.5 (pixel centres at i + 0.5).
  const toLonLat = ([x, y]: [number, number]): [number, number] => {
    const fi = 2 * x + 1, fj = 2 * y + 1; // in pixel-edge units (pixel i spans [i, i+1])
    return [v.west + (fi / W) * (v.east - v.west), latOfMercY(yN + (fj / Hh) * (yS - yN))];
  };
  const features: GeoJSON.Feature[] = [];
  const runs: Array<Array<[number, number]>> = [];
  for (const ring of isoRingsGrid(g, w2, h2, 0)) {
    let run: Array<[number, number]> = [];
    const flush = () => {
      if (run.length >= 6) {
        const coords = run.map(toLonLat);
        runs.push(coords);
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
      }
      run = [];
    };
    for (const p of ring) { if (bad(p[0], p[1])) flush(); else run.push(p); }
    flush();
  }
  // Labels as points at the middle of the longest runs: in alpine terrain the line winds too much for a label along it.
  runs.sort((a, b) => b.length - a.length);
  for (const coords of runs.slice(0, SK_LABEL_POINTS)) {
    const [mlon, mlat] = coords[Math.floor(coords.length / 2)];
    const s = snowAt(snow, mlat, mlon);
    if (s) features.push({ type: 'Feature', properties: { label: fmtSnowLine(s.mid, s.half) }, geometry: { type: 'Point', coordinates: [mlon, mlat] } });
  }
  return { type: 'FeatureCollection', features };
}
