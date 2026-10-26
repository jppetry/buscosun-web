#!/usr/bin/env node
/**
 * Phase FB — fit and backtest of „buscosun Fusion — Fahrbahn" (model FB-1, `src/road/roadSurface.ts`) on the archive
 * `jppetry/buscosun-archiv` (`audit/autobahn-fahrbahn.md` §4; rule frozen in `audit/autobahn-fahrbahn/backtest-regel.md`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/road/road-surface-backtest.mjs \
 *     --archive=<clone of buscosun-archiv> [--split=2026-10-18] [--out=audit/autobahn-fahrbahn] [--table=<surface.json>]
 *     [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--boot=1000] [--decay=lead|tau]   (form of the production table, E-FB-9)
 *
 * Pairs: run × station × lead 0 … 6, truth = the station's road temperature at the full hour t0 + h (`road/v1` half days),
 * forecast = the archived run (`road/fc/v1`, station points). A pair needs a valid road AND air measurement at t0 (the
 * anomaly), the forecast air at lead 0 and at lead h, and the truth. Fit on runs with t0 < split, score on t0 ≥ split;
 * the table that goes to production is fitted on ALL runs with the τ of the training fit (rule §4). Pure functions
 * (`readObsArchive`, `readFcArchive`, `buildPairs`, `fitSurfaceTable`, `scoreSurface`, `gateOf`) — `verify:road-surface`
 * runs them on a synthetic archive with known truth. No clock inside the fit or the score; `builtAt` of the table is the
 * only timestamp and comes from the caller.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  ROAD_SURFACE_HORIZON_H, ROAD_SURFACE_TAU_GRID_H, ROAD_SURFACE_BIAS_SHRINK_N, ROAD_SURFACE_COLD_C, ROAD_SURFACE_MODEL, ROAD_SURFACE_TABLE_SCHEMA, ROAD_SURFACE_FIT_MAX_ABS_K,
  roadSurfacePredictors, roadSurfaceWet, roadSurfaceColdProb, roadSurfaceTableProblems,
} from '../../src/road/roadSurface.ts';
import { roadFcDecode, roadFcStampToMs } from '../../src/road/roadFc.ts';
import { roadStampToMs, ROAD_CLASS_CODE } from '../../src/road/roadContract.ts';

const H = 3_600_000;
export const SURFACE_SPLIT_DEFAULT = '2026-10-18';
export const SURFACE_LEADS_SCORED = Object.freeze([1, 3, 6]);
export const SURFACE_BOOT_N = 1000;
/** Alternating passes of the fit (climatology ↔ station bias): 8 — the exact linear probe (verify C2b) is within 0,03 K after 8, within 0,1 K after 3. */
export const SURFACE_FIT_PASSES = 8;
/** Gate D-K needs at least this many cold events per scored lead in the test window (rule §4 Nr. 2). */
export const SURFACE_MIN_EVENTS = 100;
const HORIZON = ROAD_SURFACE_HORIZON_H;

// --- archive readers -------------------------------------------------------------------------------

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Half days of `road/v1` → per station the FULL-HOUR values on an hour grid from `originMs` (index = hours since origin):
 * `rs`, `ta`, `td` (NaN = none) and `cold` (1 when the archived class is frost/ice, 0 otherwise, 255 = no point).
 */
export function readObsArchive(dir, { fromDay = null, toDay = null } = {}) {
  const days = readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!fromDay || d >= fromDay) && (!toDay || d <= toDay)).sort();
  if (!days.length) throw new Error(`keine Tage unter ${dir}`);
  const originMs = Date.parse(`${days[0]}T00:00:00Z`);
  const hours = Math.round((Date.parse(`${days[days.length - 1]}T00:00:00Z`) - originMs) / H) + 24 + 1;
  const stations = new Map();
  const get = (id, s) => {
    let st = stations.get(id);
    if (!st) {
      st = { id, lat: s.lat, lon: s.lon, h: s.h ?? null, rs: new Float32Array(hours).fill(NaN), ta: new Float32Array(hours).fill(NaN), td: new Float32Array(hours).fill(NaN), cold: new Uint8Array(hours).fill(255) };
      stations.set(id, st);
    }
    return st;
  };
  let files = 0, slots = 0;
  for (const d of days) for (const half of ['00', '12']) {
    const f = join(dir, d, `${half}.json.gz`);
    if (!existsSync(f)) continue;
    const j = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
    if (j.product !== 'road-archive-half' || !Array.isArray(j.slots)) continue;
    files++;
    const idx = [];
    j.slots.forEach((stamp, i) => { if (stamp.endsWith('00') && (stamp.slice(8, 10) === '00')) idx.push([i, Math.round((roadStampToMs(stamp) - originMs) / H)]); });
    slots += idx.length;
    for (const [id, s] of Object.entries(j.stations)) {
      const st = get(id, s);
      for (const [i, k] of idx) {
        if (k < 0 || k >= hours) continue;
        const rs = s.rs?.[i], ta = s.ta?.[i], td = s.td?.[i];
        if (rs != null) st.rs[k] = rs;
        if (ta != null) st.ta[k] = ta;
        if (td != null) st.td[k] = td;
        const c = typeof s.k === 'string' ? s.k[i] : undefined;
        st.cold[k] = c == null || c === '-' ? 255 : (c === ROAD_CLASS_CODE.frost || c === ROAD_CLASS_CODE.ice) ? 1 : 0;
      }
    }
  }
  return { originMs, hours, stations, files, slots, days };
}

/** Runs of `road/fc/v1` (archive form, station points, lead 0 … 24), oldest first. */
export function readFcArchive(dir, { fromDay = null, toDay = null } = {}) {
  const days = readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!fromDay || d >= fromDay) && (!toDay || d <= toDay)).sort();
  const runs = [];
  for (const d of days) for (const f of readdirSync(join(dir, d)).filter((x) => x.endsWith('.json.gz')).sort()) {
    const j = JSON.parse(gunzipSync(readFileSync(join(dir, d, f))).toString('utf8'));
    if (j.product !== 'road-fc-archive' || typeof j.t0Ms !== 'number' || !j.stations) continue;
    runs.push({ run: j.run, t0Ms: j.t0Ms, issuedAt: j.issuedAt, steps: j.steps, engine: j.engine?.name ?? null, stations: j.stations });
  }
  runs.sort((a, b) => a.t0Ms - b.t0Ms);
  return runs;
}

// --- pairs ------------------------------------------------------------------------------------------

/** Solar elevation above the horizon? (declination + hour angle, enough for day/night.) */
export function sunUp(ms, lat, lon) {
  const d = new Date(ms);
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
  const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const hourAngle = ((d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15) - 12) * 15 * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle) > 0;
}

/** Columnar pair set (see header). `runs[i].t0Ms`, `stations[i]` name the pair's run and station. */
export function buildPairs(obs, runs, { horizon = HORIZON } = {}) {
  const cap = runs.reduce((n, r) => n + Object.keys(r.stations).length, 0) * (horizon + 1);
  const col = (T) => new T(cap);
  const P = {
    n: 0, runIdx: col(Int32Array), stIdx: col(Int32Array), lead: col(Uint8Array), hod: col(Uint8Array), day: col(Uint8Array),
    t: col(Float32Array), td: col(Float32Array), cs: col(Float32Array), ff: col(Float32Array), wet: col(Uint8Array),
    rs0: col(Float32Array), t0: col(Float32Array), cs0: col(Float32Array), ff0: col(Float32Array), wet0: col(Uint8Array), hod0: col(Uint8Array),
    truth: col(Float32Array), cold: col(Uint8Array), runs: runs.map((r) => ({ run: r.run, t0Ms: r.t0Ms })), stations: [], stationIdx: new Map(),
  };
  const stIndex = (id, st) => {
    let i = P.stationIdx.get(id);
    if (i == null) { i = P.stations.length; P.stations.push({ id, lat: st.lat, lon: st.lon }); P.stationIdx.set(id, i); }
    return i;
  };
  // Predictors of a step in physical units; `n`/`ff`/`pp` may be missing in a step — the fit keeps the pair with NaN and
  // the model falls back to the table means, exactly as the producer will.
  const pred = (v, i) => {
    const n = roadFcDecode('n', v.n?.[i]), ff = roadFcDecode('ff', v.ff?.[i]), pp = roadFcDecode('pp', v.pp?.[i]);
    return { cs: n == null ? NaN : Math.max(0, Math.min(1, 1 - n / 100)), ff: ff == null ? NaN : Math.max(0, ff), wet: pp == null ? 255 : roadSurfaceWet(pp) ? 1 : 0 };
  };
  runs.forEach((r, ri) => {
    const k0 = Math.round((r.t0Ms - obs.originMs) / H);
    for (const [id, sp] of Object.entries(r.stations)) {
      const st = obs.stations.get(id);
      if (!st || k0 < 0 || k0 >= obs.hours) continue;
      const rs0 = st.rs[k0], ta0 = st.ta[k0];
      if (!Number.isFinite(rs0) || !Number.isFinite(ta0)) continue;
      const t0 = roadFcDecode('t', sp.v.t?.[0]);
      if (t0 == null) continue;
      const p0 = pred(sp.v, 0);
      const si = stIndex(id, st);
      for (let h = 0; h <= horizon; h++) {
        const k = k0 + h;
        if (k >= obs.hours) break;
        const truth = st.rs[k];
        const t = roadFcDecode('t', sp.v.t?.[h]);
        if (!Number.isFinite(truth) || t == null) continue;
        const p = pred(sp.v, h);
        const i = P.n++;
        const validMs = r.t0Ms + h * H;
        P.runIdx[i] = ri; P.stIdx[i] = si; P.lead[i] = h; P.hod[i] = new Date(validMs).getUTCHours(); P.day[i] = sunUp(validMs, st.lat, st.lon) ? 1 : 0;
        P.t[i] = t; P.td[i] = roadFcDecode('td', sp.v.td?.[h]) ?? NaN; P.cs[i] = p.cs; P.ff[i] = p.ff; P.wet[i] = p.wet;
        P.rs0[i] = rs0; P.t0[i] = t0; P.cs0[i] = p0.cs; P.ff0[i] = p0.ff; P.wet0[i] = p0.wet; P.hod0[i] = new Date(r.t0Ms).getUTCHours();
        P.truth[i] = truth; P.cold[i] = st.cold[k];
      }
    }
  });
  for (const k of Object.keys(P)) if (ArrayBuffer.isView(P[k])) P[k] = P[k].subarray(0, P.n);
  return P;
}

// --- fit ----------------------------------------------------------------------------------------------

/** Gaussian elimination with a tiny ridge; returns the solution of (A + λI) x = b. */
function solve(A, b, lambda = 1e-6) {
  const n = b.length, M = A.map((row, i) => [...row.map((v, j) => v + (i === j ? lambda : 0)), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** The predictors of pair i with the means filled in (the model's own rule, `roadSurfacePredictors`). */
function predictorsOf(P, i, means, at0 = false) {
  const cs = at0 ? P.cs0[i] : P.cs[i], ff = at0 ? P.ff0[i] : P.ff[i], wet = at0 ? P.wet0[i] : P.wet[i];
  return roadSurfacePredictors({ means }, { n: Number.isFinite(cs) ? 100 * (1 - cs) : null, ff: Number.isFinite(ff) ? ff : null, pp: wet === 255 ? null : wet ? 100 : 0 });
}
const climOf = (hours, hod, p) => hours[hod][0] + hours[hod][1] * p.cs + hours[hod][2] * p.ff + hours[hod][3] * p.wet;

/**
 * Fit FB-1 on the pairs where `mask(i)` is true: regression per UTC hour (Δ = truth − forecast air on clear sky, wind,
 * wet), station bias (shrunk), τ from the grid (smallest MAE over leads 1 … HORIZON, or `tauH` when given), σ per lead.
 */
export function fitSurfaceTable(P, { mask: wanted = () => true, tauH = null, decayFit = 'tau', builtAt, shrinkN = ROAD_SURFACE_BIAS_SHRINK_N, tauGrid = ROAD_SURFACE_TAU_GRID_H, maxAbsK = ROAD_SURFACE_FIT_MAX_ABS_K } = {}) {
  // Amendment A1: implausible road − air pairs (broken sensors) stay out of the fit, counted.
  let nClipped = 0;
  let counting = true;
  const mask = (i) => {
    if (!wanted(i)) return false;
    if (Math.abs(P.truth[i] - P.t[i]) > maxAbsK || Math.abs(P.rs0[i] - P.t0[i]) > maxAbsK) { if (counting) nClipped++; return false; }
    return true;
  };
  // Means of the predictors over the fitted pairs (the fallback of a step without a value).
  let sCs = 0, nCs = 0, sFf = 0, nFf = 0, sWet = 0, nWet = 0, nPairs = 0;
  for (let i = 0; i < P.n; i++) {
    if (!mask(i)) continue;
    nPairs++;
    if (Number.isFinite(P.cs[i])) { sCs += P.cs[i]; nCs++; }
    if (Number.isFinite(P.ff[i])) { sFf += P.ff[i]; nFf++; }
    if (P.wet[i] !== 255) { sWet += P.wet[i]; nWet++; }
  }
  if (!nPairs) throw new Error('keine Paare im Fit-Fenster');
  counting = false;
  const clipped = nClipped;
  const means = { cs: nCs ? sCs / nCs : 0.5, ff: nFf ? sFf / nFf : 3, wet: nWet ? sWet / nWet : 0.1 };
  // Regression per hour of day and station bias, alternating (SURFACE_FIT_PASSES): the climatology is fitted on
  // Δ − b_station, the bias on the residual after the climatology — a station's constant offset must not leak into
  // the coefficients of the hour it happens to be measured in most.
  const biasArr = new Float32Array(P.stations.length);
  const cnt = new Array(24).fill(0);
  let hours = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
  const sum = new Map();
  for (let pass = 0; pass < SURFACE_FIT_PASSES; pass++) {
    const XtX = Array.from({ length: 24 }, () => [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const Xty = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
    cnt.fill(0);
    for (let i = 0; i < P.n; i++) {
      if (!mask(i)) continue;
      const p = predictorsOf(P, i, means), x = [1, p.cs, p.ff, p.wet], y = P.truth[i] - P.t[i] - biasArr[P.stIdx[i]], h = P.hod[i];
      cnt[h]++;
      for (let a = 0; a < 4; a++) { Xty[h][a] += x[a] * y; for (let b = 0; b < 4; b++) XtX[h][a][b] += x[a] * x[b]; }
    }
    hours = XtX.map((A, h) => (cnt[h] ? solve(A, Xty[h]) : [0, 0, 0, 0]).map((v) => Math.round(v * 1000) / 1000));
    // Station bias from the residual after the climatology, shrunk by n / (n + shrinkN).
    sum.clear();
    for (let i = 0; i < P.n; i++) {
      if (!mask(i)) continue;
      const r = P.truth[i] - P.t[i] - climOf(hours, P.hod[i], predictorsOf(P, i, means));
      const e = sum.get(P.stIdx[i]) ?? { s: 0, n: 0 };
      e.s += r; e.n++; sum.set(P.stIdx[i], e);
    }
    biasArr.fill(0);
    for (const [si, e] of sum) biasArr[si] = (e.s / e.n) * (e.n / (e.n + shrinkN));
  }
  const bias = {};
  for (const [si] of sum) bias[P.stations[si].id] = Math.round(biasArr[si] * 10);
  // τ: MAE over leads 1 … HORIZON per candidate.
  const anomalyOf = (i) => P.rs0[i] - P.t0[i] - climOf(hours, P.hod0[i], predictorsOf(P, i, means, true)) - biasArr[P.stIdx[i]];
  const maeFor = (tau) => {
    let s = 0, n = 0;
    for (let i = 0; i < P.n; i++) {
      if (!mask(i) || P.lead[i] === 0) continue;
      const pred = P.t[i] + climOf(hours, P.hod[i], predictorsOf(P, i, means)) + biasArr[P.stIdx[i]] + anomalyOf(i) * Math.exp(-P.lead[i] / tau);
      s += Math.abs(P.truth[i] - pred); n++;
    }
    return n ? s / n : Infinity;
  };
  let tauScan = [], decay, tau = null;
  if (decayFit === 'tau') {
    tauScan = tauH != null ? [{ tau: tauH, mae: maeFor(tauH) }] : tauGrid.map((t) => ({ tau: t, mae: maeFor(t) }));
    tau = tauScan.reduce((a, b) => (b.mae < a.mae ? b : a)).tau;
    decay = Array.from({ length: HORIZON + 1 }, (_, h) => Math.round(Math.exp(-h / tau) * 1000) / 1000);
  } else {
    // One weight per lead: least squares of the residual after climatology and bias on the anomaly (w_0 = 1 by construction).
    const sa = new Float64Array(HORIZON + 1), saa = new Float64Array(HORIZON + 1);
    for (let i = 0; i < P.n; i++) {
      if (!mask(i)) continue;
      const a = anomalyOf(i), r = P.truth[i] - P.t[i] - climOf(hours, P.hod[i], predictorsOf(P, i, means)) - biasArr[P.stIdx[i]];
      sa[P.lead[i]] += r * a; saa[P.lead[i]] += a * a;
    }
    decay = Array.from(sa, (v, h) => (h === 0 ? 1 : Math.round(Math.max(-0.5, Math.min(1.5, saa[h] ? v / saa[h] : 0)) * 1000) / 1000));
  }
  // σ per lead.
  const ss = new Float64Array(HORIZON + 1), nn = new Float64Array(HORIZON + 1);
  for (let i = 0; i < P.n; i++) {
    if (!mask(i)) continue;
    const pred = P.t[i] + climOf(hours, P.hod[i], predictorsOf(P, i, means)) + biasArr[P.stIdx[i]] + anomalyOf(i) * decay[P.lead[i]];
    const e = P.truth[i] - pred;
    ss[P.lead[i]] += e * e; nn[P.lead[i]]++;
  }
  const sigma = Array.from(ss, (s, h) => Math.round(Math.sqrt(nn[h] ? s / nn[h] : 1) * 100) / 100);
  let runMin = Infinity, runMax = -Infinity; const runSet = new Set();
  for (let i = 0; i < P.n; i++) if (mask(i)) { runSet.add(P.runIdx[i]); runMin = Math.min(runMin, P.runs[P.runIdx[i]].t0Ms); runMax = Math.max(runMax, P.runs[P.runIdx[i]].t0Ms); }
  const table = {
    schema: ROAD_SURFACE_TABLE_SCHEMA, product: 'road-surface-table', model: ROAD_SURFACE_MODEL, builtAt,
    fitted: { from: dayOf(runMin), to: dayOf(runMax), runs: runSet.size, pairs: nPairs, stations: Object.keys(bias).length },
    decay, decayFit, tauH: tau, hours, means: { cs: Math.round(means.cs * 1000) / 1000, ff: Math.round(means.ff * 100) / 100, wet: Math.round(means.wet * 1000) / 1000 },
    sigma, bias, shrinkN,
  };
  const problems = roadSurfaceTableProblems(table);
  if (problems.length) throw new Error(`die gefittete Tabelle besteht ihren eigenen Prüfer nicht: ${problems.join('; ')}`);
  return { table, tauScan, hourCounts: cnt, clipped, maxAbsK };
}

// --- predictions and score ------------------------------------------------------------------------------

/** FB-1 and the baselines for pair i (°C): M model, P persistence, A air proxy, PA plan difference without decay, C climatology only. */
export function predictAll(P, table, i) {
  const step = (at0) => { const p = predictorsOf(P, i, table.means, at0); return { cs: p.cs, ff: p.ff, wet: p.wet }; };
  const hod = P.hod[i], hod0 = P.hod0[i];
  const c = climOf(table.hours, hod, step(false)), c0 = climOf(table.hours, hod0, step(true));
  const b = (table.bias[P.stations[P.stIdx[i]].id] ?? 0) / 10;
  const anomaly = P.rs0[i] - P.t0[i] - c0 - b;
  const base = P.t[i] + c + b;
  return { M: base + anomaly * table.decay[P.lead[i]], P: P.rs0[i], A: P.t[i], PA: P.t[i] + (P.rs0[i] - P.t0[i]), C: base };
}

/** Deterministic RNG for the bootstrap. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const VARIANTS = ['M', 'P', 'A', 'PA', 'C'];

/**
 * Score on the pairs where `mask(i)` is true: MAE/bias per lead and variant, paired bootstrap over RUNS of MAE_M − MAE_B,
 * the cold event (truth ≤ ROAD_SURFACE_COLD_C): Brier, hit rate, false alarm ratio at p ≥ 0.5, counts; day/night MAE;
 * the archived class frost/ice as a count only.
 */
export function scoreSurface(P, table, { mask = () => true, bootN = SURFACE_BOOT_N, seed = 1, leads = SURFACE_LEADS_SCORED, robustK = ROAD_SURFACE_FIT_MAX_ABS_K } = {}) {
  const L = HORIZON;
  const z = () => Array.from({ length: L + 1 }, () => 0);
  const acc = {};
  for (const v of VARIANTS) acc[v] = { ae: z(), e: z(), n: z(), bs: z(), hit: z(), alarm: z(), aeDay: z(), nDay: z(), aeNight: z(), nNight: z(), aeRob: z(), nRob: z() };
  const events = z(), nCls = z(), clsFlagM = z(), clsHitM = z();
  // Per-run sums for the bootstrap: run → lead → variant → [sum |e|, n].
  const perRun = new Map();
  for (let i = 0; i < P.n; i++) {
    if (!mask(i)) continue;
    const h = P.lead[i];
    if (h === 0) continue;
    const pr = predictAll(P, table, i);
    const truth = P.truth[i], cold = truth <= ROAD_SURFACE_COLD_C ? 1 : 0;
    events[h] += cold;
    if (P.cold[i] === 1) nCls[h]++;
    let rr = perRun.get(P.runIdx[i]);
    if (!rr) { rr = Array.from({ length: L + 1 }, () => Object.fromEntries(VARIANTS.map((v) => [v, [0, 0]]))); perRun.set(P.runIdx[i], rr); }
    for (const v of VARIANTS) {
      const e = pr[v] - truth, a = acc[v];
      a.ae[h] += Math.abs(e); a.e[h] += e; a.n[h]++;
      if (P.day[i]) { a.aeDay[h] += Math.abs(e); a.nDay[h]++; } else { a.aeNight[h] += Math.abs(e); a.nNight[h]++; }
      if (Math.abs(P.rs0[i] - P.t0[i]) <= robustK) { a.aeRob[h] += Math.abs(e); a.nRob[h]++; }
      rr[h][v][0] += Math.abs(e); rr[h][v][1]++;
      const p = v === 'M' || v === 'C' ? roadSurfaceColdProb(pr[v], table.sigma[h]) : (pr[v] <= ROAD_SURFACE_COLD_C ? 1 : 0);
      a.bs[h] += (p - cold) ** 2;
      if (p >= 0.5) { a.alarm[h]++; if (cold) a.hit[h]++; }
    }
    // Class frost/ice (reported only): would FB-1 raise the hint „Frostgefahr"?
    const wet = P.wet[i] === 255 ? table.means.wet >= 0.5 : P.wet[i] === 1;
    const flag = pr.M <= ROAD_SURFACE_COLD_C && (wet || (Number.isFinite(P.td[i]) && pr.M <= P.td[i]));
    if (flag) { clsFlagM[h]++; if (P.cold[i] === 1) clsHitM[h]++; }
  }
  const byLead = {};
  for (let h = 1; h <= L; h++) {
    byLead[h] = { n: acc.M.n[h], events: events[h], eventRate: acc.M.n[h] ? events[h] / acc.M.n[h] : 0, cls: nCls[h], clsFlagM: clsFlagM[h], clsHitM: clsHitM[h] };
    for (const v of VARIANTS) {
      const a = acc[v];
      byLead[h][v] = {
        mae: a.n[h] ? a.ae[h] / a.n[h] : NaN, bias: a.n[h] ? a.e[h] / a.n[h] : NaN,
        maeDay: a.nDay[h] ? a.aeDay[h] / a.nDay[h] : NaN, maeNight: a.nNight[h] ? a.aeNight[h] / a.nNight[h] : NaN,
        maeRobust: a.nRob[h] ? a.aeRob[h] / a.nRob[h] : NaN, nRobust: a.nRob[h],
        brier: a.n[h] ? a.bs[h] / a.n[h] : NaN, hitRate: events[h] ? a.hit[h] / events[h] : NaN, far: a.alarm[h] ? (a.alarm[h] - a.hit[h]) / a.alarm[h] : NaN, alarms: a.alarm[h], hits: a.hit[h],
      };
    }
    // Reference Brier of the base rate (no skill).
    const r = byLead[h].eventRate;
    byLead[h].brierRef = r * (1 - r);
  }
  // Bootstrap over runs: MAE_M − MAE_B per lead, 2.5 / 97.5 percentiles.
  const runIds = [...perRun.keys()];
  const rnd = mulberry32(seed);
  const boot = {};
  for (const h of leads) {
    boot[h] = {};
    for (const v of ['P', 'A', 'PA', 'C']) {
      const diffs = [];
      for (let b = 0; b < bootN; b++) {
        let sM = 0, sB = 0, n = 0;
        for (let k = 0; k < runIds.length; k++) {
          const rr = perRun.get(runIds[Math.floor(rnd() * runIds.length)])[h];
          sM += rr.M[0]; sB += rr[v][0]; n += rr.M[1];
        }
        diffs.push(n ? (sM - sB) / n : 0);
      }
      diffs.sort((x, y) => x - y);
      boot[h][v] = { lo: diffs[Math.floor(0.025 * (bootN - 1))], hi: diffs[Math.ceil(0.975 * (bootN - 1))], mean: diffs.reduce((s, d) => s + d, 0) / bootN };
    }
  }
  return { byLead, boot, runs: runIds.length, pairs: VARIANTS.length ? acc.M.n.reduce((s, x) => s + x, 0) : 0, leads: [...leads], bootN, seed };
}

/** The two gates of rule §4 from a score (pure). */
export function gateOf(score, { leads = SURFACE_LEADS_SCORED, minEvents = SURFACE_MIN_EVENTS } = {}) {
  const t = leads.map((h) => {
    const b = score.byLead[h], bo = score.boot[h];
    const beats = ['P', 'A', 'PA'].map((v) => ({ v, better: b.M.mae < b[v].mae, ciBelowZero: bo[v].hi < 0 }));
    return { lead: h, ok: beats.every((x) => x.better && x.ciBelowZero), beats };
  });
  const k = leads.map((h) => {
    const b = score.byLead[h];
    const measurable = b.events >= minEvents;
    const beats = ['P', 'A'].map((v) => ({ v, better: b.M.brier < b[v].brier }));
    return { lead: h, measurable, ok: measurable && beats.every((x) => x.better), beats };
  });
  return {
    temperature: { verdict: t.every((x) => x.ok) ? 'GRÜN' : 'ROT', leads: t },
    cold: { verdict: k.every((x) => x.measurable) ? (k.every((x) => x.ok) ? 'GRÜN' : 'ROT') : 'NICHT MESSBAR', leads: k },
  };
}

// --- report ------------------------------------------------------------------------------------------------

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',').replace('-', '−') : '—');
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3).replace('.', ',').replace('-', '−') : '—');
const pct = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)} %` : '—');

export function formatReport({ title, rule, obs, runsAll, split, fit, score, gate, after = null, tableFull, tableHash }) {
  const L = [];
  L.push(`# ${title}`, '');
  L.push(`Regel: \`${rule.path}\` (SHA-256 \`${rule.hash}\`). Archiv: ${obs.days[0]} … ${obs.days[obs.days.length - 1]}, ${obs.files} Halbtage, ${obs.stations.size} Stationen; ${runsAll} Läufe. Trennung t0 < ${split} (Fit) / ≥ ${split} (Bewertung).`, '');
  L.push(`## Fit (Trainingsfenster ${fit.table.fitted.from} … ${fit.table.fitted.to}, ${fit.table.fitted.runs} Läufe, ${fit.table.fitted.pairs} Paare, ${fit.table.fitted.stations} Stationen mit Versatz)`, '');
  if (fit.table.decayFit === 'tau') L.push(`τ-Gitter (MAE über 1–6 h, K): ${fit.tauScan.map((x) => `${x.tau} h → ${f3(x.mae)}`).join(' · ')} ⇒ **τ = ${fit.table.tauH} h**, Gewichte ${fit.table.decay.join(' · ')}`, '');
  else L.push(`Gewicht der Anomalie je Vorlauf 0 … 6 h (kleinste Quadrate): **${fit.table.decay.join(' · ')}**`, '');
  L.push(`σ je Vorlauf 0 … 6 h (K): ${fit.table.sigma.join(' · ')}; Mittel der Prädiktoren: Klarhimmel ${fit.table.means.cs}, Wind ${fit.table.means.ff} m/s, Nässe ${fit.table.means.wet}. Aus dem Fit genommen (A1, |Fahrbahn − Luft| > ${fit.maxAbsK} K): ${fit.clipped} Paare.`, '');
  L.push('| UTC-Stunde | a0 (K) | a1 · Klarhimmel | a2 · Wind (K je m/s) | a3 · Nässe | Paare |', '|---|---|---|---|---|---|');
  fit.table.hours.forEach((r, h) => L.push(`| ${String(h).padStart(2, '0')} | ${f2(r[0])} | ${f2(r[1])} | ${f2(r[2])} | ${f2(r[3])} | ${fit.hourCounts[h]} |`));
  L.push('');
  L.push(`## Bewertung (t0 ≥ ${split}, ${score.runs} Läufe, ${score.pairs} Paare mit Vorlauf 1–6 h)`, '');
  L.push('Varianten: **M** FB-1 · P Persistenz der Fahrbahn · A Luft-Proxy (Fahrbahn = Luft der Prognose, E-AW-40) · PA Plan-Differenz ohne Abklingen · C Klimatologie ohne Messung (Achspunkt).', '');
  L.push('| Vorlauf | n | MAE M | MAE P | MAE A | MAE PA | MAE C | Bias M | M − P [95 %] | M − A [95 %] | M − PA [95 %] |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (let h = 1; h <= HORIZON; h++) {
    const b = score.byLead[h], bo = score.boot[h];
    const ci = (v) => (bo ? `${f2(bo[v].mean)} [${f2(bo[v].lo)}; ${f2(bo[v].hi)}]` : '—');
    L.push(`| +${h} h | ${b.n} | **${f2(b.M.mae)}** | ${f2(b.P.mae)} | ${f2(b.A.mae)} | ${f2(b.PA.mae)} | ${f2(b.C.mae)} | ${f2(b.M.bias)} | ${ci('P')} | ${ci('A')} | ${ci('PA')} |`);
  }
  L.push('', '| Vorlauf | MAE M Tag | MAE M Nacht | MAE P Tag | MAE P Nacht | MAE A Tag | MAE A Nacht |', '|---|---|---|---|---|---|---|');
  for (let h = 1; h <= HORIZON; h++) { const b = score.byLead[h]; L.push(`| +${h} h | ${f2(b.M.maeDay)} | ${f2(b.M.maeNight)} | ${f2(b.P.maeDay)} | ${f2(b.P.maeNight)} | ${f2(b.A.maeDay)} | ${f2(b.A.maeNight)} |`); }
  L.push('', `Berichtet, nicht entschieden — nur Paare mit plausibler Messung zur Laufstunde (|Fahrbahn − Luft| ≤ ${ROAD_SURFACE_FIT_MAX_ABS_K} K):`, '', '| Vorlauf | n | MAE M | MAE P | MAE A | MAE PA | MAE C |', '|---|---|---|---|---|---|---|');
  for (let h = 1; h <= HORIZON; h++) { const b = score.byLead[h]; L.push(`| +${h} h | ${b.M.nRobust} | **${f2(b.M.maeRobust)}** | ${f2(b.P.maeRobust)} | ${f2(b.A.maeRobust)} | ${f2(b.PA.maeRobust)} | ${f2(b.C.maeRobust)} |`); }
  L.push('', `## Ereignis Fahrbahn ≤ +${ROAD_SURFACE_COLD_C} °C (Bewertungsfenster)`, '');
  L.push('| Vorlauf | Ereignisse | Rate | Brier M | Brier P | Brier A | Brier PA | Brier Basisrate | Treffer M | Fehlalarm M | Treffer P | Fehlalarm P | Treffer A | Fehlalarm A |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (let h = 1; h <= HORIZON; h++) {
    const b = score.byLead[h];
    L.push(`| +${h} h | ${b.events} | ${(100 * b.eventRate).toFixed(2)} % | **${f3(b.M.brier)}** | ${f3(b.P.brier)} | ${f3(b.A.brier)} | ${f3(b.PA.brier)} | ${f3(b.brierRef)} | ${pct(b.M.hitRate)} | ${pct(b.M.far)} | ${pct(b.P.hitRate)} | ${pct(b.P.far)} | ${pct(b.A.hitRate)} | ${pct(b.A.far)} |`);
  }
  L.push('', 'Klasse Frostgefahr/Glätte im Archiv (berichtet, nicht entschieden): ' + [1, 3, 6].map((h) => { const b = score.byLead[h]; return `+${h} h: ${b.cls} Fälle, FB-1 hätte ${b.clsFlagM} × „Frostgefahr (berechnet)" gesetzt, davon ${b.clsHitM} auf einem Fall`; }).join(' · '), '');
  L.push('## Gate nach der Regel', '');
  L.push(`**Gate D-T (Temperatur): ${gate.temperature.verdict}** — ` + gate.temperature.leads.map((x) => `+${x.lead} h: ${x.beats.map((b) => `${b.v} ${b.better ? '✓' : '✗'}${b.ciBelowZero ? '' : ' (KI schließt 0 ein)'}`).join(', ')}`).join(' · '), '');
  L.push(`**Gate D-K (Klasse, Ereignis ≤ +${ROAD_SURFACE_COLD_C} °C): ${gate.cold.verdict}** — ` + gate.cold.leads.map((x) => `+${x.lead} h: ${x.measurable ? x.beats.map((b) => `${b.v} ${b.better ? '✓' : '✗'}`).join(', ') : `nur ${score.byLead[x.lead].events} Ereignisse (< ${SURFACE_MIN_EVENTS})`}`).join(' · '), '');
  if (after) {
    L.push('## Nachträglich, informativ — FB-1 mit einem Gewicht je Vorlauf (`decayFit: lead`, V-FB-7)', '');
    L.push('Nach dem Blick auf die Bewertung gerechnet (Fit auf demselben Trainingsfenster, Bewertung auf demselben Fenster) — eine Formänderung, also KEIN Gate-Urteil nach der eingefrorenen Regel; entschieden wird im Dezember an frischen Daten mit neuer Regel.', '');
    L.push(`Gewichte 0 … 6 h: ${after.fit.table.decay.join(' · ')}; σ ${after.fit.table.sigma.join(' · ')} K`, '');
    L.push('| Vorlauf | n | MAE M₂ | MAE M (FB-1 τ) | MAE P | MAE A | MAE PA | Bias M₂ | M₂ − P [95 %] | M₂ − A [95 %] | M₂ − PA [95 %] |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (let h = 1; h <= HORIZON; h++) {
      const b = after.score.byLead[h], b1 = score.byLead[h], bo = after.score.boot[h];
      const ci = (v) => (bo ? `${f2(bo[v].mean)} [${f2(bo[v].lo)}; ${f2(bo[v].hi)}]` : '—');
      L.push(`| +${h} h | ${b.n} | **${f2(b.M.mae)}** | ${f2(b1.M.mae)} | ${f2(b.P.mae)} | ${f2(b.A.mae)} | ${f2(b.PA.mae)} | ${f2(b.M.bias)} | ${ci('P')} | ${ci('A')} | ${ci('PA')} |`);
    }
    L.push('', `Dieselbe Regel, auf M₂ angewandt (nur zur Orientierung): D-T ${after.gate.temperature.verdict} — ` + after.gate.temperature.leads.map((x) => `+${x.lead} h: ${x.beats.map((b) => `${b.v} ${b.better ? '✓' : '✗'}${b.ciBelowZero ? '' : ' (KI schließt 0 ein)'}`).join(', ')}`).join(' · '), '');
  }
  if (tableFull) L.push(`## Tabelle für die Produktion`, '', `Gefittet an ALLEN Läufen (${tableFull.fitted.from} … ${tableFull.fitted.to}, ${tableFull.fitted.runs} Läufe, ${tableFull.fitted.pairs} Paare, ${tableFull.fitted.stations} Stationen), \`decayFit: ${tableFull.decayFit}\`${tableFull.tauH != null ? ` mit τ = ${tableFull.tauH} h aus dem Trainingsfit` : ''}, Gewichte ${tableFull.decay.join(' · ')}; σ ${tableFull.sigma.join(' · ')} K; SHA-256 \`${tableHash}\`.`, '');
  return L.join('\n') + '\n';
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// --- main ------------------------------------------------------------------------------------------------------

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
  if (!flags.archive) { console.error('--archive=<Klon von buscosun-archiv> fehlt'); process.exit(1); }
  const split = flags.split ?? SURFACE_SPLIT_DEFAULT;
  const splitMs = Date.parse(`${split}T00:00:00Z`);
  const outDir = flags.out ?? join('audit', 'autobahn-fahrbahn');
  const bootN = flags.boot ? Number(flags.boot) : SURFACE_BOOT_N;
  const T0 = Date.now();
  const rulePath = join('audit', 'autobahn-fahrbahn', 'backtest-regel.md');
  const rule = { path: rulePath, hash: existsSync(rulePath) ? sha256(readFileSync(rulePath)) : 'fehlt' };
  const obs = readObsArchive(join(flags.archive, 'road', 'v1'), { fromDay: flags.from ?? null, toDay: flags.to ?? null });
  console.log(`Messungen: ${obs.days[0]} … ${obs.days[obs.days.length - 1]}, ${obs.files} Halbtage, ${obs.slots} Vollstunden-Slots, ${obs.stations.size} Stationen (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  const runs = readFcArchive(join(flags.archive, 'road', 'fc', 'v1'), { fromDay: flags.from ?? null, toDay: flags.to ?? null });
  console.log(`Prognosen: ${runs.length} Läufe ${runs[0]?.run} … ${runs[runs.length - 1]?.run} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  const P = buildPairs(obs, runs);
  const train = (i) => P.runs[P.runIdx[i]].t0Ms < splitMs, test = (i) => !train(i);
  let nTrain = 0; for (let i = 0; i < P.n; i++) if (train(i)) nTrain++;
  console.log(`Paare: ${P.n} (Fit ${nTrain}, Bewertung ${P.n - nTrain}), ${P.stations.length} Stationen (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  const builtAt = new Date().toISOString();
  const fit = fitSurfaceTable(P, { mask: train, builtAt });
  console.log(`Fit: τ = ${fit.table.tauH} h, σ ${fit.table.sigma.join('/')} K (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  const score = scoreSurface(P, fit.table, { mask: test, bootN });
  const gate = gateOf(score);
  console.log(`Gate D-T ${gate.temperature.verdict} · Gate D-K ${gate.cold.verdict} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  // After the fact (V-FB-7): one anomaly weight per lead — reported, not a gate verdict.
  const fit2 = fitSurfaceTable(P, { mask: train, builtAt, decayFit: 'lead' });
  const score2 = scoreSurface(P, fit2.table, { mask: test, bootN });
  const after = { fit: fit2, score: score2, gate: gateOf(score2) };
  console.log(`informativ (Gewicht je Vorlauf): ${fit2.table.decay.join('/')} · D-T wäre ${after.gate.temperature.verdict} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
  // The production table (shadow product only, E-FB-9): all runs, the form chosen by --decay (default: lead weights).
  const decayFit = flags.decay === 'tau' ? 'tau' : 'lead';
  const full = fitSurfaceTable(P, { builtAt, decayFit, ...(decayFit === 'tau' ? { tauH: fit.table.tauH } : {}) });
  const tableText = JSON.stringify(full.table);
  const tableHash = sha256(tableText);
  const day = builtAt.slice(0, 10);
  mkdirSync(outDir, { recursive: true });
  const report = formatReport({ title: `Backtest FB-1 — ${day}`, rule, obs, runsAll: runs.length, split, fit, score, gate, after, tableFull: full.table, tableHash });
  writeFileSync(join(outDir, `backtest-${day}.md`), report);
  writeFileSync(join(outDir, `backtest-${day}.json`), JSON.stringify({ builtAt, rule, split, fitTable: fit.table, tauScan: fit.tauScan, score, gate, after: { table: fit2.table, score: score2, gate: after.gate }, tableHash }, null, 1));
  if (flags.table) { mkdirSync(dirname(flags.table), { recursive: true }); writeFileSync(flags.table, tableText); console.log(`Tabelle: ${flags.table} (${tableText.length} B, sha256 ${tableHash.slice(0, 12)})`); }
  console.log(`Bericht: ${join(outDir, `backtest-${day}.md`)} (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((e) => { console.error(e); process.exit(1); });
