/**
 * AW-6.2.7 — the page's reader of the virtual road sensor (`road/vs/v1`): index and one corridor/state file from jsDelivr with
 * the raw hedge of the road client. The caller decides whether to show anything (`roadVsFlagFrom`, `ROAD_VS_LIVE = false`
 * until Gate G, E-VS-2); this file only reads and checks. Lazy chunk territory (`src/road/`), never imported eagerly.
 */
import { ROAD_CDN_BASE, ROAD_RAW_BASE } from '../roadContract';
import { fetchRoadJson, RoadNotThere } from '../roadClient';
import { ROAD_VS_INDEX_PATH, roadVsCorridorPath, roadVsStatePath, parseRoadVsProduct, type RoadVsIndex, type RoadVsProductFile } from './roadVsProduct';
import { ROAD_VS_REPO_DIR } from './roadVsForcing';

const VS_BASES = Object.freeze({ cdn: ROAD_CDN_BASE.replace(/\/road\/v1$/, `/${ROAD_VS_REPO_DIR}`), raw: ROAD_RAW_BASE.replace(/\/road\/v1$/, `/${ROAD_VS_REPO_DIR}`) });
/** A run older than this is not shown (`set`: two missed 3-h runs). */
export const ROAD_VS_STALE_MS = 9 * 3_600_000;

export function parseRoadVsIndex(j: unknown): RoadVsIndex | null {
  if (!j || typeof j !== 'object' || (j as RoadVsIndex).product !== 'road-vs-index' || !Array.isArray((j as RoadVsIndex).runs)) return null;
  return j as RoadVsIndex;
}

/** The pointer is mutable: read from raw.githubusercontent only, like the route forecast's (E-AW-20) — jsDelivr `@main`
 *  kept the first run's index for hours, so every later run counted as stale and nothing was shown. */
export async function loadRoadVsIndex(signal?: AbortSignal): Promise<RoadVsIndex | null> {
  try {
    const res = await fetch(`${VS_BASES.raw}/${ROAD_VS_INDEX_PATH}`, { signal, cache: 'no-cache' });
    if (!res.ok) return null;
    return parseRoadVsIndex(await res.json());
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return null;
  }
}

export interface RoadVsLoad { file: RoadVsProductFile | null; run: string | null; stale: boolean; reason: string | null }

/** The newest run's file for a corridor or state; `stale` when the run is older than ROAD_VS_STALE_MS. */
export async function loadRoadVs(kind: 'corridor' | 'state', id: string, nowMs: number, signal?: AbortSignal, index?: RoadVsIndex | null): Promise<RoadVsLoad> {
  const idx = index === undefined ? await loadRoadVsIndex(signal) : index;
  if (!idx || idx.killed || !idx.runs.length) return { file: null, run: null, stale: false, reason: idx?.killed ? 'Kill-Schalter' : 'kein Lauf' };
  const run = idx.runs[0];
  const path = kind === 'corridor' ? roadVsCorridorPath(run.run, id) : roadVsStatePath(run.run, id);
  try {
    const file = parseRoadVsProduct(await fetchRoadJson(path, signal, VS_BASES));
    return { file, run: run.run, stale: nowMs - run.t0Ms > ROAD_VS_STALE_MS, reason: file ? null : 'Datei besteht den Prüfer nicht' };
  } catch (e) {
    if (e instanceof RoadNotThere) return { file: null, run: run.run, stale: false, reason: 'Datei nicht da' };
    throw e;
  }
}
