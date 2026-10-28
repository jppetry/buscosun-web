/**
 * Phase NC-B (28.10.2026) — the CH extrapolation (`rzc-nc`) continued with buscosun Fusion: from +30 min on, every frame
 * is a mix of the shifted radar analysis and the MODEL rate at the same minute, the model weight growing linearly to 1 at
 * +120 min. The model rate per 5 min is the ICON-D2-RUC form (`ruc/v1`, t1 cells) fitted to the hourly mean of the cube
 * field of the buscosun Fusion chain (`point/field/v1/<run>/t1/precipcum-<LLL>.png`, C(L) − C(L−1)) with the rule of
 * `nowcast/rucSeries.ts` (E-RUC-4: dry / flat / form / mixed with the cap ×4) — so the hourly sums of the model are kept
 * exactly and the RUC only shapes the hour. A pure translation sees neither decay nor new cells (measured 28.10.2026
 * against MeteoSchweiz INCA: +120 min CSI 0,33, the radar area stays, INCA's shrinks to a third); the model brings both.
 *
 * Pure functions, no I/O: the producer (`scripts/radar-mirror/radar-derive.mjs`, switch `RADAR_NC_BLEND=1`, OFF by
 * default — Rule 2) decodes the products and calls `modelPlanes` + `blendFrame`; the verifier re-runs the arithmetic on
 * synthetic planes. Weights and the window are SET, not measured — `scripts/radar-nc-skill.mjs` scores the product
 * against the analyses that arrive later (persistence as the bar) before anyone switches it on.
 */

import { PRECIP_VMAX, precipToU8, precipToU8Log, precipFromU8Log } from '../scalar/RainLayer';
import { RUC_CAP_FACTOR, RUC_STEP_MS, decodeRucByte, rucPixelOffset, rucChunkOf } from '../point/rucFormat';
import { TIER_BY_ID, cellOf, type CubeTier } from '../point/cubeFormat';
import { NC_STEP_MIN, RZC_NC_LEADS } from './radarNowcastImg';

export {
  RZC_NC_BLEND_START_MIN, RZC_NC_BLEND_FULL_MIN, RZC_NC_BLEND_MODEL, RZC_NC_BLEND_LABEL, RZC_NC_BLEND_CAVEATS, RZC_NC_BLEND_WEIGHTS,
  rzcNcBlendWeight, blendOk, type RzcNcBlend,
} from './radarNowcastImg';
export const RZC_NC_BLEND_PROVENANCE: 'set' | 'measured' = 'set';

// --- model rate on the radar grid ------------------------------------------------------------------------------------

/** One RUC chunk PNG of the run, decoded (grayscale: width 256 = cells of the chunk, height = intervals). */
export interface RucChunkPlane { cy: number; cx: number; width: number; height: number; data: Uint8Array }

/**
 * Hourly mean of the model (mm/h) per t1 cell for the hour ENDING at `hourEndMs`; `null` = no value. The producer builds it
 * from two `precipcum` planes (C(L) − C(L − 1)) / stepH.
 */
export type HourMeanFn = (iy: number, ix: number, hourEndMs: number) => number | null;

const H = 3_600_000;
const PER_HOUR = H / RUC_STEP_MS;

/** The t1 cell under every rzc pixel centre (index iy·nx + ix, or −1 outside the cube domain). */
export function cellIndexPlane(w: number, h: number, lonLatAt: (u: number, v: number) => [number, number], tier: CubeTier = TIER_BY_ID.t1): Int32Array {
  const out = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [lon, lat] = lonLatAt((x + 0.5) / w, (y + 0.5) / h);
    const c = cellOf(tier, lat, lon);
    out[y * w + x] = c ? c.iy * tier.nx + c.ix : -1;
  }
  return out;
}

/**
 * Model rate (mm/h) per lead on the radar grid as `Float32Array` planes (NaN = no model value at that pixel). For every
 * t1 cell under the grid and every hour touched by the leads: the twelve RUC interval means of the hour fitted to the
 * field's hourly mean with the rule of `fitRucToFusion` (dry / flat / form / mixed). An hour with a missing RUC byte, no
 * field value or outside the RUC run has no model value (NaN) — the radar then stays alone there.
 */
export function modelPlanes(a: {
  w: number; h: number; cells: Int32Array; tier?: CubeTier;
  analysisAtMs: number; leads?: readonly number[];
  ruc: { runAtMs: number; steps: number; chunks: Map<string, RucChunkPlane> };
  hourMean: HourMeanFn;
}): { planes: Float32Array[]; cellsModel: number; cellsTotal: number; kinds: { dry: number; flat: number; form: number; mixed: number; missing: number } } {
  const tier = a.tier ?? TIER_BY_ID.t1, leads = a.leads ?? RZC_NC_LEADS;
  const kinds = { dry: 0, flat: 0, form: 0, mixed: 0, missing: 0 };
  // distinct cells under the grid
  const cellSet = new Set<number>();
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] >= 0) cellSet.add(a.cells[i]);
  const cellList = [...cellSet];
  // the hours (end times) the leads fall into
  const hourEnds = [...new Set(leads.map((l) => Math.ceil((a.analysisAtMs + l * 60_000) / H) * H))].sort((p, q) => p - q);
  // per cell: fitted mm/h per lead (NaN = none)
  const perCell = new Map<number, Float32Array>();
  let cellsModel = 0;
  const raw = new Float64Array(PER_HOUR);
  for (const cid of cellList) {
    const iy = Math.floor(cid / tier.nx), ix = cid % tier.nx;
    const { cy, cx, column } = rucChunkOf(iy, ix);
    const chunk = a.ruc.chunks.get(`${cy}_${cx}`);
    const vals = new Float32Array(leads.length).fill(NaN);
    let complete = true;
    for (const hEnd of hourEnds) {
      const start = hEnd - H;
      const f = a.hourMean(iy, ix, hEnd);
      let fitted: ((k: number) => number) | null = null;
      if (chunk && f != null && Number.isFinite(f) && start >= a.ruc.runAtMs) {
        let missing = false, r = 0;
        for (let k = 0; k < PER_HOUR; k++) {
          const step = (start - a.ruc.runAtMs) / RUC_STEP_MS + k;
          if (step >= a.ruc.steps) { missing = true; break; }
          const v = decodeRucByte(chunk.data[rucPixelOffset(column, step)]);
          if (v == null) { missing = true; break; }
          raw[k] = v; r += v;
        }
        if (!missing) {
          r /= PER_HOUR;
          const rr = Float64Array.from(raw);
          if (f <= 0) { kinds.dry++; fitted = () => 0; }
          else if (r <= 0) { kinds.flat++; fitted = () => f; }
          else if (f / r <= RUC_CAP_FACTOR) { kinds.form++; const fac = f / r; fitted = (k) => rr[k] * fac; }
          else { kinds.mixed++; const rest = f - RUC_CAP_FACTOR * r; fitted = (k) => rr[k] * RUC_CAP_FACTOR + rest; }
        }
      }
      if (!fitted) { kinds.missing++; complete = false; continue; }
      leads.forEach((l, i) => {
        const to = a.analysisAtMs + l * 60_000;
        if (to > start && to <= hEnd) vals[i] = fitted!(Math.ceil((to - start) / RUC_STEP_MS) - 1);
      });
    }
    if (complete) cellsModel++;
    perCell.set(cid, vals);
  }
  const planes = leads.map((_, li) => {
    const p = new Float32Array(a.w * a.h).fill(NaN);
    for (let i = 0; i < a.cells.length; i++) { const c = a.cells[i]; if (c >= 0) { const v = perCell.get(c); if (v) p[i] = v[li]; } }
    return p;
  });
  return { planes, cellsModel, cellsTotal: cellList.length, kinds };
}

// --- the mix ------------------------------------------------------------------------------------------------------------

/** mm/h of a v1 byte (`precipToU8` inverse, 0 for dry). */
export const precipFromU8 = (u: number): number => (u > 0 ? (u / 255) * PRECIP_VMAX : 0);

/**
 * Mix one frame: `out = (1 − w) · radar + w · model` in mm/h, re-encoded; where the model has no value (NaN) or `w = 0` the
 * radar bytes pass unchanged (byte-identical at w = 0). The log plane, when given, is read for the radar rate (finer than
 * the v1 byte) and both planes are written from the SAME mixed rate — one wet mask (threshold 0,06 of both codecs).
 * Unknown pixels (`unknown` 255) stay 0 in both planes. Returns the number of pixels the model changed.
 */
export function blendFrame(a: {
  w: number; radar: Uint8Array; radarLog?: Uint8Array | null; model: Float32Array; unknown?: Uint8Array | null;
  out: Uint8Array; outLog?: Uint8Array | null;
}): number {
  const n = a.radar.length;
  if (!(a.w > 0) || !(a.w <= 1)) {
    if (a.w <= 0) { a.out.set(a.radar); if (a.outLog && a.radarLog) a.outLog.set(a.radarLog); return 0; }
    throw new Error(`blendFrame: weight ${a.w}`);
  }
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const m = a.model[i];
    if (a.unknown && a.unknown[i] === 255) { a.out[i] = 0; if (a.outLog) a.outLog[i] = 0; continue; }
    if (!Number.isFinite(m)) { a.out[i] = a.radar[i]; if (a.outLog && a.radarLog) a.outLog[i] = a.radarLog[i]; continue; }
    const r = a.radarLog ? precipFromU8Log(a.radarLog[i]) : precipFromU8(a.radar[i]);
    const v = (1 - a.w) * r + a.w * m;
    const u = precipToU8(v);
    if (u !== a.radar[i]) changed++;
    a.out[i] = u;
    if (a.outLog) a.outLog[i] = precipToU8Log(v);
  }
  return changed;
}

/** Lead → interval index k of the RUC run (the interval ENDING at the lead's validity), or −1 outside the run. */
export function rucStepOf(runAtMs: number, steps: number, validAtMs: number): number {
  const k = Math.ceil((validAtMs - runAtMs) / RUC_STEP_MS) - 1;
  return k >= 0 && k < steps ? k : -1;
}

export { NC_STEP_MIN };
