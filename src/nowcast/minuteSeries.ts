/**
 * Minutenverlauf (MV) — pure model of the precipitation series at the place over 48 h.
 *
 * Sources, kept apart and named: the radar frames at the point (RADOLAN-RV 5-min images up to +2 h, INCA 15-min up
 * to +3 h; rzc is one analysis without a nowcast) give the minute-precise part — one sample per frame, linearly
 * interpolated to the minute between frames. Beyond the last frame buscosun Fusion carries on as HOURLY means
 * (a cube step at t is the mean over (t − 1 h, t]) with its P(wet) per hour. No minute is invented beyond the radar.
 *
 * No DOM, no network — the card and the chart only draw what this module returns. `?mv=0` = the named fallback
 * (no card, no modal, cube request as before).
 */
import { WET_MMH } from './nowcastModel';

export const MV_HORIZON_H = 48;
const H = 3_600_000;
const MIN = 60_000;

export function minuteSeriesEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('mv') !== '0'; } catch { return true; }
}

/** One radar frame sampled at the place (`null` = outside the grid / no value). */
export interface RadarFrameSample { tMs: number; mmH: number | null }

/** Hourly value of buscosun Fusion as the engine reduces it (`tMs` = END of the hour). */
export interface FusionHourValue { tMs: number; mmH: number; conf: number }

export interface MinutePoint { tMs: number; mmH: number }

export interface HourBar {
  fromMs: number;
  toMs: number;
  /** Mean rate over the hour (mm/h). */
  mmH: number;
  /** P(precipitation) in the hour — 1 − pDry (V-RC-1); `null` without the cube path. */
  pWet: number | null;
  conf: number;
}

export interface MinuteSeries {
  nowMs: number;
  endMs: number;
  radar: {
    points: MinutePoint[];
    fromMs: number;
    toMs: number;
    product: string;
    /** Spacing of the frames (minutes) — the true resolution behind the interpolated minutes. */
    frameStepMin: number;
  } | null;
  hours: HourBar[];
  maxMmH: number;
  firstWet: { tMs: number; source: 'radar' | 'fusion' } | null;
  fusionLabel: string;
}

export interface MinuteSeriesInput {
  nowMs: number;
  radarFrames: RadarFrameSample[];
  radarSource: string;
  fusionHours: FusionHourValue[];
  fusionPWet: Array<{ tMs: number; p: number }> | null;
  fusionLabel: string;
  horizonH?: number;
}

export function radarProductName(source: string): string {
  return source === 'radolan_rv' ? 'DWD RADOLAN-RV' : source === 'inca_grid' ? 'GeoSphere INCA' : source === 'meteoswiss_rzc' ? 'MeteoSchweiz rzc' : 'Radar';
}

function interpolateMinutes(frames: RadarFrameSample[], fromMs: number, toMs: number): MinutePoint[] {
  const ok = frames.filter((f) => f.mmH != null && Number.isFinite(f.mmH)).sort((a, b) => a.tMs - b.tMs) as Array<{ tMs: number; mmH: number }>;
  if (ok.length < 2) return [];
  const out: MinutePoint[] = [];
  let i = 0;
  for (let t = fromMs; t <= toMs; t += MIN) {
    while (i < ok.length - 2 && ok[i + 1].tMs < t) i++;
    const a = ok[i], b = ok[i + 1];
    const w = b.tMs > a.tMs ? Math.max(0, Math.min(1, (t - a.tMs) / (b.tMs - a.tMs))) : 0;
    out.push({ tMs: t, mmH: Math.max(0, a.mmH * (1 - w) + b.mmH * w) });
  }
  return out;
}

export function buildMinuteSeries(input: MinuteSeriesInput): MinuteSeries {
  const nowMs = Math.floor(input.nowMs / MIN) * MIN;
  const horizonH = input.horizonH ?? MV_HORIZON_H;
  const endMs = nowMs + horizonH * H;

  // --- radar: minute by minute between the frames, from now to the last frame ---
  const frames = input.radarFrames.filter((f) => f.mmH != null).sort((a, b) => a.tMs - b.tMs);
  let radar: MinuteSeries['radar'] = null;
  if (frames.length >= 2) {
    const lastMs = frames[frames.length - 1].tMs;
    const firstMs = frames[0].tMs;
    const radarFrom = Math.max(nowMs, firstMs);
    const radarTo = Math.min(lastMs, endMs);
    if (radarTo > radarFrom) {
      const points = interpolateMinutes(frames, radarFrom, radarTo);
      if (points.length >= 2) {
        radar = {
          points, fromMs: radarFrom, toMs: radarTo, product: radarProductName(input.radarSource),
          frameStepMin: Math.round((lastMs - firstMs) / (frames.length - 1) / MIN),
        };
      }
    }
  }

  // --- buscosun Fusion: hourly means after the radar (the first hour cut at the seam) ---
  const seamMs = radar ? radar.toMs : nowMs;
  const pByStart = new Map<number, number>();
  for (const e of input.fusionPWet ?? []) pByStart.set(e.tMs, e.p);
  const hours: HourBar[] = [];
  for (const h of [...input.fusionHours].sort((a, b) => a.tMs - b.tMs)) {
    const to = h.tMs, from = h.tMs - H;
    if (to <= seamMs || from >= endMs) continue;
    hours.push({
      fromMs: Math.max(from, seamMs), toMs: Math.min(to, endMs), mmH: Math.max(0, h.mmH),
      pWet: pByStart.get(from) ?? null, conf: h.conf,
    });
  }

  let maxMmH = 0;
  for (const p of radar?.points ?? []) maxMmH = Math.max(maxMmH, p.mmH);
  for (const b of hours) maxMmH = Math.max(maxMmH, b.mmH);

  let firstWet: MinuteSeries['firstWet'] = null;
  const wetMinute = radar?.points.find((p) => p.mmH >= WET_MMH);
  if (wetMinute) firstWet = { tMs: wetMinute.tMs, source: 'radar' };
  else {
    const wetHour = hours.find((b) => b.mmH >= WET_MMH);
    if (wetHour) firstWet = { tMs: wetHour.fromMs, source: 'fusion' };
  }

  return { nowMs, endMs, radar, hours, maxMmH, firstWet, fusionLabel: input.fusionLabel };
}

/** Value at a time: the radar minute or the hour bar (`null` = no source covers the time). */
export function valueAt(series: MinuteSeries, tMs: number): { mmH: number; source: 'radar' | 'fusion'; bar: HourBar | null; point: MinutePoint | null } | null {
  if (series.radar && tMs >= series.radar.fromMs && tMs <= series.radar.toMs) {
    const i = Math.max(0, Math.min(series.radar.points.length - 1, Math.round((tMs - series.radar.fromMs) / MIN)));
    const p = series.radar.points[i];
    return { mmH: p.mmH, source: 'radar', bar: null, point: p };
  }
  const bar = series.hours.find((b) => tMs >= b.fromMs && tMs < b.toMs) ?? null;
  return bar ? { mmH: bar.mmH, source: 'fusion', bar, point: null } : null;
}

/** "Nice" top of the mm/h axis (at least 1 mm/h; thresholds like the intensity scale). */
export function niceMaxMmH(v: number): number {
  const steps = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80];
  for (const s of steps) if (v * 1.08 <= s) return s;
  return Math.ceil(v * 1.08 / 10) * 10;
}

/** Time ticks for a range (minutes from now, step by range), aligned to the clock. */
export function timeTicks(nowMs: number, rangeH: number): Array<{ tMs: number; major: boolean }> {
  const stepMin = rangeH <= 2 ? 15 : rangeH <= 6 ? 60 : rangeH <= 24 ? 180 : 360;
  const endMs = nowMs + rangeH * H;
  const out: Array<{ tMs: number; major: boolean }> = [];
  const local = new Date(nowMs);
  // align to the local clock (full hours / quarter hours)
  const base = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0).getTime();
  const first = Math.ceil((nowMs - base) / (stepMin * MIN)) * stepMin * MIN + base;
  for (let t = first; t <= endMs; t += stepMin * MIN) {
    const d = new Date(t);
    out.push({ tMs: t, major: d.getHours() === 0 && d.getMinutes() === 0 });
  }
  return out;
}
