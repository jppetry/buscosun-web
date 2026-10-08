#!/usr/bin/env node
/**
 * obs-mirror.mjs — Phase OB (`audit/stationsmessungen.md`): every open, real measuring station of the DACH area with its
 * CURRENT measurements in `buscosun-data/obs/v1/`, precipitation-only stations included.
 *
 * Sources (all official, open, measured — no model value, no gap filling):
 *   dwd10    DWD CDC 10-minute „now“ (air temperature, precipitation, wind, wind extremes, solar) — one zip per station
 *            and product; only files whose Last-Modified changed are fetched (the directory listing carries it)
 *   dwdDay   DWD CDC daily precipitation stations (`daily/more_precip/recent`) — the manual and automatic precipitation
 *            network; value of day D = 05:50 UTC D … 05:50 UTC D+1 (measured against the 10-min sums, §2.4)
 *   tawes    GeoSphere Austria TAWES (`station/historical/tawes-v1-10min`, near real time; refetches the last hours, so a
 *            lost commit heals)
 *   smn      MeteoSwiss SwissMetNet (`ogd-smn/<abbr>/…_t_now.csv`, conditional GET)
 *   smnp     MeteoSwiss automatic precipitation stations (`ogd-smn-precip`, conditional GET)
 *   nime     MeteoSwiss manual precipitation stations (`ogd-nime/<abbr>/…_d_recent.csv`, daily, 06 UTC … 06 UTC D+1)
 *
 * Each source is polled on its own rhythm (`SOURCES[*].slots` = minutes past the hour of the measured delivery, `retryMin`, §2 of the audit): a poll at
 * the expected minute, then retries every `retryMin` until the new stamp is there. Stamps are UTC, END of the interval
 * (10-min sources) or the date of the daily period.
 *
 * Store (= `obs/v1/` in buscosun-data):
 *   stations.json          catalog: id, name, lat, lon, elev, country, region, networks, variables
 *   latest.json            per station the newest values (+ rr1h/rr24h with completeness, newest daily value)
 *   series/<source>.json   10-min sources: the last 26 h (complete 24-h sums for lagging stamps); daily sources: the last 10 days (column per station and variable)
 *   status.json            per source: last poll, newest stamp, stations with data, errors, rhythm
 *   state.json             conditional-GET state (Last-Modified per file) — only for the mirror
 *
 * No dependencies (Node ≥ 20: fetch, zlib). Usage:
 *   node obs-mirror.mjs --store=<dir> [--once] [--sources=dwd10,tawes] [--repo=<sparse clone> --push] [--minutes=345]
 *   node obs-mirror.mjs --self-test
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const SCHEMA = 1;
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const CDC = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate';
const GSA = 'https://dataset.api.hub.geosphere.at/v1/station';
const OGD = 'https://data.geo.admin.ch';
const UA = 'buscosun-obs-mirror (+https://buscosun.com)';

/** Variables of the product (unit fixed per variable, independent of the source). */
export const VARS = Object.freeze({
  t: '°C Lufttemperatur 2 m', td: '°C Taupunkt', rh: '% relative Feuchte', ps: 'hPa Luftdruck in Stationshöhe',
  p: 'hPa Luftdruck reduziert (QFF/PRED, Bezugsniveau je Netz)', ff: 'm/s Wind 10-min-Mittel', dd: '° Windrichtung',
  fx: 'm/s Böenspitze im Intervall', rr: 'mm Niederschlag im Intervall', sd: 'min Sonnenscheindauer im Intervall',
  gr: 'W/m² Globalstrahlung (Intervallmittel)', snow: 'cm Schneehöhe', nsnow: 'cm Neuschnee (Tageswert)',
});

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

// ───────────────────────────── sources ─────────────────────────────
/**
 * Rhythm per source, measured 07.10.2026 (Last-Modified and newest stamp polled every minute for 60 min, audit §2.2):
 * `slots` = minutes past the hour at which a new delivery is expected (delivery + 1 min), `retryMin` = repeat interval
 * while a slot has brought nothing new (until the next slot). `step` = interval of the values.
 */
export const SOURCES = Object.freeze({
  // TU at :20/:50, precipitation at :10/:40, wind/extremes/solar at :15/:45 (each half-hourly, values up to ≈ 30 min old)
  dwd10: { label: 'DWD CDC 10 min (now)', step: 10, windowH: 26, slots: [11, 16, 21, 41, 46, 51], retryMin: 3, country: 'DE' },
  // daily files are rewritten once a day (≈ 09:15 UTC measured); the listing is one request ⇒ hourly check
  dwdDay: { label: 'DWD CDC Niederschlag täglich', step: 'day', windowD: 10, slots: [17], retryMin: 60, country: 'DE' },
  // every 10 min, the stamp is there ≈ 1 min after it
  tawes: { label: 'GeoSphere TAWES 10 min', step: 10, windowH: 26, slots: [2, 12, 22, 32, 42, 52], retryMin: 2, country: 'AT' },
  // OGD `t_now` every 20 min (:08/:28/:48, newest stamp ≈ 8 min old); the collective file VQHA80/VQHA98 every 10 min
  // (:x0, newest stamp 10 min old) ⇒ both, OGD overrides the same stamp (it is the documented product)
  smn: { label: 'MeteoSchweiz SwissMetNet 10 min', step: 10, windowH: 26, slots: [1, 9, 11, 21, 29, 31, 41, 49, 51], retryMin: 3, country: 'CH' },
  smnp: { label: 'MeteoSchweiz Niederschlagsstationen 10 min', step: 10, windowH: 26, slots: [1, 9, 11, 21, 29, 31, 41, 49, 51], retryMin: 3, country: 'CH' },
  // `d_recent` rewritten once a day (≈ 11:19 UTC measured); conditional GET ⇒ hourly check costs 304s
  nime: { label: 'MeteoSchweiz manuelle Niederschlagsstationen täglich', step: 'day', windowD: 10, slots: [25], retryMin: 60, country: 'CH' },
});

/** DWD 10-min products: directory, file pattern, columns → variable (with conversion). */
export const DWD10 = Object.freeze({
  tu: { dir: 'air_temperature', re: /^10minutenwerte_TU_(\d{5})_now\.zip$/, list: 'zehn_now_tu_Beschreibung_Stationen.txt',
    cols: { TT_10: ['t'], RF_10: ['rh'], TD_10: ['td'], PP_10: ['ps'] } },
  rr: { dir: 'precipitation', re: /^10minutenwerte_nieder_(\d{5})_now\.zip$/, list: 'zehn_now_rr_Beschreibung_Stationen.txt',
    cols: { RWS_10: ['rr'] } },
  ff: { dir: 'wind', re: /^10minutenwerte_wind_(\d{5})_now\.zip$/, list: 'zehn_now_ff_Beschreibung_Stationen.txt',
    cols: { FF_10: ['ff'], DD_10: ['dd'] } },
  fx: { dir: 'extreme_wind', re: /^10minutenwerte_extrema_wind_(\d{5})_now\.zip$/, list: 'zehn_now_fx_Beschreibung_Stationen.txt',
    cols: { FX_10: ['fx'] } },
  // SD_10 in hours → minutes; GS_10 in J/cm² per 10 min → W/m² (× 10 000 / 600)
  sd: { dir: 'solar', re: /^10minutenwerte_SOLAR_(\d{5})_now\.zip$/, list: 'zehn_now_sd_Beschreibung_Stationen.txt',
    cols: { SD_10: ['sd', (x) => r1(x * 60)], GS_10: ['gr', (x) => r1(x * 10000 / 600)] } },
});
export const TAWES_COLS = Object.freeze({ TL: 't', TP: 'td', RF: 'rh', P: 'ps', PRED: 'p', FF: 'ff', DD: 'dd', FFX: 'fx', RR: 'rr', SO: 'sd', GLOW: 'gr', SCHNEE: 'snow' });
/** GeoSphere `klima-v2-10min` — only for active stations more than `KLIMA_EXTRA_KM` from every TAWES station (the rest are the TAWES sites under another id). */
export const KLIMA_COLS = Object.freeze({ tl: 't', rf: 'rh', p: 'ps', pred: 'p', ff: 'ff', dd: 'dd', ffx: 'fx', rr: 'rr', so: 'sd', cglo: 'gr', sh: 'snow' });
export const KLIMA_EXTRA_KM = 3;
export const SMN_COLS = Object.freeze({ tre200s0: 't', tde200s0: 'td', ure200s0: 'rh', prestas0: 'ps', pp0qffs0: 'p', fkl010z0: 'ff', dkl010z0: 'dd', fkl010z1: 'fx', rre150z0: 'rr', sre000z0: 'sd', gre000z0: 'gr', htoauts0: 'snow' });
export const SMNP_COLS = Object.freeze({ rre150z0: 'rr' });
export const NIME_COLS = Object.freeze({ rre150d0: 'rr', hto000d0: 'snow', hns000d0: 'nsnow' });
/** Collective current-value files (`messwerte-aktuell`, one file for all stations, stamp YYYYMMDDHHMM UTC). Wind in km/h. */
export const VQHA = Object.freeze({
  smn: { url: 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv',
    cols: { tre200s0: ['t'], tde200s0: ['td'], ure200s0: ['rh'], prestas0: ['ps'], pp0qffs0: ['p'], fu3010z0: ['ff', (x) => r1(x / 3.6)], dkl010z0: ['dd'], fu3010z1: ['fx', (x) => r1(x / 3.6)], rre150z0: ['rr'], sre000z0: ['sd'], gre000z0: ['gr'] } },
  smnp: { url: 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA98.csv', cols: { rre150z0: ['rr'] } },
});
/** VQHA csv → Map(abbr → [{ ms, v }]). */
export function parseVqha(txt, cols) {
  const out = new Map();
  for (const row of parseCsv(txt)) {
    const abbr = row['Station/Location']?.trim(), s = row.Date?.trim();
    if (!abbr || !/^\d{12}$/.test(s ?? '')) continue;
    const v = {};
    for (const [c, [name, conv]] of Object.entries(cols)) { const x = num(row[c]); if (x != null) v[name] = conv ? conv(x) : x; }
    out.set(abbr, [{ ms: dwdMs(s), v }]);
  }
  return out;
}
const OGD_NET = Object.freeze({ smn: 'ogd-smn', smnp: 'ogd-smn-precip', nime: 'ogd-nime' });

// ───────────────────────────── parsers (pure) ─────────────────────────────
/** Apache listing → Map(file → Last-Modified ms). */
export function parseListing(html) {
  const out = new Map();
  const re = /<a href="([^"]+)">[^<]*<\/a>\s+(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/g;
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  for (const m of html.matchAll(re)) out.set(m[1], Date.UTC(+m[4], M[m[3]], +m[2], +m[5], +m[6], +(m[7] ?? 0)));
  return out;
}

/** Minimal ZIP reader (central directory, stored/deflate) → [{ name, data: Buffer }]. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: kein Endverzeichnis');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: Zentralverzeichnis kaputt');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('latin1', p + 46, p + 46 + nl);
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const raw = buf.subarray(start, start + csize);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null });
    p += 46 + nl + el + cl;
  }
  return out;
}

const num = (s) => { const t = String(s ?? '').trim(); if (t === '' || t === '-') return null; const x = Number(t); return Number.isFinite(x) && x > -999 ? x : null; };
/** DWD stamp YYYYMMDDHHMM (UTC) → ms. */
const dwdMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
/** OGD stamp dd.mm.yyyy HH:MM (UTC) → ms. */
const ogdMs = (s) => { const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/.exec(s.trim()); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null; };
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** One DWD `produkt_*.txt` (semicolon, `eor`) → [{ ms, v: {var: value} }]. `cols` = product columns. */
export function parseDwdProdukt(txt, cols, stampDay = false) {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const hdr = lines[0].split(';').map((h) => h.trim());
  const idx = Object.entries(cols).map(([c, spec]) => [hdr.indexOf(c), spec]).filter(([i]) => i >= 0);
  const out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(';');
    const s = c[1]?.trim();
    if (!s) continue;
    const ms = stampDay ? Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : dwdMs(s);
    const v = {};
    for (const [i, [name, conv]] of idx) { const x = num(c[i]); if (x != null) v[name] = conv ? conv(x) : x; }
    out.push({ ms, v });
  }
  return out;
}

/** DWD station list (fixed width, latin1) → [{ id, from, to, elev, lat, lon, name, state }]. */
export function parseDwdStationList(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*(\d{1,5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const rest = m[7].split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
    out.push({ id: m[1].padStart(5, '0'), from: m[2], to: m[3], elev: Number(m[4]), lat: Number(m[5]), lon: Number(m[6]), name: rest[0], state: rest[1] ?? null });
  }
  return out;
}

/** OGD csv (`;`, first line header) → rows as objects. */
export function parseCsv(txt) {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const hdr = lines[0].split(';').map((h) => h.trim());
  return lines.slice(1).map((l) => { const c = l.split(';'); const o = {}; hdr.forEach((h, i) => { o[h] = c[i]; }); return o; });
}

/** OGD measurement csv → [{ ms, v }]. */
export function parseOgdSeries(txt, cols) {
  const out = [];
  for (const row of parseCsv(txt)) {
    const ms = ogdMs(row.reference_timestamp ?? '');
    if (ms == null) continue;
    const v = {};
    for (const [c, name] of Object.entries(cols)) { const x = num(row[c]); if (x != null) v[name] = x; }
    out.push({ ms, v });
  }
  return out;
}

// ───────────────────────────── store ─────────────────────────────
/** In memory: series[source] = Map(stationId → Map(ms → {var: value})). */
export function emptyStore() {
  return { stations: new Map(), series: Object.fromEntries(Object.keys(SOURCES).map((k) => [k, new Map()])), status: { sources: {} }, state: {} };
}

export function putValues(store, source, stationId, rows) {
  const m = store.series[source];
  let st = m.get(stationId);
  if (!st) { st = new Map(); m.set(stationId, st); }
  let added = 0;
  for (const { ms, v } of rows) {
    if (!Object.keys(v).length) continue;
    const old = st.get(ms);
    if (!old) added++;
    st.set(ms, { ...(old ?? {}), ...v });
  }
  return added;
}

/** Drop values outside the window and in the future (> now + 15 min). */
export function trim(store, nowMs) {
  for (const [src, m] of Object.entries(store.series)) {
    const cfg = SOURCES[src];
    const from = cfg.step === 'day' ? Date.UTC(...ymd(nowMs - cfg.windowD * DAY)) : nowMs - cfg.windowH * HOUR;
    for (const [id, st] of m) {
      for (const ms of st.keys()) if (ms < from || ms > nowMs + 15 * MIN) st.delete(ms);
      if (!st.size) m.delete(id);
    }
  }
}
const ymd = (ms) => { const d = new Date(ms); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };

/** Series file (columnar): common time axis, per station per variable an array (null = no value). */
export function seriesDoc(store, source, nowMs) {
  const cfg = SOURCES[source];
  const m = store.series[source];
  let t0 = Infinity, t1 = -Infinity;
  for (const st of m.values()) for (const ms of st.keys()) { if (ms < t0) t0 = ms; if (ms > t1) t1 = ms; }
  const stepMs = cfg.step === 'day' ? DAY : cfg.step * MIN;
  const n = Number.isFinite(t0) ? Math.round((t1 - t0) / stepMs) + 1 : 0;
  const stations = {};
  for (const id of [...m.keys()].sort()) {
    const st = m.get(id);
    const vars = {};
    for (const [ms, v] of st) {
      const i = Math.round((ms - t0) / stepMs);
      for (const [k, x] of Object.entries(v)) { (vars[k] ??= new Array(n).fill(null))[i] = x; }
    }
    stations[id] = vars;
  }
  return { schema: SCHEMA, kind: 'obs/series', source, label: cfg.label, builtAt: new Date(nowMs).toISOString(),
    step: cfg.step === 'day' ? 'P1D' : `PT${cfg.step}M`, stamp: cfg.step === 'day' ? 'Datum des Messtags (Zeitraum s. README)' : 'UTC, Ende des Intervalls',
    t0: n ? new Date(t0).toISOString() : null, n, stations };
}

export function loadSeriesDoc(store, doc) {
  if (!doc || doc.schema !== SCHEMA || !doc.t0 || !store.series[doc.source]) return 0;
  const stepMs = doc.step === 'P1D' ? DAY : Number(/PT(\d+)M/.exec(doc.step)?.[1] ?? 10) * MIN;
  const t0 = Date.parse(doc.t0);
  let k = 0;
  for (const [id, vars] of Object.entries(doc.stations)) {
    const rows = new Map();
    for (const [name, arr] of Object.entries(vars)) arr.forEach((x, i) => { if (x == null) return; const ms = t0 + i * stepMs; const r = rows.get(ms) ?? {}; r[name] = x; rows.set(ms, r); });
    k += putValues(store, doc.source, id, [...rows].map(([ms, v]) => ({ ms, v })));
  }
  return k;
}

/** Sum of `rr` over (end − h, end]; complete when every 10-min stamp is there. */
export function rrSum(st, endMs, h) {
  let s = 0, k = 0;
  const need = h * 6;
  for (let i = 0; i < need; i++) { const v = st.get(endMs - i * 10 * MIN)?.rr; if (v != null) { s += v; k++; } }
  return { mm: r2(s), n: k, of: need, complete: k === need };
}

/** latest.json: per station the newest stamp with values (10-min sources) and the newest daily value. */
export function latestDoc(store, nowMs) {
  const out = {};
  for (const [src, m] of Object.entries(store.series)) {
    const daily = SOURCES[src].step === 'day';
    for (const [id, st] of m) {
      const e = (out[id] ??= {});
      const stamps = [...st.keys()].sort((a, b) => b - a);
      if (!stamps.length) continue;
      if (daily) {
        // newest day with a precipitation value (snow alone is a morning reading and can stand before rr arrives)
        const ms = stamps.find((x) => st.get(x).rr != null) ?? stamps[0];
        const cand = { date: dayKey(ms), src, ...st.get(ms) };
        if (!e.day || cand.date > e.day.date) e.day = cand;
        continue;
      }
      const ms = stamps[0];
      if (e.t && Date.parse(e.t) > ms) continue;
      const v = { ...st.get(ms) };
      // a variable missing at the newest stamp: its newest value within 60 min, with its own stamp
      const older = {};
      for (const name of new Set(stamps.flatMap((x) => Object.keys(st.get(x))))) {
        if (v[name] != null) continue;
        const ms2 = stamps.find((x) => x >= ms - HOUR && st.get(x)[name] != null);
        if (ms2 != null) older[name] = { v: st.get(ms2)[name], t: new Date(ms2).toISOString() };
      }
      e.t = new Date(ms).toISOString(); e.src = src; e.v = v;
      if (Object.keys(older).length) e.older = older;
      if (stamps.some((x) => st.get(x).rr != null)) {
        const end = Math.floor(ms / (10 * MIN)) * 10 * MIN;
        e.rr1h = rrSum(st, end, 1); e.rr24h = rrSum(st, end, 24);
      }
    }
  }
  const ids = Object.keys(out).filter((id) => out[id].t || out[id].day).sort();
  return { schema: SCHEMA, kind: 'obs/latest', builtAt: new Date(nowMs).toISOString(), count: ids.length,
    units: VARS, stamp: '10-min-Werte: UTC, Ende des Intervalls; day: Datum des Messtags', stations: Object.fromEntries(ids.map((id) => [id, out[id]])) };
}

// ───────────────────────────── network ─────────────────────────────
async function get(url, { timeoutMs = 45_000, ifModifiedSince = null, as = 'buffer', retries = 2 } = {}) {
  for (let a = 0; ; a++) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const headers = { 'user-agent': UA };
      if (ifModifiedSince) headers['if-modified-since'] = new Date(ifModifiedSince).toUTCString();
      const r = await fetch(url, { signal: ac.signal, headers });
      if (r.status === 304) return { status: 304 };
      if (r.status === 404) return { status: 404 };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const lm = Date.parse(r.headers.get('last-modified') ?? '') || null;
      const buf = Buffer.from(await r.arrayBuffer());
      return { status: 200, lm, body: as === 'buffer' ? buf : new TextDecoder(as).decode(buf) };
    } catch (e) {
      if (a >= retries) throw new Error(`${url}: ${e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * (a + 1)));
    } finally { clearTimeout(to); }
  }
}

async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } }));
  return res;
}

const metaDue = (store, key, nowMs, everyH = 6) => !store.state[key]?.at || nowMs - store.state[key].at > everyH * HOUR;
function upsertStation(store, s) {
  const old = store.stations.get(s.id);
  const nets = [...new Set([...(old?.networks ?? []), ...s.networks])].sort();
  const vars = [...new Set([...(old?.vars ?? []), ...(s.vars ?? [])])].sort();
  store.stations.set(s.id, { ...(old ?? {}), ...Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)), networks: nets, vars, seen: dayKey(Date.now()) });
}

// ── DWD 10 min
async function pollDwd10(store, nowMs, log) {
  const st = (store.state.dwd10 ??= { files: {} });
  let added = 0, fetched = 0, errors = 0;
  const metaNow = metaDue(store, 'dwd10meta', nowMs);
  for (const [prod, P] of Object.entries(DWD10)) {
    const base = `${CDC}/10_minutes/${P.dir}/now/`;
    const r = await get(base, { as: 'latin1' });
    const listing = parseListing(r.body);
    // Catalog only for stations whose current file is there (the description lists also stations without delivery).
    if (metaNow) {
      const have = new Set([...listing].filter(([f, lm]) => P.re.test(f) && nowMs - lm < 2 * DAY).map(([f]) => P.re.exec(f)[1]));
      const lr = await get(`${base}${P.list}`, { as: 'latin1' });
      for (const s of lr.status === 200 ? parseDwdStationList(lr.body) : []) {
        if (!have.has(s.id)) continue;
        upsertStation(store, { id: `de:${s.id}`, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, country: 'DE', region: s.state, networks: ['dwd10'], vars: Object.values(P.cols).map((c) => c[0]) });
      }
    }
    const todo = [...listing].filter(([f, lm]) => P.re.test(f) && st.files[f] !== lm && nowMs - lm < 2 * DAY);
    await pool(todo, 16, async ([f, lm]) => {
      try {
        const z = await get(base + f);
        if (z.status !== 200) return;
        const prodFile = unzip(z.body).find((e) => e.name.startsWith('produkt'));
        if (!prodFile?.data) throw new Error('kein produkt');
        const id = `de:${P.re.exec(f)[1]}`;
        added += putValues(store, 'dwd10', id, parseDwdProdukt(prodFile.data.toString('latin1'), P.cols));
        st.files[f] = lm; fetched++;
      } catch (e) { errors++; if (errors <= 3) log(`dwd10 ${f}: ${e.message}`); }
    });
  }
  if (metaNow) store.state.dwd10meta = { at: nowMs };
  return { added, fetched, errors };
}

// ── DWD daily precipitation
async function pollDwdDay(store, nowMs, log) {
  const st = (store.state.dwdDay ??= { files: {} });
  const base = `${CDC}/daily/more_precip/recent/`;
  let added = 0, fetched = 0, errors = 0;
  const listing = parseListing((await get(base, { as: 'latin1' })).body);
  const re = /^tageswerte_RR_(\d{5})_akt\.zip$/;
  if (metaDue(store, 'dwdDayMeta', nowMs, 24)) {
    const have = new Set([...listing].filter(([f, lm]) => re.test(f) && nowMs - lm < 10 * DAY).map(([f]) => re.exec(f)[1]));
    const r = await get(base + 'RR_Tageswerte_Beschreibung_Stationen.txt', { as: 'latin1' });
    for (const s of parseDwdStationList(r.body)) {
      if (!have.has(s.id)) continue;
      upsertStation(store, { id: `de:${s.id}`, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, country: 'DE', region: s.state, networks: ['dwdDay'], vars: ['rr', 'snow', 'nsnow'] });
    }
    store.state.dwdDayMeta = { at: nowMs };
  }
  const todo = [...listing].filter(([f, lm]) => re.test(f) && st.files[f] !== lm && nowMs - lm < 10 * DAY);
  await pool(todo, 16, async ([f, lm]) => {
    try {
      const z = await get(base + f);
      if (z.status !== 200) return;
      const pf = unzip(z.body).find((e) => e.name.startsWith('produkt'));
      const rows = parseDwdProdukt(pf.data.toString('latin1'), { RS: ['rr'], SH_TAG: ['snow'], NSH_TAG: ['nsnow'] }, true)
        .filter((x) => x.ms >= nowMs - 11 * DAY);
      added += putValues(store, 'dwdDay', `de:${re.exec(f)[1]}`, rows);
      st.files[f] = lm; fetched++;
    } catch (e) { errors++; if (errors <= 3) log(`dwdDay ${f}: ${e.message}`); }
  });
  return { added, fetched, errors };
}

// ── GeoSphere TAWES
async function pollTawes(store, nowMs, log) {
  if (metaDue(store, 'tawesMeta', nowMs)) {
    const r = await get(`${GSA}/current/tawes-v1-10min/metadata`, { as: 'utf-8' });
    const ids = [];
    for (const s of JSON.parse(r.body).stations) {
      if (!s.is_active) continue;
      ids.push(String(s.id));
      upsertStation(store, { id: `at:${s.id}`, name: s.name, lat: Math.round(s.lat * 1e5) / 1e5, lon: Math.round(s.lon * 1e5) / 1e5, elev: s.altitude, country: 'AT', region: s.state, networks: ['tawes'], vars: Object.values(TAWES_COLS) });
    }
    // klima-v2-10min: the INDIVIDUAL stations that are no TAWES site (measured 07.10.: 1 of 285 delivers, Treibach-Althofen)
    const tawesPos = JSON.parse(r.body).stations.map((x) => [x.lat, x.lon]);
    const km = (a, b, c, d) => 111.2 * Math.hypot(a - c, (b - d) * Math.cos((a * Math.PI) / 180));
    const klima = [];
    try {
      const kr = await get(`${GSA}/historical/klima-v2-10min/metadata`, { as: 'utf-8' });
      for (const k of JSON.parse(kr.body).stations) {
        if (!k.is_active || k.type !== 'INDIVIDUAL') continue;
        if (tawesPos.some(([la, lo]) => km(k.lat, k.lon, la, lo) <= KLIMA_EXTRA_KM)) continue;
        klima.push(String(k.id));
        upsertStation(store, { id: `at:k${k.id}`, name: k.name, lat: Math.round(k.lat * 1e5) / 1e5, lon: Math.round(k.lon * 1e5) / 1e5, elev: k.altitude, country: 'AT', region: k.state, networks: ['klima'], vars: Object.values(KLIMA_COLS) });
      }
    } catch (e) { log(`klima-Metadaten: ${e.message}`); }
    store.state.tawesMeta = { at: nowMs, ids, klima };
  }
  const ids = store.state.tawesMeta.ids;
  // From the newest stamp held (at most 6 h back): refetching the last hours heals a commit lost to a force-push.
  const m = store.series.tawes;
  let newest = 0;
  for (const s of m.values()) for (const ms of s.keys()) if (ms > newest) newest = ms;
  // empty store (first run): the whole 24-h window at once
  const from = newest ? Math.max(nowMs - 6 * HOUR, Math.min(newest - HOUR, nowMs - HOUR)) : nowMs - 25 * HOUR;
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 16);
  let added = 0, errors = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const url = `${GSA}/historical/tawes-v1-10min?parameters=${Object.keys(TAWES_COLS).join(',')}&station_ids=${ids.slice(i, i + 100).join(',')}&start=${fmt(from)}&end=${fmt(nowMs)}&output_format=geojson`;
    try {
      const r = await get(url, { as: 'utf-8', timeoutMs: 90_000 });
      const doc = JSON.parse(r.body);
      const stamps = doc.timestamps.map((t) => Date.parse(t));
      for (const f of doc.features) {
        const rows = stamps.map((ms) => ({ ms, v: {} }));
        for (const [p, name] of Object.entries(TAWES_COLS)) {
          const arr = f.properties.parameters?.[p]?.data ?? [];
          arr.forEach((x, k) => { if (x != null && Number.isFinite(x)) rows[k].v[name] = name === 'sd' ? r1(x / 60) : x; });
        }
        added += putValues(store, 'tawes', `at:${f.properties.station}`, rows);
      }
      await new Promise((res) => setTimeout(res, 400)); // GeoSphere: 5 requests/s
    } catch (e) { errors++; log(`tawes: ${e.message}`); }
  }
  const klima = store.state.tawesMeta.klima ?? [];
  if (klima.length) {
    const url = `${GSA}/historical/klima-v2-10min?parameters=${Object.keys(KLIMA_COLS).join(',')}&station_ids=${klima.join(',')}&start=${fmt(from)}&end=${fmt(nowMs)}&output_format=geojson`;
    try {
      const doc = JSON.parse((await get(url, { as: 'utf-8', timeoutMs: 90_000 })).body);
      const stamps = doc.timestamps.map((t) => Date.parse(t));
      for (const f of doc.features) {
        const rows = stamps.map((ms) => ({ ms, v: {} }));
        for (const [p, name] of Object.entries(KLIMA_COLS)) (f.properties.parameters?.[p]?.data ?? []).forEach((x, k) => { if (x != null && Number.isFinite(x)) rows[k].v[name] = name === 'sd' ? r1(x / 60) : x; });
        added += putValues(store, 'tawes', `at:k${f.properties.station}`, rows);
      }
    } catch (e) { errors++; log(`klima: ${e.message}`); }
  }
  return { added, fetched: ids.length, errors };
}

// ── MeteoSwiss OGD (smn, smnp: 10 min; nime: daily)
async function pollOgd(store, src, nowMs, log) {
  const net = OGD_NET[src];
  const cols = src === 'smn' ? SMN_COLS : src === 'smnp' ? SMNP_COLS : NIME_COLS;
  const st = (store.state[src] ??= { files: {} });
  const metaKey = `${src}Meta`;
  if (metaDue(store, metaKey, nowMs, 24)) {
    const r = await get(`${OGD}/ch.meteoschweiz.${net}/${net}_meta_stations.csv`, { as: 'windows-1252' });
    const abbrs = [];
    for (const row of parseCsv(r.body)) {
      const abbr = row.station_abbr?.trim();
      const lat = num(row.station_coordinates_wgs84_lat), lon = num(row.station_coordinates_wgs84_lon);
      if (!abbr || lat == null || lon == null) continue;
      if (row.station_data_until && row.station_data_until.trim() && ogdMs(row.station_data_until.trim() + (row.station_data_until.includes(':') ? '' : ' 00:00')) < nowMs - 30 * DAY) continue;
      abbrs.push(abbr);
      const canton = row.station_canton?.trim();
      upsertStation(store, { id: `ch:${abbr}`, name: row.station_name?.trim(), lat, lon, elev: num(row.station_height_masl), country: canton === 'FL' ? 'LI' : 'CH', region: canton, networks: [src], vars: Object.values(cols) });
    }
    store.state[metaKey] = { at: nowMs, abbrs };
  }
  const suffix = SOURCES[src].step === 'day' ? 'd_recent' : 't_now';
  let added = 0, fetched = 0, errors = 0, notModified = 0;
  // the fast collective file first; the OGD files after it override the same stamps
  if (VQHA[src]) {
    try {
      const r = await get(VQHA[src].url, { as: 'windows-1252', ifModifiedSince: st.vqha ?? null });
      if (r.status === 200) {
        const known = new Set(store.state[metaKey].abbrs);
        for (const [abbr, rows] of parseVqha(r.body, VQHA[src].cols)) if (known.has(abbr)) added += putValues(store, src, `ch:${abbr}`, rows);
        if (r.lm) st.vqha = r.lm;
      }
    } catch (e) { errors++; log(`${src} VQHA: ${e.message}`); }
  }
  await pool(store.state[metaKey].abbrs, 8, async (abbr) => {
    const a = abbr.toLowerCase();
    const url = `${OGD}/ch.meteoschweiz.${net}/${a}/${net}_${a}_${suffix}.csv`;
    try {
      const r = await get(url, { as: 'windows-1252', ifModifiedSince: st.files[a] ?? null });
      if (r.status === 304) { notModified++; return; }
      if (r.status !== 200) return;
      let rows = parseOgdSeries(r.body, cols);
      if (SOURCES[src].step === 'day') rows = rows.filter((x) => x.ms >= nowMs - 11 * DAY);
      added += putValues(store, src, `ch:${abbr}`, rows);
      if (r.lm) st.files[a] = r.lm;
      fetched++;
    } catch (e) { errors++; if (errors <= 3) log(`${src} ${abbr}: ${e.message}`); }
  });
  return { added, fetched, errors, notModified };
}

const POLL = { dwd10: pollDwd10, dwdDay: pollDwdDay, tawes: pollTawes, smn: (s, n, l) => pollOgd(s, 'smn', n, l), smnp: (s, n, l) => pollOgd(s, 'smnp', n, l), nime: (s, n, l) => pollOgd(s, 'nime', n, l) };

function newestStamp(store, src) {
  let newest = 0;
  for (const s of store.series[src].values()) for (const ms of s.keys()) if (ms > newest) newest = ms;
  return newest || null;
}

export async function pollSource(store, src, nowMs, log = () => {}) {
  const t0 = Date.now();
  const before = newestStamp(store, src);
  let res;
  try { res = await POLL[src](store, nowMs, log); } catch (e) { res = { added: 0, errors: 1, fatal: e.message }; log(`${src}: ${e.message}`); }
  const newest = newestStamp(store, src);
  const withData = [...store.series[src].values()].filter((s) => [...s.keys()].some((ms) => ms >= (newest ?? 0) - (SOURCES[src].step === 'day' ? 2 * DAY : HOUR))).length;
  const s = (store.status.sources[src] ??= {});
  Object.assign(s, { label: SOURCES[src].label, slots: SOURCES[src].slots, retryMin: SOURCES[src].retryMin, polledAt: new Date(nowMs).toISOString(), pollMs: Date.now() - t0,
    newest: newest ? new Date(newest).toISOString() : null, stationsWithData: withData, stationsInSeries: store.series[src].size,
    last: { added: res.added, fetched: res.fetched ?? null, errors: res.errors ?? 0, notModified: res.notModified ?? null, fatal: res.fatal ?? null } });
  if (res.added > 0) s.changedAt = new Date(nowMs).toISOString();
  return { src, changed: res.added > 0, newAdvanced: newest !== before, ...res };
}

// ───────────────────────────── files ─────────────────────────────
function writeJson(path, obj) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj));
  renameSync(tmp, path);
}

export function loadStore(dir) {
  const store = emptyStore();
  const rd = (f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } };
  const cat = rd('stations.json');
  for (const s of cat?.stations ?? []) store.stations.set(s.id, s);
  for (const src of Object.keys(SOURCES)) loadSeriesDoc(store, rd(`series/${src}.json`));
  store.status = rd('status.json') ?? { sources: {} };
  store.status.sources ??= {};
  store.state = rd('state.json') ?? {};
  return store;
}

export function saveStore(store, dir, nowMs, changedSources) {
  mkdirSync(join(dir, 'series'), { recursive: true });
  trim(store, nowMs);
  for (const src of changedSources) writeJson(join(dir, `series/${src}.json`), seriesDoc(store, src, nowMs));
  const latest = latestDoc(store, nowMs);
  writeJson(join(dir, 'latest.json'), latest);
  // A station no source has listed for 3 days leaves the catalog (closed or no longer delivered).
  for (const [id, s] of store.stations) if (!s.seen || s.seen < dayKey(nowMs - 3 * DAY)) store.stations.delete(id);
  const stations = [...store.stations.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const withData = new Set(Object.keys(latest.stations));
  const count = (f) => stations.filter(f).length;
  writeJson(join(dir, 'stations.json'), { schema: SCHEMA, kind: 'obs/stations', builtAt: new Date(nowMs).toISOString(), count: stations.length,
    idRule: 'de:<DWD-Stationskennung> · at:<TAWES-Kennung> · ch:<MeteoSchweiz-Kürzel>', stations });
  const byCountry = {}, byNet = {}, precipOnly = { all: 0, withData: 0 };
  for (const s of stations) {
    const c = (byCountry[s.country] ??= { stations: 0, withData: 0 }); c.stations++; if (withData.has(s.id)) c.withData++;
    for (const n of s.networks) { const b = (byNet[n] ??= { stations: 0, withData: 0 }); b.stations++; if (withData.has(s.id)) b.withData++; }
    if (!s.vars.some((v) => v === 't' || v === 'ff')) { precipOnly.all++; if (withData.has(s.id)) precipOnly.withData++; }
  }
  store.status = { ...store.status, schema: SCHEMA, kind: 'obs/status', updatedAt: new Date(nowMs).toISOString(), stations: stations.length, stationsWithData: withData.size, byCountry, byNetwork: byNet, precipOnly };
  writeJson(join(dir, 'status.json'), store.status);
  writeJson(join(dir, 'state.json'), store.state);
}

// ───────────────────────────── publish ─────────────────────────────
/** Same rules as the sea/road lines: fresh base each attempt (force-pushed history is no obstacle), only `obs/`, no force. */
export function publish({ repoDir, storeDir, message, retries = 6, log = () => {} }) {
  const git = (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git('fetch', '--quiet', '--depth=1', 'origin', 'main');
      git('checkout', '--quiet', '-B', 'main', 'FETCH_HEAD');
      git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      const dst = join(repoDir, 'obs', 'v1');
      rmSync(dst, { recursive: true, force: true });
      mkdirSync(dst, { recursive: true });
      cpSync(storeDir, dst, { recursive: true, filter: (p) => !/\.tmp-\d+$/.test(p) });
      git('add', '-A', '--', 'obs');
      const staged = git('diff', '--cached', '--name-only');
      if (!staged) return { pushed: false, unchanged: true };
      const outside = staged.split('\n').filter((p) => p && !p.startsWith('obs/'));
      if (outside.length) throw new Error(`außerhalb obs/: ${outside[0]}`);
      git('commit', '--quiet', '-m', message);
      git('push', '--quiet', 'origin', 'HEAD:main');
      return { pushed: true, sha: git('rev-parse', 'HEAD'), attempts: attempt, files: staged.split('\n').length };
    } catch (e) {
      const msg = String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? '?';
      log(`Publish Versuch ${attempt}: ${msg}`);
      if (/außerhalb obs/.test(msg)) throw e;
      execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${4000 * attempt})`]);
    }
  }
  return { pushed: false, failed: true };
}

async function purge(paths, log) {
  for (const p of paths) {
    try { await fetch(`https://purge.jsdelivr.net/gh/jppetry/buscosun-data@main/${p}`, { headers: { 'user-agent': UA } }); } catch (e) { log(`purge ${p}: ${e.message}`); }
  }
}

// ───────────────────────────── schedule ─────────────────────────────
/** Next due time: the next slot after `afterMs`; when the last poll brought nothing new, retry after `retryMin` (never past the next slot). */
export function nextDue(src, lastPollMs, gotNew) {
  const c = SOURCES[src];
  const slot = nextSlot(c, lastPollMs);
  return gotNew ? slot : Math.min(lastPollMs + c.retryMin * MIN, slot);
}
export function nextSlot(c, afterMs) {
  const h = Math.floor(afterMs / HOUR) * HOUR;
  for (const add of [0, HOUR]) for (const m of c.slots) { const t = h + add + m * MIN; if (t > afterMs) return t; }
  return h + 2 * HOUR;
}

async function run(args) {
  const log = (m) => console.log(`[obs ${new Date().toISOString().slice(11, 19)}] ${m}`);
  const storeDir = resolve(String(args.store ?? 'obs-store'));
  mkdirSync(storeDir, { recursive: true });
  const sources = String(args.sources ?? Object.keys(SOURCES).join(',')).split(',').filter((s) => SOURCES[s]);
  const store = loadStore(storeDir);
  const repoDir = args.repo ? resolve(String(args.repo)) : null;
  const doPush = !!args.push && repoDir;
  const endAt = Date.now() + Number(args.minutes ?? 0) * MIN;
  const due = Object.fromEntries(sources.map((s) => [s, Date.now()]));
  const lastPoll = {};
  let publishes = 0;
  while (true) {
    const now = Date.now();
    // Sources due within 90 s are polled together ⇒ one publish instead of two.
    const ready = sources.filter((s) => due[s] <= now + 90_000);
    if (ready.length) {
      const changed = [];
      for (const src of ready) {
        const r = await pollSource(store, src, Date.now(), log);
        lastPoll[src] = Date.now();
        log(`${src}: +${r.added} Werte, ${r.fetched ?? '–'} Dateien, Fehler ${r.errors ?? 0}${r.notModified != null ? `, unverändert ${r.notModified}` : ''} · neuester ${store.status.sources[src].newest}`);
        if (r.changed) changed.push(src);
        due[src] = nextDue(src, lastPoll[src], r.changed);
      }
      saveStore(store, storeDir, Date.now(), changed);
      if (changed.length && doPush) {
        const res = publish({ repoDir, storeDir, message: `obs: ${changed.join(', ')} ${new Date().toISOString().slice(0, 16)}Z`, log });
        log(`Publish: ${JSON.stringify(res)}`);
        if (res.pushed) { publishes++; await purge(['obs/v1/latest.json', 'obs/v1/status.json', 'obs/v1/stations.json', ...changed.map((s) => `obs/v1/series/${s}.json`)], log); }
      }
    }
    if (args.once || Date.now() >= endAt) break;
    const wait = Math.max(5_000, Math.min(...sources.map((s) => due[s])) - Date.now());
    if (Date.now() + wait >= endAt) break;
    await new Promise((res) => setTimeout(res, wait));
  }
  log(`Ende: ${publishes} Publishes`);
}

// ───────────────────────────── self test ─────────────────────────────
export function selfTest() {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
  const L = parseListing('<a href="10minutenwerte_TU_00044_now.zip">10minutenwerte_TU_00044_now.zip</a>                    07-Oct-2026 20:50:00                1607\n<a href="x.txt">x.txt</a>  04-Jul-2026 09:10                7845');
  add('Verzeichnisliste: Datei und Zeit in UTC', L.get('10minutenwerte_TU_00044_now.zip') === Date.UTC(2026, 9, 7, 20, 50) && L.get('x.txt') === Date.UTC(2026, 6, 4, 9, 10));
  const P = parseDwdProdukt('STATIONS_ID;MESS_DATUM;  QN;PP_10;TT_10;TM5_10;RF_10;TD_10;eor\n         44;202610072010;    2;   -999;  13.3;  10.4;  95.3;  12.6;eor\n', DWD10.tu.cols);
  add('DWD-Produkt: -999 fehlt, Stempel UTC', P.length === 1 && P[0].ms === Date.UTC(2026, 9, 7, 20, 10) && P[0].v.t === 13.3 && P[0].v.ps === undefined && P[0].v.rh === 95.3 && P[0].v.td === 12.6);
  const S = parseDwdProdukt('STATIONS_ID;MESS_DATUM;  QN;DS_10;GS_10;SD_10;LS_10;eor\n 183;202610071200;2;10.0;30.0;0.1667;19.1;eor', DWD10.sd.cols);
  add('DWD-Solar: SD h → min, GS J/cm² je 10 min → W/m²', S[0].v.sd === 10 && S[0].v.gr === 500);
  const D = parseDwdProdukt('STATIONS_ID;MESS_DATUM;QN_6;  RS; RSF;SH_TAG;NSH_TAG;eor\n 6;20261006;    1;   1.0;   6;   0;   0;eor', { RS: ['rr'], SH_TAG: ['snow'], NSH_TAG: ['nsnow'] }, true);
  add('DWD-Tag: Datum als Tag', D[0].ms === Date.UTC(2026, 9, 6) && D[0].v.rr === 1);
  const O = parseOgdSeries('station_abbr;reference_timestamp;rre150z0;tre200s0\nABE;07.10.2026 20:50;0.2;\nABE;07.10.2026 21:00;-;5', { rre150z0: 'rr', tre200s0: 't' });
  add('OGD: leer und „-“ fehlen, Stempel UTC', O.length === 2 && O[0].ms === Date.UTC(2026, 9, 7, 20, 50) && O[0].v.rr === 0.2 && O[0].v.t === undefined && O[1].v.t === 5 && O[1].v.rr === undefined);
  const st = new Map();
  const t = Date.UTC(2026, 9, 7, 21, 0);
  for (let i = 0; i < 6; i++) st.set(t - i * 10 * MIN, { rr: 0.1 });
  add('rr1h vollständig bei 6 Stempeln', rrSum(st, t, 1).complete && rrSum(st, t, 1).mm === 0.6);
  st.delete(t - 30 * MIN);
  add('Negativkontrolle: ein fehlender Stempel ⇒ unvollständig', !rrSum(st, t, 1).complete && rrSum(st, t, 1).n === 5);
  // round trip of a series file
  const store = emptyStore();
  putValues(store, 'smn', 'ch:BER', [{ ms: t - 10 * MIN, v: { t: 14.2 } }, { ms: t, v: { t: 14.0, rr: 0 } }]);
  putValues(store, 'nime', 'ch:ABG', [{ ms: Date.UTC(2026, 9, 6), v: { rr: 0 } }]);
  const doc = seriesDoc(store, 'smn', t);
  const s2 = emptyStore(); loadSeriesDoc(s2, JSON.parse(JSON.stringify(doc)));
  add('Reihe: Rundweg exakt', JSON.stringify(seriesDoc(s2, 'smn', t)) === JSON.stringify(doc) && doc.n === 2);
  const lat = latestDoc(store, t);
  add('latest: neuester Stempel und Tageswert', lat.stations['ch:BER'].t === new Date(t).toISOString() && lat.stations['ch:BER'].v.t === 14 && lat.stations['ch:ABG'].day.date === '2026-10-06');
  add('Zeitplan: nächster Slot, Wiederholung bis zum Slot, Stundenwechsel',
    nextDue('tawes', Date.UTC(2026, 9, 7, 21, 2, 30), true) === Date.UTC(2026, 9, 7, 21, 12) && nextDue('tawes', Date.UTC(2026, 9, 7, 21, 2, 30), false) === Date.UTC(2026, 9, 7, 21, 4, 30)
    && nextDue('dwd10', Date.UTC(2026, 9, 7, 21, 52), true) === Date.UTC(2026, 9, 7, 22, 11) && nextDue('dwdDay', Date.UTC(2026, 9, 7, 21, 30), false) === Date.UTC(2026, 9, 7, 22, 17));
  // zip round trip with a stored entry
  const name = Buffer.from('produkt_x.txt'), data = Buffer.from('a;b\n');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(data.length, 20); cd.writeUInt16LE(name.length, 28);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(30 + name.length + data.length, 16);
  const V = parseVqha('Station/Location;Date;tre200s0;fu3010z0;fu3010z1;rre150z0\nBER;202610072110;13.70;3.60;-;0.00', VQHA.smn.cols);
  add('VQHA: Stempel UTC, km/h → m/s, „-“ fehlt', V.get('BER')[0].ms === Date.UTC(2026, 9, 7, 21, 10) && V.get('BER')[0].v.ff === 1 && V.get('BER')[0].v.fx === undefined && V.get('BER')[0].v.t === 13.7);
  const z = unzip(Buffer.concat([lh, name, data, cd, name, eo]));
  add('ZIP: gespeicherter Eintrag', z.length === 1 && z[0].name === 'produkt_x.txt' && z[0].data.toString() === 'a;b\n');
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

function parseArgs(argv) { return Object.fromEntries(argv.map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; })); }

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) {
    const r = selfTest();
    for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    console.log(`obs-mirror self-test ${r.passed}/${r.total}`);
    process.exit(r.passed === r.total ? 0 : 1);
  }
  run(args).catch((e) => { console.error(e); process.exit(1); });
}
