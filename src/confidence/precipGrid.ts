/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — räumliche Niederschlags-
 * unsicherheit (US-4.3). Ein 5×5-Raster um den Ort wird in EINEM Ensemble-Call
 * (Multi-Koordinaten + `daily=precipitation_sum` je Member) abgefragt. Pro Zelle
 * ergibt sich der Anteil der Szenarien, in denen Regen fällt — „regnet es genau
 * hier oder eher westlich?".
 */

export const GRID_N = 5; // 5×5 Zellen
const STEP_DEG = 0.05;    // ~5,5 km Schrittweite (Mitte = Ort)

export interface GridCell {
  lat: number;
  lon: number;
  row: number; // 0 = Nord, GRID_N-1 = Süd
  col: number; // 0 = West,  GRID_N-1 = Ost
  isCenter: boolean;
  /** Regensummen je Member (mm) für jeden der 7 Tage. */
  sumsByDay: number[][];
}

export interface PrecipGrid {
  center: { lat: number; lon: number };
  cells: GridCell[]; // row-major (Nord→Süd, West→Ost)
  fetchedAt: number;
}

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

type OMCell = { daily?: Record<string, unknown> & { time?: string[] } };

/** Holt das Niederschlags-Ensemble-Raster (5×5) um den Ort. */
export async function fetchPrecipGrid(lat: number, lon: number, signal?: AbortSignal): Promise<PrecipGrid> {
  const half = (GRID_N - 1) / 2;
  const dLat = STEP_DEG;
  const dLon = STEP_DEG / Math.max(0.3, Math.cos((lat * Math.PI) / 180)); // ungefähr quadratisch in km

  const meta: { lat: number; lon: number; row: number; col: number }[] = [];
  for (let r = 0; r < GRID_N; r++) {
    for (let c = 0; c < GRID_N; c++) {
      meta.push({ lat: lat + (half - r) * dLat, lon: lon + (c - half) * dLon, row: r, col: c });
    }
  }

  const url = new URL('https://ensemble-api.open-meteo.com/v1/ensemble');
  url.searchParams.set('latitude', meta.map((m) => m.lat.toFixed(4)).join(','));
  url.searchParams.set('longitude', meta.map((m) => m.lon.toFixed(4)).join(','));
  url.searchParams.set('daily', 'precipitation_sum');
  url.searchParams.set('models', 'icon_seamless');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo Niederschlagsraster: HTTP ${res.status}`);
  const raw = (await res.json()) as OMCell | OMCell[];
  const list = Array.isArray(raw) ? raw : [raw];

  const cells: GridCell[] = meta.map((m, i) => {
    const daily = list[i]?.daily ?? {};
    const memberKeys = Object.keys(daily).filter((k) => /^precipitation_sum_member\d+$/.test(k));
    const nDays = (daily.time ?? []).length || 7;
    const sumsByDay: number[][] = [];
    for (let d = 0; d < nDays; d++) {
      sumsByDay.push(memberKeys.map((k) => num(arr(daily[k])[d])).filter(Number.isFinite));
    }
    const center = m.row === half && m.col === half;
    return { lat: m.lat, lon: m.lon, row: m.row, col: m.col, isCenter: center, sumsByDay };
  });

  return { center: { lat, lon }, cells, fetchedAt: Date.now() };
}
