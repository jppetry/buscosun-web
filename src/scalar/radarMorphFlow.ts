/**
 * Phase HD-4 — motion field between two radar frames for the in-between pictures of the Regenradar profile
 * (`audit/radar-hochaufloesung.md` §5). Horn–Schunck on the coarsened frames (the flow nowcast's recipe, `MapView`
 * FLOW_FACTOR/`estimateFlowHS`), scaled back to NATIVE texels per frame interval — what `RainLayer.setMorph` expects.
 *
 * Pure and worker-safe (`precipIndexWorker`, op `flow`); the main thread runs the same code as the fallback.
 */

import { coarsenFrameU8 } from '../ml/coarsen';
import { estimateFlowHS } from '../ml/opticalFlowNowcast';
import { RADAR_MORPH_HS, RADAR_MORPH_MAX_TEXELS } from './radarHd';
import type { RainFlow } from './RainLayer';

/** Flow A → B on the `factor`-coarsened grid, in native texels per interval (clamped to ±`RADAR_MORPH_MAX_TEXELS`). */
export function estimateMorphFlow(a: Uint8Array, b: Uint8Array, w: number, h: number, factor: number): RainFlow {
  const ca = coarsenFrameU8(a, w, h, factor);
  const cb = coarsenFrameU8(b, w, h, factor);
  const f = estimateFlowHS(ca.data, cb.data, ca.W, ca.H, { alpha: RADAR_MORPH_HS.alpha, iters: RADAR_MORPH_HS.iters });
  const u = new Float32Array(f.u.length), v = new Float32Array(f.v.length);
  const M = RADAR_MORPH_MAX_TEXELS;
  for (let i = 0; i < u.length; i++) {
    const x = f.u[i] * factor, y = f.v[i] * factor;
    u[i] = x < -M ? -M : x > M ? M : x;
    v[i] = y < -M ? -M : y > M ? M : y;
  }
  return { u, v, w: f.w, h: f.h };
}

/**
 * The shader's morph, emulated on the CPU for the verifier (bilinear = filter code 2): value at texel centre (x, y) of
 * the in-between picture `frac` of the way from A to B. Flow sampled bilinearly on its coarse grid at the same uv.
 */
export function morphAt(a: Uint8Array, b: Uint8Array, w: number, h: number, flow: RainFlow, frac: number, x: number, y: number): number {
  const clampI = (k: number, n: number) => (k < 0 ? 0 : k >= n ? n - 1 : k);
  const bil = (arr: ArrayLike<number>, W: number, H: number, px: number, py: number) => {
    const cx = px - 0.5, cy = py - 0.5;
    const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0;
    const at = (xx: number, yy: number) => arr[clampI(yy, H) * W + clampI(xx, W)];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const u = (x + 0.5) / w, v = (y + 0.5) / h;
  const du = bil(flow.u, flow.w, flow.h, u * flow.w, v * flow.h);
  const dv = bil(flow.v, flow.w, flow.h, u * flow.w, v * flow.h);
  const ta = bil(a, w, h, (u * w) - frac * du, (v * h) - frac * dv);
  const tb = bil(b, w, h, (u * w) + (1 - frac) * du, (v * h) + (1 - frac) * dv);
  return (ta * (1 - frac) + tb * frac) / 255;
}
