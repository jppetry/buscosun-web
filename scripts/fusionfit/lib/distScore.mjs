/**
 * distScore.mjs — the score of ONE distribution against one observation, with the definitions of `score.mjs` (phase FX:
 * CRPS closed or as CDF integral, point value, latent spread, observable sd, randomised PIT) plus the three-quantile score
 * QS3 (phase FV, `audit/fusion-validierung.md` §2.1) — for the archive scorer, which has to score the same distributions
 * the same way as the hindcast scorer. `score.mjs` keeps its inline copy (byte-identity of the hindcast cards); verifier
 * Block 16 pins this module against the dist.ts primitives.
 *
 *   scoreDist(d, y, u, riceN) → { point, crps, pit, sigma, sd } | null
 *   qs3Of(qs, y)              → mean pinball loss ×2 at τ = 0,1 / 0,5 / 0,9 (deterministic value: = |y − x|)
 */
import { crpsOf, crpsNormal, crpsTruncatedNormal, quantileOf, meanOf } from '../../../src/pointForecast/fusion/dist.ts';
import { crpsByCdf, sdOf, pitRandomOf } from './stats.mjs';

export const QS_TAUS = Object.freeze([0.1, 0.5, 0.9]);

export function scoreDist(d, y, u, riceN = 96) {
  let point, crps, sigma;
  if (d.kind === 'rice') {
    point = meanOf(d);
    crps = crpsByCdf(d, y, 0, d.nu + 8 * d.sigma + 1, riceN);
    sigma = d.sigma;
  } else if (d.kind === 'truncatedNormal') {
    point = meanOf(d);
    crps = crpsTruncatedNormal(d.mu, d.sigma, d.lo, y);
    sigma = (quantileOf(d, 0.8413) - quantileOf(d, 0.1587)) / 2;
  } else {
    point = d.kind === 'normal' ? d.mu : quantileOf(d, 0.5);
    crps = d.kind === 'normal' ? crpsNormal(d.mu, d.sigma, y) : crpsOf(d, y, d.kind === 'hurdleLogNormal' ? riceN : 256);
    sigma = d.kind === 'normal' || d.kind === 'censoredNormal' ? d.sigma : (quantileOf(d, 0.84) - quantileOf(d, 0.16)) / 2;
  }
  if (!Number.isFinite(crps) || !Number.isFinite(point)) return null;
  return { point, crps, pit: pitRandomOf(d, y, u), sigma, sd: sdOf(d) };
}

/** Pinball ×2 averaged over the three quantiles (a proper score for the quantile set; equals |y − x| for a point value). */
export function qs3Of(qs, y) {
  let s = 0;
  for (let i = 0; i < QS_TAUS.length; i++) { const t = QS_TAUS[i], e = y - qs[i]; s += 2 * (e >= 0 ? t * e : (t - 1) * e); }
  return s / QS_TAUS.length;
}

/** The three quantiles of a distribution. */
export const quantiles3 = (d) => QS_TAUS.map((t) => quantileOf(d, t));
