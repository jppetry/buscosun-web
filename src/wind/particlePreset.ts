/**
 * Wind particle rendering presets (Phase WP1 — windy.com-style segments).
 *
 * Every number that shapes the SEGMENT particle look lives here, so the style
 * can be re-tuned in one place (and at runtime via the dev handle
 * `__map.style._layers.wind.implementation.segPreset`). The values are the
 * re-specified windy.com reference measured in `audit/windpartikel-windy-paritaet.md`
 * — see §2 there for how each one was obtained.
 *
 * Zoom convention: all zoom-indexed tables use the WINDY zoom scale, which is
 * MapLibre zoom + 1 (windy's URL z6 ≙ our getZoom() 5). WindLayer converts.
 *
 * The legacy 'points' style ignores everything in this file — it keeps its
 * original constructor options untouched (Rule-2 fallback).
 */

export type WindParticleStyle = 'points' | 'segments';

export interface SegmentPreset {
  /** Particle count = cssArea / (divisor · zoomBase^(zWindy − refZoom)),
   *  clamped to [min, max]. Windy: 50 · 1.6^(z−2), cap 15 000 → the overview is
   *  a dense filament field, the detail view nearly empty (÷1.6 per zoom step).
   *  Mobile deliberately NOT halved (windy does ×0.5) — buscosun keeps the
   *  CSS-area parity principle; the FrameGovernor is the mobile lever. */
  density: {
    divisor: number;
    zoomBase: number;
    refZoom: number;
    min: number;
    max: number;
  };
  /** Screen speed = pxPerSec · zoom2speed[zWindy] · (dispSpeed/refMs), where
   *  dispSpeed = max(minMs, (|v|/refMs)^gamma · refMs) — windy's sublinear
   *  |v|^0.7 display curve anchored at 30 m/s, ~constant screen tempo across
   *  zoom (zoom2speed tapers only towards the world view). headFrames = length
   *  of the drawn head segment in 60-fps travel frames (1 ≙ windy; the tail is
   *  advected backwards from the head in the vertex shader). */
  speed: {
    pxPerSec: number;
    zoom2speed: number[];
    gamma: number;
    refMs: number;
    minMs: number;
    headFrames: number;
  };
  /** Stroke width in px = max(1, lineWidth[zWindy] · scale) (× DPR at draw
   *  time). aaEdgePx = soft across-track falloff per side; lengthExPx = small
   *  along-track extension so near-stationary particles still rasterize. */
  width: {
    lineWidth: number[];
    scale: number;
    aaEdgePx: number;
    lengthExPx: number;
  };
  /** Per-frame trail fade at 60 fps (dt-normalized in WindLayer). Windy: 0.94
   *  desktop; "Intensiv" maps to the longer-tail variant. */
  trail: {
    fadeOpacity: number;
    fadeOpacityIntensive: number;
  };
  /** Global layer fade-in after a zoomend restart (alpha/second). Windy ramps
   *  alpha += dt·1.8 → ~0.55 s to full — masks the density/tempo re-init. */
  transition: {
    fadeInPerSec: number;
  };
  /** Hard particle cap for the segment style: 4 verts/particle under Uint16
   *  indices allows ≤ 16 383 particles; preset density.max stays below. */
  maxParticles: number;
}

/** The windy.com-parity segment preset (measured reference, audit §2). */
export const SEGMENT_PRESET: SegmentPreset = {
  density: { divisor: 50, zoomBase: 1.6, refZoom: 2, min: 400, max: 15000 },
  speed: {
    pxPerSec: 100,
    // Index = windy zoom (maplibre + 1); ≥ z7 the screen tempo is constant.
    zoom2speed: [0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    gamma: 0.7,
    refMs: 30,
    minMs: 1.5,
    headFrames: 1,
  },
  width: {
    // Index = windy zoom: thin filaments on the overview, bold strokes zoomed in.
    lineWidth: [0.6, 0.6, 0.6, 1, 1.2, 1.6, 1.8, 2, 2.2, 2.4, 2.4, 2.4, 2.4, 2.6, 2.8, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    scale: 1.3,
    aaEdgePx: 1.0,
    lengthExPx: 0.4,
  },
  trail: { fadeOpacity: 0.94, fadeOpacityIntensive: 0.965 },
  transition: { fadeInPerSec: 1.8 },
  maxParticles: 16000,
};

/** Per-layer deep copy (the instance is runtime-tunable; never mutate the
 *  module constant). Section-level overrides for tests/variants. */
export function makeSegmentPreset(overrides?: Partial<SegmentPreset>): SegmentPreset {
  const base = SEGMENT_PRESET;
  return {
    density: { ...base.density, ...overrides?.density },
    speed: {
      ...base.speed,
      ...overrides?.speed,
      zoom2speed: [...(overrides?.speed?.zoom2speed ?? base.speed.zoom2speed)],
    },
    width: {
      ...base.width,
      ...overrides?.width,
      lineWidth: [...(overrides?.width?.lineWidth ?? base.width.lineWidth)],
    },
    trail: { ...base.trail, ...overrides?.trail },
    transition: { ...base.transition, ...overrides?.transition },
    maxParticles: overrides?.maxParticles ?? base.maxParticles,
  };
}

/** Linear lookup into a zoom-indexed table with fractional interpolation
 *  (windy snaps at integer tile zooms; interpolating is strictly smoother). */
export function lookupZoomTable(table: number[], zoom: number): number {
  const z = Math.max(0, Math.min(table.length - 1, zoom));
  const i0 = Math.floor(z);
  const i1 = Math.min(table.length - 1, i0 + 1);
  return table[i0] + (table[i1] - table[i0]) * (z - i0);
}
