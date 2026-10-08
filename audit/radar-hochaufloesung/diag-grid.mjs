#!/usr/bin/env node
/**
 * diag-grid.mjs — Phase HD, HD-0: what the DACH composite grid (600 × 512, `precipIndexMap.G`) and the B-spline
 * sampling of `RainLayer` do to the 1-km radar frames the client actually draws.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-hochaufloesung/diag-grid.mjs \
 *        --slot=<dir with rv/{meta.json,fNNN.png} inca/{meta.json,fNNN.png} rzc/{meta.json,frame.png}> --out=<dir>
 *
 * Measures on REAL mirror frames (same decoders as the client, `decodeGrayPng`):
 *   A  grid geometry of the composite (cell size at 47/50/55 N) against the native grids
 *   B  per source: native pixels owned by the country (`pickCountry` at the pixel centre, the same rule the composite
 *      uses per cell) · how many of them the composite ever reads (unique index-map entries) · wet pixel counts and
 *      mm/h·km² mass native vs composite
 *   C  cores (8-connected components ≥ 5 mm/h on the native grid, own country): lost in the composite (no cell ≥ 5 mm/h),
 *      peak shown by today's chain (composite + B-spline at the composite texel centres) vs the native peak, and the peak
 *      the HD chain would show (native grid + Catmull-Rom clamped / bilinear / nearest)
 *   D  images: the same window rendered four ways (native nearest · composite nearest · composite + B-spline = today ·
 *      native + Catmull-Rom = HD proposal) at 100 m/px and 400 m/px, written to --out
 *
 * Everything here is measurement only; nothing under `src/` is touched. The sampling emulations are the exact
 * algebra of the shader (`RainLayer.ts` `sampleBicubic` = 16-tap cubic B-spline; the 4-tap form is its exact
 * refactoring).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeGrayPng } from '../../src/sources/grayPng.ts';
import { PrecipCompositor } from '../../src/scalar/precipComposite.ts';
import { G } from '../../src/scalar/precipIndexMap.ts';
import { DE1200_CORNERS, psFwd, de1200Node } from '../../src/sources/radolanGeo.ts';
import { incaFwd, incaNodeFn } from '../../src/sources/geosphereIncaGeo.ts';
import { rzcFwd, rzcNodeFn } from '../../src/sources/meteoSwissGeo.ts';
import { pickCountry } from '../../src/pointForecast/countryOfPoint.ts';
import { precipRainRamp, PRECIP_VMAX } from '../../src/scalar/RainLayer.ts';
import { encodePng } from '../../scripts/lib/png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (!args.slot) { console.error('usage: diag-grid.mjs --slot=<dir> [--out=<dir>]'); process.exit(2); }
const SLOT = args.slot;
const OUT = args.out ?? join('audit', 'radar-hochaufloesung');
mkdirSync(OUT, { recursive: true });

const R = 6378137;
const DEG = Math.PI / 180;
const u8ToMm = (v) => (v / 255) * PRECIP_VMAX;
const T5 = Math.ceil((5 / PRECIP_VMAX) * 255);   // 64 → ≥ 5,02 mm/h
const T1 = Math.ceil((1 / PRECIP_VMAX) * 255);   // 13
const T10 = Math.ceil((10 / PRECIP_VMAX) * 255); // 128

// ── load the slot ────────────────────────────────────────────────────────────
const png = async (p) => decodeGrayPng(new Uint8Array(readFileSync(p)));
const rvMeta = JSON.parse(readFileSync(join(SLOT, 'rv', 'meta.json'), 'utf8'));
const incaMeta = JSON.parse(readFileSync(join(SLOT, 'inca', 'meta.json'), 'utf8'));
const rzcMeta = JSON.parse(readFileSync(join(SLOT, 'rzc', 'meta.json'), 'utf8'));
const rvLead = Number(args.rvLead ?? 10);
const incaLead = Number(args.incaLead ?? incaMeta.frames[0].lead);
const rvPng = await png(join(SLOT, 'rv', `f${String(rvLead).padStart(3, '0')}.png`));
const incaPng = await png(join(SLOT, 'inca', `f${String(incaLead).padStart(3, '0')}.png`));
const rzcPng = await png(join(SLOT, 'rzc', 'frame.png'));

const SRC = {
  DE: { name: 'RADOLAN-RV (DE)', values: rvPng.values, W: rvPng.width, H: rvPng.height, corners: DE1200_CORNERS, project: psFwd, node: de1200Node, code: 0 },
  AT: { name: 'INCA (AT)', values: incaPng.values, W: incaPng.width, H: incaPng.height, corners: incaMeta.corners, project: incaFwd, node: incaNodeFn(incaMeta.corners), code: 1 },
  CH: { name: 'rzc (CH)', values: rzcPng.values, W: rzcPng.width, H: rzcPng.height, corners: rzcMeta.corners, project: rzcFwd, node: rzcNodeFn(rzcMeta.corners), code: 2 },
};

// ── DACH mask (what the user can see: the Länder-Maske hides everything outside DE ∪ AT ∪ CH) ──────────────────
// Rasterised once at 0.005° from the same GeoJSON the map's mask uses (`public/countries/*.geojson`, even–odd).
const DACH = { lonMin: 5.5, lonMax: 17.5, latMin: 45.3, latMax: 55.6, step: 0.005 };
DACH.w = Math.ceil((DACH.lonMax - DACH.lonMin) / DACH.step); DACH.h = Math.ceil((DACH.latMax - DACH.latMin) / DACH.step);
DACH.mask = new Uint8Array(DACH.w * DACH.h);
{
  const edges = [];
  for (const c of ['DE', 'AT', 'CH']) {
    const f = JSON.parse(readFileSync(join('public', 'countries', `${c}.geojson`), 'utf8'));
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) edges.push([ring[i][0], ring[i][1], ring[j][0], ring[j][1]]);
  }
  for (let r = 0; r < DACH.h; r++) {
    const lat = DACH.latMax - (r + 0.5) * DACH.step;
    const cuts = [];
    for (const [xi, yi, xj, yj] of edges) if ((yi > lat) !== (yj > lat)) cuts.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((cuts[k] - DACH.lonMin) / DACH.step - 0.5)), c1 = Math.min(DACH.w - 1, Math.floor((cuts[k + 1] - DACH.lonMin) / DACH.step - 0.5));
      for (let c = c0; c <= c1; c++) DACH.mask[r * DACH.w + c] = 1;
    }
  }
}
const inDach = (lon, lat) => { const c = Math.floor((lon - DACH.lonMin) / DACH.step), r = Math.floor((DACH.latMax - lat) / DACH.step); return c >= 0 && r >= 0 && c < DACH.w && r < DACH.h && DACH.mask[r * DACH.w + c] === 1; };

// projected frame of a grid (edge corners, regular in its own metric — the same averaging as the node functions)
function frameOf(s) {
  const [nw, ne, se, sw] = s.corners.map(([lo, la]) => s.project(lo, la));
  return { west: (nw[0] + sw[0]) / 2, east: (ne[0] + se[0]) / 2, north: (nw[1] + ne[1]) / 2, south: (sw[1] + se[1]) / 2 };
}
for (const s of Object.values(SRC)) {
  s.frame = frameOf(s);
  // continuous texture coordinate (u, v ∈ [0,1]) of a lon/lat — the uv the shader sees
  s.uv = (lon, lat) => { const p = s.project(lon, lat); return [(p[0] - s.frame.west) / (s.frame.east - s.frame.west), (p[1] - s.frame.north) / (s.frame.south - s.frame.north)]; };
}

// ── composite as the client builds it ───────────────────────────────────────
const comp = new PrecipCompositor();
const nowMs = rvMeta.runAtMs;
const h = rvLead / 60;
const sources = {
  rv: { runAt: new Date(rvMeta.runAtMs), corners: DE1200_CORNERS, frames: [{ leadMinutes: rvLead, validAt: new Date(rvMeta.runAtMs + rvLead * 60_000), values: rvPng.values, width: rvPng.width, height: rvPng.height }] },
  inca: { corners: incaMeta.corners, frames: [{ leadHours: incaLead / 60, values: incaPng.values, width: incaPng.width, height: incaPng.height }] },
  rzc: { values: rzcPng.values, width: rzcPng.width, height: rzcPng.height, corners: rzcMeta.corners, validAt: new Date(rzcMeta.validAtMs) },
};
const cf = comp.build(h, sources, nowMs);
const compCountry = comp.country;              // 0 DE, 1 AT, 2 CH per composite cell
const idxOf = { DE: comp.deIdx, AT: comp.atIdx, CH: comp.chIdx };

// ── A: grid geometry ─────────────────────────────────────────────────────────
const dLat = (G.latMax - G.latMin) / G.h, dLon = (G.lonMax - G.lonMin) / G.w;
const kmNS = dLat * 111.195;
const geometry = { composite: { cols: G.w, rows: G.h, dLatDeg: +dLat.toFixed(5), dLonDeg: +dLon.toFixed(5), kmNS: +kmNS.toFixed(2),
  kmEW: Object.fromEntries([47, 50, 55].map((la) => [la, +(dLon * 111.195 * Math.cos(la * DEG)).toFixed(2)])),
  cellKm2: Object.fromEntries([47, 50, 55].map((la) => [la, +(kmNS * dLon * 111.195 * Math.cos(la * DEG)).toFixed(2)])) },
  native: Object.fromEntries(Object.entries(SRC).map(([c, s]) => [c, { cols: s.W, rows: s.H, kmX: +(Math.abs(s.frame.east - s.frame.west) / s.W / 1000).toFixed(3), kmY: +(Math.abs(s.frame.south - s.frame.north) / s.H / 1000).toFixed(3) }])) };

// ── B: ownership and coverage ────────────────────────────────────────────────
const stats = {};
const own = {};   // per source: Uint8Array mask of own pixels (pickCountry at the centre)
for (const [c, s] of Object.entries(SRC)) {
  const mask = new Uint8Array(s.W * s.H);
  let nOwn = 0;
  for (let r = 0; r < s.H; r++) for (let col = 0; col < s.W; col++) {
    const [lon, lat] = s.node((col + 0.5) / s.W, (r + 0.5) / s.H);
    if (inDach(lon, lat) && pickCountry(lat, lon) === c) { mask[r * s.W + col] = 1; nOwn++; }
  }
  own[c] = mask;
  const idx = idxOf[c];
  const seen = new Uint8Array(s.W * s.H);
  let referenced = 0, cells = 0;
  for (let i = 0; i < idx.length; i++) if (compCountry[i] === s.code && idx[i] >= 0 && mask[idx[i]]) { cells++; if (!seen[idx[i]]) { seen[idx[i]] = 1; referenced++; } }
  const cnt = (arr, m, thr, area) => { let n = 0, mass = 0; for (let i = 0; i < arr.length; i++) if (m[i] && arr[i] >= thr) { n++; mass += u8ToMm(arr[i]) * area(i); } return { n, mass }; };
  const nat = { wet: cnt(s.values, mask, 1, () => 1), ge1: cnt(s.values, mask, T1, () => 1), ge5: cnt(s.values, mask, T5, () => 1), ge10: cnt(s.values, mask, T10, () => 1) };
  const compMask = new Uint8Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const row = Math.floor(i / G.w), col = i % G.w;
    const lat = G.latMax - ((row + 0.5) / G.h) * (G.latMax - G.latMin), lon = G.lonMin + ((col + 0.5) / G.w) * (G.lonMax - G.lonMin);
    compMask[i] = compCountry[i] === s.code && idx[i] >= 0 && inDach(lon, lat) ? 1 : 0;
  }
  const cellArea = (i) => { const row = Math.floor(i / G.w); const lat = G.latMax - ((row + 0.5) / G.h) * (G.latMax - G.latMin); return kmNS * dLon * 111.195 * Math.cos(lat * DEG); };
  const cmp = { wet: cnt(cf.values, compMask, 1, cellArea), ge1: cnt(cf.values, compMask, T1, cellArea), ge5: cnt(cf.values, compMask, T5, cellArea), ge10: cnt(cf.values, compMask, T10, cellArea) };
  stats[c] = { name: s.name, nativeOwnPx: nOwn, compositeCells: cells, nativeReferencedPx: referenced, coveragePct: +(100 * referenced / nOwn).toFixed(1),
    native: Object.fromEntries(Object.entries(nat).map(([k, v]) => [k, { px: v.n, massMmKm2: Math.round(v.mass) }])),
    composite: Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, { cells: v.n, massMmKm2: Math.round(v.mass) }])) };
}

// ── sampling emulations (exact shader algebra) ───────────────────────────────
const clampI = (x, n) => (x < 0 ? 0 : x >= n ? n - 1 : x);
function bsplineW(t) { const t2 = t * t, t3 = t2 * t; return [(-t3 + 3 * t2 - 3 * t + 1) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6]; }
function catmullW(t) { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; }
/** value (0..1) at continuous uv on a W×H u8 texture with the given kernel; 'catmull' is clamped to the inner 2×2 range. */
function sampleTex(values, W, H, u, v, mode) {
  const x = u * W - 0.5, y = v * H - 0.5;
  if (mode === 'nearest') return values[clampI(Math.round(y), H) * W + clampI(Math.round(x), W)] / 255;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xx, yy) => values[clampI(yy, H) * W + clampI(xx, W)] / 255;
  if (mode === 'bilinear') return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  const wx = mode === 'bspline' ? bsplineW(fx) : catmullW(fx), wy = mode === 'bspline' ? bsplineW(fy) : catmullW(fy);
  let s = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += wx[i] * wy[j] * at(x0 - 1 + i, y0 - 1 + j);
  if (mode === 'catmull') { const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1); const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d); s = s < lo ? lo : s > hi ? hi : s; }
  return s;
}
// analytic check of the isolated-pixel attenuation (texel centre: fx = fy = 0)
const isolated = { bsplineCentre: +(bsplineW(0)[1] ** 2).toFixed(4), bsplineNeighbour: +(bsplineW(0)[1] * bsplineW(0)[0]).toFixed(4), catmullCentre: +(catmullW(0)[1] ** 2).toFixed(4), bilinearCentre: 1 };

// ── C: cores ─────────────────────────────────────────────────────────────────
function components(values, mask, W, H, thr) {
  const lab = new Int32Array(W * H).fill(-1); const comps = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (lab[i] >= 0 || !mask[i] || values[i] < thr) continue;
    const id = comps.length; const px = []; lab[i] = id; stack.push(i);
    let peak = 0, peakI = i;
    while (stack.length) {
      const k = stack.pop(); px.push(k); if (values[k] > peak) { peak = values[k]; peakI = k; }
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const kk = yy * W + xx; if (lab[kk] >= 0 || !mask[kk] || values[kk] < thr) continue; lab[kk] = id; stack.push(kk);
      }
    }
    comps.push({ px, peak, peakI });
  }
  return { comps, lab };
}
const cores = {};
const bins = [[1, 1], [2, 4], [5, 9], [10, 24], [25, 1e9]];
const binOf = (n) => bins.findIndex(([a, b]) => n >= a && n <= b);
for (const [c, s] of Object.entries(SRC)) {
  const { comps, lab } = components(s.values, own[c], s.W, s.H, T5);
  // composite cells per core: cells of this country whose index-map entry lies in the core
  const cellsOfCore = comps.map(() => []);
  const idx = idxOf[c];
  for (let i = 0; i < idx.length; i++) if (compCountry[i] === s.code && idx[i] >= 0 && lab[idx[i]] >= 0) cellsOfCore[lab[idx[i]]].push(i);
  const rows = bins.map(() => ({ cores: 0, lostInComposite: 0, shownTodayBelow5: 0, peakRatioToday: [], peakRatioHdCatmull: [], peakRatioHdBilinear: [] }));
  for (let k = 0; k < comps.length; k++) {
    const co = comps[k]; const b = binOf(co.px.length); const row = rows[b]; row.cores++;
    // composite: nearest (what the CPU composite holds) and today's shown value (B-spline at the composite texel centres)
    let compPeak = 0, shownToday = 0;
    for (const i of cellsOfCore[k]) {
      if (cf.values[i] > compPeak) compPeak = cf.values[i];
      const col = i % G.w, row2 = (i / G.w) | 0;
      const t = sampleTex(cf.values, G.w, G.h, (col + 0.5) / G.w, (row2 + 0.5) / G.h, 'bspline');
      if (t > shownToday) shownToday = t;
    }
    if (compPeak < T5) row.lostInComposite++;
    if (shownToday * 255 < T5) row.shownTodayBelow5++;
    row.peakRatioToday.push(shownToday * 255 / co.peak);
    // HD: native grid, sampled at the native texel centres over the core
    let hdC = 0, hdB = 0;
    for (const p of co.px) {
      const x = p % s.W, y = (p / s.W) | 0;
      const tc = sampleTex(s.values, s.W, s.H, (x + 0.5) / s.W, (y + 0.5) / s.H, 'catmull'); if (tc > hdC) hdC = tc;
      const tb = sampleTex(s.values, s.W, s.H, (x + 0.5) / s.W, (y + 0.5) / s.H, 'bilinear'); if (tb > hdB) hdB = tb;
    }
    row.peakRatioHdCatmull.push(hdC * 255 / co.peak);
    row.peakRatioHdBilinear.push(hdB * 255 / co.peak);
  }
  const med = (a) => { if (!a.length) return null; const s2 = [...a].sort((x, y) => x - y); return +s2[Math.floor(s2.length / 2)].toFixed(3); };
  cores[c] = { name: s.name, total: comps.length, bySize: rows.map((r, i) => ({ sizePx: `${bins[i][0]}${bins[i][1] >= 1e9 ? '+' : bins[i][1] > bins[i][0] ? '–' + bins[i][1] : ''}`, cores: r.cores,
    lostInComposite: r.lostInComposite, shownTodayBelow5mm: r.shownTodayBelow5, medianPeakRatioToday: med(r.peakRatioToday), medianPeakRatioHdCatmull: med(r.peakRatioHdCatmull), medianPeakRatioHdBilinear: med(r.peakRatioHdBilinear) })) };
  s.comps = comps;
}

// ── D: images ────────────────────────────────────────────────────────────────
const stops = Object.entries(precipRainRamp).map(([k, v]) => { const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(v); return [+k, [+m[1], +m[2], +m[3], +m[4]]]; }).sort((a, b) => a[0] - b[0]);
function ramp(t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const f = (t - a) / (b - a); return ca.map((x, k) => x + (cb[k] - x) * f); }
  return stops[stops.length - 1][1];
}
const BG = [44, 42, 38]; // the map's dim wash colour (#2C2A26) — as background
function renderWindow(lon0, lat0, mPerPx, W, H, sampler) {
  const out = new Uint8Array(W * H * 4);
  const my0 = Math.log(Math.tan(Math.PI / 4 + lat0 * DEG / 2));
  const mercPerPx = mPerPx / Math.cos(lat0 * DEG) / R;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const lon = lon0 + (px - W / 2) * mercPerPx / DEG;
    const my = my0 - (py - H / 2) * mercPerPx;
    const lat = (2 * Math.atan(Math.exp(my)) - Math.PI / 2) / DEG;
    const t = sampler(lon, lat);
    const o = (py * W + px) * 4;
    if (t == null || t < 0.002) { out[o] = BG[0]; out[o + 1] = BG[1]; out[o + 2] = BG[2]; out[o + 3] = 255; continue; }
    const c = ramp(Math.min(1, t)); const a = c[3] * 0.85;
    out[o] = Math.round(BG[0] + (c[0] - BG[0]) * a); out[o + 1] = Math.round(BG[1] + (c[1] - BG[1]) * a); out[o + 2] = Math.round(BG[2] + (c[2] - BG[2]) * a); out[o + 3] = 255;
  }
  return out;
}
const sampNative = (s, mode) => (lon, lat) => { const [u, v] = s.uv(lon, lat); if (u < 0 || u > 1 || v < 0 || v > 1) return null; return sampleTex(s.values, s.W, s.H, u, v, mode); };
const sampComposite = (mode) => (lon, lat) => { const u = (lon - G.lonMin) / (G.lonMax - G.lonMin), v = (G.latMax - lat) / (G.latMax - G.latMin); if (u < 0 || u > 1 || v < 0 || v > 1) return null; return sampleTex(cf.values, G.w, G.h, u, v, mode); };
// the window: around the largest ≥ 5 mm/h core of each source (own country)
const windows = [];
for (const [c, s] of Object.entries(SRC)) {
  const big = [...s.comps].sort((a, b) => b.px.length - a.px.length)[0];
  if (!big) continue;
  const x = big.peakI % s.W, y = (big.peakI / s.W) | 0;
  const [lon, lat] = s.node((x + 0.5) / s.W, (y + 0.5) / s.H);
  windows.push({ country: c, lon: +lon.toFixed(4), lat: +lat.toFixed(4), corePx: big.px.length, peakMm: +u8ToMm(big.peak).toFixed(1) });
}
const panelW = 600, panelH = 400;
for (const w of windows) {
  const s = SRC[w.country];
  for (const [tag, mpp] of [['z10-100m', 100], ['z8-400m', 400]]) {
    const panels = [
      renderWindow(w.lon, w.lat, mpp, panelW, panelH, sampNative(s, 'nearest')),
      renderWindow(w.lon, w.lat, mpp, panelW, panelH, sampComposite('nearest')),
      renderWindow(w.lon, w.lat, mpp, panelW, panelH, sampComposite('bspline')),
      renderWindow(w.lon, w.lat, mpp, panelW, panelH, sampNative(s, 'catmull')),
    ];
    const WW = panelW * 2 + 6, HH = panelH * 2 + 6;
    const sheet = new Uint8Array(WW * HH * 4).fill(255);
    panels.forEach((p, k) => { const ox = (k % 2) * (panelW + 6), oy = Math.floor(k / 2) * (panelH + 6);
      for (let y = 0; y < panelH; y++) sheet.set(p.subarray(y * panelW * 4, (y + 1) * panelW * 4), ((oy + y) * WW + ox) * 4); });
    writeFileSync(join(OUT, `diag-${w.country}-${tag}.png`), encodePng(WW, HH, sheet, 4));
  }
}

const report = { at: new Date().toISOString(), slot: { rv: rvMeta.stamp, rvLead, inca: incaMeta.stamp, incaLead, rzc: rzcMeta.stamp }, geometry, isolated, stats, cores, windows,
  imageLayout: 'oben links: nativ nearest · oben rechts: Komposit nearest · unten links: Komposit + B-Spline (heute) · unten rechts: nativ + Catmull-Rom geklemmt (HD)' };
writeFileSync(join(OUT, 'diag-grid.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
