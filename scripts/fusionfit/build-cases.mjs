/**
 * build-cases.mjs — the case builder of phase FL (FL-AP2; `audit/fusion-lernphase.md` §5, PAP 8).
 *
 * For every hindcast slot × tier × DACH point × native step it writes one row (`casesio.mjs`): the truth of the hour,
 * the cube planes of the nearest cell, the cube member after PAP 3–5 and its σ, the fused distribution of the current
 * engine (candidate „heutiger Cube", `fuseCubePoint` with its defaults), PAP 4/5 diagnostics, the per-source raw
 * values at model height (Form P), and the three block cells (PAP 3 fit). Files per (month, tier) under
 * `<root>\cases\v1\<YYYY-MM>\<tier>.cas.gz`, resumable: a finished file (sidecar present) is skipped unless `--force`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/fusionfit/build-cases.mjs
 *       [--from=2025-09-01] [--to=2026-09-21] [--tiers=t1,t2,t3] [--workers=4] [--root=…] [--features=…]
 *       [--limit-slots=N] [--force] [--out=<root>\cases\v1]
 *
 * As-of and leak guard (§5.2): a row is written only if validAt > asOf and every source run of the tier lies at or
 * before the slot's publish time; hour 0 of a day-0 block (validAt = asOf) is dropped and counted. Day-0 t1 slots run
 * the engine per 3-h block (nowMs = block start, effective lead 0–2 h, V-HC-20); t2/t3 of the same slot run once with
 * nowMs = slotAt. Nothing here reads the punktarchiv (E-F-23/28).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';

const H = 3_600_000;

// ─── main: enumerate, partition, orchestrate ─────────────────────────────────
async function main() {
  const { HINDCAST_ROOT, parseArgs, codeHash } = await import('../hindcast/lib/common.mjs');
  const flags = parseArgs(process.argv.slice(2));
  const root = typeof flags.root === 'string' ? flags.root : HINDCAST_ROOT;
  const out = typeof flags.out === 'string' ? flags.out : join(root, 'cases', 'v1');
  const features = typeof flags.features === 'string' ? flags.features : join(root, 'features', 'points.v1.json');
  const from = flags.from ? String(flags.from) : '0000-00-00', to = flags.to ? String(flags.to) : '9999-99-99';
  const tiers = flags.tiers ? String(flags.tiers).split(',') : ['t1', 't2', 't3'];
  const workers = Math.max(1, Number(flags.workers) || 4);
  const limitSlots = Number(flags['limit-slots']) || Infinity;
  const force = flags.force === true;
  if (!existsSync(features)) throw new Error(`Merkmalstabelle fehlt: ${features} (erst scripts/fusionfit/features.mjs)`);
  const index = JSON.parse(readFileSync(join(root, 'index-slots.json'), 'utf8'));
  const keys = Object.keys(index).filter((k) => { const d = k.slice(0, 10); return d >= from && d <= to; }).sort().slice(0, limitSlots);
  const byMonth = new Map();
  for (const k of keys) { const m = k.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m).push(k); }
  const tasks = [];
  for (const [month, slots] of byMonth) {
    const done = tiers.every((t) => existsSync(join(out, month, `${t}.cas.gz.meta.json`)));
    if (done && !force) continue;
    tasks.push({ month, slots });
  }
  // biggest months first, so the tail of the run is short
  tasks.sort((a, b) => b.slots.length - a.slots.length);
  const ch = codeHash();
  console.log(`[cases] ${keys.length} Slots in ${byMonth.size} Monaten, ${tasks.length} Monate zu bauen, ${workers} Worker, codeHash ${ch}`);
  mkdirSync(out, { recursive: true });
  const logPath = join(root, 'log', `build-cases-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const log = (o) => writeFileSync(logPath, `${JSON.stringify(o)}\n`, { flag: 'a' });
  let next = 0, failures = 0;
  const T0 = Date.now();
  const runWorker = () => new Promise((resolve) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { root, out, features, tiers, force, codeHash: ch }, execArgv: process.execArgv });
    const give = () => { if (next < tasks.length) w.postMessage(tasks[next++]); else w.postMessage(null); };
    w.on('message', (m) => {
      if (m.type === 'log') { console.log(`[cases] ${m.text}`); log(m); }
      else if (m.type === 'done') { console.log(`[cases] ${m.month} fertig: ${JSON.stringify(m.rows)} Zeilen, ${m.slots} Slots, ${Math.round(m.ms / 1000)} s · gesamt ${Math.round((Date.now() - T0) / 60000)} min`); log(m); give(); }
      else if (m.type === 'error') { failures += 1; console.error(`[cases] ${m.month}: ${m.error}`); log(m); give(); }
      else if (m.type === 'ready') give();
    });
    w.on('error', (e) => { failures += 1; console.error(`[cases] worker: ${e?.stack ?? e}`); resolve(); });
    w.on('exit', () => resolve());
  });
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, runWorker));
  console.log(`[cases] fertig: ${tasks.length} Monate, ${failures} Fehler, ${Math.round((Date.now() - T0) / 60000)} min · Log ${logPath}`);
  if (failures) process.exitCode = 1;
}

// ─── worker: one month at a time ────────────────────────────────────────────
async function worker() {
  const { readHindcastSlot } = await import('../hindcast/lib/slotio.mjs');
  const { fuseCubePoint } = await import('../../src/pointForecast/cubeSource.ts');
  const { ClimaField } = await import('../../src/ml/climaField.ts');
  const { openCasesWriter, newRow, CASE_INDEX, FL_FLAGS, FL_ROUTES, FL_VERTICAL_CASES, FL_TIERS, FL_CLIMA_BITS, FL_SOURCES, FL_SRC_VARS, CASES_SCHEMA } = await import('./lib/casesio.mjs');
  const { seriesFromSlotTier, inputFromSlot } = await import('./lib/slotAdapter.mjs');
  const { loadRecipes, planFromSlotTier, perSourceReader, srcMaskOf, recombine } = await import('./lib/perSource.mjs');
  const { truthReader } = await import('./lib/truthJoin.mjs');
  const { WC_MIRROR_SHA } = await import('../../src/fire/detail/worldCover.ts');
  const { root, out, features: featuresPath, tiers, force, codeHash } = workerData;

  const featBytes = readFileSync(featuresPath);
  const feat = JSON.parse(featBytes.toString('utf8'));
  const featuresHash = createHash('sha256').update(featBytes).digest('hex');
  const pointIds = Object.keys(feat.byPoint).filter((id) => ['DE', 'AT', 'CH', 'LI'].includes(feat.byPoint[id].country) && !feat.byPoint[id].flags.includes('noTerrain')).sort();
  const pointIdx = new Map(pointIds.map((id, i) => [id, i]));
  const clima = new ClimaField(JSON.parse(readFileSync(new URL('../../public/climaGrid.json', import.meta.url), 'utf8')));
  const recipes = loadRecipes(root);
  const truth = truthReader(root);
  const ENGINE_OPTS = Object.freeze({ hourly: false, tail: false });
  const engineVariant = { opts: ENGINE_OPTS, z0: 'worldcover', landCover: true, station: false, nowcast: false, obs: false };
  const FLAG_BIT = Object.fromEntries(FL_FLAGS.map((f, i) => [f, i]));
  const IX = CASE_INDEX;
  const say = (text) => parentPort.postMessage({ type: 'log', text });

  const setDist = (row, fv, prefix, kind) => {
    const d = fv?.dist;
    if (!d) return;
    if (kind === 'normal' && (d.kind === 'normal' || d.kind === 'censoredNormal')) { row[IX[`${prefix}_mu`]] = d.mu; row[IX[`${prefix}_sig`]] = d.sigma; }
    else if (kind === 'rice' && d.kind === 'rice') { row[IX.f_ws_nu] = d.nu; row[IX.f_ws_sig] = d.sigma; }
    else if (kind === 'hurdle' && d.kind === 'hurdleLogNormal') { row[IX.f_pr_pDry] = d.pDry; row[IX.f_pr_mu] = d.mu; row[IX.f_pr_sig] = d.sigma; }
    else if (kind === 'hurdle' && d.kind === 'logCensored') { row[IX.f_pr_mu] = d.mu; row[IX.f_pr_sig] = d.sigma; }
  };

  const processSlot = async (slot, writers, counters) => {
    const slotAtMs = slot.slotAtMs;
    const present = tiers.filter((t) => slot.cube?.[t]);
    if (!present.length) return;
    // per-source plans and readers (once per slot), axis check against the slot
    const readers = {};
    for (const t of present) {
      const plan = planFromSlotTier(slot, t);
      if (!plan) { counters.noPlan[t] = (counters.noPlan[t] ?? 0) + 1; continue; }
      const c = slot.cube[t];
      if (plan.validAtMs.length !== c.validAtMs.length || plan.validAtMs.some((v, i) => v !== c.validAtMs[i])) { counters.axisMismatch[t] = (counters.axisMismatch[t] ?? 0) + 1; continue; }
      // leak guard (b): every source run at or before the publish time
      if (c.route !== 'day0' && (c.sources ?? []).some((s) => s.offsetH != null && s.offsetH < 0)) { counters.leakInit[t] = (counters.leakInit[t] ?? 0) + 1; continue; }
      readers[t] = perSourceReader(plan, recipes);
    }
    const day0T1 = slot.cube.t1?.route === 'day0';
    const cellVals = new Map();   // `${t}|${it}|${cellKey}` → per-source record (points share cells)
    const srcAt = (t, it, cellKey) => {
      const r = readers[t]; if (!r) return null;
      const key = `${t}|${it}|${cellKey}`;
      if (!cellVals.has(key)) cellVals.set(key, r.at(it, cellKey));
      return cellVals.get(key);
    };
    for (const id of pointIds) {
      const row0 = feat.byPoint[id];
      const series = {};
      for (const t of present) { const s = seriesFromSlotTier(slot, t, id); if (s) series[t] = s; }
      if (!Object.keys(series).length) continue;
      // engine calls: [{ nowMs, window, cube, tiers }]
      const calls = [];
      if (day0T1 && series.t1) {
        for (let b = 0; b < 8; b++) { const t0 = slotAtMs + b * 3 * H; calls.push({ nowMs: t0, window: { fromMs: t0, toMs: t0 + 2 * H, stepH: 1 }, cube: { t1: series.t1 } }); }
        const rest = {}; for (const t of ['t2', 't3']) if (series[t]) rest[t] = series[t];
        if (Object.keys(rest).length) calls.push({ nowMs: slotAtMs, window: { fromMs: slotAtMs, toMs: slotAtMs + 336 * H, stepH: 1 }, cube: rest });
      } else calls.push({ nowMs: slotAtMs, window: { fromMs: slotAtMs, toMs: slotAtMs + 336 * H, stepH: 1 }, cube: series });
      for (const call of calls) {
        let res;
        try { res = fuseCubePoint(inputFromSlot(slot, row0, call.cube, clima, { nowMs: call.nowMs, window: call.window }), ENGINE_OPTS); }
        catch (e) { counters.engineError += 1; if (counters.engineError <= 3) say(`${slot.slotAt} ${id}: Motor ${e?.message ?? e}`); continue; }
        for (const st of res.steps) {
          if (st.interpolated || st.tier === 'station' || st.tier === 'clima') continue;
          const t = st.tier;
          if (!series[t] || !writers[t]) continue;
          const validAtMs = st.validAtMs;
          if (validAtMs <= call.nowMs) { counters.hour0 += 1; continue; }
          const obs = truth.at(id, validAtMs);
          if (!obs) { counters.noTruth += 1; continue; }
          const bp = slot.cube[t].byPoint[id];
          const it = slot.cube[t].validAtMs.indexOf(validAtMs);
          if (it < 0) { counters.axisMismatch[t] = (counters.axisMismatch[t] ?? 0) + 1; continue; }
          const row = newRow();
          row[IX.slotAtH] = Math.round(call.nowMs / H); row[IX.validAtH] = Math.round(validAtMs / H);
          row[IX.leadH] = Math.round((validAtMs - call.nowMs) / H); row[IX.engineLeadH] = st.leadH;
          row[IX.pointIdx] = pointIdx.get(id); row[IX.tier] = FL_TIERS[t]; row[IX.route] = FL_ROUTES[slot.cube[t].route] ?? 0;
          row[IX.network] = obs.network; row[IX.truthFlags] = obs.flags;
          let flags = 0;
          for (const f of st.flags) if (FLAG_BIT[f] != null) flags |= 1 << FLAG_BIT[f];
          if (st.grid?.truncated) flags |= 1 << FLAG_BIT.gridTruncated;
          for (const f of st.terrain?.flags ?? []) if (FLAG_BIT[f] != null) flags |= 1 << FLAG_BIT[f];
          for (const f of st.vertical?.flags ?? []) if (FLAG_BIT[f] != null) flags |= 1 << FLAG_BIT[f];
          if (slot.cube[t].route === 'day0') flags |= 1 << FLAG_BIT.day0Route;
          row[IX.flags] = flags >>> 0;
          row[IX.verticalCase] = st.vertical ? (FL_VERTICAL_CASES[st.vertical.case] ?? 0) : 0;
          row[IX.srcCount] = st.cell.srcCount ?? NaN; row[IX.ensCount] = st.cell.ensCount ?? NaN;
          row[IX.gridN] = st.grid?.n ?? NaN; row[IX.basin] = st.terrain?.basin == null ? NaN : st.terrain.basin ? 1 : 0;
          row[IX.obs_t] = obs.t; row[IX.obs_td] = obs.td; row[IX.obs_rh] = obs.rh; row[IX.obs_ff] = obs.ff; row[IX.obs_dd] = obs.dd; row[IX.obs_fx] = obs.fx; row[IX.obs_rr] = obs.rr; row[IX.obs_n] = obs.n; row[IX.obs_p] = obs.p;
          const cv = st.cell;
          for (const k of ['t2m', 'td2m', 'u10', 'v10', 'gust', 'precip', 'clct', 'clcl', 'clcm', 'clch', 'ps', 't925', 't850', 't700', 'rh925', 'rh850', 'rh700', 'hModEff', 'snowlmt',
            't2m_sd', 'td2m_sd', 'u10_sd', 'v10_sd', 'gust_sd', 'precip_sd', 'clct_sd', 'ps_sd', 't2m_sd_ens', 'u10_sd_ens', 'v10_sd_ens', 'precip_sd_ens', 't2m_q10', 't2m_q90', 'precip_q10', 'precip_q90']) {
            const ci = IX[`c_${k}`]; if (ci != null && cv[k] != null) row[ci] = cv[k];
          }
          const m = st.samples?.find((s) => typeof s.source === 'string' && s.source.startsWith('cube-')) ?? null;
          if (m) { row[IX.m_t] = m.temperature ?? NaN; row[IX.m_td] = m.dewPoint ?? NaN; row[IX.m_u] = m.u ?? NaN; row[IX.m_v] = m.v ?? NaN; row[IX.m_gust] = m.gust ?? NaN; row[IX.m_precip] = m.precipitation ?? NaN; row[IX.m_clct] = m.cloudTotal ?? NaN; row[IX.m_ps] = m.pressure ?? NaN; row[IX.m_hModEff] = m.sourceElevation ?? NaN; }
          const u = st.uncertainty ?? {};
          const um = { t: 'temperature', td: 'dewpoint', wind: 'wind', gust: 'gust', clouds: 'clouds' };
          for (const [k, v] of Object.entries(um)) { const x = u[v]; if (x) { row[IX[`ms_${k}`]] = x.sigmaMember; row[IX[`mss_${k}`]] = x.parts?.sys ?? NaN; } }
          if (st.vertical) { row[IX.v_dh] = st.vertical.dhM; row[IX.v_delta] = st.vertical.deltaK; row[IX.v_gamma] = st.vertical.gammaPerM * 1000; }
          if (st.terrain) { row[IX.t_fRad] = st.terrain.fRad ?? NaN; row[IX.t_gCap] = st.terrain.gCap ?? NaN; row[IX.t_gUhi] = st.terrain.gUhi ?? NaN; row[IX.t_fSaison] = st.terrain.fSaison; row[IX.t_foehn] = st.terrain.foehnFactor; row[IX.t_windFactor] = st.terrain.windFactor ?? NaN; }
          const f = st.fused;
          if (!f) counters.noFused += 1;
          if (f) {
            setDist(row, f.temperature, 'f_t', 'normal'); setDist(row, f.dewPoint, 'f_td', 'normal'); setDist(row, f.windSpeed, 'f_ws', 'rice');
            setDist(row, f.gust, 'f_gust', 'normal'); setDist(row, f.clouds, 'f_cl', 'normal'); setDist(row, f.precipitation, 'f_pr', 'hurdle');
            row[IX.f_pSnow] = f.pSnow ?? NaN; row[IX.f_wdir] = f.windDirectionDeg ?? NaN;
            let co = 0; for (const [k, bit] of Object.entries(FL_CLIMA_BITS)) if (f[k]?.climatologyOnly) co |= bit;
            row[IX.f_climaOnly] = co;
          }
          // per-source raw values (Form P) at the nearest cell, mask of the sources that carried the step
          const nearKey = `${bp.cell.iy}_${bp.cell.ix}`;
          const rec = srcAt(t, it, nearKey);
          if (rec) {
            row[IX.srcMask] = srcMaskOf(rec);
            for (let k = 0; k < FL_SOURCES.length; k++) { const sv = rec[FL_SOURCES[k]]; if (!sv) continue; for (const v of FL_SRC_VARS) { const ci = IX[`s${k}_${v}`]; if (ci != null && sv[v] != null) row[ci] = sv[v]; } }
            // V-FF-1 (before quantisation): the equal-weight mean of the per-source values must be the slot plane within
            // half a quantum — the same criterion as the hindcast's own V3 (b). Counted per tier into the sidecar.
            for (const v of ['t2m', 'precip', 'u10', 'clct']) {
              const plane = cv[v]; if (plane == null) continue;
              const mean = recombine(rec, v);
              if (mean == null) { counters.recombineNoSource += 1; continue; }
              const half = v === 'clct' ? 0.05 : 0.005;
              counters.recombineN += 1;
              // Δ/2 plus a float tolerance for exact ties (the plane's double mean and this one differ by ≤ 1e-12 at most)
              if (Math.abs(mean - plane) > half + 1e-4) { counters.recombineBad += 1; if (counters.recombineBad <= 3) say(`V-FF-1 ${slot.slotAt} ${t} ${id} ${v}: Rekombination ${mean} ≠ Ebene ${plane}`); }
            }
          } else { row[IX.srcMask] = 0; counters.noSourceRecord += 1; }
          // block cells (the three that are not the nearest), from the slot's own block planes
          let j = 0;
          for (const b of bp.block ?? []) {
            if (b.planes === 'nearest' || j >= 3) continue;
            const nb = series[t].neighbours.find((x) => x.iy === b.iy && x.ix === b.ix);
            const v = nb?.values[it];
            if (v) { row[IX[`b${j}_t2m`]] = v.t2m ?? NaN; row[IX[`b${j}_u10`]] = v.u10 ?? NaN; row[IX[`b${j}_v10`]] = v.v10 ?? NaN; row[IX[`b${j}_hModEff`]] = v.hModEff ?? nb.hModEffM ?? NaN; }
            j += 1;
          }
          await writers[t].push(row);
          counters.rows[t] = (counters.rows[t] ?? 0) + 1;
        }
      }
    }
  };

  parentPort.on('message', async (task) => {
    if (task === null) { parentPort.close(); return; }
    const { month, slots } = task;
    const T0 = Date.now();
    const writers = {};
    const counters = { rows: {}, hour0: 0, noTruth: 0, engineError: 0, noFused: 0, noPlan: {}, axisMismatch: {}, leakInit: {}, recombineN: 0, recombineBad: 0, recombineNoSource: 0, noSourceRecord: 0, slots: 0, slotErrors: 0 };
    try {
      for (const t of tiers) {
        const path = join(out, month, `${t}.cas.gz`);
        if (existsSync(`${path}.meta.json`) && !force) continue;
        writers[t] = await openCasesWriter(path, { tier: t, month, codeHash, engineVariant, featuresHash, featuresBuiltAt: feat.builtAt, cellsCommit: feat.cellsCommit, wcMirrorSha: WC_MIRROR_SHA, points: pointIds, builtAt: new Date().toISOString() });
      }
      if (!Object.keys(writers).length) { parentPort.postMessage({ type: 'done', month, rows: {}, slots: 0, ms: 0, skipped: true }); return; }
      for (const key of slots) {
        let slot;
        try { slot = readHindcastSlot(join(root, 'slots', key.replace('/', '\\'))); } catch (e) { counters.slotErrors += 1; say(`${key}: ${e?.message ?? e}`); continue; }
        await processSlot(slot, writers, counters);
        counters.slots += 1;
        if (counters.slots % 25 === 0) say(`${month}: ${counters.slots}/${slots.length} Slots, Zeilen ${JSON.stringify(counters.rows)}, ${Math.round((Date.now() - T0) / 1000)} s`);
      }
      const metas = {};
      for (const [t, w] of Object.entries(writers)) metas[t] = await w.close({ month, slots: slots.length, counters: { ...counters, rows: counters.rows[t] ?? 0 }, truth: truth.stats });
      parentPort.postMessage({ type: 'done', month, rows: counters.rows, slots: counters.slots, ms: Date.now() - T0, counters, metas: Object.fromEntries(Object.entries(metas).map(([t, m]) => [t, { rows: m.rows, sha256: m.sha256 }])) });
    } catch (e) {
      parentPort.postMessage({ type: 'error', month, error: e?.stack ?? String(e) });
    }
  });
  parentPort.postMessage({ type: 'ready' });
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else worker().catch((e) => { parentPort?.postMessage({ type: 'error', month: '?', error: e?.stack ?? String(e) }); process.exit(1); });
