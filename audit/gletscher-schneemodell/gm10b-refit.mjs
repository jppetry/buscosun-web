#!/usr/bin/env node
/**
 * Phase GM-10b, step 2 — does the verdict of the frozen size rule hold with x1 from the BUILD hypsometry (Q20 v1.1, fixed window 1 Oct … 1 May)?
 * Rule: audit/gletscher-schneemodell/gm10b-size-method-frozen.md, unchanged (the tool stops when its sha256 does not match). The ONLY difference to the
 * size measurement: x1 of the 32 Swiss calibration glaciers comes from `snowcal-predict.mjs --mode=x1` (build hypsometry, fixed window) instead of the
 * GLAMOS steps and truth windows. Truth, scored measure, terrain, cells, fits, permutations, conditions and the choice: imported unchanged.
 *
 *   node audit/gletscher-schneemodell/gm10b-refit.mjs --cache=<gm3> --truth=<gy.json> --gm10=<gm10 dir> --report=<gm3/report-fit2.json>
 *        --cells=<gm10/cells-ch.json> --x1=<gm10/predict/forcing/x1-ch.json> --frozen=<gm10b-size-method-frozen.md> --out=<json, local only>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadAll, predictors, lgo } from './gm10-factor.mjs';
import { runCandidate, carries } from './gm10b-combine.mjs';
import { SIZE, chooseVariant } from './gm10b-size.mjs';
import { scoreOf } from '../../scripts/glacier/snowcal-fit2.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };

const frozen = arg('frozen'), sha = createHash('sha256').update(readFileSync(frozen)).digest('hex');
if (sha !== readFileSync(frozen.replace(/\.md$/, '.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
const d = loadAll({ cache: arg('cache'), truth: arg('truth'), gm10: arg('gm10'), reportPath: arg('report') });
const P = predictors(d), cells = JSON.parse(readFileSync(arg('cells'), 'utf8')), X1 = JSON.parse(readFileSync(arg('x1'), 'utf8')).glaciers;
const classOf = (nIn) => SIZE.classes.find((c) => nIn >= c.lo && nIn <= c.hi).id;
const scored = Object.keys(d.report.table).sort();
const CH = scored.filter((k) => P.pred.get(k).country === 'CH' && P.pred.get(k).x1 != null);   // the 32 of the size measurement (step-0 x1 decides membership)
const x1Step0 = new Map(CH.map((k) => [k, P.pred.get(k).x1]));
for (const k of CH) {
  const g = P.pred.get(k), c = cells.glaciers[g.catId], b = X1[g.catId]?.x1;
  if (c?.nIn == null || b == null) throw new Error(`${k}: Zellen oder x1 des Builds fehlen`);
  g.nIn = c.nIn; g.lnCells = Math.log(1 + c.nIn); g.sizeClass = classOf(c.nIn); g.x1 = b;
}
log(`CH ${CH.length}; x1 des Builds eingesetzt`);
const v5 = new Map(d.report.perWinter.map((r) => [`${r.key}|${r.year}`, r]));
const rowsOf = (pm, field) => CH.flatMap((k) => P.byKey.get(k).map((it) => ({ key: k, v: scoreOf(it.rec, d.ETI, it.rec.b.map(() => pm.get(k)[field])).s2 })));
log('G1');
const pmG1 = lgo(d, P, CH, (k) => [P.pred.get(k).x1], { countries: ['CH'] });
const g1 = { pm: pmG1, rows: rowsOf(pmG1, 'F') }, g1Err = mean(g1.rows.map((r) => r.v)), aPrime = rowsOf(pmG1, 'F0');
const res = {};
for (const v of Object.keys(SIZE.variants)) { log(`Variante ${v}`); res[v] = runCandidate(d, P, { name: v, keys: CH, terrain: SIZE.variants[v], g1 }); }
const choice = chooseVariant(res, g1Err);
const aRows = CH.flatMap((k) => P.byKey.get(k).map((it) => ({ key: k, v: Math.abs(v5.get(`${k}|${it.rec.year}`).V0[1]) })));
const bRows = CH.flatMap((k) => P.byKey.get(k).map((it) => ({ key: k, v: Math.abs(v5.get(`${k}|${it.rec.year}`).V1[1]) })));
const all = { a: aRows, aPrime, G1: g1.rows, A: res.A.rows, B: res.B.rows, C: res.C.rows, b: bRows };
const cls = Object.fromEntries(SIZE.classes.map((c) => { const ks = new Set(CH.filter((k) => P.pred.get(k).sizeClass === c.id)); return [c.id, { glaciers: ks.size, ...Object.fromEntries(Object.entries(all).map(([f, R]) => [f, r1(mean(R.filter((r) => ks.has(r.key)).map((r) => r.v)))])) }]; }));
const xs = CH.map((k) => x1Step0.get(k)), xb = CH.map((k) => P.pred.get(k).x1);
const out = {
  kind: 'gm10b/refit', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm10b-size-method-frozen.md', sha256: sha },
  tool: { file: 'audit/gletscher-schneemodell/gm10b-refit.mjs', sha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') },
  x1: { file: arg('x1'), sha256: createHash('sha256').update(readFileSync(arg('x1'))).digest('hex'), corrWithStep0: r3(corr(xs, xb)), meanDiff: r3(mean(xb.map((v, i) => v - xs[i]))), maxAbsDiff: r3(Math.max(...xb.map((v, i) => Math.abs(v - xs[i])))) },
  glaciers: CH.length, winters: g1.rows.length,
  reference: Object.fromEntries(['a', 'aPrime', 'G1', 'b'].map((f) => [f, r1(mean(all[f].map((r) => r.v)))])),
  variants: Object.fromEntries(Object.entries(res).map(([v, x]) => [v, { model: x.model, gainVsG1: x.gainVsG1, negative: x.negative, perm: x.perm, boot: x.boot, vsG1: x.vsG1, beta: x.beta, verdict: carries(x) }])),
  choice, classes: cls,
  perGlacier: CH.map((k) => ({ key: k, name: P.pred.get(k).name, x1Step0: r3(x1Step0.get(k)), x1Build: r3(P.pred.get(k).x1), F: { G1: r3(pmG1.get(k).F), C: r3(res.C.pm.get(k).F) } })),
};
writeFileSync(arg('out'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, perGlacier: undefined }, null, 1));
