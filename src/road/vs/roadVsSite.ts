/**
 * AW-6.2.2 — the STATIC site features of every point of the virtual road sensor (`road/vs/v1/static/site.json.gz`,
 * `audit/autobahnwetter.md` §20.8): horizon in 1° steps and sky-view factor from the Copernicus DEM GLO-30, bridge / cutting /
 * embankment / forest / surface from OSM (through `road/v1/static/segments.json`) and the DWD SWSMOS catalogue, terrain class
 * from the terrain cache of the route forecast, cross slope 2,5 % (E-VS-5). Built once by `scripts/road/vs/build-site.mjs`;
 * read by the model (6.2.3) and the verifier. Dependency-free. Every number here is `set` or carries its source.
 */

export const ROAD_VS_SITE_SCHEMA = 1;
export const ROAD_VS_SITE_PRODUCT = 'road-vs-site';
export const ROAD_VS_SITE_PATH = 'static/site.json.gz';

/** Horizon directions: azimuth 0 … 359°, clockwise from north; stored in 0,1° (integer). */
export const ROAD_VS_HORIZON_N = 360;
/** Near field of the horizon at 30 m: rays to this distance (`set`: obstacles that shade a road at low sun lie within a few km;
 *  beyond it the 8-direction horizon of the terrain cache (z8, 20 km) takes over). */
export const ROAD_VS_HORIZON_NEAR_KM = 5;
export const ROAD_VS_HORIZON_STEP_M = 30;
/** Atmospheric refraction coefficient in the dip of the horizon (`literature`: k ≈ 0,13 for terrestrial sight lines). */
export const ROAD_VS_REFRACTION_K = 0.13;
export const EARTH_RADIUS_M = 6_371_000;
/** E-VS-5: standard cross slope of a straight motorway (RAA 2008: q = 2,5 %). */
export const ROAD_VS_CROSS_SLOPE_PCT = 2.5;
/** Curves below this radius carry superelevation and twist zones ⇒ geometry `unknown` (`set`, RAA 2008 Tab. 12: q > 2,5 % below
 *  ≈ 4 000 m at 130 km/h design speed). */
export const ROAD_VS_CURVE_UNKNOWN_R_M = 4000;
/** Carriageway width per direction when OSM lanes are unknown (`set`: RAA RQ 31 — two lanes 3,75 + 3,5 m ≈ 7,5 m without shoulder). */
export const ROAD_VS_LANE_WIDTH_M = 3.75;
export const ROAD_VS_DEFAULT_LANES = 2;
/** Terrain classes from TPI (m) and slope (°) of the terrain cache (`set`). */
export const ROAD_VS_TERRAIN = Object.freeze({ valleyTpi2000: -15, ridgeTpi2000: 15, slopeDeg: 5 });
/** A stretch counts as concrete when the OSM share of concrete carriageway in its segment is at least this (`set`). */
export const ROAD_VS_CONCRETE_SHARE = 0.5;

export type RoadVsTerrainClass = 'tal' | 'kuppe' | 'hang' | 'eben' | 'unbekannt';
export type RoadVsSurface = 'asphalt' | 'beton';
export type RoadVsSource = 'osm' | 'swsmos' | 'points' | 'terrain' | 'glo30' | 'set' | null;

export interface RoadVsSitePoint {
  /** Horizon elevation per azimuth, 0,1° (360 values); null when the DEM was not available. */
  hz: number[] | null;
  /** Sky-view factor 1 − (1/n)·Σ sin γ_i over the 360 directions; null without horizon. */
  svf: number | null;
  /** DSM height at the point (m, GLO-30) and the terrain cache's elevation (m). */
  zDsm: number | null;
  zTerrain: number | null;
  bridge: boolean;
  bridgeSrc: RoadVsSource;
  /** Shares 0 … 1 of the segment the point lies in (OSM/WorldCover via segments.json); null without a segment. */
  cutting: number | null;
  embankment: number | null;
  forest: number | null;
  surface: RoadVsSurface;
  surfaceSrc: RoadVsSource;
  lanes: number | null;
  lanesSrc: RoadVsSource;
  /** Carriageway width used by Gallaway (m, per direction). */
  widthM: number;
  terrain: RoadVsTerrainClass;
  tpi500: number | null;
  tpi2000: number | null;
  slopeDeg: number | null;
  /** Cross slope (%) and whether the geometry is the standard one (`unknown` inside curves, E-VS-5). */
  crossSlopePct: number;
  geom: 'standard' | 'unknown';
  curveRadiusM: number | null;
  segment: string | null;
}

export interface RoadVsSiteFile {
  schema: 1;
  product: 'road-vs-site';
  builtAt: string;
  /** sha12 of the points file. */
  points: string;
  near: { km: number; stepM: number; dem: string };
  far: string;
  sources: Array<{ what: string; name: string; license: string; attribution: string }>;
  counts: Record<string, number>;
  site: Record<string, RoadVsSitePoint>;
}

/** Sky-view factor from a horizon in degrees: F_sv = 1 − (1/n)·Σ sin γ_i (Startprompt; n = 360 ≥ 16). */
export function svfOf(horizonDeg: ArrayLike<number>): number {
  let s = 0;
  const n = horizonDeg.length;
  for (let i = 0; i < n; i++) s += Math.sin(Math.max(0, Math.min(90, horizonDeg[i])) * Math.PI / 180);
  return Math.round((1 - s / n) * 1000) / 1000;
}

/** Horizon elevation (°) at an azimuth, linear between the 1° samples (stored 0,1°). */
export function horizonAt(hz: ArrayLike<number>, azDeg: number): number {
  const n = hz.length;
  const a = ((azDeg % 360) + 360) % 360;
  const i = Math.floor(a * n / 360), f = a * n / 360 - i;
  return (hz[i % n] * (1 - f) + hz[(i + 1) % n] * f) / 10;
}

/** 8-direction horizon (N, NE, E, … clockwise) of the terrain cache → 360 directions by linear interpolation (°). */
export function horizon8to360(h8: ArrayLike<number>): Float64Array {
  const out = new Float64Array(ROAD_VS_HORIZON_N);
  for (let az = 0; az < ROAD_VS_HORIZON_N; az++) {
    const p = az / 45, i = Math.floor(p), f = p - i;
    out[az] = h8[i % 8] * (1 - f) + h8[(i + 1) % 8] * f;
  }
  return out;
}

/** Elevation angle (°) of a DEM sample at distance d (m) and height dz (m) above the observer, with earth curvature and refraction. */
export function horizonAngleDeg(dzM: number, dM: number): number {
  const dip = (dM * dM) / (2 * EARTH_RADIUS_M) * (1 - ROAD_VS_REFRACTION_K);
  return Math.atan2(dzM - dip, dM) * 180 / Math.PI;
}

export function terrainClassOf(tpi2000: number | null, slopeDeg: number | null): RoadVsTerrainClass {
  if (tpi2000 == null && slopeDeg == null) return 'unbekannt';
  if (tpi2000 != null && tpi2000 <= ROAD_VS_TERRAIN.valleyTpi2000) return 'tal';
  if (tpi2000 != null && tpi2000 >= ROAD_VS_TERRAIN.ridgeTpi2000) return 'kuppe';
  if (slopeDeg != null && slopeDeg >= ROAD_VS_TERRAIN.slopeDeg) return 'hang';
  return 'eben';
}

/** Radius (m) of the arc through three consecutive points of a line; null when collinear or too short. */
export function curveRadiusM(a: [number, number], b: [number, number], c: [number, number]): number | null {
  const cosLat = Math.cos((b[1] * Math.PI) / 180);
  const xy = (p: [number, number]): [number, number] => [(p[0] - b[0]) * 111_200 * cosLat, (p[1] - b[1]) * 111_200];
  const [ax, ay] = xy(a), [cx, cy] = xy(c);
  const d = 2 * (ax * cy - ay * cx);
  if (Math.abs(d) < 1e-6) return null;
  const a2 = ax * ax + ay * ay, c2 = cx * cx + cy * cy;
  const ux = (cy * a2 - ay * c2) / d, uy = (ax * c2 - cx * a2) / d;
  const r = Math.hypot(ux, uy);
  return Number.isFinite(r) ? Math.round(r) : null;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function roadVsSiteProblems(j: unknown): string[] {
  if (!isObj(j)) return ['kein Objekt'];
  const out: string[] = [];
  if (j.schema !== ROAD_VS_SITE_SCHEMA || j.product !== ROAD_VS_SITE_PRODUCT) out.push('Kopf');
  if (!isObj(j.site) || !Object.keys(j.site).length) { out.push('site leer'); return out; }
  let bad = 0;
  for (const p of Object.values(j.site) as unknown[]) {
    if (!isObj(p)) { bad++; continue; }
    if (p.hz !== null && (!Array.isArray(p.hz) || p.hz.length !== ROAD_VS_HORIZON_N || !p.hz.every((x) => Number.isInteger(x) && x >= 0 && x <= 900))) { bad++; continue; }
    if (p.svf !== null && (typeof p.svf !== 'number' || p.svf < 0 || p.svf > 1)) { bad++; continue; }
    if (typeof p.bridge !== 'boolean' || (p.surface !== 'asphalt' && p.surface !== 'beton') || (p.geom !== 'standard' && p.geom !== 'unknown') || typeof p.widthM !== 'number') bad++;
  }
  if (bad) out.push(`${bad} Punkte mit falscher Form`);
  return out;
}
