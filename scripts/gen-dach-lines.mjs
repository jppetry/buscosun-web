/**
 * gen-dach-lines.mjs — writes `public/countries/dach-lines.json`: roads, rivers and lakes for the DACH map behind the
 * start page (`src/DachMapBackground.tsx`). Source: Natural Earth 1:10m (public domain, naturalearthdata.com) —
 * symmetric for DE, AT and CH, no licence condition.
 *
 * Inputs are the Natural Earth GeoJSON files (github.com/nvkelso/natural-earth-vector, folder `geojson/`), passed as a
 * directory: ne_10m_roads, ne_10m_rivers_lake_centerlines, ne_10m_rivers_europe, ne_10m_lakes, ne_10m_lakes_europe.
 *
 *   node scripts/gen-dach-lines.mjs --ne=<dir with the NE geojson files>
 *
 * Output: every line or ring as a flat array of integer thousandths of a degree [lon, lat, lon, lat, …], kept when one
 * point lies inside the frame, Douglas–Peucker with TOL°. `roads.major` = NE type "Major Highway", `roads.minor` =
 * "Secondary Highway"; rivers from both river files (the Europe file adds the smaller rivers); lakes from both lake files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DACH_LINES_FILE = 'public/countries/dach-lines.json';
/** Frame of the start-page map (DachMapBackground: LON0…LON1, LAT0…LAT1). */
const FRAME = { lon0: 4.0, lon1: 19.4, lat0: 45.0, lat1: 54.9 };
const TOL = 0.008;

const neDir = process.argv.find((a) => a.startsWith('--ne='))?.slice(5);
if (!neDir) { console.error('usage: node scripts/gen-dach-lines.mjs --ne=<dir>'); process.exit(2); }
const load = (name) => JSON.parse(readFileSync(join(neDir, `${name}.geojson`), 'utf8')).features;

const inFrame = ([lon, lat]) => lon >= FRAME.lon0 && lon <= FRAME.lon1 && lat >= FRAME.lat0 && lat <= FRAME.lat1;

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Lines (LineString/MultiLineString) or rings (Polygon/MultiPolygon outer rings) of a feature. */
function parts(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'LineString': return [geom.coordinates];
    case 'MultiLineString': return geom.coordinates;
    case 'Polygon': return [geom.coordinates[0]];
    case 'MultiPolygon': return geom.coordinates.map((p) => p[0]);
    default: return [];
  }
}

function collect(features, pick = () => true) {
  const out = [];
  for (const f of features) {
    if (!pick(f.properties ?? {})) continue;
    for (const line of parts(f.geometry)) {
      if (!line.some(inFrame)) continue;
      const s = dp(line, TOL);
      if (s.length < 2) continue;
      out.push(s.flatMap(([lon, lat]) => [Math.round(lon * 1000), Math.round(lat * 1000)]));
    }
  }
  return out;
}

const roads = load('ne_10m_roads');
const doc = {
  product: 'dach-lines',
  source: 'Natural Earth 1:10m — roads, rivers_lake_centerlines, rivers_europe, lakes, lakes_europe',
  license: 'public domain (naturalearthdata.com)',
  unit: 'thousandths of a degree, flat [lon, lat, …]',
  tol: TOL,
  frame: FRAME,
  roads: {
    major: collect(roads, (p) => p.type === 'Major Highway'),
    minor: collect(roads, (p) => p.type === 'Secondary Highway'),
  },
  rivers: [...collect(load('ne_10m_rivers_lake_centerlines')), ...collect(load('ne_10m_rivers_europe'))],
  lakes: [...collect(load('ne_10m_lakes')), ...collect(load('ne_10m_lakes_europe'))],
};
const text = JSON.stringify(doc);
writeFileSync(join(ROOT, DACH_LINES_FILE), text);
console.log(`${DACH_LINES_FILE}: ${(text.length / 1024).toFixed(1)} KB · roads ${doc.roads.major.length}+${doc.roads.minor.length} · rivers ${doc.rivers.length} · lakes ${doc.lakes.length}`);
