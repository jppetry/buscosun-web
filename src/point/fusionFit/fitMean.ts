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
 *
 * Phase FX (C1, V-FX-5): with the station-climatology column μ_c in the design (`design.ts ClimaColumns`) and a
 * forecast-anomaly correlation ρ_f as `rhoTarget`, the target becomes the optimal linear blend — β_ȳ = ρ (form K),
 * w_m·ρ on the ŷ_m (form P), β_μc = 1 − ρ — instead of β_ȳ = 1 / w_m; without `rhoTarget` the target on the ŷ columns
 * stays as it was and μ_c gets 0. `ridgeTarget` is the ONE place that builds it (the fit script rebuilds the fold β from it).
 */
import { Gram, ridge, chooseLambda, variancePenalty, type CvResult } from './gram';
import { Z_DIM, Z_NAMES } from './features';
import { P_MODS, K_MODS, INTER_NAMES, CLIMA_NAMES, type ClimaColumns } from './design';
import { invSpd, nearestPd } from './linalg';
import { foldsOverGroups, sourcesOfMask, STRATUM_MIN, type Form } from './strata';

export const LAMBDAS: readonly number[] = Object.freeze([0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]);

/** The Gram groups of a stratum per fold axis — each axis holds ALL rows of the stratum, keyed by its own component only. */
export interface AxisGroups { month: Map<string, Gram>; region: Map<string, Gram>; band: Map<string, Gram> }
/** The modulator columns live with the design (`design.ts`); re-exported so the fit scripts keep one import. */
export { P_MODS, K_MODS } from './design';

/** Column names of the design of a stratum — the same order as `meanDesignK`/`meanDesignP` write it (`design.ts`). */
export function designNames(form: Form, cls: string, clima: ClimaColumns = 'none'): string[] {
  const names: string[] = [...Z_NAMES];
  if (form === 'P') {
    const mask = parseInt(cls.slice(1), 16);
    for (const s of sourcesOfMask(mask)) for (const m of P_MODS) names.push(`${s}${m}`);
  } else for (const m of K_MODS) names.push(`cube${m}`);
  names.push(...INTER_NAMES);
  if (clima === 'station') names.push(...CLIMA_NAMES);
  return names;
}
export const designDim = (form: Form, cls: string, clima: ClimaColumns = 'none'): number => designNames(form, cls, clima).length;

/**
 * Options of the mean fit (phase FX, C1): the climatology column of the design and the ρ_f ridge target. `rhoSelect`
 * `cv` evaluates BOTH targets — today's (β_ȳ = 1, μ_c 0) and the ρ_f one — each with its own λ from the time-fold CV,
 * and keeps the one with the lower held-out MSE per row (the one-line ridge-target probe; measured 25.09.2026: the fixed
 * ρ target cost T/Td 0,1–2,1 % at 0–48 h where the data wanted β_ȳ ≈ 1). `fixed` (default) = the target as given.
 */
export interface MeanFitOptions { clima?: ClimaColumns; rhoTarget?: number | null; rhoSelect?: 'fixed' | 'cv' }

/**
 * The ridge target β0 of a stratum (length p): form P — the Σ-weights on the ŷ_m columns (times ρ when `rhoTarget` is
 * given) and the bias on the intercept, both from `prior`; form K — ρ (or 1) on the ȳ column; with the station column,
 * 1 − ρ (or 0) on μ_c. The intercept's target is irrelevant for form K (its penalty is 0).
 */
export function ridgeTarget(form: Form, cls: string, p: number, prior: MeanEntry['prior'], opts: MeanFitOptions = {}): Float64Array {
  const target = new Float64Array(p);
  const rho = opts.rhoTarget ?? null;
  if (form === 'P' && prior) {
    const srcs = sourcesOfMask(parseInt(cls.slice(1), 16));
    srcs.forEach((s, i) => { target[Z_DIM + i * P_MODS.length] = (prior.weights[s] ?? 0) * (rho ?? 1); });
    target[0] = prior.bias;
  } else if (form === 'K') target[Z_DIM] = rho ?? 1;   // the cube member with weight 1 (or ρ) and no bias is the prior
  if (opts.clima === 'station') target[p - CLIMA_NAMES.length] = rho != null ? 1 - rho : 0;
  return target;
}

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
  /** Phase FX (C1): the design's climatology column and the ρ_f ridge target of this stratum — written only when set (evidence). */
  clima?: ClimaColumns;
  rhoTarget?: number;
  /** Phase FX (C1, `rhoSelect: 'cv'` only): the target the time-fold CV chose (1 = today's, else ρ_f) and the held-out MSE per row of both. */
  rhoTargetChosen?: number;
  rhoTargetCv?: { one: number | null; rho: number | null };
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
export function fitStratum(form: Form, v: string, bin: number, cls: string, axes: AxisGroups, errors: ErrorStats | null, baseKey: string, min: { n: number; days: number } = STRATUM_MIN, opts: MeanFitOptions = {}): MeanEntry {
  const clima = opts.clima ?? 'none';
  const names = designNames(form, cls, clima);
  const p = names.length;
  const all = Gram.sum(axes.month.values(), p);
  // the option fields are written only when set, so a default fit's entries stay byte-identical to fusionFit@3
  const base = { form, var: v, bin, cls, names, lambda: NaN, n: all.n, days: all.days.size, prior: null, cv: { time: null, region: null, band: null }, jitter: 0, ...(clima !== 'none' ? { clima } : {}), ...(opts.rhoTarget != null ? { rhoTarget: opts.rhoTarget } : {}) };
  if (all.n < min.n || all.days.size < min.days) return { ...base, beta: [], status: 'too-short' };
  // the prior: Σ-weights on the ŷ_m columns, the mean bias on the intercept
  let prior: MeanEntry['prior'] = null;
  if (form === 'P' && errors && errors.n > 0) {
    const { bias, cov } = errors.covariance();
    const { w, effective } = minVarianceWeights(cov, errors.k);
    const srcs = sourcesOfMask(parseInt(cls.slice(1), 16));
    let b0 = 0;
    for (let i = 0; i < srcs.length; i++) b0 += w[i] * -bias[i];
    prior = { bias: b0, weights: Object.fromEntries(srcs.map((s, i) => [s, w[i]])), effective, cov: Array.from(cov) };
  }
  const penalty = variancePenalty(all);
  const foldsTime = foldsOverGroups([...axes.month.keys()], 'month');
  // the ridge target — under `rhoSelect: 'cv'` both candidates (today's and ρ_f), each with its own λ, the lower held-out MSE wins (tie → today's)
  const rho = opts.rhoTarget ?? null;
  const selectCv = opts.rhoSelect === 'cv';
  const candidates = selectCv && rho != null
    ? [{ rho: null as number | null, target: ridgeTarget(form, cls, p, prior, { ...opts, rhoTarget: null }) }, { rho, target: ridgeTarget(form, cls, p, prior, opts) }]
    : [{ rho, target: ridgeTarget(form, cls, p, prior, opts) }];
  let pick = candidates[0], cvTime: CvResult | null = null, pickMse = Infinity;
  const cvByCand: Array<number | null> = [];
  for (const c of candidates) {
    const cv = chooseLambda(axes.month, p, foldsTime, LAMBDAS, penalty, c.target, baseKey);
    const mse = cv && cv.heldN ? cv.heldSse / cv.heldN : null;
    cvByCand.push(mse);
    if (mse != null && mse < pickMse) { pick = c; cvTime = cv; pickMse = mse; }
  }
  const target = pick.target;
  const lambda = cvTime?.lambda ?? 1;
  const chosen = selectCv ? { rhoTargetChosen: pick.rho ?? 1, rhoTargetCv: { one: cvByCand[0] == null ? null : Math.round(cvByCand[0] * 1e6) / 1e6, rho: candidates.length > 1 && cvByCand[1] != null ? Math.round(cvByCand[1] * 1e6) / 1e6 : null } } : {};
  const cvRegion = chooseLambda(axes.region, p, foldsOverGroups([...axes.region.keys()], 'region'), [lambda], penalty, target, baseKey);
  const cvBand = chooseLambda(axes.band, p, foldsOverGroups([...axes.band.keys()], 'band'), [lambda], penalty, target, baseKey);
  const r = ridge(all, lambda, penalty, target);
  if (!r) return { ...base, beta: [], status: 'too-short' };
  const cv = { time: summarise(cvTime), region: summarise(cvRegion), band: summarise(cvBand) };
  const skill = cv.time?.skill;
  const status: MeanEntry['status'] = skill != null && skill > 0 ? 'written' : 'no-skill';
  return { ...base, beta: Array.from(r.beta).map((x) => Math.round(x * 1e6) / 1e6), lambda, prior, jitter: r.jitter, cv, status, ...chosen };
}

/** μ from a design row and an entry. */
export function predictMean(x: Float64Array, beta: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * x[i];
  return s;
}
