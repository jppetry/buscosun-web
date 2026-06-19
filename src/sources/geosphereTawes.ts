/**
 * GeoSphere Austria — TAWES live station observations (10-min updates).
 *
 * 271 automatic stations across Austria + a few in neighbouring alpine areas
 * (DE Berchtesgaden, IT South Tyrol). Counterpart to DWD's BrightSky
 * /current_weather for AT. Each station carries lat/lon/altitude in the
 * metadata so the fusion engine's elevation-aware temperature IDW works
 * correctly out of the box.
 *
 * API:
 *   /v1/station/current/tawes-v1-10min/metadata  → station list (lat/lon/alt)
 *   /v1/station/current/tawes-v1-10min            → live obs (need station_ids)
 *
 * Two-call pattern (metadata is semi-static and can be cached for an hour).
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const META_URL = 'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';
const CURRENT_URL = 'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';

interface StationMeta {
  id: string;
  lat: number;
  lon: number;
  altitude: number;
  is_active: boolean;
  name?: string;
}
interface CurrentFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    parameters: {
      [key: string]: { data: Array<number | null> };
    };
    station: string;
  };
}

let metaCache: { fetchedAt: number; stations: StationMeta[] } | null = null;
async function loadStationsList(): Promise<StationMeta[]> {
  // Cache stations for an hour — they don't change between forecast refreshes
  if (metaCache && Date.now() - metaCache.fetchedAt < 3600_000) return metaCache.stations;
  const res = await fetch(META_URL);
  if (!res.ok) throw new Error(`TAWES metadata ${res.status}`);
  const json = (await res.json()) as { stations: StationMeta[] };
  const active = (json.stations ?? []).filter(
    (s) => s.is_active && Number.isFinite(s.lat) && Number.isFinite(s.lon),
  );
  metaCache = { fetchedAt: Date.now(), stations: active };
  return active;
}

export interface TawesOptions {
  /** Cap station count (URL length safety). Default 200, plenty for AT. */
  maxStations?: number;
  signal?: AbortSignal;
}

/**
 * Returns a 1-hour ForecastGrid (the "now" frame) with one
 * ForecastHourPoint per active TAWES station carrying lat/lng/elev overrides.
 */
export async function fetchTawesCurrentGrid(options: TawesOptions = {}): Promise<ForecastGrid> {
  const stations = await loadStationsList();
  const cap = options.maxStations ?? 200;
  const slice = stations.slice(0, cap);
  if (!slice.length) {
    return {
      cols: 1, rows: 1,
      bounds: { lngMin: 9, lngMax: 17, latMin: 46, latMax: 49 },
      times: [new Date()], points: [[]], fetchedAt: Date.now(),
    };
  }

  // Raw-comma form — URLSearchParams would %-encode commas and bloat the URL
  // past the 2 kB host limit (the API rejects with HTTP 400).
  const ids = slice.map((s) => s.id).join(',');
  // DD/FF: wind direction + speed mean; FFX: max gust (10-min); RF: relative
  // humidity (%). Cloud cover is not in the 10-min TAWES feed.
  const url = `${CURRENT_URL}?parameters=DD,FF,FFX,RF,RR,TL&station_ids=${ids}`;
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`TAWES current ${res.status}`);
  const json = (await res.json()) as { features: CurrentFeature[] };

  // Build a quick map from station_id → meta so we can attach lat/lng/elev.
  const metaById = new Map<string, StationMeta>();
  for (const s of stations) metaById.set(s.id, s);

  // The GeoSphere TAWES current endpoint returns each parameter's `data` as
  // a 2-element array spanning the latest two 10-min slots. For most stations
  // the freshest reading sits in slot 1 (and slot 0 is null); a small minority
  // delivers it the other way round. Picking only `data[0]` (as the original
  // adapter did) drops the temperature/wind/precip for 99 % of stations.
  // Take the first finite element instead so both slot layouts work.
  const pickLatest = (arr: Array<number | null> | undefined): number | null => {
    if (!arr) return null;
    for (const v of arr) if (v != null && Number.isFinite(v)) return v;
    return null;
  };
  const points: ForecastHourPoint[] = [];
  for (const f of json.features ?? []) {
    const meta = metaById.get(f.properties.station);
    if (!meta) continue;
    const p = f.properties.parameters;
    const dd = pickLatest(p.DD?.data);
    const ff = pickLatest(p.FF?.data);
    const ffx = pickLatest(p.FFX?.data);     // max gust last 10 min, m/s
    const rf = pickLatest(p.RF?.data);       // relative humidity, %
    const rr = pickLatest(p.RR?.data);
    const tl = pickLatest(p.TL?.data);
    let u: number | null = null;
    let v: number | null = null;
    if (ff != null && dd != null) {
      const rad = (dd * Math.PI) / 180;
      u = -ff * Math.sin(rad);
      v = -ff * Math.cos(rad);
    }
    // RR is 10-min precip → × 6 = mm/h equivalent
    const precipPerHour = rr != null ? rr * 6 : null;
    // TAWES does not publish cloud cover at this endpoint
    points.push({
      temperature: tl,
      u,
      v,
      gust: ffx,
      relativeHumidity: rf,
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      precipitation: precipPerHour,
      model: 'tawes',
      lat: meta.lat,
      lng: meta.lon,
      elev: meta.altitude,
      ...({ stationName: meta.name ?? meta.id } as { stationName: string }),
    });
  }

  const bounds: ForecastBounds = { lngMin: 9, lngMax: 17, latMin: 46, latMax: 49 };
  return {
    cols: points.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [points],
    fetchedAt: Date.now(),
  };
}
