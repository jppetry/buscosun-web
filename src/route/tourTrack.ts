/**
 * Routen-Aufbereitung: rohe {@link ParsedRoute} → internes {@link TourTrack}.
 *
 * Pipeline:
 *   1. Normalisierung   – Stationär-/Spike-Glitches raus, kumulierte Distanz
 *   2. Höhen-Anreicherung – fehlende/kaputte Höhen aus DEM (Terrarium) ergänzen,
 *      UND: mitgebrachte Höhen gegen das Gelände gegenprüfen (R3D-4/G2)
 *   3. Glättung          – 5-Punkt-Median, topographie-abhängig zusätzlich
 *   4. Punkt-Reduktion   – RDP + Schlüsselpunkte + max. Sample-Abstand
 *
 * Original-Timestamps bleiben erhalten (separat), beeinflussen aber das spätere
 * Timing nicht — das wird im Wetter-Schritt neu berechnet.
 */

import { haversine, type ParsedRoute } from './routeModel';
import { projectMeters, rdpIndices } from './rdp';
import { compareToDem, demCheckEnabled, sampleElevations } from './enrichElevation';
import type { RouteFormatId } from './routeFormats';

export interface TourPoint {
  lat: number;
  lon: number;
  /** Höhe in m ü. M. (ggf. aus DEM ergänzt). NaN, wenn nicht verfügbar. */
  ele: number;
  /** Kumulierte Distanz vom Start in Metern. */
  dist: number;
  /** Original-Zeitstempel (Epoch-ms), falls vorhanden — nur informativ. */
  time?: number;
}

export type Terrain = 'flach' | 'hügelig' | 'alpin';

export interface TourMeta {
  name?: string;
  sourceFormat: RouteFormatId;
  totalDistanceM: number;
  ascentM: number;
  descentM: number;
  minEleM: number | null;
  maxEleM: number | null;
  /** Punkte des vollen (aufbereiteten) Tracks für die UI. */
  pointCount: number;
  /** Strategische Punkte fürs Wetter-Sampling. */
  sampleCount: number;
  elevationEnriched: boolean;
  elevationAvailable: boolean;
  /**
   * Woher die Höhen stammen. `file` = wie geliefert (und, wenn geprüft, vom
   * Gelände bestätigt); `dem-filled` = die Datei hatte keine brauchbaren;
   * `dem-replaced` = sie hatte welche, aber sie beschreiben dieses Gelände
   * nicht (`audit/route-3d.md` §19.2).
   */
  elevationSource: 'file' | 'dem-filled' | 'dem-replaced';
  /**
   * Median-Betrag der Abweichung der Datei-Höhen zum Geländemodell (m).
   * `null` heißt **nicht geprüft** — nicht „stimmt".
   */
  elevationDeltaM: number | null;
  hasTime: boolean;
  startTime: number | null;
  endTime: number | null;
  terrain: Terrain;
}

/** Wegpunkt auf die Strecke projiziert (kumulierte Distanz). */
export interface TourWaypoint {
  dist: number;
  lat: number;
  lon: number;
  name?: string;
}

export interface TourTrack {
  /** Voller, aufbereiteter Track (für Kartendarstellung & Höhenprofil). */
  points: TourPoint[];
  /** Reduzierte, strategische Punkte (für Wetter-Berechnung). */
  samples: TourPoint[];
  /** Wegpunkte aus der Datei, auf die Strecke projiziert (Pausen-Vorschläge). */
  waypoints: TourWaypoint[];
  meta: TourMeta;
}

const MIN_STEP_M = 0.5;      // Punkte näher als das gelten als stationär
const SPIKE_DETOUR = 3;      // (d_in+d_out)/d_skip-Schwelle für GPS-Springer
const SPIKE_MIN_M = 25;      // Mindest-Sprungweite, ab der gefiltert wird
const ELE_THRESHOLD_M = 3;   // Höhenmeter-Schwelle gegen Rauschen
const ELE_PROMINENCE_M = 20; // Mindest-Prominenz für Gipfel/Sattel
/**
 * Ab dieser MEDIAN-Abweichung zum Geländemodell beschreiben die Höhen der Datei
 * nicht dieses Gelände und werden ersetzt. GPS-/Barometerfehler und die
 * DEM-Streuung im Steilgelände liegen zusammen bei ~10–30 m; 50 m ist
 * bewusst darüber, damit eine ordentliche Aufzeichnung nie angefasst wird.
 */
const ELE_TRUST_M = 50;
/**
 * Fristen der Gegenprobe. Sie läuft im Upload-Pfad, also **vor** dem ersten
 * Bild — ohne Frist würde ein hängendes DEM die Vorschau blockieren. Läuft sie
 * ab, bleibt `elevationDeltaM` auf `null`: „nicht geprüft" ist eine gültige
 * Auskunft, Warten ist keine. (Muster `withDeadline` aus dem Repack-Transport:
 * erster Abruf kurz, Folgeabruf länger, weil die Kacheln dann schon liegen.)
 */
const DEM_CHECK_MS = 4_000;
const DEM_REPLACE_MS = 8_000;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
const MAX_SAMPLES = 300;

const ASCENT_FLAT = 8;       // m/km — darunter „flach"
const ASCENT_ALPINE = 25;    // m/km — darüber „alpin"

export async function buildTourTrack(
  route: ParsedRoute,
  sourceFormat: RouteFormatId,
  signal?: AbortSignal,
): Promise<TourTrack> {
  // 1) Normalisierung: Glitches raus.
  const clean = removeSpikes(dedupeStationary(route.points));
  const lat = clean.map((p) => p.lat);
  const lon = clean.map((p) => p.lon);
  const time = clean.map((p) => p.time);
  let ele: number[] = clean.map((p) => (p.ele != null && Number.isFinite(p.ele) ? p.ele : NaN));

  // Kumulierte Distanz.
  const dist = cumulative(clean);
  const totalDistanceM = dist[dist.length - 1] ?? 0;

  // 2) Höhen-Anreicherung, falls keine brauchbaren Höhen vorhanden.
  let elevationEnriched = false;
  let elevationAvailable = elevationUsable(ele, totalDistanceM);
  let elevationSource: TourMeta['elevationSource'] = 'file';
  let elevationDeltaM: number | null = null;
  if (!elevationAvailable) {
    const dem = await sampleElevations(clean, signal).catch(() => null);
    if (dem && dem.some((e) => Number.isFinite(e))) {
      ele = dem.map((e) => (Number.isFinite(e) ? e : NaN));
      elevationEnriched = true;
      elevationAvailable = true;
      elevationSource = 'dem-filled';
    }
  } else if (demCheckEnabled()) {
    // Gegenprobe: `elevationUsable` prüft Lücken, Nullen und „unplausibel
    // flach" — nie das Gelände. Eine Datei mit erfundenen oder um 100 m
    // versetzten Höhen ging bisher unbemerkt durch und verschob damit nicht nur
    // das Bild, sondern über `correctForElevation` auch Temperatur und Wind.
    const probe = clean.map((p, i) => ({ lat: p.lat, lon: p.lon, ele: ele[i] }));
    const cmp = await withDeadline(compareToDem(probe, 120, signal), DEM_CHECK_MS);
    if (cmp) {
      elevationDeltaM = Math.round(cmp.medianAbsM * 10) / 10;
      if (cmp.medianAbsM > ELE_TRUST_M) {
        const dem = await withDeadline(sampleElevations(clean, signal), DEM_REPLACE_MS);
        if (dem && dem.some((e) => Number.isFinite(e))) {
          ele = dem.map((e) => (Number.isFinite(e) ? e : NaN));
          elevationEnriched = true;
          elevationSource = 'dem-replaced';
        }
      }
    }
  }

  // 3) Glättung: 5-Punkt-Median; bei flachem Gelände zusätzlich mitteln.
  if (elevationAvailable) {
    ele = median5(ele);
  }
  const terrainPre = classifyTerrain(ascentFrom(ele, totalDistanceM), totalDistanceM);
  if (elevationAvailable && terrainPre === 'flach') {
    ele = movingAverage3(ele); // Stadt/Flachland stärker glätten
  }

  // Punkte zusammensetzen.
  const points: TourPoint[] = clean.map((_, i) => {
    const pt: TourPoint = { lat: lat[i], lon: lon[i], ele: ele[i], dist: dist[i] };
    if (time[i] != null) pt.time = time[i];
    return pt;
  });

  // Kennzahlen.
  const { ascentM, descentM } = ascentDescent(ele);
  const { minEleM, maxEleM } = eleRange(ele);
  const terrain = classifyTerrain(totalDistanceM > 0 ? ascentM / (totalDistanceM / 1000) : 0, totalDistanceM);

  // 4) Punkt-Reduktion.
  const samples = selectSamples(points, terrain, elevationAvailable);

  // Wegpunkte auf die Strecke projizieren (nächster Track-Punkt).
  const waypoints: TourWaypoint[] = (route.waypoints ?? []).map((w) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = haversine(points[i].lat, points[i].lon, w.lat, w.lon);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { dist: points[best].dist, lat: points[best].lat, lon: points[best].lon, name: w.name };
  });

  const times = time.filter((t): t is number => t != null && Number.isFinite(t));
  const startTime = times.length ? Math.min(...times) : null;
  const endTime = times.length ? Math.max(...times) : null;

  return {
    points,
    samples,
    waypoints,
    meta: {
      name: route.name,
      sourceFormat,
      totalDistanceM,
      ascentM,
      descentM,
      minEleM,
      maxEleM,
      pointCount: points.length,
      sampleCount: samples.length,
      elevationEnriched,
      elevationAvailable,
      elevationSource,
      elevationDeltaM,
      hasTime: times.length > 0,
      startTime,
      endTime,
      terrain,
    },
  };
}

// ---------------------------------------------------------------------------
// Normalisierung / Glättung
// ---------------------------------------------------------------------------
function dedupeStationary(pts: ParsedRoute['points']): ParsedRoute['points'] {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    if (haversine(prev.lat, prev.lon, pts[i].lat, pts[i].lon) >= MIN_STEP_M) out.push(pts[i]);
  }
  return out;
}

function removeSpikes(pts: ParsedRoute['points']): ParsedRoute['points'] {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const dIn = haversine(a.lat, a.lon, b.lat, b.lon);
    const dOut = haversine(b.lat, b.lon, c.lat, c.lon);
    const dSkip = haversine(a.lat, a.lon, c.lat, c.lon);
    // Springt der Track zu b raus und sofort wieder zurück → b verwerfen.
    if (dSkip > 0 && dIn > SPIKE_MIN_M && (dIn + dOut) / dSkip > SPIKE_DETOUR) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function cumulative(pts: ParsedRoute['points']): number[] {
  const out = new Array<number>(pts.length);
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) acc += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    out[i] = acc;
  }
  return out;
}

function median5(values: number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const win: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) {
      if (Number.isFinite(values[k])) win.push(values[k]);
    }
    if (win.length === 0) { out[i] = values[i]; continue; }
    win.sort((a, b) => a - b);
    out[i] = win[Math.floor(win.length / 2)];
  }
  return out;
}

function movingAverage3(values: number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) {
      if (Number.isFinite(values[k])) { sum += values[k]; cnt++; }
    }
    out[i] = cnt ? sum / cnt : values[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Höhen-Kennzahlen
// ---------------------------------------------------------------------------
function elevationUsable(ele: number[], totalDist: number): boolean {
  const finite = ele.filter((e) => Number.isFinite(e));
  if (finite.length < ele.length * 0.5) return false;          // zu viele Lücken
  if (finite.every((e) => Math.abs(e) < 0.5)) return false;    // alles ~0 → fehlend
  let min = Infinity, max = -Infinity;
  for (const e of finite) { if (e < min) min = e; if (e > max) max = e; }
  if (max - min < 1 && totalDist > 2000) return false;         // unplausibel flach
  return true;
}

function ascentDescent(ele: number[]): { ascentM: number; descentM: number } {
  let ascent = 0, descent = 0;
  let ref: number | null = null;
  for (const e of ele) {
    if (!Number.isFinite(e)) continue;
    if (ref == null) { ref = e; continue; }
    const diff = e - ref;
    if (diff >= ELE_THRESHOLD_M) { ascent += diff; ref = e; }
    else if (diff <= -ELE_THRESHOLD_M) { descent += -diff; ref = e; }
  }
  return { ascentM: Math.round(ascent), descentM: Math.round(descent) };
}

function ascentFrom(ele: number[], totalDist: number): number {
  if (totalDist <= 0) return 0;
  return ascentDescent(ele).ascentM / (totalDist / 1000);
}

function eleRange(ele: number[]): { minEleM: number | null; maxEleM: number | null } {
  let min = Infinity, max = -Infinity, has = false;
  for (const e of ele) {
    if (!Number.isFinite(e)) continue;
    has = true;
    if (e < min) min = e;
    if (e > max) max = e;
  }
  return has ? { minEleM: Math.round(min), maxEleM: Math.round(max) } : { minEleM: null, maxEleM: null };
}

function classifyTerrain(ascentPerKm: number, totalDist: number): Terrain {
  if (totalDist <= 0) return 'flach';
  if (ascentPerKm > ASCENT_ALPINE) return 'alpin';
  if (ascentPerKm > ASCENT_FLAT) return 'hügelig';
  return 'flach';
}

// ---------------------------------------------------------------------------
// Punkt-Reduktion (RDP + Schlüsselpunkte + max. Abstand)
// ---------------------------------------------------------------------------
function selectSamples(points: TourPoint[], terrain: Terrain, hasEle: boolean): TourPoint[] {
  const n = points.length;
  if (n <= 2) return points.slice();
  const total = points[n - 1].dist;

  // RDP-Geometrie mit dynamischem Epsilon (≤ ~220 Punkte, Reserve für Rest).
  const xy = projectMeters(points);
  let epsilon = terrain === 'alpin' ? 12 : terrain === 'hügelig' ? 22 : 38;
  let rdp = rdpIndices(xy, epsilon);
  while (rdp.length > 220 && epsilon < 4000) { epsilon *= 1.5; rdp = rdpIndices(xy, epsilon); }

  const keep = new Set<number>(rdp);
  keep.add(0);
  keep.add(n - 1);
  if (hasEle) for (const i of elevationExtrema(points)) keep.add(i);

  // Max. Sample-Abstand: alpin 500 m, hügelig 1 km, flach 2 km — mind. so grob,
  // dass die Gesamtzahl ~MAX_SAMPLES nicht sprengt.
  const terrainGap = terrain === 'alpin' ? 500 : terrain === 'hügelig' ? 1000 : 2000;
  const maxGap = Math.max(terrainGap, total / MAX_SAMPLES);
  enforceMaxGap(points, keep, maxGap);

  let idxs = [...keep].sort((a, b) => a - b);
  if (idxs.length > MAX_SAMPLES) idxs = capEven(idxs, MAX_SAMPLES, n);
  return idxs.map((i) => points[i]);
}

function elevationExtrema(points: TourPoint[]): number[] {
  const n = points.length;
  const win = Math.max(2, Math.round(n / 80));
  const out: number[] = [];
  let lastAdded = -win;
  for (let i = 1; i < n - 1; i++) {
    const e = points[i].ele;
    if (!Number.isFinite(e)) continue;
    let lo = e, hi = e, isMax = true, isMin = true;
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) {
      const ek = points[k].ele;
      if (!Number.isFinite(ek)) continue;
      if (ek > e) isMax = false;
      if (ek < e) isMin = false;
      if (ek < lo) lo = ek;
      if (ek > hi) hi = ek;
    }
    const prominent = (isMax && e - lo >= ELE_PROMINENCE_M) || (isMin && hi - e >= ELE_PROMINENCE_M);
    if (prominent && i - lastAdded >= win) { out.push(i); lastAdded = i; }
  }
  return out;
}

/** Fügt zwischen zu weit auseinanderliegenden Sample-Punkten Stützpunkte ein. */
function enforceMaxGap(points: TourPoint[], keep: Set<number>, maxGap: number): void {
  const idxs = [...keep].sort((a, b) => a - b);
  for (let s = 0; s < idxs.length - 1; s++) {
    const a = idxs[s];
    const b = idxs[s + 1];
    const gap = points[b].dist - points[a].dist;
    if (gap <= maxGap) continue;
    const inserts = Math.floor(gap / maxGap);
    for (let k = 1; k <= inserts; k++) {
      const targetDist = points[a].dist + (k * gap) / (inserts + 1);
      keep.add(nearestByDist(points, a, b, targetDist));
    }
  }
}

function nearestByDist(points: TourPoint[], lo: number, hi: number, target: number): number {
  let best = lo, bestDiff = Infinity;
  for (let i = lo + 1; i < hi; i++) {
    const diff = Math.abs(points[i].dist - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

/** Dünnt eine sortierte Indexliste gleichmäßig auf `target` aus (Enden bleiben). */
function capEven(idxs: number[], target: number, n: number): number[] {
  const step = idxs.length / target;
  const out = new Set<number>([0, n - 1]);
  for (let k = 0; k < target; k++) out.add(idxs[Math.floor(k * step)]);
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Richtung
// ---------------------------------------------------------------------------
/** Rundtour, wenn Start und Ziel nah beieinander liegen (≤ 250 m) und die
 *  Strecke lang genug ist (> 1,5 km). Dann ist die Richtung egal. */
export function isLoop(track: TourTrack): boolean {
  const p = track.points;
  if (p.length < 2) return false;
  const total = track.meta.totalDistanceM;
  if (total < 1500) return false;
  return haversine(p[0].lat, p[0].lon, p[p.length - 1].lat, p[p.length - 1].lon) <= 250;
}

/** Dreht die Strecke um (Ziel → Start). Distanz wird neu von 0 gezählt,
 *  Auf-/Abstieg getauscht; Original-Zeiten verlieren ihre Bedeutung und
 *  entfallen. */
export function reverseTourTrack(track: TourTrack): TourTrack {
  const total = track.meta.totalDistanceM;
  const flip = <T extends { dist: number; time?: number }>(arr: T[]): T[] =>
    arr.slice().reverse().map((p) => {
      const { time: _drop, ...rest } = p;
      return { ...rest, dist: total - p.dist } as T;
    });

  return {
    points: flip(track.points),
    samples: flip(track.samples),
    waypoints: track.waypoints.slice().reverse().map((w) => ({ ...w, dist: total - w.dist })),
    meta: {
      ...track.meta,
      ascentM: track.meta.descentM,
      descentM: track.meta.ascentM,
      hasTime: false,
      startTime: null,
      endTime: null,
    },
  };
}
