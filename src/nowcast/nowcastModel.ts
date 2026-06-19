/**
 * Feature „Regen für die nächsten 6 Stunden" (Nowcast) — Datenmodell.
 *
 * Reine Typen + Klassifikations-/Farbhelfer. Die Werte stammen aus der
 * bestehenden Kartendaten-Pipeline: DWD-RADOLAN-RV-Radar (0–2 h, 5-Min-Frames)
 * für den Nahbereich und der ICON-D2-Punktforecast (2–6 h) — zusammengeführt in
 * `nowcastEngine.ts`. Bewusst ehrlich: jede Stufe trägt Quelle + Konfidenz, und
 * jenseits des Radar-Skill-Horizonts (~2 h) gibt es keine minutengenaue Aussage.
 */

/** Horizont der Vorhersage in Minuten (6 h). */
export const NOWCAST_HORIZON_MIN = 360;
/** Zeitliche Auflösung der Serie in Minuten. */
export const NOWCAST_STEP_MIN = 15;
/** Radar-Skill-Horizont — bis hierhin minutengenaue Radar-Extrapolation. */
export const SKILL_HORIZON_MIN = 120;
/** Übergangszone, in der Radar → Modell überblendet wird. */
export const BLEND_FROM_MIN = 90;
export const BLEND_TO_MIN = 150;

/** Welche Quelle die Stufe dominiert. */
export type NowcastSource = 'radar' | 'blend' | 'nwp';

/** Niederschlagsphase pro Zeitschritt (US-B1). */
export type StepPhase = 'dry' | 'rain' | 'snow' | 'sleet' | 'freezing';
/** Charakter pro Zeitschritt (US-B5): Schauer (konvektiv) vs. Dauerregen (stratiform). */
export type StepCharacter = 'showery' | 'steady' | null;

export interface NowcastStep {
  index: number;
  /** Versatz von „jetzt" in Minuten. */
  minutes: number;
  timestamp: Date;
  /** Wahrscheinlichste Intensität (mm/h). */
  mmH: number;
  /** Unteres/oberes Konfidenzband (mm/h). */
  mmHMin: number;
  mmHMax: number;
  source: NowcastSource;
  /** 0..1 — Radar nah hoch, Modell fern niedrig. */
  confidence: number;
  /** Niederschlagsphase an diesem Schritt (US-B1). */
  phase: StepPhase;
  /** Charakter (US-B5) — null wenn trocken. */
  character: StepCharacter;
  /** Temperatur (°C) am Standort, interpoliert — Basis der Phasen-Klassifikation. */
  tempC: number | null;
  /** Schneefallgrenze (m) an diesem Schritt — null wenn Quelle sie nicht trägt. */
  snowLineM: number | null;
  /** Starkregen-Schwelle überschritten (US-B4). */
  heavy: boolean;
}

// --- Phase-Helfer (US-B1) -----------------------------------------------------

export function phaseLabelStep(p: StepPhase): string {
  switch (p) {
    case 'rain': return 'Regen';
    case 'snow': return 'Schnee';
    case 'sleet': return 'Schneeregen';
    case 'freezing': return 'gefrierender Regen';
    case 'dry': return 'trocken';
  }
}

/** Farbe je Phase (eigene Palette, gefrierender Regen als Warnsignal). */
export function phaseColor(p: StepPhase): string {
  switch (p) {
    case 'rain': return '#3A6FA8';
    case 'snow': return '#6B7A8F';
    case 'sleet': return '#7C8BA0';
    case 'freezing': return '#C0392B';
    case 'dry': return '#E3DCCB';
  }
}

// --- Intensitäts-Klassifikation (DWD-nahe Schwellen, mm/h) --------------------

export type IntensityBand = 'dry' | 'light' | 'moderate' | 'strong' | 'severe';

export function intensityBand(mmH: number): IntensityBand {
  if (mmH < 0.1) return 'dry';
  if (mmH < 1) return 'light';
  if (mmH < 2.5) return 'moderate';
  if (mmH < 10) return 'strong';
  return 'severe';
}

export function intensityLabel(b: IntensityBand): string {
  switch (b) {
    case 'dry': return 'trocken';
    case 'light': return 'leicht';
    case 'moderate': return 'mäßig';
    case 'strong': return 'stark';
    case 'severe': return 'sehr stark';
  }
}

/** Farben der Intensitätsskala (kein reines Rot-Grün; mit Legende, NFR-Barrierearmut). */
export function intensityColor(b: IntensityBand): string {
  switch (b) {
    case 'dry': return '#E3DCCB';
    case 'light': return '#9DC3E6';
    case 'moderate': return '#3A6FA8';
    case 'strong': return '#28507A';
    case 'severe': return '#6B3FA0';
  }
}

/** Skala für Legenden (mit mm/h-Spannen). */
export const INTENSITY_SCALE: Array<{ band: IntensityBand; label: string; range: string }> = [
  { band: 'dry', label: 'trocken', range: '< 0,1' },
  { band: 'light', label: 'leicht', range: '0,1–1' },
  { band: 'moderate', label: 'mäßig', range: '1–2,5' },
  { band: 'strong', label: 'stark', range: '2,5–10' },
  { band: 'severe', label: 'sehr stark', range: '> 10' },
];

// --- Phase / Zusammenfassung --------------------------------------------------

export type Phase = 'dry' | 'rain' | 'shower' | 'snow' | 'sleet';

export interface NowcastSummary {
  phase: Phase;
  phaseLabel: string;
  /** „Schauer-Charakter", „gleichmäßig", „konvektiv" … */
  character: string;
  /** Niederschlagssumme über 6 h (mm) — wahrscheinlich + Band. */
  sumMm: number;
  sumMinMm: number;
  sumMaxMm: number;
  /** Gewitterrisiko 0..100 (heuristisch, ohne CAPE → bewusst konservativ). */
  thunderRiskPct: number;
  thunderLabel: string;
  /** Hagelrisiko 0..100 — eigenes Signal (US-B3), an Gewitter + Intensität gekoppelt. */
  hailRiskPct: number;
  /** Starkregen-/Unwetter-Signal (US-B4) — an DWD-Warnstufen orientiert. */
  heavyRain: boolean;
  /** Höchste erwartete Rate (mm/h) — Bezug für das Starkregen-Signal. */
  peakMmH: number;
  /** Schneefallgrenze (m ü. NN) — null, wenn die Quelle sie nicht trägt (oft DE). */
  snowLineM: number | null;
  snowLineNote: string;
  /** Dominante Phase über das Fenster (für Karten/Kennzahl). */
  dominantPhase: StepPhase;
  /** Phasenübergänge im 6-h-Fenster (US-B1 AK2). */
  phaseTransitions: PhaseTransition[];
}

export interface PhaseTransition {
  atMinutes: number;
  timestamp: Date | null;
  from: StepPhase;
  to: StepPhase;
}

export type EventKind = 'rain-start' | 'rain-end' | 'shower' | 'peak' | 'thunder' | 'beyond-skill';
export type EventTone = 'info' | 'good' | 'warn' | 'alert' | 'muted';

export interface NowcastEvent {
  kind: EventKind;
  title: string;
  detail: string;
  /** Versatz von „jetzt" in Minuten (für Sortierung/Anzeige). */
  atMinutes: number;
  timestamp: Date | null;
  tone: EventTone;
}

export interface DryWindow {
  fromMin: number;
  toMin: number;
  durationMin: number;
}

export interface Nowcast {
  steps: NowcastStep[];
  summary: NowcastSummary;
  events: NowcastEvent[];
  /** Regnet es jetzt (Stufe 0 ≥ leicht)? */
  currentlyRaining: boolean;
  /** Minuten bis zum nächsten Regenbeginn (null, wenn es regnet oder 6 h trocken). */
  nextRainInMin: number | null;
  /** Erstes Trockenfenster nach laufendem Regen. */
  dryWindow: DryWindow | null;
  skillHorizonMin: number;
  /** Tatsächlich verfügbarer Radar-Horizont (Minuten). */
  radarValidMin: number;
  hasRadar: boolean;
  /** Quelle des Radars (z. B. 'radolan_rv'); leer ohne Radar. */
  radarSource: string;
  /** Bezugszeitpunkt „jetzt" (ms). */
  nowMs: number;
  /** Radar-/Modelllauf-Zeitstempel (ms) für die Aktualitäts-Anzeige. */
  runAtMs: number;
  fetchedAtMs: number;
  /** Höhe des Standorts (m ü. M.) — für die alpine Tal/Grat-Trennung (US-F1). */
  elevationM: number | null;
  /** Temperatur-Höhengradient (°C/m, i. d. R. negativ) für die Grat-Hochrechnung. */
  lapseRatePerM: number | null;
}

/** Schwellen für „nass" (leichter Regen) in mm/h. */
export const WET_MMH = 0.1;
/** Schwelle für „kräftig" (Spitzen-Marker). */
export const HEAVY_MMH = 2.5;
/** Starkregen-/Unwetter-Schwelle (mm/h) — an DWD-Warnstufe markante Wetterlage. */
export const STARKREGEN_MMH = 5;
/** Starkregen über die 6-h-Summe (mm) — Dauerregen-Schwelle. */
export const STARKREGEN_SUM_MM = 15;
