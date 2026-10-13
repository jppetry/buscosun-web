/**
 * AW-7.1 — Contract of the motorway SEGMENTS of Autobahnwetter (`buscosun-data/road/v1/static/segments.json`):
 * ONE file for the builder (`scripts/road/build-segments.mjs`), the hazard derive (`scripts/road/road-hazards.mjs`),
 * the client (`src/road/RoadHazard*.tsx`) and the verifiers. Diagnosis and rulings: `audit/autobahnwetter.md` §19,
 * specification `audit/autobahnwetter-gefahren.md` (E-AW-32).
 *
 * What a segment is: a stretch of a corridor (`static/corridors.json`, BKG DLM250 axis) between two OSM motorway
 * junctions (`highway=motorway_junction`, ODbL), 5–25 km long (shorter pieces merged with a neighbour, longer ones
 * split into equal parts). Its support points are the axis points of the route forecast (`road/fc/v1/static/points.json`,
 * every 5 km, snapped onto the OSM carriageway) and the measuring stations of the corridor inside the segment and up to
 * `ROAD_SEG_STATION_REACH_KM` before and after it. Site features (bridge, tunnel, cutting, embankment, forest, cropland,
 * concrete surface, height, gradient, lowland) carry their source and licence per field in the file head — they never
 * trigger a hazard level on their own (gefahren §Grundsatz 4).
 *
 * Deviation from the specification, recorded as V-AW-47: the id is `<Road>-<km of the begin, 3 digits>` WITHOUT a
 * direction suffix. Both carriageways share one segment; the hazard file names the direction only where the rule is
 * direction-dependent (`sonne`). The specification's rows ("km 9–24 · beide Richtungen") are one row per stretch too.
 *
 * Importfree except `roadFc.ts` (axis geometry) — the contract runs unchanged in Node (child process of the radar mirror)
 * and in the browser; it must not import `src/pointForecast` (V-AW-35).
 */
import { roadKmBetween, roadPointAtKm } from './roadFc';

export const ROAD_SEGMENTS_PATH = 'static/segments.json';
export const ROAD_SEGMENTS_SCHEMA = 1;
export const ROAD_SEGMENTS_PRODUCT = 'road-segments';

/** Segment length bounds (km) — E-AW-32: junction to junction, shorter merged, longer split. */
export const ROAD_SEG_MIN_KM = 5;
export const ROAD_SEG_MAX_KM = 25;
/** A junction node counts for a corridor when it lies this close (m) to the corridor axis. */
export const ROAD_SEG_JUNCTION_MAX_M = 120;
/** Junction nodes of the two carriageways with the same name within this distance (km) are one junction. */
export const ROAD_SEG_JUNCTION_MERGE_KM = 1.5;
/** Stations this far (km) before and after a segment count as its inputs too (gefahren §Vom Messpunkt zum Abschnitt). */
export const ROAD_SEG_STATION_REACH_KM = 5;
/** Site features are sampled along the axis every this many km (`set`: bridges ≥ 100 m become visible). */
export const ROAD_SEG_SAMPLE_KM = 0.1;
/** Axis bearings are stored per piece of this length (km) — the input of `sonne` and `quer`. */
export const ROAD_SEG_PIECE_KM = 1;
/** Gradient: the steepest 1-km window along the axis (`set`, gefahren: "Steigung ≥ 4 % über ≥ 1 km"). */
export const ROAD_SEG_GRADE_WINDOW_KM = 1;
/** Forest share is measured in a band of this half-width (m) around the axis (`set`, gefahren: "50-m-Band"). */
export const ROAD_SEG_FOREST_BAND_M = 50;
/** Cropland share is measured in a band of this half-width (m) (`set`, gefahren: "Acker ≥ 50 % im 1-km-Band"). */
export const ROAD_SEG_CROP_BAND_M = 500;
/** Lowland (Niederung): a support point with TPI (2 km ring) at or below this (m, `set`). */
export const ROAD_SEG_LOWLAND_TPI_M = -30;
/** A bridge in the list: at least this long (m, `set`). */
export const ROAD_SEG_BRIDGE_MIN_M = 100;

/**
 * Segment id: road number as in the corridor (`A8`), the corridor's own suffix when it has one (`a8-2` ⇒ `A8.2`) and the
 * begin km, 3 digits — `A8-034`, `A8.2-000`. Two corridors of one road may both begin at km 0; the suffix keeps them apart.
 */
export const roadSegmentId = (road: string, corridorId: string, kmFrom: number) => {
  const m = /-(\d+)$/.exec(corridorId);
  return `${road}${m ? `.${m[1]}` : ''}-${String(Math.round(kmFrom)).padStart(3, '0')}`;
};
export const ROAD_SEGMENT_ID_RE = /^[AB]\d{1,3}[A-Z]?(?:\.\d{1,2})?-\d{3,4}$/;

export interface RoadSegmentBridge {
  /** km from, km to (corridor km), name from OSM when the way carries one. */
  km: [number, number];
  name?: string;
}

/** Site features of a segment. Shares are 0…1 of the axis length; `null` = source not available for this field. */
export interface RoadSegmentFeatures {
  /** OSM `bridge=*` share of the axis and the bridges ≥ `ROAD_SEG_BRIDGE_MIN_M`. */
  bridge: number | null;
  bridges: RoadSegmentBridge[];
  tunnel: number | null;
  /** OSM `cutting=yes` (Einschnitt, shaded) and `embankment=yes` (Dammlage, exposed). */
  cutting: number | null;
  embankment: number | null;
  /** OSM `surface=concrete` share — the only known concrete surface (gefahren: `blowup` needs it). */
  concrete: number | null;
  /** WorldCover tree-cover share in the 50-m band and cropland share in the 1-km band. */
  forest: number | null;
  crop: number | null;
  /** Height of the axis (m, Terrarium): mean, min, max. */
  h: [number, number, number] | null;
  /** Steepest 1-km window: gradient in % and its km range. */
  grade: { pct: number; km: [number, number] } | null;
  /** A support point lies in a valley or basin (TPI 2 km ≤ `ROAD_SEG_LOWLAND_TPI_M`). */
  lowland: boolean;
  /** Open position: little forest, no cutting, above the surroundings (gefahren: "freie Lage"). */
  exposed: boolean;
}

export interface RoadSegment {
  id: string;
  corridor: string;
  /** Road number as in the corridor (`A8`), shields as shown (`A 8`). */
  road: string;
  shields: string[];
  /** "von – bis" from the junction names; `name` = `${from} – ${to}` (plus "Teil n/m" after a split). */
  name: string;
  from: string;
  to: string;
  /** Corridor km of the begin and the end, length. */
  kmFrom: number;
  kmTo: number;
  lengthKm: number;
  /** Bearing (° clockwise from north) of each `ROAD_SEG_PIECE_KM` piece in the direction of increasing km. */
  bearings: number[];
  /** Forecast axis points (`road/fc/v1/static/points.json` ids) inside the segment — the support points — and their `[lon, lat]`. */
  points: string[];
  coords: Array<[number, number]>;
  /** Measuring stations (DWD ids) inside the segment, and the ones within reach before/after it. */
  stations: string[];
  near: string[];
  f: RoadSegmentFeatures;
  /** How the segment came to be: `junctions` (both ends junctions), `merged`, `split` (part n of m), `end` (corridor end). */
  how: 'junctions' | 'merged' | 'split' | 'end';
}

export interface RoadSegmentsSource { what: string; name: string; license: string; attribution: string }

export interface RoadSegmentsFile {
  schema: typeof ROAD_SEGMENTS_SCHEMA;
  product: typeof ROAD_SEGMENTS_PRODUCT;
  builtAt: string;
  /** Inputs the file was built from (identity of the corridor and point files). */
  inputs: { corridors: string; points: string; osmBase: string | null; junctionsBase: string | null };
  sources: RoadSegmentsSource[];
  /** The file as a whole is a derived database of OpenStreetMap data (names, features) — ODbL 1.0. */
  license: 'ODbL 1.0';
  counts: { segments: number; corridors: number; junctions: number; km: number };
  segments: RoadSegment[];
}

export const ROAD_SEGMENTS_ATTRIBUTION = '© OpenStreetMap-Mitwirkende, ODbL';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const share = (x: unknown): x is number | null => x === null || (num(x) && x >= 0 && x <= 1);
const strs = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');

export function roadSegmentOk(s: unknown): s is RoadSegment {
  if (!isObj(s)) return false;
  if (typeof s.id !== 'string' || !ROAD_SEGMENT_ID_RE.test(s.id)) return false;
  if (typeof s.corridor !== 'string' || typeof s.road !== 'string' || !strs(s.shields)) return false;
  if (typeof s.name !== 'string' || typeof s.from !== 'string' || typeof s.to !== 'string') return false;
  if (!num(s.kmFrom) || !num(s.kmTo) || !num(s.lengthKm) || s.kmTo <= s.kmFrom || s.lengthKm <= 0) return false;
  if (!Array.isArray(s.bearings) || !s.bearings.every((b) => num(b) && b >= 0 && b < 360)) return false;
  if (!strs(s.points) || !strs(s.stations) || !strs(s.near)) return false;
  if (!Array.isArray(s.coords) || s.coords.length !== s.points.length || !s.coords.every((c) => Array.isArray(c) && c.length === 2 && num(c[0]) && num(c[1]))) return false;
  if (!['junctions', 'merged', 'split', 'end'].includes(String(s.how))) return false;
  const f = s.f;
  if (!isObj(f)) return false;
  for (const k of ['bridge', 'tunnel', 'cutting', 'embankment', 'concrete', 'forest', 'crop'] as const) if (!share(f[k])) return false;
  if (!Array.isArray(f.bridges) || !f.bridges.every((b) => isObj(b) && Array.isArray(b.km) && b.km.length === 2 && num(b.km[0]) && num(b.km[1]))) return false;
  if (f.h !== null && !(Array.isArray(f.h) && f.h.length === 3 && f.h.every(num))) return false;
  if (f.grade !== null && !(isObj(f.grade) && num(f.grade.pct) && Array.isArray(f.grade.km) && f.grade.km.length === 2)) return false;
  if (typeof f.lowland !== 'boolean' || typeof f.exposed !== 'boolean') return false;
  return true;
}

/** Client and producer check of the segments file: structure, every segment, ids unique. */
export function parseRoadSegments(j: unknown): RoadSegmentsFile | null {
  if (!isObj(j) || j.schema !== ROAD_SEGMENTS_SCHEMA || j.product !== ROAD_SEGMENTS_PRODUCT) return null;
  if (typeof j.builtAt !== 'string' || !Array.isArray(j.segments) || !Array.isArray(j.sources) || j.license !== 'ODbL 1.0') return null;
  const ids = new Set<string>();
  for (const s of j.segments as unknown[]) {
    if (!roadSegmentOk(s) || ids.has(s.id)) return null;
    ids.add(s.id);
  }
  return j as unknown as RoadSegmentsFile;
}

// --- Geometry helpers shared by builder, derive and page ----------------------------------------

/** Bearing (° clockwise from north) from `a` to `b` (`[lon, lat]`). */
export function bearingDeg(a: readonly [number, number], b: readonly [number, number]): number {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  const dy = b[1] - a[1];
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The piece bearings of a corridor stretch (`ROAD_SEG_PIECE_KM` each; the last piece may be shorter). */
export function stretchBearings(line: ReadonlyArray<readonly [number, number]>, kmFrom: number, kmTo: number): number[] {
  const out: number[] = [];
  for (let k = kmFrom; k < kmTo - 1e-9; k += ROAD_SEG_PIECE_KM) {
    const a = roadPointAtKm(line, k), b = roadPointAtKm(line, Math.min(kmTo, k + ROAD_SEG_PIECE_KM));
    out.push(Math.round(bearingDeg(a, b)) % 360);
  }
  return out;
}

/** Corridor km and distance (km) of the foot of `p` (`[lon, lat]`) on the corridor axis. */
export function kmOnLine(line: ReadonlyArray<readonly [number, number]>, p: readonly [number, number]): { km: number; distKm: number } {
  let acc = 0, best = { km: 0, distKm: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const d = roadKmBetween(a, b);
    const kx = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    const ax = (b[0] - a[0]) * kx, ay = b[1] - a[1];
    const px = (p[0] - a[0]) * kx, py = p[1] - a[1];
    const l2 = ax * ax + ay * ay;
    const t = l2 > 0 ? Math.max(0, Math.min(1, (px * ax + py * ay) / l2)) : 0;
    const foot: [number, number] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const dist = roadKmBetween(p, foot);
    if (dist < best.distKm) best = { km: acc + t * d, distKm: dist };
    acc += d;
  }
  return best;
}

/** The axis of a stretch as `[lon, lat]` points every `stepKm` (both ends included) — the map draws it, the builder samples it. */
export function stretchLine(line: ReadonlyArray<readonly [number, number]>, kmFrom: number, kmTo: number, stepKm = 0.5): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = kmFrom; k < kmTo; k += stepKm) out.push(roadPointAtKm(line, k));
  out.push(roadPointAtKm(line, kmTo));
  return out;
}
