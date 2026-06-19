/**
 * DWD UV-Index-Vorhersage via opendata.dwd.de.
 *
 * Tägliches JSON (≈ 07:30 Uhr aktualisiert) mit dem **Tagesmaximum** des
 * UV-Index für 38 Vorhersage-Orte in Deutschland, jeweils für `today` /
 * `tomorrow` / `dayafter_to` auf der ganzzahligen WHO-Skala 0..11+.
 *
 * Das Produkt liefert **keine Koordinaten** und **keinen Tagesgang** — nur
 * ein Skalar pro Ort/Tag. Damit der UV-Index ein vollwertiges, stündliches
 * Sample-Feld (das 9.) wird, gehen wir zweistufig vor:
 *
 *   1. **Räumlich** — nächstgelegener DWD-Ort zum Query-Punkt (Tabelle unten,
 *      Koordinaten ≈ 0,05° genau, reicht für die Nearest-Auswahl).
 *   2. **Zeitlich (Tier-C-Heuristik)** — der Tages-Peak (von DWD, wolken-
 *      moduliert) wird über den Tag mit der **Sonnenhöhe** verteilt:
 *        UVI(t) = UVImax · clamp01( sin(h(t)) / sin(h_noon) )^EXP
 *      Nachts (Sonne unter Horizont) ⇒ 0, Mittag ⇒ Peak. Die Wolken stecken
 *      bereits im DWD-Peak, also wird hier NICHT erneut bewölkungs-gedämpft.
 *
 * Frei, kein API-Key, CC BY 4.0, kommerziell OK. **Nur DE** — AT/CH haben
 * kein entsprechendes Open-Data-Feed (GeoSphere/MeteoSwiss nur intern).
 *
 * opendata.dwd.de blockt Browser-CORS; in dev proxyt vite.config.ts den
 * Pfad `/_dwd_opendata`, in prod spiegelt netlify.toml denselben Pfad.
 */

import type { PointHourSamples, PointSourceSample } from '../pointForecast/types';

const UVI_URL = '/_dwd_opendata/climate_environment/health/alerts/uvi.json';

/** Verteilungs-Exponent für den Sonnenstand→UV-Tagesgang (empirisch ~1.1). */
const UV_SOLAR_EXP = 1.1;

// ---------------------------------------------------------------------------
// Orts-Tabelle der 38 DWD-UVI-Vorhersagestationen.
// Namen MÜSSEN exakt den `city`-Strings im JSON entsprechen (UTF-8, Umlaute).
// ---------------------------------------------------------------------------
interface UvCity { city: string; lat: number; lng: number }
const UV_CITIES: UvCity[] = [
  { city: 'Arkona',             lat: 54.68, lng: 13.43 },
  { city: 'Berlin',             lat: 52.52, lng: 13.40 },
  { city: 'Kahler Asten',       lat: 51.18, lng:  8.49 },
  { city: 'Seehausen',          lat: 52.89, lng: 11.75 },
  { city: 'Sankt Peter-Ording', lat: 54.30, lng:  8.65 },
  { city: 'Wernigerode',        lat: 51.83, lng: 10.79 },
  { city: 'Magdeburg',          lat: 52.13, lng: 11.63 },
  { city: 'Hamburg',            lat: 53.55, lng:  9.99 },
  { city: 'Regensburg',         lat: 49.02, lng: 12.10 },
  { city: 'Kiel',               lat: 54.32, lng: 10.13 },
  { city: 'Bonn',               lat: 50.73, lng:  7.10 },
  { city: 'München',            lat: 48.14, lng: 11.58 },
  { city: 'Bremen',             lat: 53.08, lng:  8.80 },
  { city: 'Frankfurt/Main',     lat: 50.11, lng:  8.68 },
  { city: 'Würzburg',           lat: 49.79, lng:  9.95 },
  { city: 'Düsseldorf',         lat: 51.23, lng:  6.78 },
  { city: 'Marienleuchte',      lat: 54.50, lng: 11.25 },
  { city: 'List auf Sylt',      lat: 55.02, lng:  8.41 },
  { city: 'Hannover',           lat: 52.37, lng:  9.74 },
  { city: 'Waren',              lat: 53.52, lng: 12.68 },
  { city: 'Hahn',               lat: 49.95, lng:  7.26 },
  { city: 'Osnabrück',          lat: 52.28, lng:  8.05 },
  { city: 'Nürnberg',           lat: 49.45, lng: 11.08 },
  { city: 'Norderney',          lat: 53.71, lng:  7.15 },
  { city: 'Dresden',            lat: 51.05, lng: 13.74 },
  { city: 'Kassel',             lat: 51.31, lng:  9.49 },
  { city: 'Großer Arber',       lat: 49.11, lng: 13.14 },
  { city: 'Ulm',                lat: 48.40, lng:  9.99 },
  { city: 'Cottbus',            lat: 51.76, lng: 14.33 },
  { city: 'Weimar',             lat: 50.98, lng: 11.32 },
  { city: 'Leipzig',            lat: 51.34, lng: 12.37 },
  { city: 'Zugspitze',          lat: 47.42, lng: 10.98 },
  { city: 'Freiburg',           lat: 47.99, lng:  7.85 },
  { city: 'Stuttgart',          lat: 48.78, lng:  9.18 },
  { city: 'Neubrandenburg',     lat: 53.56, lng: 13.26 },
  { city: 'Rostock',            lat: 54.09, lng: 12.13 },
  { city: 'Konstanz',           lat: 47.66, lng:  9.18 },
  { city: 'Weinbiet',           lat: 49.39, lng:  8.12 },
];

interface DwdUviEntry {
  city: string;
  forecast: { today?: number; tomorrow?: number; dayafter_to?: number };
}
interface DwdUviResponse {
  last_update: string;
  next_update?: string;
  content: DwdUviEntry[];
}

export interface UvDailyForecast {
  /** Gewählter DWD-Ort. */
  city: string;
  lat: number;
  lng: number;
  /** Distanz Query→Ort in m. */
  distanceMeters: number;
  /** Tagesmaximum-UVI je Tag (0..11+). null wenn DWD den Tag nicht liefert. */
  today: number | null;
  tomorrow: number | null;
  dayAfter: number | null;
  /** „today" verankert auf das Datum von last_update (Epoch-ms, lokale Mitternacht). */
  anchorMidnightMs: number;
}

// ---------------------------------------------------------------------------
// Reine Geometrie/Heuristik (verifizierbar, keine Netzwerk-/Browser-Deps).
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Haversine-Distanz (m) — lokale Kopie, hält das Modul dep-frei. */
export function uvHaversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/**
 * Sonnenhöhe (Elevation in Grad über Horizont) für Zeit/Ort — NOAA-genähert
 * (Genauigkeit ~Bogenminute, mehr als ausreichend für die UV-Verteilung).
 */
export function solarElevationDeg(date: Date, lat: number, lng: number): number {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;                       // Tage seit J2000.0
  const L = (280.460 + 0.9856474 * n) % 360;        // mittlere Länge (°)
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD; // mittlere Anomalie (rad)
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ekliptikale Länge
  const eps = (23.439 - 0.0000004 * n) * RAD;       // Schiefe der Ekliptik
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  let gmst = (18.697374558 + 24.06570982441908 * n) % 24; // Greenwich mean sidereal (h)
  if (gmst < 0) gmst += 24;
  const lmst = (gmst * 15 + lng) * RAD;             // lokale Sternzeit (rad)
  const ha = lmst - ra;                             // Stundenwinkel (rad)
  const latR = lat * RAD;
  const sinAlt = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
}

/**
 * Max. Sonnenhöhe des Tages (zum Sonnen-Höchststand) für Ort/Datum — closed
 * form: alt_max = 90° − |lat − decl|, also sin(alt_max) = cos(lat − decl).
 */
export function maxSolarElevationDeg(date: Date, lat: number): number {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;
  return 90 - Math.abs(lat - decl);
}

/**
 * Verteilt den Tages-Peak-UVI auf eine Tageszeit anhand der Sonnenhöhe.
 * Liefert 0 wenn die Sonne unter dem Horizont steht, sonst
 * UVImax · clamp01(sin(alt)/sin(altNoon))^EXP, gerundet auf 0,1.
 */
export function uvAtElevation(uvDailyMax: number, altDeg: number, altNoonDeg: number): number {
  if (uvDailyMax <= 0 || altDeg <= 0 || altNoonDeg <= 0) return 0;
  const ratio = Math.min(1, Math.sin(altDeg * RAD) / Math.sin(altNoonDeg * RAD));
  if (ratio <= 0) return 0;
  return Math.round(uvDailyMax * Math.pow(ratio, UV_SOLAR_EXP) * 10) / 10;
}

/** Lokale Mitternacht (Epoch-ms) des Tages, in den `ms` fällt. */
function localMidnightMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Tages-Index relativ zum Anker (0 = today, 1 = tomorrow, 2 = dayAfter).
 * Liefert -1 für die Vergangenheit und ≥3 jenseits des DWD-Horizonts.
 */
export function uvDayIndex(etaMs: number, anchorMidnightMs: number): number {
  return Math.round((localMidnightMs(etaMs) - anchorMidnightMs) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Netzwerk + Cache (spiegelt dwdPollen.ts: tägliches JSON, 30-min-Cache).
// ---------------------------------------------------------------------------

let cache: { fetchedAt: number; data: DwdUviResponse } | null = null;

/** UVI-Tagesvorhersage für den DWD-Ort, der dem Query-Punkt am nächsten liegt. */
export async function fetchUvDailyForecast(
  lat: number, lng: number, signal?: AbortSignal,
): Promise<UvDailyForecast | null> {
  let raw: DwdUviResponse;
  if (cache && Date.now() - cache.fetchedAt < 30 * 60_000) {
    raw = cache.data;
  } else {
    const res = await fetch(UVI_URL, { signal });
    if (!res.ok) throw new Error(`DWD UVI HTTP ${res.status}`);
    raw = (await res.json()) as DwdUviResponse;
    cache = { fetchedAt: Date.now(), data: raw };
  }

  // Index DWD-Daten nach Ortsname.
  const byCity = new Map<string, DwdUviEntry['forecast']>();
  for (const e of raw.content ?? []) byCity.set(e.city, e.forecast);

  // Nächsten Ort wählen, der auch tatsächlich Daten im JSON hat.
  let best: UvCity | null = null;
  let bestD = Infinity;
  for (const c of UV_CITIES) {
    if (!byCity.has(c.city)) continue;
    const d = uvHaversine(lat, lng, c.lat, c.lng);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;

  const fc = byCity.get(best.city)!;
  // last_update ohne Zeitzone → lokale Interpretation (DWD = Europe/Berlin ≈ lokal).
  const anchorMidnightMs = localMidnightMs(new Date(raw.last_update).getTime());

  return {
    city: best.city, lat: best.lat, lng: best.lng, distanceMeters: bestD,
    today: fc.today ?? null,
    tomorrow: fc.tomorrow ?? null,
    dayAfter: fc.dayafter_to ?? null,
    anchorMidnightMs,
  };
}

export interface UvPointHour {
  time: Date;
  /** UV-Index (0..11+) zur Stunde; null wenn jenseits des 3-Tage-Horizonts. */
  uvIndex: number | null;
}

/**
 * Stündliche UV-Reihe am Query-Punkt, von der nächsten UTC-Stunde an für
 * `hours` Schritte (deckt sich mit der MOSMIX-Stundenrasterung). DE-only:
 * außerhalb der DWD-Orte (keine Daten) ⇒ leere Reihe.
 */
export async function fetchDwdUvPoint(
  lat: number, lng: number, hours: number, signal?: AbortSignal,
): Promise<UvPointHour[]> {
  const fc = await fetchUvDailyForecast(lat, lng, signal);
  if (!fc) return [];
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const dayMax = [fc.today, fc.tomorrow, fc.dayAfter];
  const out: UvPointHour[] = [];
  for (let h = 0; h < hours; h++) {
    const t = new Date(start.getTime() + h * 3_600_000);
    const di = uvDayIndex(t.getTime(), fc.anchorMidnightMs);
    const uvMax = di >= 0 && di <= 2 ? dayMax[di] : undefined;
    if (uvMax == null) { out.push({ time: t, uvIndex: null }); continue; }
    const alt = solarElevationDeg(t, lat, lng);
    const altNoon = maxSolarElevationDeg(t, lat);
    out.push({ time: t, uvIndex: uvAtElevation(uvMax, alt, altNoon) });
  }
  return out;
}

/** Hüllt die UV-Reihe in das einheitliche PointHourSamples-Format (source='dwd_uv'). */
export function uvToHourSamples(arr: UvPointHour[]): PointHourSamples[] {
  return arr.map((e) => ({
    timestamp: e.time,
    samples: [emptyUvSample(e.uvIndex)],
  }));
}

function emptyUvSample(uvIndex: number | null): PointSourceSample {
  return {
    source: 'dwd_uv',
    family: 'mosmix',           // DWD-Stationsvorhersage-Familie, DE-only
    temperature: null, sourceElevation: null,
    u: null, v: null, gust: null, relativeHumidity: null, snowLine: null,
    cloudLow: null, cloudMid: null, cloudHigh: null, precipitation: null,
    uvIndex,
    distanceMeters: 0,
  };
}

/** WHO-UV-Risiko-Stufe → Label/Farbe (für UI-Badges). */
export function uvCategory(uv: number): { label: string; color: string } {
  if (uv >= 11) return { label: 'extrem', color: '#6b49c8' };
  if (uv >= 8) return { label: 'sehr hoch', color: '#d7263d' };
  if (uv >= 6) return { label: 'hoch', color: '#f46036' };
  if (uv >= 3) return { label: 'mäßig', color: '#f5b700' };
  return { label: 'niedrig', color: '#5a9e4b' };
}
