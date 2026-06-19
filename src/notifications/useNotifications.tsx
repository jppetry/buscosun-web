/**
 * Epic PUSH — React-Anbindung (Provider + Hook).
 *
 * Hält den Benachrichtigungs-Zustand (Subscriptions, Inbox, Einstellungen,
 * Berechtigung) und verbindet Store + Engine + Transport. Komponenten sprechen
 * nur diesen Hook an.
 *
 * Der Auswerte-Fluss ist clientseitig: Wenn die Event-Ergebnisseite eine frische
 * Empfehlung berechnet, ruft sie `ingest(query, {rec, forecast})`. Existiert für
 * das Vorhaben eine Subscription, läuft sie durch `evaluateSubscription` (PUSH-
 * US2/US3/US4). `checkAll()` holt für alle Subscriptions selbst neue Daten und
 * wertet aus — das simuliert den künftigen Backend-Cron-Job.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPointForecast } from '../pointForecast/pointForecast';
import { recommendBestDay, candidateDays, hoursNeededFor } from '../event/eventScoring';
import { phasesLatestHour, todayISO, type EventQuery } from '../event/eventModel';
import {
  type Subscription,
  type DeliveredNotification,
  type NotificationSettings,
  type NotificationKind,
  subscriptionId,
  makeSubscription,
} from './notificationModel';
import { LocalNotificationStore, type NotificationStore } from './notificationStore';
import { evaluateSubscription, type EvalData } from './notificationEngine';
import {
  InAppTransport,
  BrowserNotificationTransport,
  type NotificationTransport,
  type PermissionState,
} from './notificationTransport';
import { NULL_BACKEND, type PushBackend } from './notificationBackend';
import type { EventRecommendation } from '../event/eventScoring';
import type { PointForecast } from '../pointForecast/types';

interface NotificationApi {
  subscriptions: Subscription[];
  delivered: DeliveredNotification[];
  settings: NotificationSettings;
  permission: PermissionState;
  /** true, sobald ein echtes Push-Backend angebunden ist (aktuell false). */
  backendConfigured: boolean;
  unreadCount: number;

  subscriptionFor(query: EventQuery): Subscription | undefined;
  subscribe(query: EventQuery): Promise<void>;
  unsubscribe(id: string): void;
  toggleKind(id: string, kind: NotificationKind): void;
  pauseSubscription(id: string, until: number | null): void;

  updateSettings(patch: Partial<NotificationSettings>): void;
  pauseAll(until: number | null): void;

  ingest(query: EventQuery, data: { rec: EventRecommendation; forecast: PointForecast }): void;
  checkAll(): Promise<void>;
  checking: boolean;

  markRead(id: string): void;
  markAllRead(): void;
  clearInbox(): void;
  requestPermission(): Promise<PermissionState>;
}

const Ctx = createContext<NotificationApi | null>(null);

export function useNotifications(): NotificationApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications muss innerhalb von <NotificationProvider> verwendet werden');
  return ctx;
}

const DAY_MS = 86_400_000;

export function NotificationProvider({ children, store }: { children: React.ReactNode; store?: NotificationStore }) {
  const persist = useMemo<NotificationStore>(() => store ?? new LocalNotificationStore(), [store]);
  const backend = useMemo<PushBackend>(() => NULL_BACKEND, []);
  const transports = useMemo<NotificationTransport[]>(
    () => [new BrowserNotificationTransport(), new InAppTransport()],
    [],
  );
  const browser = transports[0];

  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => persist.loadSubscriptions());
  const [delivered, setDelivered] = useState<DeliveredNotification[]>(() => persist.loadDelivered());
  const [settings, setSettings] = useState<NotificationSettings>(() => persist.loadSettings());
  const [permission, setPermission] = useState<PermissionState>(() => browser.permission());
  const [checking, setChecking] = useState(false);

  // Refs spiegeln den jüngsten Zustand für asynchrone Callbacks (ingest/checkAll).
  const subsRef = useRef(subscriptions);
  const deliveredRef = useRef(delivered);
  const settingsRef = useRef(settings);
  useEffect(() => { subsRef.current = subscriptions; }, [subscriptions]);
  useEffect(() => { deliveredRef.current = delivered; }, [delivered]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Persistenz bei jeder Änderung.
  useEffect(() => { persist.saveSubscriptions(subscriptions); }, [persist, subscriptions]);
  useEffect(() => { persist.saveDelivered(delivered); }, [persist, delivered]);
  useEffect(() => { persist.saveSettings(settings); }, [persist, settings]);

  const deliveredLast24h = useCallback((now: number, list: DeliveredNotification[]) => {
    return list.filter((d) => now - d.createdAt < DAY_MS).length;
  }, []);

  /**
   * Wertet eine einzelne Subscription gegen frische Daten aus, stellt zu und gibt
   * die nächste Liste (subs/delivered) zurück. Arbeitet auf übergebenen Arrays,
   * damit `checkAll` über mehrere Subscriptions korrekt durchlaufen kann.
   */
  const runOne = useCallback(
    (
      sub: Subscription,
      rec: EventRecommendation,
      forecast: PointForecast,
      now: number,
      curSubs: Subscription[],
      curDelivered: DeliveredNotification[],
    ): { subs: Subscription[]; delivered: DeliveredNotification[] } => {
      const data: EvalData = { rec, forecast, placeName: sub.query.location.name, todayISO: todayISO() };
      const outcome = evaluateSubscription(sub, data, settingsRef.current, {
        now,
        deliveredLast24h: deliveredLast24h(now, curDelivered),
      });

      const newItems: DeliveredNotification[] = outcome.deliver.map((draft, i) => ({
        id: `${sub.id}:${draft.kind}:${now}:${i}`,
        subscriptionId: sub.id,
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        createdAt: now,
        read: false,
        aboutDate: draft.aboutDate,
      }));

      // Transporte feuern (Browser nur bei Erlaubnis; In-App ist No-op).
      for (const item of newItems) {
        for (const t of transports) {
          if (t.id === 'browser' && t.permission() !== 'granted') continue;
          void t.deliver(item);
        }
      }

      const nextSubs = curSubs.map((s) => (s.id === sub.id ? { ...s, state: outcome.nextState } : s));
      const nextDelivered = newItems.length ? [...newItems, ...curDelivered] : curDelivered;
      return { subs: nextSubs, delivered: nextDelivered };
    },
    [deliveredLast24h, transports],
  );

  // Liest aus dem reaktiven State (nicht aus dem Ref), damit die UI direkt nach
  // dem Abonnieren neu rendert — der Ref wird erst nach dem Commit aktualisiert.
  const subscriptionFor = useCallback(
    (query: EventQuery) => subscriptions.find((s) => s.id === subscriptionId(query)),
    [subscriptions],
  );

  const subscribe = useCallback(
    async (query: EventQuery) => {
      const id = subscriptionId(query);
      if (!subsRef.current.some((s) => s.id === id)) {
        const sub = makeSubscription(query, Date.now());
        setSubscriptions((prev) => [...prev, sub]);
        // Backend-Registrierung (aktuell No-op via NULL_BACKEND).
        if (backend.configured) {
          try { await backend.registerSubscription(sub, await collectPushChannel()); } catch { /* later */ }
        }
      }
      // Beim Aktivieren gleich nach Berechtigung für System-Hinweise fragen.
      const p = await browser.ensurePermission();
      setPermission(p);
    },
    [backend, browser],
  );

  const unsubscribe = useCallback(
    (id: string) => {
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (backend.configured) void backend.removeSubscription(id).catch(() => {});
    },
    [backend],
  );

  const toggleKind = useCallback((id: string, kind: NotificationKind) => {
    setSubscriptions((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = s.kinds.includes(kind);
        return { ...s, kinds: has ? s.kinds.filter((k) => k !== kind) : [...s.kinds, kind] };
      }),
    );
  }, []);

  const pauseSubscription = useCallback((id: string, until: number | null) => {
    setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, pausedUntil: until } : s)));
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<NotificationSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (backend.configured) void backend.syncSettings(next).catch(() => {});
        return next;
      });
    },
    [backend],
  );

  const pauseAll = useCallback((until: number | null) => updateSettings({ pausedUntil: until }), [updateSettings]);

  const ingest = useCallback(
    (query: EventQuery, data: { rec: EventRecommendation; forecast: PointForecast }) => {
      const sub = subsRef.current.find((s) => s.id === subscriptionId(query));
      if (!sub) return;
      const now = Date.now();
      const res = runOne(sub, data.rec, data.forecast, now, subsRef.current, deliveredRef.current);
      setSubscriptions(res.subs);
      if (res.delivered !== deliveredRef.current) setDelivered(res.delivered);
    },
    [runOne],
  );

  const checkAll = useCallback(async () => {
    const subs = subsRef.current;
    if (!subs.length) return;
    setChecking(true);
    const now = Date.now();
    // Arbeitskopien, die wir über alle Subscriptions fortschreiben.
    let curSubs = subs;
    let curDelivered = deliveredRef.current;
    for (const sub of subs) {
      try {
        const hours = hoursNeededFor(candidateDays(sub.query.window), phasesLatestHour(sub.query.phases));
        const forecast = await getPointForecast({
          lat: sub.query.location.lat,
          lng: sub.query.location.lon,
          country: sub.query.location.country,
          hours,
        });
        const rec = recommendBestDay(sub.query, forecast);
        // jüngste Version dieser Subscription aus der Arbeitskopie holen
        const fresh = curSubs.find((s) => s.id === sub.id) ?? sub;
        const res = runOne(fresh, rec, forecast, now, curSubs, curDelivered);
        curSubs = res.subs;
        curDelivered = res.delivered;
      } catch {
        /* einzelne Subscription scheitert → andere trotzdem prüfen */
      }
    }
    setSubscriptions(curSubs);
    setDelivered(curDelivered);
    setChecking(false);
  }, [runOne]);

  const markRead = useCallback((id: string) => {
    setDelivered((prev) => prev.map((d) => (d.id === id ? { ...d, read: true } : d)));
  }, []);
  const markAllRead = useCallback(() => {
    setDelivered((prev) => prev.map((d) => ({ ...d, read: true })));
  }, []);
  const clearInbox = useCallback(() => setDelivered([]), []);

  const requestPermission = useCallback(async () => {
    const p = await browser.ensurePermission();
    setPermission(p);
    return p;
  }, [browser]);

  const unreadCount = useMemo(() => delivered.filter((d) => !d.read).length, [delivered]);

  const api = useMemo<NotificationApi>(
    () => ({
      subscriptions,
      delivered,
      settings,
      permission,
      backendConfigured: backend.configured,
      unreadCount,
      subscriptionFor,
      subscribe,
      unsubscribe,
      toggleKind,
      pauseSubscription,
      updateSettings,
      pauseAll,
      ingest,
      checkAll,
      checking,
      markRead,
      markAllRead,
      clearInbox,
      requestPermission,
    }),
    [
      subscriptions, delivered, settings, permission, backend.configured, unreadCount,
      subscriptionFor, subscribe, unsubscribe, toggleKind, pauseSubscription, updateSettings,
      pauseAll, ingest, checkAll, checking, markRead, markAllRead, clearInbox, requestPermission,
    ],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Sammelt den Web-Push-Kanal (Service-Worker-PushSubscription). Aktuell ein
 * Platzhalter, der erst mit Service Worker + VAPID-Schlüssel greift — siehe
 * `notificationBackend.ts`. Wird nur aufgerufen, wenn ein Backend konfiguriert ist.
 */
async function collectPushChannel(): Promise<import('./notificationBackend').PushChannel> {
  throw new Error('Web-Push-Kanal benötigt Service Worker + Backend (noch nicht angebunden).');
}
