/**
 * Uncertainty quantification (paper eq. 15) — the calibrated σ field the OI
 * yields as a by-product.
 *
 *   σ_a²(x)      = σ_b² (1 − ρ_cᵀ (HBHᵀ+R)⁻¹ ρ_c)          [analysis error]
 *   σ_fc²(x,τ)   = σ_a² e^{−2τ/T} + Σ_m w_m (x̃_m − x_b)²     [forecast error]
 *
 * `oi.ts` already returns the dimensionless analysis-error *ratio*
 * (1 − ρ_cᵀC⁻¹ρ_c) per cell; here we scale it by σ_b (from Desroziers /
 * `params.OI_PRIORS`, provisional until the archive matures) and relax it toward
 * the multi-model spread with lead time. Pure math is Node-testable; the PNG
 * encoder is browser-only (called inside the engine).
 *
 * NOTE (Rule 3): wiring a live FIFTH σ PNG changes the texture contract and is a
 * hard stop requiring explicit approval. This module is PLUMBING only — the
 * existing 4-layer output is untouched; nothing here is wired into `run()`'s
 * emitted layers yet.
 */

/** Analysis σ from the OI variance ratio (∈[0,1]) and background σ_b. */
export function analysisSigma(varRatio: number, sigmaB: number): number {
  return Math.sqrt(Math.max(0, varRatio)) * sigmaB;
}

/**
 * Multi-model spread Σ_m w_m (x̃_m − x_b)² about the combined background x_b.
 * NaN members are skipped and the weights renormalised over the present members.
 */
export function multiModelSpread2(
  perModel: Record<string, number>, models: string[], weights: number[], xb: number,
): number {
  let wsum = 0, acc = 0;
  for (let m = 0; m < models.length; m++) {
    const x = perModel[models[m]];
    if (x == null || x !== x) continue;
    const d = x - xb;
    wsum += weights[m]; acc += weights[m] * d * d;
  }
  return wsum > 0 ? acc / wsum : 0;
}

/** Forecast error variance at lead τ (hours), eq. (15). `tHours` = decorrelation
 *  time; `sigmaA2` = analysis variance at τ=0; `spread2` = multi-model spread. */
export function forecastSigma2(sigmaA2: number, tauHours: number, tHours: number, spread2: number): number {
  const relax = tHours > 0 ? Math.exp(-2 * Math.max(0, tauHours) / tHours) : (tauHours <= 0 ? 1 : 0);
  return sigmaA2 * relax + spread2;
}

/**
 * Encode a σ field to a fifth PNG (R = σ/σ_max, coverage in alpha) — matches the
 * existing encoders' layout/flip. Browser-only (uses `document`). Provided for
 * the Phase 5 layer; NOT invoked by the current output path (Rule 3).
 */
export function encodeSigmaPng(
  cols: number, rows: number, sigma: Float32Array, mask: Uint8Array, sigmaMax: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let k = 0; k < sigma.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;               // grid j=0 south → PNG y=0 north
    const idx = (y * cols + i) * 4;
    const s = Number.isFinite(sigma[k]) ? sigma[k] : 0;
    const t = sigmaMax > 0 ? s / sigmaMax : 0;
    img.data[idx] = Math.max(0, Math.min(255, Math.round(t * 255)));
    img.data[idx + 1] = 0;
    img.data[idx + 2] = 0;
    img.data[idx + 3] = mask[k];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
