/**
 * Multi-source weather data fusion → high-resolution dense forecast grid.
 *
 * Inputs (one or more):
 *   • Open-Meteo `best_match` ForecastGrid (ICON-D2/CH1/AROME auto-routed)
 *   • Future: BrightSky / MOSMIX station observations (bias correction)
 *   • Future: GeoSphere INCA (AT nowcast)
 *   • Future: ECMWF Open Data IFS HRES (long-range backup)
 *
 * Pipeline per forecast hour:
 *   1) For each variable (temp, wind-u, wind-v, cloudLow/Mid/High, precip):
 *      - Collect all source samples at native coords with their source-weights
 *        (region × variable weighting matrix)
 *   2) IDW interpolation onto a dense regular grid (default 40×32 over DACH+EU)
 *   3) Gaussian (Barnes-style) smoothing pass to remove sample artefacts
 *   4) Per-cell coverage mask → alpha channel for the GPU layers
 *   5) Encode to PNG textures in the format the existing custom layers expect
 *
 * Slider sub-hours are bilinear-interpolated between adjacent hour-frames in
 * `getFrameAtHour(fraction)`.
 */

import type { ForecastGrid, ForecastHourPoint, ForecastBounds } from '../sources/openMeteoForecast';
import type {
  WindGridResult,
  ScalarGridResult,
  CloudGridResult,
  OpenMeteoBulkResult,
} from '../wind/openMeteoSource';
import {
  estimateLapseRate, type PointSample,
  buildSpatialKernel, applySpatialKernel, type SpatialKernel,
  type DenseGridResult,
} from './spatialInterp';
import { STANDARD_LAPSE_RATE_PER_M, type ElevationGrid } from './elevation';

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

export interface FusionConfig {
  /** Dense output grid resolution. */
  denseCols: number;
  denseRows: number;
  /** Lat/lng bounds the dense grid covers. */
  bounds: ForecastBounds;
  /** Range to clamp temperature into for PNG encoding (e.g. -20..40 °C). */
  temperatureRange: { min: number; max: number };
  /** Range to clamp precipitation into (mm/h). */
  precipitationRange: { min: 0, max: 10 } | { min: number; max: number };
  /** Forecast hours to produce (cap from sources). */
  hours: number;
  /**
   * Skip per-variable Gaussian smoothing for all variables except
   * temperature, and skip the temporal-median pass. Used by Phase A
   * first-paint to halve compute. Temperature still gets smoothing because
   * its hairline-ramp colour map is the most artefact-sensitive layer.
   */
  quickMode?: boolean;
}

const DEFAULT_CONFIG: FusionConfig = {
  denseCols: 40,
  denseRows: 32,
  bounds: { lngMin: -15, lngMax: 30, latMin: 32, latMax: 65 },
  temperatureRange: { min: -20, max: 40 },
  precipitationRange: { min: 0, max: 10 },
  hours: 24,
  quickMode: false,
};

export interface SourceWeights {
  /** Multiplier in [0..2] applied to this source's samples for this variable. */
  temperature?: number;
  wind?: number;
  clouds?: number;
  precipitation?: number;
}

interface IngestedSource {
  grid: ForecastGrid;
  weights: SourceWeights;
}

export interface FusedHour {
  timestamp: Date;
  layers: OpenMeteoBulkResult & { precipitation?: ScalarGridResult };
  /** Combined source list used to produce this hour. */
  modelTag: string;
}

export interface FusedForecast {
  hours: FusedHour[];
  fetchedAt: number;
  uvBounds: [number, number, number, number];
  /** Combined model name reported in the status badge. */
  model: string;
  /**
   * High-resolution DEM image covering the same uvBounds. R channel encodes
   * elevation 0..4500 m → 0..255. The scalar/temperature layer uses this to
   * apply per-pixel lapse-rate refinement: an alpine valley pixel decodes
   * its DEM elevation, the cell elevation (from the value PNG's green
   * channel), and computes t_pixel = t_cell + (cell_elev − dem_pixel) × γ.
   */
  demImage?: HTMLCanvasElement;
  /** Max elevation encoded in `demImage` and in the temp-PNG green channel. */
  demMax?: number;
  /** Lapse rate (°C/m) used for the per-pixel refinement. */
  lapseRatePerM?: number;
}

export class FusionEngine {
  private cfg: FusionConfig;
  private sources: IngestedSource[] = [];
  private elevation: ElevationGrid | null = null;

  constructor(cfg: Partial<FusionConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  /**
   * Plug in a DEM lookup. When set, temperature samples are reduced to
   * sea-level via the standard atmospheric lapse rate before IDW and the
   * lapse rate is re-applied per dense-grid cell using its actual altitude.
   */
  setElevation(elevation: ElevationGrid): void {
    this.elevation = elevation;
  }

  /** Add a forecast source with per-variable weights. */
  ingest(grid: ForecastGrid, weights: SourceWeights = {}): void {
    this.sources.push({ grid, weights });
  }

  reset(): void {
    this.sources = [];
  }

  /**
   * Run the full fusion pipeline. Produces N hour-frames each with the four
   * encoded PNG textures (wind / temp / clouds / precip) ready to be handed
   * to the custom MapLibre layers.
   */
  async run(): Promise<FusedForecast> {
    if (!this.sources.length) {
      throw new Error('FusionEngine: no sources ingested');
    }
    // Take the LONGEST available forecast horizon — sources with fewer hours
    // (e.g. INCA at ~3 h) simply stop contributing samples beyond their reach;
    // sources with full 24 h (MOSMIX, ICON-D2) keep the field populated.
    const maxHours = Math.min(
      this.cfg.hours,
      Math.max(...this.sources.map((s) => s.grid.points.length)),
    );

    const { denseCols, denseRows, bounds, temperatureRange, precipitationRange } = this.cfg;
    const uvBounds: [number, number, number, number] = [
      lngToEquiX(bounds.lngMin),
      latToEquiY(bounds.latMax),
      lngToEquiX(bounds.lngMax),
      latToEquiY(bounds.latMin),
    ];

    const fetchedAt = Date.now();
    const hoursOut: FusedHour[] = [];

    // Reference times from the first source.
    const refTimes = this.sources[0].grid.times;

    // Pre-compute the dense-grid DEM elevation once — used by the temperature
    // IDW for lapse-rate correction. Cheap (single pass, ~5000 cells).
    const gridElevations = this.elevation
      ? this.elevation.buildGrid(bounds, denseCols, denseRows)
      : null;

    // -----------------------------------------------------------------
    // FAST PATH — precompute positions + spatial kernels ONCE.
    // -----------------------------------------------------------------
    // Sample POSITIONS are constant across all forecast hours (a MOSMIX
    // grid point at (lng, lat) is at the same place at h=0 and h=23). Only
    // the VALUES change. We exploit this by building a flat positions
    // array on first iteration and three `SpatialKernel`s (one per
    // power+radius combo: temp, wind/cloud, precip). The kernels store
    // each cell's neighbor list + pure-distance weights; per-hour cost
    // collapses to O(cells × neighbors) instead of O(cells × all-samples).
    interface FlatPosition {
      x: number; y: number; elev: number;
      srcIdx: number; ptIdx: number;
      isStation: boolean;
      stationElev: number | null;
    }
    const positions: FlatPosition[] = [];
    for (let srcIdx = 0; srcIdx < this.sources.length; srcIdx++) {
      const src = this.sources[srcIdx];
      const ps0 = src.grid.points[0] ?? [];
      const { cols, rows, bounds: b } = src.grid;
      for (let j = 0; j < rows; j++) {
        const gridLat = b.latMin + (j / Math.max(1, rows - 1)) * (b.latMax - b.latMin);
        for (let i = 0; i < cols; i++) {
          const gridLng = b.lngMin + (i / Math.max(1, cols - 1)) * (b.lngMax - b.lngMin);
          const k = j * cols + i;
          const p: ForecastHourPoint | undefined = ps0[k];
          if (!p) continue;
          const lat = p.lat ?? gridLat;
          const lng = p.lng ?? gridLng;
          const stationElev = Number.isFinite(p.elev) ? (p.elev as number) : null;
          const elev = stationElev ?? (this.elevation ? this.elevation.sample(lng, lat) : 0);
          positions.push({
            x: lngToEquiX(lng), y: latToEquiY(lat), elev,
            srcIdx, ptIdx: k,
            isStation: stationElev != null,
            stationElev,
          });
        }
      }
    }
    const N = positions.length;
    const posXY = positions.map((p) => ({ x: p.x, y: p.y }));
    const elevArr = new Float32Array(N);
    for (let k = 0; k < N; k++) elevArr[k] = positions[k].elev;

    // Per-variable source-weight arrays (constant across hours, depend on
    // the source each position came from).
    const wTemp = new Float32Array(N);
    const wWind = new Float32Array(N);
    const wClouds = new Float32Array(N);
    const wPrecip = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const srcW = this.sources[positions[k].srcIdx].weights;
      wTemp[k]   = srcW.temperature   ?? 1;
      wWind[k]   = srcW.wind          ?? 1;
      wClouds[k] = srcW.clouds        ?? 1;
      wPrecip[k] = srcW.precipitation ?? 1;
    }

    // Three kernels for the three (radius, power) profiles.
    const kTemp: SpatialKernel = buildSpatialKernel(posXY, {
      cols: denseCols, rows: denseRows, uvBounds, radius: 0.12, power: 1.8,
    });
    const kWindCloud: SpatialKernel = buildSpatialKernel(posXY, {
      cols: denseCols, rows: denseRows, uvBounds, radius: 0.14, power: 1.6,
    });
    const kPrecip: SpatialKernel = buildSpatialKernel(posXY, {
      cols: denseCols, rows: denseRows, uvBounds, radius: 0.08, power: 2,
    });

    interface RawHour {
      timestamp: Date;
      uGrid: DenseGridResult;
      vGrid: DenseGridResult;
      tempGrid: DenseGridResult;
      clGrid: DenseGridResult;
      cmGrid: DenseGridResult;
      chGrid: DenseGridResult;
      pGrid: DenseGridResult;
      modelTag: string;
    }
    const rawHours: RawHour[] = [];

    // Reusable per-hour value buffers — re-filled each iteration.
    const vTemp = new Float32Array(N);
    const vU = new Float32Array(N);
    const vV = new Float32Array(N);
    const vCL = new Float32Array(N);
    const vCM = new Float32Array(N);
    const vCH = new Float32Array(N);
    const vP = new Float32Array(N);
    // Wind-Geschwindigkeit als Skalar (für die speed-erhaltende Vektor-Korrektur).
    const vSpeed = new Float32Array(N);

    for (let h = 0; h < maxHours; h++) {
      const timestamp = refTimes[h] ?? new Date(fetchedAt + h * 3600e3);
      const stationsTemp: PointSample[] = [];

      // Per-hour: just pull the values from each source's points[h][ptIdx].
      // Most of the per-hour cost — previously O(cells × samples) per
      // variable — now collapses to this single linear sweep.
      for (let k = 0; k < N; k++) {
        const pos = positions[k];
        const ps = this.sources[pos.srcIdx].grid.points[h];
        const p = ps ? ps[pos.ptIdx] : undefined;
        if (!p) {
          vTemp[k] = NaN; vU[k] = NaN; vV[k] = NaN;
          vCL[k] = NaN; vCM[k] = NaN; vCH[k] = NaN; vP[k] = NaN;
          continue;
        }
        vTemp[k] = (p.temperature   != null && Number.isFinite(p.temperature))   ? p.temperature   : NaN;
        vU[k]    = (p.u             != null && Number.isFinite(p.u))             ? p.u             : NaN;
        vV[k]    = (p.v             != null && Number.isFinite(p.v))             ? p.v             : NaN;
        vCL[k]   = (p.cloudLow      != null && Number.isFinite(p.cloudLow))      ? p.cloudLow      : NaN;
        vCM[k]   = (p.cloudMid      != null && Number.isFinite(p.cloudMid))      ? p.cloudMid      : NaN;
        vCH[k]   = (p.cloudHigh     != null && Number.isFinite(p.cloudHigh))     ? p.cloudHigh     : NaN;
        vP[k]    = (p.precipitation != null && Number.isFinite(p.precipitation)) ? p.precipitation : NaN;
        // Station-only sample list for lapse-rate regression.
        if (pos.isStation && pos.stationElev != null && Number.isFinite(vTemp[k])) {
          stationsTemp.push({ x: pos.x, y: pos.y, v: vTemp[k], w: 1, elev: pos.stationElev });
        }
      }
      // Pro-Sample-Windgeschwindigkeit (für die speed-erhaltende Korrektur unten).
      for (let k = 0; k < N; k++) {
        vSpeed[k] = (Number.isFinite(vU[k]) && Number.isFinite(vV[k]))
          ? Math.hypot(vU[k], vV[k]) : NaN;
      }

      const lapseRate = estimateLapseRate(stationsTemp, STANDARD_LAPSE_RATE_PER_M);
      if (typeof window !== 'undefined' && import.meta.env?.DEV) {
        const w = window as unknown as { __lapseRates?: number[] };
        if (h === 0) w.__lapseRates = [];
        w.__lapseRates?.push(lapseRate);
      }

      // Per-variable Gaussian-Sigma — in quick-mode we drop the blur for
      // every variable except temperature (visually most ramp-sensitive).
      // Saves ~ 6×N Gaussian passes per hour, ~ 200-400 ms total for a 6 h
      // Phase A. Wind and precip already get IDW power=2 so are naturally
      // crisper; clouds re-blur in their volumetric shader pass.
      const quick = this.cfg.quickMode === true;
      const sigT  = 1.0;
      const sigUV = quick ? 0 : 1.4;
      const sigC  = quick ? 0 : 1.6;
      const sigP  = quick ? 0 : 1.0;

      const tempGrid = applySpatialKernel(kTemp, vTemp, wTemp, elevArr, {
        barnesSigma: sigT,
        elevationCorrection: gridElevations
          ? { gridElevations, lapseRatePerM: lapseRate }
          : undefined,
      });
      const uGrid = applySpatialKernel(kWindCloud, vU, wWind, null, { barnesSigma: sigUV });
      const vGrid = applySpatialKernel(kWindCloud, vV, wWind, null, { barnesSigma: sigUV });
      // Speed-erhaltende Korrektur: komponentenweises IDW/Barnes-Glätten der
      // u/v-Vektoren löscht sich bei leicht variierender Richtung teilweise aus
      // → der Betrag (Windgeschwindigkeit) wird systematisch zu klein (gemessen
      // ~2× zu niedrig vs. Stationen). Die Geschwindigkeit wird daher separat
      // als Skalar interpoliert (mittelt ohne Auslöschung) und der geglättete
      // (u,v)-Vektor pro Zelle auf diesen Betrag re-skaliert — Richtung bleibt,
      // Speed wird realistisch.
      const speedGrid = applySpatialKernel(kWindCloud, vSpeed, wWind, null, { barnesSigma: sigUV });
      {
        const u = uGrid.values, v = vGrid.values, sp = speedGrid.values, spMask = speedGrid.mask;
        for (let k = 0; k < u.length; k++) {
          const mag = Math.hypot(u[k], v[k]);
          // Faktor auf 4× begrenzen: bei nahezu ausgelöschten Vektoren (starke
          // Richtungsscherung) ist die Richtung unzuverlässig — wir verstärken
          // dort nicht ins Unendliche, sondern korrigieren höchstens 4×.
          if (mag > 1e-2 && spMask[k] && Number.isFinite(sp[k])) {
            const f = Math.min(sp[k] / mag, 4);
            u[k] *= f; v[k] *= f;
          }
        }
      }
      const clGrid = applySpatialKernel(kWindCloud, vCL, wClouds, null, { barnesSigma: sigC });
      const cmGrid = applySpatialKernel(kWindCloud, vCM, wClouds, null, { barnesSigma: sigC });
      const chGrid = applySpatialKernel(kWindCloud, vCH, wClouds, null, { barnesSigma: sigC });
      const pGrid = applySpatialKernel(kPrecip, vP, wPrecip, null, { barnesSigma: sigP });

      rawHours.push({
        timestamp,
        uGrid, vGrid, tempGrid, clGrid, cmGrid, chGrid, pGrid,
        modelTag: this.sources.map((s) => s.grid.points[0]?.[0]?.model ?? '?').join('+'),
      });
    }

    // Temporal median filter on temperature and cloud cover across adjacent
    // hours. Catches the typical MOSMIX failure mode where one hour reports
    // a wildly off value while h±1 are correct (the model "ICON-EU
    // bias-correction wobble" between 6 h analysis runs). Applied IN-PLACE
    // on each hour's value arrays before PNG encoding. h=0 and the last
    // hour are passed through unchanged — the boundary samples don't have
    // two neighbours to median against, and h=0 is already the
    // observation-anchored truth.
    //
    // Skipped in quick-mode: only 6 hours and a coarser grid; median noise
    // from MOSMIX-wobble is sub-pixel at that resolution.
    if (this.cfg.quickMode !== true) {
      temporalMedian3(rawHours.map((r) => r.tempGrid.values));
      temporalMedian3(rawHours.map((r) => r.clGrid.values));
      temporalMedian3(rawHours.map((r) => r.cmGrid.values));
      temporalMedian3(rawHours.map((r) => r.chGrid.values));
    }

    // Now encode PNGs from the smoothed arrays.
    for (const rh of rawHours) {
      const { timestamp, uGrid, vGrid, tempGrid, clGrid, cmGrid, chGrid, pGrid, modelTag } = rh;
      const uMin = minOf(uGrid.values, -10);
      const uMax = maxOf(uGrid.values, 10);
      const vMin = minOf(vGrid.values, -10);
      const vMax = maxOf(vGrid.values, 10);
      const safeU = ensureRange(uMin, uMax);
      const safeV = ensureRange(vMin, vMax);

      const windImg = encodeWindPng(
        denseCols, denseRows, uGrid.values, vGrid.values, uGrid.mask,
        safeU.lo, safeU.hi, safeV.lo, safeV.hi,
      );
      // Temperature PNG carries the lapse-corrected cell value in R AND the
      // dense-cell DEM elevation in G. The fragment shader uses G to invert
      // back to the cell's sea-level temperature and re-apply per-pixel
      // DEM lapse — gives valley-vs-peak detail within one 6 km IDW cell.
      const tempImg = encodeScalarPng(
        denseCols, denseRows, tempGrid.values, tempGrid.mask,
        temperatureRange.min, temperatureRange.max,
        gridElevations ?? undefined,
      );
      const cloudImg = encodeCloudsPng(
        denseCols, denseRows, clGrid.values, cmGrid.values, chGrid.values, clGrid.mask,
      );
      const precipImg = encodeScalarPng(
        denseCols, denseRows, pGrid.values, pGrid.mask,
        precipitationRange.min, precipitationRange.max,
      );

      const wind: WindGridResult = {
        image: windImg, width: denseCols, height: denseRows,
        uMin: safeU.lo, uMax: safeU.hi, vMin: safeV.lo, vMax: safeV.hi,
        uvBounds, fetchedAt: timestamp.getTime(), model: 'fused',
      };
      const temperature: ScalarGridResult = {
        image: tempImg, width: denseCols, height: denseRows,
        vMin: temperatureRange.min, vMax: temperatureRange.max,
        uvBounds, fetchedAt: timestamp.getTime(), model: 'fused', variable: 'temperature_2m',
      };
      const clouds: CloudGridResult = {
        image: cloudImg, width: denseCols, height: denseRows,
        uvBounds, fetchedAt: timestamp.getTime(), model: 'fused',
        vMin: 0, vMax: 100,
      };
      const precipitation: ScalarGridResult = {
        image: precipImg, width: denseCols, height: denseRows,
        vMin: precipitationRange.min, vMax: precipitationRange.max,
        uvBounds, fetchedAt: timestamp.getTime(), model: 'fused', variable: 'precipitation',
      };

      hoursOut.push({
        timestamp,
        layers: { wind, temperature, clouds, precipitation },
        modelTag,
      });
    }

    // Build a single high-res DEM PNG covering the same uvBounds, attached to
    // the forecast result for the temperature layer's per-pixel refinement.
    // 384 × 256 over DACH = ≈ 4 km / pixel horizontally — fine enough for
    // alpine valley relief to show up at zoom levels 5-8.
    const DEM_MAX = 4500;
    let demImage: HTMLCanvasElement | undefined;
    if (this.elevation) {
      const demCols = 384;
      const demRows = 256;
      const demGrid = this.elevation.buildGrid(bounds, demCols, demRows);
      demImage = encodeDemPng(demCols, demRows, demGrid, DEM_MAX);
    }

    return {
      hours: hoursOut,
      fetchedAt,
      uvBounds,
      model: this.sources.length === 1
        ? this.sources[0].grid.points[0]?.[0]?.model ?? 'fused'
        : 'fused',
      demImage,
      demMax: DEM_MAX,
      // Lapse rate used per-pixel by the shader. We use the standard rate
      // here even though the engine estimates a per-hour rate above; the
      // visual lapse is what readers expect (≈ 0.65 °C / 100 m).
      lapseRatePerM: STANDARD_LAPSE_RATE_PER_M,
    };
  }
}

/**
 * In-place 3-point median filter along the temporal dimension. Each
 * `hourArrays[h]` is a flat per-cell value array of identical length; for
 * every cell index k we replace `hourArrays[h][k]` by median of
 * `hourArrays[h-1..h+1][k]` for 1 ≤ h < N−1. h=0 and h=N−1 are passed
 * through untouched (no two-sided neighbours, and h=0 is the obs-anchored
 * truth that shouldn't be smoothed against forecast neighbours).
 */
function temporalMedian3(hourArrays: Float32Array[]): void {
  const n = hourArrays.length;
  if (n < 3) return;
  const cells = hourArrays[0].length;
  // Snapshot the previous-hour values so the in-place write doesn't pollute
  // the next iteration's neighbour read.
  let prev = new Float32Array(hourArrays[0]);
  for (let h = 1; h < n - 1; h++) {
    const cur = hourArrays[h];
    const next = hourArrays[h + 1];
    const curSnap = new Float32Array(cur);
    for (let k = 0; k < cells; k++) {
      const a = prev[k];
      const b = curSnap[k];
      const c = next[k];
      // Only smooth where all three are finite — preserves NaN coverage.
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
      cur[k] = median3(a, b, c);
    }
    prev = curSnap;
  }
}

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

function minOf(arr: Float32Array, fallback: number): number {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v) && v < m) m = v;
  }
  return Number.isFinite(m) ? m : fallback;
}
function maxOf(arr: Float32Array, fallback: number): number {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v) && v > m) m = v;
  }
  return Number.isFinite(m) ? m : fallback;
}
function ensureRange(lo: number, hi: number): { lo: number; hi: number } {
  if (hi - lo < 0.5) {
    const c = (hi + lo) / 2;
    return { lo: c - 0.5, hi: c + 0.5 };
  }
  return { lo, hi };
}

// Canvas-only encode path. Returns the populated HTMLCanvasElement directly
// — WebGL's `texImage2D` and `createImageBitmap` both accept HTMLCanvasElement,
// so we skip the previous `canvas.toDataURL() → new Image()` round-trip that
// added ~20 ms per frame. With 24 hours × 4 layer-PNGs per forecast this
// previously cost ≈ 2 s; the direct-canvas path is essentially free.
function encodeDemPng(
  cols: number, rows: number, elev: Float32Array, demMax: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let k = 0; k < elev.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    const e = Math.max(0, Math.min(demMax, Number.isFinite(elev[k]) ? elev[k] : 0));
    img.data[idx] = clamp255((e / demMax) * 255);
    img.data[idx + 1] = 0;
    img.data[idx + 2] = 0;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function encodeWindPng(
  cols: number, rows: number,
  us: Float32Array, vs: Float32Array, mask: Uint8Array,
  uMin: number, uMax: number, vMin: number, vMax: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let k = 0; k < us.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    // dense grid j=0 is south (latMin), PNG y=0 is north → flip
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    const u = Number.isFinite(us[k]) ? us[k] : 0;
    const v = Number.isFinite(vs[k]) ? vs[k] : 0;
    img.data[idx] = clamp255(((u - uMin) / (uMax - uMin)) * 255);
    img.data[idx + 1] = clamp255(((v - vMin) / (vMax - vMin)) * 255);
    img.data[idx + 2] = 0;
    img.data[idx + 3] = mask[k];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function encodeScalarPng(
  cols: number, rows: number,
  values: Float32Array, mask: Uint8Array,
  vMin: number, vMax: number,
  /**
   * Optional secondary scalar to encode in the green channel. Used for
   * temperature: we encode the dense-grid cell's DEM elevation here so the
   * fragment shader can apply per-pixel lapse refinement using its DEM
   * texture. `gMax` is the value that maps to 255 (default 4500 m — covers
   * the highest alpine cell with headroom).
   */
  green?: Float32Array,
  gMax: number = 4500,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let k = 0; k < values.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    const v = Number.isFinite(values[k]) ? values[k] : vMin;
    const t = (v - vMin) / (vMax - vMin);
    img.data[idx] = clamp255(t * 255);
    img.data[idx + 1] = green ? clamp255((green[k] / gMax) * 255) : 0;
    img.data[idx + 2] = 0;
    img.data[idx + 3] = mask[k];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function encodeCloudsPng(
  cols: number, rows: number,
  low: Float32Array, mid: Float32Array, high: Float32Array, mask: Uint8Array,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let k = 0; k < low.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    img.data[idx] = clamp255(((Number.isFinite(low[k]) ? low[k] : 0) / 100) * 255);
    img.data[idx + 1] = clamp255(((Number.isFinite(mid[k]) ? mid[k] : 0) / 100) * 255);
    img.data[idx + 2] = clamp255(((Number.isFinite(high[k]) ? high[k] : 0) / 100) * 255);
    img.data[idx + 3] = mask[k];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function clamp255(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}
