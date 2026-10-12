#!/usr/bin/env node
/**
 * Gate C — calibration and hold-out of the glacier melt model in Node, with the SAME `simulate()` the melt job uses (`lib/meltcore.mjs`):
 * method frozen in audit/gletscher/gate-c-method-frozen.md (+ amendment 1), criteria claims-frozen.md C-1 … C-5.
 *
 *   node scripts/glacier/gate-c.mjs --gc=<gate-c dir (forcing-*.json, gy.json)> --out=<report.json> [--hef=<hypso region doc + glacier id>]
 *
 * Steps: precipitation factor pf by least squares on the winter balance (closed form: the winter model only accumulates), TF and SRF (and the baseline's DDF) by
 * Nelder–Mead on the summer balance, then leave-year-out, leave-glacier-out and Hintereisferner 2024/25.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, emptyState } from './lib/meltcore.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const GC = arg('gc'), OUT = arg('out');
const FROM_MS = Date.UTC(2022, 9, 1);
const hourIdx = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - FROM_MS) / 3_600_000);
// bounds: gate-c-method-frozen.md + amendment 1
const TF_B = [0.002, 0.12], SRF_B = [0, 0.04], PF_B = [0.5, 4], DDF_B = [0.02, 0.5];
const YEARS = [2023, 2024, 2025];

// --- data ---------------------------------------------------------------------------------------------------------------------
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
function fillGaps(a, maxGap = 3) {
  const out = Float64Array.from(a, (v) => (v == null ? NaN : v));
  for (let i = 0; i < out.length;) {
    if (Number.isNaN(out[i])) {
      let j = i; while (j < out.length && Number.isNaN(out[j])) j++;
      if (i > 0 && j < out.length && j - i <= maxGap) for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1);
      i = j;
    } else i++;
  }
  return out;
}
const forcing = {};
function forcingOf(abbr) {
  if (forcing[abbr]) return forcing[abbr];
  const d = J(join(GC, `forcing-${abbr}.json`));
  return (forcing[abbr] = { height: d.height, t: fillGaps(d.t), g: fillGaps(d.g), p: Float64Array.from(d.p, (v) => (v == null ? NaN : v)) });
}
const gy = J(join(GC, 'gy.json'));
const hef = existsSync(join(GC, 'hef.json')) ? J(join(GC, 'hef.json')) : null;
if (hef) gy.push(...hef.filter((x) => x.hef));
function prep(o) {
  const tg = forcingOf(o.tg), pp = forcingOf(o.pp);
  const sl = (a, i0, i1) => a.subarray(i0, i1);
  const w0 = hourIdx(o.year - 1, 10, 1), w1 = hourIdx(o.year, 5, 1), s1 = hourIdx(o.year, 10, 1);
  const gap = (a) => { let n = 0; for (let i = w1; i < s1; i++) if (Number.isNaN(a[i])) n++; return n / (s1 - w1); };
  return {
    ...o, bands: { zb: Float64Array.from(o.zb), w: Float64Array.from(o.w) },
    zT: tg.height, zP: pp.height,
    win: { t: sl(tg.t, w0, w1), g: sl(tg.g, w0, w1), p: sl(pp.p, w0, w1) }, sum: { t: sl(tg.t, w1, s1), g: sl(tg.g, w1, s1), p: sl(pp.p, w1, s1) },
    gapT: gap(tg.t), gapG: gap(tg.g),
  };
}
const all = gy.map(prep);
for (const o of all) o.usable = o.gapT <= 0.15 && o.gapG <= 0.15 && !(o.bs == null);
const main = all.filter((o) => !o.hef);

// --- model wrappers ------------------------------------------------------------------------------------------------------------
const winterCache = new Map();
function winter(o, pf) {
  const key = `${o.id}|${o.year}|${pf}`;
  let r = winterCache.get(key);
  if (!r) {
    const n = o.bands.zb.length;
    r = simulate({ bands: o.bands, ela: o.ela, t: o.win.t, g: o.win.g, p: o.win.p, zT: o.zT, zP: o.zP, pf, TF: 0, SRF: 0, state: emptyState(n), accumulateOnly: true });
    r.bw = r.state.swe.reduce((s, v, b) => s + o.bands.w[b] * v, 0);
    if (winterCache.size > 5000) winterCache.clear();
    winterCache.set(key, r);
  }
  return r;
}
function bsModel(o, pf, model, par) {
  const w = winter(o, pf);
  const r = simulate({ bands: o.bands, ela: o.ela, t: o.sum.t, g: o.sum.g, p: o.sum.p, zT: o.zT, zP: o.zP, pf, TF: par[0], SRF: par[1], ddf: par[0], state: w.state, model });
  return r.balance;
}
function fitPf(set) {
  const sel = set.filter((o) => o.usable && o.bw != null);
  let xy = 0, xx = 0;
  for (const o of sel) { const x = winter(o, 1).bw; xy += x * o.bw; xx += x * x; }
  return Math.min(PF_B[1], Math.max(PF_B[0], xy / xx));
}

function nelderMead(f, x0, bounds, step, iters = 60) {
  const n = x0.length, clip = (x) => x.map((v, i) => Math.min(bounds[i][1], Math.max(bounds[i][0], v)));
  let pts = [clip(x0), ...x0.map((_, i) => clip(x0.map((v, k) => (k === i ? v + step[i] : v))))];
  let vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    const c = Array.from({ length: n }, (_, k) => pts.slice(0, n).reduce((s, p) => s + p[k], 0) / n);
    const worst = pts[n];
    const xr = clip(c.map((v, k) => v + (v - worst[k]))), fr = f(xr);
    if (fr < vals[0]) { const xe = clip(c.map((v, k) => v + 2 * (v - worst[k]))), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = clip(c.map((v, k) => v + 0.5 * (worst[k] - v))), fc = f(xc);
      if (fc < vals[n]) { pts[n] = xc; vals[n] = fc; } else { for (let i = 1; i <= n; i++) { pts[i] = clip(pts[i].map((v, k) => pts[0][k] + 0.5 * (v - pts[0][k]))); vals[i] = f(pts[i]); } }
    }
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread < 1e-4 && Math.max(...pts.map((p) => Math.max(...p.map((v, k) => Math.abs(v - pts[0][k]))))) < 1e-6) break;
  }
  const i = vals.indexOf(Math.min(...vals));
  return { x: pts[i], v: vals[i] };
}
let evals = 0;
function fitMelt(set, pf, model, warm = null) {
  const sel = set.filter((o) => o.usable && o.bs != null);
  const f = model === 'eti'
    ? (p) => { evals++; let s = 0; for (const o of sel) s += (bsModel(o, pf, 'eti', p) - o.bs) ** 2; return s / sel.length; }
    : (p) => { evals++; let s = 0; for (const o of sel) s += (bsModel(o, pf, 'ddf', [p[0], 0]) - o.bs) ** 2; return s / sel.length; };
  if (model === 'eti') {
    const starts = warm ? [warm] : [[0.05, 0.01], [0.03, 0.02], [0.09, 0.004]];
    let best = null;
    for (const x0 of starts) { const r = nelderMead(f, x0, [TF_B, SRF_B], warm ? [0.01, 0.004] : [0.02, 0.01], warm ? 40 : 80); if (!best || r.v < best.v) best = r; }
    return best.x;
  }
  return nelderMead(f, warm ?? [0.15], [DDF_B], [0.03], 40).x;
}

// --- run -------------------------------------------------------------------------------------------------------------------------
const t0 = Date.now();
const idx = main.filter((o) => o.usable);
const report = { generated: new Date().toISOString(), n: main.length, usable: idx.length, dropped: main.filter((o) => !o.usable).map((o) => `${o.name} ${o.year}`) };
const pfAll = fitPf(idx), etiAll = fitMelt(idx, pfAll, 'eti'), ddfAll = fitMelt(idx, pfAll, 'ddf');
report.full = { pf: pfAll, TF: etiAll[0], SRF: etiAll[1], DDF: ddfAll[0], evals, seconds: (Date.now() - t0) / 1000 };
console.log('full fit', JSON.stringify(report.full));

function fold(tests) {
  const rec = [];
  for (const test of tests) {
    const train = idx.filter((o) => !test.includes(o)), tst = test.filter((o) => o.usable);
    if (!tst.length || !train.length) continue;
    const pf = fitPf(train), eti = fitMelt(train, pf, 'eti', etiAll), ddf = fitMelt(train, pf, 'ddf', ddfAll);
    for (const o of tst) rec.push({ id: o.id, name: o.name, year: o.year, bs: o.bs, eti: bsModel(o, pf, 'eti', eti), ddf: bsModel(o, pf, 'ddf', [ddf[0], 0]), bw: o.bw, bwModel: winter(o, pf).bw, bwRaw: winter(o, 1).bw, pf, TF: eti[0], SRF: eti[1], DDF: ddf[0] });
  }
  return rec;
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const stats = (rec) => {
  const e = rec.filter((r) => r.bs != null).map((r) => (r.eti - r.bs) / 1000), d = rec.filter((r) => r.bs != null).map((r) => (r.ddf - r.bs) / 1000);
  const w = rec.filter((r) => r.bw != null), ew = w.map((r) => (r.bwModel - r.bw) / 1000), er = w.map((r) => (r.bwRaw - r.bw) / 1000);
  return { n: e.length, etiMAE: mean(e.map(Math.abs)), etiBias: mean(e), ddfMAE: mean(d.map(Math.abs)), ddfBias: mean(d), ratio: mean(e.map(Math.abs)) / mean(d.map(Math.abs)), nW: w.length, bwMAE: ew.length ? mean(ew.map(Math.abs)) : null, bwBias: ew.length ? mean(ew) : null, bwRawMAE: er.length ? mean(er.map(Math.abs)) : null };
};
const lyo = fold(YEARS.map((y) => idx.filter((o) => o.year === y)));
report.lyo = { ...stats(lyo), records: lyo, byYear: Object.fromEntries(YEARS.map((y) => [y, stats(lyo.filter((r) => r.year === y))])) };
console.log('LYO', JSON.stringify({ ...report.lyo, records: undefined, byYear: undefined }), `${evals} evals`);
const ids = [...new Set(idx.map((o) => o.id))];
const lgo = fold(ids.map((id) => idx.filter((o) => o.id === id)));
report.lgo = { ...stats(lgo), records: lgo };
console.log('LGO', JSON.stringify({ ...report.lgo, records: undefined }), `${evals} evals`);
// Hintereisferner 2024/25 with the parameters of the full fit (the glacier is not in the fit set)
const h = all.find((o) => o.hef);
if (h && h.usable !== false) {
  const b = bsModel(h, pfAll, 'eti', etiAll), bd = bsModel(h, pfAll, 'ddf', [ddfAll[0], 0]);
  report.hef = { name: h.name, year: h.year, station: `${h.tg} / ${h.pp}`, bsObs: h.bs, bsEti: b, bsDdf: bd, errEti: (b - h.bs) / 1000, errDdf: (bd - h.bs) / 1000, bwObs: h.bw, bwModel: winter(h, pfAll).bw, ela: h.ela };
  console.log('HEF', JSON.stringify(report.hef));
}
// verdict against claims-frozen.md C-1 … C-5
const v = (ok) => (ok ? 'grün' : 'ROT');
const L = report.lyo, G = report.lgo;
report.verdict = {
  'C-1 Sommerbilanz MAE ≤ 0,30 m w. e. (LYO, LGO)': { lyo: L.etiMAE, lgo: G.etiMAE, pass: L.etiMAE <= 0.3 && G.etiMAE <= 0.3 },
  'C-2 ETI ≤ 0,90 × BL-C (LYO, LGO)': { lyo: L.ratio, lgo: G.ratio, pass: L.ratio <= 0.9 && G.ratio <= 0.9 },
  'C-3 |Bias| ≤ 0,15 m w. e. (LYO, LGO)': { lyo: L.etiBias, lgo: G.etiBias, pass: Math.abs(L.etiBias) <= 0.15 && Math.abs(G.etiBias) <= 0.15 },
  'C-4 Hintereisferner 2024/25 |Fehler| ≤ 0,40 m w. e.': report.hef ? { err: report.hef.errEti, pass: Math.abs(report.hef.errEti) <= 0.4 } : { err: null, pass: false, note: 'nicht gerechnet' },
  'C-5 Winterbilanz MAE ≤ 0,35 und besser als ohne Faktor (LYO)': { mae: L.bwMAE, raw: L.bwRawMAE, pass: L.bwMAE != null && L.bwMAE <= 0.35 && L.bwMAE < L.bwRawMAE },
};
report.gateC = ['C-1', 'C-2', 'C-3'].every((k) => Object.entries(report.verdict).find(([n]) => n.startsWith(k))[1].pass) ? 'grün' : 'ROT';
for (const [k, x] of Object.entries(report.verdict)) console.log(v(x.pass).padEnd(5), k, JSON.stringify(x));
console.log('Gate C:', report.gateC, `(${Math.round((Date.now() - t0) / 1000)} s, ${evals} Auswertungen)`);
writeFileSync(OUT, JSON.stringify(report, null, 1));
