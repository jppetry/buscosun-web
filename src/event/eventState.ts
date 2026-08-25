/**
 * Event-Planung · Teilbarer Zustand (Permalink, pur).
 *
 * Kodiert die Kern-Anfrage (Anlass, Ort, Zeitfenster, Phasen) kompakt in den
 * URL-Hash. Tuning/Plan-B werden NICHT geteilt — sie werden beim Öffnen aus dem
 * Anlass-Preset rekonstruiert (kompakter Link, kein Scheinzustand). Reine
 * (De-)Serialisierung, kein Server, headless testbar.
 */

import type { Country, Location } from '../types';
import {
  EVENT_ACTIVITIES, customActivity, defaultPlanB,
  type EventQuery, type EventActivity, type TimeWindow, type EventPhase,
} from './eventModel';
import { defaultTuningFor } from './eventScoring';
import { isDrawnZone, type EventZone } from './eventZone';

export const EVENT_HASH_PREFIX = '#ev=';

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Kodiert die Anfrage in einen Hash-String (inkl. `#ev=`-Präfix). */
export function encodeEventState(q: EventQuery): string {
  const payload = {
    a: [q.activity.id, q.activity.label],
    l: [r5(q.location.lat), r5(q.location.lon), q.location.name, q.location.country],
    w: q.window.mode === 'range' ? ['r', q.window.from, q.window.to] : ['d', ...q.window.dates],
    p: q.phases.map((p) => [p.label, p.hours[0], p.hours[1]]),
    // Zone additiv (E6): nur wenn eine Fläche aufgezogen wurde. Alte Links
    // ohne `z` bleiben gültig und laden als „keine Zone".
    ...(isDrawnZone(q.zone) ? { z: [r5(q.zone.west), r5(q.zone.south), r5(q.zone.east), r5(q.zone.north)] } : {}),
  };
  return EVENT_HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/** Liest die Anfrage aus einem Hash-String; null bei fehlend/ungültig. */
export function decodeEventState(hash: string): EventQuery | null {
  if (!hash || !hash.startsWith(EVENT_HASH_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(EVENT_HASH_PREFIX.length))) as
      { a: [string, string]; l: [number, number, string, string]; w: string[]; p: [string, number, number][]; z?: number[] };

    // Anlass: bekanntes Preset per id, sonst freier Anlass aus dem Label.
    const aid = o.a?.[0];
    const known = EVENT_ACTIVITIES.find((x) => x.id === aid);
    const activity: EventActivity = known ?? customActivity(String(o.a?.[1] ?? ''));

    if (!Array.isArray(o.l) || !Number.isFinite(o.l[0]) || !Number.isFinite(o.l[1])) return null;
    const location: Location = { lat: o.l[0], lon: o.l[1], name: String(o.l[2] ?? ''), country: o.l[3] as Country };

    let window: TimeWindow;
    if (Array.isArray(o.w) && o.w[0] === 'r' && o.w.length >= 3) window = { mode: 'range', from: String(o.w[1]), to: String(o.w[2]) };
    else if (Array.isArray(o.w) && o.w[0] === 'd' && o.w.length >= 2) window = { mode: 'dates', dates: o.w.slice(1).map(String) };
    else return null;

    const phases: EventPhase[] = Array.isArray(o.p) && o.p.length
      ? o.p.map((p, i) => ({ id: `ph${i + 1}`, label: String(p[0] ?? `Phase ${i + 1}`), hours: [Number(p[1]) || 0, Number(p[2]) || 0] as [number, number] }))
      : [];
    if (!phases.length) return null;

    // Zone: fehlend oder unplausibel ⇒ keine Zone (nie eine erfundene Fläche).
    let zone: EventZone | null = null;
    if (Array.isArray(o.z) && o.z.length === 4 && o.z.every((n) => Number.isFinite(n))) {
      const cand: EventZone = { west: o.z[0], south: o.z[1], east: o.z[2], north: o.z[3] };
      if (isDrawnZone(cand)) zone = cand;
    }

    return { activity, location, zone, window, phases, tuning: defaultTuningFor(activity.id), planB: defaultPlanB() };
  } catch { return null; }
}

/** Ist im Hash ein Event-Zustand hinterlegt? */
export function hasEventHash(hash: string): boolean {
  return !!hash && hash.startsWith(EVENT_HASH_PREFIX);
}
