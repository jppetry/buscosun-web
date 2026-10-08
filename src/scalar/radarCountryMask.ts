/**
 * Phase HD-1 — ownership mask of a country radar grid (`audit/radar-hochaufloesung.md` §5).
 *
 * The composite decides per 600 × 512 cell which country's radar it shows (`PrecipCompositor.country`, rule `pickCountry`
 * = box where only one box holds, else the border, V-FR-9/V-FR-11). HD draws each radar on its OWN grid, so the same
 * decision is needed per native pixel: `countryMaskForGrid` returns 1 where `pickCountry` at the pixel centre is the
 * grid's own country, 0 elsewhere. The `RainLayer` reads it as a second texture (NEAREST) and discards the rest.
 *
 * Pure and worker-safe (`precipIndexWorker`): the pixel centres of a projected grid are not inverted one by one
 * (1,32 M `psInv` ≈ 2,7 s) but refined bicubically from an exact 64² grid like the warp meshes (`warpMeshFromProjection`,
 * error ≤ 18 mm, §15.4 of `audit/karten-layer-verortung.md`), and the country test buckets the border edges by latitude
 * band — the same edges, the same even–odd test, the same box rule as `pickCountry` (`verify:radar-hd` compares the two on
 * the real grids, pixel for pixel).
 */

import { COUNTRY_PROFILES } from '../countryProfiles';
import { COUNTRY_BORDERS } from '../pointForecast/countryBorders';
import type { Country } from '../types';
import { de1200Node } from '../sources/radolanGeo';
import { incaNodeFn } from '../sources/geosphereIncaGeo';
import { rzcNodeFn } from '../sources/meteoSwissGeo';
import { WARP_COARSE_N } from './quadWarpMesh';
import type { QuadCorners } from './RainLayer';

/** The three projected radar grids (same names as `GridKind` of the index map, without `lonlat`). */
export type HdGridKind = 'radolan' | 'inca' | 'rzc';
export const HD_GRID_COUNTRY: Readonly<Record<HdGridKind, Country>> = Object.freeze({ radolan: 'DE', inca: 'AT', rzc: 'CH' });

const COUNTRIES: readonly Country[] = ['DE', 'AT', 'CH'];
/** Latitude band of the edge buckets in 1e-4° units (0,01°). */
const BAND = 100;

type Picker = (lat: number, lng: number) => Country;
let _picker: Picker | null = null;

/**
 * `pickCountry` for many points of arbitrary latitude: the border edges of each country bucketed by latitude band,
 * the box rule as in `countryRowPicker` (first largest slack wins). Same formulas, same order ⇒ same answer.
 */
export function fastCountryPicker(): Picker {
  if (_picker) return _picker;
  const buckets = COUNTRIES.map((c) => {
    const edges: number[] = [];
    for (const r of COUNTRY_BORDERS[c]) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) edges.push(r[i], r[i + 1], r[j], r[j + 1]);
    let yMin = Infinity, yMax = -Infinity;
    for (let e = 1; e < edges.length; e += 2) { if (edges[e] < yMin) yMin = edges[e]; if (edges[e] > yMax) yMax = edges[e]; }
    const y0 = Math.floor(yMin / BAND), nb = Math.floor(yMax / BAND) - y0 + 1;
    const lists: number[][] = Array.from({ length: nb }, () => []);
    for (let e = 0; e < edges.length; e += 4) {
      const a = Math.floor(Math.min(edges[e + 1], edges[e + 3]) / BAND), b = Math.floor(Math.max(edges[e + 1], edges[e + 3]) / BAND);
      for (let bi = a; bi <= b; bi++) lists[bi - y0].push(e);
    }
    return { edges: Float64Array.from(edges), y0, nb, lists: lists.map((l) => Int32Array.from(l)) };
  });
  const B = COUNTRIES.map((c) => COUNTRY_PROFILES[c].bounds);
  const slack = new Float64Array(COUNTRIES.length);
  _picker = (lat: number, lng: number): Country => {
    let boxes = 0, best = 0, bestSlack = -Infinity;
    for (let k = 0; k < COUNTRIES.length; k++) {
      const b = B[k];
      const s = Math.min(lat - b.latMin, b.latMax - lat, lng - b.lngMin, b.lngMax - lng);
      slack[k] = s;
      if (s >= 0) boxes++;
      if (s > bestSlack) { bestSlack = s; best = k; }
    }
    if (boxes >= 2) {
      const x = lng * 1e4, y = lat * 1e4;
      for (let k = 0; k < COUNTRIES.length; k++) {
        if (slack[k] < 0) continue;
        const bk = buckets[k];
        const bi = Math.floor(y / BAND) - bk.y0;
        if (bi < 0 || bi >= bk.nb) continue;   // no edge reaches this latitude ⇒ not inside
        let inside = false;
        const L = bk.lists[bi], E = bk.edges;
        for (let q = 0; q < L.length; q++) {
          const e = L[q];
          const xi = E[e], yi = E[e + 1], xj = E[e + 2], yj = E[e + 3];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return COUNTRIES[k];
      }
    }
    return COUNTRIES[best];
  };
  return _picker;
}

/** Exact lon/lat of the grid point (u, v) of a projected radar grid (the node functions of the geo modules). */
export function gridNodeFn(kind: HdGridKind, corners: QuadCorners): (u: number, v: number) => [number, number] {
  if (kind === 'radolan') return de1200Node;          // the DE1200 grid is constant (`DE1200_CORNERS`)
  if (kind === 'inca') return incaNodeFn(corners);
  return rzcNodeFn(corners);
}

function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/**
 * Sampler of a projected grid at ANY (u, v): an exact `coarse`² grid (+ ghost ring) of `node`, refined bicubically
 * (Catmull-Rom) — the scheme of `warpMeshFromProjection`, usable at cell centres instead of mesh nodes.
 */
export function projectedSampler(node: (u: number, v: number) => [number, number], coarse: number = WARP_COARSE_N): (u: number, v: number) => [number, number] {
  const S = coarse + 3;
  const c = new Float64Array(S * S * 2);
  for (let j = -1; j <= coarse + 1; j++) for (let i = -1; i <= coarse + 1; i++) {
    const ll = node(i / coarse, j / coarse), k = ((j + 1) * S + (i + 1)) * 2;
    c[k] = ll[0]; c[k + 1] = ll[1];
  }
  return (u, v) => {
    const fy = v * coarse, cy = Math.min(coarse - 1, Math.max(0, Math.floor(fy))), wy = catmullRom(fy - cy);
    const fx = u * coarse, cx = Math.min(coarse - 1, Math.max(0, Math.floor(fx))), wx = catmullRom(fx - cx);
    let lon = 0, lat = 0;
    for (let b = 0; b < 4; b++) {
      const row = (cy + b) * S + cx;
      let rlo = 0, rla = 0;
      for (let a = 0; a < 4; a++) { const k = (row + a) * 2; rlo += wx[a] * c[k]; rla += wx[a] * c[k + 1]; }
      lon += wy[b] * rlo; lat += wy[b] * rla;
    }
    return [lon, lat];
  };
}

/**
 * Ownership mask of a radar grid: `cols × rows` bytes, 1 where the pixel centre belongs to the grid's country by
 * `pickCountry`, else 0. ≈ 100 ms for DE1200 (1,32 M pixels) — meant for the worker, correct on the main thread too.
 */
export function countryMaskForGrid(kind: HdGridKind, corners: QuadCorners, cols: number, rows: number): Uint8Array {
  const own = HD_GRID_COUNTRY[kind];
  const at = projectedSampler(gridNodeFn(kind, corners));
  const pick = fastCountryPicker();
  const out = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows;
    for (let col = 0; col < cols; col++) {
      const [lon, lat] = at((col + 0.5) / cols, v);
      if (pick(lat, lon) === own) out[r * cols + col] = 1;
    }
  }
  return out;
}
