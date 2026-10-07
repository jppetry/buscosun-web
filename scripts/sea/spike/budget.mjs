#!/usr/bin/env node
// SW-0 spike: budget of one full CWAM run encoded as the plan's PNG layout.
//   f/<sss>.png  630×387 RGBA  R = Hs (5 cm, 254 = ≥ 12.70 m, 255 = null) · G = mwd (256 steps) · B = tm10 (0.1 s, 255 = null) · A = water
//   c/<sss>.png 1260×387 RGBA  left wind sea (shww, mdww, mpww), right swell (shts, mdts, mpts), channels as f
// Steps: f hourly 0–48 + three-hourly 51–78 (59), c three-hourly 0–78 (27). Also reports the all-hourly variant.
//
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/budget.mjs
//          [--run=2026100700] [--cache=<dir>] [--out=<dir>]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../../lib/bz2.mjs';
import { encodePng } from '../../lib/png.mjs';
import { gribUrl, fetchCached } from './decode-cwam.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const RUN = String(args.run ?? '2026100700');
const CACHE = resolve(String(args.cache ?? '.sea-cache'));
const OUT = resolve(String(args.out ?? '.sea-budget'));
const F_STEPS = [...Array.from({ length: 49 }, (_, h) => h), ...Array.from({ length: 10 }, (_, k) => 51 + 3 * k)];
const C_STEPS = Array.from({ length: 27 }, (_, k) => 3 * k);

const field = async (p, s) => decodeGrib2(new Uint8Array(await decompressBz2(await fetchCached(gribUrl('cwam', RUN, p, s), CACHE)))).values;

function pack(rgba, off, stride, hs, dir, per, n, ni) {
  for (let k = 0; k < n; k++) {
    const o = off + (Math.floor(k / ni) * stride + (k % ni)) * 4;
    if (Number.isNaN(hs[k])) { rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 0; continue; }
    rgba[o] = Math.min(254, Math.max(0, Math.round(hs[k] / 0.05)));
    rgba[o + 1] = Math.round(((dir[k] % 360) + 360) % 360 / 360 * 256) & 255;
    rgba[o + 2] = Number.isNaN(per[k]) || (Math.abs(per[k] - 1) < 1e-6 && hs[k] < 0.05) ? 255 : Math.min(254, Math.round(per[k] / 0.1));
    rgba[o + 3] = 255;
  }
}

mkdirSync(join(OUT, 'f'), { recursive: true });
mkdirSync(join(OUT, 'c'), { recursive: true });
const ni = 630, nj = 387, n = ni * nj;
let fBytes = 0, fAllBytes = 0, cBytes = 0, t0 = Date.now(), maxF = 0, maxC = 0;
for (let s = 0; s <= 78; s++) {
  const [hs, dir, per] = await Promise.all([field('swh', s), field('mwd', s), field('tm10', s)]);
  const rgba = new Uint8Array(n * 4);
  pack(rgba, 0, ni, hs, dir, per, n, ni);
  const png = encodePng(ni, nj, rgba, 4);
  fAllBytes += png.length;
  if (F_STEPS.includes(s)) { fBytes += png.length; maxF = Math.max(maxF, png.length); writeFileSync(join(OUT, 'f', `${String(s).padStart(3, '0')}.png`), png); }
  if (C_STEPS.includes(s)) {
    const [a, b, c, d, e, f] = await Promise.all(['shww', 'mdww', 'mpww', 'shts', 'mdts', 'mpts'].map((p) => field(p, s)));
    const cr = new Uint8Array(n * 2 * 4);
    pack(cr, 0, 2 * ni, a, b, c, n, ni);
    pack(cr, ni * 4, 2 * ni, d, e, f, n, ni);
    const cp = encodePng(2 * ni, nj, cr, 4);
    cBytes += cp.length; maxC = Math.max(maxC, cp.length);
    writeFileSync(join(OUT, 'c', `${String(s).padStart(3, '0')}.png`), cp);
  }
}
const r = {
  run: RUN, fSteps: F_STEPS.length, cSteps: C_STEPS.length,
  fMB: +(fBytes / 1e6).toFixed(2), fAvgKB: +(fBytes / F_STEPS.length / 1e3).toFixed(1), fMaxKB: +(maxF / 1e3).toFixed(1),
  cMB: +(cBytes / 1e6).toFixed(2), cAvgKB: +(cBytes / C_STEPS.length / 1e3).toFixed(1), cMaxKB: +(maxC / 1e3).toFixed(1),
  totalMB: +((fBytes + cBytes) / 1e6).toFixed(2), allHourlyFMB: +(fAllBytes / 1e6).toFixed(2), seconds: Math.round((Date.now() - t0) / 1000),
};
console.log(JSON.stringify(r));
