#!/usr/bin/env node
/**
 * Phase GN, step 0 — measurements for `audit/gletscher-snowgrid.md` §2 (run BEFORE the product code existed). Read-only, prints
 * markdown. Which grid cells of SNOWGRID-CL belong to which Austrian glacier, and what one day and the reference period cost.
 *
 *   node audit/gletscher-snowgrid/schritt0.mjs --catalog=<static catalog.json> --outlines=<dir with <region>-L1.json> --grid=<grid answer(s), comma-separated>
 *
 * `--grid` = GeoJSON answers of the grid API for ONE day (`…/grid/historical/snowgrid_cl-v2-1d-1km?parameters=snow_depth&start=<day>
 * &end=<day>&bbox=<s,w,n,e>&output_format=geojson`) that together cover the Austrian glaciers.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const readJson = (p) => JSON.parse(readFileSync(resolve(String(p)), 'utf8'));
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const R = Math.PI / 180;
const km = (la1, lo1, la2, lo2) => { const a = Math.sin(((la2 - la1) * R) / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.sqrt(a)); };
const inRing = (ring, lon, lat) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPolys = (polys, lon, lat) => polys.some((poly) => inRing(poly[0], lon, lat) && !poly.slice(1).some((h) => inRing(h, lon, lat)));

const glaciers = readJson(args.catalog).glaciers.filter((g) => g.country === 'AT');
const outline = new Map();
for (const r of [...new Set(glaciers.map((g) => g.region))]) for (const f of readJson(join(String(args.outlines), `${r}-L1.json`)).features) outline.set(f.properties.id, f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
// grid cells: [lon, lat, value]
const cells = new Map();
let day = null;
for (const f of String(args.grid).split(',')) {
  const d = readJson(f); day = d.timestamps?.[0] ?? day;
  for (const x of d.features) { const [lon, lat] = x.geometry.coordinates; cells.set(`${lat.toFixed(5)},${lon.toFixed(5)}`, [lon, lat, x.properties.parameters.snow_depth.data[0]]); }
}
const list = [...cells.values()];
console.log(`Rasterantwort für ${day}: ${list.length} Zellen, davon ohne Wert ${list.filter((c) => c[2] == null).length}; Österreichs Gletscher im Katalog: ${glaciers.length}\n`);

const rows = glaciers.map((g) => {
  const polys = outline.get(g.id);
  // candidates within ~12 km of the catalogue point
  const near = list.filter((c) => Math.abs(c[1] - g.lat) < 0.12 && Math.abs(c[0] - g.lon) < 0.18);
  const inside = polys ? near.filter((c) => inPolys(polys, c[0], c[1])) : [];
  let nearest = null;
  for (const c of near) { const d = km(g.lat, g.lon, c[1], c[0]); if (!nearest || d < nearest.d) nearest = { c, d }; }
  return { g, inside, nearest };
});
const bins = { 'keine Zelle mit Mittelpunkt im Umriss (nächste Zelle zum Katalogpunkt)': 0, '1 Zelle': 0, '2–5 Zellen': 0, '6–20 Zellen': 0, 'über 20 Zellen': 0 };
for (const r of rows) { const n = r.inside.length; bins[n === 0 ? 'keine Zelle mit Mittelpunkt im Umriss (nächste Zelle zum Katalogpunkt)' : n === 1 ? '1 Zelle' : n <= 5 ? '2–5 Zellen' : n <= 20 ? '6–20 Zellen' : 'über 20 Zellen']++; }
console.log('#### Zellen je Gletscher (Mittelpunkt der 1-km-Zelle im L1-Umriss)\n');
console.log(table(['Zellen', 'Gletscher'], Object.entries(bins)));
const noCell = rows.filter((r) => !r.inside.length);
const nd = noCell.map((r) => r.nearest?.d ?? Infinity).sort((a, b) => a - b);
console.log(`\nGletscher ohne Zelle im Umriss: ${noCell.length}; Abstand der nächsten Zelle zum Katalogpunkt: Median ${nd[nd.length >> 1]?.toFixed(2)} km, größter ${nd[nd.length - 1]?.toFixed(2)} km; über 0,75 km (außerhalb des Gitters oder am Rand): ${nd.filter((d) => d > 0.75).length}`);
const far = noCell.filter((r) => (r.nearest?.d ?? Infinity) > 0.75).map((r) => `${r.g.id} (${r.nearest ? r.nearest.d.toFixed(2) + ' km' : 'keine Zelle'})`);
if (far.length) console.log(`  ${far.join(', ')}`);
const used = new Set();
for (const r of rows) for (const c of r.inside.length ? r.inside : r.nearest && r.nearest.d <= 0.75 ? [r.nearest.c] : []) used.add(`${c[1].toFixed(5)},${c[0].toFixed(5)}`);
const nullUsed = [...used].filter((k) => cells.get(k)[2] == null).length;
console.log(`\nVerschiedene Zellen, die mindestens ein Gletscher braucht: **${used.size}** (ohne Wert am Messtag: ${nullUsed}); größter Gletscher: ${rows.slice().sort((a, b) => b.inside.length - a.inside.length).slice(0, 3).map((r) => `${r.g.name} ${r.inside.length}`).join(', ')}`);
const areaSmall = glaciers.filter((g) => g.area?.km2 < 1).length;
console.log(`Gletscher unter 1 km² (eine Zelle = 1 km²): ${areaSmall} von ${glaciers.length}`);
console.log(`\n#### Kosten\n`);
const perDay = used.size * 2, perReq = 150;
console.log(table(['Weg', 'Abrufe', 'Werte', 'Menge'], [
  ['ein Tag über die Zeitreihen-API (alle Zellen, zwei Größen, 150 Punkte je Abruf)', Math.ceil(used.size / perReq), perDay, 'rund 0,2 MB'],
  ['sieben Tage (Nachlesen der letzten Woche)', Math.ceil(used.size / perReq), perDay * 7, 'rund 0,5 MB'],
  ['Referenz 1991–2020 über die Zeitreihen-API (10 958 Tage, eine Größe, 91 Zellen je Abruf = 997 178 Werte)', Math.ceil(used.size / 91), used.size * 10958, `rund ${Math.round((used.size * 10958 * 5) / 1e6)} MB`],
  ['ein Tag aus den Jahresdateien (zwei NetCDF-Dateien des laufenden Jahres)', 2, '—', '17–35 MB je Tag'],
  ['Referenz aus den Jahresdateien (30 Jahre × eine Größe)', 30, '—', 'rund 360 MB'],
]));
const vals = [...used].map((k) => cells.get(k)[2]).filter((v) => v != null).sort((a, b) => a - b);
console.log(`\nSchneehöhe der gebrauchten Zellen am ${day}: Minimum ${vals[0]} m, Median ${vals[vals.length >> 1]} m, 90 % ${vals[Math.floor(vals.length * 0.9)]} m, Maximum ${vals[vals.length - 1]} m; Zellen mit 0 m: ${vals.filter((v) => v === 0).length}`);
const byRegion = {};
for (const r of rows) { const k = r.g.region; (byRegion[k] ??= { n: 0, in: 0, near: 0, none: 0 }); byRegion[k].n++; if (r.inside.length) byRegion[k].in++; else if (r.nearest && r.nearest.d <= 0.75) byRegion[k].near++; else byRegion[k].none++; }
console.log(`\n#### Je Region\n`);
console.log(table(['Region', 'Gletscher', 'mit Zellen im Umriss', 'nächste Zelle', 'außerhalb des Gitters'], Object.entries(byRegion).sort().map(([k, v]) => [k, v.n, v.in, v.near, v.none])));
