/**
 * Verifikation des icosahedral-GRIB2-Pfads (GDT 101 + Multi-Message) gegen ECHTE
 * ICON-D2-EPS-Daten (Phase 4.1). Node fetcht opendata.dwd.de direkt (kein CORS),
 * entpackt bz2, dekodiert via `decodeGrib2All` aus dem echten App-Modul und prüft:
 *   - clat/clon: 1 Nachricht, 542040 Zellen, plausible DACH-Koordinaten;
 *   - t_2m EPS: ~20 Member (Multi-Message), Ensemble-Mittel in sanem Kelvin-Bereich
 *     an der Berlin-nächsten Zelle.
 * Exit != 0 bei Fehlschlag (gate-bar wie qa:layers).
 *
 *   node --experimental-strip-types scripts/verify-eps.mjs
 */
import bz2mod from 'bz2';
import { decodeGrib2All } from '../src/sources/gribDecode.ts';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2-eps/grib';

let failed = 0;
const ok = (cond, label) => { console.log(`  ${cond ? '✓ PASS' : '✗ FAIL'} — ${label}`); if (!cond) failed++; };

async function firstFile(hh, param) {
  const r = await fetch(`${BASE}/${hh}/${param}/`);
  if (!r.ok) return null;
  const html = await r.text();
  const m = [...html.matchAll(/href="([^"]+\.grib2\.bz2)"/g)].map((x) => x[1]);
  return m[0] ?? null;
}

async function fetchDecodeAll(hh, param) {
  const name = await firstFile(hh, param);
  if (!name) return null;
  const buf = await (await fetch(`${BASE}/${hh}/${param}/${name}`)).arrayBuffer();
  const raw = bz2.decompress(new Uint8Array(buf));
  return decodeGrib2All(raw);
}

// clat/clon values: detect radians (|lat|<1.6) vs degrees, return degrees.
function toDegrees(values) {
  let maxAbs = 0;
  for (let i = 0; i < values.length; i++) { const a = Math.abs(values[i]); if (Number.isFinite(a) && a > maxAbs) maxAbs = a; }
  const isRad = maxAbs < 1.6;
  const f = isRad ? 180 / Math.PI : 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] * f;
  return { out, isRad };
}

console.log('\nICON-D2-EPS icosahedral-Decoder (GDT 101 + Multi-Message) gegen echte Daten:\n');

// Find a run hour with content.
let hh = null;
for (const cand of ['00', '03', '06', '09', '12', '15', '18', '21']) {
  if (await firstFile(cand, 't_2m')) { hh = cand; break; }
}
ok(hh != null, `EPS-Lauf mit Inhalt gefunden (${hh})`);
if (hh == null) process.exit(1);

const t0 = performance.now();
const clatF = await fetchDecodeAll(hh, 'clat');
const clonF = await fetchDecodeAll(hh, 'clon');
ok(clatF?.length === 1 && clonF?.length === 1, 'clat/clon: genau 1 Nachricht');
ok(clatF?.[0]?.unstructured === true, 'clat ist unstructured (GDT 101)');
const N = clatF?.[0]?.ni ?? 0;
ok(N === 542040, `Zellzahl ${N} == 542040`);
ok(clonF?.[0]?.ni === N, 'clon hat gleiche Zellzahl');

const { out: lat, isRad } = toDegrees(clatF[0].values);
const { out: lon } = toDegrees(clonF[0].values);
let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
for (let i = 0; i < N; i++) {
  if (lat[i] < latMin) latMin = lat[i]; if (lat[i] > latMax) latMax = lat[i];
  if (lon[i] < lonMin) lonMin = lon[i]; if (lon[i] > lonMax) lonMax = lon[i];
}
console.log(`  clat/clon Einheit: ${isRad ? 'Radiant→Grad' : 'Grad'} · lat ${latMin.toFixed(1)}..${latMax.toFixed(1)} · lon ${lonMin.toFixed(1)}..${lonMax.toFixed(1)}`);
ok(latMin >= 42 && latMax < 60 && lonMin > -6 && lonMax < 22, 'Koordinaten decken DACH plausibel ab');

// Ensemble mean of t_2m over all members (decodeGrib2All skips a rare malformed member).
const t2mName = await firstFile(hh, 't_2m');
const t2mRaw = bz2.decompress(new Uint8Array(await (await fetch(`${BASE}/${hh}/t_2m/${t2mName}`)).arrayBuffer()));
const t2m = decodeGrib2All(t2mRaw);
ok((t2m?.length ?? 0) >= 10, `t_2m Multi-Message: ${t2m?.length} Member dekodiert (robust, überspringt fehlerhafte)`);
ok(t2m.every((f) => f.ni === N), 'alle Member haben die Zellzahl N');

const mean = new Float64Array(N);
const cnt = new Int32Array(N);
for (const f of t2m) for (let i = 0; i < N; i++) { const v = f.values[i]; if (Number.isFinite(v)) { mean[i] += v; cnt[i]++; } }
for (let i = 0; i < N; i++) mean[i] = cnt[i] ? mean[i] / cnt[i] : NaN;

// Nearest cell to Berlin (52.52, 13.40): sanity-check the mean temperature.
let best = -1, bestD = Infinity;
for (let i = 0; i < N; i++) {
  const d = (lat[i] - 52.52) ** 2 + (lon[i] - 13.40) ** 2;
  if (d < bestD) { bestD = d; best = i; }
}
const berlinK = mean[best];
console.log(`  Ensemble-Mittel t_2m @ Berlin-Zelle: ${berlinK.toFixed(1)} K (${(berlinK - 273.15).toFixed(1)} °C)`);
ok(berlinK > 250 && berlinK < 320, 't_2m Ensemble-Mittel in sanem Kelvin-Bereich (250..320)');

// Member spread should be non-zero (it's a real ensemble, not 20× the same field).
let sameCount = 0;
for (let s = 0; s < 200; s++) { const i = (s * 2711) % N; if (t2m[0].values[i] === t2m[t2m.length - 1].values[i]) sameCount++; }
ok(sameCount < 200, 'Member unterscheiden sich (echtes Ensemble, kein Duplikat)');

console.log(`\n  ${failed === 0 ? 'ALLE GRÜN' : failed + ' FEHLER'} · Decode+Fetch ${(performance.now() - t0).toFixed(0)} ms\n`);
process.exit(failed === 0 ? 0 : 1);
