#!/usr/bin/env node
/**
 * AW-7.3 — Hazard derive of Autobahnwetter: ONE published `obs` slot → `road/v1/hz/<slot>.json` (contract
 * `src/road/roadHazards.ts`, segments `src/road/roadSegments.ts`, `audit/autobahnwetter.md` §19). Spawned by the radar
 * mirror (`road-mirror.mjs`) as a CHILD PROCESS from the buscosun-web clone right after a green `obs` slot (E-AW-33), like
 * `road-derive.mjs`; the same contract the browser loads decides what may be published (one rule, three consumers).
 *
 *   node --experimental-strip-types --import <app>/scripts/lib/register-ts.mjs \
 *     <app>/scripts/road/road-hazards.mjs <storeDir> <imgDir> <rootDir> <outDir> <stamp> [--now=<iso>]
 *
 * <storeDir>  the mirror's local `road/v1/` (read: `obs/<stamp>.json`, `h24/<group>/…`, `static/segments.json`, `state.json`)
 * <imgDir>    the mirror's local `img/` (read: `rv/<stamp>/{meta.json,f*.png,g*.png}`, `konrad3d/<stamp>/cells.json`)
 * <rootDir>   the mirror's clone of buscosun-data (read: `road/fc/v1`, `index.json` + `runs/<run>/*.png`)
 * <outDir>    written atomically (tmp dir + rename): `hz/<stamp>.json`, `state.json` (the hazard part merged in), `summary.json`
 *
 * Prints ONE JSON line: {"ok":true,"stamp":…,"publish":true|false,"reasons":[…],"segments":…,"withLevel":…,"unknown":…,
 * "missing":[…],"inputs":{…},"bytes":…,"ms":…}. The slot lock lives here (entry and consistency locks of the contract);
 * the mirror only obeys it. A missing or too old input never becomes 0: the hazards it feeds are `null` and the input is
 * named in `missing` (D-04). `ROAD_HZ_KILL=1` writes a slot without entries and `killed: true`.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from '../lib/png.mjs';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { PRECIP_VMAX, precipFromU8Log } from '../../src/scalar/RainLayer.ts';
import { ROAD_STATE_PATH, roadObsPath, roadStampToMs, roadStamp, parseRoadObs, parseRoadH24 } from '../../src/road/roadContract.ts';
import { ROAD_FC_INDEX_PATH, parseRoadFcIndex, parseRoadFcFile, roadFcDecode } from '../../src/road/roadFc.ts';
import { ROAD_SEGMENTS_PATH, parseRoadSegments } from '../../src/road/roadSegments.ts';
import {
  ROAD_HZ_HOURS, ROAD_HZ_INPUT_AGE_MS, ROAD_HZ_CAP_P, ROAD_HZ_T, ROAD_HAZARD_IDS, roadHzPath, evaluateSegment, roadHzEntryProblems,
  roadHzConsistencyProblems, parseRoadHz, roadHzSummary,
} from '../../src/road/roadHazards.ts';

const H = 3_600_000;
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const stampFiles = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : []);

// --- Radar (RV) at the support points ---------------------------------------------------------------

const RV_NW = psFwd(DE1200_CORNERS[0][0], DE1200_CORNERS[0][1]);
/** DE1200 column/row of a place (1-km cells, north-up). */
export function rvPixel(lon, lat, width = 1100, height = 1200) {
  const [x, y] = psFwd(lon, lat);
  const col = Math.floor((x - RV_NW[0]) / 1000), row = Math.floor((RV_NW[1] - y) / 1000);
  return col >= 0 && col < width && row >= 0 && row < height ? { col, row } : null;
}
/** mm/h of a decoded frame at a pixel: log channel of a `g` frame when there is one, else the linear v1 byte. */
function rateAt(frame, px) {
  if (!frame || !px) return null;
  const i = px.row * frame.width + px.col;
  if (frame.channels === 2) return precipFromU8Log(frame.data[i * 2 + 1]);
  const u = frame.data[i * frame.channels];
  return u === 0 ? 0 : (u / 255) * PRECIP_VMAX;
}
function loadFrame(dir, lead, dual) {
  const name = `${dual ? 'g' : 'f'}${String(lead).padStart(3, '0')}.png`;
  const f = join(dir, name);
  if (!existsSync(f)) return dual ? loadFrame(dir, lead, false) : null;
  try { return decodePng(readFileSync(f)); } catch { return null; }
}
/** Newest RV slot whose valid time is ≤ slot + 10 min and not older than the input age; `null` when none. */
export function pickRvSlot(imgDir, slotMs) {
  const dir = join(imgDir, 'rv');
  const slots = stampFiles(dir, /^\d{10}$/).filter((s) => existsSync(join(dir, s, 'meta.json')));
  const ok = slots.filter((s) => { const ms = roadStampToMs(s); return Number.isFinite(ms) && ms <= slotMs + 10 * 60_000 && slotMs - ms <= ROAD_HZ_INPUT_AGE_MS.radar; });
  return ok.length ? ok[ok.length - 1] : null;
}
/** Per segment: max rate now, max over the nowcast frames of hour +1 (5…60 min) and +2 (65…120 min). */
export function radarForSegments(imgDir, rvStamp, segments) {
  const dir = join(imgDir, 'rv', rvStamp);
  const meta = readJson(join(dir, 'meta.json'));
  if (!meta) return null;
  const dual = !!meta.dual;
  const pxOf = new Map();
  for (const s of segments) pxOf.set(s.id, s.coords.map(([lon, lat]) => rvPixel(lon, lat, meta.width, meta.height)).filter(Boolean));
  const maxAt = (frame, pxs) => { let m = null; for (const px of pxs) { const r = rateAt(frame, px); if (r != null && (m == null || r > m)) m = r; } return m; };
  const out = new Map();
  const f0 = loadFrame(dir, 0, dual);
  for (const s of segments) out.set(s.id, { rateNow: maxAt(f0, pxOf.get(s.id)), rateH1: null, rateH2: null });
  for (const f of meta.frames ?? []) {
    if (f.lead <= 0 || f.lead > 120) continue;
    const frame = loadFrame(dir, f.lead, dual);
    if (!frame) continue;
    const key = f.lead <= 60 ? 'rateH1' : 'rateH2';
    for (const s of segments) { const r = maxAt(frame, pxOf.get(s.id)); const o = out.get(s.id); if (r != null && (o[key] == null || r > o[key])) o[key] = r; }
  }
  return { stamp: rvStamp, validAtMs: roadStampToMs(rvStamp), bySeg: out };
}

// --- KONRAD3D cells --------------------------------------------------------------------------------

const RAD = Math.PI / 180;
export function kmBetween(aLon, aLat, bLon, bLat) {
  const dLat = (bLat - aLat) * RAD, dLon = (bLon - aLon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Newest KONRAD3D slot with reference time ≤ slot + 10 min and not older than the input age. */
export function pickKonradSlot(imgDir, slotMs) {
  const dir = join(imgDir, 'konrad3d');
  const slots = stampFiles(dir, /^\d{8}T\d{6}$/).filter((s) => existsSync(join(dir, s, 'cells.json')));
  const msOf = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13));
  const ok = slots.filter((s) => msOf(s) <= slotMs + 10 * 60_000 && slotMs - msOf(s) <= ROAD_HZ_INPUT_AGE_MS.konrad);
  return ok.length ? ok[ok.length - 1] : null;
}
/** Per segment the cells within reach (`gewitter.cellKm`): distance, over, first crossing minute, hail flag. */
export function cellsForSegments(imgDir, konradStamp, segments) {
  const doc = readJson(join(imgDir, 'konrad3d', konradStamp, 'cells.json'));
  const cells = doc?.run?.cells;
  if (!Array.isArray(cells)) return null;
  const out = new Map();
  for (const s of segments) {
    const list = [];
    for (const c of cells) {
      if (typeof c.lon !== 'number' || typeof c.lat !== 'number') continue;
      let dist = Infinity;
      for (const [lon, lat] of s.coords) dist = Math.min(dist, kmBetween(c.lon, c.lat, lon, lat));
      const reach = Math.max(ROAD_HZ_T.gewitter.cellKm, ...(c.forecast ?? []).map((f) => f.majorKm ?? 0));
      if (dist > reach + 30) continue;    // far away even for its track
      const over = Array.isArray(c.hull) && c.hull.length >= 3 && s.coords.some(([lon, lat]) => pointInRing(lon, lat, c.hull));
      let crossMin = null;
      for (const f of (c.forecast ?? []).slice().sort((a, b) => a.leadMin - b.leadMin)) {
        if (typeof f.lon !== 'number' || typeof f.lat !== 'number') continue;
        const r = Math.max(5, f.minorKm ?? 0);
        if (s.coords.some(([lon, lat]) => kmBetween(f.lon, f.lat, lon, lat) <= r)) { crossMin = f.leadMin; break; }
      }
      if (dist <= ROAD_HZ_T.gewitter.cellKm || over || crossMin != null) list.push({ id: c.id, distKm: Math.round(dist * 10) / 10, over, crossMin, hail: (c.hailFlag ?? 0) >= 1 || (c.hailAreaKm2 ?? 0) > 0 });
    }
    out.set(s.id, list);
  }
  return { stamp: konradStamp, refMs: doc.run.refMs ?? null, bySeg: out };
}

// --- ICON-D2 map products of `runs/` (thunder, LPI, CAPE, fresh snow) -------------------------------

/** Nearest-pixel sampler over a repack family PNG (north-up, regular lon/lat grid with the section's corners). */
function familySampler(root, run, fam, section) {
  const cache = new Map();
  const grid = fam.grid ?? section.grid;
  const span = fam.vMax - fam.vMin;
  return (step, lon, lat) => {
    const entry = fam.steps.find((s) => s.step === step);
    if (!entry) return null;
    let img = cache.get(step);
    if (img === undefined) { try { img = decodePng(readFileSync(join(root, run.path, entry.file))); } catch { img = null; } cache.set(step, img); }
    if (!img) return null;
    const { nw, ne, sw } = grid.corners;
    const x = Math.floor(((lon - nw[0]) / (ne[0] - nw[0])) * img.width), y = Math.floor(((nw[1] - lat) / (nw[1] - sw[1])) * img.height);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    const i = (y * img.width + x) * img.channels;
    const a = img.channels === 2 || img.channels === 4 ? img.data[i + img.channels - 1] : 255;
    if (!a) return null;
    return fam.vMin + (img.data[i] / 255) * span;
  };
}
/** The newest repack run of `index.json` not older than the input age, with samplers per family; `null` when none. */
export function runsSamplers(root, slotMs) {
  const idx = readJson(join(root, 'index.json'));
  const run = idx?.runs?.find((r) => existsSync(join(root, r.path)) && slotMs - Date.parse(r.runAt) <= ROAD_HZ_INPUT_AGE_MS.runs);
  if (!run) return null;
  const runAtMs = Date.parse(run.runAt);
  const fam = (k) => (run[k] ? familySampler(root, run, run[k], run) : null);
  const s = { th: fam('thunder'), lpi: fam('lightningfc'), cape: fam('cape'), ns: fam('snowFresh') };
  return { run: run.run, runAtMs, at: (k, ms, lon, lat) => { const f = s[k]; if (!f) return null; const step = Math.round((ms - runAtMs) / H); return step < 0 ? null : f(step, lon, lat); } };
}

// --- Route forecast (`road/fc/v1`) per corridor ------------------------------------------------------

export function pickFcRun(fcDir, nowMs) {
  const index = parseRoadFcIndex(readJson(join(fcDir, ROAD_FC_INDEX_PATH)));
  if (!index || index.killed) return null;
  const run = index.runs.find((r) => Date.parse(r.issuedAt) <= nowMs && nowMs - Date.parse(r.issuedAt) <= ROAD_HZ_INPUT_AGE_MS.fc && existsSync(join(fcDir, r.run)));
  return run ?? null;
}
const fcCache = new Map();
function fcCorridor(fcDir, run, corridorId) {
  const key = `${run}/${corridorId}`;
  if (!fcCache.has(key)) fcCache.set(key, parseRoadFcFile(readJson(join(fcDir, run, 'c', `${corridorId}.json`))));
  return fcCache.get(key);
}
const dec = (id, a, i) => (a ? roadFcDecode(id, a[i]) : null);
/** `HzHour` of a forecast point at `ms` (nearest full hour step), merged with the `runs/` samplers. */
function hourOf(file, p, ms, runs) {
  const i = Math.round((ms - file.t0Ms) / H);
  if (i < 0 || i >= file.steps) return null;
  const v = p.v;
  const t2m = dec('t', v.t, i);
  if (t2m == null) return null;
  return {
    t2m, td2m: dec('td', v.td, i), rr: dec('rr', v.rr, i), pp: dec('pp', v.pp, i), sn: dec('sn', v.sn, i), ff: dec('ff', v.ff, i), fx: dec('fx', v.fx, i), dd: dec('dd', v.dd, i), n: dec('n', v.n, i),
    sl: dec('sl', v.sl, i), t85: dec('t85', v.t85, i), vis: dec('vs', v.vs, i),
    th: runs?.at('th', ms, p.lon, p.lat) ?? null, lpi: runs?.at('lpi', ms, p.lon, p.lat) ?? null, cape: runs?.at('cape', ms, p.lon, p.lat) ?? null, ns: runs?.at('ns', ms, p.lon, p.lat) ?? null,
  };
}

// --- Stations of a slot with their ring history ------------------------------------------------------

function ringOf(storeDir, group, stamp, cache) {
  if (cache.has(group)) return cache.get(group);
  const dir = join(storeDir, 'h24', group);
  const files = stampFiles(dir, /^\d{10}\.json$/).filter((f) => f.slice(0, 10) <= stamp);
  const ring = files.length ? parseRoadH24(readJson(join(dir, files[files.length - 1]))) : null;
  cache.set(group, ring);
  return ring;
}
/** `HzStation` of an obs point, with trend, air history and today's road maximum from the ring. */
export function stationInput(p, ring, slotMs, inside) {
  const st = ring?.stations?.[p.id];
  const slots = ring?.slots ?? [];
  let rsTrendKh = null, rsMax = p.rs;
  const taHist = [];
  if (st) {
    const idxNow = slots.length - 1;
    const i1h = slots.findIndex((s) => roadStampToMs(s) === slotMs - H);
    if (p.rs != null && i1h >= 0 && st.rs[i1h] != null) rsTrendKh = Math.round((p.rs - st.rs[i1h]) * 10) / 10;
    const day = new Date(slotMs).toISOString().slice(0, 10);
    slots.forEach((s, i) => {
      const ms = roadStampToMs(s);
      if (slotMs - ms <= 3 * H && st.ta[i] != null && i !== idxNow) taHist.push([ms, st.ta[i]]);
      if (new Date(ms).toISOString().slice(0, 10) === day && st.rs[i] != null && (rsMax == null || st.rs[i] > rsMax)) rsMax = st.rs[i];
    });
  }
  if (p.ta != null) taHist.push([p.t, p.ta]);
  return {
    id: p.id, name: p.n, t: p.t, rs: p.rs ?? null, ta: p.ta ?? null, td: p.td ?? null, rh: p.rh ?? null, vis: p.vis ?? null, wf: p.wf ?? null, cond: p.cond ?? null,
    ws: p.ws ?? null, wg: p.wg ?? null, wd: p.wd ?? null, pt: p.pt ?? null, pr: p.pr ?? null,
    rsTrendKh, taHist, rsMax: rsMax ?? null, roadRejected: p.rs == null && !!p.x && Object.keys(p.x).some((k) => k.startsWith('rs')), inside,
    suspect: (!!p.o && Object.keys(p.o).length > 0) || (!!p.x && 'ta' in p.x),
  };
}

// --- The slot ------------------------------------------------------------------------------------------

export function deriveRoadHazards({ storeDir, imgDir, rootDir, outDir, stamp, nowMs = Date.now(), killed = process.env.ROAD_HZ_KILL === '1' }) {
  const t0 = Date.now();
  const slotMs = roadStampToMs(stamp);
  if (!Number.isFinite(slotMs)) throw new Error(`unlesbarer Slot ${stamp}`);
  const segFile = parseRoadSegments(readJson(join(storeDir, ROAD_SEGMENTS_PATH)));
  if (!segFile) throw new Error('static/segments.json fehlt oder besteht den Vertrag nicht');
  const segments = segFile.segments;
  const hours = Array.from({ length: ROAD_HZ_HOURS }, (_, i) => slotMs + i * H);
  const missing = new Set();
  const inputs = { obs: null, fc: null, rv: null, konrad: null, runs: null, segments: segFile.builtAt };

  // obs: the published slot itself (the mirror calls this only after a green obs slot; catch-up may still miss one).
  const obs = parseRoadObs(readJson(join(storeDir, roadObsPath(stamp))));
  const obsOk = !!obs && !obs.killed && nowMs - obs.slotMs <= ROAD_HZ_INPUT_AGE_MS.obs + 15 * 60_000;
  if (!obsOk) missing.add('obs'); else inputs.obs = obs.slot;
  const byId = new Map((obs?.points ?? []).map((p) => [p.id, p]));
  const ringCache = new Map();

  // fc: newest run issued before now.
  const fcDir = join(rootDir, 'road', 'fc', 'v1');
  const fcRun = pickFcRun(fcDir, nowMs);
  if (!fcRun) missing.add('fc'); else inputs.fc = { run: fcRun.run, fusion: fcRun.engine?.name ?? null };

  // radar, cells, runs
  const rvStamp = pickRvSlot(imgDir, slotMs);
  const radar = rvStamp ? radarForSegments(imgDir, rvStamp, segments) : null;
  if (!radar) missing.add('radar'); else inputs.rv = radar.stamp;
  const krStamp = pickKonradSlot(imgDir, slotMs);
  const cells = krStamp ? cellsForSegments(imgDir, krStamp, segments) : null;
  if (!cells) missing.add('konrad'); else inputs.konrad = cells.stamp;
  const runs = runsSamplers(rootDir, slotMs);
  if (!runs) missing.add('runs'); else inputs.runs = runs.run;

  const prevState = readJson(join(storeDir, ROAD_STATE_PATH));
  const prevHz = prevState?.hz?.seg ?? {};
  const nextHz = {};
  const seg = {};
  const dropped = [];
  const reasons = [];
  let withLevel = 0, unknown = 0;
  const byHazard = Object.fromEntries(ROAD_HAZARD_IDS.map((id) => [id, 0]));
  if (!killed) {
    for (const s of segments) {
      const file = fcRun ? fcCorridor(fcDir, fcRun.run, s.corridor) : null;
      const points = s.points.map((id, k) => {
        const fp = file?.points.find((p) => p.id === id) ?? null;
        const lon = fp?.lon ?? s.coords[k][0], lat = fp?.lat ?? s.coords[k][1];
        const hs = hours.map((ms) => (fp && file ? hourOf(file, fp, ms, runs) : null));
        // Tmax of the slot's UTC day from the run (steps within the day).
        let tmax = null;
        if (fp && file) { const day = new Date(slotMs).toISOString().slice(0, 10); for (let i = 0; i < file.steps; i++) { const ms = file.t0Ms + i * H; if (new Date(ms).toISOString().slice(0, 10) !== day) continue; const t = roadFcDecode('t', fp.v.t[i]); if (t != null && (tmax == null || t > tmax)) tmax = t; } }
        return { id, lat, lon, h: fp?.h ?? null, mosKm: fp?.mos ? fp.mos[1] : null, hours: hs, tmaxToday: tmax };
      });
      const stations = [];
      if (obsOk) {
        for (const id of s.stations) { const p = byId.get(id); if (p) stations.push(stationInput(p, ringOf(storeDir, p.g, stamp, ringCache), slotMs, true)); }
        for (const id of s.near) { const p = byId.get(id); if (p) stations.push(stationInput(p, ringOf(storeDir, p.g, stamp, ringCache), slotMs, false)); }
      }
      const r = evaluateSegment({ seg: s, slotMs, hours, stations, points, radar: radar?.bySeg.get(s.id) ?? null, cells: cells?.bySeg.get(s.id) ?? null, state: prevHz[s.id] ?? null, missing });
      nextHz[s.id] = r.state;
      dropped.push(...r.dropped);
      if (!r.entry) continue;
      const problems = [...roadHzEntryProblems(s.id, r.entry, s), ...roadHzConsistencyProblems(s.id, r.entry, points, stations)];
      if (problems.length) { reasons.push(...problems.slice(0, 3)); continue; }
      seg[s.id] = r.entry;
      let lv = false, un = false;
      for (const [hid, arr] of Object.entries(r.entry.lv)) { if (arr.some((l) => (l ?? 0) >= 1)) { lv = true; byHazard[hid]++; } if (arr.some((l) => l === null)) un = true; }
      if (lv) withLevel++; if (un) unknown++;
    }
  }
  const file = {
    schema: 1, product: 'road-hz', slot: stamp, slotMs, made: new Date(nowMs).toISOString(), hours, inputs, missing: [...missing].sort(), killed, capP: ROAD_HZ_CAP_P, seg,
  };
  // Slot lock: a consistency violation is a programme error ⇒ the slot is not published; the parser must accept the file.
  const text = JSON.stringify(file) + '\n';
  if (!parseRoadHz(JSON.parse(text))) reasons.push('hz-Datei besteht den Client-Prüfer im Rundlauf nicht');
  // Observe-mode statistics (never a lock): share of segments with a level, jump per hazard against the slot before.
  const observe = { shareWithLevel: segments.length ? Math.round((withLevel / segments.length) * 1000) / 1000 : 0, jump: {} };
  for (const id of ROAD_HAZARD_IDS) { const prev = prevState?.hz?.counts?.[id] ?? null; if (prev != null && prev >= 5 && byHazard[id] > prev * 3) observe.jump[id] = [prev, byHazard[id]]; }
  const publish = reasons.length === 0;
  const summaryFile = roadHzSummary(file);

  const tmp = `${outDir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let bytes = 0;
  const put = (rel, body) => { const p = join(tmp, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); bytes += Buffer.byteLength(body); };
  if (publish) put(roadHzPath(stamp), text);
  put(ROAD_STATE_PATH, JSON.stringify({ ...(prevState ?? { schema: 1, slot: stamp, stations: {} }), hz: { schema: 1, slot: stamp, seg: nextHz, counts: byHazard } }) + '\n');
  const summary = {
    ok: true, stamp, publish, reasons, killed, segments: segments.length, withLevel, unknown, byHazard, dropped: dropped.length, droppedList: dropped.slice(0, 10),
    missing: [...missing].sort(), inputs, observe, matrix: summaryFile.matrix, bytes: Buffer.byteLength(text), ms: Date.now() - t0,
  };
  put('summary.json', JSON.stringify(summary) + '\n');
  mkdirSync(dirname(outDir), { recursive: true });
  rmSync(outDir, { recursive: true, force: true });
  let renamed = false;
  for (let i = 0; i < 5 && !renamed; i++) { try { renameSync(tmp, outDir); renamed = true; } catch { /* Windows EPERM: retry, then copy */ } }
  if (!renamed) { cpSync(tmp, outDir, { recursive: true }); rmSync(tmp, { recursive: true, force: true }); }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.slice(2), '1']; }));
  const [storeDir, imgDir, rootDir, outDir, stamp] = args;
  if (!storeDir || !imgDir || !rootDir || !outDir || !stamp) { console.error('usage: road-hazards.mjs <storeDir> <imgDir> <rootDir> <outDir> <stamp> [--now=<iso>]'); process.exit(2); }
  try {
    const s = deriveRoadHazards({ storeDir, imgDir, rootDir, outDir, stamp, nowMs: flags.now ? Date.parse(flags.now) : Date.now() });
    const { matrix, droppedList, ...rest } = s;
    console.log(JSON.stringify(rest));
  } catch (e) { console.error(e.stack ?? e.message); process.exit(1); }
}

export { roadStamp };
