/**
 * V-SW-9 — shore normal of a spot (bearing pointing SEAWARD), from the land/sea mask of the wave model.
 *
 *   maskVectorNormal  (catalogue up to V-SW-9, `normalFrom: 'mask'`): vector mean of the directions to every cell within
 *                     0.2–2.5 km of the spot, water +1, land −1, weight 1/d. In a harbour basin or behind a mole the
 *                     2.5-km circle pulls the basin, the river mouth or the open sea beyond the spit into the mean.
 *   maskCoastNormal   (V-SW-9, `normalFrom: 'mask-coast'`): the coastline of the same mask — the 0.5 contour of the
 *                     water indicator between cell centres (marching squares) — its point P nearest to the spot, and the
 *                     length-weighted mean of the seaward unit normals of every contour segment within `bandKm` of P.
 *                     Only the coast at the spot counts; the far side of a basin or a spit does not.
 *
 * Both are pure: `water(i, j)` is the mask, `grid` the model grid (`SEA_MODELS.cwam.grid`), positions in degrees.
 */

const R = Math.PI / 180;
const km = (aLat, aLon, bLat, bLon) => {
  const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const bearing = (aLat, aLon, bLat, bLon) => {
  const y = Math.sin((bLon - aLon) * R) * Math.cos(bLat * R);
  const x = Math.cos(aLat * R) * Math.sin(bLat * R) - Math.sin(aLat * R) * Math.cos(bLat * R) * Math.cos((bLon - aLon) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
};
const centre = (g, i, j) => ({ lat: g.lat1 - j * g.dj, lon: g.lon1 + i * g.di });
const cellOf = (g, lat, lon) => ({ i: (lon - g.lon1) / g.di, j: (g.lat1 - lat) / g.dj });

/** The catalogue's rule up to V-SW-9 (moved here verbatim from build-spots.mjs). */
export function maskVectorNormal(water, g, lat, lon) {
  const c = cellOf(g, lat, lon);
  let ve = 0, vn = 0;
  for (let j = Math.floor(c.j) - 12; j <= Math.ceil(c.j) + 12; j++) for (let i = Math.floor(c.i) - 8; i <= Math.ceil(c.i) + 8; i++) {
    if (i < 0 || j < 0 || i >= g.ni || j >= g.nj) continue;
    const p = centre(g, i, j);
    const d = km(lat, lon, p.lat, p.lon);
    if (d < 0.2 || d > 2.5) continue;
    const b = bearing(lat, lon, p.lat, p.lon) * Math.PI / 180, w = water(i, j) ? 1 : -1;
    ve += w * Math.sin(b) / d; vn += w * Math.cos(b) / d;
  }
  return Math.round((Math.atan2(ve, vn) * 180 / Math.PI + 360) % 360) % 360;
}

/**
 * Coastline segments of the mask within `radiusKm` of a position, in local km (x east, y north) around it, each with its
 * seaward unit normal. Marching squares on the water indicator (1 water, 0 land) at level 0.5, crossings linearly
 * interpolated on the cell edges. `smooth` = number of passes of the 3 × 3 binomial kernel over the indicator before the
 * contour (0 = the raw mask: crossings at edge midpoints, segments only at 0°/45°/90° — the staircase of 0.93-km cells).
 * Saddles (centre value 0.5 or crossing between diagonal corners) keep the WATER corners connected — a fixed rule.
 */
export function maskCoastSegments(water, g, lat, lon, radiusKm = 4, smooth = 0) {
  const kx = 111.32 * Math.cos(lat * R), ky = 110.574;
  const X = (lo) => (lo - lon) * kx, Y = (la) => (la - lat) * ky;
  const c = cellOf(g, lat, lon);
  const ri = Math.ceil(radiusKm / (g.di * kx)) + 1, rj = Math.ceil(radiusKm / (g.dj * ky)) + 1;
  // indicator on a window (with margin for the kernel); outside the grid = land
  const m = smooth + 1, i0 = Math.floor(c.i) - ri - m, j0 = Math.floor(c.j) - rj - m, W = 2 * (ri + m) + 2, Hh = 2 * (rj + m) + 2;
  let f = new Float64Array(W * Hh);
  for (let jj = 0; jj < Hh; jj++) for (let ii = 0; ii < W; ii++) {
    const i = i0 + ii, j = j0 + jj;
    f[jj * W + ii] = i >= 0 && j >= 0 && i < g.ni && j < g.nj && water(i, j) ? 1 : 0;
  }
  for (let pass = 0; pass < smooth; pass++) {
    const o = new Float64Array(W * Hh);
    for (let jj = 0; jj < Hh; jj++) for (let ii = 0; ii < W; ii++) {
      let acc = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = ii + di, b = jj + dj;
        if (a < 0 || b < 0 || a >= W || b >= Hh) continue;
        const k = (di ? 1 : 2) * (dj ? 1 : 2);
        acc += k * f[b * W + a]; wsum += k;
      }
      o[jj * W + ii] = acc / wsum;
    }
    f = o;
  }
  const v = (i, j) => f[(j - j0) * W + (i - i0)];
  const L = 0.5;
  const cross = (pa, pb, va, vb) => { const t = (L - va) / (vb - va); return [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]; };
  const segs = [];
  for (let j = Math.floor(c.j) - rj; j <= Math.ceil(c.j) + rj; j++) for (let i = Math.floor(c.i) - ri; i <= Math.ceil(c.i) + ri; i++) {
    // corners: a = (i, j) NW, b = (i+1, j) NE, cc = (i+1, j+1) SE, d = (i, j+1) SW (rows from north)
    const va = v(i, j), vb = v(i + 1, j), vc = v(i + 1, j + 1), vd = v(i, j + 1);
    const a = va >= L ? 1 : 0, b = vb >= L ? 1 : 0, cc = vc >= L ? 1 : 0, d = vd >= L ? 1 : 0;
    const code = a * 8 + b * 4 + cc * 2 + d;
    if (code === 0 || code === 15) continue;
    const p0 = centre(g, i, j), p1 = centre(g, i + 1, j + 1);
    const x0 = X(p0.lon), x1 = X(p1.lon), yN = Y(p0.lat), yS = Y(p1.lat);
    const A = [x0, yN], B = [x1, yN], C = [x1, yS], D = [x0, yS];
    const N = cross(A, B, va, vb), E = cross(B, C, vb, vc), S = cross(D, C, vd, vc), Wp = cross(A, D, va, vd);
    const centreWater = (va + vb + vc + vd) / 4 >= L;
    const pairs = {
      1: [[Wp, S]], 2: [[S, E]], 3: [[Wp, E]], 4: [[N, E]], 6: [[N, S]], 7: [[Wp, N]], 8: [[Wp, N]], 9: [[N, S]], 11: [[N, E]],
      12: [[Wp, E]], 13: [[S, E]], 14: [[Wp, S]],
      // b, d water: water connected through the centre ⇒ cut off the land corners a and cc, else the water corners
      5: centreWater ? [[Wp, N], [S, E]] : [[N, E], [Wp, S]],
      10: centreWater ? [[N, E], [Wp, S]] : [[Wp, N], [S, E]],
    }[code];
    const corners = [[A, va], [B, vb], [C, vc], [D, vd]];
    for (const [p, q] of pairs) {
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      if (!len) continue;
      let nx = -dy / len, ny = dx / len;
      // orient towards water: the corner nearest to the segment's midpoint decides (water ⇒ towards it, land ⇒ away)
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const [cp, cv] = corners.reduce((best, k) => (Math.hypot(k[0][0] - mx, k[0][1] - my) < Math.hypot(best[0][0] - mx, best[0][1] - my) ? k : best));
      const sgn = cv >= L ? 1 : -1;
      if (nx * (cp[0] - mx) * sgn + ny * (cp[1] - my) * sgn < 0) { nx = -nx; ny = -ny; }
      segs.push({ p, q, len, nx, ny });
    }
  }
  return segs;
}

const nearestOnSeg = (s, x, y) => {
  const dx = s.q[0] - s.p[0], dy = s.q[1] - s.p[1];
  const t = Math.max(0, Math.min(1, ((x - s.p[0]) * dx + (y - s.p[1]) * dy) / (dx * dx + dy * dy)));
  return [s.p[0] + t * dx, s.p[1] + t * dy];
};

/**
 * Seaward normal from a set of coastline segments (local km around the spot, each with a seaward unit normal):
 * nearest coast point P, then the length inside the band |·−P| ≤ bandKm of every segment (clipped by sampling) times its
 * normal. Returns { normal, coastKm, bandLenKm, spread } — spread = 1 − |mean vector| (0 = straight coast).
 */
export function normalFromSegments(segs, bandKm = 0.5) {
  if (!segs.length) return null;
  let P = null, dP = Infinity;
  for (const s of segs) { const p = nearestOnSeg(s, 0, 0); const d = Math.hypot(p[0], p[1]); if (d < dP) { dP = d; P = p; } }
  let ve = 0, vn = 0, L = 0;
  for (const s of segs) {
    const n = Math.max(2, Math.ceil(s.len / 0.02));
    let inside = 0;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = s.p[0] + t * (s.q[0] - s.p[0]), y = s.p[1] + t * (s.q[1] - s.p[1]);
      if (Math.hypot(x - P[0], y - P[1]) <= bandKm) inside++;
    }
    const l = s.len * inside / n;
    if (!l) continue;
    ve += l * s.nx; vn += l * s.ny; L += l;
  }
  if (!L) return null;
  const m = Math.hypot(ve, vn) / L;
  return { normal: Math.round((Math.atan2(ve, vn) / R + 360) % 360) % 360, coastKm: +dP.toFixed(3), bandLenKm: +L.toFixed(3), spread: +(1 - m).toFixed(3) };
}

/** V-SW-9 rule: the mask's coastline at the spot. */
export function maskCoastNormal(water, g, lat, lon, { bandKm = 0.5, radiusKm = 4, smooth = 0 } = {}) {
  return normalFromSegments(maskCoastSegments(water, g, lat, lon, radiusKm, smooth), bandKm);
}

/** Smallest angle between two bearings (0 … 180). */
export const angleDiff = (a, b) => { const d = Math.abs(((a - b) % 360) + 360) % 360; return d > 180 ? 360 - d : d; };
