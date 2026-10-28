#!/usr/bin/env node
/**
 * AW-6.2.1 — producer of the FORCING of the virtual road sensor (`buscosun-data/road/vs/v1/forcing/<run>.json.gz`,
 * contract `src/road/vs/roadVsForcing.ts`, `audit/autobahnwetter.md` §20): ICON-D2 on the DWD v1 path (icosahedral
 * grid, one GRIB2 message per file, CCSDS) sampled at the nearest cell of every point of `road/fc/v1/static/points.json`,
 * 0 … 48 h hourly; radiation de-averaged from means since model start to hourly means; LW↓ reconstructed; FRZ_RAIN as the
 * amount of the hour; ICON-D2-RUC VIS hourly 0 … 27 h until 30.11.2026.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/build-forcing.mjs
 *     --data=<checkout of buscosun-data> [--out=<dir>] [--run=YYYYMMDDHH] [--limit=N] [--fields=t2m,lwnet,…] [--no-ruc]
 *     [--publish] [--remote=origin] [--branch=main] [--concurrency=4]
 *
 * The point → cell index (`static/cells.json`) is built once from CLAT/CLON of the run and kept in the checkout; a run on a
 * grid with another cell count refuses (the index would be wrong). A missing file is a null step named in `missing`; a field
 * whose GRIB template contradicts its declared kind (`avg`/`acc`/`inst`) is refused for the whole run (a wrong convention
 * must never reach the model). Exit 0 = built/published (or `ROAD_VS=0`), 3 = not published (named), 1 = error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, mkdtempSync, renameSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import {
  ROAD_VS_REPO_DIR, ROAD_VS_FIELDS, ROAD_VS_FIELD_IDS, ROAD_VS_STEPS, ROAD_VS_RUC_STEPS, ROAD_VS_RUC_VIS_ENDS, ROAD_VS_RUN_SLOT_H,
  ROAD_VS_FORCING_KEEP, ROAD_VS_FORCING_INDEX_PATH, ROAD_VS_CELLS_PATH, ROAD_VS_SURFACE_EMISSIVITY, ROAD_VS_SOURCE_TEXT, ROAD_VS_DWD_V1_BASE, ROAD_VS_MODEL, ROAD_VS_RUC_MODEL,
  roadVsForcingPath, roadVsRunStamp, roadVsRunDir, roadVsRunMsOf, roadVsStepName, roadVsFieldUrl, roadVsEncode, roadVsConvert,
  intervalFromStartMeans, amountFromStartAccumulations, lwDownFromNet, buildCellIndex, roadVsForcingProblems,
} from '../../../src/road/vs/roadVsForcing.ts';
import { ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH } from '../../../src/road/roadFc.ts';

const H = 3_600_000;
const PUSH_RETRIES = 6;
const sha12 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

// --- HTTP ---------------------------------------------------------------------------------------

/** GET with three attempts; 404 ⇒ null (a missing step is a finding, not a crash); other errors throw after the retries. */
export async function fetchBytes(url, { retries = 3 } = {}) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) { last = e; await new Promise((res) => setTimeout(res, 1000 * (i + 1))); }
  }
  throw new Error(`${url}: ${last?.message ?? last}`);
}

async function headOk(url) {
  try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20_000) }); return r.ok; } catch { return false; }
}

/** Run directories of a parameter (`YYYY-MM-DDTHH:00`), newest last. */
async function listRuns(model, param) {
  const html = await (await fetch(`${ROAD_VS_DWD_V1_BASE}/${model}/p/${param}/r/`, { signal: AbortSignal.timeout(20_000) })).text();
  return [...html.matchAll(/href="(\d{4}-\d{2}-\d{2}T\d{2})%3A00\/"/g)].map((m) => `${m[1]}:00`).sort();
}
const runMsOfDir = (dir) => Date.parse(`${dir}:00Z`);

/**
 * The newest ICON-D2 run whose LAST step of the slowest field we need (ATHB_S +48 h) is there — a run is published field by
 * field over ≈ 40 min; an incomplete run would leave the end of the horizon null.
 */
export async function newestCompleteRun({ probeField = 'lwnet' } = {}) {
  const runs = await listRuns(ROAD_VS_MODEL, ROAD_VS_FIELDS[probeField].param);
  for (const dir of runs.slice(-4).reverse()) {
    const ms = runMsOfDir(dir);
    if (await headOk(roadVsFieldUrl(ROAD_VS_FIELDS[probeField], ms, ROAD_VS_STEPS - 1))) return ms;
  }
  return null;
}

/** The newest RUC run with its +27 h step published, not older than the ICON run by more than 3 h; null when VIS is gone. */
export async function newestRucRun(iconRunMs, nowMs) {
  if (nowMs > Date.parse(ROAD_VS_RUC_VIS_ENDS)) return null;
  let runs;
  try { runs = await listRuns(ROAD_VS_RUC_MODEL, 'VIS'); } catch { return null; }
  for (const dir of runs.slice(-4).reverse()) {
    const ms = runMsOfDir(dir);
    if (ms < iconRunMs - ROAD_VS_RUN_SLOT_H * H) break;
    if (await headOk(roadVsFieldUrl(ROAD_VS_FIELDS.vis, ms, ROAD_VS_RUC_STEPS - 1))) return ms;
  }
  return null;
}

// --- Cells ----------------------------------------------------------------------------------------

/** Loads the point → cell index from the checkout or builds it from CLAT/CLON of `runMs` (and writes it there). */
export async function loadOrBuildCells({ dataDir, points, pointsHash, runMs, log }) {
  const file = join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_CELLS_PATH);
  if (existsSync(file)) {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    if (doc.product === 'road-vs-cells' && doc.points === pointsHash && points.every((p) => Array.isArray(doc.map[p.id]))) return { doc, built: false };
    log(`cells.json passt nicht zur Punktdatei (${doc.points} ≠ ${pointsHash}) — wird neu gebaut`);
  }
  const base = `${ROAD_VS_DWD_V1_BASE}/${ROAD_VS_MODEL}/p`;
  const run = encodeURIComponent(roadVsRunDir(runMs));
  const [clat, clon] = await Promise.all([fetchBytes(`${base}/CLAT/r/${run}/s/PT000H00M.grib2`), fetchBytes(`${base}/CLON/r/${run}/s/PT000H00M.grib2`)]);
  if (!clat || !clon) throw new Error('CLAT/CLON des Laufs nicht erreichbar — kein Zellindex');
  const la = decodeGrib2(clat), lo = decodeGrib2(clon);
  if (la.values.length !== lo.values.length) throw new Error('CLAT und CLON verschieden lang');
  // CLAT/CLON of ICON are in degrees on the v1 path (the regular-grid files carried radians — checked by the range).
  const toDeg = Math.max(...Array.from(la.values.subarray(0, 1000)).filter(Number.isFinite)) < 4 ? 180 / Math.PI : 1;
  const latDeg = Float64Array.from(la.values, (x) => x * toDeg), lonDeg = Float64Array.from(lo.values, (x) => x * toDeg);
  const idx = buildCellIndex(latDeg, lonDeg);
  const map = {};
  let far = 0;
  for (const p of points) {
    const c = idx.find(p.lat, p.lon);
    if (!c) { far++; continue; }
    map[p.id] = [c.cell, c.dKm];
  }
  if (far) log(`${far} Punkte ohne Zelle in 5 km (außerhalb des ICON-D2-Gebiets?)`);
  const doc = { schema: 1, product: 'road-vs-cells', builtAt: new Date().toISOString(), model: ROAD_VS_MODEL, cells: la.values.length, points: pointsHash, map };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc));
  return { doc, built: true };
}

// --- Sampling -----------------------------------------------------------------------------------

/** Checks the GRIB template of a decoded field against the declared kind; returns a problem text or null. */
export function templateProblem(id, f) {
  const kind = ROAD_VS_FIELDS[id].kind;
  const stat = f.productTemplate === 8 || f.productTemplate === 11;
  if (kind === 'inst' && stat) return `${id}: GRIB ist statistisch verarbeitet (PDT ${f.productTemplate}), erwartet Momentanwert`;
  if (kind === 'avg' && (!stat || f.statProcess !== 0)) return `${id}: erwartet Mittel (PDT 4.8, Prozess 0), GRIB PDT ${f.productTemplate} Prozess ${f.statProcess}`;
  if (kind === 'acc' && (!stat || f.statProcess !== 1)) return `${id}: erwartet Akkumulation (PDT 4.8, Prozess 1), GRIB PDT ${f.productTemplate} Prozess ${f.statProcess}`;
  if ((kind === 'avg' || kind === 'acc') && f.forecastTime !== 0) return `${id}: Intervall beginnt nicht beim Modellstart (forecastTime ${f.forecastTime})`;
  return null;
}

/** Samples one decoded field at the cells; returns raw numbers in product units (NaN = masked). */
export function sampleAt(f, cells, def) {
  const out = new Float64Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const v = f.values[cells[i]];
    out[i] = Number.isFinite(v) ? roadVsConvert(def, v) : NaN;
  }
  return out;
}

/**
 * Fetches, decodes and samples every step of one field; `avg`/`acc` fields are turned into hourly intervals here (the
 * since-start values are not kept). Returns `{ series: Float64Array[] per step, missing: number[], problem }`.
 */
export async function fieldSeries({ id, runMs, cells, steps, concurrency = 4, log }) {
  const def = ROAD_VS_FIELDS[id];
  const raw = new Array(steps).fill(null);
  const missing = [];
  let problem = null;
  let next = 0;
  const worker = async () => {
    while (next < steps && !problem) {
      const h = next++;
      if (def.kind === 'avg' || def.kind === 'acc') { if (h === 0) continue; }
      const url = roadVsFieldUrl(def, runMs, h);
      const bytes = await fetchBytes(url);
      if (!bytes) { missing.push(h); continue; }
      let f;
      try { f = decodeGrib2(bytes); } catch (e) { log(`${id} +${h} h: ${e.message}`); missing.push(h); continue; }
      const tp = templateProblem(id, f);
      if (tp) { problem = tp; return; }
      if (f.values.length < cells.reduce((m, c) => Math.max(m, c), 0)) { problem = `${id} +${h} h: Gitter kleiner als der Zellindex`; return; }
      raw[h] = sampleAt(f, cells, def);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (problem) return { series: null, missing, problem };
  if (def.kind === 'inst') return { series: raw, missing: missing.sort((a, b) => a - b), problem: null };
  // De-average: hour h = interval (h−1, h] from the since-start values at h−1 and h.
  const series = new Array(steps).fill(null);
  for (let h = 1; h < steps; h++) {
    const cur = raw[h], prev = h === 1 ? null : raw[h - 1];
    if (!cur || (h > 1 && !prev)) continue;
    const out = new Float64Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      const c = cur[i], p = prev ? prev[i] : null;
      const x = def.kind === 'avg' ? intervalFromStartMeans(p, c, h - 1, h) : amountFromStartAccumulations(p, c, h - 1);
      out[i] = x == null ? NaN : x;
    }
    series[h] = out;
  }
  // A missing since-start step empties two intervals; name both.
  const miss = new Set(missing.flatMap((h) => [h, h + 1].filter((x) => x >= 1 && x < steps)));
  return { series, missing: [...miss].sort((a, b) => a - b), problem: null };
}

// --- A run ------------------------------------------------------------------------------------------

export async function buildForcing({ dataDir, outDir, runMs = null, rucRunMs = undefined, nowMs = Date.now(), limit = null, fields = null, noRuc = false, concurrency = 4, log = () => {} }) {
  const T0 = Date.now();
  const pointsFile = join(dataDir, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH);
  const pointsBytes = readFileSync(pointsFile);
  let points = JSON.parse(pointsBytes.toString('utf8')).points;
  if (limit) points = points.slice(0, limit);
  const pointsHash = sha12(pointsBytes);
  const run = runMs ?? await newestCompleteRun();
  if (run == null) throw new Error('kein vollständiger ICON-D2-Lauf auf dem v1-Pfad gefunden');
  const stamp = roadVsRunStamp(run);
  log(`ICON-D2-Lauf ${roadVsRunDir(run)} (${stamp}), ${points.length} Punkte`);
  const { doc: cellsDoc, built } = await loadOrBuildCells({ dataDir, points, pointsHash, runMs: run, log });
  if (built) log(`Zellindex gebaut: ${Object.keys(cellsDoc.map).length} Punkte auf ${cellsDoc.cells} Zellen`);
  const withCell = points.filter((p) => cellsDoc.map[p.id]);
  const cells = withCell.map((p) => cellsDoc.map[p.id][0]);
  const wanted = (fields ?? ROAD_VS_FIELD_IDS).filter((id) => ROAD_VS_FIELDS[id].param && (ROAD_VS_FIELDS[id].model ?? ROAD_VS_MODEL) === ROAD_VS_MODEL);
  const series = {}, missing = {}, outOfRange = {};
  for (const id of wanted) {
    const t = Date.now();
    const r = await fieldSeries({ id, runMs: run, cells, steps: ROAD_VS_STEPS, concurrency, log });
    if (r.problem) throw Object.assign(new Error(r.problem), { refuse: true });
    series[id] = r.series;
    if (r.missing.length) missing[id] = r.missing;
    log(`  ${id.padEnd(6)} ${r.missing.length ? `${r.missing.length} Schritte fehlen ` : ''}${((Date.now() - t) / 1000).toFixed(0)} s`);
  }
  // RUC VIS, hourly steps of the RUC run, placed on the ICON hour axis.
  let ruc = null;
  if (!noRuc && (fields == null || fields.includes('vis'))) {
    const rr = rucRunMs === undefined ? await newestRucRun(run, nowMs) : rucRunMs;
    if (rr != null) {
      const r = await fieldSeries({ id: 'vis', runMs: rr, cells, steps: ROAD_VS_RUC_STEPS, concurrency, log });
      if (r.problem) log(`RUC VIS verworfen: ${r.problem}`);
      else {
        const vis = new Array(ROAD_VS_STEPS).fill(null);
        for (let h = 0; h < ROAD_VS_RUC_STEPS; h++) { const i = (rr + h * H - run) / H; if (Number.isInteger(i) && i >= 0 && i < ROAD_VS_STEPS) vis[i] = r.series[h]; }
        series.vis = vis;
        ruc = { run: roadVsRunStamp(rr), steps: ROAD_VS_RUC_STEPS };
        if (r.missing.length) missing.vis = r.missing;
      }
    } else log(nowMs > Date.parse(ROAD_VS_RUC_VIS_ENDS) ? 'RUC VIS: nach dem 30.11.2026 nicht mehr geliefert' : 'RUC VIS: kein passender Lauf');
  }
  // LW↓ from the hourly net flux and the ground temperature AT THE END of the hour (T_G is instantaneous).
  if (series.lwnet && series.tg) {
    const lw = new Array(ROAD_VS_STEPS).fill(null);
    for (let h = 1; h < ROAD_VS_STEPS; h++) {
      const n = series.lwnet[h], g = series.tg[h];
      if (!n || !g) continue;
      const out = new Float64Array(cells.length);
      for (let i = 0; i < cells.length; i++) { const x = lwDownFromNet(Number.isFinite(n[i]) ? n[i] : null, Number.isFinite(g[i]) ? g[i] : null, ROAD_VS_SURFACE_EMISSIVITY); out[i] = x == null ? NaN : x; }
      lw[h] = out;
    }
    series.lwdown = lw;
  }
  // Encode per point.
  const outPoints = withCell.map((p, i) => {
    const v = {};
    for (const id of Object.keys(series)) {
      const arr = new Array(ROAD_VS_STEPS).fill(null);
      for (let h = 0; h < ROAD_VS_STEPS; h++) {
        const s = series[id][h];
        if (!s || !Number.isFinite(s[i])) continue;
        const e = roadVsEncode(id, s[i]);
        if (e == null) outOfRange[id] = (outOfRange[id] ?? 0) + 1;
        arr[h] = e;
      }
      v[id] = arr;
    }
    return { id: p.id, cell: cellsDoc.map[p.id][0], dKm: cellsDoc.map[p.id][1], v };
  });
  const doc = {
    schema: 1, product: 'road-vs-forcing', run: stamp, runMs: run, builtAt: new Date(nowMs).toISOString(), model: ROAD_VS_MODEL,
    steps: ROAD_VS_STEPS, stepH: 1, conv: { avg: 'interval', acc: 'interval', eps: ROAD_VS_SURFACE_EMISSIVITY }, ruc,
    cells: sha12(readFileSync(join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_CELLS_PATH))), missing, outOfRange, source: ROAD_VS_SOURCE_TEXT, points: outPoints,
  };
  const problems = roadVsForcingProblems(doc);
  if (problems.length) throw Object.assign(new Error(`Produkt besteht den eigenen Prüfer nicht: ${problems.join('; ')}`), { refuse: true });
  const gz = gzipSync(JSON.stringify(doc), { level: 9 });
  const rel = roadVsForcingPath(stamp);
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, gz); renameSync(`${file}.tmp`, file);
  const entry = { run: stamp, runMs: run, builtAt: doc.builtAt, points: outPoints.length, bytes: gz.length, missing: Object.keys(missing), ruc: ruc?.run ?? null };
  log(`Antrieb ${stamp}: ${outPoints.length} Punkte · ${Object.keys(series).length} Felder · ${(gz.length / 1e6).toFixed(2)} MB gz · ${Object.keys(missing).length ? `fehlend ${JSON.stringify(missing)}` : 'kein Schritt fehlt'} · ${Object.keys(outOfRange).length ? `außerhalb ${JSON.stringify(outOfRange)}` : ''} · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  return { doc, entry, file, rel, cellsBuilt: built };
}

// --- Publish ------------------------------------------------------------------------------------

export function nextIndex(prev, entry, nowMs) {
  const runs = [entry, ...(prev?.runs ?? []).filter((r) => r.run !== entry.run)].sort((a, b) => (a.run < b.run ? 1 : -1));
  return { schema: 1, product: 'road-vs-forcing-index', updatedAt: new Date(nowMs).toISOString(), runs: runs.slice(0, ROAD_VS_FORCING_KEEP) };
}

/** Copies the run (and a newly built cells file) into the checkout, prunes, commits path-limited and pushes with re-basing on a fresh remote (pattern of `road-forecast.mjs`). */
export function publishForcing({ repoDir, built, remote = 'origin', branch = 'main', nowMs = () => Date.now(), log = () => {}, retries = PUSH_RETRIES }) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const dir = join(repoDir, ROAD_VS_REPO_DIR);
  const cellsBytes = readFileSync(join(dir, ROAD_VS_CELLS_PATH));
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', remote, branch]);
      git(['checkout', '--quiet', '-B', branch, `${remote}/${branch}`]);
      const staged = git(['diff', '--cached', '--name-only']);
      if (staged) throw Object.assign(new Error(`Index des Klons trägt fremde Änderungen (${staged.split('\n').slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      const cellsFile = join(dir, ROAD_VS_CELLS_PATH);
      if (!existsSync(cellsFile)) { mkdirSync(dirname(cellsFile), { recursive: true }); writeFileSync(cellsFile, cellsBytes); }
      const idxFile = join(dir, ROAD_VS_FORCING_INDEX_PATH);
      const prev = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : null;
      const index = nextIndex(prev, built.entry, nowMs());
      const target = join(dir, built.rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(built.file, target);
      const keep = new Set(index.runs.map((r) => roadVsForcingPath(r.run).split('/').pop()));
      for (const f of readdirSync(dirname(target))) if (/^\d{10}\.json\.gz$/.test(f) && !keep.has(f)) rmSync(join(dirname(target), f));
      writeFileSync(idxFile, `${JSON.stringify(index, null, 1)}\n`);
      git(['add', '-A', '--', ROAD_VS_REPO_DIR]);
      if (!git(['status', '--porcelain', '--', ROAD_VS_REPO_DIR])) return { noop: true, attempt };
      git(['commit', '--quiet', '-m', `road-vs: forcing ${built.entry.run} (${built.entry.points} Punkte)`, '--', ROAD_VS_REPO_DIR]);
      const outside = git(['diff', '--name-only', `${remote}/${branch}`, 'HEAD']).split('\n').filter((f) => f && !f.startsWith(`${ROAD_VS_REPO_DIR}/`));
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
  const log = (m) => console.log(`[road-vs] ${m}`);
  if (!flags.data) { console.error('--data=<Klon von buscosun-data> fehlt'); process.exit(2); }
  if (process.env.ROAD_VS === '0') { log('ROAD_VS=0 — Schalter aus, kein Lauf'); return; }
  const runMs = typeof flags.run === 'string' ? roadVsRunMsOf(flags.run) : null;
  if (typeof flags.run === 'string' && !Number.isFinite(runMs)) { console.error('--run=YYYYMMDDHH nicht lesbar'); process.exit(2); }
  const outDir = typeof flags.out === 'string' ? flags.out : mkdtempSync(join(tmpdir(), 'road-vs-'));
  // Repeat guard: the newest published run is the newest complete run ⇒ nothing to do.
  if (flags.publish && runMs == null) {
    const idxFile = join(flags.data, ROAD_VS_REPO_DIR, ROAD_VS_FORCING_INDEX_PATH);
    const prev = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : null;
    const newest = await newestCompleteRun();
    if (newest != null && prev?.runs?.[0]?.run === roadVsRunStamp(newest)) { log(`kein neuer Lauf — ${prev.runs[0].run} ist schon veröffentlicht`); return; }
  }
  let built;
  try {
    built = await buildForcing({
      dataDir: flags.data, outDir, runMs, limit: flags.limit ? Number(flags.limit) : null,
      fields: typeof flags.fields === 'string' ? flags.fields.split(',') : null, noRuc: flags['no-ruc'] === true,
      concurrency: flags.concurrency ? Number(flags.concurrency) : 4, log,
    });
  } catch (e) {
    if (e.refuse) { log(`Lauf NICHT veröffentlicht: ${e.message}`); process.exit(3); }
    throw e;
  }
  if (!flags.publish) { log(`gebaut nach ${built.file} (ohne --publish)`); return; }
  const r = publishForcing({ repoDir: flags.data, built, remote: flags.remote || 'origin', branch: flags.branch || 'main', log });
  log(r.noop ? 'nichts zu committen' : `veröffentlicht ${r.commit.slice(0, 7)} (Versuch ${r.attempt}) · Läufe im Repo: ${r.runs.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
