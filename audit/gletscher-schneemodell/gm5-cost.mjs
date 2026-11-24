#!/usr/bin/env node
/**
 * GM-5 B, repeat of the cost measurement (E-GM-32 A) — rule gm5-method-frozen.md §B plus the amendment gm5-method-frozen-b2.md (both hashes checked).
 * Runs melt.mjs of the frozen copy dc982141 once (--snowpack=shadow, local cube and view of 21.11.). The unchanged hook (gm5-hook-*.mjs) hands every
 * snowpack call to this tool the moment the producer makes it: expected-value step, ONE pass of 40 scenarios (K = 10 / 20 are its first 10 / 20),
 * expected-value step again; on every tenth glacier K = 100 (reference) and the decomposition random / systematic. Kept per glacier: quantiles and
 * times only (V-GM-77: the first tool held every input and was stopped by the system).
 * Writes gm5-cost.json next to this file; run output only under C:\dev\buscosun-glacier-cache\gm5\ (out-cost, patch-cost, cost-partial.json).
 * Start (cwd = the copy):
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs --import file:///C:/dev/buscosun-web/audit/gletscher-schneemodell/gm5-hook-register.mjs file:///C:/dev/buscosun-web/audit/gletscher-schneemodell/gm5-cost.mjs [--limit=40]
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
const NOW = '2026-11-21T17:50:00Z', RUN = '2026112117';
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8)) || 0;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const TRIAL = LIMIT > 0 || !!ONLY;
if (LIMIT > 60) throw new Error('Probelauf höchstens 60 Gletscher (Nachtrag N.6)');
const imp = (rel) => import(pathToFileURL(join(CODE, rel)).href);

const shaOf = (f) => createHash('sha256').update(readFileSync(join(HERE, f))).digest('hex');
const frozen = (f) => { const h = shaOf(`${f}.md`); if (h !== readFileSync(join(HERE, `${f}.sha256`), 'utf8').split(/\s+/)[0]) throw new Error(`eingefrorene Regel verändert: ${f}`); return h; };
const methodSha = frozen('gm5-method-frozen'), amendSha = frozen('gm5-method-frozen-b2');

// ---------- the read view (as the first tool built it): links to the gs view, own copies of the melt state and the snowpack seed of 21.11. 17 UTC
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

const SP = await imp('scripts/glacier/lib/snowpackcore.mjs');
const WX = await imp('scripts/glacier/lib/weathercore.mjs');
const { rng, gauss, quantile } = await imp('scripts/glacier/lib/meltcore.mjs');
const { packFromRow } = await imp('scripts/glacier/lib/snowcore.mjs');
const { quantileOf, Phi } = await imp('src/pointForecast/fusion/dist.ts');

const HOURS = 14 * 24, DAYS = 14, KS = [10, 20, 40];

// ---------- sigmas (§B.2)
const A = JSON.parse(readFileSync(`${CACHE}/gm3/report-A-explore.json`, 'utf8'));
const B = JSON.parse(readFileSync(`${CACHE}/gm3/report-B.json`, 'utf8'));
const lq = (a, q) => { const s = [...a].sort((x, y) => x - y); const p = q * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const ratios = A.perGlacier.factors.map((f) => f.F / f.countryF);
const sigmaF = (Math.log(lq(ratios, 0.9)) - Math.log(lq(ratios, 0.1))) / (2 * 1.2816);
const sites = B.data.perSite.filter((s) => s.events >= 20).map((s) => s.rho50);
const sigmaRho = (Math.log(lq(sites, 0.9)) - Math.log(lq(sites, 0.1))) / (2 * 1.2816);

// ---------- scenario machinery (§B.2, taken unchanged from gm5-scenarios.mjs)
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
const REC = { wx: new Map(), lastDrive: null, sp: null };
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
const q3 = (x, K) => { const s = Float64Array.from(x.subarray(0, K)).sort(); return [quantile(s, 0.1), quantile(s, 0.5), quantile(s, 0.9)]; };
/**
 * ONE pass of K scenarios of a glacier; at every mark (a count of scenarios ≤ K) the quantiles of the scenarios so far (amendment N.2).
 * → { at: { <mark>: { hs, hn: [level][day][p10, p50, p90], wk2: [level][p10, p50, p90] } }, ms: { <mark>: scenario time so far + its quantile time } }
 */
function spreads(P, K, salt, mode = 'all', marks = [K]) {
  const r = rng(fnv(`${RUN}|${P.rec.id}|${salt}`));
  const hs = [0, 1, 2].map(() => Array.from({ length: DAYS }, () => new Float64Array(K)));
  const hn = [0, 1, 2].map(() => Array.from({ length: DAYS }, () => new Float64Array(K)));
  const wk2 = [0, 1, 2].map(() => new Float64Array(K));
  const at = {}, ms = {};
  let tScen = 0;
  for (let s = 0; s < K; s++) {
    const t = performance.now();
    const { drive, c } = scenario(P, r, mode);
    const row = runOne(P.rec, drive, c);
    for (let l = 0; l < 3; l++) { let w = 0; for (let d = 0; d < DAYS; d++) { hs[l][d][s] = row.hsd[l][d]; hn[l][d][s] = row.hnd[l][d]; if (d >= 7) w += row.hnd[l][d]; } wk2[l][s] = w; }
    tScen += performance.now() - t;
    if (marks.includes(s + 1)) {
      const tq = performance.now(), n = s + 1;
      at[n] = { hs: hs.map((lv) => lv.map((x) => q3(x, n))), hn: hn.map((lv) => lv.map((x) => q3(x, n))), wk2: wk2.map((x) => q3(x, n)) };
      ms[n] = tScen + (performance.now() - tq);
    }
  }
  return { at, ms };
}

// ---------- the measurement, called by the hook for every snowpack call of the producer
const T = { E1: 0, E2: 0, K: { 10: 0, 20: 0, 40: 0 }, ref100: 0, decomp: 0 };   // ms
const per = [];          // slim per glacier
const mem = { first: null, samples: [], max: 0 };
let n = 0, noArgs = 0, failed = null;
const width = (q) => q[2] - q[0];
const r2 = (x) => Math.round(x * 100) / 100;
const partial = () => writeFileSync(`${ROOT}/cost-partial.json`, JSON.stringify({ kind: 'gm5/cost-partial', at: new Date().toISOString(), trial: TRIAL, glaciers: n, ms: T, ratioToE: Object.fromEntries(KS.map((K) => [K, r2(T.K[K] / ((T.E1 + T.E2) / 2))])), rssMb: Math.round(process.memoryUsage().rss / 1048576), maxRssMb: Math.round(mem.max / 1048576) }, null, 1));
function onRecord(rec) {
  if (failed) return;
  if (!rec.driveArgs) { noArgs++; return; }
  try {
    const P = prep(rec), i = n;
    let t = performance.now();
    const e = runOne(rec, rec.drive, rec.c); T.E1 += performance.now() - t;
    const s = spreads(P, 40, 'gm5', 'all', KS);
    for (const K of KS) T.K[K] += s.ms[K];
    t = performance.now(); runOne(rec, rec.drive, rec.c); T.E2 += performance.now() - t;
    const s40 = s.at[40];
    const g = { id: rec.id, kind: P.kind, dist: !!P.amount, eHs: e.hsd[1].slice(), eHn: e.hnd[1].slice(), hs: s40.hs, hn: s40.hn, wk2: s40.wk2[1], w14: Object.fromEntries(KS.map((K) => [K, width(s.at[K].hs[1][13])])) };
    if (i % 10 === 0) {
      t = performance.now();
      const ref = spreads(P, 100, 'gm5ref').at[100]; T.ref100 += performance.now() - t;
      t = performance.now();
      const rnd = spreads(P, 40, 'gm5', 'random').at[40], sys = spreads(P, 40, 'gm5', 'systematic').at[40]; T.decomp += performance.now() - t;
      g.sub = { ref14: width(ref.hs[1][13]), rnd: [0, 6, 13].map((d) => width(rnd.hs[1][d])), sys: [0, 6, 13].map((d) => width(sys.hs[1][d])) };
    }
    per.push(g); n++;
    const rss = process.memoryUsage().rss;
    if (mem.first == null) mem.first = rss;
    if (rss > mem.max) mem.max = rss;
    if (n % 100 === 0) mem.samples.push([n, Math.round(rss / 1048576)]);
    if (n % 200 === 0) partial();
  } catch (err) {
    failed = { glacier: rec.id, at: n, message: String(err?.stack ?? err) };
    console.error(`gm5-cost: Fehler im Werkzeug bei ${rec.id} (Gletscher ${n}): ${failed.message}`);
    process.exit(2);
  }
}
REC.sp = { push: onRecord };
globalThis.__gm5 = REC;     // the hook modules pick this object up when melt.mjs is loaded

// ---------- the run
const { main } = await imp('scripts/glacier/melt.mjs');
const t0 = performance.now();
const res = await main({ data: VIEW, cube: `${CACHE}/gs/cube`, out: `${ROOT}/out-cost`, patch: `${ROOT}/patch-cost`, now: NOW, always: true, snowpack: 'shadow', ...(LIMIT ? { limit: LIMIT } : {}), ...(ONLY ? { only: ONLY } : {}), log: () => {} });
const runSeconds = (performance.now() - t0) / 1000;
if (res.run !== RUN) throw new Error(`Lauf ${res.run} statt ${RUN}`);
if (!n) throw new Error('Haken hat nichts übergeben');
const maxRss = process.resourceUsage().maxRSS * 1024;

// ---------- aggregates
const med = (a) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const widthAt = (key, l, d) => r1(med(per.map((g) => width(g[key][l][d]))));
const widths = {};
for (const [name, l] of [['Zunge', 0], ['Medianhöhe', 1], ['Oberkante', 2]]) widths[name] = { hsDay1: widthAt('hs', l, 0), hsDay7: widthAt('hs', l, 6), hsDay14: widthAt('hs', l, 13), hnDay1: widthAt('hn', l, 0), hnDay7: widthAt('hn', l, 6), hnDay14: widthAt('hn', l, 13) };
let dExp = 0, dP10 = 0, dP50 = 0, dP90 = 0, dAll = 0;
for (const g of per) for (let d = 7; d < 14; d++) { dAll++; if (g.eHn[d] >= 0.5) dExp++; if (g.hn[1][d][0] >= 0.5) dP10++; if (g.hn[1][d][1] >= 0.5) dP50++; if (g.hn[1][d][2] >= 0.5) dP90++; }
const wk2Exp = per.map((g) => g.eHn.slice(7).reduce((s, v) => s + v, 0));
const week2 = { expectedSumCm: r1(med(wk2Exp)), p10: r1(med(per.map((g) => g.wk2[0]))), p50: r1(med(per.map((g) => g.wk2[1]))), p90: r1(med(per.map((g) => g.wk2[2]))), shareP10AtLeast05cm: per.filter((g) => g.wk2[0] >= 0.5).length / per.length, expectedInsideSpanShare: per.filter((g, i) => wk2Exp[i] >= g.wk2[0] && wk2Exp[i] <= g.wk2[2]).length / per.length };
const sub = per.filter((g) => g.sub);
const mc = {};
for (const K of KS) { const devs = sub.filter((g) => g.sub.ref14 >= 1).map((g) => Math.abs(g.w14[K] - g.sub.ref14) / g.sub.ref14); mc[K] = { glaciers: devs.length, medianRelDev: devs.length ? r2(med(devs)) : null, p90RelDev: devs.length ? r2(lq(devs, 0.9)) : null }; }
const kMin = KS.find((K) => mc[K].medianRelDev != null && mc[K].medianRelDev <= 0.1) ?? null;
const decomp = { alle: [0, 6, 13].map((d) => r1(med(sub.map((g) => width(g.hs[1][d]))))), zufällig: [0, 1, 2].map((j) => r1(med(sub.map((g) => g.sub.rnd[j])))), systematisch: [0, 1, 2].map((j) => r1(med(sub.map((g) => g.sub.sys[j])))), days: [1, 7, 14] };

// ---------- replay check (N.4): the tool's expected-value step against the row the producer wrote in this run
const docPath = join(`${ROOT}/out-cost`, 'snowpack', `${res.run}.json`);
const docS = readFileSync(docPath, 'utf8'), doc = JSON.parse(docS);
const rowById = new Map(doc.glaciers.map((g) => [g.id, g]));
let differ = 0, over = 0, maxDiff = 0, missing = 0;
for (const g of per) {
  const row = rowById.get(g.id); if (!row) { missing++; continue; }
  let m = 0; for (let d = 0; d < DAYS; d++) m = Math.max(m, Math.abs(row.hsd[1][d] - g.eHs[d]), Math.abs(row.hnd[1][d] - g.eHn[d]));
  if (m > 0) differ++; if (m > 0.1) over++; maxDiff = Math.max(maxDiff, m);
}
const replay = { glaciers: per.length, missingInDoc: missing, differ, overTenthCm: over, maxDiffCm: r2(maxDiff), passed: over <= 0.01 * per.length };

// ---------- document size with real p10 / p90 of hsd and hnd per level (§B.3)
const byId = new Map(per.map((g) => [g.id, g]));
const ext = { ...doc, spread: { k: 40, rule: 'gm5-sketch' }, glaciers: doc.glaciers.map((g) => { const s = byId.get(g.id); return s ? { ...g, hsq: s.hs.map((lv) => [lv.map((q) => r1(q[0])), lv.map((q) => r1(q[2]))]), hnq: s.hn.map((lv) => [lv.map((q) => r1(q[0])), lv.map((q) => r1(q[2]))]) } : g; }) };
const extS = JSON.stringify(ext);
writeFileSync(`${ROOT}/snowpack-ext-${res.run}.json`, extS);
const size = { docRaw: Buffer.byteLength(docS), docGzip: gzipSync(docS).length, extRaw: Buffer.byteLength(extS), extGzip: gzipSync(extS).length };

const eMs = (T.E1 + T.E2) / 2;
const out = {
  kind: 'gm5/cost', generated: new Date().toISOString(), trial: TRIAL, codeCommit: CODE_COMMIT,
  method: { file: 'audit/gletscher-schneemodell/gm5-method-frozen.md', sha256: methodSha, amendment: 'audit/gletscher-schneemodell/gm5-method-frozen-b2.md', amendmentSha256: amendSha },
  run: { run: res.run, now: NOW, seconds: Math.round(runSeconds), snowpackStatus: res.snowpack, glaciers: n, withoutDriveArgs: noArgs, kinds: per.reduce((m, g) => ((m[g.kind] = (m[g.kind] ?? 0) + 1), m), {}), withDist: per.filter((g) => g.dist).length, note: 'the producer\'s own snowpack seconds include this measurement (it runs inside the step)' },
  sigma: { F: sigmaF, rhoSystematic: sigmaRho, factorRatios: { n: ratios.length, p10: lq(ratios, 0.1), p90: lq(ratios, 0.9) }, rhoSites: sites.length },
  cost: {
    seconds: { E1: r2(T.E1 / 1000), E2: r2(T.E2 / 1000), K10: r2(T.K[10] / 1000), K20: r2(T.K[20] / 1000), K40: r2(T.K[40] / 1000), refK100Subset: r2(T.ref100 / 1000), decompositionSubset: r2(T.decomp / 1000) },
    msPerGlacier: { E: r2(eMs / n), K10: r2(T.K[10] / n), K20: r2(T.K[20] / n), K40: r2(T.K[40] / n) },
    ratioToE: { K10: r2(T.K[10] / eMs), K20: r2(T.K[20] / eMs), K40: r2(T.K[40] / eMs), perScenario: r2(T.K[40] / 40 / eMs) },
    driftE2overE1: r2(T.E2 / T.E1),
  },
  memory: { rssFirstMb: Math.round(mem.first / 1048576), rssMaxSampledMb: Math.round(mem.max / 1048576), maxRssMb: Math.round(maxRss / 1048576), samples: mem.samples, note: 'producer and measurement together' },
  replay,
  widthsK40cm: widths,
  expectedHsDay14Median: r1(med(per.map((g) => g.eHs[13]))), relativeWidthDay14Median: r2(med(per.map((g) => (g.eHs[13] > 1 ? width(g.hs[1][13]) / g.eHs[13] : NaN)))),
  vgm41: { glacierDays: dAll, expectedAtLeast05cm: dExp / dAll, p10AtLeast05cm: dP10 / dAll, p50AtLeast05cm: dP50 / dAll, p90AtLeast05cm: dP90 / dAll },
  week2SumMedianLevel: week2,
  monteCarlo: { ref: 100, subset: sub.length, mc, verdictKmin: kMin },
  decompositionWidthCm: decomp,
  size,
};
const target = TRIAL ? `${ROOT}/cost-trial.json` : join(HERE, 'gm5-cost.json');
writeFileSync(target, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
