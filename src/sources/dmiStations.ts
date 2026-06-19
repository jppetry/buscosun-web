/**
 * DMI Open Data (Denmark) — live station observations via the metObs API.
 *
 * Approach: single time-range query for the last ~30 minutes per parameter
 * returns one observation per active station within Denmark + neighbouring
 * areas. We dedup per stationId, take the most recent value, and pull lat/lng
 * straight from the GeoJSON feature geometry.
 *
 * The full DMI station catalog includes Greenland and Faroe Islands; we
 * crop by a Denmark+North-Sea bbox to avoid polluting the European grid
 * with arctic samples.
 *
 * CC-BY 4.0, no API key on dmigw.govcloud.dk (the old endpoint is still
 * online — the new opendataapi.dmi.dk is being rolled out). Commercial OK.
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const URL_BASE = 'https://dmigw.govcloud.dk/v2/metObs/collections/observation/items';

interface ObsFeature {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    parameterId: string;
    value: number;
    observed: string;
    stationId: string;
  };
}

async function fetchParam(
  parameterId: string,
  minutesBack: number,
  signal?: AbortSignal,
): Promise<Map<string, { lat: number; lng: number; value: number; observed: number }>> {
  const now = new Date();
  const from = new Date(now.getTime() - minutesBack * 60_000);
  const isoFrom = from.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const isoTo = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const url = `${URL_BASE}?parameterId=${parameterId}&datetime=${isoFrom}/${isoTo}&limit=1000`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`DMI ${parameterId} HTTP ${res.status}`);
  const json = (await res.json()) as { features: ObsFeature[] };
  // Dedup per stationId: keep the *latest* observation.
  const out = new Map<string, { lat: number; lng: number; value: number; observed: number }>();
  for (const f of json.features ?? []) {
    const [lng, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const observed = Date.parse(f.properties.observed);
    const existing = out.get(f.properties.stationId);
    if (!existing || observed > existing.observed) {
      out.set(f.properties.stationId, {
        lat,
        lng,
        value: f.properties.value,
        observed,
      });
    }
  }
  return out;
}

export interface DmiOptions { signal?: AbortSignal }

export async function fetchDmiCurrentGrid(options: DmiOptions = {}): Promise<ForecastGrid> {
  const [temp, windDir, windSpd, precip] = await Promise.all([
    fetchParam('temp_dry', 30, options.signal).catch(() => new Map()),
    fetchParam('wind_dir', 30, options.signal).catch(() => new Map()),
    fetchParam('wind_speed', 30, options.signal).catch(() => new Map()),
    fetchParam('precip_past1h', 90, options.signal).catch(() => new Map()),
  ]);

  const keys = new Set<string>([
    ...temp.keys(), ...windDir.keys(), ...windSpd.keys(), ...precip.keys(),
  ]);

  // Denmark + North-Sea filter — strips Greenland and Faroe stations that
  // would otherwise sit far outside the European grid.
  const inBBox = (lat: number, lng: number) =>
    lat >= 53.5 && lat <= 58.5 && lng >= 7.5 && lng <= 16.0;

  const points: ForecastHourPoint[] = [];
  for (const key of keys) {
    const geoSrc = temp.get(key) ?? windDir.get(key) ?? windSpd.get(key) ?? precip.get(key);
    if (!geoSrc) continue;
    if (!inBBox(geoSrc.lat, geoSrc.lng)) continue;
    const t = temp.get(key)?.value ?? null;
    const dd = windDir.get(key)?.value ?? null;
    const ff = windSpd.get(key)?.value ?? null;
    const rrh = precip.get(key)?.value ?? null;
    let u: number | null = null;
    let v: number | null = null;
    if (ff != null && dd != null) {
      const rad = (dd * Math.PI) / 180;
      u = -ff * Math.sin(rad);
      v = -ff * Math.cos(rad);
    }
    points.push({
      temperature: t,
      u, v,
      cloudLow: null, cloudMid: null, cloudHigh: null,
      precipitation: rrh,
      model: 'dmi',
      lat: geoSrc.lat,
      lng: geoSrc.lng,
      // DMI doesn't expose station elevation in obs features → 0 = sea level
      // (most DK stations are near sea level anyway; lapse correction is
      // negligible for DK terrain).
      elev: 0,
    });
  }

  const bounds: ForecastBounds = { lngMin: 7.5, lngMax: 16.0, latMin: 53.5, latMax: 58.5 };
  return {
    cols: points.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [points],
    fetchedAt: Date.now(),
  };
}
