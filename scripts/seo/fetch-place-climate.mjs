/**
 * Einmal-Werkzeug: Klimanormale 1991–2020 je Ortsseite aus amtlichen 1-km-Rastern.
 *
 * Läuft NICHT im Build. Es schreibt `scripts/seo/data/place-climate.json` (nur Kennzahlen je Ort, keine
 * Rasterdaten), damit der Build netzfrei bleibt und die Seite dieselben Zahlen zeigt wie dieser Lauf.
 *
 *  DE  DWD-Klimaraster, grids_germany/multi_annual, Mittel 1991–2020, 1 km (Gauß-Krüger 3), bilinear
 *      interpoliert. Monatswerte: Tmax, Tmin, Niederschlag, Sonnenscheindauer; Jahreswerte: Frost-, Eis-,
 *      Sommer-, Heiße Tage, Tage mit Schneedecke. Quelle: Deutscher Wetterdienst, GeoNutzV.
 *  AT  GeoSphere Austria SPARTACUS v2, Tageswerte 1 km (TX, TN, RR, SA), daraus selbst gerechnet für
 *      1991–2020 mit denselben Schwellen wie der DWD (Frost TN<0, Eis TX<0, Sommer TX>=25, heiß TX>=30);
 *      Regentag = RR >= 1 mm. Quelle: GeoSphere Austria, CC BY 4.0.
 *  CH  keine Einträge: Das MeteoSchweiz-Raster (ogd-surface-derived-grid) liefert im Katalog keine Dateien
 *      für 1991–2020, die Stationsnormwerte sind nicht abrufbar (Stand 31.10.2026) — die Seite bleibt bei
 *      den Stationsdaten aus `public/climaGrid.json`.
 *
 * Aufruf:  node scripts/seo/fetch-place-climate.mjs [--only=slug,slug] [--country=DE|AT] [--merge]
 *   --merge  vorhandene Einträge behalten und nur die genannten/fehlenden ergänzen (Standard bei --only).
 * Die DWD-Dateien landen im Temp-Verzeichnis (~15 MB) und werden wiederverwendet.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './places.mjs';
import { wgs84ToGk3 } from './lib/geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'data', 'place-climate.json');
const CACHE = join(tmpdir(), 'buscosun-dwd-grids');
const DWD = 'https://opendata.dwd.de/climate_environment/CDC/grids_germany/multi_annual';
const SPARTACUS = 'https://dataset.api.hub.geosphere.at/v1/grid/historical/spartacus-v2-1d-1km';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const only = args.only ? new Set(String(args.only).split(',')) : null;

const pad = (m) => String(m).padStart(2, '0');
const round = (v, d) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ---------------------------------------------------------------- DWD
async function dwdGrid(dir, file) {
  mkdirSync(CACHE, { recursive: true });
  const local = join(CACHE, file);
  let gz;
  if (existsSync(local)) gz = readFileSync(local);
  else {
    const res = await fetch(`${DWD}/${dir}/${file}`);
    if (!res.ok) throw new Error(`DWD ${dir}/${file}: HTTP ${res.status}`);
    gz = Buffer.from(await res.arrayBuffer());
    writeFileSync(local, gz);
  }
  const txt = gunzipSync(gz).toString('latin1');
  const lines = txt.split('\n');
  const h = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Za-z_]+)\s+(-?[\d.]+)\s*$/);
    if (!m) break;
    h[m[1].toUpperCase()] = Number(m[2]);
  }
  const { NCOLS: nc, NROWS: nr, XLLCORNER: x0, YLLCORNER: y0, CELLSIZE: cs, NODATA_VALUE: nd } = h;
  const data = new Float32Array(nc * nr);
  let k = 0;
  for (let r = 0; r < nr; r++) for (const t of lines[i + r].trim().split(/\s+/)) data[k++] = Number(t);
  return { nc, nr, x0, y0, cs, nd, data };
}

/** Bilinear zwischen Zellmittelpunkten; NODATA-Nachbarn werden aus der Gewichtung genommen. */
function sample(g, e, n) {
  const fx = (e - g.x0) / g.cs - 0.5;
  const fy = (g.y0 + g.nr * g.cs - n) / g.cs - 0.5;
  const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
  let sw = 0, sv = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const cx = x + dx, cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= g.nc || cy >= g.nr) continue;
    const v = g.data[cy * g.nc + cx];
    if (v === g.nd || !(w > 0)) continue;
    sw += w; sv += w * v;
  }
  return sw > 0 ? sv / sw : null;
}

const DWD_MONTHLY = {
  tmax: ['air_temperature_max', (m) => `grids_germany_multi_annual_air_temp_max_1991-2020_${pad(m)}.asc.gz`],
  tmin: ['air_temperature_min', (m) => `grids_germany_multi_annual_air_temp_min_1991-2020_${pad(m)}.asc.gz`],
  rr: ['precipitation', (m) => `grids_germany_multi_annual_precipitation_1991-2020_${pad(m)}.asc.gz`],
  sun: ['sunshine_duration', (m) => `grids_germany_multi_annual_sunshine_duration_1991-2020_${pad(m)}.asc.gz`],
};
const DWD_ANNUAL = {
  frost: ['frost_days', 'grids_germany_multi_annual_frost_days_1991-2020_17.asc.gz'],
  ice: ['ice_days', 'grids_germany_multi_annual_ice_days_1991-2020_17.asc.gz'],
  summer: ['summer_days', 'grids_germany_multi_annual_summer_days_1991-2020_17.asc.gz'],
  hot: ['hot_days', 'grids_germany_multi_annual_hot_days_1991-2020_17.asc.gz'],
  snow: ['snowcover_days', 'grids_germany_multi_annual_snowcover_days_1991-2020_17.asc.gz'],
};
// Einheiten der DWD-Dateien sind in der Beschreibung je Parameter geführt; hier Skalierung auf °C, mm, h, Tage.
// (Temperatur der Raster: 1/10 °C; Niederschlag mm; Sonnenscheindauer h; Tage als Zahl.) Prüfung gegen bekannte
// Orte steht in `checkDwd()` — bei falscher Skalierung bricht das Werkzeug ab statt falsche Zahlen zu schreiben.
const SCALE = { tmax: 0.1, tmin: 0.1, rr: 1, sun: 1, frost: 1, ice: 1, summer: 1, hot: 1, snow: 1 };

async function dwdPlaces(list) {
  const grids = {};
  for (const [key, [dir, fn]] of Object.entries(DWD_MONTHLY)) { grids[key] = []; for (let m = 1; m <= 12; m++) grids[key].push(await dwdGrid(dir, fn(m))); }
  for (const [key, [dir, file]] of Object.entries(DWD_ANNUAL)) grids[key] = await dwdGrid(dir, file);
  const out = {};
  for (const p of list) {
    const { e, n } = wgs84ToGk3(p.lat, p.lon);
    const rec = { src: 'dwd', period: [1991, 2020] };
    for (const key of Object.keys(DWD_MONTHLY)) rec[key] = grids[key].map((g) => round((sample(g, e, n) ?? NaN) * SCALE[key], key === 'rr' ? 0 : 1));
    rec.days = {};
    for (const key of Object.keys(DWD_ANNUAL)) rec.days[key] = round((sample(grids[key], e, n) ?? NaN) * SCALE[key], 1);
    out[p.slug] = rec;
  }
  return out;
}

// ---------------------------------------------------------------- SPARTACUS
async function atPlace(p) {
  const dLat = 0.008, dLon = 0.011;
  const url = `${SPARTACUS}?parameters=TX,TN,RR,SA&start=1991-01-01&end=2020-12-31&bbox=${p.lat - dLat},${p.lon - dLon},${p.lat + dLat},${p.lon + dLon}&output_format=geojson`;
  let j;
  for (let t = 0; t < 4; t++) {
    const res = await fetch(url);
    if (res.ok) { j = await res.json(); break; }
    await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
  }
  if (!j || !j.features?.length) throw new Error(`SPARTACUS ohne Zellen für ${p.slug}`);
  const ts = j.timestamps;
  // Inverse-Distanz-Mittel der gelieferten Zellen (meist 2–4)
  const cells = j.features.map((f) => {
    const [lo, la] = f.geometry.coordinates;
    const d = Math.hypot((la - p.lat) * 111.2, (lo - p.lon) * 111.2 * Math.cos(p.lat * Math.PI / 180)) + 0.05;
    return { w: 1 / d, par: f.properties.parameters };
  });
  const wsum = cells.reduce((s, c) => s + c.w, 0);
  const val = (name, i) => { let s = 0, w = 0; for (const c of cells) { const v = c.par[name]?.data?.[i]; if (v != null) { s += v * c.w; w += c.w; } } return w > 0 ? s / w : null; };
  void wsum;
  const nY = 30;
  const mx = Array(12).fill(0), mxN = Array(12).fill(0), mn = Array(12).fill(0), mnN = Array(12).fill(0);
  const rr = Array(12).fill(0), sun = Array(12).fill(0), wet = Array(12).fill(0);
  const days = { frost: 0, ice: 0, summer: 0, hot: 0 };
  for (let i = 0; i < ts.length; i++) {
    const m = Number(ts[i].slice(5, 7)) - 1;
    const tx = val('TX', i), tn = val('TN', i), r = val('RR', i), sa = val('SA', i);
    if (tx != null) { mx[m] += tx; mxN[m]++; if (tx < 0) days.ice++; if (tx >= 25) days.summer++; if (tx >= 30) days.hot++; }
    if (tn != null) { mn[m] += tn; mnN[m]++; if (tn < 0) days.frost++; }
    if (r != null) { rr[m] += r; if (r >= 1) wet[m]++; }
    if (sa != null) sun[m] += sa / 3600;
  }
  return {
    src: 'geosphere', period: [1991, 2020],
    tmax: mx.map((s, m) => round(s / mxN[m], 1)), tmin: mn.map((s, m) => round(s / mnN[m], 1)),
    rr: rr.map((s) => round(s / nY, 0)), sun: sun.map((s) => round(s / nY, 0)), wet: wet.map((s) => round(s / nY, 1)),
    days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, round(v / nY, 1)])),
  };
}

// ---------------------------------------------------------------- Lauf
let existing = {};
if (existsSync(OUT) && (args.merge || only)) existing = JSON.parse(readFileSync(OUT, 'utf8')).places ?? {};
const want = PLACES.filter((p) => (!only || only.has(p.slug)) && (!args.country || p.country === args.country) && (only || !existing[p.slug]));
const res = { ...existing };
const de = want.filter((p) => p.country === 'DE');
const at = want.filter((p) => p.country === 'AT');
if (de.length) { console.log(`[climate] DWD-Raster für ${de.length} Orte …`); Object.assign(res, await dwdPlaces(de)); }
let k = 0;
for (const p of at) { res[p.slug] = await atPlace(p); if (++k % 10 === 0) console.log(`[climate] GeoSphere ${k}/${at.length}`); }

// Plausibilitätsprüfung: Skalierung und Projektion gegen bekannte Normwerte (DWD Klimanormalwerte 1991–2020).
function checkDwd() {
  const bad = [];
  const within = (name, v, lo, hi) => { if (!(v >= lo && v <= hi)) bad.push(`${name}: ${v} nicht in ${lo}…${hi}`); };
  const b = res.berlin, m = res.muenchen;
  if (b) { within('Berlin Tmax Juli', b.tmax[6], 23.5, 26.5); within('Berlin Tmin Jan', b.tmin[0], -3.5, 0); within('Berlin Niederschlag Jahr', b.rr.reduce((s, x) => s + x, 0), 500, 640); }
  if (m) { within('München Tmax Juli', m.tmax[6], 22.5, 26.5); within('München Niederschlag Jahr', m.rr.reduce((s, x) => s + x, 0), 880, 1100); }
  if (bad.length) { console.error('[climate] PLAUSIBILITÄT FEHLGESCHLAGEN:\n  ' + bad.join('\n  ')); process.exit(1); }
}
checkDwd();

mkdirSync(dirname(OUT), { recursive: true });
const sorted = Object.fromEntries(Object.entries(res).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({
  schema: 1, period: [1991, 2020], built: new Date().toISOString().slice(0, 10),
  sources: {
    dwd: 'Deutscher Wetterdienst, Klimaraster grids_germany/multi_annual 1991–2020 (GeoNutzV), Rasterweite 1 km',
    geosphere: 'GeoSphere Austria, SPARTACUS v2 Tagesraster 1 km (CC BY 4.0), Normalperiode 1991–2020 selbst berechnet',
  },
  places: sorted,
}, null, 0) + '\n', 'utf8');
console.log(`[climate] ${Object.keys(sorted).length} Orte → ${OUT}`);
