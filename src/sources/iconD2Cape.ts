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

import { fetchIconD2Grid } from './iconD2Precip';
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
  const grid = await fetchIconD2Grid('cape_ml', { accumulate: false, kind: 'cape', maxStep: maxStepHours }, signal);
  return grid.frames.map((f) => ({
    stepHours: f.stepHours,
    validAtMs: f.validAt.getTime(),
    // Kein `project`-Argument: ICON-D2 kommt als `regular-lat-lon` (achsparalleles
    // lon/lat-Gitter) — dort IST die Bilinear-Inverse exakt. Projizierte Gitter
    // (RADOLAN) gehen über `pointForecast/radarSample.ts` (s. audit/radar-punktverortung.md).
    capeJkg: sampleRadarQuad(f.values, f.width, f.height, grid.corners, lat, lon, CAPE_MAX),
  }));
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
