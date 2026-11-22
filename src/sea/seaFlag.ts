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

/**
 * V-SW-20: hours in which the wave model has no water at the spot's cell are not classified ("keine Daten", reason
 * "Wasser an der Modellzelle fehlt") — on by default; `?seadry=0` = the classes as before (the display still says
 * "kein Seegang" instead of "0,0 m").
 */
export function seaDryRuleFrom(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('seadry') !== '0'; } catch { return true; }
}

/**
 * WL — the BSH water level forecast is ON by default (E-WL-1, Jan 12.10.2026: "den reinen Hinweis durch echte
 * Daten ersetzen"), a deliberate exception to the default-off rule, with the switch as the named fallback:
 * `?wl=0` starts the page without the gauge layer and without the water level card. The dock switch then
 * toggles it per session. Everything behind it is additive — with `?wl=0` the page is the one before WL.
 */
export function seaWaterLevelFrom(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('wl') !== '0'; } catch { return true; }
}

/**
 * ST-N — the hours before the newest BSH current run begins are read from the run before (`status.current.prev`,
 * `audit/seewetter-stroemung.md` §7). ON for everyone (Jan, 21.11.2026: "ja bitte, und diese Lücke beheben"), with the
 * switch as the named fallback: `?curprev=0` ignores the run before — the page as it was (those hours "keine Daten").
 */
export function seaCurrentPrevFrom(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('curprev') !== '0'; } catch { return true; }
}

/**
 * Phase TF — tide windows (`audit/tidenfenster.md`): the page's threshold control, the windows in chart and hourly
 * band, the gauge-with-curve fallback (E-WL-10) and the deviation area. Built default-off (Rule 2) and switched ON for
 * everyone on Jan's word, 18.11.2026 ("schalte es immer ein", E-TF-8) — before the visual check on a real device and
 * with `verify:sea-ui` red at HEAD (V-TF-5). `?tf=0` is the named fallback: the page as it was before TF.
 */
export const SEA_TIDE_WINDOW_LIVE = true;
export function seaTideWindowFrom(search: string = typeof location !== 'undefined' ? location.search : '', live: boolean = SEA_TIDE_WINDOW_LIVE): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('tf'); } catch { /* broken query = no vote */ }
  return q === '1' ? true : q === '0' ? false : live;
}

/**
 * Phase BS-P — wind particles on the Seewetter map (`audit/seewetter-binnenseen.md` §9, E-BS-11): the Wetterkarte's
 * `WindLayer` hooked into `SeaMap` with Jan's go (22.11.2026). Built default-off (Rule 2) and NOT seen in a browser by
 * the author: `?swp=1` shows the dock switch „Windpartikel“ (on) and loads the layer; without it the page is the one
 * before — no switch, no chunk, no layer. `SEA_PARTICLES_LIVE = true` after Jan's look turns it on for everyone
 * (`?swp=0` then is the named fallback).
 */
export const SEA_PARTICLES_LIVE = false;
export function seaParticlesFrom(search: string = typeof location !== 'undefined' ? location.search : '', live: boolean = SEA_PARTICLES_LIVE): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('swp'); } catch { /* broken query = no vote */ }
  return q === '1' ? true : q === '0' ? false : live;
}

/** Remembers an explicit `?sea=0|1` for the session's later navigations (the query is gone after the first click). */
export function rememberSeaFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('sea'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('sea', q); } catch { /* private mode: the query still works per page */ }
}
