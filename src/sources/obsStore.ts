/**
 * obsStore.ts — the reader of `buscosun-data/obs/v1` (phase OF, `audit/obs-fusion.md` §5.1): every CURRENT station
 * measurement of the DACH networks from ONE mirror product (phase OB, `scripts/obs/obs-mirror.mjs`) instead of the
 * providers — BrightSky `current_weather` (DE, 20–22 requests per point), GeoSphere TAWES `current` (AT), MeteoSwiss
 * `t_now` files (CH, one per station). Two files, both read with a deadline and a hedge between the two ways to the
 * data repo (pattern V-FI-5 / NL, `store.ts`):
 *
 *   stations.json   the catalogue (id `de:03379` / `at:11035` / `ch:SMA`, name, lat, lon, elev, country, networks, vars) —
 *                   changes rarely (catalogue refresh every 6 h) ⇒ jsDelivr first (cached at the edge), raw as the hedge
 *   latest.json     the newest values per station (`t` = stamp UTC, end of the 10-min interval; `v` = values in the fixed
 *                   units of the product: °C, %, m/s, °, mm per 10 min; `rr1h`/`rr24h` sums with completeness; `day` for
 *                   the daily gauges) — republished every few minutes and PURGED at the CDN by the mirror ⇒ almost always
 *                   a MISS there (measured 08.10.2026: TTFB 0,47 s MISS against 0,36 s raw with a 5-min cache) ⇒ raw
 *                   first, jsDelivr as the hedge; never `@main` alone (it resolves up to ≈ 3 min late, CLAUDE.md)
 *
 * Pure parts (the verifier `verify:obs-reader` checks them without the net): the mapping of one station to the
 * `ForecastHourPoint` the three old adapters produced (same formulas: u = −ff·sin dd, v = −ff·cos dd, gust m/s,
 * precipitation = rr per 10 min × 6 = mm/h, stamp = the measurement time), the choice of the nearest stations of a country
 * (today's semantics: full stations with a 10-min stamp; the dense set of OF-2 adds the precipitation-only gauges), the
 * 1×N grids of the raster fusion and the station features of the map.
 *
 * Nothing here decides whether the store is used — `sampleSources.ts` (`?obs=direct`, `CubeIo.obsStore`) does, with the
 * direct adapters as the named fallback on error or an empty answer.
 */
import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

export const OBS_SCHEMA = 1;
export const OBS_DIR = 'obs/v1';
export const OBS_CDN_BASE = `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/${OBS_DIR}`;
export const OBS_RAW_BASE = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/${OBS_DIR}`;
export const OBS_CATALOG_PATH = 'stations.json';
export const OBS_LATEST_PATH = 'latest.json';
/** After this the second way starts (p95 of the measured cold MISS TTFB at jsDelivr — `RAW_FALLBACK_HEDGE_MS`). */
export const OBS_HEDGE_MS = 2_500;
/** Hard deadline of one read (both ways). */
export const OBS_DEADLINE_MS = 8_000;
/** `latest.json` is kept this long in memory (the mirror republishes every few minutes; a point query repeats within seconds). */
export const OBS_LATEST_MEMO_MS = 120_000;
export const OBS_CATALOG_MEMO_MS = 6 * 3_600_000;
/** A 10-min value older than this is not a current measurement (the anchor's history window, `ANCHOR_HISTORY_H` = 6 h). set. */
export const OBS_MAX_AGE_MS = 6 * 3_600_000;
/**
 * The point's own station (the hint from the station product, a MOSMIX/WMO id) is the obs station standing within this
 * distance — the catalogue carries no WMO ids (V-OF-1), so the place decides. set; tighter than the client's
 * `SELECTION.stationAtPointKm` would need (0,25 km) is not necessary: two stations of one network never stand that close.
 */
export const OBS_SAME_SITE_KM = 0.3;
/** OF-2 (`CubeIo.obsDense`): how many stations the dense set carries (today's readers: 6). */
export const OBS_DENSE_MAX = 12;

export interface ObsStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  country: string;
  region?: string;
  networks: string[];
  vars: string[];
}
export interface ObsCatalog { schema: 1; kind: 'obs/stations'; builtAt: string; count: number; stations: ObsStation[] }
export interface ObsSum { mm: number; n: number; of: number; complete: boolean }
export interface ObsLatestEntry {
  /** Newest 10-min stamp of the station (UTC, end of the interval); absent for a daily-only gauge. */
  t?: string;
  src?: string;
  /** Values at `t` in the fixed units of the product (`t` °C, `td` °C, `rh` %, `ps`/`p` hPa, `ff` m/s, `dd` °, `fx` m/s, `rr` mm/10 min, `sd` min, `gr` W/m², `snow` cm). */
  v?: Record<string, number>;
  /** A variable missing at `t`: its newest value within 60 min, with its own stamp. */
  older?: Record<string, { v: number; t: string }>;
  rr1h?: ObsSum;
  rr24h?: ObsSum;
  day?: { date: string; src: string; rr?: number; snow?: number; nsnow?: number };
}
export interface ObsLatest { schema: 1; kind: 'obs/latest'; builtAt: string; count: number; stations: Record<string, ObsLatestEntry> }
export interface ObsStore { catalog: ObsCatalog; latest: ObsLatest; byId: Map<string, ObsStation>; fetchedAt: number }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function parseObsCatalog(j: unknown): ObsCatalog | null {
  const o = j as Partial<ObsCatalog> | null;
  if (!o || o.schema !== OBS_SCHEMA || o.kind !== 'obs/stations' || !Array.isArray(o.stations)) return null;
  const stations = o.stations.filter((s): s is ObsStation => !!s && typeof s.id === 'string' && isNum(s.lat) && isNum(s.lon) && typeof s.country === 'string');
  return { schema: 1, kind: 'obs/stations', builtAt: String(o.builtAt ?? ''), count: stations.length, stations: stations.map((s) => ({ ...s, name: typeof s.name === 'string' ? s.name : s.id, elev: isNum(s.elev) ? s.elev : 0, networks: Array.isArray(s.networks) ? s.networks : [], vars: Array.isArray(s.vars) ? s.vars : [] })) };
}

export function parseObsLatest(j: unknown): ObsLatest | null {
  const o = j as Partial<ObsLatest> | null;
  if (!o || o.schema !== OBS_SCHEMA || o.kind !== 'obs/latest' || !o.stations || typeof o.stations !== 'object') return null;
  return { schema: 1, kind: 'obs/latest', builtAt: String(o.builtAt ?? ''), count: Object.keys(o.stations).length, stations: o.stations as Record<string, ObsLatestEntry> };
}

export function obsStoreOf(catalog: ObsCatalog, latest: ObsLatest, fetchedAt = Date.now()): ObsStore {
  return { catalog, latest, byId: new Map(catalog.stations.map((s) => [s.id, s])), fetchedAt };
}

// ---------------------------------------------------------------------------
// Network: one JSON file, two ways, hedge, deadline
// ---------------------------------------------------------------------------

export interface ObsFetchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  hedgeMs?: number;
  timeoutMs?: number;
  /** Named events: the hedge fired, a way failed, which way answered. */
  onNote?: (note: string) => void;
}

class ObsNotThere extends Error { constructor(msg: string) { super(msg); this.name = 'ObsNotThere'; } }
const abortError = (reason?: unknown): Error => (reason instanceof Error ? reason : new DOMException('aborted', 'AbortError'));

/**
 * One file of the product: `primary` way first, the other after `hedgeMs` (or at once when the first way fails); the first
 * `200` wins and the loser is aborted. Rejects with the primary's error when both fail, with an AbortError on `signal`,
 * with a timeout error after `timeoutMs`. Pure in its decisions (the verifier drives it with a fake `fetchImpl`).
 */
export function fetchObsJson(path: string, primary: 'raw' | 'cdn', opts: ObsFetchOptions = {}): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const hedgeMs = opts.hedgeMs ?? OBS_HEDGE_MS;
  const timeoutMs = opts.timeoutMs ?? OBS_DEADLINE_MS;
  const ways: Array<{ name: 'raw' | 'cdn'; url: string }> = primary === 'raw'
    ? [{ name: 'raw', url: `${OBS_RAW_BASE}/${path}` }, { name: 'cdn', url: `${OBS_CDN_BASE}/${path}` }]
    : [{ name: 'cdn', url: `${OBS_CDN_BASE}/${path}` }, { name: 'raw', url: `${OBS_RAW_BASE}/${path}` }];
  const acs = ways.map(() => new AbortController());
  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const started = [false, false];
    const errors: Array<unknown> = [null, null];
    let hedge: ReturnType<typeof setTimeout> | null = null;
    const deadline = setTimeout(() => finish(() => reject(new Error(`obs: Frist ${timeoutMs} ms für ${path}`))), timeoutMs);
    const onAbort = () => finish(() => reject(abortError(opts.signal?.reason)));
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      if (hedge) clearTimeout(hedge);
      clearTimeout(deadline);
      opts.signal?.removeEventListener('abort', onAbort);
      for (const ac of acs) ac.abort();
      fn();
    }
    const failed = () => {
      if (settled) return;
      if (!started[1]) { start(1); return; }
      if (errors[0] != null && errors[1] != null) finish(() => reject(errors[0]));
    };
    function start(i: number) {
      if (started[i] || settled) return;
      started[i] = true;
      if (i === 1 && hedge) { clearTimeout(hedge); hedge = null; }
      f(ways[i].url, { signal: acs[i].signal, cache: 'no-cache' }).then(
        (res) => {
          if (settled) return;
          if (res.ok) {
            res.json().then((j) => finish(() => { opts.onNote?.(`obs: ${path} über ${ways[i].name}`); resolve(j); }), (e) => { errors[i] = e; opts.onNote?.(`obs: ${ways[i].name} ${path}: ${String((e as Error)?.message ?? e)}`); failed(); });
            return;
          }
          errors[i] = res.status === 404 || res.status === 403 ? new ObsNotThere(`${res.status} ${ways[i].url}`) : new Error(`${res.status} ${ways[i].url}`);
          opts.onNote?.(`obs: ${ways[i].name} ${path}: HTTP ${res.status}`);
          failed();
        },
        (e) => {
          if (settled || acs[i].signal.aborted) return;
          errors[i] = e;
          opts.onNote?.(`obs: ${ways[i].name} ${path}: ${String((e as Error)?.message ?? e)}`);
          failed();
        },
      );
    }
    if (opts.signal) {
      if (opts.signal.aborted) { onAbort(); return; }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    start(0);
    if (hedgeMs > 0) hedge = setTimeout(() => { if (!started[1]) { opts.onNote?.(`obs: Hedge ${hedgeMs} ms für ${path} — ${ways[1].name} gestartet`); start(1); } }, hedgeMs);
    else start(1);
  });
}

interface Memo<T> { at: number; p: Promise<T> }
const memo: { catalog: Memo<ObsCatalog> | null; latest: Memo<ObsLatest> | null } = { catalog: null, latest: null };
/** Verifier: forget the memoised files. */
export function resetObsMemo(): void { memo.catalog = null; memo.latest = null; }

/** Waits for a shared promise, but gives up on the caller's signal (the shared fetch goes on for the next caller). */
function withSignal<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then((v) => { signal.removeEventListener('abort', onAbort); resolve(v); }, (e) => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

function memoised<T>(key: 'catalog' | 'latest', ttlMs: number, make: () => Promise<T>, nowMs: number): Promise<T> {
  const slot = memo as unknown as Record<string, Memo<T> | null>;
  const m = slot[key];
  if (m && nowMs - m.at < ttlMs) return m.p;
  const p = make();
  slot[key] = { at: nowMs, p };
  p.catch(() => { if (slot[key]?.p === p) slot[key] = null; });
  return p;
}

export interface ObsLoadOptions extends ObsFetchOptions { nowMs?: number }

export function loadObsCatalog(opts: ObsLoadOptions = {}): Promise<ObsCatalog> {
  const { signal, ...rest } = opts;
  return withSignal(memoised('catalog', OBS_CATALOG_MEMO_MS, async () => {
    const c = parseObsCatalog(await fetchObsJson(OBS_CATALOG_PATH, 'cdn', rest));
    if (!c) throw new Error(`obs: ${OBS_CATALOG_PATH} hat nicht die Form obs/stations Schema ${OBS_SCHEMA}`);
    return c;
  }, opts.nowMs ?? Date.now()), signal);
}

export function loadObsLatest(opts: ObsLoadOptions = {}): Promise<ObsLatest> {
  const { signal, ...rest } = opts;
  return withSignal(memoised('latest', OBS_LATEST_MEMO_MS, async () => {
    const l = parseObsLatest(await fetchObsJson(OBS_LATEST_PATH, 'raw', rest));
    if (!l) throw new Error(`obs: ${OBS_LATEST_PATH} hat nicht die Form obs/latest Schema ${OBS_SCHEMA}`);
    return l;
  }, opts.nowMs ?? Date.now()), signal);
}

/** Catalogue and newest values together (two requests at most; both memoised). */
export async function loadObsStore(opts: ObsLoadOptions = {}): Promise<ObsStore> {
  const [catalog, latest] = await Promise.all([loadObsCatalog(opts), loadObsLatest(opts)]);
  return obsStoreOf(catalog, latest, opts.nowMs ?? Date.now());
}

// ---------------------------------------------------------------------------
// Pure: one station → the point the old adapters produced
// ---------------------------------------------------------------------------

/** The `model` tag of the old adapters per country (LI is read with the Swiss network). */
export const obsModelOf = (country: string): 'dwd_obs' | 'tawes' | 'smn' => (country === 'DE' ? 'dwd_obs' : country === 'AT' ? 'tawes' : 'smn');
/** The operator's id behind the product id: `de:03379` → `03379` (DWD id), `at:11035` → `11035` (TAWES = synop id), `ch:SMA` → `SMA`. */
export const obsStationIdOf = (id: string): string => id.slice(id.indexOf(':') + 1);
/** Which product country a query country reads (the Swiss network carries Liechtenstein). */
export const obsCountriesOf = (country: string): readonly string[] => (country === 'CH' ? ['CH', 'LI'] : [country]);

export type ObsPoint = ForecastHourPoint & { stationName: string; stationId: string; timestamp: Date };

export function windComponentsOf(ff: number | null | undefined, dd: number | null | undefined): { u: number | null; v: number | null } {
  if (ff == null || dd == null || !Number.isFinite(ff) || !Number.isFinite(dd)) return { u: null, v: null };
  const rad = (dd * Math.PI) / 180;
  return { u: -ff * Math.sin(rad), v: -ff * Math.cos(rad) };
}

/**
 * The station's newest 10-min values as a `ForecastHourPoint` — the form `brightSkyCurrent.ts pointFor`, `geosphereTawes.ts`
 * and `meteoSwissSmn.ts rowToPoint` emit: T °C, u/v m/s, gust m/s, RH %, precipitation = rr (mm/10 min) × 6, no clouds,
 * the station's own lat/lng/elev, the stamp as `timestamp`. `null` for a daily-only gauge (no 10-min stamp) or a bad stamp.
 * Only the values AT the newest stamp are used (`older` values of other stamps are not mixed in — one stamp per station).
 */
export function obsPointOf(st: ObsStation, e: ObsLatestEntry | undefined): ObsPoint | null {
  if (!e?.t) return null;
  const ms = Date.parse(e.t);
  if (!Number.isFinite(ms)) return null;
  const v = e.v ?? {};
  const num = (k: string): number | null => (isNum(v[k]) ? v[k] : null);
  const { u, v: vv } = windComponentsOf(num('ff'), num('dd'));
  const rr = num('rr');
  return {
    temperature: num('t'), u, v: vv, gust: num('fx'), relativeHumidity: num('rh'),
    cloudLow: null, cloudMid: null, cloudHigh: null,
    precipitation: rr != null ? rr * 6 : null,
    model: obsModelOf(st.country), lat: st.lat, lng: st.lon, elev: st.elev,
    stationName: st.name, stationId: obsStationIdOf(st.id), timestamp: new Date(ms),
  };
}

/** A „full" station in the sense of today's readers: at least one of T, wind, gust, humidity at the stamp (precipitation-only gauges are not). */
export const obsFullPoint = (p: ForecastHourPoint): boolean => p.temperature != null || p.u != null || p.gust != null || p.relativeHumidity != null;

const EARTH_R = 6_371_000;
export function obsDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** The shape `fetchNearestStationObs` returns (`sampleSources.ts NearestStationObs`, kept structurally identical here to avoid a cycle). */
export interface ObsNearestStation {
  source: string;
  name: string;
  stationId: string;
  byStation?: boolean;
  lat: number;
  lng: number;
  elevation: number;
  distanceMeters: number;
  point: ForecastHourPoint;
  /** OF-1: where the measurement came from (`obs` = the mirror product; the direct adapters set nothing). */
  via?: 'obs';
  /** OF-2 (`dense` only): the measured dew point and the gauge values at the stamp — the engine's `CubeObs.dewPoint/rr10/rr1h`. */
  obs?: { td: number | null; rr10: number | null; rr1h: { mm: number; complete: boolean } | null } | null;
}

export interface ObsNearestOptions {
  max: number;
  nowMs?: number;
  /** Stamps older than this are not current (default `OBS_MAX_AGE_MS`). */
  maxAgeMs?: number;
  /** The station of the station product at the point (MOSMIX): the obs station at the same place is marked `byStation`. */
  station?: { id: string; lat: number; lon: number } | null;
  /** OF-2: also the precipitation-only gauges (for the gauge options of the engine). */
  dense?: boolean;
}

/**
 * The `max` stations of a country nearest to the point, ascending by distance — today's semantics of the three adapters
 * combined: a station counts when it has a 10-min stamp not older than `maxAgeMs` and (without `dense`) at least one of
 * T, wind, gust, humidity. One entry per station (the product has one). `byStation` = the station product's station
 * stands at this obs station (≤ `OBS_SAME_SITE_KM`). Pure.
 */
export function nearestObsStations(store: ObsStore, lat: number, lon: number, country: string, o: ObsNearestOptions): ObsNearestStation[] {
  const nowMs = o.nowMs ?? Date.now();
  const maxAge = o.maxAgeMs ?? OBS_MAX_AGE_MS;
  const countries = obsCountriesOf(country);
  const out: ObsNearestStation[] = [];
  for (const st of store.catalog.stations) {
    if (!countries.includes(st.country)) continue;
    const p = obsPointOf(st, store.latest.stations[st.id]);
    if (!p) continue;
    const age = nowMs - p.timestamp.getTime();
    if (age > maxAge) continue;
    if (!o.dense && !obsFullPoint(p)) continue;
    if (o.dense && !obsFullPoint(p) && p.precipitation == null) continue;
    const byStation = !!o.station && obsDistanceM(o.station.lat, o.station.lon, st.lat, st.lon) <= OBS_SAME_SITE_KM * 1000;
    const e = store.latest.stations[st.id];
    const extra = o.dense ? { obs: { td: isNum(e?.v?.td) ? (e!.v!.td as number) : null, rr10: isNum(e?.v?.rr) ? (e!.v!.rr as number) : null, rr1h: e?.rr1h && isNum(e.rr1h.mm) ? { mm: e.rr1h.mm, complete: !!e.rr1h.complete } : null } } : {};
    out.push({ source: p.model, name: st.name, stationId: p.stationId, ...(byStation ? { byStation: true } : {}), lat: st.lat, lng: st.lon, elevation: st.elev, distanceMeters: obsDistanceM(lat, lon, st.lat, st.lon), point: p, via: 'obs', ...extra });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters || a.stationId.localeCompare(b.stationId));
  return out.slice(0, Math.max(0, o.max));
}

/** The nearest stations of a point from the live product (two memoised requests at most). */
export async function fetchObsNearest(lat: number, lon: number, country: string, o: ObsNearestOptions & ObsLoadOptions): Promise<ObsNearestStation[]> {
  const store = await loadObsStore(o);
  return nearestObsStations(store, lat, lon, country, o);
}

// ---------------------------------------------------------------------------
// Pure: the 1×N grid of the raster fusion and the station features of the map
// ---------------------------------------------------------------------------

const BOUNDS: Record<string, ForecastBounds> = {
  DE: { lngMin: 5.8, lngMax: 15.1, latMin: 47.2, latMax: 55.1 },
  AT: { lngMin: 9, lngMax: 17, latMin: 46, latMax: 49 },
  CH: { lngMin: 6.0, lngMax: 10.5, latMin: 45.8, latMax: 47.8 },
};

/**
 * The „now" frame of one country as the old grid adapters built it: one `ForecastHourPoint` per full station with its own
 * lat/lng/elev (the raster fusion ignores cols/rows for sources with overrides). Pure.
 */
export function obsGridOf(store: ObsStore, country: string, nowMs = Date.now(), maxAgeMs = OBS_MAX_AGE_MS): ForecastGrid {
  const countries = obsCountriesOf(country);
  const points: ForecastHourPoint[] = [];
  for (const st of store.catalog.stations) {
    if (!countries.includes(st.country)) continue;
    const p = obsPointOf(st, store.latest.stations[st.id]);
    if (!p || nowMs - p.timestamp.getTime() > maxAgeMs || !obsFullPoint(p)) continue;
    points.push(p);
  }
  return { cols: points.length || 1, rows: 1, bounds: BOUNDS[country] ?? BOUNDS.DE, times: [new Date(nowMs)], points: [points], fetchedAt: nowMs };
}

export async function fetchObsGrid(country: string, o: ObsLoadOptions = {}): Promise<ForecastGrid> {
  const store = await loadObsStore(o);
  return obsGridOf(store, country, o.nowMs ?? Date.now());
}

export interface ObsStationFeatureProps {
  source: 'dwd_obs' | 'tawes' | 'smn';
  name: string;
  elevation: number;
  dwdStationId?: string;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation: number | null;
  cloudCover: number | null;
}

/**
 * The station features of the map (`dachStations.ts` form) from the product: every station with a 10-min stamp not older
 * than `maxAgeMs`, WITH its values (DE no longer lazy). Cloud cover is not in the product (the DWD 10-min files carry none;
 * BrightSky took it from the synop reports — E-OF-1). Pure.
 */
export function obsStationFeatures(store: ObsStore, nowMs = Date.now(), maxAgeMs = OBS_MAX_AGE_MS): Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: ObsStationFeatureProps }> {
  const out: Array<{ type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: ObsStationFeatureProps }> = [];
  for (const st of store.catalog.stations) {
    const p = obsPointOf(st, store.latest.stations[st.id]);
    if (!p || nowMs - p.timestamp.getTime() > maxAgeMs) continue;
    const v = store.latest.stations[st.id]?.v ?? {};
    out.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [st.lon, st.lat] },
      properties: {
        source: obsModelOf(st.country), name: st.name, elevation: Math.round(st.elev), ...(st.country === 'DE' ? { dwdStationId: p.stationId } : {}),
        temperature: p.temperature, windSpeed: isNum(v.ff) ? v.ff : null, windDirection: isNum(v.dd) ? v.dd : null, precipitation: p.precipitation, cloudCover: null,
      },
    });
  }
  return out;
}

/** The popup values of one DWD station (`fetchDwdStationLive` form) from the product; `null` when it has no current 10-min values. */
export function obsStationLive(store: ObsStore, dwdStationId: string): Pick<ObsStationFeatureProps, 'temperature' | 'windSpeed' | 'windDirection' | 'precipitation' | 'cloudCover'> | null {
  const st = store.byId.get(`de:${dwdStationId}`);
  const p = st ? obsPointOf(st, store.latest.stations[st.id]) : null;
  if (!st || !p) return null;
  const v = store.latest.stations[st.id]?.v ?? {};
  return { temperature: p.temperature, windSpeed: isNum(v.ff) ? v.ff : null, windDirection: isNum(v.dd) ? v.dd : null, precipitation: p.precipitation, cloudCover: null };
}
