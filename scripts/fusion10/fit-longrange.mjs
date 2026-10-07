#!/usr/bin/env node
/**
 * fit-longrange.mjs — phase F10, candidate K1: fits the (w, s) table of `src/pointForecast/fusion/longRange.ts` on
 * 00-UTC hindcast slots OUTSIDE the vault of the Prüfstand (`audit/fusion-10/stat.md`). Read-only towards every data
 * root; writes only `audit/fusion-10/longrange-fit.json`.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/fusion10/fit-longrange.mjs
 *     [--root=C:/dev/buscosun-web-wt/f10-stat] [--from=2025-09-08] [--to=2026-09-21] [--every=6] [--limit=<n>] [--out=audit/fusion-10/longrange-fit.json]
 *
 * Chain: the champion's options + { longRange: 1, longRangeTable: LONG_RANGE_IDENTITY } (identity ⇒ the distributions are
 * unblended, `post.longRange.clima` carries the climatology the hook would blend towards). Rows: every scored station ×
 * native step with lead > 48 h × variable t/td/ws/gust, truth from W1 (t/td/ws at the stamp, gust = max over the step).
 * Fit: per variable × bin a grid search over w ∈ [0.2, 1] and s ∈ [0.6, 1.8] (coarse 0.1, refined 0.05) minimising the
 * mean CRPS_Q over the 19 protocol quantiles of `blendDist`. Rice rows are scored through a moment-matched truncated
 * normal proxy (the exact Rice quantile is a 60-step bisection — too slow for the grid); the chosen parameters are then
 * checked with the exact quantiles on a subsample. A bin whose change makes any country worse by > 1 % is shrunk halfway
 * towards the identity until it holds (reported).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { H, REPO, dayMs, isoDay, parseArgs } from '../pruefstand/lib/common.mjs';
import { loadProtocol } from '../pruefstand/lib/protokoll.mjs';
import { features, hindcastSlotPath, loadEngine, loadTables, readHindcastSlot } from '../pruefstand/lib/replay.mjs';
import { champion, withTablePaths } from '../pruefstand/lib/register.mjs';
import { openW1, truthValue } from '../pruefstand/lib/wahrheit.mjs';
import { seriesFromSlotTier, inputFromSlot } from '../fusionfit/lib/slotAdapter.mjs';
import { stepHoursOf } from '../../src/pruefstand/protokoll.ts';
import { crpsQ } from '../../src/pruefstand/metrics.ts';

const args = parseArgs();
const root = String(args.root ?? 'C:/dev/buscosun-web-wt/f10-stat').replace(/\\/g, '/');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const LR = await imp('src/pointForecast/fusion/longRange.ts');
const D = await imp('src/pointForecast/fusion/dist.ts');
const proto = loadProtocol();
const VARS = ['t', 'td', 'ws', 'gust'];
const KEY = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust' };
const LANDS = ['DE', 'AT', 'CH'];
const ROLES = ['A', 'B'];
const KIND = { normal: 0, truncatedNormal: 1, rice: 2, censoredNormal: 3 };   // censoredNormal = the gust family, hi fixed at 90 m/s (fuse.ts)
const F = 12;   // fields per row: kind p1 p2 p3 | ckind c1 c2 c3 | y lead land role
const taus = proto.quantiles, nq = taus.length;
const from = String(args.from ?? '2025-09-08'), to = String(args.to ?? '2026-09-21');
const every = Number(args.every ?? 6);
const limit = args.limit ? Number(args.limit) : Infinity;
const outPath = String(args.out ?? join(REPO, 'audit/fusion-10/longrange-fit.json'));

// ── slot list (never a vault date) ───────────────────────────────────────────
const dayIndex = (d) => Math.round(dayMs(d) / 86_400_000);
const slots = [];
for (let d = dayIndex(from); d <= dayIndex(to) && slots.length < limit; d += every) {
  const day = isoDay(d * 86_400_000);
  if (day >= proto.tresor.from && day <= proto.tresor.to) throw new Error(`fit-longrange: ${day} liegt im Tresor — verboten`);
  const path = hindcastSlotPath(d * 86_400_000);
  if (existsSync(path)) slots.push({ day, ms: d * 86_400_000, path });
}
console.log(`fit-longrange: ${slots.length} Slots ${from}…${to} (jeder ${every}. Tag), Motor ${root}`);

// ── rows ─────────────────────────────────────────────────────────────────────
class Rows {
  constructor() { this.buf = new Float32Array(F * 200_000); this.n = 0; }
  push(r) { if ((this.n + 1) * F > this.buf.length) { const b = new Float32Array(this.buf.length * 2); b.set(this.buf); this.buf = b; } this.buf.set(r, this.n * F); this.n += 1; }
}
const rows = Object.fromEntries(VARS.map((v) => [v, new Rows()]));
const distToRow = (d) => [KIND[d.kind], d.kind === 'rice' ? d.nu : d.mu, d.sigma, d.kind === 'truncatedNormal' || d.kind === 'censoredNormal' ? d.lo : 0];
const rowToDist = (b, o) => (b[o] === 0 ? { kind: 'normal', mu: b[o + 1], sigma: b[o + 2] } : b[o] === 1 ? { kind: 'truncatedNormal', mu: b[o + 1], sigma: b[o + 2], lo: b[o + 3] } : b[o] === 3 ? { kind: 'censoredNormal', mu: b[o + 1], sigma: b[o + 2], lo: b[o + 3], hi: 90 } : { kind: 'rice', nu: b[o + 1], sigma: b[o + 2] });

const eng = await loadEngine(root);
const champ = champion();
const tables = loadTables(withTablePaths(champ));
const w1 = openW1(proto);
const feat = features().byPoint;
const stations = proto.scored;
const opts = { ...champ.options, longRange: 1, longRangeTable: LR.LONG_RANGE_IDENTITY, hourly: false, tail: false };
const climaOf = (reg, row, held) => (held && reg.climaHeldOut === 'loso' ? null : tables.clima);
const A = await import('../fusionfit/lib/archiveAdapter.mjs');
const learnedClimaOf = (row, held) => (champ.clima === 'loso' || (held && champ.climaHeldOut === 'loso') ? A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row) : tables.clima);
void climaOf;

const t0 = Date.now();
let errors = 0, stepsSeen = 0;
for (let si = 0; si < slots.length; si++) {
  const slot = readHindcastSlot(slots[si].path);
  const t0Ms = slot.slotAtMs;
  const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
  for (let s = 0; s < stations.length; s++) {
    const row = feat[stations[s].id];
    const series = {};
    for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stations[s].id); if (ser) series[t] = ser; }
    const cube = {};
    for (const t of ['t2', 't3']) if (series[t]) cube[t] = series[t];
    if (!day0 && series.t1) cube.t1 = series.t1;
    if (!Object.keys(cube).length) continue;
    const window = { fromMs: t0Ms, toMs: t0Ms + proto.leads.sixHourlyToH * H, stepH: 1 };
    const input = { ...inputFromSlot(slot, row, cube, eng.clima, { nowMs: t0Ms, window }), country: row.country ?? null, learned: tables.learned, learnedClima: learnedClimaOf(row, stations[s].role === 'B'), ...(tables.stack ? { stack: tables.stack } : {}) };
    let res;
    try { res = eng.fuseCubePoint(input, opts); } catch (e) { errors += 1; if (errors <= 3) console.error(`  ${stations[s].id}: ${e?.message ?? e}`); continue; }
    const land = LANDS.indexOf(stations[s].land), role = ROLES.indexOf(stations[s].role);
    for (const st of res.steps) {
      if (!st.fused || st.interpolated || !(st.leadH > 48) || !st.post?.longRange || (st.tier !== 't2' && st.tier !== 't3')) continue;
      stepsSeen += 1;
      const stepH = stepHoursOf(proto, st.leadH);
      for (const v of VARS) {
        const fv = st.fused[KEY[v]], c = st.post.longRange.clima[v];
        if (!fv || !c || KIND[fv.dist.kind] == null || KIND[c.dist.kind] == null) continue;
        const y = truthValue(w1, s, st.validAtMs, v, stepH);
        if (!Number.isFinite(y)) continue;
        rows[v].push([...distToRow(fv.dist), ...distToRow(c.dist), y, st.leadH, land, role]);
      }
    }
  }
  console.log(`  ${slots[si].day}: ${((Date.now() - t0) / 1000).toFixed(0)} s, Zeilen t ${rows.t.n} ws ${rows.ws.n}, Fehler ${errors}`);
}
console.log(`Sammlung fertig: ${stepsSeen} Schritte, Zeilen ${VARS.map((v) => `${v} ${rows[v].n}`).join(', ')}`);

// ── scoring ──────────────────────────────────────────────────────────────────
const qBuf = new Float64Array(nq);
/** Quantiles of d into qBuf; Rice through the moment-matched truncated-normal proxy unless `exact`. */
function quantilesInto(d, exact) {
  let dd = d;
  if (d.kind === 'rice' && !exact) { const m = D.meanOf(d), sd = LR.sdOf(d); dd = { kind: 'truncatedNormal', mu: m, sigma: sd, lo: 0 }; }
  for (let k = 0; k < nq; k++) qBuf[k] = D.quantileOf(dd, taus[k]);
  return qBuf;
}
function scoreRow(b, o, w, s, exact = false) {
  const d = rowToDist(b, o), c = rowToDist(b, o + 4);
  const bd = LR.blendDist(d, c, w, s);
  return crpsQ(taus, quantilesInto(bd, exact), b[o + 8], 0);
}
/** Mean CRPS over an index list (optionally per country) for (w, s). */
function meanScore(b, idx, w, s, exact = false) {
  let sum = 0;
  for (let i = 0; i < idx.length; i++) sum += scoreRow(b, idx[i] * F, w, s, exact);
  return sum / idx.length;
}
function groupScore(b, idx, w, s, field) {
  const acc = {};
  for (let i = 0; i < idx.length; i++) { const o = idx[i] * F; const g = b[o + field]; const e = (acc[g] ??= [0, 0]); e[0] += scoreRow(b, o, w, s); e[1] += 1; }
  return acc;
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;

const bins = LR.LONG_RANGE_BINS;
const result = { kind: 'fusion10/longrange-fit', date: new Date().toISOString(), root, champion: champ.id, window: { from, to, every }, slots: slots.map((s) => s.day), tresor: proto.tresor, rows: {}, bins: bins.map((b) => b.id), fit: {}, params: {}, notes: [] };
const GRID_W = [], GRID_S = [];
for (let w = 0.2; w <= 1.0001; w += 0.1) GRID_W.push(r3(w));
for (let s = 0.6; s <= 1.8001; s += 0.1) GRID_S.push(r3(s));
const MAX_FIT = 25_000, MAX_EXACT = 3_000;

for (const v of VARS) {
  const b = rows[v].buf, n = rows[v].n;
  result.rows[v] = []; result.fit[v] = []; result.params[v] = [];
  for (let bi = 0; bi < bins.length; bi++) {
    const bin = bins[bi];
    const all = [];
    for (let i = 0; i < n; i++) { const L = b[i * F + 9]; if (L >= bin.fromH && L <= bin.toH) all.push(i); }
    result.rows[v].push(all.length);
    if (all.length < 500) { result.fit[v].push({ bin: bin.id, rows: all.length, note: 'zu wenige Zeilen — Identität' }); result.params[v].push({ w: 1, s: 1 }); continue; }
    const stride = Math.max(1, Math.floor(all.length / MAX_FIT));
    const fitIdx = all.filter((_, i) => i % stride === 0);
    const tFit = Date.now();
    let best = { w: 1, s: 1, c: meanScore(b, fitIdx, 1, 1) };
    const base = best.c;
    const grid = [];
    for (const w of GRID_W) for (const s of GRID_S) { const c = meanScore(b, fitIdx, w, s); grid.push([w, s, r4(c)]); if (c < best.c) best = { w, s, c }; }
    // refine ±0.05 around the coarse optimum
    for (const dw of [-0.05, 0, 0.05]) for (const ds of [-0.05, 0, 0.05]) {
      if (!dw && !ds) continue;
      const w = r3(best.w + dw), s = r3(best.s + ds);
      if (w < 0.2 || w > 1 || s < 0.6 || s > 1.8) continue;
      const c = meanScore(b, fitIdx, w, s); grid.push([w, s, r4(c)]); if (c < best.c) best = { w, s, c };
    }
    // country rule on ALL rows of the bin: no country worse by > 1 % — else shrink halfway towards identity
    let chosen = { w: best.w, s: best.s }, shrunk = 0, byLand;
    for (let k = 0; k < 4; k++) {
      const before = groupScore(b, all, 1, 1, 10), after = groupScore(b, all, chosen.w, chosen.s, 10);
      byLand = Object.fromEntries(Object.keys(before).map((g) => [LANDS[g], { n: before[g][1], before: r4(before[g][0] / before[g][1]), after: r4(after[g][0] / after[g][1]), skill: r4(1 - after[g][0] / before[g][0]) }]));
      if (Object.values(byLand).every((e) => e.skill >= -0.01)) break;
      chosen = { w: r3(chosen.w + (1 - chosen.w) / 2), s: r3(chosen.s + (1 - chosen.s) / 2) }; shrunk += 1;
    }
    const beforeRole = groupScore(b, all, 1, 1, 11), afterRole = groupScore(b, all, chosen.w, chosen.s, 11);
    const byRole = Object.fromEntries(Object.keys(beforeRole).map((g) => [ROLES[g], { n: beforeRole[g][1], before: r4(beforeRole[g][0] / beforeRole[g][1]), after: r4(afterRole[g][0] / afterRole[g][1]), skill: r4(1 - afterRole[g][0] / beforeRole[g][0]) }]));
    const allBefore = meanScore(b, all, 1, 1), allAfter = meanScore(b, all, chosen.w, chosen.s);
    let exact = null;
    if (v === 'ws' || v === 'gust') {
      const es = Math.max(1, Math.floor(all.length / MAX_EXACT)), ex = all.filter((_, i) => i % es === 0);
      const hasRice = ex.some((i) => b[i * F] === 2);
      if (hasRice) exact = { rows: ex.length, before: r4(meanScore(b, ex, 1, 1, true)), after: r4(meanScore(b, ex, chosen.w, chosen.s, true)), proxyBefore: r4(meanScore(b, ex, 1, 1)), proxyAfter: r4(meanScore(b, ex, chosen.w, chosen.s)) };
    }
    const kinds = {}; for (const i of all) { const k = ['normal', 'truncatedNormal', 'rice', 'censoredNormal'][b[i * F]]; kinds[k] = (kinds[k] ?? 0) + 1; }
    result.fit[v].push({ bin: bin.id, rows: all.length, fitRows: fitIdx.length, kinds, gridBest: { w: best.w, s: best.s, crps: r4(best.c), base: r4(base) }, chosen, shrunk, before: r4(allBefore), after: r4(allAfter), skill: r4(1 - allAfter / allBefore), byLand, byRole, exact, grid, seconds: Math.round((Date.now() - tFit) / 1000) });
    result.params[v].push(chosen);
    console.log(`${v} ${bin.id}: n ${all.length} (${Object.entries(kinds).map(([k, c]) => `${k} ${c}`).join(', ')}) grid (${best.w}, ${best.s}) → chosen (${chosen.w}, ${chosen.s})${shrunk ? ` nach ${shrunk}× Schrumpfen` : ''}: CRPS ${r4(allBefore)} → ${r4(allAfter)} (${(100 * (1 - allAfter / allBefore)).toFixed(2)} %) · Länder ${Object.entries(byLand).map(([l, e]) => `${l} ${(e.skill * 100).toFixed(1)} %`).join(' ')}${exact ? ` · exakt ${exact.before} → ${exact.after}` : ''} · ${Math.round((Date.now() - tFit) / 1000)} s`);
  }
}
result.errors = errors;
result.stepsSeen = stepsSeen;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 1));
console.log(`geschrieben: ${outPath} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log('params:', JSON.stringify(result.params));
