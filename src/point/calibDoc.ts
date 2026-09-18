/**
 * calibDoc.ts — `point/calib.json` Schema 2: gemessene Einträge, ihre Prüfung und ihre Abbildung auf die
 * Einspeisestellen von buscosun Fusion (Phase FI, AP13; `audit/fusion-vollform.md` §2.5, E-F-20).
 *
 * ── Warum ein eigenes Modul neben `calibration.ts` ──────────────────────────
 * `calibration.ts` trägt den INHALT der ausgelieferten Datei (Schema 1, fast alles `null`, lange Quellentexte).
 * Der Client braucht davon nichts — er braucht die Regel, nach der ein Eintrag gelten darf, und die Abbildung
 * auf die Rechnung. Beides steht hier, klein und rein, damit der Cube-Chunk nicht den Katalog mitschleppt.
 * Der Fit (`calibFit.ts`) und der Leser (`client/calibPoint.ts`) nehmen dieselben Bins und dieselben n_min —
 * EINE Stelle, nie zwei Fassungen.
 *
 * ── Die Regel ───────────────────────────────────────────────────────────────
 * Nur `measured` wirkt, und nur mit Beleg: Schema ≥ 2, `n` und `days` je Wert mindestens `CALIB_N_MIN`,
 * `period`, `estimator`, `fitVersion`. Ein Eintrag, der die Regel verletzt, wird EINZELN verworfen (mit Grund),
 * nie die ganze Datei; die Rechnung nimmt dann die Setzung (`set`) und sagt es. Schema 1 darf kein `measured`
 * tragen (bis AP10 gibt es keine Messung — der Selbsttest von `calibration.ts` hält das fest).
 */

export type CalibProvenance = 'measured' | 'literature' | 'physical' | 'set' | null;

/** Lesbare Schemata. 1 = ausgeliefert (PD-A), 2 = mit Messbeleg je Eintrag (AP13). */
export const CALIB_SCHEMAS_READABLE: readonly number[] = Object.freeze([1, 2]);

/**
 * Vorlauf-Bins (Stunden ab jetzt, wie die Skill-Kurven — `lead:set`). Bin i gilt für `from_i ≤ lead < from_{i+1}`,
 * das letzte bis zum Ende; so fallen die Achsenlücken (49–50, 121–125 h) in den Bin davor. Dieselben Grenzen wie die
 * Scorecards (`fusion-implementierung.md` §5.3).
 */
export const CALIB_BINS_H: readonly (readonly [number, number])[] = Object.freeze(
  ([[0, 6], [7, 24], [25, 48], [51, 120], [126, 240], [246, 336]] as const).map((b) => Object.freeze([b[0], b[1]] as const)),
);

export function calibBinOf(leadH: number): number {
  let i = 0;
  for (let k = 0; k < CALIB_BINS_H.length; k++) if (leadH >= CALIB_BINS_H[k][0]) i = k;
  return i;
}

/** Größen der gebinnten Einträge (Schlüssel in `calib.json`) und ihre Namen in `uncertainty.ts`. */
export const CALIB_VARS = Object.freeze(['t2m', 'td2m', 'wind', 'gust', 'clct'] as const);
export type CalibVar = (typeof CALIB_VARS)[number];
export const CALIB_VAR_UNC: Readonly<Record<CalibVar, 'temperature' | 'dewpoint' | 'wind' | 'gust' | 'clouds'>> = Object.freeze({
  t2m: 'temperature', td2m: 'dewpoint', wind: 'wind', gust: 'gust', clct: 'clouds',
});

/** Die Flags, deren Konfidenz-Abschlag gefittet wird (Schlüssel wie `CONF_DISCOUNT` in `uncertainty.ts`). */
export const CALIB_CONF_KEYS = Object.freeze(['caseC', 'caseB', 'dhOver300', 'chunkBorder', 'interpolated', 'nowcastFallback', 'stationFar'] as const);
export type CalibConfKey = (typeof CALIB_CONF_KEYS)[number];

/**
 * Mindestbeleg je Fit-Schlüssel (Pfad in `calib.json`), `set` — die Registry (`fusion-vollform.md` §2.5). `n` zählt
 * Fälle (Punkt × Stunde bzw. je Wert), `days` verschiedene Slot-Tage. Ein Pfad, der hier fehlt, ist kein
 * Fit-Schlüssel: `measured` wird dort verworfen (Σ und dzMin gehören dem Producer, V-FI-71).
 */
export const CALIB_N_MIN: Readonly<Record<string, { readonly n: number; readonly days: number }>> = Object.freeze({
  sigmaSys: { n: 1000, days: 30 },
  cSpread: { n: 300, days: 30 },
  confDiscount: { n: 200, days: 10 },
  Ld: { n: 1000, days: 30 },
  Lh: { n: 1000, days: 30 },
  kappaLambda: { n: 1000, days: 30 },
  zBlend: { n: 1000, days: 30 },
  A: { n: 200, days: 20 },
  Auhi: { n: 200, days: 20 },
  'fRad.a': { n: 200, days: 20 },
  'fRad.vRef': { n: 200, days: 20 },
  'fRad.epsilon': { n: 200, days: 20 },
  'phi.knots': { n: 200, days: 15 },
  poolDepth: { n: 100, days: 15 },
  meltOffset: { n: 100, days: 10 },
  tpiSigma: { n: 100, days: 0 },
});

/** Gemessen, aber heute ohne Einspeisestelle in der Rechnung (Notiz statt stiller Wirkung) — §9.1.1. */
export const CALIB_UNWIRED: ReadonlySet<string> = new Set(['phi.knots', 'poolDepth', 'kappaLambda', 'meltOffset']);

export interface CalibPeriod { from: string; to: string }

/** Ein Eintrag, wie ihn Schema 2 für `measured` verlangt; die Felder nach `pap` sind in Schema 1 abwesend. */
export interface CalibEntryDoc {
  value: unknown;
  provenance: CalibProvenance;
  source: string;
  updatedAt: string | null;
  unit?: string;
  pap?: string;
  n?: unknown;
  days?: unknown;
  period?: CalibPeriod;
  estimator?: string;
  strata?: string;
  ci90?: unknown;
  fitVersion?: string;
  /** Nur gebinnte Einträge: die Bins, mit denen gefittet wurde — müssen `CALIB_BINS_H` sein. */
  binsH?: unknown;
}

export interface CalibValidation {
  schema: number | null;
  /** Das Dokument ist lesbar (Schema bekannt, Objekt). */
  readable: boolean;
  /** Pfade der `measured`-Einträge, die gelten dürfen. */
  accepted: string[];
  /** Pfade der verworfenen `measured`-Einträge mit Grund. */
  rejected: Array<{ path: string; why: string }>;
  entries: Map<string, CalibEntryDoc>;
}

const isObj = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x);
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isoDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && Number.isFinite(Date.parse(s));

/** Alle Einträge (Objekte mit value/provenance/source) mit Pfad — dieselbe Erkennung wie der Selbsttest. */
export function calibEntries(doc: unknown): Map<string, CalibEntryDoc> {
  const out = new Map<string, CalibEntryDoc>();
  const walk = (o: unknown, path: string) => {
    if (!isObj(o)) return;
    if ('value' in o && 'provenance' in o && 'source' in o) { out.set(path, o as unknown as CalibEntryDoc); return; }
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  walk(doc, '');
  return out;
}

/** Prüft einen Wert gegen seinen Beleg (gleiche Form); `null`-Werte brauchen keinen Beleg. */
function checkBinned(e: CalibEntryDoc, min: { n: number; days: number }, positive: boolean): string | null {
  if (!isObj(e.value) || !isObj(e.n) || !isObj(e.days)) return 'gebinnter Wert braucht value/n/days je Größe';
  if (JSON.stringify(e.binsH) !== JSON.stringify(CALIB_BINS_H)) return `binsH ≠ ${JSON.stringify(CALIB_BINS_H)}`;
  let any = false;
  for (const [v, arr] of Object.entries(e.value)) {
    if (!(CALIB_VARS as readonly string[]).includes(v)) return `unbekannte Größe ${v}`;
    const ns = (e.n as Record<string, unknown>)[v], ds = (e.days as Record<string, unknown>)[v];
    if (!Array.isArray(arr) || arr.length !== CALIB_BINS_H.length || !Array.isArray(ns) || !Array.isArray(ds)
      || ns.length !== arr.length || ds.length !== arr.length) return `${v}: je Bin ein Wert, ein n und ein days`;
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (x == null) continue;
      if (!fin(x) || (positive && !(x > 0))) return `${v}[${i}]: kein gültiger Wert`;
      if (!fin(ns[i]) || (ns[i] as number) < min.n) return `${v}[${i}]: n ${String(ns[i])} < ${min.n}`;
      if (!fin(ds[i]) || (ds[i] as number) < min.days) return `${v}[${i}]: days ${String(ds[i])} < ${min.days}`;
      any = true;
    }
  }
  return any ? null : 'kein Bin trägt einen Wert';
}

function checkScalarBeleg(e: CalibEntryDoc, min: { n: number; days: number }): string | null {
  if (!fin(e.n) || e.n < min.n) return `n ${String(e.n)} < ${min.n}`;
  if (!fin(e.days) || e.days < min.days) return `days ${String(e.days)} < ${min.days}`;
  return null;
}

function checkValue(path: string, e: CalibEntryDoc): string | null {
  const min = CALIB_N_MIN[path];
  const v = e.value;
  switch (path) {
    case 'sigmaSys': case 'cSpread': return checkBinned(e, min, true);
    case 'confDiscount': {
      if (!isObj(v)) return 'value je Flag';
      for (const [k, x] of Object.entries(v)) {
        if (!(CALIB_CONF_KEYS as readonly string[]).includes(k)) return `unbekanntes Flag ${k}`;
        if (!fin(x) || x <= 0 || x > 1) return `${k}: Abschlag muss in (0, 1] liegen`;
      }
      if (!isObj(e.n)) return 'n je Flag';
      for (const k of Object.keys(v)) { const n = (e.n as Record<string, unknown>)[k]; if (!fin(n) || n < min.n) return `${k}: n ${String(n)} < ${min.n}`; }
      return fin(e.days) && e.days >= min.days ? null : `days ${String(e.days)} < ${min.days}`;
    }
    case 'Ld': {
      if (!isObj(v) || !Object.keys(v).length) return 'value je Stufe (t1/t2/t3)';
      for (const [k, x] of Object.entries(v)) if (!['t1', 't2', 't3'].includes(k) || !fin(x) || !(x > 0)) return `Ld.${k} ungültig`;
      return checkScalarBeleg(e, min);
    }
    case 'A': case 'Auhi': case 'tpiSigma': {
      if (!isObj(v) || !fin(v.default)) return 'value.default fehlt';
      for (const [k, x] of Object.entries(v)) if (!fin(x) || (path === 'tpiSigma' && !(x > 0))) return `${path}.${k} ungültig`;
      return checkScalarBeleg(e, min);
    }
    case 'phi.knots': {
      if (!Array.isArray(v) || v.length < 2) return 'mindestens zwei Stützstellen';
      let pu = -Infinity, pp = -Infinity;
      for (const k of v) {
        if (!Array.isArray(k) || k.length !== 2 || !fin(k[0]) || !fin(k[1])) return 'Stützstelle [u, φ]';
        if (k[0] <= pu || k[1] < pp) return 'φ muss monoton steigen';
        pu = k[0]; pp = k[1];
      }
      const first = v[0] as number[], last = v[v.length - 1] as number[];
      if (first[0] !== 0 || first[1] !== 0 || last[0] !== 1 || last[1] !== 1) return 'φ(0) = 0 und φ(1) = 1';
      return checkScalarBeleg(e, min);
    }
    case 'fRad.epsilon':
      if (!fin(v) || !(v > 0) || v >= 1) return 'ε in (0, 1)';
      return checkScalarBeleg(e, min);
    case 'meltOffset':
      if (!fin(v)) return 'kein gültiger Wert';
      return checkScalarBeleg(e, min);
    default:   // Lh, zBlend, poolDepth, kappaLambda, fRad.a, fRad.vRef — positive Skalare
      if (!fin(v) || !(v > 0)) return 'kein gültiger positiver Wert';
      return checkScalarBeleg(e, min);
  }
}

/** Prüft ein ganzes Dokument; verwirft `measured`-Einträge einzeln. */
export function validateCalibDocument(doc: unknown): CalibValidation {
  const schema = isObj(doc) && fin(doc.schema) ? doc.schema : null;
  const readable = schema != null && CALIB_SCHEMAS_READABLE.includes(schema);
  const entries = readable ? calibEntries(doc) : new Map<string, CalibEntryDoc>();
  const accepted: string[] = [];
  const rejected: Array<{ path: string; why: string }> = [];
  for (const [path, e] of entries) {
    if (e.provenance !== 'measured') continue;
    const why = schema! < 2 ? 'Schema 1 trägt kein measured'
      : !CALIB_N_MIN[path] ? 'kein Fit-Schlüssel (Producer-Parameter oder unbekannt)'
      : !(e.period && isoDay(e.period.from) && isoDay(e.period.to) && Date.parse(e.period.from) <= Date.parse(e.period.to)) ? 'period {from, to} fehlt oder ungültig'
      : !(typeof e.estimator === 'string' && e.estimator.length > 0) ? 'estimator fehlt'
      : !(typeof e.fitVersion === 'string' && e.fitVersion.length > 0) ? 'fitVersion fehlt'
      : !isoDay(e.updatedAt) ? 'updatedAt fehlt'
      : checkValue(path, e);
    if (why) rejected.push({ path, why }); else accepted.push(path);
  }
  return { schema, readable, accepted, rejected, entries };
}

/** Was die Rechnung aus den geltenden Einträgen übernimmt — nur `measured`, sonst bleiben die Setzungen. */
export interface CalibOverrides {
  /** Je Größe (uncertainty-Namen) ein Wert je Bin; `null` = Bin nicht belegt ⇒ Setzung. */
  sigmaSys?: Partial<Record<'temperature' | 'dewpoint' | 'wind' | 'gust' | 'clouds', ReadonlyArray<number | null>>>;
  cSpread?: Partial<Record<'temperature' | 'dewpoint' | 'wind' | 'gust' | 'clouds', ReadonlyArray<number | null>>>;
  LdM?: Partial<Record<'t1' | 't2' | 't3', number>>;
  LhM?: number;
  A?: number;
  Auhi?: number;
  tpiSigmaM?: number;
  fRad?: { a?: number; vRefMs?: number; epsilon?: number };
  zBlendM?: number;
  confDiscount?: Partial<Record<CalibConfKey, number>>;
  /** Je geltendem Pfad der Beleg für den calib-Text. */
  meta: Record<string, { n: number; days: number; period: CalibPeriod; estimator: string; fitVersion: string }>;
  /** Gemessen, aber ohne Einspeisestelle (Notiz). */
  unwired: string[];
}

const sumN = (n: unknown): number => {
  if (fin(n)) return n;
  if (Array.isArray(n)) return n.reduce((a: number, x) => a + (fin(x) ? x : 0), 0);
  if (isObj(n)) return Object.values(n).reduce((a: number, x) => a + sumN(x), 0);
  return 0;
};
const maxDays = (d: unknown): number => {
  if (fin(d)) return d;
  if (Array.isArray(d)) return d.reduce((a: number, x) => Math.max(a, fin(x) ? x : 0), 0);
  if (isObj(d)) return Object.values(d).reduce((a: number, x) => Math.max(a, maxDays(x)), 0);
  return 0;
};

/** Die Abbildung auf die Einspeisestellen. `null`, wenn nichts gilt — dann rechnet alles wie ohne Datei. */
export function calibOverridesFrom(v: CalibValidation): CalibOverrides | null {
  if (!v.accepted.length) return null;
  const o: CalibOverrides = { meta: {}, unwired: [] };
  const binned = (e: CalibEntryDoc) => {
    const out: Record<string, Array<number | null>> = {};
    for (const [k, arr] of Object.entries(e.value as Record<string, Array<number | null>>)) out[CALIB_VAR_UNC[k as CalibVar]] = arr.map((x) => (x == null ? null : x));
    return out;
  };
  for (const path of v.accepted) {
    const e = v.entries.get(path)!;
    o.meta[path] = { n: sumN(e.n), days: maxDays(e.days), period: e.period!, estimator: e.estimator!, fitVersion: e.fitVersion! };
    if (CALIB_UNWIRED.has(path)) { o.unwired.push(path); continue; }
    const val = e.value as never;
    switch (path) {
      case 'sigmaSys': o.sigmaSys = binned(e); break;
      case 'cSpread': o.cSpread = binned(e); break;
      case 'Ld': o.LdM = { ...(val as Record<string, number>) }; break;
      case 'Lh': o.LhM = val; break;
      case 'A': o.A = (val as { default: number }).default; break;
      case 'Auhi': o.Auhi = (val as { default: number }).default; break;
      case 'tpiSigma': o.tpiSigmaM = (val as { default: number }).default; break;
      case 'fRad.a': o.fRad = { ...o.fRad, a: val }; break;
      case 'fRad.vRef': o.fRad = { ...o.fRad, vRefMs: val }; break;
      case 'fRad.epsilon': o.fRad = { ...o.fRad, epsilon: val }; break;
      case 'zBlend': o.zBlendM = val; break;
      case 'confDiscount': o.confDiscount = { ...(val as Record<CalibConfKey, number>) }; break;
      default: o.unwired.push(path);
    }
  }
  return o;
}

/** Der Wert eines gebinnten Eintrags für eine Größe und einen Vorlauf — `null` ⇒ die Setzung gilt. */
export function binnedAt(table: ReadonlyArray<number | null> | undefined, leadH: number): number | null {
  if (!table) return null;
  const x = table[calibBinOf(Math.max(0, leadH))];
  return x == null ? null : x;
}

/** Kurzbeleg für den calib-Text: „measured — n 12 340, 31 Tage, 2026-09-14…2026-10-14, Momente". */
export function calibMetaText(m: CalibOverrides['meta'][string] | undefined): string {
  if (!m) return '';
  return `measured — n ${m.n}, ${m.days} Tage, ${m.period.from.slice(0, 10)}…${m.period.to.slice(0, 10)}, ${m.estimator} (${m.fitVersion})`;
}
