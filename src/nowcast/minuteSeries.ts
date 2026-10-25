/**
 * Minutenverlauf (MV) — pure model of the precipitation series at the place over 48 h.
 *
 * Sources, kept apart and named: the radar frames at the point (RADOLAN-RV 5-min images up to +2 h, INCA 15-min up
 * to +3 h; rzc is one analysis without a nowcast) give the minute-precise part — one sample per frame, linearly
 * interpolated to the minute between frames. Beyond the last frame buscosun Fusion carries on as HOURLY means
 * (a cube step at t is the mean over (t − 1 h, t]) with its P(wet) per hour. No minute is invented beyond the radar.
 *
 * Phase RUC (on, `?ruc=0` = fallback; `audit/niederschlag-ruc.md`): between the radar seam and +27 h a third layer — the 5-min form of
 * ICON-D2-RUC fitted to the hourly sums of buscosun Fusion (`rucSeries.ts`). The hour bars it covers are flagged
 * `rucCovered` (the chart draws the steps instead); first wet, peak and sum read the steps there. Without `ruc` every
 * result is byte-identical to before.
 *
 * No DOM, no network — the card and the chart only draw what this module returns. `?mv=0` = the named fallback
 * (no card, no modal, cube request as before).
 */
import { WET_MMH } from './nowcastModel';
import { hourShowsRain } from './rainGate';
import type { RucFitted, RucHourKind } from './rucSeries';
import { RUC_LABEL } from '../point/rucFormat';

export const MV_HORIZON_H = 48;
/**
 * Horizon the Minutenverlauf SHOWS (Jan 25.10.2026: the overlay offers 2 | 6 | 27 h, nothing beyond): the series, its peak and sum run
 * to +27 h = the RUC horizon. The engine still requests `MV_HORIZON_H` hours of buscosun Fusion — the events keep their 48 h.
 */
export const MV_VIEW_H = 27;
const H = 3_600_000;
const MIN = 60_000;

export function minuteSeriesEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('mv') !== '0'; } catch { return true; }
}
/**
 * E-RUC-15 (Jan 25.10.2026: "mach ein Balkendiagramm daraus"): every layer as bars at its own resolution — one bar per radar image
 * (the image's rate over the interval to the next image), one per 5-min RUC interval, one per Fusion hour. Nothing is interpolated.
 * With bars the radar's first rain, peak and sum read the image bars (minute = start of the first wet image). `?mvbars=0` = the stand
 * before: radar minutes as a line, the RUC form as the curve/steps, first rain from the interpolated minute.
 */
export const MV_BARS_QUERY_KEY = 'mvbars';
export function minuteBarsEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get(MV_BARS_QUERY_KEY) !== '0'; } catch { return true; }
}

/** One radar frame sampled at the place (`null` = outside the grid / no value). */
export interface RadarFrameSample { tMs: number; mmH: number | null }

/** Hourly value of buscosun Fusion as the engine reduces it (`tMs` = END of the hour). */
export interface FusionHourValue { tMs: number; mmH: number; conf: number }

export interface MinutePoint { tMs: number; mmH: number }
/** E-RUC-15: one radar image as a bar — its rate from the image time to the next image (the first bar cut at "now"). */
export interface RadarBar { fromMs: number; toMs: number; mmH: number; frameMs: number }

export interface HourBar {
  fromMs: number;
  toMs: number;
  /** Mean rate over the hour (mm/h). */
  mmH: number;
  /** P(precipitation) in the hour — 1 − pDry (V-RC-1); `null` without the cube path. */
  pWet: number | null;
  conf: number;
  /** Phase RUC: the 5-min steps cover this bar (set only when a RUC layer exists). */
  rucCovered?: boolean;
  /** E-RUC-11: below the rain gate (mean < 0,1 mm/h or P(wet) < 30 %) — drawn as a hint, not as rain (set only with the gate). */
  trace?: boolean;
}

/** Phase RUC: one 5-min step (cut at the seam / the horizon); `trace` as on the bar (gate only). */
export interface RucStep { fromMs: number; toMs: number; mmH: number; kind: RucHourKind; trace?: boolean }

/** E-RUC-11: a span of consecutive trace hours with the highest chance and the expected amount ("16 % · 0,05 mm"). */
export interface TraceHint { fromMs: number; toMs: number; pMax: number | null; mm: number }

export interface RucLayer {
  points: RucStep[];
  fromMs: number;
  toMs: number;
  label: string;
  run: string;
  ageMin: number;
  stats: RucFitted['stats'];
}

export type MinuteSource = 'radar' | 'ruc' | 'fusion';

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
    /** E-RUC-15: the images as bars tiling [fromMs, toMs) — always present, the drawing picks bars or minutes. */
    bars: RadarBar[];
  } | null;
  hours: HourBar[];
  /** Phase RUC: the 5-min layer between the radar seam and +27 h; `null` without the product or the switch. */
  ruc: RucLayer | null;
  maxMmH: number;
  firstWet: { tMs: number; source: MinuteSource } | null;
  /** Highest rate in the 48 h and when (radar minute, RUC step start or Fusion hour start). */
  peak: { tMs: number; mmH: number; source: MinuteSource } | null;
  /** Expected total over the 48 h (mm): radar minutes + RUC steps + Fusion hour means beyond — with the gate only the hours drawn as rain. */
  sumMm: number;
  /** E-RUC-11: the expected amount of the trace hours (below the gate), shown as "+ x mm möglich"; 0 without the gate. */
  sumTraceMm: number;
  /** E-RUC-11: the trace spans for the hints of the chart; empty without the gate. */
  hints: TraceHint[];
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
  /** E-RUC-15: first rain, peak and sum of the radar part from the image bars (`?mvbars=0` = false = from the interpolated minutes). */
  bars?: boolean;
  /** Phase RUC: the fitted 5-min form (`nowcast.ruc`); absent/null = as before. */
  ruc?: RucFitted | null;
  /** E-RUC-11: the rain gate (`nowcast.rainGate`); absent/false = every hour ≥ 0,1 mm/h is rain, as before. */
  gate?: boolean;
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
        // E-RUC-15: one bar per image over [image, next image), cut at now and at the last image (no bar beyond the radar)
        const bars: RadarBar[] = [];
        for (let i = 0; i < frames.length - 1; i++) {
          const from = Math.max(frames[i].tMs, radarFrom), to = Math.min(frames[i + 1].tMs, radarTo);
          if (to > from) bars.push({ fromMs: from, toMs: to, mmH: Math.max(0, frames[i].mmH as number), frameMs: frames[i].tMs });
        }
        radar = {
          points, fromMs: radarFrom, toMs: radarTo, product: radarProductName(input.radarSource),
          frameStepMin: Math.round((lastMs - firstMs) / (frames.length - 1) / MIN), bars,
        };
      }
    }
  }

  // --- buscosun Fusion: hourly means after the radar (the first hour cut at the seam) ---
  const seamMs = radar ? radar.toMs : nowMs;
  const pByStart = new Map<number, number>();
  for (const e of input.fusionPWet ?? []) pByStart.set(e.tMs, e.p);
  // E-RUC-11: with the gate an hour below it (mean < 0,1 mm/h or P(wet) < 30 %) is a trace hour — no rain drawn, a hint instead.
  const gate = input.gate === true;
  const hours: HourBar[] = [];
  for (const h of [...input.fusionHours].sort((a, b) => a.tMs - b.tMs)) {
    const to = h.tMs, from = h.tMs - H;
    if (to <= seamMs || from >= endMs) continue;
    const pWet = pByStart.get(from) ?? null;
    const mmH = Math.max(0, h.mmH);
    hours.push({
      fromMs: Math.max(from, seamMs), toMs: Math.min(to, endMs), mmH,
      pWet, conf: h.conf,
      ...(gate ? { trace: !hourShowsRain(mmH, pWet) } : {}),
    });
  }

  // --- Phase RUC: the 5-min steps between the seam and the end of the fit; covered hours are flagged ---
  let ruc: RucLayer | null = null;
  const fit = input.ruc;
  if (fit && fit.points.length) {
    const points: RucStep[] = [];
    for (const p of fit.points) {
      if (p.toMs <= seamMs || p.fromMs >= endMs) continue;
      // the step's trace mark comes from the hour bar it lies in (one rule for both layers), else from the fit
      const bar = gate ? hours.find((b) => Math.floor(b.fromMs / H) === Math.floor(p.fromMs / H)) : undefined;
      const trace = gate ? (bar ? bar.trace === true : p.trace === true) : undefined;
      points.push({ fromMs: Math.max(p.fromMs, seamMs), toMs: Math.min(p.toMs, endMs), mmH: Math.max(0, p.mmH), kind: p.kind, ...(gate ? { trace } : {}) });
    }
    if (points.length) {
      ruc = { points, fromMs: points[0].fromMs, toMs: points[points.length - 1].toMs, label: `${RUC_LABEL} · 5-min-Form`, run: fit.run, ageMin: fit.ageMin, stats: fit.stats };
      for (const b of hours) b.rucCovered = fit.hours.some((h) => h.hourStartMs <= b.fromMs && h.hourEndMs >= b.toMs);
    }
  }

  let maxMmH = 0;
  let peak: MinuteSeries['peak'] = null;
  let sumMm = 0, sumTraceMm = 0;
  const useBars = input.bars === true;
  if (useBars) {
    for (const b of radar?.bars ?? []) {
      maxMmH = Math.max(maxMmH, b.mmH);
      sumMm += b.mmH * ((b.toMs - b.fromMs) / H);
      if (b.mmH >= WET_MMH && (!peak || b.mmH > peak.mmH)) peak = { tMs: b.fromMs, mmH: b.mmH, source: 'radar' };
    }
  } else {
    for (const p of radar?.points ?? []) {
      maxMmH = Math.max(maxMmH, p.mmH);
      sumMm += p.mmH / 60;
      if (p.mmH >= WET_MMH && (!peak || p.mmH > peak.mmH)) peak = { tMs: p.tMs, mmH: p.mmH, source: 'radar' };
    }
  }
  for (const s of ruc?.points ?? []) {
    const mm = s.mmH * ((s.toMs - s.fromMs) / H);
    if (s.trace) { sumTraceMm += mm; continue; }
    maxMmH = Math.max(maxMmH, s.mmH);
    sumMm += mm;
    if (s.mmH >= WET_MMH && (!peak || s.mmH > peak.mmH)) peak = { tMs: s.fromMs, mmH: s.mmH, source: 'ruc' };
  }
  for (const b of hours) {
    if (b.rucCovered) continue;
    const mm = b.mmH * ((b.toMs - b.fromMs) / H);
    if (b.trace) { sumTraceMm += mm; continue; }
    maxMmH = Math.max(maxMmH, b.mmH);
    sumMm += mm;
    if (b.mmH >= WET_MMH && (!peak || b.mmH > peak.mmH)) peak = { tMs: b.fromMs, mmH: b.mmH, source: 'fusion' };
  }

  let firstWet: MinuteSeries['firstWet'] = null;
  const wetMinute = useBars ? radar?.bars.find((b) => b.mmH >= WET_MMH) : radar?.points.find((p) => p.mmH >= WET_MMH);
  if (wetMinute) firstWet = { tMs: 'fromMs' in wetMinute ? wetMinute.fromMs : wetMinute.tMs, source: 'radar' };
  else {
    const wetStep = ruc?.points.find((s) => !s.trace && s.mmH >= WET_MMH);
    if (wetStep) {
      // A flat hour (RUC dry, Fusion wet) knows no minute: the hour it is.
      firstWet = wetStep.kind === 'flat' ? { tMs: Math.max(Math.floor(wetStep.fromMs / H) * H, seamMs), source: 'fusion' } : { tMs: wetStep.fromMs, source: 'ruc' };
    } else {
      const wetHour = hours.find((b) => !b.rucCovered && !b.trace && b.mmH >= WET_MMH);
      if (wetHour) firstWet = { tMs: wetHour.fromMs, source: 'fusion' };
    }
  }

  // E-RUC-11: consecutive trace hours WITH an expected amount become one hint span ("16 % · 0,05 mm"); dry hours stay silent.
  const hints: TraceHint[] = [];
  if (gate) {
    for (const b of hours) {
      if (!b.trace || b.mmH <= 0) continue;
      const mm = b.mmH * ((b.toMs - b.fromMs) / H);
      const last = hints[hints.length - 1];
      if (last && last.toMs === b.fromMs) { last.toMs = b.toMs; last.mm += mm; last.pMax = b.pWet == null ? last.pMax : Math.max(last.pMax ?? 0, b.pWet); }
      else hints.push({ fromMs: b.fromMs, toMs: b.toMs, pMax: b.pWet, mm });
    }
    for (const x of hints) x.mm = Math.round(x.mm * 100) / 100;
  }

  return {
    nowMs, endMs, radar, hours, ruc, maxMmH, firstWet, peak,
    sumMm: Math.round(sumMm * 10) / 10, sumTraceMm: Math.round(sumTraceMm * 10) / 10, hints, fusionLabel: input.fusionLabel,
  };
}

/** Value at a time: the radar minute, the RUC step or the hour bar (`null` = no source covers the time). */
export function valueAt(series: MinuteSeries, tMs: number): { mmH: number; source: MinuteSource; bar: HourBar | null; point: MinutePoint | null; step?: RucStep | null } | null {
  if (series.radar && tMs >= series.radar.fromMs && tMs <= series.radar.toMs) {
    const i = Math.max(0, Math.min(series.radar.points.length - 1, Math.round((tMs - series.radar.fromMs) / MIN)));
    const p = series.radar.points[i];
    return { mmH: p.mmH, source: 'radar', bar: null, point: p };
  }
  if (series.ruc && tMs >= series.ruc.fromMs && tMs < series.ruc.toMs) {
    const step = series.ruc.points.find((s) => tMs >= s.fromMs && tMs < s.toMs) ?? null;
    if (step) {
      const bar = series.hours.find((b) => tMs >= b.fromMs && tMs < b.toMs) ?? null;
      return { mmH: step.mmH, source: 'ruc', bar, point: null, step };
    }
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
  const stepMin = rangeH <= 2 ? 15 : rangeH <= 6 ? 60 : rangeH <= 30 ? 180 : 360;
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
