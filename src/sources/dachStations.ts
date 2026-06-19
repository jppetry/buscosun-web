/**
 * Aggregator for live DACH weather stations. Presents one GeoJSON
 * FeatureCollection of every station from:
 *
 *   DE → DWD via BrightSky `/sources` (~ 650 stations w/ live `current` feed)
 *   AT → GeoSphere TAWES (~ 200 active stations)
 *   CH → MeteoSwiss SMN (~ 160 active stations)
 *
 * All free, CC BY 4.0, commercial OK.
 *
 * DWD strategy: `/sources` returns the full station metadata list in a
 * single call (~ 650 stations × 200 bytes). The current observation values
 * are NOT fetched up-front — instead, `fetchDwdStationLive(sourceId)` can
 * be called on click to lazy-load the latest reading for a specific station.
 * TAWES / SMN endpoints already return values in their single batch call,
 * so we keep using those (cheap).
 */

import { fetchTawesCurrentGrid } from './geosphereTawes';
import { fetchSmnCurrentGrid } from './meteoSwissSmn';

export interface StationFeatureProps {
  source: 'dwd_obs' | 'tawes' | 'smn';
  name: string;
  elevation: number;
  /**
   * For DWD: the BrightSky source_id of the `current` observation. Kept for
   * compatibility — actual live-value requests use `dwdStationId` instead
   * (the /current_weather endpoint resolves source_id only for the synop
   * variant of a station, so the current-id from /sources doesn't work).
   */
  sourceId?: number;
  /** DWD-internal station id (5-digit string). Used to lazy-load live values. */
  dwdStationId?: string;
  /** Air temperature 2 m, °C. null when not loaded (DWD lazy mode). */
  temperature: number | null;
  /** Wind speed in m/s. */
  windSpeed: number | null;
  /** Wind direction in meteorological degrees (where wind comes FROM). */
  windDirection: number | null;
  /** Precipitation in mm/h (live obs → 10-min × 6, modelled for clarity). */
  precipitation: number | null;
  /** Total cloud cover %. */
  cloudCover: number | null;
}

export interface StationsFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: StationFeatureProps;
  }>;
  fetchedAt: number;
}

interface BrightSkySource {
  id: number;
  lat: number;
  lon: number;
  height: number;
  station_name?: string;
  dwd_station_id?: string;
  wmo_station_id?: string;
  observation_type?: 'historical' | 'forecast' | 'synop' | 'current';
  first_record?: string;
  last_record?: string;
}

/**
 * Fetch every DWD station that publishes a current (10-min) observation
 * across DACH. BrightSky's `/sources` endpoint hard-caps max_dist at 500 km,
 * which isn't quite enough to cover Schleswig-Holstein → Eastern Austria in
 * one call, so we issue two concentric queries (north + south DACH) in
 * parallel.
 *
 * Dedup logic — BrightSky returns multiple "current" sources per station
 * because old sensors that retired years ago keep the same observation_type
 * label. Per `dwd_station_id` we keep ONLY the entry with the most recent
 * `last_record` (== the live sensor), and additionally filter out anything
 * that hasn't reported in the last 7 days (stale stations).
 */
async function fetchDwdSourcesList(signal?: AbortSignal): Promise<BrightSkySource[]> {
  const centres: Array<[number, number]> = [
    [52, 10],   // northern DACH — covers DE up to Sylt + AT/CH north
    [48, 12],   // southern DACH — covers AT entire, CH, southern DE
  ];
  const responses = await Promise.all(
    centres.map(([lat, lon]) =>
      fetch(`https://api.brightsky.dev/sources?lat=${lat}&lon=${lon}&max_dist=500000`, { signal })
        .then((r) => r.ok ? r.json() as Promise<{ sources?: BrightSkySource[] }> : { sources: [] })
        .catch(() => ({ sources: [] as BrightSkySource[] })),
    ),
  );
  // First pass: collect best (most-recent) source per dwd_station_id.
  // Fall back to BrightSky source.id when the DWD id is missing.
  const bestByKey = new Map<string, BrightSkySource>();
  const STALE_CUTOFF = Date.now() - 7 * 24 * 3600_000;     // 7 days
  for (const r of responses) {
    for (const s of r.sources ?? []) {
      if (s.observation_type !== 'current') continue;
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
      // Skip stations whose newest record is older than 7 days — those are
      // retired sensors BrightSky still tags as "current".
      if (s.last_record && new Date(s.last_record).getTime() < STALE_CUTOFF) continue;
      const key = s.dwd_station_id ?? `src-${s.id}`;
      const prev = bestByKey.get(key);
      if (!prev) { bestByKey.set(key, s); continue; }
      // Keep whichever has the newer last_record.
      const a = prev.last_record ? new Date(prev.last_record).getTime() : 0;
      const b = s.last_record ? new Date(s.last_record).getTime() : 0;
      if (b > a) bestByKey.set(key, s);
    }
  }
  return Array.from(bestByKey.values());
}

/**
 * Resolve the latest observation for ONE DWD station. Pass the official
 * DWD station id (5 chars, e.g. "07367"). Used on click — cheap single
 * request, ~ 200 bytes round-trip.
 */
export async function fetchDwdStationLive(
  dwdStationId: string, signal?: AbortSignal,
): Promise<Pick<StationFeatureProps, 'temperature' | 'windSpeed' | 'windDirection' | 'precipitation' | 'cloudCover'>> {
  const url = `https://api.brightsky.dev/current_weather?dwd_station_id=${encodeURIComponent(dwdStationId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`BrightSky current HTTP ${res.status}`);
  const json = (await res.json()) as {
    weather?: {
      temperature?: number | null;
      wind_speed_10?: number | null;
      wind_direction_10?: number | null;
      cloud_cover?: number | null;
      precipitation_10?: number | null;
    };
  };
  const w = json.weather ?? {};
  return {
    temperature: w.temperature ?? null,
    windSpeed: w.wind_speed_10 != null ? w.wind_speed_10 / 3.6 : null,    // km/h → m/s
    windDirection: w.wind_direction_10 ?? null,
    precipitation: w.precipitation_10 != null ? w.precipitation_10 * 6 : null,  // 10-min → mm/h
    cloudCover: w.cloud_cover ?? null,
  };
}

/**
 * Fetch all three station networks in parallel and merge into one
 * FeatureCollection. DWD stations come without live values (set to null);
 * they fill in on demand when the user clicks one. TAWES + SMN return
 * full live readings directly from their grid endpoints.
 */
export async function fetchDachStations(signal?: AbortSignal): Promise<StationsFeatureCollection> {
  const [dwdRes, tawesRes, smnRes] = await Promise.allSettled([
    fetchDwdSourcesList(signal),
    fetchTawesCurrentGrid({ signal }),
    fetchSmnCurrentGrid({ maxStations: 200 }),
  ]);

  const features: StationsFeatureCollection['features'] = [];

  if (dwdRes.status === 'fulfilled') {
    for (const s of dwdRes.value) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          source: 'dwd_obs',
          name: s.station_name ?? `DWD ${s.id}`,
          elevation: Math.round(s.height ?? 0),
          sourceId: s.id,
          dwdStationId: s.dwd_station_id,
          temperature: null,
          windSpeed: null,
          windDirection: null,
          precipitation: null,
          cloudCover: null,
        },
      });
    }
  }
  if (tawesRes.status === 'fulfilled') {
    for (const p of tawesRes.value.points[0] ?? []) {
      if (p.lat == null || p.lng == null) continue;
      features.push(makeFeatureFromPoint('tawes', (p as { stationName?: string }).stationName ?? 'TAWES', p));
    }
  }
  if (smnRes.status === 'fulfilled') {
    for (const p of smnRes.value.points[0] ?? []) {
      if (p.lat == null || p.lng == null) continue;
      features.push(makeFeatureFromPoint('smn', (p as { stationName?: string }).stationName ?? 'SMN', p));
    }
  }

  return { type: 'FeatureCollection', features, fetchedAt: Date.now() };
}

function makeFeatureFromPoint(
  source: StationFeatureProps['source'],
  name: string,
  p: { lat?: number | null; lng?: number | null; elev?: number; temperature: number | null;
       u: number | null; v: number | null; precipitation: number | null;
       cloudLow: number | null; cloudMid: number | null; cloudHigh: number | null },
): StationsFeatureCollection['features'][number] {
  let windSpeed: number | null = null;
  let windDir: number | null = null;
  if (p.u != null && p.v != null && Number.isFinite(p.u) && Number.isFinite(p.v)) {
    windSpeed = Math.sqrt(p.u * p.u + p.v * p.v);
    const meteo = (Math.atan2(-p.u, -p.v) * 180) / Math.PI;
    windDir = (meteo + 360) % 360;
  }
  let cloudCover: number | null = null;
  if (p.cloudLow != null || p.cloudMid != null || p.cloudHigh != null) {
    const cl = (p.cloudLow ?? 0) / 100;
    const cm = (p.cloudMid ?? 0) / 100;
    const ch = (p.cloudHigh ?? 0) / 100;
    cloudCover = (1 - (1 - cl) * (1 - cm) * (1 - ch)) * 100;
  }
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
    properties: {
      source,
      name: name || source.toUpperCase(),
      elevation: Math.round(p.elev ?? 0),
      temperature: p.temperature,
      windSpeed,
      windDirection: windDir,
      precipitation: p.precipitation,
      cloudCover,
    },
  };
}
