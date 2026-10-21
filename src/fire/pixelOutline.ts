/**
 * Outer edge of a set of FIRMS pixel rectangles — for the history dossier ("Karte · markiert"
 * and the satellite frame), where only the outline of the burnt area should be drawn.
 *
 * The rectangles are rasterised on a fine metric grid (≤ 800 cells per axis, ≥ 25 m), gaps
 * narrower than `2 × gapKm` between neighbouring pixels (different overpasses never line up
 * exactly) are closed morphologically, holes are filled, and the boundary of each remaining
 * region is traced as ONE outer ring. Edges move by at most half a grid cell.
 *
 * Pure, DOM-free.
 */

export interface LonLatRect { w: number; s: number; e: number; n: number }

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;
const MAX_CELLS = 800;
const MIN_CELL_M = 25;

/** MultiPolygon coordinates [polygon][ring][point] = [lon, lat], one outer ring per polygon, no holes. */
export function outerOutline(rects: readonly LonLatRect[], gapKm = 0.15): number[][][][] {
  if (rects.length === 0) return [];
  let lat0 = 0; let lon0 = 0;
  for (const r of rects) { lat0 += (r.s + r.n) / 2; lon0 += (r.w + r.e) / 2; }
  lat0 /= rects.length; lon0 /= rects.length;
  const kx = M_PER_DEG_LON * Math.cos((lat0 * Math.PI) / 180);
  const toX = (lon: number) => (lon - lon0) * kx;
  const toY = (lat: number) => (lat - lat0) * M_PER_DEG_LAT;

  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, toX(r.w)); x1 = Math.max(x1, toX(r.e));
    y0 = Math.min(y0, toY(r.s)); y1 = Math.max(y1, toY(r.n));
  }
  const gapM = gapKm * 1000;
  const cell = Math.max(MIN_CELL_M, (Math.max(x1 - x0, y1 - y0) + 2 * gapM) / MAX_CELLS);
  const k = Math.max(1, Math.ceil(gapM / cell));
  const margin = k + 2;
  const ox = x0 - margin * cell; const oy = y0 - margin * cell;
  const nx = Math.ceil((x1 - x0) / cell) + 2 * margin + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 2 * margin + 1;

  // Rasterise: a cell is covered when its centre lies in a rectangle (at least one cell per rectangle).
  let grid = new Uint8Array(nx * ny);
  for (const r of rects) {
    const fx0 = (toX(r.w) - ox) / cell - 0.5; const fx1 = (toX(r.e) - ox) / cell - 0.5;
    const fy0 = (toY(r.s) - oy) / cell - 0.5; const fy1 = (toY(r.n) - oy) / cell - 0.5;
    let i0 = Math.ceil(fx0); let i1 = Math.floor(fx1);
    let j0 = Math.ceil(fy0); let j1 = Math.floor(fy1);
    if (i1 < i0) i0 = i1 = Math.round((fx0 + fx1) / 2);
    if (j1 < j0) j0 = j1 = Math.round((fy0 + fy1) / 2);
    for (let j = j0; j <= j1; j++) grid.fill(1, j * nx + i0, j * nx + i1 + 1);
  }

  // Closing (dilate, then erode) with a square of radius k — separable, via running counts.
  const pass = (src: Uint8Array, horizontal: boolean, erode: boolean): Uint8Array => {
    const out = new Uint8Array(nx * ny);
    const len = horizontal ? nx : ny; const lines = horizontal ? ny : nx;
    const at = (line: number, p: number) => (horizontal ? line * nx + p : p * nx + line);
    const win = 2 * k + 1;
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let p = 0; p <= Math.min(k, len - 1); p++) sum += src[at(line, p)];
      for (let p = 0; p < len; p++) {
        out[at(line, p)] = erode ? (sum === win ? 1 : 0) : (sum > 0 ? 1 : 0);
        const add = p + k + 1; const drop = p - k;
        if (add < len) sum += src[at(line, add)];
        if (drop >= 0) sum -= src[at(line, drop)];
      }
    }
    return out;
  };
  grid = pass(pass(grid, true, false), false, false);
  grid = pass(pass(grid, true, true), false, true);

  // Fill holes: every empty cell not reachable from the border (4-neighbourhood) becomes covered.
  const outside = new Uint8Array(nx * ny);
  const stack: number[] = [];
  const seed = (i: number) => { if (!grid[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let i = 0; i < nx; i++) { seed(i); seed((ny - 1) * nx + i); }
  for (let j = 0; j < ny; j++) { seed(j * nx); seed(j * nx + nx - 1); }
  while (stack.length) {
    const c = stack.pop()!;
    const i = c % nx; const j = (c - i) / nx;
    if (i > 0) seed(c - 1);
    if (i < nx - 1) seed(c + 1);
    if (j > 0) seed(c - nx);
    if (j < ny - 1) seed(c + nx);
  }
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !outside[j * nx + i];

  // Boundary edges, counter-clockwise (interior on the left); vertex id = j * (nx + 1) + i.
  const vx = nx + 1;
  const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1]; // east, north, west, south
  const out = new Map<number, number[]>(); // start vertex → directions
  const addEdge = (i: number, j: number, d: number) => {
    const v = j * vx + i; const list = out.get(v);
    if (list) list.push(d); else out.set(v, [d]);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) addEdge(i, j, 0);
      if (!filled(i + 1, j)) addEdge(i + 1, j, 1);
      if (!filled(i, j + 1)) addEdge(i + 1, j + 1, 2);
      if (!filled(i - 1, j)) addEdge(i, j + 1, 3);
    }
  }

  const polys: number[][][][] = [];
  const take = (v: number, d: number): boolean => {
    const list = out.get(v); const idx = list ? list.indexOf(d) : -1;
    if (idx < 0) return false;
    list!.splice(idx, 1);
    if (list!.length === 0) out.delete(v);
    return true;
  };
  for (;;) {
    const first = out.entries().next();
    if (first.done) break;
    const [start, dirs] = first.value;
    let d = dirs[0];
    take(start, d);
    let i = start % vx; let j = (start - i) / vx;
    const corners: number[][] = [[i, j]];
    for (let guard = 0; guard < 4 * nx * ny; guard++) {
      i += DX[d]; j += DY[d];
      const v = j * vx + i;
      if (v === start && !out.has(v)) break;
      // Left turn first: hugs the interior, so regions touching only at a corner stay separate rings.
      const next = [(d + 1) % 4, d, (d + 3) % 4].find((c) => take(v, c));
      if (next === undefined) break;
      if (next !== d) corners.push([i, j]);
      d = next;
    }
    if (corners.length < 4) continue;
    const ring = corners.map(([ci, cj]) => [lon0 + (ox + ci * cell) / kx, lat0 + (oy + cj * cell) / M_PER_DEG_LAT]);
    ring.push([...ring[0]]);
    polys.push([ring]);
  }
  return polys;
}
