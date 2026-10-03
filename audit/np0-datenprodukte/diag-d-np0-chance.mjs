/**
 * np0-chance.mjs — NP-0 diagnosis D-NP0-10/D-NP0-12 (audit/np0-datenprodukte.md §3.2, E-NP0-4): which "chance of wet" belongs
 * on the cube field? Read only: the point archive (C:/dev/buscosun-archiv), the rows of the Fusion-8 card
 * (score/2026-10-02-f8r-b/rows.jsonl.gz — truth y, Fusion 8 = variant F8r in mode S and L), the Fit-5e tables.
 *
 * Candidates per (point, issue slot, valid hour), lead 3–48 h (t1, native 1-h steps):
 *   F1   buscosun Fusion 8's chain with the cube as the ONLY source: fuseCubePoint unchanged, station null, nowcast [], obs null,
 *        stage-fs options (learned + learnedPrecip …), fold tables as in stack-extract ⇒ the learned hurdle on K-2's pDry
 *   F1n  F1 with neutral terrain (tpi2000 = 0, slope 0, no land cover) — what a producer without a DEM per cell would compute
 *   F0   the engine without the learned stage (K-2 alone on the cube member)
 *   F2   censored normal N(μ = precip, σ = √(σ_div² + σ_ens²)) via dist.ts, P(X ≥ 0,1 mm/h)
 *   F2d  the same with σ_div only
 *   F3   the mean alone as 0/1 (μ ≥ 0,1) — what a map of the amount alone implies
 *   CL   the engine's climatological hourly wet probability (ClimaField wetProb → 1 − (1 − p)^(1/6), fuse.ts)
 *   F8S  Fusion 8 at the station (rows S.F8r), F8L Fusion 8 without the point's station (rows Lm.F8r), F8L0 = F8L with mem = 0
 *   flK  the learned stage alone (rows L) — cross-check of F1
 * Truth: station hour sum ≥ 0,1 mm (the scorer's y); p_wet of a hurdle = 1 − pDry (stack-score `pWetOf`).
 *
 *   node --experimental-strip-types --import file:///C:/dev/buscosun-web/scripts/lib/register-ts.mjs np0-chance.mjs --out=<dir> [--limitSlots=N] [--limitPoints=N]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
const W = 'file:///C:/dev/buscosun-web/';
const { readArchiveSlot, archiveSeries, losoClimaProduct, inputFromArchive, terrainOf, foldKeyFV } = await import(W + 'scripts/fusionfit/lib/archiveAdapter.mjs');
const { BrierAcc, PairAcc, benjaminiHochberg } = await import(W + 'scripts/fusionfit/lib/stats.mjs');
const { fuseCubePoint } = await import(W + 'src/pointForecast/cubeSource.ts');
const { ClimaField } = await import(W + 'src/ml/climaField.ts');
const { cdfOf } = await import(W + 'src/pointForecast/fusion/dist.ts');
const { validateTables } = await import(W + 'src/point/fusionFit/tables.ts');
const { WET_HOURS_PER_WET_DAY } = await import(W + 'src/pointForecast/fusion/priors.ts');

const H = 3_600_000, DAY = 86_400_000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const OUT = args.out ?? 'np0-chance-out';
const ARCH = 'C:/dev/buscosun-archiv';
const ROWS = 'C:/dev/buscosun-hindcast/score/2026-10-02-f8r-b/rows.jsonl.gz';
const T5P = 'C:/dev/buscosun-hindcast/fit/2026-09-27-fx5e/fusion.hindcast.json';
const T6P = 'C:/dev/buscosun-hindcast/fit/2026-09-30-ax4/fusion.ax4.json';
const FEAT = 'C:/dev/buscosun-hindcast/features/points.v1.json';
const limitSlots = Number(args.limitSlots) || Infinity, limitPoints = Number(args.limitPoints) || Infinity;
const LEAD_MIN = 3, LEAD_MAX = 48, WET = 0.1;
const BINS = [{ id: '3–6', lo: 3, hi: 6 }, { id: '7–24', lo: 7, hi: 24 }, { id: '25–48', lo: 25, hi: 48 }];
const binOf = (L) => BINS.findIndex((b) => L >= b.lo && L <= b.hi);
const say = (s) => console.log(`[np0-chance] ${s}`);
mkdirSync(OUT, { recursive: true });

const T5 = JSON.parse(readFileSync(T5P, 'utf8')), T6 = JSON.parse(readFileSync(T6P, 'utf8'));
for (const [p, T] of [[T5P, T5], [T6P, T6]]) { const e = validateTables(T); if (e.length) throw new Error(`${p}: ${e.join('; ')}`); }
const feat = JSON.parse(readFileSync(FEAT, 'utf8'));
const clima = new ClimaField(JSON.parse(readFileSync(new URL('public/climaGrid.json', W), 'utf8')));
const DACH = new Set(['DE', 'AT', 'CH', 'LI']);
const pointIds = Object.keys(feat.byPoint).filter((id) => DACH.has(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
const HINDCAST_END_MS = Date.parse('2026-09-21T23:59:59.999Z');
const key5e = (issueMs, validMs) => foldKeyFV(T6.inputs?.foldScheme === 'half' ? 'half' : 'month', issueMs, validMs, HINDCAST_END_MS);
const foldCache = new Map();
const foldTables = (key) => {   // stack-extract foldTablesOf(T6), unchanged
  if (key == null) return T6;
  if (foldCache.has(key)) return foldCache.get(key);
  const mean = {}, occurrence = {}, atoms = T6.atoms ? {} : undefined;
  for (const [k, e] of Object.entries(T6.mean)) mean[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  for (const [k, e] of Object.entries(T6.occurrence)) occurrence[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  if (atoms) for (const [k, e] of Object.entries(T6.atoms)) atoms[k] = e.folds?.[key] ? { ...e, beta: e.folds[key] } : e;
  const t = { ...T6, mean, occurrence, ...(atoms ? { atoms } : {}) };
  foldCache.set(key, t); return t;
};
const ENGINE = Object.freeze({ hourly: false, tail: false });
// the stage fs of Fusion 8 (cubeSource forecastFromBundle), WITHOUT the station value (no station ⇒ it has nothing to act on)
const F1OPT = Object.freeze({ ...ENGINE, learned: true, learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, learnedClouds: true, priorShrink: false, anchorWindKm: 10, nowcastHourMean: true });

// ── pass A: the card rows (truth + Fusion 8) ─────────────────────────────────
const rows = new Map();   // `${id}|${d}|${V}` → row
const daysWanted = new Set();
{
  const rl = createInterface({ input: createReadStream(ROWS).pipe(createGunzip()), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line.startsWith('{"id"')) continue;
    const r = JSON.parse(line);
    if (r.lead < LEAD_MIN || r.lead > LEAD_MAX || r.tier !== 't1') continue;
    const p = r.v?.precip;
    if (!p || p.y == null) continue;
    const pw = (d) => (d && d.kind === 'hurdleLogNormal' ? 1 - Math.max(0, Math.min(1, d.pDry)) : null);
    rows.set(`${r.id}|${r.d}|${r.V}`, { id: r.id, d: r.d, V: r.V, lead: r.lead, cc: r.cc, y: p.y >= WET ? 1 : 0, yv: p.y, mem: r.mem ?? null, B: r.B ?? null,
      F8S: pw(p.S?.F8r), F8L: pw(p.Lm?.F8r), flK: pw(p.L) });
    daysWanted.add(r.d); n += 1;
  }
  say(`Karte: ${n} Niederschlagszeilen bei ${LEAD_MIN}–${LEAD_MAX} h, ${daysWanted.size} Ausgabetage`);
}

// ── pass B: recompute the cube candidates from the archive ───────────────────
const slotPaths = [];
for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x)).sort()) slotPaths.push(join(ARCH, d, f));
const timing = { F1: { ms: 0, n: 0 }, F0: { ms: 0, n: 0 }, F1n: { ms: 0, n: 0 } };
const counts = { slots: 0, pointSlots: 0, joined: 0, noCube: 0, engineErr: [], f1Flag: { learnedPrecip: 0, k2: 0 }, f2: { sigEns: 0, sigDivOnly: 0, sigZero: 0, mu: 0 } };
const neutralTerrain = (t) => (t ? { ...t, tpi500M: 0, tpi2000M: 0, slopeDeg: 0, aspectDeg: 0, svf: 1, sinkDepthM: 0 } : t);
let slotsDone = 0;
for (const path of slotPaths) {
  if (slotsDone >= limitSlots) break;
  const s = readArchiveSlot(path);
  const dayIdx = Math.floor(s.slotAtMs / DAY);
  if (!daysWanted.has(dayIdx)) continue;
  slotsDone += 1; counts.slots += 1;
  const floorMs = Math.floor(s.slotAtMs / H) * H;
  const window = { fromMs: floorMs, toMs: floorMs + LEAD_MAX * H, stepH: 1 };
  let np = 0;
  for (const id of pointIds) {
    if (np >= limitPoints) break;
    const row = feat.byPoint[id];
    const ser = archiveSeries(s, 't1', id);
    if (!ser) { counts.noCube += 1; continue; }
    // only points/hours the card has
    const wantV = ser.steps.map((x) => x.validAtMs).filter((V) => rows.has(`${id}|${dayIdx}|${V / H}`));
    if (!wantV.length) continue;
    np += 1; counts.pointSlots += 1;
    const lc5 = losoClimaProduct(T5, row);
    const keys = [...new Set(wantV.map((V) => key5e(s.slotAtMs, V)))];
    const base = { cube: { t1: ser }, station: null, stationReason: 'NP-0 F1: Zelle ohne Station', nowcast: [], covering: [], obs: null, clima, nowMs: s.slotAtMs, window };
    const run = (name, inpExtra, opts, rowOverride) => {
      const t0 = performance.now();
      try {
        const inp = inputFromArchive(s, rowOverride ?? row, { ...base, ...inpExtra });
        if (name === 'F1n') { inp.terrain = neutralTerrain(inp.terrain); inp.z0 = null; inp.urban = null; }
        const r = fuseCubePoint(inp, opts);
        timing[name].ms += performance.now() - t0; timing[name].n += 1;
        return new Map(r.steps.map((st) => [st.validAtMs, st]));
      } catch (e) { if (counts.engineErr.length < 20) counts.engineErr.push(`${s.slotAt} ${id} ${name}: ${e?.message ?? e}`); return new Map(); }
    };
    const byKey = new Map();
    for (const k of keys) byKey.set(k, { F1: run('F1', { learned: foldTables(k), learnedClima: lc5 }, F1OPT), F1n: run('F1n', { learned: foldTables(k), learnedClima: lc5 }, F1OPT) });
    const f0 = run('F0', {}, ENGINE);
    const stepAt = new Map(ser.steps.map((x) => [x.validAtMs, x]));
    for (const V of wantV) {
      const r = rows.get(`${id}|${dayIdx}|${V / H}`);
      const k = byKey.get(key5e(s.slotAtMs, V));
      const st1 = k.F1.get(V), st1n = k.F1n.get(V), st0 = f0.get(V);
      const pw = (st) => { const d = st?.fused?.precipitation?.dist; return d && d.kind === 'hurdleLogNormal' ? 1 - Math.max(0, Math.min(1, d.pDry)) : null; };
      r.F1 = pw(st1); r.F1n = pw(st1n); r.F0 = pw(st0);
      if (st1?.flags?.includes('learnedPrecip')) counts.f1Flag.learnedPrecip += 1; else counts.f1Flag.k2 += 1;
      const v = stepAt.get(V)?.values ?? {};
      const mu = v.precip, sd = v.precip_sd, se = v.precip_sd_ens;
      if (mu != null && Number.isFinite(mu)) {
        counts.f2.mu += 1;
        const m = Math.max(0, mu);
        const pOf = (sig) => (sig > 1e-9 ? 1 - cdfOf({ kind: 'censoredNormal', mu: m, sigma: sig, lo: 0, hi: 1e6 }, WET - 1e-9) : (m >= WET ? 1 : 0));
        const sDiv = sd != null && Number.isFinite(sd) ? Math.max(0, sd) : 0;
        const sEns = se != null && Number.isFinite(se) ? Math.max(0, se) : null;
        const sAll = Math.sqrt(sDiv * sDiv + (sEns ?? 0) ** 2);
        if (sEns != null) counts.f2.sigEns += 1; else counts.f2.sigDivOnly += 1;
        if (!(sAll > 1e-9)) counts.f2.sigZero += 1;
        r.F2 = pOf(sAll); r.F2d = pOf(sDiv); r.F3 = m >= WET ? 1 : 0;
        r.mu = m;
      }
      const doy = Math.floor((V - Date.UTC(new Date(V).getUTCFullYear(), 0, 0)) / DAY);
      const cs = clima.sample(row.lat, row.lon, doy, row.elevM);
      if (cs && Number.isFinite(cs.wetProb)) { const pd = Math.min(0.95, Math.max(0.02, cs.wetProb)); r.CL = 1 - Math.pow(1 - pd, 1 / WET_HOURS_PER_WET_DAY); }
      r.done = true; counts.joined += 1;
    }
  }
  say(`${s.slotAt} (Schema ${s.schema}): ${np} Punkte, verbunden bisher ${counts.joined}; F1 ${(timing.F1.ms / Math.max(1, timing.F1.n)).toFixed(1)} ms/Lauf`);
}

// ── per-cell cost of F1 per tier (sequential, one slot, 60 points) ──────────
const cost = {};
{
  const s = readArchiveSlot(slotPaths.filter((p) => p.includes('2026-10-01'))[0] ?? slotPaths[slotPaths.length - 1]);
  const floorMs = Math.floor(s.slotAtMs / H) * H;
  const spans = { t1: [0, 48], t2: [51, 120], t3: [126, 336] };
  for (const tier of ['t1', 't2', 't3']) {
    const ts = []; let steps = 0;
    for (const id of pointIds.slice(0, 60)) {
      const row = feat.byPoint[id], ser = archiveSeries(s, tier, id);
      if (!ser) continue;
      const window = { fromMs: floorMs + spans[tier][0] * H, toMs: floorMs + spans[tier][1] * H, stepH: 1 };
      const inp = inputFromArchive(s, row, { cube: { [tier]: ser }, station: null, nowcast: [], covering: [], obs: null, clima, learned: T6, learnedClima: losoClimaProduct(T5, row), nowMs: s.slotAtMs, window });
      const t0 = performance.now();
      const r = fuseCubePoint(inp, F1OPT);
      ts.push(performance.now() - t0);
      steps = r.steps.filter((x) => !x.interpolated).length;
    }
    ts.sort((a, b) => a - b);
    cost[tier] = { runs: ts.length, nativeSteps: steps, msMedian: ts[Math.floor(ts.length / 2)], msP90: ts[Math.floor(0.9 * (ts.length - 1))], msMean: ts.reduce((a, b) => a + b, 0) / ts.length };
  }
}
say(`Kosten je Zelle (F1, alle Größen, Motor unverändert): ${JSON.stringify(cost)}`);

// ── aggregation ──────────────────────────────────────────────────────────────
const CANDS = ['F1', 'F1n', 'F0', 'F2', 'F2d', 'F3', 'CL', 'flK', 'F8S', 'F8L', 'F8L0'];
const all = [...rows.values()].filter((r) => r.done);
const pOfC = (r, c) => (c === 'F8L0' ? (r.mem === 0 ? r.F8L : null) : r[c] ?? null);
// common sample: every candidate except F8L0/F8L present (F8L needs a neighbour B; reported on its own subset)
const core = all.filter((r) => ['F1', 'F1n', 'F0', 'F2', 'F2d', 'F3', 'CL', 'flK', 'F8S'].every((c) => r[c] != null));
say(`gemeinsame Stichprobe: ${core.length} von ${all.length} verbundenen Zeilen (${rows.size} Kartenzeilen)`);
const res = { counts, timing: Object.fromEntries(Object.entries(timing).map(([k, t]) => [k, { runs: t.n, msPerRun: t.n ? t.ms / t.n : null }])), cost, nRows: rows.size, nJoined: all.length, nCore: core.length, bins: {} };
for (const [bi, b] of BINS.entries()) {
  const sub = core.filter((r) => binOf(r.lead) === bi);
  const base = sub.reduce((a, r) => a + r.y, 0) / Math.max(1, sub.length);
  const out = { n: sub.length, wet: sub.reduce((a, r) => a + r.y, 0), baseRate: base, days: new Set(sub.map((r) => r.d)).size, cand: {}, pairs: {}, byCountry: {} };
  for (const c of CANDS) {
    const acc = new BrierAcc(); let dS = 0, nS = 0, dL = 0, nL = 0;
    for (const r of sub) {
      const p = pOfC(r, c); if (p == null) continue;
      acc.add(p, r.y);
      if (r.F8S != null) { dS += Math.abs(p - r.F8S); nS += 1; }
      if (r.F8L != null) { dL += Math.abs(p - r.F8L); nL += 1; }
    }
    const sm = acc.summary();
    if (!sm) continue;
    const brCL = sub.reduce((a, r) => a + (r.CL - r.y) ** 2, 0) / sub.length;
    out.cand[c] = { n: sm.n, brier: sm.brier, bssBase: sm.bss, bssClima: 1 - (sm.brier / brCL), meanP: sm.reliability.reduce((a, x) => a + (x.fc ?? 0) * x.n, 0) / sm.n, reliability: sm.reliability, absToF8S: nS ? dS / nS : null, absToF8L: nL ? dL / nL : null };
  }
  // significance: Brier of every candidate against F1 and against CL, day blocks (DM/HLN, moving-block bootstrap)
  for (const ref of ['F1', 'CL', 'F8S']) for (const c of CANDS) {
    if (c === ref) continue;
    const pa = new PairAcc();
    for (const r of sub) { const p = pOfC(r, c), q = pOfC(r, ref); if (p == null || q == null) continue; pa.add(r.d, (p - r.y) ** 2, (q - r.y) ** 2); }
    const s = pa.summary(); if (s) out.pairs[`${c}|${ref}`] = { n: s.n, days: s.days, skill: s.skill, p: s.dm.p, ci90: s.ci90 };
  }
  for (const cc of ['DE', 'AT', 'CH']) {
    const sc = sub.filter((r) => r.cc === cc), o = { n: sc.length, wet: sc.reduce((a, r) => a + r.y, 0) };
    for (const c of ['F1', 'F1n', 'F0', 'F2', 'F3', 'CL', 'F8S', 'F8L']) { const a = new BrierAcc(); for (const r of sc) { const p = pOfC(r, c); if (p != null) a.add(p, r.y); } const s = a.summary(); if (s) o[c] = { n: s.n, brier: s.brier }; }
    out.byCountry[cc] = o;
  }
  res.bins[b.id] = out;
}
// BH over all pair tests
{
  const keys = []; const ps = [];
  for (const [bid, o] of Object.entries(res.bins)) for (const [k, v] of Object.entries(o.pairs)) if (Number.isFinite(v.p)) { keys.push([bid, k]); ps.push(v.p); }
  const adj = benjaminiHochberg(ps);
  keys.forEach(([bid, k], i) => { res.bins[bid].pairs[k].pBH = adj[i]; });
}
// F1 = Fusion 8 without station and radar? (rows with mem = 0, lead ≥ 3 — the chain of mode L does not use the neighbour as member)
{
  const z = all.filter((r) => r.mem === 0 && r.F8L != null && r.F1 != null);
  const d = z.map((r) => Math.abs(r.F1 - r.F8L)).sort((a, b) => a - b);
  res.f1VsF8L0 = { n: z.length, max: d[d.length - 1] ?? null, p99: d[Math.floor(0.99 * (d.length - 1))] ?? null, median: d[Math.floor(d.length / 2)] ?? null, exactShare: z.length ? d.filter((x) => x < 1e-4).length / z.length : null };
  const zf = all.filter((r) => r.flK != null && r.F1 != null);
  const df = zf.map((r) => Math.abs(r.F1 - r.flK)).sort((a, b) => a - b);
  res.f1VsFlK = { n: zf.length, median: df[Math.floor(df.length / 2)] ?? null, p99: df[Math.floor(0.99 * (df.length - 1))] ?? null, max: df[df.length - 1] ?? null };
  const zn = all.filter((r) => r.F1n != null && r.F1 != null);
  const dn = zn.map((r) => Math.abs(r.F1 - r.F1n)).sort((a, b) => a - b);
  res.f1VsF1n = { n: zn.length, median: dn[Math.floor(dn.length / 2)] ?? null, p90: dn[Math.floor(0.9 * (dn.length - 1))] ?? null, p99: dn[Math.floor(0.99 * (dn.length - 1))] ?? null, max: dn[dn.length - 1] ?? null };
}
writeFileSync(join(OUT, 'np0-chance.json'), JSON.stringify(res, null, 1));
say(`geschrieben ${join(OUT, 'np0-chance.json')}`);
for (const [bid, o] of Object.entries(res.bins)) {
  say(`Bin ${bid}: n ${o.n}, nass ${o.wet} (${(100 * o.baseRate).toFixed(1)} %), ${o.days} Tage`);
  for (const [c, x] of Object.entries(o.cand)) say(`  ${c.padEnd(5)} Brier ${x.brier.toFixed(5)} BSS(Basis) ${x.bssBase.toFixed(3)} BSS(Klima) ${x.bssClima.toFixed(3)} p̄ ${x.meanP.toFixed(3)} |Δ F8S| ${x.absToF8S?.toFixed(3)} |Δ F8L| ${x.absToF8L?.toFixed(3)} n ${x.n}`);
}
say(`F1 gegen F8L (mem 0): ${JSON.stringify(res.f1VsF8L0)}; F1 gegen flK: ${JSON.stringify(res.f1VsFlK)}; F1 gegen F1n: ${JSON.stringify(res.f1VsF1n)}`);
say(`Zähler: ${JSON.stringify(counts)}`);
