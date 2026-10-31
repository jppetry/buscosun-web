/**
 * Einmal-Werkzeug: wandelt die freigegebene Kandidatenliste (`data/new-places-candidates.csv`, Phase 2) in
 * `data/places-2.json` um — die Ortsliste der zweiten Welle, die `places.mjs` als `PLACES_NEW` einliest.
 *
 * Zeilen, die in `data/places-2-excluded.txt` stehen (ein Slug je Zeile), werden ausgelassen: So streicht man
 * Orte, ohne die CSV von Hand zu verändern.
 *
 * Aufruf: node scripts/seo/build-places-2.mjs
 * Quelle der Ortsliste: GeoNames (CC BY 4.0), siehe select-new-places.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const D = join(dirname(fileURLToPath(import.meta.url)), 'data');
const csv = readFileSync(join(D, 'new-places-candidates.csv'), 'utf8').replace(/^﻿/, '').trim().split('\n').map((l) => l.split(';'));
const h = Object.fromEntries(csv[0].map((x, i) => [x, i]));
const excluded = new Set(existsSync(join(D, 'places-2-excluded.txt')) ? readFileSync(join(D, 'places-2-excluded.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : []);
const rows = csv.slice(1).filter((r) => !excluded.has(r[h.Slug])).map((r) => [
  r[h.Slug], r[h.Name], r[h.Region], Number(r[h.Breite]), Number(r[h.Länge]), Number(r[h.Höhe_m]), r[h.Land],
]);
writeFileSync(join(D, 'places-2.json'), JSON.stringify({
  schema: 1, fields: ['slug', 'name', 'region', 'lat', 'lon', 'ele', 'country'],
  source: 'GeoNames (https://www.geonames.org/), CC BY 4.0', places: rows,
}) + '\n', 'utf8');
console.log(`[places-2] ${rows.length} Orte (${excluded.size} ausgeschlossen) → data/places-2.json`);
