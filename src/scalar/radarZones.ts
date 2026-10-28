/**
 * Phase NC (`audit/radar-nowcast-dach.md` §3) — which radar product draws where, with a transition band instead of a hard edge.
 *
 * Before Phase NC the ownership mask gave every native pixel to the radar of its COUNTRY (`countryMaskForGrid`, `pickCountry`).
 * Now the split follows what each product can do (E-NC-1, Jan's brief):
 *   · `rv`   DWD-RV: Germany and the west of Austria (west of ≈ 14° E) — the DWD composite reaches there with 25 × 5 min
 *            from the analysis;
 *   · `rzc`  ALL of Switzerland: the MeteoSwiss analysis and buscosun's extrapolation of it (24 × 5 min). Until 28.10.2026 the
 *            north (≥ 46,7° N) went to DWD-RV — measured against MeteoSwiss that day (15:05 MEZ, 7,5–9,6° E): rzc saw 58–91 %
 *            wet pixels between 46,8 and 47,3° N, DWD-RV 0–4,5 % — the DWD composite is blind there (V-NC-6), so Jan gave
 *            CH back to rzc entirely;
 *   · `inca` the rest of Austria (Linz, Graz, Klagenfurt, Vienna): INCA, refined to 5 min.
 * The country still comes from `pickCountry` (box, else the border); inside AT the meridian `RADAR_ZONE_AT_RV_LNG_MAX` divides
 * with a linear ramp of ± half the band so the seam is a transition zone (the layers overlap there — see `RADAR_ZONE_UNDER`).
 * The AT number is SET (Jan's brief 27.10.2026: "westlich von etwa 14° E"); measured 28.10. the DWD composite thins from
 * 13,6° E and ends at 14,15° E at 48° N (V-NC-2) — the AT seam is still open.
 *
 * Pure and worker-safe (`precipIndexWorker`, op `zone`): the same bicubic refinement of the pixel centres as the country mask.
 */

import type { Country } from '../types';
import { fastCountryPicker, gridNodeFn, projectedSampler, HD_GRID_COUNTRY, type HdGridKind } from './radarCountryMask';
import type { QuadCorners } from './RainLayer';

export type RadarZone = 'rv' | 'inca' | 'rzc';
export const RADAR_ZONE_OF_GRID: Readonly<Record<HdGridKind, RadarZone>> = Object.freeze({ radolan: 'rv', inca: 'inca', rzc: 'rzc' });

/** AT west of this longitude belongs to DWD-RV (set). */
export const RADAR_ZONE_AT_RV_LNG_MAX = 14.0;
/** Half-width of the transition band in degrees (≈ 15 km): 0,2° of longitude at 47° N. */
export const RADAR_ZONE_BLEND_DEG = Object.freeze({ lng: 0.2 });

export interface ZoneWeights { rv: number; inca: number; rzc: number }

/** Linear ramp: 0 at x ≤ −1, 1 at x ≥ +1. */
const ramp = (x: number) => (x <= -1 ? 0 : x >= 1 ? 1 : (x + 1) / 2);

/** Weights of the three products at (lat, lng) for a point of `country` (they add up to 1). */
export function zoneWeightsFor(country: Country, _lat: number, lng: number): ZoneWeights {
  if (country === 'AT') {
    const rv = ramp((RADAR_ZONE_AT_RV_LNG_MAX - lng) / RADAR_ZONE_BLEND_DEG.lng);
    return { rv, inca: 1 - rv, rzc: 0 };
  }
  if (country === 'CH') return { rv: 0, inca: 0, rzc: 1 };
  return { rv: 1, inca: 0, rzc: 0 };
}

/** Weights at any point — the country by the same rule as the ownership mask. */
export function zoneWeights(lat: number, lng: number): ZoneWeights {
  return zoneWeightsFor(fastCountryPicker()(lat, lng), lat, lng);
}

/** The product with the largest weight at (lat, lng) — the hard rule for readers that need ONE product. */
export function zoneAt(lat: number, lng: number): RadarZone {
  const w = zoneWeights(lat, lng);
  return w.rv >= w.inca && w.rv >= w.rzc ? 'rv' : w.inca >= w.rzc ? 'inca' : 'rzc';
}

/**
 * The product whose layer the map draws FIRST (`MapView` adds the HD layers DE, AT, CH in this order, so DWD-RV lies under
 * INCA and rzc). In the band the layers overlap with "over" blending: if BOTH carried their weight as alpha, the background
 * would show through (at w = ½ only ¾ of the pixel is covered — the seam looked pale). The exact cross-fade is: the under
 * layer draws at full alpha wherever its weight is > 0, the over layer with its weight — over·w + under·(1 − w).
 */
export const RADAR_ZONE_UNDER: RadarZone = 'rv';

/**
 * Weight mask of a radar grid: `cols × rows` bytes 0 … 255 = the weight of the grid's own product at the pixel centre
 * (255 = draws alone, 0 = not drawn, in between = the transition band). The `RainLayer` multiplies its alpha with it.
 * Where the country's product is the grid's own and no band runs, the mask equals the ownership mask (255 ⇔ 1).
 * The under layer (`RADAR_ZONE_UNDER`) gets 255 throughout the band — see there. Band bytes start at 2: the `RainLayer`
 * reads byte 1 as the ownership mask's "draw" (= 255), so a weight of 1/255 at the band's outer edge drew a full-alpha line.
 */
export function zoneMaskForGrid(kind: HdGridKind, corners: QuadCorners, cols: number, rows: number): Uint8Array {
  const own = RADAR_ZONE_OF_GRID[kind];
  const under = own === RADAR_ZONE_UNDER;
  const at = projectedSampler(gridNodeFn(kind, corners));
  const pick = fastCountryPicker();
  const out = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows;
    for (let col = 0; col < cols; col++) {
      const [lon, lat] = at((col + 0.5) / cols, v);
      const w = zoneWeightsFor(pick(lat, lon), lat, lon)[own];
      out[r * cols + col] = w <= 0 ? 0 : (under || w >= 1) ? 255 : Math.max(2, Math.round(w * 255));
    }
  }
  return out;
}

/** The country whose radar grid this is (re-exported for callers that only know the zone table). */
export const RADAR_ZONE_GRID_COUNTRY = HD_GRID_COUNTRY;
