/**
 * Einmal-Werkzeug: Modul-Bezüge je Ortsseite (Seewetter, Pegel, Autobahn, Gletscher).
 *
 * Läuft NICHT im Build. Es liest die Kataloge der Daten-Repos von buscosun (lokale Klone, Standard
 * `../buscosun-data`, `../buscosun-glacier`) und schreibt `scripts/seo/data/place-modules.json`: je Ort nur
 * die Beziehung, die die Relevanzregel erlaubt. Ob ein Block auf der Seite erscheint, entscheidet erst
 * `placeContent.mjs` anhand von Flags und Indexierbarkeit der Zielseite.
 *
 *  sea       nächster Küsten-Spot (Nord-/Ostsee, nicht nur „revier") bis 20 km, mit Seegebiet und Küstenabschnitt
 *            des DWD; nächster BSH-Pegel bis 20 km. Quellen: DWD (Seegebiete/CAP-Warngebiete, © BKG), BSH (CC BY 4.0).
 *  road      Autobahn-Korridor bis 10 km und nächste Glättemeldeanlage (Autobahn) bis 15 km. DE.
 *            Quellen: DWD SWIS-Stationsliste (GeoNutzV), BKG DLM250 (dl-de/by-2.0).
 *  glaciers  Gletscher ab 0,5 km² bis 30 km (höchstens fünf, nächste zuerst), mit Fläche und Bezugsjahr.
 *            Quellen: AGI 5 (AT, CC BY 4.0), RGI/GI4 (DE), GLAMOS SGI 2016 (CH; Lizenzklärung offen).
 *
 * Aufruf: node scripts/seo/fetch-place-modules.mjs [--data=../buscosun-data] [--glacier=../buscosun-glacier]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './places.mjs';
import { distKm } from './lib/geo.mjs';
import { MODULES } from './placeRules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DATA = resolve(HERE, '..', '..', args.data || '../buscosun-data');
const GLAC = resolve(HERE, '..', '..', args.glacier || '../buscosun-glacier');
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));

const spots = J(join(DATA, 'sea/v1/static/spots.json')).spots;
const gauges = J(join(DATA, 'sea/v1/static/gauges.json')).gauges;
const stations = Object.values(J(join(DATA, 'road/v1/static/stations.json')).stations).filter((s) => s.kind === 'A' && s.lat != null);
const corridors = J(join(DATA, 'road/v1/static/corridors.json')).corridors;
const glacBuild = readdirSync(join(GLAC, 'v1/static')).sort().pop();
const glaciers = J(join(GLAC, 'v1/static', glacBuild, 'catalog.json')).glaciers;

const { seaKm: SEA_KM, gaugeKm: GAUGE_KM, roadKm: ROAD_KM, stationKm: STATION_KM, glacierKm: GLACIER_KM, glacierMinKm2: GLACIER_MIN_KM2, glacierMax: GLACIER_MAX } = MODULES;
const r1 = (v) => Math.round(v * 10) / 10;

const out = {};
for (const p of PLACES) {
  const rec = {};
  // Seewetter: Revier-Spots (Elbe) sind keine Küste
  const sp = spots.filter((s) => s.kinds.some((k) => k !== 'revier')).map((s) => [distKm(p.lat, p.lon, s.lat, s.lon), s]).sort((a, b) => a[0] - b[0])[0];
  if (sp && sp[0] <= SEA_KM) {
    const g = gauges.map((x) => [distKm(p.lat, p.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0])[0];
    rec.sea = {
      spot: { id: sp[1].id, name: sp[1].name, lat: sp[1].lat, lon: sp[1].lon, km: r1(sp[0]), region: sp[1].region, kinds: sp[1].kinds, seaArea: sp[1].seaArea?.name ?? null, coast: sp[1].coast?.name ?? null },
      gauge: g && g[0] <= GAUGE_KM ? { id: g[1].id, name: g[1].name, lat: g[1].lat, lon: g[1].lon, km: r1(g[0]), url: g[1].url ?? null } : null,
    };
  }
  // Autobahn (nur Deutschland hat Glättemeldeanlagen im Katalog)
  let cd = Infinity, cr = null;
  for (const c of corridors) for (const q of c.line) { const d = distKm(p.lat, p.lon, q[1], q[0]); if (d < cd) { cd = d; cr = c; } }
  const st = stations.map((s) => [distKm(p.lat, p.lon, s.lat, s.lon), s]).sort((a, b) => a[0] - b[0])[0];
  if (cd <= ROAD_KM && st && st[0] <= STATION_KM) {
    rec.road = { corridor: { id: cr.id, road: cr.road, title: cr.title, km: r1(cd) }, station: { name: st[1].n, road: st[1].road, lat: st[1].lat, lon: st[1].lon, km: r1(st[0]), roadKm: st[1].km ?? null } };
  }
  // Gletscher
  const gl = glaciers
    .filter((g) => (g.area?.km2 ?? 0) >= GLACIER_MIN_KM2)
    .map((g) => [distKm(p.lat, p.lon, g.lat, g.lon), g])
    .filter(([d]) => d <= GLACIER_KM)
    .sort((a, b) => a[0] - b[0])
    .slice(0, GLACIER_MAX)
    .map(([d, g]) => ({ id: g.id, name: g.name, country: g.country, lat: g.lat, lon: g.lon, km: r1(d), areaKm2: Math.round(g.area.km2 * 100) / 100, areaYear: g.area.refYear, areaSource: g.area.source }));
  if (gl.length) rec.glaciers = gl;
  if (Object.keys(rec).length) out[p.slug] = rec;
}
mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(join(HERE, 'data', 'place-modules.json'), JSON.stringify({
  schema: 1, built: new Date().toISOString().slice(0, 10), glacierBuild: glacBuild,
  rules: { seaKm: SEA_KM, gaugeKm: GAUGE_KM, roadKm: ROAD_KM, stationKm: STATION_KM, glacierKm: GLACIER_KM, glacierMinKm2: GLACIER_MIN_KM2 },
  places: out,
}) + '\n', 'utf8');
const n = (k) => Object.values(out).filter((r) => r[k]).length;
console.log(`[modules] Orte mit sea ${n('sea')}, road ${n('road')}, glaciers ${n('glaciers')} → scripts/seo/data/place-modules.json`);
