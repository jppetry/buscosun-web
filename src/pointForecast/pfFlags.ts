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

/**
 * FR-2 (`audit/fusion-release.md` §8): the explicit choice for the parts that reach buscosun Fusion through `getFusionForecast`.
 *   `?pf=live` → every part on the live path (the same kill switch as the panel).
 *   `?pf=cube` → every part on the cube path, also a part that is not switched on yet (measurement, review).
 *   anything else → `null`: the register decides (`FUSION_PARTS`).
 */
export function pfForceFrom(search: string): PfSource | null {
  try { const v = new URLSearchParams(search).get('pf'); return v === 'live' || v === 'cube' ? v : null; } catch { return null; }
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

/**
 * E-AX-16/E-AX-17 (`audit/fusion-ausbau.md` §6m, „buscosun Fusion 8", Jan 02.10.2026 22:30 UTC): the radar hour mean of the mirror
 * (`m<lead>.png`, one file per hour) replaces the single nearest frame, reader and engine option together. Default ON.
 *   `?hm=0` → off: the named fallback to buscosun Fusion 7 (single frame per hour).
 *   anything else → on.
 */
export function pfHourMeanFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('hm') !== '0'; } catch { return true; }
}

/**
 * V-AW-33 („buscosun Fusion 9", Jan 04.10.2026): the anchor compares a measurement with the model value at the minute of the
 * measurement. Default ON.
 *   `?anc=0` → off: the named fallback to buscosun Fusion 8 (model value of the step within ±30 min).
 *   anything else → on.
 */
export function pfAnchorAtObsFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('anc') !== '0'; } catch { return true; }
}

/** AX-9: `?cg=1` reads `point/static/clima-grid` and takes its 1991–2020 normals as the daily mean of the temperature prior. */
export function pfClimaGridFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('cg') === '1'; } catch { return false; }
}

/**
 * Phase OF (`audit/obs-fusion.md` §5.1): every current station measurement comes from the mirror product `buscosun-data/obs/v1`
 * (`src/sources/obsStore.ts`). Default ON.
 *   `?obs=direct` → off: the named fallback — the provider adapters (BrightSky `current_weather`, TAWES current, SMN files) as before.
 *   anything else → on (the adapters stand in by themselves when the product cannot be read).
 */
export function pfObsStoreFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('obs') !== 'direct'; } catch { return true; }
}

/**
 * Phase OF (buscosun Fusion 12): the dense measurement set of the mirror product for the anchor (reader switch `CubeIo.obsDense`,
 * set by the stage). Default ON.
 *   `?dense=0` → off: the named fallback to the stand before (six nearest full stations).
 *   anything else → on.
 */
export function pfObsDenseFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('dense') !== '0'; } catch { return true; }
}

/**
 * V-AF-9 (`audit/autobahn-fusion12-lueckenlos.md` §8.3, part of buscosun Fusion 12): the reader of `obs/v1` takes the newest
 * value PER VARIABLE, each with its own stamp (the DWD temperature lags the rain stamp by 30 min in every half hour). Default ON.
 *   `?obsvar=0` → off: the named fallback — only the values at the station's newest stamp, exactly the reader before V-AF-9.
 *   anything else → on.
 */
export function pfObsVarFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('obsvar') !== '0'; } catch { return true; }
}

/**
 * V-AF-10 (`audit/autobahn-fusion12-lueckenlos.md` §8.4, part of buscosun Fusion 12): the anchor also pairs a measurement stamped
 * before the first axis step, with the native cube steps before it (`FuseCubeOptions.anchorBeforeAxis`). Default ON.
 *   `?ancpre=0` → off: the named fallback — such a measurement pairs only within 30 min of the first step, as before.
 *   anything else → on.
 */
export function pfAnchorBeforeAxisFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('ancpre') !== '0'; } catch { return true; }
}

export function pfStationSourceFrom(search: string): PfStationSource {
  try {
    const v = new URLSearchParams(search).get('st');
    return v === 's' ? 'mosmix_s' : v === 'fresh' ? 'freshest' : 'mosmix_l';
  } catch { return 'mosmix_l'; }
}
