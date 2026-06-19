/**
 * Validierung hochgeladener Streckendateien.
 *
 *  – Größe:        max. 25 MB, max. 100.000 Trackpunkte
 *  – Mindestlänge: ≥ 100 m und ≥ 2 Punkte
 *  – Plausibilität: aufeinanderfolgende Punkte ≤ 5 km auseinander
 *  – Region:       Bounding-Box innerhalb DACH + ~50 km Puffer
 *
 * Format-Erkennung über Magic Bytes und Schema-Prüfung passieren beim Parsen
 * (siehe routeFormats.ts / parseRoute.ts).
 */

import { DACH_VIEW } from '../countryProfiles';
import { haversine, type RoutePoint } from './routeModel';

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_TRACKPOINTS = 100_000;
export const MIN_POINTS = 2;
export const MIN_DISTANCE_M = 100;
export const MAX_GAP_M = 5000; // 5 km zwischen zwei Punkten → vermutlich kaputt

// Akzeptierte Region = DACH-Ausdehnung + ~50 km Puffer.
// 50 km ≈ 0,45° Breite; bei ~50° Breite ≈ 0,70° Länge — großzügig gerundet.
const LAT_BUFFER = 0.5;
const LON_BUFFER = 0.75;
export const REGION = {
  west: DACH_VIEW.bounds.lngMin - LON_BUFFER,
  east: DACH_VIEW.bounds.lngMax + LON_BUFFER,
  south: DACH_VIEW.bounds.latMin - LAT_BUFFER,
  north: DACH_VIEW.bounds.latMax + LAT_BUFFER,
};

export type Validation = { ok: true } | { ok: false; message: string };

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
}

/** Größenlimit — vor dem Einlesen prüfbar. */
export function validateFileSize(file: File): Validation {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: `Datei ist zu groß (${mb(file.size)} MB). Maximal 25 MB.` };
  }
  if (file.size === 0) {
    return { ok: false, message: 'Die Datei ist leer.' };
  }
  return { ok: true };
}

/** Gesamtzahl der Trackpunkte über alle Tracks. */
export function validatePointCount(total: number): Validation {
  if (total > MAX_TRACKPOINTS) {
    return {
      ok: false,
      message: `Zu viele Trackpunkte (${total.toLocaleString('de-DE')}). Maximal 100.000.`,
    };
  }
  return { ok: true };
}

/**
 * Plausibilität + Region einer (ausgewählten/zusammengefügten) Strecke.
 * Erwartet die bereits gewählte Punktliste.
 */
export function validateTrack(points: RoutePoint[]): Validation {
  if (points.length < MIN_POINTS) {
    return { ok: false, message: 'Die Strecke braucht mindestens zwei Punkte.' };
  }

  let dist = 0;
  let west = points[0].lon, east = points[0].lon;
  let south = points[0].lat, north = points[0].lat;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) ||
        Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      return { ok: false, message: 'Die Datei enthält ungültige Koordinaten.' };
    }
    if (i > 0) {
      const d = haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
      if (d > MAX_GAP_M) {
        return {
          ok: false,
          message: `Aufeinanderfolgende Punkte liegen ${(d / 1000).toFixed(1)} km auseinander — die Datei ist vermutlich fehlerhaft. Falls die Datei mehrere getrennte Tracks enthält, wähle einen einzelnen aus.`,
        };
      }
      dist += d;
    }
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }

  if (dist < MIN_DISTANCE_M) {
    return { ok: false, message: `Die Strecke ist zu kurz (${Math.round(dist)} m). Mindestens 100 m nötig.` };
  }

  if (west < REGION.west || east > REGION.east || south < REGION.south || north > REGION.north) {
    return {
      ok: false,
      message: 'Die Strecke liegt außerhalb der unterstützten Region (Deutschland, Österreich, Schweiz).',
    };
  }

  return { ok: true };
}
