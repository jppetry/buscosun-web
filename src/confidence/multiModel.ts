/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Datenquelle (US-6.1).
 *
 * Holt in EINEM Open-Meteo-Call mehrere unabhängige Wettermodelle für einen
 * Punkt (`models=` kommagetrennt → pro Modell suffixierte Keys) und parst je
 * Modell die täglichen (Tmax/Tmin/Regensumme) und stündlichen (Temperatur)
 * Serien. Open-Meteo ist hier die explizite Feature-Quelle (Modellvergleich),
 * kein Default-Hintergrundabruf.
 */

export interface ModelMeta { id: string; label: string; color: string }

/** Fünf unabhängige globale/regionale Modelle mit DACH-Abdeckung. */
export const FORECAST_MODELS: ModelMeta[] = [
  { id: 'icon_seamless', label: 'ICON · DWD', color: '#3A6FA8' },
  { id: 'ecmwf_ifs025', label: 'ECMWF', color: '#C99A4E' },
  { id: 'gfs_seamless', label: 'GFS · NOAA', color: '#C97B47' },
  { id: 'gem_seamless', label: 'GEM · Kanada', color: '#7A9466' },
  { id: 'meteofrance_seamless', label: 'Météo-France', color: '#6B7A8F' },
];
/** Farbe der Konsens-/Median-Linie. */
export const CONSENSUS_COLOR = '#2C2A26';

export interface DayForecast {
  dateMs: number;
  dateISO: string;
  weekdayShort: string;
  isToday: boolean;
  leadDays: number;
  /** Werte je zurückgegebenem Modell (Reihenfolge = `models`). */
  tMaxByModel: number[];
  tMinByModel: number[];
  precipByModel: number[];
  tMaxConsensus: number;
  tMinConsensus: number;
}

export interface HourPoint {
  tMs: number;
  dayIndex: number;
  tempByModel: number[];
  precipByModel: number[];   // mm/h
  windByModel: number[];    // km/h
  cloudByModel: number[];   // %
}

export interface MultiModelForecast {
  lat: number;
  lon: number;
  fetchedAt: number;
  /** Modelle, die für diesen Ort tatsächlich Daten lieferten. */
  models: ModelMeta[];
  days: DayForecast[];
  hours: HourPoint[];
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

type OMResponse = {
  utc_offset_seconds?: number;
  daily?: Record<string, unknown> & { time?: string[] };
  hourly?: Record<string, unknown> & { time?: string[] };
};

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Holt den Multi-Modell-Punktforecast für 7 Tage. */
export async function fetchMultiModelForecast(lat: number, lon: number, signal?: AbortSignal): Promise<MultiModelForecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('daily', ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'].join(','));
  url.searchParams.set('hourly', 'temperature_2m,precipitation,wind_speed_10m,cloud_cover');
  url.searchParams.set('models', FORECAST_MODELS.map((m) => m.id).join(','));
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo Modellvergleich: HTTP ${res.status}`);
  const raw = (await res.json()) as OMResponse | OMResponse[];
  const data = Array.isArray(raw) ? raw[0] : raw;
  if (!data?.daily?.time?.length) throw new Error('Keine Modelldaten für diesen Ort verfügbar.');

  const daily = data.daily;
  const hourly = data.hourly ?? {};

  // Welche Modelle haben überhaupt Tmax-Daten geliefert?
  const present = FORECAST_MODELS.filter((m) => {
    const series = arr(daily[`temperature_2m_max_${m.id}`]);
    return series.some((v) => typeof v === 'number' && Number.isFinite(v));
  });
  const models = present.length >= 1 ? present : FORECAST_MODELS;

  const dates = daily.time ?? [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const days: DayForecast[] = dates.slice(0, 7).map((dateISO, d) => {
    const tMaxByModel = models.map((m) => num(arr(daily[`temperature_2m_max_${m.id}`])[d]));
    const tMinByModel = models.map((m) => num(arr(daily[`temperature_2m_min_${m.id}`])[d]));
    const precipByModel = models.map((m) => num(arr(daily[`precipitation_sum_${m.id}`])[d]));
    const dateMs = new Date(`${dateISO}T12:00`).getTime();
    const finite = (xs: number[]) => xs.filter(Number.isFinite);
    const avg = (xs: number[]) => { const f = finite(xs); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };
    return {
      dateMs, dateISO,
      weekdayShort: WEEKDAYS[new Date(dateMs).getDay()],
      isToday: dateISO === todayISO,
      leadDays: d,
      tMaxByModel, tMinByModel, precipByModel,
      tMaxConsensus: avg(tMaxByModel),
      tMinConsensus: avg(tMinByModel),
    };
  });

  // Stündliche Temperatur je Modell (für das Detail-Unsicherheitsband).
  const htimes = hourly.time ?? [];
  const dayOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const dayIndexByISO = new Map(days.map((dd, i) => [dd.dateISO, i]));
  const hours: HourPoint[] = htimes.map((t, h) => {
    const tMs = new Date(t as string).getTime();
    const tempByModel = models.map((m) => num(arr(hourly[`temperature_2m_${m.id}`])[h]));
    const precipByModel = models.map((m) => num(arr(hourly[`precipitation_${m.id}`])[h]));
    const windByModel = models.map((m) => num(arr(hourly[`wind_speed_10m_${m.id}`])[h]));
    const cloudByModel = models.map((m) => num(arr(hourly[`cloud_cover_${m.id}`])[h]));
    const iso = dayOfMs(tMs);
    return { tMs, dayIndex: dayIndexByISO.get(iso) ?? -1, tempByModel, precipByModel, windByModel, cloudByModel };
  });

  return { lat, lon, fetchedAt: Date.now(), models, days, hours };
}
