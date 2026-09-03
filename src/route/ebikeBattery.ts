/**
 * E-Bike-Akku-Modellierung — pro Segment Motor-Leistung, Energieverbrauch (Wh),
 * verbleibender Ladestand (SoC). Liefert daraus Reichweiten-Aussage und, falls
 * nötig, eine Empfehlung zur Unterstützungs-Reduktion.
 *
 * Physik (steady-state, ohne Beschleunigung):
 *   P_grav = m·g·v·sinθ
 *   P_roll = Crr·m·g·v·cosθ
 *   P_aero = ½·ρ·CdA·v³
 *   P_mech = P_grav + P_roll + P_aero  (≤ 0 → Rollen / Bremsen, Motor aus)
 *   P_motor = clamp(P_mech − P_rider, 0, motorCap), Motor aus bei v > 25 km/h
 *   P_batt  = P_motor / η_drivetrain
 *   Wh      = P_batt · Δt
 *
 * Stufen-Konvention (Bosch-ähnlich): Eco/Tour/Sport/Turbo mit eigener Motor-
 * Leistungs-Obergrenze. Faktor selbst beeinflusst hier den Cap; Geschwindigkeit
 * (aus dem ebike-speedModel) bleibt für die Akku-Berechnung unverändert
 * (MVP-Vereinfachung — die Empfehlung „1 Stufe runter" rechnet das durch).
 */

import type { TourPoint, TourTrack } from './tourTrack';
import type { SpeedProfile } from './speedModel';
import { segmentModel } from './speedModel';
import { MODELS } from './movementModels';

export type EbikeAssist = 'eco' | 'tour' | 'sport' | 'turbo';

export const ASSIST_ORDER: EbikeAssist[] = ['eco', 'tour', 'sport', 'turbo'];

export interface AssistSpec {
  /** Maximale Motor-Leistung in Watt (Nenn-/Kurzzeit-Schätzung). */
  motorCapW: number;
  label: string;
}
export const ASSIST_SPECS: Record<EbikeAssist, AssistSpec> = {
  eco:   { motorCapW: 200, label: 'Eco' },
  tour:  { motorCapW: 350, label: 'Tour' },
  sport: { motorCapW: 500, label: 'Sport' },
  turbo: { motorCapW: 750, label: 'Turbo' },
};

export interface EbikeConfig {
  capacityWh: number;
  /** Anfangs-Ladestand 0..1. */
  startSoC: number;
  assist: EbikeAssist;
  /** Gesamtmasse (Fahrer + Rad + Gepäck) in kg. */
  totalMassKg: number;
  /** Mittlere Eigenleistung Fahrer (W). */
  riderPowerW: number;
  /** Rollwiderstandsbeiwert. */
  crr: number;
  /** Luftwiderstandsfläche CdA (m²). */
  cdA: number;
  /** Wirkungsgrad Motor → Antrieb. */
  drivetrainEfficiency: number;
}

export const DEFAULT_EBIKE_CONFIG: EbikeConfig = {
  capacityWh: 500,
  startSoC: 1.0,
  assist: 'tour',
  totalMassKg: 95,
  riderPowerW: 100,
  crr: 0.006,
  cdA: 0.55,
  drivetrainEfficiency: 0.85,
};

export interface EbikeSegment {
  /** Endpunkt-Index im vollen Track. */
  index: number;
  /** Distanz am Endpunkt (m). */
  dist: number;
  /** Mittlere Segment-Geschwindigkeit (km/h). */
  speedKmh: number;
  /** Mechanische Antriebsleistung (W, Segment). */
  mechPowerW: number;
  /** Motor-Output (W). */
  motorPowerW: number;
  /** Akku-Leistungsabgabe (W) = Motor / Wirkungsgrad. */
  batteryPowerW: number;
  /** Energie aus dem Akku in diesem Segment (Wh). */
  segmentWh: number;
  /** Kumulierter Akku-Verbrauch (Wh) bis zum Endpunkt. */
  cumulativeWh: number;
  /** SoC am Endpunkt (0..1). */
  socFraction: number;
}

export interface EbikeResult {
  config: EbikeConfig;
  segments: EbikeSegment[];
  totalWh: number;
  finalSocFraction: number;
  reachesEnd: boolean;
  /** Falls reachesEnd false: Distanz, ab der der Akku leer ist (m). */
  emptyAtDist?: number;
  /** Empfehlung, falls die aktuelle Konfiguration nicht reicht. */
  recommendation?: {
    assist: EbikeAssist;
    expectedFinalSoc: number;
    expectedTotalWh: number;
  };
}

/** SoC-Reserve, ab der wir die Tour als „nicht sicher schaffbar" markieren. */
export const RESERVE_FRACTION = 0.05;

/**
 * SoC (0..1) an beliebiger Streckendistanz — linear zwischen den bekannten
 * Segment-Endpunkten interpoliert. Vor dem ersten Segment: startSoC.
 */
export function batterySocAtDist(result: EbikeResult, dist: number): number {
  const segs = result.segments;
  if (segs.length === 0 || dist <= 0) return result.config.startSoC;
  if (dist >= segs[segs.length - 1].dist) return segs[segs.length - 1].socFraction;
  // Vor dem ersten Segment liegt der Startwert.
  let prevDist = 0, prevSoc = result.config.startSoC;
  for (const seg of segs) {
    if (seg.dist >= dist) {
      const span = seg.dist - prevDist;
      const t = span > 0 ? (dist - prevDist) / span : 0;
      return prevSoc + (seg.socFraction - prevSoc) * t;
    }
    prevDist = seg.dist;
    prevSoc = seg.socFraction;
  }
  return prevSoc;
}
const G = 9.81;
const RHO_AIR = 1.225;
const MOTOR_CUTOFF_MPS = 25 / 3.6;

function segmentBatteryWh(
  lengthM: number, dEle: number, durationSec: number, cfg: EbikeConfig,
): { batteryWh: number; mechW: number; motorW: number; batteryW: number } {
  if (lengthM <= 0 || durationSec <= 0) return { batteryWh: 0, mechW: 0, motorW: 0, batteryW: 0 };
  const v = lengthM / durationSec; // m/s
  const slopeRad = Math.atan2(dEle, lengthM);
  const Pgrav = cfg.totalMassKg * G * v * Math.sin(slopeRad);
  const Proll = cfg.crr * cfg.totalMassKg * G * v * Math.cos(slopeRad);
  const Paero = 0.5 * RHO_AIR * cfg.cdA * v * v * v;
  const Pmech = Pgrav + Proll + Paero;

  const motorOff = v > MOTOR_CUTOFF_MPS || Pmech <= 0;
  const cap = ASSIST_SPECS[cfg.assist].motorCapW;
  const Pmotor = motorOff ? 0 : Math.min(cap, Math.max(0, Pmech - cfg.riderPowerW));
  const Pbatt = Pmotor / Math.max(0.5, cfg.drivetrainEfficiency);
  const batteryWh = Pbatt * (durationSec / 3600);
  return { batteryWh, mechW: Pmech, motorW: Pmotor, batteryW: Pbatt };
}

function computeBattery(points: TourPoint[], profile: SpeedProfile, cfg: EbikeConfig): EbikeResult {
  const model = MODELS.ebike;
  const segments: EbikeSegment[] = [];
  let cumulativeWh = 0;
  const initialWh = cfg.capacityWh * Math.max(0, Math.min(1, cfg.startSoC));
  let emptyAtDist: number | undefined;

  for (let i = 1; i < points.length; i++) {
    const d = points[i].dist - points[i - 1].dist;
    const a = points[i - 1].ele, b = points[i].ele;
    const dEle = Number.isFinite(a) && Number.isFinite(b) ? b - a : 0;
    const seg = segmentModel(d, dEle, profile, model);
    const e = segmentBatteryWh(d, dEle, seg.durationSec, cfg);
    cumulativeWh += e.batteryWh;
    const remainingWh = initialWh - cumulativeWh;
    const socFraction = Math.max(0, remainingWh / cfg.capacityWh);
    if (emptyAtDist == null && remainingWh <= 0) emptyAtDist = points[i].dist;

    segments.push({
      index: i,
      dist: points[i].dist,
      speedKmh: seg.speedKmh,
      mechPowerW: Math.round(e.mechW),
      motorPowerW: Math.round(e.motorW),
      batteryPowerW: Math.round(e.batteryW),
      segmentWh: e.batteryWh,
      cumulativeWh,
      socFraction,
    });
  }

  const finalSocFraction = segments.length ? segments[segments.length - 1].socFraction : cfg.startSoC;
  return {
    config: cfg,
    segments,
    totalWh: cumulativeWh,
    finalSocFraction,
    reachesEnd: emptyAtDist == null,
    emptyAtDist,
  };
}

export function computeEbikeBattery(track: TourTrack, profile: SpeedProfile, cfg: EbikeConfig): EbikeResult {
  const result = computeBattery(track.points, profile, cfg);
  // Falls nicht ausreichend Reserve: prüfen, ob eine niedrigere Stufe reicht.
  if (result.finalSocFraction < RESERVE_FRACTION) {
    const idx = ASSIST_ORDER.indexOf(cfg.assist);
    for (let k = idx - 1; k >= 0; k--) {
      const lower = ASSIST_ORDER[k];
      const alt = computeBattery(track.points, profile, { ...cfg, assist: lower });
      if (alt.finalSocFraction >= RESERVE_FRACTION) {
        result.recommendation = {
          assist: lower,
          expectedFinalSoc: alt.finalSocFraction,
          expectedTotalWh: alt.totalWh,
        };
        break;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Verifikation: synthetische Strecken-Profile durchrechnen und gegen Plausibi-
// litätsbereiche prüfen.
// ---------------------------------------------------------------------------
export interface EbikeCheck {
  scenario: string;
  totalWh: number;
  finalSocPct: number;
  reachesEnd: boolean;
  expected: { whRange: [number, number]; reachesEnd: boolean };
  recommendation?: EbikeAssist;
  ok: boolean;
}
export interface EbikeVerifyResult {
  checks: EbikeCheck[];
  passed: number;
  failed: number;
}

function syntheticTrack(name: string, segments: Array<{ lengthM: number; dEle: number }>): TourTrack {
  const points: TourPoint[] = [{ lat: 0, lon: 0, ele: 0, dist: 0 }];
  let acc = 0, ele = 0;
  for (const s of segments) {
    acc += s.lengthM;
    ele += s.dEle;
    points.push({ lat: 0, lon: 0, ele, dist: acc });
  }
  return {
    points, samples: points, waypoints: [],
    meta: {
      sourceFormat: 'gpx', totalDistanceM: acc, ascentM: 0, descentM: 0,
      minEleM: 0, maxEleM: 0, pointCount: points.length, sampleCount: points.length,
      elevationEnriched: false, elevationAvailable: true,
      elevationSource: 'file', elevationDeltaM: null, hasTime: false,
      startTime: null, endTime: null, terrain: 'flach', name,
    },
  };
}

export function verifyEbikeBattery(): EbikeVerifyResult {
  const profile: SpeedProfile = {
    flatSpeedKmh: 23, ascentRateMh: 0, descentRateMh: 0,
    climbStrength: 4, maxDownhillKmh: 45, paceFactor: 1,
  };
  const baseCfg = { ...DEFAULT_EBIKE_CONFIG };

  // 1) Flachfahrt 30 km — niedrige Motor-Last bei 100 W Eigenleistung.
  const flat30 = syntheticTrack('flat30', Array.from({ length: 60 }, () => ({ lengthM: 500, dEle: 0 })));
  // 2) Steigung 5 % über 10 km — moderat fordernd.
  const climb5pct = syntheticTrack('climb5', Array.from({ length: 20 }, () => ({ lengthM: 500, dEle: 25 })));
  // 3) Lange 6 %-Steigung mit zu kleinem Akku — Pmech-Bedarf unter Tour-Cap,
  //    daher hilft Stufen-Downgrade hier nicht; erwartet: kein Vorschlag.
  const longClimb = syntheticTrack('longClimb', Array.from({ length: 40 }, () => ({ lengthM: 500, dEle: 30 })));
  // 4) Reine Abfahrt 8 km — Motor aus, kein Verbrauch.
  const downhill = syntheticTrack('downhill', Array.from({ length: 16 }, () => ({ lengthM: 500, dEle: -25 })));
  // 5) Steiler 8 %-Anstieg mit hoher Masse + kleinem Akku: Pmech > Tour-Cap,
  //    Sport reicht nicht (Motor liefert max. 500 W), Eco (Cap 200 W) lässt den
  //    Akku länger durchhalten → Empfehlung „eco".
  const steepHeavy = syntheticTrack('steepHeavy', Array.from({ length: 20 }, () => ({ lengthM: 500, dEle: 40 })));

  const cases: Array<{ name: string; track: TourTrack; cfg: EbikeConfig; expectedWh: [number, number]; reachesEnd: boolean; expectedRec?: EbikeAssist | null }> = [
    { name: 'Flach 30 km (Tour, 500 Wh)',         track: flat30,     cfg: { ...baseCfg },                                                        expectedWh: [20, 80],   reachesEnd: true },
    { name: '5 % Steigung 10 km (Tour, 500 Wh)',   track: climb5pct,  cfg: { ...baseCfg },                                                        expectedWh: [80, 200],  reachesEnd: true },
    { name: '6 % Steigung 20 km, Sport, 250 Wh',   track: longClimb,  cfg: { ...baseCfg, assist: 'sport', capacityWh: 250 },                      expectedWh: [250, 500], reachesEnd: false, expectedRec: null },
    { name: 'Abfahrt 8 km',                        track: downhill,   cfg: { ...baseCfg },                                                        expectedWh: [0, 1],     reachesEnd: true },
    { name: '8 % Steigung 10 km, Sport, 130 kg, 200 Wh', track: steepHeavy, cfg: { ...baseCfg, assist: 'sport', capacityWh: 200, totalMassKg: 130 }, expectedWh: [200, 450], reachesEnd: false, expectedRec: 'eco' },
  ];

  const checks: EbikeCheck[] = cases.map((c) => {
    const r = computeEbikeBattery(c.track, profile, c.cfg);
    const whOk = r.totalWh >= c.expectedWh[0] && r.totalWh <= c.expectedWh[1];
    const reachesOk = r.reachesEnd === c.reachesEnd;
    // expectedRec === undefined → egal; null → es darf KEINE Empfehlung sein;
    // ein String → genau diese Empfehlung erwartet.
    const recOk = c.expectedRec === undefined
      ? true
      : c.expectedRec === null
        ? r.recommendation == null
        : r.recommendation?.assist === c.expectedRec;
    return {
      scenario: c.name,
      totalWh: Math.round(r.totalWh),
      finalSocPct: Math.round(r.finalSocFraction * 100),
      reachesEnd: r.reachesEnd,
      expected: { whRange: c.expectedWh, reachesEnd: c.reachesEnd },
      recommendation: r.recommendation?.assist,
      ok: whOk && reachesOk && recOk,
    };
  });
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyEbikeBattery: typeof verifyEbikeBattery }).__verifyEbikeBattery = verifyEbikeBattery;
}
