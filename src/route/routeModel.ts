/**
 * Einheitliches Streckenmodell für „Wetter entlang der Route".
 *
 * Alle Formate (GPX/TCX/FIT/KML/KMZ) werden auf dieselbe Punktliste
 * abgebildet, damit Karte, Statistik und später die Wetter-Abfrage formatlos
 * darauf aufsetzen können.
 */

export interface RoutePoint {
  lat: number;
  lon: number;
  /** Höhe in Metern, falls vorhanden. */
  ele?: number;
  /** Zeitstempel als Epoch-Millisekunden, falls vorhanden. */
  time?: number;
}

/** Wegpunkt (z. B. GPX <wpt>) — Kandidat für eine Pausen-Empfehlung. */
export interface RouteWaypoint {
  lat: number;
  lon: number;
  name?: string;
}

export interface ParsedRoute {
  /** Streckenname aus der Datei, falls vorhanden. */
  name?: string;
  points: RoutePoint[];
  waypoints?: RouteWaypoint[];
}

/** Ein einzelner Track/Segment-Verbund innerhalb einer Datei. */
export interface RouteTrack {
  name?: string;
  points: RoutePoint[];
}

/** Roh-Ergebnis des Parsens: eine Datei kann mehrere Tracks enthalten. */
export interface ParsedFile {
  /** Dateiname/Metadaten-Name, falls vorhanden. */
  name?: string;
  tracks: RouteTrack[];
  waypoints?: RouteWaypoint[];
}

export interface RouteStats {
  pointCount: number;
  distanceKm: number;
  ascentM: number;
  descentM: number;
  minEleM: number | null;
  maxEleM: number | null;
  startTime: number | null;
  endTime: number | null;
  durationMs: number | null;
  /** [west, south, east, north] oder null bei leerer Strecke. */
  bounds: [number, number, number, number] | null;
}

const EARTH_R = 6371000; // m

/** Großkreis-Distanz zweier Punkte in Metern (Haversine). */
export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Kumulierte Distanz (in Metern) je Punkt — Index 0 ist 0. */
export function cumulativeDistances(points: RoutePoint[]): number[] {
  const out = new Array<number>(points.length);
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      acc += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    out[i] = acc;
  }
  return out;
}

// Höhenmeter erst ab dieser anhaltenden Differenz zählen — filtert GPS-Rauschen.
const ELE_THRESHOLD_M = 3;

export function computeRouteStats(route: ParsedRoute): RouteStats {
  const pts = route.points;
  const n = pts.length;
  if (n === 0) {
    return {
      pointCount: 0, distanceKm: 0, ascentM: 0, descentM: 0,
      minEleM: null, maxEleM: null, startTime: null, endTime: null,
      durationMs: null, bounds: null,
    };
  }

  let distance = 0;
  let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
  let minEle = Infinity, maxEle = -Infinity;
  let hasEle = false;

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i > 0) distance += haversine(pts[i - 1].lat, pts[i - 1].lon, p.lat, p.lon);
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.ele != null && Number.isFinite(p.ele)) {
      hasEle = true;
      if (p.ele < minEle) minEle = p.ele;
      if (p.ele > maxEle) maxEle = p.ele;
    }
  }

  // Auf-/Abstieg mit Schwellwert gegen Höhen-Rauschen.
  let ascent = 0, descent = 0;
  if (hasEle) {
    let ref: number | null = null;
    for (const p of pts) {
      if (p.ele == null || !Number.isFinite(p.ele)) continue;
      if (ref == null) { ref = p.ele; continue; }
      const diff = p.ele - ref;
      if (diff >= ELE_THRESHOLD_M) { ascent += diff; ref = p.ele; }
      else if (diff <= -ELE_THRESHOLD_M) { descent += -diff; ref = p.ele; }
    }
  }

  const times = pts.map((p) => p.time).filter((t): t is number => t != null && Number.isFinite(t));
  const startTime = times.length ? Math.min(...times) : null;
  const endTime = times.length ? Math.max(...times) : null;

  return {
    pointCount: n,
    distanceKm: distance / 1000,
    ascentM: Math.round(ascent),
    descentM: Math.round(descent),
    minEleM: hasEle ? Math.round(minEle) : null,
    maxEleM: hasEle ? Math.round(maxEle) : null,
    startTime,
    endTime,
    durationMs: startTime != null && endTime != null ? endTime - startTime : null,
    bounds: [west, south, east, north],
  };
}
