/**
 * diag-fx1.mjs — Fehleranalyse von Scorecard 4 (Fit 4, `fusionFit@3`) auf den Fallreihen, out of fold (Phase FL,
 * Forschungsrunde FX1). Modell: `audit/fusion-lernphase/diag-2026-09-24/diag-fl2.mjs`; die Kandidaten werden EXAKT wie
 * in `scripts/fusionfit/score.mjs` gebaut (Falten-β des Dateimonats für `mean` UND `occurrence`; Varianz, Skala,
 * Speed-Gesetz, Menge, Klimatologie gepoolt = in-sample für diese Teile).
 *
 *   D1  Kalibrier-Artefakte (V-FL-39/42): Spread/Skill mit der latenten σ des Scorers gegen die WAHRE Standardabweichung
 *       (TN geschlossen, Tobit-Momente der zensierten Normal, Rice sd), PIT-Histogramm, je Größe × Bin (+ Land/Band für ws/clct).
 *   D2  Langer Vorlauf je Vorlaufstunde: CRPS/MAE fl-K, Cube, Klima (Station = Scorer-Definition), Klima (gepoolt Band|Land);
 *       Anomaliekorrelation, Regressionssteigung b, „Orakel-Mischung" μ_c + b(μ_K − μ_c) mit σ_b = Residuen-sd (in-sample).
 *   D3  Wind-Standortabhängigkeit (V-FL-38): fl-K je Bin × Gruppe, die Rice vor dem Gesetz, Gitter-Refit des TN-Gesetzes je Gruppe
 *       (in-sample, Obergrenze), lineares Gesetz a = a0 + a1·lnZ0 + a2·tpi2000 + a3·h_true.
 *   D4  T/Td-Plateau: bedingter Bias und Varianzverhältnis nach Stunde × Saison, dTsfc, Bewölkung, Wind, Gelände, Band, Route,
 *       Flags, Vertikalfall; je-Standort-Obergrenze (leave-one-month-out Bias je Punkt × Stunde × Saison); Schiefe/Kurtosis.
 *   D5  Niederschlag je Bin × Route: Brier(0,1 / 1), CRPS trocken/nass, Menge|nass, Reliability, Prädiktor-Korrelationen.
 *   D6  Bewölkung (DE) je Bin × Route: Atome, PIT, Spread/Skill korrigiert, MAE nach Schichtbewölkung.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-forschung/diag-fx1.mjs
 *        [--stride=12] [--months=2026-08,2026-08] [--out=audit/fusion-forschung/diag-fx1.json] [--storeEvery=2] [--gridCap=20000]
 *
 * Nur lesend auf dem Hindcast; schreibt JSON + Markdown. Deterministisch (Reservoir mit gesätem LCG).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCases, FL_FLAGS } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/casesio.mjs';
import { rowContext, prepareBatch, siteOf, ROW_COLUMNS } from 'file:///C:/dev/buscosun-web/scripts/fusionfit/lib/rowFeatures.mjs';
import { predict, predictPrecip } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/predict.ts';
import { climaDesign, climaAt, C_DIM } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitClima.ts';
import { solarHour, Z_INDEX } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/features.ts';
import { riceMoments, crpsRice } from 'file:///C:/dev/buscosun-web/src/point/fusionFit/fitSpeed.ts';
import { cdfOf, meanOf, pitOf, quantileOf, crpsOf, crpsNormal, crpsTruncatedNormal, crpsCensoredNormal, riceCdf, Phi, phi, PhiInv } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/dist.ts';

const root = 'C:\\dev\\buscosun-hindcast';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const stride = Math.max(1, Number(args.stride) || 12);
const storeEvery = Math.max(1, Number(args.storeEvery) || 2);     // D3 store: every k-th ws row of the stride rows
const d4Every = Math.max(1, Number(args.d4Every) || 2);           // D4 sample for the CRPS of the site correction
const gridCap = Math.max(1000, Number(args.gridCap) || 20000);    // D3 grid refit: rows per group
const D3_CAP = 1_600_000, D4_CAP = 3_200_000, D2_CAP = 4000;
const outPath = args.out ?? join('audit', 'fusion-forschung', 'diag-fx1.json');
const mdPath = outPath.replace(/\.json$/, '.md');
const tables = JSON.parse(readFileSync(join(root, 'fit', '2026-09-25-ap8c', 'fusion.hindcast.json'), 'utf8'));
const feat = JSON.parse(readFileSync(join(root, 'features', 'points.v1.json'), 'utf8'));
const casesDir = join(root, 'cases', 'v1');
const monthRange = typeof args.months === 'string' ? args.months.split(',') : null;
const say = (s) => console.log(`[fx1] ${new Date().toISOString().slice(11, 19)} ${s}`);
const files = [];
for (const m of readdirSync(casesDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort()) {
  if (monthRange && (m < monthRange[0] || m > monthRange[1])) continue;
  for (const t of ['t1', 't2', 't3']) { const p = join(casesDir, m, `${t}.cas.gz`); if (existsSync(`${p}.meta.json`)) files.push({ month: m, tier: t, path: p }); }
}
const EXTRA_COLS = ['c_clct', 'c_clcl', 'c_clcm', 'c_clch', 'c_u10', 'c_v10', 'c_precip', 'c_precip_q90', 'verticalCase'];
const COLS = [...ROW_COLUMNS, ...EXTRA_COLS];
const fin = Number.isFinite;

// ── tables per month exactly like score.mjs (fold β for mean AND occurrence) ────────────────────────────────────────
const foldTablesCache = new Map();
const tablesForMonth = (month) => {
  if (foldTablesCache.has(month)) return foldTablesCache.get(month);
  const mean = {}, occurrence = {};
  for (const [k, e] of Object.entries(tables.mean)) mean[k] = e.folds?.[month] ? { ...e, beta: e.folds[month] } : e;
  for (const [k, e] of Object.entries(tables.occurrence)) occurrence[k] = e.folds?.[month] ? { ...e, beta: e.folds[month] } : e;
  const t = { ...tables, mean, occurrence }; foldTablesCache.set(month, t); return t;
};
const sitK = (ctx) => ({ z: ctx.z, leadH: ctx.leadH, route: ctx.route, srcMask: ctx.srcMask, srcCount: ctx.srcCount, dhM: ctx.dhM, dTsfcK: ctx.dTsfcK, k: ctx.k, p: {}, sigDiv: ctx.sigDiv, sigEns: ctx.sigEns, wetShare: ctx.wetShareK, pDryCube: ctx.pDryCube });
const cx = new Float64Array(C_DIM);
/** The scorer's climatology entry: own series if present (even if too-short ⇒ null), else pooled band|country. */
const climaS = (site, v) => { const e = tables.clima?.byPoint?.[site.id]?.[v] ?? tables.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null; return e && e.status === 'written' ? e : null; };
const climaP = (site, v) => { const e = tables.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null; return e && e.status === 'written' ? e : null; };

// ── closed-form moments ─────────────────────────────────────────────────────────────────────────────────────────────
/** sd of a normal truncated below at lo. */
function tnSd(mu, sg, lo = 0) { const a = (lo - mu) / sg, Z = 1 - Phi(a); if (!(Z > 1e-12)) return 1e-6; const l = phi(a) / Z; return sg * Math.sqrt(Math.max(1e-12, 1 + a * l - l * l)); }
/** Tobit moments of a normal censored on [lo, hi]: mean and sd of the observable. */
function censMoments(mu, sg, lo, hi) {
  const a = (lo - mu) / sg, b = (hi - mu) / sg, Pa = Phi(a), Pb = Phi(b), fa = phi(a), fb = phi(b), mid = Pb - Pa;
  const E = lo * Pa + mu * mid + sg * (fa - fb) + hi * (1 - Pb);
  const E2 = lo * lo * Pa + hi * hi * (1 - Pb) + mu * mu * mid + 2 * mu * sg * (fa - fb) + sg * sg * (mid + a * fa - b * fb);
  return { E, sd: Math.sqrt(Math.max(1e-12, E2 - E * E)) };
}
const riceSd = (nu, sg, E) => Math.sqrt(Math.max(1e-12, 2 * sg * sg + nu * nu - E * E));
/** Numerical check of the Tobit moments and the TN sd against a quantile grid (printed, kept in the report). */
function verifyMoments() {
  const out = [];
  const grid = (d, n = 20000) => { let s = 0, s2 = 0; for (let i = 0; i < n; i++) { const q = quantileOf(d, (i + 0.5) / n); s += q; s2 += q * q; } const m = s / n; return { E: m, sd: Math.sqrt(s2 / n - m * m) }; };
  for (const [mu, sg, lo, hi] of [[50, 20, 0, 100], [95, 25, 0, 100], [5, 30, 0, 100], [3, 2, 0, 90]]) {
    const c = censMoments(mu, sg, lo, hi), g = grid({ kind: 'censoredNormal', mu, sigma: sg, lo, hi });
    out.push({ family: 'censoredNormal', mu, sigma: sg, lo, hi, closed: c, grid: g, dE: c.E - g.E, dSd: c.sd - g.sd });
  }
  for (const [mu, sg] of [[2, 1.5], [0.5, 1.2], [-0.5, 1]]) {
    const d = { kind: 'truncatedNormal', mu, sigma: sg, lo: 0 }, g = grid(d), c = { E: meanOf(d), sd: tnSd(mu, sg) };
    out.push({ family: 'truncatedNormal', mu, sigma: sg, closed: c, grid: g, dE: c.E - g.E, dSd: c.sd - g.sd });
  }
  return out;
}

// ── site-level classes (from the feature table; deterministic) ──────────────────────────────────────────────────────
let sites = null;
const terc = (xs) => { const s = [...xs].sort((a, b) => a - b); return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]]; };
const allSites = Object.values(feat.byPoint).map((fr) => siteOf(fr));
const lnZ0Of = (S) => (S.z0True != null && S.z0True > 0 ? Math.log(S.z0True) : Math.log(0.1));
const T_LNZ0 = terc(allSites.map((s) => lnZ0Of(s.site)));
const T_TPI = terc(allSites.map((s) => (s.site.tpi2000M ?? 0) / 100));
const cls3 = (x, t) => (x < t[0] ? 0 : x < t[1] ? 1 : 2);
const COUNTRY_IDX = { DE: 0, AT: 1, CH: 2, LI: 3 };
const COUNTRY_NAME = ['DE', 'AT', 'CH', 'LI', 'other'];
const hClass = (h) => (h < 300 ? 0 : h < 800 ? 1 : h < 1500 ? 2 : 3);
const H_NAME = ['<300', '300–800', '800–1500', '≥1500'];
/** Solar-hour classes: D3 night 22–05 / day 10–17 / transition; D4 night <6 or ≥20, day 8–18, else transition. */
const hour3 = (sh) => (sh >= 22 || sh < 6 ? 0 : sh >= 10 && sh < 18 ? 1 : 2);
const ND_NAME = ['night', 'day', 'trans'];
const ndOf = (sh) => (sh < 6 || sh >= 20 ? 0 : sh >= 8 && sh < 18 ? 1 : 2);
const seasonOf = (ms) => { const m = new Date(ms).getUTCMonth(); return m === 11 || m <= 1 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3; };
const SEASON = ['DJF', 'MAM', 'JJA', 'SON'];
const FLAG_BIT = Object.fromEntries(['inversionBody', 'extrapolatedBelowModel', 'stdLapseFallback', 'hmodelProxy'].map((n) => [n, FL_FLAGS.indexOf(n)]));
const VC_NAME = ['?', 'A', 'B', 'C', 'std'];

// ── accumulators ────────────────────────────────────────────────────────────────────────────────────────────────────
const getOr = (map, key, mk) => { let a = map.get(key); if (!a) { a = mk(); map.set(key, a); } return a; };
// D1: `${v}|${bin}|${cand}|${stratum}` → calibration sums
const D1 = new Map();
const mkD1 = () => ({ n: 0, sumErr: 0, sse: 0, sumSpread: 0, sumSd: 0, sumVar: 0, pit: new Float64Array(10), outer: 0 });
function d1Add(v, bin, cand, strata, err, spread, sd, pit) {
  for (const st of strata) { const a = getOr(D1, `${v}|${bin}|${cand}|${st}`, mkD1); a.n += 1; a.sumErr += err; a.sse += err * err; a.sumSpread += spread; a.sumSd += sd; a.sumVar += sd * sd; a.pit[Math.min(9, Math.max(0, Math.floor(pit * 10)))] += 1; if (pit < 0.1 || pit > 0.9) a.outer += 1; }
}
// D2: `${v}|${leadH}|${stratum}` (stratum: all, country:X, band:X, route:X) → sums; sample per `${v}|${leadH}` (all)
const D2 = new Map();
const mkD2 = () => ({ n: 0, cK: 0, cC: 0, cS: 0, cP: 0, mK: 0, mC: 0, mS: 0, mP: 0, sxy: 0, sxx: 0, syy: 0, sx: 0, sy: 0, pxy: 0, pxx: 0, pyy: 0, px: 0, py: 0 });
const D2S = new Map();   // `${v}|${leadH}` → { n (seen), k, cols: Float32Array(D2_CAP*6) }
const D2B = new Map();   // `${v}|${leadH}` → bin (from ctx.bin, the calib bin of the lead)
let lcgState = 987654321;
const rnd = () => { lcgState = (Math.imul(lcgState, 1664525) + 1013904223) >>> 0; return lcgState / 4294967296; };
function d2Add(v, leadH, route, site, r, bin) {
  const strata = ['all', `country:${site.country}`, `band:${site.band}`, `route:${route}`];
  if (!D2B.has(`${v}|${leadH}`)) D2B.set(`${v}|${leadH}`, bin);
  for (const st of strata) {
    const a = getOr(D2, `${v}|${leadH}|${st}`, mkD2);
    a.n += 1; a.cK += r.cK; a.cC += r.cC; a.cS += r.cS; a.cP += r.cP; a.mK += r.mK; a.mC += r.mC; a.mS += r.mS; a.mP += r.mP;
    a.sxy += r.dKs * r.dys; a.sxx += r.dKs * r.dKs; a.syy += r.dys * r.dys; a.sx += r.dKs; a.sy += r.dys;
    a.pxy += r.dKp * r.dyp; a.pxx += r.dKp * r.dKp; a.pyy += r.dyp * r.dyp; a.px += r.dKp; a.py += r.dyp;
  }
  const s = getOr(D2S, `${v}|${leadH}`, () => ({ seen: 0, k: 0, cols: new Float32Array(D2_CAP * 6) }));
  s.seen += 1;
  let slot = -1;
  if (s.k < D2_CAP) slot = s.k++; else { const j = Math.floor(rnd() * s.seen); if (j < D2_CAP) slot = j; }
  if (slot >= 0) { const o = slot * 6; s.cols[o] = r.muS; s.cols[o + 1] = r.dKs; s.cols[o + 2] = r.dys; s.cols[o + 3] = r.muP; s.cols[o + 4] = r.dKp; s.cols[o + 5] = r.dyp; }
}
// D3 store (ws rows): typed columns
const D3 = { n: 0, bin: new Uint8Array(D3_CAP), y: new Float32Array(D3_CAP), E: new Float32Array(D3_CAP), sd: new Float32Array(D3_CAP), cRice: new Float32Array(D3_CAP), cLaw: new Float32Array(D3_CAP), pitLaw: new Float32Array(D3_CAP), meanLaw: new Float32Array(D3_CAP), country: new Uint8Array(D3_CAP), band: new Uint8Array(D3_CAP), lnZ0: new Float32Array(D3_CAP), tpi: new Float32Array(D3_CAP), hTrue: new Float32Array(D3_CAP), hour: new Uint8Array(D3_CAP), law: new Uint8Array(D3_CAP), pitRice: new Float32Array(D3_CAP), meanRice: new Float32Array(D3_CAP) };
let wsCounter = 0;
// D4: grouped sums `${v}|${bin}|${scheme}|${group}` → { n, se, se2, ss2 }; per-site cells typed; standardised moments; sample
const D4 = new Map();
const mkD4 = () => ({ n: 0, se: 0, se2: 0, ss2: 0 });
const d4Add = (v, bin, scheme, group, e, s2) => { const a = getOr(D4, `${v}|${bin}|${scheme}|${group}`, mkD4); a.n += 1; a.se += e; a.se2 += e * e; a.ss2 += s2; };
const NPT = 512, NMON = 16, CELLS = NPT * 32;      // cell = pt*32 + hc8*4 + season
const monthIdx = new Map(); const monthOf = (m) => { let i = monthIdx.get(m); if (i == null) { i = monthIdx.size; monthIdx.set(m, i); } return i; };
const D4C = {}; for (const v of ['t', 'td']) for (let b = 0; b < 4; b++) D4C[`${v}|${b}`] = { n: new Float64Array(CELLS * NMON), se: new Float64Array(CELLS * NMON), se2: new Float64Array(CELLS * NMON) };
const D4M = new Map();   // `${v}|${bin}|${nd}` → { n, z1, z2, z3, z4 }
const D4S = { n: 0, var: new Uint8Array(D4_CAP), bin: new Uint8Array(D4_CAP), cell: new Int32Array(D4_CAP), mon: new Uint8Array(D4_CAP), e: new Float32Array(D4_CAP), sg: new Float32Array(D4_CAP) };
let tCounter = 0;
// D4 fine histograms for data-driven quantiles: dTsfc in 0,5-K bins on [−30, 30) (120), c_clct in 5-% bins (20)
const dTBin = (x) => Math.min(119, Math.max(0, Math.floor((x + 30) / 0.5)));
const clBin = (x) => Math.min(19, Math.max(0, Math.floor(x / 5)));
// D5: `${bin}|${route}|${set}` → precip sums; reliability `${bin}|${route}|${cand}` → bins; predictors `${bin}|${x}` → corr sums
const D5 = new Map();
const mkD5 = () => ({ n: 0, wet: 0, b01: { K: 0, C: 0, P: 0, A: 0 }, b1: { K: 0, C: 0, P: 0, A: 0 }, cDry: { K: 0, C: 0, P: 0, AK: 0, AC: 0 }, cWet: { K: 0, C: 0, P: 0, AK: 0, AC: 0 }, amt: { n: 0, pitK: new Float64Array(10), pitC: new Float64Array(10), maeK: 0, maeC: 0, covK: 0, covC: 0 } });
const D5R = new Map();
const mkRel = () => Array.from({ length: 10 }, () => [0, 0, 0]);
const D5X = new Map();
const mkCorr = () => ({ n: 0, sw: 0, sx: 0, sxx: 0, swx: 0 });
const corrAdd = (key, w, x) => { const a = getOr(D5X, key, mkCorr); a.n += 1; a.sw += w; a.sx += x; a.sxx += x * x; a.swx += w * x; };
// D6: `${bin}|${route}` → cloud sums; layers `${bin}|${clctCls}|${layer}|${lCls}` → { n, sae, se }
const D6 = new Map();
const mkD6 = () => ({ n: 0, obs0: 0, obs100: 0, pK0: 0, pK100: 0, pC0: 0, pC100: 0, pitK: new Float64Array(10), pitC: new Float64Array(10), sseK: 0, sseC: 0, sigK: 0, sdK: 0, varK: 0, sigC: 0, sdC: 0, varC: 0, maeK: 0, maeC: 0 });
const D6L = new Map();
const mkL = () => ({ n: 0, sae: 0, se: 0 });
const lCls = (x) => (x < 20 ? 0 : x <= 80 ? 1 : 2);
const cCls = (x) => (x < 33.3 ? 0 : x < 66.7 ? 1 : 2);

// ── the pass ────────────────────────────────────────────────────────────────────────────────────────────────────────
const T0 = Date.now();
let rows = 0, used = 0, dropNoClima = 0;
const momentCheck = verifyMoments();
for (const c of momentCheck) say(`Momente ${c.family} μ ${c.mu} σ ${c.sigma}: E geschlossen ${c.closed.E.toFixed(4)} Gitter ${c.grid.E.toFixed(4)} · sd ${c.closed.sd.toFixed(4)} / ${c.grid.sd.toFixed(4)}`);
for (const f of files) {
  const tbl = tablesForMonth(f.month);
  const r = await readCases(f.path, { columns: COLS, batchRows: 32768, onBatch: (cols, n, header) => {
    if (!sites) sites = header.points.map((id) => (feat.byPoint[id] ? siteOf(feat.byPoint[id]) : null));
    const b = prepareBatch(cols);
    for (let i = 0; i < n; i++) {
      rows += 1;
      if ((cols.validAtH[i] + cols.pointIdx[i]) % stride !== 0) continue;
      const ctx = rowContext(b, i, sites, false);
      if (!ctx) continue;
      used += 1;
      const site = ctx.site, S = site.site, pt = cols.pointIdx[i];
      climaDesign(ctx.validAtMs, S.lonDeg, cx);
      const sit = sitK(ctx);
      const pK = predict(tbl, 'K', sit);
      const sh = solarHour(ctx.validAtMs, S.lonDeg), hc8 = Math.floor(sh / 3), nd = ndOf(sh), season = seasonOf(ctx.validAtMs);
      const bin = ctx.bin, leadH = ctx.leadH, route = ctx.route, flags = cols.flags[i] | 0;
      const d1Strata = ['all', `country:${site.country}`, `band:${site.band}`];
      const fu = ctx.fused;

      // ── t / td ───────────────────────────────────────────────────────────────────────────────────────────────
      for (const v of ['t', 'td']) {
        const y = ctx.y[v]; if (y == null) continue;
        const dK = v === 't' ? pK.dist.temperature : pK.dist.dewPoint; if (!dK) continue;
        const fc = fu[v]; if (!(fin(fc[0]) && fc[1] > 0)) continue;
        const eS = climaS(site, v), eP = climaP(site, v); if (!eS || !eP) { dropNoClima += 1; continue; }
        const mS = climaAt(eS, cx), mP = climaAt(eP, cx);
        const e = y - dK.mu, sg = dK.sigma;
        d1Add(v, bin, 'K', ['all'], -e, sg, sg, Phi(e / sg));
        d2Add(v, leadH, route, site, { cK: crpsNormal(dK.mu, sg, y), cC: crpsNormal(fc[0], fc[1], y), cS: crpsNormal(mS.mu, mS.sigma, y), cP: crpsNormal(mP.mu, mP.sigma, y), mK: Math.abs(e), mC: Math.abs(fc[0] - y), mS: Math.abs(mS.mu - y), mP: Math.abs(mP.mu - y), muS: mS.mu, dKs: dK.mu - mS.mu, dys: y - mS.mu, muP: mP.mu, dKp: dK.mu - mP.mu, dyp: y - mP.mu }, bin);
        if (bin <= 3) {
          const s2 = sg * sg;
          d4Add(v, bin, 'hs', `${hc8}|${SEASON[season]}`, e, s2);
          if (ctx.dTsfcK != null) d4Add(v, bin, 'dT', String(dTBin(ctx.dTsfcK)), e, s2);
          if (fin(cols.c_clct[i])) d4Add(v, bin, 'cl', `${clBin(cols.c_clct[i])}|${ND_NAME[nd]}`, e, s2);
          if (fin(cols.c_u10[i]) && fin(cols.c_v10[i])) d4Add(v, bin, 'wind', `${Math.hypot(cols.c_u10[i], cols.c_v10[i]) < 2 ? 'calm' : 'rest'}|${ND_NAME[nd]}`, e, s2);
          d4Add(v, bin, 'tpi', `${cls3((S.tpi2000M ?? 0) / 100, T_TPI)}|${(S.sinkDepthM ?? 0) > 0 ? 'sink' : 'nosink'}`, e, s2);
          d4Add(v, bin, 'band', site.band, e, s2);
          d4Add(v, bin, 'route', String(route), e, s2);
          for (const [nm, bit] of Object.entries(FLAG_BIT)) d4Add(v, bin, 'flag', `${nm}|${(flags >>> bit) & 1}`, e, s2);
          d4Add(v, bin, 'vc', VC_NAME[cols.verticalCase[i]] ?? '?', e, s2);
          const z = e / sg, m = getOr(D4M, `${v}|${bin}|${ND_NAME[nd]}`, () => ({ n: 0, z1: 0, z2: 0, z3: 0, z4: 0 }));
          m.n += 1; m.z1 += z; m.z2 += z * z; m.z3 += z * z * z; m.z4 += z * z * z * z;
          const cell = pt * 32 + hc8 * 4 + season, mi = monthOf(ctx.month), c = D4C[`${v}|${bin}`], ci = cell * NMON + mi;
          if (mi < NMON) { c.n[ci] += 1; c.se[ci] += e; c.se2[ci] += e * e; }
          if (v === 't') tCounter += 1;
          if (mi < NMON && tCounter % d4Every === 0 && D4S.n < D4_CAP) { const k = D4S.n++; D4S.var[k] = v === 't' ? 0 : 1; D4S.bin[k] = bin; D4S.cell[k] = cell; D4S.mon[k] = mi; D4S.e[k] = e; D4S.sg[k] = sg; }
        }
      }

      // ── ws ───────────────────────────────────────────────────────────────────────────────────────────────────
      if (ctx.y.ff != null && pK.dist.windSpeed && pK.sigma.u != null && pK.sigma.v != null && fin(fu.ws[0]) && fu.ws[1] > 0) {
        const y = ctx.y.ff;
        const cu = climaS(site, 'u'), cv = climaS(site, 'v'), pu = climaP(site, 'u'), pv = climaP(site, 'v');
        if (cu && cv && pu && pv) {
          const au = climaAt(cu, cx), av = climaAt(cv, cx), bu = climaAt(pu, cx), bv = climaAt(pv, cx);
          const riceS = { kind: 'rice', nu: Math.hypot(au.mu, av.mu), sigma: Math.sqrt(0.5 * (au.sigma ** 2 + av.sigma ** 2)) };
          const riceP = { kind: 'rice', nu: Math.hypot(bu.mu, bv.mu), sigma: Math.sqrt(0.5 * (bu.sigma ** 2 + bv.sigma ** 2)) };
          const cube = { kind: 'rice', nu: fu.ws[0], sigma: fu.ws[1] };
          const riceK = { kind: 'rice', nu: Math.hypot(pK.mu.u, pK.mu.v), sigma: Math.sqrt(0.5 * (pK.sigma.u ** 2 + pK.sigma.v ** 2)) };
          const dK = pK.dist.windSpeed;
          const EK = meanOf(dK);
          let cK, pitK, spreadK, sdK;
          if (dK.kind === 'truncatedNormal') { cK = crpsTruncatedNormal(dK.mu, dK.sigma, 0, y); pitK = cdfOf(dK, y); spreadK = (quantileOf(dK, 0.8413) - quantileOf(dK, 0.1587)) / 2; sdK = tnSd(dK.mu, dK.sigma); }
          else { cK = crpsRice(dK, y); pitK = riceCdf(y, dK.nu, dK.sigma); spreadK = dK.sigma; sdK = riceSd(dK.nu, dK.sigma, EK); }
          const EC = meanOf(cube), cC = crpsRice(cube, y), pitC = riceCdf(y, cube.nu, cube.sigma), sdC = riceSd(cube.nu, cube.sigma, EC);
          const ES = meanOf(riceS), cS = crpsRice(riceS, y), EP = meanOf(riceP), cP = crpsRice(riceP, y);
          d1Add('ws', bin, 'K', d1Strata, EK - y, spreadK, sdK, pitK);
          d1Add('ws', bin, 'cube', d1Strata, EC - y, cube.sigma, sdC, pitC);
          const { m: ER, sd: sdR } = riceMoments(riceK.nu, riceK.sigma);
          const pitR = riceCdf(y, riceK.nu, riceK.sigma);
          d1Add('ws', bin, 'K-rice', ['all'], ER - y, riceK.sigma, sdR, pitR);
          d1Add('ws', bin, 'clima', ['all'], ES - y, riceS.sigma, riceSd(riceS.nu, riceS.sigma, ES), riceCdf(y, riceS.nu, riceS.sigma));
          d2Add('ws', leadH, route, site, { cK, cC, cS, cP, mK: Math.abs(EK - y), mC: Math.abs(EC - y), mS: Math.abs(ES - y), mP: Math.abs(EP - y), muS: ES, dKs: EK - ES, dys: y - ES, muP: EP, dKp: EK - EP, dyp: y - EP }, bin);
          wsCounter += 1;
          if (wsCounter % storeEvery === 0 && D3.n < D3_CAP) {
            const k = D3.n++;
            D3.bin[k] = bin; D3.y[k] = y; D3.E[k] = ER; D3.sd[k] = sdR; D3.cRice[k] = dK.kind === 'rice' ? cK : crpsRice(riceK, y); D3.cLaw[k] = cK; D3.pitLaw[k] = pitK; D3.meanLaw[k] = EK;
            D3.country[k] = COUNTRY_IDX[site.country] ?? 4; D3.band[k] = site.band === 'ge800' ? 1 : 0; D3.lnZ0[k] = ctx.z[Z_INDEX.lnZ0]; D3.tpi[k] = ctx.z[Z_INDEX.tpi2000]; D3.hTrue[k] = S.hTrueM; D3.hour[k] = hour3(sh); D3.law[k] = dK.kind === 'truncatedNormal' ? 1 : 0;
            D3.pitRice[k] = pitR; D3.meanRice[k] = ER;
          }
        } else dropNoClima += 1;
      }

      // ── gust ─────────────────────────────────────────────────────────────────────────────────────────────────
      if (ctx.y.gust != null && pK.dist.gust && fin(fu.gust[0]) && fu.gust[1] > 0) {
        const y = ctx.y.gust, dK = pK.dist.gust;
        const eS = climaS(site, 'gust'), eP = climaP(site, 'gust');
        if (eS && eP) {
          const mS = climaAt(eS, cx), mP = climaAt(eP, cx);
          const medK = Math.min(90, Math.max(0, dK.mu)), momK = censMoments(dK.mu, dK.sigma, 0, 90);
          d1Add('gust', bin, 'K', ['all'], medK - y, dK.sigma, momK.sd, pitOf(dK, y));
          const momS = censMoments(mS.mu, mS.sigma, 0, 90), momP = censMoments(mP.mu, mP.sigma, 0, 90);
          d2Add('gust', leadH, route, site, { cK: crpsCensoredNormal(dK.mu, dK.sigma, 0, 90, y), cC: crpsCensoredNormal(fu.gust[0], fu.gust[1], 0, 90, y), cS: crpsCensoredNormal(mS.mu, mS.sigma, 0, 90, y), cP: crpsCensoredNormal(mP.mu, mP.sigma, 0, 90, y), mK: Math.abs(medK - y), mC: Math.abs(Math.min(90, Math.max(0, fu.gust[0])) - y), mS: Math.abs(Math.min(90, Math.max(0, mS.mu)) - y), mP: Math.abs(Math.min(90, Math.max(0, mP.mu)) - y), muS: momS.E, dKs: momK.E - momS.E, dys: y - momS.E, muP: momP.E, dKp: momK.E - momP.E, dyp: y - momP.E }, bin);
        } else dropNoClima += 1;
      }

      // ── clct ─────────────────────────────────────────────────────────────────────────────────────────────────
      if (ctx.y.clct != null && pK.dist.clouds && fin(fu.clct[0]) && fu.clct[1] > 0) {
        const y = ctx.y.clct, dK = pK.dist.clouds, dC = { kind: 'censoredNormal', mu: fu.clct[0], sigma: fu.clct[1], lo: 0, hi: 100 };
        const eS = climaS(site, 'clct'), eP = climaP(site, 'clct');
        if (eS && eP) {
          const mS = climaAt(eS, cx), mP = climaAt(eP, cx);
          const medK = Math.min(100, Math.max(0, dK.mu)), medC = Math.min(100, Math.max(0, dC.mu));
          const momK = censMoments(dK.mu, dK.sigma, 0, 100), momC = censMoments(dC.mu, dC.sigma, 0, 100);
          const pitK = pitOf(dK, y), pitC = pitOf(dC, y);
          d1Add('clct', bin, 'K', d1Strata, medK - y, dK.sigma, momK.sd, pitK);
          d1Add('clct', bin, 'cube', d1Strata, medC - y, dC.sigma, momC.sd, pitC);
          d2Add('clct', leadH, route, site, { cK: crpsCensoredNormal(dK.mu, dK.sigma, 0, 100, y), cC: crpsCensoredNormal(dC.mu, dC.sigma, 0, 100, y), cS: crpsCensoredNormal(mS.mu, mS.sigma, 0, 100, y), cP: crpsCensoredNormal(mP.mu, mP.sigma, 0, 100, y), mK: Math.abs(medK - y), mC: Math.abs(medC - y), mS: Math.abs(Math.min(100, Math.max(0, mS.mu)) - y), mP: Math.abs(Math.min(100, Math.max(0, mP.mu)) - y), muS: mS.mu, dKs: dK.mu - mS.mu, dys: y - mS.mu, muP: mP.mu, dKp: dK.mu - mP.mu, dyp: y - mP.mu }, bin);
          if (site.country === 'DE') {
            const a = getOr(D6, `${bin}|${route}`, mkD6);
            a.n += 1; if (y <= 0.5) a.obs0 += 1; if (y >= 99.5) a.obs100 += 1;
            a.pK0 += Phi(-dK.mu / dK.sigma); a.pK100 += 1 - Phi((100 - dK.mu) / dK.sigma); a.pC0 += Phi(-dC.mu / dC.sigma); a.pC100 += 1 - Phi((100 - dC.mu) / dC.sigma);
            a.pitK[Math.min(9, Math.floor(pitK * 10))] += 1; a.pitC[Math.min(9, Math.floor(pitC * 10))] += 1;
            a.sseK += (medK - y) ** 2; a.sseC += (medC - y) ** 2; a.sigK += dK.sigma; a.sdK += momK.sd; a.varK += momK.sd ** 2; a.sigC += dC.sigma; a.sdC += momC.sd; a.varC += momC.sd ** 2; a.maeK += Math.abs(medK - y); a.maeC += Math.abs(medC - y);
            if (fin(cols.c_clct[i])) {
              const cc = cCls(cols.c_clct[i]), e = y - medK;
              for (const [ln, col] of [['clcl', cols.c_clcl], ['clcm', cols.c_clcm], ['clch', cols.c_clch]]) { if (!fin(col[i])) continue; const l = getOr(D6L, `${bin}|${cc}|${ln}|${lCls(col[i])}`, mkL); l.n += 1; l.sae += Math.abs(e); l.se += e; }
            }
          }
        } else dropNoClima += 1;
      }

      // ── precip ───────────────────────────────────────────────────────────────────────────────────────────────
      if (ctx.y.rr != null && fin(fu.pr[0]) && fin(fu.pr[1]) && fu.pr[2] > 0) {
        const y = ctx.y.rr, w = y >= 0.1 ? 1 : 0, w1 = y >= 1 ? 1 : 0;
        const dC = { kind: 'hurdleLogNormal', pDry: fu.pr[0], mu: fu.pr[1], sigma: fu.pr[2] };
        const dK = pK.dist.precipitation;
        const pP = predictPrecip(tbl, 'P', { ...sit, p: ctx.p, srcMask: ctx.pMask.precip, wetShare: ctx.wetShareP }, ctx.pDryCube);
        const dP = pP ? pP.dist : null;
        if (dP) {
          const a = getOr(D5, `${bin}|${route}|${dK ? 'KPC' : 'PC'}`, mkD5);
          a.n += 1; a.wet += w;
          const pC = 1 - dC.pDry, pPw = 1 - dP.pDry, pKw = dK ? 1 - dK.pDry : null;
          const ex1 = (d) => 1 - cdfOf(d, 1);
          a.b01.C += (pC - w) ** 2; a.b01.P += (pPw - w) ** 2; a.b1.C += (ex1(dC) - w1) ** 2; a.b1.P += (ex1(dP) - w1) ** 2;
          const cC = crpsOf(dC, y, 96), cPv = crpsOf(dP, y, 96), tgt = w ? a.cWet : a.cDry;
          tgt.C += cC; tgt.P += cPv;
          const rel = (cand, p) => { const r = getOr(D5R, `${bin}|${route}|${cand}`, mkRel)[Math.min(9, Math.floor(p * 10))]; r[0] += 1; r[1] += p; r[2] += w; };
          rel('C', pC); rel('P', pPw);
          if (dK) {
            const pA = 0.5 * (pKw + pC);
            a.b01.K += (pKw - w) ** 2; a.b01.A += (pA - w) ** 2; a.b1.K += (ex1(dK) - w1) ** 2; a.b1.A += (0.5 * (ex1(dK) + ex1(dC)) - w1) ** 2;
            tgt.K += crpsOf(dK, y, 96); tgt.AK += crpsOf({ kind: 'hurdleLogNormal', pDry: 1 - pA, mu: dK.mu, sigma: dK.sigma }, y, 96); tgt.AC += crpsOf({ kind: 'hurdleLogNormal', pDry: 1 - pA, mu: dC.mu, sigma: dC.sigma }, y, 96);
            rel('K', pKw); rel('A', pA);
            if (w) {
              const m = a.amt; m.n += 1; const ly = Math.log(y);
              m.pitK[Math.min(9, Math.floor(Phi((ly - dK.mu) / dK.sigma) * 10))] += 1; m.pitC[Math.min(9, Math.floor(Phi((ly - dC.mu) / dC.sigma) * 10))] += 1;
              m.maeK += Math.abs(Math.exp(dK.mu) - y); m.maeC += Math.abs(Math.exp(dC.mu) - y);
              if (y <= Math.exp(dK.mu + 1.2816 * dK.sigma)) m.covK += 1; if (y <= Math.exp(dC.mu + 1.2816 * dC.sigma)) m.covC += 1;
            }
          }
        }
        // predictors of wet occurrence: sources (t1/t2) and cube planes
        const tierN = cols.tier[i];
        if (tierN <= 2) for (let k = 0; k < 7; k++) { if (!(ctx.srcMask & (1 << k))) continue; const raw = cols[`s${k}_precip`][i]; if (!fin(raw)) continue; corrAdd(`${bin}|src${k}|wet`, w, raw >= 0.1 ? 1 : 0); corrAdd(`${bin}|src${k}|ln1p`, w, Math.log1p(Math.max(0, raw))); }
        if (fin(cols.m_precip[i])) corrAdd(`${bin}|member|ln1p`, w, Math.log1p(Math.max(0, cols.m_precip[i])));
        if (fin(cols.c_precip[i])) corrAdd(`${bin}|c_precip|ln1p`, w, Math.log1p(Math.max(0, cols.c_precip[i])));
        if (fin(cols.c_precip_q90[i])) corrAdd(`${bin}|c_precip_q90|ln1p`, w, Math.log1p(Math.max(0, cols.c_precip_q90[i])));
        if (fin(cols.c_precip_sd_ens[i])) corrAdd(`${bin}|c_precip_sd_ens|raw`, w, cols.c_precip_sd_ens[i]);
        if (fin(cols.c_precip_sd[i])) corrAdd(`${bin}|c_precip_sd|ln1p`, w, Math.log1p(Math.max(0, cols.c_precip_sd[i])));
        if (fin(fu.pr[0])) corrAdd(`${bin}|cubeHurdle|pWet`, w, 1 - fu.pr[0]);
      }
    }
  } });
  say(`${f.month} ${f.tier}: ${r.rows} Zeilen · benutzt ${used} · D3 ${D3.n} · D4 ${D4S.n} · ${Math.round((Date.now() - T0) / 1000)} s`);
}
const passS = Math.round((Date.now() - T0) / 1000);
say(`Durchlauf fertig: ${rows} Zeilen, ${used} benutzt, ${passS} s; ohne Klimatologie übersprungen ${dropNoClima}`);

// ── reductions ──────────────────────────────────────────────────────────────────────────────────────────────────────
const report = { builtAt: new Date().toISOString(), tables: 'fit/2026-09-25-ap8c/fusion.hindcast.json', rows, used, stride, storeEvery, d4Every, gridCap, months: files.map((f) => f.month).filter((m, i, a) => a.indexOf(m) === i), momentCheck, D1: {}, D2: { lead: {}, bin: {}, crossing: {}, strata: {} }, D3: {}, D4: {}, D5: {}, D6: {} };
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const f3 = (x) => (fin(x) ? x.toFixed(3) : '—');
const f2 = (x) => (fin(x) ? x.toFixed(2) : '—');
const f1 = (x) => (fin(x) ? x.toFixed(1) : '—');
const pct = (a, b) => (fin(a) && fin(b) && b !== 0 ? `${((100 * (a - b)) / b).toFixed(1)} %` : '—');
const md = [];

// D1
md.push('# diag-fx1 — Fehleranalyse Scorecard 4 (Fit 4, fusionFit@3), out of fold', '', `Erzeugt ${report.builtAt}; ${rows} Zeilen gelesen, ${used} benutzt (Stride ${stride}, alle Stufen, Monate ${report.months[0]}…${report.months[report.months.length - 1]}); Tabellen \`${report.tables}\`. Kandidaten wie \`score.mjs\`: fl-K mit den Falten-β des Dateimonats (Mittelwert und Hürde, out of fold); Varianz, σ-Skala, Speed-Gesetz, Menge und Klimatologie gepoolt (in-sample für diese Teile). Zensierte CRPS geschlossen (\`crpsCensoredNormal\`, ≤ 6e-6 vom Scorer-Integral). Auswahl je Größe like-for-like: nur Zeilen, an denen fl-K, Cube, Klima (Station = Scorer-Definition byPoint ?? pooled) UND Klima (gepoolt Band|Land) existieren (${dropNoClima} Zeilen×Größen ohne Klimatologie übersprungen).`, '');
md.push('## D1 Kalibrier-Artefakte (V-FL-39/42) — Spread des Scorers gegen die wahre Standardabweichung', '', 'Spread(Scorer) = latente σ (Normal, zensiert), σ je Komponente (Rice), (q84−q16)/2 (TN). sd(wahr) = geschlossen: TN-sd, Tobit-sd der zensierten Normal auf [lo, hi], Rice sd = √(2σ²+ν²−E²). Punktwert wie im Scorer (Mittel für Normal/Rice/TN, Median für zensiert). S/S₁ = mean(σ_Scorer)/RMSE, S/S₂ = mean(sd)/RMSE, S/S₃ = √(mean var)/RMSE. Alle Zahlen out of fold (fl-K-Mittelwert) bzw. gepoolt (σ). Momenten-Gegenprobe (geschlossen gegen 20 000-Knoten-Quantilgitter):', '');
for (const c of momentCheck) md.push(`- ${c.family} μ ${c.mu} σ ${c.sigma}${c.lo != null ? ` [${c.lo}, ${c.hi}]` : ''}: E ${c.closed.E.toFixed(4)} / ${c.grid.E.toFixed(4)} · sd ${c.closed.sd.toFixed(4)} / ${c.grid.sd.toFixed(4)} (Δsd ${c.dSd.toExponential(1)})`);
md.push('', '| Größe | Bin | Kandidat | Schicht | n | Bias | RMSE | σ Scorer | sd wahr | S/S₁ | S/S₂ | S/S₃ | PIT außen | PIT-Dezile (%) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const d1Keys = [...D1.keys()].sort((a, b) => { const A = a.split('|'), B = b.split('|'); const vo = ['t', 'td', 'ws', 'gust', 'clct']; return vo.indexOf(A[0]) - vo.indexOf(B[0]) || Number(A[1]) - Number(B[1]) || A[2].localeCompare(B[2]) || A[3].localeCompare(B[3]); });
for (const k of d1Keys) {
  const a = D1.get(k), [v, bin, cand, st] = k.split('|'), rmse = Math.sqrt(a.sse / a.n);
  const row = { n: a.n, bias: a.sumErr / a.n, rmse, sigmaScorer: a.sumSpread / a.n, sdTrue: a.sumSd / a.n, ss1: a.sumSpread / a.n / rmse, ss2: a.sumSd / a.n / rmse, ss3: Math.sqrt(a.sumVar / a.n) / rmse, pitOuter: a.outer / a.n, pit: Array.from(a.pit).map((c) => c / a.n) };
  report.D1[k] = row;
  md.push(`| ${v} | ${BIN_LABEL[bin]} | ${cand} | ${st} | ${a.n} | ${f3(row.bias)} | ${f3(rmse)} | ${f3(row.sigmaScorer)} | ${f3(row.sdTrue)} | ${f2(row.ss1)} | ${f2(row.ss2)} | ${f2(row.ss3)} | ${f3(row.pitOuter)} | ${row.pit.map((p) => (100 * p).toFixed(1)).join(' ')} |`);
}
md.push('');

// D2
const blendCrps = (v, muB, sgB, y) => (v === 't' || v === 'td' ? crpsNormal(muB, sgB, y) : v === 'clct' ? crpsCensoredNormal(muB, sgB, 0, 100, y) : crpsTruncatedNormal(muB, sgB, 0, y));
function reduceD2(a) {
  const n = a.n, bS = a.sxx > 0 ? a.sxy / a.sxx : NaN, bP = a.pxx > 0 ? a.pxy / a.pxx : NaN;
  const rhoS = a.sxx > 0 && a.syy > 0 ? (a.sxy - (a.sx * a.sy) / n) / Math.sqrt((a.sxx - (a.sx * a.sx) / n) * (a.syy - (a.sy * a.sy) / n)) : NaN;
  const rhoP = a.pxx > 0 && a.pyy > 0 ? (a.pxy - (a.px * a.py) / n) / Math.sqrt((a.pxx - (a.px * a.px) / n) * (a.pyy - (a.py * a.py) / n)) : NaN;
  const sgS = Math.sqrt(Math.max(1e-9, (a.syy - 2 * bS * a.sxy + bS * bS * a.sxx) / n)), sgP = Math.sqrt(Math.max(1e-9, (a.pyy - 2 * bP * a.pxy + bP * bP * a.pxx) / n));
  return { n, crps: { K: a.cK / n, cube: a.cC / n, clima: a.cS / n, climaPool: a.cP / n }, mae: { K: a.mK / n, cube: a.mC / n, clima: a.mS / n, climaPool: a.mP / n }, rmseK: Math.sqrt(a.syy / n - 2 * a.sxy / n + a.sxx / n), rmseClima: Math.sqrt(a.syy / n), rmseClimaPool: Math.sqrt(a.pyy / n), rho: rhoS, b: bS, sigmaBlend: sgS, rmseBlend: sgS, rhoPool: rhoP, bPool: bP, sigmaBlendPool: sgP };
}
function blendOnSample(v, keys, b, sgB, bP, sgP) {
  let n = 0, cB = 0, cBP = 0, cK = 0, cS = 0;
  for (const key of keys) { const s = D2S.get(key); if (!s) continue; for (let j = 0; j < s.k; j++) { const o = j * 6, muS = s.cols[o], dK = s.cols[o + 1], dy = s.cols[o + 2], muP = s.cols[o + 3], dKp = s.cols[o + 4], dyp = s.cols[o + 5]; const y = muS + dy; cB += blendCrps(v, muS + b * dK, sgB, y); cBP += blendCrps(v, muP + bP * dKp, sgP, muP + dyp); n += 1; } }
  return { n, crpsBlend: n ? cB / n : NaN, crpsBlendPool: n ? cBP / n : NaN };
}
md.push('## D2 Langer Vorlauf — je Vorlaufstunde (Schicht all, alle Routen)', '', 'CRPS/MAE von fl-K, Cube, Klima (Station, Scorer-Definition), Klima (gepoolt Band|Land). ρ = corr(μ_K − μ_c, y − μ_c), b = Steigung von (y − μ_c) auf (μ_K − μ_c) (b < 1 ⇒ Anomalie überkonfident), σ_b = Residuen-sd der Mischung μ_c + b(μ_K − μ_c) — b, σ_b in-sample je Vorlaufstunde (1 Parameter). CRPS Misch. = CRPS der Mischung (T/Td Normal, ws/Böe TN bei 0 auf den Erwartungswerten, Bewölkung zensiert [0,100] auf der latenten μ) auf einer Reservoir-Stichprobe je (Größe, Stunde) (n_S ≤ 4 000, deterministisch), Stat = Stations-μ_c, Pool = gepooltes μ_c. μ_K/μ_c: T/Td Mittel, ws/Böe Erwartungswert (K: Speed-Verteilung, Klima: Rice bzw. Tobit), Bewölkung latente μ.', '');
const VARS = ['t', 'td', 'ws', 'gust', 'clct'];
const leadsOf = (v) => [...new Set([...D2.keys()].filter((k) => k.startsWith(`${v}|`) && k.endsWith('|all')).map((k) => Number(k.split('|')[1])))].sort((a, b) => a - b);
for (const v of VARS) {
  md.push(`### ${v}`, '', '| Vorlauf h | n | CRPS K | Cube | Klima | Pool | MAE K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | RMSE Klima | RMSE Misch. | ρ Pool | b Pool | n_S | CRPS Misch. Stat | Pool |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  let cross = null; const seq = [];
  for (const L of leadsOf(v)) {
    const a = D2.get(`${v}|${L}|all`), r = reduceD2(a), s = blendOnSample(v, [`${v}|${L}`], r.b, r.sigmaBlend, r.bPool, r.sigmaBlendPool);
    Object.assign(r, s);
    report.D2.lead[`${v}|${L}`] = r;
    seq.push([L, r.crps.K, r.crps.clima]);
    if (cross == null && r.crps.K > r.crps.clima) cross = L;
    md.push(`| ${L} | ${r.n} | ${f3(r.crps.K)} | ${f3(r.crps.cube)} | ${f3(r.crps.clima)} | ${f3(r.crps.climaPool)} | ${f3(r.mae.K)} | ${f3(r.mae.cube)} | ${f3(r.mae.clima)} | ${f3(r.mae.climaPool)} | ${f2(r.rho)} | ${f2(r.b)} | ${f2(r.sigmaBlend)} | ${f3(r.rmseK)} | ${f3(r.rmseClima)} | ${f3(r.rmseBlend)} | ${f2(r.rhoPool)} | ${f2(r.bPool)} | ${s.n} | ${f3(s.crpsBlend)} | ${f3(s.crpsBlendPool)} |`);
  }
  // the last lead after which K stays below clima, and the first crossing
  let lastBelow = null; for (const [L, k, c] of seq) if (k < c) lastBelow = L;
  report.D2.crossing[v] = { firstAbove: cross, lastBelow, series: seq };
  md.push('', `Erste Vorlaufstunde mit CRPS fl-K > Klima (Station): **${cross ?? 'keine'}**; letzte Stunde mit fl-K < Klima: ${lastBelow ?? '—'}.`, '');
  // bins
  md.push(`Je Bin (${v}) — Summen der Stunden, b/σ_b je Bin in-sample; CRPS Misch. auf den vereinigten Stichproben der Stunden:`, '', '| Bin | n | CRPS K | Cube | Klima | Pool | MAE K | Klima | ρ | b | σ_b | RMSE K | Klima | Misch. | n_S | CRPS Misch. Stat | Pool |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (let bin = 0; bin < 6; bin++) {
    const acc = mkD2(); const keys = [];
    for (const L of leadsOf(v)) { if (D2B.get(`${v}|${L}`) !== bin) continue; const a = D2.get(`${v}|${L}|all`); for (const kk of Object.keys(acc)) acc[kk] += a[kk]; keys.push(`${v}|${L}`); }
    if (!acc.n) continue;
    const r = reduceD2(acc), s = blendOnSample(v, keys, r.b, r.sigmaBlend, r.bPool, r.sigmaBlendPool);
    Object.assign(r, s); report.D2.bin[`${v}|${bin}`] = r;
    md.push(`| ${BIN_LABEL[bin]} | ${r.n} | ${f3(r.crps.K)} | ${f3(r.crps.cube)} | ${f3(r.crps.clima)} | ${f3(r.crps.climaPool)} | ${f3(r.mae.K)} | ${f3(r.mae.clima)} | ${f2(r.rho)} | ${f2(r.b)} | ${f2(r.sigmaBlend)} | ${f3(r.rmseK)} | ${f3(r.rmseClima)} | ${f3(r.rmseBlend)} | ${s.n} | ${f3(s.crpsBlend)} | ${f3(s.crpsBlendPool)} |`);
  }
  md.push('');
}
// strata per bin for ws and t (and the others, cheap): country, band, route
md.push('### D2 je Schicht und Bin (Land, Band, Route) — CRPS K / Cube / Klima / Pool, ρ, b, RMSE K / Klima / Misch. (in-sample)', '', '| Größe | Bin | Schicht | n | CRPS K | Cube | Klima | Pool | ρ | b | σ_b | RMSE K | Klima | Misch. |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const STRATA = [...new Set([...D2.keys()].map((k) => k.split('|')[2]))].filter((s) => s !== 'all').sort();
for (const v of VARS) for (let bin = 0; bin < 6; bin++) for (const st of STRATA) {
  const acc = mkD2(); let any = false;
  for (const L of leadsOf(v)) { if (D2B.get(`${v}|${L}`) !== bin) continue; const a = D2.get(`${v}|${L}|${st}`); if (!a) continue; any = true; for (const kk of Object.keys(acc)) acc[kk] += a[kk]; }
  if (!any) continue;
  const r = reduceD2(acc); report.D2.strata[`${v}|${bin}|${st}`] = r;
  md.push(`| ${v} | ${BIN_LABEL[bin]} | ${st} | ${r.n} | ${f3(r.crps.K)} | ${f3(r.crps.cube)} | ${f3(r.crps.clima)} | ${f3(r.crps.climaPool)} | ${f2(r.rho)} | ${f2(r.b)} | ${f2(r.sigmaBlend)} | ${f3(r.rmseK)} | ${f3(r.rmseClima)} | ${f3(r.rmseBlend)} |`);
}
md.push('');
say(`D1/D2 reduziert · ${Math.round((Date.now() - T0) / 1000)} s`);

// D3
const A_G = Array.from({ length: 15 }, (_, i) => Math.round((-1.8 + 0.15 * i) * 100) / 100);
const B_G = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
const C_G = Array.from({ length: 11 }, (_, i) => Math.round((0.8 + 0.1 * i) * 10) / 10);
const N3 = D3.n;
const tnCrps = (mu, sg, y) => crpsTruncatedNormal(mu, sg, 0, y);
function gridRefit(idx) {
  // subsample evenly to gridCap rows
  const m = idx.length, step = m > gridCap ? m / gridCap : 1, sub = [];
  for (let t = 0; t < Math.min(m, gridCap); t++) sub.push(idx[Math.floor(t * step)]);
  let best = null;
  for (const b of B_G) for (const c of C_G) for (const a of A_G) {
    let s = 0;
    for (const k of sub) { const mu = a + b * D3.E[k], sg = Math.max(1e-3, c * D3.sd[k]); s += tnCrps(mu, sg, D3.y[k]); }
    if (!best || s < best.s) best = { a, b, c, s };
  }
  const edge = [best.a === A_G[0] || best.a === A_G[A_G.length - 1] ? 'a' : '', best.b === B_G[0] || best.b === B_G[B_G.length - 1] ? 'b' : '', best.c === C_G[0] || best.c === C_G[C_G.length - 1] ? 'c' : ''].filter(Boolean);
  return { a: best.a, b: best.b, c: best.c, nGrid: sub.length, edge };
}
function evalGroup(idx, law) {
  let n = 0, cOpt = 0, cLaw = 0, cRice = 0, bias = 0, mae = 0, outLaw = 0, outOpt = 0, outRice = 0, lawN = 0;
  for (const k of idx) { n += 1; cLaw += D3.cLaw[k]; cRice += D3.cRice[k]; bias += D3.meanLaw[k] - D3.y[k]; mae += Math.abs(D3.meanLaw[k] - D3.y[k]); if (D3.pitLaw[k] < 0.1 || D3.pitLaw[k] > 0.9) outLaw += 1; if (D3.pitRice[k] < 0.1 || D3.pitRice[k] > 0.9) outRice += 1; lawN += D3.law[k];
    if (law) { const mu = law.a + law.b * D3.E[k], sg = Math.max(1e-3, law.c * D3.sd[k]); cOpt += tnCrps(mu, sg, D3.y[k]); const p = cdfOf({ kind: 'truncatedNormal', mu, sigma: sg, lo: 0 }, D3.y[k]); if (p < 0.1 || p > 0.9) outOpt += 1; } }
  return { n, crpsLaw: cLaw / n, crpsRice: cRice / n, crpsOpt: law ? cOpt / n : null, bias: bias / n, mae: mae / n, pitOuterLaw: outLaw / n, pitOuterRice: outRice / n, pitOuterOpt: law ? outOpt / n : null, lawShare: lawN / n };
}
const GROUPS = {
  country: { of: (k) => D3.country[k], name: (g) => COUNTRY_NAME[g] },
  band: { of: (k) => D3.band[k], name: (g) => ['lt800', 'ge800'][g] },
  lnZ0: { of: (k) => cls3(D3.lnZ0[k], T_LNZ0), name: (g) => `lnZ0 T${g + 1}` },
  tpi2000: { of: (k) => cls3(D3.tpi[k], T_TPI), name: (g) => `tpi T${g + 1}` },
  height: { of: (k) => hClass(D3.hTrue[k]), name: (g) => H_NAME[g] },
  hour: { of: (k) => D3.hour[k], name: (g) => ND_NAME[g] },
};
md.push('## D3 Wind-Standortabhängigkeit (V-FL-38) — fl-K je Bin × Gruppe, Rice vor dem Gesetz, Gitter-Refit je Gruppe', '', `Gespeicherte ws-Zeilen: ${N3} (jede ${storeEvery}. Stride-Zeile). „Gesetz" = die geschriebene Speed-Verteilung des Stratums (TN, oder die Rice wo \`no-skill\`: Anteil „Gesetz aktiv" in der Spalte); „Rice" = die u/v-Rice vor dem Gesetz (out-of-fold μ, gepoolte σ). Refit: Gitter a ∈ {−1,8 … 0,3 / 0,15} × b ∈ {0,7 … 1,2} × c ∈ {0,8 … 1,8 / 0,1} (990 Tripel) per geschlossenem TN-CRPS auf ≤ ${gridCap} gleichmäßig gezogenen Zeilen der Gruppe, dann auf ALLEN Zeilen der Gruppe bewertet — **in-sample je Gruppe (keine Falten): eine Obergrenze für V-FL-38, kein Ergebnis.** Rand = Optimum am Gitterrand. Terzilgrenzen (Standortebene, 405 Punkte): lnZ0 ${T_LNZ0.map(f2).join(' / ')}, tpi2000 ${T_TPI.map((x) => f1(100 * x)).join(' / ')} m.`, '');
md.push('| Bin | Gruppe | n | Gesetz aktiv | Bias | MAE | CRPS Gesetz | CRPS Rice | PIT außen Gesetz | Rice | Optimum (a, b, c) | Rand | CRPS Opt | Δ vs Gesetz | Δ vs Rice | PIT außen Opt |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const binIdx = Array.from({ length: 6 }, () => []);
for (let k = 0; k < N3; k++) binIdx[D3.bin[k]].push(k);
const optima = {};
for (let bin = 0; bin < 6; bin++) {
  const all = binIdx[bin]; if (all.length < 1000) continue;
  const lawAll = gridRefit(all), rAll = evalGroup(all, lawAll);
  report.D3[`${bin}|all`] = { ...rAll, opt: lawAll }; optima[bin] = [];
  md.push(`| ${BIN_LABEL[bin]} | all | ${rAll.n} | ${f2(rAll.lawShare)} | ${f3(rAll.bias)} | ${f3(rAll.mae)} | ${f3(rAll.crpsLaw)} | ${f3(rAll.crpsRice)} | ${f3(rAll.pitOuterLaw)} | ${f3(rAll.pitOuterRice)} | (${lawAll.a}, ${lawAll.b}, ${lawAll.c}) | ${lawAll.edge.join('') || '—'} | ${f3(rAll.crpsOpt)} | ${pct(rAll.crpsOpt, rAll.crpsLaw)} | ${pct(rAll.crpsOpt, rAll.crpsRice)} | ${f3(rAll.pitOuterOpt)} |`);
  for (const [gn, g] of Object.entries(GROUPS)) {
    const by = new Map(); for (const k of all) { const gv = g.of(k); let arr = by.get(gv); if (!arr) { arr = []; by.set(gv, arr); } arr.push(k); }
    for (const gv of [...by.keys()].sort((a, b) => a - b)) {
      const idx = by.get(gv); if (idx.length < 2000) continue;
      const law = gridRefit(idx), r = evalGroup(idx, law);
      report.D3[`${bin}|${gn}:${g.name(gv)}`] = { ...r, opt: law }; optima[bin].push(law);
      md.push(`| ${BIN_LABEL[bin]} | ${gn}:${g.name(gv)} | ${r.n} | ${f2(r.lawShare)} | ${f3(r.bias)} | ${f3(r.mae)} | ${f3(r.crpsLaw)} | ${f3(r.crpsRice)} | ${f3(r.pitOuterLaw)} | ${f3(r.pitOuterRice)} | (${law.a}, ${law.b}, ${law.c}) | ${law.edge.join('') || '—'} | ${f3(r.crpsOpt)} | ${pct(r.crpsOpt, r.crpsLaw)} | ${pct(r.crpsOpt, r.crpsRice)} | ${f3(r.pitOuterOpt)} |`);
    }
  }
  say(`D3 Bin ${bin} Gitter fertig · ${Math.round((Date.now() - T0) / 1000)} s`);
}
// linear-in-features law per bin: a = a0 + a1·lnZ0 + a2·tpi2000(hm) + a3·h_true(km), b, c = median of the group optima
md.push('', '### D3 lineares Gesetz a = a0 + a1·lnZ0 + a2·tpi2000/100 + a3·h_true/1000 (b, c = Median der Gruppenoptima, Koordinatensuche in-sample je Bin)', '', '| Bin | n | b, c | a0 | a1 (lnZ0) | a2 (tpi hm) | a3 (h km) | CRPS linear | CRPS Gesetz | CRPS Rice | CRPS bestes globales Tripel | Δ linear vs Gesetz | Δ vs globales Optimum | PIT außen linear |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (let bin = 0; bin < 6; bin++) {
  const all = binIdx[bin]; if (all.length < 1000 || !optima[bin]?.length) continue;
  const bM = median(optima[bin].map((o) => o.b)), cM = median(optima[bin].map((o) => o.c));
  const evalLin = (p) => { let s = 0; for (const k of all) { const a = p[0] + p[1] * D3.lnZ0[k] + p[2] * D3.tpi[k] + p[3] * D3.hTrue[k] / 1000; s += tnCrps(a + bM * D3.E[k], Math.max(1e-3, cM * D3.sd[k]), D3.y[k]); } return s / all.length; };
  const grids = [Array.from({ length: 29 }, (_, i) => -2.7 + 0.15 * i), Array.from({ length: 25 }, (_, i) => -0.6 + 0.05 * i), Array.from({ length: 25 }, (_, i) => -0.6 + 0.05 * i), Array.from({ length: 31 }, (_, i) => -1.5 + 0.1 * i)];
  let p = [report.D3[`${bin}|all`].opt.a, 0, 0, 0], best = evalLin(p);
  for (let round = 0; round < 3; round++) for (let j = 0; j < 4; j++) { for (const g of grids[j]) { const q = [...p]; q[j] = g; const s = evalLin(q); if (s < best - 1e-9) { best = s; p = q; } } }
  let outer = 0; for (const k of all) { const a = p[0] + p[1] * D3.lnZ0[k] + p[2] * D3.tpi[k] + p[3] * D3.hTrue[k] / 1000; const pit = cdfOf({ kind: 'truncatedNormal', mu: a + bM * D3.E[k], sigma: Math.max(1e-3, cM * D3.sd[k]), lo: 0 }, D3.y[k]); if (pit < 0.1 || pit > 0.9) outer += 1; }
  const rAll = report.D3[`${bin}|all`];
  report.D3[`${bin}|linear`] = { n: all.length, b: bM, c: cM, a0: p[0], a1: p[1], a2: p[2], a3: p[3], crpsLinear: best, crpsLaw: rAll.crpsLaw, crpsRice: rAll.crpsRice, crpsGlobalOpt: rAll.crpsOpt, pitOuter: outer / all.length };
  md.push(`| ${BIN_LABEL[bin]} | ${all.length} | ${bM}, ${cM} | ${f2(p[0])} | ${f2(p[1])} | ${f2(p[2])} | ${f2(p[3])} | ${f3(best)} | ${f3(rAll.crpsLaw)} | ${f3(rAll.crpsRice)} | ${f3(rAll.crpsOpt)} | ${pct(best, rAll.crpsLaw)} | ${pct(best, rAll.crpsOpt)} | ${f3(outer / all.length)} |`);
}
md.push('');
say(`D3 fertig · ${Math.round((Date.now() - T0) / 1000)} s`);

// D4
md.push('## D4 T/Td-Plateau — Residuum e = y − μ_K (out of fold), Bins 0–3', '', '(a) bedingter Bias mean(e), Varianzverhältnis VR = mean(e²)/mean(σ_K²) (VR > 1 ⇒ σ zu klein), n. Zeilen: fl-K, Cube und beide Klimatologien vorhanden (wie D1/D2).', '');
const d4Table = (v, bin, scheme, title, order = null) => {
  const keys = [...D4.keys()].filter((k) => k.startsWith(`${v}|${bin}|${scheme}|`)).sort((a, b) => (order ? order(a) - order(b) : a.localeCompare(b)));
  if (!keys.length) return;
  md.push(`**${v} · ${BIN_LABEL[bin]} · ${title}**`, '', '| Gruppe | n | Bias | RMSE | √mean σ² | VR |', '|---|---|---|---|---|---|');
  for (const k of keys) { const a = D4.get(k); const g = k.split('|').slice(3).join('|'); const r = { n: a.n, bias: a.se / a.n, rmse: Math.sqrt(a.se2 / a.n), sigma: Math.sqrt(a.ss2 / a.n), vr: a.se2 / a.ss2 }; report.D4[k] = r; md.push(`| ${g} | ${a.n} | ${f3(r.bias)} | ${f3(r.rmse)} | ${f3(r.sigma)} | ${f2(r.vr)} |`); }
  md.push('');
};
// data-driven quantile classes for dTsfc (quintiles) and c_clct (terciles) from the fine-bin sums (row-weighted over the D4 rows)
function quantileMerge(v, bin, scheme, nQ, labelOf, sub = '') {
  const keys = [...D4.keys()].filter((k) => k.startsWith(`${v}|${bin}|${scheme}|`) && (sub ? k.endsWith(`|${sub}`) : true));
  const rowsK = keys.map((k) => ({ fb: Number(k.split('|')[3]), a: D4.get(k) })).sort((x, y) => x.fb - y.fb);
  const total = rowsK.reduce((s, r) => s + r.a.n, 0); if (!total) return [];
  const out = []; let cum = 0, cur = { n: 0, se: 0, se2: 0, ss2: 0, from: rowsK[0]?.fb, to: null }, q = 1;
  for (const r of rowsK) { cur.n += r.a.n; cur.se += r.a.se; cur.se2 += r.a.se2; cur.ss2 += r.a.ss2; cur.to = r.fb; cum += r.a.n; if (cum >= (q * total) / nQ && q < nQ) { out.push(cur); cur = { n: 0, se: 0, se2: 0, ss2: 0, from: r.fb + 1, to: null }; q += 1; } }
  if (cur.n) out.push(cur);
  return out.map((c, i) => ({ label: `Q${i + 1} ${labelOf(c.from)}…${labelOf(c.to + 1)}`, n: c.n, bias: c.se / c.n, rmse: Math.sqrt(c.se2 / c.n), sigma: Math.sqrt(c.ss2 / c.n), vr: c.se2 / c.ss2 }));
}
for (const v of ['t', 'td']) for (let bin = 0; bin < 4; bin++) {
  d4Table(v, bin, 'hs', 'Sonnenstunde (8 × 3 h) × Saison', (k) => { const [h, s] = k.split('|').slice(3); return SEASON.indexOf(s) * 8 + Number(h); });
  const dq = quantileMerge(v, bin, 'dT', 5, (fb) => `${(-30 + 0.5 * fb).toFixed(1)} K`);
  if (dq.length) { md.push(`**${v} · ${BIN_LABEL[bin]} · dTsfc-Quintile (Entkopplungs-Proxy, zeilengewichtet)**`, '', '| Gruppe | n | Bias | RMSE | √mean σ² | VR |', '|---|---|---|---|---|---|'); for (const r of dq) { report.D4[`${v}|${bin}|dTq|${r.label}`] = r; md.push(`| ${r.label} | ${r.n} | ${f3(r.bias)} | ${f3(r.rmse)} | ${f3(r.sigma)} | ${f2(r.vr)} |`); } md.push(''); }
  for (const nd of ND_NAME) { const cq = quantileMerge(v, bin, 'cl', 3, (fb) => `${5 * fb} %`, nd); if (cq.length) { md.push(`**${v} · ${BIN_LABEL[bin]} · Gesamtbewölkung c_clct Terzile × ${nd}**`, '', '| Gruppe | n | Bias | RMSE | √mean σ² | VR |', '|---|---|---|---|---|---|'); for (const r of cq) { report.D4[`${v}|${bin}|clq|${nd}|${r.label}`] = r; md.push(`| ${r.label} | ${r.n} | ${f3(r.bias)} | ${f3(r.rmse)} | ${f3(r.sigma)} | ${f2(r.vr)} |`); } md.push(''); } }
  d4Table(v, bin, 'wind', 'Cube-10-m-Wind (< 2 m/s ruhig / Rest) × Nacht/Tag');
  d4Table(v, bin, 'tpi', 'tpi2000-Terzil × Senke (sinkDepth > 0)');
  d4Table(v, bin, 'band', 'Höhenband'); d4Table(v, bin, 'route', 'Route (1 run, 2 day0, 3 dyn)'); d4Table(v, bin, 'flag', 'Motor-Flags (Bit gesetzt 1 / 0)'); d4Table(v, bin, 'vc', 'Vertikalfall (A/B/C/std)');
}
// (b) per-site upper bound
md.push('### D4 (b) Je-Standort-Obergrenze: Bias je (Punkt, Sonnenstunde 8, Saison 4), leave-one-month-out (Mittel der übrigen Monate, nur wo n_other ≥ 30) und in-sample', '', 'RMSE aus den vollen Summen (exakt); CRPS (σ unverändert) auf der Stichprobe jeder ' + d4Every + '. Zeile (n_S). „Alle" = unkorrigierte Zeilen behalten ihr Residuum; „nur korrigiert" = nur Zellen mit n_other ≥ 30. **Braucht eine Station am Punkt — nicht übertragbar.**', '', '| Größe | Bin | n | Anteil korrigiert | RMSE vorher | LOMO alle | LOMO nur korr. (vorher → nachher) | in-sample alle | n_S | CRPS vorher | LOMO | in-sample |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
const NM = monthIdx.size;
for (const v of ['t', 'td']) for (let bin = 0; bin < 4; bin++) {
  const c = D4C[`${v}|${bin}`]; let n = 0, sseB = 0, sseL = 0, sseI = 0, nCorr = 0, sseCb = 0, sseCa = 0;
  const cellAll = new Float64Array(CELLS * 3);
  for (let cell = 0; cell < CELLS; cell++) { let cn = 0, cs = 0, cs2 = 0; for (let m = 0; m < NM; m++) { const ci = cell * NMON + m; cn += c.n[ci]; cs += c.se[ci]; cs2 += c.se2[ci]; } cellAll[cell * 3] = cn; cellAll[cell * 3 + 1] = cs; cellAll[cell * 3 + 2] = cs2; }
  for (let cell = 0; cell < CELLS; cell++) {
    const cn = cellAll[cell * 3], cs = cellAll[cell * 3 + 1]; if (!cn) continue;
    for (let m = 0; m < NM; m++) {
      const ci = cell * NMON + m, nm = c.n[ci]; if (!nm) continue;
      const sem = c.se[ci], se2m = c.se2[ci]; n += nm; sseB += se2m;
      const no = cn - nm; if (no >= 30) { const bl = (cs - sem) / no; const after = se2m - 2 * bl * sem + nm * bl * bl; sseL += after; nCorr += nm; sseCb += se2m; sseCa += after; } else sseL += se2m;
      if (cn >= 30) { const bi = cs / cn; sseI += se2m - 2 * bi * sem + nm * bi * bi; } else sseI += se2m;
    }
  }
  let nS = 0, cB = 0, cL = 0, cI = 0;
  for (let k = 0; k < D4S.n; k++) {
    if (D4S.var[k] !== (v === 't' ? 0 : 1) || D4S.bin[k] !== bin) continue;
    const cell = D4S.cell[k], m = D4S.mon[k], ci = cell * NMON + m, e = D4S.e[k], sg = D4S.sg[k];
    const cn = cellAll[cell * 3], cs = cellAll[cell * 3 + 1], no = cn - c.n[ci];
    const bl = no >= 30 ? (cs - c.se[ci]) / no : 0, bi = cn >= 30 ? cs / cn : 0;
    nS += 1; cB += crpsNormal(0, sg, e); cL += crpsNormal(bl, sg, e); cI += crpsNormal(bi, sg, e);
  }
  const r = { n, corrShare: nCorr / n, rmseBefore: Math.sqrt(sseB / n), rmseLomo: Math.sqrt(sseL / n), rmseLomoCorrOnly: nCorr ? [Math.sqrt(sseCb / nCorr), Math.sqrt(sseCa / nCorr)] : null, rmseInSample: Math.sqrt(sseI / n), nS, crpsBefore: cB / nS, crpsLomo: cL / nS, crpsInSample: cI / nS };
  report.D4[`${v}|${bin}|site`] = r;
  md.push(`| ${v} | ${BIN_LABEL[bin]} | ${n} | ${f2(r.corrShare)} | ${f3(r.rmseBefore)} | ${f3(r.rmseLomo)} (${pct(r.rmseLomo, r.rmseBefore)}) | ${r.rmseLomoCorrOnly ? `${f3(r.rmseLomoCorrOnly[0])} → ${f3(r.rmseLomoCorrOnly[1])}` : '—'} | ${f3(r.rmseInSample)} (${pct(r.rmseInSample, r.rmseBefore)}) | ${nS} | ${f3(r.crpsBefore)} | ${f3(r.crpsLomo)} (${pct(r.crpsLomo, r.crpsBefore)}) | ${f3(r.crpsInSample)} (${pct(r.crpsInSample, r.crpsBefore)}) |`);
}
md.push('', '### D4 (c) Standardisiertes Residuum z = e/σ_K — Momente je Bin × Nacht/Tag (Gauß: Schiefe 0, Exzess-Kurtosis 0)', '', '| Größe | Bin | Klasse | n | mean z | sd z | Schiefe | Exzess-Kurtosis |', '|---|---|---|---|---|---|---|---|');
for (const k of [...D4M.keys()].sort()) { const m = D4M.get(k), n = m.n, m1 = m.z1 / n, m2 = m.z2 / n, m3 = m.z3 / n, m4 = m.z4 / n; const va = m2 - m1 * m1, sk = (m3 - 3 * m1 * m2 + 2 * m1 ** 3) / va ** 1.5, ku = (m4 - 4 * m1 * m3 + 6 * m1 * m1 * m2 - 3 * m1 ** 4) / (va * va) - 3; const [v, bin, nd] = k.split('|'); report.D4[`${k}|moments`] = { n, mean: m1, sd: Math.sqrt(va), skew: sk, exKurt: ku }; md.push(`| ${v} | ${BIN_LABEL[bin]} | ${nd} | ${n} | ${f3(m1)} | ${f3(Math.sqrt(va))} | ${f2(sk)} | ${f2(ku)} |`); }
md.push('');
say(`D4 fertig · ${Math.round((Date.now() - T0) / 1000)} s`);

// D5
md.push('## D5 Niederschlag je Bin × Route — Brier, CRPS trocken/nass, Menge|nass, Reliability, Prädiktoren', '', 'Zeilen: Cube-Hürde und fl-P (Klasse der Zeile, `predictPrecip`) vorhanden; Satz KPC = zusätzlich fl-K (Falten-β, out of fold) vorhanden, PC = fl-K fehlt (`no-skill`/zu kurz). „Mittel" = Hürde mit dem ungewichteten Mittel der Nässewahrscheinlichkeiten von fl-K und Cube (CRPS: Menge von K bzw. Cube). Trocken/nass: y < 0,1 / ≥ 0,1 mm/h.', '', '| Bin | Route | Satz | n | nass | Brier(0,1) K | Cube | P | Mittel | Brier(1) K | Cube | P | Mittel | CRPS K | Cube | P | Mittel(K-Menge) | Mittel(C-Menge) | CRPS trocken K / Cube / P | CRPS nass K / Cube / P |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of [...D5.keys()].sort()) {
  const a = D5.get(k), n = a.n, nd = n - a.wet, nw = a.wet, hasK = k.endsWith('KPC');
  const r = { n, wetShare: nw / n, brier01: { K: hasK ? a.b01.K / n : null, cube: a.b01.C / n, P: a.b01.P / n, avg: hasK ? a.b01.A / n : null }, brier1: { K: hasK ? a.b1.K / n : null, cube: a.b1.C / n, P: a.b1.P / n, avg: hasK ? a.b1.A / n : null }, crps: { K: hasK ? (a.cDry.K + a.cWet.K) / n : null, cube: (a.cDry.C + a.cWet.C) / n, P: (a.cDry.P + a.cWet.P) / n, avgK: hasK ? (a.cDry.AK + a.cWet.AK) / n : null, avgC: hasK ? (a.cDry.AC + a.cWet.AC) / n : null }, crpsDry: { K: hasK ? a.cDry.K / nd : null, cube: a.cDry.C / nd, P: a.cDry.P / nd }, crpsWet: { K: hasK ? a.cWet.K / nw : null, cube: a.cWet.C / nw, P: a.cWet.P / nw }, amount: hasK && a.amt.n ? { n: a.amt.n, pitK: Array.from(a.amt.pitK).map((x) => x / a.amt.n), pitC: Array.from(a.amt.pitC).map((x) => x / a.amt.n), maeMedianK: a.amt.maeK / a.amt.n, maeMedianC: a.amt.maeC / a.amt.n, coverQ90K: a.amt.covK / a.amt.n, coverQ90C: a.amt.covC / a.amt.n } : null };
  report.D5[k] = r;
  const [bin, route, set] = k.split('|');
  md.push(`| ${BIN_LABEL[bin]} | ${route} | ${set} | ${n} | ${f3(r.wetShare)} | ${f3(r.brier01.K)} | ${f3(r.brier01.cube)} | ${f3(r.brier01.P)} | ${f3(r.brier01.avg)} | ${f3(r.brier1.K)} | ${f3(r.brier1.cube)} | ${f3(r.brier1.P)} | ${f3(r.brier1.avg)} | ${f3(r.crps.K)} | ${f3(r.crps.cube)} | ${f3(r.crps.P)} | ${f3(r.crps.avgK)} | ${f3(r.crps.avgC)} | ${f3(r.crpsDry.K)} / ${f3(r.crpsDry.cube)} / ${f3(r.crpsDry.P)} | ${f3(r.crpsWet.K)} / ${f3(r.crpsWet.cube)} / ${f3(r.crpsWet.P)} |`);
}
md.push('', '### D5 Menge | nass (Satz KPC): PIT-Histogramm der Log-Normal-Menge, MAE des Medians, Abdeckung q90', '', '| Bin | Route | n nass | PIT K (Dezile %) | PIT Cube | MAE Median K | Cube | q90-Abdeckung K | Cube |', '|---|---|---|---|---|---|---|---|---|');
for (const k of [...D5.keys()].sort()) { const r = report.D5[k]; if (!r.amount) continue; const [bin, route] = k.split('|'); md.push(`| ${BIN_LABEL[bin]} | ${route} | ${r.amount.n} | ${r.amount.pitK.map((p) => (100 * p).toFixed(0)).join(' ')} | ${r.amount.pitC.map((p) => (100 * p).toFixed(0)).join(' ')} | ${f3(r.amount.maeMedianK)} | ${f3(r.amount.maeMedianC)} | ${f3(r.amount.coverQ90K)} | ${f3(r.amount.coverQ90C)} |`); }
md.push('', '### D5 Reliability bei 0,1 mm/h (10 Klassen der Vorhersagewahrscheinlichkeit: n / mittlere Vorhersage / beobachtete Rate)', '', '| Bin | Route | Kandidat | 0–10 | 10–20 | 20–30 | 30–40 | 40–50 | 50–60 | 60–70 | 70–80 | 80–90 | 90–100 |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of [...D5R.keys()].sort()) { const bins = D5R.get(k), [bin, route, cand] = k.split('|'); report.D5[`rel|${k}`] = bins.map(([n, fp, fo]) => ({ n, fc: n ? fp / n : null, obs: n ? fo / n : null })); md.push(`| ${BIN_LABEL[bin]} | ${route} | ${{ K: 'fl-K', C: 'cube', P: 'fl-P', A: 'Mittel' }[cand]} | ${bins.map(([n, fp, fo]) => (n ? `${n} / ${(fp / n).toFixed(2)} / ${(fo / n).toFixed(2)}` : '—')).join(' | ')} |`); }
md.push('', '### D5 Prädiktoren des Auftretens (punktbiseriale Korrelation von nass(y ≥ 0,1) mit dem Prädiktor; Quellen s0…s6 = icon_d2, icon_ch1_eps, icon_eu, ifs_hres, aifs_single, icon_ch2_eps, icon_global; nur Stufen t1/t2 für die Quellen)', '', '| Bin | Prädiktor | n | r |', '|---|---|---|---|');
const SRC = ['icon_d2', 'icon_ch1_eps', 'icon_eu', 'ifs_hres', 'aifs_single', 'icon_ch2_eps', 'icon_global'];
for (const k of [...D5X.keys()].sort((a, b) => Number(a.split('|')[0]) - Number(b.split('|')[0]) || a.localeCompare(b))) { const a = D5X.get(k), n = a.n, mw = a.sw / n, mx = a.sx / n, cov = a.swx / n - mw * mx, vw = mw * (1 - mw), vx = a.sxx / n - mx * mx; const r = vw > 0 && vx > 0 ? cov / Math.sqrt(vw * vx) : NaN; const [bin, x, tr] = k.split('|'); const name = x.startsWith('src') ? `${SRC[Number(x.slice(3))]} ${tr}` : `${x} ${tr}`; report.D5[`corr|${k}`] = { n, r }; md.push(`| ${BIN_LABEL[bin]} | ${name} | ${n} | ${f3(r)} |`); }
md.push('');
say(`D5 fertig · ${Math.round((Date.now() - T0) / 1000)} s`);

// D6
md.push('## D6 Bewölkung (DE) je Bin × Route — Atome, PIT, Spread/Skill korrigiert, Schichtbewölkung', '', 'P(0)/P(100) der zensierten Normal (fl-K mit geschriebener Skala; Cube) gegen die beobachteten Atome P(y ≤ 0,5 %) / P(y ≥ 99,5 %). S/S₁ = latente σ / RMSE(Median), S/S₂ = Tobit-sd / RMSE.', '', '| Bin | Route | n | obs 0 | obs 100 | P0 K | P100 K | P0 Cube | P100 Cube | RMSE K | S/S₁ K | S/S₂ K | RMSE Cube | S/S₁ Cube | S/S₂ Cube | PIT außen K | Cube | PIT K (Dezile %) | PIT Cube |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of [...D6.keys()].sort()) { const a = D6.get(k), n = a.n, rK = Math.sqrt(a.sseK / n), rC = Math.sqrt(a.sseC / n); const r = { n, obs0: a.obs0 / n, obs100: a.obs100 / n, pK0: a.pK0 / n, pK100: a.pK100 / n, pC0: a.pC0 / n, pC100: a.pC100 / n, rmseK: rK, ss1K: a.sigK / n / rK, ss2K: a.sdK / n / rK, ss3K: Math.sqrt(a.varK / n) / rK, rmseC: rC, ss1C: a.sigC / n / rC, ss2C: a.sdC / n / rC, pitK: Array.from(a.pitK).map((x) => x / n), pitC: Array.from(a.pitC).map((x) => x / n), maeK: a.maeK / n, maeC: a.maeC / n }; r.pitOuterK = r.pitK[0] + r.pitK[9]; r.pitOuterC = r.pitC[0] + r.pitC[9]; report.D6[k] = r; const [bin, route] = k.split('|'); md.push(`| ${BIN_LABEL[bin]} | ${route} | ${n} | ${f3(r.obs0)} | ${f3(r.obs100)} | ${f3(r.pK0)} | ${f3(r.pK100)} | ${f3(r.pC0)} | ${f3(r.pC100)} | ${f2(rK)} | ${f2(r.ss1K)} | ${f2(r.ss2K)} | ${f2(rC)} | ${f2(r.ss1C)} | ${f2(r.ss2C)} | ${f3(r.pitOuterK)} | ${f3(r.pitOuterC)} | ${r.pitK.map((p) => (100 * p).toFixed(0)).join(' ')} | ${r.pitC.map((p) => (100 * p).toFixed(0)).join(' ')} |`); }
md.push('', '### D6 MAE/Bias des fl-K-Medians nach Klasse der Schicht-Bewölkung (c_clcl/c_clcm/c_clch < 20 / 20–80 / > 80 %) bei gleicher Klasse der Gesamtbewölkung c_clct (< 33 / 33–67 / > 67 %)', '', '| Bin | c_clct-Klasse | Schicht | Schicht-Klasse | n | MAE | Bias (y − Median) |', '|---|---|---|---|---|---|---|');
for (const k of [...D6L.keys()].sort()) { const a = D6L.get(k), [bin, cc, layer, lc] = k.split('|'); const r = { n: a.n, mae: a.sae / a.n, bias: a.se / a.n }; report.D6[`layer|${k}`] = r; md.push(`| ${BIN_LABEL[bin]} | ${['<33', '33–67', '>67'][cc]} | ${layer} | ${['<20', '20–80', '>80'][lc]} | ${a.n} | ${f2(r.mae)} | ${f2(r.bias)} |`); }
md.push('');

report.runtimeS = Math.round((Date.now() - T0) / 1000); report.passS = passS;
writeFileSync(outPath, JSON.stringify(report));
writeFileSync(mdPath, md.join('\n'));
say(`geschrieben ${outPath} + ${mdPath}; Durchlauf ${Math.round(passS / 60)} min, gesamt ${Math.round(report.runtimeS / 60)} min`);
