/**
 * gen-dach-mask.mjs — writes `public/countries/DACH.geojson`: the dissolved outline of DE ∪ AT ∪ CH ∪ LI for the map's
 * country mask (Phase LM, `audit/laendermaske.md`, E-LM-1).
 *
 * Why not the four rings as even–odd holes: the Nominatim outlines are simplified per country, so a shared border lies at
 * different places in the two files — every gap between two rings and every overlap of two rings became sand (≈ 69 km²
 * gaps, ≈ 22 km² overlaps, plus Liechtenstein and the Bodensee, which belong to no outline). The mask needs ONE outline
 * whose interior holes are filled.
 *
 * Method (no dependency, deterministic): scanline-rasterise the rings onto a CELL° grid (even–odd per country, union over
 * countries) → flood-fill the OUTSIDE from the grid border (everything unreachable is inside ⇒ lakes, seams and enclaves
 * are filled) → trace the boundary edges of the inside set into closed loops (inside on the left) → Douglas–Peucker with
 * TOL° → MultiPolygon of outer rings (islands stay separate rings; there are no holes by construction).
 *
 *   node scripts/gen-dach-mask.mjs [--cell=0.001] [--tol=0.002] [--check]
 *
 * `--check` regenerates into memory and exits 1 when the committed file differs (used by `verify:dach-mask`).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DACH_MASK_MEMBERS = Object.freeze(['DE', 'AT', 'CH', 'LI']);
export const DACH_MASK_FILE = 'public/countries/DACH.geojson';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.slice(k.length + 3)) : d; };
// 0,001° (≈ 70–110 m): at 0,002° the Vennbahn pockets (DE, ≈ 100 m wide) lost every cell centre (verify C1).
const CELL = arg('cell', 0.001);
const TOL = arg('tol', 0.002);
const CHECK = process.argv.includes('--check');

/** All rings ([lng,lat][]) of a country file. */
export function ringsOf(country, root = ROOT) {
  const f = JSON.parse(readFileSync(join(root, 'public', 'countries', `${country}.geojson`), 'utf8'));
  const g = f.geometry;
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flatMap((p) => p);
}

/** Douglas–Peucker on a closed ring (first == last), tolerance in degrees. */
function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  // closed ring: anchor a second point (the farthest from the start) so the whole ring cannot collapse onto one chord
  let far = 1, farD = -1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > farD) { farD = d; far = i; } }
  keep[far] = 1;
  const stack = [[0, far], [far, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/**
 * Build the dissolved outline. Returns { rings: [lng,lat][][] (outer rings, closed, inside on the left = CCW),
 * stats }. Pure given the ring sets.
 */
export function buildDachMask(countryRings, { cell = CELL, tol = TOL } = {}) {
  const allRings = Object.values(countryRings).flat();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of allRings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  // one empty cell of margin all round so the outside flood-fill is connected
  const ox = Math.floor(x0 / cell) - 2, oy = Math.floor(y0 / cell) - 2;
  const W = Math.ceil(x1 / cell) - ox + 3, H = Math.ceil(y1 / cell) - oy + 3;
  const inside = new Uint8Array(W * H);

  // scanline rasterisation, even–odd per country at the cell centre, union over countries
  for (const rings of Object.values(countryRings)) {
    const edges = [];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xa, ya] = r[i], [xb, yb] = r[j];
      if (ya === yb) continue;
      edges.push(ya < yb ? [xa, ya, xb, yb] : [xb, yb, xa, ya]);
    }
    edges.sort((a, b) => a[1] - b[1]);
    const xs = [];
    for (let row = 0; row < H; row++) {
      const lat = (oy + row + 0.5) * cell;
      xs.length = 0;
      for (const [xa, ya, xb, yb] of edges) {
        if (ya > lat) break;
        if (yb <= lat) continue;              // half-open: ya <= lat < yb
        xs.push(xa + ((xb - xa) * (lat - ya)) / (yb - ya));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // cells whose centre lies in [xs[k], xs[k+1])
        const c0 = Math.max(0, Math.ceil(xs[k] / cell - 0.5) - ox), c1 = Math.min(W - 1, Math.ceil(xs[k + 1] / cell - 0.5) - 1 - ox);
        for (let c = c0; c <= c1; c++) inside[row * W + c] = 1;
      }
    }
  }
  let unionCells = 0;
  for (let i = 0; i < inside.length; i++) unionCells += inside[i];

  // flood-fill the outside from the border (4-neighbourhood); whatever is not reached is inside (holes filled)
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (i) => { if (!outside[i] && !inside[i]) { outside[i] = 1; stack.push(i); } };
  for (let c = 0; c < W; c++) { push(c); push((H - 1) * W + c); }
  for (let r = 0; r < H; r++) { push(r * W); push(r * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), r = (i / W) | 0, c = i - r * W;
    if (c > 0) push(i - 1);
    if (c < W - 1) push(i + 1);
    if (r > 0) push(i - W);
    if (r < H - 1) push(i + W);
  }
  let filled = 0;
  for (let i = 0; i < inside.length; i++) if (!outside[i] && !inside[i]) { inside[i] = 1; filled++; }

  // boundary edges of the inside set, oriented with the inside on the left; keyed by start corner
  // corners are (c, r) grid-corner indices; cell (c, r) spans corners (c..c+1, r..r+1)
  const next = new Map();   // startKey -> [endC, endR]
  const key = (c, r) => c * (H + 1) + r;
  const at = (c, r) => (c < 0 || r < 0 || c >= W || r >= H) ? 0 : inside[r * W + c];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!inside[r * W + c]) continue;
    if (!at(c, r - 1)) next.set(key(c, r), [c + 1, r]);           // bottom edge, going east (inside above = left)
    if (!at(c + 1, r)) next.set(key(c + 1, r), [c + 1, r + 1]);   // right edge, going north
    if (!at(c, r + 1)) next.set(key(c + 1, r + 1), [c, r + 1]);   // top edge, going west
    if (!at(c - 1, r)) next.set(key(c, r + 1), [c, r]);           // left edge, going south
  }
  // A corner can be the start of two edges (diagonal touch); the map keeps the last one. Resolve by tracing with an
  // explicit turn preference: at each corner, prefer the edge that turns left (keeps loops simple). Rebuild as lists.
  const outs = new Map();
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!inside[r * W + c]) continue;
    const add = (k, e) => { const l = outs.get(k); if (l) l.push(e); else outs.set(k, [e]); };
    if (!at(c, r - 1)) add(key(c, r), [c + 1, r]);
    if (!at(c + 1, r)) add(key(c + 1, r), [c + 1, r + 1]);
    if (!at(c, r + 1)) add(key(c + 1, r + 1), [c, r + 1]);
    if (!at(c - 1, r)) add(key(c, r + 1), [c, r]);
  }
  next.clear();
  const rings = [];
  const used = new Set();
  for (const [startKey, list] of outs) {
    for (const first of list) {
      const edgeId = `${startKey}>${key(first[0], first[1])}`;
      if (used.has(edgeId)) continue;
      const loop = [];
      let cur = [Math.floor(startKey / (H + 1)), startKey % (H + 1)];
      let to = first;
      let prevDir = [to[0] - cur[0], to[1] - cur[1]];
      used.add(edgeId);
      loop.push(cur);
      for (let guard = 0; guard < 4 * W * H; guard++) {
        loop.push(to);
        if (to[0] === loop[0][0] && to[1] === loop[0][1]) break;
        const cands = outs.get(key(to[0], to[1])) ?? [];
        // prefer the left turn, then straight, then right (inside on the left ⇒ hugs the inside at diagonal touches)
        let pick = null, bestScore = -Infinity;
        for (const e of cands) {
          const id = `${key(to[0], to[1])}>${key(e[0], e[1])}`;
          if (used.has(id)) continue;
          const d = [e[0] - to[0], e[1] - to[1]];
          const cross = prevDir[0] * d[1] - prevDir[1] * d[0];   // +1 left, 0 straight, -1 right
          const score = cross > 0 ? 2 : cross === 0 ? 1 : 0;
          if (score > bestScore) { bestScore = score; pick = e; }
        }
        if (!pick) break;
        used.add(`${key(to[0], to[1])}>${key(pick[0], pick[1])}`);
        prevDir = [pick[0] - to[0], pick[1] - to[1]];
        cur = to; to = pick;
      }
      if (loop.length >= 4) rings.push(loop);
    }
  }
  // grid corners → degrees, simplify, drop degenerate rings; sort by area (largest first) for a stable file
  const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
  const out = rings
    .map((loop) => dp(loop.map(([c, r]) => [+((ox + c) * cell).toFixed(6), +((oy + r) * cell).toFixed(6)]), tol))
    .filter((r) => r.length >= 4 && Math.abs(area(r)) > 1e-7)
    .sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const stats = { cell, tol, W, H, unionCells, filledCells: filled, filledKm2: +(filled * cell * 111.32 * Math.cos(47.5 * Math.PI / 180) * cell * 110.57).toFixed(1), rings: out.length, vertices: out.reduce((a, r) => a + r.length, 0), ccw: out.every((r) => area(r) > 0) };
  return { rings: out, stats };
}

export function dachMaskFeature(rings, stats) {
  return {
    type: 'Feature',
    properties: { iso_a2: 'DACH', name: 'DE + AT + CH + LI (aufgelöst, Innenlöcher gefüllt)', members: [...DACH_MASK_MEMBERS], generator: 'scripts/gen-dach-mask.mjs', cell: stats.cell, tol: stats.tol },
    geometry: { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const countryRings = Object.fromEntries(DACH_MASK_MEMBERS.map((c) => [c, ringsOf(c)]));
  const t0 = Date.now();
  const { rings, stats } = buildDachMask(countryRings, { cell: CELL, tol: TOL });
  const text = JSON.stringify(dachMaskFeature(rings, stats));
  const file = join(ROOT, DACH_MASK_FILE);
  if (CHECK) {
    const same = existsSync(file) && readFileSync(file, 'utf8') === text;
    console.log(JSON.stringify({ ...stats, ms: Date.now() - t0, same }));
    process.exit(same ? 0 : 1);
  }
  writeFileSync(file, text);
  console.log(JSON.stringify({ ...stats, ms: Date.now() - t0, bytes: text.length, file: DACH_MASK_FILE }));
}
