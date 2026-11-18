/**
 * Phase SP — "Ausfahrt planen" on /seewetter (`audit/seewetter-planer.md`). Pure: no React, no MapLibre, no fetch.
 *
 * A trip is a launch point (the spot), a boat position near it and a window start → return on the page's hour axis. This
 * module reads the spot's HOURLY values over that window and says:
 *   - the highest hourly value of wind and of gust, with its hour, and the first hour above the profile's limit
 *   - where the shore angle changes, and the first hour of "schräg ablandig" / "ablandig"
 *   - the wind relative to the straight return line boat → launch
 *   - the return against sunset
 * What it never says: a drift distance or time (wind alone gives neither), "sicher"/"unsicher", a distance to the shore
 * (there is no shoreline in the data, E-SP-5), and nothing about the window from the per-hour shares "über Grenze" of
 * phase SU — those hold for one hour each.
 *
 * Wind and gust are computed AT THE SPOT. That is why the boat stays inside `SEA_PLAN_RADIUS_KM` around it.
 */
import { sunAltitudeDeg } from '../photo/sun';
import { MS_TO_KN, SHORE_LABEL, fmtWind, shoreAngle, unitLabel, type SeaUnit, type ShoreAngle } from './seaProfiles';
import { seaCellCentre, type SeaSpot } from './seaContract';
import { compass16, dayShort, hh, hm } from './seaView';

const H = 3_600_000;
const RAD = Math.PI / 180;
const EARTH_KM = 6371.0088;

/** `set` (E-SP-2): how far the boat may lie from the spot — about two grid widths of the short-range model around the point the wind is computed at. */
export const SEA_PLAN_RADIUS_KM = 5;
/** `set` (E-SP-4): the window the planner opens with, and the shortest one. */
export const SEA_PLAN_DEFAULT_H = 3;
export const SEA_PLAN_MIN_H = 1;
/** `set` (E-SP-6): the boat starts at least this far from the spot, so the return line is visible. */
export const SEA_PLAN_START_KM = 0.8;

// --- Geometry ------------------------------------------------------------------------------------------------

export interface PlanPos { lat: number; lon: number }

/** Great-circle distance in km. */
export function planDistKm(a: PlanPos, b: PlanPos): number {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** Initial bearing a → b, degrees clockwise from north, 0 ≤ x < 360. */
export function planBearingDeg(a: PlanPos, b: PlanPos): number {
  const dLon = (b.lon - a.lon) * RAD;
  const y = Math.sin(dLon) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
/** The point `km` from `a` along `bearing`. */
export function planDestination(a: PlanPos, bearing: number, km: number): PlanPos {
  const d = km / EARTH_KM, br = bearing * RAD, lat1 = a.lat * RAD, lon1 = a.lon * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / RAD, lon: lon2 / RAD };
}
/** The boat inside the radius: a position farther out comes back onto the circle, on its own bearing. */
export function clampToRadius(launch: PlanPos, pos: PlanPos, radiusKm = SEA_PLAN_RADIUS_KM): PlanPos & { km: number; clamped: boolean } {
  const km = planDistKm(launch, pos);
  if (!(km > radiusKm)) return { lat: pos.lat, lon: pos.lon, km, clamped: false };
  const p = planDestination(launch, planBearingDeg(launch, pos), radiusKm);
  return { ...p, km: radiusKm, clamped: true };
}
/** The circle of the radius as a closed ring of [lon, lat]. */
export function radiusRing(launch: PlanPos, radiusKm = SEA_PLAN_RADIUS_KM, n = 72): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const p = planDestination(launch, (i % n) * (360 / n), radiusKm); ring.push([p.lon, p.lat]); }
  return ring;
}
/** [west, south, east, north] of the radius — what the map shows when the planner opens. */
export function radiusBounds(launch: PlanPos, radiusKm = SEA_PLAN_RADIUS_KM): [number, number, number, number] {
  const n = planDestination(launch, 0, radiusKm), e = planDestination(launch, 90, radiusKm), s = planDestination(launch, 180, radiusKm), w = planDestination(launch, 270, radiusKm);
  return [w.lon, s.lat, e.lon, n.lat];
}
/**
 * Where the boat starts (E-SP-6): the centre of the spot's water cell — water by the wave model's own mask — moved out
 * along the same bearing to at least `SEA_PLAN_START_KM`. A cell on top of the spot gives no bearing; then the shore
 * normal (pointing seaward) is the direction.
 */
export function defaultBoat(spot: Pick<SeaSpot, 'lat' | 'lon' | 'normal' | 'cell'>): PlanPos {
  const cell = seaCellCentre(spot.cell.model, spot.cell.i, spot.cell.j);
  const km = planDistKm(spot, cell);
  const bearing = km < 0.05 ? spot.normal : planBearingDeg(spot, cell);
  const p = planDestination(spot, bearing, Math.min(SEA_PLAN_RADIUS_KM, Math.max(SEA_PLAN_START_KM, km)));
  return { lat: round4(p.lat), lon: round4(p.lon) };
}
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

// --- Wind against the return line, and where it pushes ----------------------------------------------------------

/** a − b folded into −180 < x ≤ 180 (350° against 10° is −20°, not 340°). */
export function angleDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export type RelWind = 'vorn' | 'schraeg-vorn' | 'seite' | 'schraeg-hinten' | 'hinten';
export const REL_LABEL: Readonly<Record<RelWind, string>> = Object.freeze({
  vorn: 'von vorn', 'schraeg-vorn': 'schräg von vorn', seite: 'von der Seite', 'schraeg-hinten': 'schräg von hinten', hinten: 'von hinten',
});
/** `set` (E-SP-3): the same borders as the shore angle (30 / 75 / 105 / 150°). */
export const REL_BORDERS = [30, 75, 105, 150] as const;
/**
 * The wind on the way back: `windFromDeg` is where the wind COMES FROM, `courseDeg` the bearing boat → launch. Wind
 * from exactly the launch point is "von vorn".
 */
export function relativeWind(windFromDeg: number | null | undefined, courseDeg: number | null | undefined): RelWind | null {
  if (windFromDeg == null || courseDeg == null || !Number.isFinite(windFromDeg) || !Number.isFinite(courseDeg)) return null;
  const d = Math.abs(angleDiff(windFromDeg, courseDeg));
  if (d <= REL_BORDERS[0]) return 'vorn';
  if (d <= REL_BORDERS[1]) return 'schraeg-vorn';
  if (d <= REL_BORDERS[2]) return 'seite';
  if (d <= REL_BORDERS[3]) return 'schraeg-hinten';
  return 'hinten';
}

/** From which side the wind comes at this shore: the two "auflandig" classes, the two "ablandig" classes, or along it. */
export type DriftSide = 'see' | 'land' | 'quer';
export const DRIFT_SIDE_LABEL: Readonly<Record<DriftSide, string>> = Object.freeze({ see: 'Wind von See', land: 'Wind vom Land', quer: 'Wind längs des Ufers' });
export const driftSideOf = (shore: ShoreAngle | null): DriftSide | null =>
  (shore == null ? null : shore === 'auflandig' || shore === 'schraeg-auflandig' ? 'see' : shore === 'sideshore' ? 'quer' : 'land');
/** Direction the wind pushes towards (never a distance, never a time) and the side it comes from. */
export function driftOf(windFromDeg: number | null | undefined, normalDeg: number): { toDeg: number; shore: ShoreAngle; side: DriftSide } | null {
  const shore = shoreAngle(windFromDeg ?? null, normalDeg);
  if (shore == null || windFromDeg == null) return null;
  return { toDeg: (((windFromDeg + 180) % 360) + 360) % 360, shore, side: driftSideOf(shore)! };
}

// --- The window on the hour axis --------------------------------------------------------------------------------

/**
 * A window in absolute time → hour offsets on the page's axis (`nowHour` = hour 0, `nHours` hours). A window that has
 * ended, or lies beyond the series, keeps its length and moves (`moved`); a start in the past or a return beyond the end
 * is cut (`cut`). `null` when the axis has no two hours.
 */
export function planWindow(startMs: number, endMs: number, nowHour: number, nHours: number): { start: number; end: number; moved: boolean; cut: boolean } | null {
  if (!(nHours >= 2)) return null;
  const last = nHours - 1;
  let s = Math.round((startMs - nowHour) / H), e = Math.round((endMs - nowHour) / H);
  const len = Math.min(last, Math.max(SEA_PLAN_MIN_H, e - s));
  let moved = false, cut = false;
  if (e <= 0) { s = 0; e = len; moved = true; }
  else if (s >= last) { e = last; s = last - len; moved = true; }
  else {
    if (s < 0) { s = 0; cut = true; }
    if (e > last) { e = last; cut = true; }
    if (e - s < SEA_PLAN_MIN_H) { if (s + SEA_PLAN_MIN_H <= last) e = s + SEA_PLAN_MIN_H; else s = e - SEA_PLAN_MIN_H; }
  }
  return { start: s, end: e, moved, cut };
}
/** The window the planner opens with: from the chosen hour, `SEA_PLAN_DEFAULT_H` long, inside the axis. */
export function defaultWindow(k: number, nHours: number): { start: number; end: number } | null {
  if (!(nHours >= 2)) return null;
  const last = nHours - 1;
  const start = Math.max(0, Math.min(k, last - SEA_PLAN_MIN_H));
  return { start, end: Math.min(last, start + SEA_PLAN_DEFAULT_H) };
}

// --- Findings over the window -----------------------------------------------------------------------------------

/** The hourly values the planner reads (the page's hour fits). */
export interface PlanHour {
  t: number; windMs: number | null; gustMs: number | null; windDir: number | null;
  /** Phase SG: shower/thunderstorm hint of the hour (0 none · 1 "Schauer möglich" · 2 "Gewitter möglich"); `null`/absent = no statement. */
  conv?: number | null;
}
/** Phase SG: what the hint says inside the window. A hint from model values — it never touches the limits or the classes. */
export interface PlanConv {
  /** Hours of the window with a statement (0, 1 or 2). */
  known: number;
  /** First hour with "Schauer möglich" or "Gewitter möglich", and its class. */
  first: { t: number; cls: 1 | 2 } | null;
  /** First hour with "Gewitter möglich" (may be the same hour as `first`). */
  firstThunder: number | null;
}
export interface PlanPeak { ms: number; t: number }
export interface PlanShoreChange { t: number; from: ShoreAngle; to: ShoreAngle }
export interface PlanFindings {
  /** Hours of the window, both ends counted. */
  hours: number;
  /** Hours without a wind / gust / direction value — the maxima and "first hour" answers hold for the others only. */
  missingWind: number; missingGust: number; missingDir: number;
  /** Highest HOURLY value in the window (the earliest hour on a tie). */
  maxWind: PlanPeak | null; maxGust: PlanPeak | null;
  /** First hour whose mean lies above the profile's limit (kn), `null` = no hour with a value does. */
  overWind: { t: number; limitKn: number } | null;
  overGust: { t: number; limitKn: number } | null;
  shore: {
    start: ShoreAngle | null; end: ShoreAngle | null;
    changes: PlanShoreChange[];
    /** First hour in the class "schräg ablandig" / "ablandig" (the start hour counts). */
    firstObliqueOff: number | null; firstOff: number | null;
  };
  wind: {
    start: PlanHour | null; end: PlanHour | null;
    /** Return minus start, m/s. */
    deltaMs: number | null;
    /** Turn of the direction start → return, −180 < x ≤ 180; positive = to the right (clockwise). */
    turnDeg: number | null;
  };
  conv: PlanConv;
}

const finite = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/**
 * The window `startK … endK` (both inclusive) of `hours` (index = hour offset; a `null` entry or an index outside the
 * array is an hour without values). Limits in knots, as in the profile.
 */
export function planFindings(
  hours: ReadonlyArray<PlanHour | null | undefined>, startK: number, endK: number,
  opts: { normal: number; windMaxKn?: number | null; gustMaxKn?: number | null },
): PlanFindings {
  const a = Math.min(startK, endK), b = Math.max(startK, endK);
  const out: PlanFindings = {
    hours: b - a + 1, missingWind: 0, missingGust: 0, missingDir: 0, maxWind: null, maxGust: null, overWind: null, overGust: null,
    shore: { start: null, end: null, changes: [], firstObliqueOff: null, firstOff: null },
    wind: { start: null, end: null, deltaMs: null, turnDeg: null },
    conv: { known: 0, first: null, firstThunder: null },
  };
  let lastShore: ShoreAngle | null = null;
  for (let k = a; k <= b; k++) {
    const h = hours[k] ?? null;
    const cv = h?.conv;
    if (cv === 0 || cv === 1 || cv === 2) {
      out.conv.known++;
      if (cv !== 0 && !out.conv.first) out.conv.first = { t: h!.t, cls: cv };
      if (cv === 2 && out.conv.firstThunder == null) out.conv.firstThunder = h!.t;
    }
    const w = finite(h?.windMs) ? h!.windMs! : null, g = finite(h?.gustMs) ? h!.gustMs! : null, d = finite(h?.windDir) ? h!.windDir! : null;
    if (w == null) out.missingWind++;
    else {
      if (!out.maxWind || w > out.maxWind.ms) out.maxWind = { ms: w, t: h!.t };
      if (opts.windMaxKn != null && !out.overWind && w * MS_TO_KN > opts.windMaxKn) out.overWind = { t: h!.t, limitKn: opts.windMaxKn };
    }
    if (g == null) out.missingGust++;
    else {
      if (!out.maxGust || g > out.maxGust.ms) out.maxGust = { ms: g, t: h!.t };
      if (opts.gustMaxKn != null && !out.overGust && g * MS_TO_KN > opts.gustMaxKn) out.overGust = { t: h!.t, limitKn: opts.gustMaxKn };
    }
    const sh = shoreAngle(d, opts.normal);
    if (sh == null) { out.missingDir++; continue; }
    if (lastShore && sh !== lastShore) out.shore.changes.push({ t: h!.t, from: lastShore, to: sh });
    if (sh === 'schraeg-ablandig' && out.shore.firstObliqueOff == null) out.shore.firstObliqueOff = h!.t;
    if (sh === 'ablandig' && out.shore.firstOff == null) out.shore.firstOff = h!.t;
    lastShore = sh;
  }
  const s = hours[a] ?? null, e = hours[b] ?? null;
  out.shore.start = shoreAngle(s?.windDir ?? null, opts.normal);
  out.shore.end = shoreAngle(e?.windDir ?? null, opts.normal);
  out.wind.start = s; out.wind.end = e;
  if (finite(s?.windMs) && finite(e?.windMs)) out.wind.deltaMs = e!.windMs! - s!.windMs!;
  if (finite(s?.windDir) && finite(e?.windDir)) out.wind.turnDeg = angleDiff(e!.windDir!, s!.windDir!);
  return out;
}

// --- Sun at the return -------------------------------------------------------------------------------------------

const HORIZON = -0.833;
export interface PlanSun {
  /** Sun above the horizon at `t`. */
  up: boolean;
  /** Up: the next sunset. Down: the last one. `null` = none within 24 h. */
  sunset: number | null;
  /** Down: the next sunrise. */
  sunrise: number | null;
}
/** Sunset next to `t` at the position, to the minute (scan of the sun altitude, the page's own `sunAltitudeDeg`). */
export function sunAround(t: number, lat: number, lon: number): PlanSun {
  const upAt = (ms: number) => sunAltitudeDeg(new Date(ms), lat, lon) > HORIZON;
  const up = upAt(t);
  const flip = (dir: 1 | -1): number | null => {
    for (let m = 1; m <= 1440; m++) if (upAt(t + dir * m * 60_000) !== up) return t + dir * m * 60_000;
    return null;
  };
  if (up) return { up, sunset: flip(1), sunrise: null };
  const before = flip(-1);
  return { up, sunset: before == null ? null : before + 60_000, sunrise: flip(1) };
}

// --- Link (`pl=<start>_<return>_<lat>_<lon>`, E-SP-7) ------------------------------------------------------------

export interface PlanLink { startMs: number; endMs: number; lat: number; lon: number }
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');
const unstamp = (s: string): number | null => {
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8), h = +s.slice(8, 10);
  const ms = Date.UTC(y, mo - 1, d, h);
  return stamp(ms) === s ? ms : null;
};
/** Full UTC hours, position to four decimals (≈ 11 m). */
export const encodePlanParam = (p: PlanLink): string => `${stamp(p.startMs)}_${stamp(p.endMs)}_${p.lat.toFixed(4)}_${p.lon.toFixed(4)}`;
export const PLAN_PARAM_RE = /^(\d{10})_(\d{10})_(\d{1,2}\.\d{1,5})_(\d{1,3}\.\d{1,5})$/;
export function parsePlanParam(raw: string | null | undefined): PlanLink | null {
  const m = raw ? PLAN_PARAM_RE.exec(raw) : null;
  if (!m) return null;
  const startMs = unstamp(m[1]), endMs = unstamp(m[2]), lat = Number(m[3]), lon = Number(m[4]);
  if (startMs == null || endMs == null || !(endMs > startMs) || endMs - startMs > 200 * H) return null;
  if (!(lat >= 45 && lat <= 62 && lon >= 0 && lon <= 25)) return null;
  return { startMs, endMs, lat, lon };
}

// --- Words --------------------------------------------------------------------------------------------------------

const clock = (t: number) => `${dayShort(t)} ${hh(t)}:00`;
const knText = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const val = (ms: number, unit: SeaUnit) => `${fmtWind(ms, unit)} ${unitLabel(unit)}`;

export const PLAN_FOOTER = 'Amtliche Warnungen gehen vor.';
export const PLAN_LINE_NOTE = 'Die gestrichelte Linie ist die gerade Verbindung vom Boot zum Startort. Sie ist kein Kurs und sagt nichts über die Fahrzeit.';
export const PLAN_RADIUS_NOTE = `Das Boot bleibt im Umkreis von ${SEA_PLAN_RADIUS_KM} km um den Spot (gesetzter Wert): Wind und Böen sind am Spot gerechnet, nicht am Boot.`;
export const PLAN_HOURLY_NOTE = 'Alle Angaben sind Stundenwerte. Zwischen zwei Stunden kann der Wind stärker sein.';
export const PLAN_DRIFT_NOTE = 'Die Pfeile am Boot zeigen nur, wohin der Wind drückt. Wie weit und wie schnell, lässt sich aus dem Wind allein nicht sagen.';
export const PLAN_TIDAL_NOTE = 'Watt: Wo das Wasser endet, hängt vom Wasserstand ab. Die Linie führt zum Startort, nicht zur Wasserkante.';
export const PLAN_MOVED_NOTE = 'Das Fenster lag außerhalb der Vorhersage und beginnt jetzt bei der ersten Stunde, mit gleicher Dauer.';
export const PLAN_CUT_NOTE = 'Ein Teil des Fensters liegt außerhalb der Vorhersage (vorbei oder zu weit voraus). Gezeigt wird der Teil mit Stundenwerten.';
export const PLAN_COLOUR_NOTE = 'Farbe der Pfeile: hellblau bei Wind von See, orange bei Wind vom Land, hell bei Wind längs des Ufers. Die Einteilung ist der Uferwinkel am Spot.';
export const PLAN_ASK_SPOT = 'Von welchem Spot startest du? Wähle ihn in der Liste oder auf der Karte.';

/** "2,4 km" · "350 m" · "unter 100 m". */
export function distText(km: number): string {
  if (!Number.isFinite(km)) return '–';
  if (km < 0.1) return 'unter 100 m';
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return `${km.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
/** The label on the return line: distance to the launch point and the wind against the way back. */
export function lineLabel(boat: PlanPos, launch: PlanPos, windFromDeg: number | null | undefined): string {
  const km = planDistKm(boat, launch);
  const rel = km < 0.05 ? null : relativeWind(windFromDeg, planBearingDeg(boat, launch));
  return `${distText(km)} zum Startort${rel ? `, Wind ${REL_LABEL[rel]}` : windFromDeg == null ? ', Windrichtung fehlt' : ''}`;
}
/** The wind badge at the boat for one hour. */
export function badgeText(h: PlanHour | null | undefined, unit: SeaUnit): string {
  if (!h || !finite(h.windMs)) return 'kein Windwert für diese Stunde';
  const gust = finite(h.gustMs) ? `, Böen ${val(h.gustMs, unit)}` : '';
  return `${val(h.windMs, unit)}${gust}${finite(h.windDir) ? `, aus ${compass16(h.windDir)}` : ''}`;
}

export type PlanEventKind = 'maxWind' | 'maxGust' | 'overWind' | 'overGust' | 'shore' | 'sunset' | 'conv';
export const PLAN_CONV_NOTE = 'Hinweis aus Modellwerten, keine Warnung';
/** Phase SG: the one line about showers and thunderstorms — the first hour of the window with a hint. */
export function planConvText(c: PlanConv): string | null {
  if (!c.first) return null;
  const later = c.first.cls === 1 && c.firstThunder != null ? `, Gewitter möglich ab ${clock(c.firstThunder)}` : '';
  return `${c.first.cls === 2 ? 'Gewitter' : 'Schauer'} möglich ab ${clock(c.first.t)} (erste Stunde im Fenster)${later}. ${PLAN_CONV_NOTE}.`;
}
/** Phase SG: the line of the summary — said only where the hint does not cover the window or finds nothing. */
export function planConvSummary(f: PlanFindings): string | null {
  const c = f.conv;
  if (c.known === 0) return 'Schauer und Gewitter: keine Daten für die Stunden dieses Fensters.';
  if (c.known < f.hours) return `Schauer und Gewitter: für ${f.hours - c.known} von ${f.hours} Stunden des Fensters gibt es keine Aussage (der Hinweis reicht nicht so weit).`;
  return c.first ? null : 'Schauer und Gewitter: in keiner Stunde des Fensters ein Hinweis.';
}
export interface PlanEvent { t: number; kind: PlanEventKind; text: string; /** The hour label ("15:00", for sunset the minute). */ at: string; warn: boolean }

/**
 * What happens inside the window, in order of time — the entries of the planner's rail. Every entry is an hourly value
 * at its hour; sunset is the one entry with a minute.
 */
export function planEvents(f: PlanFindings, unit: SeaUnit, sunset: number | null, startT: number, endT: number): PlanEvent[] {
  const ev: PlanEvent[] = [];
  const at = (t: number) => `${hh(t)}:00`;
  if (f.maxWind) ev.push({ t: f.maxWind.t, kind: 'maxWind', at: at(f.maxWind.t), warn: false, text: `Höchster Stundenwert im Fenster: Wind ${val(f.maxWind.ms, unit)}` });
  if (f.maxGust) ev.push({ t: f.maxGust.t, kind: 'maxGust', at: at(f.maxGust.t), warn: false, text: `Höchster Stundenwert im Fenster: Böen ${val(f.maxGust.ms, unit)}` });
  if (f.overWind) ev.push({ t: f.overWind.t, kind: 'overWind', at: at(f.overWind.t), warn: true, text: `Wind über deiner Grenze ab ${clock(f.overWind.t)} (Grenze ${knText(f.overWind.limitKn)} kn)` });
  if (f.overGust) ev.push({ t: f.overGust.t, kind: 'overGust', at: at(f.overGust.t), warn: true, text: `Böen über deiner Grenze ab ${clock(f.overGust.t)} (Grenze ${knText(f.overGust.limitKn)} kn)` });
  for (const c of f.shore.changes) {
    const off = c.to === 'ablandig' || c.to === 'schraeg-ablandig';
    const first = (c.to === 'ablandig' && f.shore.firstOff === c.t) || (c.to === 'schraeg-ablandig' && f.shore.firstObliqueOff === c.t);
    ev.push({ t: c.t, kind: 'shore', at: at(c.t), warn: off, text: `Wind ab ${clock(c.t)} ${SHORE_LABEL[c.to]}${first ? ' (erste Stunde im Fenster)' : ''}, davor ${SHORE_LABEL[c.from]}` });
  }
  if (sunset != null && sunset >= startT && sunset <= endT) ev.push({ t: sunset, kind: 'sunset', at: hm(sunset), warn: false, text: 'Sonnenuntergang' });
  const convText = planConvText(f.conv);
  if (convText && f.conv.first) ev.push({ t: f.conv.first.t, kind: 'conv', at: at(f.conv.first.t), warn: false, text: convText });
  const order: PlanEventKind[] = ['sunset', 'shore', 'conv', 'overWind', 'overGust', 'maxWind', 'maxGust'];
  return ev.sort((x, y) => x.t - y.t || order.indexOf(x.kind) - order.indexOf(y.kind));
}

/** What holds for the window as a whole — each line an answer from hourly values, none from the per-hour shares. */
export function planSummary(f: PlanFindings, unit: SeaUnit, limits: { windMaxKn?: number | null; gustMaxKn?: number | null; conv?: boolean }): string[] {
  const out: string[] = [];
  if (f.missingWind === f.hours) out.push('Für keine Stunde des Fensters liegt ein Windwert vor.');
  else if (f.missingWind > 0 || f.missingGust > 0) {
    const n = Math.max(f.missingWind, f.missingGust);
    out.push(`${n} von ${f.hours} Stunden des Fensters haben keinen ${f.missingWind > 0 ? 'Windwert' : 'Böenwert'}. Höchstwerte und Grenzen gelten nur für die übrigen Stunden.`);
  }
  if (limits.windMaxKn != null && f.maxWind && !f.overWind) out.push(`Wind: kein Stundenwert im Fenster über deiner Grenze (${knText(limits.windMaxKn)} kn).`);
  if (limits.gustMaxKn != null && f.maxGust && !f.overGust) out.push(`Böen: kein Stundenwert im Fenster über deiner Grenze (${knText(limits.gustMaxKn)} kn).`);
  if (f.missingDir === f.hours) out.push('Für keine Stunde des Fensters liegt eine Windrichtung vor.');
  else {
    const startOff = f.shore.start === 'ablandig' || f.shore.start === 'schraeg-ablandig';
    if (startOff) out.push(`Schon zum Start weht der Wind ${SHORE_LABEL[f.shore.start!]}.`);
    if (f.shore.firstObliqueOff == null && f.shore.firstOff == null) out.push('Uferwinkel: in keiner Stunde des Fensters ablandig oder schräg ablandig.');
    else {
      // The start hour is already said above; only a later first hour gets its own line.
      const startT = f.wind.start?.t ?? null;
      if (f.shore.firstObliqueOff != null && f.shore.firstObliqueOff !== startT) out.push(`Erste Stunde schräg ablandig: ${clock(f.shore.firstObliqueOff)}.`);
      if (f.shore.firstOff != null && f.shore.firstOff !== startT) out.push(`Erste Stunde ablandig: ${clock(f.shore.firstOff)}.`);
    }
    if (f.missingDir > 0) out.push(`${f.missingDir} von ${f.hours} Stunden haben keine Windrichtung.`);
  }
  const s = f.wind.start, e = f.wind.end;
  if (s && e && finite(s.windMs) && finite(e.windMs)) {
    const turn = f.wind.turnDeg;
    const dirs = finite(s.windDir) && finite(e.windDir) ? ` aus ${compass16(s.windDir)}` : '';
    const dirE = finite(s.windDir) && finite(e.windDir) ? ` aus ${compass16(e.windDir)}` : '';
    const turned = turn == null ? '' : Math.abs(turn) < 5 ? ' Die Richtung bleibt fast gleich.' : ` Der Wind dreht um ${Math.round(Math.abs(turn))}° nach ${turn > 0 ? 'rechts' : 'links'}.`;
    out.push(`Wind zum Start ${val(s.windMs, unit)}${dirs}, zur Rückkehr ${val(e.windMs, unit)}${dirE}.${turned}`);
  }
  // Phase SG (`conv: true` = the page shows the hint): one line where the hint is missing, short or finds nothing.
  const cs = limits.conv ? planConvSummary(f) : null;
  if (cs) out.push(cs);
  return out;
}

const dur = (min: number) => { const m = Math.round(Math.abs(min)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
/** The return against sunset. */
export function sunLine(returnT: number, sun: PlanSun): string {
  if (sun.sunset == null) return 'Sonnenuntergang um die Rückkehr nicht bestimmbar.';
  const min = (sun.sunset - returnT) / 60_000;
  if (sun.up) return `Rückkehr ${dur(min)} vor Sonnenuntergang (${hm(sun.sunset)} Uhr).`;
  return `Rückkehr ${dur(min)} nach Sonnenuntergang (${dayShort(sun.sunset)} ${hm(sun.sunset)} Uhr), also bei Dunkelheit${sun.sunrise != null ? `. Sonnenaufgang ${dayShort(sun.sunrise)} ${hm(sun.sunrise)} Uhr` : ''}.`;
}
export { clock as planClock };
