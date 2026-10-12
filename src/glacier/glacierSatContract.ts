/**
 * GL-2 — contract of the satellite line: elevation grids of the static tree, per-scene observations (`obs/`) and season series
 * (`season/`), the rules every value has to pass before it is written or shown. DOM-free and import-light: the producer
 * (`scripts/glacier/sat-scan.mjs`), the verifiers and the page share it.
 *
 * Honesty rules encoded here (plan §7): class A (≥ 1 km²) gets snow line, snow share, AAR and albedo; class B (0.1–1 km²) only
 * the snow share ("Ausaperung" = 1 − snow share) and albedo, never a snow line; class C and the four German glaciers get no
 * satellite number at all; a scene counts only with ≥ 70 % clear pixels in the glacier mask; "snow-covered" and "snow-free" are
 * states, never a snow line "below the tongue" or "above the summit" as an elevation.
 */
import { glacierClassOf, isGlacierId, type GlacierCountry, type GlacierClass } from './glacierContract';

export const GLACIER_DEM_CELL = 3600;
export const GLACIER_DEM_NODATA = -32768;
export const glacierDemFile = (region: string) => `dem/${region}.json`;
export const glacierObsPath = (year: number | string, tile: string, date: string) => `obs/${year}/${tile}/${date}.json`;
export const glacierSeasonPath = (year: number | string, region: string, stand: string) => `season/${year}/${region}/${stand}.json`;
export const GLACIER_TILE_RE = /^\d{2}[C-HJ-NP-X][A-HJ-NP-V][A-HJ-NP-V]$/;
export const GLACIER_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const GLACIER_STAND_RE = /^\d{8}T\d{4}Z$/;

/** Minimum share of clear (valid) pixels in the glacier mask for a scene to count (D-GL-4). */
export const GLACIER_SAT_MIN_CLEAR = 0.7;
/**
 * Snow decision: NDSI > 0.4 (Hall et al.; separates snow AND ice from rock) and green ≥ 0.45 (separates snow/firn from glacier ice: ice is
 * 0.2–0.4 in the visible, snow and firn 0.5–0.9 — measured profile of Hintereisferner 25.08.2025: ice 0.22–0.28 up to 3 000 m, snow 0.65–0.83
 * from 3 200 m). The 0.45 is `set` between the two modes; the B1 report states the sensitivity (0.40 / 0.45 / 0.50), it is not tuned on the gate data.
 */
export const GLACIER_NDSI_SNOW = 0.4;
export const GLACIER_SNOW_GREEN_MIN = 0.45;
/** Share of clear pixels at/above which a glacier counts as completely snow-covered / below which as snow-free. */
export const GLACIER_SNOW_COVERED_MIN = 0.98;
export const GLACIER_SNOW_FREE_MAX = 0.02;
/** Plausible band of a snow line outside the glacier's own elevation range (B1-5). */
export const GLACIER_SLA_MARGIN_M = 300;

// --- eligibility ------------------------------------------------------------------------------------------------

/** Satellite class of a catalogue entry: A and B outside Germany; everything else gets no satellite number. */
export function glacierSatClass(g: { country: GlacierCountry; area: { km2: number } }): 'A' | 'B' | null {
  if (g.country === 'DE') return null;
  const k: GlacierClass = glacierClassOf(g.area.km2);
  return k === 'A' || k === 'B' ? k : null;
}

// --- elevation grids -------------------------------------------------------------------------------------------

export interface GlacierDemGrid { x0: number; y1: number; nx: number; ny: number; z: string }
export interface GlacierDemDoc { schema: 1; kind: 'glacier/dem'; build: string; region: string; cell: number; nodata: number; glaciers: Record<string, GlacierDemGrid> }

/** Base64 (Int16 little-endian) → Int16Array. */
export function demDecode(g: GlacierDemGrid): Int16Array {
  const bin = atob(g.z); // browser and Node ≥ 16
  const n = bin.length >> 1;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); out[i] = (v << 16) >> 16; }
  return out;
}

/**
 * Elevation at lon/lat by bilinear interpolation between cell centres; `null` outside the grid or when a neighbour is a void.
 * Cell (i, j) covers [x0 + i, x0 + i + 1] / 3600 degrees of longitude and [y1 − j − 1, y1 − j] / 3600 of latitude.
 */
export function demSample(g: GlacierDemGrid, z: Int16Array, lon: number, lat: number): number | null {
  const u = lon * GLACIER_DEM_CELL - g.x0 - 0.5, v = g.y1 - lat * GLACIER_DEM_CELL - 0.5;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  if (i0 < 0 || j0 < 0 || i0 + 1 >= g.nx || j0 + 1 >= g.ny) return null;
  const fx = u - i0, fy = v - j0;
  const a = z[j0 * g.nx + i0], b = z[j0 * g.nx + i0 + 1], c = z[(j0 + 1) * g.nx + i0], d = z[(j0 + 1) * g.nx + i0 + 1];
  if (a === GLACIER_DEM_NODATA || b === GLACIER_DEM_NODATA || c === GLACIER_DEM_NODATA || d === GLACIER_DEM_NODATA) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function demProblems(doc: GlacierDemDoc, region: string, satIds: ReadonlySet<string>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/dem' || doc.schema !== 1) return ['kind/schema'];
  if (doc.region !== region) p.push(`Region ${doc.region} ≠ ${region}`);
  if (doc.cell !== GLACIER_DEM_CELL || doc.nodata !== GLACIER_DEM_NODATA) p.push('cell/nodata');
  for (const [id, g] of Object.entries(doc.glaciers ?? {})) {
    if (!isGlacierId(id)) { p.push(`${id}: ungültige ID`); continue; }
    if (!satIds.has(id)) p.push(`${id}: kein Satellitenkandidat (Klasse C oder DE) trägt kein DEM-Gitter`);
    if (!(g.nx > 4 && g.ny > 4 && g.nx * g.ny <= 4_000_000)) { p.push(`${id}: Maße ${g.nx}×${g.ny}`); continue; }
    const pad = g.z.endsWith('==') ? 2 : g.z.endsWith('=') ? 1 : 0;
    const bytes = (g.z.length * 3) / 4 - pad;
    if (bytes !== g.nx * g.ny * 2) p.push(`${id}: Länge ${bytes} ≠ ${g.nx * g.ny * 2}`);
  }
  return p;
}

// --- observations -----------------------------------------------------------------------------------------------

export type GlacierSatState = 'snow-covered' | 'snowline' | 'snow-free';
export const GLACIER_SAT_STATES: readonly GlacierSatState[] = ['snow-covered', 'snowline', 'snow-free'];
/** `schatten` and `schutt` belong to a scene; `neuschnee` is derived from two scenes and therefore lives in the season series only. */
export type GlacierSatFlag = 'neuschnee' | 'schatten' | 'schutt';
export const GLACIER_SAT_FLAGS: readonly GlacierSatFlag[] = ['neuschnee', 'schatten', 'schutt'];

export interface GlacierSatValue {
  /** share of clear pixels in the mask (≥ 0.7) */
  clear: number;
  /** snow share of the clear pixels, 0…1 */
  snow: number;
  state: GlacierSatState;
  /** class A, state `snowline` only: snow line [m a.s.l.] and the range in which the misfit stays within 2 % (set) */
  sla?: number; slaLo?: number; slaHi?: number;
  /** class A: share of the area above the snow line (1 snow-covered, 0 snow-free) */
  aar?: number;
  /** broadband albedo (Liang 2002, five Sentinel-2 bands) of the snow pixels / of the other clear pixels */
  alb?: { snow: number | null; ice: number | null };
  flags: GlacierSatFlag[];
}
export interface GlacierObsDoc {
  schema: 1; kind: 'glacier/obs'; tile: string; date: string; time: string; scene: string; sunElevation: number | null;
  /** thresholds in force, each marked `set` or `literature` (provenance rule) */
  params: Record<string, { v: number; origin: 'set' | 'literature' | 'measured' }>;
  /** DN offset decided per tile-day from the vegetation of the tile (see satcore): which scene, red p5 of the vegetation, offset applied */
  encoding?: Array<{ scene: string; vegPixels: number; redP5: number | null; offset: number }>;
  items: Record<string, GlacierSatValue>;
  /** glaciers of the tile that were looked at and not valued, with the reason */
  skipped: Array<{ id: string; reason: string }>;
}
export interface GlacierSatCatalogRow { country: GlacierCountry; area: { km2: number }; z: [number, number, number] }

/** Rules of one observation document; `[]` = fine. */
export function obsProblems(doc: GlacierObsDoc, cat: ReadonlyMap<string, GlacierSatCatalogRow>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/obs' || doc.schema !== 1) return ['kind/schema'];
  if (!GLACIER_TILE_RE.test(doc.tile)) p.push(`Kachel ${doc.tile}`);
  if (!GLACIER_DATE_RE.test(doc.date)) p.push(`Datum ${doc.date}`);
  if (!doc.scene) p.push('Szene fehlt');
  for (const [id, v] of Object.entries(doc.items ?? {})) {
    const g = cat.get(id);
    if (!g) { p.push(`${id}: nicht im Katalog`); continue; }
    const k = glacierSatClass(g);
    if (!k) { p.push(`${id}: Klasse/Land ohne Satellitenzahl`); continue; }
    if (!(v.clear >= GLACIER_SAT_MIN_CLEAR && v.clear <= 1)) p.push(`${id}: Klaranteil ${v.clear}`);
    if (!(v.snow >= 0 && v.snow <= 1)) p.push(`${id}: Schneeanteil ${v.snow}`);
    if (!GLACIER_SAT_STATES.includes(v.state)) p.push(`${id}: Zustand ${v.state}`);
    for (const f of v.flags ?? []) if (!GLACIER_SAT_FLAGS.includes(f)) p.push(`${id}: Marke ${f}`);
    const hasLine = v.sla != null || v.slaLo != null || v.slaHi != null;
    if (k === 'B' && (hasLine || v.aar != null)) p.push(`${id}: Klasse B trägt weder Schneegrenze noch AAR`);
    if (v.state !== 'snowline' && hasLine) p.push(`${id}: Schneegrenze im Zustand ${v.state}`);
    if (k === 'A' && v.state === 'snowline') {
      if (v.sla == null || v.slaLo == null || v.slaHi == null) p.push(`${id}: Zustand snowline ohne Schneegrenze`);
      else {
        if (!(v.slaLo <= v.sla && v.sla <= v.slaHi)) p.push(`${id}: Spanne um die Schneegrenze`);
        if (v.sla < g.z[0] - GLACIER_SLA_MARGIN_M || v.sla > g.z[2] + GLACIER_SLA_MARGIN_M) p.push(`${id}: Schneegrenze ${v.sla} m außerhalb [${g.z[0]} − 300, ${g.z[2]} + 300]`);
      }
      if (v.aar == null || !(v.aar >= 0 && v.aar <= 1)) p.push(`${id}: AAR ${v.aar}`);
    }
    if (k === 'A' && v.state === 'snow-covered' && v.aar !== 1) p.push(`${id}: schneebedeckt, aber AAR ≠ 1`);
    if (k === 'A' && v.state === 'snow-free' && v.aar !== 0) p.push(`${id}: schneefrei, aber AAR ≠ 0`);
    if (v.state === 'snow-covered' && v.snow < GLACIER_SNOW_COVERED_MIN) p.push(`${id}: schneebedeckt bei Schneeanteil ${v.snow}`);
    if (v.state === 'snow-free' && v.snow > GLACIER_SNOW_FREE_MAX) p.push(`${id}: schneefrei bei Schneeanteil ${v.snow}`);
    for (const a of [v.alb?.snow, v.alb?.ice]) if (a != null && !(a >= 0.02 && a <= 0.98)) p.push(`${id}: Albedo ${a}`);
  }
  for (const s of doc.skipped ?? []) if (!s.reason) p.push(`${s.id}: übersprungen ohne Grund`);
  return p;
}

// --- season series ----------------------------------------------------------------------------------------------

/** Row of a season series: [date, clear, snow, state (0 covered, 1 snowline, 2 free), sla|null, aar|null, albSnow|null, albIce|null, flags bitmask]. */
export type GlacierSeasonRow = [string, number, number, 0 | 1 | 2, number | null, number | null, number | null, number | null, number];
export const GLACIER_SEASON_COLS = Object.freeze(['date', 'clear', 'snow', 'state', 'sla', 'aar', 'albSnow', 'albIce', 'flags']);
export const glacierFlagsMask = (f: readonly GlacierSatFlag[]): number => f.reduce((m, x) => m | (1 << GLACIER_SAT_FLAGS.indexOf(x)), 0);
export const glacierFlagsOfMask = (m: number): GlacierSatFlag[] => GLACIER_SAT_FLAGS.filter((_, i) => (m & (1 << i)) !== 0);
export interface GlacierSeasonDoc {
  schema: 1; kind: 'glacier/season'; year: number; region: string; stand: string; builtAt: string;
  cols: string[]; glaciers: Record<string, GlacierSeasonRow[]>;
}
export function seasonProblems(doc: GlacierSeasonDoc, region: string, cat: ReadonlyMap<string, GlacierSatCatalogRow>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/season' || doc.schema !== 1) return ['kind/schema'];
  if (doc.region !== region) p.push(`Region ${doc.region} ≠ ${region}`);
  if (!GLACIER_STAND_RE.test(doc.stand)) p.push(`Stand ${doc.stand}`);
  if (JSON.stringify(doc.cols) !== JSON.stringify(GLACIER_SEASON_COLS)) p.push('Spalten');
  for (const [id, rows] of Object.entries(doc.glaciers ?? {})) {
    const g = cat.get(id);
    if (!g || !glacierSatClass(g)) { p.push(`${id}: keine Satellitenzahl erlaubt`); continue; }
    const k = glacierSatClass(g);
    let last = '';
    for (const r of rows) {
      if (!GLACIER_DATE_RE.test(r[0]) || r[0].slice(0, 4) !== String(doc.year)) p.push(`${id}: Datum ${r[0]}`);
      if (r[0] < last) p.push(`${id}: Zeilen nicht nach Datum geordnet`);
      last = r[0];
      if (!(r[1] >= GLACIER_SAT_MIN_CLEAR && r[1] <= 1) || !(r[2] >= 0 && r[2] <= 1)) p.push(`${id}: Anteile ${r[0]}`);
      if (k === 'B' && (r[4] != null || r[5] != null)) p.push(`${id}: Klasse B mit Schneegrenze ${r[0]}`);
      if (r[3] !== 1 && r[4] != null) p.push(`${id}: Schneegrenze im Zustand ${r[3]} ${r[0]}`);
      if (r[4] != null && (r[4] < g.z[0] - GLACIER_SLA_MARGIN_M || r[4] > g.z[2] + GLACIER_SLA_MARGIN_M)) p.push(`${id}: Schneegrenze ${r[4]} ${r[0]}`);
    }
  }
  return p;
}

// --- snow-line climatology (TSLA, class A only) -------------------------------------------------------------------------

export const GLACIER_CLIMA_MIN_N = 15;
export interface GlacierClimaCheckDoc { kind: string; schema: number; region: string; doy0: number; bin: number; glaciers: Record<string, { rgi7: string; n: number; weeks: Array<[number, number, number, number] | null> }> }
/** Rules of `clima/<region>.json`: only class-A glaciers outside Germany, ordered quantiles, ≥ 15 observations per week, elevations in the catalogue's range ± 600 m. */
export function climaProblems(doc: GlacierClimaCheckDoc, region: string, cat: ReadonlyMap<string, GlacierSatCatalogRow>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/clima' || doc.schema !== 1) return ['kind/schema'];
  if (doc.region !== region) p.push(`Region ${doc.region} ≠ ${region}`);
  if (!(doc.bin >= 1 && doc.doy0 >= 1)) p.push('Wochenraster');
  for (const [id, e] of Object.entries(doc.glaciers ?? {})) {
    const g = cat.get(id);
    if (!g || glacierSatClass(g) !== 'A') { p.push(`${id}: keine Klasse A außerhalb Deutschlands`); continue; }
    for (const w of e.weeks) {
      if (!w) continue;
      if (!(w[0] <= w[1] && w[1] <= w[2])) p.push(`${id}: Quantile nicht geordnet`);
      if (!(w[3] >= GLACIER_CLIMA_MIN_N)) p.push(`${id}: Woche mit ${w[3]} Beobachtungen`);
      if (w[0] < g.z[0] - 600 || w[2] > g.z[2] + 600) p.push(`${id}: Höhe ${w[0]}–${w[2]} außerhalb ${g.z[0]}–${g.z[2]} ± 600 m`);
    }
  }
  return p;
}
