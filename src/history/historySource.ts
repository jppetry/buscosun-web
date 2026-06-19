/**
 * Feature „Wetterhistorie" — Datenquelle (Provider-Abstraktion).
 *
 * `HistorySource` kapselt das Beschaffen langer Tagesreihen (und Stundenwerte
 * eines Tages für den Drill-down). Default: `OpenMeteoArchive` — ERA5/ERA5-Land-
 * Reanalyse über die Open-Meteo Archive-API: frei, ohne Key, CORS-fähig, DACH-
 * weit, zurück bis 1940. BEWUSSTE Quellen-Wahl für ein explizit geöffnetes
 * Feature (kein Default-Hintergrundabruf).
 *
 * WICHTIG (US-13.3): ERA5 ist eine REANALYSE (modelliert, mit Beobachtungen
 * assimiliert) — keine reine Stationsmessung. Das wird in der UI gekennzeichnet.
 * DWD-CDC-Rohmessungen (echte Stationen, zurück bis 1881) sind client-seitig
 * nicht nutzbar (kein CORS, ZIP/CSV) — ein künftiges Backend könnte dieselbe
 * Schnittstelle mit DWD bedienen.
 */

import type { DailyRecord } from './historyModel';
import { doyOf } from './historyModel';

/** Früheste von ERA5 abgedeckte Jahreszahl. */
export const ARCHIVE_MIN_YEAR = 1940;

export interface HourlyPoint { tMs: number; hour: number; tempC: number | null; precipMm: number | null; windKmh: number | null }

export interface HistorySource {
  readonly id: string;
  readonly label: string;
  /** „gemessen" | „reanalyse" | „abgeleitet" — für die Wertart-Kennzeichnung (US-13.3). */
  readonly kind: 'measured' | 'reanalysis';
  /** Frühestes von der Quelle abgedecktes Jahr. */
  readonly minYear: number;
  /** Zuletzt aufgelöste Station (nur stationsbasierte Quellen), für die Herkunftsanzeige. */
  lastStation?: { name: string; distanceKm: number; elevation: number | null } | null;
  fetchDailyRange(lat: number, lon: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<DailyRecord[]>;
  fetchHourlyDay(lat: number, lon: number, dateISO: string, signal?: AbortSignal): Promise<HourlyPoint[]>;
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

const DAILY_VARS = [
  'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
  'precipitation_sum', 'sunshine_duration', 'wind_speed_10m_max',
  'wind_direction_10m_dominant', 'relative_humidity_2m_mean', 'snowfall_sum',
];

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function clampEndISO(endYear: number): string {
  const end = `${endYear}-12-31`;
  const t = todayISO();
  return end > t ? t : end;
}

/** ERA5/ERA5-Land über Open-Meteo Archive. */
export class OpenMeteoArchive implements HistorySource {
  readonly id = 'open-meteo-era5';
  readonly label = 'ERA5-Reanalyse (Open-Meteo Archive)';
  readonly kind = 'reanalysis' as const;
  readonly minYear = ARCHIVE_MIN_YEAR;

  private cache = new Map<string, Promise<DailyRecord[]>>();

  fetchDailyRange(lat: number, lon: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<DailyRecord[]> {
    const sy = Math.max(ARCHIVE_MIN_YEAR, startYear);
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}:${sy}-${endYear}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = (async (): Promise<DailyRecord[]> => {
      const url = new URL('https://archive-api.open-meteo.com/v1/archive');
      url.searchParams.set('latitude', lat.toFixed(4));
      url.searchParams.set('longitude', lon.toFixed(4));
      url.searchParams.set('start_date', `${sy}-01-01`);
      url.searchParams.set('end_date', clampEndISO(endYear));
      url.searchParams.set('daily', DAILY_VARS.join(','));
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url.toString(), { signal });
      if (!res.ok) throw new Error(`Open-Meteo Archive: HTTP ${res.status}`);
      const data = (await res.json()) as { daily?: Record<string, unknown> & { time?: string[] } };
      const d = data.daily;
      if (!d?.time?.length) throw new Error('Keine Archivdaten für diesen Ort.');
      const tMax = arr(d.temperature_2m_max), tMin = arr(d.temperature_2m_min), tMean = arr(d.temperature_2m_mean);
      const precip = arr(d.precipitation_sum), sun = arr(d.sunshine_duration), wmax = arr(d.wind_speed_10m_max);
      const wdir = arr(d.wind_direction_10m_dominant), hum = arr(d.relative_humidity_2m_mean), snow = arr(d.snowfall_sum);
      return d.time.map((dateISO, i) => {
        const [y, m, day] = dateISO.split('-').map(Number);
        const sunSec = num(sun[i]);
        return {
          dateISO, year: y, month: m, day, doy: doyOf(y, m, day),
          tMaxC: num(tMax[i]), tMinC: num(tMin[i]), tMeanC: num(tMean[i]),
          precipMm: num(precip[i]), sunshineH: sunSec == null ? null : sunSec / 3600,
          windMaxKmh: num(wmax[i]), windDirDeg: num(wdir[i]), humidityPct: num(hum[i]),
          snowCm: num(snow[i]),
        } as DailyRecord;
      });
    })();
    this.cache.set(key, p);
    return p;
  }

  async fetchHourlyDay(lat: number, lon: number, dateISO: string, signal?: AbortSignal): Promise<HourlyPoint[]> {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lon.toFixed(4));
    url.searchParams.set('start_date', dateISO);
    url.searchParams.set('end_date', dateISO);
    url.searchParams.set('hourly', ['temperature_2m', 'precipitation', 'wind_speed_10m'].join(','));
    url.searchParams.set('timezone', 'auto');
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) throw new Error(`Open-Meteo Archive (Stunden): HTTP ${res.status}`);
    const data = (await res.json()) as { hourly?: Record<string, unknown> & { time?: string[] } };
    const h = data.hourly;
    if (!h?.time?.length) return [];
    const t = arr(h.temperature_2m), p = arr(h.precipitation), w = arr(h.wind_speed_10m);
    return h.time.map((ts, i) => ({ tMs: new Date(ts).getTime(), hour: new Date(ts).getHours(), tempC: num(t[i]), precipMm: num(p[i]), windKmh: num(w[i]) }));
  }
}

/**
 * Default-Quelle des Features: **Meteostat** (DWD-Stationsmessungen, Open-Source,
 * frei, ohne Key, ohne Rate-Limit). Open-Meteo/ERA5 bleibt als Provider verfügbar
 * (z. B. für Stundenwerte) und als gitterbasierte Alternative.
 * (Import am Dateiende, um die Zyklus-freie Reihenfolge zu wahren.)
 */
import { MeteostatSource } from './meteostatSource';
export const defaultHistorySource: HistorySource = new MeteostatSource();
