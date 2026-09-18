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
export const TAWES_HISTORY_URL = 'https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min';
/** SMN day file: ONLY the running UTC day (measured 2026-09-16: PAY first row 00:00, §9.3.1 (5)). */
export const SMN_NOW_URL = (abbr) => `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${abbr.toLowerCase()}/ogd-smn_${abbr.toLowerCase()}_t_now.csv`;

const TEN_MIN = 600_000;
const HOUR = 3_600_000;
/**
 * The 10-min columns the archive reads itself (PA2 §9.3.1 (6); since PA3 ALL truth columns of
 * TAWES/SMN, no longer via the app's hourly readers `src/sources/geosphereTawes.ts` /
 * `meteoSwissSmn.ts` — those round to the hour floor within 10 min and exclude the current
 * hour, which lost the 23-UTC hour of every day; they carry the station anchor and stay
 * untouched). Stamp = END of the 10-min interval in both networks: SMN measured (hour sums
 * match POI to the digit at six stations), TAWES documented (`RR` = „Niederschlag der letzten
 * 10 Minuten", history starts at 00:10). Names measured on the endpoints 2026-09-17: TAWES
 * `station/historical/tawes-v1-10min/metadata`, SMN `ogd-smn_<abbr>_t_now.csv` header
 * (the gust column is `fkl010z1`; `fkl010d1`, which the app reader asks for, does not exist).
 */
export const TAWES_10MIN = Object.freeze({ t: 'TL', td: 'TP', rh: 'RF', ff: 'FF', dd: 'DD', fx: 'FFX', rr10: 'RR', p: 'PRED' });
export const SMN_10MIN = Object.freeze({ t: 'tre200s0', td: 'tde200s0', rh: 'ure200s0', ff: 'fkl010z0', dd: 'dkl010z0', fx: 'fkl010z1', rr10: 'rre150z0', p: 'pp0qffs0' });

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

/** TAWES metadata JSON → network stations `{ net, id, wmo, name, country, lat, lon, h }` (active only). */
export function parseTawesStations(meta) {
  return (meta.stations ?? [])
    .filter((s) => s.is_active !== false && Number.isFinite(s.lat) && Number.isFinite(s.lon))
    .map((s) => ({ net: 'tawes', id: String(s.id), wmo: /^\d{5}$/.test(String(s.id)) ? String(s.id) : null, name: String(s.name ?? s.id), country: 'AT', lat: s.lat, lon: s.lon, h: Number(s.altitude) }));
}

/** SMN metadata CSV → network stations (all rows with coordinates; canton FL = Liechtenstein). */
export function parseSmnStations(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  const head = lines[0].split(';');
  const i = (n) => head.indexOf(n);
  const out = [];
  for (const line of lines.slice(1)) {
    const f = line.split(';');
    const lat = Number(f[i('station_coordinates_wgs84_lat')]), lon = Number(f[i('station_coordinates_wgs84_lon')]);
    const abbr = f[i('station_abbr')];
    if (!abbr || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const wmo = /^0-20000-0-(\d{5})$/.exec(f[i('station_wigos_id')] ?? '')?.[1] ?? null;
    out.push({ net: 'smn', id: abbr, wmo, name: f[i('station_name')], country: f[i('station_canton')] === 'FL' ? 'LI' : 'CH', lat, lon, h: Number(f[i('station_height_masl')]) });
  }
  return out;
}

/** SMN day file (`_t_now.csv`) → `{ ms, row }[]` with the header, UTC stamps. */
export function parseSmnNowRows(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const head = lines[0].split(';');
  const it = head.indexOf('reference_timestamp');
  const out = [];
  for (const line of lines.slice(1)) {
    const f = line.split(';');
    const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(f[it] ?? '');
    if (m) out.push({ ms: Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]), f, head });
  }
  return out;
}

/** SMN day file → `{ rr10, td, p }` as Map<stampMs, value|null>. */
export function parseSmn10min(csv, cols = SMN_10MIN) {
  const out = Object.fromEntries(Object.keys(cols).map((k) => [k, new Map()]));
  for (const { ms, f, head } of parseSmnNowRows(csv)) {
    for (const [k, name] of Object.entries(cols)) {
      const c = head.indexOf(name);
      const v = c >= 0 && f[c] !== '' ? Number(f[c]) : NaN;
      out[k].set(ms, Number.isFinite(v) ? v : null);
    }
  }
  return out;
}

/** GeoSphere historical JSON → Map<stationId, { rr10, td, p }> (each Map<stampMs, value|null>). */
export function parseTawes10min(json, params = TAWES_10MIN) {
  const stamps = (json.timestamps ?? []).map((s) => Date.parse(s));
  const out = new Map();
  for (const feat of json.features ?? []) {
    const p = feat.properties.parameters;
    const rec = {};
    for (const [k, name] of Object.entries(params)) {
      const data = p[name]?.data ?? [];
      rec[k] = new Map(stamps.map((ms, i) => [ms, data[i] != null && Number.isFinite(data[i]) ? data[i] : null]));
    }
    out.set(String(feat.properties.station), rec);
  }
  return out;
}

/** Hour sum ending at `hourMs`: the six 10-min values stamped h−50 … h; null unless all six exist. */
export function hourSum10(m, hourMs) {
  let s = 0;
  for (let k = 0; k < 6; k++) {
    const v = m.get(hourMs - k * TEN_MIN);
    if (v == null) return null;
    s += v;
  }
  return Math.round(s * 1000) / 1000;
}

/** Hour maximum ending at `hourMs`: the six 10-min peaks stamped h−50 … h; null unless all six exist (a missing peak could be THE peak). */
export function hourMax10(m, hourMs) {
  let x = -Infinity;
  for (let k = 0; k < 6; k++) {
    const v = m.get(hourMs - k * TEN_MIN);
    if (v == null) return null;
    if (v > x) x = v;
  }
  return x;
}

/** The full hours in [fromMs, toMs] for which the 10-min series carries a stamp (in any column). */
export function tenMinHourStamps(series, fromMs, toMs) {
  const hours = new Set();
  for (const m of Object.values(series)) {
    for (const ms of m.keys()) if (ms % HOUR === 0 && ms >= fromMs && ms <= toMs) hours.add(ms);
  }
  return [...hours].sort((a, b) => a - b);
}

/**
 * Truth columns of a 10-min network at the record's hours (PA3): the value AT the hour stamp
 * for t/td/rh/ff/dd/fx/p, `rr1` = 10-min amount at the stamp × 6 (the PA1 „rate", kept for
 * continuity), `rr1h` = hour sum (six values), `fxh` = hour maximum of the gust (six peaks).
 */
export function tenMinColumns(series, obsAtMs) {
  const at = (k) => obsAtMs.map((h) => series[k]?.get(h) ?? null);
  return {
    t: at('t'), td: at('td'), rh: at('rh'), ff: at('ff'), dd: at('dd'), fx: at('fx'), p: at('p'),
    rr1: obsAtMs.map((h) => { const v = series.rr10?.get(h); return v == null ? null : Math.round(v * 6 * 1000) / 1000; }),
    rr1h: obsAtMs.map((h) => (series.rr10 ? hourSum10(series.rr10, h) : null)),
    fxh: obsAtMs.map((h) => (series.fx ? hourMax10(series.fx, h) : null)),
  };
}

/** Ordered obs series (hourly) from a POI map, within [fromMs, toMs]. */
export function poiSeries(rows, fromMs, toMs) {
  const ms = [...rows.keys()].filter((t) => t >= fromMs && t <= toMs).sort((a, b) => a - b);
  const pick = (k) => ms.map((t) => rows.get(t)[k]);
  return { obsAtMs: ms, t: pick('t'), td: pick('td'), rh: pick('rh'), ff: pick('ff'), dd: pick('dd'), fx: pick('fx'), rr1: pick('rr1'), n: pick('n'), p: pick('p') };
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
  // PA2/PA3: 10-min columns. Stamp = interval END ⇒ the hour 12:00 is the sum of the stamps 11:10…12:00.
  const smnHead = 'station_abbr;reference_timestamp;tre200s0;ure200s0;fkl010z0;dkl010z0;fkl010z1;rre150z0;tde200s0;pp0qffs0';
  const smnCsv = [smnHead,
    ...['11:00', '11:10', '11:20', '11:30', '11:40', '11:50', '12:00'].map((t, i) => `SAE;16.09.2026 ${t};1.0;9${i};3.${i};27${i};${[6, 4.1, 5.5, 12.3, 3, 2.2, 7][i]};${[9, 0.5, 0.5, 1, 0, 0.2, 1][i]};${i === 6 ? '-2.5' : ''};${i === 6 ? '1016.4' : ''}`)].join('\n');
  const sm = parseSmn10min(smnCsv);
  const h12 = Date.UTC(2026, 8, 16, 12, 0);
  add('SMN 10 min: Stundensumme 12:00 = Stempel 11:10…12:00 = 3,2 mm (der 9-mm-Wert um 11:00 gehört zur Vorstunde)', hourSum10(sm.rr10, h12) === 3.2, String(hourSum10(sm.rr10, h12)));
  add('SMN 10 min: fehlt einer der sechs Werte, ist die Stundensumme null (nicht zu klein)', hourSum10(sm.rr10, Date.UTC(2026, 8, 16, 11, 0)) === null);
  const cols = tenMinColumns(sm, [h12]);
  add('SMN 10 min: td und p am Stundenstempel (−2,5 °C, 1016,4 hPa), leere Zelle ⇒ null', cols.td[0] === -2.5 && cols.p[0] === 1016.4 && sm.td.get(Date.UTC(2026, 8, 16, 11, 50)) === null && cols.rr1h[0] === 3.2);
  add('PA3: t/rh/ff/dd/fx AM Stempel 12:00 (1,0 · 96 · 3,6 · 276 · 7), rr1 = 10-min × 6 = 6 mm/h, fxh = Maximum der sechs Spitzen 11:10…12:00 = 12,3 (die 6 um 11:00 gehört zur Vorstunde)',
    cols.t[0] === 1 && cols.rh[0] === 96 && cols.ff[0] === 3.6 && cols.dd[0] === 276 && cols.fx[0] === 7 && cols.rr1[0] === 6 && cols.fxh[0] === 12.3, JSON.stringify(cols));
  add('PA3: fehlt eine der sechs Spitzen, ist fxh null (die fehlende könnte DIE Spitze sein)', hourMax10(sm.fx, Date.UTC(2026, 8, 16, 11, 0)) === null);
  add('PA3: tenMinHourStamps liefert nur volle Stunden im Fenster (11:00, 12:00), Fenster ab 11:30 nur 12:00',
    tenMinHourStamps(sm, Date.UTC(2026, 8, 16, 10, 0), h12).join() === [Date.UTC(2026, 8, 16, 11, 0), h12].join() && tenMinHourStamps(sm, Date.UTC(2026, 8, 16, 11, 30), h12).join() === String(h12));
  const tj = { timestamps: ['2026-09-16T11:10+00:00', '2026-09-16T11:20+00:00', '2026-09-16T11:30+00:00', '2026-09-16T11:40+00:00', '2026-09-16T11:50+00:00', '2026-09-16T12:00+00:00'],
    features: [{ properties: { station: '11343', parameters: { RR: { data: [0.1, 0.1, 0, 0, null, 0.2] }, TP: { data: [0, 0, 0, 0, 0, -8.1] }, PRED: { data: [null, null, null, null, null, 1019] },
      TL: { data: [1, 1, 1, 1, 1, -3.4] }, RF: { data: [90, 90, 90, 90, 90, 97] }, FF: { data: [5, 5, 5, 5, 5, 8.2] }, DD: { data: [200, 200, 200, 200, 200, 231] }, FFX: { data: [9, 22.5, 9, 9, 9, 12] } } } }] };
  const tm = parseTawes10min(tj).get('11343');
  add('TAWES 10 min: ein fehlender RR-Wert ⇒ Stundensumme null; td −8,1 und p 1019 am Stempel 12:00', hourSum10(tm.rr10, h12) === null && tm.td.get(h12) === -8.1 && tm.p.get(h12) === 1019);
  const tc = tenMinColumns(tm, [h12]);
  add('PA3 TAWES: t −3,4 · rh 97 · ff 8,2 · dd 231 · fx 12 am Stempel, fxh = 22,5 (Spitze um 11:20), rr1 = 1,2 mm/h (0,2 × 6), rr1h null',
    tc.t[0] === -3.4 && tc.rh[0] === 97 && tc.ff[0] === 8.2 && tc.dd[0] === 231 && tc.fx[0] === 12 && tc.fxh[0] === 22.5 && tc.rr1[0] === 1.2 && tc.rr1h[0] === null, JSON.stringify(tc));
  add('PA3: die Spaltennamen beider Netze sind an den Endpunkten gemessen (SMN-Böe fkl010z1, TAWES-Böe FFX)',
    SMN_10MIN.fx === 'fkl010z1' && TAWES_10MIN.fx === 'FFX' && Object.keys(SMN_10MIN).join() === Object.keys(TAWES_10MIN).join());
  const st = parseTawesStations({ stations: [{ id: '11343', name: 'SONNBLICK', lat: 47.05, lon: 12.96, altitude: 3109, is_active: true }, { id: '8989117', name: 'WEIZ - TESTSTATION', lat: 47.2, lon: 15.6, altitude: 480, is_active: true }, { id: '11999', name: 'ALT', lat: 47, lon: 13, altitude: 1, is_active: false }] });
  add('TAWES-Stationen: aktive nur, 11xxx trägt die Synop-Kennung als wmo, 8989xxx nicht', st.length === 2 && st[0].wmo === '11343' && st[0].h === 3109 && st[1].wmo === null);
  const ss = parseSmnStations('station_abbr;station_name;station_canton;station_wigos_id;station_height_masl;station_coordinates_wgs84_lat;station_coordinates_wgs84_lon\nVAD;Vaduz;FL;0-20000-0-06990;457.0;47.128;9.518\nXYZ;Ohne WMO;BE;0-756-0-1;900;46.5;7.5');
  add('SMN-Stationen: Kanton FL ⇒ LI, WIGOS-WMO übernommen, nationale WIGOS ⇒ wmo null', ss[0].country === 'LI' && ss[0].wmo === '06990' && ss[0].h === 457 && ss[1].country === 'CH' && ss[1].wmo === null);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}
