/**
 * metrics.ts — the measures of the Prüfstand (protocol P1, Konzept §7). Pure functions on numbers and array slices; no
 * I/O. Reference values come from the Python package `scores` (Bureau of Meteorology), generated once offline into
 * `scripts/pruefstand/fixtures/metrics.scores.json`; `verify:pruefstand` holds every function against them (< 1e-9).
 *
 * Main measure: CRPS_Q = (2/K) · Σ_k QS_τk(q_k, y) with QS_τ(q, y) = (1{y < q} − τ)(q − y). Proper for the quantile set;
 * for symmetric levels a point value (all quantiles equal) scores |y − x|.
 */

type Arr = ArrayLike<number>;

/** Quantile (pinball) score of one quantile forecast. */
export function quantileScore(tau: number, q: number, y: number): number {
  return ((y < q ? 1 : 0) - tau) * (q - y);
}

/** CRPS_Q of the quantile set `q[off … off + taus.length)` against `y`. */
export function crpsQ(taus: Arr, q: Arr, y: number, off = 0): number {
  let s = 0;
  for (let k = 0; k < taus.length; k++) { const x = q[off + k]; s += ((y < x ? 1 : 0) - taus[k]) * (x - y); }
  return (2 * s) / taus.length;
}

/**
 * Threshold-weighted CRPS_Q for the upper tail (weight 1{z ≥ thr}): the chaining function v(z) = max(z, thr) is applied
 * to quantiles and observation (Allen et al. 2023) — no case is selected by the observed event (Konzept R-5).
 */
export function twCrpsQ(taus: Arr, q: Arr, y: number, thr: number, off = 0): number {
  const yy = y > thr ? y : thr;
  let s = 0;
  for (let k = 0; k < taus.length; k++) { const x = q[off + k] > thr ? q[off + k] : thr; s += ((yy < x ? 1 : 0) - taus[k]) * (x - yy); }
  return (2 * s) / taus.length;
}

/** Position of the observation in the quantile set: 0 = below the first quantile … K = at or above the last (K + 1 classes). */
export function quantileRank(q: Arr, y: number, n: number, off = 0): number {
  let r = 0;
  while (r < n && y >= q[off + r]) r++;
  return r;
}

/** Mean absolute angular difference in degrees (0…180). */
export function angleError(fcDeg: number, obDeg: number): number {
  const d = Math.abs(fcDeg - obDeg) % 360;
  return d > 180 ? 360 - d : d;
}

export interface BrierDecomposition { n: number; brier: number; reliability: number; resolution: number; uncertainty: number; baseRate: number; bins: Array<{ n: number; fc: number; obs: number }> }
/**
 * Brier score with Murphy's (1973) decomposition over `bins` equal-width probability bins:
 * BS = REL − RES + UNC holds exactly when the forecasts inside a bin are identical; otherwise the remainder is the
 * within-bin variance (reported by the caller as `brier − (rel − res + unc)`).
 */
export function brierDecomposition(p: Arr, o: Arr, bins = 10): BrierDecomposition {
  const n = p.length;
  const cnt = new Float64Array(bins), sp = new Float64Array(bins), so = new Float64Array(bins);
  let bs = 0, ob = 0;
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(p[i] * bins)));
    cnt[b] += 1; sp[b] += p[i]; so[b] += o[i];
    bs += (p[i] - o[i]) * (p[i] - o[i]); ob += o[i];
  }
  const base = n ? ob / n : NaN;
  let rel = 0, res = 0;
  const out: BrierDecomposition['bins'] = [];
  for (let b = 0; b < bins; b++) {
    if (!cnt[b]) { out.push({ n: 0, fc: NaN, obs: NaN }); continue; }
    const f = sp[b] / cnt[b], x = so[b] / cnt[b];
    rel += cnt[b] * (f - x) * (f - x); res += cnt[b] * (x - base) * (x - base);
    out.push({ n: cnt[b], fc: f, obs: x });
  }
  return { n, brier: n ? bs / n : NaN, reliability: n ? rel / n : NaN, resolution: n ? res / n : NaN, uncertainty: base * (1 - base), baseRate: base, bins: out };
}

/**
 * Isotonic regression of the outcomes on the forecast probabilities (pool-adjacent-violators) — the recalibrated
 * probabilities of the CORP reliability diagram (Dimitriadis, Gneiting & Jordan 2021). Returns the fitted value per
 * input, in input order. Ties in `p` are pooled first. With `weight` every input is a group of that many cases whose
 * outcome `o` is the group's mean (the scorer feeds probability bins).
 */
export function isotonicFit(p: Arr, o: Arr, weight?: Arr): Float64Array {
  const n = p.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  // 1 pool ties: one group per distinct forecast value (weighted mean outcome)
  const gVal: number[] = [], gW: number[] = [], gOf = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    const i = idx[k], wi = weight ? weight[i] : 1;
    if (k && p[i] === p[idx[k - 1]]) { const j = gVal.length - 1; gVal[j] = (gVal[j] * gW[j] + o[i] * wi) / (gW[j] + wi); gW[j] += wi; }
    else { gVal.push(o[i]); gW.push(wi); }
    gOf[i] = gVal.length - 1;
  }
  // 2 pool adjacent violators over the groups; `size` = groups per block
  const val: number[] = [], w: number[] = [], size: number[] = [];
  for (let j = 0; j < gVal.length; j++) {
    val.push(gVal[j]); w.push(gW[j]); size.push(1);
    while (val.length > 1 && val[val.length - 2] > val[val.length - 1]) {
      const b = val.pop() as number, wb = w.pop() as number, sb = size.pop() as number, t = val.length - 1;
      val[t] = (val[t] * w[t] + b * wb) / (w[t] + wb); w[t] += wb; size[t] += sb;
    }
  }
  const fitOfGroup = new Float64Array(gVal.length);
  let g = 0;
  for (let t = 0; t < val.length; t++) for (let c = 0; c < size[t]; c++) fitOfGroup[g++] = val[t];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = fitOfGroup[gOf[i]];
  return out;
}

/** CORP decomposition of the Brier score: BS = MCB − DSC + UNC (miscalibration, discrimination, uncertainty). */
export function corpDecomposition(p: Arr, o: Arr): { brier: number; mcb: number; dsc: number; unc: number } {
  const n = p.length;
  const r = isotonicFit(p, o);
  let bs = 0, bsr = 0, ob = 0;
  for (let i = 0; i < n; i++) { bs += (p[i] - o[i]) ** 2; bsr += (r[i] - o[i]) ** 2; ob += o[i]; }
  const base = ob / n, unc = base * (1 - base);
  return { brier: bs / n, mcb: bs / n - bsr / n, dsc: unc - bsr / n, unc };
}

/** Ranked probability score of one forecast: `cum` = cumulative class probabilities (last = 1), `cat` = observed class index. */
export function rps(cum: Arr, cat: number): number {
  let s = 0;
  for (let k = 0; k < cum.length - 1; k++) { const d = cum[k] - (cat <= k ? 1 : 0); s += d * d; }
  return s;
}

/** Symmetric extremal dependence index (Ferro & Stephenson 2011) from hits a, false alarms b, misses c, correct negatives d. */
export function sedi(a: number, b: number, c: number, d: number): number {
  const H = a / (a + c), F = b / (b + d);
  if (!(H > 0 && H < 1 && F > 0 && F < 1)) return NaN;
  return (Math.log(F) - Math.log(H) - Math.log(1 - F) + Math.log(1 - H)) / (Math.log(F) + Math.log(H) + Math.log(1 - F) + Math.log(1 - H));
}

/** Skill as a ratio of SUMS on identical cases (Konzept §7): 1 − ΣS / ΣS_ref. */
export function skill(sum: number, sumRef: number): number {
  return sumRef > 0 ? 1 - sum / sumRef : NaN;
}

/** Standard normal quantile (Acklam's rational approximation, |error| < 1,2e-9) — for intervals and detection limits. */
export function normalQuantile(pr: number): number {
  if (!(pr > 0 && pr < 1)) return pr === 0 ? -Infinity : pr === 1 ? Infinity : NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  let x: number;
  if (pr < lo) { const q = Math.sqrt(-2 * Math.log(pr)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (pr <= 1 - lo) { const q = pr - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - pr)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  // one Halley step against the error function-free CDF is not needed at this accuracy
  return x;
}

/**
 * Empirical quantile of a SORTED sample at level τ, linear between order statistics (type 7, the default of NumPy and
 * `scores`) — the climatology reference.
 */
export function sortedQuantile(sorted: Arr, tau: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const h = (n - 1) * tau, lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
