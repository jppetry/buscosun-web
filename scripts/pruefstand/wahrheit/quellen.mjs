/**
 * quellen.mjs — the three official ground networks as 10-min series (truth W1, `audit/pruefstand-plan.md` §3):
 *   DE  DWD CDC 10-min (air_temperature, wind, extreme_wind, precipitation: historical + recent + now) and hourly cloudiness
 *   AT  GeoSphere klima-v2-10min (quality-checked; no dew point ⇒ Magnus from tl and rf, marked `derived`)
 *   CH  MeteoSwiss SwissMetNet `ogd-smn` (10-min station files: historical decade, recent, now) — "Source: MeteoSwiss"
 *
 * Raw files are cached under `<PS_ROOT>/quellen/`. Two read-only shortcuts avoid a second download of what the hindcast
 * already fetched from the SAME originals: its `cache/truth/geosphere/klima-v2-10min/<month>/<id>.json.gz` (months
 * marked `final`) and `cache/truth/smn/<ABBR>/t_historical_*.csv`. Nothing is written there.
 *
 * A series is `{ t0Ms, n, cols: { t, td, rh, ff, dd, fx, rr } }` — Float32 per 10-min stamp (UTC, interval end), NaN =
 * missing — plus `{ n1: { t0Ms, n, clct } }` hourly for DE cloudiness, and `notes` (duplicates, derived values).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { unzip } from '../lib/zip.mjs';
import { PS_ROOT, HINDCAST_ROOT, H, TEN, cachedGet, p, sleep } from '../lib/common.mjs';

const Q = p(PS_ROOT, 'quellen');
const CDC = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate';
export const CDC_PRODUCTS = Object.freeze({
  tu: { dir: '10_minutes/air_temperature', tag: 'TU', cols: { t: 'TT_10', td: 'TD_10', rh: 'RF_10' } },
  ff: { dir: '10_minutes/wind', tag: 'wind', cols: { ff: 'FF_10', dd: 'DD_10' } },
  fx: { dir: '10_minutes/extreme_wind', tag: 'extrema_wind', cols: { fx: 'FX_10' } },
  rr: { dir: '10_minutes/precipitation', tag: 'nieder', cols: { rr: 'RWS_10' } },
});
const FRESH_MS = 20 * H;   // `recent`/`now` files and open months are re-fetched when the cached copy is older
const stale = (path) => !existsSync(path) || Date.now() - statSync(path).mtimeMs > FRESH_MS;
export const COLS10 = Object.freeze(['t', 'td', 'rh', 'ff', 'dd', 'fx', 'rr']);

export function emptySeries(fromMs, toMs) {
  const n = Math.floor((toMs - fromMs) / TEN) + 1;
  const cols = {};
  for (const c of COLS10) cols[c] = new Float32Array(n).fill(NaN);
  return { t0Ms: fromMs, n, cols, notes: { duplicates: 0, derived: [], files: [] } };
}
const put = (ser, col, ms, v, notes) => {
  const i = (ms - ser.t0Ms) / TEN;
  if (!Number.isInteger(i) || i < 0 || i >= ser.n || !Number.isFinite(v)) return;
  ser.cols[col][i] = v;
};

// ── DE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const listings = new Map();
async function cdcHistNames(dir, sid) {
  if (!listings.has(dir)) {
    const html = (await cachedGet(`${CDC}/${dir}/historical/`, p(Q, 'cdc', `listing-${dir.replace(/\W+/g, '_')}.html`))).toString('latin1');
    const by = new Map();
    for (const m of html.matchAll(/href="([^"]*_(\d{5})_(\d{8})_(\d{8})_hist\.zip)"/g)) { if (!by.has(m[2])) by.set(m[2], []); by.get(m[2]).push({ name: m[1], from: m[3], to: m[4] }); }
    listings.set(dir, by);
  }
  return listings.get(dir).get(sid) ?? [];
}
const stamp12 = (ms) => new Date(ms).toISOString().replace(/[-T:]/g, '').slice(0, 12);
/** Parses one CDC product file (`produkt_*.txt` in the ZIP); rows before `fromStamp` are skipped without splitting. */
function parseCdc(zipBuf, fromStamp, toStamp, onRow) {
  const prod = unzip(zipBuf).find((e) => /^produkt_/.test(e.name));
  if (!prod) return 0;
  const txt = prod.data.toString('latin1');
  const nl = txt.indexOf('\n');
  const head = txt.slice(0, nl).split(';').map((s) => s.trim());
  let n = 0, pos = nl + 1;
  while (pos < txt.length) {
    let e = txt.indexOf('\n', pos); if (e < 0) e = txt.length;
    const line = txt.slice(pos, e); pos = e + 1;
    const s1 = line.indexOf(';'), s2 = line.indexOf(';', s1 + 1);
    if (s1 < 0 || s2 < 0) continue;
    const st = line.slice(s1 + 1, s2).trim();
    const key = st.length === 10 ? `${st}00` : st;
    if (key < fromStamp || key > toStamp) continue;
    onRow(head, line.split(';'), Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10), +key.slice(10, 12)));
    n++;
  }
  return n;
}
const num = (s) => { const v = Number(s); return Number.isFinite(v) && v !== -999 ? v : NaN; };

/** DE: downloads (cached) and reads the 10-min products of one CDC station for [fromMs, toMs]. `fetchOnly` skips parsing. */
export async function readCdc(sid, vars, fromMs, toMs, { fetchOnly = false, offline = false } = {}) {
  const ser = emptySeries(fromMs, toMs);
  const fromStamp = stamp12(fromMs), toStamp = stamp12(toMs);
  const qnSeen = {};
  for (const k of Object.keys(CDC_PRODUCTS)) {
    if (!vars.includes(k)) continue;
    const P = CDC_PRODUCTS[k];
    const files = [];
    for (const h of await cdcHistNames(P.dir, sid)) if (h.to >= fromStamp.slice(0, 8) && h.from <= toStamp.slice(0, 8)) files.push({ url: `${CDC}/${P.dir}/historical/${h.name}`, path: p(Q, 'cdc', k, h.name), fixed: true });
    files.push({ url: `${CDC}/${P.dir}/recent/10minutenwerte_${P.tag}_${sid}_akt.zip`, path: p(Q, 'cdc', k, `10minutenwerte_${P.tag}_${sid}_akt.zip`) });
    files.push({ url: `${CDC}/${P.dir}/now/10minutenwerte_${P.tag}_${sid}_now.zip`, path: p(Q, 'cdc', k, `10minutenwerte_${P.tag}_${sid}_now.zip`) });
    for (const f of files) {
      const buf = await cachedGet(f.url, f.path, { refresh: !offline && !f.fixed && stale(f.path) });
      if (!buf || fetchOnly) continue;
      const seen = new Set();
      const rows = parseCdc(buf, fromStamp, toStamp, (head, cells, ms) => {
        if (seen.has(ms)) ser.notes.duplicates += 1; else seen.add(ms);
        const qn = cells[head.indexOf('QN')]?.trim(); if (qn) qnSeen[qn] = (qnSeen[qn] ?? 0) + 1;
        for (const [col, name] of Object.entries(P.cols)) put(ser, col, ms, num(cells[head.indexOf(name)]));
      });
      ser.notes.files.push(`${f.path.split('/').pop()}: ${rows}`);
    }
  }
  ser.notes.qn = qnSeen;
  return ser;
}
/** DE: hourly cloud cover (eighths → %, −1 = not determinable ⇒ missing). */
export async function readCdcClouds(sid, fromMs, toMs, { offline = false } = {}) {
  const n = Math.floor((toMs - fromMs) / H) + 1;
  const clct = new Float32Array(n).fill(NaN);
  const dir = 'hourly/cloudiness';
  const files = [];
  for (const h of await cdcHistNames(dir, sid)) if (h.to >= stamp12(fromMs).slice(0, 8)) files.push({ url: `${CDC}/${dir}/historical/${h.name}`, path: p(Q, 'cdc', 'n', h.name), fixed: true });
  files.push({ url: `${CDC}/${dir}/recent/stundenwerte_N_${sid}_akt.zip`, path: p(Q, 'cdc', 'n', `stundenwerte_N_${sid}_akt.zip`) });
  for (const f of files) {
    const buf = await cachedGet(f.url, f.path, { refresh: !offline && !f.fixed && stale(f.path) });
    if (!buf) continue;
    parseCdc(buf, stamp12(fromMs), stamp12(toMs), (head, cells, ms) => {
      const v = num(cells[head.indexOf('V_N')]);
      const i = (ms - fromMs) / H;
      if (Number.isInteger(i) && i >= 0 && i < n && Number.isFinite(v) && v >= 0 && v <= 8) clct[i] = v * 12.5;
    });
  }
  return { t0Ms: fromMs, n, clct };
}

// ── AT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GEO = 'https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v2-10min';
const KLIMA_PARAMS = ['tl', 'rf', 'ff', 'dd', 'ffx', 'rr'];
const KLIMA_COL = { tl: 't', rf: 'rh', ff: 'ff', dd: 'dd', ffx: 'fx', rr: 'rr' };
/** Magnus (Sonntag 1990, over water), the same constants as the hindcast's truth: e = 6,112·exp(17,62·t/(243,12+t)). */
export function dewPointMagnus(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh) || rh <= 0) return NaN;
  const g = Math.log(Math.min(100, rh) / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
}
const monthsOf = (fromMs, toMs) => { const out = []; const d = new Date(fromMs); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); while (d.getTime() <= toMs) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); } return out; };
const monthEndMs = (m) => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.getTime(); };
const klimaMonth = new Map();   // `${month}` → Map<id, { stamps, params }> from our own chunk files
async function ownKlimaMonth(month, ids, offline) {
  if (klimaMonth.has(month)) return klimaMonth.get(month);
  const by = new Map();
  const start = new Date(Date.parse(`${month}-01T00:00:00Z`) - 50 * 60_000).toISOString().slice(0, 16), end = new Date(monthEndMs(month)).toISOString().slice(0, 16);
  const open = monthEndMs(month) + 7 * 24 * H > Date.now();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const path = p(Q, 'klima', month, `chunk-${String(i / 20).padStart(2, '0')}.json`);
    const url = `${GEO}?parameters=${KLIMA_PARAMS.join(',')}&station_ids=${chunk.join(',')}&start=${start}&end=${end}&output_format=geojson`;
    const buf = await cachedGet(url, path, { pauseMs: 1500, refresh: !offline && open && stale(path) });
    if (!buf) continue;
    const j = JSON.parse(buf.toString('utf8'));
    const stamps = j.timestamps.map((s) => Date.parse(s));
    for (const f of j.features ?? []) by.set(String(f.properties.station), { stamps, params: Object.fromEntries(Object.entries(f.properties.parameters).map(([k, o]) => [k, o.data])) });
    await sleep(200);
  }
  klimaMonth.set(month, by);
  return by;
}
/** AT: one klima-v2 station for [fromMs, toMs]; `allIds` = every klima id of the network (own months are fetched in chunks). */
export async function readKlima(id, allIds, fromMs, toMs, { offline = false } = {}) {
  const ser = emptySeries(fromMs, toMs);
  for (const month of monthsOf(fromMs, toMs)) {
    let rec = null;
    const hc = p(HINDCAST_ROOT, 'cache/truth/geosphere/klima-v2-10min', month, `${id}.json.gz`);
    if (existsSync(hc)) { const j = JSON.parse(gunzipSync(readFileSync(hc)).toString('utf8')); if (j.final === true) { rec = { stamps: j.timestamps.map((s) => Date.parse(s)), params: Object.fromEntries(Object.entries(j.parameters).map(([k, o]) => [k, o.data])) }; ser.notes.files.push(`hindcast-cache ${month}`); } }
    if (!rec) { rec = (await ownKlimaMonth(month, allIds, offline)).get(String(id)) ?? null; if (rec) ser.notes.files.push(`klima-v2 ${month}`); }
    if (!rec) continue;
    for (const [k, col] of Object.entries(KLIMA_COL)) { const data = rec.params[k]; if (!data) continue; for (let i = 0; i < rec.stamps.length; i++) if (data[i] != null) put(ser, col, rec.stamps[i], Number(data[i])); }
  }
  for (let i = 0; i < ser.n; i++) ser.cols.td[i] = dewPointMagnus(ser.cols.t[i], ser.cols.rh[i]);
  ser.notes.derived.push('td = Magnus(tl, rf)');
  return ser;
}

// ── CH ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SMN = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn';
const SMN_COL = { t: 'tre200s0', td: 'tde200s0', rh: 'ure200s0', ff: 'fkl010z0', dd: 'dkl010z0', fx: 'fkl010z1', rr: 'rre150z0' };
function parseSmn(txt, ser) {
  const nl = txt.indexOf('\n');
  const head = txt.slice(0, nl).trim().split(';');
  const it = head.indexOf('reference_timestamp');
  const idx = Object.fromEntries(Object.entries(SMN_COL).map(([c, name]) => [c, head.indexOf(name)]));
  let pos = nl + 1, rows = 0;
  const lo = ser.t0Ms, hi = ser.t0Ms + (ser.n - 1) * TEN;
  while (pos < txt.length) {
    let e = txt.indexOf('\n', pos); if (e < 0) e = txt.length;
    const line = txt.slice(pos, e); pos = e + 1;
    if (line.length < 20) continue;
    const f = line.split(';');
    const s = f[it];
    const ms = Date.UTC(+s.slice(6, 10), +s.slice(3, 5) - 1, +s.slice(0, 2), +s.slice(11, 13), +s.slice(14, 16));
    if (!(ms >= lo && ms <= hi)) continue;
    for (const [c, i] of Object.entries(idx)) if (i >= 0 && f[i] !== '' && f[i] != null) put(ser, c, ms, Number(f[i]));
    rows++;
  }
  return rows;
}
/** CH: one SwissMetNet station for [fromMs, toMs]. */
export async function readSmn(abbr, fromMs, toMs, { offline = false } = {}) {
  const ser = emptySeries(fromMs, toMs);
  const a = abbr.toLowerCase();
  const hcDir = p(HINDCAST_ROOT, 'cache/truth/smn', abbr.toUpperCase());
  const thisYear = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  if (fromMs < thisYear) {
    const hist = existsSync(hcDir) ? readdirSync(hcDir).find((f) => /^t_historical_.*\.csv$/.test(f)) : null;
    if (hist) ser.notes.files.push(`hindcast-cache ${hist}: ${parseSmn(readFileSync(p(hcDir, hist), 'latin1'), ser)}`);
    else {
      const dec = `${Math.floor(new Date(fromMs).getUTCFullYear() / 10) * 10}-${Math.floor(new Date(fromMs).getUTCFullYear() / 10) * 10 + 9}`;
      const buf = await cachedGet(`${SMN}/${a}/ogd-smn_${a}_t_historical_${dec}.csv`, p(Q, 'smn', `${a}_t_historical_${dec}.csv`));
      if (buf) ser.notes.files.push(`historical ${dec}: ${parseSmn(buf.toString('latin1'), ser)}`);
    }
  }
  if (toMs >= thisYear) {
    for (const kind of ['recent', 'now']) {
      const path = p(Q, 'smn', `${a}_t_${kind}.csv`);
      const buf = await cachedGet(`${SMN}/${a}/ogd-smn_${a}_t_${kind}.csv`, path, { refresh: !offline && stale(path) });
      if (buf) ser.notes.files.push(`${kind}: ${parseSmn(buf.toString('latin1'), ser)}`);
    }
  }
  return ser;
}
