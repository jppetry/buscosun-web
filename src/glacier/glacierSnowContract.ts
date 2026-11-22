/**
 * Phase GN — contract of the snow analysis per Austrian glacier (`audit/gletscher-snowgrid.md`): snow depth and snow water
 * equivalent of "SNOWGRID Klima v2.1" (GeoSphere Austria, 1 km, daily since 1961, CC BY 4.0, DOI 10.60669/fsxx-6977) as a product
 * of its own inside the glacier store. DOM-free and import-light: producer (`scripts/glacier/snow.mjs`) and verifier share it.
 * DATA ONLY — no page imports this module yet; source note and licence row are prepared here for the later display.
 *
 *   glacier/v1/snow/<yyyymmdd>.json                     one day: value per Austrian glacier and its place among earlier winters
 *   glacier/v1/snow/static/cells/<build>.<n>.json       which grid cells belong to which glacier (built once per catalogue build)
 *   glacier/v1/snow/static/clim/<build>.<n>/<region>.json  per glacier and calendar day the spread of the reference years
 * and the pointer `index.snow` of `glacier/v1/index.json`.
 *
 * Honesty rules encoded here:
 *  - a grid value is an ANALYSIS, not a measurement (`SNOW_ORIGIN`): it stands for a cell of 1 km² with a model elevation of its
 *    own; the effective resolution of such grids is coarser than their mesh. Nothing here may ever be marked `measured`;
 *  - ONE value per glacier: the mean of the cells whose centre lies inside the outline, else the nearest cell with data — never
 *    three elevation points (92 % of the glaciers are smaller than one cell), and the document says how many cells and which way;
 *  - the value and its place in the spread come from the SAME cells (the cells file is fixed per catalogue build);
 *  - SNOWGRID covers Austria only: Swiss and German glaciers have no entry, and the document says why (`coverage`);
 *  - the place among earlier winters is a number, never a word; no judgement on conditions.
 * The raster itself is never stored. buscosun Fusion does not read this product, and it is not part of `obs/v1`.
 */
import { GLACIER_BUILD_RE } from './glacierContract';

// --- Paths ---------------------------------------------------------------------------------------------------------------------------------

export const GLACIER_SNOW_DIR = 'snow';
export const GLACIER_SNOW_DAY_RE = /^\d{8}$/;
export const glacierSnowDayPath = (day: string) => `${GLACIER_SNOW_DIR}/${day}.json`;
/** `<catalogue build>.<revision>` — a new revision is a new name, so a published static file never changes under its name. */
export const GLACIER_SNOW_STATIC_RE = /^(\d{8}-\d+)\.(\d+)$/;
export const GLACIER_SNOW_CELLS_DIR = `${GLACIER_SNOW_DIR}/static/cells`;
export const GLACIER_SNOW_CLIM_DIR = `${GLACIER_SNOW_DIR}/static/clim`;
export const glacierSnowCellsPath = (v: string) => `${GLACIER_SNOW_CELLS_DIR}/${v}.json`;
export const glacierSnowClimPath = (v: string, region: string) => `${GLACIER_SNOW_CLIM_DIR}/${v}/${region}.json`;
/** Day documents stay this long in the data repo (the source keeps the whole series; there is no archive). set. */
export const GLACIER_SNOW_KEEP_DAYS = 400;
/** Largest day document the producer writes (bytes). 799 glaciers need about 45 KB. set. */
export const GLACIER_SNOW_DAY_MAX_BYTES = 200_000;

// --- Source --------------------------------------------------------------------------------------------------------------------------------

export const SNOWGRID_DATASET = 'snowgrid_cl-v2-1d-1km';
export const SNOWGRID_API = 'https://dataset.api.hub.geosphere.at/v1';
export const SNOWGRID_TIMESERIES_URL = `${SNOWGRID_API}/timeseries/historical/${SNOWGRID_DATASET}`;
export const SNOWGRID_GRID_URL = `${SNOWGRID_API}/grid/historical/${SNOWGRID_DATASET}`;
export const SNOWGRID_METADATA_URL = `${SNOWGRID_TIMESERIES_URL}/metadata`;
/** Limits of the service, measured 21.11.2026 (response headers and the error text of a too large request). */
export const SNOWGRID_MAX_VALUES_PER_REQUEST = 1_000_000;
export const SNOWGRID_REQUESTS_PER_HOUR = 240;
/** Points per time-series request (set; keeps the address short). */
export const SNOW_POINTS_PER_REQUEST = 150;
/** Hard cap of requests per daily run (set; a run needs seven: the metadata and six point requests). */
export const SNOW_MAX_REQUESTS_PER_RUN = 12;
/** Pause between two requests (ms, set; the service allows five per second). */
export const SNOW_REQUEST_PAUSE_MS = 300;
/** How many days back a run fills missing documents and re-reads published ones (set). */
export const SNOW_BACKFILL_DAYS = 7;

/** Where the product is valid. A glacier outside has no entry. */
export const SNOW_COVERAGE = 'AT' as const;
export const SNOW_COVERAGE_NOTE = 'SNOWGRID deckt nur Österreich ab. Gletscher in der Schweiz und in Deutschland haben keinen Eintrag.';
/** Provenance of every value of this product. Never `measured`. */
export const SNOW_ORIGIN = 'analysis' as const;
export const SNOW_ORIGIN_NOTE = 'Analyse auf einem 1-km-Gitter, keine Messung am Gletscher: der Wert steht für eine Zelle von 1 km² mit eigener Modellhöhe.';

export interface GlacierSnowSource { id: 'snowgrid'; label: string; note: string; licence: string; licenceUrl: string; url: string; doi: string; changes: string }
/** Source note of the product — prepared for the later display, shown nowhere yet. */
export const GLACIER_SNOW_SOURCE: GlacierSnowSource = Object.freeze({
  id: 'snowgrid', label: 'SNOWGRID Klima v2.1 (Schneehöhe und Schneewasserwert, 1 km, täglich seit 1961)', note: 'GeoSphere Austria',
  licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://data.hub.geosphere.at/dataset/snowgrid_cl-v2-1d-1km', doi: 'https://doi.org/10.60669/fsxx-6977',
  changes: 'Schneehöhe von m in cm umgerechnet; je Gletscher das Mittel der Gitterzellen, deren Mittelpunkt im Umriss liegt, sonst die nächste Zelle; Einordnung gegen die Jahre 1991–2020 von buscosun gerechnet',
});
/** The source as a row of the brief's licence list (shape of a `sources.json` row) — prepared, not yet listed anywhere. */
export const glacierSnowSourceRow = (): { id: string; label: string; licence: string; attribution: string; url: string; refYear: string; used: string; licenceUrl: string; changes: string } => ({
  id: 'snow-snowgrid', label: GLACIER_SNOW_SOURCE.label, licence: GLACIER_SNOW_SOURCE.licence, attribution: `${GLACIER_SNOW_SOURCE.note} (${GLACIER_SNOW_SOURCE.doi})`, url: GLACIER_SNOW_SOURCE.url,
  refYear: 'laufend', used: 'Schneehöhe und Schneewasserwert je österreichischem Gletscher (Analyse, keine Messung)', licenceUrl: GLACIER_SNOW_SOURCE.licenceUrl, changes: `Von buscosun bearbeitet: ${GLACIER_SNOW_SOURCE.changes}.`,
});

// --- Units and limits ----------------------------------------------------------------------------------------------------------------------

/** Units of the product. The source sends the depth in m (two decimals) and the water equivalent in kg m-2. */
export const SNOW_UNITS = Object.freeze({ hs: 'cm Schneehöhe', swe: 'mm Schneewasserwert (kg/m²)', place: 'Lage 0–100 zwischen kleinstem und größtem Wert der Referenzjahre an diesem Kalendertag' } as const);
/** Plausible range (set). A value outside is not in the document. */
export const SNOW_LIMITS = Object.freeze({ hs: [0, 1500], swe: [0, 8000] } as const);
/** A glacier whose nearest cell with data is further than this from its catalogue point lies outside the grid (km, set). */
export const SNOW_NEAREST_MAX_KM = 1;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const R = Math.PI / 180;
const distKm = (la1: number, lo1: number, la2: number, lo2: number) => { const a = Math.sin(((la2 - la1) * R) / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin(((lo2 - lo1) * R) / 2) ** 2; return 2 * 6371.0088 * Math.asin(Math.sqrt(a)); };
/** Depth of the source (m) → cm, whole numbers. */
export const snowCmOf = (m: number): number => Math.round(m * 100);
/** `20261120` ↔ `2026-11-20`. */
export const snowDayOf = (isoDate: string): string => isoDate.slice(0, 10).replace(/-/g, '');
export const snowIsoOf = (day: string): string => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
export const snowDayMs = (day: string): number => Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));

// --- Reader: the API answers -----------------------------------------------------------------------------------------------------------------

/** Key of a grid cell: its centre as the service names it, five decimals (`lat,lon`). */
export const snowCellKey = (lat: number, lon: number): string => `${lat.toFixed(5)},${lon.toFixed(5)}`;
export interface SnowSeries { key: string; lat: number; lon: number; hs: Array<number | null>; swe: Array<number | null> }
export interface SnowAnswer { days: string[]; series: SnowSeries[] }
/**
 * Reads a GeoJSON answer of the time-series (or grid) API: the days (`yyyymmdd`) and per returned grid point its centre and the
 * values — depth in cm, water equivalent in mm, `null` where the service sends none. Throws on a different unit: the product must
 * never convert on a guess.
 */
export function parseSnowAnswer(doc: unknown): SnowAnswer {
  const o = doc as { timestamps?: unknown[]; features?: Array<{ geometry?: { coordinates?: unknown[] }; properties?: { parameters?: Record<string, { unit?: unknown; data?: unknown[] }> } }> } | null;
  if (!o || !Array.isArray(o.timestamps) || !Array.isArray(o.features)) throw new Error('SNOWGRID: Antwort ohne Zeitstempel oder Punkte');
  const days = o.timestamps.map((t) => { if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00\+00:00$/.test(t)) throw new Error(`SNOWGRID: unerwarteter Zeitstempel ${String(t)}`); return snowDayOf(t); });
  const series: SnowSeries[] = [];
  for (const f of o.features) {
    const c = f?.geometry?.coordinates, p = f?.properties?.parameters ?? {};
    if (!Array.isArray(c) || !isNum(c[0]) || !isNum(c[1])) throw new Error('SNOWGRID: Punkt ohne Koordinaten');
    const read = (name: string, unit: string, conv: (x: number) => number): Array<number | null> => {
      const q = p[name];
      if (!q) return days.map(() => null);
      if (q.unit !== unit) throw new Error(`SNOWGRID: ${name} in ${String(q.unit)} statt ${unit}`);
      if (!Array.isArray(q.data) || q.data.length !== days.length) throw new Error(`SNOWGRID: ${name} mit ${Array.isArray(q.data) ? q.data.length : 0} Werten für ${days.length} Tage`);
      return q.data.map((x) => (isNum(x) ? conv(x) : null));
    };
    series.push({ key: snowCellKey(c[1], c[0]), lat: c[1], lon: c[0], hs: read('snow_depth', 'm', snowCmOf), swe: read('swe_tot', 'kg m-2', Math.round) });
  }
  return { days, series };
}
/** Address of a time-series request for cell centres (`[lat, lon]`). */
export function snowSeriesUrl(cells: ReadonlyArray<readonly [number, number]>, startDay: string, endDay: string, params: readonly string[] = ['snow_depth', 'swe_tot']): string {
  return `${SNOWGRID_TIMESERIES_URL}?parameters=${params.join(',')}&start=${snowIsoOf(startDay)}&end=${snowIsoOf(endDay)}${cells.map((c) => `&lat_lon=${c[0]},${c[1]}`).join('')}&output_format=geojson`;
}
/** Newest day of the dataset from its metadata (`end_time`), `yyyymmdd`. */
export function snowEndDay(meta: unknown): string {
  const t = (meta as { end_time?: unknown } | null)?.end_time;
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(t)) throw new Error('SNOWGRID: Metadaten ohne end_time');
  return snowDayOf(t);
}

// --- Cells per glacier ---------------------------------------------------------------------------------------------------------------------

export type SnowOutline = ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly number[]>>>;
export interface SnowCellsGlacier { id: string; region: string; lat: number; lon: number; outline?: SnowOutline }
/** `how`: cells whose centre lies inside the outline, or the nearest cell with data to the catalogue point (`km` away). */
export interface SnowCellsEntry { how: 'outline' | 'nearest'; region: string; cells: Array<[lat: number, lon: number]>; km?: number }
export interface SnowCellsDoc {
  schema: 1; kind: 'glacier/snow-cells';
  file: string; build: string; builtAt: string; gridDay: string;
  rule: { inside: 'cell centre inside the L1 outline'; else: 'nearest cell with data to the catalogue point'; nearestMaxKm: number };
  coverage: typeof SNOW_COVERAGE;
  /** Every cell at least one glacier uses, `[lat, lon]`, sorted. */
  cells: Array<[number, number]>;
  glaciers: Record<string, SnowCellsEntry>;
  /** Austrian glaciers without a cell: `[id, reason]`. */
  outside: Array<[string, string]>;
  report: { glaciers: number; outline: number; nearest: number; outside: number; cells: number };
}

const inRing = (ring: ReadonlyArray<readonly number[]>, lon: number, lat: number): boolean => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};
/** Point inside an outline: inside an outer ring and in none of its holes. */
export const snowInOutline = (polys: SnowOutline, lat: number, lon: number): boolean => polys.some((poly) => !!poly[0] && inRing(poly[0], lon, lat) && !poly.slice(1).some((h) => inRing(h, lon, lat)));

/**
 * The cells of every glacier from the cells of one day of the grid (`grid` = points with a value; a cell without a value lies
 * outside the model's domain and is no cell). Pure. A glacier without an outline, or without a cell within
 * `SNOW_NEAREST_MAX_KM`, is listed under `outside`.
 */
export function buildSnowCells(glaciers: readonly SnowCellsGlacier[], grid: ReadonlyArray<{ lat: number; lon: number }>, opts: { file: string; build: string; builtAt: string; gridDay: string }): SnowCellsDoc {
  const doc: SnowCellsDoc = {
    schema: 1, kind: 'glacier/snow-cells', file: opts.file, build: opts.build, builtAt: opts.builtAt, gridDay: opts.gridDay,
    rule: { inside: 'cell centre inside the L1 outline', else: 'nearest cell with data to the catalogue point', nearestMaxKm: SNOW_NEAREST_MAX_KM },
    coverage: SNOW_COVERAGE, cells: [], glaciers: {}, outside: [], report: { glaciers: 0, outline: 0, nearest: 0, outside: 0, cells: 0 },
  };
  const used = new Map<string, [number, number]>();
  const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  for (const g of glaciers) {
    doc.report.glaciers++;
    // a cell centre is at most 0.71 km from any point of its cell: everything further than ~0.15° is out of reach of an outline of this size
    const near = grid.filter((c) => Math.abs(c.lat - g.lat) < 0.15 && Math.abs(c.lon - g.lon) < 0.22);
    const inside = g.outline ? near.filter((c) => snowInOutline(g.outline!, c.lat, c.lon)) : [];
    let entry: SnowCellsEntry | null = null;
    if (inside.length) entry = { how: 'outline', region: g.region, cells: inside.map((c): [number, number] => [r5(c.lat), r5(c.lon)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
    else {
      let best: { c: { lat: number; lon: number }; d: number } | null = null;
      for (const c of near) { const d = distKm(g.lat, g.lon, c.lat, c.lon); if (!best || d < best.d) best = { c, d }; }
      if (best && best.d <= SNOW_NEAREST_MAX_KM) entry = { how: 'nearest', region: g.region, cells: [[r5(best.c.lat), r5(best.c.lon)]], km: Math.round(best.d * 100) / 100 };
    }
    if (!entry) { doc.outside.push([g.id, 'keine Zelle mit Wert innerhalb von 1 km']); doc.report.outside++; continue; }
    doc.glaciers[g.id] = entry;
    doc.report[entry.how]++;
    for (const c of entry.cells) used.set(snowCellKey(c[0], c[1]), c);
  }
  doc.cells = [...used.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  doc.report.cells = doc.cells.length;
  return doc;
}

/** Mean over the cells of a glacier for one day index — `null` when any of its cells has no value that day. */
export function snowGlacierValue(entry: SnowCellsEntry, byKey: ReadonlyMap<string, SnowSeries>, i: number): { hs: number; swe: number } | null {
  let hs = 0, swe = 0;
  for (const c of entry.cells) {
    const s = byKey.get(snowCellKey(c[0], c[1]));
    const a = s?.hs[i], b = s?.swe[i];
    if (!isNum(a) || !isNum(b)) return null;
    hs += a; swe += b;
  }
  return entry.cells.length ? { hs: Math.round(hs / entry.cells.length), swe: Math.round(swe / entry.cells.length) } : null;
}

// --- Climatology ---------------------------------------------------------------------------------------------------------------------------

/** Reference years of the spread (the WMO normal period, inclusive). set. */
export const SNOW_REF_YEARS = Object.freeze([1991, 2020] as const);
/** Percentiles stored per calendar day: smallest, 10, 25, 50, 75, 90, largest of the reference years. set. */
export const SNOW_CLIM_PCTS = Object.freeze([0, 10, 25, 50, 75, 90, 100] as const);
/** Calendar-day key `mmdd`; a year's days in order, 366 of them (`0229` included). */
export const snowMmdd = (day: string): string => day.slice(4, 8);
export const SNOW_CLIM_DAYS: readonly string[] = Object.freeze(Array.from({ length: 366 }, (_, i) => { const d = new Date(Date.UTC(2020, 0, 1 + i)); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; }));
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Percentile by linear interpolation between the sorted values (`p` 0–100). */
export function snowPercentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const x = (p / 100) * (sorted.length - 1), lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}
/**
 * The reference values of one calendar day: one value per reference year. `valueOf(year, mmdd)` returns the glacier's value of that
 * day or `null`. 29 February: the day itself in a leap year, else the mean of 28 February and 1 March of that year (set) — so the
 * day carries as many values as every other day. Years without a value are left out.
 */
export function snowRefValues(valueOf: (year: number, mmdd: string) => number | null, mmdd: string, years: readonly [number, number] = SNOW_REF_YEARS): number[] {
  const out: number[] = [];
  for (let y = years[0]; y <= years[1]; y++) {
    let v: number | null;
    if (mmdd === '0229' && !isLeap(y)) { const a = valueOf(y, '0228'), b = valueOf(y, '0301'); v = isNum(a) && isNum(b) ? (a + b) / 2 : null; }
    else v = valueOf(y, mmdd);
    if (isNum(v)) out.push(v);
  }
  return out;
}
/** The stored row of one calendar day: the `SNOW_CLIM_PCTS` of the reference values, whole numbers; `null` below `minYears` values. */
export function snowClimRow(values: readonly number[], minYears = 20): number[] | null {
  if (values.length < minYears) return null;
  const s = [...values].sort((a, b) => a - b);
  return SNOW_CLIM_PCTS.map((p) => Math.round(snowPercentile(s, p)));
}
/**
 * Place of a value in the spread of its calendar day: 0–100, piecewise linear between the stored percentiles. `below` / `above` =
 * outside every reference year (place 0 or 100). A flat stretch (several percentiles equal, e.g. 0 cm in summer) gives the middle
 * of the percentiles that share the value. A number, never a word.
 */
export function snowPlace(v: number, row: readonly number[]): { place: number; below?: true; above?: true } {
  const p = SNOW_CLIM_PCTS, n = row.length;
  if (v < row[0]) return { place: 0, below: true };
  if (v > row[n - 1]) return { place: 100, above: true };
  let lo = -1, hi = -1;
  for (let i = 0; i < n; i++) if (row[i] === v) { if (lo < 0) lo = i; hi = i; }
  if (lo >= 0) return { place: Math.round((p[lo] + p[hi]) / 2) };
  for (let i = 0; i < n - 1; i++) if (v > row[i] && v < row[i + 1]) return { place: Math.round(p[i] + ((p[i + 1] - p[i]) * (v - row[i])) / (row[i + 1] - row[i])) };
  return { place: 100 };
}

export interface SnowClimDoc {
  schema: 1; kind: 'glacier/snow-clim';
  file: string; build: string; region: string; builtAt: string;
  ref: readonly [number, number]; pcts: readonly number[]; unit: 'cm';
  rule: { feb29: 'leap years: the day; other years: mean of 28 Feb and 1 Mar'; smoothing: 'none'; minYears: number };
  /** Calendar days of the rows, `mmdd` × 366. */
  days: readonly string[];
  /** Per glacier 366 rows of snow depth percentiles (cm); `null` = fewer than `minYears` reference years. */
  hs: Record<string, Array<number[] | null>>;
}

// --- Day document --------------------------------------------------------------------------------------------------------------------------

export type SnowMissingReason = 'outside' | 'nodata' | 'range' | 'nocells';
export const SNOW_MISSING_TEXT: Readonly<Record<SnowMissingReason, string>> = Object.freeze({
  outside: 'außerhalb des Gitters', nodata: 'kein Wert in der Quelle an diesem Tag', range: 'außerhalb der plausiblen Spanne', nocells: 'für diesen Katalog-Build sind noch keine Zellen festgelegt',
});
/** `[snow depth cm, water equivalent mm, place 0–100 or null, flag]` — flag `-1` below every reference year, `1` above, `0` inside or no place. */
export type SnowDayRow = [hs: number, swe: number, place: number | null, flag: -1 | 0 | 1];
export interface SnowDayDoc {
  schema: 1; kind: 'glacier/snow-day';
  day: string; builtAt: string;
  source: { id: 'snowgrid'; label: string; note: string; licence: string; doi: string; dataset: string };
  origin: typeof SNOW_ORIGIN; originNote: string;
  coverage: typeof SNOW_COVERAGE; coverageNote: string;
  /** Static files the values and the places come from. */
  cells: string; clim: string | null; ref: readonly [number, number];
  unit: typeof SNOW_UNITS; limits: typeof SNOW_LIMITS;
  cols: ['hs', 'swe', 'place', 'flag'];
  count: number;
  glaciers: Record<string, SnowDayRow>;
  /** Austrian glaciers without a value this day: `[id, reason]`. */
  missing: Array<[string, SnowMissingReason]>;
}
/** Pointer `index.snow`. */
export interface GlacierSnowPointer { day: string; builtAt: string; n: number; cells: string; clim: string | null }

/**
 * The day document from the cell values of ONE day index. `clim(id)` returns the glacier's percentile row of the calendar day or
 * `null`. Pure. A value outside the named limits is not written; the glacier is listed under `missing` with the reason.
 */
export function buildSnowDay(opts: {
  day: string; builtAt: string; cellsDoc: SnowCellsDoc; clim: string | null; byKey: ReadonlyMap<string, SnowSeries>; index: number;
  climRow: (id: string) => readonly number[] | null;
}): SnowDayDoc {
  const { day, builtAt, cellsDoc, byKey, index } = opts;
  const glaciers: Record<string, SnowDayRow> = {}, missing: Array<[string, SnowMissingReason]> = cellsDoc.outside.map(([id]) => [id, 'outside']);
  for (const id of Object.keys(cellsDoc.glaciers).sort()) {
    const v = snowGlacierValue(cellsDoc.glaciers[id], byKey, index);
    if (!v) { missing.push([id, 'nodata']); continue; }
    if (v.hs < SNOW_LIMITS.hs[0] || v.hs > SNOW_LIMITS.hs[1] || v.swe < SNOW_LIMITS.swe[0] || v.swe > SNOW_LIMITS.swe[1]) { missing.push([id, 'range']); continue; }
    const row = opts.climRow(id);
    const pl = row ? snowPlace(v.hs, row) : null;
    glaciers[id] = [v.hs, v.swe, pl ? pl.place : null, pl?.below ? -1 : pl?.above ? 1 : 0];
  }
  return {
    schema: 1, kind: 'glacier/snow-day', day, builtAt,
    source: { id: 'snowgrid', label: GLACIER_SNOW_SOURCE.label, note: GLACIER_SNOW_SOURCE.note, licence: GLACIER_SNOW_SOURCE.licence, doi: GLACIER_SNOW_SOURCE.doi, dataset: SNOWGRID_DATASET },
    origin: SNOW_ORIGIN, originNote: SNOW_ORIGIN_NOTE, coverage: SNOW_COVERAGE, coverageNote: SNOW_COVERAGE_NOTE,
    cells: cellsDoc.file, clim: opts.clim, ref: SNOW_REF_YEARS, unit: SNOW_UNITS, limits: SNOW_LIMITS, cols: ['hs', 'swe', 'place', 'flag'],
    count: Object.keys(glaciers).length, glaciers, missing: missing.sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

/** Problems of a day document (empty = fine). */
export function snowDayProblems(d: unknown): string[] {
  const o = d as Partial<SnowDayDoc> | null, bad: string[] = [];
  if (!o || o.schema !== 1 || o.kind !== 'glacier/snow-day') return ['kein Tagesdokument der Schneeanalyse'];
  if (typeof o.day !== 'string' || !GLACIER_SNOW_DAY_RE.test(o.day)) bad.push('Tag fehlt');
  if (o.origin !== SNOW_ORIGIN) bad.push('Herkunft ist nicht „analysis“');
  if (o.coverage !== SNOW_COVERAGE || typeof o.coverageNote !== 'string' || !o.coverageNote) bad.push('ohne Angabe der Abdeckung');
  if (typeof o.cells !== 'string' || !GLACIER_SNOW_STATIC_RE.test(o.cells)) bad.push('ohne Zellendatei');
  if (!o.glaciers || typeof o.glaciers !== 'object' || !Array.isArray(o.missing)) return [...bad, 'ohne Gletscher oder Liste der fehlenden'];
  for (const [id, r] of Object.entries(o.glaciers)) {
    if (!/^gl_at_/.test(id)) bad.push(`${id}: außerhalb der Abdeckung`);
    if (!Array.isArray(r) || r.length !== 4 || !isNum(r[0]) || !isNum(r[1])) { bad.push(`${id}: Form`); continue; }
    if (r[0] < SNOW_LIMITS.hs[0] || r[0] > SNOW_LIMITS.hs[1] || r[1] < SNOW_LIMITS.swe[0] || r[1] > SNOW_LIMITS.swe[1]) bad.push(`${id}: außerhalb der Grenzen`);
    if (r[2] !== null && (!isNum(r[2]) || r[2] < 0 || r[2] > 100)) bad.push(`${id}: Lage außerhalb 0–100`);
    if (![-1, 0, 1].includes(r[3]) || (r[2] === null && r[3] !== 0)) bad.push(`${id}: Kennzeichen`);
  }
  if (o.count !== Object.keys(o.glaciers).length) bad.push('Zahl passt nicht');
  return bad;
}
/** Problems of a cells document (empty = fine). */
export function snowCellsProblems(d: unknown): string[] {
  const o = d as Partial<SnowCellsDoc> | null, bad: string[] = [];
  if (!o || o.schema !== 1 || o.kind !== 'glacier/snow-cells') return ['keine Zellendatei'];
  if (typeof o.file !== 'string' || !GLACIER_SNOW_STATIC_RE.test(o.file) || typeof o.build !== 'string' || !GLACIER_BUILD_RE.test(o.build) || !o.file.startsWith(`${o.build}.`)) bad.push('Dateiname passt nicht zum Build');
  if (!o.glaciers || !Array.isArray(o.cells) || !Array.isArray(o.outside)) return [...bad, 'ohne Gletscher, Zellen oder Liste'];
  const keys = new Set(o.cells.map((c) => snowCellKey(c[0], c[1])));
  for (const [id, e] of Object.entries(o.glaciers)) {
    if (!e || (e.how !== 'outline' && e.how !== 'nearest') || typeof e.region !== 'string' || !Array.isArray(e.cells) || !e.cells.length) { bad.push(`${id}: Form`); continue; }
    if (e.how === 'nearest' && (e.cells.length !== 1 || !isNum(e.km) || e.km > SNOW_NEAREST_MAX_KM)) bad.push(`${id}: nächste Zelle zu weit oder ohne Abstand`);
    for (const c of e.cells) if (!keys.has(snowCellKey(c[0], c[1]))) bad.push(`${id}: Zelle fehlt in der Liste`);
  }
  return bad;
}
