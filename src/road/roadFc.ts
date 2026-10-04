/**
 * AW-6.1 — Contract of the route forecast of Autobahnwetter (`buscosun-data/road/fc/v1/`): ONE file for the producer
 * (`scripts/road/road-forecast.mjs`), the point builder (`scripts/road/build-fc-points.mjs`), the client
 * (`src/road/roadClient.ts`) and the verifier (`verify:road-fc`). Diagnosis and rulings: `audit/autobahnwetter.md` §14.
 *
 * What it is: buscosun Fusion 8 (`getPointForecastFromCube`, stage `fs`, radar hour mean, MOSMIX station member,
 * terrain and roughness at the point; NO measurement anchor) computed hourly at fixed points — every 5 km on each
 * motorway corridor (snapped onto the OSM carriageway) and at every road-weather station of the catalogue. It is
 * WEATHER at the road (air temperature, dew point, precipitation, snow share, wind, gusts, cloud cover), not the road
 * surface: surface temperature and the ice class stay AW-6.2 behind Gate D.
 *
 * Layout (own line next to `road/v1/`, which the radar mirror owns and rewrites on every push — E-AW-18):
 *   road/fc/v1/index.json                  pointer: the kept runs, newest first (mutable — read via raw.githubusercontent)
 *   road/fc/v1/<run>/c/<corridor>.json     one corridor: axis points and its stations, 49 hourly steps (immutable)
 *   road/fc/v1/<run>/s/<state>.json        stations that lie on no corridor, per federal state (immutable)
 *   road/fc/v1/static/points.json          the points (timeless; position licence ODbL where snapped to OSM)
 *   road/fc/v1/static/geo.json             terrain and roughness per point, precomputed (producer only)
 */

export const ROAD_FC_VERSION = 'v1';
export const ROAD_FC_REPO_DIR = `road/fc/${ROAD_FC_VERSION}`;
export const ROAD_FC_CDN_BASE = `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/${ROAD_FC_REPO_DIR}`;
export const ROAD_FC_RAW_BASE = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/${ROAD_FC_REPO_DIR}`;

export const ROAD_FC_INDEX_PATH = 'index.json';
export const ROAD_FC_POINTS_PATH = 'static/points.json';
export const ROAD_FC_GEO_PATH = 'static/geo.json';
export const roadFcCorridorPath = (run: string, corridorId: string) => `${run}/c/${corridorId}.json`;
export const roadFcStatePath = (run: string, state: string) => `${run}/s/${state}.json`;

// --- Shape of a run ----------------------------------------------------------------------------

/** Horizon in hours from the full hour of the issue time; 49 steps (lead 0…48). */
export const ROAD_FC_HOURS = 48;
export const ROAD_FC_STEPS = ROAD_FC_HOURS + 1;
/** Axis points every 5 km of corridor axis (E-AW-21; tier 1 of the cube computes on ≈ 2 km). */
export const ROAD_FC_SPACING_KM = 5;
/** A last axis point at the corridor end when the end is farther than this from the last regular point. */
export const ROAD_FC_END_MIN_KM = 2.5;
/**
 * Snap onto the OSM carriageway of the corridor's motorway: farther than this ⇒ the point stays on the corridor axis,
 * named (`snap: null`). 1 000 m: the corridor axis (DLM250, simplified) lies up to 553 m off its own raw axis (D-FC-6).
 */
export const ROAD_FC_SNAP_MAX_M = 1000;
/** Tunnel under the nominal position ⇒ slide along the axis by these offsets (km), first open carriageway wins. */
export const ROAD_FC_SLIDE_KM: readonly number[] = Object.freeze([0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]);

/** Producer cadence (E-AW-19): hourly, minute 12 — after the tier-1 cube job (start :40, done ≈ :55) of the hour before. */
export const ROAD_FC_CRON = '12 * * * *';
export const ROAD_FC_EVERY_MS = 3_600_000;
/** Runs kept in the repo: at most 3 h old, at least 2 (same rule as `obs/`). */
export const ROAD_FC_RETENTION = Object.freeze({ maxAgeMs: 3 * 3_600_000, minKeep: 2 });

// --- Client timing -----------------------------------------------------------------------------

/**
 * A run is taken only `ROAD_FC_PUBLISH_GATE_MS` after its `publishedAt` (`set`): jsDelivr resolves `@main` up to
 * 3 min late (CLAUDE.md), a too-early request would pin a 404 at the edge. Until then the client reads the run before.
 */
export const ROAD_FC_PUBLISH_GATE_MS = 5 * 60_000;
/** Newest run older than this ⇒ "Prognose veraltet" (two missed hourly runs plus the usual cron delay; `set`). */
export const ROAD_FC_STALE_MS = 3 * 3_600_000;
/** Older than this ⇒ no forecast shown (`set`: the tier-1 cube itself is refreshed every 3 h, MOSMIX every 6 h). */
export const ROAD_FC_DEAD_MS = 12 * 3_600_000;

export type RoadFcFreshness = 'live' | 'stale' | 'dead';
export function roadFcFreshness(issuedAtMs: number, nowMs: number, killed = false): RoadFcFreshness {
  if (killed || !Number.isFinite(issuedAtMs)) return 'dead';
  const age = nowMs - issuedAtMs;
  if (age > ROAD_FC_DEAD_MS) return 'dead';
  return age > ROAD_FC_STALE_MS ? 'stale' : 'live';
}

// --- Run stamp ---------------------------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, '0');
/** Run stamp `YYMMDDHHMM` (UTC) of the issue time, to the minute — two runs of one hour never share a path. */
export function roadFcStamp(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}
export function roadFcStampToMs(s: string): number {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  const ms = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return roadFcStamp(ms) === s ? ms : NaN;
}
/** First valid hour of a run issued at `ms`. */
export const roadFcT0 = (ms: number) => Math.floor(ms / 3_600_000) * 3_600_000;

// --- Variables and coding ----------------------------------------------------------------------

/**
 * Every series is an integer array of `ROAD_FC_STEPS` values, `null` = no value. value = integer / scale.
 * `q` is the origin of the step, not a physical value (see `ROAD_FC_ORIGIN`).
 */
export const ROAD_FC_VARS = Object.freeze({
  t: { scale: 10, unit: '°C', what: 'Lufttemperatur 2 m, Mittel der Verteilung' },
  ts: { scale: 10, unit: 'K', what: 'Streuung (σ) der Lufttemperatur' },
  td: { scale: 10, unit: '°C', what: 'Taupunkt 2 m' },
  pp: { scale: 1, unit: '%', what: 'Niederschlagswahrscheinlichkeit der Stunde' },
  rr: { scale: 100, unit: 'mm/h', what: 'Niederschlag, Erwartungswert' },
  sn: { scale: 1, unit: '%', what: 'Schnee-Anteil am Niederschlag (Feuchtkugel-Phase)' },
  ff: { scale: 10, unit: 'm/s', what: 'Windgeschwindigkeit 10 m' },
  fx: { scale: 10, unit: 'm/s', what: 'Böe 10 m' },
  dd: { scale: 1, unit: '°', what: 'Windrichtung' },
  n: { scale: 1, unit: '%', what: 'Gesamtbewölkung' },
  cf: { scale: 100, unit: '1', what: 'Konfidenz-Score der Lufttemperatur (0…1)' },
  q: { scale: 1, unit: 'code', what: 'Herkunft des Schritts' },
} as const);
export type RoadFcVar = keyof typeof ROAD_FC_VARS;
export const ROAD_FC_VAR_IDS = Object.freeze(Object.keys(ROAD_FC_VARS) as RoadFcVar[]);

/** Origin code of a step: tier or filler of buscosun Fusion; `+ROAD_FC_INTERPOLATED` when the step is interpolated. */
export const ROAD_FC_ORIGIN = Object.freeze({ t1: 0, t2: 1, t3: 2, station: 3, clima: 4 } as const);
export const ROAD_FC_INTERPOLATED = 8;
export function roadFcOriginCode(tier: string, interpolated: boolean): number | null {
  const base = (ROAD_FC_ORIGIN as Record<string, number>)[tier];
  return base == null ? null : base + (interpolated ? ROAD_FC_INTERPOLATED : 0);
}

/** Plausible range per variable in PHYSICAL units — the producer's value lock and the client's check. */
export const ROAD_FC_RANGE: Readonly<Record<RoadFcVar, readonly [number, number]>> = Object.freeze({
  t: [-45, 50], ts: [0, 15], td: [-60, 35], pp: [0, 100], rr: [0, 150], sn: [0, 100], ff: [0, 60], fx: [0, 90], dd: [0, 360], n: [0, 100], cf: [0, 1], q: [0, 12],
});

export const roadFcEncode = (v: RoadFcVar, x: number | null | undefined): number | null =>
  (x == null || !Number.isFinite(x) ? null : Math.round(x * ROAD_FC_VARS[v].scale));
export const roadFcDecode = (v: RoadFcVar, i: number | null | undefined): number | null =>
  (i == null || !Number.isFinite(i) ? null : i / ROAD_FC_VARS[v].scale);

// --- Files -------------------------------------------------------------------------------------

export type RoadFcPointKind = 'axis' | 'station';
export type RoadFcSeries = Record<RoadFcVar, Array<number | null>>;

export interface RoadFcPoint {
  /** Axis: `<corridor>@<km>`; station: the DWD station id. */
  id: string;
  kind: RoadFcPointKind;
  /** Corridor km (our axis); `null` for a station on no corridor. */
  km: number | null;
  lat: number;
  lon: number;
  /** Terrain height the forecast was computed for (m). */
  h: number | null;
  bridge?: true;
  /** Station points: display name. */
  name?: string;
  /** MOSMIX station that carried the station member (id, distance km) — `null`: none in reach. */
  mos: [string, number] | null;
  /**
   * V-AW-21: the measurement anchor at this point — [offset measurement − model in 0.1 K, representativity in %,
   * own measurement 1 / neighbours 0]. Absent = no anchor here.
   */
  anc?: [number, number, 0 | 1];
  v: RoadFcSeries;
}

/**
 * V-AW-21 — which points the producer anchors on the SWIS air temperature (`audit/autobahnwetter.md` §16):
 * `'stations'` = every station point on its own measurement, `'all'` = other points on their neighbours too,
 * `'none'`. The mode is the result of the measurement in §16.
 */
export type RoadFcAnchorMode = 'none' | 'stations' | 'all';
export const ROAD_FC_ANCHOR_MODE: RoadFcAnchorMode = 'none';

export interface RoadFcEngine {
  name: string;
  stage: 'fs';
  /**
   * What the run did, not what was asked for: `'swis'` = at least one point was anchored on a road weather station
   * (then `anchorMode`, `anchorSlot` = stamp of the measurement slot, `anchored` = number of points); `'none'` = no
   * anchor (mode off, or the measurement slot of the run's hour was not in the checkout).
   */
  anchor: 'none' | 'swis';
  anchorMode?: RoadFcAnchorMode;
  anchorSlot?: string | null;
  anchored?: number;
  hourMean: boolean;
  /** Cube runs the run read, per tier, and the station product. */
  runs: Record<string, string | null>;
  /** sha-256 (first 12 hex) of the learned tables read. */
  tables: Record<string, string | null>;
}

export interface RoadFcFile {
  schema: 1;
  product: 'road-fc';
  run: string;
  issuedAt: string;
  /** First valid hour (ms); step i is valid at `t0Ms + i · 3 600 000`. */
  t0Ms: number;
  steps: number;
  kind: 'corridor' | 'state';
  id: string;
  engine: RoadFcEngine;
  source: string;
  points: RoadFcPoint[];
}

export interface RoadFcRunEntry {
  run: string;
  issuedAt: string;
  t0Ms: number;
  /** Written right before the push; the client gate counts from here. */
  publishedAt: string;
  points: number;
  /** Points without a result (reader or engine error) — left out of the files. */
  failed: number;
  corridors: number;
  states: number;
  engine: RoadFcEngine;
  /** Compute time of the run (ms). */
  ms: number;
}

export interface RoadFcIndex {
  schema: 1;
  product: 'road-fc-index';
  updatedAt: string;
  killed: boolean;
  runs: RoadFcRunEntry[];
}

export const ROAD_FC_SOURCE_TEXT = 'buscosun Fusion 8 auf dem Punkt-Cube (buscosun-data/point), Radar-Stundenmittel DWD RADOLAN-RV, Stationsmember DWD MOSMIX-L, Gelände Terrarium (Mapzen/AWS), Rauhigkeit ESA WorldCover 2021 (CC BY 4.0); Lage der Achspunkte © OpenStreetMap-Mitwirkende (ODbL), Korridore © GeoBasis-DE / BKG (dl-de/by-2.0), Stationen DWD (GeoNutzV). Modellprognose für das Wetter an der Strecke — keine Fahrbahnmessung, kein amtliches Warnprodukt.';

/** Share of points a run may lose before it is NOT published (`set`; the run before stays the newest). */
export const ROAD_FC_MAX_FAILED_SHARE = 0.1;

// --- Validators --------------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** One series set: every variable present, right length, integers or null, inside the plausible range. */
export function roadFcSeriesProblems(v: unknown, steps = ROAD_FC_STEPS): string[] {
  const out: string[] = [];
  if (!isObj(v)) return ['v fehlt'];
  for (const id of ROAD_FC_VAR_IDS) {
    const a = v[id];
    if (!Array.isArray(a) || a.length !== steps) { out.push(`${id}: Länge ${Array.isArray(a) ? a.length : '—'} ≠ ${steps}`); continue; }
    const [lo, hi] = ROAD_FC_RANGE[id];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x === null) continue;
      if (typeof x !== 'number' || !Number.isInteger(x)) { out.push(`${id}[${i}]: keine ganze Zahl`); break; }
      const p = x / ROAD_FC_VARS[id].scale;
      if (p < lo || p > hi) { out.push(`${id}[${i}]: ${p} außerhalb ${lo}…${hi}`); break; }
    }
  }
  return out;
}

/** A point is usable when its temperature series carries values in at least half of the steps. */
export function roadFcPointUsable(p: RoadFcPoint): boolean {
  let n = 0;
  for (const x of p.v.t) if (x !== null) n++;
  return n * 2 >= p.v.t.length;
}

/** Client check of a run file: structure, then every point through the series check; bad points are dropped, counted. */
export function parseRoadFcFile(j: unknown): (RoadFcFile & { dropped: number }) | null {
  if (!isObj(j) || j.schema !== 1 || j.product !== 'road-fc') return null;
  if (typeof j.run !== 'string' || !Number.isFinite(roadFcStampToMs(j.run))) return null;
  if (typeof j.t0Ms !== 'number' || j.t0Ms % 3_600_000 !== 0 || typeof j.steps !== 'number' || j.steps < 2) return null;
  if ((j.kind !== 'corridor' && j.kind !== 'state') || typeof j.id !== 'string' || !Array.isArray(j.points) || !isObj(j.engine)) return null;
  const points: RoadFcPoint[] = [];
  let dropped = 0;
  for (const p of j.points as unknown[]) {
    const ok = isObj(p) && typeof p.id === 'string' && (p.kind === 'axis' || p.kind === 'station')
      && typeof p.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
      && (p.km === null || typeof p.km === 'number') && roadFcSeriesProblems(p.v, j.steps as number).length === 0;
    if (ok && roadFcPointUsable(p as unknown as RoadFcPoint)) points.push(p as unknown as RoadFcPoint); else dropped++;
  }
  return { ...(j as unknown as RoadFcFile), points, dropped };
}

export function parseRoadFcIndex(j: unknown): RoadFcIndex | null {
  if (!isObj(j) || j.schema !== 1 || j.product !== 'road-fc-index' || !Array.isArray(j.runs)) return null;
  const runs = (j.runs as unknown[]).filter((r): r is RoadFcRunEntry & Record<string, unknown> => isObj(r) && typeof r.run === 'string' && Number.isFinite(roadFcStampToMs(r.run))
    && typeof r.t0Ms === 'number' && typeof r.issuedAt === 'string' && typeof r.publishedAt === 'string' && Number.isFinite(Date.parse(r.publishedAt)));
  runs.sort((a, b) => (a.run < b.run ? 1 : a.run > b.run ? -1 : 0));
  return { schema: 1, product: 'road-fc-index', updatedAt: String(j.updatedAt ?? ''), killed: j.killed === true, runs };
}

/** The run a client reads now: the newest one behind the publish gate, else the newest at all; `null` when none or killed. */
export function roadFcPickRun(index: RoadFcIndex | null, nowMs: number): RoadFcRunEntry | null {
  if (!index || index.killed || !index.runs.length) return null;
  return index.runs.find((r) => Date.parse(r.publishedAt) + ROAD_FC_PUBLISH_GATE_MS <= nowMs) ?? index.runs[index.runs.length - 1];
}

/** Runs to delete: older than the retention, but never below `minKeep` (newest first in, stamps out). */
export function roadFcPrune(stamps: readonly string[], nowMs: number): string[] {
  const sorted = [...stamps].filter((s) => Number.isFinite(roadFcStampToMs(s))).sort().reverse();
  const out: string[] = [];
  sorted.forEach((s, i) => { if (i >= ROAD_FC_RETENTION.minKeep && nowMs - roadFcStampToMs(s) > ROAD_FC_RETENTION.maxAgeMs) out.push(s); });
  return out;
}

// --- Geometry of the corridor axis (builder and, later, the page) ------------------------------

const KM_PER_DEG = 111.2;
/** Same planar distance as `build-corridors.mjs` (the corridor km of the stations was measured with it). */
export function roadKmBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const kx = KM_PER_DEG * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * KM_PER_DEG);
}

/** `[lon, lat]` at corridor km `km` on the axis `line` (clamped to its ends). */
export function roadPointAtKm(line: ReadonlyArray<readonly [number, number]>, km: number): [number, number] {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = roadKmBetween(line[i - 1], line[i]);
    if (acc + d >= km && d > 0) {
      const t = Math.max(0, (km - acc) / d);
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
    acc += d;
  }
  const last = line[line.length - 1];
  return [last[0], last[1]];
}

export function roadLineKm(line: ReadonlyArray<readonly [number, number]>): number {
  let acc = 0;
  for (let i = 1; i < line.length; i++) acc += roadKmBetween(line[i - 1], line[i]);
  return acc;
}

/** Nominal km of the axis points of a corridor of length `lengthKm`: 0, 5, 10, … and the end when it is far enough. */
export function roadFcAxisKms(lengthKm: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= lengthKm + 1e-9; k += ROAD_FC_SPACING_KM) out.push(k);
  const last = out[out.length - 1] ?? 0;
  if (lengthKm - last > ROAD_FC_END_MIN_KM) out.push(Math.round(lengthKm * 10) / 10);
  return out;
}

export const roadFcAxisId = (corridorId: string, km: number) => `${corridorId}@${km}`;

// --- Points file -------------------------------------------------------------------------------

export interface RoadFcStaticPoint {
  id: string;
  kind: RoadFcPointKind;
  /** Corridor the point belongs to (`null`: station on no corridor). */
  corridor: string | null;
  km: number | null;
  lat: number;
  lon: number;
  /** Federal state (stations) — the file of a station on no corridor. */
  state?: string;
  name?: string;
  bridge?: true;
  /** Axis points: metres from the nominal axis position to the OSM carriageway; `null` = not snapped (stays on the axis). */
  snap?: number | null;
  /** Axis points: slid along the axis by this many km (tunnel under the nominal position, or the corridor end overshoots). */
  slide?: number;
  /** Axis points: the carriageway carries another number in OSM than the corridor (e.g. A 831 on the A 81 corridor). */
  osmRef?: string;
  /** Axis points, not snapped: a tunnel is all there is in reach. */
  tunnel?: true;
}

export interface RoadFcPointsFile {
  schema: 1;
  product: 'road-fc-points';
  builtAt: string;
  spacingKm: number;
  sources: Array<{ what: string; name: string; license: string; attribution: string }>;
  counts: { axis: number; station: number; snapped: number; unsnapped: number; slid: number; bridge: number };
  points: RoadFcStaticPoint[];
}

export function parseRoadFcPoints(j: unknown): RoadFcPointsFile | null {
  if (!isObj(j) || j.schema !== 1 || j.product !== 'road-fc-points' || !Array.isArray(j.points)) return null;
  const ok = (p: unknown) => isObj(p) && typeof p.id === 'string' && (p.kind === 'axis' || p.kind === 'station')
    && typeof p.lat === 'number' && typeof p.lon === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!(j.points as unknown[]).every(ok)) return null;
  return j as unknown as RoadFcPointsFile;
}
