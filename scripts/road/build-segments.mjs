#!/usr/bin/env node
/**
 * AW-7.1 — Builds the motorway SEGMENTS of Autobahnwetter (`road/v1/static/segments.json`, contract
 * `src/road/roadSegments.ts`, `audit/autobahnwetter.md` §19): junction to junction on the corridor axes (E-AW-32),
 * 5–25 km, with the forecast axis points as support points, the stations in reach, the piece bearings and the site
 * features with their sources. Runs on demand / monthly like `build-corridors.mjs`, never per slot.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/build-segments.mjs \
 *     --corridors=<corridors.json> --points=<points.json> --geo=<geo.json> --osm=<motorway cache.json> \
 *     --junctions=<junction cache.json> --cache=<dir for terrain + WorldCover tiles> --out=<segments.json> \
 *     [--limit=N] [--only=a8,a93] [--no-net] [--no-worldcover] [--no-terrain]
 *
 * Inputs and licences (every field of the file names its source):
 *   · junctions: OSM `highway=motorway_junction` nodes (Overpass, cached in `--junctions`; one query for Germany)   ODbL
 *   · bridge, tunnel, cutting, embankment, concrete: tags of the OSM carriageway ways (`--osm`, the point builder's cache) ODbL
 *   · height and gradient: Terrarium tiles z11 (Mapzen/AWS, the terrain source of the route forecast)
 *   · forest and cropland: ESA WorldCover 2021 (CC BY 4.0) through the project's mirror (`src/point/client/z0Point.ts`)
 *   · lowland: TPI of the support points from `geo.json` (the forecast's own terrain features)
 * Nothing here is a rule: features never raise a level (gefahren §4); the derive reads them to lower documented
 * thresholds and to word the detail text.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { decodePng, toRgba } from '../lib/png.mjs';
import { buildOsmIndex as buildCarriagewayIndex, footOnSegment, refsOf, isCarriagewayWay } from './build-fc-points.mjs';
import { loadWorldCoverTiles, classAtOf } from '../../src/point/client/z0Point.ts';
import { roadPointAtKm } from '../../src/road/roadFc.ts';
import {
  ROAD_SEGMENTS_SCHEMA, ROAD_SEGMENTS_PRODUCT, ROAD_SEGMENTS_ATTRIBUTION, ROAD_SEG_MIN_KM, ROAD_SEG_MAX_KM, ROAD_SEG_JUNCTION_MAX_M,
  ROAD_SEG_JUNCTION_MERGE_KM, ROAD_SEG_STATION_REACH_KM, ROAD_SEG_SAMPLE_KM, ROAD_SEG_GRADE_WINDOW_KM, ROAD_SEG_FOREST_BAND_M,
  ROAD_SEG_CROP_BAND_M, ROAD_SEG_LOWLAND_TPI_M, ROAD_SEG_BRIDGE_MIN_M, roadSegmentId, stretchBearings, kmOnLine, parseRoadSegments, roadSegmentOk,
} from '../../src/road/roadSegments.ts';

const UA = 'buscosun-road-segments (buscosun-web/audit/autobahnwetter.md)';
const OVERPASS_HOSTS = ['https://lz4.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://z.overpass-api.de/api/interpreter'];
/** Germany, with a margin: the junction nodes of every corridor (corridors end at the border, E-AW-12). */
export const JUNCTION_QUERY = '[out:json][timeout:180];node["highway"="motorway_junction"](47.2,5.8,55.1,15.1);out body;';
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/{x}/{y}.png';
const R_M = 6_371_000, RAD = Math.PI / 180;
/** A carriageway way counts for a sample when it lies this close (m); the corridor axis is up to 553 m off (D-FC-6). */
const WAY_MAX_M = 600;
/** WorldCover classes (ESA WorldCover 2021 v200): 10 tree cover, 40 cropland. */
const WC_TREE = 10, WC_CROP = 40;
/** Fraction of forest below which, with no cutting, a stretch counts as open (`set`). */
const EXPOSED_FOREST_MAX = 0.1;

const log = (s) => console.error(s);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha12 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

export function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// --- Caches (tiles on disk, keyed by a hash of url#range) ----------------------------------------------

function diskCache(dir) {
  mkdirSync(dir, { recursive: true });
  const file = (key) => join(dir, createHash('sha1').update(key).digest('hex'));
  return {
    kind: 'disk',
    async get(key) { const f = file(key); return existsSync(f) ? { bytes: new Uint8Array(readFileSync(f)), storedAt: 0 } : null; },
    async put(key, entry) { writeFileSync(file(key), Buffer.from(entry.bytes)); },
    async sweep() { return 0; },
  };
}

// --- Overpass: junction nodes ------------------------------------------------------------------------

export async function fetchJunctions(file, { noNet = false } = {}) {
  if (existsSync(file)) return readJson(file);
  if (noNet) throw new Error(`Knoten-Cache ${file} fehlt und --no-net gesetzt`);
  let last = null;
  for (const host of OVERPASS_HOSTS) {
    try {
      const r = await fetch(host, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(JUNCTION_QUERY)}`, signal: AbortSignal.timeout(240_000) });
      if (!r.ok) { last = new Error(`${host}: ${r.status}`); continue; }
      const text = await r.text();
      const o = JSON.parse(text);
      if (!Array.isArray(o.elements)) throw new Error('Overpass: keine elements');
      writeAtomic(file, text);
      return o;
    } catch (e) { last = e; log(`Overpass ${host}: ${e.message}`); }
  }
  throw last ?? new Error('Overpass: kein Server antwortete');
}

/** Grid index over the junction nodes (0,01° cells, like the carriageway index). */
export function junctionIndex(osm) {
  const cells = new Map();
  const CELL = 0.01;
  let n = 0;
  for (const e of osm.elements ?? []) {
    if (e.type !== 'node' || e.tags?.highway !== 'motorway_junction' || typeof e.lat !== 'number') continue;
    n++;
    const k = `${Math.floor(e.lon / CELL)},${Math.floor(e.lat / CELL)}`;
    let c = cells.get(k);
    if (!c) { c = []; cells.set(k, c); }
    c.push(e);
  }
  const near = (lon, lat) => {
    const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
    const out = [];
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const e of cells.get(`${x},${y}`) ?? []) out.push(e);
    return out;
  };
  return { near, count: n };
}

/** Name of a junction node: `name`, else "AS <ref>" (nodes without name carry the junction number). */
export const junctionName = (tags) => (tags?.name ? String(tags.name).trim() : tags?.ref ? `AS ${String(tags.ref).trim()}` : null);

/**
 * The junctions of a corridor: nodes ≤ `ROAD_SEG_JUNCTION_MAX_M` from the axis, clustered by name within
 * `ROAD_SEG_JUNCTION_MERGE_KM` (both carriageways carry a node each) → `[{ km, name }]` sorted by km.
 */
export function corridorJunctions(corridor, jidx) {
  const line = corridor.line;
  const seen = new Set();
  const hits = [];
  // Walk the axis every 250 m and ask the cells around — every node within reach is seen at least once.
  for (let k = 0; k <= corridor.lengthKm; k += 0.25) {
    const p = roadPointAtKm(line, k);
    for (const e of jidx.near(p[0], p[1])) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const name = junctionName(e.tags);
      if (!name) continue;
      const on = kmOnLine(line, [e.lon, e.lat]);
      if (on.distKm * 1000 > ROAD_SEG_JUNCTION_MAX_M) continue;
      hits.push({ km: on.km, name, id: e.id });
    }
  }
  hits.sort((a, b) => a.km - b.km);
  const out = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && prev.name === h.name && h.km - prev.kmLast <= ROAD_SEG_JUNCTION_MERGE_KM) { prev.kms.push(h.km); prev.kmLast = h.km; continue; }
    out.push({ name: h.name, kms: [h.km], kmLast: h.km });
  }
  return out.map((o) => ({ km: r3(o.kms.reduce((a, b) => a + b, 0) / o.kms.length), name: o.name }));
}

// --- Pieces: junction to junction, merged and split to 5–25 km --------------------------------------

/** `[{ kmFrom, kmTo, from, to, how }]` of a corridor from its junctions and its ends. */
export function piecesOf(corridor, junctions) {
  const ends = { from: corridor.from || corridor.title?.split(' → ')[0] || 'Beginn', to: corridor.to || 'Ende' };
  const bounds = [{ km: 0, name: ends.from }, ...junctions.filter((j) => j.km > 0.5 && j.km < corridor.lengthKm - 0.5), { km: corridor.lengthKm, name: ends.to }];
  let pieces = [];
  for (let i = 1; i < bounds.length; i++) pieces.push({ kmFrom: bounds[i - 1].km, kmTo: bounds[i].km, from: bounds[i - 1].name, to: bounds[i].name, how: i === 1 || i === bounds.length - 1 ? 'end' : 'junctions' });
  // Merge short pieces with the shorter neighbour until every piece is ≥ MIN (or the corridor is shorter than MIN).
  for (;;) {
    const i = pieces.findIndex((p) => p.kmTo - p.kmFrom < ROAD_SEG_MIN_KM);
    if (i < 0 || pieces.length < 2) break;
    const left = i > 0 ? pieces[i - 1] : null, right = i < pieces.length - 1 ? pieces[i + 1] : null;
    const withLeft = left && (!right || left.kmTo - left.kmFrom <= right.kmTo - right.kmFrom);
    if (withLeft) pieces.splice(i - 1, 2, { kmFrom: left.kmFrom, kmTo: pieces[i].kmTo, from: left.from, to: pieces[i].to, how: 'merged' });
    else pieces.splice(i, 2, { kmFrom: pieces[i].kmFrom, kmTo: right.kmTo, from: pieces[i].from, to: right.to, how: 'merged' });
  }
  // Split long pieces into equal parts.
  const out = [];
  for (const p of pieces) {
    const len = p.kmTo - p.kmFrom;
    const n = Math.max(1, Math.ceil(len / ROAD_SEG_MAX_KM));
    if (n === 1) { out.push(p); continue; }
    for (let j = 0; j < n; j++) out.push({ kmFrom: r3(p.kmFrom + (len * j) / n), kmTo: r3(p.kmFrom + (len * (j + 1)) / n), from: p.from, to: p.to, how: 'split', part: [j + 1, n] });
  }
  return out;
}

// --- Terrain (Terrarium z11) --------------------------------------------------------------------------

export function terrainReader({ cacheDir, noNet = false, fetchImpl = fetch }) {
  const tiles = new Map();
  const dir = join(cacheDir, 'terrarium-z11');
  mkdirSync(dir, { recursive: true });
  const Z = 11, N = 2 ** Z;
  async function tile(x, y) {
    const key = `${x}/${y}`;
    if (tiles.has(key)) return tiles.get(key);
    const f = join(dir, `${x}-${y}.png`);
    let bytes = existsSync(f) ? readFileSync(f) : null;
    if (!bytes) {
      if (noNet) { tiles.set(key, null); return null; }
      for (let attempt = 0; attempt < 3 && !bytes; attempt++) {
        try {
          const r = await fetchImpl(TERRARIUM.replace('{x}', x).replace('{y}', y), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
          if (r.status === 404) break;
          if (!r.ok) throw new Error(String(r.status));
          bytes = Buffer.from(await r.arrayBuffer());
          writeFileSync(f, bytes);
        } catch (e) { if (attempt === 2) log(`terrarium ${key}: ${e.message}`); }
      }
    }
    if (!bytes) { tiles.set(key, null); return null; }
    const d = decodePng(bytes);
    const rgba = toRgba(d);
    const t = { w: d.width, h: d.height, rgba };
    tiles.set(key, t);
    return t;
  }
  /** Height (m) at lon/lat, nearest pixel; `null` without a tile. */
  async function heightAt(lon, lat) {
    const xf = ((lon + 180) / 360) * N;
    const latR = lat * RAD;
    const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * N;
    const x = Math.floor(xf), y = Math.floor(yf);
    const t = await tile(x, y);
    if (!t) return null;
    const px = Math.min(t.w - 1, Math.floor((xf - x) * t.w)), py = Math.min(t.h - 1, Math.floor((yf - y) * t.h));
    const i = (py * t.w + px) * 4;
    return t.rgba[i] * 256 + t.rgba[i + 1] + t.rgba[i + 2] / 256 - 32768;
  }
  return { heightAt, get tiles() { return tiles.size; } };
}

// --- WorldCover (mirror, 37 m level) through the client's reader -------------------------------------

export function worldCoverReader({ cacheDir, noNet = false }) {
  const files = new Map();      // name → WcLoadedFile with merged tiles
  const asked = new Set();      // "lat,lon" rounded to 0.1° — one load per cell
  const cache = diskCache(join(cacheDir, 'worldcover'));
  async function ensure(lat, lon) {
    const key = `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
    if (asked.has(key)) return;
    asked.add(key);
    if (noNet) return;
    try {
      const r = await loadWorldCoverTiles(lat, lon, { cache, timeoutMs: 30_000 });
      for (const f of r.usable) {
        const name = `${f.la0},${f.lo0}`;
        const have = files.get(name);
        if (!have) files.set(name, f);
        else for (const [k, v] of f.tiles) if (!have.tiles.has(k)) have.tiles.set(k, v);
      }
    } catch (e) { log(`worldcover ${key}: ${e.message}`); }
  }
  async function classAt(lon, lat) {
    await ensure(lat, lon);
    return classAtOf([...files.values()])(lat, lon);
  }
  return { classAt, get files() { return files.size; } };
}

// --- Carriageway index with the feature tags ---------------------------------------------------------

/** Like the point builder's index, but every segment carries the feature tags of its way. */
export function featureIndex(osm) {
  const idx = buildCarriagewayIndex(osm);
  // The point builder's index knows refs/tunnel/bridge only; add the rest on the same way objects (shared `w`).
  const ways = new Map();
  for (const e of osm.elements ?? []) if (e.type === 'way' && isCarriagewayWay(e.tags)) ways.set(e.id, e.tags);
  // Rebuild: the shared index exposes `near(p)` → segments with `w`; we need the tags → build our own, same cells.
  const cells = new Map();
  const CELL = 0.01;
  for (const e of osm.elements ?? []) {
    if (e.type !== 'way' || !Array.isArray(e.geometry) || !isCarriagewayWay(e.tags)) continue;
    const t = e.tags;
    const w = {
      refs: refsOf(t), tunnel: (t.tunnel != null && t.tunnel !== 'no') || t.covered === 'yes', bridge: t.bridge != null && t.bridge !== 'no',
      cutting: t.cutting != null && t.cutting !== 'no', embankment: t.embankment != null && t.embankment !== 'no',
      concrete: /^concrete/.test(String(t.surface ?? '')), name: t.name ?? t.bridge_name ?? null,
    };
    for (let i = 1; i < e.geometry.length; i++) {
      const a = [e.geometry[i - 1].lon, e.geometry[i - 1].lat], b = [e.geometry[i].lon, e.geometry[i].lat];
      const seg = { a, b, w };
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        let c = cells.get(k);
        if (!c) { c = []; cells.set(k, c); }
        c.push(seg);
      }
    }
  }
  const near = (p) => {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    const out = new Set();
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const s of cells.get(`${x},${y}`) ?? []) out.add(s);
    return out;
  };
  /** Nearest carriageway of `road` at `p` within `WAY_MAX_M` (own number first), with its feature tags. */
  const at = (p, road) => {
    let best = null;
    for (const s of near(p)) {
      const match = s.w.refs.includes(road);
      const f = footOnSegment(p, s.a, s.b);
      if (f.d > WAY_MAX_M) continue;
      if (!best || (match && !best.match) || (match === best.match && f.d < best.d)) best = { d: f.d, match, w: s.w };
    }
    return best;
  };
  return { at, ways: idx.ways };
}

// --- Features of one stretch ---------------------------------------------------------------------------

/** Perpendicular offset of `p` by `m` metres relative to the bearing `deg` (right-hand side for +m). */
function offsetPoint(p, deg, m) {
  const r = (deg + 90) * RAD;
  const dLat = (Math.cos(r) * m) / R_M / RAD;
  const dLon = (Math.sin(r) * m) / (R_M * Math.cos(p[1] * RAD)) / RAD;
  return [p[0] + dLon, p[1] + dLat];
}

export async function featuresOf(corridor, piece, { fidx, terrain, wc, geoOf, points }) {
  const line = corridor.line, road = corridor.road;
  const samples = [];
  for (let k = piece.kmFrom; k <= piece.kmTo + 1e-9; k += ROAD_SEG_SAMPLE_KM) samples.push(Math.min(k, piece.kmTo));
  const n = samples.length;
  const tag = { bridge: 0, tunnel: 0, cutting: 0, embankment: 0, concrete: 0, known: 0 };
  const bridges = [];
  let run = null;
  const heights = [];
  let forestN = 0, forestK = 0, cropN = 0, cropK = 0;
  for (let i = 0; i < n; i++) {
    const km = samples[i];
    const p = roadPointAtKm(line, km);
    const hit = fidx ? fidx.at(p, road) : null;
    if (hit) {
      tag.known++;
      for (const key of ['bridge', 'tunnel', 'cutting', 'embankment', 'concrete']) if (hit.w[key]) tag[key]++;
      if (hit.w.bridge) {
        if (!run) run = { from: km, to: km, name: hit.w.name };
        else { run.to = km; if (!run.name && hit.w.name) run.name = hit.w.name; }
      }
    }
    if ((!hit || !hit.w.bridge) && run) { if ((run.to - run.from) * 1000 + ROAD_SEG_SAMPLE_KM * 1000 >= ROAD_SEG_BRIDGE_MIN_M) bridges.push(run); run = null; }
    if (terrain) heights.push(await terrain.heightAt(p[0], p[1]));
    if (wc) {
      const b = i < n - 1 ? stretchBearings(line, km, Math.min(piece.kmTo, km + ROAD_SEG_SAMPLE_KM * 5))[0] ?? 0 : 0;
      for (const off of [-ROAD_SEG_FOREST_BAND_M * 0.8, 0, ROAD_SEG_FOREST_BAND_M * 0.8]) {
        const q = off ? offsetPoint(p, b, off) : p;
        const c = await wc.classAt(q[0], q[1]);
        if (c != null) { forestN++; if (c === WC_TREE) forestK++; }
      }
      if (i % 5 === 0) {
        for (const off of [-ROAD_SEG_CROP_BAND_M, -ROAD_SEG_CROP_BAND_M / 2, 0, ROAD_SEG_CROP_BAND_M / 2, ROAD_SEG_CROP_BAND_M]) {
          const q = off ? offsetPoint(p, b, off) : p;
          const c = await wc.classAt(q[0], q[1]);
          if (c != null) { cropN++; if (c === WC_CROP) cropK++; }
        }
      }
    }
  }
  if (run && (run.to - run.from) * 1000 + ROAD_SEG_SAMPLE_KM * 1000 >= ROAD_SEG_BRIDGE_MIN_M) bridges.push(run);
  const shareOf = (k) => (tag.known ? r3(tag[k] / tag.known) : null);
  // Height and gradient from the profile (samples every 100 m; a 1-km window = 10 samples).
  let h = null, grade = null;
  const hs = heights.filter((x) => x != null);
  if (hs.length >= 2) {
    h = [Math.round(hs.reduce((a, b) => a + b, 0) / hs.length), Math.round(Math.min(...hs)), Math.round(Math.max(...hs))];
    const win = Math.round(ROAD_SEG_GRADE_WINDOW_KM / ROAD_SEG_SAMPLE_KM);
    for (let i = 0; i + win < heights.length; i++) {
      const a = heights[i], b = heights[i + win];
      if (a == null || b == null) continue;
      const pct = Math.abs(b - a) / (ROAD_SEG_GRADE_WINDOW_KM * 1000) * 100;
      if (!grade || pct > grade.pct) grade = { pct: r1(pct), km: [r1(samples[i]), r1(samples[i + win])] };
    }
  }
  const forest = forestN ? r3(forestK / forestN) : null;
  const crop = cropN ? r3(cropK / cropN) : null;
  const tpis = points.map((id) => geoOf(id)?.tpi2000M).filter((x) => x != null);
  const tpi500 = points.map((id) => geoOf(id)?.tpi500M).filter((x) => x != null);
  const lowland = tpis.some((t) => t <= ROAD_SEG_LOWLAND_TPI_M);
  const cutting = shareOf('cutting');
  const exposed = forest != null && forest < EXPOSED_FOREST_MAX && (cutting ?? 0) < 0.1 && (tpi500.length === 0 || tpi500.reduce((a, b) => a + b, 0) / tpi500.length >= 0 || (shareOf('embankment') ?? 0) > 0.1);
  return {
    bridge: shareOf('bridge'), bridges: bridges.map((b) => ({ km: [r1(b.from), r1(b.to)], ...(b.name ? { name: b.name } : {}) })),
    tunnel: shareOf('tunnel'), cutting, embankment: shareOf('embankment'), concrete: shareOf('concrete'),
    forest, crop, h, grade, lowland, exposed,
  };
}

// --- Whole build ---------------------------------------------------------------------------------------

export async function buildSegments({ corridors, points, geo, osm, junctions, terrain = null, wc = null, only = null, limit = 0, log: lg = log }) {
  const jidx = junctionIndex(junctions);
  const fidx = osm ? featureIndex(osm) : null;
  const geoMap = new Map((geo?.entries ?? []).filter(([k, e]) => String(k).startsWith('terrain/') && e && typeof e.lat === 'number' && typeof e.lon === 'number').map(([, e]) => [`${e.lat.toFixed(5)},${e.lon.toFixed(5)}`, e]));
  const pointById = new Map(points.points.map((p) => [p.id, p]));
  const geoOf = (id) => { const p = pointById.get(id); return p ? geoMap.get(`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`) ?? null : null; };
  const axisByCorridor = new Map();
  for (const p of points.points) if (p.kind === 'axis' && p.corridor && p.km != null) { let a = axisByCorridor.get(p.corridor); if (!a) { a = []; axisByCorridor.set(p.corridor, a); } a.push(p); }
  for (const a of axisByCorridor.values()) a.sort((x, y) => x.km - y.km);
  const segments = [];
  let nJunctions = 0, done = 0;
  for (const c of corridors.corridors) {
    if (only && !only.has(c.id)) continue;
    if (limit && done >= limit) break;
    done++;
    const js = corridorJunctions(c, jidx);
    nJunctions += js.length;
    const pieces = piecesOf(c, js);
    const axis = axisByCorridor.get(c.id) ?? [];
    for (const piece of pieces) {
      // Nothing to say about a stretch that is entirely unbuilt (corridors.json `unbuilt`).
      if ((c.unbuilt ?? []).some(([a, b]) => a <= piece.kmFrom + 1e-6 && b >= piece.kmTo - 1e-6)) continue;
      let inside = axis.filter((p) => p.km >= piece.kmFrom - 1e-6 && p.km <= piece.kmTo + 1e-6).map((p) => p.id);
      if (!inside.length && axis.length) {
        const mid = (piece.kmFrom + piece.kmTo) / 2;
        const nearest = axis.reduce((b, p) => (Math.abs(p.km - mid) < Math.abs(b.km - mid) ? p : b));
        inside = [nearest.id];
      }
      const stations = c.stations.filter((s) => s.km >= piece.kmFrom && s.km <= piece.kmTo).map((s) => s.id);
      const near = c.stations.filter((s) => (s.km < piece.kmFrom && s.km >= piece.kmFrom - ROAD_SEG_STATION_REACH_KM) || (s.km > piece.kmTo && s.km <= piece.kmTo + ROAD_SEG_STATION_REACH_KM)).map((s) => s.id);
      const f = await featuresOf(c, piece, { fidx, terrain, wc, geoOf, points: inside });
      const part = piece.part ? ` (Teil ${piece.part[0]}/${piece.part[1]})` : '';
      segments.push({
        id: roadSegmentId(c.road, c.id, piece.kmFrom), corridor: c.id, road: c.road, shields: c.shields,
        name: `${piece.from} – ${piece.to}${part}`, from: piece.from, to: piece.to,
        kmFrom: r1(piece.kmFrom), kmTo: r1(piece.kmTo), lengthKm: r1(piece.kmTo - piece.kmFrom),
        bearings: stretchBearings(c.line, piece.kmFrom, piece.kmTo), points: inside, coords: inside.map((id) => { const p = pointById.get(id); return [p.lon, p.lat]; }), stations, near, f, how: piece.how,
      });
    }
    lg(`${c.id}: ${js.length} Knoten → ${pieces.length} Abschnitte (${pieces.map((p) => r1(p.kmTo - p.kmFrom)).join(' ')} km)`);
  }
  const dup = segments.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) throw new Error(`doppelte Abschnitts-Kennungen: ${[...new Set(dup)].join(' ')}`);
  return { segments, nJunctions };
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  for (const k of ['corridors', 'points', 'geo', 'osm', 'junctions', 'cache', 'out']) if (!flags[k]) { console.error(`--${k} fehlt`); process.exit(2); }
  const noNet = flags['no-net'] === '1';
  const corridorsText = readFileSync(flags.corridors, 'utf8'), pointsText = readFileSync(flags.points, 'utf8');
  const corridors = JSON.parse(corridorsText), points = JSON.parse(pointsText);
  const geo = existsSync(flags.geo) ? readJson(flags.geo) : null;
  const osm = readJson(flags.osm);
  const junctions = await fetchJunctions(flags.junctions, { noNet });
  const terrain = flags['no-terrain'] === '1' ? null : terrainReader({ cacheDir: flags.cache, noNet });
  const wc = flags['no-worldcover'] === '1' ? null : worldCoverReader({ cacheDir: flags.cache, noNet });
  const only = flags.only ? new Set(flags.only.split(',')) : null;
  const t0 = Date.now();
  const { segments, nJunctions } = await buildSegments({ corridors, points, geo, osm, junctions, terrain, wc, only, limit: Number(flags.limit ?? 0) });
  const file = {
    schema: ROAD_SEGMENTS_SCHEMA, product: ROAD_SEGMENTS_PRODUCT, builtAt: new Date().toISOString(),
    inputs: { corridors: sha12(corridorsText), points: sha12(pointsText), osmBase: osm.osm3s?.timestamp_osm_base ?? null, junctionsBase: junctions.osm3s?.timestamp_osm_base ?? null },
    sources: [
      { what: 'Abschnittsgrenzen und Namen (Anschlussstellen, Kreuze, Dreiecke)', name: `OpenStreetMap, highway=motorway_junction, Stand ${junctions.osm3s?.timestamp_osm_base ?? 'unbekannt'}`, license: 'ODbL 1.0', attribution: ROAD_SEGMENTS_ATTRIBUTION },
      { what: 'Brücken, Tunnel, Einschnitte, Dämme, Betonbelag (Anteile der Achse)', name: `OpenStreetMap, highway=motorway, Stand ${osm.osm3s?.timestamp_osm_base ?? 'unbekannt'}`, license: 'ODbL 1.0', attribution: ROAD_SEGMENTS_ATTRIBUTION },
      { what: 'Korridor-Achse und Korridor-km', name: 'BKG DLM250 (road/v1/static/corridors.json)', license: 'dl-de/by-2.0', attribution: '© GeoBasis-DE / BKG' },
      { what: 'Stützpunkte', name: 'Achspunkte der Streckenprognose (road/fc/v1/static/points.json)', license: 'ODbL 1.0 (Lage)', attribution: ROAD_SEGMENTS_ATTRIBUTION },
      ...(terrain ? [{ what: 'Höhe und Steigung der Achse', name: 'Terrarium-Höhenkacheln z11 (Mapzen/AWS Terrain Tiles)', license: 'Mapzen Terrain Tiles (Quellen u. a. EU-DEM, SRTM)', attribution: 'Mapzen, AWS Open Data' }] : []),
      ...(wc ? [{ what: 'Wald- und Ackeranteil neben der Fahrbahn', name: 'ESA WorldCover 2021 v200 (Spiegel jppetry/buscosun-worldcover)', license: 'CC BY 4.0', attribution: '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021)' }] : []),
      { what: 'Niederung (TPI der Stützpunkte)', name: 'Geländemerkmale der Streckenprognose (road/fc/v1/static/geo.json, Terrarium)', license: 'wie Höhe', attribution: 'Mapzen, AWS Open Data' },
    ],
    license: 'ODbL 1.0',
    counts: { segments: segments.length, corridors: new Set(segments.map((s) => s.corridor)).size, junctions: nJunctions, km: Math.round(segments.reduce((a, s) => a + s.lengthKm, 0)) },
    segments,
  };
  if (!parseRoadSegments(JSON.parse(JSON.stringify(file)))) {
    const bad = segments.filter((s) => !roadSegmentOk(JSON.parse(JSON.stringify(s)))).map((s) => `${s.id} (${s.corridor} ${s.kmFrom}–${s.kmTo}) ${JSON.stringify({ b: s.bearings, f: s.f }).slice(0, 400)}`);
    console.error(`die gebaute Datei besteht den eigenen Vertrag nicht: ${bad.slice(0, 10).join(', ') || 'Kopf'}`);
    process.exit(1);
  }
  const text = JSON.stringify(file) + '\n';
  writeAtomic(flags.out, text);
  const lens = segments.map((s) => s.lengthKm).sort((a, b) => a - b);
  console.log(JSON.stringify({
    segments: segments.length, corridors: file.counts.corridors, junctions: nJunctions, km: file.counts.km, bytes: Buffer.byteLength(text),
    lengthKm: { min: lens[0], p50: lens[Math.floor(lens.length / 2)], max: lens[lens.length - 1] },
    how: Object.fromEntries(['junctions', 'merged', 'split', 'end'].map((h) => [h, segments.filter((s) => s.how === h).length])),
    withStation: segments.filter((s) => s.stations.length).length, withNear: segments.filter((s) => s.stations.length || s.near.length).length,
    features: { bridge: segments.filter((s) => s.f.bridges.length).length, concrete: segments.filter((s) => (s.f.concrete ?? 0) > 0.2).length, forest: segments.filter((s) => (s.f.forest ?? 0) >= 0.3).length, crop: segments.filter((s) => (s.f.crop ?? 0) >= 0.5).length, grade4: segments.filter((s) => (s.f.grade?.pct ?? 0) >= 4).length, lowland: segments.filter((s) => s.f.lowland).length, exposed: segments.filter((s) => s.f.exposed).length },
    terrainTiles: terrain?.tiles ?? 0, wcFiles: wc?.files ?? 0, ms: Date.now() - t0,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
}
