#!/usr/bin/env node
/**
 * GL-3 / Gate C — forcing of the calibration: hourly SwissMetNet values (MeteoSwiss OGD, CC BY 4.0, "Source: MeteoSwiss": 2 m temperature `tre200h0`,
 * precipitation `rre150h0`, global radiation `gre000h0`) of the station that serves each glacier of the GLAMOS comparison set.
 *
 *   node scripts/glacier/c-forcing.mjs --truth=<b1/truth.json> --data=<v1 dir> --out=<gate-c dir> [--from=2022-10-01 --to=2025-10-01]
 *
 * Station rule (claims-frozen.md, LGO), two roles: temperature + global radiation from the nearest SwissMetNet station within 30 km and |Δh| ≤ 1 800 m to the glacier's median elevation,
 * precipitation from the nearest one that measures it under the same limits. Output: `stations.json` (id, name, position, height, glaciers served), `forcing-<abbr>.json` (hourly arrays from `from`, ts = end of hour).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const truthPath = arg('truth'), dataDir = arg('data'), outDir = arg('out');
const FROM = Date.parse(arg('from', '2022-10-01') + 'T00:00:00Z'), TO = Date.parse(arg('to', '2025-10-01') + 'T00:00:00Z');
const BASE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn';
mkdirSync(outDir, { recursive: true });
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const index = J(join(dataDir, 'index.json'));
const cat = J(join(dataDir, 'static', index.static.build, 'catalog.json')).glaciers;
const byId = new Map(cat.map((g) => [g.id, g]));
const truth = J(truthPath);

const hav = (lon1, lat1, lon2, lat2) => { const r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2; return 2 * r * Math.asin(Math.sqrt(a)); };
const getText = async (url, opt = {}) => { const r = await fetch(url, opt); if (!r.ok) throw new Error(`${r.status} ${url}`); return new TextDecoder('latin1').decode(await r.arrayBuffer()); };

// station master
const metaText = await getText(`${BASE}/ogd-smn_meta_stations.csv`);
const rows = metaText.split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
const h = Object.fromEntries(rows[0].map((c, i) => [c, i]));
const stations = rows.slice(1).map((r) => ({ abbr: r[h.station_abbr], name: r[h.station_name], lat: Number(r[h.station_coordinates_wgs84_lat]), lon: Number(r[h.station_coordinates_wgs84_lon]), height: Number(r[h.station_height_masl]), since: r[h.station_data_since] })).filter((s) => s.abbr && Number.isFinite(s.lat));
console.log('SwissMetNet stations in the master:', stations.length);

// hourly files per station (historical decade + recent), cached on disk
async function hourly(abbr) {
  const cache = join(outDir, `raw-${abbr}.csv`);
  if (existsSync(cache)) return readFileSync(cache, 'latin1');
  const parts = [];
  for (const f of ['historical_2020-2029', 'recent']) {
    try { parts.push(await getText(`${BASE}/${abbr.toLowerCase()}/ogd-smn_${abbr.toLowerCase()}_h_${f}.csv`)); } catch (e) { console.log(`  ${abbr} ${f}: ${e.message}`); }
  }
  const text = parts.join('\n');
  writeFileSync(cache, text, 'latin1');
  return text;
}
const parse = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('station_abbr'));
  const head = text.split(/\r?\n/).find((l) => l.startsWith('station_abbr'))?.split(';') ?? [];
  const col = Object.fromEntries(head.map((c, i) => [c, i]));
  const n = Math.round((TO - FROM) / 3_600_000);
  const arr = { t: new Array(n).fill(null), p: new Array(n).fill(null), g: new Array(n).fill(null), rh: new Array(n).fill(null) };
  for (const l of lines) {
    const c = l.split(';');
    const m = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d)$/.exec(c[col.reference_timestamp] ?? '');
    if (!m) continue;
    const ms = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    const i = Math.round((ms - FROM) / 3_600_000) - 1;       // timestamp = end of the hour ⇒ hour index of the hour that ends there
    if (i < 0 || i >= n) continue;
    const num = (k) => { const v = c[col[k]]; return v === '' || v == null ? null : Number(v); };
    arr.t[i] = num('tre200h0'); arr.p[i] = num('rre150h0'); arr.g[i] = num('gre000h0'); arr.rh[i] = num('ure200h0');
  }
  return arr;
};

// pick stations for the glaciers of the comparison set: two roles — temperature + global radiation (`tg`) and precipitation (`p`) — because the high
// stations (Jungfraujoch, Gornergrat, Corvatsch …) do not measure precipitation and the precipitation stations sit in the valleys.
const need = [...new Set([...Object.keys(truth.glamos)])];
const serve = new Map();     // abbr → { station, arr, glaciers: [] }
const assign = {};
const cover = (arr, k) => arr[k].filter((v) => v != null).length / arr[k].length;
async function pick(g, ok) {
  const cand = stations.filter((s) => Math.abs(g.z[1] - s.height) <= 1800).map((s) => ({ s, d: hav(g.lon, g.lat, s.lon, s.lat) })).filter((x) => x.d <= 30).sort((a, b) => a.d - b.d);
  for (const { s, d } of cand) {
    const arr = parse(await hourly(s.abbr));
    if (ok(arr)) return { s, d, arr, cov: { t: cover(arr, 't'), p: cover(arr, 'p'), g: cover(arr, 'g') } };
  }
  return null;
}
for (const id of need) {
  const g = byId.get(id);
  if (!g) continue;
  const tg = await pick(g, (a) => cover(a, 't') > 0.9 && cover(a, 'g') > 0.8);
  const pp = await pick(g, (a) => cover(a, 'p') > 0.8);
  if (!tg || !pp) { assign[id] = null; console.log(`${g.name ?? id}: no station (tg ${tg?.s.abbr ?? '–'}, p ${pp?.s.abbr ?? '–'}) within 30 km / 1800 m`); continue; }
  assign[id] = { tg: { abbr: tg.s.abbr, km: Math.round(tg.d * 10) / 10, dh: Math.round(g.z[1] - tg.s.height), cov: tg.cov }, p: { abbr: pp.s.abbr, km: Math.round(pp.d * 10) / 10, dh: Math.round(g.z[1] - pp.s.height), cov: pp.cov } };
  for (const r of [tg, pp]) { if (!serve.has(r.s.abbr)) serve.set(r.s.abbr, { station: r.s, arr: r.arr, glaciers: [] }); serve.get(r.s.abbr).glaciers.push(id); }
  console.log(`${(g.name ?? id).padEnd(30)} T/G ← ${tg.s.abbr} ${tg.d.toFixed(1)} km Δh ${Math.round(g.z[1] - tg.s.height)} m · P ← ${pp.s.abbr} ${pp.d.toFixed(1)} km Δh ${Math.round(g.z[1] - pp.s.height)} m`);
}
for (const [abbr, v] of serve) writeFileSync(join(outDir, `forcing-${abbr}.json`), JSON.stringify({ abbr, name: v.station.name, lat: v.station.lat, lon: v.station.lon, height: v.station.height, fromMs: FROM, hours: v.arr.t.length, tsMeaning: 'index i = hour ending at fromMs + (i + 1) h (UTC)', ...v.arr }));
writeFileSync(join(outDir, 'stations.json'), JSON.stringify({ from: new Date(FROM).toISOString(), to: new Date(TO).toISOString(), licence: 'MeteoSwiss OGD SwissMetNet, CC BY 4.0, Quelle: MeteoSchweiz', assign, stations: [...serve.entries()].map(([abbr, v]) => ({ abbr, name: v.station.name, lat: v.station.lat, lon: v.station.lon, height: v.station.height, glaciers: v.glaciers })) }, null, 1));
console.log('stations used:', [...serve.keys()].join(' '), '| glaciers assigned:', Object.values(assign).filter(Boolean).length, 'of', need.length);
