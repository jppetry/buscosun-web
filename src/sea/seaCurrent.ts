/**
 * Phase ST — contract of the surface current on `/seewetter` (`audit/seewetter-stroemung.md`). Pure: read by the page,
 * by the producer `scripts/sea/sea-current.mjs`, by the archive and by `verify:sea-current`.
 *
 * Source: BSH operational circulation model, surface-current forecast as GRIB2 (packages `db` Deutsche Bucht and `wb`
 * Westliche Ostsee, ≈ 0.5 nm, 15 min, three days, two runs a day). The values are the mean of the upper 5 m (or down to
 * the bottom where the water is shallower) — a model, no basis for navigation. Both grids ARE the CWAM grid (measured),
 * so a spot's current is read at a cell of the same raster as its waves.
 *
 * What the page shows: hourly speed and the direction the current SETS TOWARDS, the next slack water from the 15-min
 * steps, the distance of the model cell, and the hint "Wind gegen Strom". That hint explains and nothing else: it never
 * changes a wave value or a class — CWAM already computes with the current (`audit/seewetter.md` §2.6).
 * A missing, late or unreadable run is "keine Daten" — never an older or invented value.
 * ST-N: the one place an older run speaks is the hours BEFORE the newest run begins (the 12 UTC run starts on the
 * following day): they are read from the run before, named as such, never mixed, and never for an hour the newest run
 * covers (`currentDocAt`). A run before that is too old, unreadable or absent leaves those hours "keine Daten".
 */
import { SEA_MODELS, SEA_CURRENT_ORIGIN, currentSeriesProblems, seaCurrentPath, seaRunMs } from './seaContract';

const H = 3_600_000;

// --- Source ------------------------------------------------------------------------------------------------------

export const BSH_CURRENT_NAME = 'Bundesamt für Seeschifffahrt und Hydrographie (BSH)';
/** The source note per feature (Jan, 18.11.). */
export const BSH_CURRENT_CREDIT = `Strömung: ${BSH_CURRENT_NAME}`;
/**
 * Licence as the data directory itself states it (`LICENSE.txt`, `README_en_de.txt`) and as the GDI-BSH catalogue states
 * it for the model currents: CC BY 4.0. The BSH download page names no licence (audit §1.5, E-ST-1).
 */
export const BSH_CURRENT_LICENCE = 'CC BY 4.0';
export const BSH_CURRENT_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/deed.de';
export const BSH_CURRENT_PAGE = 'https://www.bsh.de/DE/DATEN/Vorhersagen/Stroemungen/Oberflaechenstroemung_fuer_Segler/oberflaechenstroemung_fuer_segler_node.html';
/** What this page changed (CC BY: changes are indicated). */
export const BSH_CURRENT_CHANGED = 'auf volle Stunden gebracht, in Knoten umgerechnet, für die Karte ausgedünnt';
/** Stands next to every current value. */
export const SEA_CURRENT_MODEL_NOTE = 'Modell, Mittel der oberen 5 m, keine Navigationsgrundlage';
/** Added at Wadden-sea spots (`spot.tidal`). */
export const SEA_CURRENT_WATT_NOTE = 'Priele sind im Modell nicht aufgelöst.';

/** HTTPS: the public share the BSH page links to (WebDAV, no login). FTP: the same files, the named fallback. */
export const BSH_CURRENT_FILEBOX = 'https://filebox.bsh.de/remote.php/dav/public-files/Z8k9NMB3dKVpOXA/grib2';
export const BSH_CURRENT_FTP = 'ftp://ftp.bsh.de/Stroemungsvorhersagen/grib2';

export type BshCurrentPackage = 'db' | 'wb';
/** `col0` = the CWAM column of the package's first column (measured: `db` 0–239, `wb` 218–629). */
export const BSH_CURRENT_PACKAGES: Readonly<Record<BshCurrentPackage, { dir: string; ni: number; col0: number; label: string }>> = Object.freeze({
  db: { dir: 'Nordsee', ni: 240, col0: 0, label: 'Deutsche Bucht' },
  wb: { dir: 'Ostsee', ni: 412, col0: 218, label: 'Westliche Ostsee' },
});
export const BSH_CURRENT_PKGS = Object.freeze(['db', 'wb'] as const);
/** `Current_<pkg>_<YYYYMMDDHH>_<VV>.grb2` — the uncompressed GRIB2 file (never `.grb`, never `.bz2`). */
export const BSH_CURRENT_FILE_RE = /^Current_(db|wb)_(\d{10})_(\d\d)\.grb2$/;
export const bshCurrentFile = (pkg: BshCurrentPackage, run: string, day: string) => `Current_${pkg}_${run}_${day}.grb2`;

export interface BshGrid { ni: number; nj: number; la1: number; lo1: number; di: number; dj: number; scanMode: number }
/** Is this the grid the contract was measured on? Everything else is refused (a moved grid would move every spot). */
export function bshGridProblems(pkg: BshCurrentPackage, g: BshGrid): string[] {
  const c = SEA_MODELS.cwam.grid, p = BSH_CURRENT_PACKAGES[pkg], out: string[] = [];
  if (g.ni !== p.ni || g.nj !== c.nj) out.push(`${pkg}: ${g.ni} × ${g.nj} statt ${p.ni} × ${c.nj}`);
  if (Math.abs(g.di - c.di) > 1e-5 || Math.abs(g.dj - c.dj) > 1e-5) out.push(`${pkg}: Maschenweite ${g.di} / ${g.dj}`);
  if (Math.abs(g.lo1 - (c.lon1 + p.col0 * c.di)) > 1e-3) out.push(`${pkg}: Lo1 ${g.lo1}`);
  if (Math.abs(g.la1 - c.lat2) > 1e-3) out.push(`${pkg}: La1 ${g.la1}`);
  if (g.scanMode !== 64) out.push(`${pkg}: scanMode ${g.scanMode} statt 64 (S → N)`);
  return out;
}
/** Index into a package field (file scan order: rows from the SOUTH) of CWAM cell (i, j) — or −1 outside the package. */
export function bshIndexOfCwam(pkg: BshCurrentPackage, i: number, j: number): number {
  const p = BSH_CURRENT_PACKAGES[pkg], nj = SEA_MODELS.cwam.grid.nj, c = i - p.col0;
  return c < 0 || c >= p.ni || j < 0 || j >= nj ? -1 : (nj - 1 - j) * p.ni + c;
}

// --- Clock -------------------------------------------------------------------------------------------------------

export const BSH_CURRENT_STEP_MS = 15 * 60_000;
export const SEA_CURRENT_RUN_EVERY_MS = 12 * H;
/**
 * The producer does not ask the BSH for a run before this long after its nominal hour (`set`; measured: the 00 UTC run
 * stood on the FTP at +5:30 h and on the filebox at +5:52 h). Before it, and once the expected run is built, no listing
 * is read at all.
 */
export const SEA_CURRENT_GATE_MS = 4 * H;
/** A run is read only when its newest file has not changed for this long (`set`: the upload of a run took ≈ 35 s). */
export const SEA_CURRENT_SETTLE_MS = 5 * 60_000;
/**
 * A run older than this is not shown (`set`, the wave line's `SEA_DEAD_MS`): one missed run is bridged (the next one
 * stands ≈ 17.5 h after the run before), a second is not — "keine Daten" instead of an ageing forecast.
 */
export const SEA_CURRENT_DEAD_MS = 30 * H;
/** Runs kept in the store (file and field), the newest is the one `status.current` points to. */
export const SEA_CURRENT_KEPT = 2;
/** A run that could not be read is tried this often (≈ 80 MB each time), then the producer waits for the next run. */
export const SEA_CURRENT_MAX_TRIES = 3;
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 10);
/** The newest run that can stand at the BSH by the clock. */
export const currentExpectedRun = (nowMs: number): string => stamp(Math.floor((nowMs - SEA_CURRENT_GATE_MS) / SEA_CURRENT_RUN_EVERY_MS) * SEA_CURRENT_RUN_EVERY_MS);
export const seaCurrentDead = (run: string, nowMs: number): boolean => !(nowMs - seaRunMs(run) <= SEA_CURRENT_DEAD_MS);

// --- u/v → speed and "sets towards" -------------------------------------------------------------------------------

/**
 * A cell without current is not written as a missing value nor as an exact 0, but as the packed value nearest to 0
 * (packing step 0.5 or 1 mm/s). Measured on run 2026111800: a distinct cluster below 1 mm/s — in the German Bight it
 * follows the tide (348–2 371 cells per step: the cell has fallen dry in the model), in the Baltic it is almost fixed
 * (cells of the mask the model leads no water through). Provenance `measured`.
 */
export const BSH_CURRENT_ZERO_MS = 0.001;
export const MS_TO_KN = 1.943844;
/**
 * u (towards east) and v (towards north) in m/s → speed and the bearing the water moves TOWARDS (0° = north, 90° = east).
 * `null` for a masked value and for a cell without current.
 */
export function currentFlow(u: number, v: number): { ms: number; to: number } | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const ms = Math.hypot(u, v);
  if (ms < BSH_CURRENT_ZERO_MS) return null;
  return { ms, to: ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360 };
}
/** Stored columns: speed in cm/s and whole degrees. */
export const encodeCurrent = (f: { ms: number; to: number } | null): { cur: number | null; curTo: number | null } =>
  (f ? { cur: Math.round(f.ms * 100), curTo: ((Math.round(f.to) % 360) + 360) % 360 } : { cur: null, curTo: null });
export const currentKn = (cms: number | null | undefined): number | null => (cms == null ? null : (cms / 100) * MS_TO_KN);

// --- Slack water from the 15-min steps ----------------------------------------------------------------------------

/**
 * The flow of step `i` of a 15-min series — with one exception to `currentFlow`: a single step below the zero limit
 * between two steps WITH current is the moment the current turns (measured: Elbe at Wittenbergen, 15:45 UTC, 0.0 cm/s
 * between 10 cm/s downstream and 10 cm/s upstream), not a dry cell. It keeps its (tiny) speed; "no current" needs the
 * step before or after to be without current too.
 */
export function currentFlowAt(u: ArrayLike<number>, v: ArrayLike<number>, i: number): { ms: number; to: number } | null {
  const f = currentFlow(u[i], v[i]);
  if (f || !Number.isFinite(u[i]) || !Number.isFinite(v[i])) return f;
  const before = i > 0 ? currentFlow(u[i - 1], v[i - 1]) : null, after = i + 1 < u.length ? currentFlow(u[i + 1], v[i + 1]) : null;
  if ((i > 0 && !before) || (i + 1 < u.length && !after) || (!before && !after)) return null;
  return { ms: Math.hypot(u[i], v[i]), to: ((Math.atan2(u[i], v[i]) * 180) / Math.PI + 360) % 360 };
}

/**
 * "Stauwasser" as this page reads it from the model (`set`, named at the value): the weakest step within two hours
 * either side, around which the current turns — the flow two hours before and two hours after points into opposite
 * half-planes (more than 90° apart), both are a real flow (≥ 0.05 m/s ≈ 0.1 kn), and the minimum is at most half of the
 * weaker of the two. A cell that falls dry has no slack water (the water is gone, it does not turn), nor has a rotating
 * current that never weakens. Near the ends of the run the two hours shrink, to one hour at least. Resolution: the
 * 15-min step.
 */
export const SLACK_RULE = Object.freeze({ windowSteps: 8, minSideSteps: 4, minFlowMs: 0.05, depth: 0.5 });
export function slackTimes(t: ArrayLike<number>, u: ArrayLike<number>, v: ArrayLike<number>): number[] {
  const n = t.length, s = new Float64Array(n), W = SLACK_RULE.windowSteps;
  for (let k = 0; k < n; k++) s[k] = Math.hypot(u[k], v[k]);
  const out: number[] = [];
  for (let k = 1; k < n - 1; k++) {
    if (!currentFlowAt(u, v, k)) continue;                       // dry or missing
    const a = Math.max(0, k - W), b = Math.min(n - 1, k + W);
    if (k - a < SLACK_RULE.minSideSteps || b - k < SLACK_RULE.minSideSteps || t[b] - t[a] !== (b - a) * BSH_CURRENT_STEP_MS) continue;
    let min = true;
    for (let i = a; i <= b && min; i++) if (i !== k && (s[i] < s[k] || (s[i] === s[k] && i < k))) min = false;
    if (!min) continue;
    if (!(s[a] >= SLACK_RULE.minFlowMs && s[b] >= SLACK_RULE.minFlowMs)) continue;
    if (!(u[a] * u[b] + v[a] * v[b] < 0)) continue;
    if (!(s[k] <= SLACK_RULE.depth * Math.min(s[a], s[b]))) continue;
    out.push(t[k]);
  }
  return out;
}

// --- The cell of a spot -------------------------------------------------------------------------------------------

/** A spot farther than this from a cell with current gets none (`set`, the catalogue's `SEA_SPOT_MAX_CELL_KM`). */
export const SEA_CURRENT_MAX_CELL_KM = 3;
/** The nearest cell that is without current in at most this share of the run's steps (`set`, the wave rule V-SW-20). */
export const SEA_CURRENT_MAX_DRY_SHARE = 0.5;
export const currentDistKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// --- Wind against current -----------------------------------------------------------------------------------------

/**
 * Thresholds of the hint (`set`, shown with it): wind and current oppose by more than 120°, the wind is at least
 * 10 kn (from 4 Bft upwards the sea state reacts noticeably) and the current at least 0.5 kn.
 */
export const WAC_MIN_ANGLE_DEG = 120;
export const WAC_MIN_WIND_KN = 10;
export const WAC_MIN_CURRENT_KN = 0.5;
/** Angle between where the wind blows TO and where the current sets TO, 0–180° (180° = straight against each other). */
export function windCurrentAngle(windFromDeg: number, curToDeg: number): number {
  const windTo = windFromDeg + 180;
  return Math.abs(((((windTo - curToDeg) % 360) + 540) % 360) - 180);
}
export type WacReason = 'against' | 'no-wind' | 'no-current' | 'weak-wind' | 'weak-current' | 'angle';
export interface WacResult { against: boolean; angle: number | null; why: WacReason }
export function windAgainstCurrent(x: { windFromDeg: number | null | undefined; windKn: number | null | undefined; curToDeg: number | null | undefined; curKn: number | null | undefined }): WacResult {
  if (x.windFromDeg == null || x.windKn == null) return { against: false, angle: null, why: 'no-wind' };
  if (x.curToDeg == null || x.curKn == null) return { against: false, angle: null, why: 'no-current' };
  const angle = windCurrentAngle(x.windFromDeg, x.curToDeg);
  if (x.windKn < WAC_MIN_WIND_KN) return { against: false, angle, why: 'weak-wind' };
  if (x.curKn < WAC_MIN_CURRENT_KN) return { against: false, angle, why: 'weak-current' };
  return angle > WAC_MIN_ANGLE_DEG ? { against: true, angle, why: 'against' } : { against: false, angle, why: 'angle' };
}
const kn1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const WAC_TITLE = 'Wind gegen Strom';
/** The thresholds in words — stands under the hint, so nobody takes them for a law of nature. */
export const WAC_RULE_NOTE = `Gesetzte Schwellen dieses Hinweises: Wind ab ${WAC_MIN_WIND_KN} kn, Strom ab ${kn1(WAC_MIN_CURRENT_KN)} kn, Winkel über ${WAC_MIN_ANGLE_DEG}°.`;
/** Why the hint changes nothing above it. */
export const WAC_NEUTRAL_NOTE = 'Der Hinweis erklärt nur: Wellenwerte und Einordnung nach deinem Profil bleiben, wie sie sind — das Seegangsmodell CWAM rechnet die Strömung bereits ein.';
/** What the hint says for one hour (wind "from", current "to", both named with their own convention). */
export const wacSentence = (windFromText: string, windKn: number, curToText: string, curKn: number, angle: number): string =>
  `Der Wind kommt aus ${windFromText} (${kn1(windKn)} kn), der Strom setzt nach ${curToText} (${kn1(curKn)} kn): beide laufen fast gegeneinander (${Math.round(angle)}°). Wo Wind gegen Strom steht, werden Wellen kürzer und steiler.`;

// --- Thinned hourly field (map layer "Strömung") --------------------------------------------------------------------

/**
 * `current/<run>/f/<hhh>.png`: every `stride`-th CWAM cell from `off` on (90 × 55 cells, ≈ 6.3 km apart), one PNG per
 * whole hour. A cell is SAMPLED, never averaged (two opposing flows would cancel). R = speed in cm/s (0–253,
 * 254 = ≥ 2.54 m/s, 255 = no value); G = "sets towards" in 256 steps; B = 0; A = 255 with a value, 0 without (land,
 * masked, no current).
 */
export const SEA_CURRENT_FIELD = (() => {
  const g = SEA_MODELS.cwam.grid, stride = 7, off = 3;
  return Object.freeze({ stride, off, nx: Math.floor((g.ni - 1 - off) / stride) + 1, ny: Math.floor((g.nj - 1 - off) / stride) + 1 });
})();
export const SEA_CURRENT_FIELD_CLIP = 254;
export const SEA_CURRENT_FIELD_NULL = 255;
/** CWAM cell (i from west, j from north) of field cell (x, y), and its position. */
export function currentFieldCell(x: number, y: number): { i: number; j: number; lat: number; lon: number } {
  const g = SEA_MODELS.cwam.grid, f = SEA_CURRENT_FIELD, i = f.off + x * f.stride, j = f.off + y * f.stride;
  return { i, j, lat: g.lat1 - j * g.dj, lon: g.lon1 + i * g.di };
}
export function encodeCurrentPixel(out: Uint8Array | Uint8ClampedArray, o: number, f: { ms: number; to: number } | null): void {
  if (!f) { out[o] = SEA_CURRENT_FIELD_NULL; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return; }
  out[o] = Math.min(SEA_CURRENT_FIELD_CLIP, Math.round(f.ms * 100));
  out[o + 1] = Math.round((((f.to % 360) + 360) % 360) / (360 / 256)) % 256;
  out[o + 2] = 0; out[o + 3] = 255;
}
export function decodeCurrentPixel(rgba: ArrayLike<number>, o: number): { cms: number; to: number } | null {
  return rgba[o + 3] !== 255 || rgba[o] === SEA_CURRENT_FIELD_NULL ? null : { cms: rgba[o], to: (rgba[o + 1] * 360) / 256 };
}
/** Arrows are not drawn below this speed (`set`: 5 cm/s ≈ 0.1 kn — below it the direction is noise). */
export const SEA_CURRENT_ARROW_MIN_CMS = 5;
/**
 * The field as arrow points for a MapLibre symbol layer (like `sw-arrows`): `rot` = sets towards, `s` = icon scale by
 * speed, `kn` for the label, `lod` 0 for every second cell in both directions (shown at every zoom) and 1 for the rest.
 */
export function currentArrows(rgba: ArrayLike<number>): GeoJSON.FeatureCollection {
  const f = SEA_CURRENT_FIELD, features: GeoJSON.Feature[] = [];
  for (let y = 0; y < f.ny; y++) for (let x = 0; x < f.nx; x++) {
    const c = decodeCurrentPixel(rgba, (y * f.nx + x) * 4);
    if (!c || c.cms < SEA_CURRENT_ARROW_MIN_CMS) continue;
    const p = currentFieldCell(x, y);
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [+p.lon.toFixed(5), +p.lat.toFixed(5)] },
      properties: { rot: Math.round(c.to), s: +Math.min(1.25, 0.6 + c.cms / 160).toFixed(2), kn: +((c.cms / 100) * MS_TO_KN).toFixed(1), lod: x % 2 === 0 && y % 2 === 0 ? 0 : 1 },
    });
  }
  return { type: 'FeatureCollection', features };
}

// --- Hourly u/v field (phase SR, map layer „Strömung“ as ripples — audit/seewetter-riffel.md) -------------------------

/**
 * `current/<run>/uv/<hhh>.png`: every `stride`-th CWAM cell (315 × 194, ≈ 1.8 km), one PNG per whole hour, next to the
 * thinned arrow field. A cell is SAMPLED, never averaged. The components are kept, not speed and bearing: between two
 * hours the page mixes u and v linearly, so a turning current passes through zero instead of swinging round the compass.
 *
 * R = u (towards east), G = v (towards north) as signed values `(byte − 128) × stepMs`, byte 1–255 (± 2.54 m/s;
 * measured maximum of two runs 2.04 m/s). B = the mark: 0 = value, 255 = no value (no water point of the model).
 * ALPHA IS ALWAYS 255 — never data in alpha: a canvas read premultiplies, and alpha below 255 would change R and G.
 * A water cell without current (below `BSH_CURRENT_ZERO_MS`) is the value 0 / 0 — still water, not a hole.
 *
 * Stride 2 is the finest stride whose run stays within `SEA_CURRENT_UV_MAX_RUN_BYTES` (measured 18.11.2026 on run
 * 2026111812: stride 1 = 6.98 MB, stride 2 = 2.47 MB, stride 3 = 1.32 MB per run).
 */
export const SEA_CURRENT_UV = (() => {
  const g = SEA_MODELS.cwam.grid, stride = 2, off = 0;
  return Object.freeze({ stride, off, nx: Math.floor((g.ni - 1 - off) / stride) + 1, ny: Math.floor((g.nj - 1 - off) / stride) + 1, stepMs: 0.02 });
})();
/** Added size per run the u/v field may cost (`set`: just under a third of a wave run of 13.5 MB). */
export const SEA_CURRENT_UV_MAX_RUN_BYTES = 4_000_000;
export const SEA_CURRENT_UV_VALUE = 0;
export const SEA_CURRENT_UV_NULL = 255;
const uvByte = (ms: number) => Math.max(1, Math.min(255, 128 + Math.round(ms / SEA_CURRENT_UV.stepMs)));
/** CWAM cell (i from west, j from north) of u/v cell (x, y), and its position. */
export function currentUvCell(x: number, y: number): { i: number; j: number; lat: number; lon: number } {
  const g = SEA_MODELS.cwam.grid, f = SEA_CURRENT_UV, i = f.off + x * f.stride, j = f.off + y * f.stride;
  return { i, j, lat: g.lat1 - j * g.dj, lon: g.lon1 + i * g.di };
}
/** Fractional u/v grid coordinates of a position (x from west, y from north); may lie outside the grid. */
export function currentUvXY(lat: number, lon: number): { x: number; y: number } {
  const g = SEA_MODELS.cwam.grid, f = SEA_CURRENT_UV;
  return { x: ((lon - g.lon1) / g.di - f.off) / f.stride, y: ((g.lat1 - lat) / g.dj - f.off) / f.stride };
}
/** One pixel: `u`/`v` in m/s, or `null` for "no water point here". Alpha is 255 in both cases. */
export function encodeUvPixel(out: Uint8Array | Uint8ClampedArray, o: number, uv: { u: number; v: number } | null): void {
  out[o + 3] = 255;
  if (!uv || !Number.isFinite(uv.u) || !Number.isFinite(uv.v)) { out[o] = 0; out[o + 1] = 0; out[o + 2] = SEA_CURRENT_UV_NULL; return; }
  out[o] = uvByte(uv.u); out[o + 1] = uvByte(uv.v); out[o + 2] = SEA_CURRENT_UV_VALUE;
}
export function decodeUvPixel(rgba: ArrayLike<number>, o: number): { u: number; v: number } | null {
  return rgba[o + 2] !== SEA_CURRENT_UV_VALUE ? null : { u: (rgba[o] - 128) * SEA_CURRENT_UV.stepMs, v: (rgba[o + 1] - 128) * SEA_CURRENT_UV.stepMs };
}
/** The decoded field: components in m/s, `ok` = 1 where the model has a water point. */
export interface SeaUvGrid { nx: number; ny: number; u: Float32Array; v: Float32Array; ok: Uint8Array }
/**
 * RGBA bytes of one u/v image → the grid, or `null` for anything that is not the contract's image: wrong size, an
 * alpha other than 255 (then R and G cannot be trusted), a mark that is neither value nor null, a value byte 0.
 */
export function decodeUvField(rgba: ArrayLike<number>): SeaUvGrid | null {
  const { nx, ny, stepMs } = SEA_CURRENT_UV, n = nx * ny;
  if (rgba.length !== n * 4) return null;
  const u = new Float32Array(n), v = new Float32Array(n), ok = new Uint8Array(n);
  for (let p = 0, o = 0; p < n; p++, o += 4) {
    if (rgba[o + 3] !== 255) return null;
    const mark = rgba[o + 2];
    if (mark === SEA_CURRENT_UV_NULL) continue;
    if (mark !== SEA_CURRENT_UV_VALUE || rgba[o] === 0 || rgba[o + 1] === 0) return null;
    ok[p] = 1; u[p] = (rgba[o] - 128) * stepMs; v[p] = (rgba[o + 1] - 128) * stepMs;
  }
  return { nx, ny, u, v, ok };
}
/** Hour index of the u/v field for a valid time, or `null` (no field in this run, or the time lies outside it). */
export function currentUvHour(doc: Pick<SeaCurrentDoc, 't0' | 'uv'>, tMs: number): number | null {
  if (!doc.uv) return null;
  const k = (Math.floor(tMs / H) * H - doc.t0) / H;
  return Number.isInteger(k) && k >= 0 && k < doc.uv.hours ? k : null;
}

// --- Product `sea/v1/current/<run>.json` ----------------------------------------------------------------------------

export const SEA_CURRENT_PRODUCT = 'sea-current';
export interface SeaCurrentSpot {
  pkg: BshCurrentPackage;
  /** CWAM cell (column from west, row from north) the series is read at, and its distance from the spot. */
  cell: [number, number]; km: number;
  /** Share of the run's 15-min steps without current at this cell (0–1). */
  dry: number;
  cur: (number | null)[]; curTo: (number | null)[];
  /** Slack water: minutes after `t0`, ascending, on the 15-min raster. */
  slack: number[];
}
export interface SeaCurrentDoc {
  schema: 1; product: typeof SEA_CURRENT_PRODUCT; run: string; builtAt: string;
  /** First whole hour of the axis (ms) and the number of hourly slots. */
  t0: number; hours: number; stepMin: 15;
  source: string; via: 'filebox' | 'ftp'; licence: string; credit: string; note: string; changed: string;
  units: { cur: 'cm/s'; curTo: 'deg (sets towards)'; slack: 'min after t0' };
  origin: typeof SEA_CURRENT_ORIGIN;
  files: { name: string; bytes: number; sha256: string }[];
  spots: Record<string, SeaCurrentSpot>;
  failed: { id: string; error: string }[];
  /** The thinned hourly field next to the file, or `null` (then the map layer has nothing to show). */
  field: { hours: number; nx: number; ny: number; stride: number; off: number; bytes: number } | null;
  /** Phase SR: the hourly u/v field next to the file; absent or `null` = none (a run built before the phase, or `SEA_CURRENT_UV=0`). */
  uv?: { hours: number; nx: number; ny: number; stride: number; off: number; stepMs: number; bytes: number } | null;
}

/** Value lock of the product (producer before writing, client before display). */
export function seaCurrentProblems(doc: unknown): string[] {
  const d = doc as Partial<SeaCurrentDoc> | null;
  if (!d || d.product !== SEA_CURRENT_PRODUCT || d.schema !== 1) return ['kein sea-current-Dokument'];
  const out: string[] = [];
  if (typeof d.run !== 'string' || !/^\d{8}(00|12)$/.test(d.run)) out.push(`run ${String(d.run)}`);
  if (typeof d.builtAt !== 'string' || !Number.isFinite(Date.parse(d.builtAt))) out.push('builtAt');
  if (!Number.isFinite(d.t0) || (d.t0 as number) % H !== 0) out.push('t0');
  if (!Number.isInteger(d.hours) || (d.hours as number) < 1 || (d.hours as number) > 120) out.push(`hours ${String(d.hours)}`);
  if (d.licence !== BSH_CURRENT_LICENCE || d.credit !== BSH_CURRENT_CREDIT) out.push('Quellenvermerk');
  if (!Array.isArray(d.failed)) out.push('failed');
  // SR: a u/v field must be the contract's grid and coding — a foreign one would put every ripple in the wrong place.
  if (d.uv != null) {
    const f = SEA_CURRENT_UV, x = d.uv;
    if (x.nx !== f.nx || x.ny !== f.ny || x.stride !== f.stride || x.off !== f.off || x.stepMs !== f.stepMs) out.push('uv: fremdes Gitter oder fremde Stufe');
    if (!Number.isInteger(x.hours) || x.hours < 1 || x.hours > (d.hours as number)) out.push(`uv: hours ${String(x.hours)}`);
  }
  if (!d.spots || typeof d.spots !== 'object') { out.push('spots'); return out; }
  const hours = d.hours as number;
  for (const [id, s] of Object.entries(d.spots)) {
    if (s.pkg !== 'db' && s.pkg !== 'wb') out.push(`${id}: Paket ${String(s.pkg)}`);
    if (!Array.isArray(s.cell) || s.cell.length !== 2 || !s.cell.every(Number.isInteger)) out.push(`${id}: Zelle`);
    if (!(s.km >= 0 && s.km <= SEA_CURRENT_MAX_CELL_KM)) out.push(`${id}: Zelle ${s.km} km entfernt`);
    if (!(s.dry >= 0 && s.dry <= SEA_CURRENT_MAX_DRY_SHARE)) out.push(`${id}: ohne Strömung in ${s.dry} der Schritte`);
    const pr = currentSeriesProblems(s, hours);
    if (pr.length) out.push(`${id}: ${pr.slice(0, 2).join('; ')}`);
    else if (!s.cur.some((x) => x != null)) out.push(`${id}: leer`);
    if (!Array.isArray(s.slack) || s.slack.some((m, i) => !Number.isInteger(m) || m % 15 !== 0 || m < -60 || m > hours * 60 || (i > 0 && m <= s.slack[i - 1]))) out.push(`${id}: Stauwasser-Zeiten`);
  }
  return out;
}

/**
 * ST-N (V-ST-1, V-SR-1): the run BEFORE the newest one, as it still stands in the store. The 12 UTC run of the BSH begins
 * on the following day at 01:00 UTC, so from the moment the pointer moves to it (≈ 18 UTC) until then no hour from "now"
 * on lies inside it. Those hours are read from the run before — never an hour the newest run covers itself.
 */
export interface SeaCurrentPrevPointer { run: string; path: string; builtAt: string; /** First whole hour of its axis (ms) and its hourly slots. */ t0: number; hours: number }
/** `status.json` → `current`: the newest run. Anything malformed counts as "none". */
export interface SeaCurrentPointer {
  run: string; path: string; builtAt: string; field: boolean;
  /** Phase SR: the run carries the hourly u/v field. */
  uv?: boolean;
  /** ST-N: the run before; absent = the store holds none (or a status written before ST-N). */
  prev?: SeaCurrentPrevPointer;
}
const RUN_RE = /^\d{8}(00|12)$/;
/** The `prev` entry of the pointer — well-formed, older than `run` and matching its path, or `null`. */
export function currentPrevPointerOf(prev: unknown, run: string): SeaCurrentPrevPointer | null {
  const q = prev as Partial<SeaCurrentPrevPointer> | null | undefined;
  if (!q || typeof q.run !== 'string' || !RUN_RE.test(q.run) || !(q.run < run) || q.path !== seaCurrentPath(q.run)) return null;
  if (typeof q.builtAt !== 'string' || !Number.isFinite(Date.parse(q.builtAt))) return null;
  if (!Number.isFinite(q.t0) || (q.t0 as number) % H !== 0 || !Number.isInteger(q.hours) || (q.hours as number) < 1 || (q.hours as number) > 120) return null;
  return { run: q.run, path: q.path, builtAt: q.builtAt, t0: q.t0 as number, hours: q.hours as number };
}
export function currentPointerOf(status: Record<string, unknown> | null | undefined): SeaCurrentPointer | null {
  const p = status?.current as (Partial<SeaCurrentPointer> & { field?: unknown; uv?: unknown; prev?: unknown }) | undefined;
  if (!p || typeof p.run !== 'string' || typeof p.path !== 'string' || typeof p.builtAt !== 'string') return null;
  if (p.path !== seaCurrentPath(p.run) || !Number.isFinite(Date.parse(p.builtAt))) return null;
  const prev = currentPrevPointerOf(p.prev, p.run);
  return { run: p.run, path: p.path, builtAt: p.builtAt, field: !!p.field, uv: !!p.uv, ...(prev ? { prev } : {}) };
}
/**
 * Does the page need the run before? Only while the hour of "now" lies before the newest run, the run before reaches
 * that hour and is itself not older than the page shows a run (`SEA_CURRENT_DEAD_MS`). Otherwise `null` — no read.
 */
export function currentPrevWanted(ptr: Pick<SeaCurrentPointer, 'prev'> | null | undefined, doc: Pick<SeaCurrentDoc, 't0'> | null | undefined, nowMs: number): SeaCurrentPrevPointer | null {
  const p = ptr?.prev;
  if (!p || !doc || seaCurrentDead(p.run, nowMs)) return null;
  const hour = Math.floor(nowMs / H) * H;
  return hour < doc.t0 && p.t0 < doc.t0 && hour < p.t0 + p.hours * H ? p : null;
}
/**
 * The run that speaks for the hour of `tMs`: the newest from its first hour on; before it the run before, when the page
 * holds one that has begun by then. Whether that run still REACHES the hour is the reader's check (`currentUvHour`,
 * `currentFieldHour`, the series length) — a run that ended earlier leaves "keine Daten", as before.
 */
export function currentDocAt<T extends { t0: number }>(doc: T | null | undefined, prev: T | null | undefined, tMs: number): T | null {
  if (!doc) return null;
  const hour = Math.floor(tMs / H) * H;
  return prev && hour < doc.t0 && hour >= prev.t0 ? prev : doc;
}

// --- Reading the product on the page --------------------------------------------------------------------------------

/**
 * A spot's current on the hour axis of a wave run (`runMs`, `hours` slots): knots and "sets towards". Hours the file
 * does not cover stay `null` — nothing is carried beyond its ends, nothing interpolated.
 */
export function currentOnAxis(doc: Pick<SeaCurrentDoc, 't0'>, s: Pick<SeaCurrentSpot, 'cur' | 'curTo'>, runMs: number, hours: number): { kn: (number | null)[]; to: (number | null)[] } {
  const at = <T,>(col: (number | null)[], f: (x: number) => T) => Array.from({ length: hours }, (_, i) => {
    const k = (runMs + i * H - doc.t0) / H;
    const q = Number.isInteger(k) && k >= 0 && k < col.length ? col[k] : null;
    return q == null ? null : f(q);
  });
  return { kn: at(s.cur, (x) => currentKn(x) as number), to: at(s.curTo, (x) => x) };
}
/**
 * ST-N: the same axis from what the page holds — hours before the newest run's first hour come from the run before
 * (when it carries the spot), every hour from there on from the newest run. `null` = the newest run has no series here.
 */
export function currentAxisOf(load: Pick<SeaCurrentLoad, 'doc' | 'prev'>, spotId: string, runMs: number, hours: number): { kn: (number | null)[]; to: (number | null)[] } | null {
  const doc = load.doc, s = doc?.spots[spotId];
  if (!doc || !s) return null;
  const a = currentOnAxis(doc, s, runMs, hours), ps = load.prev?.spots[spotId];
  if (!load.prev || !ps) return a;
  const b = currentOnAxis(load.prev, ps, runMs, hours);
  for (let i = 0; i < hours; i++) if (runMs + i * H < doc.t0) { a.kn[i] = b.kn[i]; a.to[i] = b.to[i]; }
  return a;
}
/** Slack-water times of a spot (ms). */
export const currentSlacks = (doc: Pick<SeaCurrentDoc, 't0'>, s: Pick<SeaCurrentSpot, 'slack'>): number[] => s.slack.map((m) => doc.t0 + m * 60_000);
/** The first slack water at or after `fromMs`, or `null` (none within the run). */
export function currentNextSlack(doc: Pick<SeaCurrentDoc, 't0'>, s: Pick<SeaCurrentSpot, 'slack'>, fromMs: number): number | null {
  for (const t of currentSlacks(doc, s)) if (t >= fromMs) return t;
  return null;
}
/** Hour index of the file's axis for a valid time, or `null` outside it (the map layer then shows nothing). */
export function currentFieldHour(doc: Pick<SeaCurrentDoc, 't0' | 'field'>, tMs: number): number | null {
  if (!doc.field) return null;
  const k = (Math.floor(tMs / H) * H - doc.t0) / H;
  return Number.isInteger(k) && k >= 0 && k < doc.field.hours ? k : null;
}

// --- The chosen hour on the page (pure — `verify:sea-current` reads it without a browser) -----------------------------

/**
 * What the page knows about the current file: the checked document, or why there is none. `prev` (ST-N) is the checked
 * run before, present only while the page needs it (`currentPrevWanted`) and only next to a good `doc`.
 */
export interface SeaCurrentLoad { doc: SeaCurrentDoc | null; state: 'ok' | 'none' | 'dead' | 'error'; why: string | null; prev?: SeaCurrentDoc }
export const SEA_CURRENT_WHY = Object.freeze({
  none: 'Im Datenspeicher liegt noch keine Strömungsvorhersage des BSH.',
  dead: 'Der letzte Lauf der Strömungsvorhersage des BSH ist älter als 30 Stunden und wird nicht mehr gezeigt.',
  shape: 'Die Datei mit der Strömungsvorhersage ist nicht lesbar (unerwartete Form).',
  net: 'Die Datei mit der Strömungsvorhersage ist gerade nicht erreichbar.',
  killed: 'Die Veröffentlichung ist angehalten (Kill-Schalter des Datenspeichers).',
});
export const SEA_CURRENT_NONE: SeaCurrentLoad = { doc: null, state: 'none', why: SEA_CURRENT_WHY.none };
/** Pure part of the page's read: pointer + what was fetched → what may be shown. */
export function currentLoadOf(ptr: SeaCurrentPointer | null, fetched: unknown, nowMs: number, fetchedPrev?: unknown): SeaCurrentLoad {
  if (!ptr) return SEA_CURRENT_NONE;
  if (seaCurrentDead(ptr.run, nowMs)) return { doc: null, state: 'dead', why: SEA_CURRENT_WHY.dead };
  const d = fetched as SeaCurrentDoc | null;
  if (!d || d.product !== SEA_CURRENT_PRODUCT || d.run !== ptr.run || seaCurrentProblems(d).length) return { doc: null, state: 'error', why: SEA_CURRENT_WHY.shape };
  // ST-N: the run before is taken only when the page needs it, it is the file the pointer names, and it passes the same
  // value lock. Anything else leaves the page as it was before ST-N (the hours before the newest run stay empty).
  const want = currentPrevWanted(ptr, d, nowMs), q = fetchedPrev as SeaCurrentDoc | null | undefined;
  const prev = want && q && q.product === SEA_CURRENT_PRODUCT && q.run === want.run && q.t0 === want.t0 && q.t0 < d.t0 && !seaCurrentProblems(q).length ? q : null;
  return prev ? { doc: d, state: 'ok', why: null, prev } : { doc: d, state: 'ok', why: null };
}

/**
 * The current of one spot at the chosen hour, as the readout shows it. `gap` says why an hour of a spot WITH a series
 * carries no value: before or beyond the run, or no current at the model cell that hour.
 */
export interface SeaCurrentView {
  state: 'loading' | 'ok' | 'none';
  /** `none`: the reason in words (no file, too old, unreadable, no cell for this spot). */
  why: string | null;
  kn: number | null; to: number | null;
  gap: 'before' | 'beyond' | 'dry' | null;
  /** First and last hour of the series (ms). */
  from: number | null; until: number | null;
  /** The first slack water at or after the later of now and the chosen hour; `null` = none in the rest of the run. */
  nextSlack: number | null;
  km: number | null; pkg: BshCurrentPackage | null; run: string | null;
  /** Share of the run's steps without current at the cell. */
  dry: number | null;
  wac: WacResult;
  /**
   * ST-N: set when the chosen hour is read from the run BEFORE the newest one — the first hour of the newest run (ms).
   * `run`, `km`, `pkg` and `dry` then describe the run before. `null` = the hour belongs to the newest run.
   */
  newerFrom: number | null;
}
export function currentViewOf(x: { load: SeaCurrentLoad | 'loading'; spotId: string; tMs: number; nowMs: number; windFromDeg: number | null | undefined; windKn: number | null | undefined }): SeaCurrentView {
  const empty = { kn: null, to: null, gap: null, from: null, until: null, nextSlack: null, km: null, pkg: null, run: null, dry: null, wac: { against: false, angle: null, why: 'no-current' as const }, newerFrom: null };
  if (x.load === 'loading') return { state: 'loading', why: null, ...empty };
  const doc = x.load.doc;
  if (!doc) return { state: 'none', why: x.load.why ?? SEA_CURRENT_WHY.none, ...empty };
  const s = doc.spots[x.spotId];
  if (!s) {
    const f = doc.failed.find((e) => e.id === x.spotId);
    return { state: 'none', why: f ? `Für diesen Spot gibt es keinen Strömungswert: ${f.error}.` : 'Für diesen Spot trägt der Lauf der Strömungsvorhersage keine Reihe.', ...empty, run: doc.run };
  }
  const hour = Math.floor(x.tMs / H) * H;
  // ST-N: an hour before the newest run is read from the run before, when the page holds it and it carries this spot.
  const prev = x.load.prev ?? null, ps = prev?.spots[x.spotId] ?? null;
  const older = !!prev && !!ps && currentDocAt(doc, prev, hour) === prev;
  const d = older ? (prev as SeaCurrentDoc) : doc, e = older ? (ps as SeaCurrentSpot) : s;
  const k = (hour - d.t0) / H;
  const inside = Number.isInteger(k) && k >= 0 && k < e.cur.length;
  const kn = inside ? currentKn(e.cur[k]) : null, to = inside ? e.curTo[k] : null;
  const until = doc.t0 + (s.cur.length - 1) * H, fromMs = Math.max(x.nowMs, hour);
  // Slack water: before the newest run begins the run before knows it (its window is whole there); from then on the newest.
  const early = prev && ps ? currentSlacks(prev, ps).find((t) => t >= fromMs && t < doc.t0) ?? null : null;
  return {
    state: 'ok', why: null, kn, to, gap: kn != null ? null : k < 0 ? 'before' : !inside ? 'beyond' : 'dry',
    from: prev && ps ? Math.min(prev.t0, doc.t0) : doc.t0, until, nextSlack: early ?? currentNextSlack(doc, s, fromMs), km: e.km, pkg: e.pkg, run: d.run, dry: e.dry,
    wac: windAgainstCurrent({ windFromDeg: x.windFromDeg, windKn: x.windKn, curToDeg: to, curKn: kn }),
    newerFrom: older ? doc.t0 : null,
  };
}
