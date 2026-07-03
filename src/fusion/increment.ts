/**
 * Temporal propagation of the analysis increment (paper eq. 10) and the
 * speed-preserving wind rescale (eq. 14). Pure, dependency-free.
 *
 *   (10) v̂(x,τ) = x_b(τ) + f + [x_a(0) − x_b(0)] · e^{−τ/T_v}
 *   (14) u* = u_a · min(s_a/‖u_a‖, c_max),  c_max = 4
 *
 * Observations exist only at t₀, but model error is temporally correlated, so
 * the h=0 analysis increment carries predictive information forward, decaying on
 * the variable's error de-correlation time T_v (temperature 3–6 h, wind 1–2 h).
 * T_v is fitted by the harness from innovation autocorrelation; until the archive
 * matures, the named priors in `params.OI_PRIORS` are used (clearly provisional).
 */

/**
 * Exponential increment-persistence weight for lead τ hours, eq. (10). τ=0 → 1
 * (pure analysis); τ ≫ T_v → 0 (pure model background). `tvHours` > 0.
 */
export function persistenceFactor(tauHours: number, tvHours: number): number {
  if (!(tvHours > 0)) return tauHours <= 0 ? 1 : 0;
  return Math.exp(-Math.max(0, tauHours) / tvHours);
}

/**
 * Speed-preserving wind rescale, eq. (14). Componentwise smoothing/analysis of
 * (u,v) under directional variability shrinks the vector amplitude; the analysed
 * scalar speed `sa` is restored by rescaling the vector, capped at `cMax` (where
 * cancellation is extreme the direction itself is unreliable). Returns [u*,v*].
 */
export function rescaleWindToSpeed(u: number, v: number, sa: number, cMax = 4): [number, number] {
  const mag = Math.hypot(u, v);
  if (mag > 1e-2 && sa === sa) {
    const f = Math.min(sa / mag, cMax);
    return [u * f, v * f];
  }
  return [u, v];
}

/**
 * Apply eq. (10) in place: given the h=0 increment field `inc0` and a per-hour
 * background field `bg`, add the decayed increment for lead `tauHours`. NaN
 * entries in either are skipped (coverage preserved).
 */
export function addPersistedIncrement(
  bg: Float32Array, inc0: Float32Array, tauHours: number, tvHours: number,
): void {
  const factor = persistenceFactor(tauHours, tvHours);
  if (factor === 0) return;
  for (let c = 0; c < bg.length; c++) {
    const d = inc0[c];
    if (d === d) bg[c] += d * factor;   // NaN-skip
  }
}
