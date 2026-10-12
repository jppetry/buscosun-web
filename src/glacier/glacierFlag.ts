/**
 * Phase GL — visibility of the glacier page (`audit/gletscher.md`). Dependency-free on purpose: the start page, the shared
 * deck rail and the route import it; the contract does not (it carries only data rules).
 *
 * `GLACIER_LIVE` was `false` until Jan switched it on (2026-10-13, before Gate D — tile/page visibility only,
 * see audit/gletscher.md §0/§9 for Gate B1/C status): tile, palette entry, rail icon and page are now visible to
 * every visitor; `?gl=0` (remembered in `localStorage.gl`) still lets a visitor opt back out
 * (D-31 pattern: the query beats localStorage, localStorage beats the default).
 */

/** On since 2026-10-13 (Jan: "schalte sie aktiv"). Page stays `noindex` until Gate D (routes.ts). */
export const GLACIER_LIVE = true;

/** `?gl=0|1` beats `localStorage.gl`, which beats `GLACIER_LIVE`. */
export function glacierFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = GLACIER_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('gl'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('gl') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

/** Remembers an explicit `?gl=0|1` for the session's later navigations (the query is gone after the first click). */
export function rememberGlacierFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('gl'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('gl', q); } catch { /* private mode: the query still works per page */ }
}

/** `?gl3d=0` = the 3D stage is off (fallback to the 2D map), like `?z3d=0` for the cell towers. */
export function glacier3dFrom(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('gl3d') !== '0'; } catch { return true; }
}
