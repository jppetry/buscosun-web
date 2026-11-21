/**
 * Phase AM — the trip planner in three modes (`audit/seewetter-ausfahrt.md`). Pure: no React, no MapLibre, no fetch.
 *
 *   Vor Ort  the planner of phase SP (`seaPlanner.ts`), untouched.
 *   Etappe   a leg from A to B over hand-set points: where the boat is at every full hour, and there the HOURLY values —
 *            wind and gusts of buscosun Fusion at the nearest sample point, wave of CWAM, current of the BSH, each relative
 *            to the course of the stretch. Arrival = distance / entered speed; the current is shown, never applied.
 *   Strand   which catalogue spots get the wind from the sea in a window of hours.
 *
 * What this module never says: "sicher"/"unsicher", a warning of its own, a combined drift of wind and current, a drift
 * distance or time, a rating of beaches, a catch forecast. The leg is a straight line between the points — no course,
 * no basis for navigation, no land check.
 */
import { sunAltitudeDeg } from '../photo/sun';
import { MS_TO_KN, SHORE_LABEL, fmtWind, shoreAngle, unitLabel, type SeaLimits, type SeaProfileId, type SeaUnit, type ShoreAngle } from './seaProfiles';
import { spotWaterPoint, type SeaSpot } from './seaContract';
import { REL_LABEL, angleDiff, driftSideOf, planBearingDeg, planDestination, planDistKm, relativeWind, sunAround, type DriftSide, type PlanPos, type RelWind } from './seaPlanner';
import { WAC_TITLE, windAgainstCurrent } from './seaCurrent';
import { WODL_AREA_IDS, type SeaTextDoc } from './seaText';
import { berlinHour, dateTime, dayShort, hh, hm } from './seaView';
import type { SeaAreaFeature } from './seaClient';

const H = 3_600_000;
export const KM_PER_NM = 1.852;

// --- Modes ------------------------------------------------------------------------------------------------------

export type TripMode = 'ort' | 'etappe' | 'strand';
export const TRIP_MODES: readonly TripMode[] = ['ort', 'etappe', 'strand'];
export const TRIP_MODE_LABEL: Readonly<Record<TripMode, string>> = Object.freeze({ ort: 'Vor Ort', etappe: 'Etappe', strand: 'Strand' });
export const TRIP_MODE_WHAT: Readonly<Record<TripMode, string>> = Object.freeze({
  ort: 'Ein Spot, das Boot davor, ein Fenster von Start bis Rückkehr.',
  etappe: 'Eine Strecke von Start bis Ziel über deine Wegpunkte, mit fester Fahrt.',
  strand: 'Ein Revier, ein Fenster, die Strände nach Stunden mit Wind von See.',
});
/** The mode the planner opens with: a leg for the two cruising profiles, the spot planner for the others. Strand is never a default. */
export const defaultTripMode = (p: SeaProfileId): TripMode => (p === 'yacht' || p === 'motor' ? 'etappe' : 'ort');

// --- The phone's sheet and the map's source line (V-AM-8) -------------------------------------------------------------

/** What the page measures of the planner's sheet: its height and the map left free between the top row and the sheet (px). */
export interface PlanSheetBox { h: number; gap: number }
/** `set` (E-AM-16): with less free map than this the source line has no room — three lines of it at 390 px are ≈ 42 px, plus a margin. */
export const PLAN_SHEET_SOURCES_MIN_GAP_PX = 56;
/**
 * Where the map's source line and its button „Quellen“ go while the sheet is up (E-AM-16): onto the sheet's upper edge
 * (`lift` = its height), or — when the open sheet leaves no room under the top row — to rest (`hidden`), as under the
 * dossier. `null` = no sheet measured, nothing changes.
 */
export function planSheetSources(box: PlanSheetBox | null): { lift: number; hidden: boolean } | null {
  if (!box || !Number.isFinite(box.h) || !Number.isFinite(box.gap) || box.h <= 0) return null;
  return box.gap < PLAN_SHEET_SOURCES_MIN_GAP_PX ? { lift: 0, hidden: true } : { lift: Math.round(box.h), hidden: false };
}

// --- Set values (each named where the page uses it) ----------------------------------------------------------------

/** `set` (E-AM-3): no sample point of a stretch lies farther than this from the next — two grid widths of the short-range model. */
export const SEA_TRIP_SAMPLE_KM = 5;
/** `set` (E-AM-3): sample points per leg at most; a longer leg gets a wider spacing, and the page says so. */
export const SEA_TRIP_MAX_SAMPLES = 24;
/** `set` (E-AM-7): the shower/thunderstorm hint comes from the nearest catalogue spot within this distance, else there is none. */
export const SEA_TRIP_CONV_KM = 15;
/** `set` (E-AM-5): current against the course — "mit" up to this angle, "gegen" from 180° minus it, "quer" between. */
export const SEA_TRIP_CUR_ALONG_DEG = 45;
/** `set` (E-AM-5): below this the current is a number without a class. */
export const SEA_TRIP_CUR_MIN_KN = 0.2;
/** `set` (E-AM-9): speed the leg opens with, and what the input accepts. */
export const SEA_TRIP_SPEED_KN: Readonly<Partial<Record<SeaProfileId, number>>> = Object.freeze({ yacht: 5, motor: 12 });
export const SEA_TRIP_SPEED_DEFAULT_KN = 4;
export const SEA_TRIP_SPEED_MIN_KN = 0.5;
export const SEA_TRIP_SPEED_MAX_KN = 40;
export const defaultSpeedKn = (p: SeaProfileId): number => SEA_TRIP_SPEED_KN[p] ?? SEA_TRIP_SPEED_DEFAULT_KN;
export const clampSpeedKn = (kn: number): number => Math.round(Math.min(SEA_TRIP_SPEED_MAX_KN, Math.max(SEA_TRIP_SPEED_MIN_KN, Number.isFinite(kn) ? kn : SEA_TRIP_SPEED_DEFAULT_KN)) * 10) / 10;
/** Points of a leg at most (start, destination and waypoints) — what a link carries. */
export const SEA_TRIP_MAX_POINTS = 12;
/** The comparison of departures: the chosen hour and this many hours before and after it (brief). */
export const SEA_TRIP_COMPARE_H = 2;
/** `set` (E-AM-11): the window Strand opens with, local hours. */
export const SEA_STRAND_FROM_H = 17;
export const SEA_STRAND_TO_H = 22;
/** `set` (E-AM-13): a gauge with a curve counts for a spot up to this distance; Strand reads this many gauges per list at most. */
export const SEA_TRIP_WL_KM = 20;
export const SEA_STRAND_WL_MAX = 12;
/** Civil twilight: the sun between the horizon (with refraction) and 6° below it. */
export const DUSK_HORIZON_DEG = -0.833;
export const DUSK_CIVIL_DEG = -6;

// --- Route --------------------------------------------------------------------------------------------------------

export interface TripPoint { lat: number; lon: number; /** The catalogue spot the point snapped to (its water cell). */ spot?: string }
export interface TripLeg { from: TripPoint; to: TripPoint; km: number; /** Initial bearing from → to, 0 ≤ x < 360. */ course: number; /** Distance of `from` along the route. */ startKm: number }
export interface TripRoute { points: TripPoint[]; legs: TripLeg[]; km: number }

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
/** A point on a catalogue spot (E-AM-10): the centre of the spot's water cell — where the producer computes the spot's wind too. */
export function snapToSpot(spot: Pick<SeaSpot, 'id' | 'cell' | 'lake' | 'lat' | 'lon'>): TripPoint {
  // Phase BS: a lake spot snaps to its water point (where the lake producer computes its wind).
  const c = spotWaterPoint(spot) ?? { lat: spot.lat, lon: spot.lon };
  return { lat: round4(c.lat), lon: round4(c.lon), spot: spot.id };
}
/** The spot a position belongs to (a link carries positions only): the one whose water cell centre it is. */
export function spotOfPoint(p: PlanPos, spots: readonly Pick<SeaSpot, 'id' | 'cell' | 'lake'>[]): string | undefined {
  for (const s of spots) { const c = spotWaterPoint(s); if (c && Math.abs(c.lat - p.lat) < 6e-5 && Math.abs(c.lon - p.lon) < 6e-5) return s.id; }
  return undefined;
}
/** The legs of a list of points; points on top of each other (< 20 m) give no leg. */
export function tripRoute(points: readonly TripPoint[]): TripRoute {
  const legs: TripLeg[] = [];
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i], d = planDistKm(from, to);
    if (!(d >= 0.02)) continue;
    legs.push({ from, to, km: d, course: planBearingDeg(from, to), startKm: km });
    km += d;
  }
  return { points: [...points], legs, km };
}
export interface TripPos { lat: number; lon: number; /** Index of the leg. */ leg: number; course: number; km: number }
/** The position `km` along the route (held inside it), with the course of its stretch. `null` for a route without a leg. */
export function routePosAt(route: TripRoute, km: number): TripPos | null {
  if (!route.legs.length) return null;
  const x = Math.min(route.km, Math.max(0, km));
  let i = route.legs.length - 1;
  for (let k = 0; k < route.legs.length; k++) if (x <= route.legs[k].startKm + route.legs[k].km) { i = k; break; }
  const leg = route.legs[i], d = Math.min(leg.km, Math.max(0, x - leg.startKm));
  const p = d <= 0 ? leg.from : d >= leg.km ? leg.to : planDestination(leg.from, leg.course, d);
  return { lat: p.lat, lon: p.lon, leg: i, course: leg.course, km: x };
}
/** The route between two distances as [lon, lat] — with every point of the route that lies between them. */
export function routeSlice(route: TripRoute, kmA: number, kmB: number): [number, number][] {
  const a = routePosAt(route, kmA), b = routePosAt(route, kmB);
  if (!a || !b) return [];
  const out: [number, number][] = [[a.lon, a.lat]];
  for (const leg of route.legs) { const end = leg.startKm + leg.km; if (end > a.km + 1e-6 && end < b.km - 1e-6) out.push([leg.to.lon, leg.to.lat]); }
  out.push([b.lon, b.lat]);
  return out;
}
/** Where a new waypoint goes in the list: into the stretch it lies nearest to (smallest detour), never before the start or after the destination. */
export function insertIndex(points: readonly TripPoint[], p: PlanPos): number {
  if (points.length < 2) return points.length;
  let best = 1, bestKm = Infinity;
  for (let i = 1; i < points.length; i++) {
    const detour = planDistKm(points[i - 1], p) + planDistKm(p, points[i]) - planDistKm(points[i - 1], points[i]);
    if (detour < bestKm) { bestKm = detour; best = i; }
  }
  return best;
}

// --- Where the boat is at every full hour, and the arrival --------------------------------------------------------

export interface TripStop {
  /** Time at this position (the arrival carries its minute). */
  tMs: number;
  /** The full hour whose values are read here: the time itself, for the arrival the nearest full hour (E-AM-4). */
  hourMs: number;
  pos: TripPos;
  start: boolean; arrival: boolean;
}
export interface TripTimeline { stops: TripStop[]; departMs: number; arriveMs: number; durMin: number }
/**
 * Arrival = distance / entered speed, to the minute. The current never enters. `null` without a leg or a speed.
 * A stop every full hour from the departure on, then the arrival.
 */
export function tripTimeline(route: TripRoute, speedKn: number, departMs: number): TripTimeline | null {
  if (!route.legs.length || !(speedKn > 0) || !Number.isFinite(departMs)) return null;
  const kmh = speedKn * KM_PER_NM;
  const durMin = Math.round((route.km / kmh) * 60);
  const arriveMs = departMs + durMin * 60_000;
  const stops: TripStop[] = [];
  for (let n = 0; n < 400; n++) {
    const t = departMs + n * H;
    if (t > arriveMs - 60_000 && n > 0) break;
    stops.push({ tMs: t, hourMs: t, pos: routePosAt(route, kmh * n)!, start: n === 0, arrival: false });
  }
  stops.push({ tMs: arriveMs, hourMs: Math.round(arriveMs / H) * H, pos: routePosAt(route, route.km)!, start: false, arrival: true });
  return { stops, departMs, arriveMs, durMin };
}

// --- Sample points of buscosun Fusion ------------------------------------------------------------------------------

export interface TripSample { lat: number; lon: number; km: number }
/**
 * Sample points along the route: per stretch its start, its end and as many between them that none lies farther than
 * `stepKm` from the next (per stretch, so that moving one waypoint moves only the samples of the two stretches at it).
 * More than `max` points ⇒ the spacing grows until they fit (`widened`).
 */
export function tripSamples(route: TripRoute, stepKm = SEA_TRIP_SAMPLE_KM, max = SEA_TRIP_MAX_SAMPLES): { samples: TripSample[]; stepKm: number; widened: boolean } {
  const build = (step: number): TripSample[] => {
    const out: TripSample[] = [];
    route.legs.forEach((leg, li) => {
      const n = Math.max(1, Math.ceil(leg.km / step - 1e-9));
      for (let i = li === 0 ? 0 : 1; i <= n; i++) {
        const p = i === 0 ? leg.from : i === n ? leg.to : planDestination(leg.from, leg.course, (leg.km * i) / n);
        out.push({ lat: round4(p.lat), lon: round4(p.lon), km: leg.startKm + (leg.km * i) / n });
      }
    });
    return out;
  };
  let step = stepKm, samples = build(step);
  const cap = Math.max(max, route.legs.length + 1);
  while (samples.length > cap && step < 10_000) { step *= 1.25; samples = build(step); }
  return { samples, stepKm: step, widened: step > stepKm };
}
/** Index of the sample nearest along the route. */
export function nearestSample(samples: readonly TripSample[], km: number): number {
  let best = -1, d = Infinity;
  samples.forEach((s, i) => { const x = Math.abs(s.km - km); if (x < d) { d = x; best = i; } });
  return best;
}

// --- Hourly values at a position --------------------------------------------------------------------------------------

export interface TripWind { windMs: number | null; gustMs: number | null; windDir: number | null }
export interface TripWave { hs: number | null; /** Direction the waves come from. */ dir: number | null; per: number | null }
export interface TripCur { kn: number; /** Direction the current sets towards. */ to: number }
export interface TripConv { cls: 0 | 1 | 2; spot: string; km: number }
/**
 * What the rows read. Each answer is the HOURLY value of the full hour `hourMs`; `null` = no data for this hour here
 * (outside the cube, outside the run, not loaded), `'land'` = the model has no water at this position.
 */
export interface TripData {
  wind: (sample: number, hourMs: number) => TripWind | null;
  wave: (pos: PlanPos, hourMs: number) => TripWave | 'land' | null;
  cur: (pos: PlanPos, hourMs: number) => TripCur | 'land' | null;
  conv: (pos: PlanPos, hourMs: number) => TripConv | null;
}

export type CurRel = 'mit' | 'gegen' | 'quer';
export const CUR_REL_LABEL: Readonly<Record<CurRel, string>> = Object.freeze({ mit: 'mit', gegen: 'gegen', quer: 'quer' });
/** The current against the course: `toDeg` is where it sets TOWARDS. Below `SEA_TRIP_CUR_MIN_KN` there is no class. */
export function currentToCourse(cur: TripCur | null | undefined, courseDeg: number | null | undefined): CurRel | null {
  if (!cur || courseDeg == null || !Number.isFinite(cur.to) || !Number.isFinite(courseDeg) || !(cur.kn >= SEA_TRIP_CUR_MIN_KN)) return null;
  const d = Math.abs(angleDiff(cur.to, courseDeg));
  return d <= SEA_TRIP_CUR_ALONG_DEG ? 'mit' : d >= 180 - SEA_TRIP_CUR_ALONG_DEG ? 'gegen' : 'quer';
}

export type TripStatus = 'in' | 'over' | 'missing';
export interface TripRow {
  stop: TripStop;
  /** "Laboe" · "5 sm" · "Marstal". */
  place: string;
  wind: TripWind | null;
  /** Wind relative to the course of the stretch (classes of `relativeWind`); null without a direction. */
  rel: RelWind | null;
  wave: TripWave | 'land' | null; waveRel: RelWind | null;
  cur: TripCur | 'land' | null; curRel: CurRel | null;
  /** "Wind gegen Strom" by the page's rule (`windAgainstCurrent`). */
  wac: boolean;
  conv: TripConv | null;
  over: { wind: boolean; gust: boolean; wave: boolean };
  status: TripStatus;
}
const finite = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const waveOf = (w: TripRow['wave']): TripWave | null => (w && w !== 'land' ? w : null);
const curOf = (c: TripRow['cur']): TripCur | null => (c && c !== 'land' ? c : null);

export type TripLimits = Pick<SeaLimits, 'windMax' | 'gustMax' | 'hsMax'>;
/**
 * Phase BS-N (V-BS-4): `noSea` = a leg on an inland lake, where no wave and no current model exists. A row is then not
 * "missing" for its wave, and the findings do not list wave and current as missing — the page leaves both rows out.
 */
export interface TripOpts { noSea?: boolean }
export const nmText = (km: number): string => { const nm = km / KM_PER_NM; return `${nm < 10 ? (Math.round(nm * 10) / 10).toLocaleString('de-DE') : Math.round(nm)} sm`; };
export const durText = (min: number): string => { const m = Math.round(Math.abs(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

/**
 * The rows of the table "Entlang der Etappe": one per stop. Wind and gusts come from the sample point nearest along the
 * route, wave and current from the model cell at the position. A row is `over` when a value lies above the profile's
 * limit, `missing` when wind, gust or wave height has no value there.
 */
export function tripRows(tl: TripTimeline, samples: readonly TripSample[], data: TripData, limits: TripLimits, names: { start: string; end: string }, opts: TripOpts = {}): TripRow[] {
  return tl.stops.map((stop) => {
    const pos = stop.pos, si = nearestSample(samples, pos.km);
    const wind = si < 0 ? null : data.wind(si, stop.hourMs);
    const wave = data.wave(pos, stop.hourMs), cur = data.cur(pos, stop.hourMs);
    const wv = waveOf(wave), cu = curOf(cur);
    const w = finite(wind?.windMs) ? wind!.windMs! * MS_TO_KN : null, g = finite(wind?.gustMs) ? wind!.gustMs! * MS_TO_KN : null;
    const over = {
      wind: limits.windMax != null && w != null && w > limits.windMax,
      gust: limits.gustMax != null && g != null && g > limits.gustMax,
      wave: limits.hsMax != null && finite(wv?.hs) && wv!.hs! > limits.hsMax,
    };
    const missing = w == null || g == null || (!opts.noSea && !finite(wv?.hs));
    return {
      stop, place: stop.start ? names.start : stop.arrival ? names.end : nmText(pos.km),
      wind, rel: relativeWind(wind?.windDir, pos.course),
      wave, waveRel: wv && finite(wv.hs) && wv.hs > 0 ? relativeWind(wv.dir, pos.course) : null,
      cur, curRel: currentToCourse(cu, pos.course),
      wac: windAgainstCurrent({ windFromDeg: wind?.windDir, windKn: w, curToDeg: cu?.to, curKn: cu?.kn }).against,
      conv: data.conv(pos, stop.hourMs),
      over, status: over.wind || over.gust || over.wave ? 'over' : missing ? 'missing' : 'in',
    };
  });
}

/** The route in pieces of one status each: every row holds from half way to the row before to half way to the row after it. */
export function tripPieces(route: TripRoute, rows: readonly TripRow[]): { status: TripStatus; coords: [number, number][] }[] {
  const out: { status: TripStatus; fromKm: number; toKm: number }[] = [];
  rows.forEach((r, i) => {
    const a = i === 0 ? 0 : (rows[i - 1].stop.pos.km + r.stop.pos.km) / 2, b = i === rows.length - 1 ? route.km : (r.stop.pos.km + rows[i + 1].stop.pos.km) / 2;
    if (!(b > a)) return;
    const last = out[out.length - 1];
    if (last && last.status === r.status) last.toKm = b; else out.push({ status: r.status, fromKm: a, toKm: b });
  });
  return out.map((p) => ({ status: p.status, coords: routeSlice(route, p.fromKm, p.toKm) }));
}

// --- Findings ------------------------------------------------------------------------------------------------------

export type TripFindingKind = 'gust' | 'wind' | 'wave' | 'wac' | 'conv' | 'sun' | 'missing';
export interface TripFinding { kind: TripFindingKind; /** Above the profile's limit — the only thing shown in red, the only thing counted. */ over: boolean; text: string }
export interface TripFindings { list: TripFinding[]; /** Findings above your limits. */ over: number; /** A value the limits are checked against is missing in at least one row. */ gaps: boolean }

const knText = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const val = (ms: number, unit: SeaUnit) => `${fmtWind(ms, unit)} ${unitLabel(unit)}`;
const mText = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "12 Uhr", with the weekday when the leg runs over midnight. */
const hourText = (t: number, ref: number) => `${dayShort(t) !== dayShort(ref) ? `${dayShort(t)} ` : ''}${hh(t)} Uhr`;
export const stopClock = (s: Pick<TripStop, 'tMs'>) => hm(s.tMs);

// --- Arrows along the route (V-AM-9, `audit/seewetter-ausfahrt.md` §9) ------------------------------------------------

/** `set` (E-AM-18): the arrow's centre stands this far beside its stop, at a right angle to the course. */
export const SEA_TRIP_ARROW_OFF_PX = 34;
/** `set` (E-AM-18): drawn length of an arrow. */
export const SEA_TRIP_ARROW_LEN_PX = 30;
/** `set` (E-AM-19): two arrows whose centres would lie closer than this on the screen are not both drawn. */
export const SEA_TRIP_ARROW_MIN_PX = 58;

/** One arrow beside the route: what a column of the table says, drawn at the place of that column. */
export interface TripArrow {
  kind: 'wind' | 'cur';
  /** The row (column of the table) the arrow belongs to. */
  row: number;
  lat: number; lon: number;
  /** Where the arrow points, compass degrees: where the wind blows to, where the current sets. */
  to: number;
  /** Compass bearing from the stop to the arrow's centre (course + 90 = starboard, course − 90 = port). */
  off: number;
  label: string;
  /** The wind of this column is above your limit — the only red. */
  over: boolean;
}
/** The side of the route something comes FROM, seen along the course: 1 starboard, −1 port; dead ahead or astern counts as starboard. */
export function tripArrowSide(fromDeg: number, courseDeg: number): 1 | -1 {
  return Math.sin(((fromDeg - courseDeg) * Math.PI) / 180) >= -1e-9 ? 1 : -1;
}
const norm360 = (d: number) => ((d % 360) + 360) % 360;
/**
 * The arrows of a leg (E-AM-17, E-AM-20, E-AM-21): a wind arrow at every stop with a wind value AND a direction — the
 * wind of the hour the boat is there, on the side it comes from — and ONE current arrow at the stop with the strongest
 * current of the leg (from `SEA_TRIP_CUR_MIN_KN` on), on the other side of the route. Nothing is drawn for a missing value.
 */
export function tripArrows(rows: readonly TripRow[], unit: SeaUnit): TripArrow[] {
  const out: TripArrow[] = [];
  const windSide = new Map<number, 1 | -1>();
  rows.forEach((r, row) => {
    const w = r.wind, c = r.stop.pos.course;
    if (!w || !finite(w.windMs) || !finite(w.windDir) || !finite(c)) return;
    const side = tripArrowSide(w.windDir, c);
    windSide.set(row, side);
    out.push({ kind: 'wind', row, lat: r.stop.pos.lat, lon: r.stop.pos.lon, to: norm360(w.windDir + 180), off: norm360(c + 90 * side), label: val(w.windMs, unit), over: r.over.wind });
  });
  let best = -1;
  rows.forEach((r, row) => {
    const c = curOf(r.cur);
    if (!c || !finite(c.kn) || !finite(c.to) || !finite(r.stop.pos.course) || !(c.kn >= SEA_TRIP_CUR_MIN_KN)) return;
    if (best < 0 || c.kn > curOf(rows[best].cur)!.kn) best = row;
  });
  if (best >= 0) {
    const r = rows[best], c = curOf(r.cur)!, course = r.stop.pos.course;
    const side: 1 | -1 = windSide.has(best) ? (windSide.get(best) === 1 ? -1 : 1) : tripArrowSide(c.to + 180, course);
    out.push({ kind: 'cur', row: best, lat: r.stop.pos.lat, lon: r.stop.pos.lon, to: norm360(c.to), off: norm360(course + 90 * side), label: `Strom ${mText(c.kn)} kn`, over: false });
  }
  return out;
}
/**
 * Where an arrow stands on a map with north up, relative to its stop (px, x east, y down): its centre; the centre line
 * of its label on the side turned away from the route — above an arrow that stands above the route, below one below
 * it; and how the label is set: `align` 1 = it begins at the arrow and runs away from a route on its left, −1 = it ends
 * at the arrow (route on its right), 0 = centred (route above or below). `flip` = the other side of the route (the
 * arrow gave way to a label, `tripArrowLayout`).
 */
export function tripArrowPx(a: Pick<TripArrow, 'off' | 'to'>, flip = false): { dx: number; dy: number; labelDy: number; align: -1 | 0 | 1 } {
  const o = ((a.off + (flip ? 180 : 0)) * Math.PI) / 180;
  const dx = Math.sin(o) * SEA_TRIP_ARROW_OFF_PX, dy = -Math.cos(o) * SEA_TRIP_ARROW_OFF_PX;
  const half = Math.abs(Math.cos((a.to * Math.PI) / 180)) * (SEA_TRIP_ARROW_LEN_PX / 2);
  return { dx: Math.round(dx), dy: Math.round(dy), labelDy: Math.round((dy > 0.5 ? 1 : -1) * (half + 12)), align: dx >= SEA_TRIP_ARROW_ALIGN_PX ? 1 : dx <= -SEA_TRIP_ARROW_ALIGN_PX ? -1 : 0 };
}
/** `set`: from this sideways offset on the label is set flush instead of centred; and how far its flush edge reaches back over the arrow's centre. */
export const SEA_TRIP_ARROW_ALIGN_PX = 12;
export const SEA_TRIP_ARROW_LABEL_IN_PX = 10;
/** `set`: the square an arrow takes on the screen, and the size of its label as the layout counts it (13 px type: 7.5 px a sign, 18 px high; the pill of a red number 14 px more). */
export const SEA_TRIP_ARROW_BOX_PX = 24;
export const SEA_TRIP_ARROW_LABEL_H_PX = 18;
export const tripArrowLabelW = (a: Pick<TripArrow, 'label' | 'over'>): number => Math.round(a.label.length * 7.5) + (a.over ? 14 : 0);

/** A rectangle on the screen (px, top left corner). */
export interface TripRect { x: number; y: number; w: number; h: number }
const rectsHit = (a: TripRect, b: TripRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** The two rectangles an arrow takes at a stop on the screen: the arrow itself and its label. */
export function tripArrowRects(a: Pick<TripArrow, 'off' | 'to' | 'label' | 'over'>, stop: { x: number; y: number }, flip = false): { centre: { x: number; y: number }; arrow: TripRect; label: TripRect } {
  const p = tripArrowPx(a, flip), cx = stop.x + p.dx, cy = stop.y + p.dy, w = tripArrowLabelW(a), b = SEA_TRIP_ARROW_BOX_PX;
  const lx = p.align === 1 ? cx - SEA_TRIP_ARROW_LABEL_IN_PX : p.align === -1 ? cx + SEA_TRIP_ARROW_LABEL_IN_PX - w : cx - w / 2;
  return { centre: { x: cx, y: cy }, arrow: { x: cx - b / 2, y: cy - b / 2, w: b, h: b }, label: { x: lx, y: cy + p.labelDy - SEA_TRIP_ARROW_LABEL_H_PX / 2, w, h: SEA_TRIP_ARROW_LABEL_H_PX } };
}
export interface TripArrowPlaced { i: number; flip: boolean; dx: number; dy: number; labelDy: number; align: -1 | 0 | 1 }
/**
 * Which arrows are drawn, and on which side (E-AM-19, E-AM-23): `stops` are the stops of the arrows on the screen,
 * `blocked` the labels already standing on the map (names of the points, the boat's label). The current arrow first,
 * then the wind arrow of the chosen column, then those above your limit, then in order of the leg. Each takes its own
 * side of the route, or the other side where a label stands on its own; an arrow closer than `minPx` to one already
 * taken is not drawn, and neither is one with a label on both sides — only the current arrow is always drawn.
 * Ascending by index.
 */
export function tripArrowLayout(
  arrows: readonly Pick<TripArrow, 'kind' | 'row' | 'over' | 'off' | 'to' | 'label'>[], stops: readonly ({ x: number; y: number } | null | undefined)[],
  selRow: number, blocked: readonly TripRect[] = [], minPx = SEA_TRIP_ARROW_MIN_PX,
): TripArrowPlaced[] {
  const rank = (a: Pick<TripArrow, 'kind' | 'row' | 'over'>) => (a.kind === 'cur' ? 0 : a.row === selRow ? 1 : a.over ? 2 : 3);
  const order = arrows.map((a, i) => ({ a, i })).filter((x) => stops[x.i] != null).sort((p, q) => rank(p.a) - rank(q.a) || p.i - q.i);
  const kept: (TripArrowPlaced & { cx: number; cy: number })[] = [];
  for (const { a, i } of order) {
    let pick: (TripArrowPlaced & { cx: number; cy: number }) | null = null;
    for (const flip of [false, true]) {
      const r = tripArrowRects(a, stops[i]!, flip);
      if (blocked.some((b) => rectsHit(b, r.arrow) || rectsHit(b, r.label))) continue;
      // Only a label turns an arrow to the other side — never another arrow, or the thinning would fill both sides.
      if (kept.every((k) => Math.hypot(k.cx - r.centre.x, k.cy - r.centre.y) >= minPx)) pick = { i, flip, ...tripArrowPx(a, flip), cx: r.centre.x, cy: r.centre.y };
      break;
    }
    if (!pick && a.kind === 'cur') { const r = tripArrowRects(a, stops[i]!); pick = { i, flip: false, ...tripArrowPx(a), cx: r.centre.x, cy: r.centre.y }; }
    if (pick) kept.push(pick);
  }
  return kept.sort((p, q) => p.i - q.i).map(({ i, flip, dx, dy, labelDy, align }) => ({ i, flip, dx, dy, labelDy, align }));
}

/** Since when the class at the end of the leg holds: "durchgehend von hinten" · "ab 11 Uhr schräg von vorn". */
function relSince(rows: readonly TripRow[], pick: (r: TripRow) => RelWind | null, ref: number): string | null {
  const known = rows.filter((r) => pick(r) != null);
  if (!known.length) return null;
  const end = pick(known[known.length - 1])!;
  let j = known.length - 1;
  while (j > 0 && pick(known[j - 1]) === end) j--;
  return j === 0 ? `durchgehend ${REL_LABEL[end]}` : `ab ${hourText(known[j].stop.hourMs, ref)} ${REL_LABEL[end]}`;
}
/** "von 12 bis 13 Uhr" for the first run of rows that carry `flag`, with the distance along the leg. */
function runText(rows: readonly TripRow[], flag: (r: TripRow) => boolean, ref: number): string | null {
  const a = rows.findIndex(flag);
  if (a < 0) return null;
  let b = a;
  while (b + 1 < rows.length && flag(rows[b + 1])) b++;
  const where = a === b ? `bei ${nmText(rows[a].stop.pos.km)}` : `zwischen ${nmText(rows[a].stop.pos.km)} und ${nmText(rows[b].stop.pos.km)}`;
  return `${a === b ? `um ${hourText(rows[a].stop.hourMs, ref)}` : `von ${hh(rows[a].stop.hourMs)} bis ${hourText(rows[b].stop.hourMs, ref)}`}, ${where}`;
}

/**
 * What the rows say for the whole leg — every line from hourly values. `dest` = where the leg ends (sunset there).
 * Red (`over`) is a value above YOUR limit and nothing else; "Wind gegen Strom" and the shower hint are hints.
 */
export function tripFindings(rows: readonly TripRow[], tl: TripTimeline, limits: TripLimits, unit: SeaUnit, dest: PlanPos | null, opts: TripOpts = {}): TripFindings {
  const list: TripFinding[] = [];
  const ref = tl.departMs, n = rows.length;
  const peak = (pick: (r: TripRow) => number | null): { row: TripRow; v: number } | null => {
    let best: { row: TripRow; v: number } | null = null;
    for (const r of rows) { const v = pick(r); if (v != null && (!best || v > best.v)) best = { row: r, v }; }
    return best;
  };
  const share = (flag: (r: TripRow) => boolean) => { const c = rows.filter(flag).length; return c === n ? 'in jeder Stunde' : `in ${c} von ${n} Stunden`; };

  const gust = peak((r) => (finite(r.wind?.gustMs) ? r.wind!.gustMs! : null));
  const gustOver = rows.some((r) => r.over.gust);
  if (gust) list.push({ kind: 'gust', over: gustOver, text: `Böen bis ${val(gust.v, unit)} um ${hourText(gust.row.stop.hourMs, ref)}${gustOver ? `, über deiner Grenze ${knText(limits.gustMax!)} kn ${share((r) => r.over.gust)}` : ''}` });
  const wind = peak((r) => (finite(r.wind?.windMs) ? r.wind!.windMs! : null));
  const windOver = rows.some((r) => r.over.wind);
  if (wind) {
    const rel = relSince(rows, (r) => r.rel, ref);
    list.push({ kind: 'wind', over: windOver, text: `Wind bis ${val(wind.v, unit)} um ${hourText(wind.row.stop.hourMs, ref)}${windOver ? `, über deiner Grenze ${knText(limits.windMax!)} kn ${share((r) => r.over.wind)}` : ''}${rel ? `; zum Kurs ${rel}` : ''}` });
  }
  const wave = peak((r) => { const w = waveOf(r.wave); return finite(w?.hs) ? w!.hs! : null; });
  const waveOver = rows.some((r) => r.over.wave);
  if (wave) {
    const per = waveOf(wave.row.wave)?.per, rel = relSince(rows, (r) => r.waveRel, ref);
    list.push({ kind: 'wave', over: waveOver, text: `Welle bis ${mText(wave.v)} m${finite(per) ? ` bei ${Math.round(per)} s` : ''} um ${hourText(wave.row.stop.hourMs, ref)}${waveOver ? `, über deiner Grenze ${mText(limits.hsMax!)} m ${share((r) => r.over.wave)}` : ''}${rel ? `; zum Kurs ${rel}` : ''}` });
  }
  const wac = runText(rows, (r) => r.wac, ref);
  if (wac) list.push({ kind: 'wac', over: false, text: `${WAC_TITLE} ${wac}` });
  const thunder = rows.find((r) => r.conv?.cls === 2), shower = rows.find((r) => r.conv?.cls === 1);
  for (const [r, word] of [[thunder, 'Gewitter'], [shower, 'Schauer']] as const) {
    if (r?.conv) list.push({ kind: 'conv', over: false, text: `${word} möglich um ${hourText(r.stop.hourMs, ref)} (Hinweis vom Spot ${r.conv.spot}, ${Math.round(r.conv.km)} km vom Ort der Etappe)` });
  }
  if (dest) {
    const sun = sunAround(tl.arriveMs, dest.lat, dest.lon);
    if (sun.sunset != null) {
      const min = (sun.sunset - tl.arriveMs) / 60_000;
      list.push({ kind: 'sun', over: false, text: sun.up ? `Ankunft ${durText(min)} vor Sonnenuntergang (${hm(sun.sunset)} Uhr)` : `Ankunft ${durText(min)} nach Sonnenuntergang (${hm(sun.sunset)} Uhr), also bei Dunkelheit` });
    }
  }
  const noWind = rows.filter((r) => !finite(r.wind?.windMs) || !finite(r.wind?.gustMs)).length;
  const noDir = rows.filter((r) => finite(r.wind?.windMs) && !finite(r.wind?.windDir)).length;
  const noWave = opts.noSea ? 0 : rows.filter((r) => !finite(waveOf(r.wave)?.hs)).length;
  const noCur = opts.noSea ? 0 : rows.filter((r) => !curOf(r.cur)).length;
  if (noWind) list.push({ kind: 'missing', over: false, text: `Wind: keine Daten ${noWind === n ? 'für die ganze Etappe' : `für ${noWind} von ${n} Stunden`}. Höchstwerte und Grenzen gelten nur für die übrigen.` });
  if (noDir) list.push({ kind: 'missing', over: false, text: `Windrichtung fehlt ${noDir === n ? 'für die ganze Etappe' : `für ${noDir} von ${n} Stunden`}: dort kein Wind zum Kurs.` });
  if (noWave) list.push({ kind: 'missing', over: false, text: `Welle: keine Daten ${noWave === n ? 'für die ganze Etappe' : `für ${noWave} von ${n} Stunden`}.` });
  if (noCur) list.push({ kind: 'missing', over: false, text: `Strom: keine Daten ${noCur === n ? 'für die ganze Etappe' : `für ${noCur} von ${n} Stunden`}.` });
  return { list, over: list.filter((f) => f.over).length, gaps: noWind > 0 || noWave > 0 };
}

/** "kein Hinweis" · "1 Hinweis" · "3 Hinweise" — the count of findings above your limits. */
export const overCountText = (over: number): string => (over === 0 ? 'kein Hinweis' : over === 1 ? '1 Hinweis' : `${over} Hinweise`);

export interface TripCompare { departMs: number; chosen: boolean; /** `null` = the departure lies outside the forecast. */ over: number | null; gaps: boolean; arriveMs: number | null }
/**
 * "Abfahrt vergleichen": the chosen hour, two hours earlier and two hours later, each with the count of findings above
 * your limits. `axis` = first and last full hour that carry values; a departure outside it is not computed.
 */
export function tripCompare(route: TripRoute, speedKn: number, departMs: number, samples: readonly TripSample[], data: TripData, limits: TripLimits, unit: SeaUnit, axis: { fromMs: number; toMs: number }, opts: TripOpts = {}): TripCompare[] {
  return [-SEA_TRIP_COMPARE_H, 0, SEA_TRIP_COMPARE_H].map((d) => {
    const t = departMs + d * H, tl = t >= axis.fromMs && t <= axis.toMs ? tripTimeline(route, speedKn, t) : null;
    if (!tl) return { departMs: t, chosen: d === 0, over: null, gaps: false, arriveMs: null };
    const f = tripFindings(tripRows(tl, samples, data, limits, { start: '', end: '' }, opts), tl, limits, unit, null, opts);
    return { departMs: t, chosen: d === 0, over: f.over, gaps: f.gaps, arriveMs: tl.arriveMs };
  });
}

// --- Sea areas the leg crosses, and their official texts -------------------------------------------------------------

const inRing = (ring: number[][], lon: number, lat: number): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Is a position inside an area of `loadAreas` (MultiPolygon, holes respected)? */
export const pointInArea = (f: Pick<SeaAreaFeature, 'geometry'>, lon: number, lat: number): boolean =>
  f.geometry.coordinates.some((poly) => inRing(poly[0], lon, lat) && !poly.slice(1).some((hole) => inRing(hole, lon, lat)));

export interface TripAreaHit { id: string; name: string; kind: 'sea' | 'coast'; fromKm: number; toKm: number }
/** The areas the leg crosses, in the order it reaches them (a probe every `stepKm`). */
export function tripAreas(route: TripRoute, features: readonly SeaAreaFeature[], stepKm = 0.5): TripAreaHit[] {
  if (!route.legs.length) return [];
  const hits = new Map<string, TripAreaHit>();
  const n = Math.max(1, Math.ceil(route.km / stepKm));
  for (let k = 0; k <= n; k++) {
    const km = (route.km * k) / n, p = routePosAt(route, km)!;
    for (const f of features) {
      if (!pointInArea(f, p.lon, p.lat)) continue;
      const e = hits.get(f.properties.id);
      if (e) e.toKm = km; else hits.set(f.properties.id, { id: f.properties.id, name: f.properties.name, kind: f.properties.kind, fromKm: km, toKm: km });
    }
  }
  return [...hits.values()].sort((a, b) => a.fromKm - b.fromKm || (a.kind === b.kind ? 0 : a.kind === 'sea' ? -1 : 1));
}

export const TRIP_NO_STATUS = 'Kein amtlicher Warnstatus';
export const TRIP_NO_STATUS_WHY = 'Der Warnbericht des Seewetterdienstes Hamburg (WODL45) nennt dieses Gebiet nicht. Das heißt nicht „keine Warnung“.';
export const TRIP_STATUS_UNREADABLE = 'Der Warnstatus des Seewetterdienstes ist derzeit nicht lesbar — das heißt nicht „keine Warnung“.';
const OSTSEE_COASTS = new Set(['501000006', '501000007', '501000008']);
export interface TripOfficial {
  /** "Seegebiet Westliche Ostsee" · "Deutsche Ostseeküste (Flensburg bis Fehmarn)". */
  title: string;
  /** The official text, verbatim; `null` = none (see `note`). */
  text: string | null;
  /** Issue time as the page writes it, with the product. */
  issued: string | null;
  note: string | null;
}
/**
 * The warning status of every crossed area in the words of the Seewetterdienst (WODL45), with its issue time. The
 * bulletin names three sea areas and the two German coasts; every other area gets "Kein amtlicher Warnstatus". Nothing
 * is summarised, sharpened or weakened here — the text is passed through.
 */
export function tripOfficial(hits: readonly TripAreaHit[], wodl: SeaTextDoc | null, stale: boolean): TripOfficial[] {
  const parts = wodl?.parts.kind === 'warnings' ? wodl.parts : null;
  const issuedOf = (iso: string | null | undefined) => (iso && Number.isFinite(Date.parse(iso)) ? `WODL45, herausgegeben ${dateTime(Date.parse(iso))} Uhr` : null);
  const staleNote = stale ? 'Der Warnstatus ist älter als 4 Stunden und gilt deshalb als unbekannt.' : null;
  const out: TripOfficial[] = [], coasts = new Map<string, string[]>();
  for (const h of hits) {
    if (h.kind === 'coast') { const c = OSTSEE_COASTS.has(h.id) ? 'Ostseekueste' : 'Nordseekueste'; coasts.set(c, [...(coasts.get(c) ?? []), h.name]); continue; }
    const en = Object.entries(WODL_AREA_IDS).find(([, id]) => id === h.id)?.[0];
    const title = `Seegebiet ${h.name}`;
    if (!en) { out.push({ title, text: null, issued: null, note: `${TRIP_NO_STATUS}. ${TRIP_NO_STATUS_WHY}` }); continue; }
    const a = parts?.seaAreas.find((x) => x.name === en) ?? null;
    out.push(a ? { title: `${title} (${en})`, text: a.text, issued: issuedOf(wodl!.issuedAt), note: staleNote } : { title, text: null, issued: null, note: TRIP_STATUS_UNREADABLE });
  }
  for (const [coast, names] of coasts) {
    const c = parts?.coasts.find((x) => x.coast === coast) ?? null;
    const title = `Deutsche ${coast === 'Ostseekueste' ? 'Ostseeküste' : 'Nordseeküste'} (${names.join(', ')})`;
    out.push(c ? { title, text: c.text, issued: issuedOf(c.issuedAt ?? wodl!.issuedAt), note: staleNote } : { title, text: null, issued: null, note: TRIP_STATUS_UNREADABLE });
  }
  return out;
}

// --- Strand ----------------------------------------------------------------------------------------------------------

export type Dusk = 'hell' | 'daemmerung' | 'dunkel';
export const DUSK_LABEL: Readonly<Record<Dusk, string>> = Object.freeze({ hell: 'hell', daemmerung: 'Dämmerung', dunkel: 'dunkel' });
export const DUSK_SHORT: Readonly<Record<Dusk, string>> = Object.freeze({ hell: 'hell', daemmerung: 'Dämm.', dunkel: 'dunkel' });
/** Light of the hour that starts at `hourMs`, read at its middle (as `classify` reads daylight). */
export function duskOf(hourMs: number, lat: number, lon: number): Dusk {
  const alt = sunAltitudeDeg(new Date(hourMs + 30 * 60_000), lat, lon);
  return alt > DUSK_HORIZON_DEG ? 'hell' : alt > DUSK_CIVIL_DEG ? 'daemmerung' : 'dunkel';
}
/** The window Strand opens with: today 17 to 22 h local time; once that is over, tomorrow's. Full hours, UTC ms. */
export function strandDefaultWindow(nowMs: number): { startMs: number; endMs: number } {
  const nowHour = Math.floor(nowMs / H) * H, len = (SEA_STRAND_TO_H - SEA_STRAND_FROM_H) * H;
  for (let t = nowHour - 24 * H; t <= nowHour + 48 * H; t += H) if (berlinHour(t) === SEA_STRAND_FROM_H && t + len >= nowHour) return { startMs: t, endMs: t + len };
  return { startMs: nowHour, endMs: nowHour + len };
}
/** A window in absolute time → hours of the page's axis, cut to it. `null` when no hour of the window carries values. */
export function strandHours(startMs: number, endMs: number, nowHour: number, nHours: number): { start: number; end: number; cut: boolean } | null {
  const a = Math.round((startMs - nowHour) / H), b = Math.round((endMs - nowHour) / H);
  const start = Math.max(0, a), end = Math.min(nHours - 1, b);
  return end >= start ? { start, end, cut: start !== a || end !== b } : null;
}

export interface StrandHour { t: number; windMs: number | null; gustMs: number | null; windDir: number | null; hs: number | null; dry?: boolean }
export const SHORE_SIDE_WORD: Readonly<Record<DriftSide, string>> = Object.freeze({ see: 'von See', quer: 'längs des Ufers', land: 'vom Land' });
export interface StrandRow {
  id: string; name: string;
  /** Hours of the window with the wind from the sea (auflandig, schräg auflandig), from the land, and with a direction at all. */
  seaHours: number; landHours: number; knownHours: number;
  /** The chosen hour. */
  hour: StrandHour | null; shore: ShoreAngle | null; side: DriftSide | null;
}
export type StrandOrder = 'see' | 'land';
/**
 * The spots sorted by the number of hours with the wind from the sea in the window (`order: 'land'` flips it: most hours
 * with the wind from the land first). Equal counts keep the catalogue's order. This is an order by wind direction to the
 * shore, not a rating.
 */
export function strandRows(
  spots: readonly Pick<SeaSpot, 'id' | 'name' | 'normal'>[], hoursOf: (id: string, k: number) => StrandHour | null,
  win: { start: number; end: number }, pickK: number, order: StrandOrder = 'see',
): StrandRow[] {
  const rows = spots.map((s) => {
    let seaHours = 0, landHours = 0, knownHours = 0;
    for (let k = win.start; k <= win.end; k++) {
      const side = driftSideOf(shoreAngle(hoursOf(s.id, k)?.windDir ?? null, s.normal));
      if (!side) continue;
      knownHours++;
      if (side === 'see') seaHours++; else if (side === 'land') landHours++;
    }
    const hour = hoursOf(s.id, pickK), shore = shoreAngle(hour?.windDir ?? null, s.normal);
    return { id: s.id, name: s.name, seaHours, landHours, knownHours, hour, shore, side: driftSideOf(shore) };
  });
  const key = (r: StrandRow) => (order === 'see' ? r.seaHours : r.landHours);
  return rows.map((r, i) => ({ r, i })).sort((a, b) => key(b.r) - key(a.r) || a.i - b.i).map((x) => x.r);
}
/** "Wind von See an 3 von 5 Stränden" for the chosen hour. */
export function strandHead(rows: readonly StrandRow[]): string {
  const known = rows.filter((r) => r.side != null).length, see = rows.filter((r) => r.side === 'see').length;
  return known === 0 ? 'Für diese Stunde liegt an keinem Strand eine Windrichtung vor' : `Wind von See an ${see} von ${known} Stränden`;
}
/** "5 von 6 Stunden von See" — what the order is made of, per beach. */
export function strandCountText(r: StrandRow, order: StrandOrder, hours: number): string {
  if (r.knownHours === 0) return 'keine Windrichtung im Fenster';
  const c = order === 'see' ? r.seaHours : r.landHours;
  return `${c} von ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'} ${order === 'see' ? 'von See' : 'vom Land'}${r.knownHours < hours ? ` (${hours - r.knownHours} ohne Richtung)` : ''}`;
}
export const shoreWord = (s: ShoreAngle | null): string => (s ? SHORE_LABEL[s] : 'keine Richtung');

// --- Link ------------------------------------------------------------------------------------------------------------

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');
const unstamp = (s: string): number | null => {
  const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10));
  return stamp(ms) === s ? ms : null;
};
const inSea = (lat: number, lon: number) => lat >= 45 && lat <= 62 && lon >= 0 && lon <= 25;

export interface EtappeLink { departMs: number; speedKn: number; points: TripPoint[] }
/** `et=<departure YYYYMMDDHH UTC>_<speed × 10>_<lat×10⁴>x<lon×10⁴>.<…>` (E-AM-12) — positions to four decimals (≈ 11 m). */
export const ET_PARAM_RE = /^(\d{10})_(\d{1,3})_((?:\d{6}x\d{4,6})(?:\.\d{6}x\d{4,6}){0,11})$/;
export function encodeEtappeParam(e: EtappeLink): string {
  const pt = (p: TripPoint) => `${Math.round(p.lat * 1e4)}x${String(Math.round(p.lon * 1e4)).padStart(4, '0')}`;
  return `${stamp(e.departMs)}_${Math.round(clampSpeedKn(e.speedKn) * 10)}_${e.points.slice(0, SEA_TRIP_MAX_POINTS).map(pt).join('.')}`;
}
export function parseEtappeParam(raw: string | null | undefined): EtappeLink | null {
  const m = raw ? ET_PARAM_RE.exec(raw) : null;
  if (!m) return null;
  const departMs = unstamp(m[1]), speedKn = Number(m[2]) / 10;
  if (departMs == null || !(speedKn >= SEA_TRIP_SPEED_MIN_KN && speedKn <= SEA_TRIP_SPEED_MAX_KN)) return null;
  const points = m[3].split('.').map((s) => { const [a, b] = s.split('x'); return { lat: Number(a) / 1e4, lon: Number(b) / 1e4 }; });
  return points.every((p) => inSea(p.lat, p.lon)) ? { departMs, speedKn, points } : null;
}

export interface StrandLink { startMs: number; endMs: number }
/** `sd=<start>_<end>`, both full UTC hours (E-AM-12); at most 24 hours. */
export const SD_PARAM_RE = /^(\d{10})_(\d{10})$/;
export const encodeStrandParam = (s: StrandLink): string => `${stamp(s.startMs)}_${stamp(s.endMs)}`;
export function parseStrandParam(raw: string | null | undefined): StrandLink | null {
  const m = raw ? SD_PARAM_RE.exec(raw) : null;
  if (!m) return null;
  const startMs = unstamp(m[1]), endMs = unstamp(m[2]);
  return startMs != null && endMs != null && endMs >= startMs && endMs - startMs <= 24 * H ? { startMs, endMs } : null;
}
/** The mode a link opens: the key says it (`pl` Vor Ort, `et` Etappe, `sd` Strand); none = planner closed. */
export function tripModeOfLink(q: { pl: string | null; et: string | null; sd: string | null }): TripMode | null {
  return q.et ? 'etappe' : q.sd ? 'strand' : q.pl ? 'ort' : null;
}

// --- Words -------------------------------------------------------------------------------------------------------------

export const TRIP_LINE_NOTE = 'Die Etappe ist eine gerade Linie zwischen deinen Punkten, kein Kurs, keine Navigationsgrundlage. Land, Flachwasser und Fahrwasser prüft die Seite nicht.';
export const TRIP_ARRIVAL_NOTE = 'Die Ankunft folgt aus Strecke und eingegebener Fahrt. Der Strom steht in der Tabelle, verändert die Ankunft aber nicht.';
export const TRIP_TWO_NOTE = 'Wind und Strom stehen getrennt, je mit ihrer Richtung. Eine gemeinsame Drift rechnet die Seite nicht.';
export const TRIP_HOURLY_NOTE = 'Alle Angaben sind Stundenwerte am Ort der vollen Stunde. Zwischen zwei Stunden kann der Wind stärker sein.';
export const TRIP_WAVE_NOTE = 'Welle: stündlich bis 48 Stunden nach dem Modelllauf, danach nur jede dritte Stunde. Dazwischen steht „keine Daten“.';
export const TRIP_MOTOR_NOTE = 'Die Grenze für die Windsee wird auf der Etappe nicht geprüft: das Stundenfeld trägt nur die Gesamtwelle.';
export const TRIP_CONV_NOTE = `Schauer und Gewitter: Hinweis des nächsten Spots im Umkreis von ${SEA_TRIP_CONV_KM} km (gesetzter Wert), aus Modellwerten, keine Warnung.`;
export const TRIP_ASK_START = 'Klicke auf die Karte: der erste Punkt ist der Start, der zweite das Ziel. Ein Klick auf einen Spot rastet dort ein.';
export const TRIP_ASK_END = 'Jetzt das Ziel: klicke auf die Karte oder auf einen Spot.';
export const TRIP_NO_FUSION = 'Wind und Böen: keine Daten. buscosun Fusion hat für diesen Punkt keine Rechnung auf dem Punkt-Cube geliefert.';
export const TRIP_ARRIVAL_HOUR_NOTE = (hourMs: number) => `Werte der Ankunft: Stundenwert von ${hh(hourMs)} Uhr (nächste volle Stunde).`;
export const tripSampleNote = (n: number, stepKm: number, widened: boolean) =>
  `Wind und Böen: buscosun Fusion an ${n} Punkten der Etappe, ${widened ? `alle ${stepKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km (weiter als die üblichen ${SEA_TRIP_SAMPLE_KM} km, weil die Etappe lang ist)` : `höchstens ${SEA_TRIP_SAMPLE_KM} km auseinander (gesetzter Wert)`}. Jede Stunde liest den nächsten Punkt.`;
export const STRAND_NOTE = 'Gezeigt wird nur die Windrichtung zum Ufer. Keine Bewertung der Strände, keine Fangprognose.';
export const STRAND_ORDER_NOTE = 'Die Reihenfolge zählt die Stunden des Fensters mit Wind von See. Wind und Welle gelten an der Wasserzelle des Spots.';
export const STRAND_DUSK_NOTE = 'hell, Dämmerung, dunkel: Sonnenstand zur halben Stunde in der Mitte der gezeigten Strände; Dämmerung heißt Sonne bis 6° unter dem Horizont.';
export const STRAND_LEVEL_NOTE = `Wasserstand: nur wo ein Pegel des BSH mit Kurve bis ${SEA_TRIP_WL_KM} km vom Spot liegt, und je Liste an höchstens ${SEA_STRAND_WL_MAX} Pegeln (gesetzte Werte). Fehlt er, heißt das nichts über den Wasserstand.`;
export const TRIP_LEGEND = Object.freeze({ in: 'innerhalb deiner Grenzen', over: 'darüber', missing: 'ein Wert fehlt', wind: 'Wind, wenn du dort bist', cur: 'stärkster Strom der Etappe' });
