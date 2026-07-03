/**
 * Verifikation ECMWF-Open-Data-Adapter (IFS Phase 4.7 · AIFS Phase 4.8) gegen
 * LIVE-Daten. Ruft den echten Shipping-Adapter (`fetchEcmwfGrid`) — in Node ohne
 * Proxy/CORS (ECMWF_BASE window-aware). Modell per Argument (default beide).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-ifs.mjs [ifs|aifs-single]
 */
import { fetchEcmwfGrid } from '../src/sources/ecmwfIfsSource.ts';

const arg = process.argv[2];
const MODELS = arg ? [arg] : ['ifs', 'aifs-single'];
let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

for (const model of MODELS) {
  console.log(`\n=== ${model} ===`);
  const t0 = Date.now();
  const grid = await fetchEcmwfGrid(model, { hours: 6 });
  console.log(`geladen in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${grid.cols}×${grid.rows}, ${grid.times.length} Schritte, times[0]=${grid.times[0]?.toISOString()}`);

  check(grid.cols === 24 && grid.rows === 20, `${model}: Gitterform`);
  check(grid.times.length >= 1, `${model}: ≥1 Zeitschritt (${grid.times.length})`);
  const flat = grid.points[0];
  const t = flat.filter((p) => p.temperature != null).map((p) => p.temperature);
  const uv = flat.filter((p) => p.u != null && p.v != null);
  const cl = flat.filter((p) => p.cloudLow != null);
  const tMin = Math.min(...t), tMax = Math.max(...t), tMean = t.reduce((a, b) => a + b, 0) / (t.length || 1);
  const spdMax = uv.length ? Math.max(...uv.map((p) => Math.hypot(p.u, p.v))) : 0;
  console.log(`  t_2m ${t.length}/${flat.length} Mittel ${tMean.toFixed(1)}°C [${tMin.toFixed(1)}..${tMax.toFixed(1)}] · wind max ${spdMax.toFixed(1)} m/s · clouds ${cl.length}/${flat.length}`);
  check(t.length > flat.length * 0.9 && tMin > -40 && tMax < 50, `${model}: t_2m voll + plausibel`);
  check(uv.length > flat.length * 0.9 && spdMax > 0 && spdMax < 80, `${model}: Wind voll + plausibel`);
  check(cl.length > flat.length * 0.9, `${model}: Wolken voll`);
}

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
