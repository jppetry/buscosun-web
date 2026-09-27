/**
 * climaProduct.ts — the station-climatology product of phase FX-4 (E-FX-1, client side of C1; `audit/fusion-forschung.md`
 * §6.4): how μ_c (the 13 hourly-climatology coefficients per variable, `fitClima.ts C_NAMES`) is ESTIMATED at a point
 * that has no station series, from the stations that have one. ONE definition for three callers — the leave-station-out
 * diagnosis (`audit/fusion-forschung/diag-fx4.mjs`), the product builder (`scripts/fusionfit/clima-product.mjs`) and the
 * client (`cubeSource.ts` via `src/point/client/climaPoint.ts`) — so what the scorecard measured is what the browser runs.
 *
 * Estimators (`ClimaEstimatorSpec.kind`):
 *   idw      the k nearest stations carrying the variable, inverse-distance weights 1/(d² + 1 km²); with `heightSlope`
 *            every coefficient is brought to the target height with the slope of that coefficient over station height,
 *            fitted on the stations themselves (`fitLapse`, never a set value);
 *   ridge    a ridge regression of every coefficient on the site's trend features (`trendVector`: the static `buildZ`
 *            columns of the client plus height, height², latitude, longitude), λ per variable by leave-region-out CV;
 *   kriging  the ridge trend plus the inverse-distance mean of the k nearest stations' residuals against that trend.
 *
 * Every estimate names the stations it used (`used`) — a leave-station-out test excludes one id and checks it never
 * appears there (the leak check of the verifier). Pure: numbers in, numbers out, no IO, no clock.
 */
import { C_DIM, C_NAMES, CLIMA_VARS, climaDesign, type ClimaVar } from './fitClima';
import { buildZ, Z_INDEX, type SiteFeatures } from './features';
import { cholesky, cholSolve } from './linalg';

export const CLIMA_PRODUCT_SCHEMA = 1;
export const CLIMA_PRODUCT_KIND = 'fusionfit/clima-product';

export type ClimaEstimatorKind = 'idw' | 'ridge' | 'kriging';
export interface ClimaEstimatorSpec {
  kind: ClimaEstimatorKind;
  /** Neighbours (idw, kriging residuals). */
  k: number;
  /** IDW exponent (2 = the ClimaField rule). */
  power: number;
  /** Which variables get the per-coefficient height slope under idw: none, T/Td only, or all. */
  heightSlope: 'none' | 'tTd' | 'all';
  /**
   * Per-variable overrides (phase FX-4 stage 1: the ridge trend extrapolates cloud cover at the 16 DE mountain stations —
   * RMS 12,6 % against 5,0 % for idw3 — so cloud cover takes the neighbour estimator). An override has no `byVar` itself.
   */
  byVar?: Partial<Record<ClimaVar, Omit<ClimaEstimatorSpec, 'byVar'>>>;
}

export interface ClimaProductStation {
  id: string;
  name?: string | null;
  lat: number;
  lon: number;
  /** Station height (h_true of the archive point, E-F-12). */
  elevM: number;
  country: string;
  /** Truth network the series came from (cdc | tawes | smn). */
  net?: string | null;
  /** μ_c coefficients per variable in `C_NAMES` order; a variable without a written series is absent. */
  mu: Partial<Record<ClimaVar, number[]>>;
  /** Trend features of the station (`trendVector`), needed by `kriging` for the residuals; absent for idw-only products. */
  feat?: number[] | null;
}

export interface ClimaTrend {
  names: readonly string[];
  /** Per variable: for each of the C_DIM coefficients its regression vector over `names`. */
  beta: Partial<Record<ClimaVar, number[][]>>;
  lambda?: Partial<Record<ClimaVar, number>>;
}

export interface ClimaProduct {
  schema: number;
  kind: string;
  fitVersion: string;
  provenance: 'hindcast';
  builtAt: string;
  /** Name of the candidate the builder used (`lib/climaCandidates.mjs`), for the provenance line; optional. */
  candidate?: string | null;
  estimator: ClimaEstimatorSpec;
  /** `C_NAMES` — the meaning of every coefficient. */
  design: readonly string[];
  vars: readonly ClimaVar[];
  /** Per variable the slope of every coefficient per km of station height (`fitLapse`), or null without height slopes. */
  lapse: Partial<Record<ClimaVar, number[]>> | null;
  trend: ClimaTrend | null;
  stations: ClimaProductStation[];
  source: { clima: string; sha256: string | null; period: { from: string; to: string } | null; days: number | null; points: number };
  licence: string[];
  notes: string[];
}

/** What the estimator needs to know about the target point. */
export interface ClimaTarget {
  lat: number;
  lon: number;
  elevM: number;
  /** Trend features (`trendVector`) — null/absent when the caller cannot build them (ridge/kriging then fall back, named). */
  feat?: Float64Array | number[] | null;
}

export interface MuEstimate {
  /** Per variable the estimated coefficient vector (C_DIM); absent when no source carried the variable. */
  mu: Partial<Record<ClimaVar, Float64Array>>;
  /** Distance to the nearest station that carried any variable (km), null without stations. */
  nearestKm: number | null;
  /** Ids of every station that entered any variable's estimate (the leak check reads this). */
  used: string[];
  /** Per variable how the estimate was made (`idw`, `ridge`, `kriging`, or `idw-fallback` when the trend had no features). */
  how: Partial<Record<ClimaVar, string>>;
}

// ── trend features ─────────────────────────────────────────────────────────────

/** The static `buildZ` columns a browser point knows (terrain, land cover, urban) — the same definitions as the fit's Z. */
export const TREND_Z = Object.freeze(['tpi500', 'tpi2000', 'svf', 'sink', 'slope', 'slopeCosA', 'slopeSinA', 'lnZ0', 'lcWater', 'lcUrban', 'lcForest', 'lcBare', 'lcSnow', 'dWater', 'lake', 'imperv', 'd0'] as const);
export const TREND_NAMES = Object.freeze(['1', 'hKm', 'hKm2', 'dLat', 'dLon', ...TREND_Z] as const);
export const TREND_DIM = TREND_NAMES.length;
/** Reference latitude/longitude of the centred coordinates (the middle of the DACH box). */
export const TREND_LAT0 = 48, TREND_LON0 = 10;
const NEUTRAL_SITUATION = Object.freeze({ dhM: 0, z0ModTier: null, foehnFactor: null, fRad: null, dTsfcK: null, validAtMs: 0, leadH: 0, binFromH: 0, binToH: 1 });

/**
 * Named trend-feature sets: `full` = everything a browser point can know (land cover and urban arrive late or only with
 * `CubeIo.landCover`), `terrain` = height, position and the Terrarium terms that every cube answer carries with its core,
 * `geo` = height and position only. A product names its set in `trend.names`; the client builds exactly that vector.
 */
export const TREND_SETS: Readonly<Record<'full' | 'terrain' | 'geo', readonly string[]>> = Object.freeze({
  full: TREND_NAMES,
  terrain: Object.freeze(['1', 'hKm', 'hKm2', 'dLat', 'dLon', 'tpi500', 'tpi2000', 'svf', 'sink', 'slope', 'slopeCosA', 'slopeSinA']),
  geo: Object.freeze(['1', 'hKm', 'hKm2', 'dLat', 'dLon']),
});

/** Trend features of a site for a named set (default `full`): height (km, and squared), centred lat/lon, then static Z columns from `buildZ` (one definition). */
export function trendVector(site: SiteFeatures, lat: number, names: readonly string[] = TREND_NAMES, out: Float64Array = new Float64Array(names.length)): Float64Array {
  const z = buildZ(site, NEUTRAL_SITUATION);
  const h = site.hTrueM / 1000;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    out[i] = n === '1' ? 1 : n === 'hKm' ? h : n === 'hKm2' ? h * h : n === 'dLat' ? lat - TREND_LAT0 : n === 'dLon' ? site.lonDeg - TREND_LON0 : z[Z_INDEX[n as keyof typeof Z_INDEX]];
    if (!Number.isFinite(out[i])) throw new Error(`trendVector: unbekanntes oder leeres Merkmal ${n}`);
  }
  return out;
}

// ── geometry ───────────────────────────────────────────────────────────────────

const R_KM = 6371;
export function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Stations by distance to the target, the excluded id left out. */
export function stationsByDistance(stations: readonly ClimaProductStation[], lat: number, lon: number, exclude: string | null = null): Array<{ s: ClimaProductStation; d: number }> {
  const out: Array<{ s: ClimaProductStation; d: number }> = [];
  for (const s of stations) { if (exclude != null && s.id === exclude) continue; out.push({ s, d: distKm(lat, lon, s.lat, s.lon) }); }
  out.sort((a, b) => a.d - b.d || a.s.id.localeCompare(b.s.id));
  return out;
}

// ── fitting helpers (pure; the scripts call them, the client never does) ───────

/**
 * Slope of every coefficient of a variable over station height (per km), least squares with intercept over the stations
 * carrying the variable, `exclude` left out. The climatology's own lapse — for T ≈ −6 K/km on the annual mean.
 */
export function fitLapse(stations: readonly ClimaProductStation[], v: ClimaVar, exclude: string | null = null): Float64Array | null {
  let n = 0, sh = 0, shh = 0;
  const sm = new Float64Array(C_DIM), shm = new Float64Array(C_DIM);
  for (const s of stations) {
    if (exclude != null && s.id === exclude) continue;
    const m = s.mu[v]; if (!m) continue;
    const h = s.elevM / 1000;
    n += 1; sh += h; shh += h * h;
    for (let j = 0; j < C_DIM; j++) { sm[j] += m[j]; shm[j] += h * m[j]; }
  }
  if (n < 3) return null;
  const den = shh - (sh * sh) / n;
  if (!(den > 1e-9)) return null;
  const out = new Float64Array(C_DIM);
  for (let j = 0; j < C_DIM; j++) out[j] = (shm[j] - (sh * sm[j]) / n) / den;
  return out;
}

/** Sufficient statistics of a multi-target ridge (one X, C_DIM targets): XᵀX, XᵀY, n. */
export class TrendGram {
  readonly p: number;
  n = 0;
  readonly xtx: Float64Array;
  readonly xty: Float64Array;   // p × C_DIM
  constructor(p: number) { this.p = p; this.xtx = new Float64Array(p * p); this.xty = new Float64Array(p * C_DIM); }
  add(x: ArrayLike<number>, y: ArrayLike<number>, sign = 1): void {
    const p = this.p;
    for (let i = 0; i < p; i++) {
      const xi = x[i] * sign;
      if (xi === 0) continue;
      for (let j = 0; j < p; j++) this.xtx[i * p + j] += xi * x[j];
      for (let k = 0; k < C_DIM; k++) this.xty[i * C_DIM + k] += xi * y[k];
    }
    this.n += sign;
  }
  merge(g: TrendGram, sign = 1): void {
    for (let i = 0; i < this.xtx.length; i++) this.xtx[i] += sign * g.xtx[i];
    for (let i = 0; i < this.xty.length; i++) this.xty[i] += sign * g.xty[i];
    this.n += sign * g.n;
  }
  clone(): TrendGram { const g = new TrendGram(this.p); g.merge(this); return g; }
  /** Column variances (intercept = column 0 unpenalised) — the scale-free penalty, as `gram.ts variancePenalty`. */
  penalty(): Float64Array {
    const p = this.p, pen = new Float64Array(p);
    if (!this.n) return pen;
    for (let j = 1; j < p; j++) { const mean = this.xtx[j] / this.n, v = this.xtx[j * p + j] / this.n - mean * mean; pen[j] = v > 0 ? v : 1; }
    return pen;
  }
}

/** Ridge solve for all C_DIM targets at once: (XᵀX + λ·n·diag(pen)) B = XᵀY. Returns C_DIM vectors of length p, or null. */
export function ridgeMulti(g: TrendGram, lambda: number, penalty: Float64Array): Float64Array[] | null {
  const p = g.p, A = new Float64Array(g.xtx);
  const scale = lambda * Math.max(1, g.n);
  for (let j = 0; j < p; j++) A[j * p + j] += scale * penalty[j];
  let L: Float64Array | null = null;
  for (const eps of [0, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2]) {
    const M = eps ? new Float64Array(A) : A;
    if (eps) for (let i = 0; i < p; i++) M[i * p + i] += eps * Math.max(Math.abs(A[i * p + i]), 1e-12);
    L = cholesky(M, p);
    if (L) break;
  }
  if (!L) return null;
  const out: Float64Array[] = [];
  for (let k = 0; k < C_DIM; k++) {
    const b = new Float64Array(p);
    for (let i = 0; i < p; i++) b[i] = g.xty[i * C_DIM + k];
    out.push(cholSolve(L, p, b));
  }
  return out;
}

export const TREND_LAMBDAS: readonly number[] = Object.freeze([0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]);

/**
 * Fit the trend of one variable: λ by leave-region-out CV (each region held out once, the others train; the held-out SSE
 * summed over all C_DIM coefficients, each scaled by its variance over the stations so a large coefficient does not dominate),
 * then the fit on all rows. `rows` = the training stations with their features and coefficient vectors; `regionOf` maps a
 * station id to its region key. Returns null below 3·p rows.
 */
export function fitTrend(rows: ReadonlyArray<{ id: string; x: ArrayLike<number>; y: ArrayLike<number> }>, regionOf: (id: string) => string, lambdas: readonly number[] = TREND_LAMBDAS): { beta: Float64Array[]; lambda: number; cvMse: number | null } | null {
  if (!rows.length) return null;
  const p = rows[0].x.length;
  if (rows.length < 3 * p) return null;
  const byRegion = new Map<string, TrendGram>();
  const all = new TrendGram(p);
  const ySum = new Float64Array(C_DIM), ySq = new Float64Array(C_DIM);
  for (const r of rows) {
    const key = regionOf(r.id);
    let g = byRegion.get(key); if (!g) { g = new TrendGram(p); byRegion.set(key, g); }
    g.add(r.x, r.y); all.add(r.x, r.y);
    for (let k = 0; k < C_DIM; k++) { ySum[k] += r.y[k]; ySq[k] += r.y[k] * r.y[k]; }
  }
  const scaleK = new Float64Array(C_DIM);
  for (let k = 0; k < C_DIM; k++) { const m = ySum[k] / rows.length, v = ySq[k] / rows.length - m * m; scaleK[k] = v > 1e-12 ? 1 / v : 1; }
  const penalty = all.penalty();
  let best: { lambda: number; sse: number } | null = null;
  if (byRegion.size >= 2) {
    for (const lambda of lambdas) {
      let sse = 0, any = false;
      for (const [held, gh] of byRegion) {
        const train = all.clone(); train.merge(gh, -1);
        if (train.n < 2 * p) continue;
        const B = ridgeMulti(train, lambda, penalty); if (!B) continue;
        for (const r of rows) {
          if (regionOf(r.id) !== held) continue;
          for (let k = 0; k < C_DIM; k++) { let yh = 0; for (let i = 0; i < p; i++) yh += B[k][i] * r.x[i]; const e = yh - r.y[k]; sse += scaleK[k] * e * e; }
        }
        any = true;
      }
      if (any && (!best || sse < best.sse)) best = { lambda, sse };
    }
  }
  const lambda = best?.lambda ?? 1;
  const beta = ridgeMulti(all, lambda, penalty);
  if (!beta) return null;
  return { beta, lambda, cvMse: best ? best.sse / rows.length / C_DIM : null };
}

// ── estimation (the client path) ───────────────────────────────────────────────

const HEIGHT_VARS: Readonly<Record<ClimaEstimatorSpec['heightSlope'], ReadonlySet<ClimaVar>>> = Object.freeze({
  none: new Set<ClimaVar>(),
  tTd: new Set<ClimaVar>(['t', 'td']),
  all: new Set<ClimaVar>(CLIMA_VARS),
});

const dotTrend = (b: number[] | Float64Array, x: ArrayLike<number>): number => { let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * x[i]; return s; };

/**
 * Estimate the μ_c coefficients of every variable at a target from a product. `exclude` leaves one station out entirely
 * (leave-station-out; also of the neighbour search) — the excluded id never appears in `used`.
 */
export function estimateCoefficients(product: ClimaProduct, target: ClimaTarget, opts: { exclude?: string | null } = {}): MuEstimate {
  const exclude = opts.exclude ?? null;
  const byDist = stationsByDistance(product.stations, target.lat, target.lon, exclude);
  const mu: MuEstimate['mu'] = {}, how: MuEstimate['how'] = {};
  const used = new Set<string>();
  const nearestKm = byDist.length ? byDist[0].d : null;
  const feat = target.feat ?? null;
  const trendOk = (v: ClimaVar): boolean => !!(product.trend && feat && product.trend.beta[v] && product.trend.beta[v]!.length === C_DIM && product.trend.names.length === feat.length);
  for (const v of product.vars) {
    const spec: Omit<ClimaEstimatorSpec, 'byVar'> = product.estimator.byVar?.[v] ?? product.estimator;
    const k = Math.max(1, spec.k | 0);
    const withSlope = HEIGHT_VARS[spec.heightSlope].has(v) && !!product.lapse?.[v];
    const lapse = withSlope ? product.lapse![v]! : null;
    // the trend part (ridge, kriging) — only with the target's features and a fitted trend
    let base: Float64Array | null = null;
    if (spec.kind !== 'idw' && trendOk(v)) {
      base = new Float64Array(C_DIM);
      for (let j = 0; j < C_DIM; j++) base[j] = dotTrend(product.trend!.beta[v]![j], feat!);
    }
    if (spec.kind === 'ridge' && base) { mu[v] = base; how[v] = 'ridge'; continue; }
    // the neighbour part: idw of the coefficients (idw), or of the residuals against the trend (kriging)
    const near: Array<{ s: ClimaProductStation; d: number }> = [];
    for (const e of byDist) { if (e.s.mu[v]) { near.push(e); if (near.length >= k) break; } }
    if (!near.length) { if (base) { mu[v] = base; how[v] = 'ridge-only'; } continue; }
    const out = new Float64Array(C_DIM);
    let wSum = 0;
    for (const { s, d } of near) {
      const w = 1 / (Math.pow(d, spec.power) + 1);
      const m = s.mu[v]!;
      const dh = (target.elevM - s.elevM) / 1000;
      if (base && spec.kind === 'kriging' && s.feat && s.feat.length === product.trend!.names.length) {
        // residual of the neighbour against the trend, carried to the target on top of the target's trend value
        for (let j = 0; j < C_DIM; j++) out[j] += w * (m[j] - dotTrend(product.trend!.beta[v]![j], s.feat));
      } else {
        for (let j = 0; j < C_DIM; j++) out[j] += w * (m[j] + (lapse ? lapse[j] * dh : 0));
      }
      wSum += w; used.add(s.id);
    }
    for (let j = 0; j < C_DIM; j++) out[j] = out[j] / wSum + (base && spec.kind === 'kriging' ? base[j] : 0);
    mu[v] = out;
    how[v] = spec.kind === 'kriging' ? (base ? 'kriging' : 'idw-fallback') : spec.kind === 'ridge' ? 'idw-fallback' : 'idw';
  }
  return { mu, nearestKm, used: [...used].sort(), how };
}

/** μ_c per variable at a valid time from an estimate (the design row at the TARGET's longitude). */
export function muAt(est: MuEstimate, validAtMs: number, lonDeg: number, x: Float64Array = new Float64Array(C_DIM)): Partial<Record<ClimaVar, number>> {
  climaDesign(validAtMs, lonDeg, x);
  const out: Partial<Record<ClimaVar, number>> = {};
  for (const v of Object.keys(est.mu) as ClimaVar[]) {
    const m = est.mu[v]!;
    let s = 0; for (let j = 0; j < C_DIM; j++) s += m[j] * x[j];
    out[v] = s;
  }
  return out;
}

/** Structural admission rule of a product document (the reader's check). */
export function validateClimaProduct(doc: unknown): string[] {
  const errs: string[] = [];
  const d = doc as Partial<ClimaProduct>;
  if (!d || typeof d !== 'object') return ['kein Objekt'];
  if (d.schema !== CLIMA_PRODUCT_SCHEMA) errs.push(`schema ${String(d.schema)}`);
  if (d.kind !== CLIMA_PRODUCT_KIND) errs.push(`kind ${String(d.kind)}`);
  if (d.provenance !== 'hindcast') errs.push('provenance muss hindcast sein');
  if (JSON.stringify(d.design) !== JSON.stringify(C_NAMES)) errs.push('design ≠ C_NAMES');
  const e = d.estimator;
  const specOk = (x: Omit<ClimaEstimatorSpec, 'byVar'> | undefined) => !!x && ['idw', 'ridge', 'kriging'].includes(x.kind) && x.k >= 1 && x.power > 0 && ['none', 'tTd', 'all'].includes(x.heightSlope);
  if (!specOk(e)) errs.push('estimator');
  else if (e!.byVar) for (const [v, x] of Object.entries(e!.byVar)) if (!(CLIMA_VARS as readonly string[]).includes(v) || !specOk(x) || (x as ClimaEstimatorSpec).byVar) { errs.push(`estimator.byVar ${v}`); break; }
  if (!Array.isArray(d.vars) || !d.vars.length || !d.vars.every((v) => (CLIMA_VARS as readonly string[]).includes(v))) errs.push('vars');
  // phase FX-5 (E-FX-8): a narrowed product carries nothing for a variable outside `vars` — trend, lapse and station coefficients
  if (Array.isArray(d.vars)) {
    const inVars = (v: string) => (d.vars as readonly string[]).includes(v);
    for (const v of Object.keys(d.trend?.beta ?? {})) if (!inVars(v)) { errs.push(`trend ${v}: Größe nicht in vars`); break; }
    for (const v of Object.keys(d.lapse ?? {})) if (!inVars(v)) { errs.push(`lapse ${v}: Größe nicht in vars`); break; }
    outer: for (const s of Array.isArray(d.stations) ? d.stations : []) for (const v of Object.keys(s?.mu ?? {})) if (!inVars(v)) { errs.push(`station ${s.id}: mu ${v} nicht in vars`); break outer; }
  }
  if (!Array.isArray(d.stations) || !d.stations.length) errs.push('stations leer');
  else {
    for (const s of d.stations) {
      if (!s || typeof s.id !== 'string' || !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !Number.isFinite(s.elevM)) { errs.push(`station ${String(s?.id)}: Lage/Höhe`); break; }
      for (const [v, m] of Object.entries(s.mu ?? {})) if (!Array.isArray(m) || m.length !== C_DIM || m.some((x) => !Number.isFinite(x))) { errs.push(`station ${s.id}: mu ${v}`); break; }
    }
  }
  const specs = e ? [e, ...Object.values(e.byVar ?? {})] : [];
  if (specs.some((x) => x.kind !== 'idw')) {
    const setOk = !!d.trend && Object.values(TREND_SETS).some((n) => JSON.stringify(n) === JSON.stringify(d.trend!.names));
    if (!setOk) errs.push('trend fehlt oder names ist keine der TREND_SETS');
    else for (const [v, B] of Object.entries(d.trend!.beta ?? {})) if (!Array.isArray(B) || B.length !== C_DIM || B.some((b) => !Array.isArray(b) || b.length !== d.trend!.names.length || b.some((x) => !Number.isFinite(x)))) { errs.push(`trend ${v}`); break; }
  }
  if (specs.some((x) => x.heightSlope !== 'none') && (!d.lapse || Object.values(d.lapse).some((l) => !Array.isArray(l) || l.length !== C_DIM))) errs.push('lapse fehlt oder falsche Länge');
  if (!Array.isArray(d.licence) || !d.licence.length) errs.push('licence fehlt');
  return errs;
}
