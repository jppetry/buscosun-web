/**
 * fit.mjs — the fit of the learning stage of buscosun Fusion (phase FL, FL-AP3; `audit/fusion-lernphase.md` §3, §5,
 * PAP 8). Streams the case files (`cases/v1/<month>/<tier>.cas.gz`) in four passes and writes
 * `<root>\fit\<date>\fusion.hindcast.json` (provenance `hindcast`, E-F-23):
 *
 *   pass A  mean model — Gram groups per stratum × {month | region | band} for forms P and K, the source error
 *           statistics (Σ prior), the anchor persistence, the forecast-anomaly skill ρ_f, the wet share;
 *           then: λ by time folds (region and band folds reported), β per stratum and per held-out month;
 *   pass B  variance model on the OUT-OF-FOLD squared residuals (β of the fold without the row's month), the amount
 *           regression of wet hours, the hurdle reservoir;
 *   (fusionFit@3) the hurdle: damped Newton in memory per stratum on a bounded reservoir of design rows from pass B,
 *           exact fold β and out-of-fold Brier against the cube (V-FL-18, V-FL-36 — the former passes C/D diverged);
 *   pass E  (fusionFit@3, FL-AP8c) σ scale per stratum by CRPS on the out-of-fold residuals (V-FL-15), the speed law
 *           TN(a + b·E_Rice, c·sd_Rice) behind the u/v model (V-FL-22) — verdicts out of fold, written on all months.
 *
 * `--stride=N` (default 4) thins the Gram adds (n_eff is bounded by autocorrelation anyway — Mathe-Spec §4.2); the
 * cheap row-level statistics (anchor, ρ_f, counts) see every row. Everything deterministic; nothing here reads the
 * punktarchiv (E-F-28).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/fit.mjs
 *       [--cases=<root>\cases\v1] [--clima=<root>\fit\<date>\clima.hindcast.json] [--features=…] [--out=…]
 *       [--months=2025-09,2026-09] [--stride=4] [--tiers=t1,t2,t3]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { clientTables, clientTablesReport } from './lib/clientTables.mjs';
import { dirname, join } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { readCases } from './lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, topTiles, ROW_COLUMNS, FIT_VARS } from './lib/rowFeatures.mjs';
import { Gram, ridge, variancePenalty } from '../../src/point/fusionFit/gram.ts';
import { meanDesignK, meanDesignP, varianceDesign, occurrenceDesign, amountDesign, O_NAMES, A_NAMES, WET_MM_H } from '../../src/point/fusionFit/design.ts';
import { fitStratum, ErrorStats, designDim, P_MODS, LAMBDAS } from '../../src/point/fusionFit/fitMean.ts';
import { fitVarianceStratum, predictSigma } from '../../src/point/fusionFit/fitVariance.ts';
import { HurdleRows, fitOccurrenceRows, fitAmountStratum } from '../../src/point/fusionFit/fitPrecip.ts';
import { ScaleAcc, chooseScale, SCALE_GRID, pitOuterOf } from '../../src/point/fusionFit/fitScale.ts';
import { SpeedAcc, fitSpeedStratum } from '../../src/point/fusionFit/fitSpeed.ts';
import { crpsNormal, crpsCensoredNormal, pitOf } from '../../src/pointForecast/fusion/dist.ts';
import { AnchorAcc, ANCHOR_VARS } from '../../src/point/fusionFit/fitAnchor.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { stratumKey, parseStratum, regionOf, timeFolds, sourcesOfMask } from '../../src/point/fusionFit/strata.ts';
import { Z_DIM } from '../../src/point/fusionFit/features.ts';
import { newTables, validateTables } from '../../src/point/fusionFit/tables.ts';

const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const casesDir = typeof flags.cases === 'string' ? flags.cases : join(root, 'cases', 'v1');
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const stamp = new Date().toISOString().slice(0, 10);
const climaPath = typeof flags.clima === 'string' ? flags.clima : join(root, 'fit', stamp, 'clima.hindcast.json');
const out = typeof flags.out === 'string' ? flags.out : join(root, 'fit', stamp, 'fusion.hindcast.json');
const stride = Math.max(1, Number(flags.stride) || 6);
const tiers = flags.tiers ? String(flags.tiers).split(',') : ['t1', 't2', 't3'];
const monthRange = typeof flags.months === 'string' ? flags.months.split(',') : null;
/** `--nmin=n,days`: minimum evidence per stratum (default STRATUM_MIN 5000 rows / 30 days) — smoke tests only. */
const nmin = typeof flags.nmin === 'string' ? (([n, d]) => ({ n: Number(n), days: Number(d) }))(flags.nmin.split(',')) : undefined;
const say = (s) => console.log(`[fit] ${s}`);

// ── inputs ─────────────────────────────────────────────────────────────────────
const featBytes = readFileSync(featPath);
const feat = JSON.parse(featBytes.toString('utf8'));
const featuresHash = createHash('sha256').update(featBytes).digest('hex');
const clima = existsSync(climaPath) ? JSON.parse(readFileSync(climaPath, 'utf8')) : null;
if (!clima) say(`Klimatologie ${climaPath} fehlt — ρ_f entfällt (erst fit-clima.mjs)`);
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of tiers) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p, meta: JSON.parse(readFileSync(`${p}.meta.json`, 'utf8')) }); }
}
if (!files.length) throw new Error(`keine Falldateien unter ${casesDir}`);
let sites = null, regions = null, pointIds = null;
const prepareSites = (header) => {
  if (sites) return;
  pointIds = header.points;
  sites = pointIds.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null));
  regions = topTiles(sites, 12);
  say(`${sites.filter(Boolean).length} Punkte, Regionen ${[...regions].sort().join(' ')} + rest`);
};
const climaOf = (site, v, x) => {
  if (!clima) return null;
  const e = clima.byPoint?.[site.id]?.[v] ?? clima.pooled?.[`${site.band}|${site.country}`]?.[v];
  return e && e.status === 'written' ? climaAt(e, x) : null;
};

/**
 * Stream all files; cb(ctx, i, b) per usable row. `select(i, b)` decides per row whether the full context (Z, per-source
 * predictors) is built; other rows get the light context (targets, cube member) when `lightToo`, else are skipped.
 */
async function pass(label, cb, { select = () => true, lightToo = false } = {}) {
  const T0 = Date.now();
  let rows = 0, used = 0;
  for (const f of files) {
    const r = await readCases(f.path, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
      prepareSites(header);
      const b = prepareBatch(cols);
      for (let i = 0; i < n; i++) {
        rows += 1;
        const full = select(i, b);
        if (!full && !lightToo) continue;
        const ctx = rowContext(b, i, sites, !full);
        if (!ctx) continue;
        used += 1; cb(ctx, full, b);
      }
    } });
    say(`${label}: ${f.month} ${f.tier} ${r.rows} Zeilen · ${Math.round((Date.now() - T0) / 1000)} s`);
  }
  say(`${label} fertig: ${rows} Zeilen, ${used} mit Wahrheit, ${Math.round((Date.now() - T0) / 1000)} s`);
  return { rows, used };
}

// ── pass A ───────────────────────────────────────────────────────────────────
const grams = new Map();          // stratum → { month: Map, region: Map, band: Map, p }
const errStats = new Map();       // `${v}|${bin}|${cls}` → Map<month, ErrorStats>
const anchors = Object.fromEntries(ANCHOR_VARS.map((v) => [v, new AnchorAcc()]));
const rhoF = new Map();           // `${v}|${bin}` → { ab, aa, bb, n }
const wetCount = new Map();       // stratum(precip) → { n, wet }
let curAnchor = null;
const cx = new Float64Array(C_DIM);
const gramsOf = (key, p) => {
  let g = grams.get(key);
  if (!g) { g = { p, month: new Map(), region: new Map(), band: new Map() }; grams.set(key, g); }
  return g;
};
const addGram = (key, p, x, y, ctx, baseSq, extra) => {
  const g = gramsOf(key, p);
  const rg = regionOf(ctx.site.tile, regions);
  for (const [axis, k] of [['month', `${ctx.month}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${ctx.site.band}`]]) {
    let gr = g[axis].get(k); if (!gr) { gr = new Gram(p); g[axis].set(k, gr); }
    gr.add(x, y, ctx.dayIdx);
    if (baseSq != null) gr.addExtra('base', baseSq);
    if (extra) for (const [ek, ev] of extra) gr.addExtra(ek, ev);
  }
};
/** Row selection: every `stride`-th row gets the full context; a slot subsample (every 4th 3-h slot) the light one. */
const strideSelect = (i, b) => (b.cols.validAtH[i] + b.cols.pointIdx[i]) % stride === 0;
const anchorSlot = (i, b) => ((b.cols.slotAtH[i] / 3) | 0) % 4 === 0;
const statsA = await pass('A', (ctx, full) => {
  // forecast-anomaly skill (selected rows, needs the climatology)
  if (clima) {
    climaDesign(ctx.validAtMs, ctx.site.site.lonDeg, cx);
    for (const v of FIT_VARS) {
      if (ctx.y[v] == null || ctx.k[v] == null) continue;
      const c = climaOf(ctx.site, v, cx); if (!c) continue;
      const a = ctx.k[v] - c.mu, b = ctx.y[v] - c.mu;
      const key = `${v}|${ctx.bin}`;
      let r = rhoF.get(key); if (!r) { r = { ab: 0, aa: 0, bb: 0, n: 0 }; rhoF.set(key, r); }
      r.ab += a * b; r.aa += a * a; r.bb += b * b; r.n += 1;
    }
  }
  if (!full) return;
  for (const v of FIT_VARS) {
    const y = ctx.y[v]; if (y == null) continue;
    // form K
    if (ctx.k[v] != null) {
      const x = meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount);
      addGram(stratumKey('K', v, ctx.bin, ctx.clsK), x.length, x, y, ctx, (y - ctx.k[v]) ** 2, null);
    }
    // form P
    const src = ctx.p[v];
    if (src && src.length) {
      const cls = ctx.clsP(v);
      const x = meanDesignP(ctx.z, src, ctx.dTsfcK);
      const extra = src.map((s) => [`src:${s.sid}`, (y - s.yA) ** 2]);
      addGram(stratumKey('P', v, ctx.bin, cls), x.length, x, y, ctx, (y - ctx.pBase[v]) ** 2, extra);
      const ek = `${v}|${ctx.bin}|${cls}`;
      let em = errStats.get(ek); if (!em) { em = new Map(); errStats.set(ek, em); }
      let es = em.get(ctx.month); if (!es) { es = new ErrorStats(src.length); em.set(ctx.month, es); }
      es.add(new Float64Array(src.map((s) => y - s.yA)));
    }
    if (v === 'precip' && ctx.y.wet != null) {
      for (const [form, cls] of [['K', ctx.clsK], ['P', ctx.clsP('precip')]]) {
        if (form === 'K' ? ctx.k.precip == null : !ctx.p.precip) continue;
        const key = stratumKey(form, 'precip', ctx.bin, cls);
        let w = wetCount.get(key); if (!w) { w = { n: 0, wet: 0 }; wetCount.set(key, w); }
        w.n += 1; w.wet += ctx.y.wet;
      }
    }
  }
}, { select: strideSelect });

// ── solve the mean model ───────────────────────────────────────────────────────
const tables = newTables(new Date().toISOString());
tables.inputs = { featuresHash, casesCodeHash: files[0].meta?.counters ? null : null, caseFiles: files.length, rows: statsA.rows, months: [...new Set(files.map((f) => f.month))].sort(), regions: [...regions].sort() };
const foldBeta = new Map();   // stratum → Map<month, beta> (β of the fold WITHOUT that month and its neighbours)
let written = 0, tooShort = 0;
for (const [key, g] of grams) {
  const { form, v, bin, cls } = parseStratum(key);
  // the Σ prior of form P: pooled over months (the fold-out version would need one prior per fold — noted as V-FL-9)
  let err = null;
  if (form === 'P') { const em = errStats.get(`${v}|${bin}|${cls}`); if (em) { for (const es of em.values()) { if (!err) err = new ErrorStats(es.k); err.merge(es); } } }
  // each axis map holds every row once — never merge them into one map (V-FL-21: the other axes leak the held-out rows)
  const entry = fitStratum(form, v, bin, cls, { month: g.month, region: g.region, band: g.band }, err, 'base', nmin);
  tables.mean[key] = entry;
  if (entry.status === 'written' || entry.status === 'no-skill') {
    if (entry.status === 'written') written += 1; else tooShort += 1;
    // β per held-out month for the out-of-fold residuals of pass B (also for `no-skill`: the variance model still needs residuals)
    const months = [...g.month.keys()].map((k) => k.split('|')[0]).sort();
    const all = Gram.sum(g.month.values(), g.p);
    const penalty = variancePenalty(all);
    const target = new Float64Array(g.p);
    if (entry.prior) { const srcs = sourcesOfMask(parseInt(cls.slice(1), 16)); srcs.forEach((s, i) => { target[Z_DIM + i * P_MODS.length] = entry.prior.weights[s] ?? 0; }); target[0] = entry.prior.bias; } else if (form === 'K') target[Z_DIM] = 1;
    const fb = new Map();
    for (const f of timeFolds(months)) {
      const train = new Gram(g.p);
      for (const [k, gr] of g.month) { const m = k.split('|')[0]; if (!f.held.includes(m) && !f.purged.includes(m)) train.merge(gr); }
      const r = train.n >= 2 * g.p ? ridge(train, entry.lambda, penalty, target) : null;
      fb.set(f.held[0], r ? r.beta : new Float64Array(entry.beta));
    }
    foldBeta.set(key, fb);
    // persisted for the scorer: β of the fold WITHOUT a month (and its neighbours) — the out-of-sample coefficients
    entry.folds = Object.fromEntries([...fb.entries()].map(([m, b]) => [m, Array.from(b).map((x) => Math.round(x * 1e6) / 1e6)]));
  } else tooShort += 1;
}
say(`Mittelwertmodell: ${written} Strata geschrieben, ${tooShort} zu kurz oder ohne CV-Gewinn (${Object.values(tables.mean).filter((e) => e.status === 'no-skill').length} no-skill)`);
// free the mean grams
grams.clear();

// ── pass B: variance, amount, hurdle reservoir ───────────────────────────────
const vGrams = new Map(), aGrams = new Map();
const gramOf = (map, key, p) => { let g = map.get(key); if (!g) { g = new Gram(p); map.set(key, g); } return g; };
const muOf = (key, ctx, x) => {
  const fb = foldBeta.get(key); if (!fb) return null;
  const beta = fb.get(ctx.month) ?? tables.mean[key]?.beta; if (!beta) return null;
  let s = 0; for (let i = 0; i < beta.length; i++) s += beta[i] * x[i]; return s;
};
// fusionFit@3 (V-FL-18, V-FL-36, V-FL-40): the hurdle is fitted IN MEMORY per stratum from a bounded reservoir sample of design
// rows (Algorithm R with a seeded LCG — uniform over the whole stream, every month in proportion) with a damped Newton to
// convergence — the pass-based IRLS with three fixed full steps diverged on the real rows. Pooled β, exact per-fold β and the
// out-of-fold Brier come from the same rows.
const HURDLE_CAP = Math.max(20000, Number(flags.hurdleCap) || 250000);
const hurdle = new Map();   // stratum → HurdleRows
const hurdleOf = (key) => { let r = hurdle.get(key); if (!r) { r = new HurdleRows(O_NAMES.length, HURDLE_CAP); hurdle.set(key, r); } return r; };
await pass('B', (ctx, full, b) => {
  // anchor (all t1 rows of every 4th slot): OUT-OF-FOLD residuals of form K at lead 1 against later leads of the same
  // (point, slot) — the persistence left after the learned bias, i.e. what the anchor of the learned product can use
  if (ctx.tier === 't1' && anchorSlot(0, { cols: { slotAtH: [ctx.slotAtH], pointIdx: [0] } })) {
    const e = {};
    for (const v of ANCHOR_VARS) {
      const mu = ctx.y[v] != null && ctx.k[v] != null ? muOf(stratumKey('K', v, ctx.bin, ctx.clsK), ctx, meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount)) : null;
      e[v] = mu != null ? ctx.y[v] - mu : NaN;
    }
    if (ctx.leadH === 1) curAnchor = { p: ctx.pointIdx, s: ctx.slotAtH, e };
    else if (curAnchor && curAnchor.p === ctx.pointIdx && curAnchor.s === ctx.slotAtH) for (const v of ANCHOR_VARS) anchors[v].add(ctx.leadH, curAnchor.e[v], e[v]);
  }
  if (!full) return;
  for (const v of FIT_VARS) {
    const y = ctx.y[v]; if (y == null || v === 'precip') continue;
    if (ctx.k[v] != null) {
      const key = stratumKey('K', v, ctx.bin, ctx.clsK);
      const mu = muOf(key, ctx, meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount));
      if (mu != null) gramOf(vGrams, key, 9).add(varianceDesign(ctx.z, ctx.sigDiv[v], ctx.sigEns[v]), (y - mu) ** 2, ctx.dayIdx);
    }
    const src = ctx.p[v];
    if (src && src.length) {
      const key = stratumKey('P', v, ctx.bin, ctx.clsP(v));
      const mu = muOf(key, ctx, meanDesignP(ctx.z, src, ctx.dTsfcK));
      if (mu != null) gramOf(vGrams, key, 9).add(varianceDesign(ctx.z, ctx.sigDiv[v], ctx.sigEns[v]), (y - mu) ** 2, ctx.dayIdx);
    }
  }
  // the hurdle reservoir and the amount regression share this pass (the hurdle needs the cube's dry probability, V-FL-18)
  if (ctx.y.wet != null && ctx.pDryCube != null) {
    for (const [form, cls, pMean, wetShare] of [['K', ctx.clsK, ctx.k.precip, ctx.wetShareK], ['P', ctx.clsP('precip'), ctx.pBase.precip, ctx.wetShareP]]) {
      if (pMean == null) continue;
      const key = stratumKey(form, 'precip', ctx.bin, cls);
      hurdleOf(key).add(occurrenceDesign(ctx.z, Math.expm1(pMean), wetShare, ctx.sigDiv.precip, ctx.pDryCube), ctx.y.wet, ctx.month, ctx.pDryCube, ctx.dayIdx);
      // the amount model is ln(y | wet), the parameter of the engine's hurdleLogNormal — NOT log1p (the predictor scale)
      if (ctx.y.wet === 1 && ctx.y.rr >= WET_MM_H) gramOf(aGrams, key, A_NAMES.length).add(amountDesign(ctx.z, Math.expm1(pMean), ctx.sigDiv.precip), Math.log(ctx.y.rr), ctx.dayIdx);
    }
  }
}, { select: (i, b) => strideSelect(i, b) || (b.cols.tier[i] === 1 && anchorSlot(i, b)) });
for (const [key, g] of vGrams) { const { form, v, bin, cls } = parseStratum(key); tables.variance[key] = fitVarianceStratum(form, v, bin, cls, g, nmin); }
for (const [key, g] of aGrams) { const { form, bin, cls } = parseStratum(key); tables.amount[key] = fitAmountStratum(form, bin, cls, g, nmin); }
// the hurdle: damped Newton per stratum on the reservoir, exact fold β, out-of-fold Brier against the cube (V-FL-18, V-FL-36)
{
  const T1 = Date.now();
  for (const [key, r] of hurdle) {
    const { form, bin, cls } = parseStratum(key);
    tables.occurrence[key] = fitOccurrenceRows(form, bin, cls, r, timeFolds([...r.months].sort()), nmin);
    const e = tables.occurrence[key];
    say(`Hürde ${key}: ${r.n} von ${r.offered} Zeilen (Reservoir, ${r.months.length} Monate), ${e.iterations} Newton-Schritte, ${e.status}${e.cv ? `, oof Brier ${e.cv.brier} gegen Cube ${e.cv.brierCube} (n ${e.cv.n}, ${e.cv.folds} Falten)` : ''}`);
  }
  say(`Hürde: ${hurdle.size} Strata in ${Math.round((Date.now() - T1) / 1000)} s`);
  hurdle.clear();
}

// ── pass E (fusionFit@3): σ scale per CRPS (V-FL-15), speed law (V-FL-22) — out of fold ──
const scaleAcc = new Map();    // stratum (t/td/gust/clct) → ScaleAcc
const speedAcc = new Map();    // `${form}|ws|${bin}|${cls}` → SpeedAcc
const accOf = (map, key, mk) => { let a = map.get(key); if (!a) { a = mk(); map.set(key, a); } return a; };
const SCALED_VARS = ['t', 'td', 'gust', 'clct'];
const BOUNDS = { gust: [0, 90], clct: [0, 100] };
const crpsK = new Float64Array(SCALE_GRID.length), outerK = new Float64Array(SCALE_GRID.length);
/** Out-of-fold μ and the moment σ of a stratum at a row, or null. */
const muSigmaOf = (key, ctx, x, v) => {
  const ve = tables.variance[key]; if (!ve || ve.status !== 'written') return null;
  const mu = muOf(key, ctx, x); if (mu == null) return null;
  return { mu, sigma: predictSigma(varianceDesign(ctx.z, ctx.sigDiv[v], ctx.sigEns[v]), ve) };
};
const speedSample = (ctx) => ctx.bin >= 3 && (ctx.pointIdx + ctx.slotAtH) % 12 === 0;
await pass('E', (ctx) => {
  for (const form of ['K', 'P']) {
    const cls = (v) => (form === 'K' ? ctx.clsK : ctx.clsP(v));
    const design = (v) => (form === 'K' ? (ctx.k[v] != null ? meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount) : null) : (ctx.p[v] && ctx.p[v].length ? meanDesignP(ctx.z, ctx.p[v], ctx.dTsfcK) : null));
    // σ scale: CRPS and PIT edge at every k of the grid
    for (const v of SCALED_VARS) {
      const y = ctx.y[v]; if (y == null) continue;
      const x = design(v); if (!x) continue;
      const key = stratumKey(form, v, ctx.bin, cls(v));
      const ms = muSigmaOf(key, ctx, x, v); if (!ms) continue;
      const b = BOUNDS[v];
      for (let i = 0; i < SCALE_GRID.length; i++) {
        const sg = ms.sigma * SCALE_GRID[i];
        if (b) { crpsK[i] = crpsCensoredNormal(ms.mu, sg, b[0], b[1], y); outerK[i] = pitOuterOf(pitOf({ kind: 'censoredNormal', mu: ms.mu, sigma: sg, lo: b[0], hi: b[1] }, y)); }
        else { crpsK[i] = crpsNormal(ms.mu, sg, y); outerK[i] = pitOuterOf(pitOf({ kind: 'normal', mu: ms.mu, sigma: sg }, y)); }
      }
      accOf(scaleAcc, key, () => new ScaleAcc()).add(ctx.month, crpsK, outerK);
    }
    // speed law: the Rice of the out-of-fold u/v model against the observed speed
    if (ctx.y.ff != null) {
      const xu = design('u'), xv = design('v');
      if (xu && xv) {
        const cu = cls('u');
        const mu = muSigmaOf(stratumKey(form, 'u', ctx.bin, cu), ctx, xu, 'u'), mv = muSigmaOf(stratumKey(form, 'v', ctx.bin, cls('v')), ctx, xv, 'v');
        if (mu && mv) {
          const nu = Math.hypot(mu.mu, mv.mu), sig = Math.sqrt(0.5 * (mu.sigma ** 2 + mv.sigma ** 2));
          accOf(speedAcc, `${form}|ws|${ctx.bin}|${cu}`, () => new SpeedAcc()).add(ctx.month, ctx.dayIdx, ctx.y.ff, nu, sig, speedSample(ctx));
        }
      }
    }
  }
}, { select: strideSelect });
// verdicts: σ scale (clouds always, T/Td/gust only where it wins out of fold), speed law
const scaleReport = [];
for (const [key, acc] of scaleAcc) {
  const ve = tables.variance[key]; if (!ve || ve.status !== 'written') continue;
  const cv = chooseScale(acc); if (!cv) continue;
  const { v } = parseStratum(key);
  const mandatory = v === 'clct';
  const k = mandatory || cv.winsOof ? cv.k : 1;
  tables.variance[key] = { ...ve, scale: k, scaleCv: cv };
  scaleReport.push(`${key.padEnd(24)} k ${String(cv.k).padEnd(4)} ${mandatory ? 'Pflicht' : cv.winsOof ? 'gewinnt' : 'bleibt 1'} · oof CRPS ${cv.oof ? `${cv.oof.crpsBase.toFixed(4)} → ${cv.oof.crps.toFixed(4)} (${(100 * (cv.oof.crps / cv.oof.crpsBase - 1)).toFixed(2)} %)` : '—'} · PIT-Rand ${cv.oof ? `${cv.oof.pitOuterBase.toFixed(3)} → ${cv.oof.pitOuter.toFixed(3)}` : '—'} · n ${cv.oof?.n ?? 0}`);
}
for (const [key, acc] of speedAcc) { const { form, bin, cls } = parseStratum(key); tables.speed[key] = fitSpeedStratum(form, bin, cls, acc, nmin); }

// ── the rest of the tables ────────────────────────────────────────────────────
tables.anchor = Object.fromEntries(ANCHOR_VARS.map((v) => { const curve = anchors[v].curve(); return [v, { curve, tauH: AnchorAcc.tauOf(curve), setTauH: v === 't' || v === 'td' ? 4 : 2 }]; }));
tables.rhoForecast = {};
for (const [key, r] of rhoF) { const [v, bin] = key.split('|'); (tables.rhoForecast[v] ??= []).push({ bin: Number(bin), rho: r.n > 100 && r.aa > 0 && r.bb > 0 ? Math.round((r.ab / Math.sqrt(r.aa * r.bb)) * 1e4) / 1e4 : null, n: r.n }); }
for (const v of Object.keys(tables.rhoForecast)) tables.rhoForecast[v].sort((a, b) => a.bin - b.bin);
tables.clima = clima ? { byPoint: clima.byPoint, pooled: clima.pooled, rho: clima.rho } : null;
tables.period = { from: `${tables.inputs.months[0]}-01`, to: `${tables.inputs.months[tables.inputs.months.length - 1]}-31` };
tables.notes.push(`stride ${stride} für die Gram-Akkumulation (Anker, ρ_f, Zähler über alle Zeilen)`, 'Σ-Prior der Form P über alle Monate gepoolt (V-FL-9: je Falte wäre sauberer)', 'Varianzmodell: Momentenschätzer auf Out-of-fold-Residuen (Zeitfalte des Monats), Boden 10 % des mittleren Residuenquadrats',
  'fusionFit@3 — σ-Skala je Stratum per CRPS auf dem Gitter 0,8…2,0 (Durchlauf E, Out-of-fold-Residuen; Bewölkung Pflicht, T/Td/Böe nur wo sie out of fold gewinnt, sonst 1; Böe/Bewölkung als zensierte Normal ohne die Kopplung an den Wind), V-FL-15',
  'fusionFit@3 — Speed-EMOS: TN(a + b·E_Rice, c·sd_Rice) bei 0 je Stratum (Gitter 5×3×5, CRPS geschlossen), out of fold gegen die Rice; no-skill ⇒ Rice bleibt; Log-Normal nur verglichen (Teilstichprobe 51–336 h, jede 12. Zeile), V-FL-22',
  `fusionFit@3 — Hürde mit Spalte logit(1 − pDry_Cube), im Speicher je Stratum aus einer Reservoir-Stichprobe (Algorithmus R, gesäter LCG, ≤ ${HURDLE_CAP} Zeilen, alle Monate anteilig) mit gedämpftem Newton bis zur Konvergenz (Liniensuche auf der Log-Likelihood; die Durchlauf-IRLS mit drei festen Schritten divergierte — V-FL-36); Falten-β exakt je Zeitfalte, no-skill, wenn der Out-of-fold-Brier den des Cube nicht unterschreitet, V-FL-18`);
const errs = validateTables(tables);
if (errs.length) say(`Tabellen ungültig: ${errs.join('; ')}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(tables));
// the client tables (FL-AP5, E-FL-1): form K only, without fold β and without the per-point climatology — what the
// browser can carry (`point/fusion.client.json`, loader `src/point/client/learnedPoint.ts`)
const clientOut = join(dirname(out), 'fusion.client.json');
// V-FL-28 (FL-AP8c): the client reads none of the fit metadata — `lib/clientTables.mjs` (one definition, also standalone)
const client = clientTables(tables);
const clientErrs = validateTables(client);
if (clientErrs.length) say(`Client-Tabellen ungültig: ${clientErrs.join('; ')}`);
writeFileSync(clientOut, JSON.stringify(client));
say(`Client-Tabellen ${clientOut}: ${JSON.stringify(clientTablesReport(client))}`);
const rep = { mean: Object.values(tables.mean).filter((e) => e.status === 'written').length, meanShort: Object.values(tables.mean).filter((e) => e.status !== 'written').length, variance: Object.values(tables.variance).filter((e) => e.status === 'written').length, occurrence: Object.values(tables.occurrence).filter((e) => e.status === 'written').length, occurrenceNoSkill: Object.values(tables.occurrence).filter((e) => e.status === 'no-skill').length, amount: Object.values(tables.amount).filter((e) => e.status === 'written').length, speed: Object.values(tables.speed).filter((e) => e.status === 'written').length, speedNoSkill: Object.values(tables.speed).filter((e) => e.status === 'no-skill').length, scaled: Object.values(tables.variance).filter((e) => e.scale != null && e.scale !== 1).length };
say(`geschrieben ${out}: ${JSON.stringify(rep)}; Anker τ: ${Object.entries(tables.anchor).map(([v, a]) => `${v} ${a.tauH}h (set ${a.setTauH})`).join(' · ')}`);
say('σ-Skala je Stratum (V-FL-15):'); for (const l of scaleReport.sort()) say(l);
say('Speed-EMOS je Stratum (V-FL-22):');
for (const [key, e] of Object.entries(tables.speed).sort()) if (e.cv) say(`${key.padEnd(20)} n ${String(e.n).padStart(8)} a ${e.a} b ${e.b} c ${e.c} ${e.status} · in-sample CRPS Rice ${e.cv.crpsRice.toFixed(4)} → TN ${e.cv.crpsTn.toFixed(4)} · oof ${e.cv.oof ? `${e.cv.oof.crpsRice.toFixed(4)} → ${e.cv.oof.crps.toFixed(4)} (${(100 * (e.cv.oof.crps / e.cv.oof.crpsRice - 1)).toFixed(2)} %) · PIT-Rand ${e.cv.oof.pitOuterRice.toFixed(3)} → ${e.cv.oof.pitOuter.toFixed(3)}` : '— (keine Falte)'}${e.ln ? ` · LN (n ${e.ln.n}) CRPS ${e.ln.crps.toFixed(4)} PIT ${e.ln.pitOuter.toFixed(3)} gegen TN ${e.ln.crpsTn.toFixed(4)} / Rice ${e.ln.crpsRice.toFixed(4)}` : ''}`);
say('Hürde (V-FL-18):');
for (const [key, e] of Object.entries(tables.occurrence).sort()) say(`${key.padEnd(20)} n ${String(e.n).padStart(8)} ${e.status} · oof Brier ${e.cv ? `${e.cv.brier.toFixed(4)} gegen Cube ${e.cv.brierCube.toFixed(4)} (Skill ${e.cv.skill == null ? '—' : (100 * e.cv.skill).toFixed(1) + ' %'}, n ${e.cv.n})` : '— (keine Falte)'} · β_logitWetCube ${e.beta.length ? e.beta[e.beta.length - 1].toFixed(3) : '—'}`);
// a short skill table for the log: form × var × bin, time-fold MSE skill against the baseline
const lines = [];
for (const [key, e] of Object.entries(tables.mean)) if (e.status === 'written' && e.cv.time) lines.push(`${key.padEnd(28)} n ${String(e.n).padStart(8)} λ ${String(e.lambda).padStart(5)} skill time ${(e.cv.time.skill ?? NaN).toFixed(3)} region ${(e.cv.region?.skill ?? NaN).toFixed(3)} band ${(e.cv.band?.skill ?? NaN).toFixed(3)}`);
for (const l of lines.sort().slice(0, 80)) say(l);
if (errs.length) process.exitCode = 1;
