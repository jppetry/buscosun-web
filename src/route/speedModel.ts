/**
 * Geschwindigkeitsmodell — Kern der zeitlichen Modellierung (5.1).
 *
 * Pro Segment zwischen zwei Punkten wird aus folgenden Eingaben die erwartete
 * Geschwindigkeit und Reisedauer berechnet:
 *   – Steigungswinkel (aus Länge und Höhendifferenz)
 *   – Bewegungsart-Modell (per `DurationModel`-Funktion eingespielt, siehe
 *     movementModels.ts — eigene Kurve je Wandern/Bergwandern/Jogging/Trail/
 *     Rennrad/Gravel/MTB/E-Bike)
 *   – User-Profil: Pace-Modifier (globaler Faktor) bzw. Speed-Overrides
 *   – Wegtyp (aus OSM ableitbar) — Phase 2, derzeit Faktor 1
 *   – Wind-Vektor an Position/Zeit — Iteration 2+, derzeit Faktor 1
 */

import type { TourPoint } from './tourTrack';

export type MovementCategory = 'foot' | 'bike';

export interface SpeedProfile {
  flatSpeedKmh: number;
  /** Fuß: Steigleistung (Höhenmeter/Stunde). */
  ascentRateMh: number;
  /** Fuß: Abstiegsleistung (Höhenmeter/Stunde). */
  descentRateMh: number;
  /** Rad: Bergfitness 1–5 (höher = weniger Tempoverlust am Anstieg). */
  climbStrength: number;
  /** Rad: Sicherheits-Limit für Abfahrten (km/h). */
  maxDownhillKmh: number;
  /** Globaler Tempo-Modifier (1 = wie konfiguriert, 1.1 = 10 % schneller). */
  paceFactor: number;
}

/** Dauerfunktion eines Segments (siehe movementModels.ts). */
export type DurationModel = (lengthM: number, dEle: number, profile: SpeedProfile) => number;

/** Pro-Segment-Kontext (Wegtyp/Wind). `i` = Index des Endpunkts (1-basiert ab dem Start). */
export type SegmentCtxProvider = (i: number, lengthM: number, dEle: number) => SegmentContext;

/** Optionale, später aktivierte Einflüsse pro Segment. */
export interface SegmentContext {
  /** Wegtyp-Faktor aus OSM (Phase 2): <1 langsamer, >1 schneller. */
  wayTypeFactor?: number;
  /** Wind-Faktor aus dem Wind-Vektor (Iteration 2+). */
  windFactor?: number;
}

export interface SegmentResult {
  slopeDeg: number;
  slopePct: number;
  speedKmh: number;
  durationSec: number;
}

export interface TimingEstimate {
  movingSec: number;
  avgKmh: number;
  minKmh: number;
  maxKmh: number;
  distanceKm: number;
}

/**
 * Pro-Segment-Modell (5.1): liefert Steigung, erwartete Geschwindigkeit (km/h)
 * und Reisedauer (Sek.) inkl. Pace-Modifier und optionaler Weg-/Wind-Faktoren.
 * Das eigentliche Bewegungsart-Modell wird als `model` eingespielt.
 */
export function segmentModel(
  lengthM: number,
  dEle: number,
  profile: SpeedProfile,
  model: DurationModel,
  ctx: SegmentContext = {},
): SegmentResult {
  const slopePct = lengthM > 0 ? (dEle / lengthM) * 100 : 0;
  const slopeDeg = (Math.atan2(dEle, lengthM) * 180) / Math.PI;

  const factor = (profile.paceFactor || 1) * (ctx.wayTypeFactor ?? 1) * (ctx.windFactor ?? 1);
  const durationSec = factor > 0 ? model(lengthM, dEle, profile) / factor : 0;
  const speedKmh = durationSec > 0 ? (lengthM / 1000) / (durationSec / 3600) : 0;
  return { slopeDeg, slopePct, speedKmh, durationSec };
}

/** Reisedauer (Sek.) eines Segments — Kurzform von {@link segmentModel}. */
export function segmentSeconds(d: number, dEle: number, profile: SpeedProfile, model: DurationModel): number {
  return segmentModel(d, dEle, profile, model).durationSec;
}

export function estimateTiming(
  points: TourPoint[], profile: SpeedProfile, model: DurationModel, ctxFor?: SegmentCtxProvider,
): TimingEstimate {
  let moving = 0;
  let minKmh = Infinity, maxKmh = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].dist - points[i - 1].dist;
    const a = points[i - 1].ele, b = points[i].ele;
    const dEle = Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
    const seg = segmentModel(d, dEle, profile, model, ctxFor?.(i, d, dEle));
    moving += seg.durationSec;
    if (d >= 20) {
      if (seg.speedKmh < minKmh) minKmh = seg.speedKmh;
      if (seg.speedKmh > maxKmh) maxKmh = seg.speedKmh;
    }
  }
  const distanceKm = points.length ? points[points.length - 1].dist / 1000 : 0;
  const avgKmh = moving > 0 ? distanceKm / (moving / 3600) : 0;
  return {
    movingSec: moving,
    avgKmh,
    minKmh: Number.isFinite(minKmh) ? minKmh : avgKmh,
    maxKmh: maxKmh || avgKmh,
    distanceKm,
  };
}

/** Kumulierte Bewegungszeit (Sekunden) je Punkt — Index 0 ist 0. */
export function cumulativeMovingSeconds(
  points: TourPoint[], profile: SpeedProfile, model: DurationModel, ctxFor?: SegmentCtxProvider,
): number[] {
  const out = new Array<number>(points.length).fill(0);
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].dist - points[i - 1].dist;
    const a = points[i - 1].ele, b = points[i].ele;
    const dEle = Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
    acc += segmentModel(d, dEle, profile, model, ctxFor?.(i, d, dEle)).durationSec;
    out[i] = acc;
  }
  return out;
}

/** „2 h 35 min" / „45 min". */
export function formatHM(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}
