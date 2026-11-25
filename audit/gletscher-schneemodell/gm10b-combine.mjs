#!/usr/bin/env node
/**
 * Phase GM-10, step 0b — does grid + terrain beat the grid alone? (measurement only)
 * Rule: audit/gletscher-schneemodell/gm10b-method-frozen.md (the mode `score` only runs when its sha256 matches gm10b-method-frozen.sha256).
 *
 *   node audit/gletscher-schneemodell/gm10b-combine.mjs --mode=synthetic|score --cache=<gm3> --truth=<gy.json> --gm10=<gm10 dir with q20-glaciers.json,
 *        snowgrid/at-glaciers.json, terrain.json> --report=<gm3/report-fit2.json> --step0=<gm10/report.json> [--frozen=<gm10b-method-frozen.md>] [--out=<json>]
 *
 * Data, truth, melt core, constants, predictors, the fit on the scored measure and the leave-one-glacier-out are those of step 0, imported unchanged from
 * gm10-factor.mjs. New here: the candidates C1 (x1 + zMed) and C2 (x1 + zMed + north + lnArea), the comparison against G1 alone, the negative control with
 * ONLY the added terrain predictors shuffled (x1 stays with its glacier), and the cautious Austrian variant (E-GM-42). Nothing is written except `--out`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rng } from '../../scripts/glacier/lib/meltcore.mjs';
import { tabVal, scoreOf } from '../../scripts/glacier/snowcal-fit2.mjs';
import { loadAll, predictors, lgo, GM10 } from './gm10-factor.mjs';

// ---- rule constants (mirrored in gm10b-method-frozen.md) ------------------------------------------------------------------------------------
export const GM10B = Object.freeze({
  margin: 0.05,          // a combination must beat G1 by ≥ 5 % of the G1 error (and C2 must beat C1 by the same 5 % of the G1 error)
  perms: 200, boot: 1000, seed: 42, permSeed0: 1000, minGlaciersVerdict: GM10.minGlaciersVerdict,
  cautiousWeight: 0.5,   // E-GM-42: ln F = 0.5 · ln F̂ + 0.5 · ln F_country, then clamped to [min, max] of the own factors of the training glaciers
});
export const TERRAIN = { C1: ['zMed'], C2: ['zMed', 'north', 'lnArea'] };
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

const s2Tab = (it, F) => Math.abs(tabVal(it.tot, F) - it.BW);
const s2Exact = (d, it, F) => scoreOf(it.rec, d.ETI, it.rec.b.map(() => F)).s2;

/** Permutation of whole terrain rows within one country (the keys all belong to one country here). */
function shuffleMap(keys, seed) {
  const r = rng(seed), sh = keys.slice();
  for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
  return new Map(keys.map((k, i) => [k, sh[i]]));
}
/** x of a candidate: x1 of the glacier itself, terrain of `terrainOf(k)` (= k, or the glacier the shuffle assigned). */
const xOfC = (P, names, terrainOf = (k) => k) => (k) => [P.pred.get(k).x1, ...names.map((n) => P.pred.get(terrainOf(k))[n])];
const xOfG1 = (P) => (k) => [P.pred.get(k).x1];

/** Per-winter score of a prediction map; exact with the core or on the table. */
function rowsOf(d, P, keys, pm, field, exact) {
  const out = [];
  for (const k of keys) for (const it of P.byKey.get(k)) out.push({ key: k, year: it.rec.year, v: exact ? s2Exact(d, it, pm.get(k)[field]) : s2Tab(it, pm.get(k)[field]) });
  return out;
}
const perGlacierMean = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.key)) m.set(r.key, []); m.get(r.key).push(r.v); } return new Map([...m].map(([k, v]) => [k, { sum: v.reduce((s, x) => s + x, 0), n: v.length, mean: mean(v) }])); };

/** Bootstrap over glaciers of the gain of A against B (both per-winter rows over the same glaciers). */
function bootGain(rowsA, rowsB, keys, seed) {
  const A = perGlacierMean(rowsA), B = perGlacierMean(rowsB), r = rng(seed), g = [];
  for (let i = 0; i < GM10B.boot; i++) { let a = 0, b = 0; for (let j = 0; j < keys.length; j++) { const k = keys[Math.floor(r() * keys.length)]; a += A.get(k).sum; b += B.get(k).sum; } g.push(1 - a / b); }
  return { p10: r3(quant(g, 0.1)), p50: r3(quant(g, 0.5)), p90: r3(quant(g, 0.9)) };
}
/** Count glaciers better / worse / equal (|Δ| < 0.05 mm) of A against B by their mean error over their winters. */
function betterWorse(rowsA, rowsB) {
  const A = perGlacierMean(rowsA), B = perGlacierMean(rowsB); let better = 0, worse = 0, equal = 0;
  for (const [k, a] of A) { const dlt = a.mean - B.get(k).mean; if (Math.abs(dlt) < 0.05) equal++; else if (dlt < 0) better++; else worse++; }
  return { better, worse, equal };
}

/**
 * One candidate in one country against G1 alone: LGO (step-0 fit), exact scores, single terrain shuffle (seed 42), permutation distribution of the
 * table gain against G1 (terrain shuffled, x1 fixed), bootstrap of the gain against G1.
 */
export function runCandidate(d, P, { name, keys, terrain, g1, permutations = GM10B.perms, exact = true }) {
  const countries = [P.pred.get(keys[0]).country];
  const pm = lgo(d, P, keys, xOfC(P, terrain), { countries });
  const rows = rowsOf(d, P, keys, pm, 'F', exact);
  const m = mean(rows.map((r) => r.v)), mG1 = mean(g1.rows.map((r) => r.v));
  const sh = shuffleMap(keys, GM10B.seed), pmS = lgo(d, P, keys, xOfC(P, terrain, (k) => sh.get(k)), { countries });
  const negRows = rowsOf(d, P, keys, pmS, 'F', exact), neg = mean(negRows.map((r) => r.v));
  // permutation distribution on the table (as step 0): gain of the shuffled candidate against G1 on the table
  const g1Tab = mean(rowsOf(d, P, keys, g1.pm, 'F', false).map((r) => r.v));
  const obsTab = 1 - mean(rowsOf(d, P, keys, pm, 'F', false).map((r) => r.v)) / g1Tab;
  const perm = [];
  for (let i = 0; i < permutations; i++) {
    const s = shuffleMap(keys, GM10B.permSeed0 + i), q = lgo(d, P, keys, xOfC(P, terrain, (k) => s.get(k)), { countries });
    perm.push(1 - mean(rowsOf(d, P, keys, q, 'F', false).map((r) => r.v)) / g1Tab);
  }
  const p = permutations ? (1 + perm.filter((v) => v >= obsTab).length) / (1 + perm.length) : null;
  return {
    name, terrain, country: countries[0], glaciers: keys.length, winters: rows.length, pm, rows,
    model: r1(m), g1: r1(mG1), gainVsG1: r3(1 - m / mG1),
    negative: { seed: GM10B.seed, model: r1(neg), gainVsG1: r3(1 - neg / mG1) },
    perm: permutations ? { obsTab: r3(obsTab), p: r3(p), q50: r3(quant(perm, 0.5)), q95: r3(quant(perm, 0.95)), n: perm.length } : null,
    boot: bootGain(rows, g1.rows, keys, GM10B.seed), vsG1: betterWorse(rows, g1.rows),
    beta: { median: [0, 1, 2, 3].slice(0, 1 + terrain.length).map((j) => r3(quant(keys.map((k) => pm.get(k).beta[j]), 0.5))), p10: [0, 1, 2, 3].slice(0, 1 + terrain.length).map((j) => r3(quant(keys.map((k) => pm.get(k).beta[j]), 0.1))), p90: [0, 1, 2, 3].slice(0, 1 + terrain.length).map((j) => r3(quant(keys.map((k) => pm.get(k).beta[j]), 0.9))) },
  };
}

/** Verdict of one candidate (rule §5): all four conditions. */
export function carries(c) {
  if (c.glaciers < GM10B.minGlaciersVerdict) return { verdict: 'nicht entscheidbar', why: `${c.glaciers} Gletscher < ${GM10B.minGlaciersVerdict}` };
  const k1 = c.gainVsG1 >= GM10B.margin, k2 = c.negative.gainVsG1 < GM10B.margin, k3 = c.perm != null && c.perm.p <= GM10.permP, k4 = c.boot.p10 > 0;
  return { verdict: k1 && k2 && k3 && k4 ? 'trägt' : 'trägt nicht', gain: k1, negativeControl: k2, permutation: k3, bootP10: k4 };
}
/** Choice between C1 and C2 (rule §5): the simpler one wins unless C2 beats C1 by the margin (5 % of the G1 error). */
export function choose(c1, c2) {
  const v1 = carries(c1).verdict === 'trägt', v2 = carries(c2).verdict === 'trägt';
  if (!v1 && !v2) return { form: 'G1', why: 'keine Kombination trägt' };
  if (v1 && !v2) return { form: 'C1', why: 'nur C1 trägt' };
  if (!v1 && v2) return { form: 'C2', why: 'nur C2 trägt' };
  const lead = c1.model - c2.model, need = GM10B.margin * c1.g1;
  return lead >= need ? { form: 'C2', why: `C2 schlägt C1 um ${r1(lead)} mm ≥ ${r1(need)} mm` } : { form: 'C1', why: `beide tragen; C2 schlägt C1 nur um ${r1(lead)} mm < ${r1(need)} mm` };
}

/** G1 alone in one country: LGO and rows (the reference, step-0 fit). */
function runG1(d, P, keys, exact = true) {
  const countries = [P.pred.get(keys[0]).country];
  const pm = lgo(d, P, keys, xOfG1(P), { countries });
  return { pm, rows: rowsOf(d, P, keys, pm, 'F', exact), rowsA1: rowsOf(d, P, keys, pm, 'F0', exact) };
}

/** E-GM-42 cautious variant of a prediction map: halfway to the country value in ln, then clamped to the own factors of the training glaciers. */
function cautious(d, keys, pm) {
  const out = new Map();
  for (const g of keys) {
    const own = keys.filter((k) => k !== g).map((k) => d.report.table[k].Fown), lo = Math.min(...own), hi = Math.max(...own);
    const p = pm.get(g), F = Math.exp(GM10B.cautiousWeight * Math.log(p.F) + (1 - GM10B.cautiousWeight) * Math.log(p.F0));
    out.set(g, { F: Math.min(hi, Math.max(lo, F)), F0: p.F0, Fraw: F, lo, hi, clamped: F < lo || F > hi });
  }
  return out;
}

// ---- modes -------------------------------------------------------------------------------------------------------------------------------
async function main() {
  const mode = arg('mode');
  const d = loadAll({ cache: arg('cache'), truth: arg('truth'), gm10: arg('gm10'), reportPath: arg('report') });
  const P = predictors(d);
  const scored = Object.keys(d.report.table).sort();
  const keysOf = (c) => scored.filter((k) => P.pred.get(k).country === c && P.pred.get(k).x1 != null);
  const CH = keysOf('CH'), AT = keysOf('AT');
  for (const k of [...CH, ...AT]) for (const n of TERRAIN.C2) if (P.pred.get(k)[n] == null) throw new Error(`${k}: ${n} fehlt`);
  log(`CH ${CH.length}, AT ${AT.length} Gletscher mit x1 und Gelände`);

  if (mode === 'synthetic') {
    // known factors from the real CH predictors; synthetic winter balances through the real tables; nothing of the truth is read but its geometry
    const z = (n) => { const v = CH.map((k) => P.pred.get(k)[n]), m = mean(v), s = sd(v); return (k) => (P.pred.get(k)[n] - m) / s; };
    const zx = z('x1'), zz = z('zMed');
    const cases = { combined: (k) => 0.25 * zx(k) + 0.2 * zz(k), gridOnly: (k) => 0.25 * zx(k) };
    const out = {};
    for (const [tag, f] of Object.entries(cases)) {
      const r = rng(7), saved = new Map();
      for (const k of CH) for (const it of P.byKey.get(k)) { saved.set(it, it.BW); const eps = 0.2 * Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); it.BW = tabVal(it.tot, Math.min(GM10.kHi, Math.max(GM10.kLo, 1.8 * Math.exp(f(k) + eps)))); }
      const g1 = runG1(d, P, CH, false);
      out[tag] = {};
      for (const c of ['C1', 'C2']) {
        log(`synthetisch ${tag} ${c}`);
        const res = runCandidate(d, P, { name: c, keys: CH, terrain: TERRAIN[c], g1, permutations: 100, exact: false });
        out[tag][c] = { model: res.model, g1: res.g1, gainVsG1: res.gainVsG1, negative: res.negative, perm: res.perm, boot: res.boot, vsG1: res.vsG1, beta: res.beta, verdict: carries(res) };
        out[tag][`_${c}`] = res;
      }
      out[tag].choice = choose(out[tag]._C1, out[tag]._C2); delete out[tag]._C1; delete out[tag]._C2;
      for (const [it, v] of saved) it.BW = v;
    }
    console.log(JSON.stringify(out, null, 1));
    if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ kind: 'gm10b/synthetic', generated: new Date().toISOString(), cases: { combined: '1.8·exp(0.25·z(x1) + 0.20·z(zMed) + ε)', gridOnly: '1.8·exp(0.25·z(x1) + ε)' }, eps: 'N(0; 0.2) per winter, seed 7', out }, null, 1));
    return;
  }

  if (mode === 'score') {
    const frozen = arg('frozen'), sha = createHash('sha256').update(readFileSync(frozen)).digest('hex');
    if (sha !== readFileSync(frozen.replace(/\.md$/, '.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
    const tool = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
    const step0 = JSON.parse(readFileSync(arg('step0'), 'utf8'));
    const v5 = new Map(d.report.perWinter.map((r) => [`${r.key}|${r.year}`, r]));
    const out = { kind: 'gm10b/report', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm10b-method-frozen.md', sha256: sha },
      tool: { file: 'audit/gletscher-schneemodell/gm10b-combine.mjs', sha256: tool }, gm10: arg('gm10'), rule: GM10B, countries: {} };
    for (const [c, keys] of [['CH', CH], ['AT', AT]]) {
      log(`${c}: G1`);
      const g1 = runG1(d, P, keys);
      const base = (sel) => mean(keys.flatMap((k) => P.byKey.get(k).map((it) => sel(v5.get(`${k}|${it.rec.year}`)))));
      const a = base((w) => Math.abs(w.V0[1])), b = base((w) => Math.abs(w.V1[1])), a1 = mean(g1.rowsA1.map((r) => r.v)), mG1 = mean(g1.rows.map((r) => r.v));
      // T3 as in step 0 (its LGO factors from the step-0 report, recomputed exactly on THESE glaciers)
      const t3F = new Map(step0.results.T3.perGlacier.map((g) => [g.key, { F: g.F }]));
      const t3Rows = rowsOf(d, P, keys, t3F, 'F', true), t3 = mean(t3Rows.map((r) => r.v));
      const C = {};
      for (const name of ['C1', 'C2']) { log(`${c}: ${name}`); C[name] = runCandidate(d, P, { name, keys, terrain: TERRAIN[name], g1 }); }
      const summ = (m) => ({ model: r1(m), gainVsG1: r3(1 - m / mG1), gainVsAPrime: r3(1 - m / a1), gainVsA: r3(1 - m / a), gapClosed: r3((a - m) / (a - b)), gapClosedFromG1: r3((mG1 - m) / (mG1 - b)) });
      const res = {
        glaciers: keys.length, winters: g1.rows.length,
        reference: { a: r1(a), aPrime: r1(a1), b: r1(b), G1: summ(mG1), T3: { ...summ(t3), vsG1: betterWorse(t3Rows, g1.rows) }, step0: { G1: step0.results[`G1-${c}`]?.[c]?.model ?? null, T3: step0.results.T3?.[c]?.model ?? null } },
        candidates: Object.fromEntries(Object.entries(C).map(([n, r]) => [n, { ...summ(mean(r.rows.map((x) => x.v))), negative: r.negative, perm: r.perm, boot: r.boot, vsG1: r.vsG1, beta: r.beta, verdict: c === 'CH' ? carries(r) : { verdict: 'berichtet, nicht gewertet' } }])),
      };
      if (c === 'CH') res.choice = choose(C.C1, C.C2);
      // cautious variant (E-GM-42) for every form of this country; reported against the country value
      res.cautious = {};
      for (const [n, pm] of [['G1', g1.pm], ['C1', C.C1.pm], ['C2', C.C2.pm]]) {
        const cm = cautious(d, keys, pm), rows = rowsOf(d, P, keys, cm, 'F', true), m = mean(rows.map((r) => r.v));
        const A1 = perGlacierMean(g1.rowsA1), M = perGlacierMean(rows), Full = perGlacierMean(n === 'G1' ? g1.rows : C[n].rows);
        res.cautious[n] = { ...summ(m), vsAPrime: betterWorse(rows, g1.rowsA1), clamped: [...cm.values()].filter((x) => x.clamped).length,
          perGlacier: keys.map((k) => ({ key: k, Fpred: r3(pm.get(k).F), Fcountry: r3(pm.get(k).F0), Fcautious: r3(cm.get(k).F), range: [r3(cm.get(k).lo), r3(cm.get(k).hi)], Fown: d.report.table[k].Fown,
            winters: M.get(k).n, s2Country: r1(A1.get(k).mean), s2Full: r1(Full.get(k).mean), s2Cautious: r1(M.get(k).mean) })) };
      }
      res.perGlacier = keys.map((k) => ({ key: k, Fown: d.report.table[k].Fown, G1: r3(g1.pm.get(k).F), C1: r3(C.C1.pm.get(k).F), C2: r3(C.C2.pm.get(k).F), F0: r3(g1.pm.get(k).F0),
        s2: Object.fromEntries([['G1', g1.rows], ['C1', C.C1.rows], ['C2', C.C2.rows], ['aPrime', g1.rowsA1]].map(([n, R]) => [n, r1(perGlacierMean(R).get(k).mean)])) }));
      out.countries[c] = res;
    }
    out.verdict = { CH: out.countries.CH.choice, C1: out.countries.CH.candidates.C1.verdict, C2: out.countries.CH.candidates.C2.verdict, AT: 'berichtet, nicht gewertet' };
    writeFileSync(arg('out'), JSON.stringify(out, null, 1));
    const strip = (r) => ({ ...r, perGlacier: undefined, cautious: Object.fromEntries(Object.entries(r.cautious).map(([n, v]) => [n, { ...v, perGlacier: undefined }])) });
    console.log(JSON.stringify({ method: out.method, tool: out.tool, verdict: out.verdict, CH: strip(out.countries.CH), AT: strip(out.countries.AT) }, null, 1));
    return;
  }
  throw new Error('--mode=synthetic|score');
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
