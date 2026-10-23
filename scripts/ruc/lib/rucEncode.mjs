/**
 * rucEncode.mjs — pure building blocks of the `ruc/v1` producer (phase RUC, T2): accumulation → interval rate, tier grids →
 * chunk images in the contract's byte encoding, statistics, station series. No network, no file system.
 */
import { createHash } from 'node:crypto';
import { cellOf } from '../../../src/point/cubeFormat.ts';
import {
  RUC_DRY_MM, RUC_STEP_MIN, RUC_STEPS, RUC_CHUNK_WIDTH, RUC_STATION_STEPS, RUC_TIER, encodeRucByte,
} from '../../../src/point/rucFormat.ts';

/** mm per 5-min interval → mm/h. */
export const RATE_PER_MM = 60 / RUC_STEP_MIN;

/**
 * Rate of the interval between two accumulations since run start (`TOT_PREC`, template 8). A delta below `dryMm` — that
 * includes the negative rounding remainders of the GRIB packing — is dry; `NaN` (bitmap) stays `NaN`.
 */
export function intervalRateMmH(accPrev, accNext, dryMm = RUC_DRY_MM) {
  const n = accPrev.length;
  if (accNext.length !== n) throw new Error(`ruc: accumulation lengths differ (${accPrev.length} vs ${accNext.length})`);
  const rate = new Float32Array(n);
  let negatives = 0, minPos = Infinity;
  for (let i = 0; i < n; i++) {
    const d = accNext[i] - accPrev[i];
    if (!Number.isFinite(d)) { rate[i] = NaN; continue; }
    if (d < 0) negatives++;
    if (d < dryMm) { rate[i] = 0; continue; }
    if (d < minPos) minPos = d;
    rate[i] = d * RATE_PER_MM;
  }
  return { rate, negatives, minPosDeltaMm: minPos === Infinity ? null : minPos };
}

/**
 * One grayscale image per chunk: width 256 (column = (iy mod 16)·16 + ix mod 16), height `steps`; row k = interval k.
 * `stepRates[k]` is a tier grid (`Float32Array(ny·nx)`) or `null` (interval not built ⇒ byte 0). Cells beyond the tier
 * extent of a cut chunk stay 0.
 */
export function encodeChunkImages(stepRates, tier = RUC_TIER, steps = RUC_STEPS) {
  const out = [];
  const cs = tier.chunk.cells;
  for (let cy = 0; cy < tier.chunk.cy; cy++) {
    for (let cx = 0; cx < tier.chunk.cx; cx++) {
      const data = new Uint8Array(steps * RUC_CHUNK_WIDTH);
      const y0 = cy * cs, x0 = cx * cs;
      for (let ly = 0; ly < cs; ly++) {
        const iy = y0 + ly;
        if (iy >= tier.ny) break;
        for (let lx = 0; lx < cs; lx++) {
          const ix = x0 + lx;
          if (ix >= tier.nx) break;
          const cell = iy * tier.nx + ix, column = ly * cs + lx;
          for (let k = 0; k < steps && k < stepRates.length; k++) {
            const g = stepRates[k];
            if (g) data[k * RUC_CHUNK_WIDTH + column] = encodeRucByte(g[cell]);
          }
        }
      }
      out.push({ cy, cx, data });
    }
  }
  return out;
}

/** Counted, not set: cells, cells with a hole in any interval, wet cells, maximum, saturated cell-intervals. */
export function rucStatsOf(stepRates, tier = RUC_TIER, minPosDeltaMm = null) {
  const n = tier.ny * tier.nx;
  let missing = 0, wet = 0, maxMmH = 0, saturated = 0;
  for (let c = 0; c < n; c++) {
    let anyNaN = false, anyWet = false;
    for (const g of stepRates) {
      if (!g) continue;
      const v = g[c];
      if (Number.isNaN(v)) { anyNaN = true; continue; }
      if (v > 0) anyWet = true;
      if (v > maxMmH) maxMmH = v;
      if (v > 90 && encodeRucByte(v) === 255) saturated++;
    }
    if (anyNaN) missing++;
    if (anyWet) wet++;
  }
  return { cells: n, missing, wet, maxMmH, minPosDeltaMm: minPosDeltaMm ?? null, saturated };
}

/** Stations of the obs catalogue that measure rain (`rr`) and lie in the domain, in catalogue order; `catalog` = sha256(ids)[0..8). */
export function stationCellsOf(stations, tier = RUC_TIER) {
  const ids = [], cells = [];
  for (const s of stations) {
    if (!s || !Array.isArray(s.vars) || !s.vars.includes('rr')) continue;
    const c = cellOf(tier, s.lat, s.lon);
    if (!c) continue;
    ids.push(s.id);
    cells.push(c.iy * tier.nx + c.ix);
  }
  const catalog = createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0, 8);
  return { ids, cells: Int32Array.from(cells), catalog };
}

/** Grayscale image width = stations, height = `steps`; row k = interval k, column j = station j of `cells`. */
export function encodeStationSeries(stepRates, cells, steps = RUC_STATION_STEPS) {
  const width = cells.length;
  const data = new Uint8Array(steps * width);
  for (let k = 0; k < steps && k < stepRates.length; k++) {
    const g = stepRates[k];
    if (!g) continue;
    for (let j = 0; j < width; j++) data[k * width + j] = encodeRucByte(g[cells[j]]);
  }
  return { width, height: steps, data };
}
