// Phase RG — the Herborn case before/after: for a list of display thresholds (mm/h, native), counts blue pixels in the
// Siegerland/Lahn-Dill box and at named places on one RV analysis, and renders the box as PNG tiles (nearest pixel, log ramp
// colours over a sand background, 6 px per km) — one tile per threshold, side by side, with a 1-px grey frame.
// Usage: … herborn-bild.mjs <rv tar or _000-hd5> <out.png> [thresholds=0,0.06,0.1,0.12,0.2]
import { readFileSync, writeFileSync } from 'node:fs';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5 } from '../../src/sources/rvHdf5.ts';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { precipRainRampLog, precipToU8Log } from '../../src/scalar/RainLayer.ts';
import { encodePng } from '../../scripts/lib/png.mjs';

const [src, outPng, thrArg] = process.argv.slice(2);
const THR = (thrArg ?? '0,0.06,0.1,0.12,0.2').split(',').map(Number);
const raw = readFileSync(src); let ab;
if (/\.tar$/.test(src)) { const e0 = untar(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)).find((e) => /_000-hd5$/.test(e.name)); ab = e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength); }
else ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const nat = await decodeRvHdf5(ab, { units: 'native', name: 'rv' }), rad = await decodeRvHdf5(ab, { units: 'radolan', name: 'rv' });
const [NW, NE, , SW] = DE1200_CORNERS; const pNW = psFwd(...NW), pNE = psFwd(...NE), pSW = psFwd(...SW);
const uv = (lon, lat) => { const [x, y] = psFwd(lon, lat); return [(x - pNW[0]) / (pNE[0] - pNW[0]), (y - pNW[1]) / (pSW[1] - pNW[1])]; };
const PLACES = { Herborn: [8.3075, 50.6826], Dillenburg: [8.2878, 50.7406], Burbach: [8.0864, 50.7442], Herdorf: [7.9536, 50.7766], Haiger: [8.2083, 50.7428], Siegen: [8.0242, 50.8748] };
const [u0, v0] = uv(7.75, 50.95), [u1, v1] = uv(8.55, 50.55);
const i0 = Math.floor(u0 * 1100), i1 = Math.ceil(u1 * 1100), j0 = Math.floor(v0 * 1200), j1 = Math.ceil(v1 * 1200);
const W = i1 - i0, H = j1 - j0, S = 6, GAP = 4;
// ramp lookup: nearest stop at or below the log byte (the shader interpolates; for the eye the stop colour is enough)
const stops = Object.entries(precipRainRampLog).map(([k, c]) => [+k * 255, c.match(/[\d.]+/g).map(Number)]).sort((a, b) => a[0] - b[0]);
const colour = (mm) => { const u = precipToU8Log(mm); if (!u) return null; let c = stops[1][1]; for (const [k, col] of stops) if (k <= u) c = col; return c; };
const SAND = [240, 238, 232];
const img = new Uint8Array((THR.length * (W * S + GAP) - GAP) * H * S * 3).fill(0);
const IW = THR.length * (W * S + GAP) - GAP;
const put = (x, y, rgb) => { const o = (y * IW + x) * 3; img[o] = rgb[0]; img[o + 1] = rgb[1]; img[o + 2] = rgb[2]; };
console.log(`Slot ${nat.validAt.toISOString()}, Kasten ${W} × ${H} km`);
THR.forEach((thr, t) => {
  let blue = 0, wet = 0; const x0 = t * (W * S + GAP);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const k = j * 1100 + i; const r = rad.rainRate[k], n = nat.rainRate[k];
    if (r > 0) wet++;
    // thr 0 = today: value = RADOLAN unit (lifted); thr > 0: native value, shown only if ≥ thr
    const shown = thr === 0 ? r : (n >= thr - 1e-9 ? n : 0);
    const col = shown > 0 ? colour(shown) : null; if (col) blue++;
    const rgb = col ? [Math.round(SAND[0] + (col[0] - SAND[0]) * col[3]), Math.round(SAND[1] + (col[1] - SAND[1]) * col[3]), Math.round(SAND[2] + (col[2] - SAND[2]) * col[3])] : SAND;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) put(x0 + (i - i0) * S + dx, (j - j0) * S + dy, rgb);
  }
  for (let x = 0; x < W * S; x++) { put(x0 + x, 0, [120, 120, 120]); put(x0 + x, H * S - 1, [120, 120, 120]); }
  for (let y = 0; y < H * S; y++) { put(x0, y, [120, 120, 120]); put(x0 + W * S - 1, y, [120, 120, 120]); }
  // place markers (black 3×3)
  for (const [, [lon, lat]] of Object.entries(PLACES)) { const [u, v] = uv(lon, lat); const i = Math.floor(u * 1100) - i0, j = Math.floor(v * 1200) - j0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(x0 + i * S + 3 + dx, j * S + 3 + dy, [0, 0, 0]); }
  const places = Object.entries(PLACES).map(([name, [lon, lat]]) => { const [u, v] = uv(lon, lat); const k = Math.floor(v * 1200) * 1100 + Math.floor(u * 1100); const r = rad.rainRate[k], n = nat.rainRate[k]; const shown = thr === 0 ? r : (n >= thr - 1e-9 ? n : 0); return `${name} ${shown > 0 ? shown.toFixed(3) : '—'}`; }).join(', ');
  console.log(`Schwelle ${thr === 0 ? 'heute (jedes Echo)' : thr.toFixed(3) + ' mm/h'}: blau ${blue} von ${wet} Echo-Pixeln (${(100 * blue / (W * H)).toFixed(1)} % des Kastens) · ${places}`);
});
writeFileSync(outPng, encodePng(IW, H * S, img, 3));
console.log(`→ ${outPng} (${IW} × ${H * S})`);
