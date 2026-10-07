#!/usr/bin/env node
// SW-0 spike: decode DWD wave-model GRIB2 in Node with the client decoder (src/sources/gribDecode.ts).
//
// Downloads (sequentially, cached) the 13 parameters of one run at the given steps and reports grid, scan mode,
// sea-point count (bitmap), the wind floor of sp_10m, the tm10 placeholder, the ppww artefact, and the values at
// the eleven mockup spots (best sea point within ±2 grid points of the datenpruefung's i/j).
//
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/decode-cwam.mjs
//          [--model=cwam] [--run=2026100700] [--steps=0,24,78] [--cache=<dir>] [--json=<out.json>]

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../../lib/bz2.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const MODEL = String(args.model ?? 'cwam');
const RUN = String(args.run ?? '2026100700');
const STEPS = String(args.steps ?? '0,24,78').split(',').map(Number);
const CACHE = resolve(String(args.cache ?? process.env.SEA_CACHE ?? '.sea-cache'));
export const PARAMS = ['swh', 'mwd', 'tm10', 'shww', 'mdww', 'mpww', 'ppww', 'shts', 'mdts', 'mpts', 'ppts', 'sp_10m', 'dd_10m'];

export function gribUrl(model, run, param, step) {
  const hh = run.slice(8, 10);
  return `https://opendata.dwd.de/weather/maritime/wave_models/${model}/grib/${hh}/${param}/${model.toUpperCase()}_${param.toUpperCase()}_${run}_${String(step).padStart(3, '0')}.grib2.bz2`;
}

export async function fetchCached(url, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, url.split('/').pop());
  if (existsSync(file)) return readFileSync(file);
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

// Mockup spots, datenpruefung §5 (i = column from Lo1, j = row from La1).
const SPOTS = [
  ['St. Peter-Ording', 176, 258, { hs: [0.4, 2.2, 1.8], tm34: 6.0, ws34: 2.2, sw34: 0.1, dir34: 304 }],
  ['Westerland (Sylt)', 153, 184, { hs: [0.7, 3.2, 2.0], tm34: 6.4, ws34: 3.2, sw34: 0.0, dir34: 326 }],
  ['Helgoland', 124, 272, { hs: [0.7, 3.6, 2.3], tm34: 7.2, ws34: 3.5, sw34: 0.2, dir34: 315 }],
  ['Büsum', 192, 278, { hs: [0.1, 1.0, 0.9], tm34: 3.6, ws34: 1.0, sw34: 0.0, dir34: 304 }],
  ['Cuxhaven-Duhnen', 178, 308, { hs: [0.2, 1.4, 0.3], tm34: 3.8, ws34: 1.4, sw34: 0.0, dir34: 354 }],
  ['Norderney', 71, 328, { hs: [0.7, 3.8, 1.4], tm34: 7.6, ws34: 3.8, sw34: 0.0, dir34: 338 }],
  ['Eckernförde', 264, 237, { hs: [0.0, 0.1, 0.1], tm34: 2.4, ws34: 0.0, sw34: 0.1, dir34: 73 }],
  ['Kiel-Schilksee', 288, 242, { hs: [0.1, 0.3, 0.1], tm34: 3.0, ws34: 0.3, sw34: 0.0, dir34: 28 }],
  ['Laboe', 291, 244, { hs: [0.1, 0.7, 0.3], tm34: 3.0, ws34: 0.7, sw34: 0.0, dir34: 349 }],
  ['Heiligenhafen', 346, 248, { hs: [0.0, 0.0, 0.4], tm34: 1.8, ws34: 0.0, sw34: 0.0, dir34: 28 }],
  ['Fehmarn Grüner Brink', 360, 230, { hs: [0.2, 0.2, 0.7], tm34: 2.6, ws34: 0.1, sw34: 0.2, dir34: 101 }],
];

async function main() {
  const fields = {};
  for (const step of STEPS) {
    for (const p of PARAMS) {
      const url = gribUrl(MODEL, RUN, p, step);
      const raw = await fetchCached(url, CACHE);
      const grib = await decompressBz2(raw);
      const f = decodeGrib2(new Uint8Array(grib));
      fields[`${p}@${step}`] = f;
    }
  }
  const any = fields[`swh@${STEPS[0]}`];
  const out = {
    model: MODEL, run: RUN, steps: STEPS,
    grid: { ni: any.ni, nj: any.nj, lat1: any.lat1, lon1: any.lon1, lat2: any.lat2, lon2: any.lon2, di: any.di, dj: any.dj, scanMode: any.scanMode },
    perField: {}, masks: {}, spots: [],
  };
  // Sea points and mask identity per field.
  const maskKey = (f) => { let s = 0, h = 2166136261; for (let k = 0; k < f.values.length; k++) { const b = Number.isNaN(f.values[k]) ? 0 : 1; s += b; h = Math.imul(h ^ b, 16777619) >>> 0; } return { sea: s, fnv: h.toString(16) }; };
  for (const [key, f] of Object.entries(fields)) {
    const m = maskKey(f);
    let min = Infinity, max = -Infinity;
    for (const v of f.values) if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    out.perField[key] = { sea: m.sea, mask: m.fnv, min: +min.toFixed(3), max: +max.toFixed(3), scanMode: f.scanMode, ni: f.ni, nj: f.nj, discipline: f.discipline, category: f.category, number: f.number };
  }
  for (const step of STEPS) {
    const sp = fields[`sp_10m@${step}`].values, tm = fields[`tm10@${step}`].values, hs = fields[`swh@${step}`].values;
    const pp = fields[`ppww@${step}`].values, shww = fields[`shww@${step}`].values;
    let floor = 0, tmPh = 0, tmPhHs = 0, pp15 = 0, pp12low = 0; const pp15hs = [];
    for (let k = 0; k < sp.length; k++) {
      if (Number.isNaN(sp[k])) continue;
      if (Math.abs(sp[k] - 2) < 1e-6) floor++;
      if (Math.abs(tm[k] - 1) < 1e-6) { tmPh++; if (hs[k] < 0.05) tmPhHs++; }
      if (pp[k] > 15) { pp15++; pp15hs.push(hs[k]); }
      if (pp[k] > 12 && shww[k] < 0.3) pp12low++;
    }
    pp15hs.sort((a, b) => a - b);
    out[`traps@${step}`] = { windFloor: floor, tm10Placeholder: tmPh, tm10PlaceholderHsLt005: tmPhHs, ppwwGt15: pp15, ppwwGt15HsMedian: pp15hs.length ? +pp15hs[pp15hs.length >> 1].toFixed(3) : null, ppwwGt12ShwwLt03: pp12low };
  }
  // Spots: nearest-match search ±2 grid points (rows from North when scanMode has +j off).
  const ni = any.ni;
  const at = (key, i, j) => fields[key]?.values[j * ni + i];
  for (const [name, i0, j0, want] of SPOTS) {
    let best = null;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const i = i0 + di, j = j0 + dj;
      const v = [10, 34, 58].map((s) => at(`swh@${s}`, i, j));
      if (v.some((x) => x === undefined || Number.isNaN(x))) continue;
      const err = Math.max(...v.map((x, n) => Math.abs(x - want.hs[n])), Math.abs(at('tm10@34', i, j) - want.tm34) / 2);
      if (!best || err < best.err) best = { i, j, err, hs: v.map((x) => +x.toFixed(2)), tm34: +at('tm10@34', i, j).toFixed(2), ws34: +at('shww@34', i, j).toFixed(2), sw34: +at('shts@34', i, j).toFixed(2), dir34: +at('mwd@34', i, j).toFixed(0) };
    }
    const center = [10, 34, 58].map((s) => at(`swh@${s}`, i0, j0));
    out.spots.push({ name, i0, j0, centerHs: center.map((x) => (x === undefined || Number.isNaN(x) ? null : +x.toFixed(2))), want, best });
  }
  if (args.json) writeFileSync(String(args.json), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('decode-cwam.mjs')) await main();
