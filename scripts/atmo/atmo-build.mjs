#!/usr/bin/env node
/**
 * atmo-build — the height cube `atmo/v1` from one ICON-D2 run (DWD v1 tree, model levels).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/atmo/atmo-build.mjs \
 *     --store=<dir holding atmo/v1 content> [--run=YYYYMMDDHH] [--cache=<grib cache>] [--jobs=4] [--check] [--measure]
 *
 * --check   only print `{"due": "<run>"|null, "newest": …, "published": …}` (newest complete DWD run vs the store).
 * --measure also print compressed sizes of the codec variants on the first tiles (spike).
 *
 * Steps: CLAT/CLON/HSURF → nearest ICON cell per grid point (never averaged) → HHL half levels → per step PS + T/QV/U/V
 * on ATMO_LEVELS → pressure by hypsometric integration from PS, RH over water from QV → quantise → tiles + run.json →
 * index.json with retention (newest RETAIN runs). An incomplete run or an implausible column aborts the build — nothing
 * is written into the store before the whole run is green.
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  ATMO_SCHEMA, ATMO_DIR, ATMO_MODEL, ATMO_ATTRIBUTION, ATMO_LEVELS, ATMO_STEPS, ATMO_GRID, ATMO_RUN_EVERY_H, VARS, MISSING,
  GRID_NY, GRID_NX, TILE_CELLS, TILES_Y, TILES_X, gridLat, gridLon, tileExtent, runName, runMs, payloadLength,
  encodePayload, shuffle, packTile, checkColumnStep,
} from '../../src/atmosphere/atmoContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DWD = process.env.DWD_NEW_BASE || 'https://opendata.dwd.de/weather/nwp/v1/m';
const UA = 'buscosun-atmo/0.1 (+https://buscosun.com)';
const RETAIN = 2;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
const pad = (n, w) => String(n).padStart(w, '0');

const isoRun = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}T${pad(d.getUTCHours(), 2)}%3A00`; };
const stepName = (h) => `PT${pad(h, 3)}H00M.grib2`;
const urlOf = (param, run, h, level) => `${DWD}/${ATMO_MODEL}/p/${param}/${level != null ? `lvt1/150/lv1/${level}/` : ''}r/${isoRun(runMs(run))}/s/${stepName(h)}`;

const storeDir = args.store ? resolve(String(args.store)) : null;
const indexFile = storeDir ? join(storeDir, 'index.json') : null;
const readIndex = () => (indexFile && existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : null);

/** Newest run whose last step of the last-written fields exists (HEAD). */
async function newestRun(now = Date.now()) {
  const slot = ATMO_RUN_EVERY_H * 3_600_000;
  let t = Math.floor(now / slot) * slot;
  const last = ATMO_STEPS[ATMO_STEPS.length - 1];
  for (let i = 0; i < 8; i++, t -= slot) {
    const run = runName(t);
    const probes = [urlOf('V', run, last, ATMO_LEVELS[ATMO_LEVELS.length - 1]), urlOf('QV', run, last, ATMO_LEVELS[0]), urlOf('PS', run, last)];
    let ok = true;
    for (const u of probes) { const r = await fetch(u, { method: 'HEAD', headers: { 'user-agent': UA } }); if (r.status !== 200) { ok = false; break; } }
    if (ok) return run;
  }
  return null;
}

if (args.check) {
  const newest = await newestRun();
  const published = readIndex()?.runs?.[0]?.run ?? null;
  console.log(JSON.stringify({ due: newest && (!published || newest > published) ? newest : null, newest, published }));
  process.exit(0);
}

const run = typeof args.run === 'string' ? args.run : await newestRun();
if (!run || !/^\d{10}$/.test(run)) { console.error('kein vollständiger ICON-D2-Lauf gefunden'); process.exit(1); }
log('Lauf', run);
const T0 = Date.now();
const cache = args.cache ? resolve(String(args.cache)) : null;

// ── 1. grid → nearest ICON cell ───────────────────────────────────────────────
const { decodeGrib2 } = await import('../../src/sources/gribDecode.ts');
async function fetchField(url) {
  const cf = cache ? join(cache, url.replace(/^https?:\/\//, '').replace(/[%:?]/g, '_')) : null;
  if (cf && existsSync(cf)) return decodeGrib2(new Uint8Array(readFileSync(cf)));
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const b = new Uint8Array(await r.arrayBuffer());
  if (cf) { mkdirSync(dirname(cf), { recursive: true }); writeFileSync(cf, b); }
  return decodeGrib2(b);
}
const clat = (await fetchField(urlOf('CLAT', run, 0))).values;
const clon = (await fetchField(urlOf('CLON', run, 0))).values;
const hsurfAll = (await fetchField(urlOf('HSURF', run, 0))).values;
const NCELL = clat.length;
const deg = Math.max(...Array.from(clat.subarray(0, 1000), Math.abs)) < 2 ? 180 / Math.PI : 1;
// Bin cells by 0.1° for the nearest-cell search.
const BIN = 0.1, bins = new Map();
for (let i = 0; i < NCELL; i++) {
  const la = clat[i] * deg, lo = clon[i] * deg;
  if (la < ATMO_GRID.latMin - 0.3 || la > ATMO_GRID.latMax + 0.3 || lo < ATMO_GRID.lonMin - 0.3 || lo > ATMO_GRID.lonMax + 0.3) continue;
  const k = `${Math.floor(la / BIN)},${Math.floor(lo / BIN)}`;
  let a = bins.get(k); if (!a) bins.set(k, (a = [])); a.push(i);
}
const NCOL = GRID_NY * GRID_NX;
const idx = new Int32Array(NCOL);
for (let iy = 0; iy < GRID_NY; iy++) for (let ix = 0; ix < GRID_NX; ix++) {
  const la = gridLat(iy), lo = gridLon(ix), cl = Math.cos((la * Math.PI) / 180);
  const by = Math.floor(la / BIN), bx = Math.floor(lo / BIN);
  let best = Infinity, bi = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const i of bins.get(`${by + dy},${bx + dx}`) ?? []) {
    const ey = clat[i] * deg - la, ex = (clon[i] * deg - lo) * cl, d = ey * ey + ex * ex;
    if (d < best) { best = d; bi = i; }
  }
  if (bi < 0) throw new Error(`keine ICON-Zelle bei ${la},${lo}`);
  idx[iy * GRID_NX + ix] = bi;
}
log(`Raster ${GRID_NY}×${GRID_NX} = ${NCOL} Säulen, ${NCELL} ICON-Zellen`);

// ── 2. worker pool ───────────────────────────────────────────────────────────
const JOBS = Math.max(1, +(args.jobs ?? Math.min(cpus().length, 8)));
const workers = [];
const pending = new Map();
let nextId = 0;
const stats = { files: 0, bytes: 0, decodeMs: 0 };
for (let w = 0; w < JOBS; w++) {
  const wk = new Worker(join(HERE, 'atmoWorker.mjs'), { workerData: { idx: Array.from(idx), cache, ua: UA } });
  wk.inflight = 0;
  wk.on('message', (m) => {
    const p = pending.get(m.id); pending.delete(m.id); wk.inflight--;
    if (m.error) p.reject(new Error(m.error));
    else if (m.missing) p.reject(new Error(`fehlt: ${p.url}`));
    else {
      if (m.n !== NCELL) { p.reject(new Error(`${p.url}: ${m.n} Zellen statt ${NCELL}`)); pump(); return; }
      stats.files++; stats.bytes += m.bytes; stats.decodeMs += m.ms; p.resolve(m.values);
    }
    pump();
  });
  wk.on('error', (e) => { console.error(e); process.exit(1); });
  workers.push(wk);
}
const queue = [];
function pump() {
  for (const wk of workers) {
    while (wk.inflight < 2 && queue.length) {
      const job = queue.shift(); const id = nextId++;
      pending.set(id, job); wk.inflight++; wk.postMessage({ id, url: job.url });
    }
  }
}
const get = (url) => new Promise((res, rej) => { queue.push({ url, resolve: res, reject: rej }); pump(); });

// ── 3. heights ───────────────────────────────────────────────────────────────
// --maxStep: shorter run for the spike only; the published product always carries ATMO_STEPS.
const STEPS = ATMO_STEPS.filter((h) => args.maxStep == null || h <= +args.maxStep);
const NLEV = ATMO_LEVELS.length, NSTEP = STEPS.length;
const halfNeeded = [...new Set(ATMO_LEVELS.flatMap((l) => [l, l + 1]))];
const hhl = new Map(await Promise.all(halfNeeded.map(async (l) => [l, await get(urlOf('HHL', run, 0, l))])));
const hsurf = new Float32Array(NCOL), z = new Float32Array(NCOL * NLEV);
for (let c = 0; c < NCOL; c++) {
  hsurf[c] = hsurfAll[idx[c]];
  for (let k = 0; k < NLEV; k++) { const l = ATMO_LEVELS[k]; z[c * NLEV + k] = (hhl.get(l)[c] + hhl.get(l + 1)[c]) / 2; }
}
log(`Höhen: ${halfNeeded.length} HHL-Flächen`);

// ── 4. steps ─────────────────────────────────────────────────────────────────
// q[var][(c * NLEV + k) * NSTEP + s]
const Q = Object.fromEntries(VARS.map((v) => [v.id, new Int16Array(NCOL * NLEV * NSTEP)]));
const Rd = 287.05, g = 9.80665;
let badCols = 0; const badSamples = [];
for (let s = 0; s < NSTEP; s++) {
  const h = STEPS[s];
  const ps = get(urlOf('PS', run, h));
  const fields = {};
  for (const p of ['T', 'QV', 'U', 'V']) fields[p] = ATMO_LEVELS.map((l) => get(urlOf(p, run, h, l)));
  const PS = await ps;
  const F = {}; for (const p of Object.keys(fields)) F[p] = await Promise.all(fields[p]);
  const pcol = new Float64Array(NLEV), tcol = new Float64Array(NLEV), rcol = new Float64Array(NLEV);
  for (let c = 0; c < NCOL; c++) {
    let pPrev = PS[c] / 100, zPrev = hsurf[c], tvPrev = null;
    for (let k = 0; k < NLEV; k++) {
      const T = F.T[k][c], qv = F.QV[k][c], tv = T * (1 + 0.608 * qv);
      const tvm = tvPrev == null ? tv : (tv + tvPrev) / 2;
      const zk = z[c * NLEV + k];
      const p = pPrev * Math.exp((-g * (zk - zPrev)) / (Rd * tvm));
      const tc = T - 273.15;
      const e = (qv * p) / (0.622 + 0.378 * qv);
      const es = 6.112 * Math.exp((17.62 * tc) / (243.12 + tc));
      pcol[k] = p; tcol[k] = tc; rcol[k] = Math.min(100, Math.max(0, (100 * e) / es));
      pPrev = p; zPrev = zk; tvPrev = tv;
    }
    const val = { p: (k) => pcol[k], t: (k) => tcol[k], rh: (k) => rcol[k], u: (k) => F.U[k][c], v: (k) => F.V[k][c] };
    const bad = checkColumnStep(z.subarray(c * NLEV, (c + 1) * NLEV), (id, k) => val[id](k), NLEV);
    if (bad.length) { badCols++; if (badSamples.length < 5) badSamples.push({ c, s, bad: bad.slice(0, 4) }); }
    for (const v of VARS) {
      const q = Q[v.id];
      for (let k = 0; k < NLEV; k++) q[(c * NLEV + k) * NSTEP + s] = Math.round(val[v.id](k) * v.scale);
    }
  }
  log(`Schritt +${h} h: ${stats.files} Dateien, ${(stats.bytes / 1e9).toFixed(2)} GB, Dekodieren ${(stats.decodeMs / stats.files).toFixed(0)} ms/Feld`);
}
for (const wk of workers) wk.terminate();
if (badCols) { console.error('unplausible Säulen:', badCols, JSON.stringify(badSamples)); process.exit(1); }

// ── 5. tiles ─────────────────────────────────────────────────────────────────
const outRoot = storeDir ?? resolve(String(args.out ?? 'atmo-out'));
const buildDir = join(outRoot, '.build');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(join(buildDir, 't'), { recursive: true });
let tiles = 0, tileBytes = 0, maxTile = 0;
const measure = args.measure ? { raw: 0, deflate: 0, delta: 0, deltaShuffle: 0, n: 0 } : null;
for (let ty = 0; ty < TILES_Y; ty++) for (let tx = 0; tx < TILES_X; tx++) {
  const e = tileExtent(ty, tx), nCols = e.ny * e.nx;
  const pl = new Int16Array(payloadLength(nCols, NLEV, NSTEP));
  const cellLat = [], cellLon = [], cols = [];
  for (let yy = 0; yy < e.ny; yy++) for (let xx = 0; xx < e.nx; xx++) cols.push((e.y0 + yy) * GRID_NX + e.x0 + xx);
  cols.forEach((c, j) => {
    const o = j * (1 + NLEV);
    pl[o] = Math.round(hsurf[c]);
    for (let k = 0; k < NLEV; k++) pl[o + 1 + k] = Math.round(z[c * NLEV + k]);
    cellLat.push(+(clat[idx[c]] * deg).toFixed(4)); cellLon.push(+(clon[idx[c]] * deg).toFixed(4));
  });
  VARS.forEach((v, vi) => {
    const q = Q[v.id];
    cols.forEach((c, j) => {
      const dst = nCols * (1 + NLEV) + (vi * nCols + j) * NLEV * NSTEP;
      pl.set(q.subarray(c * NLEV * NSTEP, (c + 1) * NLEV * NSTEP), dst);
    });
  });
  const sample = measure && measure.n < 12;
  if (sample) {
    measure.n++; measure.raw += pl.byteLength;
    measure.deflate += deflateRawSync(new Uint8Array(pl.buffer), { level: 9 }).length;
    const d = pl.slice(); encodePayload(d, nCols, NLEV, NSTEP);
    measure.delta += deflateRawSync(new Uint8Array(d.buffer), { level: 9 }).length;
  }
  encodePayload(pl, nCols, NLEV, NSTEP);
  const deflated = deflateRawSync(shuffle(pl), { level: 9 });
  if (sample) measure.deltaShuffle += deflated.length;
  const header = {
    schema: ATMO_SCHEMA, run, model: ATMO_MODEL, tile: [ty, tx], y0: e.y0, x0: e.x0, ny: e.ny, nx: e.nx,
    levels: [...ATMO_LEVELS], steps: [...STEPS], vars: VARS.map(({ id, unit, scale }) => ({ id, unit, scale })), cellLat, cellLon,
  };
  const bytes = packTile(header, deflated);
  writeFileSync(join(buildDir, 't', `${pad(ty, 2)}_${pad(tx, 2)}.bin`), bytes);
  tiles++; tileBytes += bytes.length; maxTile = Math.max(maxTile, bytes.length);
}
const builtAt = new Date().toISOString();
const runEntry = { run, runAt: new Date(runMs(run)).toISOString(), tiles, bytes: tileBytes, builtAt };
writeFileSync(join(buildDir, 'run.json'), JSON.stringify({
  schema: ATMO_SCHEMA, ...runEntry, model: ATMO_MODEL, attribution: ATMO_ATTRIBUTION, sourceFiles: stats.files, sourceBytes: stats.bytes,
  buildSeconds: Math.round((Date.now() - T0) / 1000), maxTileBytes: maxTile,
}, null, 1));
const finalDir = join(outRoot, run);
rmSync(finalDir, { recursive: true, force: true });
renameSync(buildDir, finalDir);

// ── 6. index + retention ─────────────────────────────────────────────────────
const prev = (storeDir && readIndex()) || { runs: [] };
const runs = [runEntry, ...prev.runs.filter((r) => r.run !== run)].sort((a, b) => (a.run < b.run ? 1 : -1)).slice(0, RETAIN);
for (const d of readdirSync(outRoot)) {
  if (/^\d{10}$/.test(d) && !runs.some((r) => r.run === d) && statSync(join(outRoot, d)).isDirectory()) rmSync(join(outRoot, d), { recursive: true, force: true });
}
const index = {
  schema: ATMO_SCHEMA, model: ATMO_MODEL, attribution: ATMO_ATTRIBUTION, updatedAt: builtAt,
  grid: { ...ATMO_GRID, ny: GRID_NY, nx: GRID_NX, tileCells: TILE_CELLS, tilesY: TILES_Y, tilesX: TILES_X },
  levels: [...ATMO_LEVELS], steps: [...ATMO_STEPS], vars: VARS.map(({ id, unit, scale }) => ({ id, unit, scale })), runs,
};
writeFileSync(join(outRoot, 'index.json'), JSON.stringify(index, null, 1));
const summary = {
  run, tiles, bytes: tileBytes, maxTileBytes: maxTile, sourceFiles: stats.files, sourceGB: +(stats.bytes / 1e9).toFixed(2),
  decodeMsPerField: Math.round(stats.decodeMs / stats.files), seconds: Math.round((Date.now() - T0) / 1000), dir: `${ATMO_DIR}/${run}`,
};
if (measure) summary.measure = measure;
console.log(JSON.stringify(summary));
