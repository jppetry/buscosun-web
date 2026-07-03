/**
 * Verifikation DWD-AICON-Adapter (Phase 4.10) gegen LIVE-Daten. AICON-Datenfelder
 * sind rohes GRIB2 (Node-fähig), die Koordinaten leiht sich der Adapter aber vom
 * ICON-global-Gitter (clat/clon, bz2 → `bzip2-wasm` im Browser). Hier wird clat/
 * clon wie in verify-icon-global über Pythons `bz2` entpackt. Prüft: AICON teilt
 * die ICON-global-Zellordnung und liefert plausible Werte an DACH-Städten.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-aicon.mjs
 */
import { execFileSync } from 'node:child_process';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';

const IG = 'https://opendata.dwd.de/weather/nwp/icon/grib';
const AI = 'https://opendata.dwd.de/weather/nwp/v1/m/aicon/p';
const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const bunzip = (b) => new Uint8Array(execFileSync('python', ['-c',
  'import sys,bz2;sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))'],
  { input: Buffer.from(b), maxBuffer: 1 << 30 }));
async function headOk(u) { try { return (await fetch(u, { method: 'HEAD' })).ok; } catch { return false; } }

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

// AICON-Lauf (ISO) + passender ICON-global-Lauf (YYYYMMDDHH) für die Koordinaten.
const now = new Date(); now.setUTCMinutes(0, 0, 0); now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 6));
let aiRun = null, igRun = null;
for (let b = 0; b < 6; b++) {
  const c = new Date(now.getTime() - b * 6 * 3600e3);
  const iso = `${c.getUTCFullYear()}-${pad2(c.getUTCMonth() + 1)}-${pad2(c.getUTCDate())}T${pad2(c.getUTCHours())}:00`;
  const ymd = `${c.getUTCFullYear()}${pad2(c.getUTCMonth() + 1)}${pad2(c.getUTCDate())}${pad2(c.getUTCHours())}`;
  if (await headOk(`${AI}/T_2M/r/${iso}/s/PT000H00M.grib2`)) { aiRun = iso; igRun = ymd; break; }
}
console.log('AICON run:', aiRun);
check(!!aiRun, 'publizierter AICON-Lauf gefunden');

const hh = igRun.slice(8, 10);
async function igCoord(p) { return decodeGrib2(bunzip(await (await fetch(`${IG}/${hh}/${p.toLowerCase()}/icon_global_icosahedral_time-invariant_${igRun}_${p}.grib2.bz2`)).arrayBuffer())); }
async function aiField(p) { return decodeGrib2(new Uint8Array(await (await fetch(`${AI}/${p}/r/${aiRun}/s/PT003H00M.grib2`)).arrayBuffer())); }

const t0 = Date.now();
const [clat, clon, t, u, tp] = await Promise.all([igCoord('CLAT'), igCoord('CLON'), aiField('T_2M'), aiField('U_10M'), aiField('TOT_PREC')]);
console.log(`geladen in ${((Date.now() - t0) / 1000).toFixed(1)}s · AICON-Zellen ${t.ni} · clat ${clat.ni}`);
check(t.unstructured && t.ni === clat.ni && t.ni > 2_000_000, 'AICON icosahedral, gitter-identisch zu ICON-global');

const lon = (i) => clon.values[i] > 180 ? clon.values[i] - 360 : clon.values[i];
const cand = [];
for (let i = 0; i < clat.ni; i++) if (clat.values[i] >= 43.5 && clat.values[i] <= 57.5 && lon(i) >= 3.5 && lon(i) <= 19.5) cand.push(i);
const near = (la, lo) => { let b = -1, bd = 1e9; for (const i of cand) { const dLa = clat.values[i] - la, dLo = lon(i) - lo; const d = dLa * dLa + dLo * dLo; if (d < bd) { bd = d; b = i; } } return b; };
let tOk = 0, uOk = 0, pOk = 0;
for (const [nm, la, lo] of [['Berlin', 52.52, 13.40], ['München', 48.14, 11.58], ['Zürich', 47.37, 8.54], ['Wien', 48.21, 16.37]]) {
  const i = near(la, lo);
  const tv = t.values[i] - 273.15, uv = u.values[i], pv = tp.values[i];
  console.log(`  ${nm}: t=${tv.toFixed(1)}°C u=${uv.toFixed(1)}m/s tot_prec=${pv.toFixed(1)}mm`);
  if (tv > -30 && tv < 45) tOk++;
  if (Number.isFinite(uv) && Math.abs(uv) < 60) uOk++;
  if (Number.isFinite(pv) && pv >= 0) pOk++;
}
check(tOk === 4, 'Temperatur an allen DACH-Städten plausibel');
check(uOk === 4, 'Wind an allen DACH-Städten plausibel');
check(pOk === 4, 'Niederschlag an allen DACH-Städten belegt');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
