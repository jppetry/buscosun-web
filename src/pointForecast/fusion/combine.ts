/**
 * Minimum-variance combination of correlated estimates.
 *
 * Given k estimates of the same quantity, each with its own error standard
 * deviation and with a known correlation structure between the errors, the
 * combination with the smallest possible error variance is
 *
 *     w = Σ⁻¹·1 / (1ᵀ·Σ⁻¹·1),   x̂ = wᵀμ,   σ̂² = 1 / (1ᵀ·Σ⁻¹·1),
 *     Σ_ij = ρ_ij · σ_i · σ_j
 *
 * The correlation term is the whole point. Without it (Σ diagonal) this reduces
 * to inverse-variance weighting, which treats ICON-D2, AROME and MOSMIX as
 * three independent opinions — they are not; they share an analysis and, in
 * MOSMIX's case, the model itself. Ignoring that is the standard way a
 * multi-model forecast becomes overconfident: it makes the combined spread
 * shrink like 1/√k when in reality it barely shrinks at all.
 *
 * The old engine papered over this with a `familyBonus` of +0,05 per extra
 * family. Here it comes out of the algebra, with the right sign and the right
 * size, and a station (uncorrelated with the models) buys far more certainty
 * than a fourth NWP does.
 *
 * Pure. Headless-checkable via {@link verifyCombine}.
 */

/** One estimate entering the combination. */
export interface Member<S = unknown> {
  /** Estimate of the quantity (already transformed into the working space). */
  mu: number;
  /** Error standard deviation of this estimate, same units as `mu`. */
  sigma: number;
  /** Tag, for diagnostics only — NOT unique (six stations share `dwd_obs`). */
  tag: string;
  /** The sample this member came from, so the correlation function can look at
   *  family, distance and footprint instead of guessing from the tag. Optional
   *  because the numerical tests in this module do not need one. */
  src?: S;
}

export interface CombineResult {
  mu: number;
  sigma: number;
  /** Weight per member, in input order. Sums to 1; may contain small negatives. */
  weights: number[];
  /**
   * How many "best members" this combination is worth:
   * (1/σ̂²) ÷ max_i(1/σ_i²). Equals k for k identical independent members and
   * 1 for perfectly correlated ones — the honest version of a consensus bonus.
   */
  equivalentSources: number;
  /** Shrinkage actually applied to the correlation matrix (may exceed the prior). */
  shrinkUsed: number;
}

/** Numerical floor for a member's sigma: nothing is measured perfectly. */
const SIGMA_FLOOR = 1e-3;

/**
 * Cholesky solve for a symmetric positive-definite matrix, with jitter.
 * Returns null if the matrix is not usable even after jittering.
 */
function choleskySolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let attempt = 0; attempt < 5; attempt++) {
    // Jitter RELATIVE to each diagonal entry, not to the largest one. A mix of a
    // station (σ ≈ 0,2 K) and a no-skill global model (σ ≈ 300 K) has diagonals
    // five orders apart; a jitter scaled to the largest would swamp the precise
    // member entirely.
    const rel = attempt === 0 ? 0 : Math.pow(10, -10 + attempt * 2);
    const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j] * (i === j ? 1 + rel : 1);
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (!(s > 0)) { ok = false; break; }
          L[i][i] = Math.sqrt(s);
        } else {
          L[i][j] = s / L[j][j];
        }
      }
    }
    if (!ok) continue;
    // forward then back substitution
    const y = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    const x = new Array<number>(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = s / L[i][i];
    }
    if (x.every((v) => Number.isFinite(v))) return x;
  }
  return null;
}

/**
 * Last resort, reached only when the prior correlation matrix cannot be
 * factorised even after jittering — i.e. when the correlation assumptions are
 * themselves inconsistent.
 *
 * Inverse-variance weighting would be the WORST answer here: it assumes perfect
 * independence, which is exactly the assumption that just failed. Instead the
 * members are weighted by precision but the spread is reported under the full
 * believed correlation, which can never claim more certainty than the best
 * single member.
 */
function conservativeFallback(
  members: Member[], sig: number[], corr: (i: number, j: number) => number,
): CombineResult {
  const raw = sig.map((s) => 1 / (s * s));
  const wsum = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((r) => r / wsum);
  const mu = members.reduce((a, m, i) => a + weights[i] * m.mu, 0);
  let varc = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members.length; j++) {
      const rho = i === j ? 1 : Math.max(0, Math.min(0.999, corr(i, j)));
      varc += weights[i] * weights[j] * rho * sig[i] * sig[j];
    }
  }
  return {
    mu,
    sigma: Math.sqrt(Math.max(varc, 1 / wsum)),
    weights,
    equivalentSources: (1 / Math.max(varc, 1 / wsum)) / Math.max(...raw),
    shrinkUsed: 0,
  };
}

/**
 * Combine `members` under the error-correlation function `corr(i, j)` ∈ [0,1].
 *
 * `shrink` pulls the correlation matrix toward the identity before inversion
 * (see `priors.ts`, CORR_SHRINK). The weights are constrained to be
 * NON-NEGATIVE by an active set: with prior rather than measured correlations,
 * a negative weight is a liability, not an optimisation. The last resort is
 * `conservativeFallback` and is reported through `shrinkUsed === 0`.
 */
export function combine(
  members: Member[],
  corr: (i: number, j: number) => number,
  shrink = 0.85,
): CombineResult | null {
  const k = members.length;
  if (k === 0) return null;
  const sig = members.map((m) => Math.max(SIGMA_FLOOR, m.sigma));
  if (k === 1) {
    return { mu: members[0].mu, sigma: sig[0], weights: [1], equivalentSources: 1, shrinkUsed: shrink };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const lambda = shrink * Math.pow(0.6, attempt);
    const buildA = (idx: number[]) => {
      const n = idx.length;
      const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const rho = i === j ? 1 : Math.max(0, Math.min(0.999, corr(idx[i], idx[j]))) * lambda;
          A[i][j] = rho * sig[idx[i]] * sig[idx[j]];
        }
      }
      return A;
    };

    // ── Non-negative weights, by active set.
    //
    // The unconstrained minimum-variance solution may put small NEGATIVE weights
    // on correlated members. That is mathematically optimal when the correlations
    // are known exactly — and dangerous when they are priors, because the
    // members here are anomalies divided by ρ and therefore grow without bound as
    // a source approaches its horizon. A weight of −0,012 on an anomaly of 91 K
    // moves the mean by 1,1 K, and it moved it in a single step the hour a source
    // dropped out. Constraining the combination to a convex mixture removes that
    // failure mode at the price of a slightly larger, i.e. more conservative,
    // variance — the right side to err on with prior correlations.
    let idx = Array.from({ length: k }, (_, i) => i);
    let weights: number[] | null = null;
    for (let drop = 0; drop < k; drop++) {
      const x = choleskySolve(buildA(idx), new Array<number>(idx.length).fill(1));
      if (!x) { weights = null; break; }
      let denom = 0;
      for (const v of x) denom += v;
      if (!(denom > 0) || !Number.isFinite(denom)) { weights = null; break; }
      const w = x.map((v) => v / denom);
      let worst = -1, worstW = 0;
      for (let i = 0; i < w.length; i++) if (w[i] < worstW) { worstW = w[i]; worst = i; }
      if (worst < 0 || idx.length === 1) {
        weights = new Array<number>(k).fill(0);
        idx.forEach((orig, i) => { weights![orig] = w[i]; });
        break;
      }
      idx = idx.filter((_, i) => i !== worst);
    }
    if (!weights) continue;
    const mu = members.reduce((a, m, i) => a + weights![i] * m.mu, 0);
    if (!Number.isFinite(mu)) continue;
    // The weights are optimal for the SHRUNK matrix, but the spread they
    // actually produce is wᵀΣw under the correlations we believe. Reporting
    // 1/(1ᵀΣ̃⁻¹1) instead would understate σ by ~5 % — and in the wrong
    // direction: shrinkage is supposed to be conservative, not to manufacture
    // certainty. So: weights from Σ̃, spread from Σ.
    let varc = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const rho = i === j ? 1 : Math.max(0, Math.min(0.999, corr(i, j)));
        varc += weights[i] * weights[j] * rho * sig[i] * sig[j];
      }
    }
    if (!(varc > 0) || !Number.isFinite(varc)) continue;
    const bestPrec = Math.max(...sig.map((s) => 1 / (s * s)));
    return {
      mu,
      sigma: Math.sqrt(varc),
      weights,
      equivalentSources: (1 / varc) / bestPrec,
      shrinkUsed: lambda,
    };
  }
  return conservativeFallback(members, sig, corr);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface CombineCheck { name: string; ok: boolean; detail?: string }
export interface CombineVerifyResult { checks: CombineCheck[]; passed: number; failed: number }

export function verifyCombine(): CombineVerifyResult {
  const checks: CombineCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const indep = () => 0;

  // --- textbook case: two independent equal members ⇒ σ/√2, weights ½/½
  {
    const r = combine([{ mu: 10, sigma: 2, tag: 'a' }, { mu: 14, sigma: 2, tag: 'b' }], indep, 1)!;
    add('unabhängig, gleich stark: Mittelwert', near(r.mu, 12, 1e-9), r.mu.toFixed(4));
    add('unabhängig, gleich stark: σ = 2/√2', near(r.sigma, 2 / Math.SQRT2, 1e-6), r.sigma.toFixed(5));
    add('unabhängig, gleich stark: Gewichte ½/½', near(r.weights[0], 0.5, 1e-9));
    add('unabhängig, gleich stark: 2 äquivalente Quellen', near(r.equivalentSources, 2, 1e-6), r.equivalentSources.toFixed(4));
  }

  // --- inverse-variance weighting: the precise member dominates
  {
    const r = combine([{ mu: 10, sigma: 1, tag: 'präzise' }, { mu: 20, sigma: 3, tag: 'grob' }], indep, 1)!;
    add('präzise Quelle dominiert (w ≈ 0,9)', near(r.weights[0], 0.9, 1e-6), r.weights[0].toFixed(4));
    add('Mittel nahe der präzisen Quelle', near(r.mu, 11, 1e-6), r.mu.toFixed(4));
  }

  // --- THE point of the module: correlation must not buy certainty
  {
    const four = [0, 1, 2, 3].map((i) => ({ mu: 10 + i * 0.01, sigma: 2, tag: `m${i}` }));
    const asIndependent = combine(four, indep, 1)!;
    const asCorrelated = combine(four, () => 0.9, 1)!;
    add('vier unabhängige Quellen halbieren σ (2 → 1)', near(asIndependent.sigma, 1, 1e-6), asIndependent.sigma.toFixed(4));
    add('vier zu 90 % korrelierte Quellen bringen fast nichts',
      asCorrelated.sigma > 1.8 && asCorrelated.sigma <= 2 + 1e-9, asCorrelated.sigma.toFixed(4));
    add('korreliert ⇒ deutlich weniger äquivalente Quellen',
      asCorrelated.equivalentSources < 1.35 && asIndependent.equivalentSources > 3.9,
      `${asCorrelated.equivalentSources.toFixed(2)} vs ${asIndependent.equivalentSources.toFixed(2)}`);
  }

  // --- a station (uncorrelated) is worth more than a fourth model
  {
    const models = [0, 1, 2].map((i) => ({ mu: 10, sigma: 1.5, tag: `nwp${i}` }));
    const corrModels = (i: number, j: number) => (i === j ? 1 : 0.8);
    const three = combine(models, corrModels, 1)!;
    const plusFourthModel = combine([...models, { mu: 10, sigma: 1.5, tag: 'nwp3' }], corrModels, 1)!;
    const plusStation = combine([...models, { mu: 10, sigma: 1.5, tag: 'obs' }],
      (i, j) => (i === j ? 1 : (i === 3 || j === 3 ? 0.1 : 0.8)), 1)!;
    add('vierte korrelierte Quelle bringt wenig',
      plusFourthModel.sigma > three.sigma * 0.93, `${three.sigma.toFixed(3)} → ${plusFourthModel.sigma.toFixed(3)}`);
    add('unabhängige Station bringt viel mehr als ein viertes Modell',
      plusStation.sigma < plusFourthModel.sigma - 0.05,
      `Station ${plusStation.sigma.toFixed(3)} < Modell ${plusFourthModel.sigma.toFixed(3)}`);
  }

  // --- degenerate inputs must not produce NaN
  {
    add('leere Liste ⇒ null', combine([], indep) === null);
    const one = combine([{ mu: 5, sigma: 1.2, tag: 'x' }], indep)!;
    add('ein Member ⇒ unverändert', near(one.mu, 5, 1e-12) && near(one.sigma, 1.2, 1e-12));
    const zero = combine([{ mu: 5, sigma: 0, tag: 'perfekt' }, { mu: 9, sigma: 3, tag: 'grob' }], indep, 1)!;
    add('σ = 0 wird abgefangen (kein NaN, dominiert)',
      Number.isFinite(zero.mu) && zero.mu < 5.001 && zero.sigma < 0.01, `${zero.mu.toFixed(5)} ± ${zero.sigma.toExponential(1)}`);
    const same = combine([{ mu: 4, sigma: 2, tag: 'a' }, { mu: 4, sigma: 2, tag: 'b' }], () => 0.999, 1)!;
    add('nahezu singuläre Matrix ⇒ endliches Ergebnis',
      Number.isFinite(same.mu) && Number.isFinite(same.sigma) && same.sigma > 1.9, same.sigma.toFixed(4));
  }

  // --- weights always sum to one
  {
    const r = combine(
      [{ mu: 1, sigma: 1, tag: 'a' }, { mu: 2, sigma: 2, tag: 'b' }, { mu: 3, sigma: 0.5, tag: 'c' }],
      (i, j) => (i === j ? 1 : 0.5), 0.85)!;
    const s = r.weights.reduce((a, b) => a + b, 0);
    add('Gewichte summieren zu 1', near(s, 1, 1e-9), s.toFixed(9));
  }

  // --- NEGATIVE CONTROL: an "independent" claim on correlated members must
  //     visibly understate the spread. If this ever stops failing, the
  //     correlation handling has quietly been disabled.
  {
    const four = [0, 1, 2, 3].map(() => ({ mu: 10, sigma: 2, tag: 'm' }));
    const wrong = combine(four, indep, 1)!;
    const right = combine(four, () => 0.9, 1)!;
    add('Negativkontrolle: Unabhängigkeits-Annahme unterschätzt σ um Faktor > 1,7',
      right.sigma / wrong.sigma > 1.7, `${(right.sigma / wrong.sigma).toFixed(2)}×`);
  }

  // --- the reported spread must be the one the weights actually produce
  {
    const four = [0, 1, 2, 3].map((i) => ({ mu: 10 + i, sigma: 1.5, tag: `m${i}` }));
    const rho = (i: number, j: number) => (i === j ? 1 : 0.7);
    const r = combine(four, rho, 0.85)!;
    // wᵀΣw under the BELIEVED correlations, recomputed independently here.
    let truth = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      truth += r.weights[i] * r.weights[j] * (i === j ? 1 : 0.7) * 1.5 * 1.5;
    }
    add('gemeldetes σ = tatsächliches σ der Gewichte',
      Math.abs(r.sigma - Math.sqrt(truth)) < 1e-9, `${r.sigma.toFixed(6)} vs ${Math.sqrt(truth).toFixed(6)}`);
    // NEGATIVKONTROLLE: aus der geschrumpften Matrix gerechnet wäre es kleiner.
    const shrunk = Math.sqrt(1 / (function () {
      // 1ᵀΣ̃⁻¹1 für die 4×4-Gleichverteilung ist geschlossen berechenbar:
      const rr = 0.7 * 0.85, v = 1.5 * 1.5;
      return 4 / (v * (1 + 3 * rr));
    })());
    add('Negativkontrolle: die geschrumpfte Rechnung wäre messbar kleiner',
      shrunk < r.sigma - 0.02, `${shrunk.toFixed(4)} < ${r.sigma.toFixed(4)}`);
  }

  // --- an inconsistent correlation prior must not fall back to "all independent"
  {
    const three = [{ mu: 1, sigma: 1, tag: 'a' }, { mu: 2, sigma: 1, tag: 'b' }, { mu: 3, sigma: 1, tag: 'c' }];
    const r = combine(three, (i, j) => (i === j ? 1 : 0.995), 1)!;
    add('nahezu singuläre Korrelation ⇒ σ bleibt nahe der Einzelquelle',
      r.sigma > 0.95, r.sigma.toFixed(4));
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyCombine: typeof verifyCombine }).__verifyCombine = verifyCombine;
}
