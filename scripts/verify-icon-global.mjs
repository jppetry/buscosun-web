/**
 * Verifikation ICON-global-Adapter (Phase 4.9) gegen LIVE-Daten. ICON-global-
 * Felder sind groß (Multi-Block-bz2); das reine-JS-`bz2`-Paket (verify-eps/icon-eu)
 * korrumpiert solche Streams. Die App entpackt mit `bzip2-wasm` (echtes libbzip2)
 * korrekt — hier spiegeln wir das über Pythons `bz2` (ebenfalls libbzip2) als
 * zuverlässigen Node-Ersatz. Dekodiert via echtem `decodeGrib2`, baut den Nearest-
 * Cell-Index (icosahedral, DACH-bbox wie im Adapter) und prüft DACH-Städte.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-icon-global.mjs
 */
import { execFileSync } from 'node:child_process';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';

const BASE = 'https://opendata.dwd.de/weather/nwp/icon/grib';
const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const singleUrl = (run, step, p) =>
  `${BASE}/${run.slice(8, 10)}/${p.toLowerCase()}/icon_global_icosahedral_single-level_${run}_${pad3(step)}_${p}.grib2.bz2`;
const invUrl = (run, p) =>
  `${BASE}/${run.slice(8, 10)}/${p.toLowerCase()}/icon_global_icosahedral_time-invariant_${run}_${p}.grib2.bz2`;

/** bz2 → raw via Python (libbzip2, Multi-Block-fest). */
function bunzip(buf) {
  return new Uint8Array(execFileSync('python', ['-c',
    'import sys,bz2; sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))'],
    { input: Buffer.from(buf), maxBuffer: 1 << 30 }));
}
async function headOk(u) { try { return (await fetch(u, { method: 'HEAD' })).ok; } catch { return false; } }
async function field(url) { return decodeGrib2(bunzip(await (await fetch(url)).arrayBuffer())); }

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

const now = new Date(); now.setUTCMinutes(0, 0, 0); now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 6));
let run = null;
for (let b = 0; b < 6; b++) {
  const c = new Date(now.getTime() - b * 6 * 3600e3);
  const r = `${c.getUTCFullYear()}${pad2(c.getUTCMonth() + 1)}${pad2(c.getUTCDate())}${pad2(c.getUTCHours())}`;
  if (await headOk(singleUrl(r, 0, 'T_2M'))) { run = r; break; }
}
console.log('latest run:', run);
check(!!run, 'publizierter Lauf gefunden');

const t0 = Date.now();
const [clat, clon, t, u, cl] = await Promise.all([
  field(invUrl(run, 'CLAT')), field(invUrl(run, 'CLON')),
  field(singleUrl(run, 3, 'T_2M')), field(singleUrl(run, 3, 'U_10M')), field(singleUrl(run, 3, 'CLCT')),
]);
console.log(`geladen/dekodiert in ${((Date.now() - t0) / 1000).toFixed(1)}s · Zellen ${t.ni} (clat ${clat.ni})`);
check(t.unstructured && t.ni === clat.ni && t.ni > 2_000_000, 'icosahedral, Zellzahl konsistent (~2,9 M)');

const lon = new Float32Array(clon.values.length);
for (let i = 0; i < lon.length; i++) lon[i] = clon.values[i] > 180 ? clon.values[i] - 360 : clon.values[i];
const cand = [];
for (let i = 0; i < clat.ni; i++) if (clat.values[i] >= 43.5 && clat.values[i] <= 57.5 && lon[i] >= 3.5 && lon[i] <= 19.5) cand.push(i);
console.log(`bbox-Kandidaten: ${cand.length} Zellen (von ${clat.ni})`);
check(cand.length > 100 && cand.length < clat.ni / 10, 'bbox-Vorfilter greift (DACH-Teilmenge)');
function nearest(la, lo) {
  let best = -1, bd = Infinity;
  for (const i of cand) { const dLa = clat.values[i] - la, dLo = lon[i] - lo; const d = dLa * dLa + dLo * dLo; if (d < bd) { bd = d; best = i; } }
  return best;
}
let tOk = 0, uOk = 0, cOk = 0;
for (const [nm, la, lo] of [['Berlin', 52.52, 13.40], ['München', 48.14, 11.58], ['Zürich', 47.37, 8.54], ['Wien', 48.21, 16.37]]) {
  const ci = nearest(la, lo);
  const tv = t.values[ci] - 273.15, uv = u.values[ci], cv = cl.values[ci];
  console.log(`  ${nm}: t=${tv.toFixed(1)}°C u=${uv.toFixed(1)}m/s clct=${cv.toFixed(0)}%`);
  if (tv > -30 && tv < 45) tOk++;
  if (Number.isFinite(uv) && Math.abs(uv) < 60) uOk++;
  if (cv >= 0 && cv <= 100) cOk++;
}
check(tOk === 4, 'Temperatur an allen DACH-Städten plausibel');
check(uOk === 4, 'Wind an allen DACH-Städten plausibel');
check(cOk === 4, 'Bewölkung an allen DACH-Städten plausibel');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
