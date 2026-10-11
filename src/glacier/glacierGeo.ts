/**
 * GL-4 — small pure geometry of the sheet map: bounding box, clipping at a meridian (the compare slider shows the earlier outline on one side
 * of the divider, the current one on the other), the snow zone as a pixel image (above / below the satellite snow line, from the elevation grid of the
 * static tree). No map, no network; the canvas is only touched in `renderSnowZone`.
 */
import { demDecode, demSample, type GlacierDemGrid } from './glacierSatContract';

type Ring = [number, number][];
type Geom = GeoJSON.Polygon | GeoJSON.MultiPolygon;
const polys = (g: GeoJSON.Geometry): number[][][][] => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

export function bboxOf(g: GeoJSON.Geometry): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polys(g)) for (const ring of p) for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/** Sutherland–Hodgman against the half plane `lon ≤ lng` (`keep = 'west'`) or `lon ≥ lng` (`'east'`) — enough for the fill of an outline. */
function clipRing(ring: Ring, lng: number, keep: 'west' | 'east'): Ring {
  const inside = (x: number) => (keep === 'west' ? x <= lng : x >= lng);
  const out: Ring = [];
  const n = ring.length - 1;   // the ring is closed: last = first
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[i + 1];
    const ia = inside(a[0]), ib = inside(b[0]);
    const cross = (): [number, number] => { const t = (lng - a[0]) / (b[0] - a[0]); return [lng, a[1] + t * (b[1] - a[1])]; };
    if (ia && ib) out.push(b);
    else if (ia && !ib) out.push(cross());
    else if (!ia && ib) { out.push(cross()); out.push(b); }
  }
  if (out.length < 3) return [];
  out.push(out[0]);
  return out;
}
/** The part of a (multi)polygon on one side of a meridian; `null` when nothing is left. */
export function clipAtLng(g: GeoJSON.Geometry, lng: number, keep: 'west' | 'east'): Geom | null {
  const parts: number[][][][] = [];
  for (const p of polys(g)) {
    const rings = p.map((r) => clipRing(r as Ring, lng, keep)).filter((r) => r.length >= 4);
    if (rings.length && p[0] && clipRing(p[0] as Ring, lng, keep).length >= 4) parts.push(rings);
  }
  if (!parts.length) return null;
  return parts.length === 1 ? { type: 'Polygon', coordinates: parts[0] } : { type: 'MultiPolygon', coordinates: parts };
}

export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const latOfMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);

export interface SnowZone {
  /** `[west, north]`, `[east, north]`, `[east, south]`, `[west, south]` — MapLibre image-source order. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  width: number; height: number;
  /** RGBA pixels, row 0 = north. */
  data: Uint8ClampedArray;
  /** Share of the glacier's pixels at or above the snow line (area share, equal-area in a local frame). */
  snowShare: number;
}
export const SNOW_ZONE_RGBA = { snow: [255, 255, 255, 214], band: [226, 238, 244, 200], ice: [168, 208, 224, 150] } as const;

/**
 * Pixel image of the glacier: snow white above the snow line, a lighter band across the range the scene allows (`lo`…`hi`), ice blue below. The inside
 * test is the polygon itself (even-odd, rasterised on a canvas), the elevation comes from the 3 arc-second-class grid of the static tree
 * (bilinear). Rows follow Web-Mercator so the image sits on the basemap pixel for pixel.
 */
export function renderSnowZone(args: {
  geometry: GeoJSON.Geometry; grid: GlacierDemGrid; sla: number; lo?: number | null; hi?: number | null; maxPx?: number; mask?: (g: GeoJSON.Geometry, w: number, h: number, project: (lon: number, lat: number) => [number, number]) => Uint8Array;
}): SnowZone | null {
  const bb = bboxOf(args.geometry);
  if (!bb) return null;
  const pad = 0.0004;
  const w0 = bb[0] - pad, s0 = bb[1] - pad, e0 = bb[2] + pad, n0 = bb[3] + pad;
  const yN = mercY(n0), yS = mercY(s0);
  // ≈ 12 m per pixel at the glacier's latitude, capped
  const mPerDegLon = 111_320 * Math.cos((((n0 + s0) / 2) * Math.PI) / 180);
  const W = Math.min(args.maxPx ?? 700, Math.max(32, Math.round(((e0 - w0) * mPerDegLon) / 12)));
  const H = Math.min(args.maxPx ?? 700, Math.max(32, Math.round(((n0 - s0) * 111_320) / 12)));
  const project = (lon: number, lat: number): [number, number] => [((lon - w0) / (e0 - w0)) * W, ((yN - mercY(lat)) / (yN - yS)) * H];
  const maskFn = args.mask ?? canvasMask;
  const mask = maskFn(args.geometry, W, H, project);
  const z = demDecode(args.grid);
  const data = new Uint8ClampedArray(W * H * 4);
  const lo = args.lo ?? args.sla, hi = args.hi ?? args.sla;
  let nIn = 0, nSnow = 0;
  for (let r = 0; r < H; r++) {
    const lat = latOfMercY(yN - ((r + 0.5) / H) * (yN - yS));
    for (let c = 0; c < W; c++) {
      if (!mask[r * W + c]) continue;
      const lon = w0 + ((c + 0.5) / W) * (e0 - w0);
      const e = demSample(args.grid, z, lon, lat);
      if (e == null) continue;
      nIn++;
      const k = e >= args.sla ? 'snow' : 'ice';
      if (k === 'snow') nSnow++;
      const col = e >= lo && e <= hi && hi > lo ? SNOW_ZONE_RGBA.band : SNOW_ZONE_RGBA[k];
      const i = (r * W + c) * 4;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = col[3];
    }
  }
  if (!nIn) return null;
  return { coordinates: [[w0, n0], [e0, n0], [e0, s0], [w0, s0]], width: W, height: H, data, snowShare: nSnow / nIn };
}

/** Polygon → mask by canvas fill (even-odd); DOM only. */
function canvasMask(g: GeoJSON.Geometry, w: number, h: number, project: (lon: number, lat: number) => [number, number]): Uint8Array {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  for (const p of polys(g)) {
    ctx.beginPath();
    for (const ring of p) ring.forEach(([x, y], i) => { const [px, py] = project(x, y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.fill('evenodd');
  }
  const img = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = img[i * 4 + 3] > 127 ? 1 : 0;
  return out;
}

/** Pure mask for tests (scan-line, even-odd) — same result as the canvas mask up to the edge pixels. */
export function polygonMask(g: GeoJSON.Geometry, w: number, h: number, project: (lon: number, lat: number) => [number, number]): Uint8Array {
  const out = new Uint8Array(w * h);
  const edges: Array<[number, number, number, number]> = [];
  for (const p of polys(g)) for (const ring of p) for (let i = 0; i + 1 < ring.length; i++) { const a = project(ring[i][0], ring[i][1]), b = project(ring[i + 1][0], ring[i + 1][1]); edges.push([a[0], a[1], b[0], b[1]]); }
  for (let r = 0; r < h; r++) {
    const y = r + 0.5;
    const xs: number[] = [];
    for (const [x1, y1, x2, y2] of edges) if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let c = Math.max(0, Math.ceil(xs[k] - 0.5)); c <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); c++) out[r * w + c] = 1;
  }
  return out;
}
