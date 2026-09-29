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
 * `--folds=month|half` (phase FX, hypothesis C8 — absorbs V-FL-27; default `month` = the behaviour of fusionFit@3):
 * the time-fold key of EVERY time-keyed accumulator — the Gram month axis, the source error statistics, the hurdle
 * reservoir, the σ scale, the speed law and the fold-β lookup of passes B/E — is the calendar month or the half-month
 * group of the row (`strata.ts FoldScheme`); `tables.inputs.foldScheme` names the scheme (written only for `half`).
 *
 * Phase FX stage 2 (all default-off; without the flags the fit is byte-identical to the stage-1 output):
 *   `--climaCols=none|station` (C1, V-FX-5): the station climatology μ_c (`byPoint`, fallback pooled band|country) as the
 *     LAST column of the mean design in passes A, B and E; a row without μ_c for a variable carries no design row for it.
 *   `--rhoTarget=0|1|cv`: 1 = the ridge target of the ȳ/ŷ_m columns is ρ_f(var, bin) from the pass-A accumulator (clipped
 *     to [0,05; 1]) and 1 − ρ_f on μ_c — the optimal linear blend μ_c + ρ·(ȳ − μ_c); 0 = the target of fusionFit@3;
 *     cv = per stratum BOTH targets, each with its own λ from the time-fold CV, the lower held-out MSE wins (the
 *     one-line ridge-target probe; `MeanEntry.rhoTargetChosen`/`rhoTargetCv`, the fold β use the chosen target).
 *   `--climaShuffle=1`: negative control — μ_c of the site pointIdx + 1 (wrap-around); the gain must vanish.
 *   `--speedGrid=v3|v4` (A1, V-FX-6): the opened grid with the second family `sd` (`fitSpeed.ts`); `--speedBands=0|1`
 *     fits the law additionally per height band (< / ≥ 800 m, entries `…|<band>`, pooled entries always written).
 *   `--scaleVars=t,td,gust,clct` (V-FX-7, E-FX-2): the variables the σ-scale rule may write a scale ≠ 1 for (default =
 *     today's behaviour; Fit 5b: `clct`); the others get 1, the search evidence `scaleCv` stays.
 *   Both `--climaCols=station` and `--rhoTarget=1` need the climatology document (`--clima=<path>`, unchanged).
 *   `--climaMu=<path>` (phase FX-4, §6.4): a second climatology document in the same schema whose `byPoint[id][v].mu` are
 *     ESTIMATED coefficients (leave-station-out, `audit/fusion-forschung/diag-fx4.mjs`) — they feed the μ_c column AND the
 *     ρ_f accumulator instead of the station's own series (fallback pooled band|country of `--clima`, counted); `--clima`
 *     keeps feeding `tables.clima` (the scorer's `clima` reference). The tables carry the estimates (`tables.climaMu`) so
 *     the scorer reads the same μ_c definition as the fit. Only with `--climaCols=station`, never with `--climaShuffle`.
 *   `--climaVars=t,td,gust` (phase FX-5, E-FX-8, §6.5): the μ_c column (and the ρ_f target / cv probe) ONLY for the named
 *     variables; every other variable keeps the `none` design and the fusionFit@3 target — its mean and variance entries are
 *     byte-identical to a fit without `--climaCols` (the negative control). `tables.design.mean.climaVars` names the list;
 *     absent = every variable (Fit 5b/5c). Only with `--climaCols=station`.
 *
 * Phase FV (`audit/fusion-validierung.md` §1.3, V-FX-44): `--thin=legacy|hash` — the row selection of the Gram adds (passes
 *   A, B, E). `legacy` (default) = `(validAtH + pointIdx) % stride`, byte-identical to every fit so far — a POINT selection on
 *   t2/t3 (stride 6: t3 65 of 389 stations, t2 130); `hash` = `mix32(validAtH, pointIdx) % stride` (`lib/thin.mjs`), every
 *   station in every tier at the same row share. Under `hash` the tables name mode and stride (`inputs.thin`) and a note.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/fit.mjs
 *       [--cases=<root>\cases\v1] [--clima=<root>\fit\<date>\clima.hindcast.json] [--features=…] [--out=…]
 *       [--months=2025-09,2026-09] [--stride=4] [--tiers=t1,t2,t3] [--folds=month|half]
 *       [--climaCols=none|station] [--rhoTarget=0|1|cv] [--climaShuffle=1] [--speedGrid=v3|v4] [--speedBands=0|1] [--scaleVars=…]
 *       [--climaMu=<path>] [--climaVars=t,td,gust] [--thin=legacy|hash]
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
import { fitStratum, ErrorStats, ridgeTarget } from '../../src/point/fusionFit/fitMean.ts';
import { fitVarianceStratum, predictSigma } from '../../src/point/fusionFit/fitVariance.ts';
import { HurdleRows, fitOccurrenceRows, fitAmountStratum } from '../../src/point/fusionFit/fitPrecip.ts';
import { ScaleAcc, chooseScale, SCALE_GRID, pitOuterOf, SCALE_VARS_DEFAULT, scaleForVar } from '../../src/point/fusionFit/fitScale.ts';
import { SpeedAcc, fitSpeedStratum, speedEdge, SPEED_CANDIDATES } from '../../src/point/fusionFit/fitSpeed.ts';
import { crpsNormal, crpsCensoredNormal, pitOf } from '../../src/pointForecast/fusion/dist.ts';
import { AnchorAcc, ANCHOR_VARS } from '../../src/point/fusionFit/fitAnchor.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { stratumKey, parseStratum, regionOf, timeFolds } from '../../src/point/fusionFit/strata.ts';
import { newTables, validateTables, parseClimaVars } from '../../src/point/fusionFit/tables.ts';
import { thinSelect, parseThin } from './lib/thin.mjs';

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
/** `--folds=month|half`: the time-fold scheme (phase FX, C8). `foldOf(ctx)` is THE time key — every accumulator below reads it. */
const folds = flags.folds == null ? 'month' : String(flags.folds);
if (folds !== 'month' && folds !== 'half') throw new Error(`--folds=${folds}: erwartet month oder half`);
const foldOf = (ctx) => (folds === 'half' ? ctx.half : ctx.month);
const say = (s) => console.log(`[fit] ${s}`);
// phase FX stage 2 flags (C1 / A1 / V-FX-7) — every default is the stage-1 behaviour
const climaCols = flags.climaCols == null ? 'none' : String(flags.climaCols);
if (climaCols !== 'none' && climaCols !== 'station') throw new Error(`--climaCols=${climaCols}: erwartet none oder station`);
const rhoMode = flags.rhoTarget == null || flags.rhoTarget === '0' || flags.rhoTarget === 0 ? '0' : flags.rhoTarget === '1' || flags.rhoTarget === 1 || flags.rhoTarget === true ? '1' : String(flags.rhoTarget);
if (rhoMode !== '0' && rhoMode !== '1' && rhoMode !== 'cv') throw new Error(`--rhoTarget=${rhoMode}: erwartet 0, 1 oder cv`);
const rhoTargetOn = rhoMode !== '0';
const climaShuffle = flags.climaShuffle === '1' || flags.climaShuffle === 1 || flags.climaShuffle === true;
const speedGrid = flags.speedGrid == null ? 'v3' : String(flags.speedGrid);
if (!SPEED_CANDIDATES[speedGrid]) throw new Error(`--speedGrid=${speedGrid}: erwartet v3 oder v4`);
const speedBands = flags.speedBands === '1' || flags.speedBands === 1 || flags.speedBands === true;
const scaleVars = typeof flags.scaleVars === 'string' ? flags.scaleVars.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (scaleVars && scaleVars.some((v) => !SCALE_VARS_DEFAULT.includes(v))) throw new Error(`--scaleVars=${flags.scaleVars}: erlaubt sind ${SCALE_VARS_DEFAULT.join(',')}`);
// phase FX-4 (§6.4): the estimated-μ_c document for the μ_c column and ρ_f
const climaMuPath = typeof flags.climaMu === 'string' ? flags.climaMu : null;
if (climaMuPath && climaCols !== 'station') throw new Error('--climaMu nur mit --climaCols=station');
if (climaMuPath && climaShuffle) throw new Error('--climaMu nicht mit --climaShuffle (die Kontrolle gilt der Stationsklimatologie)');
// phase FX-5 (E-FX-8): the μ_c column per variable — `climaVarOf(v)` is THE per-variable column decision of this fit
const climaVars = typeof flags.climaVars === 'string' ? parseClimaVars(flags.climaVars) : null;
if (climaVars && climaCols !== 'station') throw new Error('--climaVars nur mit --climaCols=station');
const climaVarOf = (v) => (climaCols === 'station' && (!climaVars || climaVars.includes(v)) ? 'station' : 'none');
// phase FV (V-FX-44): the row thinning — `legacy` is the rule of every fit so far (byte-identical), `hash` keeps every station in every tier
const thin = parseThin(flags.thin);
const thinKeep = thinSelect(thin, stride);
if (thin !== 'legacy') say(`Zeilenauswahl ${thin} (Stride ${stride}) — jede Station in jeder Stufe (lib/thin.mjs, V-FX-44)`);

// ── inputs ─────────────────────────────────────────────────────────────────────
const featBytes = readFileSync(featPath);
const feat = JSON.parse(featBytes.toString('utf8'));
const featuresHash = createHash('sha256').update(featBytes).digest('hex');
const clima = existsSync(climaPath) ? JSON.parse(readFileSync(climaPath, 'utf8')) : null;
if (!clima) say(`Klimatologie ${climaPath} fehlt — ρ_f entfällt (erst fit-clima.mjs)`);
if (!clima && (climaCols === 'station' || rhoTargetOn)) throw new Error(`--climaCols=station / --rhoTarget=1 brauchen das Klimatologie-Dokument (--clima=<pfad>): ${climaPath} fehlt`);
if (climaShuffle && climaCols !== 'station') throw new Error('--climaShuffle=1 nur mit --climaCols=station');
let climaMu = null, climaMuSha = null;
if (climaMuPath) {
  if (!existsSync(climaMuPath)) throw new Error(`--climaMu: ${climaMuPath} fehlt`);
  const b = readFileSync(climaMuPath);
  climaMu = JSON.parse(b.toString('utf8')); climaMuSha = createHash('sha256').update(b).digest('hex');
  if (climaMu.kind !== 'fusionfit/clima' || !climaMu.byPoint) throw new Error(`--climaMu: ${climaMuPath} ist kein Klimatologiedokument`);
  say(`μ_c-Spalte und ρ_f aus dem GESCHÄTZTEN μ_c ${climaMuPath} (${climaMu.loso?.candidate ?? '?'} · ${JSON.stringify(climaMu.loso?.estimator ?? null)} · Trendmerkmale ${climaMu.loso?.trendSet ?? '—'}), ${Object.keys(climaMu.byPoint).length} Stationen; tables.clima bleibt ${climaPath}`);
}
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
/** The μ_c source of a station and variable: the estimated document under `--climaMu` (fallback pooled), else the station's own series (fallback pooled). */
const muEntryOf = (site, v) => {
  const own = climaMu ? climaMu.byPoint?.[site.id]?.[v] : clima.byPoint?.[site.id]?.[v];
  if (own && own.status === 'written') return { e: own, fallback: false };
  const pe = clima.pooled?.[`${site.band}|${site.country}`]?.[v];
  return pe && pe.status === 'written' ? { e: pe, fallback: true } : null;
};
const climaOf = (site, v, x) => {
  if (!clima) return null;
  const r = muEntryOf(site, v);
  return r ? climaAt(r.e, x) : null;
};
/**
 * Phase FX (C1): μ_c of a row and variable for the design column — the station entry, else the pooled band|country entry
 * (counted per variable in pass A ⇒ `inputs.climaFallback`), null when neither is written. The clima design row is built
 * once per row (identity memo). Under `--climaShuffle=1` the site is the next point (wrap-around), evaluated at ITS
 * longitude — the negative control that the gain is site information.
 */
const cxK = new Float64Array(C_DIM);
let cxKCtx = null, cxKSite = null;
const climaFallback = Object.fromEntries(FIT_VARS.map((v) => [v, 0]));
let countFallback = false;
const muCOf = (ctx, v) => {
  let site = ctx.site;
  if (climaShuffle) { for (let k = 1; k <= sites.length; k++) { const s = sites[(ctx.pointIdx + k) % sites.length]; if (s) { site = s; break; } } }
  if (cxKCtx !== ctx || cxKSite !== site) { climaDesign(ctx.validAtMs, site.site.lonDeg, cxK); cxKCtx = ctx; cxKSite = site; }
  const r = muEntryOf(site, v);
  if (!r) return null;
  if (r.fallback && countFallback) climaFallback[v] += 1;
  return climaAt(r.e, cxK).mu;
};
/** The mean design rows of a row (null = the variable has no predictor, or no μ_c under `station`); the `none` calls are the stage-1 ones, byte for byte. */
const designK = (ctx, v) => {
  if (ctx.k[v] == null) return null;
  if (climaVarOf(v) === 'station') { const m = muCOf(ctx, v); return m == null ? null : meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount, 'station', m); }
  return meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount);
};
const designP = (ctx, v) => {
  const src = ctx.p[v];
  if (!src || !src.length) return null;
  if (climaVarOf(v) === 'station') { const m = muCOf(ctx, v); return m == null ? null : meanDesignP(ctx.z, src, ctx.dTsfcK, 'station', m); }
  return meanDesignP(ctx.z, src, ctx.dTsfcK);
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
  for (const [axis, k] of [['month', `${foldOf(ctx)}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${ctx.site.band}`]]) {
    let gr = g[axis].get(k); if (!gr) { gr = new Gram(p); g[axis].set(k, gr); }
    gr.add(x, y, ctx.dayIdx);
    if (baseSq != null) gr.addExtra('base', baseSq);
    if (extra) for (const [ek, ev] of extra) gr.addExtra(ek, ev);
  }
};
/** Row selection: every `stride`-th row gets the full context; a slot subsample (every 4th 3-h slot) the light one. */
const strideSelect = (i, b) => thinKeep(b.cols.validAtH[i], b.cols.pointIdx[i]);
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
  countFallback = true;
  for (const v of FIT_VARS) {
    const y = ctx.y[v]; if (y == null) continue;
    // form K (under `station` only with a μ_c — the fallback count reads the K row, once per row and variable)
    const xK = designK(ctx, v);
    countFallback = false;
    if (xK) addGram(stratumKey('K', v, ctx.bin, ctx.clsK), xK.length, xK, y, ctx, (y - ctx.k[v]) ** 2, null);
    // form P
    const src = ctx.p[v];
    const x = designP(ctx, v);
    if (x) {
      const cls = ctx.clsP(v);
      const extra = src.map((s) => [`src:${s.sid}`, (y - s.yA) ** 2]);
      addGram(stratumKey('P', v, ctx.bin, cls), x.length, x, y, ctx, (y - ctx.pBase[v]) ** 2, extra);
      const ek = `${v}|${ctx.bin}|${cls}`;
      let em = errStats.get(ek); if (!em) { em = new Map(); errStats.set(ek, em); }
      let es = em.get(foldOf(ctx)); if (!es) { es = new ErrorStats(src.length); em.set(foldOf(ctx), es); }
      es.add(new Float64Array(src.map((s) => y - s.yA)));
    }
    countFallback = true;
    if (v === 'precip' && ctx.y.wet != null) {
      for (const [form, cls] of [['K', ctx.clsK], ['P', ctx.clsP('precip')]]) {
        if (form === 'K' ? ctx.k.precip == null : !ctx.p.precip) continue;
        const key = stratumKey(form, 'precip', ctx.bin, cls);
        let w = wetCount.get(key); if (!w) { w = { n: 0, wet: 0 }; wetCount.set(key, w); }
        w.n += 1; w.wet += ctx.y.wet;
      }
    }
  }
  countFallback = false;
}, { select: strideSelect });

// ── solve the mean model ───────────────────────────────────────────────────────
const tables = newTables(new Date().toISOString());
tables.inputs = { featuresHash, casesCodeHash: files[0].meta?.counters ? null : null, caseFiles: files.length, rows: statsA.rows, months: [...new Set(files.map((f) => f.month))].sort(), regions: [...regions].sort(), ...(folds === 'half' ? { foldScheme: 'half' } : {}) };
// phase FX (C1): the ρ_f target per (var, bin) from the pass-A accumulator — clipped to [0,05; 1]; without evidence the target stays 1 (named)
const rhoUsed = {}, rhoMissing = [];
const rhoOf = (v, bin) => {
  if (!rhoTargetOn) return null;
  const r = rhoF.get(`${v}|${bin}`);
  const rho = r && r.n > 100 && r.aa > 0 && r.bb > 0 ? Math.min(1, Math.max(0.05, r.ab / Math.sqrt(r.aa * r.bb))) : null;
  if (rho == null) { rhoMissing.push(`${v}|${bin}`); return null; }
  rhoUsed[`${v}|${bin}`] = Math.round(rho * 1e4) / 1e4;
  return rhoUsed[`${v}|${bin}`];
};
// phase FX-5: a variable outside `--climaVars` gets the plain options (no column, no ρ target, no probe) — the fusionFit@3 stratum, byte for byte
const meanOpts = (v, bin) => (climaVars && climaVarOf(v) === 'none' ? {} : { ...(climaCols === 'station' ? { clima: 'station' } : {}), ...(rhoTargetOn ? { rhoTarget: rhoOf(v, bin) } : {}), ...(rhoMode === 'cv' ? { rhoSelect: 'cv' } : {}) });
const rhoChosen = new Map();   // `${form}|${bin}` → { rho, one } (cv mode: how many strata chose the ρ_f target / today's)
const foldBeta = new Map();   // stratum → Map<time key, beta> (β of the fold WITHOUT that month/half-month and its neighbours)
let written = 0, tooShort = 0;
for (const [key, g] of grams) {
  const { form, v, bin, cls } = parseStratum(key);
  // the Σ prior of form P: pooled over months (the fold-out version would need one prior per fold — noted as V-FL-9)
  let err = null;
  if (form === 'P') { const em = errStats.get(`${v}|${bin}|${cls}`); if (em) { for (const es of em.values()) { if (!err) err = new ErrorStats(es.k); err.merge(es); } } }
  // each axis map holds every row once — never merge them into one map (V-FL-21: the other axes leak the held-out rows)
  const opts = meanOpts(v, bin);
  const entry = fitStratum(form, v, bin, cls, { month: g.month, region: g.region, band: g.band }, err, 'base', nmin, opts);
  tables.mean[key] = entry;
  if (entry.status === 'written' || entry.status === 'no-skill') {
    if (entry.status === 'written') written += 1; else tooShort += 1;
    // β per held-out time key (month or half-month) for the out-of-fold residuals of pass B (also for `no-skill`: the variance model still needs residuals)
    const months = [...g.month.keys()].map((k) => k.split('|')[0]).sort();
    const all = Gram.sum(g.month.values(), g.p);
    const penalty = variancePenalty(all);
    // the same target `fitStratum` used (one definition, `fitMean.ts ridgeTarget`) — in cv mode the CHOSEN one (1 = today's ⇒ rhoTarget null)
    const chosenOpts = entry.rhoTargetChosen != null ? { ...opts, rhoTarget: entry.rhoTargetChosen === 1 ? null : entry.rhoTargetChosen } : opts;
    const target = ridgeTarget(form, cls, g.p, entry.prior, chosenOpts);
    if (entry.rhoTargetChosen != null) { const ck = `${form}|${bin}`; let c = rhoChosen.get(ck); if (!c) { c = { rho: 0, one: 0 }; rhoChosen.set(ck, c); } if (entry.rhoTargetChosen === 1) c.one += 1; else c.rho += 1; }
    const fb = new Map();
    for (const f of timeFolds(months)) {
      const train = new Gram(g.p);
      for (const [k, gr] of g.month) { const m = k.split('|')[0]; if (!f.held.includes(m) && !f.purged.includes(m)) train.merge(gr); }
      const r = train.n >= 2 * g.p ? ridge(train, entry.lambda, penalty, target) : null;
      fb.set(f.held[0], r ? r.beta : new Float64Array(entry.beta));
    }
    foldBeta.set(key, fb);
    // persisted for the scorer: β of the fold WITHOUT a time key (and its neighbours) — the out-of-sample coefficients, keyed by the held month/half-month
    entry.folds = Object.fromEntries([...fb.entries()].map(([m, b]) => [m, Array.from(b).map((x) => Math.round(x * 1e6) / 1e6)]));
  } else tooShort += 1;
}
say(`Mittelwertmodell (Zeitfalten: ${folds}): ${written} Strata geschrieben, ${tooShort} zu kurz oder ohne CV-Gewinn (${Object.values(tables.mean).filter((e) => e.status === 'no-skill').length} no-skill)`);
// free the mean grams
grams.clear();

// ── pass B: variance, amount, hurdle reservoir ───────────────────────────────
const vGrams = new Map(), aGrams = new Map();
const gramOf = (map, key, p) => { let g = map.get(key); if (!g) { g = new Gram(p); map.set(key, g); } return g; };
const muOf = (key, ctx, x) => {
  const fb = foldBeta.get(key); if (!fb) return null;
  const beta = fb.get(foldOf(ctx)) ?? tables.mean[key]?.beta; if (!beta) return null;
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
      const x = ctx.y[v] != null ? designK(ctx, v) : null;
      const mu = x ? muOf(stratumKey('K', v, ctx.bin, ctx.clsK), ctx, x) : null;
      e[v] = mu != null ? ctx.y[v] - mu : NaN;
    }
    if (ctx.leadH === 1) curAnchor = { p: ctx.pointIdx, s: ctx.slotAtH, e };
    else if (curAnchor && curAnchor.p === ctx.pointIdx && curAnchor.s === ctx.slotAtH) for (const v of ANCHOR_VARS) anchors[v].add(ctx.leadH, curAnchor.e[v], e[v]);
  }
  if (!full) return;
  for (const v of FIT_VARS) {
    const y = ctx.y[v]; if (y == null || v === 'precip') continue;
    const xK = designK(ctx, v);
    if (xK) {
      const key = stratumKey('K', v, ctx.bin, ctx.clsK);
      const mu = muOf(key, ctx, xK);
      if (mu != null) gramOf(vGrams, key, 9).add(varianceDesign(ctx.z, ctx.sigDiv[v], ctx.sigEns[v]), (y - mu) ** 2, ctx.dayIdx);
    }
    const xP = designP(ctx, v);
    if (xP) {
      const key = stratumKey('P', v, ctx.bin, ctx.clsP(v));
      const mu = muOf(key, ctx, xP);
      if (mu != null) gramOf(vGrams, key, 9).add(varianceDesign(ctx.z, ctx.sigDiv[v], ctx.sigEns[v]), (y - mu) ** 2, ctx.dayIdx);
    }
  }
  // the hurdle reservoir and the amount regression share this pass (the hurdle needs the cube's dry probability, V-FL-18)
  if (ctx.y.wet != null && ctx.pDryCube != null) {
    for (const [form, cls, pMean, wetShare] of [['K', ctx.clsK, ctx.k.precip, ctx.wetShareK], ['P', ctx.clsP('precip'), ctx.pBase.precip, ctx.wetShareP]]) {
      if (pMean == null) continue;
      const key = stratumKey(form, 'precip', ctx.bin, cls);
      hurdleOf(key).add(occurrenceDesign(ctx.z, Math.expm1(pMean), wetShare, ctx.sigDiv.precip, ctx.pDryCube), ctx.y.wet, foldOf(ctx), ctx.pDryCube, ctx.dayIdx);
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
    say(`Hürde ${key}: ${r.n} von ${r.offered} Zeilen (Reservoir, ${r.months.length} Zeitgruppen ${folds}), ${e.iterations} Newton-Schritte, ${e.status}${e.cv ? `, oof Brier ${e.cv.brier} gegen Cube ${e.cv.brierCube} (n ${e.cv.n}, ${e.cv.folds} Falten)` : ''}`);
  }
  say(`Hürde: ${hurdle.size} Strata in ${Math.round((Date.now() - T1) / 1000)} s`);
  hurdle.clear();
}

// ── pass E (fusionFit@3): σ scale per CRPS (V-FL-15), speed law (V-FL-22) — out of fold ──
const scaleAcc = new Map();    // stratum (t/td/gust/clct) → ScaleAcc
const speedAcc = new Map();    // `${form}|ws|${bin}|${cls}` (phase FX bands: `…|${band}`) → SpeedAcc
const accOf = (map, key, mk) => { let a = map.get(key); if (!a) { a = mk(); map.set(key, a); } return a; };
const SCALED_VARS = SCALE_VARS_DEFAULT;   // the search runs for all four; `--scaleVars` only rules what is WRITTEN (V-FX-7)
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
    const design = (v) => (form === 'K' ? designK(ctx, v) : designP(ctx, v));
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
      accOf(scaleAcc, key, () => new ScaleAcc()).add(foldOf(ctx), crpsK, outerK);
    }
    // speed law: the Rice of the out-of-fold u/v model against the observed speed
    if (ctx.y.ff != null) {
      const xu = design('u'), xv = design('v');
      if (xu && xv) {
        const cu = cls('u');
        const mu = muSigmaOf(stratumKey(form, 'u', ctx.bin, cu), ctx, xu, 'u'), mv = muSigmaOf(stratumKey(form, 'v', ctx.bin, cls('v')), ctx, xv, 'v');
        if (mu && mv) {
          const nu = Math.hypot(mu.mu, mv.mu), sig = Math.sqrt(0.5 * (mu.sigma ** 2 + mv.sigma ** 2));
          const key = `${form}|ws|${ctx.bin}|${cu}`;
          accOf(speedAcc, key, () => new SpeedAcc(speedGrid)).add(foldOf(ctx), ctx.dayIdx, ctx.y.ff, nu, sig, speedSample(ctx));
          // phase FX (A1 band verdict): the same rows once more per height band (no LN subsample for the band entries)
          if (speedBands) accOf(speedAcc, `${key}|${ctx.site.band}`, () => new SpeedAcc(speedGrid)).add(foldOf(ctx), ctx.dayIdx, ctx.y.ff, nu, sig, false);
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
  // the write rule (`fitScale.ts scaleForVar`): clouds always, the others only where they win out of fold, outside `--scaleVars` always 1
  const vars = scaleVars ?? SCALE_VARS_DEFAULT;
  const k = scaleForVar(v, cv, vars);
  const why = !vars.includes(v) ? 'Regel: 1' : v === 'clct' ? 'Pflicht' : cv.winsOof ? 'gewinnt' : 'bleibt 1';
  tables.variance[key] = { ...ve, scale: k, scaleCv: cv };
  scaleReport.push(`${key.padEnd(24)} k ${String(cv.k).padEnd(4)} ${why} · oof CRPS ${cv.oof ? `${cv.oof.crpsBase.toFixed(4)} → ${cv.oof.crps.toFixed(4)} (${(100 * (cv.oof.crps / cv.oof.crpsBase - 1)).toFixed(2)} %)` : '—'} · PIT-Rand ${cv.oof ? `${cv.oof.pitOuterBase.toFixed(3)} → ${cv.oof.pitOuter.toFixed(3)}` : '—'} · n ${cv.oof?.n ?? 0}`);
}
// speed law: pooled strata first (as before), then (phase FX) the band entries with the pooled law scored on their rows for the report
const speedKeys = [...speedAcc.keys()].sort((a, b) => a.split('|').length - b.split('|').length);
for (const key of speedKeys) {
  const acc = speedAcc.get(key);
  const parts = key.split('|');
  const { form, bin, cls } = parseStratum(key);
  if (parts.length === 4) { tables.speed[key] = fitSpeedStratum(form, bin, cls, acc, nmin); continue; }
  // the pooled stratum's triple (also a `no-skill` one — the report asks band law against pooled law, the status is printed alongside)
  const pooled = tables.speed[parts.slice(0, 4).join('|')];
  const pooledLaw = pooled && pooled.status !== 'too-short' ? { law: pooled.law ?? 'add', a: pooled.a, b: pooled.b, c: pooled.c } : null;
  tables.speed[key] = fitSpeedStratum(form, bin, cls, acc, nmin, { band: parts[4], pooledLaw });
}

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
// phase FX stage 2: every table field and note of the new flags only where the flag is on (the default fit stays byte-identical)
if (climaCols === 'station') {
  tables.design.mean = { ...tables.design.mean, clima: 'station', ...(climaVars ? { climaVars } : {}) };
  tables.inputs.climaFallback = climaFallback;
  if (climaVars) { tables.inputs.climaVars = climaVars; tables.notes.push(`Phase FX-5 (E-FX-8, §6.5) — μ_c-Spalte, ρ_f-Ziel und cv-Probe NUR für ${climaVars.join(', ')} (design.mean.climaVars); die übrigen Größen tragen das none-Design und das fusionFit@3-Ziel — ihre Mittelwert- und Varianz-Strata sind byte-gleich zu einem Fit ohne --climaCols (Negativkontrolle des Schalters)`); }
  if (climaShuffle) tables.inputs.climaShuffle = true;
  if (climaMu) {
    // phase FX-4: the estimates the column and ρ_f used — μ only, per station and variable (the scorer rebuilds the same μ_c)
    const byPoint = {};
    for (const [id, byVar] of Object.entries(climaMu.byPoint)) { const o = {}; for (const [v, e] of Object.entries(byVar)) if (e && e.status === 'written' && Array.isArray(e.mu) && e.mu.length) o[v] = e.mu; if (Object.keys(o).length) byPoint[id] = o; }
    tables.climaMu = { estimator: climaMu.loso?.estimator ?? null, candidate: climaMu.loso?.candidate ?? null, trendSet: climaMu.loso?.trendSet ?? null, source: { path: climaMuPath, sha256: climaMuSha }, byPoint };
    tables.inputs.climaMu = { path: climaMuPath, sha256: climaMuSha, candidate: climaMu.loso?.candidate ?? null, estimator: climaMu.loso?.estimator ?? null, trendSet: climaMu.loso?.trendSet ?? null, stations: Object.keys(byPoint).length };
    tables.notes.push(`Phase FX-4 (§6.4) — μ_c-Spalte UND ρ_f aus dem GESCHÄTZTEN μ_c (Leave-Station-out, Kandidat ${climaMu.loso?.candidate ?? '?'}, Schätzer ${JSON.stringify(climaMu.loso?.estimator ?? null)}, Trendmerkmale ${climaMu.loso?.trendSet ?? '—'}; ${climaMuPath}, sha256 ${String(climaMuSha).slice(0, 12)}); tables.clima und der Kandidat clima bleiben die Stationsklimatologie; tables.climaMu trägt die Schätzungen je Station (der Scorer liest dieselbe Definition)`);
  }
  tables.notes.push(`Phase FX (C1, V-FX-5) — Spalte μ_c (Stationsklimatologie byPoint, Rückfall gepoolt Band|Land) als LETZTE Spalte des Mittelwert-Designs beider Formen (Durchläufe A/B/E); ohne μ_c keine Designzeile für die Größe; Rückfall-Zeilen je Größe in inputs.climaFallback${climaShuffle ? '; NEGATIVKONTROLLE: μ_c des Nachbarpunkts (pointIdx + 1, Wrap-around, an dessen Länge ausgewertet) — inputs.climaShuffle' : ''}`);
}
if (rhoTargetOn) {
  tables.inputs.rhoTarget = rhoUsed;
  tables.notes.push(`Phase FX (C1, V-FX-5) — Ridge-Ziel je (Größe, Bin): β_ȳ = ρ_f (Form K) bzw. w_m·ρ_f (Form P) und β_μc = 1 − ρ_f (nur mit μ_c-Spalte), ρ_f aus dem Durchlauf-A-Akkumulator (Korrelation der Anomalien von Cube-Member und Wahrheit gegen die Klimatologie), geklemmt auf [0,05; 1] — inputs.rhoTarget${rhoMissing.length ? `; ohne Beleg (Ziel 1 wie bisher): ${[...new Set(rhoMissing)].join(', ')}` : ''}${rhoMode === 'cv' ? '; MODUS cv: je Stratum beide Ziele (heutiges β_ȳ = 1 / μ_c 0 und ρ_f) mit je eigener λ-Wahl, geschrieben das mit dem kleineren Out-of-fold-MSE je Zeile (Gleichstand: heutiges) — MeanEntry.rhoTargetChosen (1 = heutiges) und rhoTargetCv {one, rho}; die Falten-β nehmen das gewählte Ziel; inputs.rhoChosen zählt je Form|Bin' : ''}`);
  if (rhoMode === 'cv') tables.inputs.rhoChosen = Object.fromEntries([...rhoChosen.entries()].sort());
}
if (speedGrid !== 'v3') tables.notes.push(`Phase FX (A1, V-FX-6) — Speed-EMOS auf dem geöffneten Gitter ${speedGrid} (a −1,8…+0,6 × b 0,7…1,45 × c 0,8…1,7, 324 Tripel) plus zweite Familie sd: TN(a·sd_Rice + b·E_Rice, c·sd_Rice) (a −1,8…+0,3, 288 Tripel); je Familie bestes Tripel auf allen Zeitgruppen und out of fold, geschrieben wird die Familie mit dem kleineren oof-CRPS (Gleichstand add), no-skill wenn keine die Rice schlägt; Einträge tragen law/grid/edge (edge = Parameter am Gitterrand)`);
if (speedBands) tables.notes.push('Phase FX (A1 Band-Verdikt) — Speed-Gesetz zusätzlich je Höhenband < / ≥ 800 m (Schlüssel …|lt800 bzw. …|ge800, Feld band; gepoolte Einträge weiter geschrieben); cv.crpsPooledLaw = mittlerer CRPS der Bandzeilen am gepoolten Gesetz; predict nimmt mit bekanntem Band den geschriebenen Bandeintrag, der Client (ohne Band) den gepoolten');
if (scaleVars) { tables.inputs.scaleVars = scaleVars; tables.notes.push(`Phase FX (V-FX-7, E-FX-2) — σ-Skala nur für ${scaleVars.join(', ')} geschrieben (Bewölkung Pflicht, übrige nur bei oof-Gewinn); die anderen Größen tragen scale 1, der Suchbeleg scaleCv bleibt`); }
// phase FX (C8, V-FL-27): the half-month scheme is named in the notes only where it is on — a month fit stays byte-identical to fusionFit@3
if (folds === 'half') tables.notes.push('Phase FX (C8, V-FL-27) — Zeitfalten nach Halbmonaten: Gruppen YYYY-MMa (Tag ≤ 15) | YYYY-MMb, Purge ±1 Halbmonat = Lücke ≥ 13 Tage (Februar-Hälften 15 + 13/14 d, sonst ≥ 15 d; der Vorlauf reicht 14 d, nur an einer Februar-b-Hälfte kann ein Trainings-Lauf um einen Tag in die gehaltene Hälfte zurückreichen); λ-Wahl, Falten-β (mean/occurrence, Schlüssel = Halbmonat), no-skill-Regel, σ-Skala und Speed-Gesetz out of fold auf diesen Falten; der Scorer liest inputs.foldScheme und nimmt je ZEILE die β ohne ihre Halbmonatsgruppe');
// phase FV (V-FX-44): the thinning is named only where it is not the legacy rule — a default fit stays byte-identical
if (thin !== 'legacy') {
  tables.inputs.thin = { mode: thin, stride };
  tables.notes.push(`Phase FV (V-FX-44) — Zeilenauswahl ${thin}: mix32(validAtH, pointIdx) % ${stride} (scripts/fusionfit/lib/thin.mjs) statt (validAtH + pointIdx) % ${stride}; die alte Regel wählte bei t2/t3 PUNKTE aus (Stride 6: t3 65, t2 130 von 389 Stationen), die Hash-Auswahl nimmt jede Station in jeder Stufe mit gleichem Zeilenanteil (audit/fusion-validierung.md §1.3)`);
}
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
say(`Speed-EMOS je Stratum (V-FL-22; Gitter ${speedGrid}${speedBands ? ', Band-Verdikt' : ''}):`);
const pctOf = (a, b) => `${(100 * (b / a - 1)).toFixed(2)} %`;
for (const [key, e] of Object.entries(tables.speed).sort()) {
  if (!e.cv) continue;
  // family, triple, edge flags (a v3 entry carries no `edge`: computed here from the v3 axes for the report), oof Δ against the Rice; band entries also against the pooled law
  const law = e.law ?? 'add', edge = e.edge ?? speedEdge('v3', { law, a: e.a, b: e.b, c: e.c });
  const byLaw = e.cv.byLaw ? ' · je Familie ' + Object.entries(e.cv.byLaw).map(([l, x]) => `${l} (${x.a} ${x.b} ${x.c}${x.edge.length ? ` Rand ${x.edge.join('')}` : ''}) oof ${x.oof ? `${x.oof.crps.toFixed(4)} (${pctOf(x.oof.crpsRice, x.oof.crps)})` : '—'}`).join(' | ') : '';
  const vsPooled = e.band ? ` · gepooltes Gesetz auf den Bandzeilen ${e.cv.crpsPooledLaw == null ? '—' : `${e.cv.crpsPooledLaw.toFixed(4)} (in-sample TN ${e.cv.crpsTn.toFixed(4)}, ${pctOf(e.cv.crpsPooledLaw, e.cv.crpsTn)})`}` : '';
  say(`${key.padEnd(26)} n ${String(e.n).padStart(8)} ${law} a ${e.a} b ${e.b} c ${e.c}${edge.length ? ` Rand[${edge.join('')}]` : ''} ${e.status} · in-sample CRPS Rice ${e.cv.crpsRice.toFixed(4)} → TN ${e.cv.crpsTn.toFixed(4)} · oof ${e.cv.oof ? `${e.cv.oof.crpsRice.toFixed(4)} → ${e.cv.oof.crps.toFixed(4)} (${pctOf(e.cv.oof.crpsRice, e.cv.oof.crps)}) · PIT-Rand ${e.cv.oof.pitOuterRice.toFixed(3)} → ${e.cv.oof.pitOuter.toFixed(3)}` : '— (keine Falte)'}${byLaw}${vsPooled}${e.ln ? ` · LN (n ${e.ln.n}) CRPS ${e.ln.crps.toFixed(4)} PIT ${e.ln.pitOuter.toFixed(3)} gegen TN ${e.ln.crpsTn.toFixed(4)} / Rice ${e.ln.crpsRice.toFixed(4)}` : ''}`);
}
if (speedGrid !== 'v3') { const ks = Object.values(tables.speed).filter((e) => e.status !== 'too-short' && !e.band); say(`Gitterrand (${speedGrid}, gepoolte Strata): a am Rand in ${ks.filter((e) => e.edge?.includes('a')).length}/${ks.length}, b in ${ks.filter((e) => e.edge?.includes('b')).length}/${ks.length}, c in ${ks.filter((e) => e.edge?.includes('c')).length}/${ks.length}; Familie sd in ${ks.filter((e) => e.law === 'sd').length}/${ks.length}`); }
if (climaCols === 'station') say(`μ_c-Rückfall auf die gepoolte Klimatologie (Zeilen je Größe, Durchlauf A): ${JSON.stringify(climaFallback)}${climaShuffle ? ' — NEGATIVKONTROLLE (Nachbar-μ_c)' : ''}${climaVars ? ` — μ_c-Spalte nur für ${climaVars.join(',')}` : ''}`);
if (rhoTargetOn) say(`ρ_f-Ziele: ${Object.entries(rhoUsed).sort().map(([k, r]) => `${k} ${r}`).join(' · ')}${rhoMissing.length ? ` · ohne Beleg: ${[...new Set(rhoMissing)].join(', ')}` : ''}`);
if (rhoMode === 'cv') say(`ρ-Ziel per CV gewählt (Strata ρ_f / heutiges je Form|Bin): ${[...rhoChosen.entries()].sort().map(([k, c]) => `${k} ${c.rho}/${c.one}`).join(' · ')}`);
say('Hürde (V-FL-18):');
for (const [key, e] of Object.entries(tables.occurrence).sort()) say(`${key.padEnd(20)} n ${String(e.n).padStart(8)} ${e.status} · oof Brier ${e.cv ? `${e.cv.brier.toFixed(4)} gegen Cube ${e.cv.brierCube.toFixed(4)} (Skill ${e.cv.skill == null ? '—' : (100 * e.cv.skill).toFixed(1) + ' %'}, n ${e.cv.n})` : '— (keine Falte)'} · β_logitWetCube ${e.beta.length ? e.beta[e.beta.length - 1].toFixed(3) : '—'}`);
// a short skill table for the log: form × var × bin, time-fold MSE skill against the baseline
const lines = [];
for (const [key, e] of Object.entries(tables.mean)) if (e.status === 'written' && e.cv.time) lines.push(`${key.padEnd(28)} n ${String(e.n).padStart(8)} λ ${String(e.lambda).padStart(5)} skill time ${(e.cv.time.skill ?? NaN).toFixed(3)} region ${(e.cv.region?.skill ?? NaN).toFixed(3)} band ${(e.cv.band?.skill ?? NaN).toFixed(3)}`);
for (const l of lines.sort().slice(0, 80)) say(l);
if (errs.length) process.exitCode = 1;
