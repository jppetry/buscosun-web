/**
 * AW-2 — "Koordinaten außerhalb DE" (station rule `outsideDE`, `src/road/roadContract.ts`): point in the German
 * outline the app already ships (`public/countries/DE.geojson`, Nominatim, polygon_threshold 0.01 ≈ 1 km), copied
 * here because the mirror's sparse clone carries `scripts/ src/` but not `public/`.
 * A point within `toleranceKm` of the border counts as inside: the outline is simplified by ≈ 1 km and border
 * stations (A8 Walserberg, A93 Kiefersfelden) sit right on it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadDeRings(file = join(HERE, 'de-outline.geojson')) {
  const g = JSON.parse(readFileSync(file, 'utf8'));
  const geom = g.geometry ?? g.features?.[0]?.geometry;
  if (!geom) throw new Error('de-outline: keine Geometrie');
  return geom.type === 'MultiPolygon' ? geom.coordinates.map((p) => p[0]) : [geom.coordinates[0]];
}

function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance in km from (lat, lon) to the nearest ring segment (equirectangular, fine at 1–2 km). */
function distToRingsKm(rings, lat, lon) {
  const kx = 111.2 * Math.cos((lat * Math.PI) / 180), ky = 111.2;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * kx, ay = (ring[i - 1][1] - lat) * ky;
      const bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      best = Math.min(best, Math.hypot(px, py));
    }
  }
  return best;
}

/** `(lat, lon) => boolean` for the contract's `inDE`. */
export function makeInDE({ rings = loadDeRings(), toleranceKm = 1.5 } = {}) {
  return (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat < 47 || lat > 55.3 || lon < 5.5 || lon > 15.3) return false;
    if (rings.some((r) => inRing(r, lon, lat))) return true;
    return distToRingsKm(rings, lat, lon) <= toleranceKm;
  };
}
