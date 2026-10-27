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

// --- AW-8 (audit/autobahnwetter.md §19): the hazard rail and detail view, behind their own switch -----------------

/**
 * `ROAD_HZ_LIVE` = Jan's flag-on decision for the hazard rail (Gate C+). Off: the right column is exactly the page of
 * AW-5/AW-6.1b. `?roadhz=0|1` beats `localStorage.roadhz`, which beats the constant — the same order as `?road`.
 */
export const ROAD_HZ_LIVE = true;

export function roadHzFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = ROAD_HZ_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('roadhz'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('roadhz') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

export function rememberRoadHzFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('roadhz'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('roadhz', q); } catch { /* private mode */ }
}

// --- Phase FB (audit/autobahn-fahrbahn.md): the road surface forecast, behind its own switch -------------------

/**
 * `ROAD_SURFACE_LIVE` = Jan's flag-on decision (E-FB-10, 26.10.2026: „du kannst es gerne einschalten" — ahead of a green
 * Gate D-T, see `audit/autobahn-fahrbahn.md` §5.5; the page shows the surface only in runs that carry it, i.e. once the
 * table is in the data repo). Off: the page says „Luft" as before and the surface series stay unread. `?rsfc=0|1` beats
 * `localStorage.rsfc`, which beats the constant. Back: `false` and a push, or `?rsfc=0` per visitor.
 */
export const ROAD_SURFACE_LIVE = true;

export function roadSurfaceFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = ROAD_SURFACE_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('rsfc'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('rsfc') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

export function rememberRoadSurfaceFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('rsfc'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('rsfc', q); } catch { /* private mode */ }
}

// --- AW-6.2 VS (audit/autobahnwetter.md §20): the virtual road sensor, behind its own switch ---------------------

/**
 * `ROAD_VS_LIVE` = Jan's flag-on decision after Gate G (E-VS-2). Off: the page shows measurements, FB-1 and „Messlücke →
 * unbekannt" exactly as before; the VS runs in the shadow. `?roadvs=0|1` beats `localStorage.roadvs`, which beats the constant.
 */
export const ROAD_VS_LIVE = false;

export function roadVsFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = ROAD_VS_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('roadvs'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('roadvs') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

export function rememberRoadVsFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('roadvs'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('roadvs', q); } catch { /* private mode */ }
}
