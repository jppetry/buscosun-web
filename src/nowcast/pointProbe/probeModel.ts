/**
 * Regenradar — Punktansicht am Mauszeiger (Phase P3D, `audit/regenradar-punkt3d.md`): pure logic.
 *
 * Everything here is a named constant or a pure function — no DOM, no maplibre — so the readout at the pointer and the
 * dock card read ONE model and a verifier could import it headless. (The 3D column and its particle physics were
 * dropped on Jan's request, 19.10.)
 */
import { classifyPrecipitation, type PrecipitationType } from '../../pointForecast/precipType';
import { phaseLabel } from '../../pointForecast/fusion/meteo';
import { hasHail } from '../../radar/hailField';
import type { Konrad3dCell, Konrad3dRun } from '../../radar/konrad3d';
import { PRECIP_VMAX, precipFromU8Log } from '../../scalar/RainLayer';
import { sampleRadarIndex, type RadarGridSource } from '../../pointForecast/radarSample';
import type { QuadCorners } from '../../scalar/RainLayer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Jennings et al. 2018 (bivariate logistic regression, T in °C, RH in %): p(snow) = 1 / (1 + e^(a + b·T + c·RH)). */
export const JENNINGS_A = -10.04;
export const JENNINGS_B = 1.41;
export const JENNINGS_C = 0.09;
/** Mixed zone of the Jennings probability — sleet between these (`set`). */
export const JENNINGS_MIX_LO = 0.3;
export const JENNINGS_MIX_HI = 0.7;
/** The radar's own display threshold — below it the frame is „trocken" (same as the map). */
export const PROBE_DRY_MMH = 0.06;
/** A cell counts as „am Zeiger" inside its hull or within this distance of its centroid (km, `set`). */
export const CELL_NEAR_KM = 10;
/** Debounce of the point values after the pointer rests (ms) and the cell size of the point cache (°). */
export const PROBE_POINT_DEBOUNCE_MS = 200;
export const PROBE_CACHE_CELL_DEG = 0.02;
/** A frame older than the radar's newest measurement by less than this is still „gemessen" (ms). */
export const PROBE_MEASURED_TOL_MS = 60_000;

export type ProbePhase = 'rain' | 'sleet' | 'snow' | 'hail';
export type ProbeZone = 'measured' | 'nowcast' | 'model';

/** Jennings et al. 2018: probability of snow from air temperature (°C) and relative humidity (%). */
export function jenningsSnowP(tempC: number, rhPct: number): number {
  return 1 / (1 + Math.exp(JENNINGS_A + JENNINGS_B * tempC + JENNINGS_C * rhPct));
}

export interface PhaseInput {
  rateMmH: number;
  /** buscosun Fusion's own phase at the point (wet-bulb, `fusion.pSnow`) — the first choice when present. */
  pSnow: number | null;
  tempC: number | null;
  rhPct: number | null;
  snowLineM: number | null;
  elevM: number | null;
  /** Hail only with evidence (KONRAD3D flag of the cell at the pointer) — never from the rate alone. */
  hailEvidence: boolean;
}

export interface PhaseResult {
  phase: ProbePhase | null;
  /** How it was derived — shown next to the word („abgeleitet", the radar measures no phase). */
  basis: 'fusion' | 'snowline' | 'jennings' | 'temperature' | 'hail' | 'none';
}

/**
 * Phase at the point: existing logic first — buscosun Fusion's wet-bulb phase (`pSnow` → `phaseLabel`), then
 * `classifyPrecipitation` with snow line + elevation (the Nowcast engine's rule), then Jennings 2018 from T + RH,
 * the plain temperature thresholds last. Hail overrides with evidence only.
 */
export function derivePhase(i: PhaseInput): PhaseResult {
  if (!(i.rateMmH >= PROBE_DRY_MMH)) return { phase: null, basis: 'none' };
  if (i.hailEvidence) return { phase: 'hail', basis: 'hail' };
  if (i.pSnow != null && Number.isFinite(i.pSnow)) return { phase: phaseLabel(i.pSnow), basis: 'fusion' };
  const hasLine = i.snowLineM != null && Number.isFinite(i.snowLineM) && i.elevM != null && Number.isFinite(i.elevM);
  if (hasLine) {
    const t = classifyPrecipitation(i.tempC, i.rateMmH, { snowLineM: i.snowLineM, sampleElevM: i.elevM });
    return { phase: asPhase(t), basis: 'snowline' };
  }
  if (i.tempC != null && i.rhPct != null) {
    const p = jenningsSnowP(i.tempC, i.rhPct);
    const phase: ProbePhase = p >= JENNINGS_MIX_HI ? 'snow' : p <= JENNINGS_MIX_LO ? 'rain' : 'sleet';
    return { phase, basis: 'jennings' };
  }
  if (i.tempC != null) return { phase: asPhase(classifyPrecipitation(i.tempC, i.rateMmH)), basis: 'temperature' };
  return { phase: null, basis: 'none' };
}

function asPhase(t: PrecipitationType): ProbePhase | null {
  return t === 'rain' || t === 'sleet' || t === 'snow' ? t : null;
}

export const PHASE_LABEL: Record<ProbePhase, string> = { rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel' };
export const PHASE_BASIS_LABEL: Record<PhaseResult['basis'], string> = {
  fusion: 'abgeleitet · buscosun Fusion (Feuchtkugel)',
  snowline: 'abgeleitet · Schneefallgrenze und Ortshöhe',
  jennings: 'abgeleitet · Temperatur und Feuchte',
  temperature: 'abgeleitet · Temperatur',
  hail: 'KONRAD3D-Kennung der Zelle',
  none: '',
};

// ---------------------------------------------------------------------------
// Intensity — classes of the radar legend
// ---------------------------------------------------------------------------

/** Legend class word (DWD-near bands as the Regenradar uses them). */
export function rateClass(rateMmH: number): string {
  if (rateMmH < PROBE_DRY_MMH) return 'trocken';
  if (rateMmH < 0.5) return 'sehr leicht';
  if (rateMmH < 2) return 'leicht';
  if (rateMmH < 5) return 'mäßig';
  if (rateMmH < 12) return 'stark';
  return 'sehr stark';
}


// ---------------------------------------------------------------------------
// Radar frame at the pointer
// ---------------------------------------------------------------------------

export interface ProbeFrame {
  values: Uint8Array;
  values2?: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
}

/**
 * Rate (mm/h) of ONE displayed frame at (lat, lon): the log plane when the slot carries one (exact above 20 mm/h),
 * else the v1 byte (linear, saturates at PRECIP_VMAX). `null` outside the grid, `0` dry.
 */
export function sampleFrameMmH(source: RadarGridSource, f: ProbeFrame, lat: number, lon: number): number | null {
  const idx = sampleRadarIndex(source, f.width, f.height, f.corners, lat, lon);
  if (idx == null) return null;
  if (f.values2) return precipFromU8Log(f.values2[idx]);
  const u = f.values[idx];
  return u === 0 ? 0 : (u / 255) * PRECIP_VMAX;
}

// ---------------------------------------------------------------------------
// Cell at the pointer
// ---------------------------------------------------------------------------

export function pointInHull(hull: ReadonlyArray<readonly [number, number]>, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const xi = hull[i][0], yi = hull[i][1], xj = hull[j][0], yj = hull[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface ProbeCell {
  cell: Konrad3dCell;
  inside: boolean;
  distKm: number;
  /** Hail evidence of THIS cell (KONRAD3D flag ≥ 1 or a hail area) — only the inside cell counts for the phase. */
  hail: boolean;
}

/** The KONRAD3D cell at the pointer: inside its hull, else the nearest centroid within `CELL_NEAR_KM`. */
export function cellAtPoint(run: Konrad3dRun | null, lat: number, lon: number): ProbeCell | null {
  if (!run?.cells.length) return null;
  let best: ProbeCell | null = null;
  for (const c of run.cells) {
    const inside = c.hull.length >= 3 && pointInHull(c.hull, lon, lat);
    const distKm = haversineKm(lat, lon, c.lat, c.lon);
    if (!inside && distKm > CELL_NEAR_KM) continue;
    const hail = hasHail(c);
    const cand: ProbeCell = { cell: c, inside, distKm, hail };
    if (!best || (cand.inside && !best.inside) || (cand.inside === best.inside && cand.distKm < best.distKm)) best = cand;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Formatting (German, dock card)
// ---------------------------------------------------------------------------

const COMPASS16 = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass16(deg: number): string {
  return COMPASS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt0 = (n: number): string => Math.round(n).toLocaleString('de-DE');
export const fmtClock = (ms: number): string => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const msToKmh = (ms: number): number => ms * 3.6;

/** Dew point (°C) from T and RH — Magnus (Alduchov & Eskridge 1996), `literature`. */
export function dewPointC(tempC: number, rhPct: number): number {
  const a = 17.625, b = 243.04;
  const g = Math.log(Math.max(1, Math.min(100, rhPct)) / 100) + (a * tempC) / (b + tempC);
  return (b * g) / (a - g);
}

export const ZONE_LABEL: Record<ProbeZone, string> = { measured: 'gemessen', nowcast: 'Nowcast', model: 'Modell' };
