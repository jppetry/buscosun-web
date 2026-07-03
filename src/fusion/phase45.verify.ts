/**
 * Closed-form checks for the Phase 4/5 machinery: increment persistence (eq 10),
 * wind speed-preserving rescale (eq 14), and uncertainty (eq 15). Node
 * `--experimental-strip-types` + browser dev global. Parameters exercised here
 * are provisional priors until the archive matures.
 */

import { persistenceFactor, rescaleWindToSpeed, addPersistedIncrement } from './increment.ts';
import { analysisSigma, multiModelSpread2, forecastSigma2 } from './uncertainty.ts';

export interface P45Check { name: string; expected: string; got: string; ok: boolean }
export interface P45Result { checks: P45Check[]; passed: number; failed: number }

const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const f = (x: number) => Math.round(x * 1e5) / 1e5;

export function verifyPhase45(): P45Result {
  const checks: P45Check[] = [];
  const push = (name: string, expected: string, got: number | string, ok: boolean) =>
    checks.push({ name, expected, got: typeof got === 'number' ? String(f(got)) : got, ok });

  // ── eq. (10) increment persistence ─────────────────────────────────────────
  push('10a factor(0,4)=1 (pure analysis)', '1', persistenceFactor(0, 4), persistenceFactor(0, 4) === 1);
  push('10b factor(4,4)=e^-1', '0.36788', persistenceFactor(4, 4), approx(persistenceFactor(4, 4), Math.exp(-1), 1e-5));
  push('10c factor(12,4)=e^-3', '0.04979', persistenceFactor(12, 4), approx(persistenceFactor(12, 4), Math.exp(-3), 1e-5));
  push('10d Tv≤0 → step (τ>0→0)', '0', persistenceFactor(2, 0), persistenceFactor(2, 0) === 0);
  {
    const bg = Float32Array.from([10, 20, NaN]);
    addPersistedIncrement(bg, Float32Array.from([2, NaN, 5]), 4, 4);
    const okA = approx(bg[0], 10 + 2 * Math.exp(-1), 1e-4) && bg[1] === 20 && bg[2] !== bg[2];
    push('10e addPersisted: NaN-skip both sides', 'bg0=10.736', bg[0], okA);
  }

  // ── eq. (14) wind speed-preserving rescale ─────────────────────────────────
  {
    const [u, v] = rescaleWindToSpeed(3, 4, 10);            // mag 5 → scale ×2 → mag 10
    push('14a rescale to speed (×2)', '[6,8]', `[${f(u)},${f(v)}]`, approx(u, 6, 1e-6) && approx(v, 8, 1e-6));
    const [u2, v2] = rescaleWindToSpeed(3, 4, 100);         // ×20 capped at ×4
    push('14b cap at 4× (mag 5→20)', '[12,16]', `[${f(u2)},${f(v2)}]`, approx(Math.hypot(u2, v2), 20, 1e-5));
    const [u3, v3] = rescaleWindToSpeed(0.001, 0, 10);      // ~cancelled → unchanged
    push('14c near-zero vector unchanged', '[0.001,0]', `[${f(u3)},${f(v3)}]`, u3 === 0.001 && v3 === 0);
    const [u4] = rescaleWindToSpeed(3, 4, NaN);             // no scalar → unchanged
    push('14d NaN speed → unchanged', '3', u4, u4 === 3);
  }

  // ── eq. (15) uncertainty ───────────────────────────────────────────────────
  push('15a σ_a=√ratio·σ_b (0.25,2)', '1', analysisSigma(0.25, 2), approx(analysisSigma(0.25, 2), 1, 1e-9));
  push('15b σ_a=σ_b far from obs (ratio 1)', '2', analysisSigma(1, 2), analysisSigma(1, 2) === 2);
  push('15c σ_a=0 at obs (ratio 0)', '0', analysisSigma(0, 2), analysisSigma(0, 2) === 0);
  {
    const sp = multiModelSpread2({ a: 12, b: 8 }, ['a', 'b'], [0.5, 0.5], 10);
    push('15d spread = Σw(x−xb)²', '4', sp, approx(sp, 4, 1e-9));
  }
  push('15e σ_fc²(τ=0)=σ_a²+spread', '4', forecastSigma2(1, 0, 4, 3), approx(forecastSigma2(1, 0, 4, 3), 4, 1e-9));
  push('15f σ_fc² relaxes (τ=2,T=2)', '3.54134', forecastSigma2(4, 2, 2, 3),
    approx(forecastSigma2(4, 2, 2, 3), 4 * Math.exp(-2) + 3, 1e-4));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __verifyPhase45?: typeof verifyPhase45 }).__verifyPhase45 = verifyPhase45;
}
