#!/usr/bin/env node
/**
 * GM-11 phase 1d part B — yearly component of the precipitation factor (measurement only). Step b0 = diagnosis (inventory and pairing counts, no score).
 * Nothing under scripts/glacier/** or src/**. Measured values per series and winter stay in the cache (--out); the report carries counts only.
 *
 *   node audit/gletscher-schneemodell/gm11-yearly.mjs --step=b0 --cache=C:\dev\buscosun-glacier-cache --out=<dir> [--public=<json>]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const CACHE = args.cache, OUT = args.out; mkdirSync(OUT, { recursive: true });
const D = 86_400_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hav = (lat1, lon1, lat2, lon2) => { const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * Math.PI) / 360) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(a)); };
const mem = (l) => { const g = os.freemem() / 2 ** 30; console.error(`[mem] ${l}: ${g.toFixed(2)} GB`); if (g < 3) throw new Error('STOPP: unter 3 GB frei'); return Math.round(g * 100) / 100; };
const WINTERS = Array.from({ length: 15 }, (_, i) => 2012 + i);   // 2011/12 … 2025/26
const DATES = [[1, 1], [2, 1], [3, 1], [4, 1]];                       // evaluation dates (month, day)

mem('start');
// ---- glaciers: the CH calibration glaciers with a winter balance 2012–2026 ----
const gy = [...J(join(CACHE, 'gm3/truth/gy.json')).gy, ...J(join(CACHE, 'gm11/w26/gy-2526.json')).gy].filter((o) => o.country === 'CH' && o.year >= 2012 && o.year <= 2026);
const glaciers = new Map();
for (const o of gy) { const g = glaciers.get(o.key) ?? { key: o.key, name: o.name, lat: o.lat, lon: o.lon, zMed: o.zMed, zMin: Math.min(...o.bins.map((b) => b.z0)), zMax: Math.max(...o.bins.map((b) => b.z1)), years: new Set() }; g.years.add(o.year); glaciers.set(o.key, g); }

// ---- series 1: SLF study plots (HS, HN daily, manual) ----
const plotDay = new Map();
for (const line of readFileSync(join(CACHE, 'gm3/slf/all-stations.csv'), 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('station_code')) continue;
  const [code, ts, , HS, HN] = line.split(',');
  const ms = Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10));
  if (!plotDay.has(code)) plotDay.set(code, new Map());
  plotDay.get(code).set(ms, { HS: HS === '' ? null : +HS, HN: HN === '' ? null : +HN });
}
const plotMeta = new Map();
for (const line of readFileSync(join(CACHE, 'gm3/slf/stations.csv'), 'utf8').split(/\r?\n/).slice(1)) { if (!line) continue; const x = line.split(','); plotMeta.set(x[1], { lon: +x[4], lat: +x[5], z: +x[6], label: x[2] }); }
let lastDay = 0; for (const m of plotDay.values()) for (const k of m.keys()) if (k > lastDay) lastDay = k;
/** A winter counts for a series when the quantity is present on ≥ 90 % of the days 1 Oct – 1 Apr. */
function plotWinters(code) {
  const d = plotDay.get(code), out = [];
  for (const Y of WINTERS) { let n = 0, ok = 0; for (let ms = Date.UTC(Y - 1, 9, 1); ms <= Date.UTC(Y, 3, 1); ms += D) { n++; if (d.get(ms)?.HN != null) ok++; } if (ok / n >= 0.9) out.push(Y); }
  return out;
}
mem('Messfelder');
// ---- series 2: SwissMetNet snow depth (htoauths, automatic) and gauge (rre150h0) in the cache ----
const smnMetaLines = readFileSync(join(CACHE, 'gm11/w26/smn/ogd-smn_meta_stations.csv'), 'latin1').split(/\r?\n/), sh = smnMetaLines[0].split(';'), sc = Object.fromEntries(sh.map((x, i) => [x, i]));
const smnMeta = new Map(); for (const l of smnMetaLines.slice(1)) { if (!l) continue; const x = l.split(';'); smnMeta.set(x[sc.station_abbr], { lat: +x[sc.station_coordinates_wgs84_lat], lon: +x[sc.station_coordinates_wgs84_lon], z: +x[sc.station_height_masl], label: x[sc.station_name] }); }
const smnAbbr = [...new Set(['gm3/smn', 'gm11/w26/smn'].flatMap((d) => (existsSync(join(CACHE, d)) ? readdirSync(join(CACHE, d)) : []).filter((f) => /^raw-[A-Z0-9]{3}-/.test(f)).map((f) => f.slice(4, 7))))];
function smnWinters(abbr) {
  const hs = new Map(), rr = new Map();
  for (const dir of ['gm3/smn', 'gm11/w26/smn']) for (const f of [`raw-${abbr}-2010-2019.csv`, `raw-${abbr}-2020-2029.csv`]) {
    const p = join(CACHE, dir, f); if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'latin1').split(/\r?\n/), head = lines[0].split(';'), c = Object.fromEntries(head.map((x, i) => [x, i]));
    for (let i = 1; i < lines.length; i++) { const x = lines[i].split(';'); if (x.length < 3) continue; const ts = x[c.reference_timestamp]; const day = Date.UTC(+ts.slice(6, 10), +ts.slice(3, 5) - 1, +ts.slice(0, 2));
      if (x[c.htoauths] !== '' && x[c.htoauths] != null) hs.set(day, 1); if (x[c.rre150h0] !== '' && x[c.rre150h0] != null) rr.set(day, (rr.get(day) ?? 0) + 1); }
  }
  const W = (has) => WINTERS.filter((Y) => { let n = 0, ok = 0; for (let ms = Date.UTC(Y - 1, 9, 1); ms <= Date.UTC(Y, 3, 1); ms += D) { n++; if (has(ms)) ok++; } return ok / n >= 0.9; });
  return { hs: W((ms) => hs.has(ms)), rr: W((ms) => (rr.get(ms) ?? 0) >= 22) };
}
const series = [];
for (const [code] of plotDay) { const m = plotMeta.get(code); if (!m) continue; series.push({ kind: 'slf-plot', id: code, ...m, winters: plotWinters(code) }); }
for (const a of smnAbbr) { const m = smnMeta.get(a); if (!m) continue; const w = smnWinters(a); series.push({ kind: 'smn-hs', id: a, ...m, winters: w.hs, gaugeWinters: w.rr }); }
mem('SwissMetNet');
// ---- series 3: SLF OSHD grid (Q20), water years in the cache ----
const q20 = existsSync(join(CACHE, 'gm10/q20')) ? readdirSync(join(CACHE, 'gm10/q20')).filter((f) => /^OSHD_DATA_WY\d{4}\.zip$/.test(f)).map((f) => +f.slice(12, 16)) : [];
const rhiresYears = readdirSync(join(CACHE, 'gm3/rhiresd')).filter((f) => /^rhiresd_\d{4}\.nc$/.test(f)).map((f) => +f.slice(8, 12));

// ---- pairing counts on a grid of rules ----
const MIN_W = 8;   // a series needs ≥ 8 of the 15 winters (proposal)
const usable = series.filter((s) => s.winters.length >= MIN_W);
const grid = [];
for (const km of [10, 20, 30, 50]) for (const dz of [300, 500, 800, 1200]) {
  let withOne = 0, withThree = 0, pairs = 0; const per = [];
  for (const g of glaciers.values()) {
    const near = usable.filter((s) => hav(g.lat, g.lon, s.lat, s.lon) <= km && s.z >= g.zMed - dz);   // dz: series not more than dz BELOW the glacier median
    if (near.length) withOne++; if (near.length >= 3) withThree++; pairs += near.length; per.push(near.length);
  }
  grid.push({ km, dzBelowMedian: dz, glaciersWithOne: withOne, glaciersWithThree: withThree, pairs });
}
const zOf = (k) => usable.filter((s) => s.kind === k).map((s) => s.z).sort((a, b) => a - b);
const report = {
  kind: 'gm11/yearly/b0', generated: new Date().toISOString(),
  glaciers: { n: glaciers.size, zMedRange: [Math.min(...[...glaciers.values()].map((g) => g.zMed)), Math.max(...[...glaciers.values()].map((g) => g.zMed))], winters: WINTERS.length },
  series: {
    slfPlots: { inFile: series.filter((s) => s.kind === 'slf-plot').length, usable: usable.filter((s) => s.kind === 'slf-plot').length, zP10P50P90: (() => { const z = zOf('slf-plot'); return [z[Math.floor(z.length * 0.1)], z[z.length >> 1], z[Math.floor(z.length * 0.9)]]; })(), lastDay: new Date(lastDay).toISOString().slice(0, 10), quantity: 'HN (Neuschnee von Hand, cm) und HS; HNW nur an einem Teil der Tage (§3q.7)' },
    smnSnowDepth: { inCache: series.filter((s) => s.kind === 'smn-hs').length, usable: usable.filter((s) => s.kind === 'smn-hs').length, zP10P50P90: (() => { const z = zOf('smn-hs'); return z.length ? [z[Math.floor(z.length * 0.1)], z[z.length >> 1], z[Math.floor(z.length * 0.9)]] : null; })(), quantity: 'htoauths (Schneehöhe automatisch, cm); Neuschnee nur als Zuwachs ableitbar' },
    imis: 'nicht im Speicher: IMIS steht in §4 nur live (Q2); eine historische Reihe 2011–2026 wäre ein neuer Abruf',
    oshdGrid: { waterYears: q20, note: 'SLF OSHD (Q20, v1.1): tägliche Felder hs, swe, scf, smro; 10 Winter 2015/16–2024/25; 2011/12–2014/15 und 2025/26 fehlen; eine Analyse mit eigener Niederschlagskorrektur, keine Messung' },
    rhiresGrids: rhiresYears,
  },
  minWinters: MIN_W, pairingGrid: grid,
  mem: mem('Ende'),
};
writeFileSync(join(OUT, 'b0-series.json'), JSON.stringify(series, null, 1));
writeFileSync(join(OUT, 'b0.json'), JSON.stringify(report, null, 1));
if (args.public) writeFileSync(args.public, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
