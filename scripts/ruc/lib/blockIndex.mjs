/**
 * blockIndex.mjs — block-mean sampling of an unstructured (triangular ICON) grid onto a cube tier (phase RUC, T2).
 *
 * Membership rule: a source cell belongs to the tier cell whose centre is nearest, i.e. `cellOf(tier, lat, lon)` — the same
 * rounding the readers use. ICON-D2-RUC (2.2 km) on t1 (0.05° ≈ 3.5 × 5.5 km) puts 2–6 source cells into one tier cell;
 * the nearest-cell sampling of `sample.mjs` would pick ONE of them by the chance of a grid line (V-RUC-5). The index is CSR:
 * `offsets[k]…offsets[k+1]` are the source indices of tier cell k. Built once per grid signature, sampling is one pass.
 * Pure: no network, no file system.
 */
import { cellOf } from '../../../src/point/cubeFormat.ts';
import { fillNearest } from '../../point/adapters/sample.mjs';

/** Cheap identity of a grid: count plus first and last centre. */
export function blockIndexSignature(lat, lon) {
  const n = lat.length;
  if (!n) return '0';
  const f = (x) => Number(x).toFixed(5);
  return `${n}:${f(lat[0])},${f(lon[0])}:${f(lat[n - 1])},${f(lon[n - 1])}`;
}

/**
 * @param cellLat/cellLon centres in degrees (any array-like)
 * @param tier            cube tier (`TIER_BY_ID.t1`)
 * @param srcIdx          optional: index of cell j in the SOURCE field (when lat/lon are a filtered subset)
 */
export function buildBlockMeanIndex(cellLat, cellLon, tier, srcIdx = null) {
  const nCells = tier.ny * tier.nx;
  const counts = new Int32Array(nCells);
  const target = new Int32Array(cellLat.length).fill(-1);
  for (let j = 0; j < cellLat.length; j++) {
    const c = cellOf(tier, cellLat[j], cellLon[j]);
    if (!c) continue;
    const k = c.iy * tier.nx + c.ix;
    target[j] = k;
    counts[k]++;
  }
  const offsets = new Int32Array(nCells + 1);
  for (let k = 0; k < nCells; k++) offsets[k + 1] = offsets[k] + counts[k];
  const cells = new Int32Array(offsets[nCells]);
  const cursor = Int32Array.from(offsets.subarray(0, nCells));
  for (let j = 0; j < cellLat.length; j++) {
    const k = target[j];
    if (k < 0) continue;
    cells[cursor[k]++] = srcIdx ? srcIdx[j] : j;
  }
  return { offsets, cells, hits: cells.length, signature: blockIndexSignature(cellLat, cellLon) };
}

/**
 * Mean of the finite source values of each tier cell; `NaN` without a finite member. With `fill`, holes take the nearest
 * occupied neighbour within `maxRings` (same rule as the regular adapters), farther holes stay `NaN` (⇒ byte 0).
 */
export function sampleBlockMean(values, idx, tier, { fill = true, maxRings = 3 } = {}) {
  const nCells = tier.ny * tier.nx;
  const out = new Float32Array(nCells);
  const { offsets, cells } = idx;
  for (let k = 0; k < nCells; k++) {
    let sum = 0, n = 0;
    for (let o = offsets[k]; o < offsets[k + 1]; o++) {
      const v = values[cells[o]];
      if (Number.isFinite(v)) { sum += v; n++; }
    }
    out[k] = n ? sum / n : NaN;
  }
  return fill ? fillNearest(out, tier, maxRings) : out;
}
