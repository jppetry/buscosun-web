/**
 * Phase FI (AP11): URL switches of the point panel, kept pure so the verifier can check them without a browser.
 *   `?pf=cube`  → buscosun Fusion on the point cube (`pointSource: 'cube'`); anything else (missing, other value,
 *                 other case) → live, unchanged.
 *   `?pflog=1`  → timing/provenance block in cube mode; anything else → off.
 */
export type PfSource = 'live' | 'cube';

export function pfSourceFrom(search: string): PfSource {
  try { return new URLSearchParams(search).get('pf') === 'cube' ? 'cube' : 'live'; } catch { return 'live'; }
}

export function pfLogFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('pflog') === '1'; } catch { return false; }
}
