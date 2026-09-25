/**
 * gram.ts — sufficient statistics for the linear fits of phase FL (`audit/fusion-lernphase.md` §5.6): per group
 * (stratum × fold key) the Gram matrix XᵀX, the moment Xᵀy, yᵀy, n, the distinct days, and a few extra sums for
 * baselines. Folds are sums of groups; a held-out fold's squared error of any coefficient vector follows from its
 * own Gram without touching the rows again (SSE = yᵀy − 2 βᵀXᵀy + βᵀXᵀXβ).
 *
 * Ridge with a target: minimise Σ(y − Xβ)² + λ Σ_j d_j (β_j − β0_j)²  ⇒  (XᵀX + λD) β = Xᵀy + λ D β0. `d_j` is the
 * column's variance (a scale-free penalty; the intercept gets 0), `β0` the prior (the Σ-weights of the sources, zero
 * elsewhere). Everything deterministic.
 */
import { solveSpd, dot, matVec } from './linalg';

export class Gram {
  readonly p: number;
  n = 0;
  readonly days = new Set<number>();
  readonly xtx: Float64Array;
  readonly xty: Float64Array;
  yty = 0;
  /** Extra sums (baselines): key → Σ value, e.g. squared error of a fixed predictor. */
  readonly extra: Record<string, number> = {};
  constructor(p: number) { this.p = p; this.xtx = new Float64Array(p * p); this.xty = new Float64Array(p); }
  add(x: Float64Array, y: number, dayIdx: number): void {
    const p = this.p, xtx = this.xtx, xty = this.xty;
    for (let i = 0; i < p; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      xty[i] += xi * y;
      const row = i * p;
      for (let j = i; j < p; j++) xtx[row + j] += xi * x[j];
    }
    this.yty += y * y;
    this.n += 1;
    this.days.add(dayIdx);
  }
  addExtra(key: string, v: number): void { this.extra[key] = (this.extra[key] ?? 0) + v; }
  /** Symmetrise (only the upper triangle is accumulated). */
  full(): Float64Array {
    const p = this.p, out = new Float64Array(this.xtx);
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) out[j * p + i] = out[i * p + j];
    return out;
  }
  merge(g: Gram): void {
    if (g.p !== this.p) throw new Error('gram: dimension mismatch');
    for (let i = 0; i < this.xtx.length; i++) this.xtx[i] += g.xtx[i];
    for (let i = 0; i < this.p; i++) this.xty[i] += g.xty[i];
    this.yty += g.yty; this.n += g.n;
    for (const d of g.days) this.days.add(d);
    for (const [k, v] of Object.entries(g.extra)) this.extra[k] = (this.extra[k] ?? 0) + v;
  }
  static sum(gs: Iterable<Gram>, p: number): Gram { const out = new Gram(p); for (const g of gs) out.merge(g); return out; }
  /** Column means and variances from the Gram (intercept column assumed to be column 0 with x = 1). */
  moments(): { mean: Float64Array; variance: Float64Array } {
    const p = this.p, mean = new Float64Array(p), variance = new Float64Array(p);
    if (!this.n) return { mean, variance };
    const X = this.full();
    for (let j = 0; j < p; j++) { mean[j] = X[j] / this.n; variance[j] = Math.max(0, X[j * p + j] / this.n - mean[j] * mean[j]); }
    return { mean, variance };
  }
  /** SSE of a coefficient vector on THIS Gram (held-out evaluation). */
  sse(beta: Float64Array): number {
    const X = this.full();
    return this.yty - 2 * dot(beta, this.xty) + dot(beta, matVec(X, this.p, beta));
  }
  toJSON(): unknown { return { p: this.p, n: this.n, days: [...this.days], xtx: Array.from(this.xtx), xty: Array.from(this.xty), yty: this.yty, extra: this.extra }; }
  static fromJSON(o: { p: number; n: number; days: number[]; xtx: number[]; xty: number[]; yty: number; extra?: Record<string, number> }): Gram {
    const g = new Gram(o.p); g.n = o.n; for (const d of o.days) g.days.add(d); g.xtx.set(o.xtx); g.xty.set(o.xty); g.yty = o.yty; Object.assign(g.extra, o.extra ?? {}); return g;
  }
}

export interface RidgeResult { beta: Float64Array; jitter: number; lambda: number }

/**
 * Ridge with a target on a (summed) Gram. `penalty[j]` = d_j (0 for unpenalised columns), `target` = β0 (0 when null).
 * λ is in units of "rows": the effective penalty is λ·n·d_j so the same λ means the same shrinkage at any n.
 */
export function ridge(g: Gram, lambda: number, penalty: Float64Array, target: Float64Array | null): RidgeResult | null {
  const p = g.p;
  const A = g.full();
  const b = new Float64Array(g.xty);
  const scale = lambda * Math.max(1, g.n);
  for (let j = 0; j < p; j++) {
    A[j * p + j] += scale * penalty[j];
    if (target) b[j] += scale * penalty[j] * target[j];
  }
  const s = solveSpd(A, p, b);
  return s ? { beta: s.x, jitter: s.jitter, lambda } : null;
}

/** Default penalty: the column variance of the pooled Gram, intercept (column 0) unpenalised. */
export function variancePenalty(g: Gram): Float64Array {
  const { variance } = g.moments();
  const pen = new Float64Array(g.p);
  for (let j = 1; j < g.p; j++) pen[j] = variance[j] > 0 ? variance[j] : 1;
  return pen;
}

export interface FoldSpec { name: string; /** group keys held out */ held: string[]; /** group keys excluded from training but not scored (purge) */ purged?: string[] }

export interface CvResult { lambda: number; heldSse: number; heldN: number; baseSse: number | null; perFold: Array<{ name: string; n: number; sse: number; base: number | null }> }

/**
 * Choose λ by cross-validation over `folds`: for each λ, fit on all groups minus (held ∪ purged), score on held.
 * `baseKey` names an extra sum (squared error of a fixed baseline) for the skill report.
 */
export function chooseLambda(groups: Map<string, Gram>, p: number, folds: readonly FoldSpec[], lambdas: readonly number[], penalty: Float64Array, target: Float64Array | null, baseKey: string | null): CvResult | null {
  let best: CvResult | null = null;
  for (const lambda of lambdas) {
    let heldSse = 0, heldN = 0, baseSse = 0, baseAny = false;
    const perFold: CvResult['perFold'] = [];
    for (const f of folds) {
      const out = new Set([...f.held, ...(f.purged ?? [])]);
      const train = new Gram(p), test = new Gram(p);
      for (const [k, g] of groups) { if (f.held.includes(k)) test.merge(g); else if (!out.has(k)) train.merge(g); }
      if (!test.n || train.n < 2 * p) continue;
      const r = ridge(train, lambda, penalty, target);
      if (!r) continue;
      const sse = test.sse(r.beta);
      if (!Number.isFinite(sse)) continue;
      heldSse += sse; heldN += test.n;
      const base = baseKey != null && test.extra[baseKey] != null ? test.extra[baseKey] : null;
      if (base != null) { baseSse += base; baseAny = true; }
      perFold.push({ name: f.name, n: test.n, sse, base });
    }
    if (!heldN) continue;
    const res: CvResult = { lambda, heldSse, heldN, baseSse: baseAny ? baseSse : null, perFold };
    if (!best || res.heldSse / res.heldN < best.heldSse / best.heldN) best = res;
  }
  return best;
}
