/**
 * Klassifikation der Hotspots im Worker — mit Hauptthread-Rückfall (V-222).
 *
 * ── Vier Bedingungen (Jan, 2026-08-15, nicht verhandelbar) ────────────────
 *  1. 24 h laden, rendern, fertig — der erste Eindruck bleibt unverändert.
 *  2. Die 7 Tage **danach**, im Leerlauf, ausschließlich zur Klassifikation.
 *  3. Die Klassifikation läuft im **Worker** (Muster `gribGridWorker.ts`).
 *  4. Bis sie vorliegt, **behauptet kein Punkt etwas** — neutral, dann verfeinern.
 *
 * Dieses Modul liefert (3) und den Rückfall: ist kein Worker verfügbar oder
 * stürzt er, rechnet der Hauptthread mit `yieldToBrowser()` zwischen den
 * Schritten — exakt das Verhalten vor V-222. Ergebnis ist in beiden Pfaden
 * dasselbe (dieselben reinen Funktionen).
 *
 * Kosten der 7-Tage-Nachladung: 42 Transaktionen je Cachefenster hinter dem
 * Edge-Cache — geteilt, skaliert **nicht** mit der Nutzerzahl (§W.2.1).
 */

import { buildFireEvents, staticDetectionKeys, type FireEvent } from './fireEvents';
import { buildFireZones, type FireZone } from './fireZones';
import { buildFireClusters, CLUSTER_RADIUS_M, type FireCluster } from './fireClusters';
import { yieldToBrowser, type FirmsRow } from './sources/firmsHotspots';

export interface Classification {
  events: FireEvent[];
  staticKeys: Set<string>;
  /** Wo gerechnet wurde — für Diagnose und Steckbrief. */
  where: 'worker' | 'main';
}

/** BC1: Raster und Cluster kommen aus EINEM Aufruf — s. `computeZonesAndClusters`. */
export interface ZonesAndClusters {
  zones: FireZone[];
  clusters: FireCluster[];
}

interface WorkerReply {
  id: number; ok: boolean; error?: string;
  events?: FireEvent[]; staticKeys?: string[]; zones?: FireZone[]; clusters?: FireCluster[];
}

let worker: Worker | null = null;
let workerUsable = typeof Worker !== 'undefined';
let nextId = 1;
const pending = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (!workerUsable) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./fireEventsWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const d = e.data;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok) p.resolve(d);
      else p.reject(new Error(d.error || 'fire events worker error'));
    };
    worker.onerror = () => {
      workerUsable = false;
      for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('fire events worker crashed')); }
      worker = null;
    };
    return worker;
  } catch {
    workerUsable = false;
    return null;
  }
}

async function classifyOnMain(rows: readonly FirmsRow[], nowMs: number): Promise<Classification> {
  const events = buildFireEvents(rows, nowMs);
  await yieldToBrowser();
  const staticKeys = staticDetectionKeys(events, rows);
  return { events, staticKeys, where: 'main' };
}

/** Eine Anfrage an den Worker; wirft, wenn er fehlt oder scheitert. */
function ask(w: Worker, msg: {
  rows: readonly FirmsRow[]; nowMs: number; kind?: 'zones' | 'clusters';
  radiusM?: number; staticKeys?: string[];
}, signal?: AbortSignal): Promise<WorkerReply> {
  const id = nextId++;
  return new Promise<WorkerReply>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    signal?.addEventListener('abort', () => { pending.delete(id); reject(new Error('aborted')); }, { once: true });
    // Zeilen sind einfache Objekte → structured clone; ~6 700 Zeilen ≈ 1 MB, einmal.
    w.postMessage({ id, ...msg });
  });
}

/** Ereignisse + Ortsfest-Schlüssel — im Worker, sonst im Hauptthread. */
export async function classifyHotspots(rows: readonly FirmsRow[], nowMs: number, signal?: AbortSignal): Promise<Classification> {
  if (rows.length === 0) return { events: [], staticKeys: new Set(), where: 'main' };
  const w = getWorker();
  if (!w) return classifyOnMain(rows, nowMs);
  try {
    const d = await ask(w, { rows, nowMs }, signal);
    if (!d.events || !d.staticKeys) throw new Error('fire events worker: unvollständige Antwort');
    return { events: d.events, staticKeys: new Set(d.staticKeys), where: 'worker' };
  } catch (err) {
    if (signal?.aborted) throw err;
    return classifyOnMain(rows, nowMs);
  }
}

/**
 * BA3 — das Detektionsraster, ebenfalls off-main. Am 24-h-Lauf gemessen kostet
 * `buildFireZones` 167 ms (2 987 Detektionen); im Hauptthread wäre das auf einem
 * Mobilgerät ein Long Task über der 200-ms-Grenze. Fällt der Worker aus, rechnet
 * der Hauptthread — dieselbe reine Funktion, dasselbe Ergebnis.
 *
 * BC1 — die **Brand-Cluster** kommen aus demselben Aufruf: gleiche Eingabe,
 * gleicher Lebenszyklus (beide werden beim Fensterwechsel geleert), und damit
 * genau EINE Strukturkopie der ~1 MB Zeilen über die Worker-Grenze statt zwei.
 */
export async function computeZonesAndClusters(
  rows: readonly FirmsRow[], radiusM: number = CLUSTER_RADIUS_M, signal?: AbortSignal,
): Promise<ZonesAndClusters> {
  if (rows.length === 0) return { zones: [], clusters: [] };
  const onMain = (): ZonesAndClusters =>
    ({ zones: buildFireZones(rows), clusters: buildFireClusters(rows, radiusM) });
  const w = getWorker();
  if (!w) return onMain();
  try {
    const d = await ask(w, { rows, nowMs: 0, kind: 'zones', radiusM }, signal);
    if (!d.zones || !d.clusters) throw new Error('fire zones worker: unvollständige Antwort');
    return { zones: d.zones, clusters: d.clusters };
  } catch (err) {
    if (signal?.aborted) throw err;
    return onMain();
  }
}

/**
 * BC1 — die Cluster-Liste **mit** der Ortsfest-Einordnung.
 *
 * Läuft ein zweites Mal über dieselben Zeilen, sobald die Klassifikation
 * vorliegt (V-222: erst zeigen, dann einordnen). Vorher trägt keine Zeile einen
 * Vorbehalt; nachher trägt sie genau den, den die Karte als Grau zeigt.
 */
export async function computeFireClusters(
  rows: readonly FirmsRow[], staticKeys: ReadonlySet<string>,
  radiusM: number = CLUSTER_RADIUS_M, signal?: AbortSignal,
): Promise<FireCluster[]> {
  if (rows.length === 0) return [];
  const w = getWorker();
  if (!w) return buildFireClusters(rows, radiusM, staticKeys);
  try {
    const d = await ask(w, { rows, nowMs: 0, kind: 'clusters', radiusM, staticKeys: [...staticKeys] }, signal);
    if (!d.clusters) throw new Error('fire clusters worker: unvollständige Antwort');
    return d.clusters;
  } catch (err) {
    if (signal?.aborted) throw err;
    return buildFireClusters(rows, radiusM, staticKeys);
  }
}

/** Nur für Tests: Worker vergessen (nächster Aufruf legt einen neuen an). */
export function resetFireEventsWorker(): void { worker?.terminate(); worker = null; pending.clear(); }
