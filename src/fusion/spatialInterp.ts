/**
 * Spatial interpolation: scattered (or sparse-grid) point samples
 * → dense regular grid suitable for GPU-texturing.
 *
 * We use a hybrid IDW (Inverse Distance Weighting, p=2) for the raw samples
 * followed by an optional Barnes-Gaussian smoothing pass. IDW preserves the
 * physical values at known points; Barnes removes the "spike" artefacts
 * around isolated stations and produces the smooth gradients that map
 * heatmap layers expect (compare Windy's temperature layer — continuous, no
 * isolated dots).
 */

/**
 * Estimate the effective lapse rate (°C/m) for the current weather situation
 * by least-squares regression of temperature against elevation. Returns
 * positive when air cools with altitude (normal), negative when air warms
 * with altitude (inversion — common in clear winter nights / valley fog).
 *
 * **Reliability shrinkage:** the raw OLS slope is only trustworthy when the
 * stations span a real altitude range AND the temperature falls cleanly with
 * height. When they don't — a modest spread with a noisy fit, e.g. mid-altitude
 * stations warm-biased to valley levels in a Mittelgebirge without a summit
 * station — the OLS slope flattens and would leave high points far too warm.
 * We therefore blend the OLS estimate toward the supplied prior (`fallback`,
 * typically the standard 0.0065) by a reliability factor α = α_spread · α_fit:
 * a well-supported clean alpine fit keeps its OLS rate (α≈1), a contaminated
 * shallow fit (R²≈0.37) is pulled almost fully back to the physical standard.
 *
 * Requires ≥ 5 samples with finite `elev`; otherwise returns the prior. Output
 * is clamped to [−0.008, +0.012] °C/m — wide enough for real inversions, tight
 * enough to keep one rogue station from destabilising the field.
 */
export function estimateLapseRate(samples: PointSample[], fallback: number): number {
  const valid = samples.filter(
    (s) => Number.isFinite(s.v) && s.elev != null && Number.isFinite(s.elev),
  );
  if (valid.length < 5) return fallback;

  const n = valid.length;
  let minE = Infinity, maxE = -Infinity;
  let sumE = 0, sumV = 0, sumEE = 0, sumEV = 0, sumVV = 0;
  for (const s of valid) {
    const e = s.elev as number;
    const v = s.v;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    sumE += e; sumV += v; sumEE += e * e; sumEV += e * v; sumVV += v * v;
  }
  const spread = maxE - minE;
  const meanE = sumE / n;
  const meanV = sumV / n;
  const denom = sumEE - n * meanE * meanE;        // n · Var(E)
  if (spread < 1 || Math.abs(denom) < 1e-6) return fallback;

  const cov = sumEV - n * meanE * meanV;
  const lapseOLS = -(cov / denom);                // positiv = T fällt mit Höhe
  // Bestimmtheitsmaß R²: wie eng T linear an der Höhe hängt.
  const ssTot = sumVV - n * meanV * meanV;        // n · Var(V)
  const r2 = ssTot > 1e-9 ? (cov * cov) / (denom * ssTot) : 0;

  // Reliabilitäts-Shrinkage zum Prior. Beide Bedingungen nötig: ausreichende
  // Höhenspanne UND enger Fit. Sonst dominiert der physikalische Standard.
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const aSpread = clamp01((spread - 300) / 700);  // 300 m → 0, 1000 m → 1
  const aFit = clamp01((r2 - 0.3) / 0.5);         // R² < 0,3 → 0, R² > 0,8 → 1
  const alpha = aSpread * aFit;
  const lapse = alpha * lapseOLS + (1 - alpha) * fallback;
  return Math.max(-0.008, Math.min(0.012, lapse));
}

// ---------------------------------------------------------------------------
// Verifikation der Lapse-Shrinkage — exakte/banded Erwartungswerte.
// ---------------------------------------------------------------------------
export interface LapseCheck { name: string; expected: string; got: number; ok: boolean }
export interface LapseVerifyResult { checks: LapseCheck[]; passed: number; failed: number }

export function verifyLapseShrinkage(): LapseVerifyResult {
  const checks: LapseCheck[] = [];
  const PRIOR = 0.0065;
  const S = (elev: number, v: number): PointSample => ({ x: 0, y: 0, v, elev });
  const push = (name: string, expected: string, got: number, ok: boolean) =>
    checks.push({ name, expected, got: Math.round(got * 100000) / 100000, ok });

  // 1) Sauberer, steiler Alpen-Fit (Spread 2000 m, R²=1) → OLS bleibt (~0,009).
  let r = estimateLapseRate(
    [400, 900, 1400, 1900, 2400].map((e) => S(e, 28 - e * 0.009)), PRIOR);
  push('Sauberer Steil-Fit → OLS erhalten (~0,009)', '0.0088–0.0092', r, r >= 0.0088 && r <= 0.0092);

  // 2) Kontaminiert-flach (Mittelgebirge, R² niedrig) → Richtung Prior gezogen.
  r = estimateLapseRate(
    [S(200, 30), S(360, 30.7), S(700, 30), S(800, 26.5), S(820, 30.4), S(1200, 29)], PRIOR);
  push('Kontaminiert-flacher Fit → ~Prior (≥0,0055)', '0.0055–0.0072', r, r >= 0.0055 && r <= 0.0072);

  // 3) Zu kleine Höhenspanne (300 m) → α_spread=0 → exakt Prior.
  r = estimateLapseRate([300, 380, 450, 520, 600].map((e) => S(e, 20 - e * 0.004)), PRIOR);
  push('Spread ≤ 300 m → exakt Prior', '0.0065', r, Math.abs(r - PRIOR) < 1e-9);

  // 4) < 5 Stationen → Prior.
  r = estimateLapseRate([S(300, 25), S(900, 19), S(1500, 13), S(2100, 7)], PRIOR);
  push('< 5 Stationen → Prior', '0.0065', r, Math.abs(r - PRIOR) < 1e-9);

  // 5) Echte Inversion (sauber, Spread 2000 m, R²=1) → bleibt negativ erhalten.
  r = estimateLapseRate(
    [400, 900, 1400, 1900, 2400].map((e) => S(e, 10 + e * 0.005)), PRIOR);
  push('Saubere Inversion → negativ erhalten', '-0.006…-0.004', r, r < 0 && r >= -0.006 && r <= -0.004);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyLapseShrinkage: typeof verifyLapseShrinkage })
    .__verifyLapseShrinkage = verifyLapseShrinkage;
}

export interface PointSample {
  /** Equirectangular x in [0,1] (computed from lng). */
  x: number;
  /** Equirectangular y in [0,1] (computed from lat). */
  y: number;
  /** Sample value (NaN = missing). */
  v: number;
  /** Relative weight 0..1 (e.g. station confidence). Default 1. */
  w?: number;
  /** Elevation in metres (for elevation-aware IDW; ignored otherwise). */
  elev?: number;
}

export interface DenseGridResult {
  cols: number;
  rows: number;
  /** Row-major float values, length cols*rows. */
  values: Float32Array;
  /** Coverage mask 0..255 — 0 = no nearby data, 255 = strong coverage. */
  mask: Uint8Array;
}

/**
 * Precomputed neighbor list + distance-weights for a fixed dense grid and
 * fixed sample positions. Built once with `buildSpatialKernel`; reused for
 * each forecast hour by `applySpatialKernel` with per-hour value+source-
 * weight arrays. Since the source POSITIONS don't change between hours,
 * factoring this out collapses the dominant `cells × samples` work to a
 * one-time setup cost.
 */
export interface SpatialKernel {
  cols: number;
  rows: number;
  uvBounds: [number, number, number, number];
  radius2: number;
  /** Per-cell start offset into `neighbors` / `distWeights`. Length cells+1. */
  offsets: Int32Array;
  /** Flat list of sample indices per cell. */
  neighbors: Int32Array;
  /** Matching pure-distance weight = 1/(d² + eps)^(power/2). Source-weights
   *  (which differ per variable) get multiplied in during `applySpatialKernel`. */
  distWeights: Float32Array;
}

/**
 * Build a `SpatialKernel` for the given sample positions and dense grid.
 * Sample-specific source weight (s.w) is NOT baked in — it gets multiplied
 * per variable at apply time. The `power` and `radius` parameters define
 * the IDW shape; produce one kernel per (power, radius) combination you
 * intend to use across variables.
 */
export function buildSpatialKernel(
  samples: { x: number; y: number }[],
  opts: { cols: number; rows: number; uvBounds: [number, number, number, number]; power?: number; radius?: number },
): SpatialKernel {
  const { cols, rows, uvBounds } = opts;
  const power = opts.power ?? 2;
  const radius = opts.radius ?? 0.18;
  const radius2 = radius * radius;
  const [x0, , x1, y1] = uvBounds;
  const dx = (x1 - x0) / Math.max(1, cols - 1);
  const y0 = uvBounds[1];
  const dy = (y1 - y0) / Math.max(1, rows - 1);
  const n = cols * rows;

  // Two-pass to avoid dynamic arrays. Pass 1: count neighbors per cell.
  const counts = new Int32Array(n);
  for (let j = 0; j < rows; j++) {
    const gy = y1 - j * dy;
    for (let i = 0; i < cols; i++) {
      const gx = x0 + i * dx;
      let c = 0;
      for (let k = 0; k < samples.length; k++) {
        const s = samples[k];
        const ddx = s.x - gx;
        const ddy = s.y - gy;
        if (ddx * ddx + ddy * ddy <= radius2) c++;
      }
      counts[j * cols + i] = c;
    }
  }
  // Pass 2: build flat offsets + neighbor/dist arrays.
  const offsets = new Int32Array(n + 1);
  let total = 0;
  for (let c = 0; c < n; c++) { offsets[c] = total; total += counts[c]; }
  offsets[n] = total;
  const neighbors = new Int32Array(total);
  const distWeights = new Float32Array(total);
  const writePos = new Int32Array(n);   // cursor per cell
  for (let j = 0; j < rows; j++) {
    const gy = y1 - j * dy;
    for (let i = 0; i < cols; i++) {
      const cellIdx = j * cols + i;
      const gx = x0 + i * dx;
      let cursor = offsets[cellIdx];
      for (let k = 0; k < samples.length; k++) {
        const s = samples[k];
        const ddx = s.x - gx;
        const ddy = s.y - gy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > radius2) continue;
        neighbors[cursor] = k;
        distWeights[cursor] = 1 / Math.pow(d2 + 1e-8, power / 2);
        cursor++;
      }
      writePos[cellIdx] = cursor;
    }
  }
  void writePos;
  return { cols, rows, uvBounds, radius2, offsets, neighbors, distWeights };
}

/**
 * Apply a precomputed kernel with per-hour value + source-weight arrays.
 * Equivalent to `interpolateGrid` for samples at the kernel's positions,
 * but reuses the dist-weight table so per-hour cost is O(cells × neighbors)
 * instead of O(cells × all-samples).
 */

// Module-level scratch buffer for the sea-level-reduced value array.
// applySpatialKernel runs ~ 168 times per fusion, each allocating a fresh
// Float32Array of the sample-count length. Caching across calls drops the
// GC pressure to zero and shaves measurable ms off Phase B.
let _reducedScratch: Float32Array | null = null;
function getReducedBuffer(n: number): Float32Array {
  if (!_reducedScratch || _reducedScratch.length < n) {
    _reducedScratch = new Float32Array(n);
  }
  return _reducedScratch;
}

export function applySpatialKernel(
  kernel: SpatialKernel,
  /** Sample values (NaN allowed). Length = positions count. */
  values: Float32Array,
  /** Sample source-weights. Length = positions count. */
  sourceWeights: Float32Array,
  /** Sample elevations in metres (for MSL reduction). null → no correction. */
  sampleElev: Float32Array | null,
  opts: {
    barnesSigma?: number;
    elevationCorrection?: {
      gridElevations: Float32Array;
      lapseRatePerM: number;
    };
  } = {},
): DenseGridResult {
  const { cols, rows, offsets, neighbors, distWeights, radius2 } = kernel;
  const barnesSigma = opts.barnesSigma ?? 0;
  const elev = opts.elevationCorrection;
  const n = cols * rows;
  const out = new Float32Array(n);
  const mask = new Uint8Array(n);

  // Reduce values to MSL once per call (positions / elevations are constant).
  // Use a module-level scratch buffer instead of allocating a fresh
  // Float32Array per call — applySpatialKernel runs 168× per fusion (24 h
  // × 7 variables) and the GC pressure adds up to ~ 400 kB / run otherwise.
  // Sequential execution lets us reuse the pool safely.
  let reducedVals: Float32Array = values;
  if (elev && sampleElev) {
    reducedVals = getReducedBuffer(values.length);
    for (let k = 0; k < values.length; k++) {
      reducedVals[k] = values[k] + sampleElev[k] * elev.lapseRatePerM;
    }
  }

  // Inner-loop hot path. We use the typed-array-friendly NaN check
  // `v !== v` (NaN is the only IEEE value that isn't equal to itself) —
  // for a Float32Array source it's 3-4× faster than `Number.isFinite(v)`
  // because it skips the boxing call. radius2*4 is folded into `maskScale`.
  const maskScale = radius2 * 4 * 255;
  const lapseCell = elev?.lapseRatePerM ?? 0;
  const gridEl = elev?.gridElevations;
  for (let c = 0; c < n; c++) {
    const start = offsets[c];
    const end = offsets[c + 1];
    let wsum = 0;
    let vsum = 0;
    let maxW = 0;
    for (let p = start; p < end; p++) {
      const sIdx = neighbors[p];
      const v = reducedVals[sIdx];
      if (v !== v) continue;           // NaN-skip without function-call overhead
      const w = distWeights[p] * sourceWeights[sIdx];
      wsum += w;
      vsum += w * v;
      if (w > maxW) maxW = w;
    }
    if (wsum > 0) {
      let val = vsum / wsum;
      if (gridEl) val -= gridEl[c] * lapseCell;
      out[c] = val;
      const ms = maxW * maskScale;
      mask[c] = ms >= 255 ? 255 : (ms < 0.5 ? 0 : (ms + 0.5) | 0);
    } else {
      out[c] = NaN;
      // mask[c] already 0 from Uint8Array init
    }
  }

  if (barnesSigma > 0) gaussianBlur(out, mask, cols, rows, barnesSigma);
  // Skip the (~6× dilation) NaN-backfill pass when there's nothing to fill —
  // typical for the temperature kernel where the dense DACH grid is fully
  // covered. Saves ≈ 10 ms per call which adds up over 24 hours × 7 vars.
  if (hasNaN(out)) fillNaNFromNeighbors(out, cols, rows);
  return { cols, rows, values: out, mask };
}

function hasNaN(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) if (arr[i] !== arr[i]) return true;
  return false;
}

export interface InterpolateOptions {
  /** Dense output cols. */
  cols: number;
  /** Dense output rows. */
  rows: number;
  /** UV bounds [x0,y0,x1,y1] in equirect [0,1]² that the grid covers. */
  uvBounds: [number, number, number, number];
  /** IDW power. Default 2. */
  power?: number;
  /**
   * Search radius in equirect units (1 unit = 360° lon). Beyond this radius
   * a sample contributes nothing. Default 0.18 (~65° around DACH center).
   */
  radius?: number;
  /** Barnes smoothing sigma in pixels (0 = disabled). Default 1.2. */
  barnesSigma?: number;
  /**
   * Optional elevation correction for variables that vary with altitude
   * (temperature). Samples are reduced to sea-level equivalent via
   * `v_sl = v + elev · lapseRate` (sample `elev` must be set) before IDW;
   * each dense-grid cell then has the lapse rate re-applied with its own
   * DEM elevation from `gridElevations`. Result: realistic alpine cooling
   * without needing topography in the underlying NWP.
   */
  elevationCorrection?: {
    /** Elevation in metres per dense cell (length cols·rows, row-major). */
    gridElevations: Float32Array;
    /** Lapse rate °C / m. Use STANDARD_LAPSE_RATE_PER_M (0.0065) for temp. */
    lapseRatePerM: number;
  };
}

/**
 * Build a dense regular grid from scattered samples using IDW.
 * Returns NaN-filled values + mask=0 where no sample is close enough.
 */
export function interpolateGrid(
  samples: PointSample[],
  opts: InterpolateOptions,
): DenseGridResult {
  const { cols, rows, uvBounds, barnesSigma = 1.2 } = opts;
  const power = opts.power ?? 2;
  const radius = opts.radius ?? 0.18;
  const radius2 = radius * radius;
  const [x0, y0, x1, y1] = uvBounds;
  const dx = (x1 - x0) / Math.max(1, cols - 1);
  const dy = (y1 - y0) / Math.max(1, rows - 1);

  const values = new Float32Array(cols * rows);
  const mask = new Uint8Array(cols * rows);

  // Elevation correction: produce a reduced-to-sea-level value array
  // (so that IDW interpolates a spatially smoother field) and re-apply the
  // lapse rate per grid cell once IDW is done.
  const elev = opts.elevationCorrection;
  const reduced = elev
    ? samples.map((s) => ({ ...s, v: s.v + (s.elev ?? 0) * elev.lapseRatePerM }))
    : samples;

  const validSamples = reduced.filter((s) => Number.isFinite(s.v));
  if (!validSamples.length) {
    values.fill(NaN);
    return { cols, rows, values, mask };
  }

  // j=0 corresponds to SOUTH (latMin) so the row indexing matches
  // `elevation.buildGrid` exactly. This is critical for the per-cell lapse
  // re-application: the gridElevations[idx] read below must come from the
  // SAME geographic location as the IDW result stored at values[idx].
  // Previously j=0 was NORTH while buildGrid used j=0 = SOUTH, so the
  // elevation correction was being applied with the elevation from the
  // mirrored-latitude row — Hamburg cells got subtracted alpine elevation
  // and Munich cells got subtracted near-sea-level elevation, plus the
  // PNG-encoder's `y = rows-1-j` flip then swapped the resulting cell
  // values north↔south on display. Net effect: Hamburg label showed
  // Munich's cell temp and vice versa.
  for (let j = 0; j < rows; j++) {
    const gy = y1 - j * dy;
    for (let i = 0; i < cols; i++) {
      const gx = x0 + i * dx;
      let wsum = 0;
      let vsum = 0;
      let maxW = 0;
      for (const s of validSamples) {
        const ddx = s.x - gx;
        const ddy = s.y - gy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > radius2) continue;
        // IDW with epsilon to avoid div-by-zero at exact match
        const w = (s.w ?? 1) / Math.pow(d2 + 1e-8, power / 2);
        wsum += w;
        vsum += w * s.v;
        if (w > maxW) maxW = w;
      }
      const idx = j * cols + i;
      if (wsum > 0) {
        let val = vsum / wsum;
        // Re-apply lapse rate with this cell's actual DEM elevation
        if (elev) val -= elev.gridElevations[idx] * elev.lapseRatePerM;
        values[idx] = val;
        // Mask = how "confident" we are at this grid cell. Strong (255) when
        // at least one sample is very close; falls off with distance.
        const m = Math.min(1, maxW * radius2 * 4);
        mask[idx] = Math.round(m * 255);
      } else {
        values[idx] = NaN;
        mask[idx] = 0;
      }
    }
  }

  if (barnesSigma > 0) gaussianBlur(values, mask, cols, rows, barnesSigma);
  // NaN cells still carry the coldest possible color through bilinear sampling
  // in the shader (raw.a >= 0.05 is enough to pass the discard). Backfill them
  // with the nearest-neighbor value so the heatmap stays color-coherent even
  // outside the data-coverage region. Mask stays 0 there — the shader will
  // still discard those texels at runtime.
  fillNaNFromNeighbors(values, cols, rows);
  return { cols, rows, values, mask };
}

/**
 * Replace NaN values in-place with the average of the nearest finite
 * neighbours via iterative 3×3 dilation. Mask is not touched.
 */
function fillNaNFromNeighbors(values: Float32Array, cols: number, rows: number): void {
  const tmp = new Float32Array(values.length);
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        const v = values[idx];
        if (v === v) {                      // not-NaN fast path
          tmp[idx] = v;
          continue;
        }
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= rows) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= cols) continue;
            const nv = values[jj * cols + ii];
            if (nv === nv) {                 // not-NaN
              sum += nv;
              count++;
            }
          }
        }
        if (count > 0) {
          tmp[idx] = sum / count;
          changed = true;
        } else {
          tmp[idx] = NaN;
        }
      }
    }
    values.set(tmp);
    if (!changed) break;
  }
  for (let k = 0; k < values.length; k++) {
    if (values[k] !== values[k]) values[k] = 0;
  }
}

/**
 * Separable Gaussian blur on a 2D grid that respects NaN values
 * (treats them as "no data" — they don't contribute to neighbours but
 * neighbours can fill in NaN cells).
 */
export function gaussianBlur(
  values: Float32Array,
  mask: Uint8Array,
  cols: number,
  rows: number,
  sigma: number,
): void {
  const r = Math.max(1, Math.ceil(sigma * 2));
  const kernel = new Float32Array(2 * r + 1);
  let ksum = 0;
  for (let k = -r; k <= r; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + r] = w;
    ksum += w;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= ksum;

  const tmp = new Float32Array(cols * rows);
  const tmpMask = new Uint8Array(cols * rows);

  // Horizontal pass
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let acc = 0;
      let wacc = 0;
      let mAcc = 0;
      for (let k = -r; k <= r; k++) {
        const ii = i + k;
        if (ii < 0 || ii >= cols) continue;
        const idx = j * cols + ii;
        const v = values[idx];
        if (!Number.isFinite(v)) continue;
        const kw = kernel[k + r];
        acc += kw * v;
        wacc += kw;
        if (mask[idx] > mAcc) mAcc = mask[idx];
      }
      const o = j * cols + i;
      tmp[o] = wacc > 0 ? acc / wacc : NaN;
      tmpMask[o] = mAcc;
    }
  }
  // Vertical pass
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let acc = 0;
      let wacc = 0;
      let mAcc = 0;
      for (let k = -r; k <= r; k++) {
        const jj = j + k;
        if (jj < 0 || jj >= rows) continue;
        const idx = jj * cols + i;
        const v = tmp[idx];
        if (!Number.isFinite(v)) continue;
        const kw = kernel[k + r];
        acc += kw * v;
        wacc += kw;
        if (tmpMask[idx] > mAcc) mAcc = tmpMask[idx];
      }
      const o = j * cols + i;
      values[o] = wacc > 0 ? acc / wacc : NaN;
      mask[o] = mAcc;
    }
  }
}
