/**
 * Event-Planung · Zustand in der QUERY (Phase SH4, pur).
 *
 * Löst `#ev=` ab (`eventState.ts`, bleibt als Leser für Alt-Links). Der alte
 * Codec war prozentkodiertes JSON im Fragment — **340 Zeichen** für eine
 * Hochzeit mit drei Phasen und der längste Link im ganzen Repo
 * (`audit/teilen-share.md` §1.3). Ein Fragment erreicht den Server nie, also
 * konnte daraus kein Vorschaubild entstehen (§1.2).
 *
 * Was hier NICHT hineinkommt, bleibt bewusst draußen — die Regel stammt aus
 * `eventState.ts` und gilt weiter: **Tuning und Plan-B werden nicht geteilt.**
 * Sie entstehen beim Öffnen aus dem Anlass-Preset. Ein Link, der sie mitschickt,
 * wäre länger und behauptete einen Zustand, den der Empfänger nicht bearbeitet
 * hat.
 *
 * Der **Anlass steht im Pfad** (`/eventplanung/hochzeit`), nicht in der Query —
 * die Sub-Routen gibt es seit SEO/GEO E7. Ein freier Anlass („eigener Anlass")
 * hat keinen Pfad; er steht als `anlass=` in der Query.
 */

import type { Location } from '../types';
import { encodeShareQuery, fmtCoord, parseIsoDate, roundTo } from '../share/shareSchema';
import type { EventPhase, TimeWindow } from './eventModel';
import { isDrawnZone, type EventZone } from './eventZone';

export interface EventUrlState {
  /** Anlass-Id (`bbq`, `wedding`, … oder `custom`). */
  activityId: string;
  /** Beschriftung eines freien Anlasses; bei bekannten Anlässen leer. */
  activityLabel: string;
  place: Location | null;
  window: TimeWindow;
  phases: readonly EventPhase[];
  zone: EventZone | null;
}

export const EVENT_QUERY_ORDER = ['anlass', 'von', 'bis', 'tage', 'phasen', 'flaeche', 'ort', 'olat', 'olon', 'land'] as const;
const KNOWN: ReadonlySet<string> = new Set(EVENT_QUERY_ORDER);

/** Phasen als `Label:von-bis`, komma-getrennt. Doppelpunkt und Komma bleiben roh. */
export function encodePhases(phases: readonly EventPhase[]): string {
  return phases.map((p) => `${p.label.replace(/[,:]/g, ' ').trim()}:${p.hours[0]}-${p.hours[1]}`).join(',');
}

export function decodePhases(raw: string): EventPhase[] {
  const out: EventPhase[] = [];
  for (const part of raw.split(',')) {
    const m = /^(.+?):(\d{1,2})-(\d{1,2})$/.exec(part.trim());
    if (!m) continue;
    const from = +m[2], to = +m[3];
    if (from > 24 || to > 24) continue;
    out.push({ id: `ph${out.length + 1}`, label: m[1].trim(), hours: [from, to] });
  }
  return out;
}

/**
 * Zustand → Query-Paare. `defaultPhases` sind die Phasen des Anlass-Presets:
 * stimmen sie überein, entfällt `phasen=` — der häufigste Fall, und der Link
 * schrumpft um rund 50 Zeichen.
 */
export function eventPairs(
  s: EventUrlState,
  slug: { slug: string; inTable: boolean } | null,
  defaultPhases: readonly EventPhase[],
  hasPathForActivity: boolean,
  extra: ReadonlyArray<[string, string]> = [],
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  // Nur, wenn der Pfad den Anlass nicht schon nennt (freier Anlass).
  if (!hasPathForActivity) out.push(['anlass', s.activityLabel || s.activityId]);

  if (s.window.mode === 'range') out.push(['von', s.window.from], ['bis', s.window.to]);
  else if (s.window.dates.length) out.push(['tage', s.window.dates.join(',')]);

  if (encodePhases(s.phases) !== encodePhases(defaultPhases)) out.push(['phasen', encodePhases(s.phases)]);

  if (isDrawnZone(s.zone)) {
    const z = s.zone as EventZone;
    out.push(['flaeche', [z.west, z.south, z.east, z.north].map((n) => fmtCoord(n)).join(',')]);
  }

  if (s.place) {
    if (slug?.inTable) {
      if (s.place.country !== 'DE') out.push(['land', s.place.country.toLowerCase()]);
    } else {
      out.push(['ort', s.place.name], ['olat', fmtCoord(s.place.lat)], ['olon', fmtCoord(s.place.lon)], ['land', s.place.country.toLowerCase()]);
    }
  }

  const ordered = EVENT_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildEventSearch(
  s: EventUrlState,
  slug: { slug: string; inTable: boolean } | null,
  defaultPhases: readonly EventPhase[],
  hasPathForActivity: boolean,
  extra: ReadonlyArray<[string, string]> = [],
): string {
  return encodeShareQuery(eventPairs(s, slug, defaultPhases, hasPathForActivity, extra));
}

export interface ParsedEventQuery {
  /** Freier Anlass aus `anlass=`; bei einem Pfad-Anlass `null`. */
  activityLabel: string | null;
  place: Location | null;
  /** `null`, wenn die URL kein brauchbares Zeitfenster trägt. */
  window: TimeWindow | null;
  /** Leer, wenn die URL keine Phasen nennt (⇒ Preset des Anlasses). */
  phases: EventPhase[];
  zone: EventZone | null;
  invalid: string[];
  extra: Array<[string, string]>;
}

const num = (s: string | null) => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Query → Zustand. Nie ein Wurf. */
export function parseEventQuery(search: string): ParsedEventQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  const activityLabel = (p.get('anlass') ?? '').trim() || null;

  let window: TimeWindow | null = null;
  if (p.has('tage')) {
    const dates = (p.get('tage') ?? '').split(',').map((d) => parseIsoDate(d)).filter((d): d is string => !!d);
    if (dates.length) window = { mode: 'dates', dates }; else invalid.push('tage');
  } else if (p.has('von') || p.has('bis')) {
    const from = parseIsoDate(p.get('von')), to = parseIsoDate(p.get('bis'));
    if (from && to && from <= to) window = { mode: 'range', from, to };
    else { if (p.has('von')) invalid.push('von'); if (p.has('bis')) invalid.push('bis'); }
  }

  let phases: EventPhase[] = [];
  if (p.has('phasen')) {
    phases = decodePhases(p.get('phasen') ?? '');
    if (!phases.length) invalid.push('phasen');
  }

  let zone: EventZone | null = null;
  if (p.has('flaeche')) {
    const v = (p.get('flaeche') ?? '').split(',').map((x) => num(x));
    if (v.length === 4 && v.every((n): n is number => n != null)) {
      const cand: EventZone = { west: v[0], south: v[1], east: v[2], north: v[3] };
      if (isDrawnZone(cand)) zone = cand; else invalid.push('flaeche');
    } else invalid.push('flaeche');
  }

  let place: Location | null = null;
  const landRaw = (p.get('land') ?? '').toUpperCase();
  const country = landRaw === 'AT' || landRaw === 'CH' ? landRaw : landRaw === 'DE' ? 'DE' : null;
  if (p.has('land') && !country) invalid.push('land');
  if (p.has('ort') || p.has('olat') || p.has('olon')) {
    const lat = num(p.get('olat')), lon = num(p.get('olon'));
    if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      place = { name: (p.get('ort') ?? '').trim(), lat: roundTo(lat, 4), lon: roundTo(lon, 4), country: country ?? 'DE' };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { activityLabel, place, window, phases, zone, invalid, extra };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface EventUrlCheck { name: string; ok: boolean; detail?: string }

export function verifyEventUrl(): { checks: EventUrlCheck[]; passed: number; failed: number } {
  const checks: EventUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const konstanz: Location = { name: 'Konstanz', lat: 47.6603, lon: 9.1758, country: 'DE' };
  const trauung: EventPhase[] = [
    { id: 'ph1', label: 'Trauung', hours: [14, 16] },
    { id: 'ph2', label: 'Empfang', hours: [16, 19] },
    { id: 'ph3', label: 'Abendfeier', hours: [19, 24] },
  ];
  const base: EventUrlState = {
    activityId: 'wedding', activityLabel: '', place: konstanz,
    window: { mode: 'range', from: '2026-09-18', to: '2026-09-25' },
    phases: trauung, zone: null,
  };
  const slug = { slug: 'konstanz', inTable: true };

  add('Preset-Phasen entfallen',
    buildEventSearch(base, slug, trauung, true) === '?von=2026-09-18&bis=2026-09-25',
    buildEventSearch(base, slug, trauung, true));

  const changed: EventPhase[] = [...trauung, { id: 'ph4', label: 'Feuerwerk', hours: [23, 24] }];
  const q = buildEventSearch({ ...base, phases: changed }, slug, trauung, true);
  add('geänderte Phasen stehen lesbar da',
    q === '?von=2026-09-18&bis=2026-09-25&phasen=Trauung:14-16,Empfang:16-19,Abendfeier:19-24,Feuerwerk:23-24', q);
  add('Doppelpunkt und Komma bleiben roh', !/%3A|%2C/i.test(q));

  const back = parseEventQuery(q);
  add('Rundlauf: Zeitraum', back.window?.mode === 'range' && back.window.from === '2026-09-18' && back.window.to === '2026-09-25');
  add('Rundlauf: Phasen', encodePhases(back.phases) === encodePhases(changed), encodePhases(back.phases));
  add('Rundlauf ist ein Fixpunkt',
    buildEventSearch({ ...base, phases: back.phases }, slug, trauung, true) === q);

  // Einzeltage, Fläche, freier Ort, freier Anlass
  const free: Location = { name: 'Wiese am See', lat: 47.6701, lon: 9.1902, country: 'DE' };
  const s2: EventUrlState = {
    activityId: 'custom', activityLabel: 'Vereinsfest', place: free,
    window: { mode: 'dates', dates: ['2026-09-18', '2026-09-20'] },
    phases: trauung,
    zone: { west: 9.1701, south: 47.6571, east: 9.1812, north: 47.6634 },
  };
  const q2 = buildEventSearch(s2, { slug: 'wiese-am-see', inTable: false }, trauung, false);
  add('freier Anlass, Einzeltage, Fläche und freier Ort',
    q2 === '?anlass=Vereinsfest&tage=2026-09-18,2026-09-20&flaeche=9.1701,47.6571,9.1812,47.6634&ort=Wiese%20am%20See&olat=47.6701&olon=9.1902&land=de', q2);
  const back2 = parseEventQuery(q2);
  add('Rundlauf: Einzeltage', back2.window?.mode === 'dates' && back2.window.dates.join(',') === '2026-09-18,2026-09-20');
  add('Rundlauf: Fläche', !!back2.zone && Math.abs(back2.zone.west - 9.1701) < 1e-9);
  add('Rundlauf: freier Anlass und freier Ort', back2.activityLabel === 'Vereinsfest' && back2.place?.name === 'Wiese am See');

  // Was bewusst NICHT geteilt wird.
  add('weder Tuning noch Plan-B stehen im Vokabular',
    !EVENT_QUERY_ORDER.some((k) => /tuning|planb|schwelle|metrik/.test(k)));

  // Robustheit
  const bad = parseEventQuery('?von=gestern&bis=2026-13-45&phasen=quatsch&flaeche=1,2&olat=999&olon=1&land=fr&fremd=1');
  add('jeder unbrauchbare Wert wird gemeldet',
    ['von', 'bis', 'phasen', 'flaeche', 'olat', 'land'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('und der Zustand bleibt leer statt erfunden', bad.window === null && bad.phases.length === 0 && bad.zone === null && bad.place === null);
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));
  add('leere Query ⇒ nichts', (() => { const r = parseEventQuery(''); return !r.window && !r.phases.length && !r.place && !r.activityLabel; })());

  // Phasenlabel mit Trennzeichen darf das Format nicht sprengen.
  const tricky = encodePhases([{ id: 'p', label: 'Sekt, Empfang: draußen', hours: [16, 19] }]);
  add('Trennzeichen im Phasenlabel werden entschärft', tricky === 'Sekt  Empfang  draußen:16-19', tricky);
  add('und der Rundlauf hält', decodePhases(tricky)[0].hours.join('-') === '16-19');

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
