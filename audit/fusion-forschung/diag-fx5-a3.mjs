/**
 * diag-fx5-a3.mjs — the A3 measurement of phase FX-5 (E-FX-9; `audit/fusion-forschung.md` §6.5): does a climatology of the
 * cube's OWN wind per point (μ_c^mod — the model wind carries the exposure of the CELL and needs no station) carry the wind
 * in the anomaly form μ = μ_c + β(ȳ − μ_c) where the station climatology cannot (V-FX-29/37)? Fit side only — no producer,
 * no engine, no table written for the client.
 *
 * Three passes over the case files (`cases/v1/<month>/<tier>.cas.gz`):
 *   1  the 13-coefficient climatology (`fitClima.ts C_NAMES`) of the cube member u/v/gust per (point, tier) and of the
 *      observed u/v/gust per point, accumulated per half-month group — LEAK RULE: the μ_c of a row is solved from the groups
 *      WITHOUT the row's own half-month and its neighbours (purge ±1, like the time folds), never from a climatology that
 *      contains the scored time;
 *   2  form-K mean design of u, v, gust per variant of the μ_c column — `none` (the Fit-5a design), `obs` (station climatology
 *      of `--clima`, 3,3 years, as Fit 5b — the upper bound, V-FX-21 leak named), `obs1y` (station climatology from THESE rows
 *      under the leak rule — same sample length as mod, separates exposure from record length), `est` (leave-station-out ridgeTx
 *      estimate of `--climaMu`, as Fit 5c — what the browser would get today), `mod` (μ_c^mod out of fold), `shuf` (μ_c^mod of
 *      the NEXT point at its longitude — the negative control); rows enter only where EVERY variant has a μ_c (identical rows);
 *      Gram groups per stratum × {half-month | region | band} as `fit.mjs` pass A, then `fitStratum` per variant with the
 *      Fit-5b options (ρ_f target from the pass-2 accumulator, cv probe) and the fold β per held group;
 *   3  the out-of-fold error per row from the fold β, per variant × variable × bin × layer (all, country, band, dnn:), with
 *      DM/BH on daily means of the squared errors against `none`; for the wind also the MAE of the vector speed |μ_u, μ_v|
 *      against ff (deterministic stand-in — no variance model, so no CRPS here).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-forschung/diag-fx5-a3.mjs
 *       [--clima=<root>\fit\2026-09-23\clima.hindcast.json] [--climaMu=<root>\fit\2026-09-26-fx4\clima.loso.ridgeTx.json]
 *       [--months=2025-09,2026-09] [--tiers=t1,t2,t3] [--stride=12] [--stride1=2] [--nmin=n,days] [--out=audit/fusion-forschung/diag-fx5-a3]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from 'file:///C:/dev/buscosun-web/scripts/hindcast/lib/common.mjs';
import { readCases } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, topTiles, ROW_COLUMNS } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/rowFeatures.mjs';
import { PairAcc, benjaminiHochberg } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/stats.mjs';
import { Gram, ridge, variancePenalty } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/gram.ts';
import { meanDesignK } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/design.ts';
import { fitStratum, ridgeTarget } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitMean.ts';
import { climaDesign, climaAt, C_DIM } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitClima.ts';
import { stratumKey, parseStratum, regionOf, timeFolds } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/strata.ts';
import { distKm } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/climaProduct.ts';

const T00 = Date.now();
const flags = parseArgs(process.argv.slice(2));
const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
const casesDir = join(root, 'cases', 'v1');
const featPath = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
const climaPath = typeof flags.clima === 'string' ? flags.clima : join(root, 'fit', '2026-09-23', 'clima.hindcast.json');
const climaMuPath = typeof flags.climaMu === 'string' ? flags.climaMu : join(root, 'fit', '2026-09-26-fx4', 'clima.loso.ridgeTx.json');
const outBase = typeof flags.out === 'string' ? flags.out : 'C:/dev/buscosun-web/audit/fusion-forschung/diag-fx5-a3';
const stride = Math.max(1, Number(flags.stride) || 12), stride1 = Math.max(1, Number(flags.stride1) || 2);
const tiers = flags.tiers ? String(flags.tiers).split(',') : ['t1', 't2', 't3'];
const monthRange = typeof flags.months === 'string' ? flags.months.split(',') : null;
const nmin = typeof flags.nmin === 'string' ? (([n, d]) => ({ n: Number(n), days: Number(d) }))(flags.nmin.split(',')) : undefined;
const CLIMA_MIN_N = Math.max(200, Number(flags.climaMinN) || 2000);
const say = (s) => console.log(`[a3] ${Math.round((Date.now() - T00) / 1000)}s ${s}`);
const VARS = ['u', 'v', 'gust'];
const VARIANTS = ['none', 'obs', 'obs1y', 'est', 'mod', 'shuf'];
const MU_VARIANTS = VARIANTS.slice(1);
const H = 3_600_000;

// ── inputs ─────────────────────────────────────────────────────────────────────
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const clima = JSON.parse(readFileSync(climaPath, 'utf8'));
const climaMu = JSON.parse(readFileSync(climaMuPath, 'utf8'));
if (clima.kind !== 'fusionfit/clima' || climaMu.kind !== 'fusionfit/clima') throw new Error('Klimatologiedokumente: kind');
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of tiers) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p }); }
}
if (!files.length) throw new Error('keine Falldateien');
say(`${files.length} Falldateien ${files[0].month}…${files[files.length - 1].month}, Stride ${stride} (Klimatologie-Durchlauf ${stride1}); Stationsklimatologie ${climaPath} (${sha(climaPath).slice(0, 12)}), Schätzung ${climaMuPath} (${climaMu.loso?.candidate ?? '?'}, ${sha(climaMuPath).slice(0, 12)})`);
let sites = null, regions = null, dnnKm = null, nextIdx = null;
const prepareSites = (header) => {
  if (sites) return;
  sites = header.points.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null));
  regions = topTiles(sites, 12);
  // d_nn per site (nearest OTHER station with a climatology entry — the scorer's definition) and the shuffle partner (next usable site)
  const pool = sites.map((s, i) => (s && clima.byPoint?.[s.id] ? { i, lat: feat.byPoint[s.id].lat, lon: feat.byPoint[s.id].lon, id: s.id } : null)).filter(Boolean);
  dnnKm = sites.map((s) => { if (!s) return null; const me = feat.byPoint[s.id]; let best = null; for (const o of pool) { if (o.id === s.id) continue; const d = distKm(me.lat, me.lon, o.lat, o.lon); if (best == null || d < best) best = d; } return best; });
  nextIdx = sites.map((s, i) => { if (!s) return null; for (let k = 1; k <= sites.length; k++) { const j = (i + k) % sites.length; if (sites[j]) return j; } return null; });
  say(`${sites.filter(Boolean).length} Punkte, Regionen ${[...regions].sort().join(' ')} + rest`);
};
const DNN_BINS = [[0, 10, '<10km'], [10, 20, '10-20km'], [20, 35, '20-35km'], [35, Infinity, '>35km']];
const dnnBinOf = (d) => (d == null ? null : DNN_BINS.find(([lo, hi]) => d >= lo && d < hi)[2]);
/**
 * Row thinning. NOT the `(validAtH + pointIdx) % stride` of fit.mjs/score.mjs: with 6-hourly t3 valid hours that rule keeps only the
 * points with pointIdx ≡ −validAtH (mod stride) — at stride 6 65 of 389 stations (t2: 130, t1: 259), measured 27.09.2026 (V-FX-44) — and
 * here it starved the mod/shuf variants of every 126–336 h row (the shuffle partner pointIdx + 1 never has t3 rows). A hash of both keys
 * thins in time AND keeps every point; deterministic.
 */
const mix32 = (a, b) => { let h = Math.imul(a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return h >>> 0; };
// a plain product/xor of the keys keeps their LOW bits (odd multipliers ⇒ parity) and collapses to a point selection again at stride 2/12 — the mixer above spreads every bit
const strideSelect = (i, b, s) => mix32(b.cols.validAtH[i], b.cols.pointIdx[i]) % s === 0;

async function pass(label, s, light, cb) {
  const T0 = Date.now(); let rows = 0, used = 0;
  for (const f of files) {
    const r = await readCases(f.path, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
      prepareSites(header);
      const b = prepareBatch(cols);
      for (let i = 0; i < n; i++) {
        rows += 1;
        if (!strideSelect(i, b, s)) continue;
        const ctx = rowContext(b, i, sites, light);
        if (!ctx) continue;
        used += 1; cb(ctx);
      }
    } });
    say(`${label}: ${f.month} ${f.tier} ${r.rows} Zeilen · ${Math.round((Date.now() - T0) / 1000)} s`);
  }
  say(`${label} fertig: ${rows} Zeilen, ${used} benutzt`);
  return { rows, used };
}

// ── pass 1: climatology grams of the cube member (per point × tier) and of the observations (per point), per half-month ──
const cg = new Map();   // `${pointIdx}|${tier|obs}|${var}` → Map<half, Gram(C_DIM)>
const gramOf = (key, half) => { let m = cg.get(key); if (!m) { m = new Map(); cg.set(key, m); } let g = m.get(half); if (!g) { g = new Gram(C_DIM); m.set(half, g); } return g; };
const cx = new Float64Array(C_DIM);
const p1 = await pass('1 Klimatologie', stride1, true, (ctx) => {
  climaDesign(ctx.validAtMs, ctx.site.site.lonDeg, cx);
  for (const v of VARS) {
    if (ctx.k[v] != null) gramOf(`${ctx.pointIdx}|${ctx.tier}|${v}`, ctx.half).add(cx, ctx.k[v], ctx.dayIdx);
    if (ctx.y[v] != null) gramOf(`${ctx.pointIdx}|obs|${v}`, ctx.half).add(cx, ctx.y[v], ctx.dayIdx);
  }
});
// solve: per series the β WITHOUT each half-month group (and its neighbours), plus the β on all groups (diagnostics only)
const penC = new Float64Array(C_DIM).fill(1); penC[0] = 0;
const climaBeta = new Map();   // key → { byHalf: Map<half, Float64Array>, all: Float64Array | null, n }
let seriesWritten = 0, seriesShort = 0;
for (const [key, byHalf] of cg) {
  const halves = [...byHalf.keys()].sort();
  const all = Gram.sum(byHalf.values(), C_DIM);
  const rAll = all.n >= CLIMA_MIN_N ? ridge(all, 1e-4, penC, null) : null;
  const out = { byHalf: new Map(), all: rAll ? rAll.beta : null, n: all.n, groups: halves.length };
  for (const f of timeFolds(halves)) {
    const train = new Gram(C_DIM);
    for (const [h, g] of byHalf) if (!f.held.includes(h) && !f.purged.includes(h)) train.merge(g);
    const r = train.n >= CLIMA_MIN_N ? ridge(train, 1e-4, penC, null) : null;
    if (r) out.byHalf.set(f.held[0], r.beta);
  }
  if (out.byHalf.size) seriesWritten += 1; else seriesShort += 1;
  climaBeta.set(key, out);
}
cg.clear();
say(`Klimatologien: ${seriesWritten} Reihen mit Falten-β (≥ ${CLIMA_MIN_N} Zeilen je Falte), ${seriesShort} zu kurz`);
// exposure diagnostic: across stations, the annual-mean speed of the model climatology against the observed one (all groups)
const expo = { n: 0, byTier: {} };
{
  for (const t of tiers) {
    const rows = [];
    for (let i = 0; i < sites.length; i++) {
      if (!sites[i]) continue;
      const mu = climaBeta.get(`${i}|${t}|u`)?.all, mv = climaBeta.get(`${i}|${t}|v`)?.all, ou = climaBeta.get(`${i}|obs|u`)?.all, ov = climaBeta.get(`${i}|obs|v`)?.all;
      if (!(mu && mv && ou && ov)) continue;
      rows.push({ band: sites[i].band, mod: Math.hypot(mu[0], mv[0]), obs: Math.hypot(ou[0], ov[0]), du: mu[0] - ou[0], dv: mv[0] - ov[0] });
    }
    const corr = (a, b) => { const n = a.length; if (n < 3) return null; const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null; };
    const rms = (a) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / Math.max(1, a.length));
    const sub = (rs) => ({ n: rs.length, corrSpeed: corr(rs.map((r) => r.mod), rs.map((r) => r.obs)), biasSpeed: rs.length ? rs.reduce((x, r) => x + r.mod - r.obs, 0) / rs.length : null, rmsDu: rms(rs.map((r) => r.du)), rmsDv: rms(rs.map((r) => r.dv)) });
    expo.byTier[t] = { all: sub(rows), lt800: sub(rows.filter((r) => r.band === 'lt800')), ge800: sub(rows.filter((r) => r.band === 'ge800')) };
  }
}
say(`Exposition (Jahresmittel |u,v| der Modellklimatologie gegen die Stationsklimatologie aus denselben Zeilen): ${JSON.stringify(expo.byTier)}`);

// ── the μ_c of a row per variant ───────────────────────────────────────────────
const cxRow = new Float64Array(C_DIM), cxNb = new Float64Array(C_DIM);
const entryOf = (doc, site, v) => { const own = doc.byPoint?.[site.id]?.[v]; if (own && own.status === 'written') return own; const pe = clima.pooled?.[`${site.band}|${site.country}`]?.[v]; return pe && pe.status === 'written' ? pe : null; };
const dotC = (b, x) => { let s = 0; for (let i = 0; i < C_DIM; i++) s += b[i] * x[i]; return s; };
const fallback = Object.fromEntries(MU_VARIANTS.map((k) => [k, 0]));
/** μ_c per variant for (ctx, v) or null when any variant lacks one (identical rows across variants). */
function muCOf(ctx, v) {
  climaDesign(ctx.validAtMs, ctx.site.site.lonDeg, cxRow);
  const eObs = entryOf(clima, ctx.site, v), eEst = entryOf(climaMu, ctx.site, v);
  if (!eObs || !eEst) return null;
  const b1 = climaBeta.get(`${ctx.pointIdx}|obs|${v}`)?.byHalf.get(ctx.half);
  const bm = climaBeta.get(`${ctx.pointIdx}|${ctx.tier}|${v}`)?.byHalf.get(ctx.half);
  const nb = nextIdx[ctx.pointIdx];
  const bs = nb != null ? climaBeta.get(`${nb}|${ctx.tier}|${v}`)?.byHalf.get(ctx.half) : null;
  if (!b1 || !bm || !bs) return null;
  climaDesign(ctx.validAtMs, sites[nb].site.lonDeg, cxNb);
  if (eObs === clima.pooled?.[`${ctx.site.band}|${ctx.site.country}`]?.[v]) fallback.obs += 1;
  if (eEst === clima.pooled?.[`${ctx.site.band}|${ctx.site.country}`]?.[v]) fallback.est += 1;
  return { obs: climaAt(eObs, cxRow).mu, obs1y: dotC(b1, cxRow), est: climaAt(eEst, cxRow).mu, mod: dotC(bm, cxRow), shuf: dotC(bs, cxNb) };
}

// ── pass 2: design grams per variant × stratum × axis, ρ_f per variant ─────────
const grams = new Map();   // `${variant}|${stratum}` → { p, month: Map, region: Map, band: Map }
const rhoF = new Map();    // `${variant}|${v}|${bin}` → { ab, aa, bb, n }
const addGram = (variant, key, x, y, ctx) => {
  const gk = `${variant}|${key}`;
  let g = grams.get(gk); if (!g) { g = { p: x.length, month: new Map(), region: new Map(), band: new Map() }; grams.set(gk, g); }
  const rg = regionOf(ctx.site.tile, regions);
  for (const [axis, k] of [['month', `${ctx.half}|*|*`], ['region', `*|${rg}|*`], ['band', `*|*|${ctx.site.band}`]]) {
    let gr = g[axis].get(k); if (!gr) { gr = new Gram(x.length); g[axis].set(k, gr); }
    gr.add(x, y, ctx.dayIdx); gr.addExtra('base', (y - ctx.k[v_cur]) ** 2);
  }
};
let v_cur = null, rowsUsed = 0;
await pass('2 Design', stride, false, (ctx) => {
  let any = false;
  for (const v of VARS) {
    const y = ctx.y[v]; if (y == null || ctx.k[v] == null) continue;
    const mu = muCOf(ctx, v); if (!mu) continue;
    v_cur = v; any = true;
    const key = stratumKey('K', v, ctx.bin, ctx.clsK);
    addGram('none', key, meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount), y, ctx);
    for (const w of MU_VARIANTS) {
      addGram(w, key, meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount, 'station', mu[w]), y, ctx);
      const rk = `${w}|${v}|${ctx.bin}`; let r = rhoF.get(rk); if (!r) { r = { ab: 0, aa: 0, bb: 0, n: 0 }; rhoF.set(rk, r); }
      const a = ctx.k[v] - mu[w], b = y - mu[w]; r.ab += a * b; r.aa += a * a; r.bb += b * b; r.n += 1;
    }
  }
  if (any) rowsUsed += 1;
});
say(`Durchlauf 2: ${rowsUsed} Zeilen mit allen Varianten; μ_c-Rückfall gepoolt ${JSON.stringify(fallback)}`);
const rhoOf = (w, v, bin) => { const r = rhoF.get(`${w}|${v}|${bin}`); return r && r.n > 100 && r.aa > 0 && r.bb > 0 ? Math.min(1, Math.max(0.05, r.ab / Math.sqrt(r.aa * r.bb))) : null; };
// solve per variant × stratum, fold β per held half-month
const entries = new Map(), foldBeta = new Map();
for (const [gk, g] of grams) {
  const [variant, ...rest] = gk.split('|'); const key = rest.join('|');
  const { v, bin, cls } = parseStratum(key);
  const opts = variant === 'none' ? {} : { clima: 'station', rhoTarget: rhoOf(variant, v, bin), rhoSelect: 'cv' };
  const e = fitStratum('K', v, bin, cls, { month: g.month, region: g.region, band: g.band }, null, 'base', nmin, opts);
  entries.set(gk, e);
  if (e.status === 'too-short') continue;
  const halves = [...g.month.keys()].map((k) => k.split('|')[0]).sort();
  const all = Gram.sum(g.month.values(), g.p), penalty = variancePenalty(all);
  const chosen = e.rhoTargetChosen != null ? { ...opts, rhoTarget: e.rhoTargetChosen === 1 ? null : e.rhoTargetChosen } : opts;
  const target = ridgeTarget('K', cls, g.p, e.prior, chosen);
  const fb = new Map();
  for (const f of timeFolds(halves)) {
    const train = new Gram(g.p);
    for (const [k, gr] of g.month) { const m = k.split('|')[0]; if (!f.held.includes(m) && !f.purged.includes(m)) train.merge(gr); }
    const r = train.n >= 2 * g.p ? ridge(train, e.lambda, penalty, target) : null;
    fb.set(f.held[0], r ? r.beta : Float64Array.from(e.beta));
  }
  foldBeta.set(gk, fb);
}
grams.clear();
say(`Mittelwertmodelle: ${[...entries.values()].filter((e) => e.status === 'written').length} geschrieben, ${[...entries.values()].filter((e) => e.status === 'no-skill').length} no-skill, ${[...entries.values()].filter((e) => e.status === 'too-short').length} zu kurz (über ${VARIANTS.length} Varianten)`);

// ── pass 3: out-of-fold error per row, per layer; DM against none ──────────────
const sq = new Map();     // `${variant}|${v}|${bin}|${layer}` → { n, sse, sae }
const pairs = new Map();  // `${variant}|${v}|${bin}|${layer}` → PairAcc (squared error variant vs none; speed: abs error)
const accOf = (map, key, mk) => { let a = map.get(key); if (!a) { a = mk(); map.set(key, a); } return a; };
const muOof = (variant, key, ctx, x) => { const fb = foldBeta.get(`${variant}|${key}`); if (!fb) return null; const beta = fb.get(ctx.half); if (!beta) return null; let s = 0; for (let i = 0; i < beta.length; i++) s += beta[i] * x[i]; return s; };
await pass('3 Out-of-fold', stride, false, (ctx) => {
  const dnn = dnnKm ? dnnBinOf(dnnKm[ctx.pointIdx]) : null;
  const layers = ['all', `country:${ctx.site.country}`, `band:${ctx.site.band}`, `route:r${ctx.route}`, ...(dnn ? [`dnn:${dnn}`] : [])];
  const muUV = {};   // variant → { u, v } for the speed
  for (const v of VARS) {
    const y = ctx.y[v]; if (y == null || ctx.k[v] == null) continue;
    const mu = muCOf(ctx, v); if (!mu) continue;
    const key = stratumKey('K', v, ctx.bin, ctx.clsK);
    const x0 = meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount);
    const err = { cube: ctx.k[v] - y };
    const m0 = muOof('none', key, ctx, x0); if (m0 == null) continue;
    err.none = m0 - y;
    for (const w of MU_VARIANTS) { const m = muOof(w, key, ctx, meanDesignK(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount, 'station', mu[w])); if (m == null) { err.none = undefined; break; } err[w] = m - y; (muUV[w] ??= {})[v] = m; }
    if (err.none === undefined) continue;
    (muUV.none ??= {})[v] = m0; (muUV.cube ??= {})[v] = ctx.k[v];
    for (const [w, e] of Object.entries(err)) for (const L of layers) { const a = accOf(sq, `${w}|${v}|${ctx.bin}|${L}`, () => ({ n: 0, sse: 0, sae: 0 })); a.n += 1; a.sse += e * e; a.sae += Math.abs(e); if (w !== 'none') accOf(pairs, `${w}|${v}|${ctx.bin}|${L}`, () => new PairAcc()).add(ctx.dayIdx, e * e, err.none * err.none); }
  }
  // the vector speed against ff where u and v were both predicted by every variant
  if (ctx.y.ff != null && muUV.none?.u != null && muUV.none?.v != null) {
    const spd = {}; for (const w of ['cube', 'none', ...MU_VARIANTS]) { const m = muUV[w]; if (m?.u == null || m?.v == null) return; spd[w] = Math.hypot(m.u, m.v); }
    for (const [w, s] of Object.entries(spd)) for (const L of layers) { if (w === 'none') { const e0 = s - ctx.y.ff; const a0 = accOf(sq, `${w}|ws|${ctx.bin}|${L}`, () => ({ n: 0, sse: 0, sae: 0 })); a0.n += 1; a0.sse += e0 * e0; a0.sae += Math.abs(e0); continue; } const e = s - ctx.y.ff; const a = accOf(sq, `${w}|ws|${ctx.bin}|${L}`, () => ({ n: 0, sse: 0, sae: 0 })); a.n += 1; a.sse += e * e; a.sae += Math.abs(e); accOf(pairs, `${w}|ws|${ctx.bin}|${L}`, () => new PairAcc()).add(ctx.dayIdx, Math.abs(e), Math.abs(spd.none - ctx.y.ff)); }
  }
});
// summaries + BH over all DM tests
const cells = {}, pairSum = {};
for (const [k, a] of sq) cells[k] = { n: a.n, mse: a.sse / a.n, mae: a.sae / a.n };
const pk = [], pv = [];
for (const [k, a] of pairs) { const s = a.summary(); if (!s) continue; pairSum[k] = s; if (Number.isFinite(s.dm?.p)) { pk.push(k); pv.push(s.dm.p); } }
const adj = benjaminiHochberg(pv); pk.forEach((k, i) => { pairSum[k].dm.pAdj = adj[i]; });

// ── report ─────────────────────────────────────────────────────────────────────
const BIN = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const f = (x, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const skillCell = (w, v, bin, L) => { const p = pairSum[`${w}|${v}|${bin}|${L}`]; if (!p) return '—'; const s = 100 * p.skill; return `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(1)} %${p.dm.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''}`; };
const md = [`# diag-fx5-a3 — A3: Klimatologie des Cube-Windes als μ_c-Spalte (E-FX-9), ${new Date().toISOString().slice(0, 16)}Z`, '',
  `Fallzeilen ${files[0].month}…${files[files.length - 1].month} (${files.length} Dateien, Stride ${stride}; Klimatologie-Durchlauf Stride ${stride1}, ${p1.used} Zeilen), ${rowsUsed} Zeilen mit allen sechs Varianten, codeHash ${codeHash()}. Stationsklimatologie \`${climaPath}\` (${sha(climaPath).slice(0, 12)}), Schätzung \`${climaMuPath}\` (Kandidat ${climaMu.loso?.candidate ?? '?'}). Klimatologiereihen (Punkt × Stufe|obs × Größe) mit Falten-β: ${seriesWritten}, zu kurz ${seriesShort} (≥ ${CLIMA_MIN_N} Zeilen je Falte). μ_c-Rückfall gepoolt: ${JSON.stringify(fallback)}.`, '',
  '**Leck-Regel:** μ_c^mod und obs1y einer Zeile aus den Halbmonatsgruppen OHNE die eigene Gruppe und ihre Nachbarn (Purge ±1); Zeitfalten des Mittelwertmodells ebenso (half). `obs` = Stationsklimatologie 3,3 Jahre inkl. Fenster (V-FX-21, Oberschranke); `est` = ridgeTx Leave-Station-out (= Fit 5c); `mod` = Cube-Member-Klimatologie je (Punkt, Stufe) out of fold; `shuf` = μ_c^mod des Nachbarpunkts an dessen Länge (Negativkontrolle); `cube` = das rohe Member (kein Fit). Maß: Out-of-fold-MSE je Komponente (Skill = 1 − MSE/MSE_none, DM/BH auf Tagesmitteln der quadrierten Fehler; * signifikant besser, ! schlechter); Wind (ws) = MAE der Vektor-Geschwindigkeit |μ_u, μ_v| gegen ff (deterministischer Stellvertreter).', '',
  '**Datengrenzen:** 13 Monate Fallzeilen ⇒ Jahresharmonische von obs1y/mod aus ≈ 11,5 Monaten je Falte, mit der Anomalie dieses Jahres; Lauf-Route t1 nur 2026-06…09; Bins 0–2 = t1 (Routen run/day0), Bins 3–5 = t2/t3 (dyn); alle Punkte sind Stationspunkte — `mod` liest keine Station, `dnn:` sagt, was ein stationsferner Punkt bekommt.', '',
  `**Exposition der Modellklimatologie (Jahresmittel |u,v| aus allen Gruppen, Punkte mit beiden Reihen):** ${Object.entries(expo.byTier).map(([t, e]) => `${t}: n ${e.all.n}, corr(Speed mod, obs) ${f(e.all.corrSpeed, 2)} (< 800 m ${f(e.lt800.corrSpeed, 2)}, ≥ 800 m ${f(e.ge800.corrSpeed, 2)}), Bias mod − obs ${f(e.all.biasSpeed, 2)} m/s, RMS Δu/Δv ${f(e.all.rmsDu, 2)}/${f(e.all.rmsDv, 2)}`).join(' · ')}`, ''];
md.push('## Schicht `all` — Out-of-fold-MSE (u, v, Böe) bzw. MAE (Wind) je Bin und Variante; Skill gegen `none`', '', '| Größe · Bin | n | cube | none | obs | obs1y | est | mod | shuf |', '|---|---|---|---|---|---|---|---|---|');
for (const v of ['u', 'v', 'gust', 'ws']) for (let b = 0; b < 6; b++) {
  const c0 = cells[`none|${v}|${b}|all`]; if (!c0) continue;
  const val = (w) => { const c = cells[`${w}|${v}|${b}|all`]; if (!c) return '—'; const m = v === 'ws' ? c.mae : c.mse; return w === 'none' ? f(m) : `${f(m)} (${skillCell(w, v, b, 'all')})`; };
  md.push(`| ${v} · ${BIN[b]} | ${c0.n} | ${val('cube')} | ${val('none')} | ${val('obs')} | ${val('obs1y')} | ${val('est')} | ${val('mod')} | ${val('shuf')} |`);
}
md.push('', '## Schichten — Skill gegen `none` je Variante (u, v, Böe, Wind), Bins 51–120 / 126–240 / 246–336 h', '');
const LAYERS = ['country:DE', 'country:AT', 'country:CH', 'band:lt800', 'band:ge800', 'dnn:<10km', 'dnn:10-20km', 'dnn:20-35km', 'dnn:>35km'];
for (const w of MU_VARIANTS) {
  md.push(`### ${w}`, '', `| Größe · Bin | ${LAYERS.join(' | ')} |`, `|---|${LAYERS.map(() => '---').join('|')}|`);
  for (const v of ['u', 'v', 'gust', 'ws']) for (const b of [3, 4, 5]) { if (!cells[`none|${v}|${b}|all`]) continue; md.push(`| ${v} · ${BIN[b]} | ${LAYERS.map((L) => { const p = pairSum[`${w}|${v}|${b}|${L}`]; return p ? `${skillCell(w, v, b, L)} (n ${p.n})` : '—'; }).join(' | ')} |`); }
  md.push('');
}
// ρ_f and chosen targets per variant
md.push('## ρ_f je Variante (Korrelation der Anomalien Member/Wahrheit gegen die Klimatologie) und gewählte Ziele', '', '| Variante · Größe | ' + BIN.join(' | ') + ' |', '|---|' + BIN.map(() => '---').join('|') + '|');
for (const w of MU_VARIANTS) for (const v of VARS) md.push(`| ${w} · ${v} | ${BIN.map((_, b) => { const r = rhoOf(w, v, b); const es = [...entries.entries()].filter(([k]) => k.startsWith(`${w}|K|${v}|${b}|`)).map(([, e]) => e); const ch = es.filter((e) => e.rhoTargetChosen != null); return r == null ? '—' : `${f(r, 2)} (ρ-Ziel ${ch.filter((e) => e.rhoTargetChosen !== 1).length}/${ch.length}, β_μc ${es.filter((e) => e.status === 'written').map((e) => f(e.beta[e.beta.length - 1], 2)).join('/') || '—'})`; }).join(' | ')} |`);
md.push('');
const doc = { builtAt: new Date().toISOString(), codeHash: codeHash(), inputs: { files: files.length, months: [...new Set(files.map((x) => x.month))], stride, stride1, rowsUsed, climaRows: p1.used, clima: { path: climaPath, sha256: sha(climaPath) }, climaMu: { path: climaMuPath, sha256: sha(climaMuPath), candidate: climaMu.loso?.candidate ?? null }, climaMinN: CLIMA_MIN_N, seriesWritten, seriesShort, fallback }, exposure: expo.byTier, rhoF: Object.fromEntries([...rhoF.keys()].map((k) => { const [w, v, b] = k.split('|'); return [k, rhoOf(w, v, Number(b))]; })), entries: Object.fromEntries([...entries.entries()].map(([k, e]) => [k, { status: e.status, n: e.n, lambda: e.lambda, cv: e.cv, rhoTargetChosen: e.rhoTargetChosen ?? null, betaMu: e.status === 'written' && k.split('|')[0] !== 'none' ? e.beta[e.beta.length - 1] : null }])), cells, pairs: pairSum };
writeFileSync(`${outBase}.json`, JSON.stringify(doc));
writeFileSync(`${outBase}.md`, md.join('\n'));
console.log(md.join('\n'));
say(`geschrieben ${outBase}.{json,md}: ${Object.keys(cells).length} Zellen, ${pk.length} DM-Tests`);
