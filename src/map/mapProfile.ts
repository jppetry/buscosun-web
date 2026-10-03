/**
 * Map profiles of `MapView` — Phase RR (`audit/regenradar-datenangleich.md` §4 RR-a…RR-c).
 *
 * The Regenradar (`/regenradar`) embeds the SAME map as the Wetterkarte (`MapView.tsx`, E-RR-1) with the profile
 * `'radar'`: only the precipitation layers, time from outside as an absolute validity time (look-back included), no
 * own chrome (the Regenradar deck brings rail, dock, timeline and readout). Without a profile `MapView` behaves exactly
 * as before — every branch that reads the profile is additive.
 *
 * Pure logic only (no maplibre, no WebGL, no loaders): `scripts/verify-regenradar-profile.mjs` imports it headless.
 */

import type { LayerKey } from './layerTypes';
import type { CompositeSources, RvPastFrame } from '../scalar/precipComposite';
import type { RvNowcast } from '../sources/radolan';
import type { IncaGrid } from '../sources/geosphereIncaGrid';
import type { RadarFrame } from '../sources/meteoSwissRadar';

export type MapProfile = 'radar';

/**
 * Deck layer → `MapView` layer of the radar profile. The deck's ids are the Regenradar's `RadarLayerId`s; the five here
 * are the ones its dock shows. The other ids of the old radar panel (rain/graupel/hail heuristics, accum, coverage)
 * have no `MapView` counterpart and are not taken over (E-RR-3, Jan 03.10.2026) — they map to nothing.
 */
export const RADAR_PROFILE_LAYER_MAP: Readonly<Record<string, LayerKey>> = Object.freeze({
  precip: 'nowcast',
  cells: 'cells',
  lightning: 'lightning',
  snow: 'snow',
  snowline: 'snowline',
});

/** The `MapView` layers the radar profile may show — nothing else is ever switched on in it. */
export const RADAR_PROFILE_LAYERS: readonly LayerKey[] = Object.freeze(['nowcast', 'cells', 'lightning', 'snow', 'snowline'] as LayerKey[]);

/** Deck layer set → `MapView` layer set (order of the profile table, duplicates and unknown ids dropped). */
export function radarProfileLayers(deckLayers: readonly string[]): LayerKey[] {
  const want = new Set<LayerKey>();
  for (const id of deckLayers) { const k = RADAR_PROFILE_LAYER_MAP[id]; if (k) want.add(k); }
  return RADAR_PROFILE_LAYERS.filter((k) => want.has(k));
}

/**
 * What the radar profile changes in `MapView` — one table, read by `MapView` and checked by the verifier.
 *  - `chrome: 'none'`   no topbar/rail/dock/time deck/point panel: `MapView` renders only the map container.
 *  - `tempLabels`       city temperature labels off (no precipitation content), and with them the eager t_2m load;
 *                       the temperature field is loaded only while the snow line needs it.
 *  - `prefetch`         no idle prefetch of the other layers' first frames (LZ1/M3) — the profile never shows them.
 *  - `camera`           start at the location (or the camera from the URL) at zoom 8, like the old radar map.
 *  - `marker`           draggable; dragging or a click reports the point (`onPointPick`), the mouse reports `onPointHover`.
 *  - `controls`         zoom + locate control bottom right (the old radar map had them; mobile CSS hides the group);
 *                       no scale bar (the deck's legend sits bottom left), attribution compact (ⓘ, as the old map).
 */
export const RADAR_PROFILE = Object.freeze({
  chrome: 'none' as const,
  tempLabels: false,
  prefetch: false,
  camera: { zoom: 8 },
  marker: { draggable: true },
  controls: { navigation: true, geolocate: true, scale: false, compactAttribution: true },
});

/**
 * `?rr=legacy` → the Regenradar keeps its own old radar map (`radar/RadarMap.tsx`, liberty/Esri) — the named fallback
 * of rule 2 (Phase RR). Anything else → `MapView` with the radar profile. Exact match only, like `?pf=live`.
 */
export function radarMapLegacyFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('rr') === 'legacy'; } catch { return false; }
}

/** Hours from now of an absolute validity time — the `forecastHour` the profile feeds into `MapView`'s layer effects. */
export function profileHourOf(timeMs: number, nowMs: number): number {
  return (timeMs - nowMs) / 3_600_000;
}

/** Look-back tolerance: a time earlier than the newest measurement minus half an RV step is "past" (old radar map: 2,5 min). */
export const PROFILE_PAST_TOL_MS = 2.5 * 60_000;
/** Farthest a CH look-back frame may be from the asked time — one rzc step. */
export const PROFILE_RZC_PICK_TOL_MS = 5 * 60_000;

export interface RadarProfileInputs {
  rv: RvNowcast | null;
  inca: IncaGrid | null;
  rzc: RadarFrame | null;
  /** Measured RV analyses of the look-back (DE1200, older than the run) — from the deck's radar stack. */
  rvPast?: ReadonlyArray<RvPastFrame> | null;
  /** Measured rzc analyses of the look-back (session cache) — from the deck's radar stack. */
  rzcPast?: ReadonlyArray<RadarFrame> | null;
}

/**
 * Composite input for ONE absolute validity time. `h` is the hour from now (the Wetterkarte's slider unit); RV is chosen
 * by validity time (`rvPast` mode of `PrecipCompositor.build`, look-back included), INCA by lead as in the Wetterkarte.
 * In the look-back (earlier than the newest measurement − 2,5 min) only measurements are drawn: RV from the
 * analyses, CH from the rzc analysis valid then (if the session holds one), AT not at all (INCA has no analysis) —
 * a neighbour never shows its current picture for an earlier time (old radar map, `NEIGHBOR_PAST_TOL_H`).
 */
export function radarProfileComposite(timeMs: number, nowMs: number, s: RadarProfileInputs): { h: number; past: boolean; sources: CompositeSources } {
  const h = profileHourOf(timeMs, nowMs);
  const newest = Math.max(s.rv ? s.rv.runAt.getTime() : -Infinity, s.rzc ? s.rzc.validAt.getTime() : -Infinity);
  const past = Number.isFinite(newest) ? timeMs < newest - PROFILE_PAST_TOL_MS : h < -PROFILE_PAST_TOL_MS / 3_600_000;
  let rzc: RadarFrame | null = null;
  if (!past) rzc = s.rzc;
  else if (s.rzcPast?.length) {
    let bd = Infinity;
    for (const f of s.rzcPast) {
      const d = Math.abs(f.validAt.getTime() - timeMs);
      if (d < bd) { bd = d; rzc = f; }
    }
    if (bd > PROFILE_RZC_PICK_TOL_MS) rzc = null;
  }
  return {
    h,
    past,
    sources: { rv: s.rv, inca: past ? null : s.inca, rzc, rvPast: s.rvPast ?? [] },
  };
}

/**
 * Frame morph of the profile (RR-c): the deck passes the two neighbouring radar times and the fraction between them;
 * `MapView` mixes the two composites. Quantised to 5 % steps like the snow lerp of the old radar map (RL1) — during
 * playback the deck moves the time every animation frame, the mix runs only when the step changes.
 */
export const PROFILE_MORPH_STEPS = 20;
export function morphStep(frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return Math.round(f * PROFILE_MORPH_STEPS) / PROFILE_MORPH_STEPS;
}

/** Linear mix of two u8 value grids (same rule as the old radar map's `lerpU8`). */
export function lerpValues(a: Uint8Array, b: Uint8Array, frac: number, out: Uint8Array): Uint8Array {
  const f = Math.max(0, Math.min(1, frac));
  const n = Math.min(a.length, b.length, out.length);
  for (let i = 0; i < n; i++) out[i] = (a[i] + (b[i] - a[i]) * f) | 0;
  return out;
}
