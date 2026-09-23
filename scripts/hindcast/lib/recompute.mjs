/**
 * recompute.mjs — an INDEPENDENT second implementation of the hindcast value rules for the round-trip check V3 (b):
 * it reads the HCV1 files itself (readHcv, no LRU, no store.mjs), walks the recipe from cells/<tier>.json and
 * recomputes one plane at one (point cell, step) from the raw source values. Deliberately plain code: if this and
 * build-slots.mjs agree on a random sample, the slot says what the cache says.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readHcv } from './cellsio.mjs';
import { HINDCAST_ROOT, H } from './common.mjs';

const OMN = { t2m: 'temperature_2m', rh: 'relative_humidity_2m', u10: 'wind_u_component_10m', v10: 'wind_v_component_10m', gust: 'wind_gusts_10m', precip: 'precipitation', clct: 'cloud_cover', clcl: 'cloud_cover_low', clcm: 'cloud_cover_mid', clch: 'cloud_cover_high', msl: 'pressure_msl', ps: 'surface_pressure', snowlmt: 'snowfall_height', t925: 'temperature_925hPa', t850: 'temperature_850hPa', t700: 'temperature_700hPa', rh925: 'relative_humidity_925hPa', rh850: 'relative_humidity_850hPa', rh700: 'relative_humidity_700hPa' };
const DYNN = { t2m: 'temperature_2m', td2m: 'dew_point_temperature_2m', u10: 'wind_u_10m', v10: 'wind_v_10m', gust: 'wind_gust_10m', precip: 'precipitation_surface', clct: 'total_cloud_cover_atmosphere', clcl: 'cloud_cover_low', clcm: 'cloud_cover_medium', clch: 'cloud_cover_high', ps: 'pressure_surface', t850: 'temperature_850hpa', t925: 'temperature_925hpa' };

const memo = new Map();
function hcv(path) { if (!memo.has(path)) memo.set(path, existsSync(path) ? readHcv(path) : null); if (memo.size > 300) memo.delete(memo.keys().next().value); return memo.get(path); }

/** value of extract cell k of an Open-Meteo run file at valid time t (ms) */
function omRunVal(model, initMs, v, k, t) {
  const key = new Date(initMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
  const f = hcv(join(HINDCAST_ROOT, 'cache', model, v, 'run', `${key}.hcv.gz`));
  if (!f || !f.header.times) return undefined;
  const i = f.header.times.indexOf(t / 1000);
  if (i < 0) return undefined;
  const q = f.data[k * f.header.nt + i];
  return q === -32768 ? null : q / f.header.scale + (f.header.offset ?? 0);
}
const chunkLen = new Map();
/** Chunk length of THIS variable, read from a chunk header — it differs per variable, not just per model
 *  (V-HC-29: a per-model table sent surface_pressure lookups into the wrong chunk and made them look absent). */
function seriesChunkSeconds(model, v) {
  const key = `${model}|${v}`;
  if (!chunkLen.has(key)) {
    const dir = join(HINDCAST_ROOT, 'cache', model, v, 'series');
    let L = null;
    if (existsSync(dir)) for (const f of readdirSync(dir)) { const h = hcv(join(dir, f)); if (h) { L = h.header.chunkSeconds; break; } }
    chunkLen.set(key, L);
  }
  return chunkLen.get(key);
}
function omSeriesVal(model, v, k, t) {
  const dir = join(HINDCAST_ROOT, 'cache', model, v, 'series');
  const L = seriesChunkSeconds(model, v);
  if (!L) return undefined;
  const n = Math.floor(t / 1000 / L);
  const f = hcv(join(dir, `chunk_${n}.hcv.gz`));
  if (!f) return undefined;
  const i = (t / 1000 - f.header.times[0]) / f.header.stepSeconds;
  if (!Number.isInteger(i) || i < 0 || i >= f.header.nt) return undefined;
  const q = f.data[k * f.header.nt + i];
  return q === -32768 ? null : q / f.header.scale + (f.header.offset ?? 0);
}
function dynVal(ds, initMs, v, k, t, mi = 0) {
  const key = new Date(initMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
  const f = hcv(join(HINDCAST_ROOT, 'cache', `dyn-${ds}`, v, `${key}.hcv.gz`));
  if (!f) return undefined;
  const i = f.header.leadsH.indexOf((t - initMs) / H);
  if (i < 0) return undefined;
  const q = f.data[(k * f.header.members.length + mi) * f.header.nt + i];
  return Number.isFinite(q) ? q : null;
}

/**
 * Is there a stored surface_pressure COLUMN for this source at this valid time? build-slots.mjs resolves one column
 * reader per (source, variable, step) and derives barometrically only when that reader is absent — so the basis is
 * chosen per step, never per cell, and a block mean never mixes a stored with a derived pressure. A cell whose
 * stored value is the sentinel drops out of the mean (V-HC-28: this file decided per cell and disagreed with the
 * slot in 16 of 109 907 samples at the 05/2025 coverage edge; a per-run rule was worse still, 290).
 * `undefined` from the readers means "no file or time" = no column; `null` means the column exists, the cell does not.
 */
function psColumnExists(src, k, t) {
  const probe = src.route === 'run' ? omRunVal(src.model, src.initMs, OMN.ps, k, t) : omSeriesVal(src.model, OMN.ps, k, t);
  return probe !== undefined;
}

/** Raw quantity of ONE source cell (k) — the producer's derivations written out again, independently. */
export function sourceCellValue(src, varId, k, t, dtH, hsurf, psStored = null) {
  const { route, model, ds, initMs, member } = src;
  const get = (name) => (route === 'dyn' ? dynVal(ds, initMs, name, k, t, member ?? 0) : route === 'run' ? omRunVal(model, initMs, name, k, t) : omSeriesVal(model, name, k, t));
  if (varId === 'precip') {
    // enumerate candidate step ends in (t−Δ, t] hour by hour; a gap in the source's own step raster makes the sum invalid
    let acc = 0, any = false, prevEnd = t - dtH * H;
    const name = route === 'dyn' ? DYNN.precip : OMN.precip;
    const startOk = route === 'dyn' ? (dynVal(ds, initMs, name, k, prevEnd, member ?? 0) !== undefined || prevEnd === initMs)
      : route === 'run' ? (omRunVal(model, initMs, name, k, prevEnd) !== undefined || prevEnd === initMs)
        : omSeriesVal(model, name, k, prevEnd) !== undefined;
    if (!startOk) return null;
    for (let s = prevEnd + H; s <= t; s += H) {
      const x = route === 'dyn' ? dynVal(ds, initMs, name, k, s, member ?? 0) : route === 'run' ? omRunVal(model, initMs, name, k, s) : omSeriesVal(model, name, k, s);
      if (x === undefined) continue;
      if (x === null) return null;
      acc += route === 'dyn' ? x * 3600 * ((s - prevEnd) / H) : x;
      prevEnd = s; any = true;
    }
    if (!any || prevEnd !== t) return null;
    return acc / dtH;
  }
  if (route === 'dyn') {
    const x = get(DYNN[varId]);
    if (x == null) return null;
    return varId === 'ps' ? x / 100 : x;
  }
  if (varId === 'td2m') {
    const T = get(OMN.t2m), R = get(OMN.rh);
    if (T == null || R == null) return null;
    const r = Math.min(100, Math.max(0.1, R)), g = Math.log(r / 100) + (17.62 * T) / (243.12 + T);
    return (243.12 * g) / (17.62 - g);
  }
  if (varId === 'ps') {
    // one basis per source run, decided by the caller (omHasPs); null = decide per cell (legacy, unused)
    if (psStored === true) { const ps = get(OMN.ps); return ps == null ? null : ps; }
    if (psStored === null) { const ps = get(OMN.ps); if (ps != null) return ps; }
    const m = get(OMN.msl), T = get(OMN.t2m), h0 = hsurf?.[k];
    if (m == null || T == null || h0 == null) return null;
    const h = h0 === -999 ? 0 : h0;
    return m * Math.pow(1 - (0.0065 * h) / (T + 0.0065 * h + 273.15), 5.257);
  }
  const x = get(OMN[varId]);
  return x == null ? null : x;
}

/**
 * Cloud cover is a share of the sky, so a value outside 0…100 % is not one and drops out of the mean like an absent
 * value — the same rule as build-slots.mjs (V-HC-30: AIFS' day-0 series carries 2025-11-21…29 on a 0…10000 basis).
 * Only cloud cover: RH over 100 % and a negative snowfall height are legitimate model output.
 */
const CLOUD = new Set(['clct', 'clcl', 'clcm', 'clch']);
const plausible = (varId, v) => !CLOUD.has(varId) || (v >= -0.5 && v <= 100.5);

/** Block mean of the recipe (float32 like the producer's grid); precipitation clamped at 0 after the mean. */
export function recipeValue(src, varId, Ks, t, dtH, hsurf) {
  let s = 0, n = 0;
  const k0 = Ks.find((k) => k != null);
  const psStored = varId === 'ps' && src.route !== 'dyn' && k0 != null ? psColumnExists(src, k0, t) : null;
  for (const k of Ks) { const v = sourceCellValue(src, varId, k, t, dtH, hsurf, psStored); if (v == null || !Number.isFinite(v) || !plausible(varId, v)) continue; s += v; n++; }
  if (!n) return null;
  const m = Math.fround(s / n);
  return varId === 'precip' ? Math.max(0, m) : m;
}
