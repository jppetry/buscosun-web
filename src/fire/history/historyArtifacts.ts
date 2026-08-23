/**
 * BH2 — Artefakte der Brand-Historie (`audit/brand-historie.md` §5 BH2).
 *
 * Aus der Ereignisdatei des Batch (BH1, `data/fire/bh/events.jsonl`, gitignored) entstehen
 * statische Dateien unter `public/fire/bh/`, die der Client (BH3/BH4) ohne FIRMS-Call lädt:
 *
 *   index-month-v1.json    Ereignisse des laufenden Kalendermonats (Q4), DE/AT/CH
 *   index-season-v1.json   Ereignisse der laufenden Saison 1.3.–31.10. (Q3); außerhalb der
 *                          Saison die zuletzt abgeschlossene
 *   ev/<jahr>/<monat>/<lat>_<lon>.json   Detail-Shards (1°-Zelle × Beginn-Monat): die vollen
 *                          Ereignisse inkl. Detektionen, Merkmalsatz und Evidenz — nur beim
 *                          Antippen geladen, eine Zelle je Klick
 *
 * Die Methode (`viirs-cluster`/`effis-rda`) und die Satelliten stehen NICHT im Index — beides ist
 * aus `hotspots`/`effisId` ableitbar bzw. steht im Shard (Größenmessung in `audit/brand-historie.md` §6).
 * Index-Zeilen sind **positional** (`fields` + Arrays), weil ein Saison-Index ~6 000 Zeilen
 * trägt und jeder Schlüsselname je Zeile Bytes kostet; `fieldsOf`/`rowOf` sind die EINE
 * Stelle, die die Reihenfolge kennt (Batch und Client importieren dieselbe). Kartenzeichnung
 * und Liste brauchen nur den Index; alles andere kommt aus dem Shard.
 *
 * Pur und netzfrei — der Batch `scripts/fire/bh/build-index.mjs` ist Ein-/Ausgabe.
 * `npm run verify:fire-history`.
 */

import type { HistoryEvent, HistoryDetection } from './historyEvents';
import { seasonWindow, SEASON_FROM_MONTH, SEASON_TO_MONTH } from './historyEvents';

export const HISTORY_ARTIFACT_VERSION = 1 as const;
export const HISTORY_BASE_URL = '/fire/bh';
export const INDEX_URL = { month: `${HISTORY_BASE_URL}/index-month-v1.json`, season: `${HISTORY_BASE_URL}/index-season-v1.json` } as const;

export type HistoryWindowKind = 'month' | 'season';

export interface HistoryWindow {
  kind: HistoryWindowKind;
  fromMs: number;
  toMs: number;
  /** z. B. „August 2026" · „Saison 2026 (1.3.–31.10.)". */
  label: string;
  /** `true`, wenn das Fenster den Auswertetag enthält (laufend), sonst abgeschlossen. */
  current: boolean;
}

/** Index-Zeile, entpackt. Nur DE/AT/CH (Q-Default: die BBox ist ein Rechteck, die Aussage nicht). */
export interface HistoryIndexEntry {
  id: string;
  country: 'DE' | 'AT' | 'CH';
  lat: number;
  lon: number;
  firstMs: number;
  lastMs: number;
  hotspots: number;
  overpasses: number;
  distinctDays: number;
  frpSumMw: number | null;
  frpMaxMw: number | null;
  statusKind: HistoryEvent['status']['kind'];
  /** Kartierte Fläche (EFFIS) bzw. Obergrenze aus dem Raster — wie `FireRecord.areaHa`. */
  areaHa: number | null;
  areaKind: HistoryEvent['areaHa']['kind'];
  /** AF4-Schätzung — NIE für Ereignisse auf einem Anlagenstandort (`site` und `site-deviating`). */
  estHa: number | null;
  estLowHa: number | null;
  estHighHa: number | null;
  effisId: string | null;
  placeName: string | null;
  placeDistrict: string | null;
  placeKm: number | null;
  anomalyKind: 'site' | 'site-deviating' | null;
  hullKm2: number;
  /** Zahl der NRT-Detektionen — > 0 heißt: kann durch SP noch wandern (Konzept §7). */
  nrt: number;
  /** [low, nominal, high, unknown] */
  confidence: [number, number, number, number];
}

export const INDEX_FIELDS = [
  'id', 'country', 'lat', 'lon', 'firstMs', 'lastMs', 'hotspots', 'overpasses', 'distinctDays',
  'frpSumMw', 'frpMaxMw', 'statusKind', 'areaHa', 'areaKind', 'estHa', 'estLowHa', 'estHighHa',
  'effisId', 'placeName', 'placeDistrict', 'placeKm', 'anomalyKind', 'hullKm2', 'nrt', 'confidence',
] as const satisfies readonly (keyof HistoryIndexEntry)[];

export type IndexRow = unknown[];

export interface HistoryIndexFile {
  version: typeof HISTORY_ARTIFACT_VERSION;
  /** Auswertezeitpunkt des Batch (BH1 `evaluatedAt`) — der „Stand" im Readout. */
  evaluatedAt: number;
  generatedAt: string;
  window: HistoryWindow;
  fields: readonly string[];
  events: IndexRow[];
  counts: {
    total: number;
    byCountry: Record<'DE' | 'AT' | 'CH', number>;
    sites: number;
    deviating: number;
    effisOnly: number;
    withNrt: number;
    /** Ereignisse außerhalb DE/AT/CH, die der Filter weggelassen hat — gezählt, nie still. */
    outsideDropped: number;
  };
  shards: { base: string; scheme: string };
  rule: { clusterRadiusM: number; gapH: number; season: string; sources: string[] };
  limits: string[];
  attributions: string[];
}

/** Detail-Shard: volle Ereignisse einer 1°-Zelle und eines Beginn-Monats. */
export interface HistoryShardFile {
  version: typeof HISTORY_ARTIFACT_VERSION;
  evaluatedAt: number;
  cell: string;
  month: string;
  detectionFields: readonly string[];
  events: HistoryShardEvent[];
}

export const DETECTION_FIELDS = ['key', 'lat', 'lon', 'acqMs', 'frp', 'confidence', 'satellite', 'day', 'scanKm', 'trackKm', 'provenance', 'nasaType'] as const satisfies readonly (keyof HistoryDetection)[];

export type HistoryShardEvent = Omit<HistoryEvent, 'detections'> & { detections: unknown[][] };

const DACH = new Set(['DE', 'AT', 'CH']);

export function isDach(e: Pick<HistoryEvent, 'country'>): e is HistoryEvent & { country: 'DE' | 'AT' | 'CH' } {
  return e.country != null && DACH.has(e.country);
}

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Kalendermonat, in dem `nowMs` liegt (UTC). */
export function monthWindow(nowMs: number): HistoryWindow {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  return { kind: 'month', fromMs: Date.UTC(y, m, 1), toMs: Date.UTC(y, m + 1, 1), label: `${MONTHS_DE[m]} ${y}`, current: true };
}

/**
 * Laufende Saison; vor dem 1. März die Vorjahressaison, nach dem 31. Oktober die gerade
 * abgeschlossene — ein leeres Saisonfenster im Januar wäre die Aussage „keine Brände" (Konzept §3).
 */
export function currentSeasonWindow(nowMs: number): HistoryWindow {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1;
  const year = m < SEASON_FROM_MONTH ? y - 1 : y;
  const w = seasonWindow(year);
  const current = nowMs >= w.fromMs && nowMs < w.toMs;
  return { kind: 'season', ...w, label: `Saison ${year} (1.3.–31.10.)`, current };
}

/** Shard-Pfad eines Ereignisses — Batch und Client rechnen ihn gleich. */
export function shardPath(e: Pick<HistoryEvent, 'lat' | 'lon' | 'firstMs'>): string {
  const d = new Date(e.firstMs ?? 0);
  const month = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${month}/${Math.floor(e.lat)}_${Math.floor(e.lon)}.json`;
}

/**
 * V-BH-2 (Browser-Befund GBH3): der TA3-Signaturvergleich ist für das 7-Tage-Fenster gebaut. Über
 * eine Saison sammelt ein Stahlwerk 2 000 Detektionen an 60 Tagen — Hülle und Wachstum kippen auf
 * „abweichend", und Duisburg stand als stärkster „Brand" der Saison in der Liste (Lehre GBC1 (2)).
 * Regel NUR für den Index: ein Ereignis auf einem bekannten Standort, das an mehr als
 * `SITE_PERSIST_DAYS` Kalendertagen Signal hatte, ist ein Dauersignal und wird als `site` geführt.
 * Die Rohdatei behält das TA3-Urteil; ob der Klassifizierer selbst die Regel bekommt, ist Jans
 * Entscheidung (Änderung träfe den Live-Reiter „Thermalanomalien").
 */
export const SITE_PERSIST_DAYS = 7;

export function indexAnomalyKind(e: Pick<HistoryEvent, 'anomaly' | 'distinctDays'>): 'site' | 'site-deviating' | null {
  if (!e.anomaly) return null;
  return e.anomaly.kind === 'site-deviating' && e.distinctDays > SITE_PERSIST_DAYS ? 'site' : e.anomaly.kind;
}

export function rowOf(e: HistoryEvent): IndexRow {
  if (!isDach(e)) throw new Error(`rowOf: nicht DACH (${e.id})`);
  // Keine Flächenschätzung auf einem bekannten Anlagenstandort — auch nicht bei `site-deviating`:
  // über eine Saison kippt ein Stahlwerk mit 2 000 Detektionen auf „abweichend" (Browser-Befund
  // GBH3, V-BH-2), und „82 ha geschätzt" wäre dort eine Brandfläche, die es nicht gibt.
  const est = e.anomaly ? null : e.areaEst;
  const c = e.confidence;
  const entry: HistoryIndexEntry = {
    id: e.id, country: e.country, lat: +e.lat.toFixed(4), lon: +e.lon.toFixed(4),
    firstMs: e.firstMs ?? 0, lastMs: e.lastMs ?? e.firstMs ?? 0,
    hotspots: e.hotspots, overpasses: e.overpasses, distinctDays: e.distinctDays,
    frpSumMw: e.frpSumMw, frpMaxMw: e.frpMaxMw, statusKind: e.status.kind,
    areaHa: e.areaHa.value, areaKind: e.areaHa.kind,
    estHa: est ? +est.ha.toFixed(1) : null, estLowHa: est ? +est.lowHa.toFixed(1) : null, estHighHa: est ? +est.highHa.toFixed(1) : null,
    effisId: e.effis?.id ?? null,
    placeName: e.place.name, placeDistrict: e.place.district, placeKm: e.place.distanceKm != null ? +e.place.distanceKm.toFixed(1) : null,
    anomalyKind: indexAnomalyKind(e), hullKm2: e.hullKm2, nrt: e.provenance.nrt,
    confidence: c ? [c.low, c.nominal, c.high, c.unknown] : [0, 0, 0, 0],
  };
  return INDEX_FIELDS.map((k) => entry[k]);
}

export function entryOf(row: IndexRow, fields: readonly string[] = INDEX_FIELDS): HistoryIndexEntry {
  const o: Record<string, unknown> = {};
  fields.forEach((k, i) => { o[k] = row[i]; });
  return o as unknown as HistoryIndexEntry;
}

export function shardEventOf(e: HistoryEvent): HistoryShardEvent {
  const { detections, ...rest } = e;
  return { ...rest, detections: detections.map((d) => DETECTION_FIELDS.map((k) => d[k])) };
}

export function detectionsOf(s: HistoryShardEvent, fields: readonly string[] = DETECTION_FIELDS): HistoryDetection[] {
  return s.detections.map((row) => { const o: Record<string, unknown> = {}; fields.forEach((k, i) => { o[k] = row[i]; }); return o as unknown as HistoryDetection; });
}

/** Ereignisse eines Fensters: Beginn im Fenster, DE/AT/CH. Liefert auch die Zahl der weggelassenen. */
export function selectWindow(events: readonly HistoryEvent[], w: HistoryWindow): { selected: HistoryEvent[]; outsideDropped: number } {
  let outside = 0; const selected: HistoryEvent[] = [];
  for (const e of events) {
    if (e.firstMs == null || e.firstMs < w.fromMs || e.firstMs >= w.toMs) continue;
    if (!isDach(e)) { outside++; continue; }
    selected.push(e);
  }
  selected.sort((a, b) => (b.frpSumMw ?? 0) - (a.frpSumMw ?? 0) || (a.firstMs ?? 0) - (b.firstMs ?? 0) || a.id.localeCompare(b.id));
  return { selected, outsideDropped: outside };
}

export function countsOf(selected: readonly HistoryEvent[], outsideDropped: number): HistoryIndexFile['counts'] {
  const byCountry = { DE: 0, AT: 0, CH: 0 };
  let sites = 0, deviating = 0, effisOnly = 0, withNrt = 0;
  for (const e of selected) {
    if (isDach(e)) byCountry[e.country]++;
    const k = indexAnomalyKind(e);
    if (k === 'site') sites++;
    if (k === 'site-deviating') deviating++;
    if (e.detections.length === 0) effisOnly++;
    if (e.provenance.nrt > 0) withNrt++;
  }
  return { total: selected.length, byCountry, sites, deviating, effisOnly, withNrt, outsideDropped };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ArtifactCheck { name: string; ok: boolean; detail?: string }

export function verifyHistoryArtifacts(sample: HistoryEvent): { checks: ArtifactCheck[]; passed: number; total: number } {
  const checks: ArtifactCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const aug = Date.UTC(2026, 7, 22, 12);
  add('Monatsfenster = Kalendermonat', monthWindow(aug).label === 'August 2026' && monthWindow(aug).fromMs === Date.UTC(2026, 7, 1) && monthWindow(aug).toMs === Date.UTC(2026, 8, 1));
  const s = currentSeasonWindow(aug);
  add('Saisonfenster im August = laufende Saison 2026', s.label === 'Saison 2026 (1.3.–31.10.)' && s.current);
  const jan = currentSeasonWindow(Date.UTC(2027, 0, 10));
  add('im Januar: abgeschlossene Vorjahressaison, nie leer', jan.label === 'Saison 2026 (1.3.–31.10.)' && !jan.current);
  const nov = currentSeasonWindow(Date.UTC(2026, 10, 5));
  add('im November: gerade abgeschlossene Saison', nov.label === 'Saison 2026 (1.3.–31.10.)' && !nov.current && nov.toMs === Date.UTC(2026, SEASON_TO_MONTH, 1));
  const dach: HistoryEvent = { ...sample, country: 'DE' };
  const row = rowOf(dach);
  const back = entryOf(row);
  add('Index-Zeile: positional hin und zurück', row.length === INDEX_FIELDS.length && back.id === sample.id && back.country === 'DE' && back.hotspots === sample.hotspots);
  const site: HistoryEvent = { ...dach, anomaly: { kind: 'site', siteId: 'x', checks: { footprint: true, growth: true, intensity: true, mapping: true }, reasons: ['r'] }, areaEst: { ha: 5, lowHa: 2, highHa: 9, method: 'm', predictor: 'det', n: 600, level: 0.8, modelVersion: 1, labelSource: 'effis-rda', yearFrom: 2020, yearTo: 2026 } };
  add('site-Ereignis bekommt keine Flächenschätzung im Index', entryOf(rowOf(site)).estHa === null);
  const dev: HistoryEvent = { ...site, anomaly: { ...site.anomaly!, kind: 'site-deviating' } };
  add('site-deviating: kurz bleibt abweichend (Brand), ohne Schätzung', entryOf(rowOf({ ...dev, distinctDays: 3 })).anomalyKind === 'site-deviating' && entryOf(rowOf({ ...dev, distinctDays: 3 })).estHa === null);
  add(`site-deviating über ${SITE_PERSIST_DAYS} Tage = Dauersignal ⇒ site (V-BH-2)`, entryOf(rowOf({ ...dev, distinctDays: 59 })).anomalyKind === 'site');
  const sh = shardEventOf(dach);
  add('Shard: Detektionen positional hin und zurück', detectionsOf(sh).length === sample.detections.length && (sample.detections.length === 0 || detectionsOf(sh)[0].key === sample.detections[0].key));
  add('Shard-Pfad: Jahr/Monat/1°-Zelle', shardPath({ lat: 48.7, lon: 11.2, firstMs: aug }) === '2026/08/48_11.json');
  const outside: HistoryEvent = { ...sample, country: 'outside' };
  const sel = selectWindow([dach, outside, { ...dach, firstMs: Date.UTC(2026, 1, 1) }], monthWindow(aug));
  add('Fensterauswahl: nur DACH, nur Beginn im Fenster, Weggelassene gezählt', sel.selected.length === 1 && sel.outsideDropped === 1);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
