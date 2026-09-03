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
 *
 * **V-EZ-3 (gemessen 2026-08-25):** die Ecken laufen NACHEINANDER, nicht parallel.
 * Ein `Promise.all` über vier Ecken feuert je Ecke AROME + INCA gegen
 * `dataset.api.hub.geosphere.at` — im Kaltstart quittiert GeoSphere das mit
 * **HTTP 429** und die halbe Zone fällt aus der Spanne. Mit Reihenfolge + Pause
 * ist der Abschnitt langsamer (er liegt unter der Falte) und vollständig.
 * `eventAltLocation.ts` hat dasselbe Muster parallel — dort auf Knopfdruck.
 */

import type { Location } from '../types';
import { getPointForecast } from '../pointForecast/pointForecast';
import { recommendBestDay, hoursNeededFor, type DaySummary } from './eventScoring';
import { phasesLatestHour, type EventQuery } from './eventModel';
import { phasesWindow, representativeWindHour, windAtHour } from './eventTerrain';
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
  /** Vollständige Tages-Zusammenfassung dieses Punkts (V-ET-1: bezahlt, vorher verworfen). */
  summary: DaySummary | null;
  /** Windrichtung (woher, Grad) zur repräsentativen Stunde; null = Quelle trägt keine. */
  windDirDeg: number | null;
  /** Die benutzte Stunde (Böen-Spitze oder Fenster-Mitte) — für die Beschriftung. */
  windHour: number | null;
}

/** Pause zwischen zwei Ecken — hält die Abrufe unter der Ratengrenze (V-EZ-3). */
const STEP_PAUSE_MS = 300;
/** Wartezeit vor dem einen Wiederholungsversuch einer Ecke. */
const RETRY_PAUSE_MS = 1500;

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', done); clearTimeout(t); resolve(); }
    signal?.addEventListener('abort', done, { once: true });
  });
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
  // ET2 (V-ET-1): die volle Tages-Zusammenfassung und der Wind zur
  // repräsentativen Stunde werden BEHALTEN — beides ist mit demselben Abruf
  // bereits bezahlt und ging bisher verloren.
  const hour = representativeWindHour(day.summary.gustPeakHour, phasesWindow(query.phases));
  const wind = windAtHour(forecast.hours, targetDate, hour);
  return {
    id: p.id, label: p.label, score: day.score,
    lat: p.lat, lon: p.lon, downside: day.downside, reason: day.reason,
    summary: day.summary, windDirDeg: wind.dirDeg, windHour: wind.dirDeg != null ? hour : null,
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
  /** ET2 (additiv): schon bekannte Tageswerte + Wind des gewählten Ortes. */
  centerSummary?: DaySummary | null;
  centerWind?: { dirDeg: number | null; hour: number | null };
  signal?: AbortSignal;
}): Promise<ZoneScan> {
  const { query, zone, targetDate, centerScore, centerDownside, centerReason, centerSummary, centerWind, signal } = args;

  const anchorInside = zoneContains(zone, { lat: query.location.lat, lon: query.location.lon });
  const toFetch: ZoneSamplePoint[] = [...zoneCornerPoints(zone)];
  if (!anchorInside) {
    const c = zoneCenter(zone);
    toFetch.unshift({ id: 'center', label: 'Zonen-Mitte', lat: c.lat, lon: c.lon });
  }

  // Nacheinander mit Pause (V-EZ-3): die Quellen der Ecken sind dieselben
  // ratenbegrenzten Endpunkte, die der Hauptabruf gerade benutzt hat.
  const settled: Array<ZoneScanPoint | null> = [];
  for (const p of toFetch) {
    if (signal?.aborted) { settled.push(null); continue; }
    let got: ZoneScanPoint | null = null;
    for (let attempt = 0; attempt < 2 && got == null; attempt++) {
      if (attempt > 0) await pause(RETRY_PAUSE_MS, signal);
      try { got = await scorePoint(query, p, targetDate, signal); } catch { got = null; }
      if (signal?.aborted) break;
    }
    settled.push(got);
    await pause(STEP_PAUSE_MS, signal);
  }

  const points: ZoneScanPoint[] = [];
  if (anchorInside) {
    points.push({
      id: 'center', label: 'Gewählter Ort', score: centerScore,
      lat: query.location.lat, lon: query.location.lon,
      downside: centerDownside, reason: centerReason,
      summary: centerSummary ?? null,
      windDirDeg: centerWind?.dirDeg ?? null,
      windHour: centerWind?.hour ?? null,
    });
  }
  for (const r of settled) if (r) points.push(r);

  return {
    points,
    spread: classifyZoneSpread(points),
    failed: settled.filter((r) => r == null).length,
  };
}
