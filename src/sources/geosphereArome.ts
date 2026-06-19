/**
 * GeoSphere Austria — AROME-AT (forecast nwp-v1-1h-2500m).
 *
 * AROME at 2.5 km / 1 h is the reference deterministic NWP for Austria and
 * has an unusually generous coverage box that includes most of DACH:
 *   lat 42.98 .. 51.82, lng 5.50 .. 22.10 → all of AT, CH, southern DE
 *   (north DE above ~52 °N is outside — falls back to MOSMIX).
 *
 * Forecast horizon: 60 h, hourly. Variables we use:
 *   t2m   — 2 m temperature, °C (direct)
 *   u10m  — 10 m east-wind component, m/s   (direct U!)
 *   v10m  — 10 m north-wind component, m/s  (direct V!)
 *   tcc   — total cloud cover, 0..1 (multiply by 100)
 *   rr_acc — accumulated precipitation since forecast start, mm (we diff
 *           consecutive hours to get hourly precipitation)
 *
 * Same API conventions as INCA: raw-comma lat_lon list, ≈ 5 req/s rate limit,
 * boundary points get rejected with HTTP 400 if any sit outside the bbox.
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';
import { correctCloudBias } from './cloudBias';

/**
 * AROME's published bbox per /metadata. We sit a comfortable margin inside
 * so multi-point requests never trip the boundary-rejection rule that
 * forfeits the whole batch.
 */
const AROME_BOUNDS: ForecastBounds = {
  lngMin: 6.0,
  lngMax: 17.0,
  latMin: 45.7,
  latMax: 51.5,
};

interface AromeFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    parameters: {
      [key: string]: { name: string; unit: string; data: Array<number | null> };
    };
  };
}
interface AromeResponse {
  reference_time: string;
  timestamps: string[];
  features: AromeFeature[];
}

export interface AromeOptions {
  cols?: number;
  rows?: number;
  hours?: number;
  signal?: AbortSignal;
}

export async function fetchGeoSphereAromeGrid(options: AromeOptions = {}): Promise<ForecastGrid> {
  const cols = options.cols ?? 12;
  const rows = options.rows ?? 7;
  const hours = Math.max(1, options.hours ?? 24);
  const total = cols * rows;

  const lats = new Array<number>(total);
  const lngs = new Array<number>(total);
  for (let j = 0; j < rows; j++) {
    const lat = AROME_BOUNDS.latMin + (j / Math.max(1, rows - 1)) * (AROME_BOUNDS.latMax - AROME_BOUNDS.latMin);
    for (let i = 0; i < cols; i++) {
      const lng = AROME_BOUNDS.lngMin + (i / Math.max(1, cols - 1)) * (AROME_BOUNDS.lngMax - AROME_BOUNDS.lngMin);
      const k = j * cols + i;
      lats[k] = lat;
      lngs[k] = lng;
    }
  }

  const partLatLon = new Array<string>(total);
  for (let k = 0; k < total; k++) {
    partLatLon[k] = `lat_lon=${lats[k].toFixed(3)},${lngs[k].toFixed(3)}`;
  }
  const url =
    'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v1-1h-2500m' +
    `?parameters=t2m,u10m,v10m,tcc,rr_acc&${partLatLon.join('&')}`;
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`GeoSphere AROME error ${res.status}`);
  const json = (await res.json()) as AromeResponse;

  const timestamps = json.timestamps.map((s) => new Date(s));
  const usableHours = Math.min(hours, timestamps.length);

  // Index by closest (lat,lng) to handle native-grid snapping.
  const featureFor = (lat: number, lng: number): AromeFeature | null => {
    let best: AromeFeature | null = null;
    let bestD = Infinity;
    for (const f of json.features) {
      const [flng, flat] = f.geometry.coordinates;
      const d = (flat - lat) ** 2 + (flng - lng) ** 2;
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  };

  const times: Date[] = [];
  const points: ForecastHourPoint[][] = [];
  for (let h = 0; h < usableHours; h++) {
    times.push(timestamps[h]);
    const arr: ForecastHourPoint[] = new Array(total);
    for (let k = 0; k < total; k++) {
      const f = featureFor(lats[k], lngs[k]);
      const p = f?.properties.parameters;
      const t = p?.t2m?.data?.[h] ?? null;
      const u = p?.u10m?.data?.[h] ?? null;
      const v = p?.v10m?.data?.[h] ?? null;
      const tccRaw = p?.tcc?.data?.[h];
      // tcc is 0..1; scale to 0..100, then satellite-bias-correct (see
      // ./cloudBias.ts — Cirrus haze inflates the 0-50 % band the most).
      const total100 = correctCloudBias(tccRaw != null ? tccRaw * 100 : null);
      // Hourly precip = diff of accumulated rr
      const accNow = p?.rr_acc?.data?.[h] ?? null;
      const accPrev = h > 0 ? p?.rr_acc?.data?.[h - 1] ?? null : 0;
      const precipPerHour = accNow != null && accPrev != null
        ? Math.max(0, accNow - accPrev)
        : null;
      // Cloud-cover layered split — proportional 55 / 30 / 15 of (corrected)
      // total so alpha-combined render matches the bias-corrected tcc.
      let cl: number | null = null, cm: number | null = null, ch: number | null = null;
      if (total100 != null) {
        cl = total100 * 0.55;
        cm = total100 * 0.30;
        ch = total100 * 0.15;
      }
      arr[k] = {
        temperature: t,
        u,
        v,
        cloudLow: cl,
        cloudMid: cm,
        cloudHigh: ch,
        precipitation: precipPerHour,
        model: 'arome_at',
      };
    }
    points.push(arr);
  }

  return {
    cols,
    rows,
    bounds: AROME_BOUNDS,
    times,
    points,
    fetchedAt: Date.now(),
  };
}
