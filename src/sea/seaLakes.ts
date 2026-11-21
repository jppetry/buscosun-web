/**
 * Phase BS — inland lakes on /seewetter: the contract (`audit/seewetter-binnenseen.md`). Import-free, like `seaDmi.ts`.
 *
 * Three things live in the data store, all of them new files — deleting `static/spots-lakes.json` restores the page of
 * before the phase (no lake spot, no lake producer run, nothing read):
 *
 *   static/spots-lakes.json     the lake catalogue: a table of the lakes and the lake spots (same spot shape as
 *                               `static/spots.json`, WITHOUT `cell`, with a `lake` block). Readers that do not know the
 *                               file — the page in production until the push, the wave producer always — see the coast only.
 *   static/lake-geo.json        producer only: terrain and roughness entries at every spot's water point, the height
 *                               set to the LAKE's surface elevation (not 0 as at sea)
 *   static/lakes.json           the lake outlines for the map (GeoJSON, simplified), with the credit of each source
 *   lakes/<run>-w<t1>.json      the series: wind, gust, direction, band `q`, hints `s` of buscosun Fusion per lake spot
 *                               on the hour axis of the published wave run `run`, computed with the cube run `t1`
 *   status.lakes                pointer to the newest of those files
 *
 * The lake spots never enter `spots/<run>.json`: the series of every coastal spot are byte-identical with and without
 * the lake catalogue (`verify:sea-lakes`, with a negative control).
 */

const H = 3_600_000;

// --- paths ---------------------------------------------------------------------------------------------------

export const SEA_SPOT_CATALOG_LAKES_PATH = 'static/spots-lakes.json';
export const SEA_LAKE_GEO_PATH = 'static/lake-geo.json';
export const SEA_LAKE_SHAPES_PATH = 'static/lakes.json';
export const SEA_LAKES_DIR = 'lakes';
export const seaLakesPath = (run: string, t1: string) => `${SEA_LAKES_DIR}/${run}-w${t1}.json`;
export const SEA_LAKES_RE = /^(\d{10})-w(\d{10})\.json$/;
export const SEA_LAKES_PRODUCT = 'sea-lakes-series';
/** Files kept in the store per wave run (the archive passes every 6 h and takes each of them). */
export const SEA_LAKES_KEPT_PER_RUN = 4;
/** The page shows nothing of a lake file whose computation is older than this ("keine Daten"). */
export const SEA_LAKES_STALE_MS = 12 * H;

// --- switches and fixed numbers ----------------------------------------------------------------------------

/**
 * `set` — the profile classes ("passt / knapp / über Grenze") stay OFF at lake spots: buscosun Fusion is not yet
 * checked on the water of these lakes. Jan decides after the wind check of step 0 has been repeated on 14 days of
 * archive (`audit/seewetter-binnenseen.md`, E-BS-2).
 */
export const LAKE_VERDICTS = false;

/** The plain gust hint (kn, `set`): 25 kn and 34 kn — the lower bounds of Beaufort 6 gusts by convention and of Beaufort 8. Not official. */
export const LAKE_GUST_HINT_KN = Object.freeze([25, 34] as const);
export const LAKE_GUST_HINT_NOTE = 'aus buscosun Fusion gerechnet, kein amtlicher Hinweis und keine Warnung';
const MS_TO_KN = 1.943844;
/** 0 = no hint · 1 = gusts from 25 kn · 2 = gusts from 34 kn; `null` without a gust value. */
export function lakeGustHint(gustMs: number | null | undefined): 0 | 1 | 2 | null {
  if (gustMs == null || !Number.isFinite(gustMs)) return null;
  const kn = gustMs * MS_TO_KN;
  return kn >= LAKE_GUST_HINT_KN[1] ? 2 : kn >= LAKE_GUST_HINT_KN[0] ? 1 : 0;
}
export const lakeGustHintText = (c: 0 | 1 | 2 | null): string | null => (c === 2 ? `Böen ab ${LAKE_GUST_HINT_KN[1]} kn` : c === 1 ? `Böen ab ${LAKE_GUST_HINT_KN[0]} kn` : null);

/** Words the page uses at every lake spot. */
export const LAKE_WAVE_LABEL = 'geschätzte Windwelle (eigene Rechnung)';
export const LAKE_NO_WARNING = 'Kein amtlicher Warnstatus im Datenbestand';
export const LAKE_VERDICT_OFF_SHORT = 'an Seen noch keine Einstufung';
export const LAKE_VERDICT_OFF_NOTE = 'Für Seen gibt es noch keine Einstufung nach Profil: der Wind von buscosun Fusion ist auf dem Wasser dieser Seen noch nicht geprüft.';
/** A shore outside DE/AT/CH (French, Italian, Hungarian side of a border lake): the nearest country's parameters, said at the value. */
export const lakeForeignNote = (shore: string, used: LakeLand): string =>
  `buscosun Fusion mit den Landesparametern für ${LAND_NAME[used]} gerechnet; am ${shore} Ufer nicht geprüft`;

// --- catalogue -------------------------------------------------------------------------------------------------

export type LakeLand = 'DE' | 'AT' | 'CH';
export const LAKE_LANDS: readonly LakeLand[] = ['DE', 'AT', 'CH'];
const LAND_NAME: Readonly<Record<LakeLand, string>> = Object.freeze({ DE: 'Deutschland', AT: 'Österreich', CH: 'die Schweiz' });
export type LakeOutlineSource = 'dlm250' | 'swisstopo' | 'euhydro';

/** A station of obs/v1 next to a lake spot (`id` as in `obs/v1/stations.json`: `de:02712`, `at:11035`, `ch:KLO`; `net` = its first network there). */
export interface LakeStation { id: string; name: string; km: number; lat: number; lon: number; elevM: number | null; dElevM?: number | null; net: string }
/** Where a water temperature or level is measured for a spot (live in the browser, never mixed with a model). */
export interface LakeWaterStation { net: 'wsv' | 'bafu'; id: string; name: string; km: number; lat: number; lon: number }

/** One lake of the catalogue's table. */
export interface SeaLake {
  id: string;
  name: string;
  /** Countries with a shore, ISO codes — also outside DE/AT/CH (FR, IT, HU). */
  lands: string[];
  /** Surface elevation (m above sea level), mean depth (m) and area (km²) with the page they were read from. */
  elevM: number; depthM: number; areaKm2: number; factsFrom: string; depthFrom?: string;
  /** Source and credit of the outline; `sha256` of the raw answer it was cut from and the area the outline itself has. */
  outline: { source: LakeOutlineSource; credit: string; sha256?: string; areaKm2?: number };
  /** Bounding box of the outline: west, south, east, north. */
  bbox: [number, number, number, number];
  /** DWD lake warning cells that cover this lake (ids 2…); empty = no official warning status in the data. */
  warncells: { id: string; name: string }[];
  /** The service responsible for warnings on this lake — linked, never read. */
  service: { name: string; url: string }[];
  /** Parameters for a shore outside DE/AT/CH: the nearest of the three countries per foreign land. */
  foreign?: Record<string, LakeLand>;
  /**
   * Water sources of the lake, only those with a clear licence and a documented interface: the WSV gauge at the lake
   * (PEGELONLINE, DL-DE Zero 2.0; `series` = what it delivers), the BAFU level stations (LINDAS, open use) and the keys of
   * the lake in the 1D model Simstrat of Alplakes (Eawag, CC BY 4.0 — read by the producer only).
   */
  water?: {
    wsv: { uuid: string; name: string; lat: number; lon: number; series: string[]; kmToLake: number } | null;
    bafu: { id: string; name: string; lat: number; lon: number }[];
    alp: string[];
  };
}

/** The `lake` block of a lake spot. */
export interface SeaSpotLake {
  /** Id of the lake in the catalogue's table. */
  id: string;
  /** The country the spot lies in. */
  land: LakeLand;
  /** The lake's surface elevation — the height buscosun Fusion computes at (instead of 0 at sea). */
  elevM: number;
  /** Mean depth of the lake and where the number comes from. */
  depthM: number; depthFrom: string;
  /** The water point buscosun Fusion is computed at (inside the outline, in front of the spot) and its distance. */
  pt: { lat: number; lon: number; km: number };
  /** Fetch in metres per 10° the wind comes FROM (index k = k·10°), each the mean of nine radials 3° apart (SPM 1984). */
  fetch: number[];
  /** DWD lake warning cell the spot lies in, or `null`. */
  warncell: { id: string; name: string } | null;
  stations: { wind: LakeStation | null; wt: LakeWaterStation | null; level: LakeWaterStation | null };
  /** The basin of the lake in the water temperature model (Alplakes Simstrat) — absent where the model has no such lake. */
  model?: { src: 'alplakes'; key: string };
  /** The country parameters buscosun Fusion is called with; `note` only on a shore outside DE/AT/CH. */
  fusion: { country: LakeLand; note?: string };
}

export const LAKE_PT_MAX_KM = 1.5;
const slug = (x: unknown): boolean => typeof x === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Catalogue rules of one lake spot (the generic fields are checked by `spotCatalogProblems`). */
export function lakeBlockProblems(id: string, spot: { lat: number; lon: number; normal?: number; cell?: unknown; coast?: unknown; wodlCoast?: unknown; seaArea?: unknown; region?: string }, l: SeaSpotLake | null | undefined): string[] {
  if (!l || typeof l !== 'object') return [`${id}: lake-Block fehlt`];
  const out: string[] = [];
  if (spot.region !== 'binnensee') out.push(`${id}: Region ${String(spot.region)} an einem Seespot`);
  if (spot.cell != null) out.push(`${id}: CWAM-Zelle an einem Seespot`);
  if (spot.coast != null || spot.wodlCoast != null || spot.seaArea != null) out.push(`${id}: Küstenabschnitt oder Seegebiet an einem Seespot`);
  if (!slug(l.id)) out.push(`${id}: Seekennung`);
  if (!LAKE_LANDS.includes(l.land)) out.push(`${id}: Land ${String(l.land)}`);
  if (!num(l.elevM) || l.elevM < -5 || l.elevM > 2500) out.push(`${id}: Seehöhe ${String(l.elevM)}`);
  if (!num(l.depthM) || l.depthM <= 0 || l.depthM > 400) out.push(`${id}: mittlere Tiefe ${String(l.depthM)}`);
  if (typeof l.depthFrom !== 'string' || !/^https:\/\//.test(l.depthFrom)) out.push(`${id}: mittlere Tiefe ohne Quelle`);
  if (!l.pt || !num(l.pt.lat) || !num(l.pt.lon) || !num(l.pt.km) || l.pt.km < 0 || l.pt.km > LAKE_PT_MAX_KM) out.push(`${id}: Wasserpunkt ${l.pt ? `${l.pt.km} km entfernt` : 'fehlt'}`);
  if (!Array.isArray(l.fetch) || l.fetch.length !== 36 || l.fetch.some((x) => !Number.isInteger(x) || x < 0 || x > 120_000)) out.push(`${id}: Fetch-Tabelle`);
  else if (!l.fetch.some((x) => x > 0)) out.push(`${id}: Fetch überall 0`);
  if (l.warncell != null && !/^2\d{8}$/.test(String(l.warncell.id))) out.push(`${id}: Warnzelle ${String(l.warncell.id)} ist keine Binnensee-Zelle`);
  if (!l.stations || typeof l.stations !== 'object') out.push(`${id}: stations fehlt`);
  else {
    const w = l.stations.wind;
    if (w != null && (!/^(de|at|ch):/.test(String(w.id)) || !num(w.km))) out.push(`${id}: Windstation ${String(w.id)}`);
    for (const k of ['wt', 'level'] as const) { const s = l.stations[k]; if (s != null && s.net !== 'wsv' && s.net !== 'bafu') out.push(`${id}: ${k}-Station aus einem Netz ohne klare Lizenz (${String(s.net)})`); }
  }
  if (l.model != null && (l.model.src !== 'alplakes' || !/^[a-z0-9_]+$/.test(String(l.model.key)))) out.push(`${id}: Modellschlüssel`);
  if (!l.fusion || !LAKE_LANDS.includes(l.fusion.country)) out.push(`${id}: Landesparameter ${String(l.fusion?.country)}`);
  else if (l.fusion.country !== l.land && !l.fusion.note) out.push(`${id}: fremde Landesparameter ohne Vermerk`);
  return out;
}

/** Rules of the lake table. */
export function lakeTableProblems(lakes: readonly SeaLake[] | null | undefined): string[] {
  if (!Array.isArray(lakes) || !lakes.length) return ['Seetabelle fehlt'];
  const out: string[] = [], ids = new Set<string>();
  for (const l of lakes) {
    const id = String(l?.id);
    if (!slug(l?.id)) out.push(`${id}: Kennung kein Slug`);
    if (ids.has(id)) out.push(`${id}: doppelt`);
    ids.add(id);
    if (!num(l.elevM) || !num(l.depthM) || l.depthM <= 0 || !num(l.areaKm2)) out.push(`${id}: Höhe, Tiefe oder Fläche`);
    if (typeof l.factsFrom !== 'string' || !/^https:\/\//.test(l.factsFrom)) out.push(`${id}: Angaben ohne Quelle`);
    if (!l.outline || !['dlm250', 'swisstopo', 'euhydro'].includes(l.outline.source) || !l.outline.credit) out.push(`${id}: Umriss ohne zugelassene Quelle`);
    if (!Array.isArray(l.bbox) || l.bbox.length !== 4 || !(l.bbox[0] < l.bbox[2] && l.bbox[1] < l.bbox[3])) out.push(`${id}: Rahmen`);
    if (!Array.isArray(l.warncells) || l.warncells.some((c: { id: string }) => !/^2\d{8}$/.test(String(c.id)))) out.push(`${id}: Warnzellen`);
    if (!Array.isArray(l.service) || !l.service.length || l.service.some((s: { url: string }) => !/^https:\/\//.test(String(s.url)))) out.push(`${id}: zuständiger Dienst fehlt`);
    for (const land of l.lands ?? []) if (!LAKE_LANDS.includes(land as LakeLand) && !l.foreign?.[land]) out.push(`${id}: Ufer ${land} ohne Landesparameter`);
  }
  return out;
}

/** Country parameters for a shore of `lake` in `land` — the land itself in DE/AT/CH, else the table's nearest country. */
export function lakeFusionCountry(lake: Pick<SeaLake, 'foreign'>, land: string): LakeLand | null {
  return LAKE_LANDS.includes(land as LakeLand) ? (land as LakeLand) : lake.foreign?.[land] ?? null;
}

// --- series product ----------------------------------------------------------------------------------------------

export interface SeaLakeSeriesRaw {
  v: { wind: (number | null)[]; gust: (number | null)[]; windDir: (number | null)[] };
  q?: unknown; s?: unknown; gustDropped?: number;
}
export interface SeaLakesDoc {
  schema: 1; product: typeof SEA_LAKES_PRODUCT;
  /** The published wave run whose hour axis the series lie on, and the cube run the wind was computed with. */
  run: string; runMs: number; t1: string;
  /** Hour index from which this computation's own values stand; before it the values of the run's earlier lake file (or null). */
  from: number; steps: number; builtAt: string;
  wind: { engine: string | null; version: number | null; stageCurrent?: boolean; computedAt: string; hoursFrom?: string; runs?: Record<string, string | null> | null; failed: { id: string; error: string }[] };
  quantiles?: unknown; sight?: unknown;
  spots: Record<string, SeaLakeSeriesRaw>;
}

const intCol = (a: unknown, n: number, lo: number, hi: number): boolean => Array.isArray(a) && a.length === n && a.every((x) => x === null || (Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi));

/** Value lock of one spot's wind columns (0.1 m/s, degrees) — the limits of the coastal series. */
export function lakeSeriesProblems(v: unknown, hours: number): string[] {
  const s = v as Partial<SeaLakeSeriesRaw['v']> | null;
  if (!s || typeof s !== 'object') return ['keine Spalten'];
  const out: string[] = [];
  if (!intCol(s.wind, hours, 0, 800)) out.push('wind außerhalb 0–80 m/s oder falsche Länge');
  if (!intCol(s.gust, hours, 0, 800)) out.push('gust außerhalb 0–80 m/s oder falsche Länge');
  if (!intCol(s.windDir, hours, 0, 359)) out.push('windDir außerhalb 0–359° oder falsche Länge');
  if (out.length) return out;
  if (!s.wind!.some((x) => x != null)) out.push('keine Stunde mit Wind');
  if (s.gust!.some((g, i) => g != null && s.wind![i] != null && g + 5 < (s.wind![i] as number))) out.push('Böe unter dem Wind');
  return out;
}

/** Value lock of the document's frame (the spots are checked one by one — a bad spot is dropped, not the file). */
export function seaLakesDocProblems(doc: unknown): string[] {
  const d = doc as Partial<SeaLakesDoc> | null;
  if (!d || d.product !== SEA_LAKES_PRODUCT || d.schema !== 1) return ['kein sea-lakes-series-Dokument'];
  const out: string[] = [];
  if (typeof d.run !== 'string' || !/^\d{10}$/.test(d.run)) out.push('run');
  if (typeof d.t1 !== 'string' || !/^\d{10}$/.test(d.t1)) out.push('t1');
  if (!num(d.runMs) || d.runMs % H !== 0) out.push('runMs');
  if (!Number.isInteger(d.steps) || (d.steps as number) < 1) out.push('steps');
  if (!Number.isInteger(d.from) || (d.from as number) < 0 || (d.from as number) >= (d.steps ?? 0)) out.push('from');
  if (typeof d.builtAt !== 'string' || !Number.isFinite(Date.parse(d.builtAt))) out.push('builtAt');
  if (!d.wind || typeof d.wind.engine !== 'string' || !Array.isArray(d.wind.failed)) out.push('wind');
  if (!d.spots || typeof d.spots !== 'object' || !Object.keys(d.spots).length) out.push('spots leer');
  return out;
}

/** `status.json` → `lakes`: the newest lake file. Anything malformed counts as "none". */
export interface SeaLakesPointer { run: string; t1: string; path: string; builtAt: string }
export function lakesPointerOf(status: Record<string, unknown> | null | undefined): SeaLakesPointer | null {
  const p = status?.lakes as Partial<SeaLakesPointer> | undefined;
  if (!p || typeof p.run !== 'string' || typeof p.t1 !== 'string' || typeof p.path !== 'string' || typeof p.builtAt !== 'string') return null;
  return p.path === seaLakesPath(p.run, p.t1) && Number.isFinite(Date.parse(p.builtAt)) ? { run: p.run, t1: p.t1, path: p.path, builtAt: p.builtAt } : null;
}
export const seaLakesStale = (builtAt: string, nowMs: number): boolean => !(nowMs - Date.parse(builtAt) <= SEA_LAKES_STALE_MS);

/**
 * Carries the hours before `from` over from the run's earlier file (same run only): a later computation starts at its
 * own hour, the hours behind it would otherwise be lost. Pure, on stored (encoded) columns; `prev` absent ⇒ unchanged.
 */
export function carryLakeColumn<T>(now: (T | null)[], prev: (T | null)[] | null | undefined, from: number): (T | null)[] {
  if (!Array.isArray(prev) || prev.length !== now.length) return now;
  return now.map((x, i) => (i < from ? prev[i] ?? null : x));
}

// --- DWD lake warnings (the CAP feed the warn layer reads) ----------------------------------------------------------

/**
 * DWD lake warning cells start with 2 (CAP profile: type 2 = Seen), measured 21.11.2026 in the cell list and in the
 * district feed (`Z_CAP_C_EDZW_LATEST_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip`), which carries them next to the districts.
 * Documented event codes for lakes: 57 STARKWIND, 58 STURM; the feed also names lake cells inside ordinary wind alerts
 * (51 WINDBÖEN) — an alert belongs to a lake by its CELL, not by its code.
 */
export const isLakeWarncell = (id: unknown): boolean => /^2\d{8}$/.test(String(id));
export const DWD_LAKE_WARN_CREDIT = 'Deutscher Wetterdienst, Warnungen für Binnenseen (CAP), im Wortlaut';

// --- measurement at a lake station (obs/v1, read in the browser) -----------------------------------------------------

/** A value older than this is not shown ("keine Messung") — never an older value in its place. */
export const LAKE_OBS_MAX_AGE_MS = 90 * 60_000;
/** Plausibility of a 10-minute wind and gust (m/s): outside it the value is dropped, a gust below the mean wind too. */
export const LAKE_OBS_LIMITS = Object.freeze({ ffMs: [0, 60] as const, fxMs: [0, 75] as const, gustBelowWind: 0.5 });
export interface LakeObs { t: number; ffMs: number | null; ddDeg: number | null; fxMs: number | null; dropped: string[] }
/**
 * Wind, direction and gust of one entry of `obs/v1/latest.json` (`v` at the stamp `t`, or the variable's own younger
 * value in `older`). `null` when neither wind nor gust is fresh and plausible; what was thrown away is named in `dropped`.
 */
export function lakeObsOf(entry: unknown, nowMs: number): LakeObs | null {
  const e = entry as { t?: string; v?: Record<string, number>; older?: Record<string, { v: number; t: string }> } | null | undefined;
  if (!e || typeof e !== 'object') return null;
  const dropped: string[] = [];
  const pick = (k: string): { v: number; ms: number } | null => {
    const at = e.v && typeof e.v[k] === 'number' ? { v: e.v[k], ms: Date.parse(String(e.t)) } : e.older?.[k] && typeof e.older[k].v === 'number' ? { v: e.older[k].v, ms: Date.parse(String(e.older[k].t)) } : null;
    if (!at || !Number.isFinite(at.v) || !Number.isFinite(at.ms)) return null;
    if (at.ms > nowMs + 10 * 60_000 || nowMs - at.ms > LAKE_OBS_MAX_AGE_MS) { dropped.push(`${k}: älter als ${LAKE_OBS_MAX_AGE_MS / 60_000} Minuten`); return null; }
    return at;
  };
  let ff = pick('ff'), fx = pick('fx');
  const dd = pick('dd');
  if (ff && (ff.v < LAKE_OBS_LIMITS.ffMs[0] || ff.v > LAKE_OBS_LIMITS.ffMs[1])) { dropped.push(`ff: ${ff.v} m/s außerhalb ${LAKE_OBS_LIMITS.ffMs.join('–')}`); ff = null; }
  if (fx && (fx.v < LAKE_OBS_LIMITS.fxMs[0] || fx.v > LAKE_OBS_LIMITS.fxMs[1])) { dropped.push(`fx: ${fx.v} m/s außerhalb ${LAKE_OBS_LIMITS.fxMs.join('–')}`); fx = null; }
  if (ff && fx && fx.v + LAKE_OBS_LIMITS.gustBelowWind < ff.v) { dropped.push(`fx: Böe ${fx.v} m/s unter dem Wind ${ff.v} m/s`); fx = null; }
  const lead = ff ?? fx;
  if (!lead) return null;
  const dir = dd && dd.v >= 0 && dd.v <= 360 ? dd.v % 360 : null;
  return { t: lead.ms, ffMs: ff?.v ?? null, ddDeg: ff && dir != null ? dir : null, fxMs: fx?.v ?? null, dropped };
}

// --- water temperature of the lakes: model (Alplakes, producer only) ---------------------------------------------

/**
 * Alplakes (Eawag): 1D model Simstrat, one basin per request. Measured 21.11.2026 (`lake-probe.mjs`): the API answers a
 * browser of a foreign origin with "Disallowed CORS origin" (allow-list) ⇒ the producer reads it, never the page; the
 * docs license the data under CC BY 4.0 with the attribution below, ask for a descriptive User-Agent and name HTTP 429
 * as the throttle. The answer carries 3-hourly values; in-situ data of third parties is NOT part of what is read here.
 */
export const ALPLAKES = Object.freeze({
  base: 'https://alplakes-api.eawag.ch',
  model: 'Alplakes (Eawag), 1D-Modell Simstrat',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Data: Alplakes, Eawag (CC BY 4.0)',
  page: 'https://www.alplakes.eawag.ch',
  depthM: 1,
  pauseMs: 1500,
  /** Hours read behind and ahead of now. */
  backH: 24, aheadH: 96,
});
export const SEA_LAKES_WT_PRODUCT = 'sea-lakes-watertemp';
export const seaLakesWtPath = (stamp: string) => `${SEA_LAKES_DIR}/wt-${stamp}.json`;
export const SEA_LAKES_WT_RE = /^wt-(\d{12})\.json$/;
/** The model is updated once a day; the producer asks at most this often (the API asks clients not to poll). */
export const SEA_LAKES_WT_EVERY_MS = 6 * H;
export const SEA_LAKES_WT_KEPT = 3;
/** A file older than this is not shown ("keine Daten"). */
export const SEA_LAKES_WT_STALE_MS = 36 * H;
/** Value lock (°C, `set`): a lake surface between freezing and a hot shallow summer day. */
export const LAKE_WT_RANGE_C = Object.freeze([-0.5, 35] as const);

const stampOf = (ms: number): string => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
/** The request of one basin: 3-hourly temperature at `ALPLAKES.depthM` from yesterday to four days ahead. */
export const alplakesPointUrl = (key: string, nowMs: number): string =>
  `${ALPLAKES.base}/simulations/1d/point/simstrat/${encodeURIComponent(key)}/${stampOf(Math.floor(nowMs / H) * H - ALPLAKES.backH * H)}/${stampOf(Math.floor(nowMs / H) * H + ALPLAKES.aheadH * H)}/${ALPLAKES.depthM}?variables=T`;

/** One basin as it is stored: full hours since the epoch and the temperature in 0.1 °C (`null` = no value). */
export interface LakeWtBasin { h: number[]; c: (number | null)[] }
/** An Alplakes answer → the stored basin, or the reason it is not one (a string). Values outside the lock are `null`. */
export function alplakesBasinOf(answer: unknown): LakeWtBasin | string {
  const a = answer as { time?: unknown; variables?: Record<string, { data?: unknown; unit?: unknown }> } | null;
  if (!a || !Array.isArray(a.time)) return 'Antwort ohne Zeitachse';
  const col = a.variables?.T ?? a.variables?.temperature;
  if (!col || !Array.isArray(col.data) || col.data.length !== a.time.length) return 'Antwort ohne Temperaturspalte in der Länge der Zeitachse';
  if (col.unit !== 'degC') return `Einheit ${String(col.unit)} statt degC`;
  const h: number[] = [], c: (number | null)[] = [];
  a.time.forEach((t, i) => {
    const ms = Date.parse(String(t));
    if (!Number.isFinite(ms)) return;
    const x = (col.data as unknown[])[i];
    h.push(Math.round(ms / H));
    c.push(typeof x === 'number' && Number.isFinite(x) && x >= LAKE_WT_RANGE_C[0] && x <= LAKE_WT_RANGE_C[1] ? Math.round(x * 10) : null);
  });
  if (!h.length) return 'Zeitachse nicht lesbar';
  if (!c.some((x) => x != null)) return 'kein Wert innerhalb der Wertsperre';
  for (let i = 1; i < h.length; i++) if (h[i] <= h[i - 1]) return 'Zeitachse nicht aufsteigend';
  return { h, c };
}

export interface SeaLakesWtDoc {
  schema: 1; product: typeof SEA_LAKES_WT_PRODUCT; stamp: string; builtAt: string; source: string; licence: string; credit: string; depthM: number;
  basins: Record<string, LakeWtBasin>; failed: { key: string; error: string }[];
}
/** Value lock of the product (producer before writing, client before display). */
export function lakesWtProblems(doc: unknown): string[] {
  const d = doc as Partial<SeaLakesWtDoc> | null;
  if (!d || d.product !== SEA_LAKES_WT_PRODUCT || d.schema !== 1) return ['kein sea-lakes-watertemp-Dokument'];
  const out: string[] = [];
  if (typeof d.stamp !== 'string' || !/^\d{12}$/.test(d.stamp)) out.push('stamp');
  if (typeof d.builtAt !== 'string' || !Number.isFinite(Date.parse(d.builtAt))) out.push('builtAt');
  if (d.licence !== ALPLAKES.licence || d.credit !== ALPLAKES.credit) out.push(`Lizenz oder Nennung (${String(d.licence)})`);
  if (!Array.isArray(d.failed)) out.push('failed');
  const lo = Math.round(LAKE_WT_RANGE_C[0] * 10), hi = Math.round(LAKE_WT_RANGE_C[1] * 10);
  for (const [key, b] of Object.entries(d.basins ?? {})) {
    if (!/^[a-z0-9_]+$/.test(key)) out.push(`${key}: Schlüssel`);
    if (!Array.isArray(b?.h) || !Array.isArray(b?.c) || b.h.length !== b.c.length || !b.h.length) { out.push(`${key}: Spalten`); continue; }
    if (b.h.some((x, i) => !Number.isInteger(x) || (i > 0 && x <= b.h[i - 1]))) out.push(`${key}: Zeitachse`);
    if (b.c.some((x) => x !== null && (!Number.isInteger(x) || x < lo || x > hi))) out.push(`${key}: Wert außerhalb ${LAKE_WT_RANGE_C.join(' … ')} °C`);
    else if (!b.c.some((x) => x != null)) out.push(`${key}: leer`);
  }
  if (!Object.keys(d.basins ?? {}).length) out.push('kein Becken');
  return out;
}
export interface SeaLakesWtPointer { stamp: string; path: string; builtAt: string }
export function lakesWtPointerOf(status: Record<string, unknown> | null | undefined): SeaLakesWtPointer | null {
  const p = status?.lakesWt as Partial<SeaLakesWtPointer> | undefined;
  if (!p || typeof p.stamp !== 'string' || typeof p.path !== 'string' || typeof p.builtAt !== 'string') return null;
  return p.path === seaLakesWtPath(p.stamp) && Number.isFinite(Date.parse(p.builtAt)) ? { stamp: p.stamp, path: p.path, builtAt: p.builtAt } : null;
}
export const seaLakesWtStale = (builtAt: string, nowMs: number): boolean => !(nowMs - Date.parse(builtAt) <= SEA_LAKES_WT_STALE_MS);
/** The model value (°C) nearest to `tMs`, at most 1.5 h away (the model's step is 3 h) — `null` beyond the series, never extrapolated. */
export function lakeWtAt(b: LakeWtBasin | null | undefined, tMs: number): number | null {
  if (!b) return null;
  let best: number | null = null, bd = Infinity;
  b.h.forEach((x, i) => { const d = Math.abs(x * H - tMs); if (b.c[i] != null && d < bd) { bd = d; best = (b.c[i] as number) / 10; } });
  return bd <= 1.5 * H ? best : null;
}
/** The stored basin as points (hours without a value left out). */
export const lakeWtPoints = (b: LakeWtBasin): { t: number; c: number }[] => b.h.flatMap((x, i) => (b.c[i] == null ? [] : [{ t: x * H, c: (b.c[i] as number) / 10 }]));

// --- water level and measured water temperature (read live in the browser) -----------------------------------------

/** WSV PEGELONLINE (DL-DE Zero 2.0, CORS open): the newest value of one series of one gauge. */
export const WSV_BASE = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
export const WSV_CREDIT = 'WSV, PEGELONLINE (Datenlizenz Deutschland – Zero – 2.0), Rohwert';
export const WSV_PAGE = 'https://www.pegelonline.wsv.de';
export const wsvCurrentUrl = (uuid: string, series: 'W' | 'WT'): string => `${WSV_BASE}/stations/${encodeURIComponent(uuid)}/${series}/currentmeasurement.json`;
/** A measured value older than this is not shown as "now" ("keine Messung"). */
export const LAKE_WATER_MAX_AGE_MS = 3 * H;
export interface LakeWaterObs { t: number; value: number }
/** `currentmeasurement.json` → value and stamp, or `null` (malformed, stale, outside `range`). */
export function wsvCurrentOf(answer: unknown, nowMs: number, range: readonly [number, number]): LakeWaterObs | null {
  const a = answer as { timestamp?: unknown; value?: unknown } | null;
  const t = Date.parse(String(a?.timestamp)), v = a?.value;
  if (!Number.isFinite(t) || typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (t > nowMs + 15 * 60_000 || nowMs - t > LAKE_WATER_MAX_AGE_MS) return null;
  return v >= range[0] && v <= range[1] ? { t, value: v } : null;
}
/** Value locks (`set`): level in cm above gauge zero, water temperature in °C. */
export const WSV_W_RANGE_CM = Object.freeze([-200, 1500] as const);
export const WSV_WT_RANGE_C = Object.freeze([-0.5, 35] as const);

/** BAFU hydrological data over LINDAS (open use, CORS echoes the origin): the lake stations with their level in m above sea level. */
export const BAFU_SPARQL = 'https://lindas.admin.ch/query';
export const BAFU_CREDIT = 'Bundesamt für Umwelt BAFU, hydrologische Daten (LINDAS)';
export const BAFU_PAGE = 'https://www.hydrodaten.admin.ch';
export const BAFU_LAKE_QUERY = `PREFIX schema: <http://schema.org/>
PREFIX dim: <https://environment.ld.admin.ch/foen/hydro/dimension/>
PREFIX cube: <https://cube.link/>
SELECT ?id ?time ?level
FROM <https://lindas.admin.ch/foen/hydro>
WHERE {
  <https://environment.ld.admin.ch/foen/hydro/lake/observation/> cube:observation ?obs .
  ?obs dim:station ?st ; dim:measurementTime ?time ; dim:waterLevel ?level .
  ?st schema:identifier ?id .
}`;
/** Value lock (`set`): a lake level between sea level and the highest lake of the list. */
export const BAFU_LEVEL_RANGE_M = Object.freeze([0, 2500] as const);
/** A SPARQL JSON answer → level per station id (m above sea level), stale or implausible rows left out. */
export function bafuLevelsOf(answer: unknown, nowMs: number): Record<string, LakeWaterObs> {
  const rows = (answer as { results?: { bindings?: Array<Record<string, { value?: string }>> } } | null)?.results?.bindings;
  const out: Record<string, LakeWaterObs> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const id = r?.id?.value, t = Date.parse(String(r?.time?.value)), v = Number(r?.level?.value);
    if (!id || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (t > nowMs + 15 * 60_000 || nowMs - t > LAKE_WATER_MAX_AGE_MS || v < BAFU_LEVEL_RANGE_M[0] || v > BAFU_LEVEL_RANGE_M[1]) continue;
    if (!out[id] || t > out[id].t) out[id] = { t, value: v };
  }
  return out;
}
/** Sources that are linked only — no clear licence or no documented interface (the contract rejects them as stations). */
export const LAKE_LINK_ONLY = Object.freeze([
  { name: 'Gewässerkundlicher Dienst Bayern', url: 'https://www.gkd.bayern.de', lakes: ['chiemsee', 'starnberger-see', 'ammersee'], what: 'Wasserstand und Wassertemperatur' },
  { name: 'Hydrographischer Dienst Oberösterreich', url: 'https://hydro.ooe.gv.at', lakes: ['attersee', 'traunsee'], what: 'Wasserstand und Wassertemperatur' },
  { name: 'Wasserportal Burgenland', url: 'https://wasser.bgld.gv.at', lakes: ['neusiedler-see'], what: 'Wasserstand und Wassertemperatur' },
]);
