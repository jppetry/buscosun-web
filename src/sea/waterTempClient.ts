/**
 * Phase WT — reads of the water temperature (`audit/seewetter-wassertemperatur.md`), kept out of `seaClient.ts` so the
 * route wrapper's early start stays as small as it was (pattern `waterLevelClient.ts`).
 *
 *   catalogue   `sea/v1/static/watertemp.json` (model point and station per spot) — missing or of another form ⇒ `null`,
 *               and the page shows no water temperature at all (the phase's fallback)
 *   model       the file `status.wtemp` points to — checked, or the reason there is none
 *   measurement live from the station's own service (WSV PEGELONLINE or DMI, CORS open at both): one read per station,
 *               kept `WT_OBS_CACHE_MS` in memory
 *   record      `wtemp-daily.json` of our own archive (`buscosun-archiv`, raw) — unreadable ⇒ `null` (no record shown)
 *   season      `sea/v1/static/wtemp-season.json` — the course of the year at the few stations with five full years
 *
 * Nothing here falls back from one source to another.
 */
import { fetchSea, SeaNotThere } from './seaClient';
import {
  SEA_WT_CATALOG_PATH, SEA_WT_DAILY_URL, SEA_WT_PRODUCT, SEA_WT_SEASON_PATH, SEA_WT_SEASON_PRODUCT, seaWtProblems, wtCatalogOf, wtObsOf, wtObsUrl,
  type SeaWtDoc, type SeaWtPointer, type WtCatalog, type WtStation,
} from './seaWaterTemp';
import { WT_WHY, type WtModelLoad, type WtObsLoad } from './waterTemp';

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

let catalogCache: WtCatalog | null = null;
/** The catalogue, cached for the page's life once it was read well. */
export async function loadWtCatalog(signal?: AbortSignal): Promise<WtCatalog | null> {
  if (catalogCache) return catalogCache;
  try {
    const cat = wtCatalogOf(await fetchSea(SEA_WT_CATALOG_PATH, 'json', signal));
    if (cat) catalogCache = cat;
    return cat;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

/** The model file — per entry the page still checks the value lock and the age of its run (`wtModelViewOf`). */
export async function loadWaterTemp(ptr: SeaWtPointer | null, signal?: AbortSignal): Promise<WtModelLoad> {
  if (!ptr) return { doc: null, state: 'none', why: WT_WHY.noFile };
  try {
    const j = await fetchSea(ptr.path, 'json', signal) as SeaWtDoc;
    // The document frame must hold; a single entry outside the value lock only takes that spot out (checked per spot).
    const frame = seaWtProblems({ ...j, spots: {} });
    if (j?.product !== SEA_WT_PRODUCT || j.stamp !== ptr.stamp || frame.length || !j.spots || typeof j.spots !== 'object') return { doc: null, state: 'error', why: WT_WHY.unreadable };
    return { doc: j, state: 'ok', why: null };
  } catch (e) {
    if (isAbort(e)) throw e;
    return { doc: null, state: e instanceof SeaNotThere ? 'none' : 'error', why: e instanceof SeaNotThere ? WT_WHY.noFile : WT_WHY.net };
  }
}

/** A station's series is asked again after this long (`set`: PEGELONLINE measures every minute, DMI every ten). */
export const WT_OBS_CACHE_MS = 10 * 60_000;
const obsCache = new Map<string, { at: number; load: WtObsLoad }>();
/**
 * The measured series of one station over the last days, straight from its service. An answer that is not the
 * service's series, an HTTP error or a network failure is "nicht lesbar" (`points: null`) — never an older series.
 */
export async function loadWtObs(st: WtStation, nowMs: number, signal?: AbortSignal): Promise<WtObsLoad> {
  const hit = obsCache.get(st.key);
  if (hit && nowMs - hit.at < WT_OBS_CACHE_MS && hit.load.points) return hit.load;
  let load: WtObsLoad;
  try {
    const res = await fetch(wtObsUrl(st, nowMs), { signal });
    const s = res.ok ? wtObsOf(st.net, await res.json()) : null;
    load = s ? { points: s.points, state: 'ok' } : { points: null, state: 'error' };
  } catch (e) {
    if (isAbort(e)) throw e;
    load = { points: null, state: 'error' };
  }
  obsCache.set(st.key, { at: nowMs, load });
  return load;
}

let seasonCache: unknown | null = null;
/**
 * The season curves of the stations at which a source delivers five full years (`static/wtemp-season.json`, built once).
 * Missing or unreadable ⇒ `null`: no season curve is shown anywhere, the record "Verlauf seit" stays.
 */
export async function loadWtSeason(signal?: AbortSignal): Promise<unknown | null> {
  if (seasonCache) return seasonCache;
  try {
    const doc = await fetchSea(SEA_WT_SEASON_PATH, 'json', signal);
    if ((doc as { product?: string } | null)?.product === SEA_WT_SEASON_PRODUCT) seasonCache = doc;
    return seasonCache;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

let dailyCache: { at: number; doc: unknown } | null = null;
/** Our own daily record of all stations (one file, raw from the archive repo); `null` when it is not readable. */
export async function loadWtDaily(nowMs: number, signal?: AbortSignal): Promise<unknown | null> {
  if (dailyCache && nowMs - dailyCache.at < 60 * 60_000) return dailyCache.doc;
  try {
    const res = await fetch(SEA_WT_DAILY_URL, { signal });
    if (!res.ok) return null;
    const doc = await res.json() as unknown;
    dailyCache = { at: nowMs, doc };
    return doc;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}
