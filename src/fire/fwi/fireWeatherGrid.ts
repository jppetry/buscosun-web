/**
 * Hourly fire weather on a raster — the per-cell chain of `fwi.ts` over
 * subsampled ICON-D2 fields (Phase WF2, `audit/waldbrand-forecast.md` §9).
 *
 * This module is the PURE half of the raster producer: it takes already-decoded
 * Float32 fields of one forecast step (all on the same grid, already
 * subsampled) and advances the FFMC state one hour, returning ISI/FWI/FFMC
 * grids plus a mask. Fetching, run selection and canvas rasterisation live in
 * `src/sources/iconD2FireWeather.ts` (browser). Keeping the math here means the
 * cell arithmetic is verifiable in Node against the point chain (`hffmcChain`)
 * — one cell must equal one point (D-12).
 *
 * Units in: ICON-D2 native — `t2mK` Kelvin, `rh` %, `u`/`v` m/s, `totPrec`
 * kg/m² accumulated since model start, `hSnow` m. Units out: FWI convention.
 *
 * Honesty rules:
 *  • RH `NaN` (GRIB bitmap = outside the domain) ⇒ mask 0, never a value.
 *  • Snow cover (`snowMasked`) ⇒ mask 0 — the index is not run over snow.
 *  • Rain for the first step needs the previous step's accumulation; if it is
 *    missing the step is computed with 0 mm and flagged `rain-unknown`.
 *  • Without wind the step yields no ISI/FWI (`no-wind`) — ISI needs wind by
 *    definition; we do not invent a wind.
 *  • Without a daily BUI grid (Stufe 1, no batch yet) `fwi` is `null` — the
 *    caller shows ISI and says so. FWI is never faked from ISI alone.
 */

import { hffmc, hffmcChain, isi, fwi, ffmcEquilibrium, snowMasked } from './fwi';

export interface FireWeatherStepFields {
  /** Forecast step (hours since model start). */
  stepHours: number;
  /** Valid time (ms since epoch). */
  validAtMs: number;
  /** relative humidity 2 m, % — the domain anchor (NaN = outside). */
  rh: Float32Array;
  /** temperature 2 m, K */
  t2mK: Float32Array;
  /** wind components 10 m, m/s (null = not available for this step) */
  u: Float32Array | null;
  v: Float32Array | null;
  /** total precipitation, kg/m² accumulated since model start (null = missing) */
  totPrec: Float32Array | null;
  /** accumulation of the PREVIOUS step (null = unknown ⇒ rain 0, flagged) */
  totPrecPrev: Float32Array | null;
  /** snow depth, m (null = no mask applied) */
  hSnow: Float32Array | null;
}

export type FireWeatherNote = 'rain-unknown' | 'no-wind';

export interface FireWeatherStepResult {
  /** FWI per cell (null when no daily BUI grid was given). NaN where masked. */
  fwi: Float32Array | null;
  /** ISI per cell, NaN where masked. */
  isi: Float32Array;
  /** FFMC per cell at the END of this hour — this IS the `state` array (no copy). */
  ffmc: Float32Array;
  /** 1 = valid cell, 0 = outside domain / snow / no data. */
  mask: Uint8Array;
  notes: FireWeatherNote[];
}

/** m/s → km/h (FWI wind unit). */
export const MS_TO_KMH = 3.6;
/** ICON-D2 `t_2m` is Kelvin. */
export const KELVIN_OFFSET = 273.15;

/**
 * Initial FFMC state per cell for the FIRST step of a chain.
 * With yesterday's codes (WF5) this will become the Lawson diurnal start;
 * until then: the equilibrium band mid at (T, RH) of the first hour, and `NaN`
 * outside the domain. `buiGrid` is accepted so the signature does not change
 * when the diurnal start arrives.
 */
export function initFfmcState(first: FireWeatherStepFields, _buiGrid: Float32Array | null): Float32Array {
  const n = first.rh.length;
  const state = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const rh = first.rh[k];
    const t = first.t2mK[k] - KELVIN_OFFSET;
    state[k] = Number.isFinite(rh) && Number.isFinite(t) ? ffmcEquilibrium(t, rh) : NaN;
  }
  return state;
}

/** Output buffers a caller may pre-allocate to process one step in slices. */
export interface FireWeatherStepBuffers { isi: Float32Array; fwi: Float32Array | null; mask: Uint8Array }

export function allocFireWeatherBuffers(n: number, withFwi: boolean): FireWeatherStepBuffers {
  return { isi: new Float32Array(n), fwi: withFwi ? new Float32Array(n) : null, mask: new Uint8Array(n) };
}

/**
 * Advance the chain by ONE step for every cell in `[from, to)` (default: all).
 * `state` holds the FFMC of the previous step and is overwritten with this
 * step's FFMC in place, so the caller keeps a single Float32Array across the
 * whole horizon. Slicing (`from`/`to` + shared `out` buffers) lets the browser
 * producer yield to the main thread between slices — a full 608×373 step costs
 * ~90 ms in one go (measured, `verify:fire-weather-grid`), which would be a
 * long task; four slices are not. The math is identical either way.
 */
export function stepFireWeather(
  state: Float32Array,
  f: FireWeatherStepFields,
  buiGrid: Float32Array | null,
  out?: FireWeatherStepBuffers,
  from = 0,
  to = f.rh.length,
): FireWeatherStepResult {
  const n = f.rh.length;
  if (state.length !== n || f.t2mK.length !== n) throw new Error('fireWeatherGrid: grid size mismatch');
  const notes: FireWeatherNote[] = [];
  const hasWind = !!f.u && !!f.v && f.u.length === n && f.v.length === n;
  if (!hasWind) notes.push('no-wind');
  const hasRain = !!f.totPrec && f.totPrec.length === n;
  const hasPrev = hasRain && !!f.totPrecPrev && f.totPrecPrev.length === n;
  if (hasRain && !hasPrev) notes.push('rain-unknown');
  const hasSnow = !!f.hSnow && f.hSnow.length === n;
  const hasBui = !!buiGrid && buiGrid.length === n;

  const buf = out ?? allocFireWeatherBuffers(n, hasBui);
  if (buf.isi.length !== n || buf.mask.length !== n || (hasBui && (!buf.fwi || buf.fwi.length !== n))) {
    throw new Error('fireWeatherGrid: output buffer size mismatch');
  }
  const isiOut = buf.isi;
  const fwiOut = hasBui ? buf.fwi : null;
  const mask = buf.mask;
  const lo = Math.max(0, from), hi = Math.min(n, to);

  for (let k = lo; k < hi; k++) {
    const rh = f.rh[k];
    const t = f.t2mK[k] - KELVIN_OFFSET;
    let prev = state[k];
    if (!Number.isFinite(rh) || !Number.isFinite(t) || (hasSnow && snowMasked(f.hSnow![k]))) {
      // outside the domain or under snow: no value, no state advance
      state[k] = Number.isFinite(rh) && Number.isFinite(t) ? prev : NaN;
      isiOut[k] = NaN; if (fwiOut) fwiOut[k] = NaN; mask[k] = 0;
      continue;
    }
    // A cell that was masked before (NaN state) starts from equilibrium now.
    if (!Number.isFinite(prev)) prev = ffmcEquilibrium(t, rh);
    let r1h = 0;
    if (hasPrev) {
      const d = f.totPrec![k] - f.totPrecPrev![k];
      r1h = Number.isFinite(d) && d > 0 ? d : 0;
    }
    const w = hasWind ? MS_TO_KMH * Math.hypot(f.u![k], f.v![k]) : 0;
    const ffmcNow = hffmc(prev, t, rh, w, r1h);
    state[k] = ffmcNow;
    if (!hasWind || !Number.isFinite(ffmcNow)) {
      isiOut[k] = NaN; if (fwiOut) fwiOut[k] = NaN; mask[k] = 0;
      continue;
    }
    const i = isi(ffmcNow, w);
    isiOut[k] = i;
    if (fwiOut) fwiOut[k] = fwi(i, buiGrid![k]);
    mask[k] = 1;
  }
  return { fwi: fwiOut, isi: isiOut, ffmc: state, mask, notes };
}

// ---------------------------------------------------------------------------
// Self-verification (synthetic grids, DOM-free)
// ---------------------------------------------------------------------------

export interface FireWeatherGridCheck { name: string; ok: boolean; detail?: string }

export function verifyFireWeatherGrid(): { checks: FireWeatherGridCheck[]; passed: number; total: number } {
  const checks: FireWeatherGridCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const cells = 4;
  const mk = (rh: number[], tC: number[], u: number[] | null, v: number[] | null,
    tp: number[] | null, tpPrev: number[] | null, snow: number[] | null, step = 0): FireWeatherStepFields => ({
    stepHours: step, validAtMs: step * 3_600_000,
    rh: Float32Array.from(rh), t2mK: Float32Array.from(tC.map((x) => x + KELVIN_OFFSET)),
    u: u ? Float32Array.from(u) : null, v: v ? Float32Array.from(v) : null,
    totPrec: tp ? Float32Array.from(tp) : null, totPrecPrev: tpPrev ? Float32Array.from(tpPrev) : null,
    hSnow: snow ? Float32Array.from(snow) : null,
  });

  // Cell ↔ point parity: cell 0 must reproduce hffmc/isi computed by hand.
  const f0 = mk([40, 60, NaN, 40], [22, 18, 20, 22], [3, 1, 0, 3], [4, 0, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0.05]);
  const st = initFfmcState(f0, null);
  const startCell0 = st[0];
  const r = stepFireWeather(st, f0, null);
  const wKmh = MS_TO_KMH * 5;
  const expF = hffmc(startCell0, 22, 40, wKmh, 0);
  add('cell 0 FFMC equals point hffmc', Math.abs(r.ffmc[0] - expF) < 1e-4, `${r.ffmc[0]} vs ${expF}`);
  add('cell 0 ISI equals point isi', Math.abs(r.isi[0] - isi(expF, wKmh)) < 1e-4);
  add('start state is equilibrium mid at (T, RH) (Float32)', Math.abs(startCell0 - ffmcEquilibrium(22, 40)) < 1e-3);
  add('outside domain (RH NaN) ⇒ mask 0, ISI NaN, state NaN', r.mask[2] === 0 && Number.isNaN(r.isi[2]) && Number.isNaN(r.ffmc[2]));
  add('snow 5 cm ⇒ mask 0 although weather is valid', r.mask[3] === 0 && Number.isNaN(r.isi[3]));
  add('valid cells masked 1', r.mask[0] === 1 && r.mask[1] === 1);
  add('no BUI ⇒ fwi null (never faked)', r.fwi === null);
  add('drier cell has higher ISI (cell 0 vs cell 1: 40 % / 60 %)', r.isi[0] > r.isi[1]);

  // Rain delta: 3 mm in the hour lowers FFMC vs. dry; negative delta counts as 0.
  const stA = initFfmcState(f0, null); const stB = initFfmcState(f0, null);
  const dry = stepFireWeather(stA, mk([40, 40, 40, 40], [22, 22, 22, 22], [3, 3, 3, 3], [4, 4, 4, 4], [5, 5, 5, 5], [5, 5, 5, 8], null), null);
  const wet = stepFireWeather(stB, mk([40, 40, 40, 40], [22, 22, 22, 22], [3, 3, 3, 3], [4, 4, 4, 4], [8, 8, 8, 8], [5, 5, 5, 5], null), null);
  add('3 mm rain in the hour lowers FFMC and ISI', wet.ffmc[0] < dry.ffmc[0] && wet.isi[0] < dry.isi[0]);
  add('negative accumulation delta counts as 0 mm', Math.abs(dry.ffmc[3] - dry.ffmc[0]) < 1e-6);
  add('rain-unknown flagged when previous accumulation is missing',
    stepFireWeather(initFfmcState(f0, null), mk([40, 40, 40, 40], [22, 22, 22, 22], [3, 3, 3, 3], [4, 4, 4, 4], [5, 5, 5, 5], null, null), null).notes.includes('rain-unknown'));
  const nw = stepFireWeather(initFfmcState(f0, null), mk([40, 40, 40, 40], [22, 22, 22, 22], null, null, null, null, null), null);
  add('no wind ⇒ no-wind note, ISI NaN, mask 0, but FFMC state still advances', nw.notes.includes('no-wind') && Number.isNaN(nw.isi[0]) && nw.mask[0] === 0 && Number.isFinite(nw.ffmc[0]));

  // With a BUI grid FWI appears and grows with BUI.
  const bLow = Float32Array.from([10, 10, 10, 10]); const bHigh = Float32Array.from([80, 80, 80, 80]);
  const fl = stepFireWeather(initFfmcState(f0, null), f0, bLow); const fh = stepFireWeather(initFfmcState(f0, null), f0, bHigh);
  add('with BUI grid: fwi present and grows with BUI', !!fl.fwi && !!fh.fwi && fh.fwi[0] > fl.fwi[0]);
  add('fwi equals point fwi(isi, bui)', !!fl.fwi && Math.abs(fl.fwi[0] - fwi(fl.isi[0], 10)) < 1e-4);

  // Chain over 3 steps equals hffmcChain at the point.
  {
    const hours = [{ t: 22, rh: 40, w: wKmh, r1h: 0 }, { t: 24, rh: 35, w: wKmh, r1h: 0 }, { t: 23, rh: 45, w: wKmh, r1h: 1 }];
    const state = initFfmcState(f0, null);
    const s0 = state[0];
    let last: FireWeatherStepResult | null = null;
    let acc = 0;
    let prevAcc = 0;
    hours.forEach((h, i) => {
      prevAcc = acc; acc += h.r1h;
      last = stepFireWeather(state, mk([h.rh, 40, NaN, 40], [h.t, 22, 20, 22], [3, 3, 0, 3], [4, 4, 0, 4], [acc, 0, 0, 0], [prevAcc, 0, 0, 0], null, i), null);
    });
    const chain = Array.from(hffmcChain(s0, hours));
    const got = last!.ffmc[0];
    add('3-step cell chain equals hffmcChain at the point', Math.abs(got - chain[2]) < 1e-4, `${got} vs ${chain[2]}`);
  }

  // Slicing must give the same result as one pass.
  {
    const s1 = initFfmcState(f0, null); const s2 = initFfmcState(f0, null);
    const whole = stepFireWeather(s1, f0, null);
    const buf = allocFireWeatherBuffers(cells, false);
    stepFireWeather(s2, f0, null, buf, 0, 2);
    const sliced = stepFireWeather(s2, f0, null, buf, 2, cells);
    const same = Array.from(whole.isi).every((v, i) => (Number.isNaN(v) && Number.isNaN(sliced.isi[i])) || Math.abs(v - sliced.isi[i]) < 1e-6)
      && Array.from(whole.mask).every((v, i) => v === sliced.mask[i]);
    add('two slices equal one pass', same);
  }
  add('grid size mismatch throws', (() => { try { stepFireWeather(new Float32Array(2), f0, null); return false; } catch { return true; } })());
  add(`cells in fixture = ${cells}`, f0.rh.length === cells);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
