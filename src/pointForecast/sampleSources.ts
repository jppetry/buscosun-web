/**
 * Per-source point samplers. Each function returns the source's hourly
 * forecast (or current observation) at the exact query point — without going
 * through the grid IDW. Some samplers reuse the existing grid adapters and
 * filter their station list down to the few sites closest to the query.
 */

import type { Country } from '../types';
import { fetchBrightSkyCurrentGrid } from '../sources/brightSkyCurrent';
import { fetchTawesCurrentGrid } from '../sources/geosphereTawes';
import { fetchSmnCurrentGrid } from '../sources/meteoSwissSmn';
import type { ForecastBounds, ForecastHourPoint } from '../sources/openMeteoForecast';
import type { PointSourceSample, PointHourSamples } from './types';

const EARTH_R = 6_371_000;

/** Great-circle distance between two lat/lng in metres (Haversine). */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Open-Meteo — multi-model forecast at a single point.
// ---------------------------------------------------------------------------

interface OpenMeteoPointHour {
  time: Date;
  temperature: number | null;
  u: number | null;
  v: number | null;
  /** Max wind gust during the hour, m/s. */
  gust: number | null;
  /** Relative humidity at 2 m, %. */
  relativeHumidity: number | null;
  /** Schneefallgrenze (m ü. M.) — nur AROME/AT/CH liefert das aktuell. */
  snowLine: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  precipitation: number | null;
  model: string;
  elevation: number | null;
}

/**
 * Fetch hourly forecast at one (lat,lng) for the given models. Each model is
 * one entry in the response's `temperature_2m_icon_d2`, etc. arrays.
 *
 * Open-Meteo's multi-model API returns the same number of timesteps for each
 * model — variables get suffixed with the model id (e.g.
 * `temperature_2m_icon_d2`). We split them out into one OpenMeteoPointHour[]
 * per model.
 */
export async function fetchOpenMeteoPoint(
  lat: number,
  lng: number,
  hours: number,
  models: string[],
  signal?: AbortSignal,
): Promise<Map<string, OpenMeteoPointHour[]>> {
  if (!models.length) return new Map();
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(3));
  url.searchParams.set('longitude', lng.toFixed(3));
  url.searchParams.set('hourly', [
    'temperature_2m', 'wind_speed_10m', 'wind_direction_10m',
    'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
    'precipitation',
  ].join(','));
  url.searchParams.set('models', models.join(','));
  url.searchParams.set('wind_speed_unit', 'ms');
  url.searchParams.set('forecast_days', String(Math.ceil(hours / 24) + 1));
  url.searchParams.set('cell_selection', 'nearest');

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo point ${res.status}`);
  const raw = await res.json() as {
    hourly?: Record<string, Array<number | null> | string[]>;
    elevation?: number | Record<string, number>;
  };
  const hourly = raw.hourly ?? {};
  const times = (hourly.time as string[] | undefined) ?? [];

  // Open-Meteo's hourly array begins at 00:00 UTC of today (regardless of
  // when the request was made), so without slicing the index 0 corresponds
  // to the most recent past midnight — not "now". Find the offset of the
  // current hour (rounded down) so that arr[0] is genuinely the live frame.
  const nowFloorHour = new Date();
  nowFloorHour.setMinutes(0, 0, 0);
  const nowMs = nowFloorHour.getTime();
  let startOffset = 0;
  for (let i = 0; i < times.length; i++) {
    if (new Date(times[i]).getTime() >= nowMs) { startOffset = i; break; }
  }

  const elevations: Record<string, number | null> =
    typeof raw.elevation === 'number'
      ? Object.fromEntries(models.map((m) => [m, raw.elevation as number]))
      : (raw.elevation as Record<string, number> | undefined) ?? {};

  const out = new Map<string, OpenMeteoPointHour[]>();
  for (const m of models) {
    const suffix = `_${m}`;
    const t = hourly[`temperature_2m${suffix}`] as number[] | undefined;
    if (!t) continue;
    const sp = hourly[`wind_speed_10m${suffix}`] as number[] | undefined;
    const dr = hourly[`wind_direction_10m${suffix}`] as number[] | undefined;
    const cl = hourly[`cloud_cover_low${suffix}`] as number[] | undefined;
    const cm = hourly[`cloud_cover_mid${suffix}`] as number[] | undefined;
    const ch = hourly[`cloud_cover_high${suffix}`] as number[] | undefined;
    const pr = hourly[`precipitation${suffix}`] as number[] | undefined;
    const arr: OpenMeteoPointHour[] = [];
    const n = Math.min(hours, times.length - startOffset);
    for (let k = 0; k < n; k++) {
      const i = startOffset + k;
      const speed = sp?.[i] ?? null;
      const dir = dr?.[i] ?? null;
      let u: number | null = null;
      let v: number | null = null;
      if (speed != null && dir != null && Number.isFinite(speed) && Number.isFinite(dir)) {
        const rad = (dir * Math.PI) / 180;
        u = -speed * Math.sin(rad);
        v = -speed * Math.cos(rad);
      }
      arr.push({
        time: new Date(times[i]),
        temperature: t?.[i] ?? null,
        u, v,
        // Open-Meteo would carry these; the legacy point fetcher predates the
        // schema. Leave null — Open-Meteo path is opt-in only anyway.
        gust: null,
        relativeHumidity: null,
        snowLine: null,
        cloudLow: cl?.[i] ?? null,
        cloudMid: cm?.[i] ?? null,
        cloudHigh: ch?.[i] ?? null,
        precipitation: pr?.[i] ?? null,
        model: m,
        elevation: elevations[m] ?? null,
      });
    }
    out.set(m, arr);
  }
  return out;
}

// ---------------------------------------------------------------------------
// BrightSky `/weather` — MOSMIX hourly forecast for the nearest DWD station.
// ---------------------------------------------------------------------------

interface BrightSkyWeatherEntry {
  timestamp: string;
  temperature?: number | null;     // °C
  wind_speed?: number | null;       // km/h
  wind_direction?: number | null;
  wind_gust_speed?: number | null;  // km/h, max gust during hour (MOSMIX FX1)
  relative_humidity?: number | null; // %
  cloud_cover?: number | null;
  precipitation?: number | null;
}
interface BrightSkyWeatherSource {
  id: number;
  lat: number;
  lon: number;
  height: number;
  station_name?: string;
}

export interface BrightSkyPointForecast {
  station: { id: number; lat: number; lng: number; height: number; name?: string };
  hours: OpenMeteoPointHour[];
}

export async function fetchBrightSkyPointForecast(
  lat: number,
  lng: number,
  hours: number,
  signal?: AbortSignal,
): Promise<BrightSkyPointForecast | null> {
  const start = new Date();
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + hours * 3600_000);
  const url =
    `https://api.brightsky.dev/weather` +
    `?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}` +
    `&date=${start.toISOString()}&last_date=${end.toISOString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    weather?: BrightSkyWeatherEntry[];
    sources?: BrightSkyWeatherSource[];
  };
  const src = json.sources?.[0];
  if (!src || !json.weather?.length) return null;

  const out: OpenMeteoPointHour[] = json.weather.slice(0, hours).map((w) => {
    let u: number | null = null;
    let v: number | null = null;
    if (w.wind_speed != null && w.wind_direction != null) {
      const ms = w.wind_speed / 3.6;
      const rad = (w.wind_direction * Math.PI) / 180;
      u = -ms * Math.sin(rad);
      v = -ms * Math.cos(rad);
    }
    // BrightSky reports total cloud cover only — split proportionally
    // (55 % / 30 % / 15 %) so the alpha-combined render matches the total.
    const total = w.cloud_cover ?? null;
    let cl: number | null = null;
    let cm: number | null = null;
    let ch: number | null = null;
    if (total != null) {
      cl = total * 0.55;
      cm = total * 0.30;
      ch = total * 0.15;
    }
    const gustMs = w.wind_gust_speed != null ? w.wind_gust_speed / 3.6 : null;
    return {
      time: new Date(w.timestamp),
      temperature: w.temperature ?? null,
      u, v,
      gust: gustMs,
      relativeHumidity: w.relative_humidity ?? null,
      snowLine: null,                      // MOSMIX liefert keinen snowlmt-Wert
      cloudLow: cl, cloudMid: cm, cloudHigh: ch,
      precipitation: w.precipitation ?? null,
      model: 'mosmix',
      elevation: src.height,
    };
  });
  return {
    station: {
      id: src.id, lat: src.lat, lng: src.lon,
      height: src.height, name: src.station_name,
    },
    hours: out,
  };
}

// ---------------------------------------------------------------------------
// GeoSphere INCA — alpine nowcast (1 km / 15 min, ~3 h horizon) at a point.
// ---------------------------------------------------------------------------

const INCA_BOUNDS = { lngMin: 8.5, lngMax: 17.4, latMin: 45.7, latMax: 49.3 };

interface GeoSphereTimeSeriesResponse {
  reference_time: string;
  timestamps: string[];
  features: Array<{
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: {
      parameters: { [k: string]: { name: string; unit: string; data: Array<number | null> } };
    };
  }>;
}

/**
 * Sample INCA at a single point. Returns hourly entries derived from the
 * native 15-min frames by picking the nearest 15-min slot to each hour
 * after the reference time. Skips points outside INCA's valid extent
 * (the API rejects them with HTTP 400, which would lose the whole call).
 */
export async function fetchIncaPoint(
  lat: number,
  lng: number,
  hours: number,
  signal?: AbortSignal,
): Promise<OpenMeteoPointHour[]> {
  if (
    lat < INCA_BOUNDS.latMin || lat > INCA_BOUNDS.latMax ||
    lng < INCA_BOUNDS.lngMin || lng > INCA_BOUNDS.lngMax
  ) {
    return [];
  }
  const url =
    'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km' +
    `?parameters=t2m,rr,ff,dd&lat_lon=${lat.toFixed(3)},${lng.toFixed(3)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`INCA point ${res.status}`);
  const json = (await res.json()) as GeoSphereTimeSeriesResponse;
  const feat = json.features?.[0];
  if (!feat) return [];
  const stamps = json.timestamps.map((s) => new Date(s).getTime());
  const p = feat.properties.parameters;
  // Anchor h=0 to the current hour-floor, not the model's reference time —
  // the reference can be 1–2 h in the past, which would make h=0 a stale
  // sample.
  const nowFloor = new Date();
  nowFloor.setMinutes(0, 0, 0);
  const anchor = nowFloor.getTime();
  const out: OpenMeteoPointHour[] = [];
  for (let h = 0; h < hours; h++) {
    const target = anchor + h * 3600_000;
    let best = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < stamps.length; i++) {
      const d = Math.abs(stamps[i] - target);
      if (d < bestDelta) { bestDelta = d; best = i; }
    }
    if (best < 0 || bestDelta > 30 * 60_000) break;   // > 30 min off → past INCA's horizon
    const t = p.t2m?.data?.[best] ?? null;
    const r = p.rr?.data?.[best] ?? null;
    const ff = p.ff?.data?.[best] ?? null;
    const dd = p.dd?.data?.[best] ?? null;
    let u: number | null = null;
    let v: number | null = null;
    if (ff != null && dd != null) {
      const rad = (dd * Math.PI) / 180;
      u = -ff * Math.sin(rad);
      v = -ff * Math.cos(rad);
    }
    out.push({
      time: new Date(target),
      temperature: t,
      u, v,
      // INCA nowcast variant does not publish gust/humidity/snow line here.
      gust: null,
      relativeHumidity: null,
      snowLine: null,
      cloudLow: null, cloudMid: null, cloudHigh: null,
      precipitation: r != null ? r * 4 : null,           // 15-min mm → mm/h
      model: 'inca',
      // INCA snaps to its native ~1 km grid. The valley bottom of Innsbruck
      // sits at ~580 m in INCA's terrain — close enough that we report the
      // query's DEM elevation as the source elevation (caller will skip the
      // lapse correction when this equals queryElev).
      elevation: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// GeoSphere AROME-AT — 2.5 km / 1 h NWP, 60 h horizon at a point.
// ---------------------------------------------------------------------------

const AROME_BOUNDS = { lngMin: 6.0, lngMax: 17.0, latMin: 45.7, latMax: 51.5 };

export async function fetchAromePoint(
  lat: number,
  lng: number,
  hours: number,
  signal?: AbortSignal,
): Promise<OpenMeteoPointHour[]> {
  if (
    lat < AROME_BOUNDS.latMin || lat > AROME_BOUNDS.latMax ||
    lng < AROME_BOUNDS.lngMin || lng > AROME_BOUNDS.lngMax
  ) {
    return [];
  }
  const url =
    'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v1-1h-2500m' +
    // ugust/vgust: 10-m max-gust components (m/s); rh2m: 2-m relative humidity (%);
    // snowlmt: Schneefallgrenze in m ü. M.
    `?parameters=t2m,u10m,v10m,ugust,vgust,rh2m,snowlmt,tcc,rr_acc&lat_lon=${lat.toFixed(3)},${lng.toFixed(3)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`AROME point ${res.status}`);
  const json = (await res.json()) as GeoSphereTimeSeriesResponse;
  const feat = json.features?.[0];
  if (!feat) return [];
  const stamps = json.timestamps.map((s) => new Date(s));
  const p = feat.properties.parameters;
  // AROME's timestamps start at the model run time, which can be hours in
  // the past. Skip past the current hour-floor so arr[0] = "now".
  const nowFloor = new Date();
  nowFloor.setMinutes(0, 0, 0);
  const nowMs = nowFloor.getTime();
  let startIdx = 0;
  for (let i = 0; i < stamps.length; i++) {
    if (stamps[i].getTime() >= nowMs) { startIdx = i; break; }
  }
  const usable = Math.min(hours, stamps.length - startIdx);
  const out: OpenMeteoPointHour[] = [];
  let prevAcc: number | null = null;
  for (let k = 0; k < usable; k++) {
    const h = startIdx + k;
    const t = p.t2m?.data?.[h] ?? null;
    const u = p.u10m?.data?.[h] ?? null;
    const v = p.v10m?.data?.[h] ?? null;
    const tcc = p.tcc?.data?.[h];
    const total100 = tcc != null ? tcc * 100 : null;
    let cl: number | null = null, cm: number | null = null, ch: number | null = null;
    if (total100 != null) {
      cl = total100 * 0.55;
      cm = total100 * 0.30;
      ch = total100 * 0.15;
    }
    // rr_acc is monotone increasing; hourly precip is the diff.
    const acc = p.rr_acc?.data?.[h] ?? null;
    let precip: number | null = null;
    if (acc != null && prevAcc != null) precip = Math.max(0, acc - prevAcc);
    if (acc != null) prevAcc = acc;
    // Gust = magnitude of (ugust, vgust); rh2m is directly in %.
    const ug = p.ugust?.data?.[h];
    const vg = p.vgust?.data?.[h];
    const gustMs = ug != null && vg != null ? Math.sqrt(ug * ug + vg * vg) : null;
    const rh2m = p.rh2m?.data?.[h] ?? null;
    const snowlmt = p.snowlmt?.data?.[h] ?? null;
    out.push({
      time: stamps[h],
      temperature: t,
      u, v,
      gust: gustMs,
      relativeHumidity: rh2m,
      snowLine: snowlmt,
      cloudLow: cl, cloudMid: cm, cloudHigh: ch,
      precipitation: precip,
      model: 'arome_at',
      // AROME is a 2.5 km gridded model — the response includes the native
      // grid-cell topography on the feature, but the API doesn't surface it
      // in /timeseries/forecast. Without that, we can't lapse-correct against
      // the model topography; the blender therefore skips lapse correction
      // for AROME samples (elevation: null) and relies on AROME's own
      // valley-resolving skill at 2.5 km.
      elevation: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live observations (DWD / TAWES / SMN) — pick N nearest stations.
// ---------------------------------------------------------------------------

export interface NearestStationObs {
  source: string;
  name?: string;
  lat: number;
  lng: number;
  elevation: number;
  distanceMeters: number;
  point: ForecastHourPoint;
}

/**
 * Run all live-observation adapters that the country profile activates, then
 * keep only the N stations closest to the query point. Returns them sorted by
 * distance (ascending). All adapters fail-soft — if e.g. BrightSky times out
 * the function still returns whatever TAWES/SMN produced.
 */
export async function fetchNearestStationObs(
  lat: number, lng: number, country: Country,
  maxStations: number,
  signal?: AbortSignal,
): Promise<NearestStationObs[]> {
  const lookups: Array<Promise<NearestStationObs[]>> = [];

  // DWD via BrightSky: only fires for DE (the API returns 404 elsewhere).
  // For other countries cross-border stations are negligible.
  if (country === 'DE') {
    lookups.push(
      (async () => {
        const tight: ForecastBounds = {
          lngMin: lng - 1.2, lngMax: lng + 1.2,
          latMin: lat - 1.0, latMax: lat + 1.0,
        };
        try {
          const grid = await fetchBrightSkyCurrentGrid({
            bounds: tight, cols: 5, rows: 4, signal,
          });
          return (grid.points[0] ?? [])
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              source: 'dwd_obs',
              lat: p.lat as number,
              lng: p.lng as number,
              elevation: p.elev ?? 0,
              distanceMeters: haversine(lat, lng, p.lat as number, p.lng as number),
              point: p,
            }));
        } catch { return []; }
      })(),
    );
  }
  if (country === 'AT') {
    lookups.push(
      (async () => {
        try {
          const grid = await fetchTawesCurrentGrid({ signal });
          return (grid.points[0] ?? [])
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              source: 'tawes',
              lat: p.lat as number,
              lng: p.lng as number,
              elevation: p.elev ?? 0,
              distanceMeters: haversine(lat, lng, p.lat as number, p.lng as number),
              point: p,
            }));
        } catch { return []; }
      })(),
    );
  }
  if (country === 'CH') {
    lookups.push(
      (async () => {
        try {
          const grid = await fetchSmnCurrentGrid({ maxStations: 80 });
          return (grid.points[0] ?? [])
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => ({
              source: 'smn',
              lat: p.lat as number,
              lng: p.lng as number,
              elevation: p.elev ?? 0,
              distanceMeters: haversine(lat, lng, p.lat as number, p.lng as number),
              point: p,
            }));
        } catch { return []; }
      })(),
    );
  }

  const all = (await Promise.all(lookups)).flat();
  all.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return all.slice(0, maxStations);
}

// ---------------------------------------------------------------------------
// Helpers to convert raw source outputs into PointSourceSample arrays so the
// blender can consume everything uniformly.
// ---------------------------------------------------------------------------

export function omSeriesToHourSamples(
  series: Map<string, OpenMeteoPointHour[]>,
  family: 'highres' | 'global',
): PointHourSamples[] {
  // Pick the longest of all model series as the timeline anchor.
  const hours: PointHourSamples[] = [];
  const anyArr = Array.from(series.values())[0];
  if (!anyArr?.length) return hours;
  for (let i = 0; i < anyArr.length; i++) {
    const ts = anyArr[i].time;
    const samples: PointSourceSample[] = [];
    for (const [model, arr] of series) {
      const e = arr[i];
      if (!e) continue;
      samples.push({
        source: model,
        family,
        temperature: e.temperature,
        sourceElevation: e.elevation,
        u: e.u, v: e.v,
        gust: e.gust,
        relativeHumidity: e.relativeHumidity,
        snowLine: e.snowLine,
        cloudLow: e.cloudLow, cloudMid: e.cloudMid, cloudHigh: e.cloudHigh,
        precipitation: e.precipitation,
        uvIndex: null,
        distanceMeters: 0,
      });
    }
    hours.push({ timestamp: ts, samples });
  }
  return hours;
}

/**
 * Wrap a single-source point series (INCA, AROME, BrightSky) into the
 * unified PointHourSamples format. Each hour gets one sample tagged with
 * the given source/family.
 */
export function seriesToHourSamples(
  arr: OpenMeteoPointHour[],
  source: string,
  family: 'obs' | 'nowcast' | 'highres' | 'mosmix' | 'global',
): PointHourSamples[] {
  return arr.map((e) => ({
    timestamp: e.time,
    samples: [{
      source,
      family,
      temperature: e.temperature,
      sourceElevation: e.elevation,
      u: e.u, v: e.v,
      gust: e.gust,
      relativeHumidity: e.relativeHumidity,
      snowLine: e.snowLine,
      cloudLow: e.cloudLow, cloudMid: e.cloudMid, cloudHigh: e.cloudHigh,
      precipitation: e.precipitation,
      uvIndex: null,
      distanceMeters: 0,
    }],
  }));
}

export function brightSkyToHourSamples(
  bs: BrightSkyPointForecast | null,
): PointHourSamples[] {
  if (!bs) return [];
  return bs.hours.map((e) => ({
    timestamp: e.time,
    samples: [{
      source: 'mosmix',
      family: 'mosmix' as const,
      temperature: e.temperature,
      sourceElevation: bs.station.height,
      u: e.u, v: e.v,
      gust: e.gust,
      relativeHumidity: e.relativeHumidity,
      snowLine: e.snowLine,
      cloudLow: e.cloudLow, cloudMid: e.cloudMid, cloudHigh: e.cloudHigh,
      precipitation: e.precipitation,
      uvIndex: null,
      distanceMeters: haversine(
        bs.station.lat, bs.station.lng,
        bs.station.lat, bs.station.lng,    // station is the source — distance from query is computed elsewhere
      ),
    }],
  }));
}

/** Convert station observations into a single hour-0 sample list. */
export function stationsToHour0Samples(
  stations: NearestStationObs[],
): PointHourSamples {
  return {
    timestamp: new Date(),
    samples: stations.map((s) => ({
      source: s.source,
      family: 'obs',
      temperature: s.point.temperature,
      sourceElevation: s.elevation,
      u: s.point.u, v: s.point.v,
      gust: s.point.gust ?? null,
      relativeHumidity: s.point.relativeHumidity ?? null,
      snowLine: null,                       // stations don't report snow line
      cloudLow: s.point.cloudLow,
      cloudMid: s.point.cloudMid,
      cloudHigh: s.point.cloudHigh,
      precipitation: s.point.precipitation,
      uvIndex: null,
      distanceMeters: s.distanceMeters,
    })),
  };
}
