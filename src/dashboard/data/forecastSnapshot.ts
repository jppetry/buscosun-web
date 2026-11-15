/**
 * Last whole-window answer of buscosun Fusion per place, kept on the device (IndexedDB) for the warm start of the dashboard.
 *
 * A return visit within `SNAPSHOT_MAX_AGE_MS` shows this answer at once while the fresh one is read; the fresh answer then
 * replaces it (`forecastStore.ts`). It is the very object the dashboard drew last time (`FusionIn`), nothing is recomputed
 * and no other path stands in for buscosun Fusion (E-DB-17 holds: without a live answer AND without a snapshot the
 * dashboard names the error).
 *
 * `stamp` names the build that wrote the entry: an answer written by other code is never read (its shape may differ).
 * Every operation is shielded (private window, blocked storage, quota) — without IndexedDB the dashboard loads as before.
 */
import type { FusionIn } from '../model/types';

/** Oldest answer still shown on arrival (set): the hourly axis is then at most one step behind, and the fresh answer follows. */
export const SNAPSHOT_MAX_AGE_MS = 60 * 60_000;
/** Places kept (set); the oldest go first. One whole answer is ≈ 1,3 MB as JSON (measured 15.11., München, 337 steps). */
export const SNAPSHOT_KEEP = 4;

const DB = 'buscosun-dash';
const STORE = 'forecast';

interface Row { key: string; savedAt: number; stamp: string; fusion: FusionIn }

let dbP: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> | null {
  const idb: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return null;
  if (dbP) return dbP;
  dbP = new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('savedAt', 'savedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB: open'));
    req.onblocked = () => reject(new Error('IndexedDB: blocked'));
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}

const done = <T>(req: IDBRequest<T>): Promise<T> => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('IndexedDB: request'));
});

/** The kept answer of a place, or `null` (none, too old, written by another build, storage not usable). */
export async function readSnapshot(key: string, stamp: string, nowMs: number = Date.now()): Promise<{ fusion: FusionIn; savedAt: number } | null> {
  try {
    const p = open();
    if (!p) return null;
    const row = await done((await p).transaction(STORE, 'readonly').objectStore(STORE).get(key) as IDBRequest<Row | undefined>);
    if (!row || row.stamp !== stamp || !row.fusion?.v2?.axis?.steps?.length) return null;
    const age = nowMs - row.savedAt;
    return age >= 0 && age <= SNAPSHOT_MAX_AGE_MS ? { fusion: row.fusion, savedAt: row.savedAt } : null;
  } catch {
    return null;
  }
}

/** Keeps the answer of a place and drops the oldest beyond `SNAPSHOT_KEEP` places. Never throws. */
export async function writeSnapshot(key: string, stamp: string, fusion: FusionIn, nowMs: number = Date.now()): Promise<void> {
  try {
    const p = open();
    if (!p) return;
    const os = (await p).transaction(STORE, 'readwrite').objectStore(STORE);
    await done(os.put({ key, savedAt: nowMs, stamp, fusion } satisfies Row));
    // Keys only, oldest first (index `savedAt`) — the answers themselves are not read for the clean-up.
    const keys = await done(os.index('savedAt').getAllKeys());
    for (const k of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_KEEP))) os.delete(k);
  } catch { /* the snapshot is a bonus */ }
}
