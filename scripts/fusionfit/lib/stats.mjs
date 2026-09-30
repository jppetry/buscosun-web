/**
 * stats.mjs — the verification statistics of phase FL (`audit/fusion-lernphase.md` §6), extracted from
 * `scripts/verify-pv-score.mjs` (Diebold–Mariano with HAC, Φ, block bootstrap over days, Brier + reliability, PIT)
 * and extended by ETS, Benjamini–Hochberg and CRPSS; since phase FX (M1/C5) also the calibration measures `sdOf` and
 * `pitRandomOf`. Pure functions and small accumulators; no I/O.
 */
import { lcg } from '../../../src/point/calibFit.ts';
import { cdfOf, meanOf, Phi, phi, cloudMixParts, cloudMixMiddleMean, cloudMixMiddleVar } from '../../../src/pointForecast/fusion/dist.ts';

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * CRPS as the integral ∫ (F(x) − 1{x ≥ y})² dx on a grid [lo, hi] with n cells (midpoint rule) — for families whose
 * quantile needs a bisection (Rice: 60 CDF calls per quantile, `dist.ts`), this needs n CDF calls instead of 60 n.
 * The grid must cover the mass: outside [lo, hi] the integrand is taken as 0 (below lo) resp. 0 (above hi) when y is
 * inside; a y outside the grid adds the exact linear tail |y − bound|.
 */
export function crpsByCdf(d, y, lo, hi, n = 96) {
  if (!(hi > lo)) return Math.abs(y - lo);
  const h = (hi - lo) / n;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const x = lo + (i + 0.5) * h;
    const F = cdfOf(d, x);
    const s = x >= y ? 1 : 0;
    acc += (F - s) * (F - s);
  }
  let out = acc * h;
  if (y < lo) out += lo - y;          // F ≈ 0 below lo, the step is at y: ∫_y^lo 1 dx
  else if (y > hi) out += y - hi;     // F ≈ 1 above hi: ∫_hi^y 1 dx
  return out;
}

/**
 * Standard normal CDF — the one definition of `dist.ts` (erf-based). The former local copy (Abramowitz–Stegun 7.1.26 applied
 * to z instead of z/√2, inherited from `verify-pv-score.mjs`) returned Φ(z·√2): Φ(1,96) = 0,997 instead of 0,975, so every
 * DM p-value was too small (V-FL-25, 24.09.2026). Re-exported so callers keep the name.
 */
export { Phi };

/** ln Γ(x), Lanczos (g = 7, 9 terms) — for the Student t of the small-sample DM test. */
function lnGamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised incomplete beta I_x(a, b), continued fraction (modified Lentz). */
function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(1 - x, b, a);
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const tiny = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  d = Math.abs(d) < tiny ? tiny : d; d = 1 / d;
  let f = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + num * d; d = Math.abs(d) < tiny ? tiny : d; d = 1 / d;
    c = 1 + num / c; c = Math.abs(c) < tiny ? tiny : c;
    f *= d * c;
    num = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + num * d; d = Math.abs(d) < tiny ? tiny : d; d = 1 / d;
    c = 1 + num / c; c = Math.abs(c) < tiny ? tiny : c;
    const del = d * c;
    f *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return (front * f) / a;
}

/** CDF of Student's t with ν degrees of freedom. */
export function studentTCdf(t, nu) {
  if (!Number.isFinite(t) || !(nu > 0)) return NaN;
  const ib = 0.5 * betaInc(nu / (nu + t * t), nu / 2, 0.5);
  return t >= 0 ? 1 - ib : ib;
}

/**
 * Diebold–Mariano on the time series of daily mean score differences d_t (candidate − reference), HAC (Newey–West,
 * Bartlett, L = ⌊1,5·n^{1/3}⌋). `byDay` = Map<dayIdx, [sum, n]>. Negative stat ⇒ the candidate is better.
 *
 * Small-sample form (phase EX, 29.09.2026 — the archive cards rest on 13 issue days): the statistic is scaled after
 * Harvey, Leybourne & Newbold (1997), √((n + 1 − 2h + h(h − 1)/n)/n) with h = L + 1, and referred to Student's t with
 * n − 1 degrees of freedom instead of the normal. At n = 13 (L = 3) the factor is 0,73 and |t| = 2,18 marks 5 %, where
 * the normal form took 1,96 of the unscaled statistic; at n = 120 (L = 7) the factor is 0,94. The former values ride along as
 * `statNormal` / `pNormal`, so an old card can be read against a new one.
 */
export function dmTest(byDay) {
  const keys = [...byDay.keys()].sort((a, b) => a - b);
  const d = keys.map((k) => { const [s, n] = byDay.get(k); return s / n; });
  const n = d.length;
  if (n < 4) return { n, stat: NaN, p: NaN, statNormal: NaN, pNormal: NaN };
  const m = mean(d);
  const L = Math.floor(1.5 * Math.cbrt(n));
  let v = 0;
  for (let lag = 0; lag <= L; lag++) {
    let g = 0;
    for (let t = lag; t < n; t++) g += (d[t] - m) * (d[t - lag] - m);
    g /= n;
    v += (lag === 0 ? 1 : 2 * (1 - lag / (L + 1))) * g;
  }
  const se = Math.sqrt(Math.max(v, 1e-12) / n);
  const statNormal = m / se;
  const h = L + 1;
  const hln = Math.sqrt(Math.max(0, n + 1 - 2 * h + (h * (h - 1)) / n) / n);
  const stat = statNormal * hln;
  return {
    n, stat, p: 2 * (1 - studentTCdf(Math.abs(stat), n - 1)), meanDiff: m, lag: L, hln,
    statNormal, pNormal: 2 * (1 - Phi(Math.abs(statNormal))),
  };
}

/**
 * Block bootstrap over days of the skill 1 − Σc/Σref; `byDay` = Map<dayIdx, [sumCand, sumRef]>. 90-% interval.
 *
 * Since phase EX a MOVING-block bootstrap (circular, block length L + 1 with the L of `dmTest`) over the days in
 * their order: the former draw took single days independently, which treats consecutive days as unrelated and
 * gives an interval that is too narrow when a weather regime spans several days. Same seed, same number of draws.
 */
export function bootstrapSkill(byDay, draws = 200, seed = 12345) {
  const days = [...byDay.keys()].sort((a, b) => a - b).map((k) => byDay.get(k));
  if (days.length < 2) return null;
  const rnd = lcg(seed);
  const boots = [];
  const n = days.length, blk = Math.min(n, Math.floor(1.5 * Math.cbrt(n)) + 1);
  for (let b = 0; b < draws; b++) {
    let c = 0, r = 0, taken = 0;
    while (taken < n) {
      const start = Math.floor(rnd() * n);
      for (let j = 0; j < blk && taken < n; j++, taken++) { const a = days[(start + j) % n]; c += a[0]; r += a[1]; }
    }
    if (r > 0) boots.push(1 - c / r);
  }
  boots.sort((a, b) => a - b);
  return boots.length ? [boots[Math.floor(0.05 * boots.length)], boots[Math.floor(0.95 * (boots.length - 1))]] : null;
}

/** Benjamini–Hochberg: adjusted p-values (monotone), same order as input. */
export function benjaminiHochberg(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const m = idx.length, out = new Array(ps.length).fill(NaN);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [p, i] = idx[k]; prev = Math.min(prev, (p * m) / (k + 1)); out[i] = prev; }
  return out;
}

/**
 * Standard deviation of the OBSERVABLE variable of a predictive distribution (phase FX, hypotheses M1/C5 — absorbs
 * V-FL-14/39/41/42). The scorer's former "spread" was the LATENT σ of the censored normal, the per-component σ of the
 * Rice and (q84−q16)/2 of the TN; for a censored variable the latent σ overstates the spread of what is observed, so
 * the spread/skill gate measured its own definition (measured 25.09.2026 on the clouds: latent σ/RMSE 1,29–1,71 against
 * Tobit sd/RMSE 0,93–0,96, while the wind's 0,83–0,85 is real). Closed forms:
 *   normal           σ
 *   truncatedNormal  σ·√(1 + α·λ − λ²), α = (lo − μ)/σ, λ = φ(α)/(1 − Φ(α))
 *   censoredNormal   Tobit sd on [lo, hi]: E[Y] and E[Y²] from the two atoms plus the truncated moments
 *   rice             √(2σ² + ν² − E²), E = `meanOf`
 *   hurdleLogNormal  null — an atom at zero, spread/skill is not defined (G-FL-2 does not apply)
 * Checked against a 20 000-node quantile grid in `verify:fusion-fit` block 11.
 */
export function sdOf(d) {
  switch (d.kind) {
    case 'normal': return d.sigma > 0 ? d.sigma : 0;
    case 'cloudMix': {
      // AX-4: E = 100·po + pm·m, E[Y²] = 100²·po + pm·(var + m²) of the truncated middle part
      const { po, pm } = cloudMixParts(d);
      const m = cloudMixMiddleMean(d.mu, d.sigma), v = cloudMixMiddleVar(d.mu, d.sigma);
      const E = 100 * po + pm * m, E2 = 10000 * po + pm * (v + m * m);
      return Math.sqrt(Math.max(0, E2 - E * E));
    }
    case 'truncatedNormal': {
      if (!(d.sigma > 0)) return 0;
      const a = (d.lo - d.mu) / d.sigma, Z = 1 - Phi(a);
      if (!(Z > 1e-12)) return 0;
      const l = phi(a) / Z;
      return d.sigma * Math.sqrt(Math.max(0, 1 + a * l - l * l));
    }
    case 'censoredNormal': {
      if (!(d.sigma > 0)) return 0;
      const sg = d.sigma, a = (d.lo - d.mu) / sg, b = (d.hi - d.mu) / sg, Pa = Phi(a), Pb = Phi(b), fa = phi(a), fb = phi(b), mid = Pb - Pa;
      const E = d.lo * Pa + d.mu * mid + sg * (fa - fb) + d.hi * (1 - Pb);
      const E2 = d.lo * d.lo * Pa + d.hi * d.hi * (1 - Pb) + d.mu * d.mu * mid + 2 * d.mu * sg * (fa - fb) + sg * sg * (mid + a * fa - b * fb);
      return Math.sqrt(Math.max(0, E2 - E * E));
    }
    case 'rice': { if (!(d.sigma > 0)) return 0; const E = meanOf(d); return Math.sqrt(Math.max(0, 2 * d.sigma * d.sigma + d.nu * d.nu - E * E)); }
    default: return null;
  }
}

/**
 * Randomised PIT (phase FX, C5): `pitOf` of `dist.ts` puts an observation ON an atom at the midpoint of the atom's
 * interval, which piles every censored hour into one decile and shows a histogram defect where the forecast is fine
 * (V-FL-41/42). With u ~ U[0, 1) the PIT of an atom observation is uniform on the atom's interval (Czado, Gneiting &
 * Held 2009): censoredNormal y ≤ lo → u·F(lo), y ≥ hi → F(hi⁻) + u·(1 − F(hi⁻)) with F(hi⁻) = Φ((hi − μ)/σ);
 * hurdleLogNormal y ≤ 0 → u·pDry; families without atoms → `cdfOf`. The caller draws u — deterministically per
 * (row, variable), so every candidate of a row sees the same u.
 */
export function pitRandomOf(d, y, u) {
  if (d.kind === 'cloudMix') {
    // AX-4: two learned atoms — randomised inside each
    const { pc, po } = cloudMixParts(d);
    if (y <= 0) return u * pc;
    if (y >= 100) return (1 - po) + u * po;
    return cdfOf(d, y);
  }
  if (d.kind === 'censoredNormal') {
    const F = (x) => (d.sigma > 0 ? Phi((x - d.mu) / d.sigma) : x >= d.mu ? 1 : 0);
    if (y <= d.lo) return u * F(d.lo);
    if (y >= d.hi) { const below = F(d.hi); return below + u * (1 - below); }
    return cdfOf(d, y);
  }
  if ((d.kind === 'hurdleLogNormal' || d.kind === 'logCensored') && y <= 0) return u * cdfOf(d, 0);
  return cdfOf(d, y);
}

/** Running summary of a scalar score and of a probabilistic forecast. */
export class ScoreAcc {
  constructor() { this.n = 0; this.sumAbs = 0; this.sumErr = 0; this.sumSq = 0; this.sumCrps = 0; this.nCrps = 0; this.sumSigma = 0; this.sumSd = 0; this.sumVar = 0; this.nSd = 0; this.pit = new Float64Array(10); this.nPit = 0; }
  /**
   * `err` = forecast − truth (median or mean), `crps` (null for deterministic ⇒ |err|), `pit` (null when not probabilistic),
   * `sigma` = the latent spread (today's definition, kept for `spreadSkillLatent`), `sd` = the observable sd (`sdOf`; phase FX)
   * — when the caller passes no `sd` the latent σ stands in, an explicit null (hurdle) leaves the sd sums untouched.
   */
  add(err, crps, pit, sigma, sd = sigma) {
    this.n += 1; this.sumAbs += Math.abs(err); this.sumErr += err; this.sumSq += err * err;
    this.sumCrps += crps == null ? Math.abs(err) : crps; this.nCrps += 1;
    if (pit != null && Number.isFinite(pit)) { this.pit[Math.min(9, Math.max(0, Math.floor(pit * 10)))] += 1; this.nPit += 1; }
    if (sigma != null && Number.isFinite(sigma)) this.sumSigma += sigma;
    if (sd != null && Number.isFinite(sd)) { this.sumSd += sd; this.sumVar += sd * sd; this.nSd += 1; }
  }
  /**
   * `spreadSkill` = √(mean sd²)/RMSE — the rms definition (E[σ²] = E[e²] is the calibration identity; the gate reads this);
   * `spreadSkillMean` = mean(sd)/RMSE; `spreadSkillLatent` = mean(latent σ)/RMSE, the definition up to Scorecard 4 (like-for-like
   * reading against older cards).
   */
  summary() {
    const n = this.n;
    if (!n) return null;
    const rmse = Math.sqrt(this.sumSq / n);
    const pit = this.nPit ? Array.from(this.pit).map((c) => c / this.nPit) : null;
    return {
      n, mae: this.sumAbs / n, bias: this.sumErr / n, rmse, crps: this.sumCrps / Math.max(1, this.nCrps), pit, pitOuter: pit ? pit[0] + pit[9] : null,
      spreadSkill: this.nSd && rmse > 0 ? Math.sqrt(this.sumVar / this.nSd) / rmse : null,
      spreadSkillMean: this.nSd && rmse > 0 ? this.sumSd / this.nSd / rmse : null,
      spreadSkillLatent: this.nPit && rmse > 0 ? this.sumSigma / this.nPit / rmse : null,
    };
  }
}

/** Brier score, base rate and a 10-bin reliability diagram for a probability forecast of a binary event. */
export class BrierAcc {
  constructor() { this.n = 0; this.sumSq = 0; this.sumObs = 0; this.bins = Array.from({ length: 10 }, () => [0, 0, 0]); }
  add(p, y) { this.n += 1; this.sumSq += (p - y) ** 2; this.sumObs += y; const b = this.bins[Math.min(9, Math.max(0, Math.floor(p * 10)))]; b[0] += 1; b[1] += p; b[2] += y; }
  summary() {
    if (!this.n) return null;
    const base = this.sumObs / this.n, brier = this.sumSq / this.n;
    return { n: this.n, brier, baseRate: base, bss: 1 - brier / (base * (1 - base) || 1), reliability: this.bins.map(([n, fp, fo], i) => ({ bin: `${i * 10}–${(i + 1) * 10} %`, n, fc: n ? fp / n : null, obs: n ? fo / n : null })) };
  }
}

/** 2×2 contingency table → ETS (Gilbert), POD, FAR, frequency bias. */
export class EtsAcc {
  constructor() { this.a = 0; this.b = 0; this.c = 0; this.d = 0; }
  add(fc, ob) { if (fc && ob) this.a += 1; else if (fc && !ob) this.b += 1; else if (!fc && ob) this.c += 1; else this.d += 1; }
  summary() {
    const { a, b, c, d } = this, n = a + b + c + d;
    if (!n) return null;
    const ar = ((a + b) * (a + c)) / n;
    const ets = a + b + c - ar > 0 ? (a - ar) / (a + b + c - ar) : null;
    return { n, hits: a, falseAlarms: b, misses: c, ets, pod: a + c ? a / (a + c) : null, far: a + b ? b / (a + b) : null, bias: a + c ? (a + b) / (a + c) : null };
  }
}

/** Per-day sums for DM and bootstrap of one (candidate, reference) pair. */
export class PairAcc {
  constructor() { this.byDay = new Map(); }
  add(dayIdx, scoreCand, scoreRef) { let a = this.byDay.get(dayIdx); if (!a) { a = [0, 0, 0]; this.byDay.set(dayIdx, a); } a[0] += scoreCand; a[1] += scoreRef; a[2] += 1; }
  summary() {
    if (!this.byDay.size) return null;
    const diff = new Map(); let c = 0, r = 0, n = 0;
    for (const [d, [sc, sr, k]] of this.byDay) { diff.set(d, [sc - sr, k]); c += sc; r += sr; n += k; }
    const dm = dmTest(diff);
    return { n, days: this.byDay.size, skill: r > 0 ? 1 - c / r : null, dm, ci90: bootstrapSkill(new Map([...this.byDay].map(([d, [sc, sr]]) => [d, [sc, sr]]))) };
  }
}
