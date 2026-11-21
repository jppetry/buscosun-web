#!/usr/bin/env node
/**
 * Phase GO — builds the small fixture `scripts/lib/fixtures/glacier/stations/glacier-obs-extract.json` for `verify:glacier-stations`:
 * real catalogue entries of a handful of glaciers (unchanged) and the real `obs/v1` entries (catalogue + latest, unchanged) of every
 * 10-min station within 12 km of one of them. The Tirol and South Tyrol answers are stored byte-exact next to it and are not touched.
 *
 *   node scripts/glacier/make-stations-fixture.mjs --catalog=<catalog.json of the static build> --obs-stations=<obs/v1 stations.json> --obs-latest=<obs/v1 latest.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lib', 'fixtures', 'glacier', 'stations', 'glacier-obs-extract.json');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const readJson = (p) => JSON.parse(readFileSync(resolve(String(p)), 'utf8'));
for (const k of ['catalog', 'obs-stations', 'obs-latest']) if (!args[k] || args[k] === true) { console.error(`--${k}=<Datei> fehlt`); process.exit(2); }

/** Glaciers of the extract: Tirol stations, a South Tyrol station across the ridge, TAWES, SwissMetNet, DWD — and four without any station in range. */
const IDS = [
  'gl_at_alpeiner-ferner-3055', 'gl_at_hintereisferner-mit-toteis', 'gl_at_gaissberg-ferner', 'gl_at_hallstaetter-gletscher', 'gl_de_noerdlicher-schneeferner',
  'gl_ch_breithorngletscher-zermatt', 'gl_at_goldbergkees-untere-teile', 'gl_ch_grosser-aletschgletscher', 'gl_at_grosselend-kees', 'gl_de_blaueis',
];
const catalog = readJson(args.catalog), obsCat = readJson(args['obs-stations']), obsLatest = readJson(args['obs-latest']);
const byId = new Map(catalog.glaciers.map((g) => [g.id, g]));
const missing = IDS.filter((id) => !byId.has(id));
if (missing.length) { console.error(`nicht im Katalog: ${missing.join(', ')}\nÄhnliche: ${catalog.glaciers.filter((g) => missing.some((m) => g.id.includes(m.split('_')[2].split('-')[0]))).map((g) => g.id).slice(0, 40).join(' ')}`); process.exit(1); }
const glaciers = IDS.map((id) => byId.get(id));
const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.sqrt(x)); };
const stations = obsCat.stations.filter((s) => (s.networks ?? []).some((n) => ['dwd10', 'tawes', 'smn', 'smnp'].includes(n)) && glaciers.some((g) => km(g.lat, g.lon, s.lat, s.lon) <= 12));
const latest = Object.fromEntries(stations.filter((s) => obsLatest.stations[s.id]).map((s) => [s.id, obsLatest.stations[s.id]]));
const doc = {
  note: `GO fixture: real excerpt — ${glaciers.length} glaciers of the catalogue of build ${catalog.build} and the ${stations.length} 10-min stations of buscosun-data obs/v1 within 12 km of one of them (stations.json built ${obsCat.builtAt}, latest.json built ${obsLatest.builtAt}); entries unchanged`,
  catalog: { schema: catalog.schema, kind: catalog.kind, build: catalog.build, builtAt: catalog.builtAt, glaciers },
  obs: {
    catalog: { schema: obsCat.schema, kind: obsCat.kind, builtAt: obsCat.builtAt, count: stations.length, idRule: obsCat.idRule, stations },
    latest: { schema: obsLatest.schema, kind: obsLatest.kind, builtAt: obsLatest.builtAt, count: Object.keys(latest).length, stations: latest },
  },
};
// Phase GI: `--outlines=<dir with <region>-L1.json of the same build>` writes ONLY the outline extract (the features of the same
// glaciers, unchanged, in the shape of the real files) and leaves the extract above as it is.
if (args.outlines && args.outlines !== true) {
  const OUT2 = join(HERE, '..', 'lib', 'fixtures', 'glacier', 'stations', 'glacier-outline-extract.json');
  const files = {};
  for (const region of [...new Set(glaciers.map((g) => g.region))].sort()) {
    const f = readJson(join(String(args.outlines), `${region}-L1.json`));
    const features = f.features.filter((x) => IDS.includes(x.properties.id));
    files[region] = { ...f, features };
  }
  const n = Object.values(files).reduce((a, f) => a + f.features.length, 0);
  if (n !== IDS.length) { console.error(`Umrisse: ${n} von ${IDS.length} Gletschern gefunden`); process.exit(1); }
  writeFileSync(OUT2, JSON.stringify({ note: `GI fixture: real excerpt — the L1 outlines (static build ${catalog.build}) of the ${IDS.length} glaciers of glacier-obs-extract.json, features unchanged, one entry per region file`, build: catalog.build, files }) + '\n');
  console.log(`${OUT2}: ${n} Umrisse in ${Object.keys(files).length} Regionsdateien`);
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log(`${OUT}: ${glaciers.length} Gletscher, ${stations.length} Stationen, ${Object.keys(latest).length} mit Werten`);
