#!/usr/bin/env node
/**
 * ramp-log-bild.mjs — Phase HD, E-HD-6: picture of the log-plane colour ramp before and after the refinement of the
 * light-rain end, plus the perceptual step sizes (CIE ΔE76 over the basemap sand) between neighbouring stops.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-hochaufloesung/ramp-log-bild.mjs \
 *        [--out=audit/radar-hochaufloesung/bilder/rampe-log-fein.png]
 *
 * The ramp is drawn as the shader sees it: one column per log byte (1 … 255 = 0,06 … 200 mm/h), colour from the
 * stop list interpolated linearly in RGBA (the canvas gradient of `getColorRamp`, straight alpha) and composited at
 * its alpha over the positron sand (240,238,232). The upper bar is the ramp of `e3ef84e` (literal copy), the lower one
 * `precipRainRampLog` as imported. Measurement only; nothing under `src/` is touched.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePng } from '../../scripts/lib/png.mjs';
import { precipRainRampLog, precipToU8Log, precipFromU8Log } from '../../src/scalar/RainLayer.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const OUT = args.out ?? 'audit/radar-hochaufloesung/bilder/rampe-log-fein.png';
const BG = [240, 238, 232];

/** The log ramp as committed in e3ef84e (E-HD-4): the linear ramp's colours moved onto their log position. */
const OLD = Object.fromEntries([
  [0, 'rgba(150,200,245,0)'], [0.06, 'rgba(150,200,245,0.59)'], [0.2, 'rgba(95,165,235,0.59)'], [0.5, 'rgba(50,120,220,0.78)'],
  [1, 'rgba(40,175,230,0.78)'], [2, 'rgba(60,200,120,0.90)'], [3, 'rgba(200,215,60,0.90)'], [5, 'rgba(240,150,50,0.90)'],
  [8, 'rgba(228,75,55,0.90)'], [12, 'rgba(190,40,95,0.90)'], [20, 'rgba(150,40,140,0.90)'], [30, 'rgba(110,30,170,0.92)'],
  [50, 'rgba(80,20,190,0.94)'], [100, 'rgba(190,130,255,0.96)'], [200, 'rgba(255,255,255,0.98)'],
].map(([mm, c]) => [mm === 0 ? 0 : precipToU8Log(mm) / 255, c]));

const parse = (s) => s.match(/[\d.]+/g).map(Number);
function rampAt(stops, t) {
  const keys = Object.keys(stops).map(Number).sort((a, b) => a - b);
  if (t <= keys[0]) return parse(stops[keys[0]]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i]) { const f = (t - keys[i - 1]) / (keys[i] - keys[i - 1]); const a = parse(stops[keys[i - 1]]), b = parse(stops[keys[i]]); return a.map((v, k) => v + (b[k] - v) * f); }
  }
  return parse(stops[keys[keys.length - 1]]);
}
const over = ([r, g, b, a]) => [r * a + BG[0] * (1 - a), g * a + BG[1] * (1 - a), b * a + BG[2] * (1 - a)];
const lab = ([r, g, b]) => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ── numbers ────────────────────────────────────────────────────────────────
for (const [name, stops] of [['alt (e3ef84e)', OLD], ['neu (E-HD-6)', precipRainRampLog]]) {
  const keys = Object.keys(stops).map(Number).sort((a, b) => a - b).filter((k) => k > 0);
  const rows = keys.map((k) => ({ mm: precipFromU8Log(Math.round(k * 255)), lab: lab(over(parse(stops[k]))), a: parse(stops[k])[3] }));
  console.log(`\n${name}: ${keys.length} Stützen`);
  rows.forEach((r, i) => console.log(`  ${r.mm.toFixed(2).padStart(7)} mm/h  α ${r.a.toFixed(2)}  L* ${r.lab[0].toFixed(1).padStart(5)}${i ? `  ΔE zum Vorgänger ${dE(r.lab, rows[i - 1].lab).toFixed(1)}` : ''}`));
  // how many perceptual steps the light rain carries: ΔE between 0,06 and 0,5 mm/h along the ramp, summed per byte
  let path = 0; let prev = lab(over(rampAt(stops, 1 / 255)));
  for (let u = 2; u <= precipToU8Log(0.5); u++) { const l = lab(over(rampAt(stops, u / 255))); path += dE(l, prev); prev = l; }
  console.log(`  Weg in CIELAB über 0,06 … 0,5 mm/h: ΔE ${path.toFixed(1)} (${(path / 2.3).toFixed(0)} eben noch unterscheidbare Schritte à 2,3)`);
}

// ── picture ────────────────────────────────────────────────────────────────
const SCALE = 4, BAR_H = 44, GAP = 10, TICK_H = 6, PAD = 6;
const W = 255 * SCALE + 2 * PAD, H = PAD + (BAR_H + TICK_H + GAP) * 2 + PAD;
const px = new Uint8Array(W * H * 4).fill(255);
for (let i = 0; i < W * H; i++) { px[i * 4] = BG[0]; px[i * 4 + 1] = BG[1]; px[i * 4 + 2] = BG[2]; }
const put = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
let y0 = PAD;
for (const stops of [OLD, precipRainRampLog]) {
  for (let u = 1; u <= 255; u++) {
    const c = over(rampAt(stops, u / 255));
    for (let dx = 0; dx < SCALE; dx++) for (let dy = 0; dy < BAR_H; dy++) put(PAD + (u - 1) * SCALE + dx, y0 + dy, c);
  }
  // ticks at the stops (dark) and at 0,1 / 1 / 10 / 100 mm/h (long)
  for (const k of Object.keys(stops).map(Number).filter((k) => k > 0)) {
    const x = PAD + (Math.round(k * 255) - 1) * SCALE + Math.floor(SCALE / 2);
    for (let dy = 0; dy < TICK_H; dy++) put(x, y0 + BAR_H + dy, [60, 60, 60]);
  }
  for (const mm of [0.1, 1, 10, 100]) {
    const x = PAD + (precipToU8Log(mm) - 1) * SCALE + Math.floor(SCALE / 2);
    for (let dy = -4; dy < TICK_H; dy++) { put(x, y0 + BAR_H + dy, [0, 0, 0]); put(x + 1, y0 + BAR_H + dy, [0, 0, 0]); }
  }
  y0 += BAR_H + TICK_H + GAP;
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePng(W, H, px, 4));
console.log(`\nBild: ${OUT} (${W} × ${H}; oben alt, unten neu; Striche = Stützen, lange Striche 0,1 / 1 / 10 / 100 mm/h)`);
