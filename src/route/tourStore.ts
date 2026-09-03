/**
 * Die geplante Tour über den Reload retten (V-R3D-1, `audit/route-3d.md` §15.4).
 *
 * `src/route/` hatte bis hierher KEINE Persistenz: ein Reload, ein geteilter
 * Link oder ein Viewport-Wechsel warf die hochgeladene Strecke weg — und
 * `/tourenplanung/3d` landete auf der Upload-Seite. Der Pfad kann das nicht
 * tragen (B3): eine GPX passt in keine URL.
 *
 * Deshalb IndexedDB, spaltenweise: 100 000 Punkte (`MAX_TRACKPOINTS`) sind als
 * vier `Float64Array` rund 3,2 MB binär, als JSON aber ~6,5 MB — mehr, als
 * `localStorage` je Origin fasst. Die Samples sind Referenzen auf Elemente von
 * `points` (`selectSamples` gibt `idxs.map(i => points[i])` zurück); gespeichert
 * werden ihre **Indizes**, nicht Kopien — das spart Platz und stellt beim
 * Entpacken dieselbe Identität wieder her.
 *
 * Drei Auflagen aus der Diagnose:
 *  1. Das **Wetter** wird nie gespeichert — es wäre nach Minuten falsch und
 *     wird nach dem Wiederherstellen sichtbar neu geholt.
 *  2. Eine GPX ist ein Bewegungsprofil: die wiederhergestellte Tour sagt, dass
 *     sie aus dem Gerätespeicher kommt, und trägt „verwerfen".
 *     Kill-Switch `?tour=0` bzw. `localStorage.tour = '0'`.
 *  3. Die Startzeit wird nicht erfunden: liegt sie außerhalb dessen, was die
 *     App selbst für gültig hält (`horizonState`), rückt sie auf „jetzt" — und
 *     die Notiz sagt es. Keine zweite Zeitregel neben der bestehenden.
 *
 * Die Pack-/Entpack-Funktionen sind rein und DOM-frei (headless prüfbar); nur
 * die drei IndexedDB-Funktionen am Ende fassen den Browser an.
 */

import { horizonState } from './startTime';
import type { TourPoint, TourTrack, TourWaypoint, TourMeta } from './tourTrack';
import type { MovementId } from './movementTypes';
import type { SpeedProfile } from './speedModel';
import type { BreakConfig } from './breaks';
import type { EbikeConfig } from './ebikeBattery';

/** Schema-Version des Eintrags — bei Änderung wird der alte Eintrag verworfen. */
export const TOUR_STORE_VERSION = 1;
/** Älter als das, und der Eintrag gilt als abgelaufen. */
export const TOUR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Entprellung des Schreibens — Regler erzeugen sonst Dutzende Transaktionen. */
export const TOUR_SAVE_DEBOUNCE_MS = 600;

const TOUR_DB = 'bsc-route';
const TOUR_STORE = 'tour';
const TOUR_KEY = 'last';

/** Alles, was der Nutzer eingestellt hat — ohne eine Zeile Wetter. */
export interface StoredPlan {
  direction: 'forward' | 'reverse';
  typeId: MovementId | null;
  profile: SpeedProfile | null;
  breakCfg: BreakConfig | null;
  startMs: number;
  ebikeCfg: EbikeConfig;
  /** War „Wetter berechnen" schon gedrückt? Dann steht der Reload im Ergebnis. */
  weatherRequested: boolean;
}

/** Spaltenweise Ablage (Structured Clone) — s. Kopfkommentar. */
export interface PackedTour {
  v: number;
  savedMs: number;
  fileLabel?: string;
  lat: Float64Array;
  lon: Float64Array;
  ele: Float64Array;
  dist: Float64Array;
  /** Original-Zeitstempel; `null`, wenn kein einziger Punkt einen trägt. NaN = keiner. */
  time: Float64Array | null;
  /** Indizes der Wetter-Samples in den Spalten. */
  sampleIdx: Uint32Array;
  waypoints: TourWaypoint[];
  meta: TourMeta;
  plan: StoredPlan;
}

/** Track + Plan in die Spaltenform bringen. Rein. */
export function packTour(
  track: TourTrack,
  plan: StoredPlan,
  opts: { fileLabel?: string; savedMs?: number } = {},
): PackedTour {
  const n = track.points.length;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const ele = new Float64Array(n);
  const dist = new Float64Array(n);
  const time = new Float64Array(n);
  let hasTime = false;
  const index = new Map<TourPoint, number>();
  for (let i = 0; i < n; i++) {
    const p = track.points[i];
    lat[i] = p.lat;
    lon[i] = p.lon;
    ele[i] = p.ele;
    dist[i] = p.dist;
    time[i] = p.time == null ? NaN : p.time;
    if (p.time != null) hasTime = true;
    if (!index.has(p)) index.set(p, i);
  }
  // Samples sind Referenzen auf `points` — der Rückfall über die Distanz greift
  // nur, falls das je entkoppelt wird (dann ist der Index die beste Näherung).
  const sampleIdx = new Uint32Array(track.samples.length);
  for (let k = 0; k < track.samples.length; k++) {
    const s = track.samples[k];
    const hit = index.get(s);
    sampleIdx[k] = hit ?? nearestByDist(dist, s.dist);
  }
  return {
    v: TOUR_STORE_VERSION,
    savedMs: opts.savedMs ?? Date.now(),
    ...(opts.fileLabel ? { fileLabel: opts.fileLabel } : {}),
    lat, lon, ele, dist,
    time: hasTime ? time : null,
    sampleIdx,
    waypoints: track.waypoints.map((w) => ({ ...w })),
    meta: { ...track.meta },
    plan: { ...plan },
  };
}

/**
 * Zurück in `TourTrack` + Plan. `null`, wenn der Eintrag nicht passt — ein
 * kaputter oder älterer Datensatz darf die App nie zum Absturz bringen, er
 * wird verworfen wie „kein Eintrag".
 */
export function unpackTour(p: PackedTour | null | undefined): {
  track: TourTrack;
  plan: StoredPlan;
  fileLabel?: string;
  savedMs: number;
} | null {
  if (!p || p.v !== TOUR_STORE_VERSION) return null;
  const lat = asF64(p.lat), lon = asF64(p.lon), ele = asF64(p.ele), dist = asF64(p.dist);
  if (!lat || !lon || !ele || !dist) return null;
  const n = lat.length;
  if (n < 2 || lon.length !== n || ele.length !== n || dist.length !== n) return null;
  if (!p.meta || !p.plan || !Array.isArray(p.waypoints)) return null;
  const time = p.time == null ? null : asF64(p.time);
  if (p.time != null && (!time || time.length !== n)) return null;

  const points: TourPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const pt: TourPoint = { lat: lat[i], lon: lon[i], ele: ele[i], dist: dist[i] };
    const t = time ? time[i] : NaN;
    if (Number.isFinite(t)) pt.time = t;
    points[i] = pt;
  }
  const idx = p.sampleIdx instanceof Uint32Array ? p.sampleIdx : Uint32Array.from(p.sampleIdx ?? []);
  const samples: TourPoint[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (i < n) samples.push(points[i]);
  }
  if (samples.length < 2) return null;

  return {
    track: {
      points,
      samples,
      waypoints: p.waypoints.map((w) => ({ ...w })) as TourWaypoint[],
      meta: { ...p.meta } as TourMeta,
    },
    plan: { ...p.plan },
    ...(p.fileLabel ? { fileLabel: p.fileLabel } : {}),
    savedMs: p.savedMs,
  };
}

/** Ist der Eintrag jung genug, um noch angeboten zu werden? */
export function isFreshEntry(savedMs: number, now = Date.now()): boolean {
  return Number.isFinite(savedMs) && savedMs <= now + 60_000 && now - savedMs <= TOUR_MAX_AGE_MS;
}

/**
 * Startzeit nach dem Wiederherstellen. Maßstab ist die Regel, die die App
 * ohnehin benutzt (`horizonState`) — nicht eine zweite, eigene.
 */
export function restoreStartMs(storedMs: number, now = Date.now()): { startMs: number; moved: boolean } {
  if (Number.isFinite(storedMs) && horizonState(storedMs, now) === 'ok') {
    return { startMs: storedMs, moved: false };
  }
  return { startMs: now, moved: true };
}

/**
 * Kill-Switch (Muster `?afEst=0`): `?tour=0` in der URL schlägt den Speicher,
 * `localStorage.tour = '0'` wirkt dauerhaft. Ohne Browser: aus.
 */
export function tourStoreEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('tour');
    if (q === '0') return false;
    if (q === '1') return true;
    return window.localStorage?.getItem('tour') !== '0';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB-Schale — ab hier fasst das Modul den Browser an.
// ---------------------------------------------------------------------------

function openTourDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(TOUR_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(TOUR_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Eintrag ablegen (best effort — voller Speicher/privater Modus sind kein Fehler). */
export async function saveTour(packed: PackedTour): Promise<void> {
  try {
    const db = await openTourDb();
    if (!db) return;
    const tx = db.transaction(TOUR_STORE, 'readwrite');
    tx.objectStore(TOUR_STORE).put(packed, TOUR_KEY);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    /* ignorieren */
  }
}

/** Eintrag lesen. `null`, wenn keiner da, er zu alt oder nicht lesbar ist. */
export async function loadTour(now = Date.now()): Promise<PackedTour | null> {
  try {
    const db = await openTourDb();
    if (!db) return null;
    const rec = await new Promise<PackedTour | null>((resolve) => {
      const tx = db.transaction(TOUR_STORE, 'readonly');
      const req = tx.objectStore(TOUR_STORE).get(TOUR_KEY);
      req.onsuccess = () => resolve((req.result as PackedTour) ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
    if (!rec || !isFreshEntry(rec.savedMs, now)) return null;
    return rec;
  } catch {
    return null;
  }
}

/** Eintrag löschen — „verwerfen" im UI und „Andere Strecke". */
export async function clearTour(): Promise<void> {
  try {
    const db = await openTourDb();
    if (!db) return;
    const tx = db.transaction(TOUR_STORE, 'readwrite');
    tx.objectStore(TOUR_STORE).delete(TOUR_KEY);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    /* ignorieren */
  }
}

// ---------------------------------------------------------------------------

function asF64(v: unknown): Float64Array | null {
  if (v instanceof Float64Array) return v;
  if (Array.isArray(v)) return Float64Array.from(v as number[]);
  return null;
}

/** Nächster Punkt nach kumulierter Distanz (nur Rückfall, s. `packTour`). */
function nearestByDist(dist: Float64Array, target: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < dist.length; i++) {
    const d = Math.abs(dist[i] - target);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
