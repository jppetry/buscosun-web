/**
 * build-effis-season-europe.mjs — Saisonliste der EFFIS-Brandflächen für die Europa-Ansicht.
 *
 *   node scripts/fire/build-effis-season-europe.mjs   # schreibt public/fire/effis-season-europe-v1.json
 *
 * Der Saison-Korb (`ms:modis.ba.poly.season`) ist für die Europa-Box (src/fire/fireRegion.ts)
 * rund 125 MB GeoJSON groß, und der EFFIS-Server komprimiert nicht — live ist das für die
 * Seite zu viel. Diese Datei trägt deshalb JEDE Fläche der Saison mit allen Attributen und
 * ihrer Bbox, aber OHNE Umriss. Den Umriss holt die Seite gezielt nach (Dossier, nahe
 * Zoomstufe) über `featureid` am selben WFS (`src/fire/sources/effisSeasonEurope.ts`).
 * DACH bleibt live (`fetchBurntAreas('season')`); die Seite führt beide über die `id` zusammen,
 * der Live-Umriss gewinnt.
 *
 * Felder je Zeile: id, Bbox W/S/O/N (4 Nachkommastellen), FIREDATE und LASTUPDATE in Minuten
 * seit 1970 (UTC), AREA_HA, COUNTRY (EFFIS-Code, wie geliefert), Index in `provinces`,
 * COMMUNE, die neun Landbedeckungsanteile (%, gerundet) in der Reihenfolge von `landcoverKeys`,
 * PERCNA2K (%, gerundet).
 *
 * Quelle: EFFIS / Copernicus Emergency Management Service (CC BY 4.0), WFS
 * https://maps.effis.emergency.copernicus.eu/effis. Netzabhängig; schreibt NUR die Ausgabedatei.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'fire', 'effis-season-europe-v1.json');
/** Dieselbe Box wie `EUROPE_BOX` in src/fire/fireRegion.ts. */
const BOX = { west: -25, south: 34, east: 32, north: 72 };
const LC = ['BROADLEA', 'CONIFER', 'MIXED', 'SCLEROPH', 'TRANSIT', 'OTHERNATLC', 'AGRIAREAS', 'ARTIFSURF', 'OTHERLC'];
// Kein `maxfeatures`: MapServer schneidet VOR dem BBox-Filter ab (CLAUDE.md, Waldbrand-Lehre 1).
const URL_ = 'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature&version=1.1.0'
  + `&outputformat=geojson&typename=ms:modis.ba.poly.season&bbox=${BOX.south},${BOX.west},${BOX.north},${BOX.east},EPSG:4326`;

async function fetchJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      console.warn(`Versuch ${i} gescheitert (${e.message}) — neuer Versuch`);
    }
  }
}

const minutes = (raw) => {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  const ms = Date.parse(m ? `${m[1]}T${m[2]}:00Z` : `${raw.trim().slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
};
const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : null; };
const r4 = (x) => Math.round(x * 1e4) / 1e4;

const fc = await fetchJson(URL_);
const feats = Array.isArray(fc?.features) ? fc.features : [];
// Achsen-Anker wie src/fire/sources/wfsAxis.ts: die Ausgabe muss lon,lat tragen.
const sample = feats.slice(0, 50).map((f) => f.geometry?.coordinates?.flat(3)).filter(Boolean);
const lonsOk = sample.every((c) => c[0] >= BOX.west - 1 && c[0] <= BOX.east + 1 && c[1] >= BOX.south - 1 && c[1] <= BOX.north + 1);
if (!lonsOk) throw new Error('Achsen vertauscht — die Ausgabe trägt nicht lon,lat');

const provinces = [];
const provIdx = new Map();
const pIdx = (name) => {
  if (!name) return -1;
  let i = provIdx.get(name);
  if (i == null) { i = provinces.length; provinces.push(name); provIdx.set(name, i); }
  return i;
};
const seen = new Set();
const rows = [];
const byCountry = {};
let lastUpdate = 0; let minFire = Infinity; let maxFire = -Infinity;
for (const f of feats) {
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
  const p = f.properties ?? {};
  const id = String(p.id ?? '');
  if (!id || seen.has(id)) continue;
  seen.add(id);
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  if (!Number.isFinite(w)) continue;
  const fire = minutes(p.FIREDATE); const upd = minutes(p.LASTUPDATE);
  if (upd != null && upd > lastUpdate) lastUpdate = upd;
  if (fire != null) { if (fire < minFire) minFire = fire; if (fire > maxFire) maxFire = fire; }
  const cc = typeof p.COUNTRY === 'string' ? p.COUNTRY.trim() : '';
  byCountry[cc || '?'] = (byCountry[cc || '?'] ?? 0) + 1;
  rows.push([
    id, r4(w), r4(s), r4(e), r4(n), fire, upd, num(p.AREA_HA), cc,
    pIdx(typeof p.PROVINCE === 'string' ? p.PROVINCE : ''), typeof p.COMMUNE === 'string' ? p.COMMUNE : '',
    ...LC.map((k) => Math.round(num(p[k]) ?? 0)), Math.round(num(p.PERCNA2K) ?? 0),
  ]);
}
if (rows.length === 0) throw new Error('keine Fläche geliefert — Datei bleibt unverändert');

const out = {
  version: 1,
  source: 'EFFIS — European Forest Fire Information System, Copernicus Emergency Management Service (CC BY 4.0), WFS ms:modis.ba.poly.season',
  note: 'Alle kartierten Brandflächen der laufenden Saison in der Europa-Box (25° W–32° O, 34–72° N), ohne Umriss. Erzeugt von scripts/fire/build-effis-season-europe.mjs.',
  built: new Date().toISOString(),
  lastUpdate: lastUpdate ? new Date(lastUpdate * 60_000).toISOString() : null,
  box: [BOX.west, BOX.south, BOX.east, BOX.north],
  landcoverKeys: LC,
  fields: ['id', 'w', 's', 'e', 'n', 'firedateMin', 'lastupdateMin', 'areaHa', 'country', 'provinceIdx', 'commune', ...LC, 'percNa2k'],
  provinces,
  rows,
};
mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
console.log(`Länder: ${Object.entries(byCountry).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(', ')}`);
console.log(`Brände ${new Date(minFire * 60_000).toISOString().slice(0, 10)} … ${new Date(maxFire * 60_000).toISOString().slice(0, 10)}, EFFIS-Stand ${out.lastUpdate}`);
console.log(`→ ${OUT}: ${rows.length} Flächen, ${(json.length / 1024).toFixed(0)} KB, gzip ${(gzipSync(json).length / 1024).toFixed(0)} KB`);
