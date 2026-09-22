/**
 * shadow.mjs — AP10a acceptance V4: the hindcast against the REAL cube (buscosun-archiv slots 14.09.2026 →, nearest
 * cell, all planes). The hindcast tier is rebuilt with EXACTLY the source runs the archive slot records
 * (cube[t].sources[].runAt), so the only differences left are the source SET (claef, the EPS, aicon are not in any
 * free archive) and the external stores' own coding/regridding.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/shadow.mjs [--archive=C:/dev/buscosun-archiv]
 *
 * Output shadow/<date>.json and shadow/latest.json:
 *   exact[]      planes whose sources are the same on both sides — share of (point, step) pairs with |Δ| ≤ 1 quantStep
 *   compared[]   the fused means and σ_div — MAE / bias / n per plane and tier, with the source-set difference named
 *   standIn      (a) IFS ENS control (dynamical) vs IFS 0.25° (Open-Meteo data_run) on the same init
 *   dynRoute     (b) the dyn-route pseudo-cube (AIFS + ENS control [+ ICON-EU]) vs the archive cube
 *   day0         (c) the stitched day-0 series vs the full run of the same hour
 *   negativeControl  the pressure temperatures compared against the NEXT point's hindcast cell must fall below 95 %
 *                    even with the storage bound (a one-hour shift is no control: 850 hPa moves < 0.07 K/h)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CUBE_PLANES, planeIndex, MISSING, dequantize, TIER_BY_ID } from '../../src/point/cubeFormat.ts';
import { parseSlot as parseArchiveSlot } from '../punktarchiv/lib/punktarchiv.mjs';
import { HINDCAST_ROOT, H, parseArgs } from './lib/common.mjs';
import { planFromRuns, planRun, buildTier, IMPL } from './build-slots.mjs';
import { loadExtract, readHcv } from './lib/cellsio.mjs';
import { omRun, omSeries, dynRun, OM_VAR, DYN_VAR, dewPointFromRh } from './lib/store.mjs';

const flags = parseArgs(process.argv.slice(2));
const ARCH = flags.archive ?? 'C:/dev/buscosun-archiv';
const EXACT = ['t925', 't850', 't700', 'rh925', 'rh850', 'rh700', 'hModEff'];
const EXACT_T3 = ['t2m_sd_ens', 'precip_sd_ens', 'u10_sd_ens', 'v10_sd_ens'];
const MEANS = CUBE_PLANES.filter((p) => p.kind === 'mean' && p.group === 'target').map((p) => p.id);
const SDS = CUBE_PLANES.filter((p) => p.kind === 'sd').map((p) => p.id);
/**
 * The producer changed the hModEff rule (per-step contributing sources incl. the derived ECMWF heights) and the ENS
 * statistics (ensembleStats.mjs, ecmwfEns.mjs) in commit 717cc12, 2026-09-16 05:40 UTC (E-E-5, V-PD-57). Cube runs
 * before that are built with the old rules — hModEff and σ_ens of those runs are not comparable with the hindcast,
 * which implements the current producer.
 */
const RULE_CHANGE_MS = Date.parse('2026-09-16T05:40:00Z');
const ruleSensitive = (pid) => pid === 'hModEff' || pid.endsWith('_sd_ens');

/**
 * Open-Meteo stores each variable as int16 × scale_factor (om header, read from the cache): pressure-level
 * temperatures at 8.29 (850), 9.14 (925), 6.57 (700) per K, RH at 1 per %, t2m at 20 per K (measured 19.09.). A
 * mean of values each within ±½·(1/scale) of the source value is itself within that bound, the cube quantises once
 * more on both sides: bound = ½/scale + quantStep. `null` = no Open-Meteo storage involved (hModEff from the pinned
 * static product, σ_ens from dynamical floats) ⇒ bound = 1 quantStep, the literal criterion.
 */
const OM_OF = { t925: 'temperature_925hPa', t850: 'temperature_850hPa', t700: 'temperature_700hPa', rh925: 'relative_humidity_925hPa', rh850: 'relative_humidity_850hPa', rh700: 'relative_humidity_700hPa' };
const scaleMemo = {};
function omHalfStep(pid) {
  const v = OM_OF[pid]; if (!v) return null;
  if (pid in scaleMemo) return scaleMemo[pid];
  let worst = null;
  for (const m of ['dwd_icon_d2', 'dwd_icon_eu', 'ecmwf_ifs025', 'ecmwf_aifs025_single']) {
    const dir = join(HINDCAST_ROOT, 'cache', m, v, 'run');
    if (!existsSync(dir)) continue;
    const f = readdirSync(dir).find((x) => x.endsWith('.hcv.gz'));
    if (!f) continue;
    const h = readHcv(join(dir, f)).header;
    const hs = 0.5 / h.scale;
    if (worst == null || hs > worst) worst = hs;
  }
  return (scaleMemo[pid] = worst);
}
function boundSteps(pid) {
  const pl = CUBE_PLANES[planeIndex(pid)];
  const hs = omHalfStep(pid);
  return hs == null ? 1 : Math.floor((hs + pl.scale) / pl.scale + 1e-9);
}

function archiveSlots() {
  const out = [];
  for (const d of readdirSync(ARCH).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) for (const f of readdirSync(join(ARCH, d)).filter((x) => /^\d{4}\.json\.gz$/.test(x))) out.push({ kind: 'archive', file: join(ARCH, d, f) });
  const cdn = join(HINDCAST_ROOT, 'shadow', 'cdn');
  if (existsSync(cdn)) for (const f of readdirSync(cdn).filter((x) => /^t\d-\d{10}\.json\.gz$/.test(x)).sort()) out.push({ kind: 'cdn', file: join(cdn, f) });
  return out;
}
function loadUnit(u) {
  if (u.kind === 'archive') { const s = parseArchiveSlot(readFileSync(u.file)); return { label: `archiv ${s.slotAt}`, schema: s.schema, cube: s.cube }; }
  const d = JSON.parse(gunzipSync(readFileSync(u.file)).toString('utf8'));
  return { label: `cdn ${u.file.slice(-22, -8)}`, schema: 'cdn', cube: d.cube };
}
const pctl = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function compareTier(arch, hc, planes, shift = 0, swap = null, stepOk = null) {
  // arch/hc: byPoint maps; returns per plane { n, within1, withinBound, diffs (steps), mae, bias }
  const out = {};
  for (const pid of planes) {
    const pl = CUBE_PLANES[planeIndex(pid)];
    const bound = boundSteps(pid);
    let n = 0, w1 = 0, wB = 0, sAbs = 0, sBias = 0; const steps = [];
    for (const [id, a] of Object.entries(arch)) {
      const h = hc[swap ? swap.get(id) : id]; if (!a || !h) continue;
      const ac = a.planes?.[pid]; const hcP = h.planes?.[pid];
      if (!ac || !hcP) continue;
      for (let it = 0; it < ac.length; it++) {
        const j = it + shift; if (j < 0 || j >= hcP.length) continue;
        if (stepOk && !stepOk(pid, it)) continue;
        if (ac[it] === MISSING || hcP[j] === MISSING || ac[it] == null) continue;
        n++;
        const d = hcP[j] - ac[it];
        steps.push(Math.abs(d));
        if (Math.abs(d) <= 1) w1++;
        if (Math.abs(d) <= bound) wB++;
        const phys = (dequantize(hcP[j], pl) ?? 0) - (dequantize(ac[it], pl) ?? 0);
        sAbs += Math.abs(phys); sBias += phys;
      }
    }
    out[pid] = { n, within1: w1, share: n ? w1 / n : null, withinBound: wB, boundSteps: bound, shareBound: n ? wB / n : null, mae: n ? sAbs / n : null, bias: n ? sBias / n : null, p50Steps: pctl(steps, 0.5), p95Steps: pctl(steps, 0.95), unit: pl.unit, step: pl.scale };
  }
  return out;
}

async function main() {
  const res = { at: new Date().toISOString(), archive: ARCH, slots: [], exact: [], compared: [], standIn: null, dynRoute: [], day0: null, negativeControl: null };
  const exactAgg = {}; const cmpAgg = {}; const negAgg = { n: 0, w1: 0, wB: 0 }; const ruleExcluded = {};
  for (const u of archiveSlots()) {
    const slot = loadUnit(u);
    const srec = { file: u.file, label: slot.label, schema: slot.schema, tiers: {} };
    for (const [t, c] of Object.entries(slot.cube ?? {})) {
      if (!c?.byPoint) continue;
      const publishMs = Date.parse(c.runAt ?? `${c.run.slice(0, 4)}-${c.run.slice(4, 6)}-${c.run.slice(6, 8)}T${c.run.slice(8, 10)}:00:00Z`);
      const runs = Object.fromEntries((c.sources ?? []).map((s) => [s.id, Date.parse(s.runAt)]));
      const plan = planFromRuns(t, publishMs, runs, 'run');
      if (!plan) { srec.tiers[t] = { skipped: 'keine Hindcast-Quelle für diese Läufe im Cache' }; continue; }
      const built = buildTier(t, plan, []);
      const served = plan.sources.map((s) => s.id).concat(plan.ens ? ['ifs_ens'] : []);
      const archSources = (c.sources ?? []).map((s) => s.id);
      const missing = archSources.filter((id) => !served.includes(id));
      // the cube's own pressure sources must be served by the hindcast for the pressure planes to be "exact"
      const pSrc = c.provenance?.pressure?.sources ?? [];
      const pMissing = pSrc.filter((id) => !served.includes(id));
      const preRule = publishMs < RULE_CHANGE_MS;
      srec.tiers[t] = { run: c.run, archiveSources: archSources, hindcastSources: served, notInHindcast: missing, pressureSources: pSrc, pressureNotServed: pMissing, preRuleChange: preRule };
      const planes = [...EXACT, ...(t === 't3' ? EXACT_T3 : [])].filter((pid) => {
        if (preRule && ruleSensitive(pid)) { (ruleExcluded[`${t}|${pid}`] ??= []).push(c.run); return false; }
        if (/^(t|rh)\d{3}$/.test(pid) && pMissing.length) { (ruleExcluded[`${t}|${pid}`] ??= []).push(`${c.run} (Druckquelle ${pMissing.join('+')} fehlt)`); return false; }
        return true;
      });
      // σ_ens is exact only at the hours where the CUBE took it from the IFS ENS (ensemble.byHour; t2m at 144/168 h
      // comes from ICON-EPS global, which no free archive holds) and only for the variables that source carried
      const byHour = c.provenance?.ensemble?.byHour ?? {};
      const ensVars = new Set((c.provenance?.ensemble?.sources ?? []).filter((x) => x.id === 'ifs_ens').flatMap((x) => x.vars ?? []));
      const leads = c.leadHours ?? TIER_BY_ID[t].leadHours;
      const stepOk = (pid, it) => !pid.endsWith('_sd_ens') || (byHour[leads[it]] === 'ifs_ens' && ensVars.has(pid.replace('_sd_ens', '')));
      const ex = compareTier(c.byPoint, built.byPoint, planes, 0, null, stepOk);
      const ids = Object.keys(c.byPoint).filter((id) => c.byPoint[id] && built.byPoint[id]);
      const swap = new Map(ids.map((id, i) => [id, ids[(i + 1) % ids.length]]));
      const neg = compareTier(c.byPoint, built.byPoint, EXACT.slice(0, 3).filter((pid) => planes.includes(pid)), 0, swap);
      for (const v of Object.values(neg)) { negAgg.n += v.n; negAgg.w1 += v.within1; negAgg.wB += v.withinBound; }
      for (const [pid, v] of Object.entries(ex)) {
        const k = `${t}|${pid}`; const a = (exactAgg[k] ??= { tier: t, plane: pid, n: 0, within1: 0, withinBound: 0, boundSteps: v.boundSteps, p95: [], maeSum: 0, runs: [] });
        a.n += v.n; a.within1 += v.within1; a.withinBound += v.withinBound; if (v.p95Steps != null) a.p95.push(v.p95Steps); a.maeSum += (v.mae ?? 0) * v.n; if (v.n) a.runs.push(`${slot.schema === 'cdn' ? 'cdn' : 'arch'}:${c.run}`);
      }
      const cm = compareTier(c.byPoint, built.byPoint, [...MEANS, ...SDS]);
      for (const [pid, v] of Object.entries(cm)) {
        const k = `${t}|${pid}`; const a = (cmpAgg[k] ??= { tier: t, plane: pid, n: 0, sAbs: 0, sBias: 0, notInHindcast: new Set() });
        a.n += v.n; a.sAbs += (v.mae ?? 0) * v.n; a.sBias += (v.bias ?? 0) * v.n; for (const m of missing) a.notInHindcast.add(m);
      }
      // (b) the dyn-route pseudo-cube for the same publish run
      if (t !== 't1') {
        const dp = planRun(t, publishMs, 'dyn');
        if (dp) {
          const db = buildTier(t, dp, []);
          const dc = compareTier(c.byPoint, db.byPoint, MEANS);
          res.dynRoute.push({ slot: slot.label, tier: t, run: c.run, dynSources: dp.sources.map((s) => `${s.id}@${new Date(s.initMs).toISOString().slice(0, 13)}+${s.offsetH}`),
            planes: Object.fromEntries(Object.entries(dc).filter(([, v]) => v.n).map(([k, v]) => [k, { n: v.n, mae: +v.mae.toFixed(3), bias: +v.bias.toFixed(3), unit: v.unit }])) });
        }
      }
      console.log(`[shadow] ${slot.label} ${t} run ${c.run}${preRule ? ' (vor 717cc12)' : ''}: hindcast ${served.join('+')} · fehlt ${missing.join('+') || '—'} · exakt ${Object.entries(ex).filter(([, v]) => v.n).map(([k, v]) => `${k} ${(100 * v.share).toFixed(0)}/${(100 * v.shareBound).toFixed(0)}%/${v.n}`).join(' ')}`);
    }
    res.slots.push(srec);
  }
  const REASON = {
    storage: (a) => `Open-Meteo speichert ${a.plane.startsWith('rh') ? 'Feuchte in 1-%-Schritten (700 hPa 1,11 %)' : 'Temperatur auf Druckflächen mit scale_factor 9,14/8,29/6,57 je K (0,11/0,12/0,15 K)'} — Schranke ½·Speicherschritt + 1 Cube-Schritt = ${a.boundSteps} Schritte`,
    hModEff: 'die abgeleiteten ECMWF-Höhen (derived-gh-sp) wechseln je Lauf um 1–3 m (Archiv hmodel.byPoint), der Hindcast pinnt EIN hmodel-Produkt (index-Commit beedc23, 18.09.)',
    sdEns: 'dynamical speichert die Member als binär gerundete Gleitkommazahlen; der Producer liest die GRIB-Werte von ECMWF Open Data',
  };
  res.exact = Object.values(exactAgg).filter((a) => a.n).map((a) => {
    const share = a.within1 / a.n, shareBound = a.withinBound / a.n;
    const reason = share >= 0.95 ? null : OM_OF[a.plane] ? REASON.storage(a) : a.plane === 'hModEff' ? REASON.hModEff : REASON.sdEns;
    return { tier: a.tier, plane: a.plane, n: a.n, share, boundSteps: a.boundSteps, shareBound, mae: a.maeSum / a.n, p95StepsMax: Math.max(...a.p95), runs: a.runs, reason };
  });
  res.excluded = Object.entries(ruleExcluded).map(([k, runs]) => ({ tier: k.split('|')[0], plane: k.split('|')[1], runs, why: 'Lauf vor dem Producer-Commit 717cc12 (16.09. 05:40 UTC: hModEff je tragender Quelle, E-E-5/V-PD-57; ENS-Statistik neu) bzw. Druckquelle nicht im Hindcast' }));
  res.compared = Object.values(cmpAgg).filter((a) => a.n).map((a) => ({ tier: a.tier, plane: a.plane, n: a.n, mae: a.sAbs / a.n, bias: a.sBias / a.n, notInHindcast: [...a.notInHindcast] }));
  res.negativeControl = { what: 't925/t850/t700 gegen die Hindcast-Zelle des nächsten Punkts der Liste', n: negAgg.n, share: negAgg.n ? negAgg.w1 / negAgg.n : null, shareBound: negAgg.n ? negAgg.wB / negAgg.n : null };

  // (a) stand-in: IFS ENS control vs IFS 0.25° (Open-Meteo) on the same 00z init
  {
    const ex = loadExtract('ecmwf025');
    const vars = [['t2m', OM_VAR.t2m, DYN_VAR.t2m, 1], ['u10', OM_VAR.u10, DYN_VAR.u10, 1], ['v10', OM_VAR.v10, DYN_VAR.v10, 1], ['t850', OM_VAR.t850, DYN_VAR.t850, 1], ['t925', OM_VAR.t925, DYN_VAR.t925, 1], ['clct', OM_VAR.clct, DYN_VAR.clct, 1], ['gust', OM_VAR.gust, DYN_VAR.gust, 1]];
    const bands = [[0, 48], [51, 120], [126, 240], [246, 360]];
    const agg = {};
    let inits = 0;
    const dir = join(HINDCAST_ROOT, 'cache', 'dyn-ifs-ens', DYN_VAR.t2m);
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      const init = Date.parse(`${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}T${f.slice(8, 10)}:00:00Z`);
      const om = omRun('ecmwf_ifs025', init), dy = dynRun('ifs-ens', init);
      if (!om.has(OM_VAR.t2m)) continue;
      inits++;
      for (const [v, on, dn] of vars) {
        for (const t of om.steps(on)) {
          const lead = (t - init) / H; const b = bands.findIndex(([a, z]) => lead >= a && lead <= z); if (b < 0) continue;
          for (let k = 0; k < ex.n; k += 7) {
            const x = om.raw(on, k, t), y = dy.raw(dn, k, t, 0);
            if (x == null || y == null) continue;
            const a = (agg[`${v}|${b}`] ??= { v, band: bands[b].join('–'), n: 0, sAbs: 0, sBias: 0 });
            a.n++; a.sAbs += Math.abs(y - x); a.sBias += y - x;
          }
        }
      }
    }
    res.standIn = { what: 'IFS-ENS-Kontrolllauf (dynamical, Member 0) − IFS 0,25° (Open-Meteo data_run), gleicher 00z-Lauf, jede 7. ECMWF-Zelle', inits,
      rows: Object.values(agg).map((a) => ({ var: a.v, leadBandH: a.band, n: a.n, mae: +(a.sAbs / a.n).toFixed(3), bias: +(a.sBias / a.n).toFixed(3) })) };
  }
  // (c) day-0 stitched vs the full run
  {
    const models = [['dwd_icon_d2', 'icon_d2', 3], ['dwd_icon_eu', 'icon_eu', 3], ['ecmwf_ifs025', 'ecmwf025', 6], ['ecmwf_aifs025_single', 'ecmwf025', 6], ['meteoswiss_icon_ch1', 'icon_ch1_om', 3]];
    const rows = [];
    for (const [m, grid, cad] of models) {
      const ser = omSeries(m); if (!ser.has(OM_VAR.t2m)) continue;
      const ex = loadExtract(grid);
      for (const v of [OM_VAR.t2m, OM_VAR.precip, OM_VAR.u10]) {
        const match = {}; let hours = 0;
        const runDir = join(HINDCAST_ROOT, 'cache', m, OM_VAR.t2m, 'run');
        const inits = existsSync(runDir) ? readdirSync(runDir).map((f) => Date.parse(`${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}T${f.slice(8, 10)}:00:00Z`)) : [];
        const set = new Set(inits);
        const from = Date.parse('2026-09-14T00:00:00Z'), to = Date.parse('2026-09-18T21:00:00Z');
        for (let t = from; t <= to; t += H) {
          const cands = [];
          for (let L = 0; L <= 3 * cad; L++) { const r = t - L * H; if (set.has(r)) cands.push([L, r]); }
          if (!cands.length) continue;
          const ks = Array.from({ length: 20 }, (_, i) => Math.floor((i * ex.n) / 20));
          const sv = ks.map((k) => ser.raw(v, k, t));
          if (sv.every((x) => x == null)) continue;
          hours++;
          let hit = null;
          for (const [L, r] of cands) { const run = omRun(m, r); const rv = ks.map((k) => run.raw(v, k, t)); if (rv.every((x, i) => x === sv[i])) { hit = L; break; } }
          match[hit == null ? 'none' : `lead${hit}`] = (match[hit == null ? 'none' : `lead${hit}`] ?? 0) + 1;
        }
        if (hours) rows.push({ model: m, var: v, hours, matchByLead: match });
      }
    }
    res.day0 = { what: 'Tag-0-Reihe (data/) gegen die vollen Läufe (data_run/) derselben Gültigkeitsstunde, 20 Zellen je Stunde, Gleichheit der int16-Werte; lead L = Stunde − Lauf des ersten gleichen Laufs', window: '2026-09-14 … 2026-09-18', rows };
  }
  mkdirSync(join(HINDCAST_ROOT, 'shadow'), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(join(HINDCAST_ROOT, 'shadow', `${date}.json`), JSON.stringify(res, null, 1));
  writeFileSync(join(HINDCAST_ROOT, 'shadow', 'latest.json'), JSON.stringify(res, null, 1));
  for (const r of res.exact) console.log(`[shadow] exakt ${r.tier} ${r.plane.padEnd(14)} ±1 Schritt ${(100 * r.share).toFixed(1)} % · ±${r.boundSteps} (Speicherschranke) ${(100 * r.shareBound).toFixed(1)} % von ${r.n} · MAE ${r.mae.toFixed(3)} · p95 ${r.p95StepsMax} Schritte · ${r.runs.length} Läufe`);
  for (const r of res.excluded) console.log(`[shadow] ausgenommen ${r.tier} ${r.plane}: ${r.runs.join(', ')}`);
  console.log(`[shadow] Gegenprobe (verschoben): ±1 ${(100 * (res.negativeControl.share ?? 0)).toFixed(1)} % · Schranke ${(100 * (res.negativeControl.shareBound ?? 0)).toFixed(1)} % von ${res.negativeControl.n}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
