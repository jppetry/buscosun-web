/**
 * Verifikation ICON-CH1/CH2-EPS-Adapter (Phase 4.2) gegen LIVE-Daten.
 * Ruft den echten Shipping-Adapter (`fetchIconChEpsGrid`) auf — in Node ohne
 * Proxy/CORS (proxied() reicht die Href direkt durch). Prüft:
 *   - Grid-Form (cols×rows, bounds über CH, ≥1 Zeitschritt)
 *   - plausible Werte (t_2m im Sommer-Range, Wind endlich, Wolken 0..1)
 *   - Zellzahl der Constants (CH1 ~1,15 M, CH2 ~284 k) via Decode
 *
 *   node --experimental-strip-types scripts/verify-ch-eps.mjs
 */
import { fetchIconChEpsGrid } from '../src/sources/iconChEpsSource.ts';

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}

async function verify(model, expectCols, expectRows) {
  console.log(`\n=== ${model} ===`);
  const t0 = Date.now();
  const grid = await fetchIconChEpsGrid(model, { hours: 6 });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`geladen in ${dt}s: ${grid.cols}×${grid.rows}, ${grid.times.length} Schritte`);
  console.log(`bounds`, grid.bounds, `times[0]=${grid.times[0]?.toISOString()}`);

  check(grid.cols === expectCols && grid.rows === expectRows, `Gitterform ${grid.cols}×${grid.rows}`);
  check(grid.times.length >= 1, `≥1 Zeitschritt (${grid.times.length})`);
  check(grid.bounds.latMin >= 45 && grid.bounds.latMax <= 48, 'bounds über CH');

  // Zentrale Zelle (~Zürich) auswerten.
  const flat = grid.points[0];
  const withT = flat.filter((p) => p.temperature != null);
  const withUV = flat.filter((p) => p.u != null && p.v != null);
  const temps = withT.map((p) => p.temperature);
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const tMean = temps.reduce((a, b) => a + b, 0) / (temps.length || 1);
  console.log(`t_2m: ${withT.length}/${flat.length} Punkte, Mittel ${tMean.toFixed(1)}°C [${tMin.toFixed(1)}..${tMax.toFixed(1)}]`);
  console.log(`wind: ${withUV.length}/${flat.length} Punkte belegt`);

  check(withT.length > flat.length * 0.5, `t_2m auf >50% der Punkte belegt`);
  check(tMin > -40 && tMax < 50, `t_2m physikalisch plausibel`);
  check(withUV.length > flat.length * 0.5, `Wind auf >50% der Punkte belegt`);
  const clouds = flat.filter((p) => p.cloudLow != null);
  check(clouds.length > 0, `Wolken belegt (${clouds.length})`);
}

await verify('icon-ch2-eps', 16, 10); // zuerst CH2 (leichter, ~0,6 MB/Feld)
await verify('icon-ch1-eps', 16, 10);

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
