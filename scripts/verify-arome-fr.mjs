/**
 * Verifikation AROME-France-Adapter (Phase 4.3) gegen LIVE-Daten. Ruft den echten
 * Shipping-Adapter (`fetchAromeFranceGrid`) — in Node ohne Proxy/CORS. Prüft
 * Gitterform, ≥1 Zeitschritt, plausible Temperatur + Wind, Domänen-Bounds.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-arome-fr.mjs
 */
import { fetchAromeFranceGrid } from '../src/sources/aromeFranceSource.ts';

let failures = 0;
function check(cond, msg) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; }

const t0 = Date.now();
const grid = await fetchAromeFranceGrid({ hours: 6 });
console.log(`geladen in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${grid.cols}×${grid.rows}, ${grid.times.length} Schritte`);
console.log('bounds', grid.bounds, 'times[0]=', grid.times[0]?.toISOString());

check(grid.cols === 20 && grid.rows === 18, `Gitterform ${grid.cols}×${grid.rows}`);
check(grid.times.length >= 1, `≥1 Zeitschritt (${grid.times.length})`);
check(grid.bounds.latMin >= 45 && grid.bounds.latMax <= 55 && grid.bounds.lngMax <= 16, 'bounds in AROME∩DACH');

const flat = grid.points[0];
const t = flat.filter((p) => p.temperature != null).map((p) => p.temperature);
const uv = flat.filter((p) => p.u != null && p.v != null);
const tMin = Math.min(...t), tMax = Math.max(...t), tMean = t.reduce((a, b) => a + b, 0) / (t.length || 1);
const spd = uv.map((p) => Math.hypot(p.u, p.v));
const spdMax = spd.length ? Math.max(...spd) : 0;
console.log(`t_2m: ${t.length}/${flat.length} Punkte, Mittel ${tMean.toFixed(1)}°C [${tMin.toFixed(1)}..${tMax.toFixed(1)}]`);
console.log(`wind: ${uv.length}/${flat.length} Punkte, max ${spdMax.toFixed(1)} m/s`);

check(t.length > flat.length * 0.5, 't_2m auf >50% der Punkte');
check(tMin > -40 && tMax < 50, 't_2m physikalisch plausibel');
check(uv.length > flat.length * 0.5, 'Wind auf >50% der Punkte');
check(spdMax > 0 && spdMax < 80, 'Windgeschwindigkeit plausibel (<80 m/s)');
check(flat.every((p) => p.cloudLow == null), 'Wolken bewusst leer (SP1-only, erwartet)');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
