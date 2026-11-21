/**
 * Phase GW — contract of "Wetter am Gletscher": the weather at a glacier from the SAME answer of buscosun Fusion the melt run
 * already computes (`scripts/glacier/melt.mjs`). DOM-free and import-light: producer, verifier and page share it.
 *
 * Two kinds of documents per melt run (run = `yyyymmddhh` UTC of the run hour, as in the melt contract):
 *   melt/wx/<run>.json            daily values, 14 days, all glaciers                         (`GlacierWeatherDoc`)
 *   melt/wx/<run>/<region>.json   hourly values, first 48 h, the glaciers of one region        (`GlacierWeatherHourlyDoc`)
 * They live below `melt/` because the melt line of the publisher may write that prefix only; the melt documents themselves
 * (`melt/<run>.json`, schema 1) are untouched.
 *
 * Honesty rules encoded here:
 *  - origin is `model`, never `measured`; the document names the stand of buscosun Fusion it was built with, read from the
 *    answer (`engine`), and says that the values are NOT verified at high elevation (`verified.highElevation === false`);
 *  - a sum (precipitation, new snow) is the expected value only (`rules.sums === 'expected'`): no spread built from hourly
 *    quantiles, and the scenario code of the melt run varies the temperature only, so it gives no honest spread of a sum;
 *  - a glacier that runs on a neighbour's forcing (small class C glaciers) gets the temperature at its own elevations and
 *    NOTHING else: wind, precipitation, new snow and clouds are absent and `omit` names why;
 *  - new snow is water equivalent in millimetres, never centimetres (that would need a set density);
 *  - wind is the wind of the free height at the median elevation, not the wind on the glacier surface.
 *
 * Day d of a run = the hours 24 d … 24 d + 23 from the run hour (the same day cut as the melt index).
 * Units and steps: temperature °C in 0.1, wind and gusts km/h whole, direction degrees whole (blowing FROM), precipitation
 * and new snow mm in 0.1, cloud cover and snow share % whole, snowfall line m in steps of 10.
 */
export const GLACIER_WEATHER_DAYS = 14;
export const GLACIER_WEATHER_HOURS = 48;
export const GLACIER_WEATHER_RUN_RE = /^\d{10}$/;
export const glacierWeatherRunPath = (run: string) => `melt/wx/${run}.json`;
export const glacierWeatherHourlyPath = (run: string, region: string) => `melt/wx/${run}/${region}.json`;
/** The three elevations of a row: tongue (lowest band), median elevation, top (highest band). */
export const GLACIER_WEATHER_LEVELS = Object.freeze(['tongue', 'median', 'top'] as const);
/** Share of the hours of the 14 days a glacier needs for wind, gusts, precipitation and clouds; below it the glacier is skipped with a reason. */
export const GLACIER_WEATHER_MIN_SHARE = 0.8;
/** Hours with a direction a day needs for a prevailing direction (`set`); below it the day has none. */
export const GLACIER_WEATHER_DIR_MIN_HOURS = 6;
/** Values of the snowfall line a day needs (`set`; buscosun Fusion gives the line hourly in the first two days, three-hourly up to day 5, then none). */
export const GLACIER_WEATHER_SNOWLINE_MIN = 6;
/** The page shows a document up to this age of its run (ms); the run comes at most every 6 h. */
export const GLACIER_WEATHER_FRESH_MS = 18 * 3_600_000;
/** Reason a row carries the temperature only. */
export const GLACIER_WEATHER_OMIT_NEIGHBOUR = 'neighbour-forcing';
export const GLACIER_WEATHER_NOTE = 'Modell, im Hochgebirge noch nicht nachgemessen';
export const GLACIER_WEATHER_WIND_NOTE = 'freie Höhe, nicht die Gletscherfläche';

/** One series per elevation: [tongue, median, top]. */
export type ByLevel<T> = [T, T, T];

export interface GlacierWeatherRow {
  id: string;
  /** Elevations (m) of the three levels: mid of the lowest band, median elevation of the catalog, mid of the highest band. */
  z: [number, number, number];
  /** Forcing: own Fusion point at the median elevation (`own`) or the neighbour's id. */
  f: 'own' | string;
  /** Daily minimum and maximum of the temperature (°C) at the three elevations, 14 days. */
  tn: ByLevel<number[]>;
  tx: ByLevel<number[]>;
  /** Own forcing only: [lowest hourly p10, highest hourly p90] of the day at the median elevation — single-hour spreads, never the spread of a sum. */
  tq?: [number, number][];
  /** Own forcing only — mean wind and strongest gust (km/h), prevailing direction (degrees, `null` without enough hours). */
  w?: number[];
  gx?: number[];
  wd?: (number | null)[];
  /** Own forcing only — precipitation sum (mm) and new snow as water equivalent (mm) at the three elevations: expected values. */
  p?: number[];
  sn?: ByLevel<number[]>;
  /** Own forcing only — mean cloud cover (%). */
  c?: number[];
  /** Own forcing only — daily mean of the snowfall line (m), `null` where buscosun Fusion gives none. */
  sl?: (number | null)[];
  /** Why wind, precipitation, new snow and clouds are absent (`neighbour-forcing`); absent on a complete row. */
  omit?: typeof GLACIER_WEATHER_OMIT_NEIGHBOUR;
}

export interface GlacierWeatherEngine { name: string; version: number; stageCurrent: boolean }

interface WeatherHead {
  schema: 1;
  run: string;
  runAt: string;
  origin: 'model';
  /** Stand of buscosun Fusion the answer was computed with (read from the answer, not from the code). */
  engine: GlacierWeatherEngine;
  verified: { highElevation: false; note: string };
}

export interface GlacierWeatherDoc extends WeatherHead {
  kind: 'glacier/weather';
  cube: { t1: string | null; t2: string | null; t3: string | null; stations: string | null };
  days: number;
  hours: number;
  rules: {
    /** Solid share of the precipitation: clip((warm − T) / (warm − cold), 0, 1) with the band temperature — the rule of the melt core. */
    phase: { warm: number; cold: number; origin: 'set' };
    lapse: 'freezing-level';
    sums: 'expected';
    day: 'from-run-hour';
    wind: 'free-height';
  };
  /** Regions with an hourly chunk (`glacierWeatherHourlyPath`). */
  regions: string[];
  build: string;
  glaciers: GlacierWeatherRow[];
  skipped: { id: string; reason: string }[];
}

export interface GlacierWeatherHourlyRow {
  /** Temperature (°C) at the three elevations, 48 h from the run hour. */
  t: ByLevel<number[]>;
  /** Own forcing only: wind and gust (km/h), direction (degrees or `null`), precipitation (mm/h), snow share of it at the median elevation (%), cloud cover (%). */
  w?: number[];
  g?: number[];
  d?: (number | null)[];
  p?: number[];
  s?: number[];
  c?: number[];
}

export interface GlacierWeatherHourlyDoc extends WeatherHead {
  kind: 'glacier/weather-hourly';
  region: string;
  hours: number;
  glaciers: Record<string, GlacierWeatherHourlyRow>;
}

export interface GlacierWeatherPointer { run: string; runAt: string; engine: { name: string; version: number }; build: string; regions: string[] }

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const stepOk = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
const series = (a: unknown, n: number, ok: (v: number) => boolean, nullable = false): boolean =>
  Array.isArray(a) && a.length === n && a.every((v) => (v === null ? nullable : fin(v) && ok(v)));
const levels = (a: unknown, n: number, ok: (v: number) => boolean): boolean => Array.isArray(a) && a.length === 3 && a.every((x) => series(x, n, ok));

const T_OK = (v: number) => v >= -70 && v <= 45 && stepOk(v, 0.1);
const KMH_OK = (v: number) => v >= 0 && v <= 400 && Number.isInteger(v);
const DEG_OK = (v: number) => v >= 0 && v < 360 && Number.isInteger(v);
const MM_OK = (v: number) => v >= 0 && v <= 2000 && stepOk(v, 0.1);
const PCT_OK = (v: number) => v >= 0 && v <= 100 && Number.isInteger(v);
const M_OK = (v: number) => v >= 0 && v <= 7000 && stepOk(v, 10);

function headProblems(d: WeatherHead | null | undefined): string[] {
  const p: string[] = [];
  if (!d || !GLACIER_WEATHER_RUN_RE.test(d.run)) p.push(`Lauf ${d?.run}`);
  if (d?.origin !== 'model') p.push(`Herkunft ${d?.origin}`);
  if (!d?.engine || typeof d.engine.name !== 'string' || !d.engine.name || !Number.isInteger(d.engine.version)) p.push('Stand von buscosun Fusion fehlt');
  else if (!d.engine.name.endsWith(` ${d.engine.version}`)) p.push(`Name ${d.engine.name} passt nicht zum Stand ${d.engine.version}`);
  if (d?.verified?.highElevation !== false || !d.verified.note) p.push('Vermerk „im Hochgebirge nicht nachgemessen" fehlt');
  if (!Number.isFinite(Date.parse(d?.runAt ?? ''))) p.push('Laufzeit');
  return p;
}

/** Rules of the daily document; empty = valid. */
export function weatherProblems(doc: GlacierWeatherDoc, catalogIds?: ReadonlySet<string>): string[] {
  if (doc?.kind !== 'glacier/weather' || doc.schema !== 1) return ['kind/schema'];
  const p = headProblems(doc);
  const n = GLACIER_WEATHER_DAYS;
  if (doc.days !== n || doc.hours !== GLACIER_WEATHER_HOURS) p.push(`Tage/Stunden ${doc.days}/${doc.hours}`);
  if (doc.rules?.sums !== 'expected') p.push('Summen nicht als Erwartungswert');
  if (doc.rules?.lapse !== 'freezing-level' || doc.rules?.day !== 'from-run-hour' || doc.rules?.wind !== 'free-height') p.push('Regeln');
  if (!(fin(doc.rules?.phase?.warm) && fin(doc.rules?.phase?.cold) && doc.rules.phase.warm > doc.rules.phase.cold)) p.push('Phasenregel');
  if (!Array.isArray(doc.regions)) p.push('Regionen');
  const seen = new Set<string>();
  for (const r of doc.glaciers ?? []) {
    const id = r?.id;
    if (seen.has(id)) p.push(`${id}: doppelt`);
    seen.add(id);
    if (catalogIds && !catalogIds.has(id)) p.push(`${id}: nicht im Katalog`);
    if (!Array.isArray(r.z) || r.z.length !== 3 || !r.z.every(fin) || !(r.z[0] <= r.z[1] + 25 && r.z[1] <= r.z[2] + 25)) p.push(`${id}: Höhen`);
    if (!levels(r.tn, n, T_OK) || !levels(r.tx, n, T_OK)) { p.push(`${id}: Temperatur`); continue; }
    if (r.tn.some((lv, i) => lv.some((v, d) => v > r.tx[i][d]))) p.push(`${id}: Minimum über Maximum`);
    const own = r.f === 'own';
    const wx = ['w', 'gx', 'wd', 'p', 'sn', 'c', 'sl', 'tq'] as const;
    if (!own) {
      if (typeof r.f !== 'string' || !r.f) p.push(`${id}: Antrieb`);
      if (r.omit !== GLACIER_WEATHER_OMIT_NEIGHBOUR) p.push(`${id}: fremder Antrieb ohne benannten Grund`);
      for (const k of wx) if (r[k] !== undefined) p.push(`${id}: ${k} trotz fremdem Antrieb`);
      continue;
    }
    if (r.omit !== undefined) p.push(`${id}: eigener Antrieb mit Auslassung`);
    if (!Array.isArray(r.tq) || r.tq.length !== n || !r.tq.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => fin(v) && T_OK(v)) && q[0] <= q[1])) p.push(`${id}: Spanne der Temperatur`);
    else if (r.tq.some((q, d) => q[0] > r.tn[1][d] + 1e-9 || q[1] < r.tx[1][d] - 1e-9)) p.push(`${id}: Spanne schließt Minimum/Maximum nicht ein`);
    if (!series(r.w, n, KMH_OK) || !series(r.gx, n, KMH_OK)) p.push(`${id}: Wind`);
    else if (r.w!.some((v, d) => v > r.gx![d] + 1)) p.push(`${id}: Mittelwind über der stärksten Böe`);
    if (!series(r.wd, n, DEG_OK, true)) p.push(`${id}: Windrichtung`);
    if (!series(r.p, n, MM_OK)) p.push(`${id}: Niederschlag`);
    if (!levels(r.sn, n, MM_OK)) p.push(`${id}: Neuschnee`);
    else if (series(r.p, n, MM_OK) && r.sn!.some((lv) => lv.some((v, d) => v > r.p![d] + 0.15))) p.push(`${id}: Neuschnee über dem Niederschlag`);
    else if (r.sn![0].some((v, d) => v > r.sn![2][d] + 0.15)) p.push(`${id}: mehr Neuschnee an der Zunge als oben`);
    if (!series(r.c, n, PCT_OK)) p.push(`${id}: Bewölkung`);
    if (!series(r.sl, n, M_OK, true)) p.push(`${id}: Schneefallgrenze`);
  }
  for (const s of doc.skipped ?? []) if (!s.reason) p.push(`${s.id}: übersprungen ohne Grund`);
  return p;
}

/** Rules of an hourly chunk; `daily` = the daily document of the same run (the chunk must belong to it). */
export function weatherHourlyProblems(doc: GlacierWeatherHourlyDoc, daily?: GlacierWeatherDoc): string[] {
  if (doc?.kind !== 'glacier/weather-hourly' || doc.schema !== 1) return ['kind/schema'];
  const p = headProblems(doc);
  const n = GLACIER_WEATHER_HOURS;
  if (doc.hours !== n) p.push(`Stunden ${doc.hours}`);
  if (typeof doc.region !== 'string' || !doc.region) p.push('Region');
  if (daily) {
    if (daily.run !== doc.run) p.push(`Lauf ${doc.run} gehört nicht zum Tagesdokument ${daily.run}`);
    if (daily.engine.version !== doc.engine?.version) p.push('anderer Stand als das Tagesdokument');
    if (!daily.regions.includes(doc.region)) p.push(`Region ${doc.region} nicht im Tagesdokument`);
  }
  const rows = daily ? new Map(daily.glaciers.map((r) => [r.id, r])) : null;
  for (const [id, r] of Object.entries(doc.glaciers ?? {})) {
    if (!levels(r.t, n, T_OK)) { p.push(`${id}: Temperatur`); continue; }
    const own = rows ? rows.get(id)?.f === 'own' : r.w !== undefined;
    if (rows && !rows.has(id)) p.push(`${id}: ohne Zeile im Tagesdokument`);
    const wx = ['w', 'g', 'd', 'p', 's', 'c'] as const;
    if (!own) { for (const k of wx) if (r[k] !== undefined) p.push(`${id}: ${k} trotz fremdem Antrieb`); continue; }
    if (!series(r.w, n, KMH_OK) || !series(r.g, n, KMH_OK)) p.push(`${id}: Wind`);
    if (!series(r.d, n, DEG_OK, true)) p.push(`${id}: Windrichtung`);
    if (!series(r.p, n, MM_OK)) p.push(`${id}: Niederschlag`);
    if (!series(r.s, n, PCT_OK)) p.push(`${id}: Schneeanteil`);
    if (!series(r.c, n, PCT_OK)) p.push(`${id}: Bewölkung`);
  }
  return p;
}

/** Is a run fresh enough to be shown? */
export const glacierWeatherFresh = (runAtMs: number, nowMs: number): boolean => Number.isFinite(runAtMs) && nowMs - runAtMs >= -3_600_000 && nowMs - runAtMs <= GLACIER_WEATHER_FRESH_MS;
