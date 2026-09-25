/**
 * build-slots.mjs — AP10a: hindcast cache → hindcast slots in the cube's own slot form (mirrors the archive's
 * schema-3 draft, prompt.md 1b: the nearest cell complete with all 57 planes, the other cells of the 2×2 block with
 * the 31 PAP-3 planes). Node, deterministic: the same cache gives byte-identical slots (createdAt = the newest
 * fetchedAt of the cache files that entered, not the wall clock).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/build-slots.mjs \
 *        --from=2026-09-14 --to=2026-09-18 [--hours=0,3,…] [--tiers=t1,t2,t3] [--route=auto|run|day0|dyn] [--force]
 *
 * Routes (per tier and pseudo-run R):
 *   run   Open-Meteo `data_run` exists for the tier's lead source at R (2026-06-17 →): the full-run pseudo-cube with
 *         every source that exists there; t3 σ_ens + member quantiles from the dynamical.org IFS ENS.
 *   day0  (t1 only, before the data_run window) one slot per day at 00:00 carrying the day's 24 valid hours from the
 *         stitched day-0 series of every model; leads are an ASSUMPTION (the run is not exposed): the latest run of
 *         the model's cadence at or before the valid hour (V4 (c) measures it in the overlap).
 *   dyn   (t2/t3 before the data_run window) dynamical.org AIFS single + the IFS ENS CONTROL as the ifs_hres
 *         stand-in (+ ICON-EU from 2026-02-10); t3 σ_ens from the ENS members.
 *
 * Value rules = the producer's (build-point-cube.mjs): per source the block mean (float32, as the producer's
 * sampled grid), equal-weight mean over the sources with a finite value, σ_div = Bessel spread (n ≥ 2), srcCount =
 * sources with ANY target value at (step, cell), hModEff = mean of the hmodel columns of those sources (fallback all
 * columns), pressure planes = mean over the sources carrying the level, σ_ens/q10/q90 = ensembleStats.mjs on the
 * members (t2m/precip 50, wind 24 — ecmwfEns.mjs), quantize() on the FINAL value only.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CUBE_PLANES, TIER_BY_ID, quantize, planeIndex, MISSING, dequantize } from '../../src/point/cubeFormat.ts';
import { SOURCE_BY_ID } from '../../src/point/sourceMatrix.ts';
import { TRUTH_SCALES } from '../punktarchiv/lib/punktarchiv.mjs';
import { memberSpread, memberQuantiles } from '../point/adapters/ensembleStats.mjs';
import { HINDCAST_ROOT, H, TIER_SOURCES, ABSENT_BY_TIER, PAP3_PLANES, codeHash, parseArgs, pad2 } from './lib/common.mjs';
import { loadTierCells, loadExtract } from './lib/cellsio.mjs';
import { OM_VAR, DYN_VAR, dewPointFromRh, psFromMsl, omRun, omSeries, dynRun, hsurfAt, cacheStats, trackBegin, trackEnd } from './lib/store.mjs';

export const SLOT_SCHEMA = 1;
export const SLOT_KIND = 'hindcast/slot';
export const PRODUCER = 'buscosun-web/scripts/hindcast/build-slots.mjs';
const PLANE_ORDER = CUBE_PLANES.map((p) => p.id);
const TARGET_VARS = CUBE_PLANES.filter((p) => p.kind === 'mean' && p.group === 'target').map((p) => p.id);
const PRESSURE = [['t925', 't', 925], ['t850', 't', 850], ['t700', 't', 700], ['rh925', 'rh', 925], ['rh850', 'rh', 850], ['rh700', 'rh', 700]];
const ALL12 = ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps', 'snowlmt', 'clcl', 'clcm', 'clch'];
const ECMWF8 = ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps'];

/**
 * How the hindcast serves each cube source. `om` Open-Meteo model, `dyn` dynamical dataset, cadences of the runs,
 * `ownStepH` the producer's read raster in the source's own lead space (meteoswiss.mjs: ICON-CH 3-hourly),
 * `plevels` which pressure planes the producer takes from it (dwdRegular/ecmwf PL tables; ICON-D2 has no 925).
 */
export const IMPL = Object.freeze({
  icon_d2: { om: 'dwd_icon_d2', cadenceH: 3, vars: ALL12, plevels: { t: [850, 700], rh: [850, 700] } },
  icon_eu: { om: 'dwd_icon_eu', cadenceH: 3, vars: ALL12, plevels: { t: [925, 850, 700], rh: [925, 850, 700] },
    dyn: 'icon-eu', dynCadenceH: 6, dynVars: ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'ps', 'clcl', 'clcm', 'clch'], dynPlevels: { t: [], rh: [] } },
  icon_ch1_eps: { om: 'meteoswiss_icon_ch1', cadenceH: 3, ownStepH: 3, vars: ALL12, plevels: { t: [], rh: [] } },
  icon_ch2_eps: { om: 'meteoswiss_icon_ch2', cadenceH: 6, ownStepH: 3, vars: ALL12, plevels: { t: [], rh: [] } },
  icon_global: { om: 'dwd_icon', cadenceH: 6, vars: ALL12.filter((v) => v !== 'snowlmt'), plevels: { t: [925, 850, 700], rh: [925, 850, 700] } },
  ifs_hres: { om: 'ecmwf_ifs025', cadenceH: 6, vars: ECMWF8, plevels: { t: [925, 850, 700], rh: [925, 850, 700] },
    dyn: 'ifs-ens', dynMember: 0, dynCadenceH: 24, dynVars: ECMWF8, dynPlevels: { t: [925, 850], rh: [] } },
  aifs_single: { om: 'ecmwf_aifs025_single', cadenceH: 6, vars: ECMWF8, plevels: { t: [925, 850, 700], rh: [] },
    dyn: 'aifs', dynCadenceH: 6, dynVars: ECMWF8, dynPlevels: { t: [925, 850], rh: [] } },
  ifs_ens: { dyn: 'ifs-ens', dynCadenceH: 24, ensemble: true },
});
/** Source run offsets observed in the live cube (archive slots 14.–17.09.2026, cube[t].sources[].offsetH). */
export const LAG_H = Object.freeze({
  t1: { icon_d2: 0, icon_ch1_eps: 3, icon_eu: 3, ifs_hres: 6, aifs_single: 6 },
  t2: { icon_eu: 0, icon_ch2_eps: 0, icon_global: 0, ifs_hres: 6, aifs_single: 6 },
  t3: { icon_global: 0, ifs_hres: 0, aifs_single: 0, ifs_ens: 0 },
});
/**
 * Which sources the producer takes the pressure planes from, per tier (the live cube's own record: archive slots
 * cube[t].provenance.pressure.sources, 14.–18.09.2026). ICON global and ICON-CH carry levels on Open-Meteo, but the
 * producer never reads them there — found by V4 on 19.09. (t2/t3 pressure planes 5–35 % within one step before).
 * t3 took only 850 hPa until the E-E-4 go-live on 16.09.; the hindcast carries all three levels throughout.
 */
export const PRESSURE_SOURCES = Object.freeze({
  t1: ['icon_d2', 'icon_eu', 'ifs_hres', 'aifs_single'],
  t2: ['icon_eu', 'ifs_hres', 'aifs_single'],
  t3: ['ifs_hres', 'aifs_single'],
});
/** Member sets of the producer's IFS-ENS adapter (ecmwfEns.mjs: pf 1…50, wind 24, no control). */
const ENS_MEMBERS = { t2m: 50, precip: 50, u10: 24, v10: 24 };
const ENS_RASTER_H = 48;
/**
 * First pseudo-run of the run route: Open-Meteo `data_run` held 2026-06-16 21z (ICON-EU) / 06-17 00z (the rest) as
 * its oldest runs when the archive was pulled (19.09.2026, retention ≈ 3 months). Before it: day-0 (t1) and dyn (t2/t3).
 */
export const RUN_WINDOW_FROM = Date.parse('2026-06-17T00:00:00Z');
const DAY0_CADENCE_H = { icon_d2: 3, icon_eu: 3, icon_ch1_eps: 3, ifs_hres: 6, aifs_single: 6 };


// ─── source runs for one pseudo-run ─────────────────────────────────────────
function sourceRunFor(id, route, initMs) {
  const impl = IMPL[id];
  if (route === 'run' && impl.om) return omRun(impl.om, initMs);
  if (route === 'dyn' && impl.dyn) return dynRun(impl.dyn, initMs);
  return null;
}
function horizonOf(sr) {
  if (!sr) return null;
  if (sr.route === 'run') return sr.horizonH();
  if (sr.route === 'dyn') return sr.horizonH();
  return null;
}

/**
 * Run choice: the latest run of the source with init ≤ R − lag that exists in the cache and carries the tier's first
 * hour. The lags (LAG_H) are read off the live cube (archive slots 14.–17.09.: t1 ICON-EU/ICON-CH1 R−3, IFS/AIFS
 * R−6…R−9; t2 IFS/AIFS R−6; t3 all R) and reproduce every run the live cube chose there — including the 30-h
 * ICON-EU runs 03/09/15/21 UTC that the producer takes in t1 although chooseRun would prefer a longer run (V-HC-4:
 * the registry says 48 h for these runs, Open-Meteo carries 30 h, the live cube read 28 steps).
 */
function chooseRunHC(id, tierId, R, route) {
  const impl = IMPL[id];
  const tier = TIER_BY_ID[tierId];
  const cad = (route === 'dyn' ? impl.dynCadenceH : impl.cadenceH) * H;
  if (!cad) return null;
  const latest = Math.floor((R - (LAG_H[tierId][id] ?? 0) * H) / cad) * cad;
  for (let b = 0; b <= 8; b++) {
    const c = latest - b * cad;
    const sr = sourceRunFor(id, route, c);
    if (!sr || !sr.has(route === 'dyn' ? DYN_VAR.t2m : OM_VAR.t2m)) continue;
    const h = horizonOf(sr);
    if (h != null && h + (c - R) / H >= tier.leadHours[0]) return { sr, initMs: c, probe: b === 0 ? 'latest' : `back${b}` };
  }
  return null;
}

// ─── one quantity of one source at one cube cell ─────────────────────────────
function omQuantity(sr, model, varId, K, t, dtH) {
  const raw = (v, k, tt) => sr.raw(v, k, tt);
  if (varId === 'precip') {
    // sums of the steps inside (t − Δ, t]; t − Δ must be a step (or the run start); Open-Meteo stores the sum over
    // the preceding step (runs lack step 0 of precipitation — the run start counts as the reference)
    let steps;
    if (sr.route === 'run') {
      const all = sr.steps(OM_VAR.precip);
      if (!all.length) return null;
      const set = sr.stepSet(OM_VAR.precip);
      const from = t - dtH * H;
      if (!set.has(t) || !(set.has(from) || from === sr.initMs)) return null;
      steps = all.filter((s) => s > from && s <= t);
    } else {
      const st = sr.stepSeconds(OM_VAR.precip) * 1000;
      if (!st || (t % st) || ((t - dtH * H) % st)) return null;
      steps = []; for (let s = t - dtH * H + st; s <= t; s += st) steps.push(s);
    }
    let sum = 0, n = 0;
    for (const k of K) {
      let acc = 0, ok = true;
      for (const s of steps) { const v = raw(OM_VAR.precip, k, s); if (v == null) { ok = false; break; } acc += v; }
      if (!ok) continue;
      sum += acc / dtH; n++;
    }
    return n ? Math.max(0, Math.fround(sum / n)) : null;
  }
  let sum = 0, n = 0;
  const hs = varId === 'ps' ? hsurfAt(model) : null;
  const hasPs = varId === 'ps' && sr.has?.(OM_VAR.ps);
  for (const k of K) {
    let v;
    if (varId === 'td2m') v = dewPointFromRh(raw(OM_VAR.t2m, k, t) ?? NaN, raw(OM_VAR.rh2m, k, t) ?? NaN);
    else if (varId === 'ps') v = hasPs ? (raw(OM_VAR.ps, k, t) ?? NaN) : psFromMsl(raw(OM_VAR.msl, k, t) ?? NaN, raw(OM_VAR.t2m, k, t) ?? NaN, hs?.[k] ?? NaN);
    else v = raw(OM_VAR[varId], k, t) ?? NaN;
    if (!Number.isFinite(v) || !plausible(varId, v)) continue;
    sum += v; n++;
  }
  return n ? Math.fround(sum / n) : null;
}
function dynPrecip(sr, k, t, dtH, mi) {
  const all = sr.steps(DYN_VAR.precip);
  const set = sr.stepSet(DYN_VAR.precip);
  const from = t - dtH * H;
  if (!set.has(t) || !(set.has(from) || from === sr.initMs)) return null;
  let acc = 0, prev = from;
  for (const s of all) {
    if (s <= from || s > t) continue;
    const r = sr.raw(DYN_VAR.precip, k, s, mi);
    if (r == null) return null;
    acc += r * 3600 * ((s - prev) / H);   // kg m−2 s−1 averaged over the step → mm
    prev = s;
  }
  return acc / dtH;
}
function dynQuantity(sr, varId, K, t, dtH, mi = 0) {
  let sum = 0, n = 0;
  for (const k of K) {
    let v;
    if (varId === 'precip') v = dynPrecip(sr, k, t, dtH, mi);
    else if (varId === 'ps') { const p = sr.raw(DYN_VAR.ps, k, t, mi); v = p == null ? null : p / 100; }
    else v = sr.raw(DYN_VAR[varId], k, t, mi);
    if (v == null || !Number.isFinite(v) || !plausible(varId, v)) continue;
    sum += v; n++;
  }
  if (!n) return null;
  const m = Math.fround(sum / n);
  return varId === 'precip' ? Math.max(0, m) : m;
}
/**
 * Cloud cover is a share of the sky: 0…100 % by definition, so a value outside that cannot be one and is dropped
 * like an absent value (the source then simply does not carry the plane, srcCount says so). Measured 23.09.: the
 * Open-Meteo day-0 series of AIFS carries 2025-11-21…29 on a 0…10000 basis (chunk_1134, scale 1 as everywhere
 * else) — the untested mean put 2 573 % into a slot and its σ_div overflowed the plane to MISSING, which is how
 * V3 (b) found it (V-HC-30). Deliberately ONLY cloud cover: relative humidity over 100 % (supersaturation,
 * spectral ringing at ECMWF: −7…129) and a negative snowfall height (snow line below sea level) are legitimate
 * model output and are NOT clipped — clipping them would destroy information.
 */
const CLOUD = new Set(['clct', 'clcl', 'clcm', 'clch']);
function plausible(varId, v) { return !CLOUD.has(varId) || (v >= -0.5 && v <= 100.5); }
function quantityOf(src, varId, K, t, dtH) {
  if (src.sr.route === 'dyn') return dynQuantity(src.sr, varId, K, t, dtH, src.member ?? 0);
  return omQuantity(src.sr, src.model, varId, K, t, dtH);
}

/**
 * All quantities of one source at one valid time, as getters over extract indices K (block mean, float32 like the
 * producer's sampled grid; precipitation clamped at 0 after the mean). Column readers are resolved once per
 * (source, variable, step).
 */
function accessorsFor(s, t, dtH) {
  const sr = s.sr;
  const dyn = sr.route === 'dyn';
  const mi = s.member ?? 0;
  const col = (name, at = t) => (dyn ? sr.col(name, at, mi) : sr.col(name, at));
  const memo = new Map();
  const precipGetter = () => {
    const name = dyn ? DYN_VAR.precip : OM_VAR.precip;
    const from = t - dtH * H;
    let stepTimes;
    if (sr.route === 'series') {
      const st = sr.stepSeconds(name) * 1000;
      if (!st || (t % st) || (from % st)) return null;
      stepTimes = []; for (let x = from + st; x <= t; x += st) stepTimes.push(x);
    } else {
      const set = sr.stepSet(name);
      if (!set.size || !set.has(t) || !(set.has(from) || from === sr.initMs)) return null;
      stepTimes = sr.steps(name).filter((x) => x > from && x <= t);
    }
    const cols = stepTimes.map((x) => col(name, x));
    if (!cols.length || cols.some((c) => !c)) return null;
    // Open-Meteo: mm over the preceding step; dynamical: kg m−2 s−1 averaged over the preceding step
    const w = dyn ? stepTimes.map((x, i) => 3600 * ((x - (i ? stepTimes[i - 1] : from)) / H)) : stepTimes.map(() => 1);
    return (k) => { let a = 0; for (let i = 0; i < cols.length; i++) { const v = cols[i](k); if (v == null) return null; a += v * w[i]; } return a / dtH; };
  };
  const getter = (varId) => {
    if (memo.has(varId)) return memo.get(varId);
    let g = null;
    if (varId === 'precip') g = precipGetter();
    else if (dyn) {
      const c = DYN_VAR[varId] ? col(DYN_VAR[varId]) : null;
      g = c && varId === 'ps' ? (k) => { const p = c(k); return p == null ? null : p / 100; } : c;
    } else if (varId === 'td2m') {
      const ct = col(OM_VAR.t2m), cr = col(OM_VAR.rh2m);
      if (ct && cr) g = (k) => { const a = ct(k), b = cr(k); if (a == null || b == null) return null; const d = dewPointFromRh(a, b); return Number.isFinite(d) ? d : null; };
    } else if (varId === 'ps') {
      const cp = col(OM_VAR.ps);
      if (cp) g = cp;
      else {
        const cm = col(OM_VAR.msl), ct = col(OM_VAR.t2m), hs = hsurfAt(s.model);
        if (cm && ct && hs) g = (k) => { const m = cm(k), T = ct(k); if (m == null || T == null) return null; const v = psFromMsl(m, T, hs[k] ?? NaN); return Number.isFinite(v) ? v : null; };
      }
    } else if (OM_VAR[varId]) g = col(OM_VAR[varId]);
    memo.set(varId, g);
    return g;
  };
  return {
    value(varId, K) {
      const g = getter(varId); if (!g) return null;
      let sum = 0, n = 0;
      for (const k of K) { const v = g(k); if (v == null || !Number.isFinite(v) || !plausible(varId, v)) continue; sum += v; n++; }
      if (!n) return null;
      const m = Math.fround(sum / n);
      return varId === 'precip' ? Math.max(0, m) : m;
    },
  };
}

// ─── one tier of one pseudo-run ─────────────────────────────────────────────
const cellsMemo = new Map();
function tierCells(tierId) { if (!cellsMemo.has(tierId)) cellsMemo.set(tierId, loadTierCells(tierId)); return cellsMemo.get(tierId); }
const extractMemo = new Map();
function extractIdx(grid) { if (!extractMemo.has(grid)) extractMemo.set(grid, loadExtract(grid)); return extractMemo.get(grid); }

/**
 * @returns the tier block of a slot, or null when the lead source has no data.
 * `plan` = { route, R (publish init ms or day start), validAtMs[], leadHours[] | null, sources: [{id, sr, initMs,
 * offsetH, role, member?, standIn?}] , ens: {sr, initMs, offsetH} | null }
 */
function buildTier(tierId, plan, used) {
  const tc = tierCells(tierId);
  const tier = TIER_BY_ID[tierId];
  const nt = plan.validAtMs.length;
  const dtH = tier.stepH;
  const srcs = plan.sources;
  // cube cell → planes (Int16Array per plane id); loops: step → source → cell (column readers resolved once per step)
  const perSourceSteps = Object.fromEntries(srcs.map((s) => [s.id, new Set()]));
  const cellEntries = Object.entries(tc.cells);
  const cellPlanes = new Map(cellEntries.map(([key]) => [key, Object.fromEntries(PLANE_ORDER.map((id) => [id, new Int16Array(nt).fill(MISSING)]))]));
  const meta = Object.fromEntries(PLANE_ORDER.map((id) => [id, CUBE_PLANES[planeIndex(id)]]));
  for (let it = 0; it < nt; it++) {
    const t = plan.validAtMs[it];
    const accs = srcs.map((s) => (s.carries(t) ? accessorsFor(s, t, dtH) : null));
    for (const [key, cell] of cellEntries) {
      const planes = cellPlanes.get(key);
      const hmCols = cell.hmodel ?? {};
      const sums = {}; const bySrcMask = new Set();
      const pres = {};
      for (let si = 0; si < srcs.length; si++) {
        const s = srcs[si], acc = accs[si];
        if (!acc) continue;
        const rec = cell.sources[s.id];
        if (!rec?.covered || !rec.store?.length) continue;
        const K = (rec._K ??= rec.store.map(([r, c]) => extractIdx(s.grid).idx.get(`${r}_${c}`)));
        let any = false;
        for (const v of s.vars) {
          const q = acc.value(v, K);
          if (q == null || !Number.isFinite(q)) continue;
          (sums[v] ??= []).push(q);
          any = true;
        }
        if (any) { bySrcMask.add(s.id); perSourceSteps[s.id].add(it); }
        for (const [pid, kind, hPa] of PRESSURE) {
          if (!s.plevels[kind]?.includes(hPa)) continue;
          const q = acc.value(pid, K);
          if (q == null || !Number.isFinite(q)) continue;
          (pres[pid] ??= []).push(q);
        }
      }
      for (const v of TARGET_VARS) {
        const arr = sums[v]; if (!arr?.length) continue;
        let n = 0, sum = 0, sumsq = 0;
        for (const x of arr) { n++; sum += x; sumsq += x * x; }
        planes[v][it] = quantize(sum / n, meta[v]);
        const sdId = `${v}_sd`;
        if (planes[sdId] && n >= 2) planes[sdId][it] = quantize(Math.sqrt(Math.max(0, (sumsq - (sum * sum) / n) / (n - 1))), meta[sdId]);
      }
      for (const [pid] of PRESSURE) {
        const arr = pres[pid]; if (!arr?.length) continue;
        let s2 = 0; for (const x of arr) s2 += x;
        planes[pid][it] = quantize(s2 / arr.length, meta[pid]);
      }
      if (bySrcMask.size) planes.srcCount[it] = quantize(bySrcMask.size, meta.srcCount);
      // hModEff: mean of the hmodel columns of the contributing sources, else of all columns (build-point-cube.mjs)
      let n = 0, sum = 0;
      for (const id of bySrcMask) { const h = hmCols[id]; if (h != null && Number.isFinite(h)) { n++; sum += h; } }
      if (n === 0) { for (const h of Object.values(hmCols)) if (h != null && Number.isFinite(h)) { n++; sum += h; } }
      if (n > 0) planes.hModEff[it] = quantize(sum / n, meta.hModEff);
    }
  }
  // σ_ens + member quantiles (t3, IFS ENS members)
  let ensStat = null;
  if (plan.ens) {
    const { sr, offsetH } = plan.ens;
    const ex = extractIdx('ecmwf025');
    const keys = Object.keys(tc.cells).filter((k) => tc.cells[k].sources.ifs_ens?.covered);
    const Ks = keys.map((k) => ex.idx.get(`${tc.cells[k].sources.ifs_ens.store[0][0]}_${tc.cells[k].sources.ifs_ens.store[0][1]}`));
    const hours = [];
    for (let it = 0; it < nt; it++) {
      const t = plan.validAtMs[it];
      let served = false;
      for (const v of ['t2m', 'precip', 'u10', 'v10']) {
        const nm = ENS_MEMBERS[v];
        const members = sr.members(DYN_VAR[v]);
        if (!members.length) continue;
        const cur = new Map();
        for (let mi = 0; mi < members.length; mi++) {
          const m = members[mi];
          if (!(m >= 1 && m <= nm)) continue;
          const arr = new Float32Array(Ks.length).fill(NaN);
          for (let j = 0; j < Ks.length; j++) {
            let x = v === 'precip' ? dynPrecip(sr, Ks[j], t, dtH, mi) : sr.raw(DYN_VAR[v], Ks[j], t, mi);
            if (x == null || !Number.isFinite(x)) continue;
            if (v === 'precip' && x < 0) x = 0;   // the producer clamps the member difference at 0
            arr[j] = x;
          }
          cur.set(m, arr);
        }
        if (cur.size < 2) continue;
        const r = memberSpread(cur, null, { cells: Ks.length });
        const q = memberQuantiles(cur, null, { cells: Ks.length, probs: [0.1, 0.9] });
        const sdP = CUBE_PLANES[planeIndex(`${v}_sd_ens`)], q10P = CUBE_PLANES[planeIndex(`${v}_q10`)], q90P = CUBE_PLANES[planeIndex(`${v}_q90`)];
        for (let j = 0; j < keys.length; j++) {
          const pl = cellPlanes.get(keys[j]);
          if (Number.isFinite(r.sd[j])) {
            pl[`${v}_sd_ens`][it] = quantize(r.sd[j], sdP);
            if (pl.ensCount[it] === MISSING) pl.ensCount[it] = quantize(r.members, CUBE_PLANES[planeIndex('ensCount')]);
          }
          if (q10P && Number.isFinite(q.q[0.1][j])) pl[`${v}_q10`][it] = quantize(q.q[0.1][j], q10P);
          if (q90P && Number.isFinite(q.q[0.9][j])) pl[`${v}_q90`][it] = quantize(q.q[0.9][j], q90P);
        }
        served = true;
      }
      if (served) hours.push(plan.leadHours?.[it] ?? null);
    }
    ensStat = { source: 'ifs_ens', external: 'dynamical.org ecmwf-ifs-ens-forecast-15-day-0-25-degree', init: new Date(plan.ens.initMs).toISOString(), offsetH,
      members: { t2m: 'pf 1…50', precip: 'pf 1…50', u10: 'pf 1…24', v10: 'pf 1…24' }, hours,
      producerRasterH: ENS_RASTER_H,
      ifsEnsRasterHours: (plan.leadHours ?? []).filter((h) => (h + offsetH) % ENS_RASTER_H === 0),
      cubeByHour: 'Der Cube nimmt σ_ens je Stunde aus EINER Quelle (manifest ensemble.byHour): bei 144/168 h ICON-EPS global (t2m, 40 Member — nirgends frei archiviert), ab 192 h IFS-ENS auf dem 48-h-Raster. Der Hindcast schreibt IFS-ENS an jeder t3-Stunde; wer den Cube nachbilden will, nimmt nur ifsEnsRasterHours > 180 h (V4 vergleicht genau dort: 100 %).',
      note: 'σ_ens (ensembleStats.memberSpread) und q10/q90 (memberQuantiles, Typ 7) an JEDER t3-Stunde; der Producer schreibt nur das 48-h-Raster (Eigenvorlauf ≡ 0 mod 48) — für den Fit von c(p,f) ggf. auf leadH + offsetH ≡ 0 (mod 48) filtern. Kontrollauf (Member 0) ausgeschlossen wie im Producer (enfo-ef trägt ihn nicht).',
      precip: 'Rate über Δ = 6 h je Member aus den Schrittraten von dynamical (kg m−2 s−1 × Schrittlänge), negative Summen auf 0 — dieselbe Größe wie precip_sd_ens im Cube.' };
  }
  // per point
  const pap3 = new Set(PAP3_PLANES);
  const byPoint = {};
  for (const [id, p] of Object.entries(tc.points)) {
    if (!p) { byPoint[id] = null; continue; }
    const nearKey = `${p.cell.iy}_${p.cell.ix}`;
    const np = cellPlanes.get(nearKey);
    const planes = {}, empty = [];
    for (const pid of PLANE_ORDER) { const a = np[pid]; if (a.some((q) => q !== MISSING)) planes[pid] = Array.from(a); else empty.push(pid); }
    const hFirst = np.hModEff.find((q) => q !== MISSING);
    const block = p.block.map((b) => {
      const k = `${b.iy}_${b.ix}`;
      if (k === nearKey) return { iy: b.iy, ix: b.ix, dy: b.dy, dx: b.dx, centre: b.centre, distKm: b.distKm, chunk: b.chunk, sameChunk: b.sameChunk, planes: 'nearest' };
      const cp = cellPlanes.get(k);
      const pl = {}, em = [];
      for (const pid of PAP3_PLANES) { const a = cp[pid]; if (a.some((q) => q !== MISSING)) pl[pid] = Array.from(a); else em.push(pid); }
      return { iy: b.iy, ix: b.ix, dy: b.dy, dx: b.dx, centre: b.centre, distKm: b.distKm, chunk: b.chunk, sameChunk: b.sameChunk, planes: pl, empty: em };
    });
    byPoint[id] = { cell: p.cell, chunk: p.chunk, hModEffM: hFirst == null ? null : dequantize(hFirst, CUBE_PLANES[planeIndex('hModEff')]), planes, empty, block };
  }
  return { cellCount: cellPlanes.size, byPoint, perSourceSteps, ensStat, pap3: pap3.size };
}

// ─── plans ───────────────────────────────────────────────────────────────────
function makeSource(id, tierId, chosen, publishMs, route) {
  const impl = IMPL[id];
  const grid = TIER_SOURCES[tierId].find((s) => s.id === id).grid;
  const offsetH = Math.round((publishMs - chosen.initMs) / H);
  const vars = route === 'dyn' ? impl.dynVars : impl.vars;
  const plevels = PRESSURE_SOURCES[tierId].includes(id) ? (route === 'dyn' ? impl.dynPlevels : impl.plevels) : { t: [], rh: [] };
  const stepsCache = new Map();
  return {
    id, grid, sr: chosen.sr, initMs: chosen.initMs, offsetH, route, model: impl.om ?? null, member: route === 'dyn' ? impl.dynMember ?? 0 : undefined,
    vars, plevels, probe: chosen.probe,
    /** does this source carry the valid time t (own lead raster, producer's ownStepH)? */
    carries(t) {
      if (!stepsCache.has(t)) {
        const own = (t - chosen.initMs) / H;
        let ok = own >= 0 && chosen.sr.steps(route === 'dyn' ? DYN_VAR.t2m : OM_VAR.t2m).includes(t);
        if (ok && impl.ownStepH && own % impl.ownStepH !== 0) ok = false;
        stepsCache.set(t, ok);
      }
      return stepsCache.get(t);
    },
  };
}

function planRun(tierId, R, route) {
  const tier = TIER_BY_ID[tierId];
  const chosen = [];
  for (const s of TIER_SOURCES[tierId]) {
    if (IMPL[s.id].ensemble) continue;
    if (route === 'dyn' && !IMPL[s.id].dyn) continue;
    const c = chooseRunHC(s.id, tierId, R, route);
    if (c) chosen.push([s.id, c]);
  }
  if (!chosen.length) return null;
  // The pseudo-run publishes at R, the sources carry their offsets (like the cube: runAt = R, offsetH per source).
  // Found by V4 (b) on 19.09.: with max(inits) the dyn route published at R − 6 h (no lag-0 source before ICON-EU
  // 2026-02-10), the whole lead axis sat 6 h early (t2 t2m MAE 3.8 K against the cube).
  const publishMs = R;
  const sources = chosen.map(([id, c]) => makeSource(id, tierId, c, publishMs, route));
  let ens = null;
  if (tierId === 't3') {
    const c = chooseRunHC('ifs_ens', tierId, R, 'dyn');
    if (c) ens = { sr: c.sr, initMs: c.initMs, offsetH: Math.round((publishMs - c.initMs) / H) };
  }
  return { route, R, publishMs, leadHours: [...tier.leadHours], validAtMs: tier.leadHours.map((h) => publishMs + h * H), sources, ens };
}

/**
 * A plan with EXPLICIT source runs (shadow.mjs: the runs the live cube recorded in an archive slot). `runs` maps a
 * cube source id to its init (ms); sources the hindcast cannot serve are skipped and reported by the caller.
 */
export function planFromRuns(tierId, publishMs, runs, route = 'run') {
  const tier = TIER_BY_ID[tierId];
  const sources = [];
  for (const s of TIER_SOURCES[tierId]) {
    if (IMPL[s.id].ensemble || !(s.id in runs)) continue;
    const sr = sourceRunFor(s.id, route, runs[s.id]);
    if (!sr || !sr.has(route === 'dyn' ? DYN_VAR.t2m : OM_VAR.t2m)) continue;
    sources.push(makeSource(s.id, tierId, { sr, initMs: runs[s.id], probe: 'archive' }, publishMs, route));
  }
  let ens = null;
  if (tierId === 't3' && runs.ifs_ens != null) {
    const sr = dynRun('ifs-ens', runs.ifs_ens);
    if (sr.has(DYN_VAR.t2m)) ens = { sr, initMs: runs.ifs_ens, offsetH: Math.round((publishMs - runs.ifs_ens) / H) };
  }
  if (!sources.length && !ens) return null;
  return { route, R: publishMs, publishMs, leadHours: [...tier.leadHours], validAtMs: tier.leadHours.map((h) => publishMs + h * H), sources, ens };
}
export { buildTier, planRun };
/**
 * Phase FL (E-FL-8, additive): the producer-faithful per-source readers for the case builder (`scripts/fusionfit/`).
 * Nothing above changes — the slots stay byte-identical (V3 (a)); the case builder recombines per-source values and
 * checks them against the slot plane (V-FF-1).
 */
export { accessorsFor, makeSource, planDay0, quantityOf };

function planDay0(dayMs) {
  const validAtMs = Array.from({ length: 24 }, (_, h) => dayMs + h * H);
  const sources = [];
  for (const s of TIER_SOURCES.t1) {
    const impl = IMPL[s.id];
    if (!impl.om) continue;
    const sr = omSeries(impl.om);
    if (!sr.has(OM_VAR.t2m)) continue;
    const cad = DAY0_CADENCE_H[s.id];
    sources.push({
      id: s.id, grid: s.grid, sr, initMs: null, offsetH: null, route: 'series', model: impl.om, vars: impl.vars, plevels: PRESSURE_SOURCES.t1.includes(s.id) ? impl.plevels : { t: [], rh: [] },
      carries(t) {
        if (sr.raw(OM_VAR.t2m, 0, t) == null) return false;
        // ICON-CH: the producer reads it 3-hourly in its own lead space; in the stitched series the lead is 0 only at run hours
        if (impl.ownStepH && ((t / H) % cad) !== 0) return false;
        return true;
      },
      leadRule: `Vorlauf = Gültigkeitszeit − letzter Lauf im ${cad}-h-Takt ≤ Gültigkeitszeit (Annahme: jeder Lauf wurde eingelesen)`,
      cadenceH: cad,
    });
  }
  if (!sources.length) return null;
  return { route: 'day0', R: dayMs, publishMs: null, leadHours: null, validAtMs, sources, ens: null };
}

// ─── slot assembly ──────────────────────────────────────────────────────────
function tierMeta(tierId, plan, built) {
  const tier = TIER_BY_ID[tierId];
  const leadClass = plan.route === 'day0' ? 'day0' : 'run';
  const sources = plan.sources.map((s) => ({
    id: s.id, external: s.route === 'dyn' ? `dynamical.org ${IMPL[s.id].dyn}${s.member != null ? ` member ${s.member}` : ''}` : `open-meteo ${s.model} ${s.route === 'series' ? 'data/ (Tag-0-Reihe)' : 'data_run/'}`,
    role: tier.diversity.includes(s.id) ? 'diversity' : 'assigned', run: s.initMs == null ? null : new Date(s.initMs).toISOString(), offsetH: s.offsetH,
    probe: s.probe ?? null, steps: built.perSourceSteps[s.id]?.size ?? 0, vars: s.vars, pressure: s.plevels, grid: s.grid,
    rule: TIER_SOURCES[tierId].find((x) => x.id === s.id).rule, ...(s.leadRule ? { leadRule: s.leadRule, cadenceH: s.cadenceH } : {}),
  }));
  const standIn = [];
  for (const s of plan.sources) {
    if (s.id === 'icon_global') standIn.push({ source: 'icon_global', standsFor: 'nächste ikosaedrische Zelle (Producer)', why: 'Open-Meteo führt ICON global nur auf 0,125° (CDO-Gewichte); genommen: der nächste 0,125°-Punkt' });
    if (s.id === 'icon_ch1_eps' || s.id === 'icon_ch2_eps') standIn.push({ source: s.id, standsFor: 'nächstes natives Dreieck (Producer)', why: 'Open-Meteo führt ICON-CH (Kontrolllauf) auf einem gedrehten Gitter (nn_weights); Zelle über die Orographie der hmodel-Spalte gewählt (V-HC-3), sonst der nächste Drehgitterpunkt' });
    if (s.route === 'dyn' && s.id === 'ifs_hres') standIn.push({ source: 'ifs_hres', standsFor: 'IFS HRES 0,25° Open Data (oper/scda)', why: 'vor dem data_run-Fenster gibt es IFS HRES nicht frei mit Vorlauf > 3 h; genommen: IFS-ENS-Kontrolllauf (Member 0, 00z) von dynamical.org' });
    if (s.route !== 'dyn' && s.vars.includes('td2m')) standIn.push({ plane: 'td2m', source: s.id, standsFor: 'td_2m/2d der Quelle', why: 'Open-Meteo speichert keinen Taupunkt (Inventar 19.09.): Magnus (a 17,62, b 243,12) aus t2m und relative_humidity_2m je Quellzelle — wie der Producer für C-LAEF' });
    if (s.route !== 'dyn' && s.vars.includes('ps')) standIn.push({ plane: 'ps', source: s.id, standsFor: 'ps der Quelle', why: 'Open-Meteo speichert Bodendruck nur bei IFS/AIFS bis 2025-05: aus pressure_msl, t2m und der Open-Meteo-HSURF der Quellzelle (barometrisch, Open-Meteos Form); wo surface_pressure vorliegt, wird er genommen' });
  }
  const absent = Object.entries(ABSENT_BY_TIER[tierId]).map(([id, why]) => ({ id, why }));
  for (const s of TIER_SOURCES[tierId]) if (!plan.sources.some((x) => x.id === s.id) && !(IMPL[s.id].ensemble && plan.ens)) absent.push({ id: s.id, why: `im Cache für diesen Pseudo-Lauf nicht vorhanden (Route ${plan.route})` });
  const perPlane = {};
  for (const v of TARGET_VARS) perPlane[v] = { sources: plan.sources.filter((s) => s.vars.includes(v)).map((s) => s.id), estimator: 'Gleichgewichtsmittel über die Quellen mit endlichem Wert (float32 je Quelle wie das Producer-Gitter)' };
  for (const v of TARGET_VARS) if (planeIndex(`${v}_sd`) >= 0) perPlane[`${v}_sd`] = { sources: perPlane[v].sources, estimator: 'Bessel-Streuung über die Quellen (n ≥ 2), build-point-cube.mjs consumeHour' };
  for (const [pid, kind, hPa] of PRESSURE) perPlane[pid] = { sources: plan.sources.filter((s) => s.plevels[kind]?.includes(hPa)).map((s) => s.id), estimator: 'Mittel über die Quellen, die genau diese Fläche führen' };
  perPlane.hModEff = { sources: ['point/static/hmodel/v1 (gepinnt)'], estimator: 'Mittel der hmodel-Spalten der tragenden Quellen je Schritt, sonst aller Spalten (V-PD-57)' };
  perPlane.srcCount = { sources: plan.sources.map((s) => s.id), estimator: 'Zahl der Quellen mit mindestens einer Zielgröße je (Schritt, Zelle)' };
  if (plan.ens) {
    for (const v of ['t2m', 'precip', 'u10', 'v10']) { perPlane[`${v}_sd_ens`] = { sources: ['ifs_ens'], estimator: 'ensembleStats.memberSpread' }; perPlane[`${v}_q10`] = perPlane[`${v}_q90`] = { sources: ['ifs_ens'], estimator: 'ensembleStats.memberQuantiles (Typ 7)' }; }
    perPlane.ensCount = { sources: ['ifs_ens'], estimator: 'Zahl der Member der t2m-Streuung (50)' };
  }
  return {
    route: plan.route, run: plan.publishMs == null ? null : new Date(plan.publishMs).toISOString().slice(0, 13).replace(/[-T]/g, ''),
    runAt: plan.publishMs == null ? null : new Date(plan.publishMs).toISOString(), leadClass,
    leadHours: plan.leadHours, validAtMs: plan.validAtMs, planeOrder: PLANE_ORDER, pap3Planes: PAP3_PLANES,
    sources, standIn, assignedAbsent: absent,
    provenance: { class: 'hindcast', perPlane, missingByDesign: 'Profilebenen (gammaEff zBase zInv dTInv: keine Modelllevel frei), t1/t2 σ_ens und q10/q90 (ICON-D2-/ICON-EU-EPS, C-LAEF-EPS nicht frei archiviert), in t1/t2 ensCount' },
    ...(leadClass === 'day0' ? { leads: plan.sources.map((s) => ({ id: s.id, cadenceH: s.cadenceH, rule: s.leadRule })), leadNote: 'Tag-0-Reihe: der Lauf wird nicht mitgeliefert. Vorlauf je Stunde = Stunde − letzter Lauf im Takt der Quelle (Intervall [0, Takt − 1] h, Niederschlag der ICON-Familie bis Takt h, weil dem Lauf der Schritt 0 fehlt). V4 (c) misst im Überlappungsfenster, ob der Wert der Reihe dem Lauf floor(Stunde) entspricht. Der Fit bint diese Fälle als 0–6 h.' } : {}),
    ensemble: built.ensStat,
    byPoint: built.byPoint,
  };
}

function truthPointer(validAtMs) {
  const days = [...new Set(validAtMs.map((t) => new Date(t).toISOString().slice(0, 10)))];
  return { pointer: days.map((d) => `truth/${d}.json.gz`), fromMs: Math.min(...validAtMs), toMs: Math.max(...validAtMs),
    note: 'Wahrheit liegt je Tag in truth/<Tag>.json.gz (extract_truth.mjs); ein Fall zählt nur mit Stempel ≥ Lauf (t2/t3) bzw. = Gültigkeitsstunde (t1 Tag 0) — V6.' };
}

export function buildSlot(slotAtMs, plans) {
  const used = [];
  trackBegin();
  const slot = {
    schema: SLOT_SCHEMA, kind: SLOT_KIND, slotAt: new Date(slotAtMs).toISOString(), slotAtMs, createdAt: null, producer: PRODUCER, codeHash: codeHash(),
    sentinel: MISSING,
    scales: { cube: {}, truth: TRUTH_SCALES },
    external: { openmeteo: { licence: 'CC BY 4.0', bucket: 's3://openmeteo', models: {} }, dynamical: { licence: 'CC BY 4.0 + ECMWF Terms of Use', datasets: {} } },
    cube: {}, truth: null, stats: { errors: [], warnings: {}, timing: {}, bytes: null },
  };
  const valid = [];
  for (const [tierId, plan] of Object.entries(plans)) {
    if (!plan) continue;
    const t0 = Date.now();
    slot.scales.cube[tierId] = Object.fromEntries(CUBE_PLANES.map((p) => [p.id, { scale: p.scale, offset: p.offset, unit: p.unit }]));
    const built = buildTier(tierId, plan, used);
    slot.cube[tierId] = tierMeta(tierId, plan, built);
    for (const s of plan.sources) {
      if (s.route === 'dyn') {
        const ds = IMPL[s.id].dyn;
        (slot.external.dynamical.datasets[ds] ??= { inits: [], members: s.member != null ? [s.member] : null });
        const iso = new Date(s.initMs).toISOString(); if (!slot.external.dynamical.datasets[ds].inits.includes(iso)) slot.external.dynamical.datasets[ds].inits.push(iso);
      } else {
        const m = (slot.external.openmeteo.models[s.model] ??= { route: s.route, runs: [] });
        if (s.initMs != null) { const k = new Date(s.initMs).toISOString(); if (!m.runs.includes(k)) m.runs.push(k); }
      }
    }
    if (plan.ens) {
      const d = (slot.external.dynamical.datasets['ifs-ens'] ??= { inits: [], members: null });
      const iso = new Date(plan.ens.initMs).toISOString(); if (!d.inits.includes(iso)) d.inits.push(iso);
      d.membersUsed = { t2m: [1, 50], precip: [1, 50], u10: [1, 24], v10: [1, 24] };
    }
    valid.push(...plan.validAtMs);
    slot.stats.timing[tierId] = Date.now() - t0;
  }
  slot.truth = valid.length ? truthPointer(valid) : null;
  const touched = trackEnd();
  slot.createdAt = touched.length ? touched.sort().at(-1) : null;
  slot.stats.inputs = { files: touched.length };
  delete slot.stats.timing;   // wall time would break byte-identical rebuilds; it goes to the log instead
  return slot;
}

export function slotPath(slotAtMs, root = HINDCAST_ROOT) {
  const iso = new Date(slotAtMs).toISOString();
  return join(root, 'slots', iso.slice(0, 10), `${iso.slice(11, 13)}${iso.slice(14, 16)}.json.gz`);
}
export function serialise(slot) { return gzipSync(Buffer.from(JSON.stringify(slot), 'utf8'), { level: 9 }); }
function atomicWrite(abs, bytes) { mkdirSync(dirname(abs), { recursive: true }); const tmp = `${abs}.tmp-${process.pid}`; writeFileSync(tmp, bytes); renameSync(tmp, abs); }

/**
 * Which tiers and routes a pseudo-run R gets: data_run first, else day-0 (t1 at 00:00) / dynamical (t2/t3). The
 * route is ALWAYS this automatic choice — `routeWanted` only filters it (a slot path holds one slot per R, so a
 * day-0 or dyn slot inside the data_run window would shadow the run slot of the same R; found 19.09. on a test slot).
 */
export function plansFor(R, tiers, routeWanted = 'auto') {
  const hh = new Date(R).getUTCHours();
  const plans = {};
  const keep = (route) => routeWanted === 'auto' || routeWanted === route;
  // the route is a function of the DATE, never of what the cache holds right now (a run not yet pulled must not
  // turn a slot of the data_run window into a day-0/dyn slot — found 19.09. on 2026-09-19 12/18 UTC)
  const runWindow = R >= RUN_WINDOW_FROM;
  if (tiers.includes('t1')) {
    if (runWindow) { if (keep('run') && omRun('dwd_icon_d2', R).has(OM_VAR.t2m)) plans.t1 = planRun('t1', R, 'run'); }
    else if (hh === 0 && keep('day0')) plans.t1 = planDay0(R);
  }
  if (tiers.includes('t2') && hh % 6 === 0) {
    if (runWindow) { if (keep('run') && omRun('dwd_icon_eu', R).has(OM_VAR.t2m)) plans.t2 = planRun('t2', R, 'run'); }
    else if (keep('dyn')) plans.t2 = planRun('t2', R, 'dyn');
  }
  if (tiers.includes('t3') && hh % 12 === 0) {
    if (runWindow) { if (keep('run') && omRun('ecmwf_ifs025', R).has(OM_VAR.t2m)) plans.t3 = planRun('t3', R, 'run'); }
    else if (keep('dyn')) plans.t3 = planRun('t3', R, 'dyn');
  }
  for (const k of Object.keys(plans)) if (!plans[k]) delete plans[k];
  return plans;
}

/**
 * Completeness guard: which external stores a slot at R must have PULLED for its day (first dates on S3 / dynamical,
 * measured 18./19.09.). A store that has no cache file at all for the day was not pulled yet — building now would
 * write a degraded slot that a later run skips as "present". A single run missing upstream (a gap in data_run) is not
 * caught here and stays visible in the slot (`assignedAbsent`).
 */
const FIRST = (d) => Date.parse(`${d}T00:00:00Z`);
/** [store, cube source id (for cadence and lag), first date] per route and tier */
const EXPECT = {
  run: { t1: [['dwd_icon_d2', 'icon_d2'], ['dwd_icon_eu', 'icon_eu'], ['meteoswiss_icon_ch1', 'icon_ch1_eps'], ['ecmwf_ifs025', 'ifs_hres'], ['ecmwf_aifs025_single', 'aifs_single']],
    t2: [['dwd_icon_eu', 'icon_eu'], ['meteoswiss_icon_ch2', 'icon_ch2_eps'], ['dwd_icon', 'icon_global'], ['ecmwf_ifs025', 'ifs_hres'], ['ecmwf_aifs025_single', 'aifs_single']],
    t3: [['dwd_icon', 'icon_global'], ['ecmwf_ifs025', 'ifs_hres'], ['ecmwf_aifs025_single', 'aifs_single'], ['dyn-ifs-ens', 'ifs_ens', FIRST('2024-04-01')]] },
  day0: { t1: [['dwd_icon_d2', 'icon_d2', FIRST('2023-05-24')], ['dwd_icon_eu', 'icon_eu', FIRST('2023-05-24')], ['ecmwf_ifs025', 'ifs_hres', FIRST('2024-01-26')], ['ecmwf_aifs025_single', 'aifs_single', FIRST('2025-02-06')], ['meteoswiss_icon_ch1', 'icon_ch1_eps', FIRST('2025-07-02')]] },
  dyn: { t2: [['dyn-aifs', 'aifs_single', FIRST('2024-04-02')], ['dyn-ifs-ens', 'ifs_hres', FIRST('2024-04-02')], ['dyn-icon-eu', 'icon_eu', FIRST('2026-02-11')]],
    t3: [['dyn-aifs', 'aifs_single', FIRST('2024-04-01')], ['dyn-ifs-ens', 'ifs_ens', FIRST('2024-04-01')]] },
};
const listMemo = new Map();
function cacheKeys(store, route) {
  const k = `${store}|${route}`;
  if (!listMemo.has(k)) {
    const dir = store.startsWith('dyn-') ? join(HINDCAST_ROOT, 'cache', store, DYN_VAR.t2m) : join(HINDCAST_ROOT, 'cache', store, OM_VAR.t2m, route);
    let keys = [];
    try { keys = readdirSync(dir).filter((f) => f.endsWith('.hcv.gz')).map((f) => f.replace('.hcv.gz', '')); } catch { /* none */ }
    listMemo.set(k, new Set(keys));
  }
  return listMemo.get(k);
}
function dayPulled(store, route, dayMs) {
  if (route === 'series') {
    const keys = cacheKeys(store, 'series');
    // any chunk file whose index covers the day (chunk length from the store's own files)
    const L = SERIES_CHUNK_S[store]; if (!L) return false;
    return keys.has(`chunk_${Math.floor(dayMs / 1000 / L)}`) && keys.has(`chunk_${Math.floor((dayMs / 1000 + 86399) / L)}`);
  }
  const ymd = new Date(dayMs).toISOString().slice(0, 10).replace(/-/g, '');
  for (const k of cacheKeys(store, route)) if (k.startsWith(ymd)) return true;
  return false;
}
/** chunk_time_length × temporal_resolution per model (meta.json, verified by V3 (c)) */
const SERIES_CHUNK_S = { dwd_icon_d2: 121 * 3600, dwd_icon_eu: 193 * 3600, dwd_icon: 253 * 3600, ecmwf_ifs025: 104 * 10800, ecmwf_aifs025_single: 72 * 21600, meteoswiss_icon_ch1: 48 * 3600, meteoswiss_icon_ch2: 144 * 3600 };
export function incompleteFor(R, plans) {
  const day = Math.floor(R / (24 * H)) * 24 * H;
  const missing = [];
  for (const [t, plan] of Object.entries(plans)) {
    const route = plan.route;
    for (const [store, id, from] of EXPECT[route]?.[t] ?? []) {
      if (from != null && day < from) continue;
      const r = route === 'day0' ? 'series' : store.startsWith('dyn-') ? 'dyn' : 'run';
      let need = day;
      if (r !== 'series') {
        // the day of the run chooseRunHC starts from: floor((R − lag) / cadence) — a lagged source sits on the previous day
        const impl = IMPL[id];
        const cad = (r === 'dyn' ? impl.dynCadenceH : impl.cadenceH) * H;
        need = Math.floor((Math.floor((R - (LAG_H[t][id] ?? 0) * H) / cad) * cad) / (24 * H)) * 24 * H;
      } else if (!dayPulled(store, r, day - H)) { missing.push(`${t}:${store}@${new Date(day - H).toISOString().slice(0, 13)}`); continue; }
      if (!dayPulled(store, r, need)) missing.push(`${t}:${store}@${new Date(need).toISOString().slice(0, 10)}`);
    }
  }
  return missing;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const from = Date.parse(`${flags.from}T00:00:00Z`), to = Date.parse(`${flags.to}T00:00:00Z`);
  const hours = flags.hours ? String(flags.hours).split(',').map(Number) : [0, 3, 6, 9, 12, 15, 18, 21];
  const tiers = flags.tiers ? String(flags.tiers).split(',') : ['t1', 't2', 't3'];
  const route = flags.route ?? 'auto';
  const logPath = join(HINDCAST_ROOT, 'log', `build-slots-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  mkdirSync(dirname(logPath), { recursive: true });
  let n = 0, skipped = 0, bytes = 0, incomplete = 0;
  for (let d = from; d <= to; d += 24 * H) {
    for (const hh of hours) {
      const R = d + hh * H;
      const out = slotPath(R);
      if (existsSync(out) && !flags.force) { skipped++; continue; }
      const t0 = Date.now();
      const plans = plansFor(R, tiers, route);
      if (!Object.keys(plans).length) continue;
      const miss = incompleteFor(R, plans);
      if (miss.length && !flags['allow-incomplete']) {
        incomplete++;
        writeFileSync(logPath, `${JSON.stringify({ slot: new Date(R).toISOString(), skipped: 'incomplete', missing: miss })}\n`, { flag: 'a' });
        continue;
      }
      const slot = buildSlot(R, plans);
      const buf = serialise(slot);
      atomicWrite(out, buf);
      n++; bytes += buf.length;
      const rec = { slot: slot.slotAt, tiers: Object.fromEntries(Object.entries(slot.cube).map(([t, c]) => [t, { route: c.route, run: c.run, sources: c.sources.map((s) => `${s.id}${s.offsetH != null ? `+${s.offsetH}` : ''}`) }])), bytes: buf.length, ms: Date.now() - t0, cache: { ...cacheStats } };
      writeFileSync(logPath, `${JSON.stringify(rec)}\n`, { flag: 'a' });
      console.log(`[slots] ${slot.slotAt} ${Object.entries(rec.tiers).map(([t, x]) => `${t}:${x.route}${x.run ? `@${x.run}` : ''}[${x.sources.join(' ')}]`).join(' ')} · ${(buf.length / 1048576).toFixed(2)} MiB · ${rec.ms} ms`);
    }
  }
  console.log(`[slots] ${n} geschrieben, ${skipped} vorhanden, ${incomplete} unvollständig übersprungen · ${(bytes / 1048576).toFixed(1)} MiB · Log ${logPath}`);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-slots.mjs')) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
