/**
 * Verification harness for the multi-model background fit (eqs 2 & 4) and the
 * licence-split enforcement (constraint C1). Closed-form checks + a synthetic-
 * archive smoke test. Node `--experimental-strip-types` + browser dev global.
 */

import { shrinkBias, minVarWeights, combineBackground, trainBackground } from './background.ts';
import { stripNonCommercial, assertNoOpenMeteo } from './archive.ts';
import { sourceWeightsFromBackground } from './params.ts';
import { generateSyntheticFixture, type Fixture } from './fixture.ts';

export interface BgCheck { name: string; expected: string; got: string; ok: boolean }
export interface BgVerifyResult { checks: BgCheck[]; passed: number; failed: number }

const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const f = (x: number) => Math.round(x * 1e5) / 1e5;

export function verifyBackground(): BgVerifyResult {
  const checks: BgCheck[] = [];
  const push = (name: string, expected: string, got: number | string, ok: boolean) =>
    checks.push({ name, expected, got: typeof got === 'number' ? String(f(got)) : got, ok });

  // ── eq. (4) reliability shrinkage ──────────────────────────────────────────
  push('4a large n → keeps local (n=1000,k=8)', '≈1.9841', shrinkBias(2, 1000, 0, 8),
    approx(shrinkBias(2, 1000, 0, 8), 1.98413, 1e-4));
  push('4b small n → pulled to regional (n=1,k=8)', '0.22222', shrinkBias(2, 1, 0, 8),
    approx(shrinkBias(2, 1, 0, 8), 0.22222, 1e-4));
  push('4c n=0 → exactly regional', '5', shrinkBias(2, 0, 5, 8), shrinkBias(2, 0, 5, 8) === 5);

  // ── eq. (2) minimum-variance weights ───────────────────────────────────────
  {
    const w = minVarWeights([[1, 0], [0, 4]]);   // diagonal ⇒ inverse-MSE
    push('2a diagonal Σ → inverse-MSE [0.8,0.2]', '[0.8,0.2]', `[${f(w[0])},${f(w[1])}]`,
      approx(w[0], 0.8, 1e-6) && approx(w[1], 0.2, 1e-6));
  }
  {
    const w = minVarWeights([[2, 0, 0], [0, 2, 0], [0, 0, 2]]);   // equal indep
    push('2b equal independent → [1/3,1/3,1/3]', '0.33333', w[0], approx(w[0], 1 / 3, 1e-6) && approx(w[2], 1 / 3, 1e-6));
  }
  {
    // Members 0,1 correlated (redundant), 2 independent → pair discounted.
    const w = minVarWeights([[1, 0.9, 0], [0.9, 1, 0], [0, 0, 1]]);
    const ok = approx(w[0], w[1], 1e-6) && w[2] > w[0] && approx(w[2], 0.48734, 1e-3);
    push('2c correlated pair discounted vs indep', 'w2≈0.487>w0=w1', `[${f(w[0])},${f(w[1])},${f(w[2])}]`, ok);
  }

  // ── combineBackground ──────────────────────────────────────────────────────
  {
    const c = combineBackground({ a: 10, b: 20 }, ['a', 'b'], [0.75, 0.25]);
    push('combine: 0.75·10+0.25·20', '12.5', c, approx(c, 12.5, 1e-9));
    const cMiss = combineBackground({ a: 10 }, ['a', 'b'], [0.75, 0.25]);   // b missing → renorm
    push('combine renormalises missing member', '10', cMiss, approx(cMiss, 10, 1e-9));
  }

  // ── constraint C1: licence split enforced in code ──────────────────────────
  {
    const fx = generateSyntheticFixture(1);
    const tainted: Fixture = {
      ...fx,
      icond2: [{ x: 0.5, y: 0.3, elev: 100, source: 'icon_d2', vals: { t2m: 10 }, provenance: 'open-meteo' }],
    };
    let threw = false;
    try { assertNoOpenMeteo([tainted]); } catch { threw = true; }
    push('C1a assertNoOpenMeteo throws on tainted', 'throws', threw ? 'threw' : 'no-throw', threw);
    const { fixture: clean, stripped } = stripNonCommercial(tainted);
    let threwAfter = false;
    try { assertNoOpenMeteo([clean]); } catch { threwAfter = true; }
    push('C1b strip removes it (stripped=1, then safe)', 'stripped=1', stripped,
      stripped === 1 && !threwAfter);
  }

  // ── synthetic-archive smoke: trainBackground produces a valid artifact ──────
  {
    const archive = [generateSyntheticFixture(42), generateSyntheticFixture(42), generateSyntheticFixture(42)];
    const art = trainBackground(archive, {
      window: { from: 's', to: 's', sessions: 3 },
    });
    const t2m = art.perVariable.t2m;
    const wsum = t2m.weights['0'].reduce((s, x) => s + x, 0);
    const finite = t2m.weights['0'].every((x) => x === x);
    push('smoke: models = [arome, mosmix]', 'arome,mosmix', art.models.join(','), art.models.join(',') === 'arome,mosmix');
    push('smoke: weights sum to 1, finite', '1', wsum, approx(wsum, 1, 1e-6) && finite);
    push('smoke: effN reported (short archive)', '3', t2m.effectiveSampleSize, t2m.effectiveSampleSize === 3);
    push('smoke: off-diagonal OFF by default (C2)', 'false', String(t2m.offDiagonal), t2m.offDiagonal === false);

    // Loading-path bridge: fitted weights map onto the engine's SourceWeights.
    const sw = sourceWeightsFromBackground(art, 'mosmix');
    const swMissing = sourceWeightsFromBackground(art, 'not_a_model');
    const okBridge = sw != null && sw.temperature === t2m.weights['0'][art.models.indexOf('mosmix')] && swMissing === null;
    push('bridge: source→SourceWeights (unknown→null)', 'mapped', okBridge ? 'mapped' : 'bad', okBridge);
  }

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __verifyBackground?: typeof verifyBackground }).__verifyBackground = verifyBackground;
}
