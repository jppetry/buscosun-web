/**
 * SMHI Open Data (Sweden) — live station observations.
 *
 * SMHI is the Swedish counterpart to DWD. Their `latest-hour` endpoint
 * returns ~229 stations × parameter in a single JSON call — no API key,
 * `Access-Control-Allow-Origin: *`, commercial OK (CC-BY 4.0).
 *
 * Parameter IDs used:
 *   1  — Lufttemperatur (1 h mean), °C
 *   3  — Vindriktning (1 h mean), °
 *   4  — Vindhastighet (1 h mean), m/s
 *   7  — Nederbörd (1 h sum), mm
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const URL_BASE = 'https://opendata-download-metobs.smhi.se/api/version/latest/parameter';

interface SmhiValue { date: number; value: string; quality: string }
interface SmhiStation {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  height: number;
  value: SmhiValue[];
}
interface SmhiResponse { station: SmhiStation[] }

async function fetchParam(paramId: number, signal?: AbortSignal): Promise<Map<string, { lat: number; lng: number; height: number; value: number; name: string }>> {
  const url = `${URL_BASE}/${paramId}/station-set/all/period/latest-hour/data.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`SMHI param ${paramId} HTTP ${res.status}`);
  const json = (await res.json()) as SmhiResponse;
  const out = new Map<string, { lat: number; lng: number; height: number; value: number; name: string }>();
  for (const s of json.station ?? []) {
    const v = s.value?.[s.value.length - 1];
    if (!v || v.value === '' || v.value == null) continue;
    const val = parseFloat(v.value);
    if (!Number.isFinite(val)) continue;
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) continue;
    out.set(s.key, {
      lat: s.latitude,
      lng: s.longitude,
      height: Number.isFinite(s.height) ? s.height : 0,
      value: val,
      name: s.name,
    });
  }
  return out;
}

export interface SmhiOptions { signal?: AbortSignal }

export async function fetchSmhiCurrentGrid(options: SmhiOptions = {}): Promise<ForecastGrid> {
  // Run the four parameter fetches in parallel. Any individual failure is
  // non-fatal — we still emit stations with whatever survived.
  const [tempMap, windDirMap, windSpdMap, precipMap] = await Promise.all([
    fetchParam(1, options.signal).catch(() => new Map()),
    fetchParam(3, options.signal).catch(() => new Map()),
    fetchParam(4, options.signal).catch(() => new Map()),
    fetchParam(7, options.signal).catch(() => new Map()),
  ]);

  const allKeys = new Set<string>([...tempMap.keys(), ...windDirMap.keys(), ...windSpdMap.keys(), ...precipMap.keys()]);

  const points: ForecastHourPoint[] = [];
  for (const key of allKeys) {
    const t = tempMap.get(key);
    // Need at least one geo-located observation to place the sample.
    const geo = t ?? windDirMap.get(key) ?? windSpdMap.get(key) ?? precipMap.get(key);
    if (!geo) continue;
    const temperature = t?.value ?? null;
    const dd = windDirMap.get(key)?.value ?? null;
    const ff = windSpdMap.get(key)?.value ?? null;
    const precip = precipMap.get(key)?.value ?? null;
    let u: number | null = null;
    let v: number | null = null;
    if (ff != null && dd != null) {
      const rad = (dd * Math.PI) / 180;
      u = -ff * Math.sin(rad);
      v = -ff * Math.cos(rad);
    }
    points.push({
      temperature,
      u, v,
      cloudLow: null, cloudMid: null, cloudHigh: null,
      precipitation: precip,
      model: 'smhi',
      lat: geo.lat,
      lng: geo.lng,
      elev: geo.height,
    });
  }

  const bounds: ForecastBounds = { lngMin: 11, lngMax: 24, latMin: 55, latMax: 69 };
  return {
    cols: points.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [points],
    fetchedAt: Date.now(),
  };
}
