#!/usr/bin/env node
/**
 * SW-2 — Seewetter field and spot line: one CWAM run → `sea/v1/run/cwam/<run>/{f,c}/<sss>.png` + `spots/<run>.json`
 * + `run.json` (LAST), with the value/field/run rules of `src/sea/seaContract.ts` and the wind and gust at every spot
 * from buscosun Fusion (never the WAM forcing wind). Plan SW-2, decisions E-SW-4/10/11/12 (`audit/seewetter.md`).
 *
 * Steps: inventory (`content.log.bz2`, not the directory listing) → newest complete run (13 × 79) not yet in the
 * store → download the 11 parameters it needs (sequential-ish, 4 at a time, sizes checked against the inventory) →
 * per step: decode with the client decoder, rules, mask hash, PNG, spot samples → run gate → spot wind (buscosun Fusion
 * on the cube checkout, `elevationM` 0 via `static/spot-geo.json`) → write spots, then run.json, then status → prune.
 * A run that fails the gate is not written (the last good run stays); a broken field writes `quarantine/<run>.json`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/sea-derive.mjs
 *     --store=<sea/v1 working copy> [--data=<buscosun-data checkout with point/>] [--cache=<dir>] [--run=YYYYMMDDHH]
 *     [--check]   only print the run that is due (or none) as JSON — the workflow decides on the cube checkout with it
 *     [--now=<iso>] [--ewam=0]
 * Kill switch: SEA_KILL=1 (status.killSwitch, nothing built). Last stdout line = JSON summary.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync, statSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../lib/bz2.mjs';
import { encodePng } from '../lib/png.mjs';
import {
  SEA_MODELS, SEA_PARAMS, SEA_PARAMS_READ, SEA_F_STEPS, SEA_C_STEPS, SEA_SPOT_STEPS, SEA_SPOT_VARS, SEA_SPOT_ORIGIN, SEA_RETENTION,
  SEA_INVENTORY_URL, SEA_BUILD_MAX_AGE_MS, SEA_STATUS_PATH, SEA_SPOT_CATALOG_PATH, SEA_SPOT_GEO_PATH, SEA_WATER, SEA_NULL,
  seaGribUrl, seaGribPath, seaRunMs, seaRunStamp, seaRunDir, seaRunJsonPath, seaFieldPath, seaCompPath, seaSpotsPath, seaMaskHashPath,
  seaQuarantinePath, newCounts, cleanHs, cleanDir, cleanPeriod, cleanPeakWindSea, validateSeaRun, packMask,
  encodeHs, encodeDir, encodePeriod, encodeSpotValue, spotSeriesProblems, sanitizeGust,
} from '../../src/sea/seaContract.ts';

const SELF = fileURLToPath(import.meta.url);
const H = 3_600_000;
const UA = 'buscosun-sea (buscosun-web/audit/seewetter.md)';
const MODEL = 'cwam';

// --- small helpers ------------------------------------------------------------------------------------
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
export function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// --- inventory ----------------------------------------------------------------------------------------
export function parseInventory(text) {
  const runs = new Map();
  for (const line of text.split('\n')) {
    const [path, size, ts] = line.trim().split('|');
    if (!path || !ts) continue;
    const m = /^\.?\/?wave_models\/(\w+)\/grib\/\d\d\/(\w+)\/\w+?_\w+?_(\d{10})_(\d{3})\.grib2\.bz2$/.exec(path);
    if (!m) continue;
    const key = `${m[1]}/${m[3]}`;
    const e = runs.get(key) ?? { model: m[1], run: m[3], files: new Map(), last: 0 };
    e.files.set(`${m[2]}/${+m[4]}`, { size: Number(size), at: Date.parse(ts.replace(' ', 'T') + 'Z') });
    e.last = Math.max(e.last, Date.parse(ts.replace(' ', 'T') + 'Z'));
    runs.set(key, e);
  }
  return runs;
}
export async function fetchInventory(fetchImpl = fetch) {
  const r = await fetchImpl(SEA_INVENTORY_URL, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Inventar HTTP ${r.status}`);
  return parseInventory(Buffer.from(await decompressBz2(Buffer.from(await r.arrayBuffer()))).toString('utf8'));
}

/** The run to build now: newest complete CWAM run, younger than SEA_BUILD_MAX_AGE_MS, without run.json in the store. */
export function dueRun(inv, storeDir, nowMs, model = MODEL) {
  const want = SEA_PARAMS.length * SEA_MODELS[model].steps.length;
  const cands = [...inv.values()].filter((e) => e.model === model).sort((a, b) => (a.run < b.run ? 1 : -1));
  for (const e of cands) {
    const runMs = seaRunMs(e.run);
    if (!Number.isFinite(runMs) || nowMs - runMs > SEA_BUILD_MAX_AGE_MS) continue;
    const done = existsSync(join(storeDir, seaRunJsonPath(model, e.run)));
    if (e.files.size !== want) return { run: null, newest: e.run, reason: `${e.run}: ${e.files.size}/${want} im Inventar`, files: e.files.size };
    if (done) return { run: null, newest: e.run, reason: `${e.run} schon veröffentlicht`, files: e.files.size };
    return { run: e.run, files: e.files.size, completeAt: new Date(e.last).toISOString() };
  }
  return { run: null, reason: 'kein Lauf im Inventar jünger als 30 h' };
}

// --- download -----------------------------------------------------------------------------------------
export async function downloadRun({ model = MODEL, run, inv, cacheDir, params = SEA_PARAMS_READ, steps = SEA_SPOT_STEPS, concurrency = 4, fetchImpl = fetch, log = () => {} }) {
  const entry = inv?.get(`${model}/${run}`);
  const jobs = [];
  for (const p of params) for (const s of steps) jobs.push({ p, s, url: seaGribUrl(model, run, p, s), file: join(cacheDir, seaGribPath(model, run, p, s).split('/').pop()), size: entry?.files.get(`${p}/${s}`)?.size ?? null });
  mkdirSync(cacheDir, { recursive: true });
  let bytes = 0, fetched = 0, next = 0;
  const t0 = Date.now();
  const one = async (j) => {
    if (existsSync(j.file) && (j.size == null || statSync(j.file).size === j.size)) { bytes += statSync(j.file).size; return; }
    for (let a = 1; a <= 4; a++) {
      try {
        const r = await fetchImpl(j.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = Buffer.from(await r.arrayBuffer());
        if (j.size != null && b.length !== j.size) throw new Error(`Größe ${b.length} ≠ Inventar ${j.size}`);
        writeAtomic(j.file, b);
        bytes += b.length; fetched++;
        return;
      } catch (e) {
        if (a === 4) throw new Error(`${j.url}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000 * a));
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, async () => { while (next < jobs.length) await one(jobs[next++]); }));
  log(`Download ${run}: ${jobs.length} Dateien (${fetched} neu), ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { files: jobs.length, fetched, bytes, ms: Date.now() - t0 };
}

const decodeFile = async (file) => decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(file))));

// --- one run ------------------------------------------------------------------------------------------
/**
 * Decodes every step, applies the rules, writes the PNGs into `outRunDir` and returns the wave part of the spot
 * series plus everything the run gate needs. Pure with respect to the store (the caller decides what is kept).
 */
export async function deriveFields({ model = MODEL, run, cacheDir, outRunDir, spots, log = () => {}, fileOf: fileOfImpl = null }) {
  const spec = SEA_MODELS[model];
  const { ni, nj } = spec.grid;
  const n = ni * nj;
  const fileOf = fileOfImpl ?? ((p, s) => join(cacheDir, seaGribPath(model, run, p, s).split('/').pop()));
  const grids = [], seaPoints = [], maskHashes = [], counts = [];
  const balance = {};
  const series = Object.fromEntries(spots.map((sp) => [sp.id, Object.fromEntries(SEA_SPOT_VARS.map((v) => [v, new Array(SEA_SPOT_STEPS.length).fill(null)]))]));
  const cellIdx = spots.map((sp) => ({ id: sp.id, k: sp.cell.j * ni + sp.cell.i }));
  let fBytes = 0, cBytes = 0, clipped = 0;
  mkdirSync(join(outRunDir, 'f'), { recursive: true });
  mkdirSync(join(outRunDir, 'c'), { recursive: true });
  for (const s of SEA_SPOT_STEPS) {
    const F = {};
    for (const p of SEA_PARAMS_READ) {
      const f = await decodeFile(fileOf(p, s));
      F[p] = f.values;
      grids.push({ ni: f.ni, nj: f.nj, lat1: f.lat1, lon1: f.lon1, lat2: f.lat2, lon2: f.lon2, di: f.di, dj: f.dj });
      let sea = 0;
      for (let k = 0; k < f.values.length; k++) if (!Number.isNaN(f.values[k])) sea++;
      seaPoints.push(sea);
      maskHashes.push(sha256(packMask(f.values)));
    }
    if (F.swh.length !== n) throw new Error(`Feldgröße ${F.swh.length} ≠ ${n}`);
    // Rules per cell; one counts object per parameter-step (the invalid share is a per-field rule).
    const c = Object.fromEntries(SEA_PARAMS_READ.map((p) => [p, newCounts()]));
    const clean = {
      swh: new Float32Array(n).fill(NaN), mwd: new Float32Array(n).fill(NaN), tm10: new Float32Array(n).fill(NaN),
      shww: new Float32Array(n).fill(NaN), mdww: new Float32Array(n).fill(NaN), mpww: new Float32Array(n).fill(NaN), ppww: new Float32Array(n).fill(NaN),
      shts: new Float32Array(n).fill(NaN), mdts: new Float32Array(n).fill(NaN), mpts: new Float32Array(n).fill(NaN), ppts: new Float32Array(n).fill(NaN),
    };
    const water = new Uint8Array(n);
    const nn = (x) => (x == null ? NaN : x);
    for (let k = 0; k < n; k++) {
      if (Number.isNaN(F.swh[k])) continue;
      water[k] = 1;
      for (const p of SEA_PARAMS_READ) c[p].cells++;
      const hs = cleanHs(F.swh[k], c.swh), ws = cleanHs(F.shww[k], c.shww), sw = cleanHs(F.shts[k], c.shts);
      clean.swh[k] = nn(hs); clean.shww[k] = nn(ws); clean.shts[k] = nn(sw);
      clean.mwd[k] = nn(cleanDir(F.mwd[k], c.mwd)); clean.mdww[k] = nn(cleanDir(F.mdww[k], c.mdww)); clean.mdts[k] = nn(cleanDir(F.mdts[k], c.mdts));
      clean.tm10[k] = nn(cleanPeriod(F.tm10[k], hs, c.tm10)); clean.mpww[k] = nn(cleanPeriod(F.mpww[k], ws, c.mpww)); clean.mpts[k] = nn(cleanPeriod(F.mpts[k], sw, c.mpts));
      clean.ppww[k] = nn(cleanPeakWindSea(F.ppww[k], ws, c.ppww)); clean.ppts[k] = nn(cleanPeriod(F.ppts[k], sw, c.ppts));
    }
    for (const p of SEA_PARAMS_READ) {
      counts.push(c[p]);
      const b = (balance[p] ??= { invalid: 0, placeholder: 0, ppwwArtefact: 0, clipped: 0 });
      b.invalid += c[p].invalid; b.placeholder += c[p].placeholder; b.ppwwArtefact += c[p].ppwwArtefact; b.clipped += c[p].clipped;
    }
    clipped += c.swh.clipped + c.shww.clipped + c.shts.clipped;
    const pack = (rgba, off, stride, hs, dir, per) => {
      for (let k = 0; k < n; k++) {
        const o = off + (Math.floor(k / ni) * stride + (k % ni)) * 4;
        if (!water[k]) continue;                         // land: 0,0,0,0
        rgba[o + 3] = SEA_WATER;
        if (Number.isNaN(hs[k]) || Number.isNaN(dir[k])) { rgba[o] = SEA_NULL; rgba[o + 2] = SEA_NULL; continue; }
        rgba[o] = encodeHs(hs[k]); rgba[o + 1] = encodeDir(dir[k]); rgba[o + 2] = encodePeriod(Number.isNaN(per[k]) ? null : per[k]);
      }
    };
    const sss = String(s).padStart(3, '0');
    if (SEA_F_STEPS.includes(s)) {
      const rgba = new Uint8Array(n * 4);
      pack(rgba, 0, ni, clean.swh, clean.mwd, clean.tm10);
      const png = encodePng(ni, nj, rgba, 4);
      writeAtomic(join(outRunDir, 'f', `${sss}.png`), png);
      fBytes += png.length;
    }
    if (SEA_C_STEPS.includes(s)) {
      const rgba = new Uint8Array(n * 8);
      pack(rgba, 0, 2 * ni, clean.shww, clean.mdww, clean.mpww);
      pack(rgba, ni * 4, 2 * ni, clean.shts, clean.mdts, clean.mpts);
      const png = encodePng(2 * ni, nj, rgba, 4);
      writeAtomic(join(outRunDir, 'c', `${sss}.png`), png);
      cBytes += png.length;
    }
    const val = (a, k) => (Number.isNaN(a[k]) ? null : a[k]);
    for (const { id, k } of cellIdx) {
      const v = series[id];
      v.hs[s] = encodeSpotValue('hs', val(clean.swh, k)); v.dir[s] = encodeSpotValue('dir', val(clean.mwd, k)); v.tm[s] = encodeSpotValue('tm', val(clean.tm10, k));
      v.ws[s] = encodeSpotValue('ws', val(clean.shww, k)); v.wsDir[s] = encodeSpotValue('wsDir', val(clean.mdww, k)); v.wsPer[s] = encodeSpotValue('wsPer', val(clean.mpww, k)); v.wsPeak[s] = encodeSpotValue('wsPeak', val(clean.ppww, k));
      v.sw[s] = encodeSpotValue('sw', val(clean.shts, k)); v.swDir[s] = encodeSpotValue('swDir', val(clean.mdts, k)); v.swPer[s] = encodeSpotValue('swPer', val(clean.mpts, k)); v.swPeak[s] = encodeSpotValue('swPeak', val(clean.ppts, k));
    }
    if (s % 12 === 0) log(`Schritt ${sss}: dekodiert, geprüft, geschrieben`);
  }
  return { grids, seaPoints, maskHashes, counts, balance, series, bytes: { f: fBytes, c: cBytes }, clipped };
}

// --- wind from buscosun Fusion at the spots ----------------------------------------------------------------
/**
 * The client's chain (stage `fs` of the current release, `fusionStageIo`) on a directory store of the cube checkout,
 * terrain/z0 preloaded from `static/spot-geo.json` (sea surface height 0). Wind, gust, direction for the hours of the
 * wave run that lie at or after the computation hour; earlier hours stay null (the cube starts now).
 */
export async function spotWind({ dataDir, spots, geoDoc, nowMs, runMs, log = () => {} }) {
  const { installNodeShims } = await import('../punktarchiv/lib/nodeShims.mjs');
  installNodeShims();
  const { dirStore, makeIo, geoBackend } = await import('../road/road-forecast.mjs');
  const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../src/pointForecast/cubeSource.ts');
  const { fusionVersionOfNotes, fusionName, FUSION_CURRENT } = await import('../../src/pointForecast/fusion/fusionRelease.ts');
  const { seaCellCentre } = await import('../../src/sea/seaContract.ts');
  // `cdn` (local runs): the cube over jsDelivr with the client's own store instead of a checkout.
  let store;
  if (dataDir === 'cdn') { const { httpStore, memoStore } = await import('../../src/point/client/store.ts'); store = memoStore(httpStore({})); } else store = dirStore(dataDir);
  const io = makeIo({ store, cache: geoBackend(geoDoc), nowMs });
  const t0 = Math.floor(nowMs / H) * H;
  const hours = Math.max(1, Math.round((runMs + 78 * H - t0) / H) + 1);
  const out = {}, failed = [];
  let runs = null, version = null;
  for (const sp of spots) {
    const p = seaCellCentre('cwam', sp.cell.i, sp.cell.j);
    try {
      clearCubeForecastCache();
      const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours, pointSource: 'cube', includeRadarNowcast: false }, io);
      const steps = fc.cube?.v2?.axis?.steps;
      if (!steps?.length) { failed.push({ id: sp.id, error: 'kein Cube-Ergebnis' }); continue; }
      const w = new Array(SEA_SPOT_STEPS.length).fill(null), g = w.slice(), d = w.slice();
      for (const st of steps) {
        const i = (st.validAtMs - runMs) / H;
        if (!Number.isInteger(i) || i < 0 || i >= SEA_SPOT_STEPS.length) continue;
        w[i] = encodeSpotValue('wind', st.vars?.wind?.mean); g[i] = encodeSpotValue('gust', st.vars?.gust?.mean); d[i] = encodeSpotValue('windDir', st.vars?.windDir?.mean);
      }
      out[sp.id] = { wind: w, gust: g, windDir: d };
      version ??= fusionVersionOfNotes(fc.cube.notes);
      const r = fc.cube.v2.provenance?.runs ?? {};
      runs ??= { t1: r.t1?.run ?? null, t2: r.t2?.run ?? null, t3: r.t3?.run ?? null, stations: r.stations?.run ?? null };
    } catch (e) { failed.push({ id: sp.id, error: String(e?.message ?? e).split('\n')[0] }); }
  }
  log(`Wind: ${Object.keys(out).length}/${spots.length} Spots, ${failed.length} ohne`);
  return {
    series: out, failed,
    meta: { engine: fusionName(version ?? FUSION_CURRENT), version: version ?? null, stageCurrent: version === FUSION_CURRENT, computedAt: new Date(nowMs).toISOString(), hoursFrom: new Date(t0).toISOString(), runs },
  };
}

// --- status, retention ------------------------------------------------------------------------------------
export function readStatus(storeDir) {
  const s = readJson(join(storeDir, SEA_STATUS_PATH));
  return s?.product === 'sea-status' ? s : { schema: 1, product: 'sea-status', updatedAt: null, killSwitch: false, field: { model: MODEL, lastRun: null, lastPublishedRun: null, blocked: null, recent: [] }, text: {} };
}
export function writeStatus(storeDir, st, nowMs) {
  st.updatedAt = new Date(nowMs).toISOString();
  st.job = process.env.GITHUB_RUN_ID ?? st.job ?? 'local';
  writeAtomic(join(storeDir, SEA_STATUS_PATH), JSON.stringify(st, null, 1) + '\n');
}
export function pruneRuns(storeDir, model = MODEL) {
  const dir = join(storeDir, 'run', model);
  const removed = [];
  if (existsSync(dir)) {
    // Only complete runs (with run.json) count; a half-written directory without run.json is removed at once.
    const runs = readdirSync(dir).filter((r) => /^\d{10}$/.test(r)).sort();
    for (const r of runs) if (!existsSync(join(dir, r, 'run.json'))) { rmSync(join(dir, r), { recursive: true, force: true }); removed.push(r); }
    const done = runs.filter((r) => existsSync(join(dir, r, 'run.json')));
    for (const r of done.slice(0, Math.max(0, done.length - SEA_RETENTION.runsKept))) { rmSync(join(dir, r), { recursive: true, force: true }); removed.push(r); }
  }
  const sdir = join(storeDir, 'spots');
  if (existsSync(sdir)) {
    const files = readdirSync(sdir).filter((f) => /^\d{10}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - SEA_RETENTION.spotsKept))) { rmSync(join(sdir, f), { force: true }); removed.push(`spots/${f}`); }
  }
  const qdir = join(storeDir, 'quarantine');
  if (existsSync(qdir)) {
    const files = readdirSync(qdir).filter((f) => f.endsWith('.json')).map((f) => ({ f, ms: statSync(join(qdir, f)).mtimeMs })).sort((a, b) => a.ms - b.ms);
    const old = files.filter((x) => Date.now() - x.ms > SEA_RETENTION.quarantineMaxAgeMs);
    for (const x of old.slice(0, Math.max(0, files.length - SEA_RETENTION.quarantineMinKeep))) { rmSync(join(qdir, x.f), { force: true }); removed.push(`quarantine/${x.f}`); }
  }
  return removed;
}

// --- the whole run ----------------------------------------------------------------------------------------
export async function buildRun({ storeDir, dataDir = null, cacheDir, run, inv = null, nowMs = Date.now(), ewam = true, fetchImpl = fetch, log = () => {}, killed = process.env.SEA_KILL === '1', windImpl = spotWind, fileOf = null }) {
  const st = readStatus(storeDir);
  st.killSwitch = killed;
  if (killed) { writeStatus(storeDir, st, nowMs); return { built: false, reason: 'Kill-Schalter SEA_KILL=1' }; }
  const cat = readJson(join(storeDir, SEA_SPOT_CATALOG_PATH));
  if (!cat?.spots?.length) throw new Error(`${SEA_SPOT_CATALOG_PATH} fehlt im Speicher`);
  const runMs = seaRunMs(run);
  const started = Date.now();
  // `fileOf` (verifier): the GRIB files come from elsewhere, nothing is downloaded.
  const dl = fileOf ? { bytes: 0 } : await downloadRun({ run, inv, cacheDir, fetchImpl, log });
  const work = join(cacheDir, `build-${MODEL}-${run}`);
  rmSync(work, { recursive: true, force: true });
  const r = await deriveFields({ run, cacheDir, outRunDir: work, spots: cat.spots, log, fileOf });
  const maskFile = join(storeDir, seaMaskHashPath(MODEL));
  const expectedMaskHash = existsSync(maskFile) ? readFileSync(maskFile, 'utf8').trim() : null;
  const files = inv?.get(`${MODEL}/${run}`)?.files.size ?? SEA_PARAMS.length * SEA_MODELS[MODEL].steps.length;
  const verdict = validateSeaRun({ model: MODEL, run, inventoryFiles: files, grids: r.grids, seaPoints: r.seaPoints, maskHashes: r.maskHashes, expectedMaskHash, counts: r.counts });
  st.field.lastRun = run;
  const recent = { run, at: new Date(nowMs).toISOString(), publish: verdict.publish, reasons: verdict.reasons, buildS: 0, mb: 0 };
  if (!verdict.publish) {
    rmSync(work, { recursive: true, force: true });
    if (verdict.quarantine) writeAtomic(join(storeDir, seaQuarantinePath(`${MODEL}-${run}`)), JSON.stringify({ schema: 1, product: 'sea-quarantine', model: MODEL, run, at: recent.at, reasons: verdict.reasons, balance: r.balance }, null, 1) + '\n');
    st.field.blocked = { run, reasons: verdict.reasons };
    st.field.recent = [recent, ...(st.field.recent ?? [])].slice(0, 14);
    writeStatus(storeDir, st, nowMs);
    return { built: false, run, reason: verdict.reasons.map((x) => x.rule).join(','), verdict };
  }
  // Wind at the spots (never blocks the waves: a spot without wind says so).
  let wind = null;
  if (dataDir && (dataDir === 'cdn' || existsSync(join(dataDir, 'point', 'index.json')))) {
    const geoDoc = readJson(join(storeDir, SEA_SPOT_GEO_PATH));
    try { wind = await windImpl({ dataDir, spots: cat.spots, geoDoc, nowMs, runMs, log }); } catch (e) { log(`Wind fehlgeschlagen: ${e.message}`); wind = { series: {}, failed: cat.spots.map((s) => ({ id: s.id, error: e.message })), meta: null }; }
  } else log('Wind: kein Cube-Checkout (--data) — Reihen ohne Wind');
  const spotsDoc = {
    schema: 1, product: 'sea-spots-series', model: MODEL, run, runMs, t0: new Date(runMs).toISOString(), stepH: 1, steps: SEA_SPOT_STEPS.length,
    vars: SEA_SPOT_VARS, origin: SEA_SPOT_ORIGIN,
    units: { hs: 'cm', ws: 'cm', sw: 'cm', dir: 'deg', wsDir: 'deg', swDir: 'deg', windDir: 'deg', tm: '0.1 s', wsPer: '0.1 s', wsPeak: '0.1 s', swPer: '0.1 s', swPeak: '0.1 s', wind: '0.1 m/s', gust: '0.1 m/s' },
    wave: { source: `DWD CWAM, Lauf ${run}`, license: 'Deutscher Wetterdienst, GeoNutzV' },
    wind: wind?.meta ? { ...wind.meta, failed: wind.failed } : { engine: null, failed: wind?.failed ?? cat.spots.map((s) => ({ id: s.id, error: 'kein Cube-Checkout' })) },
    spots: {},
  };
  const problems = [];
  for (const sp of cat.spots) {
    const v = { ...r.series[sp.id], ...(wind?.series[sp.id] ?? { wind: new Array(SEA_SPOT_STEPS.length).fill(null), gust: new Array(SEA_SPOT_STEPS.length).fill(null), windDir: new Array(SEA_SPOT_STEPS.length).fill(null) }) };
    const gustDropped = sanitizeGust(v);
    const pr = spotSeriesProblems(v);
    if (pr.length) { problems.push(`${sp.id}: ${pr.slice(0, 2).join('; ')}`); continue; }
    spotsDoc.spots[sp.id] = { cell: [sp.cell.i, sp.cell.j], v, ...(gustDropped ? { gustDropped } : {}) };
  }
  // EWAM cross check, observation only (plan: median |ΔHs| > 0.3 m ⇒ log, no stop).
  let check = null;
  if (ewam) { try { check = await ewamCheck({ run, cacheDir, cwamDir: cacheDir, fetchImpl }); } catch (e) { check = { error: e.message }; } }
  // Write: PNGs → final dir, spots, run.json LAST, then status.
  const dst = join(storeDir, seaRunDir(MODEL, run));
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  try { renameSync(work, dst); } catch { cpSync(work, dst, { recursive: true }); rmSync(work, { recursive: true, force: true }); }
  const spotsText = JSON.stringify(spotsDoc) + '\n';
  writeAtomic(join(storeDir, seaSpotsPath(run)), spotsText);
  if (!expectedMaskHash) writeAtomic(maskFile, `${r.maskHashes[0]}\n`);
  const runDoc = {
    schema: 1, product: 'sea-run', model: MODEL, run, runMs, t0: new Date(runMs).toISOString(),
    steps: { f: SEA_F_STEPS, c: SEA_C_STEPS, spots: SEA_SPOT_STEPS.length }, grid: SEA_MODELS[MODEL].grid, seaPoints: SEA_MODELS[MODEL].seaPoints,
    maskHash: r.maskHashes[0], coding: { r: 'Hs 5 cm (254 = ≥ 12,70 m, 255 = kein Wert)', g: 'Richtung kommt aus, 256 Stufen', b: 'Periode 0,1 s (255 = kein Wert)', a: '255 Wasser, 0 Land', c: 'links Windsee (shww, mdww, mpww), rechts Dünung (shts, mdts, mpts)', f: 'swh, mwd, tm10' },
    balance: r.balance, clipped: r.clipped, dwd: { files, completeAt: inv?.get(`${MODEL}/${run}`)?.last ? new Date(inv.get(`${MODEL}/${run}`).last).toISOString() : null, downloadMB: +(dl.bytes / 1e6).toFixed(1) },
    bytes: { f: r.bytes.f, c: r.bytes.c, spots: Buffer.byteLength(spotsText) }, wind: spotsDoc.wind.engine ? { engine: spotsDoc.wind.engine, version: spotsDoc.wind.version, computedAt: spotsDoc.wind.computedAt, runs: spotsDoc.wind.runs, failed: spotsDoc.wind.failed.length } : null,
    spotProblems: problems, check, builtAt: new Date().toISOString(), buildS: Math.round((Date.now() - started) / 1000), job: process.env.GITHUB_RUN_ID ?? 'local',
  };
  writeAtomic(join(storeDir, seaRunJsonPath(MODEL, run)), JSON.stringify(runDoc, null, 1) + '\n');
  recent.buildS = runDoc.buildS; recent.mb = +((r.bytes.f + r.bytes.c + runDoc.bytes.spots) / 1e6).toFixed(2);
  st.field.lastPublishedRun = run; st.field.blocked = null;
  st.field.recent = [recent, ...(st.field.recent ?? [])].slice(0, 14);
  const removed = pruneRuns(storeDir);
  writeStatus(storeDir, st, nowMs);
  return { built: true, run, mb: recent.mb, buildS: runDoc.buildS, wind: runDoc.wind, spotProblems: problems.length, removed, check };
}

/** EWAM against CWAM on common sea points at +0/24/48/72 h (nearest EWAM cell), median |ΔHs| — observation only. */
export async function ewamCheck({ run, cacheDir, cwamDir, fetchImpl = fetch }) {
  const out = [];
  const cg = SEA_MODELS.cwam.grid, eg = SEA_MODELS.ewam.grid;
  for (const s of [0, 24, 48, 72]) {
    await downloadRun({ model: 'ewam', run, inv: null, cacheDir, params: ['swh'], steps: [s], concurrency: 1, fetchImpl });
    const e = await decodeFile(join(cacheDir, seaGribPath('ewam', run, 'swh', s).split('/').pop()));
    const c = await decodeFile(join(cwamDir, seaGribPath('cwam', run, 'swh', s).split('/').pop()));
    const d = [];
    for (let j = 0; j < cg.nj; j += 2) for (let i = 0; i < cg.ni; i += 2) {
      const cv = c.values[j * cg.ni + i];
      if (Number.isNaN(cv)) continue;
      const lat = cg.lat1 - j * cg.dj, lon = cg.lon1 + i * cg.di;
      const ei = Math.round((lon - eg.lon1) / eg.di), ej = Math.round((eg.lat1 - lat) / eg.dj);
      const ev = e.values[ej * eg.ni + ei];
      if (!Number.isNaN(ev)) d.push(Math.abs(ev - cv));
    }
    d.sort((a, b) => a - b);
    out.push({ step: s, points: d.length, medianAbsM: d.length ? +d[d.length >> 1].toFixed(3) : null });
  }
  const worst = Math.max(...out.map((x) => x.medianAbsM ?? 0));
  return { steps: out, observe: worst > 0.3 ? `Median |ΔHs| ${worst.toFixed(2)} m > 0,3 m (Beobachtung)` : null };
}

// --- CLI ------------------------------------------------------------------------------------------------------
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const storeDir = resolve(String(args.store ?? 'sea/v1'));
  const nowMs = typeof args.now === 'string' ? Date.parse(args.now) : Date.now();
  const log = (m) => console.log(`[sea-derive] ${m}`);
  const inv = await fetchInventory();
  const due = typeof args.run === 'string' ? { run: args.run } : dueRun(inv, storeDir, nowMs);
  if (args.check) { console.log(JSON.stringify({ due: due.run ?? null, reason: due.reason ?? null })); return; }
  if (!due.run) { log(`nichts zu tun: ${due.reason}`); console.log(JSON.stringify({ built: false, reason: due.reason })); return; }
  const res = await buildRun({
    storeDir, dataDir: args.data === 'cdn' ? 'cdn' : typeof args.data === 'string' ? resolve(args.data) : null, cacheDir: resolve(String(args.cache ?? '.sea-cache')),
    run: due.run, inv, nowMs, ewam: args.ewam !== '0', log,
  });
  log(res.built ? `Lauf ${res.run} gebaut: ${res.mb} MB, ${res.buildS} s, Wind ${res.wind?.engine ?? 'ohne'}` : `Lauf ${res.run ?? '–'} NICHT gebaut: ${res.reason}`);
  console.log(JSON.stringify(res));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
