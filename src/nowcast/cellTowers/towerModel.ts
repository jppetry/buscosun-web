/**
 * Phase ZT (`audit/zelltuerme-3d.md` §3/§6): KONRAD3D cells → `fill-extrusion` features for the 3D stage.
 *
 * Pure (no DOM, no MapLibre) so the Node verifier runs the same code as the browser.
 *
 * Heights. KONRAD3D gives echo base and echo top in metres above mean sea level, one value per cell. MapLibre (5.24,
 * `fillExtrusionVert`) lifts every extrusion by the terrain height at the polygon centroid — the plain mean of the ring
 * vertices, times the terrain exaggeration — and adds `fill-extrusion-base/-height` on top, NOT exaggerated. So:
 *   ground   = DEM at that same vertex mean (`ringVertexMean`)
 *   base_agl = max(0, base_msl − ground)        (E-ZT-2: a base below the ground is clamped and flagged)
 *   top_agl  = top_msl − ground
 * and the extrusion values are `agl × exaggeration` (E-ZT-1: terrain and towers share the factor 1.3, so the
 * tower : mountain proportions are true). The Steckbrief shows the true metres.
 *
 * Hail core (E-ZT-3). The data carries no hail outline, only `hailAreaKm2`, `hailEchoTopM` (m MSL) and flags. The core
 * is the cell outline scaled about the vertex mean to the hail area (√(hail / cell area)), from the tower base to the
 * hail echo top — the AREA is measured, the POSITION inside the cell is not ("Lage schematisch" in the legend).
 */

import type { Konrad3dCell, Konrad3dRun } from '../../radar/konrad3d';

/** Terrain and tower exaggeration of the stage (E-ZT-1 = project standard `TERRAIN_EXAGGERATION` of ET/R3D). */
export const TOWER_EXAGGERATION = 1.3;

/** dBZ colour scale (`set`, colours of the reference `regenradar2-desktop.dc.html`): lower bounds, ascending. */
export const DBZ_COLOR_STOPS: ReadonlyArray<{ minDbz: number; color: string; label: string }> = Object.freeze([
  { minDbz: -Infinity, color: '#C9A227', label: '< 45' },
  { minDbz: 45, color: '#E08A2E', label: '45–50' },
  { minDbz: 50, color: '#C9522E', label: '50–55' },
  { minDbz: 55, color: '#8F2140', label: '≥ 55' },
]);
/** Colour of a tower without dBZ value. */
export const DBZ_UNKNOWN_COLOR = '#9A8F7A';
/** Hail core (dark, E-ZT-3). */
export const HAIL_CORE_COLOR = '#3B0F18';
/** Tower opacity: the terrain behind stays readable (Auftrag). */
export const TOWER_OPACITY = 0.62;
/** Core scale when the hail area is unknown but the hail flag is set (`set`; legend says "Lage schematisch"). */
export const HAIL_CORE_FALLBACK_SCALE = 0.5;
/** The core stays inside the tower walls (coincident walls would z-fight). */
const HAIL_CORE_MAX_SCALE = 0.92;

export function dbzColor(dbz: number | null | undefined): string {
  if (dbz == null || !Number.isFinite(dbz)) return DBZ_UNKNOWN_COLOR;
  let c = DBZ_COLOR_STOPS[0].color;
  for (const s of DBZ_COLOR_STOPS) if (dbz >= s.minDbz) c = s.color;
  return c;
}

/** Mean of the ring vertices, the closing duplicate skipped — the point MapLibre samples the terrain at. */
export function ringVertexMean(ring: ReadonlyArray<readonly [number, number]>): [number, number] | null {
  let n = ring.length;
  if (n === 0) return null;
  const first = ring[0], last = ring[n - 1];
  if (n > 1 && first[0] === last[0] && first[1] === last[1]) n -= 1;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += ring[i][0]; sy += ring[i][1]; }
  return [sx / n, sy / n];
}

/** Closed copy of a ring (`hull` of KONRAD3D is open). Fewer than 3 vertices ⇒ empty. */
export function closedRing(ring: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  if (ring.length < 3) return [];
  const out = ring.map((p) => [p[0], p[1]] as [number, number]);
  const a = out[0], b = out[out.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  return out;
}

/** Ring scaled about (cx, cy) by `f` (area × f²). Scaling in degrees keeps the shape; the area factor is exact. */
export function scaleRing(ring: ReadonlyArray<readonly [number, number]>, cx: number, cy: number, f: number): Array<[number, number]> {
  return ring.map((p) => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f] as [number, number]);
}

export interface TowerHeights {
  /** DEM height at the vertex mean (m MSL); null = terrain not loaded (towers then stand on 0 and say so). */
  groundM: number | null;
  baseMslM: number | null;
  topMslM: number | null;
  /** Above ground (true metres, not exaggerated). */
  baseAglM: number;
  topAglM: number | null;
  /** Echo base below the terrain at the vertex mean (clamped to 0). */
  baseBelowGround: boolean;
  hailTopAglM: number | null;
}

export function towerHeights(cell: Konrad3dCell, groundM: number | null): TowerHeights {
  const g = groundM != null && Number.isFinite(groundM) ? groundM : null;
  const ref = g ?? 0;
  const baseMsl = cell.echoBottomM, topMsl = cell.echoTopM;
  const rawBase = baseMsl != null ? baseMsl - ref : 0;
  const top = topMsl != null ? topMsl - ref : null;
  const hailTop = cell.hailEchoTopM != null ? cell.hailEchoTopM - ref : null;
  return {
    groundM: g,
    baseMslM: baseMsl,
    topMslM: topMsl,
    baseAglM: Math.max(0, rawBase),
    topAglM: top,
    baseBelowGround: baseMsl != null && rawBase < 0,
    hailTopAglM: hailTop,
  };
}

export function hasHail(cell: Konrad3dCell): boolean {
  return (cell.hailFlag ?? 0) >= 1 || (cell.hailAreaKm2 ?? 0) > 0;
}

/** Linear scale of the core ring and whether it rests on a measured hail area. */
export function hailCoreScale(cell: Konrad3dCell): { scale: number; areaKnown: boolean } {
  const hail = cell.hailAreaKm2, area = cell.areaKm2;
  if (hail != null && hail > 0 && area != null && area > 0) {
    return { scale: Math.min(HAIL_CORE_MAX_SCALE, Math.sqrt(Math.min(1, hail / area))), areaKnown: true };
  }
  return { scale: HAIL_CORE_FALLBACK_SCALE, areaKnown: false };
}

export type TowerKind = 'tower' | 'core';

export interface TowerFeatureProps {
  kind: TowerKind;
  id: number;
  color: string;
  /** Extrusion values (m × exaggeration) — `fill-extrusion-base` / `-height`. */
  base: number;
  height: number;
  /** Core: area measured (true) or fallback scale (false). */
  areaKnown?: boolean;
}

/** Why a cell has no tower (counted for the stage; nothing is dropped silently). */
export type TowerSkip = 'no-hull' | 'no-top' | 'top-below-ground';

export interface TowerBuild {
  fc: GeoJSON.FeatureCollection<GeoJSON.Polygon, TowerFeatureProps>;
  heights: Map<number, TowerHeights>;
  skipped: Array<{ id: number; reason: TowerSkip }>;
}

/**
 * Run → tower and core features. `groundAt(lon, lat)` returns the DEM height in m (null/NaN = unknown).
 * Order: cores first, then towers — the stage draws the core layer BELOW the tower layer so the core shows through the
 * translucent walls (spike `audit/zelltuerme-3d/spike-kern-durch-turm.png`).
 */
export function buildTowerFeatures(
  run: Konrad3dRun,
  groundAt: (lon: number, lat: number) => number | null,
  exaggeration: number = TOWER_EXAGGERATION,
): TowerBuild {
  const cores: GeoJSON.Feature<GeoJSON.Polygon, TowerFeatureProps>[] = [];
  const towers: GeoJSON.Feature<GeoJSON.Polygon, TowerFeatureProps>[] = [];
  const heights = new Map<number, TowerHeights>();
  const skipped: TowerBuild['skipped'] = [];
  for (const cell of run.cells) {
    const ring = closedRing(cell.hull);
    const mean = ring.length ? ringVertexMean(ring) : null;
    if (!mean) { skipped.push({ id: cell.id, reason: 'no-hull' }); continue; }
    const gRaw = groundAt(mean[0], mean[1]);
    const h = towerHeights(cell, gRaw != null && Number.isFinite(gRaw) ? gRaw : null);
    heights.set(cell.id, h);
    if (h.topAglM == null) { skipped.push({ id: cell.id, reason: 'no-top' }); continue; }
    if (h.topAglM <= h.baseAglM) { skipped.push({ id: cell.id, reason: 'top-below-ground' }); continue; }
    const base = h.baseAglM * exaggeration;
    const top = h.topAglM * exaggeration;
    towers.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { kind: 'tower', id: cell.id, color: dbzColor(cell.dbzMax), base, height: top },
    });
    if (hasHail(cell)) {
      const { scale, areaKnown } = hailCoreScale(cell);
      const coreTopAgl = h.hailTopAglM != null ? Math.min(h.hailTopAglM, h.topAglM) : h.topAglM;
      if (coreTopAgl > h.baseAglM) {
        cores.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [scaleRing(ring, mean[0], mean[1], scale)] },
          properties: { kind: 'core', id: cell.id, color: HAIL_CORE_COLOR, base, height: coreTopAgl * exaggeration, areaKnown },
        });
      }
    }
  }
  return { fc: { type: 'FeatureCollection', features: [...cores, ...towers] }, heights, skipped };
}
