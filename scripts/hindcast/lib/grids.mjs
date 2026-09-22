/**
 * grids.mjs — the source grids of the AP10a hindcast (buscosun Fusion, phase FI) and the ONE rule that maps a
 * cube cell to source cells. Pure functions, no network, no file system.
 *
 * ── Why the rule is not "nearest source cell" ───────────────────────────────
 * The kickoff (19.09.) says "raw source value at the cube cell centre's nearest source cell". The producer does
 * something else (scripts/point/adapters/sample.mjs, measured in the code 19.09.): a REGULAR source grid is
 * sampled as the BLOCK MEAN over every source cell whose centre rounds into the cube cell
 * (`Math.round((lat − lat0)/deg) === iy`, same for x), and cube cells without such a source cell are filled
 * from the nearest filled cube cell within three rings (`fillNearest`). Only UNSTRUCTURED grids (ICON global,
 * ICON-CH native) take the nearest source cell. The hindcast mirrors the code, not the sentence (V-HC-1):
 *   • block   ICON-D2 (0.02°), ICON-EU (0.0625°), IFS / AIFS / IFS ENS (0.25°) — the producer's own grids;
 *             Open-Meteo stores them on the same regular grids (verified in V2 against the published HSURF);
 *   • nearest ICON-CH1/CH2 — Open-Meteo stores them on a ROTATED lat/lon grid (pole 43 N / 170 W, origin
 *             rlat −4.06 / rlon −6.46, 0.01° / 0.02°; measured 19.09.: the four corners reproduce the BBOX of
 *             meta.json to 2·10⁻⁵°), itself a nearest-neighbour resampling of the native triangles
 *             (`static/nn_weights.om`) — so the hindcast takes the rotated point nearest to the cube centre;
 *   • nearest ICON global — Open-Meteo regrids the icosahedral grid to 0.125° with CDO weights
 *             (`static/cdo_weights.nc`); the producer takes the nearest native cell. Neither is the other; the
 *             hindcast takes the 0.125° point nearest to the cube centre and says so (standIn).
 *
 * Floating point: the block rule rounds with JS `Math.round` on exactly the producer's expressions
 * (`lat1 ± j·dj`, `lon1 + i·di − 360`). A tie (x.5) goes UP in JS and to even in Python — this file is the only
 * place the rule is evaluated; the Python extractors only read the cell lists it writes.
 */

const D = Math.PI / 180;

/**
 * Grid table. `producer` = the geometry as the producer's GRIB decoder sees it (for the block rule),
 * `index` = how the external store addresses the same cell (Open-Meteo om arrays, dynamical Zarr arrays).
 */
export const GRIDS = Object.freeze({
  icon_d2: {
    id: 'icon_d2', kind: 'regular', ny: 746, nx: 1215, stepDeg: 0.02,
    producer: { lat1: 43.18, dj: 0.02, jNorth: true, lon1: 356.06, di: 0.02 },
    // Open-Meteo dwd_icon_d2: BBOX 43.18,-3.94 … 58.08,20.34, row 0 = south (measured: HSURF row 0 over the Alps' south side)
    om: { lat0: 43.18, dlat: 0.02, lon0: -3.94, dlon: 0.02 },
  },
  icon_eu: {
    id: 'icon_eu', kind: 'regular', ny: 657, nx: 1377, stepDeg: 0.0625,
    producer: { lat1: 29.5, dj: 0.0625, jNorth: true, lon1: 336.5, di: 0.0625 },
    om: { lat0: 29.5, dlat: 0.0625, lon0: -23.5, dlon: 0.0625 },
  },
  ecmwf025: {
    id: 'ecmwf025', kind: 'regular', ny: 721, nx: 1440, stepDeg: 0.25,
    // ECMWF open data 0p25 (sample.mjs: "Ursprung 0°, gewrappt"): lat 90 → −90, lon 0 … 359.75 wrapped to ±180.
    producer: { lat1: 90, dj: 0.25, jNorth: false, lon1: 0, di: 0.25 },
    // Open-Meteo ecmwf_ifs025 / ecmwf_aifs025_single: BBOX −90,−180 … 90,179.75, row 0 = south pole.
    om: { lat0: -90, dlat: 0.25, lon0: -180, dlon: 0.25 },
  },
  icon_global_om: {
    id: 'icon_global_om', kind: 'nearest', ny: 1441, nx: 2879, stepDeg: 0.125,
    om: { lat0: -90, dlat: 0.125, lon0: -180, dlon: 0.125 },
  },
  icon_ch1_om: {
    id: 'icon_ch1_om', kind: 'rotated', ny: 705, nx: 1089, stepDeg: 0.01,
    rot: { poleLat: 43, poleLon: -170, rlat0: -4.06, rlon0: -6.46, d: 0.01 },
  },
  icon_ch2_om: {
    id: 'icon_ch2_om', kind: 'rotated', ny: 353, nx: 545, stepDeg: 0.02,
    rot: { poleLat: 43, poleLon: -170, rlat0: -4.06, rlon0: -6.46, d: 0.02 },
  },
});

// ─── rotated pole ────────────────────────────────────────────────────────────
/** Geographic → rotated (degrees). Pole (43 N, 170 W): the rotated origin (0, 0) lies at 47 N / 10 E. */
export function geoToRot(lat, lon, rot) {
  const sp = Math.sin(rot.poleLat * D), cp = Math.cos(rot.poleLat * D);
  const phi = lat * D, dl = (lon - rot.poleLon) * D;
  const rlat = Math.asin(cp * Math.cos(phi) * Math.cos(dl) + sp * Math.sin(phi));
  const rlon = Math.atan2(-Math.cos(phi) * Math.sin(dl), -Math.cos(phi) * sp * Math.cos(dl) + Math.sin(phi) * cp);
  return { rlat: rlat / D, rlon: rlon / D };
}
/** Rotated → geographic (degrees); the inverse of `geoToRot` (the form validated against meta.json's BBOX). */
export function rotToGeo(rlat, rlon, rot) {
  const sp = Math.sin(rot.poleLat * D), cp = Math.cos(rot.poleLat * D);
  const rphi = rlat * D, rlam = rlon * D;
  const phi = Math.asin(Math.sin(rphi) * sp + Math.cos(rphi) * Math.cos(rlam) * cp);
  const lam = Math.atan2(Math.cos(rphi) * Math.sin(rlam), sp * Math.cos(rphi) * Math.cos(rlam) - Math.sin(rphi) * cp);
  let lon = rot.poleLon + 180 + lam / D;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return { lat: phi / D, lon };
}

// ─── cell coordinates ────────────────────────────────────────────────────────
/** Producer coordinates of a regular source cell (exactly the producer's expressions). */
export function producerLatLon(grid, j, i) {
  const p = grid.producer;
  const lat = p.jNorth ? p.lat1 + j * p.dj : p.lat1 - j * p.dj;
  let lon = p.lon1 + i * p.di;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}
/** External-store index [row, col] of a regular producer cell. */
export function storeIndexOfProducer(grid, j, i) {
  const { lat, lon } = producerLatLon(grid, j, i);
  const o = grid.om;
  return [Math.round((lat - o.lat0) / o.dlat), Math.round((((lon - o.lon0) % 360) + 360) % 360 / o.dlon)];
}
/** Geographic centre of an external-store cell [row, col]. */
export function storeCellLatLon(grid, row, col) {
  if (grid.kind === 'rotated') {
    const r = grid.rot;
    return rotToGeo(r.rlat0 + row * r.d, r.rlon0 + col * r.d, r);
  }
  const o = grid.om;
  let lon = o.lon0 + col * o.dlon;
  if (lon >= 180) lon -= 360;
  return { lat: o.lat0 + row * o.dlat, lon };
}

// ─── the producer's rule, per cube cell ─────────────────────────────────────
/** Source cells [j, i] (producer index) whose centres round into cube cell (iy, ix) — `sampleRegularToTier`. */
export function blockOf(grid, tier, iy, ix) {
  const p = grid.producer;
  const cLat = tier.lat0 + iy * tier.deg, cLon = tier.lon0 + ix * tier.deg;
  const jc = p.jNorth ? (cLat - p.lat1) / p.dj : (p.lat1 - cLat) / p.dj;
  let lonU = cLon - p.lon1; lonU = ((lonU % 360) + 360) % 360;
  const ic = lonU / p.di;
  const span = Math.ceil(tier.deg / grid.stepDeg) + 2;
  const out = [];
  for (let j = Math.floor(jc) - span; j <= Math.ceil(jc) + span; j++) {
    if (j < 0 || j >= grid.ny) continue;
    const lat = p.jNorth ? p.lat1 + j * p.dj : p.lat1 - j * p.dj;
    if (Math.round((lat - tier.lat0) / tier.deg) !== iy) continue;
    for (let i = Math.floor(ic) - span; i <= Math.ceil(ic) + span; i++) {
      const ii = ((i % grid.nx) + grid.nx) % grid.nx;
      let lon = p.lon1 + ii * p.di;
      if (lon > 180) lon -= 360;
      if (Math.round((lon - tier.lon0) / tier.deg) !== ix) continue;
      out.push([j, ii]);
    }
  }
  return out;
}

/**
 * `fillNearest` for ONE hole, on the geometric fill mask (a cube cell is filled when its block is not empty):
 * rings 1…3, within the first ring that has a filled cell the smallest dy² + dx², ties to the first in the
 * producer's loop order (dy −r…r outer, dx −r…r inner, strict `<`). Value-dependent holes (a source value NaN,
 * e.g. a masked snowlmt) are NOT reproduced — see V-HC-2.
 */
export function fillFrom(grid, tier, iy, ix, maxRings = 3) {
  for (let r = 1; r <= maxRings; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
      const y = iy + dy, x = ix + dx;
      if (y < 0 || y >= tier.ny || x < 0 || x >= tier.nx) continue;
      if (!blockOf(grid, tier, y, x).length) continue;
      const d = dy * dy + dx * dx;
      if (d < bestD) { bestD = d; best = { iy: y, ix: x, ring: r }; }
    }
    if (best) return best;
  }
  return null;
}

/** Nearest external-store cell to a geographic point: rotated grids and the 0.125° ICON global regrid. */
export function nearestStoreCell(grid, lat, lon) {
  if (grid.kind === 'rotated') {
    const r = grid.rot;
    const { rlat, rlon } = geoToRot(lat, lon, r);
    const row = Math.round((rlat - r.rlat0) / r.d), col = Math.round((rlon - r.rlon0) / r.d);
    if (row < 0 || row >= grid.ny || col < 0 || col >= grid.nx) return null;
    return { row, col, dRot: Math.max(Math.abs(rlat - (r.rlat0 + row * r.d)), Math.abs(rlon - (r.rlon0 + col * r.d))) };
  }
  const o = grid.om;
  const row = Math.round((lat - o.lat0) / o.dlat);
  const col = Math.round((((lon - o.lon0) % 360) + 360) % 360 / o.dlon) % grid.nx;
  if (row < 0 || row >= grid.ny) return null;
  return { row, col, dRot: null };
}

export function gridsSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const r = GRIDS.icon_ch1_om.rot;
  const o = geoToRot(47, 10, r);
  add('rotated: 47 N / 10 E is the rotated origin (0, 0)', Math.abs(o.rlat) < 1e-9 && Math.abs(o.rlon) < 1e-9, JSON.stringify(o));
  let worst = 0;
  for (const [la, lo] of [[46.2, 6.1], [47.37, 8.54], [45.9, 10.9], [49.5, 12.3], [46.5, 16.2]]) {
    const q = geoToRot(la, lo, r), b = rotToGeo(q.rlat, q.rlon, r);
    worst = Math.max(worst, Math.abs(b.lat - la), Math.abs(b.lon - lo));
  }
  add('rotated: forward + inverse round trip within 1e-9°', worst < 1e-9, `max ${worst}`);
  const c = rotToGeo(r.rlat0, r.rlon0, r);
  add('rotated: grid corner (0, 0) = BBOX 42.57854 N / 1.2333984 E (meta.json) within 2e-5°', Math.abs(c.lat - 42.57854) < 2e-5 && Math.abs(c.lon - 1.2333984) < 2e-5, JSON.stringify(c));
  const cN = rotToGeo(r.rlat0 + 704 * r.d, r.rlon0 + 1088 * r.d, r);
  add('rotated: grid corner (704, 1088) = BBOX 49.786846 N / 16.846222 E within 2e-5°', Math.abs(cN.lat - 49.786846) < 2e-5 && Math.abs(cN.lon - 16.846222) < 2e-5, JSON.stringify(cN));
  return { checks, passed: checks.filter((x) => x.ok).length, total: checks.length };
}
