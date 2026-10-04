#!/usr/bin/env node
/**
 * AW-6.1 — Producer of the route forecast (`buscosun-data/road/fc/v1/`, contract `src/road/roadFc.ts`,
 * `audit/autobahnwetter.md` §14): buscosun Fusion 8 at every point of `static/points.json`, hourly, from a local
 * checkout of the data repo.
 *
 * The chain is the client's: `getPointForecastFromCube` with the options of `defaultCubeIo()` (stage `fs`, tables
 * `json`, radar hour mean, MOSMIX station member) — only the store (a directory instead of the CDN), the decoders
 * (Node) and three producer facts differ: terrain and roughness come from `static/geo.json` (the client's own cache
 * entries, built once), decoded chunks and radar frames are memoised across points, and there is NO measurement
 * anchor (`obs: null` — one BrightSky request per point is not affordable; the engine says "kein Anker").
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-forecast.mjs
 *     --data=<checkout of buscosun-data> [--out=<work dir>] [--now=<iso>] [--shards=4] [--publish]
 *     [--limit=N] [--ids=a8@0,Q441] [--remote=origin] [--branch=main]
 *
 * `--publish`: the run is copied into the checkout, the pointer updated, old runs pruned, committed and pushed —
 * re-based onto a fresh `origin/main` on every attempt (the map line force-pushes this repo, the radar mirror pushes
 * every few minutes). Exit 0 = run published (or built, without `--publish`; or switched off with `ROAD_FC=0`),
 * 3 = run NOT published (too many points failed, tables not read, no tier-1 run), 1 = error.
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
  ROAD_FC_SOURCE_TEXT, ROAD_FC_MAX_FAILED_SHARE,
  roadFcStamp, roadFcT0, roadFcEncode, roadFcOriginCode, roadFcSeriesProblems, roadFcPointUsable, roadFcCorridorPath, roadFcStatePath,
  roadFcPrune, parseRoadFcIndex, parseRoadFcPoints,
} from '../../src/road/roadFc.ts';
import { newStoreStats } from '../../src/point/client/store.ts';
import { decodeCubeChunk, POINT_LEARNED_PATH, POINT_STACK_PATH, POINT_CLIMA_PATH } from '../../src/point/cubeFormat.ts';
import { getPointForecastFromCube, clearCubeForecastCache, exceedance, FUSION8_NOWCAST_HOUR_MEAN } from '../../src/pointForecast/cubeSource.ts';
import { getClimaField } from '../../src/pointForecast/fusion/attach.ts';

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
    learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs',
    nowcastHourMean: FUSION8_NOWCAST_HOUR_MEAN,
    nowMs: () => nowMs,
  };
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
export async function computePoint(p, io, nowMs) {
  try {
    clearCubeForecastCache();
    const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours: ROAD_FC_HOURS, pointSource: 'cube', includeRadarNowcast: true }, io);
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
      v,
    };
    if (!roadFcPointUsable(point)) return { error: 'weniger als die Hälfte der Stunden mit Temperatur' };
    const stage = fc.cube.notes.some((n) => /^stage:fs — neueste Stufe \(buscosun Fusion 8\)/.test(n));
    return { point, runs: runsOf(fc), stage, errors: fc.cube.errors.length };
  } catch (e) {
    return { error: String(e?.message ?? e).split('\n')[0] };
  }
}

/** A slice of points in one process. */
export async function runShard({ dataDir, points, geoDoc, nowMs }) {
  installNodeShims();
  const cache = geoBackend(geoDoc);
  const io = makeIo({ store: dirStore(dataDir), cache, nowMs });
  const out = [], failed = [];
  let runs = null, noStage = 0, readerErrors = 0;
  for (const p of points) {
    const r = await computePoint(p, io, nowMs);
    if (r.error) { failed.push({ id: p.id, error: r.error }); continue; }
    out.push(r.point);
    runs ??= r.runs;
    if (!r.stage) noStage++;
    readerErrors += r.errors;
  }
  return { points: out, failed, runs, noStage, readerErrors, geo: cache.counts };
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
export async function buildRun({ dataDir, outDir, nowMs = Date.now(), shards = 1, points = null, inProcess = false, log = () => {} }) {
  const T0 = Date.now();
  const fcDir = join(dataDir, ROAD_FC_REPO_DIR);
  const pointsDoc = parseRoadFcPoints(JSON.parse(readFileSync(join(fcDir, ROAD_FC_POINTS_PATH), 'utf8')));
  if (!pointsDoc) throw new Error(`${ROAD_FC_POINTS_PATH} nicht lesbar`);
  const geoFile = join(fcDir, ROAD_FC_GEO_PATH);
  const geoDoc = existsSync(geoFile) ? JSON.parse(readFileSync(geoFile, 'utf8')) : { entries: [] };
  const all = points ?? pointsDoc.points;
  const run = roadFcStamp(nowMs), t0Ms = roadFcT0(nowMs);

  let parts;
  if (inProcess || shards <= 1) parts = [await runShard({ dataDir, points: all, geoDoc, nowMs })];
  else {
    const work = mkdtempSync(join(tmpdir(), 'road-fc-'));
    const n = Math.min(shards, Math.max(1, all.length));
    const size = Math.ceil(all.length / n);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const pf = join(work, `p${i}.json`), rf = join(work, `r${i}.json`);
      writeFileSync(pf, JSON.stringify(all.slice(i * size, (i + 1) * size)));
      jobs.push(spawnShard([`--data=${dataDir}`, `--now=${new Date(nowMs).toISOString()}`, `--shard-points=${pf}`, `--shard-result=${rf}`]).then(() => JSON.parse(readFileSync(rf, 'utf8'))));
    }
    try { parts = await Promise.all(jobs); } finally { rmSync(work, { recursive: true, force: true }); }
  }

  const done = parts.flatMap((p) => p.points), failed = parts.flatMap((p) => p.failed);
  const runs = parts.find((p) => p.runs)?.runs ?? {};
  const engine = {
    name: 'buscosun Fusion 8', stage: 'fs', anchor: 'none', hourMean: FUSION8_NOWCAST_HOUR_MEAN, runs,
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
  const head = (kind, id) => ({ schema: 1, product: 'road-fc', run, issuedAt, t0Ms, steps: ROAD_FC_STEPS, kind, id, engine, source: ROAD_FC_SOURCE_TEXT });
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
  log(`Lauf ${run}: ${done.length}/${all.length} Punkte · ${failed.length} ohne Ergebnis · ${byCorridor.size} Korridore + ${byState.size} Länder · ${(bytes / 1e6).toFixed(2)} MB · ${((Date.now() - T0) / 1000).toFixed(1)} s · Cube ${JSON.stringify(runs)}${noStage ? ` · ${noStage} Punkte OHNE Stufe fs` : ''}${geo.terrainMiss || geo.z0Miss ? ` · Gelände nicht vorab: ${geo.terrainMiss}, z0: ${geo.z0Miss}` : ''}`);
  return { run, runDir, entry, stats };
}

/** May this run be published? Too many lost points, or points computed without the stage, block it (named). */
export function publishVerdict({ entry, stats }) {
  const reasons = [];
  if (!entry.points) reasons.push('kein Punkt mit Ergebnis');
  if (stats.total && stats.failed.length / stats.total > ROAD_FC_MAX_FAILED_SHARE) reasons.push(`${stats.failed.length} von ${stats.total} Punkten ohne Ergebnis (> ${100 * ROAD_FC_MAX_FAILED_SHARE} %)`);
  if (stats.noStage) reasons.push(`${stats.noStage} Punkte ohne Stufe fs (gelernte Tabellen nicht gelesen) — das wäre nicht buscosun Fusion 8`);
  if (!entry.engine.runs.t1) reasons.push('kein Lauf der Stufe 1 gelesen');
  return { ok: reasons.length === 0, reasons };
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
export function publishRun({ repoDir, runDir, entry, remote = 'origin', branch = 'main', nowMs = () => Date.now(), log = () => {}, retries = PUSH_RETRIES }) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const fcDir = join(repoDir, ROAD_FC_REPO_DIR);
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', remote, branch]);
      git(['checkout', '--quiet', '-B', branch, `${remote}/${branch}`]);
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
    const r = await runShard({ dataDir: flags.data, points: JSON.parse(readFileSync(flags['shard-points'], 'utf8')), geoDoc, nowMs });
    writeFileSync(flags['shard-result'], JSON.stringify(r));
    return;
  }

  if (process.env.ROAD_FC === '0') { log('ROAD_FC=0 — Schalter aus, kein Lauf'); return; }
  const outDir = typeof flags.out === 'string' ? flags.out : mkdtempSync(join(tmpdir(), 'road-fc-out-'));
  let points = null;
  if (flags.ids || flags.limit) {
    const doc = JSON.parse(readFileSync(join(flags.data, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH), 'utf8'));
    points = doc.points;
    if (typeof flags.ids === 'string') { const want = new Set(flags.ids.split(',')); points = points.filter((p) => want.has(p.id)); }
    if (flags.limit) points = points.slice(0, Number(flags.limit));
  }
  const shards = flags.shards ? Number(flags.shards) : Math.max(1, Math.min(4, cpus().length));
  const built = await buildRun({ dataDir: flags.data, outDir, nowMs, shards, points, log });
  for (const f of built.stats.failed.slice(0, 10)) log(`  ohne Ergebnis: ${f.id} — ${f.error}`);
  const verdict = publishVerdict(built);
  if (!verdict.ok) { log(`Lauf NICHT veröffentlicht: ${verdict.reasons.join(' · ')}`); process.exit(3); }
  if (!flags.publish) { log(`gebaut nach ${built.runDir} (ohne --publish)`); return; }
  const r = publishRun({ repoDir: flags.data, runDir: built.runDir, entry: built.entry, remote: flags.remote || 'origin', branch: flags.branch || 'main', log });
  log(r.noop ? 'nichts zu committen' : `veröffentlicht ${r.commit.slice(0, 7)} (Versuch ${r.attempt}) · Läufe im Repo: ${r.runs.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
