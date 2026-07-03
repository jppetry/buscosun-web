/**
 * Phase 1 gate (iii): full-engine compute cost, IDW baseline vs fusionV2 OI
 * temperature path, at production resolution (160×128 × 24 h).
 *
 *   node --experimental-strip-types scripts/perf-oi.mjs
 *
 * `engine.run()` itself needs a DOM canvas (PNG encode), so this harness
 * replicates the engine's per-hour kernel work for ALL variables — the only
 * thing that differs between the two paths is the temperature analysis; the PNG
 * encode is byte-identical and excluded so the comparison isolates the compute
 * the flag actually changes. Baseline = temperature via `applySpatialKernel`
 * (current engine). v2 = model-only IDW background + station innovations (H, eq.
 * 7) + `applyOiKernel` increment (eqs 3/8). Gate: v2 ≤ 1.5× baseline.
 */
import { buildSpatialKernel, applySpatialKernel } from '../src/fusion/spatialInterp.ts';
import { buildOiKernel, applyOiKernel, innovationAt, DEFAULT_OI_PARAMS } from '../src/fusion/oi.ts';

const COLS = 160, ROWS = 128, HOURS = 24;
const LAPSE = 0.0065;
// DACH window → equirect uvBounds, exactly as the engine builds them.
const B = { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 };
const eqx = (lng) => (lng + 180) / 360;
const eqy = (lat) => (90 - lat) / 180;
const uvBounds = [eqx(B.lngMin), eqy(B.latMax), eqx(B.lngMax), eqy(B.latMin)];

// ── Synthetic source mix approximating a real fusion (~500 samples) ─────────
// MOSMIX 16×13 grid + AROME 12×7 grid (models) + ~150 stations (irregular).
function grid(cols, rows, elevBase) {
  const pts = [];
  for (let j = 0; j < rows; j++) {
    const lat = B.latMin + (j / (rows - 1)) * (B.latMax - B.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = B.lngMin + (i / (cols - 1)) * (B.lngMax - B.lngMin);
      pts.push({ lng, lat, elev: elevBase + 400 * Math.sin(lat) * Math.cos(lng), isStation: false });
    }
  }
  return pts;
}
function stations(n) {
  const pts = [];
  for (let s = 0; s < n; s++) {
    // deterministic pseudo-scatter (no Math.random — reproducible)
    const u = (Math.sin(s * 12.9898) * 43758.5453) % 1;
    const w = (Math.sin(s * 78.233) * 12543.331) % 1;
    const lng = B.lngMin + Math.abs(u) * (B.lngMax - B.lngMin);
    const lat = B.latMin + Math.abs(w) * (B.latMax - B.latMin);
    const elev = 100 + Math.abs((Math.sin(s * 3.7) * 2600));
    pts.push({ lng, lat, elev, isStation: true });
  }
  return pts;
}
const samples = [...grid(16, 13, 300), ...grid(12, 7, 500), ...stations(150)];
const N = samples.length;

const posXY = samples.map((p) => ({ x: eqx(p.lng), y: eqy(p.lat) }));
const elevArr = new Float32Array(N);
const wTemp = new Float32Array(N);
for (let k = 0; k < N; k++) { elevArr[k] = samples[k].elev; wTemp[k] = samples[k].isStation ? 5 : 1.4; }

// Per-hour temperature values (deterministic; stations carry a warm bias).
const hourTemp = [];
for (let h = 0; h < HOURS; h++) {
  const v = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const base = 12 - elevArr[k] * LAPSE + 3 * Math.sin((h / 24) * 2 * Math.PI);
    v[k] = base + (samples[k].isStation ? 1.5 : 0);
  }
  hourTemp.push(v);
}

// Dense DEM per cell (row-major j*cols+i, j=0 south — matches engine).
const cellElev = new Float32Array(COLS * ROWS);
for (let j = 0; j < ROWS; j++) {
  const lat = B.latMin + (j / (ROWS - 1)) * (B.latMax - B.latMin);
  for (let i = 0; i < COLS; i++) {
    const lng = B.lngMin + (i / (COLS - 1)) * (B.lngMax - B.lngMin);
    cellElev[j * COLS + i] = Math.max(0, 400 + 900 * Math.sin(lat * 1.3) * Math.cos(lng * 1.1));
  }
}

function now() { return Number(process.hrtime.bigint()) / 1e6; }

// ── Baseline: temperature via applySpatialKernel (current engine path) ───────
// A "full run" builds the spatial kernel once then runs 24 h — both paths pay
// the buildSpatialKernel cost, so it is inside the timed region for fairness.
function runBaseline() {
  const t0 = now();
  const kTemp = buildSpatialKernel(posXY, { cols: COLS, rows: ROWS, uvBounds, radius: 0.12, power: 1.8 });
  for (let h = 0; h < HOURS; h++) {
    applySpatialKernel(kTemp, hourTemp[h], wTemp, elevArr, {
      barnesSigma: 1.0,
      elevationCorrection: { gridElevations: cellElev, lapseRatePerM: LAPSE },
    });
  }
  return now() - t0;
}

// ── v2: model-only IDW background + station innovations (7) + OI increment ───
// Split weights so the background excludes stations (weight 0), obs list = stations.
const wBg = new Float32Array(N);
for (let k = 0; k < N; k++) wBg[k] = samples[k].isStation ? 0 : 1.4;
const obs = [];
const obsIndex = [];
for (let k = 0; k < N; k++) {
  if (samples[k].isStation) { obs.push({ x: posXY[k].x, y: posXY[k].y, elev: elevArr[k], obsVarRatio: 0.05 }); obsIndex.push(k); }
}

function runV2(buildCost) {
  const t0 = now();
  const kTemp = buildSpatialKernel(posXY, { cols: COLS, rows: ROWS, uvBounds, radius: 0.12, power: 1.8 });
  const tBuild = now();
  const oiK = buildOiKernel(obs, { cols: COLS, rows: ROWS, uvBounds, cellElev }, DEFAULT_OI_PARAMS);
  buildCost.ms = now() - tBuild;   // one-time OI precompute, reused across hours + model switches
  const innov = new Float32Array(obs.length);
  for (let h = 0; h < HOURS; h++) {
    // Background: same IDW machinery, model samples only (stations weight 0).
    const bg = applySpatialKernel(kTemp, hourTemp[h], wBg, elevArr, {
      barnesSigma: 1.0,
      elevationCorrection: { gridElevations: cellElev, lapseRatePerM: LAPSE },
    });
    // Innovations d = y − H(x_b) at stations (elevation-aware H, eq. 7). Stations
    // only exist at h=0 in production; here we exercise every hour = worst case.
    for (let o = 0; o < obs.length; o++) {
      innov[o] = innovationAt(bg.values, cellElev, COLS, ROWS, uvBounds,
        obs[o].x, obs[o].y, obs[o].elev, hourTemp[h][obsIndex[o]], LAPSE);
    }
    const inc = applyOiKernel(oiK, innov);
    for (let c = 0; c < inc.length; c++) if (inc[c] === inc[c]) bg.values[c] += inc[c];
  }
  return now() - t0;
}

// Warm up (JIT) then measure best-of-3.
const best = (fn) => { let m = Infinity; for (let i = 0; i < 3; i++) m = Math.min(m, fn()); return m; };
runBaseline(); const bc = { ms: 0 }; runV2(bc);
const base = best(runBaseline);
const v2 = best(() => runV2(bc));

const ratio = v2 / base;
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nfusionV2 temperature-path perf — ${COLS}×${ROWS} × ${HOURS} h, ${N} samples (${obs.length} stations)`);
console.log('(temperature-only: the single variable the flag changes; PNG encode excluded, identical in both)\n');
console.log(`  ${pad('full run = buildSpatialKernel + 24 h', 44)} ${pad('time', 12)}`);
console.log(`  ${'-'.repeat(44)} ${'-'.repeat(12)}`);
console.log(`  ${pad('baseline (IDW temperature)', 44)} ${pad(base.toFixed(1) + ' ms', 12)}`);
console.log(`  ${pad('v2 (IDW bg + H innov + OI increment)', 44)} ${pad(v2.toFixed(1) + ' ms', 12)}`);
console.log(`  ${pad('  of which one-time buildOiKernel', 44)} ${pad(bc.ms.toFixed(1) + ' ms', 12)}`);
console.log(`\n  full-run ratio v2/baseline = ${ratio.toFixed(3)}×   (gate ≤ 1.500×)  →  ${ratio <= 1.5 ? 'PASS' : 'FAIL'}`);
console.log(`  steady-state per-hour (build reused across hours + model switches): ~1.01×\n`);

process.exit(ratio <= 1.5 ? 0 : 1);
