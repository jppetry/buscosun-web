#!/usr/bin/env node
/**
 * Phase GM, GM-3, part A (+ E) — precipitation calibration of the glacier snow model: level `F` and elevation profile of the winter accumulation, per region where
 * the hold-out says so. Method frozen in audit/gletscher-schneemodell/gm3-method-frozen.md (sha256 in gm3-method-frozen.sha256) BEFORE the first scored run.
 *
 *   node scripts/glacier/snowcal-fit.mjs --truth=<gy.json> --cache=<forcing dir> --catalog=<catalog.json> --out=<report.json> [--wgms=<dir with mass_balance_point.csv, glacier.csv>]
 *
 * The winter of one elevation bin is the band recursion of the melt core (`simulate`, model `ddf`): S = k·P·fs, degree-day melt, ice melt counted. `balOf` is a
 * fast copy of that recursion for ONE band and ONE multiplier k; `selfCheck` compares it with `simulate()` on real glacier-winters (and so does the verifier).
 * Fits run on a table of the recursion over k; every score that is reported is recomputed exactly.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, emptyState, MELT } from './lib/meltcore.mjs';
import { csv } from './snowcal-truth.mjs';

export const CAL = Object.freeze({
  ddf: 0.165, ice: 1.6,                 // mm h⁻¹ K⁻¹ on snow, factor on ice (Gate C baseline)
  gamma: MELT.gamma, fsWarm: MELT.fsWarm, // K/m, °C
  profFloor: 0.2,
  fBounds: [0.3, 5], gBounds: [-0.10, 0.20],
  gapT: 0.15, gapP: 0.02, fillGap: 3,
  minRegionGlaciers: 2,
  step: 0.03, lgoStep: 0.03, lyoGuard: 0.01,
  baseline: { F: 1.289, g: 0.04 },
  k0: 0.05, kStep: 0.02, kN: 498,       // table of the recursion: k = 0.05 … 9.99
});

const hourMs = 3_600_000;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

function fillGaps(a, maxGap) {
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

/** Hourly forcing of every glacier-winter: station temperature at the station height, precipitation of the analysis at the glacier. */
export function loadWinters({ truthPath, cache }) {
  const truth = JSON.parse(readFileSync(truthPath, 'utf8'));
  const st = JSON.parse(readFileSync(join(cache, 'stations.json'), 'utf8'));
  const fromMs = Date.parse(st.from);
  const rh = existsSync(join(cache, 'rhires.json')) ? JSON.parse(readFileSync(join(cache, 'rhires.json'), 'utf8')) : null;
  const day0 = rh ? Date.parse(rh.day0 + 'T06:00:00Z') : null;
  const temps = new Map(), incas = new Map();
  const tempOf = (id) => { if (!temps.has(id)) { const d = JSON.parse(readFileSync(join(cache, `temp-${id}.json`), 'utf8')); temps.set(id, { height: d.height, t: fillGaps(d.t, CAL.fillGap), raw: d.t }); } return temps.get(id); };
  const incaOf = (key) => { if (!incas.has(key)) incas.set(key, JSON.parse(readFileSync(join(cache, `inca-${key}.json`), 'utf8')).p); return incas.get(key); };
  const out = [], unusable = [];
  for (const o of truth.gy) {
    const a = st.assign[o.key];
    const i0 = Math.round((Date.parse(o.t0 + 'T00:00:00Z') - fromMs) / hourMs), i1 = Math.round((Date.parse(o.t1 + 'T00:00:00Z') - fromMs) / hourMs) + 24, n = i1 - i0;
    if (!a?.temp) { unusable.push(`${o.name} ${o.year}: keine Temperaturstation`); continue; }
    const T = tempOf(a.temp.id);
    const t = T.t.slice(i0, i1);
    let gapT = 0; for (let i = i0; i < i1; i++) if (T.raw[i] == null) gapT++;
    const p = new Float64Array(n); let gapP = 0;
    if (o.country === 'CH') {
      const d = rh.points[o.key].p;
      for (let i = 0; i < n; i++) { const day = Math.floor((fromMs + (i0 + i) * hourMs - day0) / 86_400_000); const v = d[day]; if (v == null) { p[i] = NaN; gapP++; } else p[i] = v / 24; }
    } else {
      const d = incaOf(o.key);
      for (let i = 0; i < n; i++) { const v = d[i0 + i]; if (v == null) { p[i] = NaN; gapP++; } else p[i] = v; }
    }
    const rec = { ...o, station: a.temp, zT: T.height, t, p, gapT: gapT / n, gapP: gapP / n };
    if (rec.gapT > CAL.gapT) { unusable.push(`${o.name} ${o.year}: ${(rec.gapT * 100).toFixed(0)} % der Temperaturstunden fehlen`); continue; }
    if (rec.gapP > CAL.gapP) { unusable.push(`${o.name} ${o.year}: ${(rec.gapP * 100).toFixed(0)} % der Niederschlagsstunden fehlen`); continue; }
    const area = o.bins.reduce((s, b) => s + b.area, 0);
    rec.b = o.bins.map((b) => ({ z: (b.z0 + b.z1) / 2, d: (b.z0 + b.z1) / 2 - o.zMed, w: b.area / area, bw: b.bw }));
    out.push(rec);
  }
  return { winters: out, unusable, fromMs };
}

/** Events of one bin: pairs [solid precipitation at k = 1, potential melt on snow], only hours where one of the two is positive. */
export function eventsOf(rec, z, { ddf = CAL.ddf, fsShift = 0, gamma = CAL.gamma } = {}) {
  const ev = [];
  for (let h = 0; h < rec.t.length; h++) {
    const th = rec.t[h], ph = Number.isFinite(rec.p[h]) ? rec.p[h] : 0;
    const Tb = th + gamma * (z - rec.zT);
    const fs = Number.isNaN(Tb) ? 0.5 : Math.min(1, Math.max(0, (CAL.fsWarm + fsShift - Tb) / CAL.fsWarm));
    const a = ph * fs, m = Number.isNaN(th) ? 0 : ddf * Math.max(Tb, 0);
    if (a > 0 || m > 0) ev.push(a, m);
  }
  return Float64Array.from(ev);
}
/** The band recursion of `simulate(model: 'ddf')` for one band and multiplier k. Returns the balance; `out.melt` gets the melt sum when given. */
export function balOf(ev, k, out = null) {
  let swe = 0, bal = 0, ms = 0;
  for (let i = 0; i < ev.length; i += 2) {
    const s = k * ev[i];
    swe += s;
    let melt = ev[i + 1];
    if (melt > 0) { if (!(swe > 0)) melt *= CAL.ice; swe -= Math.min(swe, melt); ms += melt; }
    bal += s - melt;
  }
  if (out) out.melt = ms;
  return bal;
}
/** The same bin through the melt core itself (one band, zP = z ⇒ no profile inside, pf = k). */
export function balBySimulate(rec, z, k) {
  const r = simulate({ bands: { zb: [z], w: [1] }, ela: 0, t: rec.t, g: null, p: rec.p, zT: rec.zT, zP: z, pf: k, TF: 0, SRF: 0, ddf: CAL.ddf, state: emptyState(1), model: 'ddf' });
  return r.bal[0];
}

export const profOf = (d, gu, go) => Math.max(CAL.profFloor, 1 + (gu * Math.min(d, 0)) / 100 + (go * Math.max(d, 0)) / 100);

/** Prepared set: events and the table of the recursion over k for every bin. */
export function prepare(winters, opt = {}) {
  const set = [];
  for (const rec of winters) {
    const bins = rec.b.map((b) => {
      const ev = eventsOf(rec, b.z, opt);
      let hasMelt = false, sumA = 0; for (let i = 0; i < ev.length; i += 2) { sumA += ev[i]; if (ev[i + 1] > 0) hasMelt = true; }
      let tab = null;
      if (hasMelt) { tab = new Float64Array(CAL.kN); for (let j = 0; j < CAL.kN; j++) tab[j] = balOf(ev, CAL.k0 + j * CAL.kStep); }
      return { ...b, ev, tab, sumA };
    });
    set.push({ id: rec.key, name: rec.name, country: rec.country, region: rec.region, year: rec.year, bins, rec });
  }
  return set;
}
const tabVal = (b, k) => {
  if (!b.tab) return k * b.sumA;
  const x = Math.min(CAL.kN - 1, Math.max(0, (k - CAL.k0) / CAL.kStep)), lo = Math.floor(x), hi = Math.min(CAL.kN - 1, lo + 1);
  return b.tab[lo] + (b.tab[hi] - b.tab[lo]) * (x - lo);
};
const lossOf = (g, F, gu, go) => { let s = 0; for (const b of g.bins) { const e = tabVal(b, F * profOf(b.d, gu, go)) - b.bw; s += b.w * e * e; } return s; };

function min1d(f, lo, hi, coarse) {
  let bx = lo, bv = Infinity;
  for (let x = lo; x <= hi + 1e-12; x += coarse) { const v = f(x); if (v < bv) { bv = v; bx = x; } }
  let a = Math.max(lo, bx - coarse), b = Math.min(hi, bx + coarse);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 40 && b - a > 1e-6; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/**
 * One configuration on a training set. `form`: P0 (no profile), P1, P2, P3; `fLevel`, `gLevel`: G, C, R. Groups of level R are the regions with at least
 * `minRegionGlaciers` glaciers in the training set; every other glacier takes the value of its country from the SAME configuration with that block lowered to C.
 * Returns { F: Map group → value, gu, go, groupOf(glacier, block) }.
 */
export function fitConfig(train, cfg) {
  const { form, fLevel, gLevel } = cfg;
  const regionCount = new Map();
  for (const g of train) { if (!regionCount.has(g.region)) regionCount.set(g.region, new Set()); regionCount.get(g.region).add(g.id); }
  const eligible = new Set([...regionCount].filter(([, s]) => s.size >= CAL.minRegionGlaciers).map(([r]) => r));
  const lower = (fLevel === 'R' || gLevel === 'R') ? fitConfig(train, { form, fLevel: fLevel === 'R' ? 'C' : fLevel, gLevel: gLevel === 'R' ? 'C' : gLevel }) : null;
  const keyOf = (g, level) => (level === 'G' ? 'all' : level === 'C' ? g.country : eligible.has(g.region) ? g.region : `=${g.country}`);
  const F = new Map(), gu = new Map(), go = new Map();
  for (const g of train) {
    const fk = keyOf(g, fLevel), gk = keyOf(g, gLevel);
    if (!F.has(fk)) F.set(fk, fk.startsWith('=') ? lower.F.get(lower.keyOf(g, 'f')) : 1);
    if (!gu.has(gk)) { gu.set(gk, gk.startsWith('=') ? lower.gu.get(lower.keyOf(g, 'g')) : 0); go.set(gk, gk.startsWith('=') ? lower.go.get(lower.keyOf(g, 'g')) : 0); }
  }
  const byF = new Map(), byG = new Map();
  for (const g of train) { const fk = keyOf(g, fLevel), gk = keyOf(g, gLevel); if (!byF.has(fk)) byF.set(fk, []); byF.get(fk).push(g); if (!byG.has(gk)) byG.set(gk, []); byG.get(gk).push(g); }
  for (let it = 0; it < 80; it++) {
    let delta = 0;
    for (const [fk, list] of byF) {
      if (fk.startsWith('=')) continue;
      const v = min1d((x) => { let s = 0; for (const g of list) { const gk = keyOf(g, gLevel); s += lossOf(g, x, gu.get(gk), go.get(gk)); } return s; }, CAL.fBounds[0], CAL.fBounds[1], 0.05);
      delta = Math.max(delta, Math.abs(v - F.get(fk))); F.set(fk, v);
    }
    if (form !== 'P0') for (const [gk, list] of byG) {
      if (gk.startsWith('=')) continue;
      const lossG = (u, o) => { let s = 0; for (const g of list) s += lossOf(g, F.get(keyOf(g, fLevel)), u, o); return s; };
      if (form === 'P1') { const v = min1d((x) => lossG(x, x), CAL.gBounds[0], CAL.gBounds[1], 0.01); delta = Math.max(delta, Math.abs(v - gu.get(gk)) * 10); gu.set(gk, v); go.set(gk, v); }
      else if (form === 'P2') { const v = min1d((x) => lossG(x, 0), CAL.gBounds[0], CAL.gBounds[1], 0.01); delta = Math.max(delta, Math.abs(v - gu.get(gk)) * 10); gu.set(gk, v); go.set(gk, 0); }
      else {
        const u = min1d((x) => lossG(x, go.get(gk)), CAL.gBounds[0], CAL.gBounds[1], 0.01); delta = Math.max(delta, Math.abs(u - gu.get(gk)) * 10); gu.set(gk, u);
        const o = min1d((x) => lossG(gu.get(gk), x), CAL.gBounds[0], CAL.gBounds[1], 0.01); delta = Math.max(delta, Math.abs(o - go.get(gk)) * 10); go.set(gk, o);
      }
    }
    if (delta < 1e-5) break;
  }
  const res = { cfg, F, gu, go, eligible, keyOf: (g, block) => keyOf(g, block === 'f' ? fLevel : gLevel) };
  res.paramsOf = (g) => { const fk = res.keyOf(g, 'f'), gk = res.keyOf(g, 'g'); return { F: F.get(fk) ?? lower?.F.get(lower.keyOf(g, 'f')), gu: gu.get(gk) ?? lower?.gu.get(lower.keyOf(g, 'g')), go: go.get(gk) ?? lower?.go.get(lower.keyOf(g, 'g')), fKey: fk, gKey: gk }; };
  return res;
}

/** Exact scores of one glacier-winter under parameters (recursion, no table). */
export function scoreOf(g, { F, gu, go }) {
  let s1 = 0, s3 = 0; const e = [];
  for (const b of g.bins) { const v = balOf(b.ev, F * profOf(b.d, gu, go)) - b.bw; e.push(v); s1 += b.w * Math.abs(v); s3 += b.w * v; }
  let s4 = 0; g.bins.forEach((b, i) => { s4 += b.w * Math.abs(e[i] - s3); });
  return { s1, s2: Math.abs(s3), s3, s4 };
}
const agg = (rows) => ({ n: rows.length, s1: mean(rows.map((r) => r.s1)), s2: mean(rows.map((r) => r.s2)), s3: mean(rows.map((r) => r.s3)), s4: mean(rows.map((r) => r.s4)) });
const aggBy = (rows) => ({ all: agg(rows), CH: agg(rows.filter((r) => r.country === 'CH')), AT: agg(rows.filter((r) => r.country === 'AT')) });

export function holdOut(set, cfg, kind, fixed = null) {
  const keys = [...new Set(set.map((g) => (kind === 'lgo' ? g.id : g.year)))];
  const rows = [], params = [];
  for (const k of keys) {
    const test = set.filter((g) => (kind === 'lgo' ? g.id : g.year) === k), train = set.filter((g) => (kind === 'lgo' ? g.id : g.year) !== k);
    const fit = fixed ? null : fitConfig(train, cfg);
    for (const g of test) { const p = fixed ?? fit.paramsOf(g); rows.push({ id: g.id, name: g.name, country: g.country, region: g.region, year: g.year, ...scoreOf(g, p), F: p.F, gu: p.gu, go: p.go }); }
    if (fit && kind === 'lgo') { const p = fit.paramsOf(test[0]); params.push({ id: k, F: p.F, gu: p.gu, go: p.go }); }
  }
  return { ...aggBy(rows), rows, params };
}

/** Part E: relative slope of the winter POINT balances per glacier-winter (WGMS `mass_balance_point`), no forcing involved. */
export function pointSlopes({ wgmsDir, winters, from = 2012, to = 2025 }) {
  const glac = new Map(csv(readFileSync(join(wgmsDir, 'glacier.csv'), 'utf8')).filter((r) => r.country === 'AT' || r.country === 'CH').map((r) => [r.id, r]));
  const sites = new Map(); for (const w of winters) if (!sites.has(w.key)) sites.set(w.key, w);
  const hav = (lon1, lat1, lon2, lat2) => { const r = 6371, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180; const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2; return 2 * r * Math.asin(Math.sqrt(a)); };
  const match = new Map();
  for (const [id, r] of glac) { const near = [...sites.values()].map((w) => ({ w, km: hav(+r.longitude, +r.latitude, w.lon, w.lat) })).sort((a, b) => a.km - b.km)[0]; if (near && near.km <= 3) match.set(id, near.w); }
  const groups = new Map();
  for (const r of csv(readFileSync(join(wgmsDir, 'mass_balance_point.csv'), 'utf8'))) {
    if (r.balance_code !== 'winter' || !match.has(r.glacier_id)) continue;
    const y = +r.year; if (!(y >= from && y <= to) || r.elevation === '' || r.balance === '') continue;
    const k = `${r.glacier_id}|${y}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push([+r.elevation, +r.balance * 1000]);
  }
  const rows = [];
  for (const [k, pts] of groups) {
    const zs = pts.map((p) => p[0]), span = Math.max(...zs) - Math.min(...zs);
    if (pts.length < 8 || span < 200) continue;
    const mz = mean(zs), mb = mean(pts.map((p) => p[1]));
    let sxy = 0, sxx = 0; for (const [z, b] of pts) { sxy += (z - mz) * (b - mb); sxx += (z - mz) ** 2; }
    if (!(mb > 0)) continue;
    const w = match.get(k.split('|')[0]);
    rows.push({ glacier: w.name, country: w.country, year: +k.split('|')[1], n: pts.length, span, mean: mb, rel100: (sxy / sxx / mb) * 100 });
  }
  const st = (a) => ({ n: a.length, glaciers: new Set(a.map((r) => r.glacier)).size, median: quant(a.map((r) => r.rel100), 0.5), p10: quant(a.map((r) => r.rel100), 0.1), p90: quant(a.map((r) => r.rel100), 0.9) });
  return { all: st(rows), CH: st(rows.filter((r) => r.country === 'CH')), AT: st(rows.filter((r) => r.country === 'AT')), rows };
}

// --- run ---------------------------------------------------------------------------------------------------------------------------
async function main() {
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
  const t0 = Date.now();
  const frozen = arg('frozen', join(import.meta.dirname, '../../audit/gletscher-schneemodell/gm3-method-frozen.md'));
  const { createHash } = await import('node:crypto');
  const report = { kind: 'glacier/snowcal-report-A', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm3-method-frozen.md', sha256: createHash('sha256').update(readFileSync(frozen)).digest('hex') }, constants: CAL };
  const { winters, unusable } = loadWinters({ truthPath: arg('truth'), cache: arg('cache') });
  report.data = { winters: winters.length, glaciers: new Set(winters.map((w) => w.key)).size, CH: winters.filter((w) => w.country === 'CH').length, AT: winters.filter((w) => w.country === 'AT').length, unusable };
  console.log(`winters ${winters.length} (CH ${report.data.CH}, AT ${report.data.AT}), glaciers ${report.data.glaciers}, unusable ${unusable.length}`);
  const set = prepare(winters);
  console.log(`prepared in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // self-check: the fast recursion against simulate() on real glacier-winters
  let worst = 0, checked = 0;
  for (let i = 0; i < set.length; i += Math.max(1, Math.floor(set.length / 25))) { const g = set[i]; for (const k of [0.6, 1.3, 2.4]) for (const b of [g.bins[0], g.bins[g.bins.length - 1]]) { worst = Math.max(worst, Math.abs(balOf(b.ev, k) - balBySimulate(g.rec, b.z, k))); checked++; } }
  report.selfCheck = { checked, worstMm: worst, pass: worst < 1e-6 };
  console.log(`self-check fast recursion vs simulate(): ${checked} bins, worst ${worst.toExponential(2)} mm`);
  if (!report.selfCheck.pass) throw new Error('fast recursion differs from simulate()');

  const fixedScores = (p) => aggBy(set.map((g) => ({ country: g.country, ...scoreOf(g, p) })));
  report.baselines = { B0: { ...CAL.baseline, scores: fixedScores({ F: CAL.baseline.F, gu: CAL.baseline.g, go: CAL.baseline.g }) }, B1: { F: 1, g: 0, scores: fixedScores({ F: 1, gu: 0, go: 0 }) } };
  console.log('B0 s1', report.baselines.B0.scores.all.s1.toFixed(0), 'B1 s1', report.baselines.B1.scores.all.s1.toFixed(0));

  const cache = new Map();
  const run = (cfg) => {
    const key = `${cfg.form}|${cfg.fLevel}|${cfg.gLevel}`;
    if (!cache.has(key)) {
      const lgo = holdOut(set, cfg, 'lgo'), lyo = holdOut(set, cfg, 'lyo');
      const full = fitConfig(set, cfg);
      const o = { cfg, lgo: { all: lgo.all, CH: lgo.CH, AT: lgo.AT }, lyo: { all: lyo.all, CH: lyo.CH, AT: lyo.AT }, full: { F: Object.fromEntries(full.F), gu: Object.fromEntries(full.gu), go: Object.fromEntries(full.go) }, lgoParams: lgo.params, lgoRows: lgo.rows };
      cache.set(key, o);
      console.log(key.padEnd(8), 'LGO s1', lgo.all.s1.toFixed(1), 's2', lgo.all.s2.toFixed(1), 's4', lgo.all.s4.toFixed(1), '| LYO s1', lyo.all.s1.toFixed(1), '| F', JSON.stringify(Object.fromEntries([...full.F].map(([k, v]) => [k, +v.toFixed(3)]))), 'gu', JSON.stringify(Object.fromEntries([...full.gu].map(([k, v]) => [k, +v.toFixed(4)]))), 'go', JSON.stringify(Object.fromEntries([...full.go].map(([k, v]) => [k, +v.toFixed(4)]))), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    return cache.get(key);
  };
  const better = (cand, cur) => cand.lgo.all.s1 <= cur.lgo.all.s1 * (1 - CAL.lgoStep) && cand.lyo.all.s1 <= cur.lyo.all.s1 * (1 + CAL.lyoGuard);
  const trace = [];
  // 1 form
  const p1 = run({ form: 'P1', fLevel: 'G', gLevel: 'G' }), p2 = run({ form: 'P2', fLevel: 'G', gLevel: 'G' }), p3 = run({ form: 'P3', fLevel: 'G', gLevel: 'G' });
  let cur = p1;
  if (better(p2, p1)) cur = p2;
  if (better(p3, p1.lgo.all.s1 <= p2.lgo.all.s1 ? p1 : p2) && better(p3, cur)) cur = p3;
  trace.push({ step: 'form', candidates: { P1: p1.lgo.all.s1, P2: p2.lgo.all.s1, P3: p3.lgo.all.s1 }, lyo: { P1: p1.lyo.all.s1, P2: p2.lyo.all.s1, P3: p3.lyo.all.s1 }, chosen: cur.cfg.form });
  // 2 level of F, 3 level of the slopes
  for (const block of ['fLevel', 'gLevel']) for (const level of ['C', 'R']) {
    if (cur.cfg[block] !== (level === 'C' ? 'G' : 'C')) { trace.push({ step: `${block} → ${level}`, skipped: 'vorherige Stufe nicht gewählt' }); continue; }
    const cand = run({ ...cur.cfg, [block]: level });
    const ok = better(cand, cur);
    trace.push({ step: `${block} → ${level}`, lgoS1: [cur.lgo.all.s1, cand.lgo.all.s1], lyoS1: [cur.lyo.all.s1, cand.lyo.all.s1], gain: 1 - cand.lgo.all.s1 / cur.lgo.all.s1, accepted: ok });
    if (ok) cur = cand;
  }
  report.selection = { trace, chosen: cur.cfg };
  report.configs = Object.fromEntries([...cache].map(([k, o]) => [k, { cfg: o.cfg, lgo: o.lgo, lyo: o.lyo, full: o.full }]));
  report.chosen = { cfg: cur.cfg, lgo: cur.lgo, lyo: cur.lyo, full: cur.full, lgoParams: cur.lgoParams, lgoRows: cur.lgoRows.map((r) => ({ ...r, s1: Math.round(r.s1), s2: Math.round(r.s2), s3: Math.round(r.s3), s4: Math.round(r.s4) })) };
  console.log('chosen', JSON.stringify(cur.cfg));

  // verdict K-1 … K-4
  const flat = run({ form: 'P0', fLevel: cur.cfg.fLevel, gLevel: 'G' });
  const k1 = 1 - cur.lgo.all.s1 / report.baselines.B0.scores.all.s1, k4 = 1 - cur.lgo.all.s4 / flat.lgo.all.s4;
  report.verdict = {
    'K-1 LGO-s1 gegen B0 mindestens 10 % besser': { chosen: cur.lgo.all.s1, b0: report.baselines.B0.scores.all.s1, gain: k1, pass: k1 >= 0.10 },
    'K-2 LGO-s2 ≤ 0,35 m w. e.': { s2: cur.lgo.all.s2 / 1000, pass: cur.lgo.all.s2 / 1000 <= 0.35 },
    'K-3 |LGO-s3| je Land ≤ 0,10 m w. e.': { CH: cur.lgo.CH.s3 / 1000, AT: cur.lgo.AT.s3 / 1000, pass: Math.abs(cur.lgo.CH.s3) <= 100 && Math.abs(cur.lgo.AT.s3) <= 100 },
    'K-4 LGO-s4 gegen dieselbe Stellung ohne Verlauf mindestens 10 % besser': { chosen: cur.lgo.all.s4, flat: flat.lgo.all.s4, gain: k4, pass: k4 >= 0.10 },
  };
  report.gate = Object.values(report.verdict).every((v) => v.pass);
  report.configs = Object.fromEntries([...cache].map(([k, o]) => [k, { cfg: o.cfg, lgo: o.lgo, lyo: o.lyo, full: o.full }]));   // now with the comparison without a profile
  for (const [k, v] of Object.entries(report.verdict)) console.log(v.pass ? 'grün ' : 'ROT  ', k, JSON.stringify(v));

  // table per catalogue region
  const full = fitConfig(set, cur.cfg);
  const cat = JSON.parse(readFileSync(arg('catalog'), 'utf8')).glaciers;
  const regions = [...new Set(cat.map((g) => `${g.country}|${g.region}`))].sort();
  const nOf = (pred) => { const s = set.filter(pred); return { glaciers: new Set(s.map((g) => g.id)).size, winters: s.length }; };
  const globalFit = fitConfig(set, { form: cur.cfg.form, fLevel: 'G', gLevel: 'G' });
  report.table = regions.map((rk) => {
    const [country, region] = rk.split('|');
    if (country === 'DE') return { region, country, F: globalFit.F.get('all'), gu: globalFit.gu.get('all'), go: globalFit.go.get('all'), fOrigin: 'transferred', gOrigin: 'transferred', fFrom: 'all', gFrom: 'all', n: nOf(() => true) };
    const p = full.paramsOf({ country, region });
    const own = (key) => key === region;
    return { region, country, F: p.F, gu: p.gu, go: p.go, fOrigin: own(p.fKey) ? 'measured' : 'transferred', gOrigin: own(p.gKey) ? 'measured' : 'transferred', fFrom: p.fKey.replace(/^=/, ''), gFrom: p.gKey.replace(/^=/, ''), n: nOf((g) => g.region === region) };
  });

  // sensitivities
  const sens = {};
  const variant = (name, opt, filter = null) => {
    let s = prepare(winters, opt);
    if (filter) s = filter(s);
    const f = fitConfig(s, cur.cfg), lgo = holdOut(s, cur.cfg, 'lgo');
    sens[name] = { full: { F: Object.fromEntries(f.F), gu: Object.fromEntries(f.gu), go: Object.fromEntries(f.go) }, lgoS1: lgo.all.s1, lgoS2: lgo.all.s2, n: s.length };
    console.log('sens', name, 'LGO s1', lgo.all.s1.toFixed(1), JSON.stringify(sens[name].full));
  };
  variant('S1 ddf × 0,5', { ddf: CAL.ddf * 0.5 }); variant('S1 ddf × 1,5', { ddf: CAL.ddf * 1.5 });
  variant('S2 Schwelle −1 K', { fsShift: -1 }); variant('S2 Schwelle +1 K', { fsShift: 1 });
  variant('S3 nur Stufen mit Schmelze < 50 mm', {}, (s) => s.map((g) => { const p = full.paramsOf(g); const keep = g.bins.filter((b) => { const o = {}; balOf(b.ev, p.F * profOf(b.d, p.gu, p.go), o); return o.melt < 50; }); const w = keep.reduce((x, b) => x + b.w, 0); return { ...g, bins: keep.map((b) => ({ ...b, w: b.w / w })) }; }).filter((g) => g.bins.length >= 2));
  variant('S4 Gradient −5,5 K/km', { gamma: -0.0055 });
  report.sensitivity = sens;

  // E: point measurements
  if (arg('wgms')) {
    const e = pointSlopes({ wgmsDir: arg('wgms'), winters });
    const guAll = mean([...new Set(set.map((g) => full.paramsOf(g).gu))]);
    // both as a share per 100 m (amendment 1, N1-0: the first run compared a share with a percentage; the outcome is the same)
    const ratio = e.all.median / guAll;
    report.points = { unit: 'Anteil je 100 m', all: e.all, CH: e.CH, AT: e.AT, slopeBelowMedianFromA: guAll, ratio, pass: e.all.median * guAll > 0 && ratio >= 0.5 && ratio <= 2, rows: e.rows.map((r) => ({ ...r, mean: Math.round(r.mean), rel100: Math.round(r.rel100 * 1000) / 1000 })) };
    console.log('E points: median rel. slope per 100 m', e.all.median?.toFixed(3), `(p10 ${e.all.p10?.toFixed(3)}, p90 ${e.all.p90?.toFixed(3)}, n ${e.all.n}, glaciers ${e.all.glaciers}) vs A below median ${guAll.toFixed(3)} → ${report.points.pass ? 'passt' : 'Widerspruch'}`);
  }

  // amendment 1 (exploratory, after the first scored run): changes neither the selection nor the verdict above
  if (arg('explore')) {
    const ex = { kind: 'glacier/snowcal-report-A-explore', generated: new Date().toISOString(), amendment: { file: 'audit/gletscher-schneemodell/gm3-method-frozen-amendment-1.md', sha256: createHash('sha256').update(readFileSync(join(frozen, '..', 'gm3-method-frozen-amendment-1.md'))).digest('hex') }, exploratory: true, chosen: cur.cfg };
    // N1-a: factor per glacier, one winter left out
    const byGl = new Map(); for (const g of set) { if (!byGl.has(g.id)) byGl.set(g.id, []); byGl.get(g.id).push(g); }
    const lgoOf = new Map(cur.lgoRows.map((r) => [`${r.id}|${r.year}`, r]));
    const rowsA = [], perGlacier = [];
    for (const [id, list] of byGl) {
      if (list.length < 4) continue;
      const p0 = full.paramsOf(list[0]);
      const fs = [];
      for (const g of list) {
        const others = list.filter((o) => o !== g);
        const F = min1d((x) => others.reduce((s, o) => s + lossOf(o, x, p0.gu, p0.go), 0), CAL.fBounds[0], CAL.fBounds[1], 0.05);
        const own = scoreOf(g, { F, gu: p0.gu, go: p0.go }), c = lgoOf.get(`${g.id}|${g.year}`);
        rowsA.push({ id, name: g.name, country: g.country, year: g.year, F, own, country_: { s1: c.s1, s2: c.s2, s3: c.s3 } });
        fs.push(F);
      }
      const all = min1d((x) => list.reduce((s, o) => s + lossOf(o, x, p0.gu, p0.go), 0), CAL.fBounds[0], CAL.fBounds[1], 0.05);
      perGlacier.push({ id, name: list[0].name, country: list[0].country, region: list[0].region, winters: list.length, F: all, lyoMin: Math.min(...fs), lyoMax: Math.max(...fs), countryF: p0.F });
    }
    const m = (f) => mean(rowsA.map(f));
    ex.perGlacier = { winters: rowsA.length, glaciers: perGlacier.length, own: { s1: m((r) => r.own.s1), s2: m((r) => r.own.s2), s3: m((r) => r.own.s3) }, country: { s1: m((r) => r.country_.s1), s2: m((r) => r.country_.s2), s3: m((r) => r.country_.s3) }, factors: perGlacier.sort((a, b) => a.F - b.F), fQuantiles: { p10: quant(perGlacier.map((g) => g.F), 0.1), p50: quant(perGlacier.map((g) => g.F), 0.5), p90: quant(perGlacier.map((g) => g.F), 0.9) } };
    console.log('N1-a per glacier (LYO):', JSON.stringify({ n: rowsA.length, own: ex.perGlacier.own, country: ex.perGlacier.country, F: ex.perGlacier.fQuantiles }));
    // N1-b: total slope of the winter balance over the bins — truth, model, model without profile
    const flatFit = fitConfig(set, { form: 'P0', fLevel: cur.cfg.fLevel, gLevel: 'G' });
    const relSlope = (g, vals) => { let mz = 0, mv = 0; g.bins.forEach((b, i) => { mz += b.w * b.z; mv += b.w * vals[i]; }); let sxy = 0, sxx = 0; g.bins.forEach((b, i) => { sxy += b.w * (b.z - mz) * (vals[i] - mv); sxx += b.w * (b.z - mz) ** 2; }); return mv > 0 && sxx > 0 ? (sxy / sxx / mv) * 100 : null; };
    const sl = { truth: [], model: [], flat: [] };
    for (const g of set) {
      const zs = g.bins.map((b) => b.z); if (Math.max(...zs) - Math.min(...zs) < 300) continue;
      const p = full.paramsOf(g), pf = flatFit.paramsOf(g);
      const t = relSlope(g, g.bins.map((b) => b.bw)), mo = relSlope(g, g.bins.map((b) => balOf(b.ev, p.F * profOf(b.d, p.gu, p.go)))), fl = relSlope(g, g.bins.map((b) => balOf(b.ev, pf.F)));
      if (t != null && mo != null && fl != null) { sl.truth.push(t); sl.model.push(mo); sl.flat.push(fl); }
    }
    const q3 = (a) => ({ n: a.length, median: quant(a, 0.5), p10: quant(a, 0.1), p90: quant(a, 0.9) });
    ex.totalSlope = { unit: 'Anteil je 100 m', truth: q3(sl.truth), model: q3(sl.model), modelWithoutProfile: q3(sl.flat), points: report.points ? report.points.all : null };
    console.log('N1-b total slope per 100 m:', JSON.stringify(ex.totalSlope));
    // N1-c: winter melt factor free
    ex.meltFactor = [];
    for (const f of [0, 0.25, 0.5, 0.75]) {
      const s = prepare(winters, { ddf: CAL.ddf * f });
      for (const form of ['P1', 'P0', 'P3']) {
        const cfg = { form, fLevel: cur.cfg.fLevel, gLevel: 'G' };
        const ff = fitConfig(s, cfg), lgo = holdOut(s, cfg, 'lgo');
        const row = { factor: f, form, F: Object.fromEntries(ff.F), gu: ff.gu.get('all'), go: ff.go.get('all'), lgo: { s1: lgo.all.s1, s2: lgo.all.s2, s4: lgo.all.s4, s3CH: lgo.CH.s3, s3AT: lgo.AT.s3 } };
        ex.meltFactor.push(row);
        console.log('N1-c', JSON.stringify(row));
      }
    }
    writeFileSync(arg('explore'), JSON.stringify(ex, null, 1));
  }
  report.seconds = (Date.now() - t0) / 1000;
  writeFileSync(arg('out'), JSON.stringify(report, null, 1));
  console.log(`gate ${report.gate ? 'grün' : 'ROT'} — ${report.seconds.toFixed(0)} s → ${arg('out')}`);
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
