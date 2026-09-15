/**
 * truth.mjs — the measurement side of the archive: DWD POI as the one hourly truth for
 * DE, AT and CH stations (the POI directory carries WMO ids of all three countries —
 * measured 2026-09-14: 11035 Wien, 11120 Innsbruck, 06700 Genève, 06670 Zürich all present),
 * plus the 10-minute national networks where the id maps (TAWES for 11xxx, SwissMetNet
 * for 06xxx via the WIGOS id in `ogd-smn_meta_stations.csv`).
 *
 * The POI parser is the one from `scripts/verify-pv-score.mjs` (same columns, same
 * km/h → m/s conversion) — moved here so collector and scorer read the truth identically.
 * POI holds a 24-h rolling window; that is exactly why the collector runs daily.
 */

export const POI_URL = (id) => `https://opendata.dwd.de/weather/weather_reports/poi/${id}-BEOB.csv`;
export const POI_DIR_URL = 'https://opendata.dwd.de/weather/weather_reports/poi/';
export const SMN_META_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv';
export const TAWES_META_URL = 'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';

const POI_COLS = {
  t: 'dry_bulb_temperature_at_2_meter_above_ground',
  td: 'dew_point_temperature_at_2_meter_above_ground',
  rh: 'relative_humidity',
  ff: 'mean_wind_speed_during last_10_min_at_10_meters_above_ground',
  dd: 'mean_wind_direction_during_last_10 min_at_10_meters_above_ground',
  fx: 'maximum_wind_speed_last_hour',
  rr1: 'precipitation_amount_last_hour',
  n: 'cloud_cover_total',
  p: 'pressure_reduced_to_mean_sea_level',
};

/** POI CSV → Map<ms, { t, td, rh, ff(m/s), dd, fx(m/s), rr1, n, p }>. */
export function parsePoi(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return new Map();
  const head = lines[0].split(';');
  const col = {};
  for (const [k, name] of Object.entries(POI_COLS)) col[k] = head.indexOf(name);
  const num = (s) => { if (s == null) return null; const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const rows = new Map();
  for (const line of lines.slice(3)) {
    const f = line.split(';');
    const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(f[0]); const hm = /^(\d{2}):(\d{2})$/.exec(f[1] ?? '');
    if (!m || !hm) continue;
    const ms = Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], +hm[1], +hm[2]);
    const g = (k) => (col[k] >= 0 ? num(f[col[k]]) : null);
    const kmh = (v) => (v == null ? null : v / 3.6);
    rows.set(ms, { t: g('t'), td: g('td'), rh: g('rh'), ff: kmh(g('ff')), dd: g('dd'), fx: kmh(g('fx')), rr1: g('rr1'), n: g('n'), p: g('p') });
  }
  return rows;
}

/** Station ids that have a POI file: parsed from the Apache listing (`<ID>-BEOB.csv`). */
export function parsePoiListing(html) {
  const ids = new Set();
  for (const m of html.matchAll(/href="([^"]+)-BEOB\.csv"/g)) ids.add(m[1]);
  return ids;
}

/** `ogd-smn_meta_stations.csv` → Map<WMO id (5 digits), { abbr, name, lat, lon, elev }>. */
export function parseSmnMeta(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  const head = lines[0].split(';');
  const iAbbr = head.indexOf('station_abbr'), iName = head.indexOf('station_name'), iWigos = head.indexOf('station_wigos_id');
  const iLat = head.indexOf('station_coordinates_wgs84_lat'), iLon = head.indexOf('station_coordinates_wgs84_lon'), iH = head.indexOf('station_height_masl');
  const out = new Map();
  for (const line of lines.slice(1)) {
    const f = line.split(';');
    const wig = f[iWigos] ?? '';
    const m = /^0-20000-0-(\d{5})$/.exec(wig);
    if (!m) continue;
    out.set(m[1], { abbr: f[iAbbr], name: f[iName], lat: Number(f[iLat]), lon: Number(f[iLon]), elev: Number(f[iH]) });
  }
  return out;
}

/** Ordered obs series (hourly) from a POI map, within [fromMs, toMs]. */
export function poiSeries(rows, fromMs, toMs) {
  const ms = [...rows.keys()].filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b);
  const pick = (k) => ms.map((t) => rows.get(t)[k]);
  return { obsAtMs: ms, t: pick('t'), td: pick('td'), rh: pick('rh'), ff: pick('ff'), dd: pick('dd'), fx: pick('fx'), rr1: pick('rr1'), n: pick('n'), p: pick('p') };
}

/** `fetchTawesHistory` / `fetchSmnHistory` result (Map<hourMs, ForecastHourPoint>) → series. */
export function hourMapSeries(byHour, fromMs, toMs) {
  const ms = [...byHour.keys()].filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b);
  const pts = ms.map((t) => byHour.get(t));
  const spd = (p) => (p.u != null && p.v != null ? Math.hypot(p.u, p.v) : null);
  const dir = (p) => (p.u != null && p.v != null ? ((Math.atan2(-p.u, -p.v) * 180) / Math.PI + 360) % 360 : null);
  return {
    obsAtMs: ms,
    t: pts.map((p) => p.temperature ?? null),
    td: pts.map(() => null),
    rh: pts.map((p) => p.relativeHumidity ?? null),
    ff: pts.map(spd), dd: pts.map(dir),
    fx: pts.map((p) => p.gust ?? null),
    rr1: pts.map((p) => p.precipitation ?? null),   // mm/h at the hour (10-min sum × 6), not the hour sum — named in caveats
    n: pts.map(() => null), p: pts.map(() => null),
  };
}

export function truthSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const head = ['Datum', 'Uhrzeit (UTC)', POI_COLS.t, POI_COLS.td, POI_COLS.rh, POI_COLS.ff, POI_COLS.dd, POI_COLS.fx, POI_COLS.rr1, POI_COLS.n, POI_COLS.p].join(';');
  const csv = [head, 'Datum;Uhrzeit;°C;°C;%;km/h;°;km/h;mm;%;hPa', ';;;;;;;;;;', '14.09.26;19:00;12,3;8,1;75;10,8;270;25,2;0,4;87,5;1017,2', '14.09.26;18:00;13,0;---;70;7,2;260;18,0;0,0;100;1017,0'].join('\n');
  const rows = parsePoi(csv);
  const t19 = rows.get(Date.UTC(2026, 8, 14, 19, 0));
  add('POI: zwei Zeilen, Zeit als UTC-Millisekunden', rows.size === 2 && !!t19);
  add('POI: T 12,3 · Td 8,1 · FF 10,8 km/h → 3,0 m/s · FX 25,2 km/h → 7,0 m/s · p 1017,2', t19 && t19.t === 12.3 && t19.td === 8.1 && Math.abs(t19.ff - 3) < 1e-9 && Math.abs(t19.fx - 7) < 1e-9 && t19.p === 1017.2, JSON.stringify(t19));
  add('POI: „---" wird null, nicht 0', rows.get(Date.UTC(2026, 8, 14, 18, 0))?.td === null);
  const s = poiSeries(rows, Date.UTC(2026, 8, 14, 18, 0), Date.UTC(2026, 8, 14, 19, 0));
  add('poiSeries: aufsteigend sortiert, Spalten je Zeit', s.obsAtMs.length === 2 && s.obsAtMs[0] < s.obsAtMs[1] && s.t[1] === 12.3);
  const ids = parsePoiListing('<a href="10865-BEOB.csv">10865-BEOB.csv</a> <a href="11035-BEOB.csv">x</a> <a href="P339_-BEOB.csv">y</a>');
  add('POI-Listing: WMO- und P-Kennungen werden erkannt', ids.has('10865') && ids.has('11035') && ids.has('P339_') && ids.size === 3);
  const meta = parseSmnMeta('station_abbr;station_name;station_wigos_id;station_coordinates_wgs84_lat;station_coordinates_wgs84_lon;station_height_masl\nSMA;Zürich / Fluntern;0-20000-0-06660;47.378;8.574;556\nXYZ;Ohne WMO;;46.0;7.0;100');
  add('SMN-Meta: WIGOS 0-20000-0-06660 → WMO 06660 → SMA; Stationen ohne WIGOS fallen weg', meta.get('06660')?.abbr === 'SMA' && meta.size === 1);
  const hm = new Map([[Date.UTC(2026, 8, 14, 19, 0), { temperature: 10, u: 0, v: -5, gust: 8, relativeHumidity: 80, precipitation: 0.6 }]]);
  const hs = hourMapSeries(hm, 0, Date.UTC(2026, 8, 14, 23, 0));
  add('hourMapSeries: u/v → FF 5 m/s aus Nord (360/0°)', hs.ff[0] === 5 && (hs.dd[0] === 0 || hs.dd[0] === 360) && hs.t[0] === 10);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
