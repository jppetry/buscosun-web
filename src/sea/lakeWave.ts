/**
 * Phase BS — estimated wind wave on a lake ("geschätzte Windwelle (eigene Rechnung)"), a pure function.
 *
 * Method (`literature`): U.S. Army Corps of Engineers, Coastal Engineering Research Center, **Shore Protection Manual**,
 * 4th ed. 1984, Vol. I, chapter 3 (public domain, scan: https://archive.org/details/shoreprotectionm01unit):
 *
 *   wind-stress factor        U_A = 0.71 · U^1.23                    (3-28a; U = 10-m wind in m/s)
 *   deep water, fetch-limited g·H/U_A² = 1.6·10⁻³ · (g·F/U_A²)^1/2   (3-33)
 *                             g·T/U_A  = 2.857·10⁻¹ · (g·F/U_A²)^1/3 (3-34)
 *   fully arisen sea (cap)    g·H/U_A² = 2.433·10⁻¹, g·T/U_A = 8.134 (3-36, 3-37)
 *   water of constant depth d g·H/U_A² = 0.283 · tanh[0.530 (g·d/U_A²)^3/4] · tanh{ 0.00565 (g·F/U_A²)^1/2 / tanh[0.530 (g·d/U_A²)^3/4] }   (3-39)
 *                             g·T/U_A  = 7.54  · tanh[0.833 (g·d/U_A²)^3/8] · tanh{ 0.0379  (g·F/U_A²)^1/3 / tanh[0.833 (g·d/U_A²)^3/8] }   (3-40)
 *   which equations           "For depths greater than 90 meters (300 feet), the revised deepwater forecasting equations
 *                             should be used" (p. 3-66); up to 90 m (3-39)/(3-40)
 *   fetch on an irregular shore  nine radials at 3° spacing from the point, each to its first shoreline, arithmetic mean
 *                             (p. 3-41) — computed by the catalogue builder per 10° of wind direction
 *
 * Worked cases of the manual the verifier holds this file against (`verify:sea-lakes`):
 *   Example Problem 5 (p. 3-66): F = 24.4 km, U_A = 22 m/s, d = 11 m  ⇒  H_s = 1.5 m, T = 4.4 s
 *   Example Problem 4 (p. 3-51 f.): U = 23.5 m/s ⇒ U_A = 34.5 m/s; F = 10 km ⇒ H_m0 = 1.75 m, T_m = 4.4 s; F = 100 km ⇒ T_m = 9.4 s
 *
 * What the estimate assumes — and the page says so: a steady wind that has blown long enough for the fetch (the
 * manual's duration check is not made: with a wind that has just risen the real wave is lower), ONE depth for the whole
 * lake (its mean depth, `set`), the wind of buscosun Fusion at the spot's water point taken as the manual's over-water
 * wind (no stability and no location factor: R_T = R_L = 1, `set`). No swell, no refraction, no shoaling at the shore.
 * It is an estimate for the open water in front of the spot, never an official value and never a class.
 */

const G = 9.81;

/** Depth above which the manual sends the reader to the deep-water equations (p. 3-66). */
export const LAKE_WAVE_DEEP_M = 90;
/** Directions of the fetch table: one value per 10° the wind comes FROM, index k = k · 10°. */
export const LAKE_FETCH_STEP_DEG = 10;
export const LAKE_FETCH_BINS = 360 / LAKE_FETCH_STEP_DEG;
/** The manual's radials: nine, 3° apart, centred on the direction (±12°). */
export const LAKE_FETCH_RADIALS = Object.freeze({ count: 9, stepDeg: 3 });

export const LAKE_WAVE_SOURCE = Object.freeze({
  title: 'Shore Protection Manual, 4. Auflage 1984, Band I, Kapitel 3',
  by: 'U.S. Army Corps of Engineers, Coastal Engineering Research Center',
  url: 'https://archive.org/details/shoreprotectionm01unit',
  equations: '(3-28a), (3-33), (3-34), (3-36), (3-37), (3-39), (3-40)',
});

/** (3-28a) — wind-stress factor in m/s from the 10-m wind in m/s. */
export const windStressFactor = (u10Ms: number): number => 0.71 * Math.pow(u10Ms, 1.23);

export interface LakeWave {
  /** Significant wave height in m. */
  hsM: number;
  /** Period in s — deep water: period of the spectral peak T_m; constant depth: the manual's significant period T. */
  periodS: number;
  /** Which equations: constant depth (3-39/3-40) or deep water (3-33/3-34). */
  regime: 'depth' | 'deep';
  /** Deep water only: the fully arisen sea capped the fetch-limited value. */
  capped: boolean;
}

/** (3-39), (3-40): wind-stress factor, fetch and constant depth in SI units. */
export function spmDepthLimited(uA: number, fetchM: number, depthM: number): { hsM: number; periodS: number } {
  const u2 = uA * uA;
  const fh = G * fetchM / u2, dh = G * depthM / u2;
  const a = Math.tanh(0.530 * Math.pow(dh, 0.75));
  const b = Math.tanh(0.833 * Math.pow(dh, 0.375));
  const hsM = (u2 / G) * 0.283 * a * Math.tanh(0.00565 * Math.sqrt(fh) / a);
  const periodS = (uA / G) * 7.54 * b * Math.tanh(0.0379 * Math.cbrt(fh) / b);
  return { hsM, periodS };
}

/** (3-33), (3-34) with the fully arisen sea (3-36), (3-37) as the cap. */
export function spmDeep(uA: number, fetchM: number): { hsM: number; periodS: number; capped: boolean } {
  const u2 = uA * uA;
  const fh = G * fetchM / u2;
  const h = 1.6e-3 * Math.sqrt(fh), t = 2.857e-1 * Math.cbrt(fh);
  const capped = h > 2.433e-1 || t > 8.134;
  return { hsM: (u2 / G) * Math.min(h, 2.433e-1), periodS: (uA / G) * Math.min(t, 8.134), capped };
}

/**
 * The estimate of one hour: 10-m wind (m/s), fetch along the wind (m), the lake's depth (m). `null` without a wind, a
 * fetch or a depth; a fetch of 0 (wind from the land right behind the spot) is a wave of 0.
 */
export function lakeWindWave(x: { windMs: number | null | undefined; fetchM: number | null | undefined; depthM: number | null | undefined }): LakeWave | null {
  const { windMs, fetchM, depthM } = x;
  if (windMs == null || fetchM == null || depthM == null) return null;
  if (!Number.isFinite(windMs) || !Number.isFinite(fetchM) || !Number.isFinite(depthM) || windMs < 0 || fetchM < 0 || depthM <= 0) return null;
  if (windMs === 0 || fetchM === 0) return { hsM: 0, periodS: 0, regime: depthM > LAKE_WAVE_DEEP_M ? 'deep' : 'depth', capped: false };
  const uA = windStressFactor(windMs);
  if (depthM > LAKE_WAVE_DEEP_M) { const d = spmDeep(uA, fetchM); return { hsM: d.hsM, periodS: d.periodS, regime: 'deep', capped: d.capped }; }
  const s = spmDepthLimited(uA, fetchM, depthM);
  return { hsM: s.hsM, periodS: s.periodS, regime: 'depth', capped: false };
}

/**
 * Fetch (m) for a wind coming from `fromDeg`: linear between the two neighbouring directions of the table (36 values,
 * one per 10°, each already the manual's mean of nine radials). `null` without a direction or a usable table.
 */
export function lakeFetchAt(fetch: readonly number[] | null | undefined, fromDeg: number | null | undefined): number | null {
  if (!fetch || fetch.length !== LAKE_FETCH_BINS || fromDeg == null || !Number.isFinite(fromDeg)) return null;
  const d = ((fromDeg % 360) + 360) % 360 / LAKE_FETCH_STEP_DEG;
  const k = Math.floor(d), f = d - k;
  const a = fetch[k % LAKE_FETCH_BINS], b = fetch[(k + 1) % LAKE_FETCH_BINS];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + (b - a) * f;
}
