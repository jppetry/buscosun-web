/**
 * Verifikation ARPEGE-Adapter (Phase 4.13) gegen LIVE-Daten. Ruft den echten
 * Shipping-Adapter (`fetchArpegeGrid`) — in Node ohne Proxy/CORS (MF_BASE window-
 * aware). Der Header-Walk über die gebündelte 264-MB-Datei ist bewusst langsam
 * (~200 kleine Byte-Range-Reads bis das TMP-Feld tief im File gefunden ist).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-arpege.mjs
 */
import { fetchArpegeGrid } from '../src/sources/arpegeSource.ts';

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

const t0 = Date.now();
const grid = await fetchArpegeGrid({ hours: 6 });
console.log(`geladen in ${((Date.now() - t0) / 1000).toFixed(1)}s (inkl. Header-Walk): ${grid.cols}×${grid.rows}, ${grid.times.length} Schritte, times[0]=${grid.times[0]?.toISOString()}`);

check(grid.cols === 24 && grid.rows === 20, `Gitterform ${grid.cols}×${grid.rows}`);
check(grid.times.length >= 1, `≥1 Zeitschritt (${grid.times.length})`);

const flat = grid.points[0];
const t = flat.filter((p) => p.temperature != null).map((p) => p.temperature);
const uv = flat.filter((p) => p.u != null && p.v != null);
const tMin = Math.min(...t), tMax = Math.max(...t), tMean = t.reduce((a, b) => a + b, 0) / (t.length || 1);
const spdMax = uv.length ? Math.max(...uv.map((p) => Math.hypot(p.u, p.v))) : 0;
console.log(`t_2m: ${t.length}/${flat.length}, Mittel ${tMean.toFixed(1)}°C [${tMin.toFixed(1)}..${tMax.toFixed(1)}] · wind max ${spdMax.toFixed(1)} m/s`);

check(t.length > flat.length * 0.9, 't_2m auf >90% der Punkte');
check(tMin > -40 && tMax < 50, 't_2m physikalisch plausibel');
check(uv.length > flat.length * 0.9, 'Wind auf >90% der Punkte');
check(spdMax > 0 && spdMax < 80, 'Windgeschwindigkeit plausibel');
check(flat.every((p) => p.cloudLow == null), 'Wolken bewusst leer (SP1-only, erwartet)');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
