/**
 * Verifikation ICON-EU-Raster (Phase 4.4) gegen LIVE-Daten. Wie verify-eps holt
 * Node die bz2-Felder direkt von opendata.dwd.de (kein CORS) und entpackt mit dem
 * `bz2`-Paket (der App-Decompress-Pfad nutzt `window.bz2`, Browser-only). Dekodiert
 * via echtem `decodeGrib2` und prüft Grid/DRT/Domäne + plausible Werte an DACH-
 * Punkten. Sampling-Logik gespiegelt aus `iconEuRasterSource.sampleField`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-icon-eu.mjs
 */
import bz2mod from 'bz2';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-eu/grib';
const pad3 = (n) => String(n).padStart(3, '0');
const pad2 = (n) => String(n).padStart(2, '0');
const singleUrl = (run, step, param) =>
  `${BASE}/${run.slice(8, 10)}/${param.toLowerCase()}/icon-eu_europe_regular-lat-lon_single-level_${run}_${pad3(step)}_${param}.grib2.bz2`;

function sampleField(f, lat, lon) {
  const jNorth = (f.scanMode & 64) !== 0;
  const lat0 = jNorth ? Math.min(f.lat1, f.lat2) : Math.max(f.lat1, f.lat2);
  const dlat = Math.abs(f.dj), dlon = Math.abs(f.di), lon0 = Math.min(f.lon1, f.lon2);
  let dl = lon - lon0; if (dl < -180) dl += 360; else if (dl > 180) dl -= 360;
  const fi = dl / dlon, fj = jNorth ? (lat - lat0) / dlat : (lat0 - lat) / dlat;
  if (fi < 0 || fi > f.ni - 1 || fj < 0 || fj > f.nj - 1) return NaN;
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, f.ni - 1), j1 = Math.min(j0 + 1, f.nj - 1);
  const ti = fi - i0, tj = fj - j0, v = f.values;
  const a = v[j0 * f.ni + i0], b = v[j0 * f.ni + i1], c = v[j1 * f.ni + i0], d = v[j1 * f.ni + i1];
  const cs = [a, b, c, d].filter(Number.isFinite);
  if (cs.length < 4) return cs.length ? cs[0] : NaN;
  return a * (1 - ti) * (1 - tj) + b * ti * (1 - tj) + c * (1 - ti) * tj + d * ti * tj;
}

async function headOk(u) { try { return (await fetch(u, { method: 'HEAD' })).ok; } catch { return false; } }
async function field(run, step, param) {
  const buf = await (await fetch(singleUrl(run, step, param))).arrayBuffer();
  return decodeGrib2(bz2.decompress(new Uint8Array(buf)));
}

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

// latest run
const now = new Date(); now.setUTCMinutes(0, 0, 0); now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
let run = null;
for (let b = 0; b < 8; b++) {
  const c = new Date(now.getTime() - b * 3 * 3600e3);
  const r = `${c.getUTCFullYear()}${pad2(c.getUTCMonth() + 1)}${pad2(c.getUTCDate())}${pad2(c.getUTCHours())}`;
  if (await headOk(singleUrl(r, 0, 'T_2M'))) { run = r; break; }
}
console.log('latest run:', run);
check(!!run, 'publizierter Lauf gefunden');

const t = await field(run, 3, 'T_2M');
const u = await field(run, 3, 'U_10M');
const cl = await field(run, 3, 'CLCT');
console.log(`T_2M grid ${t.ni}×${t.nj}, GDT-regulär=${!t.unstructured}, lat[${Math.min(t.lat1,t.lat2)},${Math.max(t.lat1,t.lat2)}]`);
check(!t.unstructured && t.ni > 1000 && t.nj > 500, 'reguläres lat-lon-Gitter (GDT 0)');
check(Math.min(t.lat1, t.lat2) <= 45 && Math.max(t.lat1, t.lat2) >= 55, 'Domäne deckt DACH');

// sample DACH cities
const cities = [['Berlin', 52.52, 13.40], ['München', 48.14, 11.58], ['Zürich', 47.37, 8.54], ['Wien', 48.21, 16.37]];
let tOk = 0, uOk = 0, cOk = 0;
for (const [name, la, lo] of cities) {
  const tv = sampleField(t, la, lo) - 273.15, uv = sampleField(u, la, lo), cv = sampleField(cl, la, lo);
  console.log(`  ${name}: t=${tv.toFixed(1)}°C u=${uv.toFixed(1)}m/s clct=${cv.toFixed(0)}%`);
  if (tv > -30 && tv < 45) tOk++;
  if (Number.isFinite(uv) && Math.abs(uv) < 60) uOk++;
  if (cv >= 0 && cv <= 100) cOk++;
}
check(tOk === cities.length, 'Temperatur an allen DACH-Städten plausibel');
check(uOk === cities.length, 'Wind an allen DACH-Städten plausibel');
check(cOk === cities.length, 'Bewölkung (clct) an allen DACH-Städten plausibel');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
