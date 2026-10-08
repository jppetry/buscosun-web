/**
 * Phase HD — switches and names of the high-resolution precipitation radar (`audit/radar-hochaufloesung.md` §5).
 *
 * Pure (no DOM, no maplibre): the verifier reads it headless. With the switch off, `MapView` draws exactly as before
 * (the DACH composite on the 600 × 512 grid); with it on, each country's radar is drawn on its own 1-km grid through its
 * own `RainLayer` (HD-1) with a value-preserving filter (HD-2). The composite layer stays as the named fallback.
 *
 *   `?hd=1`                → on, filter `RADAR_HD_DEFAULT_FILTER`
 *   `?hd=catmull|bilinear|nearest|bspline` → on with that filter
 *   `?hd=0`                → off (beats the stored value)
 *   otherwise `localStorage.radarhd` with the same grammar; otherwise off.
 */

/** How `RainLayer` reads its value texture between texel centres. `bspline` is the state before HD (smoothing, an
 *  isolated texel keeps (4/6)² = 44 % at its centre); the other three go through the measured values. */
export type RainFilter = 'bspline' | 'catmull' | 'bilinear' | 'nearest';
export const RAIN_FILTERS: readonly RainFilter[] = Object.freeze(['bspline', 'catmull', 'bilinear', 'nearest']);
/** Shader uniform value per filter (`u_filter`). */
export const RAIN_FILTER_CODE: Readonly<Record<RainFilter, number>> = Object.freeze({ bspline: 0, catmull: 1, bilinear: 2, nearest: 3 });
/** HD-2: Catmull-Rom clamped to the inner 2 × 2 texels — interpolating (peak 1,00 at the texel centre), no overshoot. */
export const RADAR_HD_DEFAULT_FILTER: RainFilter = 'catmull';

export interface RadarHdFlags { on: boolean; filter: RainFilter }

/**
 * HD-4: in-between pictures along the motion field (Regenradar profile, between two radar times) instead of the linear
 * mix — `?hdmorph=1` on, `?hdmorph=0` off (beats the store), else `localStorage.radarhdmorph`; default off. Needs HD on.
 */
export function radarMorphFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('hdmorph'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarhdmorph') : null; } catch { s = null; }
  }
  return s === '1';
}

/** HD-4: coarsening factor of the motion estimate per native grid (RV 1100 → 138 columns, INCA/rzc 701/710 → 175/178). */
export const RADAR_MORPH_FACTOR: Readonly<Record<'DE' | 'AT' | 'CH', number>> = Object.freeze({ DE: 8, AT: 4, CH: 4 });
/** HD-4: Horn–Schunck settings (as the flow nowcast of the Wetterkarte, `MapView` FLOW_*). */
export const RADAR_MORPH_HS = Object.freeze({ alpha: 0.5, iters: 100 });
/** HD-4: largest displacement the flow texture encodes (native texels per frame interval); larger values are clamped. */
export const RADAR_MORPH_MAX_TEXELS = 40;

function parse(v: string | null | undefined): RadarHdFlags | null {
  if (v == null) return null;
  if (v === '0') return { on: false, filter: RADAR_HD_DEFAULT_FILTER };
  if (v === '1') return { on: true, filter: RADAR_HD_DEFAULT_FILTER };
  if ((RAIN_FILTERS as readonly string[]).includes(v)) return { on: true, filter: v as RainFilter };
  return null;   // unknown word = no vote
}

export function radarHdFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): RadarHdFlags {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('hd'); } catch { /* broken query = no vote */ }
  const fromQuery = parse(q);
  if (fromQuery) return fromQuery;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarhd') : null; } catch { s = null; }
  }
  return parse(s) ?? { on: false, filter: RADAR_HD_DEFAULT_FILTER };
}

/**
 * HD-3: read the mirror's dual frames (`g<lead>.png`: channel 1 = v1 byte, channel 2 = log 0,06…200 mm/h) when the slot
 * offers them. `?hdv2=1` on, `?hdv2=0` off (beats the store), else `localStorage.radarhdv2`; default off. The HD layers
 * then draw the log plane with `precipRainRampLog`; every other consumer keeps the v1 byte.
 */
export function radarDualFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('hdv2'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarhdv2') : null; } catch { s = null; }
  }
  return s === '1';
}

/** The three HD layers of `MapView` (one per country radar), drawn right above the composite layer. */
export const RADAR_HD_LAYER_IDS = Object.freeze({ DE: 'precip-rain-hd-de', AT: 'precip-rain-hd-at', CH: 'precip-rain-hd-ch' });
export type RadarHdCountry = keyof typeof RADAR_HD_LAYER_IDS;
export const RADAR_HD_COUNTRIES: readonly RadarHdCountry[] = Object.freeze(['DE', 'AT', 'CH']);
