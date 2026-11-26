#!/usr/bin/env node
/**
 * GM-11 phase 1b — hindcast check, stage A run: the same snow model with station forcing S and with the forcing buscosun Fusion would have
 * delivered (H, built by gm11-hindcast-forcing.mjs). Rule: gm11-hindcast-frozen.md (sha256 checked). Measurement only: nothing is fitted,
 * nothing is written but `--out` (full, cache) and `--public` (without measured values per glacier-winter, E-GL-17).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-hindcast.mjs \
 *     --gm3=<gm3 cache> --w26=<gm11/w26 cache> --gm10=<gm10/predict> --data=<static build dir> --forcing=<dir of H files> \
 *     --points=<dir with winter/*.dat of GLAMOS point release 2026> --out=<full json> --public=<json for the repo>
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadWinters } from '../../scripts/glacier/snowcal-fit.mjs';
import { attachRadiation, scoreOf } from '../../scripts/glacier/snowcal-fit2.mjs';
import { glacierRunOf } from '../../scripts/glacier/lib/snowcalGlaciers.mjs';
import { precipRunOf } from '../../scripts/glacier/lib/snowcal.mjs';
import { predictOf } from '../../scripts/glacier/lib/snowcalPredict.mjs';
import { MELT, emptyState, simulate, cosZenith, clearSky, cloudFactor } from '../../scripts/glacier/lib/meltcore.mjs';
import { fillShortGaps } from '../../scripts/glacier/melt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const H = 3_600_000;
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const freeMb = () => Math.round(os.freemem() / 2 ** 20);

// ---- the frozen rule ----
const frozen = readFileSync(join(HERE, 'gm11-hindcast-frozen.md'), 'utf8').replace(/\r\n/g, '\n');
const sha = createHash('sha256').update(frozen).digest('hex');
const want = readFileSync(join(HERE, 'gm11-hindcast-frozen.sha256'), 'utf8').trim().split(/\s+/)[0];
if (sha !== want) throw new Error(`Regel geändert: ${sha} ≠ ${want}`);
const RULE = Object.freeze({ up: 1.25, down: 0.75, precipShare: 0.5, bridge: [0.8, 1.25], draws: 1000, seed: 2026, kLo: 0.2, kHi: 8, wet: 0.1, bandM: 250 });

const GLACIERS = Object.freeze([
  ['B36-26', 'gl_ch_grosser-aletschgletscher', 'Grosser Aletsch', 'aletsch'],
  ['C14-10', 'gl_ch_ghiacciaio-del-basodino', 'Basòdino', 'basodino'],
  ['E23-16', 'gl_ch_vadret-dal-murtel-g009821e46407n', 'Murtèl', 'murtel'],
  ['B43-03', 'gl_ch_rhonegletscher', 'Rhone', 'rhone'],
  ['E23-18', 'gl_ch_vadret-dal-corvatsch-s', 'Corvatsch', 'corvatsch'],
  ['B56-03', 'gl_ch_findelgletscher', 'Findelen', 'findelen'],
]);
const WINTERS = Object.freeze([2024, 2025, 2026]);
const NOTE = { 2024: '', 2025: 'Tresor des Prüfstands: nur gemessen', 2026: 'einmal mit S gesehen (§3q.4); im Fit-Zeitraum der Lernstufe 5e' };

// ---- tables of the bases (as gm11-winter26.mjs) ----
const cal = J(join(REPO, 'scripts/glacier/melt-calibration.json')).fit, m = { model: 'eti', TF: cal.TF, SRF: cal.SRF };
const catalog = J(join(args.data, 'catalog.json')).glaciers, byId = new Map(catalog.map((g) => [g.id, g]));
const precip = precipRunOf(J(join(REPO, 'scripts/glacier/snow-calibration.json')), [...new Set(catalog.map((g) => g.region))]);
const ownDoc = J(join(REPO, 'scripts/glacier/snow-calibration-glaciers.json'));
const ownF = glacierRunOf(ownDoc, { factor: true }, new Set(byId.keys())), ownS = glacierRunOf(ownDoc, { factor: true, shape: true }, new Set(byId.keys()));
const predDoc = J(join(REPO, 'scripts/glacier/snow-factor-predicted-ch.json')), model = predDoc.model;
const x1 = J(join(args.gm10, 'forcing', 'x1-ch.json')).glaciers, preds = J(join(args.gm10, 'predictors-ch.json')).glaciers;
const clampOwn = (F) => Math.min(model.cal.own[1], Math.max(model.cal.own[0], F));
const basesOf = (rec) => {
  const out = {}, FL = precip.factorOf(rec.region);
  out.country = { F: FL, kb: rec.b.map(() => FL) };
  const Fo = ownF.factorOf(rec.catId);
  if (Fo != null) {
    out.own = { F: Fo, kb: rec.b.map(() => Fo) };
    const corr = ownS.corrOf(rec.catId, rec.b.map((x) => x.z), rec.b.map((x) => x.w));
    if (corr) out.ownShape = { F: Fo, kb: corr.map((c) => Fo * c) };
  }
  const g = byId.get(rec.catId), xr = x1[rec.catId], pr = preds[rec.catId];
  if (g && xr?.x1 != null && pr) { const Fc = clampOwn(predictOf(model, [xr.x1, g.z[1], pr.north])); out.predicted = { F: Fc, kb: rec.b.map(() => Fc) }; }
  return out;
};
const BASES = ['country', 'own', 'ownShape', 'predicted'];

// ---- S records ----
const tmp = mkdtempSync(join(tmpdir(), 'gm11-hc-'));
const keys = new Set(GLACIERS.map((g) => g[0]));
const subTruth = (doc, years, name, t1 = null) => { const p = join(tmp, name); writeFileSync(p, JSON.stringify({ ...doc, gy: doc.gy.filter((o) => o.country === 'CH' && keys.has(o.key) && years.includes(o.year)).map((o) => (t1 ? { ...o, t1: `${o.year}-${t1}` } : o)) })); return p; };
const prep = (truthPath, cache) => { const { winters, fromMs, unusable } = loadWinters({ truthPath, cache }); attachRadiation(winters, (id) => J(join(cache, `rad-${id}.json`)), fromMs); return { winters, unusable }; };
const gm3Truth = J(join(args.gm3, 'truth', 'gy.json')), w26Truth = J(join(args.w26, 'gy-2526.json'));
const A = prep(subTruth(gm3Truth, [2024, 2025], 'a.json'), args.gm3), B = prep(subTruth(w26Truth, [2026], 'b.json'), args.w26);
const recs = [...A.winters, ...B.winters].sort((a, b) => a.key.localeCompare(b.key) || a.year - b.year);
// long records (until 31 May) for the point measurements
const AL = prep(subTruth(gm3Truth, [2024, 2025], 'al.json', '05-30'), args.gm3), BL = prep(subTruth(w26Truth, [2026], 'bl.json', '05-30'), args.w26);
const longOf = (key, year) => [...AL.winters, ...BL.winters].find((r) => r.key === key && r.year === year) ?? null;

// ---- the core, with phase temperature apart from melt temperature (copy of `simulate`; Kontrolle A proves it bitwise) ----
function simX({ bands, ela, t, g, p, zT, zP, pf, TF, SRF, ddf = null, state, model: mdl = 'eti', accumulateOnly = false, pGrad = MELT.pGrad, corr: corrIn = null, tPh = null, zPh = null, fsFn = null }) {
  const nb = bands.zb.length, n = t.length;
  const swe = Float64Array.from(state.swe), aS = Float64Array.from(state.aS);
  const bal = new Float64Array(nb);
  const meltH = new Float64Array(n);
  const decay = Math.exp(-1 / MELT.tauH);
  const aBare = bands.zb.map((z) => (z < ela ? MELT.aIce : MELT.aFirn));
  const corr = corrIn ?? bands.zb.map((z) => 1 + (pGrad * (z - zP)) / 100);
  for (let h = 0; h < n; h++) {
    const th = t[h], ph = Number.isFinite(p[h]) ? p[h] : 0, gh = Number.isFinite(g?.[h]) ? g[h] : 0;
    let mh = 0;
    for (let b = 0; b < nb; b++) {
      const Tb = th + MELT.gamma * (bands.zb[b] - zT);
      const Tp = tPh ? tPh[h] + MELT.gamma * (bands.zb[b] - zPh) : Tb;
      const fs = fsFn ? fsFn(h, bands.zb[b]) : Number.isNaN(Tp) ? 0.5 : Math.min(1, Math.max(0, (MELT.fsWarm - Tp) / (MELT.fsWarm - MELT.fsCold)));
      const S = pf * ph * corr[b] * fs;
      swe[b] += S;
      aS[b] = S > 0 ? aS[b] + (MELT.aFresh - aS[b]) * Math.min(1, S / 5) : MELT.aFirnSnow + (aS[b] - MELT.aFirnSnow) * decay;
      let melt = 0;
      if (!accumulateOnly && !Number.isNaN(th)) {
        if (mdl === 'eti') {
          const Ti = Tb <= 0 ? Tb : MELT.bIce * Tb;
          const alb = swe[b] > MELT.sweMin ? aS[b] : aBare[b];
          melt = Ti > MELT.tT ? TF * Ti + SRF * (1 - alb) * gh : 0;
        } else melt = ddf * (swe[b] > 0 ? 1 : 1.6) * Math.max(Tb, 0);
      }
      swe[b] -= Math.min(swe[b], melt);
      bal[b] += S - melt;
      mh += bands.w[b] * melt;
    }
    meltH[h] = mh;
  }
  return { meltH, bal, state: { swe, aS } };
}
const argsOf = (rec, ext) => ({ ela: rec.zMed, t: rec.t, g: rec.g, p: rec.p, zT: rec.zT, zP: rec.zMed, TF: m.TF, SRF: m.SRF, ddf: null, model: m.model, pGrad: 0, ...ext });
const balAllX = (rec, k, ext = {}) => simX({ ...argsOf(rec, ext), bands: { zb: rec.b.map((x) => x.z), w: rec.b.map((x) => x.w) }, pf: k, state: emptyState(rec.b.length) }).bal;
const balOneX = (rec, b, k, ext = {}) => simX({ ...argsOf(rec, ext), bands: { zb: [rec.b[b].z], w: [1] }, pf: k, state: emptyState(1) }).bal[0];
function scoreX(rec, kb, ext = {}) {
  const same = kb.every((k) => k === kb[0]);
  const bal = same ? balAllX(rec, kb[0], ext) : kb.map((k, b) => balOneX(rec, b, k, ext));
  let s1 = 0, s3 = 0; const e = rec.b.map((x, b) => bal[b] - x.bw);
  rec.b.forEach((x, b) => { s1 += x.w * Math.abs(e[b]); s3 += x.w * e[b]; });
  let s4 = 0; rec.b.forEach((x, b) => { s4 += x.w * Math.abs(e[b] - s3); });
  return { s1, s2: Math.abs(s3), s3, s4, bal: Array.from(bal) };
}

// ---- the shared path: a series document (t at zRef, p, g per hour from fromMs) → JSON → record of the core ----
const docOfS = (rec) => JSON.parse(JSON.stringify({ fromMs: Date.parse(`${rec.t0}T00:00:00Z`), zRef: rec.zT, t: Array.from(rec.t), p: Array.from(rec.p), g: Array.from(rec.g) }));
const num = (v) => (v == null ? NaN : v);
function recFromDoc(rec, doc) {
  const n = rec.t.length, i0 = Math.round((Date.parse(`${rec.t0}T00:00:00Z`) - doc.fromMs) / H);
  const t = new Float64Array(n), p = new Float64Array(n), g = new Float64Array(n);
  for (let i = 0; i < n; i++) { t[i] = num(doc.t[i0 + i]); p[i] = num(doc.p[i0 + i]); g[i] = num(doc.g[i0 + i]); }
  return { ...rec, t, p, g, zT: doc.zRef };
}
/** H series document of the median elevation, prepared as melt.mjs `forcingFromForecast` (fill, radiation from the cloud fraction). */
function docOfH(F, lat, lon) {
  const k = 1, zRef = F.z[k];
  const t = fillShortGaps(Float64Array.from(F.series.t[k], num)), n = fillShortGaps(Float64Array.from(F.series.n[k], num)), p = fillShortGaps(Float64Array.from(F.series.p[k], num), 3);
  const g = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) g[i] = clearSky(cosZenith(lat, lon, F.fromMs + (i + 0.5) * H), zRef) * (Number.isFinite(n[i]) ? cloudFactor(n[i]) : 0.55);
  return JSON.parse(JSON.stringify({ fromMs: F.fromMs, zRef, t: Array.from(t, (v) => (Number.isFinite(v) ? v : null)), p: Array.from(p, (v) => (Number.isFinite(v) ? v : null)), g: Array.from(g) }));
}
const forcingOf = (catId, year) => { const p = join(args.forcing, `${catId}-${year}.json`); if (!existsSync(p)) throw new Error(`${p} fehlt`); return J(p); };

// ---- k*: one multiplier for all bands that reproduces the glacier-wide winter balance ----
function kStarOf(rec, BW, ext = {}) {
  const f = (k) => { const bal = balAllX(rec, k, ext); return rec.b.reduce((s, x, b) => s + x.w * bal[b], 0) - BW; };
  let lo = RULE.kLo, hi = RULE.kHi;
  if (f(lo) > 0) return { k: lo, capped: 'low' };
  if (f(hi) < 0) return { k: hi, capped: 'high' };
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return { k: (lo + hi) / 2, capped: null };
}

// ---- runs ----
const ctl = { A: { n: 0, bad: [] }, B: { n: 0, bad: [] } };
const rows = [], meteo = [], points = [];
const fsOf = (T) => (Number.isNaN(T) ? 0.5 : Math.min(1, Math.max(0, (MELT.fsWarm - T) / (MELT.fsWarm - MELT.fsCold))));
const Tmid = (MELT.fsWarm + MELT.fsCold) / 2;
let minFree = freeMb();
for (const rec of recs) {
  const G = GLACIERS.find((x) => x[0] === rec.key);
  const F = forcingOf(G[1], rec.year);
  const hDoc = docOfH(F, rec.lat, rec.lon);
  const recH = recFromDoc(rec, hDoc);
  const bases = basesOf(rec);
  const BW = rec.b.reduce((s, x) => s + x.w * x.bw, 0);
  const row = { key: rec.key, name: G[2], catId: rec.catId, year: rec.year, note: NOTE[rec.year], zMed: rec.zMed, zT: rec.zT, station: rec.station?.id ?? null, gapT: r1(rec.gapT * 100), gapP: r1(rec.gapP * 100), gMiss: r1(rec.gMiss * 100), runs: {}, F: {} };
  // Kontrolle A (copy of the core = core) and B (S through the H path = S), every basis and band
  const recSviaH = recFromDoc(rec, docOfS(rec));
  for (const b of BASES) {
    if (!bases[b]) continue;
    const ref = scoreOf(rec, m, bases[b].kb);
    const a = scoreX(rec, bases[b].kb), bb = scoreX(recSviaH, bases[b].kb);
    ctl.A.n++; ctl.B.n++;
    if (!(Object.is(a.s3, ref.s3) && Object.is(a.s2, ref.s2) && Object.is(a.s1, ref.s1))) ctl.A.bad.push(`${rec.key} ${rec.year} ${b}`);
    if (!(Object.is(bb.s3, a.s3) && Object.is(bb.s2, a.s2) && Object.is(bb.s1, a.s1) && bb.bal.every((v, i) => Object.is(v, a.bal[i])))) ctl.B.bad.push(`${rec.key} ${rec.year} ${b}`);
  }
  // swap runs
  const extOf = {
    S: [rec, {}],
    L1: [{ ...rec, p: recH.p }, {}],
    L2: [{ ...rec, p: recH.p }, { tPh: recH.t, zPh: recH.zT }],
    L3: [{ ...rec, t: recH.t, zT: recH.zT, g: recH.g }, { tPh: rec.t, zPh: rec.zT }],
    L4: [recH, {}],
  };
  // L2b: pSnow of buscosun Fusion, linear in z between the three elevations (info only)
  const i0H = Math.round((Date.parse(`${rec.t0}T00:00:00Z`) - F.fromMs) / H), Z = F.z;
  const ps = F.series.ps.map((a) => Float64Array.from(a, num));
  const psAt = (h, z) => {
    const v = ps.map((a) => a[i0H + h]);
    const k = z <= Z[1] ? 0 : 1, w = Math.min(1, Math.max(0, (z - Z[k]) / (Z[k + 1] - Z[k])));
    const x = v[k] + (v[k + 1] - v[k]) * w;
    return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fsOf(recH.t[h] + MELT.gamma * (z - recH.zT));
  };
  extOf.L2b = [{ ...rec, p: recH.p }, { fsFn: psAt }];
  for (const b of BASES) {
    if (!bases[b]) continue;
    row.F[b] = r3(bases[b].F);
    row.runs[b] = {};
    for (const [run, [r, ext]] of Object.entries(extOf)) { const x = scoreX(r, bases[b].kb, ext); row.runs[b][run] = { s2: x.s2, s3: x.s3, s1: x.s1 }; }
  }
  const kS = kStarOf(rec, BW), kH = kStarOf(recH, BW);
  row.kStar = { S: r3(kS.k), H: r3(kH.k), cappedS: kS.capped, cappedH: kH.capped, ratio: r3(kH.k / kS.k) };
  rows.push(row);

  // ---- meteorology at the glacier (step 4) ----
  const monthly = {};
  let sumS = 0, sumH = 0, solS = 0, solH = 0, solHps = 0, wetS = [], wetH = [], wetH3 = [];
  const tS0 = Date.parse(`${rec.t0}T00:00:00Z`);
  for (let h = 0; h < rec.t.length; h++) {
    const mo = new Date(tS0 + h * H).toISOString().slice(0, 7);
    monthly[mo] ??= { S: 0, H: 0 };
    const pS = Number.isFinite(rec.p[h]) ? rec.p[h] : 0, pH = Number.isFinite(recH.p[h]) ? recH.p[h] : 0;
    monthly[mo].S += pS; monthly[mo].H += pH; sumS += pS; sumH += pH;
    const TS = rec.t[h] + MELT.gamma * (rec.zMed - rec.zT), TH = recH.t[h];
    solS += pS * fsOf(TS); solH += pH * fsOf(TH); solHps += pH * psAt(h, rec.zMed);
    if (pS >= RULE.wet && Number.isFinite(TS)) wetS.push(rec.zMed + (Tmid - TS) / MELT.gamma);
    if (pH >= RULE.wet && Number.isFinite(TH)) {
      wetH.push(rec.zMed + (Tmid - TH) / MELT.gamma);
      // the elevation where the three answers of buscosun Fusion cross the middle of the ramp (outside: the standard lapse from the nearest)
      const tz = F.series.t.map((a) => num(a[i0H + h]));
      if (tz.every(Number.isFinite)) {
        let z50 = null;
        for (let k = 0; k < 2; k++) if ((tz[k] - Tmid) * (tz[k + 1] - Tmid) <= 0 && tz[k] !== tz[k + 1]) { z50 = Z[k] + ((Tmid - tz[k]) / (tz[k + 1] - tz[k])) * (Z[k + 1] - Z[k]); break; }
        if (z50 == null) z50 = tz[0] < Tmid ? Z[0] + (Tmid - tz[0]) / MELT.gamma : Z[2] + (Tmid - tz[2]) / MELT.gamma;
        wetH3.push(z50);
      }
    }
  }
  meteo.push({
    key: rec.key, name: G[2], year: rec.year, note: NOTE[rec.year], zMed: rec.zMed, zTstation: rec.zT, hModEffM: F.hModEffM, hmodel: F.hmodel, cellKm: F.inventoryKm, point: F.point,
    precipSumMm: { S: r1(sumS), H: r1(sumH), ratioHS: r3(sumH / sumS) },
    monthly: Object.fromEntries(Object.entries(monthly).map(([k, v]) => [k, { S: r1(v.S), H: r1(v.H), ratioHS: v.S > 0 ? r3(v.H / v.S) : null }])),
    snowShareAtMedian: { S: r3(solS / sumS), H: r3(solH / sumH), HpSnow: r3(solHps / sumH) },
    snowfallLineM: { S: r1(median(wetS)), H: r1(median(wetH)), H3: r1(median(wetH3)), nWetS: wetS.length, nWetH: wetH.length },
    tMeanAtMedian: { S: r3(mean(Array.from(rec.t, (v) => v + MELT.gamma * (rec.zMed - rec.zT)).filter(Number.isFinite))), H: r3(mean(Array.from(recH.t).filter(Number.isFinite))) },
    gMean: { S: r1(mean(Array.from(rec.g))), H: r1(mean(Array.from(recH.g))) },
    hFill: F.missing,
  });

  // ---- point measurements (step 5) ----
  const L = longOf(rec.key, rec.year);
  const datPath = join(args.points, 'winter', `${G[3]}_winter.dat`);
  if (L && existsSync(datPath)) {
    const LH = recFromDoc(L, docOfH(F, rec.lat, rec.lon));
    const kPt = bases.own?.F ?? bases.country.F, basisPt = bases.own ? 'own' : 'country';
    const t0L = Date.parse(`${L.t0}T00:00:00Z`);
    for (const line of readFileSync(datPath, 'latin1').split(/\r?\n/)) {
      if (!line.trim() || line.startsWith('#')) continue;
      const c = line.trim().split(/\s+/);
      const d1 = c[3], z = +c[9], mb = +c[14], per = +c[5], d0 = c[1];
      if (!/^\d{8}$/.test(d1) || !Number.isFinite(z) || !Number.isFinite(mb)) continue;
      const ms1 = Date.UTC(+d1.slice(0, 4), +d1.slice(4, 6) - 1, +d1.slice(6, 8), 12);
      if (ms1 < Date.UTC(rec.year - 1, 9, 1) || ms1 >= Date.UTC(rec.year, 5, 1)) continue;
      const ms0 = per > 0 && /^\d{8}$/.test(d0) ? Math.max(t0L, Date.UTC(+d0.slice(0, 4), +d0.slice(4, 6) - 1, +d0.slice(6, 8), 12)) : t0L;
      const h0 = Math.round((ms0 - t0L) / H), h1 = Math.round((ms1 - t0L) / H);
      const pt = { key: rec.key, name: G[2], year: rec.year, z, date: d1, basis: basisPt, F: kPt, mb };
      for (const [src, R] of [['S', L], ['H', LH]]) {
        if (h1 > R.t.length) { pt[src] = null; pt[`${src}why`] = 'Antrieb endet vorher'; continue; }
        let holes = 0; for (let h = h0; h < h1; h++) if (Number.isNaN(R.t[h])) holes++;
        if (holes / Math.max(1, h1 - h0) > 0.05) { pt[src] = null; pt[`${src}why`] = 'Temperaturlücke'; continue; }
        const sub = { ...R, t: R.t.subarray(h0, h1), p: R.p.subarray(h0, h1), g: R.g.subarray(h0, h1) };
        pt[src] = simX({ ...argsOf(sub, {}), bands: { zb: [z], w: [1] }, pf: kPt, state: emptyState(1) }).bal[0];
      }
      points.push(pt);
    }
  }
  minFree = Math.min(minFree, freeMb());
}
const ctlOk = ctl.A.bad.length === 0 && ctl.B.bad.length === 0 && ctl.A.n > 0;

// ---- verdict ----
let seed = RULE.seed;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function verdictOf(sel, basis) {
  const R = rows.filter(sel).filter((r) => r.runs[basis]);
  if (!R.length) return { n: 0 };
  const S = mean(R.map((r) => r.runs[basis].S.s2)), Hm = mean(R.map((r) => r.runs[basis].L4.s2)), L1 = mean(R.map((r) => r.runs[basis].L1.s2));
  const byG = new Map(); for (const r of R) { if (!byG.has(r.key)) byG.set(r.key, []); byG.get(r.key).push(r.runs[basis].L4.s2 - r.runs[basis].S.s2); }
  const gl = [...byG.values()], diffs = [];
  for (let k = 0; k < RULE.draws; k++) { let s = 0, c = 0; for (let i = 0; i < gl.length; i++) { const d = gl[Math.floor(rnd() * gl.length)]; for (const v of d) { s += v; c++; } } diffs.push(s / c); }
  diffs.sort((a, b) => a - b);
  const p10 = diffs[Math.floor(0.1 * diffs.length)], p90 = diffs[Math.floor(0.9 * diffs.length)];
  const ratios = R.map((r) => r.kStar.ratio).filter(Number.isFinite), kr = median(ratios);
  const c1 = Hm >= RULE.up * S && p10 > 0, c2 = L1 - S >= RULE.precipShare * (Hm - S), c3 = kr != null && (kr < RULE.bridge[0] || kr > RULE.bridge[1]);
  const better = Hm <= RULE.down * S && p90 < 0;
  const word = c1 && c2 && c3 ? 'der Antrieb ist der Hauptfehler' : better ? 'der Antrieb ist besser' : c1 ? 'H schlechter, aber nicht über den Niederschlag/Faktor' : 'weder noch';
  const dec = (run) => mean(R.map((r) => r.runs[basis][run].s3));
  const s3 = { S: dec('S'), L1: dec('L1'), L2: dec('L2'), L3: dec('L3'), L4: dec('L4') };
  return {
    n: R.length, glaciers: byG.size, s2S: r1(S), s2H: r1(Hm), s2L1: r1(L1), ratioHS: r3(Hm / S), biasS: r1(s3.S), biasH: r1(s3.L4), diffP10: r1(p10), diffP90: r1(p90),
    kRatioMedian: r3(kr), kRatioRange: [r3(Math.min(...ratios)), r3(Math.max(...ratios))], c1, c2, c3, better, verdict: word,
    parts_s3: { precip: r1(s3.L1 - s3.S), phase: r1(s3.L2 - s3.L1), melt: r1(s3.L3 - s3.S), interaction: r1(s3.L4 - s3.S - (s3.L1 - s3.S) - (s3.L2 - s3.L1) - (s3.L3 - s3.S)), total: r1(s3.L4 - s3.S) },
    s2: Object.fromEntries(['S', 'L1', 'L2', 'L2b', 'L3', 'L4'].map((run) => [run, r1(mean(R.map((r) => r.runs[basis][run].s2)))])),
  };
}
const verdict = {};
for (const b of BASES) {
  verdict[b] = { all: verdictOf(() => true, b) };
  for (const y of WINTERS) verdict[b][y] = verdictOf((r) => r.year === y, b);
}
// points by elevation band
const band = (z) => Math.floor(z / RULE.bandM) * RULE.bandM;
const ptAgg = (sel) => {
  const P = points.filter(sel), by = new Map();
  for (const p of P) { const k = band(p.z); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const agg = (L, src) => { const e = L.filter((p) => p[src] != null).map((p) => p[src] - p.mb); return { n: e.length, bias: r1(mean(e)), mae: r1(mean(e.map(Math.abs))) }; };
  return { all: { S: agg(P, 'S'), H: agg(P, 'H') }, byBand: [...by.keys()].sort((a, b) => a - b).map((k) => ({ band: `${k}–${k + RULE.bandM}`, S: agg(by.get(k), 'S'), H: agg(by.get(k), 'H') })), skipped: { S: P.filter((p) => p.S == null).length, H: P.filter((p) => p.H == null).length } };
};
const pointsOut = { all: ptAgg(() => true), byWinter: Object.fromEntries(WINTERS.map((y) => [y, ptAgg((p) => p.year === y)])), byGlacier: Object.fromEntries(GLACIERS.map((g) => [g[2], ptAgg((p) => p.key === g[0])])) };

const head = {
  kind: 'gm11/hindcast-stage-a', rule: { file: 'audit/gletscher-schneemodell/gm11-hindcast-frozen.md', sha256: sha }, generated: new Date().toISOString(),
  release: (() => { const F = forcingOf(GLACIERS[0][1], 2024); return { id: F.release, name: F.releaseName, commit: F.releaseCommit, as: 'buscosun Fusion 13 (fusion-12x) ohne RUC, ohne Messungen, ohne Stationsprodukt, ohne Radar; t1 Tag 0, Vorlauf 0–2 h' }; })(),
  controls: { A: { n: ctl.A.n, bad: ctl.A.bad }, B: { n: ctl.B.n, bad: ctl.B.bad }, ok: ctlOk },
  unusable: [...A.unusable, ...B.unusable], winters: NOTE, minFreeMb: minFree, scored: rows.length,
};
writeFileSync(args.out, JSON.stringify({ ...head, verdict, rows, meteo, points: pointsOut, pointRows: points }, null, 1));
// public: no measured balance, no model balance, no point values (E-GL-17)
const pub = {
  ...head, verdict, points: pointsOut,
  rows: rows.map((r) => ({ key: r.key, name: r.name, year: r.year, note: r.note, F: r.F, kRatio: r.kStar.ratio, kCapped: r.kStar.cappedS || r.kStar.cappedH ? true : undefined,
    s3: Object.fromEntries(Object.entries(r.runs).map(([b, x]) => [b, Object.fromEntries(Object.entries(x).map(([run, v]) => [run, r1(v.s3)]))])) })),
  meteo: meteo.map((x) => ({ ...x })),
};
writeFileSync(args.public, JSON.stringify(pub, null, 1));
console.log(JSON.stringify({ ...head, verdict: Object.fromEntries(Object.entries(verdict).map(([b, v]) => [b, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, `${x.verdict} | n ${x.n} | s2 S ${x.s2S} H ${x.s2H} | bias S ${x.biasS} H ${x.biasH} | p10 ${x.diffP10} | k ${x.kRatioMedian}`]))])) }, null, 1));
