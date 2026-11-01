#!/usr/bin/env node
/**
 * Bringt die Gletscher-Einträge von `data/place-modules.json` auf den Stand des veröffentlichten Katalogs (audit/seo-nischen.md §4).
 * Die Datei stammt noch aus dem Build vor dem GLIMS-Umweg (E-GL-17): 15 Schweizer Einträge hatten ein anderes Bezugsjahr oder eine
 * andere Fläche, einer keinen Namen. Fläche, Jahr, Quelle und Name kommen hier aus `glacier/v1/static/<build>/catalog.json`;
 * Einträge ohne Katalogzeile oder unter der Mindestfläche der Ortsblöcke fallen weg. Rechnet sonst nichts neu.
 *   node scripts/seo/refresh-place-glaciers.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'place-modules.json');
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data';
const MIN_KM2 = 0.5; // MODULES.glacierMinKm2 (placeRules.mjs)

const index = await (await fetch(`${RAW}/main/glacier/v1/index.json`)).json();
const build = index.static.build;
const res = await fetch(`${RAW}/glacier/glacier/v1/static/${build}/catalog.json`);
if (!res.ok) throw new Error(`Katalog ${build}: HTTP ${res.status}`);
const cat = await res.json();
const rows = cat.glaciers ?? cat.items ?? cat;
const byId = new Map((Array.isArray(rows) ? rows : Object.values(rows)).map((g) => [g.id, g]));

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const places = data.places ?? data;
let kept = 0, changed = 0, dropped = 0;
for (const p of Object.values(places)) {
  if (!p.glaciers) continue;
  p.glaciers = p.glaciers.flatMap((g) => {
    const c = byId.get(g.id);
    if (!c || !c.name || c.area.km2 < MIN_KM2) { dropped++; return []; }
    const next = { ...g, name: c.name, areaKm2: Math.round(c.area.km2 * 100) / 100, areaYear: c.area.refYear, areaSource: c.area.source };
    if (JSON.stringify(next) !== JSON.stringify(g)) changed++;
    kept++;
    return [next];
  });
  if (!p.glaciers.length) delete p.glaciers;
}
data.glacierBuild = build;
writeFileSync(FILE, JSON.stringify(data) + '\n');
console.log(`[glaciers] Katalog ${build}: ${kept} Einträge, ${changed} geändert, ${dropped} entfernt`);
