/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Treffsicherheit/Rückblick
 * (EPIC 7, Datenquelle). Holt aus der **Previous-Runs-API** in EINEM Call je
 * Quelle die damalige Vorhersage (Lead 1 + 3 Tage) UND die jüngste Analyse als
 * Ist-Näherung — für Temperatur, Niederschlag, Wind über die letzten 30 Tage.
 * Kein wochenlanges Speichern nötig: die API hält die vergangenen Läufe vor.
 *
 * **Abgrenzung zu EPIC 3 (Stabilität):** hier Vorhersage GEGEN das tatsächlich
 * eingetretene Wetter, nicht Vorhersagen untereinander. Ground Truth = Konsens
 * der Modell-Analysen je Stunde (quellen­unabhängig, faire Referenz).
 */

import { FORECAST_MODELS, type ModelMeta } from './multiModel';

export type VarKey = 'temp' | 'precip' | 'wind';

export interface VarMeta { key: VarKey; label: string; field: string; unit: string }
export const HIT_VARS: VarMeta[] = [
  { key: 'temp', label: 'Temperatur', field: 'temperature_2m', unit: '°C' },
  { key: 'precip', label: 'Niederschlag', field: 'precipitation', unit: 'mm' },
  { key: 'wind', label: 'Wind', field: 'wind_speed_10m', unit: 'km/h' },
];

/** Vorhersage-Vorlaufzeiten (Tage), die wir vergleichen. */
export const HIT_LEADS = [1, 3] as const;
export type Lead = (typeof HIT_LEADS)[number];

/** Je Modell + Variable: Ist (Analyse) und Vorhersage je Vorlaufzeit, stündlich. */
export interface SeriesSet {
  actual: number[];
  byLead: Record<Lead, number[]>;
}

export interface HitHour { tMs: number; dayIndex: number; isPast: boolean }

export interface HitRateData {
  lat: number;
  lon: number;
  fetchedAt: number;
  models: ModelMeta[];
  hours: HitHour[];
  /** series[varKey][modelId] */
  series: Record<VarKey, Record<string, SeriesSet>>;
  /** Konsens-Ist (Mittel der Modell-Analysen) je Variable, stündlich = Ground Truth. */
  consensusActual: Record<VarKey, number[]>;
  /** Vergangene Kalendertage (ISO), neuest zuletzt — für die Rückblick-Auswahl. */
  pastDayISOs: string[];
}

const PAST_DAYS = 30;
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const mean = (xs: number[]) => { const f = xs.filter(Number.isFinite); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN; };

type OMResp = { hourly?: Record<string, unknown> & { time?: string[] } };

/** Holt die Rückblick-Daten (Vorhersage vs. Ist) für 30 Tage. */
export async function fetchHitRate(lat: number, lon: number, signal?: AbortSignal): Promise<HitRateData> {
  // Alle benötigten Hourly-Variablen: je Feld die Analyse + previous_dayN.
  const fields: string[] = [];
  for (const v of HIT_VARS) {
    fields.push(v.field);
    for (const lead of HIT_LEADS) fields.push(`${v.field}_previous_day${lead}`);
  }

  const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('hourly', fields.join(','));
  url.searchParams.set('models', FORECAST_MODELS.map((m) => m.id).join(',')); // 2+ Modelle → suffixierte Keys
  url.searchParams.set('past_days', String(PAST_DAYS));
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo Rückblick: HTTP ${res.status}`);
  const raw = (await res.json()) as OMResp | OMResp[];
  const data = Array.isArray(raw) ? raw[0] : raw;
  const hourly = data?.hourly;
  if (!hourly?.time?.length) throw new Error('Keine Rückblick-Daten für diesen Ort verfügbar.');

  // Modelle, die tatsächlich Analyse-Daten geliefert haben.
  const present = FORECAST_MODELS.filter((m) =>
    arr(hourly[`temperature_2m_${m.id}`]).some((v) => typeof v === 'number' && Number.isFinite(v)));
  const models = present.length ? present : FORECAST_MODELS;

  const times = hourly.time;
  const nowMs = Date.now();
  const firstISO = times[0].slice(0, 10);
  const baseMs = new Date(`${firstISO}T00:00`).getTime();
  const hours: HitHour[] = times.map((t) => {
    const tMs = new Date(t).getTime();
    return { tMs, dayIndex: Math.floor((tMs - baseMs) / 86_400_000), isPast: tMs < nowMs };
  });

  const series = {} as Record<VarKey, Record<string, SeriesSet>>;
  const consensusActual = {} as Record<VarKey, number[]>;
  for (const v of HIT_VARS) {
    series[v.key] = {};
    const actualsByModel: number[][] = [];
    for (const m of models) {
      const actual = times.map((_, h) => num(arr(hourly[`${v.field}_${m.id}`])[h]));
      const byLead = {} as Record<Lead, number[]>;
      for (const lead of HIT_LEADS) byLead[lead] = times.map((_, h) => num(arr(hourly[`${v.field}_previous_day${lead}_${m.id}`])[h]));
      series[v.key][m.id] = { actual, byLead };
      actualsByModel.push(actual);
    }
    // Ground Truth = Konsens der Analysen je Stunde.
    consensusActual[v.key] = times.map((_, h) => mean(actualsByModel.map((a) => a[h])));
  }

  const pastDayISOs = [...new Set(hours.filter((h) => h.isPast).map((h) => new Date(h.tMs).toISOString().slice(0, 10)))];

  return { lat, lon, fetchedAt: nowMs, models, hours, series, consensusActual, pastDayISOs };
}
