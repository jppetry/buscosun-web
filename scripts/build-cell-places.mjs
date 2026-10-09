/**
 * build-cell-places.mjs — place list for "Betroffene Orte und Ankunftsfenster" (phase ZO, `audit/zell-orte.md` E-ZO-2/E-ZO-5).
 *
 *   node scripts/build-cell-places.mjs            # writes src/radar/cellPlacesDach.json
 *   node scripts/build-cell-places.mjs --check    # exit 1 if the file is not what the source gives
 *
 * Offline and deterministic: a subset of `public/fire/places-dach.json` (GeoNames, CC BY 4.0, built by
 * `scripts/build-places-dach.mjs`) with at least CELL_PLACES_MIN_POP inhabitants. Rows `[lat, lon, name, cc, pop]`,
 * largest first. The app loads the file lazily as a hashed asset (`?url`), only when cells are on the map.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'fire', 'places-dach.json');
const OUT = join(ROOT, 'src', 'radar', 'cellPlacesDach.json');
/** E-ZO-2 (Jan 09.10.2026): places from 5 000 inhabitants. */
export const CELL_PLACES_MIN_POP = 5000;

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const rows = src.places
  .filter((p) => p[5] >= CELL_PLACES_MIN_POP)
  .map((p) => [p[0], p[1], p[2], p[4], p[5]])
  .sort((a, b) => b[4] - a[4] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
const out = {
  source: src.source,
  note: `Subset of public/fire/places-dach.json (${src.stamp}): places with at least ${CELL_PLACES_MIN_POP} inhabitants, `
    + 'rows [lat, lon, name, cc, pop], largest first. Built by scripts/build-cell-places.mjs.',
  stamp: src.stamp,
  minPop: CELL_PLACES_MIN_POP,
  places: rows,
};
const text = JSON.stringify(out) + '\n';
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(OUT, 'utf8'); } catch { /* missing */ }
  if (cur !== text) { console.error(`✗ ${OUT} is stale — run node scripts/build-cell-places.mjs`); process.exit(1); }
  console.log(`✓ ${OUT} up to date (${rows.length} places)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${rows.length} places (≥ ${CELL_PLACES_MIN_POP}), ${(text.length / 1024).toFixed(0)} KB`);
}
