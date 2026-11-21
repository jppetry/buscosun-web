/**
 * Phase SL (`audit/satellitenbild-laden.md`) — the rules of the 10 m viewer's tile cache, pure and testable.
 *
 * Before 19.11.2026 the cache held 24 tiles and threw out the OLDEST, even when the picture on screen still needed
 * it. A full-screen view on the 20 m level needs up to 54 tiles: every tile that arrived pushed out one in view, that
 * one was asked again, pushed out the next — a reload loop without end (measured: 376 requests on 106 byte ranges in
 * 90 s, the picture never settled). Three rules replace it:
 *
 *   1. The cache is limited in BYTES, not in tiles: a 512² tile costs a quarter of a 1 024² one.
 *   2. A tile the picture on screen needs is never thrown out (`pinned`); least recently used goes first.
 *   3. A view is drawn from a level whose tiles in view FIT the cache — else from the next coarser one. With (2)
 *      that makes the budget a real ceiling instead of a loop.
 */

/** Decoded size of a tile in the cache: RGBA, 4 bytes per pixel. */
export const tileBytes = (tileW: number, tileH: number): number => tileW * tileH * 4;

/** Ceiling of the bitmap cache: 96 MB — exactly what the 24 tiles of the 10 m level (1 024², RGBA) held before (`set`). */
export const TILE_CACHE_BYTES = 24 * tileBytes(1024, 1024);

/**
 * What the tiles of ONE level in view may cost: five sixths of the cache (80 MB = 20 tiles of 1 024² or 80 of 512²,
 * `set`). The rest is room for the interim level that stands while the sharp one loads.
 */
export const VIEW_TILE_BYTES = (TILE_CACHE_BYTES * 5) / 6;

/**
 * Which tiles leave the cache so that `incoming` more bytes fit under `budget`: in the given order (least recently
 * used first), never a pinned one. When only pinned tiles are left the cache stays above the budget — bounded by
 * what one view needs (rule 3), and better than a picture that loads its own tiles away.
 */
export function tilesToEvict(
  order: Iterable<string>, costOf: (key: string) => number, pinned: (key: string) => boolean,
  total: number, incoming: number, budget: number,
): string[] {
  const out: string[] = [];
  let left = total + incoming - budget;
  if (left <= 0) return out;
  for (const key of order) {
    if (pinned(key)) continue;
    out.push(key);
    left -= costOf(key);
    if (left <= 0) break;
  }
  return out;
}

/**
 * The level a view is drawn from. `levels` starts with the chosen (sharpest wanted) level and goes coarser; the first
 * whose tiles in view cost at most `maxBytes` wins, the coarsest one when none does.
 */
export function levelThatFits<L>(levels: readonly L[], bytesInView: (level: L) => number, maxBytes: number): L {
  for (const l of levels) if (bytesInView(l) <= maxBytes) return l;
  return levels[levels.length - 1];
}

/** Pause before a failed tile is asked again: 4 s, 8 s, 16 s, at most 30 s. */
export const tileRetryMs = (failures: number): number => Math.min(30_000, 4_000 * 2 ** (Math.max(1, failures) - 1));
