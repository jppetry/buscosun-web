/**
 * Phase SK: which piece of the map the cap image covers and at which DEM zoom — pure (the engine and the verifier use it).
 * A pitched 3D view reports bounds far beyond the screen; the view is clipped to the field domain and to a maximum span
 * around the bounds' centre so the image stays bounded.
 */
import type { CapView } from './capRaster';

/** Domain of the Fusion map field (`CUBE_DOMAIN`, lon 5.5–17.5, lat 45.5–55.5). */
export const SK_DOMAIN = Object.freeze({ west: 5.5, east: 17.5, south: 45.5, north: 55.5 });
export const SK_MAX_SPAN_LON = 6; // set — bounds a pitched 3D view
export const SK_MAX_SPAN_LAT = 4; // set

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/**
 * `opts.pitched`: a pitched map (ZT stage) — the span clamp applies, centred on `opts.center` (the camera's look-at point;
 * the bounds of a pitched map reach far behind it). A flat map (2D) is clipped to the field domain only — the image size
 * (≤ 1024/640 px) and the DEM tile cap already bound the work. Without `opts`: clamp around the bounds' centre.
 */
export function capViewFor(b: { west: number; east: number; north: number; south: number }, cssW: number, _cssH: number, mobile: boolean,
  opts?: { center?: [number, number]; pitched?: boolean }): CapView | null {
  const clamp = opts ? !!opts.pitched : true;
  const cx = opts?.center ? opts.center[0] : (b.west + b.east) / 2, cy = opts?.center ? opts.center[1] : (b.north + b.south) / 2;
  const sx = clamp ? SK_MAX_SPAN_LON / 2 : Infinity, sy = clamp ? SK_MAX_SPAN_LAT / 2 : Infinity;
  const west = Math.max(b.west, cx - sx, SK_DOMAIN.west), east = Math.min(b.east, cx + sx, SK_DOMAIN.east);
  const south = Math.max(b.south, cy - sy, SK_DOMAIN.south), north = Math.min(b.north, cy + sy, SK_DOMAIN.north);
  if (!(east > west) || !(north > south)) return null;
  const maxW = mobile ? 640 : 1024;
  const width = Math.max(64, Math.min(maxW, Math.round(cssW)));
  const lonSpanRad = ((east - west) * Math.PI) / 180;
  const height = Math.max(64, Math.min(maxW, Math.round((width * (mercY(north) - mercY(south))) / lonSpanRad)));
  return { west, east, north, south, width, height };
}

const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * (1 << z);
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); };

export function demTileCount(v: CapView, z: number): number {
  return (Math.floor(lng2x(v.east, z)) - Math.floor(lng2x(v.west, z)) + 1) * (Math.floor(lat2y(v.south, z)) - Math.floor(lat2y(v.north, z)) + 1);
}

/** One DEM zoom above the map zoom, 5…11, lowered until the view needs at most 30 tiles. */
export function demZoomFor(mapZoom: number, v: CapView): number {
  let z = Math.max(5, Math.min(11, Math.round(mapZoom) + 1));
  while (z > 5 && demTileCount(v, z) > 30) z--;
  return z;
}
