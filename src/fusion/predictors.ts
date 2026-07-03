/**
 * Point predictors for leave-one-station-out scoring (Phase 2). Every config
 * shares ONE model background and ONE innovation set and differs only in how the
 * station observations are assimilated — so the OI-vs-IDW comparison is the
 * paper's ablation "B,R replaced by the heuristic IDW/weight-table" (Sect. 5,
 * baseline v), isolating exactly the statistical content:
 *
 *   • oiPredict         — x_b + local OI increment (eqs 3/7/8), + σ_a (eq. 15)
 *   • idwAblationPredict — x_b + inverse-distance (Barnes) weighted innovations
 *   • icond2Predict     — raw native ICON-D2 bilinear (Decision-A baseline)
 *   • backgroundPredict — x_b only (no obs), the "does assimilation help?" floor
 *
 * Pure; reuses `oi.ts`. Precip/cloud are scored in raw space here (the log/logit
 * transforms are Phase 3+); predictions are clamped to their physical bounds.
 */

import {
  buildOiKernel, applyOiKernel, DEFAULT_OI_PARAMS,
  type OiObservation, type OiParams,
} from './oi.ts';
import type { Fixture, FixtureSample, FixtureStation, OiVariable } from './fixture.ts';

const STD_LAPSE = 0.0065;

/** Per-variable IDW kernel shape, mirroring the engine's three kernels. */
function kernelShape(v: OiVariable): { power: number; radius: number; elevAware: boolean } {
  if (v === 't2m') return { power: 1.8, radius: 0.12, elevAware: true };
  if (v === 'precip') return { power: 2.0, radius: 0.12, elevAware: false };
  return { power: 1.6, radius: 0.14, elevAware: false };   // wind*, cloud
}

function clampVar(v: OiVariable, x: number): number {
  if (v === 'precip') return Math.max(0, x);
  if (v === 'cloud') return Math.max(0, Math.min(100, x));
  return x;
}

/**
 * Inverse-distance estimate of one variable at an arbitrary point from scattered
 * samples. Elevation-aware variables are reduced to MSL (v + elev·γ) before the
 * weighting and the lapse re-applied at the target elevation — the same seam the
 * engine's IDW uses.
 */
export function idwAtPoint(
  samples: FixtureSample[], tx: number, ty: number, tElev: number, v: OiVariable,
): number {
  const { power, radius, elevAware } = kernelShape(v);
  const r2 = radius * radius;
  let wsum = 0, vsum = 0;
  for (const s of samples) {
    const val = s.vals[v];
    if (val == null || val !== val) continue;
    const ddx = s.x - tx, ddy = s.y - ty;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > r2) continue;
    const reduced = elevAware ? val + s.elev * STD_LAPSE : val;
    const w = 1 / Math.pow(d2 + 1e-8, power / 2);
    wsum += w; vsum += w * reduced;
  }
  if (wsum <= 0) return NaN;
  let out = vsum / wsum;
  if (elevAware) out -= tElev * STD_LAPSE;
  return out;
}

export interface PredictCtx {
  fixture: Fixture;
  /** Observations to assimilate (the LOSO training set = all but the held-out). */
  assimObs: FixtureStation[];
  target: { x: number; y: number; elev: number };
  variable: OiVariable;
  /** Background-error stddev σ_b (from Desroziers) for OI's predictive σ_a. */
  sigmaB: number;
  /** Per-network obs-error variance ratio r = σ_o²/σ_b². */
  obsVarRatioByNetwork: Record<string, number>;
  oiParams?: OiParams;
}

export interface Prediction { mu: number; sigma: number }

/** x_b at the target (model background only). */
export function backgroundPredict(ctx: PredictCtx): Prediction {
  return { mu: idwAtPoint(ctx.fixture.background, ctx.target.x, ctx.target.y, ctx.target.elev, ctx.variable), sigma: 0 };
}

/** Raw native ICON-D2 at the target — the Decision-A per-variable baseline. */
export function icond2Predict(ctx: PredictCtx): Prediction {
  return { mu: idwAtPoint(ctx.fixture.icond2, ctx.target.x, ctx.target.y, ctx.target.elev, ctx.variable), sigma: 0 };
}

/** Assemble OiObservations + innovations d = y − H(x_b) for the assimilated set. */
function innovations(ctx: PredictCtx): { obs: OiObservation[]; innov: Float32Array } {
  const { fixture, assimObs, variable, obsVarRatioByNetwork } = ctx;
  const obs: OiObservation[] = [];
  const innov: number[] = [];
  for (const s of assimObs) {
    const y = s.truth[variable];
    if (y == null || y !== y) continue;
    const hxb = idwAtPoint(fixture.background, s.x, s.y, s.elev, variable);   // H(x_b) (eq. 7)
    if (hxb !== hxb) continue;
    obs.push({ x: s.x, y: s.y, elev: s.elev, obsVarRatio: obsVarRatioByNetwork[s.network] ?? 0.1 });
    innov.push(y - hxb);
  }
  return { obs, innov: Float32Array.from(innov) };
}

/** x_b + local OI increment (eqs 3/7/8); σ = √(varRatio)·σ_b (eq. 15). */
export function oiPredict(ctx: PredictCtx): Prediction {
  const bg = idwAtPoint(ctx.fixture.background, ctx.target.x, ctx.target.y, ctx.target.elev, ctx.variable);
  const { obs, innov } = innovations(ctx);
  if (!obs.length || bg !== bg) return { mu: clampVar(ctx.variable, bg), sigma: ctx.sigmaB };
  // 1-cell grid at the target point; OI weights are position-only so this is a
  // single tiny solve per held-out station.
  const grid = {
    cols: 1, rows: 1,
    uvBounds: [ctx.target.x, ctx.target.y, ctx.target.x, ctx.target.y] as [number, number, number, number],
    cellElev: Float32Array.from([ctx.target.elev]),
  };
  const k = buildOiKernel(obs, grid, ctx.oiParams ?? DEFAULT_OI_PARAMS);
  const inc = applyOiKernel(k, innov)[0];
  const mu = clampVar(ctx.variable, bg + (inc === inc ? inc : 0));
  const sigma = Math.sqrt(Math.max(0, k.varRatio[0])) * ctx.sigmaB;
  return { mu, sigma };
}

/** x_b + inverse-distance (Barnes) weighted innovations — the OI ablation. */
export function idwAblationPredict(ctx: PredictCtx): Prediction {
  const bg = idwAtPoint(ctx.fixture.background, ctx.target.x, ctx.target.y, ctx.target.elev, ctx.variable);
  const { obs, innov } = innovations(ctx);
  if (!obs.length || bg !== bg) return { mu: clampVar(ctx.variable, bg), sigma: 0 };
  const { power, radius } = kernelShape(ctx.variable);
  const r2 = radius * radius;
  let wsum = 0, vsum = 0;
  for (let i = 0; i < obs.length; i++) {
    const ddx = obs[i].x - ctx.target.x, ddy = obs[i].y - ctx.target.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > r2) continue;
    const w = 1 / Math.pow(d2 + 1e-8, power / 2);
    wsum += w; vsum += w * innov[i];
  }
  const inc = wsum > 0 ? vsum / wsum : 0;
  return { mu: clampVar(ctx.variable, bg + inc), sigma: 0 };
}

export type PredictorName = 'oi' | 'idw' | 'icond2' | 'background';
export const PREDICTORS: Record<PredictorName, (ctx: PredictCtx) => Prediction> = {
  oi: oiPredict,
  idw: idwAblationPredict,
  icond2: icond2Predict,
  background: backgroundPredict,
};
