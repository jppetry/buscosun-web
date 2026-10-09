/**
 * Phase ZT (`audit/zelltuerme-3d.md`, E-ZT-9): switch and view of the 3D stage "Zelltürme auf Gelände".
 *
 * On by default since Jan's go (09.10.2026, "du kannst das featur einschalten"); `?z3d=0` (also `false`/`off`) is the
 * named fallback = the Regenradar exactly as before ZT. The start view stays "Karte" — the 3D chunk loads only when
 * "Karte + 3D", "3D" or the mobile tab is chosen.
 * `?ansicht3d=map|split|3d` opens the page in that view (read once at mount).
 * Import-free on purpose: the deck reads it eagerly, everything else of ZT is a lazy chunk.
 */

export type View3d = 'map' | 'split' | '3d';

export const VIEW3D_PARAM = 'ansicht3d';
const VIEWS: readonly View3d[] = ['map', 'split', '3d'];

/** On unless `?z3d=0` (also `false`/`off`). */
export function towers3dEnabledFrom(search: string): boolean {
  const v = new URLSearchParams(search).get('z3d');
  return !(v === '0' || v === 'false' || v === 'off');
}

/** View from the URL; unknown or missing ⇒ `map`. */
export function view3dFrom(search: string): View3d {
  const v = new URLSearchParams(search).get(VIEW3D_PARAM);
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as View3d) : 'map';
}

// No writer on purpose (V-ZT-4): `NowcastRoute` rebuilds the URL on every camera move from the extra keys parsed at
// mount, so a later write of `ansicht3d` would be overwritten. The view is read once and then lives in state.

/** Labels of the topbar switch (wording of the reference `regenradar2-desktop.dc.html`). */
export const VIEW3D_LABEL: Readonly<Record<View3d, string>> = Object.freeze({ map: 'Karte', split: 'Karte + 3D', '3d': '3D' });
