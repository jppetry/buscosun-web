/**
 * Epic PUSH — Auswerte-Kern (Engine).
 *
 * Verbindet die reinen Trigger (`notificationTriggers.ts`) mit den Drossel- und
 * Dedup-Regeln aus PUSH-US4 und liefert exakt die Entwürfe, die wirklich
 * zugestellt werden sollen — plus den fortgeschriebenen Subscription-Zustand.
 *
 * Vollständig IO-frei und deterministisch (Zeit kommt über `ctx.now`). Damit
 * ist dieselbe Funktion clientseitig (jetzt) wie serverseitig (künftiges
 * Backend, z. B. Cron-Worker) verwendbar — siehe `notificationBackend.ts`.
 *
 * PUSH-US4 (Flut vermeiden) ist hier zentralisiert:
 *  • Pause (global oder je Subscription) unterdrückt jede Zustellung.
 *  • `maxPerDay` deckelt die Gesamtzahl pro 24 h.
 *  • `minHoursBetween` verhindert dichte Wiederholungen je Art.
 *  • Keine Wiederholung für denselben Tag: bester-Tag über die Basislinie,
 *    klare Nacht über `notifiedClearNights`.
 */

import type { PointForecast } from '../pointForecast/types';
import type { EventRecommendation } from '../event/eventScoring';
import {
  type Subscription,
  type SubscriptionState,
  type NotificationSettings,
  type NotificationKind,
  isPausedNow,
} from './notificationModel';
import {
  detectBestDayChange,
  detectClearNights,
  type NotificationDraft,
} from './notificationTriggers';

export interface EvalData {
  rec: EventRecommendation;
  forecast: PointForecast;
  placeName: string;
  /** „Heute" als ISO yyyy-mm-dd (lokal). */
  todayISO: string;
}

export interface EvalContext {
  now: number;
  /** Bereits in den letzten 24 h zugestellte Hinweise (für die Tagesgrenze). */
  deliveredLast24h: number;
}

export interface EvalOutcome {
  /** Tatsächlich zuzustellende Hinweise (nach allen Drossel-Regeln). */
  deliver: NotificationDraft[];
  /** Fortgeschriebener Subscription-Zustand (immer übernehmen). */
  nextState: SubscriptionState;
}

/**
 * Wertet eine Subscription gegen frische Wetterdaten aus. Gibt die zuzustellenden
 * Entwürfe und den neuen Zustand zurück. Der Aufrufer ist für Persistenz +
 * Transport zuständig (Trennung von Logik und IO).
 */
export function evaluateSubscription(
  sub: Subscription,
  data: EvalData,
  settings: NotificationSettings,
  ctx: EvalContext,
): EvalOutcome {
  const next: SubscriptionState = {
    lastBestDate: sub.state.lastBestDate,
    lastBestScore: sub.state.lastBestScore,
    notifiedClearNights: prunePastNights(sub.state.notifiedClearNights, data.todayISO),
    lastFiredAt: { ...sub.state.lastFiredAt },
  };

  const paused = isPausedNow(sub, settings, ctx.now);
  // Tages-Budget: wie viele dürfen jetzt noch raus (PUSH-US4)?
  let budget = Math.max(0, settings.maxPerDay - ctx.deliveredLast24h);
  const deliver: NotificationDraft[] = [];

  const canFire = (kind: NotificationKind): boolean => {
    if (paused || budget <= 0) return false;
    const last = next.lastFiredAt[kind];
    if (last != null && ctx.now - last < settings.minHoursBetween * 3_600_000) return false;
    return true;
  };
  const accept = (draft: NotificationDraft) => {
    deliver.push(draft);
    budget -= 1;
    next.lastFiredAt[draft.kind] = ctx.now;
  };

  // --- PUSH-US2: Wechsel des besten Tags ---
  if (sub.kinds.includes('best-day-change') && data.rec.bestIndex >= 0) {
    const best = data.rec.days[data.rec.bestIndex];
    if (best.summary) {
      if (next.lastBestDate == null) {
        // Erster Lauf: nur Basislinie setzen, NICHT melden.
        next.lastBestDate = best.date;
        next.lastBestScore = best.score;
      } else {
        const draft = detectBestDayChange({
          prevBestDate: next.lastBestDate,
          prevBestScore: next.lastBestScore,
          rec: data.rec,
          activityLabel: sub.query.activity.label,
        });
        if (draft && canFire('best-day-change')) {
          accept(draft);
          // Basislinie erst NACH erfolgreicher Zustellung fortschreiben — so geht
          // ein gedrosselter Wechsel nicht verloren, sondern wird später erneut
          // versucht (kein stilles Verschlucken).
          next.lastBestDate = best.date;
          next.lastBestScore = best.score;
        }
        // unverändert (kein draft): Basislinie steht ohnehin schon korrekt.
        else if (!draft) {
          next.lastBestDate = best.date;
          next.lastBestScore = best.score;
        }
      }
    }
  }

  // --- PUSH-US3: Klare-Nacht-Alarm ---
  if (sub.kinds.includes('clear-night')) {
    const drafts = detectClearNights(data.forecast, data.todayISO, data.placeName);
    for (const draft of drafts) {
      const night = draft.aboutDate;
      if (night && next.notifiedClearNights.includes(night)) continue; // schon gemeldet
      if (!canFire('clear-night')) break;
      accept(draft);
      if (night) next.notifiedClearNights = [...next.notifiedClearNights, night];
    }
  }

  return { deliver, nextState: next };
}

/** Entfernt Nacht-Einträge, die mehr als einen Tag in der Vergangenheit liegen. */
function prunePastNights(nights: string[], todayISO: string): string[] {
  const cutoff = new Date(`${todayISO}T00:00:00`).getTime() - 86_400_000;
  return nights.filter((d) => new Date(`${d}T00:00:00`).getTime() >= cutoff);
}
