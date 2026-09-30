/**
 * staticClimaGrid.mjs — das statische Produkt `point/static/clima-grid/v1/` (Phase AX, AX-9;
 * `audit/fusion-ausbau.md` §6c; Bericht vom 29.09. #13, E-EX-4).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/point/staticClimaGrid.mjs [--cache=data/cache/clima-grid] [--out=data/point] [--no-write=1]
 *
 * ── Was es ist ──────────────────────────────────────────────────────────────
 * Monatliche Klimanormale **1991–2020** (Temperatur Mittel/Max/Min, Niederschlagssumme, Sonnenscheindauer)
 * aus den drei nationalen 1-km-Gittern, auf das Cube-Gitter der Stufe 1 (0,05°) gemittelt:
 *
 *   DE  DWD CDC `grids_germany/multi_annual/<var>/…_1991_2020_<MM>.asc.gz` — ESRI-ASCII, 1 km, Gauß-Krüger Zone 3
 *       (DHDN/Bessel), T in 1/10 °C, RR in mm, SD in h; CC BY 4.0 (Quelle: Deutscher Wetterdienst).
 *   AT  GeoSphere SPARTACUS v3 `spartacus-v3-1m-1km` — die API liefert je Monat den Wert UND die Anomalie gegen
 *       1991–2020 (`TMa_1991_2020` in 1/10 K, `RRa`/`SAa` in %), also Normal = Wert − Anomalie bzw. Wert / (Anomalie/100);
 *       gemessen 30.09.: aus Januar 2019 und Januar 2020 abgeleitet EXAKT dieselbe Normale (Wien 1,2 °C, Sonnblick −11,1 °C).
 *       Werte im NetCDF als int × 0,1 (°C, mm, h — an Wien/Sonnblick/Innsbruck belegt); CC BY 4.0 (GeoSphere Austria).
 *   CH  MeteoSwiss OGD `ch.meteoschweiz.ogd-climate-normals-grid` `TnormM9120`/`TmaxnormM9120`/`TminnormM9120`/
 *       `RnormM9120`/`SnormM9120` — NetCDF4, LV95 1 km mit lat/lon-Feldern, Fehlwert −999,99; CC BY 4.0 (MeteoSchweiz).
 *
 * ── Warum das Cube-Gitter und nicht 1 km ────────────────────────────────────
 * Der Client liest für seinen Punkt ohnehin den Chunk (cy, cx) der Stufe 1 — dieselbe Kachel trägt die Normale.
 * Ein 1-km-Produkt wäre 27× größer (≈ 40 MB statt ≈ 3 MB) für einen Gewinn, den die Höhe ohnehin dominiert:
 * deshalb trägt jede Zelle das **Mittel der Höhe ihrer Quellzellen** (`elev_src`, Terrarium z8 an den Zentren der
 * 1-km-Zellen, dieselbe DEM-Quelle wie der Client) — der Client korrigiert die Temperaturnormale mit dem Lapse auf
 * seine Punkthöhe, nicht gegen eine fremde Modellorographie.
 *
 * ── Was NICHT drin ist ──────────────────────────────────────────────────────
 * Tagesgang (weiter aus der Stationsklimatologie `climaGrid.json`), σ_c und Nasstag-Wahrscheinlichkeit (die Gitter
 * tragen Summen, keine Häufigkeiten), Wind (kein nationales Normalgitter), Zellen außerhalb DE/AT/CH/LI (MISSING —
 * benannt, `absent`).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  TIER_BY_ID, CHUNK_CELLS, MISSING, CUBE_DOMAIN, chunkExtent, encodeCubeChunk, quantize,
  staticChunkPath, staticManifestPath, CLIMA_GRID_PRODUCT, CLIMA_GRID_VERSION,
} from '../../src/point/cubeFormat.ts';
import { decodePng } from '../lib/png.mjs';

// jsfive (Laufzeit-Abhängigkeit des Clients, liest HDF5/NetCDF4 ohne native Bindung): ausdrücklich der ESM-Einstieg —
// `require.resolve('jsfive')` gäbe den CJS-Bau, dessen `File` unter `import()` nicht ankommt, und `package.json`
// ist nicht exportiert; der Pfad relativ zu diesem Skript ist im Repo und im Cron-Klon derselbe.
const hdf5 = await import(new URL('../../node_modules/jsfive/dist/esm/index.mjs', import.meta.url).href);

const args = {};
for (const s of process.argv.slice(2)) { const m = /^--([^=]+)(?:=(.*))?$/.exec(s); if (m) args[m[1]] = m[2] ?? '1'; }
const CACHE = args.cache || process.env.CLIMA_GRID_CACHE || 'data/cache/clima-grid';
const OUT = args.out || process.env.POINT_OUT || 'data/point';
const WRITE = args['no-write'] !== '1';

export const CLIMA_GRID_PERIOD = '1991-2020';
export const CLIMA_GRID_VARS = Object.freeze(['t_mean', 't_max', 't_min', 'rr', 'sun']);
const UNIT_OF = Object.freeze({ t_mean: 'degC', t_max: 'degC', t_min: 'degC', rr: 'mm', sun: 'h' });
const MM = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
/** Ebenenliste des Produkts — Reihenfolge ist Vertrag (`static.json` nennt sie, der Leser nimmt sie von dort). */
export function climaGridPlanes() {
  const planes = [];
  for (const v of CLIMA_GRID_VARS) for (const m of MM) planes.push({ id: `${v}_${m}`, unit: UNIT_OF[v], scale: 0.1, offset: 0, group: v });
  planes.push({ id: 'elev_src', unit: 'm', scale: 1, offset: 0, group: 'meta' });
  planes.push({ id: 'n_src', unit: '1', scale: 1, offset: 0, group: 'meta' });
  planes.push({ id: 'src', unit: 'bitmask', scale: 1, offset: 0, group: 'meta' });
  return planes;
}
export const SRC_BIT = Object.freeze({ de: 1, at: 2, ch: 4 });

// ── Quellen ──────────────────────────────────────────────────────────────────
const DWD = Object.freeze({
  base: 'https://opendata.dwd.de/climate_environment/CDC/grids_germany/multi_annual',
  vars: {
    t_mean: { dir: 'air_temperature_mean', name: 'air_temp_mean', period: '1991_2020', scale: 0.1, range: [-15, 25] },
    t_max: { dir: 'air_temperature_max', name: 'air_temp_max', period: '1991-2020', scale: 0.1, range: [-12, 32] },
    t_min: { dir: 'air_temperature_min', name: 'air_temp_min', period: '1991-2020', scale: 0.1, range: [-20, 20] },
    rr: { dir: 'precipitation', name: 'precipitation', period: '1991-2020', scale: 1, range: [5, 600] },
    sun: { dir: 'sunshine_duration', name: 'sunshine_duration', period: '1991-2020', scale: 1, range: [10, 350] },
  },
});
const GEOSPHERE = Object.freeze({
  base: 'https://dataset.api.hub.geosphere.at/v1/grid/historical/spartacus-v3-1m-1km',
  bbox: '46.1,9.3,49.2,17.4',
  year: 2020,
  vars: {
    t_mean: { value: 'TM', anomaly: 'TMa_1991_2020', kind: 'diff', scale: 0.1 },
    t_max: { value: 'TX', anomaly: 'TXa_1991_2020', kind: 'diff', scale: 0.1 },
    t_min: { value: 'TN', anomaly: 'TNa_1991_2020', kind: 'diff', scale: 0.1 },
    rr: { value: 'RR', anomaly: 'RRa_1991_2020', kind: 'ratio', scale: 0.1 },
    sun: { value: 'SA', anomaly: 'SAa_1991_2020', kind: 'ratio', scale: 0.1 },
  },
});
const METEOSWISS = Object.freeze({
  base: 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-climate-normals-grid/ch/ogd-climate-normals-grid',
  vars: {
    t_mean: { file: 'tnormm9120', dataset: 'TnormM9120' },
    t_max: { file: 'tmaxnormm9120', dataset: 'TmaxnormM9120' },
    t_min: { file: 'tminnormm9120', dataset: 'TminnormM9120' },
    rr: { file: 'rnormm9120', dataset: 'RnormM9120' },
    sun: { file: 'snormm9120', dataset: 'SnormM9120' },
  },
  suffix: '_ch01r.swiss.lv95_19910101000000_19911201000000.nc',
});
const DEM = Object.freeze({ z: 8, url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png' });

async function fetchTo(url, file) {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

// ── Gauß-Krüger Zone 3 (DHDN, Bessel) → WGS84 ────────────────────────────────
// Inverse transversale Mercator-Projektion (Reihen bis x⁵) + Helmert (7 Parameter, DHDN → ETRS89/WGS84,
// Bundesamt für Kartographie und Geodäsie: dx 598,1 dy 73,7 dz 418,2 m, rx 0,202″ ry 0,045″ rz −2,455″, 6,7 ppm).
// Genauigkeit ≈ 1–3 m — für ein 1-km-Klimagitter vier Größenordnungen unter dem, was zählt.
const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };
const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
function tmInverse(x, y, ell, lon0Deg) {
  const { a, f } = ell; const e2 = 2 * f - f * f; const n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  // Fußpunktbreite aus dem Meridianbogen (Krüger)
  const xi = y / A;
  const b1 = 3 / 2 * n - 27 / 32 * n ** 3, b2 = 21 / 16 * n * n - 55 / 32 * n ** 4, b3 = 151 / 96 * n ** 3, b4 = 1097 / 512 * n ** 4;
  const phiF = xi + b1 * Math.sin(2 * xi) + b2 * Math.sin(4 * xi) + b3 * Math.sin(6 * xi) + b4 * Math.sin(8 * xi);
  const sinF = Math.sin(phiF), cosF = Math.cos(phiF), t = Math.tan(phiF);
  const nu = a / Math.sqrt(1 - e2 * sinF * sinF);
  const rho = a * (1 - e2) / Math.pow(1 - e2 * sinF * sinF, 1.5);
  const eta2 = nu / rho - 1;
  const x2 = x * x;
  const phi = phiF
    - (t / (2 * rho * nu)) * x2
    + (t / (24 * rho * nu ** 3)) * (5 + 3 * t * t + eta2 - 9 * eta2 * t * t) * x2 * x2
    - (t / (720 * rho * nu ** 5)) * (61 + 90 * t * t + 45 * t ** 4) * x2 * x2 * x2;
  const lam = (x / (nu * cosF))
    - (x2 * x / (6 * nu ** 3 * cosF)) * (nu / rho + 2 * t * t)
    + (x2 * x2 * x / (120 * nu ** 5 * cosF)) * (5 + 28 * t * t + 24 * t ** 4);
  return { lat: phi * 180 / Math.PI, lon: lon0Deg + lam * 180 / Math.PI };
}
function geodeticToEcef(latDeg, lonDeg, h, ell) {
  const { a, f } = ell; const e2 = 2 * f - f * f;
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [(N + h) * Math.cos(lat) * Math.cos(lon), (N + h) * Math.cos(lat) * Math.sin(lon), (N * (1 - e2) + h) * Math.sin(lat)];
}
function ecefToGeodetic([X, Y, Z], ell) {
  const { a, f } = ell; const e2 = 2 * f - f * f;
  const lon = Math.atan2(Y, X); const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) { const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); lat = Math.atan2(Z + e2 * N * Math.sin(lat), p); }
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
const HELMERT_DHDN_WGS84 = { dx: 598.1, dy: 73.7, dz: 418.2, rx: 0.202, ry: 0.045, rz: -2.455, ppm: 6.7 };
function helmert([X, Y, Z], p) {
  const s = 1 + p.ppm * 1e-6, r = (v) => v / 3600 * Math.PI / 180;
  const rx = r(p.rx), ry = r(p.ry), rz = r(p.rz);
  return [p.dx + s * (X - rz * Y + ry * Z), p.dy + s * (rz * X + Y - rx * Z), p.dz + s * (-ry * X + rx * Y + Z)];
}
export function gk3ToWgs84(R, H) {
  const g = tmInverse(R - 3_500_000, H, BESSEL, 9);
  return ecefToGeodetic(helmert(geodeticToEcef(g.lat, g.lon, 0, BESSEL), HELMERT_DHDN_WGS84), WGS84);
}

// ── ESRI-ASCII-Gitter (DWD) ──────────────────────────────────────────────────
function parseAsc(text) {
  const lines = text.split(/\r?\n/);
  const hdr = {}; let i = 0;
  for (; i < 6; i++) { const [k, v] = lines[i].trim().split(/\s+/); hdr[k.toUpperCase()] = Number(v); }
  const ncols = hdr.NCOLS, nrows = hdr.NROWS, nodata = hdr.NODATA_VALUE;
  const vals = new Float32Array(ncols * nrows); let w = 0;
  for (; i < lines.length && w < vals.length; i++) {
    const ln = lines[i]; if (!ln) continue;
    for (const tok of ln.trim().split(/\s+/)) { const v = Number(tok); vals[w++] = v === nodata ? NaN : v; }
  }
  if (w !== vals.length) throw new Error(`asc: ${w} von ${vals.length} Werten gelesen`);
  return { ncols, nrows, xll: hdr.XLLCORNER, yll: hdr.YLLCORNER, cell: hdr.CELLSIZE, vals };
}

// ── Astronomisch mögliche Sonnenscheindauer eines Monats (h) an einer Breite ─────────────
// Tageslänge aus der Sonnendeklination (Cooper), Summe über die Tage des Monats, Refraktion und Horizont weggelassen.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DOY0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export function possibleSunHours(latDeg, m) {
  const phi = latDeg * Math.PI / 180;
  let h = 0;
  for (let d = 1; d <= DAYS_IN_MONTH[m]; d++) {
    const doy = DOY0[m] + d;
    const decl = 23.45 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
    const x = -Math.tan(phi) * Math.tan(decl);
    h += x <= -1 ? 24 : x >= 1 ? 0 : (2 / 15) * Math.acos(x) * 180 / Math.PI;
  }
  return h;
}

// ── NetCDF4 (AT, CH) über jsfive ─────────────────────────────────────────────
function openNc(buf, name) { return new hdf5.File(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), name); }
function ncVar(f, name) { const d = f.get(name); if (!d || !d.shape) throw new Error(`NetCDF: ${name} fehlt`); return { shape: d.shape, value: d.value }; }

// ── DEM (Terrarium z8) ───────────────────────────────────────────────────────
const demTiles = new Map();
async function demTile(x, y) {
  const key = `${x}/${y}`;
  if (demTiles.has(key)) return demTiles.get(key);
  const file = join(CACHE, 'dem', `${DEM.z}_${x}_${y}.png`);
  let png = null;
  try { png = decodePng(await fetchTo(DEM.url.replace('{z}', DEM.z).replace('{x}', x).replace('{y}', y), file)); } catch (e) { console.log(`  ⚠ DEM ${key}: ${e.message}`); }
  demTiles.set(key, png);
  return png;
}
async function demAt(lat, lon) {
  const n = 2 ** DEM.z;
  const fx = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = await demTile(tx, ty);
  if (!t) return NaN;
  const w = t.width, h = t.height, ch = t.channels;
  const px = (fx - tx) * w, py = (fy - ty) * h;
  const i0 = Math.max(0, Math.min(w - 1, Math.floor(px))), j0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
  const i1 = Math.min(w - 1, i0 + 1), j1 = Math.min(h - 1, j0 + 1);
  const at = (i, j) => { const k = (j * w + i) * ch; return t.data[k] * 256 + t.data[k + 1] + t.data[k + 2] / 256 - 32768; };
  const fxr = px - i0, fyr = py - j0;
  const e0 = at(i0, j0) * (1 - fxr) + at(i1, j0) * fxr, e1 = at(i0, j1) * (1 - fxr) + at(i1, j1) * fxr;
  return e0 * (1 - fyr) + e1 * fyr;
}

// ── Aggregation auf das Cube-Gitter ──────────────────────────────────────────
const tier = TIER_BY_ID.t1;
const NCELL = tier.ny * tier.nx;
const NV = CLIMA_GRID_VARS.length;
const sums = CLIMA_GRID_VARS.map(() => Array.from({ length: 12 }, () => new Float64Array(NCELL)));
const cnts = CLIMA_GRID_VARS.map(() => Array.from({ length: 12 }, () => new Uint16Array(NCELL)));
const elevSum = new Float64Array(NCELL), elevCnt = new Uint16Array(NCELL), srcMask = new Uint8Array(NCELL);
const stats = {};
function cellIndex(lat, lon) {
  if (lat < CUBE_DOMAIN.latMin || lat > CUBE_DOMAIN.latMax || lon < CUBE_DOMAIN.lonMin || lon > CUBE_DOMAIN.lonMax) return -1;
  const iy = Math.min(tier.ny - 1, Math.max(0, Math.round((lat - tier.lat0) / tier.deg)));
  const ix = Math.min(tier.nx - 1, Math.max(0, Math.round((lon - tier.lon0) / tier.deg)));
  return iy * tier.nx + ix;
}
function accumulate(country, vi, m, cell, v) {
  if (cell < 0 || !Number.isFinite(v)) return;
  sums[vi][m][cell] += v; cnts[vi][m][cell]++;
  const s = (stats[country] ??= {}); const k = CLIMA_GRID_VARS[vi];
  const e = (s[k] ??= { n: 0, min: Infinity, max: -Infinity });
  e.n++; if (v < e.min) e.min = v; if (v > e.max) e.max = v;
}
/** Höhe je Quellzelle einmal (nicht je Monat) — und die Quellmaske. */
async function accumulateCell(country, cell, lat, lon) {
  if (cell < 0) return;
  srcMask[cell] |= SRC_BIT[country];
  const e = await demAt(lat, lon);
  if (Number.isFinite(e)) { elevSum[cell] += e; elevCnt[cell]++; }
}

async function readDe() {
  let cells = 0, gkCheck = null;
  for (let vi = 0; vi < NV; vi++) {
    const v = CLIMA_GRID_VARS[vi]; const src = DWD.vars[v];
    for (let m = 0; m < 12; m++) {
      const file = join(CACHE, 'dwd', `${src.name}_${MM[m]}.asc.gz`);
      const url = `${DWD.base}/${src.dir}/grids_germany_multi_annual_${src.name}_${src.period}_${MM[m]}.asc.gz`;
      const g = parseAsc(gunzipSync(await fetchTo(url, file)).toString('latin1'));
      let minV = Infinity;
      for (let r = 0; r < g.nrows; r++) {
        const H = g.yll + (g.nrows - r - 0.5) * g.cell;
        for (let c = 0; c < g.ncols; c++) {
          const raw = g.vals[r * g.ncols + c];
          if (!Number.isFinite(raw)) continue;
          const R = g.xll + (c + 0.5) * g.cell;
          const { lat, lon } = gk3ToWgs84(R, H);
          const cell = cellIndex(lat, lon);
          const val = raw * src.scale;
          accumulate('de', vi, m, cell, val);
          if (vi === 0 && m === 0) { cells++; await accumulateCell('de', cell, lat, lon); if (val < minV) { minV = val; gkCheck = { lat, lon, val }; } }
        }
      }
    }
  }
  // Gegenprobe der Projektion: die kälteste Januarzelle Deutschlands liegt an der Zugspitze (47,42 N 10,98 E).
  const dz = Math.hypot(gkCheck.lat - 47.421, (gkCheck.lon - 10.985) * 0.68) * 111;
  console.log(`  DE: ${cells.toLocaleString('de-DE')} Zellen; GK3-Probe: kälteste Januarzelle ${gkCheck.val.toFixed(1)} °C bei ${gkCheck.lat.toFixed(3)}/${gkCheck.lon.toFixed(3)} — ${dz.toFixed(1)} km von der Zugspitze ${dz < 3 ? '✓' : '✗'}`);
  if (dz >= 3) throw new Error('GK3 → WGS84 fällt an der Zugspitze durch');
  return cells;
}

async function readAt() {
  let cells = 0;
  for (let vi = 0; vi < NV; vi++) {
    const v = CLIMA_GRID_VARS[vi]; const src = GEOSPHERE.vars[v];
    const file = join(CACHE, 'at', `${src.value}_${GEOSPHERE.year}.nc`);
    const url = `${GEOSPHERE.base}?parameters=${src.value},${src.anomaly}&start=${GEOSPHERE.year}-01-01&end=${GEOSPHERE.year}-12-01&bbox=${GEOSPHERE.bbox}&output_format=netcdf`;
    const f = openNc(await fetchTo(url, file), file);
    const val = ncVar(f, src.value), ano = ncVar(f, src.anomaly), lat = ncVar(f, 'lat').value, lon = ncVar(f, 'lon').value;
    const [nt, ny, nx] = val.shape;
    if (nt !== 12) throw new Error(`AT ${src.value}: ${nt} Monate statt 12`);
    const plane = ny * nx;
    for (let m = 0; m < 12; m++) {
      for (let i = 0; i < plane; i++) {
        const raw = val.value[m * plane + i], a = ano.value[m * plane + i];
        if (raw === -999 || a === -999 || raw < -9000 || a < -9000) continue;
        const normal = src.kind === 'diff' ? (raw - a) * src.scale : a > 0 ? (raw * src.scale) / (a / 100) : NaN;
        const cell = cellIndex(lat[i], lon[i]);
        accumulate('at', vi, m, cell, normal);
        if (vi === 0 && m === 0) { cells++; await accumulateCell('at', cell, lat[i], lon[i]); }
      }
    }
  }
  console.log(`  AT: ${cells.toLocaleString('de-DE')} Zellen (SPARTACUS v3, Normale = Wert − Anomalie / Wert ÷ Anomalie)`);
  return cells;
}

async function readCh() {
  let cells = 0;
  for (let vi = 0; vi < NV; vi++) {
    const v = CLIMA_GRID_VARS[vi]; const src = METEOSWISS.vars[v];
    const file = join(CACHE, 'ch', `${src.file}.nc`);
    const f = openNc(await fetchTo(`${METEOSWISS.base}.${src.file}${METEOSWISS.suffix}`, file), file);
    const val = ncVar(f, src.dataset), lat = ncVar(f, 'lat').value, lon = ncVar(f, 'lon').value;
    const [nt, ny, nx] = val.shape;
    if (nt !== 12) throw new Error(`CH ${src.dataset}: ${nt} Monate statt 12`);
    const plane = ny * nx;
    for (let m = 0; m < 12; m++) {
      for (let i = 0; i < plane; i++) {
        const raw0 = val.value[m * plane + i];
        if (!Number.isFinite(raw0) || raw0 < -900) continue;
        // `SnormM9120` ist die RELATIVE Sonnenscheindauer in % (gemessen 30.09.: Maximum 66 — Stunden wären ≈ 320);
        // in Stunden über die astronomisch mögliche Dauer des Monats an dieser Breite (ohne Horizont, benannt).
        const raw = v === 'sun' ? raw0 / 100 * possibleSunHours(lat[i], m) : raw0;
        const cell = cellIndex(lat[i], lon[i]);
        accumulate('ch', vi, m, cell, raw);
        if (vi === 0 && m === 0) { cells++; await accumulateCell('ch', cell, lat[i], lon[i]); }
      }
    }
  }
  console.log(`  CH: ${cells.toLocaleString('de-DE')} Zellen (MeteoSwiss Normale 1991–2020)`);
  return cells;
}

async function main() {
  const t0 = Date.now();
  console.log(`[clima-grid] ${CLIMA_GRID_PRODUCT}/${CLIMA_GRID_VERSION} · Cache ${CACHE} · Ausgabe ${OUT}`);
  const nDe = await readDe(); const nAt = await readAt(); const nCh = await readCh();
  console.log(`  Wertebereiche je Land und Größe (Normale, Rohwerte der Quelle):`);
  for (const [c, s] of Object.entries(stats)) console.log(`    ${c}: ${Object.entries(s).map(([k, e]) => `${k} ${e.min.toFixed(1)}…${e.max.toFixed(1)} (n ${e.n.toLocaleString('de-DE')})`).join(' · ')}`);

  // Ebenen quantisieren
  const planes = climaGridPlanes();
  const quant = planes.map((p) => new Int16Array(NCELL).fill(MISSING));
  let covered = 0;
  for (let cell = 0; cell < NCELL; cell++) {
    let any = false;
    for (let vi = 0; vi < NV; vi++) for (let m = 0; m < 12; m++) {
      const n = cnts[vi][m][cell]; if (!n) continue;
      quant[vi * 12 + m][cell] = quantize(sums[vi][m][cell] / n, planes[vi * 12 + m]); any = true;
    }
    if (elevCnt[cell]) quant[NV * 12][cell] = quantize(elevSum[cell] / elevCnt[cell], planes[NV * 12]);
    const n0 = cnts[0][0][cell];
    if (n0) quant[NV * 12 + 1][cell] = quantize(n0, planes[NV * 12 + 1]);
    if (srcMask[cell]) quant[NV * 12 + 2][cell] = srcMask[cell];
    if (any) covered++;
  }
  console.log(`  Cube-Zellen mit Normale: ${covered} von ${NCELL} (${(100 * covered / NCELL).toFixed(1)} %)`);

  // Stichproben an bekannten Orten (Januar-Mittel, Höhe der Quellzellen)
  const sunPi = CLIMA_GRID_VARS.indexOf('sun') * 12;
  for (const [name, lat, lon, expect] of [['München-Stadt', 48.163, 11.543, 0.5], ['Wien Hohe Warte', 48.2489, 16.3564, 1.2], ['Zürich Fluntern', 47.378, 8.566, 0.9], ['Zugspitze', 47.421, 10.985, -9.6], ['Sonnblick', 47.054, 12.9575, -11.1]]) {
    const cell = cellIndex(lat, lon);
    const q = quant[0][cell], e = quant[NV * 12][cell], n = quant[NV * 12 + 1][cell], s = quant[NV * 12 + 2][cell];
    const sj = quant[sunPi][cell], sJul = quant[sunPi + 6][cell];
    console.log(`    ${name}: t_mean_01 ${q === MISSING ? '—' : (q * 0.1).toFixed(1)} °C (Station ≈ ${expect}) · sun_01/07 ${sj === MISSING ? '—' : (sj * 0.1).toFixed(0)}/${sJul === MISSING ? '—' : (sJul * 0.1).toFixed(0)} h · elev_src ${e === MISSING ? '—' : e} m · n_src ${n === MISSING ? '—' : n} · src ${s === MISSING ? '—' : s}`);
  }

  if (!WRITE) { console.log('  --no-write: nichts geschrieben'); return; }
  let bytes = 0, chunks = 0;
  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const ext = chunkExtent(tier, cy, cx);
      const cut = quant.map((src) => {
        const out = new Int16Array(ext.ny * ext.nx); let w = 0;
        for (let ry = 0; ry < ext.ny; ry++) { const row = (ext.y0 + ry) * tier.nx + ext.x0; for (let rx = 0; rx < ext.nx; rx++) out[w++] = src[row + rx]; }
        return out;
      });
      const buf = await encodeCubeChunk({ runHours: 0, tierIndex: tier.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut }, undefined, planes);
      const abs = join(OUT, staticChunkPath(CLIMA_GRID_PRODUCT, CLIMA_GRID_VERSION, 't1', cy, cx).replace(/^point\//, ''));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, buf); bytes += buf.length; chunks++;
    }
  }
  const now = new Date().toISOString();
  const man = {
    product: CLIMA_GRID_PRODUCT, version: CLIMA_GRID_VERSION, kind: 'static',
    what: `Monatliche Klimanormale ${CLIMA_GRID_PERIOD} (Temperatur Mittel/Max/Min, Niederschlagssumme, Sonnenscheindauer) aus den nationalen 1-km-Gittern DE/AT/CH auf dem Cube-Gitter der Stufe 1.`,
    why: 'Bericht 29.09. #13 / E-EX-4 (Phase AX, AX-9): Klimatologie-Prior aus Gittern, die Höhe und Relief schon enthalten, statt aus 178 Stationen; der Tagesgang bleibt Sache der Stationsklimatologie.',
    container: 'BSPC wie der Cube, eigene Ebenenliste, nt = 1, gleiches Chunk-Raster wie Stufe 1.',
    aggregation: 'Arithmetisches Mittel der 1-km-Quellzellen je Cube-Zelle (Zellzuordnung wie cellOf: Rundung auf das 0,05°-Raster); n_src = Zahl der Quellzellen (t_mean, Januar); elev_src = Mittel der DEM-Höhe (Terrarium z8, bilinear) an den Zentren dieser Quellzellen — Bezugshöhe der Temperaturnormale; src = Bitmaske der Länder (1 DE, 2 AT, 4 CH; Grenzzellen mischen).',
    heightRule: 'Der Leser korrigiert t_* mit dem Lapse auf die Punkthöhe: T(h) = T + Γ·(h − elev_src), Γ aus der Stationsklimatologie (lapsePerM) oder −0,0065 K/m.',
    sources: {
      de: { name: 'Deutscher Wetterdienst, CDC — Vieljährige Mittel 1991–2020, Rasterdaten 1 km (Gauß-Krüger Zone 3)', url: DWD.base, licence: 'CC BY 4.0 — Quelle: Deutscher Wetterdienst', retrievedAt: now, cells: nDe, units: 'T 1/10 °C, RR mm, SD h (aus den Dateien; im Produkt °C, mm, h)' },
      at: { name: 'GeoSphere Austria, SPARTACUS v3 (spartacus-v3-1m-1km) — Normale 1991–2020 aus Wert und Anomalie des Jahres 2020', url: GEOSPHERE.base, licence: 'CC BY 4.0 — Datenquelle: GeoSphere Austria', retrievedAt: now, cells: nAt, derivation: 'T: Wert − Anomalie (1/10 K); RR, SA: Wert ÷ (Anomalie/100). Gegenprobe 30.09.: aus 2019-01 und 2020-01 exakt dieselbe Normale (Wien 1,2 · Sonnblick −11,1 · Innsbruck −0,2 °C).' },
      ch: { name: 'MeteoSchweiz OGD, Räumliche Klimanormwerte 1991–2020 (TnormM9120, TmaxnormM9120, TminnormM9120, RnormM9120, SnormM9120), 1 km LV95', url: METEOSWISS.base, licence: 'CC BY 4.0 — Quelle: MeteoSchweiz', retrievedAt: now, cells: nCh, sunDerivation: 'SnormM9120 ist die RELATIVE Sonnenscheindauer (%); Stunden = % × astronomisch mögliche Dauer des Monats an der Breite (ohne Horizont) — abgeleitet, benannt.' },
      dem: { name: 'Terrarium (AWS elevation-tiles-prod) z8', url: DEM.url, note: 'dieselbe DEM-Quelle wie der Client (terrain.ts, far z8)' },
    },
    notCarried: {
      wind: 'kein nationales 1-km-Normalgitter für Wind — Windklimatologie bleibt Stationssache (E-FX-9: nein).',
      sigma: 'die Gitter tragen Mittel, keine Streuung — σ_c weiter aus der Stationsklimatologie.',
      wetDays: 'Niederschlag als Monatssumme, keine Nasstag-Häufigkeit — die Nasstag-Wahrscheinlichkeit bleibt Stationssache.',
      diurnal: 'Tagesgang aus der Stationsklimatologie (hourlyClimaTemp).',
      outside: 'Zellen außerhalb DE/AT/CH (LI liegt im CH-Gitter) sind MISSING — Nachbarländer haben hier kein Gitter.',
    },
    chunkCells: CHUNK_CELLS,
    timeless: 'point/static/ ist von der Aufbewahrung ausgenommen (TIMELESS_PATHS).',
    tiers: {
      t1: {
        planes: planes.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, group: p.group, provenance: `normal-${CLIMA_GRID_PERIOD}` })),
        chunks, bytes, cy: tier.chunk.cy, cx: tier.chunk.cx, ny: tier.ny, nx: tier.nx, deg: tier.deg,
        coveredCells: covered, builtAt: now,
        absent: { t2: 'nur Stufe 1 — der Client liest die Normale aus der Stufe-1-Kachel für jeden Vorlauf.', t3: 'dito' },
        stats,
      },
    },
    updatedAt: now,
  };
  const mp = join(OUT, staticManifestPath(CLIMA_GRID_PRODUCT, CLIMA_GRID_VERSION).replace(/^point\//, ''));
  mkdirSync(dirname(mp), { recursive: true });
  writeFileSync(mp, `${JSON.stringify(man, null, 2)}\n`);
  console.log(`  geschrieben: ${chunks} Chunks, ${(bytes / 1048576).toFixed(2)} MiB, ${mp}`);
  console.log(`WALL_CLIMA_GRID=${Math.round((Date.now() - t0) / 1000)}s`);
}

if (process.argv[1]?.endsWith('staticClimaGrid.mjs')) {
  main().catch((e) => { console.error('[clima-grid]', e); process.exit(1); });
}
