/**
 * Phase FX-UI (`audit/fusion-erklaerung.md`) — visibility of the buscosun Fusion explainer: the preview that replaces the block
 * "Fundament · Fusion Forecast" on the start page and the detail page `/buscosun-fusion`. Dependency-free on purpose: the start
 * page, the route table and the static-shell generator import it.
 *
 * `FUSION_EXPLAINER_LIVE` was `false` until Jan switched it on after the visual check (E-FXU-4, 02.11.2026: "schalte ihn aktiv"). `?fx=1` shows preview and route,
 * `?fx=0` forces the old block (D-31 pattern: the query beats `localStorage.fx`, `localStorage.fx` beats the constant).
 */
export const FUSION_EXPLAINER_LIVE = true as boolean;

/** `?fx=0|1` beats `localStorage.fx`, which beats `FUSION_EXPLAINER_LIVE`. */
export function fxFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
  live: boolean = FUSION_EXPLAINER_LIVE,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('fx'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('fx') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return live;
}

/** Remembers an explicit `?fx=0|1` for the later navigations of the visit (the tile click drops the query). */
export function rememberFxFlag(search: string = typeof location !== 'undefined' ? location.search : ''): void {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('fx'); } catch { return; }
  if (q !== '0' && q !== '1') return;
  try { localStorage.setItem('fx', q); } catch { /* private mode: the query still works per page */ }
}
