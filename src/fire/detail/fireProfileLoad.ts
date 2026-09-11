/**
 * BDE-E — der Abruf für das Brandprofil. Getrennt von `fireProfile.ts`, damit dessen
 * Rechenkern netz- und DOM-frei bleibt und der Verifier ihn ohne Browser prüfen kann.
 *
 * **Warum ein eigener Abruf und nicht der der Wetterführung?** Das Profil braucht ~31 Tage
 * Stundenreihe (Referenzperiode + Vorlauf der FFMC-Kette), die Wetterführung nur das
 * Brandzeitfenster. Und es braucht die Bodenfeuchte, die die Wetterführung nicht anzeigt.
 * Ein gemeinsamer Abruf hieße: jeder Brand zieht 31 Tage, auch wenn niemand das Netz ansieht.
 *
 * **Warum immer ERA5, auch für frische Brände?** Weil Wert und Verteilung aus derselben Reihe
 * kommen müssen (`fireProfile.ts`, Festlegung 3). Das Archiv reicht bis zum laufenden Tag —
 * am Endpunkt nachgemessen. Die Bodenfeuchte-Schicht heißt dort `soil_moisture_0_to_7cm`;
 * die ICON-Schicht `0_to_1cm` gibt es im Archiv NICHT (Antwort trägt `"undefined"` als
 * Einheit). Deshalb steht in der Oberfläche die Tiefe dabei.
 */
import type { ProfileHour } from './fireProfile';
import { PROFILE_REF_DAYS } from './fireProfile';
import { omTimeMs, isoDayUtc } from './fireWeatherAtPoint';

/** Ein Tag mehr als die Referenzperiode — Vorlauf für die FFMC-Kette und Rundungsluft. */
export const PROFILE_FETCH_PAD_DAYS = 1;

const PROFILE_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'precipitation', 'soil_moisture_0_to_7cm',
].join(',');

export function profileUrl(lat: number, lon: number, startISO: string, endISO: string): string {
  const u = new URL('https://archive-api.open-meteo.com/v1/archive');
  u.searchParams.set('latitude', lat.toFixed(4));
  u.searchParams.set('longitude', lon.toFixed(4));
  u.searchParams.set('start_date', startISO);
  u.searchParams.set('end_date', endISO);
  u.searchParams.set('hourly', PROFILE_VARS);
  u.searchParams.set('timezone', 'UTC');
  return u.toString();
}

interface ProfileJson {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    precipitation?: (number | null)[];
    soil_moisture_0_to_7cm?: (number | null)[];
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function profileHoursOf(json: ProfileJson | null): ProfileHour[] {
  const h = json?.hourly;
  if (!h?.time) return [];
  const out: ProfileHour[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const atMs = omTimeMs(h.time[i]);
    if (!Number.isFinite(atMs)) continue;
    out.push({
      atMs,
      tempC: num(h.temperature_2m?.[i]),
      rhPct: num(h.relative_humidity_2m?.[i]),
      windKmh: num(h.wind_speed_10m?.[i]),
      windFromDeg: num(h.wind_direction_10m?.[i]),
      gustKmh: num(h.wind_gusts_10m?.[i]),
      precipMm: num(h.precipitation?.[i]),
      soilM3: num(h.soil_moisture_0_to_7cm?.[i]),
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

const _cache = new Map<string, Promise<ProfileHour[]>>();

/**
 * Die Reihe für das Profil. Ohne Abbruchsignal — bewusst: das Promise liegt im Sitzungs-Cache,
 * und hinge es am Signal des ersten Aufrufers, bekäme jeder spätere „signal is aborted" aus dem
 * Cache (Lehre GBP1 (3), in dieser Linie schon einmal zugeschlagen).
 */
export function fetchFireProfileHours(lat: number, lon: number, anchorMs: number): Promise<ProfileHour[]> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}|${Math.round(anchorMs / 3_600_000)}`;
  const hit = _cache.get(key);
  if (hit) return hit;                       // Vergangenheit ändert sich nicht — kein TTL.
  const startISO = isoDayUtc(anchorMs - (PROFILE_REF_DAYS + PROFILE_FETCH_PAD_DAYS) * 86_400_000);
  const endISO = isoDayUtc(anchorMs + 86_400_000);
  const p = fetch(profileUrl(lat, lon, startISO, endISO))
    .then((r) => (r.ok ? (r.json() as Promise<ProfileJson>) : null))
    .then((j) => profileHoursOf(j))
    .catch(() => {
      _cache.delete(key);                    // Ein Ausfall wird nicht gemerkt.
      return [] as ProfileHour[];
    });
  _cache.set(key, p);
  return p;
}

export function resetFireProfileCache(): void { _cache.clear(); }
