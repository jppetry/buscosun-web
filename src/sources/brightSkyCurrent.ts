/**
 * BrightSky `/current_weather` — live DWD station observations (~1500 sites,
 * updated every 10 minutes). Crucial for "hour 0" accuracy because MOSMIX is a
 * 3-h-update model forecast; real measurements can diverge ±3-5 °C in
 * inversion lagen, sea breezes, and other local effects the model can't see.
 *
 * Coverage: Germany only (DWD network). AT/CH gaps are filled by INCA's
 * observation-driven analyses + MeteoSwiss STAC (planned).
 *
 * Each result point uses the station's *actual* lat/lng (not the grid query
 * point) and the station's published `height` so the FusionEngine's
 * elevation-aware temperature IDW gets the correct altitude — DEM-sampling
 * the lat/lng would average several pixels and bias the lapse-rate reduction.
 */

import type {
  ForecastBounds,
  ForecastGrid,
  ForecastHourPoint,
} from './openMeteoForecast';

interface CurrentWeatherEntry {
  temperature?: number | null;
  wind_speed_10?: number | null;       // km/h
  wind_direction_10?: number | null;   // °
  wind_gust_speed_10?: number | null;  // km/h, max in last 10 min
  relative_humidity?: number | null;   // %
  cloud_cover?: number | null;         // %
  precipitation_10?: number | null;    // mm in last 10 min
  timestamp: string;
}
interface SourceEntry {
  id: number;
  lat: number;
  lon: number;
  height: number;
  station_name?: string;
}
interface CurrentWeatherResponse {
  weather?: CurrentWeatherEntry;
  sources?: SourceEntry[];
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

export interface BrightSkyCurrentOptions {
  bounds?: ForecastBounds;
  cols?: number;
  rows?: number;
  signal?: AbortSignal;
}

/**
 * Returns a 1-hour ForecastGrid (the "now" frame) containing one
 * ForecastHourPoint per UNIQUE DWD station hit by the lat/lng query grid.
 * Each point carries its real station lat/lng/height via the override fields,
 * which the FusionEngine consumes instead of computing from grid bounds.
 */
export async function fetchBrightSkyCurrentGrid(
  options: BrightSkyCurrentOptions = {},
): Promise<ForecastGrid> {
  const bounds = options.bounds ?? {
    lngMin: 5.0,
    lngMax: 17.5,
    latMin: 45.5,
    latMax: 55.5,
  };
  const cols = options.cols ?? 10;
  const rows = options.rows ?? 8;

  // DWD-Stationsnetz deckt nur Deutschland ab. Wenn die übergebenen `bounds`
  // bis nach DACH reichen (latMin 45.5 = Italien/Alpen, lngMin 5.0 =
  // Frankreich), erzeugen die Außen-Punkte garantiert HTTP-404 — ein
  // Cold-Start-Sturm aus fehlgeschlagenen Requests. Wir klippen das Probe-Grid
  // daher auf die tatsächliche DWD-Abdeckung (intersect mit `bounds`).
  const DWD = { lngMin: 5.8, lngMax: 15.1, latMin: 47.2, latMax: 55.1 };
  const latMin = Math.max(bounds.latMin, DWD.latMin);
  const latMax = Math.min(bounds.latMax, DWD.latMax);
  const lngMin = Math.max(bounds.lngMin, DWD.lngMin);
  const lngMax = Math.min(bounds.lngMax, DWD.lngMax);

  const probes: Array<{ lat: number; lng: number }> = [];
  for (let j = 0; j < rows; j++) {
    const lat = latMin + (j / Math.max(1, rows - 1)) * (latMax - latMin);
    for (let i = 0; i < cols; i++) {
      const lng = lngMin + (i / Math.max(1, cols - 1)) * (lngMax - lngMin);
      probes.push({ lat, lng });
    }
  }

  // Lower concurrency than MOSMIX (which keeps the BrightSky endpoint saturated
  // with 200+ parallel /weather calls). When both sources share a host pool,
  // /current_weather calls without throttling are often killed by browser
  // connection-limit pressure → drops to 2-3 unique stations.
  const responses = await pMap(
    probes,
    async ({ lat, lng }) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(
            `https://api.brightsky.dev/current_weather?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}`,
            { signal: options.signal },
          );
          if (res.ok) return (await res.json()) as CurrentWeatherResponse;
          if (res.status === 404) return null; // outside DE coverage
          // transient error — retry after short delay
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError') throw err;
        }
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
      return null;
    },
    3,
    options.signal,
  );

  // Dedupe by source_id → unique stations
  const stations = new Map<number, ForecastHourPoint>();
  for (const r of responses) {
    if (!r?.weather || !r.sources?.length) continue;
    const w = r.weather;
    const s = r.sources[0];
    if (stations.has(s.id)) continue;

    let u: number | null = null;
    let v: number | null = null;
    if (w.wind_speed_10 != null && w.wind_direction_10 != null) {
      // BrightSky returns wind_speed_10 in km/h — convert to m/s
      const speedMs = w.wind_speed_10 / 3.6;
      const rad = (w.wind_direction_10 * Math.PI) / 180;
      u = -speedMs * Math.sin(rad);
      v = -speedMs * Math.cos(rad);
    }
    // DWD-Synop cloud_cover is intentionally NOT used as a map-layer source:
    // visual comparison against EUMETSAT MSG satellite + ICON-D2 shows the
    // station feed runs systematically 30-70 percentage-points too pessimistic
    // (Cirrus haze read as overcast, hour-old SYNOP records that lag the sky).
    // We keep the value on the station popup (`fetchDwdStationLive`) so users
    // can still see the raw reading at a specific station, but for the fused
    // cloud raster we rely on MOSMIX which is satellite-consistent.
    const cl: number | null = null;
    const cm: number | null = null;
    const ch: number | null = null;
    // precipitation_10 = mm in last 10 minutes → × 6 = mm/h
    const precipPerHour = w.precipitation_10 != null ? w.precipitation_10 * 6 : null;
    // BrightSky reports gust in km/h, same as wind_speed_10. Convert to m/s.
    const gustMs = w.wind_gust_speed_10 != null ? w.wind_gust_speed_10 / 3.6 : null;

    stations.set(s.id, {
      temperature: w.temperature ?? null,
      u,
      v,
      gust: gustMs,
      relativeHumidity: w.relative_humidity ?? null,
      cloudLow: cl,
      cloudMid: cm,
      cloudHigh: ch,
      precipitation: precipPerHour,
      model: 'dwd_obs',
      lat: s.lat,
      lng: s.lon,
      elev: s.height,
    });
  }

  const uniquePoints = Array.from(stations.values());
  // Wrap as a 1×N grid; cols/rows are nominal here, the engine ignores them
  // for sources whose ForecastHourPoint carries lat/lng overrides.
  return {
    cols: uniquePoints.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [uniquePoints],
    fetchedAt: Date.now(),
  };
}
