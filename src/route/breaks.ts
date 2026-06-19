/**
 * Pausen-Konfiguration und -Berechnung.
 *
 *  – Auto-Pausen: Intervall je Bewegungsart (zeit- oder distanzbasiert)
 *  – Mahlzeiten-Pause: eigene Kategorie mit längerer Dauer (Mittags-Slot)
 *  – Custom-Pausen: an konkreten Streckenpunkten (Map-Klick oder Wegpunkt)
 *
 * Liefert die Pausen-Ereignisse mit Position (Distanz) für Karte/Timeline und
 * die Gesamt-Pausenzeit, die in die Tourdauer einfließt.
 */

import { cumulativeMovingSeconds, type DurationModel, type SegmentCtxProvider, type SpeedProfile } from './speedModel';
import type { MovementId } from './movementTypes';
import type { TourPoint } from './tourTrack';

export interface BreakDefault {
  autoEnabled: boolean;
  mode: 'time' | 'distance';
  /** Intervall in Minuten (mode=time) bzw. Kilometern (mode=distance). */
  intervalValue: number;
  durationMin: number;
  mealEnabled: boolean;
  mealDurationMin: number;
}

export const BREAK_DEFAULTS: Record<MovementId, BreakDefault> = {
  wandern:     { autoEnabled: true,  mode: 'time',     intervalValue: 120, durationMin: 15, mealEnabled: true,  mealDurationMin: 45 },
  bergwandern: { autoEnabled: true,  mode: 'time',     intervalValue: 120, durationMin: 20, mealEnabled: true,  mealDurationMin: 45 },
  jogging:     { autoEnabled: false, mode: 'time',     intervalValue: 45,  durationMin: 5,  mealEnabled: false, mealDurationMin: 30 },
  trail:       { autoEnabled: false, mode: 'time',     intervalValue: 60,  durationMin: 8,  mealEnabled: false, mealDurationMin: 30 },
  rennrad:     { autoEnabled: true,  mode: 'distance', intervalValue: 50,  durationMin: 10, mealEnabled: false, mealDurationMin: 30 },
  gravel:      { autoEnabled: true,  mode: 'distance', intervalValue: 40,  durationMin: 12, mealEnabled: true,  mealDurationMin: 30 },
  mtb:         { autoEnabled: true,  mode: 'distance', intervalValue: 25,  durationMin: 12, mealEnabled: true,  mealDurationMin: 30 },
  ebike:       { autoEnabled: true,  mode: 'distance', intervalValue: 40,  durationMin: 12, mealEnabled: true,  mealDurationMin: 30 },
};

export type BreakKind = 'rest' | 'meal' | 'custom';

export interface CustomBreak {
  id: string;
  dist: number;
  durationMin: number;
  kind: 'rest' | 'meal';
  label?: string;
}

export interface BreakConfig {
  autoEnabled: boolean;
  mode: 'time' | 'distance';
  intervalValue: number;
  durationMin: number;
  mealEnabled: boolean;
  mealAfterMin: number;   // nach so vielen Minuten Bewegung (Mittags-Slot)
  mealDurationMin: number;
  custom: CustomBreak[];
}

export interface BreakEvent {
  dist: number;
  durationSec: number;
  kind: BreakKind;
  label: string;
}

export function defaultBreakConfig(d: BreakDefault): BreakConfig {
  return {
    autoEnabled: d.autoEnabled,
    mode: d.mode,
    intervalValue: d.intervalValue,
    durationMin: d.durationMin,
    mealEnabled: d.mealEnabled,
    mealAfterMin: 180,
    mealDurationMin: d.mealDurationMin,
    custom: [],
  };
}

/** Distanz (m) am Punkt, dessen kumulierte Bewegungszeit `targetSec` erreicht. */
function distAtMovingTime(points: TourPoint[], cumSec: number[], targetSec: number): number | null {
  if (targetSec >= cumSec[cumSec.length - 1]) return null; // jenseits des Ziels
  for (let i = 1; i < cumSec.length; i++) {
    if (cumSec[i] >= targetSec) return points[i].dist;
  }
  return null;
}

export function computeBreaks(
  points: TourPoint[],
  profile: SpeedProfile,
  model: DurationModel,
  cfg: BreakConfig,
  ctxFor?: SegmentCtxProvider,
): { events: BreakEvent[]; totalSec: number } {
  const events: BreakEvent[] = [];
  const totalDist = points.length ? points[points.length - 1].dist : 0;
  const cumSec = cumulativeMovingSeconds(points, profile, model, ctxFor);
  const movingSec = cumSec[cumSec.length - 1] ?? 0;

  // Auto-Pausen in Intervallen (zeit- oder distanzbasiert).
  if (cfg.autoEnabled && cfg.intervalValue > 0) {
    if (cfg.mode === 'time') {
      const stepSec = cfg.intervalValue * 60;
      for (let t = stepSec; t < movingSec; t += stepSec) {
        const dist = distAtMovingTime(points, cumSec, t);
        if (dist != null) events.push({ dist, durationSec: cfg.durationMin * 60, kind: 'rest', label: 'Pause' });
      }
    } else {
      const stepM = cfg.intervalValue * 1000;
      for (let d = stepM; d < totalDist; d += stepM) {
        events.push({ dist: d, durationSec: cfg.durationMin * 60, kind: 'rest', label: 'Pause' });
      }
    }
  }

  // Mahlzeiten-Pause (Mittags-Slot), falls die Tour lang genug ist.
  if (cfg.mealEnabled) {
    const dist = distAtMovingTime(points, cumSec, cfg.mealAfterMin * 60);
    if (dist != null) events.push({ dist, durationSec: cfg.mealDurationMin * 60, kind: 'meal', label: 'Mittagspause' });
  }

  // Custom-Pausen.
  for (const c of cfg.custom) {
    events.push({
      dist: c.dist,
      durationSec: c.durationMin * 60,
      kind: c.kind === 'meal' ? 'meal' : 'custom',
      label: c.label ?? (c.kind === 'meal' ? 'Mahlzeit' : 'Pause'),
    });
  }

  events.sort((a, b) => a.dist - b.dist);
  const totalSec = events.reduce((s, e) => s + e.durationSec, 0);
  return { events, totalSec };
}

// ---------------------------------------------------------------------------
// Auto-Detection von Pausen aus Wegpunkt-Namen
// ---------------------------------------------------------------------------
export type DetectedKind = 'meal' | 'rest';

export interface BreakHint {
  kind: DetectedKind;
  durationMin: number;
  /** Treffer-Schlüsselwort. */
  matchedKeyword: string;
  /** Vorschlag-Label fürs UI („Mittagspause", „Hütte", „Aussicht"). */
  preset: string;
}

interface HintRule {
  keywords: string[];
  kind: DetectedKind;
  durationMin: number;
  preset: string;
}

// Reihenfolge wichtig: Mahlzeiten zuerst, dann spezifische Pausen-Kategorien
// (Brunnen, Aussicht) vor der breiten Hütten-Regel (sonst kapert z. B. „alm"
// in „Hochalm" eine eigentliche Trinkpause). Allgemeine „Pause/Rast" zuletzt.
const HINT_RULES: HintRule[] = [
  { keywords: ['mittag', 'lunch'],                                                kind: 'meal', durationMin: 45, preset: 'Mittagspause' },
  { keywords: ['essen', 'mensa', 'restaurant', 'gasthaus', 'gasthof', 'wirtshaus', 'jausenstation'], kind: 'meal', durationMin: 45, preset: 'Mahlzeit' },
  { keywords: ['café', 'cafe', 'kaffee', 'einkehr', 'kuchen'],                    kind: 'meal', durationMin: 30, preset: 'Einkehr' },
  { keywords: ['trinken', 'trinkpause', 'brunnen', 'quelle', 'wasserstelle'],     kind: 'rest', durationMin: 10, preset: 'Trinkpause' },
  { keywords: ['aussicht', 'aussichtspunkt', 'panorama', 'viewpoint', 'gipfelkreuz'], kind: 'rest', durationMin: 10, preset: 'Aussicht' },
  { keywords: ['hütte', 'huette', 'berghütte', 'alm', 'schutzhaus', 'schutzhütte', 'biwak', 'hospiz'], kind: 'rest', durationMin: 25, preset: 'Hütte' },
  { keywords: ['rastplatz', 'rast', 'pause', 'bank', 'bench'],                    kind: 'rest', durationMin: 15, preset: 'Pause' },
];

/** Erkennt aus einem Wegpunkt-Namen einen Pausen-Vorschlag mit Typ und Dauer. */
export function detectBreakFromName(name?: string): BreakHint | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const rule of HINT_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return { kind: rule.kind, durationMin: rule.durationMin, matchedKeyword: kw, preset: rule.preset };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verifikation der Auto-Detection
// ---------------------------------------------------------------------------
export interface HintCheck {
  name: string;
  expected: DetectedKind | null;
  actual: DetectedKind | null;
  matchedKeyword: string | null;
  preset: string | null;
  ok: boolean;
}

const HINT_TEST_CASES: Array<{ name: string; expected: DetectedKind | null; expectedPreset?: string }> = [
  // Mahlzeiten
  { name: 'Mittagspause Almhütte',     expected: 'meal', expectedPreset: 'Mittagspause' },
  { name: 'Gasthaus Sonnalm',          expected: 'meal', expectedPreset: 'Mahlzeit' },
  { name: 'Café Kaiser',               expected: 'meal', expectedPreset: 'Einkehr' },
  { name: 'Jausenstation Wiesalm',     expected: 'meal', expectedPreset: 'Mahlzeit' },
  // Spezifische Rest-Kategorien (vor Hütte!)
  { name: 'Trinkbrunnen Hochalm',      expected: 'rest', expectedPreset: 'Trinkpause' }, // „brunnen" gewinnt vor „alm"
  { name: 'Aussichtspunkt Karwendel',  expected: 'rest', expectedPreset: 'Aussicht' },
  { name: 'Gipfelkreuz',               expected: 'rest', expectedPreset: 'Aussicht' },
  { name: 'Trinkbrunnen',              expected: 'rest', expectedPreset: 'Trinkpause' },
  // Hütten / Schutzbauten
  { name: 'Hütte Stripsenjoch',        expected: 'rest', expectedPreset: 'Hütte' },
  { name: 'Berghütte Adlerwiese',      expected: 'rest', expectedPreset: 'Hütte' },
  { name: 'Schutzhaus Brunnstein',     expected: 'rest', expectedPreset: 'Hütte' },
  { name: 'Biwakschachtel',            expected: 'rest', expectedPreset: 'Hütte' },
  { name: 'Wiesalm',                   expected: 'rest', expectedPreset: 'Hütte' },     // „alm" allein → Hütte
  // Allgemeine Pause
  { name: 'Pause am See',              expected: 'rest', expectedPreset: 'Pause' },
  // Keine Erkennung
  { name: 'Wegweiser',                 expected: null },
  { name: 'Parkplatz',                 expected: null },
  { name: 'Kreuzung Forstweg',         expected: null },
  { name: '',                          expected: null },
];

export interface HintVerifyResult {
  checks: HintCheck[];
  passed: number;
  failed: number;
}

export function verifyBreakHints(): HintVerifyResult {
  const checks: HintCheck[] = HINT_TEST_CASES.map(({ name, expected, expectedPreset }) => {
    const hit = detectBreakFromName(name);
    const actual = hit?.kind ?? null;
    const kindOk = actual === expected;
    const presetOk = expectedPreset == null || hit?.preset === expectedPreset;
    return {
      name, expected, actual,
      matchedKeyword: hit?.matchedKeyword ?? null,
      preset: hit?.preset ?? null,
      ok: kindOk && presetOk,
    };
  });
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyBreakHints: typeof verifyBreakHints }).__verifyBreakHints = verifyBreakHints;
}
