/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — View-Modell.
 *
 * Verbindet die Multi-Modell-Daten mit dem Confidence-Kern zu pro-Tag-Sichten
 * (Confidence-Stufe, Regenwahrscheinlichkeit, Wetter-Icon). Reine Komposition.
 */

import { dayConfidence, confidenceLevel, precipProbability, type ConfidenceResult } from './confidenceModel';
import { dayDelta, dayStability, sparklinePoints, type DeltaInfo, type StabilityInfo } from './stabilityModel';
import type { MultiModelForecast, DayForecast } from './multiModel';
import type { ForecastHistory } from './forecastHistory';

export type WeatherIcon = 'sun' | 'cloud' | 'rain';

export interface DayVM {
  day: DayForecast;
  confidence: ConfidenceResult;
  precipProb: number;
  icon: WeatherIcon;
  /** Anzahl Modelle mit Werten an diesem Tag. */
  modelCount: number;
}

/**
 * @param hitFactor Treffsicherheits-Faktor (US-7.5): jüngste Trefferquote der
 *   Quellen skaliert den Score sanft (≈0,85…1,06). 1 = neutral/keine Daten.
 */
export function buildDayVMs(forecast: MultiModelForecast, hitFactor = 1): DayVM[] {
  return forecast.days.map((day) => {
    const base = dayConfidence(day.tMaxByModel, day.tMinByModel, day.leadDays);
    const score = Math.max(0.08, Math.min(0.97, base * hitFactor));
    const confidence = confidenceLevel(score);
    // EINE Schwelle (Tagessumme ≥ 1 mm) für Wahrscheinlichkeit UND Icon — so kann
    // nie „Regenwahrscheinlichkeit hoch" + Sonnen-Icon zugleich erscheinen (US-1.3).
    const precipProb = precipProbability(day.precipByModel);
    const icon: WeatherIcon = precipProb >= 0.5 ? 'rain' : precipProb >= 0.25 ? 'cloud' : 'sun';
    const modelCount = day.tMaxByModel.filter(Number.isFinite).length;
    return { day, confidence, precipProb, icon, modelCount };
  });
}

/** Erster Tag (frühester Vorlauf) mit niedriger Sicherheit — für den Hinweis (US-1.4). */
export function firstLowConfidenceDay(vms: DayVM[]): DayVM | null {
  return vms.find((v) => v.confidence.level === 'low') ?? null;
}

export interface DayStab { delta: DeltaInfo; stability: StabilityInfo; spark: number[] | null }

/** Stabilitäts-Infos je Datum aus der Verlaufshistorie (EPIC 3). */
export function buildStabilityMap(history: ForecastHistory): Map<string, DayStab> {
  const m = new Map<string, DayStab>();
  for (const d of history.days) {
    m.set(d.dateISO, { delta: dayDelta(d.tMaxRuns), stability: dayStability(d.tMaxRuns), spark: sparklinePoints(d.tMaxRuns) });
  }
  return m;
}

/** Visuelle Kodierung je Stufe (Farbe + Icon-Glyph) — barrierearm (US-1.2). */
export function levelStyle(level: ConfidenceResult['level']): { color: string; glyph: string } {
  switch (level) {
    case 'high': return { color: '#7A9466', glyph: '✓' };
    case 'mid': return { color: '#C99A4E', glyph: '≈' };
    case 'low': return { color: '#6B7A8F', glyph: '!' };
  }
}
