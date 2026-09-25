/**
 * design.ts — the design rows of every linear model of the learning stage (phase FL). ONE definition for the fit and
 * for `predict.ts`: whoever changes a column here changes the tables' meaning, and `FIT_VERSION` in `tables.ts`
 * must move with it.
 */
import { Z_DIM, Z_INDEX } from './features';

/** Per-source modulators of form P (columns after ŷ_m) and of form K (after ȳ). */
export const P_MODS = Object.freeze(['', '·dh', '·dTsfc'] as const);
export const K_MODS = Object.freeze(['', '·dh', '·dTsfc', '·srcCount'] as const);

/**
 * Site × diurnal/annual interaction columns of the mean design (V-FL-26, `audit/fusion-lernphase.md` §11.8): each is the
 * product of two Z entries — a site feature (or the decoupling proxy) with the first diurnal harmonic (hCos1/hSin1) or
 * the first annual harmonic (dCos1), plus dTsfc·tpi500. Measured out of fold on the case files before they were
 * added: temperature RMSE 0–6 h −7 %, 7–120 h −3…−4 %; the other variables ±0…−2 %. They sit AFTER the ȳ/ŷ_m columns
 * in both forms so the source-column offsets (`Z_DIM + i·P_MODS.length`, `Z_DIM`) that `fitStratum` builds its ridge
 * target from stay where they are.
 */
export const INTER_NAMES = Object.freeze([
  'sink·hCos1', 'sink·hSin1', 'tpi500·hCos1', 'tpi500·hSin1', 'svf·hCos1', 'dh·hCos1', 'lcForest·hCos1', 'lcUrban·hCos1',
  'imperv·hCos1', 'absDh·hCos1', 'dTsfc·hCos1', 'dTsfc·tpi500', 'sink·dCos1', 'dh·dCos1',
] as const);
const INTER_PAIRS: ReadonlyArray<readonly [number, number]> = Object.freeze(INTER_NAMES.map((n) => {
  const [a, b] = n.split('·');
  return [Z_INDEX[a as keyof typeof Z_INDEX], Z_INDEX[b as keyof typeof Z_INDEX]] as const;
}));
/** Write the 14 interaction columns of `INTER_NAMES` (in that order) into `out` starting at `offset`; returns `out`. */
export function interactionDesign(z: Float64Array, out: Float64Array, offset: number): Float64Array {
  for (let i = 0; i < INTER_PAIRS.length; i++) { const [a, b] = INTER_PAIRS[i]; out[offset + i] = z[a] * z[b]; }
  return out;
}

/** Form K mean design: [Z, ȳ, ȳ·dh, ȳ·dTsfc, ȳ·srcCount/5, then the 14 interactions of `INTER_NAMES`]. */
export function meanDesignK(z: Float64Array, yA: number, dhM: number, dTsfcK: number | null, srcCount: number | null): Float64Array {
  const x = new Float64Array(Z_DIM + K_MODS.length + INTER_NAMES.length);
  x.set(z);
  x[Z_DIM] = yA; x[Z_DIM + 1] = yA * (dhM / 1000); x[Z_DIM + 2] = yA * (dTsfcK ?? 0); x[Z_DIM + 3] = yA * ((srcCount ?? 0) / 5);
  return interactionDesign(z, x, Z_DIM + K_MODS.length);
}
/** Form P mean design: [Z, then per source (in class order) ŷ_m, ŷ_m·dh_m, ŷ_m·dTsfc, then the 14 interactions of `INTER_NAMES`]. */
export function meanDesignP(z: Float64Array, sources: ReadonlyArray<{ yA: number; dhM: number }>, dTsfcK: number | null): Float64Array {
  const x = new Float64Array(Z_DIM + sources.length * P_MODS.length + INTER_NAMES.length);
  x.set(z);
  for (let i = 0; i < sources.length; i++) {
    const o = Z_DIM + i * P_MODS.length, s = sources[i];
    x[o] = s.yA; x[o + 1] = s.yA * (s.dhM / 1000); x[o + 2] = s.yA * (dTsfcK ?? 0);
  }
  return interactionDesign(z, x, Z_DIM + sources.length * P_MODS.length);
}

/** Variance design: σ² ≈ c·[1, σ_div², σ_ens², |dh|, dh², svf, hSin1, hCos1, tpi2000]. */
export const V_NAMES = Object.freeze(['1', 'sigDiv2', 'sigEns2', 'absDh', 'dh2', 'svf', 'hSin1', 'hCos1', 'tpi2000'] as const);
export function varianceDesign(z: Float64Array, sigDiv: number | null, sigEns: number | null): Float64Array {
  const x = new Float64Array(V_NAMES.length);
  x[0] = 1; x[1] = sigDiv != null ? sigDiv * sigDiv : 0; x[2] = sigEns != null ? sigEns * sigEns : 0;
  x[3] = z[Z_INDEX.absDh]; x[4] = z[Z_INDEX.dh] * z[Z_INDEX.dh]; x[5] = z[Z_INDEX.svf]; x[6] = z[Z_INDEX.hSin1]; x[7] = z[Z_INDEX.hCos1]; x[8] = z[Z_INDEX.tpi2000];
  return x;
}

/**
 * Precipitation occurrence design: [1, ln1p P̄, wetShare, ln1p σ_div, tpi2000, dSin1, dCos1, hSin1, hCos1, leadFrac,
 * logit(1 − pDry_Cube)]. The last column (fusionFit@3, V-FL-18) is the engine's own hurdle probability at the cube
 * member — the learned hurdle can then only add to it (β ≈ 1 on that column reproduces the cube; measured 24.09.2026:
 * without it the learned hurdle lost 0,011 Brier at 7–24 h in the run route). Without a cube probability there is no
 * design row: the caller leaves the hurdle out and says so.
 */
export const O_NAMES = Object.freeze(['1', 'lnP', 'wetShare', 'lnSigDiv', 'tpi2000', 'dSin1', 'dCos1', 'hSin1', 'hCos1', 'leadFrac', 'logitWetCube'] as const);
/** logit of the cube's wet probability, clipped to [1e-3, 1 − 1e-3] (the engine never emits exact 0/1 anyway). */
export function logitWetCube(pDryCube: number): number {
  const w = Math.min(1 - 1e-3, Math.max(1e-3, 1 - pDryCube));
  return Math.log(w / (1 - w));
}
export function occurrenceDesign(z: Float64Array, pMean: number, wetShare: number, sigDiv: number | null, pDryCube: number): Float64Array {
  const x = new Float64Array(O_NAMES.length);
  x[0] = 1; x[1] = Math.log1p(Math.max(0, pMean)); x[2] = wetShare; x[3] = Math.log1p(Math.max(0, sigDiv ?? 0));
  x[4] = z[Z_INDEX.tpi2000]; x[5] = z[Z_INDEX.dSin1]; x[6] = z[Z_INDEX.dCos1]; x[7] = z[Z_INDEX.hSin1]; x[8] = z[Z_INDEX.hCos1]; x[9] = z[Z_INDEX.leadFrac];
  x[10] = logitWetCube(pDryCube);
  return x;
}
/** Precipitation amount design (ln mm/h | wet): [1, ln1p P̄, ln1p σ_div, tpi2000, slope, lcForest]. */
export const A_NAMES = Object.freeze(['1', 'lnP', 'lnSigDiv', 'tpi2000', 'slope', 'lcForest'] as const);
export function amountDesign(z: Float64Array, pMean: number, sigDiv: number | null): Float64Array {
  const x = new Float64Array(A_NAMES.length);
  x[0] = 1; x[1] = Math.log1p(Math.max(0, pMean)); x[2] = Math.log1p(Math.max(0, sigDiv ?? 0)); x[3] = z[Z_INDEX.tpi2000]; x[4] = z[Z_INDEX.slope]; x[5] = z[Z_INDEX.lcForest];
  return x;
}
/** Wet threshold of the truth and of a source (mm/h). */
export const WET_MM_H = 0.1;
