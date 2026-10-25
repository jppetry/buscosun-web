/**
 * gen-dach-preview.mjs — writes `src/dachPreviewPaths.ts`: the DE / AT / CH outlines as flat SVG path data for the
 * layer-stack illustration on the start page's „Wetterkarte" tile (SearchPage.tsx). Decoration only, no data.
 *
 * Outer rings only, equirectangular with cos(lat) on x, Douglas–Peucker at TOL°, coordinates in a 0…H box.
 *
 *   node scripts/gen-dach-preview.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOL = 0.025;
const H = 245;

const outerRings = (c) => {
  const g = JSON.parse(readFileSync(join(ROOT, 'public', 'countries', `${c}.geojson`), 'utf8')).geometry;
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => p[0]);
};

function dp(pts, tol) {
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, im = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > dmax) { dmax = d; im = i; }
    }
    if (dmax > tol && im > 0) { keep[im] = 1; stack.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Closed ring: split at the point farthest from the start so both halves have a real chord. */
function dpRing(ring, tol) {
  let im = 1, dm = 0;
  for (let i = 1; i < ring.length - 1; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > dm) { dm = d; im = i; } }
  return [...dp(ring.slice(0, im + 1), tol), ...dp(ring.slice(im), tol).slice(1)];
}

const all = Object.fromEntries(['DE', 'AT', 'CH'].map((c) => [c, outerRings(c).filter((r) => r.length > 30).map((r) => dpRing(r, TOL))]));
const flat = Object.values(all).flat().flat();
const lat0 = Math.min(...flat.map((p) => p[1])), lat1 = Math.max(...flat.map((p) => p[1]));
const lon0 = Math.min(...flat.map((p) => p[0]));
const k = Math.cos(((lat0 + lat1) / 2) * Math.PI / 180);
const s = H / (lat1 - lat0);
const prj = ([lon, lat]) => [(lon - lon0) * k * s, (lat1 - lat) * s];
const r1 = (n) => Math.round(n * 10) / 10;
const d = (rings) => rings.map((r) => 'M' + r.map(prj).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z').join('');
const W = r1(Math.max(...flat.map((p) => prj(p)[0])));

// ---- Berge: Alpenbogen aus zweifarbigen Dreiecken mit Schneekappe (Zier, von Hand nach Lage gesetzt, keine Geodaten) ----
// Maße in Karteneinheiten (≈ 16 je Längengrad, 26 je Breitengrad). Zwei Reihen: hinten (Nordrand der Kalkalpen, heller,
// kleiner) und vorn (Zentralalpen, größer, kräftiger); die Höhe wächst zur Mitte des Bogens. Dazu flache Mittelgebirgs-
// Hügel ohne Schnee.
const rnd = (() => { let a = 20261025; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const landRings = Object.values(all).flat().map((r) => r.map(prj));
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inLand = (pt) => landRings.some((r) => inRing(pt, r));
const FRONT_ARC = [[6.8, 46.05], [7.9, 46.15], [9.1, 46.5], [10.3, 46.8], [11.5, 46.95], [12.8, 47.05], [14.0, 47.1], [15.3, 47.25], [16.3, 47.5]].map(prj);
const BACK_ARC = [[7.4, 46.65], [8.6, 46.9], [9.9, 47.2], [11.2, 47.45], [12.4, 47.6], [13.4, 47.6], [14.6, 47.65]].map(prj);
/** Punkte entlang eines Linienzugs im Abstand ≈ step, mit Quer- und Längsjitter; u ∈ [0,1] ist die Lage im Bogen. */
function along(line, step, jit) {
  const segs = line.slice(1).map((p, i) => ({ a: line[i], b: p, len: Math.hypot(p[0] - line[i][0], p[1] - line[i][1]) }));
  const total = segs.reduce((s, g) => s + g.len, 0), out = [];
  for (let dist = step * 0.5, acc = 0, si = 0; dist < total; dist += step * (0.75 + rnd() * 0.5)) {
    while (si < segs.length - 1 && acc + segs[si].len < dist) acc += segs[si++].len;
    const g = segs[si], t = (dist - acc) / g.len;
    out.push({ x: g.a[0] + (g.b[0] - g.a[0]) * t + (rnd() - 0.5) * jit, y: g.a[1] + (g.b[1] - g.a[1]) * t + (rnd() - 0.5) * jit * 1.6, u: dist / total });
  }
  return out;
}
const env = (u) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.9 + 0.05)));
const f1 = (n) => r1(n);
const rows = { back: { A: '', B: '', S: '' }, front: { A: '', B: '', S: '' }, hill: { A: '', B: '' } };
const peak = (row, x, y, h, snow) => {
  const w = h * (1.05 + rnd() * 0.3), lean = (rnd() - 0.5) * 0.16 * w, ax = x + lean, ay = y - h, mx = x + w * (0.04 + rnd() * 0.1);
  row.A += `M${f1(x - w / 2)} ${f1(y)}L${f1(ax)} ${f1(ay)}L${f1(mx)} ${f1(y)}Z`;
  row.B += `M${f1(ax)} ${f1(ay)}L${f1(x + w / 2)} ${f1(y)}L${f1(mx)} ${f1(y)}Z`;
  if (!snow) return;
  const s = 0.34 + rnd() * 0.08, lx = ax + (x - w / 2 - ax) * s, ly = ay + h * s, rx = ax + (x + w / 2 - ax) * s, ry = ay + h * s;
  row.S += `M${f1(ax)} ${f1(ay)}L${f1(rx)} ${f1(ry)}L${f1(ax + (rx - ax) * 0.5)} ${f1(ay + h * (s - 0.1))}L${f1(ax + (lx - ax) * 0.1)} ${f1(ay + h * (s + 0.04))}L${f1(ax + (lx - ax) * 0.55)} ${f1(ay + h * (s - 0.08))}L${f1(lx)} ${f1(ly)}Z`;
};
const pk = [];
// Staffelung: je Reihe um dy Einheiten gegen den Hauptkamm versetzt; hinten (kleiner, heller) → vorn (größer, kräftiger)
for (const [arc, dy, row, base, step] of [[BACK_ARC, -6, rows.back, 8, 4.4], [FRONT_ARC, -22, rows.back, 8, 4.8], [FRONT_ARC, -11, rows.back, 10, 4.6], [FRONT_ARC, 0, rows.front, 13, 4.2], [FRONT_ARC, 10, rows.front, 11, 4.4], [FRONT_ARC, 19, rows.front, 9, 5]]) {
  for (const p of along(arc, step * 1.3, 3.5)) if (inLand([p.x, p.y + dy - 1])) pk.push({ row, x: p.x, y: p.y + dy, h: (base + rnd() * 6) * env(p.u), snow: true });
}
// Mittelgebirge: niedrige, breite Hügel ohne Schnee
for (const [c, n] of [[[8.2, 48.1], 3], [[13.2, 49.0], 3], [[10.8, 50.6], 3], [[10.6, 51.75], 2], [[13.2, 50.5], 3], [[9.5, 48.4], 3], [[8.2, 51.2], 2], [[9.7, 50.3], 2]]) {
  const [cx, cy] = prj(c);
  for (let i = 0; i < n; i++) pk.push({ row: rows.hill, x: cx + (i - (n - 1) / 2) * 4.6 + (rnd() - 0.5) * 2, y: cy + (rnd() - 0.5) * 4, h: 5.5 + rnd() * 3, snow: false });
}
pk.sort((p, q) => (p.row === rows.back ? -1 : 0) - (q.row === rows.back ? -1 : 0) || p.y - q.y);
for (const { row, x, y, h, snow } of pk) peak(row, x, y, h, snow);

const body = `// GENERATED by scripts/gen-dach-preview.mjs — do not edit. Flat outlines (0…${W} × 0…${H}) for the Wetterkarte tile.
export const DACH_PREVIEW_W = ${W};
export const DACH_PREVIEW_H = ${H};
export const DACH_PREVIEW_PATHS = {
  DE: '${d(all.DE)}',
  AT: '${d(all.AT)}',
  CH: '${d(all.CH)}',
} as const;
/** Zier-Berge: hinten / Hügel / vorn, je zwei Flanken (a hell, b dunkel) und Schneekappe (s). */
export const DACH_PREVIEW_RELIEF = {
  back: { a: '${rows.back.A}', b: '${rows.back.B}', s: '${rows.back.S}' },
  hill: { a: '${rows.hill.A}', b: '${rows.hill.B}' },
  front: { a: '${rows.front.A}', b: '${rows.front.B}', s: '${rows.front.S}' },
} as const;
`;
writeFileSync(join(ROOT, 'src', 'dachPreviewPaths.ts'), body);
console.log('W', W, 'bytes', body.length);
