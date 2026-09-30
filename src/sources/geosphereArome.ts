/**
 * GeoSphere Austria — das NWP-Stützgitter der Rasterfusion: C-LAEF 1 km (`nwp-v2-1h-1km`), bis zum
 * 2026-11-04 wahlweise AROME-AT 2,5 km (`nwp-v1-1h-2500m`, `?nwp=v1`). Phase GS, `audit/geosphere-v2.md`.
 *
 * Beide Datensätze haben eine großzügige Abdeckung, die den größten Teil von DACH einschließt:
 *   v1 lat 42.98 .. 51.82, lng 5.50 .. 22.10 · v2 lat 43.00 .. 51.50, lng 5.03 .. 22.57
 *   → ganz AT und CH, Süddeutschland (Norddeutschland oberhalb ~51,5 °N liegt außerhalb — MOSMIX).
 *
 * Horizont 60 h, stündlich, Läufe alle 3 h. Die Größen und ihre Bedeutung je Version stehen EINMAL in
 * `geosphereNwp.ts` (`readGeoSphereHour`): T, u, v, Gesamtbewölkung in %, Stundensumme Niederschlag.
 *
 * Same API conventions as INCA: raw-comma lat_lon list, ≈ 5 req/s rate limit,
 * boundary points get rejected with HTTP 400 if any sit outside the bbox.
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';
import { correctCloudBias } from './cloudBias';
import { geoSphereNwpVersion, geoSphereNwpUrl, readGeoSphereHour, GEOSPHERE_NWP_SOURCE, GEOSPHERE_NWP_DATASET } from './geosphereNwp';

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
  const version = geoSphereNwpVersion();
  const url = geoSphereNwpUrl(version, partLatLon, true);
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`GeoSphere ${GEOSPHERE_NWP_DATASET[version]} error ${res.status}`);
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
      const g = f ? readGeoSphereHour(f.properties.parameters, h, version) : null;
      const t = g?.temperature ?? null;
      const u = g?.u ?? null;
      const v = g?.v ?? null;
      // Gesamtbewölkung in %, dann Satelliten-Bias-Korrektur (./cloudBias.ts — Cirrus-Dunst bläht das
      // Band 0–50 % am stärksten auf).
      const total100 = correctCloudBias(g?.cloudTotalPct ?? null);
      // Stundensumme (v1: Differenz der Laufsumme, bei Stunde 0 zur Summe 0 wie bisher; v2: `tp`, Stunde 0 ohne Wert).
      const precipPerHour = g?.precipitation ?? null;
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
        model: GEOSPHERE_NWP_SOURCE[version],
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
