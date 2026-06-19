/**
 * BrightSky — free, unlimited DWD-backed weather API.
 * https://brightsky.dev/  https://github.com/jdemaeyer/brightsky
 *
 * We use the MOSMIX-backed /weather endpoint (vs. station-only
 * /current_weather) because MOSMIX has full European coverage for arbitrary
 * coordinates. One HTTP request per grid point returns the full 24-hour
 * forecast in a single response.
 */

import type {
  WindGridResult,
  ScalarGridResult,
  CloudGridResult,
  OpenMeteoBounds,
  OpenMeteoBulkResult,
} from './openMeteoSource';

const DEFAULT_BOUNDS: OpenMeteoBounds = {
  lngMin: -15,
  lngMax: 30,
  latMin: 32,
  latMax: 65,
};

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

export interface DwdBulkOptions {
  bounds?: OpenMeteoBounds;
  cols?: number;
  rows?: number;
  signal?: AbortSignal;
  layers?: Array<'wind' | 'temperature' | 'clouds' | 'precipitation'>;
  temperatureRange?: { min: number; max: number };
  /** Limit concurrent HTTP requests (default 8 — typical browser cap is 6 per host). */
  concurrency?: number;
  /** Number of forecast hours to fetch starting at the next whole UTC hour. Defaults to 24. */
  hours?: number;
}

interface WeatherEntry {
  timestamp: string;
  temperature?: number | null;
  wind_speed?: number | null;
  wind_direction?: number | null;
  cloud_cover?: number | null;
  precipitation?: number | null;
}

interface HourPointResult {
  temperature: number | null;
  wind_speed: number | null;       // m/s
  wind_direction: number | null;   // degrees
  cloud_cover: number | null;      // 0..100
  precipitation: number | null;    // mm in this hour
}

export interface DwdForecastResult {
  /** One bulk-result snapshot per forecast hour, ordered by ascending time. */
  hours: Array<{
    timestamp: Date;
    layers: OpenMeteoBulkResult;
  }>;
  fetchedAt: number;
  uvBounds: [number, number, number, number];
  model: string;
  /** Optional DEM image carried forward from FusionEngine.run. */
  demImage?: HTMLImageElement | HTMLCanvasElement;
  demMax?: number;
  lapseRatePerM?: number;
}

function nearestHourUtc(): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function toIsoHour(d: Date): string {
  return d.toISOString().slice(0, 13) + ':00';
}

async function fetchPointHours(
  lat: number, lon: number, start: Date, end: Date, signal: AbortSignal | undefined,
): Promise<HourPointResult[] | null> {
  const url =
    `https://api.brightsky.dev/weather?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}` +
    `&date=${encodeURIComponent(toIsoHour(start))}&last_date=${encodeURIComponent(toIsoHour(end))}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { weather?: WeatherEntry[] };
    if (!json.weather) return null;
    return json.weather.map((w) => ({
      temperature: w.temperature ?? null,
      // /weather wind_speed is km/h — convert to m/s
      wind_speed: w.wind_speed != null ? w.wind_speed / 3.6 : null,
      wind_direction: w.wind_direction ?? null,
      cloud_cover: w.cloud_cover ?? null,
      precipitation: w.precipitation ?? null,
    }));
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return null;
  }
}

/** Run `tasks` with at most `limit` concurrent in-flight promises. */
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

/**
 * Fetch a multi-hour forecast for every grid point in one API call per point.
 * Returns a list of per-hour bulk results; the MapView keeps these in memory
 * and just hands the right one to the layers when the forecast slider moves.
 */
export async function fetchDwdForecast(options: DwdBulkOptions = {}): Promise<DwdForecastResult> {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const cols = options.cols ?? 12;
  const rows = options.rows ?? 10;
  const total = cols * rows;
  const hours = Math.max(1, options.hours ?? 24);
  const layers = options.layers ?? ['wind', 'temperature', 'clouds', 'precipitation'];

  const wantWind = layers.includes('wind');
  const wantTemp = layers.includes('temperature');
  const wantClouds = layers.includes('clouds');
  const wantPrecip = layers.includes('precipitation');

  const lats: number[] = new Array(total);
  const lngs: number[] = new Array(total);
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat;
      lngs[k] = lng;
    }
  }

  const start = nearestHourUtc();
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  const indices = Array.from({ length: total }, (_, i) => i);
  const responses = await pMap(
    indices,
    (k) => fetchPointHours(lats[k], lngs[k], start, end, options.signal),
    options.concurrency ?? 8,
    options.signal,
  );

  // Find the maximum number of returned hour entries (should be `hours`)
  const usableHours = Math.min(
    hours,
    Math.max(0, ...responses.map((r) => r?.length ?? 0)),
  );

  const uvBounds: [number, number, number, number] = [
    lngToEquiX(bounds.lngMin),
    latToEquiY(bounds.latMax),
    lngToEquiX(bounds.lngMax),
    latToEquiY(bounds.latMin),
  ];
  const fetchedAt = Date.now();
  const model = 'dwd_mosmix';
  const tempRange = options.temperatureRange ?? { min: -20, max: 40 };

  const hoursOut: DwdForecastResult['hours'] = [];
  for (let h = 0; h < usableHours; h++) {
    const timestamp = new Date(start.getTime() + h * 60 * 60 * 1000);
    const out: OpenMeteoBulkResult = {};

    if (wantWind) {
      const us = new Float32Array(total);
      const vs = new Float32Array(total);
      let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
      for (let k = 0; k < total; k++) {
        const w = responses[k]?.[h];
        const speed = w?.wind_speed ?? 0;
        const dir = w?.wind_direction ?? 0;
        const r = (dir * Math.PI) / 180;
        const u = -speed * Math.sin(r);
        const v = -speed * Math.cos(r);
        us[k] = u; vs[k] = v;
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
      if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
      if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
      const img = await encodeTwoChannelPng(cols, rows, us, vs, uMin, uMax, vMin, vMax);
      const wind: WindGridResult = {
        image: img, width: cols, height: rows,
        uMin, uMax, vMin, vMax,
        uvBounds, fetchedAt: timestamp.getTime(), model,
      };
      out.wind = wind;
    }

    if (wantTemp) {
      const values = new Float32Array(total);
      const mask = new Uint8Array(total);
      for (let k = 0; k < total; k++) {
        const t = responses[k]?.[h]?.temperature ?? null;
        values[k] = t ?? 0;
        mask[k] = t == null ? 0 : 255;
      }
      const img = await encodeOneChannelPng(cols, rows, values, mask, tempRange.min, tempRange.max);
      const temp: ScalarGridResult = {
        image: img, width: cols, height: rows,
        vMin: tempRange.min, vMax: tempRange.max,
        uvBounds, fetchedAt: timestamp.getTime(), model, variable: 'temperature_2m',
      };
      out.temperature = temp;
    }

    if (wantClouds) {
      const cov = new Float32Array(total);
      const mask = new Uint8Array(total);
      for (let k = 0; k < total; k++) {
        const c = responses[k]?.[h]?.cloud_cover;
        cov[k] = c ?? 0;
        mask[k] = c == null ? 0 : 255;
      }
      const img = await encodeThreeChannelPng(cols, rows, cov, cov, cov, mask);
      const clouds: CloudGridResult = {
        image: img, width: cols, height: rows,
        uvBounds, fetchedAt: timestamp.getTime(), model,
        vMin: 0, vMax: 100,
      };
      out.clouds = clouds;
    }

    if (wantPrecip) {
      // Precipitation in mm per hour. 10 mm/h is already very heavy rain, so
      // we normalise against a 10 mm full-scale for color mapping.
      const PRECIP_MAX = 10;
      const values = new Float32Array(total);
      const mask = new Uint8Array(total);
      for (let k = 0; k < total; k++) {
        const p = responses[k]?.[h]?.precipitation;
        values[k] = p ?? 0;
        // mark a point as "have data" if the API delivered any other variable
        // for it; precipitation is often 0 (clear) but that's still valid data
        const any = responses[k]?.[h];
        mask[k] = any && (any.temperature != null || any.cloud_cover != null || any.wind_speed != null) ? 255 : 0;
      }
      const img = await encodeOneChannelPng(cols, rows, values, mask, 0, PRECIP_MAX);
      const precip: ScalarGridResult = {
        image: img, width: cols, height: rows,
        vMin: 0, vMax: PRECIP_MAX,
        uvBounds, fetchedAt: timestamp.getTime(), model, variable: 'precipitation',
      };
      // Stash on the result under a custom key via assertion since the
      // OpenMeteoBulkResult shape doesn't have a `precipitation` slot.
      (out as OpenMeteoBulkResult & { precipitation?: ScalarGridResult }).precipitation = precip;
    }

    hoursOut.push({ timestamp, layers: out });
  }

  return { hours: hoursOut, fetchedAt, uvBounds, model };
}

async function encodeTwoChannelPng(
  cols: number, rows: number,
  us: Float32Array, vs: Float32Array,
  uMin: number, uMax: number, vMin: number, vMax: number,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < us.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    imageData.data[idx + 0] = Math.round(((us[k] - uMin) / (uMax - uMin)) * 255);
    imageData.data[idx + 1] = Math.round(((vs[k] - vMin) / (vMax - vMin)) * 255);
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function encodeOneChannelPng(
  cols: number, rows: number, values: Float32Array,
  mask: Uint8Array,
  vMin: number, vMax: number,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < values.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    const t = (values[k] - vMin) / (vMax - vMin);
    imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round(t * 255)));
    imageData.data[idx + 1] = 0;
    imageData.data[idx + 2] = 0;
    imageData.data[idx + 3] = mask[k];
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function encodeThreeChannelPng(
  cols: number, rows: number,
  low: Float32Array, mid: Float32Array, high: Float32Array,
  mask: Uint8Array,
): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cols, rows);
  for (let k = 0; k < low.length; k++) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const y = rows - 1 - j;
    const idx = (y * cols + i) * 4;
    imageData.data[idx + 0] = Math.max(0, Math.min(255, Math.round((low[k]  / 100) * 255)));
    imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.round((mid[k]  / 100) * 255)));
    imageData.data[idx + 2] = Math.max(0, Math.min(255, Math.round((high[k] / 100) * 255)));
    imageData.data[idx + 3] = mask[k];
  }
  ctx.putImageData(imageData, 0, 0);
  return loadDataUrl(canvas.toDataURL('image/png'));
}

async function loadDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('PNG decode failed'));
    img.src = dataUrl;
  });
  return img;
}
