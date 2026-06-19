/**
 * BrightSky → ForecastGrid adapter.
 *
 * BrightSky (free DWD MOSMIX wrapper) returns per-point hourly forecasts,
 * one HTTP call per point. By emitting it in the unified ForecastGrid shape
 * we can feed it through the same FusionEngine pipeline as Open-Meteo —
 * meaning we get IDW+Gaussian smoothing for free, turning the sparse
 * station forecasts into dense continuous heatmap layers.
 *
 * Used as a fallback when Open-Meteo throttles (HTTP 429), and as a second
 * data source when both succeed (bias correction).
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';
import { DACH_BOUNDS } from './openMeteoForecast';
import { correctCloudBias } from './cloudBias';

interface WeatherEntry {
  timestamp: string;
  temperature?: number | null;
  wind_speed?: number | null;     // km/h via /weather endpoint
  wind_direction?: number | null;
  cloud_cover?: number | null;
  precipitation?: number | null;
}

function nearestHourUtc(): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}
function toIsoHour(d: Date): string {
  return d.toISOString().slice(0, 13) + ':00';
}

async function pMap<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export interface BrightSkyForecastOptions {
  bounds?: ForecastBounds;
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
  concurrency?: number;
}

/**
 * Fetch a MOSMIX-backed forecast grid in the unified ForecastGrid shape.
 * Resolution is sparse (default 12×10 over Europe) — the FusionEngine then
 * up-samples it to a dense GPU-friendly grid.
 */
export async function fetchBrightSkyGrid(
  options: BrightSkyForecastOptions = {},
): Promise<ForecastGrid> {
  const bounds = options.bounds ?? DACH_BOUNDS;
  const cols = options.cols ?? 12;
  const rows = options.rows ?? 10;
  const hours = Math.max(1, options.hours ?? 24);
  const total = cols * rows;

  const lats = new Array<number>(total);
  const lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / Math.max(1, rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / Math.max(1, cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat;
      lngs[k] = lng;
    }
  }

  const start = nearestHourUtc();
  const end = new Date(start.getTime() + hours * 3600 * 1000);

  const responses = await pMap(
    Array.from({ length: total }, (_, i) => i),
    async (k) => {
      const url =
        `https://api.brightsky.dev/weather?lat=${lats[k].toFixed(3)}&lon=${lngs[k].toFixed(3)}` +
        `&date=${encodeURIComponent(toIsoHour(start))}` +
        `&last_date=${encodeURIComponent(toIsoHour(end))}`;
      try {
        const res = await fetch(url, { signal: options.signal });
        if (!res.ok) return null;
        const json = (await res.json()) as { weather?: WeatherEntry[] };
        return json.weather ?? null;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') throw err;
        return null;
      }
    },
    options.concurrency ?? 8,
    options.signal,
  );

  const usableHours = Math.min(
    hours,
    Math.max(0, ...responses.map((r) => r?.length ?? 0)),
  );

  const times: Date[] = [];
  for (let h = 0; h < usableHours; h++) {
    times.push(new Date(start.getTime() + h * 3600 * 1000));
  }

  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < usableHours; h++) {
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const w = responses[k]?.[h];
      let u: number | null = null;
      let v: number | null = null;
      const speedKmh = w?.wind_speed;
      const dir = w?.wind_direction;
      if (speedKmh != null && dir != null) {
        const speedMs = speedKmh / 3.6;
        const r = (dir * Math.PI) / 180;
        u = -speedMs * Math.sin(r);
        v = -speedMs * Math.cos(r);
      }
      // Bias-correct against satellite ground truth: MOSMIX is empirically
      // optimistic-but-pessimistic-on-clouds — Berlin 88 % vs MSG/ICON-D2 7 %,
      // Munich 0 % matches. A pow(1.5) compresses the 0–50 % range (where
      // Cirrus haze inflates the value most) toward 0 while leaving high
      // values (real overcast → ≥ 90 %) mostly intact. See `correctCloudBias`.
      const total100 = correctCloudBias(w?.cloud_cover ?? null);
      // Split corrected total across low/mid/high proportionally 55 / 30 / 15.
      // The previous "stack from the bottom" rule inflated each layer
      // independently — a 55 % total became cl=100 %, cm=50 %, ch=0 %, which
      // after alpha compositing rendered as ~95 % visual cover.
      let cl: number | null = null;
      let cm: number | null = null;
      let ch: number | null = null;
      if (total100 != null) {
        cl = total100 * 0.55;
        cm = total100 * 0.30;
        ch = total100 * 0.15;
      }
      arr[k] = {
        temperature: w?.temperature ?? null,
        u,
        v,
        cloudLow: cl,
        cloudMid: cm,
        cloudHigh: ch,
        precipitation: w?.precipitation ?? null,
        model: 'dwd_mosmix',
      };
    }
    points.push(arr);
  }

  return {
    cols,
    rows,
    bounds,
    times,
    points,
    fetchedAt: Date.now(),
  };
}
