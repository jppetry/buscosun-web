/**
 * Continuous Ranked Probability Score (CRPS) and MAE — the proper scoring rule
 * the whole fusionV2 parameter estimation optimises (paper eqs 16, 17).
 *
 * For a Gaussian predictive law N(μ, σ²) the CRPS has the closed form (eq. 17)
 *   CRPS = σ [ z(2Φ(z) − 1) + 2φ(z) − 1/√π ],   z = (y − μ)/σ,
 * which is a strictly proper score (Gneiting & Raftery, 2007) and reduces to
 * |y − μ| (MAE) as σ → 0 — so deterministic and probabilistic products are
 * scored on one criterion. Dependency-free (Node harness + browser).
 */

const INV_SQRT_PI = 1 / Math.sqrt(Math.PI);
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
const SQRT1_2 = Math.SQRT1_2;

/** Standard normal pdf φ(z). */
export function normPdf(z: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * z * z);
}

/**
 * Error function via Abramowitz & Stegun 7.1.26 (max abs error ~1.5e-7) — good
 * enough for a verification score and avoids any numerics dependency (Rule 5).
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal cdf Φ(z). */
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z * SQRT1_2));
}

/** Mean absolute error for a single pair. */
export function mae(mu: number, y: number): number {
  return Math.abs(y - mu);
}

/**
 * Gaussian CRPS, eq. (17). `sigma` ≤ 0 (deterministic forecast) returns the MAE
 * |y − μ|, the σ→0 limit of the closed form.
 */
export function crpsGaussian(mu: number, sigma: number, y: number): number {
  if (!(sigma > 0)) return Math.abs(y - mu);
  const z = (y - mu) / sigma;
  return sigma * (z * (2 * normCdf(z) - 1) + 2 * normPdf(z) - INV_SQRT_PI);
}

/** Aggregate: mean CRPS over paired (mu, sigma, y) samples. */
export function meanCrps(
  mus: ArrayLike<number>, sigmas: ArrayLike<number> | null, ys: ArrayLike<number>,
): number {
  let sum = 0, n = 0;
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], mu = mus[i];
    if (y !== y || mu !== mu) continue;
    sum += crpsGaussian(mu, sigmas ? sigmas[i] : 0, y);
    n++;
  }
  return n ? sum / n : NaN;
}
