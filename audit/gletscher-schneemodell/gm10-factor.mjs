#!/usr/bin/env node
/**
 * Phase GM-10, step 0 — can the precipitation factor of a glacier be predicted from gridded snow analyses and terrain? (go / no-go)
 * Rule: audit/gletscher-schneemodell/gm10-method-frozen.md (the mode `score` only runs when its sha256 matches gm10-method-frozen.sha256).
 *
 *   node audit/gletscher-schneemodell/gm10-factor.mjs --mode=inventory|synthetic|score --cache=<gm3> --truth=<gy.json> --gm10=<gm10 cache>
 *        --report=<gm5b-report.json> [--frozen=<gm10-method-frozen.md>] [--out=<report.json>]
 *
 * Melt core, constants, forcing, radiation and truth are those of GM-5b (`snowcal-fit2.mjs`, `snowcal-fit.mjs`, imported, unchanged).
 * Every candidate predicts ln F̂_g = c_country + Σ β_j · (x_jg − x̄_j) and is FITTED on the scored measure: the mean over the training
 * glacier-winters of the winter-balance error |Σ_b w_b · bal_b(F̂) − Σ_b w_b · bw_b| (mm w.e.), on the tables over k (V-GM-103).
 * Reported errors of the real run are recomputed exactly with the core (`scoreOf`); fits, bootstrap and permutations use the tables.
 * Nothing is written except `--out`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { rng } from '../../scripts/glacier/lib/meltcore.mjs';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation, tableOf, tabVal, fitF, scoreOf, KS, CAL2 } from '../../scripts/glacier/snowcal-fit2.mjs';

// ---- rule constants (mirrored in gm10-method-frozen.md §5) ---------------------------------------------------------------------------------
export const GM10 = Object.freeze({
  minGridWinters: 3, minGlaciersVerdict: 10, gainMin: 0.10, bootP10: 0, permP: 0.05, perms: 200, boot: 1000, seed: 42,
  nmIter: 400, kLo: CAL2.kMin, kHi: CAL2.kMax,
});
/** Hash of the GM-5b rule; the baselines (a) and (b) come from the rows of THAT run (`gm3\report-fit2.json`, the local original). */
const GM5B_SHA = 'c5242e51e53d55e5eabf4e034208e28bdfca7d6ff74fc491a45a8d13b8231344';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

// ---- data ----------------------------------------------------------------------------------------------------------------------------------
export function loadAll({ cache, truth, gm10, reportPath }) {
  const cal = JSON.parse(readFileSync(new URL('../../scripts/glacier/melt-calibration.json', import.meta.url), 'utf8')).fit;
  const { winters, fromMs } = loadWinters({ truthPath: truth, cache });
  const rads = new Map(), radOf = (id) => { if (!rads.has(id)) rads.set(id, JSON.parse(readFileSync(join(cache, `rad-${id}.json`), 'utf8'))); return rads.get(id); };
  attachRadiation(winters, radOf, fromMs);
  const ETI = { model: 'eti', TF: cal.TF, SRF: cal.SRF };
  log(`${winters.length} nutzbare Gletscherwinter; Tabellen über k …`);
  const items = winters.map((rec) => {
    const tab = tableOf(rec, ETI);
    const tot = new Float64Array(KS.length); for (let j = 0; j < KS.length; j++) for (let b = 0; b < tab.length; b++) tot[j] += rec.b[b].w * tab[b][j];
    return { rec, tab, tot, BW: rec.b.reduce((s, x) => s + x.w * x.bw, 0) };
  });
  log('Tabellen fertig');
  const q20 = JSON.parse(readFileSync(join(gm10, 'q20-glaciers.json'), 'utf8'));
  const sg = JSON.parse(readFileSync(join(gm10, 'snowgrid', 'at-glaciers.json'), 'utf8'));
  const terrain = JSON.parse(readFileSync(join(gm10, 'terrain.json'), 'utf8')).glaciers;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(report.perWinter) || report.method?.sha256 !== GM5B_SHA) throw new Error('Bericht von GM-5b ohne Zeilen je Winter oder mit anderer Regel');
  return { ETI, items, q20, sg, terrain, report };
}

/** k for which the glacier-mean balance of the core reaches `target` (mm), on the table; capped at the bounds. */
export function kFor(tot, target) {
  if (target <= tot[0]) return { k: KS[0], capped: true };
  for (let j = 0; j < KS.length - 1; j++) if (tot[j + 1] >= target) { const d = tot[j + 1] - tot[j]; return { k: KS[j] + (d > 0 ? ((target - tot[j]) / d) * (KS[1] - KS[0]) : 0), capped: false }; }
  return { k: KS[KS.length - 1], capped: true };
}

/** Predictors per glacier key: grid (x1 implied factor, x2 region-relative SWE) from Q20 (CH) or SNOWGRID (AT); terrain for all. */
export function predictors(d) {
  const byKey = new Map(); for (const it of d.items) { if (!byKey.has(it.rec.key)) byKey.set(it.rec.key, []); byKey.get(it.rec.key).push(it); }
  const out = new Map(), inv = [];
  for (const [key, list] of byKey) {
    const rec0 = list[0].rec, country = rec0.country;
    const grid = country === 'CH' ? d.q20.glaciers[key] : d.sg.glaciers[key];
    const ter = d.terrain[rec0.catId];
    const g = { key, country, name: rec0.name, catId: rec0.catId, nWinters: list.length, gridSource: country === 'CH' ? 'Q20' : 'SNOWGRID', how: grid?.how ?? 'none', nCells: grid?.nCells ?? 0 };
    const lk = [], lr = []; let capped = 0, dropped = 0;
    for (const it of list) {
      const w = grid?.winters?.[it.rec.year];
      if (!w || w.swe0 == null || w.swe1 == null) continue;
      const dS = w.swe1 - w.swe0, dR = (w.regSwe1 ?? NaN) - (w.regSwe0 ?? NaN);
      if (!(dS > 0)) { dropped++; continue; }
      const k = kFor(it.tot, dS); if (k.capped) capped++;
      lk.push(Math.log(k.k)); if (dR > 0) lr.push(Math.log(dS / dR));
    }
    g.gridWinters = lk.length; g.gridCapped = capped; g.gridDropped = dropped;
    g.x1 = lk.length >= GM10.minGridWinters ? mean(lk) : null;
    g.x2 = lr.length >= GM10.minGridWinters ? mean(lr) : null;
    if (ter) Object.assign(g, { zMed: ter.zMed, zRange: ter.zRange, lnArea: Math.log(ter.areaKm2), slope: ter.slope, north: ter.north, tpi1k: ter.tpi1k, aval: ter.aval });
    out.set(key, g); inv.push(g);
  }
  return { byKey, pred: out, inv };
}

// ---- fitting on the scored measure ------------------------------------------------------------------------------------------------------
const clampK = (F) => Math.min(GM10.kHi, Math.max(GM10.kLo, F));
/** mean |T(F̂) − BW| over rows {it, g}; theta = [c_CH, c_AT, β…]; x(g) = centred predictor vector. */
function lossOf(rows, theta, nb) {
  let s = 0;
  for (const r of rows) { let l = r.country === 'AT' ? theta[1] : theta[0]; for (let j = 0; j < nb; j++) l += theta[2 + j] * r.x[j]; s += Math.abs(tabVal(r.it.tot, clampK(Math.exp(l))) - r.it.BW); }
  return s / rows.length;
}
function nelderMead(f, x0, step, iters) {
  const n = x0.length; let P = [x0.slice()]; for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; P.push(p); }
  let V = P.map(f);
  for (let it = 0; it < iters; it++) {
    const o = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); P = o.map((i) => P[i]); V = o.map((i) => V[i]);
    if (Math.abs(V[n] - V[0]) < 1e-9 * (1 + Math.abs(V[0]))) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const at = (t) => c.map((v, j) => v + t * (P[n][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < V[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
    else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
    else { const xc = at(0.5), fc = f(xc); if (fc < V[n]) { P[n] = xc; V[n] = fc; } else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); } } }
  }
  const i = V.indexOf(Math.min(...V)); return { x: P[i], v: V[i] };
}
/** Fit theta on training rows; two restarts from the found point (NM on a non-smooth loss). */
function fitTheta(rows, nb, cStart) {
  const f = (t) => lossOf(rows, t, nb);
  let best = nelderMead(f, [cStart.CH, cStart.AT, ...new Array(nb).fill(0)], [0.1, 0.1, ...new Array(nb).fill(0.2)], GM10.nmIter);
  for (let r = 0; r < 2; r++) { const b = nelderMead(f, best.x, [0.05, 0.05, ...new Array(nb).fill(0.1)], GM10.nmIter); if (b.v <= best.v) best = b; }
  return best.x;
}

/**
 * Leave-one-glacier-out for one form. `glaciers` = scored keys with all predictors of the form; `xOf(key)` = raw predictor vector.
 * Centring and scaling (by the training sd) inside each fold. Returns per glacier the predicted factor and the factor of a' (country
 * constant fitted on the same measure, same training set).
 */
const TH0 = new Map();   // the country constant a′ does not depend on the predictor: once per training set (cleared when BW changes)
export function lgo(d, P, glaciers, xOf, { countries }) {
  const nb = xOf(glaciers[0]).length, res = new Map();
  for (const g of glaciers) {
    const train = glaciers.filter((k) => k !== g && countries.includes(P.pred.get(k).country));
    const X = train.map(xOf), mu = [], sc = [];
    for (let j = 0; j < nb; j++) { const col = X.map((x) => x[j]); mu.push(mean(col)); sc.push(sd(col) || 1); }
    const z = (x) => x.map((v, j) => (v - mu[j]) / sc[j]);
    const rows = train.flatMap((k) => P.byKey.get(k).map((it) => ({ it, country: P.pred.get(k).country, x: z(xOf(k)) })));
    const cS = { CH: Math.log(1.8), AT: Math.log(2.4) };
    const th = nb ? fitTheta(rows, nb, cS) : null;
    const memoKey = train.join(','); if (!TH0.has(memoKey)) TH0.set(memoKey, fitTheta(rows, 0, cS));
    const th0 = TH0.get(memoKey);
    const c = P.pred.get(g).country === 'AT' ? 1 : 0;
    let l = (th ?? th0)[c]; if (th) { const zg = z(xOf(g)); for (let j = 0; j < nb; j++) l += th[2 + j] * zg[j]; }
    res.set(g, { F: clampK(Math.exp(l)), F0: clampK(Math.exp(th0[c])), beta: th ? th.slice(2).map(r3) : [] });
  }
  return res;
}

/** s2 of every winter of the glacier with a flat multiplier: on the table (fast) or exactly with the core. */
const s2Tab = (it, F) => Math.abs(tabVal(it.tot, F) - it.BW);
const s2Exact = (d, it, F) => scoreOf(it.rec, d.ETI, it.rec.b.map(() => F));

function bootGain(perG, keys, seed) {
  const r = rng(seed), gains = [];
  for (let i = 0; i < GM10.boot; i++) { let a = 0, b = 0, n = 0; for (let j = 0; j < keys.length; j++) { const p = perG.get(keys[Math.floor(r() * keys.length)]); a += p.m; b += p.a; n += p.n; } gains.push(1 - a / b); }
  return { p10: r3(quant(gains, 0.1)), p90: r3(quant(gains, 0.9)) };
}
/** Mean table-s2 of a prediction map over all winters of the glaciers. */
function tabScore(P, keys, pmap, field = 'F') { const v = []; for (const k of keys) for (const it of P.byKey.get(k)) v.push(s2Tab(it, pmap.get(k)[field])); return mean(v); }
function shuffled(keys, P, seed) {
  // permutation of predictor rows WITHIN each country
  const r = rng(seed), map = new Map();
  for (const c of ['CH', 'AT']) { const ks = keys.filter((k) => P.pred.get(k).country === c), sh = ks.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } ks.forEach((k, i) => map.set(k, sh[i])); }
  return map;
}

/** One candidate form: LGO, exact scores, baselines, bootstrap, single shuffle, permutation distribution. */
export function runForm(d, P, form, { permutations = GM10.perms, exact = true } = {}) {
  const keys = form.keys, xOf = form.xOf, countries = form.countries;
  const pm = lgo(d, P, keys, xOf, { countries });
  const v1 = new Map(d.report.perWinter.map((r) => [`${r.key}|${r.year}`, r]));
  const rows = [];
  for (const k of keys) for (const it of P.byKey.get(k)) {
    const p = pm.get(k), w = v1.get(`${k}|${it.rec.year}`);
    const sM = exact ? s2Exact(d, it, p.F).s2 : s2Tab(it, p.F), sA1 = exact ? s2Exact(d, it, p.F0).s2 : s2Tab(it, p.F0);
    rows.push({ key: k, country: P.pred.get(k).country, year: it.rec.year, m: sM, a1: sA1, a: w ? Math.abs(w.V0[1]) : null, b: w ? Math.abs(w.V1[1]) : null });
  }
  const sum = (c) => { const R = c ? rows.filter((r) => r.country === c) : rows; if (!R.length) return null;
    const m = mean(R.map((r) => r.m)), a1 = mean(R.map((r) => r.a1)), a = mean(R.map((r) => r.a)), b = mean(R.map((r) => r.b));
    const ks = [...new Set(R.map((r) => r.key))]; const perG = new Map(ks.map((k) => [k, { m: 0, a: 0, n: 0 }]));
    for (const r of R) { const p = perG.get(r.key); p.m += r.m; p.a += r.a1; p.n++; }
    return { glaciers: ks.length, winters: R.length, model: r1(m), aPrime: r1(a1), a: r1(a), b: r1(b), gainVsAPrime: r3(1 - m / a1), gainVsA: r3(1 - m / a), gapClosed: r3((a - m) / (a - b)), boot: bootGain(perG, ks, GM10.seed) };
  };
  // error spread of the predicted factor against the own factor of GM-5b (all winters, report table)
  const spread = (c) => { const ks = keys.filter((k) => !c || P.pred.get(k).country === c); const e = [], e0 = [];
    for (const k of ks) { const t = d.report.table[k]; if (!t || t.atBound || t.Fown >= CAL2.kMax - 1e-3 || t.Fown <= CAL2.kMin + 1e-3) continue; e.push(Math.log(pm.get(k).F / t.Fown)); e0.push(Math.log(pm.get(k).F0 / t.Fown)); }
    return { n: e.length, sdLn: r3(sd(e)), p10: r3(quant(e, 0.1)), p90: r3(quant(e, 0.9)), sdLnCountry: r3(sd(e0)) }; };
  // negative control: one shuffle (seed 42) scored like the model, and the permutation distribution of the table gain
  const sh = shuffled(keys, P, GM10.seed), shX = (k) => xOf(sh.get(k));
  const pmS = lgo(d, P, keys, shX, { countries });
  const negRows = keys.flatMap((k) => P.byKey.get(k).map((it) => ({ country: P.pred.get(k).country, v: exact ? s2Exact(d, it, pmS.get(k).F).s2 : s2Tab(it, pmS.get(k).F) })));
  const obsTab = (c) => { const ks = keys.filter((k) => !c || P.pred.get(k).country === c); return 1 - tabScore(P, ks, pm, 'F') / tabScore(P, ks, pm, 'F0'); };
  const perm = { all: [], CH: [], AT: [] };
  for (let i = 0; i < permutations; i++) {
    const s = shuffled(keys, P, 1000 + i), q = lgo(d, P, keys, (k) => xOf(s.get(k)), { countries });
    for (const c of ['all', 'CH', 'AT']) { const ks = keys.filter((k) => c === 'all' || P.pred.get(k).country === c); if (ks.length) perm[c].push(1 - tabScore(P, ks, q, 'F') / tabScore(P, ks, q, 'F0')); }
  }
  const pOf = (c) => { const o = obsTab(c === 'all' ? null : c), a = perm[c]; return a.length ? { obsTab: r3(o), p: r3((1 + a.filter((v) => v >= o).length) / (1 + a.length)), q95: r3(quant(a, 0.95)) } : null; };
  const out = { form: form.name, predictors: form.predictors, countries };
  for (const c of [null, 'CH', 'AT']) {
    const s = sum(c); if (!s) continue; const tag = c ?? 'all';
    const negM = mean(negRows.filter((r) => !c || r.country === c).map((r) => r.v));
    out[tag] = { ...s, negative: { model: r1(negM), gainVsAPrime: r3(1 - negM / s.aPrime) }, perm: permutations ? pOf(tag) : null, spread: spread(c) };
  }
  out.perGlacier = keys.map((k) => ({ key: k, country: P.pred.get(k).country, F: r3(pm.get(k).F), F0: r3(pm.get(k).F0), Fown: d.report.table[k]?.Fown ?? null, beta: pm.get(k).beta }));
  return out;
}

/** Verdict of one primary form (rule §6): per country with ≥ minGlaciersVerdict glaciers, and overall. */
export function verdictOf(res, tag) {
  const s = res[tag]; if (!s) return { verdict: 'keine Daten' };
  if (s.glaciers < GM10.minGlaciersVerdict) return { verdict: 'nicht entscheidbar', why: `${s.glaciers} Gletscher < ${GM10.minGlaciersVerdict}` };
  const c1 = s.gainVsAPrime >= GM10.gainMin, c2 = s.boot.p10 > GM10.bootP10, c3 = s.perm && s.perm.p <= GM10.permP, c4 = s.gainVsA > 0;
  return { verdict: c1 && c2 && c3 && c4 ? 'trägt' : 'trägt nicht', gain: c1, bootP10: c2, permutation: c3, beatsA: c4 };
}

/** The candidate forms of the rule (§4). */
export function forms(P, scoredKeys) {
  const has = (k, f) => f.every((n) => P.pred.get(k)[n] != null);
  const mk = (name, predictors, countries, primaryFor = []) => {
    const keys = scoredKeys.filter((k) => countries.includes(P.pred.get(k).country) && has(k, predictors));
    return { name, predictors, countries, primaryFor, keys, xOf: (k) => predictors.map((n) => P.pred.get(k)[n]) };
  };
  return [
    mk('G1-CH', ['x1'], ['CH'], ['CH']), mk('G1-AT', ['x1'], ['AT'], ['AT']), mk('G2-CH', ['x2'], ['CH']), mk('G2-AT', ['x2'], ['AT']),
    mk('T3', ['zMed', 'north', 'lnArea'], ['CH', 'AT'], ['terrain']), mk('T2w', ['tpi1k', 'aval'], ['CH', 'AT']),
  ];
}
export const EXPLORE = ['x1', 'x2', 'zMed', 'zRange', 'lnArea', 'slope', 'north', 'tpi1k', 'aval'];

// ---- modes -------------------------------------------------------------------------------------------------------------------------------
async function main() {
  const mode = arg('mode');
  const d = loadAll({ cache: arg('cache'), truth: arg('truth'), gm10: arg('gm10'), reportPath: arg('report') });
  const P = predictors(d);
  const scored = Object.keys(d.report.table).sort();   // the 43 glaciers of GM-5b
  if (mode === 'inventory') {
    console.log(JSON.stringify(P.inv.map((g) => ({ ...g, scored5b: scored.includes(g.key), x1: r3(g.x1), x2: r3(g.x2) })), null, 0).replaceAll('},{', '},\n{'));
    return;
  }
  if (mode === 'synthetic') {
    // known factors from the real CH grid predictor; synthetic winter balances through the real tables; nothing of the truth is read but its geometry
    const out = {};
    for (const [tag, beta] of [['recover', 0.3], ['null', 0]]) {
      const r = rng(7), keys = scored.filter((k) => P.pred.get(k).country === 'CH' && P.pred.get(k).x1 != null);
      const xs = keys.map((k) => P.pred.get(k).x1), m = mean(xs), s = sd(xs);
      const Ftrue = new Map(keys.map((k) => [k, 1.8 * Math.exp(beta * (P.pred.get(k).x1 - m) / s)]));
      const saved = new Map(); TH0.clear();
      for (const k of keys) for (const it of P.byKey.get(k)) { saved.set(it, it.BW); const eps = 0.2 * Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); it.BW = tabVal(it.tot, clampK(Ftrue.get(k) * Math.exp(eps))); }
      const res = runForm(d, P, { name: `syn-${tag}`, predictors: ['x1'], countries: ['CH'], keys, xOf: (k) => [P.pred.get(k).x1] }, { permutations: 100, exact: false });
      for (const [it, v] of saved) it.BW = v;
      TH0.clear();
      const rec = res.perGlacier.map((g) => Math.log(g.F / Ftrue.get(g.key)));
      out[tag] = { betaTrue: beta, betaPerSdFound: r3(mean(res.perGlacier.map((g) => g.beta[0]))), lnErrSd: r3(sd(rec)), lnErrSdCountry: r3(sd(res.perGlacier.map((g) => Math.log(g.F0 / Ftrue.get(g.key))))),
        model: res.all.model, aPrime: res.all.aPrime, gain: res.all.gainVsAPrime, boot: res.all.boot, perm: res.all.perm, negative: res.all.negative, verdict: verdictOf({ all: { ...res.all, gainVsA: 1 } }, 'all').verdict };
    }
    console.log(JSON.stringify(out, null, 1));
    return;
  }
  if (mode === 'score') {
    const frozen = arg('frozen'), sha = createHash('sha256').update(readFileSync(frozen)).digest('hex');
    if (sha !== readFileSync(frozen.replace(/\.md$/, '.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
    const tool = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
    // reproduction of the two baselines of GM-5b on its 43 glaciers (a: V0, b: V1) from the report rows
    const repro = { V0: r1(mean(d.report.perWinter.map((r) => Math.abs(r.V0[1])))), V1: r1(mean(d.report.perWinter.map((r) => Math.abs(r.V1[1])))), expected: { V0: d.report.summary.V0.all.s2, V1: d.report.summary.V1.all.s2 } };
    const results = {};
    for (const f of forms(P, scored)) { log(`Form ${f.name}: ${f.keys.length} Gletscher`); results[f.name] = runForm(d, P, f); }
    const explore = {};
    for (const n of EXPLORE) {
      const grid = n === 'x1' || n === 'x2';
      for (const cs of grid ? [['CH'], ['AT']] : [['CH', 'AT']]) {
        const keys = scored.filter((k) => cs.includes(P.pred.get(k).country) && P.pred.get(k)[n] != null); if (keys.length < 6) continue;
        log(`einzeln ${n} ${cs.join('+')}`);
        const r = runForm(d, P, { name: `${n}-${cs.join('+')}`, predictors: [n], countries: cs, keys, xOf: (k) => [P.pred.get(k)[n]] }, { permutations: GM10.perms, exact: true });
        explore[r.form] = { all: r.all, CH: r.CH ?? null, AT: r.AT ?? null };
      }
    }
    const verdicts = {
      CH: { form: 'G1-CH', ...verdictOf(results['G1-CH'], 'CH') }, AT: { form: 'G1-AT', ...verdictOf(results['G1-AT'], 'AT') },
      terrain: { form: 'T3', all: verdictOf(results.T3, 'all'), CH: verdictOf(results.T3, 'CH'), AT: verdictOf(results.T3, 'AT') },
    };
    // overall grid verdict: CH and AT predictions of their primary forms pooled
    const pool = (fa, fb) => { const A = results[fa], B = results[fb]; const w = (x) => x.winters;
      const m = (A.CH.model * w(A.CH) + B.AT.model * w(B.AT)) / (w(A.CH) + w(B.AT)), a1 = (A.CH.aPrime * w(A.CH) + B.AT.aPrime * w(B.AT)) / (w(A.CH) + w(B.AT));
      const a = (A.CH.a * w(A.CH) + B.AT.a * w(B.AT)) / (w(A.CH) + w(B.AT)), b = (A.CH.b * w(A.CH) + B.AT.b * w(B.AT)) / (w(A.CH) + w(B.AT));
      return { glaciers: A.CH.glaciers + B.AT.glaciers, winters: w(A.CH) + w(B.AT), model: r1(m), aPrime: r1(a1), a: r1(a), b: r1(b), gainVsAPrime: r3(1 - m / a1), gainVsA: r3(1 - m / a), gapClosed: r3((a - m) / (a - b)) }; };
    verdicts.overallGrid = { ...pool('G1-CH', 'G1-AT'), rule: 'Gewinn ≥ 10 % gegen a′ und alle Länderurteile mit eigener Entscheidung tragen' };
    const decided = [verdicts.CH, verdicts.AT].filter((v) => v.verdict !== 'nicht entscheidbar');
    verdicts.overallGrid.verdict = decided.length && decided.every((v) => v.verdict === 'trägt') && verdicts.overallGrid.gainVsAPrime >= GM10.gainMin ? 'trägt' : 'trägt nicht';
    const report = { kind: 'gm10/report', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm10-method-frozen.md', sha256: sha }, tool: { file: 'audit/gletscher-schneemodell/gm10-factor.mjs', sha256: tool },
      rule: GM10, melt: d.ETI, repro, inventory: P.inv.map((g) => ({ ...g, x1: r3(g.x1), x2: r3(g.x2), scored5b: scored.includes(g.key) })), results, explore, verdicts };
    writeFileSync(arg('out'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ repro, verdicts, summary: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { all: v.all, CH: v.CH, AT: v.AT }])) }, null, 1));
    return;
  }
  throw new Error('--mode=inventory|synthetic|score');
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
