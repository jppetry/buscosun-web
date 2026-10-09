/**
 * rainEdgeAlgebra.mjs — Node replica of the `RainLayer` fragment shader's value algebra (HD-2 filters, HD-4 morph mix, Phase RS
 * edge rule), shared by `verify-radar-edge.mjs` and the browser oracle `radar-hd-pixelcheck.mjs`.
 *
 * Coordinates: `px, py` in texel units (texel ij covers [i, i+1) × [j, j+1), centre i + ½). Values are bytes / 255 as the
 * LUMINANCE texture returns them; CLAMP_TO_EDGE at the grid border. Returns the value `t` the shader colours, or 0 where the
 * shader discards (the old path discards `t < 0.002`, the edge rule discards a dry decision).
 */
export const WET = 0.5 / 255;
export const DISCARD_BELOW = 0.002;

export const catmullW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
export const bsplineW = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 3 * t2 - 3 * t + 1) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6]; };

export function texelReader(values, W, H) {
  return (x, y) => values[(y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x < 0 ? 0 : x >= W ? W - 1 : x)] / 255;
}

/** The path before Phase RS (`sampleAny`): filter on the raw bytes. */
export function sampleOld(at, px, py, filter) {
  if (filter === 'nearest') return at(Math.floor(px), Math.floor(py));
  const x = px - 0.5, y = py - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  if (filter === 'bilinear') return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  const wf = filter === 'catmull' ? catmullW : bsplineW;
  const wx = wf(fx), wy = wf(fy);
  let s = 0, lo = 1, hi = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const t = at(ix + i - 1, iy + j - 1); s += wx[i] * wy[j] * t;
    if (i >= 1 && i <= 2 && j >= 1 && j <= 2) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  }
  return filter === 'catmull' ? Math.min(hi, Math.max(lo, s)) : s;
}

/** Phase RS `sampleWet`: value with dry texels replaced by the wet fill, and the wet share `ind`. */
export function sampleWet(at, px, py, filter, edge) {
  const x = px - 0.5, y = py - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const v = [at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)];
  const bw = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let iw = 0, fs = 0, lo = 1, hi = 0;
  for (let k = 0; k < 4; k++) if (v[k] >= WET) { iw += bw[k]; fs += bw[k] * v[k]; lo = Math.min(lo, v[k]); hi = Math.max(hi, v[k]); }
  const own = at(Math.floor(px), Math.floor(py));
  const ind = edge === 'nearest' ? (own >= WET ? 1 : 0) : iw;
  if (iw <= 0) return { t: 0, ind };
  if (filter === 'nearest') return { t: own, ind };
  const fill = fs / iw;
  if (filter === 'bilinear') return { t: fill, ind };
  const wf = filter === 'catmull' ? catmullW : bsplineW;
  const wx = wf(fx), wy = wf(fy);
  let s = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const t = at(ix + i - 1, iy + j - 1); s += wx[i] * wy[j] * (t >= WET ? t : fill); }
  return { t: filter === 'catmull' ? Math.min(hi, Math.max(lo, s)) : Math.max(0, s), ind };
}

/** One frame (no morph): the shader's `t`, 0 where it discards. `edge` = 'off' | 'round' | 'nearest'. */
export function shade(at, px, py, filter, edge = 'off') {
  if (edge === 'off') { const t = sampleOld(at, px, py, filter); return t < DISCARD_BELOW ? 0 : t; }
  const r = sampleWet(at, px, py, filter, edge);
  return r.ind < 0.5 || r.t < DISCARD_BELOW ? 0 : r.t;
}

/** Morph without displacement (flow 0): A and B at the same point, mixed by `frac`. */
export function shadeMorph(atA, atB, px, py, filter, edge, frac) {
  if (edge === 'off') { const t = sampleOld(atA, px, py, filter) * (1 - frac) + sampleOld(atB, px, py, filter) * frac; return t < DISCARD_BELOW ? 0 : t; }
  const a = sampleWet(atA, px, py, filter, edge), b = sampleWet(atB, px, py, filter, edge);
  if (a.ind * (1 - frac) + b.ind * frac < 0.5) return 0;
  const t = a.t > 0 && b.t > 0 ? a.t * (1 - frac) + b.t * frac : Math.max(a.t, b.t);
  return t < DISCARD_BELOW ? 0 : t;
}
