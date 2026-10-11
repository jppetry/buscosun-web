/**
 * Small raster helpers for the glacier producers: polygon -> mask on a COG grid window, 2x2 block mean.
 * Pure JS, no dependencies. Coordinates: GeoJSON lon/lat in, pixel grid of an asset (see s2cog.mjs `assetGeo`) out.
 */
import { lonLatToPx } from './s2cog.mjs';

/** GeoJSON Polygon|MultiPolygon -> array of polygons, each an array of rings, each ring [[lon, lat], ...]. */
export function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error('geometry type ' + geometry.type);
}

/** Fractional pixel bbox of a geometry on an asset grid. */
export function pixelBBox(geo, geometry) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [lon, lat] of poly[0]) {
      const p = lonLatToPx(geo, lon, lat);
      if (!p) continue;
      if (p.px < x0) x0 = p.px; if (p.px > x1) x1 = p.px;
      if (p.py < y0) y0 = p.py; if (p.py > y1) y1 = p.py;
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Even-odd scanline rasterisation of the polygon(s) into a w x h mask whose top-left pixel is (px0, py0) of the asset
 * grid. A pixel is inside when its CENTRE is inside (holes honoured through the even-odd rule over all rings).
 */
export function rasterizeMask(geo, geometry, px0, py0, w, h) {
  const mask = new Uint8Array(w * h);
  const edges = [];
  for (const poly of polygonsOf(geometry)) {
    for (const ring of poly) {
      const pts = ring.map(([lon, lat]) => lonLatToPx(geo, lon, lat));
      if (pts.some((p) => !p)) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a.py === b.py) continue;
        edges.push(a.py < b.py ? [a.px, a.py, b.px, b.py] : [b.px, b.py, a.px, a.py]);
      }
    }
  }
  for (let r = 0; r < h; r++) {
    const y = py0 + r + 0.5;
    const xs = [];
    for (const [ax, ay, bx, by] of edges) {
      if (y >= ay && y < by) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] - px0 - 0.5)), c1 = Math.min(w - 1, Math.ceil(xs[k + 1] - px0 - 0.5) - 1);
      for (let c = c0; c <= c1; c++) mask[r * w + c] = 1;
    }
  }
  return mask;
}

/** 2x2 block mean of a (w x h) array into ((w/2) x (h/2)); w, h even. Values stay in input units. */
export function halve(data, w, h) {
  const w2 = w >> 1, h2 = h >> 1, out = new Float32Array(w2 * h2);
  for (let r = 0; r < h2; r++) {
    for (let c = 0; c < w2; c++) {
      const i = 2 * r * w + 2 * c;
      out[r * w2 + c] = (data[i] + data[i + 1] + data[i + w] + data[i + w + 1]) / 4;
    }
  }
  return { data: out, w: w2, h: h2 };
}
