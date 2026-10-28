/**
 * AW-6.2.4 — coupling of the virtual road sensor to a valid GMA measurement and the site correction
 * (`audit/autobahnwetter.md` §20.10). Pure functions over the core (`roadVsCore.ts`); the derive (6.2.7) decides when to call
 * them, the verifier (`verify:road-vs` I) checks them on synthetic cases.
 *
 * Coupling (Startprompt): if the last valid measurement is ≤ 6 h old, the last 3 h are re-run from the stored state with a
 * factor C ∈ [0,01; 3] on the shortwave input (when the sun shone in the window) or on the longwave input (otherwise) until
 * the modelled Ts at the measuring time is within 0,1 K of the measurement (bisection); afterwards the factor decays,
 * C(t) = 1 + (C_R − 1)·e^(−t/4 h). Site correction v1: a residual table station × UTC hour × weather class, learned only from
 * hours with a valid sensor, shrunk towards 0 for small n; axis points take the residuals (not the raw values) of neighbour
 * GMA in the same elevation band and terrain class, with σ widened in clear calm nights.
 */
import { integrateHour, type VsHourForcing, type VsPointState, type VsSite } from './roadVsCore';

export const VS_COUPLE = Object.freeze({
  /** Measurement age beyond which no coupling happens (Startprompt). */
  maxAgeH: 6,
  /** Window re-run with the factor (Startprompt). */
  windowH: 3,
  /** Factor bounds and the target tolerance of the bisection (Startprompt); iterations `set` (≈ 2^−12 of the range). */
  cMin: 0.01, cMax: 3, tolK: 0.1, maxIter: 14,
  /** Mean global radiation over the window from which the SHORTWAVE input is coupled (`set`); below it the longwave. */
  sunWm2: 20,
  /** Decay time of the factor after the measurement (Startprompt). */
  decayH: 4,
});

export type VsCoupleMode = 'sw' | 'lw';

export interface VsCoupleResult {
  mode: VsCoupleMode;
  /** The fitted factor C_R and the residual (model − measurement, K) it leaves at the measuring time. */
  c: number;
  residualK: number;
  iterations: number;
  /** false when even the bound of C could not reach the tolerance (the factor is then the bound, named). */
  converged: boolean;
}

/** Which input the coupling scales: the sun when the window had meaningful global radiation. */
export function coupleModeOf(windowForcing: readonly VsHourForcing[]): VsCoupleMode {
  const g = windowForcing.reduce((s, f) => s + f.swDir + f.swDif, 0) / Math.max(1, windowForcing.length);
  return g >= VS_COUPLE.sunWm2 ? 'sw' : 'lw';
}

/** Deep copy of a state (the fit re-runs the window many times from the same start). */
export const cloneState = (s: VsPointState): VsPointState => ({ ...s, T: [...s.T], Tb: s.Tb ? [...s.Tb] : null, stores: { ...s.stores } });

/** Ts at the end of the window when the factor `c` is applied to `mode` over `window` from `start`. */
export function tsWithFactor(start: VsPointState, site: VsSite, prev: VsHourForcing | null, window: readonly VsHourForcing[], mode: VsCoupleMode, c: number): number {
  const st = cloneState(start);
  let ts = NaN, p = prev;
  for (const f of window) {
    const g = mode === 'sw' ? { ...f, cS: c } : { ...f, cL: c };
    ts = integrateHour(st, site, p, g).ts;
    p = f;
  }
  return ts;
}

/**
 * Bisection on C so that |Ts(C) − obs| ≤ tol. Ts is monotone in C for both modes (more incoming radiation ⇒ warmer), so the
 * bracket [cMin, cMax] either contains the root or the nearest bound is returned (`converged: false`).
 */
export function fitCouplingFactor({ start, site, prev = null, window, obsTs, mode = coupleModeOf(window) }:
  { start: VsPointState; site: VsSite; prev?: VsHourForcing | null; window: readonly VsHourForcing[]; obsTs: number; mode?: VsCoupleMode }): VsCoupleResult {
  const f = (c: number) => tsWithFactor(start, site, prev, window, mode, c) - obsTs;
  let lo: number = VS_COUPLE.cMin, hi: number = VS_COUPLE.cMax;
  let flo = f(lo), fhi = f(hi), iterations = 2;
  if (Math.abs(flo) <= VS_COUPLE.tolK) return { mode, c: lo, residualK: round2(flo), iterations, converged: true };
  if (Math.abs(fhi) <= VS_COUPLE.tolK) return { mode, c: hi, residualK: round2(fhi), iterations, converged: true };
  if (flo > 0) return { mode, c: lo, residualK: round2(flo), iterations, converged: false };   // even the dimmest input is too warm
  if (fhi < 0) return { mode, c: hi, residualK: round2(fhi), iterations, converged: false };   // even the brightest input is too cold
  let mid = 1, fmid = f(1); iterations++;
  while (Math.abs(fmid) > VS_COUPLE.tolK && iterations < VS_COUPLE.maxIter) {
    if (fmid < 0) { lo = mid; flo = fmid; } else { hi = mid; fhi = fmid; }
    mid = (lo + hi) / 2; fmid = f(mid); iterations++;
  }
  return { mode, c: Math.round(mid * 1000) / 1000, residualK: round2(fmid), iterations, converged: Math.abs(fmid) <= VS_COUPLE.tolK };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

/** C(t) = 1 + (C_R − 1)·e^(−t/4 h) for t hours after the measurement (Startprompt). */
export const couplingFactorAt = (cR: number, hoursSinceObs: number): number => 1 + (cR - 1) * Math.exp(-Math.max(0, hoursSinceObs) / VS_COUPLE.decayH);

// --- Site correction v1 --------------------------------------------------------------------------

export type VsWeatherClass = 'klar' | 'bewoelkt' | 'windig' | 'nass';
/** Weather classes (`set`): wet = precipitation ≥ 0,1 mm/h or a film; windy ≥ 5 m/s; clear/calm = cloud ≤ 30 % and wind < 3 m/s. */
export const VS_CLASS = Object.freeze({ wetMmH: 0.1, filmMm: 0.05, windyMs: 5, clearPct: 30, calmMs: 3 });
export function weatherClassOf(h: { ff: number; clct: number | null; rain: number; snow: number; frz: number; filmMm?: number | null }): VsWeatherClass {
  if (h.rain + h.snow + h.frz >= VS_CLASS.wetMmH || (h.filmMm ?? 0) >= VS_CLASS.filmMm) return 'nass';
  if (h.ff >= VS_CLASS.windyMs) return 'windig';
  if ((h.clct ?? 100) <= VS_CLASS.clearPct && h.ff < VS_CLASS.calmMs) return 'klar';
  return 'bewoelkt';
}

export const VS_RESIDUAL = Object.freeze({
  schema: 1,
  /** Learning starts after this many days of shadow pairs (Startprompt: frühestens 7 Tage); a cell needs `minN` pairs (`set`);
   *  the mean is shrunk with n/(n + shrinkN) (`set`, the pattern of FB-1's station bias). */
  minDays: 7, minN: 5, shrinkN: 10,
  /** Neighbour transfer for axis points: radius, elevation band, inverse-distance weight, σ factor in clear calm nights (`set`). */
  radiusKm: 25, elevBandM: 300, nightClearSigmaFactor: 1.5,
});

export interface VsResidualPair { station: string; validMs: number; cls: VsWeatherClass; residualK: number }
export interface VsResidualCell { mean: number; sd: number; n: number }
export interface VsResidualTable {
  schema: 1;
  product: 'road-vs-residuals';
  builtAt: string;
  window: { from: string; to: string; days: number; pairs: number };
  minN: number;
  shrinkN: number;
  /** station → `<utcHour>:<class>` → cell (only cells with n ≥ minN). */
  stations: Record<string, Record<string, VsResidualCell>>;
  /** Pooled σ per class over all stations (the spread the page names when no station cell exists). */
  sigma: Record<VsWeatherClass, number>;
}

export const residualKey = (validMs: number, cls: VsWeatherClass) => `${new Date(validMs).getUTCHours()}:${cls}`;

/** Learns the table from pairs (model − measurement, K). Pure; `now` only stamps the file. */
export function learnResiduals(pairs: readonly VsResidualPair[], nowIso: string): VsResidualTable {
  const acc = new Map<string, Map<string, number[]>>();
  const byClass: Record<VsWeatherClass, number[]> = { klar: [], bewoelkt: [], windig: [], nass: [] };
  let from = Infinity, to = -Infinity;
  for (const p of pairs) {
    if (!Number.isFinite(p.residualK)) continue;
    from = Math.min(from, p.validMs); to = Math.max(to, p.validMs);
    let st = acc.get(p.station); if (!st) { st = new Map(); acc.set(p.station, st); }
    const k = residualKey(p.validMs, p.cls);
    let arr = st.get(k); if (!arr) { arr = []; st.set(k, arr); }
    arr.push(p.residualK); byClass[p.cls].push(p.residualK);
  }
  const stations: VsResidualTable['stations'] = {};
  for (const [id, cells] of acc) {
    const out: Record<string, VsResidualCell> = {};
    for (const [k, arr] of cells) {
      if (arr.length < VS_RESIDUAL.minN) continue;
      const m = arr.reduce((s, x) => s + x, 0) / arr.length;
      const sd = Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, arr.length - 1));
      out[k] = { mean: Math.round(m * 100) / 100, sd: Math.round(sd * 100) / 100, n: arr.length };
    }
    if (Object.keys(out).length) stations[id] = out;
  }
  const sigma = Object.fromEntries((Object.keys(byClass) as VsWeatherClass[]).map((c) => {
    const a = byClass[c]; if (a.length < 2) return [c, NaN];
    const m = a.reduce((s, x) => s + x, 0) / a.length;
    return [c, Math.round(Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) * 100) / 100];
  })) as Record<VsWeatherClass, number>;
  const days = Number.isFinite(from) ? Math.round((to - from) / 86_400_000 * 10) / 10 : 0;
  return {
    schema: 1, product: 'road-vs-residuals', builtAt: nowIso,
    window: { from: Number.isFinite(from) ? new Date(from).toISOString() : '', to: Number.isFinite(to) ? new Date(to).toISOString() : '', days, pairs: pairs.length },
    minN: VS_RESIDUAL.minN, shrinkN: VS_RESIDUAL.shrinkN, stations, sigma,
  };
}

/** Correction (K, to SUBTRACT from the model: model − measurement) for a station at an hour/class, shrunk; 0 without a cell. */
export function stationCorrection(tab: VsResidualTable | null, station: string, validMs: number, cls: VsWeatherClass): { k: number; n: number } {
  const cell = tab?.stations[station]?.[residualKey(validMs, cls)];
  if (!cell) return { k: 0, n: 0 };
  return { k: Math.round(cell.mean * (cell.n / (cell.n + tab!.shrinkN)) * 100) / 100, n: cell.n };
}

export interface VsNeighbourSite { id: string; lat: number; lon: number; h: number | null; terrain: string }

/**
 * Residual transferred to an axis point from the GMA of the same elevation band and terrain class within the radius,
 * weighted 1/d (never the raw values). `null` without a neighbour with a cell.
 */
export function neighbourCorrection(tab: VsResidualTable | null, me: VsNeighbourSite, gma: readonly VsNeighbourSite[], validMs: number, cls: VsWeatherClass): { k: number; n: number; from: string[] } | null {
  if (!tab) return null;
  const band = (h: number | null) => (h == null ? -1 : Math.floor(h / VS_RESIDUAL.elevBandM));
  const cosLat = Math.cos((me.lat * Math.PI) / 180);
  let wsum = 0, ksum = 0, n = 0;
  const from: string[] = [];
  for (const g of gma) {
    if (band(g.h) !== band(me.h) || g.terrain !== me.terrain) continue;
    const dy = (g.lat - me.lat) * 111.2, dx = (g.lon - me.lon) * 111.2 * cosLat;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > VS_RESIDUAL.radiusKm) continue;
    const c = stationCorrection(tab, g.id, validMs, cls);
    if (!c.n) continue;
    const w = 1 / Math.max(0.5, d);
    wsum += w; ksum += w * c.k; n++; from.push(g.id);
  }
  if (!n) return null;
  return { k: Math.round((ksum / wsum) * 100) / 100, n, from };
}

/** σ of the corrected forecast: pooled class σ, ×1,5 in clear calm nights (Startprompt). */
export function correctedSigma(tab: VsResidualTable | null, cls: VsWeatherClass, validMs: number, fallbackK: number): number {
  const base = tab && Number.isFinite(tab.sigma[cls]) ? tab.sigma[cls] : fallbackK;
  const h = new Date(validMs).getUTCHours();
  const night = h >= 19 || h < 4;
  return Math.round(base * (cls === 'klar' && night ? VS_RESIDUAL.nightClearSigmaFactor : 1) * 100) / 100;
}
