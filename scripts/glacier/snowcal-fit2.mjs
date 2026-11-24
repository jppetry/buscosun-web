#!/usr/bin/env node
/**
 * Phase GM, GM-5b — second calibration round (audit/gletscher-schneemodell/gm5b-method-frozen.md; E-GM-9, E-GM-10, E-GM-11, E-GM-31):
 * precipitation factor per glacier (shrunk to the country value) and a persistent shape per elevation step, with the winter melt of the
 * OPERATION (`simulate`, model `eti`, TF / SRF of `melt-calibration.json`) and measured station radiation.
 *
 *   node scripts/glacier/snowcal-fit2.mjs --truth=<gy.json> --cache=<dir> --frozen=<gm5b-method-frozen.md> --out=<report.json>
 *
 * Everything that carries a verdict is computed here, with one winter left out for every prediction; every reported error is recomputed with
 * `simulate` at the multipliers found (the table over k only serves the search). No file of the repo is written except `--out`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, emptyState, cosZenith, clearSky, rng } from './lib/meltcore.mjs';
import { loadWinters } from './snowcal-fit.mjs';

export const CAL2 = Object.freeze({
  kMin: 0.3, kMax: 5, kStep: 0.02, minWinters: 4, n0Grid: Object.freeze([0, 1, 2, 4, 8]), tie: 0.005, shapeFloor: 0.2,
  gUnknown: 0.55, boot: 1000, seed: 42, shapeStepM: 50,
  k5: 0.03, k6: 0.2, k7: 0.1, k8: 350, ddf: 0.165, gMissSubset: 0.02,
});
const NK = Math.round((CAL2.kMax - CAL2.kMin) / CAL2.kStep) + 1;
export const KS = Float64Array.from({ length: NK }, (_, j) => Math.round((CAL2.kMin + j * CAL2.kStep) * 100) / 100);
const hourMs = 3_600_000;
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

/** Radiation of every winter at the glacier (§1): the station's measurement with the clear-sky elevation gain, an hour without one = clear sky × 0.55. */
export function attachRadiation(winters, radOf, fromMs) {
  for (const rec of winters) {
    const R = radOf(rec.station.id), n = rec.t.length, i0 = Math.round((Date.parse(`${rec.t0}T00:00:00Z`) - fromMs) / hourMs);
    const scale = (1 + 6e-5 * rec.zMed) / (1 + 6e-5 * R.height);
    const g = new Float64Array(n), gc = new Float64Array(n); let miss = 0;
    for (let i = 0; i < n; i++) {
      gc[i] = clearSky(cosZenith(rec.lat, rec.lon, fromMs + (i0 + i + 0.5) * hourMs), rec.zMed) * CAL2.gUnknown;
      const v = R.g[i0 + i];
      if (v == null || !Number.isFinite(v)) { miss++; g[i] = gc[i]; } else g[i] = v * scale;
    }
    rec.g = g; rec.gClear = gc; rec.gMiss = miss / n;
  }
  return winters;
}

/** The melt of a variant: `{ model: 'eti' | 'ddf', TF, SRF, ddf, clear }` (`clear` = radiation everywhere clear sky × 0.55). */
const simArgs = (rec, m) => ({ ela: rec.zMed, t: rec.t, g: m.clear ? rec.gClear : rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, TF: m.TF, SRF: m.SRF, ddf: m.ddf ?? null, model: m.model, pGrad: 0 });
/** Balance of every step of a winter with ONE multiplier (one call of the operation's core, the steps as its bands). */
export function balAll(rec, m, k) {
  return simulate({ ...simArgs(rec, m), bands: { zb: rec.b.map((x) => x.z), w: rec.b.map((x) => x.w) }, pf: k, state: emptyState(rec.b.length) }).bal;
}
/** Balance of ONE step with its own multiplier. */
export function balOne(rec, m, b, k) {
  return simulate({ ...simArgs(rec, m), bands: { zb: [rec.b[b].z], w: [1] }, pf: k, state: emptyState(1) }).bal[0];
}
/** Table of the balance over the grid of k, per step. */
export function tableOf(rec, m) {
  const tab = rec.b.map(() => new Float64Array(NK));
  for (let j = 0; j < NK; j++) { const bal = balAll(rec, m, KS[j]); for (let b = 0; b < tab.length; b++) tab[b][j] = bal[b]; }
  return tab;
}
export function tabVal(row, k) {
  const x = (Math.min(CAL2.kMax, Math.max(CAL2.kMin, k)) - CAL2.kMin) / CAL2.kStep, j = Math.min(NK - 2, Math.floor(x));
  return row[j] + (row[j + 1] - row[j]) * (x - j);
}
/** The multiplier that reproduces the measured balance of a step (§3): first crossing on the table, capped at the bounds. `{ k, capped }`. */
export function kStar(row, bw) {
  if (bw <= row[0]) return { k: CAL2.kMin, capped: true };
  for (let j = 0; j < NK - 1; j++) if (row[j + 1] >= bw) { const d = row[j + 1] - row[j]; return { k: KS[j] + (d > 0 ? ((bw - row[j]) / d) * CAL2.kStep : 0), capped: false }; }
  return { k: CAL2.kMax, capped: true };
}
const lossOf = (items, F) => { let s = 0; for (const it of items) for (let b = 0; b < it.tab.length; b++) { const e = tabVal(it.tab[b], F) - it.rec.b[b].bw; s += it.rec.b[b].w * e * e; } return s; };
/** The one multiplier with the smallest step loss over a set of winters: every grid point, then golden section between its neighbours. */
export function fitF(items) {
  if (!items.length) return null;
  let best = 0, bv = Infinity;
  for (let j = 0; j < NK; j++) { const v = lossOf(items, KS[j]); if (v < bv) { bv = v; best = j; } }
  let lo = KS[Math.max(0, best - 1)], hi = KS[Math.min(NK - 1, best + 1)];
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = lossOf(items, c), fd = lossOf(items, d);
  for (let i = 0; i < 40; i++) { if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = lossOf(items, c); } else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = lossOf(items, d); } }
  return (lo + hi) / 2;
}
/** Shape of one winter: r(b) = k*_b / mean k* − 1 on its own steps (§3). */
export function shapeOfWinter(it) {
  const ks = it.tab.map((row, b) => kStar(row, it.rec.b[b].bw));
  const kbar = ks.reduce((s, x, b) => s + it.rec.b[b].w * x.k, 0);
  return { z: it.rec.b.map((x) => x.z), r: ks.map((x) => x.k / kbar - 1), capped: ks.filter((x) => x.capped).length };
}
/** A winter's shape at elevation `z`: linear between its step mids, outside them the nearest step. `u` = true: on the normalised elevation instead. */
export function shapeAt(sh, z) {
  const n = sh.z.length;
  if (z <= sh.z[0]) return sh.r[0];
  if (z >= sh.z[n - 1]) return sh.r[n - 1];
  let i = 0; while (sh.z[i + 1] < z) i++;
  return sh.r[i] + ((sh.r[i + 1] - sh.r[i]) * (z - sh.z[i])) / (sh.z[i + 1] - sh.z[i]);
}
const norm = (sh) => { const a = sh.z[0], b = sh.z[sh.z.length - 1], d = b - a; return { z: sh.z.map((z) => (d > 0 ? (z - a) / d : 0.5)), r: sh.r }; };
/** Multipliers of the steps from shapes of other winters: mean, area-weighted mean-free on the target's steps, shrunk by `m`, never below the floor. */
export function shapeFactors(rec, shapes, m, normalised = false) {
  if (!shapes.length) return rec.b.map(() => 1);
  const a = rec.b[0].z, d = rec.b[rec.b.length - 1].z - a;
  const s = rec.b.map((x) => mean(shapes.map((sh) => (normalised ? shapeAt(norm(sh), d > 0 ? (x.z - a) / d : 0.5) : shapeAt(sh, x.z)))));
  const bar = s.reduce((t, v, b) => t + rec.b[b].w * v, 0);
  return s.map((v) => Math.max(CAL2.shapeFloor, 1 + m * (v - bar)));
}
/** s1 … s4 of a winter for the multipliers `kb` (one per step), recomputed with the core. */
export function scoreOf(rec, m, kb) {
  const same = kb.every((k) => k === kb[0]);
  const bal = same ? balAll(rec, m, kb[0]) : kb.map((k, b) => balOne(rec, m, b, k));
  let s1 = 0, s3 = 0; const e = rec.b.map((x, b) => bal[b] - x.bw);
  rec.b.forEach((x, b) => { s1 += x.w * Math.abs(e[b]); s3 += x.w * e[b]; });
  let s4 = 0; rec.b.forEach((x, b) => { s4 += x.w * Math.abs(e[b] - s3); });
  return { s1, s2: Math.abs(s3), s3, s4 };
}
const agg = (rows) => ({ n: rows.length, s1: r1(mean(rows.map((r) => r.s1))), s2: r1(mean(rows.map((r) => r.s2))), s3: r1(mean(rows.map((r) => r.s3))), s4: r1(mean(rows.map((r) => r.s4))) });
const aggBy = (rows) => ({ all: agg(rows), CH: agg(rows.filter((r) => r.country === 'CH')), AT: agg(rows.filter((r) => r.country === 'AT')) });
const shrink = (n, n0) => (n + n0 > 0 ? n / (n + n0) : 0);

/**
 * One evaluation of the round for a melt `m`: tables, estimators with one winter left out, the variants of §4.
 * `pick` = `{ n0, n0s }` fixes the two shrinkage numbers (the sensitivities); without it they are chosen by the rule of §3.
 */
export function evaluate(winters, m, pick = null, log = () => {}) {
  const items = winters.map((rec) => ({ rec, tab: tableOf(rec, m) }));
  log(`Tabellen: ${items.length} Winter`);
  const byG = new Map(); for (const it of items) { if (!byG.has(it.rec.key)) byG.set(it.rec.key, []); byG.get(it.rec.key).push(it); }
  const scored = [...byG.entries()].filter(([, l]) => l.length >= CAL2.minWinters).map(([k]) => k).sort();
  const shapes = new Map(items.map((it) => [it, shapeOfWinter(it)]));
  const FLfull = Object.fromEntries(['CH', 'AT'].map((c) => [c, fitF(items.filter((it) => it.rec.country === c))]));
  // per scored winter: country value without the glacier, own factor without the winter, the shapes of the other winters
  const cases = [];
  scored.forEach((key, gi) => {
    const list = byG.get(key), country = list[0].rec.country;
    const FL = fitF(items.filter((it) => it.rec.country === country && it.rec.key !== key));
    const foreign = byG.get(scored[(gi + 1) % scored.length]).map((it) => shapes.get(it));
    for (const it of list) {
      const others = list.filter((x) => x !== it);
      cases.push({ it, key, country, FL, Fown: fitF(others), n: others.length, sh: others.map((x) => shapes.get(x)), foreign });
    }
  });
  const rowOf = (c, kb) => ({ key: c.key, country: c.country, year: c.it.rec.year, gMiss: c.it.rec.gMiss, ...scoreOf(c.it.rec, m, kb) });
  const flat = (c, k) => c.it.rec.b.map(() => k);
  const Fhat = (c, n0) => { const w = shrink(c.n, n0); return w * c.Fown + (1 - w) * c.FL; };
  const V0 = cases.map((c) => rowOf(c, flat(c, c.FL)));
  const choose = (cands) => { const best = Math.min(...cands.map((x) => x.s1)); return cands.filter((x) => x.s1 <= best * (1 + CAL2.tie)).sort((a, b) => b.n0 - a.n0)[0].n0; };
  const v1Of = (n0) => cases.map((c) => rowOf(c, flat(c, Fhat(c, n0))));
  const v1Grid = pick ? null : CAL2.n0Grid.map((n0) => ({ n0, rows: v1Of(n0) })).map((x) => ({ n0: x.n0, s1: mean(x.rows.map((r) => r.s1)), s2: mean(x.rows.map((r) => r.s2)), rows: x.rows }));
  const n0 = pick ? pick.n0 : choose(v1Grid);
  const V1 = pick ? v1Of(n0) : v1Grid.find((x) => x.n0 === n0).rows;
  log(`n0 = ${n0}`);
  const v2Of = (n0s) => cases.map((c) => { const F = Fhat(c, n0), cf = shapeFactors(c.it.rec, c.sh, shrink(c.n, n0s)); return rowOf(c, cf.map((x) => F * x)); });
  const v2Grid = pick ? null : CAL2.n0Grid.map((n0s) => ({ n0: n0s, rows: v2Of(n0s) })).map((x) => ({ n0: x.n0, s1: mean(x.rows.map((r) => r.s1)), s4: mean(x.rows.map((r) => r.s4)), rows: x.rows }));
  const n0s = pick ? pick.n0s : choose(v2Grid);
  const V2 = pick ? v2Of(n0s) : v2Grid.find((x) => x.n0 === n0s).rows;
  log(`n0s = ${n0s}`);
  const V3 = cases.map((c) => { const cf = shapeFactors(c.it.rec, c.sh, shrink(c.n, n0s)); return rowOf(c, cf.map((x) => c.FL * x)); });
  const N = cases.map((c) => { const F = Fhat(c, n0), cf = shapeFactors(c.it.rec, c.foreign, shrink(c.n, n0s), true); return rowOf(c, cf.map((x) => F * x)); });
  // bootstrap over glaciers: relative gain of A against B on one metric
  const boot = (A, B, key) => {
    const per = new Map(scored.map((k) => [k, { a: 0, b: 0 }]));
    A.forEach((r, i) => { const p = per.get(r.key); p.a += r[key]; p.b += B[i][key]; });
    const r = rng(CAL2.seed), gains = [];
    for (let i = 0; i < CAL2.boot; i++) { let a = 0, b = 0; for (let j = 0; j < scored.length; j++) { const p = per.get(scored[Math.floor(r() * scored.length)]); a += p.a; b += p.b; } gains.push(1 - a / b); }
    return { gain: r3(1 - mean(A.map((x) => x[key])) / mean(B.map((x) => x[key]))), p10: r3(quant(gains, 0.1)), p90: r3(quant(gains, 0.9)) };
  };
  return {
    items, byG, scored, shapes, cases, FLfull, n0, n0s,
    rows: { V0, V1, V2, V3, N },
    summary: {
      glaciers: scored.length, winters: cases.length, countryFull: { CH: r3(FLfull.CH), AT: r3(FLfull.AT) }, n0, n0s,
      n0Grid: v1Grid?.map((x) => ({ n0: x.n0, s1: r1(x.s1), s2: r1(x.s2) })) ?? null, n0sGrid: v2Grid?.map((x) => ({ n0s: x.n0, s1: r1(x.s1), s4: r1(x.s4) })) ?? null,
      V0: aggBy(V0), V1: aggBy(V1), V2: aggBy(V2), V3: aggBy(V3), N: aggBy(N),
      gains: { V1vsV0_s2: boot(V1, V0, 's2'), V2vsV1_s4: boot(V2, V1, 's4'), NvsV1_s4: boot(N, V1, 's4'), V2vsV0_s1: boot(V2, V0, 's1'), V1vsV0_s1: boot(V1, V0, 's1') },
      cappedSteps: [...shapes.values()].reduce((s, x) => s + x.capped, 0), steps: items.reduce((s, it) => s + it.rec.b.length, 0),
    },
  };
}

/** The values of the table (§5): no winter left out. */
export function tableValues(ev) {
  const out = {};
  for (const key of ev.scored) {
    const list = ev.byG.get(key), rec0 = list[0].rec, n = list.length, FL = ev.FLfull[rec0.country], Fown = fitF(list), w = shrink(n, ev.n0);
    const shs = list.map((it) => ev.shapes.get(it));
    const zLo = Math.min(...list.map((it) => it.rec.b[0].z)), zHi = Math.max(...list.map((it) => it.rec.b[it.rec.b.length - 1].z));
    const z0 = Math.floor(zLo / CAL2.shapeStepM) * CAL2.shapeStepM, s = [];
    for (let z = z0; z <= zHi + 1e-9; z += CAL2.shapeStepM) s.push(r3(mean(shs.map((sh) => shapeAt(sh, z)))));
    out[key] = { catId: rec0.catId ?? null, name: rec0.name, country: rec0.country, winters: n, years: [Math.min(...list.map((it) => it.rec.year)), Math.max(...list.map((it) => it.rec.year))],
      F: r3(w * Fown + (1 - w) * FL), Fown: r3(Fown), FCountry: r3(FL), w: r3(w), shape: { z0, stepM: CAL2.shapeStepM, s, m: r3(shrink(n, ev.n0s)) } };
  }
  return out;
}

/** The verdicts of §5 from the summaries (`ddf` = the summary of the degree-day sensitivity). */
export function verdicts(sum, ddf) {
  const rel = (a, b) => 1 - a / b;
  const k5v = rel(sum.V0.all.s1, ddf.V0.all.s1);
  const k6 = sum.gains.V1vsV0_s2, k7 = sum.gains.V2vsV1_s4, kn = sum.gains.NvsV1_s4;
  const factor = k6.gain >= CAL2.k6 && k6.p10 > 0, shape = k7.gain >= CAL2.k7 && k7.p10 > 0 && kn.gain < k7.gain / 2;
  const best = shape ? sum.V2 : factor ? sum.V1 : sum.V0;
  return {
    K5: { etiS1: sum.V0.all.s1, ddfS1: ddf.V0.all.s1, gain: r3(k5v), verdict: k5v >= CAL2.k5 ? 'besser' : k5v <= -CAL2.k5 ? 'schlechter' : 'gleich' },
    K6: { ...k6, limit: CAL2.k6, carries: factor }, K7: { ...k7, negative: kn, limit: CAL2.k7, carries: shape },
    K8: { variant: shape ? 'V2' : factor ? 'V1' : 'V0', s2: best.all.s2, limit: CAL2.k8, reached: best.all.s2 <= CAL2.k8 },
  };
}

async function main() {
  const cache = arg('cache'), frozen = arg('frozen'), out = arg('out');
  const here = dirname(fileURLToPath(import.meta.url));
  const sha = createHash('sha256').update(readFileSync(frozen)).digest('hex');
  if (sha !== readFileSync(frozen.replace(/\.md$/, '.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
  const cal = JSON.parse(readFileSync(join(here, 'melt-calibration.json'), 'utf8')).fit;
  const { winters, unusable, fromMs } = loadWinters({ truthPath: arg('truth'), cache });
  const rads = new Map(), radOf = (id) => { if (!rads.has(id)) rads.set(id, JSON.parse(readFileSync(join(cache, `rad-${id}.json`), 'utf8'))); return rads.get(id); };
  attachRadiation(winters, radOf, fromMs);
  const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
  const ETI = { model: 'eti', TF: cal.TF, SRF: cal.SRF };
  log(`${winters.length} nutzbare Gletscherwinter, ${unusable.length} nicht nutzbar`);
  const main = evaluate(winters, ETI, null, log), pick = { n0: main.n0, n0s: main.n0s };
  const sens = {};
  for (const [name, m] of [['tfSrfHalf', { ...ETI, TF: cal.TF * 0.5, SRF: cal.SRF * 0.5 }], ['tfSrfOneAndHalf', { ...ETI, TF: cal.TF * 1.5, SRF: cal.SRF * 1.5 }], ['radiationClearSky', { ...ETI, clear: true }], ['degreeDay', { model: 'ddf', TF: 0, SRF: 0, ddf: CAL2.ddf }]]) {
    log(`Empfindlichkeit ${name}`);
    const e = evaluate(winters, m, pick, log);
    sens[name] = { countryFull: e.summary.countryFull, V0: e.summary.V0, V1: e.summary.V1, V2: e.summary.V2 };
  }
  const sub = (rows) => rows.filter((r) => r.gMiss <= CAL2.gMissSubset);
  sens.radiationMeasuredOnly = { note: 'dieselben Schätzer, nur die Auswertung auf den Wintern mit höchstens 2 % Stunden ohne gemessene Strahlung', V0: aggBy(sub(main.rows.V0)), V1: aggBy(sub(main.rows.V1)), V2: aggBy(sub(main.rows.V2)) };
  const report = {
    kind: 'gm5b/report', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm5b-method-frozen.md', sha256: sha }, cal: CAL2, melt: { model: 'eti', TF: cal.TF, SRF: cal.SRF, source: 'scripts/glacier/melt-calibration.json' },
    data: { usable: winters.length, unusable: unusable.length, radiationMissingShare: { over2: winters.filter((w) => w.gMiss > 0.02).length, over15: winters.filter((w) => w.gMiss > 0.15).length, over50: winters.filter((w) => w.gMiss > 0.5).length } },
    summary: main.summary, verdicts: verdicts(main.summary, sens.degreeDay), sensitivities: sens, table: tableValues(main),
    perWinter: main.rows.V0.map((r, i) => ({ key: r.key, year: r.year, country: r.country, V0: [r1(r.s1), r1(r.s3), r1(r.s4)], V1: [r1(main.rows.V1[i].s1), r1(main.rows.V1[i].s3), r1(main.rows.V1[i].s4)], V2: [r1(main.rows.V2[i].s1), r1(main.rows.V2[i].s3), r1(main.rows.V2[i].s4)] })),
  };
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ summary: report.summary, verdicts: report.verdicts, sensitivities: report.sensitivities }, null, 1));
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
