/**
 * URL switches of the point panel, kept pure so the verifier can check them without a browser.
 *
 * Phase FS (Jan, 29.09.2026): buscosun Fusion on the point cube is the DEFAULT of the panel — the newest stage
 * (`audit/fusion-stationswert.md` §7). Until then (phase FI, AP11) it ran only behind `?pf=cube`.
 *   `?pf=live`  → the live path (the panel as before the switch) — the named fallback and kill switch.
 *   anything else (missing, `?pf=cube`, another value, another case) → buscosun Fusion on the point cube
 *                 (`pointSource: 'cube'`). If the cube path fails, the panel falls back to the live path by itself.
 *   `?pflog=1`  → timing/provenance block in cube mode; anything else → off.
 */
export type PfSource = 'live' | 'cube';

export function pfSourceFrom(search: string): PfSource {
  try { return new URLSearchParams(search).get('pf') === 'live' ? 'live' : 'cube'; } catch { return 'cube'; }
}

export function pfLogFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('pflog') === '1'; } catch { return false; }
}
