#!/usr/bin/env node
/**
 * Phase GM-10b, E-GM-44 point 3 — descriptive table per size class before the build. ONE new scored variant: C shrunk halfway to the country value.
 *
 *   node audit/gletscher-schneemodell/gm10b-shrunk.mjs --cache=<gm3> --truth=<gm3/truth/gy.json> --gm10=<gm10 dir> --report=<gm3/report-fit2.json>
 *        --cells=<gm10/cells-ch.json> --size=<gm10/report-size.json> --out=<json, local only>
 *
 * Data, truth, melt core, predictors, leave-one-glacier-out fit: step 0 (gm10-factor.mjs), unchanged. C = x1 + zMed + north as in the size measurement
 * (gm10b-size.mjs); its leave-one-out run is repeated here and must reproduce the class errors of report-size.json, otherwise the tool stops.
 * Shrunk C (E-GM-44): ln F = 0.5 · ln F̂_C + 0.5 · ln F_country, with F_country = a′ of the same leave-one-out pass (the country constant fitted on the
 * training glaciers only, as the cautious variant of E-GM-42), then clamped to [min, max] of the own factors of the training glaciers that are not at the
 * search bound (as §7 of the size rule). Error s2 exact with the core. Without Mont Collon: his rows are left out of the class means, the fits are not
 * redone (as the sensitivity of the size measurement). Per-glacier values only in `--out` (local, GLAMOS licence open). Nothing else is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { scoreOf, CAL2 } from '../../scripts/glacier/snowcal-fit2.mjs';
import { loadAll, predictors, lgo } from './gm10-factor.mjs';
import { SIZE } from './gm10b-size.mjs';

const W = 0.5;
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const atBound = (F) => F <= CAL2.kMin + 1e-3 || F >= CAL2.kMax - 1e-3;
const classOf = (nIn) => SIZE.classes.find((c) => nIn >= c.lo && nIn <= c.hi).id;

const d = loadAll({ cache: arg('cache'), truth: arg('truth'), gm10: arg('gm10'), reportPath: arg('report') });
const P = predictors(d), cells = JSON.parse(readFileSync(arg('cells'), 'utf8')), size = JSON.parse(readFileSync(arg('size'), 'utf8'));
for (const g of P.pred.values()) if (g.country === 'CH') { const c = cells.glaciers[g.catId]; if (c?.nIn != null) { g.nIn = c.nIn; g.sizeClass = classOf(c.nIn); } }
const CH = Object.keys(d.report.table).sort().filter((k) => P.pred.get(k).country === 'CH' && P.pred.get(k).x1 != null);
if (CH.length !== size.glaciers) throw new Error(`CH ${CH.length} ≠ ${size.glaciers}`);

const s2 = (it, F) => scoreOf(it.rec, d.ETI, it.rec.b.map(() => F)).s2;
const v5 = new Map(d.report.perWinter.map((r) => [`${r.key}|${r.year}`, r]));
log('Durchgänge G1 und C (ein Gletscher ausgelassen)');
const pmG1 = lgo(d, P, CH, (k) => [P.pred.get(k).x1], { countries: ['CH'] });
const pmC = lgo(d, P, CH, (k) => [P.pred.get(k).x1, ...SIZE.variants.C.map((n) => P.pred.get(k)[n])], { countries: ['CH'] });

const Fs = new Map();
for (const g of CH) {
  const own = CH.filter((k) => k !== g).map((k) => d.report.table[k].Fown).filter((F) => !atBound(F)), lo = Math.min(...own), hi = Math.max(...own);
  const p = pmC.get(g), F = Math.exp(W * Math.log(p.F) + (1 - W) * Math.log(p.F0)), Fc = Math.min(hi, Math.max(lo, F));
  Fs.set(g, { F: Fc, raw: F, lo, hi, clamped: Fc !== F });
}
log('Wertung exakt');
const rows = [];
for (const k of CH) for (const it of P.byKey.get(k)) {
  const w = v5.get(`${k}|${it.rec.year}`);
  rows.push({ key: k, a: Math.abs(w.V0[1]), aPrime: s2(it, pmG1.get(k).F0), G1: s2(it, pmG1.get(k).F), C: s2(it, pmC.get(k).F), Cs: s2(it, Fs.get(k).F), b: Math.abs(w.V1[1]) });
}
const FORMS = ['a', 'aPrime', 'G1', 'C', 'Cs', 'b'];
const bound = CH.filter((k) => atBound(d.report.table[k].Fown));
const table = (keep) => Object.fromEntries([...SIZE.classes.map((c) => [c.id, c]), ['all', { id: 'all', label: 'alle' }]].map(([id, c]) => {
  const R = rows.filter((r) => keep(r.key) && (id === 'all' || P.pred.get(r.key).sizeClass === id));
  return [id, { label: c.label, glaciers: new Set(R.map((r) => r.key)).size, winters: R.length, ...Object.fromEntries(FORMS.map((f) => [f, r1(mean(R.map((r) => r[f])))])) }];
}));
const withMC = table(() => true), withoutMC = table((k) => !bound.includes(k));

// reproduction check against the size report (same fits, same exact score)
for (const id of ['K1', 'K2', 'K3']) for (const [f, g] of [['aPrime', 'aPrime'], ['G1', 'G1'], ['C', 'C'], ['b', 'b']]) {
  if (Math.abs(withMC[id][f] - size.classes[id][g]) > 0.05) throw new Error(`Wiedergabe ${id} ${f}: ${withMC[id][f]} ≠ ${size.classes[id][g]}`);
  if (Math.abs(withoutMC[id][f] - size.sensitivity.classes[id][g]) > 0.05) throw new Error(`Wiedergabe ohne MC ${id} ${f}`);
}
const perG = CH.map((k) => ({ key: k, name: P.pred.get(k).name, nIn: P.pred.get(k).nIn, cls: P.pred.get(k).sizeClass, Fown: d.report.table[k].Fown,
  F: { aPrime: r3(pmG1.get(k).F0), G1: r3(pmG1.get(k).F), C: r3(pmC.get(k).F), Cs: r3(Fs.get(k).F), CsRaw: r3(Fs.get(k).raw) }, clamped: Fs.get(k).clamped,
  s2: Object.fromEntries(FORMS.map((f) => [f, r1(mean(rows.filter((r) => r.key === k).map((r) => r[f])))])) }));
const out = { kind: 'gm10b/shrunk-table', decision: 'E-GM-44 point 3', generated: new Date().toISOString(), weight: W, towards: 'a′ of the same pass',
  clamp: 'own factors of the training glaciers, not at the search bound', boundGlaciers: bound.map((k) => P.pred.get(k).name),
  reproduced: 'a′, G1, C, b per class equal to report-size.json (±0.05 mm), with and without Mont Collon',
  withMontCollon: withMC, withoutMontCollon: withoutMC, clampedCount: [...Fs.values()].filter((x) => x.clamped).length, perGlacier: perG };
writeFileSync(arg('out'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, perGlacier: undefined }, null, 1));
