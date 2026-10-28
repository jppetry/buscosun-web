/**
 * Phase NC (`audit/radar-nowcast-dach.md` §3) — which radar product draws where.
 *
 * Every native pixel belongs to the radar of its COUNTRY (`pickCountry`: box, else the border) — the same split as the
 * ownership mask before Phase NC:
 *   · `rv`   DWD-RV: Germany, 25 × 5 min from the analysis;
 *   · `rzc`  Switzerland: the MeteoSwiss analysis and buscosun's extrapolation of it (24 × 5 min);
 *   · `inca` Austria: the INCA run refined to 5 min (34 frames, +15 … +180).
 * Jan's brief of 27.10.2026 (E-NC-1) had given DWD-RV the north of Switzerland (≥ 46,7° N) and the west of Austria (< 14° E)
 * with a ± 15-km ramp at each seam. Measured 28.10.2026 against the national products, the DWD composite is blind at those
 * ranges: over central Switzerland (15:05 MEZ, 7,5–9,6° E, 46,8–47,3° N) rzc saw 58–91 % wet pixels, RV 0–4,5 % (V-NC-6);
 * in Upper Austria at 48° N RV thins from 13,6° E and ends at 14,15° E while INCA sees 23–35 % wet pixels there (V-NC-2).
 * Jan gave both countries back to their own product that day — no seam, no band. `RADAR_ZONE_UNDER` and the band bytes of
 * `zoneMaskForGrid` keep the shader contract for a ramp, should one come back.
 *
 * Pure and worker-safe (`precipIndexWorker`, op `zone`): the same bicubic refinement of the pixel centres as the country mask.
 */

import type { Country } from '../types';
import { fastCountryPicker, gridNodeFn, projectedSampler, HD_GRID_COUNTRY, type HdGridKind } from './radarCountryMask';
import type { QuadCorners } from './RainLayer';

export type RadarZone = 'rv' | 'inca' | 'rzc';
export const RADAR_ZONE_OF_GRID: Readonly<Record<HdGridKind, RadarZone>> = Object.freeze({ radolan: 'rv', inca: 'inca', rzc: 'rzc' });

export interface ZoneWeights { rv: number; inca: number; rzc: number }

/** Weights of the three products at (lat, lng) for a point of `country` (they add up to 1) — since 28.10.2026 the country alone. */
export function zoneWeightsFor(country: Country, _lat: number, _lng: number): ZoneWeights {
  if (country === 'AT') return { rv: 0, inca: 1, rzc: 0 };
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
