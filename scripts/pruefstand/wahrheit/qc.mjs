/**
 * qc.mjs — quality control of the truth W1 (Konzept §4). Pure functions; every rejected value is reported with a reason.
 * The checks use the measurement series, neighbours and source flags only — NEVER a forecast (plan §10).
 *
 *   formal    range per quantity on the 10-min values (placeholders are already NaN), dew point above temperature
 *   temporal  hourly jumps and stuck sensors
 *   spatial   temperature against the median of neighbours at a similar height, gross outliers only
 *
 * The limits are gross-error limits, set (not fitted) and part of protocol P1 (`protokoll.json` → `qc`).
 */
import { H, TEN, distKm } from '../lib/common.mjs';

export const W1_VARS = Object.freeze(['t', 'td', 'ws', 'dd', 'gust', 'rr', 'clct']);
export const NV = W1_VARS.length;

/** Formal check on a 10-min series (in place). `limits.range[col] = [lo, hi]`, `limits.tdAboveT` in K. */
export function qcFormal(ser, limits, reject) {
  for (const [col, [lo, hi]] of Object.entries(limits.range)) {
    const a = ser.cols[col]; if (!a) continue;
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v && (v < lo || v > hi)) { reject(ser.t0Ms + i * TEN, col, 'range', v); a[i] = NaN; } }
  }
  const t = ser.cols.t, td = ser.cols.td;
  for (let i = 0; i < t.length; i++) if (td[i] === td[i] && t[i] === t[i] && td[i] > t[i] + limits.tdAboveT) { reject(ser.t0Ms + i * TEN, 'td', 'td>t', td[i]); td[i] = NaN; }
}

/**
 * 10-min series → hourly block [nHours × NV] at the stamps fromMs + k·1 h: t, td, ws, dd = the 10-min value AT the stamp
 * (E-PS-15); gust = maximum and rr = sum of the six 10-min values in (H − 60 min, H] — NaN unless all six are present.
 */
export function toHourly(ser, clouds, fromMs, nHours) {
  const out = new Float32Array(nHours * NV).fill(NaN);
  const { t, td, ff, dd, fx, rr } = ser.cols;
  for (let k = 0; k < nHours; k++) {
    const i = (fromMs + k * H - ser.t0Ms) / TEN;
    if (i < 0 || i >= ser.n) continue;
    const o = k * NV;
    out[o] = t[i]; out[o + 1] = td[i]; out[o + 2] = ff[i]; out[o + 3] = dd[i];
    if (i >= 5) {
      let mx = -Infinity, sum = 0, okG = true, okR = true;
      for (let j = i - 5; j <= i; j++) { const g = fx[j], r = rr[j]; if (g === g) { if (g > mx) mx = g; } else okG = false; if (r === r) sum += r; else okR = false; }
      if (okG) out[o + 4] = mx;
      if (okR) out[o + 5] = Math.round(sum * 100) / 100;
    }
    if (clouds) { const c = (fromMs + k * H - clouds.t0Ms) / H; if (c >= 0 && c < clouds.n) out[o + 6] = clouds.clct[c]; }
  }
  return out;
}

/** Temporal check on one station's hourly block (in place): jumps of t/td and stuck t, td, ws. */
export function qcTemporal(hourly, nHours, fromMs, limits, reject) {
  const col = (v) => W1_VARS.indexOf(v);
  for (const v of ['t', 'td']) {
    const c = col(v), lim = limits.stepPerHour[v];
    for (let k = 1; k < nHours - 1; k++) {
      const a = hourly[(k - 1) * NV + c], b = hourly[k * NV + c], d = hourly[(k + 1) * NV + c];
      // a spike: away from BOTH neighbours by more than the limit, in the same direction
      if (a === a && b === b && d === d && Math.abs(b - a) > lim && Math.abs(b - d) > lim && (b - a) * (b - d) > 0) { reject(fromMs + k * H, v, 'spike', b); hourly[k * NV + c] = NaN; }
    }
  }
  for (const [v, hours] of Object.entries(limits.stuckHours)) {
    const c = col(v);
    let start = 0;
    for (let k = 1; k <= nHours; k++) {
      const prev = hourly[(k - 1) * NV + c], cur = k < nHours ? hourly[k * NV + c] : NaN;
      if (cur === prev && cur === cur) continue;
      const len = k - start;
      if (len >= hours && prev === prev && !(v === 'ws' && prev === 0)) for (let j = start; j < k; j++) { reject(fromMs + j * H, v, 'stuck', prev); hourly[j * NV + c] = NaN; }
      start = k;
    }
  }
}

/** Neighbour lists for the spatial check: stations within `maxKm` and `maxDElevM`. */
export function spatialNeighbours(stations, limits) {
  return stations.map((s) => stations.map((o, j) => ({ j, km: distKm(s, o), dh: o.elevM - s.elevM })).filter((o) => o.km > 0 && o.km <= limits.spatial.maxKm && Math.abs(o.dh) <= limits.spatial.maxDElevM).map((o) => ({ j: o.j, dh: o.dh })));
}
/**
 * Spatial check of the temperature at one hour over all stations (in place): against the median of the neighbours,
 * each reduced to the station's height with the standard lapse; needs `minNeighbours` values, else unchecked.
 */
export function qcSpatialHour(blocks, k, neighbours, limits, reject) {
  const { lapseKPerM, maxDevK, minNeighbours } = limits.spatial;
  const bad = [];
  for (let s = 0; s < blocks.length; s++) {
    const v = blocks[s][k * NV];
    if (v !== v) continue;
    const xs = [];
    for (const nb of neighbours[s]) { const x = blocks[nb.j][k * NV]; if (x === x) xs.push(x + lapseKPerM * nb.dh); }
    if (xs.length < minNeighbours) continue;
    xs.sort((a, b) => a - b);
    const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    if (Math.abs(v - med) > maxDevK) bad.push([s, v]);
  }
  for (const [s, v] of bad) { reject(s, 't', 'spatial', v); blocks[s][k * NV] = NaN; }
}
