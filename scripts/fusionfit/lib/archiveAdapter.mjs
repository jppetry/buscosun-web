/**
 * archiveAdapter.mjs — an ARCHIVE slot (`buscosun-archiv`, schema 1, 2 and 3) as the engine sees the point (phase FV,
 * `audit/fusion-validierung.md` §1.6). The hindcast adapter (`slotAdapter.mjs`) stays untouched: a hindcast slot carries
 * `cube[t].validAtMs`, the planes in `CUBE_PLANES` scales and the 2×2 block; an archive slot carries `runAt` + `leadHours`,
 * its own scales (`scales.cube[t]`, the run manifest's), `belowGroundHPa` per step, NO block (schema 4 = AP9), and in
 * addition the MOSMIX-L station product, the nowcast frames, the truth window and the live path.
 *
 * What the product chain gets (the client's inputs at the slot time, nothing later than `slotAtMs`):
 *   cube      per tier the `CubePointSeries` of the nearest cell (`neighbours: []` ⇒ PAP 3 with N = 1, named)
 *   station   MOSMIX-L of the point's catalog station, when the CURRENT selection rule accepts it (`SELECTION` of the client:
 *             ≤ 15 km and |Δh| ≤ 100 m, or ≤ 0,25 km = at the point) — the rule of today's client, applied to every schema
 *             (schema-1 plans judged with the DEM height, V-PA3)
 *   nowcast   the frames of every source the slot carries for the point (`nowcast.byPoint[].bySource`), `covering`
 *   obs       the LATEST measurement ≤ slotAt of the point's own truth network (one `CubeObs`, distance 0, station height) —
 *             the client takes the latest reading of the six nearest stations; for a station point the nearest is the point
 * Truth network per point = the hindcast's: DE `poi` (stands for CDC), AT `tawes`, CH/LI `smn` — POI records of AT/CH points
 * are never used. Gust truth = `fxh` (hour maximum; schema 1 has it only for POI, where `fx` is the hour maximum), precipitation
 * = POI `rr1` / TAWES+SMN `rr1h` (the hour sums, as `truthJoin.mjs`).
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TIER_BY_ID, CUBE_PLANES } from '../../../src/point/cubeFormat.ts';
import { SELECTION } from '../../../src/point/client/resolve.ts';
import { windComponents } from '../../../src/point/fusionFit/features.ts';
import { C_NAMES } from '../../../src/point/fusionFit/fitClima.ts';

const H = 3_600_000;
export const ARCHIVE_SENTINEL = -32768;
export const TRUTH_NET_BY_COUNTRY = Object.freeze({ DE: 'poi', AT: 'tawes', CH: 'smn', LI: 'smn' });

// Phase AX (V-AX-4): schema 3 (PA4, since 29.09.2026) keeps `cube`, `stations`, `nowcast` and `truth` byte-compatible with
// schema 2 (checked on the 29.09. slot: same keys, same scales, truth columns + `ps`); only `live.fusion` is columnar, which
// `archiveLive` already decodes via the AP9 decoder. Nothing in this adapter reads the parts that changed otherwise
// (`live.asOf`, `finishedAt`, `plan` axis, `hmodel.absentBySlot`).
export const ARCHIVE_SCHEMAS_READABLE = Object.freeze([1, 2, 3]);
export function readArchiveSlot(path) {
  const s = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
  if (s.kind !== 'punktarchiv/slot' || !ARCHIVE_SCHEMAS_READABLE.includes(s.schema)) throw new Error(`${path}: kein Archiv-Slot mit Schema ${ARCHIVE_SCHEMAS_READABLE.join('/')} (kind ${s.kind}, schema ${s.schema})`);
  return s;
}

const deq = (q, sc) => (q == null || q === ARCHIVE_SENTINEL || !sc ? null : q * sc.scale + sc.offset);

/** The cube series of one tier at one point (nearest cell), in the form `cubeSeriesFrom` builds in the browser. */
export function archiveSeries(slot, tierId, pointId) {
  const c = slot.cube?.[tierId];
  const bp = c?.byPoint?.[pointId];
  if (!c || !bp) return null;
  const tier = TIER_BY_ID[tierId];
  const sc = slot.scales?.cube?.[tierId] ?? {};
  const runAtMs = Date.parse(c.runAt), sourceRunAtMs = Date.parse(c.sourceRunAt ?? c.runAt);
  const planeIds = Object.keys(bp.planes ?? {});
  const steps = (c.leadHours ?? []).map((L, it) => {
    const values = {};
    for (const id of planeIds) values[id] = deq(bp.planes[id][it], sc[id]);
    for (const id of bp.empty ?? []) values[id] = null;
    const bg = bp.belowGroundHPa?.[it];
    return { leadH: L, validAtMs: runAtMs + L * H, values, belowGroundHPa: Array.isArray(bg) ? bg : null };
  });
  return {
    product: 'cube', tier: tierId, run: c.run, runAtMs, sourceRun: c.sourceRun ?? c.run, sourceRunAtMs,
    chunk: { path: typeof bp.chunk === 'string' ? bp.chunk : `archive:${slot.slotAt}/${tierId}`, bytes: 0, cy: 0, cx: 0 },
    cell: { iy: bp.cell.iy, ix: bp.cell.ix, lat: bp.cell.lat, lon: bp.cell.lon, offsetKm: bp.cell.offsetKm, degrees: tier.deg },
    hModEffM: bp.hModEffM ?? null,
    steps, planes: CUBE_PLANES, filledPlanes: planeIds, emptyPlanes: [...(bp.empty ?? [])],
    sources: (c.sources ?? []).map((s) => ({
      id: s.id, name: s.id, tier: tierId, runAt: s.runAt ?? c.runAt, fromH: tier.fromH, toH: tier.toH, steps: s.steps ?? 0, members: 0, role: s.role ?? 'assigned',
      coverage: s.stepsCoverage ?? s.coverage ?? 'full', offsetH: s.offsetH ?? 0, geometry: null, attribution: null, licence: null, errors: 0, firstError: null, dropped: null,
    })),
    provenance: { quantiles: c.provenance?.quantiles ?? null, ensemble: c.provenance?.ensemble ?? null, profile: c.provenance?.profile ?? null },
    manifestFrom: 'caller', neighbours: [],
  };
}

/**
 * The MOSMIX-L station series of a point and the decision whether it represents the point (today's client rule, `SELECTION`).
 * Station height: schema ≥ 2 `dElevM` is against `points[].elev`, schema 1 against the DEM pixel `points[].demM` (PA3).
 */
export function archiveStation(slot, pointId, hTrueM) {
  const st = slot.stations, rec = st?.byPoint?.[pointId];
  if (!st || !rec?.station || !rec.planes) return { series: null, reason: 'kein Stationsprodukt für den Punkt im Slot' };
  const p = slot.points.find((x) => x.id === pointId);
  const base = slot.schema >= 2 ? p?.elev : p?.demM;
  const elev = p?.mosmix?.elev ?? (base != null && rec.station.dElevM != null ? base + rec.station.dElevM : null);
  if (elev == null) return { series: null, reason: 'Stationshöhe unbekannt' };
  const d = rec.station.distanceKm, dElev = elev - hTrueM;
  const atPoint = d <= SELECTION.stationAtPointKm;
  const ok = d <= SELECTION.stationMaxKm && (atPoint || Math.abs(dElev) <= SELECTION.stationMaxDElevM);
  const name = (p?.mosmix?.name ?? p?.name ?? rec.station.id).trim();
  if (!ok) return { series: null, reason: `${name}, ${d.toFixed(1)} km, Δh ${Math.round(dElev)} m — vertritt den Punkt nicht (SELECTION)` };
  const runAtMs = Date.parse(st.runAt);
  const sc = st.scales ?? {};
  const ids = Object.keys(rec.planes);
  const steps = (st.leadHours ?? []).map((L, i) => {
    const values = {};
    for (const id of ids) values[id] = deq(rec.planes[id][i], sc[id]);
    return { leadH: L, validAtMs: runAtMs + L * H, values };
  });
  return {
    series: {
      product: 'stations', station: { id: rec.station.id, name, lat: p?.mosmix?.lat ?? p?.lat, lon: p?.mosmix?.lon ?? p?.lon, elev, distanceKm: d, dElevM: dElev },
      run: st.run, runAtMs, ageH: st.ageAtBuildH ?? st.ageH ?? 0, bundle: { path: st.manifest ?? 'archive', bytes: 0, column: 0, stations: 0 },
      steps, planes: [], filledPlanes: ids, notMapped: {}, caveats: [],
    },
    reason: `${name}, ${d.toFixed(1)} km, Δh ${Math.round(dElev)} m — vertritt den Punkt (SELECTION, heutige Regel)`,
  };
}

/** Nowcast series of a point (every source the slot carries) and the covering list. */
export function archiveNowcast(slot, pointId) {
  const b = slot.nowcast?.byPoint?.[pointId];
  if (!b) return { nowcast: [], covering: [] };
  const out = [];
  // the frame rates are INTEGER-coded like every archive column (`nowcast.scale.mmh`: 0,01 mm/h — 16 = 0,16 mm/h); FV-A run 1 read them
  // raw (100× too wet at 0–3 h, V-FV-2) — decode with the slot's own scale, sentinel = null
  const sc = slot.nowcast?.scale?.mmh ?? null;
  if (!sc) throw new Error(`${slot.slotAt}: nowcast.scale.mmh fehlt — Frames nicht dekodierbar`);
  for (const [sid, r] of Object.entries(b.bySource ?? {})) {
    if (!r || !Array.isArray(r.frames) || !r.frames.length) continue;
    const suspectSeries = !!(r.validAtSuspect && r.validAtSuspect.frames);
    out.push({
      product: 'nowcast', sourceId: sid, stamp: r.stamp, slotAgeMin: r.slotAgeMin ?? 0, probes: r.probes ?? 0, extrapolationH: r.extrapolationH ?? 0,
      frames: r.frames.map((f) => ({ mmh: deq(f.mmh, sc), saturated: !!f.saturated, validAtMs: f.validAtMs ?? null, validAtSuspect: f.validAtSuspect ?? suspectSeries, lead: f.lead, stamp: r.stamp, sourceId: sid })),
      bytes: 0, framesInSlot: r.frames.length, framesFetched: r.frames.length, framesFailed: 0,
    });
  }
  return { nowcast: out, covering: [...(b.covering ?? [])] };
}

/** Decoded truth records of one slot: Map pointId → { net, rows: Array<{ ms, t, td, rh, ff, dd, u, v, fxh, fx, rr, n }> } — the hindcast network only. */
export function archiveTruth(slot, countryOf) {
  const sc = slot.scales?.truth ?? {};
  const out = new Map();
  for (const [id, byNet] of Object.entries(slot.truth?.byPoint ?? {})) {
    const net = TRUTH_NET_BY_COUNTRY[countryOf(id)];
    const r = net ? byNet?.[net] : null;
    if (!r?.obsAtMs?.length) continue;
    const g = (col, i) => (r[col] ? deq(r[col][i], sc[col] ?? { scale: 1, offset: 0 }) : null);
    const rows = r.obsAtMs.map((ms, i) => {
      const ff = g('ff', i), dd = g('dd', i);
      const w = ff != null && dd != null ? windComponents(ff, dd) : null;
      // gust: the hour maximum — `fxh` (schema ≥ 2, every network); schema 1: only POI's `fx` is the hour maximum
      const fxh = g('fxh', i) ?? (net === 'poi' ? g('fx', i) : null);
      return { ms, t: g('t', i), td: g('td', i), rh: g('rh', i), ff, dd, u: w?.u ?? null, v: w?.v ?? null, fxh, fx: g('fx', i), rr: net === 'poi' ? g('rr1', i) : g('rr1h', i), n: net === 'poi' ? g('n', i) : null };
    });
    out.set(id, { net, rows });
  }
  return out;
}

/** The anchor input: the latest measurement ≤ slotAt of the point's network (null = none). */
export function archiveObs(slot, truthRec, featRow) {
  if (!truthRec) return null;
  let best = null;
  for (const r of truthRec.rows) if (r.ms <= slot.slotAtMs && r.t != null && (!best || r.ms > best.ms)) best = r;
  if (!best) return [];
  const source = truthRec.net === 'poi' ? 'dwd_obs' : truthRec.net;
  return [{ source, name: featRow.name, lat: featRow.lat, lon: featRow.lon, elevM: featRow.elevM, distanceM: 0, validAtMs: best.ms,
    temperature: best.t, relativeHumidity: best.rh, u: best.u, v: best.v, gust: best.fxh ?? best.fx }];
}

/**
 * The fold key of the frozen rule (§1.7) for an archive row: issue ≤ hindcast end ⇒ the half-month of the valid time, but never
 * later than the last half-month the fit saw (`2026-09b` purges `2026-09a` and has no later neighbour — a valid time in October
 * would otherwise ask for `2026-10a`, a key without folds, and get the FULL β: a leak); a month table takes the month of the issue
 * (`2026-09`). After the hindcast end: null = the full tables.
 */
export function foldKeyFV(scheme, issueMs, validMs, hindcastEndMs, lastKey = { half: '2026-09b', month: '2026-09' }) {
  if (issueMs > hindcastEndMs) return null;
  if (scheme === 'month') { const m = new Date(issueMs).toISOString().slice(0, 7); return m < lastKey.month ? m : lastKey.month; }
  const d = new Date(validMs), k = `${d.toISOString().slice(0, 7)}${d.getUTCDate() <= 15 ? 'a' : 'b'}`;
  return k < lastKey.half ? k : lastKey.half;
}

/** The CubeTerrain block from a feature row (the same definition as `slotAdapter.mjs terrainFromFeatures`). */
export function terrainOf(row) {
  const t = row?.terrain;
  if (!t || t.elevationM == null) return null;
  return { elevationM: t.elevationM, tpi500M: t.tpi500M, tpi2000M: t.tpi2000M, svf: t.svf, slopeDeg: t.slopeDeg, aspectDeg: t.aspectDeg, horizonDeg: t.horizonDeg, scales: t.scales ?? null, sinkDepthM: t.sinkDepthM ?? null };
}

/**
 * The μ_c input of a station table as a one-station product AT the point: estimator idw k = 1 without height slope ⇒
 * `estimateCoefficients` returns the station's coefficients unchanged — here the LEAVE-STATION-OUT estimate of the point
 * (`tables.climaMu.byPoint[id]`, the ridgeTx trend fitted on the OTHER 388 stations), the μ_c the scorer of Fit 5e reads.
 * Never the published product, whose trend contains the station itself (a leak at station points).
 */
export function losoClimaProduct(tables, featRow) {
  const mu = tables?.climaMu?.byPoint?.[featRow.id];
  const vars = tables?.design?.mean?.climaVars ?? [];
  if (!mu || !vars.length) return null;
  const m = {};
  for (const v of vars) if (Array.isArray(mu[v]) && mu[v].length === C_NAMES.length) m[v] = mu[v];
  if (!Object.keys(m).length) return null;
  return {
    schema: 1, kind: 'fusionfit/clima-product', fitVersion: tables.fitVersion, provenance: 'hindcast', builtAt: tables.builtAt,
    candidate: `${tables.climaMu.candidate ?? 'loso'}-loso`, estimator: { kind: 'idw', k: 1, power: 2, heightSlope: 'none' },
    design: C_NAMES, vars: Object.keys(m), lapse: null, trend: null,
    stations: [{ id: featRow.id, name: featRow.name, lat: featRow.lat, lon: featRow.lon, elevM: featRow.elevM, country: featRow.country, mu: m }],
    source: { clima: 'tables.climaMu (leave-station-out)', sha256: tables.climaMu.source?.sha256 ?? null, period: null, days: null, points: 1 },
    licence: ['DWD CDC CC BY 4.0', 'GeoSphere Austria CC BY 4.0', 'MeteoSwiss OGD CC BY 4.0'], notes: ['Phase FV: LOSO-Schätzung des Punkts als Ein-Stations-Produkt (audit/fusion-validierung.md §1.7)'],
  };
}

/** The engine input of one archive point (pure; the caller decides station/nowcast/obs/learned per variant). */
export function inputFromArchive(slot, row, { cube, station = null, stationReason = null, nowcast = [], covering = [], obs = null, clima, learned = null, learnedClima = null, stack = null, nowMs, window }) {
  return {
    lat: row.lat, lon: row.lon, nowMs, window,
    country: row.country ?? null,   // AX-5: the country entry of the station-value table (LI counts as CH in the engine)
    elevationM: row.elevM, elevationFrom: 'station',
    terrain: terrainOf(row),
    cube, station, stationReason, nowcast, nowcastCovering: covering,
    urban: row.urban?.byColumn ?? null,
    z0: row.landCover ?? null,
    index: { commit: slot.index?.commit ?? null },
    clima, obs,
    ...(learned ? { learned } : {}), ...(learnedClima ? { learnedClima } : {}), ...(stack ? { stack } : {}),
    notes: [], skips: [], errors: [],
  };
}

/** The live path of a point: decoded fields and fusion per hour (schema ≤ 2: fusion rows; schema 3 columns via the AP9 decoder). */
export async function archiveLive(slot, pointId) {
  const l = slot.live?.byPoint?.[pointId];
  if (!l || l.error || !Number.isFinite(l.t0Ms)) return null;
  const sc = slot.scales?.live ?? {};
  const fields = {};
  for (const [f, arr] of Object.entries(l.fields ?? {})) fields[f] = arr.map((q) => deq(q, sc[f]));
  let fusion = null;
  if (Array.isArray(l.fusion)) fusion = l.fusion;
  else if (l.fusion) { const { decodeFusionColumns } = await import('../../punktarchiv/lib/punktarchiv.mjs'); fusion = decodeFusionColumns(l.fusion); }
  const tsMs = Array.isArray(l.tsMs) ? l.tsMs : null;
  const indexOf = (ms) => { if (tsMs) { const i = tsMs.indexOf(ms); return i < 0 ? null : i; } const i = (ms - l.t0Ms) / H; return Number.isInteger(i) && i >= 0 && i < l.n ? i : null; };
  return { fetchedAtMs: l.fetchedAtMs, t0Ms: l.t0Ms, elevation: l.elevation, n: l.n, fields, fusion, indexOf };
}
/** A live-fusion quantity decoded (value scale 0,01; humidity/clouds 0,1 — the encoder of schema 2). */
export function liveFusionQ(rec, v) {
  const e = rec?.[v];
  if (!e) return null;
  const s = v === 'humidity' || v === 'clouds' ? 0.1 : 0.01;
  const d = (q) => (q == null || q === ARCHIVE_SENTINEL ? null : q * s);
  return { mu: d(e.mu), q10: d(e.q10), q50: d(e.q50), q90: d(e.q90), climaOnly: !!e.climaOnly };
}
