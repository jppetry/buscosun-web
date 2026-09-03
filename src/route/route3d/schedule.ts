/**
 * R3D · Zeitplan der Wetterereignisse (pur, DOM-frei, headless prüfbar).
 *
 * Die dritte Form neben Zustand und Bewertung (`audit/route-3d.md` §24, F1):
 *
 *   Perlen (1b)     — „wo bin ich um T, und was ist dort"   → Zustand
 *   Abschnitte (1c) — „wo hält mein Grenzwert nicht"        → Bewertung
 *   **Zeitplan**    — „**wann ändert sich was**"            → Ereignis
 *
 * Alles kommt aus `SceneColumn` und den bereits gebauten Strukturen
 * (`rainWindows`, `warnZones`, `goSections`) — **kein neuer Abruf, keine neue
 * Quelle**. Drei Regeln tragen die Liste:
 *
 *  1. **Schwellen werden interpoliert** (F2): Temperatur, Wolkenbasis und
 *     Schneefallgrenze wechseln zwischen zwei Abtastpunkten. km und Uhrzeit
 *     kommen aus derselben Interpolation, damit beide denselben Punkt meinen.
 *     Zustände (Regen, Warnung, Abschnitt) haben ihre Kanten schon
 *     (`segmentEdges`) und werden übernommen, nicht neu bestimmt.
 *  2. **Bänder statt Zahlen, plus Hysterese** (F4): ein Bandwechsel ist eine
 *     Aussage, ein Wert-Wechsel um 1 km/h nicht. Ohne Hysterese stünde bei
 *     einem Wert nahe der Kante „über 45 · unter 45 · über 45" im Plan.
 *  3. **Der Deckel wird ausgesprochen** (V-246): eine lange Liste wird nie
 *     still gekürzt — `omitted` sagt, wie viele fehlen.
 */

import { WIND_BANDS_KMH } from '../../threed/crossSection';
import type { SceneColumn, WarnZone } from './model';
import type { RainWindow } from './corridor';
import type { GoSection } from './gonogo';
import { STATUS_WORD, limitDef } from './gonogo';

export type EventKind =
  | 'start' | 'goal'
  | 'rain-start' | 'rain-end' | 'precip-type'
  | 'wind-band' | 'wind-rel'
  | 'temp-mark' | 'frost'
  | 'warn-start' | 'warn-end'
  | 'cloud-in' | 'cloud-out'
  | 'snowline-up' | 'snowline-down'
  | 'limit-break' | 'limit-ok';

/** Ton ist Beiwerk — der Satz trägt die Aussage allein. */
export type EventTone = 'info' | 'watch' | 'alert';

export interface ScheduleEvent {
  atMs: number;
  distM: number;
  kind: EventKind;
  tone: EventTone;
  text: string;
}

export interface Schedule {
  events: ScheduleEvent[];
  /** Wie viele Zeilen der Deckel weggelassen hat — nie still. */
  omitted: number;
}

/** Temperatur-Marken (°C) und ihre Hysterese (K) — siehe K3 und F4. */
export const TEMP_MARK_C = 5;
const TEMP_HYST_K = 0.5;
/** Hysterese der Windbänder (km/h). */
const WIND_HYST_KMH = 2;
/** Ab dieser Rate ist Regen kein Beiwerk mehr (mm/h) — wie in 1b. */
const RAIN_ALERT_MMH = 4;
/** Höchstzahl der Zeilen. Darüber sagt `omitted`, wie viele fehlen. */
export const MAX_EVENTS = 80;

const PRECIP_WORD: Record<'rain' | 'sleet' | 'snow', string> = {
  rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee',
};
const REL_WORD: Record<'head' | 'cross' | 'tail', string> = {
  head: 'Gegenwind', cross: 'Seitenwind', tail: 'Rückenwind',
};

export interface ScheduleInput {
  columns: SceneColumn[];
  windows: RainWindow[];
  warnZones: WarnZone[];
  /** Grenzwert-Abschnitte — nur, wenn der Nutzer sie eingestellt hat (K2). */
  sections?: GoSection[];
  maxEvents?: number;
}

/**
 * Baut den Zeitplan. Leere Liste, wenn die Strecke zu kurz ist — eine Zeile
 * „Start" allein wäre kein Plan.
 */
export function buildSchedule(input: ScheduleInput): Schedule {
  const { columns, windows, warnZones, sections = [], maxEvents = MAX_EVENTS } = input;
  if (columns.length < 2) return { events: [], omitted: 0 };

  const out: ScheduleEvent[] = [];
  const push = (e: ScheduleEvent) => out.push(e);

  /* --- Start und Ankunft --------------------------------------------- */
  const first = columns[0];
  const last = columns[columns.length - 1];
  push({
    atMs: first.etaMs, distM: first.distM, kind: 'start', tone: 'info',
    text: `Start${valueTail(first)}`,
  });
  push({
    atMs: last.etaMs, distM: last.distM, kind: 'goal', tone: 'info',
    text: `Ankunft${valueTail(last)}`,
  });

  /* --- Niederschlag: Kanten der Fenster ------------------------------- */
  for (const w of windows) {
    const word = PRECIP_WORD[w.type];
    const src = w.source === 'radar' ? 'Radar-Nowcast' : w.source === 'nwp' ? 'Modellwert' : 'Radar + Modell';
    push({
      atMs: w.fromMs, distM: w.fromM, kind: 'rain-start',
      tone: w.peakMmH >= RAIN_ALERT_MMH ? 'alert' : 'watch',
      text: `${word} setzt ein · bis ${de1(w.peakMmH)} mm/h (${src})`,
    });
    push({
      atMs: w.toMs, distM: w.toM, kind: 'rain-end', tone: 'info',
      text: `${word} hört auf`,
    });
  }
  // Artwechsel zwischen zwei benachbarten Fenstern (Regen → Schnee).
  for (let i = 1; i < windows.length; i++) {
    const a = windows[i - 1];
    const b = windows[i];
    if (a.type === b.type) continue;
    push({
      atMs: b.fromMs, distM: b.fromM, kind: 'precip-type',
      tone: b.type === 'snow' ? 'watch' : 'info',
      text: `Aus ${PRECIP_WORD[a.type]} wird ${PRECIP_WORD[b.type]}`,
    });
  }

  /* --- Amtliche Warnungen --------------------------------------------- */
  for (const z of warnZones) {
    push({
      atMs: z.fromMs, distM: z.fromM, kind: 'warn-start', tone: 'alert',
      text: `Amtliche Warnung beginnt: ${z.event} (Stufe ${z.level})`,
    });
    push({
      atMs: z.toMs, distM: z.toM, kind: 'warn-end', tone: 'info',
      text: `Amtliche Warnung endet: ${z.event}`,
    });
  }

  /* --- Grenzwerte (nur wenn 1c etwas liefert, K2) --------------------- */
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1];
    const sec = sections[i];
    if (sec.status === prev.status) continue;
    if (sec.status === 'go') {
      push({
        atMs: sec.fromMs, distM: sec.fromM, kind: 'limit-ok', tone: 'info',
        text: 'Deine Grenzwerte halten wieder',
      });
      continue;
    }
    const d = sec.lead ? limitDef(sec.lead.id) : null;
    push({
      atMs: sec.fromMs, distM: sec.fromM, kind: 'limit-break',
      tone: sec.status === 'no-go' ? 'alert' : 'watch',
      text: d && sec.lead
        ? `Dein Grenzwert: ${STATUS_WORD[sec.status]} — ${d.label} ${d.fmt(sec.lead.value)} gegen ${d.fmt(sec.lead.limit)}`
        : `Dein Grenzwert: ${STATUS_WORD[sec.status]}`,
    });
  }

  /* --- Spaltenweise Übergänge ----------------------------------------- */
  // Windband (aus den Böen, denn die spürt man) — mit Hysterese.
  let windBand: number | null = null;
  for (const c of columns) {
    const v = c.gustKmh ?? c.windKmh;
    if (v == null) continue;
    const next = steppedBand(v, WIND_BANDS_KMH as unknown as number[], WIND_HYST_KMH, windBand);
    if (windBand != null && next !== windBand) {
      push({
        atMs: c.etaMs, distM: c.distM, kind: 'wind-band',
        tone: next >= 3 ? 'alert' : next >= 2 ? 'watch' : 'info',
        text: `Böen ${next > windBand ? 'steigen' : 'fallen'} ins Band ${bandLabel(next)} km/h`,
      });
    }
    windBand = next;
  }

  // Windrichtung zur Fahrt — der Zustand hat schon einen toten Bereich.
  let rel: 'head' | 'cross' | 'tail' | null = null;
  for (const c of columns) {
    const next = c.windRel;
    if (next == null) continue;
    if (rel != null && next !== rel) {
      push({
        atMs: c.etaMs, distM: c.distM, kind: 'wind-rel',
        tone: next === 'head' ? 'watch' : 'info',
        text: `Der Wind dreht auf ${REL_WORD[next]}`,
      });
    }
    rel = next;
  }

  // Temperatur-Marken (interpoliert) und die Frostmarke der gefühlten.
  pushMarks(push, columns, (c) => c.tempC, 'temp-mark',
    (mark, up) => `Temperatur ${up ? 'steigt über' : 'fällt unter'} ${mark} °C`);
  pushCrossing(push, columns, (c) => c.apparentC, 0,
    (up) => (up
      ? { kind: 'frost' as const, tone: 'info' as const, text: 'Gefühlt steigt wieder über 0 °C' }
      : { kind: 'frost' as const, tone: 'watch' as const, text: 'Gefühlt fällt unter 0 °C' }));

  // Wolkenbasis und Schneefallgrenze: der WEG kreuzt eine Höhe.
  pushCrossing(push, columns, (c) => (c.cloudBaseM == null ? null : c.terrainM - c.cloudBaseM), 0,
    (up, c) => (up
      ? {
          kind: 'cloud-in' as const, tone: 'watch' as const,
          text: `Der Weg steigt in die Wolkenbasis (≈ ${Math.round(c.cloudBaseM ?? 0)} m, abgeleitet)`,
        }
      : { kind: 'cloud-out' as const, tone: 'info' as const, text: 'Der Weg kommt unter der Wolkenbasis heraus' }));

  pushCrossing(push, columns, (c) => (c.snowLineM == null ? null : c.terrainM - c.snowLineM), 0,
    (up, c) => (up
      ? {
          kind: 'snowline-up' as const, tone: 'watch' as const,
          text: `Der Weg steigt über die Schneefallgrenze (${Math.round(c.snowLineM ?? 0)} m)`,
        }
      : { kind: 'snowline-down' as const, tone: 'info' as const, text: 'Der Weg fällt unter die Schneefallgrenze' }));

  /* --- Ordnen, deckeln ------------------------------------------------ */
  out.sort((a, b) => (a.atMs - b.atMs) || (a.distM - b.distM) || ORDER[a.kind] - ORDER[b.kind]);
  if (out.length <= maxEvents) return { events: out, omitted: 0 };
  return { events: out.slice(0, maxEvents), omitted: out.length - maxEvents };
}

/* ============================ Helfer ============================ */

/** Reihenfolge bei gleicher Zeit: Start zuerst, Ankunft zuletzt. */
const ORDER: Record<EventKind, number> = {
  start: 0, 'warn-start': 1, 'rain-start': 2, 'precip-type': 3, 'limit-break': 4,
  'wind-band': 5, 'wind-rel': 6, 'temp-mark': 7, frost: 8,
  'cloud-in': 9, 'snowline-up': 10, 'cloud-out': 11, 'snowline-down': 12,
  'limit-ok': 13, 'rain-end': 14, 'warn-end': 15, goal: 16,
};

/**
 * Band eines Wertes an festen Kanten, mit Hysterese: die Grenze muss um
 * `hyst` überschritten werden, sonst bleibt es beim alten Band.
 */
export function steppedBand(value: number, edges: number[], hyst: number, prev: number | null): number {
  const raw = edges.reduce((acc, e) => (value >= e ? acc + 1 : acc), 0);
  if (prev == null || raw === prev) return raw;
  if (raw > prev) {
    // Aufwärts: die Kante des NEUEN Bandes muss um `hyst` überschritten sein.
    return value >= edges[prev] + hyst ? raw : prev;
  }
  // Abwärts: die Kante des ALTEN Bandes muss um `hyst` unterschritten sein.
  return value <= edges[raw] - hyst ? raw : prev;
}

function bandLabel(i: number): string {
  const e = WIND_BANDS_KMH as unknown as number[];
  if (i <= 0) return `< ${e[0]}`;
  if (i >= e.length) return `> ${e[e.length - 1]}`;
  return `${e[i - 1]}–${e[i]}`;
}

/** Marken in festen Schritten (5 °C), mit Hysterese und Interpolation. */
function pushMarks(
  push: (e: ScheduleEvent) => void,
  columns: SceneColumn[],
  valueOf: (c: SceneColumn) => number | null,
  kind: EventKind,
  text: (mark: number, up: boolean) => string,
): void {
  let band: number | null = null;
  let prev: SceneColumn | null = null;
  let prevV: number | null = null;
  for (const c of columns) {
    const v = valueOf(c);
    if (v == null) continue;
    const raw = Math.floor(v / TEMP_MARK_C);
    let next = raw;
    if (band != null && raw !== band) {
      const edge = raw > band ? (band + 1) * TEMP_MARK_C : band * TEMP_MARK_C;
      next = raw > band
        ? (v >= edge + TEMP_HYST_K ? raw : band)
        : (v <= edge - TEMP_HYST_K ? raw : band);
    }
    if (band != null && next !== band && prev && prevV != null) {
      const up = next > band;
      // Schrittweise, damit ein Sprung über zwei Marken zwei Zeilen ergibt.
      for (let b = band; up ? b < next : b > next; up ? b++ : b--) {
        const mark = up ? (b + 1) * TEMP_MARK_C : b * TEMP_MARK_C;
        const at = crossing(prev, c, prevV, v, mark);
        push({ atMs: at.atMs, distM: at.distM, kind, tone: 'info', text: text(mark, up) });
      }
    }
    band = next;
    prev = c;
    prevV = v;
  }
}

/** Ein einzelner Nulldurchgang einer abgeleiteten Größe, interpoliert. */
function pushCrossing(
  push: (e: ScheduleEvent) => void,
  columns: SceneColumn[],
  valueOf: (c: SceneColumn) => number | null,
  mark: number,
  make: (up: boolean, c: SceneColumn) => { kind: EventKind; tone: EventTone; text: string },
): void {
  let above: boolean | null = null;
  let prev: SceneColumn | null = null;
  let prevV: number | null = null;
  for (const c of columns) {
    const v = valueOf(c);
    if (v == null) continue;
    const now = v >= mark;
    if (above != null && now !== above && prev && prevV != null) {
      const at = crossing(prev, c, prevV, v, mark);
      const m = make(now, c);
      push({ atMs: at.atMs, distM: at.distM, kind: m.kind, tone: m.tone, text: m.text });
    }
    above = now;
    prev = c;
    prevV = v;
  }
}

/** Ort und Zeit, an denen der Wert zwischen zwei Spalten `mark` erreicht. */
export function crossing(
  a: { distM: number; etaMs: number },
  b: { distM: number; etaMs: number },
  va: number,
  vb: number,
  mark: number,
): { distM: number; atMs: number } {
  const span = vb - va;
  const t = Math.abs(span) < 1e-9 ? 0 : clamp01((mark - va) / span);
  return {
    distM: a.distM + (b.distM - a.distM) * t,
    atMs: Math.round(a.etaMs + (b.etaMs - a.etaMs) * t),
  };
}

/** Der Wertsatz hinter „Start"/„Ankunft" — nur, was belegt ist. */
function valueTail(c: SceneColumn): string {
  const parts: string[] = [];
  if (c.tempC != null) parts.push(`${Math.round(c.tempC)} °C`);
  if (c.gustKmh != null) parts.push(`Böen ${Math.round(c.gustKmh)} km/h`);
  else if (c.windKmh != null) parts.push(`Wind ${Math.round(c.windKmh)} km/h`);
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const de1 = (v: number) => v.toFixed(1).replace('.', ',');

/**
 * Was der Plan ist — und was er nicht leisten kann (F3). Er steht unter der
 * Liste, damit niemand die Abwesenheit einer Zeile für die Abwesenheit eines
 * Ereignisses hält.
 */
export const SCHEDULE_NOTE =
  'Der Plan nennt Änderungen, nicht Zustände: Beginn und Ende von Niederschlag und amtlicher Warnung, '
  + 'Wechsel des Windbandes und der Windrichtung zur Fahrt, 5-°C-Marken, Wolkenbasis und Schneefallgrenze. '
  + 'Schwellen werden zwischen zwei Abtastpunkten interpoliert; was genau dazwischen passiert, steht in keiner Zeile.';

/**
 * Derselbe Plan als Text — zum Kopieren, nicht als Link (B3: die hochgeladene
 * Strecke steht in keiner Adresse).
 */
export function buildScheduleText(input: {
  tourName: string;
  schedule: Schedule;
  clock: (ms: number) => string;
  gaps?: string[];
}): string {
  const { tourName, schedule, clock, gaps = [] } = input;
  const lines: string[] = [`Zeitplan · Wetter entlang der Route — ${tourName}`, ''];
  if (schedule.events.length === 0) {
    lines.push('Auf dieser Strecke ändert sich nichts, was der Plan benennen könnte.');
  }
  for (const e of schedule.events) {
    lines.push(`${clock(e.atMs)}  km ${de1(e.distM / 1000)}  ${e.text}`);
  }
  if (schedule.omitted > 0) {
    lines.push('', `… ${schedule.omitted} weitere Änderungen sind nicht aufgeführt.`);
  }
  lines.push('', SCHEDULE_NOTE);
  for (const g of gaps) lines.push(g);
  return lines.join('\n');
}
