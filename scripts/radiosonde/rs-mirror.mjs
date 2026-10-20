#!/usr/bin/env node
/**
 * Radiosonde mirror `radiosonde/v1` (contract `src/atmosphere/rsContract.ts`).
 *
 * Every run: list `bufr/` and `trajectories/` on opendata.dwd.de, fetch only the files not yet in `state.json`, decode
 * the TEMP bulletins (`tempBufr.ts`), keep the ascents inside RS_BOX, and per ascent (station + launch minute) the most
 * complete bulletin (highest top, then most levels — the services send a part up to 100 hPa first, the full ascent later).
 * The GPS track of a DWD ascent only adds wind where the bulletin has none (or there is no bulletin at all), never T.
 * Levels are thinned by height (RS_THIN_*), ascents older than RS_RETAIN_H leave the tree.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/radiosonde/rs-mirror.mjs --store=<dir>
 *        [--src=<local copy: <src>/bufr/*.bin, <src>/trajectories/*.json>] [--now=<ISO>]
 * Last line: JSON summary, `changed: true` when index or tree changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  RS_BOX, RS_DIR, RS_GPS_WINDOW_S, RS_RETAIN_H, RS_SCHEMA, RS_SOURCE_BASE, RS_SOURCE_LABEL,
  RS_STATION_NAMES, RS_THIN_HIGH_M, RS_THIN_LOW_M, RS_THIN_SPLIT_M, rsLaunchStamp, rsSoundingDir, rsStationName,
} from '../../src/atmosphere/rsContract.ts';
import { decodeBufrFile, tempSounding } from '../../src/atmosphere/tempBufr.ts';

const UA = 'buscosun-radiosonde/0.1 (+https://buscosun.com)';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const store = resolve(String(args.store ?? 'rs-store'));
const src = args.src ? resolve(String(args.src)) : null;
const nowMs = args.now ? Date.parse(String(args.now)) : Date.now();
const log = (m) => console.error(`[rs-mirror] ${m}`);

// Store paths are relative to the data repo root (`radiosonde/v1/...`); the store IS radiosonde/v1.
const local = (repoPath) => join(store, repoPath.slice(RS_DIR.length + 1));
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };

const index = readJson(join(store, 'index.json'), { schema: RS_SCHEMA, soundings: [] });
const state = readJson(join(store, 'state.json'), { processed: [] });
const processed = new Set(state.processed);
const byId = new Map(index.soundings.map((e) => [e.id, e]));
let changed = false;

async function listDir(sub) {
  if (src) return existsSync(join(src, sub)) ? readdirSync(join(src, sub)).sort() : [];
  const res = await fetch(`${RS_SOURCE_BASE}/${sub}/`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${sub}/: HTTP ${res.status}`);
  const html = await res.text();
  return [...new Set([...html.matchAll(/href="([^"?/][^"]*)"/g)].map((m) => decodeURIComponent(m[1])))].sort();
}

async function getFile(sub, name) {
  if (src) return new Uint8Array(readFileSync(join(src, sub, name)));
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${RS_SOURCE_BASE}/${sub}/${encodeURIComponent(name)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) return null; // left the 48-h window between listing and fetch
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw new Error(`${sub}/${name}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const inBox = (lat, lon) => lat >= RS_BOX.latMin && lat <= RS_BOX.latMax && lon >= RS_BOX.lonMin && lon <= RS_BOX.lonMax;
const r1 = (x, d) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

/** Levels of one bulletin: drop levels without pressure or without any measured value (standard levels below ground,
 *  the empty top), fill a missing gpm by ln p between measured neighbours. */
function bulletinLevels(snd) {
  const ls = snd.levels.filter((l) => l.pHpa != null && l.pHpa > 0 && (l.tC != null || l.tdC != null || l.ffMs != null));
  const known = ls.map((l, i) => (l.zM != null ? i : -1)).filter((i) => i >= 0);
  if (known.length < 2) return [];
  return ls.map((l, i) => {
    if (l.zM != null) return { ...l };
    let a = -1, b = -1;
    for (const k of known) { if (k < i) a = k; else { b = k; break; } }
    if (a < 0 || b < 0) return null;
    const la = Math.log(ls[a].pHpa), lb = Math.log(ls[b].pHpa);
    return { ...l, zM: ls[a].zM + (ls[b].zM - ls[a].zM) * (la - Math.log(l.pHpa)) / (la - lb) };
  }).filter(Boolean);
}

/** Height thinning; short (classic TEMP) profiles stay complete, their levels carry different elements. */
function thin(levels) {
  if (levels.length <= 400) return levels;
  const out = [];
  let last = -Infinity;
  levels.forEach((l, i) => {
    const step = l.zM < RS_THIN_SPLIT_M ? RS_THIN_LOW_M : RS_THIN_HIGH_M;
    if (i === 0 || i === levels.length - 1 || l.zM >= last + step) { out.push(l); last = l.zM; }
  });
  return out;
}

const hasWind = (levels) => levels.filter((l) => l.ffMs != null && l.ddDeg != null).length >= Math.max(3, levels.length * 0.3);

function writeSounding(entry, file) {
  const body = JSON.stringify(file);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 8);
  const d = new Date(Date.parse(entry.launch));
  const path = `${rsSoundingDir(d.getTime())}/${entry.wmo}_${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}_${hash}.json`;
  const old = byId.get(entry.id);
  if (old?.path === path) return;
  if (old?.path && existsSync(local(old.path))) rmSync(local(old.path));
  mkdirSync(dirname(local(path)), { recursive: true });
  writeFileSync(local(path), body);
  byId.set(entry.id, { ...entry, path });
  changed = true;
}

function fileOf(entry, levels, source, wind) {
  return {
    schema: RS_SCHEMA, id: entry.id, wmo: entry.wmo, name: entry.name, lat: entry.lat, lon: entry.lon, elevM: entry.elevM,
    launch: entry.launch, source, wind,
    z: levels.map((l) => Math.round(l.zM)),
    p: levels.map((l) => r1(l.pHpa, 1)),
    t: levels.map((l) => r1(l.tC, 1)),
    td: levels.map((l) => r1(l.tdC, 1)),
    dd: levels.map((l) => (l.ddDeg == null ? null : Math.round(l.ddDeg))),
    ff: levels.map((l) => r1(l.ffMs, 1)),
    lat_: levels.map((l) => r1(l.lat, 4)),
    lon_: levels.map((l) => r1(l.lon, 4)),
    dt: levels.map((l) => (l.dt == null ? null : Math.round(l.dt))),
  };
}

const entryOf = (wmo, launchMs, lat, lon, elevM, levels, extra) => ({
  id: `${wmo}_${rsLaunchStamp(launchMs)}`, wmo, name: rsStationName(wmo), lat: r1(lat, 4), lon: r1(lon, 4), elevM: r1(elevM, 0),
  launch: new Date(launchMs).toISOString(), levels: levels.length,
  topM: Math.round(Math.max(...levels.map((l) => l.zM))), topHpa: r1(Math.min(...levels.map((l) => l.pHpa ?? Infinity)), 1) ?? null,
  ...extra,
});

/** Same ascent = launch within 45 min at the same station — same WMO index, or launch site within 3 km (the GPS track of
 *  a DWD test system carries its own index, e.g. 10741 for the Stuttgart ascents the bulletin reports as 10739). */
const kmApart = (lat1, lon1, lat2, lon2) => Math.hypot((lat2 - lat1) * 111.2, (lon2 - lon1) * 111.2 * Math.cos((lat1 * Math.PI) / 180));
const findAscent = (wmo, launchMs, lat, lon) => [...byId.values()].find((e) => Math.abs(Date.parse(e.launch) - launchMs) <= 45 * 60_000
  && (e.wmo === wmo || kmApart(e.lat, e.lon, lat, lon) <= 3));

/** Wind of a GPS series (ascending z) at height z — linear in u/v, null outside the series. */
function gpsWindAt(series, z) {
  if (!series.length || z < series[0].zM || z > series[series.length - 1].zM) return null;
  let i = 1; while (i < series.length && series[i].zM < z) i++;
  const a = series[i - 1], b = series[Math.min(i, series.length - 1)];
  const t = b.zM === a.zM ? 0 : (z - a.zM) / (b.zM - a.zM);
  const uv = (l) => { const r = (l.ddDeg * Math.PI) / 180; return [-l.ffMs * Math.sin(r), -l.ffMs * Math.cos(r)]; };
  const [ua, va] = uv(a), [ub, vb] = uv(b);
  const u = ua + (ub - ua) * t, v = va + (vb - va) * t;
  return { ffMs: Math.hypot(u, v), ddDeg: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360 };
}

// ── bulletins ──────────────────────────────────────────────────────────────────────────────────────────────────────
const bufrNames = (await listDir('bufr')).filter((n) => /temp_bufr.*\.bin$/.test(n));
let bufrNew = 0, skippedMsgs = 0, ascentsSeen = 0, bufrReplaced = 0;
const skipReasons = {};
for (const name of bufrNames) {
  if (processed.has(name)) continue;
  const buf = await getFile('bufr', name);
  processed.add(name);
  if (!buf) continue;
  bufrNew++;
  const { messages, skipped } = decodeBufrFile(buf);
  skippedMsgs += skipped.length;
  for (const s of skipped) skipReasons[s.reason] = (skipReasons[s.reason] ?? 0) + 1;
  for (const m of messages) for (const sub of m.subsets) {
    const snd = tempSounding(m, sub);
    if (!snd?.wmo || !inBox(snd.lat, snd.lon)) continue;
    const levels0 = bulletinLevels(snd);
    if (levels0.length < 5) continue;
    ascentsSeen++;
    const levels = thin(levels0.map((l) => ({ ...l, lat: l.dLat == null ? null : snd.lat + l.dLat, lon: l.dLon == null ? null : snd.lon + l.dLon })));
    const top = Math.min(...levels.map((l) => l.pHpa));
    const old = findAscent(snd.wmo, snd.launchMs, snd.lat, snd.lon);
    // Better = a bulletin replaces a GPS-only entry; else higher top (> 1 hPa), else more levels at the same top.
    if (old && old.hasTemp) {
      const better = top < (old.topHpa ?? Infinity) - 1 || (Math.abs(top - (old.topHpa ?? Infinity)) <= 1 && levels0.length > (old.rawLevels ?? old.levels));
      if (!better) continue;
    }
    let wind = hasWind(levels) ? 'bufr' : null;
    const source = { bufr: { file: name, centre: m.centre, sequence: snd.sequence } };
    if (!wind && old?.wind === 'gps') {
      const prev = readJson(local(old.path), null);
      const series = prev ? prev.z.map((z, i) => ({ zM: z, ddDeg: prev.dd[i], ffMs: prev.ff[i] })).filter((l) => l.ddDeg != null && l.ffMs != null) : [];
      for (const l of levels) { const w = gpsWindAt(series, l.zM); if (w) { l.ddDeg = w.ddDeg; l.ffMs = w.ffMs; } }
      if (hasWind(levels)) { wind = 'gps'; source.gps = prev.source.gps; }
    }
    const entry = entryOf(snd.wmo, snd.launchMs, snd.lat, snd.lon, snd.elevM, levels,
      { hasTemp: levels.some((l) => l.tC != null), wind, rawLevels: levels0.length });
    if (old && old.id !== entry.id) { if (old.path && existsSync(local(old.path))) rmSync(local(old.path)); byId.delete(old.id); }
    if (old) bufrReplaced++;
    writeSounding(entry, fileOf(entry, levels, source, wind));
  }
}

// ── GPS tracks (DWD ascents) ───────────────────────────────────────────────────────────────────────────────────────
const trajNames = (await listDir('trajectories')).filter((n) => /^Sondenflug_.*\.json$/.test(n));
let trajNew = 0, gpsUsed = 0;
for (const name of trajNames) {
  if (processed.has(name)) continue;
  const buf = await getFile('trajectories', name);
  processed.add(name);
  if (!buf) continue;
  trajNew++;
  let j;
  try { j = JSON.parse(new TextDecoder().decode(buf)); } catch { skipReasons['trajectory json'] = (skipReasons['trajectory json'] ?? 0) + 1; continue; }
  const wmo = String(j.station?.station_id ?? '').padStart(5, '0');
  const g = Array.isArray(j.gps) ? j.gps.filter((p) => Array.isArray(p) && p.length >= 4 && p.every(Number.isFinite)) : [];
  if (!/^\d{5}$/.test(wmo) || g.length < 120) continue;
  // Ascent = up to the first step back in time (the descent restarts the clock at launch) and up to the burst.
  let end = g.length;
  for (let i = 1; i < g.length; i++) if (g[i][3] < g[i - 1][3]) { end = i; break; }
  let top = 0;
  for (let i = 0; i < end; i++) if (g[i][2] > g[top][2]) top = i;
  const asc = g.slice(0, top + 1);
  const launchMs = asc[0][3];
  if (!inBox(asc[0][1], asc[0][0])) continue;
  const old = findAscent(wmo, launchMs, asc[0][1], asc[0][0]);
  if (old?.wind === 'bufr') continue;
  // Centred difference over RS_GPS_WINDOW_S: displacement of the sonde = wind (m/s).
  const half = (RS_GPS_WINDOW_S * 1000) / 2;
  const series = [];
  let a = 0, b = 0;
  for (let i = 0; i < asc.length; i++) {
    const t = asc[i][3];
    while (asc[a][3] < t - half) a++;
    while (b < asc.length - 1 && asc[b][3] < t + half) b++;
    const dt = (asc[b][3] - asc[a][3]) / 1000;
    if (dt < RS_GPS_WINDOW_S * 0.8) continue;
    const latM = ((asc[a][1] + asc[b][1]) / 2) * Math.PI / 180;
    const u = ((asc[b][0] - asc[a][0]) * 111_320 * Math.cos(latM)) / dt;
    const v = ((asc[b][1] - asc[a][1]) * 110_540) / dt;
    series.push({ zM: asc[i][2], pHpa: null, tC: null, tdC: null, ffMs: Math.hypot(u, v), ddDeg: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360, lat: asc[i][1], lon: asc[i][0], dt: (t - launchMs) / 1000 });
  }
  const levels = thin(series.filter((l, i) => i === 0 || l.zM > series[i - 1].zM));
  if (levels.length < 5) continue;
  gpsUsed++;
  if (old?.hasTemp) {
    // Bulletin without wind: wind from the track at the bulletin's heights.
    const prev = readJson(local(old.path), null);
    if (!prev) continue;
    const ls = prev.z.map((z, i) => ({ zM: z, pHpa: prev.p[i], tC: prev.t[i], tdC: prev.td[i], ddDeg: prev.dd[i], ffMs: prev.ff[i], lat: prev.lat_[i], lon: prev.lon_[i], dt: prev.dt[i] }));
    for (const l of ls) { const w = gpsWindAt(levels, l.zM); l.ddDeg = w?.ddDeg ?? null; l.ffMs = w?.ffMs ?? null; }
    if (!hasWind(ls)) continue;
    const entry = { ...old, wind: 'gps' };
    writeSounding(entry, fileOf(entry, ls, { ...prev.source, gps: { file: name } }, 'gps'));
    continue;
  }
  const elev = Number(String(j.station?.heightNN ?? '').replace(',', '.'));
  const entry = entryOf(wmo, launchMs, asc[0][1], asc[0][0], Number.isFinite(elev) ? elev : null, levels, { hasTemp: false, wind: 'gps', rawLevels: levels.length });
  entry.name = RS_STATION_NAMES[wmo] ?? (j.station?.name ? String(j.station.name) : entry.name);
  if (old && old.id !== entry.id) { if (old.path && existsSync(local(old.path))) rmSync(local(old.path)); byId.delete(old.id); }
  writeSounding(entry, fileOf(entry, levels, { gps: { file: name } }, 'gps'));
}

// ── retention, index, state ────────────────────────────────────────────────────────────────────────────────────────
let dropped = 0;
for (const [id, e] of byId) {
  if (Date.parse(e.launch) >= nowMs - RS_RETAIN_H * 3_600_000) continue;
  if (e.path && existsSync(local(e.path))) rmSync(local(e.path));
  byId.delete(id); dropped++; changed = true;
}
const keepFiles = new Set([...byId.values()].map((e) => local(e.path)));
for (const d of existsSync(store) ? readdirSync(store) : []) {
  if (!/^\d{8}$/.test(d)) continue;
  for (const f of readdirSync(join(store, d))) if (!keepFiles.has(join(store, d, f))) { rmSync(join(store, d, f)); changed = true; }
  if (!readdirSync(join(store, d)).length) rmSync(join(store, d), { recursive: true });
}

const listed = new Set([...bufrNames, ...trajNames]);
mkdirSync(store, { recursive: true });
const soundings = [...byId.values()].sort((x, y) => Date.parse(y.launch) - Date.parse(x.launch) || x.wmo.localeCompare(y.wmo));
if (changed || !existsSync(join(store, 'index.json'))) {
  writeFileSync(join(store, 'index.json'), JSON.stringify({ schema: RS_SCHEMA, updatedAt: new Date(nowMs).toISOString(), source: RS_SOURCE_LABEL, retainH: RS_RETAIN_H, soundings }));
}
writeFileSync(join(store, 'state.json'), JSON.stringify({ schema: RS_SCHEMA, processed: [...processed].filter((n) => listed.has(n)).sort() }));

const summary = {
  changed, bufrListed: bufrNames.length, bufrNew, trajListed: trajNames.length, trajNew, ascentsSeen, bufrReplaced, gpsUsed,
  skippedMsgs, skipReasons, dropped, soundings: soundings.length, stations: new Set(soundings.map((s) => s.wmo)).size,
};
console.log(JSON.stringify(summary));
