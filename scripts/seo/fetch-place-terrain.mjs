/**
 * Einmal-Werkzeug: Geländeprofil und Seenähe je Ortsseite.
 *
 * Läuft NICHT im Build. Es schreibt `scripts/seo/data/place-terrain.json` (Kennzahlen je Ort), damit der Build
 * netzfrei bleibt und die Ortsseite aus Daten statt aus Vorlagentext erklärt, wo der Ort im Gelände liegt.
 *
 *  Gelände  Terrarium-Höhenkacheln (Mapzen/AWS Open Data, Zoom 10, rund 105 m je Pixel in DACH) — dieselben
 *           Kacheln wie die Karte (`src/fusion/elevation.ts`). Je Ort: Höhenverteilung im Umkreis von 10 km
 *           (Mittel, 10./90. Perzentil, Minimum, Maximum), Rang der Ortshöhe darin und mittlere Höhe im
 *           1-km-Umkreis (die Größe einer Klimarasterzelle).
 *  Seen     Natural Earth 1:10 m (gemeinfrei), nur eine geprüfte Liste von Seen (Namensabgleich unten),
 *           Entfernung vom Ort zum Ufer. Fehlt ein See in der Quelle, sagt die Seite nichts — sie behauptet
 *           nie „kein See".
 *
 * Aufruf:  node scripts/seo/fetch-place-terrain.mjs [--only=slug,slug] [--merge]
 * Kacheln und Seen-Dateien liegen im Temp-Verzeichnis (Wiederverwendung).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './places.mjs';
import { decodePng, distKm } from './lib/geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data', 'place-terrain.json');
const CACHE = join(tmpdir(), 'buscosun-terrain');
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const Z = 10, T = 256, RADIUS_KM = 10, LAKE_MAX_KM = 8;

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const only = args.only ? new Set(String(args.only).split(',')) : null;

mkdirSync(CACHE, { recursive: true });
async function cached(url, name) {
  const f = join(CACHE, name);
  if (existsSync(f)) return readFileSync(f);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const b = Buffer.from(await res.arrayBuffer());
  writeFileSync(f, b);
  return b;
}

// ---- Terrarium
const tileImgs = new Map();
async function tile(x, y) {
  const key = `${x}_${y}`;
  if (!tileImgs.has(key)) {
    const b = await cached(TERRARIUM.replace('{z}', Z).replace('{x}', x).replace('{y}', y), `t${Z}_${x}_${y}.png`);
    tileImgs.set(key, decodePng(b));
  }
  return tileImgs.get(key);
}
const worldPx = (lat, lon) => {
  const n = 2 ** Z * T;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
};
const elevOf = (img, px, py) => { const i = (py * T + px) * img.bpp; return img.data[i] * 256 + img.data[i + 1] + img.data[i + 2] / 256 - 32768; };

async function terrain(p) {
  const mPerPx = 40075016.686 * Math.cos(p.lat * Math.PI / 180) / (2 ** Z * T);
  const rPx = Math.ceil(RADIUS_KM * 1000 / mPerPx);
  const c = worldPx(p.lat, p.lon);
  const vals = [], near = [];
  const x0 = Math.floor((c.x - rPx) / T), x1 = Math.floor((c.x + rPx) / T), y0 = Math.floor((c.y - rPx) / T), y1 = Math.floor((c.y + rPx) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const img = await tile(tx, ty);
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const dx = (tx * T + px + 0.5 - c.x) * mPerPx, dy = (ty * T + py + 0.5 - c.y) * mPerPx;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS_KM * 1000) continue;
      const e = elevOf(img, px, py);
      vals.push(e);
      if (d <= 1000) near.push(e);
    }
  }
  vals.sort((a, b) => a - b);
  const q = (f) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))];
  const below = vals.filter((v) => v < p.ele).length / vals.length;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return {
    mean: Math.round(mean), p10: Math.round(q(0.1)), p90: Math.round(q(0.9)), min: Math.round(vals[0]), max: Math.round(vals[vals.length - 1]),
    rank: Math.round(below * 100) / 100,
    mean1: Math.round(near.reduce((s, v) => s + v, 0) / near.length),
  };
}

// ---- Seen
/** Natural-Earth-Feldname → Anzeigename. Nur diese Seen werden berücksichtigt (geprüft gegen die Quelle). */
const LAKES = {
  'Lake Geneva': 'Genfersee', 'Bodensee': 'Bodensee', 'Müritz': 'Müritz', 'Schweriner See': 'Schweriner See',
  'CHIEMSEE': 'Chiemsee', 'Attersee': 'Attersee', 'Starnberger See': 'Starnberger See', 'Traunsee': 'Traunsee',
  'Ammersee': 'Ammersee', 'Neusiedlersee': 'Neusiedler See', 'Walensee': 'Walensee', 'Zugersee': 'Zugersee',
  'Bielersee': 'Bielersee', 'Zürichsee': 'Zürichsee', 'Neuchâtel': 'Neuenburgersee', 'MURTENSEE': 'Murtensee',
  'Vierwaldstättersee': 'Vierwaldstättersee', 'Wörthersee': 'Wörthersee', 'Lago di Lugano - Ceresio': 'Luganersee',
  'Brienzersee': 'Brienzersee', 'Thunersee': 'Thunersee', 'Steinhuder Meer': 'Steinhuder Meer',
  'Kummerower See': 'Kummerower See', 'Plauer See': 'Plauer See', 'Selenter See': 'Selenter See',
};
async function loadLakes() {
  const out = [];
  for (const f of ['ne_10m_lakes.geojson', 'ne_10m_lakes_europe.geojson']) {
    const j = JSON.parse((await cached(`${NE}/${f}`, f)).toString('utf8'));
    for (const ft of j.features) {
      const display = LAKES[ft.properties.name];
      if (!display) continue;
      const polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
      out.push({ name: display, polys });
    }
  }
  return out;
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function lakeDistanceKm(p, lake) {
  const kx = 111.32 * Math.cos(p.lat * Math.PI / 180), ky = 110.57;
  let best = Infinity;
  for (const poly of lake.polys) {
    if (pointInRing(p.lon, p.lat, poly[0]) && !poly.slice(1).some((h) => pointInRing(p.lon, p.lat, h))) return 0;
    for (const ring of poly) for (let i = 0; i + 1 < ring.length; i++) {
      const ax = (ring[i][0] - p.lon) * kx, ay = (ring[i][1] - p.lat) * ky, bx = (ring[i + 1][0] - p.lon) * kx, by = (ring[i + 1][1] - p.lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

// ---- Lauf
let existing = {};
if (existsSync(OUT) && (args.merge || only)) existing = JSON.parse(readFileSync(OUT, 'utf8')).places ?? {};
const want = PLACES.filter((p) => (!only || only.has(p.slug)) && (only || !existing[p.slug]));
const lakes = await loadLakes();
const res = { ...existing };
let k = 0;
for (const p of want) {
  const rec = await terrain(p);
  let lake = null;
  for (const l of lakes) { const d = lakeDistanceKm(p, l); if (d <= LAKE_MAX_KM && (!lake || d < lake.km)) lake = { name: l.name, km: Math.round(d * 10) / 10 }; }
  rec.lake = lake;
  res[p.slug] = rec;
  if (++k % 20 === 0) console.log(`[terrain] ${k}/${want.length}`);
}
mkdirSync(dirname(OUT), { recursive: true });
const sorted = Object.fromEntries(Object.entries(res).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({
  schema: 1, built: new Date().toISOString().slice(0, 10), radiusKm: RADIUS_KM, zoom: Z,
  sources: {
    terrain: 'Terrarium-Höhenkacheln (Mapzen/AWS Terrain Tiles; Quellen u. a. SRTM, EU-DEM, swisstopo, Land Tirol) — dieselben Kacheln wie die Karte',
    lakes: 'Natural Earth 1:10m Lakes (gemeinfrei)',
  },
  places: sorted,
}) + '\n', 'utf8');
void distKm;
console.log(`[terrain] ${Object.keys(sorted).length} Orte → ${OUT}`);
