/**
 * Epic PUSH — Zustell-Abstraktion (Transport).
 *
 * Ein Transport bringt eine fertige Benachrichtigung zum Nutzer. Aktuell ohne
 * Backend nutzbar:
 *  • `InAppTransport`  — die App-eigene Inbox (immer verfügbar).
 *  • `BrowserNotificationTransport` — System-Benachrichtigung via Web
 *    Notifications API (Berechtigung nötig, funktioniert auch ohne Server).
 *
 * Sobald ein Backend + Service Worker existiert, kommt ein `WebPushTransport`
 * dazu (Push auch bei geschlossener App). Dessen Vertrag ist in
 * `notificationBackend.ts` skizziert. Der Rest der App spricht nur dieses
 * Interface an.
 */

import type { DeliveredNotification } from './notificationModel';

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotificationTransport {
  readonly id: string;
  readonly label: string;
  /** Steht der Transport in dieser Umgebung grundsätzlich zur Verfügung? */
  isAvailable(): boolean;
  /** Aktueller Berechtigungsstatus (für In-App stets 'granted'). */
  permission(): PermissionState;
  /** Fragt — falls nötig — die Berechtigung an. Liefert den neuen Status. */
  ensurePermission(): Promise<PermissionState>;
  /** Stellt eine konkrete Benachrichtigung zu. */
  deliver(n: DeliveredNotification): void | Promise<void>;
}

/**
 * In-App-Transport: die Zustellung selbst ist ein No-op, denn die Inbox wird
 * vom Provider (Store) gepflegt. Dient als immer verfügbarer Fallback und
 * macht die Inbox-Zustellung explizit.
 */
export class InAppTransport implements NotificationTransport {
  readonly id = 'in-app';
  readonly label = 'In-App-Benachrichtigungen';
  isAvailable(): boolean {
    return true;
  }
  permission(): PermissionState {
    return 'granted';
  }
  async ensurePermission(): Promise<PermissionState> {
    return 'granted';
  }
  deliver(): void {
    /* Inbox-Eintrag erstellt der Provider; hier nichts zu tun. */
  }
}

/** System-Benachrichtigung über die Web Notifications API. */
export class BrowserNotificationTransport implements NotificationTransport {
  readonly id = 'browser';
  readonly label = 'System-Benachrichtigungen';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }
  permission(): PermissionState {
    if (!this.isAvailable()) return 'unsupported';
    return Notification.permission as PermissionState;
  }
  async ensurePermission(): Promise<PermissionState> {
    if (!this.isAvailable()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission as PermissionState;
    try {
      return (await Notification.requestPermission()) as PermissionState;
    } catch {
      return Notification.permission as PermissionState;
    }
  }
  deliver(n: DeliveredNotification): void {
    if (this.permission() !== 'granted') return;
    try {
      // tag = Subscription+Kind → das OS ersetzt einen vorigen Hinweis statt zu
      // stapeln (unterstützt die „nicht überfluten"-Idee aus PUSH-US4).
      new Notification(n.title, { body: n.body, tag: `${n.subscriptionId}:${n.kind}` });
    } catch {
      /* Manche Browser werfen außerhalb eines Service Workers — still ignorieren. */
    }
  }
}
