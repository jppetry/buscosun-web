/**
 * Phase DK — contract of the Danish coast on `/seewetter` (`audit/seewetter-daenemark.md`). Import-free: read by the
 * page, by the producer `scripts/sea/sea-dmi.mjs`, by the catalogue builder and by `verify:sea-dk`.
 *
 * What comes from where at a Danish spot:
 *   waves        DWD CWAM, exactly as at the German spots (no DMI WAM)
 *   wind         buscosun Fusion where the point cube covers the spot's cell (called with the German country parameters —
 *                `DK_FUSION_NOTE` stands at every such spot); outside the cube DMI HARMONIE DINI through the producer,
 *                named as DMI, without band
 *   water level  the BSH gauge when one WITH a curve lies within `DK_BSH_NEAR_KM`; otherwise the DMI storm surge model
 *                DKSS through the producer (product `sea/v1/dmi/<stamp>.json`)
 *   measurement  the nearest DMI metObs station that delivered wind and gust, read live in the browser (CORS open)
 *   texts        the DWD sea-area report as before; no German coast warning, DMI is only linked (never reproduced)
 *
 * DMI: host `opendataapi.dmi.dk`, no API key, CC BY 4.0, never the `/grib` endpoint. A missing or failed DMI answer is
 * "keine Daten" — never a stale or invented value.
 */

// --- Source --------------------------------------------------------------------------------------------------

export const DMI_HOST = 'https://opendataapi.dmi.dk';
export const DMI_NAME = 'Danmarks Meteorologiske Institut (DMI)';
export const DMI_LICENCE = 'CC BY 4.0';
export const DMI_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/deed.de';
export const DMI_TERMS_URL = 'https://www.dmi.dk/friedata/dokumentation/terms-of-use';
/** The source note per feature (Jan, 18.11.). */
export const DMI_CREDIT = `DMI, ${DMI_LICENCE}`;
/** DMI's own pages — linked, never quoted or summarised. */
export const DMI_WARN_URL = 'https://www.dmi.dk/varsler';
export const DMI_SEA_FORECAST_URL = 'https://www.dmi.dk/farvandsudsigter';
export const DMI_WATER_LEVEL_URL = 'https://www.dmi.dk/vandstand';

/** Storm surge model DKSS: the one water-level parameter, in metres ("Deviation of sea level from mean"). */
export const DMI_WL_PARAM = 'sea-mean-deviation';
/** DKSS sub-models that can serve a spot, finest first (grid spacing from the DMI documentation). */
export const DMI_WL_COLLECTIONS = Object.freeze(['dkss_lb', 'dkss_idw', 'dkss_ws', 'dkss_nsbs'] as const);
export type DmiWlCollection = typeof DMI_WL_COLLECTIONS[number];
export const DMI_WL_COLLECTION_LABEL: Readonly<Record<DmiWlCollection, string>> = Object.freeze({
  dkss_lb: 'DKSS Kleiner Belt (≈ 0,3 km)', dkss_idw: 'DKSS Innere dänische Gewässer (≈ 0,9 km)',
  dkss_ws: 'DKSS Wattenmeer (≈ 1,9 km)', dkss_nsbs: 'DKSS Nordsee–Ostsee (≈ 5,6 km)',
});
/**
 * The reference level is not named in DMI's documentation. Measured 18.11.2026 against the tide gauges' `sealev_dvr`
 * (cm above DVR90) over the common 7–8 hours of the run: DKSS − gauge = −0.6 … −3.5 cm at the gauges of the fine
 * sub-models (Bagenkop, Gedser, Fredericia, Esbjerg), −0.6 … −7.7 cm on the coarse North Sea grid (Slipshavn, Korsør,
 * Fredericia with its grid point 3 km away). Provenance `measured` — one evening, not a climatology (V-DK-2).
 */
export const DMI_WL_REFERENCE = 'Abweichung vom mittleren Wasserstand des Modells';
export const DMI_WL_REFERENCE_NOTE = 'Der Bezug ist das Mittelwasser des DMI-Modells; die Dokumentation des DMI nennt keinen Höhenbezug. An sechs dänischen Pegeln lag das Modell am 18.11.2026 im Mittel 1 bis 4 cm unter dem gemessenen Stand in DVR90, am groben Nordseegitter einmal 8 cm (eigene Messung über 8 Stunden) — das Mittelwasser liegt also nahe an DVR90, dem dänischen Höhenbezug.';

/** Weather model HARMONIE DINI (≈ 2 km), surface collection — wind where the point cube does not reach. */
export const DMI_WIND_COLLECTION = 'harmonie_dini_sf';
export const DMI_WIND_PARAMS = Object.freeze(['wind-speed-10m', 'gust-wind-speed-10m', 'wind-dir-10m'] as const);
export const DMI_WIND_LABEL = 'DMI HARMONIE';

/** metObs: 10-minute mean wind and direction, highest 3-second mean of the last 10 minutes. */
export const DMI_OBS_PARAMS = Object.freeze({ wind: 'wind_speed', dir: 'wind_dir', gust: 'wind_max' } as const);
/** A measurement older than this is not shown (`set`: six 10-minute values). */
export const DMI_OBS_MAX_AGE_MS = 60 * 60_000;

/** EDR position query at one point (CoverageJSON). `crs=crs84` ⇒ longitude first. */
export const dmiPositionUrl = (coll: string, lat: number, lon: number, params: readonly string[]): string =>
  `${DMI_HOST}/v1/forecastedr/collections/${coll}/position?coords=POINT(${lon}%20${lat})&crs=crs84&parameter-name=${params.join(',')}&f=CoverageJSON`;
/** The newest observations of one parameter at one metObs station since `fromMs` (newest first). */
export const dmiObsUrl = (stationId: string, parameterId: string, fromMs: number, limit = 6): string =>
  `${DMI_HOST}/v2/metObs/collections/observation/items?stationId=${encodeURIComponent(stationId)}&parameterId=${parameterId}&datetime=${new Date(fromMs).toISOString().slice(0, 19)}Z/..&limit=${limit}`;

// --- Catalogue block of a Danish spot ------------------------------------------------------------------------

/** A BSH gauge WITH a curve within this distance of the spot carries its water level (`set`, E-DK-2). */
export const DK_BSH_NEAR_KM = 20;
export const DK_FUSION_NOTE = 'Kalibrierung für Deutschland, in Dänemark nicht geprüft';
export const DK_NO_WARNING = 'Für diesen Spot gibt es hier keinen amtlichen Warnstatus: die Warnungen des Seewetterdienstes Hamburg gelten für die deutsche Küste. In Dänemark warnt das DMI.';

export type SeaSpotDkWl =
  | { from: 'bsh'; gauge: string; name: string; km: number }
  /** `lat`/`lon` = the point asked at DMI (a water point of the sub-model), `km` = its grid point's distance from the spot. */
  | { from: 'dmi'; coll: DmiWlCollection; lat: number; lon: number; km: number };
export interface SeaSpotDk {
  /** Does the point cube cover the spot's water cell (`CUBE_DOMAIN`, lat ≤ 55.5)? */
  cube: boolean;
  wind: 'fusion' | 'dmi';
  wl: SeaSpotDkWl | null;
}

export function dkBlockProblems(id: string, dk: unknown): string[] {
  const out: string[] = [];
  const d = dk as Partial<SeaSpotDk> | null;
  if (!d || typeof d !== 'object') return [`${id}: dk fehlt`];
  if (typeof d.cube !== 'boolean') out.push(`${id}: dk.cube`);
  if (d.wind !== 'fusion' && d.wind !== 'dmi') out.push(`${id}: dk.wind`);
  if (d.wind === 'fusion' && d.cube === false) out.push(`${id}: buscosun Fusion außerhalb des Cubes`);
  const w = d.wl;
  if (w != null) {
    if (w.from === 'bsh') { if (typeof w.gauge !== 'string' || !(w.km >= 0 && w.km <= DK_BSH_NEAR_KM)) out.push(`${id}: dk.wl BSH-Pegel ${w.gauge} ${w.km} km`); }
    else if (w.from === 'dmi') { if (!(DMI_WL_COLLECTIONS as readonly string[]).includes(w.coll) || !Number.isFinite(w.lat) || !Number.isFinite(w.lon) || !(w.km >= 0 && w.km <= 10)) out.push(`${id}: dk.wl DMI-Punkt ${w.coll} ${w.km} km`); }
    else out.push(`${id}: dk.wl.from`);
  }
  return out;
}

// --- CoverageJSON of an EDR position query -------------------------------------------------------------------

const H = 3_600_000;
const km = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
export const dmiDistKm = km;

export interface DmiCoverage {
  /** The grid point the service answered for. */
  lat: number; lon: number;
  /** Valid times (ms), ascending. */
  t: number[];
  values: Record<string, (number | null)[]>;
}
/** Why an answer is not a usable coverage — the producer writes this into `failed`. */
export class DmiAnswerError extends Error {}

/**
 * One EDR position answer → times, grid point and one column per asked parameter. Throws `DmiAnswerError` with the
 * reason for everything that is not a complete coverage: DMI's own error body (429 "Server is busy", 400), a missing
 * parameter, columns of another length than the time axis, times that are not ascending. `null` values stay `null`
 * (a point on land answers 200 with nothing but nulls — the caller decides what an empty column means).
 */
export function dmiCoverageOf(doc: unknown, params: readonly string[]): DmiCoverage {
  const d = doc as { type?: string; status?: number; error?: string; message?: string; domain?: { axes?: Record<string, { values?: unknown[] }> }; ranges?: Record<string, { values?: unknown[] }> } | null;
  if (!d || typeof d !== 'object') throw new DmiAnswerError('keine JSON-Antwort');
  if (d.type !== 'Coverage') throw new DmiAnswerError(typeof d.status === 'number' ? `DMI ${d.status}${d.error ? ` ${d.error}` : ''}${d.message ? `: ${d.message}` : ''}` : 'Antwort ist kein Coverage');
  const ax = d.domain?.axes;
  const x = Number(ax?.x?.values?.[0]), y = Number(ax?.y?.values?.[0]);
  const tv = ax?.t?.values;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Array.isArray(tv) || tv.length === 0) throw new DmiAnswerError('Coverage ohne Achsen');
  const t = tv.map((s) => (typeof s === 'string' ? Date.parse(s) : NaN));
  if (t.some((ms, i) => !Number.isFinite(ms) || (i > 0 && ms <= t[i - 1]))) throw new DmiAnswerError('Zeitachse nicht aufsteigend');
  const values: Record<string, (number | null)[]> = {};
  for (const p of params) {
    const v = d.ranges?.[p]?.values;
    if (!Array.isArray(v)) throw new DmiAnswerError(`Parameter ${p} fehlt in der Antwort`);
    if (v.length !== t.length) throw new DmiAnswerError(`Parameter ${p}: ${v.length} Werte bei ${t.length} Zeiten`);
    values[p] = v.map((q) => (typeof q === 'number' && Number.isFinite(q) ? q : null));
  }
  return { lat: y, lon: x, t, values };
}

/** A coverage on the whole hours from its first time on: `n` hourly slots, a time that is not on the hour is dropped. */
function hourly(c: DmiCoverage, param: string): { t0: number; col: (number | null)[] } {
  const t0 = Math.floor(c.t[0] / H) * H;
  const n = Math.round((c.t[c.t.length - 1] - t0) / H) + 1;
  const col = new Array<number | null>(n).fill(null);
  c.t.forEach((ms, k) => { const i = (ms - t0) / H; if (Number.isInteger(i) && i >= 0 && i < n) col[i] = c.values[param][k]; });
  return { t0, col };
}

// --- Product `sea/v1/dmi/<stamp>.json` -----------------------------------------------------------------------

export const SEA_DMI_PRODUCT = 'sea-dmi';
export const SEA_DMI_DIR = 'dmi';
/** `stamp` = build minute, UTC, `YYYYMMDDHHmm` — every file is written once and never changed. */
export const seaDmiPath = (stamp: string): string => `${SEA_DMI_DIR}/${stamp}.json`;
export const SEA_DMI_RE = /^(\d{12})\.json$/;
export const seaDmiStamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
/** Files kept in the store (the newest is the one `status.dmi` points to). */
export const SEA_DMI_KEPT = 3;
/** The producer asks DMI again when its last file is older than this (HARMONIE runs 3-hourly, DKSS 6-hourly). */
export const SEA_DMI_REFRESH_MS = 60 * 60_000;
/** A file older than this is not shown: two DKSS runs are missing then ("keine Daten", never an old curve as the forecast). */
export const SEA_DMI_STALE_MS = 12 * H;
/** Value lock: cm against the model's mean level; wind in 0.1 m/s like the spot series. */
export const DMI_WL_RANGE_CM: readonly [number, number] = [-500, 600];

export interface SeaDmiWl { coll: DmiWlCollection; lat: number; lon: number; km: number; t0: number; cm: (number | null)[] }
export interface SeaDmiWind { lat: number; lon: number; km: number; t0: number; wind: (number | null)[]; gust: (number | null)[]; dir: (number | null)[] }
export interface SeaDmiDoc {
  schema: 1; product: typeof SEA_DMI_PRODUCT; stamp: string; builtAt: string;
  source: string; licence: string; credit: string; terms: string;
  wl: { param: string; unit: 'cm'; reference: string; spots: Record<string, SeaDmiWl> };
  wind: { collection: string; unit: '0.1 m/s'; spots: Record<string, SeaDmiWind> };
  failed: { id: string; what: 'wl' | 'wind'; error: string }[];
}

/** DKSS answer → the stored water-level entry (cm, integer). Throws when the point carries no value at all (land). */
export function dmiWlEntry(doc: unknown, coll: DmiWlCollection, spot: { lat: number; lon: number }): SeaDmiWl {
  const c = dmiCoverageOf(doc, [DMI_WL_PARAM]);
  const { t0, col } = hourly(c, DMI_WL_PARAM);
  if (!col.some((x) => x != null)) throw new DmiAnswerError('kein Wert am Modellpunkt (Land im Modell)');
  return { coll, lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), km: +km(spot.lat, spot.lon, c.lat, c.lon).toFixed(2), t0, cm: col.map((m) => (m == null ? null : Math.round(m * 100))) };
}

/** HARMONIE answer → the stored wind entry (0.1 m/s, degrees). A gust below the wind is dropped like in the spot series. */
export function dmiWindEntry(doc: unknown, spot: { lat: number; lon: number }, gustBelowWind = 5): SeaDmiWind {
  const c = dmiCoverageOf(doc, DMI_WIND_PARAMS);
  const w = hourly(c, DMI_WIND_PARAMS[0]), g = hourly(c, DMI_WIND_PARAMS[1]), d = hourly(c, DMI_WIND_PARAMS[2]);
  if (!w.col.some((x) => x != null)) throw new DmiAnswerError('kein Windwert am Modellpunkt');
  const wind = w.col.map((x) => (x == null ? null : Math.round(x * 10)));
  const gust = g.col.map((x, i) => { if (x == null) return null; const q = Math.round(x * 10); return wind[i] != null && q + gustBelowWind < (wind[i] as number) ? null : q; });
  const dir = d.col.map((x, i) => (x == null || wind[i] == null ? null : ((Math.round(x) % 360) + 360) % 360));
  return { lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5), km: +km(spot.lat, spot.lon, c.lat, c.lon).toFixed(2), t0: w.t0, wind, gust, dir };
}

const intCol = (a: unknown, lo: number, hi: number): boolean => Array.isArray(a) && a.length > 0 && a.every((x) => x === null || (Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi));

/** Value lock of the product (producer before writing, client before display). */
export function seaDmiProblems(doc: unknown): string[] {
  const d = doc as Partial<SeaDmiDoc> | null;
  if (!d || d.product !== SEA_DMI_PRODUCT || d.schema !== 1) return ['kein sea-dmi-Dokument'];
  const out: string[] = [];
  if (typeof d.stamp !== 'string' || !/^\d{12}$/.test(d.stamp)) out.push('stamp');
  if (typeof d.builtAt !== 'string' || !Number.isFinite(Date.parse(d.builtAt))) out.push('builtAt');
  if (d.licence !== DMI_LICENCE) out.push(`licence ${String(d.licence)}`);
  for (const [id, s] of Object.entries(d.wl?.spots ?? {})) {
    if (!(DMI_WL_COLLECTIONS as readonly string[]).includes(s.coll)) out.push(`wl ${id}: Collection ${s.coll}`);
    if (!Number.isFinite(s.t0) || s.t0 % H !== 0) out.push(`wl ${id}: t0`);
    if (!intCol(s.cm, DMI_WL_RANGE_CM[0], DMI_WL_RANGE_CM[1])) out.push(`wl ${id}: Werte außerhalb ${DMI_WL_RANGE_CM.join(' … ')} cm`);
    else if (!s.cm.some((x) => x != null)) out.push(`wl ${id}: leer`);
  }
  for (const [id, s] of Object.entries(d.wind?.spots ?? {})) {
    if (!Number.isFinite(s.t0) || s.t0 % H !== 0) out.push(`wind ${id}: t0`);
    if (!intCol(s.wind, 0, 800) || !intCol(s.gust, 0, 800) || !intCol(s.dir, 0, 359)) { out.push(`wind ${id}: Werte außerhalb der Grenzen`); continue; }
    if (s.gust.length !== s.wind.length || s.dir.length !== s.wind.length) out.push(`wind ${id}: Spaltenlängen`);
    if (!s.wind.some((x) => x != null)) out.push(`wind ${id}: leer`);
    if (s.gust.some((g, i) => g != null && s.wind[i] != null && g + 5 < (s.wind[i] as number))) out.push(`wind ${id}: Böe unter Wind`);
  }
  if (!Array.isArray(d.failed)) out.push('failed');
  return out;
}

/** `status.json` → `dmi`: the newest file. Anything malformed counts as "none". */
export interface SeaDmiPointer { stamp: string; path: string; builtAt: string }
export function dmiPointerOf(status: Record<string, unknown> | null | undefined): SeaDmiPointer | null {
  const p = status?.dmi as Partial<SeaDmiPointer> | undefined;
  if (!p || typeof p.stamp !== 'string' || typeof p.path !== 'string' || typeof p.builtAt !== 'string') return null;
  return p.path === seaDmiPath(p.stamp) && Number.isFinite(Date.parse(p.builtAt)) ? { stamp: p.stamp, path: p.path, builtAt: p.builtAt } : null;
}
export const seaDmiStale = (builtAt: string, nowMs: number): boolean => !(nowMs - Date.parse(builtAt) <= SEA_DMI_STALE_MS);

// --- Reading the product on the page -------------------------------------------------------------------------

export interface DmiWlPoint { t: number; cm: number }
/** The stored water-level column as points (hours without a value are left out — never filled). */
export const dmiWlPoints = (e: SeaDmiWl): DmiWlPoint[] => e.cm.flatMap((cm, i) => (cm == null ? [] : [{ t: e.t0 + i * H, cm }]));
/** The value of the whole hour `tMs`, or `null` (no interpolation across a gap, nothing beyond the end). */
export function dmiWlAt(e: SeaDmiWl, tMs: number): number | null {
  const i = (Math.floor(tMs / H) * H - e.t0) / H;
  return Number.isInteger(i) && i >= 0 && i < e.cm.length ? e.cm[i] : null;
}
export const dmiWlEnd = (e: SeaDmiWl): number | null => { for (let i = e.cm.length - 1; i >= 0; i--) if (e.cm[i] != null) return e.t0 + i * H; return null; };

/** The wind entry on the hour axis of a wave run (`runMs`, `hours` slots), in m/s and degrees; hours DMI does not cover stay `null`. */
export function dmiWindOnAxis(e: SeaDmiWind, runMs: number, hours: number): { wind: (number | null)[]; gust: (number | null)[]; windDir: (number | null)[] } {
  const at = (col: (number | null)[], scale: number) => Array.from({ length: hours }, (_, i) => {
    const k = (runMs + i * H - e.t0) / H;
    const q = Number.isInteger(k) && k >= 0 && k < col.length ? col[k] : null;
    return q == null ? null : q / scale;
  });
  return { wind: at(e.wind, 10), gust: at(e.gust, 10), windDir: at(e.dir, 1) };
}

// --- metObs (live in the browser) ----------------------------------------------------------------------------

/** Newest observation of an `items` answer (FeatureCollection) not older than `DMI_OBS_MAX_AGE_MS`, or `null`. */
export function dmiObsLatest(doc: unknown, parameterId: string, nowMs: number): { t: number; value: number } | null {
  const f = (doc as { type?: string; features?: { properties?: { parameterId?: string; observed?: string; value?: unknown } }[] } | null);
  if (f?.type !== 'FeatureCollection' || !Array.isArray(f.features)) return null;
  let best: { t: number; value: number } | null = null;
  for (const x of f.features) {
    const p = x?.properties;
    if (!p || p.parameterId !== parameterId || typeof p.value !== 'number' || !Number.isFinite(p.value)) continue;
    const t = Date.parse(String(p.observed));
    if (!Number.isFinite(t) || t > nowMs + 10 * 60_000 || nowMs - t > DMI_OBS_MAX_AGE_MS) continue;
    if (!best || t > best.t) best = { t, value: p.value };
  }
  return best;
}
