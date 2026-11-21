/**
 * Phase BS — browser readers of the lake line (`audit/seewetter-binnenseen.md`): the outlines for the map, the modelled
 * water temperature (the producer's file), the measured water temperature and level (WSV PEGELONLINE, BAFU over LINDAS —
 * both live, both with CORS open) and the official DWD lake warnings from the CAP file the warn layer reads.
 * No reader falls back from one source to another: a missing answer is "keine Daten" / "keine Messung".
 */
import { fetchSea } from './seaClient';
import {
  SEA_LAKE_SHAPES_PATH, BAFU_LAKE_QUERY, BAFU_SPARQL, WSV_W_RANGE_CM, WSV_WT_RANGE_C, bafuLevelsOf, lakesWtProblems, seaLakesWtStale, wsvCurrentOf, wsvCurrentUrl,
  type LakeWaterObs, type SeaLakesWtDoc, type SeaLakesWtPointer,
} from './seaLakes';
import { lakeAlertsOf, type LakeWarnState } from './lakeWarn';

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

export interface LakeShapes { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: { id: string; name: string; source: string }; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } }>; credits: string[] }
let shapesP: Promise<LakeShapes | null> | null = null;
/** The simplified lake outlines (one read per session; a failed read is not remembered). */
export function loadLakeShapes(): Promise<LakeShapes | null> {
  shapesP ??= (fetchSea(SEA_LAKE_SHAPES_PATH, 'json') as Promise<{ product?: string; features?: LakeShapes['features']; credits?: string[] }>).then(
    (j) => (j?.product === 'sea-lakes-shapes' && Array.isArray(j.features) ? { type: 'FeatureCollection' as const, features: j.features, credits: j.credits ?? [] } : null),
    () => { shapesP = null; return null; },
  );
  return shapesP;
}

export interface LakeWtLoad { doc: SeaLakesWtDoc | null; state: 'ok' | 'none' | 'stale' | 'error'; why: string | null }
export const LAKE_WT_NONE: LakeWtLoad = { doc: null, state: 'none', why: 'Im Datenspeicher liegt noch keine Modelltemperatur für die Seen.' };
export async function loadLakeWt(ptr: SeaLakesWtPointer | null, nowMs: number, signal?: AbortSignal): Promise<LakeWtLoad> {
  if (!ptr) return LAKE_WT_NONE;
  if (seaLakesWtStale(ptr.builtAt, nowMs)) return { doc: null, state: 'stale', why: 'Die letzte Modelltemperatur der Seen ist älter als 36 Stunden.' };
  try {
    const j = await fetchSea(ptr.path, 'json', signal) as SeaLakesWtDoc;
    if (lakesWtProblems(j).length || j.stamp !== ptr.stamp) return { doc: null, state: 'error', why: 'Die Datei mit der Modelltemperatur der Seen ist nicht lesbar.' };
    return { doc: j, state: 'ok', why: null };
  } catch (e) { if (isAbort(e)) throw e; return { doc: null, state: 'error', why: 'Die Datei mit der Modelltemperatur der Seen ist gerade nicht erreichbar.' }; }
}

/** Newest value of a WSV gauge (`W` in cm above gauge zero, `WT` in °C), or `null` — never an older value. */
export async function loadWsvCurrent(uuid: string, series: 'W' | 'WT', signal?: AbortSignal, nowMs = Date.now()): Promise<LakeWaterObs | null> {
  try {
    const r = await fetch(wsvCurrentUrl(uuid, series), { signal });
    return r.ok ? wsvCurrentOf(await r.json(), nowMs, series === 'W' ? WSV_W_RANGE_CM : WSV_WT_RANGE_C) : null;
  } catch (e) { if (isAbort(e)) throw e; return null; }
}

let bafuMemo: { at: number; p: Promise<Record<string, LakeWaterObs>> } | null = null;
/** The levels of all BAFU lake stations (one small SPARQL read, kept 10 minutes — the service updates every 10 minutes). */
export function loadBafuLevels(nowMs = Date.now()): Promise<Record<string, LakeWaterObs>> {
  if (bafuMemo && nowMs - bafuMemo.at < 10 * 60_000) return bafuMemo.p;
  const p = fetch(BAFU_SPARQL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' }, body: new URLSearchParams({ query: BAFU_LAKE_QUERY }).toString() })
    .then((r) => (r.ok ? r.json() : null)).then((j) => bafuLevelsOf(j, nowMs), () => { bafuMemo = null; return {}; });
  bafuMemo = { at: nowMs, p };
  return p;
}

/**
 * The warning state of a lake cell from the CAP file of the warn layer (`fetchDwdWarnings`, cached there for its own
 * interval — the lake card costs no second read while the warn layer is on).
 */
export async function loadLakeWarnings(cellId: string | null, signal?: AbortSignal, nowMs = Date.now()): Promise<LakeWarnState> {
  if (!cellId) return { kind: 'none' };
  try {
    const { fetchDwdWarnings } = await import('../sources/dwdCapAlerts');
    const run = await fetchDwdWarnings(signal);
    const alerts = lakeAlertsOf(run.alerts, cellId, nowMs);
    return alerts.length ? { kind: 'alerts', cell: cellId, alerts, publishedMs: run.publishedMs } : { kind: 'clear', cell: cellId, publishedMs: run.publishedMs };
  } catch (e) { if (isAbort(e)) throw e; return { kind: 'error', cell: cellId, why: 'Die Warndatei des Deutschen Wetterdienstes ist gerade nicht lesbar.' }; }
}
