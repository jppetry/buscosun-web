#!/usr/bin/env node
/**
 * AW-6.2.7 — the DERIVE of the virtual road sensor (`audit/autobahnwetter.md` §20.13): one run of the core over every point,
 * from the newest forcing (`road/vs/v1/forcing/<run>.json.gz`), the site file, the persistent model state, the GMA slot and
 * rings (QC chain, coupling), the newest route forecast (buscosun Fusion air/dew point/wind/precipitation where it exists —
 * the station points are anchored to their own air measurement there) and the residual table; writes
 * `road/vs/v1/<run>/c/<corridor>.json`, `…/s/<state>.json`, `index.json`, `state.json.gz`, `shadow/<run>.jsonl.gz`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/vs/run-vs.mjs
 *     --data=<checkout of buscosun-data> [--out=<dir>] [--now=<iso>] [--run=YYYYMMDDHH] [--limit=N] [--ids=a,b] [--drive=fusion|icon]
 *     [--publish] [--remote=origin] [--branch=main]
 *
 * Cycling: every run integrates hours 1 … 48 of its forcing from the state snapshot at its t0 (written by the previous run as
 * forecast hour 3); snapshots of hours 0 … ROAD_VS_HISTORY_H + 6 are kept, so one missed run is survived; older ⇒ cold start,
 * marked. Pass 1 integrates every point without coupling (the model values feed the QC chain of the stations); pass 2 fits
 * the coupling factor for stations with a valid measurement ≤ 6 h old and re-integrates them. Shadow pairs (model − GMA at the
 * measuring hour) go to the shadow log — the input of the residual table and of Gate G. Exit 0 = run written/published,
 * 3 = refused (named), 1 = error. Shadow operation: the product says `live: false`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, mkdtempSync, renameSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  ROAD_VS_REPO_DIR, ROAD_VS_FORCING_INDEX_PATH, ROAD_VS_STEPS, roadVsForcingPath, roadVsDecode, roadVsRunMsOf, parseRoadVsForcing, lwDownBruntBolz, vapourPressureWaterHpa,
} from '../../../src/road/vs/roadVsForcing.ts';
import { ROAD_VS_SITE_PATH, roadVsSiteProblems } from '../../../src/road/vs/roadVsSite.ts';
import { initState, integrateHour, vsStateProblems, VS_SPINUP_H } from '../../../src/road/vs/roadVsCore.ts';
import { vsQcStation, VS_QC_COUPLE_MAX_AGE_MS } from '../../../src/road/vs/roadVsQc.ts';
import { fitCouplingFactor, couplingFactorAt, coupleModeOf, cloneState, weatherClassOf, stationCorrection, neighbourCorrection, correctedSigma, VS_COUPLE } from '../../../src/road/vs/roadVsCouple.ts';
import { classifyRoad, slipperinessP, gallawayFilm, frostPointOfDew, rimeIntegralUpdate, VS_CLASS_T } from '../../../src/road/vs/roadVsState.ts';
import { diagnoseVisibilityM, visibilityProbabilities, capForecastProbabilities, visibilityNow, VS_VIS_DEFAULT_MODEL } from '../../../src/road/vs/roadVsVis.ts';
import {
  ROAD_VS_PRODUCT_SOURCE, ROAD_VS_INDEX_PATH, ROAD_VS_STATE_PATH, ROAD_VS_RESIDUALS_PATH, ROAD_VS_KEEP_RUNS, ROAD_VS_HISTORY_H, ROAD_VS_SRC, ROAD_VS_CONDITION_CODE, ROAD_VS_GRIP_CODE,
  ROAD_VS_VAR_IDS, roadVsProductEncode, roadVsCorridorPath, roadVsStatePath, roadVsShadowPath, roadVsProductProblems,
} from '../../../src/road/vs/roadVsProduct.ts';
import { ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH, ROAD_FC_INDEX_PATH, roadFcCorridorPath, roadFcStatePath, roadFcPickRun, parseRoadFcIndex, roadFcDecode } from '../../../src/road/roadFc.ts';
import { ROAD_REPO_DIR, roadStamp, roadStampToMs, ROAD_SLOT_MS } from '../../../src/road/roadContract.ts';

const H = 3_600_000;
const PUSH_RETRIES = 6;
const sha12 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
const readGz = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
/** σ (K) of an uncorrected model hour by lead when no residual table exists (`set`, uncalibrated, named in the engine block). */
export const VS_SIGMA_SET = (h) => Math.min(3, 1 + 0.1 * h);

// --- Inputs ---------------------------------------------------------------------------------------

export function loadForcing(dataDir, run = null) {
  const dir = join(dataDir, ROAD_VS_REPO_DIR);
  let stamp = run;
  if (!stamp) {
    const idx = existsSync(join(dir, ROAD_VS_FORCING_INDEX_PATH)) ? JSON.parse(readFileSync(join(dir, ROAD_VS_FORCING_INDEX_PATH), 'utf8')) : null;
    stamp = idx?.runs?.[0]?.run ?? readdirSync(join(dir, 'forcing')).filter((f) => /^\d{10}\.json\.gz$/.test(f)).sort().pop()?.slice(0, 10) ?? null;
  }
  if (!stamp) return null;
  const f = join(dir, roadVsForcingPath(stamp));
  if (!existsSync(f)) return null;
  const doc = parseRoadVsForcing(readGz(f));
  return doc ? { doc, byId: new Map(doc.points.map((p) => [p.id, p])) } : null;
}

export function loadSite(dataDir) {
  const f = join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_SITE_PATH);
  if (!existsSync(f)) return null;
  const doc = readGz(f);
  return roadVsSiteProblems(doc).length ? null : doc;
}

export function loadPrevState(dataDir) {
  const f = join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_STATE_PATH);
  if (!existsSync(f)) return null;
  try { const s = readGz(f); return s?.schema === 1 && s.points ? s : null; } catch { return null; }
}

export function loadResiduals(dataDir) {
  const f = join(dataDir, ROAD_VS_REPO_DIR, ROAD_VS_RESIDUALS_PATH);
  if (!existsSync(f)) return { table: null, hash: null };
  try { const t = JSON.parse(readFileSync(f, 'utf8')); return t?.product === 'road-vs-residuals' ? { table: t, hash: sha12(readFileSync(f)) } : { table: null, hash: null }; } catch { return { table: null, hash: null }; }
}

/** The newest route forecast: point id → { t0Ms, t, td, ff, rr, sn, vs } (decoded), or null. */
export function loadFusion(dataDir, nowMs) {
  const dir = join(dataDir, ROAD_FC_REPO_DIR);
  const idxFile = join(dir, ROAD_FC_INDEX_PATH);
  if (!existsSync(idxFile)) return null;
  const idx = parseRoadFcIndex(JSON.parse(readFileSync(idxFile, 'utf8')));
  const run = roadFcPickRun(idx, nowMs);
  if (!run) return null;
  const byId = new Map();
  const runDir = join(dir, run.run);
  if (!existsSync(runDir)) return null;
  for (const sub of ['c', 's']) {
    const d = join(runDir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      let doc; try { doc = JSON.parse(readFileSync(join(d, f), 'utf8')); } catch { continue; }
      for (const p of doc.points ?? []) {
        const dec = (id) => (p.v[id] ?? []).map((x) => roadFcDecode(id, x));
        byId.set(p.id, { t0Ms: doc.t0Ms, t: dec('t'), td: dec('td'), ff: dec('ff'), rr: dec('rr'), sn: dec('sn'), vs: p.v.vs ? dec('vs') : null });
      }
    }
  }
  return { run: run.run, t0Ms: run.t0Ms, byId };
}

/** Latest GMA slot ≤ now with its points, and the rings of that slot per group. */
export function loadObs(dataDir, nowMs) {
  const dir = join(dataDir, ROAD_REPO_DIR, 'obs');
  if (!existsSync(dir)) return null;
  const slots = readdirSync(dir).filter((f) => /^\d{10}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((s) => roadStampToMs(s) <= nowMs).sort();
  const slot = slots.pop();
  if (!slot) return null;
  let doc; try { doc = JSON.parse(readFileSync(join(dir, `${slot}.json`), 'utf8')); } catch { return null; }
  if (!Array.isArray(doc.points) || doc.killed) return null;
  const rings = new Map();
  const h24 = join(dataDir, ROAD_REPO_DIR, 'h24');
  if (existsSync(h24)) {
    for (const g of readdirSync(h24)) {
      const f = join(h24, g, `${slot}.json`);
      if (!existsSync(f)) continue;
      try {
        const r = JSON.parse(readFileSync(f, 'utf8'));
        const slotsMs = r.slots.map((s) => roadStampToMs(s));
        for (const [id, s] of Object.entries(r.stations)) rings.set(id, { slotsMs, rs: s.rs.map((x) => (x == null ? null : Number(x))), ta: s.ta.map((x) => (x == null ? null : Number(x))) });
      } catch { /* a broken ring = no history for that group */ }
    }
  }
  return { slot, slotMs: roadStampToMs(slot), points: new Map(doc.points.map((p) => [p.id, p])), rings };
}

// --- Forcing of one point ---------------------------------------------------------------------------

/** VsHourForcing for hours 1 … steps−1 of a point (null where a mandatory input is missing); Fusion overrides air/dew/wind/precip. */
export function hourForcing(fp, fusion, t0Ms, steps, drive) {
  const v = (id, h) => roadVsDecode(id, fp.v[id]?.[h]);
  const out = new Array(steps).fill(null);
  const fu = drive === 'fusion' && fusion ? fusion : null;
  const fi = (arr, ms) => { if (!fu || !arr) return null; const i = (ms - fu.t0Ms) / H; return Number.isInteger(i) && i >= 0 && i < arr.length ? arr[i] : null; };
  for (let h = 1; h < steps; h++) {
    const ms = t0Ms + h * H;
    const ta = fi(fu?.t, ms) ?? v('t2m', h), td = fi(fu?.td, ms) ?? v('td2m', h);
    const u = v('u10', h), w = v('v10', h);
    const ff = fi(fu?.ff, ms) ?? (u != null && w != null ? Math.hypot(u, w) : null);
    const swDir = v('swdir', h), swDif = v('swdif', h);
    const clct = v('clct', h);
    let lwDown = v('lwdown', h);
    if (lwDown == null && ta != null && td != null) lwDown = lwDownBruntBolz(ta, vapourPressureWaterHpa(td), clct == null ? null : clct / 100);
    const frz = v('frz', h) ?? 0;
    let rain, snow;
    const rrF = fi(fu?.rr, ms), snF = fi(fu?.sn, ms);
    if (rrF != null) { const s = snF == null ? (ta != null && ta <= 0 ? 1 : 0) : snF / 100; rain = Math.max(0, rrF * (1 - s) - frz); snow = rrF * s; }
    else { const prr = v('prr', h), prs = v('prs', h), prg = v('prg', h); if (prr == null && prs == null) { rain = null; snow = null; } else { rain = Math.max(0, (prr ?? 0) + (ta != null && ta > 0 ? (prg ?? 0) : 0) - frz); snow = (prs ?? 0) + (ta != null && ta <= 0 ? (prg ?? 0) : 0); } }
    if (ta == null || td == null || ff == null || swDir == null || swDif == null || lwDown == null || rain == null) continue;
    out[h] = { validMs: ms, ta, td, ff, pHpa: null, swDir, swDif, lwDown, rain, snow, frz, clct, qc: v('qc', h), vis: v('vis', h), mos: fi(fu?.vs, ms) };
  }
  return out;
}

// --- The run ----------------------------------------------------------------------------------------

export async function runVs({ dataDir, outDir, nowMs = Date.now(), run = null, limit = null, ids = null, drive = 'fusion', log = () => {} }) {
  const T0 = Date.now();
  const forcing = loadForcing(dataDir, run);
  if (!forcing) throw Object.assign(new Error('kein Antrieb (road/vs/v1/forcing) im Checkout'), { refuse: true });
  const { doc: F } = forcing;
  const t0Ms = F.runMs, steps = F.steps;
  const site = loadSite(dataDir);
  if (!site) throw Object.assign(new Error('static/site.json.gz fehlt oder ist ungültig'), { refuse: true });
  const pointsBytes = readFileSync(join(dataDir, ROAD_FC_REPO_DIR, ROAD_FC_POINTS_PATH));
  let points = JSON.parse(pointsBytes.toString('utf8')).points;
  if (ids) { const want = new Set(ids); points = points.filter((p) => want.has(p.id)); }
  if (limit) points = points.slice(0, limit);
  const prev = loadPrevState(dataDir);
  const { table: residuals, hash: residualsHash } = loadResiduals(dataDir);
  const fusion = drive === 'fusion' ? loadFusion(dataDir, nowMs) : null;
  const obs = loadObs(dataDir, nowMs);
  const hNow = Math.max(0, Math.min(steps - 1, Math.floor((nowMs - t0Ms) / H)));
  const hObs = obs ? Math.round((obs.slotMs - t0Ms) / H) : null;
  const obsUsable = hObs != null && hObs >= 0 && hObs <= hNow && nowMs - obs.slotMs <= VS_QC_COUPLE_MAX_AGE_MS;
  log(`Antrieb ${F.run} (t0 ${new Date(t0Ms).toISOString()}), jetzt +${hNow} h, Messslot ${obs?.slot ?? '—'}${obsUsable ? ` = Stunde +${hObs}` : ' (nicht nutzbar)'}, Fusion ${fusion?.run ?? '—'}, Residuen ${residualsHash ?? '—'}, Zustand ${prev ? `${Object.keys(prev.points).length} Punkte aus ${prev.run}` : 'keiner (Kaltstart)'}, ${points.length} Punkte`);

  // Pass 1: every point from its state at t0, no coupling.
  const work = new Map();
  const counts = { total: 0, coldStart: 0, coupled: 0, measured: 0, corrected: 0, noForcing: 0, qcValid: 0, qcRejected: 0, init: { state: 0, tg: 0, ta: 0, obs: 0 } };
  for (const p of points) {
    const fp = forcing.byId.get(p.id), sp = site.site[p.id];
    if (!fp || !sp) { counts.noForcing++; continue; }
    const vsSite = { lat: p.lat, lon: p.lon, svf: sp.svf, hz: sp.hz, bridge: sp.bridge, surface: sp.surface };
    const hours = hourForcing(fp, fusion?.byId.get(p.id) ?? null, t0Ms, steps, drive);
    // State at t0: the previous run's snapshot of this hour; else the nearest earlier one within the history (no forcing for the gap ⇒ cold start).
    let st = null, from = 'state';
    const ps = prev?.points?.[p.id];
    const snap = ps?.snap?.[String(t0Ms)];
    if (snap && vsStateProblems(snap).length === 0) st = cloneState(snap);
    if (!st) {
      const obsRs = obs?.points.get(p.id)?.rs;
      const tg = roadVsDecode('tg', fp.v.tg?.[0]), ta = roadVsDecode('t2m', fp.v.t2m?.[0]);
      const surf = p.kind === 'station' && obsUsable && Number.isFinite(obsRs) && hObs === 0 ? obsRs : tg ?? ta;
      if (surf == null) { counts.noForcing++; continue; }
      from = p.kind === 'station' && Number.isFinite(obsRs) && hObs === 0 ? 'obs' : tg != null ? 'tg' : 'ta';
      st = initState(t0Ms, surf, from === 'ta' ? 'ta' : 'tg', vsSite);
      // A cold start inherits the age of an older snapshot of the same point (a restart is not a new column).
      if (ps?.ageH) st.ageH = Math.max(0, ps.ageH - 12);
    }
    counts.init[from]++;
    const rimeKh0 = ps?.rimeKh ?? 0;
    const snaps = { [String(t0Ms)]: cloneState(st) };
    const res = new Array(steps).fill(null);
    const rime = new Array(steps).fill(rimeKh0);
    let state = cloneState(st), broken = null, prevF = null;
    for (let h = 1; h < steps; h++) {
      const f = hours[h];
      if (!f) { broken = broken ?? h; break; }
      const r = integrateHour(state, vsSite, prevF, f);
      res[h] = r;
      rime[h] = rimeIntegralUpdate(rime[h - 1], frostPointOfDew(f.td), r.ts);
      if (h <= ROAD_VS_HISTORY_H + 6) snaps[String(t0Ms + h * H)] = cloneState(state);
      prevF = f;
    }
    work.set(p.id, { p, sp, vsSite, hours, st0: st, snaps, res, rime, broken, from });
    counts.total++;
  }

  // QC of the stations at the measuring hour (two stages: own steps, then neighbours and model).
  const qc = new Map();
  if (obsUsable) {
    const stage1 = new Map();
    for (const [id, w] of work) {
      if (w.p.kind !== 'station') continue;
      const op = obs.points.get(id);
      if (!op || op.t !== obs.slotMs) continue;
      const r = vsQcStation({ id, lat: w.p.lat, lon: w.p.lon, h: op.h ?? null, slotMs: obs.slotMs, point: op, history: obs.rings.get(id) ?? null });
      stage1.set(id, { op, r });
    }
    const cand = [];
    for (const [id, { op, r }] of stage1) { const m = hObs === 0 ? w0ts(work.get(id)) : work.get(id).res[hObs]?.ts; if (r.rs.ok && m != null) cand.push({ id, lat: work.get(id).p.lat, lon: work.get(id).p.lon, h: op.h ?? null, rs: op.rs, model: m }); }
    for (const [id, { op }] of stage1) {
      const w = work.get(id);
      const m = hObs === 0 ? w0ts(w) : w.res[hObs]?.ts ?? null;
      const r = vsQcStation({ id, lat: w.p.lat, lon: w.p.lon, h: op.h ?? null, slotMs: obs.slotMs, point: op, history: obs.rings.get(id) ?? null, neighbours: cand.filter((c) => c.id !== id), model: m == null ? null : { rs: m, sigma: VS_SIGMA_SET(hObs), coldStart: w.st0.ageH < VS_SPINUP_H } });
      qc.set(id, { op, r, model: m });
      if (r.rs.ok) counts.qcValid++; else counts.qcRejected++;
    }
  }

  // Pass 2: coupling for stations with a valid measurement.
  const shadow = [];
  for (const [id, { op, r, model }] of qc) {
    const w = work.get(id);
    if (model != null && r.rs.value != null) {
      // The pair of Gate G at the measuring hour: model (uncoupled) against the GMA, plus what the GMA saw beside the
      // temperature (film, condition code, visibility) and what the model had in its stores — film MAE, class contingency and
      // the visibility Brier of 6.2.8 read these; `tg`/`t2m` of the forcing are the baselines ICON T_G and T2m.
      const hr = Math.max(1, hObs), rr = w.res[hr], f = w.hours[hr];
      shadow.push({
        run: F.run, id, validMs: obs.slotMs, hObs, modelTs: model, obsTs: r.rs.value, residualK: Math.round((model - r.rs.value) * 100) / 100,
        cls: f ? weatherClassOf({ ...f, filmMm: op.wf ?? null }) : null, coldStart: w.st0.ageH < VS_SPINUP_H, weak: r.weak, bridge: w.sp.bridge,
        obsWf: Number.isFinite(op.wf) ? op.wf : null, obsCond: op.cond ?? null, obsVis: Number.isFinite(op.vis) && !(op.x && op.x.vis) ? op.vis : null, obsTa: Number.isFinite(op.ta) ? op.ta : null,
        modelWater: rr ? Math.round((rr.stores.water + rr.stores.pore) * 1000) / 1000 : null, modelStores: rr ? rr.stores : null,
        tg: roadVsDecode('tg', forcing.byId.get(id)?.v.tg?.[hObs]), t2m: f?.ta ?? null,
      });
    }
    if (!r.rs.ok || r.rs.value == null) continue;
    const hStart = Math.max(0, hObs - VS_COUPLE.windowH);
    const window = [];
    for (let h = hStart + 1; h <= hObs; h++) if (w.hours[h]) window.push(w.hours[h]);
    const start = w.snaps[String(t0Ms + hStart * H)];
    let couple = null;
    if (window.length && start) {
      // The mode follows the window's sun; when that input cannot reach the measurement (low sun in the last hour of the day,
      // a shaded point), the other input is tried and the smaller residual wins — a factor at its bound is never applied blindly.
      let fit = fitCouplingFactor({ start, site: w.vsSite, prev: hStart >= 1 ? w.hours[hStart] : null, window, obsTs: r.rs.value });
      if (!fit.converged) {
        const alt = fitCouplingFactor({ start, site: w.vsSite, prev: hStart >= 1 ? w.hours[hStart] : null, window, obsTs: r.rs.value, mode: fit.mode === 'sw' ? 'lw' : 'sw' });
        if (alt.converged || Math.abs(alt.residualK) < Math.abs(fit.residualK)) fit = alt;
      }
      if (!fit.converged) counts.coupleAtBound = (counts.coupleAtBound ?? 0) + 1;
      couple = { c: fit.c, mode: fit.mode, ageH: Math.round(((nowMs - obs.slotMs) / H) * 10) / 10, converged: fit.converged };
      // Re-integrate from the window start to the end with C_R inside the window and the decaying factor after it.
      const state = cloneState(start);
      let prevF = hStart >= 1 ? w.hours[hStart] : null, broken = null;
      for (let h = hStart + 1; h < steps; h++) {
        const f = w.hours[h];
        if (!f) { broken = broken ?? h; break; }
        const c = h <= hObs ? fit.c : couplingFactorAt(fit.c, h - hObs);
        const g = fit.mode === 'sw' ? { ...f, cS: c } : { ...f, cL: c };
        const rr = integrateHour(state, w.vsSite, prevF, g);
        w.res[h] = rr;
        w.rime[h] = rimeIntegralUpdate(w.rime[h - 1], frostPointOfDew(f.td), rr.ts);
        if (h <= ROAD_VS_HISTORY_H + 6) w.snaps[String(t0Ms + h * H)] = cloneState(state);
        prevF = f;
      }
      w.broken = broken ?? w.broken;
      w.couple = couple;
      w.obsHour = { h: hObs, rs: r.rs.value };
      counts.coupled++;
    } else if (hObs === 0) { w.obsHour = { h: 0, rs: r.rs.value }; }
    if (w.obsHour) counts.measured++;
  }

  // Output.
  const gmaForSite = [...work.values()].filter((w) => w.p.kind === 'station').map((w) => ({ id: w.p.id, lat: w.p.lat, lon: w.p.lon, h: w.sp.zTerrain, terrain: w.sp.terrain }));
  const visObs = obsUsable ? [...obs.points.values()].filter((o) => Number.isFinite(o.vis) && !(o.x && o.x.vis) && work.has(o.id)).map((o) => ({ id: o.id, lat: o.lat, lon: o.lon, h: work.get(o.id).sp.zTerrain, terrain: work.get(o.id).sp.terrain, visM: o.vis })) : [];
  const outPoints = [];
  for (const [id, w] of work) {
    const v = Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, new Array(steps).fill(null)]));
    const enc = (k, h, x) => { v[k][h] = roadVsProductEncode(k, x); };
    let corrApplied = null;
    const nowVis = visObs.length ? visibilityNow({ id, lat: w.p.lat, lon: w.p.lon, h: w.sp.zTerrain, terrain: w.sp.terrain }, visObs) : null;
    for (let h = 0; h < steps; h++) {
      const r = h === 0 ? null : w.res[h];
      const ts0 = h === 0 ? w0ts(w) : r?.ts ?? null;
      if (ts0 == null) { enc('tf_src', h, ROAD_VS_SRC.unbekannt); enc('vis_src', h, 3); continue; }
      const f = w.hours[Math.max(1, h)];
      const stores = h === 0 ? w.st0.stores : r.stores;
      const cls = f ? weatherClassOf({ ...f, filmMm: stores.water }) : 'bewoelkt';
      let tf = ts0, src = ROAD_VS_SRC.modelliert, sigma = VS_SIGMA_SET(h);
      if (w.obsHour && h === w.obsHour.h) { tf = w.obsHour.rs; src = ROAD_VS_SRC.gemessen; sigma = 0.3; }
      else if (w.couple && h > w.obsHour.h) { src = ROAD_VS_SRC.gekoppelt; sigma = correctedSigma(residuals, cls, t0Ms + h * H, VS_SIGMA_SET(h - w.obsHour.h)); }
      else if (!w.couple && !(w.obsHour && h === w.obsHour.h)) {
        const c = w.p.kind === 'station' ? stationCorrection(residuals, id, t0Ms + h * H, cls) : null;
        const nb = c && c.n ? null : neighbourCorrection(residuals, { id, lat: w.p.lat, lon: w.p.lon, h: w.sp.zTerrain, terrain: w.sp.terrain }, gmaForSite.filter((g) => g.id !== id), t0Ms + h * H, cls);
        const k = c && c.n ? c.k : nb ? nb.k : 0;
        if (k) { tf = ts0 - k; corrApplied = corrApplied ?? { k, from: c && c.n ? 'station' : 'neighbours', n: c && c.n ? c.n : nb.n }; }
        sigma = correctedSigma(residuals, cls, t0Ms + h * H, VS_SIGMA_SET(h));
      }
      enc('tf', h, tf); enc('tf_sigma', h, sigma); enc('tf_src', h, src);
      if (h > 0 && r.tsBridge != null) enc('tf_bruecke', h, r.tsBridge);
      enc('wasser_mm', h, stores.water + stores.pore); enc('schnee_mm', h, stores.snow); enc('eis_mm', h, stores.ice); enc('reif_mm', h, stores.frost);
      const rain = f?.rain ?? 0, snow = f?.snow ?? 0, frz = f?.frz ?? 0;
      const film = rain >= VS_CLASS_T.glatteisRateMmH ? Math.max(stores.water, gallawayFilm(rain, w.sp.widthM, w.sp.crossSlopePct).filmMm) : stores.water;
      enc('wasserfilm_mm', h, film);
      const cl = classifyRoad({ ts: tf, stores, rain, snow, frz, rimeKh: w.rime[h] ?? 0, precipType: 'unbekannt' });
      enc('zustand', h, ROAD_VS_CONDITION_CODE[cl.condition]); enc('griff', h, ROAD_VS_GRIP_CODE[cl.grip]);
      enc('glaette_p', h, 100 * slipperinessP(cl, { ts: tf, stores, rain, snow, frz, rimeKh: w.rime[h] ?? 0, precipType: 'unbekannt' }));
      // Visibility: measured at the measuring hour (own or neighbour), probabilities ahead.
      if (nowVis && obsUsable && h === hObs) { const m = nowVis.visM; const p = [1000, 300, 150, 50].map((x) => (m < x ? 100 : 0)); enc('vis_p1000', h, p[0]); enc('vis_p300', h, p[1]); enc('vis_p150', h, p[2]); enc('vis_p50', h, p[3]); enc('vis_src', h, 0); }
      else if (f) {
        const d = diagnoseVisibilityM({ qcMgKg: f.qc, rain, snow, tC: f.ta, tdC: f.td });
        const pr = capForecastProbabilities(visibilityProbabilities({ diag: d.vM, mos: f.mos, ruc: f.vis }, VS_VIS_DEFAULT_MODEL));
        if (pr) { enc('vis_p1000', h, 100 * pr[0]); enc('vis_p300', h, 100 * pr[1]); enc('vis_p150', h, 100 * pr[2]); enc('vis_p50', h, 100 * pr[3]); enc('vis_src', h, 2); } else enc('vis_src', h, 3);
      } else enc('vis_src', h, 3);
    }
    const cold = w.st0.ageH < VS_SPINUP_H;
    if (cold) counts.coldStart++;
    if (corrApplied) counts.corrected++;
    outPoints.push({ id, kind: w.p.kind, lat: w.p.lat, lon: w.p.lon, bridge: w.sp.bridge, kaltstart: cold, ...(w.couple ? { couple: w.couple } : {}), ...(corrApplied ? { corr: corrApplied } : {}), szenario: 'ungestreut', v, _meta: w.p });
  }

  // Next state: the snapshot at the hour the NEXT run starts (t0 + 3) and the history around it.
  // Snapshots of hours 0 … HISTORY + 3 (the next run starts at +3 and needs 3 h of history before its own t0; one missed run is
  // still covered), node temperatures rounded to 0,01 K and stores to 0,001 mm — the state must stay small (a commit every 3 h).
  const nextState = { schema: 1, run: F.run, t0Ms, writtenAt: new Date(nowMs).toISOString(), points: {} };
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  for (const [id, w] of work) {
    const keep = {};
    for (const [k, s] of Object.entries(w.snaps)) {
      if (Number(k) < t0Ms || Number(k) > t0Ms + (ROAD_VS_HISTORY_H + 3) * H) continue;
      keep[k] = { ...s, T: s.T.map(r2), Tb: s.Tb ? s.Tb.map(r2) : null, stores: Object.fromEntries(Object.entries(s.stores).map(([a, b]) => [a, r3(b)])) };
    }
    nextState.points[id] = { snap: keep, rimeKh: w.rime[Math.min(steps - 1, hNow + 3)] ?? 0, ageH: (w.snaps[String(t0Ms + 3 * H)]?.ageH ?? w.st0.ageH) };
  }

  const engine = {
    core: 'roadsurf-ts-1', forcing: { run: F.run, ruc: F.ruc?.run ?? null, missing: Object.keys(F.missing ?? {}) }, drive: fusion ? 'fusion+icon' : 'icon', fusionRun: fusion?.run ?? null,
    obsSlot: obsUsable ? obs.slot : null, residuals: residuals ? { table: residualsHash, calibrated: true } : null, vis: { calibrated: VS_VIS_DEFAULT_MODEL.calibrated },
    sigma: residuals ? 'residuals' : 'set (1 + 0,1·h, ≤ 3 K)', points: { total: counts.total, coupled: counts.coupled, measured: counts.measured, coldStart: counts.coldStart, corrected: counts.corrected }, live: false,
  };
  const issuedAt = new Date(nowMs).toISOString();
  const head = (kind, id) => ({ schema: 1, product: 'road-vs', run: F.run, t0Ms, issuedAt, steps, kind, id, engine, source: ROAD_VS_PRODUCT_SOURCE });
  const byCorridor = new Map(), byState = new Map();
  for (const p of outPoints) {
    const m = p._meta; delete p._meta;
    const [map, key] = m.corridor ? [byCorridor, m.corridor] : [byState, m.state ?? 'XX'];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const runDir = join(outDir, F.run);
  rmSync(runDir, { recursive: true, force: true });
  let bytes = 0, problems = [];
  const write = (rel, doc) => { const pr = roadVsProductProblems(doc); if (pr.length) problems.push(`${rel}: ${pr.join('; ')}`); const text = JSON.stringify(doc) + '\n'; bytes += text.length; const f = join(outDir, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(`${f}.tmp`, text); renameSync(`${f}.tmp`, f); };
  for (const [id, pts] of byCorridor) write(roadVsCorridorPath(F.run, id), { ...head('corridor', id), points: pts });
  for (const [id, pts] of byState) write(roadVsStatePath(F.run, id), { ...head('state', id), points: pts });
  if (problems.length) throw Object.assign(new Error(`Produkt besteht den Prüfer nicht: ${problems.slice(0, 3).join(' · ')}`), { refuse: true });
  const stateGz = gzipSync(JSON.stringify(nextState), { level: 6 });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, ROAD_VS_STATE_PATH), stateGz);
  const shadowGz = gzipSync(shadow.map((s) => JSON.stringify(s)).join('\n') + (shadow.length ? '\n' : ''), { level: 9 });
  const shadowFile = join(outDir, roadVsShadowPath(F.run));
  mkdirSync(dirname(shadowFile), { recursive: true });
  writeFileSync(shadowFile, shadowGz);
  const entry = { run: F.run, t0Ms, issuedAt, points: outPoints.length, coupled: counts.coupled, coldStart: counts.coldStart, corridors: byCorridor.size, states: byState.size, ms: Date.now() - T0 };
  // A local pointer next to the run (the publish step rebuilds it from the remote's): the archiver and a local test read it.
  writeFileSync(join(outDir, ROAD_VS_INDEX_PATH), `${JSON.stringify(nextIndex(existsSync(join(outDir, ROAD_VS_INDEX_PATH)) ? JSON.parse(readFileSync(join(outDir, ROAD_VS_INDEX_PATH), 'utf8')) : null, entry, nowMs), null, 1)}\n`);
  const resid = shadow.map((s) => s.residualK).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => (resid.length ? resid[Math.floor((resid.length - 1) * p)] : null);
  log(`VS ${F.run}: ${outPoints.length} Punkte · gekoppelt ${counts.coupled} (am Anschlag ${counts.coupleAtBound ?? 0}) · gemessen ${counts.measured} · korrigiert ${counts.corrected} · Kaltstart ${counts.coldStart} · Start ${JSON.stringify(counts.init)} · QC gültig/verworfen ${counts.qcValid}/${counts.qcRejected} · ohne Antrieb ${counts.noForcing} · Schatten ${shadow.length} Paare (Modell − Messung p10/p50/p90 ${q(0.1)} / ${q(0.5)} / ${q(0.9)} K) · ${(bytes / 1e6).toFixed(2)} MB + Zustand ${(stateGz.length / 1e6).toFixed(2)} MB gz · ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  return { run: F.run, runDir, entry, counts, shadow: shadow.length, stateBytes: stateGz.length, bytes };
}

const w0ts = (w) => (w.st0.T[0] + w.st0.T[3]) / 2;

// --- Publish -------------------------------------------------------------------------------------

export function nextIndex(prev, entry, nowMs) {
  const runs = [entry, ...(prev?.runs ?? []).filter((r) => r.run !== entry.run)].sort((a, b) => (a.run < b.run ? 1 : -1)).slice(0, ROAD_VS_KEEP_RUNS);
  return { schema: 1, product: 'road-vs-index', updatedAt: new Date(nowMs).toISOString(), killed: false, runs };
}

export function publishVs({ repoDir, built, remote = 'origin', branch = 'main', nowMs = () => Date.now(), log = () => {}, retries = PUSH_RETRIES }) {
  const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const dir = join(repoDir, ROAD_VS_REPO_DIR);
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      git(['fetch', '--quiet', '--depth=1', remote, branch]);
      git(['checkout', '--quiet', '-B', branch, `${remote}/${branch}`]);
      const staged = git(['diff', '--cached', '--name-only']);
      if (staged) throw Object.assign(new Error(`Index des Klons trägt fremde Änderungen (${staged.split('\n').slice(0, 3).join(', ')}) — kein Push`), { fatal: true });
      const idxFile = join(dir, ROAD_VS_INDEX_PATH);
      const prev = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : null;
      const index = nextIndex(prev, built.entry, nowMs());
      rmSync(join(dir, built.run), { recursive: true, force: true });
      cpSync(built.runDir, join(dir, built.run), { recursive: true });
      cpSync(join(dirname(built.runDir), ROAD_VS_STATE_PATH), join(dir, ROAD_VS_STATE_PATH));
      const sh = join(dirname(built.runDir), roadVsShadowPath(built.run));
      if (existsSync(sh)) { mkdirSync(join(dir, 'shadow'), { recursive: true }); cpSync(sh, join(dir, roadVsShadowPath(built.run))); }
      const keep = new Set(index.runs.map((r) => r.run));
      for (const d of readdirSync(dir)) if (/^\d{10}$/.test(d) && !keep.has(d)) rmSync(join(dir, d), { recursive: true, force: true });
      writeFileSync(idxFile, `${JSON.stringify(index, null, 1)}\n`);
      git(['add', '-A', '--', ROAD_VS_REPO_DIR]);
      if (!git(['status', '--porcelain', '--', ROAD_VS_REPO_DIR])) return { noop: true, attempt };
      git(['commit', '--quiet', '-m', `road-vs: ${built.run} (${built.entry.points} Punkte, ${built.entry.coupled} gekoppelt)`, '--', ROAD_VS_REPO_DIR]);
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
  const nowMs = typeof flags.now === 'string' ? Date.parse(flags.now) : Date.now();
  const outDir = typeof flags.out === 'string' ? flags.out : mkdtempSync(join(tmpdir(), 'road-vs-run-'));
  let built;
  try {
    built = await runVs({ dataDir: flags.data, outDir, nowMs, run: typeof flags.run === 'string' ? flags.run : null, limit: flags.limit ? Number(flags.limit) : null, ids: typeof flags.ids === 'string' ? flags.ids.split(',') : null, drive: flags.drive === 'icon' ? 'icon' : 'fusion', log });
  } catch (e) { if (e.refuse) { log(`Lauf NICHT geschrieben: ${e.message}`); process.exit(3); } throw e; }
  if (!flags.publish) { log(`geschrieben nach ${built.runDir} (ohne --publish)`); return; }
  const r = publishVs({ repoDir: flags.data, built, remote: flags.remote || 'origin', branch: flags.branch || 'main', log });
  log(r.noop ? 'nichts zu committen' : `veröffentlicht ${r.commit.slice(0, 7)} (Versuch ${r.attempt}) · Läufe im Repo: ${r.runs.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
