/**
 * truthHist.mjs — the TRUTH side of the AP10a hindcast (Fremdkalibrierung): hourly station
 * observations for the archive points (scripts/punktarchiv/points.json) from free archives,
 * in the conventions of the live archive collector (scripts/punktarchiv/lib/truth.mjs and
 * collect.mjs `collectTruth`), so a calibration fit can score hindcast forecasts against them.
 *
 * Networks (only these sources):
 *   cdc    DWD CDC hourly (GeoNutzV, "Datenbasis: Deutscher Wetterdienst") — the free equivalent
 *          of the archive's POI block for the DE points (POI is a 24-h rolling window, not an archive).
 *   tawes  GeoSphere Austria (CC BY 4.0): `tawes-v1-10min` (the collector's own endpoint, the same ids;
 *          historical window measured 2026-09-19: only from 2026-06-18) and before that
 *          `klima-v2-10min` (QC'd 10-min data from 1992; other station ids, NO dew point).
 *   smn    MeteoSwiss OGD `ch.meteoschweiz.ogd-smn` (CC BY 4.0, "Source: MeteoSwiss"): the station
 *          files `_t_historical_<decade>`, `_t_recent`, `_t_now` (10-min, same columns as `_t_now`).
 *
 * Form: one intermediate record per network station and calendar month under
 * cache/truth/hourly/<net>/<YYYY-MM>/<key>.json (integer-coded with TRUTH_SCALES, the same
 * shape as an archive truth record), from which the per-day files are sliced. Nothing here
 * writes outside HINDCAST_ROOT.
 */
import { gzipSync, gunzipSync, inflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { TRUTH_SCALES, SENTINEL, encodeSeries } from '../../punktarchiv/lib/punktarchiv.mjs';
import {
  TAWES_10MIN, SMN_10MIN, TAWES_HISTORY_URL, SMN_META_URL,
  parseTawes10min, parseSmn10min, tenMinColumns, tenMinHourStamps, parseSmnStations,
} from '../../punktarchiv/lib/truth.mjs';

export const HINDCAST_ROOT = process.env.HINDCAST_ROOT || 'C:/dev/buscosun-hindcast';
export const H = 3_600_000;
export const TEN = 600_000;
export const DAY = 86_400_000;
export const CACHE_TRUTH = join(HINDCAST_ROOT, 'cache', 'truth');
export const HOURLY_DIR = join(CACHE_TRUTH, 'hourly');
export const TRUTH_DIR = join(HINDCAST_ROOT, 'truth');
export const LOG_DIR = join(HINDCAST_ROOT, 'log');
export const VERIFY_DIR = join(HINDCAST_ROOT, 'verify');
export const PRODUCER = 'buscosun-web/scripts/hindcast/extract_truth.mjs';

// ─── small helpers ──────────────────────────────────────────────────────────
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const isoMin = (ms) => new Date(ms).toISOString().slice(0, 16);
export const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);
export const dayStartMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const monthStartMs = (key) => Date.parse(`${key}-01T00:00:00Z`);
export function nextMonthStartMs(key) { const d = new Date(monthStartMs(key)); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
export function monthsBetween(fromMs, toMs) {
  const out = [];
  for (let k = monthKey(fromMs); monthStartMs(k) <= toMs; k = monthKey(nextMonthStartMs(k))) out.push(k);
  return out;
}
export function daysBetween(fromDay, toDay) {
  const out = [];
  for (let ms = dayStartMs(fromDay); ms <= dayStartMs(toDay); ms += DAY) out.push(isoDay(ms));
  return out;
}
export function atomicWrite(abs, data) {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, abs);
}
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const readJsonGz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
export const writeJsonGz = (p, obj) => atomicWrite(p, gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 6 }));
export const fileAgeMs = (p) => (existsSync(p) ? Date.now() - statSync(p).mtimeMs : Infinity);
export async function mapLimit(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  });
  await Promise.all(workers);
}
const R_EARTH = 6371.0088;
export function distKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(x));
}
/** Upper-case ASCII form for name comparisons (umlauts spelled out, punctuation dropped). */
export function normName(s) {
  return String(s ?? '').toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}
/** Names match when equal after normalising, or when a ≥ 3-letter token of one is contained in / shares a 6-letter prefix with the other (MOSMIX abbreviates: "BRAUNSCHWG."). Evidence only — the overlap proof decides. */
export function namesMatch(a, b) {
  const A = normName(a), B = normName(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const tok = (s) => s.split(' ').filter((t) => t.length >= 3);
  const ta = tok(A), tb = tok(B);
  const prefix = (x, y) => x.slice(0, Math.min(6, x.length)) === y.slice(0, Math.min(6, x.length));
  return ta.some((t) => B.includes(t) || tb.some((u) => prefix(t, u))) || tb.some((t) => A.includes(t));
}

// ─── run log + per-network counters ─────────────────────────────────────────
export const RUN = {
  file: null,
  nets: {},
  // bytes = measurement payload, metaBytes = catalogue/metadata (station lists, dataset metadata, directory
  // listings — republished daily upstream, so a re-run refetches them by design), wireBytes = everything.
  net(name) { return (this.nets[name] ??= { requests: 0, bytes: 0, metaBytes: 0, wireBytes: 0, failures: 0, retries: 0, ms: 0, cacheHits: 0, records: 0, failureList: [] }); },
  log(ev) { if (this.file) appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), ...ev })}\n`); },
};
export function openRunLog(stamp) {
  mkdirSync(LOG_DIR, { recursive: true });
  RUN.file = join(LOG_DIR, `truth-${stamp}.jsonl`);
  return RUN.file;
}

// ─── HTTP with retries, backoff and a rate limiter ──────────────────────────
export class RateLimiter {
  constructor({ perSecond, perHour }) { this.perSecond = perSecond; this.perHour = perHour; this.stamps = []; this.chain = Promise.resolve(); }
  take() {
    const run = async () => {
      for (;;) {
        const now = Date.now();
        this.stamps = this.stamps.filter((t) => now - t < H);
        if (this.stamps.length >= this.perHour) {
          const wait = this.stamps[0] + H - now + 1000;
          RUN.log({ ev: 'rateLimitWait', scope: 'hour', waitMs: wait });
          await sleep(wait);
          continue;
        }
        const lastSec = this.stamps.filter((t) => now - t < 1000).length;
        if (lastSec >= this.perSecond) { await sleep(1100); continue; }
        this.stamps.push(now);
        return;
      }
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => {});
    return p;
  }
}
/** GeoSphere dataset API: measured headers 2026-09-19 — 5 requests/s, 240 requests/h, 1 000 000 values per request. */
export const GEO_LIMITER = new RateLimiter({ perSecond: 4, perHour: 225 });

/**
 * GET (or HEAD) with retries. 5xx/429/network errors back off (2 s · 3^n, capped at 2 min; 429 honours
 * Retry-After, else 60 s, up to 30 times). 400/403/404 are final (404 returns `status: 404` when allowed).
 */
export async function httpGet(url, { net, headers = {}, timeoutMs = 300_000, retries = 5, allow404 = false, limiter = null, method = 'GET', meta = false } = {}) {
  const st = RUN.net(net);
  let lastErr = null;
  let attempt = 0, throttled = 0;
  while (attempt <= retries && throttled <= 30) {
    if (limiter) await limiter.take();
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
      const buf = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
      st.requests++; st[meta ? 'metaBytes' : 'bytes'] += buf.length; st.ms += Date.now() - t0;
      // wire bytes: the Content-Length of a compressed body when the server sends one, else the body itself
      const clh = res.headers.get('content-length');
      st.wireBytes += clh != null && res.headers.get('content-encoding') ? Number(clh) : buf.length;
      if (res.status === 404 && allow404) return { status: 404, buf: null, headers: res.headers };
      if (res.ok) return { status: res.status, buf, headers: res.headers };
      lastErr = new Error(`HTTP ${res.status} ${url} ${buf.toString('utf8', 0, 240)}`);
      lastErr.status = res.status;
      if ([400, 401, 403, 404, 416].includes(res.status)) break;
    } catch (e) {
      st.requests++; st.ms += Date.now() - t0;
      lastErr = e;
    }
    let wait;
    if (res?.status === 429) {
      throttled++;
      const ra = Number(res.headers.get('retry-after'));
      wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 + 500 : 60_000;
    } else {
      attempt++;
      wait = Math.min(120_000, 2000 * 3 ** (attempt - 1)) + Math.round(Math.random() * 500);
    }
    st.retries++;
    RUN.log({ ev: 'retry', net, url, status: res?.status ?? null, error: res ? undefined : String(lastErr?.message), waitMs: wait });
    await sleep(wait);
  }
  st.failures++;
  st.failureList.push(`${url}: ${String(lastErr?.message).slice(0, 200)}`);
  RUN.log({ ev: 'failure', net, url, error: String(lastErr?.message).slice(0, 400) });
  throw lastErr ?? new Error(`failed ${url}`);
}

// ─── minimal ZIP reader (stored + deflate, no ZIP64 — enough for CDC/IGRA archives) ──
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: no end-of-central-directory record');
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip: bad central directory');
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    out.push({ name: buf.toString('latin1', off + 46, off + 46 + nlen), method, csize, usize, lho });
    off += 46 + nlen + elen + clen;
  }
  return out;
}
export function zipRawSlice(buf, e) {
  const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
  return buf.subarray(start, start + e.csize);
}
export function zipRead(buf, e) {
  const data = zipRawSlice(buf, e);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`zip: method ${e.method} not supported (${e.name})`);
}

// ─── Magnus (dew point for klima-v2, which has none) ────────────────────────
/** Magnus over water with the WMO coefficients (WMO-No. 8, 2018, Annex 4.B: 6.112 hPa, 17.62, 243.12 °C). */
export const MAGNUS = Object.freeze({ a: 17.62, b: 243.12, e0: 6.112, source: 'WMO-No. 8 (2018) Annex 4.B, ueber Wasser' });
export function dewPointMagnus(t, rh) {
  if (t == null || rh == null || !(rh > 0)) return null;
  const g = Math.log(rh / 100) + (MAGNUS.a * t) / (MAGNUS.b + t);
  return (MAGNUS.b * g) / (MAGNUS.a - g);
}

// ─── record helpers (the archive's truth record shape) ──────────────────────
/** Encode columns in TRUTH_SCALES order, exactly as collect.mjs does (`for k of keys(TRUTH_SCALES) if cols[k] !== undefined`). */
export function encodeRecord(obsAtMs, cols, extra = {}) {
  const rec = { obsAtMs, count: obsAtMs.length };
  for (const k of Object.keys(TRUTH_SCALES)) if (cols[k] !== undefined) rec[k] = encodeSeries(cols[k], TRUTH_SCALES[k]);
  return Object.assign(rec, extra);
}
export const RECORD_COLS = Object.freeze({
  cdc: ['t', 'td', 'rh', 'ff', 'dd', 'fx', 'fxh', 'rr1', 'n', 'p'],
  tawes: ['t', 'td', 'rh', 'ff', 'dd', 'fx', 'fxh', 'rr1', 'rr1h', 'p'],
  smn: ['t', 'td', 'rh', 'ff', 'dd', 'fx', 'fxh', 'rr1', 'rr1h', 'p'],
});
/** Slice a month record to the hours in [fromMs, toMs]. */
export function sliceRecord(rec, fromMs, toMs, cols) {
  const idx = [];
  rec.obsAtMs.forEach((ms, i) => { if (ms >= fromMs && ms <= toMs) idx.push(i); });
  const out = { obsAtMs: idx.map((i) => rec.obsAtMs[i]), count: idx.length };
  for (const k of cols) if (rec[k]) out[k] = idx.map((i) => rec[k][i]);
  return out;
}
export function hourlyPath(net, month, key) { return join(HOURLY_DIR, net, month, `${key}.json`); }
export function readMonthRecord(net, month, key) {
  const p = hourlyPath(net, month, key);
  return existsSync(p) ? readJson(p) : null;
}
export function writeMonthRecord(net, month, key, rec) {
  RUN.net(net === 'tawes-klima' ? 'tawes' : net).records++;   // V7: a re-run over a finished range must build 0 records
  atomicWrite(hourlyPath(net, month, key), `${JSON.stringify(rec)}\n`);
}

// ═══ DWD CDC ═════════════════════════════════════════════════════════════════
export const CDC_BASE = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly';
/**
 * Products and columns (header names measured in the product files 2026-09-19; parameter texts from
 * the ZIP's Metadaten_Parameter_*.txt, station 00433):
 *   TU  air_temperature  TT_TU "Lufttemperatur" °C, RF_TU "relative Feuchte" %
 *   TD  dew_point        TD "Taupunktstemperatur" °C (SYNOP) — measured column, no Magnus needed
 *   F   wind_synop       FF "10-Min-Mittel der Windgeschwindigkeit" m/s, DD "Windrichtung" (SYNOP) — the POI
 *                        semantics (POI ff = mean of the last 10 min); `wind` (F, D) is the HOURLY mean
 *                        ("Stundenmittel ... generiert aus 10-Minutenmittel") and misses the Bundeswehr sites
 *   FX  extreme_wind     FX_911 "hoechste Windspitze der letzten Stunde" m/s (SYNOP) = POI maximum_wind_speed_last_hour
 *   RR  precipitation    R1 "stdl. Niederschlagshoehe" mm
 *   N   cloudiness       V_N "Bedeckungsgrad aller Wolken" Achtel → % = V_N · 12,5; −1 and 9 → null
 *   P0  pressure         P "auf NN reduzierter Luftdruck" hPa (P0 = station level, not used)
 * MESS_DATUM = YYYYMMDDHH, "Stundenwerte in UTC" / "in UTC" for every period since 2001 (metadata); −999 = missing.
 */
export const CDC_WIND_VARIANTS = Object.freeze({
  synop: { key: 'F', dir: 'wind_synop', cols: { ff: 'FF', dd: 'DD' } },
  hourly: { key: 'FF', dir: 'wind', cols: { ff: 'F', dd: 'D' } },
});
export function cdcProducts(wind = 'synop') {
  return [
    { key: 'TU', dir: 'air_temperature', cols: { t: 'TT_TU', rh: 'RF_TU' } },
    { key: 'TD', dir: 'dew_point', cols: { td: 'TD' } },
    CDC_WIND_VARIANTS[wind],
    { key: 'FX', dir: 'extreme_wind', cols: { fx: 'FX_911' } },
    { key: 'RR', dir: 'precipitation', cols: { rr1: 'R1' } },
    { key: 'N', dir: 'cloudiness', cols: { n: 'V_N' } },
    { key: 'P0', dir: 'pressure', cols: { p: 'P' } },
  ];
}
const cdcTransform = { n: (v) => (v >= 0 && v <= 8 ? v * 12.5 : null) };

/** `<KEY>_Stundenwerte_Beschreibung_Stationen.txt` (Latin-1, whitespace columns; names may contain blanks). */
export function parseCdcDescription(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) {
    if (!/^\d{5} \d{8} \d{8}/.test(l)) continue;
    const t = l.trim().split(/\s+/);
    out.push({ id: t[0], from: t[1], to: t[2], h: Number(t[3]), lat: Number(t[4]), lon: Number(t[5]), name: t.slice(6, -2).join(' '), state: t[t.length - 2] });
  }
  return out;
}
/** Apache listing of `<product>/historical/` → Map<id, [{ file, from, to }]>. */
export function parseCdcHistListing(html, key) {
  const re = new RegExp(`href="(stundenwerte_${key}_(\\d{5})_(\\d{8})_(\\d{8})_hist\\.zip)"`, 'g');
  const out = new Map();
  for (const m of html.matchAll(re)) {
    if (!out.has(m[2])) out.set(m[2], []);
    out.get(m[2]).push({ file: m[1], from: m[3], to: m[4] });
  }
  return out;
}
const ymdhToMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), s.length >= 10 ? +s.slice(8, 10) : 0);
const ymdEndMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 23);

/** Product text → Map<ms, { col: value|null }> for rows with MESS_DATUM in [fromMs, toMs]. */
export function parseCdcProduct(text, cols, fromMs, toMs) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(';').map((s) => s.trim());
  const iT = head.indexOf('MESS_DATUM');
  const idx = Object.entries(cols).map(([k, name]) => [k, head.indexOf(name)]);
  const missing = idx.filter(([, i]) => i < 0).map(([k]) => cols[k]);
  const fromKey = new Date(fromMs).toISOString().replace(/[-T:]/g, '').slice(0, 10);
  const toKey = new Date(toMs).toISOString().replace(/[-T:]/g, '').slice(0, 10);
  const rows = new Map();
  for (let li = 1; li < lines.length; li++) {
    const f = lines[li].split(';');
    if (f.length < 3) continue;
    const md = f[iT]?.trim();
    if (!md || md < fromKey || md > toKey) continue;
    const r = {};
    for (const [k, i] of idx) {
      if (i < 0) { r[k] = null; continue; }
      const v = Number(f[i]);
      let x = Number.isFinite(v) && v !== -999 ? v : null;
      if (x != null && cdcTransform[k]) x = cdcTransform[k](x);
      r[k] = x;
    }
    rows.set(ymdhToMs(md), r);
  }
  return { rows, missingCols: missing };
}

const CDC_CACHE = join(CACHE_TRUTH, 'cdc');
const cdcListingCache = new Map();
export async function cdcDescription(prod) {
  const p = join(CDC_CACHE, prod.key, `${prod.key}_Stundenwerte_Beschreibung_Stationen.txt`);
  if (fileAgeMs(p) > 24 * H) {
    const { buf } = await httpGet(`${CDC_BASE}/${prod.dir}/recent/${prod.key}_Stundenwerte_Beschreibung_Stationen.txt`, { net: 'cdc', meta: true });
    atomicWrite(p, buf);
  } else RUN.net('cdc').cacheHits++;
  return parseCdcDescription(new TextDecoder('latin1').decode(readFileSync(p)));
}
async function cdcHistListing(prod) {
  if (cdcListingCache.has(prod.key)) return cdcListingCache.get(prod.key);
  const p = join(CDC_CACHE, prod.key, 'historical', 'listing.html');
  if (fileAgeMs(p) > 7 * 24 * H) {
    const { buf } = await httpGet(`${CDC_BASE}/${prod.dir}/historical/`, { net: 'cdc', meta: true });
    atomicWrite(p, buf);
  } else RUN.net('cdc').cacheHits++;
  const m = parseCdcHistListing(readFileSync(p, 'latin1'), prod.key);
  cdcListingCache.set(prod.key, m);
  return m;
}
/** Recent ZIP (≈ last 500 days, re-published daily). Refetched when the need reaches beyond its cover and it is > 6 h old. */
async function cdcRecent(prod, id, needToMs) {
  const p = join(CDC_CACHE, prod.key, 'recent', `stundenwerte_${prod.key}_${id}_akt.zip`);
  const metaP = `${p}.meta.json`;
  let meta = existsSync(metaP) ? readJson(metaP) : null;
  const fresh = meta && (meta.absent ? Date.now() - meta.fetchedAtMs < 24 * H : (meta.coverToMs >= needToMs || Date.now() - meta.fetchedAtMs < 6 * H));
  if (!fresh) {
    const r = await httpGet(`${CDC_BASE}/${prod.dir}/recent/stundenwerte_${prod.key}_${id}_akt.zip`, { net: 'cdc', allow404: true });
    if (r.status === 404) {
      meta = { absent: true, fetchedAtMs: Date.now() };
      atomicWrite(metaP, JSON.stringify(meta));
      return null;
    }
    atomicWrite(p, r.buf);
    const e = zipEntries(r.buf).find((x) => /^produkt_/.test(x.name));
    const m = /_(\d{8})_(\d{8})_\d{5}\.txt$/.exec(e?.name ?? '');
    meta = { fetchedAtMs: Date.now(), lastModified: r.headers.get('last-modified'), product: e?.name ?? null, coverFromMs: m ? ymdhToMs(m[1]) : null, coverToMs: m ? ymdEndMs(m[2]) : null };
    atomicWrite(metaP, JSON.stringify(meta));
  } else RUN.net('cdc').cacheHits++;
  if (meta.absent) return null;
  return { path: p, ...meta };
}
async function cdcHist(prod, file) {
  const p = join(CDC_CACHE, prod.key, 'historical', file);
  if (!existsSync(p)) {
    const { buf } = await httpGet(`${CDC_BASE}/${prod.dir}/historical/${file}`, { net: 'cdc' });
    atomicWrite(p, buf);
  } else RUN.net('cdc').cacheHits++;
  return p;
}
function readZipProduct(path) {
  const buf = readFileSync(path);
  const e = zipEntries(buf).find((x) => /^produkt_/.test(x.name));
  if (!e) throw new Error(`no produkt_* in ${path}`);
  return { text: zipRead(buf, e).toString('latin1'), name: e.name };
}

/**
 * All products of one CDC station for [needFromMs, needToMs]: historical ZIPs (to 2025-12-31, yearly
 * update) where the recent ZIP does not reach back, recent after the last historical hour.
 * @returns {{ byProduct: Record<string, Map<number, object>>, files: string[], coverToMs: number|null, missing: string[] }}
 */
export async function cdcStationRows(id, needFromMs, needToMs, products) {
  const byProduct = {}, files = [], missing = [];
  let coverToMs = null;
  for (const prod of products) {
    const rows = new Map();
    const recent = await cdcRecent(prod, id, needToMs);
    const listing = await cdcHistListing(prod);
    const hist = (listing.get(id) ?? []).filter((h) => ymdEndMs(h.to) >= needFromMs && ymdhToMs(h.from) <= needToMs);
    let histToMs = -Infinity;
    const recentFrom = recent?.coverFromMs ?? Infinity;
    if (needFromMs < recentFrom) {
      for (const h of hist) {
        const p = await cdcHist(prod, h.file);
        const { text } = readZipProduct(p);
        const { rows: r } = parseCdcProduct(text, prod.cols, needFromMs, needToMs);
        for (const [ms, v] of r) rows.set(ms, v);
        histToMs = Math.max(histToMs, ymdEndMs(h.to));
        files.push(`${prod.dir}/historical/${h.file}`);
      }
    }
    if (recent && needToMs > histToMs) {
      const { text, name } = readZipProduct(recent.path);
      const { rows: r } = parseCdcProduct(text, prod.cols, Math.max(needFromMs, histToMs + H), needToMs);
      for (const [ms, v] of r) if (!rows.has(ms)) rows.set(ms, v);
      files.push(`${prod.dir}/recent/stundenwerte_${prod.key}_${id}_akt.zip (${name})`);
      if (prod.key === 'TU' || coverToMs == null) coverToMs = Math.max(coverToMs ?? -Infinity, recent.coverToMs ?? -Infinity);
    }
    if (!recent && !hist.length) missing.push(prod.key);
    byProduct[prod.key] = rows;
  }
  return { byProduct, files, coverToMs, missing };
}

/** One CDC station-month record: hours with at least one value; fxh = fx (FX_911 IS the hour maximum, like POI). */
export function cdcMonthRecord(st, month, products) {
  const from = monthStartMs(month), to = nextMonthStartMs(month) - H;
  const obs = [];
  const cols = Object.fromEntries(RECORD_COLS.cdc.map((k) => [k, []]));
  for (let ms = from; ms <= to; ms += H) {
    const v = {};
    for (const prod of products) { const r = st.byProduct[prod.key]?.get(ms); if (r) Object.assign(v, r); }
    const vals = ['t', 'td', 'rh', 'ff', 'dd', 'fx', 'rr1', 'n', 'p'].map((k) => v[k] ?? null);
    if (vals.every((x) => x == null)) continue;
    obs.push(ms);
    for (const k of RECORD_COLS.cdc) cols[k].push(k === 'fxh' ? (v.fx ?? null) : (v[k] ?? null));
  }
  return encodeRecord(obs, cols);
}

// ═══ GeoSphere (TAWES + klima-v2) ════════════════════════════════════════════
export const GEO_BASE = 'https://dataset.api.hub.geosphere.at/v1/station/historical';
/**
 * klima-v2-10min → the TAWES_10MIN keys (names from `klima-v2-10min/metadata`, 2026-09-19): tl, rf, ff
 * ("vektorieller Mittelwert" — equals TAWES FF to the digit, measured; `ffam` is the arithmetic mean and
 * does not), dd, ffx, rr, pred. No dew point in klima-v2 ⇒ td = Magnus(tl, rf), marked `derived`.
 */
export const KLIMA_10MIN = Object.freeze({ t: 'tl', rh: 'rf', ff: 'ff', dd: 'dd', fx: 'ffx', rr10: 'rr', p: 'pred' });
export const GEO_DATASETS = Object.freeze({
  'tawes-v1-10min': { params: TAWES_10MIN, maxValues: 1_000_000 },
  'klima-v2-10min': { params: KLIMA_10MIN, maxValues: 1_000_000 },
});
const GEO_CACHE = join(CACHE_TRUTH, 'geosphere');
export async function geoMetadata(dataset) {
  const p = join(GEO_CACHE, dataset, 'metadata.json');
  if (fileAgeMs(p) > 6 * H) {
    const { buf } = await httpGet(`${GEO_BASE}/${dataset}/metadata`, { net: 'tawes', limiter: GEO_LIMITER, meta: true });
    atomicWrite(p, buf);
  } else RUN.net('tawes').cacheHits++;
  return readJson(p);
}
function geoMonthPath(dataset, month, id) { return join(GEO_CACHE, dataset, month, `${id}.json.gz`); }
/** Month window of a 10-min request: stamps (monthStart − 50 min) … nextMonthStart (both inclusive), so each month file is self-sufficient for its hours. */
export function geoMonthWindow(month, datasetEndMs) {
  const start = monthStartMs(month) - 50 * 60_000;
  const end = Math.min(nextMonthStartMs(month), Math.floor(datasetEndMs / TEN) * TEN);
  return { start, end };
}
/**
 * Fetch the month for the given station ids (groups sized to the 1e6-value limit; a 400 on a group is
 * split in halves to isolate the station). Caches per station and month; returns Map<id, cachedDoc>.
 */
export async function geoFetchMonth(dataset, month, ids, datasetEndMs) {
  const { params, maxValues } = GEO_DATASETS[dataset];
  const out = new Map();
  const need = [];
  for (const id of ids) {
    const p = geoMonthPath(dataset, month, id);
    if (existsSync(p)) {
      const doc = readJsonGz(p);
      if (doc.final) { out.set(id, doc); RUN.net('tawes').cacheHits++; continue; }
      const { end } = geoMonthWindow(month, datasetEndMs);
      if (doc.endMs >= end && Date.now() - doc.fetchedAtMs < 3 * H) { out.set(id, doc); RUN.net('tawes').cacheHits++; continue; }
    }
    need.push(id);
  }
  if (!need.length) return out;
  const { start, end } = geoMonthWindow(month, datasetEndMs);
  if (end < start) return out;
  const nStamps = Math.round((end - start) / TEN) + 1;
  const nParams = Object.keys(params).length;
  const group = Math.max(1, Math.floor(maxValues / (nStamps * nParams)));
  const fetchGroup = async (g) => {
    const url = `${GEO_BASE}/${dataset}?parameters=${Object.values(params).join(',')}&station_ids=${g.join(',')}&start=${isoMin(start)}&end=${isoMin(end)}`;
    let r;
    try { r = await httpGet(url, { net: 'tawes', limiter: GEO_LIMITER, timeoutMs: 300_000 }); } catch (e) {
      if (e.status === 400 && g.length > 1) { const h = Math.ceil(g.length / 2); await fetchGroup(g.slice(0, h)); await fetchGroup(g.slice(h)); return; }
      RUN.log({ ev: 'geoGroupFailed', dataset, month, ids: g, error: String(e.message).slice(0, 300) });
      for (const id of g) out.set(id, { error: String(e.message).slice(0, 300) });
      return;
    }
    const json = JSON.parse(r.buf.toString('utf8'));
    const fetchedAtMs = Date.now();
    const final = end === nextMonthStartMs(month) && fetchedAtMs - end > 3 * H;
    for (const feat of json.features ?? []) {
      const id = String(feat.properties.station);
      const doc = { dataset, id, month, fetchedAtMs, startMs: start, endMs: end, final, url, timestamps: json.timestamps, parameters: feat.properties.parameters };
      writeJsonGz(geoMonthPath(dataset, month, id), doc);
      out.set(id, doc);
    }
  };
  for (let i = 0; i < need.length; i += group) await fetchGroup(need.slice(i, i + group));
  return out;
}
/** Cached month doc → 10-min series (reusing the collector's parser); klima gets td from Magnus. */
export function geoSeries(doc) {
  const params = GEO_DATASETS[doc.dataset].params;
  const s = parseTawes10min({ timestamps: doc.timestamps, features: [{ properties: { station: doc.id, parameters: doc.parameters } }] }, params).get(doc.id);
  if (doc.dataset === 'klima-v2-10min') {
    s.td = new Map();
    for (const [ms, t] of s.t) s.td.set(ms, dewPointMagnus(t, s.rh.get(ms) ?? null));
  }
  return s;
}
/** 10-min network month record (the collector's `networkRecord`, restricted to the month's hours). */
export function tenMinMonthRecord(series, month, extra = {}) {
  const obsAtMs = tenMinHourStamps(series, monthStartMs(month), nextMonthStartMs(month) - H);
  const cols = tenMinColumns(series, obsAtMs);
  return encodeRecord(obsAtMs, cols, extra);
}

// ═══ MeteoSwiss SMN ══════════════════════════════════════════════════════════
export const SMN_BASE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn';
const SMN_CACHE = join(CACHE_TRUTH, 'smn');
const smnUrl = (abbr, suffix) => `${SMN_BASE}/${abbr.toLowerCase()}/ogd-smn_${abbr.toLowerCase()}_t_${suffix}.csv`;
const SMN_TS = /^[^;]*;(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2});/;
export function smnLineMs(line) { const m = SMN_TS.exec(line); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null; }
export async function smnMeta() {
  const p = join(SMN_CACHE, 'ogd-smn_meta_stations.csv');
  if (fileAgeMs(p) > 7 * 24 * H) { const { buf } = await httpGet(SMN_META_URL, { net: 'smn', meta: true }); atomicWrite(p, buf); } else RUN.net('smn').cacheHits++;
  return parseSmnStations(new TextDecoder('latin1').decode(readFileSync(p)));
}
/** Full-file fetch with a freshness rule (recent: daily republished; now: running day). */
async function smnWhole(abbr, suffix, needToMs, maxAgeMs) {
  const p = join(SMN_CACHE, abbr, `t_${suffix}.csv`);
  const metaP = `${p}.meta.json`;
  let meta = existsSync(metaP) ? readJson(metaP) : null;
  const fresh = meta && (meta.lastMs >= needToMs || Date.now() - meta.fetchedAtMs < maxAgeMs);
  if (!fresh) {
    const r = await httpGet(smnUrl(abbr, suffix), { net: 'smn', allow404: true });
    if (r.status === 404) return null;
    atomicWrite(p, r.buf);
    const text = r.buf.toString('latin1');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    meta = { fetchedAtMs: Date.now(), lastModified: r.headers.get('last-modified'), firstMs: smnLineMs(lines[1] ?? ''), lastMs: smnLineMs(lines[lines.length - 1] ?? ''), url: smnUrl(abbr, suffix) };
    atomicWrite(metaP, JSON.stringify(meta));
  } else RUN.net('smn').cacheHits++;
  return { path: p, ...meta };
}
/**
 * The decade file (43 MB for 2020-2029) holds 2020 → end of last year; only its tail from `fromMs` is
 * needed. Byte-range binary search on the time-sorted CSV (≈ 20 probes of 2 KB), then one ranged GET.
 */
async function smnHistoricalFrom(abbr, decade, fromMs, toMs) {
  const dir = join(SMN_CACHE, abbr);
  const cached = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`t_historical_${decade}.from-`) && f.endsWith('.csv')) : [];
  for (const f of cached) {
    const meta = readJson(join(dir, `${f}.meta.json`));
    if (meta.fromMs <= fromMs) { RUN.net('smn').cacheHits++; return { path: join(dir, f), ...meta }; }
  }
  const url = smnUrl(abbr, `historical_${decade}`);
  const head = await httpGet(url, { net: 'smn', method: 'HEAD', allow404: true });
  if (head.status === 404) return null;
  const size = Number(head.headers.get('content-length'));
  const rangeText = async (a, b) => (await httpGet(url, { net: 'smn', headers: { Range: `bytes=${a}-${b}` } })).buf.toString('latin1');
  const top = await rangeText(0, 4095);
  const header = top.split(/\r?\n/)[0];
  const firstLineMs = (text) => { const ls = text.split('\n'); for (let i = 1; i < ls.length; i++) { const ms = smnLineMs(ls[i]); if (ms != null) return ms; } return null; };
  let lo = 0, hi = size;
  let probes = 0;
  while (hi - lo > 256 * 1024 && probes < 40) {
    const mid = Math.floor((lo + hi) / 2);
    const ms = firstLineMs(await rangeText(mid, Math.min(size - 1, mid + 2047)));
    probes++;
    if (ms == null || ms >= fromMs) hi = mid; else lo = mid;
  }
  const r = await httpGet(url, { net: 'smn', headers: { Range: `bytes=${lo}-${size - 1}` } });
  const body = r.buf.toString('latin1');
  const lines = body.split(/\r?\n/);
  const keep = [header];
  let firstMs = null, lastMs = null;
  for (let i = 1; i < lines.length; i++) {   // line 0 is the header (lo = 0) or a partial line
    const ms = smnLineMs(lines[i]);
    if (ms == null || ms < fromMs) continue;
    keep.push(lines[i]);
    firstMs ??= ms; lastMs = ms;
  }
  const f = `t_historical_${decade}.from-${isoMin(fromMs).replace(/[-:]/g, '')}.csv`;
  const meta = { fetchedAtMs: Date.now(), url, sizeBytes: size, rangeFrom: lo, probes, fromMs, firstMs, lastMs, lastModified: r.headers.get('last-modified') };
  atomicWrite(join(dir, f), `${keep.join('\n')}\n`);
  atomicWrite(join(dir, `${f}.meta.json`), JSON.stringify(meta));
  return { path: join(dir, f), ...meta };
}
/** Header + the lines in [fromMs, toMs] → text for parseSmn10min (which is reused unchanged). */
function smnWindowText(path, fromMs, toMs) {
  const lines = readFileSync(path, 'latin1').split(/\r?\n/);
  const keep = [lines[0]];
  for (let i = 1; i < lines.length; i++) { const ms = smnLineMs(lines[i]); if (ms != null && ms >= fromMs && ms <= toMs) keep.push(lines[i]); }
  return keep.join('\n');
}
/**
 * One SMN station for [needFromMs − 1 h, needToMs]: recent (Jan 1 of this year → yesterday), the decade
 * file(s) before it, `now` (the running UTC day) after it. A stamp is taken from the first source that
 * carries it in this order: historical, recent, now.
 */
export async function smnStationSeries(abbr, needFromMs, needToMs) {
  const from = needFromMs - H;
  const sources = [];
  const recent = await smnWhole(abbr, 'recent', needToMs, 6 * H);
  const recentFirst = recent?.firstMs ?? Infinity;
  if (from < recentFirst) {
    const y0 = new Date(from).getUTCFullYear();
    const y1 = new Date(Math.min(needToMs, recentFirst - TEN)).getUTCFullYear();
    for (let dec = Math.floor(y0 / 10) * 10; dec <= y1; dec += 10) {
      const h = await smnHistoricalFrom(abbr, `${dec}-${dec + 9}`, Math.max(from, Date.UTC(dec, 0, 1)), needToMs);
      if (h) sources.push({ kind: `historical_${dec}-${dec + 9}`, ...h });
    }
  }
  if (recent) sources.push({ kind: 'recent', ...recent });
  const lastSoFar = Math.max(...sources.map((s) => s.lastMs ?? -Infinity), -Infinity);
  if (needToMs > lastSoFar) {
    const now = await smnWhole(abbr, 'now', needToMs, 20 * 60_000);
    if (now) sources.push({ kind: 'now', ...now });
  }
  const series = Object.fromEntries(Object.keys(SMN_10MIN).map((k) => [k, new Map()]));
  for (const s of sources) {
    const part = parseSmn10min(smnWindowText(s.path, from, needToMs));
    for (const k of Object.keys(series)) for (const [ms, v] of part[k]) if (!series[k].has(ms)) series[k].set(ms, v);
  }
  const coverToMs = Math.max(...sources.map((s) => s.lastMs ?? -Infinity), -Infinity);
  return { series, coverToMs: Number.isFinite(coverToMs) ? coverToMs : null, sources: sources.map((s) => ({ kind: s.kind, url: s.url, firstMs: s.firstMs, lastMs: s.lastMs, rangeFrom: s.rangeFrom ?? null })) };
}

export { TRUTH_SCALES, SENTINEL, TAWES_10MIN, SMN_10MIN, TAWES_HISTORY_URL };
