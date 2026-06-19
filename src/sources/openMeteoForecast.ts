/**
 * Open-Meteo `best_match` hourly forecast — high-resolution multi-model.
 *
 * Why this is superior to BrightSky/MOSMIX point forecasts:
 *  - `best_match` routes each location automatically to the best available
 *    high-res NWP model (ICON-D2 2.1 km for DE, ICON-CH1 1 km for CH,
 *    AROME-AT 2.5 km for AT, ECMWF IFS HRES for the rest of Europe).
 *  - One HTTP request returns the full grid × 24 forecast hours × all
 *    variables (instead of 120 point-calls of BrightSky).
 *  - Native cloud_cover_low / mid / high (BrightSky only has total cover).
 *  - Free for non-commercial usage; for production we'd upgrade to the
 *    Standard tier or self-host (server-code AGPLv3).
 */

export interface ForecastBounds {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

/**
 * Pan-European bounds. We keep the const named DACH_BOUNDS for backwards
 * compatibility, but the actual extent covers the whole continent — DACH
 * remains the high-quality core (DWD + GeoSphere + MeteoSwiss), the
 * surrounding countries are filled in via national open-data APIs that
 * expose CORS-friendly endpoints (SMHI, DMI, IPMA — see src/sources/).
 */
export const DACH_BOUNDS: ForecastBounds = {
  lngMin: -15,
  lngMax: 30,
  latMin: 35,
  latMax: 72,
};

export interface ForecastHourPoint {
  /** Air temperature 2 m, °C. */
  temperature: number | null;
  /** Wind east-component at 10 m, m/s (positive = wind blowing eastward). */
  u: number | null;
  /** Wind north-component at 10 m, m/s (positive = blowing northward). */
  v: number | null;
  /** Max wind gust over the latest reporting interval, m/s (≥ |wind|). */
  gust?: number | null;
  /** Relative humidity at 2 m, %. */
  relativeHumidity?: number | null;
  /** Low cloud cover 0..100. */
  cloudLow: number | null;
  /** Mid cloud cover 0..100. */
  cloudMid: number | null;
  /** High cloud cover 0..100. */
  cloudHigh: number | null;
  /** Total precipitation in this hour, mm. */
  precipitation: number | null;
  /** Per-point Open-Meteo model name (e.g. icon_d2, icon_ch1, ecmwf_ifs). */
  model: string;
  /**
   * Optional non-grid coordinates / elevation. Set by sources that emit
   * irregular point lists (e.g. live DWD stations), in which case the
   * FusionEngine uses these instead of computing lat/lng from grid bounds.
   * The fixed-grid cols/rows of the containing `ForecastGrid` become nominal.
   */
  lat?: number;
  lng?: number;
  elev?: number;
}

export interface ForecastGrid {
  cols: number;
  rows: number;
  bounds: ForecastBounds;
  /** Timestamps for each forecast hour (ascending UTC). */
  times: Date[];
  /** points[h][k] where k = j * cols + i (j=0 → south, i=0 → west). */
  points: ForecastHourPoint[][];
  fetchedAt: number;
}

interface OpenMeteoLoc {
  latitude: number;
  longitude: number;
  hourly?: Record<string, Array<number | null>>;
  hourly_units?: Record<string, string>;
  /**
   * The model field is only present when models=best_match is requested with
   * the special model attribution flag; in practice we infer the routing
   * server-side. We tag every point with the model name we requested so the
   * fusion-engine can weight it accordingly.
   */
}

export interface ForecastOptions {
  bounds?: ForecastBounds;
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
  /** Pin to a specific model. Default 'best_match' (recommended for DACH). */
  model?: 'best_match' | 'icon_seamless' | 'icon_d2' | 'icon_eu' | 'ecmwf_ifs025';
}

/**
 * Fetch a multi-hour forecast grid in ONE HTTP call by submitting all (lat,lng)
 * coords as a comma-list. Open-Meteo accepts up to ~1000 points per request.
 */
export async function fetchForecastGrid(options: ForecastOptions = {}): Promise<ForecastGrid> {
  const bounds = options.bounds ?? DACH_BOUNDS;
  const cols = options.cols ?? 20;
  const rows = options.rows ?? 16;
  const hours = options.hours ?? 24;
  const model = options.model ?? 'best_match';
  const total = cols * rows;

  const lats: string[] = new Array(total);
  const lngs: string[] = new Array(total);
  for (let j = 0; j < rows; j++) {
    const lat = bounds.latMin + (j / (rows - 1)) * (bounds.latMax - bounds.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = bounds.lngMin + (i / (cols - 1)) * (bounds.lngMax - bounds.lngMin);
      const k = j * cols + i;
      lats[k] = lat.toFixed(3);
      lngs[k] = lng.toFixed(3);
    }
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lats.join(','));
  url.searchParams.set('longitude', lngs.join(','));
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'precipitation',
    ].join(','),
  );
  url.searchParams.set('models', model);
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('cell_selection', 'nearest');
  url.searchParams.set('forecast_hours', String(hours));
  url.searchParams.set('timezone', 'UTC');

  const res = await fetch(url.toString(), { signal: options.signal });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);

  const raw = (await res.json()) as OpenMeteoLoc | OpenMeteoLoc[];
  const locations: OpenMeteoLoc[] = Array.isArray(raw) ? raw : [raw];
  if (locations.length !== total) {
    throw new Error(`Open-Meteo returned ${locations.length} points, expected ${total}`);
  }

  // The first location's `hourly.time` is identical across all locations.
  const firstHourly = (locations[0].hourly ?? {}) as Record<string, Array<number | string | null>>;
  const timeArr = (firstHourly.time as Array<string | null>) ?? [];
  const times = timeArr.map((s) => new Date((s ?? '') + 'Z'));

  const fetchedAt = Date.now();
  const usableHours = Math.min(hours, times.length);
  const pointsByHour: ForecastHourPoint[][] = new Array(usableHours);

  for (let h = 0; h < usableHours; h++) {
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const loc = locations[k];
      const hh = (loc.hourly ?? {}) as Record<string, Array<number | null>>;
      const speed = hh.wind_speed_10m?.[h];
      const dir = hh.wind_direction_10m?.[h];
      let u: number | null = null;
      let v: number | null = null;
      if (speed != null && dir != null) {
        const r = (dir * Math.PI) / 180;
        // meteorological direction = where wind comes FROM; flow vector points opposite
        u = -speed * Math.sin(r);
        v = -speed * Math.cos(r);
      }
      arr[k] = {
        temperature: hh.temperature_2m?.[h] ?? null,
        u,
        v,
        cloudLow: hh.cloud_cover_low?.[h] ?? null,
        cloudMid: hh.cloud_cover_mid?.[h] ?? null,
        cloudHigh: hh.cloud_cover_high?.[h] ?? null,
        precipitation: hh.precipitation?.[h] ?? null,
        model,
      };
    }
    pointsByHour[h] = arr;
  }

  return {
    cols,
    rows,
    bounds,
    times: times.slice(0, usableHours),
    points: pointsByHour,
    fetchedAt,
  };
}
