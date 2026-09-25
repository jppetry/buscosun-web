/**
 * slotAdapter.mjs — a hindcast slot as the engine sees the cube (phase FL, `audit/fusion-lernphase.md` §9 FL-AP2).
 *
 * `seriesFromSlotTier` turns `slot.cube[tier].byPoint[id]` into the `CubePointSeries` the browser reader builds from a
 * chunk (`cubeSeriesFrom` in `src/point/client/cubePoint.ts`): steps with dequantised values and `belowGroundHPa`, the
 * three block cells as `neighbours` (PAP 3), the sources as manifest stubs, the model height. `inputFromSlot` then
 * assembles the pure engine input (`CubeFusionInput`) from a feature row (terrain, land cover, urban) and the
 * climatology — no station product, no nowcast, no obs (unless the caller passes them): the candidate „heutiger Cube".
 *
 * Day-0 slots (t1 before 2026-06-17) carry no run: the series takes `runAtMs = slotAtMs` and `leadH = hour of day`;
 * the case builder calls the engine per 3-h block with `nowMs = block start` (V-HC-20: the effective lead is 0–2 h).
 */
import { CUBE_PLANES, MISSING, TIER_BY_ID, PRESSURE_LEVELS_HPA, pressurePlaneId } from '../../../src/point/cubeFormat.ts';
import { PAP3_PLANES } from '../../hindcast/lib/common.mjs';

const H = 3_600_000;
const PLANE_BY_ID = new Map(CUBE_PLANES.map((p) => [p.id, p]));
const deq = (id, q) => (q == null || q === MISSING ? null : q * PLANE_BY_ID.get(id).scale + PLANE_BY_ID.get(id).offset);

/** "YYYYMMDDHH" → ms. */
export const runToMs = (run) => (typeof run === 'string' && /^\d{10}$/.test(run) ? Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)) : typeof run === 'string' ? Date.parse(run) : NaN);

export function seriesFromSlotTier(slot, tierId, pointId) {
  const c = slot.cube?.[tierId];
  const bp = c?.byPoint?.[pointId];
  if (!c || !bp) return null;
  const tier = TIER_BY_ID[tierId];
  const nt = c.validAtMs.length;
  const runAtMs = c.runAt ? Date.parse(c.runAt) : slot.slotAtMs;
  const steps = [];
  const planeIds = Object.keys(bp.planes);
  for (let it = 0; it < nt; it++) {
    const values = {};
    for (const id of planeIds) values[id] = deq(id, bp.planes[id][it]);
    for (const id of bp.empty) values[id] = null;
    const ps = values.ps ?? null;
    const carried = PRESSURE_LEVELS_HPA.filter((hPa) => values[pressurePlaneId('t', hPa)] != null || values[pressurePlaneId('rh', hPa)] != null);
    const belowGroundHPa = ps == null || carried.length === 0 ? null : carried.filter((hPa) => hPa > ps);
    const validAtMs = c.validAtMs[it];
    steps.push({ leadH: c.leadHours ? c.leadHours[it] : Math.round((validAtMs - runAtMs) / H), validAtMs, values, belowGroundHPa });
  }
  const neighbours = [];
  for (const b of bp.block ?? []) {
    if (b.planes === 'nearest') continue;
    const vals = [];
    const ids = Object.keys(b.planes);
    let hMod = null;
    for (let it = 0; it < nt; it++) {
      const v = {};
      for (const id of ids) v[id] = deq(id, b.planes[id][it]);
      for (const id of b.empty ?? []) v[id] = null;
      for (const id of PAP3_PLANES) if (!(id in v)) v[id] = null;
      if (hMod == null && v.hModEff != null) hMod = v.hModEff;
      vals.push(v);
    }
    neighbours.push({ dy: b.dy, dx: b.dx, iy: b.iy, ix: b.ix, lat: b.centre.lat, lon: b.centre.lon, distKm: b.distKm, hModEffM: hMod, values: vals });
  }
  const runId = c.run ?? `day0-${new Date(slot.slotAtMs).toISOString().slice(0, 10)}`;
  return {
    product: 'cube', tier: tierId,
    run: runId, runAtMs, sourceRun: runId, sourceRunAtMs: runAtMs,
    chunk: { path: `hindcast:${slot.slotAt}/${tierId}/${bp.chunk?.cy ?? 0}_${bp.chunk?.cx ?? 0}`, bytes: 0, cy: bp.chunk?.cy ?? 0, cx: bp.chunk?.cx ?? 0 },
    cell: { iy: bp.cell.iy, ix: bp.cell.ix, lat: bp.cell.lat, lon: bp.cell.lon, offsetKm: bp.cell.offsetKm, degrees: tier.deg },
    hModEffM: bp.hModEffM ?? null,
    steps,
    planes: CUBE_PLANES,
    filledPlanes: planeIds, emptyPlanes: [...bp.empty],
    sources: (c.sources ?? []).map((s) => ({
      id: s.id, name: s.id, tier: tierId, runAt: s.run ? new Date(runToMs(s.run)).toISOString() : new Date(runAtMs).toISOString(),
      fromH: tier.fromH, toH: tier.toH, steps: s.steps ?? 0, members: 0, role: s.role ?? 'assigned', coverage: 'full',
      offsetH: s.offsetH ?? 0, geometry: null, attribution: null, licence: null, errors: 0, firstError: null, dropped: null,
    })),
    provenance: { quantiles: null, ensemble: null, profile: null },
    manifestFrom: 'caller',
    neighbours,
  };
}

/** The CubeTerrain block of the engine input from a feature row. */
export function terrainFromFeatures(row) {
  const t = row?.terrain;
  if (!t || t.elevationM == null) return null;
  return { elevationM: t.elevationM, tpi500M: t.tpi500M, tpi2000M: t.tpi2000M, svf: t.svf, slopeDeg: t.slopeDeg, aspectDeg: t.aspectDeg, horizonDeg: t.horizonDeg, scales: t.scales ?? null, sinkDepthM: t.sinkDepthM ?? null };
}

/**
 * Engine input for one point of one slot. `cube` = { t1?, t2?, t3? } series (already built); `nowMs` the as-of clock;
 * `window` in valid time. `obs` = CubeObs[] for the anchor variant, else null.
 */
export function inputFromSlot(slot, row, cube, clima, { nowMs, window, obs = null }) {
  return {
    lat: row.lat, lon: row.lon, nowMs, window,
    elevationM: row.elevM, elevationFrom: 'station',
    terrain: terrainFromFeatures(row),
    cube,
    station: null, stationReason: 'hindcast: kein Stationsprodukt (MOSMIX nicht archiviert, E-FL-4)',
    nowcast: [], nowcastCovering: [],
    urban: row.urban?.byColumn ?? null,
    z0: row.landCover ?? null,
    index: { commit: slot.codeHash ?? null },
    clima, obs,
    notes: [], skips: [], errors: [],
  };
}
