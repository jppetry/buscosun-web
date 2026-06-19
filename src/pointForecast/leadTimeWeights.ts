/**
 * Lead-time-dependent source weights for the point-forecast blender.
 *
 * The weight schedule encodes meteorological hierarchy:
 *   h = 0      → live observations crush everything (real measurements > forecasts)
 *   h = 1-2    → live obs persistence + nowcast (INCA/RADOLAN) lead
 *   h = 3-6    → high-res NWP (ICON-D2/CH1/AROME) takes over
 *   h = 6-24   → high-res NWP still leads, MOSMIX gains
 *   h > 24     → MOSMIX + global (ECMWF) backbone
 *
 * Variable-specific tweaks live in `variableWeight()`:
 *   - precip benefits from radar nowcast even at h=1,2
 *   - clouds aren't carried by some station obs → fall back to MOSMIX/NWP earlier
 *   - wind from stations is 10-min instantaneous and tends to underestimate
 *     gusts, so station weights for wind drop faster with lead time than for T
 */

import type { SourceFamily } from './types';

export type Variable = 'temperature' | 'wind' | 'gust' | 'humidity' | 'snowLine' | 'precipitation' | 'clouds' | 'uvIndex';

/** Base weight × variable multiplier × lead-time decay = final weight. */
interface WeightCurve {
  /** Weight at h=0 (the "anchor"). */
  base0: number;
  /** Weight at h=24 (long range). */
  base24: number;
  /** Decay shape: 'linear' = lerp, 'sticky' = stay high until cutoff, then drop. */
  shape: 'linear' | 'sticky' | 'plateau';
  /** For 'sticky': hour at which the weight has fallen to 50 %. */
  stickyHalfLife?: number;
  /** For 'plateau': constant from h=0 up to plateauUntil, then linear to base24. */
  plateauUntil?: number;
}

const FAMILY_CURVES: Record<SourceFamily, WeightCurve> = {
  // Live station obs: huge at h=0, gradually handed off to NWP. Half-life 2.5 h
  // means weight is still ~2.0 at h=2 and ~1.1 at h=5 — enough to anchor the
  // valley-floor temperature against an NWP that resolves the grid cell with
  // averaged-mountain-and-valley topography. Previously 1.2 h, which produced
  // a visible discontinuity around h=3 at alpine points like Innsbruck.
  obs: {
    base0: 5.0,
    base24: 0.0,
    shape: 'sticky',
    stickyHalfLife: 2.5,
  },
  // INCA-class nowcast products: useful out to their model horizon (~3-4 h).
  nowcast: {
    base0: 2.0,
    base24: 0.0,
    shape: 'sticky',
    stickyHalfLife: 3.0,
  },
  // High-res NWP (ICON-D2 / ICON-CH1 / AROME): nearly flat across the forecast,
  // slight ramp at h=0 because their analysis lags ~3 h behind real time.
  highres: {
    base0: 1.2,
    base24: 1.8,
    shape: 'plateau',
    plateauUntil: 3,
  },
  // MOSMIX (DWD station forecast): less spatial detail than high-res, but
  // gets bias-corrected at synoptic stations → reliable backbone.
  mosmix: {
    base0: 0.6,
    base24: 1.6,
    shape: 'linear',
  },
  // Global ECMWF / Open-Meteo best_match: catch-all baseline, equal weight
  // across the horizon — important when high-res sources fail.
  global: {
    base0: 0.5,
    base24: 1.4,
    shape: 'linear',
  },
};

/** Variable-specific multipliers applied on top of the family curve. */
const VARIABLE_MULTIPLIER: Record<Variable, Partial<Record<SourceFamily, number>>> = {
  temperature: { obs: 1.0, nowcast: 1.0, highres: 1.0, mosmix: 1.0, global: 1.0 },
  wind: {
    // Station wind is 10-min mean → conservative; downweight slightly so that
    // gust-aware NWP doesn't get suppressed.
    obs: 0.6,
    nowcast: 0.8,
    highres: 1.1,
    mosmix: 0.9,
    global: 0.8,
  },
  precipitation: {
    // Live precip obs (gauge / disdrometer) is sparse and zero-inflated → low
    // weight outside extreme events. Nowcast (radar-extrapolated) dominates.
    obs: 0.7,
    nowcast: 1.6,
    highres: 1.2,
    mosmix: 0.8,
    global: 0.6,
  },
  clouds: {
    // BrightSky/current's cloud_cover is heuristically split into L/M/H, which
    // is noisier than NWP's native channels → downweight obs.
    obs: 0.4,
    nowcast: 0.6,    // INCA has no cloud product
    highres: 1.2,
    mosmix: 1.0,
    global: 1.0,
  },
  gust: {
    // Station gust (FFX / FX1 / fkl010d1) is a direct max-in-window measurement
    // → strong anchor. NWP gust products are calibrated guesses; downweight
    // slightly. Many sources don't carry gust at all — handled by null-skip in
    // the blender.
    obs: 1.3,
    nowcast: 0.7,    // INCA has no gust product
    highres: 1.0,
    mosmix: 0.9,
    global: 0.7,
  },
  humidity: {
    // Relative humidity is a routine station measurement; NWP humidity is
    // less accurate especially in valley inversions.
    obs: 1.2,
    nowcast: 0.7,    // INCA point variant doesn't expose rh
    highres: 1.0,
    mosmix: 0.9,
    global: 0.7,
  },
  snowLine: {
    // Schneefallgrenze ist ein Modell-Diagnose-Wert — Stations-Obs liefert sie
    // nicht; nur highres NWP (AROME). MOSMIX/global werden hier zu 0 gewichtet.
    obs: 0,
    nowcast: 0,
    highres: 1.2,
    mosmix: 0,
    global: 0,
  },
  uvIndex: {
    // UV-Index kommt ausschließlich aus der dwd_uv-Quelle (family 'mosmix').
    // Alle anderen Familien tragen keinen UV-Wert → Gewicht 0, damit der
    // Blend ausschließlich dwd_uv verwendet.
    obs: 0,
    nowcast: 0,
    highres: 0,
    mosmix: 1.0,
    global: 0,
  },
};

/**
 * Compute the blending weight for one source-family at one forecast hour
 * and one variable. Returns 0 outside the source's useful range.
 */
export function familyWeight(family: SourceFamily, hour: number, variable: Variable): number {
  const curve = FAMILY_CURVES[family];
  let base: number;

  switch (curve.shape) {
    case 'linear': {
      const t = Math.min(1, Math.max(0, hour / 24));
      base = curve.base0 * (1 - t) + curve.base24 * t;
      break;
    }
    case 'sticky': {
      // Exponential decay to base24 with the given half-life.
      const hl = curve.stickyHalfLife ?? 6;
      const decay = Math.pow(0.5, hour / hl);
      base = curve.base24 + (curve.base0 - curve.base24) * decay;
      break;
    }
    case 'plateau': {
      const plateau = curve.plateauUntil ?? 3;
      if (hour <= plateau) {
        base = curve.base0;
      } else {
        const t = Math.min(1, (hour - plateau) / Math.max(1, 24 - plateau));
        base = curve.base0 * (1 - t) + curve.base24 * t;
      }
      break;
    }
  }

  const mult = VARIABLE_MULTIPLIER[variable][family] ?? 1;
  return Math.max(0, base * mult);
}

/**
 * Convert an ad-hoc source name into a SourceFamily. The model tag follows
 * the conventions set in the source adapters (e.g. brightSkyCurrent emits
 * 'dwd_obs', GeoSphere INCA emits 'inca', Open-Meteo emits 'icon_d2', etc.).
 */
export function familyOf(source: string): SourceFamily {
  const s = source.toLowerCase();
  if (s === 'dwd_obs' || s === 'tawes' || s === 'smn' || s.endsWith('_obs')) return 'obs';
  if (s === 'inca' || s.includes('radolan') || s.includes('nowcast')) return 'nowcast';
  if (
    s === 'icon_d2' || s === 'icon_ch1' ||
    s === 'arome' || s === 'arome_at' ||
    s.startsWith('icon_d2') || s.startsWith('icon_ch')
  ) {
    return 'highres';
  }
  if (s === 'mosmix') return 'mosmix';
  return 'global';
}

/**
 * Station distance + elevation similarity weight. Stations close to the query
 * point and at similar altitude count more. d in metres, dh in metres.
 */
export function spatialWeight(distanceMeters: number, deltaElevMeters: number): number {
  const D_REF = 20_000;   // 20 km — characteristic scale
  const H_REF = 200;      // 200 m — characteristic elevation diff
  const wd = 1 / (1 + (distanceMeters / D_REF) * (distanceMeters / D_REF));
  const wh = 1 / (1 + (deltaElevMeters / H_REF) * (deltaElevMeters / H_REF));
  return wd * wh;
}
