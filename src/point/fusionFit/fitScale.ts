/**
 * fitScale.ts — the σ scale of stage D (phase FL, fusionFit@3, V-FL-15; `audit/fusion-lernphase.md` §11.11): after the
 * moment estimator of `fitVariance.ts`, one multiplier k per stratum chosen by CRPS minimisation on the out-of-fold
 * residuals. The moment estimator is CRPS-optimal for a normal error; for a CENSORED variable (cloud cover on
 * [0, 100]) the residual moment underestimates the latent σ — measured 24.09.2026: at σ×1 the form-K clouds put
 * 5–11 % / 16–24 % on the atoms 0/100 where the observations put 18–25 % / 31–46 %; k ≈ 1,15 (0–6 h) … 1,5
 * (126–336 h) brought the PIT edge from 0,26–0,35 to 0,17–0,24.
 *
 * Evidence per (stratum, month, k): Σ CRPS, PIT-edge count, n. The verdict is out of fold: for every time fold
 * (`timeFolds`, purge ±1 month) k* is the argmin over the TRAINING months, and the held-out month is scored at k*
 * against k = 1; the written k is the argmin over all months. Whoever calls `chooseScale` decides whether a scale
 * that does not win out of fold is written (clouds: always; T/Td/gust: only when it wins).
 */
import { timeFolds } from './strata';

/** Grid of multipliers — 1 is the moment estimator itself and always among the candidates. */
export const SCALE_GRID: readonly number[] = Object.freeze([0.8, 0.9, 1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.75, 2]);
export const SCALE_ONE = SCALE_GRID.indexOf(1);

export interface ScaleCv {
  /** The grid and the in-sample mean CRPS per grid point (all months). */
  grid: readonly number[]; crps: number[]; pitOuter: number[];
  /** Out of fold: mean CRPS of the held-out months at the fold's k* against k = 1, PIT edges likewise, rows and folds. */
  oof: { crps: number; crpsBase: number; pitOuter: number; pitOuterBase: number; n: number; folds: number } | null;
  /** k chosen on all months and whether it beats k = 1 out of fold. */
  k: number; winsOof: boolean;
}

/** Per month: Σ CRPS and PIT-edge counts per grid point, rows. */
class MonthAcc {
  n = 0;
  readonly crps = new Float64Array(SCALE_GRID.length);
  readonly outer = new Float64Array(SCALE_GRID.length);
}

export class ScaleAcc {
  readonly months = new Map<string, MonthAcc>();
  /** `crps[i]`/`outer[i]` = CRPS resp. PIT-edge indicator of the row at SCALE_GRID[i]. */
  add(month: string, crps: ArrayLike<number>, outer: ArrayLike<number>): void {
    let m = this.months.get(month); if (!m) { m = new MonthAcc(); this.months.set(month, m); }
    m.n += 1;
    for (let i = 0; i < SCALE_GRID.length; i++) { m.crps[i] += crps[i]; m.outer[i] += outer[i]; }
  }
  get n(): number { let s = 0; for (const m of this.months.values()) s += m.n; return s; }
  toJSON(): unknown { return Object.fromEntries([...this.months].map(([k, m]) => [k, { n: m.n, crps: Array.from(m.crps), outer: Array.from(m.outer) }])); }
}

const argmin = (xs: ArrayLike<number>): number => { let b = 0; for (let i = 1; i < xs.length; i++) if (xs[i] < xs[b]) b = i; return b; };

/** The verdict of a stratum's accumulator: k on all months, the out-of-fold comparison against k = 1. */
export function chooseScale(acc: ScaleAcc, minN = 1000): ScaleCv | null {
  const months = [...acc.months.keys()].sort();
  const all = new MonthAcc();
  for (const m of acc.months.values()) { all.n += m.n; for (let i = 0; i < SCALE_GRID.length; i++) { all.crps[i] += m.crps[i]; all.outer[i] += m.outer[i]; } }
  if (all.n < minN) return null;
  const iAll = argmin(all.crps);
  let oofC = 0, oofB = 0, oofO = 0, oofOB = 0, oofN = 0, folds = 0;
  for (const f of timeFolds(months)) {
    const train = new MonthAcc();
    for (const [k, m] of acc.months) { if (f.held.includes(k) || f.purged.includes(k)) continue; train.n += m.n; for (let i = 0; i < SCALE_GRID.length; i++) train.crps[i] += m.crps[i]; }
    const held = acc.months.get(f.held[0]);
    if (!held || !train.n || !held.n) continue;
    const iStar = argmin(train.crps);
    oofC += held.crps[iStar]; oofB += held.crps[SCALE_ONE]; oofO += held.outer[iStar]; oofOB += held.outer[SCALE_ONE]; oofN += held.n; folds += 1;
  }
  const oof = oofN ? { crps: oofC / oofN, crpsBase: oofB / oofN, pitOuter: oofO / oofN, pitOuterBase: oofOB / oofN, n: oofN, folds } : null;
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    grid: SCALE_GRID, crps: Array.from(all.crps).map((x) => r6(x / all.n)), pitOuter: Array.from(all.outer).map((x) => r6(x / all.n)),
    oof: oof ? { crps: r6(oof.crps), crpsBase: r6(oof.crpsBase), pitOuter: r6(oof.pitOuter), pitOuterBase: r6(oof.pitOuterBase), n: oof.n, folds: oof.folds } : null,
    k: SCALE_GRID[iAll], winsOof: !!oof && oof.crps < oof.crpsBase,
  };
}

/** PIT-edge indicator (below 0,1 or above 0,9). */
export const pitOuterOf = (pit: number): number => (pit < 0.1 || pit > 0.9 ? 1 : 0);

/**
 * The write rule of the scale (phase FX, V-FX-7 / E-FX-2): the variables in `vars` may get a scale ≠ 1 — cloud cover
 * always (its latent σ is not the residual moment), the others only where the scale wins out of fold; a variable outside
 * `vars` gets 1 written whatever the search says (the evidence `scaleCv` stays for the record). `SCALE_VARS_DEFAULT` is
 * the fusionFit@3 behaviour; Fit 5b runs with `['clct']` — a scale 0,9 at T/Td/gust is the signature of unexplained
 * heteroscedasticity (a leptokurtic residual gives k* 0,85–0,9 with 0,1–0,6 % CRPS gain and a worse PIT), not calibration.
 */
export const SCALE_VARS_DEFAULT: readonly string[] = Object.freeze(['t', 'td', 'gust', 'clct']);
export function scaleForVar(v: string, cv: Pick<ScaleCv, 'k' | 'winsOof'>, vars: readonly string[] = SCALE_VARS_DEFAULT): number {
  if (!vars.includes(v)) return 1;
  if (v === 'clct') return cv.k;
  return cv.winsOof ? cv.k : 1;
}
