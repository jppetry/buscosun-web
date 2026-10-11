/**
 * GL-1 — Data client of the glacier page: `index.json` raw-first (fresh pointer), every immutable static file CDN-first with
 * `raw.githubusercontent.com` as the hedge (pattern `fetchSea`, V-FI-5 / NL-2), every document through the contract's rules
 * before it reaches the page, results memoised per build for the session.
 *
 * Verification against the local data repo: `?glbase=http://127.0.0.1:<port>/v1` replaces both bases — loopback hosts only, so a
 * link can never make the page read "official" numbers from somewhere else.
 */
import {
  GLACIER_CDN_BASE, GLACIER_RAW_BASE, GLACIER_INDEX_PATH, GLACIER_STATUS_PATH, GLACIER_BUILD_RE, GLACIER_CATALOG_FILE, GLACIER_POINTS_FILE,
  GLACIER_OFFICIAL_FILE, GLACIER_SOURCES_FILE, glacierStaticPath, glacierOutlineFile, glacierEpochFile, glacierHypsoFile, glacierSeriesFile,
  glacierProjFile, catalogProblems, officialProblems,
  type GlacierCatalog, type GlacierCatalogEntry, type GlacierOfficialItem, type GlacierSeries,
} from './glacierContract';
import { glacierSeasonPath, seasonProblems, climaProblems, type GlacierSeasonDoc, type GlacierSeasonRow, type GlacierSatCatalogRow } from './glacierSatContract';
import { glacierMeltRunPath, meltProblems, type GlacierMeltDoc } from './glacierMeltContract';
import type { GlacierDemGrid } from './glacierSatContract';
import { feedProblems, glacierFeedPath, previousWeekKey, type GlacierFeedDoc, type GlacierFeedEvent } from './glacierFeedContract';

export interface GlacierBases { cdn: string; raw: string }

/** Loopback-only override of the data base (`?glbase=`). */
export function glacierBasesFrom(search: string = typeof location !== 'undefined' ? location.search : ''): GlacierBases {
  try {
    const v = new URLSearchParams(search).get('glbase');
    if (v) {
      const u = new URL(v);
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && (u.protocol === 'http:' || u.protocol === 'https:')) {
        const base = v.replace(/\/+$/, '');
        return { cdn: base, raw: base };
      }
    }
  } catch { /* broken query = default */ }
  return { cdn: GLACIER_CDN_BASE, raw: GLACIER_RAW_BASE };
}

/** "Does not exist" (404, or 403 on both ways) — distinct from a hard failure. */
export class GlacierNotThere extends Error {}
export const GLACIER_RAW_HEDGE_MS = 2_500;
const abortError = (signal: AbortSignal): unknown => signal.reason ?? new DOMException('Aborted', 'AbortError');

/**
 * One file of `v1/`: the first source, after 2.5 s (or on 403/404/5xx/network) the second; a 404 on the first is checked once on
 * the second. `first = 'raw'` for the pointer (`index.json`, `status.json`: never a 12-hour-old CDN node), `'cdn'` for the rest.
 */
export function fetchGlacier(path: string, kind: 'json' | 'bytes', signal?: AbortSignal, bases: GlacierBases = glacierBasesFrom(), first: 'cdn' | 'raw' = 'cdn'): Promise<unknown> {
  const a = `${first === 'cdn' ? bases.cdn : bases.raw}/${path}`, b = `${first === 'cdn' ? bases.raw : bases.cdn}/${path}`;
  const same = a === b;
  const acA = new AbortController(), acB = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false, bStarted = false;
    let errA: unknown = null, errB: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => { acA.abort(); acB.abort(); finish(() => reject(abortError(signal!))); };
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    }
    const nt = (e: unknown) => e instanceof GlacierNotThere;
    const failed = () => {
      if (!errA || (bStarted && !errB)) return;
      if (!bStarted) { finish(() => reject(errA)); return; }
      finish(() => reject(nt(errA) && nt(errB) ? errA : nt(errA) ? errB : errA));
    };
    const take = (res: Response, loser: AbortController) => {
      loser.abort();
      (kind === 'json' ? res.json() : res.arrayBuffer().then((x) => new Uint8Array(x))).then((j) => finish(() => resolve(j)), (e) => finish(() => reject(e)));
    };
    const startB = () => {
      if (bStarted || settled || same) return;
      bStarted = true;
      fetch(b, { signal: acB.signal }).then(
        (res) => { if (settled) return; if (res.ok) { take(res, acA); return; } errB = res.status === 404 || res.status === 403 ? new GlacierNotThere(`${res.status} ${b}`) : new Error(`${res.status} ${b}`); failed(); },
        (e) => { if (!settled) { errB = e; failed(); } },
      );
    };
    if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort, { once: true }); }
    timer = same ? null : setTimeout(() => { timer = null; startB(); }, GLACIER_RAW_HEDGE_MS);
    fetch(a, { signal: acA.signal, ...(first === 'raw' ? { cache: 'no-store' as const } : {}) }).then(
      (res) => {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (res.ok) { take(res, acB); return; }
        errA = res.status === 403 || res.status === 404 ? new GlacierNotThere(`${res.status} ${a}`) : new Error(`${res.status} ${a}`);
        startB(); failed();
      },
      (e) => { if (settled) return; if (timer) { clearTimeout(timer); timer = null; } errA = e; startB(); failed(); },
    );
  });
}
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

// --- Documents ----------------------------------------------------------------------------------------------

export interface GlacierIndex {
  schema: 1;
  kind: 'glacier/index';
  builtAt: string;
  static: { build: string };
  /** Satellite line (GL-2): newest scene per tile and, per year and region, the stand of the season document. */
  sat?: GlacierSatIndex;
  /** Melt line (GL-3): pointer to the newest run. */
  melt?: GlacierMeltPointer;
  /** Feed line (GL-5): pointer to the newest week document. */
  feed?: GlacierFeedPointer;
}
export interface GlacierMeltPointer { run: string; runAt: string; engine: { name: string; version: number | null }; cube: Record<string, string | null>; unit: boolean; build: string }
export interface GlacierFeedPointer { week: string; builtAt: string; n: number }
export interface GlacierSatIndex { updatedAt: string; newest: Record<string, string>; seasons: Record<string, Record<string, string>> }
export interface GlacierStatus { schema: 1; kind: 'glacier/status'; killed?: boolean; killReason?: string; lines?: Record<string, unknown>; checkedAt?: string }
export type GlacierPointRow = [id: string, lat: number, lon: number, klass: 'A' | 'B' | 'C', km2: number];
export interface GlacierPointsDoc { schema: 1; kind: 'glacier/points'; build: string; cols: string[]; rows: GlacierPointRow[] }
/** Newest values per glacier: length `[yearEnd, dL m, yearStart]`, balance `[yearEnd, Ba, Bs, Bw]` (mm w.e.), area `[fromYear, toYear, change %]`. */
export interface GlacierLatest { len?: [number, number, number]; ba?: [number, number, number | null, number | null]; da?: [number, number, number] }
export type GlacierCountryYearly = Array<[year: number, mean: number, n: number]>;
export interface GlacierSummary {
  schema: 1; kind: 'glacier/summary'; build: string;
  latest: Record<string, GlacierLatest>;
  countries: Record<'CH' | 'AT' | 'DE', { ba: GlacierCountryYearly; len: GlacierCountryYearly }>;
}
export interface GlacierSourceRow { id: string; label: string; licence: string; attribution: string; url: string; refYear: string; used: string }
export interface GlacierOutlineFC {
  type: 'FeatureCollection'; kind: string; region: string; level?: number; year?: number; source?: string;
  features: Array<{ type: 'Feature'; properties: { id?: string; ids?: string[]; e?: number; n?: string }; geometry: GeoJSON.Geometry }>;
}
export interface GlacierHypsoDoc { region: string; bandM: number; demRef: string; glaciers: Record<string, { z0: number; a: number[]; zr: [number, number]; cov: number }> }
export interface GlacierSeriesDoc { region: string; glaciers: Record<string, Omit<GlacierSeries, 'id'>[]> }
export interface GlacierProjEntry { rgi: string[]; v2020km3: number | null; f: Record<string, number[][]>; u10: Record<string, Array<number | null>>; a2100: Record<string, number[]> }
export interface GlacierProjDoc { region: string; years: number[]; ssp: Record<string, string>; base: string; model: string; glaciers: Record<string, GlacierProjEntry> }

/** The newest satellite row of a glacier with its date (from the season documents of the newest two years). */
export interface GlacierSatLatest { date: string; row: GlacierSeasonRow; year: number }

const memo = new Map<string, Promise<unknown>>();
const once = <T>(key: string, make: () => Promise<T>): Promise<T> => {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) { p = make(); memo.set(key, p); p.catch(() => memo.delete(key)); }
  return p;
};
export const resetGlacierClient = () => memo.clear();

export async function loadIndex(signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierIndex | null> {
  try {
    const j = await fetchGlacier(GLACIER_INDEX_PATH, 'json', signal, bases, 'raw') as GlacierIndex;
    return j?.kind === 'glacier/index' && GLACIER_BUILD_RE.test(j.static?.build ?? '') ? j : null;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}
/** Kill switch: anything but an explicit `killed: true` counts as not killed (an unreachable file never hides the page). */
export async function loadStatus(signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierStatus | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4_000);
    signal?.addEventListener('abort', () => ac.abort(), { once: true });
    try {
      const r = await fetch(`${bases.raw}/${GLACIER_STATUS_PATH}`, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json() as GlacierStatus;
      return j?.kind === 'glacier/status' ? j : null;
    } finally { clearTimeout(t); }
  } catch (e) { if (isAbort(e) && signal?.aborted) throw e; return null; }
}

/**
 * Memoised documents are shared by every caller, so the fetch is NOT tied to one caller's `signal` (a caller that unmounts must not reject the promise the next
 * caller — a remount, a second effect run — is already waiting on); callers check their own `signal.aborted` after the await.
 */
function staticDoc<T>(build: string, file: string, _signal: AbortSignal | undefined, bases: GlacierBases): Promise<T | null> {
  return once(`${bases.cdn}|${build}|${file}`, async () => {
    try { return await fetchGlacier(glacierStaticPath(build, file), 'json', undefined, bases) as T; }
    catch (e) { if (isAbort(e)) throw e; return null as T | null; }
  }) as Promise<T | null>;
}

export interface LoadedCatalog { catalog: GlacierCatalog; byId: Map<string, GlacierCatalogEntry>; problems: string[] }
export async function loadCatalog(build: string, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<LoadedCatalog | null> {
  const c = await staticDoc<GlacierCatalog>(build, GLACIER_CATALOG_FILE, signal, bases);
  if (!c || c.kind !== 'glacier/catalog' || !Array.isArray(c.glaciers)) return null;
  const problems = catalogProblems(c);
  const bad = new Set(problems.map((p) => p.split(':')[0]));
  const glaciers = bad.size ? c.glaciers.filter((g) => !bad.has(g.id)) : c.glaciers;
  return { catalog: { ...c, glaciers }, byId: new Map(glaciers.map((g) => [g.id, g])), problems };
}
export const loadPoints = (build: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierPointsDoc>(build, GLACIER_POINTS_FILE, signal, bases);
export const loadSummary = (build: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierSummary>(build, 'summary.json', signal, bases);
export async function loadOfficial(build: string, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierOfficialItem[] | null> {
  const d = await staticDoc<{ items: GlacierOfficialItem[] }>(build, GLACIER_OFFICIAL_FILE, signal, bases);
  if (!d || !Array.isArray(d.items)) return null;
  const problems = officialProblems(d.items);
  const bad = new Set(problems.map((p) => p.split(':')[0]));
  return d.items.filter((i) => !bad.has(i.id));
}
export async function loadSources(build: string, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierSourceRow[] | null> {
  const d = await staticDoc<{ sources: GlacierSourceRow[] }>(build, GLACIER_SOURCES_FILE, signal, bases);
  return d && Array.isArray(d.sources) ? d.sources : null;
}
export const loadOutline = (build: string, region: string, level: 1 | 2 | 3, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierOutlineFC>(build, glacierOutlineFile(region, level), signal, bases);
export const loadEpoch = (build: string, region: string, year: number | string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierOutlineFC>(build, glacierEpochFile(region, year), signal, bases);
export const loadHypso = (build: string, region: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierHypsoDoc>(build, glacierHypsoFile(region), signal, bases);
export const loadSeries = (build: string, region: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierSeriesDoc>(build, glacierSeriesFile(region), signal, bases);
export const loadProj = (build: string, region: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierProjDoc>(build, glacierProjFile(region), signal, bases);

/** One season document (immutable name = stand), through the contract rules before it reaches the page. */
export function loadSeasonDoc(year: number | string, region: string, stand: string, byId: ReadonlyMap<string, GlacierCatalogEntry>, _signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierSeasonDoc | null> {
  return once(`${bases.cdn}|season|${year}|${region}|${stand}`, async () => {
    try {
      const d = await fetchGlacier(glacierSeasonPath(year, region, stand), 'json', undefined, bases) as GlacierSeasonDoc;
      return seasonProblems(d, region, byId as ReadonlyMap<string, GlacierSatCatalogRow>).length === 0 ? d : null;
    } catch (e) { if (isAbort(e)) throw e; return null; }
  });
}
/** Newest satellite row per glacier: the season documents of the two newest years named by `index.sat`, all regions in parallel. */
export async function loadSatLatest(sat: GlacierSatIndex, byId: ReadonlyMap<string, GlacierCatalogEntry>, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<Map<string, GlacierSatLatest>> {
  const out = new Map<string, GlacierSatLatest>();
  const years = Object.keys(sat.seasons ?? {}).filter((y) => /^\d{4}$/.test(y)).sort().slice(-2);
  const jobs: Array<Promise<GlacierSeasonDoc | null>> = [];
  for (const y of years) for (const [region, stand] of Object.entries(sat.seasons[y])) jobs.push(loadSeasonDoc(y, region, stand, byId, signal, bases));
  for (const doc of await Promise.all(jobs)) {
    if (!doc) continue;
    for (const [id, rows] of Object.entries(doc.glaciers)) {
      const last = rows[rows.length - 1];
      if (!last) continue;
      const cur = out.get(id);
      if (!cur || last[0] > cur.date) out.set(id, { date: last[0], row: last, year: doc.year });
    }
  }
  return out;
}

/** TSLA snow-line climatology per class-A glacier (weekly p10/p50/p90 from day of year `doy0`), `clima/<region>.json` of the static build. */
export interface GlacierClimaDoc { schema: 1; kind: 'glacier/clima'; build: string; region: string; doy0: number; bin: number; cols: string[]; source: string; glaciers: Record<string, { rgi7: string; n: number; weeks: Array<[number, number, number, number] | null> }> }
export async function loadClima(build: string, region: string, byId: ReadonlyMap<string, GlacierCatalogEntry>, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierClimaDoc | null> {
  const d = await staticDoc<GlacierClimaDoc>(build, `clima/${region}.json`, signal, bases);
  return d && climaProblems(d, region, byId as ReadonlyMap<string, GlacierSatCatalogRow>).length === 0 ? d : null;
}

/** One melt run (immutable name = run hour), through the contract rules; an unreadable or violating document is `null` ("Keine Daten", never a number). */
export function loadMelt(run: string, catalogIds: ReadonlySet<string> | undefined, _signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierMeltDoc | null> {
  return once(`${bases.cdn}|melt|${run}`, async () => {
    try {
      const d = await fetchGlacier(glacierMeltRunPath(run), 'json', undefined, bases) as GlacierMeltDoc;
      return meltProblems(d, catalogIds).length === 0 ? d : null;
    } catch (e) { if (isAbort(e)) throw e; return null; }
  });
}

/** All season rows of ONE glacier, per year, from the season documents the index names (every year, its region only). */
export async function loadSeasonRowsOf(g: GlacierCatalogEntry, sat: GlacierSatIndex, byId: ReadonlyMap<string, GlacierCatalogEntry>, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<Map<number, GlacierSeasonRow[]>> {
  const out = new Map<number, GlacierSeasonRow[]>();
  const years = Object.keys(sat.seasons ?? {}).filter((y) => /^\d{4}$/.test(y)).sort();
  const docs = await Promise.all(years.map((y) => (sat.seasons[y]?.[g.region] ? loadSeasonDoc(y, g.region, sat.seasons[y][g.region], byId, signal, bases) : Promise.resolve(null))));
  docs.forEach((d, i) => { const rows = d?.glaciers[g.id]; if (rows?.length) out.set(Number(years[i]), rows); });
  return out;
}

/** Build report (file list): which earlier outlines a region has — the sheet asks for exactly those. */
export interface GlacierReportDoc { build: string; files: Record<string, unknown> }
export const loadReport = (build: string, signal?: AbortSignal, bases = glacierBasesFrom()) => staticDoc<GlacierReportDoc>(build, 'report.json', signal, bases);
/** Years of the earlier outlines of a region (`outline/<region>-e<year>.json`), newest first. */
export const epochYearsOf = (report: GlacierReportDoc | null, region: string): number[] => {
  if (!report?.files) return [];
  const re = new RegExp(`^outline/${region}-e(\\d{4})\\.json$`);
  return Object.keys(report.files).map((f) => re.exec(f)?.[1]).filter((y): y is string => !!y).map(Number).sort((a, b) => b - a);
};
/** DEM grids of the static tree: `dem/<region>.json` (class A/B outside Germany; 0.3–6 MB per region, loaded only for the sheet's snow zone). */
export async function loadDemGrid(build: string, region: string, id: string, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierDemGrid | null> {
  const d = await staticDoc<{ glaciers: Record<string, GlacierDemGrid> }>(build, `dem/${region}.json`, signal, bases);
  return d?.glaciers?.[id] ?? null;
}

/**
 * The change feed: the document of the pointer's week and of the week before, through the contract rules (a violating document is dropped whole — never
 * half a feed), merged newest first. The week document is rewritten under the same path every day, so it is read RAW-first like the pointer (the CDN
 * node can be 12 hours old). `official` = the curated items the verbatim rule is checked against.
 */
export async function loadFeed(pointer: GlacierFeedPointer | undefined, official: readonly import('./glacierContract').GlacierOfficialItem[], glacierIds: ReadonlySet<string>, signal?: AbortSignal, bases = glacierBasesFrom()): Promise<GlacierFeedEvent[] | null> {
  if (!pointer?.week) return null;
  const weeks = [pointer.week, previousWeekKey(Date.parse(`${pointer.week.slice(0, 4)}-01-04T12:00:00Z`) + (Number(pointer.week.slice(6)) - 1) * 7 * 86_400_000)];
  const docs = await Promise.all(weeks.map(async (w) => {
    try {
      const d = await fetchGlacier(glacierFeedPath(w), 'json', signal, bases, 'raw') as GlacierFeedDoc;
      return feedProblems(d, official, glacierIds).length === 0 ? d : null;
    } catch (e) { if (isAbort(e)) throw e; return null; }
  }));
  if (!docs[0]) return null;
  const seen = new Set<string>();
  const events = docs.flatMap((d) => d?.events ?? []).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.w - a.w || (a.id < b.id ? -1 : 1)));
  return events;
}

