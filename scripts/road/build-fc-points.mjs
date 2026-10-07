#!/usr/bin/env node
/**
 * AW-6.1 — Points of the route forecast → `road/fc/v1/static/points.json` (+ `static/geo.json`), built offline and
 * pushed by hand like the corridors (`audit/autobahnwetter.md` §14, E-AW-17/E-AW-21).
 *
 *   axis points   every `ROAD_FC_SPACING_KM` of corridor axis, snapped onto the OSM carriageway of that motorway
 *                 (`highway=motorway`, matching `ref`, not a tunnel; ≤ `ROAD_FC_SNAP_MAX_M`); a tunnel under the
 *                 nominal position slides the point along the axis; no carriageway in reach ⇒ the point stays on
 *                 the axis and says so (`snap: null`). Bridge = the OSM way carries `bridge`.
 *   station points every road-weather station of the catalogue with coordinates that is not out of service — at the
 *                 catalogue position (the measuring site), with corridor and km where the corridor lists it; with
 *                 `--obs=<obs files>` also every station that reports but has no catalogue row (V-AW-7, 136 on
 *                 03.10.2026) — at the bulletin position (E-AW-7), file key = its DWD series (`noCatalog: true`).
 *   unbuilt        axis points inside a corridor's `unbuilt` ranges (V-AW-22) are not built: no carriageway, no forecast.
 *   geo           terrain (Terrarium z11 + z8) and roughness (WorldCover) per point, computed with the CLIENT's loaders
 *                 through a recording cache — the producer preloads exactly these cache entries, so the engine sees
 *                 what a browser at that point would have computed.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/build-fc-points.mjs
 *     --corridors=<corridors.json> --stations=<stations.json> --osm=<cache.json> --out=<road/fc/v1/static>
 *     [--no-geo] [--no-snap] [--roads=A8,A81] [--obs=<obs.json,…>] [--geo-from=<previous geo.json>]
 *   `--geo-from`: cache entries of the previous geo file are taken over — only new points go to the tile servers.
 *
 * OSM: one Overpass query for all motorways of Germany (≈ 55 MB), cached in `--osm`. Position licence of the snapped
 * points: ODbL, © OpenStreetMap contributors — named in the file.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, toRgba } from '../lib/png.mjs';
import {
  ROAD_FC_SPACING_KM, ROAD_FC_SNAP_MAX_M, ROAD_FC_SLIDE_KM, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH,
  roadFcAxisKms, roadFcAxisId, roadPointAtKm,
} from '../../src/road/roadFc.ts';
import { loadTerrainAtPoint } from '../../src/point/client/terrain.ts';
import { loadZ0AtPoint } from '../../src/point/client/z0Point.ts';
import { readStationPositions, stationPosition } from './station-positions.mjs';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'buscosun-road-fc-points (buscosun-web/audit/autobahnwetter.md)';
const OSM_QUERY = '[out:json][timeout:600][maxsize:1073741824];area["ISO3166-1"="DE"][admin_level=2]->.de;way[highway=motorway](area.de);out tags geom;';
/** A motorway way WITHOUT the corridor's number (no `ref`, or another one: A 831 where DLM250 says A 81, the last metres
 *  before a junction) is accepted only this close (m) — the axis then runs on that carriageway. */
const OTHER_REF_MAX_M = 150;
const CELL_DEG = 0.01;

const R_M = 6_371_000, RAD = Math.PI / 180;
const round5 = (x) => Math.round(x * 1e5) / 1e5;

/** Foot of `p` on segment a–b: distance in metres and the foot `[lon, lat]`. */
export function footOnSegment(p, a, b) {
  const kx = Math.cos(p[1] * RAD) * RAD * R_M, ky = RAD * R_M;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), foot: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
}

export const refsOf = (tags) => String(tags?.ref ?? '').split(/[;,/]+/).map((s) => s.replace(/\s+/g, '').toUpperCase()).filter(Boolean);

/** Grid index over the motorway segments of the OSM extract. */
export function buildOsmIndex(osm) {
  const cells = new Map();
  let ways = 0, segs = 0;
  for (const e of osm.elements ?? []) {
    if (e.type !== 'way' || !Array.isArray(e.geometry) || e.tags?.highway !== 'motorway') continue;
    ways++;
    const w = {
      refs: refsOf(e.tags),
      tunnel: (e.tags.tunnel != null && e.tags.tunnel !== 'no') || e.tags.covered === 'yes',
      bridge: e.tags.bridge != null && e.tags.bridge !== 'no',
    };
    for (let i = 1; i < e.geometry.length; i++) {
      const a = [e.geometry[i - 1].lon, e.geometry[i - 1].lat], b = [e.geometry[i].lon, e.geometry[i].lat];
      const seg = { a, b, w };
      segs++;
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL_DEG), x1 = Math.floor(Math.max(a[0], b[0]) / CELL_DEG);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL_DEG), y1 = Math.floor(Math.max(a[1], b[1]) / CELL_DEG);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        let c = cells.get(k);
        if (!c) { c = []; cells.set(k, c); }
        c.push(seg);
      }
    }
  }
  const near = (p) => {
    const cx = Math.floor(p[0] / CELL_DEG), cy = Math.floor(p[1] / CELL_DEG);
    const out = new Set();
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (const s of cells.get(`${x},${y}`) ?? []) out.add(s);
    return out;
  };
  return { near, ways, segs };
}

/**
 * Nearest carriageway of `road` at `p`: `{ d, foot, bridge, tunnel, other }` or `null`. Ways with the matching `ref`
 * win within `ROAD_FC_SNAP_MAX_M`; any other motorway way counts only within `OTHER_REF_MAX_M` (`other` = its refs).
 */
export function nearestCarriageway(index, p, road) {
  let best = null;
  for (const s of index.near(p)) {
    const match = s.w.refs.includes(road);
    const f = footOnSegment(p, s.a, s.b);
    if (f.d > (match ? ROAD_FC_SNAP_MAX_M : OTHER_REF_MAX_M)) continue;
    // The corridor's own number beats any other way; among equals the nearer one.
    if (!best || (match && best.other) || (match === !best.other && f.d < best.d)) best = { d: f.d, foot: f.foot, bridge: s.w.bridge, tunnel: s.w.tunnel, other: match ? null : s.w.refs.join(';') || '—' };
  }
  return best;
}

/** Axis points of one corridor (nominal km on OUR axis, position snapped onto OSM). */
export function axisPointsOf(corridor, index) {
  const out = [];
  const kms = roadFcAxisKms(corridor.lengthKm);
  for (const km of kms) {
    // V-AW-22: no forecast point on a stretch without carriageway (corridors.json `unbuilt`).
    if ((corridor.unbuilt ?? []).some(([a, b]) => km >= a && km <= b)) continue;
    const atEnd = km === kms[0] || km === kms[kms.length - 1];
    const id = roadFcAxisId(corridor.id, km);
    const nominal = roadPointAtKm(corridor.line, km);
    if (!index) { out.push({ id, kind: 'axis', corridor: corridor.id, km, lat: round5(nominal[1]), lon: round5(nominal[0]), snap: null }); continue; }
    let hit = null, slide = 0, sawTunnel = false;
    for (const off of ROAD_FC_SLIDE_KM) {
      const k = km + off;
      // The last nominal km is the length rounded to 100 m — it may exceed the length by a few metres.
      if (k < 0 || k > corridor.lengthKm + 0.05) continue;
      const c = nearestCarriageway(index, off === 0 ? nominal : roadPointAtKm(corridor.line, k), corridor.road);
      if (c && !c.tunnel) { hit = c; slide = off; break; }
      if (c?.tunnel) sawTunnel = true;
      // Sliding answers a tunnel, or a corridor end that overshoots the motorway (inward only, by the bounds above) —
      // an inner position without any carriageway in reach stays where it is.
      if (off === 0 && !c && !atEnd) break;
    }
    if (hit) {
      out.push({ id, kind: 'axis', corridor: corridor.id, km, lat: round5(hit.foot[1]), lon: round5(hit.foot[0]), snap: Math.round(hit.d), ...(slide ? { slide } : {}), ...(hit.bridge ? { bridge: true } : {}), ...(hit.other ? { osmRef: hit.other } : {}) });
    } else {
      out.push({ id, kind: 'axis', corridor: corridor.id, km, lat: round5(nominal[1]), lon: round5(nominal[0]), snap: null, ...(sawTunnel ? { tunnel: true } : {}) });
    }
  }
  return out;
}

/**
 * Station points from the catalogue; corridor and km from the corridors that list the station. `reporting` (V-AW-7):
 * points of recent obs files — a station there without a catalogue row joins at its bulletin position.
 * M6: with `positions` (`station-positions.json`) a reporting station sits where its measured marker sits — the
 * bulletin's position, or the catalogue's where only that one lies at the station's road (`pos: 'catalog'`); a station
 * that does not report keeps the catalogue position. Without `positions` the catalogue position as before.
 */
export function stationPointsOf(stations, corridors, reporting = [], positions = null) {
  const where = new Map();
  for (const c of corridors) for (const s of c.stations) if (!where.has(s.id)) where.set(s.id, { corridor: c.id, km: s.km });
  // The bulletin's own position: `rpos` where a slot already shows another one (since M6), else the point's.
  const reported = new Map();
  for (const r of reporting) if (r?.id) reported.set(r.id, Array.isArray(r.rpos) ? { lat: r.rpos[0], lon: r.rpos[1] } : { lat: r.lat, lon: r.lon });
  const out = [];
  for (const [key, s] of Object.entries(stations)) {
    const id = s.id ?? key;
    if (s.oob || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const w = where.get(id);
    let lat = s.lat, lon = s.lon, pos = null;
    if (positions && reported.has(id)) {
      const p = stationPosition(positions, id, reported.get(id), { lat: s.lat, lon: s.lon });
      if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) { lat = p.lat; lon = p.lon; pos = p.flag === 'posCatalog' ? 'catalog' : 'report'; }
    }
    out.push({ id, kind: 'station', corridor: w?.corridor ?? null, km: w?.km ?? null, lat: round5(lat), lon: round5(lon), state: s.bl ?? 'XX', name: s.n ?? id, ...(pos ? { pos } : {}) });
  }
  const known = new Set(out.map((p) => p.id));
  const inCatalog = new Set(Object.entries(stations).map(([k, s]) => s.id ?? k));
  for (const r of reporting) {
    if (!r?.id || known.has(r.id) || inCatalog.has(r.id) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    known.add(r.id);
    const w = where.get(r.id);
    const st = /-([A-Z]{2})$/.exec(r.g ?? '')?.[1] ?? 'XX';
    out.push({ id: r.id, kind: 'station', corridor: w?.corridor ?? null, km: w?.km ?? null, lat: round5(r.lat), lon: round5(r.lon), state: st, name: r.n ?? r.id, noCatalog: true });
  }
  return out;
}

export function buildPoints({ corridors, stations, index, reporting = [], positions = null, axisFrom = null }) {
  // `axisFrom`: the axis points of an existing points file, taken over unchanged (M6 rebuilds only the stations).
  const axis = axisFrom ? axisFrom.filter((p) => p.kind === 'axis') : corridors.flatMap((c) => axisPointsOf(c, index));
  const st = stationPointsOf(stations, corridors, reporting, positions);
  const counts = {
    axis: axis.length, station: st.length, noCatalog: st.filter((p) => p.noCatalog).length,
    snapped: axis.filter((p) => p.snap != null).length, unsnapped: axis.filter((p) => p.snap == null).length,
    slid: axis.filter((p) => p.slide).length, bridge: axis.filter((p) => p.bridge).length,
  };
  return { points: [...axis, ...st], counts };
}

/** Recording cache: result entries (`terrain/…`, `z0:…`) are kept for the file, tile bytes live in a bounded LRU. */
export function recordingCache(tileCap = 500) {
  const results = new Map(), tiles = new Map(), touched = new Set();
  const isResult = (k) => k.startsWith('terrain/') || k.startsWith('z0:');
  return {
    kind: 'recording', results, touched,
    async get(k) {
      if (isResult(k)) { touched.add(k); return results.get(k) ?? null; }
      const e = tiles.get(k);
      if (e) { tiles.delete(k); tiles.set(k, e); }
      return e ?? null;
    },
    async put(k, e) {
      if (isResult(k)) { touched.add(k); results.set(k, e); return; }
      tiles.set(k, e);
      if (tiles.size > tileCap) tiles.delete(tiles.keys().next().value);
    },
    async sweep() { return 0; },
  };
}

const rgba = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };

/**
 * Terrain and roughness for every point through the client's loaders; returns the cache entries as `[key, object]`.
 * `terrainOpts` (verifier: a tile source without network) and `z0: false` narrow the run.
 */
export async function buildGeo(points, { concurrency = 6, log = () => {}, retries = 3, terrainOpts = {}, z0 = true, seed = [] } = {}) {
  const cache = recordingCache();
  const enc = new TextEncoder();
  for (const [k, v] of seed) cache.results.set(k, { bytes: enc.encode(JSON.stringify(v)), storedAt: 0 });
  const failed = [];
  let done = 0;
  const one = async (p) => {
    let terrainOk = false, z0Ok = !z0;
    for (let a = 0; a < retries && !(terrainOk && z0Ok); a++) {
      if (!terrainOk) {
        try {
          const before = cache.results.size;
          const t = await loadTerrainAtPoint(p.lat, p.lon, { decodeRgba: rgba, cache, timeoutMs: 20_000, ...terrainOpts });
          terrainOk = t.fromCache === true || cache.results.size > before || (t.elevationM != null && t.tiles?.failed === 0);
        } catch { /* retry */ }
      }
      if (!z0Ok) {
        try { const z = await loadZ0AtPoint(p.lat, p.lon, { cache, timeoutMs: 30_000 }); z0Ok = !!z; } catch { /* retry */ }
      }
    }
    if (!terrainOk || !z0Ok) failed.push({ id: p.id, terrain: terrainOk, z0: z0Ok });
    if (++done % 200 === 0) log(`geo ${done}/${points.length} · ${cache.results.size} Einträge · ${failed.length} ohne`);
  };
  const queue = [...points];
  await Promise.all(Array.from({ length: concurrency }, async () => { for (let p = queue.shift(); p; p = queue.shift()) await one(p); }));
  // The result entries are stored a tick after the loader returns (`put` is not awaited there).
  await new Promise((r) => setTimeout(r, 50));
  const dec = new TextDecoder();
  // With a seed only the entries this point list used stay (points of a trimmed stretch drop out).
  const entries = [...cache.results].filter(([k]) => !seed.length || cache.touched.has(k)).map(([k, e]) => [k, JSON.parse(dec.decode(e.bytes))]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { entries, failed };
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  for (const k of ['corridors', 'stations', 'out']) if (!flags[k]) { console.error(`--${k} fehlt`); process.exit(2); }
  const log = (m) => console.log(`[fc-points] ${m}`);
  const corridorsDoc = JSON.parse(readFileSync(flags.corridors, 'utf8'));
  const stationsDoc = JSON.parse(readFileSync(flags.stations, 'utf8'));
  let corridors = corridorsDoc.corridors;
  if (typeof flags.roads === 'string') { const want = new Set(flags.roads.split(',')); corridors = corridors.filter((c) => want.has(c.road)); }

  // M6: `--axis-from=<points.json>` keeps the axis points of that file (no OSM download, no re-snap); the station table
  // `scripts/road/station-positions.json` is read unless `--no-positions`.
  const axisDoc = typeof flags['axis-from'] === 'string' ? JSON.parse(readFileSync(flags['axis-from'], 'utf8')) : null;
  const positions = flags['no-positions'] ? null : readStationPositions(typeof flags.positions === 'string' ? flags.positions : undefined);
  let index = null, osmBase = axisDoc ? (/Stand ([^,]+)$/.exec(axisDoc.sources?.[0]?.name ?? '')?.[1] ?? null) : null;
  if (!flags['no-snap'] && !axisDoc) {
    if (!flags.osm) { console.error('--osm=<cache.json> fehlt (oder --no-snap)'); process.exit(2); }
    if (!existsSync(flags.osm)) {
      log('Overpass: alle Autobahnen Deutschlands …');
      const r = await fetch(OVERPASS, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: 'data=' + encodeURIComponent(OSM_QUERY) });
      if (!r.ok) throw new Error(`Overpass: HTTP ${r.status}`);
      writeAtomic(flags.osm, await r.text());
    }
    const osm = JSON.parse(readFileSync(flags.osm, 'utf8'));
    osmBase = osm.osm3s?.timestamp_osm_base ?? null;
    index = buildOsmIndex(osm);
    log(`OSM ${osmBase}: ${index.ways} Wege, ${index.segs} Segmente`);
  }

  const reporting = typeof flags.obs === 'string' ? flags.obs.split(',').flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).points ?? []) : [];
  const { points, counts } = buildPoints({ corridors, stations: stationsDoc.stations, index, reporting, positions, axisFrom: axisDoc?.points ?? null });
  const posCatalog = points.filter((p) => p.pos === 'catalog').length, posReport = points.filter((p) => p.pos === 'report').length;
  if (positions) Object.assign(counts, { posReport, posCatalog });
  log(`Punkte: ${counts.axis} Achse (${counts.snapped} eingerastet, ${counts.unsnapped} nicht, ${counts.slid} verschoben, ${counts.bridge} Brücke) + ${counts.station} Stationen (${counts.noCatalog} ohne Katalogzeile, Lage aus der Meldung${positions ? `; M6: ${posReport} Meldung, ${posCatalog} Katalog` : ''})`);
  const builtAt = new Date().toISOString();
  const doc = {
    schema: 1, product: 'road-fc-points', builtAt, spacingKm: ROAD_FC_SPACING_KM,
    sources: [
      { what: 'Lage der Achspunkte (auf die Fahrbahn gelegt)', name: `OpenStreetMap, highway=motorway${osmBase ? `, Stand ${osmBase}` : ''}`, license: 'ODbL 1.0', attribution: '© OpenStreetMap-Mitwirkende' },
      { what: 'Korridor-Achse und Korridor-km', name: 'BKG DLM250 (road/v1/static/corridors.json)', license: 'dl-de/by-2.0', attribution: '© GeoBasis-DE / BKG' },
      { what: 'Stationen', name: 'DWD sws_stations_xls.xlsx (road/v1/static/stations.json)', license: 'GeoNutzV', attribution: 'Deutscher Wetterdienst' },
      ...(counts.noCatalog || positions ? [{ what: positions ? 'Lage der meldenden Stationen (M6)' : 'Stationen ohne Katalogzeile (V-AW-7)', name: 'Lage aus der Meldung, DWD Straßenwetter (SWIS)', license: 'GeoNutzV', attribution: 'Deutscher Wetterdienst' }] : []),
      ...(positions ? [{ what: 'Prüfung, welche Lage an der eigenen Straße liegt (M6)', name: 'OpenStreetMap (Wege mit ref)', license: 'ODbL 1.0', attribution: '© OpenStreetMap-Mitwirkende' }] : []),
    ],
    note: `Achspunkte: Nennlage alle 5 km auf der Korridor-Achse, Koordinate = nächster Punkt der OSM-Fahrbahn derselben Autobahn (snap = Abstand in m; null = nicht eingerastet, Punkt liegt auf der Achse; slide = wegen Tunnel um so viele km verschoben). Stationen: ${positions ? 'dieselbe Lage wie der Messpunkt (M6, scripts/road/station-positions.json): Meldung, Katalog nur wo allein er an der eigenen Straße liegt (pos); nicht meldende Stationen Katalogposition' : 'Katalogposition'}.`,
    counts, points,
  };
  writeAtomic(join(flags.out, ROAD_FC_POINTS_PATH.replace(/^static\//, '')), JSON.stringify(doc) + '\n');
  log(`${ROAD_FC_POINTS_PATH} geschrieben`);

  if (!flags['no-geo']) {
    const seed = typeof flags['geo-from'] === 'string' ? JSON.parse(readFileSync(flags['geo-from'], 'utf8')).entries ?? [] : [];
    const { entries, failed } = await buildGeo(points, { log, seed });
    const geo = { schema: 1, product: 'road-fc-geo', builtAt, note: 'Cache-Einträge der Client-Leser loadTerrainAtPoint (Terrarium z11 + z8) und loadZ0AtPoint (ESA WorldCover 2021, CC BY 4.0) je Punkt — der Producer lädt sie vor; nur für den Producer.', failed, entries };
    writeAtomic(join(flags.out, ROAD_FC_GEO_PATH.replace(/^static\//, '')), JSON.stringify(geo) + '\n');
    log(`${ROAD_FC_GEO_PATH}: ${entries.length} Einträge, ${failed.length} Punkte unvollständig`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
