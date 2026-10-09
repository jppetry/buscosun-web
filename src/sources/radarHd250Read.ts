/**
 * Phase R250 — client reader of the 250-m tiles (`radarHd250.ts` for the contract): meta and tiles of one RV slot from
 * the mirror (`rv-past/<stamp>/`), through the same CDN path with hedge and raw fallback as every radar image
 * (`fetchImgRes`), decoded off the main thread in the RADOLAN worker. A slot without `hd250.json` (every slot before
 * the mirror runs the hd250 derive, or a slot whose derive failed) is remembered as absent — the 1-km layer carries it.
 */

import { fetchImgRes, RadarImg404 } from './radarImg';
import { parseHd250Meta, hd250Dir, HD250_META_FILE, HD250_TILE_W, HD250_TILE_H, type Hd250Meta } from './radarHd250';
import { radarCdnDeadline, noteRadarCdnFailure, radarCdnUsable, radarCdnEnabled, radarImgEnabled } from './radolanRuns';
import { decodeGrayPngOffMain } from './radolan';

const metaCache = new Map<string, Promise<Hd250Meta | null>>();

/** Meta of the slot, `null` when the slot carries no 250-m product (404 or unreadable); memoised per stamp.
 *  The slots asked for are the ones the map shows (loaded RV frames = inside the look-back window) — no age gate here,
 *  only the CDN switches and the session latch. */
export function fetchHd250Meta(stamp: string, signal?: AbortSignal): Promise<Hd250Meta | null> {
  const hit = metaCache.get(stamp);
  if (hit) return hit;
  const p = (async (): Promise<Hd250Meta | null> => {
    if (!radarCdnUsable() || !radarCdnEnabled() || !radarImgEnabled()) return null;
    const dl = radarCdnDeadline(signal);
    try {
      const res = await fetchImgRes(`${hd250Dir(stamp)}/${HD250_META_FILE}`, dl.signal);
      const meta = parseHd250Meta(await res.json());
      return meta && meta.stamp === stamp ? meta : null;
    } catch (err) {
      if (signal?.aborted) { metaCache.delete(stamp); throw err; }
      if (!(err instanceof RadarImg404)) { noteRadarCdnFailure(); metaCache.delete(stamp); }   // a hard error is retried later
      return null;
    } finally { dl.done(); }
  })();
  metaCache.set(stamp, p);
  return p;
}

/** One tile (log bytes, 1100 × 1200). Throws on failure (the caller keeps the 1-km picture). */
export async function fetchHd250Tile(stamp: string, file: string, signal?: AbortSignal): Promise<Uint8Array> {
  const dl = radarCdnDeadline(signal);
  try {
    const res = await fetchImgRes(`${hd250Dir(stamp)}/${file}`, dl.signal);
    const buf = await res.arrayBuffer();
    const g = await decodeGrayPngOffMain(buf);
    if (g.width !== HD250_TILE_W || g.height !== HD250_TILE_H) throw new Error(`hd250: Kachel ${g.width}×${g.height} statt ${HD250_TILE_W}×${HD250_TILE_H}`);
    return g.values;
  } catch (err) {
    if (!signal?.aborted && !(err instanceof RadarImg404)) noteRadarCdnFailure();
    throw err;
  } finally { dl.done(); }
}

/** Only for the verifier/tests. */
export function _resetHd250Cache(): void { metaCache.clear(); }
