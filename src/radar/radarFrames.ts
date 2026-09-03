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
import { fetchRzcLatest } from '../sources/meteoSwissRadar';
import { rzcWarpMesh, RZC_WARP_N } from '../sources/meteoSwissGeo';

export type RadarSourceId = 'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc';

export interface RadarFrame {
  values: Uint8Array;
  width: number;
  height: number;
  /** absolute Validitätszeit (UTC-ms). */
  timeMs: number;
  /** Versatz vom Lauf in Minuten — negativ = gemessene Vergangenheit. */
  leadMinutes: number;
  /** gemessene Analyse (true) vs. extrapolierter Nowcast (false). */
  measured: boolean;
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

interface PastEntry { timeMs: number; values: Uint8Array; width: number; height: number }
const pastCache = new Map<RadarSourceId, PastEntry[]>();

/** Legt die gemessene Analyse in den Session-Cache (dedupe nach Minute). */
function rememberMeasured(source: RadarSourceId, e: PastEntry): void {
  const arr = pastCache.get(source) ?? [];
  const minute = Math.round(e.timeMs / 60_000);
  if (!arr.some((p) => Math.round(p.timeMs / 60_000) === minute)) arr.push(e);
  arr.sort((a, b) => a.timeMs - b.timeMs);
  // Fenster + Obergrenze einhalten.
  const cutoff = e.timeMs - PAST_WINDOW_MIN * 60_000;
  const trimmed = arr.filter((p) => p.timeMs >= cutoff).slice(-MAX_PAST);
  pastCache.set(source, trimmed);
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
      values: p.values, width: p.width, height: p.height, timeMs: p.timeMs,
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
    const seq = await fetchRvAnalysisSequence(count, signal);
    for (const a of seq.frames) {
      rememberMeasured('radolan_rv', { timeMs: a.validAt.getTime(), values: a.values, width: a.width, height: a.height });
    }
    return seq.frames.length > 0;
  } catch {
    return false; // Archiv nicht erreichbar / zu wenige Läufe → Session-Cache genügt
  }
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
    values: f.values, width: f.width, height: f.height,
    timeMs: runAtMs + f.leadMinutes * 60_000,
    leadMinutes: f.leadMinutes, measured: f.leadMinutes === 0,
  }));
  const analysis = nowcast.find((f) => f.leadMinutes === 0);
  if (analysis) rememberMeasured('radolan_rv', { timeMs: analysis.timeMs, values: analysis.values, width: analysis.width, height: analysis.height });
  const past = pastFrames('radolan_rv', runAtMs);
  // DE1200 ist polar-stereografisch → projektionskorrektes Warp-Mesh mitgeben.
  return { ...assemble('DE', 'radolan_rv', rv.corners, [...past, ...nowcast], runAtMs, 5, 120), warpLnglat: de1200WarpMesh(), warpN: DE1200_WARP_N };
}

async function loadAt(signal?: AbortSignal): Promise<RadarStack> {
  const grid = await fetchIncaGrid(signal);
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
  rememberMeasured('meteoswiss_rzc', { timeMs: t, values: fr.values, width: fr.width, height: fr.height });
  const analysis: RadarFrame = { values: fr.values, width: fr.width, height: fr.height, timeMs: t, leadMinutes: 0, measured: true };
  const past = pastFrames('meteoswiss_rzc', t);
  // LV95/somerc-Gitter → projektionskorrektes Warp-Mesh (RP2, s. loadAt).
  return {
    ...assemble('CH', 'meteoswiss_rzc', fr.corners, [...past, analysis], t, 5, 0),
    warpLnglat: rzcWarpMesh(fr.corners), warpN: RZC_WARP_N,
  };
}

function assemble(
  country: Country, source: RadarSourceId, corners: QuadCorners,
  frames: RadarFrame[], runAtMs: number, stepMin: number, skillMin: number,
): RadarStack {
  frames.sort((a, b) => a.timeMs - b.timeMs);
  let nowIndex = frames.findIndex((f) => f.leadMinutes === 0);
  if (nowIndex < 0) {
    // kein lead-0-Frame (AT): „jetzt" = erster Frame.
    nowIndex = 0;
  }
  return {
    country, source, sourceLabel: SRC_LABEL[source], attribution: SRC_ATTR[source],
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
