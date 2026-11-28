#!/usr/bin/env node
/**
 * GM-12 B3 — does the terrain sun make the melt better? Measurement on past years only. Rule: gm12-sun-frozen.md (sha256 checked).
 *
 *   node audit/gletscher-schneemodell/gm12-sun.mjs --step=controls|summer|winter|b3|b5|report
 *
 * Full results: C:\dev\buscosun-glacier-cache\gm12\sun\ . Repo report gm12-sun-report.json: no balance per glacier year (E-GL-17).
 */
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { precipRunOf } from '../../scripts/glacier/lib/snowcal.mjs';
import * as L from './gm12-sun-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const STEP = args.step, OUT = L.OUTDIR;
L.mkdirSync(OUT, { recursive: true });
const LOG = join(OUT, `log-${STEP}.txt`);
const log = (...a) => { const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync(LOG, s + '\n'); };
const mem = (l) => L.mem(l, log);

// --- the frozen rule ---------------------------------------------------------------------------------------------------------------------------------
const RULE_FILE = join(HERE, 'gm12-sun-frozen.md');
const SHA = createHash('sha256').update(readFileSync(RULE_FILE)).digest('hex');
const SHA_FROZEN = readFileSync(join(HERE, 'gm12-sun-frozen.sha256'), 'utf8').trim().split(/\s/)[0];
if (SHA !== SHA_FROZEN) { console.error(`Regel verändert: ${SHA} ≠ ${SHA_FROZEN}`); process.exit(2); }
const RULE = Object.freeze({
  seed: 12, nBoot: 1000, nPerm: 20, gainMin: 0.05, slopeHalf: 0.5, permHalf: 0.5, otherSide: 1.02,
  TF_B: [0.002, 0.12], TF_B_WIDE: [0.002, 0.30], SRF_B: [0, 0.04], PF_B: [0.5, 4],
  synth: { TF: 0.06, SRF: 0.006, noise: 300, tol: 0.10 }, gssTol: 1e-5, a2Tol: 1e-6, b5Perm: 200,
});

// --- kernel: one band over an hour range, arithmetic of `simulate` term by term -------------------------------------------------------------------
const M = L.MELT, DECAY = Math.exp(-1 / M.tauH);
/** Runs band b of record r from h0 to h1 on state st = [swe, aS]; returns { bal, melt, meltAut } (meltAut = melt in hours < hAut). */
function kern(r, b, g, h0, h1, pf, TF, SRF, st, acc, hAut = -1) {
  const t = r.t, p = r.p, gdz = M.gamma * (r.zb[b] - r.zT), corr = r.corr[b], aBare = r.aBare[b];
  let swe = st[0], aS = st[1], bal = 0, mAut = 0, sAcc = 0;
  for (let h = h0; h < h1; h++) {
    const th = t[h], ph = Number.isFinite(p[h]) ? p[h] : 0, gh = Number.isFinite(g?.[h]) ? g[h] : 0;
    const Tb = th + gdz;
    const fs = Number.isNaN(Tb) ? 0.5 : Math.min(1, Math.max(0, (M.fsWarm - Tb) / (M.fsWarm - M.fsCold)));
    const S = pf * ph * corr * fs;
    swe += S; sAcc += S;
    aS = S > 0 ? aS + (M.aFresh - aS) * Math.min(1, S / 5) : M.aFirnSnow + (aS - M.aFirnSnow) * DECAY;
    let melt = 0;
    if (!acc && !Number.isNaN(th)) {
      const Ti = Tb <= 0 ? Tb : M.bIce * Tb;
      const alb = swe > M.sweMin ? aS : aBare;
      melt = Ti > M.tT ? TF * Ti + SRF * (1 - alb) * gh : 0;
    }
    swe -= Math.min(swe, melt);
    bal += S - melt;
    if (h < hAut) mAut += melt;
  }
  st[0] = swe; st[1] = aS;
  return { bal, mAut, sAcc };
}
const gOf = (r, V, b) => (V.gB ? V.gB.get(r.uid)?.[b] ?? r.g : r.g);

// --- record preparation ------------------------------------------------------------------------------------------------------------------------------
const cat = L.catalog(), tp = L.terrainParams(), T = L.table();
const sunJJAS = (cid) => L.sunDayOf(tp, cid);
function prepE() {
  const { recs, unusable } = L.loadE(join(OUT, 'tmp'));
  return {
    unusable, recs: recs.map((r, i) => ({
      uid: `E${i}`, set: 'E', cid: r.catId, key: r.key, name: r.name, year: r.year, region: r.region, area: r.area, zMed: r.zMed,
      lat: cat.get(r.catId)?.lat ?? r.lat, lon: cat.get(r.catId)?.lon ?? r.lon,
      t: r.t, p: r.p, g: r.g, n: r.t.length, split: r.split, t0Ms: r.t0Ms, zb: r.zbArr, w: r.wArr, zT: r.zT, zP: r.zMed, zG: r.zMed,
      corr: Array.from(r.zbArr, (z) => 1 + (0 * (z - r.zMed)) / 100), ela: r.zMed, aBare: Array.from(r.zbArr, (z) => (z < r.zMed ? M.aIce : M.aFirn)),
      bw: r.bw, bs: r.bs, pGrad: 0, raw: r,
    })),
  };
}
function prepGC() {
  const all = L.loadGateC();
  return all.filter((o) => !o.hef).map((o, i) => {
    const t = new Float64Array(o.win.t.length + o.sum.t.length); t.set(o.win.t); t.set(o.sum.t, o.win.t.length);
    const p = new Float64Array(t.length); p.set(o.win.p); p.set(o.sum.p, o.win.p.length);
    const g = new Float64Array(t.length); g.set(o.win.g); g.set(o.sum.g, o.win.g.length);
    return {
      uid: `G${i}`, set: 'GC', cid: o.cid, key: o.id, name: o.name, year: o.year, zMed: o.zMed, lat: o.lat, lon: o.lon, usable: o.usable,
      t, p, g, n: t.length, split: o.win.t.length, t0Ms: o.t0Win, zb: o.bands.zb, w: o.bands.w, zT: o.zT, zP: o.zP, zG: o.zG,
      corr: Array.from(o.bands.zb, (z) => 1 + (M.pGrad * (z - o.zP)) / 100), ela: o.ela, aBare: Array.from(o.bands.zb, (z) => (z < o.ela ? M.aIce : M.aFirn)),
      bw: o.bw, bs: o.bs, pGrad: M.pGrad, orig: o,
    };
  });
}
function prepW() {
  const { recs, unusable } = L.loadW(join(OUT, 'tmp'));
  return {
    unusable, recs: recs.map((r, i) => ({
      uid: `W${i}`, set: 'W', cid: r.catId, key: r.key, name: r.name, year: r.year, region: r.region, area: r.area, zMed: r.zMed,
      lat: cat.get(r.catId)?.lat ?? r.lat, lon: cat.get(r.catId)?.lon ?? r.lon,
      t: r.t, p: r.p, g: r.g, n: r.t.length, split: r.t.length, t0Ms: r.t0Ms, zb: r.zbArr, w: r.wArr, zT: r.zT, zP: r.zMed, zG: r.zMed,
      corr: Array.from(r.zbArr, (z) => 1 + (0 * (z - r.zMed)) / 100), ela: r.zMed, aBare: Array.from(r.zbArr, (z) => (z < r.zMed ? M.aIce : M.aFirn)),
      meas: r.meas, bands: r.b, pGrad: 0, raw: r,
    })),
  };
}

// --- variants: radiation per band ------------------------------------------------------------------------------------------------------------------
const entryCache = new Map();
const entryOf = (cid) => { if (!entryCache.has(cid)) entryCache.set(cid, L.sunEntryOf(T, cid)); return entryCache.get(cid); };
/** perm: Map cid → cid whose c/svf to use (null = own). */
function terrainVariant(recs, { perm = null, dMode = 'oper' } = {}) {
  const gB = new Map(); let miss = 0;
  for (const r of recs) {
    const own = entryOf(r.cid); if (!own?.z) { miss++; continue; }
    const entry = perm ? L.permEntry(own, entryOf(perm.get(r.cid))) : own;
    gB.set(r.uid, Array.from(r.zb, (z) => L.terrainBand({ entry, zM: z, g: r.g, lat: r.lat, lon: r.lon, t0Ms: r.t0Ms, zClear: r.zG, dMode })));
  }
  return { gB, miss };
}
function oldTongue(r) { const e = entryOf(r.cid); return Array.from(r.zb, (z) => !!e?.z && z < e.z[0]); }

// --- model pieces ------------------------------------------------------------------------------------------------------------------------------------
function winterState(r, pf, V) {
  const key = `${V.name}|${pf}`; r.wc ??= new Map();
  let s = r.wc.get(key);
  if (!s) {
    s = Array.from(r.zb, (_, b) => { const st = [0, M.aFirnSnow]; kern(r, b, gOf(r, V, b), 0, r.split, pf, 0, 0, st, true); return st; });
    if (r.wc.size > 8) r.wc.clear();
    r.wc.set(key, s);
  }
  return s;
}
const bwAcc = (r, pf) => winterState(r, pf, { name: 'acc' }).reduce((s, st, b) => s + r.w[b] * st[0], 0);
function summerBal(r, pf, TF, SRF, V) {
  const ws = winterState(r, pf, V); let s = 0;
  for (let b = 0; b < r.zb.length; b++) { const st = [ws[b][0], ws[b][1]]; s += r.w[b] * kern(r, b, gOf(r, V, b), r.split, r.n, pf, TF, SRF, st, false).bal; }
  return s;
}
/** Winter window with melt (set W). */
function winterBal(r, pf, TF, SRF, V, detail = false) {
  let s = 0; const det = detail ? [] : null;
  const hAut = Math.round((Date.UTC(r.year - 1, 11, 1) - r.t0Ms) / L.H);
  for (let b = 0; b < r.zb.length; b++) {
    const st = [0, M.aFirnSnow];
    const k = kern(r, b, gOf(r, V, b), 0, r.n, pf, TF, SRF, st, false, hAut);
    s += r.w[b] * k.bal;
    if (det) det.push({ z: r.zb[b], w: r.w[b], mAut: k.mAut, acc: k.sAcc });
  }
  return detail ? { bal: s, det } : s;
}

// --- fitting (the procedure of gate-c.mjs) ---------------------------------------------------------------------------------------------------------
function fitPf(set) {
  let xy = 0, xx = 0;
  for (const r of set) { if (r.bw == null) continue; const x = bwAcc(r, 1); xy += x * r.bw; xx += x * x; }
  return Math.min(RULE.PF_B[1], Math.max(RULE.PF_B[0], xy / xx));
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
function fitMelt(set, pf, V, { warm = null, tfB = RULE.TF_B, truth = (r) => r.bs } = {}) {
  const sel = set.filter((r) => truth(r) != null);
  const f = (p) => { let s = 0; for (const r of sel) s += (summerBal(r, pf, p[0], p[1], V) - truth(r)) ** 2; return s / sel.length; };
  const starts = warm ? [warm] : [[0.05, 0.01], [0.03, 0.02], [0.09, 0.004]];
  let best = null;
  for (const x0 of starts) { const r = nelderMead(f, x0, [tfB, RULE.SRF_B], warm ? [0.01, 0.004] : [0.02, 0.01], warm ? 40 : 80); if (!best || r.v < best.v) best = r; }
  return best.x;
}
const atBound = (x, B) => x.some((v, i) => Math.abs(v - B[i][0]) <= 1e-4 * Math.max(1e-9, Math.abs(B[i][1])) || Math.abs(v - B[i][1]) <= 1e-4 * Math.abs(B[i][1]));
function gss(f, a, b, tol) {
  const gr = (Math.sqrt(5) - 1) / 2; let c = b - gr * (b - a), d = a + gr * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) { if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); } }
  return (a + b) / 2;
}

// --- statistics ----------------------------------------------------------------------------------------------------------------------------------
const glacierMeanRes = (rows, k) => { const m = new Map(); for (const r of rows) { const a = m.get(r.cid) ?? []; a.push((r[k] - r.truth) / 1000); m.set(r.cid, a); } return [...m].map(([cid, a]) => ({ cid, res: L.mean(a) })); };
function slopeOf(rows, k, rand = null) {
  let g = glacierMeanRes(rows, k).map((x) => ({ ...x, s: sunJJAS(x.cid) })).filter((x) => x.s != null);
  if (rand) g = Array.from({ length: g.length }, () => g[Math.floor(rand() * g.length)]);
  const b = L.ols(g.map((x) => x.res), g.map((x) => [1, x.s]));
  const my = L.mean(g.map((x) => x.res)), mx = L.mean(g.map((x) => x.s));
  let sxy = 0, sxx = 0, syy = 0; for (const x of g) { sxy += (x.s - mx) * (x.res - my); sxx += (x.s - mx) ** 2; syy += (x.res - my) ** 2; }
  return { slope: b ? b[1] : null, r: sxy / Math.sqrt(sxx * syy), n: g.length };
}
function slopeBoot(rows, k) { const rand = L.rng(RULE.seed); const a = []; for (let i = 0; i < RULE.nBoot; i++) a.push(slopeOf(rows, k, rand).slope); return [L.quant(a, 0.05), L.quant(a, 0.95)]; }
const maeOf = (rows, k) => L.mean(rows.map((r) => Math.abs(r[k] - r.truth) / 1000));
const biasOf = (rows, k) => L.mean(rows.map((r) => (r[k] - r.truth) / 1000));
function gainBoot(rows, kF, kT, by) {
  const groups = new Map(); for (const r of rows) { const a = groups.get(r[by]) ?? []; a.push(r); groups.set(r[by], a); }
  const G = [...groups.values()], rand = L.rng(RULE.seed), out = [];
  for (let i = 0; i < RULE.nBoot; i++) { const pick = []; for (let j = 0; j < G.length; j++) pick.push(...G[Math.floor(rand() * G.length)]); out.push(1 - maeOf(pick, kT) / maeOf(pick, kF)); }
  return { p10: L.quant(out, 0.1), p50: L.quant(out, 0.5), p90: L.quant(out, 0.9) };
}
function derangement(ids, seed) {
  const rand = L.rng(seed), a = [...ids];
  for (;;) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (a.every((x, i) => x !== ids[i])) break; }
  return new Map(ids.map((x, i) => [x, a[i]]));
}
const save = (name, obj) => L.writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1));
const load = (name) => L.J(join(OUT, name));

// ============================================================================================================================================
// controls A1, A2, B, C
// ============================================================================================================================================
if (STEP === 'controls') {
  mem('start');
  const res = { rule: SHA };
  const cal = L.J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
  const E = prepE(), GC = prepGC(), W = prepW();
  log(`E ${E.recs.length} (verworfen ${E.unusable.length}), GC ${GC.length}, W ${W.recs.length} (verworfen ${W.unusable.length})`);
  mem('geladen');
  // A1: band by band = multi-band call; A2: kernel = simulate per band (both flat and terrain)
  let a1 = 0, a1Max = 0, a2 = 0, a2Max = 0, n = 0, tsc = 0;
  for (const set of [E.recs, GC, W.recs]) {
    const Vt = terrainVariant(set);
    for (const r of set) {
      const base = { bands: { zb: r.zb, w: r.w }, ela: r.ela, t: r.t, p: r.p, zT: r.zT, zP: r.zP, pf: cal.pf, TF: cal.TF, SRF: cal.SRF, state: L.emptyState(r.zb.length), pGrad: r.pGrad };
      const m = L.simulate({ ...base, g: r.g }), s = L.simBands({ ...base, g: r.g });
      const same = m.bal.every((v, i) => Object.is(v, s.bal[i])) && m.state.swe.every((v, i) => Object.is(v, s.state.swe[i])) && m.state.aS.every((v, i) => Object.is(v, s.state.aS[i])) && Object.is(m.balance, s.balance);
      let dh = 0; for (let h = 0; h < r.n; h++) dh = Math.max(dh, Math.abs(m.meltH[h] - s.meltH[h]));
      a1Max = Math.max(a1Max, dh); if (!same || dh > 1e-9) a1++;
      // A2 flat and terrain, whole record with melt
      for (const V of [{ name: 'F', gB: null }, { name: 'T', gB: Vt.gB }]) {
        const gb = V.gB ? V.gB.get(r.uid) : null;
        if (V.gB && !gb) continue;
        const sim = L.simBands({ ...base, g: r.g }, gb);
        for (let b = 0; b < r.zb.length; b++) { const st = [0, M.aFirnSnow]; const k = kern(r, b, gOf(r, V, b), 0, r.n, cal.pf, cal.TF, cal.SRF, st, false); const d = Math.abs(k.bal - sim.bal[b]); a2Max = Math.max(a2Max, d); if (!Object.is(k.bal, sim.bal[b]) && d > RULE.a2Tol) a2++; }
      }
      n++;
    }
    const r0 = set[0], e0 = entryOf(r0.cid); if (e0?.z) tsc = Math.max(tsc, L.terrainSelfCheck(e0, r0.zb[0], r0.lat, r0.lon, r0.t0Ms + 200 * 24 * L.H));
    Vt.gB.clear();
  }
  res.A1 = { records: n, failed: a1, maxMeltHourDiff: a1Max, terrainVsOperationMaxRel: tsc, pass: a1 === 0 && tsc <= 1e-12 };
  res.A2 = { failed: a2, maxBandDiffMm: a2Max, pass: a2 === 0 };
  log('A1', res.A1); log('A2', res.A2);
  mem('A');
  if (!res.A1.pass || !res.A2.pass) { save('controls.json', res); log('STOPP: Kontrolle A'); process.exit(4); }
  // B: gate-c.mjs unchanged against melt-calibration.json and the gate C report
  const t0 = Date.now();
  const sp = spawnSync(process.execPath, [join(REPO, 'scripts/glacier/gate-c.mjs'), `--gc=${join(L.CACHE, 'gate-c')}`, `--out=${join(OUT, 'gatec-rebuild.json')}`], { encoding: 'utf8', maxBuffer: 1e8 });
  if (sp.status !== 0) { log('gate-c.mjs', sp.stderr); res.B = { pass: false, error: sp.stderr.slice(0, 500) }; save('controls.json', res); process.exit(4); }
  const rb = load('gatec-rebuild.json'), rep = L.J(join(REPO, 'audit/gletscher/gate-c-report.json'));
  const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  const dB = { pf: rel(rb.full.pf, cal.pf), TF: rel(rb.full.TF, cal.TF), SRF: rel(rb.full.SRF, cal.SRF), DDF: rel(rb.full.DDF, cal.DDF), lyo: Math.abs(rb.lyo.etiMAE - rep.lyo.etiMAE), lgo: Math.abs(rb.lgo.etiMAE - rep.lgo.etiMAE) };
  // the tool's own path (kernel) on GC: same full fit as gate-c.mjs (reported)
  const usable = GC.filter((r) => r.usable), pfK = fitPf(usable), xK = fitMelt(usable, pfK, { name: 'F' });
  res.B = { seconds: (Date.now() - t0) / 1000, diff: dB, toolPath: { pf: pfK, TF: xK[0], SRF: xK[1], dPf: rel(pfK, cal.pf), dTF: rel(xK[0], cal.TF), dSRF: rel(xK[1], cal.SRF) }, pass: ['pf', 'TF', 'SRF', 'DDF'].every((k) => dB[k] <= 1e-9) && dB.lyo <= 1e-9 && dB.lgo <= 1e-9 };
  log('B', res.B);
  if (!res.B.pass) { save('controls.json', res); log('STOPP: Kontrolle B'); process.exit(4); }
  mem('B');
  // C: synthetic truth on E
  const Vt = terrainVariant(E.recs); const VT = { name: 'T', gB: Vt.gB }, VF = { name: 'F', gB: null };
  const recsE = E.recs.filter((r) => Vt.gB.has(r.uid));
  const pf = fitPf(recsE), rand = L.rng(RULE.seed);
  const noise = recsE.map(() => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * RULE.synth.noise; });
  const synT = new Map(recsE.map((r, i) => [r.uid, summerBal(r, pf, RULE.synth.TF, RULE.synth.SRF, VT) + noise[i]]));
  const synF = new Map(recsE.map((r, i) => [r.uid, summerBal(r, pf, RULE.synth.TF, RULE.synth.SRF, VF) + noise[i]]));
  const fitOn = (syn, V) => fitMelt(recsE, pf, V, { truth: (r) => syn.get(r.uid) });
  const inMae = (syn, V, x) => L.mean(recsE.map((r) => Math.abs(summerBal(r, pf, x[0], x[1], V) - syn.get(r.uid)) / 1000));
  const tT = fitOn(synT, VT), tF = fitOn(synT, VF), fT = fitOn(synF, VT), fF = fitOn(synF, VF);
  const rowsSyn = recsE.map((r) => ({ cid: r.cid, truth: synT.get(r.uid), F: summerBal(r, pf, tF[0], tF[1], VF), T: summerBal(r, pf, tT[0], tT[1], VT) }));
  const slF = slopeOf(rowsSyn, 'F'), bootF = slopeBoot(rowsSyn, 'F');
  const gainFlatTruth = 1 - inMae(synF, VT, fT) / inMae(synF, VF, fF);
  res.C = {
    pf, terrainTruth: { T1: { TF: tT[0], SRF: tT[1] }, F1: { TF: tF[0], SRF: tF[1] }, maeT1: inMae(synT, VT, tT), maeF1: inMae(synT, VF, tF), slopeF1: slF, slopeF1Boot: bootF, slopeDetectable: bootF[0] > 0 || bootF[1] < 0 },
    flatTruth: { T1: { TF: fT[0], SRF: fT[1] }, F1: { TF: fF[0], SRF: fF[1] }, gainT1: gainFlatTruth },
    recovered: { TF: Math.abs(tT[0] / RULE.synth.TF - 1), SRF: Math.abs(tT[1] / RULE.synth.SRF - 1) },
  };
  res.C.pass = res.C.recovered.TF <= RULE.synth.tol && res.C.recovered.SRF <= RULE.synth.tol && gainFlatTruth < RULE.gainMin;
  log('C', res.C);
  save('controls.json', res);
  mem('C');
  if (!res.C.pass) { log('STOPP: Kontrolle C'); process.exit(4); }
  log('Kontrollen A, B, C bestanden');
}

// ============================================================================================================================================
// summer side (B1 + B4 summer + reported fits) and gate C second view
// ============================================================================================================================================
function variantsList(ids) {
  const v = [
    { name: 'F1', terrain: false }, { name: 'T1', terrain: true },
    { name: 'T1erbs', terrain: true, dMode: 'erbs', reported: true },
    { name: 'F1wide', terrain: false, tfB: RULE.TF_B_WIDE, reported: true }, { name: 'T1wide', terrain: true, tfB: RULE.TF_B_WIDE, reported: true },
  ];
  for (let k = 1; k <= RULE.nPerm; k++) v.push({ name: `P${k}`, terrain: true, perm: derangement(ids, RULE.seed + k) });
  return v;
}
function permIds() {
  const e = L.J(join(L.CACHE, 'gm3/truth/gy.json')).gy.filter((o) => o.country === 'CH' && o.year >= 2012).map((o) => o.catId);
  const w = L.J(join(L.CACHE, 'gm11/w26/gy-2526.json')).gy.filter((o) => o.country === 'CH').map((o) => o.catId);
  return [...new Set([...e, ...w])].filter((id) => entryOf(id)?.z).sort();
}
if (STEP === 'summer') {
  mem('start');
  const E = prepE(); const recs = E.recs; mem('E geladen');
  const ids = permIds(), out = { rule: SHA, n: recs.length, glaciers: new Set(recs.map((r) => r.cid)).size, unusable: E.unusable, variants: {} };
  const pfFull = fitPf(recs);
  const glaciers = [...new Set(recs.map((r) => r.cid))];
  const only = args.only ? new Set(args.only.split(',')) : null;
  const prev = only && L.existsSync(join(OUT, 'summer.json')) ? load('summer.json') : null;
  if (prev) Object.assign(out.variants, prev.variants);
  for (const v of variantsList(ids)) {
    if (only && !only.has(v.name)) continue;
    const t0 = Date.now();
    const Vt = v.terrain ? terrainVariant(recs, { perm: v.perm, dMode: v.dMode }) : { gB: null, miss: 0 };
    const V = { name: v.name, gB: Vt.gB };
    for (const r of recs) r.wc = null;
    const tfB = v.tfB ?? RULE.TF_B;
    const full = fitMelt(recs, pfFull, V, { tfB });
    const rows = [], folds = [];
    for (const cid of glaciers) {
      const train = recs.filter((r) => r.cid !== cid), test = recs.filter((r) => r.cid === cid);
      const pf = fitPf(train), x = fitMelt(train, pf, V, { warm: full, tfB });
      folds.push({ cid, pf, TF: x[0], SRF: x[1], atBound: atBound(x, [tfB, RULE.SRF_B]) });
      for (const r of test) {
        // the scored number with simulate band by band
        const base = { bands: { zb: r.zb, w: r.w }, ela: r.ela, t: r.t, p: r.p, zT: r.zT, zP: r.zP, pGrad: r.pGrad };
        const gb = V.gB ? V.gB.get(r.uid) : null;
        const wi = L.simBands({ ...base, t: r.t.subarray(0, r.split), p: r.p.subarray(0, r.split), g: r.g.subarray(0, r.split), pf, TF: 0, SRF: 0, state: L.emptyState(r.zb.length), accumulateOnly: true }, gb ? gb.map((a) => a.subarray(0, r.split)) : null);
        const su = L.simBands({ ...base, t: r.t.subarray(r.split), p: r.p.subarray(r.split), g: r.g.subarray(r.split), pf, TF: x[0], SRF: x[1], state: wi.state }, gb ? gb.map((a) => a.subarray(r.split)) : null);
        rows.push({ uid: r.uid, cid, year: r.year, truth: r.bs, m: su.balance, mKern: summerBal(r, pf, x[0], x[1], V) });
      }
    }
    const kernDiff = Math.max(...rows.map((x) => Math.abs(x.m - x.mKern)));
    out.variants[v.name] = { full: { pf: pfFull, TF: full[0], SRF: full[1], atBound: atBound(full, [tfB, RULE.SRF_B]) }, tfB, folds, rows, mae: maeOf(rows, 'm'), bias: biasOf(rows, 'm'), kernDiff, miss: Vt.miss, perm: v.perm ? [...v.perm] : null, seconds: (Date.now() - t0) / 1000 };
    log(v.name, JSON.stringify({ full: out.variants[v.name].full, mae: out.variants[v.name].mae, bias: out.variants[v.name].bias, kernDiff, s: out.variants[v.name].seconds }));
    if (Vt.gB) Vt.gB.clear();
    save('summer.json', out);
    mem(v.name);
  }
  // gate C second view: LGO, 2025 never in training
  if (!only || only.has('GC')) {
    const GC = prepGC().filter((r) => r.usable); const gv = {};
    for (const v of variantsList(ids).filter((x) => ['F1', 'T1'].includes(x.name))) {
      const Vt = v.terrain ? terrainVariant(GC) : { gB: null }; const V = { name: v.name, gB: Vt.gB };
      const fitSet = GC.filter((r) => r.year !== 2025), pf = fitPf(fitSet), full = fitMelt(fitSet, pf, V);
      const rows = [];
      for (const cid of [...new Set(GC.map((r) => r.cid))]) {
        const train = fitSet.filter((r) => r.cid !== cid), pfk = fitPf(train), x = fitMelt(train, pfk, V, { warm: full });
        for (const r of GC.filter((r) => r.cid === cid)) rows.push({ uid: r.uid, cid, year: r.year, truth: r.bs, m: summerBal(r, pfk, x[0], x[1], V) });
      }
      gv[v.name] = { full: { pf, TF: full[0], SRF: full[1], atBound: atBound(full, [RULE.TF_B, RULE.SRF_B]) }, rows, mae: maeOf(rows, 'm'), bias: biasOf(rows, 'm') };
      log('GC', v.name, JSON.stringify({ full: gv[v.name].full, mae: gv[v.name].mae, bias: gv[v.name].bias }));
    }
    out.gc = gv; save('summer.json', out);
  }
  mem('Ende');
}

// ============================================================================================================================================
// winter side (B2 + B4 winter)
// ============================================================================================================================================
if (STEP === 'winter') {
  mem('start');
  const S = load('summer.json'), cal = L.J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
  const W = prepW(); const recs = W.recs; mem('W geladen');
  const precip = precipRunOf(L.J(join(REPO, 'scripts/glacier/snow-calibration.json')), [...new Set(recs.map((r) => r.region))]);
  const ids = permIds(), out = { rule: SHA, n: recs.length, glaciers: new Set(recs.map((r) => r.cid)).size, unusable: W.unusable, variants: {} };
  const only = args.only ? new Set(args.only.split(',')) : null;
  const prev = only && L.existsSync(join(OUT, 'winter.json')) ? load('winter.json') : null;
  if (prev) Object.assign(out.variants, prev.variants);
  const vs = [{ name: 'F0', terrain: false, TF: cal.TF, SRF: cal.SRF, reported: true }, { name: 'T0', terrain: true, TF: cal.TF, SRF: cal.SRF, reported: true },
    ...variantsList(ids).map((v) => ({ ...v, TF: S.variants[v.name]?.full.TF, SRF: S.variants[v.name]?.full.SRF }))];
  const glaciers = [...new Set(recs.map((r) => r.cid))], years = [...new Set(recs.map((r) => r.year))];
  const fitW = (set, TF, SRF, V) => gss((pf) => { let s = 0; for (const r of set) s += (winterBal(r, pf, TF, SRF, V) - r.meas) ** 2; return s; }, RULE.PF_B[0], RULE.PF_B[1], RULE.gssTol);
  for (const v of vs) {
    if (only && !only.has(v.name)) continue;
    if (v.TF == null) { log(`${v.name}: kein Sommerfit, übersprungen`); continue; }
    const t0 = Date.now(), perm = v.perm ?? null;
    const Vt = v.terrain ? terrainVariant(recs, { perm, dMode: v.dMode }) : { gB: null, miss: 0 };
    const V = { name: v.name, gB: Vt.gB };
    const fitSet = recs.filter((r) => r.year !== 2025);
    const pfFull = fitW(fitSet, v.TF, v.SRF, V);
    const lgo = [], lowo = [], foldsG = [], foldsY = [];
    for (const cid of glaciers) { const pf = fitW(fitSet.filter((r) => r.cid !== cid), v.TF, v.SRF, V); foldsG.push({ cid, pf }); for (const r of recs.filter((r) => r.cid === cid)) lgo.push({ uid: r.uid, cid, year: r.year, truth: r.meas, m: winterBal(r, pf, v.TF, v.SRF, V) }); }
    for (const y of years) { const pf = fitW(fitSet.filter((r) => r.year !== y), v.TF, v.SRF, V); foldsY.push({ year: y, pf }); for (const r of recs.filter((r) => r.year === y)) lowo.push({ uid: r.uid, cid: r.cid, year: y, truth: r.meas, m: winterBal(r, pf, v.TF, v.SRF, V) }); }
    const o = { TF: v.TF, SRF: v.SRF, pfFull, foldsG, foldsY, lgo: { rows: lgo, mae: maeOf(lgo, 'm'), bias: biasOf(lgo, 'm') }, lowo: { rows: lowo, mae: maeOf(lowo, 'm'), bias: biasOf(lowo, 'm') }, miss: Vt.miss };
    if (!perm) {
      // country value, k*, autumn melt by step (reported)
      const cv = recs.map((r) => ({ uid: r.uid, cid: r.cid, year: r.year, truth: r.meas, m: winterBal(r, precip.factorOf(r.region), v.TF, v.SRF, V) }));
      o.country = { mae: maeOf(cv, 'm'), bias: biasOf(cv, 'm'), mae2026: maeOf(cv.filter((x) => x.year === 2026), 'm'), bias2026: biasOf(cv.filter((x) => x.year === 2026), 'm'), rows: cv };
      o.kstar = recs.map((r) => {
        let a = 0.3, b = 8; const f = (k) => winterBal(r, k, v.TF, v.SRF, V) - r.meas;
        if (f(a) > 0 || f(b) < 0) return { uid: r.uid, cid: r.cid, year: r.year, k: null };
        for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
        return { uid: r.uid, cid: r.cid, year: r.year, k: (a + b) / 2 };
      });
      const steps = new Map();
      for (const r of recs) {
        const d = winterBal(r, pfFull, v.TF, v.SRF, V, true).det, old = oldTongue(r);
        d.forEach((x, b) => { const s = Math.floor(x.z / 250) * 250, A = x.w * r.area, e = steps.get(s) ?? { A: 0, aut: 0, acc: 0, old: 0, aut26: 0, acc26: 0 }; e.A += A; e.aut += A * x.mAut; e.acc += A * x.acc; if (old[b]) e.old += A; if (r.year === 2026) { e.aut26 += A * x.mAut; e.acc26 += A * x.acc; } steps.set(s, e); });
      }
      o.autumn = [...steps].sort((a, b) => a[0] - b[0]).map(([s, e]) => ({ step: s, meltMm: e.aut / e.A, accMm: e.acc / e.A, share: e.aut / e.acc, share2026: e.acc26 > 0 ? e.aut26 / e.acc26 : null, oldTongueArea: e.old / e.A }));
    }
    o.seconds = (Date.now() - t0) / 1000;
    out.variants[v.name] = o;
    log(v.name, JSON.stringify({ TF: o.TF, SRF: o.SRF, pfFull, lgo: o.lgo.mae, lowo: o.lowo.mae, country: o.country?.mae, s: o.seconds }));
    if (Vt.gB) Vt.gB.clear();
    for (const r of recs) r.wc = null;
    save('winter.json', out);
    mem(v.name);
  }
}

// ============================================================================================================================================
// B3 — satellite, modelled snow line on GC (Jun–Sep 2023–2025)
// ============================================================================================================================================
function obsDocs(years) {
  const DR = 'C:/dev/buscosun-data';
  const files = execSync('git ls-tree -r --name-only origin/main -- glacier/v1/obs', { cwd: DR, maxBuffer: 1e8 }).toString().trim().split('\n').filter((f) => years.includes(+f.split('/')[3]));
  const res = spawnSync('git', ['cat-file', '--batch'], { cwd: DR, input: files.map((f) => `origin/main:${f}`).join('\n') + '\n', maxBuffer: 2e9 });
  const buf = res.stdout, docs = []; let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(10, i), head = buf.subarray(i, nl).toString().split(' '), size = +head[2];
    docs.push(JSON.parse(buf.subarray(nl + 1, nl + 1 + size).toString('utf8'))); i = nl + 1 + size + 1;
  }
  return docs;
}
if (STEP === 'b3') {
  mem('start');
  const S = load('summer.json'), GC = prepGC().filter((r) => r.usable), docs = obsDocs([2023, 2024, 2025]);
  const scenes = [];
  for (const d of docs) { const m = +d.date.slice(5, 7); if (m < 6 || m > 9) continue; for (const [id, v] of Object.entries(d.items)) if (v.state === 'snowline' && v.sla != null) scenes.push({ id, date: d.date, sla: v.sla, flags: v.flags }); }
  const out = { rule: SHA, variants: {} };
  const byC = new Map(); for (const r of GC) byC.set(`${r.cid}|${r.year}`, r);
  for (const vn of ['F1', 'T1']) {
    const P = S.gc[vn].full, Vt = vn === 'T1' ? terrainVariant(GC) : { gB: null }, V = { name: vn, gB: Vt.gB };
    const rows = [];
    for (const s of scenes) {
      const r = byC.get(`${s.id}|${+s.date.slice(0, 4)}`); if (!r) continue;
      const hEnd = Math.round((Date.parse(`${s.date}T23:00:00Z`) - r.t0Ms) / L.H) + 1; if (hEnd > r.n) continue;
      const ws = winterState(r, P.pf, V);
      const snow = Array.from(r.zb, (_, b) => { const st = [ws[b][0], ws[b][1]]; kern(r, b, gOf(r, V, b), r.split, hEnd, P.pf, P.TF, P.SRF, st, false); return st[0] > M.sweMin; });
      const order = Array.from(r.zb.keys()).sort((a, b) => r.zb[a] - r.zb[b]);
      let k = order.length; while (k > 0 && snow[order[k - 1]]) k--;
      const zs = order.map((b) => r.zb[b]); let sl, cens = null;
      if (k === order.length) { sl = zs[zs.length - 1] + 25; cens = 'snow-free'; } else if (k === 0) { sl = zs[0] - 25; cens = 'snow-covered'; } else sl = zs[k];
      rows.push({ cid: r.cid, year: r.year, date: s.date, err: sl - s.sla, cens, sd: sunJJAS(r.cid) });
    }
    out.variants[vn] = { params: P, rows };
    log('B3', vn, rows.length);
  }
  save('b3.json', out); mem('Ende');
}

// ============================================================================================================================================
// B5 — model-free: snow line against sunDay over all glaciers with scenes 2025–2026
// ============================================================================================================================================
if (STEP === 'b5') {
  mem('start');
  const docs = obsDocs([2025, 2026]); mem('Szenen gelesen');
  const last = new Map();
  for (const d of docs) {
    const m = +d.date.slice(5, 7); if (m < 8 || m > 10) continue;
    for (const [id, v] of Object.entries(d.items)) {
      if (v.state !== 'snowline' || v.sla == null) continue;
      const k = `${id}|${d.date.slice(0, 4)}`, cur = last.get(k);
      if (!cur || d.date > cur.date) last.set(k, { id, year: +d.date.slice(0, 4), date: d.date, sla: v.sla, flags: v.flags ?? [] });
    }
  }
  const rows = [...last.values()].map((x) => { const c = cat.get(x.id); return { ...x, region: c?.region, country: c?.country, zMed: c?.z?.[1], sd: sunJJAS(x.id) }; }).filter((x) => x.zMed != null && x.sd != null && x.region);
  function fit(R, perm = null) {
    const regs = [...new Set(R.map((r) => r.region))].sort(), yrs = [...new Set(R.map((r) => r.year))].sort();
    const X = R.map((r, i) => [1, perm ? perm[i] : r.sd, r.zMed / 1000, ...regs.slice(1).map((g) => (r.region === g ? 1 : 0)), ...yrs.slice(1).map((y) => (r.year === y ? 1 : 0))]);
    const b = L.ols(R.map((r) => r.sla - r.zMed), X); return b ? b[1] / 10 : null;   // m per 0.1 sunDay
  }
  function describe(R) {
    if (R.length < 20) return { n: R.length, note: 'zu wenige' };
    const slope = fit(R), gl = [...new Set(R.map((r) => r.id))], rand = L.rng(RULE.seed), boot = [];
    const by = new Map(); for (const r of R) { const a = by.get(r.id) ?? []; a.push(r); by.set(r.id, a); }
    for (let i = 0; i < RULE.nBoot; i++) { const pick = []; for (let j = 0; j < gl.length; j++) pick.push(...by.get(gl[Math.floor(rand() * gl.length)])); const s = fit(pick); if (s != null) boot.push(s); }
    const prand = L.rng(RULE.seed + 1), perms = [];
    for (let i = 0; i < RULE.b5Perm; i++) {
      // sunDay permuted between glaciers within regions (a glacier keeps one value over its years)
      const byReg = new Map(); for (const g of gl) { const reg = by.get(g)[0].region; const a = byReg.get(reg) ?? []; a.push(g); byReg.set(reg, a); }
      const map = new Map(); for (const a of byReg.values()) { const s = a.map((g) => by.get(g)[0].sd); for (let k = s.length - 1; k > 0; k--) { const j = Math.floor(prand() * (k + 1)); [s[k], s[j]] = [s[j], s[k]]; } a.forEach((g, k) => map.set(g, s[k])); }
      const s = fit(R, R.map((r) => map.get(r.id))); if (s != null) perms.push(s);
    }
    return { n: R.length, glaciers: gl.length, slopeMPer01: slope, boot5: L.quant(boot, 0.05), boot95: L.quant(boot, 0.95), signExpected: '+', signAsExpected: slope > 0, perm: { p5: L.quant(perms, 0.05), p50: L.quant(perms, 0.5), p95: L.quant(perms, 0.95), shareAbsGE: perms.filter((s) => Math.abs(s) >= Math.abs(slope)).length / perms.length }, sunDay: { p10: L.quant(R.map((r) => r.sd), 0.1), p50: L.quant(R.map((r) => r.sd), 0.5), p90: L.quant(R.map((r) => r.sd), 0.9) } };
  }
  const noShade = rows.filter((r) => !r.flags.includes('schatten'));
  const out = { rule: SHA, all: describe(rows), withoutShadowFlag: describe(noShade), byCountry: {}, flagged: rows.filter((r) => r.flags.length).length, byYear: Object.fromEntries([2025, 2026].map((y) => [y, rows.filter((r) => r.year === y).length])) };
  for (const c of ['CH', 'AT', 'DE', 'IT']) { const R = rows.filter((r) => r.country === c); if (R.length) out.byCountry[c] = { all: describe(R), withoutShadowFlag: describe(R.filter((r) => !r.flags.includes('schatten'))) }; }
  save('b5.json', out); log('B5', JSON.stringify({ ...out, byCountry: Object.keys(out.byCountry) }));
  mem('Ende');
}

// ============================================================================================================================================
// report and verdicts
// ============================================================================================================================================
if (STEP === 'report') {
  const C = load('controls.json'), S = load('summer.json'), Wd = load('winter.json'), B3 = load('b3.json'), B5 = load('b5.json');
  if (!(C.A1.pass && C.A2.pass && C.B.pass && C.C.pass)) { console.error('Kontrollen nicht bestanden'); process.exit(4); }
  const join2 = (a, b) => { const m = new Map(b.map((x) => [x.uid, x.m])); return a.map((x) => ({ ...x, F: x.m, T: m.get(x.uid) })); };
  // summer
  const sF = S.variants.F1.rows, sT = S.variants.T1.rows, sRows = join2(sF, sT).filter((x) => x.T != null);
  const sGain = 1 - maeOf(sRows, 'T') / maeOf(sRows, 'F'), sBoot = gainBoot(sRows, 'F', 'T', 'cid');
  const slF = slopeOf(sRows, 'F'), slT = slopeOf(sRows, 'T'), bootF = slopeBoot(sRows, 'F'), bootT = slopeBoot(sRows, 'T');
  const detectable = bootF[0] > 0 || bootF[1] < 0;
  const permS = Object.entries(S.variants).filter(([k]) => /^P\d+$/.test(k)).map(([k, v]) => { const R = join2(sF, v.rows).filter((x) => x.T != null); return { k, gain: 1 - maeOf(R, 'T') / maeOf(R, 'F') }; });
  // winter
  const wv = Wd.variants, wG = join2(wv.F1.lgo.rows, wv.T1.lgo.rows), wY = join2(wv.F1.lowo.rows, wv.T1.lowo.rows);
  const wGainG = 1 - maeOf(wG, 'T') / maeOf(wG, 'F'), wGainY = 1 - maeOf(wY, 'T') / maeOf(wY, 'F');
  const wBootG = gainBoot(wG, 'F', 'T', 'cid'), wBootY = gainBoot(wY, 'F', 'T', 'year');
  const permW = Object.entries(wv).filter(([k]) => /^P\d+$/.test(k)).map(([k, v]) => { const R = join2(wv.F1.lgo.rows, v.lgo.rows); return { k, gain: 1 - maeOf(R, 'T') / maeOf(R, 'F') }; });
  const med = (a) => L.quant(a.map((x) => x.gain), 0.5);
  const winterOK = maeOf(wG, 'T') <= RULE.otherSide * maeOf(wG, 'F') && maeOf(wY, 'T') <= RULE.otherSide * maeOf(wY, 'F');
  const summerOK = maeOf(sRows, 'T') <= RULE.otherSide * maeOf(sRows, 'F');
  const sCore = sGain >= RULE.gainMin && sBoot.p10 > 0 && (!detectable || Math.abs(slT.slope) <= RULE.slopeHalf * Math.abs(slF.slope)) && winterOK;
  const summerVerdict = !sCore ? 'does not carry' : med(permS) <= RULE.permHalf * sGain ? 'carries' : 'only the level';
  const wCore = wGainG >= RULE.gainMin && wGainY >= RULE.gainMin && wBootG.p10 > 0 && wBootY.p10 > 0 && summerOK;
  const winterVerdict = !wCore ? 'does not carry' : med(permW) <= RULE.permHalf * wGainG ? 'carries' : 'only the level';
  // k*
  const kOf = (v) => { const m = new Map(); for (const x of wv[v].kstar) if (x.k != null) { const a = m.get(x.cid) ?? []; a.push(x.k); m.set(x.cid, a); } return m; };
  const k0 = kOf('F0'), kF = kOf('F1'), kT = kOf('T1');
  const cv = (a) => { const m = L.mean(a); return Math.sqrt(L.mean(a.map((x) => (x - m) ** 2))) / m; };
  const kSum = (m) => ({ medianK: L.quant([...m.values()].map((a) => L.quant(a, 0.5)), 0.5), cvMedian: L.quant([...m.values()].filter((a) => a.length >= 4).map(cv), 0.5) });
  const ratio = (m) => { const r = [...m].filter(([c]) => k0.has(c)).map(([c, a]) => L.quant(a, 0.5) / L.quant(k0.get(c), 0.5)); return { p10: L.quant(r, 0.1), p50: L.quant(r, 0.5), p90: L.quant(r, 0.9), n: r.length }; };
  const b3 = (vn) => { const R = B3.variants[vn].rows, sds = [...new Set(R.map((x) => x.sd))].sort((a, b) => a - b), t1 = L.quant(sds, 1 / 3), t2 = L.quant(sds, 2 / 3); const part = (f) => { const x = R.filter(f); return { n: x.length, mae: L.mean(x.map((y) => Math.abs(y.err))), bias: L.mean(x.map((y) => y.err)), censored: x.filter((y) => y.cens).length }; }; return { all: part(() => true), shaded: part((x) => x.sd <= t1), middle: part((x) => x.sd > t1 && x.sd <= t2), open: part((x) => x.sd > t2), terciles: [t1, t2] }; };
  const pv = (v) => ({ TF: v.full.TF, SRF: v.full.SRF, pf: v.full.pf, atBound: v.full.atBound, foldsAtBound: v.folds.filter((f) => f.atBound).length, mae: v.mae, bias: v.bias });
  const rep = {
    schema: 1, kind: 'gm12/sun-report', rule: { file: 'audit/gletscher-schneemodell/gm12-sun-frozen.md', sha256: SHA }, generated: new Date().toISOString(),
    note: 'keine Bilanz je Gletscherjahr (E-GL-17); Geländesonne = Geometrie 2026 auf Umrissen des Inventars',
    controls: { A1: C.A1, A2: C.A2, B: { pass: C.B.pass, diff: C.B.diff, toolPath: C.B.toolPath }, C: C.C },
    summer: {
      n: sRows.length, glaciers: new Set(sRows.map((x) => x.cid)).size, F1: pv(S.variants.F1), T1: pv(S.variants.T1), gain: sGain, gainBoot: sBoot,
      slope: { F1: { ...slF, boot5_95: bootF }, T1: { ...slT, boot5_95: bootT }, F1detectable: detectable }, perm: { gains: permS.map((x) => x.gain), median: med(permS), p90: L.quant(permS.map((x) => x.gain), 0.9) },
      winterNotWorse: winterOK, verdict: summerVerdict, leverage: detectable ? 'slope detectable' : 'no leverage in summer',
      reported: { T1erbs: pv(S.variants.T1erbs), F1wide: pv(S.variants.F1wide), T1wide: pv(S.variants.T1wide) },
      byYear2023_24: Object.fromEntries([2023, 2024].map((y) => [y, { maeF1: maeOf(sRows.filter((x) => x.year === y), 'F'), maeT1: maeOf(sRows.filter((x) => x.year === y), 'T') }])),
      gateC: { F1: { ...S.gc.F1.full, mae: S.gc.F1.mae, bias: S.gc.F1.bias }, T1: { ...S.gc.T1.full, mae: S.gc.T1.mae, bias: S.gc.T1.bias }, gain: 1 - S.gc.T1.mae / S.gc.F1.mae,
        slope: (() => { const R = join2(S.gc.F1.rows, S.gc.T1.rows); return { F1: slopeOf(R, 'F'), T1: slopeOf(R, 'T') }; })(), y2025: (() => { const R = join2(S.gc.F1.rows, S.gc.T1.rows).filter((x) => x.year === 2025); return { n: R.length, maeF1: maeOf(R, 'F'), maeT1: maeOf(R, 'T') }; })() },
    },
    winter: {
      n: wG.length, glaciers: new Set(wG.map((x) => x.cid)).size,
      rows: Object.fromEntries(['F0', 'T0', 'F1', 'T1', 'T1erbs', 'F1wide', 'T1wide'].filter((k) => wv[k]).map((k) => [k, { TF: wv[k].TF, SRF: wv[k].SRF, pfFull: wv[k].pfFull, lgoMae: wv[k].lgo.mae, lgoBias: wv[k].lgo.bias, lowoMae: wv[k].lowo.mae, lowoBias: wv[k].lowo.bias, country: wv[k].country ? { mae: wv[k].country.mae, bias: wv[k].country.bias, mae2026: wv[k].country.mae2026, bias2026: wv[k].country.bias2026 } : null, y2026: (() => { const R = wv[k].lgo.rows.filter((x) => x.year === 2026); return { mae: maeOf(R, 'm'), bias: biasOf(R, 'm') }; })(), y2025: (() => { const R = wv[k].lgo.rows.filter((x) => x.year === 2025); return { mae: maeOf(R, 'm'), bias: biasOf(R, 'm') }; })() }])),
      gainLGO: wGainG, gainLOWO: wGainY, bootLGO: wBootG, bootLOWO: wBootY, perm: { gains: permW.map((x) => x.gain), median: med(permW), p90: L.quant(permW.map((x) => x.gain), 0.9) },
      summerNotWorse: summerOK, verdict: winterVerdict,
      autumn: { F0: wv.F0.autumn, F1: wv.F1.autumn, T1: wv.T1.autumn },
      kstar: { F0: kSum(k0), F1: { ...kSum(kF), ratioToF0: ratio(kF) }, T1: { ...kSum(kT), ratioToF0: ratio(kT) } },
    },
    b3: { note: 'nachrangig, GC 2023–2025 Jun–Sep, Parameter der zweiten Ansicht', F1: b3('F1'), T1: b3('T1') },
    b5: B5,
  };
  L.writeFileSync(join(HERE, 'gm12-sun-report.json'), JSON.stringify(rep, null, 1));
  console.log(JSON.stringify({ summer: { verdict: summerVerdict, leverage: rep.summer.leverage, gain: sGain, p10: sBoot.p10, permMedian: med(permS), slopeF: slF.slope, slopeT: slT.slope, bootF }, winter: { verdict: winterVerdict, gainLGO: wGainG, gainLOWO: wGainY, p10G: wBootG.p10, p10Y: wBootY.p10, permMedian: med(permW) } }, null, 1));
}

// debug of control A2 (no scoring)
if (STEP === 'dbg-a2') {
  const cal = L.J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit;
  for (const [nm, set] of [['GC', prepGC()], ['E', prepE().recs.slice(0, 30)], ['W', prepW().recs.slice(0, 30)]]) {
    const Vt = terrainVariant(set); let bad = { F: 0, T: 0 }, ex = null;
    for (const r of set) {
      const base = { bands: { zb: r.zb, w: r.w }, ela: r.ela, t: r.t, p: r.p, zT: r.zT, zP: r.zP, pf: cal.pf, TF: cal.TF, SRF: cal.SRF, state: L.emptyState(r.zb.length), pGrad: r.pGrad };
      for (const V of [{ name: 'F', gB: null }, { name: 'T', gB: Vt.gB }]) {
        const gb = V.gB ? V.gB.get(r.uid) : null; if (V.gB && !gb) continue;
        const sim = L.simBands({ ...base, g: r.g }, gb);
        for (let b = 0; b < r.zb.length; b++) { const st = [0, M.aFirnSnow]; const k = kern(r, b, gOf(r, V, b), 0, r.n, cal.pf, cal.TF, cal.SRF, st, false); if (Math.abs(k.bal - sim.bal[b]) > 1e-6) { bad[V.name]++; ex ??= { uid: r.uid, b, V: V.name, k: k.bal, s: sim.bal[b], n: r.n, tl: r.t.length, gl: r.g.length } } }
      }
    }
    console.log(nm, bad, ex);
  }
}
if (STEP === 'dbg-b') {
  const GC = prepGC().filter((r) => r.usable); const pf = fitPf(GC);
  console.log('pf', pf, GC.length, GC.filter((r) => r.bw == null).length);
  const r = GC[0]; console.log(summerBal(r, pf, 0.05, 0.01, { name: 'F' }), r.bs, r.split, r.n);
  const bad = GC.filter((r) => !Number.isFinite(summerBal(r, pf, 0.05, 0.01, { name: 'F' }))); console.log('nan', bad.length, bad[0]?.name, bad[0]?.year);
}
