/**
 * fitPrecip.ts — the precipitation hurdle of the learning stage (phase FL, `audit/fusion-lernphase.md` §3.3):
 * occurrence P(y ≥ 0,1 mm/h) as a logistic regression fitted by IRLS, one pass over the cases per iteration (the
 * script drives the passes; this module accumulates the weighted normal equations for a given β and solves the
 * step), and the amount ln(y | wet) as a least-squares regression with a lognormal residual — the parameters of the
 * engine's `hurdleLogNormal`.
 */
import { Gram, ridge } from './gram';
import { solveSpd } from './linalg';
import { O_NAMES, A_NAMES } from './design';
import { STRATUM_MIN } from './strata';
import { lcg } from '../calibFit';

const sigmoid = (t: number) => 1 / (1 + Math.exp(-t));

/** Weighted normal equations of one IRLS step for a fixed β. */
export class LogisticAcc {
  readonly p: number;
  n = 0; wet = 0;
  readonly days = new Set<number>();
  readonly xtwx: Float64Array;
  readonly xtwz: Float64Array;
  /** Log-likelihood at the current β (for the convergence report). */
  ll = 0;
  constructor(p: number) { this.p = p; this.xtwx = new Float64Array(p * p); this.xtwz = new Float64Array(p); }
  add(x: Float64Array, y: 0 | 1, beta: Float64Array | null, dayIdx: number): void {
    const p = this.p;
    let eta = 0;
    if (beta) for (let i = 0; i < p; i++) eta += beta[i] * x[i];
    const pr = Math.min(1 - 1e-6, Math.max(1e-6, sigmoid(eta)));
    const w = pr * (1 - pr);
    const z = eta + (y - pr) / w;
    for (let i = 0; i < p; i++) {
      const xi = x[i]; if (xi === 0) continue;
      this.xtwz[i] += w * xi * z;
      for (let j = i; j < p; j++) this.xtwx[i * p + j] += w * xi * x[j];
    }
    this.ll += y ? Math.log(pr) : Math.log(1 - pr);
    this.n += 1; this.wet += y; this.days.add(dayIdx);
  }
  merge(o: LogisticAcc): void { for (let i = 0; i < this.xtwx.length; i++) this.xtwx[i] += o.xtwx[i]; for (let i = 0; i < this.p; i++) this.xtwz[i] += o.xtwz[i]; this.n += o.n; this.wet += o.wet; this.ll += o.ll; for (const d of o.days) this.days.add(d); }
  /** The IRLS step: β⁺ = (XᵀWX + λI)⁻¹ XᵀWz (λ tiny, intercept unpenalised). */
  solve(lambda = 1e-3): Float64Array | null {
    const p = this.p, A = new Float64Array(p * p);
    for (let i = 0; i < p; i++) for (let j = i; j < p; j++) { A[i * p + j] = this.xtwx[i * p + j]; A[j * p + i] = this.xtwx[i * p + j]; }
    for (let j = 1; j < p; j++) A[j * p + j] += lambda * Math.max(1, this.n);
    return solveSpd(A, p, this.xtwz)?.x ?? null;
  }
  toJSON(): unknown { return { p: this.p, n: this.n, wet: this.wet, ll: this.ll, days: [...this.days], xtwx: Array.from(this.xtwx), xtwz: Array.from(this.xtwz) }; }
  static fromJSON(o: { p: number; n: number; wet: number; ll: number; days: number[]; xtwx: number[]; xtwz: number[] }): LogisticAcc {
    const a = new LogisticAcc(o.p); a.n = o.n; a.wet = o.wet; a.ll = o.ll; for (const d of o.days) a.days.add(d); a.xtwx.set(o.xtwx); a.xtwz.set(o.xtwz); return a;
  }
}

/** Starting β for IRLS: intercept = logit of the wet share, zero elsewhere. */
export function logisticStart(p: number, wetShare: number): Float64Array {
  const b = new Float64Array(p);
  const s = Math.min(1 - 1e-3, Math.max(1e-3, wetShare));
  b[0] = Math.log(s / (1 - s));
  return b;
}

/**
 * Out-of-fold evidence of the hurdle (fusionFit@3, V-FL-18): Brier(wet ≥ 0,1 mm/h) of the held-out months with the
 * fold's β against the Brier of the cube's own probability 1 − pDry_Cube on the same rows. The fold β is ONE Newton
 * step from the pooled β on the training months' normal equations (one-step estimator — the IRLS is not repeated per
 * fold); the rule is the same as the mean model's: no gain over the baseline ⇒ `no-skill`, `predict` leaves it out.
 */
export interface OccurrenceCv { brier: number; brierCube: number; /** 1 − brier/brierCube */ skill: number | null; n: number; folds: number }
export interface OccurrenceEntry {
  form: 'P' | 'K'; var: 'precip'; bin: number; cls: string;
  names: readonly string[]; beta: number[];
  n: number; days: number; wetShare: number; iterations: number; llPerRow: number;
  status: 'written' | 'too-short' | 'no-skill';
  cv?: OccurrenceCv | null;
  /** β per held-out month (one Newton step from the pooled β on the training months) — the scorer's out-of-sample coefficients. */
  folds?: Record<string, number[]>;
}
export function occurrenceEntry(form: 'P' | 'K', bin: number, cls: string, acc: LogisticAcc, beta: Float64Array | null, iterations: number, min: { n: number; days: number } = STRATUM_MIN): OccurrenceEntry {
  const base = { form, var: 'precip' as const, bin, cls, names: O_NAMES, n: acc.n, days: acc.days.size, wetShare: acc.n ? acc.wet / acc.n : 0, iterations, llPerRow: acc.n ? acc.ll / acc.n : 0 };
  if (!beta || acc.n < min.n || acc.days.size < min.days) return { ...base, beta: [], status: 'too-short' };
  return { ...base, beta: Array.from(beta).map((x) => Math.round(x * 1e6) / 1e6), status: 'written' };
}
/** Apply the CV verdict to a written entry: `no-skill` unless the out-of-fold Brier beats the cube's (no evidence = no skill, like the mean model). */
export function withOccurrenceCv(e: OccurrenceEntry, cv: OccurrenceCv | null, folds: Record<string, number[]> | null): OccurrenceEntry {
  if (e.status !== 'written') return { ...e, cv, ...(folds ? { folds } : {}) };
  const skill = cv && cv.brierCube > 0 ? 1 - cv.brier / cv.brierCube : null;
  const status: OccurrenceEntry['status'] = skill != null && skill > 0 ? 'written' : 'no-skill';
  return { ...e, cv: cv ? { ...cv, skill } : null, status, ...(folds ? { folds } : {}) };
}
/** Brier accumulator per (stratum, month) for the hurdle CV: Σ(p − y)² of the fold β and of the cube probability. */
export class BrierPair {
  n = 0; sse = 0; sseCube = 0;
  add(p: number, pCube: number, y: 0 | 1): void { this.n += 1; this.sse += (p - y) * (p - y); this.sseCube += (pCube - y) * (pCube - y); }
}

/**
 * In-memory hurdle fit (fusionFit@3, FL-AP8c — V-FL-36): the pass-based IRLS above takes a fixed number of full Newton
 * steps and DIVERGES on the real rows (measured 25.09.2026 on 2026-08 t1: β_lnP −14 → +27 → −26 → …, the in-sample
 * Brier 0,078 against 0,055 of the cube's own probability; the identity β on the cube column alone equals the cube).
 * Logistic regression needs a step control: this fit keeps a bounded, deterministic reservoir of design rows per
 * stratum and runs a damped Newton (line search on the exact log-likelihood of the reservoir) to convergence — for the
 * pooled β AND for every time fold (exact out-of-fold coefficients, no one-step approximation); the out-of-fold Brier
 * against the cube's probability is the CV verdict.
 */
export class HurdleRows {
  readonly p: number; readonly cap: number;
  n = 0;
  /** Rows offered (the whole stream) — for the report. */
  offered = 0;
  readonly xs: Float32Array; readonly ys: Uint8Array; readonly pCube: Float32Array; readonly monthIdx: Int16Array;
  readonly months: string[] = [];
  readonly days = new Set<number>();
  private readonly monthOf = new Map<string, number>();
  private readonly rnd: () => number;
  constructor(p: number, cap: number, seed = 20260925) { this.p = p; this.cap = cap; this.xs = new Float32Array(p * cap); this.ys = new Uint8Array(cap); this.pCube = new Float32Array(cap); this.monthIdx = new Int16Array(cap); this.rnd = lcg(seed); }
  /**
   * Reservoir sampling (Algorithm R, seeded LCG ⇒ deterministic for a given stream): a uniform sample of the whole stream
   * whatever its length — every month is represented in proportion. (A first version kept every k-th row up to the cap with
   * k from the pass-A counts; pass B offers about twice as many rows, the cap was hit in file order and the later months
   * were missing entirely — measured 25.09.2026: the run-route strata 7–48 h had fold β only for June and August, V-FL-40.)
   */
  add(x: Float64Array, y: 0 | 1, month: string, pDryCube: number, dayIdx: number): void {
    this.offered += 1;
    let slot: number;
    if (this.n < this.cap) slot = this.n++;
    else { const j = Math.floor(this.rnd() * this.offered); if (j >= this.cap) return; slot = j; }
    let mi = this.monthOf.get(month);
    if (mi == null) { mi = this.months.length; this.months.push(month); this.monthOf.set(month, mi); }
    this.xs.set(x, slot * this.p); this.ys[slot] = y; this.pCube[slot] = 1 - pDryCube; this.monthIdx[slot] = mi; this.days.add(dayIdx);
  }
}

/** Log-likelihood of β on a row subset (`use[i]` = row taken). */
function llOf(r: HurdleRows, use: Uint8Array, beta: Float64Array): number {
  const p = r.p; let ll = 0;
  for (let i = 0; i < r.n; i++) {
    if (!use[i]) continue;
    let eta = 0; const o = i * p;
    for (let j = 0; j < p; j++) eta += beta[j] * r.xs[o + j];
    // log σ(η) for y = 1, log(1 − σ(η)) for y = 0, numerically safe
    ll += r.ys[i] ? -Math.log1p(Math.exp(-eta)) : -Math.log1p(Math.exp(eta));
  }
  return ll;
}

/**
 * Damped Newton for the logistic regression on a row subset: full IRLS step, halved until the exact log-likelihood does
 * not fall; stops when the gain per row is below `tol` or after `maxIter` steps. Returns β, the final ll per row and
 * whether it converged. Ridge λ·n on the non-intercept columns as in `LogisticAcc.solve` (tiny, for conditioning).
 */
export function irlsDamped(r: HurdleRows, use: Uint8Array, beta0: Float64Array, opts: { maxIter?: number; tol?: number; lambda?: number } = {}): { beta: Float64Array; llPerRow: number; iterations: number; converged: boolean; n: number } {
  const p = r.p, maxIter = opts.maxIter ?? 30, tol = opts.tol ?? 1e-7, lambda = opts.lambda ?? 1e-3;
  let n = 0; for (let i = 0; i < r.n; i++) if (use[i]) n += 1;
  let beta = new Float64Array(beta0), ll = llOf(r, use, beta), it = 0, converged = false;
  const A = new Float64Array(p * p), g = new Float64Array(p), x = new Float64Array(p);
  for (; it < maxIter; it++) {
    A.fill(0); g.fill(0);
    for (let i = 0; i < r.n; i++) {
      if (!use[i]) continue;
      const o = i * p; let eta = 0;
      for (let j = 0; j < p; j++) { x[j] = r.xs[o + j]; eta += beta[j] * x[j]; }
      const pr = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(eta))), w = pr * (1 - pr), res = r.ys[i] - pr;
      for (let a = 0; a < p; a++) { const xa = x[a]; if (xa === 0) continue; g[a] += res * xa; for (let b = a; b < p; b++) A[a * p + b] += w * xa * x[b]; }
    }
    for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) A[b * p + a] = A[a * p + b];
    for (let j = 1; j < p; j++) { A[j * p + j] += lambda * Math.max(1, n); g[j] -= lambda * Math.max(1, n) * beta[j]; }
    const s = solveSpd(A, p, g);
    if (!s) break;
    // line search on the exact ll: t = 1, ½, ¼ … until it does not fall
    let t = 1, cand = new Float64Array(p), llNew = -Infinity, ok = false;
    for (let h = 0; h < 12; h++) {
      for (let j = 0; j < p; j++) cand[j] = beta[j] + t * s.x[j];
      llNew = llOf(r, use, cand);
      if (llNew >= ll - 1e-12) { ok = true; break; }
      t *= 0.5;
    }
    if (!ok) { converged = true; break; }   // no ascent direction left within 2⁻¹² — at the optimum up to rounding
    const gain = llNew - ll;
    beta = cand; ll = llNew;
    if (gain < tol * Math.max(1, n)) { converged = true; it += 1; break; }
  }
  return { beta, llPerRow: n ? ll / n : 0, iterations: it, converged, n };
}

/**
 * The hurdle of one stratum from its reservoir: pooled β (damped Newton from the wet-share start), β per time fold
 * (held month and its neighbours purged, from the pooled β), the out-of-fold Brier against the cube's probability on
 * the held rows, and the verdict (`withOccurrenceCv`).
 */
export function fitOccurrenceRows(form: 'P' | 'K', bin: number, cls: string, r: HurdleRows, folds: Array<{ held: string[]; purged: string[] }>, min: { n: number; days: number } = STRATUM_MIN): OccurrenceEntry {
  const p = r.p;
  const all = new Uint8Array(r.n).fill(1);
  let wet = 0; for (let i = 0; i < r.n; i++) wet += r.ys[i];
  const base = { form, var: 'precip' as const, bin, cls, names: O_NAMES, n: r.n, days: r.days.size, wetShare: r.n ? wet / r.n : 0, iterations: 0, llPerRow: 0 };
  if (r.n < min.n || r.days.size < min.days || wet === 0 || wet === r.n) return { ...base, beta: [], status: 'too-short' };
  const pooled = irlsDamped(r, all, logisticStart(p, wet / r.n));
  const round = (b: Float64Array) => Array.from(b).map((x) => Math.round(x * 1e6) / 1e6);
  const entry: OccurrenceEntry = { ...base, beta: round(pooled.beta), iterations: pooled.iterations, llPerRow: Math.round(pooled.llPerRow * 1e6) / 1e6, status: 'written' };
  const foldsOut: Record<string, number[]> = {};
  const bp = new BrierPair();
  let nFolds = 0;
  for (const f of folds) {
    const heldIdx = new Set(f.held.map((m) => r.months.indexOf(m)).filter((i) => i >= 0));
    const outIdx = new Set([...heldIdx, ...f.purged.map((m) => r.months.indexOf(m)).filter((i) => i >= 0)]);
    if (!heldIdx.size) continue;
    const train = new Uint8Array(r.n); let nT = 0;
    for (let i = 0; i < r.n; i++) if (!outIdx.has(r.monthIdx[i])) { train[i] = 1; nT += 1; }
    if (nT < 2 * p) continue;
    const fb = irlsDamped(r, train, pooled.beta);
    foldsOut[f.held[0]] = round(fb.beta);
    for (let i = 0; i < r.n; i++) {
      if (!heldIdx.has(r.monthIdx[i])) continue;
      let eta = 0; const o = i * p;
      for (let j = 0; j < p; j++) eta += fb.beta[j] * r.xs[o + j];
      bp.add(sigmoid(eta), r.pCube[i], r.ys[i] as 0 | 1);
    }
    nFolds += 1;
  }
  const cv: OccurrenceCv | null = bp.n ? { brier: Math.round((bp.sse / bp.n) * 1e6) / 1e6, brierCube: Math.round((bp.sseCube / bp.n) * 1e6) / 1e6, skill: null, n: bp.n, folds: nFolds } : null;
  return withOccurrenceCv(entry, cv, Object.keys(foldsOut).length ? foldsOut : null);
}
export function predictWet(x: Float64Array, beta: readonly number[]): number {
  let eta = 0;
  for (let i = 0; i < beta.length; i++) eta += beta[i] * x[i];
  return sigmoid(eta);
}

export interface AmountEntry {
  form: 'P' | 'K'; var: 'precip'; bin: number; cls: string;
  names: readonly string[]; beta: number[];
  /** σ of ln(y | wet). */
  sigma: number;
  n: number; days: number;
  status: 'written' | 'too-short';
}
export function fitAmountStratum(form: 'P' | 'K', bin: number, cls: string, g: Gram, min: { n: number; days: number } = STRATUM_MIN): AmountEntry {
  const base = { form, var: 'precip' as const, bin, cls, names: A_NAMES, n: g.n, days: g.days.size };
  if (g.n < min.n / 5 || g.days.size < min.days) return { ...base, beta: [], sigma: 0, status: 'too-short' };
  const pen = new Float64Array(g.p).fill(1); pen[0] = 0;
  const r = ridge(g, 1e-3, pen, null);
  if (!r) return { ...base, beta: [], sigma: 0, status: 'too-short' };
  const sse = g.sse(r.beta);
  return { ...base, beta: Array.from(r.beta).map((x) => Math.round(x * 1e6) / 1e6), sigma: Math.round(Math.sqrt(Math.max(1e-6, sse / g.n)) * 1e6) / 1e6, status: 'written' };
}
export function predictAmountLn(x: Float64Array, beta: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * x[i];
  return s;
}
