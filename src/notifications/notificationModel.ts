/**
 * Epic PUSH — Datenmodell für Benachrichtigungen.
 *
 * Hier liegt das gesamte (IO-freie) Domänenmodell: was eine Benachrichtigungs-
 * *Subscription* ist, welche *Arten* es gibt, der Dedup-/Drossel-Zustand
 * (PUSH-US4) und die globalen Einstellungen.
 *
 * BACKEND-HINWEIS: Es gibt (noch) kein Backend. Diese Typen sind bewusst rein
 * serialisierbar gehalten (nur einfache Werte, kein Date/Map/Class), damit sie
 * 1:1 über eine REST-API laufen und serverseitig ausgewertet werden können.
 * Die eigentliche Auswertung steckt in `notificationEngine.ts` + `notification
 * Triggers.ts` und ist ebenfalls pur — derselbe Code könnte später in einem
 * Cron-Job/Worker des Backends laufen. Siehe `notificationBackend.ts`.
 */

import type { EventQuery } from '../event/eventModel';
import { candidateDays } from '../event/eventScoring';

// --- Arten von Benachrichtigungen ---------------------------------------------

/** Auslöser-Art einer Benachrichtigung. */
export type NotificationKind = 'best-day-change' | 'clear-night';

export interface NotificationKindMeta {
  kind: NotificationKind;
  emoji: string;
  label: string;
  description: string;
  /** In der Voreinstellung aktiv, wenn man eine Subscription anlegt. */
  defaultEnabled: boolean;
  /** Besonders relevant für diese Anlässe (UI-Hervorhebung), aber nie exklusiv. */
  highlightFor: string[];
}

export const NOTIFICATION_KINDS: NotificationKindMeta[] = [
  {
    kind: 'best-day-change',
    emoji: '🔁',
    label: 'Bester Tag wechselt',
    description: 'Hinweis, wenn sich der beste Tag in deinem Fenster verschiebt — damit du rechtzeitig umplanen kannst.',
    defaultEnabled: true,
    highlightFor: [],
  },
  {
    kind: 'clear-night',
    emoji: '🌌',
    label: 'Klare Nacht (Astro)',
    description: 'Alarm, sobald für deinen Ort eine klare Nacht aufkommt — gute Sicht für Sterne & Astrofotografie.',
    defaultEnabled: false,
    highlightFor: ['stargazing', 'photo'],
  },
];

export function kindMeta(kind: NotificationKind): NotificationKindMeta {
  return NOTIFICATION_KINDS.find((k) => k.kind === kind) ?? NOTIFICATION_KINDS[0];
}

/** Sinnvolle Default-Auswahl an Arten für einen Anlass (PUSH-US1). */
export function defaultKindsFor(activityId: string): NotificationKind[] {
  return NOTIFICATION_KINDS.filter(
    (k) => k.defaultEnabled || k.highlightFor.includes(activityId),
  ).map((k) => k.kind);
}

// --- Subscription (PUSH-US1) ---------------------------------------------------

/** Dedup-/Drossel-Zustand je Subscription (PUSH-US4 — keine Wiederholungen). */
export interface SubscriptionState {
  /** Zuletzt gemeldeter bester Tag (ISO) — Basis für die Wechsel-Erkennung. */
  lastBestDate: string | null;
  /** Score des zuletzt gemeldeten besten Tags. */
  lastBestScore: number | null;
  /** Nächte (ISO des Nacht-Beginns), für die bereits ein Klare-Nacht-Alarm kam. */
  notifiedClearNights: string[];
  /** Zeitpunkt der letzten Auslösung je Art (ms) — für Mindestabstände. */
  lastFiredAt: Partial<Record<NotificationKind, number>>;
}

export function freshSubscriptionState(): SubscriptionState {
  return { lastBestDate: null, lastBestScore: null, notifiedClearNights: [], lastFiredAt: {} };
}

/**
 * Eine Benachrichtigungs-Anmeldung: je Anlass UND Ort (PUSH-US1). Sie trägt die
 * komplette `EventQuery`, damit die Vorhersage jederzeit neu bewertet werden
 * kann (clientseitig jetzt, serverseitig sobald ein Backend existiert).
 */
export interface Subscription {
  id: string;
  query: EventQuery;
  /** Aktivierte Benachrichtigungs-Arten. */
  kinds: NotificationKind[];
  createdAt: number;
  /** Hauptschalter dieser Subscription (PUSH-US1: ein-/ausschaltbar). */
  enabled: boolean;
  /** Pausiert bis (ms) — null = nicht pausiert (PUSH-US4). */
  pausedUntil: number | null;
  /** Dedup-/Drossel-Zustand. */
  state: SubscriptionState;
}

/**
 * Stabile ID je Anlass + Ort + Zeitfenster. Zwei Vorhaben am selben Ort mit
 * unterschiedlichem Fenster sind verschiedene Subscriptions; dieselbe Eingabe
 * ergibt immer dieselbe ID (idempotentes An-/Abmelden).
 */
export function subscriptionId(query: EventQuery): string {
  const loc = `${query.location.lat.toFixed(3)},${query.location.lon.toFixed(3)}`;
  const win =
    query.window.mode === 'range'
      ? `r:${query.window.from}_${query.window.to}`
      : `d:${[...query.window.dates].sort().join('|')}`;
  const act = query.activity.id === 'custom' ? `custom:${query.activity.label.toLowerCase().trim()}` : query.activity.id;
  return `${act}@${loc}@${win}`;
}

export function makeSubscription(query: EventQuery, now: number): Subscription {
  return {
    id: subscriptionId(query),
    query,
    kinds: defaultKindsFor(query.activity.id),
    createdAt: now,
    enabled: true,
    pausedUntil: null,
    state: freshSubscriptionState(),
  };
}

/**
 * Eine Subscription ist „abgelaufen", wenn ihr gesamtes Zeitfenster in der
 * Vergangenheit liegt — dann gibt es nichts mehr zu melden. (Klare-Nacht-Alarme
 * sind ortsbezogen, brauchen aber ebenfalls einen Anlass im Horizont.)
 */
export function isExpired(query: EventQuery, now: number): boolean {
  const days = candidateDays(query.window);
  if (!days.length) return true;
  const last = days[days.length - 1];
  // letztes Fenster-Ende grob auf Tagesende +1 legen
  const end = new Date(`${last}T00:00:00`).getTime() + 28 * 3_600_000;
  return end < now;
}

// --- Zugestellte Benachrichtigung (Inbox) -------------------------------------

export interface DeliveredNotification {
  id: string;
  subscriptionId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  /** Tag, um den es geht (ISO) — für die „nicht zweimal für denselben Tag"-Regel. */
  aboutDate: string | null;
}

// --- Globale Einstellungen (PUSH-US4) -----------------------------------------

export interface NotificationSettings {
  /** Hauptschalter über alle Subscriptions. */
  enabled: boolean;
  /** Global pausiert bis (ms) — null = aktiv. */
  pausedUntil: number | null;
  /** Höchstzahl zugestellter Hinweise pro 24 h (Flut-Schutz). */
  maxPerDay: number;
  /** Mindestabstand je Art in Stunden (kein erneuter Hinweis innerhalb). */
  minHoursBetween: number;
}

export function defaultSettings(): NotificationSettings {
  return { enabled: true, pausedUntil: null, maxPerDay: 5, minHoursBetween: 6 };
}

/** Ist gerade (now) global oder für die Subscription pausiert? (PUSH-US4) */
export function isPausedNow(sub: Subscription, settings: NotificationSettings, now: number): boolean {
  if (!settings.enabled || !sub.enabled) return true;
  if (settings.pausedUntil != null && settings.pausedUntil > now) return true;
  if (sub.pausedUntil != null && sub.pausedUntil > now) return true;
  return false;
}
