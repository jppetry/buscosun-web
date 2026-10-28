/**
 * Phase NC (`audit/radar-nowcast-dach.md` §4) — the pure arithmetic of the two nowcast products:
 *
 *   · `flowFromSeries`  motion of a series of analyses (Horn–Schunck per consecutive pair on the coarsened frames — the map's
 *                       HD-4 recipe, `estimateMorphFlow` — averaged with weights rising towards the newest pair);
 *   · `advectPlane`     the newest analysis shifted semi-Lagrangian by k steps along that motion (CH extrapolation), with the
 *                       UNKNOWN mask: a pixel whose back-trajectory starts outside the grid is not "dry" but unknown;
 *   · `betweenPlanes`   the in-between picture between two frames along the motion (INCA refined to 5 min): both frames
 *                       advected towards the middle, mixed — the CPU twin of the shader's morph (`RainLayer`, `morphAt`).
 *
 * Sampling rule everywhere `wet-bilinear-round` (Phase RS edge rule): the four neighbours vote wet/dry with their bilinear
 * weights, the pixel is wet when the wet share is ≥ ½, and its value is the bilinear mean over the WET neighbours only — no
 * invented light rain at an edge, no value below the measured minimum. The v1 byte and the log byte share one wet mask, so
 * both planes are shifted with the same weights and stay consistent.
 *
 * Pure, DOM-free: producer (`radar-derive.mjs`), verifier and (if ever needed) the client run the same code.
 */

import { estimateMorphFlow } from '../scalar/radarMorphFlow';
import type { RainFlow } from '../scalar/RainLayer';
import type { NcMotion } from './radarNowcastImg';

/** Zero motion on the coarse grid of a `w × h` frame (persistence). */
export function zeroFlow(w: number, h: number, factor: number): RainFlow {
  const W = Math.max(1, Math.ceil(w / factor)), H = Math.max(1, Math.ceil(h / factor));
  return { u: new Float32Array(W * H), v: new Float32Array(W * H), w: W, h: H };
}

/**
 * Motion of a series of frames (ascending in time, equal spacing): the weighted mean of the pair flows A_i → A_{i+1}
 * (weights 1, 2, … towards the newest pair). A pair where either frame is dry everywhere carries nothing and is skipped.
 * Fewer than two frames ⇒ zero flow (`pairs: 0`).
 */
export function flowFromSeries(frames: readonly Uint8Array[], w: number, h: number, factor: number): { flow: RainFlow; pairs: number } {
  const flow = zeroFlow(w, h, factor);
  let wsum = 0, pairs = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i], b = frames[i + 1];
    if (!anyWet(a) || !anyWet(b)) continue;
    const f = estimateMorphFlow(a, b, w, h, factor);
    if (f.w !== flow.w || f.h !== flow.h) throw new Error(`flowFromSeries: coarse grid ${f.w}×${f.h} ≠ ${flow.w}×${flow.h}`);
    const wt = i + 1;
    for (let k = 0; k < flow.u.length; k++) { flow.u[k] += wt * f.u[k]; flow.v[k] += wt * f.v[k]; }
    wsum += wt; pairs++;
  }
  if (wsum > 0) for (let k = 0; k < flow.u.length; k++) { flow.u[k] /= wsum; flow.v[k] /= wsum; }
  return { flow, pairs };
}

function anyWet(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i]) return true;
  return false;
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
 * where the back-trajectory starts outside the grid (the value there is 0). Returns the number of unknown pixels.
 */
export function advectPlane(plane: Uint8Array, w: number, h: number, flow: RainFlow, k: number, out: Uint8Array, unknown?: Uint8Array): number {
  const d = new Float64Array(2), share = new Float64Array(1);
  let nUnknown = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    flowAt(flow, x, y, w, h, d);
    const sx = x + 0.5 - k * d[0], sy = y + 0.5 - k * d[1];
    if (sx < 0 || sy < 0 || sx > w || sy > h) { out[i] = 0; if (unknown) unknown[i] = 255; nUnknown++; continue; }
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
