/**
 * Per-Tour-Aggregation der Per-Sample-Wetterwerte. Reine Berechnung — keine
 * UI. Wird vom {@link WeatherSummary}-Panel und der `WeatherProfile`-Sparkline
 * verbraucht.
 *
 * Niederschlag wird **zeit-integriert**: jeder Sample-Wert (mm/h) wird mit
 * dem Intervall zum nächsten Sample (in Stunden) multipliziert. So spiegelt
 * `totalMm` die tatsächlich erwartete Regenmenge wider, unabhängig von der
 * Sample-Dichte. Die letzte Sample bekommt das mittlere Intervall der Tour.
 *
 * Warnungen werden nach `alertId` dedupliziert; für jede Event-Gruppe wird
 * die Sample-Index-Range bestimmt, in der sie aktiv war — Basis für eine
 * km-Spanne in der UI („zwischen km 5,2 und km 9,8").
 */

import type { SampleETA } from './tourTiming';
import type { TourWarning } from '../pointForecast/types';

export interface MinMaxAvg {
  min: number;
  max: number;
  avg: number;
}

export interface WeatherAggregate {
  hasData: boolean;
  sampleCount: number;
  withWeatherCount: number;
  temp: MinMaxAvg | null;
  apparent: MinMaxAvg | null;
  wind: { avg: number; max: number } | null;
  gust: { max: number } | null;
  humidity: { avg: number } | null;
  cloud: { avg: number } | null;
  /** UV-Index: max/avg über alle Samples mit Wert (Tier: DWD-Tagespeak, sonnenverteilt). */
  uv: { max: number; avg: number } | null;
  precip: {
    totalMm: number;
    hoursWithRain: number;
    maxRateMmH: number;
    fromRadarCount: number;
    fromNwpCount: number;
    /** Hat die Tour mindestens einen Sample mit Schnee/Schneeregen? */
    hasSnow: boolean;
    hasSleet: boolean;
    /** Hauptniederschlagsart über die Tour (häufigster Typ ≠ 'none'). */
    dominantType: 'rain' | 'sleet' | 'snow' | 'none';
  };
  /** Schneefallgrenze: min/max/avg über alle Samples die einen Wert haben. */
  snowLine: { min: number; max: number; avg: number } | null;
  /** Föhn entlang der Tour (heuristisch). null wenn kein Sample Föhn meldet. */
  foehn: {
    /** Anzahl Samples mit isFoehn=true. */
    count: number;
    /** Höchster Score über alle Samples (0..1). */
    maxScore: number;
    /** km-Spanne, in der Föhn markiert war. */
    firstDistM: number;
    lastDistM: number;
    /** Vereinte Gründe der Föhn-Samples (dedupliziert auf Indikator-Kategorie). */
    reasons: string[];
  } | null;
  warnings: {
    count: number;                     // distinct alertIds
    maxLevel: number;                  // 1..5; 0 wenn keine
    distinct: AggregatedWarning[];
  };
}

export interface AggregatedWarning extends TourWarning {
  firstSampleIdx: number;
  lastSampleIdx: number;
  firstDistM: number;
  lastDistM: number;
}

/** Schwellwert ab dem ein Sample als „nass" zählt (mm/h). */
const RAIN_THRESHOLD = 0.1;

export function computeWeatherAggregate(samples: SampleETA[]): WeatherAggregate {
  const withW = samples.filter((s) => s.weather != null);
  const empty = !withW.length;

  if (empty) {
    return {
      hasData: false, sampleCount: samples.length, withWeatherCount: 0,
      temp: null, apparent: null, wind: null, gust: null, humidity: null, cloud: null, uv: null,
      precip: {
        totalMm: 0, hoursWithRain: 0, maxRateMmH: 0,
        fromRadarCount: 0, fromNwpCount: 0,
        hasSnow: false, hasSleet: false, dominantType: 'none',
      },
      snowLine: null,
      foehn: null,
      warnings: { count: 0, maxLevel: 0, distinct: [] },
    };
  }

  // Min/Max/Avg-Helfer (überspringt null-Werte).
  const stat = (pick: (s: SampleETA) => number | null | undefined): MinMaxAvg | null => {
    const vals: number[] = [];
    for (const s of withW) {
      const v = pick(s);
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return null;
    let min = vals[0], max = vals[0], sum = 0;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    return { min, max, avg: sum / vals.length };
  };

  const temp = stat((s) => s.weather?.temperatureC ?? null);
  const apparent = stat((s) => s.weather?.apparentTempC ?? null);
  const windStat = stat((s) => s.weather?.windSpeedMps ?? null);
  const gustStat = stat((s) => s.weather?.gustMps ?? null);
  const humidStat = stat((s) => s.weather?.relativeHumidityPct ?? null);
  const cloudStat = stat((s) => s.weather?.cloudCoverPct ?? null);
  const uvStat = stat((s) => s.weather?.uvIndex ?? null);

  // Niederschlag zeit-integriert.
  const intervalsH = sampleIntervalsHours(samples);
  let totalMm = 0;
  let hoursWithRain = 0;
  let maxRate = 0;
  let radarCnt = 0, nwpCnt = 0;
  let snowCnt = 0, sleetCnt = 0, rainCnt = 0;
  for (let i = 0; i < samples.length; i++) {
    const w = samples[i].weather;
    if (!w) continue;
    const dt = intervalsH[i];
    const rate = w.precipitationMmH ?? 0;
    totalMm += rate * dt;
    if (rate > RAIN_THRESHOLD) hoursWithRain += dt;
    if (rate > maxRate) maxRate = rate;
    if (w.precipitationSource === 'radar') radarCnt++;
    else if (w.precipitationSource === 'nwp') nwpCnt++;
    if (w.precipitationType === 'snow') snowCnt++;
    else if (w.precipitationType === 'sleet') sleetCnt++;
    else if (w.precipitationType === 'rain') rainCnt++;
  }
  const dominantType: 'rain' | 'sleet' | 'snow' | 'none' =
    snowCnt + sleetCnt + rainCnt === 0 ? 'none' :
    snowCnt > sleetCnt && snowCnt > rainCnt ? 'snow' :
    sleetCnt > rainCnt ? 'sleet' : 'rain';

  // Schneefallgrenze (nur Samples mit Wert).
  const snowVals: number[] = [];
  for (const s of withW) {
    const v = s.weather?.snowLineM;
    if (v != null && Number.isFinite(v)) snowVals.push(v);
  }
  let snowLineAgg: { min: number; max: number; avg: number } | null = null;
  if (snowVals.length > 0) {
    let mn = snowVals[0], mx = snowVals[0], sum = 0;
    for (const v of snowVals) { if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
    snowLineAgg = { min: mn, max: mx, avg: sum / snowVals.length };
  }

  // Föhn-Aggregation: Samples mit isFoehn=true zählen, km-Range + Gründe.
  let foehnCount = 0, foehnMaxScore = 0;
  let foehnFirst = Infinity, foehnLast = -Infinity;
  const foehnReasons = new Set<string>();
  for (let i = 0; i < samples.length; i++) {
    const f = samples[i].weather?.foehn;
    if (!f) continue;
    if (f.score > foehnMaxScore) foehnMaxScore = f.score;
    if (f.isFoehn) {
      foehnCount++;
      foehnFirst = Math.min(foehnFirst, samples[i].dist);
      foehnLast = Math.max(foehnLast, samples[i].dist);
      // Auf Indikator-Kategorie deduplizieren (erstes Wort).
      for (const r of f.reasons) foehnReasons.add(r.split(' ')[0]);
    }
  }
  const foehnAgg = foehnCount > 0
    ? {
        count: foehnCount, maxScore: foehnMaxScore,
        firstDistM: foehnFirst, lastDistM: foehnLast,
        reasons: [...foehnReasons],
      }
    : null;

  // Warnungs-Aggregation: dedupe nach alertId, finde Sample-Range.
  const warnMap = new Map<string, AggregatedWarning>();
  for (let i = 0; i < samples.length; i++) {
    const w = samples[i].weather;
    if (!w) continue;
    for (const wn of w.warnings) {
      const existing = warnMap.get(wn.alertId);
      if (existing) {
        existing.lastSampleIdx = i;
        existing.lastDistM = samples[i].dist;
      } else {
        warnMap.set(wn.alertId, {
          ...wn,
          firstSampleIdx: i, lastSampleIdx: i,
          firstDistM: samples[i].dist, lastDistM: samples[i].dist,
        });
      }
    }
  }
  const distinct = [...warnMap.values()].sort((a, b) => b.level - a.level || a.firstSampleIdx - b.firstSampleIdx);
  const maxLevel = distinct.reduce((m, w) => Math.max(m, w.level), 0);

  return {
    hasData: true,
    sampleCount: samples.length,
    withWeatherCount: withW.length,
    temp, apparent,
    wind: windStat ? { avg: windStat.avg, max: windStat.max } : null,
    gust: gustStat ? { max: gustStat.max } : null,
    humidity: humidStat ? { avg: humidStat.avg } : null,
    cloud: cloudStat ? { avg: cloudStat.avg } : null,
    uv: uvStat ? { max: uvStat.max, avg: uvStat.avg } : null,
    precip: {
      totalMm,
      hoursWithRain,
      maxRateMmH: maxRate,
      fromRadarCount: radarCnt,
      fromNwpCount: nwpCnt,
      hasSnow: snowCnt > 0,
      hasSleet: sleetCnt > 0,
      dominantType,
    },
    snowLine: snowLineAgg,
    foehn: foehnAgg,
    warnings: { count: distinct.length, maxLevel, distinct },
  };
}

/** Pro Sample das Intervall zum nächsten in Stunden; für den letzten Sample
 *  das Mittel der vorigen Intervalle. */
function sampleIntervalsHours(samples: SampleETA[]): number[] {
  if (samples.length < 2) return samples.map(() => 0);
  const ints = new Array<number>(samples.length).fill(0);
  let sum = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const dh = Math.max(0, (samples[i + 1].etaMs - samples[i].etaMs) / 3_600_000);
    ints[i] = dh;
    sum += dh;
  }
  const avg = sum / (samples.length - 1);
  ints[samples.length - 1] = avg;
  return ints;
}

// ---------------------------------------------------------------------------
// Verifikation — synthetische Sample-Listen, exakte Erwartungswerte.
// ---------------------------------------------------------------------------
export interface AggCheck { name: string; expected: unknown; got: unknown; ok: boolean }
export interface AggVerifyResult { checks: AggCheck[]; passed: number; failed: number }

function mkSample(idx: number, dist: number, etaMs: number, w: Partial<NonNullable<SampleETA['weather']>> | null): SampleETA {
  const base: SampleETA = {
    index: idx, dist, lat: 48 + idx * 0.001, lon: 11, ele: 500, etaMs,
    arrivalOffsetMin: 0, segmentSpeedKmh: 5,
  };
  if (w) base.weather = {
    temperatureC: null, apparentTempC: null, windSpeedMps: null, windDirectionDeg: null,
    gustMps: null, relativeHumidityPct: null, cloudCoverPct: null, uvIndex: null,
    precipitationMmH: null, precipitationSource: null,
    precipitationType: 'none', snowLineM: null, foehn: null,
    warnings: [],
    confidence: { temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0 },
    cellId: 0, sourcesUsed: [], isInterpolated: false, validityFlags: ['ok'],
    ...w,
  };
  return base;
}

export function verifyAggregate(): AggVerifyResult {
  const checks: AggCheck[] = [];
  const push = (name: string, expected: unknown, got: unknown, ok: boolean) =>
    checks.push({ name, expected, got, ok });

  // ---- Case 1: leer
  let a = computeWeatherAggregate([]);
  push('leer → hasData=false', false, a.hasData, a.hasData === false);

  // ---- Case 2: 3 Samples ohne Wetter
  a = computeWeatherAggregate([mkSample(0,0,0,null), mkSample(1,1000,3600_000,null)]);
  push('keine Wetter-Anreicherung → hasData=false', false, a.hasData, a.hasData === false);

  // ---- Case 3: T/Wind/Gust
  const t = 1000;
  a = computeWeatherAggregate([
    mkSample(0, 0,     t,             { temperatureC: 10, windSpeedMps: 2, gustMps: 4, uvIndex: 0 }),
    mkSample(1, 1000,  t + 3600_000,  { temperatureC: 14, windSpeedMps: 6, gustMps: 9, uvIndex: 8 }),
    mkSample(2, 2000,  t + 7200_000,  { temperatureC: 12, windSpeedMps: 4, gustMps: 7, uvIndex: 4 }),
  ]);
  push('T min', 10, a.temp?.min, a.temp?.min === 10);
  push('T max', 14, a.temp?.max, a.temp?.max === 14);
  push('T avg', 12, a.temp?.avg, a.temp?.avg === 12);
  push('Wind max', 6, a.wind?.max, a.wind?.max === 6);
  push('Gust max', 9, a.gust?.max, a.gust?.max === 9);
  push('UV max', 8, a.uv?.max, a.uv?.max === 8);
  push('UV avg', 4, a.uv?.avg, a.uv?.avg === 4);

  // ---- Case 4: Precip-Integration (1h-Intervalle, rates 2 + 4 + 0 mm/h)
  // erwartetes total: 2*1 + 4*1 + 0*1 = 6 mm
  a = computeWeatherAggregate([
    mkSample(0, 0,     t,             { precipitationMmH: 2, precipitationSource: 'radar' }),
    mkSample(1, 1000,  t + 3600_000,  { precipitationMmH: 4, precipitationSource: 'nwp' }),
    mkSample(2, 2000,  t + 7200_000,  { precipitationMmH: 0, precipitationSource: 'nwp' }),
  ]);
  push('Precip total = 6 mm', 6, a.precip.totalMm, a.precip.totalMm === 6);
  push('Stunden mit Regen = 2 (samples 0 + 1)', 2, a.precip.hoursWithRain, a.precip.hoursWithRain === 2);
  push('Max rate = 4 mm/h', 4, a.precip.maxRateMmH, a.precip.maxRateMmH === 4);
  push('Radar-Count = 1', 1, a.precip.fromRadarCount, a.precip.fromRadarCount === 1);
  push('NWP-Count = 2', 2, a.precip.fromNwpCount, a.precip.fromNwpCount === 2);

  // ---- Case 5: Warnungen-Dedup
  const wA = (): TourWarning => ({
    source: 'dwd_cap', alertId: 'A1', event: 'Sturmböen', severity: 'Severe', level: 4,
    headline: 'Sturm', onsetMs: t, expiresMs: t + 10*3600_000,
  });
  const wB = (): TourWarning => ({
    source: 'dwd_cap', alertId: 'B1', event: 'Gewitter', severity: 'Extreme', level: 5,
    headline: 'Gewitter', onsetMs: t, expiresMs: t + 10*3600_000,
  });
  a = computeWeatherAggregate([
    mkSample(0, 0,    t,            { warnings: [wA()] }),
    mkSample(1, 1000, t+3600_000,   { warnings: [wA(), wB()] }),
    mkSample(2, 2000, t+7200_000,   { warnings: [wB()] }),
    mkSample(3, 3000, t+10800_000,  { warnings: [] }),
  ]);
  push('Distinct warnings = 2', 2, a.warnings.count, a.warnings.count === 2);
  push('MaxLevel = 5 (Extreme zuerst)', 5, a.warnings.maxLevel, a.warnings.maxLevel === 5);
  push('Sort: Extreme zuerst', 'Gewitter', a.warnings.distinct[0]?.event, a.warnings.distinct[0]?.event === 'Gewitter');
  push('Sturm-Range firstIdx=0', 0, a.warnings.distinct[1]?.firstSampleIdx, a.warnings.distinct[1]?.firstSampleIdx === 0);
  push('Sturm-Range lastIdx=1', 1, a.warnings.distinct[1]?.lastSampleIdx, a.warnings.distinct[1]?.lastSampleIdx === 1);
  push('Gewitter-Range firstIdx=1', 1, a.warnings.distinct[0]?.firstSampleIdx, a.warnings.distinct[0]?.firstSampleIdx === 1);
  push('Gewitter-Range lastIdx=2', 2, a.warnings.distinct[0]?.lastSampleIdx, a.warnings.distinct[0]?.lastSampleIdx === 2);

  // ---- Case 6: gemischte 30-min-Intervalle
  // rates 4 mm/h × 0.5h + 0 × 0.5h = 2 mm
  a = computeWeatherAggregate([
    mkSample(0, 0,    t,            { precipitationMmH: 4, precipitationSource: 'radar' }),
    mkSample(1, 500,  t+1800_000,   { precipitationMmH: 0, precipitationSource: 'nwp' }),
  ]);
  // 1. Sample: 0.5h × 4 = 2.0
  // 2. Sample: 0.5h × 0 = 0 (das letzte intervall = mittel der vorigen = 0.5h)
  push('30-min-Intervalle: total = 2 mm', 2, a.precip.totalMm, a.precip.totalMm === 2);

  return {
    checks,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
  };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyWeatherAggregate: typeof verifyAggregate })
    .__verifyWeatherAggregate = verifyAggregate;
}
