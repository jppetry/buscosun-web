#!/usr/bin/env node
/**
 * AW-6.2.2 — builds the static site file of the virtual road sensor (`road/vs/v1/static/site.json.gz`, contract
 * `src/road/vs/roadVsSite.ts`, `audit/autobahnwetter.md` §20.8) for every point of `road/fc/v1/static/points.json`:
 *
 *   horizon 1° / SVF   near field 0 … 5 km from the Copernicus DEM GLO-30 (30 m, AWS COG, range reads, disk cache), rays every
 *                      30 m with earth curvature and refraction; far field from the 8-direction horizon of the terrain cache
 *                      (`geo.json`, z8 ring 20,5 km) — the maximum of both per azimuth.
 *   bridge             axis point: OSM `bridge` of the snapped way (`points.json`); station: DWD SWSMOS catalogue Streckentyp 2.
 *   cutting/embankment/forest  shares of the segment the point lies in (`segments.json`: OSM tags, ESA WorldCover).
 *   surface            station: catalogue Streckenbelag (1 Asphalt, 2 Beton); axis: segment concrete share ≥ 0,5 ⇒ Beton, else
 *                      Asphalt (`set`: OSM `surface` is rarely tagged on motorways).
 *   lanes/width        OSM lanes are not in any local cache ⇒ null, width 2 × 3,75 m (`set`, RAA RQ 31).
 *   terrain            class from TPI 2 000 m and slope of the terrain cache; cross slope 2,5 %, `geom: unknown` in curves
 *                      with radius < 4 000 m (corridor line of `corridors.json`, E-VS-5).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/build-site.mjs
 *     --data=<checkout of buscosun-data> --cache=<dir for GLO-30 tiles> [--out=<file>] [--limit=N] [--ids=a,b] [--katalog=<json>]
 * Writes the file into the checkout (`road/vs/v1/static/site.json.gz`) unless `--out` is given. One-off; re-run when the
 * points file changes (the file names the points sha).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { glo30Reader, GLO30_ATTRIBUTION } from './glo30.mjs';
import { parseKatalog, SWSMOS_BASE } from '../swsmos-archive.mjs';
import { decompressBz2 } from '../../lib/bz2.mjs';
import {
  ROAD_VS_SITE_PATH, ROAD_VS_HORIZON_N, ROAD_VS_HORIZON_NEAR_KM, ROAD_VS_HORIZON_STEP_M, ROAD_VS_CROSS_SLOPE_PCT, ROAD_VS_CURVE_UNKNOWN_R_M,
  ROAD_VS_LANE_WIDTH_M, ROAD_VS_DEFAULT_LANES, ROAD_VS_CONCRETE_SHARE,
  svfOf, horizon8to360, horizonAngleDeg, terrainClassOf, curveRadiusM, roadVsSiteProblems,
} from '../../../src/road/vs/roadVsSite.ts';
import { ROAD_VS_REPO_DIR } from '../../../src/road/vs/roadVsForcing.ts';
import { ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH } from '../../../src/road/roadFc.ts';
import { ROAD_REPO_DIR, ROAD_CORRIDORS_PATH } from '../../../src/road/roadContract.ts';

const sha12 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
const RAD = Math.PI / 180;

/** Near-field horizon (°, 360 azimuths) of one point from a reader with the box prefetched. */
export function nearHorizon(zAt, lat, lon, { nearKm = ROAD_VS_HORIZON_NEAR_KM, stepM = ROAD_VS_HORIZON_STEP_M } = {}) {
  const z0 = zAt(lat, lon);
  if (!Number.isFinite(z0)) return null;
  const out = new Float64Array(ROAD_VS_HORIZON_N);
  const mPerDegLat = 111_200, mPerDegLon = 111_200 * Math.cos(lat * RAD);
  const n = Math.round((nearKm * 1000) / stepM);
  for (let az = 0; az < ROAD_VS_HORIZON_N; az++) {
    const sa = Math.sin(az * RAD), ca = Math.cos(az * RAD);
    let best = 0;
    for (let k = 1; k <= n; k++) {
      const d = k * stepM;
      const z = zAt(lat + (d * ca) / mPerDegLat, lon + (d * sa) / mPerDegLon);
      if (!Number.isFinite(z)) continue;
      const a = horizonAngleDeg(z - z0, d);
      if (a > best) best = a;
    }
    out[az] = best;
  }
  return { z0, hz: out };
}

/** Segment index: point id → segment, station id → segment (own, else `near`). */
export function segmentIndex(segments) {
  const byPoint = new Map(), byStation = new Map();
  for (const s of segments) {
    for (const id of s.points ?? []) byPoint.set(id, s);
    for (const id of s.stations ?? []) byStation.set(id, s);
  }
  for (const s of segments) for (const id of s.near ?? []) if (!byStation.has(id)) byStation.set(id, s);
  return { byPoint, byStation };
}

/** Curve radius at the corridor vertex nearest to the point (three vertices ≈ 1–3 km), null off any corridor line. */
export function curveAt(line, lat, lon) {
  if (!Array.isArray(line) || line.length < 3) return null;
  let best = -1, bd = Infinity;
  const cosLat = Math.cos(lat * RAD);
  for (let i = 0; i < line.length; i++) { const dx = (line[i][0] - lon) * cosLat, dy = line[i][1] - lat; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
  if (Math.sqrt(bd) * 111.2 > 1.5) return null;
  const i = Math.min(line.length - 2, Math.max(1, best));
  return curveRadiusM(line[i - 1], line[i], line[i + 1]);
}

export async function buildSite({ dataDir, cacheDir, out = null, limit = null, ids = null, katalogFile = null, log = () => {} }) {
  const T0 = Date.now();
  const pointsBytes = readFileSync(join(dataDir, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH));
  let points = JSON.parse(pointsBytes.toString('utf8')).points;
  if (ids) { const want = new Set(ids); points = points.filter((p) => want.has(p.id)); }
  if (limit) points = points.slice(0, limit);
  const geo = JSON.parse(readFileSync(join(dataDir, ROAD_FC_REPO_DIR, ROAD_FC_GEO_PATH), 'utf8'));
  const geoByKey = new Map();
  for (const [k, v] of geo.entries ?? []) if (k.startsWith('terrain/')) geoByKey.set(k.slice(k.lastIndexOf('/') + 1), v);
  const geoOf = (p) => geoByKey.get(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`) ?? null;
  const segments = JSON.parse(readFileSync(join(dataDir, ROAD_REPO_DIR, 'static/segments.json'), 'utf8')).segments;
  const { byPoint, byStation } = segmentIndex(segments);
  const corridors = JSON.parse(readFileSync(join(dataDir, ROAD_REPO_DIR, ROAD_CORRIDORS_PATH), 'utf8')).corridors;
  const lineOf = new Map(corridors.map((c) => [c.id, c.line]));
  let katalog = null;
  try {
    const raw = katalogFile ? readFileSync(katalogFile) : await decompressBz2(new Uint8Array(await (await fetch(`${SWSMOS_BASE}/swsKatalog.csv.bz2`)).arrayBuffer()));
    katalog = (katalogFile && /\.json$/.test(katalogFile) ? JSON.parse(raw.toString('utf8')) : parseKatalog(raw)).stations;
  } catch (e) { log(`SWSMOS-Katalog nicht geladen (${e.message}) — Brücke/Belag der Stationen bleiben ohne Quelle`); }

  const dem = glo30Reader({ cacheDir, log });
  // Points sorted by degree tile, then latitude: neighbours share tiles.
  const sorted = [...points].sort((a, b) => Math.floor(a.lat) - Math.floor(b.lat) || Math.floor(a.lon) - Math.floor(b.lon) || a.lat - b.lat || a.lon - b.lon);
  const site = {};
  const counts = { points: 0, horizon: 0, noDem: 0, bridge: 0, beton: 0, unknownGeom: 0, segment: 0, terrain: {} };
  const dLat = ROAD_VS_HORIZON_NEAR_KM / 111.2 + 0.002;
  let i = 0;
  for (const p of sorted) {
    i++;
    const dLon = dLat / Math.cos(p.lat * RAD);
    let near = null;
    try {
      await dem.prefetch(p.lat - dLat, p.lat + dLat, p.lon - dLon, p.lon + dLon);
      near = nearHorizon(dem.zAt, p.lat, p.lon);
    } catch (e) { log(`${p.id}: GLO-30 ${e.message}`); }
    const g = geoOf(p);
    let hz = null, svf = null;
    if (near) {
      const far = g?.horizonDeg?.length === 8 ? horizon8to360(g.horizonDeg) : null;
      hz = Array.from(near.hz, (v, az) => Math.round(Math.max(0, Math.min(90, Math.max(v, far ? far[az] : 0))) * 10));
      svf = svfOf(hz.map((x) => x / 10));
      counts.horizon++;
    } else counts.noDem++;
    const seg = p.kind === 'station' ? byStation.get(p.id) ?? null : byPoint.get(p.id) ?? null;
    if (seg) counts.segment++;
    const kat = p.kind === 'station' && katalog ? katalog[p.id] ?? null : null;
    const bridge = p.kind === 'station' ? kat?.typ === 2 : !!p.bridge;
    const bridgeSrc = p.kind === 'station' ? (kat ? 'swsmos' : null) : 'points';
    let surface = 'asphalt', surfaceSrc = 'set';
    if (kat?.belag === 2) { surface = 'beton'; surfaceSrc = 'swsmos'; } else if (kat?.belag === 1) { surfaceSrc = 'swsmos'; } else if (seg && (seg.f?.concrete ?? 0) >= ROAD_VS_CONCRETE_SHARE) { surface = 'beton'; surfaceSrc = 'osm'; }
    const corridorId = p.corridor ?? seg?.corridor ?? null;
    const radius = corridorId ? curveAt(lineOf.get(corridorId), p.lat, p.lon) : null;
    const geom = radius != null && radius < ROAD_VS_CURVE_UNKNOWN_R_M ? 'unknown' : 'standard';
    const terrain = terrainClassOf(g?.tpi2000M ?? null, g?.slopeDeg ?? null);
    counts.terrain[terrain] = (counts.terrain[terrain] ?? 0) + 1;
    if (bridge) counts.bridge++;
    if (surface === 'beton') counts.beton++;
    if (geom === 'unknown') counts.unknownGeom++;
    site[p.id] = {
      hz, svf, zDsm: near ? Math.round(near.z0 * 10) / 10 : null, zTerrain: g?.elevationM != null ? Math.round(g.elevationM * 10) / 10 : null,
      bridge, bridgeSrc, cutting: seg?.f?.cutting ?? null, embankment: seg?.f?.embankment ?? null, forest: seg?.f?.forest ?? null,
      surface, surfaceSrc, lanes: null, lanesSrc: null, widthM: ROAD_VS_DEFAULT_LANES * ROAD_VS_LANE_WIDTH_M,
      terrain, tpi500: g?.tpi500M ?? null, tpi2000: g?.tpi2000M ?? null, slopeDeg: g?.slopeDeg ?? null,
      crossSlopePct: ROAD_VS_CROSS_SLOPE_PCT, geom, curveRadiusM: radius, segment: seg?.id ?? null,
    };
    counts.points++;
    if (i % 250 === 0) log(`${i}/${sorted.length} Punkte · GLO-30 ${dem.stats.tileFetches} Kacheln geholt (${(dem.stats.bytes / 1e6).toFixed(0)} MB), ${dem.stats.tileCacheHits} Treffer · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  }
  const doc = {
    schema: 1, product: 'road-vs-site', builtAt: new Date().toISOString(), points: sha12(pointsBytes),
    near: { km: ROAD_VS_HORIZON_NEAR_KM, stepM: ROAD_VS_HORIZON_STEP_M, dem: 'Copernicus DEM GLO-30 (DSM)' }, far: 'terrain cache geo.json, 8 Richtungen (z11 r2500 + z8 r20500)',
    sources: [
      { what: 'Horizont, Himmelssichtfaktor, DSM-Höhe', name: 'Copernicus DEM GLO-30 (AWS Open Data copernicus-dem-30m)', license: 'Copernicus DEM licence (free use with attribution)', attribution: GLO30_ATTRIBUTION },
      { what: 'Brücke, Einschnitt, Damm, Belag (Achspunkte)', name: 'OpenStreetMap über road/v1/static/segments.json und points.json', license: 'ODbL 1.0', attribution: '© OpenStreetMap-Mitwirkende' },
      { what: 'Wald-Anteil', name: 'ESA WorldCover 2021 über segments.json', license: 'CC BY 4.0', attribution: '© ESA WorldCover project 2021' },
      { what: 'Brücke, Belag (Stationen)', name: 'DWD SWSMOS-Katalog swsKatalog.csv', license: 'CC BY 4.0 / GeoNutzV', attribution: 'Deutscher Wetterdienst' },
      { what: 'Geländeklasse, Fernhorizont', name: 'Terrain-Cache der Streckenprognose (geo.json, Terrarium-Kacheln)', license: 'wie geo.json', attribution: 'Mapzen/AWS Terrain Tiles' },
    ],
    counts: { ...counts, glo30: { ...dem.stats } }, site,
  };
  const problems = roadVsSiteProblems(doc);
  if (problems.length) throw new Error(`site.json besteht den eigenen Prüfer nicht: ${problems.join('; ')}`);
  const file = out ?? join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_SITE_PATH);
  mkdirSync(dirname(file), { recursive: true });
  const gz = gzipSync(JSON.stringify(doc), { level: 9 });
  writeFileSync(`${file}.tmp`, gz); renameSync(`${file}.tmp`, file);
  log(`site: ${counts.points} Punkte, Horizont ${counts.horizon}, ohne DEM ${counts.noDem}, Brücke ${counts.bridge}, Beton ${counts.beton}, Geometrie unbekannt ${counts.unknownGeom}, mit Abschnitt ${counts.segment}, Gelände ${JSON.stringify(counts.terrain)} · ${(gz.length / 1e6).toFixed(2)} MB gz · GLO-30 ${dem.stats.tileFetches} Kacheln / ${(dem.stats.bytes / 1e6).toFixed(0)} MB · ${((Date.now() - T0) / 1000).toFixed(0)} s → ${file}`);
  return { doc, file };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (!flags.data || !flags.cache) { console.error('--data=<Klon von buscosun-data> und --cache=<Ordner für GLO-30-Kacheln> fehlen'); process.exit(2); }
  await buildSite({
    dataDir: flags.data, cacheDir: flags.cache, out: typeof flags.out === 'string' ? flags.out : null,
    limit: flags.limit ? Number(flags.limit) : null, ids: typeof flags.ids === 'string' ? flags.ids.split(',') : null,
    katalogFile: typeof flags.katalog === 'string' ? flags.katalog : null, log: (m) => console.log(`[road-vs-site] ${m}`),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
