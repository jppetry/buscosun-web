/**
 * Phase R250 (`audit/radar-250m.md` §5 R250-4) — switches and geometry of the 250-m tiles for Germany on the client.
 *
 * Pure (no DOM, no maplibre): the verifier reads it headless. With the switch off, `MapView` draws exactly as before
 * Phase R250 (the three native 1-km layers of Phase HD); with it on, the RV ANALYSES (measured frames — now and the
 * look-back, never the extrapolation) are drawn from the 250-m tiles of the mirror wherever the view is zoomed in
 * far enough and the tile is loaded; the 1-km DE layer stays underneath as the named fallback (progressive: it shows
 * first, the tiles replace it per slot as they arrive).
 *
 *   `?hd250=1` on · `?hd250=0` off (beats the store) · else `localStorage.radarhd250` · else `RADAR_HD250_DEFAULT_ON`.
 */

import { de1200Node } from '../sources/radolanGeo';
import { warpMeshFromProjection } from './quadWarpMesh';
import { HD250_TILES_X, HD250_TILES_Y, HD250_TILE_W, HD250_TILE_H, hd250TileFile } from '../sources/radarHd250';
import type { QuadCorners } from './RainLayer';

/** E-R250-1: the 250-m tiles are the normal case; `?hd250=0` is the way back to the 1-km layers of Phase HD. */
export const RADAR_HD250_DEFAULT_ON = true;
/**
 * Below this zoom a 250-m cell is narrower than one screen pixel (z9 ≈ 196 m/px at 50° N) — the 1-km layer carries
 * the picture alone and no tile is requested. `set`: Mercator metres per pixel at z = 156 543 · cos φ / 2^z.
 */
export const RADAR_HD250_MIN_ZOOM = 9;
/** Decoded tiles kept in memory (1,32 MB each): 24 slots × up to 4 visible tiles would be 127 MB — the cache holds the
 *  most recently used 40 (≈ 53 MB) and evicts the oldest. */
export const RADAR_HD250_CACHE_TILES = 40;
/** Parallel tile fetches of one slot. */
export const RADAR_HD250_MAX_PARALLEL = 4;
/** Subdivisions of a tile's warp mesh: a quarter of the DE1200 mesh (352) at the same node spacing. */
export const HD250_TILE_WARP_N = 88;

export function radarHd250FlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('hd250'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarhd250') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return RADAR_HD250_DEFAULT_ON;
}

/** Layer id of tile (tx, ty) — drawn right above the DE 1-km layer of Phase HD. */
export function hd250LayerId(tx: number, ty: number): string { return `precip-rain-hd250-${ty}${tx}`; }
export const HD250_TILE_LIST: readonly { tx: number; ty: number; file: string; id: string }[] = Object.freeze(
  Array.from({ length: HD250_TILES_X * HD250_TILES_Y }, (_, k) => {
    const tx = k % HD250_TILES_X, ty = Math.floor(k / HD250_TILES_X);
    return Object.freeze({ tx, ty, file: hd250TileFile(tx, ty), id: hd250LayerId(tx, ty) });
  }),
);

/** Exact lon/lat of the tile's grid point (u, v): the quarter (tx/4 … (tx+1)/4, ty/4 … (ty+1)/4) of the DE1200 footprint. */
export function hd250TileNode(tx: number, ty: number): (u: number, v: number) => [number, number] {
  return (u, v) => de1200Node((tx + u) / HD250_TILES_X, (ty + v) / HD250_TILES_Y);
}

const meshCache = new Map<string, Float32Array>();
/** Warp mesh of a tile ((N+1)² lon/lat pairs, uv(0,0) = NW), memoised — the RainLayer rebuilds geometry only on a new reference. */
export function hd250TileMesh(tx: number, ty: number): Float32Array {
  const key = `${tx},${ty}`;
  let m = meshCache.get(key);
  if (!m) { m = warpMeshFromProjection(hd250TileNode(tx, ty), HD250_TILE_WARP_N); meshCache.set(key, m); }
  return m;
}

/** The four geo corners [NW, NE, SE, SW] of a tile (for `RainFrameData.corners`). */
export function hd250TileCorners(tx: number, ty: number): QuadCorners {
  const n = hd250TileNode(tx, ty);
  return [n(0, 0), n(1, 0), n(1, 1), n(0, 1)];
}

const bboxCache = new Map<string, [number, number, number, number]>();
/** lon/lat bounding box [west, south, east, north] of a tile, from 9 samples along each edge (the edges are curved). */
export function hd250TileBbox(tx: number, ty: number): [number, number, number, number] {
  const key = `${tx},${ty}`;
  const hit = bboxCache.get(key);
  if (hit) return hit;
  const n = hd250TileNode(tx, ty);
  let w = Infinity, s = Infinity, e = -Infinity, no = -Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    for (const [lon, lat] of [n(t, 0), n(t, 1), n(0, t), n(1, t)]) {
      if (lon < w) w = lon; if (lon > e) e = lon; if (lat < s) s = lat; if (lat > no) no = lat;
    }
  }
  const box: [number, number, number, number] = [w, s, e, no];
  bboxCache.set(key, box);
  return box;
}

/** Tiles whose bounding box intersects the view [west, south, east, north]; empty below `RADAR_HD250_MIN_ZOOM`. */
export function hd250VisibleTiles(view: [number, number, number, number], zoom: number): { tx: number; ty: number }[] {
  if (!(zoom >= RADAR_HD250_MIN_ZOOM)) return [];
  const out: { tx: number; ty: number }[] = [];
  for (const t of HD250_TILE_LIST) {
    const [w, s, e, n] = hd250TileBbox(t.tx, t.ty);
    if (e < view[0] || w > view[2] || n < view[1] || s > view[3]) continue;
    out.push({ tx: t.tx, ty: t.ty });
  }
  return out;
}

/**
 * Ownership mask of a tile from the DE1200 mask of Phase HD (1100 × 1200, 1 = pixel belongs to Germany): each 250-m
 * cell inherits the byte of its 1-km parent — no new geometry, the border is the same one the 1-km layer uses.
 */
export function hd250TileMask(mask1km: Uint8Array, tx: number, ty: number): Uint8Array {
  if (mask1km.length !== 1100 * 1200) throw new Error(`hd250: Maske mit ${mask1km.length} Zellen`);
  const out = new Uint8Array(HD250_TILE_W * HD250_TILE_H);
  for (let y = 0; y < HD250_TILE_H; y++) {
    const j = (ty * HD250_TILE_H + y) >> 2, row = y * HD250_TILE_W, srow = j * 1100;
    for (let x = 0; x < HD250_TILE_W; x++) out[row + x] = mask1km[srow + ((tx * HD250_TILE_W + x) >> 2)];
  }
  return out;
}

/**
 * HD-4 morph on a tile: the 1-km motion field of the DE pair (coarse grid `w × h` over the whole DE1200 frame, values in
 * 1-km texels) cropped to the tile and scaled to 250-m texels (× factor). Bilinear resampling of the coarse field onto a
 * tile-local grid of the same density — no new motion is invented, the field is the one the 1-km layer uses.
 */
export function hd250TileFlow(flow: { u: Float32Array; v: Float32Array; w: number; h: number }, tx: number, ty: number, factor: number): { u: Float32Array; v: Float32Array; w: number; h: number } {
  const w = Math.max(2, Math.ceil(flow.w / HD250_TILES_X) + 1), h = Math.max(2, Math.ceil(flow.h / HD250_TILES_Y) + 1);
  const u = new Float32Array(w * h), v = new Float32Array(w * h);
  const sample = (arr: Float32Array, fx: number, fy: number) => {
    const x = Math.min(flow.w - 1, Math.max(0, fx)), y = Math.min(flow.h - 1, Math.max(0, fy));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(flow.w - 1, x0 + 1), y1 = Math.min(flow.h - 1, y0 + 1);
    const ax = x - x0, ay = y - y0;
    return (arr[y0 * flow.w + x0] * (1 - ax) + arr[y0 * flow.w + x1] * ax) * (1 - ay) + (arr[y1 * flow.w + x0] * (1 - ax) + arr[y1 * flow.w + x1] * ax) * ay;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    // tile-local (i, j) in [0, w−1] × [0, h−1] ↔ coarse-grid coordinate of the DE frame (cell centres)
    const fx = (tx + i / (w - 1)) * (flow.w / HD250_TILES_X) - 0.5, fy = (ty + j / (h - 1)) * (flow.h / HD250_TILES_Y) - 0.5;
    u[j * w + i] = sample(flow.u, fx, fy) * factor;
    v[j * w + i] = sample(flow.v, fx, fy) * factor;
  }
  return { u, v, w, h };
}
