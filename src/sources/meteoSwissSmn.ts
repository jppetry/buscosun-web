/**
 * MeteoSwiss — SwissMetNet (SMN) live station observations.
 *
 * 158 automatic monitoring stations covering Switzerland, 10-min cadence.
 * Open data CC-BY 4.0 since May 2025, commercial OK, no API key.
 *
 * Access pattern is unusual:
 *   1) Collection asset `ogd-smn_meta_stations.csv` holds the station master
 *      list with WGS84 lat/lon and `station_height_masl` — load once, cache.
 *   2) Per-station 10-min CSV at
 *      `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/<abbr>/ogd-smn_<abbr>_t_now.csv`
 *      contains the last few hours of measurements; we read the most recent
 *      row only.
 *
 * Parsed columns:
 *   tre200s0  — temperature 2 m, °C
 *   ure200s0  — relative humidity 2 m, %
 *   rre150z0  — precipitation last 10 min, mm
 *   fkl010z0  — wind speed 10 min mean, m/s
 *   dkl010z0  — wind direction 10 min mean, °
 *
 * Total: 1 meta CSV + N station CSVs (one per active station).
 */

import type { ForecastBounds, ForecastGrid, ForecastHourPoint } from './openMeteoForecast';

const META_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv';
const STATION_URL = (abbr: string) =>
  `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${abbr.toLowerCase()}/ogd-smn_${abbr.toLowerCase()}_t_now.csv`;

interface SmnStation {
  abbr: string;
  lat: number;
  lng: number;
  elev: number;
}

let metaCache: { fetchedAt: number; stations: SmnStation[] } | null = null;

/**
 * Tiny semicolon-CSV parser tailored to MeteoSwiss OGD files. Handles the
 * trailing-empty cells and the windows-1252 station names (we ignore those).
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(';');
  const rows = lines.slice(1).map((l) => l.split(';'));
  return { headers, rows };
}

async function loadSmnStationsList(signal?: AbortSignal): Promise<SmnStation[]> {
  if (metaCache && Date.now() - metaCache.fetchedAt < 3600_000) return metaCache.stations;
  const res = await fetch(META_URL, { signal });
  if (!res.ok) throw new Error(`SMN meta ${res.status}`);
  const text = await res.text();
  const { headers, rows } = parseCsv(text);
  const colAbbr = headers.indexOf('station_abbr');
  const colLat = headers.indexOf('station_coordinates_wgs84_lat');
  const colLng = headers.indexOf('station_coordinates_wgs84_lon');
  const colElev = headers.indexOf('station_height_masl');
  const stations: SmnStation[] = [];
  for (const r of rows) {
    const abbr = r[colAbbr];
    const lat = parseFloat(r[colLat]);
    const lng = parseFloat(r[colLng]);
    const elev = parseFloat(r[colElev]);
    if (!abbr || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    stations.push({ abbr, lat, lng, elev: Number.isFinite(elev) ? elev : 0 });
  }
  metaCache = { fetchedAt: Date.now(), stations };
  return stations;
}

async function pMap<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/**
 * Die Stationsdatei `_t_now.csv` trägt den ganzen laufenden Tag in 10-Minuten-
 * Schritten (gemessen 2026-09-07: 132 Zeilen). Sie wird je Station EINMAL
 * gelesen und kurz gehalten, damit die Historie für den Stationsanker aus
 * derselben Datei kommt wie der aktuelle Wert.
 */
interface SmnRows { fetchedAt: number; headers: string[]; rows: string[][] }
const rowsCache = new Map<string, SmnRows>();
const ROWS_TTL_MS = 5 * 60_000;

async function loadStationRows(s: SmnStation, signal?: AbortSignal): Promise<SmnRows | null> {
  const cached = rowsCache.get(s.abbr);
  if (cached && Date.now() - cached.fetchedAt < ROWS_TTL_MS) return cached;
  const res = await fetch(STATION_URL(s.abbr), { signal });
  if (!res.ok) return null;
  const text = await res.text();
  const { headers, rows } = parseCsv(text);
  const entry = { fetchedAt: Date.now(), headers, rows };
  rowsCache.set(s.abbr, entry);
  return entry;
}

function rowToPoint(headers: string[], row: string[], s: SmnStation): ForecastHourPoint {
  const get = (col: string): number | null => {
    const idx = headers.indexOf(col);
    if (idx < 0) return null;
    const raw = row[idx];
    if (raw == null || raw === '') return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };
  const t = get('tre200s0');
  const ff = get('fkl010z0');
  const dd = get('dkl010z0');
  // fkl010d1 = max wind gust during last 10 min, m/s.
  const ffx = get('fkl010d1');
  // ure200s0 = relative humidity 2 m, %.
  const rh = get('ure200s0');
  const rr10 = get('rre150z0');
  let u: number | null = null;
  let v: number | null = null;
  if (ff != null && dd != null) {
    const rad = (dd * Math.PI) / 180;
    u = -ff * Math.sin(rad);
    v = -ff * Math.cos(rad);
  }
  return {
    temperature: t,
    u, v,
    gust: ffx,
    relativeHumidity: rh,
    cloudLow: null, cloudMid: null, cloudHigh: null,
    precipitation: rr10 != null ? rr10 * 6 : null,
    model: 'smn',
    lat: s.lat, lng: s.lng, elev: s.elev,
    ...({ stationName: s.abbr, stationId: s.abbr } as { stationName: string; stationId: string }),
  };
}

/** `reference_timestamp` der OGD-Dateien: `dd.mm.yyyy HH:MM`, UTC. */
function parseSmnTimestamp(raw: string | undefined): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(raw ?? '');
  if (!m) return NaN;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
}

async function fetchStationLastRow(s: SmnStation, signal?: AbortSignal): Promise<ForecastHourPoint | null> {
  try {
    const data = await loadStationRows(s, signal);
    if (!data || !data.rows.length) return null;
    return rowToPoint(data.headers, data.rows[data.rows.length - 1], s);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return null;
  }
}

/**
 * Stündliche Messwerte der letzten `hours` Stunden je Station (Kürzel) aus der
 * bereits gelesenen Tagesdatei — je Stundenboden die Zeile zur vollen Stunde
 * (oder die nächste innerhalb 10 min). Kein zusätzlicher Abruf, wenn die
 * Station im laufenden Aufruf schon gelesen wurde.
 */
export async function fetchSmnHistory(
  abbrs: string[],
  hours: number,
  signal?: AbortSignal,
): Promise<Map<string, Map<number, ForecastHourPoint>>> {
  const out = new Map<string, Map<number, ForecastHourPoint>>();
  if (!abbrs.length || hours <= 0) return out;
  const all = await loadSmnStationsList(signal);
  const byAbbr = new Map(all.map((s) => [s.abbr, s]));
  const endMs = Math.floor(Date.now() / 3600_000) * 3600_000;
  const startMs = endMs - hours * 3600_000;
  await pMap(abbrs, async (abbr) => {
    const s = byAbbr.get(abbr);
    if (!s) return;
    const data = await loadStationRows(s, signal).catch(() => null);
    if (!data) return;
    const tsCol = data.headers.indexOf('reference_timestamp');
    if (tsCol < 0) return;
    const byHour = new Map<number, ForecastHourPoint>();
    for (const row of data.rows) {
      const ms = parseSmnTimestamp(row[tsCol]);
      if (!Number.isFinite(ms) || ms < startMs || ms >= endMs) continue;
      const hourMs = Math.round(ms / 3600_000) * 3600_000;
      if (Math.abs(ms - hourMs) > 10 * 60_000) continue;
      if (!byHour.has(hourMs) || Math.abs(ms - hourMs) < 1) byHour.set(hourMs, rowToPoint(data.headers, row, s));
    }
    out.set(abbr, byHour);
  }, 6, signal);
  return out;
}

export interface SmnOptions {
  /** Cap station count — 158 is a lot of HTTP calls. Default 80 (well-distributed). */
  maxStations?: number;
  signal?: AbortSignal;
}

/**
 * Returns a 1-hour ForecastGrid with one ForecastHourPoint per active SMN
 * station (lat/lng/elev override), suitable for the FusionEngine.
 */
export async function fetchSmnCurrentGrid(options: SmnOptions = {}): Promise<ForecastGrid> {
  const cap = options.maxStations ?? 80;
  const all = await loadSmnStationsList(options.signal);
  // Subsample evenly across the alphabetical list (≈ spatial spread is OK
  // because station abbrs don't cluster geographically). If cap < all.length
  // we take every (all/cap)-th station.
  const subset: SmnStation[] = [];
  if (all.length <= cap) {
    subset.push(...all);
  } else {
    const step = all.length / cap;
    for (let i = 0; i < cap; i++) subset.push(all[Math.floor(i * step)]);
  }

  const rows = await pMap(subset, (s) => fetchStationLastRow(s), 6, options.signal);
  const points = rows.filter((r): r is ForecastHourPoint => r != null);

  const bounds: ForecastBounds = { lngMin: 6.0, lngMax: 10.5, latMin: 45.8, latMax: 47.8 };
  return {
    cols: points.length || 1,
    rows: 1,
    bounds,
    times: [new Date()],
    points: [points],
    fetchedAt: Date.now(),
  };
}
