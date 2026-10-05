/**
 * score-archive.mjs — stage 2 of phase FV (`audit/fusion-validierung.md` §1.6, §1.7, §2.3): buscosun Fusion on the REAL inputs
 * of the point archive (`buscosun-archiv`, read only) — the full client chain with the learned tables, MOSMIX, today's products.
 *
 * Per slot, DACH point and native valid time of the product (t1 over t2 over t3, lead ≥ 1 h from the hour floor of the slot)
 * with a truth in ANY slot (deduplicated by point and stamp), every candidate as of the slot time:
 *   product@5e      `fuseCubePoint` with learned + learnedSpeed + learnedPrecip (tables `--tables`, Fit 5e), μ_c = the point's
 *                   leave-station-out estimate (`tables.climaMu`, one-station product), MOSMIX station member, nowcast, anchor
 *   product@5e-full the same with the FULL tables on issue days ≤ `--hindcastEnd` (leak control L1 — never a claim)
 *   product@4       the same chain with `--ref4` (Fit 4, no μ_c)
 *   cube            the chain without the learning stage (today's cube path)
 *   cube-hc         the engine as in the case builder (no station, nowcast, anchor) — the hindcast's candidate `cube`
 *   fl-K@5e         `predict` (form K, route 1 like the client) on cube-hc's member — the hindcast scorer's fl-K on archive rows
 *   mosmix, live, live-fusion (QS3), mmm, clima, persist, apersist
 * Fold rule (frozen §1.7): issue day ≤ hindcastEnd ⇒ Fit 5e fold `2026-09a` for valid times ≤ 15.09., else `2026-09b`; Fit 4 fold
 * `2026-09`; after it the full tables. Scores (CRPS, MAE, QS3, PIT, spread) per variable × bin × layer, DM on issue-day means +
 * BH over the card, day-block bootstrap; controls L1 (full vs fold β on the overlap), L2 (persist with shifted truth), L3 (as-of).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/score-archive.mjs
 *       --tables=<fit 5e>\fusion.hindcast.json --ref4=<fit 4>\fusion.hindcast.json --out=<root>\score\<date>-fv-a\scorecard.json
 *       [--archive=C:/dev/buscosun-archiv] [--features=…] [--hindcastEnd=2026-09-21] [--limitSlots=N] [--limitPoints=N] [--riceN=96]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { foldKeyFV, readArchiveSlot, archiveSeries, archiveStation, archiveNowcast, archiveTruth, archiveObs, archiveLive, liveFusionQ, losoClimaProduct, inputFromArchive, truthSupplementPaths, readTruthSupplement, addSupplementTruth } from './lib/archiveAdapter.mjs';
import { scoreDist, qs3Of, quantiles3 } from './lib/distScore.mjs';
import { ScoreAcc, BrierAcc, PairAcc, benjaminiHochberg } from './lib/stats.mjs';
import { siteOf } from './lib/rowFeatures.mjs';
import { exceedance } from '../../src/pointForecast/fusion/dist.ts';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { predict } from '../../src/point/fusionFit/predict.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { binIndex, binRange } from '../../src/point/fusionFit/strata.ts';
import { buildZ, dTsfcProxy, sourceToPoint } from '../../src/point/fusionFit/features.ts';
import { lcg } from '../../src/point/calibFit.ts';

const H = 3_600_000, DAY = 86_400_000;
const flags = parseArgs(process.argv.slice(2));
const ARCH = typeof flags.archive === 'string' ? flags.archive : 'C:/dev/buscosun-archiv';
const featPath = typeof flags.features === 'string' ? flags.features : join(HINDCAST_ROOT, 'features', 'points.v1.json');
if (typeof flags.tables !== 'string' || typeof flags.ref4 !== 'string' || typeof flags.out !== 'string') throw new Error('--tables, --ref4 und --out sind Pflicht');
const out = flags.out;
const riceN = Number(flags.riceN) || 96;
const hindcastEnd = typeof flags.hindcastEnd === 'string' ? flags.hindcastEnd : '2026-09-21';
const HINDCAST_END_MS = Date.parse(`${hindcastEnd}T23:59:59.999Z`);
const limitSlots = Number(flags.limitSlots) || Infinity, limitPoints = Number(flags.limitPoints) || Infinity;
const say = (s) => console.log(`[score-archive] ${s}`);

// ── inputs ────────────────────────────────────────────────────────────────────
const loadTables = (p) => { const b = readFileSync(p); const T = JSON.parse(b.toString('utf8')); const e = validateTables(T); if (e.length) throw new Error(`${p}: ${e.join('; ')}`); return { T, sha256: createHash('sha256').update(b).digest('hex'), path: p }; };
const T5 = loadTables(flags.tables), T4 = loadTables(flags.ref4);
if (!T5.T.climaMu || !T5.T.design?.mean?.climaVars) say(`WARNUNG: ${T5.path} trägt kein climaMu/climaVars — product@5e ohne LOSO-μ_c`);
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const pointIds = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const pointIdx = new Map(pointIds.map((id, i) => [id, i]));
const sites = new Map(pointIds.map((id) => [id, siteOf(feat.byPoint[id])]));
const countryOf = (id) => feat.byPoint[id]?.country ?? null;
const slotPaths = [];
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x)).sort()) slotPaths.push(join(ARCH, d, f));
const slotsUsed = slotPaths.slice(0, limitSlots);
say(`${slotsUsed.length} Slots, ${pointIds.length} DACH-Punkte; Tabellen 5e ${T5.sha256.slice(0, 12)} (${T5.T.inputs?.foldScheme ?? 'month'}), Fit 4 ${T4.sha256.slice(0, 12)} (${T4.T.inputs?.foldScheme ?? 'month'}); Faltenregel bis Ausgabetag ${hindcastEnd}`);

// fold tables (the β of the fold without the key and its neighbours) — cached per (tables, key)
const foldCache = new Map();
const foldTables = (T, key) => {
  if (key == null) return T;
  let c = foldCache.get(T); if (!c) { c = new Map(); foldCache.set(T, c); }
  if (c.has(key)) return c.get(key);
  let hit = 0, miss = 0;
  const mean = {}, occurrence = {};
  for (const [k, e] of Object.entries(T.mean)) { if (e.folds?.[key]) { mean[k] = { ...e, beta: e.folds[key] }; hit += 1; } else { mean[k] = e; if (e.status === 'written') miss += 1; } }
  for (const [k, e] of Object.entries(T.occurrence)) occurrence[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  const t = { ...T, mean, occurrence };
  c.set(key, t);
  say(`Falten-Tabellen ${T === T5.T ? '5e' : 'Fit 4'} ${key}: ${hit} Mittelwert-Strata mit Falten-β, ${miss} geschriebene ohne (volle β — gezählt)`);
  return t;
};
/** The frozen fold rule (§1.7): the key per table, issue time and valid time; null = full tables. */
const key5e = (issueMs, validMs) => foldKeyFV(T5.T.inputs?.foldScheme === 'half' ? 'half' : 'month', issueMs, validMs, HINDCAST_END_MS);
const key4 = (issueMs) => foldKeyFV(T4.T.inputs?.foldScheme === 'half' ? 'half' : 'month', issueMs, issueMs, HINDCAST_END_MS);

// ── pass 1: the truth of every slot, deduplicated by (point, stamp) ──────────────
const truth = new Map();   // `${id}|${ms}` → row
const truthStats = { pairs: 0, dup: 0, mismatch: 0 };
const slotMeta = [];
for (const p of slotsUsed) {
  const s = readArchiveSlot(p);
  const tr = archiveTruth(s, countryOf);
  for (const [id, rec] of tr) for (const r of rec.rows) {
    const k = `${id}|${r.ms}`, prev = truth.get(k);
    if (prev) { truthStats.dup += 1; if (['t', 'td', 'ff', 'fxh', 'rr', 'n'].some((x) => prev[x] != null && r[x] != null && Math.abs(prev[x] - r[x]) > 1e-9)) truthStats.mismatch += 1; for (const x of Object.keys(r)) if (prev[x] == null && r[x] != null) prev[x] = r[x]; continue; }
    truth.set(k, { ...r, net: rec.net });
  }
  slotMeta.push({ path: p, slotAt: s.slotAt, slotAtMs: s.slotAtMs, schema: s.schema, codeHash: s.codeHash });
}
// truth supplements (04.10.2026) up to the last slot's day — fill-only, after every slot
for (const p of truthSupplementPaths(ARCH, { to: slotsUsed.length ? basename(dirname(slotsUsed[slotsUsed.length - 1])) : null })) {
  const st = addSupplementTruth(truth, readTruthSupplement(p), countryOf, { withNet: true });
  say(`Wahrheits-Nachtrag ${p}: ${st.added} neue Paare, ${st.filled} Spalten aufgefüllt, ${st.differing} von ${st.kept} vorhandenen abweichend (Slot-Wert bleibt)`);
}
truthStats.pairs = truth.size;
say(`Wahrheit: ${truth.size} (Punkt, Stunde)-Paare, ${truthStats.dup} doppelt, ${truthStats.mismatch} abweichend`);

// ── accumulators ──────────────────────────────────────────────────────────────
const VARS = ['t', 'td', 'ws', 'gust', 'clct', 'precip'];
const VAR_IDX = { t: 0, td: 1, ws: 2, gust: 3, clct: 4, precip: 5 };
const THRESH = { precip: [0.1, 1, 5], t: [0], gust: [14], ws: [8] };
const acc = new Map(), qsAcc = new Map(), brier = new Map(), pairs = new Map();
const getOr = (m, k, mk) => { let a = m.get(k); if (!a) { a = mk(); m.set(k, a); } return a; };
/** The pairs of the card: candidate → references (frozen §2.3; the L1 pair only on the overlap rows). */
const PAIRS = {
  'product@5e': ['mosmix', 'live', 'live-fusion', 'product@4', 'cube', 'cube-hc', 'fl-K@5e', 'mmm', 'clima', 'persist', 'apersist'],
  'fl-K@5e': ['cube-hc', 'mmm', 'mosmix'],
};
const QS3_ONLY = new Set(['live-fusion']);
const DET = new Set(['mosmix', 'live', 'mmm', 'persist', 'apersist']);
const counts = { anchored: {}, slots: 0, pointSlots: 0, engineRuns: 0, rows: 0, rowsByBin: [0, 0, 0, 0, 0, 0], noTruth: 0, noSeries: 0, stationAccepted: 0, stationRejected: [], obs: 0, noObs: 0, liveMissing: 0, errors: [] };
const asof = { cubeAfter: 0, stationAfter: 0, nowcastAfter: 0, obsAfter: 0, liveAfterMin: [] };
// L2: persistence at lead 1 against the truth of V, V + 1 h and V − 1 h; `exact` = the rows whose reading was taken at V − 1 h (AT/CH 23:00):
// there persist ≡ truth(V − 1 h) must hold to the last digit — the alignment proof; `minus` over all rows mixes in older readings (a missing 23:00)
const l2 = { n: 0, same: 0, plus: 0, minus: 0, exact: { n: 0, sumAbs: 0, maxAbs: 0 }, byCountry: {} };
const learnedNotes = new Map();
const pitDraw = (pi, validAtMs, v) => { const g = lcg((pi * 1_000_003 + Math.round(validAtMs / H) * 7919 + VAR_IDX[v] * 104_729) >>> 0); g(); return g(); };
const stampMs = (st) => { if (/^\d{10}$/.test(st)) return Date.UTC(2000 + +st.slice(0, 2), +st.slice(2, 4) - 1, +st.slice(4, 6), +st.slice(6, 8), +st.slice(8, 10)); const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(st); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN; };

/** Distribution candidates of a FusedPoint (the engine's output of one step). */
const fromFused = (f) => (f ? { t: f.temperature?.dist ?? null, td: f.dewPoint?.dist ?? null, ws: f.windSpeed?.dist ?? null, gust: f.gust?.dist ?? null, clct: f.clouds?.dist ?? null, precip: f.precipitation?.dist ?? null } : null);
const fromPredicted = (pr) => ({ t: pr.dist.temperature ?? null, td: pr.dist.dewPoint ?? null, ws: pr.dist.windSpeed ?? null, gust: pr.dist.gust ?? null, clct: pr.dist.clouds ?? null, precip: pr.dist.precipitation ?? null });

/** μ_c of a station and variable under a table's definition (the scorer's `muCOfTable`). */
const cxS = new Float64Array(C_DIM);
const muCOfTable = (T, site, v, x) => {
  const est = T.climaMu?.byPoint?.[site.id]?.[v];
  if (est) { let s = 0; for (let i = 0; i < C_DIM; i++) s += est[i] * x[i]; return s; }
  const e = T.clima?.byPoint?.[site.id]?.[v] ?? T.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null;
  return e && e.status === 'written' ? climaAt(e, x).mu : null;
};
/** The form-K situation of a cube-hc step — the case row of `build-cases.mjs` read by `rowFeatures.rowContext` + `score.mjs sitK`. */
function sitOfStep(st, site, tier, leadH, hTrue, T) {
  const m = st.samples?.find((s) => typeof s.source === 'string' && s.source.startsWith('cube-'));
  if (!m) return null;
  const c = st.cell ?? {};
  const fin = (x) => (x != null && Number.isFinite(x) ? x : null);
  const kPrecipRaw = fin(m.precipitation) != null ? Math.max(0, m.precipitation) : null;
  const k = { t: fin(m.temperature), td: fin(m.dewPoint), u: fin(m.u), v: fin(m.v), gust: fin(m.gust), clct: fin(m.cloudTotal), precip: kPrecipRaw != null ? Math.log1p(kPrecipRaw) : null };
  const sigDiv = { t: fin(c.t2m_sd), td: fin(c.td2m_sd), u: fin(c.u10_sd), v: fin(c.v10_sd), gust: fin(c.gust_sd), clct: fin(c.clct_sd), precip: fin(c.precip_sd) };
  const sigEns = { t: fin(c.t2m_sd_ens), td: null, u: fin(c.u10_sd_ens), v: fin(c.v10_sd_ens), gust: null, clct: null, precip: fin(c.precip_sd_ens) };
  const hModEff = fin(m.sourceElevation) ?? fin(c.hModEff);
  const dhM = fin(st.vertical?.dhM) ?? (hModEff != null ? hTrue - hModEff : 0);
  const dTsfcK = dTsfcProxy(fin(c.t2m), fin(c.t850), fin(c.hModEff));
  const bin = binIndex(leadH), [bf, bt] = binRange(bin);
  const z = buildZ(site.site, { dhM, z0ModTier: site.z0Mod[tier], foehnFactor: fin(st.terrain?.foehnFactor), fRad: fin(st.terrain?.fRad), dTsfcK, validAtMs: st.validAtMs, leadH, binFromH: bf, binToH: bt });
  climaDesign(st.validAtMs, site.site.lonDeg, cxS);
  const muC = {};
  for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct', 'precip']) muC[v] = muCOfTable(T, site, v, cxS);
  const pd = st.fused?.precipitation?.dist;
  return { z, leadH, route: 1, srcMask: 0, srcCount: fin(c.srcCount), dhM, dTsfcK, k, p: {}, sigDiv, sigEns, wetShare: kPrecipRaw != null && sigDiv.precip != null ? Math.min(3, sigDiv.precip / (kPrecipRaw + 0.1)) : 0, pDryCube: pd?.kind === 'hurdleLogNormal' ? pd.pDry : null, muC, band: site.band };
}
/** The station climatology candidate (the scorer's `clima`). */
const cx = new Float64Array(C_DIM);
const climaDist = (site, v, x) => { const e = T5.T.clima?.byPoint?.[site.id]?.[v] ?? T5.T.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null; return e && e.status === 'written' ? climaAt(e, x) : null; };

function scoreRow(row) {
  const { v, y, cands, bin, strata, dayIdx, u, overlap } = row;
  const scores = {}, maes = {}, q3 = {};
  for (const [name, cd] of Object.entries(cands)) {
    if (!cd) continue;
    let point, crps = null, rec = null;
    // quantile-only candidate (live-fusion): QS3 and the MAE of its median — no CRPS
    if (cd.qs) { q3[name] = qs3Of(cd.qs, y); if (Number.isFinite(cd.point)) maes[name] = Math.abs(cd.point - y); continue; }
    if (cd.det) { point = cd.value; if (!Number.isFinite(point)) continue; crps = Math.abs(point - y); q3[name] = crps; }
    else { rec = scoreDist(cd.dist, y, u, riceN); if (!rec) continue; point = rec.point; crps = rec.crps; try { q3[name] = qs3Of(quantiles3(cd.dist), y); } catch { /* quantile of an exotic family — QS3 left out */ } }
    scores[name] = crps; maes[name] = Math.abs(point - y);
    for (const st of strata) getOr(acc, `${v}|${bin}|${name}|${st}`, () => new ScoreAcc()).add(point - y, crps, rec ? rec.pit : null, rec ? rec.sigma : null, rec ? rec.sd : null);
    if (!cd.det) for (const thr of THRESH[v] ?? []) { const p = v === 't' ? 1 - exceedance(cd.dist, thr) : exceedance(cd.dist, thr); getOr(brier, `${v}|${bin}|${name}|${thr}`, () => new BrierAcc()).add(Math.min(1, Math.max(0, p)), (v === 't' ? y < thr : y >= thr) ? 1 : 0); }
  }
  // QS3 sums per stratum (every candidate that has one)
  for (const [name, x] of Object.entries(q3)) for (const st of strata) { const o = getOr(qsAcc, `${v}|${bin}|${name}|${st}`, () => ({ n: 0, sum: 0 })); o.n += 1; o.sum += x; }
  for (const [cand, refs] of Object.entries(PAIRS)) {
    for (const ref of refs) {
      for (const st of strata) {
        if (QS3_ONLY.has(ref)) { if (q3[cand] != null && q3[ref] != null) getOr(pairs, `qs3|${v}|${bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(dayIdx, q3[cand], q3[ref]); continue; }
        if (scores[cand] != null && scores[ref] != null) getOr(pairs, `crps|${v}|${bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(dayIdx, scores[cand], scores[ref]);
        if (maes[cand] != null && maes[ref] != null) getOr(pairs, `mae|${v}|${bin}|${cand}|${ref}|${st}`, () => new PairAcc()).add(dayIdx, maes[cand], maes[ref]);
      }
    }
  }
  // L1 (leak control): full vs fold β on the overlap rows only (issue ≤ hindcastEnd AND valid ≤ hindcastEnd)
  if (overlap && scores['product@5e-full'] != null && scores['product@5e'] != null) for (const st of ['all']) getOr(pairs, `crps|${v}|${bin}|product@5e-full|product@5e|l1:${st}`, () => new PairAcc()).add(dayIdx, scores['product@5e-full'], scores['product@5e']);
}

// ── pass 2: per slot and point, the engine variants and the scoring ────────────
const ENGINE = Object.freeze({ hourly: false, tail: false });
const PRODUCT = Object.freeze({ ...ENGINE, learned: true, learnedSpeed: true, learnedPrecip: true });
const T0 = Date.now();
for (const meta of slotMeta) {
  const s = readArchiveSlot(meta.path);
  const slotAtMs = s.slotAtMs, floorMs = Math.floor(slotAtMs / H) * H;
  const dayIdx = Math.floor(slotAtMs / DAY);
  const issueInHindcast = slotAtMs <= HINDCAST_END_MS;
  const truthSlot = archiveTruth(s, countryOf);
  counts.slots += 1;
  const window = { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 };
  let n = 0;
  for (const id of pointIds) {
    if (n >= limitPoints) break;
    const row = feat.byPoint[id], site = sites.get(id), pi = pointIdx.get(id), hTrue = row.elevM;
    const cube = {};
    for (const t of ['t1', 't2', 't3']) { const ser = archiveSeries(s, t, id); if (ser) cube[t] = ser; }
    if (!Object.keys(cube).length) { counts.noSeries += 1; continue; }
    n += 1; counts.pointSlots += 1;
    for (const ser of Object.values(cube)) if (ser.sourceRunAtMs > slotAtMs) asof.cubeAfter += 1;
    const stn = archiveStation(s, id, hTrue);
    if (stn.series) { counts.stationAccepted += 1; if (stn.series.runAtMs > slotAtMs) asof.stationAfter += 1; } else if (counts.stationRejected.length < 40) counts.stationRejected.push(`${meta.slotAt.slice(0, 10)} ${id}: ${stn.reason}`);
    const nc = archiveNowcast(s, id);
    for (const x of nc.nowcast) if (stampMs(x.stamp) > slotAtMs) asof.nowcastAfter += 1;
    const obs = archiveObs(s, truthSlot.get(id), row);
    if (obs && obs.length) { counts.obs += 1; if (obs[0].validAtMs > slotAtMs) asof.obsAfter += 1; } else counts.noObs += 1;
    const live = await archiveLive(s, id);
    if (!live) counts.liveMissing += 1; else asof.liveAfterMin.push((live.fetchedAtMs - slotAtMs) / 60000);
    const lelevOk = live && Number.isFinite(live.elevation) && Math.abs(live.elevation - hTrue) <= 50;
    const base = { cube, station: stn.series, stationReason: stn.reason, nowcast: nc.nowcast, covering: nc.covering, obs, clima, nowMs: slotAtMs, window };
    const run = (inp, opts) => { counts.engineRuns += 1; try { return fuseCubePoint(inputFromArchive(s, row, inp), opts); } catch (e) { if (counts.errors.length < 20) counts.errors.push(`${meta.slotAt} ${id}: ${e?.message ?? e}`); return null; } };
    const byMs = (res) => new Map((res?.steps ?? []).map((st) => [st.validAtMs, st]));
    // product@5e: one run per fold key the steps need
    const lc5 = losoClimaProduct(T5.T, row);
    // the fold keys this point's native steps need (one engine run per key; null = full tables)
    const keysNeeded = [...new Set(Object.values(cube).flatMap((ser) => ser.steps.filter((x) => x.validAtMs > floorMs).map((x) => key5e(slotAtMs, x.validAtMs))))];
    const p5 = new Map();
    for (const k of keysNeeded) { const r = run({ ...base, learned: foldTables(T5.T, k), learnedClima: lc5 }, PRODUCT); p5.set(k, byMs(r)); if (r && !learnedNotes.has('product@5e')) learnedNotes.set('product@5e', r.calib.filter((l) => /^learned/.test(l))); }
    // diagnostics: did the chain anchor (per country), did μ_c reach the learned stage
    { const r0 = p5.values().next().value; const any = r0 ? [...r0.values()].some((st) => st.members?.some((m) => m.product === 'anchor')) : false; const cc = site.country === 'LI' ? 'CH' : site.country; const o = counts.anchored[cc] ?? (counts.anchored[cc] = { runs: 0, anchored: 0 }); o.runs += 1; if (any) o.anchored += 1; }
    const p5full = issueInHindcast ? byMs(run({ ...base, learned: T5.T, learnedClima: lc5 }, PRODUCT)) : null;
    const r4 = run({ ...base, learned: foldTables(T4.T, key4(slotAtMs)) }, PRODUCT);
    if (r4 && !learnedNotes.has('product@4')) learnedNotes.set('product@4', r4.calib.filter((l) => /^learned/.test(l)));
    const p4 = byMs(r4);
    const cu = byMs(run(base, ENGINE));
    const hcRes = run({ ...base, station: null, stationReason: 'cube-hc: ohne Station (wie der Fallbau)', nowcast: [], covering: [], obs: null }, ENGINE);
    if (!hcRes) continue;
    const persistRec = obs && obs.length ? truthSlot.get(id)?.rows.find((r) => r.ms === obs[0].validAtMs) ?? null : null;
    for (const st of hcRes.steps) {
      if (st.interpolated || !['t1', 't2', 't3'].includes(st.tier)) continue;
      const V = st.validAtMs, leadH = Math.round((V - floorMs) / H);
      if (leadH < 1) continue;
      const tr = truth.get(`${id}|${V}`);
      if (!tr) { counts.noTruth += 1; continue; }
      const bin = binIndex(leadH);
      counts.rows += 1; counts.rowsByBin[bin] += 1;
      const strata = ['all', `country:${site.country === 'LI' ? 'CH' : site.country}`, `band:${site.band}`, ...(lelevOk ? ['lelev:ok'] : [])];
      const k5 = key5e(slotAtMs, V);
      const c = {
        'product@5e': fromFused(p5.get(k5)?.get(V)?.fused ?? null),
        'product@5e-full': p5full ? fromFused(p5full.get(V)?.fused ?? null) : null,
        'product@4': fromFused(p4.get(V)?.fused ?? null),
        cube: fromFused(cu.get(V)?.fused ?? null),
        'cube-hc': fromFused(st.fused),
      };
      const sit = sitOfStep(st, site, st.tier, leadH, hTrue, T5.T);
      const flK = sit ? fromPredicted(predict(foldTables(T5.T, k5), 'K', sit)) : null;
      // deterministic candidates
      const cell = st.cell ?? {};
      const hm = cell.hModEff ?? cube[st.tier]?.hModEffM ?? null;
      const mmm = {
        t: cell.t2m != null && hm != null ? sourceToPoint('t2m', cell.t2m, hm, hTrue) : null, td: cell.td2m != null && hm != null ? sourceToPoint('td2m', cell.td2m, hm, hTrue) : null,
        ws: cell.u10 != null && cell.v10 != null ? Math.hypot(cell.u10, cell.v10) : null, gust: cell.gust ?? null, clct: cell.clct ?? null, precip: cell.precip != null ? Math.max(0, cell.precip) : null,
      };
      const sv = stn.series ? stn.series.steps.find((x) => x.validAtMs === V)?.values ?? null : null;
      const se = stn.series?.station.elev;
      const mos = sv ? {
        t: sv.t2m != null ? sourceToPoint('t2m', sv.t2m, se, hTrue) : null, td: sv.td2m != null ? sourceToPoint('td2m', sv.td2m, se, hTrue) : null,
        ws: sv.u10 != null && sv.v10 != null ? Math.hypot(sv.u10, sv.v10) : null, gust: sv.gust ?? null, clct: sv.clct ?? null, precip: sv.precip != null ? Math.max(0, sv.precip) : null,
      } : null;
      const li = live ? live.indexOf(V) : null;
      const lf = li != null ? live.fields : null;
      const liveV = lf ? { t: lf.temperature?.[li] ?? null, td: null, ws: lf.windSpeed?.[li] ?? null, gust: lf.gustSpeed?.[li] ?? null, clct: lf.cloudCoverTotal?.[li] ?? null, precip: lf.precipitation?.[li] ?? null } : null;
      const lfu = li != null && live.fusion ? live.fusion[li] : null;
      const LF = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust', clct: 'clouds', precip: 'precipitation' };
      climaDesign(V, site.site.lonDeg, cx);
      const cx0 = persistRec ? climaDesign(persistRec.ms, site.site.lonDeg, new Float64Array(C_DIM)) : null;
      const Y = { t: tr.t, td: tr.td, ws: tr.ff, gust: tr.fxh, clct: tr.n, precip: tr.rr != null ? Math.max(0, tr.rr) : null };
      const PERS = { t: 't', td: 'td', ws: 'ff', gust: 'fxh', clct: 'n', precip: 'rr' };
      const overlap = issueInHindcast && V <= HINDCAST_END_MS;
      for (const v of VARS) {
        const y = Y[v];
        if (y == null || !Number.isFinite(y)) continue;
        const cands = {};
        for (const [name, dd] of Object.entries(c)) if (dd?.[v]) cands[name] = { det: false, dist: dd[v] };
        if (flK?.[v]) cands['fl-K@5e'] = { det: false, dist: flK[v] };
        if (mmm[v] != null) cands.mmm = { det: true, value: mmm[v] };
        if (mos?.[v] != null) cands.mosmix = { det: true, value: mos[v] };
        if (liveV?.[v] != null) cands.live = { det: true, value: liveV[v] };
        const q = liveFusionQ(lfu, LF[v]);
        if (q && q.q10 != null && q.q50 != null && q.q90 != null) cands['live-fusion'] = { qs: [q.q10, q.q50, q.q90], point: q.q50 };
        // climatology (station), as the hindcast scorer builds it
        if (v === 'ws') { const du = climaDist(site, 'u', cx), dv = climaDist(site, 'v', cx); if (du && dv) cands.clima = { det: false, dist: { kind: 'rice', nu: Math.hypot(du.mu, dv.mu), sigma: Math.sqrt(0.5 * (du.sigma ** 2 + dv.sigma ** 2)) } }; }
        else if (v === 'precip') { const dp = climaDist(site, 'precip', cx); if (dp) cands.clima = { det: true, value: Math.max(0, Math.expm1(dp.mu)) }; }
        else { const d = climaDist(site, v, cx); if (d) cands.clima = { det: false, dist: v === 'gust' ? { kind: 'censoredNormal', mu: d.mu, sigma: d.sigma, lo: 0, hi: 90 } : v === 'clct' ? { kind: 'censoredNormal', mu: d.mu, sigma: d.sigma, lo: 0, hi: 100 } : { kind: 'normal', mu: d.mu, sigma: d.sigma } }; }
        // persistence: the latest reading ≤ slotAt (DE 22:00, AT/CH 23:00) and its anomaly on the climatology
        const pv = persistRec?.[PERS[v]];
        if (pv != null && Number.isFinite(pv)) {
          cands.persist = { det: true, value: v === 'precip' ? Math.max(0, pv) : pv };
          if (!['ws', 'precip'].includes(v)) { const c0 = climaDist(site, v, cx0), c1 = climaDist(site, v, cx); if (c0 && c1) cands.apersist = { det: true, value: pv - c0.mu + c1.mu }; }
        }
        scoreRow({ v, y, cands, bin, strata, dayIdx, u: pitDraw(pi, V, v), overlap });
        // L2: persistence at lead 1 against the truth of V, V + 1 h and V − 1 h (temperature)
        if (v === 't' && leadH === 1 && cands.persist) {
          const tp = truth.get(`${id}|${V + H}`)?.t, tm = truth.get(`${id}|${V - H}`)?.t;
          if (tp != null && tm != null) {
            l2.n += 1; l2.same += Math.abs(cands.persist.value - y); l2.plus += Math.abs(cands.persist.value - tp); l2.minus += Math.abs(cands.persist.value - tm);
            if (persistRec.ms === V - H) { const e = Math.abs(cands.persist.value - tm); l2.exact.n += 1; l2.exact.sumAbs += e; l2.exact.maxAbs = Math.max(l2.exact.maxAbs, e); }
            const cc = site.country === 'LI' ? 'CH' : site.country, o = l2.byCountry[cc] ?? (l2.byCountry[cc] = { n: 0, same: 0, plus: 0, minus: 0 });
            o.n += 1; o.same += Math.abs(cands.persist.value - y); o.plus += Math.abs(cands.persist.value - tp); o.minus += Math.abs(cands.persist.value - tm);
          }
        }
      }
    }
  }
  say(`${meta.slotAt} (Schema ${meta.schema}): ${n} Punkte, Zeilen bisher ${counts.rows}, Motorläufe ${counts.engineRuns}, ${Math.round((Date.now() - T0) / 1000)} s`);
}

// ── summaries ─────────────────────────────────────────────────────────────────
const card = {
  schema: 1, kind: 'fusionfit/scorecard-archive', builtAt: new Date().toISOString(), codeHash: codeHash(),
  tables: { '5e': { path: T5.path, sha256: T5.sha256, foldScheme: T5.T.inputs?.foldScheme ?? 'month', thin: T5.T.inputs?.thin?.mode ?? 'legacy' }, '4': { path: T4.path, sha256: T4.sha256, foldScheme: T4.T.inputs?.foldScheme ?? 'month', thin: T4.T.inputs?.thin?.mode ?? 'legacy' } },
  inputs: { archive: ARCH, slots: slotMeta.map((m) => ({ slotAt: m.slotAt, schema: m.schema, codeHash: m.codeHash })), points: pointIds.length, hindcastEnd, riceN, limitSlots: Number.isFinite(limitSlots) ? limitSlots : null, limitPoints: Number.isFinite(limitPoints) ? limitPoints : null },
  counts: { ...counts, truth: truthStats },
  notes: [
    'Zeilen: je Slot, DACH-Punkt und nativer Gültigzeit des Produkts (t1 vor t2 vor t3), Vorlauf ≥ 1 h ab dem Stundenboden der Slotzeit, mit Wahrheit aus irgendeinem Slot (dedupliziert nach Punkt und Stempel). Netz = das des Hindcasts (DE poi, AT tawes, CH/LI smn).',
    `Faltenregel (§1.7, eingefroren): Ausgabetag ≤ ${hindcastEnd}: Fit 5e Falte 2026-09a (Gültigzeit ≤ 15.09.) bzw. 2026-09b, Fit 4 Falte 2026-09; danach die vollen Tabellen. product@5e-full = volle Tabellen nur als Leckkontrolle L1 (Zeilen mit Ausgabetag UND Gültigzeit ≤ ${hindcastEnd}).`,
    'product@5e/@4: fuseCubePoint mit learned + learnedSpeed + learnedPrecip, MOSMIX-Stationsmember (heutige SELECTION-Regel), Nowcast-Frames des Slots, Anker aus der jüngsten Messung ≤ slotAt des eigenen Netzes; μ_c (5e) = LOSO-Schätzung des Punkts als Ein-Stations-Produkt. PAP 3 mit N = 1 (kein Block im Archiv).',
    'cube-hc = Motor wie im Fallbau (ohne Station, Nowcast, Anker); fl-K@5e = predict (Form K, Route 1) auf dessen Member mit der Situation von score.mjs sitK.',
    'Deterministisch (CRPS = MAE): mosmix (T/Td mit sourceToPoint von der Stationshöhe), live (Altfelder, ohne Td), mmm (Cube-Ebene der nächsten Zelle, T/Td mit sourceToPoint von hModEff), persist/apersist (jüngste Messung ≤ slotAt: DE 22:00, AT/CH 23:00). live-fusion nur QS3 (drei Quantile); QS3 = mittlerer Pinball ×2 an 0,1/0,5/0,9, für jeden Kandidaten aus seinen eigenen Quantilen.',
    'Bewölkung nur DE (POI n). Böen-Wahrheit = fxh (Schema-1-Fenster AT/CH ohne). Klimatologie = Stationsklimatologie (Wahrheit bis 21.09. — enthält das Fenster 14.–21.09., V-FX-17).',
    'DM auf Tagesmitteln (Tag = Ausgabetag, n_eff ≤ 12), BH über alle DM-Tests dieser Karte, Block-Bootstrap über Tage. Indikativ.',
  ],
  learnedCalib: Object.fromEntries(learnedNotes),
  controls: {
    L2: { exact: { n: l2.exact.n, meanAbs: l2.exact.n ? l2.exact.sumAbs / l2.exact.n : null, maxAbs: l2.exact.maxAbs }, n: l2.n, maePersist: l2.n ? l2.same / l2.n : null, maeTruthPlus1h: l2.n ? l2.plus / l2.n : null, maeTruthMinus1h: l2.n ? l2.minus / l2.n : null, byCountry: Object.fromEntries(Object.entries(l2.byCountry).map(([k, o]) => [k, { n: o.n, same: o.same / o.n, plus: o.plus / o.n, minus: o.minus / o.n }])) },
    L3: { cubeRunAfterSlot: asof.cubeAfter, stationRunAfterSlot: asof.stationAfter, nowcastStampAfterSlot: asof.nowcastAfter, obsAfterSlot: asof.obsAfter, liveFetchedAfterSlotMin: asof.liveAfterMin.length ? { min: Math.min(...asof.liveAfterMin), max: Math.max(...asof.liveAfterMin) } : null },
  },
  scores: {}, qs3: {}, brier: {}, pairs: {},
};
for (const [k, a] of acc) card.scores[k] = a.summary();
for (const [k, o] of qsAcc) card.qs3[k] = { n: o.n, qs3: o.n ? o.sum / o.n : null };
for (const [k, a] of brier) card.brier[k] = a.summary();
const pKeys = [], pVals = [];
for (const [k, a] of pairs) { const sm = a.summary(); if (!sm) continue; card.pairs[k] = sm; if (Number.isFinite(sm.dm?.p)) { pKeys.push(k); pVals.push(sm.dm.p); } }
const adj = benjaminiHochberg(pVals);
pKeys.forEach((k, i) => { card.pairs[k].dm.pAdj = adj[i]; });
card.tests = pKeys.length;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(card));

// markdown: per variable × bin the candidates (layer all) and product@5e against every reference
const f2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const BIN_LABEL = ['0–6', '7–24', '25–48', '51–120', '126–240', '246–336'];
const pr = (metric, v, bin, cand, ref, st = 'all') => { const p = card.pairs[`${metric}|${v}|${bin}|${cand}|${ref}|${st}`]; return p ? `${f2(100 * p.skill, 1)}${p.dm.pAdj < 0.05 ? (p.skill > 0 ? '*' : '!') : ''} (p ${f2(p.dm.pAdj, 3)}, ${p.days} d, n ${p.n})` : '—'; };
const md = [`# Scorecard FV-A (Archiv) — ${card.builtAt.slice(0, 16)} UTC`, '', `Slots ${slotMeta.length} (${slotMeta[0]?.slotAt.slice(0, 10)} … ${slotMeta[slotMeta.length - 1]?.slotAt.slice(0, 10)}), Punkte ${pointIds.length}, Zeilen ${counts.rows} (je Bin ${counts.rowsByBin.join(' · ')}), Motorläufe ${counts.engineRuns}, DM-Tests ${card.tests}; Tabellen 5e ${T5.sha256.slice(0, 12)} · Fit 4 ${T4.sha256.slice(0, 12)}; codeHash ${card.codeHash}.`, '', ...card.notes.map((n) => `- ${n}`), ''];
for (const v of VARS) {
  md.push(`## ${v}`, '', '| Bin | Kandidat | n | MAE | Bias | CRPS | QS3 | PIT außen | S/S (rms) |', '|---|---|---|---|---|---|---|---|---|');
  for (let bin = 0; bin < 6; bin++) {
    const cs = [...new Set([...acc.keys(), ...qsAcc.keys()].filter((k) => k.startsWith(`${v}|${bin}|`) && k.endsWith('|all')).map((k) => k.split('|')[2]))].sort();
    for (const c of cs) { const s = card.scores[`${v}|${bin}|${c}|all`], q = card.qs3[`${v}|${bin}|${c}|all`]; md.push(`| ${BIN_LABEL[bin]} | ${c} | ${s?.n ?? q?.n ?? '—'} | ${f2(s?.mae)} | ${f2(s?.bias)} | ${f2(s?.crps, 3)} | ${f2(q?.qs3, 3)} | ${f2(s?.pitOuter, 3)} | ${f2(s?.spreadSkill)} |`); }
  }
  md.push('', `### product@5e gegen die Referenzen (Skill %, * signifikant besser, ! signifikant schlechter; CRPS | MAE; live-fusion QS3)`, '', `| Bin | ${PAIRS['product@5e'].join(' | ')} |`, `|---|${PAIRS['product@5e'].map(() => '---').join('|')}|`);
  for (let bin = 0; bin < 6; bin++) md.push(`| ${BIN_LABEL[bin]} | ${PAIRS['product@5e'].map((r) => (QS3_ONLY.has(r) ? `QS3 ${pr('qs3', v, bin, 'product@5e', r)}` : `${pr('crps', v, bin, 'product@5e', r)} \\| ${pr('mae', v, bin, 'product@5e', r)}`)).join(' | ')} |`);
  md.push('');
}
md.push('## Kontrollen', '', `- L1 (volle Tabellen gegen Falten-β, Zeilen mit Ausgabetag und Gültigzeit ≤ ${hindcastEnd}): ${VARS.map((v) => `${v} ${[0, 1, 2, 3, 4, 5].map((b) => pr('crps', v, b, 'product@5e-full', 'product@5e', 'l1:all')).filter((x) => x !== '—').join(' / ') || '—'}`).join(' · ')}`,
  `- L2 (persist T bei Vorlauf 1): MAE gegen die Wahrheit ${f2(card.controls.L2.maePersist, 3)} K, gegen die um +1 h verschobene ${f2(card.controls.L2.maeTruthPlus1h, 3)} K, gegen −1 h ${f2(card.controls.L2.maeTruthMinus1h, 3)} K (n ${l2.n}); je Land ${Object.entries(card.controls.L2.byCountry).map(([k, o]) => `${k} ${f2(o.same, 3)} / +1 h ${f2(o.plus, 3)} / −1 h ${f2(o.minus, 3)}`).join(' · ')}`,
  `- L3 (Zeitstempel > slotAt): Cube-Läufe ${asof.cubeAfter}, Stationsläufe ${asof.stationAfter}, Nowcast-Stempel ${asof.nowcastAfter}, Messungen ${asof.obsAfter}; live abgerufen ${card.controls.L3.liveFetchedAfterSlotMin ? `${f2(card.controls.L3.liveFetchedAfterSlotMin.min, 1)}…${f2(card.controls.L3.liveFetchedAfterSlotMin.max, 1)} min` : '—'} nach dem Slot (benannt)`, '');
writeFileSync(out.replace(/\.json$/, '.md'), md.join('\n'));
say(`geschrieben ${out} (+ .md): ${counts.rows} Zeilen, ${Object.keys(card.scores).length} Zellen, ${card.tests} DM-Tests, ${Math.round((Date.now() - T0) / 60000)} min`);
if (counts.errors.length) say(`Motorfehler: ${counts.errors.length} (erste: ${counts.errors.slice(0, 3).join(' | ')})`);
