/**
 * Phase GV — pure view rules of the snow blocks on the dossier level "Heute" (`GlacierSnowLadder.tsx`, variant A "Höhenleiter"):
 *  - the snow ANALYSIS of SNOWGRID (phase GN): one value per Austrian glacier, its place among the winters 1991–2020 in words, where
 *    the value comes from (cells) in words, the last seven days — or the reason there is nothing to show;
 *  - the model snow fields of buscosun Fusion (phase GS): the snowfall line per hour up to +120 h, new snow per day at tongue, median
 *    elevation and top with the p10–p90 spread, the spread of the strongest gust per day;
 *  - the order of the ladder (every number at its elevation).
 * DOM-free, so `verify:glacier-snow-view` reads the same rules as the page.
 *
 * Honesty rules encoded here: a grid value is an analysis (`SNOW_ORIGIN`), never a measurement, and never split into heights; outside
 * Austria there is one neutral sentence; a spread belongs to ONE day — no p10 or p90 is ever summed over days (only the expected values
 * are, and the text says the sum has no spread); new snow is water equivalent in mm (no density); no word judges conditions.
 */
import { fmt0, fmt1 } from './glacierView';
import {
  SNOW_MISSING_TEXT, SNOW_ORIGIN, GLACIER_SNOW_SOURCE, snowDayMs, type GlacierSnowPointer, type SnowCellsDoc, type SnowDayDoc,
} from './glacierSnowContract';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_SNOWLINE_HOURS, weatherSnowProblems, weatherHourlySnowProblems,
  type GlacierWeatherDoc, type GlacierWeatherHourlyDoc, type GlacierWeatherRow,
} from './glacierWeatherContract';
import { weatherView } from './glacierWeatherView';

const DAY = 86_400_000, H = 3_600_000;
/** Days of the analysis shown as a row of bars, ending with the pointer's day (set). */
export const SNOW_VIEW_DAYS = 7;
/** The page shows the analysis while its newest day is at most this old (days from the start of that day, set; one missed run tolerated). */
export const SNOW_VIEW_MAX_AGE_DAYS = 4;
/** Days of the model block: as far as the snowfall line reaches (120 h). */
export const SNOW_MODEL_DAYS = GLACIER_WEATHER_SNOWLINE_HOURS / 24;
/** Origin of every value of the analysis block — the page writes it into `data-origin`; never `measured`. */
export const SNOW_VIEW_ORIGIN = SNOW_ORIGIN;
export const SNOW_ORIGIN_LABEL = 'Analyse';

/** Fixed sentences of the two blocks (the verifier checks the words against the forbidden list). */
export const SNOW_VIEW_TEXT = Object.freeze({
  outside: 'Schneeanalyse nur für österreichische Gletscher.',
  noPointer: 'Der Datenspeicher nennt noch keine Schneeanalyse.',
  loading: 'Die Schneeanalyse wird geladen …',
  absent: 'an diesem Tag nicht veröffentlicht',
  unreadable: 'nicht ladbar',
  noEntry: 'kein Eintrag für diesen Gletscher',
  analysis: 'Analyse für das Gebiet um den Gletscher auf einem 1-km-Gitter, keine Messung und keine Höhenstufe: ein Wert für den ganzen Gletscher.',
  place: 'Einordnung der Schneehöhe gegen denselben Kalendertag der Winter 1991–2020 an denselben Zellen.',
  cellsUnreadable: 'Aus welchen Zellen der Wert stammt, ist gerade nicht ladbar.',
  noPlace: 'ohne Einordnung: für diesen Gletscher fehlt die Spanne der Jahre 1991–2020',
  modelLoading: 'Die Schneefelder des Modells werden geladen …',
  noSpread: 'Dieser Lauf trägt noch keine Spanne für Neuschnee und Böe.',
  badFields: 'Die Schneefelder dieses Laufs bestehen die Prüfung nicht.',
  neighbour: 'Neuschnee, Böe und Schneefallgrenze zeigt der Steckbrief hier nicht: dieser kleine Gletscher rechnet mit dem Antrieb eines Nachbarn, übertragen wird nur die Temperatur.',
  noHourly: 'Die Stundenwerte dieser Region sind nicht ladbar.',
  slMeaning: 'Darüber fällt Niederschlag laut Modell als Schnee.',
  slGaps: 'Lücken in der Linie: dort nennt buscosun Fusion keine Schneefallgrenze; nichts ist aufgefüllt.',
  spread: 'Spanne = 8 von 10 Szenarien je Tag. Für mehrere Tage zusammen gibt es keine Spanne. Der erwartete Wert kann außerhalb liegen (ein Tag, der in den meisten Szenarien trocken bleibt).',
  unit: 'Neuschnee als Wasserwert in mm, ohne Umrechnung in cm: die Dichte frischen Schnees ist nicht bekannt.',
  ladder: 'Nach Höhe geordnet, nicht maßstäblich.',
});

// --- days --------------------------------------------------------------------------------------------------------------

const ymd = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
/** The `n` days ending with `last` (`yyyymmdd`), oldest first. */
export const snowViewDays = (last: string, n = SNOW_VIEW_DAYS): string[] => Array.from({ length: n }, (_, i) => ymd(snowDayMs(last) - (n - 1 - i) * DAY));
/** `20261121` → `21.11.` */
export const snowDayShort = (day: string): string => `${Number(day.slice(6, 8))}.${Number(day.slice(4, 6))}.`;
export const snowDayLong = (day: string): string => `${snowDayShort(day)}${day.slice(0, 4)}`;

// --- place and cells in words --------------------------------------------------------------------------------------------

/** The place 0–100 of the snow depth among the winters 1991–2020 in words — descriptive bands of the stored percentiles, no judgement. */
export function snowPlaceWords(place: number | null, flag: -1 | 0 | 1): string {
  if (flag === -1) return 'weniger Schnee als an diesem Kalendertag in jedem Winter 1991–2020';
  if (flag === 1) return 'mehr Schnee als an diesem Kalendertag in jedem Winter 1991–2020';
  if (place == null) return SNOW_VIEW_TEXT.noPlace;
  if (place < 10) return 'weniger als in 9 von 10 Wintern 1991–2020 an diesem Kalendertag';
  if (place < 25) return 'weniger als in 3 von 4 Wintern 1991–2020 an diesem Kalendertag';
  if (place <= 75) return 'in der mittleren Hälfte der Winter 1991–2020 an diesem Kalendertag';
  if (place <= 90) return 'mehr als in 3 von 4 Wintern 1991–2020 an diesem Kalendertag';
  return 'mehr als in 9 von 10 Wintern 1991–2020 an diesem Kalendertag';
}

/** Where the one value comes from, in words, and with how many other glaciers it shares a cell. */
export function snowCellsWords(cells: SnowCellsDoc | null, id: string): { text: string; shared: number | null } {
  const e = cells?.glaciers[id];
  if (!cells || !e) return { text: SNOW_VIEW_TEXT.cellsUnreadable, shared: null };
  const mine = new Set(e.cells.map((c) => c.join()));
  let shared = 0;
  for (const [other, oe] of Object.entries(cells.glaciers)) if (other !== id && oe.cells.some((c) => mine.has(c.join()))) shared++;
  const n = e.cells.length;
  const text = e.how === 'outline'
    ? (n === 1 ? 'Wert der einen Gitterzelle von 1 km², deren Mittelpunkt im Umriss liegt' : `Mittel aus ${n} Gitterzellen von 1 km², deren Mittelpunkt im Umriss liegt`)
    : `nächste Zelle: kein Zellmittelpunkt liegt im Umriss, der Wert gehört zur nächsten Gitterzelle von 1 km² (Mittelpunkt ${fmt1(e.km ?? 0)} km vom Punkt des Gletschers)`;
  return { text, shared };
}
export const snowSharedWords = (shared: number | null): string | null =>
  !shared ? null : `Dieselbe Zelle fließt auch in den Wert von ${shared === 1 ? 'einem weiteren Gletscher' : `${shared} weiteren Gletschern`} ein.`;

// --- the analysis block ----------------------------------------------------------------------------------------------------

export type SnowDayState = SnowDayDoc | 'absent' | null | undefined;
export interface SnowWeekDay { day: string; hs: number | null; swe: number | null; why: string | null }
export type SnowAnalysisView =
  | { kind: 'outside'; text: string }
  | { kind: 'loading'; text: string }
  | { kind: 'nodata'; why: string }
  | {
    kind: 'ok'; origin: typeof SNOW_ORIGIN; day: string; hs: number; swe: number; place: number | null; flag: -1 | 0 | 1; placeText: string;
    cellsText: string; sharedText: string | null; week: SnowWeekDay[]; change: { cm: number; from: string } | null; source: typeof GLACIER_SNOW_SOURCE;
  };

const whyOf = (doc: SnowDayState, id: string): string | null => {
  if (doc === undefined) return 'wird geladen';
  if (doc === 'absent') return SNOW_VIEW_TEXT.absent;
  if (doc === null) return SNOW_VIEW_TEXT.unreadable;
  if (doc.glaciers[id]) return null;
  const m = doc.missing.find((x) => x[0] === id);
  return m ? SNOW_MISSING_TEXT[m[1]] : SNOW_VIEW_TEXT.noEntry;
};

/**
 * What the analysis block shows for glacier `g`: `days` holds the loaded day documents by `yyyymmdd` (`undefined` = still loading,
 * `'absent'` = not published, `null` = unreadable or violating), `cells` the cells file (`undefined` = loading).
 */
export function snowAnalysisView(input: {
  g: { id: string; country: string }; pointer: GlacierSnowPointer | null | undefined; days: ReadonlyMap<string, SnowDayState>; cells: SnowCellsDoc | null | undefined; nowMs: number;
}): SnowAnalysisView {
  const { g, pointer, days, cells, nowMs } = input;
  if (g.country !== 'AT') return { kind: 'outside', text: SNOW_VIEW_TEXT.outside };
  if (!pointer) return { kind: 'nodata', why: SNOW_VIEW_TEXT.noPointer };
  const ageDays = (nowMs - snowDayMs(pointer.day)) / DAY;
  if (!(ageDays <= SNOW_VIEW_MAX_AGE_DAYS)) return { kind: 'nodata', why: `Die letzte Schneeanalyse ist vom ${snowDayLong(pointer.day)}; älter als ${SNOW_VIEW_MAX_AGE_DAYS} Tage zeigt der Steckbrief sie nicht.` };
  const doc = days.get(pointer.day);
  if (doc === undefined) return { kind: 'loading', text: SNOW_VIEW_TEXT.loading };
  const why = whyOf(doc, g.id), on = `Die Schneeanalyse vom ${snowDayLong(pointer.day)}`;
  if (why) {
    return { kind: 'nodata', why: doc === 'absent' || doc === null ? `${on} ist ${why}.` : why === SNOW_VIEW_TEXT.noEntry ? `${on} hat für diesen Gletscher keinen Eintrag.` : `${on} hat für diesen Gletscher keinen Wert: ${why}.` };
  }
  const row = (doc as SnowDayDoc).glaciers[g.id];
  const week = snowViewDays(pointer.day).map((d): SnowWeekDay => {
    const x = days.get(d), w = whyOf(x, g.id);
    if (w) return { day: d, hs: null, swe: null, why: w };
    const r = (x as SnowDayDoc).glaciers[g.id];
    return { day: d, hs: r[0], swe: r[1], why: null };
  });
  const first = week.find((w) => w.hs != null && w.day !== pointer.day);
  const c = cells === undefined ? { text: 'Die Zellen der Analyse werden geladen …', shared: null } : snowCellsWords(cells, g.id);
  return {
    kind: 'ok', origin: SNOW_ORIGIN, day: pointer.day, hs: row[0], swe: row[1], place: row[2], flag: row[3], placeText: snowPlaceWords(row[2], row[3]),
    cellsText: c.text, sharedText: snowSharedWords(c.shared), week, change: first ? { cm: row[0] - first.hs!, from: first.day } : null, source: GLACIER_SNOW_SOURCE,
  };
}

// --- the model block ---------------------------------------------------------------------------------------------------------

export interface SnowModelDay {
  d: number; startMs: number;
  /** Expected new snow (mm water equivalent) and its p10–p90 of THIS day at tongue, median elevation and top. */
  sn: [number, number, number];
  snq: [[number, number], [number, number], [number, number]];
  /** Strongest gust of the day (km/h) and the p10–p90 of that hour. */
  gx: number; gq: [number, number];
}
export interface SnowLine {
  /** First hour shown (from the run hour) and the values from there up to +120 h; `null` where buscosun Fusion gives none. */
  from: number; values: Array<number | null>;
  now: number | null; next24: [number, number] | null;
  /** Last hour from the run hour with a value; `null` without any. */
  last: number | null;
}
export type SnowModelView =
  | { kind: 'nodata'; why: string }
  | {
    kind: 'ok'; row: GlacierWeatherRow; t0Ms: number; hour: number; runAt: string; engine: string;
    z: [number, number, number]; days: SnowModelDay[]; sum: [number, number, number]; sl: SnowLine | null; slWhy: string | null;
  };

/** The problems of the snow fields that concern glacier `id` (or the whole document). */
const ownProblems = (ps: string[], id: string) => ps.filter((p) => !/^[^:]+: /.test(p) || p.startsWith(`${id}: `));

/**
 * What the model block shows for glacier `id`: `daily` / `hourly` as the weather card loads them (`undefined` = loading, `null` = not
 * loadable). The days start at the block of "now" and run as far as the snowfall line (5 days); spreads stay per day.
 */
export function snowModelView(daily: GlacierWeatherDoc | null | undefined, hourly: GlacierWeatherHourlyDoc | null | undefined, id: string, nowMs: number): SnowModelView {
  if (daily === undefined) return { kind: 'nodata', why: SNOW_VIEW_TEXT.modelLoading };
  const v = weatherView(daily, id, nowMs);
  if ('why' in v) return { kind: 'nodata', why: v.why };
  const { row, t0Ms, hour, day } = v;
  if (row.f !== 'own') return { kind: 'nodata', why: SNOW_VIEW_TEXT.neighbour };
  if (!daily!.rules.spread || !row.snq || !row.gq || !row.sn || !row.gx) return { kind: 'nodata', why: SNOW_VIEW_TEXT.noSpread };
  if (ownProblems(weatherSnowProblems(daily!), id).length) return { kind: 'nodata', why: SNOW_VIEW_TEXT.badFields };
  const days: SnowModelDay[] = [];
  for (let d = day; d < Math.min(GLACIER_WEATHER_DAYS, day + SNOW_MODEL_DAYS); d++) {
    days.push({
      d, startMs: t0Ms + d * 24 * H,
      sn: [row.sn[0][d], row.sn[1][d], row.sn[2][d]],
      snq: [row.snq[0][d], row.snq[1][d], row.snq[2][d]],
      gx: row.gx[d], gq: row.gq[d],
    });
  }
  // only the expected values add up; the spread of a sum of days is not known
  const sum = [0, 1, 2].map((lv) => Math.round(days.reduce((s, x) => s + x.sn[lv], 0) * 10) / 10) as [number, number, number];
  let sl: SnowLine | null = null, slWhy: string | null = null;
  const hr = hourly ? hourly.glaciers[id] : undefined;
  if (hourly === undefined) slWhy = 'Die Stundenwerte werden geladen …';
  else if (!hourly) slWhy = SNOW_VIEW_TEXT.noHourly;
  else if (!hr?.sl) slWhy = 'Dieser Lauf trägt noch keine Schneefallgrenze je Stunde.';
  else if (ownProblems(weatherHourlySnowProblems(hourly, daily!), id).length) slWhy = SNOW_VIEW_TEXT.badFields;
  else {
    const from = Math.max(0, Math.min(GLACIER_WEATHER_SNOWLINE_HOURS - 1, hour));
    const values = hr.sl.slice(from);
    const n24 = values.slice(0, 25).filter((x): x is number => x != null);
    let last: number | null = null;
    hr.sl.forEach((x, i) => { if (x != null) last = i; });
    sl = { from, values, now: values[0] ?? null, next24: n24.length ? [Math.min(...n24), Math.max(...n24)] : null, last };
  }
  return { kind: 'ok', row, t0Ms, hour, runAt: daily!.runAt, engine: daily!.engine.name, z: row.z, days, sum, sl, slWhy };
}

// --- the ladder ----------------------------------------------------------------------------------------------------------------

export type LadderRung =
  | { kind: 'ice'; z: number; level: 0 | 1 | 2; name: string }
  | { kind: 'sl'; z: number }
  | { kind: 'stn'; z: number; id: string; n: number };
export const LADDER_LEVEL_NAME = ['Zunge', 'Mittlere Höhe', 'Oberkante'] as const;

/**
 * The rungs from the top down: the three model elevations, the snowfall line of "now" at its elevation (if there is one) and every
 * station at its elevation (numbered as in the map list). Ties keep this order: ice, snowfall line, station.
 */
export function ladderRungs(z: readonly [number, number, number], slNow: number | null, stations: ReadonlyArray<{ id: string; elev: number }>): LadderRung[] {
  const r: Array<LadderRung & { o: number }> = [
    ...([2, 1, 0] as const).map((lv, i) => ({ kind: 'ice' as const, z: z[lv], level: lv, name: LADDER_LEVEL_NAME[lv], o: i })),
    ...(slNow != null ? [{ kind: 'sl' as const, z: slNow, o: 3 }] : []),
    ...stations.map((s, i) => ({ kind: 'stn' as const, z: s.elev, id: s.id, n: i + 1, o: 4 + i })),
  ];
  return r.sort((a, b) => b.z - a.z || a.o - b.o).map(({ o: _o, ...x }) => x as LadderRung);
}

/** Whether an elevation lies on the ice (catalogue range of the glacier). */
export const onIce = (zz: number, range: readonly [number, number, number]): boolean => zz >= range[0] && zz <= range[2];

/** Short texts for the screen reader and the verifier. */
export const mm = (v: number): string => `${fmt1(v)} mm`;
export const spreadText = (q: readonly [number, number], unit: string): string => `in 8 von 10 Szenarien ${unit === 'km/h' ? fmt0(q[0]) : fmt1(q[0])}–${unit === 'km/h' ? fmt0(q[1]) : fmt1(q[1])} ${unit}`;
