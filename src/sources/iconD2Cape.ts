/**
 * ICON-D2 CAPE am Punkt (für den Gewittergefahr-Index #3).
 *
 * Lädt das Feld `cape_ml` (mixed-layer CAPE, J/kg) über die bestehende
 * generische ICON-D2-Pipeline und sampelt es am Standort — entweder als
 * Spitze der nächsten Stunden (Regenradar) oder als Stundenreihe (Go/No-Go,
 * Event). Bewusst leichtgewichtig: nur die nahen Schritte (`maxStep`), und vom
 * Aufrufer **lazy/im Hintergrund** zu starten — Kaltstarts dürfen dadurch nicht
 * blockieren (vgl. RADOLAN-Ladepfad).
 *
 * CAPE ist DE-only (ICON-D2-Gitter) und reicht nur über den nahen NWP-Horizont
 * (~24 h) — daher kein Gewittersignal für weit entfernte Event-Tage (ehrlich).
 *
 * Quelle: opendata.dwd.de … /icon-d2/grib/<HH>/cape_ml/  · CC BY 4.0.
 */

import { fetchIconD2Grid, resolveLatestRun, type IconD2Precip, type IconD2Frame } from './iconD2Precip';
import { repackUsable, resolveRepackForRun, loadGridStep } from './repackSource';
import type { QuadCorners } from '../scalar/RainLayer';
import { sampleRadarQuad } from '../pointForecast/quadSampler';
import { CAPE_MAX } from '../scalar/RainLayer';

export interface CapeStep {
  /** Vorlaufstunde ab Modelllauf. */
  stepHours: number;
  /** Gültigkeitszeit (UTC-ms). */
  validAtMs: number;
  /** CAPE (J/kg) am Punkt; null wenn außerhalb des Gitters. */
  capeJkg: number | null;
}

/**
 * CAPE-Stundenreihe am Punkt über die nächsten `maxStepHours` Stunden (DE).
 * Leeres Array, wenn ICON-D2 nicht erreichbar ist (→ Aufrufer fällt zurück).
 */
export async function fetchCapeSeriesAtPoint(
  lat: number, lon: number, maxStepHours = 24, signal?: AbortSignal,
): Promise<CapeStep[]> {
  // BW-7a: fertige 8-bit-Raster aus dem Daten-CDN (≈ 50–125 KB je Schritt statt
  // 2–3 MB GRIB — für EINE Zahl, V-BW-22). Alles oder nichts: fehlt ein gewünschter
  // Schritt, geht die Reihe wie bisher über GRIB. Dieselben Bytes (`capeToU8`).
  const grid = (await fetchCapeRepack(maxStepHours, signal).catch(() => null))
    ?? await fetchIconD2Grid('cape_ml', { accumulate: false, kind: 'cape', maxStep: maxStepHours }, signal);
  return grid.frames.map((f) => ({
    stepHours: f.stepHours,
    validAtMs: f.validAt.getTime(),
    // Kein `project`-Argument: ICON-D2 kommt als `regular-lat-lon` (achsparalleles
    // lon/lat-Gitter) — dort IST die Bilinear-Inverse exakt. Projizierte Gitter
    // (RADOLAN) gehen über `pointForecast/radarSample.ts` (s. audit/radar-punktverortung.md).
    capeJkg: sampleRadarQuad(f.values, f.width, f.height, grid.corners, lat, lon, CAPE_MAX),
  }));
}

async function fetchCapeRepack(maxStepHours: number, signal?: AbortSignal): Promise<IconD2Precip | null> {
  if (!repackUsable()) return null;
  const { runStr, runAt, steps } = await resolveLatestRun('cape_ml', signal, 'cape');
  const wanted = steps.filter((s) => s <= maxStepHours);
  const section = await resolveRepackForRun(runStr, 'cape', wanted);
  if (!section?.cape || wanted.length === 0) return null;
  const have = new Set(section.cape.steps.map((s) => s.step));
  if (!wanted.every((s) => have.has(s))) return null;
  const c = section.cape.grid.corners;
  const corners: QuadCorners = [c.nw, c.ne, c.se, c.sw];
  const frames: IconD2Frame[] = [];
  let failed = false;
  let ptr = 0;
  await Promise.all(Array.from({ length: Math.min(3, wanted.length) }, async () => {
    while (ptr < wanted.length && !failed) {
      const step = wanted[ptr++];
      const png = await loadGridStep(section, 'cape', step, signal, 'low');   // LE2/H7: eine Zahl, kein Erstbild
      if (!png) { failed = true; return; }
      frames.push({ validAt: new Date(runAt.getTime() + step * 3600_000), stepHours: step, values: png.values, width: png.width, height: png.height });
    }
  }));
  if (failed || signal?.aborted || frames.length === 0) return null;
  frames.sort((a, b) => a.stepHours - b.stepHours);
  return { runAt, frames, corners };
}

/**
 * Spitzen-CAPE (J/kg) am Punkt über die nächsten ~0–3 h, oder null wenn ICON-D2
 * den Punkt nicht abdeckt / nicht erreichbar ist (Regenradar-Nahbereich).
 */
export async function fetchPeakCapeAtPoint(
  lat: number, lon: number, signal?: AbortSignal,
): Promise<number | null> {
  try {
    const series = await fetchCapeSeriesAtPoint(lat, lon, 3, signal);
    let peak: number | null = null;
    for (const s of series) {
      if (s.capeJkg == null) continue;
      if (peak == null || s.capeJkg > peak) peak = s.capeJkg;
    }
    return peak;
  } catch {
    return null;
  }
}
