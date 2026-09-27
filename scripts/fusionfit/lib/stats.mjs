/**
 * stats.mjs — the verification statistics of phase FL (`audit/fusion-lernphase.md` §6), extracted from
 * `scripts/verify-pv-score.mjs` (Diebold–Mariano with HAC, Φ, block bootstrap over days, Brier + reliability, PIT)
 * and extended by ETS, Benjamini–Hochberg and CRPSS; since phase FX (M1/C5) also the calibration measures `sdOf` and
 * `pitRandomOf`. Pure functions and small accumulators; no I/O.
 */
import { lcg } from '../../../src/point/calibFit.ts';
import { cdfOf, meanOf, Phi, phi } from '../../../src/pointForecast/fusion/dist.ts';

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

/**
 * Diebold–Mariano on the time series of daily mean score differences d_t (candidate − reference), HAC (Newey–West,
 * Bartlett, L = ⌊1,5·n^{1/3}⌋). `byDay` = Map<dayIdx, [sum, n]>. Negative stat ⇒ the candidate is better.
 */
export function dmTest(byDay) {
  const keys = [...byDay.keys()].sort((a, b) => a - b);
  const d = keys.map((k) => { const [s, n] = byDay.get(k); return s / n; });
  const n = d.length;
  if (n < 4) return { n, stat: NaN, p: NaN };
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
  const stat = m / se;
  return { n, stat, p: 2 * (1 - Phi(Math.abs(stat))), meanDiff: m };
}

/** Block bootstrap over days of the skill 1 − Σc/Σref; `byDay` = Map<dayIdx, [sumCand, sumRef]>. 90-% interval. */
export function bootstrapSkill(byDay, draws = 200, seed = 12345) {
  const days = [...byDay.values()];
  if (days.length < 2) return null;
  const rnd = lcg(seed);
  const boots = [];
  for (let b = 0; b < draws; b++) {
    let c = 0, r = 0;
    for (let i = 0; i < days.length; i++) { const a = days[Math.floor(rnd() * days.length)]; c += a[0]; r += a[1]; }
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
