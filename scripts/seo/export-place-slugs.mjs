/**
 * Exportiert die kuratierte Ortsliste als kompaktes JSON für die App
 * (`src/router/placeSlugs.json`: [slug, name, lat, lon] je Ort), damit der
 * Punktforecast auf die statische Ortsseite verlinken kann (SEO/GEO 2026, E2).
 * Nach jeder Änderung an `places.mjs` ausführen: npm run seo:places
 * `verify-routing` prüft, dass die Datei mit `PLACES` übereinstimmt.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './places.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'router', 'placeSlugs.json');
const rows = PLACES.map((p) => [p.slug, p.name, +p.lat.toFixed(3), +p.lon.toFixed(3)]);
writeFileSync(out, JSON.stringify(rows), 'utf8');
console.log(`[seo] ${rows.length} Orte → src/router/placeSlugs.json`);
