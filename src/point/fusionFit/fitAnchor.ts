/**
 * fitAnchor.ts — stage F of the learning stage (phase FL, `audit/fusion-lernphase.md` §3.5): how long an
 * innovation at the first forecast hour persists in the error of the same product at lead τ, per variable:
 * ρ_anchor(τ) = corr(e₁, e_τ) over (point, slot) pairs. The engine's anchor (`anchor.ts`) decays with exp(−τ/τ_v),
 * τ_v set to 4 h (T) and 2 h (wind); the fitted curve gives the measured τ_v (the lag where ρ falls below 1/e) and
 * the weight ρ·σ_τ/σ₁ per lead.
 */
export const ANCHOR_VARS = Object.freeze(['t', 'td', 'u', 'v', 'gust'] as const);
export type AnchorVar = (typeof ANCHOR_VARS)[number];
export const ANCHOR_MAX_LEAD_H = 48;

export class AnchorAcc {
  readonly cross: Float64Array; readonly s1: Float64Array; readonly sT: Float64Array; readonly n: Float64Array;
  constructor() { const L = ANCHOR_MAX_LEAD_H + 1; this.cross = new Float64Array(L); this.s1 = new Float64Array(L); this.sT = new Float64Array(L); this.n = new Float64Array(L); }
  /** `e1` = error at lead 1 of this (point, slot), `eT` = error at lead `leadH`. */
  add(leadH: number, e1: number, eT: number): void {
    if (!(leadH >= 1 && leadH <= ANCHOR_MAX_LEAD_H) || !Number.isFinite(e1) || !Number.isFinite(eT)) return;
    this.cross[leadH] += e1 * eT; this.s1[leadH] += e1 * e1; this.sT[leadH] += eT * eT; this.n[leadH] += 1;
  }
  merge(o: AnchorAcc): void { for (let i = 0; i < this.n.length; i++) { this.cross[i] += o.cross[i]; this.s1[i] += o.s1[i]; this.sT[i] += o.sT[i]; this.n[i] += o.n[i]; } }
  curve(): Array<{ leadH: number; rho: number | null; weight: number | null; n: number }> {
    const out: Array<{ leadH: number; rho: number | null; weight: number | null; n: number }> = [];
    for (let L = 1; L <= ANCHOR_MAX_LEAD_H; L++) {
      const n = this.n[L];
      if (n < 200 || !(this.s1[L] > 0) || !(this.sT[L] > 0)) { out.push({ leadH: L, rho: null, weight: null, n }); continue; }
      const rho = this.cross[L] / Math.sqrt(this.s1[L] * this.sT[L]);
      // the optimal linear weight of e₁ for predicting e_τ: cov/var(e₁)
      const weight = this.cross[L] / this.s1[L];
      out.push({ leadH: L, rho: Math.round(rho * 1e4) / 1e4, weight: Math.round(weight * 1e4) / 1e4, n });
    }
    return out;
  }
  /** Measured decay time: the first lead where ρ < 1/e (null when it never falls). */
  static tauOf(curve: ReturnType<AnchorAcc['curve']>): number | null {
    for (const c of curve) if (c.rho != null && c.rho < Math.exp(-1)) return c.leadH;
    return null;
  }
  toJSON(): unknown { return { cross: Array.from(this.cross), s1: Array.from(this.s1), sT: Array.from(this.sT), n: Array.from(this.n) }; }
}
