/**
 * BKG DLM250 coastline around a point (V-SW-9 reference, E-SW-31 b positions): the water areas AX_Meer 44007,
 * AX_Hafenbecken 44005, AX_Fliessgewaesser 44001, AX_StehendesGewaesser 44006 (dl-de/by-2.0, © GeoBasis-DE / BKG).
 *
 * DLM files: WFS https://sgx.geodatenzentrum.de/wfs_dlm250, TYPENAMES=dlm250:objart_<n>_f, OUTPUTFORMAT=application/json,
 * SRSNAME=EPSG:4326, BBOX=6.2,53.2,14.6,55.2,EPSG:4326 (lon/lat order — lat/lon returns 0 features), COUNT=20000.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DLM_TYPES = ['44007', '44005', '44001', '44006'];
export const DLM_ATTRIBUTION = 'Küstenlinie: © GeoBasis-DE / BKG (DLM250), dl-de/by-2.0';
const R = Math.PI / 180;

/** Polygons of the four water types from `<dir>/dlm-<type>.json`, with bounding boxes. */
export function loadDlm(dir) {
  const polys = [];
  for (const t of DLM_TYPES) {
    for (const f of JSON.parse(readFileSync(join(String(dir), `dlm-${t}.json`), 'utf8')).features) {
      const mp = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of mp) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        polys.push({ t, rings, bb: [x0, y0, x1, y1] });
      }
    }
  }
  return polys;
}

const inRings = (rings, x, y) => {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** True when (lat, lon) lies in one of the DLM water polygons. */
export function dlmWet(polys, lat, lon) {
  return polys.some((p) => lat >= p.bb[1] && lat <= p.bb[3] && lon >= p.bb[0] && lon <= p.bb[2] && inRings(p.rings, lon, lat));
}

/** DLM coastline segments within `radiusKm` of a point, local km, seaward unit normals; water–water edges dropped. */
export function dlmSegments(polys, lat, lon, radiusKm = 4) {
  const kx = 111.32 * Math.cos(lat * R), ky = 110.574, dLon = radiusKm / kx, dLat = radiusKm / ky;
  const near = polys.filter((p) => p.bb[0] <= lon + dLon && p.bb[2] >= lon - dLon && p.bb[1] <= lat + dLat && p.bb[3] >= lat - dLat);
  const wet = (lo, la) => near.some((p) => la >= p.bb[1] && la <= p.bb[3] && lo >= p.bb[0] && lo <= p.bb[2] && inRings(p.rings, lo, la));
  const segs = [];
  let dropped = 0;
  for (const p of near) for (const ring of p.rings) for (let k = 1; k < ring.length; k++) {
    const [ax, ay] = ring[k - 1], [bx, by] = ring[k];
    const P = [(ax - lon) * kx, (ay - lat) * ky], Q = [(bx - lon) * kx, (by - lat) * ky];
    if (Math.min(Math.hypot(...P), Math.hypot(...Q)) > radiusKm + 1) continue;
    const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy);
    if (!len) continue;
    const nx = -dy / len, ny = dx / len, mx = (ax + bx) / 2, my = (ay + by) / 2, e = 0.015;
    const left = wet(mx + (nx * e) / kx, my + (ny * e) / ky), right = wet(mx - (nx * e) / kx, my - (ny * e) / ky);
    if (left === right) { dropped++; continue; } // water on both sides (Meer | Hafenbecken | river) — not coast
    segs.push({ p: P, q: Q, len, nx: left ? nx : -nx, ny: left ? ny : -ny, t: p.t });
  }
  return { segs, dropped, kx, ky };
}
