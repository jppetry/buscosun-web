/**
 * BH1 — Ereignisse der Brand-Historie aus dem FIRMS-Archiv (`audit/brand-historie.md` §5).
 *
 * Ein **Ereignis** ist hier genau das, was `fireEvents.ts` seit F2 so nennt: ein räumlicher
 * Cluster (`spatialClusters`, Radius der Brand-Liste `CLUSTER_RADIUS_M`), zerlegt an
 * Zeitlücken > `GAP_MS` (`splitByTimeGap`). Jedes Ereignis wird anschließend durch
 * DIESELBE Registry geschickt wie die Live-Ansicht (`buildFireRegistry`: Zonen, EFFIS-
 * Abgleich, Standort-Einordnung TA3, Ort, Flächenschätzung AF4) und trägt seinen
 * Merkmalsatz `FireFeatures` v1 — **Evidenz, nicht nur Urteil** (Konzept §7).
 *
 * Pur und netzfrei: alles, was geladen werden muss (Zeilen, Kartierungen, Standortliste,
 * Ortsverzeichnis, Landesumrisse, Kalibriermodell), kommt als Kontext herein. Der Batch
 * `scripts/fire/bh/events-from-archive.mjs` ist nur Ein-/Ausgabe; der Client (BH3/BH4)
 * liest dieselben Typen. `npm run verify:fire-history`.
 *
 * Was hier bewusst NICHT passiert:
 *  - keine zweite Cluster- oder Lückenregel (Lehre GBC1: wer die ändert, verschiebt F2 mit);
 *  - keine Beobachtungsqualifikation (AF2 `observationAt`) — sie fragt „seit der letzten
 *    Detektion bis JETZT", im Archiv ist das eine andere Frage (Lücken im Verlauf stehen
 *    als `freMaxGapH` im Merkmalsatz);
 *  - kein Windflag, keine CLC-Maske (beide brauchen Laufzeitdaten, die der Batch nicht hat;
 *    die Felder bleiben `null`, wie im Client ohne die Quelle).
 */

import { CLUSTER_RADIUS_M, buildFireClusters, withCountries, type CountryRings, type FireCluster } from '../fireClusters';
import { spatialClusters, splitByTimeGap } from '../fireEvents';
import { buildFireZones } from '../fireZones';
import { reconcileZones } from '../footprint/reconcile';
import { buildFireRegistry, type FireRecord } from '../footprint/fireRegistry';
import { featuresOf, type FireFeatures } from '../activity/features';
import { estimateArea, type AreaEstimate } from '../activity/estimate';
import type { AreaModel } from '../activity/calibration';
import type { ThermalSite } from '../anomaly/thermalSites';
import type { AnomalyChecks, AnomalyKind } from '../anomaly/classify';
import type { BurntPolygon } from '../fireCorroboration';
import { detectionKey, type FirmsConfidence, type FirmsRow } from '../sources/firmsHotspots';
import { fixtureRow } from '../fireClusters';

export const HISTORY_EVENT_VERSION = 1 as const;

/** Waldbrandsaison DACH (Jan, Q3 2026-08-22): 1. März – 31. Oktober, Kalender. */
export const SEASON_FROM_MONTH = 3;
export const SEASON_TO_MONTH = 10;

/** Herkunft einer Zeile: Standard Processing (Archiv) oder Near-Real-Time (Rand). */
export type Provenance = 'sp' | 'nrt';

/** Eine Detektion, wie sie im Ereignis gespeichert wird — kompakt, aber vollständig rekonstruierbar. */
export interface HistoryDetection {
  key: string;
  lat: number;
  lon: number;
  acqMs: number;
  frp: number | null;
  confidence: FirmsConfidence | null;
  satellite: string;
  day: boolean;
  scanKm: number | null;
  trackKm: number | null;
  provenance: Provenance;
  /** NASA `type` der SP-Zeile (0 Vegetation, 1 Vulkan, 2 andere ortsfeste Quelle, 3 offshore); `null` bei NRT. */
  nasaType: 0 | 1 | 2 | 3 | null;
}

export interface HistoryEvent {
  version: typeof HISTORY_EVENT_VERSION;
  /** `bh:<anchorKey>` (Detektionen) · `bh:effis:<id>` (nur kartiert). Sitzungsübergreifend stabil, solange die Ankerdetektion bleibt. */
  id: string;
  /** Kennungen aus einem früheren Lauf, die in dieses Ereignis übergegangen sind (SP-Nachlieferung, Anker-Wanderung). */
  previousIds: string[];
  /** Zeitpunkt der Auswertung — Provenienz (Konzept §7). */
  evaluatedAt: number;
  country: FireRecord['country'];
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  /** Konvexe Hülle [lon, lat], leer bei < 3 Punkten. */
  hull: number[][];
  hullKm2: number;
  firstMs: number | null;
  lastMs: number | null;
  /** Kalenderjahr von `firstMs` (bzw. EFFIS `FIREDATE`). */
  year: number;
  /** Liegt der Beginn in der Saison 1.3.–31.10.? */
  inSeason: boolean;
  hotspots: number;
  overpasses: number;
  distinctDays: number;
  satellites: string[];
  frpSumMw: number | null;
  frpMaxMw: number | null;
  confidence: Record<FirmsConfidence | 'unknown', number> | null;
  status: FireRecord['status'];
  areaHa: FireRecord['areaHa'];
  areaEst: AreaEstimate | null;
  method: FireRecord['method'];
  effis: { id: string; areaHa: number | null; firedateMs: number | null; finaldateMs: number | null; lastUpdateMs: number | null; landcover: BurntPolygon['landcover']; percNa2k: number | null; province: string | null; commune: string | null } | null;
  effisExtra: number;
  place: FireRecord['place'];
  suspectedStatic: boolean;
  /** TA3-Einordnung — mit Prüfungen und Gründen, damit Schwellen später neu bewertbar sind. */
  anomaly: { kind: AnomalyKind; siteId: string; checks: AnomalyChecks; reasons: string[] } | null;
  features: FireFeatures | null;
  provenance: { sp: number; nrt: number };
  /** Anteil der SP-Zeilen mit NASA `type = 2`; `null` ohne SP-Zeilen. */
  nasaType2Share: number | null;
  detections: HistoryDetection[];
}

export interface HistoryContext {
  /** Auswertezeitpunkt — Status, Merkmale und `evaluatedAt` hängen daran. Fest hereingereicht (Determinismus). */
  nowMs: number;
  /** Kartierungen (EFFIS RDA), beliebige Jahre; der Abgleich filtert räumlich und zeitlich selbst. */
  polys: readonly BurntPolygon[];
  rings: CountryRings | null;
  siteAt?: (lat: number, lon: number) => ThermalSite | null;
  placeAt?: (lat: number, lon: number) => { name: string; district: string | null; distanceKm: number } | null;
  areaModel?: AreaModel | null;
  /** `type`-Spalte je Detektionsschlüssel (nur SP); fehlt ⇒ `null`. */
  nasaTypeOf?: (key: string) => 0 | 1 | 2 | 3 | null;
  provenanceOf?: (row: FirmsRow) => Provenance;
}

const D = 86_400_000;

export function inSeason(ms: number): boolean {
  const m = new Date(ms).getUTCMonth() + 1;
  return m >= SEASON_FROM_MONTH && m <= SEASON_TO_MONTH;
}

/** Start (inkl.) und Ende (exkl.) der Saison eines Jahres, UTC. */
export function seasonWindow(year: number): { fromMs: number; toMs: number } {
  return { fromMs: Date.UTC(year, SEASON_FROM_MONTH - 1, 1), toMs: Date.UTC(year, SEASON_TO_MONTH, 1) };
}

/** Provenienz aus dem Quellnamen — `*_SP` = Archiv, alles andere NRT. */
export function provenanceOfSource(source: string): Provenance {
  return /_SP$/.test(source) ? 'sp' : 'nrt';
}

function expand(b: readonly number[], km: number): [number, number, number, number] {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180));
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}

function intersects(a: readonly number[], b: readonly number[]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Kartierungen, die für ein Ereignis in Frage kommen: Bbox + 3 km (wie der AF4-Batch) und
 * `FIREDATE` im Zeitraum [first − 14 d, last + 14 d] — der Abgleich selbst (`reconcileZones`)
 * entscheidet über die Zuordnung.
 */
export function candidatePolys(c: FireCluster, polys: readonly BurntPolygon[]): BurntPolygon[] {
  const box = expand(c.bbox, 3);
  const from = c.firstMs - 14 * D; const to = c.lastMs + 14 * D;
  return polys.filter((p) => p.firedateMs != null && p.firedateMs >= from && p.firedateMs <= to && intersects(box, p.bbox));
}

function distinctDays(rows: readonly FirmsRow[]): number {
  const s = new Set<number>();
  for (const r of rows) s.add(Math.floor(r.acqMs / D));
  return s.size;
}

function toDetection(r: FirmsRow, ctx: HistoryContext): HistoryDetection {
  const key = detectionKey(r);
  return {
    key, lat: r.lat, lon: r.lon, acqMs: r.acqMs, frp: r.frp, confidence: r.confidence,
    satellite: r.satellite, day: r.day, scanKm: r.scanKm, trackKm: r.trackKm,
    provenance: ctx.provenanceOf ? ctx.provenanceOf(r) : provenanceOfSource(r.source),
    nasaType: ctx.nasaTypeOf ? ctx.nasaTypeOf(key) : null,
  };
}

function fromRecord(rec: FireRecord, rows: readonly FirmsRow[], ctx: HistoryContext): HistoryEvent {
  const dets = rows.map((r) => toDetection(r, ctx)).sort((a, b) => a.acqMs - b.acqMs || a.key.localeCompare(b.key));
  const sp = dets.filter((d) => d.provenance === 'sp');
  const t2 = sp.filter((d) => d.nasaType === 2).length;
  const c = rec.sources.cluster;
  const e = rec.sources.effis;
  const firstMs = rec.firstMs ?? e?.firedateMs ?? null;
  const year = new Date(firstMs ?? ctx.nowMs).getUTCFullYear();
  return {
    version: HISTORY_EVENT_VERSION,
    id: `bh:${rec.id.replace(/^fire:/, '')}`,
    previousIds: [],
    evaluatedAt: ctx.nowMs,
    country: rec.country,
    lat: rec.lat, lon: rec.lon, bbox: rec.bbox,
    hull: c?.hull ?? [], hullKm2: c?.hullKm2 ?? 0,
    firstMs, lastMs: rec.lastMs ?? e?.finaldateMs ?? e?.firedateMs ?? null,
    year, inSeason: firstMs != null ? inSeason(firstMs) : false,
    hotspots: rec.hotspots ?? 0,
    overpasses: rec.overpasses ?? 0,
    distinctDays: distinctDays(rows),
    satellites: rec.satellites ?? [],
    frpSumMw: rec.frpSumMw,
    frpMaxMw: c?.maxFrp ?? null,
    confidence: rec.confidence.firms,
    status: rec.status,
    areaHa: rec.areaHa,
    areaEst: rec.activity?.areaEst ?? null,
    method: rec.method,
    effis: e ? { id: e.id, areaHa: e.areaHa, firedateMs: e.firedateMs, finaldateMs: e.finaldateMs, lastUpdateMs: e.lastUpdateMs, landcover: e.landcover, percNa2k: e.percNa2k, province: e.province, commune: e.commune } : null,
    effisExtra: rec.sources.effisExtra,
    place: rec.place,
    suspectedStatic: rec.suspectedStatic,
    anomaly: rec.anomaly ? { kind: rec.anomaly.kind, siteId: rec.anomaly.siteId, checks: rec.anomaly.checks, reasons: rec.anomaly.reasons } : null,
    features: rows.length ? featuresOf(rec, ctx.nowMs) : null,
    provenance: { sp: sp.length, nrt: dets.length - sp.length },
    nasaType2Share: sp.length ? Math.round((t2 / sp.length) * 1000) / 1000 : null,
    detections: dets,
  };
}

function registryFor(rows: readonly FirmsRow[], cluster: FireCluster | null, polys: readonly BurntPolygon[], effisWindow: { fromMs: number; toMs: number } | null, ctx: HistoryContext): FireRecord[] {
  const zones = rows.length ? buildFireZones(rows) : [];
  const reconciled = reconcileZones(zones, polys);
  return buildFireRegistry({
    clusters: cluster ? [cluster] : [], zones, reconciled, polys, effisWindow, emsActs: [], nowMs: ctx.nowMs,
    siteAt: ctx.siteAt, placeAt: ctx.placeAt,
    estimateFor: ctx.areaModel ? (rec) => estimateArea(featuresOf(rec, ctx.nowMs), ctx.areaModel) : undefined,
  });
}

export interface HistoryBuild {
  events: HistoryEvent[];
  /** Kartierungen, die von keinem Ereignis mit Detektionen vertreten werden — als eigene Ereignisse angehängt. */
  effisOnly: number;
  /** Diagnose: Ereignisse, deren Registry-Lauf keinen Cluster-Eintrag lieferte (darf 0 sein). */
  lostInRegistry: number;
}

/**
 * Alle Ereignisse aus einer Zeilenmenge (beliebig viele Jahre — die Zeitlücke trennt).
 * Deterministisch: gleiche Eingabe ⇒ byte-gleiche Ausgabe (Sortierung nach Beginn, dann Kennung).
 */
export function eventsFromRows(rows: readonly FirmsRow[], ctx: HistoryContext): HistoryBuild {
  const events: HistoryEvent[] = [];
  const usedPolys = new Set<string>();
  let lost = 0;
  for (const bucket of spatialClusters(rows, CLUSTER_RADIUS_M)) {
    for (const seg of splitByTimeGap(bucket.rows)) {
      // Nach der Zeitzerlegung kann der Rest räumlich zerfallen — dann sind es mehrere Ereignisse.
      for (const sub of spatialClusters(seg, CLUSTER_RADIUS_M)) {
        const [cluster] = withCountries(buildFireClusters(sub.rows), ctx.rings);
        const polys = candidatePolys(cluster, ctx.polys);
        const recs = registryFor(sub.rows, cluster, polys, null, ctx);
        const rec = recs.find((r) => r.sources.cluster);
        if (!rec) { lost++; continue; }
        if (rec.sources.effis) usedPolys.add(rec.sources.effis.id);
        events.push(fromRecord(rec, sub.rows, ctx));
      }
    }
  }
  // Kartierungen ohne Detektion: eigene Ereignisse (Methode `effis-rda`), nichts verschwindet.
  const rest = ctx.polys.filter((p) => !usedPolys.has(p.id) && p.firedateMs != null);
  let effisOnly = 0;
  for (const p of rest) {
    const recs = registryFor([], null, [p], { fromMs: 0, toMs: Number.MAX_SAFE_INTEGER }, ctx);
    const rec = recs.find((r) => r.sources.effis?.id === p.id);
    if (!rec) continue;
    effisOnly++;
    events.push({ ...fromRecord(rec, [], ctx), id: `bh:effis:${p.id}` });
  }
  events.sort((a, b) => (a.firstMs ?? 0) - (b.firstMs ?? 0) || a.id.localeCompare(b.id));
  return { events, effisOnly, lostInRegistry: lost };
}

/**
 * Kennungen über Läufe hinweg (W7): ein neues Ereignis erbt die Kennungen aller früheren
 * Ereignisse, mit denen es mindestens eine Detektion teilt. Bleibt die Kennung gleich, ist
 * nichts zu tun; sonst steht die alte in `previousIds`. Frühere Ereignisse ohne Nachfolger
 * werden zurückgegeben (SP hat die Detektion entfernt) — der Batch protokolliert sie.
 */
export function linkPrevious(events: HistoryEvent[], previous: readonly Pick<HistoryEvent, 'id' | 'detections'>[]): { linked: number; superseded: string[] } {
  const byKey = new Map<string, string>();
  for (const p of previous) for (const d of p.detections) byKey.set(d.key, p.id);
  const seen = new Set<string>();
  let linked = 0;
  for (const e of events) {
    const prev = new Set<string>();
    for (const d of e.detections) { const id = byKey.get(d.key); if (id) { prev.add(id); seen.add(id); } }
    prev.delete(e.id);
    if (prev.size) { e.previousIds = [...prev].sort(); linked++; }
  }
  return { linked, superseded: previous.map((p) => p.id).filter((id) => !seen.has(id) && !events.some((e) => e.id === id)).sort() };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface HistoryCheck { name: string; ok: boolean; detail?: string }

export function verifyHistoryEvents(): { checks: HistoryCheck[]; passed: number; total: number } {
  const checks: HistoryCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000;
  const t0 = Date.UTC(2025, 7, 10, 12, 0);
  const now = Date.UTC(2025, 8, 1);
  // Brand A: drei Überflüge über zwei Tage; Brand B: derselbe Ort, 5 Tage später (Zeitlücke > 48 h);
  // Brand C: 50 km entfernt, eine einzige Detektion.
  const rows: FirmsRow[] = [
    ...[0, 1, 2].map((i) => fixtureRow(48.0 + i * 0.003, 11.0, t0, 5)),
    ...[0, 1].map((i) => fixtureRow(48.0 + i * 0.003, 11.002, t0 + 12 * H, 7)),
    fixtureRow(48.004, 11.003, t0 + 26 * H, 9),
    fixtureRow(48.001, 11.001, t0 + 5 * 24 * H, 4),
    fixtureRow(48.5, 11.0, t0 + 2 * H, 3),
  ];
  const ctx: HistoryContext = { nowMs: now, polys: [], rings: null };
  const b = eventsFromRows(rows, ctx);
  add('drei Ereignisse: A, B (Zeitlücke) und C (Entfernung)', b.events.length === 3, String(b.events.length));
  const a = b.events.find((e) => e.hotspots === 6);
  add('A: 3 Überflüge, 2 Kalendertage, Anker = älteste Detektion', !!a && a.overpasses === 3 && a.distinctDays === 2 && a.id === `bh:${detectionKey(rows[0])}`, a ? `${a.overpasses}/${a.distinctDays}/${a.id}` : '—');
  add('A trägt Merkmalsatz v1 und Provenienz', !!a && a.features?.featureVersion === 1 && a.provenance.nrt === 6 && a.provenance.sp === 0);
  add('Saison: August ja, Januar nein', inSeason(t0) && !inSeason(Date.UTC(2025, 0, 5)));
  add('Saisonfenster 1.3.–31.10.', seasonWindow(2025).fromMs === Date.UTC(2025, 2, 1) && seasonWindow(2025).toMs === Date.UTC(2025, 10, 1));
  add('Provenienz aus Quellname', provenanceOfSource('VIIRS_SNPP_SP') === 'sp' && provenanceOfSource('VIIRS_NOAA21_NRT') === 'nrt');
  // Determinismus: zweiter Lauf byte-gleich, auch bei anderer Zeilenreihenfolge.
  const b2 = eventsFromRows([...rows].reverse(), ctx);
  add('deterministisch: zweiter Lauf (umgekehrte Reihenfolge) byte-gleich', JSON.stringify(b.events) === JSON.stringify(b2.events));
  add('sortiert nach Beginn', b.events.every((e, i) => i === 0 || (b.events[i - 1].firstMs ?? 0) <= (e.firstMs ?? 0)));
  // Kennungen über Läufe: B verliert per SP-Nachlieferung seine Detektion, A bekommt eine dazu.
  const rows2 = rows.filter((r) => r.acqMs !== t0 + 5 * 24 * H).concat(fixtureRow(48.002, 11.0, t0 + 30 * H, 6));
  const b3 = eventsFromRows(rows2, ctx);
  const lk = linkPrevious(b3.events, b.events);
  const bId = b.events.find((e) => e.hotspots === 1 && e.lat < 48.1)?.id;
  add('Verknüpfung: A behält die Kennung, B ist ersetzt', lk.linked === 0 && lk.superseded.length === 1 && lk.superseded[0] === bId, JSON.stringify(lk));
  // Anker-Wanderung: die älteste Detektion fällt weg ⇒ neue Kennung, alte in previousIds.
  const rows3 = rows.filter((r) => r !== rows[0]);
  const b4 = eventsFromRows(rows3, ctx);
  const lk2 = linkPrevious(b4.events, b.events);
  const a4 = b4.events.find((e) => e.hotspots === 5);
  add('Anker-Wanderung: neue Kennung erbt die alte', !!a4 && a4.previousIds.length === 1 && a4.previousIds[0] === a?.id && lk2.linked === 1);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
