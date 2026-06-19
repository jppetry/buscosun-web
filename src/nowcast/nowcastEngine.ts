/**
 * Nowcast-Engine — führt Radar (0–2 h) und ICON-D2-Punktforecast (2–6 h) zu
 * einer 15-Min-Serie über 6 h zusammen.
 *
 * `assembleNowcast` ist PUR (Zeit + Sampler-Closures rein) und damit testbar;
 * `buildNowcast` holt die echten Daten (Radar-Sampler + Punktforecast) aus der
 * bestehenden Karten-Pipeline und ruft dann assemble auf.
 */

import { createRadarNowcastSampler } from '../pointForecast/radarNowcast';
import { getPointForecast } from '../pointForecast/pointForecast';
import { classifyPrecipitation } from '../pointForecast/precipType';
import type { Country } from '../types';
import {
  NOWCAST_HORIZON_MIN, NOWCAST_STEP_MIN, SKILL_HORIZON_MIN, BLEND_FROM_MIN, BLEND_TO_MIN,
  WET_MMH, HEAVY_MMH, STARKREGEN_MMH, STARKREGEN_SUM_MM,
  intensityBand, intensityLabel,
  type Nowcast, type NowcastStep, type NowcastSource, type NowcastEvent, type NowcastSummary, type Phase,
  type StepPhase, type StepCharacter, type PhaseTransition,
} from './nowcastModel';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);

/** Ein zur Engine reduzierter NWP-Stundenwert. */
export interface NwpHour {
  tMs: number;
  mmH: number;
  conf: number;          // 0..1 (pointForecast.confidence.precipitation)
  snowLineM: number | null;
  tempC: number | null;  // 2-m-Temperatur am Standort — Basis der Phase
}

export interface AssembleInput {
  nowMs: number;
  /** Radar-mm/h am Zeitpunkt (null außerhalb Horizont/Abdeckung). */
  radarSampleAt: (etaMs: number) => number | null;
  radarValidUntilMs: number;
  radarSource: string;
  runAtMs: number;
  fetchedAtMs: number;
  nwp: NwpHour[];
  /** Höhe des Standorts (m ü. M.) — für Phase-Klassifikation relativ zur Schneefallgrenze. */
  elevationM?: number | null;
  /** Temperatur-Höhengradient (°C/m) — für die alpine Tal/Grat-Trennung (US-F1). */
  lapseRatePerM?: number | null;
}

interface NwpInterp { mmH: number; conf: number; snowLineM: number | null; tempC: number | null }

/** Lineare Interpolation der NWP-Stundenwerte auf einen Zeitpunkt. */
function interpNwp(nwp: NwpHour[], etaMs: number): NwpInterp {
  if (!nwp.length) return { mmH: 0, conf: 0, snowLineM: null, tempC: null };
  if (etaMs <= nwp[0].tMs) return { mmH: nwp[0].mmH, conf: nwp[0].conf, snowLineM: nwp[0].snowLineM, tempC: nwp[0].tempC };
  const last = nwp[nwp.length - 1];
  if (etaMs >= last.tMs) return { mmH: last.mmH, conf: last.conf, snowLineM: last.snowLineM, tempC: last.tempC };
  for (let i = 0; i < nwp.length - 1; i++) {
    const a = nwp[i], b = nwp[i + 1];
    if (etaMs >= a.tMs && etaMs <= b.tMs) {
      const w = (etaMs - a.tMs) / (b.tMs - a.tMs);
      const lerp = (x: number | null, y: number | null) => x != null && y != null ? x * (1 - w) + y * w : (w < 0.5 ? x : y) ?? x ?? y;
      return {
        mmH: a.mmH * (1 - w) + b.mmH * w,
        conf: a.conf * (1 - w) + b.conf * w,
        snowLineM: (w < 0.5 ? a.snowLineM : b.snowLineM) ?? a.snowLineM ?? b.snowLineM,
        tempC: lerp(a.tempC, b.tempC),
      };
    }
  }
  return { mmH: last.mmH, conf: last.conf, snowLineM: last.snowLineM, tempC: last.tempC };
}

/** Phase pro Schritt (US-B1): T-/Schneefallgrenzen-Heuristik + Glättesignal. */
function classifyStepPhase(mmH: number, tempC: number | null, snowLineM: number | null, elevationM: number | null | undefined): StepPhase {
  if (mmH < WET_MMH) return 'dry';
  const t = classifyPrecipitation(tempC, mmH, { snowLineM, sampleElevM: elevationM ?? null });
  if (t === 'none') return 'dry';
  // Gefrierender Regen (US-B1 AK3): flüssiger Niederschlag bei Boden-T ≤ 0,7 °C → Glättegefahr.
  if ((t === 'rain' || t === 'sleet') && tempC != null && tempC <= 0.7) return 'freezing';
  return t; // 'rain' | 'sleet' | 'snow'
}

function stepConfidence(source: NowcastSource, minutes: number, nwpConf: number, blendW: number): number {
  if (source === 'radar') return clamp(0.95 - minutes * 0.0018, 0.6, 0.95);
  if (source === 'blend') return clamp(0.55 + (1 - blendW) * 0.12, 0.5, 0.68);
  // nwp: lead-gedämpft + leichte Kopplung an die Modell-Einigkeit
  let c = clamp(0.52 - (minutes - 120) * 0.0008, 0.2, 0.52);
  c *= 0.8 + 0.4 * clamp01(nwpConf / 0.5);
  return clamp(c, 0.16, 0.6);
}

/** Baut die komplette Nowcast-Serie + Auswertung (pur). */
export function assembleNowcast(input: AssembleInput): Nowcast {
  const { nowMs, radarSampleAt, radarValidUntilMs, radarSource, runAtMs, fetchedAtMs, nwp, elevationM } = input;
  const steps: NowcastStep[] = [];
  let radarValidMin = 0;

  for (let minutes = 0; minutes <= NOWCAST_HORIZON_MIN; minutes += NOWCAST_STEP_MIN) {
    const etaMs = nowMs + minutes * 60_000;
    const r = minutes <= SKILL_HORIZON_MIN && etaMs <= radarValidUntilMs ? radarSampleAt(etaMs) : null;
    const radarOk = r != null && Number.isFinite(r);
    if (radarOk) radarValidMin = minutes;
    const n = interpNwp(nwp, etaMs);

    let mmH: number, source: NowcastSource, blendW = 0;
    if (radarOk && minutes <= BLEND_FROM_MIN) {
      mmH = r as number; source = 'radar';
    } else if (radarOk && minutes < BLEND_TO_MIN) {
      blendW = (minutes - BLEND_FROM_MIN) / (BLEND_TO_MIN - BLEND_FROM_MIN);
      mmH = (r as number) * (1 - blendW) + n.mmH * blendW; source = 'blend';
    } else {
      mmH = n.mmH; source = 'nwp';
    }
    mmH = Math.max(0, mmH);

    const confidence = stepConfidence(source, minutes, n.conf, blendW);
    const relSpread = 0.22 + (1 - confidence) * 0.95;
    let mmHMax = mmH * (1 + relSpread);
    const mmHMin = Math.max(0, mmH * (1 - relSpread));
    // Unsichere „trockene" Zukunft kann durchaus etwas Regen bringen → Band zeigt das.
    if (mmH < 0.3) mmHMax = Math.max(mmHMax, (1 - confidence) * 0.9);

    const phase = classifyStepPhase(mmH, n.tempC, n.snowLineM, elevationM);
    const heavy = mmH >= STARKREGEN_MMH;

    steps.push({
      index: steps.length, minutes, timestamp: new Date(etaMs), mmH, mmHMin, mmHMax, source, confidence,
      phase, character: null, tempC: n.tempC, snowLineM: n.snowLineM, heavy,
    });
  }

  const wetRuns = findWetRuns(steps);
  // Charakter pro Schritt (US-B5): kurze/intensive Runs = Schauer (konvektiv),
  // lange/gleichmäßige = Dauerregen (stratiform). Setzt voraus, dass die Runs stehen.
  assignCharacter(steps, wetRuns);
  const summary = summarize(steps, nwp, wetRuns);
  const currentlyRaining = steps[0].mmH >= WET_MMH;
  const firstWet = steps.find((s) => s.mmH >= WET_MMH) ?? null;
  const nextRainInMin = !currentlyRaining && firstWet ? firstWet.minutes : null;

  const { events, dryWindow } = buildEvents(steps, wetRuns, currentlyRaining, summary);

  return {
    steps, summary, events, currentlyRaining, nextRainInMin, dryWindow,
    skillHorizonMin: SKILL_HORIZON_MIN,
    radarValidMin,
    hasRadar: radarValidMin > 0 || radarValidUntilMs > nowMs,
    radarSource,
    nowMs, runAtMs, fetchedAtMs,
    elevationM: elevationM ?? null,
    lapseRatePerM: input.lapseRatePerM ?? null,
  };
}

interface WetRun { startIdx: number; endIdx: number; startMin: number; endMin: number; maxMmH: number; }

function findWetRuns(steps: NowcastStep[]): WetRun[] {
  const runs: WetRun[] = [];
  let cur: WetRun | null = null;
  for (const s of steps) {
    if (s.mmH >= WET_MMH) {
      if (!cur) cur = { startIdx: s.index, endIdx: s.index, startMin: s.minutes, endMin: s.minutes, maxMmH: s.mmH };
      else { cur.endIdx = s.index; cur.endMin = s.minutes; cur.maxMmH = Math.max(cur.maxMmH, s.mmH); }
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}

/** Setzt Schritt-Charakter (US-B5): kurzer/intensiver Run = Schauer, langer/sanfter = Dauerregen. */
function assignCharacter(steps: NowcastStep[], runs: WetRun[]): void {
  for (const run of runs) {
    const lenMin = run.endMin - run.startMin + NOWCAST_STEP_MIN;
    // Schauer: ≤ 75 min ODER ausgeprägte Spitze (≥ 2,5 mm/h). Sonst Dauerregen.
    const showery = lenMin <= 75 || run.maxMmH >= HEAVY_MMH;
    const character: StepCharacter = showery ? 'showery' : 'steady';
    for (let i = run.startIdx; i <= run.endIdx; i++) steps[i].character = character;
  }
}

/** Phasenübergänge im Fenster (US-B1 AK2) — nur „echte" Wechsel zwischen Niederschlagsphasen. */
function findPhaseTransitions(steps: NowcastStep[]): PhaseTransition[] {
  const out: PhaseTransition[] = [];
  let prev: StepPhase | null = null;
  for (const s of steps) {
    if (s.phase === 'dry') { prev = prev === null ? 'dry' : prev; continue; }
    if (prev != null && prev !== 'dry' && prev !== s.phase) {
      out.push({ atMinutes: s.minutes, timestamp: s.timestamp, from: prev, to: s.phase });
    }
    prev = s.phase;
  }
  return out;
}

function summarize(steps: NowcastStep[], nwp: NwpHour[], runs: WetRun[]): NowcastSummary {
  const hoursPerStep = NOWCAST_STEP_MIN / 60;
  const sumMm = steps.reduce((s, x) => s + x.mmH * hoursPerStep, 0);
  const sumMinMm = steps.reduce((s, x) => s + x.mmHMin * hoursPerStep, 0);
  const sumMaxMm = steps.reduce((s, x) => s + x.mmHMax * hoursPerStep, 0);
  const maxMmH = Math.max(...steps.map((s) => s.mmH));
  const wetSteps = steps.filter((s) => s.mmH >= WET_MMH).length;

  // Phase + Charakter
  let phase: Phase = 'dry';
  let phaseLabel = 'Trocken';
  let character = 'kein Niederschlag erwartet';
  if (maxMmH >= WET_MMH) {
    const showery = runs.length >= 2 || (wetSteps <= 8 && maxMmH >= 1);
    phase = showery ? 'shower' : 'rain';
    phaseLabel = showery ? 'Schauer' : 'Regen';
    character = maxMmH >= 8 ? 'konvektiv · Spitzen' : showery ? 'Schauer-Charakter' : 'gleichmäßig';
  }

  // Niederschlagsphasen-Aggregat (US-B1): dominante Phase + Übergänge
  const wet = steps.filter((s) => s.phase !== 'dry');
  const phaseCount = new Map<StepPhase, number>();
  for (const s of wet) phaseCount.set(s.phase, (phaseCount.get(s.phase) ?? 0) + 1);
  // Gefrierender Regen schlägt durch (Glättegefahr), sonst häufigste Phase.
  const dominantPhase: StepPhase = phaseCount.has('freezing') ? 'freezing'
    : ([...phaseCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'dry');
  const phaseTransitions = findPhaseTransitions(steps);

  // Gewitterrisiko (heuristisch, ohne CAPE → konservativ)
  const convective = maxMmH >= 3 && (runs.length >= 2 || maxMmH >= 8);
  let thunderRiskPct = convective ? clamp(Math.round((maxMmH - 3) * 5), 0, 55) : 0;
  if (!convective) thunderRiskPct = Math.min(thunderRiskPct, 8);
  const thunderLabel = thunderRiskPct >= 30 ? 'deutliches Risiko' : thunderRiskPct >= 12 ? 'erhöhtes Risiko' : 'geringes Risiko';

  // Hagelrisiko (US-B3) — eigenes Signal: nur bei kräftiger Konvektion + ausreichender Intensität.
  const hailRiskPct = convective && maxMmH >= 6 ? clamp(Math.round((maxMmH - 6) * 4 + thunderRiskPct * 0.3), 0, 45) : 0;

  // Starkregen-/Unwetter-Signal (US-B4): Spitzenrate ODER 6-h-Summe über DWD-naher Schwelle.
  const sumProbable = steps.reduce((s, x) => s + x.mmH * (NOWCAST_STEP_MIN / 60), 0);
  const heavyRain = maxMmH >= STARKREGEN_MMH || sumProbable >= STARKREGEN_SUM_MM;

  // Schneefallgrenze + Stabilität
  const snowVals = nwp.map((h) => h.snowLineM).filter((v): v is number => v != null);
  const snowLineM = snowVals.length ? Math.round(snowVals.reduce((a, b) => a + b, 0) / snowVals.length) : null;
  let snowLineNote: string;
  if (snowLineM == null) snowLineNote = 'nicht verfügbar (DE-Radar)';
  else {
    const range = Math.max(...snowVals) - Math.min(...snowVals);
    snowLineNote = range < 200 ? 'stabil über 6 h' : range < 500 ? 'leicht schwankend' : 'deutlich schwankend';
  }

  return {
    phase, phaseLabel, character,
    sumMm: round1(sumMm), sumMinMm: round1(sumMinMm), sumMaxMm: round1(sumMaxMm),
    thunderRiskPct, thunderLabel, hailRiskPct, heavyRain, peakMmH: round1(maxMmH),
    snowLineM, snowLineNote, dominantPhase, phaseTransitions,
  };
}

function buildEvents(steps: NowcastStep[], runs: WetRun[], currentlyRaining: boolean, summary: NowcastSummary): { events: NowcastEvent[]; dryWindow: Nowcast['dryWindow'] } {
  const events: NowcastEvent[] = [];
  const ts = (min: number) => steps.find((s) => s.minutes === min)?.timestamp ?? null;
  let dryWindow: Nowcast['dryWindow'] = null;

  if (runs.length === 0) {
    events.push({ kind: 'rain-start', title: 'Durchgehend trocken', detail: 'Kein Regen in den nächsten 6 Stunden erwartet.', atMinutes: 0, timestamp: ts(0), tone: 'good' });
  } else {
    const first = runs[0];
    if (currentlyRaining && first.startMin === 0) {
      // Ende des laufenden Regens → Trockenfenster
      const next = runs[1];
      const dryFrom = first.endMin + NOWCAST_STEP_MIN;
      const dryTo = next ? next.startMin : NOWCAST_HORIZON_MIN;
      dryWindow = { fromMin: dryFrom, toMin: dryTo, durationMin: dryTo - dryFrom };
      events.push({ kind: 'rain-end', title: 'Schauer-Ende · Trockenfenster', detail: `Beginn Trockenfenster · ${dryTo - dryFrom} min`, atMinutes: dryFrom, timestamp: ts(dryFrom), tone: 'good' });
    } else {
      const band = intensityBand(first.maxMmH);
      events.push({ kind: 'rain-start', title: 'Regenbeginn', detail: `${intensityLabel(band)} · ${summary.character}`, atMinutes: first.startMin, timestamp: ts(first.startMin), tone: 'info' });
    }
    // weitere Schauer
    for (let i = 1; i < runs.length; i++) {
      const r = runs[i];
      events.push({ kind: 'shower', title: i === 1 ? 'Zweiter Schauer' : `Weiterer Schauer (${i + 1}.)`, detail: `${intensityLabel(intensityBand(r.maxMmH))} · Schauer-Charakter`, atMinutes: r.startMin, timestamp: ts(r.startMin), tone: 'info' });
    }
  }

  // Spitze / Gewitter
  const peak = steps.reduce((a, b) => (b.mmH > a.mmH ? b : a), steps[0]);
  if (peak.mmH >= HEAVY_MMH) {
    const thunder = summary.thunderRiskPct >= 30;
    events.push({
      kind: thunder ? 'thunder' : 'peak',
      title: thunder ? 'Starkregen-Spitze · Gewitterrisiko' : 'Starkregen-Spitze',
      detail: `~${round1(peak.mmH).toString().replace('.', ',')} mm/h${thunder ? ' · Hagel möglich' : ''}`,
      atMinutes: peak.minutes, timestamp: peak.timestamp, tone: 'alert',
    });
  }

  // Skill-Horizont
  events.push({
    kind: 'beyond-skill', title: `Jenseits +${Math.round(SKILL_HORIZON_MIN / 60)} h`,
    detail: 'Modell-getrieben · keine minutengenauen Aussagen', atMinutes: SKILL_HORIZON_MIN, timestamp: ts(SKILL_HORIZON_MIN), tone: 'muted',
  });

  events.sort((a, b) => a.atMinutes - b.atMinutes);
  return { events, dryWindow };
}

function round1(x: number): number { return Math.round(x * 10) / 10; }

// --- echtes Laden ------------------------------------------------------------

export interface BuildNowcastOptions {
  lat: number;
  lon: number;
  country: Country;
  signal?: AbortSignal;
  /** Bezugszeit (Default Date.now()) — für Tests injizierbar. */
  nowMs?: number;
}

/** Holt Radar + Punktforecast und baut den Nowcast. */
export async function buildNowcast(opts: BuildNowcastOptions): Promise<Nowcast> {
  const { lat, lon, country, signal } = opts;
  const nowMs = opts.nowMs ?? Date.now();

  const [sampler, forecast] = await Promise.all([
    createRadarNowcastSampler(country, signal),
    getPointForecast({ lat, lng: lon, country, hours: 8, signal }),
  ]);

  const nwp: NwpHour[] = forecast.hours.map((h) => ({
    tMs: h.timestamp.getTime(),
    mmH: h.precipitation ?? 0,
    conf: h.confidence?.precipitation ?? 0,
    snowLineM: h.snowLineM ?? null,
    tempC: h.temperature ?? null,
  }));

  return assembleNowcast({
    nowMs,
    radarSampleAt: (etaMs) => (sampler ? sampler.sample(lat, lon, etaMs) : null),
    radarValidUntilMs: sampler ? sampler.meta.validUntilMs : 0,
    radarSource: sampler ? sampler.meta.source : '',
    runAtMs: sampler && sampler.meta.validFromMs ? sampler.meta.validFromMs : forecast.fetchedAt,
    fetchedAtMs: forecast.fetchedAt,
    nwp,
    elevationM: forecast.query?.elevation ?? null,
    lapseRatePerM: forecast.lapseRatePerM ?? null,
  });
}

// --- Verifikation (pur, DEV) -------------------------------------------------
// Synthetische Szenarien für die Phase-/Charakter-/Stark-Logik (US-B1/B4/B5).

export interface NcEngineCheck { case: string; ok: boolean; detail: string }
export interface NcEngineVerifyResult { checks: NcEngineCheck[]; passed: number; failed: number }

const H = 3_600_000;
function nwpFlat(now: number, mmH: number, tempC: number, snowLineM: number | null = null): NwpHour[] {
  return Array.from({ length: 9 }, (_, i) => ({ tMs: now + i * H, mmH, conf: 0.4, snowLineM, tempC }));
}

export function verifyNowcastEngine(): NcEngineVerifyResult {
  const now = 1_700_000_000_000; // fixer Bezug, deterministisch
  const checks: NcEngineCheck[] = [];
  const add = (c: string, ok: boolean, detail = '') => checks.push({ case: c, ok, detail });
  const noRadar = { radarValidUntilMs: 0, radarSource: '', runAtMs: now, fetchedAtMs: now, radarSampleAt: () => null };

  // A) Durchgehend trocken
  {
    const nc = assembleNowcast({ nowMs: now, nwp: nwpFlat(now, 0, 12), ...noRadar });
    add('Trocken: alle Schritte dry', nc.steps.every((s) => s.phase === 'dry'));
    add('Trocken: dominantPhase dry', nc.summary.dominantPhase === 'dry');
    add('Trocken: kein Starkregen', !nc.summary.heavyRain);
    add('Trocken: keine Übergänge', nc.summary.phaseTransitions.length === 0);
  }
  // B) Warmer Dauerregen mäßig
  {
    const nc = assembleNowcast({ nowMs: now, nwp: nwpFlat(now, 1.5, 9), ...noRadar });
    add('Regen: phase rain', nc.steps[8].phase === 'rain', nc.steps[8].phase);
    add('Regen: Charakter gesetzt', nc.steps.some((s) => s.character === 'steady'));
    add('Regen: nicht heavy', !nc.summary.heavyRain);
  }
  // C) Schnee→Regen-Übergang (T steigt -2 → 6)
  {
    const nwp = Array.from({ length: 9 }, (_, i) => ({ tMs: now + i * H, mmH: 1, conf: 0.4, snowLineM: null, tempC: -2 + i }));
    const nc = assembleNowcast({ nowMs: now, nwp, ...noRadar });
    add('Übergang: früh Schnee', nc.steps[0].phase === 'snow', nc.steps[0].phase);
    add('Übergang: spät Regen', nc.steps[nc.steps.length - 1].phase === 'rain', nc.steps[nc.steps.length - 1].phase);
    add('Übergang: ≥1 Phasenwechsel', nc.summary.phaseTransitions.length >= 1, `${nc.summary.phaseTransitions.length}`);
  }
  // D) Starkregen-Spitze
  {
    const nwp = nwpFlat(now, 1, 14);
    nwp[2].mmH = 8; nwp[3].mmH = 8; // ~8 mm/h Spitze
    const nc = assembleNowcast({ nowMs: now, nwp, ...noRadar });
    add('Stark: heavyRain true', nc.summary.heavyRain);
    add('Stark: ≥1 heavy-Schritt', nc.steps.some((s) => s.heavy));
    add('Stark: peakMmH ≥ 5', nc.summary.peakMmH >= 5, `${nc.summary.peakMmH}`);
  }
  // E) Gefrierender Regen (Punkt unter Schneefallgrenze, Boden ≤ 0 °C)
  {
    const nc = assembleNowcast({ nowMs: now, nwp: nwpFlat(now, 1, -1, 1500), elevationM: 600, ...noRadar });
    add('Glätte: freezing erkannt', nc.steps.some((s) => s.phase === 'freezing'), nc.steps[8].phase);
    add('Glätte: dominantPhase freezing', nc.summary.dominantPhase === 'freezing');
  }

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyNowcastEngine: typeof verifyNowcastEngine })
    .__verifyNowcastEngine = verifyNowcastEngine;
}
