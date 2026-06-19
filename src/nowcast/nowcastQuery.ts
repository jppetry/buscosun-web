/**
 * NC-US-A7 — Interne Nowcast-Schnittstelle für Bestandsfeatures.
 *
 * Stellt den 0–6-h-Niederschlag (Intensitätsband, Phase, Wahrscheinlichkeit,
 * Summe) als **UI-entkoppelte** Datenstruktur bereit, damit „Wetter entlang der
 * Route" und „Event-Planer" diesen Kern konsumieren können, statt eigene
 * Nowcast-Logik zu führen (Scope-Guardrail US-H7).
 *
 * Keine React-/DOM-Abhängigkeit — reine Daten rein, reine Daten raus.
 */

import { buildNowcast } from './nowcastEngine';
import {
  intensityBand, intensityLabel, WET_MMH, NOWCAST_STEP_MIN,
  type IntensityBand, type StepPhase, type StepCharacter, type NowcastSource, type Nowcast,
} from './nowcastModel';
import type { Country } from '../types';

/** Ein Zeitschritt der Punktabfrage (US-A7 AK1). */
export interface NowcastQueryStep {
  minutes: number;
  timestampMs: number;
  /** Wahrscheinlichste Rate (mm/h). */
  mmH: number;
  /** Konfidenzband der Rate (mm/h). */
  mmHMin: number;
  mmHMax: number;
  /** Kumulierte Summe bis einschließlich dieses Schritts (mm). */
  cumulativeMm: number;
  band: IntensityBand;
  bandLabel: string;
  phase: StepPhase;
  character: StepCharacter;
  /** Regenwahrscheinlichkeit (≥ 0,1 mm/h) an diesem Schritt, 0..1 — heuristisch. */
  rainProbability: number;
  source: NowcastSource;
  /** Skill-Konfidenz 0..1 (Radar nah hoch, Modell fern niedrig). */
  confidence: number;
}

export interface NowcastQueryResult {
  lat: number;
  lon: number;
  country: Country;
  nowMs: number;
  /** Quelle des Radars (leer ohne Radar). */
  radarSource: string;
  /** Bis hierhin minutengenaue Radar-Aussage (Minuten ab jetzt). */
  radarValidMin: number;
  skillHorizonMin: number;
  steps: NowcastQueryStep[];
  summary: {
    sumMm: number;
    sumMinMm: number;
    sumMaxMm: number;
    dominantPhase: StepPhase;
    thunderRiskPct: number;
    hailRiskPct: number;
    heavyRain: boolean;
    snowLineM: number | null;
    currentlyRaining: boolean;
    /** Minuten bis Regenbeginn (null wenn es regnet oder 6 h trocken). */
    nextRainInMin: number | null;
    /** Erstes relevantes Trockenfenster (Minuten ab jetzt) oder null. */
    dryWindow: { fromMin: number; toMin: number; durationMin: number } | null;
  };
}

/**
 * Regenwahrscheinlichkeit eines Schritts (heuristisch): Anteil des
 * Konfidenzbands oberhalb der Nass-Schwelle, gedämpft mit der Skill-Konfidenz.
 * Kein echtes Ensemble-PoP, aber monoton + konsistent mit Intensität/Band.
 */
export function stepRainProbability(mmH: number, mmHMin: number, mmHMax: number, confidence: number): number {
  if (mmHMax < WET_MMH) return 0;
  let frac: number;
  if (mmHMin >= WET_MMH) frac = 1;
  else if (mmHMax <= mmHMin) frac = mmH >= WET_MMH ? 1 : 0;
  else frac = (mmHMax - WET_MMH) / (mmHMax - mmHMin);
  // Bei klarem Zentralwert über der Schwelle nicht künstlich drücken.
  if (mmH >= WET_MMH) frac = Math.max(frac, 0.5);
  const p = frac * (0.55 + 0.45 * confidence);
  return Math.max(0, Math.min(1, Math.round(p * 100) / 100));
}

/** Wandelt einen fertigen Nowcast in das UI-entkoppelte Abfrage-Ergebnis. */
export function toQueryResult(nc: Nowcast, lat: number, lon: number, country: Country): NowcastQueryResult {
  const h = NOWCAST_STEP_MIN / 60;
  let cum = 0;
  const steps: NowcastQueryStep[] = nc.steps.map((s) => {
    cum += s.mmH * h;
    const band = intensityBand(s.mmH);
    return {
      minutes: s.minutes,
      timestampMs: s.timestamp.getTime(),
      mmH: s.mmH,
      mmHMin: s.mmHMin,
      mmHMax: s.mmHMax,
      cumulativeMm: Math.round(cum * 10) / 10,
      band,
      bandLabel: intensityLabel(band),
      phase: s.phase,
      character: s.character,
      rainProbability: stepRainProbability(s.mmH, s.mmHMin, s.mmHMax, s.confidence),
      source: s.source,
      confidence: s.confidence,
    };
  });
  return {
    lat, lon, country,
    nowMs: nc.nowMs,
    radarSource: nc.radarSource,
    radarValidMin: nc.radarValidMin,
    skillHorizonMin: nc.skillHorizonMin,
    steps,
    summary: {
      sumMm: nc.summary.sumMm,
      sumMinMm: nc.summary.sumMinMm,
      sumMaxMm: nc.summary.sumMaxMm,
      dominantPhase: nc.summary.dominantPhase,
      thunderRiskPct: nc.summary.thunderRiskPct,
      hailRiskPct: nc.summary.hailRiskPct,
      heavyRain: nc.summary.heavyRain,
      snowLineM: nc.summary.snowLineM,
      currentlyRaining: nc.currentlyRaining,
      nextRainInMin: nc.nextRainInMin,
      dryWindow: nc.dryWindow,
    },
  };
}

export interface QueryNowcastOptions {
  lat: number;
  lon: number;
  country: Country;
  signal?: AbortSignal;
  nowMs?: number;
}

/**
 * Punkt-/Zeitabfrage des 0–6-h-Nowcasts (US-A7). Holt die Daten über die
 * bestehende Engine und liefert das UI-entkoppelte Ergebnis.
 */
export async function queryNowcastPoint(opts: QueryNowcastOptions): Promise<NowcastQueryResult> {
  const nc = await buildNowcast(opts);
  return toQueryResult(nc, opts.lat, opts.lon, opts.country);
}

/** Wert an einem bestimmten Zeitpunkt (nächstgelegener Schritt). */
export function sampleQueryAt(result: NowcastQueryResult, etaMs: number): NowcastQueryStep | null {
  if (!result.steps.length) return null;
  let best = result.steps[0], bestD = Infinity;
  for (const s of result.steps) {
    const d = Math.abs(s.timestampMs - etaMs);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface NcQueryCheck { case: string; ok: boolean; detail: string }
export function verifyNowcastQuery(): { checks: NcQueryCheck[]; passed: number; failed: number } {
  const checks: NcQueryCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Wahrscheinlichkeit: trocken → 0, sicher nass → hoch, Bandkante → mittel.
  add('PoP trocken = 0', stepRainProbability(0, 0, 0.05, 0.9) === 0);
  add('PoP sicher nass hoch', stepRainProbability(2, 1.5, 2.5, 0.9) >= 0.8, String(stepRainProbability(2, 1.5, 2.5, 0.9)));
  const edge = stepRainProbability(0.05, 0, 0.4, 0.5);
  add('PoP Bandkante in (0,1)', edge > 0 && edge < 0.8, String(edge));
  add('PoP monoton mit Konfidenz', stepRainProbability(2, 1.5, 2.5, 0.9) >= stepRainProbability(2, 1.5, 2.5, 0.3));

  // toQueryResult: Kumulation monoton steigend, Bandlabel konsistent.
  const now = 1_700_000_000_000;
  const fakeNc = {
    steps: [
      { index: 0, minutes: 0, timestamp: new Date(now), mmH: 0, mmHMin: 0, mmHMax: 0.2, source: 'radar', confidence: 0.9, phase: 'dry', character: null, tempC: 8, snowLineM: null, heavy: false },
      { index: 1, minutes: 15, timestamp: new Date(now + 15 * 60000), mmH: 2, mmHMin: 1.5, mmHMax: 2.5, source: 'radar', confidence: 0.85, phase: 'rain', character: 'steady', tempC: 8, snowLineM: null, heavy: false },
    ],
    summary: { sumMm: 0.5, sumMinMm: 0.3, sumMaxMm: 0.7, dominantPhase: 'rain', thunderRiskPct: 0, hailRiskPct: 0, heavyRain: false, snowLineM: null },
    currentlyRaining: false, nextRainInMin: 15, dryWindow: null,
    radarSource: 'radolan_rv', radarValidMin: 120, skillHorizonMin: 120, nowMs: now,
  } as unknown as Nowcast;
  const q = toQueryResult(fakeNc, 50.7, 8.3, 'DE');
  add('Query: 2 Schritte', q.steps.length === 2);
  add('Query: Kumulation monoton', q.steps[1].cumulativeMm >= q.steps[0].cumulativeMm);
  add('Query: Bandlabel mäßig bei 2 mm/h', q.steps[1].bandLabel === 'mäßig', q.steps[1].bandLabel);
  add('Query: nextRainInMin durchgereicht', q.summary.nextRainInMin === 15);
  add('Query: sampleQueryAt nächster Schritt', sampleQueryAt(q, now + 15 * 60000)?.minutes === 15);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyNowcastQuery: typeof verifyNowcastQuery }).__verifyNowcastQuery = verifyNowcastQuery;
}
