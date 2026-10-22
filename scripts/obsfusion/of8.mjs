#!/usr/bin/env node
/**
 * of8.mjs — phase OF, step OF-8 (`audit/obs-fusion.md` §15): the short-lead σ-scale of the candidate `fusion-12w`, measured on
 * hindcast slots OUTSIDE the vault of the Prüfstand (2024-04-01 … 2025-08-31) and BEFORE the development set of track P
 * (archive from 2026-09-14). Two windows:
 *
 *   A  stage-1 runs (route `run`) 2026-06-18 … 2026-09-13, every 2nd day, 00 + 12 UTC — leads 1 … 6 h (summer, real runs),
 *      the chain without anchor (the hindcast carries no measurements), window 8 h (byte-identical to the 336-h window at
 *      leads 1–6, probe of 22.10., 4 instead of 46 ms per point).
 *   C  the Tag-0 series (route `day0`, the youngest forecast per hour), 00 UTC — the only hour with a Tag-0 stage 1 (V-OF-23):
 *      C1 2023-06-01 … 2024-03-24 (ICON-D2 + ICON-EU, IFS from 25.01.2024), C2 2025-09-08 … 2026-06-16 (five models); leads 1–2 h,
 *      called exactly like `predictHindcast` calls a Tag-0 slot (only `t1`, window 2 h) — the data type of track R.
 *
 * Rows per cell key `var|lead|land|role|win:seasonYear:hour` (reservoir sampling, weight n/kept at the fit). Window C also
 * accumulates the K-set statistic of V-OF-15 at τ = 1, 2 split by DJF / rest (diagnosis only).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/obsfusion/of8.mjs --collect --win=A|C [--part=i/n] [--limit=n]
 *   node … scripts/obsfusion/of8.mjs --fit
 *
 * Rule before the numbers (§15.5): nodes 1,5 h / 4,5 h from window A per variable (ws, gust) and country, jointly fitted on 80 %
 * coverage; seasonal factor R = N_C(all seasons) / N_C(JJA) from window C at the same hour; candidate node = clamp(n(A) · R) in
 * [0,6; 1,6]; t/td stay 1 and are only reported.
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
import { crpsQ } from '../../src/pruefstand/metrics.ts';

const args = parseArgs();
const proto = loadProtocol();
const VARS = ['t', 'td', 'ws', 'gust'];
const KEY = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust' };
const LANDS = ['DE', 'AT', 'CH'];
const ROLES = ['A', 'B'];
const KIND = { normal: 0, truncatedNormal: 1, rice: 2, censoredNormal: 3 };
const RF = 5;   // reservoir row: kind p1 p2 p3 y   (the lead is part of the key)
const RES_MAX = Number(args.reservoir ?? 4000);
const ARCHIVE_FROM = '2026-09-14';                 // first day of the development set of track P (never touched)
const OUT_DIR = join(REPO, 'audit/obs-fusion/of8');
const OUT_FIT = String(args.out ?? join(REPO, 'audit/obs-fusion/of8-fit.json'));
const regId = String(args.register ?? 'fusion-12v');
const WIN = { A: { leads: [1, 2, 3, 4, 5, 6], toH: 8 }, C: { leads: [1, 2], toH: 2 } };
const CENTRES = [1.5, 4.5];                        // the two short-lead nodes of the candidate table
const NOMINAL = proto.gates.G3.nominal, MIN_ROWS = 2000, S_LO = 0.6, S_HI = 1.6;

const seasonOf = (day) => { const m = Number(day.slice(5, 7)), y = Number(day.slice(0, 4)); return m === 12 ? `${y}-DJF` : m <= 2 ? `${y - 1}-DJF` : m <= 5 ? `${y}-MAM` : m <= 8 ? `${y}-JJA` : `${y}-SON`; };
const guard = (day) => {
  if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`of8: ${day} liegt im Tresor — verboten`);
  if (day >= ARCHIVE_FROM) throw new Error(`of8: ${day} liegt in der Entwicklungsmenge (Archiv ab ${ARCHIVE_FROM}) — verboten`);
};
const di = (d) => Math.round(dayMs(d) / 86_400_000);

// ── slot lists ─────────────────────────────────────────────────────────────────
function slotList(win) {
  const out = [];
  if (win === 'A') {
    for (let d = di('2026-06-18'); d <= di('2026-09-13'); d += 2) {
      const day = isoDay(d * 86_400_000); guard(day);
      for (const hr of [0, 12]) { const ms = d * 86_400_000 + hr * H; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr, ms, path, win }); }
    }
  } else if (win === 'C') {
    for (const [from, to] of [['2023-06-01', '2024-03-24'], ['2025-09-08', '2026-06-16']]) {
      for (let d = di(from); d <= di(to); d += 1) {
        const day = isoDay(d * 86_400_000); guard(day);
        const ms = d * 86_400_000; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr: 0, ms, path, win });
      }
    }
  } else throw new Error(`of8: --win=A|C, nicht ${win}`);
  return out;
}

// ── K-set statistic (V-OF-15) at τ = 1, 2 on the Tag-0 series ───────────────────
const KSET_K = 6, KSET_NEAREST = 12, KSET_WIND_KM = 10;
const KSET_TAUS = [1, 2];
const F_CLASSES = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0001];
const fClass = (f) => { for (let i = 0; i < F_CLASSES.length - 1; i++) if (f >= F_CLASSES[i] && f < F_CLASSES[i + 1]) return i; return -1; };
const spatialWeightOf = (dM, dhM) => (1 / (1 + (dM / 20_000) ** 2)) * (1 / (1 + (dhM / 200) ** 2));
const KV = ['t', 'ws', 'gust'];
const KF = 7, KGROUPS = ['DJF', 'rest'];

// ── collect ────────────────────────────────────────────────────────────────────
async function collect() {
  const win = String(args.win ?? '');
  const [pi, pn] = String(args.part ?? '1/1').split('/').map(Number);
  const slots = slotList(win).filter((_, i) => i % pn === pi - 1);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const used = slots.slice(0, limit);
  console.log(`of8 collect Fenster ${win} Teil ${pi}/${pn}: ${used.length} Slots, Register ${regId}`);
  const eng = await loadEngine(REPO);
  const reg = withTablePaths(loadRegister(regId));
  const tables = loadTables(reg);
  const w1 = openW1(proto);
  const feat = features().byPoint;
  const stations = proto.scored;
  const nSt = stations.length;
  const opts = { ...reg.options, hourly: true, tail: true };
  const climaOf = (row, held) => (reg.clima === 'loso' || (held && reg.climaHeldOut === 'loso') ? A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row) : tables.clima);
  const res = new Map();   // key → { n, rows }
  const push = (key, row) => {
    let c = res.get(key); if (!c) { c = { n: 0, rows: [] }; res.set(key, c); }
    c.n += 1;
    if (c.rows.length < RES_MAX * RF) { c.rows.push(...row); return; }
    const k = Math.floor(Math.random() * c.n);
    if (k < RES_MAX) { const o = k * RF; for (let f = 0; f < RF; f++) c.rows[o + f] = row[f]; }
  };
  const distRow = (d) => [KIND[d.kind], d.kind === 'rice' ? d.nu : d.mu, d.sigma, d.kind === 'truncatedNormal' || d.kind === 'censoredNormal' ? d.lo : 0];
  // K-set (window C only)
  const kset = [];
  if (win === 'C') for (let i = 0; i < nSt; i++) {
    const near = [];
    for (let j = 0; j < nSt; j++) { if (j === i) continue; near.push({ j, dM: distKm(stations[i], stations[j]) * 1000, dhM: Math.abs(stations[j].elevM - stations[i].elevM) }); }
    near.sort((a, b) => a.dM - b.dM);
    const cand = near.slice(0, KSET_NEAREST).map((c) => ({ ...c, wsp: spatialWeightOf(c.dM, c.dhM) }));
    cand.sort((a, b) => b.wsp - a.wsp || a.dM - b.dM);
    const best = cand.slice(0, KSET_K);
    kset.push({ t: best.map((c) => ({ j: c.j, w: c.wsp })), wind: best.map((c) => ({ j: c.j, w: c.wsp * Math.exp(-((c.dM / (KSET_WIND_KM * 1000)) ** 2)) })).filter((c) => c.w > 0) });
  }
  const nC = F_CLASSES.length - 1, nT = KSET_TAUS.length;
  const acc = Object.fromEntries(KV.map((v) => [v, new Float64Array(KGROUPS.length * nC * nT * KF)]));
  const err = Object.fromEntries(KV.map((v) => [v, KSET_TAUS.map(() => new Float64Array(nSt).fill(NaN))]));
  const t0 = Date.now();
  let errors = 0, calls = 0, rowsN = 0, skipped = 0;
  const leads = WIN[win].leads, toH = WIN[win].toH;
  for (let si = 0; si < used.length; si++) {
    const sl = used[si];
    const slot = readHindcastSlot(sl.path);
    const t0Ms = slot.slotAtMs;
    const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
    if (win === 'A' && day0) { console.log(`  ${sl.day} ${sl.hr}z: t1 ohne Lauf — übersprungen`); skipped += 1; continue; }
    if (win === 'C' && (!day0 || !slot.cube.t1)) { console.log(`  ${sl.day} ${sl.hr}z: keine Tag-0-Stufe 1 — übersprungen`); skipped += 1; continue; }
    const tag = `${win}:${seasonOf(sl.day)}:${String(sl.hr).padStart(2, '0')}`;
    const kg = seasonOf(sl.day).endsWith('DJF') ? 0 : 1;
    for (const v of KV) for (const e of err[v]) e.fill(NaN);
    for (let s = 0; s < nSt; s++) {
      const stn = stations[s], row = feat[stn.id];
      const series = {};
      for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stn.id); if (ser) series[t] = ser; }
      const cube = win === 'C' ? (series.t1 ? { t1: series.t1 } : null) : (series.t1 ? series : null);
      if (!cube) continue;
      const window = { fromMs: t0Ms, toMs: t0Ms + toH * H, stepH: 1 };
      const input = { ...inputFromSlot(slot, row, cube, eng.clima, { nowMs: t0Ms, window }), country: row.country ?? null, learned: tables.learned, learnedClima: climaOf(row, stn.role === 'B'), ...(tables.stack ? { stack: tables.stack } : {}) };
      let r;
      try { r = eng.fuseCubePoint(input, opts); } catch (e) { errors += 1; if (errors <= 3) console.error(`  ${stn.id}: ${e?.message ?? e}`); continue; }
      calls += 1;
      const byMs = new Map();
      for (const st of r.steps) if (st.fused) byMs.set(st.validAtMs, st);
      const land = LANDS.indexOf(stn.land), role = ROLES.indexOf(stn.role);
      for (const L of leads) {
        const st = byMs.get(t0Ms + L * H);
        if (!st) continue;
        for (const v of VARS) {
          const fv = st.fused[KEY[v]];
          if (!fv || KIND[fv.dist.kind] == null) continue;
          const y = truthValue(w1, s, st.validAtMs, v, 1);
          if (!Number.isFinite(y)) continue;
          push(`${v}|${L}|${LANDS[land]}|${ROLES[role]}|${tag}`, [...distRow(fv.dist), y]); rowsN += 1;
          const ti = KSET_TAUS.indexOf(L);
          if (win === 'C' && ti >= 0 && KV.includes(v)) err[v][ti][s] = y - eng.quantileOf(fv.dist, 0.5);
        }
      }
    }
    if (win === 'C') for (const v of KV) {
      const fam = v === 't' ? 't' : 'wind';
      for (let i = 0; i < nSt; i++) {
        const e1 = err[v][0][i];
        if (e1 !== e1) continue;
        let sw = 0, sI = 0, f = 0, cnt = 0;
        for (const { j, w } of kset[i][fam]) { const ej = err[v][0][j]; if (ej !== ej) continue; sw += w; sI += w * ej; f = Math.max(f, w); cnt += 1; }
        if (!cnt || !(sw > 0)) continue;
        const I = sI / sw, c = fClass(Math.min(1, f));
        if (c < 0) continue;
        for (let ti = 0; ti < nT; ti++) {
          const et = err[v][ti][i];
          if (et !== et) continue;
          const o = ((kg * nC + c) * nT + ti) * KF, a = acc[v];
          a[o] += 1; a[o + 1] += et; a[o + 2] += I; a[o + 3] += et * I; a[o + 4] += et * et; a[o + 5] += I * I; a[o + 6] += et * e1;
        }
      }
    }
    if ((si + 1) % 10 === 0 || si === used.length - 1) console.log(`  ${si + 1}/${used.length} ${sl.day} ${sl.hr}z: ${((Date.now() - t0) / 1000).toFixed(0)} s, Aufrufe ${calls}, Zeilen ${rowsN}, Fehler ${errors}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    kind: 'obsfusion/of8-part', win, part: `${pi}/${pn}`, register: regId, date: new Date().toISOString(), slots: used.map((s) => `${s.day}T${String(s.hr).padStart(2, '0')}`), skipped,
    tresor: { from: proto.tresor.from, to: proto.tresor.to }, archiveFrom: ARCHIVE_FROM, calls, errors, rows: rowsN, reservoirMax: RES_MAX, leads, toH,
    kset: win === 'C' ? { k: KSET_K, nearest: KSET_NEAREST, windKm: KSET_WIND_KM, taus: KSET_TAUS, fClasses: F_CLASSES, groups: KGROUPS, acc: Object.fromEntries(KV.map((v) => [v, Array.from(acc[v])])) } : null,
    cells: Object.fromEntries([...res.entries()].map(([k, c]) => [k, { n: c.n, rows: c.rows.map((x) => Math.round(x * 1e4) / 1e4) }])),
  };
  const path = join(OUT_DIR, `part-${win}-${pi}.json`);
  writeFileSync(path, JSON.stringify(out));
  console.log(`geschrieben: ${path} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${res.size} Zellen)`);
}

// ── fit ────────────────────────────────────────────────────────────────────────
async function fit() {
  const D = await import('../../src/pointForecast/fusion/dist.ts');
  const files = readdirSync(OUT_DIR).filter((f) => /^part-[AC]-\d+\.json$/.test(f)).map((f) => join(OUT_DIR, f));
  if (!files.length) throw new Error(`of8 fit: keine Teile in ${OUT_DIR}`);
  const parts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const nRows = parts.reduce((a, p) => a + p.rows, 0);
  console.log(`of8 fit: ${parts.length} Teil(e), A ${parts.filter((p) => p.win === 'A').reduce((a, p) => a + p.slots.length, 0)} Slots, C ${parts.filter((p) => p.win === 'C').reduce((a, p) => a + p.slots.length, 0)} Slots, ${nRows} Zeilen`);
  const taus = proto.quantiles, nq = taus.length;
  // merged cells: key → { n, chunks: [{ w, rows }] }
  const cells = new Map();
  for (const p of parts) for (const [k, c] of Object.entries(p.cells)) {
    const kept = c.rows.length / RF;
    if (!cells.has(k)) cells.set(k, { n: 0, chunks: [] });
    const e = cells.get(k); e.n += c.n; e.chunks.push({ w: c.n / kept, rows: Float64Array.from(c.rows) });
  }
  const keys = [...cells.keys()].map((k) => { const [v, L, land, role, tag] = k.split('|'); const [win, sy, hr] = tag.split(':'); return { k, v, L: Number(L), land, role, win, sy, season: sy.slice(5), year: sy.slice(0, 4), hr }; });
  const sel = (f) => keys.filter(f).map((x) => x.k);
  const nOf = (ks) => ks.reduce((a, k) => a + (cells.get(k)?.n ?? 0), 0);
  const rowToDist = (b, o, s) => (b[o] === 0 ? { kind: 'normal', mu: b[o + 1], sigma: b[o + 2] * s } : b[o] === 1 ? { kind: 'truncatedNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3] } : b[o] === 3 ? { kind: 'censoredNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3], hi: 90 } : { kind: 'rice', nu: b[o + 1], sigma: b[o + 2] * s });
  const scaleAt = (nodes, L) => (L <= CENTRES[0] ? nodes[0] : L >= CENTRES[1] ? nodes[1] : nodes[0] + ((L - CENTRES[0]) / (CENTRES[1] - CENTRES[0])) * (nodes[1] - nodes[0]));
  const qBuf = new Float64Array(nq);
  /** Weighted coverage (and CRPS) over the keys at a scale function s(L). */
  const evalKeys = (ks, sOf, withCrps = false, stride = 1) => {
    let cov = 0, wsum = 0, crps = 0;
    for (const k of ks) {
      const e = cells.get(k); if (!e) continue;
      const L = Number(k.split('|')[1]), s = sOf(L);
      for (const ch of e.chunks) {
        const b = ch.rows, n = b.length / RF;
        for (let i = 0; i < n; i += stride) {
          const o = i * RF, d = rowToDist(b, o, s), y = b[o + 4];
          const lo = D.quantileOf(d, 0.1), hi = D.quantileOf(d, 0.9);
          cov += ch.w * (y >= lo && y <= hi ? 1 : 0); wsum += ch.w;
          if (withCrps) { for (let q = 0; q < nq; q++) qBuf[q] = D.quantileOf(d, taus[q]); crps += ch.w * crpsQ(taus, qBuf, y, 0); }
        }
      }
    }
    return { cov: wsum ? cov / wsum : NaN, crps: wsum ? crps / wsum : NaN, w: wsum };
  };
  const bisect = (evalAt) => { let lo = S_LO, hi = S_HI; for (let it = 0; it < 18; it++) { const mid = 0.5 * (lo + hi); if (evalAt(mid) < NOMINAL) lo = mid; else hi = mid; } return Math.round(0.5 * (lo + hi) * 1000) / 1000; };
  /** One constant node on a key set (window C style). */
  const fitConst = (ks) => { const n = nOf(ks); if (n < MIN_ROWS) return { node: null, n, before: n ? evalKeys(ks, () => 1).cov : NaN, after: null }; const node = bisect((s) => evalKeys(ks, () => s).cov); return { node, n, before: evalKeys(ks, () => 1).cov, after: evalKeys(ks, () => node).cov }; };
  /** Two nodes (1,5 h on leads 1–2; 4,5 h on leads 3–6) jointly, three sweeps (window A). */
  const fitTwo = (ksAll) => {
    const k1 = ksAll.filter((k) => Number(k.split('|')[1]) <= 2), k2 = ksAll.filter((k) => Number(k.split('|')[1]) >= 3);
    const n = [nOf(k1), nOf(k2)], nodes = [1, 1], fitted = n.map((x) => x >= MIN_ROWS);
    const before = [evalKeys(k1, () => 1).cov, evalKeys(k2, () => 1).cov];
    for (let sweep = 0; sweep < 3; sweep++) {
      if (fitted[0]) nodes[0] = bisect((s) => evalKeys(k1, (L) => scaleAt([s, nodes[1]], L)).cov);
      if (fitted[1]) nodes[1] = bisect((s) => evalKeys(k2, (L) => scaleAt([nodes[0], s], L)).cov);
    }
    const after = [evalKeys(k1, (L) => scaleAt(nodes, L)).cov, evalKeys(k2, (L) => scaleAt(nodes, L)).cov];
    const byLead = WIN.A.leads.map((L) => { const ks = ksAll.filter((k) => Number(k.split('|')[1]) === L); return { L, n: nOf(ks), before: evalKeys(ks, () => 1).cov, after: evalKeys(ks, (x) => scaleAt(nodes, x)).cov }; });
    return { nodes, fitted, n, before, after, byLead };
  };
  const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
  const clamp = (x) => Math.min(S_HI, Math.max(S_LO, x));
  const LANDSETS = [['all', LANDS], ...LANDS.map((l) => [l, [l]])];
  const result = { kind: 'obsfusion/of8-fit', date: new Date().toISOString(), register: parts[0].register, parts: parts.map((p) => ({ win: p.win, part: p.part, slots: p.slots.length, skipped: p.skipped, rows: p.rows, calls: p.calls, errors: p.errors })), tresor: parts[0].tresor, archiveFrom: parts[0].archiveFrom, centresH: CENTRES, rule: { nominal: NOMINAL, minRows: MIN_ROWS, clamp: [S_LO, S_HI], note: 'window A: two nodes (1,5 h on leads 1–2, 4,5 h on leads 3–6) fitted jointly on 80 % coverage, 3 sweeps of bisection; window C: one constant node on leads 1–2; R = N_C(all seasons)/N_C(JJA); candidate node = clamp(n(A)·R); a set under minRows takes the pooled value (audit §15.5)' }, vars: {}, candidate: {}, kset: null };
  for (const v of VARS) {
    const out = { A: {}, C: {} };
    for (const [name, lands] of LANDSETS) {
      const inL = (x) => lands.includes(x.land);
      // window A: all hours; and per hour (diurnal check, node 1 only)
      const kA = sel((x) => x.v === v && x.win === 'A' && inL(x));
      const a = fitTwo(kA);
      const aByHour = {};
      for (const hr of ['00', '12']) { const ks = sel((x) => x.v === v && x.win === 'A' && inL(x) && x.hr === hr && x.L <= 2); aByHour[hr] = fitConst(ks); }
      const crpsA = (() => { const base = evalKeys(kA, () => 1, true, 4), fitd = evalKeys(kA, (L) => scaleAt(a.nodes, L), true, 4); return { before: base.crps, after: fitd.crps, skill: 1 - fitd.crps / base.crps }; })();
      out.A[name] = { nodes: a.nodes, fitted: a.fitted, n: a.n, before: a.before.map(r3), after: a.after.map(r3), byLead: a.byLead.map((x) => ({ ...x, before: r3(x.before), after: r3(x.after) })), byHour: Object.fromEntries(Object.entries(aByHour).map(([h, x]) => [h, { node: x.node, n: x.n, before: r3(x.before), after: r3(x.after) }])), crps: { before: r3(crpsA.before), after: r3(crpsA.after), skill: r3(crpsA.skill) } };
      // window C: all seasons, JJA, per season, per season-year, per year block
      const kC = sel((x) => x.v === v && x.win === 'C' && inL(x));
      const all = fitConst(kC);
      const jja = fitConst(kC.filter((k) => /-JJA:/.test(k)));
      const bySeason = {}; for (const s of ['DJF', 'MAM', 'JJA', 'SON']) bySeason[s] = fitConst(kC.filter((k) => k.includes(`-${s}:`)));
      const bySeasonYear = {}; for (const sy of [...new Set(keys.filter((x) => x.win === 'C').map((x) => x.sy))].sort()) bySeasonYear[sy] = fitConst(kC.filter((k) => k.includes(`:${sy}:`)));
      const byBlock = { 'C1 2023/24': fitConst(kC.filter((k) => /:(2023|2024)-/.test(k))), 'C2 2025/26': fitConst(kC.filter((k) => /:(2025|2026)-/.test(k))) };
      const byLeadC = WIN.C.leads.map((L) => { const ks = kC.filter((k) => Number(k.split('|')[1]) === L); return { L, n: nOf(ks), before: r3(evalKeys(ks, () => 1).cov) }; });
      const byRole = {}; for (const r of ROLES) { const ks = kC.filter((k) => k.split('|')[3] === r); byRole[r] = { n: nOf(ks), before: r3(evalKeys(ks, () => 1).cov) }; }
      const fmt = (x) => ({ node: x.node, n: x.n, before: r3(x.before), after: r3(x.after) });
      out.C[name] = { all: fmt(all), jja: fmt(jja), R: all.node != null && jja.node != null ? r3(all.node / jja.node) : null, bySeason: Object.fromEntries(Object.entries(bySeason).map(([k, x]) => [k, fmt(x)])), bySeasonYear: Object.fromEntries(Object.entries(bySeasonYear).map(([k, x]) => [k, fmt(x)])), byBlock: Object.fromEntries(Object.entries(byBlock).map(([k, x]) => [k, fmt(x)])), byLead: byLeadC, byRole };
    }
    result.vars[v] = out;
    const pA = out.A.all, pC = out.C.all;
    console.log(`${v}  A gepoolt: Knoten ${pA.nodes.join('/')} (n ${pA.n.join('/')}; vorher ${pA.before.map((x) => (100 * x).toFixed(1)).join('/')} → ${pA.after.map((x) => (100 * x).toFixed(1)).join('/')} %; je Vorlauf vorher ${pA.byLead.map((x) => (100 * x.before).toFixed(1)).join(' ')}; 00z ${pA.byHour['00'].node} 12z ${pA.byHour['12'].node}; CRPS ${(100 * pA.crps.skill).toFixed(2)} %)`);
    console.log(`${v}  C gepoolt: alle ${pC.all.node} (n ${pC.all.n}, vorher ${(100 * pC.all.before).toFixed(1)} %) · JJA ${pC.jja.node} (n ${pC.jja.n}) · R ${pC.R} · Saison ${Object.entries(pC.bySeason).map(([s, x]) => `${s} ${x.node}`).join(' ')} · Block ${Object.entries(pC.byBlock).map(([s, x]) => `${s} ${x.node}`).join(' · ')}`);
    for (const l of LANDS) console.log(`${v}    ${l}: A ${out.A[l].nodes.join('/')} (n ${out.A[l].n.join('/')}) · C alle ${out.C[l].all.node} JJA ${out.C[l].jja.node} R ${out.C[l].R} · DJF ${out.C[l].bySeason.DJF.node} (23/24 ${out.C[l].bySeasonYear['2023-DJF']?.node ?? '—'}, 25/26 ${out.C[l].bySeasonYear['2025-DJF']?.node ?? '—'})`);
  }
  // candidate nodes by the rule (§15.5 3): ws and gust only
  for (const v of ['ws', 'gust']) {
    const cand = {};
    for (const [name] of LANDSETS) {
      const a = result.vars[v].A[name], c = result.vars[v].C[name], pooledA = result.vars[v].A.all, pooledC = result.vars[v].C.all;
      const n1 = a.fitted[0] ? a.nodes[0] : pooledA.nodes[0], n2 = a.fitted[1] ? a.nodes[1] : pooledA.nodes[1];
      const R = c.R ?? pooledC.R ?? 1;
      const nodes = [r3(clamp(n1 * R)), r3(clamp(n2 * R))];
      // coverage with the candidate nodes on both windows (reported)
      const inL = (x) => (name === 'all' ? true : x.land === name);
      const kA = sel((x) => x.v === v && x.win === 'A' && inL(x)), kC = sel((x) => x.v === v && x.win === 'C' && inL(x));
      const covA = evalKeys(kA, (L) => scaleAt(nodes, L)), covC = evalKeys(kC, (L) => scaleAt(nodes, L));
      const covCbySeason = {}; for (const s of ['DJF', 'MAM', 'JJA', 'SON']) covCbySeason[s] = r3(evalKeys(kC.filter((k) => k.includes(`-${s}:`)), (L) => scaleAt(nodes, L)).cov);
      const crpsC = (() => { const base = evalKeys(kC, () => 1, true, 4), fitd = evalKeys(kC, (L) => scaleAt(nodes, L), true, 4); return r3(1 - fitd.crps / base.crps); })();
      cand[name] = { nodes, from: { n1, n2, R, pooledA: !a.fitted[0] || !a.fitted[1], pooledR: c.R == null }, coverage: { A: r3(covA.cov), C: r3(covC.cov), CbySeason: covCbySeason }, crpsSkillC: crpsC };
    }
    result.candidate[v] = cand;
    console.log(`Kandidat ${v}: ${Object.entries(cand).map(([l, x]) => `${l} ${x.nodes.join('/')} (R ${x.from.R}; Abdeckung A ${(100 * x.coverage.A).toFixed(1)} C ${(100 * x.coverage.C).toFixed(1)} %, DJF ${(100 * x.coverage.CbySeason.DJF).toFixed(1)} %; CRPS C ${(100 * x.crpsSkillC).toFixed(2)} %)`).join(' · ')}`);
  }
  // K-set (diagnosis): C, V per class, DJF against rest
  const kp = parts.filter((p) => p.win === 'C' && p.kset);
  if (kp.length) {
    const nC = F_CLASSES.length - 1, nT = KSET_TAUS.length;
    const ks = { taus: KSET_TAUS, fClasses: F_CLASSES, groups: KGROUPS, vars: {} };
    for (const v of KV) {
      const a = new Float64Array(KGROUPS.length * nC * nT * KF);
      for (const p of kp) { const b = p.kset.acc[v]; for (let i = 0; i < a.length; i++) a[i] += b[i]; }
      ks.vars[v] = {};
      for (let g = 0; g < KGROUPS.length; g++) {
        const classes = [];
        for (let c = 0; c < nC; c++) {
          const o1 = ((g * nC + c) * nT + 0) * KF, n1 = a[o1];
          if (!(n1 >= 500)) { classes.push({ f: [F_CLASSES[c], Math.min(1, F_CLASSES[c + 1])], n: n1, C: null, V: null }); continue; }
          const me = a[o1 + 1] / n1, mI = a[o1 + 2] / n1;
          const varE1 = a[o1 + 4] / n1 - me * me, varI = a[o1 + 5] / n1 - mI * mI, cov1 = a[o1 + 3] / n1 - me * mI;
          const o2 = ((g * nC + c) * nT + 1) * KF, n2 = a[o2];
          const R2 = n2 >= 500 ? (a[o2 + 3] / n2 - (a[o2 + 1] / n2) * (a[o2 + 2] / n2)) / varE1 : null, w2 = n2 >= 500 ? (a[o2 + 6] / n2 - (a[o2 + 1] / n2) * me) / varE1 : null;
          classes.push({ f: [F_CLASSES[c], Math.min(1, F_CLASSES[c + 1])], n: n1, C: r3(cov1 / varE1), V: r3(varI / varE1), sdE1: r3(Math.sqrt(varE1)), tau2: { n: n2, R: r3(R2), w: r3(w2) } });
        }
        ks.vars[v][KGROUPS[g]] = classes;
      }
      console.log(`K-Satz ${v}: ${KGROUPS.map((g) => `${g}: ${ks.vars[v][g].map((c) => `f ${c.f[0]}–${c.f[1]} n ${c.n} C ${c.C} V ${c.V}`).join(' · ')}`).join('  ||  ')}`);
    }
    result.kset = ks;
  }
  mkdirSync(join(OUT_FIT, '..'), { recursive: true });
  writeFileSync(OUT_FIT, JSON.stringify(result, null, 1));
  console.log(`geschrieben: ${OUT_FIT}`);
}

if (args.collect) await collect();
else if (args.fit) await fit();
else { console.error('of8: --collect --win=A|C [--part=i/n] [--limit=n] | --fit'); process.exit(2); }
