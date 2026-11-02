/**
 * Builds `scripts/seo/data/dach-admin1.json`: the 51 first-level regions of DE (16 Länder), AT (9 Länder) and CH (26 cantons)
 * as simplified polygons, for the Waldbrand region pages (Phase WBS, `audit/seo-waldbrand.md` §3 D3).
 *
 * Source: Natural Earth 10 m "Admin 1 – States, Provinces" (public domain, https://www.naturalearthdata.com/about/terms-of-use/).
 * The input file is NOT in the repo (40 MB); fetch it once and pass its path:
 *
 *   git clone --filter=blob:none --no-checkout --depth 1 https://github.com/nvkelso/natural-earth-vector.git ne
 *   (cd ne && git sparse-checkout set --no-cone /geojson/ne_10m_admin_1_states_provinces.geojson && git checkout)
 *   node scripts/seo/build-dach-admin1.mjs ne/geojson/ne_10m_admin_1_states_provinces.geojson
 *
 * Used at build time only (point-in-polygon for the season index, outlines on the pages); never shipped to the app bundle.
 * Natural Earth borders are generalised to roughly a kilometre — the pages say so.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSlug } from './places.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'scripts', 'seo', 'data', 'dach-admin1.json');
const input = process.argv[2];
if (!input) { console.error('usage: node scripts/seo/build-dach-admin1.mjs <ne_10m_admin_1_states_provinces.geojson>'); process.exit(1); }

const COUNTRY = { DEU: 'DE', AUT: 'AT', CHE: 'CH' };
/** Simplification tolerance in degrees (~200 m) — far below Natural Earth's own generalisation. */
const TOL = 0.002;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** Douglas–Peucker on a closed ring (keeps first/last point). */
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1; keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0 && bestD > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

const ne = JSON.parse(readFileSync(input, 'utf8'));
const regions = [];
for (const f of ne.features) {
  const p = f.properties;
  const country = COUNTRY[p.adm0_a3];
  if (!country) continue;
  const name = String(p.name_de || p.name).replace(/^Kanton /, '').replace(/^Freie Hansestadt /, '');
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  const polygons = polys.map((poly) => poly.map((ring) => simplify(ring, TOL).map(([x, y]) => [r4(x), r4(y)])));
  regions.push({ iso: p.iso_3166_2, country, name, slug: toSlug(name), wikidata: p.wikidataid || null, polygons });
}
regions.sort((a, b) => (a.country === b.country ? a.name.localeCompare(b.name, 'de') : a.country.localeCompare(b.country)));
const want = { DE: 16, AT: 9, CH: 26 };
for (const [c, n] of Object.entries(want)) {
  const got = regions.filter((r) => r.country === c).length;
  if (got !== n) { console.error(`[admin1] ${c}: ${got} Regionen statt ${n}`); process.exit(1); }
}
const out = {
  source: 'Natural Earth 10 m Admin 1 – States, Provinces (public domain), nvkelso/natural-earth-vector',
  license: 'public domain — https://www.naturalearthdata.com/about/terms-of-use/',
  simplifiedDeg: TOL,
  regions,
};
writeFileSync(OUT, JSON.stringify(out), 'utf8');
const pts = regions.reduce((s, r) => s + r.polygons.flat().reduce((t, ring) => t + ring.length, 0), 0);
console.log(`[admin1] ${regions.length} Regionen, ${pts} Punkte → ${OUT}`);
