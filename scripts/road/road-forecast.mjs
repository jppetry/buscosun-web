#!/usr/bin/env node
/**
 * AW-6.1 — Producer of the route forecast (`buscosun-data/road/fc/v1/`, contract `src/road/roadFc.ts`,
 * `audit/autobahnwetter.md` §14): buscosun Fusion (the newest stand of the register, `fusionRelease.ts`) at every point of `static/points.json`, hourly, from a local
 * checkout of the data repo.
 *
 * The chain is the client's: `getPointForecastFromCube` with the options of `defaultCubeIo()` (stage `fs`, tables
 * `json`, radar hour mean, MOSMIX station member) — only the store (a directory instead of the CDN), the decoders
 * (Node) and three producer facts differ: terrain and roughness come from `static/geo.json` (the client's own cache
 * entries, built once), decoded chunks and radar frames are memoised across points, and the measurement anchor does
 * not come from BrightSky (one request per point is not affordable) but from the road weather stations of the same
 * checkout (V-AW-21, `ROAD_FC_ANCHOR_MODE`: since E-AW-30 the station points on their own measurement; off ⇒ `obs: null`,
 * the engine says "kein Anker").
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-forecast.mjs
 *     --data=<checkout of buscosun-data> [--out=<work dir>] [--now=<iso>] [--shards=4] [--publish]
 *     [--limit=N] [--ids=a8@0,Q441] [--remote=origin] [--branch=main] [--always]
 *
 * `--publish`: the run is copied into the checkout, the pointer updated, old runs pruned, committed and pushed —
 * re-based onto a fresh `origin/main` on every attempt (the map line force-pushes this repo, the radar mirror pushes
 * every few minutes). Exit 0 = run published (or built, without `--publish`; or switched off with `ROAD_FC=0`; or
 * skipped because the newest published run already used the same hour and the same inputs — `repeatVerdict`,
 * V-AW-31; `--always` / `ROAD_FC_ALWAYS=1` runs anyway), 3 = run NOT published (too many points failed, tables not read, no tier-1 run), 1 = error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, cpSync, mkdtempSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, toRgba } from '../lib/png.mjs';
import { installNodeShims } from '../punktarchiv/lib/nodeShims.mjs';
import {
  ROAD_FC_REPO_DIR, ROAD_FC_INDEX_PATH, ROAD_FC_POINTS_PATH, ROAD_FC_GEO_PATH, ROAD_FC_HOURS, ROAD_FC_STEPS, ROAD_FC_VAR_IDS,
  roadFcSourceText, ROAD_FC_MAX_FAILED_SHARE, ROAD_FC_ANCHOR_MODE,
  roadFcStamp, roadFcT0, roadFcEncode, roadFcOriginCode, roadFcSeriesProblems, roadFcPointUsable, roadFcCorridorPath, roadFcStatePath,
  roadFcPrune, parseRoadFcIndex, parseRoadFcPoints,
} from '../../src/road/roadFc.ts';
import { newStoreStats } from '../../src/point/client/store.ts';
import { decodeCubeChunk, POINT_LEARNED_PATH, POINT_STACK_PATH, POINT_CLIMA_PATH } from '../../src/point/cubeFormat.ts';
import { getPointForecastFromCube, clearCubeForecastCache, exceedance } from '../../src/pointForecast/cubeSource.ts';
import { FUSION_CURRENT, FUSION_NAME, fusionName, fusionStage, fusionStageIo, fusionVersionOfNotes, fusionVersionOfEngine } from '../../src/pointForecast/fusion/fusionRelease.ts';
import { getClimaField } from '../../src/pointForecast/fusion/attach.ts';
import { ROAD_REPO_DIR, ROAD_STATIONS_PATH, roadStamp } from '../../src/road/roadContract.ts';
import { restoreFcStatic } from './road-fc-archive.mjs';

const H = 3_600_000;
const SELF = fileURLToPath(import.meta.url);
const PUSH_RETRIES = 6;

// --- Store, caches, io -------------------------------------------------------------------------

/** `PointStore` over a directory (the checkout): bytes read once, a missing file is "not there" (null), like a 404. */
export function dirStore(dir) {
  const stats = newStoreStats();
  const memo = new Map(), parsed = new Map();
  const bytes = async (path) => {
    const k = String(path).replace(/^\/+/, '');
    if (memo.has(k)) return memo.get(k);
    const f = join(dir, k);
    const b = existsSync(f) ? new Uint8Array(readFileSync(f)) : null;
    if (b) { stats.files += 1; stats.bytes += b.length; } else stats.misses += 1;
    memo.set(k, b);
    return b;
  };
  const self = {
    base: pathToFileURL(dir).href.replace(/\/+$/, ''),
    bytes,
    // Parsed once and frozen: thousands of points read the same manifests; a consumer that tried to change one
    // would throw (strict mode) instead of handing the next point a changed manifest.
    async json(p) {
      const k = String(p).replace(/^\/+/, '');
      if (parsed.has(k)) return parsed.get(k);
      const b = await bytes(k);
      const j = b ? deepFreeze(JSON.parse(new TextDecoder().decode(b))) : null;
      parsed.set(k, j);
      return j;
    },
    stats,
    // A directory has no commits: the same bytes under every base (pinned manifests read the same files).
    withBase: () => self,
  };
  return self;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

/** Bounded memo keyed by the byte array (the store returns the same array per file) and a sub-key. */
function lruMemo(cap) {
  const m = new Map();
  return (key, sub, make) => {
    let e = m.get(key);
    if (e) { m.delete(key); m.set(key, e); } else { e = new Map(); m.set(key, e); if (m.size > cap) m.delete(m.keys().next().value); }
    if (!e.has(sub)) e.set(sub, make());
    return e.get(sub);
  };
}

/** Cache backend preloaded with the geo entries; counts result misses (a miss sends the loader to the network). */
export function geoBackend(geoDoc) {
  const enc = new TextEncoder();
  const m = new Map();
  for (const [k, v] of geoDoc?.entries ?? []) m.set(k, { bytes: enc.encode(JSON.stringify(v)), storedAt: 0 });
  const counts = { terrainMiss: 0, z0Miss: 0 };
  return {
    kind: 'road-fc-geo', counts,
    async get(k) {
      const e = m.get(k) ?? null;
      if (!e) { if (k.startsWith('terrain/')) counts.terrainMiss++; else if (k.startsWith('z0:')) counts.z0Miss++; }
      return e;
    },
    async put(k, e) { m.set(k, e); },
    async sweep() { return 0; },
  };
}

const rgbaOf = (b) => { const png = decodePng(b); return { data: toRgba(png), width: png.width, height: png.height }; };

/** The client's io (`defaultCubeIo`) for Node — same stage and sources, no anchor. */
export function makeIo({ store, cache, nowMs }) {
  const pngMemo = lruMemo(200), rgbMemo = lruMemo(24), chunkMemo = lruMemo(40);
  return {
    store,
    decodePng: (b) => pngMemo(b, '', () => decodePng(b)),
    decodeRgbPng: (b) => rgbMemo(b, '', () => rgbaOf(b)),
    decodeChunk: (b, o) => chunkMemo(b, `${(o.wanted ?? []).join(',')}|${o.checkCrc === false ? 0 : 1}`,
      () => decodeCubeChunk(b, { planes: o.planes, wanted: o.wanted, ...(o.checkCrc === false ? { checkCrc: false } : {}) })),
    terrain: { decodeRgba: rgbaOf, cache },
    clima: getClimaField,
    obs: null,
    // Roughness only from the preloaded entries — never the network inside a run.
    z0: { cache, cacheOnly: true },
    // The newest stage of buscosun Fusion from the register — tables, stage and reader switches; a new stand needs no edit here.
    ...fusionStageIo(),
    nowMs: () => nowMs,
  };
}

// --- Measurement anchor (V-AW-21) ----------------------------------------------------------------

/**
 * The anchor of buscosun Fusion needs measurements (`CubeObs`); the browser fetches BrightSky per point, the producer
 * has the road weather stations of the same checkout (`road/v1/obs`, SWIS air temperature). A station point takes its
 * OWN measurement (distance 0); every other point takes the nearest stations. Which of the two is switched on, and
 * why temperature only, is measured in audit/autobahnwetter.md §16.
 *
 * The measurement is the one of the last FULL HOUR, not the newest quarter-hour slot: the engine pairs a measurement
 * with the model step of its hour grid (±30 min) and the station-value path needs the station forecast of the very
 * minute — measured on 04.10.2026 (§16.3), a 16:30 measurement gained +1 % at +1 h where the 16:00 one gained +30 %,
 * and a 55 min old full-hour value still beat a 10 min old quarter-hour value (+43 % against +20 %). It is the hour
 * the run starts in (`roadFcT0`): the engine's window begins there, an older measurement finds no step to pair with.
 * A run in the first minutes of an hour, before the mirror has that slot, runs without anchor and says so.
 * `maxAgeMs` follows from that (< 1 h); the other numbers are `set`.
 */
export const ROAD_FC_ANCHOR = Object.freeze({ maxAgeMs: 3_600_000, maxKm: 30, maxN: 6, coordTolKm: 2 });

const kmBetween = (aLat, aLon, bLat, bLon) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/**
 * Measurement table of one slot: `rows` = points of an obs file (or the same shape built from the 24-h rings).
 * A station enters with a finite air temperature; `place` = may it serve as a NEIGHBOUR (position of the bulletin and
 * of the catalogue agree within `coordTolKm`, catalogue height known) — its own point takes it either way.
 */
export function swisTable(rows, catalog, points) {
  const byId = new Map(points.filter((p) => p.kind === 'station').map((p) => [p.id, p]));
  const out = new Map();
  for (const r of rows ?? []) {
    if (!r || typeof r.id !== 'string' || !Number.isFinite(r.ta) || !Number.isFinite(r.t)) continue;
    const p = byId.get(r.id), c = catalog?.[r.id];
    const lat = p?.lat ?? c?.lat, lon = p?.lon ?? c?.lon;
    const place = Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(r.lat) && Number.isFinite(r.lon)
      && kmBetween(lat, lon, r.lat, r.lon) <= ROAD_FC_ANCHOR.coordTolKm && Number.isFinite(c?.h);
    out.set(r.id, {
      id: r.id, name: r.n ?? c?.n ?? r.id, lat: lat ?? r.lat, lon: lon ?? r.lon, h: Number.isFinite(c?.h) ? c.h : null, place, tMs: r.t,
      ta: r.ta, td: Number.isFinite(r.td) ? r.td : null, rh: Number.isFinite(r.rh) ? r.rh : null,
      ws: Number.isFinite(r.ws) ? r.ws : null, wd: Number.isFinite(r.wd) ? r.wd : null, wg: Number.isFinite(r.wg) ? r.wg : null,
    });
  }
  return out;
}

/** The obs file of the full hour the run starts in → `{ slot, table }`, or `null` (not there yet, switched off, empty — named by the caller). */
export function readSwisTable(dataDir, nowMs, points) {
  const dir = join(dataDir, ROAD_REPO_DIR);
  const catFile = join(dir, ROAD_STATIONS_PATH);
  const catalog = existsSync(catFile) ? JSON.parse(readFileSync(catFile, 'utf8')).stations : null;
  const ms = roadFcT0(nowMs);
  const f = join(dir, 'obs', `${roadStamp(ms)}.json`);
  if (!existsSync(f)) return null;
  let doc; try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  if (doc?.killed || !Array.isArray(doc?.points)) return null;
  // Only values measured AT the slot: a station that repeats an older value would be paired with the wrong hour.
  const table = swisTable(doc.points.filter((r) => r.t === ms), catalog, points);
  return table.size ? { slot: roadStamp(ms), table } : null;
}

/**
 * The measurements one point hands to the engine. `own`: the station's own value, alone (a neighbour 10 km away would
 * weigh 0.8 against it in the engine's mean offset). Otherwise the `maxN` nearest placed stations within `maxKm`.
 * Backtest variants: `opts.leaveOut` (never the own value), `opts.withNeighbours`, `opts.wind`, `opts.noNeighbours`.
 */
export function anchorObsFor(p, table, opts = {}) {
  const toObs = (m, distanceM, elevM) => {
    const wind = !!opts.wind && m.ws != null && m.wd != null;
    const rad = wind ? (m.wd * Math.PI) / 180 : 0;
    return {
      source: 'swis', name: m.name, stationId: m.id, lat: m.lat, lon: m.lon, elevM, distanceM, validAtMs: m.tMs,
      temperature: m.ta, relativeHumidity: m.rh, dewPoint: m.td,
      u: wind ? -m.ws * Math.sin(rad) : null, v: wind ? -m.ws * Math.cos(rad) : null, gust: opts.wind ? m.wg : null,
    };
  };
  const own = !opts.leaveOut && p.kind === 'station' ? table.get(p.id) : null;
  const out = own ? [toObs({ ...own, lat: p.lat, lon: p.lon }, 0, null)] : [];
  if ((own && !opts.withNeighbours) || opts.noNeighbours) return out;
  const near = [];
  for (const m of table.values()) {
    if (!m.place || m.id === p.id) continue;
    const km = kmBetween(p.lat, p.lon, m.lat, m.lon);
    if (km <= ROAD_FC_ANCHOR.maxKm) near.push([km, m]);
  }
  near.sort((a, b) => a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1));
  for (const [km, m] of near.slice(0, ROAD_FC_ANCHOR.maxN - out.length)) out.push(toObs(m, km * 1000, m.h));
  return out;
}

// --- One point ---------------------------------------------------------------------------------

/** `PointForecast` (cube path) → the coded series of the contract. */
export function seriesOf(fc, t0Ms) {
  const v = Object.fromEntries(ROAD_FC_VAR_IDS.map((id) => [id, new Array(ROAD_FC_STEPS).fill(null)]));
  for (const s of fc.cube.v2.axis.steps) {
    const i = (s.validAtMs - t0Ms) / H;
    if (!Number.isInteger(i) || i < 0 || i >= ROAD_FC_STEPS) continue;
    const x = s.vars;
    const dist = x.precip?.dist ?? null;
    const pWet = dist ? exceedance(dist, 0) : NaN;
    v.t[i] = roadFcEncode('t', x.t2m?.mean);
    v.ts[i] = roadFcEncode('ts', x.t2m?.sigma);
    v.td[i] = roadFcEncode('td', x.td2m?.mean);
    v.pp[i] = Number.isFinite(pWet) ? roadFcEncode('pp', 100 * Math.max(0, Math.min(1, pWet))) : null;
    v.rr[i] = roadFcEncode('rr', x.precip?.mean);
    v.sn[i] = x.pSnow?.mean == null ? null : roadFcEncode('sn', 100 * x.pSnow.mean);
    v.ff[i] = roadFcEncode('ff', x.wind?.mean);
    v.fx[i] = roadFcEncode('fx', x.gust?.mean);
    v.dd[i] = roadFcEncode('dd', x.windDir?.mean);
    v.n[i] = roadFcEncode('n', x.clct?.mean);
    v.cf[i] = roadFcEncode('cf', x.t2m?.confidence?.score);
    v.q[i] = roadFcOriginCode(s.tier, s.interpolated);
  }
  return v;
}

/** What the run read, taken from the first forecast (identical for every point of a run except the station). */
function runsOf(fc) {
  const r = fc.cube.v2.provenance?.runs ?? {};
  return { t1: r.t1?.run ?? null, t2: r.t2?.run ?? null, t3: r.t3?.run ?? null, stations: r.stations?.run ?? null, nowcast: (r.nowcast ?? []).map((n) => `${n.source}:${n.stamp}`).join(',') || null };
}

/** One point → `{ point }` or `{ error }`; never throws. */
export async function computePoint(p, io, nowMs, obs = null) {
  try {
    clearCubeForecastCache();
    // V-AW-21: the measurements go in through the engine's own hook (`CubeIo.obs`), already resolved.
    const pio = obs && obs.length ? { ...io, obs: async () => obs } : io;
    const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours: ROAD_FC_HOURS, pointSource: 'cube', includeRadarNowcast: true }, pio);
    if (!fc.cube?.v2) return { error: 'kein Cube-Ergebnis' };
    const t0Ms = roadFcT0(nowMs);
    const v = seriesOf(fc, t0Ms);
    const problems = roadFcSeriesProblems(v);
    if (problems.length) return { error: `Werte: ${problems.slice(0, 3).join('; ')}` };
    const st = fc.cube.v2.provenance?.runs?.stations ?? null;
    const used = fc.sourcesAvailable.includes('mosmix') && st?.id != null;
    const point = {
      id: p.id, kind: p.kind, km: p.km ?? null, lat: p.lat, lon: p.lon,
      h: fc.cube.v2.point?.hTrue == null ? null : Math.round(fc.cube.v2.point.hTrue),
      ...(p.bridge ? { bridge: true } : {}), ...(p.kind === 'station' && p.name ? { name: p.name } : {}),
      mos: used ? [String(st.id), Math.round(st.distKm * 10) / 10] : null,
      ...anchorOf(fc, obs),
      v,
    };
    if (!roadFcPointUsable(point)) return { error: 'weniger als die Hälfte der Stunden mit Temperatur' };
    const stage = fusionVersionOfNotes(fc.cube.notes) === FUSION_CURRENT;
    return { point, runs: runsOf(fc), stage, errors: fc.cube.errors.length, fc };
  } catch (e) {
    return { error: String(e?.message ?? e).split('\n')[0] };
  }
}

/**
 * What the anchor did at this point, read from the engine's own note: `anc` = [offset measurement − model in 0.1 K,
 * representativity in %, own measurement 1/0]. Absent = no anchor at this point.
 */
export function anchorOf(fc, obs) {
  if (!obs || !obs.length) return {};
  const m = /^anchor: \d+ Paar\(e\) aus swis, Versatz T (-?\d+(?:\.\d+)?) K, Repräsentativität (\d+(?:\.\d+)?)$/.exec(fc.cube.notes.find((n) => n.startsWith('anchor: ') && n.includes(' aus swis')) ?? '');
  return m ? { anc: [Math.round(Number(m[1]) * 10), Math.round(Number(m[2]) * 100), obs[0].distanceM === 0 ? 1 : 0] } : {};
}

/**
 * A slice of points in one process. `anchor` (`ROAD_FC_ANCHOR_MODE`): `'stations'` = every station point takes its own
 * measurement, `'all'` = other points take their neighbours too, `'none'`. No usable obs file ⇒ no anchor (named in
 * the run's engine block).
 */
export async function runShard({ dataDir, points, geoDoc, nowMs, anchor = null, allPoints = null }) {
  installNodeShims();
  const cache = geoBackend(geoDoc);
  const io = makeIo({ store: dirStore(dataDir), cache, nowMs });
  const out = [], failed = [];
  let runs = null, noStage = 0, readerErrors = 0;
  const opts = anchor === 'all' ? {} : anchor === 'stations' ? { noNeighbours: true } : null;
  const swis = opts ? readSwisTable(dataDir, nowMs, allPoints ?? points) : null;
  for (const p of points) {
    const r = await computePoint(p, io, nowMs, swis ? anchorObsFor(p, swis.table, opts) : null);
    if (r.error) { failed.push({ id: p.id, error: r.error }); continue; }
    out.push(r.point);
    runs ??= r.runs;
    if (!r.stage) noStage++;
    readerErrors += r.errors;
  }
  return { points: out, failed, runs, noStage, readerErrors, geo: cache.counts, anchorSlot: swis?.slot ?? null };
}

// --- A run -------------------------------------------------------------------------------------

const sha12 = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12) : null);

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}

function spawnShard(args) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--import', pathToFileURL(join(dirname(SELF), '..', 'lib', 'register-ts.mjs')).href, SELF, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
    c.on('error', reject);
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Scherbe endete mit ${code}`))));
  });
}

/**
 * Computes one run into `<outDir>/<run>/…` and returns its index entry. `inProcess` (verifier) computes without child
 * processes; otherwise the points are cut into contiguous slices (neighbours share chunks) for `shards` processes.
 */
export async function buildRun({ dataDir, outDir, nowMs = Date.now(), shards = 1, points = null, inProcess = false, anchor = ROAD_FC_ANCHOR_MODE, log = () => {} }) {
  const T0 = Date.now();
  const fcDir = join(dataDir, ROAD_FC_REPO_DIR);
  const pointsDoc = parseRoadFcPoints(JSON.parse(readFileSync(join(fcDir, ROAD_FC_POINTS_PATH), 'utf8')));
  if (!pointsDoc) throw new Error(`${ROAD_FC_POINTS_PATH} nicht lesbar`);
  const geoFile = join(fcDir, ROAD_FC_GEO_PATH);
  const geoDoc = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : { entries: [] };
  const all = points ?? pointsDoc.points;
  const run = roadFcStamp(nowMs), t0Ms = roadFcT0(nowMs);

  let parts;
  if (inProcess || shards <= 1) parts = [await runShard({ dataDir, points: all, geoDoc, nowMs, anchor, allPoints: pointsDoc.points })];
  else {
    const work = mkdtempSync(join(tmpdir(), 'road-fc-'));
    const n = Math.min(shards, Math.max(1, all.length));
    const size = Math.ceil(all.length / n);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const pf = join(work, `p${i}.json`), rf = join(work, `r${i}.json`);
      writeFileSync(pf, JSON.stringify(all.slice(i * size, (i + 1) * size)));
      jobs.push(spawnShard([`--data=${dataDir}`, `--now=${new Date(nowMs).toISOString()}`, `--shard-points=${pf}`, `--shard-result=${rf}`, `--anchor=${anchor}`]).then(() => JSON.parse(readFileSync(rf, 'utf8'))));
    }
    try { parts = await Promise.all(jobs); } finally { rmSync(work, { recursive: true, force: true }); }
  }

  const done = parts.flatMap((p) => p.points), failed = parts.flatMap((p) => p.failed);
  const runs = parts.find((p) => p.runs)?.runs ?? {};
  // The anchor is named by what happened, not by what was asked for: no usable measurement slot ⇒ 'none'.
  const anchored = done.filter((p) => p.anc).length;
  const anchorSlot = parts.find((p) => p.anchorSlot)?.anchorSlot ?? null;
  const engine = {
    name: FUSION_NAME, version: FUSION_CURRENT, stage: 'fs', anchor: anchored ? 'swis' : 'none',
    ...(anchored ? { anchorMode: anchor, anchorSlot, anchored } : {}),
    hourMean: fusionStage().options.nowcastHourMean === true, runs,
    tables: { learned: sha12(join(dataDir, POINT_LEARNED_PATH)), stack: sha12(join(dataDir, POINT_STACK_PATH)), clima: sha12(join(dataDir, POINT_CLIMA_PATH)) },
  };
  const noStage = parts.reduce((s, p) => s + p.noStage, 0);
  const geo = parts.reduce((s, p) => ({ terrainMiss: s.terrainMiss + p.geo.terrainMiss, z0Miss: s.z0Miss + p.geo.z0Miss }), { terrainMiss: 0, z0Miss: 0 });

  // Group: a point with a corridor goes into that corridor's file, every other station into its state's file.
  const meta = new Map(all.map((p) => [p.id, p]));
  const byCorridor = new Map(), byState = new Map();
  for (const p of done) {
    const m = meta.get(p.id);
    const [map, key] = m.corridor ? [byCorridor, m.corridor] : [byState, m.state ?? 'XX'];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const issuedAt = new Date(nowMs).toISOString();
  const head = (kind, id) => ({ schema: 1, product: 'road-fc', run, issuedAt, t0Ms, steps: ROAD_FC_STEPS, kind, id, engine, source: roadFcSourceText(FUSION_NAME, anchored > 0) });
  const runDir = join(outDir, run);
  rmSync(runDir, { recursive: true, force: true });
  let bytes = 0;
  const write = (rel, doc) => { const text = JSON.stringify(doc) + '\n'; bytes += text.length; writeAtomic(join(outDir, rel), text); };
  for (const [id, pts] of byCorridor) {
    pts.sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || (a.kind === b.kind ? 0 : a.kind === 'axis' ? -1 : 1));
    write(roadFcCorridorPath(run, id), { ...head('corridor', id), points: pts });
  }
  for (const [id, pts] of byState) {
    pts.sort((a, b) => (a.id < b.id ? -1 : 1));
    write(roadFcStatePath(run, id), { ...head('state', id), points: pts });
  }
  const entry = {
    run, issuedAt, t0Ms, publishedAt: issuedAt, points: done.length, failed: failed.length,
    corridors: byCorridor.size, states: byState.size, engine, ms: Date.now() - T0,
  };
  const stats = { total: all.length, failed, noStage, geo, bytes, readerErrors: parts.reduce((s, p) => s + p.readerErrors, 0) };
  log(`Lauf ${run}: ${done.length}/${all.length} Punkte · ${failed.length} ohne Ergebnis · ${byCorridor.size} Korridore + ${byState.size} Länder · ${(bytes / 1e6).toFixed(2)} MB · ${((Date.now() - T0) / 1000).toFixed(1)} s · Cube ${JSON.stringify(runs)} · Anker ${anchored ? `SWIS ${anchorSlot} an ${anchored} Punkten (${anchor})` : `keiner${anchor !== 'none' ? ' — die Messung der vollen Stunde liegt (noch) nicht im Klon' : ''}`}${noStage ? ` · ${noStage} Punkte OHNE Stufe fs` : ''}${geo.terrainMiss || geo.z0Miss ? ` · Gelände nicht vorab: ${geo.terrainMiss}, z0: ${geo.z0Miss}` : ''}`);
  return { run, runDir, entry, stats };
}

/** May this run be published? Too many lost points, or points computed without the stage, block it (named). */
export function publishVerdict({ entry, stats }) {
  const reasons = [];
  if (!entry.points) reasons.push('kein Punkt mit Ergebnis');
  if (stats.total && stats.failed.length / stats.total > ROAD_FC_MAX_FAILED_SHARE) reasons.push(`${stats.failed.length} von ${stats.total} Punkten ohne Ergebnis (> ${100 * ROAD_FC_MAX_FAILED_SHARE} %)`);
  if (stats.noStage) reasons.push(`${stats.noStage} Punkte ohne Stufe fs (gelernte Tabellen nicht gelesen) — das wäre nicht ${FUSION_NAME}`);
  if (!entry.engine.runs.t1) reasons.push('kein Lauf der Stufe 1 gelesen');
  return { ok: reasons.length === 0, reasons };
}

// --- Repeat guard (V-AW-31) --------------------------------------------------------------------

/**
 * Would a run now repeat the newest published one? The job is woken by its hourly schedule AND after every run of the
 * `point` workflow (tier 1, 2, 3 and hourly MOSMIX-S are four separate runs of it) — on 04.10.2026 that published three
 * runs within 11 minutes from the same inputs. A run is a repeat when the newest run of the pointer
 *   - starts in the same hour (`t0Ms`; a new hour moves the window and the radar hour mean ⇒ always a new run),
 *   - read the same cube and station runs that the checkout's `point/index.json` offers now (every run the engine
 *     named: t1, t2, t3 if used, stations — MOSMIX-S is not an input), from the same tables,
 *   - was built with the stand of buscosun Fusion this code computes (`fusionRelease.ts`; an older stand ⇒ the run
 *     happens — that is how the product follows a new stand by itself, once), and
 *   - no measurement slot has arrived that the anchor would use now and did not use then.
 * Radar frames newer than that run inside the same hour do not count: the next hourly run takes them.
 * Anything unreadable or unknown ⇒ not a repeat (the run happens). `{ repeat, reason }`.
 */
export function repeatVerdict({ fcIndex, pointIndex, nowMs, tables = null, anchorSlotReady = false }) {
  const no = (reason) => ({ repeat: false, reason });
  const prev = fcIndex?.runs?.[0];
  if (!prev || fcIndex.killed) return no('kein veröffentlichter Lauf');
  if (prev.t0Ms !== roadFcT0(nowMs)) return no('neue Stunde');
  const built = fusionVersionOfEngine(prev.engine);
  if (built !== FUSION_CURRENT) return no(`${built == null ? 'Stand des letzten Laufs unbekannt' : fusionName(built)} → ${FUSION_NAME}`);
  const used = prev.engine?.runs;
  if (!used?.t1) return no('Eingaben des letzten Laufs unbekannt');
  const offered = {
    t1: pointIndex?.latestByTier?.t1?.run, t2: pointIndex?.latestByTier?.t2?.run, t3: pointIndex?.latestByTier?.t3?.run,
    stations: pointIndex?.stations?.runs?.[0]?.run,
  };
  for (const k of ['t1', 't2', 't3', 'stations']) {
    if (used[k] == null) continue;
    if (typeof offered[k] !== 'string') return no(`point/index.json nennt ${k} nicht`);
    if (offered[k] !== used[k]) return no(`${k} ${used[k]} → ${offered[k]}`);
  }
  if (tables) for (const k of Object.keys(tables)) if (tables[k] !== prev.engine?.tables?.[k]) return no(`Tabelle ${k} geändert`);
  if (anchorSlotReady && prev.engine?.anchor !== 'swis') return no('Messung der vollen Stunde ist jetzt da');
  return { repeat: true, reason: `Lauf ${prev.run} hat dieselbe Stunde und dieselben Eingaben (t1 ${used.t1}, stations ${used.stations ?? '—'})` };
}

/** `repeatVerdict` on a checkout: reads the two pointers, the table hashes and whether the anchor's slot is there. */
export function repeatVerdictOf(dataDir, nowMs, anchor = ROAD_FC_ANCHOR_MODE) {
  const read = (f) => { try { return JSON.parse(readFileSync(join(dataDir, f), 'utf8')); } catch { return null; } };
  return repeatVerdict({
    fcIndex: read(join(ROAD_FC_REPO_DIR, ROAD_FC_INDEX_PATH)), pointIndex: read('point/index.json'), nowMs,
    tables: { learned: sha12(join(dataDir, POINT_LEARNED_PATH)), stack: sha12(join(dataDir, POINT_STACK_PATH)), clima: sha12(join(dataDir, POINT_CLIMA_PATH)) },
    anchorSlotReady: anchor !== 'none' && existsSync(join(dataDir, ROAD_REPO_DIR, 'obs', `${roadStamp(roadFcT0(nowMs))}.json`)),
  });
}

// --- Publish -----------------------------------------------------------------------------------

/** Pointer after adding `entry` and pruning: `{ index, drop }` (run stamps to delete). */
export function nextIndex(prev, entry, nowMs, killed = false) {
  const runs = [entry, ...(prev?.runs ?? []).filter((r) => r.run !== entry.run)].sort((a, b) => (a.run < b.run ? 1 : -1));
  const drop = new Set(roadFcPrune(runs.map((r) => r.run), nowMs));
  return { index: { schema: 1, product: 'road-fc-index', updatedAt: new Date(nowMs).toISOString(), killed, runs: runs.filter((r) => !drop.has(r.run)) }, drop: [...drop] };
}

/**
 * Copies the run into the checkout and pushes. Every attempt starts from a fresh `origin/<branch>` (survives the
 * force-push of the map line and the pushes of the mirror); run directories the pointer does not name are removed.
 */
export function publishRun({ repoDir, runDir, entry, remote = 'origin', branch = 'main', nowMs = () => Date.now(), log = () => {}, retries = PUSH_RETRIES, heal = [] }) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const fcDir = join(repoDir, ROAD_FC_REPO_DIR);
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', remote, branch]);
      // V-AW-24: static files taken back from the archive are untracked here — out of the way of the checkout (the
      // remote may have them again by now), written back afterwards only where the remote still lacks them.
      for (const h of heal) { const f = join(fcDir, h.rel); if (existsSync(f) && !git(['ls-files', '--', `${ROAD_FC_REPO_DIR}/${h.rel}`])) rmSync(f); }
      git(['checkout', '--quiet', '-B', branch, `${remote}/${branch}`]);
      for (const h of heal) if (!existsSync(join(fcDir, h.rel))) writeAtomic(join(fcDir, h.rel), h.bytes);
      // Nothing but our own paths may ride along: a change staged in the clone (a stale index after an interrupted
      // run) would be pushed as ours and set other lines back — 04.10.2026, `audit/autobahnwetter.md` §14.5.
      const staged = git(['diff', '--cached', '--name-only']);
      if (staged) throw Object.assign(new Error(`Index des Klons trägt fremde Änderungen (${staged.split('\n').slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      const indexFile = join(fcDir, ROAD_FC_INDEX_PATH);
      const prev = existsSync(indexFile) ? parseRoadFcIndex(JSON.parse(readFileSync(indexFile, 'utf8'))) : null;
      const now = nowMs();
      const { index } = nextIndex(prev, { ...entry, publishedAt: new Date(now).toISOString() }, now);
      const keep = new Set(index.runs.map((r) => r.run));
      rmSync(join(fcDir, entry.run), { recursive: true, force: true });
      cpSync(runDir, join(fcDir, entry.run), { recursive: true });
      for (const d of readdirSync(fcDir)) if (/^\d{10}$/.test(d) && !keep.has(d)) rmSync(join(fcDir, d), { recursive: true, force: true });
      // A run named by the pointer whose directory is gone (lost to a force-push) leaves the pointer.
      index.runs = index.runs.filter((r) => existsSync(join(fcDir, r.run)));
      writeAtomic(indexFile, JSON.stringify(index, null, 1) + '\n');
      git(['add', '-A', '--', ROAD_FC_REPO_DIR]);
      if (!git(['status', '--porcelain', '--', ROAD_FC_REPO_DIR])) return { noop: true, attempt };
      // Path-limited commit: only `road/fc/v1` enters it, whatever else the index holds.
      git(['commit', '--quiet', '-m', `road-fc: ${entry.run} (${entry.points} Punkte)`, '--', ROAD_FC_REPO_DIR]);
      const outside = git(['diff', '--name-only', `${remote}/${branch}`, 'HEAD']).split('\n').filter((f) => f && !f.startsWith(`${ROAD_FC_REPO_DIR}/`));
      if (outside.length) throw Object.assign(new Error(`Commit fasst fremde Pfade an (${outside.slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      git(['push', '--quiet', remote, `HEAD:${branch}`]);
      return { attempt, commit: git(['rev-parse', 'HEAD']), runs: index.runs.map((r) => r.run) };
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      log(`Push-Versuch ${attempt}/${retries} abgelehnt (${String(e.stderr ?? e.message).split('\n').find((l) => l.trim()) ?? 'unbekannt'}) — neu aufsetzen`);
    }
  }
  throw lastErr;
}

// --- CLI ---------------------------------------------------------------------------------------

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  const log = (m) => console.log(`[road-fc] ${m}`);
  if (!flags.data) { console.error('--data=<Klon von buscosun-data> fehlt'); process.exit(2); }
  const nowMs = typeof flags.now === 'string' ? Date.parse(flags.now) : Date.now();
  if (!Number.isFinite(nowMs)) { console.error('--now nicht lesbar'); process.exit(2); }

  // Child of a sharded run: compute the slice, write the result, done.
  if (flags['shard-points']) {
    const fcDir = join(flags.data, ROAD_FC_REPO_DIR);
    const geoFile = join(fcDir, ROAD_FC_GEO_PATH);
    const geoDoc = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : { entries: [] };
    const allPoints = JSON.parse(readFileSync(join(fcDir, ROAD_FC_POINTS_PATH), 'utf8')).points;
    const r = await runShard({ dataDir: flags.data, points: JSON.parse(readFileSync(flags['shard-points'], 'utf8')), geoDoc, nowMs, anchor: flags.anchor, allPoints });
    writeFileSync(flags['shard-result'], JSON.stringify(r));
    return;
  }

  if (process.env.ROAD_FC === '0') { log('ROAD_FC=0 — Schalter aus, kein Lauf'); return; }
  // V-AW-24: points or geo file lost in the data repo ⇒ back from buscosun-archiv (checked), pushed with the run.
  const healed = await restoreFcStatic(join(flags.data, ROAD_FC_REPO_DIR), { log });
  for (const f of healed.failed) log(`${f.rel} fehlt im Daten-Repo und ist nicht zurückholbar: ${f.reason}`);
  const outDir = typeof flags.out === 'string' ? flags.out : mkdtempSync(join(tmpdir(), 'road-fc-out-'));
  let points = null;
  if (flags.ids || flags.limit) {
    const doc = JSON.parse(readFileSync(join(flags.data, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH), 'utf8'));
    points = doc.points;
    if (typeof flags.ids === 'string') { const want = new Set(flags.ids.split(',')); points = points.filter((p) => want.has(p.id)); }
    if (flags.limit) points = points.slice(0, Number(flags.limit));
  }
  const shards = flags.shards ? Number(flags.shards) : Math.max(1, Math.min(4, cpus().length));
  // `ROAD_FC_ANCHOR=none` (workflow env) or `--anchor=` override the contract's mode — the way back without a commit.
  const anchor = ['none', 'stations', 'all'].find((m) => m === (typeof flags.anchor === 'string' ? flags.anchor : process.env.ROAD_FC_ANCHOR)) ?? ROAD_FC_ANCHOR_MODE;
  // V-AW-31: a wake-up that would only repeat the newest published run ends here — no compute, no commit.
  // A healed static file must be pushed: no repeat guard then.
  if (flags.publish && !flags.always && process.env.ROAD_FC_ALWAYS !== '1' && !healed.restored.length) {
    const v = repeatVerdictOf(flags.data, nowMs, anchor);
    if (v.repeat) { log(`kein neuer Lauf — ${v.reason}`); return; }
    log(`neuer Lauf: ${v.reason}`);
  }
  const built = await buildRun({ dataDir: flags.data, outDir, nowMs, shards, points, anchor, log });
  for (const f of built.stats.failed.slice(0, 10)) log(`  ohne Ergebnis: ${f.id} — ${f.error}`);
  const verdict = publishVerdict(built);
  if (!verdict.ok) { log(`Lauf NICHT veröffentlicht: ${verdict.reasons.join(' · ')}`); process.exit(3); }
  if (!flags.publish) { log(`gebaut nach ${built.runDir} (ohne --publish)`); return; }
  const r = publishRun({ repoDir: flags.data, runDir: built.runDir, entry: built.entry, remote: flags.remote || 'origin', branch: flags.branch || 'main', log, heal: healed.restored });
  log(r.noop ? 'nichts zu committen' : `veröffentlicht ${r.commit.slice(0, 7)} (Versuch ${r.attempt}) · Läufe im Repo: ${r.runs.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
