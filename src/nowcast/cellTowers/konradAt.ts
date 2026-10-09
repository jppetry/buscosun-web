/**
 * Phase ZT (`audit/zelltuerme-3d.md` ZT-g): KONRAD3D run for a validity time — the look-back for the 3D stage.
 *
 * The mirror keeps `radar/img/v1/konrad3d/<stamp>/cells.json` for 24 slots under an age rule (≈ 115 min,
 * `RADAR_IMG_KEEP.konrad3d`); until now the client read only the newest run (V-RR-12). Rules here:
 *  - slider time ≤ newest slot ⇒ the slot at or before the time (5-min floor); older than the window ⇒ null, said so
 *  - slider time later (now and future, E-ZT-5) ⇒ the newest slot, towers stay where they were measured
 *  - a missing slot is null — no silent fallback to another run (the stage names the gap)
 * The 2D cell layer is untouched (it keeps `fetchKonrad3d`).
 */

import type { Konrad3dCell, Konrad3dRun } from '../../radar/konrad3d';
import { KONRAD_CDN_GATE_MS, konradStamp } from '../../sources/dwdKonrad3d';
import { konradImgUrl, parseKonradImgJson, RADAR_IMG_KEEP } from '../../sources/radarImg';

export const KONRAD_SLOT_MS = 5 * 60_000;
/** Age window of the mirror: (keep − 1) slots behind the newest. */
export const KONRAD_LOOKBACK_MS = ((RADAR_IMG_KEEP.konrad3d ?? 24) - 1) * KONRAD_SLOT_MS;

/** Newest slot that is safely in the mirror at `nowMs`. */
export function newestKonradSlot(nowMs: number): number {
  return Math.floor((nowMs - KONRAD_CDN_GATE_MS) / KONRAD_SLOT_MS) * KONRAD_SLOT_MS;
}

export type SlotPick =
  | { kind: 'slot'; slotMs: number; future: boolean }
  | { kind: 'too-old'; oldestMs: number };

/** Which slot the stage shows for slider time `timeMs`. */
export function konradSlotFor(timeMs: number, nowMs: number): SlotPick {
  const newest = newestKonradSlot(nowMs);
  if (timeMs >= newest) return { kind: 'slot', slotMs: newest, future: timeMs > nowMs };
  const slot = Math.floor(timeMs / KONRAD_SLOT_MS) * KONRAD_SLOT_MS;
  const oldest = newest - KONRAD_LOOKBACK_MS;
  if (slot < oldest) return { kind: 'too-old', oldestMs: oldest };
  return { kind: 'slot', slotMs: slot, future: false };
}

const cache = new Map<number, Promise<Konrad3dRun | null>>();
const CACHE_MAX = 30;

/** One slot from the mirror (`cells.json`); null = not there (404, broken, network). Cached per slot. */
export function fetchKonradSlot(slotMs: number, fetchImpl: typeof fetch = fetch): Promise<Konrad3dRun | null> {
  const hit = cache.get(slotMs);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetchImpl(konradImgUrl(konradStamp(new Date(slotMs))), { priority: 'low' });
      if (!res.ok) return null;
      const env = parseKonradImgJson(await res.json());
      if (!env || !(env.refMs > 0)) return null;
      return { refMs: env.refMs, file: env.file, cells: env.cells as Konrad3dCell[] };
    } catch {
      return null;
    }
  })();
  cache.set(slotMs, p);
  // A miss is not cached for long: the newest slot may still be on its way to the CDN.
  void p.then((r) => { if (!r) setTimeout(() => { if (cache.get(slotMs) === p) cache.delete(slotMs); }, 60_000); });
  while (cache.size > CACHE_MAX) { const k = cache.keys().next().value; if (k === undefined) break; cache.delete(k); }
  return p;
}

export interface TowerRuns {
  pick: SlotPick;
  /** Run shown (null = slot missing or too old). */
  run: Konrad3dRun | null;
  /** Run 5 min earlier — trend base (E-ZT-4). */
  prev: Konrad3dRun | null;
}

/** Run and comparison run for slider time `timeMs`. At the newest slot one step back is tried if it is not there yet. */
export async function loadTowerRuns(timeMs: number, nowMs: number, fetchImpl: typeof fetch = fetch): Promise<TowerRuns> {
  let pick = konradSlotFor(timeMs, nowMs);
  if (pick.kind === 'too-old') return { pick, run: null, prev: null };
  let run = await fetchKonradSlot(pick.slotMs, fetchImpl);
  if (!run && pick.slotMs === newestKonradSlot(nowMs)) {
    // Mirror lags the gate by a few seconds now and then: the slot before is still a measured run (named by its time).
    const back = pick.slotMs - KONRAD_SLOT_MS;
    run = await fetchKonradSlot(back, fetchImpl);
    if (run) pick = { kind: 'slot', slotMs: back, future: pick.future };
  }
  if (!run) return { pick, run: null, prev: null };
  const prev = await fetchKonradSlot(pick.slotMs - KONRAD_SLOT_MS, fetchImpl);
  return { pick, run, prev };
}

/** Test hook: empty the slot cache. */
export function _clearKonradSlotCache(): void { cache.clear(); }
