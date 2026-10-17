/**
 * Ereignisse (ED) — pure model of the event list at the place over 48 h.
 *
 * Sources, kept apart and named per item:
 *  - 0–6 h: the engine's events (`nowcast.events`), each tagged with the source of the step it sits on (radar / radar→Fusion
 *    blend / buscosun Fusion); the first radar rain start is sharpened to the radar minute (`minuteSeries`).
 *  - 6–48 h: buscosun Fusion hourly means (`nowcast.fusionHours`) with P(wet) per hour (`fusionPWet`): rain runs (start/end),
 *    heavy hours, the phase per hour (rain / sleet / snow / freezing from the hour's temperature and snow line) and
 *    phase changes inside a run. Hours only — no minute is invented beyond the radar.
 *  - Wording (Jan 17.10.): the precipitation word comes from rate, phase and character ("leichtes Nieseln", "starker
 *    Schauer", "kräftiger Schneefall", "gefrierender Regen"); every item names the wind of its hour (direction, mean,
 *    gust) from buscosun Fusion and, for runs, duration and peak. Thresholds are set (DWD-near, `nowcastModel`).
 * No DOM, no network.
 */
import { classifyPrecipitation } from '../pointForecast/precipType';
import { buildMinuteSeries, type MinuteSeries } from './minuteSeries';
import { RB_P_EDGE, RB_P_CORE } from './rainWindow';
import { intensityBand, WET_MMH, STARKREGEN_MMH, NOWCAST_HORIZON_MIN, NOWCAST_STEP_MIN, type Nowcast, type NowcastStep, type EventTone, type StepPhase, type StepCharacter } from './nowcastModel';

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

const pct = (p: number) => `${Math.round(p * 100)} %`;
const d1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const NB = ' ';

/** Wind direction in eight sectors (meteorological: where it blows FROM). */
export function compass8(deg: number): string {
  const n = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return n[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/**
 * The precipitation word (set, DWD-near): rate bands of `intensityBand` (0,1 / 1 / 2,5 / 10 mm/h), the phase and the
 * character. Drizzle = light, steady rain under 0,5 mm/h; "Schauer" = convective run; "Dauerregen" = steady run.
 */
export function precipWord(mmH: number, phase: StepPhase, character: StepCharacter | 'unknown'): string {
  if (phase === 'dry' || mmH < WET_MMH) return 'trocken';
  const band = intensityBand(mmH);
  const showery = character === 'showery';
  const adj = band === 'light' ? 'leichter' : band === 'moderate' ? 'mäßiger' : 'kräftiger';
  if (phase === 'freezing') return `${adj} gefrierender Regen · Glätte`;
  if (phase === 'snow') {
    if (showery) return band === 'light' ? 'leichter Schneeschauer' : band === 'moderate' ? 'Schneeschauer' : 'kräftiger Schneeschauer';
    return band === 'light' ? 'leichter Schneefall' : band === 'moderate' ? 'mäßiger Schneefall' : 'kräftiger Schneefall';
  }
  if (phase === 'sleet') return `${adj} Schneeregen${showery ? ' (Schauer)' : ''}`;
  if (band === 'light') {
    if (!showery && mmH < 0.5) return 'leichtes Nieseln';
    return showery ? 'leichter Schauer' : 'leichter Regen';
  }
  if (band === 'moderate') return showery ? 'mäßiger Schauer' : 'mäßiger Regen';
  if (band === 'strong') return showery ? 'starker Schauer' : 'starker Regen';
  return showery ? 'sehr starker Schauer · Starkregen' : 'sehr starker Regen · Starkregen';
}

/** "Wind aus SW 4 m/s, Böen 9" — from the Fusion hour the time falls into; '' without wind. */
function windText(hours: NonNullable<Nowcast['fusionHours']>, tMs: number): string {
  const h = hours.find((x) => tMs >= x.tMs - H && tMs < x.tMs) ?? hours.find((x) => x.tMs >= tMs) ?? null;
  if (!h || h.windMs == null) return '';
  const dir = h.windDir != null ? ` aus ${compass8(h.windDir)}` : '';
  const gust = h.gustMs != null && h.gustMs >= h.windMs + 3 ? `, Böen ${Math.round(h.gustMs)}` : '';
  return `Wind${dir} ${Math.round(h.windMs)}${gust}${NB}m/s`;
}

function fmtDur(min: number): string {
  if (min < 60) return `${min}${NB}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}${NB}h ${m}${NB}min` : `${h}${NB}h`;
}

/** The engine's wet run starting at or after `fromMin`: its end (first dry step), peak and duration. */
function runFrom(steps: NowcastStep[], fromMin: number): { endMin: number | null; peak: number; peakMin: number; lenMin: number } {
  let peak = 0, peakMin = fromMin, last = fromMin, endMin: number | null = null;
  for (const s of steps) {
    if (s.minutes < fromMin) continue;
    if (s.mmH < WET_MMH) { endMin = s.minutes; break; }
    if (s.mmH > peak) { peak = s.mmH; peakMin = s.minutes; }
    last = s.minutes;
  }
  return { endMin, peak, peakMin, lenMin: (endMin ?? last + NOWCAST_STEP_MIN) - fromMin };
}

export function buildEventDetail(nc: Nowcast, nowMs: number = Date.now()): EventDetail {
  const fusionLabel = nc.nwpSource === 'cube' ? 'buscosun Fusion' : 'ICON-D2';
  const hours48 = nc.fusionHours ?? [];
  const series = buildMinuteSeries({
    nowMs, radarFrames: nc.radarFrames ?? [], radarSource: nc.radarSource,
    fusionHours: hours48, fusionPWet: nc.fusionPWet ?? null, fusionLabel,
  });
  const items: EventItem[] = [];
  const wind = (tMs: number) => windText(hours48, tMs);
  const join = (...parts: Array<string | null | undefined>) => parts.filter((p): p is string => !!p).join(' · ');
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // --- 0–6 h: the engine's events, tagged with the step's source ---
  if (nc.currentlyRaining) {
    const s0 = nc.steps[0];
    const src0: EventSource = s0.source === 'nwp' ? 'fusion' : s0.source;
    const r = runFrom(nc.steps, 0);
    items.push({
      id: 'e-now', tMs: nc.nowMs, title: `${precipWord(s0.mmH, s0.phase, s0.character ?? 'unknown')} jetzt`,
      detail: join(`~${d1(s0.mmH)}${NB}mm/h`, r.endMin != null ? `bis ca. ${clock(nc.nowMs + r.endMin * MIN)}` : 'hält über 6 h an', r.peak > s0.mmH + 0.3 ? `Spitze ~${d1(r.peak)}${NB}mm/h um ${clock(nc.nowMs + r.peakMin * MIN)}` : null, wind(nc.nowMs)),
      tone: s0.phase === 'freezing' ? 'alert' : 'info', source: src0, sourceLabel: sourceLabelOf(src0, fusionLabel), precision: 'step', kind: 'now',
    });
  }
  let sharpened = false;
  for (const e of nc.events) {
    // The seam (`beyond-skill`) is not weather: the list carries only precipitation events (Jan 16.10.).
    if (e.kind === 'beyond-skill') continue;
    // Rain that runs through the whole engine window has no end in it (the engine's dry window would be negative).
    if (e.kind === 'rain-end' && e.atMinutes >= NOWCAST_HORIZON_MIN) continue;
    const step = nc.steps.find((s) => s.minutes === e.atMinutes) ?? nc.steps[0];
    const src: EventSource = step.source === 'nwp' ? 'fusion' : step.source;
    let tMs = nc.nowMs + e.atMinutes * MIN;
    let precision: EventItem['precision'] = 'step';
    let title = e.title;
    let detail = e.detail;
    if (e.kind === 'rain-start' || e.kind === 'shower') {
      if (e.kind === 'rain-start' && step.mmH < WET_MMH && e.tone === 'good') {
        // "Durchgehend trocken" — the engine's dry statement; keep it, add the wind.
        detail = join(e.detail.replace(/\.$/, ''), wind(tMs));
      } else {
        const r = runFrom(nc.steps, e.atMinutes);
        const word = precipWord(Math.max(step.mmH, r.peak), step.phase, step.character ?? 'unknown');
        if (e.kind === 'rain-start' && !sharpened && src === 'radar' && series.firstWet?.source === 'radar') {
          tMs = series.firstWet.tMs; precision = 'min'; sharpened = true;
        }
        title = e.kind === 'rain-start' ? `${word} ab ${clock(tMs)}` : `${word}${e.title.startsWith('Zweiter') ? ' (zweiter Schauer)' : ' (weiterer Schauer)'}`;
        detail = join(
          `~${d1(step.mmH)}${NB}mm/h${r.peak > step.mmH + 0.3 ? `, Spitze ~${d1(r.peak)} um ${clock(nc.nowMs + r.peakMin * MIN)}` : ''}`,
          r.endMin != null ? `etwa ${fmtDur(r.lenMin)} bis ca. ${clock(nc.nowMs + r.endMin * MIN)}` : 'bis über das 6-h-Fenster hinaus',
          precision === 'min' ? 'minutengenau aus dem Radar' : null, wind(tMs),
        );
      }
    } else if (e.kind === 'rain-end') {
      const dw = nc.dryWindow;
      title = 'Regen hört auf';
      detail = join(dw && dw.durationMin > 0 ? `Trockenfenster ${fmtDur(dw.durationMin)}${dw.toMin < NOWCAST_HORIZON_MIN ? `, Regen wieder ab ca. ${clock(nc.nowMs + dw.toMin * MIN)}` : ''}` : e.detail, wind(tMs));
    } else if (e.kind === 'peak' || e.kind === 'thunder') {
      detail = join(`${precipWord(step.mmH, step.phase, step.character ?? 'unknown')} · ${e.detail}`, wind(tMs));
    } else {
      detail = join(e.detail, wind(tMs));
    }
    items.push({
      id: `e-${e.kind}-${e.atMinutes}`, tMs, title, detail,
      tone: e.tone, source: src, sourceLabel: sourceLabelOf(src, fusionLabel), precision, kind: e.kind,
    });
  }

  // --- 6–48 h: buscosun Fusion hours ---
  const beyondFrom = nc.nowMs + NOWCAST_HORIZON_MIN * MIN;
  const endMs = nowMs + ED_HORIZON_H * H;
  const pBy = new Map<number, number>();
  for (const p of nc.fusionPWet ?? []) pBy.set(p.tMs, p.p);
  const hours = [...hours48].filter((h) => h.tMs - H >= beyondFrom && h.tMs - H < endMs).sort((a, b) => a.tMs - b.tMs);
  let wetHoursBeyond = 0;
  // Rain at the engine's last step continues into the first Fusion hour: no second "start" at the seam.
  let continuing = (nc.steps[nc.steps.length - 1]?.mmH ?? 0) >= WET_MMH;
  // Start of that run inside the engine window (for "endet nach n h" of a continued run).
  let runStartMs = beyondFrom;
  for (let i = nc.steps.length - 1; i >= 0 && nc.steps[i].mmH >= WET_MMH; i--) runStartMs = nc.nowMs + nc.steps[i].minutes * MIN;
  interface Run { fromMs: number; toMs: number; peak: number; peakMs: number; phase: StepPhase; pMax: number; startIdx: number; first: number }
  let run: Run | null = null;
  const closeRun = (r: Run) => {
    const lenH = Math.max(1, Math.round((r.toMs - r.fromMs) / H));
    // The start item gets its word once the run is known: ≤ 2 h = Schauer, longer = steady.
    const startItem = r.startIdx >= 0 ? items[r.startIdx] : null;
    if (startItem) {
      const character: StepCharacter = lenH <= 2 ? 'showery' : 'steady';
      // The word follows the first hour's rate; a clearly stronger peak later is named with its hour.
      startItem.title = startItem.title.replace('__WORD__', precipWord(r.first, r.phase, character));
      startItem.detail = startItem.detail.replace('__LEN__', `${r.toMs < endMs ? `etwa ${lenH}${NB}h bis ca. ${clock(r.toMs)}` : 'bis über 48 h hinaus'}${r.peak >= Math.max(0.5, r.first * 2) ? ` · später bis ~${d1(r.peak)}${NB}mm/h (${clock(r.peakMs)})` : ''}`);
    }
    if (r.toMs < endMs) {
      items.push({
        id: `f-end-${r.toMs}`, tMs: r.toMs, title: `${PHASE_WORD[r.phase]} hört auf`,
        detail: join(`nach ${lenH}${NB}h`, `Spitze ~${d1(r.peak)}${NB}mm/h um ${clock(r.peakMs)}`, wind(r.toMs)),
        tone: 'good', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-end',
      });
    }
  };
  for (const h of hours) {
    const from = h.tMs - H;
    const phase = phaseOfHour(h, nc.elevationM);
    const p = pBy.get(from) ?? null;
    // Wet = rate ≥ 0,1 mm/h AND P(wet) at least the edge threshold of the rain window (30 %, E-RB-4) — below that the hour is noise.
    const wet = phase !== 'dry' && (p == null || p >= RB_P_EDGE);
    if (wet) wetHoursBeyond++;
    if (wet && !run && continuing) {
      run = { fromMs: runStartMs, toMs: h.tMs, peak: h.mmH, peakMs: from, phase, pMax: p ?? 0, startIdx: -1, first: h.mmH };
    } else if (wet && !run) {
      const likely = p == null ? true : p >= RB_P_CORE;
      run = { fromMs: from, toMs: h.tMs, peak: h.mmH, peakMs: from, phase, pMax: p ?? 0, startIdx: items.length, first: h.mmH };
      items.push({
        id: `f-start-${from}`, tMs: from, title: `__WORD__ ${likely ? 'wahrscheinlich' : 'möglich'}`,
        detail: join(`~${d1(h.mmH)}${NB}mm/h im Stundenmittel`, '__LEN__', p != null ? `Regenchance ${pct(p)}` : null, h.tempC != null ? `${d1(h.tempC)}${NB}°C` : null, wind(from)),
        tone: phase === 'freezing' ? 'alert' : likely ? 'info' : 'muted', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-start',
      });
    } else if (wet && run) {
      if (phase !== run.phase) {
        items.push({
          id: `f-phase-${from}`, tMs: from, title: `Übergang in ${PHASE_WORD[phase]}`,
          detail: join(`vorher ${PHASE_WORD[run.phase]}`, h.tempC != null ? `${d1(h.tempC)}${NB}°C` : null, h.snowLineM != null ? `Schneefallgrenze ${Math.round(h.snowLineM / 10) * 10}${NB}m` : null, wind(from)),
          tone: phase === 'freezing' ? 'alert' : phase === 'snow' ? 'warn' : 'info', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-phase',
        });
        run.phase = phase;
      }
      run.toMs = h.tMs;
      if (h.mmH > run.peak) { run.peak = h.mmH; run.peakMs = from; }
      if (p != null) run.pMax = Math.max(run.pMax, p);
    } else if (!wet && run) {
      closeRun(run); run = null;
    }
    if (h.mmH >= STARKREGEN_MMH) {
      items.push({
        id: `f-heavy-${from}`, tMs: from, title: 'Starkregen-Stunde',
        detail: join(`${precipWord(h.mmH, phase, 'showery')} · ~${d1(h.mmH)}${NB}mm/h im Stundenmittel`, p != null ? `Regenchance ${pct(p)}` : null, wind(from)),
        tone: 'alert', source: 'fusion', sourceLabel: fusionLabel, precision: 'hour', kind: 'fusion-heavy',
      });
    }
    continuing = false;
  }
  if (run) closeRun(run);
  // A run still open at the end of the 48 h keeps its placeholders otherwise.
  for (const it of items) { it.title = it.title.replace('__WORD__', 'Niederschlag'); it.detail = it.detail.replace(' · __LEN__', '').replace('__LEN__', ''); }

  items.sort((a, b) => a.tMs - b.tMs);
  const allDry = !nc.steps.some((s) => s.mmH >= WET_MMH) && wetHoursBeyond === 0;
  return { nowMs, items, series, allDry, wetHoursBeyond, fusionLabel };
}
