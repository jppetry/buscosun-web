#!/usr/bin/env node
/**
 * V-SW-14 diagnosis — what the reader option `clampSeaFloor` moves, on real Terrarium tiles:
 *   - the 10 archive stations with a negative DEM pixel (feature table `points.v1.json`, `demM < 0`),
 *   - the 56 Seewetter spots at their CWAM water cell (the points `spot-geo.json` is built for),
 *   - per point: elevationM, tpi500M, tpi2000M, slopeDeg, svf, sinkDepthM with the option off and on, the learned
 *     design columns that read them (`features.ts` `buildZ`: tpi500 = /100, tpi2000 = /100, sink = /100, slope = /10, svf),
 *     and whether the night cold-pool gate (`sinkDepthM > 5`, `meteo.ts`) flips.
 *   - `--head=<copy of HEAD terrain.ts next to the reader>`: also checks option-off = the HEAD reader, value for value.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/diag-sea-floor.mjs
 *     [--features=C:\dev\buscosun-hindcast\features\points.v1.json] [--head=src/point/client/<tmp>.ts] [--json=<out>]
 * Network: Terrarium tiles (S3), read only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, toRgba } from '../lib/png.mjs';
import { loadTerrainAtPoint } from '../../src/point/client/terrain.ts';
import { seaCellCentre } from '../../src/sea/seaContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const decodeRgba = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };
const tiles = new Map();
const cache = { get: async (k) => tiles.get(k) ?? null, put: async (k, e) => { if (!String(k).startsWith('terrain/')) tiles.set(k, e); } };
const opts = { decodeRgba, cache, noResultCache: true, timeoutMs: 20_000 };
const headMod = typeof args.head === 'string' ? await import(pathToFileURL(resolve(ROOT, args.head)).href) : null;

const feat = JSON.parse(readFileSync(String(args.features ?? 'C:/dev/buscosun-hindcast/features/points.v1.json'), 'utf8'));
const stations = Object.values(feat.byPoint).filter((p) => p.demM != null && p.demM < 0).map((p) => ({ kind: 'station', id: p.id, name: p.name, lat: p.lat, lon: p.lon, table: p.terrain }));
const cat = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/sea/static/spots.json'), 'utf8')).spots;
const spots = cat.map((s) => ({ kind: 'spot', id: s.id, name: s.name, ...seaCellCentre('cwam', s.cell.i, s.cell.j) }));

const pick = (r) => ({ h: r.elevationM, read: r.elevationReadM ?? null, tpi500: r.tpi500M, tpi2000: r.tpi2000M, slope: r.slopeDeg, svf: r.svf, sink: r.sinkDepthM, scales: JSON.stringify(r.scales) });
const strip = (r) => { const { timing: _t, fromCache: _f, tiles: _s, ...rest } = r; void _t; void _f; void _s; return JSON.stringify(rest); };
const rows = [];
let headSame = 0, headN = 0;
for (const p of [...stations, ...spots]) {
  const off = await loadTerrainAtPoint(p.lat, p.lon, opts);
  const on = await loadTerrainAtPoint(p.lat, p.lon, { ...opts, clampSeaFloor: true });
  if (headMod) { headN++; if (strip(await headMod.loadTerrainAtPoint(p.lat, p.lon, opts)) === strip(off)) headSame++; }
  const a = pick(off), b = pick(on);
  rows.push({
    kind: p.kind, id: p.id, name: p.name, off: { ...a, scales: undefined }, on: { ...b, scales: undefined },
    scalesSame: a.scales === b.scales,
    dZ: { tpi500: +((b.tpi500 - a.tpi500) / 100).toFixed(3), tpi2000: +((b.tpi2000 - a.tpi2000) / 100).toFixed(3), sink: +((b.sink - a.sink) / 100).toFixed(3), slope: +((b.slope - a.slope) / 10).toFixed(3), svf: +(b.svf - a.svf).toFixed(3) },
    gateFlip: (a.sink > 5) !== (b.sink > 5),
    tableSink: p.table?.sinkDepthM ?? null,
  });
}
const pad = (x, n) => String(x ?? '–').padStart(n);
console.log('Art     id                     h_read | tpi500 aus→an | tpi2000 aus→an | Hang aus→an | svf aus→an   | Senke aus→an | Senke>5 kippt | scales gleich');
for (const r of rows) console.log(`${r.kind.padEnd(7)} ${String(r.id).padEnd(22)} ${pad(r.off.read ?? r.off.h, 6)} | ${pad(r.off.tpi500, 6)}→${pad(r.on.tpi500, 6)} | ${pad(r.off.tpi2000, 6)}→${pad(r.on.tpi2000, 6)} | ${pad(r.off.slope, 4)}→${pad(r.on.slope, 4)} | ${pad(r.off.svf, 5)}→${pad(r.on.svf, 5)} | ${pad(r.off.sink, 5)}→${pad(r.on.sink, 5)} | ${r.gateFlip ? 'JA' : '–'} | ${r.scalesSame ? 'ja' : 'NEIN'}`);
const sum = (kind) => {
  const rs = rows.filter((r) => r.kind === kind);
  const maxAbs = (k) => Math.max(...rs.map((r) => Math.abs(r.dZ[k])));
  return { n: rs.length, changed: rs.filter((r) => Object.values(r.dZ).some((x) => x !== 0)).length, gateFlips: rs.filter((r) => r.gateFlip).length, scalesSame: rs.filter((r) => r.scalesSame).length,
    maxAbsZ: { tpi500: maxAbs('tpi500'), tpi2000: maxAbs('tpi2000'), sink: maxAbs('sink'), slope: maxAbs('slope'), svf: maxAbs('svf') } };
};
const summary = { stations: sum('station'), spots: sum('spot'), head: headMod ? `${headSame}/${headN} gleich HEAD (Option aus)` : 'nicht geprüft' };
console.log(JSON.stringify(summary, null, 1));
if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify({ summary, rows }, null, 1) + '\n');
