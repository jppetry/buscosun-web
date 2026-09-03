/**
 * Verifikation der Sample-Anreicherung (5.6): für jeden reduzierten Track-Punkt
 * werden absolute Ankunftszeit, Offset-Minuten, Segment-Tempo und (bei E-Bike)
 * Akku-Rest geprüft — strukturell und gegen einfache, kalkulierbare Szenarien.
 */

import { computeTiming, type SampleETA } from './tourTiming';
import {
  batterySocAtDist, computeEbikeBattery, DEFAULT_EBIKE_CONFIG,
} from './ebikeBattery';
import { MODELS } from './movementModels';
import type { SpeedProfile } from './speedModel';
import type { BreakConfig } from './breaks';
import type { TourPoint, TourTrack } from './tourTrack';

export interface SampleCheck {
  name: string;
  ok: boolean;
  detail: string;
}
export interface SampleVerifyResult {
  checks: SampleCheck[];
  passed: number;
  failed: number;
  /** Erstes/letztes Sample für visuelle Inspektion. */
  preview: { first: SampleETA; last: SampleETA } | null;
}

function syntheticFlat(distKm: number, count = 50): TourTrack {
  const points: TourPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ lat: 0, lon: 0, ele: 0, dist: (i / (count - 1)) * distKm * 1000 });
  }
  // Samples = jeder zweite Punkt + Endpunkt → 26 Samples.
  const samples = points.filter((_, i) => i % 2 === 0);
  if (samples[samples.length - 1] !== points[points.length - 1]) samples.push(points[points.length - 1]);
  return {
    points, samples, waypoints: [],
    meta: {
      sourceFormat: 'gpx', totalDistanceM: distKm * 1000, ascentM: 0, descentM: 0,
      minEleM: 0, maxEleM: 0, pointCount: points.length, sampleCount: samples.length,
      elevationEnriched: false, elevationAvailable: true,
      elevationSource: 'file', elevationDeltaM: null, hasTime: false,
      startTime: null, endTime: null, terrain: 'flach', name: 'flat',
    },
  };
}

const NO_BREAKS: BreakConfig = {
  autoEnabled: false, mode: 'time', intervalValue: 120, durationMin: 0,
  mealEnabled: false, mealAfterMin: 180, mealDurationMin: 0, custom: [],
};

export function verifySampleEnrichment(): SampleVerifyResult {
  const checks: SampleCheck[] = [];
  const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });

  // Szenario A: Wandern, 10 km flach, 4 km/h → 150 min Bewegung, keine Pausen.
  const track = syntheticFlat(10, 50);
  const profile: SpeedProfile = {
    flatSpeedKmh: 4, ascentRateMh: 350, descentRateMh: 500,
    climbStrength: 3, maxDownhillKmh: 45, paceFactor: 1,
  };
  const startMs = Date.UTC(2026, 4, 28, 6, 0, 0);
  const t = computeTiming(track, profile, MODELS.wandern, NO_BREAKS, startMs);
  const samples = t.sampleEtas;

  add('mindestens 2 Samples',
    samples.length >= 2,
    `samples=${samples.length}`);

  // Pflichtfelder vorhanden.
  const first = samples[0], last = samples[samples.length - 1];
  add('alle Pflichtfelder vorhanden',
    samples.every((s) =>
      Number.isFinite(s.etaMs) && Number.isFinite(s.arrivalOffsetMin) &&
      Number.isFinite(s.segmentSpeedKmh) && Number.isFinite(s.dist)),
    `first eta=${first.etaMs}, offset=${first.arrivalOffsetMin}, v=${first.segmentSpeedKmh}`);

  // Offset = (eta − start) / 60_000.
  add('offset = (eta − start) / 60_000 für alle Samples',
    samples.every((s) => Math.abs(s.arrivalOffsetMin - (s.etaMs - startMs) / 60000) < 1e-6),
    `first ${first.arrivalOffsetMin}; last ${last.arrivalOffsetMin}`);

  // Start-Offset = 0.
  add('Start-Sample hat Offset ≈ 0',
    Math.abs(first.arrivalOffsetMin) < 0.01,
    `offset=${first.arrivalOffsetMin}`);

  // Ziel-Offset entspricht Gesamtdistanz / Tempo (flach: 10 km / 4 km/h = 150 min).
  const expectedTotalMin = 10 / 4 * 60;
  add('Ziel-Offset ≈ 10 km / 4 km/h = 150 min (Toleranz 2 min)',
    Math.abs(last.arrivalOffsetMin - expectedTotalMin) < 2,
    `actual ${last.arrivalOffsetMin.toFixed(2)}, expected ${expectedTotalMin}`);

  // Monoton steigend.
  let monotonic = true;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].arrivalOffsetMin < samples[i - 1].arrivalOffsetMin) { monotonic = false; break; }
  }
  add('Ankunftszeiten monoton steigend', monotonic);

  // Segment-Tempo nahe 4 km/h (Flach, Wandern).
  add('Segment-Tempo aller Samples ≈ 4 km/h ± 0,5',
    samples.every((s) => Math.abs(s.segmentSpeedKmh - 4) < 0.5),
    `min=${Math.min(...samples.map((s) => s.segmentSpeedKmh)).toFixed(2)} max=${Math.max(...samples.map((s) => s.segmentSpeedKmh)).toFixed(2)}`);

  // Szenario B: E-Bike + Anreicherung mit Akku.
  const eProfile: SpeedProfile = {
    flatSpeedKmh: 23, ascentRateMh: 0, descentRateMh: 0,
    climbStrength: 4, maxDownhillKmh: 45, paceFactor: 1,
  };
  const eTrack = syntheticFlat(30, 60);
  const eTiming = computeTiming(eTrack, eProfile, MODELS.ebike, NO_BREAKS, startMs);
  const eResult = computeEbikeBattery(eTrack, eProfile, { ...DEFAULT_EBIKE_CONFIG });
  const eSamples: SampleETA[] = eTiming.sampleEtas.map((s) => ({
    ...s,
    batteryPctRemaining: Math.round(batterySocAtDist(eResult, s.dist) * 1000) / 10,
  }));

  add('E-Bike: Start-Sample hat 100 % Akku',
    Math.abs((eSamples[0].batteryPctRemaining ?? 0) - 100) < 0.5,
    `start=${eSamples[0].batteryPctRemaining}`);

  add('E-Bike: Akku am Ziel < 100 % (es wurde verbraucht)',
    (eSamples[eSamples.length - 1].batteryPctRemaining ?? 100) < 100,
    `end=${eSamples[eSamples.length - 1].batteryPctRemaining}`);

  // Monoton fallend (Akku läuft auf Flach nur runter — keine Rekuperation).
  let socMonotonic = true;
  for (let i = 1; i < eSamples.length; i++) {
    const a = eSamples[i - 1].batteryPctRemaining ?? 0;
    const b = eSamples[i].batteryPctRemaining ?? 0;
    if (b > a + 1e-6) { socMonotonic = false; break; }
  }
  add('E-Bike: Akku-Verlauf monoton fallend', socMonotonic);

  // Akku in [0, 100].
  add('E-Bike: alle Akku-Werte in [0, 100]',
    eSamples.every((s) => {
      const b = s.batteryPctRemaining ?? 0;
      return b >= -0.01 && b <= 100.01;
    }));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed, preview: { first, last } };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySampleEnrichment: typeof verifySampleEnrichment }).__verifySampleEnrichment = verifySampleEnrichment;
}
