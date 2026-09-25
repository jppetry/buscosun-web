/**
 * fitClima.ts — stage E of the learning stage (phase FL, `audit/fusion-lernphase.md` §3.4; V-PV-18): an HOURLY
 * climatology per point from the hindcast truth — annual cycle (K = 2), diurnal cycle (J = 2) with annually varying
 * amplitude — for μ_c and, on the squared anomalies, for σ_c; and the lag autocorrelation ρ(τ) of the anomalies per
 * (variable, height band). Pure accumulators; `scripts/fusionfit/fit-clima.mjs` streams the truth day files twice
 * (mean, then variance and lags).
 */
import { Gram, ridge } from './gram';
import { solarHour, dayOfYear } from './features';

export const C_NAMES = Object.freeze(['1', 'dS1', 'dC1', 'dS2', 'dC2', 'hS1', 'hC1', 'hS2', 'hC2', 'hS1dS1', 'hS1dC1', 'hC1dS1', 'hC1dC1'] as const);
export const C_DIM = C_NAMES.length;
export const CLIMA_VARS = Object.freeze(['t', 'td', 'u', 'v', 'gust', 'clct', 'precip'] as const);
export type ClimaVar = (typeof CLIMA_VARS)[number];
/** Lags (h) of ρ(τ): the centres of the six bins plus the short end. */
export const RHO_LAGS_H = Object.freeze([1, 2, 3, 6, 12, 24, 36, 48, 72, 96, 120, 168, 240, 336]);

export function climaDesign(validAtMs: number, lonDeg: number, out: Float64Array = new Float64Array(C_DIM)): Float64Array {
  const th = (2 * Math.PI * solarHour(validAtMs, lonDeg)) / 24, td = (2 * Math.PI * dayOfYear(validAtMs)) / 365.25;
  const dS1 = Math.sin(td), dC1 = Math.cos(td), hS1 = Math.sin(th), hC1 = Math.cos(th);
  out[0] = 1; out[1] = dS1; out[2] = dC1; out[3] = Math.sin(2 * td); out[4] = Math.cos(2 * td);
  out[5] = hS1; out[6] = hC1; out[7] = Math.sin(2 * th); out[8] = Math.cos(2 * th);
  out[9] = hS1 * dS1; out[10] = hS1 * dC1; out[11] = hC1 * dS1; out[12] = hC1 * dC1;
  return out;
}

export interface ClimaEntry {
  /** μ_c coefficients (C_NAMES order) and σ_c² coefficients on the same design (floored). */
  mu: number[]; var: number[]; varFloor: number;
  n: number; days: number;
  status: 'written' | 'too-short';
}
export const CLIMA_MIN = Object.freeze({ n: 24 * 300, days: 300 });

export function fitClimaMean(g: Gram): { beta: Float64Array | null; entry: Omit<ClimaEntry, 'var' | 'varFloor'> } {
  if (g.n < CLIMA_MIN.n || g.days.size < CLIMA_MIN.days) return { beta: null, entry: { mu: [], n: g.n, days: g.days.size, status: 'too-short' } };
  const pen = new Float64Array(g.p).fill(1); pen[0] = 0;
  const r = ridge(g, 1e-4, pen, null);
  if (!r) return { beta: null, entry: { mu: [], n: g.n, days: g.days.size, status: 'too-short' } };
  return { beta: r.beta, entry: { mu: Array.from(r.beta).map((x) => Math.round(x * 1e5) / 1e5), n: g.n, days: g.days.size, status: 'written' } };
}
export function fitClimaVariance(g: Gram): { var: number[]; varFloor: number } {
  const msr = g.n ? g.xty[0] / g.n : 0;
  const pen = new Float64Array(g.p).fill(1); pen[0] = 0;
  const r = g.n ? ridge(g, 1e-2, pen, null) : null;
  return { var: r ? Array.from(r.beta).map((x) => Math.round(x * 1e5) / 1e5) : [msr], varFloor: Math.round(0.25 * msr * 1e5) / 1e5 };
}
export function climaAt(e: Pick<ClimaEntry, 'mu' | 'var' | 'varFloor'>, x: Float64Array): { mu: number; sigma: number } {
  let mu = 0, v = 0;
  for (let i = 0; i < e.mu.length; i++) mu += e.mu[i] * x[i];
  if (e.var.length === 1) v = e.var[0]; else for (let i = 0; i < e.var.length; i++) v += e.var[i] * x[i];
  return { mu, sigma: Math.sqrt(Math.max(e.varFloor, v, 1e-6)) };
}

/** Lag autocorrelation accumulator: Σ a_t a_{t−τ}, Σ a_t², n per lag. */
export class LagAcc {
  readonly lags: readonly number[];
  readonly cross: Float64Array; readonly sq: Float64Array; readonly n: Float64Array;
  constructor(lags: readonly number[] = RHO_LAGS_H) { this.lags = lags; this.cross = new Float64Array(lags.length); this.sq = new Float64Array(lags.length); this.n = new Float64Array(lags.length); }
  /** `history[k]` = anomaly k hours ago (NaN = missing); `a` = the current anomaly. */
  add(a: number, history: (lag: number) => number): void {
    if (!Number.isFinite(a)) return;
    for (let i = 0; i < this.lags.length; i++) { const b = history(this.lags[i]); if (!Number.isFinite(b)) continue; this.cross[i] += a * b; this.sq[i] += 0.5 * (a * a + b * b); this.n[i] += 1; }
  }
  merge(o: LagAcc): void { for (let i = 0; i < this.lags.length; i++) { this.cross[i] += o.cross[i]; this.sq[i] += o.sq[i]; this.n[i] += o.n[i]; } }
  rho(): Array<{ lagH: number; rho: number | null; n: number }> { return this.lags.map((lagH, i) => ({ lagH, rho: this.n[i] > 100 && this.sq[i] > 0 ? Math.round((this.cross[i] / this.sq[i]) * 1e4) / 1e4 : null, n: this.n[i] })); }
  toJSON(): unknown { return { lags: this.lags, cross: Array.from(this.cross), sq: Array.from(this.sq), n: Array.from(this.n) }; }
}

/** A ring of the last `size` hourly anomalies of one series (for LagAcc.add's history). */
export class AnomalyRing {
  readonly size: number; readonly buf: Float64Array; private lastHour = NaN;
  constructor(size = 337) { this.size = size; this.buf = new Float64Array(size).fill(NaN); }
  /** Push the anomaly of hour index `h` (integer hours since epoch); gaps are filled with NaN. */
  push(h: number, a: number): void {
    if (Number.isFinite(this.lastHour)) { const gap = h - this.lastHour; if (gap <= 0 || gap > this.size) this.buf.fill(NaN); else for (let k = 1; k < gap; k++) this.buf[(h - k) % this.size] = NaN; }
    else this.buf.fill(NaN);
    this.buf[((h % this.size) + this.size) % this.size] = a; this.lastHour = h;
  }
  at(h: number, lag: number): number { if (!Number.isFinite(this.lastHour) || lag >= this.size || h - lag > this.lastHour) return NaN; return this.buf[(((h - lag) % this.size) + this.size) % this.size]; }
}
