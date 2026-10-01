/**
 * stack-extract.mjs — phase FS step 1/2/4 (`audit/fusion-stationswert.md` §2.1, §2.2): the rows of the station-value study from
 * the point archive (read only). Per slot, DACH point and native valid time with a truth — the rows of `score-archive.mjs` — in
 * two modes:
 *   S  the point is the station: MOSMIX, measurement and truth from the same station (FV-A)
 *   L  leave-station-out (E-FV-1): truth at A, MOSMIX and measurement of the nearest OTHER station B; the chain at A gets B as its
 *      station member only when today's `SELECTION` accepts B for A, and B's measurement with its distance
 * Per row and variable: the truth y, MOSMIX M, the innovation I = measurement(t₀) − MOSMIX(t₀), the learned stage alone (fl-K@5e),
 * the chain product@5e with the member weights and β of `onWeights`, and the chain WITHOUT the climatological step (`rawMu`/
 * `rawSigma` of the engine). Nothing is fitted here — `stack-score.mjs` reads the rows.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/stack-extract.mjs
 *       --tables=<fit 5e>/fusion.hindcast.json --out=<root>/score/<date>-fs/rows.jsonl.gz [--archive=…] [--limitSlots=N] [--limitPoints=N]
 */
import { readFileSync, readdirSync, mkdirSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { join, dirname } from 'node:path';
import { once } from 'node:events';
import { HINDCAST_ROOT, parseArgs, codeHash } from '../hindcast/lib/common.mjs';
import { foldKeyFV, readArchiveSlot, archiveSeries, archiveStation, archiveNowcast, archiveTruth, archiveObs, archiveLive, losoClimaProduct, inputFromArchive } from './lib/archiveAdapter.mjs';
import { haversineKm } from './lib/stackFit.mjs';
import { siteOf } from './lib/rowFeatures.mjs';
import { fuseCubePoint } from '../../src/pointForecast/cubeSource.ts';
import { ClimaField } from '../../src/ml/climaField.ts';
import { predict } from '../../src/point/fusionFit/predict.ts';
import { speedLaw } from '../../src/point/fusionFit/fitSpeed.ts';
import { validateTables } from '../../src/point/fusionFit/tables.ts';
import { climaDesign, climaAt, C_DIM } from '../../src/point/fusionFit/fitClima.ts';
import { binIndex, binRange } from '../../src/point/fusionFit/strata.ts';
import { buildZ, dTsfcProxy, sourceToPoint } from '../../src/point/fusionFit/features.ts';
import { SELECTION } from '../../src/point/client/resolve.ts';
import { validateStackTable } from '../../src/pointForecast/fusion/stationValue.ts';

const H = 3_600_000, DAY = 86_400_000;
const flags = parseArgs(process.argv.slice(2));
const ARCH = typeof flags.archive === 'string' ? flags.archive : 'C:/dev/buscosun-archiv';
const featPath = typeof flags.features === 'string' ? flags.features : join(HINDCAST_ROOT, 'features', 'points.v1.json');
if (typeof flags.tables !== 'string' || typeof flags.out !== 'string') throw new Error('--tables und --out sind Pflicht');
const hindcastEnd = typeof flags.hindcastEnd === 'string' ? flags.hindcastEnd : '2026-09-21';
const HINDCAST_END_MS = Date.parse(`${hindcastEnd}T23:59:59.999Z`);
const limitSlots = Number(flags.limitSlots) || Infinity, limitPoints = Number(flags.limitPoints) || Infinity;
// --only=fit: the rows of the FIT alone (truth, MOSMIX, innovation, learned stage) — no chain, no variants; the table is fitted on these
const fitOnly = flags.only === 'fit';
const say = (s) => console.log(`[stack-extract] ${s}`);

const tb = readFileSync(flags.tables);
const T5 = JSON.parse(tb.toString('utf8'));
{ const e = validateTables(T5); if (e.length) throw new Error(`${flags.tables}: ${e.join('; ')}`); }
const tablesSha = createHash('sha256').update(tb).digest('hex');
const feat = JSON.parse(readFileSync(featPath, 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const pointIds = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const sites = new Map(pointIds.map((id) => [id, siteOf(feat.byPoint[id])]));
const countryOf = (id) => feat.byPoint[id]?.country ?? null;
// the neighbours of every point, nearest first (mode L picks the first with another catalog station and a series in the slot)
const NEIGH = new Map(pointIds.map((a) => {
  const A = feat.byPoint[a];
  return [a, pointIds.filter((b) => b !== a).map((b) => ({ id: b, km: haversineKm(A.lat, A.lon, feat.byPoint[b].lat, feat.byPoint[b].lon) })).sort((x, y) => x.km - y.km).slice(0, 12)];
}));
const slotPaths = [];
// AX-2: `--slotsTo=YYYY-MM-DD` — the archive writes schema 3 since 29.09.2026 (PA4), which `archiveAdapter.mjs` does not read
// yet (V-AX-4); until it does, the extraction stops at the last schema-2 day instead of throwing on the first schema-3 slot.
const slotsTo = typeof flags.slotsTo === 'string' ? flags.slotsTo : null;
// AX (measurement "now against 5e"): `--slotsFrom=YYYY-MM-DD` limits the ISSUE slots of pass 2 — pass 1 still reads the truth of
// EVERY slot up to `--slotsTo`, because the truth of an issue day lives in the slots after it (a window of 25 h per slot)
const slotsFrom = typeof flags.slotsFrom === 'string' ? flags.slotsFrom : null;
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && (!slotsTo || x <= slotsTo)).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x)).sort()) slotPaths.push(join(ARCH, d, f));
const slotsUsed = slotPaths.slice(0, limitSlots);
if (slotsTo) say(`Slots bis ${slotsTo} (--slotsTo)`);
if (slotsFrom) say(`Ausgabe-Slots ab ${slotsFrom} (--slotsFrom); Wahrheit aus allen Slots`);
say(`${slotsUsed.length} Slots, ${pointIds.length} DACH-Punkte; Tabellen ${tablesSha.slice(0, 12)} (${T5.inputs?.foldScheme ?? 'month'})`);

/** The fold tables of one table set: mean, occurrence and (AX-4) atoms take the held-out β of the key; null key = the full tables. */
const foldTablesOf = (T) => {
  const cache = new Map();
  return (key) => {
    if (key == null) return T;
    if (cache.has(key)) return cache.get(key);
    const mean = {}, occurrence = {}, atoms = T.atoms ? {} : undefined;
    for (const [k, e] of Object.entries(T.mean)) mean[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
    for (const [k, e] of Object.entries(T.occurrence)) occurrence[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
    if (atoms) for (const [k, e] of Object.entries(T.atoms)) atoms[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
    const t = { ...T, mean, occurrence, ...(atoms ? { atoms } : {}) };
    cache.set(key, t);
    return t;
  };
};
const foldTables = foldTablesOf(T5);
// AX-4 / AX-12b: `--tables2=<fit>/fusion.ax4.json` — the same learned tables WITH written atoms (the two-atom cloud family, applied by
// `predict.ts` where a stratum carries both atoms); variant P5 = P3 computed with these tables ⇒ the only difference is the cloud family
let T6 = null, tables2Sha = null;
if (typeof flags.tables2 === 'string') {
  const tb2 = readFileSync(flags.tables2);
  T6 = JSON.parse(tb2.toString('utf8'));
  { const e = validateTables(T6); if (e.length) throw new Error(`${flags.tables2}: ${e.join('; ')}`); }
  if (!T6.atoms || !Object.keys(T6.atoms).length) throw new Error(`${flags.tables2}: keine Atome (atoms) in der Tabelle`);
  tables2Sha = createHash('sha256').update(tb2).digest('hex');
}
const foldTables2 = T6 ? foldTablesOf(T6) : null;
if (T6) say(`Tabellen 2 (Atome): ${tables2Sha.slice(0, 12)}, ${Object.keys(T6.atoms).length} Atom-Einträge (${Object.values(T6.atoms).filter((e) => e.status === 'written').length} geschrieben)`);
const key5e = (issueMs, validMs) => foldKeyFV(T5.inputs?.foldScheme === 'half' ? 'half' : 'month', issueMs, validMs, HINDCAST_END_MS);

// ── pass 1: the truth of every slot, deduplicated by (point, stamp) ──────────────
const truth = new Map();
const slotMeta = [];
for (const p of slotsUsed) {
  const s = readArchiveSlot(p);
  for (const [id, rec] of archiveTruth(s, countryOf)) for (const r of rec.rows) {
    const k = `${id}|${r.ms}`, prev = truth.get(k);
    if (prev) { for (const x of Object.keys(r)) if (prev[x] == null && r[x] != null) prev[x] = r[x]; continue; }
    truth.set(k, { ...r });
  }
  slotMeta.push({ path: p, slotAt: s.slotAt, slotAtMs: s.slotAtMs, schema: s.schema });
}
say(`Wahrheit: ${truth.size} (Punkt, Stunde)-Paare`);

// ── helpers ───────────────────────────────────────────────────────────────────
const fin = (x) => (x != null && Number.isFinite(x) ? x : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const rd = (d) => { if (!d) return null; const o = {}; for (const [k, v] of Object.entries(d)) o[k] = typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v; return o; };
const cxS = new Float64Array(C_DIM);
const muCOfTable = (T, site, v, x) => {
  const est = T.climaMu?.byPoint?.[site.id]?.[v];
  if (est) { let s = 0; for (let i = 0; i < C_DIM; i++) s += est[i] * x[i]; return s; }
  const e = T.clima?.byPoint?.[site.id]?.[v] ?? T.clima?.pooled?.[`${site.band}|${site.country}`]?.[v] ?? null;
  return e && e.status === 'written' ? climaAt(e, x).mu : null;
};
/** The form-K situation of a cube-hc step (`score-archive.mjs sitOfStep`, unchanged). */
function sitOfStep(st, site, tier, leadH, hTrue, T) {
  const m = st.samples?.find((s) => typeof s.source === 'string' && s.source.startsWith('cube-'));
  if (!m) return null;
  const c = st.cell ?? {};
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
const FUSED = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust', clct: 'clouds', precip: 'precipitation' };
const WKEY = { t: 'temperature', td: 'dewpoint', ws: 'wind', gust: 'gust', clct: 'clouds' };
/** The chain's step for one variable: distribution, weights, β and the distribution WITHOUT the climatological step. */
function chainOf(step, v, speedEntry) {
  const f = step?.fused?.[FUSED[v]];
  if (!f?.dist) return null;
  const out = { P: rd(f.dist) };
  const w = step.weights?.[WKEY[v]];
  if (w) {
    out.b = r3(w.beta);
    let wm = 0, wc = 0, wo = 0;
    for (const m of w.members) { if (m.tag === 'mosmix') wm += m.w; else if (String(m.tag).startsWith('cube-')) wc += m.w; else wo += m.w; }
    out.wM = r3(wm); out.wC = r3(wc); if (wo > 0) out.wO = r3(wo);
  }
  if (v === 'precip' || f.climatologyOnly || !Number.isFinite(f.rawMu) || !Number.isFinite(f.rawSigma) || !(f.rawSigma > 0)) return out;
  out.raw = r3(f.rawMu);
  if (v === 'ws') {
    const rice = { nu: Math.max(0, f.rawMu), sigma: f.rawSigma };
    out.N = rd(step.flags?.includes('learnedSpeed') && speedEntry ? speedLaw(rice, speedEntry) : { kind: 'rice', ...rice });
    return out;
  }
  // σ² of the chain = β·rawσ² + extra (regime, phase) ⇒ without the step: rawσ² + extra
  const beta = w?.beta, sg = f.dist.sigma;
  const extra = beta != null && Number.isFinite(sg) ? Math.max(0, sg * sg - beta * f.rawSigma * f.rawSigma) : 0;
  const sN = Math.sqrt(f.rawSigma * f.rawSigma + extra);
  if (v === 't' || v === 'td') { out.N = rd({ kind: 'normal', mu: f.rawMu, sigma: sN }); if (f.dist.kind === 'normal') out.mu = r3(f.dist.mu); }
  else if (v === 'gust') out.N = rd({ kind: 'censoredNormal', mu: f.rawMu, sigma: sN, lo: 0, hi: 90 });
  else if (v === 'clct') out.N = rd({ kind: 'censoredNormal', mu: f.rawMu, sigma: sN, lo: 0, hi: 100 });
  return out;
}
/** MOSMIX of a station series at a valid time, T/Td brought to the height `hTo`. */
function mosAt(series, ms, hTo) {
  const sv = series?.steps.find((x) => x.validAtMs === ms)?.values ?? null;
  if (!sv) return null;
  const se = series.station.elev;
  return {
    t: sv.t2m != null ? sourceToPoint('t2m', sv.t2m, se, hTo) : null, td: sv.td2m != null ? sourceToPoint('td2m', sv.td2m, se, hTo) : null,
    ws: sv.u10 != null && sv.v10 != null ? Math.hypot(sv.u10, sv.v10) : null, gust: sv.gust ?? null, clct: sv.clct ?? null, precip: sv.precip != null ? Math.max(0, sv.precip) : null,
  };
}
const OBS = { t: 't', td: 'td', ws: 'ff', gust: 'fxh' };
/** The innovation of MOSMIX at the measurement: measurement(t₀) − MOSMIX(t₀), both at the height of the measuring station. */
function innovationOf(series, rec, hObs) {
  if (!series || !rec) return null;
  const m0 = mosAt(series, rec.ms, hObs);
  if (!m0) return null;
  const o = {};
  for (const v of Object.keys(OBS)) { const y0 = rec[OBS[v]]; o[v] = y0 != null && Number.isFinite(y0) && m0[v] != null ? y0 - m0[v] : null; }
  return o;
}

// ── pass 2 ────────────────────────────────────────────────────────────────────
mkdirSync(dirname(flags.out), { recursive: true });
const gz = createGzip({ level: 6 });
const sink = createWriteStream(flags.out);
gz.pipe(sink);
const write = async (o) => { if (!gz.write(`${JSON.stringify(o)}\n`)) await once(gz, 'drain'); };
const counts = { slots: 0, pointSlots: 0, rows: 0, engineRuns: 0, errors: [], modeL: { pointSlots: 0, noNeighbour: 0, memberAccepted: 0, sameStation: 0, zeroKm: 0, obs: 0 }, modeS: { station: 0, obs: 0 } };
const ENGINE = Object.freeze({ hourly: false, tail: false });
const PRODUCT = Object.freeze({ ...ENGINE, learned: true, learnedSpeed: true, learnedPrecip: true });
// run 2 (phase FS step 5): the engine options of the phase, each on top of the one before
const VARIANTS = Object.freeze({
  P1: { ...PRODUCT, learnedAtPoint: true },                                                       // product+fix (V-FS-2)
  P2: { ...PRODUCT, learnedAtPoint: true, priorShrink: false },                                   // … without the climatological step (D2)
  P3: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true },   // … clouds passed through (H14), station value (H9/H10)
  // phase AX, AX-2 (E-FV-3): the stage `fs` with the learned strata of route 3 in t2/t3 (`learnedRoute: 'tier'`)
  P4: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true, learnedRoute: 'tier' },
  // phase AX, AX-4 (E-AX-4/5): the stage `fs` with the tables that carry the cloud atoms (`--tables2`) — same options as P3
  P5: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true },
  // phase AX, E-AX-11 (V-AX-13): wind without a station — P6 wind/gust keep the climatological step, P7 the wind anchor is damped
  // over the distance of the measurement (10 km), P8 both; each on top of P3 (the stage as it runs)
  P6: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true, priorShrinkWind: true },
  P7: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true, anchorWindKm: 10 },
  P8: { ...PRODUCT, learnedAtPoint: true, priorShrink: false, learnedClouds: true, stationValue: true, priorShrinkWind: true, anchorWindKm: 10 },
});
// `--variants=P3,P6,P7,P8` — only these variants are computed (default: all); the product and cube-hc runs are always computed
const variantFilter = typeof flags.variants === 'string' ? new Set(flags.variants.split(',').map((s) => s.trim()).filter(Boolean)) : null;
if (variantFilter) { for (const v of variantFilter) if (!VARIANTS[v]) throw new Error(`--variants: unbekannte Variante ${v}`); say(`Varianten: ${[...variantFilter].join(', ')} (--variants)`); }
const EQ_POINTS = 25;   // per slot: the engine with priorShrink:false on the run-1 chain, against the offline form (K5)
const stackTable = typeof flags.stack === 'string' ? JSON.parse(readFileSync(flags.stack, 'utf8')) : null;
{ const e = stackTable ? validateStackTable(stackTable) : []; if (e.length) throw new Error(`${flags.stack}: ${e.join('; ')}`); }
await write({ kind: 'fusionfit/stack-rows', schema: 2, stack: stackTable ? { path: flags.stack, builtAt: stackTable.builtAt, entries: Object.keys(stackTable.entries).length } : null, variants: VARIANTS, builtAt: new Date().toISOString(), codeHash: codeHash(), tables: { path: flags.tables, sha256: tablesSha }, tables2: T6 ? { path: flags.tables2, sha256: tables2Sha, atoms: Object.keys(T6.atoms).length } : null, archive: ARCH, slots: slotMeta.map((m) => ({ slotAt: m.slotAt, schema: m.schema })), slotsFrom, hindcastEnd, points: pointIds.length });
const T0 = Date.now();
const issueSlots = slotsFrom ? slotMeta.filter((m) => m.slotAt.slice(0, 10) >= slotsFrom) : slotMeta;
if (slotsFrom) say(`${issueSlots.length} Ausgabe-Slots (${issueSlots[0]?.slotAt ?? '—'} … ${issueSlots[issueSlots.length - 1]?.slotAt ?? '—'})`);
for (const meta of issueSlots) {
  const s = readArchiveSlot(meta.path);
  const slotAtMs = s.slotAtMs, floorMs = Math.floor(slotAtMs / H) * H, dayIdx = Math.floor(slotAtMs / DAY);
  const truthSlot = archiveTruth(s, countryOf);
  counts.slots += 1;
  const window = { fromMs: floorMs, toMs: floorMs + 336 * H, stepH: 1 };
  const stationId = (id) => s.stations?.byPoint?.[id]?.station?.id ?? null;
  const latestObsRec = (id) => { const tr = truthSlot.get(id); if (!tr) return null; let best = null; for (const r of tr.rows) if (r.ms <= slotAtMs && r.t != null && (!best || r.ms > best.ms)) best = r; return best; };
  let n = 0;
  for (const id of pointIds) {
    if (n >= limitPoints) break;
    const row = feat.byPoint[id], site = sites.get(id), hTrue = row.elevM;
    const cube = {};
    for (const t of ['t1', 't2', 't3']) { const ser = archiveSeries(s, t, id); if (ser) cube[t] = ser; }
    if (!Object.keys(cube).length) continue;
    n += 1; counts.pointSlots += 1;
    const nc = archiveNowcast(s, id);
    const live = await archiveLive(s, id);
    const lc5 = losoClimaProduct(T5, row);
    const run = (inp, opts) => { counts.engineRuns += 1; try { return fuseCubePoint(inputFromArchive(s, row, inp), opts); } catch (e) { if (counts.errors.length < 20) counts.errors.push(`${meta.slotAt} ${id}: ${e?.message ?? e}`); return null; } };
    const byMs = (res) => new Map((res?.steps ?? []).map((st) => [st.validAtMs, st]));
    const keysNeeded = [...new Set(Object.values(cube).flatMap((ser) => ser.steps.filter((x) => x.validAtMs > floorMs).map((x) => key5e(slotAtMs, x.validAtMs))))];

    // mode S: the point's own station and measurement
    const stnS = archiveStation(s, id, hTrue);
    const obsS = archiveObs(s, truthSlot.get(id), row);
    const recS = latestObsRec(id);
    if (stnS.series) counts.modeS.station += 1;
    if (recS) counts.modeS.obs += 1;
    const baseS = { cube, station: stnS.series, stationReason: stnS.reason, nowcast: nc.nowcast, covering: nc.covering, obs: obsS, clima, nowMs: slotAtMs, window };
    const pS = new Map();
    if (!fitOnly) for (const k of keysNeeded) pS.set(k, byMs(run({ ...baseS, learned: foldTables(k), learnedClima: lc5 }, PRODUCT)));
    const innS = innovationOf(stnS.series, recS, hTrue);
    // the variants read the measurement with its dew point; the station value reads the HOUR maximum of the gust (the truth's definition)
    const withTd = (obs, rec) => (obs && obs.length && rec ? obs.map((o) => ({ ...o, dewPoint: rec.td ?? null })) : obs);
    const forStack = (obs, rec) => (obs && obs.length && rec ? obs.map((o) => ({ ...o, dewPoint: rec.td ?? null, gust: rec.fxh ?? null })) : obs);
    const runVariants = (base, obs, rec) => {
      const out = {};
      if (fitOnly) return out;
      for (const [name, opts] of Object.entries(VARIANTS)) {
        if (variantFilter && !variantFilter.has(name)) continue;
        const withStack = name !== 'P1' && name !== 'P2';
        if (withStack && !stackTable) continue;
        if (name === 'P5' && !foldTables2) continue;
        const tablesOf = name === 'P5' ? foldTables2 : foldTables;
        const m = new Map();
        for (const k of keysNeeded) m.set(k, byMs(run({ ...base, obs: withStack ? forStack(obs, rec) : withTd(obs, rec), learned: tablesOf(k), learnedClima: lc5, ...(withStack ? { stack: stackTable } : {}) }, opts)));
        out[name] = m;
      }
      return out;
    };
    const vS = runVariants(baseS, obsS, recS);
    let eqS = null;
    if (n <= EQ_POINTS && !fitOnly) { eqS = new Map(); for (const k of keysNeeded) eqS.set(k, byMs(run({ ...baseS, learned: foldTables(k), learnedClima: lc5 }, { ...PRODUCT, priorShrink: false }))); }

    // mode L: the nearest other station B
    let B = null;
    const ownStation = stationId(id);
    for (const c of NEIGH.get(id)) {
      const sid = stationId(c.id);
      if (!sid || sid === ownStation) { if (sid && sid === ownStation) counts.modeL.sameStation += 1; continue; }
      const rowB = feat.byPoint[c.id];
      const sb = archiveStation(s, c.id, rowB.elevM);
      if (!sb.series) continue;
      if (!(c.km > 0)) { counts.modeL.zeroKm += 1; continue; }
      B = { id: c.id, km: c.km, row: rowB, series: sb.series };
      break;
    }
    let pL = null, innL = null, serL = null, dhL = null, memberL = false, vL = null;
    if (B) {
      counts.modeL.pointSlots += 1;
      dhL = B.series.station.elev - hTrue;
      serL = { ...B.series, station: { ...B.series.station, distanceKm: B.km, dElevM: dhL } };
      const atPoint = B.km <= SELECTION.stationAtPointKm;
      memberL = B.km <= SELECTION.stationMaxKm && (atPoint || Math.abs(dhL) <= SELECTION.stationMaxDElevM);
      if (memberL) counts.modeL.memberAccepted += 1;
      const obsB0 = archiveObs(s, truthSlot.get(B.id), B.row);
      const obsB = obsB0 && obsB0.length ? obsB0.map((o) => ({ ...o, distanceM: B.km * 1000 })) : obsB0;
      const recB = latestObsRec(B.id);
      if (recB) counts.modeL.obs += 1;
      const baseL = { cube, station: memberL ? serL : null, stationReason: memberL ? `Modus L: ${B.series.station.name}, ${B.km.toFixed(1)} km, Δh ${Math.round(dhL)} m` : `Modus L: Nachbar ${B.series.station.name}, ${B.km.toFixed(1)} km, Δh ${Math.round(dhL)} m — vertritt den Punkt nicht (SELECTION)`, nowcast: nc.nowcast, covering: nc.covering, obs: obsB, clima, nowMs: slotAtMs, window };
      pL = new Map();
      if (!fitOnly) for (const k of keysNeeded) pL.set(k, byMs(run({ ...baseL, learned: foldTables(k), learnedClima: lc5 }, PRODUCT)));
      vL = runVariants(baseL, obsB, recB);
      innL = innovationOf(B.series, recB, B.row.elevM);
      if (innL) innL.ms = recB.ms;
    } else counts.modeL.noNeighbour += 1;

    const hcRes = run({ ...baseS, station: null, stationReason: 'cube-hc: ohne Station (wie der Fallbau)', nowcast: [], covering: [], obs: null }, ENGINE);
    if (!hcRes) continue;
    for (const st of hcRes.steps) {
      if (st.interpolated || !['t1', 't2', 't3'].includes(st.tier)) continue;
      const V = st.validAtMs, leadH = Math.round((V - floorMs) / H);
      if (leadH < 1) continue;
      const tr = truth.get(`${id}|${V}`);
      if (!tr) continue;
      const k5 = key5e(slotAtMs, V);
      const sit = sitOfStep(st, site, st.tier, leadH, hTrue, T5);
      const pr = sit ? predict(foldTables(k5), 'K', sit) : null;
      // the learned stage as the CLIENT computes it: the chain's situation carries no height band, so the speed law is the pooled
      // entry (the scorer's fl-K takes the band entry, A1) — the station value is fitted on and applied to the client's form
      const prC = sit ? predict(foldTables(k5), 'K', { ...sit, band: undefined }) : null;
      const flC = prC ? { t: prC.dist.temperature ?? null, td: prC.dist.dewPoint ?? null, ws: prC.dist.windSpeed ?? null, gust: prC.dist.gust ?? null } : null;
      const flK = pr ? { t: pr.dist.temperature ?? null, td: pr.dist.dewPoint ?? null, ws: pr.dist.windSpeed ?? null, gust: pr.dist.gust ?? null, clct: pr.dist.clouds ?? null, precip: pr.dist.precipitation ?? null } : null;
      const li = live ? live.indexOf(V) : null, lf = li != null ? live.fields : null;
      const liveV = lf ? { t: lf.temperature?.[li] ?? null, ws: lf.windSpeed?.[li] ?? null, gust: lf.gustSpeed?.[li] ?? null, clct: lf.cloudCoverTotal?.[li] ?? null, precip: lf.precipitation?.[li] ?? null } : {};
      const Y = { t: tr.t, td: tr.td, ws: tr.ff, gust: tr.fxh, clct: tr.n, precip: tr.rr != null ? Math.max(0, tr.rr) : null };
      const mS = mosAt(stnS.series, V, hTrue), mL = serL ? mosAt(serL, V, hTrue) : null;
      const stS = pS.get(k5)?.get(V) ?? null, stL = pL ? pL.get(k5)?.get(V) ?? null : null;
      const vars = {};
      for (const v of ['t', 'td', 'ws', 'gust', 'clct', 'precip']) {
        const y = Y[v];
        if (y == null || !Number.isFinite(y)) continue;
        const o = { y: r3(y) };
        if (flK?.[v]) o.L = rd(flK[v]);
        if (flC?.[v] && v === 'ws') o.Lc = rd(flC[v]);
        if (liveV[v] != null) o.live = r3(liveV[v]);
        const variantsOf = (vs) => {
          const out = {};
          for (const [name, m] of Object.entries(vs ?? {})) {
            const stp = m.get(k5)?.get(V) ?? null, f = stp?.fused?.[FUSED[v]];
            if (f?.dist) out[name] = rd(f.dist);
            const sv = stp?.post?.stationValue?.[v];
            if (sv) out.sv = { f: sv.form, g: sv.group, x: Math.round(sv.value * 1e6) / 1e6 };
          }
          return out;
        };
        const S = { M: r3(mS?.[v]), I: r3(innS?.[v]), ...(chainOf(stS, v, prC?.speed ?? null) ?? {}), ...variantsOf(vS) };
        const fe = eqS ? eqS.get(k5)?.get(V)?.fused?.[FUSED[v]] : null;
        if (fe?.dist) S.PN = rd(fe.dist);
        o.S = S;
        if (B) o.Lm = { M: r3(mL?.[v]), I: r3(innL?.[v]), ...(chainOf(stL, v, prC?.speed ?? null) ?? {}), ...variantsOf(vL) };
        vars[v] = o;
      }
      if (!Object.keys(vars).length) continue;
      counts.rows += 1;
      await write({
        id, d: dayIdx, V: V / H, lead: leadH, cc: site.country === 'LI' ? 'CH' : site.country, band: site.band, tier: st.tier,
        tS: recS ? (V - recS.ms) / H : null, tL: innL?.ms != null ? (V - innL.ms) / H : null,
        ...(B ? { B: B.id, km: r3(B.km), dh: Math.round(dhL), mem: memberL ? 1 : 0 } : {}),
        anc: stS?.flags?.includes('anchored') ? 1 : 0,
        v: vars,
      });
    }
  }
  say(`${meta.slotAt} (Schema ${meta.schema}): ${n} Punkte, Zeilen bisher ${counts.rows}, Motorläufe ${counts.engineRuns}, ${Math.round((Date.now() - T0) / 1000)} s`);
}
await write({ kind: 'fusionfit/stack-rows-end', counts });
gz.end();
await once(sink, 'finish');
say(`geschrieben ${flags.out}: ${counts.rows} Zeilen, ${counts.engineRuns} Motorläufe, ${Math.round((Date.now() - T0) / 60000)} min; Modus L: ${JSON.stringify(counts.modeL)}`);
if (counts.errors.length) say(`Motorfehler: ${counts.errors.length} (erste: ${counts.errors.slice(0, 3).join(' | ')})`);
