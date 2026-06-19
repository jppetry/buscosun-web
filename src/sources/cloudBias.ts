/**
 * MOSMIX/AROME cloud_cover bias correction toward satellite ground truth.
 *
 * Empirical observation (cross-checked vs EUMETSAT MSG IR108 + ICON-D2 native
 * cloud_cover_low/mid/high on 2026-05-24):
 *
 *   Berlin    MOSMIX 88 %   real (sat + ICON-D2)  7 %
 *   Munich    MOSMIX  0 %   real                  0 %     ← matches
 *   Hamburg   MOSMIX 24 %   real                  8 %
 *
 * The pessimistic side dominates: stations and MOSMIX cells overstate Cirrus
 * haze and thin scattered cumulus as much heavier cover than the satellite
 * picture shows. The bias is multiplicative-on-fraction, not additive, so a
 * power curve `x^k` with k > 1 corrects it: leaves 0 and 100 fixed, squashes
 * everything in between toward 0.
 *
 *   k = 1.5 gives:
 *     0  → 0
 *    20  → 9
 *    50  → 35
 *    80  → 71
 *   100  → 100
 *
 * Applied at source level (BrightSky MOSMIX, GeoSphere AROME tcc) before the
 * 55/30/15 layered split. The CloudLayer shader keeps its current settings
 * (pow 2.6, modulator 0.30+0.55*turb, alphaMax 0.85/0.62/0.42) — the source
 * correction stacks gently on top, pulling the final visual into agreement
 * with EUMETSAT MSG without further shader changes.
 *
 * The DWD-OBS feed deliberately does NOT use this — its cloud_cover is already
 * dropped from the map-layer source set (see brightSkyCurrent.ts) because the
 * synoptic readings are too lagged/noisy regardless of bias correction.
 */
export function correctCloudBias(total100: number | null | undefined): number | null {
  if (total100 == null || !Number.isFinite(total100)) return null;
  const x = Math.max(0, Math.min(100, total100)) / 100;
  return Math.pow(x, 1.5) * 100;
}
