/**
 * Datenmodell für die Event-Planung („Welcher Tag passt am besten?").
 *
 * KERN-US1 erfasst nur die EINGABE: Anlass, Ort, Zeitfenster (Datumsbereich ODER
 * konkrete Einzeltermine). Die Wetter-Bewertung/Empfehlung folgt in späteren
 * Stories und nutzt die bestehende Punktforecast-Pipeline (keine neue Quelle).
 */

import type { Location } from '../types';
import { isDrawnZone, type EventZone } from './eventZone';

/** Vordefinierter Anlass. `id: 'custom'` = frei beschriebener Anlass. */
export interface EventActivity {
  id: string;
  label: string;
  emoji: string;
  /** Kurzer Hinweis aufs ideale Wetter (rein informativ; Gewichtung kommt später). */
  hint: string;
  /** Sehr kurzer Kachel-Tag (2 Faktoren), wie in der Command-Deck-Vorlage. */
  tag: string;
}

// Reihenfolge folgt der Command-Deck-Vorlage: die sechs abgebildeten Anlässe
// führen (Grillen, Hochzeit, Wandern, Drohne, Fotografie, Sterne), danach die
// übrigen Bestands-Anlässe — kein Anlass entfällt (Funktionserhalt).
export const EVENT_ACTIVITIES: EventActivity[] = [
  { id: 'bbq', label: 'Grillen', emoji: '🔥', hint: 'warm, trocken, windstill', tag: 'warm · trocken' },
  { id: 'wedding', label: 'Hochzeit', emoji: '💍', hint: 'trocken, warm, festlich', tag: '3 Phasen' },
  { id: 'hiking', label: 'Wandern', emoji: '🥾', hint: 'trocken, mild, gute Sicht', tag: 'Sicht · Wind' },
  { id: 'drone', label: 'Drohne', emoji: '🛩️', hint: 'schwache Böen, gute Sicht, trocken', tag: 'Böen · Sicht' },
  { id: 'photo', label: 'Fotografie', emoji: '📷', hint: 'Lichtstimmung, weiches Wolkenlicht', tag: 'Licht · Wolken' },
  { id: 'stargazing', label: 'Sterne', emoji: '🔭', hint: 'klar, wolkenlos, nachts', tag: 'klar · dunkel' },
  { id: 'cycling', label: 'Radtour', emoji: '🚲', hint: 'wenig Wind & Regen', tag: 'wenig Wind' },
  { id: 'picnic', label: 'Picknick', emoji: '🧺', hint: 'mild, trocken, sonnig', tag: 'mild · trocken' },
  { id: 'running', label: 'Laufen', emoji: '🏃', hint: 'kühl, trocken', tag: 'kühl · trocken' },
  { id: 'swimming', label: 'Baden', emoji: '🏊', hint: 'heiß & sonnig', tag: 'heiß · sonnig' },
];

/** Anlass für einen frei eingegebenen Text. */
export function customActivity(label: string): EventActivity {
  return { id: 'custom', label: label.trim(), emoji: '✨', hint: '', tag: 'eigener Anlass' };
}

/** Planungs-Horizont in Tagen ab heute (deckt MOSMIX-Punktforecast ab). */
export const EVENT_HORIZON_DAYS = 7;

/** Zeitfenster: zusammenhängender Bereich ODER eine Liste konkreter Termine. */
export type TimeWindow =
  | { mode: 'range'; from: string; to: string } // ISO yyyy-mm-dd, from ≤ to
  | { mode: 'dates'; dates: string[] };          // ISO yyyy-mm-dd, ≥ 1, sortiert

/** Tageszeit-Fenster — die Bewertung bezieht sich NUR auf diese Stunden (WIN-US1). */
export type Daypart = 'allday' | 'morning' | 'afternoon' | 'evening' | 'night';

export interface DaypartDef {
  id: Daypart;
  label: string;
  /** Stundenfenster [start, end). end ≤ start ⇒ über Mitternacht (Kernnacht). */
  hours: [number, number];
  hint: string;
}

export const DAYPARTS: DaypartDef[] = [
  { id: 'allday', label: 'Ganzer Tag', hours: [8, 20], hint: '8–20 Uhr' },
  { id: 'morning', label: 'Vormittag', hours: [8, 12], hint: '8–12 Uhr' },
  { id: 'afternoon', label: 'Nachmittag', hours: [12, 18], hint: '12–18 Uhr' },
  { id: 'evening', label: 'Abend', hours: [18, 23], hint: '18–23 Uhr' },
  { id: 'night', label: 'Kernnacht', hours: [22, 4], hint: '22–4 Uhr' },
];

export function daypartHours(id: Daypart): [number, number] {
  return (DAYPARTS.find((d) => d.id === id) ?? DAYPARTS[0]).hours;
}
export function daypartLabel(id: Daypart): string {
  return (DAYPARTS.find((d) => d.id === id) ?? DAYPARTS[0]).label;
}
/** Lesbares Fenster, z. B. „Nachmittag · 12–18 Uhr". */
export function daypartText(id: Daypart): string {
  const d = DAYPARTS.find((x) => x.id === id) ?? DAYPARTS[0];
  return `${d.label} · ${d.hint}`;
}
/** Sinnvolle Vorauswahl: Sterne schauen → Kernnacht, sonst ganzer Tag. */
export function defaultDaypartFor(activityId: string): Daypart {
  return activityId === 'stargazing' ? 'night' : 'allday';
}

// --- Phasen (WIN-US2) ----------------------------------------------------------

/** Eine benannte Event-Phase mit eigenem Stundenfenster (z. B. Trauung 13–15 Uhr). */
export interface EventPhase {
  id: string;
  label: string;
  /** [start, end). end ≤ start ⇒ über Mitternacht. */
  hours: [number, number];
}

let _phaseSeq = 0;
export function newPhaseId(): string { return `ph${++_phaseSeq}`; }

/** Phase aus einem Tageszeit-Preset. */
export function daypartPhase(id: Daypart): EventPhase {
  const d = DAYPARTS.find((x) => x.id === id) ?? DAYPARTS[0];
  return { id: newPhaseId(), label: d.label, hours: [d.hours[0], d.hours[1]] };
}

/** Hochzeits-Vorlage: drei typische Phasen. */
export const WEDDING_PHASES: Array<{ label: string; hours: [number, number] }> = [
  { label: 'Trauung', hours: [13, 15] },
  { label: 'Empfang', hours: [15, 18] },
  { label: 'Abendfeier', hours: [18, 23] },
];
export function weddingPhases(): EventPhase[] {
  return WEDDING_PHASES.map((p) => ({ id: newPhaseId(), label: p.label, hours: [p.hours[0], p.hours[1]] as [number, number] }));
}

/** Standard-Phasen für einen Anlass (eine Phase aus dem passenden Tageszeit-Preset). */
export function defaultPhasesFor(activityId: string): EventPhase[] {
  if (activityId === 'wedding') return weddingPhases();
  return [daypartPhase(defaultDaypartFor(activityId))];
}

export function phaseValid(p: EventPhase): boolean {
  const [a, b] = p.hours;
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a <= 24 && b >= 0 && b <= 24 && a !== b;
}

/** Lesbares Stundenfenster, z. B. „13–15 Uhr". */
export function fmtPhaseHours(h: [number, number]): string {
  return `${h[0]}–${h[1]} Uhr`;
}

/** Späteste Stunde (in den letzten Tag hineingerechnet) über alle Phasen — für die Datenabdeckung. */
export function phasesLatestHour(phases: EventPhase[]): number {
  return phases.reduce((mx, p) => {
    const end = p.hours[0] >= p.hours[1] ? 24 + p.hours[1] : p.hours[1];
    return Math.max(mx, end);
  }, 8);
}

/** Anpassbare Preset-Vorgaben (PRE-US2) — Schwellwerte ans eigene Empfinden justierbar. */
export interface PresetTuning {
  /** Wohlfühl-Temperatur [von, bis] in °C. */
  idealTemp: [number, number];
  /** Wichtigkeit je Faktor 0..1. */
  weights: { precip: number; temp: number; wind: number; cloud: number };
}

// --- Plan B / Ausweich-Logik (Epic PLANB) -------------------------------------

/** Worauf sich die Plan-B-Schwelle bezieht (PLANB-US1). */
export type PlanBMetric = 'rain' | 'wind' | 'score';

/** Die Ausweich-Option, die der Gastgeber bereithält (steuert die Empfehlung, US2). */
export type PlanBVenue = 'tent' | 'indoor' | 'shelter' | 'none';

export interface PlanBMetricDef {
  id: PlanBMetric;
  label: string;
  /** Einheit der Schwelle. */
  unit: string;
  /** Wird ausgelöst, wenn der Wert die Schwelle ÜBERschreitet ('above')
   *  bzw. UNTERschreitet ('below', z. B. Gesamt-Score). */
  direction: 'above' | 'below';
  /** Erlaubte Spannweite + Schritt für den Schwellen-Regler. */
  min: number; max: number; step: number;
  /** Sinnvolle Voreinstellung. */
  default: number;
  hint: string;
}

export const PLANB_METRICS: PlanBMetricDef[] = [
  { id: 'rain', label: 'Regenmenge im Fenster', unit: 'mm', direction: 'above', min: 0.5, max: 15, step: 0.5, default: 3, hint: 'Plan B ab dieser Niederschlagssumme' },
  { id: 'wind', label: 'Windböen', unit: 'm/s', direction: 'above', min: 6, max: 25, step: 1, default: 13, hint: 'Plan B ab dieser Spitzenböe (Zelt/Pavillon)' },
  { id: 'score', label: 'Gesamtbewertung', unit: 'Punkte', direction: 'below', min: 30, max: 80, step: 5, default: 50, hint: 'Plan B, wenn der Wunschtag schlechter bewertet ist' },
];

export function planBMetricDef(id: PlanBMetric): PlanBMetricDef {
  return PLANB_METRICS.find((m) => m.id === id) ?? PLANB_METRICS[0];
}

export interface PlanBVenueDef {
  id: PlanBVenue;
  emoji: string;
  label: string;
  /** Kurzbeschreibung des Ausweichplans. */
  hint: string;
}

export const PLANB_VENUES: PlanBVenueDef[] = [
  { id: 'tent', emoji: '⛺', label: 'Zelt / Pavillon', hint: 'wetterfeste Überdachung vor Ort' },
  { id: 'indoor', emoji: '🏠', label: 'Innenraum / Halle', hint: 'nach drinnen verlegen' },
  { id: 'shelter', emoji: '☂️', label: 'Unterstand', hint: 'überdachter Bereich / Schirme' },
  { id: 'none', emoji: '🔔', label: 'Nur warnen', hint: 'kein fester Plan B — nur Hinweis' },
];

export function planBVenueDef(id: PlanBVenue): PlanBVenueDef {
  return PLANB_VENUES.find((v) => v.id === id) ?? PLANB_VENUES[0];
}

/** Plan-B-Konfiguration (PLANB-US1) — Schwelle, Ausweich-Option, Wunschtag. */
export interface PlanBConfig {
  /** Plan-B-Logik überhaupt aktiv? */
  enabled: boolean;
  metric: PlanBMetric;
  /** Schwellwert (Bedeutung je `metric`/Einheit). */
  threshold: number;
  /** Welche Ausweich-Option der Gastgeber hat (steuert die Empfehlung). */
  venue: PlanBVenue;
  /** Wunschtag (ISO) — Bezugstag für Schwelle/Ausweichtag (US3). null = bester Tag. */
  wishDate: string | null;
}

export function defaultPlanB(): PlanBConfig {
  const m = planBMetricDef('rain');
  return { enabled: false, metric: 'rain', threshold: m.default, venue: 'tent', wishDate: null };
}

export interface EventQuery {
  activity: EventActivity;
  location: Location;
  /**
   * Optionale Event-Fläche (EZ). Der `location`-Punkt bleibt der Anker der
   * Bewertung; die Zone ergänzt eine Spanne über das Gelände (`eventZone.ts`).
   */
  zone?: EventZone | null;
  window: TimeWindow;
  /** Eine oder mehrere Phasen mit je eigenem Zeitfenster. */
  phases: EventPhase[];
  /** Anlass-Vorgaben (ggf. vom Nutzer feinjustiert). */
  tuning: PresetTuning;
  /** Plan-B-/Ausweich-Schwelle (Epic PLANB). */
  planB: PlanBConfig;
}

// --- Datums-Helfer (lokale Zeit; ISO yyyy-mm-dd) -------------------------------

/** Heute als ISO yyyy-mm-dd (lokal). */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Letzter wählbarer Tag (heute + Horizont) als ISO. */
export function horizonEndISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + EVENT_HORIZON_DAYS);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lesbares Datum, z. B. „Mo., 3. Juni". */
export function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

// --- Validierung ---------------------------------------------------------------

/** Ist das Zeitfenster vollständig + plausibel (innerhalb des Horizonts)? */
export function isWindowValid(w: TimeWindow): boolean {
  const min = todayISO();
  const max = horizonEndISO();
  if (w.mode === 'range') {
    return !!w.from && !!w.to && w.from >= min && w.to <= max && w.from <= w.to;
  }
  return w.dates.length > 0 && w.dates.every((d) => d >= min && d <= max);
}

/** Sind alle Pflichtangaben (Anlass, Ort, gültiges Zeitfenster) gesetzt? */
export function isQueryComplete(q: Partial<EventQuery>): q is EventQuery {
  return (
    !!q.activity && (q.activity.id !== 'custom' || q.activity.label.length > 0) &&
    !!q.location &&
    !!q.window && isWindowValid(q.window) &&
    !!q.phases && q.phases.length >= 1 && q.phases.every(phaseValid) &&
    !!q.tuning &&
    !!q.planB &&
    (q.zone == null || isDrawnZone(q.zone))
  );
}
