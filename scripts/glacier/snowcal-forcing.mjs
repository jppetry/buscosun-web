#!/usr/bin/env node
/**
 * Phase GM, GM-3 — forcing of the snow calibration for the glacier-winters of `snowcal-truth.mjs`:
 *
 *   node scripts/glacier/snowcal-forcing.mjs --truth=<gy.json> --cache=<dir> [--from=2011-09-01 --to=2025-06-01]
 *
 *   temperature   hourly, measured, from the nearest station within 30 km and |Δh| ≤ 1 800 m of the glacier's median elevation with ≥ 90 % of the winter hours
 *                 (the station rule of Gate C): SwissMetNet `tre200h0` (MeteoSwiss OGD, CC BY 4.0) in Switzerland, `klima-v2-1h` `tl` (GeoSphere Austria, CC BY 4.0) in Austria
 *   precipitation Austria: INCA analysis, hourly, nearest 1 km cell (`inca-v1-1h-1km` `RR`, GeoSphere Austria, CC BY 4.0) — the dataset that holds the past winters;
 *                 Switzerland: RhiresD daily grid, read by `py/snowcal_grid.py` (this script does not touch it)
 *
 * Output in <cache>: `stations.json` (assignment per glacier), `temp-<station>.json`, `inca-<glacier key>.json`. Index i of every hourly array = the hour that ENDS at
 * fromMs + (i + 1) h (UTC), as in `c-forcing.mjs`. Raw downloads are kept next to them and reused.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
export const SMN_BASE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn';
export const GEOSPHERE = 'https://dataset.api.hub.geosphere.at/v1';
export const STATION_RULE = Object.freeze({ km: 30, dh: 1800, cover: 0.9 });

export const hav = (lon1, lat1, lon2, lat2) => { const r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2; return 2 * r * Math.asin(Math.sqrt(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getText(url, { enc = 'utf8', tries = 4 } = {}) {
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return new TextDecoder(enc).decode(await r.arrayBuffer());
    } catch (e) { if (k + 1 >= tries) throw e; await sleep(2000 * (k + 1)); }
  }
}

// --- SwissMetNet ---------------------------------------------------------------------------------------------------------------
export async function smnStations(cache) {
  const p = join(cache, 'smn', 'ogd-smn_meta_stations.csv');
  mkdirSync(join(cache, 'smn'), { recursive: true });
  if (!existsSync(p)) writeFileSync(p, await getText(`${SMN_BASE}/ogd-smn_meta_stations.csv`, { enc: 'latin1' }), 'latin1');
  const rows = readFileSync(p, 'latin1').split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
  const h = Object.fromEntries(rows[0].map((c, i) => [c, i]));
  return rows.slice(1).map((r) => ({ id: r[h.station_abbr], name: r[h.station_name], lat: Number(r[h.station_coordinates_wgs84_lat]), lon: Number(r[h.station_coordinates_wgs84_lon]), height: Number(r[h.station_height_masl]) })).filter((s) => s.id && Number.isFinite(s.lat));
}
/** Hourly SwissMetNet columns of one station on the hour grid (`cols`: { name: column }), from the decade files 2010-2019 and 2020-2029. */
export async function smnHourly(cache, abbr, cols, fromMs, toMs) {
  const n = Math.round((toMs - fromMs) / 3_600_000);
  const out = Object.fromEntries(Object.keys(cols).map((k) => [k, new Array(n).fill(null)]));
  for (const dec of ['2010-2019', '2020-2029']) {
    const p = join(cache, 'smn', `raw-${abbr}-${dec}.csv`);
    if (!existsSync(p)) { const t = await getText(`${SMN_BASE}/${abbr.toLowerCase()}/ogd-smn_${abbr.toLowerCase()}_h_historical_${dec}.csv`, { enc: 'latin1' }); writeFileSync(p, t ?? '', 'latin1'); }
    const text = readFileSync(p, 'latin1');
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    const head = lines[0].split(';'), col = Object.fromEntries(head.map((c, i) => [c, i]));
    const tsI = col.reference_timestamp;
    for (let li = 1; li < lines.length; li++) {
      const l = lines[li]; if (!l) continue;
      const c = l.split(';'), ts = c[tsI];
      // dd.mm.yyyy HH:MM, UTC, the END of the hour
      const ms = Date.UTC(+ts.slice(6, 10), +ts.slice(3, 5) - 1, +ts.slice(0, 2), +ts.slice(11, 13), +ts.slice(14, 16));
      const i = Math.round((ms - fromMs) / 3_600_000) - 1;
      if (i < 0 || i >= n) continue;
      for (const [k, name] of Object.entries(cols)) { const v = c[col[name]]; if (v !== '' && v != null) out[k][i] = Number(v); }
    }
  }
  return out;
}

// --- GeoSphere Austria -----------------------------------------------------------------------------------------------------------
export async function klimaStations(cache, res = '1h') {
  const p = join(cache, 'geosphere', `klima-v2-${res}-metadata.json`);
  mkdirSync(join(cache, 'geosphere'), { recursive: true });
  if (!existsSync(p)) writeFileSync(p, await getText(`${GEOSPHERE}/station/historical/klima-v2-${res}/metadata`));
  return JSON.parse(readFileSync(p, 'utf8')).stations.map((s) => ({ id: String(s.id), name: s.name, lat: Number(s.lat), lon: Number(s.lon), height: Number(s.altitude), from: s.valid_from, to: s.valid_to }));
}
/** Hourly `klima-v2-1h` parameters of one station on the hour grid, fetched year by year (the API caps a request at one million values). */
export async function klimaHourly(cache, id, params, fromMs, toMs) {
  const n = Math.round((toMs - fromMs) / 3_600_000);
  const out = Object.fromEntries(params.map((k) => [k, new Array(n).fill(null)]));
  for (let y = new Date(fromMs).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) {
    const p = join(cache, 'geosphere', `raw-1h-${id}-${params.join('+')}-${y}.json`);
    if (!existsSync(p)) {
      const t = await getText(`${GEOSPHERE}/station/historical/klima-v2-1h?parameters=${params.join(',')}&start=${y}-01-01T00:00&end=${y}-12-31T23:00&station_ids=${id}&output_format=geojson`);
      writeFileSync(p, t ?? '{}');
      await sleep(300);
    }
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const f = j.features?.[0]; if (!f) continue;
    j.timestamps.forEach((ts, k) => {
      const i = Math.round((Date.parse(ts) - fromMs) / 3_600_000) - 1;
      if (i < 0 || i >= n) return;
      for (const name of params) { const v = f.properties.parameters[name]?.data?.[k]; if (v != null) out[name][i] = v; }
    });
  }
  return out;
}
/** INCA hourly precipitation at the nearest 1 km cell, fetched in twelve-month pieces. Returns the array and the cell the API answered with. */
export async function incaHourly(cache, key, lat, lon, fromMs, toMs) {
  const n = Math.round((toMs - fromMs) / 3_600_000);
  const p = new Array(n).fill(null);
  let cell = null;
  mkdirSync(join(cache, 'inca'), { recursive: true });
  for (let y = new Date(fromMs).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) {
    const file = join(cache, 'inca', `raw-${key}-${y}.json`);
    if (!existsSync(file)) {
      const t = await getText(`${GEOSPHERE}/timeseries/historical/inca-v1-1h-1km?parameters=RR&start=${y}-01-01T00:00&end=${y}-12-31T23:00&lat_lon=${lat},${lon}&output_format=geojson`);
      writeFileSync(file, t ?? '{}');
      await sleep(300);
    }
    const j = JSON.parse(readFileSync(file, 'utf8'));
    const f = j.features?.[0]; if (!f) continue;
    cell = f.geometry?.coordinates ?? cell;
    j.timestamps.forEach((ts, k) => {
      const i = Math.round((Date.parse(ts) - fromMs) / 3_600_000) - 1;
      const v = f.properties.parameters.RR.data[k];
      if (i >= 0 && i < n && v != null) p[i] = v;
    });
  }
  return { p, cell };
}

// --- main --------------------------------------------------------------------------------------------------------------------------
async function main() {
  const cache = arg('cache'), truth = JSON.parse(readFileSync(arg('truth'), 'utf8'));
  const fromMs = Date.parse(arg('from', '2011-09-01') + 'T00:00:00Z'), toMs = Date.parse(arg('to', '2025-06-01') + 'T00:00:00Z');
  const n = Math.round((toMs - fromMs) / 3_600_000);
  const idx = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - fromMs) / 3_600_000);
  const glaciers = new Map();
  for (const o of truth.gy) {
    const g = glaciers.get(o.key) ?? { key: o.key, name: o.name, country: o.country, lat: o.lat, lon: o.lon, zMeds: [], winters: [] };
    g.zMeds.push(o.zMed); g.winters.push([idx(o.t0), idx(o.t1)]); glaciers.set(o.key, g);
  }
  const smn = await smnStations(cache), klima = (await klimaStations(cache)).filter((s) => !s.to || s.to > '2012');
  const tempCache = new Map();
  const assign = {};
  for (const g of glaciers.values()) {
    const z = [...g.zMeds].sort((a, b) => a - b)[Math.floor(g.zMeds.length / 2)];
    const hours = g.winters.reduce((s, [a, b]) => s + (b - a), 0);
    const cand = (g.country === 'CH' ? smn : klima).filter((s) => Math.abs(z - s.height) <= STATION_RULE.dh).map((s) => ({ s, km: hav(g.lon, g.lat, s.lon, s.lat) })).filter((x) => x.km <= STATION_RULE.km).sort((a, b) => a.km - b.km);
    let pick = null;
    for (const { s, km } of cand) {
      const id = `${g.country}-${s.id}`;
      if (!tempCache.has(id)) {
        const t = g.country === 'CH' ? (await smnHourly(cache, s.id, { t: 'tre200h0' }, fromMs, toMs)).t : (await klimaHourly(cache, s.id, ['tl'], fromMs, toMs)).tl;
        tempCache.set(id, t);
      }
      const t = tempCache.get(id);
      let ok = 0; for (const [a, b] of g.winters) for (let i = Math.max(0, a); i < Math.min(n, b); i++) if (t[i] != null) ok++;
      if (ok / hours >= STATION_RULE.cover) { pick = { id, station: s.id, name: s.name, height: s.height, km: Math.round(km * 10) / 10, dh: Math.round(z - s.height), cover: Math.round((ok / hours) * 1000) / 1000 }; break; }
    }
    assign[g.key] = { name: g.name, country: g.country, zMed: z, temp: pick, tried: cand.length };
    if (pick) writeFileSync(join(cache, `temp-${pick.id}.json`), JSON.stringify({ id: pick.id, name: pick.name, height: pick.height, fromMs, hours: n, t: tempCache.get(pick.id) }));
    if (g.country === 'AT') {
      const { p, cell } = await incaHourly(cache, g.key, g.lat, g.lon, fromMs, toMs);
      let ok = 0; for (const [a, b] of g.winters) for (let i = Math.max(0, a); i < Math.min(n, b); i++) if (p[i] != null) ok++;
      assign[g.key].precip = { source: 'inca-v1-1h-1km', cell, km: cell ? Math.round(hav(g.lon, g.lat, cell[0], cell[1]) * 100) / 100 : null, cover: Math.round((ok / hours) * 1000) / 1000 };
      writeFileSync(join(cache, `inca-${g.key}.json`), JSON.stringify({ key: g.key, name: g.name, fromMs, hours: n, cell, p }));
    }
    console.log(`${g.country} ${g.name.padEnd(44)} z ${z}  T ← ${pick ? `${pick.name} (${pick.height} m, ${pick.km} km, Δh ${pick.dh} m, ${Math.round(pick.cover * 100)} %)` : `keine Station (${cand.length} geprüft)`}${assign[g.key].precip ? `  P ← INCA ${assign[g.key].precip.km} km, ${Math.round(assign[g.key].precip.cover * 100)} %` : ''}`);
  }
  writeFileSync(join(cache, 'stations.json'), JSON.stringify({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), rule: STATION_RULE, licences: ['MeteoSwiss OGD SwissMetNet, CC BY 4.0, Quelle: MeteoSchweiz', 'GeoSphere Austria Data Hub (klima-v2-1h, inca-v1-1h-1km), CC BY 4.0'], assign }, null, 1));
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
