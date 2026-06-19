/**
 * Epic FOTO — fotografische Wetter-Heuristiken.
 *
 * FOTO-US2: Bewölkungsqualität (weiches Porträtlicht vs. reizvolle Wolken-
 *           stimmung vs. flau/hart) — aus Bedeckung UND Schichtung.
 * FOTO-US3: Nebel- (morgens) und Abendrot-Chance (abends) als „Chance".
 * FOTO-US4: jede Lichtaussage trägt eine Wahrscheinlichkeit, keine Garantie.
 *
 * Quelle: bestehender Punktforecast (cloudCoverTotal + low/mid/high, Feuchte,
 * Wind) — keine neue API. Bewusst Heuristiken: Licht ist nicht garantierbar.
 */

import type { PointForecast, PointForecastHour } from '../pointForecast/types';
import { computeLightWindows, type LightWindows } from './sun';

const isNum = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hoursForDate(forecast: PointForecast, dateISO: string): PointForecastHour[] {
  return forecast.hours.filter((h) => localDateISO(h.timestamp) === dateISO);
}
function hoursInRange(hours: PointForecastHour[], fromH: number, toH: number): PointForecastHour[] {
  return hours.filter((h) => { const hr = h.timestamp.getHours(); return hr >= fromH && hr <= toH; });
}

// --- FOTO-US2: Bewölkungsqualität ---------------------------------------------

export type CloudMoodKind = 'harsh' | 'flat' | 'dramatic' | 'soft' | 'mixed' | 'unknown';

export interface CloudMood {
  kind: CloudMoodKind;
  emoji: string;
  label: string;
  /** Erläuterung fürs UI. */
  note: string;
  /** Eignung des Lichts 0..1 (fließt in die Wahrscheinlichkeit ein, US4). */
  quality: number;
  cloudMeanPct: number;
  layers: { low: number | null; mid: number | null; high: number | null };
}

/**
 * Klassifiziert die Lichtstimmung eines Zeitfensters aus Bedeckungsgrad und
 * Schichtung: tiefe, gleichmäßige Bewölkung → weiches Porträtlicht; mittel-/
 * hohe, gebrochene Bewölkung → reizvolle Wolkenstimmung; dichtes Tief → flau;
 * wolkenlos → hartes Licht.
 */
export function cloudMoodFor(hours: PointForecastHour[]): CloudMood {
  const totals = hours.map((h) => h.cloudCoverTotal).filter(isNum);
  if (!totals.length) {
    return { kind: 'unknown', emoji: '·', label: 'keine Daten', note: 'außerhalb des Vorhersage-Horizonts', quality: 0, cloudMeanPct: 0, layers: { low: null, mid: null, high: null } };
  }
  const cloudMean = avg(totals)!;
  const low = avg(hours.map((h) => h.cloudCoverLow).filter(isNum));
  const mid = avg(hours.map((h) => h.cloudCoverMid).filter(isNum));
  const high = avg(hours.map((h) => h.cloudCoverHigh).filter(isNum));
  const lowEff = low ?? cloudMean;       // ohne Schichten: Gesamt als Tiefbewölkung lesen
  const midHigh = (mid ?? 0) + (high ?? 0);

  let kind: CloudMoodKind, emoji: string, label: string, note: string, quality: number;
  if (cloudMean < 12) {
    kind = 'harsh'; emoji = '☀️'; label = 'Hartes Klarlicht';
    note = 'wolkenlos — kontrastreich, wenig Stimmung (Mittagslicht hart)'; quality = 0.5;
  } else if (cloudMean > 85 && lowEff > 70) {
    kind = 'flat'; emoji = '☁️'; label = 'Flau bedeckt';
    note = 'dichte Tiefbewölkung — diffus und grau, wenig Zeichnung'; quality = 0.35;
  } else if (midHigh >= 25 && cloudMean >= 22 && cloudMean <= 82) {
    kind = 'dramatic'; emoji = '🌤️'; label = 'Reizvolle Wolkenstimmung';
    note = 'mittel-/hohe, gebrochene Bewölkung — strukturierter Himmel, dramatisches Licht'; quality = 0.9;
  } else if (cloudMean >= 55 && cloudMean <= 88) {
    kind = 'soft'; emoji = '🌥️'; label = 'Weiches Porträtlicht';
    note = 'gleichmäßig bedeckt — weiche, schattenarme Ausleuchtung'; quality = 0.85;
  } else {
    kind = 'mixed'; emoji = '⛅'; label = 'Wechselnde Bewölkung';
    note = 'teils sonnig, teils bewölkt — brauchbares, wechselndes Licht'; quality = 0.62;
  }
  return { kind, emoji, label, note, quality, cloudMeanPct: Math.round(cloudMean), layers: { low, mid, high } };
}

// --- FOTO-US3: Nebel- & Abendrot-Chance ---------------------------------------

export type ChanceLevel = 'low' | 'moderate' | 'high';

export interface ChanceAssessment {
  /** 0..1 Wahrscheinlichkeit (heuristisch). */
  prob: number;
  level: ChanceLevel;
  /** Datengrundlage vorhanden? */
  hasData: boolean;
}

function levelOf(prob: number): ChanceLevel {
  return prob >= 0.5 ? 'high' : prob >= 0.22 ? 'moderate' : 'low';
}

/**
 * Nebel-Chance am Morgen: hohe Luftfeuchte + schwacher Wind + (für Strahlungs-
 * nebel günstig) wenig Tiefbewölkung. Heuristik, keine Garantie.
 */
export function fogChanceFor(hours: PointForecastHour[]): ChanceAssessment {
  const hum = hours.map((h) => h.relativeHumidity).filter(isNum);
  const wind = hours.map((h) => h.windSpeed).filter(isNum);
  if (!hum.length || !wind.length) return { prob: 0, level: 'low', hasData: false };
  const humMax = Math.max(...hum);
  const windMin = Math.min(...wind);
  const low = avg(hours.map((h) => h.cloudCoverLow ?? h.cloudCoverTotal).filter(isNum)) ?? 50;
  const humF = clamp01((humMax - 88) / 12);
  const windF = clamp01((3.5 - windMin) / 3.5);
  const clearF = 0.7 + 0.3 * clamp01((60 - low) / 60);
  const prob = clamp01(humF * windF * clearF);
  return { prob, level: levelOf(prob), hasData: true };
}

/**
 * Abendrot-Chance: mittel-/hohe Wolken als „Leinwand" am Abendhimmel, während
 * die tiefe Bewölkung nicht zu dicht ist (Licht erreicht die Wolken von unten).
 */
export function afterglowChanceFor(hours: PointForecastHour[]): ChanceAssessment {
  const totals = hours.map((h) => h.cloudCoverTotal).filter(isNum);
  if (!totals.length) return { prob: 0, level: 'low', hasData: false };
  const mid = avg(hours.map((h) => h.cloudCoverMid).filter(isNum)) ?? 0;
  const high = avg(hours.map((h) => h.cloudCoverHigh).filter(isNum)) ?? 0;
  const low = avg(hours.map((h) => h.cloudCoverLow).filter(isNum)) ?? (avg(totals) ?? 50);
  const midHigh = Math.min(100, mid + high);
  // Gunst-Glocke um ~45 % mittel/hohe Wolken.
  const canvas = clamp01(1 - Math.abs(midHigh - 45) / 45);
  const lowClear = clamp01((65 - low) / 65);
  const prob = clamp01(canvas * lowClear);
  return { prob, level: levelOf(prob), hasData: true };
}

// --- FOTO-US4: Wahrscheinlichkeit statt Garantie ------------------------------

/**
 * Wahrscheinlichkeit für „gutes Fotolicht" (0..100) — kombiniert Lichtqualität
 * (Bewölkungs-Mood) mit der Vorhersage-Konfidenz des Tages. Bewusst gedeckelt
 * (< 95 %): Licht ist nie garantiert.
 */
export function lightProbabilityPct(quality: number, confidence: number): number {
  const p = quality * (0.6 + 0.4 * clamp01(confidence));
  return Math.min(95, Math.round(p * 100));
}

// --- Zusammenführung je Tag ---------------------------------------------------

export interface PhotoDay {
  dateISO: string;
  windows: LightWindows;
  hasWeather: boolean;
  morningMood: CloudMood | null;
  eveningMood: CloudMood | null;
  fog: ChanceAssessment;
  afterglow: ChanceAssessment;
  /** Beste Lichtqualität des Tages (max aus Morgen/Abend). */
  bestQuality: number;
  /** Wahrscheinlichkeit für gutes Licht (US4), null ohne Wetterdaten. */
  lightProbability: number | null;
}

/** Stundenfenster für die Mood-Auswertung rund um Auf-/Untergang ableiten. */
function aroundHour(h: number | null, before: number, after: number, fallback: [number, number]): [number, number] {
  if (h == null) return fallback;
  return [Math.max(0, h - before), Math.min(23, h + after)];
}

/**
 * Baut die komplette Foto-Lichtlage eines Tages: exakte Lichtfenster (immer) +
 * — sofern Wetterdaten vorliegen — Bewölkungsqualität, Nebel-/Abendrot-Chance
 * und die Licht-Wahrscheinlichkeit.
 */
export function buildPhotoDay(forecast: PointForecast, dateISO: string, lat: number, lon: number, confidence: number): PhotoDay {
  const windows = computeLightWindows(dateISO, lat, lon);
  const dayHours = hoursForDate(forecast, dateISO);
  const hasWeather = dayHours.length >= 3;

  const sunriseH = windows.sunrise ? windows.sunrise.getHours() : null;
  const sunsetH = windows.sunset ? windows.sunset.getHours() : null;
  const [mFrom, mTo] = aroundHour(sunriseH, 1, 2, [5, 9]);
  const [eFrom, eTo] = aroundHour(sunsetH, 2, 1, [16, 21]);

  const morningMood = hasWeather ? cloudMoodFor(hoursInRange(dayHours, mFrom, mTo)) : null;
  const eveningMood = hasWeather ? cloudMoodFor(hoursInRange(dayHours, eFrom, eTo)) : null;
  const fog = hasWeather ? fogChanceFor(hoursInRange(dayHours, Math.max(0, (sunriseH ?? 6) - 2), (sunriseH ?? 6) + 1)) : { prob: 0, level: 'low' as ChanceLevel, hasData: false };
  const afterglow = hasWeather ? afterglowChanceFor(hoursInRange(dayHours, eFrom, eTo)) : { prob: 0, level: 'low' as ChanceLevel, hasData: false };

  const qualities = [morningMood?.quality, eveningMood?.quality].filter(isNum);
  const bestQuality = qualities.length ? Math.max(...qualities) : 0;
  const lightProbability = hasWeather && qualities.length ? lightProbabilityPct(bestQuality, confidence) : null;

  return { dateISO, windows, hasWeather, morningMood, eveningMood, fog, afterglow, bestQuality, lightProbability };
}

export function chanceLabel(level: ChanceLevel): string {
  return level === 'high' ? 'hoch' : level === 'moderate' ? 'erhöht' : 'gering';
}
