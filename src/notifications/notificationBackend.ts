/**
 * Epic PUSH — Backend-Vertrag (VORBEREITUNG, noch nicht angebunden).
 *
 * Es gibt aktuell KEIN Backend. Alle Benachrichtigungen entstehen und werden
 * clientseitig ausgewertet (siehe `notificationEngine.ts`) und lokal/über die
 * Web Notifications API zugestellt. Damit ein späteres Backend einfach
 * eingehängt werden kann, ist hier der erwartete Vertrag definiert und mit
 * No-op-/Stub-Implementierungen hinterlegt.
 *
 * WARUM ÜBERHAUPT EIN BACKEND?
 *  Echte Push-Hinweise bei geschlossener App brauchen einen Server, der die
 *  Vorhersage periodisch prüft und Web-Push verschickt. Die gute Nachricht:
 *  Die Auslöse-Logik (`notificationTriggers.ts`) und der Drossel-Kern
 *  (`notificationEngine.ts`) sind PUR und ohne DOM-Abhängigkeit — derselbe
 *  Code läuft in einem Node-/Edge-Worker. Das Backend muss also nur:
 *   1. Subscriptions entgegennehmen/speichern (REST, siehe `PushBackend`).
 *   2. Periodisch je Subscription `getPointForecast` + `recommendBestDay`
 *      aufrufen und `evaluateSubscription` ausführen.
 *   3. Resultierende Entwürfe per Web-Push an den `PushChannel` des Clients
 *      senden.
 *
 * ANBINDUNG (wenn das Backend steht):
 *   const backend = createHttpPushBackend('https://api.buscosun.app');
 *   → in `useNotifications` statt `NULL_BACKEND` injizieren; beim Abonnieren
 *     `backend.registerSubscription(...)` mit dem Web-Push-Channel aufrufen.
 */

import type { Subscription, NotificationSettings } from './notificationModel';

/** Push-Kanal eines Clients (Web-Push-Endpoint + Schlüssel). */
export interface WebPushChannel {
  kind: 'web-push';
  endpoint: string;
  /** Aus `PushSubscription.getKey('p256dh' | 'auth')`, base64url. */
  keys: { p256dh: string; auth: string };
}

export type PushChannel = WebPushChannel;

/** Antwort auf eine Registrierung. */
export interface RegisterResult {
  /** Serverseitige ID der Subscription (kann der Client-ID entsprechen). */
  id: string;
}

/**
 * Vertrag, den ein künftiges Backend erfüllen muss. Bewusst minimal: der Client
 * meldet Subscriptions + seinen Push-Kanal an; der Server übernimmt das
 * periodische Auswerten und Zustellen.
 */
export interface PushBackend {
  readonly configured: boolean;
  /** Subscription serverseitig registrieren / aktualisieren. */
  registerSubscription(sub: Subscription, channel: PushChannel): Promise<RegisterResult>;
  /** Subscription serverseitig entfernen. */
  removeSubscription(id: string): Promise<void>;
  /** Globale Einstellungen (Pause, Limits) zum Server spiegeln. */
  syncSettings(settings: NotificationSettings): Promise<void>;
}

/** Wird geworfen, wenn ein Stub ohne konfiguriertes Backend aufgerufen wird. */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super('Push-Backend ist nicht konfiguriert — Benachrichtigungen laufen aktuell rein clientseitig.');
    this.name = 'BackendNotConfiguredError';
  }
}

/**
 * Aktueller Standard: KEIN Backend. Registrierungen sind No-ops, damit der
 * clientseitige Pfad ungestört funktioniert. `configured: false` signalisiert
 * der UI, dass nur In-App-/Browser-Hinweise möglich sind (App muss offen sein).
 */
export const NULL_BACKEND: PushBackend = {
  configured: false,
  async registerSubscription(sub) {
    return { id: sub.id };
  },
  async removeSubscription() {
    /* no-op */
  },
  async syncSettings() {
    /* no-op */
  },
};

/**
 * Stub für die spätere echte HTTP-Anbindung. Die Endpunkte sind als Kommentar
 * dokumentiert; bis das Backend steht, wirft jeder Aufruf bewusst, damit man
 * die fehlende Implementierung früh bemerkt (nicht still scheitert).
 *
 *   POST   {baseUrl}/notifications/subscriptions      → RegisterResult
 *   DELETE {baseUrl}/notifications/subscriptions/{id}
 *   PUT    {baseUrl}/notifications/settings
 */
export function createHttpPushBackend(baseUrl: string): PushBackend {
  void baseUrl;
  return {
    configured: true,
    async registerSubscription() {
      throw new BackendNotConfiguredError();
    },
    async removeSubscription() {
      throw new BackendNotConfiguredError();
    },
    async syncSettings() {
      throw new BackendNotConfiguredError();
    },
  };
}
