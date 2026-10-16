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
import { intensityBand, intensityLabel, WET_MMH, STARKREGEN_MMH, SKILL_HORIZON_MIN, NOWCAST_HORIZON_MIN, type Nowcast, type EventTone, type StepPhase } from './nowcastModel';

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

const pct = (p: number) => `${Math.round(p * 100)} %`;
const d1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

export function buildEventDetail(nc: Nowcast, nowMs: number = Date.now()): EventDetail {
  const fusionLabel = nc.nwpSource === 'cube' ? 'buscosun Fusion' : 'ICON-D2';
  const series = buildMinuteSeries({
    nowMs, radarFrames: nc.radarFrames ?? [], radarSource: nc.radarSource,
    fusionHours: nc.fusionHours ?? [], fusionPWet: nc.fusionPWet ?? null, fusionLabel,
  });
  const items: EventItem[] = [];

  // --- 0–6 h: the engine's events, tagged with the step's source ---
  let sharpened = false;
  for (const e of nc.events) {
    const step = nc.steps.find((s) => s.minutes === e.atMinutes) ?? nc.steps[0];
    const src: EventSource = e.kind === 'beyond-skill' ? 'none' : step.source === 'nwp' ? 'fusion' : step.source;
    let tMs = nc.nowMs + e.atMinutes * MIN;
    let precision: EventItem['precision'] = 'step';
    let detail = e.detail;
    if (e.kind === 'beyond-skill') {
      // The seam, not an event: the list says where the minutes end.
      tMs = series.radar ? series.radar.toMs : nc.nowMs + SKILL_HORIZON_MIN * MIN;
      detail = series.radar ? `bis hier Radar-Minuten (${series.radar.product}), danach ${fusionLabel} als Stundenmittel` : `${fusionLabel} als Stundenmittel`;
    } else if (e.kind === 'rain-start' && !sharpened && src === 'radar' && series.firstWet?.source === 'radar') {
      tMs = series.firstWet.tMs; precision = 'min'; sharpened = true;
      detail = `${detail} · minutengenau aus dem Radar`;
    } else if (src === 'fusion' && e.kind !== 'rain-start') {
      precision = 'step';
    }
    items.push({
      id: `e-${e.kind}-${e.atMinutes}`, tMs, title: e.kind === 'beyond-skill' ? 'Ende der Radar-Minuten' : e.title, detail,
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
    const wet = phase !== 'dry';
    if (wet) wetHoursBeyond++;
    if (wet && !run) {
      const likely = p == null ? true : p >= 0.5;
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
