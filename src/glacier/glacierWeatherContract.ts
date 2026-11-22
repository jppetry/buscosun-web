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
 *  - a sum (precipitation, new snow) is the expected value (`rules.sums === 'expected'`, the fields `p` and `sn`). Phase GS adds a
 *    spread NEXT to it (`pq`, `snq`, rule `rules.spread`): the p10/p90 of the sums of K scenarios drawn from the hourly distributions
 *    of the answer with an hourly correlation (`set`) — never a sum of hourly quantiles. The expected value may lie outside the spread
 *    (a day that is dry in nine of ten scenarios). The spread of the gust (`gq`) is the p10/p90 of the ONE hour with the strongest gust;
 *  - a glacier that runs on a neighbour's forcing (small class C glaciers) gets the temperature at its own elevations and
 *    NOTHING else: wind, precipitation, new snow and clouds are absent and `omit` names why;
 *  - new snow is water equivalent in millimetres, never centimetres (that would need a set density);
 *  - the solid share of the precipitation follows the rule the document names (`rules.phase.rule`): `temperature` = the ramp of the melt
 *    core, `psnow` = the `pSnow` of buscosun Fusion at the median elevation, moved to tongue and top by the engine's own phase function;
 *    a document without `rules.phase.rule` (before phase GS) was built with `temperature`;
 *  - the snowfall line per hour (`sl` of the hourly chunk) is the value of the answer or `null` — it is never filled between two values;
 *  - phase GM (`rules.levels`, producer switch `--heights=three`): tongue and top get their OWN answer of buscosun Fusion instead of the
 *    lapse from the median elevation, the solid share is the rule of the run at each of the three answers, and next to the snowfall line
 *    of the answer (`sl`, unchanged) stands the OWN line `slo`: the elevation at which that share is one half, stated only inside the
 *    glacier's range plus `rules.levels.reach` metres; outside it `slo` is `null` and `slk` says on which side. A document without
 *    `rules.levels` is built from ONE answer as before;
 *  - wind is the wind of the free height at the median elevation, not the wind on the glacier surface.
 *
 * Day d of a run = the hours 24 d … 24 d + 23 from the run hour (the same day cut as the melt index).
 * Units and steps: temperature °C in 0.1, wind and gusts km/h whole, direction degrees whole (blowing FROM), precipitation
 * and new snow mm in 0.1 (new snow per hour in 0.01), cloud cover and snow share % whole, snowfall line m in steps of 10.
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
/** Phase GS — hours from the run hour the hourly chunk carries the snowfall line for (buscosun Fusion gives none after day 5). */
export const GLACIER_WEATHER_SNOWLINE_HOURS = 120;
/** Phase GS — rules of the solid share a document can be built with; the producer switch `--phase` / `GLACIER_WEATHER_PHASE` picks one. */
export const GLACIER_WEATHER_PHASE_RULES = Object.freeze(['temperature', 'psnow'] as const);
export type GlacierWeatherPhaseRule = (typeof GLACIER_WEATHER_PHASE_RULES)[number];
/** Phase GS — scenarios of the spread of a sum and their hourly correlation (both `set`, not measured). */
export const GLACIER_WEATHER_SPREAD_K = 100;
export const GLACIER_WEATHER_SPREAD_RHO = 0.9;
/** Phase GS — comparison of the two phase rules, one entry per run, kept for `GLACIER_WEATHER_PHASE_KEEP_DAYS` days. */
export const GLACIER_WEATHER_PHASE_PATH = 'melt/wx/phase.json';
export const GLACIER_WEATHER_PHASE_KEEP_DAYS = 21;
/** Days with a run the comparison needs before the rule may be switched, and the largest shift of the summed new snow at any elevation (frozen in audit/gletscher-schneefelder.md §1.4). */
export const GLACIER_WEATHER_PHASE_MIN_DAYS = 7;
export const GLACIER_WEATHER_PHASE_LIMIT = 0.1;
/** Phase GM — where the values at tongue and top come from; the producer switch `--heights` / `GLACIER_WEATHER_HEIGHTS` picks one (`median` = one answer and the lapse, as before). */
export const GLACIER_WEATHER_HEIGHT_MODES = Object.freeze(['median', 'three'] as const);
export type GlacierWeatherHeightMode = (typeof GLACIER_WEATHER_HEIGHT_MODES)[number];
/** Phase GM — metres below the tongue and above the top the own snowfall line is still stated (`set`): beyond it the three answers say nothing about the height. */
export const GLACIER_WEATHER_LINE_REACH_M = 500;
/**
 * Phase GM — kind of a value of the own snowfall line `slo` under `rules.levels`, one digit per hour (`slk` of the hourly row) or per day (`slk` of the daily row):
 * 0 no statement · 1 inside the glacier's range · 2 below the tongue, within the reach · 3 below the reach (`slo` is `null`) ·
 * 4 above the top, within the reach · 5 above the reach (`slo` is `null`).
 */
export const GLACIER_WEATHER_LINE_KINDS = '012345';
/** Phase GM — hours with a kind a day needs for its line (`set`); the daily value is the MEDIAN hour in the order below < value < above, never a mean over a clipped range. */
export const GLACIER_WEATHER_LINE_DAY_MIN = 18;
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
  /** Phase GS, own forcing only — [p10, p90] of the precipitation sum of the day (mm) and of the new snow at the three elevations: quantiles of scenario sums (`rules.spread`). */
  pq?: [number, number][];
  snq?: ByLevel<[number, number][]>;
  /** Phase GS, own forcing only — [p10, p90] (km/h) of the hour with the strongest gust of the day: a single-hour spread. */
  gq?: [number, number][];
  /** Phase GM, own forcing under `rules.levels` only — the own snowfall line of the day (m in steps of 10; the median hour) and its kind, one digit per day (`GLACIER_WEATHER_LINE_KINDS`). */
  slo?: (number | null)[];
  slk?: string;
  /** Phase GM, own forcing under `rules.levels` only — `lapse`: an answer at tongue or top was missing, this row is built from the median answer as before (no `slo`, no `slk`). */
  lv?: 'lapse';
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
    phase: { warm: number; cold: number; origin: 'set'; rule?: GlacierWeatherPhaseRule };
    /** Phase GS — how `pq`, `snq` and `gq` are built; absent on a document without them. */
    spread?: { sums: 'scenarios'; k: number; rho: number; gust: 'strongest-hour'; origin: 'set' };
    /**
     * Phase GM — present when tongue and top carry their own answer of buscosun Fusion (rows with own forcing and without `lv`): the temperature there
     * is that answer's, the solid share the rule of the run at each answer, never more below than above (`order`), and `slo` is the elevation at which
     * the share is one half, stated up to `reach` metres outside the glacier's range; the daily `slo` is the median hour. `lapse` below then names the
     * rule of the rows with a neighbour's forcing and of rows with `lv`.
     */
    levels?: { rule: 'answers'; snowline: 'half-share'; reach: number; order: 'not-more-below'; daily: 'median'; origin: 'set' };
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
  /** Phase GS, own forcing only — snowfall line (m) per hour for `GLACIER_WEATHER_SNOWLINE_HOURS` hours, `null` where buscosun Fusion gives none. */
  sl?: (number | null)[];
  /** Phase GS, own forcing only — new snow per hour as water equivalent (mm, 0.01) at the three elevations. */
  sn?: ByLevel<number[]>;
  /** Phase GM, own forcing under `rules.levels` only — the own snowfall line per hour (m in steps of 10 or `null`) for `GLACIER_WEATHER_SNOWLINE_HOURS` hours and the kind of each value, one digit per hour (`GLACIER_WEATHER_LINE_KINDS`). */
  slo?: (number | null)[];
  slk?: string;
}

/** Phase GS — one run of the comparison of the two phase rules: summed new snow (mm, all glaciers with own forcing, 14 days) per elevation. */
export interface GlacierWeatherPhaseRun {
  run: string;
  /** The rule the documents of this run were built with. */
  rule: GlacierWeatherPhaseRule;
  /** Phase GM — `three` when the run compared the two rules on three answers per glacier; absent = one answer (`median`). */
  heights?: GlacierWeatherHeightMode;
  n: number;
  mm: { temperature: [number, number, number]; psnow: [number, number, number] };
  /** Glacier-days with at least 1 mm precipitation; those of them whose new snow at the median elevation moves by more than 1 mm; the largest move of a day (mm). */
  wet: number;
  moved: number;
  max: number;
}
export interface GlacierWeatherPhaseDoc { schema: 1; kind: 'glacier/weather-phase'; limit: number; minDays: number; runs: GlacierWeatherPhaseRun[] }
export interface GlacierWeatherPhaseVerdict { runs: number; days: number; enough: boolean; shift: [number | null, number | null, number | null]; within: boolean; movedShare: number | null; max: number }

/** Verdict of the comparison: enough days, and the shift of the summed new snow per elevation within the limit. */
export function phaseVerdict(doc: GlacierWeatherPhaseDoc | null | undefined): GlacierWeatherPhaseVerdict {
  const runs = (doc?.runs ?? []).filter((r) => GLACIER_WEATHER_RUN_RE.test(r?.run ?? ''));
  const days = new Set(runs.map((r) => r.run.slice(0, 8))).size;
  const sum = (k: 'temperature' | 'psnow', lv: number) => runs.reduce((s, r) => s + r.mm[k][lv], 0);
  const shift = [0, 1, 2].map((lv) => (sum('temperature', lv) > 0 ? Math.round((1e4 * Math.abs(sum('psnow', lv) - sum('temperature', lv))) / sum('temperature', lv)) / 1e4 : null)) as GlacierWeatherPhaseVerdict['shift'];
  const wet = runs.reduce((s, r) => s + r.wet, 0);
  return {
    runs: runs.length, days, enough: days >= GLACIER_WEATHER_PHASE_MIN_DAYS, shift, within: shift.every((v) => v == null || v <= GLACIER_WEATHER_PHASE_LIMIT),
    movedShare: wet ? Math.round((1e4 * runs.reduce((s, r) => s + r.moved, 0)) / wet) / 1e4 : null, max: runs.reduce((m, r) => Math.max(m, r.max), 0),
  };
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
const MM2_OK = (v: number) => v >= 0 && v <= 500 && stepOk(v, 0.01);
/** A series of [p10, p90] pairs. */
const pairs = (a: unknown, n: number, ok: (v: number) => boolean): a is [number, number][] =>
  Array.isArray(a) && a.length === n && a.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => fin(v) && ok(v)) && q[0] <= q[1]);

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

/**
 * Phase GS — rules of the snow fields of the daily document (`rules.phase.rule`, `rules.spread`, `pq`, `snq`, `gq`); empty = valid.
 * Kept apart from `weatherProblems`, which the page calls and which is unchanged: the producer checks both, and a reader that uses
 * the snow fields has to call this one too. A document from before the phase (none of the fields) passes.
 */
export function weatherSnowProblems(doc: GlacierWeatherDoc): string[] {
  const p: string[] = [];
  const n = GLACIER_WEATHER_DAYS;
  if (doc.rules?.phase?.rule !== undefined && !GLACIER_WEATHER_PHASE_RULES.includes(doc.rules.phase.rule)) p.push(`Phasenregel ${doc.rules.phase.rule}`);
  const sp = doc.rules?.spread;
  if (sp !== undefined && !(sp?.sums === 'scenarios' && sp.gust === 'strongest-hour' && sp.origin === 'set' && Number.isInteger(sp.k) && sp.k >= 20 && fin(sp.rho) && sp.rho >= 0 && sp.rho < 1)) p.push('Regel der Spanne');
  for (const r of doc.glaciers ?? []) {
    const id = r?.id;
    const has = [r.pq, r.snq, r.gq].filter((x) => x !== undefined).length;
    if (r.f !== 'own') { if (has) p.push(`${id}: Spanne trotz fremdem Antrieb`); continue; }
    // all three with the rule, none without it
    if (has !== (sp ? 3 : 0)) { p.push(`${id}: Spanne ${sp ? 'fehlt' : 'ohne benannte Regel'}`); continue; }
    if (!sp) continue;
    if (!pairs(r.pq, n, MM_OK)) p.push(`${id}: Spanne des Niederschlags`);
    if (!(Array.isArray(r.snq) && r.snq.length === 3 && r.snq.every((lv) => pairs(lv, n, MM_OK)))) p.push(`${id}: Spanne des Neuschnees`);
    else if (pairs(r.pq, n, MM_OK) && r.snq.some((lv) => lv.some((q, d) => q[0] > r.pq![d][0] + 0.15 || q[1] > r.pq![d][1] + 0.15))) p.push(`${id}: Spanne des Neuschnees über der des Niederschlags`);
    else if (r.snq[0].some((q, d) => q[0] > r.snq![2][d][0] + 0.15 || q[1] > r.snq![2][d][1] + 0.15)) p.push(`${id}: Spanne an der Zunge über der oben`);
    if (!pairs(r.gq, n, KMH_OK)) p.push(`${id}: Spanne der Böe`);
    else if (series(r.gx, n, KMH_OK) && r.gq.some((q, d) => q[0] > r.gx![d] + 1 || q[1] < r.gx![d] - 1)) p.push(`${id}: Spanne schließt die stärkste Böe nicht ein`);
  }
  return p;
}

/** Phase GS — rules of the snow fields of an hourly chunk (`sl`, `sn`); `daily` = the daily document of the same run. Empty = valid; a chunk from before the phase passes. */
export function weatherHourlySnowProblems(doc: GlacierWeatherHourlyDoc, daily?: GlacierWeatherDoc): string[] {
  const p: string[] = [];
  const n = GLACIER_WEATHER_HOURS;
  const rows = daily ? new Map(daily.glaciers.map((r) => [r.id, r])) : null;
  for (const [id, r] of Object.entries(doc.glaciers ?? {})) {
    const own = rows ? rows.get(id)?.f === 'own' : r.w !== undefined;
    if (!own) { if (r.sl !== undefined || r.sn !== undefined) p.push(`${id}: Schneefelder trotz fremdem Antrieb`); continue; }
    if (r.sl !== undefined && !series(r.sl, GLACIER_WEATHER_SNOWLINE_HOURS, M_OK, true)) p.push(`${id}: Schneefallgrenze je Stunde`);
    if (r.sn !== undefined) {
      if (!levels(r.sn, n, MM2_OK)) p.push(`${id}: Neuschnee je Stunde`);
      else if (series(r.p, n, MM_OK) && r.sn.some((lv) => lv.some((v, h) => v > r.p![h] + 0.06))) p.push(`${id}: Neuschnee je Stunde über dem Niederschlag`);
      else if (r.sn[0].some((v, h) => v > r.sn![2][h] + 0.011)) p.push(`${id}: je Stunde mehr Neuschnee an der Zunge als oben`);
    }
  }
  return p;
}

/** Phase GM — does a line value fit its kind? `z` = the three elevations of the row. */
function lineKindOk(v: number | null, k: string, z: readonly number[], reach: number): boolean {
  if (k === '0' || k === '3' || k === '5') return v === null;
  if (v === null || !M_OK(v)) return false;
  if (k === '1') return v >= z[0] - 5 && v <= z[2] + 5;
  if (k === '2') return v <= z[0] + 5 && v >= z[0] - reach - 5;
  return k === '4' && v >= z[2] - 5 && v <= z[2] + reach + 5;
}

/**
 * Phase GM — rules of the fields of `rules.levels` in the daily document (`slo`, `slk`, `lv`); empty = valid. Kept apart from `weatherProblems`
 * (which the page calls and which is unchanged); a document without `rules.levels` must carry none of the fields.
 */
export function weatherLevelProblems(doc: GlacierWeatherDoc): string[] {
  const p: string[] = [];
  const n = GLACIER_WEATHER_DAYS, lv = doc.rules?.levels;
  if (lv !== undefined && !(lv?.rule === 'answers' && lv.snowline === 'half-share' && lv.order === 'not-more-below' && lv.daily === 'median' && lv.origin === 'set' && fin(lv.reach) && lv.reach > 0 && lv.reach <= 2000)) p.push('Regel der drei Höhen');
  for (const r of doc.glaciers ?? []) {
    const id = r?.id;
    if (r.f !== 'own' || !lv) { if (r.slo !== undefined || r.slk !== undefined || r.lv !== undefined) p.push(`${id}: Felder der drei Höhen ${lv ? 'trotz fremdem Antrieb' : 'ohne benannte Regel'}`); continue; }
    if (r.lv !== undefined) { if (r.lv !== 'lapse' || r.slk !== undefined || r.slo !== undefined) p.push(`${id}: Rückfall auf eine Antwort`); continue; }
    if (typeof r.slk !== 'string' || r.slk.length !== n || ![...r.slk].every((k) => GLACIER_WEATHER_LINE_KINDS.includes(k))) { p.push(`${id}: Art der Schneefallgrenze je Tag`); continue; }
    if (!Array.isArray(r.slo) || r.slo.length !== n || !Array.isArray(r.z)) { p.push(`${id}: eigene Schneefallgrenze je Tag fehlt`); continue; }
    if (r.slo.some((v, d) => !lineKindOk(v, r.slk![d], r.z, lv.reach))) p.push(`${id}: eigene Schneefallgrenze passt nicht zu ihrer Art`);
  }
  return p;
}

/** Phase GM — rules of `slo` and `slk` in an hourly chunk; `daily` = the daily document of the same run (it names the rule and the elevations). Empty = valid. */
export function weatherHourlyLevelProblems(doc: GlacierWeatherHourlyDoc, daily: GlacierWeatherDoc): string[] {
  const p: string[] = [];
  const n = GLACIER_WEATHER_SNOWLINE_HOURS, lv = daily.rules?.levels;
  const rows = new Map(daily.glaciers.map((r) => [r.id, r]));
  for (const [id, r] of Object.entries(doc.glaciers ?? {})) {
    const row = rows.get(id);
    const three = !!lv && row?.f === 'own' && row.lv === undefined;
    if (!three) { if (r.slk !== undefined || r.slo !== undefined) p.push(`${id}: eigene Schneefallgrenze ohne drei Antworten`); continue; }
    if (typeof r.slk !== 'string' || r.slk.length !== n || ![...r.slk].every((k) => GLACIER_WEATHER_LINE_KINDS.includes(k))) { p.push(`${id}: Art der Schneefallgrenze je Stunde`); continue; }
    if (!Array.isArray(r.slo) || r.slo.length !== n) { p.push(`${id}: eigene Schneefallgrenze je Stunde fehlt`); continue; }
    if (r.slo.some((v, h) => !lineKindOk(v, r.slk![h], row!.z, lv!.reach))) p.push(`${id}: eigene Schneefallgrenze je Stunde passt nicht zu ihrer Art`);
  }
  return p;
}

/** Is a run fresh enough to be shown? */
export const glacierWeatherFresh = (runAtMs: number, nowMs: number): boolean => Number.isFinite(runAtMs) && nowMs - runAtMs >= -3_600_000 && nowMs - runAtMs <= GLACIER_WEATHER_FRESH_MS;
