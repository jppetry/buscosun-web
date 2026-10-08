/**
 * replay.mjs — buscosun Fusion as a pure function on archived inputs (plan PS-2-3/PS-2-4, D-PS-5).
 *
 * The ENGINE (`fuseCubePoint`, `dist.ts`, the climatology field) is imported from the version's root — a git worktree
 * of its commit — while the ADAPTERS that read archive and hindcast slots are today's (`scripts/fusionfit/lib/`): an old
 * adapter cannot read newer archive schemas (D-PS-7 d). Nothing under `src/pointForecast/` is changed; the engine is
 * called only.
 *
 * Track P / development set (archive slot, one issue per day):
 *   role A  the point's own station product and its own latest measurement ≤ slot time (as stored in the slot, real time)
 *   role B  masked: no own station, no own measurement — the station product and the measurement of the nearest
 *           role-A station stand in, the product only when today's selection rule accepts it (≤ 15 km and |Δh| ≤ 100 m)
 * Track R (hindcast vault, issue 00 UTC): the slot carries no station product, no nowcast, no measurements — the chain
 *   runs on the cube alone, for every station alike. Stage 1 exists only as "day 0" (effective lead 0–2 h, V-HC-20), so
 *   the block is filled for leads 1–2 h (stage 1) and from 51 h (stages 2 and 3); everything between is NaN.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { H, HINDCAST_ROOT, REPO, p, sha256 } from './common.mjs';
import * as A from '../../fusionfit/lib/archiveAdapter.mjs';
import { seriesFromSlotTier, inputFromSlot } from '../../fusionfit/lib/slotAdapter.mjs';
import { SELECTION } from '../../../src/point/client/resolve.ts';
import { QUANTITY_VARS } from '../../../src/pruefstand/protokoll.ts';
import { channelsOf } from '../../../src/pruefstand/adapter.ts';
import { denseObsFor } from './obsDense.mjs';

const FUSED = { t: 'temperature', td: 'dewPoint', ws: 'windSpeed', gust: 'gust', precip: 'precipitation', clct: 'clouds' };
export const FEATURES_PATH = p(HINDCAST_ROOT, 'features/points.v1.json');

let featCache = null;
export function features() {
  if (!featCache) { const buf = readFileSync(FEATURES_PATH); featCache = { byPoint: JSON.parse(buf.toString('utf8')).byPoint, sha256: sha256(buf) }; }
  return featCache;
}

/** Imports the engine of a version from its root (repo or worktree). */
export async function loadEngine(root) {
  const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
  const { fuseCubePoint } = await imp('src/pointForecast/cubeSource.ts');
  const { ClimaField } = await imp('src/ml/climaField.ts');
  const D = await imp('src/pointForecast/fusion/dist.ts');
  const clima = new ClimaField(JSON.parse(readFileSync(join(root, 'public/climaGrid.json'), 'utf8')));
  // Phase OF: the candidate's own reader of the measurement product (selection + mapping of the dense set, `obsDense.mjs`);
  // a version before OF has no `obsStore.ts` — then `dense` is null and the replay feeds the archive measurement as before.
  let dense = null;
  try {
    const S = await imp('src/sources/obsStore.ts');
    const C = await imp('src/pointForecast/cubeSource.ts');
    if (S.nearestObsStations && S.obsStoreOf && C.cubeObsOf) dense = { nearestObsStations: S.nearestObsStations, obsStoreOf: S.obsStoreOf, OBS_DENSE_MAX: S.OBS_DENSE_MAX ?? 12, cubeObsOf: C.cubeObsOf };
  } catch { dense = null; }
  return { root, fuseCubePoint, quantileOf: D.quantileOf, exceedance: D.exceedance, clima, dense };
}

/** Reads the tables a register entry names; every file is checked against the sha256 of the entry. */
export function loadTables(reg) {
  const out = {};
  for (const [key, t] of Object.entries(reg.tables ?? {})) {
    if (!t?.path) { out[key] = null; continue; }
    const buf = readFileSync(t.path);
    const h = sha256(buf);
    if (t.sha256 && h !== t.sha256) throw new Error(`${reg.id}: Tabelle ${key} (${t.path}) hat sha256 ${h.slice(0, 12)}, das Register nennt ${t.sha256.slice(0, 12)} — eine Version wird nie mit Ersatztabellen gerechnet`);
    out[key] = JSON.parse(buf.toString('utf8'));
  }
  return out;
}

/**
 * The climatology product at a point. `clima: 'loso'` (5e): the leave-station-out estimate of the fit table everywhere.
 * `clima: 'product'`: the published station product — but at a HELD-OUT station (role B) the product contains the station
 * itself, a leak; there `climaHeldOut: 'loso'` takes the leave-station-out estimate (table `loso`), which is what an
 * arbitrary point gets from its neighbours. The measurement runs of phase AX used that estimate for every variant.
 */
function climaOf(reg, tables, row, heldOut) {
  if (reg.clima === 'loso' || (heldOut && reg.climaHeldOut === 'loso')) return A.losoClimaProduct(tables.loso ?? tables.losoTable ?? tables.learned, row);
  return tables.clima;
}
const latestRec = (truthRec, slotAtMs) => { let best = null; for (const r of truthRec?.rows ?? []) if (r.ms <= slotAtMs && r.t != null && (!best || r.ms > best.ms)) best = r; return best; };
/** The anchor input as the stage reads it: latest measurement with dew point and the hour maximum of the gust. */
function obsOf(slot, truthRec, row, distanceM) {
  const base = A.archiveObs(slot, truthRec, row);
  if (!base || !base.length) return base;
  const rec = latestRec(truthRec, slot.slotAtMs);
  return base.map((o) => ({ ...o, distanceM, dewPoint: rec?.td ?? null, gust: rec?.fxh ?? o.gust }));
}

function fillBlock(out, sIdx, nL, ch, nq, leads, floorMs, res, eng, taus, wetThr, leadOk) {
  const byMs = new Map();
  for (const st of res.steps) if (st.fused) byMs.set(st.validAtMs, st);
  for (let l = 0; l < nL; l++) {
    if (leadOk && !leadOk(leads[l])) continue;
    const st = byMs.get(floorMs + leads[l] * H);
    if (!st || (leadOk && !leadOk(leads[l], st))) continue;
    const o = (sIdx * nL + l) * ch;
    for (let v = 0; v < QUANTITY_VARS.length; v++) {
      const d = st.fused[FUSED[QUANTITY_VARS[v]]]?.dist;
      if (!d) continue;
      for (let k = 0; k < nq; k++) out[o + v * nq + k] = eng.quantileOf(d, taus[k]);
      if (QUANTITY_VARS[v] === 'precip') out[o + QUANTITY_VARS.length * nq] = eng.exceedance(d, wetThr);
    }
    const dd = st.fused.windDirectionDeg;
    if (dd != null && Number.isFinite(dd)) out[o + QUANTITY_VARS.length * nq + 1] = dd;
  }
}

/**
 * One archive slot → forecast block of a version. `mode`: 'P1' = roles of the protocol (A own, B masked); 'S' = every
 * station with its own station and measurement (the replay-fidelity form of the stored measurement rows).
 * `engineOpts` overrides the product form (`hourly: true, tail: true`) — the fidelity check uses the native steps.
 */
/**
 * Phase OF: which measurements the engine gets — `archive` (the slot's truth rows: own station for role A, the nearest role-A
 * station for role B — every version before Fusion 12), `dense` (the dense set from the day files of the originals, the input
 * of `obsDense`) or `store6` (the product's six nearest full stations, the OF-1 effect alone). Default: dense when the
 * register option `obsDense` is on, else archive. Without a day file the replay keeps the archive measurement and counts it.
 */
export function obsModeOf(reg, forced = null) { return forced ?? (reg?.options?.obsDense === 1 ? 'dense' : 'archive'); }

export function predictArchive(eng, tables, reg, proto, slot, leads, { mode = 'P1', engineOpts = null, onStep = null, obsMode = null } = {}) {
  const feat = features().byPoint;
  const stations = proto.scored, nSt = stations.length, nL = leads.length, taus = proto.quantiles, nq = taus.length, ch = channelsOf(nq);
  const out = new Float32Array(nSt * nL * ch).fill(NaN);
  const floorMs = Math.floor(slot.slotAtMs / H) * H;
  const window = { fromMs: floorMs, toMs: floorMs + proto.leads.sixHourlyToH * H, stepH: 1 };
  const truthSlot = A.archiveTruth(slot, (id) => feat[id]?.country ?? null);
  const wetThr = proto.variables.wet.thresholdMmH;
  const ms = [], errors = [];
  let withStation = 0, withObs = 0;
  const obsWanted = obsModeOf(reg, obsMode);
  let denseUsed = 0, denseMissing = 0;
  const day = new Date(slot.slotAtMs).toISOString().slice(0, 10);
  for (let s = 0; s < nSt; s++) {
    const stn0 = stations[s], row = feat[stn0.id];
    const cube = {};
    for (const t of ['t1', 't2', 't3']) { const ser = A.archiveSeries(slot, t, stn0.id); if (ser) cube[t] = ser; }
    if (!Object.keys(cube).length) continue;
    let station = null, stationReason = null, obs = null;
    if (mode === 'S' || stn0.role === 'A') {
      const st = A.archiveStation(slot, stn0.id, row.elevM);
      station = st.series; stationReason = st.reason;
      obs = obsOf(slot, truthSlot.get(stn0.id), row, 0);
    } else if (stn0.anchor) {
      const an = stn0.anchor, rowB = feat[an.id];
      const sb = A.archiveStation(slot, an.id, rowB.elevM);
      if (sb.series) {
        const dh = sb.series.station.elev - row.elevM;
        const ok = an.km <= SELECTION.stationMaxKm && (an.km <= SELECTION.stationAtPointKm || Math.abs(dh) <= SELECTION.stationMaxDElevM);
        station = ok ? { ...sb.series, station: { ...sb.series.station, distanceKm: an.km, dElevM: dh } } : null;
        stationReason = `Rolle B: Nachbar ${sb.series.station.name}, ${an.km.toFixed(1)} km, Δh ${Math.round(dh)} m${ok ? '' : ' — vertritt den Punkt nicht (SELECTION)'}`;
      } else stationReason = 'Rolle B: Nachbar ohne Stationsprodukt im Slot';
      obs = obsOf(slot, truthSlot.get(an.id), rowB, an.km * 1000);
    } else stationReason = 'Rolle B: kein Anker in der Liste';
    // Phase OF: the dense measurement set from the originals (role B without its own station: the leak rule of §1.6)
    if (obsWanted !== 'archive') {
      const d = denseObsFor(eng, day, row.lat, row.lon, row.country ?? 'DE', { nowMs: slot.slotAtMs, mode: obsWanted, maskOwn: mode !== 'S' && stn0.role === 'B' });
      if (d) { obs = d; denseUsed += 1; } else denseMissing += 1;
    }
    if (station) withStation += 1;
    if (obs?.length) withObs += 1;
    const nc = A.archiveNowcast(slot, stn0.id);
    const learnedClima = climaOf(reg, tables, row, mode !== 'S' && stn0.role === 'B');
    const input = A.inputFromArchive(slot, row, { cube, station, stationReason, nowcast: nc.nowcast, covering: nc.covering, obs, clima: eng.clima, learned: tables.learned, learnedClima, ...(tables.stack ? { stack: tables.stack } : {}), nowMs: slot.slotAtMs, window });
    const t0 = performance.now();
    let res;
    try { res = eng.fuseCubePoint(input, { ...reg.options, ...(engineOpts ?? { hourly: true, tail: true }) }); }
    catch (e) { errors.push(`${stn0.id}: ${e?.message ?? e}`); continue; }
    ms.push(performance.now() - t0);
    if (onStep) onStep(stn0, res);
    fillBlock(out, s, nL, ch, nq, leads, floorMs, res, eng, taus, wetThr, null);
  }
  ms.sort((a, b) => a - b);
  return { data: out, nq, info: { points: ms.length, withStation, withObs, obsMode: obsWanted, denseUsed, denseMissing, errors: errors.length, firstErrors: errors.slice(0, 3), pointMsMedian: ms.length ? Math.round(ms[Math.floor(ms.length / 2)] * 10) / 10 : null, pointMsP95: ms.length ? Math.round(ms[Math.floor(ms.length * 0.95)] * 10) / 10 : null } };
}

export const hindcastSlotPath = (issueMs) => p(HINDCAST_ROOT, 'slots', new Date(issueMs).toISOString().slice(0, 10), `${new Date(issueMs).toISOString().slice(11, 13)}00.json.gz`);
export function readHindcastSlot(path) {
  const s = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
  if (s.kind !== 'hindcast/slot') throw new Error(`${path}: kein Hindcast-Slot`);
  return s;
}

/** One hindcast slot (00 UTC) → forecast block of a version; see the header for the leads that are filled. */
export function predictHindcast(eng, tables, reg, proto, slot, leads) {
  const feat = features().byPoint;
  const stations = proto.scored, nSt = stations.length, nL = leads.length, taus = proto.quantiles, nq = taus.length, ch = channelsOf(nq);
  const out = new Float32Array(nSt * nL * ch).fill(NaN);
  const t0Ms = slot.slotAtMs;
  const wetThr = proto.variables.wet.thresholdMmH;
  const day0 = slot.cube.t1?.route === 'day0' || !slot.cube.t1?.run;
  const ms = [], errors = [];
  const extra = (row, held) => ({ country: row.country ?? null, learned: tables.learned, learnedClima: climaOf(reg, tables, row, held), ...(tables.stack ? { stack: tables.stack } : {}) });
  const opts = { ...reg.options, hourly: true, tail: true };
  for (let s = 0; s < nSt; s++) {
    const row = feat[stations[s].id];
    const series = {};
    for (const t of ['t1', 't2', 't3']) if (slot.cube[t]) { const ser = seriesFromSlotTier(slot, t, stations[s].id); if (ser) series[t] = ser; }
    const calls = [];
    if (day0) {
      if (series.t1) calls.push({ cube: { t1: series.t1 }, window: { fromMs: t0Ms, toMs: t0Ms + 2 * H, stepH: 1 }, ok: (L) => L <= 2 });
      const rest = {}; for (const t of ['t2', 't3']) if (series[t]) rest[t] = series[t];
      if (Object.keys(rest).length) calls.push({ cube: rest, window: { fromMs: t0Ms, toMs: t0Ms + proto.leads.sixHourlyToH * H, stepH: 1 }, ok: (L, st) => L >= 51 && (!st || st.tier === 't2' || st.tier === 't3') });
    } else if (Object.keys(series).length) calls.push({ cube: series, window: { fromMs: t0Ms, toMs: t0Ms + proto.leads.sixHourlyToH * H, stepH: 1 }, ok: null });
    for (const c of calls) {
      const input = { ...inputFromSlot(slot, row, c.cube, eng.clima, { nowMs: t0Ms, window: c.window }), ...extra(row, stations[s].role === 'B') };
      const t0 = performance.now();
      let res;
      try { res = eng.fuseCubePoint(input, opts); } catch (e) { errors.push(`${stations[s].id}: ${e?.message ?? e}`); continue; }
      ms.push(performance.now() - t0);
      fillBlock(out, s, nL, ch, nq, leads, t0Ms, res, eng, taus, wetThr, c.ok);
    }
  }
  ms.sort((a, b) => a - b);
  return { data: out, nq, info: { points: nSt, calls: ms.length, errors: errors.length, firstErrors: errors.slice(0, 3), day0, pointMsMedian: ms.length ? Math.round(ms[Math.floor(ms.length / 2)] * 10) / 10 : null, pointMsP95: ms.length ? Math.round(ms[Math.floor(ms.length * 0.95)] * 10) / 10 : null } };
}
export { REPO };
