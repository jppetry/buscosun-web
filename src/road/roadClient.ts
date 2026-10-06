/**
 * AW-5 — Data client of Autobahnwetter: newest slot from the clock (time gate), step back on 404, jsDelivr first with
 * raw.githubusercontent as hedge (pattern `fetchImgRes`, NL-2 / V-FI-5), every file through the contract's client
 * checks. No mutable manifest is read (`status.json` is for the external watch only).
 */
import {
  ROAD_CDN_BASE, ROAD_RAW_BASE, ROAD_MAX_STEP_BACK, ROAD_SLOT_MS, ROAD_CORRIDORS_PATH,
  parseRoadObs, parseRoadH24, roadExpectedSlot, roadH24Path, roadObsPath, roadStamp,
  type RoadH24File, type RoadObsFile,
} from './roadContract';
import {
  ROAD_FC_CDN_BASE, ROAD_FC_RAW_BASE, ROAD_FC_INDEX_PATH, parseRoadFcFile, parseRoadFcIndex, parseRoadFcWhere, roadFcCorridorPath, roadFcPickRun, roadFcStatePath,
  roadFcWhereFile, roadFcWherePath,
  type RoadFcFile, type RoadFcIndex, type RoadFcPoint, type RoadFcRunEntry, type RoadFcWhere,
} from './roadFc';

/** "Does not exist" (404, or 403 on both ways) — distinct from a hard failure. */
export class RoadNotThere extends Error {}

/** p95 of the measured cold jsDelivr TTFB (AP0/AP1) — same hedge as the radar and the point reader. */
export const ROAD_RAW_HEDGE_MS = 2_500;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * One JSON file of `road/v1/` (or `road/fc/v1/`): CDN, after 2.5 s without headers (or on 403/404/5xx/network) the same
 * path on raw.githubusercontent. A 404 at the CDN is checked once on raw (V-AW-25): jsDelivr keeps a 404 that was asked
 * for before the push at the edge — "not there" is a 404 on BOTH ways.
 */
export function fetchRoadJson(path: string, signal?: AbortSignal, bases: { cdn: string; raw: string } = { cdn: ROAD_CDN_BASE, raw: ROAD_RAW_BASE }): Promise<unknown> {
  const cdn = `${bases.cdn}/${path}`;
  const raw = `${bases.raw}/${path}`;
  const acC = new AbortController();
  const acR = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    let rawStarted = false;
    let cdnErr: unknown = null;
    let rawErr: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => { acC.abort(); acR.abort(); finish(() => reject(abortError(signal!))); };
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    }
    const failed = () => {
      if (!cdnErr || (rawStarted && !rawErr)) return;
      if (!rawStarted) { finish(() => reject(cdnErr)); return; }
      const notThere = (e: unknown) => e instanceof RoadNotThere;
      finish(() => reject(notThere(cdnErr) && notThere(rawErr) ? cdnErr : notThere(cdnErr) ? rawErr : cdnErr));
    };
    const take = (res: Response, loser: AbortController) => {
      loser.abort();
      res.json().then((j) => finish(() => resolve(j)), (e) => finish(() => reject(e)));
    };
    const startRaw = () => {
      if (rawStarted || settled) return;
      rawStarted = true;
      fetch(raw, { signal: acR.signal }).then(
        (res) => {
          if (settled) return;
          if (res.ok) { take(res, acC); return; }
          rawErr = res.status === 404 || res.status === 403 ? new RoadNotThere(`${res.status} ${raw}`) : new Error(`${res.status} ${raw}`);
          failed();
        },
        (e) => { if (!settled) { rawErr = e; failed(); } },
      );
    };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => { timer = null; startRaw(); }, ROAD_RAW_HEDGE_MS);
    fetch(cdn, { signal: acC.signal }).then(
      (res) => {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        if (res.ok) { take(res, acR); return; }
        cdnErr = res.status === 403 || res.status === 404 ? new RoadNotThere(`${res.status} ${cdn}`) : new Error(`${res.status} ${cdn}`);
        startRaw();
        failed();
      },
      (e) => {
        if (settled) return;
        if (timer) { clearTimeout(timer); timer = null; }
        cdnErr = e;
        startRaw();
        failed();
      },
    );
  });
}

export interface RoadSlotLoad {
  obs: (RoadObsFile & { dropped: number }) | null;
  /** Stamps tried, newest first (diagnosis, `?pflog`-style). */
  tried: string[];
  /** Why there is no slot: none within the step-back window, or every attempt failed hard. */
  reason: 'ok' | 'none' | 'error' | 'invalid';
  error?: string;
}

/** Newest published slot behind the time gate, stepping back ≤ ROAD_MAX_STEP_BACK slots on 404. */
export async function loadRoadSlot(nowMs: number, signal?: AbortSignal): Promise<RoadSlotLoad> {
  const tried: string[] = [];
  let lastErr: unknown = null;
  for (let i = 0; i <= ROAD_MAX_STEP_BACK; i++) {
    const stamp = roadStamp(roadExpectedSlot(nowMs) - i * ROAD_SLOT_MS);
    tried.push(stamp);
    try {
      const j = await fetchRoadJson(roadObsPath(stamp), signal);
      const obs = parseRoadObs(j);
      if (!obs) return { obs: null, tried, reason: 'invalid' };
      return { obs, tried, reason: 'ok' };
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      if (e instanceof RoadNotThere) continue;
      lastErr = e;
    }
  }
  return { obs: null, tried, reason: lastErr ? 'error' : 'none', ...(lastErr ? { error: String((lastErr as Error).message ?? lastErr) } : {}) };
}

/** 24-h ring of one series at the loaded slot (one step back when the ring of that slot is missing). */
export async function loadRoadH24(group: string, stamp: string, signal?: AbortSignal): Promise<RoadH24File | null> {
  const slotMs = Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10));
  for (let i = 0; i <= 1; i++) {
    try {
      return parseRoadH24(await fetchRoadJson(roadH24Path(group, roadStamp(slotMs - i * ROAD_SLOT_MS)), signal));
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      if (!(e instanceof RoadNotThere)) return null;
    }
  }
  return null;
}

// --- Corridors (static/corridors.json) ---------------------------------------------------------

export interface RoadCorridor {
  id: string;
  road: string;
  shields: string[];
  title: string;
  from: string | null;
  to: string | null;
  lengthKm: number;
  countries: string[];
  borders: Array<{ km: number; country: string }>;
  /** [lon, lat] oriented west → east (even numbers) or north → south (odd numbers). */
  line: Array<[number, number]>;
  towns: Array<[number, string]>;
  stations: Array<{ id: string; km: number; dir: string | null }>;
  forecastPoints: unknown[];
}

export interface RoadCorridorsFile {
  schema: 1;
  sources: Array<{ what: string; name: string; license: string; attribution: string }>;
  corridors: RoadCorridor[];
}

export function parseRoadCorridors(j: unknown): RoadCorridorsFile | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.schema !== 1 || o.product !== 'road-corridors' || !Array.isArray(o.corridors)) return null;
  const ok = (c: Record<string, unknown>) => typeof c.id === 'string' && typeof c.road === 'string' && Array.isArray(c.line)
    && (c.line as unknown[]).length >= 2 && typeof c.lengthKm === 'number' && Array.isArray(c.stations) && Array.isArray(c.shields);
  const corridors = (o.corridors as Array<Record<string, unknown>>).filter(ok) as unknown as RoadCorridor[];
  return { schema: 1, sources: (o.sources as RoadCorridorsFile['sources']) ?? [], corridors };
}

export async function loadRoadCorridors(signal?: AbortSignal): Promise<RoadCorridorsFile | null> {
  try { return parseRoadCorridors(await fetchRoadJson(ROAD_CORRIDORS_PATH, signal)); } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return null;
  }
}

// --- Route forecast (road/fc/v1, AW-6.1) --------------------------------------------------------

/**
 * The pointer of the route forecast. Mutable, so it is read from raw.githubusercontent only (5 min cache there, no
 * sticky edge 404, no `@main` lag — E-AW-20); `null` when it cannot be read.
 */
export async function loadRoadFcIndex(signal?: AbortSignal): Promise<RoadFcIndex | null> {
  try {
    const res = await fetch(`${ROAD_FC_RAW_BASE}/${ROAD_FC_INDEX_PATH}`, { signal, cache: 'no-cache' });
    if (!res.ok) return null;
    return parseRoadFcIndex(await res.json());
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return null;
  }
}

/** One immutable run file: jsDelivr with the raw hedge; a 404 at the CDN is checked once on raw (`@main` may lag). */
async function fetchRoadFcFile(path: string, signal?: AbortSignal): Promise<(RoadFcFile & { dropped: number }) | null> {
  try {
    return parseRoadFcFile(await fetchRoadJson(path, signal, { cdn: ROAD_FC_CDN_BASE, raw: ROAD_FC_RAW_BASE }));
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return null;
  }
}

export interface RoadFcLoad {
  run: RoadFcRunEntry | null;
  file: (RoadFcFile & { dropped: number }) | null;
  /** Why there is no forecast: pointer unreadable, no run (or kill switch), file missing or invalid. */
  reason: 'ok' | 'no-index' | 'no-run' | 'no-file';
}

export interface RoadFcStationLoad {
  point: RoadFcPoint | null;
  /** `ok`; `no-where` = the run has no station map (runs before 06.10.2026) or it is unreadable; `not-in-run` = the run
   *  carries no forecast for this station (not in the catalogue, or lost in the run); `no-file` = its file is missing. */
  reason: 'ok' | 'no-where' | 'not-in-run' | 'no-file';
  /** `c/<corridor>` or `s/<state>` when known. */
  where?: string;
}

/** Station map and files of a run, read once per run (a run is immutable). */
const whereCache = new Map<string, Promise<RoadFcWhere | null>>();
const fileCache = new Map<string, Promise<(RoadFcFile & { dropped: number }) | null>>();
const once = <T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> => {
  let p = cache.get(key);
  if (!p) {
    p = make();
    cache.set(key, p);
    // A failed or empty answer is not kept: the next selection may try again.
    p.then((v) => { if (!v) cache.delete(key); }, () => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  }
  return p;
};

/**
 * V-AW-26: the forecast of ONE station of a run, wherever its file is — for stations on no corridor (federal and state
 * roads) or on a corridor other than the open one. Reads the run's station map, then that file.
 */
export async function loadRoadFcStation(run: RoadFcRunEntry, stationId: string, signal?: AbortSignal): Promise<RoadFcStationLoad> {
  const where = await once(whereCache, run.run, async () => {
    try { const w = parseRoadFcWhere(await fetchRoadJson(roadFcWherePath(run.run), signal, { cdn: ROAD_FC_CDN_BASE, raw: ROAD_FC_RAW_BASE })); return w && w.run === run.run ? w : null; } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      return null;
    }
  });
  if (!where) return { point: null, reason: 'no-where' };
  const key = where.stations[stationId];
  if (!key) return { point: null, reason: 'not-in-run' };
  const file = await once(fileCache, `${run.run}/${key}`, () => fetchRoadFcFile(roadFcWhereFile(run.run, key), signal));
  if (!file || file.run !== run.run) return { point: null, reason: 'no-file', where: key };
  const point = file.points.find((p) => p.id === stationId) ?? null;
  return point ? { point, reason: 'ok', where: key } : { point: null, reason: 'not-in-run', where: key };
}

/** Forecast of one corridor (`kind: 'corridor'`) or of the corridor-less stations of a state (`kind: 'state'`). */
export async function loadRoadFc(kind: 'corridor' | 'state', id: string, nowMs: number, signal?: AbortSignal, index?: RoadFcIndex | null): Promise<RoadFcLoad> {
  const idx = index === undefined ? await loadRoadFcIndex(signal) : index;
  if (!idx) return { run: null, file: null, reason: 'no-index' };
  const run = roadFcPickRun(idx, nowMs);
  if (!run) return { run: null, file: null, reason: 'no-run' };
  const file = await fetchRoadFcFile(kind === 'corridor' ? roadFcCorridorPath(run.run, id) : roadFcStatePath(run.run, id), signal);
  return file && file.run === run.run ? { run, file, reason: 'ok' } : { run, file: null, reason: 'no-file' };
}
