/**
 * Phase R250 — in-memory store of the 250-m tiles for `MapView`: meta per slot, decoded tiles (LRU, `RADAR_HD250_CACHE_TILES`),
 * fetches in flight (≤ `RADAR_HD250_MAX_PARALLEL` per slot), failures. Synchronous `get()` answers with the current state
 * and starts whatever is missing; `notify` is called once per arrival (coalesced to a microtask) so the caller redraws.
 * Shared between map instances (module level) — tiles of a slot are the same whoever asks.
 */

import { fetchHd250Meta, fetchHd250Tile } from '../sources/radarHd250Read';
import { hd250TileFile, type Hd250Meta } from '../sources/radarHd250';
import { RADAR_HD250_CACHE_TILES, RADAR_HD250_MAX_PARALLEL } from './radarHd250';

export type Hd250TileState =
  | { kind: 'ready'; values: Uint8Array }   // tile decoded
  | { kind: 'dry' }                         // slot has a product, this tile is dry (not written)
  | { kind: 'loading' }                     // meta or tile on its way
  | { kind: 'none' }                        // slot carries no 250-m product (or it failed) — the 1-km layer carries it
  | { kind: 'failed' };                     // this tile failed (retried after a while)

const RETRY_MS = 60_000;

class Hd250Store {
  private metas = new Map<string, Hd250Meta | null | 'pending'>();
  private tiles = new Map<string, Uint8Array>();          // LRU: insertion order = recency
  private inflight = new Set<string>();
  private failedAt = new Map<string, number>();
  private queues = new Map<string, { file: string; notify: () => void }[]>();
  private running = new Map<string, number>();
  private pendingNotify = new Set<() => void>();
  private notifyScheduled = false;

  private schedule(notify: () => void): void {
    this.pendingNotify.add(notify);
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      const list = [...this.pendingNotify];
      this.pendingNotify.clear();
      for (const n of list) { try { n(); } catch { /* a listener that throws must not stop the others */ } }
    });
  }

  meta(stamp: string): Hd250Meta | null | 'pending' {
    return this.metas.has(stamp) ? (this.metas.get(stamp) as Hd250Meta | null | 'pending') : 'pending';
  }

  /** Current state of a tile; starts the meta/tile fetch when needed. */
  get(stamp: string, tx: number, ty: number, notify: () => void): Hd250TileState {
    const m = this.metas.get(stamp);
    if (m === undefined) {
      this.metas.set(stamp, 'pending');
      void fetchHd250Meta(stamp).then(
        (meta) => { this.metas.set(stamp, meta); this.schedule(notify); },
        () => { this.metas.delete(stamp); this.schedule(notify); },
      );
      return { kind: 'loading' };
    }
    if (m === 'pending') return { kind: 'loading' };
    if (m === null) return { kind: 'none' };
    const file = hd250TileFile(tx, ty);
    if (!m.tiles.some((t) => t.file === file)) return { kind: 'dry' };
    const key = `${stamp}/${file}`;
    const hit = this.tiles.get(key);
    if (hit) { this.tiles.delete(key); this.tiles.set(key, hit); return { kind: 'ready', values: hit }; }   // touch (LRU)
    const f = this.failedAt.get(key);
    if (f !== undefined && Date.now() - f < RETRY_MS) return { kind: 'failed' };
    if (!this.inflight.has(key)) this.enqueue(stamp, file, notify);
    return { kind: 'loading' };
  }

  private enqueue(stamp: string, file: string, notify: () => void): void {
    const key = `${stamp}/${file}`;
    this.inflight.add(key);
    let q = this.queues.get(stamp);
    if (!q) { q = []; this.queues.set(stamp, q); }
    q.push({ file, notify });
    this.pump(stamp);
  }

  private pump(stamp: string): void {
    const q = this.queues.get(stamp);
    if (!q) return;
    while (q.length && (this.running.get(stamp) ?? 0) < RADAR_HD250_MAX_PARALLEL) {
      const job = q.shift()!;
      const key = `${stamp}/${job.file}`;
      this.running.set(stamp, (this.running.get(stamp) ?? 0) + 1);
      void fetchHd250Tile(stamp, job.file).then(
        (values) => {
          this.tiles.set(key, values);
          while (this.tiles.size > RADAR_HD250_CACHE_TILES) { const oldest = this.tiles.keys().next().value; if (oldest === undefined) break; this.tiles.delete(oldest); }
          this.failedAt.delete(key);
        },
        () => { this.failedAt.set(key, Date.now()); },
      ).finally(() => {
        this.inflight.delete(key);
        this.running.set(stamp, (this.running.get(stamp) ?? 1) - 1);
        this.schedule(job.notify);
        this.pump(stamp);
      });
    }
    if (!q.length) this.queues.delete(stamp);
  }

  /** Only for verifier/tests. */
  _reset(): void { this.metas.clear(); this.tiles.clear(); this.inflight.clear(); this.failedAt.clear(); this.queues.clear(); this.running.clear(); }
  _stats(): { metas: number; tiles: number; inflight: number } { return { metas: this.metas.size, tiles: this.tiles.size, inflight: this.inflight.size }; }
}

export const hd250Store = new Hd250Store();
