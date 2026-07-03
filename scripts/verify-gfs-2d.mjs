/**
 * Verifikation GFS-2D-Raster-Adapter (Phase 4.5) gegen LIVE-Daten. Ruft den
 * echten Shipping-Adapter (`fetchGfs2dGrid`) — in Node ohne Proxy/CORS (GFS_BASE
 * window-aware → direkt gegen den AWS-S3-Bucket). Prüft Gitterform, ≥1 Schritt,
 * plausible Temperatur/Wind/Wolken, DACH-Bounds.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-gfs-2d.mjs
 */
import { fetchGfs2dGrid } from '../src/sources/gfs2dSource.ts';

let failures = 0;
function check(cond, msg) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; }

const t0 = Date.now();
const grid = await fetchGfs2dGrid({ hours: 6 });
console.log(`geladen in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${grid.cols}×${grid.rows}, ${grid.times.length} Schritte`);
console.log('bounds', grid.bounds, 'times[0]=', grid.times[0]?.toISOString());

check(grid.cols === 24 && grid.rows === 20, `Gitterform ${grid.cols}×${grid.rows}`);
check(grid.times.length >= 1, `≥1 Zeitschritt (${grid.times.length})`);
check(grid.bounds.latMin >= 45 && grid.bounds.latMax <= 56, 'bounds über DACH');

const flat = grid.points[0];
const t = flat.filter((p) => p.temperature != null).map((p) => p.temperature);
const uv = flat.filter((p) => p.u != null && p.v != null);
const cl = flat.filter((p) => p.cloudLow != null);
const tMin = Math.min(...t), tMax = Math.max(...t), tMean = t.reduce((a, b) => a + b, 0) / (t.length || 1);
const spd = uv.map((p) => Math.hypot(p.u, p.v));
const spdMax = spd.length ? Math.max(...spd) : 0;
console.log(`t_2m: ${t.length}/${flat.length}, Mittel ${tMean.toFixed(1)}°C [${tMin.toFixed(1)}..${tMax.toFixed(1)}]`);
console.log(`wind: ${uv.length}/${flat.length}, max ${spdMax.toFixed(1)} m/s · clouds: ${cl.length}/${flat.length}`);

check(t.length > flat.length * 0.9, 't_2m auf >90% der Punkte');
check(tMin > -40 && tMax < 50, 't_2m physikalisch plausibel');
check(uv.length > flat.length * 0.9, 'Wind auf >90% der Punkte');
check(spdMax > 0 && spdMax < 80, 'Windgeschwindigkeit plausibel');
check(cl.length > flat.length * 0.9, 'Wolken auf >90% der Punkte (GFS TCDC)');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
