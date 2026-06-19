/**
 * Epic PUSH — reine Auslöser-Logik (Triggers).
 *
 * Jede Funktion bekommt frische Wetterdaten + den letzten bekannten Zustand und
 * liefert *Entwürfe* (`NotificationDraft`) für mögliche Benachrichtigungen. Sie
 * entscheidet NICHT über Zustellung/Drosselung — das macht der Engine
 * (`notificationEngine.ts`). So bleiben die Trigger pur und testbar und könnten
 * unverändert serverseitig laufen, sobald ein Backend existiert.
 *
 * PUSH-US2: `detectBestDayChange` — Wechsel des besten Tags.
 * PUSH-US3: `detectClearNights` — aufkommende klare Nacht (Astro).
 */

import type { PointForecast } from '../pointForecast/types';
import type { EventRecommendation } from '../event/eventScoring';
import { toISODate } from '../event/eventModel';
import type { NotificationKind } from './notificationModel';

/** Ein noch nicht zugestellter Benachrichtigungs-Entwurf. */
export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Tag, um den es geht (ISO) — für Dedup „nicht zweimal pro Tag" (PUSH-US4). */
  aboutDate: string | null;
}

// --- PUSH-US2: Wechsel des besten Tags ----------------------------------------

export interface BestDayChangeInput {
  /** Zuletzt gemeldeter bester Tag (ISO) oder null beim ersten Lauf. */
  prevBestDate: string | null;
  prevBestScore: number | null;
  rec: EventRecommendation;
  activityLabel: string;
}

/**
 * Meldet, wenn sich der beste Tag im Fenster geändert hat. Beim ersten Lauf
 * (prevBestDate == null) wird nichts gemeldet — es wird nur die Basislinie
 * gesetzt (der Engine übernimmt das). Beispiel-Text:
 * „Samstag verschlechtert sich – Sonntag ist jetzt besser".
 */
export function detectBestDayChange(input: BestDayChangeInput): NotificationDraft | null {
  const { prevBestDate, rec, activityLabel } = input;
  if (rec.bestIndex < 0) return null;
  const best = rec.days[rec.bestIndex];
  if (!best.summary) return null;
  // Erster Lauf oder unverändert → kein Hinweis (nur Basislinie).
  if (prevBestDate == null || prevBestDate === best.date) return null;

  const newDay = weekday(best.date);
  const oldDay = weekday(prevBestDate);
  // Wie steht der bisher beste Tag jetzt da?
  const prev = rec.days.find((d) => d.date === prevBestDate);
  const prevWorsened = prev?.summary != null && input.prevBestScore != null && prev.score < input.prevBestScore - 3;
  const lead = prevWorsened
    ? `${oldDay} verschlechtert sich – ${newDay} ist jetzt besser`
    : `${newDay} ist jetzt der beste Tag (vorher ${oldDay})`;

  return {
    kind: 'best-day-change',
    title: `Neuer bester Tag für ${activityLabel}`,
    body: `${lead}. ${capitalize(formatLong(best.date))}: Score ${best.score}${best.isTendency ? ' (noch Tendenz)' : ''}.`,
    aboutDate: best.date,
  };
}

// --- PUSH-US3: Klare-Nacht-Alarm (Astro) --------------------------------------

/** Höchstanteil Bewölkung (%), ab dem eine Nacht als „klar" gilt. */
export const CLEAR_NIGHT_MAX_CLOUD = 25;
/** Höchstniederschlag (mm) übers Nachtfenster, damit „klar" plausibel bleibt. */
export const CLEAR_NIGHT_MAX_PRECIP = 0.3;
/** Nachtfenster [Beginn, Ende) — über Mitternacht (22–4 Uhr). */
export const NIGHT_WINDOW: [number, number] = [22, 4];
/** Wie viele kommende Nächte werden vorausgeschaut. */
export const CLEAR_NIGHT_LOOKAHEAD = 3;

export interface NightSummary {
  /** ISO-Datum, an dem die Nacht *beginnt*. */
  date: string;
  cloudMeanPct: number;
  precipSumMm: number;
  tMinC: number;
  hoursCount: number;
}

const isNum = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/**
 * Aggregiert das Nachtfenster (22 Uhr am `date` bis 4 Uhr am Folgetag) aus dem
 * Punktforecast. Unabhängig von der Event-Bewertung, damit der Astro-Alarm auch
 * ohne passenden Anlass funktioniert. Null, wenn zu wenig Stunden vorliegen.
 */
export function nightSummaryFor(forecast: PointForecast, date: string): NightSummary | null {
  const [start, end] = NIGHT_WINDOW;
  const nextDate = toISODate(new Date(new Date(`${date}T00:00:00`).getTime() + 86_400_000));
  const inNight = forecast.hours.filter((h) => {
    const hr = h.timestamp.getHours();
    const d = toISODate(h.timestamp);
    return (d === date && hr >= start) || (d === nextDate && hr < end);
  });
  const clouds = inNight.map((h) => h.cloudCoverTotal).filter(isNum);
  const temps = inNight.map((h) => h.temperature).filter(isNum);
  if (clouds.length < 3) return null; // zu wenig Daten → nicht beurteilbar
  const precip = inNight.reduce((s, h) => s + (h.precipitation ?? 0), 0);
  return {
    date,
    cloudMeanPct: clouds.reduce((s, v) => s + v, 0) / clouds.length,
    precipSumMm: precip,
    tMinC: temps.length ? Math.min(...temps) : NaN,
    hoursCount: inNight.length,
  };
}

/** Ist diese Nacht „klar" im Sinne des Astro-Alarms? */
export function isClearNight(n: NightSummary): boolean {
  return n.cloudMeanPct <= CLEAR_NIGHT_MAX_CLOUD && n.precipSumMm <= CLEAR_NIGHT_MAX_PRECIP;
}

/**
 * Findet die kommenden klaren Nächte (bis `CLEAR_NIGHT_LOOKAHEAD` voraus) und
 * erzeugt je einen Entwurf. Dedup über bereits gemeldete Nächte macht der
 * Engine (PUSH-US4). `fromISO` ist „heute" (lokal).
 */
export function detectClearNights(forecast: PointForecast, fromISO: string, placeName: string): NotificationDraft[] {
  const drafts: NotificationDraft[] = [];
  for (let i = 0; i < CLEAR_NIGHT_LOOKAHEAD; i++) {
    const date = toISODate(new Date(new Date(`${fromISO}T00:00:00`).getTime() + i * 86_400_000));
    const summary = nightSummaryFor(forecast, date);
    if (!summary || !isClearNight(summary)) continue;
    const cloud = Math.round(summary.cloudMeanPct);
    const when = i === 0 ? 'Heute Nacht' : i === 1 ? 'Morgen Nacht' : `Nacht zu ${weekday(nextDayISO(date))}`;
    const cold = isNum(summary.tMinC) ? ` · bis ${Math.round(summary.tMinC)} °C` : '';
    drafts.push({
      kind: 'clear-night',
      title: `🌌 Klare Nacht über ${shortPlace(placeName)}`,
      body: `${when} wird es klar — nur ${cloud} % Wolken${cold}. Gute Sicht für Sterne & Astrofotografie.`,
      aboutDate: date,
    });
  }
  return drafts;
}

// --- kleine Helfer (lokal, ohne externe Abhängigkeit) -------------------------

function nextDayISO(iso: string): string {
  return toISODate(new Date(new Date(`${iso}T00:00:00`).getTime() + 86_400_000));
}
function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long' });
}
function formatLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function shortPlace(name: string): string {
  return name.split(',')[0];
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
