/**
 * GL-2 — pure core of the satellite line: mask rule, snow classification, snow line, AAR, albedo, flags. No network, no files:
 * the scanner (`sat-scan.mjs`) feeds it windows of one scene and the verifier (`verify:glacier-sat`) feeds it stored real windows.
 *
 * A "pack" is one glacier window on the 20 m grid of the scene:
 *   { w, h, mask: Uint8Array (1 inside the outline), elev: Float32Array (m, NaN unknown), scl: Uint8Array,
 *     green, swir: Float32Array (surface reflectance, NaN where the raw value is 0 = no data),
 *     blue?, red?, nir?, swir2?: Float32Array (only read for scenes that pass the clear rule) }
 *
 * Decisions (audit/gletscher.md §2.5, §6.2): SCL 0, 1, 2, 3, 8, 9, 10 are invalid; no SWIR rescue (a thin ice cloud has NDSI > 0.4
 * and B11 < 0.12 — rescuing it would invent snow); a scene counts at ≥ 70 % clear pixels; snow = NDSI > 0.4 with green ≥ 0.45 (snow/firn against
 * glacier ice, see the constant);
 * snow line = the elevation that best separates snow above from non-snow below (minimum misfit — at that elevation the snow share of
 * a 50 m band crosses 50 %), range = every threshold within 2 % of the clear pixels of the minimum.
 */
import {
  GLACIER_SAT_MIN_CLEAR, GLACIER_NDSI_SNOW, GLACIER_SNOW_GREEN_MIN, GLACIER_SNOW_COVERED_MIN, GLACIER_SNOW_FREE_MAX, GLACIER_SLA_MARGIN_M,
} from '../../../src/glacier/glacierSatContract.ts';

/** Sen2Cor scene classes treated as invalid inside a glacier mask. */
export const SCL_INVALID = Object.freeze([0, 1, 2, 3, 8, 9, 10]);
const INVALID = new Uint8Array(256);
for (const c of SCL_INVALID) INVALID[c] = 1;
export const GLACIER_MISFIT_BAND = 0.02;
export const GLACIER_MIN_ALBEDO_PX = 20;
export const GLACIER_MIN_ELEV_PX = 30;
/** Thresholds of the shadow flag (low sun in September/October). */
export const GLACIER_SHADOW_SUN_DEG = 30;
export const GLACIER_SHADOW_SHARE = 0.15;
/** Liang (2001) narrowband-to-broadband coefficients for Sentinel-2 B02, B04, B08, B11, B12 (Landsat TM 1, 3, 4, 5, 7). */
export const LIANG = Object.freeze({ b02: 0.356, b04: 0.13, b08: 0.373, b11: 0.085, b12: 0.072, c: -0.0018 });

/**
 * Reflectance of a raw DN; raw 0 is no data. **No offset:** the STAC asset announces `offset: -0.1` (the +1000 of processing baseline 04.00), but
 * the COGs of Earth Search carry DN = reflectance × 10 000 — measured on seven scenes of baselines 04.00 … 05.12 (HEF window, Ötztal forest):
 * red DN of the forest pixels (SCL 4) has p50 430–700 and p5 170–310 (with the offset more than half of them would be negative reflectance),
 * the snow B11 p50 is 90–600 DN (with the offset it would be −0.04 … −0.09) and the NDSI of the offset-corrected values exceeds 1 over snow.
 * `scanScene` therefore passes `S2_OFFSET = 0` and checks every scene against the opposite assumption (`dnOffsetSuspect`).
 */
export const S2_SCALE = 0.0001;
export const S2_OFFSET = 0;
export function reflect(dn, scale = S2_SCALE, offset = S2_OFFSET) {
  const out = new Float32Array(dn.length);
  for (let i = 0; i < dn.length; i++) { if (dn[i] === 0) { out[i] = NaN; continue; } const v = dn[i] * scale + offset; out[i] = v < 0 ? 0 : v; }
  return out;
}

/** Clear pixels (inside the mask, SCL valid, bands present) and the shadow/cloud shares of the whole mask. */
export function validity(p) {
  const n = p.w * p.h;
  const clear = new Uint8Array(n);
  let nMask = 0, nClear = 0, nShadow = 0, nCloud = 0;
  for (let i = 0; i < n; i++) {
    if (!p.mask[i]) continue;
    nMask++;
    const c = p.scl[i];
    if (c === 2 || c === 3) nShadow++;
    if (c === 8 || c === 9 || c === 10) nCloud++;
    if (INVALID[c]) continue;
    if (!(p.green[i] >= 0) || !(p.swir[i] >= 0)) continue;
    clear[i] = 1; nClear++;
  }
  return { clear, nMask, nClear, share: nMask ? nClear / nMask : 0, shadowShare: nMask ? nShadow / nMask : 0, cloudShare: nMask ? nCloud / nMask : 0 };
}

/** NDSI snow decision on the clear pixels. A near-zero band sum gives NaN (never snow). */
export function snowMap(p, clear) {
  const n = p.w * p.h, snow = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!clear[i]) continue;
    const g = p.green[i], s = p.swir[i], sum = g + s;
    if (!(sum > 0.02)) continue;
    if ((g - s) / sum > GLACIER_NDSI_SNOW && g >= GLACIER_SNOW_GREEN_MIN) snow[i] = 1;
  }
  return snow;
}

/**
 * Snow line by minimum misfit. Returns null when fewer than `GLACIER_MIN_ELEV_PX` clear pixels carry an elevation, else
 * { sla, lo, hi, n, snowShare } with sla = middle of the best thresholds.
 */
export function snowLine(p, clear, snow) {
  const idx = [];
  for (let i = 0; i < p.w * p.h; i++) if (clear[i] && Number.isFinite(p.elev[i])) idx.push(i);
  const n = idx.length;
  if (n < GLACIER_MIN_ELEV_PX) return null;
  idx.sort((a, b) => p.elev[a] - p.elev[b]);
  const e = idx.map((i) => p.elev[i]);
  const s = idx.map((i) => snow[i]);
  let snowTotal = 0;
  for (const v of s) snowTotal += v;
  const nonTotal = n - snowTotal;
  // misfit(k) for the threshold between pixel k-1 and k: snow below + non-snow at/above
  const misfit = new Float64Array(n + 1);
  let snowCum = 0, nonCum = 0;
  misfit[0] = nonTotal;
  for (let k = 1; k <= n; k++) { if (s[k - 1]) snowCum++; else nonCum++; misfit[k] = snowCum + (nonTotal - nonCum); }
  let best = Infinity;
  for (let k = 0; k <= n; k++) if (misfit[k] < best) best = misfit[k];
  const ks = [];
  for (let k = 0; k <= n; k++) if (misfit[k] === best) ks.push(k);
  const kMid = ks[Math.floor(ks.length / 2)];
  const thr = (k) => (k <= 0 ? e[0] : k >= n ? e[n - 1] : (e[k - 1] + e[k]) / 2);
  let kLo = kMid, kHi = kMid;
  const limit = best + GLACIER_MISFIT_BAND * n;
  for (let k = 0; k <= n; k++) if (misfit[k] <= limit) { if (k < kLo) kLo = k; if (k > kHi) kHi = k; }
  return { sla: Math.round(thr(kMid)), lo: Math.round(thr(kLo)), hi: Math.round(thr(kHi)), n, snowShare: snowTotal / n };
}

/**
 * Guard against a changed encoding, evaluated per SCENE: when the DN did carry the +1000 offset, the darkest SWIR pixels of every glacier window
 * (snow, ice, shadow) would read ≥ 0.1 instead of ≈ 0.01–0.05. `swirP01` is the 1st percentile of one window's clear B11 reflectance; the scene is
 * suspect when the median over ≥ 5 windows is ≥ 0.08. (One rock-covered glacier alone can have no dark pixel — hence not per glacier.)
 */
export function swirP01(p, clear) {
  const v = [];
  for (let i = 0; i < p.w * p.h; i++) if (clear[i] && p.swir[i] >= 0) v.push(p.swir[i]);
  if (v.length < 100) return null;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length * 0.01)];
}
export function sceneEncodingSuspect(p01s) {
  const v = p01s.filter((x) => x != null).sort((a, b) => a - b);
  return v.length >= 5 && v[Math.floor(v.length / 2)] >= 0.08;
}

/** Share of the mask pixels (all, cloud or not) at/above an elevation. */
export function areaAbove(p, z) {
  let n = 0, above = 0;
  for (let i = 0; i < p.w * p.h; i++) {
    if (!p.mask[i] || !Number.isFinite(p.elev[i])) continue;
    n++; if (p.elev[i] >= z) above++;
  }
  return n ? above / n : null;
}

/** Mean broadband albedo of the snow pixels and of the other clear pixels (needs blue, red, nir, swir2 in the pack). */
export function albedo(p, clear, snow) {
  if (!p.blue || !p.red || !p.nir || !p.swir2) return { snow: null, ice: null };
  const acc = [0, 0, 0, 0];
  for (let i = 0; i < p.w * p.h; i++) {
    if (!clear[i]) continue;
    const a = LIANG.b02 * p.blue[i] + LIANG.b04 * p.red[i] + LIANG.b08 * p.nir[i] + LIANG.b11 * p.swir[i] + LIANG.b12 * p.swir2[i] + LIANG.c;
    if (!Number.isFinite(a) || a < 0 || a > 1.2) continue;
    const j = snow[i] ? 0 : 2;
    acc[j] += a; acc[j + 1]++;
  }
  const mean = (s, c) => (c >= GLACIER_MIN_ALBEDO_PX ? Math.round((s / c) * 1000) / 1000 : null);
  return { snow: mean(acc[0], acc[1]), ice: mean(acc[2], acc[3]) };
}

/**
 * One glacier in one scene → { value } or { skipped: reason }. `meta` = { klass: 'A' | 'B', debris, sunElevation }.
 * `needBands()` is called once the clear rule is met and must fill blue/red/nir/swir2 of the pack (lazy: the albedo bands are only
 * downloaded for scenes that count).
 */
export async function evaluateGlacier(p, meta, needBands = null) {
  const v = validity(p);
  if (!v.nMask) return { skipped: 'keine Maskenpixel' };
  if (v.share < GLACIER_SAT_MIN_CLEAR) return { skipped: `Klaranteil ${(v.share * 100).toFixed(0)} % < 70 %`, validity: v };
  const snow = snowMap(p, v.clear);
  const line = snowLine(p, v.clear, snow);
  let nSnow = 0;
  for (let i = 0; i < snow.length; i++) nSnow += snow[i];
  const snowShare = v.nClear ? nSnow / v.nClear : 0;
  if (needBands) await needBands(p);
  const alb = albedo(p, v.clear, snow);
  const flags = [];
  if ((meta.sunElevation != null && meta.sunElevation < GLACIER_SHADOW_SUN_DEG) || v.shadowShare >= GLACIER_SHADOW_SHARE) flags.push('schatten');
  if (meta.debris != null && meta.debris >= 2) flags.push('schutt');
  const state = snowShare >= GLACIER_SNOW_COVERED_MIN ? 'snow-covered' : snowShare <= GLACIER_SNOW_FREE_MAX ? 'snow-free' : 'snowline';
  const out = { clear: Math.round(v.share * 1000) / 1000, snow: Math.round(snowShare * 1000) / 1000, state, flags };
  if (alb.snow != null || alb.ice != null) out.alb = alb;
  if (meta.klass === 'A') {
    if (state === 'snowline') {
      if (!line) return { skipped: 'zu wenige Pixel mit Höhe für die Schneegrenze', validity: v };
      out.sla = line.sla; out.slaLo = line.lo; out.slaHi = line.hi;
      out.aar = Math.round((areaAbove(p, line.sla) ?? 0) * 1000) / 1000;
    } else out.aar = state === 'snow-covered' ? 1 : 0;
  }
  return { value: out, validity: v, line, swirP01: swirP01(p, v.clear) };
}

/** Is a snow line believable for the glacier's own elevation range? (B1-5, applied before anything is written.) */
export const slaInRange = (sla, z) => sla >= z[0] - GLACIER_SLA_MARGIN_M && sla <= z[2] + GLACIER_SLA_MARGIN_M;
