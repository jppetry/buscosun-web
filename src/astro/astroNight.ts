/**
 * Epic ASTRO — Bewertung einer Beobachtungsnacht.
 *
 * Führt je Nacht zusammen: mehrschichtige Bewölkung (US2), Mondphase/-einfluss
 * (US3), Tau-/Feuchterisiko (US4), astronomische Dunkelheit (US6) und einen
 * Nacht-Score zum Ranking (US1). Die Konfidenz (US7) kommt aus der bestehenden
 * Event-Bewertung. Quelle: vorhandener Punktforecast (inkl. Wolkenschichten).
 */

import type { PointForecast, PointForecastHour } from '../pointForecast/types';
import { computeAstroDarkness, type DarknessWindow } from '../photo/sun';
import { moonInfo, moonAltitudeDeg, type MoonPhaseName } from './moon';

const isNum = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/** Stunden der Nacht (21:00 des Tages bis 06:00 des Folgetags, lokal). */
function nightHours(forecast: PointForecast, dateISO: string): PointForecastHour[] {
  const start = new Date(`${dateISO}T21:00:00`).getTime();
  const end = start + 9 * 3_600_000; // bis 06:00 Folgetag
  return forecast.hours.filter((h) => { const t = h.timestamp.getTime(); return t >= start && t <= end; });
}

/** Taupunkt (°C) nach Magnus. */
function dewPoint(tempC: number, rhPct: number): number {
  const rh = Math.max(1, Math.min(100, rhPct));
  const g = Math.log(rh / 100) + (17.625 * tempC) / (243.04 + tempC);
  return (243.04 * g) / (17.625 - g);
}

export type DewLevel = 'low' | 'moderate' | 'high';

export interface AstroCloud {
  total: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

export interface AstroMoon {
  illumination: number;   // 0..1
  phase: MoonPhaseName;
  emoji: string;
  /** Steht der Mond während der Nacht über dem Horizont? */
  upDuringNight: boolean;
  /** Störwirkung 0..1 = Beleuchtung × Über-Horizont-Anteil. */
  interference: number;
}

export interface AstroDew {
  dewPointC: number | null;
  /** Kleinste Temperatur-Taupunkt-Spanne der Nacht (°C). */
  spreadC: number | null;
  level: DewLevel;
  risk: number; // 0..1
}

export interface AstroNight {
  dateISO: string;
  hasWeather: boolean;
  score: number;          // 0..100 (US1)
  reason: string;
  cloud: AstroCloud;      // US2
  cloudQuality: number;   // 0..1
  moon: AstroMoon;        // US3
  dew: AstroDew;          // US4
  darkness: DarknessWindow; // US6
  confidence: number;     // US7
  isTendency: boolean;
  isBest: boolean;
}

function dewLevel(risk: number): DewLevel {
  return risk >= 0.5 ? 'high' : risk >= 0.25 ? 'moderate' : 'low';
}

/** Mond-Störwirkung über die Nacht: Beleuchtung × Anteil über Horizont. */
function moonForNight(dateISO: string, lat: number, lon: number, dk: DarknessWindow): AstroMoon {
  const midnight = new Date(new Date(`${dateISO}T00:00:00`).getTime() + 86_400_000);
  const info = moonInfo(midnight);
  // Über das Dunkelheitsfenster (oder ersatzweise 22–04 Uhr) Mondhöhe sampeln.
  let samples: Date[];
  if (dk.dusk && dk.dawn) {
    const n = 5;
    samples = Array.from({ length: n }, (_, i) => new Date(dk.dusk!.getTime() + ((dk.dawn!.getTime() - dk.dusk!.getTime()) * i) / (n - 1)));
  } else {
    const base = new Date(`${dateISO}T00:00:00`).getTime();
    samples = [22, 24, 26, 28].map((h) => new Date(base + h * 3_600_000)); // 22,0,2,4
  }
  const up = samples.filter((t) => moonAltitudeDeg(t, lat, lon) > 0).length;
  const upFraction = up / samples.length;
  return {
    illumination: info.illumination,
    phase: info.phase,
    emoji: info.emoji,
    upDuringNight: upFraction > 0,
    interference: info.illumination * upFraction,
  };
}

/**
 * Baut die Astro-Bewertung einer Nacht. Lichtfenster (Dunkelheit) + Mond werden
 * immer berechnet; Wolken/Tau nur bei vorhandenen Wetterdaten.
 */
export function buildAstroNight(
  forecast: PointForecast,
  dateISO: string,
  lat: number,
  lon: number,
  confidence: number,
  isTendency: boolean,
): AstroNight {
  const darkness = computeAstroDarkness(dateISO, lat, lon);
  const moon = moonForNight(dateISO, lat, lon, darkness);
  const hours = nightHours(forecast, dateISO);
  const hasWeather = hours.length >= 3;

  const cloud: AstroCloud = {
    total: hasWeather ? round(avg(hours.map((h) => h.cloudCoverTotal).filter(isNum))) : null,
    low: hasWeather ? round(avg(hours.map((h) => h.cloudCoverLow).filter(isNum))) : null,
    mid: hasWeather ? round(avg(hours.map((h) => h.cloudCoverMid).filter(isNum))) : null,
    high: hasWeather ? round(avg(hours.map((h) => h.cloudCoverHigh).filter(isNum))) : null,
  };

  // Wolkenqualität: klarer Himmel zählt; hohe (dünne) Wolken stören überproportional.
  const total = cloud.total ?? 100;
  const high = cloud.high ?? 0;
  const cloudQuality = hasWeather ? clamp01(((100 - total) / 100) * (1 - 0.4 * (high / 100))) : 0;

  // Tau-/Feuchterisiko: kleine Temp–Taupunkt-Spanne + schwacher Wind.
  let dew: AstroDew = { dewPointC: null, spreadC: null, level: 'low', risk: 0 };
  if (hasWeather) {
    let minSpread = Infinity;
    let dpAtMin: number | null = null;
    let any = false;
    for (const h of hours) {
      if (isNum(h.temperature) && isNum(h.relativeHumidity)) {
        const dp = dewPoint(h.temperature, h.relativeHumidity);
        const sp = h.temperature - dp;
        any = true;
        if (sp < minSpread) { minSpread = sp; dpAtMin = dp; }
      }
    }
    const winds = hours.map((h) => h.windSpeed).filter(isNum);
    if (any) {
      const minWind = winds.length ? Math.min(...winds) : 0;
      const spreadF = clamp01((3 - minSpread) / 3);
      const windF = clamp01((3.5 - minWind) / 3.5);
      const risk = clamp01(spreadF * (0.5 + 0.5 * windF));
      dew = { dewPointC: round(dpAtMin), spreadC: round(minSpread), level: dewLevel(risk), risk };
    }
  }

  const moonFactor = 1 - 0.7 * moon.interference;
  const dewFactor = 1 - 0.4 * dew.risk;
  const score = hasWeather ? Math.round(100 * cloudQuality * moonFactor * dewFactor) : 0;

  return {
    dateISO, hasWeather, score, reason: reasonFor(cloud, moon, dew, hasWeather),
    cloud, cloudQuality, moon, dew, darkness, confidence, isTendency, isBest: false,
  };
}

function reasonFor(cloud: AstroCloud, moon: AstroMoon, dew: AstroDew, hasWeather: boolean): string {
  if (!hasWeather) return 'keine Vorhersage';
  const parts: string[] = [];
  const t = cloud.total ?? 100;
  parts.push(t < 20 ? 'klarer Himmel' : t < 50 ? 'gering bewölkt' : t < 80 ? 'wechselnd bewölkt' : 'bedeckt');
  if ((cloud.high ?? 0) >= 30 && t < 60) parts.push('hohe Schleierwolken');
  parts.push(moon.illumination < 0.1 ? 'quasi mondlos' : `Mond ${Math.round(moon.illumination * 100)} %${moon.upDuringNight ? '' : ' (unter Horizont)'}`);
  if (dew.level === 'high') parts.push('hohes Taurisiko');
  return parts.join(' · ');
}

function round(x: number | null): number | null {
  return x == null ? null : Math.round(x);
}

export interface AstroRanking {
  nights: AstroNight[];
  bestIndex: number;
  scorableCount: number;
}

/** Reiht die Nächte nach Astro-Eignung; markiert genau die beste (US1). */
export function rankAstroNights(nights: AstroNight[]): AstroRanking {
  let bestIndex = -1, bestScore = -1;
  nights.forEach((n, i) => { if (n.hasWeather && n.score > bestScore) { bestScore = n.score; bestIndex = i; } });
  if (bestIndex >= 0) nights[bestIndex].isBest = true;
  return { nights, bestIndex, scorableCount: nights.filter((n) => n.hasWeather).length };
}
