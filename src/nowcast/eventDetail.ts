/**
 * Ereignisse (ED) — pure model of the event list at the place over 48 h.
 *
 * Sources, kept apart and named per item:
 *  - 0–6 h: the engine's events (`nowcast.events`), each tagged with the source of the step it sits on (radar / radar→Fusion
 *    blend / buscosun Fusion); the first radar rain start is sharpened to the radar minute (`minuteSeries`).
 *  - 6–48 h: buscosun Fusion hourly means (`nowcast.fusionHours`) with P(wet) per hour (`fusionPWet`): rain runs (start/end),
 *    heavy hours, the phase per hour (rain / sleet / snow / freezing from the hour's temperature and snow line) and
 *    phase changes inside a run. Hours only — no minute is invented beyond the radar.
 * No DOM, no network.
 */
import { classifyPrecipitation } from '../pointForecast/precipType';
import { buildMinuteSeries, type MinuteSeries } from './minuteSeries';
import { RB_P_EDGE, RB_P_CORE } from './rainWindow';
import { intensityBand, intensityLabel, WET_MMH, STARKREGEN_MMH, NOWCAST_HORIZON_MIN, type Nowcast, type EventTone, type StepPhase } from './nowcastModel';

const H = 3_600_000;
const MIN = 60_000;
export const ED_HORIZON_H = 48;

export type EventSource = 'radar' | 'blend' | 'fusion' | 'none';

export interface EventItem {
  id: string;
  tMs: number;
  title: string;
  detail: string;
  tone: EventTone;
  source: EventSource;
  sourceLabel: string;
  /** `min` = a radar minute, `hour` = a Fusion hour (start of the hour), `step` = a 15-min engine step. */
  precision: 'min' | 'step' | 'hour';
  kind: string;
}

export interface EventDetail {
  nowMs: number;
  items: EventItem[];
  series: MinuteSeries;
  /** No wet hour at all in the 48 h. */
  allDry: boolean;
  /** Hours (of 48) with precipitation ≥ 0,1 mm/h in buscosun Fusion beyond the engine window. */
  wetHoursBeyond: number;
  fusionLabel: string;
}

export function sourceLabelOf(s: EventSource, fusionLabel: string): string {
  return s === 'radar' ? 'Radar' : s === 'blend' ? `Radar → ${fusionLabel}` : s === 'fusion' ? fusionLabel : '';
}

const PHASE_WORD: Record<StepPhase, string> = { dry: 'trocken', rain: 'Regen', snow: 'Schnee', sleet: 'Schneeregen', freezing: 'gefrierender Regen' };

function phaseOfHour(h: { mmH: number; tempC?: number | null; snowLineM?: number | null }, elevationM: number | null): StepPhase {
  if (h.mmH < WET_MMH) return 'dry';
  const t = classifyPrecipitation(h.tempC ?? null, h.mmH, { snowLineM: h.snowLineM ?? null, sampleElevM: elevationM });
  if (t === 'none') return 'dry';
  if ((t === 'rain' || t === 'sleet') && h.tempC != null && h.tempC <= 0.7) return 'freezing';
  return t;
}

const pct = (p: number) => `${Math.round(p * 100)}\u00A0%`;
const d1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

export function buildEventDetail(nc: Nowcast, nowMs: number = Date.now()): EventDetail {
  const fusionLabel = nc.nwpSource === 'cube' ? 'buscosun Fusion' : 'ICON-D2';
  const series = buildMinuteSeries({
    nowMs, radarFrames: nc.radarFrames ?? [], radarSource: nc.radarSource,
    fusionHours: nc.fusionHours ?? [], fusionPWet: nc.fusionPWet ?? null, fusionLabel,
  });
  const items: EventItem[] = [];

  // --- 0–6 h: the engine's events, tagged with the step's source ---
  if (nc.currentlyRaining) {
    const s0 = nc.steps[0];
    const src0: EventSource = s0.source === 'nwp' ? 'fusion' : s0.source;
    items.push({
      id: 'e-now', tMs: nc.nowMs, title: `${PHASE_WORD[s0.phase === 'dry' ? 'rain' : s0.phase]} jetzt`,
      detail: `${intensityLabel(intensityBand(s0.mmH))} · ~${d1(s0.mmH)} mm/h${s0.character ? ` · ${s0.character === 'showery' ? 'Schauer' : 'Dauerregen'}` : ''}`,
      tone: s0.phase === 'freezing' ? 'alert' : 'info', source: src0, sourceLabel: sourceLabelOf(src0, fusionLabel), precision: 'step', kind: 'now',
    });
  }
  let sharpened = false;
  for (const e of nc.events) {
    // Rain that runs through the whole engine window has no end in it (the engine's dry window would be negative).
    if (e.kind === 'rain-end' && e.atMinutes >= NOWCAST_HORIZON_MIN) continue;
    const step = nc.steps.find((s) => s.minutes === e.atMinutes) ?? nc.steps[0];
    const src: EventSource = step.source === 'nwp' ? 'fusion' : step.source;
    let tMs = nc.nowMs + e.atMinutes * MIN;
    let precision: EventItem['precision'] = 'step';
    let detail = e.detail;
    // The seam (`beyond-skill`) is not weather: the list carries only precipitation events (Jan 16.10.).
    if (e.kind === 'beyond-skill') continue;
    if (e.kind === 'rain-start' && !sharpened && src === 'radar' && series.firstWet?.source === 'radar') {
      tMs = series.firstWet.tMs; precision = 'min'; sharpened = true;
      detail = `${detail} · minutengenau aus dem Radar`;
    } else if (src === 'fusion' && e.kind !== 'rain-start') {
      precision = 'step';
    }
    items.push({
      id: `e-${e.kind}-${e.atMinutes}`, tMs, title: e.title, detail,
      tone: e.tone, source: src, sourceLabel: sourceLabelOf(src, fusionLabel), precision, kind: e.kind,
    });
  }

  // --- 6–48 h: buscosun Fusion hours ---
  const beyondFrom = nc.nowMs + NOWCAST_HORIZON_MIN * MIN;
  const endMs = nowMs + ED_HORIZON_H * H;
  const pBy = new Map<number, number>();
  for (const p of nc.fusionPWet ?? []) pBy.set(p.tMs, p.p);
  const hours = [...(nc.fusionHours ?? [])].filter((h) => h.tMs - H >= beyondFrom && h.tMs - H < endMs).sort((a, b) => a.tMs - b.tMs);
  let wetHoursBeyond = 0;
  // Rain at the engine's last step continues into the first Fusion hour: no second "start" at the seam.
  let continuing = (nc.steps[nc.steps.length - 1]?.mmH ?? 0) >= WET_MMH;
  // Start of that run inside the engine window (for "endet nach n h" of a continued run).
  let runStartMs = beyondFrom;
  for (let i = nc.steps.length - 1; i >= 0 && nc.steps[i].mmH >= WET_MMH; i--) runStartMs = nc.nowMs + nc.steps[i].minutes * MIN;
  let run: { fromMs: number; toMs: number; peak: number; peakMs: number; phase: StepPhase; pMax: number } | null = null;
  const closeRun = () => {
    if (!run) return;
    const lenH = Math.round((run.toMs - run.fromMs) / H);
    if (run.toMs < endMs) {
      items.push({
        id: `f-end-${run.toMs}`, tMs: run.toMs, title: `${PHASE_WORD[run.phase]} endet`, detail: `nach ${lenH} h · Spitze ~${d1(run.peak)} mm/h`,
        tone: 'good', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-end',
      });
    }
    run = null;
  };
  for (const h of hours) {
    const from = h.tMs - H;
    const phase = phaseOfHour(h, nc.elevationM);
    const p = pBy.get(from) ?? null;
    // Wet = rate ≥ 0,1 mm/h AND P(wet) at least the edge threshold of the rain window (30 %, E-RB-4) — below that the hour is noise.
    const wet = phase !== 'dry' && (p == null || p >= RB_P_EDGE);
    if (wet) wetHoursBeyond++;
    if (wet && !run && continuing) {
      run = { fromMs: runStartMs, toMs: h.tMs, peak: h.mmH, peakMs: from, phase, pMax: p ?? 0 };
    } else if (wet && !run) {
      const likely = p == null ? true : p >= RB_P_CORE;
      run = { fromMs: from, toMs: h.tMs, peak: h.mmH, peakMs: from, phase, pMax: p ?? 0 };
      items.push({
        id: `f-start-${from}`, tMs: from, title: `${PHASE_WORD[phase]} ${likely ? 'wahrscheinlich' : 'möglich'}`,
        detail: `${intensityLabel(intensityBand(h.mmH))} · ~${d1(h.mmH)} mm/h${p != null ? ` · Regenchance ${pct(p)}` : ''}`,
        tone: phase === 'freezing' ? 'alert' : likely ? 'info' : 'muted', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-start',
      });
    } else if (wet && run) {
      if (phase !== run.phase) {
        items.push({
          id: `f-phase-${from}`, tMs: from, title: `Übergang in ${PHASE_WORD[phase]}`, detail: `vorher ${PHASE_WORD[run.phase]}${h.tempC != null ? ` · ${d1(h.tempC)} °C` : ''}`,
          tone: phase === 'freezing' ? 'alert' : phase === 'snow' ? 'warn' : 'info', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-phase',
        });
        run.phase = phase;
      }
      run.toMs = h.tMs;
      if (h.mmH > run.peak) { run.peak = h.mmH; run.peakMs = from; }
      if (p != null) run.pMax = Math.max(run.pMax, p);
    } else if (!wet && run) {
      closeRun();
    }
    continuing = false;
    if (h.mmH >= STARKREGEN_MMH) {
      items.push({
        id: `f-heavy-${from}`, tMs: from, title: 'Starkregen-Stunde', detail: `~${d1(h.mmH)} mm/h im Stundenmittel${p != null ? ` · Regenchance ${pct(p)}` : ''}`,
        tone: 'alert', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-heavy',
      });
    }
  }
  closeRun();

  items.sort((a, b) => a.tMs - b.tMs);
  const allDry = !nc.steps.some((s) => s.mmH >= WET_MMH) && wetHoursBeyond === 0;
  return { nowMs, items, series, allDry, wetHoursBeyond, fusionLabel };
}
