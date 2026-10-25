/**
 * Wind-particle look of the Wetterkarte, in ONE place: `MapView` (Wetterkarte, Regenradar) and the Dashboard's map tile
 * (`dashboard/MiniMap.tsx`) both build their `WindLayer` from it, so the two cannot drift apart again (the tile once drew
 * ~4× the particles because it lacked the zoom-in thinning).
 *
 * Only look and tempo live here. The area clamps (`minParticles`/`maxParticles`) stay with the caller: the Wetterkarte keeps
 * a floor for a full-size map, a small tile must not (a floor would multiply the density per pixel).
 *
 * History of the values (Jan): tempo 6 -> 4,2 (10.10.) -> 3,2 (25.10.); thinning on zoom-in 0,75 -> 1,25 from z6,5 (10.10.);
 * density slider default 1,0 -> 0,7 -> 0,55 -> 0,45 (25.10.). Derivation of the rest: `audit/windpartikel-globus-vorbild.md`,
 * `audit/windpartikel-hochzoom.md`, `audit/wind-partikel-grib-treue.md`.
 */
import type { WindLayerOptions } from './WindLayer';
import { GLOBE_PARTICLE_RAMP } from './particlePreset';

/** Default of the density slider (multiplier on `baseDensity`). */
export const WEATHER_WIND_DENSITY = 0.45;
/** Dot size and trail length of "Normal" (the "Intensiv" mode of the Wetterkarte widens both). */
export const WEATHER_WIND_POINT_SIZE = 1.7;
export const WEATHER_WIND_FADE = 0.972;

export function weatherWindOptions(coarsePointer: boolean): WindLayerOptions {
  return {
    windPngUrl: '', windJsonUrl: '',
    baseDensity: 18000,
    // Smooth, curved paths instead of a polyline: costs advection work, no extra draw pass.
    subSteps: 3,
    // Speed as colour; the particles get their own ramp (the heatmap ramp starts dark and would swallow slow ones).
    particleColor: [0.86, 0.92, 1.0, 0.84], speedTint: 0.62,
    particleColorRamp: GLOBE_PARTICLE_RAMP,
    pointSize: WEATHER_WIND_POINT_SIZE, fadeOpacity: WEATHER_WIND_FADE,
    // Tempo strictly linear to the GRIB value: px/s = speedPxPerMs · |V|.
    speedPxPerMs: 3.2, speedRefZoom: 5.5,
    // Slower when zoomed out (z4 ≈ 0,68×), slightly quicker when zoomed in.
    screenTempoZoomExp: 0.35,
    // Fewer particles when zooming in (the trails grow with the zoom, the covered area must not).
    zoomInThinExp: 1.25, zoomInThinFrom: 6.5,
    // Zoomed out the refresh rate rises (dissolves the clumps in convergence zones).
    zoomDropBoost: 0.42,
    // Touch devices: half the CPU upsampling work and ~30 fps; desktop is the reference.
    upsample: coarsePointer ? 1 : 2,
    maxParticleFps: coarsePointer ? 30 : 0,
  };
}
