/**
 * score.mjs — the scorecard of phase FL (FL-AP4; `audit/fusion-lernphase.md` §6, PAP 9). Streams the case files,
 * builds every candidate's distribution per row and variable, and scores them out of sample:
 *
 *   fl-K, fl-P   the learning stage (forms K and P) with the β of the fold WITHOUT the row's month
 *   cube         the current engine (fused distribution stored in the row — candidate „heutiger Cube")
 *   mmm          equal-weight mean of the height-corrected sources (deterministic; CRPS = MAE)
 *   src:<id>     each source, height-corrected (deterministic)
 *   clima        the hourly climatology (Normal μ_c, σ_c; wind as Rice of the component climatology)
 *   persist      the truth at the as-of hour (deterministic); apersist = its anomaly carried on the climatology
 *
 * Metrics per variable × lead bin × stratum (all, country, band, route): MAE/bias/RMSE, CRPS, PIT histogram and
 * outer share, spread/skill; Brier + reliability and ETS at thresholds (precip 0,1/1/5 mm/h; T < 0 °C; gust > 14 m/s;
 * wind > 8 m/s); DM (HAC on daily means) and a block bootstrap for the pairs fl-K/fl-P/cube against the references,
 * Benjamini–Hochberg over all DM tests; the gates G-FL-1…4. FSS is not defined at points (no neighbourhood) — ETS at
 * the thresholds stands in, and says so in the header.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/score.mjs
 *       --tables=<root>\fit\<date>\fusion.hindcast.json [--cases=…] [--features=…] [--out=<root>\score\<date>\scorecard.json]
 *       [--stride=4] [--months=2025-09,2026-09] [--riceN=96]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { readCases } from './lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, ROW_COLUMNS, FIT_VARS } from './lib/rowFeatures.mjs';
import { truthReader } from './lib/truthJoin.mjs';
import { ScoreAcc, BrierAcc, EtsAcc, PairAcc, benjaminiHochberg, crpsByCdf } from './lib/stats.mjs';
import { crpsOf, crpsNormal, crpsTruncatedNormal, pitOf, quantileOf, exceedance, meanOf } from '../../src/pointForecast/fusion/dist.ts';
import { predict } from '../../src/point/fusionFit/predict.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import { stratumKey, classKey, FL_SOURCES } from '../../src/point/fusionFit/strata.ts';
import { windComponents } from '../../src/point/fusionFit/features.ts';
import { anchorWeightFromCurve } from '../../src/pointForecast/anchor.ts';
import { speedLaw } from '../../src/point/fusionFit/fitSpeed.ts';

const H = 3_600_000;
const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const casesDir = typeof flags.cases === 'string' ? flags.cases : join(root, 'cases', 'v1');
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const stamp = new Date().toISOString().slice(0, 10);
const tablesPath = typeof flags.tables === 'string' ? flags.tables : join(root, 'fit', stamp, 'fusion.hindcast.json');
const out = typeof flags.out === 'string' ? flags.out : join(root, 'score', stamp, 'scorecard.json');
const stride = Math.max(1, Number(flags.stride) || 4);
const riceN = Number(flags.riceN) || 96;
const monthRange = typeof flags.months === 'string' ? flags.months.split(',') : null;
const say = (s) => console.log(`[score] ${s}`);

const tablesBytes = readFileSync(tablesPath);
const tables = JSON.parse(tablesBytes.toString('utf8'));
const terr = validateTables(tables);
if (terr.length) throw new Error(`Tabellen ungültig: ${terr.join('; ')}`);
// FL-AP8b (V-FL-20): candidate `fl-K+anchor` — form K plus the lead-1 residual of the same (point, slot) carried with the
// measured persistence weight w(τ) from `tables.anchor` (run route, tier t1, leads 2…48; σ unchanged). Off with --anchor=0
// or without an anchor block. The curve was fitted on all months (not out of fold) — slightly optimistic, said in the notes.
const withAnchor = !(flags.anchor === '0' || flags.anchor === 0 || flags.anchor === false) && !!tables.anchor;
const ANCHOR_CAND_VARS = ['t', 'td', 'u', 'v', 'gust'];
const anchorW = withAnchor ? Object.fromEntries(ANCHOR_CAND_VARS.map((v) => [v, tables.anchor[v]?.curve ? Array.from({ length: 49 }, (_, L) => anchorWeightFromCurve(tables.anchor[v].curve, L)) : null])) : null;
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const truth = truthReader(root);
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of ['t1', 't2', 't3']) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p }); }
}
let sites = null, pointIds = null;

// ── candidates ────────────────────────────────────────────────────────────────
/** Tables with the fold β of one month swapped in (out of sample). */
const foldTablesCache = new Map();
const tablesForMonth = (month) => {
  if (foldTablesCache.has(month)) return foldTablesCache.get(month);
  const mean = {}, occurrence = {};
  for (const [k, e] of Object.entries(tables.mean)) mean[k] = e.folds?.[month] ? { ...e, beta: e.folds[month] } : e;
  // fusionFit@3: the hurdle carries fold β too (one Newton step from the pooled β, V-FL-18)
  for (const [k, e] of Object.entries(tables.occurrence)) occurrence[k] = e.folds?.[month] ? { ...e, beta: e.folds[month] } : e;
  const t = { ...tables, mean, occurrence };
  foldTablesCache.set(month, t);
  return t;
};
const cx = new Float64Array(C_DIM);
const climaEntry = (site, v) => tables.clima?.byPoint?.[site.id]?.[v] ?? tables.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null;
const climaDist = (site, v, x) => { const e = climaEntry(site, v); return e && e.status === 'written' ? climaAt(e, x) : null; };

/** Deterministic value → a degenerate "distribution" record for the accumulators. */
const det = (value) => ({ det: true, value });
const distOrNull = (d) => (d ? { det: false, dist: d } : null);

/**
 * Candidates per variable for one row: { name → { det, value | dist } }. Variables scored: t, td, ws (speed), gust,
 * clct, precip (amount mm/h with atom).
 */
/** The form-K situation of a row (the same glue as the client adapter). */
const sitK = (ctx) => ({ z: ctx.z, leadH: ctx.leadH, route: ctx.route, srcMask: ctx.srcMask, srcCount: ctx.srcCount, dhM: ctx.dhM, dTsfcK: ctx.dTsfcK, k: ctx.k, p: {}, sigDiv: ctx.sigDiv, sigEns: ctx.sigEns, wetShare: ctx.wetShareK, pDryCube: ctx.pDryCube });

/** Lead-1 residuals e₁ = y − μ_K of one (point, slot) — the innovation the anchor of the learned product would carry. */
function anchorResiduals(ctx, tbl) {
  const pr = predict(tbl, 'K', sitK(ctx));
  const e = {};
  for (const v of ANCHOR_CAND_VARS) e[v] = ctx.y[v] != null && pr.mu[v] != null ? ctx.y[v] - pr.mu[v] : NaN;
  return e;
}

function candidatesOf(ctx, tbl, e1 = null) {
  const c = { t: {}, td: {}, ws: {}, gust: {}, clct: {}, precip: {} };
  const s = ctx.site;
  climaDesign(ctx.validAtMs, s.site.lonDeg, cx);
  // learned forms
  const sit = sitK(ctx);
  const pK = predict(tbl, 'K', sit);
  const pP = predict(tbl, 'P', { ...sit, p: ctx.p, srcMask: ctx.pMask.t, wetShare: ctx.wetShareP });
  for (const [name, pr] of [['fl-K', pK], ['fl-P', pP]]) {
    if (pr.dist.temperature) c.t[name] = distOrNull(pr.dist.temperature);
    if (pr.dist.dewPoint) c.td[name] = distOrNull(pr.dist.dewPoint);
    if (pr.dist.windSpeed) c.ws[name] = distOrNull(pr.dist.windSpeed);
    if (pr.dist.gust) c.gust[name] = distOrNull(pr.dist.gust);
    if (pr.dist.clouds) c.clct[name] = distOrNull(pr.dist.clouds);
    if (pr.dist.precipitation) c.precip[name] = distOrNull(pr.dist.precipitation);
  }
  // FL-AP8b (V-FL-20): form K + w(τ)·e₁ — only where the lead-1 row of the same (point, slot) exists (run route, t1, 2…48 h)
  if (e1 && anchorW && ctx.leadH >= 2 && ctx.leadH <= 48) {
    const w = (v) => anchorW[v]?.[ctx.leadH];
    const sh = (v) => (Number.isFinite(e1[v]) && w(v) != null && pK.mu[v] != null ? w(v) * e1[v] : null);
    const dT = sh('t'), dTd = sh('td'), dU = sh('u'), dV = sh('v'), dG = sh('gust');
    if (dT != null && pK.dist.temperature) c.t['fl-K+anchor'] = distOrNull({ kind: 'normal', mu: pK.mu.t + dT, sigma: pK.sigma.t });
    if (dTd != null && pK.dist.dewPoint) c.td['fl-K+anchor'] = distOrNull({ kind: 'normal', mu: Math.min(pK.mu.td + dTd, dT != null ? pK.mu.t + dT : Infinity), sigma: pK.sigma.td });
    if (dU != null && dV != null && pK.dist.windSpeed && pK.sigma.u != null && pK.sigma.v != null) {
      // the shifted u/v Rice — and, where the stratum has a speed law (fusionFit@3), the same law on top of it
      const rice = { kind: 'rice', nu: Math.hypot(pK.mu.u + dU, pK.mu.v + dV), sigma: Math.sqrt(0.5 * (pK.sigma.u ** 2 + pK.sigma.v ** 2)) };
      c.ws['fl-K+anchor'] = distOrNull(pK.speed ? speedLaw(rice, pK.speed) : rice);
    }
    if (dG != null && pK.dist.gust) c.gust['fl-K+anchor'] = distOrNull({ kind: 'censoredNormal', mu: Math.max(pK.mu.gust + dG, 0), sigma: pK.sigma.gust, lo: 0, hi: 90 });
  }
  // form P per variable uses its own class (the sources carrying the variable) — re-predict where the class differs from t's
  for (const [v, key] of [['td', 'td'], ['gust', 'gust'], ['clct', 'clct']]) {
    if (ctx.pMask[key] !== ctx.pMask.t) {
      const pr = predict(tbl, 'P', { ...sit, p: ctx.p, srcMask: ctx.pMask[key], wetShare: ctx.wetShareP });
      const d = key === 'td' ? pr.dist.dewPoint : key === 'gust' ? pr.dist.gust : pr.dist.clouds;
      c[v]['fl-P'] = d ? distOrNull(d) : undefined;
    }
  }
  if (ctx.pMask.u !== ctx.pMask.t) { const pr = predict(tbl, 'P', { ...sit, p: ctx.p, srcMask: ctx.pMask.u, wetShare: ctx.wetShareP }); c.ws['fl-P'] = pr.dist.windSpeed ? distOrNull(pr.dist.windSpeed) : undefined; }
  if (ctx.pMask.precip !== ctx.pMask.t) { const pr = predict(tbl, 'P', { ...sit, p: ctx.p, srcMask: ctx.pMask.precip, wetShare: ctx.wetShareP }); c.precip['fl-P'] = pr.dist.precipitation ? distOrNull(pr.dist.precipitation) : undefined; }
  // the current engine
  const f = ctx.fused;
  if (Number.isFinite(f.t[0]) && f.t[1] > 0) c.t.cube = distOrNull({ kind: 'normal', mu: f.t[0], sigma: f.t[1] });
  if (Number.isFinite(f.td[0]) && f.td[1] > 0) c.td.cube = distOrNull({ kind: 'normal', mu: f.td[0], sigma: f.td[1] });
  if (Number.isFinite(f.ws[0]) && f.ws[1] > 0) c.ws.cube = distOrNull({ kind: 'rice', nu: f.ws[0], sigma: f.ws[1] });
  if (Number.isFinite(f.gust[0]) && f.gust[1] > 0) c.gust.cube = distOrNull({ kind: 'censoredNormal', mu: f.gust[0], sigma: f.gust[1], lo: 0, hi: 90 });
  if (Number.isFinite(f.clct[0]) && f.clct[1] > 0) c.clct.cube = distOrNull({ kind: 'censoredNormal', mu: f.clct[0], sigma: f.clct[1], lo: 0, hi: 100 });
  if (Number.isFinite(f.pr[0]) && Number.isFinite(f.pr[1]) && f.pr[2] > 0) c.precip.cube = distOrNull({ kind: 'hurdleLogNormal', pDry: f.pr[0], mu: f.pr[1], sigma: f.pr[2] });
  // multi-model mean and single sources (height-corrected, deterministic)
  const mm = (v) => (ctx.pBase[v] != null ? (v === 'precip' ? Math.expm1(ctx.pBase[v]) : ctx.pBase[v]) : null);
  for (const v of ['t', 'td', 'gust', 'clct']) { const m = mm(v); if (m != null) c[v].mmm = det(m); }
  if (ctx.pBase.u != null && ctx.pBase.v != null) c.ws.mmm = det(Math.hypot(ctx.pBase.u, ctx.pBase.v));
  if (ctx.pBase.precip != null) c.precip.mmm = det(mm('precip'));
  const uBy = new Map((ctx.p.u ?? []).map((s) => [s.sid, s.yA])), vBy = new Map((ctx.p.v ?? []).map((s) => [s.sid, s.yA]));
  for (const v of ['t', 'td', 'gust', 'clct', 'precip']) for (const s of ctx.p[v] ?? []) c[v][`src:${s.sid}`] = det(v === 'precip' ? Math.expm1(s.yA) : s.yA);
  for (const [sid, u] of uBy) { const vv = vBy.get(sid); if (vv != null) c.ws[`src:${sid}`] = det(Math.hypot(u, vv)); }
  // climatology
  for (const v of ['t', 'td', 'gust', 'clct']) { const d = climaDist(s, v, cx); if (d) c[v].clima = distOrNull(v === 'gust' ? { kind: 'censoredNormal', mu: d.mu, sigma: d.sigma, lo: 0, hi: 90 } : v === 'clct' ? { kind: 'censoredNormal', mu: d.mu, sigma: d.sigma, lo: 0, hi: 100 } : { kind: 'normal', mu: d.mu, sigma: d.sigma }); }
  { const du = climaDist(s, 'u', cx), dv = climaDist(s, 'v', cx); if (du && dv) c.ws.clima = distOrNull({ kind: 'rice', nu: Math.hypot(du.mu, dv.mu), sigma: Math.sqrt(0.5 * (du.sigma ** 2 + dv.sigma ** 2)) }); }
  { const dp = climaDist(s, 'precip', cx); if (dp) c.precip.clima = det(Math.max(0, Math.expm1(dp.mu))); }
  // persistence: the truth at the as-of hour, and its anomaly on the climatology
  const o0 = truth.at(s.id, ctx.slotAtH * H);
  if (o0) {
    const cx0 = climaDesign(ctx.slotAtH * H, s.site.lonDeg, new Float64Array(C_DIM));
    const per = (v, obs) => { if (!Number.isFinite(obs)) return; c[v].persist = det(obs); const c0 = climaDist(s, v, cx0), c1 = climaDist(s, v, cx); if (c0 && c1) c[v].apersist = det(obs - c0.mu + c1.mu); };
    per('t', o0.t); per('td', o0.td); per('gust', o0.fx); per('clct', o0.n);
    if (Number.isFinite(o0.ff)) c.ws.persist = det(o0.ff);
    if (Number.isFinite(o0.rr)) c.precip.persist = det(o0.rr);
  }
  return c;
}

// ── accumulators ──────────────────────────────────────────────────────────────
const THRESH = { precip: [0.1, 1, 5], t: [0], gust: [14], ws: [8] };
const acc = new Map();        // `${v}|${bin}|${cand}|${stratum}` → ScoreAcc
const brier = new Map();      // `${v}|${bin}|${cand}|${thr}` → BrierAcc (probabilistic candidates)
const ets = new Map();        // `${v}|${bin}|${cand}|${thr}` → EtsAcc
const pairs = new Map();      // `${v}|${bin}|${cand}|${ref}|${stratum}` → PairAcc
const REFS = ['cube', 'mmm', 'clima', 'persist', 'apersist', ...FL_SOURCES.slice(0, 7).map((s) => `src:${s}`)];
const getOr = (map, key, mk) => { let a = map.get(key); if (!a) { a = mk(); map.set(key, a); } return a; };
const VAR_TRUTH = { t: 't', td: 'td', ws: 'ff', gust: 'gust', clct: 'clct', precip: 'rr' };

function scoreRow(ctx, cands) {
  const strata = ['all', `country:${ctx.site.country}`, `band:${ctx.site.band}`, `route:${ctx.route}`];
  for (const v of Object.keys(cands)) {
    const y = ctx.y[VAR_TRUTH[v]];
    if (y == null || !Number.isFinite(y)) continue;
    const scores = {};
    for (const [name, cd] of Object.entries(cands[v])) {
      if (!cd) continue;
      let point, crps = null, pit = null, sigma = null;
      if (cd.det) { point = cd.value; }
      else {
        const d = cd.dist;
        if (d.kind === 'rice') {
          // no bisection: the CDF integral on [0, ν + 8σ] (riceN cells), the mean as point value, σ (per component) as spread
          point = meanOf(d);
          crps = crpsByCdf(d, y, 0, d.nu + 8 * d.sigma + 1, riceN);
          sigma = d.sigma;
        } else if (d.kind === 'truncatedNormal') {
          // fusionFit@3 (V-FL-22): the speed law — mean as point value (like the Rice), CRPS closed form, spread from the quantiles
          point = meanOf(d);
          crps = crpsTruncatedNormal(d.mu, d.sigma, d.lo, y);
          sigma = (quantileOf(d, 0.8413) - quantileOf(d, 0.1587)) / 2;
        } else {
          point = d.kind === 'normal' ? d.mu : quantileOf(d, 0.5);
          crps = d.kind === 'normal' ? crpsNormal(d.mu, d.sigma, y) : crpsOf(d, y, d.kind === 'hurdleLogNormal' ? riceN : 256);
          sigma = d.kind === 'normal' || d.kind === 'censoredNormal' ? d.sigma : (quantileOf(d, 0.84) - quantileOf(d, 0.16)) / 2;
        }
        pit = pitOf(d, y);
        if (!Number.isFinite(crps)) continue;
      }
      if (!Number.isFinite(point)) continue;
      scores[name] = crps == null ? Math.abs(point - y) : crps;
      for (const st of strata) getOr(acc, `${v}|${ctx.bin}|${name}|${st}`, () => new ScoreAcc()).add(point - y, crps, pit, sigma);
      for (const thr of THRESH[v] ?? []) {
        const ob = v === 't' ? y < thr : y >= thr;
        if (!cd.det) { const p = v === 't' ? 1 - exceedance(cd.dist, thr) : exceedance(cd.dist, thr); getOr(brier, `${v}|${ctx.bin}|${name}|${thr}`, () => new BrierAcc()).add(Math.min(1, Math.max(0, p)), ob ? 1 : 0); getOr(ets, `${v}|${ctx.bin}|${name}|${thr}`, () => new EtsAcc()).add(p >= 0.5, ob); }
        else getOr(ets, `${v}|${ctx.bin}|${name}|${thr}`, () => new EtsAcc()).add(v === 't' ? point < thr : point >= thr, ob);
      }
    }
    for (const cand of ['fl-K', 'fl-P', 'cube', 'fl-K+anchor']) {
      if (scores[cand] == null) continue;
      // the anchor candidate is tested against fl-K itself (the pair that measures V-FL-20) and the references
      for (const ref of cand === 'fl-K+anchor' ? ['fl-K', ...REFS] : REFS) {
        if (ref === cand || scores[ref] == null) continue;
        for (const st of strata) getOr(pairs, `${v}|${ctx.bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(ctx.dayIdx, scores[cand], scores[ref]);
      }
    }
  }
}

// ── main pass ─────────────────────────────────────────────────────────────────
const T0 = Date.now();
let rows = 0, scored = 0;
let curAnchor = null, anchorSlots = 0, anchoredRows = 0;   // FL-AP8b: lead-1 residuals of the current (point, slot)
for (const f of files) {
  const tbl = tablesForMonth(f.month);
  const r = await readCases(f.path, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
    if (!sites) { pointIds = header.points; sites = pointIds.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null)); }
    const b = prepareBatch(cols);
    for (let i = 0; i < n; i++) {
      rows += 1;
      // FL-AP8b: the lead-1 row of every (point, slot) in the run route (t1) yields e₁ BEFORE the stride filter — rows arrive
      // ordered per point and slot (the same contract `fit.mjs` pass B relies on)
      if (withAnchor && f.tier === 't1' && cols.leadH[i] === 1) {
        const c1 = rowContext(b, i, sites, false);
        curAnchor = c1 && c1.route === 1 ? { p: cols.pointIdx[i], s: c1.slotAtH, e: anchorResiduals(c1, tbl) } : null;
        anchorSlots += curAnchor ? 1 : 0;
      }
      if ((cols.validAtH[i] + cols.pointIdx[i]) % stride !== 0) continue;
      const ctx = rowContext(b, i, sites, false);
      if (!ctx) continue;
      scored += 1;
      const e1 = withAnchor && f.tier === 't1' && ctx.route === 1 && curAnchor && curAnchor.p === cols.pointIdx[i] && curAnchor.s === ctx.slotAtH ? curAnchor.e : null;
      if (e1) anchoredRows += 1;
      scoreRow(ctx, candidatesOf(ctx, tbl, e1));
    }
  } });
  say(`${f.month} ${f.tier}: ${r.rows} Zeilen, ${scored} bewertet, ${Math.round((Date.now() - T0) / 1000)} s`);
}

// ── summaries, tests, gates ───────────────────────────────────────────────────
const card = {
  schema: 1, kind: 'fusionfit/scorecard', builtAt: new Date().toISOString(), codeHash: codeHash(), tables: { path: tablesPath, sha256: createHash('sha256').update(tablesBytes).digest('hex'), fitVersion: tables.fitVersion, provenance: tables.provenance },
  inputs: { cases: casesDir, files: files.length, rows, scored, stride, riceN, months: [...new Set(files.map((f) => f.month))].sort(), anchor: withAnchor ? { slots: anchorSlots, rows: anchoredRows } : null },
  notes: ['FSS ist an Punkten nicht definiert (keine Nachbarschaft) — ETS an den Schwellen steht dafür.', 'Deterministische Kandidaten: CRPS = MAE.', 'fl-K/fl-P mit den β der Zeitfalte ohne den Monat der Zeile (und seine Nachbarn); Varianz-, Hürden- und Klimatologie-Tabellen über alle Monate gepoolt (Stufe 1).', 'Wind (Rice): CRPS als CDF-Integral auf [0, ν + 8σ] mit riceN Zellen, Punktwert = Erwartungswert, Spread = σ je Komponente (Spread/Skill des Windes deshalb nur näherungsweise).', 'Niederschlag: PIT und Spread/Skill sind bei einer Verteilung mit Atom nicht aussagekräftig (G2 entfällt); Brier/ETS an 0,1/1/5 mm/h tragen die Kalibrierung.',
    ...(withAnchor ? [`fl-K+anchor (V-FL-20, FL-AP8b): μ_K + w(τ)·e₁ mit e₁ = y − μ_K bei Vorlauf 1 derselben (Punkt, Slot)-Reihe (Wahrheit der Slotstunde +1 h als Anker), w(τ) aus tables.anchor (Lauf-Route, t1, 2…48 h; σ unverändert; Td ≤ T). Die Kurve ist über ALLE Monate gefittet (nicht out of fold) ⇒ leicht optimistisch; ${anchorSlots} Slot-Reihen mit e₁, ${anchoredRows} bewertete Zeilen. Paar fl-K+anchor gegen fl-K = die Zahl für V-FL-20.`] : []),
  ],
  scores: {}, brier: {}, ets: {}, pairs: {}, gates: {},
};
for (const [k, a] of acc) card.scores[k] = a.summary();
for (const [k, a] of brier) card.brier[k] = a.summary();
for (const [k, a] of ets) card.ets[k] = a.summary();
const pKeys = [], pVals = [];
for (const [k, a] of pairs) { const s = a.summary(); if (!s) continue; card.pairs[k] = s; if (Number.isFinite(s.dm?.p)) { pKeys.push(k); pVals.push(s.dm.p); } }
const adj = benjaminiHochberg(pVals);
pKeys.forEach((k, i) => { card.pairs[k].dm.pAdj = adj[i]; });

// gates per variable × bin (fl-K is the shipped form; fl-P reported alongside)
const gates = {};
for (const v of ['t', 'td', 'ws', 'gust', 'clct', 'precip']) {
  for (let bin = 0; bin < 6; bin++) {
    for (const cand of ['fl-K', 'fl-P']) {
      const s = card.scores[`${v}|${bin}|${cand}|all`];
      if (!s) continue;
      const refs = REFS.filter((r) => card.pairs[`${v}|${bin}|${cand}|${r}|all`]);
      const beats = refs.map((r) => { const p = card.pairs[`${v}|${bin}|${cand}|${r}|all`]; return { ref: r, skill: p.skill, pAdj: p.dm.pAdj, significant: p.skill > 0 && p.dm.pAdj < 0.05, worse: p.skill < 0 && p.dm.pAdj < 0.05 }; });
      const g1 = beats.length > 0 && beats.every((b) => b.significant);
      const g2 = v === 'precip' ? null : s.spreadSkill != null && s.spreadSkill >= 0.85 && s.spreadSkill <= 1.2 && s.pitOuter != null && s.pitOuter >= 0.15 && s.pitOuter <= 0.25;
      const worseStrata = Object.entries(card.pairs).filter(([k, p]) => k.startsWith(`${v}|${bin}|${cand}|mmm|`) && !k.endsWith('|all') && p.skill < 0 && p.dm.pAdj < 0.05).map(([k]) => k.split('|')[4]);
      gates[`${v}|${bin}|${cand}`] = { n: s.n, crps: s.crps, mae: s.mae, spreadSkill: s.spreadSkill, pitOuter: s.pitOuter, G1: g1, G2: g2, G4: worseStrata.length === 0, worseStrata, beats };
    }
  }
}
card.gates = gates;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(card));

// markdown
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const md = [`# Scorecard FL — ${card.builtAt.slice(0, 10)}`, '', `Fälle ${scored} von ${rows} Zeilen (Stride ${stride}), Monate ${card.inputs.months[0]}…${card.inputs.months[card.inputs.months.length - 1]}, Tabellen ${tables.fitVersion} (${card.tables.sha256.slice(0, 12)}), codeHash ${card.codeHash}.`, '', ...card.notes.map((n) => `- ${n}`), ''];
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
for (const v of ['t', 'td', 'ws', 'gust', 'clct', 'precip']) {
  md.push(`## ${v}`, '', '| Bin | Kandidat | n | MAE | Bias | RMSE | CRPS | PIT außen | Spread/Skill | vs cube | vs mmm | vs beste Quelle | vs clima | G1 | G2 | G4 |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (let bin = 0; bin < 6; bin++) {
    const cands = [...new Set([...acc.keys()].filter((k) => k.startsWith(`${v}|${bin}|`) && k.endsWith('|all')).map((k) => k.split('|')[2]))].sort((a, b) => (card.scores[`${v}|${bin}|${a}|all`].crps - card.scores[`${v}|${bin}|${b}|all`].crps));
    for (const cand of cands) {
      const s = card.scores[`${v}|${bin}|${cand}|all`];
      const pr = (ref) => { const p = card.pairs[`${v}|${bin}|${cand}|${ref}|all`]; return p ? `${f2(100 * p.skill, 1)} % (p ${f2(p.dm.pAdj, 3)})` : '—'; };
      const srcs = REFS.filter((r) => r.startsWith('src:') && card.pairs[`${v}|${bin}|${cand}|${r}|all`]);
      const best = srcs.length ? srcs.reduce((a, b) => (card.pairs[`${v}|${bin}|${cand}|${b}|all`].skill < card.pairs[`${v}|${bin}|${cand}|${a}|all`].skill ? b : a)) : null;
      const g = gates[`${v}|${bin}|${cand}`];
      md.push(`| ${BIN_LABEL[bin]} | ${cand} | ${s.n} | ${f2(s.mae)} | ${f2(s.bias)} | ${f2(s.rmse)} | ${f2(s.crps, 3)} | ${f2(s.pitOuter, 3)} | ${f2(s.spreadSkill)} | ${pr('cube')} | ${pr('mmm')} | ${best ? `${best.slice(4)} ${pr(best)}` : '—'} | ${pr('clima')} | ${g ? (g.G1 ? '✓' : '✗') : ''} | ${g ? (g.G2 == null ? '–' : g.G2 ? '✓' : '✗') : ''} | ${g ? (g.G4 ? '✓' : '✗') : ''} |`);
    }
  }
  md.push('');
}
writeFileSync(out.replace(/\.json$/, '.md'), md.join('\n'));
say(`geschrieben ${out} (+ .md): ${Object.keys(card.scores).length} Score-Zellen, ${pKeys.length} DM-Tests, ${Math.round((Date.now() - T0) / 60000)} min`);
for (const [k, g] of Object.entries(gates)) if (k.endsWith('|fl-K')) say(`${k.padEnd(16)} n ${String(g.n).padStart(7)} CRPS ${f2(g.crps, 3)} S/S ${f2(g.spreadSkill)} PIT ${f2(g.pitOuter, 3)} G1 ${g.G1 ? '✓' : '✗'} G2 ${g.G2 == null ? '–' : g.G2 ? '✓' : '✗'} G4 ${g.G4 ? '✓' : '✗'} · ${g.beats.map((b) => `${b.ref} ${f2(100 * b.skill, 1)}%${b.significant ? '*' : b.worse ? '!' : ''}`).join(' ')}`);
