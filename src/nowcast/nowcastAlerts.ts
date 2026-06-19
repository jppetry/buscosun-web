/**
 * NC-US-D3 / US-D4 — Regen-Alarme (Konfiguration + Auswerte-Kern).
 *
 * Pure, IO-freie Logik: aus der Nowcast-Punktabfrage (US-A7) + Nutzer-Schwellen
 * entsteht ein Alarm-Entwurf — oder nicht. Schwellen bilden auf dieselben
 * Intensitätsbänder wie die Karte (US-D4 AK2). Gewitter/Hagel, gefrierender
 * Regen (Glätte) und Starkregen sind **eigene** Signale (US-B3/B4) und können
 * separat scharf geschaltet werden. Dedup + Ruhezeiten + Tageslimit verhindern
 * Spam (US-D3 AK2).
 *
 * Der Vorlauf ist auf den Skill-Horizont gedeckelt (Guardrail N-01): keine
 * minutengenauen Aussagen jenseits ~2 h.
 *
 * Persistenz lokal (localStorage); ein späteres Backend könnte dieselbe pure
 * `evaluateAlert` in einem Cron-Worker fahren (vgl. src/notifications).
 */

import { SKILL_HORIZON_MIN, type IntensityBand } from './nowcastModel';
import type { NowcastQueryResult } from './nowcastQuery';
import type { Country } from '../types';

// --- Bänder + Ordnung --------------------------------------------------------

/** Alarm-fähige Bänder (kein „trocken"). */
export const ALERT_BANDS: IntensityBand[] = ['light', 'moderate', 'strong', 'severe'];
const BAND_RANK: Record<IntensityBand, number> = { dry: 0, light: 1, moderate: 2, strong: 3, severe: 4 };

export function bandAtLeast(band: IntensityBand, min: IntensityBand): boolean {
  return BAND_RANK[band] >= BAND_RANK[min];
}

export const BAND_LABEL: Record<IntensityBand, string> = {
  dry: 'trocken', light: 'leicht', moderate: 'mäßig', strong: 'stark', severe: 'sehr stark',
};
export const BAND_THRESH_MMH: Record<IntensityBand, string> = {
  dry: '0', light: '0,1+', moderate: '1+', strong: '2,5+', severe: '10+',
};

// --- Modell ------------------------------------------------------------------

export interface AlertLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country: Country;
  enabled: boolean;
}

export interface AlertThresholds {
  /** Minimales Intensitätsband, ab dem gewarnt wird. */
  minBand: IntensityBand;
  /** Gewünschte Vorlaufzeit (min) — gedeckelt auf den Skill-Horizont. */
  leadTimeMin: number;
  /** Gewitter/Hagel separat (US-B3). */
  thunder: boolean;
  /** Gefrierender Regen / Glätte separat (US-B1). */
  glaze: boolean;
  /** Starkregen separat (US-B4). */
  heavy: boolean;
}

export interface QuietHours {
  enabled: boolean;
  /** Stunde Beginn (0–23), z. B. 22. */
  fromHour: number;
  /** Stunde Ende (0–23), z. B. 7. */
  toHour: number;
}

export interface AlertConfig {
  thresholds: AlertThresholds;
  quietHours: QuietHours;
  /** Maximale Alerts pro 24 h (Anti-Flut). */
  maxPerDay: number;
}

/** Dedup-/Drossel-Zustand je Standort (serialisierbar). */
export interface AlertState {
  /** Schlüssel des zuletzt gemeldeten Ereignisses je Standort. */
  lastEventKey: Record<string, string>;
  /** Zustell-Zeitstempel (ms) der letzten 24 h. */
  sentMs: number[];
}

export type AlertKind = 'rain-start' | 'thunder' | 'glaze' | 'heavy';

export interface AlertDraft {
  locationId: string;
  kind: AlertKind;
  title: string;
  body: string;
  onsetMin: number;
  /** Dedup-Schlüssel (Art + Ereignis-Zeitfenster). */
  eventKey: string;
}

export const DEFAULT_CONFIG: AlertConfig = {
  thresholds: { minBand: 'moderate', leadTimeMin: 30, thunder: true, glaze: true, heavy: true },
  quietHours: { enabled: true, fromHour: 22, toHour: 7 },
  maxPerDay: 6,
};

export const MIN_LEAD_MIN = 10;
export const MAX_LEAD_MIN = SKILL_HORIZON_MIN; // Guardrail N-01: nie über den Skill-Horizont

export function clampLead(min: number): number {
  return Math.max(MIN_LEAD_MIN, Math.min(MAX_LEAD_MIN, Math.round(min)));
}

// --- Ruhezeiten --------------------------------------------------------------

/** Ist `hour` in den Ruhezeiten (über Mitternacht hinweg korrekt)? */
export function inQuietHours(q: QuietHours, hour: number): boolean {
  if (!q.enabled) return false;
  if (q.fromHour === q.toHour) return false;
  return q.fromHour < q.toHour
    ? hour >= q.fromHour && hour < q.toHour
    : hour >= q.fromHour || hour < q.toHour; // Wrap über Mitternacht
}

// --- Kern: Auswertung --------------------------------------------------------

export interface AlertEvalCtx {
  nowMs: number;
  /** Lokale Stunde (0–23) für Ruhezeiten — injizierbar für Tests. */
  localHour: number;
}

/**
 * Wertet einen Standort aus und liefert höchstens **einen** Alarm-Entwurf.
 * Reihenfolge nach Kritikalität: Glätte > Gewitter > Starkregen > Regenbeginn.
 * Ruhezeiten unterdrücken nicht-kritische Alerts (kritisch = Glätte/Gewitter).
 *
 * US-D4 AK3: Regenbeginn feuert nur, wenn ein Schritt **im Vorlauffenster** ein
 * Band **≥ Nutzer-Schwelle** trägt.
 */
export function evaluateAlert(
  loc: AlertLocation,
  query: NowcastQueryResult,
  cfg: AlertConfig,
  state: AlertState,
  ctx: AlertEvalCtx,
): AlertDraft | null {
  if (!loc.enabled) return null;

  const lead = clampLead(cfg.thresholds.leadTimeMin);
  // Schritte im Vorlauffenster (jetzt < t ≤ lead).
  const window = query.steps.filter((s) => s.minutes > 0 && s.minutes <= lead);
  if (!window.length) return null;

  const t = cfg.thresholds;
  const quiet = inQuietHours(cfg.quietHours, ctx.localHour);
  const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const bucket = (min: number) => Math.round(min / 15); // 15-Min-Ereignis-Bucket für Dedup

  // Kandidaten in Kritikalitätsreihenfolge.
  type Cand = { kind: AlertKind; onsetMin: number; critical: boolean; title: string; body: string };
  const cands: Cand[] = [];

  // Glätte (gefrierender Regen) — kritisch.
  if (t.glaze) {
    const s = window.find((x) => x.phase === 'freezing');
    if (s) cands.push({ kind: 'glaze', onsetMin: s.minutes, critical: true,
      title: `Glättegefahr · ${loc.name}`, body: `Gefrierender Regen ab ca. ${fmtClock(s.timestampMs)} — Glättegefahr.` });
  }
  // Gewitter/Hagel — kritisch.
  if (t.thunder && (query.summary.thunderRiskPct >= 50 || query.summary.hailRiskPct >= 20)) {
    const s = window.find((x) => x.mmH >= 2.5) ?? window[0];
    const hail = query.summary.hailRiskPct >= 20 ? ' · Hagel möglich' : '';
    cands.push({ kind: 'thunder', onsetMin: s.minutes, critical: true,
      title: `Gewitter · ${loc.name}`, body: `Gewitterrisiko ${query.summary.thunderRiskPct} %${hail} im nächsten Vorlauf.` });
  }
  // Starkregen — nicht kritisch (aber wichtig).
  if (t.heavy) {
    const s = window.find((x) => x.mmH >= 5);
    if (s) cands.push({ kind: 'heavy', onsetMin: s.minutes, critical: false,
      title: `Starkregen · ${loc.name}`, body: `Starkregen ab ca. ${fmtClock(s.timestampMs)} (${comma(s.mmH)} mm/h) — DWD-Schwelle.` });
  }
  // Regenbeginn ab Schwelle — nicht kritisch (US-D4 AK3).
  {
    const s = window.find((x) => bandAtLeast(x.band, t.minBand));
    if (s) {
      const phaseTxt = s.phase === 'snow' ? 'Schnee' : s.phase === 'sleet' ? 'Schneeregen' : 'Regen';
      cands.push({ kind: 'rain-start', onsetMin: s.minutes, critical: false,
        title: `${phaseTxt} in ${s.minutes} Min · ${loc.name}`,
        body: `Beginn ca. ${fmtClock(s.timestampMs)} · ${s.bandLabel} (${comma(s.mmH)} mm/h) · ${phaseTxt}.` });
    }
  }

  if (!cands.length) return null;
  // Höchste Kritikalität, dann früheste Onset-Zeit.
  cands.sort((a, b) => (Number(b.critical) - Number(a.critical)) || (a.onsetMin - b.onsetMin));
  const pick = cands[0];

  // Ruhezeiten: nicht-kritische Alerts unterdrücken.
  if (quiet && !pick.critical) return null;

  // Tageslimit (Anti-Flut).
  const dayMs = 24 * 3600_000;
  const recent = state.sentMs.filter((ms) => ctx.nowMs - ms < dayMs);
  if (recent.length >= cfg.maxPerDay) return null;

  // Dedup: gleicher Art + gleiches Ereignis-Zeitfenster → nicht erneut.
  const eventKey = `${pick.kind}@${bucket(pick.onsetMin)}`;
  if (state.lastEventKey[loc.id] === eventKey) return null;

  return { locationId: loc.id, kind: pick.kind, title: pick.title, body: pick.body, onsetMin: pick.onsetMin, eventKey };
}

/** Schreibt den Zustand nach einer Zustellung fort (pur). */
export function recordSent(state: AlertState, locId: string, draft: AlertDraft, nowMs: number): AlertState {
  const dayMs = 24 * 3600_000;
  return {
    lastEventKey: { ...state.lastEventKey, [locId]: draft.eventKey },
    sentMs: [...state.sentMs.filter((ms) => nowMs - ms < dayMs), nowMs],
  };
}

const comma = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

// --- Persistenz (localStorage) ----------------------------------------------

const LS = { config: 'buscosun.nowcast.alerts.config.v1', locs: 'buscosun.nowcast.alerts.locs.v1', state: 'buscosun.nowcast.alerts.state.v1' };

export function loadConfig(): AlertConfig {
  try { const raw = localStorage.getItem(LS.config); if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}
export function saveConfig(c: AlertConfig): void { try { localStorage.setItem(LS.config, JSON.stringify(c)); } catch { /* ignore */ } }
export function loadLocations(): AlertLocation[] {
  try { const raw = localStorage.getItem(LS.locs); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return [];
}
export function saveLocations(l: AlertLocation[]): void { try { localStorage.setItem(LS.locs, JSON.stringify(l)); } catch { /* ignore */ } }
export function loadState(): AlertState {
  try { const raw = localStorage.getItem(LS.state); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return { lastEventKey: {}, sentMs: [] };
}
export function saveState(s: AlertState): void { try { localStorage.setItem(LS.state, JSON.stringify(s)); } catch { /* ignore */ } }

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface AlertCheck { case: string; ok: boolean; detail: string }

function fakeQuery(stepsSpec: Array<{ min: number; mmH: number; band: IntensityBand; phase?: string }>, summary?: Partial<NowcastQueryResult['summary']>): NowcastQueryResult {
  const now = 1_700_000_000_000;
  return {
    lat: 50, lon: 8, country: 'DE', nowMs: now, radarSource: 'rv', radarValidMin: 120, skillHorizonMin: 120,
    steps: stepsSpec.map((s, i) => ({
      minutes: s.min, timestampMs: now + s.min * 60000, mmH: s.mmH, mmHMin: s.mmH * 0.8, mmHMax: s.mmH * 1.2,
      cumulativeMm: 0, band: s.band, bandLabel: s.band, phase: (s.phase ?? (s.mmH > 0 ? 'rain' : 'dry')) as never,
      character: null, rainProbability: 0.7, source: 'radar', confidence: 0.8, index: i,
    })) as never,
    summary: { sumMm: 1, sumMinMm: 0.5, sumMaxMm: 2, dominantPhase: 'rain', thunderRiskPct: 0, hailRiskPct: 0, heavyRain: false, snowLineM: null, currentlyRaining: false, nextRainInMin: null, dryWindow: null, ...summary },
  } as NowcastQueryResult;
}

export function verifyNowcastAlerts(): { checks: AlertCheck[]; passed: number; failed: number } {
  const checks: AlertCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });
  const loc: AlertLocation = { id: 'a', name: 'Test', lat: 50, lon: 8, country: 'DE', enabled: true };
  const emptyState: AlertState = { lastEventKey: {}, sentMs: [] };
  const ctxDay: AlertEvalCtx = { nowMs: 1_700_000_000_000, localHour: 14 };
  const ctxNight: AlertEvalCtx = { nowMs: 1_700_000_000_000, localHour: 3 };

  // US-D4 AK3: feuert nur, wenn Band ≥ Schwelle im Vorlauffenster.
  const cfg = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds, minBand: 'moderate' as IntensityBand, leadTimeMin: 30 } };
  const belowThresh = fakeQuery([{ min: 15, mmH: 0.3, band: 'light' }, { min: 30, mmH: 0.4, band: 'light' }]);
  add('kein Alarm wenn Band < Schwelle', evaluateAlert(loc, belowThresh, cfg, emptyState, ctxDay) === null);
  const atThresh = fakeQuery([{ min: 15, mmH: 1.5, band: 'moderate' }]);
  const d1 = evaluateAlert(loc, atThresh, cfg, emptyState, ctxDay);
  add('Alarm wenn Band ≥ Schwelle', d1?.kind === 'rain-start', d1?.kind ?? 'null');

  // Außerhalb des Vorlauffensters kein Alarm.
  const outside = fakeQuery([{ min: 60, mmH: 2, band: 'moderate' }]);
  add('kein Alarm außerhalb Vorlauf', evaluateAlert(loc, outside, cfg, emptyState, ctxDay) === null);

  // Ruhezeiten unterdrücken Regenbeginn (nicht kritisch)…
  add('Ruhezeit unterdrückt Regen', evaluateAlert(loc, atThresh, cfg, emptyState, ctxNight) === null);
  // …aber nicht Glätte (kritisch).
  const glaze = fakeQuery([{ min: 15, mmH: 0.5, band: 'light', phase: 'freezing' }]);
  const dg = evaluateAlert(loc, glaze, cfg, emptyState, ctxNight);
  add('Glätte trotz Ruhezeit', dg?.kind === 'glaze', dg?.kind ?? 'null');

  // Dedup: gleiches Ereignis nicht erneut.
  const st2 = recordSent(emptyState, loc.id, d1!, ctxDay.nowMs);
  add('Dedup: gleiches Ereignis blockt', evaluateAlert(loc, atThresh, cfg, st2, ctxDay) === null);

  // Tageslimit.
  const cfgLimit = { ...cfg, maxPerDay: 1 };
  const stFull: AlertState = { lastEventKey: {}, sentMs: [ctxDay.nowMs - 1000] };
  add('Tageslimit blockt', evaluateAlert(loc, atThresh, cfgLimit, stFull, ctxDay) === null);

  // Deaktivierter Standort.
  add('deaktivierter Standort: kein Alarm', evaluateAlert({ ...loc, enabled: false }, atThresh, cfg, emptyState, ctxDay) === null);

  // Gewitter ist kritisch und schlägt Regenbeginn.
  const thunderQ = fakeQuery([{ min: 15, mmH: 3, band: 'strong' }], { thunderRiskPct: 60 });
  const dt = evaluateAlert(loc, thunderQ, { ...cfg }, emptyState, ctxNight);
  add('Gewitter kritisch, feuert nachts', dt?.kind === 'thunder', dt?.kind ?? 'null');

  // Quiet-Hours-Wrap über Mitternacht.
  add('Ruhezeit 22→7 enthält 3 Uhr', inQuietHours({ enabled: true, fromHour: 22, toHour: 7 }, 3));
  add('Ruhezeit 22→7 schließt 14 Uhr aus', !inQuietHours({ enabled: true, fromHour: 22, toHour: 7 }, 14));

  // Lead-Deckelung auf Skill-Horizont (Guardrail N-01).
  add('Lead gedeckelt auf Skill-Horizont', clampLead(300) === SKILL_HORIZON_MIN, String(clampLead(300)));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyNowcastAlerts: typeof verifyNowcastAlerts }).__verifyNowcastAlerts = verifyNowcastAlerts;
}
