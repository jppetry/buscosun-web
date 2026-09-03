/**
 * R3D · Go/No-Go entlang der Strecke (pur, DOM-frei, headless prüfbar) —
 * Vorlage `reference/1c-gonogo-relief-*`, Diagnose `audit/route-3d.md` §17.
 *
 * **Zwei gleichnamige Fragen im Repo — das hier ist die zweite.**
 * `src/threed/goNoGo.ts` beantwortet die B2B-Frage „darf ich an DIESEM Ort auf
 * DIESER Arbeitshöhe starten?": ein Anker (das höchste Gelände des Schnitts),
 * eine Zeitachse, EIN Böengrenzwert, zwei Zustände. Dieses Modul beantwortet
 * die Tour-Frage „wo auf MEINER Strecke wird es kritisch — und warum genau
 * dort?": eine wandernde Position, MEHRERE Grenzwerte, die Höhe, auf der der
 * Nutzer gerade steht, und VIER Zustände. Gemeinsam ist beiden nur `windAtAGL`,
 * und das teilen sie bereits (§17.3 C2). Auch die Grenzwerte bleiben getrennt:
 * ein Drohnenpilot und ein Bergwanderer haben nicht denselben.
 *
 * **Was hier bewusst NICHT entsteht:**
 *
 *  – **C1** — ein Grenzwert „Sicht". Die Punkt-Kette führt nirgends eine
 *    Sichtweite (`SampleWeather`, `PointForecastHour`, `PointSourceSample`);
 *    aus Bewölkung oder Feuchte geschätzt wäre sie eine erfundene Zahl an
 *    genau der Stelle, an der der Nutzer entscheidet. Der Katalog unten ist
 *    deshalb kürzer als die Vorlage — und die Ansicht sagt, warum.
 *
 *  – **C4** — ein Grenzwert auf die amtliche Warnung in der *Startzeit-Suche*.
 *    `LimitDef.fromStart` fehlt dort absichtlich: die Warnabfrage ist
 *    asynchron und netzgestützt, 17 Kandidaten × alle Samples wären ein
 *    zweiter Abfragefächer. Der Warn-Grenzwert gilt für die gefahrene Tour,
 *    nicht für die Suche — `goStartSearch` nennt das als `unchecked`.
 *
 * **Die Rangfolge ist `no-go > unklar > knapp > go`** (§17.3 C3): eine belegte
 * Überschreitung bleibt eine Überschreitung, auch bei mäßiger Konfidenz —
 * Unsicherheit macht eine Warnung nicht harmloser. Umgekehrt darf Unsicherheit
 * nie in Richtung Freigabe aufgelöst werden; das Versprechen „bei ‚unklar'
 * nennt die Ansicht keine Entscheidung, nur die Werte" steht seit 1a im
 * Produkt und gilt hier erst recht.
 */

import { UNCLEAR_BELOW, segmentEdges, type ConfidenceSet, type SceneColumn, type WarnZone } from './model';
import type { StartWindowEntry } from '../../pointForecast/weatherEnrichment';

/** m/s → km/h. */
const MS_TO_KMH = 3.6;

/* ============================ Zustände ============================ */

export type GoStatus = 'go' | 'knapp' | 'unklar' | 'no-go';

/** Rangfolge: höher schlägt niedriger. `no-go > unklar > knapp > go` (C3). */
export const STATUS_RANK: Record<GoStatus, number> = { go: 0, knapp: 1, unklar: 2, 'no-go': 3 };

/** Das Wort zur Farbe — die Vorlage verlangt es ausdrücklich („nicht nur Farbe"). */
export const STATUS_WORD: Record<GoStatus, string> = {
  go: 'Go', knapp: 'knapp', unklar: 'unklar', 'no-go': 'No-Go',
};

export function worseStatus(a: GoStatus, b: GoStatus): GoStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/* ============================ Grenzwert-Katalog ============================ */

export type LimitId = 'gust' | 'wind' | 'rain' | 'apparent' | 'warn';

export interface EvalContext {
  /**
   * Amtliche Warnungen sind für diese Strecke überhaupt belegt (DE). In AT/CH
   * fehlt die Quelle — dort ist „keine Warnung" keine Aussage, sondern eine
   * Lücke, und der Grenzwert wird zu „unklar" statt zu „Go".
   */
  warnKnown: boolean;
}

export interface LimitDef {
  id: LimitId;
  label: string;
  unit: string;
  /** `max`: der Wert darf den Grenzwert nicht überschreiten. `min`: nicht unterschreiten. */
  dir: 'max' | 'min';
  /** Reglergrenzen des Editors. */
  min: number;
  max: number;
  step: number;
  /** Abstand zum Grenzwert, ab dem „knapp" gilt (in der Einheit der Größe). */
  margin: number;
  /** Konfidenzfeld, das für diese Größe zählt — `null`: die Größe ist keine Prognose. */
  conf: keyof ConfidenceSet | null;
  /** Die Quelle liefert die Größe nur in Deutschland. */
  deOnly?: boolean;
  /** Wert am Sample. `null` heißt „hier nicht entscheidbar", nicht „0". */
  read: (c: SceneColumn, ctx: EvalContext) => number | null;
  /**
   * Wert aus einem Startzeit-Kandidaten (schlechtester entlang der Tour).
   * Fehlt die Funktion, ist der Grenzwert in der Startsuche nicht prüfbar (C4).
   */
  fromStart?: (e: StartWindowEntry) => number | null;
  /** Chip-Text zum eingestellten Wert. */
  text: (v: number) => string;
  /**
   * Die Größe als Nennform **nach „für"**. Der Chip-Text taugt dafür nicht
   * („für Gefühlt"), und ein Satzsubjekt zöge Numerus- und Kasusregeln nach
   * sich („die Böen IST", „für DER Regen"). Alle Formen hier sind entweder
   * artikellos oder feminin — dann sind Nominativ und Akkusativ gleich.
   */
  noun: string;
  /** Wert mit Einheit, wie er in Sätzen und Listen steht. */
  fmt: (v: number) => string;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');

/**
 * Der Katalog. Reihenfolge = Anzeigereihenfolge. Er enthält genau die Größen,
 * die an jedem Sample wirklich hängen — siehe Kopfkommentar zu „Sicht".
 */
export const LIMITS: LimitDef[] = [
  {
    id: 'gust', noun: 'Böen', label: 'Böen', unit: 'km/h', dir: 'max',
    min: 10, max: 120, step: 5, margin: 5, conf: 'gust',
    read: (c) => c.gustKmh,
    fromStart: (e) => e.peakGustMps * MS_TO_KMH,
    text: (v) => `Böen ≤ ${v} km/h`,
    fmt: (v) => `${Math.round(v)} km/h`,
  },
  {
    id: 'wind', noun: 'Wind', label: 'Wind', unit: 'km/h', dir: 'max',
    min: 10, max: 100, step: 5, margin: 5, conf: 'wind',
    read: (c) => c.windKmh,
    fromStart: (e) => e.peakWindMps * MS_TO_KMH,
    text: (v) => `Wind ≤ ${v} km/h`,
    fmt: (v) => `${Math.round(v)} km/h`,
  },
  {
    id: 'rain', noun: 'Regen', label: 'Regen', unit: 'mm/h', dir: 'max',
    min: 0.5, max: 20, step: 0.5, margin: 0.5, conf: 'precipitation',
    read: (c) => c.precipMmH,
    fromStart: (e) => e.peakMmH,
    text: (v) => `Regen ≤ ${n1(v)} mm/h`,
    fmt: (v) => `${n1(v)} mm/h`,
  },
  {
    id: 'apparent', noun: 'die gefühlte Temperatur', label: 'Gefühlt', unit: '°C', dir: 'min',
    min: -25, max: 20, step: 1, margin: 2, conf: 'temperature',
    read: (c) => c.apparentC,
    fromStart: (e) => e.minApparentC,
    text: (v) => `Gefühlt ≥ ${v} °C`,
    fmt: (v) => `${n1(v)} °C`,
  },
  {
    id: 'warn', noun: 'die amtliche Warnung', label: 'Amtliche Warnung', unit: 'Stufe', dir: 'max',
    min: 0, max: 4, step: 1, margin: 1, conf: null, deOnly: true,
    // Ohne Quelle ist „keine Warnung" keine Aussage — dann `null` (= unklar).
    read: (c, ctx) => (ctx.warnKnown ? (c.warnLevel ?? 0) : null),
    // Kein `fromStart`: siehe C4 im Kopfkommentar.
    text: (v) => (v === 0 ? 'Keine amtliche Warnung' : `Warnung höchstens Stufe ${v}`),
    fmt: (v) => (v === 0 ? 'keine' : `Stufe ${Math.round(v)}`),
  },
];

export function limitDef(id: LimitId): LimitDef {
  const d = LIMITS.find((x) => x.id === id);
  if (!d) throw new Error(`unbekannter Grenzwert: ${id}`);
  return d;
}

/** Aktive Grenzwerte mit ihrem eingestellten Wert. Fehlt ein Schlüssel, ist er aus. */
export type LimitSet = Partial<Record<LimitId, number>>;

/**
 * Startwerte — **keine Empfehlung**. Böen 40 km/h ist derselbe Ausgangswert,
 * den das bestehende Go/No-Go-Panel seit Epic E benutzt (`DEFAULT_GONOGO`);
 * er steht hier, damit die Ansicht beim ersten Öffnen etwas rechnen kann, und
 * die Oberfläche sagt an der Stelle, an der er zum ersten Mal erscheint, dass
 * er eine Vorgabe des Nutzers werden soll (§17.5 G1).
 *
 * Bewusst **nicht** je Bewegungsart verschieden: eine Tabelle „Rennrad 35,
 * Bergwandern 45" behauptete eine Fachkenntnis, die das Projekt nicht belegen
 * kann. Die Bewegungsart steht ohnehin in der Krume.
 */
export const DEFAULT_LIMITS: LimitSet = { gust: 40, rain: 2, apparent: 0 };

export const LIMITS_STORE_KEY = 'bsc.route3d.limits';
const LIMITS_STORE_VERSION = 1;

export interface StoredLimits {
  limits: LimitSet;
  /** Der Nutzer hat die Startwerte angefasst — erst dann sind es „seine". */
  touched: boolean;
}

export function loadLimits(): StoredLimits {
  try {
    const raw = localStorage.getItem(LIMITS_STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { v?: number; limits?: unknown; touched?: unknown };
      if (p && p.v === LIMITS_STORE_VERSION && p.limits && typeof p.limits === 'object') {
        return { limits: sanitizeLimits(p.limits as Record<string, unknown>), touched: p.touched === true };
      }
    }
  } catch { /* privater Modus — dann eben die Startwerte */ }
  return { limits: { ...DEFAULT_LIMITS }, touched: false };
}

export function saveLimits(limits: LimitSet, touched = true): void {
  try {
    localStorage.setItem(LIMITS_STORE_KEY, JSON.stringify({ v: LIMITS_STORE_VERSION, limits, touched }));
  } catch { /* privater Modus — egal */ }
}

/** Fremde Schlüssel und unbrauchbare Zahlen fliegen raus, statt still zu wirken. */
export function sanitizeLimits(raw: Record<string, unknown>): LimitSet {
  const out: LimitSet = {};
  for (const def of LIMITS) {
    const v = raw[def.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[def.id] = Math.min(def.max, Math.max(def.min, v));
  }
  return Object.keys(out).length ? out : { ...DEFAULT_LIMITS };
}

/* ============================ Bewertung je Spalte ============================ */

export interface LimitHit {
  id: LimitId;
  value: number;
  limit: number;
  /** `over` = Grenzwert gerissen, `near` = innerhalb der „knapp"-Spanne. */
  kind: 'over' | 'near';
  /**
   * Abstand zum Grenzwert in Einheiten der „knapp"-Spanne — dadurch über
   * Größen hinweg vergleichbar (km/h gegen mm/h gegen °C). Positiv = darüber.
   */
  severity: number;
  /** Konfidenz der geprüften Größe (0..1), `null` wenn keine geführt wird. */
  conf: number | null;
}

export interface UnclearReason {
  id: LimitId;
  /** `missing` = kein Wert an dieser Stelle, `confidence` = Prognose zu unsicher. */
  why: 'missing' | 'confidence';
}

export interface ColumnVerdict {
  status: GoStatus;
  /** Treffer, schlimmster zuerst. */
  hits: LimitHit[];
  unclear: UnclearReason[];
}

export function evaluateColumn(c: SceneColumn, limits: LimitSet, ctx: EvalContext): ColumnVerdict {
  const hits: LimitHit[] = [];
  const unclear: UnclearReason[] = [];

  for (const def of LIMITS) {
    const limit = limits[def.id];
    if (limit == null) continue;

    const value = def.read(c, ctx);
    if (value == null) { unclear.push({ id: def.id, why: 'missing' }); continue; }

    const conf = def.conf ? (c.confidence?.[def.conf] ?? null) : null;
    // Abstand über dem Grenzwert, positiv = gerissen.
    const excess = def.dir === 'max' ? value - limit : limit - value;
    const severity = excess / def.margin;

    if (excess > 0) {
      hits.push({ id: def.id, value, limit, kind: 'over', severity, conf });
      continue;                                   // Überschreitung schlägt Unsicherheit (C3)
    }
    if (conf != null && conf < UNCLEAR_BELOW) {
      unclear.push({ id: def.id, why: 'confidence' });
      continue;
    }
    if (excess > -def.margin) hits.push({ id: def.id, value, limit, kind: 'near', severity, conf });
  }

  hits.sort((a, b) => b.severity - a.severity);

  const status: GoStatus = hits.some((h) => h.kind === 'over')
    ? 'no-go'
    : unclear.length > 0
      ? 'unklar'
      : hits.length > 0
        ? 'knapp'
        : 'go';

  return { status, hits, unclear };
}

/* ============================ Abschnitte ============================ */

export interface GoSection {
  fromIdx: number;
  toIdx: number;
  fromM: number;
  toM: number;
  fromMs: number;
  toMs: number;
  status: GoStatus;
  /** Der ausschlaggebende Treffer im Abschnitt — `null`, wenn es keinen gibt. */
  lead: LimitHit | null;
  /** Spalte, an der `lead` auftrat. Die „Warum"-Karte zeigt genau sie. */
  leadIdx: number;
  /** Gründe, wenn der Abschnitt „unklar" ist (entdoppelt). */
  unclear: UnclearReason[];
}

/**
 * Benachbarte Spalten gleichen Status zu Abschnitten verschmelzen.
 *
 * Die Kanten kommen aus `segmentEdges` — ein Sample steht für seine Umgebung,
 * nicht für einen Punkt (§17.3 C10, dieselbe Regel wie die Regenfenster in 1b).
 */
export function goSections(columns: SceneColumn[], limits: LimitSet, ctx: EvalContext): GoSection[] {
  if (!columns.length) return [];
  const verdicts = columns.map((c) => evaluateColumn(c, limits, ctx));
  const out: GoSection[] = [];

  let from = 0;
  const flush = (to: number) => {
    const status = verdicts[from].status;
    let lead: LimitHit | null = null;
    let leadIdx = from;
    const seen = new Set<string>();
    const unclear: UnclearReason[] = [];
    for (let i = from; i <= to; i++) {
      for (const h of verdicts[i].hits) {
        // Der Abschnitt wird von dem Treffer geführt, der seinen Status erklärt.
        if (status === 'no-go' && h.kind !== 'over') continue;
        if (!lead || h.severity > lead.severity) { lead = h; leadIdx = i; }
      }
      for (const u of verdicts[i].unclear) {
        const key = `${u.id}:${u.why}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unclear.push(u);
      }
    }
    const e = segmentEdges(columns, from, to);
    out.push({ fromIdx: from, toIdx: to, ...e, status, lead, leadIdx, unclear });
  };

  for (let i = 1; i < columns.length; i++) {
    if (verdicts[i].status !== verdicts[from].status) { flush(i - 1); from = i; }
  }
  flush(columns.length - 1);
  return out;
}

export function overallStatus(sections: GoSection[]): GoStatus {
  return sections.reduce<GoStatus>((acc, s) => worseStatus(acc, s.status), 'go');
}

/** Der Abschnitt, in dem eine Position liegt. */
export function sectionAtDist(sections: GoSection[], distM: number): GoSection | null {
  for (const s of sections) if (distM >= s.fromM && distM <= s.toM) return s;
  return sections.length ? (distM < sections[0].fromM ? sections[0] : sections[sections.length - 1]) : null;
}

/** Der schwerste Abschnitt — der, den die Statuskarte oben zeigt. */
export function leadSection(sections: GoSection[]): GoSection | null {
  let best: GoSection | null = null;
  for (const s of sections) {
    if (!best) { best = s; continue; }
    const r = STATUS_RANK[s.status] - STATUS_RANK[best.status];
    if (r > 0) { best = s; continue; }
    if (r === 0 && (s.lead?.severity ?? -Infinity) > (best.lead?.severity ?? -Infinity)) best = s;
  }
  return best && best.status === 'go' ? null : best;
}

/* ============================ Begründung ============================ */

export function kmLabel(m: number): string {
  return (Math.round(m / 100) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Der Satz unter dem Status. Er nennt **immer** den Grenzwert, gegen den
 * gemessen wurde — ein Ton ohne Zahl wäre in einer Entscheidungsansicht wertlos
 * (§17.3 C8).
 */
export function reasonSentence(sec: GoSection, warnZones: WarnZone[] = []): string {
  const span = `zwischen km ${kmLabel(sec.fromM)} und ${kmLabel(sec.toM)}`;

  if (sec.status === 'unklar') {
    const missing = sec.unclear.filter((u) => u.why === 'missing').map((u) => limitDef(u.id).noun);
    const shaky = sec.unclear.filter((u) => u.why === 'confidence').map((u) => limitDef(u.id).noun);
    const parts: string[] = [];
    // Doppelpunkt statt Fortsetzung: nur so bleiben BEIDE Teilsätze deutsch,
    // auch wenn nur einer von ihnen entsteht.
    if (missing.length) parts.push(`kein Wert für ${listWords(missing)}`);
    if (shaky.length) parts.push(`Prognose zu unsicher für ${listWords(shaky)} (Konfidenz unter ${UNCLEAR_BELOW.toLocaleString('de-DE')})`);
    return `${cap(span)}: ${parts.join(', ')} — die Ansicht nennt hier keine Entscheidung, nur die Werte.`;
  }

  if (!sec.lead) return `${cap(span)} hält die Strecke alle deine Grenzwerte.`;

  const d = limitDef(sec.lead.id);
  const rel = d.dir === 'max' ? 'liegt bei' : 'liegt bei';
  const head = sec.status === 'no-go'
    ? `${d.label} ${d.fmt(sec.lead.value)} ${span} — dein Grenzwert ${rel} ${d.fmt(sec.lead.limit)}.`
    : `${d.label} ${d.fmt(sec.lead.value)} ${span} — knapp an deinem Grenzwert von ${d.fmt(sec.lead.limit)}.`;

  const overlap = warnZones.find((z) => z.toM >= sec.fromM && z.fromM <= sec.toM);
  if (!overlap) return head;
  return `${head} Amtliche Warnung Stufe ${overlap.level} („${overlap.event}") deckt sich mit dem Abschnitt.`;
}

/**
 * Kurzgrund für eine „unklar"-Zeile. Sie darf NICHT den Messwert zeigen: im
 * Browser stand „unklar · Böen 35 km/h" bei einem Grenzwert von 40 — die Zahl
 * hielt den Grenzwert, unklar war die Konfidenz. Ein Wert an dieser Stelle
 * beantwortet die falsche Frage.
 */
export function unclearShort(list: UnclearReason[]): string {
  if (!list.length) return 'ohne Entscheidung';
  const miss = list.filter((u) => u.why === 'missing').map((u) => limitDef(u.id).label);
  const shaky = list.filter((u) => u.why === 'confidence').map((u) => limitDef(u.id).label);
  if (miss.length && shaky.length) return `${listWords(miss)} ohne Wert · ${listWords(shaky)} unsicher`;
  if (miss.length) return `${listWords(miss)}: kein Wert`;
  return `${listWords(shaky)}: Prognose unsicher`;
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================ Chip-Zusammenfassung ============================ */

export interface LimitSummary {
  id: LimitId;
  /** Schlechtester Wert entlang der Strecke — `null`, wenn nirgends bestimmbar. */
  value: number | null;
  /** Wie dieser Wert zum Grenzwert steht. */
  kind: 'over' | 'near' | 'ok' | 'missing';
  /** Spaltenindex des schlechtesten Werts. */
  atIdx: number;
}

/**
 * Je aktivem Grenzwert der schlechteste Wert der Strecke — das, was der Chip
 * zeigt („Regen ≤ 2 mm/h · 1,4" bzw. „überschritten").
 *
 * `missing` heißt hier wirklich „die Größe ist auf dieser Strecke nicht
 * belegt" (etwa die amtliche Warnung in AT/CH) und nicht „alles in Ordnung".
 */
export function summarizeLimits(columns: SceneColumn[], limits: LimitSet, ctx: EvalContext): LimitSummary[] {
  const out: LimitSummary[] = [];
  for (const def of LIMITS) {
    const limit = limits[def.id];
    if (limit == null) continue;
    let worst: number | null = null;
    let atIdx = 0;
    let seen = false;
    for (let i = 0; i < columns.length; i++) {
      const v = def.read(columns[i], ctx);
      if (v == null) continue;
      seen = true;
      if (worst == null || (def.dir === 'max' ? v > worst : v < worst)) { worst = v; atIdx = i; }
    }
    if (!seen || worst == null) { out.push({ id: def.id, value: null, kind: 'missing', atIdx: 0 }); continue; }
    const excess = def.dir === 'max' ? worst - limit : limit - worst;
    const kind: LimitSummary['kind'] = excess > 0 ? 'over' : excess > -def.margin ? 'near' : 'ok';
    out.push({ id: def.id, value: worst, kind, atIdx });
  }
  return out;
}

/* ============================ Startzeit-Suche ============================ */

export interface GoStartHit {
  offsetMin: number;
  startMs: number;
  /** Grenzwerte, die in der Suche gar nicht geprüft werden konnten (C4). */
  unchecked: LimitId[];
}

/**
 * Der **früheste** Start im Kandidatenfenster, der alle prüfbaren Grenzwerte
 * hält. `null`, wenn es keinen gibt — dann sagt `goStartNote` warum, statt
 * einen halb passenden vorzuschlagen.
 *
 * Geprüft wird nur, was im Kandidaten steht (`LimitDef.fromStart`). Die
 * amtliche Warnung ist nicht dabei und wird als `unchecked` genannt: sie
 * verschwiege sonst, dass die Suche eine Größe übergeht (C4).
 */
export function goStartSearch(
  entries: StartWindowEntry[],
  limits: LimitSet,
  startMs: number,
): GoStartHit | null {
  const active = LIMITS.filter((d) => limits[d.id] != null);
  const unchecked = active.filter((d) => !d.fromStart).map((d) => d.id);

  const ok = entries
    .filter((e) => e.complete && entryPasses(e, limits))
    .sort((a, b) => a.offsetMin - b.offsetMin);
  if (!ok.length) return null;

  return { offsetMin: ok[0].offsetMin, startMs: startMs + ok[0].offsetMin * 60_000, unchecked };
}

/** Hält dieser Kandidat alle prüfbaren Grenzwerte? Ein fehlender Wert zählt als „nein". */
export function entryPasses(e: StartWindowEntry, limits: LimitSet): boolean {
  for (const def of LIMITS) {
    const limit = limits[def.id];
    if (limit == null || !def.fromStart) continue;
    const v = def.fromStart(e);
    if (v == null) return false;
    if (def.dir === 'max' ? v > limit : v < limit) return false;
  }
  return true;
}

/**
 * Was zu sagen ist, wenn `goStartSearch` nichts findet — oder wenn der
 * gewählte Start selbst schon der früheste passende ist.
 */
export function goStartNote(entries: StartWindowEntry[], hit: GoStartHit | null): string {
  const usable = entries.filter((e) => e.complete);
  if (!usable.length) {
    return 'Für andere Startzeiten reicht der Vorhersage-Horizont nicht weit genug — die Suche bleibt aus.';
  }
  if (!hit) {
    return 'Keine Startzeit im Fenster ±2 h hält alle deine Grenzwerte.';
  }
  const rest = hit.unchecked.map((id) => limitDef(id).label);
  const tail = rest.length
    ? ` ${listWords(rest)} wird dabei nicht geprüft — die Suche rechnet ohne einen zweiten Abfragefächer.`
    : '';
  const base = hit.offsetMin === 0
    ? 'Dein Start ist der früheste, der alle Grenzwerte hält.'
    : `Mit ${hit.offsetMin < 0 ? 'einem früheren' : 'einem späteren'} Start hältst du alle Grenzwerte.`;
  return `${base} Die Fahrzeiten bleiben dabei fest — „Startzeit übernehmen" rechnet anschließend echt neu.${tail}`;
}

/* ============================ Bericht ============================ */

export interface ReportInput {
  title: string;
  movementLabel: string;
  startMs: number;
  endMs: number;
  totalM: number;
  stackLabel: string;
  sections: GoSection[];
  limits: LimitSet;
  /** Grenzwerte, die auf dieser Strecke gar nicht belegt sind (z. B. Warnung in AT/CH). */
  unavailable: LimitId[];
}

/**
 * Die Auswertung als Text — dasselbe, was `GoNoGoPanel.buildReport()` für den
 * Punkt tut, hier je Abschnitt. **Kein Link:** `src/route/` hält keinen Zustand
 * in der URL, und eine hochgeladene GPX passt in keine (B3/C7); ein geteilter
 * Link führte den Empfänger auf eine leere Tourenplanung.
 */
export function buildGoNoGoReport(inp: ReportInput): string {
  const L: string[] = [];
  const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  L.push('BUSCOSUN · Tourenplanung · Go/No-Go-Auswertung');
  L.push('='.repeat(46));
  L.push(`Strecke:      ${inp.title}`);
  L.push(`Art:          ${inp.movementLabel}`);
  L.push(`Datum:        ${day(inp.startMs)}`);
  L.push(`Zeitfenster:  ${clock(inp.startMs)} – ${clock(inp.endMs)} · ${kmLabel(inp.totalM)} km`);
  L.push(`Quellen:      ${inp.stackLabel}`);
  L.push('');

  L.push('MEINE GRENZWERTE');
  for (const def of LIMITS) {
    const v = inp.limits[def.id];
    if (v == null) continue;
    const off = inp.unavailable.includes(def.id) ? '   (auf dieser Strecke nicht belegt)' : '';
    L.push(`  ${def.text(v)}${off}`);
  }
  L.push('');

  L.push(`GESAMT:       ${STATUS_WORD[overallStatus(inp.sections)].toUpperCase()}`);
  L.push('');
  L.push('ABSCHNITTE');
  for (const s of inp.sections) {
    L.push(`  km ${kmLabel(s.fromM)}–${kmLabel(s.toM)} · ${STATUS_WORD[s.status]} · ${clock(s.fromMs)}–${clock(s.toMs)}`);
    L.push(`    ${reasonSentence(s)}`);
  }
  L.push('');
  L.push('Die Grenzwerte sind deine eigene Vorgabe, keine amtliche Empfehlung.');
  L.push('Bei „unklar" nennt die Auswertung keine Entscheidung, nur die Werte.');
  return L.join('\n');
}
