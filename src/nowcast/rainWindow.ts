/**
 * Regenbeginn als Spanne — Phase RB (`audit/regenbeginn-spanne.md`).
 *
 * Pure: from the radar minute at the point and the hourly rain probability of buscosun Fusion, derive ONE statement for
 * the place — when rain starts (or, if it rains, when it stops), as a window instead of a minute, with the probability
 * of the statement and its source. No DOM, no network, no imports: the verifier (`scripts/verify-rain-window.mjs`) runs
 * it headless.
 *
 * Rules (Jan 09.10.2026, E-RB-1…6):
 *  - 0…radar horizon (DE RADOLAN-RV, AT INCA): centre = the minute of the radar extrapolation (the one the hero names);
 *    window = the speed uncertainty of the flow-ensemble design applied to it — the middle half of its speed members
 *    (×0,85…×1,15) ⇒ t/1,15 … t/0,85 (E-RB-5/6; the flow ensemble itself does not carry, V-RB-4). Direction uncertainty
 *    is not covered (named). Probability = P(wet) of buscosun Fusion in the hour of the window (Fusion 8 carries the
 *    radar hour mean as a member). CH: rzc is one analysis without nowcast ⇒ radar only tells "wet now".
 *  - beyond the radar: buscosun Fusion, P(≥ 0,1 mm/h) per hour up to +24 h, thresholds SET (edge 30 %, core 50 %,
 *    "dry" < 20 %, E-RB-4), full hours only.
 *  - wide or unsure windows say so in words ("Beginn unsicher, zwischen 14 und 15 Uhr").
 */

export const RB_HORIZON_H = 24;
/** Fusion thresholds (set, E-RB-4 — measurable at the archive, V-RB-3). */
export const RB_P_CORE = 0.5;
export const RB_P_EDGE = 0.3;
export const RB_P_DRY = 0.2;
/** Radar: middle half of the speed members of the flow-ensemble design (0,7 / 0,85 / 1,0 / 1,15 / 1,3; set). */
export const RB_SPEED_LO = 0.85;
export const RB_SPEED_HI = 1.15;
/** Width above which a window is called unsure (set). */
export const RB_WIDE_RADAR_MIN = 45;
export const RB_WIDE_FUSION_H = 3;

const MIN = 60_000;
const H = 3_600_000;

/** `?rb=1` switches the display on; anything else keeps the Regenradar exactly as before (rule 2). */
export function rainWindowEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('rb') === '1'; } catch { return false; }
}

/** Radar at the point. Minutes are leads from `nowMs`; `null` = no onset/end within `horizonMin`. */
export interface RadarTimes {
  /** `extrapolation` = a nowcast with frames (RV, INCA); `analysis` = one image without nowcast (rzc). */
  kind: 'extrapolation' | 'analysis';
  product: 'RADOLAN-RV' | 'INCA' | 'rzc';
  horizonMin: number;
  wetNow: boolean;
  onsetMin: number | null;
  endMin: number | null;
}

export interface FusionHour { tMs: number; p: number }

export interface RainWindowInput {
  nowMs: number;
  radar: RadarTimes | null;
  /** P(rain ≥ 0,1 mm/h) per hour from buscosun Fusion; `null` = not available (live fallback, error). */
  fusion: FusionHour[] | null;
  horizonH?: number;
}

export type RainWindowKind = 'onset' | 'end' | 'dry' | 'wet' | 'none';

export interface RainWindow {
  kind: RainWindowKind;
  source: 'radar' | 'fusion';
  /** For `onset`/`end`: the window. For `dry`: now…dry-until. For `wet`: now…wet-until. */
  fromMs: number;
  toMs: number;
  /** Probability of the stated event, 0…1; `null` = not determinable. */
  prob: number | null;
  /** What `prob` means — tooltip text. */
  probNote: string;
  precision: 'min' | 'hour';
  uncertain: boolean;
  /** The big sentence. */
  sentence: string;
  /** Short label for the map marker. */
  label: string;
  /** Source chip text ("Radar · RADOLAN-RV" / "buscosun Fusion"). */
  sourceLabel: string;
  /** Time axis of the strip. */
  axisFromMs: number;
  axisToMs: number;
  /** Provenance notes (set values named). */
  notes: string[];
}

// ---------------------------------------------------------------------------
// formatting (Europe/Berlin — DACH is one zone; deterministic in the verifier)
// ---------------------------------------------------------------------------

const TZ = 'Europe/Berlin';
const FMT = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23' });
function parts(ms: number): { y: number; m: number; d: number; hh: number; mm: number; wd: string } {
  const o: Record<string, string> = {};
  for (const p of FMT.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, wd: o.weekday };
}
const dayKey = (ms: number) => { const p = parts(ms); return p.y * 10000 + p.m * 100 + p.d; };
export function clock(ms: number): string { const p = parts(ms); return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`; }
function hourNum(ms: number): number { return parts(ms).hh; }
/** "heute" / "morgen" / weekday — relative to `nowMs`. */
export function dayWord(ms: number, nowMs: number): string {
  const b = dayKey(ms);
  if (dayKey(nowMs) === b) return 'heute';
  if (dayKey(nowMs + 24 * H) === b) return 'morgen';
  return parts(ms).wd;
}
/** "17–19 Uhr"; with the day word unless today (or always with `withToday`). */
function hourSpan(fromMs: number, toMs: number, nowMs: number, withToday = false): string {
  const dw = dayWord(fromMs, nowMs);
  const pre = dw === 'heute' && !withToday ? '' : `${dw} `;
  return `${pre}${hourNum(fromMs)}–${endHour(fromMs, toMs)} Uhr`;
}
/** End hour of a span: midnight after a later start reads "24", not "0" ("23–24 Uhr"). */
function endHour(fromMs: number, toMs: number): number {
  const h = hourNum(toMs);
  return h === 0 && toMs > fromMs ? 24 : h;
}
function hourAt(ms: number, nowMs: number): string {
  const dw = dayWord(ms, nowMs);
  return `${dw === 'heute' ? '' : `${dw} `}${hourNum(ms)} Uhr`;
}
const pct = (p: number) => `${Math.round(p * 100)} %`;

export function probWord(p: number | null, kind: RainWindowKind): string {
  if (p == null) return kind === 'dry' ? 'trocken' : 'Radar';
  if (p >= 0.8) return 'sehr wahrscheinlich';
  if (p >= 0.5) return 'wahrscheinlich';
  if (p >= 0.3) return 'möglich';
  return 'unwahrscheinlich';
}

const floor5 = (min: number) => Math.floor(min / 5) * 5;
const ceil5 = (min: number) => Math.ceil(min / 5) * 5;
const floorH = (ms: number) => Math.floor(ms / H) * H;
const ceilH = (ms: number) => Math.ceil(ms / H) * H;

/** Quantile (type 7) of a list of numbers; NaN for an empty list. */
export function quantile(xs: readonly number[], q: number): number {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

// ---------------------------------------------------------------------------
// radar part
// ---------------------------------------------------------------------------

/** Window around the radar minute `t` from the speed uncertainty: t/1,15 … t/0,85, on 5 min, at least 5 min wide. */
export function radarSpeedWindow(t: number, horizonMin: number): { fromMin: number; toMin: number } {
  const lo = floor5(t / RB_SPEED_HI);
  const hi = Math.max(lo + 5, ceil5(t / RB_SPEED_LO));
  return { fromMin: Math.max(0, lo), toMin: Math.min(Math.max(horizonMin, t), hi) };
}

/** P(wet) of buscosun Fusion for the hour that holds `ms` (the step at or before it); `null` without a step. */
function pAt(hours: FusionHour[], ms: number): number | null {
  let best: FusionHour | null = null;
  for (const h of hours) if (h.tMs <= ms && (!best || h.tMs > best.tMs)) best = h;
  if (!best || ms - best.tMs > H) return null;
  return best.p;
}
/** Highest P(wet) over the hours a window touches. */
function pMaxOver(hours: FusionHour[], fromMs: number, toMs: number): number | null {
  let p: number | null = null;
  for (const h of hours) if (h.tMs + H > fromMs && h.tMs < toMs) p = Math.max(p ?? 0, h.p);
  return p ?? pAt(hours, fromMs);
}

// ---------------------------------------------------------------------------
// fusion part
// ---------------------------------------------------------------------------

/** First block of hours with p ≥ core; window = first edge hour before it … core hour + 1 h. */
function fusionOnset(hours: FusionHour[]): { fromMs: number; toMs: number; prob: number; core: boolean } | null {
  const iCore = hours.findIndex((h) => h.p >= RB_P_CORE);
  if (iCore >= 0) {
    let i0 = iCore;
    while (i0 > 0 && hours[i0 - 1].p >= RB_P_EDGE) i0--;
    let pmax = 0;
    for (let i = i0; i < hours.length && hours[i].p >= RB_P_EDGE; i++) pmax = Math.max(pmax, hours[i].p);
    return { fromMs: hours[i0].tMs, toMs: hours[iCore].tMs + H, prob: pmax, core: true };
  }
  const iEdge = hours.findIndex((h) => h.p >= RB_P_EDGE);
  if (iEdge >= 0) {
    let i1 = iEdge, pmax = hours[iEdge].p;
    while (i1 + 1 < hours.length && hours[i1 + 1].p >= RB_P_EDGE) { i1++; pmax = Math.max(pmax, hours[i1].p); }
    return { fromMs: hours[iEdge].tMs, toMs: hours[i1].tMs + H, prob: pmax, core: false };
  }
  return null;
}

/** It rains now: end window = first hour with p < core … first hour with p < edge, + 1 h. */
function fusionEnd(hours: FusionHour[]): { fromMs: number; toMs: number; prob: number } | null {
  const iA = hours.findIndex((h) => h.p < RB_P_CORE);
  if (iA < 0) return null;
  let iB = iA;
  while (iB < hours.length && hours[iB].p >= RB_P_EDGE) iB++;
  if (iB >= hours.length) iB = hours.length - 1;
  return { fromMs: hours[iA].tMs, toMs: hours[iB].tMs + H, prob: 1 - hours[iB].p };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export function computeRainWindow(inp: RainWindowInput): RainWindow {
  const { nowMs, radar } = inp;
  const horizonH = inp.horizonH ?? RB_HORIZON_H;
  const horizonEnd = nowMs + horizonH * H;
  const radarH = radar && radar.kind === 'extrapolation' ? radar.horizonMin : 0;
  const radarEnd = nowMs + radarH * MIN;
  const radarAxis = { axisFromMs: nowMs, axisToMs: nowMs + Math.max(120, radarH) * MIN };
  const fusionAxis = { axisFromMs: nowMs, axisToMs: horizonEnd };
  const notes: string[] = [];
  const radarSrc = radar ? `Radar · ${radar.product}` : 'Radar';
  const fusionSrc = 'buscosun Fusion';
  const fusionAll = (inp.fusion ?? []).filter((h) => Number.isFinite(h.p) && h.tMs <= horizonEnd).sort((a, b) => a.tMs - b.tMs);
  // Fusion hours after the radar horizon (or from the running hour without radar nowcast).
  const fusionAfter = fusionAll.filter((h) => h.tMs >= (radarH > 0 ? radarEnd : floorH(nowMs)));
  const wetNow = radar ? radar.wetNow : (pAt(fusionAll, nowMs) ?? 0) >= RB_P_CORE;
  if (radar?.kind === 'extrapolation') notes.push(`Radar: Minute der ${radar.product}-Extrapolation, Spanne aus der Tempo-Unsicherheit ×${String(RB_SPEED_LO).replace('.', ',')}…×${String(RB_SPEED_HI).replace('.', ',')} (gesetzt, mittlere Hälfte der Tempo-Member des Ensemble-Designs); Richtungsunsicherheit nicht erfasst`);
  if (radar?.kind === 'analysis') notes.push('Radar: MeteoSchweiz rzc ist ein Analysebild ohne Nowcast — Beginn/Ende kommen aus buscosun Fusion');
  if (inp.fusion) notes.push(`buscosun Fusion: P(≥ 0,1 mm/h) je Stunde; Schwellen Rand ${pct(RB_P_EDGE)} / Kern ${pct(RB_P_CORE)} / trocken < ${pct(RB_P_DRY)} gesetzt`);
  const minMs = (m: number) => nowMs + m * MIN;
  const radarProbNote = inp.fusion
    ? 'Regenwahrscheinlichkeit von buscosun Fusion in der Stunde des Fensters (enthält das Radar-Stundenmittel als Member)'
    : 'ohne buscosun Fusion keine Wahrscheinlichkeit';

  if (!wetNow) {
    // ---- onset: radar first
    if (radar?.kind === 'extrapolation' && radar.onsetMin != null) {
      const r = radarSpeedWindow(radar.onsetMin, radarH);
      const fromMs = minMs(r.fromMin), toMs = minMs(r.toMin);
      const prob = inp.fusion ? pMaxOver(fusionAll, fromMs, toMs) : null;
      const wide = r.toMin - r.fromMin > RB_WIDE_RADAR_MIN || (prob != null && prob < 0.5);
      const span = `${clock(fromMs)}–${clock(toMs)}`;
      return {
        kind: 'onset', source: 'radar', fromMs, toMs, prob, probNote: radarProbNote, precision: 'min', uncertain: wide,
        sentence: wide ? `Beginn unsicher, zwischen ${hourNum(floorH(fromMs))} und ${endHour(fromMs, ceilH(toMs))} Uhr` : `Regen ab ${span}`,
        label: wide ? `Regen ~${hourNum(floorH(fromMs))}–${endHour(fromMs, ceilH(toMs))} Uhr` : `Regen ${span}`,
        sourceLabel: radarSrc, ...radarAxis, notes,
      };
    }
    // ---- onset: buscosun Fusion beyond the radar
    if (!inp.fusion) {
      if (radar?.kind === 'extrapolation') {
        return { kind: 'dry', source: 'radar', fromMs: nowMs, toMs: radarEnd, prob: null, probNote: radarProbNote, precision: 'min', uncertain: false,
          sentence: `Kein Regen bis ${clock(radarEnd)}`, label: `trocken bis ${clock(radarEnd)}`, sourceLabel: radarSrc, ...radarAxis, notes };
      }
      return none(nowMs, notes);
    }
    const f = fusionOnset(fusionAfter);
    if (f) {
      const wide = (f.toMs - f.fromMs) / H > RB_WIDE_FUSION_H;
      const sentence = !f.core
        ? `Regen möglich ab ${hourAt(f.fromMs, nowMs)}`
        : wide
          ? `Beginn unsicher, zwischen ${hourAt(f.fromMs, nowMs)} und ${endHour(f.fromMs, f.toMs)} Uhr`
          : `Regen wahrscheinlich ${hourSpan(f.fromMs, f.toMs, nowMs, true)}`;
      return {
        kind: 'onset', source: 'fusion', fromMs: f.fromMs, toMs: f.toMs, prob: f.prob,
        probNote: 'höchste stündliche Regenwahrscheinlichkeit von buscosun Fusion im Fenster',
        precision: 'hour', uncertain: wide || !f.core, sentence,
        label: `Regen ${f.core ? '' : 'mögl. '}${hourSpan(f.fromMs, f.toMs, nowMs)}`,
        sourceLabel: fusionSrc, ...fusionAxis, notes,
      };
    }
    // dry until the first hour that reaches the dry threshold, else the end of the series
    const firstMaybe = fusionAfter.find((h) => h.p >= RB_P_DRY);
    const until = firstMaybe ? firstMaybe.tMs : (fusionAfter.length ? Math.min(horizonEnd, fusionAfter[fusionAfter.length - 1].tMs + H) : radarEnd);
    const pmax = Math.max(0, ...fusionAll.filter((h) => h.tMs + H > nowMs && h.tMs < until).map((h) => h.p));
    return {
      kind: 'dry', source: fusionAfter.length ? 'fusion' : 'radar', fromMs: nowMs, toMs: until, prob: 1 - pmax,
      probNote: 'Gegenwahrscheinlichkeit der höchsten stündlichen Regenwahrscheinlichkeit von buscosun Fusion bis dahin', precision: 'hour', uncertain: false,
      sentence: `Kein Regen bis ${hourAt(until, nowMs)}`, label: `trocken bis ${hourAt(until, nowMs)}`,
      sourceLabel: fusionAfter.length ? fusionSrc : radarSrc, ...((until - nowMs) <= 2 * H ? radarAxis : fusionAxis), notes,
    };
  }

  // ---- it rains now: end
  if (radar?.kind === 'extrapolation' && radar.endMin != null) {
    const r = radarSpeedWindow(radar.endMin, radarH);
    const fromMs = minMs(r.fromMin), toMs = minMs(r.toMin);
    const pAfter = inp.fusion ? pAt(fusionAll, toMs) : null;
    const prob = pAfter == null ? null : 1 - pAfter;
    const wide = r.toMin - r.fromMin > RB_WIDE_RADAR_MIN || (prob != null && prob < 0.5);
    const span = `${clock(fromMs)}–${clock(toMs)}`;
    return {
      kind: 'end', source: 'radar', fromMs, toMs, prob,
      probNote: inp.fusion ? 'Gegenwahrscheinlichkeit der Regenwahrscheinlichkeit von buscosun Fusion am Fensterende' : radarProbNote,
      precision: 'min', uncertain: wide,
      sentence: wide ? `Ende unsicher, zwischen ${hourNum(floorH(fromMs))} und ${endHour(fromMs, ceilH(toMs))} Uhr` : `Regen hört auf ${span}`,
      label: wide ? `Ende ~${hourNum(floorH(fromMs))}–${endHour(fromMs, ceilH(toMs))} Uhr` : `Ende ${span}`,
      sourceLabel: radarSrc, ...radarAxis, notes,
    };
  }
  if (inp.fusion && fusionAfter.length) {
    const f = fusionEnd(fusionAfter);
    if (f) {
      const wide = (f.toMs - f.fromMs) / H > RB_WIDE_FUSION_H;
      return {
        kind: 'end', source: 'fusion', fromMs: f.fromMs, toMs: f.toMs, prob: f.prob,
        probNote: 'Gegenwahrscheinlichkeit der stündlichen Regenwahrscheinlichkeit von buscosun Fusion am Fensterende',
        precision: 'hour', uncertain: wide,
        sentence: wide ? `Ende unsicher, zwischen ${hourAt(f.fromMs, nowMs)} und ${endHour(f.fromMs, f.toMs)} Uhr` : `Regen hört voraussichtlich ${hourSpan(f.fromMs, f.toMs, nowMs, true)} auf`,
        label: `Ende ${hourSpan(f.fromMs, f.toMs, nowMs)}`, sourceLabel: fusionSrc, ...fusionAxis, notes,
      };
    }
    const until = Math.min(horizonEnd, fusionAfter[fusionAfter.length - 1].tMs + H);
    return {
      kind: 'wet', source: 'fusion', fromMs: nowMs, toMs: until, prob: Math.min(...fusionAfter.map((h) => h.p)),
      probNote: 'niedrigste stündliche Regenwahrscheinlichkeit von buscosun Fusion bis dahin', precision: 'hour', uncertain: false,
      sentence: `Regen hält an bis mindestens ${hourAt(until, nowMs)}`, label: `Regen bis ≥ ${hourAt(until, nowMs)}`,
      sourceLabel: fusionSrc, ...fusionAxis, notes,
    };
  }
  if (radar?.kind === 'extrapolation') {
    return { kind: 'wet', source: 'radar', fromMs: nowMs, toMs: radarEnd, prob: null, probNote: 'kein Ende im Radar-Horizont', precision: 'min', uncertain: false,
      sentence: `Regen hält an bis mindestens ${clock(radarEnd)}`, label: `Regen bis ≥ ${clock(radarEnd)}`, sourceLabel: radarSrc, ...radarAxis, notes };
  }
  return none(nowMs, notes);
}

function none(nowMs: number, notes: string[]): RainWindow {
  return { kind: 'none', source: 'fusion', fromMs: nowMs, toMs: nowMs, prob: null, probNote: '', precision: 'hour', uncertain: true,
    sentence: 'Kein Zeitfenster bestimmbar', label: '', sourceLabel: '—', axisFromMs: nowMs, axisToMs: nowMs + 2 * H, notes };
}

/**
 * Band shape on the strip as fractions of the axis. The window holds the middle half, so the band fades out over a
 * third of its width beyond each edge (set, only visual).
 */
export function bandGeometry(w: RainWindow): { x0: number; peak: number; x1: number; core0: number; core1: number } | null {
  if (w.kind !== 'onset' && w.kind !== 'end') return null;
  const span = Math.max(1, w.axisToMs - w.axisFromMs);
  const f = (ms: number) => Math.max(0, Math.min(1, (ms - w.axisFromMs) / span));
  const pad = (w.toMs - w.fromMs) / 3;
  return { x0: f(w.fromMs - pad), core0: f(w.fromMs), peak: f((w.fromMs + w.toMs) / 2), core1: f(w.toMs), x1: f(w.toMs + pad) };
}
