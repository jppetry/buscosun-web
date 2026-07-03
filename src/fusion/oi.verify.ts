/**
 * Verification harness for the local-OI core (`oi.ts`) — Phase 1 gate (i)/(ii).
 *
 * Pure, dependency-free checks against closed-form OI values and a constructed
 * DEM inversion fixture. Runs both under Node `--experimental-strip-types`
 * (via `scripts/verify-oi.mjs`) and in-browser (`window.__verifyOi`), matching
 * the repo's existing `verifyLapseShrinkage` / `verify-aec` harness pattern.
 * No `import.meta`/DOM usage here so the Node importer stays clean.
 *
 * Gate coverage:
 *   1. Single-obs interpolation property + R shrinkage (eq. 3).
 *   2. Symmetric two-station analytic closed form (eq. 3).
 *   3. R→∞ scaled limit → distance-weighted average (OI reproduces IDW class).
 *   4. L_v→∞ limit → elevation-independent (isotropic) weights (metric (8)).
 *   5. NaN innovation + coverage-mask semantics.
 *   6. Synthetic inversion: valley obs must NOT warm the adjacent ridge, and the
 *      anisotropic metric (8) is demonstrably what prevents it.
 */

import {
  buildOiKernel, applyOiKernel, oiCoverageMask, soarCorrelation, oiMetricDist2,
  type OiObservation, type OiGridSpec, type OiParams,
} from './oi.ts';

export interface OiCheck { name: string; expected: string; got: string; ok: boolean }
export interface OiVerifyResult { checks: OiCheck[]; passed: number; failed: number }

const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const fmt = (x: number) => Math.round(x * 1e6) / 1e6;

export function verifyOi(): OiVerifyResult {
  const checks: OiCheck[] = [];
  const push = (name: string, expected: string, got: number | string, ok: boolean) =>
    checks.push({ name, expected, got: typeof got === 'number' ? String(fmt(got)) : got, ok });

  // Shared geometry: a small patch near DACH centre (equirect coords).
  const xc = (10.5 + 180) / 360;   // ~10.5°E
  const yc = (90 - 50.5) / 180;    // ~50.5°N
  const P0: OiParams = { lhKm: 60, lvM: 500, kMax: 24, jitter: 0 };

  // ── 1. Single-obs interpolation + shrinkage ────────────────────────────────
  {
    const r = 1e-4, d = 5, E = 500;
    const obs: OiObservation[] = [{ x: xc, y: yc, elev: E, obsVarRatio: r }];
    const grid: OiGridSpec = {
      cols: 1, rows: 1, uvBounds: [xc, yc, xc, yc], cellElev: Float32Array.from([E]),
    };
    const k = buildOiKernel(obs, grid, P0);
    const inc = applyOiKernel(k, Float32Array.from([d]))[0];
    const expExact = d / (1 + r);       // w = 1/(1+r)
    push('1a single-obs increment = d/(1+r)', String(fmt(expExact)), inc, approx(inc, expExact, 1e-6));
    push('1b interpolation limit (r→0): inc ≈ d', String(d), inc, approx(inc, d, 2e-3));
  }

  // ── 2. Symmetric two-station closed form ───────────────────────────────────
  {
    const r = 0.1, d = 3, E = 400, a = 0.0006;   // Δx in equirect (~0.2° lon)
    const obs: OiObservation[] = [
      { x: xc - a, y: yc, elev: E, obsVarRatio: r },
      { x: xc + a, y: yc, elev: E, obsVarRatio: r },
    ];
    const grid: OiGridSpec = {
      cols: 1, rows: 1, uvBounds: [xc, yc, xc, yc], cellElev: Float32Array.from([E]),
    };
    const k = buildOiKernel(obs, grid, P0);
    const inc = applyOiKernel(k, Float32Array.from([d, d]))[0];
    // Closed form: increment = 2 ρ_c d / (1 + r + ρ_d)
    const rhoC = soarCorrelation(Math.sqrt(oiMetricDist2(xc, yc, E, xc - a, yc, E, P0.lhKm, P0.lvM)));
    const rhoD = soarCorrelation(Math.sqrt(oiMetricDist2(xc - a, yc, E, xc + a, yc, E, P0.lhKm, P0.lvM)));
    const exp = (2 * rhoC * d) / (1 + r + rhoD);
    push('2 symmetric two-station = 2ρ_c·d/(1+r+ρ_d)', String(fmt(exp)), inc, approx(inc, exp, 1e-5));
  }

  // ── 3. R→∞ scaled limit → distance-weighted (IDW-class) average ────────────
  {
    const r = 1e6, E = 300;
    const ds = [4, -2, 1];
    const pos = [-0.0008, 0.0003, 0.0011];
    const obs: OiObservation[] = pos.map((p) => ({ x: xc + p, y: yc, elev: E, obsVarRatio: r }));
    const grid: OiGridSpec = {
      cols: 1, rows: 1, uvBounds: [xc, yc, xc, yc], cellElev: Float32Array.from([E]),
    };
    const k = buildOiKernel(obs, grid, P0);
    const inc = applyOiKernel(k, Float32Array.from(ds))[0];
    // As r→∞, C→diag(1+r), w→ρ_c/(1+r), so inc → Σ ρ_ci d_i /(1+r).
    let num = 0;
    for (let i = 0; i < pos.length; i++) {
      const rho = soarCorrelation(Math.sqrt(oiMetricDist2(xc, yc, E, xc + pos[i], yc, E, P0.lhKm, P0.lvM)));
      num += rho * ds[i];
    }
    const exp = num / (1 + r);
    push('3 R→∞ scaled: inc ≈ Σρ_ci·d_i/(1+r)', String(fmt(exp)), inc, approx(inc, exp, Math.abs(exp) * 1e-3 + 1e-9));
  }

  // ── 4. L_v→∞ → elevation-independent (isotropic horizontal) weights ────────
  {
    const r = 0.2, E1 = 200, E2 = 2200;
    // Two obs at different elevations, one grid cell.
    const obs = (): OiObservation[] => [
      { x: xc - 0.0005, y: yc, elev: E1, obsVarRatio: r },
      { x: xc + 0.0005, y: yc, elev: E2, obsVarRatio: r },
    ];
    const grid: OiGridSpec = {
      cols: 1, rows: 1, uvBounds: [xc, yc, xc, yc], cellElev: Float32Array.from([1200]),
    };
    const big: OiParams = { lhKm: 60, lvM: 1e12, kMax: 24, jitter: 0 };   // L_v→∞
    const kBig = buildOiKernel(obs(), grid, big);
    // Same obs but with elevations equalised (vertical term removed by construction).
    const flat = obs().map((o) => ({ ...o, elev: 1200 }));
    const gridFlat: OiGridSpec = { ...grid, cellElev: Float32Array.from([1200]) };
    const kFlat = buildOiKernel(flat, gridFlat, big);
    let maxDiff = 0;
    for (let q = 0; q < kBig.weights.length; q++) {
      maxDiff = Math.max(maxDiff, Math.abs(kBig.weights[q] - kFlat.weights[q]));
    }
    push('4 L_v→∞: weights elevation-independent', '≈0', maxDiff, maxDiff < 1e-6);
  }

  // ── 5. NaN innovation + coverage mask ──────────────────────────────────────
  {
    const r = 0.1, E = 500;
    const obs: OiObservation[] = [
      { x: xc, y: yc, elev: E, obsVarRatio: r },
      { x: xc + 0.02, y: yc, elev: E, obsVarRatio: r },
    ];
    // 2-cell grid: cell 0 coincident with obs 0; cell 1 far from both.
    const farX = xc + 0.5;   // ~180° away in equirect → effectively zero corr
    const grid: OiGridSpec = {
      cols: 2, rows: 1, uvBounds: [xc, yc, farX, yc], cellElev: Float32Array.from([E, E]),
    };
    const k = buildOiKernel(obs, grid, P0);
    const incNaN = applyOiKernel(k, Float32Array.from([NaN, 2]));   // obs0 missing this hour
    const incAll = applyOiKernel(k, Float32Array.from([0, 2]));     // obs0 = 0 innovation
    const finite = incNaN.every((v) => v === v);
    push('5a NaN innovation → finite output', 'all finite', finite ? 'finite' : 'NaN', finite);
    // Skipping a NaN obs equals treating its innovation as 0 (per applyOiKernel contract).
    let same = true;
    for (let c = 0; c < incNaN.length; c++) if (!approx(incNaN[c], incAll[c], 1e-7)) same = false;
    push('5b NaN-skip == zero-innovation', 'equal', same ? 'equal' : 'differ', same);
    const mask = oiCoverageMask(k);
    push('5c coverage: cell on obs → 255', '255', mask[0], mask[0] === 255);
    push('5d coverage: far cell → 0', '0', mask[1], mask[1] === 0);
  }

  // ── 6. Synthetic inversion: valley obs must not warm the ridge ─────────────
  {
    const r = 0.1, d = 5;              // one warm valley obs, +5 K innovation
    const valleyElev = 500, ridgeElev = 2500;
    // Two horizontally-adjacent cells (~5 km apart): valley then ridge.
    const dxLon = 0.00007;             // ~0.025° lon ≈ a couple km
    const grid: OiGridSpec = {
      cols: 2, rows: 1, uvBounds: [xc, yc, xc + dxLon, yc],
      cellElev: Float32Array.from([valleyElev, ridgeElev]),
    };
    const obs: OiObservation[] = [{ x: xc, y: yc, elev: valleyElev, obsVarRatio: r }];

    const kAniso = buildOiKernel(obs, grid, { lhKm: 60, lvM: 500, kMax: 24, jitter: 0 });
    const incA = applyOiKernel(kAniso, Float32Array.from([d]));
    const ratioA = incA[1] / incA[0];   // ridge / valley
    push('6a anisotropic: ridge warms ≪ valley', '<0.30', ratioA, ratioA < 0.30 && incA[0] > 0);

    // Control: without the vertical metric (L_v→∞) the valley obs DOES warm the
    // ridge nearly equally — i.e. metric (8) is what buys the inversion physics.
    const kIso = buildOiKernel(obs, grid, { lhKm: 60, lvM: 1e12, kMax: 24, jitter: 0 });
    const incI = applyOiKernel(kIso, Float32Array.from([d]));
    const ratioI = incI[1] / incI[0];
    push('6b isotropic control: ridge ≈ valley', '>0.80', ratioI, ratioI > 0.80);
  }

  return {
    checks,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
  };
}

// Dev-only browser global. `import.meta.env?.DEV` is undefined (falsy) under the
// Node `--experimental-strip-types` harness (Vite injects `env`), so this block
// is simply skipped there — mirrors fusionEngine.ts's guard.
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __verifyOi?: typeof verifyOi }).__verifyOi = verifyOi;
}
