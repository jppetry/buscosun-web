/**
 * stats.ts — the test statistics of the Prüfstand (protocol P1, Konzept §10). Pure functions.
 *
 * The unit is the DAY: d_t = S_candidate(t) − S_reference(t) per cell, averaged over stations and valid times of the
 * issue day. Consecutive days are correlated, so the standard error of the mean is inflated with the factor k of an
 * AR(2) process fitted by Yule–Walker (Geer 2016: AR(1) is too small); n_eff = n / k². For small n the moving-block
 * bootstrap stands next to it. Multiple cells: Benjamini–Hochberg.
 */
import { normalQuantile } from './metrics';

export function lcg(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
function betaInc(x: number, a: number, b: number): number {
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
/** CDF of Student's t with ν degrees of freedom (ν may be fractional: n_eff − 1). */
export function studentTCdf(t: number, nu: number): number {
  if (!Number.isFinite(t) || !(nu > 0)) return NaN;
  const ib = 0.5 * betaInc(nu / (nu + t * t), nu / 2, 0.5);
  return t >= 0 ? 1 - ib : ib;
}

export interface Ar2 { r1: number; r2: number; phi1: number; phi2: number; k: number; kRaw: number; fallback: null | 'ar1' | 'none' }
/**
 * Inflation factor k of the standard error of a mean for an AR(2) process: k² = (1 + φ2)(1 + φ1 − φ2) / ((1 − φ2)(1 − φ1 − φ2)),
 * φ from Yule–Walker. k is never taken below 1 (a negative estimate from few days must not shrink the error); when the
 * AR(2) estimate is not stationary the AR(1) factor stands in, and with fewer than 5 values k = 1 (`fallback` says so).
 */
export function ar2Inflation(d: ArrayLike<number>): Ar2 {
  const n = d.length;
  if (n < 5) return { r1: NaN, r2: NaN, phi1: NaN, phi2: NaN, k: 1, kRaw: NaN, fallback: 'none' };
  let m = 0;
  for (let i = 0; i < n; i++) m += d[i];
  m /= n;
  let v = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < n; i++) { v += (d[i] - m) ** 2; if (i >= 1) c1 += (d[i] - m) * (d[i - 1] - m); if (i >= 2) c2 += (d[i] - m) * (d[i - 2] - m); }
  if (!(v > 0)) return { r1: 0, r2: 0, phi1: 0, phi2: 0, k: 1, kRaw: 1, fallback: null };
  const r1 = c1 / v, r2 = c2 / v;
  const phi1 = (r1 * (1 - r2)) / (1 - r1 * r1), phi2 = (r2 - r1 * r1) / (1 - r1 * r1);
  const num = (1 + phi2) * (1 + phi1 - phi2), den = (1 - phi2) * (1 - phi1 - phi2);
  const stationary = Math.abs(phi2) < 1 && phi1 + phi2 < 1 && phi2 - phi1 < 1 && num > 0 && den > 0;
  if (stationary) { const kRaw = Math.sqrt(num / den); return { r1, r2, phi1, phi2, k: Math.max(1, kRaw), kRaw, fallback: null }; }
  const k1 = Math.abs(r1) < 1 ? Math.sqrt((1 + r1) / (1 - r1)) : 1;
  return { r1, r2, phi1, phi2, k: Math.max(1, k1), kRaw: k1, fallback: 'ar1' };
}

export interface PairedTest { n: number; mean: number; sd: number; k: number; nEff: number; t: number; pTwoSided: number; pLess: number; pGreater: number; ci95: [number, number]; mde: number; fallback: Ar2['fallback'] }
/**
 * Paired t-test on daily differences with AR(2) inflation. `pLess` = P(mean < 0 is chance) one-sided for "the candidate
 * scores LOWER (better)", `pGreater` for "higher (worse)". `mde` = the smallest true mean difference detectable with the
 * given power at level α (two-sided): (z_{1−α/2} + z_power) · k · sd / √n.
 */
export function pairedTest(d: ArrayLike<number>, alpha = 0.05, power = 0.8): PairedTest {
  const n = d.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += d[i];
  m = n ? m / n : NaN;
  let v = 0;
  for (let i = 0; i < n; i++) v += (d[i] - m) ** 2;
  const sd = n > 1 ? Math.sqrt(v / (n - 1)) : NaN;
  const ar = ar2Inflation(d);
  const nEff = n / (ar.k * ar.k);
  const se = (ar.k * sd) / Math.sqrt(n);
  const nu = Math.max(1, nEff - 1);
  let t = NaN, pLess = NaN, pGreater = NaN, pTwo = NaN;
  if (n >= 2 && se > 0) { t = m / se; const c = studentTCdf(t, nu); pLess = c; pGreater = 1 - c; pTwo = 2 * Math.min(c, 1 - c); }
  else if (n >= 2 && sd === 0) { t = 0; pLess = m === 0 ? 0.5 : m < 0 ? 0 : 1; pGreater = 1 - pLess; pTwo = m === 0 ? 1 : 0; }   // identical days: no spread to test against
  const tq = n >= 2 ? tQuantile(1 - alpha / 2, nu) : NaN;
  return { n, mean: m, sd, k: ar.k, nEff, t, pTwoSided: pTwo, pLess, pGreater, ci95: [m - tq * se, m + tq * se], mde: (normalQuantile(1 - alpha / 2) + normalQuantile(power)) * se, fallback: ar.fallback };
}

/** Quantile of Student's t by bisection on the CDF. */
export function tQuantile(pr: number, nu: number): number {
  let lo = -200, hi = 200;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (studentTCdf(mid, nu) < pr) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Benjamini–Hochberg adjusted p-values (monotone), input order kept; non-finite p stay NaN and do not count. */
export function benjaminiHochberg(ps: ArrayLike<number>): number[] {
  const idx: Array<[number, number]> = [];
  for (let i = 0; i < ps.length; i++) if (Number.isFinite(ps[i])) idx.push([ps[i], i]);
  idx.sort((a, b) => a[0] - b[0]);
  const m = idx.length, out = new Array<number>(ps.length).fill(NaN);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [pv, i] = idx[k]; prev = Math.min(prev, (pv * m) / (k + 1)); out[i] = prev; }
  return out;
}

/** Block length of the moving-block bootstrap for n days: ⌊1,5 · n^(1/3)⌋ + 1 (the rule of `scripts/fusionfit/lib/stats.mjs`). */
export const blockLength = (n: number): number => Math.min(n, Math.floor(1.5 * Math.cbrt(n)) + 1);

/**
 * Moving-block (circular) bootstrap over days of a statistic of per-day sums. `days[i]` = the per-day tuple, `stat` maps
 * the summed tuple to the statistic (e.g. skill 1 − Σc/Σr). Returns the 2,5 % and 97,5 % points and the share of draws
 * with stat ≤ 0 (a one-sided bootstrap p for "not better").
 */
export function blockBootstrap(days: ReadonlyArray<ArrayLike<number>>, stat: (sum: number[]) => number, draws = 1000, seed = 12345): { lo: number; hi: number; pNotPositive: number; n: number } | null {
  const n = days.length;
  if (n < 2) return null;
  const w = days[0].length, blk = blockLength(n), rnd = lcg(seed);
  const vals: number[] = [];
  for (let b = 0; b < draws; b++) {
    const sum = new Array<number>(w).fill(0);
    let taken = 0;
    while (taken < n) {
      const start = Math.floor(rnd() * n);
      for (let j = 0; j < blk && taken < n; j++, taken++) { const a = days[(start + j) % n]; for (let c = 0; c < w; c++) sum[c] += a[c]; }
    }
    const s = stat(sum);
    if (Number.isFinite(s)) vals.push(s);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const at = (f: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(f * (vals.length - 1))))];
  return { lo: at(0.025), hi: at(0.975), pNotPositive: vals.filter((x) => x <= 0).length / vals.length, n: vals.length };
}

/** Binomial confidence band around a nominal coverage p0 for n_eff independent cases: p0 ± z·√(p0(1 − p0)/n_eff). */
export function binomialBand(p0: number, nEff: number, z = 1.96): [number, number] {
  const h = z * Math.sqrt((p0 * (1 - p0)) / Math.max(1, nEff));
  return [Math.max(0, p0 - h), Math.min(1, p0 + h)];
}
