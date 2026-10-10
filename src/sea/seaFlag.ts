/**
 * Phase SW — visibility of Seewetter (`audit/seewetter.md`). Dependency-free on purpose: the start page, the shared
 * deck rail and the route import it; the contract re-exports `seaFlagFrom` for producer and verifiers.
 *
 * `SEA_LIVE` is Jan's flag-on decision: switched on 10.10.2026 ("in main freischalten") ahead of Gates B and D — tile,
 * palette entry, footer link, rail icon and page are visible to everyone; `?sea=0` / `localStorage.sea = '0'` hides
 * them per visitor (D-31 pattern: the query beats localStorage, localStorage beats the default). Back: `false` and a push.
 */

/** On since 10.10.2026 (Jan), before Gates B/D — audit/seewetter.md §14 names what is still open. */
export const SEA_LIVE = true;

/** `?sea=0|1` beats `localStorage.sea`, which beats `SEA_LIVE`. */
export function seaFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = SEA_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('sea'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('sea') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

/** Remembers an explicit `?sea=0|1` for the session's later navigations (the query is gone after the first click). */
export function rememberSeaFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('sea'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('sea', q); } catch { /* private mode: the query still works per page */ }
}
