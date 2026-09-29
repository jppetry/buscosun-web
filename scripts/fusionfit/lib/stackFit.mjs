/**
 * stackFit.mjs — the fitted station-value candidates of phase FS (`audit/fusion-stationswert.md` §2.2): MOSMIX as the backbone,
 * corrected by the persistence of its own innovation, a bias and the difference to the learned member,
 *
 *     value = M + b + w·I + c·(L − M)
 *
 * fitted by least squares on r = y − M per (variable, τ group) and LEAVE-DAY-OUT WITH A PURGE: the parameters of a row with valid
 * day D come from the rows whose valid day is outside [D − 1, D + 1] — the same truth stands under several issue days, so leaving
 * out the issue day alone would leak. Pure; the sums are kept per (key, valid day), a fold is a subtraction.
 */

// the forms, the groups and the value: ONE definition for the fit and the engine (src/pointForecast/fusion/stationValue.ts)
import { TAU_GROUPS, tauGroup, tauLabel, FORMS, formOf, stackValue, stackDist } from '../../../src/pointForecast/fusion/stationValue.ts';
export { TAU_GROUPS, tauGroup, tauLabel, FORMS, formOf, stackValue, stackDist };

export const MIN_ROWS = 200;
export const PURGE_DAYS = 1;

/** Sums of the normal equations per (key, valid day). */
export class FoldSums {
  constructor() { this.byKey = new Map(); }
  add(key, day, x, r) {
    const p = x.length;
    let k = this.byKey.get(key); if (!k) { k = { p, days: new Map(), total: null }; this.byKey.set(key, k); }
    let d = k.days.get(day); if (!d) { d = { n: 0, A: new Float64Array(p * p), b: new Float64Array(p), rr: 0 }; k.days.set(day, d); }
    d.n += 1; d.rr += r * r;
    for (let i = 0; i < p; i++) { d.b[i] += x[i] * r; for (let j = 0; j < p; j++) d.A[i * p + j] += x[i] * x[j]; }
    k.total = null;
  }
  /** The fit of a key without the valid days [day − purge, day + purge]; `day = null` ⇒ in-sample. */
  fit(key, day, { purge = PURGE_DAYS, minRows = MIN_ROWS } = {}) {
    const k = this.byKey.get(key);
    if (!k) return null;
    const cacheKey = `${day == null ? 'all' : day}|${purge}|${minRows}`;
    if (!k.cache) k.cache = new Map();
    if (k.total == null) { k.cache.clear(); k.total = true; }
    if (k.cache.has(cacheKey)) return k.cache.get(cacheKey);
    const p = k.p, A = new Float64Array(p * p), b = new Float64Array(p);
    let n = 0, rr = 0;
    for (const [d, s] of k.days) {
      if (day != null && Math.abs(d - day) <= purge) continue;
      n += s.n; rr += s.rr;
      for (let i = 0; i < p; i++) b[i] += s.b[i];
      for (let i = 0; i < p * p; i++) A[i] += s.A[i];
    }
    let out;
    if (n < minRows) out = { n, beta: new Array(p).fill(0), sigma: n ? Math.sqrt(rr / n) : null, written: false };
    else {
      const beta = solve(A, b, p);
      if (!beta) out = { n, beta: new Array(p).fill(0), sigma: Math.sqrt(rr / n), written: false };
      else {
        let bAb = 0, bb = 0;
        for (let i = 0; i < p; i++) { bb += beta[i] * b[i]; for (let j = 0; j < p; j++) bAb += beta[i] * A[i * p + j] * beta[j]; }
        out = { n, beta, sigma: Math.sqrt(Math.max(1e-12, (rr - 2 * bb + bAb) / n)), written: true };
      }
    }
    k.cache.set(cacheKey, out);
    return out;
  }
}

/** Gaussian elimination with partial pivoting; null when the system is singular. */
export function solve(A0, b0, p) {
  const A = Float64Array.from(A0), b = Float64Array.from(b0);
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r * p + c]) > Math.abs(A[piv * p + c])) piv = r;
    if (!(Math.abs(A[piv * p + c]) > 1e-12)) return null;
    if (piv !== c) { for (let j = 0; j < p; j++) { const t = A[c * p + j]; A[c * p + j] = A[piv * p + j]; A[piv * p + j] = t; } const t = b[c]; b[c] = b[piv]; b[piv] = t; }
    for (let r = c + 1; r < p; r++) {
      const f = A[r * p + c] / A[c * p + c];
      if (f === 0) continue;
      for (let j = c; j < p; j++) A[r * p + j] -= f * A[c * p + j];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(p).fill(0);
  for (let r = p - 1; r >= 0; r--) { let s = b[r]; for (let j = r + 1; j < p; j++) s -= A[r * p + j] * x[j]; x[r] = s / A[r * p + r]; }
  return x.every(Number.isFinite) ? x : null;
}

const R = 6371.0088;
export function haversineKm(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180, a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
