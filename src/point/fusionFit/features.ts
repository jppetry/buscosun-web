/**
 * features.ts — the site and situation features Z of the learning stage of buscosun Fusion (phase FL,
 * `audit/fusion-lernphase.md` §3.2, §4). Pure: numbers in, a Float64Array out. The same function feeds the fit
 * (`scripts/fusionfit/fit.mjs`), the scorer and, later, the client path (`predict.ts`) — one definition, never two.
 *
 * Every feature is dimensionless or scaled to O(1) so a ridge penalty treats them alike:
 *   dh in km, TPI and sink depth in hm, slope in 10°, imperviousness 0…1, d0 in dam, distances in units of the
 *   20-km search radius, roughness as ln z0. Land-cover shares omit `open` (the reference class). Harmonics of the
 *   local solar hour and of the day of year carry the diurnal and annual cycles; `leadFrac` the position inside the
 *   lead bin. `dTsfc` is the 2-m decoupling proxy (§3.1 A3): t2m minus the 850-hPa temperature brought to the model
 *   height with the standard lapse from the standard-atmosphere height of 850 hPa — approximate on purpose, the
 *   ridge decides what it is worth (`set`, named in the table).
 */

export const Z_NAMES = Object.freeze([
  '1', 'dh', 'absDh', 'tpi500', 'tpi2000', 'svf', 'sink', 'slope', 'slopeCosA', 'slopeSinA', 'lnZ0', 'lnZ0Ratio',
  'lcWater', 'lcUrban', 'lcForest', 'lcBare', 'lcSnow', 'dWater', 'lake', 'imperv', 'd0', 'foehn', 'fRad', 'dTsfc',
  'hSin1', 'hCos1', 'hSin2', 'hCos2', 'dSin1', 'dCos1', 'dSin2', 'dCos2', 'leadFrac',
] as const);
export type ZName = (typeof Z_NAMES)[number];
export const Z_DIM = Z_NAMES.length;
export const Z_INDEX: Readonly<Record<ZName, number>> = Object.freeze(Object.fromEntries(Z_NAMES.map((n, i) => [n, i])) as Record<ZName, number>);

/** Standard-atmosphere height of 850 hPa (m) and the standard lapse (K/m) — `literature`, for the decoupling proxy only. */
export const Z850_STD_M = 1457;
export const STD_LAPSE_PER_M = 0.0065;
export const DEWPOINT_LAPSE_PER_M = 0.0018;
export const WATER_SEARCH_M = 20_000;

/** The static part of Z for one point (from the feature table). */
export interface SiteFeatures {
  hTrueM: number;
  tpi500M: number | null; tpi2000M: number | null; svf: number | null; sinkDepthM: number | null;
  slopeDeg: number | null; aspectDeg: number | null;
  z0True: number | null;
  /** Land-cover group shares in the order water, urban, forest, open, bare, snow (sum ≈ 1) or null. */
  lcShares: readonly number[] | null;
  dWaterM: number | null; dLakeM: number | null;
  impervPct: number | null; d0M: number | null;
  lonDeg: number;
}

/** The situation part of Z for one row. */
export interface SituationFeatures {
  /** h_true − h_mod (m) of the predictor this row is about (grid hModEff for form K, the source's height for form P). */
  dhM: number;
  z0ModTier: number | null;
  foehnFactor: number | null;
  fRad: number | null;
  /** t2m − T850 lifted to h_mod with the standard lapse (K); null when 850 hPa is absent. */
  dTsfcK: number | null;
  validAtMs: number;
  leadH: number;
  binFromH: number; binToH: number;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const nz = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? d : x);

/** Local solar hour (0…24) from UTC time and longitude. */
export function solarHour(validAtMs: number, lonDeg: number): number {
  const d = new Date(validAtMs);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60 + lonDeg / 15;
  return ((h % 24) + 24) % 24;
}
export function dayOfYear(validAtMs: number): number {
  const d = new Date(validAtMs);
  return (validAtMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
}

/** The decoupling proxy: t2m − [T850 + Γ_std·(z850_std − h_mod)]. */
export function dTsfcProxy(t2m: number | null, t850: number | null, hModM: number | null): number | null {
  if (t2m == null || t850 == null || hModM == null || !Number.isFinite(t2m) || !Number.isFinite(t850) || !Number.isFinite(hModM)) return null;
  return t2m - (t850 + STD_LAPSE_PER_M * (Z850_STD_M - hModM));
}

/** Build Z into `out` (length Z_DIM); returns `out`. */
export function buildZ(site: SiteFeatures, s: SituationFeatures, out: Float64Array = new Float64Array(Z_DIM)): Float64Array {
  const I = Z_INDEX;
  out[I['1']] = 1;
  out[I.dh] = s.dhM / 1000;
  out[I.absDh] = Math.abs(s.dhM) / 1000;
  out[I.tpi500] = nz(site.tpi500M) / 100;
  out[I.tpi2000] = nz(site.tpi2000M) / 100;
  out[I.svf] = nz(site.svf, 1);
  out[I.sink] = nz(site.sinkDepthM) / 100;
  const slope = nz(site.slopeDeg) / 10, asp = (nz(site.aspectDeg) * Math.PI) / 180;
  out[I.slope] = slope;
  out[I.slopeCosA] = slope * Math.cos(asp);
  out[I.slopeSinA] = slope * Math.sin(asp);
  const lnZ0 = site.z0True != null && site.z0True > 0 ? Math.log(site.z0True) : Math.log(0.1);
  out[I.lnZ0] = lnZ0;
  out[I.lnZ0Ratio] = s.z0ModTier != null && s.z0ModTier > 0 && site.z0True != null && site.z0True > 0 ? Math.log(site.z0True / s.z0ModTier) : 0;
  const lc = site.lcShares;
  out[I.lcWater] = lc ? nz(lc[0]) : 0; out[I.lcUrban] = lc ? nz(lc[1]) : 0; out[I.lcForest] = lc ? nz(lc[2]) : 0; out[I.lcBare] = lc ? nz(lc[4]) : 0; out[I.lcSnow] = lc ? nz(lc[5]) : 0;
  out[I.dWater] = clamp(nz(site.dWaterM, WATER_SEARCH_M), 0, WATER_SEARCH_M) / WATER_SEARCH_M;
  out[I.lake] = clamp(nz(site.dLakeM, WATER_SEARCH_M), 0, WATER_SEARCH_M) / WATER_SEARCH_M;
  out[I.imperv] = nz(site.impervPct) / 100;
  out[I.d0] = nz(site.d0M) / 10;
  out[I.foehn] = nz(s.foehnFactor, 1);
  out[I.fRad] = nz(s.fRad);
  out[I.dTsfc] = nz(s.dTsfcK);
  const th = (2 * Math.PI * solarHour(s.validAtMs, site.lonDeg)) / 24;
  out[I.hSin1] = Math.sin(th); out[I.hCos1] = Math.cos(th); out[I.hSin2] = Math.sin(2 * th); out[I.hCos2] = Math.cos(2 * th);
  const td = (2 * Math.PI * dayOfYear(s.validAtMs)) / 365.25;
  out[I.dSin1] = Math.sin(td); out[I.dCos1] = Math.cos(td); out[I.dSin2] = Math.sin(2 * td); out[I.dCos2] = Math.cos(2 * td);
  out[I.leadFrac] = s.binToH > s.binFromH ? clamp((s.leadH - s.binFromH) / (s.binToH - s.binFromH), 0, 1) : 0;
  return out;
}

/** Stage A per source: the raw value at the source's model height brought to h_true. */
export function sourceToPoint(varId: 't2m' | 'td2m' | 'u10' | 'v10' | 'gust' | 'clct' | 'precip' | 'ps', raw: number, hModSourceM: number, hTrueM: number): number {
  switch (varId) {
    case 't2m': return raw + STD_LAPSE_PER_M * (hModSourceM - hTrueM);
    case 'td2m': return raw + DEWPOINT_LAPSE_PER_M * (hModSourceM - hTrueM);
    default: return raw;
  }
}

/** Meteorological wind (speed, direction FROM) → components (u east, v north). */
export function windComponents(ff: number, ddDeg: number): { u: number; v: number } {
  const r = (ddDeg * Math.PI) / 180;
  return { u: -ff * Math.sin(r), v: -ff * Math.cos(r) };
}
