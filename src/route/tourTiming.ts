/**
 * Zeitliche Modellierung der Tour: aus Segment-Geschwindigkeiten (speedModel),
 * Pausen (breaks) und Start-Zeitpunkt entsteht der Zeitplan — Ankunftszeit je
 * Wetter-Sample (Basis fürs Wetter entlang der Route) und Etappen-Milestones
 * (Start → Pausen → Ziel) für die Anzeige.
 */

import {
  cumulativeMovingSeconds, estimateTiming,
  type DurationModel, type MovementCategory, type SegmentCtxProvider, type SpeedProfile,
} from './speedModel';
import { computeBreaks, type BreakConfig } from './breaks';
import type { TourPoint, TourTrack } from './tourTrack';
import { bearingDeg, headwindComponentMps, windSpeedFactor } from './windEffect';
import type { WindAt, WindSampler } from './windSampling';

export interface SampleETA {
  index: number;
  dist: number;
  lat: number;
  lon: number;
  ele: number;
  /** Absoluter Ankunftszeitpunkt (Epoch-ms). */
  etaMs: number;
  /** Minuten ab Start. */
  arrivalOffsetMin: number;
  /** Mittleres Tempo des Segments, das an diesem Sample endet (km/h). */
  segmentSpeedKmh: number;
  /** Akku-Restladung in Prozent — gesetzt von TourView bei E-Bike. */
  batteryPctRemaining?: number;
  /** Wetter am Sample — gesetzt von enrichSampleWeather. */
  weather?: import('../pointForecast/types').SampleWeather;
}

export type MilestoneKind = 'start' | 'rest' | 'meal' | 'custom' | 'end';

export interface Milestone {
  kind: MilestoneKind;
  dist: number;
  lat: number;
  lon: number;
  arrivalMs: number;
  /** Bei Pausen: Abfahrtszeit (Ankunft + Dauer). */
  departureMs?: number;
  durationSec?: number;
  label: string;
}

export interface TourTiming {
  movingSec: number;
  breakSec: number;
  totalSec: number;
  arrivalMs: number;
  avgKmh: number;
  minKmh: number;
  maxKmh: number;
  breakCount: number;
  milestones: Milestone[];
  sampleEtas: SampleETA[];
  /** Ankunftszeit (Epoch-ms) je voller Track-Punkt (Bewegung + Pausen davor). */
  trackPointEtas: number[];
}

export function computeTiming(
  track: TourTrack,
  profile: SpeedProfile,
  model: DurationModel,
  breakCfg: BreakConfig,
  startMs: number,
  ctxFor?: SegmentCtxProvider,
): TourTiming {
  const points = track.points;
  const est = estimateTiming(points, profile, model, ctxFor);
  const { events, totalSec: breakSec } = computeBreaks(points, profile, model, breakCfg, ctxFor);
  const cum = cumulativeMovingSeconds(points, profile, model, ctxFor);
  const total = points.length ? points[points.length - 1].dist : 0;

  // Interpolierte Bewegungszeit an beliebiger Distanz.
  const movingAt = (dist: number): number => {
    if (dist <= 0) return 0;
    if (dist >= total) return cum[cum.length - 1] ?? 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].dist >= dist) {
        const span = points[i].dist - points[i - 1].dist;
        const f = span > 0 ? (dist - points[i - 1].dist) / span : 0;
        return cum[i - 1] + (cum[i] - cum[i - 1]) * f;
      }
    }
    return cum[cum.length - 1] ?? 0;
  };
  // Pausenzeit vor einer Distanz (Pausen exakt an `dist` zählen nicht zur Ankunft).
  const breaksBefore = (dist: number): number =>
    events.reduce((s, e) => (e.dist < dist - 0.5 ? s + e.durationSec : s), 0);

  const etaAt = (dist: number): number =>
    startMs + (movingAt(dist) + breaksBefore(dist)) * 1000;

  // Milestones: Start → Pausen (mit An-/Abfahrt) → Ziel.
  const milestones: Milestone[] = [];
  milestones.push({ kind: 'start', dist: 0, lat: points[0].lat, lon: points[0].lon, arrivalMs: startMs, label: 'Start' });
  for (const e of events) {
    const p = nearestByDist(points, e.dist);
    const arrival = etaAt(e.dist);
    milestones.push({
      kind: e.kind, dist: e.dist, lat: p.lat, lon: p.lon,
      arrivalMs: arrival, departureMs: arrival + e.durationSec * 1000, durationSec: e.durationSec,
      label: e.label,
    });
  }
  const last = points[points.length - 1];
  const totalSec = est.movingSec + breakSec;
  milestones.push({ kind: 'end', dist: total, lat: last.lat, lon: last.lon, arrivalMs: startMs + totalSec * 1000, label: 'Ziel' });

  // ETA + Sample-spezifische Felder (5.6) je Wetter-Sample.
  const samples = track.samples;
  const sampleMovingSec = samples.map((s) => movingAt(s.dist));
  const sampleEtas: SampleETA[] = samples.map((s, i) => {
    const eta = etaAt(s.dist);
    // Mittleres Segment-Tempo = Distanz zwischen Samples / reine Bewegungszeit
    // (ohne Pausen). Für den Start-Sample greifen wir auf das nächste Segment.
    let speedKmh = 0;
    if (samples.length >= 2) {
      const lo = i === 0 ? i : i - 1;
      const hi = i === 0 ? i + 1 : i;
      const distSpan = samples[hi].dist - samples[lo].dist;
      const timeSpan = sampleMovingSec[hi] - sampleMovingSec[lo];
      speedKmh = timeSpan > 0 ? (distSpan / 1000) / (timeSpan / 3600) : 0;
    }
    return {
      index: i, dist: s.dist, lat: s.lat, lon: s.lon, ele: s.ele,
      etaMs: eta,
      arrivalOffsetMin: (eta - startMs) / 60000,
      segmentSpeedKmh: speedKmh,
    };
  });
  // ETA je Track-Punkt (für die nächste Iteration der Wind-Berechnung).
  const trackPointEtas: number[] = points.map((p) => etaAt(p.dist));

  return {
    movingSec: est.movingSec,
    breakSec,
    totalSec,
    arrivalMs: startMs + totalSec * 1000,
    avgKmh: est.avgKmh,
    minKmh: est.minKmh,
    maxKmh: est.maxKmh,
    breakCount: events.length,
    milestones,
    sampleEtas,
    trackPointEtas,
  };
}

// ---------------------------------------------------------------------------
// Iterative Berechnung mit Wind (5.x)
// ---------------------------------------------------------------------------
//
// Iter 1: Timing ohne Wind.
// Iter 2..n: Pro Track-Punkt-ETA Wind sampeln, Segment-Faktor berechnen, Timing
//            neu rechnen. Konvergiert, wenn max(|ΔETA|) über alle Wetter-Samples
//            < 120 Sekunden (= 2 Minuten). Maximal 5 Iterationen.
// ---------------------------------------------------------------------------

export interface IterationLog {
  iteration: number;
  maxDriftSec: number;
}

export interface IterativeTimingResult {
  timing: TourTiming;
  iterations: number;
  converged: boolean;
  windApplied: boolean;
  driftLog: IterationLog[];
}

export const WIND_CONVERGENCE_SEC = 120;
export const MAX_WIND_ITERATIONS = 5;

export function computeTimingIterated(
  track: TourTrack,
  profile: SpeedProfile,
  model: DurationModel,
  breakCfg: BreakConfig,
  startMs: number,
  category: MovementCategory,
  windSampler: WindSampler | null,
): IterativeTimingResult {
  // Iter 1: ohne Wind.
  let timing = computeTiming(track, profile, model, breakCfg, startMs);
  if (!windSampler) {
    return { timing, iterations: 1, converged: true, windApplied: false, driftLog: [] };
  }

  const pts = track.points;
  // Pro-Segment-Travel-Peilung — geometrisch konstant, einmal cachen.
  const bearings = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    bearings[i] = bearingDeg(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }

  // Wind je Track-Punkt am ORT des Punktes zur aktuellen ETA ableiten — über
  // denselben Cluster-Forecast, den auch die Anzeige nutzt (vereinheitlicht).
  const windAtTrack = (etas: number[]): Array<WindAt | null> =>
    etas.map((eta, i) => windSampler.sample(pts[i].lat, pts[i].lon, pts[i].ele, eta));

  // Ctx-Provider: pro Segment den Wind am Anfangs-Endpunkt nehmen (mittelt sich
  // über benachbarte Segmente; für unsere stündliche Auflösung ausreichend).
  const makeCtxFor = (wind: Array<WindAt | null>): SegmentCtxProvider => (i) => {
    const w = wind[i] ?? wind[i - 1];
    if (!w) return {};
    const comp = headwindComponentMps(bearings[i], w.dirFromDeg, w.speedMps);
    return { windFactor: windSpeedFactor(comp, category) };
  };

  const driftLog: IterationLog[] = [];
  let prevSampleEtas = timing.sampleEtas.map((s) => s.etaMs);

  for (let iter = 2; iter <= MAX_WIND_ITERATIONS; iter++) {
    const wind = windAtTrack(timing.trackPointEtas);
    timing = computeTiming(track, profile, model, breakCfg, startMs, makeCtxFor(wind));
    const newSampleEtas = timing.sampleEtas.map((s) => s.etaMs);

    let maxDriftMs = 0;
    for (let i = 0; i < newSampleEtas.length; i++) {
      const d = Math.abs(newSampleEtas[i] - prevSampleEtas[i]);
      if (d > maxDriftMs) maxDriftMs = d;
    }
    const maxDriftSec = maxDriftMs / 1000;
    driftLog.push({ iteration: iter, maxDriftSec });

    if (maxDriftSec < WIND_CONVERGENCE_SEC) {
      return { timing, iterations: iter, converged: true, windApplied: true, driftLog };
    }
    prevSampleEtas = newSampleEtas;
  }
  return { timing, iterations: MAX_WIND_ITERATIONS, converged: false, windApplied: true, driftLog };
}

// ---------------------------------------------------------------------------
// Verifikation der iterativen Berechnung (synthetischer Wind-Sampler).
// ---------------------------------------------------------------------------
export interface IterationVerify {
  scenario: string;
  iterations: number;
  converged: boolean;
  lastDriftSec: number;
  baseMovingMin: number;
  windyMovingMin: number;
  deltaMin: number;
  ok: boolean;
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __computeTimingIterated: typeof computeTimingIterated }).__computeTimingIterated = computeTimingIterated;
}

function nearestByDist(points: TourPoint[], dist: number): TourPoint {
  let best = points[0], bestD = Infinity;
  for (const p of points) {
    const d = Math.abs(p.dist - dist);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
