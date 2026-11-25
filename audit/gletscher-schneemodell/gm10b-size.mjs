#!/usr/bin/env node
/**
 * Phase GM-10b, size measurement before the build (POST HOC, follows V-GM-118) — is the size term of C2 a grid artefact?
 * Rule: audit/gletscher-schneemodell/gm10b-size-method-frozen.md (the mode `score` only runs when its sha256 matches gm10b-size-method-frozen.sha256).
 *
 *   node audit/gletscher-schneemodell/gm10b-size.mjs --mode=synthetic|score --cache=<gm3> --truth=<gy.json> --gm10=<gm10 dir> --report=<gm3/report-fit2.json>
 *        --cells=<gm10/cells-ch.json> [--frozen=<gm10b-size-method-frozen.md>] [--out=<json>]
 *
 * Data, truth, melt core, predictors, fit on the scored measure and leave-one-glacier-out: step 0 (gm10-factor.mjs), unchanged. Candidate scoring against
 * G1 (exact score, one terrain shuffle, 200 permutations of the added terrain only, bootstrap) and the four conditions: step 0b (gm10b-combine.mjs), unchanged.
 * New here: the variants A (= C2 as measured), B (C2 with ln(1 + cells inside the outline) instead of ln area), C (C2 without a size term), the choice rule
 * between them, the size classes, the minimum size, the protections scored descriptively, the size distribution of all Swiss target glaciers.
 * Swiss glaciers only. Nothing is written except `--out`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { rng } from '../../scripts/glacier/lib/meltcore.mjs';
import { tabVal, scoreOf, CAL2 } from '../../scripts/glacier/snowcal-fit2.mjs';
import { loadAll, predictors, lgo, GM10 } from './gm10-factor.mjs';
import { runCandidate, carries, GM10B } from './gm10b-combine.mjs';

// ---- rule constants (mirrored in gm10b-size-method-frozen.md) -------------------------------------------------------------------------------
export const SIZE = Object.freeze({
  variants: { A: ['zMed', 'north', 'lnArea'], B: ['zMed', 'north', 'lnCells'], C: ['zMed', 'north'] },
  sizeOf: { A: 'lnArea', B: 'lnCells', C: null },
  margin: GM10B.margin,                     // 5 % of the G1 error, as step 0b
  classes: [{ id: 'K1', label: 'eine Zelle (0–1 im Umriss)', lo: 0, hi: 1 }, { id: 'K2', label: '2–4 Zellen', lo: 2, hi: 4 }, { id: 'K3', label: '≥ 5 Zellen', lo: 5, hi: Infinity }],
  minClassGlaciers: 3,                      // a class decides only with at least 3 calibration glaciers
  named: ['Pizolgletscher', 'Schwarzwasserfirn', 'Glacier du Sex Rouge'],
});
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : null; };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10), r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const log = (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const atBound = (F) => F <= CAL2.kMin + 1e-3 || F >= CAL2.kMax - 1e-3;

const s2Tab = (it, F) => Math.abs(tabVal(it.tot, F) - it.BW);
const s2Exact = (d, it, F) => scoreOf(it.rec, d.ETI, it.rec.b.map(() => F)).s2;
function rowsOf(d, P, keys, pm, field, exact) {
  const out = [];
  for (const k of keys) for (const it of P.byKey.get(k)) out.push({ key: k, year: it.rec.year, v: exact ? s2Exact(d, it, pm.get(k)[field]) : s2Tab(it, pm.get(k)[field]) });
  return out;
}
const classOf = (nIn) => SIZE.classes.find((c) => nIn >= c.lo && nIn <= c.hi).id;

/** Attach the cell count of the Q20 v1.1 grid (cells-ch.json, by catalogue id) to every Swiss glacier; lnCells = ln(1 + nIn). */
function attachCells(P, cells) {
  for (const g of P.pred.values()) {
    if (g.country !== 'CH') continue;
    const c = cells.glaciers[g.catId]; if (!c || c.nIn == null) throw new Error(`${g.key}: keine Zellzahl`);
    g.nIn = c.nIn; g.lnCells = Math.log(1 + c.nIn); g.sizeClass = classOf(c.nIn);
  }
}

/**
 * Choice between the variants (rule §5). S = carrying variants. Among the size variants A and B: B, unless A beats B by the margin. Then C (no size term)
 * against that size variant: C, unless the size variant beats C by the margin. None carries ⇒ G1.
 */
export function chooseVariant(res, g1Err) {
  const m = SIZE.margin * g1Err, S = new Set(Object.keys(res).filter((v) => carries(res[v]).verdict === 'trägt'));
  if (!S.size) return { form: 'G1', why: 'keine Variante trägt' };
  let sz = null, whySz = '';
  if (S.has('A') && S.has('B')) { const lead = res.B.model - res.A.model; sz = lead >= m ? 'A' : 'B'; whySz = lead >= m ? `A schlägt B um ${r1(lead)} mm ≥ ${r1(m)} mm` : `A schlägt B nur um ${r1(lead)} mm < ${r1(m)} mm ⇒ B`; }
  else if (S.has('A')) { sz = 'A'; whySz = 'von A/B trägt nur A'; } else if (S.has('B')) { sz = 'B'; whySz = 'von A/B trägt nur B'; } else whySz = 'weder A noch B trägt';
  if (!S.has('C')) return { form: sz, why: `${whySz}; C trägt nicht` };
  if (!sz) return { form: 'C', why: `${whySz}; C trägt` };
  const lead = res.C.model - res[sz].model;
  return lead >= m ? { form: sz, why: `${whySz}; ${sz} schlägt C um ${r1(lead)} mm ≥ ${r1(m)} mm` } : { form: 'C', why: `${whySz}; ${sz} schlägt C nur um ${r1(lead)} mm < ${r1(m)} mm ⇒ C` };
}

/** Per size class: glaciers, winters and the mean error (over glacier-winters) of every form; rows = { form: per-winter rows }. */
function byClass(P, keys, rows) {
  const out = {};
  for (const c of SIZE.classes) {
    const ks = new Set(keys.filter((k) => P.pred.get(k).sizeClass === c.id)), e = { label: c.label, glaciers: ks.size };
    for (const [f, R] of Object.entries(rows)) { const v = R.filter((r) => ks.has(r.key)).map((r) => r.v); e.winters = v.length; e[f] = r1(mean(v)); }
    out[c.id] = e;
  }
  return out;
}
/**
 * Minimum size (rule §6): from the largest class downward, a class qualifies when it has ≥ minClassGlaciers calibration glaciers and the chosen variant
 * is not worse than G1 there (class mean); the minimum size is the lower bound of the smallest class of that unbroken chain. A size variant can never go
 * below its smallest calibration glacier in its own size predictor.
 */
function minimumSize(P, keys, cls, form) {
  if (form === 'G1') return { cls: null, nIn: null, why: 'G1 gewählt — keine Mindestgröße nötig' };
  let lowest = null; const trail = [];
  for (const c of [...SIZE.classes].reverse()) {
    const e = cls[c.id], ok = e.glaciers >= SIZE.minClassGlaciers && e[form] <= e.G1;
    trail.push({ cls: c.id, glaciers: e.glaciers, form: e[form], G1: e.G1, ok }); if (!ok) break; lowest = c;
  }
  const floor = SIZE.sizeOf[form] ? Math.min(...keys.map((k) => P.pred.get(k)[SIZE.sizeOf[form]])) : null;
  return { cls: lowest?.id ?? null, nIn: lowest?.lo ?? null, sizeFloor: floor == null ? null : { predictor: SIZE.sizeOf[form], min: r3(floor), area: SIZE.sizeOf[form] === 'lnArea' ? r3(Math.exp(floor)) : null },
    trail, why: lowest ? `${form} ab ${lowest.label}` : `${form} hält schon in der größten Klasse nicht ⇒ Bau mit G1` };
}

/**
 * The protections of E-GM-43 applied inside the leave-one-glacier-out (descriptive, rule §7): below the minimum size G1; a non-size predictor of the form
 * outside the range of the training glaciers ⇒ country value a′; then the factor clamped to [min, max] of the own factors of the training glaciers that
 * are not at the search bound.
 */
function protectedMap(d, P, keys, pmForm, pmG1, form, minNIn) {
  const out = new Map(), names = ['x1', ...SIZE.variants[form].filter((n) => n !== SIZE.sizeOf[form])];
  for (const g of keys) {
    const train = keys.filter((k) => k !== g), own = train.map((k) => d.report.table[k].Fown).filter((F) => !atBound(F)), lo = Math.min(...own), hi = Math.max(...own);
    const outside = names.filter((n) => { const v = train.map((k) => P.pred.get(k)[n]), x = P.pred.get(g)[n]; return x < Math.min(...v) || x > Math.max(...v); });
    const sz = SIZE.sizeOf[form], belowFloor = sz != null && P.pred.get(g)[sz] < Math.min(...train.map((k) => P.pred.get(k)[sz]));
    let F, rule;
    if (P.pred.get(g).nIn < minNIn) { F = pmG1.get(g).F; rule = 'G1 (unter der Mindestgröße)'; }
    else if (belowFloor) { F = pmG1.get(g).F; rule = 'G1 (kleiner als jeder Trainings-Gletscher)'; }
    else if (outside.length) { F = pmForm.get(g).F0; rule = `Landeswert (außerhalb: ${outside.join(', ')})`; }
    else { F = pmForm.get(g).F; rule = form; }
    const Fc = Math.min(hi, Math.max(lo, F));
    out.set(g, { F: Fc, rule, clamped: Fc !== F, outside });
  }
  return out;
}

/** Size distribution of all Swiss catalogue glaciers: calibration (scored) against targets (all without an own factor). */
function distribution(cells, P, keys, ownCatIds) {
  const all = Object.entries(cells.glaciers).map(([id, c]) => ({ id, ...c }));
  const cal = keys.map((k) => ({ id: P.pred.get(k).catId, area: Math.exp(P.pred.get(k).lnArea), nIn: P.pred.get(k).nIn, name: P.pred.get(k).name }));
  const targets = all.filter((g) => !ownCatIds.has(g.id));
  const desc = (set) => ({ n: set.length, nIn0: set.filter((g) => g.nIn === 0).length, nIn1: set.filter((g) => g.nIn === 1).length,
    ...Object.fromEntries(SIZE.classes.map((c) => [c.id, set.filter((g) => g.nIn >= c.lo && g.nIn <= c.hi).length])),
    areaKm2: Object.fromEntries([0.1, 0.25, 0.5, 0.75, 0.9].map((q) => [`q${q * 100}`, r3(quant(set.map((g) => g.area), q))])), nInMedian: quant(set.map((g) => g.nIn), 0.5) });
  const named = cal.filter((g) => SIZE.named.includes(g.name));
  const asSmall = Object.fromEntries(named.map((g) => [g.name, { area: r3(g.area), nIn: g.nIn, targetsAreaLe: targets.filter((t) => t.area <= g.area).length, targetsNInLe: targets.filter((t) => t.nIn <= g.nIn).length }]));
  const maxNamed = named.length ? Math.max(...named.map((g) => g.area)) : null;
  const calMinArea = Math.min(...cal.map((g) => g.area));
  return { calibration: desc(cal), targets: desc(targets), allSwiss: all.length, ownFactor: ownCatIds.size, asSmallAsNamed: asSmall,
    targetsAsSmallAsAnyOfThree: { areaLeLargest: targets.filter((t) => t.area <= maxNamed).length, nInLe: targets.filter((t) => t.nIn <= Math.max(...named.map((g) => g.nIn))).length },
    targetsBelowSmallestCalibrationArea: { area: r3(calMinArea), n: targets.filter((t) => t.area < calMinArea).length } };
}

// ---- modes -------------------------------------------------------------------------------------------------------------------------------
async function main() {
  const mode = arg('mode');
  const d = loadAll({ cache: arg('cache'), truth: arg('truth'), gm10: arg('gm10'), reportPath: arg('report') });
  const P = predictors(d), cells = JSON.parse(readFileSync(arg('cells'), 'utf8'));
  attachCells(P, cells);
  const scored = Object.keys(d.report.table).sort();
  const CH = scored.filter((k) => P.pred.get(k).country === 'CH' && P.pred.get(k).x1 != null);
  for (const k of CH) for (const n of ['zMed', 'north', 'lnArea', 'lnCells']) if (P.pred.get(k)[n] == null) throw new Error(`${k}: ${n} fehlt`);
  log(`CH ${CH.length} Gletscher; Klassen ${SIZE.classes.map((c) => `${c.id} ${CH.filter((k) => P.pred.get(k).sizeClass === c.id).length}`).join(', ')}`);
  const g1Of = (exact) => { const pm = lgo(d, P, CH, (k) => [P.pred.get(k).x1], { countries: ['CH'] }); return { pm, rows: rowsOf(d, P, CH, pm, 'F', exact) }; };

  if (mode === 'synthetic') {
    const z = (n) => { const v = CH.map((k) => P.pred.get(k)[n]), m = mean(v), s = sd(v); return (k) => (P.pred.get(k)[n] - m) / s; };
    const zx = z('x1'), zz = z('zMed'), zn = z('north'), zc = z('lnCells');
    const cases = { noSize: (k) => 0.25 * zx(k) - 0.15 * zz(k) + 0.10 * zn(k), cells: (k) => 0.25 * zx(k) - 0.15 * zz(k) + 0.10 * zn(k) - 0.20 * zc(k) };
    const out = {};
    for (const [tag, f] of Object.entries(cases)) {
      const r = rng(7), saved = new Map();
      for (const k of CH) for (const it of P.byKey.get(k)) { saved.set(it, it.BW); const eps = 0.2 * Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); it.BW = tabVal(it.tot, Math.min(GM10.kHi, Math.max(GM10.kLo, 1.8 * Math.exp(f(k) + eps)))); }
      const g1 = g1Of(false), res = {};
      for (const v of Object.keys(SIZE.variants)) { log(`synthetisch ${tag} ${v}`); res[v] = runCandidate(d, P, { name: v, keys: CH, terrain: SIZE.variants[v], g1, permutations: 100, exact: false }); }
      const g1Err = mean(g1.rows.map((x) => x.v)), choice = chooseVariant(res, g1Err);
      const cls = byClass(P, CH, { G1: g1.rows, ...Object.fromEntries(Object.entries(res).map(([v, x]) => [v, x.rows])) });
      out[tag] = { g1: r1(g1Err), variants: Object.fromEntries(Object.entries(res).map(([v, x]) => [v, { model: x.model, gainVsG1: x.gainVsG1, negative: x.negative, perm: x.perm, boot: x.boot, beta: x.beta.median, verdict: carries(x) }])),
        choice, classes: cls, minimumSize: minimumSize(P, CH, cls, choice.form) };
      for (const [it, v] of saved) it.BW = v;
    }
    console.log(JSON.stringify(out, null, 1));
    if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ kind: 'gm10b/size-synthetic', generated: new Date().toISOString(),
      cases: { noSize: '1.8·exp(0.25·z(x1) − 0.15·z(zMed) + 0.10·z(north) + ε)', cells: '… − 0.20·z(ln(1 + nIn)) + ε' }, eps: 'N(0; 0.2) per winter, seed 7', out }, null, 1));
    return;
  }

  if (mode === 'score') {
    const frozen = arg('frozen'), sha = createHash('sha256').update(readFileSync(frozen)).digest('hex');
    if (sha !== readFileSync(frozen.replace(/\.md$/, '.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
    const tool = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
    const v5 = new Map(d.report.perWinter.map((r) => [`${r.key}|${r.year}`, r]));
    log('G1');
    const g1 = g1Of(true), g1Err = mean(g1.rows.map((x) => x.v)), aPrimeRows = rowsOf(d, P, CH, g1.pm, 'F0', true);
    const bRows = CH.flatMap((k) => P.byKey.get(k).map((it) => ({ key: k, year: it.rec.year, v: Math.abs(v5.get(`${k}|${it.rec.year}`).V1[1]) })));
    const aRows = CH.flatMap((k) => P.byKey.get(k).map((it) => ({ key: k, year: it.rec.year, v: Math.abs(v5.get(`${k}|${it.rec.year}`).V0[1]) })));
    const res = {};
    for (const v of Object.keys(SIZE.variants)) { log(`Variante ${v}`); res[v] = runCandidate(d, P, { name: v, keys: CH, terrain: SIZE.variants[v], g1 }); }
    const choice = chooseVariant(res, g1Err);
    const rowsAll = { aPrime: aPrimeRows, G1: g1.rows, A: res.A.rows, B: res.B.rows, C: res.C.rows, b: bRows };
    const cls = byClass(P, CH, rowsAll), minSize = minimumSize(P, CH, cls, choice.form);
    // descriptive: the chosen form with the protections inside the leave-one-glacier-out
    let prot = null;
    if (choice.form !== 'G1') {
      const pm = protectedMap(d, P, CH, res[choice.form].pm, g1.pm, choice.form, minSize.nIn ?? Infinity), rows = rowsOf(d, P, CH, pm, 'F', true), m = mean(rows.map((x) => x.v));
      prot = { form: choice.form, minNIn: minSize.nIn, model: r1(m), gainVsG1: r3(1 - m / g1Err), raw: res[choice.form].model, classes: byClass(P, CH, { G1: g1.rows, protected: rows }),
        rules: Object.entries([...pm.values()].reduce((a, x) => ((a[x.rule] = (a[x.rule] ?? 0) + 1), a), {})), clamped: [...pm.values()].filter((x) => x.clamped).length,
        perGlacier: CH.map((k) => ({ key: k, F: r3(pm.get(k).F), rule: pm.get(k).rule, clamped: pm.get(k).clamped })) };
    }
    // without the glacier at the search bound (descriptive, as in step 0b)
    const bound = CH.filter((k) => atBound(d.report.table[k].Fown)), noB = (R) => r1(mean(R.filter((r) => !bound.includes(r.key)).map((r) => r.v)));
    const sensitivity = { without: bound.map((k) => P.pred.get(k).name), ...Object.fromEntries(Object.entries(rowsAll).map(([f, R]) => [f, noB(R)])), classes: byClass(P, CH.filter((k) => !bound.includes(k)), rowsAll) };
    // spread of the prediction error ln(F̂ / F_own), glaciers not at the bound
    const spread = Object.fromEntries(['G1', 'A', 'B', 'C'].map((f) => { const pm = f === 'G1' ? g1.pm : res[f].pm; const e = CH.filter((k) => !bound.includes(k)).map((k) => Math.log(pm.get(k).F / d.report.table[k].Fown)); return [f, { n: e.length, sdLn: r3(sd(e)), p10: r3(quant(e, 0.1)), p90: r3(quant(e, 0.9)) }]; }));
    const perG = (R) => { const m = new Map(); for (const r of R) { if (!m.has(r.key)) m.set(r.key, []); m.get(r.key).push(r.v); } return m; };
    const PG = Object.fromEntries(Object.entries(rowsAll).map(([f, R]) => [f, perG(R)]));
    const perGlacier = CH.map((k) => ({ key: k, name: P.pred.get(k).name, nIn: P.pred.get(k).nIn, areaKm2: r3(Math.exp(P.pred.get(k).lnArea)), sizeClass: P.pred.get(k).sizeClass, Fown: d.report.table[k].Fown,
      F: { G1: r3(g1.pm.get(k).F), A: r3(res.A.pm.get(k).F), B: r3(res.B.pm.get(k).F), C: r3(res.C.pm.get(k).F), aPrime: r3(g1.pm.get(k).F0) },
      s2: Object.fromEntries(Object.entries(PG).map(([f, m]) => [f, r1(mean(m.get(k)))])) }));
    const named = perGlacier.filter((g) => SIZE.named.includes(g.name));
    const ownCatIds = new Set(scored.filter((k) => P.pred.get(k).country === 'CH').map((k) => P.pred.get(k).catId));
    const out = { kind: 'gm10b/size-report', posthoc: 'follows V-GM-118', generated: new Date().toISOString(), method: { file: 'audit/gletscher-schneemodell/gm10b-size-method-frozen.md', sha256: sha },
      tool: { file: 'audit/gletscher-schneemodell/gm10b-size.mjs', sha256: tool }, cells: { file: arg('cells'), sha256: createHash('sha256').update(readFileSync(arg('cells'))).digest('hex') }, rule: SIZE,
      glaciers: CH.length, winters: g1.rows.length,
      reference: { a: r1(mean(aRows.map((x) => x.v))), aPrime: r1(mean(aPrimeRows.map((x) => x.v))), G1: r1(g1Err), b: r1(mean(bRows.map((x) => x.v))) },
      variants: Object.fromEntries(Object.entries(res).map(([v, x]) => [v, { predictors: ['x1', ...SIZE.variants[v]], model: x.model, gainVsG1: x.gainVsG1, negative: x.negative, perm: x.perm, boot: x.boot, vsG1: x.vsG1, beta: x.beta, verdict: carries(x) }])),
      choice, classes: cls, minimumSize: minSize, protected: prot, sensitivity, spread, named, distribution: distribution(cells, P, CH, ownCatIds), perGlacier };
    writeFileSync(arg('out'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify({ ...out, perGlacier: undefined, protected: prot && { ...prot, perGlacier: undefined } }, null, 1));
    return;
  }
  throw new Error('--mode=synthetic|score');
}
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
