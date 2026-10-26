/**
 * Phase FB — „buscosun Fusion — Fahrbahn" (AW-6.2, `audit/autobahn-fahrbahn.md`): the road SURFACE forecast of
 * Autobahnwetter, +0 … +6 h, derived in the producer of the route forecast (`scripts/road/road-forecast.mjs`) from
 * buscosun Fusion's air at the road and a table fitted on the archive (`road-surface-backtest.mjs`). ONE file for the
 * producer, the fit, the client and the verifier (`verify:road-surface`). Dependency-free apart from the class rule
 * (`roadClasses.ts`, itself dependency-free) — imported by the producer (Node strip-types) and the lazy `src/road/` chunk.
 *
 * Model FB-1 (E-FB-1): with Δ := road − FORECAST air of the same hour,
 *   rs(h) = t(h) + Δ_clim(hour of day, clear sky, wind, wet)(h) + b_station + (Δ_obs(0) − Δ_clim(0) − b_station) · w_h
 * with w_h = e^(−h/τ) (the plan's form, `decayFit: 'tau'`) or one fitted weight per lead (`'lead'`, V-FB-7).
 * Everything in the table is FITTED (coefficients, bias, weights, σ); only the form is set. A point without its own
 * measurement at the run hour (axis point, station without a valid pair) gets the climatology alone (`rq = 1`).
 *
 * The product carries three OPTIONAL series in the run files of `road/fc/v1/` (E-FB-3; contract `roadFc.ts`):
 *   rs  road surface temperature, 0.1 °C      rk  hint class (ROAD_SURFACE_HINT)      rq  origin (ROAD_SURFACE_ORIGIN)
 * Steps beyond `ROAD_SURFACE_HORIZON_H` are null — the model is scored to 6 h, nothing beyond is claimed.
 */
import { FROST_ROAD_MAX_C } from './roadClasses';

export const ROAD_SURFACE_MODEL = 'fb1';
export const ROAD_SURFACE_TABLE_SCHEMA = 1;
/** The fitted table in the data repo, next to `points.json` / `geo.json` (E-FB-2). */
export const ROAD_SURFACE_TABLE_PATH = 'static/surface.json';
/** Last lead (h) with a value; the backtest scores 1/3/6 h. */
export const ROAD_SURFACE_HORIZON_H = 6;
/** τ candidates of the fit (h) — the fit picks the one with the smallest MAE over leads 1 … 6 (rule §4 Nr. 4). */
export const ROAD_SURFACE_TAU_GRID_H: readonly number[] = Object.freeze([0.5, 1, 1.5, 2, 3, 4, 6, 8, 12]);
/**
 * Pairs whose road − forecast air (at the valid hour or at the run hour) exceeds this (K) stay OUT of the fit — a sensor
 * reporting +54 °C in October (E774) would otherwise set its own „bias" and blow σ. Rule amendment A1 (26.10.2026,
 * after the first run failed its own table check, before any score was seen). Scoring keeps every pair.
 */
export const ROAD_SURFACE_FIT_MAX_ABS_K = 15;
/** Station bias shrinks with n / (n + ROAD_SURFACE_BIAS_SHRINK_N) (rule §4 Nr. 4). */
export const ROAD_SURFACE_BIAS_SHRINK_N = 20;
/** Precipitation probability from which an hour counts as wet (same value as `ROAD_FC_PRECIP_PP`, checked by the verifier). */
export const ROAD_SURFACE_WET_PP = 50;
/** Event of Gate D-K: road ≤ this (°C) — the temperature part of the class „Frostgefahr". */
export const ROAD_SURFACE_COLD_C = FROST_ROAD_MAX_C;

/** `rk`: hint class derived from forecast values — never „trocken", never a measured ice code (E-FB-4). */
export const ROAD_SURFACE_HINT = Object.freeze({ none: 0, wet: 1, frost: 2 } as const);
export type RoadSurfaceHint = keyof typeof ROAD_SURFACE_HINT;
export const ROAD_SURFACE_HINT_LABEL: Readonly<Record<RoadSurfaceHint, { label: string; short: string }>> = Object.freeze({
  none: { label: 'kein Hinweis · berechnet', short: 'kein Hinweis (ber.)' },
  wet: { label: 'Nass · berechnet', short: 'Nass (ber.)' },
  frost: { label: 'Frostgefahr · berechnet', short: 'Frostgefahr (ber.)' },
});
export function roadSurfaceHintOf(code: number | null | undefined): RoadSurfaceHint | null {
  return code === 0 ? 'none' : code === 1 ? 'wet' : code === 2 ? 'frost' : null;
}

/** `rq`: 0 = anomaly of the station's own measurement at the run hour, 1 = climatology only (no usable measurement). */
export const ROAD_SURFACE_ORIGIN = Object.freeze({ own: 0, clim: 1 } as const);

/** The one word every surface forecast carries (E-FB-5): it is computed, not measured. The flag (`ROAD_SURFACE_LIVE`,
 *  `?rsfc=`) lives in `roadFlag.ts` with the other switches — eager and dependency-free. */
export const ROAD_SURFACE_WORD = 'berechnet';

// --- Table -------------------------------------------------------------------------------------

export interface RoadSurfaceTable {
  schema: 1;
  product: 'road-surface-table';
  model: 'fb1';
  builtAt: string;
  /** What the fit saw: first/last run day (UTC, `YYYY-MM-DD`), runs, pairs, stations with a bias. */
  fitted: { from: string; to: string; runs: number; pairs: number; stations: number };
  /**
   * Weight of the measured anomaly per lead 0 … HORIZON (w_0 = 1). `decayFit: 'tau'` = e^(−h/τ) with τ from the grid
   * (the plan's form, `tauH`); `'lead'` = one weight per lead fitted by least squares (τ = null). V-FB-7: the exponential
   * decays too fast at +1 h.
   */
  decay: number[];
  decayFit: 'tau' | 'lead';
  tauH: number | null;
  /** 24 rows (UTC hour of the valid time) × [a0, a1 · clear sky (1 − N/100), a2 · wind m/s, a3 · wet 0/1] in K. */
  hours: number[][];
  /** Training means of the predictors — used where a forecast lacks a value. */
  means: { cs: number; ff: number; wet: number };
  /** σ of the residual per lead 0 … HORIZON (K) — the spread the page names and the probability of the cold event. */
  sigma: number[];
  /** Station id → bias in 0.1 K (integer), already shrunk. */
  bias: Record<string, number>;
  shrinkN: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const finiteArr = (a: unknown, n: number) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Every reason a table is not usable (empty = fine) — the producer logs them, the fit throws them. */
export function roadSurfaceTableProblems(j: unknown): string[] {
  if (!isObj(j)) return ['kein Objekt'];
  const out: string[] = [];
  if (j.schema !== ROAD_SURFACE_TABLE_SCHEMA || j.product !== 'road-surface-table' || j.model !== ROAD_SURFACE_MODEL) out.push('Kopf (schema/product/model)');
  if (typeof j.builtAt !== 'string' || !Number.isFinite(Date.parse(j.builtAt))) out.push('builtAt');
  if (j.decayFit !== 'tau' && j.decayFit !== 'lead') out.push('decayFit');
  if (j.decayFit === 'tau' ? (typeof j.tauH !== 'number' || !(j.tauH > 0) || j.tauH > 48) : j.tauH !== null) out.push('tauH');
  if (!finiteArr(j.decay, ROAD_SURFACE_HORIZON_H + 1) || (j.decay as number[])[0] !== 1 || !(j.decay as number[]).every((w) => w >= -0.5 && w <= 1.5)) out.push('decay (0 … 6, w0 = 1, −0,5 ≤ w ≤ 1,5)');
  if (!Array.isArray(j.hours) || j.hours.length !== 24 || !j.hours.every((r) => finiteArr(r, 4) && (r as number[]).every((x) => Math.abs(x) <= 30))) out.push('hours (24 × 4, |x| ≤ 30)');
  // σ at lead 0 is 0 by construction (the anomaly reproduces the measurement); `roadSurfaceColdProb` floors σ.
  if (!finiteArr(j.sigma, ROAD_SURFACE_HORIZON_H + 1) || !(j.sigma as number[]).every((s) => s >= 0 && s < 20)) out.push('sigma (0 … 6, 0 ≤ σ < 20)');
  if (!isObj(j.means) || !['cs', 'ff', 'wet'].every((k) => typeof (j.means as Record<string, unknown>)[k] === 'number')) out.push('means');
  if (!isObj(j.bias)) out.push('bias');
  else {
    const bad = Object.entries(j.bias).filter(([, b]) => !Number.isInteger(b) || Math.abs(b as number) > 300);
    if (bad.length) out.push(`bias (${bad.length} außerhalb ±30 K: ${bad.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')})`);
  }
  if (!isObj(j.fitted) || typeof j.fitted.from !== 'string' || typeof j.fitted.to !== 'string') out.push('fitted');
  if (typeof j.shrinkN !== 'number') out.push('shrinkN');
  return out;
}

/** Client/producer check of a table; `null` ⇒ the producer runs without the surface and names the reason. */
export function parseRoadSurfaceTable(j: unknown): RoadSurfaceTable | null {
  return roadSurfaceTableProblems(j).length ? null : (j as RoadSurfaceTable);
}

// --- Model -------------------------------------------------------------------------------------

/** Forecast values of one hour the model reads (physical units; null = missing). */
export interface RoadSurfaceStep {
  /** Valid time (ms) — gives the UTC hour of day. */
  validMs: number;
  /** Air 2 m °C (buscosun Fusion at the road). */
  t: number | null;
  td: number | null;
  /** Total cloud cover %. */
  n: number | null;
  /** Wind 10 m m/s. */
  ff: number | null;
  /** Precipitation probability %. */
  pp: number | null;
}

/** Is this hour wet in the model's sense (E-FB-4): precipitation probability ≥ `ROAD_SURFACE_WET_PP`. */
export const roadSurfaceWet = (pp: number | null | undefined): boolean => pp != null && pp >= ROAD_SURFACE_WET_PP;

/** Predictors of a step: clear-sky fraction, wind, wet flag — table means where a value is missing. */
export function roadSurfacePredictors(tab: Pick<RoadSurfaceTable, 'means'>, s: Pick<RoadSurfaceStep, 'n' | 'ff' | 'pp'>): { cs: number; ff: number; wet: number } {
  return {
    cs: s.n == null ? tab.means.cs : Math.max(0, Math.min(1, 1 - s.n / 100)),
    ff: s.ff == null ? tab.means.ff : Math.max(0, s.ff),
    wet: s.pp == null ? tab.means.wet : roadSurfaceWet(s.pp) ? 1 : 0,
  };
}

/** Δ_clim (K) of one hour: a0 + a1 · cs + a2 · ff + a3 · wet of the UTC hour's row. */
export function roadSurfaceClim(tab: Pick<RoadSurfaceTable, 'hours' | 'means'>, s: Pick<RoadSurfaceStep, 'validMs' | 'n' | 'ff' | 'pp'>): number {
  const row = tab.hours[new Date(s.validMs).getUTCHours()];
  const p = roadSurfacePredictors(tab, s);
  return row[0] + row[1] * p.cs + row[2] * p.ff + row[3] * p.wet;
}

/** Station bias (K) from the table; 0 for a point without one (axis points, new stations). */
export const roadSurfaceBias = (tab: Pick<RoadSurfaceTable, 'bias'>, stationId: string | null): number =>
  (stationId != null && tab.bias[stationId] != null ? tab.bias[stationId] / 10 : 0);

/** Hint class (E-FB-4) from derived values; `null` without a road temperature. */
export function roadSurfaceHint(rs: number | null, td: number | null, wet: boolean): number | null {
  if (rs == null) return null;
  const belowDew = td != null && rs <= td;
  if (rs <= ROAD_SURFACE_COLD_C && (wet || belowDew)) return ROAD_SURFACE_HINT.frost;
  if (wet) return ROAD_SURFACE_HINT.wet;
  return ROAD_SURFACE_HINT.none;
}

export interface RoadSurfaceSeries {
  rs: Array<number | null>;
  rk: Array<number | null>;
  rq: Array<number | null>;
  /** Anomaly used at lead 0 (K) — `null` when the climatology alone was used. */
  anomaly: number | null;
}

/**
 * FB-1 for leads 0 … HORIZON. `steps[h]` = the forecast of lead h (index = lead); `obsRs` = the station's own road
 * temperature measured at the run hour (lead 0), or null. Missing air at a lead ⇒ null at that lead; missing air at
 * lead 0 ⇒ no anomaly (climatology only, `rq = 1`), because Δ is defined against the forecast air.
 */
export function roadSurfaceSeries(tab: RoadSurfaceTable, stationId: string | null, steps: ReadonlyArray<RoadSurfaceStep | null>, obsRs: number | null): RoadSurfaceSeries {
  const H = ROAD_SURFACE_HORIZON_H;
  const rs: Array<number | null> = [], rk: Array<number | null> = [], rq: Array<number | null> = [];
  const b = roadSurfaceBias(tab, stationId);
  const s0 = steps[0];
  const anomaly = obsRs != null && s0 && s0.t != null ? obsRs - s0.t - roadSurfaceClim(tab, s0) - b : null;
  for (let h = 0; h <= H; h++) {
    const s = steps[h];
    if (!s || s.t == null) { rs.push(null); rk.push(null); rq.push(null); continue; }
    const v = s.t + roadSurfaceClim(tab, s) + b + (anomaly == null ? 0 : anomaly * tab.decay[h]);
    const x = Math.round(v * 10) / 10;
    rs.push(x);
    rk.push(roadSurfaceHint(x, s.td, roadSurfaceWet(s.pp)));
    rq.push(anomaly == null ? ROAD_SURFACE_ORIGIN.clim : ROAD_SURFACE_ORIGIN.own);
  }
  return { rs, rk, rq, anomaly };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5 · 10⁻⁷). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 + 0.5 * y : 0.5 - 0.5 * y;
}

/** P(road ≤ ROAD_SURFACE_COLD_C) from the forecast and the table's σ of that lead. */
export function roadSurfaceColdProb(rs: number, sigma: number): number {
  return normalCdf((ROAD_SURFACE_COLD_C - rs) / Math.max(0.05, sigma));
}

// --- Engine block of a run (what the run DID) ----------------------------------------------------

export type RoadSurfaceEngine =
  | { mode: 'fb1'; table: string; fitted: RoadSurfaceTable['fitted']; decay: number[]; sigma: number[]; own: number; clim: number }
  | { mode: 'none'; reason: string };
