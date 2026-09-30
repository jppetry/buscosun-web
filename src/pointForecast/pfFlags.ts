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

/**
 * AX-8 (`audit/fusion-ausbau.md` §6b): which station product feeds the station member of buscosun Fusion.
 *   `?st=s`      → MOSMIX-S (`point/stations-s/`, hourly runs); without an S run in the index the reader falls back to L and says so.
 *   `?st=fresh`  → the younger run of MOSMIX-S and MOSMIX-L.
 *   anything else → MOSMIX-L (the default, byte-identical to the state before AX-8).
 */
export type PfStationSource = 'mosmix_l' | 'mosmix_s' | 'freshest';

/** AX-10: `?inca=1` adds the INCA analysis (GeoSphere, 1 km, hourly) at the point as an anchor observation in Austria. */
export function pfIncaAnchorFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('inca') === '1'; } catch { return false; }
}

/** AX-9: `?cg=1` reads `point/static/clima-grid` and takes its 1991–2020 normals as the daily mean of the temperature prior. */
export function pfClimaGridFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('cg') === '1'; } catch { return false; }
}

export function pfStationSourceFrom(search: string): PfStationSource {
  try {
    const v = new URLSearchParams(search).get('st');
    return v === 's' ? 'mosmix_s' : v === 'fresh' ? 'freshest' : 'mosmix_l';
  } catch { return 'mosmix_l'; }
}
