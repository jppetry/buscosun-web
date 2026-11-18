#!/usr/bin/env node
/**
 * SW Gate D — daily archive of the sea line in `buscosun-archiv` `sea/v1/` (pattern road/v1, append-only):
 *   sea/v1/<YYYY-MM-DD>/spots-<run>.json.gz   spot series of every published CWAM run (waves + buscosun Fusion wind)
 *   sea/v1/<YYYY-MM-DD>/spots-<run>-w<t1>.json.gz   wind refresh of that run on a newer t1 cube (V-SW-2), as found in the store
 *                                               (phase SU: both carry the optional quantiles `q` per spot; index → `band`)
 *   sea/v1/<YYYY-MM-DD>/current-<run>.json.gz  phase ST: surface current of the BSH at the spots (hourly speed, sets towards, slack water)
 *   sea/v1/<YYYY-MM-DD>/poi.json.gz            hourly POI measurements of the coastal stations of the catalogue
 *                                               (mean wind, direction, gust of the last hour) — the truth for Gate D
 *   sea/v1/<YYYY-MM-DD>/text.json.gz           every text issue of that day (display text + raw + issue time)
 *   sea/v1/<YYYY-MM-DD>/wtemp.json.gz          phase WT: hourly measured water temperature of the stations of `static/watertemp.json`
 *                                               (WSV PEGELONLINE `WT`, DMI oceanObs `tw`) — our own record, from which a season curve can grow
 *   sea/v1/wtemp-daily.json                    phase WT: per station and UTC day [min, mean, max, hours] — plain JSON, read by the page
 *   sea/v1/<YYYY-MM-DD>/wtemp-model-<stamp>.json.gz   phase WT: the water temperature of the DMI model at the spots, as found in the store
 *   sea/v1/index.json                          days and what they hold
 * Past forecasts cannot be recovered, measurements can (DWD CDC) — so the spot series are the critical part; the POI
 * file holds 25 h, the 6-hourly run overlaps it fourfold. Merges are by key; nothing is ever deleted.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-archive.mjs
 *     --store=<buscosun-data sea/v1 checkout> --archive=<buscosun-archiv sea/v1> [--now=<iso>] [--poi=0]
 *     [--wtemp=0] [--wtemp-days=<n>]   days of measurements asked per station (default: what closes the hole since the newest
 *                                      stored day, 2 … 31 — the first run takes the 31 days PEGELONLINE holds)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SEA_SPOT_CATALOG_PATH, SEA_SPOTS_WIND_RE, SEA_CURRENT_DIR, SEA_CURRENT_RE, seaRunMs, hasQuantiles } from '../../src/sea/seaContract.ts';
import { SEA_TEXT_STAGE1, seaIssueMs } from '../../src/sea/seaText.ts';
import {
  SEA_WT_CATALOG_PATH, SEA_WT_ARCHIVE_PRODUCT, SEA_WT_DAILY_FILE, SEA_WT_DAILY_PRODUCT, SEA_WT_DIR, SEA_WT_RE, SEA_WT_PRODUCT, WT_DAY_MIN_HOURS, WSV_CREDIT,
  wtCatalogOf, wtObsUrl, wtObsOf, wtHourly, wtDayStat,
} from '../../src/sea/seaWaterTemp.ts';
import { DMI_CREDIT } from '../../src/sea/seaDmi.ts';

const SELF = fileURLToPath(import.meta.url);
const POI_BASE = 'https://opendata.dwd.de/weather/weather_reports/poi/';
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readGz = (p) => { try { return JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')); } catch { return null; } };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
function writeGz(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 }));
  renameSync(tmp, file);
}

/** POI CSV → hourly rows { t, ff, dd, fx } in m/s and degrees (the file states km/h). */
export function parsePoi(text) {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = rows[0].split(';');
  const ci = {
    ff: head.indexOf('mean_wind_speed_during last_10_min_at_10_meters_above_ground'),
    dd: head.indexOf('mean_wind_direction_during_last_10 min_at_10_meters_above_ground'),
    fx: head.indexOf('maximum_wind_speed_last_hour'),
  };
  const unit = rows[1].split(';');
  const kmh = (c) => unit[c] === 'km/h';
  const num = (s) => (s == null || s === '' || s === '---' ? null : Number(s.replace(',', '.')));
  const out = [];
  for (const r of rows.slice(3)) {
    const c = r.split(';');
    const [d, t] = c;
    if (!/^\d\d\.\d\d\.\d\d$/.test(d) || !/^\d\d:\d\d$/.test(t)) continue;
    const ms = Date.UTC(2000 + +d.slice(6, 8), +d.slice(3, 5) - 1, +d.slice(0, 2), +t.slice(0, 2), +t.slice(3, 5));
    const v = (k) => { const x = ci[k] >= 0 ? num(c[ci[k]]) : null; return x == null || !Number.isFinite(x) ? null : k !== 'dd' && kmh(ci[k]) ? Math.round((x / 3.6) * 10) / 10 : x; };
    out.push({ t: new Date(ms).toISOString(), ff: v('ff'), dd: v('dd'), fx: v('fx') });
  }
  return out;
}

/**
 * Phase SU: the spot files are archived whole, so the optional quantiles (`q` per spot) are carried as they are. The
 * index names the files that hold them (`band`) — the later evaluation of the band against the POI measurements reads
 * exactly those, without opening every file.
 */
function noteBand(entry, key, doc) {
  if (!Object.values(doc?.spots ?? {}).some((s) => hasQuantiles(s?.q))) return;
  (entry.band ??= []).includes(key) || entry.band.push(key);
}

/** Days of measurements one pass asks for per station at least: the pass runs every 6 h, two days overlap eightfold. */
export const WT_ARCHIVE_DAYS = 2;
const WT_UA = 'buscosun-sea-archiv (buscosun.com Seewetter, measured water temperature, 6-hourly)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Phase WT: the measured water temperature of every station of the catalogue (`static/watertemp.json`), thinned to whole
 * hours (`wtHourly`), merged per UTC day by hour — a value once stored is never replaced or deleted. Then the daily
 * record `wtemp-daily.json` for the touched days, computed from the day files themselves. A station that does not answer
 * is logged and left out; values outside the value lock never enter (`wtObsOf`).
 */
/** PEGELONLINE holds 31 days — more cannot be asked for. */
export const WT_ARCHIVE_MAX_DAYS = 31;
/**
 * How many days a pass asks for: enough to close the hole since the newest day of the daily record (a workflow that
 * stood still for a week heals itself), at least `WT_ARCHIVE_DAYS`, at most what PEGELONLINE holds. Without a record
 * (the first run) everything the sources still hold.
 */
export function wtArchiveDays(daily, nowMs) {
  const last = Object.values(daily?.stations ?? {}).flatMap((s) => Object.keys(s?.days ?? {})).sort().at(-1);
  if (!last || !Number.isFinite(Date.parse(`${last}T00:00:00Z`))) return WT_ARCHIVE_MAX_DAYS;
  const gap = Math.ceil((nowMs - Date.parse(`${last}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.max(WT_ARCHIVE_DAYS, Math.min(WT_ARCHIVE_MAX_DAYS, gap));
}

export async function archiveWaterTemp({ storeDir, archiveDir, index, nowMs, days = null, fetchImpl = fetch, log = () => {}, pauseMs = 500 }) {
  const cat = wtCatalogOf(readJson(join(storeDir, SEA_WT_CATALOG_PATH)));
  if (!cat) return { wtRows: 0, wtStations: 0, wtDays: 0, wtReason: 'kein Katalog der Wassertemperatur im Speicher' };
  days ??= wtArchiveDays(readJson(join(archiveDir, SEA_WT_DAILY_FILE)), nowMs);
  const merged = {};
  let answered = 0;
  for (const st of cat.stations) {
    try {
      if (st.net === 'dmi' && pauseMs) await sleep(pauseMs);
      const r = await fetchImpl(wtObsUrl(st, nowMs, days), { headers: { 'user-agent': WT_UA, accept: 'application/json' }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) { log(`Wassertemperatur ${st.key}: HTTP ${r.status}`); continue; }
      const s = wtObsOf(st.net, await r.json());
      if (!s) { log(`Wassertemperatur ${st.key}: Antwort nicht lesbar`); continue; }
      answered++;
      if (s.dropped) log(`Wassertemperatur ${st.key}: ${s.dropped} Werte außerhalb der Werteprüfung verworfen`);
      for (const p of wtHourly(s.points)) { if (p.t > nowMs) continue; ((merged[day(p.t)] ??= {})[st.key] ??= []).push(p); }
    } catch (e) { log(`Wassertemperatur ${st.key}: ${String(e?.message ?? e).split('\n')[0]}`); }
  }
  let wtRows = 0;
  const touched = [];
  for (const [d, sts] of Object.entries(merged)) {
    const file = join(archiveDir, d, 'wtemp.json.gz');
    const doc = readGz(file) ?? {
      schema: 1, product: SEA_WT_ARCHIVE_PRODUCT, day: d, unit: '°C',
      about: 'Gemessene Wassertemperatur der Stationen des Katalogs sea/v1/static/watertemp.json zur vollen Stunde (der Wert, der der Stunde am nächsten liegt, höchstens 10 min entfernt). Rohwerte der Quellen, nur gegen feste Grenzen geprüft.',
      sources: { wsv: WSV_CREDIT, dmi: DMI_CREDIT }, stations: {},
    };
    let n = 0;
    for (const [key, pts] of Object.entries(sts)) {
      const have = new Map((doc.stations[key] ?? []).map((x) => [x.t, x]));
      for (const p of pts) { const t = new Date(p.t).toISOString(); if (!have.has(t)) { have.set(t, { t, c: p.c }); n++; } }
      doc.stations[key] = [...have.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
    }
    if (!n) continue;
    writeGz(file, doc);
    wtRows += n; touched.push(d);
    (index.days[d] ??= { spots: [], poiStations: 0, texts: 0 }).wtempStations = Object.keys(doc.stations).length;
  }
  if (touched.length) {
    const file = join(archiveDir, SEA_WT_DAILY_FILE);
    const old = readJson(file);
    const daily = old?.product === SEA_WT_DAILY_PRODUCT && old.stations ? old : {
      schema: 1, product: SEA_WT_DAILY_PRODUCT, updatedAt: null, unit: '°C', minHours: WT_DAY_MIN_HOURS,
      about: 'Je Station und UTC-Tag [Minimum, Mittel, Maximum, Zahl der Stundenwerte] der gemessenen Wassertemperatur aus sea/v1/<Tag>/wtemp.json.gz. Ein Tag zählt für eine Kurve erst ab minHours Stundenwerten.',
      sources: { wsv: WSV_CREDIT, dmi: DMI_CREDIT }, stations: {},
    };
    const names = new Map(cat.stations.map((s) => [s.key, s]));
    for (const d of touched) {
      const doc = readGz(join(archiveDir, d, 'wtemp.json.gz'));
      for (const [key, rows] of Object.entries(doc?.stations ?? {})) {
        const stat = wtDayStat(rows.map((x) => x.c));
        if (!stat) continue;
        const e = (daily.stations[key] ??= { name: names.get(key)?.name ?? key, net: key.split(':')[0], days: {} });
        e.days[d] = stat;
      }
    }
    for (const e of Object.values(daily.stations)) e.days = Object.fromEntries(Object.entries(e.days).sort(([a], [b]) => (a < b ? -1 : 1)));
    daily.updatedAt = new Date(nowMs).toISOString();
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(daily) + '\n');
    renameSync(tmp, file);
  }
  return { wtRows, wtStations: answered, wtDays: touched.length, wtAsked: days };
}

export async function archiveSea({ storeDir, archiveDir, nowMs = Date.now(), poi = true, wtemp = true, wtempDays = null, fetchImpl = fetch, log = () => {} }) {
  const index = readJson(join(archiveDir, 'index.json')) ?? { schema: 1, product: 'sea-archive', days: {} };
  const touch = (d, k) => { const e = (index.days[d] ??= { spots: [], poiStations: 0, texts: 0 }); return e; };
  let spotsAdded = 0, textsAdded = 0, poiRows = 0, currentAdded = 0, wtModelAdded = 0;
  // Spot series of every run in the store.
  const sdir = join(storeDir, 'spots');
  for (const f of existsSync(sdir) ? readdirSync(sdir).filter((x) => /^\d{10}\.json$/.test(x)) : []) {
    const run = f.slice(0, 10), d = day(seaRunMs(run));
    const dst = join(archiveDir, d, `spots-${run}.json.gz`);
    if (existsSync(dst)) continue;
    const doc = readJson(join(sdir, f));
    writeGz(dst, doc);
    const e = touch(d); if (!e.spots.includes(run)) e.spots.push(run);
    noteBand(e, run, doc);
    spotsAdded++;
  }
  // V-SW-2/V-SW-15: the wind refreshes in the store — since V-SW-15 all of a kept run stay ≥ 12 h, so every 6-h pass sees each one.
  for (const f of existsSync(sdir) ? readdirSync(sdir).filter((x) => SEA_SPOTS_WIND_RE.test(x)) : []) {
    const key = f.slice(0, -'.json'.length), d = day(seaRunMs(f.slice(0, 10)));
    const dst = join(archiveDir, d, `spots-${key}.json.gz`);
    if (existsSync(dst)) continue;
    const doc = readJson(join(sdir, f));
    writeGz(dst, doc);
    const e = touch(d); (e.wind ??= []).includes(key) || e.wind.push(key);
    noteBand(e, key, doc);
    spotsAdded++;
  }
  // Phase ST: the surface current of the BSH at the spots (`current/<run>.json`, origin `bsh`) — whole, once per run. The
  // store keeps two runs (≥ 12 h each as the newest), the 6-hourly pass sees every one. The thinned map field is not archived.
  const cdir = join(storeDir, SEA_CURRENT_DIR);
  for (const f of existsSync(cdir) ? readdirSync(cdir).filter((x) => SEA_CURRENT_RE.test(x)) : []) {
    const run = f.slice(0, 10), d = day(seaRunMs(run));
    const dst = join(archiveDir, d, `current-${run}.json.gz`);
    if (existsSync(dst)) continue;
    const doc = readJson(join(cdir, f));
    if (doc?.product !== 'sea-current' || doc.run !== run) continue;
    writeGz(dst, doc);
    const e = touch(d); (e.current ??= []).includes(run) || e.current.push(run);
    currentAdded++;
  }
  // Phase WT: the water temperature of the DMI model at the spots (`wtemp/<stamp>.json`) — whole, once per file. Past
  // forecasts cannot be recovered; with the measured values of the stations beside them the model can be judged later.
  const wdir = join(storeDir, SEA_WT_DIR);
  for (const f of existsSync(wdir) ? readdirSync(wdir).filter((x) => SEA_WT_RE.test(x)) : []) {
    const stamp = f.slice(0, 12), d = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
    const dst = join(archiveDir, d, `wtemp-model-${stamp}.json.gz`);
    if (existsSync(dst)) continue;
    const doc = readJson(join(wdir, f));
    if (doc?.product !== SEA_WT_PRODUCT || doc.stamp !== stamp) continue;
    writeGz(dst, doc);
    const e = touch(d); (e.wtempModel ??= []).includes(stamp) || e.wtempModel.push(stamp);
    wtModelAdded++;
  }
  // Text issues, merged per day by `<product>/<issue>`.
  const byDay = {};
  for (const p of SEA_TEXT_STAGE1) {
    const tdir = join(storeDir, 'text', p);
    for (const f of existsSync(tdir) ? readdirSync(tdir).filter((x) => /^\d{10}\.json$/.test(x)) : []) {
      const d = day(seaIssueMs(f.slice(0, 10)));
      (byDay[d] ??= []).push([`${p}/${f.slice(0, 10)}`, join(tdir, f)]);
    }
  }
  for (const [d, list] of Object.entries(byDay)) {
    const file = join(archiveDir, d, 'text.json.gz');
    const doc = readGz(file) ?? { schema: 1, product: 'sea-archive-text', day: d, issues: {} };
    let n = 0;
    for (const [k, p] of list) if (!doc.issues[k]) { const t = readJson(p); if (t) { doc.issues[k] = { issuedAt: t.issuedAt, dwdAt: t.dwdAt, sha256: t.sha256, raw: t.raw, parts: t.parts }; n++; } }
    if (n) { writeGz(file, doc); touch(d).texts = Object.keys(doc.issues).length; textsAdded += n; }
  }
  // POI measurements of the catalogue's stations (+ Arkona, the plan's sure station).
  if (poi) {
    const cat = readJson(join(storeDir, SEA_SPOT_CATALOG_PATH));
    const ids = [...new Set([...(cat?.spots ?? []).map((s) => s.station?.id).filter(Boolean), '10091'])].sort();
    const merged = {};
    for (const id of ids) {
      try {
        const r = await fetchImpl(`${POI_BASE}${id}-BEOB.csv`, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) { log(`POI ${id}: HTTP ${r.status}`); continue; }
        for (const row of parsePoi(await r.text())) { const d = row.t.slice(0, 10); ((merged[d] ??= {})[id] ??= []).push(row); }
      } catch (e) { log(`POI ${id}: ${e.message}`); }
    }
    for (const [d, st] of Object.entries(merged)) {
      const file = join(archiveDir, d, 'poi.json.gz');
      const doc = readGz(file) ?? { schema: 1, product: 'sea-archive-poi', day: d, units: { ff: 'm/s (10-min-Mittel zur vollen Stunde)', dd: 'Grad', fx: 'm/s (Böe der letzten Stunde)' }, source: 'DWD POI weather_reports/poi, GeoNutzV', stations: {} };
      for (const [id, rows] of Object.entries(st)) {
        const have = new Map((doc.stations[id] ?? []).map((x) => [x.t, x]));
        for (const x of rows) if (!have.has(x.t)) { have.set(x.t, x); poiRows++; }
        doc.stations[id] = [...have.values()].sort((a, b) => (a.t < b.t ? -1 : 1));
      }
      writeGz(file, doc);
      touch(d).poiStations = Object.keys(doc.stations).length;
    }
  }
  // Phase WT: measured water temperature of the catalogue stations (skips itself without the catalogue file).
  const wt = wtemp ? await archiveWaterTemp({ storeDir, archiveDir, index, nowMs, days: wtempDays, fetchImpl, log }) : { wtRows: 0, wtStations: 0, wtDays: 0 };
  index.updatedAt = new Date(nowMs).toISOString();
  for (const e of Object.values(index.days)) { e.spots.sort(); e.wind?.sort(); e.band?.sort(); e.current?.sort(); e.wtempModel?.sort(); }
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return { spotsAdded, textsAdded, poiRows, currentAdded, wtModelAdded, ...wt, days: Object.keys(index.days).length };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = await archiveSea({ storeDir: resolve(String(args.store)), archiveDir: resolve(String(args.archive)), nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(), poi: args.poi !== '0', wtemp: args.wtemp !== '0', wtempDays: typeof args['wtemp-days'] === 'string' ? Math.max(1, Math.min(WT_ARCHIVE_MAX_DAYS, Number(args['wtemp-days']) || WT_ARCHIVE_DAYS)) : null, log: (m) => console.log(`[sea-archive] ${m}`) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
