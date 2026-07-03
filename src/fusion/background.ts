/**
 * Multi-model background construction (paper Sect. 3.2, eqs. 2 & 4).
 *
 *   (2) minimum-variance weights   w = Σ⁻¹1 / (1ᵀΣ⁻¹1)
 *   (4) reliability-shrunk bias     b̂_m(s) = n_s/(n_s+k)·ē_local + k/(n_s+k)·ē_regional
 *
 * `trainBackground` fits the `background-v1.json` artifact from an error archive
 * (constraint C3 — a directory of sessions); the client uses the precomputed
 * weights via `params.ts`. Off-diagonal Σ is opt-in (constraint C2 — default
 * OFF on a short archive). The eq-2 solver reuses the hand Cholesky from oi.ts
 * (Rule 5 — no linear-algebra dependency). Reduces to inverse-MSE for diagonal Σ.
 */

import { choleskyFactor, choleskySolve } from './oi.ts';
import { assertNoOpenMeteo, buildErrorArchive, archiveModels, type ErrorSample } from './archive.ts';
import type { Fixture, OiVariable } from './fixture.ts';
import type { BackgroundParams, TrainedWindow } from './params.ts';

const VARIABLES: OiVariable[] = ['t2m', 'windSpeed', 'precip', 'cloud'];

/** eq. (4) James–Stein reliability shrinkage of a local estimate toward a region. */
export function shrinkBias(localMean: number, localN: number, regionalMean: number, k: number): number {
  const a = localN / (localN + k);
  return a * localMean + (1 - a) * regionalMean;
}

/**
 * Minimum-variance combination weights (eq. 2) from an M×M error covariance Σ.
 * `lambda` applies the paper's shrinkage Σ ← (1−λ)Σ + λ·diag(Σ) for stability on
 * short archives. Diagonal Σ ⇒ w_m ∝ 1/σ_m² (inverse-MSE). Guards degenerate Σ
 * with jitter; falls back to equal weights if still non-SPD.
 */
export function minVarWeights(sigma: number[][], lambda = 0): number[] {
  const M = sigma.length;
  if (M === 0) return [];
  if (M === 1) return [1];
  const A = new Float64Array(M * M);
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const shrunk = i === j ? sigma[i][j] : (1 - lambda) * sigma[i][j];
      A[i * M + j] = shrunk;
    }
    A[i * M + i] += 1e-9;   // jitter
  }
  const L = new Float64Array(M * M);
  let ok = choleskyFactor(A, M, L);
  if (!ok) {
    for (let i = 0; i < M; i++) A[i * M + i] += 1e-3;
    ok = choleskyFactor(A, M, L);
  }
  if (!ok) return new Array(M).fill(1 / M);   // degenerate → equal weights
  const one = new Float64Array(M).fill(1);
  const x = new Float64Array(M);
  choleskySolve(L, M, one, x);   // x = Σ⁻¹ 1
  let s = 0;
  for (let i = 0; i < M; i++) s += x[i];
  if (!(Math.abs(s) > 1e-12)) return new Array(M).fill(1 / M);
  const w = new Array<number>(M);
  for (let i = 0; i < M; i++) w[i] = x[i] / s;
  return w;
}

const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

/**
 * Per-model bias tables (eq. 4) from the error archive: local (per-station) and
 * regional (per-terrain-class) trailing means, plus each station's sample count.
 */
function biasTables(samples: ErrorSample[], models: string[], k: number) {
  const bias: BackgroundParams['perVariable'][string]['bias'] = {};
  const stationN: Record<string, number> = {};
  for (const m of models) bias[m] = { local: {}, regional: {} };

  // Regional (per terrain) means first.
  const regionalErr: Record<string, Record<string, number[]>> = {};
  const localErr: Record<string, Record<string, number[]>> = {};
  for (const s of samples) {
    stationN[s.stationId] = (stationN[s.stationId] ?? 0) + 1;
    for (const m of models) {
      const e = s.perModel[m];
      if (e == null || e !== e) continue;
      (regionalErr[m] ??= {})[s.terrain] = [...(regionalErr[m]?.[s.terrain] ?? []), e];
      (localErr[m] ??= {})[s.stationId] = [...(localErr[m]?.[s.stationId] ?? []), e];
    }
  }
  const regionalMean: Record<string, Record<string, number>> = {};
  for (const m of models) {
    regionalMean[m] = {};
    for (const [terr, arr] of Object.entries(regionalErr[m] ?? {})) {
      regionalMean[m][terr] = mean(arr);
      bias[m].regional[terr] = { '0': regionalMean[m][terr] };
    }
  }
  // Local (per station) shrunk toward its terrain regional mean (eq. 4).
  const terrainOf: Record<string, string> = {};
  for (const s of samples) terrainOf[s.stationId] = s.terrain;
  for (const m of models) {
    for (const [sid, arr] of Object.entries(localErr[m] ?? {})) {
      const reg = regionalMean[m][terrainOf[sid]] ?? 0;
      const shrunk = shrinkBias(mean(arr), arr.length, reg, k);
      bias[m].local[sid] = { '0': shrunk };
    }
  }
  const counts = Object.values(stationN);
  counts.sort((a, b) => a - b);
  const effN = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  return { bias, effN };
}

/** M×M covariance of the bias-corrected model errors over common-support samples. */
function errorCovariance(
  samples: ErrorSample[], models: string[], offDiagonal: boolean,
  biasByModel: Record<string, Record<string, number>>,   // model → stationId → shrunk local bias
): number[][] {
  const M = models.length;
  const sig = Array.from({ length: M }, () => new Array<number>(M).fill(0));
  const cnt = Array.from({ length: M }, () => new Array<number>(M).fill(0));
  for (const s of samples) {
    for (let a = 0; a < M; a++) {
      const ea = s.perModel[models[a]];
      if (ea == null || ea !== ea) continue;
      const ra = ea - (biasByModel[models[a]]?.[s.stationId] ?? 0);
      sig[a][a] += ra * ra; cnt[a][a]++;
      if (!offDiagonal) continue;
      for (let b = a + 1; b < M; b++) {
        const eb = s.perModel[models[b]];
        if (eb == null || eb !== eb) continue;
        const rb = eb - (biasByModel[models[b]]?.[s.stationId] ?? 0);
        sig[a][b] += ra * rb; cnt[a][b]++; sig[b][a] += ra * rb; cnt[b][a]++;
      }
    }
  }
  for (let a = 0; a < M; a++) {
    for (let b = 0; b < M; b++) {
      sig[a][b] = cnt[a][b] > 0 ? sig[a][b] / cnt[a][b] : (a === b ? 1 : 0);
    }
  }
  return sig;
}

export interface TrainOptions {
  window: TrainedWindow;
  /** eq. (4) shrinkage constant k (sessions). Larger ⇒ trust the region more. */
  shrinkageK?: number;
  /** Σ shrinkage λ. */
  shrinkageLambda?: number;
  /** Use off-diagonal Σ (constraint C2 — default false on short archives). */
  offDiagonal?: boolean;
  variables?: OiVariable[];
}

/**
 * Fit `background-v1.json` from a session archive. Calls `assertNoOpenMeteo`
 * first (constraint C1) so a non-commercial sample can never enter the artifact.
 */
export function trainBackground(fixtures: Fixture[], opts: TrainOptions): BackgroundParams {
  assertNoOpenMeteo(fixtures);
  const models = archiveModels(fixtures);
  const k = opts.shrinkageK ?? 8;
  const lambda = opts.shrinkageLambda ?? 0.1;
  const offDiagonal = opts.offDiagonal ?? false;
  const variables = opts.variables ?? VARIABLES;

  const perVariable: BackgroundParams['perVariable'] = {};
  for (const v of variables) {
    const samples = buildErrorArchive(fixtures, v);
    const { bias, effN } = biasTables(samples, models, k);
    const biasByModel: Record<string, Record<string, number>> = {};
    for (const m of models) {
      biasByModel[m] = {};
      for (const [sid, rec] of Object.entries(bias[m].local)) biasByModel[m][sid] = rec['0'];
    }
    const sigma = errorCovariance(samples, models, offDiagonal, biasByModel);
    const weights = minVarWeights(sigma, lambda);
    perVariable[v] = {
      sigma: { '0': sigma },
      weights: { '0': weights },
      shrinkageLambda: lambda,
      offDiagonal,
      bias,
      shrinkageK: k,
      effectiveSampleSize: effN,
    };
  }

  return { version: 'background-1', trainedWindow: opts.window, models, perVariable };
}

/** Weighted multi-model combination at a point (eq. 2 applied). NaN-skipping +
 *  renormalising so a locally-missing member doesn't bias the blend. */
export function combineBackground(
  perModel: Record<string, number>, models: string[], weights: number[],
): number {
  let wsum = 0, vsum = 0;
  for (let m = 0; m < models.length; m++) {
    const x = perModel[models[m]];
    if (x == null || x !== x) continue;
    wsum += weights[m]; vsum += weights[m] * x;
  }
  return wsum > 0 ? vsum / wsum : NaN;
}
