/**
 * fitMean.ts — the mean model of the learning stage (phase FL, `audit/fusion-lernphase.md` §3.2): the EMOS form
 *
 *   form P:  μ = a(Z) + Σ_m [β_m0 + β_m1·dh_m + β_m2·dTsfc] · ŷ_m^A         (per source, exact source class)
 *   form K:  μ = a(Z) + [β_0 + β_1·dh + β_2·dTsfc + β_3·srcCount/5] · ȳ^A    (cube member, per route)
 *
 * where a(Z) since fusionFit@2 also carries the 14 site × diurnal/annual interaction columns of `INTER_NAMES` (V-FL-26;
 * they come last in the design, so the ŷ_m/ȳ column offsets below are unchanged),
 *
 * fitted as a ridge with a target: the Σ-weights of the sources (minimum-variance combination of the height-corrected
 * sources after mean-bias removal, `combine`-style w = Σ⁻¹1/1ᵀΣ⁻¹1) are the prior of the ŷ_m coefficients, the
 * mean bias the prior of the intercept, zero everywhere else. λ by cross-validation over the time folds; the region
 * and band folds are reported (claim B). Nothing here reads rows — it works on the Gram groups the pass accumulated.
 */
import { Gram, ridge, chooseLambda, variancePenalty, type CvResult } from './gram';
import { Z_DIM, Z_NAMES } from './features';
import { P_MODS, K_MODS, INTER_NAMES } from './design';
import { invSpd, nearestPd } from './linalg';
import { foldsOverGroups, sourcesOfMask, STRATUM_MIN, type Form } from './strata';

export const LAMBDAS: readonly number[] = Object.freeze([0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]);

/** The Gram groups of a stratum per fold axis — each axis holds ALL rows of the stratum, keyed by its own component only. */
export interface AxisGroups { month: Map<string, Gram>; region: Map<string, Gram>; band: Map<string, Gram> }
/** The modulator columns live with the design (`design.ts`); re-exported so the fit scripts keep one import. */
export { P_MODS, K_MODS } from './design';

/** Column names of the design of a stratum — the same order as `meanDesignK`/`meanDesignP` write it (`design.ts`). */
export function designNames(form: Form, cls: string): string[] {
  const names: string[] = [...Z_NAMES];
  if (form === 'P') {
    const mask = parseInt(cls.slice(1), 16);
    for (const s of sourcesOfMask(mask)) for (const m of P_MODS) names.push(`${s}${m}`);
  } else for (const m of K_MODS) names.push(`cube${m}`);
  names.push(...INTER_NAMES);
  return names;
}
export const designDim = (form: Form, cls: string): number => designNames(form, cls).length;

/** Pairwise error statistics of the sources of a class (form P): Σe_m, Σe_m e_k, n — for Σ and the weight prior. */
export class ErrorStats {
  readonly k: number;
  n = 0;
  readonly sum: Float64Array;
  readonly cross: Float64Array;
  constructor(k: number) { this.k = k; this.sum = new Float64Array(k); this.cross = new Float64Array(k * k); }
  add(e: Float64Array): void {
    const k = this.k;
    for (let i = 0; i < k; i++) { this.sum[i] += e[i]; for (let j = i; j < k; j++) this.cross[i * k + j] += e[i] * e[j]; }
    this.n += 1;
  }
  merge(o: ErrorStats): void { if (o.k !== this.k) throw new Error('errorstats: dimension'); for (let i = 0; i < this.sum.length; i++) this.sum[i] += o.sum[i]; for (let i = 0; i < this.cross.length; i++) this.cross[i] += o.cross[i]; this.n += o.n; }
  /** Mean bias per source and the error covariance (of the bias-removed errors). */
  covariance(): { bias: Float64Array; cov: Float64Array } {
    const k = this.k, bias = new Float64Array(k), cov = new Float64Array(k * k);
    if (!this.n) return { bias, cov };
    for (let i = 0; i < k; i++) bias[i] = this.sum[i] / this.n;
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) { const c = this.cross[i * k + j] / this.n - bias[i] * bias[j]; cov[i * k + j] = c; cov[j * k + i] = c; }
    return { bias, cov };
  }
  toJSON(): unknown { return { k: this.k, n: this.n, sum: Array.from(this.sum), cross: Array.from(this.cross) }; }
  static fromJSON(o: { k: number; n: number; sum: number[]; cross: number[] }): ErrorStats { const s = new ErrorStats(o.k); s.n = o.n; s.sum.set(o.sum); s.cross.set(o.cross); return s; }
}

/**
 * Minimum-variance weights from a covariance with shrinkage toward its diagonal (Σ ← (1−ρ)Σ + ρ·diag), clipped at
 * zero and renormalised (`combine.ts` drops negative members the same way — a non-negative prior is the honest one).
 */
export function minVarianceWeights(cov: Float64Array, k: number, shrink = 0.15): { w: Float64Array; effective: number } {
  const S = new Float64Array(k * k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) S[i * k + j] = i === j ? cov[i * k + j] : (1 - shrink) * cov[i * k + j];
  const inv = invSpd(nearestPd(S, k), k);
  const w = new Float64Array(k);
  if (!inv) { w.fill(1 / k); return { w, effective: k }; }
  let tot = 0;
  for (let i = 0; i < k; i++) { let s = 0; for (let j = 0; j < k; j++) s += inv[i * k + j]; w[i] = Math.max(0, s); tot += w[i]; }
  if (!(tot > 0)) { w.fill(1 / k); return { w, effective: k }; }
  let sq = 0;
  for (let i = 0; i < k; i++) { w[i] /= tot; sq += w[i] * w[i]; }
  return { w, effective: sq > 0 ? 1 / sq : k };
}

export interface MeanEntry {
  form: Form; var: string; bin: number; cls: string;
  names: string[];
  beta: number[];
  lambda: number;
  n: number; days: number;
  /** Prior used as ridge target (Σ-weights, bias) and the implied weights. */
  prior?: { bias: number; weights: Record<string, number>; effective: number; cov: number[] } | null;
  cv?: { time: CvSummary | null; region: CvSummary | null; band: CvSummary | null };
  /** `no-skill`: fitted, but the time-fold CV shows no gain over the baseline ⇒ not applied (hybrid rule, §1 of the phase document). */
  status: 'written' | 'too-short' | 'no-skill';
  jitter?: number;
  /** β per held-out month (fold without that month and its neighbours) — the scorer's out-of-sample coefficients. */
  folds?: Record<string, number[]>;
}
export interface CvSummary { mse: number; baseMse: number | null; /** 1 − MSE/MSE_base */ skill: number | null; folds: number; n: number }

const summarise = (r: CvResult | null): CvSummary | null => (r && r.heldN ? { mse: r.heldSse / r.heldN, baseMse: r.baseSse == null ? null : r.baseSse / r.heldN, skill: r.baseSse == null || !(r.baseSse > 0) ? null : 1 - r.heldSse / r.baseSse, folds: r.perFold.length, n: r.heldN } : null);

/**
 * Fit one stratum. `axes` = the Gram groups per fold axis (each axis holds every row of the stratum once — the CV of an
 * axis must only ever see that axis's groups, or the other axes leak the held-out rows into the training: measured
 * 23.09.2026 as a time-fold "skill" of 0,35 where the honest number was negative, V-FL-21); `errors` = pooled
 * ErrorStats of the class (form P) for the prior; `baseKey` = extra-sum key of the baseline (equal-weight mean of the
 * sources, or the cube member) for the skill report. Returns the entry: `too-short` below STRATUM_MIN, `no-skill` when
 * the time-fold CV shows no gain (the entry is kept for the record, `predict` ignores it).
 */
export function fitStratum(form: Form, v: string, bin: number, cls: string, axes: AxisGroups, errors: ErrorStats | null, baseKey: string, min: { n: number; days: number } = STRATUM_MIN): MeanEntry {
  const names = designNames(form, cls);
  const p = names.length;
  const all = Gram.sum(axes.month.values(), p);
  const base = { form, var: v, bin, cls, names, lambda: NaN, n: all.n, days: all.days.size, prior: null, cv: { time: null, region: null, band: null }, jitter: 0 };
  if (all.n < min.n || all.days.size < min.days) return { ...base, beta: [], status: 'too-short' };
  // the prior: Σ-weights on the ŷ_m columns, the mean bias on the intercept
  const target = new Float64Array(p);
  let prior: MeanEntry['prior'] = null;
  if (form === 'P' && errors && errors.n > 0) {
    const { bias, cov } = errors.covariance();
    const { w, effective } = minVarianceWeights(cov, errors.k);
    const srcs = sourcesOfMask(parseInt(cls.slice(1), 16));
    let b0 = 0;
    for (let i = 0; i < srcs.length; i++) { target[Z_DIM + i * P_MODS.length] = w[i]; b0 += w[i] * -bias[i]; }
    target[0] = b0;
    prior = { bias: b0, weights: Object.fromEntries(srcs.map((s, i) => [s, w[i]])), effective, cov: Array.from(cov) };
  } else if (form === 'K') {
    target[Z_DIM] = 1;   // the cube member with weight 1 and no bias is the prior
  }
  const penalty = variancePenalty(all);
  const cvTime = chooseLambda(axes.month, p, foldsOverGroups([...axes.month.keys()], 'month'), LAMBDAS, penalty, target, baseKey);
  const lambda = cvTime?.lambda ?? 1;
  const cvRegion = chooseLambda(axes.region, p, foldsOverGroups([...axes.region.keys()], 'region'), [lambda], penalty, target, baseKey);
  const cvBand = chooseLambda(axes.band, p, foldsOverGroups([...axes.band.keys()], 'band'), [lambda], penalty, target, baseKey);
  const r = ridge(all, lambda, penalty, target);
  if (!r) return { ...base, beta: [], status: 'too-short' };
  const cv = { time: summarise(cvTime), region: summarise(cvRegion), band: summarise(cvBand) };
  const skill = cv.time?.skill;
  const status: MeanEntry['status'] = skill != null && skill > 0 ? 'written' : 'no-skill';
  return { ...base, beta: Array.from(r.beta).map((x) => Math.round(x * 1e6) / 1e6), lambda, prior, jitter: r.jitter, cv, status };
}

/** μ from a design row and an entry. */
export function predictMean(x: Float64Array, beta: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * x[i];
  return s;
}
