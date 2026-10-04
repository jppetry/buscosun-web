/**
 * Phase AW — visibility of Autobahnwetter (`audit/autobahnwetter.md`). Dependency-free on purpose: the start page,
 * the shared deck rail and the route import it; the contract re-exports `roadFlagFrom` for producer and verifiers.
 *
 * `ROAD_LIVE` is Jan's flag-on decision: switched on 03.10.2026 ("ja") ahead of Gate B/C — tile, palette entry, footer
 * link, rail icon and page are visible to everyone; `?road=0` / `localStorage.road = '0'` hides them per visitor
 * (D-31 pattern: the query beats localStorage, localStorage beats the default). Back: `false` and a push.
 */

/** On since 03.10.2026 (Jan), before Gate B/C — audit/autobahnwetter.md §13 names what is still open. */
export const ROAD_LIVE = true;

/** `?road=0|1` beats `localStorage.road`, which beats `ROAD_LIVE`. */
export function roadFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = ROAD_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('road'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('road') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

/** Remembers an explicit `?road=0|1` for the session's later navigations (the query is gone after the first click). */
export function rememberRoadFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('road'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('road', q); } catch { /* private mode: the query still works per page */ }
}
