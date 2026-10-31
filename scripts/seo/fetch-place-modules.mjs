/**
 * Einmal-Werkzeug: Modul-Bezüge je Ortsseite (Seewetter, Pegel, Autobahn, Gletscher).
 *
 * Läuft NICHT im Build. Es liest die Kataloge der Daten-Repos von buscosun (lokale Klone, Standard
 * `../buscosun-data`, `../buscosun-glacier`) und schreibt `scripts/seo/data/place-modules.json`: je Ort nur
 * die Beziehung, die die Relevanzregel erlaubt (`placeRules.mjs`, Logik in `lib/moduleRelations.mjs`).
 * Ob ein Block auf der Seite erscheint, entscheidet erst `placeContent.mjs` anhand von Flags und
 * Indexierbarkeit der Zielseite.
 *
 *  sea       nächster Küsten-Spot (Nord-/Ostsee, nicht nur „revier"), nächster BSH-Pegel. Quellen: DWD (Seegebiete,
 *            © BKG), BSH (CC BY 4.0).
 *  road      Autobahn-Korridor und nächste Glättemeldeanlage (nur DE). Quellen: DWD SWIS (GeoNutzV), BKG DLM250.
 *  glaciers  Gletscher ab 0,5 km² (höchstens fünf). Quellen: AGI 5 (AT), RGI/GI4 (DE), GLAMOS SGI 2016 (CH; offen).
 *
 * Aufruf: node scripts/seo/fetch-place-modules.mjs [--data=../buscosun-data] [--glacier=../buscosun-glacier]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './places.mjs';
import { loadModuleCatalogs, relationsFor } from './lib/moduleRelations.mjs';
import { MODULES } from './placeRules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const cat = loadModuleCatalogs(resolve(HERE, '..', '..', args.data || '../buscosun-data'), resolve(HERE, '..', '..', args.glacier || '../buscosun-glacier'));

const out = {};
for (const p of PLACES) { const rec = relationsFor(p, cat); if (Object.keys(rec).length) out[p.slug] = rec; }
mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(join(HERE, 'data', 'place-modules.json'), JSON.stringify({
  schema: 1, built: new Date().toISOString().slice(0, 10), glacierBuild: cat.glacBuild, rules: MODULES, places: out,
}) + '\n', 'utf8');
const n = (k) => Object.values(out).filter((r) => r[k]).length;
console.log(`[modules] Orte mit sea ${n('sea')}, road ${n('road')}, glaciers ${n('glaciers')} → scripts/seo/data/place-modules.json`);
