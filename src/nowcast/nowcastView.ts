/**
 * Nowcast — Präsentations-Helfer (Formatierung, Quellen-/Zeit-Labels).
 * Gemeinsam genutzt von den Ergebnis-Bausteinen.
 */

export type { Nowcast } from './nowcastModel';
import { intensityBand, intensityLabel, WET_MMH, SKILL_HORIZON_MIN, type Nowcast, type DryWindow } from './nowcastModel';

/** Abgeleiteter Hero-Zustand (US2) — testbar getrennt von der Darstellung. */
export type HeroState =
  | { kind: 'raining'; dry: DryWindow | null; returnClock: string | null; endClock: string | null }
  | {
      kind: 'coming';
      inMin: number;
      onsetClock: string;
      /** Ende-Uhrzeit des ersten Regen-Runs („endet ~HH:MM") — null wenn er übers Fenster hinausläuft. */
      endClock: string | null;
      intensity: string;
      character: string;
      /** Beginn jenseits des Skill-Horizonts → keine minutengenaue Aussage (US-A4 AK2 / Guardrail N-01). */
      beyondSkill: boolean;
    }
  | { kind: 'dry' };

/** Ende-Minute des Regen-Runs, der bei/nach `fromMin` beginnt (erste trockene Stufe danach). */
function runEndMin(nc: Nowcast, fromMin: number): number | null {
  let lastWet: number | null = null;
  for (const s of nc.steps) {
    if (s.minutes < fromMin) continue;
    if (s.mmH >= WET_MMH) lastWet = s.minutes;
    else if (lastWet != null) break; // erste trockene Stufe nach Regen
  }
  return lastWet;
}

export function heroState(nc: Nowcast): HeroState {
  if (nc.currentlyRaining) {
    const dry = nc.dryWindow && nc.dryWindow.durationMin >= 15 ? nc.dryWindow : null;
    const returnsWithin6h = dry && dry.toMin < 360 && nc.steps.some((s) => s.minutes >= dry.toMin && s.mmH >= 0.1);
    // Ende des laufenden Regens = Beginn des Trockenfensters (sonst hält er an).
    const endMin = dry ? dry.fromMin : runEndMin(nc, 0);
    const endClock = endMin != null && endMin < 360 ? fmtClock(nc.nowMs + endMin * 60_000) : null;
    return {
      kind: 'raining', dry,
      returnClock: dry && returnsWithin6h ? fmtClock(nc.nowMs + dry.toMin * 60_000) : null,
      endClock,
    };
  }
  if (nc.nextRainInMin != null) {
    const onset = nc.steps.find((s) => s.minutes === nc.nextRainInMin) ?? nc.steps[0];
    const endMin = runEndMin(nc, nc.nextRainInMin);
    const beyondSkill = nc.nextRainInMin > SKILL_HORIZON_MIN;
    return {
      kind: 'coming',
      inMin: nc.nextRainInMin,
      onsetClock: fmtClock(onset.timestamp.getTime()),
      // Jenseits des Skill-Horizonts keine minutengenaue Ende-Aussage rendern.
      endClock: !beyondSkill && endMin != null && endMin < 360 ? fmtClock(nc.nowMs + endMin * 60_000) : null,
      intensity: intensityLabel(intensityBand(onset.mmH)),
      character: nc.summary.character,
      beyondSkill,
    };
  }
  return { kind: 'dry' };
}

/** Headline-Teil für „coming": „23 Minuten" / „1 Std 20". */
export function leadLabel(min: number): string {
  if (min < 60) return `${min} Minuten`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} Stunde${h > 1 ? 'n' : ''}` : `${h} Std ${m}`;
}

/** Uhrzeit „HH:MM". */
export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Relative Dauer „in 23 min" / „in 1 h 57". */
export function fmtRelMin(min: number): string {
  if (min <= 0) return 'jetzt';
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m}`;
}

/** Dauer „47 min" / „1 h 30". */
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/** Quellen-/Aktualitäts-Label (NFR Datenaktualität). */
export function sourceLabel(nc: Nowcast): string {
  if (nc.hasRadar && nc.radarSource) {
    return `DWD RADOLAN-RV · ICON-D2 · Radar ${fmtClock(nc.runAtMs)}`;
  }
  return `ICON-D2 (2,2 km) · ${fmtClock(nc.fetchedAtMs)}`;
}

/** mm/h hübsch (deutsches Komma). */
export function fmtMmH(mmH: number): string {
  return `${(Math.round(mmH * 10) / 10).toString().replace('.', ',')} mm/h`;
}

/** Erwartetes Aktualisierungsintervall (min) — Radar ≈ 5 min, wir markieren ab 2×. */
export const REFRESH_INTERVAL_MIN = 15;

export interface Freshness { ageMin: number; label: string; stale: boolean }

/** Aktualität der Daten (US-A5): Alter seit Radar-/Modelllauf + Veraltet-Flag (> Intervall × 2). */
export function freshness(nc: Nowcast, nowRealMs: number = Date.now()): Freshness {
  const ref = nc.hasRadar && nc.runAtMs ? nc.runAtMs : nc.fetchedAtMs;
  const ageMin = Math.max(0, Math.round((nowRealMs - ref) / 60_000));
  const stale = ageMin > REFRESH_INTERVAL_MIN * 2;
  const label = ageMin < 1 ? 'gerade aktualisiert' : `aktualisiert vor ${ageMin} min`;
  return { ageMin, label, stale };
}
