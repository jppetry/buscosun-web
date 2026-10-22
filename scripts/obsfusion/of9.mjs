#!/usr/bin/env node
/**
 * of9.mjs — phase OF, step OF-9 (`audit/obs-fusion.md` §16, project „buscosun Fusion 13"): the two tables of the candidates
 * `fusion-12x` / `12y` / `12z`, measured on hindcast slots OUTSIDE the vault of the Prüfstand (2024-04-01 … 2025-08-31) and BEFORE the
 * development set of track P (archive from 2026-09-14). Two windows:
 *
 *   H  the stage-1 run route 2026-06-18 … 2026-09-13, ALL EIGHT slots per day (00 … 21 UTC), leads 1 … 48 h, the chain without anchor
 *      (the hindcast carries no measurements), window 48 h — the only series that sees every hour of the day (E-OF-10). Rows per
 *      `var|lead|land|role|validHour` (reservoir per key, binary f32 + JSON index). Also the K-set statistic (V-OF-15) at τ = 1, 2 per
 *      init hour (diagnosis: is the coupling hour-dependent?).
 *   K  the Tag-0 series 00 UTC (C1 2023-06-01 … 2024-03-24, C2 2025-09-08 … 2026-06-16) — the K-set statistic at τ = 1, 2 per SEASON
 *      (DJF/MAM/JJA/SON) × country (E-OF-11). No σ rows (the seasonal factors R of the σ scale come from `of8-fit.json`, §15.6).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/obsfusion/of9.mjs --collect --win=H|K [--part=i/n] [--limit=n]
 *   node … scripts/obsfusion/of9.mjs --fit            (writes audit/obs-fusion/of9-fit.json AND src/pointForecast/fusion/sigmaScaleH.ts)
 *
 * Rule before the numbers (§16.4): per cell (var × land × lead row {1–2, 3–6, 7–24, 25–48} × 3-h class of the valid hour) one constant
 * factor on 80 % coverage; a cell under 2 000 rows takes the pooled-country cell; T/Td rows ≤ 6 h = 1 (V-OF-27); wind/gust rows ≤ 6 h × the
 * seasonal factor R of of8 at run time; the row 84,5 h = 1; a row whose interpolated table worsens the CRPS of its own fit rows by > 0,1 %
 * is set to 1. K-set table: per season the classes with n ≥ 2 000 and C > 0 (countries pooled), else empty.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const RF = 5;   // row: kind p1 p2 p3 y   (lead and valid hour are part of the key)
const RES = (L) => (L <= 6 ? Number(args.reservoirShort ?? 2000) : Number(args.reservoirLong ?? 400));
const ARCHIVE_FROM = '2026-09-14';                 // first day of the development set of track P (never touched)
const OUT_DIR = join(REPO, 'audit/obs-fusion/of9');
const OUT_FIT = String(args.out ?? join(REPO, 'audit/obs-fusion/of9-fit.json'));
const OUT_TS = String(args.ts ?? join(REPO, 'src/pointForecast/fusion/sigmaScaleH.ts'));
const OF8_FIT = join(REPO, 'audit/obs-fusion/of8-fit.json');
const regId = String(args.register ?? 'fusion-12s');
const LEADS_H = Array.from({ length: 48 }, (_, i) => i + 1);
const WIN = { H: { leads: LEADS_H, toH: 48, hours: [0, 3, 6, 9, 12, 15, 18, 21] }, K: { leads: [1, 2], toH: 2, hours: [0] } };
const ROWS = [{ id: '1-2', lo: 1, hi: 2, c: 1.5 }, { id: '3-6', lo: 3, hi: 6, c: 4.5 }, { id: '7-24', lo: 7, hi: 24, c: 15.5 }, { id: '25-48', lo: 25, hi: 48, c: 36.5 }];
const CENTRES = [1.5, 4.5, 15.5, 36.5, 84.5];       // lead rows of the table (the last one = 1, the run-out)
const HOUR_CENTRES = Array.from({ length: 8 }, (_, i) => 3 * i + 1.5);
const hourClass = (h) => Math.floor(((h % 24) + 24) % 24 / 3);
const rowOf = (L) => ROWS.findIndex((r) => L >= r.lo && L <= r.hi);
const NOMINAL = proto.gates.G3.nominal, MIN_ROWS = 2000, S_LO = 0.6, S_HI = 1.6, CRPS_GUARD = -0.001;
const SEASONS = ['DJF', 'MAM', 'JJA', 'SON'];

const seasonOf = (day) => { const m = Number(day.slice(5, 7)); return m === 12 || m <= 2 ? 'DJF' : m <= 5 ? 'MAM' : m <= 8 ? 'JJA' : 'SON'; };
const guard = (day) => {
  if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`of9: ${day} liegt im Tresor — verboten`);
  if (day >= ARCHIVE_FROM) throw new Error(`of9: ${day} liegt in der Entwicklungsmenge (Archiv ab ${ARCHIVE_FROM}) — verboten`);
};
const di = (d) => Math.round(dayMs(d) / 86_400_000);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ── slot lists ─────────────────────────────────────────────────────────────────
function slotList(win) {
  const out = [];
  if (win === 'H') {
    for (let d = di('2026-06-18'); d <= di('2026-09-13'); d += 1) {
      const day = isoDay(d * 86_400_000); guard(day);
      for (const hr of WIN.H.hours) { const ms = d * 86_400_000 + hr * H; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr, ms, path, win }); }
    }
  } else if (win === 'K') {
    for (const [from, to] of [['2023-06-01', '2024-03-24'], ['2025-09-08', '2026-06-16']]) {
      for (let d = di(from); d <= di(to); d += 1) {
        const day = isoDay(d * 86_400_000); guard(day);
        const ms = d * 86_400_000; const path = hindcastSlotPath(ms); if (existsSync(path)) out.push({ day, hr: 0, ms, path, win });
      }
    }
  } else throw new Error(`of9: --win=H|K, nicht ${win}`);
  return out;
}

// ── K-set statistic (V-OF-15) at τ = 1, 2 ───────────────────────────────────────
const KSET_K = 6, KSET_NEAREST = 12, KSET_WIND_KM = 10;
const KSET_TAUS = [1, 2];
const F_CLASSES = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0001];
const fClass = (f) => { for (let i = 0; i < F_CLASSES.length - 1; i++) if (f >= F_CLASSES[i] && f < F_CLASSES[i + 1]) return i; return -1; };
const spatialWeightOf = (dM, dhM) => (1 / (1 + (dM / 20_000) ** 2)) * (1 / (1 + (dhM / 200) ** 2));
const KV = ['t', 'ws', 'gust'];
const KF = 7;
/** groups of the accumulator: window K = season (4), window H = init hour (8); always × land (3) */
const kGroupsOf = (win) => (win === 'K' ? SEASONS : WIN.H.hours.map((h) => `${String(h).padStart(2, '0')}z`));

// ── collect ────────────────────────────────────────────────────────────────────
async function collect() {
  const win = String(args.win ?? '');
  const [pi, pn] = String(args.part ?? '1/1').split('/').map(Number);
  const slots = slotList(win).filter((_, i) => i % pn === pi - 1);
  const limit = args.limit ? Number(args.limit) : Infinity;
  const used = slots.slice(0, limit);
  console.log(`of9 collect Fenster ${win} Teil ${pi}/${pn}: ${used.length} Slots, Register ${regId}`);
  const eng = await loadEngine(REPO);
  const reg = withTablePaths(loadRegister(regId));
  const tables = loadTables(reg);
  const w1 = openW1(proto);
  const feat = features().byPoint;
  const stations = proto.scored;
  const nSt = stations.length;
  const opts = { ...reg.options, hourly: true, tail: true };
  const climaOf = (row, held) => (reg.clima === 'loso' || (held && reg.climaHeldOut === 'loso') ? A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row) : tables.clima);
  // reservoir per key (window H only): { n, kept, buf }
  const res = new Map();
  const push = (key, L, row) => {
    let c = res.get(key); if (!c) { c = { n: 0, kept: 0, max: RES(L), buf: new Float32Array(RES(L) * RF) }; res.set(key, c); }
    c.n += 1;
    if (c.kept < c.max) { c.buf.set(row, c.kept * RF); c.kept += 1; return; }
    const k = Math.floor(Math.random() * c.n);
    if (k < c.max) c.buf.set(row, k * RF);
  };
  const distRow = (d) => [KIND[d.kind], d.kind === 'rice' ? d.nu : d.mu, d.sigma, d.kind === 'truncatedNormal' || d.kind === 'censoredNormal' ? d.lo : 0];
  // K-set neighbourhoods (both windows)
  const kset = [];
  for (let i = 0; i < nSt; i++) {
    const near = [];
    for (let j = 0; j < nSt; j++) { if (j === i) continue; near.push({ j, dM: distKm(stations[i], stations[j]) * 1000, dhM: Math.abs(stations[j].elevM - stations[i].elevM) }); }
    near.sort((a, b) => a.dM - b.dM);
    const cand = near.slice(0, KSET_NEAREST).map((c) => ({ ...c, wsp: spatialWeightOf(c.dM, c.dhM) }));
    cand.sort((a, b) => b.wsp - a.wsp || a.dM - b.dM);
    const best = cand.slice(0, KSET_K);
    kset.push({ t: best.map((c) => ({ j: c.j, w: c.wsp })), wind: best.map((c) => ({ j: c.j, w: c.wsp * Math.exp(-((c.dM / (KSET_WIND_KM * 1000)) ** 2)) })).filter((c) => c.w > 0) });
  }
  const groups = kGroupsOf(win), nG = groups.length, nL = LANDS.length, nC = F_CLASSES.length - 1, nT = KSET_TAUS.length;
  const acc = Object.fromEntries(KV.map((v) => [v, new Float64Array(nG * nL * nC * nT * KF)]));
  const err = Object.fromEntries(KV.map((v) => [v, KSET_TAUS.map(() => new Float64Array(nSt).fill(NaN))]));
  const t0 = Date.now();
  let errors = 0, calls = 0, rowsN = 0, skipped = 0;
  const leads = WIN[win].leads, toH = WIN[win].toH;
  for (let si = 0; si < used.length; si++) {
    const sl = used[si];
    const slot = readHindcastSlot(sl.path);
    const t0Ms = slot.slotAtMs;
    const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
    if (win === 'H' && day0) { console.log(`  ${sl.day} ${sl.hr}z: t1 ohne Lauf — übersprungen`); skipped += 1; continue; }
    if (win === 'K' && (!day0 || !slot.cube.t1)) { console.log(`  ${sl.day} ${sl.hr}z: keine Tag-0-Stufe 1 — übersprungen`); skipped += 1; continue; }
    const g = win === 'K' ? SEASONS.indexOf(seasonOf(sl.day)) : WIN.H.hours.indexOf(sl.hr);
    for (const v of KV) for (const e of err[v]) e.fill(NaN);
    for (let s = 0; s < nSt; s++) {
      const stn = stations[s], row = feat[stn.id];
      const series = {};
      for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stn.id); if (ser) series[t] = ser; }
      const cube = win === 'K' ? (series.t1 ? { t1: series.t1 } : null) : (series.t1 ? series : null);
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
        const hv = (sl.hr + L) % 24;
        for (const v of VARS) {
          const fv = st.fused[KEY[v]];
          if (!fv || KIND[fv.dist.kind] == null) continue;
          const y = truthValue(w1, s, st.validAtMs, v, 1);
          if (!Number.isFinite(y)) continue;
          if (win === 'H') { push(`${v}|${L}|${LANDS[land]}|${ROLES[role]}|${hv}`, L, [...distRow(fv.dist), y]); rowsN += 1; }
          const ti = KSET_TAUS.indexOf(L);
          if (ti >= 0 && KV.includes(v)) err[v][ti][s] = y - eng.quantileOf(fv.dist, 0.5);
        }
      }
    }
    // K-set statistic of this slot: group g × land of the point
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
        const land = LANDS.indexOf(stations[i].land);
        for (let ti = 0; ti < nT; ti++) {
          const et = err[v][ti][i];
          if (et !== et) continue;
          const o = (((g * nL + land) * nC + c) * nT + ti) * KF, a = acc[v];
          a[o] += 1; a[o + 1] += et; a[o + 2] += I; a[o + 3] += et * I; a[o + 4] += et * et; a[o + 5] += I * I; a[o + 6] += et * e1;
        }
      }
    }
    if ((si + 1) % 10 === 0 || si === used.length - 1) console.log(`  ${si + 1}/${used.length} ${sl.day} ${sl.hr}z: ${((Date.now() - t0) / 1000).toFixed(0)} s, Aufrufe ${calls}, Zeilen ${rowsN}, Fehler ${errors}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  // rows: binary f32 in key order; index in the JSON
  const keys = [...res.keys()].sort();
  const index = {}; let off = 0;
  const parts = [];
  for (const k of keys) { const c = res.get(k); index[k] = { n: c.n, kept: c.kept, offset: off }; parts.push(Buffer.from(c.buf.buffer, c.buf.byteOffset, c.kept * RF * 4)); off += c.kept * RF; }
  const bin = Buffer.concat(parts);
  const binPath = join(OUT_DIR, `part-${win}-${pi}.f32`);
  if (keys.length) writeFileSync(binPath, bin);
  const out = {
    kind: 'obsfusion/of9-part', win, part: `${pi}/${pn}`, register: regId, date: new Date().toISOString(), slots: used.map((s) => `${s.day}T${String(s.hr).padStart(2, '0')}`), skipped,
    tresor: { from: proto.tresor.from, to: proto.tresor.to }, archiveFrom: ARCHIVE_FROM, calls, errors, rows: rowsN, reservoir: { short: RES(1), long: RES(7) }, leads: [leads[0], leads[leads.length - 1]], toH, rf: RF,
    kset: { k: KSET_K, nearest: KSET_NEAREST, windKm: KSET_WIND_KM, taus: KSET_TAUS, fClasses: F_CLASSES, groups, lands: LANDS, kf: KF, acc: Object.fromEntries(KV.map((v) => [v, Array.from(acc[v])])) },
    bin: keys.length ? { file: `part-${win}-${pi}.f32`, floats: off, sha256: sha(bin) } : null,
    index,
  };
  const path = join(OUT_DIR, `part-${win}-${pi}.json`);
  writeFileSync(path, JSON.stringify(out));
  console.log(`geschrieben: ${path}${keys.length ? ` + ${binPath} (${(bin.length / 1e6).toFixed(1)} MB)` : ''} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${keys.length} Schlüssel)`);
}

// ── fit ────────────────────────────────────────────────────────────────────────
async function fit() {
  const D = await import('../../src/pointForecast/fusion/dist.ts');
  const S = await import('../../src/pointForecast/fusion/sigmaScale.ts');
  const files = readdirSync(OUT_DIR).filter((f) => /^part-[HK]-\d+\.json$/.test(f)).map((f) => join(OUT_DIR, f));
  if (!files.length) throw new Error(`of9 fit: keine Teile in ${OUT_DIR}`);
  const parts = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const partsH = parts.filter((p) => p.win === 'H'), partsK = parts.filter((p) => p.win === 'K');
  if (!partsH.length) throw new Error('of9 fit: kein Fenster H');
  const of8 = JSON.parse(readFileSync(OF8_FIT, 'utf8'));
  console.log(`of9 fit: H ${partsH.length} Teil(e) / ${partsH.reduce((a, p) => a + p.slots.length, 0)} Slots / ${partsH.reduce((a, p) => a + p.rows, 0)} Zeilen; K ${partsK.length} Teil(e) / ${partsK.reduce((a, p) => a + p.slots.length, 0)} Slots`);
  const taus = proto.quantiles, nq = taus.length;
  // merged cells: key → { n, chunks: [{ w, rows }] , meta }
  const cells = new Map();
  for (const p of partsH) {
    if (!p.bin) continue;
    const buf = readFileSync(join(OUT_DIR, p.bin.file));
    if (sha(buf) !== p.bin.sha256) throw new Error(`of9 fit: ${p.bin.file} hat nicht den sha256 des Index`);
    const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    for (const [k, ix] of Object.entries(p.index)) {
      if (!cells.has(k)) { const [v, L, land, role, hv] = k.split('|'); cells.set(k, { n: 0, chunks: [], v, L: Number(L), land, role, hv: Number(hv), row: rowOf(Number(L)), hc: hourClass(Number(hv)) }); }
      const e = cells.get(k); e.n += ix.n;
      if (ix.kept) e.chunks.push({ w: ix.n / ix.kept, rows: all.subarray(ix.offset, ix.offset + ix.kept * RF) });
    }
  }
  const keys = [...cells.values()];
  const sel = (f) => keys.filter(f);
  const nOf = (ks) => ks.reduce((a, c) => a + c.n, 0);
  const rowToDist = (b, o, s) => (b[o] === 0 ? { kind: 'normal', mu: b[o + 1], sigma: b[o + 2] * s } : b[o] === 1 ? { kind: 'truncatedNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3] } : b[o] === 3 ? { kind: 'censoredNormal', mu: b[o + 1], sigma: b[o + 2] * s, lo: b[o + 3], hi: 90 } : { kind: 'rice', nu: b[o + 1], sigma: b[o + 2] * s });
  const qBuf = new Float64Array(nq);
  /** Weighted coverage (and CRPS) over cells at a scale function s(cell). */
  const evalCells = (ks, sOf, withCrps = false, stride = 1) => {
    let cov = 0, wsum = 0, crps = 0;
    for (const c of ks) {
      const s = sOf(c);
      for (const ch of c.chunks) {
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
  const fitConst = (ks) => { const n = nOf(ks); const before = n ? evalCells(ks, () => 1).cov : NaN; if (n < MIN_ROWS) return { node: null, n, before, after: null }; const node = bisect((s) => evalCells(ks, () => s).cov); return { node, n, before, after: evalCells(ks, () => node).cov }; };
  const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
  const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
  const LANDSETS = [['all', LANDS], ...LANDS.map((l) => [l, [l]])];
  const ONES8 = () => HOUR_CENTRES.map(() => 1);

  // 1. per cell: constant node on 80 % coverage (rule 1)
  const fitted = {};   // fitted[v][land][row][hc] = { node, n, before, after }
  for (const v of VARS) {
    fitted[v] = {};
    for (const [name, lands] of LANDSETS) {
      fitted[v][name] = ROWS.map((row, ri) => HOUR_CENTRES.map((_, hc) => fitConst(sel((c) => c.v === v && lands.includes(c.land) && c.row === ri && c.hc === hc))));
      console.log(`${v} ${name}: ${ROWS.map((row, ri) => `${row.id}: ${fitted[v][name][ri].map((x) => (x.node == null ? '—' : x.node.toFixed(2))).join(' ')}`).join(' | ')}`);
    }
  }
  // 2. table nodes: pooled fallback under minRows; T/Td rows ≤ 6 h = 1 (rule 3); row 84,5 h = 1
  const nodesOf = (v, name) => {
    const out = ROWS.map((row, ri) => HOUR_CENTRES.map((_, hc) => {
      const own = fitted[v][name][ri][hc], pooled = fitted[v].all[ri][hc];
      const node = own.node ?? pooled.node ?? 1;
      return (v === 't' || v === 'td') && CENTRES[ri] <= 6 ? 1 : node;
    }));
    out.push(ONES8());
    return out;
  };
  const tables = {};   // tables[name][v] = rows (5 × 8)
  for (const [name] of LANDSETS) { tables[name] = {}; for (const v of VARS) tables[name][v] = nodesOf(v, name); }
  // seasonal factors R (rule 3) from of8: ws/gust per land; pooled where the JJA set < minRows; 1 where the JJA node sits at the cap.
  // §16.4a: R calibrates the summer fit level to the other seasons — a variable whose rows ≤ 6 h carry no fit node (all 1, e.g. set to 1 by
  // the CRPS guard) has no level to calibrate and gets R = 1 (otherwise R alone would be a night-fitted wind factor > 1 at every hour, §15.6).
  const R = {}, rNote = {};
  const mkR = (name, v) => {
    const C = of8.vars[v].C[name], Cp = of8.vars[v].C.all;
    const src = C.jja.n >= MIN_ROWS && C.jja.node != null ? C : Cp;
    const atCap = src.jja.node >= S_HI - 1e-9;
    return SEASONS.map((s) => (s === 'JJA' || atCap || src.bySeason[s]?.node == null ? 1 : r3(src.bySeason[s].node / src.jja.node)));
  };
  const applyR = () => {
    for (const [name] of LANDSETS) {
      R[name] = {}; rNote[name] = {};
      for (const v of VARS) {
        if (v === 't' || v === 'td') { R[name][v] = SEASONS.map(() => 1); rNote[name][v] = 'T/Td: rows ≤ 6 h are 1 by rule 3'; continue; }
        const shortRowsAreOne = tables[name][v].filter((_, ri) => CENTRES[ri] <= 6).every((row) => row.every((x) => x === 1));
        if (shortRowsAreOne) { R[name][v] = SEASONS.map(() => 1); rNote[name][v] = 'no fit node in the rows ≤ 6 h (guard or unfitted) ⇒ R = 1 (§16.4a)'; continue; }
        R[name][v] = mkR(name, v); rNote[name][v] = 'R = N_C(season)/N_C(JJA) of of8';
      }
    }
  };
  applyR();
  // the interpolated table as the engine reads it (season factor = 1 on the summer fit data — R_JJA = 1, the fit rows are JJA)
  const mkTable = (tabs) => ({
    version: 1, kind: 'hour', provenance: { kind: 'hindcast', note: 'of9 fit (in progress)' }, centresH: CENTRES, hourCentresH: HOUR_CENTRES, clamp: [S_LO, S_HI],
    nodes: tabs.all, byCountry: Object.fromEntries(LANDS.map((l) => [l, tabs[l]])),
    season: { rowsToH: 6, nodes: Object.fromEntries(VARS.map((v) => [v, R.all[v]])), byCountry: Object.fromEntries(LANDS.map((l) => [l, Object.fromEntries(VARS.map((v) => [v, R[l][v]]))])) },
  });
  const JULY = Date.UTC(2026, 6, 15);   // a JJA valid time: the season factor is 1, the hour is what counts
  const sAt = (table, c) => S.sigmaScaleHourAt(table, c.v, c.L, JULY + c.hv * H, c.land);
  // 3. guard per (var, land, row): CRPS of the row with the interpolated table vs 1 (rule 2)
  const guardLog = {};
  let table = mkTable(tables);
  for (const v of VARS) {
    guardLog[v] = {};
    for (const [name, lands] of LANDSETS) {
      guardLog[v][name] = ROWS.map((row, ri) => {
        const ks = sel((c) => c.v === v && lands.includes(c.land) && c.row === ri);
        if (!ks.length) return { row: row.id, n: 0, skill: null, zeroed: false };
        const base = evalCells(ks, () => 1, true, 4), fitd = evalCells(ks, (c) => sAt(table, c), true, 4);
        const skill = 1 - fitd.crps / base.crps;
        const zeroed = skill < CRPS_GUARD;
        return { row: row.id, n: nOf(ks), crpsBefore: r4(base.crps), crpsAfter: r4(fitd.crps), skill: r4(skill), zeroed };
      });
      for (let ri = 0; ri < ROWS.length; ri++) if (guardLog[v][name][ri].zeroed) { tables[name][v][ri] = ONES8(); console.log(`  Wächter: ${v} ${name} Zeile ${ROWS[ri].id} auf 1 (CRPS-Skill ${guardLog[v][name][ri].skill})`); }
    }
  }
  applyR();   // the guard may have emptied the rows ≤ 6 h of a variable ⇒ its R becomes 1 (§16.4a)
  for (const [name] of LANDSETS) for (const v of ['ws', 'gust']) console.log(`  R ${v} ${name}: ${R[name][v].join('/')} — ${rNote[name][v]}`);
  table = mkTable(tables);
  // 4. realized coverage with the final interpolated table: per cell, per lead, per valid hour; CRPS per (var, land)
  const realized = {};
  for (const v of VARS) {
    realized[v] = {};
    for (const [name, lands] of LANDSETS) {
      const inL = (c) => c.v === v && lands.includes(c.land);
      const cellsCov = ROWS.map((row, ri) => HOUR_CENTRES.map((_, hc) => { const ks = sel((c) => inL(c) && c.row === ri && c.hc === hc); return ks.length ? r3(evalCells(ks, (c) => sAt(table, c)).cov) : null; }));
      const byLead = LEADS_H.map((L) => { const ks = sel((c) => inL(c) && c.L === L); return { L, n: nOf(ks), before: r3(evalCells(ks, () => 1).cov), after: r3(evalCells(ks, (c) => sAt(table, c)).cov) }; });
      const byHour = Array.from({ length: 24 }, (_, h) => { const ks = sel((c) => inL(c) && c.hv === h && c.L <= 6); return { h, n: nOf(ks), before: r3(evalCells(ks, () => 1).cov), after: r3(evalCells(ks, (c) => sAt(table, c)).cov) }; });
      const ks = sel(inL);
      const base = evalCells(ks, () => 1, true, 8), fitd = evalCells(ks, (c) => sAt(table, c), true, 8);
      realized[v][name] = { cells: cellsCov, byLead, byHourShort: byHour, crps: { before: r4(base.crps), after: r4(fitd.crps), skill: r4(1 - fitd.crps / base.crps) }, coverage: { before: r3(base.cov), after: r3(fitd.cov) } };
      console.log(`${v} ${name}: Abdeckung ${(100 * base.cov).toFixed(1)} → ${(100 * fitd.cov).toFixed(1)} %, CRPS-Skill ${(100 * (1 - fitd.crps / base.crps)).toFixed(2)} %; je Stunde ≤ 6 h nachher ${byHour.map((x) => (x.after == null ? '—' : (100 * x.after).toFixed(0))).join(' ')}`);
    }
  }
  // 5. K-set per season (window K) and per init hour (window H)
  const ksetOf = (ps, minN) => {
    if (!ps.length) return null;
    const m = ps[0].kset, groups = m.groups, nG = groups.length, nL = m.lands.length, nC = m.fClasses.length - 1, nT = m.taus.length;
    const out = { groups, lands: m.lands, taus: m.taus, fClasses: m.fClasses, vars: {} };
    for (const v of KV) {
      const a = new Float64Array(nG * nL * nC * nT * KF);
      for (const p of ps) { const b = p.kset.acc[v]; for (let i = 0; i < a.length; i++) a[i] += b[i]; }
      const cls = (g, lands) => {
        const classes = [];
        for (let c = 0; c < nC; c++) {
          const sum = (ti) => { const s = new Float64Array(KF); for (const li of lands) { const o = (((g * nL + li) * nC + c) * nT + ti) * KF; for (let f = 0; f < KF; f++) s[f] += a[o + f]; } return s; };
          const s1 = sum(0), n1 = s1[0];
          const cl = { fLo: m.fClasses[c], fHi: Math.min(1.0001, m.fClasses[c + 1]), n: n1, C: null, V: null };
          if (n1 >= minN) {
            const me = s1[1] / n1, mI = s1[2] / n1, varE1 = s1[4] / n1 - me * me, varI = s1[5] / n1 - mI * mI, cov1 = s1[3] / n1 - me * mI;
            const C = cov1 / varE1, V = varI / varE1;
            if (Number.isFinite(C) && Number.isFinite(V) && C > 0) { cl.C = r3(C); cl.V = r3(V); } else cl.rejected = { C: r3(C), V: r3(V) };
            cl.sdE1 = r3(Math.sqrt(varE1));
            const s2 = sum(1), n2 = s2[0];
            if (n2 >= minN) cl.tau2 = { n: n2, R: r3((s2[3] / n2 - (s2[1] / n2) * (s2[2] / n2)) / varE1), w: r3((s2[6] / n2 - (s2[1] / n2) * me) / varE1) };
          }
          classes.push(cl);
        }
        return classes;
      };
      out.vars[v] = {};
      for (let g = 0; g < nG; g++) { out.vars[v][groups[g]] = { all: cls(g, [0, 1, 2]), byLand: Object.fromEntries(m.lands.map((l, li) => [l, cls(g, [li])])) }; }
    }
    return out;
  };
  const ksetK = ksetOf(partsK, MIN_ROWS), ksetH = ksetOf(partsH, MIN_ROWS);
  if (ksetK) for (const v of KV) console.log(`K-Satz ${v} je Jahreszeit: ${SEASONS.map((s) => `${s}: ${ksetK.vars[v][s].all.map((c) => `f ${c.fLo}–${c.fHi} n ${c.n} C ${c.C} V ${c.V}`).join(' · ')}`).join('  ||  ')}`);
  if (ksetH) for (const v of KV) console.log(`K-Satz ${v} je Startstunde (Sommer): ${ksetH.groups.map((g) => `${g}: ${ksetH.vars[v][g].all.map((c) => (c.C == null ? '—' : c.C)).join('/')}`).join(' · ')}`);
  // the seasonal K-set table (countries pooled). Rule amendment of 22.10. BEFORE the Prüfstand run (§16.4a): the Tag-0 series populates
  // for wind/gust only the class f < 0,15 per season (the others 650–1 800 rows) — the class-below fallback would switch the coupling off
  // (C ≈ 0,1, V ≈ 0,65 ⇒ g < 0 ⇒ factor 1); §15.6 found no seasonal signal for wind/gust. So: T per season from the Tag-0 series, an
  // empty T class takes the OF-7b class (summer, all hours) instead of the class below; wind and gust keep the OF-7b classes in every season.
  const OF7B = S.ANCHOR_KSET_TABLE;
  const strip = (c) => ({ fLo: c.fLo, fHi: c.fHi, n: Math.round(c.n), C: c.C, V: c.V });
  const fillT = (classes) => classes.map((c, i) => (c.C != null && c.V != null ? { ...strip(c), from: 'tag0' } : { ...strip(OF7B.t[i]), from: 'of7b', nSeason: Math.round(c.n) }));
  const ksetTable = ksetK ? Object.fromEntries(SEASONS.map((s) => [s, { t: fillT(ksetK.vars.t[s].all), wind: OF7B.wind.map((c) => ({ ...strip(c), from: 'of7b' })), gust: OF7B.gust.map((c) => ({ ...strip(c), from: 'of7b' })) }])) : null;
  if (ksetTable) console.log(`K-Satz-Tabelle T je Jahreszeit (Herkunft): ${SEASONS.map((s) => `${s}: ${ksetTable[s].t.map((c) => `${c.C}${c.from === 'of7b' ? '*' : ''}`).join('/')}`).join(' · ')} (* = OF-7b-Klasse eingesetzt); Wind/Böe = OF-7b in jeder Jahreszeit`);

  const slotsH = partsH.reduce((a, p) => a + p.slots.length, 0), rowsH = partsH.reduce((a, p) => a + p.rows, 0), slotsK = partsK.reduce((a, p) => a + p.slots.length, 0);
  const result = {
    kind: 'obsfusion/of9-fit', date: new Date().toISOString(), register: partsH[0].register,
    parts: parts.map((p) => ({ win: p.win, part: p.part, slots: p.slots.length, skipped: p.skipped, rows: p.rows, calls: p.calls, errors: p.errors })),
    tresor: partsH[0].tresor, archiveFrom: partsH[0].archiveFrom, centresH: CENTRES, hourCentresH: HOUR_CENTRES, rows: ROWS.map((r) => r.id),
    rule: { nominal: NOMINAL, minRows: MIN_ROWS, clamp: [S_LO, S_HI], crpsGuard: CRPS_GUARD, note: 'audit/obs-fusion.md §16.4: one constant node per cell (var × land × lead row × 3-h class of the valid hour) on 80 % coverage; pooled fallback under minRows; T/Td rows ≤ 6 h = 1 (V-OF-27); wind/gust rows ≤ 6 h × R(season) of of8 at run time (R = 1 where the JJA node sits at the cap or JJA); row 84,5 h = 1; a row whose interpolated table worsens the CRPS of its fit rows by more than 0,1 % is set to 1; K-set per season: classes with n ≥ 2 000 and C > 0, countries pooled' },
    fitted: Object.fromEntries(VARS.map((v) => [v, Object.fromEntries(LANDSETS.map(([name]) => [name, fitted[v][name].map((row) => row.map((x) => ({ node: x.node, n: x.n, before: r3(x.before), after: r3(x.after) })))]))])),
    guard: guardLog, tables, R, rNote, realized,
    kset: { season: ksetK, initHour: ksetH },
  };
  mkdirSync(join(OUT_FIT, '..'), { recursive: true });
  const fitJson = JSON.stringify(result, null, 1);
  writeFileSync(OUT_FIT, fitJson);
  console.log(`geschrieben: ${OUT_FIT}`);
  // 6. the generated engine tables
  const fmt = (x) => (Number.isInteger(x) ? String(x) : String(x));
  const rowsTs = (rows) => `[${rows.map((r) => `[${r.map(fmt).join(', ')}]`).join(', ')}]`;
  const varsTs = (tab, ind) => VARS.map((v) => `${ind}${v}: ${rowsTs(tab[v])},`).join('\n');
  const seasonTs = (Rl, ind) => VARS.map((v) => `${ind}${v}: [${Rl[v].map(fmt).join(', ')}],`).join('\n');
  const clsTs = (cl) => `{ fLo: ${cl.fLo}, fHi: ${cl.fHi}, n: ${cl.n}, C: ${cl.C == null ? 'null' : cl.C}, V: ${cl.V == null ? 'null' : cl.V} }`;
  const clsNote = (cl) => (cl.from === 'of7b' ? ' // OF-7b class' + (cl.nSeason != null ? ` (season: ${cl.nSeason} rows)` : '') : '');
  const famTs = (classes, ind) => `[\n${classes.map((c) => `${ind}  ${clsTs(c)},${clsNote(c)}`).join('\n')}\n${ind}]`;
  const fitSha = sha(Buffer.from(fitJson));
  const ts = `/**
 * sigmaScaleH.ts — GENERATED by \`scripts/obsfusion/of9.mjs --fit\` on ${result.date} (phase OF, step OF-9, \`audit/obs-fusion.md\` §16;
 * fit \`audit/obs-fusion/of9-fit.json\`, sha256 ${fitSha}). Do not edit by hand — change the rule in §16.4 and re-run the fit.
 *
 * (1) \`SIGMA_SCALE_TABLE_H\` (\`FuseCubeOptions.sigmaScale: 6\`, candidates fusion-12x/12z): a factor on σ of T, Td, wind speed and gust per
 *     lead row (centres ${CENTRES.join(' · ')} h; the last row = 1) × 3-h class of the VALID HOUR (UTC, centres ${HOUR_CENTRES.join(' · ')}), per
 *     country (DE/AT/CH; pooled otherwise). Nodes from the stage-1 run route 2026-06-18 … 09-13, all eight slots per day (${slotsH} slots,
 *     ${rowsH} rows, the chain without anchor), one constant per cell on ${NOMINAL * 100} % q10–q90 coverage. T/Td rows ≤ 6 h = 1 (V-OF-27).
 *     \`season\`: the factor R(season) of the Tag-0 series (of8, §15.6) on the rows ≤ 6 h of wind and gust (order ${SEASONS.join('/')}),
 *     interpolated in the day of the year; the engine clamps the product to [${S_LO}; ${S_HI}]; a variable without fit node in the rows
 *     ≤ 6 h carries R = 1 (§16.4a). Rows set to 1 by the CRPS guard (> 0,1 % worse):
 *     ${VARS.flatMap((v) => LANDSETS.flatMap(([name]) => guardLog[v][name].filter((g) => g.zeroed).map((g) => `${v} ${name} ${g.row}`))).join(', ') || 'none'}.
 * (2) \`ANCHOR_KSET_TABLE_S\` (\`FuseCubeOptions.anchorKSet: 2\`, candidates fusion-12y/12z): the K-set classes (C, V) of T per season from the
 *     Tag-0 series 00 UTC (${slotsK} slots, τ = 1, K = ${KSET_K} best of the ${KSET_NEAREST} nearest Prüfnetz stations, countries pooled; a class
 *     needs ≥ ${MIN_ROWS} rows and C > 0, else the OF-7b class stands in — marked below); wind and gust keep the OF-7b classes in every
 *     season (rule amendment §16.4a before the Prüfstand run: the Tag-0 series populates for them only the class f < 0,15 per season).
 */
import type { AnchorKSetTableS, SigmaScaleTableH } from './sigmaScale';

export const SIGMA_SCALE_TABLE_H: SigmaScaleTableH = Object.freeze({
  version: 1 as const,
  kind: 'hour' as const,
  provenance: { kind: 'hindcast' as const, note: 'OF-9 fit ${result.date.slice(0, 10)} — nodes per lead row × 3-h class of the valid hour × country from the stage-1 run route 2026-06-18 … 09-13 (eight slots per day, chain without anchor) on 80 % coverage; T/Td rows ≤ 6 h = 1; wind/gust rows ≤ 6 h × seasonal factor of the Tag-0 series 00 UTC (of8); row 84,5 h = 1 (sigmaScale: 6)', fitWindow: { from: '2026-06-18', to: '2026-09-13' }, slots: ${slotsH}, rows: ${rowsH}, date: '${result.date.slice(0, 10)}', nominal: ${NOMINAL} },
  centresH: [${CENTRES.join(', ')}],
  hourCentresH: [${HOUR_CENTRES.join(', ')}],
  clamp: [${S_LO}, ${S_HI}] as const,
  nodes: {
${varsTs(tables.all, '    ')}
  },
  byCountry: {
${LANDS.map((l) => `    ${l}: {\n${varsTs(tables[l], '      ')}\n    },`).join('\n')}
  },
  season: {
    rowsToH: 6,
    nodes: {
${seasonTs(R.all, '      ')}
    },
    byCountry: {
${LANDS.map((l) => `      ${l}: {\n${seasonTs(R[l], '        ')}\n      },`).join('\n')}
    },
  },
});

export const ANCHOR_KSET_TABLE_S: AnchorKSetTableS = Object.freeze({
  version: 1 as const,
  kind: 'season' as const,
  provenance: { kind: 'hindcast' as const, note: 'OF-9 fit ${result.date.slice(0, 10)} — T: cov/var of the averaged innovation set of the K = ${KSET_K} best of the ${KSET_NEAREST} nearest stations per f-class and SEASON, Tag-0 series 00 UTC 2023-06-01 … 2024-03-24 and 2025-09-08 … 2026-06-16 (τ = 1, countries pooled), classes with ≥ ${MIN_ROWS} rows and C > 0, else the OF-7b class; wind and gust = the OF-7b classes in every season (§16.4a) (anchorKSet: 2)', fitWindow: { from: '2023-06-01', to: '2026-06-16' }, slots: ${slotsK}, date: '${result.date.slice(0, 10)}', k: ${KSET_K} },
  bySeason: {
${ksetTable ? SEASONS.map((s) => `    ${s}: {\n      t: ${famTs(ksetTable[s].t, '      ')},\n      wind: ${famTs(ksetTable[s].wind, '      ')},\n      gust: ${famTs(ksetTable[s].gust, '      ')},\n    },`).join('\n') : ''}
  },
});
`;
  writeFileSync(OUT_TS, ts);
  console.log(`geschrieben: ${OUT_TS}`);
}

if (args.collect) await collect();
else if (args.fit) await fit();
else { console.error('of9: --collect --win=H|K [--part=i/n] [--limit=n] | --fit'); process.exit(2); }
