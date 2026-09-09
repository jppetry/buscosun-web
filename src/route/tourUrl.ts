/**
 * Tourenplanung · Zustand in der URL (Phase SH5, pur).
 *
 * ── Was diese Seite NICHT teilen kann, und warum ─────────────────────────────
 *
 * **Die Strecke.** `src/route/tourStore.ts` sagt es selbst: „Der Pfad kann das
 * nicht tragen (B3): eine GPX passt in keine URL." Bis zu 100 000 Punkte liegen
 * in IndexedDB. Ein geteilter Link führt deshalb auf die Upload-Seite — der
 * Empfänger bringt seine eigene Strecke mit (`audit/teilen-share.md` §1.8, E-4).
 *
 * **Die Feineinstellungen.** §3.10 hatte auch Geschwindigkeitsprofil und Pausen
 * vorgesehen. Beim Bauen zeigte sich zweierlei:
 *
 *  1. Sie sind **nicht URL-förmig**. `SpeedProfile` sind sechs Zahlen,
 *     `BreakConfig` sieben plus eine Liste, `EbikeConfig` sieben — als Query
 *     ergäbe das `tempo=24,600,900,3,55,1&pausen=1,zeit,90,10,1,240,45`. Genau
 *     die Zahlenkette, die Jans Vorgabe B ausschließt.
 *  2. Sie sind **überflüssig**: `selectType(id)` setzt Profil und Pausen aus
 *     `getMovementType(id).defaults` (TourView:126). Die Bewegungsart trägt die
 *     vollständige Voreinstellung; was der Nutzer daran feinjustiert hat, gehört
 *     ihm und seinem Gerät — dieselbe Regel wie „Tuning und Plan-B werden nicht
 *     geteilt" in der Event-Planung.
 *
 * Es bleiben drei Werte, die etwas über die TOUR sagen und lesbar sind:
 * Bewegungsart, Startzeit (absolut) und Fahrtrichtung.
 */

import { encodeShareQuery, formatValidTime, parseValidTime } from '../share/shareSchema';
import type { MovementId } from './movementTypes';

const MOVEMENT_IDS: readonly MovementId[] = [
  'wandern', 'bergwandern', 'jogging', 'trail', 'rennrad', 'gravel', 'mtb', 'ebike',
] as const;

export type TourDirection = 'forward' | 'reverse';

export interface TourUrlState {
  /** Bewegungsart; `null` = noch nicht gewählt. */
  typeId: MovementId | null;
  /** Startzeit, absolut; `null` = jetzt. */
  startMs: number | null;
  direction: TourDirection;
}

export const TOUR_QUERY_ORDER = ['art', 'start', 'richtung'] as const;
const KNOWN: ReadonlySet<string> = new Set(TOUR_QUERY_ORDER);

export function tourPairs(s: TourUrlState, extra: ReadonlyArray<[string, string]> = []): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (s.typeId) out.push(['art', s.typeId]);
  if (s.startMs != null) out.push(['start', formatValidTime(s.startMs)]);
  if (s.direction === 'reverse') out.push(['richtung', 'rueckwaerts']);
  const ordered = TOUR_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildTourSearch(s: TourUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  return encodeShareQuery(tourPairs(s, extra));
}

export interface ParsedTourQuery extends TourUrlState {
  /** Die Startzeit liegt in der Vergangenheit — `restoreStartMs` rückt sie auf jetzt. */
  startPast: boolean;
  invalid: string[];
  extra: Array<[string, string]>;
}

export function parseTourQuery(search: string, nowMs: number): ParsedTourQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  let typeId: MovementId | null = null;
  if (p.has('art')) {
    const v = p.get('art') ?? '';
    if ((MOVEMENT_IDS as readonly string[]).includes(v)) typeId = v as MovementId; else invalid.push('art');
  }

  let startMs: number | null = null;
  let startPast = false;
  if (p.has('start')) {
    const ms = parseValidTime(p.get('start'));
    if (ms == null) invalid.push('start');
    else if (ms < nowMs) startPast = true;   // `restoreStartMs` rückt sie auf jetzt und sagt es
    else startMs = ms;
  }

  let direction: TourDirection = 'forward';
  if (p.has('richtung')) {
    const v = p.get('richtung');
    if (v === 'rueckwaerts') direction = 'reverse';
    else if (v !== 'vorwaerts') invalid.push('richtung');
  }

  return { typeId, startMs, direction, startPast, invalid, extra };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface TourUrlCheck { name: string; ok: boolean; detail?: string }

export function verifyTourUrl(): { checks: TourUrlCheck[]; passed: number; failed: number } {
  const checks: TourUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 8, 12, 12, 0);

  add('Standardzustand schreibt nichts',
    buildTourSearch({ typeId: null, startMs: null, direction: 'forward' }) === '');

  const s: TourUrlState = { typeId: 'gravel', startMs: Date.UTC(2026, 8, 13, 7, 30), direction: 'reverse' };
  const q = buildTourSearch(s);
  add('voller Zustand bleibt lesbar', q === '?art=gravel&start=2026-09-13T07:30Z&richtung=rueckwaerts', q);
  // Das Vokabular ist absichtlich klein: Profil, Pausen und E-Bike-Konfiguration
  // waeren Zahlenketten (s. Kopfkommentar) und gehoeren dem Nutzer, nicht der Tour.
  add('das Vokabular hat genau drei Schluessel', TOUR_QUERY_ORDER.join(',') === 'art,start,richtung', TOUR_QUERY_ORDER.join(','));
  add('keine Zahlenketten im Link',
    !/\d+,\d+,\d+/.test(buildTourSearch({ typeId: 'gravel', startMs: Date.UTC(2026, 8, 13, 7, 30), direction: 'reverse' })));

  const back = parseTourQuery(q, now);
  add('Rundlauf: Art, Startzeit, Richtung',
    back.typeId === 'gravel' && back.startMs === Date.UTC(2026, 8, 13, 7, 30) && back.direction === 'reverse');
  add('Rundlauf ist ein Fixpunkt', buildTourSearch(back) === q);
  add('Rundlauf: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);

  add('alle acht Bewegungsarten sind gültig',
    MOVEMENT_IDS.every((id) => parseTourQuery(`?art=${id}`, now).typeId === id), MOVEMENT_IDS.join(','));

  add('vergangene Startzeit wird gemeldet, nicht übernommen',
    (() => { const r = parseTourQuery('?start=2026-09-11T07:30Z', now); return r.startPast && r.startMs === null; })());

  const bad = parseTourQuery('?art=raumschiff&start=irgendwann&richtung=seitwaerts&fremd=1', now);
  add('jeder unbrauchbare Wert wird gemeldet',
    ['art', 'start', 'richtung'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('und fällt auf den Standard zurück', bad.typeId === null && bad.startMs === null && bad.direction === 'forward');
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));
  add('`richtung=vorwaerts` ist gültig, aber überflüssig',
    parseTourQuery('?richtung=vorwaerts', now).invalid.length === 0 && !buildTourSearch({ typeId: null, startMs: null, direction: 'forward' }).includes('richtung'));

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
