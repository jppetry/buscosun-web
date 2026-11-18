#!/usr/bin/env node
/**
 * Phase SR, step 0 — measurement only (`audit/seewetter-riffel.md` §1.4, §2). One real BSH run → the hourly u/v field
 * on the CWAM grid at stride 1, 2 (and 3 for scale), coded as the diagnosis froze it BEFORE the measurement
 * (R = u, G = v as (byte − 128) × 0.02 m/s, B = 0 value / 255 no value, alpha 255), and reports per stride: size of
 * the run, size per hour, read time of one image in Node (PNG → u/v), clipped values, quantisation error.
 * No product code: the producer codes through `src/sea/seaCurrent.ts`; this file keeps its own copy of the rule so the
 * measurement stands on its own.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/current-uv-measure.mjs
 *     --files=<dir>        day files `Current_{db,wb}_<run>_<VV>.grb2`
 *     [--fetch]            download the newest complete run from the BSH filebox into <dir> first (≈ 80 MB)
 *     [--json=<out>]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bshMessages, bshField } from '../bshGrib.mjs';
import { fileboxSource, dirSource, pickRun } from '../sea-current.mjs';
import { encodePng, decodePng } from '../../lib/png.mjs';
import { SEA_MODELS } from '../../../src/sea/seaContract.ts';
import { BSH_CURRENT_PACKAGES, BSH_CURRENT_PKGS, BSH_CURRENT_ZERO_MS, bshIndexOfCwam } from '../../../src/sea/seaCurrent.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = resolve(String(args.files));
const H = 3_600_000, STEP = 0.02, G = SEA_MODELS.cwam.grid;
const STRIDES = [1, 2, 3];

if (args.fetch) {
  mkdirSync(dir, { recursive: true });
  const src = fileboxSource();
  const pick = pickRun({ db: await src.list('db'), wb: await src.list('wb') }, Date.now());
  if (!pick.run) throw new Error(`kein vollständiger Lauf beim BSH: ${pick.reason}`);
  for (const pkg of BSH_CURRENT_PKGS) for (const f of pick.files[pkg]) {
    const to = join(dir, f.name);
    if (existsSync(to) && readFileSync(to).length === f.size) continue;
    const t0 = Date.now(), b = await src.get(pkg, f.name);
    if (b.length !== f.size) throw new Error(`${f.name}: ${b.length} B statt ${f.size} B`);
    writeFileSync(to, b);
    console.log(`[uv-measure] ${f.name} ${(b.length / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

const src = dirSource(dir);
const pick = pickRun({ db: await src.list('db'), wb: await src.list('wb') }, Date.now() + 365 * 24 * H);
if (!pick.run) throw new Error(`kein vollständiger Lauf in ${dir}: ${pick.reason}`);

// --- every whole hour → u/v on the full CWAM grid (NaN = no value: masked, or below the zero limit) ---------------
const hours = new Map();     // t → { u: Float32Array(ni·nj), v }
const cell = (t) => hours.get(t) ?? hours.set(t, { u: new Float32Array(G.ni * G.nj).fill(NaN), v: new Float32Array(G.ni * G.nj).fill(NaN) }).get(t);
const tRead = Date.now();
let messages = 0;
for (const pkg of BSH_CURRENT_PKGS) {
  const p = BSH_CURRENT_PACKAGES[pkg];
  for (const f of pick.files[pkg]) {
    const raw = new Uint8Array(readFileSync(join(dir, f.name)));
    const pending = new Map();
    for (const m of bshMessages(raw)) {
      const fld = bshField(raw, m.offset, m.length);
      messages++;
      if (fld.t % H !== 0) continue;
      const e = pending.get(fld.t) ?? {};
      e[fld.num === 2 ? 'u' : 'v'] = fld.values;
      if (!e.u || !e.v) { pending.set(fld.t, e); continue; }
      pending.delete(fld.t);
      const out = cell(fld.t);
      for (let j = 0; j < G.nj; j++) for (let c = 0; c < p.ni; c++) {
        const i = p.col0 + c, k = bshIndexOfCwam(pkg, i, j), o = j * G.ni + i;
        if (!Number.isNaN(out.u[o])) continue;                // db first, like the thinned field
        const u = e.u[k], v = e.v[k];
        if (Number.isNaN(u) || Number.isNaN(v) || Math.hypot(u, v) < BSH_CURRENT_ZERO_MS) continue;
        out.u[o] = u; out.v[o] = v;
      }
    }
  }
}
const readS = (Date.now() - tRead) / 1000;
const times = [...hours.keys()].sort((a, b) => a - b);

// --- the frozen coding ------------------------------------------------------------------------------------------
const byteOf = (x) => Math.max(1, Math.min(255, 128 + Math.round(x / STEP)));
function encode(stride, f) {
  const nx = Math.floor((G.ni - 1) / stride) + 1, ny = Math.floor((G.nj - 1) / stride) + 1;
  const img = new Uint8Array(nx * ny * 4);
  let n = 0, clipped = 0, maxErr = 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const s = y * stride * G.ni + x * stride, o = (y * nx + x) * 4;
    img[o + 3] = 255;
    if (Number.isNaN(f.u[s])) { img[o + 2] = 255; continue; }
    img[o] = byteOf(f.u[s]); img[o + 1] = byteOf(f.v[s]); n++;
    if (Math.abs(f.u[s]) > 127 * STEP || Math.abs(f.v[s]) > 127 * STEP) clipped++;
    else maxErr = Math.max(maxErr, Math.abs((img[o] - 128) * STEP - f.u[s]), Math.abs((img[o + 1] - 128) * STEP - f.v[s]));
  }
  return { nx, ny, png: encodePng(nx, ny, img, 4), n, clipped, maxErr };
}
function decodeMs(png, nx, ny) {
  const runs = [];
  for (let r = 0; r < 9; r++) {
    const t0 = performance.now();
    const d = decodePng(png).data, u = new Float32Array(nx * ny), v = new Float32Array(nx * ny), ok = new Uint8Array(nx * ny);
    for (let p = 0, o = 0; p < nx * ny; p++, o += 4) if (d[o + 2] === 0) { ok[p] = 1; u[p] = (d[o] - 128) * STEP; v[p] = (d[o + 1] - 128) * STEP; }
    runs.push(performance.now() - t0);
  }
  return runs.sort((a, b) => a - b)[4];
}

let sMax = 0;
for (const t of times) { const f = hours.get(t); for (let k = 0; k < f.u.length; k++) if (!Number.isNaN(f.u[k])) sMax = Math.max(sMax, Math.hypot(f.u[k], f.v[k])); }
const out = { run: pick.run, days: pick.days, messages, hours: times.length, first: new Date(times[0]).toISOString(), last: new Date(times[times.length - 1]).toISOString(), readS: +readS.toFixed(1), maxSpeedMs: +sMax.toFixed(3), stepMs: STEP, strides: {} };
for (const stride of STRIDES) {
  const sizes = [], cells = [], enc = [];
  let clipped = 0, maxErr = 0, dec = [], nx = 0, ny = 0;
  for (const [i, t] of times.entries()) {
    const t0 = performance.now();
    const e = encode(stride, hours.get(t));
    enc.push(performance.now() - t0);
    sizes.push(e.png.length); cells.push(e.n); clipped += e.clipped; maxErr = Math.max(maxErr, e.maxErr); nx = e.nx; ny = e.ny;
    if (i % 12 === 0) dec.push(decodeMs(e.png, nx, ny));
  }
  const sum = sizes.reduce((a, b) => a + b, 0), med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  out.strides[stride] = {
    nx, ny, kmEastWest: +(stride * G.di * 111.32 * Math.cos((55 * Math.PI) / 180)).toFixed(2), kmNorthSouth: +(stride * G.dj * 111.32).toFixed(2),
    runBytes: sum, runMB: +(sum / 1e6).toFixed(2), hourBytes: { min: Math.min(...sizes), mean: Math.round(sum / sizes.length), max: Math.max(...sizes) },
    cells: { min: Math.min(...cells), max: Math.max(...cells) }, clipped, maxQuantErrMs: +maxErr.toFixed(4),
    encodeMsMedian: +med(enc).toFixed(1), decodeMsMedian: +med(dec).toFixed(1), decodeMsMax: +Math.max(...dec).toFixed(1),
  };
  console.log(`[uv-measure] Schrittweite ${stride}: ${nx} × ${ny}, Lauf ${(sum / 1e6).toFixed(2)} MB, je Stunde ${Math.min(...sizes)}–${Math.max(...sizes)} B (Mittel ${Math.round(sum / sizes.length)}), Lesen ${med(dec).toFixed(1)} ms`);
}
if (typeof args.json === 'string') writeFileSync(resolve(args.json), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out));
void readdirSync;
