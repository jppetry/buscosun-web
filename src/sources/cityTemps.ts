/**
 * cityTemps.ts — the city temperatures of the map labels as ONE small file of the data repo (`buscosun-data/citytemp/v1/`).
 *
 * The labels used to sample the ICON-D2 t_2m grid with a height picture built from 90 Terrarium tiles (≈ 4.5 MB from S3,
 * HTTP/1.1) — loaded on every start of the Wetterkarte and of the dashboard's map tile, whether or not the temperature
 * layer was on. The producer (`scripts/citytemp/city-temps.mjs`) computes buscosun Fusion (the newest stand of the
 * register) at every city of `DACH_CITIES`, hourly values +0 … +48 h, and writes them into one file; the map reads that
 * file and loads the grid only when the temperature layer, the snow line or the basemap's own places (zoom ≥ 8.2) need it.
 *
 * Contract (one file for producer and client — pure, no DOM, no network except `loadCityTemps`):
 *   citytemp/v1/latest.json      the newest run (mutable ⇒ read via raw.githubusercontent, never jsDelivr `@main`)
 *   citytemp/v1/static/geo.json  terrain/roughness cache entries of the cities, producer only
 *
 * `?ct=0` is the named fallback: the labels sample the grid exactly as before. A file that is missing, unreadable or
 * older than `CITY_TEMPS_MAX_AGE_MS` counts as not there — same fallback, by itself.
 */

const H = 3_600_000;

export const CITY_TEMPS_DIR = 'citytemp/v1';
export const CITY_TEMPS_FILE = 'latest.json';
export const CITY_TEMPS_GEO_PATH = 'static/geo.json';
export const CITY_TEMPS_URL = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/${CITY_TEMPS_DIR}/${CITY_TEMPS_FILE}`;
/** Hourly steps +0 … +48 h from the run hour. */
export const CITY_TEMPS_STEPS = 49;
/** A run older than this is not shown (the producer runs twice an hour; three hours cover a stalled schedule). */
export const CITY_TEMPS_MAX_AGE_MS = 3 * H;
/** Fewer cities with a value than this ⇒ the file counts as degraded (the guard of the grid path). */
export const CITY_TEMPS_MIN_CITIES = 8;
/** The map asks again this often. */
export const CITY_TEMPS_REFRESH_MS = 15 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const MEMO_MS = 5 * 60_000;

export interface CityTemps {
  schema: 1;
  product: 'citytemp';
  issuedAt: string;
  /** Start of the run hour (UTC ms) = step 0. */
  t0Ms: number;
  steps: number;
  /** The stand the file was BUILT with (E-FR-1). */
  engine: { name: string; version: number; anchored?: number; runs?: Record<string, string | null> };
  /** City name (`DACH_CITIES`) → temperature per step in 0.1 °C (integer), null = no value. */
  cities: Record<string, (number | null)[]>;
}

export function makeCityTemps(p: { issuedAtMs: number; t0Ms: number; engine: CityTemps['engine']; cities: Record<string, (number | null)[]> }): CityTemps {
  return { schema: 1, product: 'citytemp', issuedAt: new Date(p.issuedAtMs).toISOString(), t0Ms: p.t0Ms, steps: CITY_TEMPS_STEPS, engine: p.engine, cities: p.cities };
}

/** 0.1 °C integer of a temperature, null when not finite. */
export const cityTempCode = (t: number | null | undefined): number | null => (t == null || !Number.isFinite(t) ? null : Math.round(t * 10));

/** null for a foreign or broken file. */
export function parseCityTemps(j: unknown): CityTemps | null {
  if (!j || typeof j !== 'object') return null;
  const d = j as Partial<CityTemps>;
  if (d.schema !== 1 || d.product !== 'citytemp') return null;
  if (typeof d.issuedAt !== 'string' || !Number.isFinite(Date.parse(d.issuedAt)) || !Number.isFinite(d.t0Ms)) return null;
  if (!Number.isInteger(d.steps) || (d.steps as number) < 1 || !d.cities || typeof d.cities !== 'object') return null;
  if (!d.engine || typeof d.engine.name !== 'string') return null;
  let n = 0;
  for (const s of Object.values(d.cities)) {
    if (!Array.isArray(s) || s.length !== d.steps) return null;
    if (s.some((v) => v != null)) n++;
  }
  return n >= CITY_TEMPS_MIN_CITIES ? (d as CityTemps) : null;
}

export function cityTempsFresh(d: CityTemps, nowMs: number): boolean {
  return nowMs - Date.parse(d.issuedAt) <= CITY_TEMPS_MAX_AGE_MS;
}

/**
 * °C of a city at `targetMs`, linear between the two hourly steps. Up to 3 h before the run hour (the radar look-back of
 * the slider) the first step stands in; beyond the last step, or for a city the file does not carry: null.
 */
export function cityTempAt(d: CityTemps, name: string, targetMs: number): number | null {
  const s = d.cities[name];
  if (!s) return null;
  const x = (targetMs - d.t0Ms) / H;
  if (!(x >= -3) || x > d.steps - 1) return null;
  const xc = Math.max(0, x);
  const i = Math.floor(xc), f = xc - i;
  const a = s[i], b = s[Math.min(d.steps - 1, i + 1)];
  if (a == null && b == null) return null;
  if (a == null) return (b as number) / 10;
  if (b == null) return a / 10;
  return (a + (b - a) * f) / 10;
}

/** `?ct=0` switches the product off (exact match). */
export function cityTempsEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('ct') !== '0'; } catch { return true; }
}
/** Read once at module load — before the Wetterkarte rewrites its URL. */
export const CITY_TEMPS_ON = cityTempsEnabledFrom(typeof location !== 'undefined' ? location.search : '');

let memo: { at: number; p: Promise<CityTemps | null> } | null = null;

/** The newest run, or null (missing, unreadable, stale, timeout). Memoised for a few minutes; a failure is asked again. */
export function loadCityTemps(nowMs: number = Date.now()): Promise<CityTemps | null> {
  if (memo && nowMs - memo.at < MEMO_MS) return memo.p;
  const p = (async (): Promise<CityTemps | null> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(CITY_TEMPS_URL, { signal: ac.signal, cache: 'no-cache' });
      if (!res.ok) return null;
      const d = parseCityTemps(await res.json());
      return d && cityTempsFresh(d, Date.now()) ? d : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  memo = { at: nowMs, p };
  void p.then((d) => { if (!d && memo?.p === p) memo = null; });
  return p;
}
