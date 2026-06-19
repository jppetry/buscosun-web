/**
 * Go / No-Go · Arbeitsfenster — pure Logik (P1, backend-frei, headless testbar).
 *
 * Der Nutzer wählt ein Berufs-Profil (oder eigenes) mit Schwellen für Wind, Böen,
 * Niederschlag und Temperatur. Wir bewerten den stündlichen Punktforecast in
 * grün (go) / gelb (Vorsicht) / rot (no-go) und fassen zusammenhängende Stunden
 * zu Fenstern zusammen. Keine neue Datenquelle — wertet die bestehende
 * Punktforecast-Pipeline aus.
 *
 * WICHTIG: Die Voreinstellungen sind grobe Richtwerte, KEINE amtlichen oder
 * herstellerverbindlichen Grenzwerte. Die Verantwortung bleibt beim Nutzer.
 */

import type { PointForecastHour } from '../pointForecast/types';

export type ParamKey = 'wind' | 'gust' | 'precip' | 'tempMax' | 'tempMin';
export type Status = 'go' | 'caution' | 'nogo' | 'unknown';

export interface ParamMeta { key: ParamKey; label: string; short: string; unit: string; dir: 'max' | 'min'; }

/** Bewertungsparameter mit Richtung (max = höher ist schlechter, min = tiefer ist schlechter). */
export const PARAMS: ParamMeta[] = [
  { key: 'wind', label: 'Wind (Mittel)', short: 'Wind', unit: 'm/s', dir: 'max' },
  { key: 'gust', label: 'Böen', short: 'Böen', unit: 'm/s', dir: 'max' },
  { key: 'precip', label: 'Niederschlag', short: 'Regen', unit: 'mm/h', dir: 'max' },
  { key: 'tempMax', label: 'Temperatur (Obergrenze)', short: 'max °C', unit: '°C', dir: 'max' },
  { key: 'tempMin', label: 'Temperatur (Untergrenze)', short: 'min °C', unit: '°C', dir: 'min' },
];

/** Schwelle je Parameter — null bedeutet „diesen Parameter ignorieren". */
export interface Threshold { watch: number | null; alert: number | null; }
export type Thresholds = Record<ParamKey, Threshold>;

export interface GoNoGoProfile { id: string; label: string; hint: string; thresholds: Thresholds; }

const off: Threshold = { watch: null, alert: null };
const t = (watch: number | null, alert: number | null): Threshold => ({ watch, alert });

/** Berufs-Profile mit Richtwerten (bewusst konservativ, klar als Richtwert gekennzeichnet). */
export const PROFILES: GoNoGoProfile[] = [
  {
    id: 'drone', label: 'Drohne', hint: 'Consumer-/Foto-Drohne · Wind & Nässe kritisch',
    thresholds: { wind: t(8, 10.5), gust: t(10, 13), precip: t(0.1, 0.4), tempMax: off, tempMin: t(0, -10) },
  },
  {
    id: 'crane', label: 'Kran', hint: 'Turmdrehkran · Böen-Abschaltung',
    thresholds: { wind: t(12, 16), gust: t(14, 20), precip: off, tempMax: off, tempMin: off },
  },
  {
    id: 'roof', label: 'Dachdecker / Gerüst', hint: 'Arbeit in der Höhe · Wind & Glätte',
    thresholds: { wind: t(8, 12), gust: t(12, 17), precip: t(0.2, 1), tempMax: off, tempMin: t(-2, -8) },
  },
  {
    id: 'paint', label: 'Maler / Fassade', hint: 'Außenanstrich · trocken & mild nötig',
    thresholds: { wind: t(8, 12), gust: off, precip: t(0.1, 0.3), tempMax: t(28, 35), tempMin: t(5, 1) },
  },
  {
    id: 'event', label: 'Event-Aufbau', hint: 'Zelt / Bühne / Pavillon',
    thresholds: { wind: t(9, 13), gust: t(12, 17), precip: t(0.5, 2), tempMax: off, tempMin: off },
  },
];

/** Editierbares Standard-Profil (Ausgangspunkt für „Eigenes Profil"). */
export function defaultCustomThresholds(): Thresholds {
  return { wind: t(8, 12), gust: t(12, 17), precip: t(0.2, 1), tempMax: off, tempMin: t(0, -5) };
}

export interface HourEval {
  timestamp: Date;
  status: Status;
  limiting: ParamKey | null;
  reason: string;
  values: Partial<Record<ParamKey, number | null>>;
}

const RANK: Record<Status, number> = { go: 0, caution: 1, nogo: 2, unknown: -1 };

/** Rohwert einer Stunde für einen Parameter. */
function valueFor(h: PointForecastHour, key: ParamKey): number | null {
  switch (key) {
    case 'wind': return h.windSpeed;
    case 'gust': return h.gustSpeed;
    case 'precip': return h.precipitation;
    case 'tempMax':
    case 'tempMin': return h.temperature;
  }
}

/** Einzel-Parameter-Status. */
export function evalParam(value: number | null, thr: Threshold, dir: 'max' | 'min'): Status {
  if (thr.watch == null && thr.alert == null) return 'go'; // ignoriert
  if (value == null) return 'unknown';
  if (dir === 'max') {
    if (thr.alert != null && value >= thr.alert) return 'nogo';
    if (thr.watch != null && value >= thr.watch) return 'caution';
    return 'go';
  } else {
    if (thr.alert != null && value <= thr.alert) return 'nogo';
    if (thr.watch != null && value <= thr.watch) return 'caution';
    return 'go';
  }
}

const fmt = (v: number, unit: string) => `${unit === 'mm/h' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : Math.round(v)} ${unit}`;

/** Bewertet eine Stunde gegen die Schwellen: schlimmster Parameter bestimmt den Status. */
export function evalHour(h: PointForecastHour, thresholds: Thresholds): HourEval {
  let worst: Status = 'go';
  let limiting: ParamKey | null = null;
  let limitingStatus: Status = 'go';
  let evaluatedAny = false;
  let unknownAny = false;
  const values: Partial<Record<ParamKey, number | null>> = {};

  for (const meta of PARAMS) {
    const thr = thresholds[meta.key];
    if (thr.watch == null && thr.alert == null) continue; // Parameter aus
    const v = valueFor(h, meta.key);
    values[meta.key] = v;
    const st = evalParam(v, thr, meta.dir);
    if (st === 'unknown') { unknownAny = true; continue; }
    evaluatedAny = true;
    if (RANK[st] > RANK[worst]) { worst = st; }
    if (RANK[st] >= RANK[limitingStatus] && st !== 'go') { limitingStatus = st; limiting = meta.key; }
  }

  let status: Status = worst;
  if (!evaluatedAny) status = unknownAny ? 'unknown' : 'go';

  let reason = '';
  if (limiting && status !== 'go' && status !== 'unknown') {
    const meta = PARAMS.find((p) => p.key === limiting)!;
    const v = values[limiting];
    const thr = thresholds[limiting];
    const bound = status === 'nogo' ? thr.alert : thr.watch;
    const cmp = meta.dir === 'max' ? '≥' : '≤';
    reason = v != null && bound != null ? `${meta.short} ${fmt(v, meta.unit)} ${cmp} ${fmt(bound, meta.unit)}` : meta.label;
  } else if (status === 'unknown') {
    reason = 'keine Vorhersage';
  } else {
    reason = 'alle Werte im grünen Bereich';
  }

  return { timestamp: h.timestamp, status, limiting, reason, values };
}

export interface StatusSpan { status: Status; start: Date; end: Date; hours: number; }

/** Fasst aufeinanderfolgende Stunden gleichen Status zu Spannen zusammen. */
export function spansFrom(evals: HourEval[]): StatusSpan[] {
  const spans: StatusSpan[] = [];
  for (const e of evals) {
    const last = spans[spans.length - 1];
    if (last && last.status === e.status) {
      last.end = new Date(e.timestamp.getTime() + 3_600_000);
      last.hours += 1;
    } else {
      spans.push({ status: e.status, start: e.timestamp, end: new Date(e.timestamp.getTime() + 3_600_000), hours: 1 });
    }
  }
  return spans;
}

/** Erstes grünes Fenster mit Mindestdauer (Stunden); null wenn keins. */
export function firstGoWindow(spans: StatusSpan[], minHours = 1): StatusSpan | null {
  return spans.find((s) => s.status === 'go' && s.hours >= minHours) ?? null;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface GngCheck { case: string; ok: boolean }

export function verifyGoNoGo(): { checks: GngCheck[]; passed: number; failed: number } {
  const checks: GngCheck[] = [];
  const add = (c: string, ok: boolean) => checks.push({ case: c, ok });

  add('evalParam max go', evalParam(5, t(8, 12), 'max') === 'go');
  add('evalParam max caution', evalParam(9, t(8, 12), 'max') === 'caution');
  add('evalParam max nogo', evalParam(13, t(8, 12), 'max') === 'nogo');
  add('evalParam min nogo (Frost)', evalParam(-9, t(0, -5), 'min') === 'nogo');
  add('evalParam min caution', evalParam(-2, t(0, -5), 'min') === 'caution');
  add('evalParam off → go', evalParam(99, off, 'max') === 'go');
  add('evalParam null → unknown', evalParam(null, t(8, 12), 'max') === 'unknown');

  const mk = (over: Partial<PointForecastHour>): PointForecastHour => ({
    timestamp: new Date(2026, 5, 12, 14), temperature: 18, windSpeed: 4, windDirection: 270, gustSpeed: 7,
    relativeHumidity: 60, apparentTemperature: 18, snowLineM: null, cloudCoverTotal: 30, cloudCoverLow: 10,
    cloudCoverMid: 10, cloudCoverHigh: 10, precipitation: 0, uvIndex: 3,
    confidence: { temperature: 1, wind: 1, gust: 1, humidity: 1, precipitation: 1, clouds: 1, snowLine: 1, uvIndex: 1 },
    contributingSources: [], ...over,
  });
  const thr = PROFILES.find((p) => p.id === 'drone')!.thresholds;
  add('evalHour calm → go', evalHour(mk({}), thr).status === 'go');
  add('evalHour gusty → nogo + limiting gust', (() => { const e = evalHour(mk({ gustSpeed: 14 }), thr); return e.status === 'nogo' && e.limiting === 'gust'; })());
  add('evalHour drizzle → at least caution', RANK[evalHour(mk({ precipitation: 0.2 }), thr).status] >= RANK.caution);
  add('evalHour null wind+gust → unknown', evalHour(mk({ windSpeed: null, gustSpeed: null, precipitation: null, temperature: null }), thr).status === 'unknown');

  const evals: HourEval[] = [
    evalHour(mk({}), thr), evalHour(mk({}), thr), evalHour(mk({ gustSpeed: 14 }), thr), evalHour(mk({}), thr),
  ];
  const spans = spansFrom(evals);
  add('spans: 3 segments (go,nogo,go)', spans.length === 3 && spans[0].hours === 2 && spans[1].status === 'nogo');
  add('firstGoWindow ≥2h finds opener', firstGoWindow(spans, 2)?.hours === 2);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyGoNoGo: typeof verifyGoNoGo }).__verifyGoNoGo = verifyGoNoGo;
}
