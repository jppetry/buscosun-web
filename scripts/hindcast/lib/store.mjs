/**
 * store.mjs — the value layer of the AP10a hindcast: raw source values from the HCV1 cache, turned into the
 * producer's quantities at one cube cell (block mean / fill / nearest recipe from cells.mjs), with the producer's
 * derivations. Pure reads, no network.
 *
 * Producer rules mirrored here (build-point-cube.mjs, adapters/*.mjs, ensembleStats.mjs — read 19.09.):
 *   • block mean over the finite source cells of the recipe (sampleRegularToTier); fill = the neighbour cell's block;
 *   • precipitation as the RATE over the tier step Δ: (Summe[t] − Summe[t−Δ]) / Δ, clamped at 0, only when the
 *     source carries the step t−Δ (in t1 IFS/AIFS therefore never carry precipitation — their previous hour is not a
 *     step); computed on the block mean (the mean is linear, the clamp comes after);
 *   • td2m where the source has no dew point: Magnus over water a = 17.62, b = 243.12, rh clamped to [0.1, 100]
 *     (geosphere.mjs dewPointFromRh — the producer's own derivation for C-LAEF), per source cell before the mean;
 *   • ps: Open-Meteo stores no surface pressure for the ICON family and none for IFS/AIFS after 2025-05 (inventory
 *     19.09.); the hindcast derives it from pressure_msl with the source cell's own orography (HSURF.om) and t2m —
 *     the barometric form Open-Meteo itself uses — and names it a stand-in (`ps: derived-from-msl`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readHcv } from './cellsio.mjs';
import { HINDCAST_ROOT, H } from './common.mjs';

export const OM_VAR = Object.freeze({
  t2m: 'temperature_2m', rh2m: 'relative_humidity_2m', u10: 'wind_u_component_10m', v10: 'wind_v_component_10m',
  gust: 'wind_gusts_10m', precip: 'precipitation', clct: 'cloud_cover', clcl: 'cloud_cover_low', clcm: 'cloud_cover_mid',
  clch: 'cloud_cover_high', msl: 'pressure_msl', ps: 'surface_pressure', snowlmt: 'snowfall_height',
  t925: 'temperature_925hPa', t850: 'temperature_850hPa', t700: 'temperature_700hPa',
  rh925: 'relative_humidity_925hPa', rh850: 'relative_humidity_850hPa', rh700: 'relative_humidity_700hPa',
});
export const DYN_VAR = Object.freeze({
  t2m: 'temperature_2m', td2m: 'dew_point_temperature_2m', u10: 'wind_u_10m', v10: 'wind_v_10m', gust: 'wind_gust_10m',
  precip: 'precipitation_surface', clct: 'total_cloud_cover_atmosphere', clcl: 'cloud_cover_low', clcm: 'cloud_cover_medium',
  clch: 'cloud_cover_high', ps: 'pressure_surface', t850: 'temperature_850hpa', t925: 'temperature_925hpa',
});

/** Magnus over water — the producer's dewPointFromRh (scripts/point/adapters/geosphere.mjs). */
export function dewPointFromRh(tC, rhPct) {
  if (!Number.isFinite(tC) || !Number.isFinite(rhPct)) return NaN;
  const rh = Math.min(100, Math.max(0.1, rhPct));
  const a = 17.62, b = 243.12;
  const g = Math.log(rh / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}
/** Surface pressure from MSL pressure (Open-Meteo's `Meteorology.surfacePressure` form). hsurf −999 (sea) ⇒ 0 m. */
export function psFromMsl(mslHPa, t2mC, hsurfM) {
  if (!Number.isFinite(mslHPa) || !Number.isFinite(t2mC) || !Number.isFinite(hsurfM)) return NaN;
  const h = hsurfM === -999 ? 0 : hsurfM;
  return mslHPa * Math.pow(1 - (0.0065 * h) / (t2mC + 0.0065 * h + 273.15), 5.257);
}

// ─── HCV cache with a small LRU ──────────────────────────────────────────────
const LRU_MAX = 600;
const lru = new Map();
export const cacheStats = { loads: 0, hits: 0, missing: 0 };
/** Every cache file a slot reads (its fetchedAt) — createdAt of the slot is the newest of them (deterministic). */
let TRACK = null;
export function trackBegin() { TRACK = new Map(); }
export function trackEnd() { const out = [...TRACK.values()]; TRACK = null; return out; }
export function loadHcvCached(path) {
  if (lru.has(path)) { const v = lru.get(path); lru.delete(path); lru.set(path, v); cacheStats.hits++; if (TRACK && v) TRACK.set(path, v.header.fetchedAt); return v; }
  let v = null;
  if (existsSync(path)) { v = readHcv(path); cacheStats.loads++; if (TRACK) TRACK.set(path, v.header.fetchedAt); } else cacheStats.missing++;
  lru.set(path, v);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value);
  return v;
}

/** Open-Meteo HSURF at the extract cells of a grid (cells/hsurf-<model>.json from hsurf_cells.py). */
const hsurfMemo = new Map();
export function hsurfAt(model) {
  if (!hsurfMemo.has(model)) {
    const p = join(HINDCAST_ROOT, 'cells', `hsurf-${model}.json`);
    let vals = null;
    if (existsSync(p)) {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      // the values are indexed like cells/extract-<grid>.json — a stale file would shift every cell (found by V2, 19.09.)
      const ex = JSON.parse(readFileSync(join(HINDCAST_ROOT, 'cells', `extract-${doc.grid}.json`), 'utf8'));
      if (doc.cellsHash !== ex.hash) throw new Error(`hsurf-${model}.json belongs to extract hash ${doc.cellsHash}, cells are ${ex.hash} — rerun scripts/hindcast/hsurf_cells.py`);
      vals = doc.values;
    }
    hsurfMemo.set(model, vals);
  }
  return hsurfMemo.get(model);
}

// ─── source runs ─────────────────────────────────────────────────────────────
/**
 * A source run is what one source contributes to one pseudo-run: Open-Meteo `data_run` (route run), the stitched
 * day-0 series (route series) or a dynamical.org init (route dyn). `raw(var, k, validMs)` is the value of extract
 * cell k at a valid time; `steps(var)` the valid times the source carries for that variable (ms, ascending).
 */
export function omRun(model, initMs, root = HINDCAST_ROOT) {
  const key = new Date(initMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
  const files = {};
  const get = (v) => {
    if (!(v in files)) {
      const f = loadHcvCached(join(root, 'cache', model, v, 'run', `${key}.hcv.gz`));
      if (f) { const tIndex = new Map((f.header.times ?? []).map((s, i) => [s * 1000, i])); files[v] = { f, tIndex, steps: [...tIndex.keys()], set: new Set(tIndex.keys()) }; }
      else files[v] = null;
    }
    return files[v];
  };
  return {
    route: 'run', model, initMs, key,
    has: (v) => !!get(v),
    steps(v) { const x = get(v); return x ? x.steps : []; },
    stepSet(v) { const x = get(v); return x ? x.set : new Set(); },
    horizonH() { const x = get(OM_VAR.t2m); return x ? Math.max(...x.tIndex.keys()) / H - initMs / H : null; },
    raw(v, k, validMs) {
      const x = get(v); if (!x) return null;
      const t = x.tIndex.get(validMs); if (t == null) return null;
      const q = x.f.data[k * x.f.header.nt + t];
      return q === -32768 ? null : q / x.f.header.scale + (x.f.header.offset ?? 0);
    },
    provenance(v) { const x = get(v); return x ? { key: x.f.header.key, fetchedAt: x.f.header.fetchedAt } : null; },
    /** column reader for one valid time: value(k) without per-call map lookups (build-slots hot loop) */
    col(v, validMs) {
      const x = get(v); if (!x) return null;
      const ti = x.tIndex.get(validMs); if (ti == null) return null;
      const { data } = x.f, nt = x.f.header.nt, sc = x.f.header.scale, off = x.f.header.offset ?? 0;
      return (k) => { const q = data[k * nt + ti]; return q === -32768 ? null : q / sc + off; };
    },
  };
}

/** The stitched day-0 series of one model (all chunk files of a variable are opened lazily by valid time). */
export function omSeries(model, root = HINDCAST_ROOT) {
  const meta = new Map();
  const fileFor = (v, validMs) => {
    // chunk length from any cached chunk header of the variable
    let m = meta.get(v);
    if (m === undefined) {
      m = null;
      const dir = join(root, 'cache', model, v, 'series');
      if (existsSync(dir)) {
        for (const f of readdirSafe(dir)) { const h = loadHcvCached(join(dir, f)); if (h) { m = { L: h.header.chunkSeconds, step: h.header.stepSeconds }; break; } }
      }
      meta.set(v, m);
    }
    if (!m) return null;
    const n = Math.floor(validMs / 1000 / m.L);
    const f = loadHcvCached(join(root, 'cache', model, v, 'series', `chunk_${n}.hcv.gz`));
    return f ? { f, t: (validMs / 1000 - f.header.times[0]) / f.header.stepSeconds } : null;
  };
  return {
    route: 'series', model,
    has: (v) => existsSync(join(root, 'cache', model, v, 'series')),
    raw(v, k, validMs) {
      const x = fileFor(v, validMs); if (!x) return null;
      const t = x.t; if (!Number.isInteger(t) || t < 0 || t >= x.f.header.nt) return null;
      const q = x.f.data[k * x.f.header.nt + t];
      return q === -32768 ? null : q / x.f.header.scale + (x.f.header.offset ?? 0);
    },
    stepSeconds(v) { fileFor(v, 0); return meta.get(v)?.step ?? null; },
    col(v, validMs) {
      const x = fileFor(v, validMs); if (!x) return null;
      const ti = x.t; if (!Number.isInteger(ti) || ti < 0 || ti >= x.f.header.nt) return null;
      const { data } = x.f, nt = x.f.header.nt, sc = x.f.header.scale, off = x.f.header.offset ?? 0;
      return (k) => { const q = data[k * nt + ti]; return q === -32768 ? null : q / sc + off; };
    },
  };
}
function readdirSafe(dir) { try { return readdirSync(dir).filter((f) => f.endsWith('.hcv.gz')); } catch { return []; } }

/** One dynamical.org init: [cells, members, leads] float32, leadsH from the header. */
export function dynRun(ds, initMs, root = HINDCAST_ROOT) {
  const key = new Date(initMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
  const files = {};
  const get = (v) => {
    if (!(v in files)) {
      const f = loadHcvCached(join(root, 'cache', `dyn-${ds}`, v, `${key}.hcv.gz`));
      if (f) { const tIndex = new Map(f.header.leadsH.map((h, i) => [initMs + h * H, i])); files[v] = { f, tIndex, m: f.header.members.length, steps: [...tIndex.keys()], set: new Set(tIndex.keys()) }; }
      else files[v] = null;
    }
    return files[v];
  };
  return {
    route: 'dyn', ds, initMs, key,
    has: (v) => !!get(v),
    steps(v) { const x = get(v); return x ? x.steps : []; },
    stepSet(v) { const x = get(v); return x ? x.set : new Set(); },
    horizonH() { const x = get(DYN_VAR.t2m); return x ? Math.max(...x.f.header.leadsH) : null; },
    members(v) { const x = get(v); return x ? x.f.header.members : []; },
    /** member index (0 = control or the only member) */
    raw(v, k, validMs, mi = 0) {
      const x = get(v); if (!x) return null;
      const t = x.tIndex.get(validMs); if (t == null) return null;
      const q = x.f.data[(k * x.m + mi) * x.f.header.nt + t];
      return Number.isFinite(q) ? q : null;
    },
    provenance(v) { const x = get(v); return x ? { dataset: x.f.header.dataset, snapshot: x.f.header.icechunk?.snapshot, fetchedAt: x.f.header.fetchedAt } : null; },
    col(v, validMs, mi = 0) {
      const x = get(v); if (!x) return null;
      const ti = x.tIndex.get(validMs); if (ti == null) return null;
      const { data } = x.f, nt = x.f.header.nt, m = x.m;
      return (k) => { const q = data[(k * m + mi) * nt + ti]; return Number.isFinite(q) ? q : null; };
    },
  };
}
