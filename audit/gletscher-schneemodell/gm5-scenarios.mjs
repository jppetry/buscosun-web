#!/usr/bin/env node
/**
 * GM-5 B — scenarios and spreads for the snowpack, measured on the frozen copy dc982141 (rule gm5-method-frozen.md §B, hash checked).
 * Runs melt.mjs of the copy once (--snowpack=shadow, the local cube and view of 21.11.), records the inputs of the snowpack step through the hook
 * (gm5-hook-*.mjs), then in the SAME process: expected-value step, K = 10 / 20 / 40 scenarios for every glacier, the expected-value step again,
 * K = 100 on every tenth glacier (Monte Carlo reference), the decomposition random / systematic, V-GM-41, the estimate for "now", document size.
 * Writes: gm5-scenarios.json next to this file; run output and the extended document only under C:\dev\buscosun-glacier-cache\gm5\.
 * Start (cwd = the copy):
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs --import file:///C:/dev/buscosun-web/audit/gletscher-schneemodell/gm5-hook-register.mjs file:///C:/dev/buscosun-web/audit/gletscher-schneemodell/gm5-scenarios.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, symlinkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = 'C:/dev/buscosun-glacier-cache';
const ROOT = `${CACHE}/gm5`, CODE = `${ROOT}/code`;
const CODE_COMMIT = 'dc982141';
const NOW = '2026-11-21T17:50:00Z';
const imp = (rel) => import(pathToFileURL(join(CODE, rel)).href);

const methodSha = createHash('sha256').update(readFileSync(join(HERE, 'gm5-method-frozen.md'))).digest('hex');
if (methodSha !== readFileSync(join(HERE, 'gm5-method-frozen.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('eingefrorene Methode verändert');
if (!globalThis.__gm5) globalThis.__gm5 = { sp: [], wx: new Map(), lastDrive: null };

// ---------- the read view: links to the gs view, own copies of the melt state and the snowpack seed of 21.11. 17 UTC
const VIEW_SRC = `${CACHE}/gs/view/glacier/v1`, VIEW = `${ROOT}/view`;
if (!existsSync(VIEW)) {
  mkdirSync(join(VIEW, 'melt'), { recursive: true }); mkdirSync(join(VIEW, 'snowpack'), { recursive: true });
  for (const n of readdirSync(VIEW_SRC)) {
    if (n === 'melt' || n === 'snowpack') continue;
    const s = join(VIEW_SRC, n);
    if (statSync(s).isDirectory()) symlinkSync(s, join(VIEW, n), 'junction'); else copyFileSync(s, join(VIEW, n));
  }
  copyFileSync(join(VIEW_SRC, 'melt', 'state.json'), join(VIEW, 'melt', 'state.json'));
  copyFileSync(`${CACHE}/gm3c-snowpack/seed-1121/snowpack/state.json`, join(VIEW, 'snowpack', 'state.json'));
}

const { main } = await imp('scripts/glacier/melt.mjs');
const SP = await imp('scripts/glacier/lib/snowpackcore.mjs');
const WX = await imp('scripts/glacier/lib/weathercore.mjs');
const { rng, gauss, quantile } = await imp('scripts/glacier/lib/meltcore.mjs');
const { packFromRow } = await imp('scripts/glacier/lib/snowcore.mjs');
const { quantileOf, Phi } = await imp('src/pointForecast/fusion/dist.ts');

// ---------- 1. the run
const t0 = performance.now();
const res = await main({ data: VIEW, cube: `${CACHE}/gs/cube`, out: `${ROOT}/out-sp`, patch: `${ROOT}/patch-sp`, now: NOW, always: true, snowpack: 'shadow', log: () => {} });
const runSeconds = (performance.now() - t0) / 1000;
const REC = globalThis.__gm5;
if (!REC.sp.length) throw new Error('Haken hat nichts aufgezeichnet');
const recs = REC.sp.filter((r) => r.driveArgs);
const HOURS = 14 * 24, DAYS = 14;

// ---------- sigmas (§B.2)
const A = JSON.parse(readFileSync(`${CACHE}/gm3/report-A-explore.json`, 'utf8'));
const B = JSON.parse(readFileSync(`${CACHE}/gm3/report-B.json`, 'utf8'));
const lq = (a, q) => { const s = [...a].sort((x, y) => x - y); const p = q * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const ratios = A.perGlacier.factors.map((f) => f.F / f.countryF);
const sigmaF = (Math.log(lq(ratios, 0.9)) - Math.log(lq(ratios, 0.1))) / (2 * 1.2816);
const sites = B.data.perSite.filter((s) => s.events >= 20).map((s) => s.rho50);
const sigmaRho = (Math.log(lq(sites, 0.9)) - Math.log(lq(sites, 0.1))) / (2 * 1.2816);
const sigmaRhoEvent = (Math.log(B.measured.all.p90) - Math.log(B.measured.all.p10)) / (2 * 1.2816);

// ---------- scenario machinery (§B.2)
const fnv = (s) => { let h = 2166136261 >>> 0; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h || 1; };
const fin = Number.isFinite;
function amountFn(p, pDist) {
  const prev = new Int32Array(HOURS).fill(-1), next = new Int32Array(HOURS).fill(-1);
  for (let h = 0, last = -1; h < HOURS; h++) { if (pDist?.[h]) last = h; prev[h] = last; }
  for (let h = HOURS - 1, last = -1; h >= 0; h--) { if (pDist?.[h]) last = h; next[h] = last; }
  return (h, u) => {
    const a = prev[h], b = next[h];
    if (a === h) return quantileOf(pDist[h], u);
    if (a < 0 || b < 0 || b - a > 6) return Math.max(0, p[h]);
    const w = (h - a) / (b - a);
    return (1 - w) * quantileOf(pDist[a], u) + w * quantileOf(pDist[b], u);
  };
}
/** Static per-glacier context of the scenarios. */
function prep(rec) {
  const owner = rec.from === 'own' ? rec.id : rec.from;
  const wo = REC.wx.get(owner), ws = REC.wx.get(rec.id);
  const ctx = rec.from === 'own' ? ws?.ctx ?? null : (wo?.ctx ?? null);
  const da = rec.driveArgs;
  const p = da.p, pDist = wo?.pDist ?? null;
  const sgMed = wo?.levelsSg?.[1] ?? wo?.sg ?? null;
  return { rec, ctx, p, pDist, amount: pDist ? amountFn(p, pDist) : null, sgMed, tz: da.tz, share: da.share, g: da.g, factor: da.factor, kind: ctx ? (rec.from === 'own' ? 'own-ctx' : 'neighbour-ctx') : 'ramp' };
}
const levelsOf = (rec) => rec.levelsRows.map((x) => ({ pack: packFromRow(x.row), aS: x.aS }));
const runOne = (rec, drive, c) => SP.snowpackOfGlacier({ id: rec.id, z: rec.z, from: rec.from, lapse: rec.lapse, levels: levelsOf(rec), drive, pars: rec.pars, c, t0Ms: rec.t0Ms, begin: rec.begin, holes: rec.holes }).row;
/** One scenario's drive and constants. mode: 'all' | 'random' (F, rho fixed) | 'systematic' (p, T expected). */
function scenario(P, r, mode) {
  const a = Math.sqrt(1 - 0.81);
  let zP = gauss(r), zT = gauss(r);
  const zF = gauss(r), zR = gauss(r);
  const rand = mode !== 'systematic', sys = mode !== 'random';
  const ps = new Float64Array(HOURS), zTs = new Float64Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    zP = 0.9 * zP + a * gauss(r); zT = 0.9 * zT + a * gauss(r);
    zTs[h] = rand ? zT : 0;
    ps[h] = !rand || !P.amount || !fin(P.p[h]) ? P.p[h] : P.amount(h, Math.min(1 - 1e-9, Math.max(1e-9, Phi(zP))));
  }
  let tz, share;
  if (!rand) { tz = P.tz; share = P.share; }
  else if (P.ctx) {
    const c = P.ctx;
    const tzS = c.tz.map((arr, l) => { const o = new Float64Array(HOURS); for (let h = 0; h < HOURS; h++) { const sg = c.sg?.[l]?.[h]; o[h] = arr[h] + (fin(sg) ? sg : 0) * zTs[h]; } return o; });
    const cs = { ...c, tz: tzS };
    ({ tz, share } = SP.placeLevels(P.rec.z, HOURS, { temp: (zq, h) => WX.tempAtElevation(zq, h, cs), share: (zq, h) => WX.shareAtElevation(zq, h, cs) }));
  } else {
    tz = P.tz.map((arr) => { const o = new Float64Array(HOURS); for (let h = 0; h < HOURS; h++) { const sg = P.sgMed?.[h]; o[h] = arr[h] + (fin(sg) ? sg : 0) * zTs[h]; } return o; });
    share = tz.map((arr) => Float64Array.from(arr, WX.solidFraction));
    for (let h = 0; h < HOURS; h++) { share[1][h] = Math.min(share[1][h], share[2][h]); share[0][h] = Math.min(share[0][h], share[1][h]); }
  }
  const fMul = sys ? Math.exp(sigmaF * zF) : 1, rMul = sys ? Math.exp(sigmaRho * zR) : 1;
  const drive = SP.driveOf({ tz, share, p: ps, g: P.g, factor: P.factor.map((f) => f * fMul), hours: HOURS });
  return { drive, c: { ...P.rec.c, rhoNew: P.rec.c.rhoNew * rMul } };
}
/** K scenarios of one glacier → per level and day p10/p50/p90 of hsd and hnd. */
function spreads(P, K, salt, mode = 'all') {
  const r = rng(fnv(`${res.run}|${P.rec.id}|${salt}`));
  const hs = [0, 1, 2].map(() => Array.from({ length: DAYS }, () => new Float64Array(K)));
  const hn = [0, 1, 2].map(() => Array.from({ length: DAYS }, () => new Float64Array(K)));
  for (let s = 0; s < K; s++) {
    const { drive, c } = scenario(P, r, mode);
    const row = runOne(P.rec, drive, c);
    for (let l = 0; l < 3; l++) for (let d = 0; d < DAYS; d++) { hs[l][d][s] = row.hsd[l][d]; hn[l][d][s] = row.hnd[l][d]; }
  }
  const q = (x) => { const srt = Float64Array.from(x).sort(); return [quantile(srt, 0.1), quantile(srt, 0.5), quantile(srt, 0.9)]; };
  return { hs: hs.map((lv) => lv.map(q)), hn: hn.map((lv) => lv.map(q)) };
}

// ---------- 2. costs (§B.3)
const Ps = recs.map(prep);
const timeIt = (fn) => { const t = performance.now(); const v = fn(); return { v, s: (performance.now() - t) / 1000 }; };
const expected = () => Ps.map((P) => runOne(P.rec, P.rec.drive, P.rec.c));
const E1 = timeIt(expected);
const S = {};
for (const K of [10, 20, 40]) S[K] = timeIt(() => Ps.map((P) => spreads(P, K, 'gm5')));
const E2 = timeIt(expected);

// ---------- 3. widths and V-GM-41 on K = 40
const med = (a) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const S40 = S[40].v;
const widthAt = (set, key, l, d) => med(set.map((x) => x[key][l][d][2] - x[key][l][d][0]));
const widths = {};
for (const [name, l] of [['Zunge', 0], ['Medianhöhe', 1], ['Oberkante', 2]]) widths[name] = { hsDay1: widthAt(S40, 'hs', l, 0), hsDay7: widthAt(S40, 'hs', l, 6), hsDay14: widthAt(S40, 'hs', l, 13), hnDay1: widthAt(S40, 'hn', l, 0), hnDay7: widthAt(S40, 'hn', l, 6), hnDay14: widthAt(S40, 'hn', l, 13) };
const E = E1.v;
const expHs14 = med(E.map((row) => row.hsd[1][13])), relW14 = med(S40.map((x, i) => (E[i].hsd[1][13] > 1 ? (x.hs[1][13][2] - x.hs[1][13][0]) / E[i].hsd[1][13] : NaN)));
let dExp = 0, dP10 = 0, dP50 = 0, dP90 = 0, dAll = 0;
for (let i = 0; i < S40.length; i++) for (let d = 7; d < 14; d++) {
  dAll++;
  if (E[i].hnd[1][d] >= 0.5) dExp++;
  if (S40[i].hn[1][d][0] >= 0.5) dP10++;
  if (S40[i].hn[1][d][1] >= 0.5) dP50++;
  if (S40[i].hn[1][d][2] >= 0.5) dP90++;
}
// sum of new snow days 8–14: expected vs scenario spread is NOT a sum of daily quantiles — the frozen rule reports daily values only; noted.

// ---------- 4. Monte Carlo reference and decomposition on every tenth glacier (§B.4, §B.5)
const sub = Ps.filter((_, i) => i % 10 === 0);
const ref = timeIt(() => sub.map((P) => spreads(P, 100, 'gm5ref')));
const mc = {};
for (const K of [10, 20, 40]) {
  const devs = [];
  sub.forEach((P, j) => {
    const i = Ps.indexOf(P), wR = ref.v[j].hs[1][13][2] - ref.v[j].hs[1][13][0], wK = S[K].v[i].hs[1][13][2] - S[K].v[i].hs[1][13][0];
    if (wR >= 1) devs.push(Math.abs(wK - wR) / wR);
  });
  mc[K] = { glaciers: devs.length, medianRelDev: med(devs), p90RelDev: lq(devs, 0.9) };
}
const kMin = [10, 20, 40].find((K) => mc[K].medianRelDev <= 0.1) ?? null;
const rnd = sub.map((P) => spreads(P, 40, 'gm5', 'random')), sys = sub.map((P) => spreads(P, 40, 'gm5', 'systematic'));
const subAll = sub.map((P) => S40[Ps.indexOf(P)]);
const decomp = Object.fromEntries([['alle', subAll], ['zufällig', rnd], ['systematisch', sys]].map(([k, set]) => [k, { day1: widthAt(set, 'hs', 1, 0), day7: widthAt(set, 'hs', 1, 6), day14: widthAt(set, 'hs', 1, 13) }]));

// ---------- 5. "now" (§B.7, an ESTIMATE) and document size (§B.3)
const docPath = join(`${ROOT}/out-sp`, 'snowpack', `${res.run}.json`);
const doc = JSON.parse(readFileSync(docPath, 'utf8'));
const zq = 1.2816;
const nowEst = {
  hsMedianLevel: med(doc.glaciers.map((g) => g.hs[1] * (Math.exp(zq * sigmaF) - Math.exp(-zq * sigmaF)))),
  sweMedianLevel: med(doc.glaciers.map((g) => g.swe[1] * (Math.exp(zq * sigmaF) - Math.exp(-zq * sigmaF)))),
  hn72MedianLevel: med(doc.glaciers.map((g) => g.hn[1][2] * (Math.exp(zq * Math.hypot(sigmaF, sigmaRho)) - Math.exp(-zq * Math.hypot(sigmaF, sigmaRho))))),
  hsMedian: med(doc.glaciers.map((g) => g.hs[1])), sweMedian: med(doc.glaciers.map((g) => g.swe[1])), hn72Median: med(doc.glaciers.map((g) => g.hn[1][2])),
};
const byId = new Map(Ps.map((P, i) => [P.rec.id, S40[i]]));
const ext = { ...doc, spread: { k: 40, rule: 'gm5-sketch' }, glaciers: doc.glaciers.map((g) => { const s = byId.get(g.id); return s ? { ...g, hsq: s.hs.map((lv) => [lv.map((q) => r1(q[0])), lv.map((q) => r1(q[2]))]), hnq: s.hn.map((lv) => [lv.map((q) => r1(q[0])), lv.map((q) => r1(q[2]))]) } : g; }) };
const extS = JSON.stringify(ext), docS = readFileSync(docPath, 'utf8');
writeFileSync(`${ROOT}/snowpack-ext-${res.run}.json`, extS);
const size = { docRaw: Buffer.byteLength(docS), docGzip: gzipSync(docS).length, extRaw: Buffer.byteLength(extS), extGzip: gzipSync(extS).length };

// ---------- B.1: what the weather part already spreads
const wxOwn = [...REC.wx.values()].filter((w) => w.from === 'own' && w.snq);
const wxNb = [...REC.wx.values()].filter((w) => w.from !== 'own');
const snqW = (d) => med(wxOwn.map((w) => w.snq[1][d][1] - w.snq[1][d][0]));
const snE = (d) => med(wxOwn.map((w) => w.sn[1][d]));

const out = {
  kind: 'gm5/scenarios', generated: new Date().toISOString(), codeCommit: CODE_COMMIT, method: { file: 'audit/gletscher-schneemodell/gm5-method-frozen.md', sha256: methodSha },
  run: { run: res.run, now: NOW, seconds: Math.round(runSeconds), snowpackStatus: res.snowpack, recorded: REC.sp.length, withDriveArgs: recs.length, kinds: Ps.reduce((m, P) => ((m[P.kind] = (m[P.kind] ?? 0) + 1), m), {}), withDist: Ps.filter((P) => P.amount).length },
  sigma: { F: sigmaF, rhoSystematic: sigmaRho, rhoSites: sites.length, rhoEvent: sigmaRhoEvent, factorRatios: { n: ratios.length, p10: lq(ratios, 0.1), p90: lq(ratios, 0.9) } },
  cost: { E1: E1.s, K10: S[10].s, K20: S[20].s, K40: S[40].s, E2: E2.s, msPerGlacier: { E: (1000 * (E1.s + E2.s)) / 2 / Ps.length, K10: (1000 * S[10].s) / Ps.length, K20: (1000 * S[20].s) / Ps.length, K40: (1000 * S[40].s) / Ps.length }, glaciers: Ps.length, refK100Subset: { glaciers: sub.length, s: ref.s } },
  widthsK40cm: widths, expectedHsDay14Median: expHs14, relativeWidthDay14Median: relW14,
  vgm41: { glacierDays: dAll, expectedAtLeast05cm: dExp / dAll, p10AtLeast05cm: dP10 / dAll, p50AtLeast05cm: dP50 / dAll, p90AtLeast05cm: dP90 / dAll },
  monteCarlo: { ref: 100, mc, verdictKmin: kMin },
  decomposition: decomp,
  nowEstimate: nowEst,
  size,
  weatherPart: { ownWithSpread: wxOwn.length, neighbourOmitted: wxNb.length, snqWidthMedianLevelMm: { day1: snqW(0), day7: snqW(6), day14: snqW(13) }, snExpectedMedianLevelMm: { day1: snE(0), day7: snE(6), day14: snE(13) } },
};
writeFileSync(join(HERE, 'gm5-scenarios.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
