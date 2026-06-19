/**
 * IPMA Open Data (Portugal) — live station observations.
 *
 * 222 automatic stations across mainland Portugal + Madeira + Azores. Two
 * files cover everything:
 *   - stations.json: GeoJSON FeatureCollection with id + lat/lng per station
 *   - observations.json: time-keyed dict, last 24 h, ~1 MB
 *
 * Both endpoints return `Access-Control-Allow-Origin: *`. CC-BY 4.0,
 * commercial OK, no API key.
 *
 * Wind direction is an integer code 1..8 (N, NE, E, SE, S, SW, W, NW),
 * not degrees. We translate to standard meteorological bearings.
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const STATIONS_URL = 'https://api.ipma.pt/open-data/observation/meteorology/stations/stations.json';
const OBSERVATIONS_URL = 'https://api.ipma.pt/open-data/observation/meteorology/stations/observations.json';

interface StationFeature {
  geometry: { coordinates: [number, number] };
  properties: { idEstacao: number; localEstacao: string };
}
interface IpmaObs {
  temperatura?: number | null;
  intensidadeVento?: number | null;   // m/s
  idDireccVento?: number | null;       // 1..8 octant code
  precAcumulada?: number | null;       // mm, accumulated
  humidade?: number | null;            // %
}

const WIND_DIR_DEG: Record<number, number> = {
  1: 0, 2: 45, 3: 90, 4: 135, 5: 180, 6: 225, 7: 270, 8: 315,
};

let stationsCache: { fetchedAt: number; map: Map<string, { lat: number; lng: number }> } | null = null;

async function loadStations(signal?: AbortSignal): Promise<Map<string, { lat: number; lng: number }>> {
  if (stationsCache && Date.now() - stationsCache.fetchedAt < 3600_000) return stationsCache.map;
  const res = await fetch(STATIONS_URL, { signal });
  if (!res.ok) throw new Error(`IPMA stations ${res.status}`);
  const features = (await res.json()) as StationFeature[];
  const map = new Map<string, { lat: number; lng: number }>();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(String(f.properties.idEstacao), { lat, lng });
  }
  stationsCache = { fetchedAt: Date.now(), map };
  return map;
}

export interface IpmaOptions { signal?: AbortSignal }

export async function fetchIpmaCurrentGrid(options: IpmaOptions = {}): Promise<ForecastGrid> {
  const [stations, obsRes] = await Promise.all([
    loadStations(options.signal),
    fetch(OBSERVATIONS_URL, { signal: options.signal }),
  ]);
  if (!obsRes.ok) throw new Error(`IPMA observations ${obsRes.status}`);
  const obs = (await obsRes.json()) as Record<string, Record<string, IpmaObs | null>>;

  // Pick the most recent timestamp that actually has data.
  const timestamps = Object.keys(obs).sort();
  let frame: Record<string, IpmaObs | null> | null = null;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const f = obs[timestamps[i]];
    if (f && Object.values(f).some((v) => v && v.temperatura != null)) {
      frame = f;
      break;
    }
  }
  if (!frame) {
    return {
      cols: 1, rows: 1,
      bounds: { lngMin: -10, lngMax: -6, latMin: 36, latMax: 42 },
      times: [new Date()], points: [[]], fetchedAt: Date.now(),
    };
  }

  const points: ForecastHourPoint[] = [];
  for (const [sid, o] of Object.entries(frame)) {
    if (!o) continue;
    const geo = stations.get(sid);
    if (!geo) continue;
    const t = o.temperatura ?? null;
    const ff = o.intensidadeVento ?? null;
    const ddCode = o.idDireccVento ?? null;
    let u: number | null = null;
    let v: number | null = null;
    if (ff != null && ff > 0 && ddCode != null && ddCode in WIND_DIR_DEG) {
      const rad = (WIND_DIR_DEG[ddCode] * Math.PI) / 180;
      u = -ff * Math.sin(rad);
      v = -ff * Math.cos(rad);
    }
    // precAcumulada is accumulated since 00 UTC — for our per-hour layer this
    // is a reasonable proxy when observations are spaced hourly.
    const precip = o.precAcumulada != null && o.precAcumulada >= 0 ? o.precAcumulada : null;
    points.push({
      temperature: t,
      u, v,
      cloudLow: null, cloudMid: null, cloudHigh: null,
      precipitation: precip,
      model: 'ipma',
      lat: geo.lat,
      lng: geo.lng,
      // IPMA stations.json doesn't publish elevation; setting 0 means the
      // lapse-rate regression can't use these samples — but PT terrain is
      // mostly low enough that this isn't critical.
      elev: 0,
    });
  }

  const bounds: ForecastBounds = { lngMin: -10, lngMax: -6, latMin: 36, latMax: 42 };
  return {
    cols: points.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [points],
    fetchedAt: Date.now(),
  };
}
