/**
 * fitVariance.ts — stage D of the learning stage (phase FL, `audit/fusion-lernphase.md` §3.3), stage 1 form:
 *
 *   σ² = c₀ + c₁·σ_div² + c₂·σ_ens² + c₃·|dh| + c₄·dh² + c₅·svf + c₆·sin(h) + c₇·cos(h) + c₈·TPI2000
 *
 * fitted by least squares on the OUT-OF-FOLD squared residuals of the mean model (the residuals of the fold that
 * excludes the row's month), with c₁, c₂ clipped at zero and a floor of 10 % of the mean squared residual so no site
 * ever gets a vanishing σ. This is the moment estimator — CRPS-optimal for Gaussian errors; the scorer measures
 * PIT and spread/skill out of sample (G-FL-2), and a CRPS scale can be added on top when it says so.
 */
import { Gram, ridge } from './gram';
import { V_NAMES } from './design';
import { STRATUM_MIN } from './strata';

export interface VarianceEntry {
  form: 'P' | 'K'; var: string; bin: number; cls: string;
  names: readonly string[];
  c: number[];
  /** Floor of σ² (unit²). */
  floor: number;
  n: number; days: number;
  /** In-sample mean squared residual (what σ² reproduces on average). */
  msr: number;
  status: 'written' | 'too-short';
  /**
   * σ multiplier on top of the moment estimator, chosen per stratum by CRPS minimisation (stage D, fusionFit@3,
   * V-FL-15): the latent σ of a censored variable (cloud cover) is larger than the residual moment says. Absent or 1 =
   * the plain moment estimator. `predictSigma` applies it; the search and its out-of-fold evidence are in `fitScale.ts`.
   */
  scale?: number;
  /** Evidence of the scale search (fit document only; the client table drops it). */
  scaleCv?: import('./fitScale').ScaleCv;
}

export function fitVarianceStratum(form: 'P' | 'K', v: string, bin: number, cls: string, g: Gram, min: { n: number; days: number } = STRATUM_MIN): VarianceEntry {
  const base = { form, var: v, bin, cls, names: V_NAMES, n: g.n, days: g.days.size };
  if (g.n < min.n || g.days.size < min.days) return { ...base, c: [], floor: 0, msr: 0, status: 'too-short' };
  const msr = g.xty[0] / g.n;   // Σ r² / n (column 0 is the intercept)
  const pen = new Float64Array(g.p).fill(1); pen[0] = 0;
  const r = ridge(g, 1e-4, pen, null);
  if (!r) return { ...base, c: [], floor: 0, msr, status: 'too-short' };
  const c = Array.from(r.beta);
  c[1] = Math.max(0, c[1]); c[2] = Math.max(0, c[2]);
  return { ...base, c: c.map((x) => Math.round(x * 1e6) / 1e6), floor: Math.round(0.1 * msr * 1e6) / 1e6, msr: Math.round(msr * 1e6) / 1e6, status: 'written' };
}

/** σ from a variance design row and an entry (never below the floor), times the CRPS scale of the stratum (1 when absent). */
export function predictSigma(x: Float64Array, e: Pick<VarianceEntry, 'c' | 'floor' | 'scale'>): number {
  let s = 0;
  for (let i = 0; i < e.c.length; i++) s += e.c[i] * x[i];
  const k = e.scale != null && e.scale > 0 ? e.scale : 1;
  return k * Math.sqrt(Math.max(e.floor, s));
}
