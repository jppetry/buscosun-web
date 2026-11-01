/**
 * Phase NC (`audit/radar-nowcast-dach.md` §4) — the pure arithmetic of the two nowcast products:
 *
 *   · `flowFromSeries`  motion of a series of analyses: ONE translation per consecutive pair (`translationBetween` — the shift
 *                       of the coarsened frames with the largest correlation, refined to a fraction of a texel), averaged with
 *                       weights rising towards the newest pair and laid over the WHOLE grid as a constant field;
 *   · `flowFromSeriesRegional`  the same per 2 × 2 region of the frame, blended bilinearly between the region centres
 *                       (01.11.2026; built and OFF — `RADAR_NC_FLOW=regional` in the producer; no gain measured yet);
 *   · `advectPlane`     the newest analysis shifted semi-Lagrangian by k steps along that motion (CH extrapolation), with the
 *                       UNKNOWN mask: a pixel whose back-trajectory starts outside the grid — or beyond the radars' range
 *                       (`rangeUnknownMask`, 01.11.2026) — is not "dry" but unknown;
 *   · `betweenPlanes`   the in-between picture between two frames along the motion (INCA refined to 5 min): both frames
 *                       advected towards the middle, mixed — the CPU twin of the shader's morph (`RainLayer`, `morphAt`).
 *
 * Why a translation and not the Horn–Schunck field of the map's morph (V-NC-7, measured 28.10.2026 on translated Gaussian
 * blobs, `audit/radar-nowcast-dach.md` §6): the local field is non-zero only where the echo IS — a target pixel 20 km ahead
 * of the rain has no flow, its back-trajectory never reaches the echo, and the extrapolation STALLED after a few steps
 * (centroid +13 … +35 px after 24 steps instead of +24 … +192); the regularised speed was 15–50 % too small as well. The
 * brief asks for one motion ("die Zugrichtung") — the correlation shift recovers a pure translation exactly (`verify:radar-nc`
 * C6: speed and centroid within 10 %). The Horn–Schunck estimate stays what it is for the map's morph and the INCA
 * in-between pictures (shape halfway, not a forecast).
 *
 * Sampling rule everywhere `wet-bilinear-round` (Phase RS edge rule): the four neighbours vote wet/dry with their bilinear
 * weights, the pixel is wet when the wet share is ≥ ½, and its value is the bilinear mean over the WET neighbours only — no
 * invented light rain at an edge, no value below the measured minimum. The v1 byte and the log byte share one wet mask, so
 * both planes are shifted with the same weights and stay consistent.
 *
 * Pure, DOM-free: producer (`radar-derive.mjs`), verifier and (if ever needed) the client run the same code.
 */

import type { RainFlow } from '../scalar/RainLayer';
import type { NcMotion } from './radarNowcastImg';

/** Zero motion on the coarse grid of a `w × h` frame (persistence). */
export function zeroFlow(w: number, h: number, factor: number): RainFlow {
  const W = Math.max(1, Math.ceil(w / factor)), H = Math.max(1, Math.ceil(h / factor));
  return { u: new Float32Array(W * H), v: new Float32Array(W * H), w: W, h: H };
}

/** Farthest shift searched per pair, in coarse texels (6 × 4 km per 5 min ≈ 290 km/h — beyond any rain band). */
export const NC_TRANSLATION_MAX_COARSE = 6;
/** Fewer wet coarse cells than this in either frame ⇒ no measurable motion for the pair. */
export const NC_TRANSLATION_MIN_CELLS = 12;

/** Mean of the native bytes per coarse cell (`factor × factor`), as Float32 — the frame the shift is measured on. */
function coarsen(a: Uint8Array, w: number, h: number, factor: number): { c: Float32Array; W: number; H: number; wet: number } {
  const W = Math.max(1, Math.ceil(w / factor)), H = Math.max(1, Math.ceil(h / factor));
  const c = new Float32Array(W * H), n = new Uint16Array(W * H);
  for (let y = 0; y < h; y++) { const cy = Math.floor(y / factor); for (let x = 0; x < w; x++) { const k = cy * W + Math.floor(x / factor); c[k] += a[y * w + x]; n[k]++; } }
  let wet = 0;
  for (let k = 0; k < c.length; k++) { c[k] = n[k] ? c[k] / n[k] : 0; if (c[k] > 0) wet++; }
  return { c, W, H, wet };
}

/**
 * The ONE translation A → B in native texels per interval: the integer shift of the coarsened frames (`factor`) with the
 * largest normalised cross-correlation within ± `maxCoarse` texels, refined to a fraction of a texel by a parabola through
 * the three scores around the maximum (per axis). `null` when either frame has fewer than `NC_TRANSLATION_MIN_CELLS` wet
 * coarse cells or no shift correlates at all. Exact for a pure translation (`verify:radar-nc` C6); a field that grows or
 * decays at the place gives the shift of what moves.
 */
export function translationBetween(a: Uint8Array, b: Uint8Array, w: number, h: number, factor: number, maxCoarse: number = NC_TRANSLATION_MAX_COARSE, minCells: number = NC_TRANSLATION_MIN_CELLS): { u: number; v: number; score: number } | null {
  const A = coarsen(a, w, h, factor), B = coarsen(b, w, h, factor);
  if (A.wet < minCells || B.wet < minCells) return null;
  return bestShift(A.c, B.c, A.W, A.H, factor, maxCoarse);
}

/** Normalised cross-correlation of B(x + dx, y + dy) against A(x, y) over the overlap of two coarse frames (0 without energy). */
function nccAtShift(a: Float32Array, b: Float32Array, W: number, H: number, dx: number, dy: number): number {
  let sab = 0, saa = 0, sbb = 0;
  const y0 = Math.max(0, -dy), y1 = Math.min(H, H - dy), x0 = Math.max(0, -dx), x1 = Math.min(W, W - dx);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const va = a[y * W + x], vb = b[(y + dy) * W + x + dx];
    sab += va * vb; saa += va * va; sbb += vb * vb;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * The shift of two coarse frames with the largest correlation within ± `maxCoarse`; an exact tie goes to the SMALLER shift
 * (a field without structure along one axis — a band across the whole window — must not jump to the window's edge).
 */
function bestShift(a: Float32Array, b: Float32Array, W: number, H: number, factor: number, maxCoarse: number): { u: number; v: number; score: number } | null {
  const R = maxCoarse, S = 2 * R + 1;
  const scores = new Float64Array(S * S);
  let best = -1, bi = 0, bestD = Infinity;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const s = nccAtShift(a, b, W, H, dx, dy);
    const i = (dy + R) * S + dx + R;
    scores[i] = s;
    const d = dx * dx + dy * dy;
    if (s > best + 1e-9 || (Math.abs(s - best) <= 1e-9 && d < bestD)) { best = s; bi = i; bestD = d; }
  }
  if (!(best > 0)) return null;
  const by = Math.floor(bi / S) - R, bx = (bi % S) - R;
  // parabolic sub-texel refinement per axis (only strictly inside the search window)
  const sub = (m: number, p: number, n: number) => { const d = m - 2 * p + n; return d < 0 ? Math.max(-0.5, Math.min(0.5, (m - n) / (2 * d))) : 0; };
  const fx = bx > -R && bx < R ? sub(scores[bi - 1], best, scores[bi + 1]) : 0;
  const fy = by > -R && by < R ? sub(scores[bi - S], best, scores[bi + S]) : 0;
  return { u: (bx + fx) * factor, v: (by + fy) * factor, score: best };
}

/**
 * Motion of a series of frames (ascending in time, equal spacing): the weighted mean of the pair translations A_i → A_{i+1}
 * (weights 1, 2, … towards the newest pair), laid over the whole coarse grid as a constant field — so every back-trajectory
 * finds the motion, wherever the rain will be. A pair without measurable motion (dry, or fewer than
 * `NC_TRANSLATION_MIN_CELLS` wet coarse cells) carries nothing and is skipped. Fewer than two usable frames ⇒ zero flow
 * (`pairs: 0`, persistence).
 */
export function flowFromSeries(frames: readonly Uint8Array[], w: number, h: number, factor: number): { flow: RainFlow; pairs: number } {
  const flow = zeroFlow(w, h, factor);
  let wsum = 0, pairs = 0, su = 0, sv = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const t = translationBetween(frames[i], frames[i + 1], w, h, factor);
    if (!t) continue;
    const wt = i + 1;
    su += wt * t.u; sv += wt * t.v; wsum += wt; pairs++;
  }
  if (wsum > 0) { flow.u.fill(su / wsum); flow.v.fill(sv / wsum); }
  return { flow, pairs };
}

/** Regions per axis of the regional motion (2 ⇒ 2 × 2 quarters; on the rzc grid the split runs along the main Alpine ridge). */
export const NC_REGION_GRID = 2;
/** A region's pair needs at least this many wet coarse cells (40 × 16 km² = 640 km²) — a smaller patch correlates by chance. */
export const NC_REGION_MIN_CELLS = 40;
/** A region's pair counts only when its best correlation reaches this (a pure translation scores 1; noise ≈ 0,2). */
export const NC_REGION_MIN_SCORE = 0.5;
/**
 * … and the region's vector, run over the whole series span (first → last frame, 2–5 steps), must explain its window by at
 * least this much more correlation than the whole-frame vector does. Checked over the span, not per pair: at 5 min and 4-km
 * cells a pair's shift is a fraction of a texel (30 km/h = 0,6 texel) and the correlation surface is flat around it.
 */
export const NC_REGION_MIN_GAIN = 0.02;

/** The `x0 … x1 × y0 … y1` window of `plane` as its own plane. */
function crop(plane: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): Uint8Array {
  const cw = x1 - x0, out = new Uint8Array(cw * (y1 - y0));
  for (let y = y0; y < y1; y++) out.set(plane.subarray(y * w + x0, y * w + x1), (y - y0) * cw);
  return out;
}

/**
 * Motion of a series with ONE translation per REGION (`grid × grid` windows of the frame), 01.11.2026 (Jan: the one vector for
 * 710 × 640 km missed that the north and the south side of the Alps often move differently). OFF in the producer until a day
 * with such motion has been measured (the uniform drizzle of 01.11.2026 showed no gain, see `radar-derive.mjs`). Each region measures its own
 * pair shifts on its window (same correlation as `translationBetween`, stricter: `NC_REGION_MIN_CELLS` wet cells and a score
 * ≥ `NC_REGION_MIN_SCORE`, else the pair carries nothing), and keeps the result only when it explains the window over the
 * whole series span by `NC_REGION_MIN_GAIN` more correlation than the whole-frame vector does; otherwise the region takes
 * the whole-frame motion of `flowFromSeries`. The coarse field is the bilinear blend between the region centres (clamped outside them), so
 * the flow is continuous and everywhere a convex mix of the measured vectors — no new speeds, no stall. For a pure translation
 * every region scores like the whole frame and the field equals the global one. `regions` = how many carried their own vector.
 */
export function flowFromSeriesRegional(frames: readonly Uint8Array[], w: number, h: number, factor: number, grid: number = NC_REGION_GRID): { flow: RainFlow; pairs: number; regions: number; vectors: { u: number; v: number; own: boolean }[] } {
  const global = flowFromSeries(frames, w, h, factor);
  if (grid < 2) return { ...global, regions: 0, vectors: [] };
  const gu = global.flow.u[0] ?? 0, gv = global.flow.v[0] ?? 0;
  const vectors: { u: number; v: number; own: boolean }[] = [];
  let regions = 0;
  const n = frames.length;
  for (let ry = 0; ry < grid; ry++) for (let rx = 0; rx < grid; rx++) {
    const x0 = Math.floor((rx * w) / grid), x1 = Math.floor(((rx + 1) * w) / grid);
    const y0 = Math.floor((ry * h) / grid), y1 = Math.floor(((ry + 1) * h) / grid);
    const cw = x1 - x0, ch = y1 - y0;
    const coarse = frames.map((f) => coarsen(crop(f, w, x0, x1, y0, y1), cw, ch, factor));
    let su = 0, sv = 0, wsum = 0;
    for (let i = 0; i + 1 < n; i++) {
      const A = coarse[i], B = coarse[i + 1];
      if (A.wet < NC_REGION_MIN_CELLS || B.wet < NC_REGION_MIN_CELLS) continue;
      const t = bestShift(A.c, B.c, A.W, A.H, factor, NC_TRANSLATION_MAX_COARSE);
      if (!t || t.score < NC_REGION_MIN_SCORE) continue;
      const wt = i + 1;
      su += wt * t.u; sv += wt * t.v; wsum += wt;
    }
    let own = false;
    if (wsum > 0 && n >= 3) {
      // over the series span: does the region's vector explain its window better than the whole-frame vector?
      const ru = su / wsum, rv = sv / wsum, A = coarse[0], B = coarse[n - 1], k = n - 1;
      if (A.wet >= NC_REGION_MIN_CELLS && B.wet >= NC_REGION_MIN_CELLS) {
        const sr = nccAtShift(A.c, B.c, A.W, A.H, Math.round((k * ru) / factor), Math.round((k * rv) / factor));
        const sg = nccAtShift(A.c, B.c, A.W, A.H, Math.round((k * gu) / factor), Math.round((k * gv) / factor));
        own = sr >= sg + NC_REGION_MIN_GAIN;
      }
    }
    if (own) { vectors.push({ u: su / wsum, v: sv / wsum, own: true }); regions++; }
    else vectors.push({ u: gu, v: gv, own: false });
  }
  const flow = zeroFlow(w, h, factor);
  if (regions === 0) return { flow: global.flow, pairs: global.pairs, regions, vectors };
  for (let cy = 0; cy < flow.h; cy++) {
    // region coordinate of the coarse cell centre: 0 at the first region's centre, grid − 1 at the last one's
    const py = Math.min(grid - 1, Math.max(0, ((cy + 0.5) / flow.h) * grid - 0.5));
    const y0 = Math.min(grid - 2, Math.floor(py)), ty = py - y0;
    for (let cx = 0; cx < flow.w; cx++) {
      const px = Math.min(grid - 1, Math.max(0, ((cx + 0.5) / flow.w) * grid - 0.5));
      const x0 = Math.min(grid - 2, Math.floor(px)), tx = px - x0;
      const a = vectors[y0 * grid + x0], b = vectors[y0 * grid + x0 + 1], c = vectors[(y0 + 1) * grid + x0], d = vectors[(y0 + 1) * grid + x0 + 1];
      const k = cy * flow.w + cx;
      flow.u[k] = (a.u * (1 - tx) + b.u * tx) * (1 - ty) + (c.u * (1 - tx) + d.u * tx) * ty;
      flow.v[k] = (a.v * (1 - tx) + b.v * tx) * (1 - ty) + (c.v * (1 - tx) + d.v * tx) * ty;
    }
  }
  return { flow, pairs: global.pairs, regions, vectors };
}

/**
 * Source mask of what the radars can SEE: 255 for every pixel farther than `kmMax` from all `sites` (lat, lon). The composite
 * encodes such pixels as 0 = "dry", but they were never measured — the extrapolation treats them as UNKNOWN (`advectPlane`,
 * `srcUnknown`). `lonLatAt(u, v)` maps grid fractions to [lon, lat] (the projected sampler of the grid).
 */
export function rangeUnknownMask(w: number, h: number, lonLatAt: (u: number, v: number) => [number, number], sites: readonly (readonly [number, number])[], kmMax: number): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(w * h);
  const R = 6371, rad = Math.PI / 180;
  const sc = sites.map(([lat, lon]) => ({ lat: lat * rad, lon: lon * rad, cos: Math.cos(lat * rad) }));
  let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [lon, lat] = lonLatAt((x + 0.5) / w, (y + 0.5) / h);
    const la = lat * rad, lo = lon * rad, cl = Math.cos(la);
    let seen = false;
    for (const s of sc) {
      const sa = Math.sin((la - s.lat) / 2), sb = Math.sin((lo - s.lon) / 2);
      const d = 2 * R * Math.asin(Math.sqrt(sa * sa + s.cos * cl * sb * sb));
      if (d <= kmMax) { seen = true; break; }
    }
    if (!seen) { mask[y * w + x] = 255; count++; }
  }
  return { mask, count };
}

/**
 * Mean motion over the coarse cells that are wet in `newest` (km/h at 1 km per texel and `stepMin` per step; the direction
 * the rain comes FROM, ° meteorological, north-up grid: v > 0 moves south). `fromDeg` null without a wet cell.
 */
export function motionStats(flow: RainFlow, newest: Uint8Array, w: number, h: number, stepMin: number, pairs: number): NcMotion {
  let su = 0, sv = 0, n = 0;
  const cw = w / flow.w, ch = h / flow.h;
  for (let cy = 0; cy < flow.h; cy++) for (let cx = 0; cx < flow.w; cx++) {
    // the coarse cell is wet when any native pixel in it is wet
    let wet = false;
    const x0 = Math.floor(cx * cw), x1 = Math.min(w, Math.ceil((cx + 1) * cw));
    const y0 = Math.floor(cy * ch), y1 = Math.min(h, Math.ceil((cy + 1) * ch));
    for (let y = y0; y < y1 && !wet; y++) for (let x = x0; x < x1; x++) if (newest[y * w + x]) { wet = true; break; }
    if (!wet) continue;
    const k = cy * flow.w + cx;
    su += flow.u[k]; sv += flow.v[k]; n++;
  }
  if (!n) return { speedKmh: 0, fromDeg: null, pairs, wetCells: 0 };
  const mu = su / n, mv = sv / n;
  const speedKmh = Math.hypot(mu, mv) * (60 / stepMin);
  const toDeg = (Math.atan2(mu, -mv) * 180) / Math.PI;      // 0 = north (up), 90 = east
  const fromDeg = ((toDeg + 180) % 360 + 360) % 360;
  return { speedKmh: Math.round(speedKmh * 10) / 10, fromDeg: speedKmh > 0.05 ? Math.round(fromDeg) : null, pairs, wetCells: n };
}

/** Flow (native texels per step) at the pixel centre (x + ½, y + ½), bilinear on the coarse grid. */
function flowAt(flow: RainFlow, x: number, y: number, w: number, h: number, out: Float64Array): void {
  const fx = ((x + 0.5) / w) * flow.w - 0.5, fy = ((y + 0.5) / h) * flow.h - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const cx0 = clampI(x0, flow.w), cx1 = clampI(x0 + 1, flow.w), cy0 = clampI(y0, flow.h), cy1 = clampI(y0 + 1, flow.h);
  const i00 = cy0 * flow.w + cx0, i10 = cy0 * flow.w + cx1, i01 = cy1 * flow.w + cx0, i11 = cy1 * flow.w + cx1;
  out[0] = (flow.u[i00] * (1 - tx) + flow.u[i10] * tx) * (1 - ty) + (flow.u[i01] * (1 - tx) + flow.u[i11] * tx) * ty;
  out[1] = (flow.v[i00] * (1 - tx) + flow.v[i10] * tx) * (1 - ty) + (flow.v[i01] * (1 - tx) + flow.v[i11] * tx) * ty;
}

const clampI = (k: number, n: number) => (k < 0 ? 0 : k >= n ? n - 1 : k);

/**
 * `wet-bilinear-round` sample of `plane` at pixel-centre coordinates (sx, sy): returns the wet share in `share[0]` and the
 * value (mean over the wet neighbours, ≥ 1) — 0 when the share is < ½. Indices clamp at the border (the caller decides
 * what lies outside the grid).
 */
function sampleWet(plane: Uint8Array, w: number, h: number, sx: number, sy: number, share: Float64Array): number {
  const gx = sx - 0.5, gy = sy - 0.5;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const xa = clampI(x0, w), xb = clampI(x0 + 1, w), ya = clampI(y0, h), yb = clampI(y0 + 1, h);
  const v00 = plane[ya * w + xa], v10 = plane[ya * w + xb], v01 = plane[yb * w + xa], v11 = plane[yb * w + xb];
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  const iw = (v00 ? w00 : 0) + (v10 ? w10 : 0) + (v01 ? w01 : 0) + (v11 ? w11 : 0);
  share[0] = iw;
  if (iw < 0.5) return 0;
  const s = (v00 ? w00 * v00 : 0) + (v10 ? w10 * v10 : 0) + (v01 ? w01 * v01 : 0) + (v11 ? w11 * v11 : 0);
  return Math.max(1, Math.min(255, Math.round(s / iw)));
}

/**
 * Shift `plane` by `k` steps along `flow` (backward semi-Lagrangian) into `out`; `unknown` (optional, same size) gets 255
 * where the back-trajectory starts outside the grid (the value there is 0) — or, with `srcUnknown` (255 = the source pixel
 * was never measured, `rangeUnknownMask`), where it starts on such a pixel. Returns the number of unknown pixels.
 */
export function advectPlane(plane: Uint8Array, w: number, h: number, flow: RainFlow, k: number, out: Uint8Array, unknown?: Uint8Array, srcUnknown?: Uint8Array): number {
  const d = new Float64Array(2), share = new Float64Array(1);
  let nUnknown = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    flowAt(flow, x, y, w, h, d);
    const sx = x + 0.5 - k * d[0], sy = y + 0.5 - k * d[1];
    if (sx < 0 || sy < 0 || sx > w || sy > h) { out[i] = 0; if (unknown) unknown[i] = 255; nUnknown++; continue; }
    if (srcUnknown && srcUnknown[clampI(Math.floor(sy), h) * w + clampI(Math.floor(sx), w)] === 255) { out[i] = 0; if (unknown) unknown[i] = 255; nUnknown++; continue; }
    if (unknown) unknown[i] = 0;
    out[i] = sampleWet(plane, w, h, sx, sy, share);
  }
  return nUnknown;
}

/**
 * In-between picture `frac` (0 … 1) of the way from `a` to `b` along `flow` (A → B per interval): A read at x − frac·d, B at
 * x + (1 − frac)·d; wet when the mixed wet share is ≥ ½; both wet ⇒ mix, one wet ⇒ that one (the shader's rule with the
 * edge rule). Written into `out`.
 */
export function betweenPlanes(a: Uint8Array, b: Uint8Array, w: number, h: number, flow: RainFlow, frac: number, out: Uint8Array): void {
  const d = new Float64Array(2), sa = new Float64Array(1), sb = new Float64Array(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    flowAt(flow, x, y, w, h, d);
    const ta = sampleWet(a, w, h, x + 0.5 - frac * d[0], y + 0.5 - frac * d[1], sa);
    const tb = sampleWet(b, w, h, x + 0.5 + (1 - frac) * d[0], y + 0.5 + (1 - frac) * d[1], sb);
    if (sa[0] * (1 - frac) + sb[0] * frac < 0.5) { out[i] = 0; continue; }
    out[i] = ta > 0 && tb > 0 ? Math.max(1, Math.round(ta * (1 - frac) + tb * frac)) : Math.max(ta, tb);
  }
}
