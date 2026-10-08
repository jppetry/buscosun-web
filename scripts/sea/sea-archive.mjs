#!/usr/bin/env node
/**
 * SW Gate D — daily archive of the sea line in `buscosun-archiv` `sea/v1/` (pattern road/v1, append-only):
 *   sea/v1/<YYYY-MM-DD>/spots-<run>.json.gz   spot series of every published CWAM run (waves + buscosun Fusion wind)
 *   sea/v1/<YYYY-MM-DD>/spots-<run>-w<t1>.json.gz   wind refresh of that run on a newer t1 cube (V-SW-2), as found in the store
 *   sea/v1/<YYYY-MM-DD>/poi.json.gz            hourly POI measurements of the coastal stations of the catalogue
 *                                               (mean wind, direction, gust of the last hour) — the truth for Gate D
 *   sea/v1/<YYYY-MM-DD>/text.json.gz           every text issue of that day (display text + raw + issue time)
 *   sea/v1/index.json                          days and what they hold
 * Past forecasts cannot be recovered, measurements can (DWD CDC) — so the spot series are the critical part; the POI
 * file holds 25 h, the 6-hourly run overlaps it fourfold. Merges are by key; nothing is ever deleted.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-archive.mjs
 *     --store=<buscosun-data sea/v1 checkout> --archive=<buscosun-archiv sea/v1> [--now=<iso>] [--poi=0]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SEA_SPOT_CATALOG_PATH, SEA_SPOTS_WIND_RE, seaRunMs } from '../../src/sea/seaContract.ts';
import { SEA_TEXT_STAGE1, seaIssueMs } from '../../src/sea/seaText.ts';

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

export async function archiveSea({ storeDir, archiveDir, nowMs = Date.now(), poi = true, fetchImpl = fetch, log = () => {} }) {
  const index = readJson(join(archiveDir, 'index.json')) ?? { schema: 1, product: 'sea-archive', days: {} };
  const touch = (d, k) => { const e = (index.days[d] ??= { spots: [], poiStations: 0, texts: 0 }); return e; };
  let spotsAdded = 0, textsAdded = 0, poiRows = 0;
  // Spot series of every run in the store.
  const sdir = join(storeDir, 'spots');
  for (const f of existsSync(sdir) ? readdirSync(sdir).filter((x) => /^\d{10}\.json$/.test(x)) : []) {
    const run = f.slice(0, 10), d = day(seaRunMs(run));
    const dst = join(archiveDir, d, `spots-${run}.json.gz`);
    if (existsSync(dst)) continue;
    writeGz(dst, readJson(join(sdir, f)));
    const e = touch(d); if (!e.spots.includes(run)) e.spots.push(run);
    spotsAdded++;
  }
  // V-SW-2/V-SW-15: the wind refreshes in the store — since V-SW-15 all of a kept run stay ≥ 12 h, so every 6-h pass sees each one.
  for (const f of existsSync(sdir) ? readdirSync(sdir).filter((x) => SEA_SPOTS_WIND_RE.test(x)) : []) {
    const key = f.slice(0, -'.json'.length), d = day(seaRunMs(f.slice(0, 10)));
    const dst = join(archiveDir, d, `spots-${key}.json.gz`);
    if (existsSync(dst)) continue;
    writeGz(dst, readJson(join(sdir, f)));
    const e = touch(d); (e.wind ??= []).includes(key) || e.wind.push(key);
    spotsAdded++;
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
  index.updatedAt = new Date(nowMs).toISOString();
  for (const e of Object.values(index.days)) { e.spots.sort(); e.wind?.sort(); }
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return { spotsAdded, textsAdded, poiRows, days: Object.keys(index.days).length };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const res = await archiveSea({ storeDir: resolve(String(args.store)), archiveDir: resolve(String(args.archive)), nowMs: typeof args.now === 'string' ? Date.parse(args.now) : Date.now(), poi: args.poi !== '0', log: (m) => console.log(`[sea-archive] ${m}`) });
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
