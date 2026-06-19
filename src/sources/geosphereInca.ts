/**
 * GeoSphere Austria — INCA Nowcast (forecast-v1 nowcast-v1-15min-1km).
 *
 * INCA is the leading alpine nowcasting system: 1 km / 15 min resolution,
 * ~3 h forecast horizon, covers AT and the immediate alpine surroundings.
 * Free, CC BY 4.0, commercial OK; no API key required.
 *
 * Variables we use (INCA does NOT publish cloud cover — only precipitation,
 * temperature, wind, humidity):
 *   t2m  — 2-m air temperature, °C
 *   rr   — precipitation sum per 15-min step, kg/m² (= mm)
 *   ff   — 10-m wind speed, m/s
 *   dd   — 10-m wind direction, ° meteorological (from)
 *
 * Output is in our shared `ForecastGrid` shape, so the FusionEngine ingests
 * it the same way as Open-Meteo / BrightSky. Forecast frames are 15-min,
 * we resample to whole hours so it lines up with the slider.
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

/**
 * INCA's valid extent per /metadata is [45.503..49.478, 8.098..17.742].
 * Points exactly ON the boundary (e.g. 49.5) are rejected as out-of-bounds
 * and the API refuses the *whole* multi-point request. We sit a margin inside.
 */
const INCA_BOUNDS: ForecastBounds = {
  lngMin: 8.5,
  lngMax: 17.4,
  latMin: 45.7,
  latMax: 49.3,
};

interface IncaFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    parameters: {
      [key: string]: { name: string; unit: string; data: Array<number | null> };
    };
  };
}

interface IncaResponse {
  reference_time: string;
  timestamps: string[];
  features: IncaFeature[];
}

export interface IncaOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

/**
 * Fetch the INCA nowcast as a `ForecastGrid`. INCA only covers AT/alpine, so
 * the FusionEngine should ingest this with a high regional weight inside the
 * INCA_BOUNDS box.
 */
export async function fetchGeoSphereIncaGrid(options: IncaOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 12;
  const rows = options.rows ?? 8;
  const hours = Math.max(1, options.hours ?? 3);
  const total = cols * rows;

  // Build the lat/lng grid covering INCA's extent.
  const lats = new Array<number>(total);
  const lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = INCA_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (INCA_BOUNDS.latMax - INCA_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = INCA_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (INCA_BOUNDS.lngMax - INCA_BOUNDS.lngMin);
      const k = j * cols + i;
      lats[k] = lat;
      lngs[k] = lng;
    }
  }

  // Build URL manually — URLSearchParams would percent-encode the commas in
  // lat_lon=LAT,LON, doubling the URL length. GeoSphere's WSGI rejects URLs
  // above ~2 kB with HTTP 400. Raw commas are accepted (they're "sub-delims"
  // in RFC 3986 and the API documents this form).
  const partLatLon = new Array<string>(total);
  for (let k = 0; k < total; k++) {
    partLatLon[k] = `lat_lon=${lats[k].toFixed(3)},${lngs[k].toFixed(3)}`;
  }
  const url =
    'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km' +
    `?parameters=t2m,rr,ff,dd&${partLatLon.join('&')}`;
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`GeoSphere INCA error ${res.status}`);
  const json = (await res.json()) as IncaResponse;

  // INCA timestamps are 15-min steps starting at refTime+15min. Pick the
  // frame index that's closest to each whole-hour offset we need.
  const refTime = new Date(json.reference_time);
  const timestamps = json.timestamps.map((s) => new Date(s));
  const hourFrameIndex: number[] = [];
  for (let h = 0; h < hours; h++) {
    const target = refTime.getTime() + h * 3600 * 1000;
    let best = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const d = Math.abs(timestamps[i].getTime() - target);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    // Skip hours past the forecast horizon (~3 h) — caller can detect by
    // comparing array length after construction.
    hourFrameIndex.push(best);
  }

  // Index features by the (lat,lng) we requested. The API returns coordinates
  // snapped to the native 1 km grid, so we match by closest distance.
  const featureFor = (lat: number, lng: number): IncaFeature | null => {
    let best: IncaFeature | null = null;
    let bestDelta = Infinity;
    for (const f of json.features) {
      const [flng, flat] = f.geometry.coordinates;
      const d = (flat - lat) ** 2 + (flng - lng) ** 2;
      if (d < bestDelta) {
        bestDelta = d;
        best = f;
      }
    }
    return best;
  };

  const points: ForecastHourPoint[][] = [];
  const times: Date[] = [];

  for (let h = 0; h < hourFrameIndex.length; h++) {
    const idx = hourFrameIndex[h];
    if (idx >= timestamps.length) break;
    times.push(new Date(refTime.getTime() + h * 3600 * 1000));
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const f = featureFor(lats[k], lngs[k]);
      const p = f?.properties.parameters;
      const t = p?.t2m?.data?.[idx] ?? null;
      const r = p?.rr?.data?.[idx] ?? null;
      const ff = p?.ff?.data?.[idx] ?? null;
      const dd = p?.dd?.data?.[idx] ?? null;
      let u: number | null = null;
      let v: number | null = null;
      if (ff != null && dd != null) {
        const rad = (dd * Math.PI) / 180;
        u = -ff * Math.sin(rad);
        v = -ff * Math.cos(rad);
      }
      // INCA's rr is per 15 min — multiply ×4 to get a comparable mm/h figure
      // (matches what BrightSky / Open-Meteo deliver in `precipitation`).
      const rrPerHour = r != null ? r * 4 : null;
      arr[k] = {
        temperature: t,
        u,
        v,
        // INCA has no cloud-cover variable
        cloudLow: null,
        cloudMid: null,
        cloudHigh: null,
        precipitation: rrPerHour,
        model: 'inca',
      };
    }
    points.push(arr);
  }

  return {
    cols,
    rows,
    bounds: INCA_BOUNDS,
    times,
    points,
    fetchedAt: Date.now(),
  };
}
