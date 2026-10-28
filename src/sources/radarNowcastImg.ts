/**
 * Phase NC (`audit/radar-nowcast-dach.md`) — contract of the two derived nowcast products of the radar mirror that give
 * every part of DACH a 5-minute radar picture from now to +2 h (25 steps like DWD-RV):
 *
 *   radar/img/v1/rzc-nc/<YYYYMMDDTHHMM>/   CH: buscosun's own extrapolation of the MeteoSwiss rzc ANALYSIS at that stamp —
 *       f005.png … f120.png (24 frames, 710 × 640, `precipToU8` byte), g005…g120.png (dual: v1 byte + log plane, only when
 *       the analysis slot carries one), u005…u120.png (1 channel, 255 = UNKNOWN: the back-trajectory of the pixel starts
 *       outside the radar grid — rain could come from beyond it; drawn as a grey veil, never as "dry"), meta.json.
 *       Motion from the last 3–6 analyses (ONE translation per pair — the correlation shift of the 4×-coarsened frames,
 *       pairs weighted towards the newest; V-NC-7), the newest analysis shifted semi-Lagrangian 24 × 5 min. Honest label:
 *       „Hochrechnung buscosun aus MeteoSwiss-Radar".
 *
 *   radar/img/v1/inca-5m/<YYYYMMDDTHHMM>/   AT: the GeoSphere INCA run (reftime = stamp) refined to 5 minutes —
 *       f015.png … f180.png (34 frames, 701 × 431), g… dual when the run slot carries one, meta.json with the validity
 *       time of every frame (reftime + lead) and whether it is an INCA frame or an in-between picture shifted along the
 *       motion between its two INCA neighbours (NOT a linear fade: both neighbours advected towards the middle, like the
 *       map's HD-4 morph). Nothing is re-extrapolated — INCA is already an extrapolation. Honest label:
 *       „INCA-Nowcast · auf 5 min verfeinert". "Now" = the frame whose validity is nearest to now, with its age.
 *
 * ONE file for client (`radarNowcast.ts`), producer (`scripts/radar-mirror/radar-derive.mjs`) and verifier: paths, meta
 * schema with builders and parsers, the zone split of DACH (`radarZones.ts` carries the geometry), the honest words and
 * the switch. ON by default (E-NC-6, Jan 28.10.2026 "setze alles aktiv" — supersedes the brief's default-off, E-NC-4);
 * `?nc=0` (alias `?chnc=0`) or `localStorage.radarnc = '0'` is the named fallback: every reader then behaves exactly as
 * before Phase NC (ownership mask by country, AT by lead, CH analysis only).
 */

import { PRECIP_VMAX, type QuadCorners } from '../scalar/RainLayer';
import { RADAR_IMG_BASE, radarImgFrameFile, radarImgDualFile } from './radolanRuns';
import { RZC_IMG_WIDTH, RZC_IMG_HEIGHT, INCA_IMG_WIDTH, INCA_IMG_HEIGHT, type RadarImgDual, type RadarImgFrame } from './radarImg';

export const RADAR_NC_DEFAULT_ON = true;

/** `?nc=0|1` (alias `?chnc=`) beats `localStorage.radarnc`; default `RADAR_NC_DEFAULT_ON`. Pure (the verifier passes the strings). */
export function radarNcFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { const p = new URLSearchParams(search); q = p.get('nc') ?? p.get('chnc'); } catch { /* broken query = no vote */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarnc') : null; } catch { s = null; }
  }
  if (s === '0') return false;
  if (s === '1') return true;
  return RADAR_NC_DEFAULT_ON;
}

// --- steps and leads --------------------------------------------------------------------------------------------------

export const NC_STEP_MIN = 5;
/** CH extrapolation leads: 5 … 120 min (24 frames; lead 0 is the analysis in `rzc/<stamp>/`). */
export const RZC_NC_LEADS: readonly number[] = Object.freeze(Array.from({ length: 24 }, (_, i) => (i + 1) * NC_STEP_MIN));
/** INCA refined leads: 15 … 180 min in 5-min steps (34 frames; every third one is an INCA frame). */
export const INCA_5M_LEADS: readonly number[] = Object.freeze(Array.from({ length: 34 }, (_, i) => 15 + i * NC_STEP_MIN));
/** How many rzc analyses the motion estimate may use (the newest included) and how old the oldest may be. */
export const RZC_NC_SERIES_MAX = 6;
export const RZC_NC_SERIES_MIN = 3;
export const RZC_NC_SERIES_SPAN_MS = 30 * 60_000;
/** Coarsening of the motion estimate per grid (same as the map's HD-4 morph, `RADAR_MORPH_FACTOR`). */
export const NC_FLOW_FACTOR = Object.freeze({ rzc: 4, inca: 4 });
/** Farthest a nowcast frame may be from the asked validity time — half a step plus a little. */
export const NC_PICK_TOL_MS = 3 * 60_000;

// --- paths ------------------------------------------------------------------------------------------------------------

export const RZC_NC_SOURCE = 'rzc-nc';
export const INCA_5M_SOURCE = 'inca-5m';
/**
 * `?ncbase=<url>` — another base for the two products (the pattern of `?rucbase=`): a locally derived set served by the dev
 * server for a check before the mirror carries them. Default = the mirror's image base. Exact URL, no trailing slash.
 */
export function radarNcBaseFrom(search: string = typeof location !== 'undefined' ? location.search : ''): string {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('ncbase'); } catch { /* broken query = default */ }
  return q && /^(https?:\/\/|\/)/.test(q) ? q.replace(/\/+$/, '') : RADAR_IMG_BASE;
}
export function rzcNcImgDir(stamp: string, base: string = radarNcBaseFrom()): string { return `${base}/${RZC_NC_SOURCE}/${stamp}`; }
export function inca5mImgDir(stamp: string, base: string = radarNcBaseFrom()): string { return `${base}/${INCA_5M_SOURCE}/${stamp}`; }
/** Unknown mask of a CH extrapolation frame (`u005.png` …). */
export function rzcNcUnknownFile(leadMin: number): string { return `u${String(leadMin).padStart(3, '0')}.png`; }

/**
 * Gate of the CH extrapolation behind the rzc analysis: the mirror derives it right after the analysis (measured ≈ 3–6 s for
 * 24 frames on the Actions runner) and pushes both in one commit — the analysis gate plus a reserve.
 */
export const RZC_NC_GATE_EXTRA_MS = 30_000;

// --- honest words -----------------------------------------------------------------------------------------------------

export const RZC_NC_LABEL = 'Hochrechnung buscosun aus MeteoSwiss-Radar';
export const RZC_NC_ATTRIBUTION = 'MeteoSchweiz rzc (RR) · CC BY 4.0 · Hochrechnung buscosun';
export const INCA_5M_LABEL = 'INCA-Nowcast · auf 5 min verfeinert';
export const INCA_5M_ATTRIBUTION = 'GeoSphere INCA (RR) · CC BY 4.0 · 5-min-Zwischenbilder buscosun';
/** Weaknesses of the CH extrapolation, named in the product and on the page (set — Phase NC, not yet measured). */
export const RZC_NC_CAVEATS: readonly string[] = Object.freeze([
  'Stauniederschlag in den Alpen entsteht und vergeht am Ort — die Verschiebung sieht ihn nicht',
  'abgeschattete Täler: das Radar misst dort weniger, die Hochrechnung trägt den Fehlbetrag weiter',
  'kurzlebige Schauer: Entstehung und Zerfall sind nicht hochgerechnet, nur die Verschiebung',
]);
export const RZC_NC_UNKNOWN_WORD = 'grau = unbekannt (Regen könnte von außerhalb des Radargebiets kommen)';
export const INCA_5M_NOTE = 'Zwischenbilder entlang der Bewegung verschoben — flüssiger, nicht genauer';

// --- model crossover (point series) -----------------------------------------------------------------------------------
/**
 * Where the point series hands over from the radar nowcast to the model (RUC behind buscosun Fusion in DE, buscosun
 * Fusion with ICON-CH1 in CH, with INCA/AROME in AT): radar alone up to `crossoverMin`, then a soft ramp over
 * `NC_CROSSOVER_BLEND_MIN` to the model. Provenance per source: DWD-RV 120 min = its published skill horizon (set by the
 * DWD, the stand before Phase NC — unchanged); the CH extrapolation 60 min and INCA 120 min are SET (Phase NC) — the measured
 * crossover against stations is open (V-NC-1). `?nc=0` = the stand before (no ramp).
 */
export const NC_CROSSOVER_MIN: Readonly<Record<'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc', number>> = Object.freeze({
  radolan_rv: 120, inca_grid: 120, meteoswiss_rzc: 60,
});
export const NC_CROSSOVER_BLEND_MIN = 30;
export const NC_CROSSOVER_PROVENANCE: Readonly<Record<'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc', 'measured' | 'set'>> = Object.freeze({
  radolan_rv: 'measured', inca_grid: 'set', meteoswiss_rzc: 'set',
});

// --- meta schema --------------------------------------------------------------------------------------------------------

/** Mean motion of the extrapolation (over wet coarse cells): km/h and the direction the rain comes FROM (° meteorological). */
export interface NcMotion { speedKmh: number; fromDeg: number | null; pairs: number; wetCells: number }

export interface RzcNcImgMeta {
  schema: 1; source: 'rzc-nc'; stamp: string;
  /** Validity of the analysis the frames start from (ms) and its slot stamp (= `stamp`). */
  analysisAtMs: number;
  width: number; height: number; vMax: number;
  corners: QuadCorners;
  frames: RadarImgFrame[];            // lead 5 … 120, validAtMs each
  /** Unknown masks per lead (255 = unknown), same order as `frames`. */
  unknown: RadarImgFrame[];
  /** The analyses the motion was estimated from (slot stamps, ascending; the newest = `stamp`). */
  series: string[];
  motion: NcMotion;
  /**
   * `translation` (since V-NC-7, 28.10.2026): one correlation shift per pair of coarsened analyses (`factor`), searched within
   * ± `maxCoarse` coarse texels, laid over the whole grid; `horn-schunck` = the field of the first products (27.10.), still
   * accepted when read.
   */
  method:
    | { flow: 'translation'; factor: number; maxCoarse: number; sampling: 'wet-bilinear-round' }
    | { flow: 'horn-schunck'; factor: number; alpha: number; iters: number; sampling: 'wet-bilinear-round' };
  caveats: string[];
  label: string;
  dual?: RadarImgDual;
}

export interface Inca5mFrame extends RadarImgFrame {
  validAtMs: number;
  /** `inca` = a frame of the run; `between` = shifted along the motion between its two INCA neighbours. */
  kind: 'inca' | 'between';
}

export interface Inca5mImgMeta {
  schema: 1; source: 'inca-5m'; stamp: string;
  /** Reference time of the INCA run (ms) = stamp. */
  refAtMs: number;
  width: number; height: number; vMax: number;
  corners: QuadCorners;
  frames: Inca5mFrame[];              // lead 15 … 180 in 5-min steps
  method: { flow: 'horn-schunck'; factor: number; alpha: number; iters: number; between: 'advect-both-round' };
  label: string; note: string;
  dual?: RadarImgDual;
}

export function makeRzcNcImgMeta(a: {
  stamp: string; analysisAtMs: number; corners: QuadCorners; frames: RadarImgFrame[]; unknown: RadarImgFrame[];
  series: string[]; motion: NcMotion; method: RzcNcImgMeta['method']; dual?: RadarImgDual;
}): RzcNcImgMeta {
  return {
    schema: 1, source: 'rzc-nc', stamp: a.stamp, analysisAtMs: a.analysisAtMs,
    width: RZC_IMG_WIDTH, height: RZC_IMG_HEIGHT, vMax: PRECIP_VMAX, corners: a.corners,
    frames: a.frames, unknown: a.unknown, series: a.series, motion: a.motion, method: a.method,
    caveats: [...RZC_NC_CAVEATS], label: RZC_NC_LABEL, ...(a.dual ? { dual: a.dual } : {}),
  };
}

export function makeInca5mImgMeta(a: {
  stamp: string; refAtMs: number; corners: QuadCorners; frames: Inca5mFrame[]; method: Inca5mImgMeta['method']; dual?: RadarImgDual;
}): Inca5mImgMeta {
  return {
    schema: 1, source: 'inca-5m', stamp: a.stamp, refAtMs: a.refAtMs,
    width: INCA_IMG_WIDTH, height: INCA_IMG_HEIGHT, vMax: PRECIP_VMAX, corners: a.corners,
    frames: a.frames, method: a.method, label: INCA_5M_LABEL, note: INCA_5M_NOTE, ...(a.dual ? { dual: a.dual } : {}),
  };
}

function cornersOk(v: unknown): v is QuadCorners {
  return Array.isArray(v) && v.length === 4 && v.every((c) => Array.isArray(c) && c.length === 2 && c.every((x) => Number.isFinite(x)));
}
function frameRowOk(f: unknown, lead: number, file: string): f is RadarImgFrame {
  const x = f as RadarImgFrame | null;
  return !!x && typeof x === 'object' && x.lead === lead && x.file === file && Number.isFinite(x.bytes) && x.bytes > 0;
}
function dualOk(v: unknown, leads: readonly number[]): v is RadarImgDual {
  const d = v as RadarImgDual | null;
  if (!d || typeof d !== 'object' || !d.log || !Array.isArray(d.frames) || d.frames.length !== leads.length) return false;
  return d.frames.every((f, i) => f && f.lead === leads[i] && f.file === radarImgDualFile(f.lead) && Number.isFinite(f.bytes) && f.bytes > 0);
}
function motionOk(m: unknown): m is NcMotion {
  const x = m as NcMotion | null;
  return !!x && typeof x === 'object' && Number.isFinite(x.speedKmh) && x.speedKmh >= 0
    && (x.fromDeg === null || (Number.isFinite(x.fromDeg) && x.fromDeg >= 0 && x.fromDeg < 360))
    && Number.isInteger(x.pairs) && x.pairs >= 0 && Number.isInteger(x.wetCells) && x.wetCells >= 0;
}

/** Strict parser — the ONE rejection point of the client (drift guard like `parseRzcImgMeta`). */
export function parseRzcNcImgMeta(j: unknown): RzcNcImgMeta | null {
  const m = j as RzcNcImgMeta | null;
  if (!m || m.schema !== 1 || m.source !== 'rzc-nc') return null;
  if (m.width !== RZC_IMG_WIDTH || m.height !== RZC_IMG_HEIGHT || m.vMax !== PRECIP_VMAX) return null;
  if (typeof m.stamp !== 'string' || !Number.isFinite(m.analysisAtMs) || !cornersOk(m.corners)) return null;
  if (!Array.isArray(m.frames) || m.frames.length !== RZC_NC_LEADS.length) return null;
  if (!m.frames.every((f, i) => frameRowOk(f, RZC_NC_LEADS[i], radarImgFrameFile(RZC_NC_LEADS[i])) && Number.isFinite(f.validAtMs))) return null;
  if (!Array.isArray(m.unknown) || m.unknown.length !== RZC_NC_LEADS.length) return null;
  if (!m.unknown.every((f, i) => frameRowOk(f, RZC_NC_LEADS[i], rzcNcUnknownFile(RZC_NC_LEADS[i])))) return null;
  if (!Array.isArray(m.series) || !m.series.length || !m.series.every((s) => typeof s === 'string') || m.series[m.series.length - 1] !== m.stamp) return null;
  if (!motionOk(m.motion) || !m.method || (m.method.flow !== 'translation' && m.method.flow !== 'horn-schunck')) return null;
  if (!Array.isArray(m.caveats) || typeof m.label !== 'string') return null;
  if (m.dual !== undefined && !dualOk(m.dual, RZC_NC_LEADS)) return null;
  return m;
}

export function parseInca5mImgMeta(j: unknown): Inca5mImgMeta | null {
  const m = j as Inca5mImgMeta | null;
  if (!m || m.schema !== 1 || m.source !== 'inca-5m') return null;
  if (m.width !== INCA_IMG_WIDTH || m.height !== INCA_IMG_HEIGHT || m.vMax !== PRECIP_VMAX) return null;
  if (typeof m.stamp !== 'string' || !Number.isFinite(m.refAtMs) || !cornersOk(m.corners)) return null;
  // 1 … 34 frames on the 5-min raster, strictly ascending (a run with fewer INCA frames gives fewer refined ones, V-RL-2)
  if (!Array.isArray(m.frames) || m.frames.length < 1 || m.frames.length > INCA_5M_LEADS.length) return null;
  let prev = 0;
  for (const f of m.frames) {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.lead) || f.lead <= prev || f.lead % NC_STEP_MIN !== 0 || f.lead < 15 || f.lead > 180) return null;
    if (f.file !== radarImgFrameFile(f.lead) || !Number.isFinite(f.bytes) || f.bytes <= 0) return null;
    if (f.validAtMs !== m.refAtMs + f.lead * 60_000) return null;
    if (f.kind !== 'inca' && f.kind !== 'between') return null;
    if (f.kind === 'inca' && f.lead % 15 !== 0) return null;
    prev = f.lead;
  }
  if (!m.method || m.method.flow !== 'horn-schunck' || typeof m.label !== 'string') return null;
  if (m.dual !== undefined && !dualOk(m.dual, m.frames.map((f) => f.lead))) return null;
  return m;
}
