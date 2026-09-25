/**
 * diag-fl2.mjs — diagnostics for the next iteration of the learning stage (phase FL). Out-of-fold measurements on
 * the case files of what the open sketches would bring:
 *   (1) V-FL-23: the point climatology μ_c (own series / pooled band|country) as a column of the form-K mean design;
 *   (2) site × diurnal interactions in the mean design;
 *   (3) V-FL-22: wind speed family — Rice σ-scale vs truncated normal (closed-form CRPS), PIT outer share;
 *   (4) V-FL-15: cloud cover — σ-scale of the censored normal, atom shares;
 *   (5) V-FL-18: precipitation — Brier of the learned occurrence vs the engine's hurdle, cross-combinations.
 * Read-only on the hindcast; writes a JSON report into the scratchpad.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCases } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, topTiles, ROW_COLUMNS } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/rowFeatures.mjs';
import { crpsByCdf } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/stats.mjs';
import { Gram, chooseLambda, variancePenalty } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/gram.ts';
import { meanDesignK } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/design.ts';
import { LAMBDAS } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitMean.ts';
import { climaDesign, climaAt, C_DIM } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitClima.ts';
import { stratumKey, foldsOverGroups, regionOf, STRATUM_MIN } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/strata.ts';
import { Z_DIM, Z_INDEX } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/features.ts';
import { predict } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/predict.ts';
import { cdfOf, meanOf, pitOf, crpsOf, Phi } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/dist.ts';

const root = 'C:\\dev\\buscosun-hindcast';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const strideG = Number(args.stride) || 6;        // Gram rows
const strideS = Number(args.strideS) || 24;      // stored rows for the shape tests
const outPath = args.out ?? join(process.env.TEMP ?? '.', 'diag-fl2.json');
const tables = JSON.parse(readFileSync(join(root, 'fit', '2026-09-24', 'fusion.hindcast.json'), 'utf8'));
const feat = JSON.parse(readFileSync(join(root, 'features', 'points.v1.json'), 'utf8'));
const casesDir = join(root, 'cases', 'v1');
const monthRange = typeof args.months === 'string' ? args.months.split(',') : null;
const say = (s) => console.log(`[diag] ${new Date().toISOString().slice(11, 19)} ${s}`);
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of ['t1', 't2', 't3']) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p }); }
}
let sites = null, regions = null;
const foldTablesCache = new Map();
const tablesForMonth = (month) => {
  if (foldTablesCache.has(month)) return foldTablesCache.get(month);
  const mean = {};
  for (const [k, e] of Object.entries(tables.mean)) mean[k] = e.folds?.[month] ? { ...e, beta: e.folds[month] } : e;
  const t = { ...tables, mean }; foldTablesCache.set(month, t); return t;
};
const cx = new Float64Array(C_DIM);
const climaPt = (site, v) => { const e = tables.clima?.byPoint?.[site.id]?.[v]; return e && e.status === 'written' ? e : null; };
const climaPool = (site, v) => { const e = tables.clima?.pooled?.[`${site.band}|${site.country}`]?.[v]; return e && e.status === 'written' ? e : null; };

// ── (1)+(2): superset design ─────────────────────────────────────────────────
const EXTRA = ['muC', 'muCpool', 'sink·hC1', 'sink·hS1', 'tpi500·hC1', 'tpi500·hS1', 'svf·hC1', 'dh·hC1', 'lcForest·hC1', 'lcUrban·hC1', 'imperv·hC1', 'absDh·hC1', 'dTsfc·hC1', 'dTsfc·tpi500', 'sink·dC1', 'dh·dC1'];
const P0 = Z_DIM + 4, PX = P0 + EXTRA.length;
const I = Z_INDEX;
function superDesign(z, y, dhM, dTsfcK, srcCount, muC, muCpool) {
  const x = new Float64Array(PX);
  x.set(meanDesignK(z, y, dhM, dTsfcK, srcCount));
  const hC1 = z[I.hCos1], hS1 = z[I.hSin1], dC1 = z[I.dCos1];
  let o = P0;
  x[o++] = muC; x[o++] = muCpool;
  x[o++] = z[I.sink] * hC1; x[o++] = z[I.sink] * hS1; x[o++] = z[I.tpi500] * hC1; x[o++] = z[I.tpi500] * hS1; x[o++] = z[I.svf] * hC1; x[o++] = z[I.dh] * hC1;
  x[o++] = z[I.lcForest] * hC1; x[o++] = z[I.lcUrban] * hC1; x[o++] = z[I.imperv] * hC1; x[o++] = z[I.absDh] * hC1; x[o++] = z[I.dTsfc] * hC1; x[o++] = z[I.dTsfc] * z[I.tpi500];
  x[o++] = z[I.sink] * dC1; x[o++] = z[I.dh] * dC1;
  return x;
}
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const INTER = range(P0 + 2, PX);
const DESIGNS = {
  D0: range(0, P0),
  'D1 +μc': [...range(0, P0), P0],
  'D1p +μc(pool)': [...range(0, P0), P0 + 1],
  'D2 +inter': [...range(0, P0), ...INTER],
  'D3 +μc+inter': [...range(0, P0), P0, ...INTER],
};
function subGram(g, idx) {
  const p = g.p, q = idx.length, out = new Gram(q);
  for (let a = 0; a < q; a++) {
    const ia = idx[a];
    out.xty[a] = g.xty[ia];
    for (let b = a; b < q; b++) { const ib = idx[b]; out.xtx[a * q + b] = ia <= ib ? g.xtx[ia * p + ib] : g.xtx[ib * p + ia]; }
  }
  out.yty = g.yty; out.n = g.n; for (const d of g.days) out.days.add(d); Object.assign(out.extra, g.extra);
  return out;
}
const grams = new Map();     // stratum → { month: Map, half: Map, band: Map }
const gramGroup = (key, axis, gk) => { let s = grams.get(key); if (!s) { s = { month: new Map(), half: new Map(), band: new Map() }; grams.set(key, s); } let g = s[axis].get(gk); if (!g) { g = new Gram(PX); s[axis].set(gk, g); } return g; };
const MEAN_VARS = ['t', 'td', 'u', 'v', 'gust', 'clct'];

// ── stored rows for the shape tests ──────────────────────────────────────────
const S = { ws: [], clct: [], precip: [], t: [] };

// ── the pass ─────────────────────────────────────────────────────────────────
const T0 = Date.now();
let rows = 0, usedG = 0, usedS = 0;
for (const f of files) {
  const tbl = tablesForMonth(f.month);
  const r = await readCases(f.path, { columns: ROW_COLUMNS, batchRows: 32768, onBatch: (cols, n, header) => {
    if (!sites) { sites = header.points.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null)); regions = topTiles(sites, 12); }
    const b = prepareBatch(cols);
    for (let i = 0; i < n; i++) {
      rows += 1;
      const h = cols.validAtH[i] + cols.pointIdx[i];
      const doG = h % strideG === 0, doS = h % strideS === 0;
      if (!doG && !doS) continue;
      const ctx = rowContext(b, i, sites, false);
      if (!ctx) continue;
      const site = ctx.site;
      climaDesign(ctx.validAtMs, site.site.lonDeg, cx);
      if (doG) {
        usedG += 1;
        for (const v of MEAN_VARS) {
          const y = ctx.y[v]; if (y == null || ctx.k[v] == null) continue;
          const cp = climaPt(site, v), cq = climaPool(site, v);
          if (!cp || !cq) continue;
          const muC = climaAt(cp, cx).mu, muQ = climaAt(cq, cx).mu;
          const x = superDesign(ctx.z, ctx.k[v], ctx.dhM, ctx.dTsfcK, ctx.srcCount, muC, muQ);
          const key = stratumKey('K', v, ctx.bin, ctx.clsK);
          const half = `${ctx.month}${new Date(ctx.validAtMs).getUTCDate() < 16 ? 'a' : 'b'}`;
          for (const [axis, gk] of [['month', `${ctx.month}|*|*`], ['half', `${half}|*|*`], ['band', `*|*|${site.band}`]]) {
            const g = gramGroup(key, axis, gk);
            g.add(x, y, ctx.dayIdx);
            g.addExtra('base', (y - ctx.k[v]) ** 2); g.addExtra('clim', (y - muC) ** 2);
          }
        }
      }
      if (doS) {
        usedS += 1;
        const sit = { z: ctx.z, leadH: ctx.leadH, route: ctx.route, srcMask: ctx.srcMask, srcCount: ctx.srcCount, dhM: ctx.dhM, dTsfcK: ctx.dTsfcK, k: ctx.k, p: {}, sigDiv: ctx.sigDiv, sigEns: ctx.sigEns, wetShare: ctx.wetShareK };
        const pr = predict(tbl, 'K', sit);
        const fu = ctx.fused;
        if (ctx.y.ff != null && pr.dist.windSpeed && Number.isFinite(fu.ws[0]) && fu.ws[1] > 0) {
          const cu = climaPt(site, 'u'), cv = climaPt(site, 'v');
          const cnu = cu && cv ? Math.hypot(climaAt(cu, cx).mu, climaAt(cv, cx).mu) : NaN;
          const csg = cu && cv ? Math.sqrt(0.5 * (climaAt(cu, cx).sigma ** 2 + climaAt(cv, cx).sigma ** 2)) : NaN;
          S.ws.push([ctx.bin, ctx.y.ff, pr.dist.windSpeed.nu, pr.dist.windSpeed.sigma, fu.ws[0], fu.ws[1], cnu, csg, site.band === 'ge800' ? 1 : 0]);
        }
        if (ctx.y.clct != null && pr.dist.clouds) S.clct.push([ctx.bin, ctx.y.clct, pr.dist.clouds.mu, pr.dist.clouds.sigma]);
        if (ctx.y.rr != null && pr.dist.precipitation && Number.isFinite(fu.pr[0]) && Number.isFinite(fu.pr[1]) && fu.pr[2] > 0) {
          const d = pr.dist.precipitation;
          S.precip.push([ctx.bin, ctx.y.rr, d.pDry, d.mu, d.sigma, fu.pr[0], fu.pr[1], fu.pr[2], ctx.route]);
        }
        if (ctx.y.t != null && pr.dist.temperature) { const cp = climaPt(site, 't'); if (cp) { const c = climaAt(cp, cx); S.t.push([ctx.bin, ctx.y.t, pr.dist.temperature.mu, pr.dist.temperature.sigma, c.mu, c.sigma]); } }
      }
    }
  } });
  say(`${f.month} ${f.tier}: ${r.rows} Zeilen · Gram ${usedG} · gespeichert ${usedS} · ${Math.round((Date.now() - T0) / 1000)} s`);
}
say(`Durchlauf fertig: ${rows} Zeilen, ${Math.round((Date.now() - T0) / 1000)} s; Strata ${grams.size}`);

const report = { builtAt: new Date().toISOString(), rows, usedG, usedS, strideG, strideS, designs: {}, wind: {}, clouds: {}, precip: {}, tBlend: {} };
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

// ── (1)+(2) evaluation ───────────────────────────────────────────────────────
const agg = new Map();   // `${v}|${bin}` → { design → {sse, n} , base, clim }
for (const [key, s] of grams) {
  const [, v, bin, cls] = key.split('|');
  const allM = Gram.sum(s.month.values(), PX);
  if (allM.n < STRATUM_MIN.n || allM.days.size < STRATUM_MIN.days) continue;
  const monthKeys = [...s.month.keys()], halfKeys = [...s.half.keys()], bandKeys = [...s.band.keys()];
  const foldsM = foldsOverGroups(monthKeys, 'month'), foldsH = foldsOverGroups(halfKeys, 'month'), foldsB = foldsOverGroups(bandKeys, 'band');
  const ak = `${v}|${bin}`;
  let a = agg.get(ak); if (!a) { a = { designs: {}, base: 0, clim: 0, n: 0, strata: [] }; agg.set(ak, a); }
  a.strata.push(cls);
  let first = true;
  for (const [name, idx] of Object.entries(DESIGNS)) {
    const gm = new Map(monthKeys.map((k) => [k, subGram(s.month.get(k), idx)]));
    const gb = new Map(bandKeys.map((k) => [k, subGram(s.band.get(k), idx)]));
    const gh = new Map(halfKeys.map((k) => [k, subGram(s.half.get(k), idx)]));
    const all = Gram.sum(gm.values(), idx.length);
    const penalty = variancePenalty(all);
    const target = new Float64Array(idx.length); target[Z_DIM] = 1;
    const cvT = chooseLambda(gm, idx.length, foldsM, LAMBDAS, penalty, target, 'base');
    const cvB = cvT ? chooseLambda(gb, idx.length, foldsB, [cvT.lambda], penalty, target, 'base') : null;
    const cvH = chooseLambda(gh, idx.length, foldsH, LAMBDAS, penalty, target, 'base');
    if (!cvT) continue;
    const d = a.designs[name] ??= { sse: 0, n: 0, sseB: 0, nB: 0, baseB: 0, sseH: 0, nH: 0 };
    d.sse += cvT.heldSse; d.n += cvT.heldN;
    if (cvH) { d.sseH += cvH.heldSse; d.nH += cvH.heldN; }
    if (cvB) { d.sseB += cvB.heldSse; d.nB += cvB.heldN; d.baseB += cvB.baseSse ?? 0; }
    if (first) { a.base += cvT.baseSse ?? 0; a.n += cvT.heldN; first = false; }
  }
  // climatology MSE on the same held rows (sum over all month groups = all rows)
  a.clim += allM.extra.clim ?? 0;
}
say('');
say('(1)+(2) Mittelwertmodell Form K, out-of-fold — RMSE je Design: Monatsfalten (Purge ±1 Monat) / Halbmonatsfalten (Purge ±1 Halbmonat ≥ 15 d) / Band-Holdout');
say(`${'Größe|Bin'.padEnd(10)} ${'n'.padStart(8)} ${'cube'.padStart(7)} ${'clima'.padStart(7)} ` + Object.keys(DESIGNS).map((d) => d.padStart(20)).join(' '));
for (const ak of [...agg.keys()].sort((x, y) => { const [va, ba] = x.split('|'), [vb, bb] = y.split('|'); return va === vb ? Number(ba) - Number(bb) : MEAN_VARS.indexOf(va) - MEAN_VARS.indexOf(vb); })) {
  const a = agg.get(ak);
  const n = a.n;
  const line = Object.entries(DESIGNS).map(([name]) => { const d = a.designs[name]; if (!d) return '—'.padStart(14); const rm = Math.sqrt(d.sse / d.n), rh = d.nH ? Math.sqrt(d.sseH / d.nH) : NaN, rb = d.nB ? Math.sqrt(d.sseB / d.nB) : NaN; return `${f3(rm)}/${f3(rh)}/${f3(rb)}`.padStart(20); }).join(' ');
  say(`${ak.padEnd(10)} ${String(n).padStart(8)} ${f3(Math.sqrt(a.base / n)).padStart(7)} ${f3(Math.sqrt(a.clim / n)).padStart(7)} ${line}`);
  report.designs[ak] = { n, rmseCube: Math.sqrt(a.base / n), rmseClima: Math.sqrt(a.clim / n), strata: a.strata, designs: Object.fromEntries(Object.entries(a.designs).map(([k, d]) => [k, { rmse: Math.sqrt(d.sse / d.n), rmseHalfMonth: d.nH ? Math.sqrt(d.sseH / d.nH) : null, rmseBandHoldout: d.nB ? Math.sqrt(d.sseB / d.nB) : null, rmseCubeBandHoldout: d.nB ? Math.sqrt(d.baseB / d.nB) : null }])) };
}

// ── (3) wind ─────────────────────────────────────────────────────────────────
const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
/** Truncated normal at 0: closed-form CRPS (Thorarinsdóttir & Gneiting 2010), PIT, mean. */
function tnCrps(mu, sg, y) { const a = mu / sg, z = (y - mu) / sg, Pa = Phi(a); if (!(Pa > 1e-12)) return Math.abs(y); return sg / (Pa * Pa) * (z * Pa * (2 * Phi(z) + Pa - 2) + 2 * phi(z) * Pa - Phi(Math.SQRT2 * a) / Math.sqrt(Math.PI)); }
function tnPit(mu, sg, y) { const Pa = Phi(mu / sg); return (Phi((y - mu) / sg) - (1 - Pa)) / Pa; }
function tnMean(mu, sg) { const a = mu / sg, Pa = Phi(a); return mu + sg * phi(a) / Math.max(Pa, 1e-12); }
const outer = (p) => (p < 0.1 || p > 0.9 ? 1 : 0);
const riceMoments = (nu, sg) => { const m = meanOf({ kind: 'rice', nu, sigma: sg }); return { m, sd: Math.sqrt(Math.max(1e-6, 2 * sg * sg + nu * nu - m * m)) }; };
const CAP = Number(args.cap) || 40000;
const sub = (arr, bin) => { const rows = arr.filter((r) => r[0] === bin); if (rows.length <= CAP) return rows; const step = rows.length / CAP; const o = []; for (let i = 0; i < CAP; i++) o.push(rows[Math.floor(i * step)]); return o; };
say('');
say('(3) Wind: Verteilungsfamilie am gelernten (ν, σ) — CRPS · PIT-Rand · Bias des Punktwerts (Subsample je Bin)');
for (let bin = 0; bin < 6; bin++) {
  const R = sub(S.ws, bin); if (R.length < 1000) continue;
  const n = R.length;
  const evalRice = (k) => { let c = 0, o = 0, bs = 0; for (const r of R) { const d = { kind: 'rice', nu: r[2], sigma: r[3] * k }; c += crpsByCdf(d, r[1], 0, d.nu + 8 * d.sigma + 1, 96); o += outer(pitOf(d, r[1])); bs += meanOf(d) - r[1]; } return { crps: c / n, pit: o / n, bias: bs / n }; };
  const evalTN = (a, b, c, useNu) => { let cr = 0, o = 0, bs = 0; for (const r of R) { const mo = riceMoments(r[2], r[3]); const mu = useNu ? a + b * r[2] : a + b * mo.m; const sg = c * (useNu ? r[3] : mo.sd); cr += tnCrps(mu, sg, r[1]); o += outer(tnPit(mu, sg, r[1])); bs += tnMean(mu, sg) - r[1]; } return { crps: cr / n, pit: o / n, bias: bs / n }; };
  const rice1 = evalRice(1);
  // PIT histogram (deciles) of Rice(K), calm share, and a Rice censored at c (obs ≤ c = the atom, mid-PIT; CRPS of the censored CDF)
  const hist = new Array(10).fill(0); let calm0 = 0, calmC = 0;
  const CENS = 0.5;
  const crpsCens = (nu, sg, y) => { const hi = nu + 8 * sg + 1, m = 96, h = hi / m; let acc = 0; for (let i = 0; i < m; i++) { const x = (i + 0.5) * h; const F = x < CENS ? 0 : cdfOf({ kind: 'rice', nu, sigma: sg }, x); const s = x >= y ? 1 : 0; acc += (F - s) * (F - s); } return acc * h + (y > hi ? y - hi : 0); };
  let cCens = 0, oCens = 0, maeMean = 0, maeMed = 0;
  for (const r of R) {
    const d = { kind: 'rice', nu: r[2], sigma: r[3] };
    const p = pitOf(d, r[1]); hist[Math.min(9, Math.floor(p * 10))] += 1;
    if (r[1] <= 0) calm0 += 1; if (r[1] <= CENS) calmC += 1;
    const Fc = cdfOf(d, CENS);
    const pc = r[1] <= CENS ? 0.5 * Fc : p;
    oCens += outer(pc); cCens += crpsCens(r[2], r[3], r[1]);
    maeMean += Math.abs(meanOf(d) - r[1]);
    // median by bisection on the CDF
    let lo = 0, hi = d.nu + 8 * d.sigma + 1; for (let it = 0; it < 30; it++) { const mid = 0.5 * (lo + hi); if (cdfOf(d, mid) < 0.5) lo = mid; else hi = mid; }
    maeMed += Math.abs(0.5 * (lo + hi) - r[1]);
  }
  say(`Bin ${bin} n ${n}: PIT-Dezile Rice(K) ${hist.map((h) => (100 * h / n).toFixed(1)).join(' ')} · obs=0 ${f3(calm0 / n)} obs≤${CENS} ${f3(calmC / n)} · Rice zensiert bei ${CENS}: CRPS ${f3(cCens / n)} PIT ${f3(oCens / n)} · MAE Mittel ${f3(maeMean / n)} Median ${f3(maeMed / n)}`);
  report.wind[`hist${bin}`] = { hist: hist.map((h) => h / n), calm0: calm0 / n, calmC: calmC / n, censored: { c: CENS, crps: cCens / n, pit: oCens / n }, maeMean: maeMean / n, maeMedian: maeMed / n };
  let bestRice = { k: 1, ...rice1 };
  for (const k of [1.1, 1.2, 1.3, 1.45, 1.6, 1.8]) { const e = evalRice(k); if (e.crps < bestRice.crps) bestRice = { k, ...e }; }
  let bestTN = null;
  for (const b of [0.9, 1.0, 1.1]) for (const a of [-0.6, -0.3, 0, 0.3]) for (const c of [0.9, 1.0, 1.15, 1.3, 1.5]) { const e = evalTN(a, b, c, false); if (!bestTN || e.crps < bestTN.crps) bestTN = { a, b, c, ...e }; }
  // log-normal speed EMOS: ln y = a + b ln E + ε (least squares on the subsample), CRPS closed form (Baran & Lerch 2015)
  let sx = 0, sy = 0, sxx = 0, sxy = 0, nn = 0;
  for (const r of R) { const x = Math.log(riceMoments(r[2], r[3]).m), yy = Math.log(Math.max(r[1], 0.2)); sx += x; sy += yy; sxx += x * x; sxy += x * yy; nn += 1; }
  const bL = (sxy - sx * sy / nn) / (sxx - sx * sx / nn), aL = (sy - bL * sx) / nn;
  let s2 = 0; for (const r of R) { const x = Math.log(riceMoments(r[2], r[3]).m); const e = Math.log(Math.max(r[1], 0.2)) - (aL + bL * x); s2 += e * e; }
  const sL0 = Math.sqrt(s2 / nn);
  const lnCrps = (m, sg, y) => { const w = (Math.log(Math.max(y, 1e-3)) - m) / sg; return y * (2 * Phi(w) - 1) - 2 * Math.exp(m + 0.5 * sg * sg) * (Phi(w - sg) + Phi(sg / Math.SQRT2) - 1); };
  let bestLN = null;
  for (const k of [0.8, 0.9, 1.0, 1.1]) { let c = 0, o = 0, bs = 0; for (const r of R) { const m = aL + bL * Math.log(riceMoments(r[2], r[3]).m), sg = k * sL0; c += lnCrps(m, sg, r[1]); const p = Phi((Math.log(Math.max(r[1], 1e-3)) - m) / sg); o += outer(p); bs += Math.exp(m + 0.5 * sg * sg) - r[1]; } const e = { k, a: aL, b: bL, s: k * sL0, crps: c / n, pit: o / n, bias: bs / n }; if (!bestLN || e.crps < bestLN.crps) bestLN = e; }
  // Rice recalibrated on speed: ν' = max(0, a + b ν), σ' = c σ (coarse grid, half the subsample)
  const R2 = R.filter((_, i) => i % 2 === 0), n2 = R2.length;
  let bestRR = null;
  for (const a of [-0.6, -0.3, 0]) for (const b of [0.9, 1.0]) for (const c of [0.85, 1.0, 1.15]) { let cr = 0, o = 0, bs = 0; for (const r of R2) { const d = { kind: 'rice', nu: Math.max(0, a + b * r[2]), sigma: c * r[3] }; cr += crpsByCdf(d, r[1], 0, d.nu + 8 * d.sigma + 1, 96); o += outer(pitOf(d, r[1])); bs += meanOf(d) - r[1]; } const e = { a, b, c, crps: cr / n2, pit: o / n2, bias: bs / n2 }; if (!bestRR || e.crps < bestRR.crps) bestRR = e; }
  say(`Bin ${bin}: LN-EMOS a ${f3(bestLN.a)} b ${f3(bestLN.b)} s ${f3(bestLN.s)}: CRPS ${f3(bestLN.crps)} PIT ${f3(bestLN.pit)} Bias ${f3(bestLN.bias)} · Rice rekalibriert a ${bestRR.a} b ${bestRR.b} c ${bestRR.c}: CRPS ${f3(bestRR.crps)} PIT ${f3(bestRR.pit)} Bias ${f3(bestRR.bias)}`);
  report.wind[`emos${bin}`] = { lnEmos: bestLN, riceRecal: bestRR };
  const tnPlain = evalTN(0, 1, 1, false);
  // the engine's own cube Rice and the climatology Rice, same rows
  let cc = 0, co = 0, kc = 0, ko = 0;
  for (const r of R) { const d = { kind: 'rice', nu: r[4], sigma: r[5] }; cc += crpsByCdf(d, r[1], 0, d.nu + 8 * d.sigma + 1, 96); co += outer(pitOf(d, r[1])); if (Number.isFinite(r[6])) { const e = { kind: 'rice', nu: r[6], sigma: r[7] }; kc += crpsByCdf(e, r[1], 0, e.nu + 8 * e.sigma + 1, 96); ko += outer(pitOf(e, r[1])); } }
  say(`Bin ${bin} n ${n}: Rice(K) CRPS ${f3(rice1.crps)} PIT ${f3(rice1.pit)} Bias ${f3(rice1.bias)} · Rice σ×${bestRice.k}: ${f3(bestRice.crps)} PIT ${f3(bestRice.pit)} Bias ${f3(bestRice.bias)} · TN(E,sd): ${f3(tnPlain.crps)} PIT ${f3(tnPlain.pit)} · TN best a ${bestTN.a} b ${bestTN.b} c ${bestTN.c}: ${f3(bestTN.crps)} PIT ${f3(bestTN.pit)} Bias ${f3(bestTN.bias)} · Cube-Rice ${f3(cc / n)} PIT ${f3(co / n)} · Klima-Rice ${f3(kc / n)} PIT ${f3(ko / n)}`);
  report.wind[bin] = { n, rice: rice1, riceScaled: bestRice, tnPlain, tnBest: bestTN, cube: { crps: cc / n, pit: co / n }, clima: { crps: kc / n, pit: ko / n } };
}

// ── (4) clouds ───────────────────────────────────────────────────────────────
say('');
say('(4) Bewölkung: zensierte Normal am gelernten (μ, σ) — σ-Skala, CRPS · PIT-Rand; Anteile der Beobachtung an 0/100');
for (let bin = 0; bin < 6; bin++) {
  const R = sub(S.clct, bin); if (R.length < 1000) continue;
  const n = R.length;
  let at0 = 0, at100 = 0; for (const r of R) { if (r[1] <= 0) at0 += 1; if (r[1] >= 100) at100 += 1; }
  const ev = (k) => { let c = 0, o = 0, p0 = 0, p100 = 0; for (const r of R) { const d = { kind: 'censoredNormal', mu: r[2], sigma: r[3] * k, lo: 0, hi: 100 }; c += crpsOf(d, r[1], 256); o += outer(pitOf(d, r[1])); p0 += cdfOf(d, 0); p100 += 1 - Phi((100 - d.mu) / d.sigma); } return { crps: c / n, pit: o / n, p0: p0 / n, p100: p100 / n }; };
  const res = {}; for (const k of [1, 1.15, 1.3, 1.5, 1.75, 2.0]) res[k] = ev(k);
  say(`Bin ${bin} n ${n}: obs@0 ${f3(at0 / n)} obs@100 ${f3(at100 / n)} · ` + Object.entries(res).map(([k, e]) => `σ×${k}: ${f3(e.crps)} PIT ${f3(e.pit)} P0 ${f3(e.p0)} P100 ${f3(e.p100)}`).join(' · '));
  report.clouds[bin] = { n, obsAt0: at0 / n, obsAt100: at100 / n, scales: res };
}

// ── (5) precipitation ────────────────────────────────────────────────────────
say('');
say('(5) Niederschlag: Hürde — Brier(nass ≥ 0,1) gelernt vs Cube; CRPS der Kreuzkombinationen (Subsample je Bin)');
for (let bin = 0; bin < 6; bin++) {
  const R = sub(S.precip, bin); if (R.length < 1000) continue;
  const n = R.length;
  let bL = 0, bC = 0, bM = 0, cL = 0, cC = 0, cLC = 0, cCL = 0, wet = 0;
  const cr = (pDry, mu, sg, y) => crpsOf({ kind: 'hurdleLogNormal', pDry, mu, sigma: sg }, y, 96);
  for (const r of R) {
    const y = r[1], w = y >= 0.1 ? 1 : 0; wet += w;
    const pL = 1 - r[2], pC = 1 - r[5];
    bL += (pL - w) ** 2; bC += (pC - w) ** 2; bM += (0.5 * (pL + pC) - w) ** 2;
    cL += cr(r[2], r[3], r[4], y); cC += cr(r[5], r[6], r[7], y); cLC += cr(r[2], r[6], r[7], y); cCL += cr(r[5], r[3], r[4], y);
  }
  say(`Bin ${bin} n ${n} nass ${f3(wet / n)}: Brier gelernt ${f3(bL / n)} · Cube ${f3(bC / n)} · Mittel ${f3(bM / n)} | CRPS gelernt ${f3(cL / n)} · Cube ${f3(cC / n)} · Hürde gelernt+Menge Cube ${f3(cLC / n)} · Hürde Cube+Menge gelernt ${f3(cCL / n)}`);
  report.precip[bin] = { n, wetShare: wet / n, brier: { learned: bL / n, cube: bC / n, mean: bM / n }, crps: { learned: cL / n, cube: cC / n, learnedOccCubeAmt: cLC / n, cubeOccLearnedAmt: cCL / n } };
}

// ── T: scalar climatology blend (intuition; the Gram table above is the honest number) ──
say('');
say('T: skalare Mischung μ = μK + α(μc − μK) je Bin (in-sample α, ein Parameter) — RMSE K · Klima · Mischung');
for (let bin = 0; bin < 6; bin++) {
  const R = S.t.filter((r) => r[0] === bin); if (R.length < 1000) continue;
  let sxy = 0, sxx = 0, sK = 0, sC = 0;
  for (const r of R) { const dx = r[4] - r[2], dy = r[1] - r[2]; sxy += dx * dy; sxx += dx * dx; sK += dy * dy; sC += (r[1] - r[4]) ** 2; }
  const al = sxx > 0 ? sxy / sxx : 0;
  let sB = 0; for (const r of R) sB += (r[1] - (r[2] + al * (r[4] - r[2]))) ** 2;
  say(`Bin ${bin} n ${R.length}: α ${f3(al)} · RMSE K ${f3(Math.sqrt(sK / R.length))} · Klima ${f3(Math.sqrt(sC / R.length))} · Mischung ${f3(Math.sqrt(sB / R.length))}`);
  report.tBlend[bin] = { n: R.length, alpha: al, rmseK: Math.sqrt(sK / R.length), rmseClima: Math.sqrt(sC / R.length), rmseBlend: Math.sqrt(sB / R.length) };
}
writeFileSync(outPath, JSON.stringify(report));
say(`geschrieben ${outPath}; ${Math.round((Date.now() - T0) / 60000)} min`);
