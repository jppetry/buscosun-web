/**
 * Phase WT — contract of the water temperature on `/seewetter` (`audit/seewetter-wassertemperatur.md`). Imports only
 * `seaDmi.ts` (itself import-free): read by the page, by the producer `scripts/sea/sea-dmi.mjs`, by the archive
 * `scripts/sea/sea-archive.mjs` (whose workflow checks out `src/sea` only), by the catalogue builder and by
 * `verify:sea-watertemp`.
 *
 * Two things, never mixed:
 *   model        DMI storm surge model DKSS, EDR parameter `water-temperature` (the model's top layer), at a point the
 *                catalogue names per spot — through the producer, once per DKSS run (product `sea/v1/wtemp/<stamp>.json`)
 *   measurement  the nearest station with a water temperature within `WT_STATION_MAX_KM`: WSV PEGELONLINE series `WT`
 *                or DMI oceanObs `tw`, read live in the browser (CORS open at both). No station near ⇒ no measurement —
 *                the model never stands in its place.
 *
 * DMI: host `opendataapi.dmi.dk`, no API key, CC BY 4.0, never the `/grib` endpoint. WSV: DL-DE Zero 2.0, raw values.
 * A missing, failed or stale answer is "keine Daten" — never an older or invented value.
 */
import { DMI_HOST, DMI_WL_COLLECTIONS, DmiAnswerError, dmiCoverageOf, dmiDistKm, type DmiWlCollection } from './seaDmi';

const H = 3_600_000;
const DAY = 24 * H;

// --- Sources -------------------------------------------------------------------------------------------------

/** DKSS: the one water-temperature parameter without a depth suffix — measured equal to the top layer (audit §1.2). */
export const WT_PARAM = 'water-temperature';
/** The sentence that stands next to every model value (Jan, 18.11.2026). */
export const WT_MODEL_NOTE = 'Modell für das offene Wasser, im flachen Uferwasser kann es wärmer oder kälter sein';
export const WT_MODEL_LAYER_NOTE = 'oberste Schicht des Sturmflutmodells DKSS';

export const WSV_HOST = 'https://www.pegelonline.wsv.de';
export const WSV_NAME = 'Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV), PEGELONLINE';
export const WSV_LICENCE = 'DL-DE Zero 2.0';
export const WSV_LICENCE_URL = 'https://www.govdata.de/dl-de/zero-2-0';
export const WSV_PAGE = 'https://www.pegelonline.wsv.de/gast/start';
/** The source note per feature (Jan, 18.11.2026). */
export const WSV_CREDIT = `WSV PEGELONLINE, ${WSV_LICENCE}`;
/** PEGELONLINE names the series „WASSERTEMPERATUR ROHDATEN“; DMI publishes `tw` without quality control. */
export const WT_RAW_NOTE = 'Rohwert ohne Prüfung';

export type WtNet = 'wsv' | 'dmi';
export const WT_NET_LABEL: Readonly<Record<WtNet, string>> = Object.freeze({ wsv: 'WSV-Pegel', dmi: 'DMI-Station' });

// --- Value lock ------------------------------------------------------------------------------------------------

/**
 * Named limits (`set`): sea water at these coasts freezes near −1.9 °C (salinity 35) and the warmest shallow bights
 * stay below 30 °C. A value outside is not shown and not stored.
 */
export const WT_RANGE_C: readonly [number, number] = [-2.5, 32];
const inRange = (c: unknown): c is number => typeof c === 'number' && Number.isFinite(c) && c >= WT_RANGE_C[0] && c <= WT_RANGE_C[1];
/** A measurement older than this is not shown as the current one (`set`). */
export const WT_OBS_MAX_AGE_MS = 2 * H;
/** Past days of the measurement the chart shows (`set`); PEGELONLINE holds 31 days. */
export const WT_PAST_DAYS = 5;

// --- Catalogue `static/watertemp.json` -----------------------------------------------------------------------

/**
 * A file of its own (pattern E-DK-7): a page or producer that does not know it is exactly the one before the phase,
 * and removing the file is the phase's fallback. Built by `scripts/sea/build-watertemp.mjs` from the step-0 measurement.
 */
export const SEA_WT_CATALOG_PATH = 'static/watertemp.json';
export const SEA_WT_CATALOG_PRODUCT = 'sea-watertemp-catalog';
/** A station farther from the spot than this is not „the spot's measurement“ (`set`, E-WT-2 — the page's one meaning of „nahe“, like `DK_BSH_NEAR_KM`). */
export const WT_STATION_MAX_KM = 20;
/** The model's grid point may lie this far from the spot (`set`; the coarse North Sea grid is 5.6 km wide). */
export const WT_MODEL_MAX_KM = 5;

/** Where a station measures — said next to every measured value. */
export type WtSite = 'hafen' | 'anleger' | 'leuchtturm' | 'sperrwerk' | 'pegel';
export const WT_SITE_LABEL: Readonly<Record<WtSite, string>> = Object.freeze({
  hafen: 'im Hafen', anleger: 'am Anleger', leuchtturm: 'am Leuchtturm', sperrwerk: 'am Sperrwerk', pegel: 'am Pegel',
});
/** The station's own name decides (`set`): Hafen/Havn/Binnenhafen/Vorhafen, Anleger, Leuchtturm, Sperrwerk — else „am Pegel“. */
export function wtSiteOf(name: string): WtSite {
  const n = name.toLowerCase();
  if (/sperrwerk/.test(n)) return 'sperrwerk';
  if (/leuchtturm/.test(n)) return 'leuchtturm';
  if (/anleger/.test(n)) return 'anleger';
  if (/hafen|havn/.test(n)) return 'hafen';
  return 'pegel';
}

export interface WtStation {
  /** `<net>:<id>` — the key of the archive and of the daily record. */
  key: string; net: WtNet;
  /** WSV: station number; DMI: `stationId`. */
  id: string; name: string;
  /** WSV: the water body PEGELONLINE names (NORDSEE, WESER, JADE …); DMI: null. */
  water: string | null;
  site: WtSite; lat: number; lon: number;
}
/** `lat`/`lon` = the point asked at DMI; `km` = its grid point's distance from the spot. */
export interface WtModelPoint { coll: DmiWlCollection; lat: number; lon: number; km: number }
export interface WtSpotEntry { model: WtModelPoint | null; station: { key: string; km: number } | null }
export interface WtCatalog {
  schema: 1; product: typeof SEA_WT_CATALOG_PRODUCT; built: string; from: string;
  stationMaxKm: number; modelMaxKm: number;
  spots: Record<string, WtSpotEntry>;
  stations: WtStation[];
}
export const wtStationKey = (net: WtNet, id: string): string => `${net}:${id}`;

export function wtCatalogProblems(cat: unknown): string[] {
  const c = cat as Partial<WtCatalog> | null;
  if (!c || c.product !== SEA_WT_CATALOG_PRODUCT || c.schema !== 1) return ['kein Katalog der Wassertemperatur'];
  const out: string[] = [];
  const keys = new Set<string>();
  for (const s of c.stations ?? []) {
    if ((s.net !== 'wsv' && s.net !== 'dmi') || !/^[A-Za-z0-9]{1,16}$/.test(String(s.id)) || s.key !== wtStationKey(s.net, s.id)) { out.push(`Station ${String(s?.key)}: Kennung`); continue; }
    if (keys.has(s.key)) out.push(`Station ${s.key}: doppelt`);
    keys.add(s.key);
    if (typeof s.name !== 'string' || !s.name || !Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !(s.site in WT_SITE_LABEL)) out.push(`Station ${s.key}: Name, Lage oder Messort`);
  }
  if (!c.spots || typeof c.spots !== 'object') return [...out, 'spots fehlt'];
  for (const [id, e] of Object.entries(c.spots)) {
    const m = e?.model, st = e?.station;
    if (m != null && (!(DMI_WL_COLLECTIONS as readonly string[]).includes(m.coll) || !Number.isFinite(m.lat) || !Number.isFinite(m.lon) || !(m.km >= 0 && m.km <= WT_MODEL_MAX_KM))) out.push(`${id}: Modellpunkt ${m.coll} ${m.km} km`);
    if (st != null && (!keys.has(st.key) || !(st.km >= 0 && st.km <= WT_STATION_MAX_KM))) out.push(`${id}: Station ${st.key} ${st.km} km`);
  }
  return out;
}
/** The checked catalogue, or null (unknown form ⇒ the page shows no water temperature at all). */
export const wtCatalogOf = (doc: unknown): WtCatalog | null => (wtCatalogProblems(doc).length === 0 ? doc as WtCatalog : null);
export const wtStationOf = (cat: WtCatalog, key: string): WtStation | null => cat.stations.find((s) => s.key === key) ?? null;

// --- DKSS runs (EDR instances) ---------------------------------------------------------------------------------

/** The model runs a sub-model holds (newest first in the measurement) — one request tells whether a new run is there. */
export const dmiInstancesUrl = (coll: string): string => `${DMI_HOST}/v1/forecastedr/collections/${coll}/instances`;
/** Position query pinned to ONE run: the answer cannot silently come from another one. `crs=crs84` ⇒ longitude first. */
export const dmiInstancePositionUrl = (coll: string, instance: string, lat: number, lon: number, params: readonly string[]): string =>
  `${DMI_HOST}/v1/forecastedr/collections/${coll}/instances/${instance}/position?coords=POINT(${lon}%20${lat})&crs=crs84&parameter-name=${params.join(',')}&f=CoverageJSON`;
const INSTANCE_RE = /^(\d{4})-(\d\d)-(\d\d)T(\d\d)(\d\d)(\d\d)Z$/;
/** `2026-11-18T120000Z` → ms, or NaN. */
export function dmiInstanceMs(id: unknown): number {
  const m = typeof id === 'string' ? INSTANCE_RE.exec(id) : null;
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}
/** The newest run of an `/instances` answer. Throws `DmiAnswerError` with DMI's own words when it is not such a list. */
export function dmiNewestInstance(doc: unknown): { id: string; t0: number } {
  const d = doc as { instances?: { id?: unknown }[]; status?: number; error?: string; message?: string } | null;
  if (!d || typeof d !== 'object') throw new DmiAnswerError('keine JSON-Antwort');
  if (!Array.isArray(d.instances)) throw new DmiAnswerError(typeof d.status === 'number' ? `DMI ${d.status}${d.error ? ` ${d.error}` : ''}${d.message ? `: ${d.message}` : ''}` : 'Antwort ist keine Liste der Läufe');
  let best: { id: string; t0: number } | null = null;
  for (const x of d.instances) { const t0 = dmiInstanceMs(x?.id); if (Number.isFinite(t0) && (!best || t0 > best.t0)) best = { id: x.id as string, t0 }; }
  if (!best) throw new DmiAnswerError('kein Lauf in der Liste');
  return best;
}

// --- Product `sea/v1/wtemp/<stamp>.json` ---------------------------------------------------------------------

export const SEA_WT_PRODUCT = 'sea-watertemp';
export const SEA_WT_DIR = 'wtemp';
/** `stamp` = build minute, UTC, `YYYYMMDDHHmm` — every file is written once and never changed. */
export const seaWtPath = (stamp: string): string => `${SEA_WT_DIR}/${stamp}.json`;
export const SEA_WT_RE = /^(\d{12})\.json$/;
export const seaWtStamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
export const SEA_WT_KEPT = 3;
/** The producer looks for a new DKSS run at most this often (DKSS runs every 6 h). */
export const SEA_WT_CHECK_MS = 60 * 60_000;
/**
 * An entry whose run began longer ago than this is not shown: DKSS runs every 6 h and stood at DMI ≈ 5 h after its
 * start in the measurement, so the newest run is at most ≈ 11 h old — 24 h means two runs are missing.
 */
export const SEA_WT_STALE_MS = 24 * H;
/** Stored unit: 0.1 °C, integer. */
export const WT_RANGE_T: readonly [number, number] = [WT_RANGE_C[0] * 10, WT_RANGE_C[1] * 10];

/** `t0` = start of the DKSS run (ms, whole hour); `c[i]` = 0.1 °C at `t0 + i h`, `null` = the model cell carries no water then. */
export interface SeaWtEntry { coll: DmiWlCollection; lat: number; lon: number; km: number; t0: number; c: (number | null)[] }
export interface SeaWtDoc {
  schema: 1; product: typeof SEA_WT_PRODUCT; stamp: string; builtAt: string;
  source: string; licence: string; credit: string; terms: string;
  param: string; unit: '0.1 °C';
  /** Newest run the producer saw per sub-model (ms). An entry with an older `t0` is from the run before. */
  runs: Partial<Record<DmiWlCollection, number>>;
  spots: Record<string, SeaWtEntry>;
  failed: { id: string; error: string }[];
}

/**
 * DKSS answer → the stored entry. Throws `DmiAnswerError` for everything that is not a usable column: DMI's own error
 * body, a point on land (200 with nothing but nulls), a time axis that does not start at `runMs` (the answer belongs to
 * another run), a value outside `WT_RANGE_C`. Hours without water stay `null` — never filled.
 */
export function wtEntry(doc: unknown, coll: DmiWlCollection, spot: { lat: number; lon: number }, runMs?: number): SeaWtEntry {
  const cov = dmiCoverageOf(doc, [WT_PARAM]);
  const t0 = Math.floor(cov.t[0] / H) * H;
  if (runMs != null && t0 !== runMs) throw new DmiAnswerError(`Antwort beginnt ${new Date(t0).toISOString()}, gefragt war der Lauf ${new Date(runMs).toISOString()}`);
  const n = Math.round((cov.t[cov.t.length - 1] - t0) / H) + 1;
  const c = new Array<number | null>(n).fill(null);
  cov.t.forEach((ms, k) => {
    const i = (ms - t0) / H, v = cov.values[WT_PARAM][k];
    if (!Number.isInteger(i) || i < 0 || i >= n || v == null) return;
    if (!inRange(v)) throw new DmiAnswerError(`Wert ${v} °C außerhalb ${WT_RANGE_C[0]} … ${WT_RANGE_C[1]} °C`);
    c[i] = Math.round(v * 10);
  });
  if (!c.some((x) => x != null)) throw new DmiAnswerError('kein Wert am Modellpunkt (Land im Modell)');
  return { coll, lat: +cov.lat.toFixed(5), lon: +cov.lon.toFixed(5), km: +dmiDistKm(spot.lat, spot.lon, cov.lat, cov.lon).toFixed(2), t0, c };
}

const intCol = (a: unknown, lo: number, hi: number): boolean => Array.isArray(a) && a.length > 0 && a.every((x) => x === null || (Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi));

/** Value lock of ONE entry (producer before writing, client before display). */
export function wtEntryProblems(id: string, e: unknown): string[] {
  const s = e as Partial<SeaWtEntry> | null;
  if (!s || typeof s !== 'object') return [`${id}: kein Eintrag`];
  const out: string[] = [];
  if (!(DMI_WL_COLLECTIONS as readonly string[]).includes(s.coll as string)) out.push(`${id}: Collection ${String(s.coll)}`);
  if (!Number.isFinite(s.t0) || (s.t0 as number) % H !== 0) out.push(`${id}: t0`);
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !((s.km as number) >= 0 && (s.km as number) <= WT_MODEL_MAX_KM)) out.push(`${id}: Modellpunkt ${String(s.km)} km vom Spot (Grenze ${WT_MODEL_MAX_KM} km)`);
  if (!intCol(s.c, WT_RANGE_T[0], WT_RANGE_T[1])) out.push(`${id}: Werte außerhalb ${WT_RANGE_C.join(' … ')} °C`);
  else if (!(s.c as (number | null)[]).some((x) => x != null)) out.push(`${id}: leer`);
  return out;
}
export function seaWtProblems(doc: unknown): string[] {
  const d = doc as Partial<SeaWtDoc> | null;
  if (!d || d.product !== SEA_WT_PRODUCT || d.schema !== 1) return ['kein sea-watertemp-Dokument'];
  const out: string[] = [];
  if (typeof d.stamp !== 'string' || !/^\d{12}$/.test(d.stamp)) out.push('stamp');
  if (typeof d.builtAt !== 'string' || !Number.isFinite(Date.parse(d.builtAt))) out.push('builtAt');
  if (d.licence !== 'CC BY 4.0') out.push(`licence ${String(d.licence)}`);
  if (d.param !== WT_PARAM || d.unit !== '0.1 °C') out.push('param/unit');
  if (!d.spots || typeof d.spots !== 'object') out.push('spots');
  else for (const [id, e] of Object.entries(d.spots)) out.push(...wtEntryProblems(id, e));
  if (!d.runs || typeof d.runs !== 'object' || Object.entries(d.runs).some(([k, v]) => !(DMI_WL_COLLECTIONS as readonly string[]).includes(k) || !Number.isFinite(v))) out.push('runs');
  if (!Array.isArray(d.failed)) out.push('failed');
  return out;
}

/** `status.json` → `wtemp`: the newest file and when the producer last looked for a new run. Malformed counts as "none". */
export interface SeaWtPointer { stamp: string; path: string; builtAt: string; checkedAt: string }
export function wtPointerOf(status: Record<string, unknown> | null | undefined): SeaWtPointer | null {
  const p = status?.wtemp as Partial<SeaWtPointer> | undefined;
  if (!p || typeof p.stamp !== 'string' || typeof p.path !== 'string' || typeof p.builtAt !== 'string') return null;
  if (p.path !== seaWtPath(p.stamp) || !Number.isFinite(Date.parse(p.builtAt))) return null;
  return { stamp: p.stamp, path: p.path, builtAt: p.builtAt, checkedAt: typeof p.checkedAt === 'string' && Number.isFinite(Date.parse(p.checkedAt)) ? p.checkedAt : p.builtAt };
}
/** Is this entry's run too old to be shown? */
export const wtEntryStale = (e: { t0: number }, nowMs: number): boolean => !(nowMs - e.t0 <= SEA_WT_STALE_MS);

// --- Reading the product on the page -------------------------------------------------------------------------

export interface WtPoint { t: number; c: number }
/** The stored column as points in °C (hours without a value are left out — never filled). */
export const wtModelPoints = (e: SeaWtEntry): WtPoint[] => e.c.flatMap((x, i) => (x == null ? [] : [{ t: e.t0 + i * H, c: x / 10 }]));
/** The value of the whole hour `tMs` in °C, or `null` (no interpolation across a gap, nothing beyond the end). */
export function wtModelAt(e: SeaWtEntry, tMs: number): number | null {
  const i = (Math.floor(tMs / H) * H - e.t0) / H;
  const x = Number.isInteger(i) && i >= 0 && i < e.c.length ? e.c[i] : null;
  return x == null ? null : x / 10;
}
export const wtModelEnd = (e: SeaWtEntry): number | null => { for (let i = e.c.length - 1; i >= 0; i--) if (e.c[i] != null) return e.t0 + i * H; return null; };
/** Share of the run's hours in which the model cell carries no water (0 … 1). */
export const wtModelDryShare = (e: SeaWtEntry): number => e.c.filter((x) => x == null).length / e.c.length;

// --- Measurements (live in the browser, and in the archive) ----------------------------------------------------

/** WSV PEGELONLINE: the raw series `WT` of one station over the last `days` days (ascending, 1- to 60-minute values). */
export const wsvMeasurementsUrl = (stationId: string, days: number): string =>
  `${WSV_HOST}/webservices/rest-api/v2/stations/${encodeURIComponent(stationId)}/WT/measurements.json?start=P${days}D`;
/** DMI oceanObs: `tw` of one station since `fromMs` (10-minute values, newest first). */
export const dmiTwUrl = (stationId: string, fromMs: number, limit = 1000): string =>
  `${DMI_HOST}/v2/oceanObs/collections/observation/items?stationId=${encodeURIComponent(stationId)}&parameterId=tw&datetime=${new Date(fromMs).toISOString().slice(0, 19)}Z/..&limit=${limit}`;
/** The series of one station over the last `days` days, as the page and the archive ask for it (DMI: 144 values a day, from a whole hour on). */
export const wtObsUrl = (st: { net: WtNet; id: string }, nowMs: number, days = WT_PAST_DAYS): string =>
  (st.net === 'wsv' ? wsvMeasurementsUrl(st.id, days) : dmiTwUrl(st.id, Math.floor((nowMs - days * DAY) / H) * H, Math.max(1000, days * 150)));

/** One answer → ascending points in °C. Values outside `WT_RANGE_C`, unreadable times and duplicates are dropped (counted). */
export interface WtObsSeries { points: WtPoint[]; dropped: number }
function series(rows: Array<{ t: number; c: unknown }>): WtObsSeries {
  const at = new Map<number, number>();
  let dropped = 0;
  for (const r of rows) { if (Number.isFinite(r.t) && inRange(r.c)) at.set(r.t, r.c); else dropped++; }
  return { points: [...at.entries()].sort((a, b) => a[0] - b[0]).map(([t, c]) => ({ t, c })), dropped };
}
/** PEGELONLINE `measurements.json`: `[{ timestamp, value }]`. Anything else ⇒ `null` (not "no values"). */
export function wsvObsOf(doc: unknown): WtObsSeries | null {
  if (!Array.isArray(doc)) return null;
  return series(doc.map((x) => ({ t: Date.parse(String((x as { timestamp?: unknown })?.timestamp)), c: (x as { value?: unknown })?.value })));
}
/** DMI oceanObs `items`: a FeatureCollection; only features of `tw` count. Anything else ⇒ `null`. */
export function dmiTwObsOf(doc: unknown): WtObsSeries | null {
  const f = doc as { type?: string; features?: { properties?: { parameterId?: string; observed?: unknown; value?: unknown } }[] } | null;
  if (f?.type !== 'FeatureCollection' || !Array.isArray(f.features)) return null;
  return series(f.features.filter((x) => x?.properties?.parameterId === 'tw').map((x) => ({ t: Date.parse(String(x.properties!.observed)), c: x.properties!.value })));
}
export const wtObsOf = (net: WtNet, doc: unknown): WtObsSeries | null => (net === 'wsv' ? wsvObsOf(doc) : dmiTwObsOf(doc));

/** The newest value not older than `WT_OBS_MAX_AGE_MS` and not from the future, or `null` ("keine Messung"). */
export function wtLatest(points: readonly WtPoint[], nowMs: number): WtPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.t > nowMs + 10 * 60_000) continue;
    return nowMs - p.t <= WT_OBS_MAX_AGE_MS ? p : null;
  }
  return null;
}
/** A whole hour takes the value nearest to it within this many ms (`set`: the sampling is 1 to 15 minutes at the coast). */
export const WT_HOUR_SNAP_MS = 10 * 60_000;
/** The series on whole hours (one value per hour at most; an hour without a value near it is left out). */
export function wtHourly(points: readonly WtPoint[]): WtPoint[] {
  const best = new Map<number, { d: number; c: number }>();
  for (const p of points) {
    const hour = Math.round(p.t / H) * H, d = Math.abs(p.t - hour);
    if (d > WT_HOUR_SNAP_MS) continue;
    const b = best.get(hour);
    if (!b || d < b.d) best.set(hour, { d, c: p.c });
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, c: v.c }));
}

// --- Our own record (buscosun-archiv `sea/v1/`) ----------------------------------------------------------------

/** `sea/v1/<day>/wtemp.json.gz`: the hourly measured values of the catalogue stations of one UTC day. */
export const SEA_WT_ARCHIVE_PRODUCT = 'sea-archive-wtemp';
/** `sea/v1/wtemp-daily.json` (plain JSON, read by the page): per station and UTC day `[min, mean, max, hours]` in °C. */
export const SEA_WT_DAILY_FILE = 'wtemp-daily.json';
export const SEA_WT_DAILY_PRODUCT = 'sea-wtemp-daily';
export const SEA_WT_DAILY_URL = `https://raw.githubusercontent.com/jppetry/buscosun-archiv/main/sea/v1/${SEA_WT_DAILY_FILE}`;
/** A day enters the curve with at least this many hourly values (`set`). */
export const WT_DAY_MIN_HOURS = 18;
/** A season curve is drawn only from this many full years of ONE source at ONE station (Jan, 18.11.2026). */
export const WT_SEASON_MIN_YEARS = 5;

export type WtDayStat = [min: number, mean: number, max: number, hours: number];
export interface WtDailyStation { name: string; net: WtNet; days: Record<string, WtDayStat> }
export interface WtDailyDoc { schema: 1; product: typeof SEA_WT_DAILY_PRODUCT; updatedAt: string; unit: '°C'; minHours: number; stations: Record<string, WtDailyStation> }

/** `[min, mean, max, n]` of the hourly values of one day (one decimal), or `null` without a value. */
export function wtDayStat(values: readonly number[]): WtDayStat | null {
  const v = values.filter(inRange);
  if (!v.length) return null;
  const r = (x: number) => Math.round(x * 10) / 10;
  return [r(Math.min(...v)), r(v.reduce((a, b) => a + b, 0) / v.length), r(Math.max(...v)), v.length];
}
export interface WtDayPoint { day: string; t: number; min: number; mean: number; max: number }
/**
 * The record of one station as the page draws it: full days only (`WT_DAY_MIN_HOURS`), ascending; `since` = the first
 * such day. A document of another form or a station it does not carry ⇒ `null` (the page then says nothing about a record).
 */
export function wtRecordOf(doc: unknown, key: string): { since: string; points: WtDayPoint[] } | null {
  const d = doc as Partial<WtDailyDoc> | null;
  if (!d || d.product !== SEA_WT_DAILY_PRODUCT || d.schema !== 1) return null;
  const days = d.stations?.[key]?.days;
  if (!days || typeof days !== 'object') return null;
  const points: WtDayPoint[] = [];
  for (const [day, s] of Object.entries(days)) {
    const t = Date.parse(`${day}T12:00:00Z`);
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(t) || !Array.isArray(s) || s.length !== 4) continue;
    const [min, mean, max, n] = s;
    if (!inRange(min) || !inRange(mean) || !inRange(max) || !(n >= WT_DAY_MIN_HOURS) || min > mean || mean > max) continue;
    points.push({ day, t, min, mean, max });
  }
  points.sort((a, b) => a.t - b.t);
  return points.length ? { since: points[0].day, points } : null;
}
/** A calendar year counts as full with at least this many full days (`set`: 95 % — a gauge is serviced and fails for days). */
export const WT_YEAR_MIN_DAYS = 347;
/** Full calendar years a record holds — the measure for a season curve. */
export function wtFullYears(points: ReadonlyArray<{ day: string }>): number[] {
  const byYear = new Map<number, number>();
  for (const p of points) { const y = +p.day.slice(0, 4); byYear.set(y, (byYear.get(y) ?? 0) + 1); }
  return [...byYear.entries()].filter(([, n]) => n >= WT_YEAR_MIN_DAYS).map(([y]) => y).sort((a, b) => a - b);
}

// --- Season curve from a source's own full years (`static/wtemp-season.json`) ------------------------------------

/**
 * Where ONE source delivers at least `WT_SEASON_MIN_YEARS` full years at ONE station (measured: DMI oceanObs `tw` at
 * four stations), the course of the year is drawn from exactly those years: per calendar day the mean of the years'
 * daily means and the lowest and highest of them. Nothing is smoothed, filled or carried from another station.
 * Built once by `scripts/sea/build-wtemp-season.mjs`; a station without such years has no entry — and no curve.
 */
export const SEA_WT_SEASON_PATH = 'static/wtemp-season.json';
export const SEA_WT_SEASON_PRODUCT = 'sea-wtemp-season';
/** `[lowest, mean, highest]` of the years' daily means in °C, or `null` when fewer than `WT_SEASON_DAY_MIN_YEARS` years carry that day. */
export type WtSeasonDay = [min: number, mean: number, max: number] | null;
/** A calendar day enters the curve with at least this many years (`set`; 29 Feb usually has too few). */
export const WT_SEASON_DAY_MIN_YEARS = 3;
export interface WtSeasonStation { name: string; years: number[]; /** 366 calendar days, 01-01 … 12-31 with 02-29. */ days: WtSeasonDay[] }
export interface WtSeasonDoc { schema: 1; product: typeof SEA_WT_SEASON_PRODUCT; built: string; unit: '°C'; minYears: number; yearMinDays: number; stations: Record<string, WtSeasonStation> }

const MD_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** The 366 calendar days as `MM-DD`, in order. */
export const WT_SEASON_MD: readonly string[] = Object.freeze(MD_DAYS.flatMap((n, m) => Array.from({ length: n }, (_, d) => `${String(m + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`)));

/**
 * Daily means of several years → the course of the year. `days` = `YYYY-MM-DD` → `[min, mean, max, hours]` (full days
 * only count). Returns `null` when fewer than `WT_SEASON_MIN_YEARS` years are full. Pure — the builder and the verifier share it.
 */
export function wtSeasonFromDays(days: Readonly<Record<string, WtDayStat>>): { years: number[]; days: WtSeasonDay[] } | null {
  const full = Object.entries(days).filter(([d, s]) => /^\d{4}-\d\d-\d\d$/.test(d) && Array.isArray(s) && s[3] >= WT_DAY_MIN_HOURS && inRange(s[1]));
  const years = wtFullYears(full.map(([day]) => ({ day })));
  if (years.length < WT_SEASON_MIN_YEARS) return null;
  const keep = new Set(years);
  const by = new Map<string, number[]>();
  for (const [d, s] of full) { if (!keep.has(+d.slice(0, 4))) continue; const md = d.slice(5); (by.get(md) ?? by.set(md, []).get(md)!).push(s[1]); }
  const r = (x: number) => Math.round(x * 10) / 10;
  return { years, days: WT_SEASON_MD.map((md) => { const v = by.get(md) ?? []; return v.length >= WT_SEASON_DAY_MIN_YEARS ? [r(Math.min(...v)), r(v.reduce((a, b) => a + b, 0) / v.length), r(Math.max(...v))] : null; }) };
}
export interface WtSeasonPoint { md: string; min: number; mean: number; max: number }
/** The season curve of one station as the page draws it, or `null` (no entry, too few years, another form). */
export function wtSeasonOf(doc: unknown, key: string): { name: string; years: number[]; points: WtSeasonPoint[] } | null {
  const d = doc as Partial<WtSeasonDoc> | null;
  if (!d || d.product !== SEA_WT_SEASON_PRODUCT || d.schema !== 1) return null;
  const s = d.stations?.[key];
  if (!s || !Array.isArray(s.years) || s.years.length < WT_SEASON_MIN_YEARS || !Array.isArray(s.days) || s.days.length !== WT_SEASON_MD.length) return null;
  const points: WtSeasonPoint[] = [];
  s.days.forEach((x, i) => { if (Array.isArray(x) && x.length === 3 && inRange(x[0]) && inRange(x[1]) && inRange(x[2]) && x[0] <= x[1] && x[1] <= x[2]) points.push({ md: WT_SEASON_MD[i], min: x[0], mean: x[1], max: x[2] }); });
  return points.length >= 300 ? { name: String(s.name ?? ''), years: [...s.years], points } : null;
}
