#!/usr/bin/env node
/**
 * build-dense-obs.mjs — phase OF (`audit/obs-fusion.md` §1.6, §5.4): the DENSE station measurements of the past for the
 * Prüfstand replay, rebuilt from the ORIGINALS (the mirror product `obs/v1` is 26 h deep and force-pushed; the archive slot
 * carries truth only at 681 points and hourly). One file per archive day with the 10-min series of every station of the
 * mirror's catalogue in the window [slot − 7 h, slot]:
 *
 *   DE   DWD CDC 10-min `recent` + `now` (air_temperature, wind, extreme_wind, precipitation) — `wahrheit/quellen.mjs readCdc`,
 *        cached under `<PS_ROOT>/quellen/cdc/` like the truth W1 (the same originals, the same parser); every station's files
 *        are parsed ONCE over the whole range of days and sliced per day
 *   AT   GeoSphere `station/historical/tawes-v1-10min` (TL, TP, RF, FF, DD, FFX, RR), 100 stations per request, per day
 *   CH   MeteoSwiss `ogd-smn/<abbr>/…_t_recent.csv` (+ `_t_now.csv`) — `readSmn`; the automatic precipitation stations
 *        `ogd-smn-precip` (rre150z0) with their own reader on their own base — once over the whole range, sliced per day
 *
 * The station list is the mirror's catalogue (`obs/v1/stations.json`, saved here with its stamp) — the network the browser
 * reads, so the replay and the client select from the same set. Values unchanged (no QC: the client gets none either).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/obsfusion/build-dense-obs.mjs
 *        [--days=2026-09-14,…] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--out=<dir>] [--catalog=<stations.json>] [--offline] [--countries=DE,AT,CH] [--force]
 *
 * Output `<out>/<day>.json.gz`: { kind: 'obsfusion/dense-day', schema: 1, day, slotAt, t0Ms, n, stepMs, stations: { id: { lat, lon,
 * elev, country, cols: { t, td, rh, ff, dd, fx, rr } } } } — `null` = no value. Read by `scripts/pruefstand/lib/obsDense.mjs`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PS_ROOT, H, TEN, cachedGet, mapLimit, p, parseArgs, readJson, sleep } from '../pruefstand/lib/common.mjs';
import { archiveIssues } from '../pruefstand/lib/konserven.mjs';
import { readCdc, readSmn, emptySeries, COLS10 } from '../pruefstand/wahrheit/quellen.mjs';

const args = parseArgs();
const OUT = p(String(args.out ?? p(PS_ROOT, 'obs-dense')));
const WINDOW_H = 7;
const COUNTRIES = String(args.countries ?? 'DE,AT,CH').split(',');
const offline = !!args.offline;
mkdirSync(p(OUT, 'cache', 'tawes'), { recursive: true });
mkdirSync(p(OUT, 'cache', 'smnp'), { recursive: true });
const say = (...a) => console.log(`[dense-obs] ${new Date().toISOString().slice(11, 19)}`, ...a);

// ── the catalogue (the mirror's) ──────────────────────────────────────────────────────────────────────────────────────
const catPath = p(OUT, 'stations.json');
if (args.catalog) { writeFileSync(catPath, readFileSync(String(args.catalog))); say(`Katalog kopiert aus ${args.catalog}`); }
if (!existsSync(catPath)) {
  const r = await fetch('https://raw.githubusercontent.com/jppetry/buscosun-data/main/obs/v1/stations.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Katalog obs/v1/stations.json: HTTP ${r.status}`);
  writeFileSync(catPath, Buffer.from(await r.arrayBuffer()));
  say('Katalog obs/v1/stations.json geholt');
}
const catalog = readJson(catPath);
if (catalog.kind !== 'obs/stations' || catalog.schema !== 1) throw new Error('Katalog: nicht obs/stations Schema 1');
const stations = catalog.stations.filter((s) => s.networks.some((n) => ['dwd10', 'tawes', 'smn', 'smnp'].includes(n)) && COUNTRIES.includes(s.country === 'LI' ? 'CH' : s.country));
say(`Katalog ${catalog.builtAt}: ${stations.length} 10-min-Stationen (${COUNTRIES.join('/')})`);

// ── the days ──────────────────────────────────────────────────────────────────────────────────────────────────────────
let issues = archiveIssues();
if (args.days) issues = issues.filter((i) => String(args.days).split(',').includes(i.day));
if (args.from) issues = issues.filter((i) => i.day >= String(args.from));
if (args.to) issues = issues.filter((i) => i.day <= String(args.to));
if (!args.force) issues = issues.filter((i) => !existsSync(p(OUT, `${i.day}.json.gz`)));
if (!issues.length) { say('nichts zu tun'); process.exit(0); }
const dayWindow = (issue) => { const toMs = Math.floor(issue.slotAtMs / TEN) * TEN; return { fromMs: toMs - WINDOW_H * H, toMs }; };
const gFrom = Math.min(...issues.map((i) => dayWindow(i).fromMs)), gTo = Math.max(...issues.map((i) => dayWindow(i).toMs));
say(`${issues.length} Archivtage: ${issues[0].day} … ${issues.at(-1).day}; Lesefenster ${new Date(gFrom).toISOString()} … ${new Date(gTo).toISOString()}`);

// ── readers ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const SMNP = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn-precip';
const FRESH_MS = 20 * H;
const stale = (path) => { try { return Date.now() - (readJson(`${path}.meta`)?.at ?? 0) > FRESH_MS; } catch { return true; } };
/** CH automatic precipitation station: rre150z0 per 10 min from the year file (+ the day file). */
async function readSmnPrecip(abbr, fromMs, toMs) {
  const ser = emptySeries(fromMs, toMs);
  const a = abbr.toLowerCase();
  for (const kind of ['recent', 'now']) {
    const path = p(OUT, 'cache', 'smnp', `${a}_t_${kind}.csv`);
    const refresh = !offline && (!existsSync(path) || stale(path));
    const buf = await cachedGet(`${SMNP}/${a}/ogd-smn-precip_${a}_t_${kind}.csv`, path, { refresh });
    if (refresh) writeFileSync(`${path}.meta`, JSON.stringify({ at: Date.now() }));
    if (!buf) continue;
    const txt = buf.toString('latin1');
    const nl = txt.indexOf('\n'); const head = txt.slice(0, nl).trim().split(';'); const it = head.indexOf('reference_timestamp'), ir = head.indexOf('rre150z0');
    if (it < 0 || ir < 0) continue;
    let pos = nl + 1;
    while (pos < txt.length) {
      let e = txt.indexOf('\n', pos); if (e < 0) e = txt.length;
      const line = txt.slice(pos, e); pos = e + 1;
      const f = line.split(';'); const s = f[it]; if (!s || s.length < 16) continue;
      const ms = Date.UTC(+s.slice(6, 10), +s.slice(3, 5) - 1, +s.slice(0, 2), +s.slice(11, 13), +s.slice(14, 16));
      const i = (ms - ser.t0Ms) / TEN;
      if (Number.isInteger(i) && i >= 0 && i < ser.n && f[ir] !== '' && f[ir] != null) { const v = Number(f[ir]); if (Number.isFinite(v)) ser.cols.rr[i] = v; }
    }
  }
  return ser;
}
const TAWES_COLS = { TL: 't', TP: 'td', RF: 'rh', FF: 'ff', DD: 'dd', FFX: 'fx', RR: 'rr' };
/** AT: all TAWES stations of one day window, 100 per request (5/s, 240/h) — cached per (day, chunk). */
async function readTawesDay(day, ids, fromMs, toMs) {
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 16);
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const path = p(OUT, 'cache', 'tawes', `${day}-${String(i / 100).padStart(2, '0')}.json`);
    const url = `https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?parameters=${Object.keys(TAWES_COLS).join(',')}&station_ids=${chunk.join(',')}&start=${fmt(fromMs)}&end=${fmt(toMs)}&output_format=geojson`;
    const buf = await cachedGet(url, path, { pauseMs: 400, refresh: !offline && !existsSync(path) });
    if (!buf) continue;
    const j = JSON.parse(buf.toString('utf8'));
    const stamps = (j.timestamps ?? []).map((s) => Date.parse(s));
    for (const f of j.features ?? []) {
      const ser = emptySeries(fromMs, toMs);
      for (const [pname, col] of Object.entries(TAWES_COLS)) {
        const data = f.properties?.parameters?.[pname]?.data; if (!data) continue;
        for (let k = 0; k < stamps.length; k++) { const v = data[k]; if (v == null) continue; const idx = (stamps[k] - fromMs) / TEN; if (Number.isInteger(idx) && idx >= 0 && idx < ser.n) ser.cols[col][idx] = Number(v); }
      }
      out.set(String(f.properties.station), ser);
    }
    await sleep(250);
  }
  return out;
}
const cdcVarsOf = (s) => { const v = new Set(); if (s.vars.includes('t') || s.vars.includes('rh') || s.vars.includes('td')) v.add('tu'); if (s.vars.includes('ff') || s.vars.includes('dd')) v.add('ff'); if (s.vars.includes('fx')) v.add('fx'); if (s.vars.includes('rr')) v.add('rr'); return [...v]; };

// ── read every DE/CH station ONCE over the whole range ────────────────────────────────────────────────────────────────
const t0 = Date.now();
const series = new Map();   // id → { ser (global window), country }
const de = stations.filter((s) => s.country === 'DE' && s.networks.includes('dwd10'));
let done = 0;
await mapLimit(de, 4, async (s) => {
  try { series.set(s.id, await readCdc(s.id.slice(3), cdcVarsOf(s), gFrom, gTo, { offline })); } catch (e) { say(`  ${s.id}: ${e?.message ?? e}`); }
  done += 1; if (done % 200 === 0) say(`  DE ${done}/${de.length} Stationen, ${Math.round((Date.now() - t0) / 1000)} s`);
});
const ch = stations.filter((s) => (s.country === 'CH' || s.country === 'LI') && (s.networks.includes('smn') || s.networks.includes('smnp')));
await mapLimit(ch, 4, async (s) => {
  const abbr = s.id.slice(3);
  try { series.set(s.id, s.networks.includes('smn') ? await readSmn(abbr, gFrom, gTo, { offline }) : await readSmnPrecip(abbr, gFrom, gTo)); } catch (e) { say(`  ${s.id}: ${e?.message ?? e}`); }
});
say(`DE + CH gelesen: ${series.size} Reihen in ${Math.round((Date.now() - t0) / 1000)} s`);
const at = stations.filter((s) => s.country === 'AT' && s.networks.includes('tawes'));

// ── write the days ────────────────────────────────────────────────────────────────────────────────────────────────────
const sliceCols = (ser, fromMs, n) => {
  const o = {}; const off = (fromMs - ser.t0Ms) / TEN;
  if (!Number.isInteger(off)) throw new Error('Fenster nicht auf dem 10-min-Raster');
  for (const c of COLS10) { const arr = new Array(n); let any = false; for (let i = 0; i < n; i++) { const x = ser.cols[c][off + i]; const v = Number.isFinite(x) ? Math.round(x * 100) / 100 : null; arr[i] = v; if (v != null) any = true; } if (any) o[c] = arr; }
  return o;
};
for (const issue of issues) {
  const outPath = p(OUT, `${issue.day}.json.gz`);
  const { fromMs, toMs } = dayWindow(issue);
  const n = WINDOW_H * 6 + 1;
  const td = Date.now();
  const doc = { kind: 'obsfusion/dense-day', schema: 1, day: issue.day, slotAt: new Date(issue.slotAtMs).toISOString(), slotAtMs: issue.slotAtMs, t0Ms: fromMs, n, stepMs: TEN, window: 'UTC, Ende des 10-min-Intervalls; [Slot − 7 h, Slot] auf das 10-min-Raster gerundet', catalog: { builtAt: catalog.builtAt, count: stations.length }, sources: {}, builtAt: new Date().toISOString(), stations: {} };
  const counts = { de: 0, at: 0, ch: 0, chp: 0, empty: 0 };
  for (const s of [...de, ...ch]) {
    const ser = series.get(s.id); if (!ser) { counts.empty += 1; continue; }
    const cols = sliceCols(ser, fromMs, n);
    if (!Object.keys(cols).length) { counts.empty += 1; continue; }
    doc.stations[s.id] = { lat: s.lat, lon: s.lon, elev: s.elev, country: s.country, cols };
    if (s.country === 'DE') counts.de += 1; else if (s.networks.includes('smn')) counts.ch += 1; else counts.chp += 1;
  }
  const tawes = await readTawesDay(issue.day, at.map((s) => s.id.slice(3)), fromMs, toMs);
  for (const s of at) { const ser = tawes.get(s.id.slice(3)); if (!ser) { counts.empty += 1; continue; } const cols = sliceCols(ser, fromMs, n); if (!Object.keys(cols).length) { counts.empty += 1; continue; } doc.stations[s.id] = { lat: s.lat, lon: s.lon, elev: s.elev, country: 'AT', cols }; counts.at += 1; }
  doc.sources = { DE: 'DWD CDC 10-min recent/now (quellen.mjs readCdc)', AT: 'GeoSphere tawes-v1-10min historical (100 je Anfrage)', CH: 'MeteoSwiss ogd-smn t_recent/t_now (readSmn) + ogd-smn-precip (rre150z0)', counts };
  writeFileSync(outPath, gzipSync(Buffer.from(JSON.stringify(doc))));
  say(`${issue.day}: DE ${counts.de} · AT ${counts.at} · CH ${counts.ch} + ${counts.chp} Niederschlag · leer ${counts.empty} — ${Math.round((Date.now() - td) / 1000)} s`);
}
say(`fertig (${Math.round((Date.now() - t0) / 1000)} s)`);
