/**
 * Client parameter-artifact schema + loader for fusionV2 (paper Sect. 4: the
 * client performs estimation, never learning; offline scripts ship small
 * versioned JSON). Two artifacts:
 *
 *   public/params/background-v1.json — multi-model min-variance weights (eq. 2)
 *     from Σ(τ) + per-station/regional bias tables (eq. 4) with shrinkage.
 *   public/params/oi-v1.json — Desroziers r=σ_o²/σ_b² (eq. 9) per network +
 *     the OI length scales / T_v / inflation fitted under LOSO (eq. 16).
 *
 * The loader degrades gracefully to named priors when an artifact is absent or
 * flagged short (paper Sect. 6 "archive dependence" — never fail, fall back).
 * Dependency-free; the browser `fetch` path is isolated so Node can import types.
 */

import type { OiVariable } from './fixture.ts';

export interface TrainedWindow { from: string; to: string; sessions: number }

/** background-v1.json — multi-model combination (eqs 2, 4). */
export interface BackgroundParams {
  version: string;
  trainedWindow: TrainedWindow;
  /** Ordered model member list the M×M Σ / weight vectors index into. */
  models: string[];
  perVariable: Record<string, {
    /** Σ(τ): M×M bias-corrected model error covariance per lead-hour key. */
    sigma: Record<string, number[][]>;
    /** Precomputed min-variance weights (eq. 2) per lead-hour key, length M. */
    weights: Record<string, number[]>;
    /** Σ shrinkage λ (diagonal loading) actually applied. */
    shrinkageLambda: number;
    /** Whether off-diagonal Σ terms were used (constraint C2: default false). */
    offDiagonal: boolean;
    /** Bias tables (eq. 4): per model → local per-station + regional per-terrain. */
    bias: Record<string, {
      local: Record<string, Record<string, number>>;
      regional: Record<string, Record<string, number>>;
    }>;
    /** eq. (4) reliability-shrinkage constant k. */
    shrinkageK: number;
    /** Median effective sample size behind the fit (constraint C2 diagnosis). */
    effectiveSampleSize: number;
  }>;
}

/** oi-v1.json — OI covariance parameters (eqs 8, 9, 10, 15). */
export interface OiParamsArtifact {
  version: string;
  trainedWindow: TrainedWindow;
  perVariable: Record<string, {
    lhKm: number; lvM: number; invContractLv: number;
    sigmaB: number; tvHours: number; inflation: number;
  }>;
  /** Desroziers r = σ_o²/σ_b² and σ_o per network × variable (eq. 9). */
  perNetwork: Record<string, Record<string, { sigmaO: number; r: number; n: number }>>;
}

/** Named physical priors used when an artifact is missing/short (fallback). */
export const OI_PRIORS: Record<OiVariable, { lhKm: number; lvM: number; tvHours: number; sigmaB: number }> = {
  t2m: { lhKm: 60, lvM: 500, tvHours: 4, sigmaB: 1.5 },
  windU: { lhKm: 70, lvM: 700, tvHours: 1.5, sigmaB: 1.2 },
  windV: { lhKm: 70, lvM: 700, tvHours: 1.5, sigmaB: 1.2 },
  windSpeed: { lhKm: 70, lvM: 700, tvHours: 1.5, sigmaB: 1.0 },
  precip: { lhKm: 40, lvM: 800, tvHours: 0.75, sigmaB: 0.8 },
  cloud: { lhKm: 80, lvM: 800, tvHours: 3, sigmaB: 12 },
};

/** Prior per-network obs-error variance ratio r (constraint: named prior, Rule 7). */
export const R_PRIOR_BY_NETWORK: Record<string, number> = { dwd: 0.1, tawes: 0.12, smn: 0.12 };

/**
 * Resolve min-variance model weights for a variable at a lead hour. Returns the
 * fitted weight vector (aligned to `params.models`) or null when the artifact
 * lacks that variable/lead — caller then falls back to the current hand weights.
 */
export function resolveBackgroundWeights(
  params: BackgroundParams | null, variable: OiVariable, tau: number,
): { models: string[]; weights: number[] } | null {
  const pv = params?.perVariable[variable];
  if (!pv) return null;
  const key = String(tau);
  const w = pv.weights[key] ?? pv.weights['0'];
  if (!w) return null;
  return { models: params!.models, weights: w };
}

/**
 * Bridge the fitted min-variance weights (eq. 2) to the engine's per-source
 * `SourceWeights` shape, for a given model source at a lead hour. Returns null
 * when the source/lead is absent so the caller keeps the current hand weight.
 * Relative scale is all that matters — the IDW normalises by Σw — so the eq-2
 * weights (which sum to 1 across models) map directly onto the multipliers.
 */
export function sourceWeightsFromBackground(
  params: BackgroundParams | null, source: string, tau = 0,
): { temperature?: number; wind?: number; clouds?: number; precipitation?: number } | null {
  if (!params) return null;
  const mi = params.models.indexOf(source);
  if (mi < 0) return null;
  const key = String(tau);
  const get = (v: OiVariable): number | undefined => params.perVariable[v]?.weights[key]?.[mi];
  const temperature = get('t2m'), wind = get('windSpeed'), clouds = get('cloud'), precipitation = get('precip');
  if (temperature == null && wind == null && clouds == null && precipitation == null) return null;
  return { temperature, wind, clouds, precipitation };
}

/** Fetch + parse a JSON artifact in the browser; null on any failure (fallback). */
export async function loadJsonArtifact<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
