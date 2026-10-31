/**
 * Vereinheitlichter Radar-Frame-Stack (DE/AT/CH) + Session-Past-Cache.
 *
 * Bündelt die drei bestehenden Nowcast-Quellen zu EINEM Stack mit pro Frame:
 * absoluter Zeit, Lead (− = gemessene Vergangenheit), und `measured`-Flag für
 * den ehrlichen Messung↔Vorhersage-Bruch der Timeline (§2).
 *
 *   DE → DWD RADOLAN-RV   (25 Frames, 0…+120 min, 5-min, Analyse bei lead 0)
 *   AT → GeoSphere INCA   (12 Frames, +15…+180 min, 15-min, keine Analyse)
 *   CH → MeteoSwiss rzc   (1 Frame, Analyse „jetzt", kein Radar-Forecast)
 *
 * „Gemessene Vergangenheit" bauen wir OHNE Archiv-API: die App cached die
 * jeweils gemessene Analyse über die Session (in-memory) und stellt sie der
 * Timeline als negative Leads voran. Anfangs nur t=0, wächst mit Laufzeit.
 */

import type { Country } from '../types';
import type { QuadCorners } from '../scalar/RainLayer';
import { fetchRvNowcast, fetchRvAnalysisSequence, de1200WarpMesh, DE1200_WARP_N } from '../sources/radolan';
import { fetchIncaGrid } from '../sources/geosphereIncaGrid';
import { incaWarpMesh, INCA_WARP_N } from '../sources/geosphereIncaGeo';
import { fetchRzcLatest, fetchRzcAnalysisSequence, type RadarFrame as RzcFrame } from '../sources/meteoSwissRadar';
import type { RvPastFrame } from '../scalar/precipComposite';
import { rzcWarpMesh, RZC_WARP_N } from '../sources/meteoSwissGeo';
// Phase NC (`audit/radar-nowcast-dach.md`): AT refined to 5 min, CH analysis + extrapolation — 25 steps from now to +2 h like DE.
import { fetchRzcNowcast, fetchInca5m } from '../sources/radarNowcast';
import { radarImgStamp } from '../sources/radarImg';
import { RZC_NC_LABEL, RZC_NC_ATTRIBUTION, INCA_5M_LABEL, INCA_5M_ATTRIBUTION, NC_CROSSOVER_MIN, RZC_NC_UNKNOWN_WORD } from '../sources/radarNowcastImg';

export type RadarSourceId = 'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc';

export interface RadarFrame {
  values: Uint8Array;
  /** Phase SE (V-SE-3): the mirror's log plane (HD-3) when the slot carries one — the profile map draws measured frames
   *  from it like „jetzt"; the legacy radar map and every other reader keep `values`. */
  values2?: Uint8Array;
  width: number;
  height: number;
  /** absolute Validitätszeit (UTC-ms). */
  timeMs: number;
  /** Versatz vom Lauf in Minuten — negativ = gemessene Vergangenheit. */
  leadMinutes: number;
  /** gemessene Analyse (true) vs. extrapolierter Nowcast (false). */
  measured: boolean;
  /** Phase NC (CH extrapolation): 255 = unknown — rain could come from beyond the radar grid; absent on every other frame. */
  unknown?: Uint8Array;
}

export interface RadarStack {
  country: Country;
  source: RadarSourceId;
  sourceLabel: string;
  attribution: string;
  corners: QuadCorners;
  frames: RadarFrame[];
  /** Index des „jetzt"-Frames (lead 0) in `frames`. */
  nowIndex: number;
  runAtMs: number;
  fetchedAtMs: number;
  /** Frame-Schritt im Nowcast (min). */
  stepMin: number;
  /** Skill-Horizont (min) — bis hierhin minutengenaue Extrapolation. */
  skillMin: number;
  /** Projektionskorrektes Warp-Mesh des Quellgitters (DE polar-stereografisch,
   *  AT Lambert, CH LV95/somerc — seit RP2 für alle drei). Wenn gesetzt, rendert
   *  der RainLayer ein gekrümmtes Mesh statt des linearen 4-Eck-Quads (sonst bis
   *  ~40 km Versatz im Inneren; AT/CH einige km). */
  warpLnglat?: Float32Array;
  warpN?: number;
  /** Zeilen des Meshs, falls ≠ warpN (lat/lon-Quads unterteilen nur in Breite, §15). */
  warpRows?: number;
  /** Phase NC: honest words for the deck — what "now" is (AT: the INCA frame nearest to now, with its run and age), the
   *  weaknesses of the CH extrapolation, the unknown areas. Absent = the stand before Phase NC. */
  ageNote?: string;
  caveats?: string[];
  unknownNote?: string;
}

const SRC_LABEL: Record<RadarSourceId, string> = {
  radolan_rv: 'DWD RADOLAN-RV',
  inca_grid: 'GeoSphere INCA',
  meteoswiss_rzc: 'MeteoSchweiz rzc',
};
const SRC_ATTR: Record<RadarSourceId, string> = {
  radolan_rv: 'DWD RADOLAN-RV · CC BY 4.0',
  inca_grid: 'GeoSphere INCA (RR) · CC BY 4.0',
  meteoswiss_rzc: 'MeteoSchweiz rzc (RR) · CC BY 4.0',
};

// ---------------------------------------------------------------------------
// Session-Past-Cache (in-memory, pro Quelle) — gemessene Analysen sammeln
// ---------------------------------------------------------------------------

const MAX_PAST = 24;            // bis zu 2 h (DE 5-min) bzw. mehr bei gröberem Raster
const PAST_WINDOW_MIN = 120;    // nur die letzten 2 h vorhalten

/** `corners`: the grid of an rzc analysis (the profile map draws the CH look-back on it); RV is always DE1200. */
interface PastEntry { timeMs: number; values: Uint8Array; values2?: Uint8Array; width: number; height: number; corners?: QuadCorners }
const pastCache = new Map<RadarSourceId, PastEntry[]>();

/** Legt die gemessene Analyse in den Session-Cache (dedupe nach Minute). true = neu aufgenommen. */
function rememberMeasured(source: RadarSourceId, e: PastEntry): boolean {
  const arr = pastCache.get(source) ?? [];
  const minute = Math.round(e.timeMs / 60_000);
  const added = !arr.some((p) => Math.round(p.timeMs / 60_000) === minute);
  if (added) arr.push(e);
  arr.sort((a, b) => a.timeMs - b.timeMs);
  // Fenster + Obergrenze einhalten.
  const cutoff = e.timeMs - PAST_WINDOW_MIN * 60_000;
  const trimmed = arr.filter((p) => p.timeMs >= cutoff).slice(-MAX_PAST);
  pastCache.set(source, trimmed);
  return added && trimmed.includes(e);
}

/** A slot the session cache already holds (same minute) — the seed skips it instead of downloading it again. */
function heldMeasured(source: RadarSourceId, timeMs: number): boolean {
  const minute = Math.round(timeMs / 60_000);
  return (pastCache.get(source) ?? []).some((p) => Math.round(p.timeMs / 60_000) === minute);
}

/**
 * Liefert die gemessenen Vergangenheits-Frames (älter als runAt) als
 * RadarFrame[] mit negativem Lead. Pur & testbar.
 */
export function pastFrames(source: RadarSourceId, runAtMs: number): RadarFrame[] {
  const arr = pastCache.get(source) ?? [];
  return arr
    .filter((p) => p.timeMs < runAtMs)
    .map((p) => ({
      values: p.values, ...(p.values2 ? { values2: p.values2 } : {}), width: p.width, height: p.height, timeMs: p.timeMs,
      leadMinutes: Math.round((p.timeMs - runAtMs) / 60_000), measured: true,
    }));
}

/** Nur für Tests: Cache leeren. */
export function _resetPastCache(): void { pastCache.clear(); }
/** Nur für Tests: Eintrag direkt einspeisen. */
export function _seedPast(source: RadarSourceId, e: PastEntry): void { rememberMeasured(source, e); }

/** Anzahl gemessener 5-min-Analysen, die der DE-Rückblick-Loop aus dem RV-Archiv
 *  nachlädt — ~45 min. Bewusst moderat: jeder Lauf ist ein eigener ~1,6-MB-Tar
 *  (Download + Decode), daher progressiv im Hintergrund (nicht im Kaltstart). */
export const DE_PAST_SEED_FRAMES = 9;

/**
 * Best-effort: füllt den DE-Session-Past-Cache aus dem gemessenen RV-Analysen-
 * Archiv (letzte `count` 5-min-Analysen, DE1200-Gitter), damit der Rückblick-Loop
 * kurz nach dem Öffnen gefüllt ist statt erst über die Sitzung zu wachsen. Schwer
 * (dekodiert RV-Tars) → NICHT im Kaltstart-Pfad aufrufen. true = Frames ergänzt.
 */
export async function seedDePastArchive(count: number, signal?: AbortSignal): Promise<boolean> {
  try {
    const seq = await fetchRvAnalysisSequence(count, signal, (ms) => heldMeasured('radolan_rv', ms));
    let added = false;
    for (const a of seq.frames) {
      if (rememberMeasured('radolan_rv', { timeMs: a.validAt.getTime(), values: a.values, ...(a.values2 ? { values2: a.values2 } : {}), width: a.width, height: a.height })) added = true;
    }
    return added;
  } catch {
    return false; // Archiv nicht erreichbar / zu wenige Läufe → Session-Cache genügt
  }
}

/** Phase RA (V-RA-3): measured rzc analyses the CH look-back seeds from the mirror (24 slots = 2 h there) — as many as DE. */
export const CH_PAST_SEED_FRAMES = DE_PAST_SEED_FRAMES;

/**
 * Phase RA (V-RA-3): like `seedDePastArchive` for a Swiss place — the last `count` rzc analyses from the mirror into the
 * session cache (with their log plane, V-SE-3), so the look-back is there right after opening instead of growing over the
 * session. Cheap (≈ 15 KB per slot). true = frames added.
 */
export async function seedChPastArchive(count: number, signal?: AbortSignal): Promise<boolean> {
  try {
    const frames = await fetchRzcAnalysisSequence(count, signal);
    let added = false;
    for (const f of frames) {
      if (rememberMeasured('meteoswiss_rzc', { timeMs: f.validAt.getTime(), values: f.values, ...(f.values2 ? { values2: f.values2 } : {}), width: f.width, height: f.height, corners: f.corners })) added = true;
    }
    return added;
  } catch {
    return false;
  }
}

/**
 * Look-back for every place (31.10.): the measured analyses of the last 40 min (8 slots + the newest) of BOTH sources from
 * buscosun-data — RV (`radar/img/v1/rv/`, `rv-past/`) and rzc (`rzc/`) — into the session cache, whatever country the place
 * is in. Slots the cache holds are skipped, so a refresh loads only the new one. true = frames added.
 */
export async function seedPastAll(signal?: AbortSignal): Promise<boolean> {
  const [de, ch] = await Promise.all([seedDePastArchive(DE_PAST_SEED_FRAMES, signal), seedChPastArchive(CH_PAST_SEED_FRAMES, signal)]);
  return de || ch;
}

/** The session look-back of both sources by validity time (newest analysis included) — the profile map's `radarPast`. */
export function sessionPast(): { rv: RvPastFrame[]; rzc: RzcFrame[] } {
  const rv = (pastCache.get('radolan_rv') ?? []).map((p): RvPastFrame => ({ validAt: new Date(p.timeMs), values: p.values, ...(p.values2 ? { values2: p.values2 } : {}), width: p.width, height: p.height }));
  const rzc = (pastCache.get('meteoswiss_rzc') ?? []).flatMap((p): RzcFrame[] => (p.corners ? [{ validAt: new Date(p.timeMs), values: p.values, ...(p.values2 ? { values2: p.values2 } : {}), width: p.width, height: p.height, corners: p.corners }] : []));
  return { rv, rzc };
}

/** The stack with its own source's look-back re-read from the session cache (after `seedPastAll`) — no download. AT unchanged. */
export function withSessionPast(st: RadarStack): RadarStack {
  if (st.source === 'inca_grid') return st;
  const frames = [...pastFrames(st.source, st.runAtMs), ...st.frames.filter((f) => f.leadMinutes >= 0)].sort((a, b) => a.timeMs - b.timeMs);
  const nowIndex = frames.findIndex((f) => f.leadMinutes === 0);
  return { ...st, frames, nowIndex: nowIndex >= 0 ? nowIndex : st.nowIndex };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/** Lädt den Radar-Stack für ein Land (inkl. Session-Past, falls vorhanden). */
export async function getRadarStack(country: Country, signal?: AbortSignal): Promise<RadarStack> {
  if (country === 'DE') return loadDe(signal);
  if (country === 'AT') return loadAt(signal);
  if (country === 'CH') return loadCh(signal);
  throw new Error(`Kein Radar-Nowcast für Land ${country}`);
}

async function loadDe(signal?: AbortSignal): Promise<RadarStack> {
  const rv = await fetchRvNowcast(signal);
  const runAtMs = rv.runAt.getTime();
  const nowcast: RadarFrame[] = rv.frames.map((f) => ({
    values: f.values, ...(f.values2 ? { values2: f.values2 } : {}), width: f.width, height: f.height,
    timeMs: runAtMs + f.leadMinutes * 60_000,
    leadMinutes: f.leadMinutes, measured: f.leadMinutes === 0,
  }));
  const analysis = nowcast.find((f) => f.leadMinutes === 0);
  // V-SE-3: the analysis keeps its log plane in the session cache — when the next run arrives it is the newest look-back frame.
  if (analysis) rememberMeasured('radolan_rv', { timeMs: analysis.timeMs, values: analysis.values, ...(analysis.values2 ? { values2: analysis.values2 } : {}), width: analysis.width, height: analysis.height });
  const past = pastFrames('radolan_rv', runAtMs);
  // DE1200 ist polar-stereografisch → projektionskorrektes Warp-Mesh mitgeben.
  return { ...assemble('DE', 'radolan_rv', rv.corners, [...past, ...nowcast], runAtMs, 5, 120), warpLnglat: de1200WarpMesh(), warpN: DE1200_WARP_N };
}

/** Phase NC: the 2-h window of the AT stack counts from now — frames valid up to now + 2 h (+ half a step); none before now. */
const NC_WINDOW_MS = 120 * 60_000 + 2.5 * 60_000;
const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

async function loadAt(signal?: AbortSignal): Promise<RadarStack> {
  const grid = await fetchIncaGrid(signal);
  // Phase NC: the run refined to 5 min, picked by VALIDITY time (reftime + lead) — "now" = the frame nearest to now, with its age.
  const inca5 = await fetchInca5m(grid.stamp ?? null, signal).catch(() => null);
  if (inca5 && inca5.frames.length) {
    const now = Date.now();
    const frames: RadarFrame[] = inca5.frames
      .filter((f) => f.validAt.getTime() >= now - 2.5 * 60_000 && f.validAt.getTime() <= now + NC_WINDOW_MS)
      .map((f) => ({ values: f.values, ...(f.values2 ? { values2: f.values2 } : {}), width: f.width, height: f.height, timeMs: f.validAt.getTime(), leadMinutes: Math.round((f.validAt.getTime() - now) / 60_000), measured: false }));
    if (frames.length) {
      const st = assemble('AT', 'inca_grid', inca5.corners, frames, now, 5, NC_CROSSOVER_MIN.inca_grid, { nowNearest: now, label: INCA_5M_LABEL, attribution: INCA_5M_ATTRIBUTION });
      const nowFrame = st.frames[st.nowIndex];
      const ageMin = Math.max(0, Math.round((now - inca5.refAt.getTime()) / 60_000));
      st.ageNote = `INCA-Lauf ${fmtClock(inca5.refAt.getTime())} (vor ${ageMin} min) · „jetzt" = Bild gültig ${fmtClock(nowFrame.timeMs)} · ${inca5.note}`;
      return { ...st, warpLnglat: incaWarpMesh(inca5.corners), warpN: INCA_WARP_N };
    }
  }
  const anchor = Date.now() - (Date.now() % 60_000);
  const nowcast: RadarFrame[] = grid.frames.map((f) => {
    const leadMinutes = Math.round(f.leadHours * 60);
    return { values: f.values, width: f.width, height: f.height, timeMs: anchor + leadMinutes * 60_000, leadMinutes, measured: false };
  });
  // INCA hat keine eigene Analyse → der jüngste Frame dient nur dem Nowcast.
  // Lambert-Gitter → projektionskorrektes Warp-Mesh mitgeben (RP2; ohne wäre das
  // Raster gegenüber der Punktabfrage um Kilometer versetzt gezeichnet).
  return {
    ...assemble('AT', 'inca_grid', grid.corners, nowcast, anchor, 15, 120),
    warpLnglat: incaWarpMesh(grid.corners), warpN: INCA_WARP_N,
  };
}

async function loadCh(signal?: AbortSignal): Promise<RadarStack> {
  const fr = await fetchRzcLatest(signal);
  const t = fr.validAt.getTime();
  rememberMeasured('meteoswiss_rzc', { timeMs: t, values: fr.values, ...(fr.values2 ? { values2: fr.values2 } : {}), width: fr.width, height: fr.height, corners: fr.corners });
  const analysis: RadarFrame = { values: fr.values, ...(fr.values2 ? { values2: fr.values2 } : {}), width: fr.width, height: fr.height, timeMs: t, leadMinutes: 0, measured: true };
  const past = pastFrames('meteoswiss_rzc', t);
  // Phase NC: buscosun's extrapolation behind the analysis — 24 × 5 min, by validity time, each with its unknown mask.
  const nc = await fetchRzcNowcast(radarImgStamp(t), signal).catch(() => null);
  if (nc && nc.frames.length) {
    const fut: RadarFrame[] = nc.frames
      .filter((f) => f.validAt.getTime() > t)
      .map((f) => ({ values: f.values, ...(f.values2 ? { values2: f.values2 } : {}), width: f.width, height: f.height, timeMs: f.validAt.getTime(), leadMinutes: Math.round((f.validAt.getTime() - t) / 60_000), measured: false, unknown: f.unknown }));
    // Phase NC-B: a blended product names itself (`meta.label`); a pure translation carries `RZC_NC_LABEL`.
    const st = assemble('CH', 'meteoswiss_rzc', fr.corners, [...past, analysis, ...fut], t, 5, NC_CROSSOVER_MIN.meteoswiss_rzc, { label: nc.label || RZC_NC_LABEL, attribution: RZC_NC_ATTRIBUTION });
    st.caveats = nc.caveats;
    st.unknownNote = RZC_NC_UNKNOWN_WORD;
    st.ageNote = `Analyse ${fmtClock(t)} · Zugrichtung aus ${nc.series.length} Bildern: ${nc.motion.speedKmh.toFixed(0).replace('.', ',')} km/h${nc.motion.fromDeg != null ? ` aus ${nc.motion.fromDeg}°` : ' (keine Bewegung messbar)'}`;
    return { ...st, warpLnglat: rzcWarpMesh(fr.corners), warpN: RZC_WARP_N };
  }
  // LV95/somerc-Gitter → projektionskorrektes Warp-Mesh (RP2, s. loadAt).
  return {
    ...assemble('CH', 'meteoswiss_rzc', fr.corners, [...past, analysis], t, 5, 0),
    warpLnglat: rzcWarpMesh(fr.corners), warpN: RZC_WARP_N,
  };
}

function assemble(
  country: Country, source: RadarSourceId, corners: QuadCorners,
  frames: RadarFrame[], runAtMs: number, stepMin: number, skillMin: number,
  opts: { nowNearest?: number; label?: string; attribution?: string } = {},
): RadarStack {
  frames.sort((a, b) => a.timeMs - b.timeMs);
  let nowIndex = frames.findIndex((f) => f.leadMinutes === 0);
  if (opts.nowNearest != null) {
    // Phase NC (AT): „jetzt" = the frame whose validity is nearest to now.
    let bd = Infinity;
    frames.forEach((f, i) => { const d = Math.abs(f.timeMs - opts.nowNearest!); if (d < bd) { bd = d; nowIndex = i; } });
  }
  if (nowIndex < 0) {
    // kein lead-0-Frame (AT): „jetzt" = erster Frame.
    nowIndex = 0;
  }
  return {
    country, source, sourceLabel: opts.label ?? SRC_LABEL[source], attribution: opts.attribution ?? SRC_ATTR[source],
    corners, frames, nowIndex, runAtMs, fetchedAtMs: Date.now(), stepMin, skillMin,
  };
}

// ---------------------------------------------------------------------------
// Verify (headless) — testet die pure Past-Cache-/Merge-Logik
// ---------------------------------------------------------------------------

export interface RfCheck { name: string; ok: boolean; detail?: string }
export interface RfVerifyResult { checks: RfCheck[]; passed: number; failed: number }

export function verifyRadarFrames(): RfVerifyResult {
  const checks: RfCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  _resetPastCache();

  const mk = (timeMs: number): PastEntry => ({ timeMs, values: new Uint8Array([1]), width: 1, height: 1 });
  const run = 1_700_000_000_000;
  // 3 gemessene Analysen vor dem Lauf + die Lauf-Analyse selbst.
  _seedPast('radolan_rv', mk(run - 15 * 60_000));
  _seedPast('radolan_rv', mk(run - 10 * 60_000));
  _seedPast('radolan_rv', mk(run - 5 * 60_000));
  _seedPast('radolan_rv', mk(run));

  const past = pastFrames('radolan_rv', run);
  add('Past liefert nur ältere Frames', past.length === 3, `${past.length}`);
  add('Past-Leads sind negativ', past.every((f) => f.leadMinutes < 0));
  add('Past ist measured', past.every((f) => f.measured));
  add('Past chronologisch', past[0].leadMinutes < past[2].leadMinutes && past[2].leadMinutes === -5);

  // Dedupe: gleiche Minute nicht doppelt.
  _seedPast('radolan_rv', mk(run - 5 * 60_000 + 1000));
  add('Dedupe pro Minute', pastFrames('radolan_rv', run).length === 3, `${pastFrames('radolan_rv', run).length}`);

  // Fenster: sehr alter Frame fällt raus.
  _resetPastCache();
  _seedPast('radolan_rv', mk(run - 200 * 60_000));
  _seedPast('radolan_rv', mk(run));
  add('Frame älter als 2 h fällt raus', pastFrames('radolan_rv', run + 60_000).length <= 1);

  _resetPastCache();
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyRadarFrames: typeof verifyRadarFrames }).__verifyRadarFrames = verifyRadarFrames;
}
