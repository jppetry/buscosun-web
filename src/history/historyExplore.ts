/**
 * Feature „Wetterhistorie" — Zeitpunkt-Erkunden (pur).
 *
 * Auswertung des TATSÄCHLICHEN Wetters für einen konkreten Tag / Monat / Jahr
 * (nicht Trend): Kennzahlen, Verläufe und Einordnung gegen Normal/Rekord. Reine
 * Statistik über die Tagesbeobachtungen, headless-testbar.
 */

import {
  type DailyRecord, type NormalPeriod, mean, sum, percentile, dayClimatology, monthName,
} from './historyModel';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export type DayCondition = 'sun' | 'cloud' | 'rain' | 'snow';

/** Grobe Wetterlage eines Tages aus Niederschlag/Sonne/Schnee (für das Icon). */
export function dayCondition(d: DailyRecord): DayCondition {
  if (isNum(d.snowCm) && d.snowCm > 0.2) return 'snow';
  if (isNum(d.precipMm) && d.precipMm >= 1) return 'rain';
  if (isNum(d.sunshineH) && d.sunshineH >= 5) return 'sun';
  return 'cloud';
}

// --- Tag ---------------------------------------------------------------------

export interface DayInsight {
  record: DailyRecord;
  condition: DayCondition;
  tMaxDevC: number | null;     // Tmax gegen Tages-Median aller Jahre
  isRecordHigh: boolean;       // wärmster je an diesem Kalendertag
  isRecordLow: boolean;        // kältester je
  percentileRank: number | null; // 0..1: wo liegt Tmax in der Verteilung dieses Tages
  label: string;               // „ungewöhnlich warm" o. ä.
  clim: { p10: number; p50: number; p90: number; min: number; max: number } | null;
}

/** Einordnung eines konkreten Tages (E7.2). */
export function dayInsight(days: DailyRecord[], dateISO: string): DayInsight | null {
  const rec = days.find((d) => d.dateISO === dateISO);
  if (!rec) return null;
  const clim = dayClimatology(days, 'tmax').find((c) => c.doy === rec.doy) ?? null;
  let tMaxDevC: number | null = null, isHigh = false, isLow = false, pr: number | null = null, label = '';
  if (clim && isNum(rec.tMaxC)) {
    tMaxDevC = rec.tMaxC - clim.p50;
    isHigh = rec.tMaxC >= clim.max - 0.05;
    const allForDoy = days.filter((d) => d.doy === rec.doy && isNum(d.tMaxC)).map((d) => d.tMaxC as number);
    pr = allForDoy.length ? allForDoy.filter((v) => v <= (rec.tMaxC as number)).length / allForDoy.length : null;
    label = pr == null ? '' : pr >= 0.95 ? 'außergewöhnlich warm' : pr >= 0.8 ? 'ungewöhnlich warm' : pr <= 0.05 ? 'außergewöhnlich kalt' : pr <= 0.2 ? 'ungewöhnlich kühl' : 'im typischen Bereich';
  }
  const climMin = days.filter((d) => d.doy === rec.doy && isNum(d.tMinC)).map((d) => d.tMinC as number);
  if (climMin.length && isNum(rec.tMinC)) isLow = rec.tMinC <= Math.min(...climMin) + 0.05;
  return { record: rec, condition: dayCondition(rec), tMaxDevC, isRecordHigh: isHigh, isRecordLow: isLow, percentileRank: pr, label, clim: clim ? { p10: clim.p10, p50: clim.p50, p90: clim.p90, min: clim.min, max: clim.max } : null };
}

// --- Monat -------------------------------------------------------------------

export interface MonthDayPoint { day: number; tMax: number | null; tMin: number | null; tMean: number | null; precip: number | null; sun: number | null }
export interface MonthInsight {
  year: number; month: number; label: string; n: number;
  tMeanC: number | null; tMaxHigh: { v: number; day: number } | null; tMinLow: { v: number; day: number } | null;
  precipSum: number; sunSum: number; rainyDays: number; dryDays: number; frostDays: number; summerDays: number;
  days: MonthDayPoint[];
  wettestDay: { v: number; day: number } | null;
  /** Normalwerte des Monats (Mittel über Referenzperiode). */
  normal: { tMeanC: number | null; precipSum: number | null } | null;
}

/** Auswertung eines konkreten Monats (tatsächliches Wetter). */
export function monthInsight(days: DailyRecord[], year: number, month: number, period?: NormalPeriod): MonthInsight {
  const md = days.filter((d) => d.year === year && d.month === month).sort((a, b) => a.day - b.day);
  const tMeans = md.map((d) => d.tMeanC).filter(isNum);
  let tMaxHigh: MonthInsight['tMaxHigh'] = null, tMinLow: MonthInsight['tMinLow'] = null, wettest: MonthInsight['wettestDay'] = null;
  for (const d of md) {
    if (isNum(d.tMaxC) && (!tMaxHigh || d.tMaxC > tMaxHigh.v)) tMaxHigh = { v: d.tMaxC, day: d.day };
    if (isNum(d.tMinC) && (!tMinLow || d.tMinC < tMinLow.v)) tMinLow = { v: d.tMinC, day: d.day };
    if (isNum(d.precipMm) && (!wettest || d.precipMm > wettest.v)) wettest = { v: d.precipMm, day: d.day };
  }
  const normal = period ? monthNormal(days, month, period) : null;
  return {
    year, month, label: `${monthName(month)} ${year}`, n: md.length,
    tMeanC: mean(tMeans),
    tMaxHigh, tMinLow,
    precipSum: Math.round(sum(md.map((d) => d.precipMm).filter(isNum)) * 10) / 10,
    sunSum: Math.round(sum(md.map((d) => d.sunshineH).filter(isNum))),
    rainyDays: md.filter((d) => isNum(d.precipMm) && d.precipMm >= 1).length,
    dryDays: md.filter((d) => isNum(d.precipMm) && d.precipMm < 1).length,
    frostDays: md.filter((d) => isNum(d.tMinC) && d.tMinC < 0).length,
    summerDays: md.filter((d) => isNum(d.tMaxC) && d.tMaxC >= 25).length,
    days: md.map((d) => ({ day: d.day, tMax: d.tMaxC, tMin: d.tMinC, tMean: d.tMeanC, precip: d.precipMm, sun: d.sunshineH })),
    wettestDay: wettest, normal,
  };
}

/** Normalwerte eines Monats über die Referenzperiode (Mittel der Monatsmittel/-summen). */
export function monthNormal(days: DailyRecord[], month: number, period: NormalPeriod): { tMeanC: number | null; precipSum: number | null } {
  const tMeans: number[] = [], precips: number[] = [];
  for (let y = period.start; y <= period.end; y++) {
    const md = days.filter((d) => d.year === y && d.month === month);
    if (!md.length) continue;
    const tm = mean(md.map((d) => d.tMeanC).filter(isNum)); if (tm != null) tMeans.push(tm);
    precips.push(sum(md.map((d) => d.precipMm).filter(isNum)));
  }
  return { tMeanC: mean(tMeans), precipSum: precips.length ? Math.round((sum(precips) / precips.length) * 10) / 10 : null };
}

// --- Jahr --------------------------------------------------------------------

export interface YearMonthPoint { month: number; tMeanC: number | null; tMaxMeanC: number | null; tMinMeanC: number | null; precipSum: number; sunSum: number }
export interface YearInsight {
  year: number; n: number;
  tMeanC: number | null; tMaxHigh: { v: number; dateISO: string } | null; tMinLow: { v: number; dateISO: string } | null;
  precipSum: number; sunSum: number;
  hotDays: number; summerDays: number; frostDays: number; iceDays: number; tropicalNights: number;
  months: YearMonthPoint[];
  /** Jahresmittel-Anomalie gegen Referenzperiode. */
  anomalyC: number | null; normalLabel: string | null;
}

/** Auswertung eines konkreten Jahres (tatsächliches Wetter). */
export function yearInsight(days: DailyRecord[], year: number, period?: NormalPeriod): YearInsight {
  const yd = days.filter((d) => d.year === year);
  let tMaxHigh: YearInsight['tMaxHigh'] = null, tMinLow: YearInsight['tMinLow'] = null;
  for (const d of yd) {
    if (isNum(d.tMaxC) && (!tMaxHigh || d.tMaxC > tMaxHigh.v)) tMaxHigh = { v: d.tMaxC, dateISO: d.dateISO };
    if (isNum(d.tMinC) && (!tMinLow || d.tMinC < tMinLow.v)) tMinLow = { v: d.tMinC, dateISO: d.dateISO };
  }
  const months: YearMonthPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = yd.filter((d) => d.month === m);
    months.push({
      month: m, tMeanC: mean(mm.map((d) => d.tMeanC).filter(isNum)),
      tMaxMeanC: mean(mm.map((d) => d.tMaxC).filter(isNum)), tMinMeanC: mean(mm.map((d) => d.tMinC).filter(isNum)),
      precipSum: Math.round(sum(mm.map((d) => d.precipMm).filter(isNum)) * 10) / 10, sunSum: Math.round(sum(mm.map((d) => d.sunshineH).filter(isNum))),
    });
  }
  const tMeanYear = mean(yd.map((d) => d.tMeanC).filter(isNum));
  let anomalyC: number | null = null, normalLabel: string | null = null;
  if (period && tMeanYear != null) {
    const refMeans: number[] = [];
    for (let y = period.start; y <= period.end; y++) { const v = mean(days.filter((d) => d.year === y).map((d) => d.tMeanC).filter(isNum)); if (v != null) refMeans.push(v); }
    const refMean = mean(refMeans);
    if (refMean != null) { anomalyC = Math.round((tMeanYear - refMean) * 10) / 10; normalLabel = period.label; }
  }
  return {
    year, n: yd.length, tMeanC: tMeanYear, tMaxHigh, tMinLow,
    precipSum: Math.round(sum(yd.map((d) => d.precipMm).filter(isNum))), sunSum: Math.round(sum(yd.map((d) => d.sunshineH).filter(isNum))),
    hotDays: yd.filter((d) => isNum(d.tMaxC) && d.tMaxC >= 30).length,
    summerDays: yd.filter((d) => isNum(d.tMaxC) && d.tMaxC >= 25).length,
    frostDays: yd.filter((d) => isNum(d.tMinC) && d.tMinC < 0).length,
    iceDays: yd.filter((d) => isNum(d.tMaxC) && d.tMaxC < 0).length,
    tropicalNights: yd.filter((d) => isNum(d.tMinC) && d.tMinC > 20).length,
    months, anomalyC, normalLabel,
  };
}

/** Verfügbare Monate/Tage mit Daten (für Navigations-Grenzen). */
export function hasDataFor(days: DailyRecord[], year: number, month?: number): boolean {
  return days.some((d) => d.year === year && (month == null || d.month === month) && (isNum(d.tMeanC) || isNum(d.precipMm)));
}

export { percentile };
