/**
 * stack-score.mjs — phase FS (`audit/fusion-stationswert.md` §2): fit and score of the station-value candidates on the rows of
 * `stack-extract.mjs`, and the verdicts by the frozen rules.
 *
 * Two streaming passes over the rows: (A) the normal equations per (mode, variable, τ group, form, valid day); (B) per row the
 * leave-day-out parameters (valid days [D − 1, D + 1] purged), every candidate, the scores and the pairs. Modes S (the point is
 * the station) and L (leave-station-out, MOSMIX and measurement of the nearest other station) are fitted and scored separately.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/stack-score.mjs
 *       --rows=<root>/score/<date>-fs/rows.jsonl.gz --out=<root>/score/<date>-fs/scorecard.json [--decision=audit/fusion-stationswert/fs-decision.md]
 */
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';
import { parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { scoreDist } from './lib/distScore.mjs';
import { ScoreAcc, PairAcc, benjaminiHochberg } from './lib/stats.mjs';
import { FoldSums, FORMS, formOf, tauGroup, tauLabel, TAU_GROUPS, stackValue, stackDist, MIN_ROWS, PURGE_DAYS } from './lib/stackFit.mjs';
import { STACK_TABLE_KIND, STACK_FIT_VERSION, validateStackTable } from '../../src/pointForecast/fusion/stationValue.ts';
import { quantileOf, meanOf } from '../../src/pointForecast/fusion/dist.ts';
import { binIndex } from '../../src/point/fusionFit/strata.ts';
import { lcg } from '../../src/point/calibFit.ts';

const flags = parseArgs(process.argv.slice(2));
if (typeof flags.rows !== 'string' || typeof flags.out !== 'string') throw new Error('--rows und --out sind Pflicht');
const decisionPath = typeof flags.decision === 'string' ? flags.decision : null;
const riceN = Number(flags.riceN) || 96;
const say = (s) => console.log(`[stack-score] ${s}`);

const MODES = ['S', 'L'];
const MKEY = { S: 'S', L: 'Lm' }, TKEY = { S: 'tS', L: 'tL' };
const FIT_VARS = ['t', 'td', 'ws', 'gust'];
const ALL_VARS = ['t', 'td', 'ws', 'gust', 'clct', 'precip'];
const VAR_IDX = { t: 0, td: 1, ws: 2, gust: 3, clct: 4, precip: 5 };
const VAR_LABEL = { t: 'T', td: 'Td', ws: 'Wind', gust: 'Böe', clct: 'Bewölkung (DE)', precip: 'Niederschlag' };
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const FITTED = ['mosmix+anker', 'mosmix+anker+bias', 'stack'];
// stack0: the station value of a query WITHOUT a measurement — the forms without w·I on every row
const STACK0 = 'stack0';
const NONNEG = new Set(['ws', 'gust']);
const pointOf = (d) => (d.kind === 'normal' ? d.mu : d.kind === 'rice' || d.kind === 'truncatedNormal' ? meanOf(d) : quantileOf(d, 0.5));
const num = (x) => (x != null && Number.isFinite(x) ? x : null);

async function* rowsOf(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) { if (!line) continue; yield JSON.parse(line); }
}
/** The fit inputs of a row, mode and variable: M, r, I, D, the group; null without MOSMIX. */
function fitInputs(row, mode, v) {
  const o = row.v[v], m = o?.[MKEY[mode]];
  const M = num(m?.M);
  if (M == null) return null;
  const I = num(m.I), tau = I != null ? row[TKEY[mode]] : null;
  const Ld = o.Lc ?? o.L;                       // the learned stage as the client computes it (rows of schema 2), else fl-K
  const Lp = Ld ? pointOf(Ld) : null;
  const D = Lp != null && Number.isFinite(Lp) ? Lp - M : null;
  // with an innovation the group is τ (hours since the measurement), without one the lead
  const g = tauGroup(I != null && tau != null ? tau : row.lead);
  // gl: the group by LEAD — the forms without the innovation term are fitted on EVERY row (a query without a measurement in time
  // must find an entry), grouped by the lead
  return { M, y: o.y, r: o.y - M, I: I != null && tau != null ? I : null, D, g, gl: tauGroup(row.lead) };
}

// ── pass A: the sums ──────────────────────────────────────────────────────────
const sums = new FoldSums(), sumsK1 = new FoldSums();
const innov = { S: new Map(), L: new Map() };     // `${id}|${d}` → { v: I } (K1: the innovation of another issue day)
let header = null, footer = null, nRows = 0;
const issueDays = new Set();
for await (const row of rowsOf(flags.rows)) {
  if (row.kind === 'fusionfit/stack-rows') { header = row; continue; }
  if (row.kind === 'fusionfit/stack-rows-end') { footer = row; continue; }
  nRows += 1; issueDays.add(row.d);
  const vd = Math.floor(row.V / 24);
  for (const mode of MODES) for (const v of FIT_VARS) {
    const f = fitInputs(row, mode, v);
    if (!f || f.g < 0) continue;
    const forms = f.I != null ? ['A', 'AB', ...(f.D != null ? ['S'] : [])] : [];
    for (const form of forms) { sums.add(`${mode}|${v}|${f.g}|${form}`, vd, FORMS[form].x(f.I, f.D), f.r); if (row.cc) sums.add(`${mode}|${v}|${f.g}|${form}|${row.cc}`, vd, FORMS[form].x(f.I, f.D), f.r); }
    // AX-5 (V-FS-5): the same sums per country (`…|DE`, `…|AT`, `…|CH` — LI is CH) for the country candidate and the country entries of the table
    if (f.gl >= 0) for (const form of ['B', ...(f.D != null ? ['S0'] : [])]) { sums.add(`${mode}|${v}|${f.gl}|${form}`, vd, FORMS[form].x(null, f.D), f.r); if (row.cc) sums.add(`${mode}|${v}|${f.gl}|${form}|${row.cc}`, vd, FORMS[form].x(null, f.D), f.r); }
    if (f.I != null) { const k = `${row.id}|${row.d}`; let e = innov[mode].get(k); if (!e) { e = {}; innov[mode].set(k, e); } e[v] = f.I; }
  }
}
const days = [...issueDays].sort((a, b) => a - b);
say(`${nRows} Zeilen, ${days.length} Ausgabetage, ${sums.byKey.size} Fit-Schlüssel`);
// K1: the same forms with the innovation of the same point from ANOTHER issue day (cyclic shift by 3 slots)
const shiftDay = (d) => days[(days.indexOf(d) + 3) % days.length];
const fitOnly = !!flags.fitOnly;   // only the fit and the table (no scores)
for await (const row of rowsOf(flags.rows)) {
  if (row.kind || fitOnly) continue;
  const vd = Math.floor(row.V / 24);
  for (const mode of MODES) for (const v of FIT_VARS) {
    const f = fitInputs(row, mode, v);
    if (!f || f.g < 0 || f.I == null) continue;
    const I2 = innov[mode].get(`${row.id}|${shiftDay(row.d)}`)?.[v];
    if (I2 == null) continue;
    sumsK1.add(`${mode}|${v}|${f.g}|AB`, vd, FORMS.AB.x(I2, f.D), f.r);
  }
}

// ── pass B: candidates, scores, pairs ─────────────────────────────────────────
const acc = new Map(), pairs = new Map();
const getOr = (m, k, mk) => { let a = m.get(k); if (!a) { a = mk(); m.set(k, a); } return a; };
const PAIRS = {
  'mosmix+anker': ['mosmix'],
  'mosmix+anker+bias': ['mosmix', 'product@5e'],
  stack: ['mosmix', 'product@5e', 'live', 'fl-K@5e', 'mosmix+anker+bias'],
  'product-noshrink': ['product@5e', 'mosmix'],
  'product@5e': ['mosmix', 'live', 'fl-K@5e'],
  'fl-K@5e': ['mosmix', 'product@5e'],
  'stack:in': ['stack'],
  stack0: ['mosmix', 'product@5e', 'stack', 'live'],
  // run 2: the engine options of step 5
  'product+fix': ['product@5e', 'mosmix', 'fl-K@5e', 'live'],
  'product+fix+noshrink': ['product+fix', 'product@5e', 'mosmix', 'fl-K@5e', 'live'],
  'product-FS': ['mosmix', 'product@5e', 'product+fix+noshrink', 'fl-K@5e', 'live', 'stack'],
  // phase AX, AX-2 (E-FV-3): the stage with route-3 strata in t2/t3 against the stage as it runs (route 1), and the references
  'product-FS-r3': ['product-FS', 'mosmix', 'live', 'fl-K@5e'],
  // phase AX, AX-5 (V-FS-5): the station value with country parameters against the pooled one and MOSMIX
  'stack-cc': ['stack', 'mosmix', 'product@5e', 'live', 'fl-K@5e'],
  // phase AX, AX-4 (E-AX-4/5): the stage with the cloud atoms against the stage without, and the references
  'product-FS+atoms': ['product-FS', 'product@5e', 'mosmix', 'fl-K@5e', 'live'],
};
const ccUsed = { cc: 0, pooled: 0 };
const k5 = {}, k6 = { n: 0, maxAbs: 0, formDiffers: 0, byVar: {} };
const pitDraw = (id, V, v) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; const g = lcg((h * 1_000_003 + V * 7919 + VAR_IDX[v] * 104_729) >>> 0); g(); return g(); };
// D1/D2 collectors
const wCol = new Map();       // `${mode}|${v}|${bin}` → { wM: [], beta: [], cSum, cN }
const slope = new Map();      // `${mode}|${v}|${bin}` → { sxy, sxx, n, betaSum }
const k3 = { n: 0, maxAbs: 0 };
const k4 = { rows: 0, sameAsPoint: 0, zeroKm: 0 };
let nullFits = 0;
for await (const row of rowsOf(flags.rows)) {
  if (row.kind || fitOnly) continue;
  const vd = Math.floor(row.V / 24), bin = binIndex(row.lead);
  if (row.B != null) { k4.rows += 1; if (row.B === row.id) k4.sameAsPoint += 1; if (!(row.km > 0)) k4.zeroKm += 1; }
  for (const mode of MODES) {
    if (mode === 'L' && row.B == null) continue;
    const strata = ['all', `country:${row.cc}`, `band:${row.band}`];
    if (mode === 'L') strata.push(`km:${row.km < 15 ? 'lt15' : row.km < 30 ? '15-30' : 'ge30'}`, `dh:${Math.abs(row.dh) < 100 ? 'lt100' : 'ge100'}`, `mem:${row.mem}`);
    else strata.push(`anc:${row.anc}`);
    for (const v of ALL_VARS) {
      const o = row.v[v], m = o?.[MKEY[mode]];
      if (!o || !m) continue;
      const y = o.y, u = pitDraw(row.id, row.V, v);
      const cands = {};
      if (m.P) cands['product@5e'] = { dist: m.P };
      if (m.N) cands['product-noshrink'] = { dist: m.N };
      if (m.P1) cands['product+fix'] = { dist: m.P1 };
      if (m.P2) cands['product+fix+noshrink'] = { dist: m.P2 };
      if (m.P3) cands['product-FS'] = { dist: m.P3 };
      if (m.P4) cands['product-FS-r3'] = { dist: m.P4 };
      if (m.P5) cands['product-FS+atoms'] = { dist: m.P5 };   // AX-4: the stage with the two-atom cloud family (tables with atoms)
      // K5: the engine without the climatological step against the offline form, on the chain of run 1
      if (mode === 'S' && m.PN && m.N) { const a = pointOf(m.PN), b = pointOf(m.N); const o5 = k5[v] ?? (k5[v] = { n: 0, maxAbs: 0, maxSigma: 0 }); o5.n += 1; o5.maxAbs = Math.max(o5.maxAbs, Math.abs(a - b)); if (m.PN.sigma != null && m.N.sigma != null) o5.maxSigma = Math.max(o5.maxSigma, Math.abs(m.PN.sigma - m.N.sigma)); }
      if (o.L) cands['fl-K@5e'] = { dist: o.L };
      if (num(m.M) != null) cands.mosmix = { value: m.M };
      if (num(o.live) != null && mode === 'S') cands.live = { value: o.live };
      if (FIT_VARS.includes(v)) {
        const f = fitInputs(row, mode, v);
        if (f && f.g >= 0) {
          for (const c of FITTED) {
            const form = formOf(c, f.I, f.D);
            if (form == null) { cands[c] = { value: f.M }; continue; }       // mosmix+anker without an innovation is MOSMIX itself
            const x = FORMS[form].x(f.I, f.D), key = `${mode}|${v}|${form === 'B' || form === 'S0' ? f.gl : f.g}|${form}`;
            const fit = sums.fit(key, vd);
            if (!fit) { nullFits += 1; continue; }
            const val = stackValue(f.M, x, fit.beta, NONNEG.has(v));
            cands[c] = { dist: stackDist(v, NONNEG.has(v) ? stackValue(f.M, x, fit.beta, false) : val, fit.sigma ?? 1), point: val };
            // K3: the null form is MOSMIX to the last digit
            const z = stackValue(f.M, x, new Array(x.length).fill(0), false); k3.n += 1; k3.maxAbs = Math.max(k3.maxAbs, Math.abs(z - f.M));
            if (c === 'stack') {
              const fin = sums.fit(key, null);
              if (fin) {
                const vi = stackValue(f.M, x, fin.beta, NONNEG.has(v)); cands['stack:in'] = { dist: stackDist(v, vi, fin.sigma ?? 1), point: vi };
                // K6: the engine's station value against the in-sample candidate, rows of the same form
                if (mode === 'S' && m.sv) { const o6 = k6.byVar[v] ?? (k6.byVar[v] = { n: 0, maxAbs: 0, formDiffers: 0 }); if (m.sv.f !== form) { o6.formDiffers += 1; k6.formDiffers += 1; } else { const d = Math.abs(m.sv.x - vi); o6.n += 1; o6.maxAbs = Math.max(o6.maxAbs, d); k6.n += 1; k6.maxAbs = Math.max(k6.maxAbs, d); } }
              }
              // D1: the leave-day-out weight of MOSMIX in the stack = 1 − c
              if (form === 'S' || form === 'S0') { const w = getOr(wCol, `${mode}|${v}|${bin}`, () => ({ wM: [], beta: [], cSum: 0, cN: 0 })); w.cSum += fit.beta[fit.beta.length - 1]; w.cN += 1; }
            }
          }
        }
      }
      // AX-5 (V-FS-5): the station value with the country's parameters where the country fit is written (≥ MIN_ROWS after the
      // purge), else the pooled ones — the candidate `stack-cc`; counted which one carried the row
      if (FIT_VARS.includes(v) && row.cc) {
        const fc = fitInputs(row, mode, v);
        if (fc && fc.g >= 0) {
          const form = formOf('stack', fc.I, fc.D);
          if (form != null) {
            const x = FORMS[form].x(fc.I, fc.D), gK = form === 'B' || form === 'S0' ? fc.gl : fc.g;
            const fitCC = sums.fit(`${mode}|${v}|${gK}|${form}|${row.cc}`, vd), fitP = sums.fit(`${mode}|${v}|${gK}|${form}`, vd);
            const use = fitCC && fitCC.written ? fitCC : fitP && fitP.written ? fitP : null;
            if (use) {
              const val = stackValue(fc.M, x, use.beta, NONNEG.has(v));
              cands['stack-cc'] = { dist: stackDist(v, NONNEG.has(v) ? stackValue(fc.M, x, use.beta, false) : val, use.sigma ?? 1), point: val };
              ccUsed[use === fitCC ? 'cc' : 'pooled'] += 1;
            }
          }
        }
      }
      if (FIT_VARS.includes(v)) {
        const f0 = fitInputs(row, mode, v);
        if (f0 && f0.gl >= 0) {
          const form = f0.D != null ? 'S0' : 'B', x = FORMS[form].x(null, f0.D), fit = sums.fit(`${mode}|${v}|${f0.gl}|${form}`, vd);
          if (fit) { const val = stackValue(f0.M, x, fit.beta, NONNEG.has(v)); cands[STACK0] = { dist: stackDist(v, NONNEG.has(v) ? stackValue(f0.M, x, fit.beta, false) : val, fit.sigma ?? 1), point: val }; }
        }
      }
      if (v !== 'precip' && m.b != null) {
        const w = getOr(wCol, `${mode}|${v}|${bin}`, () => ({ wM: [], beta: [], cSum: 0, cN: 0 }));
        w.beta.push(m.b);
        if (num(m.M) != null && m.wM != null) w.wM.push(m.wM);
        if ((v === 't' || v === 'td') && m.mu != null && m.raw != null && 1 - m.b > 0.01) {
          const mc = (m.mu - m.b * m.raw) / (1 - m.b);
          const s = getOr(slope, `${mode}|${v}|${bin}`, () => ({ sxy: 0, sxx: 0, n: 0, betaSum: 0 }));
          s.sxy += (y - mc) * (m.raw - mc); s.sxx += (m.raw - mc) ** 2; s.n += 1; s.betaSum += m.b;
        }
      }
      const scores = {}, maes = {};
      for (const [name, cd] of Object.entries(cands)) {
        let point, crps, rec = null;
        if (cd.dist) { rec = scoreDist(cd.dist, y, u, riceN); if (!rec) continue; point = cd.point ?? rec.point; crps = rec.crps; }
        else { point = cd.value; crps = Math.abs(point - y); }
        scores[name] = crps; maes[name] = Math.abs(point - y);
        for (const st of strata) getOr(acc, `${mode}|${v}|${bin}|${name}|${st}`, () => new ScoreAcc()).add(point - y, crps, rec ? rec.pit : null, rec ? rec.sigma : null, rec ? rec.sd : null);
      }
      for (const [cand, refs] of Object.entries(PAIRS)) for (const ref of refs) {
        if (scores[cand] == null || scores[ref] == null) continue;
        for (const st of strata) {
          getOr(pairs, `crps|${mode}|${v}|${bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(row.d, scores[cand], scores[ref]);
          getOr(pairs, `mae|${mode}|${v}|${bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(row.d, maes[cand], maes[ref]);
        }
      }
    }
  }
}

// ── the card ──────────────────────────────────────────────────────────────────
const quant = (xs, q) => { if (!xs.length) return null; const a = Float64Array.from(xs).sort(); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))]; };
const card = {
  schema: 1, kind: 'fusionfit/scorecard-stack', builtAt: new Date().toISOString(), codeHash: codeHash(),
  rows: { path: flags.rows, header, counts: footer?.counts ?? null, n: nRows, issueDays: days.length },
  fit: { minRows: MIN_ROWS, purgeDays: PURGE_DAYS, tauGroups: TAU_GROUPS, nullFits },
  coefficients: {}, k1: {}, weights: {}, slope: {}, scores: {}, pairs: {}, controls: { K3: k3, K4: k4, K5: k5, K6: k6 },
};
for (const key of [...sums.byKey.keys()].sort()) { const f = sums.fit(key, null); const form = key.split('|')[3]; card.coefficients[key] = { n: f.n, written: f.written, sigma: f.sigma, ...Object.fromEntries(FORMS[form].names.map((nm, i) => [nm, f.beta[i]])) }; }
for (const key of [...sumsK1.byKey.keys()].sort()) { const f = sumsK1.fit(key, null); card.k1[key] = { n: f.n, written: f.written, b: f.beta[0], w: f.beta[1] }; }
for (const [k, w] of wCol) card.weights[k] = { n: w.beta.length, wM: { n: w.wM.length, p10: quant(w.wM, 0.1), p50: quant(w.wM, 0.5), p90: quant(w.wM, 0.9) }, beta: { p10: quant(w.beta, 0.1), p50: quant(w.beta, 0.5), p90: quant(w.beta, 0.9) }, stackMosmix: w.cN ? 1 - w.cSum / w.cN : null, stackRows: w.cN };
for (const [k, s] of slope) card.slope[k] = { n: s.n, slope: s.sxx > 0 ? s.sxy / s.sxx : null, betaMean: s.n ? s.betaSum / s.n : null };
for (const [k, a] of acc) card.scores[k] = a.summary();
const pKeys = [], pVals = [];
for (const [k, a] of pairs) { const sm = a.summary(); if (!sm) continue; card.pairs[k] = sm; if (Number.isFinite(sm.dm?.p)) { pKeys.push(k); pVals.push(sm.dm.p); } }
const adj = benjaminiHochberg(pVals);
pKeys.forEach((k, i) => { card.pairs[k].dm.pAdj = adj[i]; });
card.tests = pKeys.length;
mkdirSync(dirname(flags.out), { recursive: true });
writeFileSync(flags.out, JSON.stringify(card));

// ── the table of the engine stage (`stationValue.ts`): the in-sample fit of mode S over all days, written entries only ──
if (typeof flags.table === 'string') {
  const entries = {};
  for (const [k, c] of Object.entries(card.coefficients)) {
    const [mode, v, g, form, cc] = k.split('|');
    if (mode !== 'S' || !c.written) continue;
    // AX-5: country entries (`…|DE|AT|CH`) next to the pooled ones — the engine prefers a written country entry
    entries[`${v}|${g}|${form}${cc ? `|${cc}` : ''}`] = { n: c.n, beta: FORMS[form].names.map((nm) => c[nm]), sigma: c.sigma };
  }
  const slots = header?.slots ?? [];
  const table = {
    schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: card.builtAt,
    period: { from: slots[0]?.slotAt?.slice(0, 10) ?? null, to: slots[slots.length - 1]?.slotAt?.slice(0, 10) ?? null, issueDays: days.length },
    rows: nRows,
    // the fit saw the points of the archive, which ARE stations: distance of the catalog station p50 0 / max 4,56 km, |Δh| ≤ 48 m (FV §1.4)
    range: { maxKm: 5, maxDElevM: 50 },
    tauGroups: TAU_GROUPS, entries,
    source: { rows: flags.rows, learnedTables: header?.tables ?? null, codeHash: card.codeHash, minRows: MIN_ROWS },
    notes: [
      'Phase FS (audit/fusion-stationswert.md): Stationswert M + b + w·I + c·(L − M), kleinste Quadrate auf y − M je Größe × τ-Gruppe, In-sample über alle Tage (die Karte bewertet dieselbe Form Leave-Day-out mit Sperre ±1 Gültigtag).',
      'Provenienz archive: echte Eingaben und gemessene Wahrheit, aber Tage statt Jahreszeiten — nie measured. Gilt nur für eine Station AM Punkt (range).',
    ],
  };
  const errs = validateStackTable(table);
  if (errs.length) throw new Error(`Tabelle ungültig: ${errs.join('; ')}`);
  mkdirSync(dirname(flags.table), { recursive: true });
  writeFileSync(flags.table, JSON.stringify(table));
  say(`Tabelle ${flags.table}: ${Object.keys(entries).length} Einträge`);
}
if (fitOnly) process.exit(0);

// ── verdicts by the frozen rules (§2.3–§2.6) ──────────────────────────────────
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const P = (metric, mode, v, bin, cand, ref, st = 'all') => card.pairs[`${metric}|${mode}|${v}|${bin}|${cand}|${ref}|${st}`] ?? null;
const word = (p) => (!p || p.skill == null ? null : p.dm.pAdj < 0.05 ? (p.skill > 0 ? 'better' : 'worse') : 'ns');
const cell = (p) => (p ? `${f2(100 * p.skill, 1)} %${p.dm.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''} (p ${f2(p.dm.pAdj, 3)}, ${p.days} d, n ${p.n})` : '—');
const CELLS = FIT_VARS.flatMap((v) => [0, 1, 2, 3].map((bin) => ({ v, bin })));
const lab = (c) => `${VAR_LABEL[c.v]} · ${BIN_LABEL[c.bin]}`;
const md = [`# FS — Verdikt nach den eingefrorenen Regeln (§2) — Karte ${card.builtAt.slice(0, 16)}Z`, '',
  `Zeilen ${nRows}, Ausgabetage ${days.length}, DM-Tests ${card.tests} (BH über die Karte); Fit je Größe × τ-Gruppe, Leave-Day-out mit Sperre ±${PURGE_DAYS} Gültigtag, Mindestzeilen ${MIN_ROWS}. * signifikant besser, ! signifikant schlechter. Alles indikativ (n_eff ≤ ${days.length}).`, ''];
const verdicts = {};

// D1
{
  md.push('## D1 — Gewichte der Kette gegen das Leave-Day-out-Gewicht von MOSMIX (Modus S)', '', '| Zelle | MOSMIX-Gewicht der Kette p10 / p50 / p90 | MOSMIX im stack (1 − c) | Abstand | β der Kette p10 / p50 / p90 |', '|---|---|---|---|---|');
  let below = 0, close = 0, n = 0;
  for (const v of ['t', 'ws']) for (const bin of [0, 1, 2, 3]) {
    const w = card.weights[`S|${v}|${bin}`];
    if (!w || w.wM.p50 == null || w.stackMosmix == null) { md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | — | — | — | — |`); continue; }
    const gap = w.stackMosmix - w.wM.p50; n += 1;
    if (gap >= 0.15) below += 1; if (Math.abs(gap) < 0.05) close += 1;
    md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${f2(w.wM.p10)} / ${f2(w.wM.p50)} / ${f2(w.wM.p90)} | ${f2(w.stackMosmix)} | ${f2(gap)} | ${f2(w.beta.p10)} / ${f2(w.beta.p50)} / ${f2(w.beta.p90)} |`);
  }
  verdicts.D1 = below >= 6 ? 'BESTÄTIGT' : close >= 6 ? 'WIDERLEGT' : 'TEILWEISE';
  md.push('', `Kette um ≥ 0,15 unter dem Stapel-Gewicht: ${below} von ${n} Zellen; Abstand < 0,05: ${close}. **D1 ${verdicts.D1}.**`, '');
  md.push('Weitere Größen (berichtet):', '', '| Zelle | MOSMIX-Gewicht p50 | 1 − c | β p50 |', '|---|---|---|---|');
  for (const v of ['td', 'gust', 'clct']) for (const bin of [0, 1, 2, 3]) { const w = card.weights[`S|${v}|${bin}`]; if (w) md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${f2(w.wM.p50)} | ${f2(w.stackMosmix)} | ${f2(w.beta.p50)} |`); }
  md.push('');
}
const table = (title, mode, cand, ref, metrics, cells = CELLS, extra = []) => {
  md.push(`## ${title}`, '', `| Zelle | ${metrics.map((m) => `${m.toUpperCase()} all`).join(' | ')} | ${extra.map((e) => e.label).join(' | ')}${extra.length ? ' |' : ''}`, `|---|${metrics.map(() => '---').join('|')}|${extra.map(() => '---|').join('')}`);
  for (const c of cells) md.push(`| ${lab(c)} | ${metrics.map((m) => cell(P(m, mode, c.v, c.bin, cand, ref))).join(' | ')} | ${extra.map((e) => cell(P(e.metric, mode, c.v, c.bin, cand, ref, e.st))).join(' | ')}${extra.length ? ' |' : ''}`);
  md.push('');
};
const COUNTRY = ['DE', 'AT', 'CH'].map((c) => ({ label: `MAE ${c}`, metric: 'mae', st: `country:${c}` }));
const tally = (mode, cand, ref, metric, cells = CELLS) => { const o = { better: [], worse: [], ns: [], missing: [], worse2: [] }; for (const c of cells) { const p = P(metric, mode, c.v, c.bin, cand, ref); const w = word(p); if (!w) { o.missing.push(lab(c)); continue; } o[w].push(`${lab(c)} ${cell(p)}`); if (w === 'worse' && p.skill < -0.02) o.worse2.push(lab(c)); } return o; };
const ruleH10 = (t) => (t.worse.length === 0 && t.better.length >= 8 ? 'GILT' : t.worse2.length === 0 && t.missing.length === 0 ? 'GLEICHSTAND' : 'GILT NICHT');

// D2
{
  table('D2 — product-noshrink gegen product@5e (Modus S)', 'S', 'product-noshrink', 'product@5e', ['mae', 'crps']);
  const t = tally('S', 'product-noshrink', 'product@5e', 'mae');
  verdicts.D2 = t.better.length >= 9 && t.worse.length === 0 ? 'BESTÄTIGT' : t.worse.length >= 9 ? 'WIDERLEGT' : 'TEILWEISE';
  md.push(`MAE: ${t.better.length} Zellen signifikant besser, ${t.worse.length} signifikant schlechter, ${t.ns.length} gleichauf. **D2 ${verdicts.D2}.**${t.worse.length ? ` Schlechter: ${t.worse.join('; ')}.` : ''}`, '');
  md.push('Steigung s von (y − μ_clim) auf (rawMu − μ_clim) durch den Ursprung (s ≈ 1: keine Schrumpfung gerechtfertigt; s ≈ β: die Schrumpfung ist richtig):', '', '| Zelle | n | s | mittleres β |', '|---|---|---|---|');
  for (const v of ['t', 'td']) for (const bin of [0, 1, 2, 3, 4]) { const s = card.slope[`S|${v}|${bin}`]; if (s) md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${s.n} | ${f2(s.slope, 3)} | ${f2(s.betaMean, 3)} |`); }
  md.push('');
}
// H9
{
  const cells = ['t', 'ws', 'gust'].map((v) => ({ v, bin: 0 }));
  table('H9 — mosmix+anker gegen mosmix (Modus S, MAE, Bin 0–6 h)', 'S', 'mosmix+anker', 'mosmix', ['mae'], cells, COUNTRY);
  const t = tally('S', 'mosmix+anker', 'mosmix', 'mae', cells);
  verdicts.H9 = t.better.length === 3 ? 'GILT' : 'GILT NICHT';
  md.push(`**H9 ${verdicts.H9}** — signifikant besser ${t.better.length} von 3.`, '');
  table('H9 Kontext — mosmix+anker gegen mosmix, alle Zellen', 'S', 'mosmix+anker', 'mosmix', ['mae']);
}
// H10
{
  table('H10 — stack gegen mosmix (Modus S)', 'S', 'stack', 'mosmix', ['mae', 'crps'], CELLS, COUNTRY);
  const t = tally('S', 'stack', 'mosmix', 'mae');
  verdicts.H10 = ruleH10(t);
  md.push(`MAE: ${t.better.length} signifikant besser, ${t.worse.length} signifikant schlechter (davon < −2 %: ${t.worse2.length}), ${t.ns.length} gleichauf. **H10 ${verdicts.H10}.**${t.worse.length ? ` Schlechter: ${t.worse.join('; ')}.` : ''}`, '');
  table('H10 Kontext — mosmix+anker+bias gegen mosmix (Modus S)', 'S', 'mosmix+anker+bias', 'mosmix', ['mae']);
  const tb = tally('S', 'mosmix+anker+bias', 'mosmix', 'mae');
  md.push(`mosmix+anker+bias nach derselben Regel: **${ruleH10(tb)}** (${tb.better.length} besser, ${tb.worse.length} schlechter).`, '');
}
// H11
{
  table('H11 — stack gegen product@5e (Modus S)', 'S', 'stack', 'product@5e', ['mae', 'crps'], CELLS, COUNTRY);
  const t = tally('S', 'stack', 'product@5e', 'mae');
  verdicts.H11 = t.better.length === 16 ? 'GILT' : 'GILT NICHT';
  md.push(`**H11 ${verdicts.H11}** — signifikant besser ${t.better.length} von 16.${t.better.length < 16 ? ` Nicht besser: ${[...t.ns, ...t.worse, ...t.missing].join('; ')}.` : ''}`, '');
  table('H11 Kontext — stack gegen live (Modus S, MAE)', 'S', 'stack', 'live', ['mae'], CELLS.filter((c) => c.v !== 'td'));
}
// H14
{
  const cells = [0, 1, 2, 3].map((bin) => ({ v: 'clct', bin }));
  table('H14 — Bewölkung: fl-K@5e gegen product@5e (Modus S, nur DE)', 'S', 'fl-K@5e', 'product@5e', ['crps', 'mae'], cells);
  table('H14 — Bewölkung: fl-K@5e gegen mosmix', 'S', 'fl-K@5e', 'mosmix', ['crps', 'mae'], cells);
  const n = tally('S', 'fl-K@5e', 'product@5e', 'crps', cells).better.length + tally('S', 'fl-K@5e', 'product@5e', 'mae', cells).better.length + tally('S', 'fl-K@5e', 'mosmix', 'crps', cells).better.length;
  verdicts.H14 = n === 12 ? 'GILT' : 'GILT NICHT';
  md.push(`**H14 ${verdicts.H14}** — signifikant besser in ${n} von 12 Vergleichen.`, '');
}
// H12, H13
{
  table('H12 (= H6b) — product@5e gegen MOSMIX der Nachbarstation (Modus L)', 'L', 'product@5e', 'mosmix', ['crps', 'mae'], CELLS, COUNTRY);
  let pos = 0, worse = [];
  for (const c of CELLS) { const a = P('crps', 'L', c.v, c.bin, 'product@5e', 'mosmix'), b = P('mae', 'L', c.v, c.bin, 'product@5e', 'mosmix'); if (a?.skill > 0 && b?.skill > 0) pos += 1; for (const [m, p] of [['CRPS', a], ['MAE', b]]) if (word(p) === 'worse') worse.push(`${lab(c)} ${m} ${cell(p)}`); }
  verdicts.H12 = worse.length ? 'GILT NICHT' : pos === 16 ? 'GILT (indikativ)' : 'TEILWEISE';
  md.push(`Beide Skills > 0 in ${pos} von 16 Zellen; signifikant schlechter: ${worse.length ? worse.join('; ') : 'keine'}. **H12 ${verdicts.H12}.**`, '');
  table('H13 — stack (Modus L, eigener Fit) gegen MOSMIX der Nachbarstation', 'L', 'stack', 'mosmix', ['mae', 'crps'], CELLS, [{ label: 'MAE < 15 km', metric: 'mae', st: 'km:lt15' }, { label: 'MAE 15–30 km', metric: 'mae', st: 'km:15-30' }, { label: 'MAE ≥ 30 km', metric: 'mae', st: 'km:ge30' }, { label: 'MAE |Δh| ≥ 100 m', metric: 'mae', st: 'dh:ge100' }]);
  const t = tally('L', 'stack', 'mosmix', 'mae');
  verdicts.H13 = ruleH10(t);
  md.push(`MAE: ${t.better.length} signifikant besser, ${t.worse.length} signifikant schlechter, ${t.ns.length} gleichauf. **H13 ${verdicts.H13}.**`, '');
  table('H13 Kontext — stack gegen product@5e (Modus L)', 'L', 'stack', 'product@5e', ['mae', 'crps']);
  table('H13 Kontext — stack gegen fl-K@5e (Modus L)', 'L', 'stack', 'fl-K@5e', ['mae', 'crps']);
  table('H13 Kontext — fl-K@5e gegen MOSMIX der Nachbarstation (Modus L)', 'L', 'fl-K@5e', 'mosmix', ['mae', 'crps']);
}
// run 2: the engine options (§2.9 (9)–(13))
if (Object.keys(card.scores).some((k) => k.includes('|product+fix|'))) {
  const CN = ['clct', 'precip'].flatMap((v) => [0, 1, 2, 3].map((bin) => ({ v, bin })));
  table('E1 — product+fix (learnedAtPoint, V-FS-2) gegen product@5e (Modus L)', 'L', 'product+fix', 'product@5e', ['mae', 'crps']);
  {
    const cells = ['t', 'gust'].flatMap((v) => [0, 1, 2, 3].map((bin) => ({ v, bin })));
    const tt = tally('L', 'product+fix', 'product@5e', 'mae', cells);
    verdicts.E1 = tt.better.length === 8 ? 'GILT' : 'GILT NICHT';
    md.push(`**E1 ${verdicts.E1}** — T und Böe signifikant besser in ${tt.better.length} von 8 Zellen.${tt.better.length < 8 ? ` Nicht besser: ${[...tt.ns, ...tt.worse, ...tt.missing].join('; ')}.` : ''}`, '');
  }
  table('E1 Kontext — product+fix gegen product@5e (Modus S)', 'S', 'product+fix', 'product@5e', ['mae', 'crps']);
  table('E1 Kontext — product+fix gegen fl-K@5e (Modus L)', 'L', 'product+fix', 'fl-K@5e', ['mae', 'crps']);
  table('Kontext — product+fix+noshrink gegen product+fix (Modus S)', 'S', 'product+fix+noshrink', 'product+fix', ['mae', 'crps']);
  table('Kontext — product+fix+noshrink gegen product+fix (Modus L)', 'L', 'product+fix+noshrink', 'product+fix', ['mae', 'crps']);
  table('Kontext — product+fix+noshrink gegen mosmix (Modus S)', 'S', 'product+fix+noshrink', 'mosmix', ['mae', 'crps'], CELLS, COUNTRY);
  table('Kontext — product+fix+noshrink gegen fl-K@5e (Modus L)', 'L', 'product+fix+noshrink', 'fl-K@5e', ['mae', 'crps']);
  table('E2 — product-FS (Motor: fix + noshrink + learnedClouds + stationValue, In-sample-Tabelle) gegen mosmix (Modus S)', 'S', 'product-FS', 'mosmix', ['mae', 'crps'], CELLS, COUNTRY);
  { const tt = tally('S', 'product-FS', 'mosmix', 'mae'); verdicts.E2 = ruleH10(tt); md.push(`MAE: ${tt.better.length} signifikant besser, ${tt.worse.length} signifikant schlechter (davon < −2 %: ${tt.worse2.length}), ${tt.ns.length} gleichauf. **E2 ${verdicts.E2}.**${tt.worse.length ? ` Schlechter: ${tt.worse.join('; ')}.` : ''}`, ''); }
  table('E5 — stack0 (Stationswert ohne Messung: Formen ohne w·I, Leave-Day-out) gegen mosmix (Modus S)', 'S', 'stack0', 'mosmix', ['mae', 'crps'], CELLS, COUNTRY);
  { const tt = tally('S', 'stack0', 'mosmix', 'mae'); verdicts.E5 = ruleH10(tt); md.push(`MAE: ${tt.better.length} signifikant besser, ${tt.worse.length} signifikant schlechter (davon < −2 %: ${tt.worse2.length}), ${tt.ns.length} gleichauf. **E5 ${verdicts.E5}.**${tt.worse.length ? ` Schlechter: ${tt.worse.join('; ')}.` : ''}`, ''); }
  table('E5 Kontext — stack0 gegen stack (mit Messung)', 'S', 'stack0', 'stack', ['mae']);
  table('E5 Kontext — stack0 gegen live (MAE)', 'S', 'stack0', 'live', ['mae'], CELLS.filter((c) => c.v !== 'td'));
  table('E2 Kontext — product-FS gegen product@5e (Modus S)', 'S', 'product-FS', 'product@5e', ['mae', 'crps'], CELLS, COUNTRY);
  table('E2 Kontext — product-FS gegen live (Modus S, MAE)', 'S', 'product-FS', 'live', ['mae'], CELLS.filter((c) => c.v !== 'td'));
  table('E2 Kontext — product-FS gegen stack (Leave-Day-out, Modus S)', 'S', 'product-FS', 'stack', ['mae', 'crps']);
  // phase AX, AX-2 (E-FV-3): route 3 in t2/t3 — only the bins the option touches (51 h and beyond); t1 is byte-identical
  {
    const LONG = ALL_VARS.flatMap((v) => [3, 4, 5].map((bin) => ({ v, bin })));
    table('AX-2 — product-FS-r3 (Route 3 in t2/t3, E-FV-3) gegen product-FS (Route 1) — Modus S, Bins 51–336 h', 'S', 'product-FS-r3', 'product-FS', ['mae', 'crps'], LONG, COUNTRY);
    table('AX-2 — product-FS-r3 gegen product-FS — Modus L (stationsloser Punkt), Bins 51–336 h', 'L', 'product-FS-r3', 'product-FS', ['mae', 'crps'], LONG);
    table('AX-2 Kontext — product-FS-r3 gegen mosmix (Modus S), Bins 51–336 h', 'S', 'product-FS-r3', 'mosmix', ['mae', 'crps'], LONG.filter((c) => FIT_VARS.includes(c.v)));
    table('AX-2 Kontext — product-FS-r3 gegen fl-K@5e (Modus L), Bins 51–336 h', 'L', 'product-FS-r3', 'fl-K@5e', ['mae', 'crps'], LONG);
    const t6 = tally('S', 'product-FS-r3', 'product-FS', 'crps', LONG), t6m = tally('S', 'product-FS-r3', 'product-FS', 'mae', LONG), t6L = tally('L', 'product-FS-r3', 'product-FS', 'crps', LONG);
    verdicts['AX-2'] = t6.worse.length === 0 && t6L.worse.length === 0 && (t6.better.length + t6L.better.length) >= 4 ? 'BESSER' : (t6.worse2.length === 0 && t6L.worse2.length === 0 ? 'GLEICHSTAND' : 'SCHLECHTER');
    md.push(`CRPS Modus S: ${t6.better.length} signifikant besser, ${t6.worse.length} signifikant schlechter, ${t6.ns.length} gleichauf, ${t6.missing.length} ohne Zelle · MAE Modus S: ${t6m.better.length} / ${t6m.worse.length} / ${t6m.ns.length} · CRPS Modus L: ${t6L.better.length} / ${t6L.worse.length} / ${t6L.ns.length}. **AX-2 ${verdicts['AX-2']}** (Regel: keine Zelle signifikant schlechter in S und L und ≥ 4 signifikant besser ⇒ BESSER; keine Zelle < −2 % ⇒ GLEICHSTAND; sonst SCHLECHTER).${t6.worse.length ? ` Schlechter (S): ${t6.worse.join('; ')}.` : ''}${t6L.worse.length ? ` Schlechter (L): ${t6L.worse.join('; ')}.` : ''}`, '');
  }
  // phase AX, AX-5 (V-FS-5): country parameters of the station value — the frozen rule reads the country layers of Wind/Böe 7–120 h
  if (card.scores['crps|S|ws|1|stack-cc|all'] || card.pairs['mae|S|ws|1|stack-cc|stack|all']) {
    table('AX-5 — stack-cc (Parameter je Land, Rückfall gepoolt) gegen stack (gepoolt) — Modus S', 'S', 'stack-cc', 'stack', ['mae', 'crps'], CELLS, COUNTRY);
    table('AX-5 Kontext — stack-cc gegen mosmix (Modus S)', 'S', 'stack-cc', 'mosmix', ['mae', 'crps'], CELLS, COUNTRY);
    table('AX-5 Kontext — stack-cc gegen stack (Modus L)', 'L', 'stack-cc', 'stack', ['mae', 'crps']);
    const rows5 = [];
    for (const cc of ['DE', 'AT', 'CH']) for (const v of ['ws', 'gust']) for (const bin of [1, 2, 3]) for (const m of ['mae', 'crps']) { const p = P(m, 'S', v, bin, 'stack-cc', 'stack', `country:${cc}`); rows5.push({ cc, v, bin, m, w: word(p), p }); }
    const chBetter = rows5.filter((r) => r.cc === 'CH' && r.w === 'better').length, chWorse = rows5.filter((r) => r.cc === 'CH' && r.w === 'worse').length;
    const deatWorse = rows5.filter((r) => r.cc !== 'CH' && r.w === 'worse').length, worse2 = rows5.filter((r) => r.w === 'worse' && r.p.skill < -0.02).length;
    verdicts['AX-5'] = chWorse === 0 && deatWorse === 0 && chBetter >= 2 ? 'GILT' : worse2 === 0 ? 'GLEICHSTAND' : 'GILT NICHT';
    md.push(`Wind/Böe 7–120 h je Land (MAE und CRPS): CH ${chBetter} signifikant besser / ${chWorse} schlechter; DE+AT ${rows5.filter((r) => r.cc !== 'CH' && r.w === 'better').length} besser / ${deatWorse} schlechter; Zeilen mit Landesparametern ${ccUsed.cc}, mit gepoolten ${ccUsed.pooled}. **AX-5 ${verdicts['AX-5']}** (Regel: CH ≥ 2 Zellen signifikant besser und nirgends signifikant schlechter, DE/AT nirgends signifikant schlechter ⇒ GILT; keine Zelle < −2 % ⇒ GLEICHSTAND; sonst GILT NICHT).${rows5.filter((r) => r.w === 'worse').length ? ` Schlechter: ${rows5.filter((r) => r.w === 'worse').map((r) => `${r.cc} ${VAR_LABEL[r.v]} ${BIN_LABEL[r.bin]} ${r.m} ${cell(r.p)}`).join('; ')}.` : ''}`, '');
  }
  // phase AX, AX-4 (E-AX-4/5): the two-atom cloud family in the chain — only the cloud cells can differ (K7 checks the rest)
  if (Object.keys(card.scores).some((k) => k.includes('|product-FS+atoms|'))) {
    const CL = [0, 1, 2, 3, 4, 5].map((bin) => ({ v: 'clct', bin }));
    table('AX-4 — product-FS+atoms (Wolkenatome) gegen product-FS — Modus S, Bewölkung (DE)', 'S', 'product-FS+atoms', 'product-FS', ['crps', 'mae'], CL);
    table('AX-4 — product-FS+atoms gegen product-FS — Modus L, Bewölkung (DE)', 'L', 'product-FS+atoms', 'product-FS', ['crps', 'mae'], CL);
    table('AX-4 Kontext — product-FS+atoms gegen mosmix (Modus S, Bewölkung)', 'S', 'product-FS+atoms', 'mosmix', ['crps', 'mae'], CL);
    const t7 = tally('S', 'product-FS+atoms', 'product-FS', 'crps', CL.slice(0, 4)), t7L = tally('L', 'product-FS+atoms', 'product-FS', 'crps', CL.slice(0, 4));
    // K7: the atoms touch ONLY the clouds — every other variable is byte-identical between P5 and P3
    let k7bad = [];
    for (const v of ['t', 'td', 'ws', 'gust', 'precip']) for (const bin of [0, 1, 2, 3, 4, 5]) { const a = card.scores[`S|${v}|${bin}|product-FS+atoms|all`], b = card.scores[`S|${v}|${bin}|product-FS|all`]; if (a && b && (Math.abs(a.mae - b.mae) > 1e-9 || Math.abs(a.crps - b.crps) > 1e-9)) k7bad.push(`${VAR_LABEL[v]} ${BIN_LABEL[bin]}`); }
    verdicts['AX-4'] = t7.worse.length === 0 && t7L.worse.length === 0 && (t7.better.length + t7L.better.length) >= 4 ? 'BESSER' : (t7.worse.length === 0 && t7L.worse.length === 0 ? 'GLEICHSTAND' : 'SCHLECHTER');
    verdicts.K7 = k7bad.length ? 'NICHT bestanden' : 'bestanden';
    md.push(`CRPS Bewölkung 0–120 h: Modus S ${t7.better.length} signifikant besser / ${t7.worse.length} schlechter / ${t7.ns.length} gleichauf · Modus L ${t7L.better.length} / ${t7L.worse.length} / ${t7L.ns.length}. **AX-4 ${verdicts['AX-4']}** (Regel: keine Zelle signifikant schlechter in S und L und ≥ 4 signifikant besser ⇒ BESSER). **K7** (Atome berühren nur die Bewölkung — T/Td/Wind/Böe/Niederschlag byte-gleich zu product-FS): **${verdicts.K7}**${k7bad.length ? ` (abweichend: ${k7bad.join(', ')})` : ''}.`, '');
  }
  table('E2 Kontext — Bewölkung und Niederschlag: product-FS gegen product@5e (Modus S)', 'S', 'product-FS', 'product@5e', ['mae', 'crps'], CN);
  table('E2 Kontext — Bewölkung und Niederschlag: product-FS gegen mosmix (Modus S)', 'S', 'product-FS', 'mosmix', ['mae', 'crps'], CN);
  table('E4 — product+fix+noshrink gegen MOSMIX der Nachbarstation (Modus L)', 'L', 'product+fix+noshrink', 'mosmix', ['crps', 'mae'], CELLS, COUNTRY);
  {
    let pos = 0; const worse = [];
    for (const c of CELLS) { const a = P('crps', 'L', c.v, c.bin, 'product+fix+noshrink', 'mosmix'), b = P('mae', 'L', c.v, c.bin, 'product+fix+noshrink', 'mosmix'); if (a?.skill > 0 && b?.skill > 0) pos += 1; for (const [mm, pp] of [['CRPS', a], ['MAE', b]]) if (word(pp) === 'worse') worse.push(`${lab(c)} ${mm} ${cell(pp)}`); }
    verdicts.E4 = worse.length ? 'GILT NICHT' : pos === 16 ? 'GILT (indikativ)' : 'TEILWEISE';
    md.push(`Beide Skills > 0 in ${pos} von 16 Zellen; signifikant schlechter: ${worse.length ? worse.join('; ') : 'keine'}. **E4 ${verdicts.E4}.**`, '');
  }
  const k5max = Math.max(0, ...Object.values(k5).map((o) => o.maxAbs));
  verdicts.K5 = Object.keys(k5).length && k5max <= 1e-3 ? 'bestanden' : 'NICHT bestanden';
  verdicts.K6 = k6.n > 0 && k6.maxAbs <= 1e-3 ? 'bestanden' : 'NICHT bestanden';
  md.push('## E3 — Motor = Form', '',
    `- **K5** (Motor mit priorShrink:false gegen die Offline-Form, Punktwert): ${Object.entries(k5).map(([v, o]) => `${VAR_LABEL[v]} n ${o.n} max |Δ| ${o.maxAbs.toExponential(2)} (σ ${o.maxSigma.toExponential(2)})`).join(' · ')} — **${verdicts.K5}**`,
    `- **K6** (Stationswert des Motors gegen stack:in, Zeilen gleicher Form): ${Object.entries(k6.byVar).map(([v, o]) => `${VAR_LABEL[v]} n ${o.n} max |Δ| ${o.maxAbs.toExponential(2)}, andere Form ${o.formDiffers}`).join(' · ')} — **${verdicts.K6}**`, '');
}
// absolute numbers
for (const mode of MODES) {
  md.push(`## Absolut — Modus ${mode} (Schicht all)`, '', '| Zelle | Kandidat | n | MAE | Bias | CRPS | PIT außen | S/S |', '|---|---|---|---|---|---|---|---|');
  for (const v of ALL_VARS) for (const bin of [0, 1, 2, 3, 4, 5]) for (const c of ['mosmix', 'live', 'product@5e', 'product-noshrink', 'product+fix', 'product+fix+noshrink', 'product-FS', 'product-FS-r3', 'product-FS+atoms', 'fl-K@5e', 'mosmix+anker', 'mosmix+anker+bias', 'stack', 'stack-cc', 'stack0']) {
    const s = card.scores[`${mode}|${v}|${bin}|${c}|all`];
    if (s) md.push(`| ${VAR_LABEL[v]} · ${BIN_LABEL[bin]} | ${c} | ${s.n} | ${f2(s.mae, 3)} | ${f2(s.bias)} | ${f2(s.crps, 3)} | ${f2(s.pitOuter, 3)} | ${f2(s.spreadSkill)} |`);
  }
  md.push('');
}
// coefficients
md.push('## Koeffizienten (In-sample, alle Tage; die Kandidaten rechnen mit den Leave-Day-out-Werten)', '', '| Modus | Größe | τ (h) | Form | n | b | w | c | σ |', '|---|---|---|---|---|---|---|---|---|');
for (const [k, c] of Object.entries(card.coefficients)) { const [mode, v, g, form] = k.split('|'); if (form === 'S' || form === 'S0') md.push(`| ${mode} | ${VAR_LABEL[v]} | ${tauLabel(+g)} | ${form} | ${c.n} | ${f2(c.b, 3)} | ${f2(c.w, 3)} | ${f2(c.c, 3)} | ${f2(c.sigma, 3)} |`); }
md.push('');
// controls
{
  const wTrue = card.coefficients['S|t|0|AB']?.w, wK1 = card.k1['S|t|0|AB']?.w;
  verdicts.K1 = wTrue != null && wK1 != null && Math.abs(wK1) < Math.abs(wTrue) / 3 ? 'bestanden' : 'NICHT bestanden';
  let k2bad = [];
  for (const c of CELLS) { const p = P('mae', 'S', c.v, c.bin, 'stack:in', 'stack'); if (p && p.skill < -0.005) k2bad.push(`${lab(c)} ${f2(100 * p.skill, 2)} %`); }
  verdicts.K2 = k2bad.length ? 'NICHT bestanden' : 'bestanden';
  verdicts.K3 = k3.n > 0 && k3.maxAbs === 0 ? 'bestanden' : 'NICHT bestanden';
  verdicts.K4 = k4.rows > 0 && k4.sameAsPoint === 0 && k4.zeroKm === 0 ? 'bestanden' : 'NICHT bestanden';
  md.push('## Kontrollen', '',
    `- **K1** (Innovation eines anderen Ausgabetags, T, τ = 1, Form AB): w echt ${f2(wTrue, 3)}, w versetzt ${f2(wK1, 3)} — **${verdicts.K1}**`,
    `- **K2** (In-sample gegen Leave-Day-out, stack, MAE): ${CELLS.map((c) => { const p = P('mae', 'S', c.v, c.bin, 'stack:in', 'stack'); return p ? `${lab(c)} ${f2(100 * p.skill, 2)} %` : null; }).filter(Boolean).join(' · ')} — **${verdicts.K2}**${k2bad.length ? ` (In-sample schlechter: ${k2bad.join('; ')})` : ''}`,
    `- **K3** (Nullform = MOSMIX): ${k3.n} Werte, max |Δ| ${k3.maxAbs} — **${verdicts.K3}**`,
    `- **K4** (Nachbar ist nie der Punkt): ${k4.rows} Zeilen im Modus L, Nachbar = Punkt ${k4.sameAsPoint}, Abstand 0 ${k4.zeroKm} — **${verdicts.K4}**`, '');
}
md.push('## Zusammenfassung', '', Object.entries(verdicts).map(([k, v]) => `${k} ${v}`).join(' · '), '');
card.verdicts = verdicts;
writeFileSync(flags.out, JSON.stringify(card));
writeFileSync(flags.out.replace(/\.json$/, '.md'), md.join('\n'));
if (decisionPath) { mkdirSync(dirname(decisionPath), { recursive: true }); writeFileSync(decisionPath, md.join('\n')); }
say(`geschrieben ${flags.out} (+ .md${decisionPath ? `, ${decisionPath}` : ''}): ${Object.keys(card.scores).length} Zellen, ${card.tests} DM-Tests`);
say(Object.entries(verdicts).map(([k, v]) => `${k} ${v}`).join(' · '));
