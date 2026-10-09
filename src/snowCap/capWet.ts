/**
 * Phase SK (E-SK-3): where it actually precipitates the cap is stronger. Weight per field cell (grid of the snow field):
 * the radar of the cell's country at the map time if that country has a frame there (DE RV / AT INCA / CH rzc; country
 * rule as the precipitation map, V-FR-11), otherwise the chance of the Fusion map field for that hour. Pure.
 */
import type { FieldGrid } from '../point/fieldFormat';
import type { RadarFrame, RadarStack } from '../radar/radarFrames';
import { RADAR_VMAX } from '../radar/radarModel';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { countryRowPicker } from '../pointForecast/countryOfPoint';
import type { Country } from '../types';
import { radarWeight } from './snowCapModel';

/** Nearest frame within half a step (+1 min); `null` = the radar has no picture for that time. */
export function frameAtTime(stack: RadarStack, tMs: number): RadarFrame | null {
  const tol = (stack.stepMin / 2 + 1) * 60_000;
  let best: RadarFrame | null = null;
  for (const f of stack.frames) {
    const d = Math.abs(f.timeMs - tMs);
    if (d <= tol && (!best || d < Math.abs(best.timeMs - tMs))) best = f;
  }
  return best;
}

export interface WetGrid {
  grid: FieldGrid;
  /** 0…1, NaN = unknown. Row 0 = north. */
  w: Float32Array;
  /** 0 none, 1 radar, 2 field chance. */
  source: Uint8Array;
  radar: number;
  field: number;
}

export function buildWetGrid(grid: FieldGrid, stacks: Partial<Record<Country, RadarStack | null>>, tMs: number, chance: Float32Array | null): WetGrid {
  const W = grid.width, Hh = grid.height, n = W * Hh;
  const w = new Float32Array(n).fill(NaN), source = new Uint8Array(n);
  const frames: Record<Country, RadarFrame | null> = {
    DE: stacks.DE ? frameAtTime(stacks.DE, tMs) : null,
    AT: stacks.AT ? frameAtTime(stacks.AT, tMs) : null,
    CH: stacks.CH ? frameAtTime(stacks.CH, tMs) : null,
  };
  let radar = 0, field = 0;
  for (let r = 0; r < Hh; r++) {
    const lat = grid.lat0 + (Hh - 1 - r) * grid.deg;
    const pick = countryRowPicker(lat);
    for (let c = 0; c < W; c++) {
      const k = r * W + c, lon = grid.lon0 + c * grid.deg;
      const cc = pick(lon);
      const st = stacks[cc] ?? null, fr = frames[cc];
      if (st && fr) {
        const v = radarWeight(sampleRadarPoint(st.source, fr.values, fr.width, fr.height, st.corners, lat, lon, RADAR_VMAX));
        if (v != null) { w[k] = v; source[k] = 1; radar++; continue; }
      }
      const p = chance ? chance[k] : NaN;
      if (Number.isFinite(p)) { w[k] = p; source[k] = 2; field++; }
    }
  }
  return { grid, w, source, radar, field };
}

/** Nearest cell; `null` = unknown (treated as dry by the raster). */
export function wetSampler(wg: WetGrid): (lat: number, lon: number) => number | null {
  const { width: W, height: Hh, lon0, lat0, deg } = wg.grid;
  return (lat, lon) => {
    const ix = Math.round((lon - lon0) / deg), iy = Math.round((lat - lat0) / deg);
    if (ix < 0 || iy < 0 || ix >= W || iy >= Hh) return null;
    const v = wg.w[(Hh - 1 - iy) * W + ix];
    return Number.isNaN(v) ? null : v;
  };
}
