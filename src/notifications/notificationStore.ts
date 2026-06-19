/**
 * Epic PUSH — Persistenz-Abstraktion.
 *
 * `NotificationStore` ist die einzige Stelle, an der Benachrichtigungs-Daten
 * geladen/gespeichert werden. Heute liegt alles lokal im `localStorage`
 * (`LocalNotificationStore`). Sobald ein Backend existiert, kann eine
 * `RemoteNotificationStore`-Implementierung dieselbe Schnittstelle bedienen
 * (REST-Calls statt localStorage) — der Rest der App bleibt unverändert.
 *
 * Die Schnittstelle ist synchron gehalten, weil der lokale Store synchron ist.
 * Ein Remote-Store würde clientseitig einen lokalen Cache spiegeln und im
 * Hintergrund synchronisieren (siehe `notificationBackend.ts`).
 */

import {
  type Subscription,
  type DeliveredNotification,
  type NotificationSettings,
  defaultSettings,
} from './notificationModel';

export interface NotificationStore {
  loadSubscriptions(): Subscription[];
  saveSubscriptions(subs: Subscription[]): void;
  loadDelivered(): DeliveredNotification[];
  saveDelivered(items: DeliveredNotification[]): void;
  loadSettings(): NotificationSettings;
  saveSettings(settings: NotificationSettings): void;
}

const KEYS = {
  subs: 'buscosun.notify.subscriptions.v1',
  delivered: 'buscosun.notify.delivered.v1',
  settings: 'buscosun.notify.settings.v1',
} as const;

/** Höchstzahl gespeicherter Inbox-Einträge (älteste fallen raus). */
const MAX_DELIVERED = 100;

/** localStorage-basierter Store. Robust gegen fehlendes/defektes Storage. */
export class LocalNotificationStore implements NotificationStore {
  private readJSON<T>(key: string, fallback: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  private writeJSON(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage voll/blockiert → still ignorieren (Hinweise sind nicht kritisch). */
    }
  }

  loadSubscriptions(): Subscription[] {
    const arr = this.readJSON<Subscription[]>(KEYS.subs, []);
    return Array.isArray(arr) ? arr : [];
  }
  saveSubscriptions(subs: Subscription[]): void {
    this.writeJSON(KEYS.subs, subs);
  }
  loadDelivered(): DeliveredNotification[] {
    const arr = this.readJSON<DeliveredNotification[]>(KEYS.delivered, []);
    return Array.isArray(arr) ? arr : [];
  }
  saveDelivered(items: DeliveredNotification[]): void {
    // Neueste zuerst, auf MAX_DELIVERED begrenzen.
    const trimmed = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_DELIVERED);
    this.writeJSON(KEYS.delivered, trimmed);
  }
  loadSettings(): NotificationSettings {
    return { ...defaultSettings(), ...this.readJSON<Partial<NotificationSettings>>(KEYS.settings, {}) };
  }
  saveSettings(settings: NotificationSettings): void {
    this.writeJSON(KEYS.settings, settings);
  }
}
