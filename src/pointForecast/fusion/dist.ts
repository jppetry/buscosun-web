/**
 * Predictive distributions for buscosun Fusion — the object the engine returns
 * instead of a single number.
 *
 * THE NAME: the algorithm in this folder is called **buscosun Fusion**
 * throughout the project — always that, never a paraphrase. The folder stays
 * `fusion/` for the same reason (a rename to `predictive/` was considered and
 * dropped).
 *
 * Do not confuse it with the unrelated `src/fusion/` directory: that is the IDW
 * rasteriser for the MAP, its name is historical, and it is documented as
 * misleading in `audit/rasterfusion-rueckbau.md` §2. Nothing here touches it.
 * When both could be meant, say "buscosun Fusion" for this one and "the raster
 * fusion" for that one.
 *
 * Every variable gets the distribution family that matches its physics:
 *
 *   normal          temperature, dew point — symmetric, unbounded
 *   censoredNormal  cloud cover — bounded [0,100] with real mass at both ends
 *                   (overcast and clear are genuinely the most common states)
 *   logCensored     a normal in log1p space censored at zero — the dry
 *                   probability and the amount from ONE pair of numbers. Kept
 *                   as a family; precipitation no longer uses it (see below)
 *   hurdleLogNormal precipitation — an atom at zero (P(dry)) and a lognormal
 *                   amount GIVEN wet: two stages, three numbers, because
 *                   "whether" and "how much, if so" have different skills (K-2)
 *   rice            wind speed — derived from a bivariate normal on (u,v), so
 *                   it is non-negative by construction and widens correctly when
 *                   the direction is uncertain at low speed
 *
 * Two design rules that keep this honest:
 *
 *  1. Every family exposes the SAME three primitives — `cdfOf`, `quantileOf`,
 *     `meanOf`. Everything else (CRPS, exceedance probability, interval) is
 *     derived from them, so a new family cannot silently get a different
 *     definition of "the 90th percentile".
 *  2. CRPS is computed ONCE, generically, from the quantile function via the
 *     quantile-loss identity  CRPS = 2·∫₀¹ ρ_p(y, F⁻¹(p)) dp.  For the normal
 *     family the closed form is also implemented — and the verifier checks the
 *     two against each other. A numerical integrator that agrees with an
 *     analytic solution to 1e-4 is a numerical integrator you can trust on the
 *     families that have no closed form.
 *
 * Pure: no DOM, no network, no randomness (D-12). Headless-checkable via
 * {@link verifyDist}.
 */

export type Dist =
  | { kind: 'normal'; mu: number; sigma: number }
  | { kind: 'censoredNormal'; mu: number; sigma: number; lo: number; hi: number }
  /**
   * Precipitation: a normal variable z in log1p space, CENSORED at zero.
   *   precip = max(0, expm1(z)),  z ~ N(mu, sigma²)
   * The probability of a dry hour is therefore not a free parameter but a
   * consequence, P(0) = Phi(-mu/sigma) — one distribution, one pair of numbers,
   * no way for "how much" and "whether at all" to contradict each other.
   */
  | { kind: 'logCensored'; mu: number; sigma: number }
  /**
   * Precipitation as a HURDLE: an atom at zero with mass `pDry`, and above it a
   * lognormal amount, ln(precip) | wet ~ N(mu, sigma²) — positive by
   * construction, so the atom and the amount never overlap. Three numbers,
   * because "whether" and "how much, if so" are predicted with different skills
   * (K-2): a model's hourly AMOUNT correlates with a gauge at only ~0,5–0,7,
   * its wet/dry call far better — one pair of numbers cannot carry both
   * without crushing the amounts.
   */
  | { kind: 'hurdleLogNormal'; pDry: number; mu: number; sigma: number }
  /** Speed of a bivariate normal (u,v) with mean length `nu` and per-component sd `sigma`. */
  | { kind: 'rice'; nu: number; sigma: number };

const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 0.3989422804014327;

// ---------------------------------------------------------------------------
// Normal primitives (hand-written — D-06 forbids a numerics dependency)
// ---------------------------------------------------------------------------

/** Standard normal pdf. */
export function phi(z: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * z * z);
}

/**
 * Error function, Abramowitz & Stegun 7.1.26 with the sign extension.
 * Absolute error < 1.5e-7 — three orders below anything we display.
 */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Standard normal cdf. */
export function Phi(z: number): number {
  return 0.5 * (1 + erf(z / SQRT2));
}

/**
 * Inverse standard normal cdf — Acklam's rational approximation.
 *
 * Relative error < 1e-9 over the whole range. A Newton/Halley refinement step
 * against `Phi` looks like an improvement and is the opposite: `Phi` rests on the
 * A&S 7.1.26 `erf`, whose absolute error is ~1.5e-7, so refining a 1e-9 estimate
 * against a 1e-7 reference DEGRADES it — measured, at p = 1e-9, from 3e-10 to
 * 6e-4. The refinement is therefore deliberately absent.
 */
export function PhiInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return x;
}

// ---------------------------------------------------------------------------
// Rice cdf — the wind-speed law that falls out of a bivariate normal on (u,v)
// ---------------------------------------------------------------------------

/**
 * P(speed ≤ x) for speed = |(u,v)| with (u,v) ~ N((μu,μv), σ²·I), nu = |(μu,μv)|.
 *
 * Written as a Poisson mixture of central chi-square cdfs with even degrees of
 * freedom — all terms elementary, no special functions:
 *
 *   F(x) = Σ_j  Pois(j; λ/2) · [ 1 − e^{−s} Σ_{i≤j} sⁱ/i! ],
 *   λ = (nu/σ)²,  s = x²/(2σ²)
 *
 * The series is truncated once the remaining Poisson mass is negligible; the
 * number of terms grows like λ/2, which stays small for realistic winds
 * (λ/2 ≈ 30 at 10 m/s mean with 1,3 m/s spread).
 */
export function riceCdf(x: number, nu: number, sigma: number): number {
  if (!(x > 0)) return 0;
  if (!(sigma > 0)) return x >= nu ? 1 : 0;
  const half = 0.5 * (nu / sigma) * (nu / sigma);
  // Large-signal branch. `Math.exp(-half)` underflows to exactly 0 above
  // half ≈ 745, i.e. from ν/σ ≈ 38,6 — which a 15 m/s wind with a station anchor
  // reaches easily. The series would then return 0 for every x and every
  // quantile would collapse onto the bisection bracket, ~36 % too high. For
  // ν ≫ σ the Rice law is normal with mean √(ν²+σ²) and sd σ (error O(σ³/ν²)),
  // so the honest answer is available in closed form.
  if (half > 500) return Phi((x - Math.sqrt(nu * nu + sigma * sigma)) / sigma);
  const s = (x * x) / (2 * sigma * sigma);
  // Poisson weights around the mode, accumulated until the tail is spent.
  const jMax = Math.min(2000, Math.ceil(half + 10 * Math.sqrt(half + 1) + 20));
  let poisson = Math.exp(-half);          // j = 0
  let inner = Math.exp(-s);               // e^{-s} · s⁰/0!
  let chiTail = inner;                    // Σ_{i≤j} e^{-s} sⁱ/i!
  let acc = 0;
  for (let j = 0; j <= jMax; j++) {
    acc += poisson * (1 - chiTail);
    // advance to j+1
    poisson *= half / (j + 1);
    inner *= s / (j + 1);
    chiTail += inner;
    if (poisson < 1e-14 && j > half) break;
  }
  return Math.min(1, Math.max(0, acc));
}

// ---------------------------------------------------------------------------
// The three primitives, per family
// ---------------------------------------------------------------------------

/** P(Y ≤ x). */
export function cdfOf(d: Dist, x: number): number {
  switch (d.kind) {
    case 'normal':
      return d.sigma > 0 ? Phi((x - d.mu) / d.sigma) : (x >= d.mu ? 1 : 0);
    case 'censoredNormal': {
      if (x < d.lo) return 0;
      if (x >= d.hi) return 1;
      return d.sigma > 0 ? Phi((x - d.mu) / d.sigma) : (x >= d.mu ? 1 : 0);
    }
    case 'logCensored': {
      if (x < 0) return 0;
      if (!(d.sigma > 0)) return Math.max(0, Math.expm1(d.mu)) <= x ? 1 : 0;
      return Math.min(1, Phi((Math.log1p(x) - d.mu) / d.sigma));
    }
    case 'hurdleLogNormal': {
      if (x < 0) return 0;
      const pd = Math.max(0, Math.min(1, d.pDry));
      if (x === 0) return pd;                                  // the atom, exactly
      if (!(d.sigma > 0)) return pd + (1 - pd) * (Math.exp(d.mu) <= x ? 1 : 0);
      return Math.min(1, pd + (1 - pd) * Phi((Math.log(x) - d.mu) / d.sigma));
    }
    case 'rice':
      return riceCdf(x, d.nu, d.sigma);
  }
}

/** F⁻¹(p) for p ∈ (0,1). */
export function quantileOf(d: Dist, p: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  switch (d.kind) {
    case 'normal':
      return d.mu + d.sigma * PhiInv(q);
    case 'censoredNormal':
      return Math.min(d.hi, Math.max(d.lo, d.mu + d.sigma * PhiInv(q)));
    case 'logCensored':
      return Math.max(0, Math.expm1(d.mu + d.sigma * PhiInv(q)));
    case 'hurdleLogNormal': {
      const pd = Math.max(0, Math.min(1, d.pDry));
      if (q <= pd) return 0;
      const inner = Math.min(1 - 1e-9, Math.max(1e-9, (q - pd) / (1 - pd)));
      return Math.exp(d.mu + d.sigma * PhiInv(inner));
    }
    case 'rice': {
      // Monotone cdf ⇒ bisection. 60 halvings put the bracket below 1e-12 of
      // its width; the cost is irrelevant next to a single network fetch.
      let lo = 0, hi = d.nu + 12 * d.sigma + 1;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (riceCdf(mid, d.nu, d.sigma) < q) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    }
  }
}

/** E[Y]. */
export function meanOf(d: Dist): number {
  switch (d.kind) {
    case 'normal':
      return d.mu;
    case 'censoredNormal': {
      // Tobit mean: interior mass plus the two censored atoms.
      if (!(d.sigma > 0)) return Math.min(d.hi, Math.max(d.lo, d.mu));
      const a = (d.lo - d.mu) / d.sigma, b = (d.hi - d.mu) / d.sigma;
      const Pa = Phi(a), Pb = Phi(b);
      const interior = d.mu * (Pb - Pa) + d.sigma * (phi(a) - phi(b));
      return d.lo * Pa + interior + d.hi * (1 - Pb);
    }
    case 'logCensored': {
      // E[max(0, expm1(z))] with z ~ N(mu, s²):
      //   = e^{mu+s²/2}·Phi(mu/s + s) − Phi(mu/s)
      // (the first term is the lognormal partial expectation above z = 0,
      //  the second subtracts the "−1" of expm1 over the same region).
      if (!(d.sigma > 0)) return Math.max(0, Math.expm1(d.mu));
      const a = d.mu / d.sigma;
      return Math.exp(d.mu + 0.5 * d.sigma * d.sigma) * Phi(a + d.sigma) - Phi(a);
    }
    case 'hurdleLogNormal': {
      // E = (1 − pDry) · E[e^w],  w ~ N(mu, s²)  ⇒  e^{mu + s²/2}.
      const pd = Math.max(0, Math.min(1, d.pDry));
      const wet = !(d.sigma > 0) ? Math.exp(d.mu) : Math.exp(d.mu + 0.5 * d.sigma * d.sigma);
      return (1 - pd) * wet;
    }
    case 'rice': {
      // E = σ·√(π/2)·L_{1/2}(−λ/2); the series below is the Laguerre function
      // evaluated through the same Poisson mixture used by the cdf.
      const half = 0.5 * (d.nu / d.sigma) * (d.nu / d.sigma);
      if (!(d.sigma > 0)) return d.nu;
      // E[X] ≈ √(ν²+σ²) + O(σ⁴/ν³). √(ν²+2σ²) would be √E[X²] — the RMS, not
      // the mean; it left a visible step at the branch boundary.
      if (half > 200) return Math.sqrt(d.nu * d.nu + d.sigma * d.sigma);
      let poisson = Math.exp(-half), acc = 0;
      let ratio = 0.8862269254527580;   // Γ(1.5)/Γ(1) = √π/2, advanced in step
      const jMax = Math.ceil(half + 10 * Math.sqrt(half + 1) + 20);
      for (let j = 0; j <= jMax; j++) {
        // E[χ_{2+2j}] = √2·Γ(j+1.5)/Γ(j+1) — the ratio really is incremental now.
        acc += poisson * Math.SQRT2 * ratio;
        poisson *= half / (j + 1);
        ratio *= (j + 1.5) / (j + 1);
        if (poisson < 1e-14 && j > half) break;
      }
      return d.sigma * acc;
    }
  }
}

// ---------------------------------------------------------------------------
// Derived quantities — defined once, for every family
// ---------------------------------------------------------------------------

/** P(Y > x) — the form most product questions actually take. */
export function exceedance(d: Dist, x: number): number {
  return Math.min(1, Math.max(0, 1 - cdfOf(d, x)));
}

/** The five quantiles the product shows. */
export interface QuantileSet { q10: number; q25: number; q50: number; q75: number; q90: number }

export function quantiles(d: Dist): QuantileSet {
  return {
    q10: quantileOf(d, 0.10),
    q25: quantileOf(d, 0.25),
    q50: quantileOf(d, 0.50),
    q75: quantileOf(d, 0.75),
    q90: quantileOf(d, 0.90),
  };
}

/** Pinball (quantile) loss at level p. */
export function pinball(p: number, q: number, y: number): number {
  return y >= q ? p * (y - q) : (1 - p) * (q - y);
}

/** CRPS of a normal predictive distribution — closed form. */
export function crpsNormal(mu: number, sigma: number, y: number): number {
  if (!(sigma > 0)) return Math.abs(y - mu);
  const z = (y - mu) / sigma;
  return sigma * (z * (2 * Phi(z) - 1) + 2 * phi(z) - 0.5641895835477563);  // 1/√π
}

/**
 * CRPS for ANY family, via  CRPS = 2·∫₀¹ ρ_p(y, F⁻¹(p)) dp.
 *
 * Midpoint rule on `n` nodes. The integrand has a kink at p = F(y) and, for
 * `logCensored`, a flat stretch at the dry probability; the midpoint rule handles both without the
 * spurious weight a Gauss rule would put on the discontinuity. n = 512 keeps
 * the error below 1e-4 of σ — checked against `crpsNormal` in the verifier.
 */
export function crpsOf(d: Dist, y: number, n = 512): number {
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    acc += pinball(p, quantileOf(d, p), y);
  }
  return (2 * acc) / n;
}

/**
 * Probability integral transform — the value whose histogram must be flat if
 * the distribution is calibrated. For families with an atom (precipitation at
 * zero) the randomised PIT is not available without an RNG, so we return the
 * midpoint of the atom's interval, which is the standard deterministic variant.
 */
export function pitOf(d: Dist, y: number): number {
  if ((d.kind === 'logCensored' || d.kind === 'hurdleLogNormal') && y <= 0) return 0.5 * cdfOf(d, 0);
  if (d.kind === 'censoredNormal') {
    // Two atoms, one at each bound — and cloud cover really does pile up there.
    // Returning the plain cdf would push every overcast hour to PIT = 1 and make
    // the histogram look badly biased when the forecast is fine.
    if (y <= d.lo) return 0.5 * (d.sigma > 0 ? Phi((d.lo - d.mu) / d.sigma) : (d.lo >= d.mu ? 1 : 0));
    if (y >= d.hi) {
      const below = d.sigma > 0 ? Phi((d.hi - d.mu) / d.sigma) : (d.hi >= d.mu ? 1 : 0);
      return below + 0.5 * (1 - below);
    }
  }
  return cdfOf(d, y);
}

/**
 * Widen a distribution by an independent variance term (regime inflation).
 *
 * The contract is "a wider distribution, NOT a different mean" — a regime that
 * makes the outcome less certain must not also move the forecast. For `normal`
 * that is automatic; for the others it is not, and both had to be handled:
 *
 *  rice          widening σ raises E[X] ≈ √(ν²+σ²), so ν is pulled back by the
 *                same amount and the mean is held fixed to O(σ⁴/ν³).
 *  logCensored   `extraVar` would land in log1p space, where it is neither the
 *  hurdle        variable's unit nor mean-preserving (measured: 0,80 → 1,39 mm).
 *                Precipitation is therefore not inflated here; its regime
 *                uncertainty belongs in the members, not in a post-hoc widening.
 */
export function inflate(d: Dist, extraVar: number): Dist {
  if (!(extraVar > 0)) return d;
  switch (d.kind) {
    case 'normal':
      return { ...d, sigma: Math.sqrt(d.sigma * d.sigma + extraVar) };
    case 'censoredNormal':
      return { ...d, sigma: Math.sqrt(d.sigma * d.sigma + extraVar) };
    case 'logCensored':
    case 'hurdleLogNormal':
      return d;
    case 'rice': {
      const s2 = d.sigma * d.sigma + extraVar;
      const nu2 = d.nu * d.nu + d.sigma * d.sigma - s2;
      return { kind: 'rice', nu: Math.sqrt(Math.max(0, nu2)), sigma: Math.sqrt(s2) };
    }
  }
}

// ---------------------------------------------------------------------------
// Verification — property-based, plus the analytic cross-check
// ---------------------------------------------------------------------------

export interface DistCheck { name: string; ok: boolean; detail?: string }
export interface DistVerifyResult { checks: DistCheck[]; passed: number; failed: number }

export function verifyDist(): DistVerifyResult {
  const checks: DistCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // --- normal primitives
  add('Phi(0) = 0,5', near(Phi(0), 0.5, 1e-9));
  add('Phi(1,96) ≈ 0,975', near(Phi(1.959964), 0.975, 1e-6), Phi(1.959964).toFixed(6));
  // Gegen EXAKTE Quantile, nicht gegen Phi: die A&S-erf hinter Phi ist nur auf
  // 1,5e-7 genau, ein Rundlauf würde also Phi messen und nicht PhiInv.
  add('PhiInv trifft die exakten Quantile',
    near(PhiInv(0.975), 1.9599639845400545, 1e-8)
    && near(PhiInv(0.5), 0, 1e-12)
    && near(PhiInv(0.025), -1.9599639845400545, 1e-8)
    && near(PhiInv(0.99), 2.3263478740408408, 1e-8),
    PhiInv(0.975).toFixed(10));
  add('Rundlauf PhiInv(Phi(x)) im Rahmen der erf-Genauigkeit',
    near(PhiInv(Phi(0.7)), 0.7, 1e-5) && near(PhiInv(Phi(-2.3)), -2.3, 1e-4));

  // --- generic CRPS against the closed form (the integrator's licence to operate)
  {
    const d: Dist = { kind: 'normal', mu: 3, sigma: 2 };
    let worst = 0;
    for (const y of [-4, 0, 3, 3.5, 9]) {
      worst = Math.max(worst, Math.abs(crpsOf(d, y) - crpsNormal(3, 2, y)));
    }
    add('numerischer CRPS = analytischer CRPS (Normal)', worst < 1e-3, `max Δ = ${worst.toExponential(2)}`);
  }

  // --- NEGATIVE CONTROL: a deliberately wrong sigma must NOT pass the same test
  {
    const wrong = crpsOf({ kind: 'normal', mu: 3, sigma: 2.4 }, 3);
    const right = crpsNormal(3, 2, 3);
    add('Negativkontrolle: falsches σ weicht messbar ab', Math.abs(wrong - right) > 1e-2,
      `Δ = ${(wrong - right).toFixed(4)}`);
  }

  // --- the 1/√2 identity from the specification (mathematik-spezifikation.md §1.3)
  {
    const sigma = 4;
    // E[CRPS(climatology, Y)] over Y~N(0,σ²)  vs  E[|Y|] for the point forecast.
    let a = 0, b = 0;
    const n = 20001;
    for (let i = 0; i < n; i++) {
      const p = (i + 0.5) / n;
      const y = sigma * PhiInv(p);
      a += crpsNormal(0, sigma, y);
      b += Math.abs(y);
    }
    const ratio = a / b;
    add('kalibrierte Verteilung schlägt den besten Punktwert um Faktor 1/√2',
      near(ratio, Math.SQRT1_2, 2e-3), `Verhältnis = ${ratio.toFixed(5)} (Soll ${Math.SQRT1_2.toFixed(5)})`);
  }

  // --- censored normal: mass sits ON the bounds, mean stays inside
  {
    const d: Dist = { kind: 'censoredNormal', mu: 95, sigma: 25, lo: 0, hi: 100 };
    add('Zensiert: q90 nicht über der Obergrenze', quantileOf(d, 0.9) <= 100 + 1e-9);
    add('Zensiert: Mittel liegt im Intervall', meanOf(d) > 0 && meanOf(d) < 100, meanOf(d).toFixed(2));
    add('Zensiert: P(Y ≥ 100) > 0 (echte Masse am Rand)', 1 - cdfOf(d, 99.999) > 0.3);
  }

  // --- log-censored: the dry probability follows from mu and sigma, not from a knob
  {
    // mu = −0,5·sigma ⇒ P(dry) = Phi(0,5) ≈ 0,691
    const sigma = 1.2;
    const d: Dist = { kind: 'logCensored', mu: -0.5 * sigma, sigma };
    const pDry = cdfOf(d, 0);
    add('Niederschlag: P(0 mm) = Phi(−mu/σ)', near(pDry, Phi(0.5), 1e-9), pDry.toFixed(4));
    add('Niederschlag: q50 = 0, solange P(trocken) > ½', quantileOf(d, 0.5) === 0);
    add('Niederschlag: q90 > 0', quantileOf(d, 0.9) > 0, quantileOf(d, 0.9).toFixed(2));
    add('Niederschlag: nie negativ', quantileOf(d, 0.001) >= 0 && quantileOf(d, 0.999) >= 0);
    add('Niederschlag: cdf an der Nullstelle stetig von oben',
      near(cdfOf(d, 1e-9), pDry, 1e-6));
    const mc = crpsOf(d, 0);
    add('Niederschlag: CRPS endlich und ≥ 0', Number.isFinite(mc) && mc >= 0, mc.toFixed(4));
    // analytic mean cross-check by quadrature over the quantile function
    let mq = 0; const nq = 20000;
    for (let i = 0; i < nq; i++) mq += quantileOf(d, (i + 0.5) / nq);
    mq /= nq;
    add('Niederschlag: analytisches Mittel = Quantil-Quadratur',
      near(meanOf(d), mq, 2e-3), `${meanOf(d).toFixed(5)} vs ${mq.toFixed(5)}`);
    // more rain in the mean must mean less dry probability
    const wetter: Dist = { kind: 'logCensored', mu: 0.4, sigma };
    add('Niederschlag: nasser ⇒ kleinere Trockenwahrscheinlichkeit',
      cdfOf(wetter, 0) < pDry, `${cdfOf(wetter, 0).toFixed(3)} < ${pDry.toFixed(3)}`);
  }

  // --- hurdle: "whether" and "how much, if so" are two numbers that cannot fight (K-2)
  {
    const d: Dist = { kind: 'hurdleLogNormal', pDry: 0.3, mu: Math.log(2), sigma: 0.6 };
    add('Hurdle: P(0 mm) = pDry', near(cdfOf(d, 0), 0.3, 1e-12));
    add('Hurdle: cdf an der Nullstelle stetig von oben', near(cdfOf(d, 1e-9), 0.3, 1e-6));
    add('Hurdle: q(pDry) = 0 und q(pDry + ε) > 0', quantileOf(d, 0.3) === 0 && quantileOf(d, 0.3001) > 0);
    add('Hurdle: bedingter Median (nass) = exp(mu) = 2 mm/h', near(quantileOf(d, 0.65), 2, 1e-6), quantileOf(d, 0.65).toFixed(5));
    add('Hurdle: nie negativ', quantileOf(d, 0.001) >= 0 && quantileOf(d, 0.999) >= 0);
    let mq = 0; const nq = 20000;
    for (let i = 0; i < nq; i++) mq += quantileOf(d, (i + 0.5) / nq);
    mq /= nq;
    add('Hurdle: analytisches Mittel = Quantil-Quadratur',
      near(meanOf(d), mq, 5e-3 * meanOf(d)), `${meanOf(d).toFixed(5)} vs ${mq.toFixed(5)}`);
    const mc = crpsOf(d, 1.5);
    add('Hurdle: CRPS endlich und ≥ 0', Number.isFinite(mc) && mc >= 0, mc.toFixed(4));
    add('Hurdle: PIT nutzt die Mitte des Atoms', near(pitOf(d, 0), 0.15, 1e-12));
    add('Hurdle: keine nachträgliche Aufweitung (Einheitenfalle)', inflate(d, 0.5) === d);
    let ok = true;
    for (const p of [0.35, 0.5, 0.75, 0.95]) if (!near(cdfOf(d, quantileOf(d, p)), p, 2e-3)) ok = false;
    add('Rundlauf cdf(quantile(p)) = p — hurdleLogNormal', ok);
    // NEGATIVE CONTROL: the atom is real mass — with pDry ≥ ½ the median is 0
    // although the wet part is centred at 2 mm/h.
    const dry: Dist = { kind: 'hurdleLogNormal', pDry: 0.6, mu: Math.log(2), sigma: 0.6 };
    add('Hurdle Negativkontrolle: pDry ≥ ½ ⇒ Median 0 trotz 2 mm/h bedingtem Median',
      quantileOf(dry, 0.5) === 0 && quantileOf(dry, 0.9) > 1, `${quantileOf(dry, 0.5)} / ${quantileOf(dry, 0.9).toFixed(2)}`);
  }

  // --- Rice: cdf monotone, mean between nu and the Rayleigh limit, never negative
  {
    const calm: Dist = { kind: 'rice', nu: 0.4, sigma: 1.2 };
    const windy: Dist = { kind: 'rice', nu: 12, sigma: 1.5 };
    add('Wind: q10 ≥ 0 auch bei Flaute', quantileOf(calm, 0.1) >= 0, quantileOf(calm, 0.1).toFixed(3));
    add('Wind: Flaute ist rechtsschief (Median < Mittel)',
      quantileOf(calm, 0.5) < meanOf(calm), `${quantileOf(calm, 0.5).toFixed(2)} < ${meanOf(calm).toFixed(2)}`);
    add('Wind: bei starkem Wind fast symmetrisch (Median ≈ nu)',
      near(quantileOf(windy, 0.5), 12, 0.2), quantileOf(windy, 0.5).toFixed(3));
    add('Wind: cdf monoton', (() => {
      let prev = -1;
      for (let x = 0; x <= 25; x += 0.25) { const c = riceCdf(x, 12, 1.5); if (c < prev - 1e-12) return false; prev = c; }
      return true;
    })());
    // Rayleigh special case nu=0: median = σ√(2 ln2)
    add('Wind: nu = 0 ergibt Rayleigh (Median = σ·√(2ln2))',
      near(quantileOf({ kind: 'rice', nu: 0, sigma: 2 }, 0.5), 2 * Math.sqrt(2 * Math.LN2), 1e-3),
      quantileOf({ kind: 'rice', nu: 0, sigma: 2 }, 0.5).toFixed(4));
    // REGRESSION: bei ν/σ ≳ 38,6 unterlief exp(−½(ν/σ)²) auf 0 und ALLE
    // Quantile fielen auf die Bisektions-Klammer — bei 15 m/s Sturm 36 % zu
    // hoch, während der Mittelwert stimmte. Der Test deckt beide Zweige ab.
    {
      let ok = true, detail = '';
      for (const [nu, sg] of [[12, 1.5], [14.7, 0.36], [25, 0.4], [40, 0.5]] as const) {
        const d: Dist = { kind: 'rice', nu, sigma: sg };
        const q10 = quantileOf(d, 0.1), q50 = quantileOf(d, 0.5), q90 = quantileOf(d, 0.9);
        const spread = q90 - q10;
        // Für ν ≫ σ ist die Rice-Verteilung nahezu normal: q90−q10 ≈ 2,563·σ.
        if (!(spread > 1.8 * sg && spread < 3.4 * sg)) { ok = false; detail = `nu=${nu} σ=${sg}: q10..q90 = ${q10.toFixed(2)}..${q90.toFixed(2)}`; }
        if (!(Math.abs(q50 - Math.sqrt(nu * nu + sg * sg)) < 0.15 * sg + 0.05)) { ok = false; detail += ` med=${q50.toFixed(3)}`; }
      }
      add('Wind: Quantile bleiben auch bei Sturm getrennt (kein Reihen-Unterlauf)', ok, detail || 'alle vier Fälle');
      // Negativkontrolle: der Grenzfall-Zweig muss stetig an die Reihe anschließen.
      const below = meanOf({ kind: 'rice', nu: 19.9, sigma: 1 });
      const above = meanOf({ kind: 'rice', nu: 20.1, sigma: 1 });
      add('Wind: kein Sprung an der Zweiggrenze des Mittelwerts',
        Math.abs((above - below) - 0.2) < 0.01, `${below.toFixed(4)} → ${above.toFixed(4)}`);
    }

    // Mean of Rayleigh = σ√(π/2)
    add('Wind: nu = 0 Mittel = σ·√(π/2)',
      near(meanOf({ kind: 'rice', nu: 0, sigma: 2 }), 2 * Math.sqrt(Math.PI / 2), 1e-3),
      meanOf({ kind: 'rice', nu: 0, sigma: 2 }).toFixed(4));
  }

  // --- quantile/cdf round trip for every family
  {
    const fams: Array<[string, Dist]> = [
      ['normal', { kind: 'normal', mu: 5, sigma: 3 }],
      ['censoredNormal', { kind: 'censoredNormal', mu: 50, sigma: 20, lo: 0, hi: 100 }],
      ['rice', { kind: 'rice', nu: 6, sigma: 1.4 }],
    ];
    for (const [name, d] of fams) {
      let ok = true;
      for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        if (!near(cdfOf(d, quantileOf(d, p)), p, 2e-3)) ok = false;
      }
      add(`Rundlauf cdf(quantile(p)) = p — ${name}`, ok);
    }
  }

  // --- inflation only ever widens
  {
    const d: Dist = { kind: 'normal', mu: 0, sigma: 2 };
    const w = inflate(d, 4) as { sigma: number };
    add('Inflation verbreitert (2 ⊕ 2 = √8)', near(w.sigma, Math.sqrt(8), 1e-12), w.sigma.toFixed(4));
    add('Inflation mit 0 ändert nichts', inflate(d, 0) === d);
  }

  // --- inflate must widen without moving the mean (the contract in priors.ts)
  {
    const r: Dist = { kind: 'rice', nu: 5, sigma: 1 };
    const w = inflate(r, 1.4);
    add('Aufweitung verschiebt den Wind-Mittelwert nicht',
      Math.abs(meanOf(w) - meanOf(r)) < 0.02, `${meanOf(r).toFixed(4)} → ${meanOf(w).toFixed(4)}`);
    add('Aufweitung verbreitert den Wind wirklich',
      (quantileOf(w, 0.9) - quantileOf(w, 0.1)) > (quantileOf(r, 0.9) - quantileOf(r, 0.1)) * 1.2);
    const c: Dist = { kind: 'censoredNormal', mu: 50, sigma: 10, lo: 0, hi: 100 };
    add('Aufweitung verschiebt eine mittige zensierte Verteilung nicht',
      Math.abs(meanOf(inflate(c, 100)) - meanOf(c)) < 0.01);
    const lc: Dist = { kind: 'logCensored', mu: 0.5, sigma: 0.4 };
    add('Niederschlag wird NICHT nachträglich aufgeweitet (Einheitenfalle)',
      inflate(lc, 0.5) === lc);
  }

  // --- PIT must honour the atoms, or the calibration test measures its own bug
  {
    const c: Dist = { kind: 'censoredNormal', mu: 5, sigma: 25, lo: 0, hi: 100 };
    const atLo = pitOf(c, 0), full = cdfOf(c, 0);
    add('PIT nutzt die Mitte des unteren Atoms', Math.abs(atLo - 0.5 * full) < 1e-9,
      `${atLo.toFixed(4)} statt ${full.toFixed(4)}`);
    add('PIT am oberen Rand unter 1', pitOf(c, 100) < 1 && pitOf(c, 100) > cdfOf(c, 99.999));
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyDist: typeof verifyDist }).__verifyDist = verifyDist;
}
