#!/usr/bin/env node
/**
 * of7.mjs — phase OF, step OF-7 (`audit/obs-fusion.md` §11): the two measurements behind the candidate `fusion-12r`, both on
 * hindcast slots OUTSIDE the vault of the Prüfstand and BEFORE the development set of track P (archive from 2026-09-14):
 *
 *   (1) ρ(d, Δh) — the correlation of the chain's error at one station with the error at another, per variable (t, ws, gust),
 *       binned by distance and height difference, at the same valid time and lead 1–3 h. Replaces `spatialWeight` in the σ
 *       formula of `anchorSigma` (lever 1 of the G3 note, `anchorRho`).
 *   (2) σ-scale per variable × window — the factor on σ of the fused output (t, td, ws, gust) that puts the q10–q90 coverage
 *       of the chain WITHOUT anchor on the nominal 80 % (lever 4, `sigmaScale`). Fitted on the pooled rows (all countries,
 *       both roles) with a piecewise-linear scale in lead between the window centres.
 *
 * Read-only towards every data root. `--collect --part=i/n` writes `audit/obs-fusion/of7/part-i.json` (reservoirs + ρ sums);
 * `--fit` merges the parts and writes `audit/obs-fusion/of7-fit.json` + prints the summary.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/obsfusion/of7.mjs --collect --part=1/2
 *   node … scripts/obsfusion/of7.mjs --fit
 *
 * Slots: window A = t1 route `run` (2026-06-18 … 2026-09-13, 00 + 12 UTC, every 2nd day) — the only period with a real stage-1
 * run in the hindcast ⇒ leads 1–48 h (and ρ) come from here, the long leads too; window B = 00 UTC slots 2025-09-08 … 2026-06-16
 * (every 4th day, t2/t3 only, leads ≥ 51 h). Every slot date is checked against the vault (abort) and the archive set (abort).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, REPO, dayMs, distKm, isoDay, parseArgs } from '../pruefstand/lib/common.mjs';
import { loadProtocol } from '../pruefstand/lib/protokoll.mjs';
import { features, hindcastSlotPath, loadEngine, loadTables, readHindcastSlot } from '../pruefstand/lib/replay.mjs';
import { loadRegister, withTablePaths } from '../pruefstand/lib/register.mjs';
import { openW1, truthValue } from '../pruefstand/lib/wahrheit.mjs';
import { seriesFromSlotTier, inputFromSlot } from '../fusionfit/lib/slotAdapter.mjs';
import * as A from '../fusionfit/lib/archiveAdapter.mjs';
import { stepHoursOf } from '../../src/pruefstand/protokoll.ts';
import { crpsQ } from '../../src/pruefstand/metrics.ts';

const args = parseArgs();
const proto = loadProtocol();
const VARS = ['t', 'td', 'ws', 'gust'];
const RHO_VARS = ['t', 'ws', 'gust'];
const KEY = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust' };
const LANDS = ['DE', 'AT', 'CH'];
const ROLES = ['A', 'B'];
const KIND = { normal: 0, truncatedNormal: 1, rice: 2, censoredNormal: 3 };
const KINDS = ['normal', 'truncatedNormal', 'rice', 'censoredNormal'];
const RF = 6;   // reservoir row: kind p1 p2 p3 y lead
const RES_MAX = Number(args.reservoir ?? 8000);
const D_BINS = [0, 5, 10, 20, 35, 60, 120];        // km edges
const H_BINS = [0, 100, 300, 700, Infinity];       // m edges
const RHO_LEADS = [1, 2, 3];
const RHO_MAX_KM = 120;
const ARCHIVE_FROM = '2026-09-14';                 // first day of the development set of track P (never touched)
const OUT_DIR = join(REPO, 'audit/obs-fusion/of7');
const OUT_FIT = String(args.out ?? join(REPO, 'audit/obs-fusion/of7-fit.json'));
const regId = String(args.register ?? 'fusion-12s');

const windows = proto.windows;
const windowIdx = (L) => windows.findIndex((w) => L >= w.fromH && L <= w.toH);
const leadsAll = (() => { const out = []; for (let L = 1; L <= proto.leads.hourlyToH; L++) out.push(L); for (let L = proto.leads.hourlyToH + 3; L <= proto.leads.threeHourlyToH; L += 3) out.push(L); for (let L = proto.leads.threeHourlyToH + 6; L <= proto.leads.sixHourlyToH; L += 6) out.push(L); return out; })();
const cellKey = (v, w, land, role) => `${v}|${windows[w].id}|${LANDS[land]}|${ROLES[role]}`;
const dBin = (km) => { for (let i = 0; i < D_BINS.length - 1; i++) if (km >= D_BINS[i] && km < D_BINS[i + 1]) return i; return -1; };
const hBin = (m) => { for (let i = 0; i < H_BINS.length - 1; i++) if (m >= H_BINS[i] && m < H_BINS[i + 1]) return i; return -1; };

// ── slot list ──────────────────────────────────────────────────────────────────
function slotList() {
  const out = [];
  const guard = (day) => {
    if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`of7: ${day} liegt im Tresor — verboten`);
    if (day >= ARCHIVE_FROM) throw new Error(`of7: ${day} liegt in der Entwicklungsmenge (Archiv ab ${ARCHIVE_FROM}) — verboten`);
  };
  const di = (d) => Math.round(dayMs(d) / 86_400_000);
  for (let d = di('2026-06-18'); d <= di('2026-09-13'); d += 2) {
    const day = isoDay(d * 86_400_000); guard(day);
    for (const hr of [0, 12]) { const ms = d * 86_400_000 + hr * H; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr, ms, path, win: 'A' }); }
  }
  for (let d = di('2025-09-08'); d <= di('2026-06-16'); d += 4) {
    const day = isoDay(d * 86_400_000); guard(day);
    const ms = d * 86_400_000; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr: 0, ms, path, win: 'B' });
  }
  return out;
}

// ── collect ────────────────────────────────────────────────────────────────────
async function collect() {
  const [pi, pn] = String(args.part ?? '1/1').split('/').map(Number);
  const slots = slotList().filter((_, i) => i % pn === pi - 1);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const used = slots.slice(0, limit);
  console.log(`of7 collect Teil ${pi}/${pn}: ${used.length} Slots (A ${used.filter((s) => s.win === 'A').length}, B ${used.filter((s) => s.win === 'B').length}), Register ${regId}`);
  const eng = await loadEngine(REPO);
  const reg = withTablePaths(loadRegister(regId));
  const tables = loadTables(reg);
  const w1 = openW1(proto);
  const feat = features().byPoint;
  const stations = proto.scored;
  const nSt = stations.length;
  const opts = { ...reg.options, hourly: true, tail: true };
  const climaOf = (row, held) => (reg.clima === 'loso' || (held && reg.climaHeldOut === 'loso') ? A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row) : tables.clima);
  // pairs of stations for ρ
  const pairs = [];
  for (let i = 0; i < nSt; i++) for (let j = i + 1; j < nSt; j++) {
    const km = distKm(stations[i], stations[j]);
    if (!(km <= RHO_MAX_KM)) continue;
    const db = dBin(km), hb = hBin(Math.abs(stations[i].elevM - stations[j].elevM));
    if (db < 0 || hb < 0) continue;
    pairs.push([i, j, db * (H_BINS.length - 1) + hb]);
  }
  const nBins = (D_BINS.length - 1) * (H_BINS.length - 1);
  // ρ sums: per var × lead-slot × bin: n Σx Σy Σxy Σx² Σy²
  const rho = Object.fromEntries(RHO_VARS.map((v) => [v, new Float64Array(nBins * 6)]));
  const err = Object.fromEntries(RHO_VARS.map((v) => [v, RHO_LEADS.map(() => new Float64Array(nSt).fill(NaN))]));
  // reservoirs (algorithm R) per cell
  const res = new Map();   // key → { n, rows: number[] }
  const push = (key, row) => {
    let c = res.get(key); if (!c) { c = { n: 0, rows: [] }; res.set(key, c); }
    c.n += 1;
    if (c.rows.length < RES_MAX * RF) { c.rows.push(...row); return; }
    const k = Math.floor(Math.random() * c.n);
    if (k < RES_MAX) { const o = k * RF; for (let f = 0; f < RF; f++) c.rows[o + f] = row[f]; }
  };
  const distRow = (d) => [KIND[d.kind], d.kind === 'rice' ? d.nu : d.mu, d.sigma, d.kind === 'truncatedNormal' || d.kind === 'censoredNormal' ? d.lo : 0];
  const t0 = Date.now();
  let errors = 0, calls = 0, rowsN = 0;
  for (let si = 0; si < used.length; si++) {
    const sl = used[si];
    const slot = readHindcastSlot(sl.path);
    const t0Ms = slot.slotAtMs;
    const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
    if (sl.win === 'A' && day0) { console.log(`  ${sl.day} ${sl.hr}z: t1 ohne Lauf — übersprungen`); continue; }
    for (const v of RHO_VARS) for (const e of err[v]) e.fill(NaN);
    for (let s = 0; s < nSt; s++) {
      const stn = stations[s], row = feat[stn.id];
      const series = {};
      for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stn.id); if (ser) series[t] = ser; }
      const cube = {};
      for (const t of ['t2', 't3']) if (series[t]) cube[t] = series[t];
      if (!day0 && series.t1) cube.t1 = series.t1;
      if (!Object.keys(cube).length) continue;
      const window = { fromMs: t0Ms, toMs: t0Ms + proto.leads.sixHourlyToH * H, stepH: 1 };
      const input = { ...inputFromSlot(slot, row, cube, eng.clima, { nowMs: t0Ms, window }), country: row.country ?? null, learned: tables.learned, learnedClima: climaOf(row, stn.role === 'B'), ...(tables.stack ? { stack: tables.stack } : {}) };
      let r;
      try { r = eng.fuseCubePoint(input, opts); } catch (e) { errors += 1; if (errors <= 3) console.error(`  ${stn.id}: ${e?.message ?? e}`); continue; }
      calls += 1;
      const byMs = new Map();
      for (const st of r.steps) if (st.fused) byMs.set(st.validAtMs, st);
      const land = LANDS.indexOf(stn.land), role = ROLES.indexOf(stn.role);
      for (const L of leadsAll) {
        if (day0 && L < 51) continue;
        const st = byMs.get(t0Ms + L * H);
        if (!st || (day0 && st.tier !== 't2' && st.tier !== 't3')) continue;
        const w = windowIdx(L); if (w < 0) continue;
        const stepH = stepHoursOf(proto, L);
        for (const v of VARS) {
          const fv = st.fused[KEY[v]];
          if (!fv || KIND[fv.dist.kind] == null) continue;
          const y = truthValue(w1, s, st.validAtMs, v, stepH);
          if (!Number.isFinite(y)) continue;
          push(cellKey(v, w, land, role), [...distRow(fv.dist), y, L]); rowsN += 1;
          const li = RHO_LEADS.indexOf(L);
          if (li >= 0 && RHO_VARS.includes(v)) err[v][li][s] = y - eng.quantileOf(fv.dist, 0.5);
        }
      }
    }
    if (!day0) {
      for (const v of RHO_VARS) {
        const acc = rho[v];
        for (let li = 0; li < RHO_LEADS.length; li++) {
          const e = err[v][li];
          for (const [i, j, b] of pairs) {
            const x = e[i], y = e[j];
            if (x !== x || y !== y) continue;
            const o = b * 6;
            acc[o] += 1; acc[o + 1] += x; acc[o + 2] += y; acc[o + 3] += x * y; acc[o + 4] += x * x; acc[o + 5] += y * y;
          }
        }
      }
    }
    console.log(`  ${si + 1}/${used.length} ${sl.day} ${sl.hr}z (${sl.win}): ${((Date.now() - t0) / 1000).toFixed(0)} s, Aufrufe ${calls}, Zeilen ${rowsN}, Fehler ${errors}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    kind: 'obsfusion/of7-part', part: `${pi}/${pn}`, register: regId, date: new Date().toISOString(), slots: used.map((s) => `${s.day}T${String(s.hr).padStart(2, '0')}`),
    tresor: { from: proto.tresor.from, to: proto.tresor.to }, archiveFrom: ARCHIVE_FROM, calls, errors, rows: rowsN, reservoirMax: RES_MAX, dBins: D_BINS, hBins: H_BINS.map((x) => (Number.isFinite(x) ? x : null)), rhoLeads: RHO_LEADS,
    rho: Object.fromEntries(RHO_VARS.map((v) => [v, Array.from(rho[v])])),
    cells: Object.fromEntries([...res.entries()].map(([k, c]) => [k, { n: c.n, rows: c.rows.map((x) => Math.round(x * 1e4) / 1e4) }])),
  };
  const path = join(OUT_DIR, `part-${pi}.json`);
  writeFileSync(path, JSON.stringify(out));
  console.log(`geschrieben: ${path} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${res.size} Zellen)`);
}

// ── fit ────────────────────────────────────────────────────────────────────────
async function fit() {
  const D = await import('../../src/pointForecast/fusion/dist.ts');
  const files = readdirSync(OUT_DIR).filter((f) => /^part-\d+\.json$/.test(f)).map((f) => join(OUT_DIR, f));
  if (!files.length) throw new Error(`of7 fit: keine Teile in ${OUT_DIR}`);
  const parts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  console.log(`of7 fit: ${parts.length} Teil(e), ${parts.reduce((a, p) => a + p.slots.length, 0)} Slots, ${parts.reduce((a, p) => a + p.rows, 0)} Zeilen`);
  const taus = proto.quantiles, nq = taus.length, i10 = taus.findIndex((x) => Math.abs(x - 0.1) < 1e-9), i90 = taus.findIndex((x) => Math.abs(x - 0.9) < 1e-9);
  // merged rows per cell: [{ w, rows: Float64Array }] (weight = n/kept of the part)
  const cells = new Map();
  for (const p of parts) for (const [k, c] of Object.entries(p.cells)) {
    const kept = c.rows.length / RF;
    if (!cells.has(k)) cells.set(k, { n: 0, chunks: [] });
    const e = cells.get(k); e.n += c.n; e.chunks.push({ w: c.n / kept, rows: Float64Array.from(c.rows) });
  }
  const rowToDist = (b, o, s) => (b[o] === 0 ? { kind: 'normal', mu: b[o + 1], sigma: b[o + 2] * s } : b[o] === 1 ? { kind: 'truncatedNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3] } : b[o] === 3 ? { kind: 'censoredNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3], hi: 90 } : { kind: 'rice', nu: b[o + 1], sigma: b[o + 2] * s });
  /** Scale at lead L from the nodes (piecewise linear between window centres, flat outside). */
  const centres = windows.map((w) => (w.fromH + w.toH) / 2);
  const scaleAt = (nodes, L) => {
    if (L <= centres[0]) return nodes[0];
    for (let i = 1; i < centres.length; i++) if (L <= centres[i]) { const f = (L - centres[i - 1]) / (centres[i] - centres[i - 1]); return nodes[i - 1] + f * (nodes[i] - nodes[i - 1]); }
    return nodes[nodes.length - 1];
  };
  /** Weighted coverage q10–q90 (and mean CRPS_Q, optional) over the chunks of a set of cells at scale nodes. */
  const qBuf = new Float64Array(nq);
  const evalCells = (keys, nodes, withCrps = false, stride = 1) => {
    let cov = 0, wsum = 0, crps = 0;
    for (const k of keys) {
      const e = cells.get(k); if (!e) continue;
      for (const ch of e.chunks) {
        const b = ch.rows, n = b.length / RF;
        for (let i = 0; i < n; i += stride) {
          const o = i * RF, d = rowToDist(b, o, scaleAt(nodes, b[o + 5])), y = b[o + 4];
          const lo = D.quantileOf(d, 0.1), hi = D.quantileOf(d, 0.9);
          cov += ch.w * (y >= lo && y <= hi ? 1 : 0); wsum += ch.w;
          if (withCrps) { for (let q = 0; q < nq; q++) qBuf[q] = D.quantileOf(d, taus[q]); crps += ch.w * crpsQ(taus, qBuf, y, 0); }
        }
      }
    }
    return { cov: wsum ? cov / wsum : NaN, crps: wsum ? crps / wsum : NaN, w: wsum };
  };
  const keysOf = (v, w, lands = LANDS, roles = ROLES) => lands.flatMap((l) => roles.map((r) => `${v}|${windows[w].id}|${l}|${r}`));
  const nOf = (keys) => keys.reduce((a, k) => a + (cells.get(k)?.n ?? 0), 0);
  const NOMINAL = proto.gates.G3.nominal, MIN_ROWS = 2000, S_LO = 0.6, S_HI = 1.6;
  const result = { kind: 'obsfusion/of7-fit', date: new Date().toISOString(), register: parts[0].register, parts: parts.map((p) => ({ part: p.part, slots: p.slots.length, rows: p.rows, calls: p.calls, errors: p.errors })), tresor: parts[0].tresor, archiveFrom: parts[0].archiveFrom, rule: { nominal: NOMINAL, minRows: MIN_ROWS, clamp: [S_LO, S_HI], note: 'one node per window, fitted jointly so that every window of the pooled rows (all countries, both roles) covers the nominal share; piecewise linear in lead between the window centres; 3 coordinate sweeps of bisection per window; a window with fewer than minRows rows keeps 1' }, windows: windows.map((w) => w.id), centresH: centres, sigmaScale: {}, rho: {} };
  // (2) σ-scale
  /** Joint fit of the six nodes on the cells `keysForW(w)` — every window with enough rows is fitted JOINTLY (the interpolation
   * couples neighbouring nodes — a node held at 1 would leave its window off the nominal value once the neighbours move); a
   * window with few rows keeps 1. */
  const fitJoint = (keysForW) => {
    const nodes = windows.map(() => 1), before = [], n = [];
    for (let w = 0; w < windows.length; w++) { const keys = keysForW(w); before.push(evalCells(keys, nodes).cov); n.push(nOf(keys)); }
    const fitW = windows.map((_, w) => Number.isFinite(before[w]) && n[w] >= MIN_ROWS);
    for (let sweep = 0; sweep < 3; sweep++) for (let w = 0; w < windows.length; w++) {
      if (!fitW[w]) continue;
      const keys = keysForW(w);
      let lo = S_LO, hi = S_HI;
      for (let it = 0; it < 18; it++) { const mid = 0.5 * (lo + hi); nodes[w] = mid; if (evalCells(keys, nodes).cov < NOMINAL) lo = mid; else hi = mid; }
      nodes[w] = Math.round(0.5 * (lo + hi) * 1000) / 1000;
    }
    const after = windows.map((_, w) => evalCells(keysForW(w), nodes).cov);
    return { nodes, before, after, n, fitted: fitW };
  };
  for (const v of VARS) {
    const { nodes, before, after, n, fitted: fitW } = fitJoint((w) => keysOf(v, w));
    // V-OF-16: the same joint fit per country (nodes by land) from the same reservoirs
    const byLandNodes = {};
    for (const l of LANDS) { const r = fitJoint((w) => keysOf(v, w, [l])); byLandNodes[l] = { nodes: r.nodes, before: r.before, after: r.after, n: r.n }; }
    const byLand = {}, byRole = {};
    for (const l of LANDS) byLand[l] = windows.map((_, w) => { const ks = keysOf(v, w, [l]); return { n: nOf(ks), before: evalCells(ks, windows.map(() => 1)).cov, after: evalCells(ks, nodes).cov }; });
    for (const r of ROLES) byRole[r] = windows.map((_, w) => { const ks = keysOf(v, w, LANDS, [r]); return { n: nOf(ks), before: evalCells(ks, windows.map(() => 1)).cov, after: evalCells(ks, nodes).cov }; });
    const crps = windows.map((_, w) => { const ks = keysOf(v, w); const a = evalCells(ks, windows.map(() => 1), true, 4), b = evalCells(ks, nodes, true, 4); return { before: a.crps, after: b.crps, skill: 1 - b.crps / a.crps }; });
    const kinds = {}; for (let w = 0; w < windows.length; w++) for (const k of keysOf(v, w)) { const e = cells.get(k); if (!e) continue; for (const ch of e.chunks) for (let i = 0; i < ch.rows.length; i += RF) { const kk = KINDS[ch.rows[i]]; kinds[kk] = (kinds[kk] ?? 0) + 1; } }
    result.sigmaScale[v] = { nodes, fitted: fitW, n, before, after, byLand, byRole, crps, kinds, byLandNodes };
    console.log(`σ-Skala ${v}: ${windows.map((w, i) => `${w.id} n ${n[i]} ${(100 * before[i]).toFixed(1)} → ${(100 * after[i]).toFixed(1)} % s ${nodes[i]}${fitW[i] ? '' : ' (=1)'} CRPS ${(100 * crps[i].skill).toFixed(2)} %`).join(' · ')}`);
    for (const l of LANDS) console.log(`  je Land ${l}: ${windows.map((w, i) => `${w.id} ${(100 * byLandNodes[l].before[i]).toFixed(1)} → ${(100 * byLandNodes[l].after[i]).toFixed(1)} % s ${byLandNodes[l].nodes[i]}`).join(' · ')}`);
  }
  // (1) ρ(d, Δh)
  const nD = D_BINS.length - 1, nH = H_BINS.length - 1;
  const spatialWeight = (dM, dhM) => (1 / (1 + (dM / 20_000) ** 2)) * (1 / (1 + (dhM / 200) ** 2));
  // Form: ρ = ρ₀ · (c + (1 − c)·e^(−d/D)) / (1 + (Δh/H)²) — an exponential decay over distance on a FLOOR c (the shared synoptic
  // error: the bins keep 0,08–0,12 at 60–120 km, which the Cauchy product of spatialWeight cannot carry without flattening the
  // near range — T 2,5 km: 0,71 measured, 0,45 with the Cauchy form at capped weights); height like spatialWeight.
  const form = (p, dKm, dhM) => (p.rho0 * (p.c + (1 - p.c) * Math.exp(-dKm / p.dKm))) / (1 + (dhM / p.hM) ** 2);
  const GRID_R0 = [], GRID_C = [], GRID_D = [3, 5, 7, 10, 12, 15, 20, 25, 30, 40, 50, 80, 120], GRID_H = [50, 100, 150, 200, 300, 500, 800, 1200, 2000, 4000, 10000];
  for (let c = 0; c <= 0.5001; c += 0.02) GRID_C.push(Math.round(c * 100) / 100);
  const RHO_W_CAP = 5000;
  result.rule.rhoWeight = `min(n, ${RHO_W_CAP}) je Bin (Bins mit n < 200 ausgelassen)`;
  result.rule.rhoForm = 'ρ₀·(c + (1 − c)·e^(−d/D)) / (1 + (Δh/H)²)';
  for (let r = 0.2; r <= 1.0001; r += 0.01) GRID_R0.push(Math.round(r * 100) / 100);
  for (const v of RHO_VARS) {
    const acc = new Float64Array(nD * nH * 6);
    for (const p of parts) { const a = p.rho[v]; for (let i = 0; i < acc.length; i++) acc[i] += a[i]; }
    const table = [];
    for (let db = 0; db < nD; db++) for (let hb = 0; hb < nH; hb++) {
      const o = (db * nH + hb) * 6, n = acc[o];
      if (n < 200) { table.push({ dKm: [D_BINS[db], D_BINS[db + 1]], dhM: [H_BINS[hb], Number.isFinite(H_BINS[hb + 1]) ? H_BINS[hb + 1] : null], n, rho: null }); continue; }
      const mx = acc[o + 1] / n, my = acc[o + 2] / n, cxy = acc[o + 3] / n - mx * my, vx = acc[o + 4] / n - mx * mx, vy = acc[o + 5] / n - my * my;
      const rho = vx > 0 && vy > 0 ? cxy / Math.sqrt(vx * vy) : null;
      table.push({ dKm: [D_BINS[db], D_BINS[db + 1]], dhM: [H_BINS[hb], Number.isFinite(H_BINS[hb + 1]) ? H_BINS[hb + 1] : null], n, rho: rho == null ? null : Math.round(rho * 1000) / 1000, mid: { dKm: 0.5 * (D_BINS[db] + D_BINS[db + 1]), dhM: Number.isFinite(H_BINS[hb + 1]) ? 0.5 * (H_BINS[hb] + H_BINS[hb + 1]) : H_BINS[hb] * 1.5 } });
    }
    // weighted least squares on the bins (the bin's representative point is the midpoint). Weight = min(n, RHO_W_CAP): a bin's ρ
    // is precise enough at a few thousand pairs (SE ≈ 1/√n) — with the plain n the 60–120 km bins (hundreds of thousands of
    // pairs) dictated the fit and the near bins, where the anchor's stations live, came out far too low (T 2,5 km: 0,71 measured,
    // 0,28 fitted). Corrected before the Prüfstand run (§11.2).
    let best = null;
    for (const rho0 of GRID_R0) for (const c of GRID_C) for (const dKm of GRID_D) for (const hM of GRID_H) {
      let sse = 0;
      for (const b of table) { if (b.rho == null) continue; const e = b.rho - form({ rho0, c, dKm, hM }, b.mid.dKm, b.mid.dhM); sse += Math.min(b.n, RHO_W_CAP) * e * e; }
      if (!best || sse < best.sse) best = { rho0, c, dKm, hM, sse };
    }
    const cmp = table.filter((b) => b.rho != null).map((b) => ({ dKm: b.mid.dKm, dhM: b.mid.dhM, n: b.n, rho: b.rho, fit: Math.round(form(best, b.mid.dKm, b.mid.dhM) * 1000) / 1000, spatialWeight: Math.round(spatialWeight(b.mid.dKm * 1000, b.mid.dhM) * 1000) / 1000 }));
    const nearRms = Math.sqrt(cmp.filter((x) => x.dKm <= 20).reduce((a, x) => a + (x.rho - x.fit) ** 2, 0) / Math.max(1, cmp.filter((x) => x.dKm <= 20).length));
    result.rho[v] = { params: { rho0: best.rho0, c: best.c, dKm: best.dKm, hM: best.hM }, sse: best.sse, nearRms: Math.round(nearRms * 1000) / 1000, table, compare: cmp, pairsN: table.reduce((a, b) => a + b.n, 0) };
    console.log(`ρ ${v}: ρ0 ${best.rho0} c ${best.c} D ${best.dKm} km H ${best.hM} m (RMS ≤ 20 km ${nearRms.toFixed(3)}) · ${cmp.filter((x) => x.dhM < 100).map((x) => `${x.dKm} km ${x.rho}→${x.fit} (sw ${x.spatialWeight})`).join(' · ')}`);
  }
  mkdirSync(join(OUT_FIT, '..'), { recursive: true });
  writeFileSync(OUT_FIT, JSON.stringify(result, null, 1));
  console.log(`geschrieben: ${OUT_FIT}`);
}

// ── V-OF-15: the anchor of K stations — what the σ coupling needs is cov/var of the AVERAGED innovation set ─────────────────
// Per point i (hindcast, window A = real stage-1 runs): the K = OBS_DENSE_ANCHOR_K best of the 12 nearest OTHER stations by
// spatialWeight (the dense-set rule), weights w_j = spatialWeight (T) or spatialWeight·e^(−(d/10 km)²) (wind, gust — E-AX-11);
// Ī = Σ w_j e_j(1 h) / Σ w_j, f = max w_j. Accumulated per variable × f-class × lead τ: n, Σe_τ, ΣĪ, Σe_τĪ, Σe_τ², ΣĪ², Σe_τe_1
// (e_1 = the point's own error at 1 h, for w(τ) on the same rows). From that: C = cov(e_1, Ī)/var(e_1), V = var(Ī)/var(e_1),
// R(τ) = cov(e_τ, Ī)/var(e_1) and w(τ) = cov(e_τ, e_1)/var(e_1) — the factorisation check R(τ) ≈ w(τ)·C.
const KSET_K = 6, KSET_NEAREST = 12, KSET_WIND_KM = 10;
const KSET_TAUS = [1, 2, 3, 4, 6, 9, 12, 18, 24, 36, 48];
const F_CLASSES = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0001];
const fClass = (f) => { for (let i = 0; i < F_CLASSES.length - 1; i++) if (f >= F_CLASSES[i] && f < F_CLASSES[i + 1]) return i; return -1; };
const spatialWeightOf = (dM, dhM) => (1 / (1 + (dM / 20_000) ** 2)) * (1 / (1 + (dhM / 200) ** 2));
const KV = ['t', 'ws', 'gust'];
const KF = 7;   // sums per (var, class, tau)
const KSET_MIN_N = 2000;

/** Window A at EVERY day and all four daily slots (00/06/12/18 UTC): the high-f classes (close stations) are rare in the
 * Prüfnetz spacing and need every row; a slot costs only 4 s here (48-h window). */
function slotList15() {
  const out = [];
  const di = (d) => Math.round(dayMs(d) / 86_400_000);
  for (let d = di('2026-06-18'); d <= di('2026-09-13'); d += 1) {
    const day = isoDay(d * 86_400_000);
    if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`of7: ${day} liegt im Tresor — verboten`);
    if (day >= ARCHIVE_FROM) throw new Error(`of7: ${day} liegt in der Entwicklungsmenge — verboten`);
    for (const hr of [0, 6, 12, 18]) { const ms = d * 86_400_000 + hr * H; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr, ms, path, win: 'A' }); }
  }
  return out;
}

async function collect15() {
  const [pi, pn] = String(args.part ?? '1/1').split('/').map(Number);
  const slots = slotList15().filter((_, i) => i % pn === pi - 1);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const used = slots.slice(0, limit);
  console.log(`of7 collect15 Teil ${pi}/${pn}: ${used.length} Slots (Fenster A), Register ${regId}`);
  const eng = await loadEngine(REPO);
  const reg = withTablePaths(loadRegister(regId));
  const tables = loadTables(reg);
  const w1 = openW1(proto);
  const feat = features().byPoint;
  const stations = proto.scored;
  const nSt = stations.length;
  const opts = { ...reg.options, hourly: true, tail: true };
  const climaOf = (row, held) => (reg.clima === 'loso' || (held && reg.climaHeldOut === 'loso') ? A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row) : tables.clima);
  // per point: the 12 nearest other stations, then the K best by spatialWeight; weights per variable family
  const kset = [];
  for (let i = 0; i < nSt; i++) {
    const near = [];
    for (let j = 0; j < nSt; j++) { if (j === i) continue; near.push({ j, dM: distKm(stations[i], stations[j]) * 1000, dhM: Math.abs(stations[j].elevM - stations[i].elevM) }); }
    near.sort((a, b) => a.dM - b.dM);
    const cand = near.slice(0, KSET_NEAREST).map((c) => ({ ...c, wsp: spatialWeightOf(c.dM, c.dhM) }));
    cand.sort((a, b) => b.wsp - a.wsp || a.dM - b.dM);
    const best = cand.slice(0, KSET_K);
    kset.push({
      t: best.map((c) => ({ j: c.j, w: c.wsp })),
      wind: best.map((c) => ({ j: c.j, w: c.wsp * Math.exp(-((c.dM / (KSET_WIND_KM * 1000)) ** 2)) })).filter((c) => c.w > 0),
    });
  }
  const nC = F_CLASSES.length - 1, nT = KSET_TAUS.length;
  const acc = Object.fromEntries(KV.map((v) => [v, new Float64Array(nC * nT * KF)]));
  const err = Object.fromEntries(KV.map((v) => [v, KSET_TAUS.map(() => new Float64Array(nSt).fill(NaN))]));
  const t0 = Date.now();
  let errors = 0, calls = 0, points = 0;
  for (let si = 0; si < used.length; si++) {
    const sl = used[si];
    const slot = readHindcastSlot(sl.path);
    const t0Ms = slot.slotAtMs;
    if (slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run) { console.log(`  ${sl.day} ${sl.hr}z: t1 ohne Lauf — übersprungen`); continue; }
    for (const v of KV) for (const e of err[v]) e.fill(NaN);
    for (let s = 0; s < nSt; s++) {
      const stn = stations[s], row = feat[stn.id];
      const series = {};
      for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stn.id); if (ser) series[t] = ser; }
      if (!Object.keys(series).length) continue;
      const window = { fromMs: t0Ms, toMs: t0Ms + 48 * H, stepH: 1 };
      const input = { ...inputFromSlot(slot, row, series, eng.clima, { nowMs: t0Ms, window }), country: row.country ?? null, learned: tables.learned, learnedClima: climaOf(row, stn.role === 'B'), ...(tables.stack ? { stack: tables.stack } : {}) };
      let r;
      try { r = eng.fuseCubePoint(input, opts); } catch (e) { errors += 1; if (errors <= 3) console.error(`  ${stn.id}: ${e?.message ?? e}`); continue; }
      calls += 1;
      const byMs = new Map();
      for (const st of r.steps) if (st.fused) byMs.set(st.validAtMs, st);
      for (let ti = 0; ti < nT; ti++) {
        const L = KSET_TAUS[ti], st = byMs.get(t0Ms + L * H);
        if (!st) continue;
        for (const v of KV) {
          const fv = st.fused[KEY[v]]; if (!fv) continue;
          const y = truthValue(w1, s, st.validAtMs, v, 1);
          if (Number.isFinite(y)) err[v][ti][s] = y - eng.quantileOf(fv.dist, 0.5);
        }
      }
    }
    for (const v of KV) {
      const fam = v === 't' ? 't' : 'wind';
      for (let i = 0; i < nSt; i++) {
        const e1 = err[v][0][i];
        if (e1 !== e1) continue;
        let sw = 0, sI = 0, f = 0, cnt = 0;
        for (const { j, w } of kset[i][fam]) { const ej = err[v][0][j]; if (ej !== ej) continue; sw += w; sI += w * ej; f = Math.max(f, w); cnt += 1; }
        if (!cnt || !(sw > 0)) continue;
        const I = sI / sw, c = fClass(Math.min(1, f));
        if (c < 0) continue;
        points += v === 't' ? 1 : 0;
        for (let ti = 0; ti < nT; ti++) {
          const et = err[v][ti][i];
          if (et !== et) continue;
          const o = (c * nT + ti) * KF, a = acc[v];
          a[o] += 1; a[o + 1] += et; a[o + 2] += I; a[o + 3] += et * I; a[o + 4] += et * et; a[o + 5] += I * I; a[o + 6] += et * e1;
        }
      }
    }
    console.log(`  ${si + 1}/${used.length} ${sl.day} ${sl.hr}z: ${((Date.now() - t0) / 1000).toFixed(0)} s, Aufrufe ${calls}, Punkte ${points}, Fehler ${errors}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const out = { kind: 'obsfusion/of7-kset-part', part: `${pi}/${pn}`, register: regId, date: new Date().toISOString(), slots: used.map((s) => `${s.day}T${String(s.hr).padStart(2, '0')}`), k: KSET_K, nearest: KSET_NEAREST, windKm: KSET_WIND_KM, taus: KSET_TAUS, fClasses: F_CLASSES, calls, errors, points, acc: Object.fromEntries(KV.map((v) => [v, Array.from(acc[v])])) };
  const path = join(OUT_DIR, `part15-${pi}.json`);
  writeFileSync(path, JSON.stringify(out));
  console.log(`geschrieben: ${path} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

async function fit15() {
  const files = readdirSync(OUT_DIR).filter((f) => /^part15-\d+\.json$/.test(f)).map((f) => join(OUT_DIR, f));
  if (!files.length) throw new Error(`of7 fit15: keine Teile in ${OUT_DIR}`);
  const parts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const nC = F_CLASSES.length - 1, nT = KSET_TAUS.length;
  const result = { kind: 'obsfusion/of7-kset-fit', date: new Date().toISOString(), register: parts[0].register, parts: parts.map((p) => ({ part: p.part, slots: p.slots.length, calls: p.calls, points: p.points, errors: p.errors })), k: KSET_K, nearest: KSET_NEAREST, windKm: KSET_WIND_KM, taus: KSET_TAUS, fClasses: F_CLASSES, vars: {} };
  for (const v of KV) {
    const a = new Float64Array(nC * nT * KF);
    for (const p of parts) { const b = p.acc[v]; for (let i = 0; i < a.length; i++) a[i] += b[i]; }
    const classes = [];
    for (let c = 0; c < nC; c++) {
      const o1 = (c * nT + 0) * KF, n1 = a[o1];
      const me = a[o1 + 1] / n1, mI = a[o1 + 2] / n1;
      const varE1 = a[o1 + 4] / n1 - me * me, varI = a[o1 + 5] / n1 - mI * mI, cov1 = a[o1 + 3] / n1 - me * mI;
      const C = cov1 / varE1, V = varI / varE1;
      // quality rule of a class: ≥ KSET_MIN_N rows and C > 0 (a negative C — the innovation set anti-correlated with the point's
      // error — is not an anchor, it is noise of a thin class: wind/gust f 0,85–1 had 704 rows and C −0,29 at the 500-row rule)
      if (!(n1 >= KSET_MIN_N) || !(C > 0)) { classes.push({ f: [F_CLASSES[c], Math.min(1, F_CLASSES[c + 1])], n: n1, C: null, V: null, raw: n1 ? { C: Math.round(C * 1000) / 1000, V: Math.round(V * 1000) / 1000 } : null }); continue; }
      const byTau = KSET_TAUS.map((tau, ti) => {
        const o = (c * nT + ti) * KF, n = a[o];
        if (n < 500) return { tau, n, R: null, w: null };
        const mt = a[o + 1] / n, mi = a[o + 2] / n;
        const covTI = a[o + 3] / n - mt * mi, covT1 = a[o + 6] / n - mt * me;
        return { tau, n, R: Math.round((covTI / varE1) * 1000) / 1000, w: Math.round((covT1 / varE1) * 1000) / 1000, ratio: covT1 !== 0 ? Math.round(((covTI / varE1) / (C * (covT1 / varE1))) * 100) / 100 : null };
      });
      classes.push({ f: [F_CLASSES[c], Math.min(1, F_CLASSES[c + 1])], n: n1, C: Math.round(C * 1000) / 1000, V: Math.round(V * 1000) / 1000, sdE1: Math.round(Math.sqrt(varE1) * 1000) / 1000, sdI: Math.round(Math.sqrt(varI) * 1000) / 1000, byTau });
    }
    result.vars[v] = classes;
    console.log(`K-Satz ${v}: ${classes.map((c) => `f ${c.f[0]}–${c.f[1]}: n ${c.n} C ${c.C} V ${c.V}${c.byTau ? ` (R/wC bei τ 2/4/6/24: ${[1, 3, 4, 8].map((i) => c.byTau[i].ratio ?? '—').join('/')})` : ''}`).join(' · ')}`);
  }
  const outPath = String(args.out ?? join(REPO, 'audit/obs-fusion/of7-kset.json'));
  writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log(`geschrieben: ${outPath}`);
}

if (args.collect) await collect();
else if (args.fit) await fit();
else if (args.collect15) await collect15();
else if (args.fit15) await fit15();
else { console.error('of7: --collect [--part=i/n] [--limit=n] | --fit | --collect15 [--part=i/n] | --fit15'); process.exit(2); }
