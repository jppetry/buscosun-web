/**
 * AW-8 — Reader of the hazard product in the browser: `road/v1/hz/<slot>.json` (immutable per slot, CDN with raw
 * hedge like the measurements, `fetchRoadJson`) and `road/v1/static/segments.json` (timeless). The expected slot is the
 * measured slot the page shows (the derive writes `hz/<stamp>` right after `obs/<stamp>`); a 404 steps back up to four
 * slots, like `loadRoadSlot`. The client checks the file with the contract (`parseRoadHz`); the freshness rules are the
 * contract's (`roadHzFreshness`): > 45 min grey, > 3 h "Gefahrenlage derzeit nicht verfügbar".
 */
import { ROAD_SLOT_MS, roadExpectedSlot, roadStamp } from './roadContract';
import { fetchRoadJson, roadRetry, RoadNotThere } from './roadClient';
import { ROAD_SEGMENTS_PATH, parseRoadSegments, type RoadSegmentsFile } from './roadSegments';
import { parseRoadHz, roadHzPath, type RoadHzFile } from './roadHazards';

export interface RoadHzLoad {
  file: RoadHzFile | null;
  /** `ok` | `not-there` (no slot within four steps) | `error` (network) | `invalid` (contract rejected the file). */
  reason: 'ok' | 'not-there' | 'error' | 'invalid';
  error?: string;
}

/** A slot that was "not there" is asked again after this long (`set`) — it may have been published in between. */
const HZ_MISS_TTL_MS = 2 * 60_000;
const hzStore = new Map<string, { file: RoadHzFile | null; at: number }>();
const hzCache = {
  has: (s: string) => { const e = hzStore.get(s); return !!e && (e.file != null || Date.now() - e.at < HZ_MISS_TTL_MS); },
  get: (s: string) => hzStore.get(s)?.file ?? null,
  set: (s: string, file: RoadHzFile | null) => { hzStore.set(s, { file, at: Date.now() }); },
};

/** Early start (route wrapper): segments and the hazard file of the clock's expected slot, while the page chunk still downloads. */
let hzWarm: { stamp: string; at: number; load: Promise<RoadHzLoad> } | null = null;
export function warmRoadHzStart(nowMs: number = Date.now()): void {
  if (hzWarm && nowMs - hzWarm.at < 60_000) return;
  void loadRoadSegments();
  const stamp = roadStamp(roadExpectedSlot(nowMs));
  const load = loadRoadHz(stamp);
  load.catch(() => { /* the page reads it itself */ });
  hzWarm = { stamp, at: nowMs, load };
}

/** The hazards of the measured slot (`stamp`), stepping back up to `maxBack` slots. */
export async function loadRoadHz(stamp: string, signal?: AbortSignal, maxBack = 4): Promise<RoadHzLoad> {
  // The early start's answer for this slot, once; without a file the read below runs as usual.
  const w = hzWarm;
  if (w && w.stamp === stamp && Date.now() - w.at < 60_000) {
    hzWarm = null;
    const l = await w.load.catch(() => null);
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (l?.file) return l;
  }
  const slotMs = Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10));
  let error: string | undefined;
  for (let back = 0; back <= maxBack; back++) {
    const s = roadStamp(slotMs - back * ROAD_SLOT_MS);
    if (hzCache.has(s)) { const c = hzCache.get(s); if (c) return { file: c, reason: 'ok' }; continue; }
    try {
      const j = await roadRetry(() => fetchRoadJson(roadHzPath(s), signal), signal);
      const file = parseRoadHz(j);
      if (!file) { hzCache.set(s, null); return { file: null, reason: 'invalid' }; }
      hzCache.set(s, file);
      return { file, reason: 'ok' };
    } catch (e) {
      if (e instanceof RoadNotThere) { hzCache.set(s, null); continue; }
      if ((e as Error)?.name === 'AbortError') throw e;
      error = String((e as Error)?.message ?? e);
      break;
    }
  }
  return { file: null, reason: error ? 'error' : 'not-there', error };
}

/** Earlier hazard slots for the timetable (−1 h, −2 h): the slots one and two hours before `stamp`, `null` where gone. */
export async function loadRoadHzHistory(stamp: string, signal?: AbortSignal): Promise<Array<RoadHzFile | null>> {
  const slotMs = Date.UTC(2000 + +stamp.slice(0, 2), +stamp.slice(2, 4) - 1, +stamp.slice(4, 6), +stamp.slice(6, 8), +stamp.slice(8, 10));
  const one = async (ms: number): Promise<RoadHzFile | null> => {
    const s = roadStamp(ms);
    if (hzCache.has(s)) return hzCache.get(s) ?? null;
    try { const f = parseRoadHz(await fetchRoadJson(roadHzPath(s), signal)); hzCache.set(s, f); return f; } catch (e) { if (e instanceof RoadNotThere) hzCache.set(s, null); return null; }
  };
  return Promise.all([one(slotMs - 3_600_000), one(slotMs - 2 * 3_600_000)]);
}

let segmentsPromise: Promise<RoadSegmentsFile | null> | null = null;
// No caller signal: the promise is shared, and an effect cleanup (StrictMode's double mount) would abort it for the next caller too.
export function loadRoadSegments(): Promise<RoadSegmentsFile | null> {
  if (!segmentsPromise) {
    segmentsPromise = roadRetry(() => fetchRoadJson(ROAD_SEGMENTS_PATH)).then((j) => parseRoadSegments(j), () => { segmentsPromise = null; return null; });
  }
  return segmentsPromise;
}
