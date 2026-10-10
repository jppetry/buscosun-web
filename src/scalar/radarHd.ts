/**
 * Phase HD — switches and names of the high-resolution precipitation radar (`audit/radar-hochaufloesung.md` §5).
 *
 * Pure (no DOM, no maplibre): the verifier reads it headless. With the switch off, `MapView` draws exactly as before
 * Phase HD (the DACH composite on the 600 × 512 grid); with it on, each country's radar is drawn on its own 1-km grid
 * through its own `RainLayer` (HD-1) with a value-preserving filter (HD-2). The composite layer stays as the named
 * fallback. **Default on since E-HD-2 (Jan 08.10.2026, "schalte alles aktiv")** — `?hd=0` is the way back to the
 * composite picture of HEAD `96d9725`.
 *
 *   `?hd=1`                → on, filter `RADAR_HD_DEFAULT_FILTER`
 *   `?hd=catmull|bilinear|nearest|bspline` → on with that filter
 *   `?hd=0`                → off (beats the stored value)
 *   otherwise `localStorage.radarhd` with the same grammar; otherwise `RADAR_HD_DEFAULT_ON`.
 */

/** How `RainLayer` reads its value texture between texel centres. `bspline` is the state before HD (smoothing, an
 *  isolated texel keeps (4/6)² = 44 % at its centre); the other three go through the measured values. */
export type RainFilter = 'bspline' | 'catmull' | 'bilinear' | 'nearest';
export const RAIN_FILTERS: readonly RainFilter[] = Object.freeze(['bspline', 'catmull', 'bilinear', 'nearest']);
/** Shader uniform value per filter (`u_filter`). */
export const RAIN_FILTER_CODE: Readonly<Record<RainFilter, number>> = Object.freeze({ bspline: 0, catmull: 1, bilinear: 2, nearest: 3 });
/** HD-2: Catmull-Rom clamped to the inner 2 × 2 texels — interpolating (peak 1,00 at the texel centre), no overshoot. */
export const RADAR_HD_DEFAULT_FILTER: RainFilter = 'catmull';
/** E-HD-2: the native 1-km grids are the normal case; `?hd=0` / `localStorage.radarhd = '0'` = the composite as before. */
export const RADAR_HD_DEFAULT_ON = true;
/** E-HD-3: dual frames (log plane up to 200 mm/h) are read whenever a slot offers them; `?hdv2=0` keeps the v1 byte. */
export const RADAR_DUAL_DEFAULT_ON = true;
/** E-HD-5: in-between pictures along the motion field in the Regenradar; `?hdmorph=0` = linear mix as before. */
export const RADAR_MORPH_DEFAULT_ON = true;

export interface RadarHdFlags { on: boolean; filter: RainFilter }

/**
 * HD-4: in-between pictures along the motion field (Regenradar profile, between two radar times) instead of the linear
 * mix — `?hdmorph=1` on, `?hdmorph=0` off (beats the store), else `localStorage.radarhdmorph`; default
 * `RADAR_MORPH_DEFAULT_ON`. Needs HD on.
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
  if (s === '0') return false;
  if (s === '1') return true;
  return RADAR_MORPH_DEFAULT_ON;
}

/**
 * Phase RS (`audit/radar-randsaum.md`): edge rule of the HD layers. Without it the filter and the in-between pictures mix a
 * wet texel with the 0 of its dry neighbour — on the log plane that paints a ½–1 km ring of the light-blue classes
 * 0,06 … 0,5 mm/h around every rain area where the radar measured nothing. With it, wet/dry is decided from the measured
 * texels (`round`: bilinear share of wet texels ≥ ½ — the nearest-pixel border on straight edges, corners rounded; `nearest`:
 * the texel under the point, stair edges) and dry texels never enter the value.
 */
export type RainEdge = 'off' | 'round' | 'nearest';
export const RAIN_EDGES: readonly RainEdge[] = Object.freeze(['off', 'round', 'nearest']);
/** Shader uniform value per edge rule (`u_edge`); 0 = the path before Phase RS. */
export const RAIN_EDGE_CODE: Readonly<Record<RainEdge, number>> = Object.freeze({ off: 0, round: 1, nearest: 2 });
/** E-RS-1 (Jan 10.10.2026, "setze den Schalter immer aktiv"): `round` is the default; `?hdedge=0` = the picture before RS. */
export const RADAR_EDGE_DEFAULT: RainEdge = 'round';

function parseEdge(v: string | null | undefined): RainEdge | null {
  if (v == null) return null;
  if (v === '0') return 'off';
  if (v === '1') return 'round';
  return (RAIN_EDGES as readonly string[]).includes(v) ? (v as RainEdge) : null;   // unknown word = no vote
}

/** `?hdedge=0|1|round|nearest|off` beats `localStorage.radarhdedge` (same grammar), else `RADAR_EDGE_DEFAULT`. */
export function radarEdgeFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): RainEdge {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('hdedge'); } catch { /* broken query = no vote */ }
  const fromQuery = parseEdge(q);
  if (fromQuery) return fromQuery;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarhdedge') : null; } catch { s = null; }
  }
  return parseEdge(s) ?? RADAR_EDGE_DEFAULT;
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
  return parse(s) ?? { on: RADAR_HD_DEFAULT_ON, filter: RADAR_HD_DEFAULT_FILTER };
}

/**
 * HD-3: read the mirror's dual frames (`g<lead>.png`: channel 1 = v1 byte, channel 2 = log 0,06…200 mm/h) when the slot
 * offers them. `?hdv2=1` on, `?hdv2=0` off (beats the store), else `localStorage.radarhdv2`; default
 * `RADAR_DUAL_DEFAULT_ON`. The HD layers then draw the log plane with `precipRainRampLog`; every other consumer keeps
 * the v1 byte. A slot without `meta.dual` (every slot before the mirror runs with `RADAR_IMG_DUAL=1`) reads exactly as
 * with the switch off.
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
  if (s === '0') return false;
  if (s === '1') return true;
  return RADAR_DUAL_DEFAULT_ON;
}

/** The three HD layers of `MapView` (one per country radar), drawn right above the composite layer. */
export const RADAR_HD_LAYER_IDS = Object.freeze({ DE: 'precip-rain-hd-de', AT: 'precip-rain-hd-at', CH: 'precip-rain-hd-ch' });
export type RadarHdCountry = keyof typeof RADAR_HD_LAYER_IDS;
export const RADAR_HD_COUNTRIES: readonly RadarHdCountry[] = Object.freeze(['DE', 'AT', 'CH']);

// --- Phase RG (`audit/radar-regenschwelle.md`): display threshold of the precipitation radar -----------------------
/**
 * The smallest rate the precipitation map shows as blue, in mm/h on the NATIVE radar values.
 * Provenance `measured`: 10.10.2026, 576 DWD-RV analyses 08.–10.10.2026 against 175 DWD 10-min stations with the
 * precipitation indicator (`RWS_IND_10`), rule R-RG-1 frozen before the first metric (`audit/radar-regenschwelle/
 * claims-frozen.sha256`): the smallest native step whose precision P(it precipitates | shown blue) has a 90-% lower bound
 * ≥ Z = 90 % (E-RG-1, Jan 10.10.2026) — 0,060 mm/h: precision 93,1 % (90,7–95,0), hold-out 93,0 %; today (every echo)
 * 86,2 %. ONE threshold for all distances (E-RG-2), below it nothing is drawn (E-RG-3). Equal to `PRECIP_LOG_MIN`, the
 * floor of the log plane — so the producer realises it by encoding the plane from the native values (`RADAR_LOG_NATIVE`),
 * and the client pre-pass (`applyDisplayMin`) only acts for a larger value (`?rmin=`). Re-measure after ≥ 7 days and in
 * winter (V-RG-1).
 */
export const RADAR_DISPLAY_MIN_MMH = 0.06;
export const RADAR_DISPLAY_MIN_MEASURED = '2026-10-10';

/**
 * `?rmin=<mm/h>` (or `localStorage.radarrmin`) — the display threshold applied on the client to the log plane (HD layers
 * DE/AT/CH and the 250-m tiles) for comparison; `0` = no client pre-pass (the plane as the mirror wrote it); default
 * `RADAR_DISPLAY_MIN_MMH`. A value at or below the codec floor changes nothing (the plane carries no smaller rate).
 */
export function radarDisplayMinFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): number {
  const parse = (v: string | null | undefined): number | null => { if (v == null || v === '') return null; const x = Number(v.replace(',', '.')); return Number.isFinite(x) && x >= 0 ? x : null; };
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('rmin'); } catch { /* broken query = no vote */ }
  const fromQuery = parse(q);
  if (fromQuery != null) return fromQuery;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarrmin') : null; } catch { s = null; }
  }
  return parse(s) ?? RADAR_DISPLAY_MIN_MMH;
}

/**
 * Client pre-pass on a LOG-plane byte array: every byte whose rate (`fromU8`) is below `minMmh` becomes 0 (dry). Returns the
 * SAME array (no copy) when nothing can change — `minMmh` at or below the codec floor `floorMmh` — so the default path stays
 * byte-identical and allocation-free; otherwise a new array. No shader involved.
 */
export function applyDisplayMin(values: Uint8Array, minMmh: number, floorMmh: number, fromU8: (u: number) => number): Uint8Array {
  if (!(minMmh > floorMmh)) return values;
  const out = new Uint8Array(values.length);
  let uMin = 1;
  while (uMin < 255 && fromU8(uMin) < minMmh) uMin++;   // first byte at or above the threshold (codec is monotone)
  for (let i = 0; i < values.length; i++) { const u = values[i]; out[i] = u >= uMin ? u : 0; }
  return out;
}
