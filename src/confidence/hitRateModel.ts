/**
 * Treffsicherheit/Rückblick — Kern (EPIC 7, pur).
 *
 * Aus damaliger Vorhersage und Ist-Näherung (Konsens-Analyse) werden je Quelle
 * berechnet: mittlere Abweichung (Temperatur/Wind als MAE, US-7.1), Niederschlag
 * als Ja/Nein-Trefferquote (offener Validierungspunkt), Reihung nach Güte mit
 * Mindest-Datenbasis-Guard (US-7.3), Laien-Label (US-7.2) und ein Confidence-
 * Faktor (US-7.5). Reine Statistik, headless prüfbar.
 */

import type { HitRateData, Lead, VarKey } from './hitRate';
import { HIT_VARS } from './hitRate';
import { PRECIP_HOUR_WET_MM } from './confidenceModel';

/**
 * Niederschlag-Schwelle für den Ja/Nein-Treffer — STÜNDLICH (mm/h), bewusst
 * andere Einheit als die tagesbasierte Regenwahrscheinlichkeit (≥1 mm/Tag): hier
 * wird je Stunde geprüft, ob Vorhersage und Ist beide „nass" (≥0,2 mm/h) waren.
 */
export const HIT_PRECIP_WET_MM = PRECIP_HOUR_WET_MM;
/**
 * Mindest-Datenbasis (Validierungspunkt / US-7.3): Tage mit gültigem Ist im
 * Fenster, ab denen die Quellen-Reihung als belastbar gilt. 5 Tage = mehrere
 * unabhängige Wetterlagen, sodass nicht ein einzelner Glücks-/Pechtag die
 * Rangfolge bestimmt; darunter wird die Reihung im UI als „noch unsicher"
 * markiert (statt eine irreführende Rangfolge vorzutäuschen).
 */
export const HIT_MIN_DAYS = 5;

/** Mittlere absolute Abweichung über ausgerichtete, endliche Paare. */
export function mae(forecast: number[], actual: number[]): { value: number; n: number } {
  let sum = 0, n = 0;
  const len = Math.min(forecast.length, actual.length);
  for (let i = 0; i < len; i++) {
    const f = forecast[i], a = actual[i];
    if (Number.isFinite(f) && Number.isFinite(a)) { sum += Math.abs(f - a); n++; }
  }
  return { value: n ? sum / n : NaN, n };
}

/** Niederschlag: Anteil Stunden, in denen Ja/Nein-Regen übereinstimmt (0…1). */
export function precipHitRate(forecast: number[], actual: number[], wetMm = HIT_PRECIP_WET_MM): { rate: number; n: number } {
  let hit = 0, n = 0;
  const len = Math.min(forecast.length, actual.length);
  for (let i = 0; i < len; i++) {
    const f = forecast[i], a = actual[i];
    if (Number.isFinite(f) && Number.isFinite(a)) { if ((f >= wetMm) === (a >= wetMm)) hit++; n++; }
  }
  return { rate: n ? hit / n : NaN, n };
}

export interface SourceScore {
  id: string;
  label: string;
  color: string;
  isConsensus: boolean;
  /** Rohwert: MAE (temp/wind) bzw. Trefferquote 0…1 (precip). */
  raw: number;
  /** Stunden in der Wertung. */
  n: number;
  /** Anzeige-Text, z. B. „±1,2 °C" oder „87 % Treffer". */
  valueText: string;
}

export interface SourceRanking {
  variable: VarKey;
  lead: Lead;
  windowDays: number;
  /** Niederschlag = Trefferquote (höher besser), sonst Abweichung (kleiner besser). */
  higherIsBetter: boolean;
  scores: SourceScore[]; // bereits gereiht (best → schlecht)
  /** Tage mit gültigen Daten im Fenster. */
  dayBasis: number;
  reliable: boolean; // dayBasis >= HIT_MIN_DAYS
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function windowSlice(data: HitRateData, windowDays: number): number[] {
  // Indizes der Stunden, die in den letzten `windowDays` (vergangenen) Tagen liegen.
  const maxDay = Math.max(...data.hours.filter((h) => h.isPast).map((h) => h.dayIndex));
  const minDay = maxDay - windowDays + 1;
  return data.hours.map((h, i) => (h.isPast && h.dayIndex >= minDay && h.dayIndex <= maxDay ? i : -1)).filter((i) => i >= 0);
}

const pick = (xs: number[], idx: number[]) => idx.map((i) => xs[i]);

function fmtValue(variable: VarKey, raw: number, unit: string): string {
  if (!Number.isFinite(raw)) return '—';
  if (variable === 'precip') return `${Math.round(raw * 100)} % Treffer`;
  return `±${r1(raw).toLocaleString('de-DE', { minimumFractionDigits: 1 })} ${unit}`;
}

/** Reihung der Quellen für Variable + Vorlaufzeit + Fenster (US-7.1/7.3). */
export function sourceRanking(data: HitRateData, variable: VarKey, lead: Lead, windowDays: number): SourceRanking {
  const vMeta = HIT_VARS.find((v) => v.key === variable)!;
  const idx = windowSlice(data, windowDays);
  const actual = pick(data.consensusActual[variable], idx);
  const higherIsBetter = variable === 'precip';

  const scores: SourceScore[] = data.models.map((m) => {
    const fc = pick(data.series[variable][m.id].byLead[lead], idx);
    const { raw, n } = variable === 'precip'
      ? (() => { const r = precipHitRate(fc, actual); return { raw: r.rate, n: r.n }; })()
      : (() => { const r = mae(fc, actual); return { raw: r.value, n: r.n }; })();
    return { id: m.id, label: m.label, color: m.color, isConsensus: false, raw, n, valueText: fmtValue(variable, raw, vMeta.unit) };
  });

  // Konsens-Pseudoquelle = Mittel der Modell-Vorhersagen je Stunde.
  const consensusFc = idx.map((i) => {
    const vals = data.models.map((m) => data.series[variable][m.id].byLead[lead][i]).filter(Number.isFinite);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  });
  const cons = variable === 'precip' ? precipHitRate(consensusFc, actual) : mae(consensusFc, actual);
  const consRaw = variable === 'precip' ? (cons as { rate: number }).rate : (cons as { value: number }).value;
  scores.push({ id: 'consensus', label: 'Konsens', color: '#2C2A26', isConsensus: true, raw: consRaw, n: cons.n, valueText: fmtValue(variable, consRaw, vMeta.unit) });

  const valid = scores.filter((s) => Number.isFinite(s.raw));
  valid.sort((a, b) => (higherIsBetter ? b.raw - a.raw : a.raw - b.raw));
  const invalid = scores.filter((s) => !Number.isFinite(s.raw));

  // Datenbasis: Tage mit gültigem Konsens-Ist im Fenster.
  const dayBasis = new Set(idx.filter((i) => Number.isFinite(data.consensusActual[variable][i])).map((i) => data.hours[i].dayIndex)).size;

  return { variable, lead, windowDays, higherIsBetter, scores: [...valid, ...invalid], dayBasis, reliable: dayBasis >= HIT_MIN_DAYS };
}

export interface HitLabel { tone: 'good' | 'mixed' | 'poor'; glyph: string; text: string }

/**
 * Einfaches Laien-Label (US-7.2) aus der besten Temperatur-Abweichung (Lead 1).
 * Farb- UND Icon-codiert (nie Farbe allein).
 */
export function simpleLabel(bestTempMae: number): HitLabel {
  if (!Number.isFinite(bestTempMae)) return { tone: 'mixed', glyph: '·', text: 'Noch keine Trefferdaten' };
  if (bestTempMae <= 1.5) return { tone: 'good', glyph: '✓', text: 'Zuletzt meist zutreffend' };
  if (bestTempMae <= 3.0) return { tone: 'mixed', glyph: '≈', text: 'Zuletzt teils daneben' };
  return { tone: 'poor', glyph: '!', text: 'Zuletzt häufig daneben' };
}

/**
 * Confidence-Faktor (US-7.5): jüngste Trefferquote (beste Temp-MAE, Lead 1) als
 * EIN Faktor in den Sicherheits-Score. Gute Treffer (≤1 °C) heben leicht (×1.06),
 * schlechte (≥4 °C) senken (bis ×0.85); neutral bei ~2 °C. Bewusst sanft —
 * dominiert nie die Modell-Streuung. Nicht für Endnutzer sichtbar.
 */
export function confidenceFactor(bestTempMae: number): number {
  if (!Number.isFinite(bestTempMae)) return 1;
  const f = 1.06 - (bestTempMae - 1) * 0.07; // 1°C→1.06, 2°C→0.99, 4°C→0.85
  return Math.max(0.85, Math.min(1.06, f));
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface HitCheck { case: string; ok: boolean; detail: string }

export function verifyHitRateModel(): { checks: HitCheck[]; passed: number; failed: number } {
  const checks: HitCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  add('MAE exakt', mae([10, 12, 14], [11, 10, 14]).value === (1 + 2 + 0) / 3, `${mae([10, 12, 14], [11, 10, 14]).value}`);
  add('MAE ignoriert NaN', mae([10, NaN, 14], [11, 5, 14]).n === 2);
  add('precip Treffer 3/4', precipHitRate([0, 1, 0, 2], [0, 0, 1, 3]).rate === 0.5, `${precipHitRate([0, 1, 0, 2], [0, 0, 1, 3]).rate}`);
  add('precip alle Treffer', precipHitRate([1, 0, 1], [2, 0, 3]).rate === 1);

  // Label-Stufen.
  add('Label gut', simpleLabel(1.1).tone === 'good' && simpleLabel(1.1).glyph === '✓');
  add('Label mixed', simpleLabel(2.5).tone === 'mixed');
  add('Label schlecht', simpleLabel(3.5).tone === 'poor');
  add('Label ohne Daten', simpleLabel(NaN).text.includes('Noch keine'));

  // Confidence-Faktor monoton fallend, geklemmt.
  add('Faktor gut > 1', confidenceFactor(1) > 1 && confidenceFactor(1) <= 1.06);
  add('Faktor schlecht geklemmt', confidenceFactor(10) === 0.85);
  add('Faktor neutral bei NaN', confidenceFactor(NaN) === 1);
  add('Faktor monoton', confidenceFactor(1) > confidenceFactor(2) && confidenceFactor(2) > confidenceFactor(3));

  // Ranking auf synthetischen Daten: ein Modell exakt, eins schlecht.
  const data = makeSyntheticData();
  const rk = sourceRanking(data, 'temp', 1, 7);
  add('Ranking best = exaktes Modell', rk.scores[0].id === 'good_model' || rk.scores[0].raw <= rk.scores[1].raw, `${rk.scores[0].id} ${rk.scores[0].raw}`);
  add('Ranking enthält Konsens', rk.scores.some((s) => s.isConsensus));
  add('Reihung kleiner = besser (temp)', !rk.higherIsBetter && rk.scores[0].raw <= rk.scores[rk.scores.length - 1].raw);
  add('Datenbasis-Guard greift', sourceRanking(makeSyntheticData(2), 'temp', 1, 7).reliable === false, `${sourceRanking(makeSyntheticData(2), 'temp', 1, 7).dayBasis}`);
  add('precip higherIsBetter', sourceRanking(data, 'precip', 1, 7).higherIsBetter === true);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

/** Baut HitRateData mit `days` vergangenen Tagen: good_model exakt, bad_model +5°C. */
function makeSyntheticData(days = 7): HitRateData {
  const models = [
    { id: 'good_model', label: 'Gut', color: '#000' },
    { id: 'bad_model', label: 'Schlecht', color: '#000' },
  ];
  const H = days * 24;
  const hours = Array.from({ length: H }, (_, h) => ({ tMs: h * 3600_000, dayIndex: Math.floor(h / 24), isPast: true }));
  const truthTemp = Array.from({ length: H }, (_, h) => 15 + 8 * Math.sin((h % 24) / 24 * Math.PI * 2));
  const truthPrecip = Array.from({ length: H }, (_, h) => (h % 6 === 0 ? 1 : 0));
  const mk = (truth: number[], offGood: number, offBad: number) => ({
    good_model: { actual: truth, byLead: { 1: truth.map((t) => t + offGood), 3: truth.map((t) => t + offGood) } },
    bad_model: { actual: truth, byLead: { 1: truth.map((t) => t + offBad), 3: truth.map((t) => t + offBad) } },
  });
  return {
    lat: 0, lon: 0, fetchedAt: 0, models, hours,
    series: {
      temp: mk(truthTemp, 0, 5),
      precip: mk(truthPrecip, 0, 0),
      wind: mk(truthTemp, 1, 3),
    } as HitRateData['series'],
    consensusActual: { temp: truthTemp, precip: truthPrecip, wind: truthTemp },
    pastDayISOs: Array.from({ length: days }, (_, d) => `d${d}`),
  };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyHitRateModel: typeof verifyHitRateModel }).__verifyHitRateModel = verifyHitRateModel;
}
