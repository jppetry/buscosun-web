/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Ensemble-Datenquelle (EPIC 4).
 *
 * Holt aus der Open-Meteo **Ensemble-API** (ICON-Ensemble, bis zu 40 Member) je
 * Stunde die Temperatur ALLER Szenarien für einen Ort. Daraus entstehen die
 * Bandbreiten (Perzentile, US-4.1) und die Spaghetti-Ansicht (US-4.2). Bewusst
 * Open-Meteo als expliziter Feature-Abruf (Verteilung), kein Default-Hintergrund.
 */

export interface EnsembleHour {
  tMs: number;
  dayIndex: number;
  /** Temperatur je Ensemble-Member (NaN gefiltert beim Auswerten). */
  temps: number[];
}

export interface EnsembleForecast {
  lat: number;
  lon: number;
  fetchedAt: number;
  memberCount: number;
  hours: EnsembleHour[];
}

const ENSEMBLE_MODEL = 'icon_seamless';

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

type OMEnsemble = { hourly?: Record<string, unknown> & { time?: string[] } };

/** Holt das Temperatur-Ensemble (alle Member) für 7 Tage. */
export async function fetchEnsemble(lat: number, lon: number, signal?: AbortSignal): Promise<EnsembleForecast> {
  const url = new URL('https://ensemble-api.open-meteo.com/v1/ensemble');
  url.searchParams.set('latitude', lat.toFixed(4));
  url.searchParams.set('longitude', lon.toFixed(4));
  url.searchParams.set('hourly', 'temperature_2m');
  url.searchParams.set('models', ENSEMBLE_MODEL);
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo Ensemble: HTTP ${res.status}`);
  const raw = (await res.json()) as OMEnsemble | OMEnsemble[];
  const data = Array.isArray(raw) ? raw[0] : raw;
  const hourly = data?.hourly;
  if (!hourly?.time?.length) throw new Error('Keine Ensemble-Daten für diesen Ort verfügbar.');

  // Alle Member-Schlüssel finden (temperature_2m_member01 …); Basis-Lauf mitnehmen.
  const memberKeys = Object.keys(hourly).filter((k) => /^temperature_2m(_member\d+)?$/.test(k));
  const series = memberKeys.map((k) => arr(hourly[k]));

  const times = hourly.time;
  const firstISO = times[0].slice(0, 10);
  const baseMs = new Date(`${firstISO}T00:00`).getTime();
  const dayIndexOf = (tMs: number) => Math.floor((tMs - baseMs) / 86_400_000);

  const hours: EnsembleHour[] = times.map((t, h) => {
    const tMs = new Date(t).getTime();
    const temps = series.map((s) => num(s[h])).filter(Number.isFinite);
    return { tMs, dayIndex: dayIndexOf(tMs), temps };
  });

  const memberCount = hours.reduce((m, h) => Math.max(m, h.temps.length), 0);
  return { lat, lon, fetchedAt: Date.now(), memberCount, hours };
}
