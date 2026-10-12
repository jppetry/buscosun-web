/**
 * WL-3 — Client reader of the water level line (`audit/wasserstand-bsh.md` §6). Two ways, as decided in
 * E-WL-2:
 *
 *   catalogue  `sea/v1/static/gauges.json` through `fetchSea` — jsDelivr with the raw hedge, the same path
 *              every other static file of the line takes
 *   forecast   live from the official BSH OGC API, one request per chosen gauge (1,5–10 KB gz, 0,2 s
 *              measured), nothing else (E-WL-3)
 *
 * Caching (E-WL-4): a memory cache per gauge with a 10 min TTL plus in-flight de-duplication, so clicking
 * back and forth between spots costs nothing; `cache: 'default'` lets the browser revalidate against the
 * `ETag` the service sends. No IndexedDB — the model curve was 13 min old when measured, so a value carried
 * across sessions would be stale before it is read.
 */
import { fetchSea, SeaNotThere } from './seaClient';
import {
  WL_CATALOG_PATH, WL_CATALOG_PRODUCT, WL_SERVICE, wlCatalogProblems, wlForecastOf, wlItemUrl,
  type WlCatalog, type WlForecast, type WlGauge,
} from './waterLevel';

/** The catalogue is not in the data repo yet (before Jan's copy) — a named gap, not a failure. */
export class WlCatalogMissing extends Error {}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

// --- Catalogue ---------------------------------------------------------------------------------

export interface WlCatalogResult { gauges: WlGauge[]; builtAt: string | null; problems: string[] }

let catalogCache: WlCatalogResult | null = null;

/**
 * The mirrored gauge positions. `null` = readable but unusable (wrong product), throws `WlCatalogMissing`
 * when the file is simply not there yet — the UI then says so instead of showing an empty map layer.
 */
export async function loadGaugeCatalog(signal?: AbortSignal): Promise<WlCatalogResult | null> {
  if (catalogCache) return catalogCache;
  let j: Partial<WlCatalog>;
  try {
    j = await fetchSea(WL_CATALOG_PATH, 'json', signal) as Partial<WlCatalog>;
  } catch (e) {
    if (isAbort(e)) throw e;
    if (e instanceof SeaNotThere) throw new WlCatalogMissing(String(e.message));
    return null;
  }
  if (j?.product !== WL_CATALOG_PRODUCT || !Array.isArray(j.gauges)) return null;
  const problems = wlCatalogProblems(j.gauges);
  const bad = new Set(problems.map((p) => p.split(':')[0]));
  const out: WlCatalogResult = {
    gauges: j.gauges.filter((g) => g?.id && !bad.has(g.id)),
    builtAt: typeof j.builtAt === 'string' ? j.builtAt : null,
    problems,
  };
  catalogCache = out;
  return out;
}

// --- Forecast of one gauge ---------------------------------------------------------------------

/** E-WL-4: how long a read forecast is reused before the API is asked again. */
export const WL_TTL_MS = 10 * 60_000;

interface Entry { at: number; doc: WlForecast }
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<WlForecast | null>>();

/** Testing seam: the verifier hands in its own fetch and clock instead of hitting the live service. */
export interface WlIo { fetch?: typeof fetch; now?: () => number }
let io: WlIo = {};
export function setWlIo(next: WlIo): void { io = next; }
const nowMs = () => (io.now ? io.now() : Date.now());
const doFetch: typeof fetch = (...a) => (io.fetch ?? fetch)(...a);

/** Drops the memory cache (used by the verifier and when the page is left). */
export function clearWlCache(): void { cache.clear(); inFlight.clear(); catalogCache = null; }

/**
 * The live forecast of one gauge from the official API. `null` = answered but not usable,
 * `SeaNotThere` = unknown gauge (404). Anything else throws, so the UI can name the failure instead of
 * showing an empty curve.
 */
export async function loadGaugeForecast(id: string, signal?: AbortSignal): Promise<WlForecast | null> {
  const hit = cache.get(id);
  if (hit && nowMs() - hit.at < WL_TTL_MS) return hit.doc;
  const running = inFlight.get(id);
  if (running) return running;

  const run = (async () => {
    const res = await doFetch(wlItemUrl(id), { signal, cache: 'default' });
    if (!res.ok) {
      if (res.status === 404) throw new SeaNotThere(`404 ${id}`);
      throw new Error(`${res.status} ${WL_SERVICE}`);
    }
    const doc = wlForecastOf(await res.json(), nowMs());
    if (doc) cache.set(id, { at: nowMs(), doc });
    return doc;
  })();

  inFlight.set(id, run);
  try {
    return await run;
  } finally {
    inFlight.delete(id);
  }
}

/** What is already in the cache, without asking (first paint of a re-visited gauge). */
export const cachedGaugeForecast = (id: string): WlForecast | null => {
  const hit = cache.get(id);
  return hit && nowMs() - hit.at < WL_TTL_MS ? hit.doc : null;
};
