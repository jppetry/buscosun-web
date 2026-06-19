/**
 * PLANB-US5 — Ausweichort-Vorschlag.
 *
 * Wenn der Wunschort am Bezugstag ungünstig ist, sucht diese Logik in der Nähe
 * einen besser bewerteten Ort. Sie legt Kandidaten-Punkte rund um den Wunschort
 * (Himmelsrichtungen in einem Radius), holt für jeden den bestehenden
 * Punktforecast (KEINE neue Quelle), bewertet den Bezugstag mit demselben
 * Anlass-Profil und kürt — falls deutlich besser — einen Alternativort.
 *
 * Bewusst als gezielte Aktion gedacht (Button), nicht automatisch: pro Aufruf
 * fallen einige wenige Reverse-Geocode-/Forecast-Anfragen an.
 */

import type { Location } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { reverseGeocode } from '../geocode';
import { recommendBestDay, hoursNeededFor } from './eventScoring';
import { phasesLatestHour, type EventQuery } from './eventModel';

export interface AltLocationCandidate {
  location: Location;
  score: number;
  /** Punktedifferenz zum Wunschort (positiv = besser). */
  scoreDelta: number;
  distanceKm: number;
  /** Himmelsrichtung relativ zum Wunschort. */
  bearing: string;
}

/** Standard-Suchradius in km. */
export const ALT_RADIUS_KM = 22;
/** Mindestvorsprung, ab dem ein Alternativort vorgeschlagen wird. */
export const ALT_MIN_GAIN = 6;

const EARTH_R = 6371;
const BEARINGS: Array<{ deg: number; label: string }> = [
  { deg: 0, label: 'nördlich' },
  { deg: 45, label: 'nordöstlich' },
  { deg: 90, label: 'östlich' },
  { deg: 135, label: 'südöstlich' },
  { deg: 180, label: 'südlich' },
  { deg: 225, label: 'südwestlich' },
  { deg: 270, label: 'westlich' },
  { deg: 315, label: 'nordwestlich' },
];

/** Punkt in `distKm` Entfernung unter `bearingDeg` vom Ausgangspunkt (Großkreis). */
function offsetPoint(lat: number, lon: number, bearingDeg: number, distKm: number): { lat: number; lon: number } {
  const d = distKm / EARTH_R;
  const t = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lon: (((l2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Bewertet einen einzelnen Kandidaten-Punkt für den Bezugstag. */
async function scoreCandidate(
  query: EventQuery,
  point: { lat: number; lon: number },
  fallbackName: string,
  targetDate: string,
  signal?: AbortSignal,
): Promise<{ location: Location; score: number } | null> {
  // Echten Namen + Land bestimmen (Land steuert die Quellenwahl). Fällt das aus,
  // wird mit dem Land des Wunschorts und einem Richtungsnamen gearbeitet.
  let location: Location;
  try {
    const rev = await reverseGeocode(point.lat, point.lon, signal);
    location = rev ?? { name: fallbackName, lat: point.lat, lon: point.lon, country: query.location.country };
  } catch {
    location = { name: fallbackName, lat: point.lat, lon: point.lon, country: query.location.country };
  }

  const hours = hoursNeededFor([targetDate], phasesLatestHour(query.phases));
  const forecast = await getPointForecast({
    lat: location.lat, lng: location.lon, country: location.country, hours, signal,
  });
  const subQuery: EventQuery = { ...query, location, window: { mode: 'dates', dates: [targetDate] } };
  const rec = recommendBestDay(subQuery, forecast);
  const day = rec.days[0];
  if (!day || !day.summary) return null; // jenseits des Horizonts → nicht vergleichbar
  return { location, score: day.score };
}

/**
 * Sucht in der Umgebung des Wunschorts einen besser bewerteten Ort für den
 * Bezugstag. Liefert den besten Kandidaten mit Vorsprung ≥ `ALT_MIN_GAIN`,
 * sonst null (kein klar besserer Ort in der Nähe).
 */
export async function findBetterLocation(args: {
  query: EventQuery;
  targetDate: string;
  homeScore: number;
  radiusKm?: number;
  signal?: AbortSignal;
}): Promise<AltLocationCandidate | null> {
  const { query, targetDate, homeScore, radiusKm = ALT_RADIUS_KM, signal } = args;
  const { lat, lon } = query.location;

  const results = await Promise.all(
    BEARINGS.map(async (b) => {
      const pt = offsetPoint(lat, lon, b.deg, radiusKm);
      const fallback = `≈ ${radiusKm} km ${b.label}`;
      try {
        const scored = await scoreCandidate(query, pt, fallback, targetDate, signal);
        if (!scored) return null;
        return { location: scored.location, score: scored.score, scoreDelta: scored.score - homeScore, distanceKm: radiusKm, bearing: b.label } as AltLocationCandidate;
      } catch {
        return null;
      }
    }),
  );

  const ranked = results
    .filter((r): r is AltLocationCandidate => r != null && r.scoreDelta >= ALT_MIN_GAIN)
    .sort((a, b) => b.score - a.score);
  return ranked[0] ?? null;
}
