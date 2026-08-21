/**
 * **Brand-Registry** — ein Eintrag je Brand über alle Quellen (Phase BP1, Gate GBP1,
 * `audit/brandflaechen-panel.md` §2.4/§2.5).
 *
 * ── Was dieses Modul löst ───────────────────────────────────────────────────
 * Die Ansicht kennt drei Formen desselben Feuers: die Cluster-Hülle und das
 * Detektionsraster aus FIRMS (Obergrenzen der Messung), die von EFFIS kartierte
 * Fläche und das EMS-Abzeichen. Bisher lebt jede in ihrem Modul; die Frage
 * „welche Brände gibt es gerade, wie groß, seit wann?" beantwortet keine allein.
 * Dieses Modul **komponiert** sie zu `FireRecord[]` — es rechnet nichts neu:
 *
 *   Cluster        `fireClusters.ts`   (Anker, Zahlen, Verlauf je Überflug)
 *   Raster/Zonen   `fireZones.ts`      (Obergrenzen-Fläche)
 *   Abgleich       `reconcile.ts`      (Zone ↔ EFFIS — die EINE Verknüpfung)
 *   Bewertung      `fireAssessment.ts` (bestätigt/plausibel/unbestätigt)
 *   EMS            `emsActivations.ts` (Abzeichen im Umkreis)
 *
 * ── Die Kennung, und warum sie ein Anker ist ────────────────────────────────
 * `FireCluster.id` ist Schwerpunkt@Beginn und ändert sich mit jedem Überflug.
 * Die Registry nimmt stattdessen den **Anker** — die älteste Detektion des
 * Clusters (`anchorKey`). Sie bleibt, solange sie im Fenster liegt; kommt ein
 * Überflug hinzu, ändert sich nichts. Fällt sie aus dem Fenster, wandert der
 * Anker — und `carryIds()` reicht die alte Kennung über den vorigen Lauf
 * weiter, damit die Auswahl in der Liste nicht springt. Über Sitzungen hinweg
 * gibt es keinen Speicher; das sagt der Eintrag („Verlauf innerhalb des
 * Fensters"), statt es zu verbergen.
 *
 * ── Sprachregeln (CLAUDE.md, BF5) ────────────────────────────────────────────
 *  • „bestätigt" nur mit EFFIS oder EMS im selben Satz — kommt aus `assess()`.
 *  • „erloschen" nur mit Quelle (EFFIS `FINALDATE`, EMS geschlossen); sonst
 *    „kein Signal seit …". Eine Überflugslücke ist kein Ende.
 *  • Keine Hektarzahl ohne ihre Art: `mapped` (EFFIS) oder `upper-bound` (Raster).
 *  • Fehlende Werte sind `null` und werden als „—" mit Grund gezeigt, nie 0.
 *
 * Pur, DOM-frei, ohne `Date.now()` (D-12) — `npm run verify:fire-registry`.
 */

import type { FireCluster } from '../fireClusters';
import { CLUSTER_RADIUS_M, buildFireClusters, fixtureRow, convexHull, ringAreaKm2 } from '../fireClusters';
import type { FireZone } from '../fireZones';
import { buildFireZones } from '../fireZones';
import type { BurntPolygon, LandcoverKey } from '../fireCorroboration';
import { landcoverBreakdown, timeMatches } from '../fireCorroboration';
import type { Reconciled } from './reconcile';
import { reconcileZones, fixturePoly } from './reconcile';
import { assess, type AssessmentLevel } from '../fireAssessment';
import { emsActivationFor, type EmsActivation } from '../sources/emsActivations';
import { metersBetween, detectionKey, type FirmsConfidence, type FirmsRow } from '../sources/firmsHotspots';
import { ageText, stampLabel } from '../../dataAge';
// AF1: Überflüge und Aktivität — additiv, dieselbe Regel wie in den Clustern.
import { mergePasses, type FirePass } from '../activity/overpasses';
import { activityOf, type FireActivity } from '../activity/fireActivity';
// VB3: die Flächenaussage eines Eintrags ohne Kartierung — Wert und Herkunft
// kommen aus DERSELBEN Formatierung wie die Panel-Zeile (`estimate.ts`).
import { estimateValueText, estimateSourceText, type AreaEstimate } from '../activity/estimate';
import type { Observation } from '../activity/observation';
import type { Country } from '../../types';

// ---------------------------------------------------------------------------
// Modell
// ---------------------------------------------------------------------------

/** Was auf der Karte für diesen Brand gezeichnet wird — genau EINE Form. */
export type FootprintGeometryKind = 'effis' | 'raster' | 'hull' | 'point';

export type FireStatusKind = 'active' | 'no-signal' | 'out';

export type FireMethod = 'viirs-cluster' | 'effis-rda' | 'ems-activation';

export interface FireRecord {
  /** `fire:<anchorKey>` (Detektionen) · `effis:<id>` (nur kartiert, ohne Detektion im Fenster). */
  id: string;
  /** Frühere Kennungen desselben Brands in dieser Sitzung (Anker-Wanderung, Merge). */
  previousIds: string[];
  /** Kennungen, die in diesen Eintrag zusammengewachsen sind (leer = kein Merge). */
  mergedFrom: string[];
  /** Kennung, aus der dieser Eintrag herausgefallen ist (Split), sonst `null`. */
  splitFrom: string | null;
  country: Country | 'outside' | null;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
  geometry: { kind: FootprintGeometryKind; ref: string };
  status: { kind: FireStatusKind; sinceMs: number | null; source: string | null };
  firstMs: number | null;
  lastMs: number | null;
  hotspots: number | null;
  overpasses: number | null;
  satellites: string[] | null;
  frpSumMw: number | null;
  confidence: {
    firms: Record<FirmsConfidence | 'unknown', number> | null;
    assessment: AssessmentLevel | null;
    reasons: string[];
  };
  areaHa: { value: number | null; kind: 'mapped' | 'upper-bound' | null; source: string | null; capped: boolean };
  method: FireMethod[];
  sources: {
    cluster: FireCluster | null;
    zones: FireZone[];
    effis: BurntPolygon | null;
    /** Weitere passende Kartierungen (derselbe Cluster, mehrere Flächen) — nur gezählt. */
    effisExtra: number;
    ems: EmsActivation | null;
  };
  place: { name: string | null; district: string | null; source: 'effis' | 'gazetteer' | null; distanceKm?: number };
  landcover: { key: LandcoverKey; pct: number }[] | null;
  suspectedStatic: boolean;
  passes: FirePass[];
  /**
   * AF1: Intensität und (ab AF2) Dynamik aus den Überflügen — `activity/fireActivity.ts`.
   * `null` ohne Detektionen (reine EFFIS-Einträge, GWIS-Notbetrieb).
   */
  activity: FireActivity | null;
}

export interface RegistryInput {
  clusters: readonly FireCluster[];
  zones: readonly FireZone[];
  /** Abgleich Zone ↔ EFFIS — dieselbe Struktur, die die Karte fürs Ersetzen nutzt. */
  reconciled: Reconciled;
  /** Kartierte Flächen, die als EIGENE Einträge in Frage kommen (Zeitfenster s. `effisWindow`). */
  polys: readonly BurntPolygon[];
  /** `[fromMs, toMs)` über `FIREDATE`; `null` = keine eigenständigen EFFIS-Einträge. */
  effisWindow: { fromMs: number; toMs: number } | null;
  emsActs: readonly EmsActivation[];
  nowMs: number;
  /** Optional: Landbedeckung an der Stelle (statische CLC-Maske) — Plausibilität, nie Ausschluss. */
  landcoverAt?: (lat: number, lon: number) => 'natural' | 'artificial' | null;
  /**
   * BP3: nächster Ort aus dem statischen Verzeichnis (`places.ts`) — nur für
   * Einträge OHNE EFFIS-Ortsangabe; `null` = kein Ort im Umkreis, es wird nichts
   * behauptet. Fehlt die Funktion (Verzeichnis nicht geladen), bleibt der Ort leer.
   */
  placeAt?: (lat: number, lon: number) => { name: string; district: string | null; distanceKm: number } | null;
  /**
   * AF2: regionale Beobachtungsgelegenheit seit der letzten Detektion
   * (`activity/observation.ts`, Index über die angezeigten Zeilen) — nur für
   * Einträge im Zustand `no-signal` abgefragt. Fehlt sie, bleibt die
   * Beobachtung leer (kein „unobserved" aus Unwissen).
   */
  observationAt?: (lat: number, lon: number, lastMs: number) => Observation | null;
  /**
   * AF2: ICON-D2-Windrichtung („kommt aus", Grad) am Ort zur Zeit des jüngsten
   * Überflugs — nur wenn der Windlayer geladen ist und ein Frame nahe genug
   * liegt; sonst `null` und das Windflag bleibt leer.
   */
  windAt?: (lat: number, lon: number, atMs: number) => number | null;
  /**
   * AF4: Flächenschätzung aus Merkmalsatz + Kalibriermodell (`activity/estimate.ts`),
   * nach dem Bau des Eintrags aufgerufen — nur für Einträge mit Detektionen.
   * Fehlt sie (kein Modell geladen, Kill-Switch), bleibt `activity.areaEst` `null`.
   */
  estimateFor?: (record: FireRecord) => { estimate: AreaEstimate | null; reason: string | null };
}

/** Ab wann eine Detektion „kein Signal" ist: 24 h — die Länge eines Tagesüberflug-Zyklus. */
export const ACTIVE_WITHIN_MS = 24 * 3_600_000;

// ---------------------------------------------------------------------------
// Zone → Cluster
// ---------------------------------------------------------------------------

/**
 * Grobes Gitter (0,05° ≈ 5,5 km) über Bboxen — damit Zone→Cluster und der
 * Lauf-zu-Lauf-Abgleich nicht quadratisch werden. Jeder Eintrag steht in allen
 * Zellen, die seine (um `padDeg` erweiterte) Bbox berührt.
 */
class GridIndex<T> {
  private cells = new Map<string, T[]>();
  private cell: number;
  constructor(cell = 0.05) { this.cell = cell; }
  private key(x: number, y: number) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`; }
  add(item: T, bbox: readonly [number, number, number, number], padDeg = 0): void {
    const x0 = Math.floor((bbox[0] - padDeg) / this.cell), x1 = Math.floor((bbox[2] + padDeg) / this.cell);
    const y0 = Math.floor((bbox[1] - padDeg) / this.cell), y1 = Math.floor((bbox[3] + padDeg) / this.cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      const list = this.cells.get(k);
      if (list) list.push(item); else this.cells.set(k, [item]);
    }
  }
  at(lon: number, lat: number): readonly T[] { return this.cells.get(this.key(lon, lat)) ?? []; }
}

/** 2 km in Grad Breite (großzügig, für Länge bei DACH-Breiten ebenfalls ausreichend). */
const RADIUS_DEG = CLUSTER_RADIUS_M / 111_320 * 1.6;

/**
 * Zu welchem Cluster gehört eine Zone? Beide entstehen aus denselben Zeilen;
 * eine Zone ist eine Menge sich berührender Pixel (< 2 km) und liegt damit
 * vollständig in **einem** Cluster. Ihr Schwerpunkt fällt in dessen Bbox;
 * bei überlappenden Bboxen entscheidet der nächste Schwerpunkt. Findet sich
 * nichts (numerische Kante), der nächste Cluster in Verknüpfungsdistanz.
 */
export function assignZones(
  zones: readonly FireZone[], clusters: readonly FireCluster[],
): Map<string, FireZone[]> {
  const out = new Map<string, FireZone[]>();
  const eps = 1e-6;
  const grid = new GridIndex<FireCluster>();
  for (const c of clusters) grid.add(c, c.bbox, RADIUS_DEG);
  for (const z of zones) {
    let best: FireCluster | null = null; let bestD = Infinity;
    for (const c of grid.at(z.lon, z.lat)) {
      const [w, s, e, n] = c.bbox;
      const inBox = z.lon >= w - eps && z.lon <= e + eps && z.lat >= s - eps && z.lat <= n + eps;
      const d = metersBetween(z, c);
      if (inBox) {
        if (best === null || !inBoxOf(best, z, eps) || d < bestD) { best = c; bestD = d; }
      } else if ((best === null || !inBoxOf(best, z, eps)) && d <= CLUSTER_RADIUS_M && d < bestD) {
        best = c; bestD = d;
      }
    }
    if (!best) continue;
    const list = out.get(best.id);
    if (list) list.push(z); else out.set(best.id, [z]);
  }
  return out;
}

function inBoxOf(c: FireCluster, z: FireZone, eps: number): boolean {
  const [w, s, e, n] = c.bbox;
  return z.lon >= w - eps && z.lon <= e + eps && z.lat >= s - eps && z.lat <= n + eps;
}

// ---------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------

const clusterId = (c: FireCluster) => `fire:${c.anchorKey}`;
const effisId = (p: BurntPolygon) => `effis:${p.id}`;

function statusOf(
  lastMs: number | null, effis: BurntPolygon | null, ems: EmsActivation | null, nowMs: number,
): FireRecord['status'] {
  // Ende nur mit Quelle — und die Quelle muss ZU diesem Brand passen: eine
  // geschlossene EMS-Aktivierung von vor Wochen beendet kein frisches Signal.
  if (effis?.finaldateMs != null && (lastMs == null || lastMs <= effis.finaldateMs + ACTIVE_WITHIN_MS)) {
    return { kind: 'out', sinceMs: effis.finaldateMs, source: 'EFFIS (FINALDATE)' };
  }
  if (lastMs != null && nowMs - lastMs < ACTIVE_WITHIN_MS) {
    return { kind: 'active', sinceMs: lastMs, source: 'Satellitendetektion' };
  }
  if (ems && ems.closed === false && (lastMs == null || nowMs - lastMs < 7 * 86_400_000)) {
    return { kind: 'active', sinceMs: lastMs, source: `Copernicus EMS ${ems.code} (offen)` };
  }
  if (ems && ems.closed === true && lastMs != null && ems.eventMs != null && lastMs < ems.eventMs + 30 * 86_400_000
    && nowMs - lastMs >= ACTIVE_WITHIN_MS) {
    return { kind: 'out', sinceMs: lastMs, source: `Copernicus EMS ${ems.code} (geschlossen)` };
  }
  return { kind: 'no-signal', sinceMs: lastMs ?? effis?.firedateMs ?? null, source: null };
}

/**
 * Mehrere Cluster, EINE Kartierung ⇒ ein Brand. Live gesehen (2026-08-17,
 * Hohes Venn, 2 825 ha): drei Cluster mit je einer Detektion lagen in derselben
 * EFFIS-Fläche — drei Einträge „2 825 ha kartiert" wären drei Feuer. Die
 * Kartierung ist die Beobachtung mit der größeren Reichweite; sie vertritt den
 * Brand, die Cluster werden zu EINEM (synthetischen) Cluster verschmolzen:
 * Zahlen summiert, Überflüge/Satelliten/Verlauf vereinigt, Anker = der älteste.
 */
export function mergeClusters(cs: readonly FireCluster[]): FireCluster {
  if (cs.length === 1) return cs[0];
  const sorted = [...cs].sort((a, b) => a.firstMs - b.firstMs || a.anchorKey.localeCompare(b.anchorKey));
  const primary = sorted[0];
  let count = 0; let sumFrp = 0; let maxFrp = 0; let staticCount = 0;
  let firstMs = Infinity; let lastMs = -Infinity;
  let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity;
  let sLat = 0; let sLon = 0;
  const sats = new Set<string>();
  const conf: Record<FirmsConfidence | 'unknown', number> = { low: 0, nominal: 0, high: 0, unknown: 0 };
  const passLists: FirePass[][] = [];
  const pts: [number, number][] = [];
  for (const c of cs) {
    count += c.count; sumFrp += c.sumFrp; maxFrp = Math.max(maxFrp, c.maxFrp); staticCount += c.staticCount;
    firstMs = Math.min(firstMs, c.firstMs); lastMs = Math.max(lastMs, c.lastMs);
    w = Math.min(w, c.bbox[0]); so = Math.min(so, c.bbox[1]); e = Math.max(e, c.bbox[2]); n = Math.max(n, c.bbox[3]);
    sLat += c.lat * c.count; sLon += c.lon * c.count;
    for (const x of c.satellites) sats.add(x);
    for (const k of Object.keys(conf) as (FirmsConfidence | 'unknown')[]) conf[k] += c.confidence[k];
    passLists.push(c.passes);
    if (c.hull.length >= 4) for (const pt of c.hull) pts.push([pt[0], pt[1]]);
    else pts.push([c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]], [c.lon, c.lat]);
  }
  const hull = convexHull(pts);
  // AF1: Überflüge derselben Satelliten, die sich zeitlich berühren, werden EINER.
  const passes = mergePasses(passLists);
  return {
    id: primary.id, anchorKey: primary.anchorKey,
    lat: sLat / count, lon: sLon / count,
    count, sumFrp: Math.round(sumFrp * 100) / 100, maxFrp,
    hull, hullKm2: Math.round(ringAreaKm2(hull) * 100) / 100,
    firstMs, lastMs, bbox: [w, so, e, n],
    country: primary.country,
    staticCount, mostlyStatic: staticCount * 2 > count,
    overpasses: passes.length,
    satellites: [...sats].sort(),
    confidence: conf,
    passes,
  };
}

/**
 * Baut die Einträge. Reihenfolge der Ausgabe: erst Cluster (wie `clusters`
 * geliefert, absteigend nach Stärke), dann kartierte Flächen ohne Detektion.
 * Sortierung fürs Panel: `sortRecords()`.
 */
export function buildFireRegistry(input: RegistryInput): FireRecord[] {
  const { clusters, zones, reconciled, polys, effisWindow, emsActs, nowMs } = input;
  const zonesByCluster = assignZones(zones, clusters);
  const confirmedByZone = new Map<string, BurntPolygon>();
  for (const c of reconciled.confirmed) confirmedByZone.set(c.zone.id, c.poly);

  const out: FireRecord[] = [];
  const usedPolys = new Set<string>();

  // Erster Durchgang: Kartierungen je Cluster (über seine Zonen — die EINE
  // Verknüpfung). Cluster mit DERSELBEN vertretenden Fläche werden verschmolzen.
  const mappedOf = new Map<string, BurntPolygon[]>();
  const byEffis = new Map<string, FireCluster[]>();
  for (const c of clusters) {
    const zs = zonesByCluster.get(c.id) ?? [];
    const mapped: BurntPolygon[] = [];
    for (const z of zs) {
      const p = confirmedByZone.get(z.id);
      if (p && !mapped.some((m) => m.id === p.id)) mapped.push(p);
    }
    // Bei mehreren: die größte kartierte Fläche vertritt den Brand; die anderen werden gezählt.
    mapped.sort((a, b) => (b.areaHa ?? 0) - (a.areaHa ?? 0));
    mappedOf.set(c.id, mapped);
    if (mapped[0]) {
      const l = byEffis.get(mapped[0].id); if (l) l.push(c); else byEffis.set(mapped[0].id, [c]);
    }
  }
  const units: { c: FireCluster; parts: FireCluster[]; zs: FireZone[]; mapped: BurntPolygon[] }[] = [];
  const consumed = new Set<string>();
  for (const c of clusters) {
    if (consumed.has(c.id)) continue;
    const mapped = mappedOf.get(c.id) ?? [];
    const group = mapped[0] ? (byEffis.get(mapped[0].id) ?? [c]) : [c];
    for (const g of group) consumed.add(g.id);
    const zs = group.flatMap((g) => zonesByCluster.get(g.id) ?? []);
    const allMapped = new Map<string, BurntPolygon>();
    for (const g of group) for (const m of mappedOf.get(g.id) ?? []) allMapped.set(m.id, m);
    const merged = [...allMapped.values()].sort((a, b) => (b.areaHa ?? 0) - (a.areaHa ?? 0));
    // Die vertretende Fläche bleibt die des Gruppenschlüssels — an erster Stelle.
    if (mapped[0]) { const i = merged.findIndex((m) => m.id === mapped[0].id); if (i > 0) merged.unshift(...merged.splice(i, 1)); }
    units.push({ c: mergeClusters(group), parts: group, zs, mapped: merged });
  }

  for (const { c, parts, zs, mapped } of units) {
    const effis = mapped[0] ?? null;
    for (const m of mapped) usedPolys.add(m.id);

    const ems = emsActivationFor({ lat: c.lat, lon: c.lon, firstMs: c.firstMs }, emsActs);
    const estimatedZones = zs.filter((z) => !confirmedByZone.has(z.id));
    let upper = 0; let capped = false;
    for (const z of estimatedZones) { upper += z.areaHa; if (z.capped) capped = true; }

    const assessment = assess({
      mapped: effis, official: null, ems,
      overpasses: c.overpasses, suspectedStatic: c.mostlyStatic, atContext: null,
      landcover: input.landcoverAt ? input.landcoverAt(c.lat, c.lon) : null,
    });

    const geometry: FireRecord['geometry'] = effis
      ? { kind: 'effis', ref: effis.id }
      : zs.length > 0 ? { kind: 'raster', ref: zs.map((z) => z.id).join('|') }
      : c.hull.length >= 4 ? { kind: 'hull', ref: c.id }
      : { kind: 'point', ref: c.id };

    const method: FireMethod[] = ['viirs-cluster'];
    if (effis) method.push('effis-rda');
    if (ems) method.push('ems-activation');

    const status = statusOf(c.lastMs, effis, ems, nowMs);
    // AF2: Kontext für die Aktivität — Beobachtung nur bei „kein Signal", Wind nur wenn geliefert.
    const noSignal = status.kind === 'no-signal';
    const lastPass = c.passes.length > 0 ? c.passes[c.passes.length - 1] : null;
    const activityCtx = {
      noSignal,
      observation: noSignal && input.observationAt ? input.observationAt(c.lat, c.lon, c.lastMs) : null,
      windFromDeg: input.windAt && lastPass ? input.windAt(c.lat, c.lon, lastPass.atMs) : null,
    };
    out.push({
      id: clusterId(c),
      // Verschmolzene Cluster: ihre Anker-Kennungen bleiben als frühere Kennungen
      // sichtbar (Auswahl/Permalink springt nicht ins Leere).
      previousIds: parts.filter((g) => g.anchorKey !== c.anchorKey).map(clusterId),
      mergedFrom: [], splitFrom: null,
      country: c.country,
      lat: c.lat, lon: c.lon,
      bbox: effis ? unionBbox(c.bbox, effis.bbox) : c.bbox,
      geometry,
      status,
      firstMs: c.firstMs, lastMs: c.lastMs,
      hotspots: c.count, overpasses: c.overpasses, satellites: c.satellites,
      frpSumMw: c.sumFrp > 0 ? c.sumFrp : null,
      confidence: { firms: c.confidence, assessment: assessment.level, reasons: assessment.reasons },
      areaHa: effis
        ? { value: effis.areaHa, kind: 'mapped', source: 'EFFIS', capped: false }
        : zs.length > 0
          ? { value: Math.round(upper), kind: 'upper-bound', source: 'Detektionsraster', capped }
          : { value: null, kind: null, source: null, capped: false },
      method,
      sources: { cluster: c, zones: zs, effis, effisExtra: Math.max(0, mapped.length - 1), ems },
      place: effis && (effis.commune || effis.province)
        ? { name: effis.commune, district: effis.province, source: 'effis' }
        : placeFrom(input.placeAt, c.lat, c.lon),
      landcover: effis ? landcoverBreakdown(effis).map(({ key, pct }) => ({ key, pct })) : null,
      suspectedStatic: c.mostlyStatic,
      passes: c.passes,
      activity: activityOf(c.passes, activityCtx),
    });
    // AF4: Schätzung nach dem Bau (braucht den vollständigen Eintrag für den Merkmalsatz) — additiv.
    if (input.estimateFor) {
      const rec = out[out.length - 1];
      if (rec.activity) {
        const e = input.estimateFor(rec);
        rec.activity = { ...rec.activity, areaEst: e.estimate, areaEstReason: e.reason };
      }
    }
  }

  // Kartierte Flächen ohne Detektion im Fenster — nur im Zeitfenster der Historie.
  if (effisWindow) {
    for (const p of polys) {
      if (usedPolys.has(p.id)) continue;
      if (p.firedateMs == null || p.firedateMs < effisWindow.fromMs || p.firedateMs >= effisWindow.toMs) continue;
      const lon = (p.bbox[0] + p.bbox[2]) / 2; const lat = (p.bbox[1] + p.bbox[3]) / 2;
      const ems = emsActivationFor({ lat, lon, firstMs: p.firedateMs }, emsActs);
      const assessment = assess({ mapped: p, official: null, ems, overpasses: null, suspectedStatic: false, atContext: null, landcover: null });
      out.push({
        id: effisId(p),
        previousIds: [], mergedFrom: [], splitFrom: null,
        country: countryFromEffis(p.country),
        lat, lon, bbox: p.bbox,
        geometry: { kind: 'effis', ref: p.id },
        status: statusOf(null, p, ems, nowMs),
        firstMs: null, lastMs: null,
        hotspots: null, overpasses: null, satellites: null, frpSumMw: null,
        confidence: { firms: null, assessment: assessment.level, reasons: assessment.reasons },
        areaHa: { value: p.areaHa, kind: 'mapped', source: 'EFFIS', capped: false },
        method: ems ? ['effis-rda', 'ems-activation'] : ['effis-rda'],
        sources: { cluster: null, zones: [], effis: p, effisExtra: 0, ems },
        place: p.commune || p.province
          ? { name: p.commune, district: p.province, source: 'effis' }
          : placeFrom(input.placeAt, lat, lon),
        landcover: landcoverBreakdown(p).map(({ key, pct }) => ({ key, pct })),
        suspectedStatic: false,
        passes: [],
        activity: null,
      });
    }
  }
  return out;
}

/** Ort aus dem Verzeichnis — oder ausdrücklich nichts. */
function placeFrom(
  placeAt: RegistryInput['placeAt'], lat: number, lon: number,
): FireRecord['place'] {
  const hit = placeAt ? placeAt(lat, lon) : null;
  return hit
    ? { name: hit.name, district: hit.district, source: 'gazetteer', distanceKm: hit.distanceKm }
    : { name: null, district: null, source: null };
}

function unionBbox(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** EFFIS `COUNTRY` ist ein ISO-2-Code — nur DE/AT/CH werden übernommen, der Rest ist „außerhalb". */
export function countryFromEffis(code: string | null): Country | 'outside' | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return c === 'DE' || c === 'AT' || c === 'CH' ? (c as Country) : 'outside';
}

// ---------------------------------------------------------------------------
// Kennungen über Läufe hinweg: Anker-Wanderung, Merge, Split
// ---------------------------------------------------------------------------

/** Passen zwei Einträge zueinander (Lage UND Zeit)? */
function related(a: FireRecord, b: FireRecord): boolean {
  const boxes = !(a.bbox[2] < b.bbox[0] || b.bbox[2] < a.bbox[0] || a.bbox[3] < b.bbox[1] || b.bbox[3] < a.bbox[1]);
  const near = metersBetween(a, b) <= CLUSTER_RADIUS_M;
  if (!boxes && !near) return false;
  const aF = a.firstMs ?? a.status.sinceMs; const aL = a.lastMs ?? a.status.sinceMs;
  const bF = b.firstMs ?? b.status.sinceMs; const bL = b.lastMs ?? b.status.sinceMs;
  if (aF == null || aL == null || bF == null || bL == null) return true;
  return aF <= bL && bF <= aL;
}

/**
 * Reicht Kennungen des vorigen Laufs weiter. Regeln:
 *  • Ein neuer Eintrag, der genau einen alten fortsetzt, behält dessen Kennung
 *    (auch wenn der Anker gewandert ist) — `previousIds` nennt den eigenen Anker.
 *  • Führen mehrere alte in einen neuen ⇒ **Merge**: die Kennung des ältesten
 *    bleibt, die anderen stehen in `mergedFrom`.
 *  • Zerfällt ein alter in mehrere neue ⇒ **Split**: der dem alten Schwerpunkt
 *    nächste behält die Kennung, die anderen tragen `splitFrom`.
 * Nur `fire:`-Einträge wandern; `effis:`-Kennungen sind serverstabil.
 */
export function carryIds(next: readonly FireRecord[], previous: readonly FireRecord[]): FireRecord[] {
  if (previous.length === 0) return [...next];
  const prevFires = previous.filter((p) => p.id.startsWith('fire:'));
  const nextFires = next.filter((n) => n.id.startsWith('fire:'));
  const grid = new GridIndex<FireRecord>();
  for (const n of nextFires) grid.add(n, n.bbox, RADIUS_DEG);
  const candidates = (p: FireRecord): readonly FireRecord[] => {
    // Alle Zellen, die die alte Bbox (+ Radius) berührt — Duplikate entfernen.
    const seen = new Set<FireRecord>();
    const [w, s, e, nn] = p.bbox;
    for (const x of [w - RADIUS_DEG, (w + e) / 2, e + RADIUS_DEG]) for (const y of [s - RADIUS_DEG, (s + nn) / 2, nn + RADIUS_DEG]) {
      for (const c of grid.at(x, y)) seen.add(c);
    }
    return [...seen];
  };
  // Erbe je altem Eintrag: der nächstgelegene passende neue.
  const heirOf = new Map<FireRecord, FireRecord>();
  const relatedPrev = new Map<FireRecord, FireRecord[]>();   // je NEUER Eintrag: passende alte
  for (const p of prevFires) {
    let best: FireRecord | null = null; let bestD = Infinity;
    for (const n of candidates(p)) {
      if (!related(p, n)) continue;
      const rl = relatedPrev.get(n); if (rl) rl.push(p); else relatedPrev.set(n, [p]);
      const d = metersBetween(p, n);
      if (d < bestD) { best = n; bestD = d; }
    }
    if (best) heirOf.set(p, best);
  }
  return next.map((n) => {
    if (!n.id.startsWith('fire:')) return n;
    const rel = relatedPrev.get(n) ?? [];
    const inherited = rel.filter((p) => heirOf.get(p) === n)
      .sort((a, b) => (a.firstMs ?? 0) - (b.firstMs ?? 0) || a.id.localeCompare(b.id));
    const splitFrom = rel.find((p) => heirOf.get(p) !== n) ?? null;
    if (inherited.length === 0) {
      return splitFrom ? { ...n, splitFrom: splitFrom.id } : n;
    }
    const keep = inherited[0];
    const previousIds = new Set<string>([...keep.previousIds]);
    if (keep.id !== n.id) previousIds.add(n.id);
    for (const other of inherited.slice(1)) { previousIds.add(other.id); for (const x of other.previousIds) previousIds.add(x); }
    previousIds.delete(keep.id);
    return {
      ...n,
      id: keep.id,
      previousIds: [...previousIds],
      mergedFrom: [...new Set([...keep.mergedFrom, ...inherited.slice(1).map((o) => o.id)])],
      splitFrom: splitFrom ? splitFrom.id : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Sortierung und Filter (fürs Panel — pur, damit prüfbar)
// ---------------------------------------------------------------------------

/**
 * BP5: „Stärke" kam aus der Cluster-Liste mit — sie rankt nach der Summe der
 * Feuerstrahlungsleistung. Einträge ohne Detektion (reine EFFIS-Kartierungen)
 * haben keine Leistung; sie fallen ans Ende, statt mit einer erfundenen 0 in
 * der Rangfolge mitzulaufen.
 */
export type RecordSort = 'area' | 'recency' | 'status' | 'strength';

const STATUS_RANK: Record<FireStatusKind, number> = { active: 0, 'no-signal': 1, out: 2 };

export function sortRecords(records: readonly FireRecord[], by: RecordSort): FireRecord[] {
  const arr = [...records];
  const recency = (r: FireRecord) => r.lastMs ?? r.status.sinceMs ?? -Infinity;
  const area = (r: FireRecord) => r.areaHa.value ?? -1;
  const strength = (r: FireRecord) => r.frpSumMw ?? -1;
  if (by === 'area') arr.sort((a, b) => area(b) - area(a) || recency(b) - recency(a) || a.id.localeCompare(b.id));
  else if (by === 'recency') arr.sort((a, b) => recency(b) - recency(a) || area(b) - area(a) || a.id.localeCompare(b.id));
  else if (by === 'strength') arr.sort((a, b) => strength(b) - strength(a) || recency(b) - recency(a) || a.id.localeCompare(b.id));
  else arr.sort((a, b) => STATUS_RANK[a.status.kind] - STATUS_RANK[b.status.kind] || recency(b) - recency(a) || a.id.localeCompare(b.id));
  return arr;
}

export interface RecordFilter {
  minAreaHa: number;
  status: ReadonlySet<FireStatusKind> | null;
  countries: ReadonlySet<Country | 'outside'> | null;
}

export const DEFAULT_FILTER: RecordFilter = { minAreaHa: 0, status: null, countries: null };

/**
 * Filtert. Die Mindestfläche gilt für **beide** Flächenarten — ein Eintrag ohne
 * Fläche (`null`) fällt nur heraus, wenn eine Mindestfläche > 0 verlangt ist;
 * bei 0 bleibt er (kein Wert ist nicht 0 ha).
 */
export function filterRecords(records: readonly FireRecord[], f: RecordFilter): FireRecord[] {
  return records.filter((r) => {
    if (f.minAreaHa > 0 && !(r.areaHa.value != null && r.areaHa.value >= f.minAreaHa)) return false;
    if (f.status && f.status.size > 0 && !f.status.has(r.status.kind)) return false;
    if (f.countries && f.countries.size > 0) {
      if (r.country == null) return true;   // unbekannt bleibt sichtbar — nichts wird behauptet
      if (!f.countries.has(r.country)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Beschriftungen — EINE Quelle für Panel, Karte und Verifier
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<FireStatusKind, string> = {
  active: 'aktiv',
  'no-signal': 'kein Signal',
  out: 'erloschen',
};

/**
 * Statusfarben — EINE Quelle für Karte, Liste und Legende. Terracotta ist in
 * dieser Ansicht Detektion; Amber „kein Signal" (nicht grün: keine Entwarnung);
 * Slate „erloschen" (nur mit Quelle). Grau (`STATIC_GREY`) bleibt der
 * Ortsfest-Vorbehalt und wird hier nicht neu erfunden.
 */
export const STATUS_COLOR: Record<FireStatusKind, string> = {
  active: '#C2542B',
  'no-signal': '#C99A3C',
  out: '#6B7A8F',
};

/**
 * Wann der Brand zuletzt DETEKTIERT wurde — Zeitpunkt und Alter.
 *
 * Bewusst aus `r.lastMs` und nicht aus `status.sinceMs`: `sinceMs` trägt je
 * nach Status verschiedene Dinge (Detektion, EFFIS-`FINALDATE`, EFFIS-Branddatum).
 * Als „letzte Detektion" darf nur eine echte Detektion beschriftet werden;
 * gibt es keine, wird genau das gesagt statt einer fremden Zahl.
 */
export function lastDetectionLabel(r: FireRecord, nowMs: number): string {
  if (r.lastMs == null) return 'keine Detektion im Fenster';
  return `letzte Detektion ${stampLabel(r.lastMs, nowMs)} · ${ageText(Math.max(0, nowMs - r.lastMs))}`;
}

/**
 * Statuszeile mit Zeitbezug — „erloschen" nennt immer die Quelle, und JEDE
 * Zeile sagt, wann zuletzt detektiert wurde (oder dass es keine Detektion gab).
 */
export function statusLabel(r: FireRecord, nowMs: number): string {
  const s = r.status;
  const det = lastDetectionLabel(r, nowMs);
  if (s.kind === 'active') {
    // Die Satellitenquelle steht schon im Detektionssatz; eine EMS-Aktivierung
    // ist eine ZWEITE Quelle und wird deshalb zusätzlich genannt.
    return s.source && s.source !== 'Satellitendetektion'
      ? `aktiv · ${s.source} · ${det}`
      : `aktiv · ${det}`;
  }
  if (s.kind === 'no-signal') {
    // Ohne eigene Detektion bleibt nur das Branddatum der Kartierung — es wird
    // benannt, statt als „letzte Detektion" ausgegeben zu werden.
    if (r.lastMs == null && s.sinceMs != null) {
      return `kein Signal · ${det} · EFFIS-Brandbeginn ${stampLabel(s.sinceMs, nowMs)} · ${ageText(Math.max(0, nowMs - s.sinceMs))}`;
    }
    return `kein Signal · ${det}`;
  }
  return `erloschen · ${s.source ?? 'Quelle fehlt'} · ${det}`;
}

/** Fläche mit ihrer Art — nie eine nackte Zahl. */
export function areaLabel(r: FireRecord): string {
  const a = r.areaHa;
  if (a.value == null || a.kind == null) return '—';
  const n = a.value.toLocaleString('de-DE', { maximumFractionDigits: 0 });
  if (a.kind === 'mapped') return `${n} ha kartiert`;
  return `bis ${n} ha${a.capped ? ' (unvollständig)' : ''}`;
}

/**
 * **VB3 — die vorläufige Brandfläche.** Die Flächenaussage eines Eintrags, der
 * (noch) keine Kartierung hat, in einem Stück statt in zwei Zeilen.
 *
 * Warum der Text so und nicht anders steht — gemessen in `audit/brandflaeche-vorlaeufig.md`
 * an 618 Paaren (EFFIS-Kartierung × FIRMS-Detektionen, 2020–2026):
 *
 *  • **Die Zahl ist die Schätzung, die Form bleibt das Raster.** Zeichnet man die
 *    geschätzte Größe als eigene Kontur (Erosion, FRP-Kern, Kreis), sinkt die
 *    Übereinstimmung mit der späteren Kartierung (IoU-Median 0,095 → 0,092/0,088/0,090),
 *    und der Anteil der Formen, die die echte Brandfläche gar nicht mehr berühren,
 *    steigt von 1 % auf 24–36 %. Die Größe stimmt dann (Flächenverhältnis 1,03 statt
 *    6,10) — und genau dabei geht die Lage verloren.
 *  • **Deshalb der Einschluss-Satz.** In 99 % der Fälle liegt die kartierte Fläche
 *    IM Raster; der Schwerpunkt weicht aber im Median um ~261 m ab (rund eine
 *    Pixelbreite: VIIRS sieht die Flammenfront zum Überflug, EFFIS kartiert die Narbe
 *    danach). „Liegt darin, Lage darin unbekannt" ist genau das, was die Daten hergeben.
 *  • **Nie ohne Intervall**, nie ohne das Wort „geschätzt", nie ohne den Vorrang der
 *    Kartierung: bei 0–2 ha liegt der Punktwert im Median 7,45-fach zu hoch, bei
 *    > 200 ha 0,17-fach zu tief (Regression zur Mitte eines log-log-Fits mit σ 1,33).
 *
 * `null`, sobald eine Kartierung vorliegt — die misst, statt zu schätzen.
 */
export interface ProvisionalArea { head: string; value: string; note: string; source: string }

export function provisionalAreaText(e: AreaEstimate, coverageHa: number | null): ProvisionalArea {
  const cover = coverageHa != null && coverageHa > 0
    ? ` (${Math.round(coverageHa).toLocaleString('de-DE')} ha Satellitenabdeckung)`
    : '';
  return {
    head: 'Vorläufige Brandfläche (geschätzt)',
    value: estimateValueText(e),
    note: `Der Brand liegt in der gezeichneten Fläche${cover}; seine genaue Lage darin ist `
      + 'unbekannt. Kein Ersatz für eine Kartierung.',
    source: estimateSourceText(e),
  };
}

/** Dieselbe Aussage aus einem Eintrag — `null` bei Kartierung oder ohne Schätzung. */
export function provisionalArea(r: FireRecord): ProvisionalArea | null {
  if (r.areaHa.kind === 'mapped' || r.sources.effis) return null;
  const e = r.activity?.areaEst;
  return e ? provisionalAreaText(e, r.areaHa.kind === 'upper-bound' ? r.areaHa.value : null) : null;
}

/** Warum eine Zelle „—" zeigt — als `title`, damit die Lücke einen Grund hat. */
export function missingReason(r: FireRecord, field: 'area' | 'country' | 'place' | 'hotspots' | 'confidence'): string | null {
  switch (field) {
    case 'area': return r.areaHa.value == null ? 'weder kartierte Fläche noch Detektionsraster vorhanden' : null;
    case 'country': return r.country == null ? 'Landesumrisse noch nicht geladen' : null;
    case 'place': return r.place.name == null && r.place.district == null ? 'Ort nicht bestimmt — kein Verzeichnis-Ort im Umkreis von 20 km oder Verzeichnis noch nicht geladen' : null;
    case 'hotspots': return r.hotspots == null ? 'keine Satellitendetektion in diesem Fenster — Eintrag stammt aus der EFFIS-Kartierung' : null;
    case 'confidence': return r.confidence.firms == null ? 'keine FIRMS-Konfidenz ohne Detektion' : null;
  }
}

/** FIRMS-Konfidenz aggregiert: „überwiegend nominal, 12 % hoch". */
export function confidenceLabel(r: FireRecord): string {
  const c = r.confidence.firms;
  if (!c) return '—';
  const total = c.low + c.nominal + c.high + c.unknown;
  if (total === 0) return '—';
  const parts: [string, number][] = [['hoch', c.high], ['nominal', c.nominal], ['gering', c.low]];
  parts.sort((a, b) => b[1] - a[1]);
  const [top, topN] = parts[0];
  const rest = parts.slice(1).filter(([, n]) => n > 0).map(([l, n]) => `${Math.round((n / total) * 100)} % ${l}`);
  if (topN === total) return `alle ${top}`;
  return `überwiegend ${top}${rest.length ? `, ${rest.join(', ')}` : ''}`;
}

export const METHOD_LABEL: Record<FireMethod, string> = {
  'viirs-cluster': 'Satellit (VIIRS 375 m)',
  'effis-rda': 'EFFIS-Kartierung',
  'ems-activation': 'Copernicus-EMS-Aktivierung',
};

/** Der Pflichthinweis über der Liste — er nennt beide Fenster und die Flächenarten. */
export function registryNote(windowH: number, historyDays: number): string {
  const win = windowH >= 168 ? '7 Tage' : `${windowH} h`;
  return `Ein Eintrag je Brand: Satellitendetektionen der letzten ${win} (NASA FIRMS, zusammengefasst `
    + `wie in der Cluster-Liste) und von EFFIS kartierte Brandflächen mit Branddatum in den letzten `
    + `${historyDays} Tagen. Zeigt eine kartierte Fläche denselben Brand, vertritt sie ihn — es liegt `
    + `nie zweierlei übereinander. „… ha kartiert" ist die von EFFIS gemessene Fläche; „bis … ha" ist die `
    + `vom Satelliten abgedeckte Fläche, eine Obergrenze (ein Pixel deckt 14–60 ha) und keine Brandfläche. `
    + `„Aktiv" heißt: Detektion in den letzten 24 h oder offene EMS-Aktivierung; „kein Signal" ist keine `
    + `Entwarnung (Wolken, Überflugslücken); „erloschen" steht nur mit Quelle. Grau markierte Einträge sind `
    + `überwiegend ortsfest (häufig Industrie) — eigene Einordnung, kein Nachweis. Der Verlauf gilt `
    + `innerhalb des Fensters; über Sitzungen hinweg gibt es keinen Speicher.`;
}

// ---------------------------------------------------------------------------
// GeoJSON für die Karte — genau EINE Form je Eintrag
// ---------------------------------------------------------------------------

export interface FootprintFeatureProps extends Record<string, unknown> {
  id: string;
  status: FireStatusKind;
  kind: FootprintGeometryKind;
  /** 1 = dieselbe Geometrie zeichnet gerade schon ein anderer Layer (Bestand) — dann nur Kontur. */
  dup: 0 | 1;
  areaHa: number | null;
  areaKind: 'mapped' | 'upper-bound' | null;
  static: 0 | 1;
}

/**
 * Baut die Flächen. `drawnElsewhere` sagt, welche Formen ein anderer aktiver
 * Layer bereits zeichnet (EFFIS-Flächen bei `fireBurnt`, Raster/Hüllen bei
 * `fireHotspots`): dann trägt das Feature `dup: 1` und der Stil zeichnet nur die
 * Statuskontur — dieselbe Geometrie zweimal gefüllt wäre zwar keine zweite
 * Form, aber ein doppelt gedeckter Ton, der wie ein anderer Wert aussieht.
 */
export function footprintsToGeoJSON(
  records: readonly FireRecord[],
  /** `effis` darf die Menge der GEZEICHNETEN EFFIS-Kennungen sein — genauer als ein Pauschal-Ja. */
  drawnElsewhere: { effis: boolean | ReadonlySet<string>; raster: boolean; hull: boolean },
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const r of records) {
    let geometry: GeoJSON.Geometry | null = null;
    let dup: 0 | 1 = 0;
    if (r.geometry.kind === 'effis' && r.sources.effis) {
      const p = r.sources.effis;
      geometry = p.polys.length === 1
        ? { type: 'Polygon', coordinates: p.polys[0] }
        : { type: 'MultiPolygon', coordinates: p.polys };
      dup = (typeof drawnElsewhere.effis === "boolean" ? drawnElsewhere.effis : drawnElsewhere.effis.has(p.id)) ? 1 : 0;
    } else if (r.geometry.kind === 'raster') {
      const polys = r.sources.zones.flatMap((z) => z.polys);
      geometry = { type: 'MultiPolygon', coordinates: polys };
      dup = drawnElsewhere.raster ? 1 : 0;
    } else if (r.geometry.kind === 'hull' && r.sources.cluster) {
      geometry = { type: 'Polygon', coordinates: [r.sources.cluster.hull] };
      dup = drawnElsewhere.hull ? 1 : 0;
    } else {
      continue; // Punkt: kein Polygon — der Hotspot selbst liegt dort
    }
    const props: FootprintFeatureProps = {
      id: r.id, status: r.status.kind, kind: r.geometry.kind, dup,
      areaHa: r.areaHa.value, areaKind: r.areaHa.kind, static: r.suspectedStatic ? 1 : 0,
    };
    features.push({ type: 'Feature', geometry, properties: props });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Zusicherung: jeder Eintrag hat höchstens EINE gezeichnete Form, jede kartierte
 * Fläche vertritt höchstens EINEN Eintrag, und keine Hektarzahl steht ohne Art.
 */
export function assertRegistry(records: readonly FireRecord[]): { ok: boolean; problem: string | null } {
  const ids = new Set<string>();
  const effisUsed = new Set<string>();
  for (const r of records) {
    if (ids.has(r.id)) return { ok: false, problem: `Kennung ${r.id} doppelt` };
    ids.add(r.id);
    if (r.areaHa.value != null && r.areaHa.kind == null) return { ok: false, problem: `${r.id}: Hektarzahl ohne Art` };
    if (r.areaHa.kind === 'mapped' && !r.sources.effis) return { ok: false, problem: `${r.id}: „kartiert" ohne EFFIS-Quelle` };
    if (r.status.kind === 'out' && !r.status.source) return { ok: false, problem: `${r.id}: „erloschen" ohne Quelle` };
    if (r.geometry.kind === 'effis') {
      if (!r.sources.effis) return { ok: false, problem: `${r.id}: EFFIS-Form ohne Fläche` };
      if (effisUsed.has(r.sources.effis.id)) return { ok: false, problem: `EFFIS ${r.sources.effis.id} vertritt zwei Einträge` };
      effisUsed.add(r.sources.effis.id);
    }
    if (r.confidence.assessment === 'bestaetigt' && !r.sources.effis && !r.sources.ems) {
      return { ok: false, problem: `${r.id}: „bestätigt" ohne EFFIS/EMS` };
    }
  }
  return { ok: true, problem: null };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface RegistryCheck { name: string; ok: boolean; detail?: string }

export function verifyFireRegistry(): { checks: RegistryCheck[]; passed: number; total: number } {
  const checks: RegistryCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000; const D = 24 * H;
  const now = Date.UTC(2026, 7, 16, 12, 0);
  const build = (rows: readonly FirmsRow[], polys: BurntPolygon[] = [], ems: EmsActivation[] = [], staticKeys?: ReadonlySet<string>) => {
    const clusters = buildFireClusters(rows, undefined, staticKeys);
    const zones = buildFireZones(rows);
    return buildFireRegistry({
      clusters, zones, reconciled: reconcileZones(zones, polys), polys,
      effisWindow: { fromMs: now - 7 * D, toMs: now + D }, emsActs: ems, nowMs: now,
    });
  };

  // --- Grundfall: ein Feuer, zwei Überflüge -----------------------------------
  const rows1 = [fixtureRow(50, 10, now - 3 * H, 10), fixtureRow(50.003, 10.002, now - 3 * H, 4)];
  const rows2 = [...rows1, fixtureRow(50.006, 10.004, now - 1 * H, 8)];
  const r1 = build(rows1); const r2 = build(rows2);
  add('ein Cluster ⇒ ein Eintrag mit fire:-Kennung', r1.length === 1 && r1[0].id.startsWith('fire:'), r1[0]?.id);
  add('ein weiterer Überflug lässt die Kennung STEHEN (Anker)', r1[0].id === r2[0].id, `${r1[0].id} / ${r2[0].id}`);
  add('… und zählt Hotspots, Überflüge, Verlauf hoch',
    r2[0].hotspots === 3 && r2[0].overpasses === 2 && r2[0].passes.length === 2 && r1[0].passes.length === 1);
  add('Detektion vor 1 h ⇒ Status aktiv mit Satellitenquelle',
    r2[0].status.kind === 'active' && r2[0].status.source === 'Satellitendetektion'
    && /aktiv/.test(statusLabel(r2[0], now)) && /vor 1 h/.test(statusLabel(r2[0], now)), statusLabel(r2[0], now));
  // Jede Zeile sagt, WANN zuletzt detektiert wurde — Zeitpunkt UND Alter.
  add('… und nennt den Zeitpunkt der letzten Detektion, nicht nur ihr Alter',
    /letzte Detektion \d{2}:\d{2} · vor 1 h/.test(statusLabel(r2[0], now)), statusLabel(r2[0], now));
  add('ohne Kartierung: Fläche = Obergrenze aus dem Raster, mit Art',
    r2[0].areaHa.kind === 'upper-bound' && (r2[0].areaHa.value ?? 0) > 0 && /^bis \d+ ha$/.test(areaLabel(r2[0])), areaLabel(r2[0]));
  add('Geometrie ist das Raster (nicht die Hülle), solange nichts kartiert ist', r2[0].geometry.kind === 'raster');
  add('Konfidenz wird aggregiert („alle nominal")', confidenceLabel(r2[0]) === 'alle nominal', confidenceLabel(r2[0]));
  add('Bewertung: mehrere Überflüge ⇒ plausibel, nicht bestätigt', r2[0].confidence.assessment === 'plausibel');
  add('Zusicherung hält', assertRegistry(r2).ok, assertRegistry(r2).problem ?? '');

  // --- Kartierung: EFFIS ersetzt das Raster, Fläche wird „kartiert" -----------
  const poly = fixturePoly('p1', 10.002, 50.003, 0.004, now - 2 * D, 47);
  const r3 = build(rows2, [poly]);
  add('mit passender EFFIS-Fläche: Geometrie effis, Fläche „47 ha kartiert", Methode enthält EFFIS',
    r3.length === 1 && r3[0].geometry.kind === 'effis' && areaLabel(r3[0]) === '47 ha kartiert'
    && r3[0].method.includes('effis-rda') && r3[0].sources.effis?.id === 'p1', areaLabel(r3[0]));
  add('… und die Bewertung sagt „bestätigt" MIT EFFIS im Satz',
    r3[0].confidence.assessment === 'bestaetigt' && r3[0].confidence.reasons.some((s) => /EFFIS/.test(s)));
  add('die kartierte Fläche erscheint NICHT zusätzlich als eigener Eintrag (nie zweierlei)',
    !r3.some((r) => r.id === 'effis:p1') && assertRegistry(r3).ok);
  add('Ort/Kreis kommen aus EFFIS (PROVINCE/COMMUNE), Landbedeckung ebenso',
    r3[0].place.source === 'effis' && r3[0].place.district === 'Test' && (r3[0].landcover?.[0]?.key === 'CONIFER'));

  // --- Mehrere Cluster in EINER Kartierung ⇒ EIN Eintrag (Hohes Venn, live) -----
  const dLat25 = 2500 / 110_574;
  const twoIn = [fixtureRow(50, 10, now - 3 * H, 10), fixtureRow(50 + dLat25, 10, now - 1 * H, 4)];
  const bigPoly = fixturePoly('venn', 10, 50 + dLat25 / 2, 0.03, now - 2 * D, 2825);
  const rv = build(twoIn, [bigPoly]);
  add('zwei Cluster (2,5 km) in DERSELBEN EFFIS-Fläche ⇒ EIN Eintrag mit summierten Hotspots',
    buildFireClusters(twoIn).length === 2 && rv.length === 1 && rv[0].hotspots === 2 && rv[0].overpasses === 2
    && rv[0].sources.effis?.id === 'venn' && assertRegistry(rv).ok,
    `${rv.length} Einträge, ${rv[0]?.hotspots} Hotspots`);
  add('… der Eintrag trägt den Anker des älteren Clusters und den anderen als frühere Kennung',
    rv[0].id === 'fire:' + buildFireClusters([twoIn[0]])[0].anchorKey && rv[0].previousIds.length === 1);

  // --- BP3: Ort aus dem Verzeichnis, nur wo EFFIS keinen liefert -----------------
  const withPlace = buildFireRegistry({
    clusters: buildFireClusters(rows2), zones: buildFireZones(rows2), reconciled: reconcileZones(buildFireZones(rows2), []),
    polys: [], effisWindow: null, emsActs: [], nowMs: now,
    placeAt: (lat, lon) => (Math.abs(lat - 50) < 0.1 && Math.abs(lon - 10) < 0.1 ? { name: 'Adorf', district: 'Landkreis A', distanceKm: 1.2 } : null),
  });
  add('BP3: ohne EFFIS-Ort kommt der nächste Ort aus dem Verzeichnis — mit Quelle und Entfernung',
    withPlace[0].place.source === 'gazetteer' && withPlace[0].place.name === 'Adorf' && withPlace[0].place.distanceKm === 1.2);
  add('BP3: mit EFFIS-Ort bleibt EFFIS die Quelle (Verzeichnis nur als Rückfall)',
    r3[0].place.source === 'effis');
  add('BP3: kein Ort im Umkreis ⇒ nichts behauptet (source null)',
    build([fixtureRow(48, 12, now - H, 3)])[0].place.source === null);

  // --- Kartierte Fläche OHNE Detektion ⇒ eigener effis:-Eintrag ----------------
  const lone = fixturePoly('p9', 12, 52, 0.004, now - 3 * D, 5);
  const r4 = build(rows2, [lone]);
  add('kartierte Fläche ohne Detektion im Fenster ⇒ eigener effis:-Eintrag, Status „kein Signal seit Branddatum"',
    r4.length === 2 && r4.some((r) => r.id === 'effis:p9' && r.status.kind === 'no-signal' && r.hotspots == null),
    r4.map((r) => r.id).join(','));
  add('… und außerhalb des Historie-Fensters NICHT',
    build(rows2, [fixturePoly('old', 12, 52, 0.004, now - 40 * D, 5)]).length === 1);
  add('„—" hat einen Grund (fehlende Hotspots eines EFFIS-Eintrags)',
    /EFFIS/.test(missingReason(r4.find((r) => r.id === 'effis:p9')!, 'hotspots') ?? ''));

  // --- Status: „erloschen" nur mit Quelle -------------------------------------
  const ended = { ...fixturePoly('pe', 12, 52, 0.004, now - 5 * D, 5), finaldateMs: now - 3 * D };
  const r5 = build([], [ended]);
  add('EFFIS FINALDATE ⇒ erloschen mit Quelle im Label',
    r5[0]?.status.kind === 'out' && /EFFIS/.test(statusLabel(r5[0], now)), statusLabel(r5[0], now));
  add('… und auch „erloschen" sagt, ob es eine Detektion gab',
    /keine Detektion im Fenster/.test(statusLabel(r5[0], now)), statusLabel(r5[0], now));
  const stale = build([fixtureRow(50, 10, now - 3 * D, 10)]);
  add('Detektion vor 3 Tagen ohne Quelle ⇒ „kein Signal · letzte Detektion … vor 3 T", NIE erloschen',
    stale[0].status.kind === 'no-signal' && /^kein Signal · letzte Detektion /.test(statusLabel(stale[0], now))
    && /vor 3 T/.test(statusLabel(stale[0], now)), statusLabel(stale[0], now));
  // Ein Zeitstempel, der älter als heute ist, trägt das Datum — sonst läse sich
  // „03:43" wie heute Nacht.
  add('… und der Zeitpunkt trägt bei älteren Detektionen das Datum',
    /letzte Detektion \d{2}\.\d{2}\., \d{2}:\d{2}/.test(statusLabel(stale[0], now)), statusLabel(stale[0], now));
  add('heute detektiert ⇒ nur die Uhrzeit, kein Datum',
    /^\d{2}:\d{2}$/.test(stampLabel(now - 3_600_000, now)), stampLabel(now - 3_600_000, now));
  // „letzte Detektion" darf NIE ein fremdes Datum beschriften: ein EFFIS-Eintrag
  // ohne Überflug im Fenster sagt das ausdrücklich (statt das Branddatum als
  // Detektion auszugeben).
  const effisOnly = build([], [fixturePoly('pd', 12, 52, 0.004, now - 5 * D, 5)]);
  add('EFFIS-Eintrag ohne Detektion ⇒ „keine Detektion im Fenster", Branddatum getrennt benannt',
    effisOnly.length === 1 && effisOnly[0].lastMs == null
    && /keine Detektion im Fenster/.test(statusLabel(effisOnly[0], now))
    && /EFFIS-Brandbeginn/.test(statusLabel(effisOnly[0], now))
    && !/letzte Detektion/.test(statusLabel(effisOnly[0], now)), statusLabel(effisOnly[0], now));
  const emsOpen: EmsActivation = { code: 'EMSR920', name: 'x', countries: ['DE'], category: 'Wildfire', isFire: true, lat: 50, lon: 10, eventMs: now - 4 * D, activationMs: null, closed: false };
  const r6 = build([fixtureRow(50, 10, now - 3 * D, 10)], [], [emsOpen]);
  add('offene EMS-Aktivierung hält den Status aktiv — mit EMS-Kennung als Quelle',
    r6[0].status.kind === 'active' && /EMSR920/.test(r6[0].status.source ?? ''));
  add('EMS ⇒ „bestätigt" mit Kennung', r6[0].confidence.assessment === 'bestaetigt' && r6[0].method.includes('ems-activation'));

  // --- Zusicherung erkennt Verstöße -------------------------------------------
  const bad: FireRecord = { ...r2[0], areaHa: { value: 5, kind: null, source: null, capped: false } };
  add('Zusicherung: Hektarzahl ohne Art wird erkannt', !assertRegistry([bad]).ok);
  const badOut: FireRecord = { ...r2[0], status: { kind: 'out', sinceMs: now, source: null } };
  add('Zusicherung: „erloschen" ohne Quelle wird erkannt', !assertRegistry([badOut]).ok);
  const badConf: FireRecord = { ...r2[0], confidence: { ...r2[0].confidence, assessment: 'bestaetigt' } };
  add('Zusicherung: „bestätigt" ohne EFFIS/EMS wird erkannt', !assertRegistry([badConf]).ok);

  // --- Kennungen über Läufe: Anker-Wanderung, Merge, Split ---------------------
  // Anker fällt aus dem Fenster: alter Lauf hatte die Detektion von vor 30 h.
  const prevRows = [fixtureRow(50, 10, now - 30 * H, 10), fixtureRow(50.003, 10.002, now - 5 * H, 4)];
  const nextRows = [fixtureRow(50.003, 10.002, now - 5 * H, 4), fixtureRow(50.005, 10.003, now - 1 * H, 4)];
  const prev = build(prevRows); const nxt = carryIds(build(nextRows), prev);
  add('Anker-Wanderung: der neue Lauf behält die alte Kennung, der eigene Anker steht in previousIds',
    nxt[0].id === prev[0].id && nxt[0].previousIds.length === 1 && nxt[0].previousIds[0].startsWith('fire:'),
    `${prev[0].id} → ${nxt[0].id}`);
  // Merge: zwei alte Cluster (2,5 km auseinander) wachsen durch eine Detektion dazwischen zusammen.
  const dLat = 2500 / 110_574;
  const twoPrev = build([fixtureRow(50, 10, now - 6 * H, 10), fixtureRow(50 + dLat, 10, now - 4 * H, 10)]);
  const merged = carryIds(build([fixtureRow(50, 10, now - 6 * H, 10), fixtureRow(50 + dLat, 10, now - 4 * H, 10), fixtureRow(50 + dLat / 2, 10, now - 1 * H, 10)]), twoPrev);
  add('Merge: ein neuer Eintrag aus zwei alten — Kennung des älteren, der andere in mergedFrom',
    twoPrev.length === 2 && merged.length === 1 && merged[0].mergedFrom.length === 1
    && merged[0].id === twoPrev.slice().sort((a, b) => (a.firstMs ?? 0) - (b.firstMs ?? 0))[0].id,
    `${merged[0]?.id} ⇐ ${merged[0]?.mergedFrom.join(',')}`);
  // Split: ein alter Cluster, der neue Lauf zeigt zwei getrennte (die Brücke fiel aus dem Fenster).
  const onePrev = build([fixtureRow(50, 10, now - 6 * H, 10), fixtureRow(50 + dLat / 2, 10, now - 30 * H, 10), fixtureRow(50 + dLat, 10, now - 4 * H, 10)]);
  const split = carryIds(build([fixtureRow(50, 10, now - 6 * H, 10), fixtureRow(50 + dLat, 10, now - 4 * H, 10)]), onePrev);
  add('Split: einer behält die Kennung, der andere trägt splitFrom',
    onePrev.length === 1 && split.length === 2
    && split.filter((r) => r.id === onePrev[0].id).length === 1
    && split.some((r) => r.splitFrom === onePrev[0].id && r.id !== onePrev[0].id),
    split.map((r) => `${r.id}${r.splitFrom ? '⇐' + r.splitFrom : ''}`).join(' | '));
  add('effis:-Kennungen wandern nicht', carryIds(r4, r4).find((r) => r.id === 'effis:p9') != null);
  add('ohne vorigen Lauf ändert carryIds nichts', carryIds(r2, []).map((r) => r.id).join() === r2.map((r) => r.id).join());

  // --- Sortierung und Filter ----------------------------------------------------
  const mix = build(
    [fixtureRow(50, 10, now - 1 * H, 10), fixtureRow(50, 10, now - 1 * H + 60_000, 10)],
    [fixturePoly('big', 12, 52, 0.01, now - 2 * D, 300), fixturePoly('small', 13, 53, 0.002, now - 1 * D, 2)],
  );
  add('Sortierung nach Fläche: kartierte 300 ha zuerst',
    sortRecords(mix, 'area')[0].sources.effis?.id === 'big');
  add('Sortierung nach Aktualität: die aktive Detektion zuerst',
    sortRecords(mix, 'recency')[0].id.startsWith('fire:'));
  add('Sortierung nach Status: aktiv vor kein Signal', sortRecords(mix, 'status')[0].status.kind === 'active');
  // BP5: die Rangfolge der früheren Cluster-Liste — stärkste Leistung zuerst,
  // Einträge ohne Detektion (reine Kartierung) ans Ende statt mit 0 nach vorn.
  add('Sortierung nach Stärke: die stärkste Detektionsgruppe zuerst',
    sortRecords(mix, 'strength')[0].frpSumMw != null
    && sortRecords(mix, 'strength')[0].frpSumMw === Math.max(...mix.map((r) => r.frpSumMw ?? -1)),
    String(sortRecords(mix, 'strength')[0].frpSumMw));
  add('… und ein Eintrag ohne Leistung steht hinten, nicht bei 0 MW',
    sortRecords(mix, 'strength').at(-1)?.frpSumMw == null,
    String(sortRecords(mix, 'strength').at(-1)?.frpSumMw));
  add('Filter Mindestfläche 100 ha behält nur die 300 ha (die 2-ha-Fläche und die Obergrenze fallen)',
    filterRecords(mix, { ...DEFAULT_FILTER, minAreaHa: 100 }).length === 1);
  add('Filter Status „aktiv" behält den Cluster',
    filterRecords(mix, { ...DEFAULT_FILTER, status: new Set(['active']) }).length === 1);
  add('Filter Land: unbekanntes Land bleibt sichtbar (nichts wird behauptet), DE-Filter lässt EFFIS-DE stehen',
    filterRecords(mix, { ...DEFAULT_FILTER, countries: new Set(['AT']) }).length === 1
    && filterRecords(mix, { ...DEFAULT_FILTER, countries: new Set(['DE']) }).length === 3);
  add('Sortierung ist reihenfolgeunabhängig',
    sortRecords([...mix].reverse(), 'area').map((r) => r.id).join() === sortRecords(mix, 'area').map((r) => r.id).join());

  // --- Ortsfest-Vorbehalt kommt mit ----------------------------------------------
  const industry: FirmsRow[] = [];
  for (let d = 0; d < 6; d++) industry.push(fixtureRow(51.48, 6.72 + d * 0.0001, now - d * D, 40));
  const keys = new Set(industry.map((r) => detectionKey(r)));
  const marked = build(industry, [], [], keys);
  add('überwiegend ortsfest ⇒ suspectedStatic, Bewertung unbestätigt (kein „plausibel" durch Überflüge)',
    marked[0].suspectedStatic === true && marked[0].confidence.assessment === 'unbestaetigt');

  // --- GeoJSON: eine Form je Eintrag, dup-Markierung -----------------------------
  const fc = footprintsToGeoJSON(r3, { effis: true, raster: false, hull: false });
  add('EFFIS-Eintrag zeichnet die EFFIS-Fläche — mit dup, wenn der Brandflächen-Layer sie schon zeigt',
    fc.features.length === 1 && fc.features[0].properties?.kind === 'effis' && fc.features[0].properties?.dup === 1);
  const fc2 = footprintsToGeoJSON(r2, { effis: false, raster: false, hull: false });
  add('Raster-Eintrag zeichnet das Raster (MultiPolygon), ohne dup',
    fc2.features.length === 1 && fc2.features[0].geometry.type === 'MultiPolygon' && fc2.features[0].properties?.dup === 0);
  add('Features tragen Status, Flächenart und Kennung',
    fc2.features[0].properties?.status === 'active' && fc2.features[0].properties?.areaKind === 'upper-bound' && fc2.features[0].properties?.id === r2[0].id);

  // --- Sprache -----------------------------------------------------------------------
  const note = registryNote(24, 7);
  add('der Pflichthinweis nennt beide Fenster, beide Flächenarten und dass „kein Signal" keine Entwarnung ist',
    /24 h/.test(note) && /7 Tagen/.test(note) && /kartiert/.test(note) && /Obergrenze/.test(note) && /keine\s+Entwarnung/.test(note));
  add('keine Statusbeschriftung nennt „bestätigt"', !Object.values(STATUS_LABEL).some((s) => /bestätigt/.test(s)));

  // --- Mengengerüst -------------------------------------------------------------------
  const bulk: FirmsRow[] = [];
  for (let i = 0; i < 3000; i++) bulk.push(fixtureRow(46 + (i % 60) * 0.12, 6 + Math.floor(i / 60) * 0.2, now - (i % 40) * H, 5));
  const bulkPolys: BurntPolygon[] = [];
  for (let i = 0; i < 300; i++) bulkPolys.push(fixturePoly(`b${i}`, 6 + (i % 30) * 0.35, 46 + Math.floor(i / 30) * 0.7, 0.003, now - (i % 6) * D, 5));
  const cl = buildFireClusters(bulk); const zn = buildFireZones(bulk);
  const rec = reconcileZones(zn, bulkPolys);
  // V-AF-10: bester von drei Läufen — der Anker soll die Kosten des Rechenwegs messen, nicht
  // JIT-Kaltphase und GC-Ausreißer (82…240 ms Streuung auf derselben Maschine, gemessen 2026-08-18;
  // Einzellauf davor 96…118 ms). Eine echte Verteuerung zeigt sich auch im Minimum; Schwelle bleibt.
  let best = Infinity; let big: FireRecord[] = [];
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    big = buildFireRegistry({ clusters: cl, zones: zn, reconciled: rec, polys: bulkPolys, effisWindow: { fromMs: now - 7 * D, toMs: now + D }, emsActs: [], nowMs: now });
    best = Math.min(best, performance.now() - t0);
  }
  const t1 = performance.now();
  carryIds(big, big);
  const t2 = performance.now();
  add('3 000 Detektionen + 300 Flächen: Registry < 150 ms (bester von 3 Läufen)', best < 150, `${Math.round(best)} ms, ${big.length} Einträge`);
  add('… und carryIds < 250 ms', t2 - t1 < 250, `${Math.round(t2 - t1)} ms`);
  add('Zusicherung hält auch im Mengengerüst', assertRegistry(big).ok, assertRegistry(big).problem ?? '');

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}

// timeMatches wird bewusst nur re-exportiert genutzt, damit der Zeitvertrag EINE Quelle hat.
export { timeMatches };
