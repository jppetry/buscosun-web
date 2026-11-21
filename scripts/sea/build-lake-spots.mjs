#!/usr/bin/env node
/**
 * Phase BS — builds the static files of the inland lakes (`audit/seewetter-binnenseen.md`, contract `src/sea/seaLakes.ts`):
 *   static/spots-lakes.json   the lake catalogue: table of the lakes + the lake spots (hand list `scripts/sea/lakes-src.json`
 *                             + what is computed here). A reader that does not know the file sees the coast as before.
 *   static/lakes.json         the outlines for the map (GeoJSON, simplified), with the credit of each source
 *   static/lake-geo.json      (--geo) producer-only terrain/roughness entries at every water point, height = lake elevation
 *
 * Computed per spot from the lake's OUTLINE (no OSM):
 *   position  the hand position pulled onto the nearest point of the shoreline (distance reported, limit 1.5 km)
 *   normal    bearing pointing to the WATER: vector mean of sample points 150 m and 300 m around the shore point
 *             (water +1, land −1) — `normalFrom: 'outline'`
 *   pt        the water point buscosun Fusion is computed at: 250 m in front of the shore point (inside the outline)
 *   fetch     per 10° the wind comes from: mean of nine radials 3° apart, each from `pt` to its first shoreline
 *             (Shore Protection Manual 1984, p. 3-41); two outline parts that touch count as one water
 *   warncell  DWD lake warning cell (ids 2…) that contains `pt` — from the recorded answer of the DWD GeoServer layer
 *             `dwd:Warngebiete_Binnenseen` (`--cells`), nothing is fetched for it here
 *
 * Outlines (fetched once into `--cache`, raw answers kept; sha256 of each goes into the catalogue):
 *   dlm250     BKG DLM250, AX_StehendesGewaesser (WFS, dl-de/by-2.0) — lakes in Germany, picked by name inside a box
 *   swisstopo  swissTLM3D Gewässernetz (api3.geo.admin.ch `find`) — lakes in Switzerland, picked by name
 *   euhydro    Copernicus EU-Hydro River Network Database, layer InlandWater (EEA ArcGIS REST) — lakes in Austria and
 *              border lakes (one polygon with the foreign shore), picked by a point in the lake
 *
 * Stations and water sources per spot come from the step-0 measurement `--probe` (`scripts/sea/spike/lake-probe.mjs`);
 * without the file (`--draft`) the catalogue is built without them — that is what the probe itself reads.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/build-lake-spots.mjs
 *     [--cache=.sea-cache/lakes] [--probe=audit/seewetter-binnenseen/spike/lake-probe.json | --draft]
 *     [--cells=scripts/lib/fixtures/sea/lakes/dwd-warngebiete-binnenseen.json] [--out=<dir>] [--geo] [--only=<lake id>]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { lakeBlockProblems, lakeTableProblems, LAKE_PT_MAX_KM } from '../../src/sea/seaLakes.ts';
import { LAKE_FETCH_BINS, LAKE_FETCH_STEP_DEG, LAKE_FETCH_RADIALS } from '../../src/sea/lakeWave.ts';
import { CUBE_DOMAIN } from '../../src/point/cubeFormat.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const UA = 'buscosun-sea (buscosun-web/audit/seewetter-binnenseen.md)';
const R = Math.PI / 180;

export const LAKE_PROBE_FILE = 'audit/seewetter-binnenseen/spike/lake-probe.json';
export const LAKE_CELLS_FILE = 'scripts/lib/fixtures/sea/lakes/dwd-warngebiete-binnenseen.json';
export const OUTLINE_CREDIT = Object.freeze({
  dlm250: '© GeoBasis-DE / BKG 2026 (DLM250), dl-de/by-2-0, Daten vereinfacht',
  swisstopo: '© swisstopo (swissTLM3D Gewässernetz), Daten vereinfacht',
  euhydro: '© European Union, Copernicus Land Monitoring Service 2020, European Environment Agency (EEA): EU-Hydro River Network Database, Daten vereinfacht',
});
/** Limits of the builder (`set`). */
export const LAKE_SNAP_MAX_M = 1500;
export const LAKE_PT_OFFSETS_KM = Object.freeze([0.25, 0.4, 0.15, 0.1, 0.05]);
export const LAKE_FETCH_MAX_KM = 120;
/** Two outline parts closer than this along a radial are one water (DLM250 splits Müritz and Bodensee into parts). */
export const LAKE_FETCH_GAP_KM = 0.03;
/** A WSV gauge counts as a gauge OF the lake only this close to the outline (a river gauge further away is not used). */
export const LAKE_GAUGE_MAX_KM = 1;
export const LAKE_WT_NEAR_KM = 20;
/** EU-Hydro only: an outline part smaller than this share of the largest part is a pond or channel of the reed belt, not the lake. */
export const LAKE_EUHYDRO_MIN_PART = 0.05;

// --- geometry (pure) ---------------------------------------------------------------------------------------

export const distKm = (aLat, aLon, bLat, bLon) => {
  const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
/** Local plane in km around (lat0, lon0): x east, y north. */
export function plane(lat0, lon0) {
  const kx = 111.32 * Math.cos(lat0 * R), ky = 110.574;
  return { to: (lon, lat) => [(lon - lon0) * kx, (lat - lat0) * ky], from: (x, y) => [lon0 + x / kx, lat0 + y / ky] };
}
/** GeoJSON geometry → list of polygons, each a list of rings (outer first) of [lon, lat]. */
export function polysOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
const ringsInside = (rings, x, y) => {
  let inside = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Is (lon, lat) water of the lake (inside one of its polygons, outside that polygon's islands)? */
export const inLake = (polys, lon, lat) => polys.some((rings) => ringsInside(rings, lon, lat));
/** Area in km² (outer rings minus holes). */
export function lakeAreaKm2(polys) {
  let a = 0;
  for (const rings of polys) {
    const [lon0, lat0] = rings[0][0];
    const p = plane(lat0, lon0);
    rings.forEach((ring, k) => {
      let s = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [x1, y1] = p.to(ring[j][0], ring[j][1]), [x2, y2] = p.to(ring[i][0], ring[i][1]); s += x1 * y2 - x2 * y1; }
      a += (k === 0 ? 1 : -1) * Math.abs(s) / 2;
    });
  }
  return a;
}
export function lakeBbox(polys) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const rings of polys) for (const [x, y] of rings[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [+w.toFixed(4), +s.toFixed(4), +e.toFixed(4), +n.toFixed(4)];
}
/** Nearest point of any shoreline (outer rings and islands) to (lat, lon). */
export function nearestShore(polys, lat, lon) {
  const p = plane(lat, lon);
  let best = null;
  for (const rings of polys) for (const ring of rings) for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = p.to(ring[i][0], ring[i][1]), [bx, by] = p.to(ring[i + 1][0], ring[i + 1][1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / l2)) : 0;
    const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (!best || d < best.km) best = { km: d, x, y };
  }
  if (!best) return null;
  const [lo, la] = p.from(best.x, best.y);
  return { lat: la, lon: lo, km: best.km };
}
const bearingOf = (x, y) => ((Math.atan2(x, y) / R) % 360 + 360) % 360;
/** Bearing from the shore point to the water: vector mean of the samples around it (water +1, land −1); `null` when they cancel. */
export function shoreNormalOf(polys, lat, lon, radiiKm = [0.15, 0.3]) {
  const p = plane(lat, lon);
  let sx = 0, sy = 0;
  for (const r of radiiKm) for (let b = 0; b < 360; b += 5) {
    const ux = Math.sin(b * R), uy = Math.cos(b * R);
    const [lo, la] = p.from(ux * r, uy * r);
    const w = inLake(polys, lo, la) ? 1 : -1;
    sx += w * ux; sy += w * uy;
  }
  return Math.hypot(sx, sy) < 1e-9 ? null : Math.round(bearingOf(sx, sy)) % 360;
}
/** The water point in front of the shore point along `normal`, or `null` when no offset lies in the lake. */
export function waterPointOf(polys, lat, lon, normal, offsetsKm = LAKE_PT_OFFSETS_KM) {
  const p = plane(lat, lon);
  for (const d of offsetsKm) {
    const [lo, la] = p.from(Math.sin(normal * R) * d, Math.cos(normal * R) * d);
    if (inLake(polys, lo, la)) return { lat: +la.toFixed(5), lon: +lo.toFixed(5) };
  }
  return null;
}
/**
 * Length (km) of the radial from (lat, lon) towards `bearing` until it first leaves the water for good. The origin must
 * lie in the lake. Crossing from one outline part into a touching one (gap ≤ `gapKm`) does not end the radial.
 */
export function radialKm(polysXY, bearing, maxKm = LAKE_FETCH_MAX_KM, gapKm = LAKE_FETCH_GAP_KM) {
  const dx = Math.sin(bearing * R), dy = Math.cos(bearing * R);
  const hits = [];
  polysXY.forEach((rings, pi) => {
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j][0], ay = ring[j][1], ex = ring[i][0] - ax, ey = ring[i][1] - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 1e-9 && u >= 0 && u < 1) hits.push([t, pi]);
    }
  });
  hits.sort((a, b) => a[0] - b[0]);
  const inside = polysXY.map((rings) => ringsInside(rings, 0, 0));
  if (!inside.some(Boolean)) return 0;
  for (let k = 0; k < hits.length; k++) {
    const [t, pi] = hits[k];
    if (t > maxKm) return maxKm;
    inside[pi] = !inside[pi];
    if (inside.some(Boolean)) continue;
    // Out of every part: over when no part is entered again within the gap.
    const next = hits[k + 1];
    if (next && next[0] - t <= gapKm) continue;
    return t;
  }
  return maxKm;
}
/** The fetch table of a water point: 36 values in metres, each the mean of nine radials 3° apart around k·10°. */
export function fetchTableOf(polys, lat, lon) {
  const p = plane(lat, lon);
  const xy = polys.map((rings) => rings.map((ring) => ring.map(([lo, la]) => p.to(lo, la))));
  const ray = new Float64Array(360).fill(-1);
  const at = (deg) => { const d = ((deg % 360) + 360) % 360; if (ray[d] < 0) ray[d] = radialKm(xy, d); return ray[d]; };
  const half = (LAKE_FETCH_RADIALS.count - 1) / 2;
  return Array.from({ length: LAKE_FETCH_BINS }, (_, k) => {
    let s = 0;
    for (let r = -half; r <= half; r++) s += at(k * LAKE_FETCH_STEP_DEG + r * LAKE_FETCH_RADIALS.stepDeg);
    return Math.round((s / LAKE_FETCH_RADIALS.count) * 1000);
  });
}
/** Douglas–Peucker on a ring in degrees. */
export function simplifyRing(ring, tol) {
  if (ring.length <= 5) return ring.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bd = 0;
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-18;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i];
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
}

// --- outlines ----------------------------------------------------------------------------------------------

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export function outlineUrl(lake, spots) {
  if (lake.outline === 'dlm250') {
    const la = spots.map((s) => s.lat), lo = spots.map((s) => s.lon), m = 0.3;
    const box = [Math.min(...lo) - m * 1.6, Math.min(...la) - m, Math.max(...lo) + m * 1.6, Math.max(...la) + m].map((x) => x.toFixed(3)).join(',');
    return `https://sgx.geodatenzentrum.de/wfs_dlm250?service=WFS&version=2.0.0&request=GetFeature&TYPENAMES=dlm250:objart_44006_f&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=5000&BBOX=${box},EPSG:4326`;
  }
  if (lake.outline === 'swisstopo') return `https://api3.geo.admin.ch/rest/services/all/MapServer/find?layer=ch.swisstopo.swisstlm3d-gewaessernetz&searchText=${encodeURIComponent(lake.pick.name)}&searchField=name&contains=true&returnGeometry=true&geometryFormat=geojson&sr=4326`;
  if (lake.outline === 'euhydro') return `https://image.discomap.eea.europa.eu/arcgis/rest/services/EUHydro/EUHydro_RiverNetworkDatabase/MapServer/2/query?geometry=${lake.pick.at[1]},${lake.pick.at[0]}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OBJECTID,NAM,LAKID,AREA_GEO&returnGeometry=true&outSR=4326&f=geojson`;
  throw new Error(`${lake.id}: Umrissquelle ${lake.outline} ist nicht zugelassen (dlm250, swisstopo, euhydro)`);
}
/** The lake's polygons from a raw answer of its source. Throws with a reason when the answer does not carry the lake. */
export function outlinePolys(lake, raw, spots) {
  const j = JSON.parse(raw.toString('utf8'));
  let polys = [];
  if (lake.outline === 'dlm250') {
    const re = new RegExp(lake.pick.name);
    const feats = (j.features ?? []).filter((f) => re.test(String(f.properties?.nam ?? '')));
    polys = feats.flatMap((f) => polysOf(f.geometry));
    if (!polys.length) {
      const names = [...new Set((j.features ?? []).filter((f) => lakeAreaKm2(polysOf(f.geometry)) > 1).map((f) => f.properties?.nam))];
      throw new Error(`${lake.id}: kein DLM250-Objekt mit Namen /${lake.pick.name}/ im Rahmen — größere Namen dort: ${names.join(', ')}`);
    }
    // A name can occur twice in the box (a pond of the same name): keep the parts within 25 km of a spot.
    polys = polys.filter((rings) => spots.some((s) => { const n = nearestShore([rings], s.lat, s.lon); return n && n.km <= 25; }));
  } else if (lake.outline === 'swisstopo') {
    const cand = (j.results ?? []).map((r) => polysOf(r.geometry)).filter((p) => p.length);
    if (!cand.length) throw new Error(`${lake.id}: swisstopo nennt keine Fläche mit Namen ${lake.pick.name}`);
    polys = cand.sort((a, b) => lakeAreaKm2(b) - lakeAreaKm2(a))[0];
  } else {
    polys = (j.features ?? []).flatMap((f) => polysOf(f.geometry));
    if (!polys.length) throw new Error(`${lake.id}: EU-Hydro nennt am Punkt ${lake.pick.at.join(', ')} keine Fläche`);
    // EU-Hydro cuts a lake with a reed belt (Neusiedler See) into the open water and many small ponds and channels: a spot
    // belongs to the open water, so parts below `LAKE_EUHYDRO_MIN_PART` of the largest part are left out.
    const big = Math.max(...polys.map((rings) => lakeAreaKm2([rings])));
    polys = polys.filter((rings) => lakeAreaKm2([rings]) >= big * LAKE_EUHYDRO_MIN_PART);
  }
  if (!polys.length) throw new Error(`${lake.id}: kein Umriss`);
  return polys;
}
export async function loadOutline(lake, spots, cacheDir, fetchImpl = fetch) {
  const file = join(cacheDir, `outline-${lake.id}.json`);
  let raw;
  if (existsSync(file)) raw = readFileSync(file);
  else {
    const url = outlineUrl(lake, spots);
    const r = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`${lake.id}: Umriss HTTP ${r.status}`);
    raw = Buffer.from(await r.arrayBuffer());
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, raw);
    await new Promise((res) => setTimeout(res, 800));
  }
  return { polys: outlinePolys(lake, raw, spots), sha256: sha256(raw), bytes: raw.length };
}

// --- warning cells -------------------------------------------------------------------------------------------

/** The DWD lake warning cells of the recorded GeoServer answer: id, name, polygons. */
export function readWarnCells(file) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return (j.features ?? []).map((f) => ({ id: String(f.properties?.WARNCELLID ?? f.properties?.warncellid ?? ''), name: String(f.properties?.NAME ?? f.properties?.name ?? ''), polys: polysOf(f.geometry) }))
    .filter((c) => /^2\d{8}$/.test(c.id) && c.polys.length);
}
/** The cell that contains the point, else the nearest cell within 1 km of it, else `null`. */
export function warnCellAt(cells, lat, lon) {
  const hit = cells.find((c) => inLake(c.polys, lon, lat));
  if (hit) return { id: hit.id, name: hit.name, how: 'inside' };
  const near = cells.map((c) => ({ c, d: nearestShore(c.polys, lat, lon)?.km ?? Infinity })).sort((a, b) => a.d - b.d)[0];
  return near && near.d <= 1 ? { id: near.c.id, name: near.c.name, how: `nearest ${near.d.toFixed(2)} km` } : null;
}

// --- one spot, one lake ----------------------------------------------------------------------------------------

/** Everything the outline gives for one hand position. Throws with a reason (spot without water, too far from the shore). */
export function spotGeometry(spot, polys) {
  const shore = nearestShore(polys, spot.lat, spot.lon);
  if (!shore) throw new Error(`${spot.id}: kein Ufer im Umriss`);
  if (shore.km * 1000 > LAKE_SNAP_MAX_M) throw new Error(`${spot.id}: ${Math.round(shore.km * 1000)} m vom Ufer des Sees — Lage prüfen (Grenze ${LAKE_SNAP_MAX_M} m)`);
  const normal = shoreNormalOf(polys, shore.lat, shore.lon);
  if (normal == null) throw new Error(`${spot.id}: Ufernormale nicht bestimmbar (Wasser und Land heben sich auf)`);
  const pt = waterPointOf(polys, shore.lat, shore.lon, normal);
  if (!pt) throw new Error(`${spot.id}: kein Wasserpunkt vor dem Ufer (Spot ohne Wasserzelle)`);
  const fetch = fetchTableOf(polys, pt.lat, pt.lon);
  return { lat: +shore.lat.toFixed(5), lon: +shore.lon.toFixed(5), snapM: Math.round(shore.km * 1000), normal, pt: { ...pt, km: +distKm(shore.lat, shore.lon, pt.lat, pt.lon).toFixed(2) }, fetch };
}

const inCube = (p) => p.lat >= CUBE_DOMAIN.latMin && p.lat <= CUBE_DOMAIN.latMax && p.lon >= CUBE_DOMAIN.lonMin && p.lon <= CUBE_DOMAIN.lonMax;

/**
 * The catalogue from the hand list, the outlines, the warning cells and (optional) the step-0 measurement.
 * `outlines` = { lakeId: { polys, sha256, bytes } }.
 */
export function buildLakeCatalog({ src, outlines, cells, probe = null }) {
  const lakes = [], spots = [], notes = [], shapes = [];
  for (const l of src.lakes) {
    const mine = src.spots.filter((s) => s.lake === l.id);
    const o = outlines[l.id];
    if (!o) continue;
    const area = lakeAreaKm2(o.polys);
    if (Math.abs(area - l.areaKm2) / l.areaKm2 > 0.25) notes.push(`${l.id}: Umriss ${area.toFixed(1)} km² gegen ${l.areaKm2} km² der Quelle`);
    const bbox = lakeBbox(o.polys);
    const service = src.services[l.service];
    if (!service) throw new Error(`${l.id}: Dienst ${l.service} fehlt in der Handliste`);
    const lakeCells = new Map();
    const pl = probe?.lakes?.[l.id] ?? null;
    // WSV gauge: only when it stands at the lake itself.
    let wsv = null;
    if (pl?.wsv) {
      const d = inLake(o.polys, pl.wsv.lon, pl.wsv.lat) ? 0 : nearestShore(o.polys, pl.wsv.lat, pl.wsv.lon)?.km ?? Infinity;
      if (d <= LAKE_GAUGE_MAX_KM) wsv = { uuid: pl.wsv.uuid, name: l.wsv?.name ?? pl.wsv.name, lat: pl.wsv.lat, lon: pl.wsv.lon, series: pl.wsv.series, kmToLake: +d.toFixed(2) };
      else notes.push(`${l.id}: WSV-Pegel ${pl.wsv.name} steht ${d.toFixed(1)} km vom See — nicht verwendet`);
    }
    const bafu = (pl?.bafu ?? []).map((b) => ({ id: String(b.id), name: b.name, lat: b.lat, lon: b.lon }));
    for (const s of mine) {
      const g = spotGeometry(s, o.polys);
      if (!inCube(g.pt)) throw new Error(`${s.id}: Wasserpunkt außerhalb des Punkt-Cubes`);
      const cell = warnCellAt(cells, g.pt.lat, g.pt.lon);
      if (cell) lakeCells.set(cell.id, cell.name);
      const row = probe?.spots?.[s.id] ?? null;
      const wind = row?.wind ?? null;
      const near = (st) => ({ ...st, km: +distKm(g.lat, g.lon, st.lat, st.lon).toFixed(1) });
      const wsvAt = wsv ? near({ net: 'wsv', id: wsv.uuid, name: wsv.name, lat: wsv.lat, lon: wsv.lon }) : null;
      const bafuAt = bafu.map((b) => near({ net: 'bafu', id: b.id, name: b.name, lat: b.lat, lon: b.lon })).sort((a, b) => a.km - b.km)[0] ?? null;
      const alp = s.alp ?? l.alp ?? null;
      spots.push({
        id: s.id, name: s.name, region: 'binnensee', kinds: s.kinds, lat: g.lat, lon: g.lon, normal: g.normal, normalFrom: 'outline',
        seaArea: null, coast: null, wodlCoast: null,
        station: wind ? { id: wind.id, name: wind.name, km: wind.km, lat: wind.lat, lon: wind.lon, net: 'obs' } : null,
        lake: {
          id: l.id, land: s.land, elevM: l.elevM, depthM: l.depthM, depthFrom: l.depthFrom ?? l.factsFrom, pt: g.pt, fetch: g.fetch,
          warncell: cell ? { id: cell.id, name: cell.name } : null,
          stations: {
            wind,
            wt: wsvAt && wsv.series.includes('WT') && wsvAt.km <= LAKE_WT_NEAR_KM ? wsvAt : null,
            level: wsvAt ?? bafuAt,
          },
          ...(alp ? { model: { src: 'alplakes', key: alp } } : {}),
          fusion: { country: s.land },
        },
        _how: { snapM: g.snapM, hand: [s.lat, s.lon], cell: cell?.how ?? null },
      });
    }
    lakes.push({
      id: l.id, name: l.name, lands: l.lands, elevM: l.elevM, depthM: l.depthM, areaKm2: l.areaKm2, factsFrom: l.factsFrom, depthFrom: l.depthFrom ?? l.factsFrom,
      outline: { source: l.outline, credit: OUTLINE_CREDIT[l.outline], sha256: o.sha256, areaKm2: +area.toFixed(1) }, bbox,
      warncells: [...lakeCells].map(([id, name]) => ({ id, name })), service,
      ...(l.foreign ? { foreign: l.foreign } : {}),
      water: { wsv, bafu, alp: [...new Set([l.alp, ...mine.map((s) => s.alp)].filter(Boolean))] },
    });
    shapes.push({
      type: 'Feature', properties: { id: l.id, name: l.name, source: l.outline },
      geometry: { type: 'MultiPolygon', coordinates: o.polys.map((rings) => rings.map((r) => simplifyRing(r, 0.0003)).filter((r) => r.length >= 4)).filter((rings) => rings.length) },
    });
  }
  return { lakes, spots, notes, shapes };
}

/** Catalogue rules of the lake spots that do not need the generic spot rules (the verifier and the builder share them). */
export function lakeCatalogProblems(cat) {
  const out = [...lakeTableProblems(cat.lakes)];
  const ids = new Set(), lakeIds = new Set(cat.lakes.map((l) => l.id));
  for (const s of cat.spots) {
    if (ids.has(s.id)) out.push(`${s.id}: doppelt`);
    ids.add(s.id);
    if (!(s.normal >= 0 && s.normal < 360)) out.push(`${s.id}: Ufernormale ${s.normal}`);
    out.push(...lakeBlockProblems(s.id, s, s.lake));
    if (s.lake && !lakeIds.has(s.lake.id)) out.push(`${s.id}: See ${s.lake.id} nicht in der Tabelle`);
    if (s.lake?.pt && s.lake.pt.km > LAKE_PT_MAX_KM) out.push(`${s.id}: Wasserpunkt ${s.lake.pt.km} km`);
  }
  return out;
}

/** Terrain + z0 cache entries at the water points; the height is the lake's surface elevation, the read value stays in `elevationRead`. */
export async function buildLakeGeo(spots, opts = {}) {
  const { buildGeo } = await import('../road/build-fc-points.mjs');
  const pts = spots.map((s) => ({ id: s.id, lat: s.lake.pt.lat, lon: s.lake.pt.lon }));
  const { entries, failed } = await buildGeo(pts, opts);
  // One terrain entry per point; the key carries the position, so the lake of an entry is the lake of the nearest water point.
  const fixed = entries.map(([k, v]) => {
    const m = k.startsWith('terrain/') ? /\/(-?\d+\.\d+),(-?\d+\.\d+)$/.exec(k) : null;
    if (!m) return [k, v];
    const sp = spots.map((s) => ({ s, d: distKm(+m[1], +m[2], s.lake.pt.lat, s.lake.pt.lon) })).sort((a, b) => a.d - b.d)[0];
    return sp && sp.d < 0.2 ? [k, { ...v, elevationM: sp.s.lake.elevM, elevationRead: v.elevationM }] : [k, v];
  });
  return { schema: 1, product: 'sea-lake-geo', note: 'Cache-Einträge der Client-Leser (Terrarium z11 + z8, ESA WorldCover 2021, CC BY 4.0) am Wasserpunkt jedes Seespots; Höhe = Seespiegel des Sees aus dem Katalog, gelesene Höhe in elevationRead. Nur für den Producer.', failed, entries: fixed };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const src = JSON.parse(readFileSync(join(HERE, 'lakes-src.json'), 'utf8'));
  if (typeof args.only === 'string') { src.lakes = src.lakes.filter((l) => l.id === args.only); src.spots = src.spots.filter((s) => s.lake === args.only); }
  const cacheDir = resolve(ROOT, String(args.cache ?? '.sea-cache/lakes'));
  const cells = readWarnCells(resolve(ROOT, String(args.cells ?? LAKE_CELLS_FILE)));
  const probeFile = resolve(ROOT, String(args.probe ?? LAKE_PROBE_FILE));
  const probe = args.draft ? null : existsSync(probeFile) ? JSON.parse(readFileSync(probeFile, 'utf8')) : null;
  if (!probe && !args.draft) throw new Error(`keine Messung ${probeFile} — erst scripts/sea/spike/lake-probe.mjs laufen lassen (oder --draft)`);
  const outlines = {};
  for (const l of src.lakes) {
    outlines[l.id] = await loadOutline(l, src.spots.filter((s) => s.lake === l.id), cacheDir);
    console.log(`Umriss ${l.id.padEnd(22)} ${l.outline.padEnd(9)} ${String(outlines[l.id].polys.length).padStart(2)} Teile, ${lakeAreaKm2(outlines[l.id].polys).toFixed(1).padStart(6)} km² (Quelle ${l.areaKm2}), ${outlines[l.id].bytes} B`);
  }
  const cat = buildLakeCatalog({ src, outlines, cells, probe });
  for (const s of cat.spots) console.log(`${s.id.padEnd(30)} Ufer ${String(s._how.snapM).padStart(4)} m · zeigt ${String(s.normal).padStart(3)}° · Fetch ${Math.min(...s.lake.fetch)}–${Math.max(...s.lake.fetch)} m · Zelle ${s.lake.warncell?.name ?? '–'}${s._how.cell && s._how.cell !== 'inside' ? ` (${s._how.cell})` : ''} · Wind ${s.lake.stations.wind ? `${s.lake.stations.wind.name} ${s.lake.stations.wind.km} km` : '–'} · Pegel ${s.lake.stations.level ? `${s.lake.stations.level.net} ${s.lake.stations.level.name} ${s.lake.stations.level.km} km` : '–'} · WT ${s.lake.stations.wt ? s.lake.stations.wt.name : '–'} · Modell ${s.lake.model?.key ?? '–'}`);
  for (const n of cat.notes) console.log(`Hinweis: ${n}`);
  const problems = lakeCatalogProblems(cat);
  console.log(`\n${cat.lakes.length} Seen, ${cat.spots.length} Spots, ${problems.length} Befunde${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  if (typeof args.out === 'string') {
    mkdirSync(args.out, { recursive: true });
    const built = new Date().toISOString();
    const spots = cat.spots.map(({ _how, ...s }) => s);
    const doc = {
      schema: 1, product: 'sea-spots', part: 'lakes', built,
      about: 'Binnenseen des Seewetters (Phase BS, audit/seewetter-binnenseen.md). Spots in der Form von static/spots.json, ohne CWAM-Zelle, mit lake-Block: See, Land, Seespiegel (die Höhe, auf der buscosun Fusion rechnet), mittlere Tiefe mit Quelle, Wasserpunkt, Fetch je 10° Windrichtung aus dem Umriss (Mittel aus neun Strahlen im Abstand von 3°, Shore Protection Manual 1984), DWD-Warnzelle für Binnenseen, Stationen (Wind aus obs/v1; Wassertemperatur und Pegel nur von WSV PEGELONLINE und BAFU), Landesparameter von buscosun Fusion. Kein Seegang aus einem Wellenmodell: die Seite schätzt die Windwelle selbst.',
      from: { src: 'scripts/sea/lakes-src.json', probe: probe ? String(args.probe ?? LAKE_PROBE_FILE) : null, cells: String(args.cells ?? LAKE_CELLS_FILE), facts: src.factsFetchedAt },
      notes: cat.notes, lakes: cat.lakes, spots,
    };
    writeFileSync(join(args.out, 'spots-lakes.json'), JSON.stringify(doc) + '\n');
    const shapes = { type: 'FeatureCollection', schema: 1, product: 'sea-lakes-shapes', built, credits: [...new Set(cat.lakes.map((l) => l.outline.credit))], features: cat.shapes };
    writeFileSync(join(args.out, 'lakes.json'), JSON.stringify(shapes) + '\n');
    console.log(`geschrieben: spots-lakes.json (${spots.length} Spots, ${Buffer.byteLength(JSON.stringify(doc))} B) · lakes.json (${Buffer.byteLength(JSON.stringify(shapes))} B)`);
    if (args.geo) {
      const { installNodeShims } = await import('../punktarchiv/lib/nodeShims.mjs');
      installNodeShims();
      const geo = await buildLakeGeo(spots);
      writeFileSync(join(args.out, 'lake-geo.json'), JSON.stringify(geo) + '\n');
      console.log(`lake-geo.json: ${geo.entries.length} Einträge, ${geo.failed.length} Spots unvollständig, ${geo.entries.filter(([, v]) => v.elevationRead != null).length} Höhen auf den Seespiegel gesetzt`);
    }
  }
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
