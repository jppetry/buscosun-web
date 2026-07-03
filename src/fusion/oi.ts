/**
 * Local Optimal Interpolation (OI) — the minimum-variance analysis core of
 * fusion engine v2. Implements the paper's estimation equations:
 *
 *   (3)  x_a = x_b + K (y − H x_b),   K = B Hᵀ (H B Hᵀ + R)⁻¹
 *   (7)  H(x)|s = x(x_s) + γ̂ (z_grid(x_s) − z_s)     (elevation-aware operator)
 *   (8)  d²_ij = ‖x_i − x_j‖² / L_h² + (z_i − z_j)² / L_v²   (anisotropic metric)
 *
 * with the second-order auto-regressive (SOAR) correlation ρ(d) = (1+d) e^{−d}
 * (paper Sect. 3.4). This module is deliberately dependency-free (no Vite/DOM
 * globals) so the Node `--experimental-strip-types` verification harness can
 * import it directly, matching the `scripts/verify-aec.mjs` precedent.
 *
 * ── Why this is as cheap per-hour as the IDW kernel it replaces ──────────────
 * Station POSITIONS are constant across forecast hours (paper Sect. 4, identity
 * (i)). Everything in the analysis except the innovation vector `d` depends only
 * on positions: the per-cell neighbour set, the k×k covariance C = HBHᵀ+R, and
 * hence the OI weight vector w_c = C⁻¹ ρ_c. We therefore factor the linear
 * algebra out into a one-time `buildOiKernel` (one k×k Cholesky per cell) and
 * reduce `applyOiKernel` — run once per hour — to a dot product Σ w_ci d_i, i.e.
 * O(cells × k), the same per-hour complexity as `applySpatialKernel`. The
 * analysis-error variance ratio σ_a²/σ_b² = 1 − ρ_cᵀ C⁻¹ ρ_c (eq. 15) is
 * likewise position-only and precomputed here for Phase 5.
 *
 * The result is a linear smoother identical in *shape* to the existing CSR
 * kernel (per-cell neighbour list + weights), but with weights *derived* from
 * an explicit error model rather than *imposed* as inverse-distance powers —
 * exactly the paper's thesis (Sect. 3.1).
 */

/** Standard gravity-free lapse prior, °C/m — mirrors elevation.ts. */
export const OI_STANDARD_LAPSE_PER_M = 0.0065;

/** DACH reference latitude for the local equirect→km planar projection. */
const REF_LAT_DEG = 50.5;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_AT_REF = 111.320 * Math.cos((REF_LAT_DEG * Math.PI) / 180);

/** Equirect x∈[0,1] (= (lng+180)/360) → local kilometres east of a reference. */
function equiXToKm(x: number): number {
  const lng = x * 360 - 180;
  return lng * KM_PER_DEG_LNG_AT_REF;
}
/** Equirect y∈[0,1] (= (90−lat)/180) → local kilometres north of a reference. */
function equiYToKm(y: number): number {
  const lat = 90 - y * 180;
  return lat * KM_PER_DEG_LAT;
}

/** SOAR / second-order auto-regressive correlation, ρ(d) = (1+d) e^{−d}. */
export function soarCorrelation(d: number): number {
  return (1 + d) * Math.exp(-d);
}

/**
 * Public wrapper around the anisotropic metric (8) taking equirect (x,y) inputs
 * and applying the same local-km projection the kernel uses internally.
 * Exposed for the verification harness so closed-form expectations use the
 * identical distance definition (no duplicated constants that could drift).
 */
export function oiMetricDist2(
  ax: number, ay: number, aElev: number,
  bx: number, by: number, bElev: number,
  lhKm: number, lvM: number,
): number {
  return metricDist2(
    equiXToKm(ax), equiYToKm(ay), aElev,
    equiXToKm(bx), equiYToKm(by), bElev,
    lhKm, lvM,
  );
}

/** One observation feeding the analysis (a live station at h=0, typically). */
export interface OiObservation {
  /** Equirect x in [0,1]. */
  x: number;
  /** Equirect y in [0,1]. */
  y: number;
  /** Elevation in metres (station altitude). */
  elev: number;
  /**
   * Observation-error variance ratio r = σ_o² / σ_b² for this obs's network.
   * This is the *only* place the station-vs-model weight lives — it replaces
   * the heuristic "station weight 5, model weight 1.4" with its estimable
   * counterpart (paper eq. 9 / Desroziers). Smaller r ⇒ obs trusted more.
   */
  obsVarRatio: number;
}

export interface OiParams {
  /** Horizontal length scale L_h in kilometres (paper: 40–80 km). */
  lhKm: number;
  /** Vertical length scale L_v in metres (paper: 300–800 m). */
  lvM: number;
  /** Max neighbours per cell, k ≤ 32 (paper Sect. 3.4). */
  kMax: number;
  /**
   * Diagonal jitter added to C before factorisation for float32→float64
   * conditioning safety (paper allows this stabilisation, our Rule 8). As a
   * fraction of the diagonal; 0 disables. Default small.
   */
  jitter?: number;
}

export const DEFAULT_OI_PARAMS: OiParams = {
  lhKm: 60,
  lvM: 500,
  // k=16 (well within the paper's k≤32 localisation bound). The SOAR
  // correlation ρ(d)=(1+d)e^{−d} decays fast, so beyond ~16 neighbours under
  // metric (8) the OI weights are negligible; halving k from 24→16 cuts the
  // one-time per-cell Cholesky (O(k³)) ~3.4× with no material change to the
  // analysis, and keeps the cold-run perf comfortably inside the 1.5× budget.
  kMax: 16,
  jitter: 1e-6,
};

/** Dense grid the analysis is produced on. */
export interface OiGridSpec {
  cols: number;
  rows: number;
  uvBounds: [number, number, number, number];
  /** Per-cell DEM elevation, metres, row-major j*cols+i (j=0 → south). */
  cellElev: Float32Array;
}

/**
 * Precomputed per-cell OI smoother. CSR-style, mirroring `SpatialKernel`:
 * `offsets[c]..offsets[c+1]` indexes into `neighbors` (obs indices) and
 * `weights` (the OI weight vector w_c = C⁻¹ ρ_c for that cell).
 */
export interface OiKernel {
  cols: number;
  rows: number;
  /** CSR row pointer, length cells+1. */
  offsets: Int32Array;
  /** Flat obs indices per cell. */
  neighbors: Int32Array;
  /** Matching OI weights (increment = Σ weights·innovation). */
  weights: Float32Array;
  /** Max grid↔obs correlation per cell (drives the coverage mask). */
  maxCorr: Float32Array;
  /** Analysis-error variance ratio σ_a²/σ_b² per cell = 1 − ρ_cᵀ C⁻¹ ρ_c (eq. 15). */
  varRatio: Float32Array;
  /** Number of observations the kernel was built from. */
  obsCount: number;
}

/**
 * Distance² between two (equirect x,y, elev) points under the anisotropic
 * metric (8). Horizontal part is a local planar km projection (valid for the
 * small DACH window); vertical part in metres. `lv` may be contracted for
 * diagnosed inversions before calling (paper: L_v halved when γ̂<0).
 */
function metricDist2(
  xkmA: number, ykmA: number, elevA: number,
  xkmB: number, ykmB: number, elevB: number,
  lhKm: number, lvM: number,
): number {
  const dxh = (xkmA - xkmB) / lhKm;
  const dyh = (ykmA - ykmB) / lhKm;
  const dz = (elevA - elevB) / lvM;
  return dxh * dxh + dyh * dyh + dz * dz;
}

/**
 * In-place Cholesky factorisation of a symmetric positive-definite k×k matrix
 * `A` (row-major, length k*k), computed in float64. Writes the lower triangle
 * L such that A = L Lᵀ into `L` (length k*k, lower triangle populated, upper
 * left as-is/ignored). Returns false if a non-positive pivot is hit (caller
 * should have added jitter). ~30 lines, hand-written per Rule 5.
 */
export function choleskyFactor(A: Float64Array, k: number, L: Float64Array): boolean {
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * k + j];
      for (let p = 0; p < j; p++) sum -= L[i * k + p] * L[j * k + p];
      if (i === j) {
        if (sum <= 0) return false;      // not positive-definite → needs jitter
        L[i * k + j] = Math.sqrt(sum);
      } else {
        L[i * k + j] = sum / L[j * k + j];
      }
    }
  }
  return true;
}

/**
 * Solve L Lᵀ w = b for w, given the Cholesky factor L (lower triangle,
 * row-major k*k). Forward then back substitution, float64.
 */
export function choleskySolve(L: Float64Array, k: number, b: Float64Array, w: Float64Array): void {
  // Forward: L y = b
  for (let i = 0; i < k; i++) {
    let sum = b[i];
    for (let p = 0; p < i; p++) sum -= L[i * k + p] * w[p];
    w[i] = sum / L[i * k + i];
  }
  // Back: Lᵀ w = y
  for (let i = k - 1; i >= 0; i--) {
    let sum = w[i];
    for (let p = i + 1; p < k; p++) sum -= L[p * k + i] * w[p];
    w[i] = sum / L[i * k + i];
  }
}

/**
 * Build the local-OI smoother for a fixed set of observations and dense grid.
 * One k×k Cholesky solve per cell; the result reuses across all forecast hours.
 *
 * `inversion` (γ̂ < 0 diagnosed) halves L_v per the paper (stronger vertical
 * decoupling of the boundary layer, Frei 2014).
 */
export function buildOiKernel(
  obs: OiObservation[],
  grid: OiGridSpec,
  params: OiParams = DEFAULT_OI_PARAMS,
  inversion = false,
): OiKernel {
  const { cols, rows, uvBounds, cellElev } = grid;
  const { lhKm, kMax, jitter = 0 } = params;
  const lvM = inversion ? params.lvM * 0.5 : params.lvM;
  const nCells = cols * rows;
  const p = obs.length;
  const k = Math.min(kMax, p);

  // Precompute obs positions in km + their variance ratios.
  const oxKm = new Float64Array(p);
  const oyKm = new Float64Array(p);
  const oElev = new Float64Array(p);
  const oR = new Float64Array(p);
  for (let i = 0; i < p; i++) {
    oxKm[i] = equiXToKm(obs[i].x);
    oyKm[i] = equiYToKm(obs[i].y);
    oElev[i] = obs[i].elev;
    oR[i] = obs[i].obsVarRatio;
  }

  const [x0, y0, x1, y1] = uvBounds;
  const dx = (x1 - x0) / Math.max(1, cols - 1);
  const dy = (y1 - y0) / Math.max(1, rows - 1);

  // CSR output (each cell contributes exactly min(k, p) neighbours — dense per
  // cell but bounded by k, so total = nCells*k worst case).
  const offsets = new Int32Array(nCells + 1);
  const neighbors = new Int32Array(nCells * k);
  const weights = new Float32Array(nCells * k);
  const maxCorr = new Float32Array(nCells);
  const varRatio = new Float32Array(nCells);

  // Scratch reused across cells (no per-cell allocation in the hot loop).
  const idx = new Int32Array(p);           // candidate obs indices
  const cand = new Float64Array(p);        // candidate metric-dist² (parallel)
  const nn = new Int32Array(k);            // chosen neighbour obs indices
  const C = new Float64Array(k * k);       // HBHᵀ+R (normalised by σ_b²)
  const L = new Float64Array(k * k);       // Cholesky factor
  const rhoC = new Float64Array(k);        // grid↔obs correlations ρ_c
  const wvec = new Float64Array(k);        // C⁻¹ ρ_c

  let cursor = 0;
  for (let c = 0; c < nCells; c++) {
    offsets[c] = cursor;
    if (k === 0) { varRatio[c] = 1; continue; }

    const ci = c % cols;
    const cj = (c - ci) / cols;
    const gx = x0 + ci * dx;
    const gy = y1 - cj * dy;   // j=0 is south (latMin) → gy = y1 at cj=0 (see spatialInterp note)
    const gxKm = equiXToKm(gx);
    const gyKm = equiYToKm(gy);
    const gElev = cellElev[c];

    // k-nearest obs under metric (8): compute all dist², partial-select k.
    for (let i = 0; i < p; i++) {
      idx[i] = i;
      cand[i] = metricDist2(gxKm, gyKm, gElev, oxKm[i], oyKm[i], oElev[i], lhKm, lvM);
    }
    // Partial selection sort for the k smallest (k is tiny; p is the station
    // count — this is O(p·k), same order as the existing kernel's neighbour scan).
    const kk = k;
    for (let a = 0; a < kk; a++) {
      let best = a;
      for (let b = a + 1; b < p; b++) if (cand[b] < cand[best]) best = b;
      if (best !== a) {
        const td = cand[a]; cand[a] = cand[best]; cand[best] = td;
        const ti = idx[a]; idx[a] = idx[best]; idx[best] = ti;
      }
      nn[a] = idx[a];
    }

    // Assemble C = ρ_obs + diag(r) and ρ_c. C is HBHᵀ+R divided by σ_b², so
    // the increment ρ_cᵀ C⁻¹ d is independent of σ_b² — only the signal-to-
    // noise ratio r matters (paper: the estimable w ∝ 1/σ² replaces the
    // heuristic station/model weights).
    let cellMaxCorr = 0;
    for (let a = 0; a < kk; a++) {
      const ia = nn[a];
      const rc = soarCorrelation(Math.sqrt(cand[a] < 0 ? 0 : cand[a]));
      rhoC[a] = rc;
      if (rc > cellMaxCorr) cellMaxCorr = rc;
      C[a * kk + a] = 1 + oR[ia] + jitter;   // ρ(0)=1, plus obs noise, plus jitter
      for (let b = a + 1; b < kk; b++) {
        const ib = nn[b];
        const d2 = metricDist2(
          oxKm[ia], oyKm[ia], oElev[ia],
          oxKm[ib], oyKm[ib], oElev[ib],
          lhKm, lvM,
        );
        const cc = soarCorrelation(Math.sqrt(d2 < 0 ? 0 : d2));
        C[a * kk + b] = cc;
        C[b * kk + a] = cc;
      }
    }
    maxCorr[c] = cellMaxCorr;

    // Factor + solve C w = ρ_c. Retry once with heavier jitter if the SPD
    // check trips (near-duplicate stations under the metric).
    let ok = choleskyFactor(C, kk, L);
    if (!ok) {
      for (let a = 0; a < kk; a++) C[a * kk + a] += 1e-3;
      ok = choleskyFactor(C, kk, L);
    }
    if (!ok) {
      // Degenerate — emit no correction here (increment 0), variance = prior.
      varRatio[c] = 1;
      cursor += kk;   // keep CSR layout uniform; weights already 0
      for (let a = 0; a < kk; a++) neighbors[offsets[c] + a] = nn[a];
      continue;
    }
    choleskySolve(L, kk, rhoC, wvec);

    // Analysis-error variance ratio σ_a²/σ_b² = 1 − ρ_cᵀ w  (eq. 15).
    let quad = 0;
    for (let a = 0; a < kk; a++) quad += rhoC[a] * wvec[a];
    varRatio[c] = Math.max(0, 1 - quad);

    for (let a = 0; a < kk; a++) {
      neighbors[cursor] = nn[a];
      weights[cursor] = wvec[a];
      cursor++;
    }
  }
  offsets[nCells] = cursor;

  return { cols, rows, offsets, neighbors, weights, maxCorr, varRatio, obsCount: p };
}

/**
 * Apply a precomputed OI kernel to one hour's innovation vector `d` (length =
 * obsCount; `d[i] = y_i − H(x_b)|i`). Returns the per-cell analysis increment.
 *
 * NaN-safe: an obs whose innovation is NaN this hour (e.g. temporarily missing)
 * contributes nothing — its term is skipped. The precomputed weights assumed it
 * present, so this is a first-order approximation (the exact fix is to rebuild
 * the tiny system), but stations that feed the analysis are the constant h=0
 * set, so in practice all innovations are finite when the kernel is applied.
 */
export function applyOiKernel(kernel: OiKernel, innovations: Float32Array): Float32Array {
  const { cols, rows, offsets, neighbors, weights } = kernel;
  const nCells = cols * rows;
  const out = new Float32Array(nCells);
  for (let c = 0; c < nCells; c++) {
    const start = offsets[c];
    const end = offsets[c + 1];
    let inc = 0;
    for (let q = start; q < end; q++) {
      const d = innovations[neighbors[q]];
      if (d !== d) continue;          // NaN-skip, no function-call overhead
      inc += weights[q] * d;
    }
    out[c] = inc;
  }
  return out;
}

/**
 * Elevation-aware observation operator H (eq. 7): map a background dense grid
 * to a station location and adjust to the station's altitude,
 *   H(x_b)|s = bilinear(x_b, x_s) + γ̂ (z_grid(x_s) − z_s).
 * Returns the innovation d = y_s − H(x_b)|s (NaN if the background is unsampled
 * or the obs value is missing). `gridElev` supplies z_grid(x_s) by the same
 * bilinear stencil so the vertical term uses the elevation the background
 * actually represents at the station's horizontal position.
 */
export function innovationAt(
  bg: Float32Array, gridElev: Float32Array,
  cols: number, rows: number, uvBounds: [number, number, number, number],
  obsX: number, obsY: number, obsElev: number, obsValue: number,
  lapsePerM: number,
): number {
  if (!(obsValue === obsValue)) return NaN;
  const [x0, y0, x1, y1] = uvBounds;
  const fx = ((obsX - x0) / (x1 - x0)) * (cols - 1);
  // y increases southward in equirect; grid row j=0 is south (gy = y1). Map the
  // obs y to a fractional row index consistent with buildOiKernel's gy = y1−cj·dy.
  const fy = ((y1 - obsY) / (y1 - y0)) * (rows - 1);
  if (fx < 0 || fx > cols - 1 || fy < 0 || fy > rows - 1) return NaN;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const i1 = Math.min(cols - 1, i0 + 1), j1 = Math.min(rows - 1, j0 + 1);
  const tx = fx - i0, ty = fy - j0;
  const bil = (arr: Float32Array): number => {
    const v00 = arr[j0 * cols + i0], v10 = arr[j0 * cols + i1];
    const v01 = arr[j1 * cols + i0], v11 = arr[j1 * cols + i1];
    const v0 = v00 * (1 - tx) + v10 * tx;
    const v1 = v01 * (1 - tx) + v11 * tx;
    return v0 * (1 - ty) + v1 * ty;
  };
  const xbAtObs = bil(bg);
  if (!(xbAtObs === xbAtObs)) return NaN;
  const zGrid = bil(gridElev);
  const hxb = xbAtObs + lapsePerM * (zGrid - obsElev);   // (7)
  return obsValue - hxb;
}

/**
 * Coverage mask from the OI kernel's grid↔obs correlations, in the same 0..255
 * convention as the IDW path: strong where an observation is near, decaying
 * with metric distance. Used only where the OI increment is the *sole* field;
 * when OI increments a fully-covered model background the analysis inherits the
 * background mask instead (so coverage semantics stay identical — Phase 1 gate).
 */
export function oiCoverageMask(kernel: OiKernel): Uint8Array {
  const mask = new Uint8Array(kernel.maxCorr.length);
  for (let c = 0; c < mask.length; c++) {
    const m = kernel.maxCorr[c] * 255;
    mask[c] = m >= 255 ? 255 : m < 0.5 ? 0 : (m + 0.5) | 0;
  }
  return mask;
}
