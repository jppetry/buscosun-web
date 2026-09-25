/**
 * featureLib.mjs — the pure part of the per-point feature table of phase FL (`audit/fusion-lernphase.md` §4):
 * everything `features.mjs` computes WITHOUT the network, so the verifier can test it on synthetic input.
 *
 *   • height band and 1° tile (the strata of the fit and the blocks of the spatial cross-validation);
 *   • model height per source from the hindcast cell recipe (`cells/<tier>.json`) — nearest cell and the 2×2 block;
 *   • the lake threshold in mirror pixels (V-FL-6: `dWater` finds ponds with A_min 10 px, `dLake` asks for ≥ 1 km²);
 *   • nearest radiosonde;
 *   • the feature row itself (`featureRow`), with `noTerrain` named when the DEM did not deliver.
 */
import { haversine } from '../../../src/point/terrainPoint.ts';
import { LANDCOVER_SET } from '../../../src/point/client/landCover.ts';

export const FEATURES_SCHEMA = 1;
export const FEATURES_KIND = 'fusionfit/features';
export const TIERS = Object.freeze(['t1', 't2', 't3']);

/** Height bands: the two of `calibFit.ts` (< / ≥ 800 m) plus a three-band report (< 500, 500–1200, ≥ 1200 m). */
export const band2Of = (elevM) => (elevM < 800 ? 'lt800' : 'ge800');
export const band3Of = (elevM) => (elevM < 500 ? 'lt500' : elevM < 1200 ? '500to1200' : 'ge1200');
/** 1° tile, the same rule as `blockOf` in `calibFit.ts`. */
export const tileOf = (lat, lon) => `${Math.floor(lat)}_${Math.floor(lon)}`;

/** Area threshold of a "lake" (V-FL-6), m². */
export const LAKE_MIN_M2 = 1_000_000;
/** Pixels of the mirror level a lake must cover: ceil(A / (pxW·pxH)); at ≈ 37 m pixels ≈ 731 px. */
export function lakeMinBodyPx(pxW, pxH) {
  if (!(pxW > 0) || !(pxH > 0)) return null;
  return Math.max(LANDCOVER_SET.minBodyPx, Math.ceil(LAKE_MIN_M2 / (pxW * pxH)));
}

/**
 * Model height per source at the nearest cell and the block cells of a point, from a tier's cell recipe.
 * `hModEffCells` = mean over the sources that carry a height — the same rule as the hindcast slot's `hModEff`.
 */
export function hmodelOfPoint(tierCells, pointId) {
  const p = tierCells?.points?.[pointId];
  if (!p) return null;
  const cellOf = (iy, ix) => tierCells.cells?.[`${iy}_${ix}`] ?? null;
  const near = cellOf(p.cell.iy, p.cell.ix);
  const bySource = near?.hmodel ? { ...near.hmodel } : {};
  const vals = Object.values(bySource).filter((v) => Number.isFinite(v));
  const block = (p.block ?? []).map((b) => {
    const c = cellOf(b.iy, b.ix);
    return { iy: b.iy, ix: b.ix, dy: b.dy, dx: b.dx, distKm: b.distKm, centre: b.centre, hmodel: c?.hmodel ? { ...c.hmodel } : null };
  });
  return {
    cell: { iy: p.cell.iy, ix: p.cell.ix, lat: p.cell.lat, lon: p.cell.lon, offsetKm: p.cell.offsetKm },
    chunk: p.chunk ?? null,
    bySource,
    hModEffCells: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    spreadM: vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null,
    absent: Object.entries(bySource).filter(([, v]) => v == null).map(([k]) => k),
    block,
  };
}

/** Nearest radiosonde station: `stations` = [{ id, name, lat, lon, elev }]. */
export function nearestSonde(lat, lon, elevM, stations) {
  let best = null;
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const distKm = haversine(lat, lon, s.lat, s.lon) / 1000;
    if (!best || distKm < best.distKm) best = { id: s.id, name: s.name, distKm: Math.round(distKm * 10) / 10, dElevM: Number.isFinite(s.elev) && Number.isFinite(elevM) ? Math.round(s.elev - elevM) : null };
  }
  return best;
}

/** Strip the per-run fields (timing, fetched) from a loader result so the table is reproducible byte for byte. */
export function stripRuntime(o) {
  if (!o || typeof o !== 'object') return o;
  const { timing: _t, fromCache: _f, fetched: _e, computeMs: _c, ...rest } = o;
  void _t; void _f; void _e; void _c;
  return rest;
}

/**
 * One feature row. `terrain` = TerrainPointResult, `landCover` = LandCoverAtPoint (or null), `dLake` = DWater at the lake
 * threshold (or null), `urban` = StaticPoint of `urban/v1` (or null), `hmodel` = { t1, t2, t3 } from `hmodelOfPoint`,
 * `sonde` from `nearestSonde`. `elevM` is the station height (h_true, E-F-12).
 */
export function featureRow(point, { terrain, landCover, dLake, urban, hmodel, sonde }) {
  const elevM = point.elev;
  const t = terrain ? stripRuntime(terrain) : null;
  const noTerrain = !t || t.elevationM == null || !t.scales || !(t.scales.sampledCount > 0);
  const lc = landCover ? stripRuntime(landCover) : null;
  const flags = [];
  if (noTerrain) flags.push('noTerrain');
  if (!lc || lc.z0True == null) flags.push('noLandCover');
  if (!urban) flags.push('noUrban');
  if (t && t.elevationM != null && Math.abs(t.elevationM - elevM) > 100) flags.push('demVsStationGt100');
  for (const tier of TIERS) if (hmodel?.[tier]?.absent?.length) flags.push(`hmodelAbsent:${tier}:${hmodel[tier].absent.join('+')}`);
  return {
    id: point.id, name: point.name, country: point.country, lat: point.lat, lon: point.lon,
    elevM, demM: point.demM ?? null, profile: point.profile ?? null, truth: point.truth ?? null,
    band2: band2Of(elevM), band3: band3Of(elevM), tile: tileOf(point.lat, point.lon),
    terrain: t,
    landCover: lc,
    dLake: dLake ? { m: dLake.m, aboveM: dLake.aboveM, reason: dLake.reason, bodyPx: dLake.bodyPx, minBodyPx: dLake.minBodyPx ?? null } : null,
    urban: urban ? { byColumn: urban.byColumn, provenance: urban.provenance, chunk: urban.chunk?.path ?? null } : null,
    hmodel: hmodel ?? null,
    sonde: sonde ?? null,
    flags,
  };
}

/** Deterministic JSON: sorted keys at every level (arrays keep order). */
export function stableStringify(x, indent = 0) {
  const seen = new WeakSet();
  const norm = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(norm);
    if (seen.has(v)) throw new Error('stableStringify: cycle');
    seen.add(v);
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = norm(v[k]);
    seen.delete(v);
    return o;
  };
  return JSON.stringify(norm(x), null, indent);
}
