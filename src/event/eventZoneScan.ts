/**
 * EZ3 — die Zone am empfohlenen Tag abtasten.
 *
 * Muster und Kostenrahmen wie `eventAltLocation.ts`: mehrere Punktforecasts aus
 * DERSELBEN Pipeline (keine neue Quelle), bewertet mit DEMSELBEN Anlass-Profil.
 * Unterschied: hier wird nicht nach einem besseren Ort gesucht, sondern die
 * Streuung über die eigene Fläche bestimmt — die Bewertung des gewählten Ortes
 * bleibt unangetastet (Entscheidung E3, `audit/event-zone.md`).
 *
 * Kosten: 4 Abrufe (die Ecken) — plus einen fünften nur dann, wenn der gewählte
 * Ort außerhalb der aufgezogenen Fläche liegt und die Mitte deshalb nicht schon
 * durch ihn vertreten ist.
 */

import type { Location } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { recommendBestDay, hoursNeededFor } from './eventScoring';
import { phasesLatestHour, type EventQuery } from './eventModel';
import {
  classifyZoneSpread, zoneContains, zoneCornerPoints, zoneCenter,
  type EventZone, type ZoneSpread, type ZoneScoredPoint, type ZoneSamplePoint,
} from './eventZone';

export interface ZoneScanPoint extends ZoneScoredPoint {
  lat: number;
  lon: number;
  /** Der entscheidende Negativfaktor an diesem Punkt (leer, wenn keiner). */
  downside: string;
  /** Kurzbegründung der Bedingungen an diesem Punkt. */
  reason: string;
}

export interface ZoneScan {
  points: ZoneScanPoint[];
  spread: ZoneSpread | null;
  /** Wie viele Messpunkte nicht auswertbar waren (Netz/Horizont) — nie verschwiegen. */
  failed: number;
}

/** Bewertet einen einzelnen Messpunkt der Zone am Bezugstag. */
async function scorePoint(
  query: EventQuery,
  p: ZoneSamplePoint,
  targetDate: string,
  signal?: AbortSignal,
): Promise<ZoneScanPoint | null> {
  // Kein Reverse-Geocoding: die Ecke ist eine Position auf dem Gelände, kein
  // Ort — ein erfundener Ortsname wäre eine Aussage, die wir nicht haben.
  const location: Location = { name: p.label, lat: p.lat, lon: p.lon, country: query.location.country };
  const hours = hoursNeededFor([targetDate], phasesLatestHour(query.phases));
  const forecast = await getPointForecast({
    lat: p.lat, lng: p.lon, country: location.country, hours, signal,
  });
  const subQuery: EventQuery = { ...query, location, zone: null, window: { mode: 'dates', dates: [targetDate] } };
  const day = recommendBestDay(subQuery, forecast).days[0];
  if (!day || !day.summary) return null; // jenseits des Horizonts ⇒ nicht vergleichbar
  return {
    id: p.id, label: p.label, score: day.score,
    lat: p.lat, lon: p.lon, downside: day.downside, reason: day.reason,
  };
}

/**
 * Tastet die Zone am `targetDate` ab. `centerScore`/`centerReason` sind die
 * bereits bekannten Werte des gewählten Ortes — sie werden wiederverwendet,
 * wenn der Ort in der Fläche liegt (spart einen Abruf und ist derselbe Punkt).
 */
export async function scanZone(args: {
  query: EventQuery;
  zone: EventZone;
  targetDate: string;
  centerScore: number;
  centerDownside: string;
  centerReason: string;
  signal?: AbortSignal;
}): Promise<ZoneScan> {
  const { query, zone, targetDate, centerScore, centerDownside, centerReason, signal } = args;

  const anchorInside = zoneContains(zone, { lat: query.location.lat, lon: query.location.lon });
  const toFetch: ZoneSamplePoint[] = [...zoneCornerPoints(zone)];
  if (!anchorInside) {
    const c = zoneCenter(zone);
    toFetch.unshift({ id: 'center', label: 'Zonen-Mitte', lat: c.lat, lon: c.lon });
  }

  const settled = await Promise.all(
    toFetch.map(async (p) => {
      try { return await scorePoint(query, p, targetDate, signal); } catch { return null; }
    }),
  );

  const points: ZoneScanPoint[] = [];
  if (anchorInside) {
    points.push({
      id: 'center', label: 'Gewählter Ort', score: centerScore,
      lat: query.location.lat, lon: query.location.lon,
      downside: centerDownside, reason: centerReason,
    });
  }
  for (const r of settled) if (r) points.push(r);

  return {
    points,
    spread: classifyZoneSpread(points),
    failed: settled.filter((r) => r == null).length,
  };
}
