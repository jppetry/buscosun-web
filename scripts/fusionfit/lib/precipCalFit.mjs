/**
 * precipCalFit.mjs — the fit of buscosun Fusion 8's wet-probability recalibration (phase AX §6l): a probit regression
 * P(wet) = Φ(a + b·z), z = Φ⁻¹(p_wet of Fusion 7), per key (situation × lead group), by Fisher scoring; leave-day-out with a
 * purge of ±PURGE valid days (the card) or in-sample (the table). Rows are kept per key as compact arrays — the fit per
 * held-out day re-runs on the remaining rows (12 keys × ~17 days × ≤ 100 k rows, a few seconds).
 *
 *   const F = new ProbitFolds(); F.add(key, validDay, z, wet01); F.fit(key, validDay | null) → { n, wet, a, b, written, iterations }
 */
import { Phi, PhiInv, phi } from '../../../src/pointForecast/fusion/dist.ts';
import { PRECIP_CAL_MIN_ROWS, PRECIP_CAL_MIN_WET, PRECIP_CAL_IDENTITY } from '../../../src/pointForecast/fusion/precipCal.ts';

export const PURGE = 1;
const P_EPS = 1e-9;

/** Probit regression of wet ~ a + b·z by Fisher scoring; null when it does not converge. */
export function probitFit(z, wet, mask = null) {
  let a = 0, b = 1, ll = -Infinity, iterations = 0;
  const logLik = (a0, b0) => {
    let s = 0;
    for (let i = 0; i < z.length; i++) { if (mask && !mask[i]) continue; const p = Math.min(1 - P_EPS, Math.max(P_EPS, Phi(a0 + b0 * z[i]))); s += wet[i] ? Math.log(p) : Math.log(1 - p); }
    return s;
  };
  ll = logLik(a, b);
  for (let it = 0; it < 40; it++) {
    iterations = it + 1;
    // Fisher scoring: X'WX θ_new = X'W (η + (y − p)/(φ)·…) — written directly with the score and the expected information
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < z.length; i++) {
      if (mask && !mask[i]) continue;
      const eta = a + b * z[i];
      const p = Math.min(1 - P_EPS, Math.max(P_EPS, Phi(eta))), d = phi(eta);
      const w = (d * d) / (p * (1 - p));                // expected information weight
      const s = ((wet[i] - p) * d) / (p * (1 - p));     // score contribution (per unit x)
      g0 += s; g1 += s * z[i];
      h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 1e-12)) return null;
    let da = (h11 * g0 - h01 * g1) / det, db = (-h01 * g0 + h00 * g1) / det;
    // damped step: halve until the log-likelihood does not fall
    let step = 1, a2 = a + da, b2 = b + db, ll2 = logLik(a2, b2), tries = 0;
    while (ll2 < ll - 1e-9 && tries < 12) { step /= 2; a2 = a + step * da; b2 = b + step * db; ll2 = logLik(a2, b2); tries += 1; }
    if (tries >= 12 && ll2 < ll - 1e-9) break;
    const conv = Math.abs(a2 - a) < 1e-7 && Math.abs(b2 - b) < 1e-7;
    a = a2; b = b2; ll = ll2;
    if (conv) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > 0)) return null;
  return { a, b, logLik: ll, iterations };
}

export class ProbitFolds {
  constructor() { this.byKey = new Map(); }
  add(key, day, z, wet) {
    let k = this.byKey.get(key);
    if (!k) { k = { z: [], wet: [], day: [], cache: new Map(), frozen: null }; this.byKey.set(key, k); }
    k.z.push(z); k.wet.push(wet ? 1 : 0); k.day.push(day); k.frozen = null;
  }
  /** The fit without the valid days [day − purge, day + purge]; `day = null` ⇒ in-sample. Identity (unwritten) below the minimums or without convergence. */
  fit(key, day, { purge = PURGE, minRows = PRECIP_CAL_MIN_ROWS, minWet = PRECIP_CAL_MIN_WET } = {}) {
    const k = this.byKey.get(key);
    if (!k) return null;
    if (!k.frozen) { k.frozen = { z: Float64Array.from(k.z), wet: Uint8Array.from(k.wet), day: Int32Array.from(k.day) }; k.cache.clear(); }
    const cacheKey = `${day == null ? 'all' : day}|${purge}|${minRows}|${minWet}`;
    if (k.cache.has(cacheKey)) return k.cache.get(cacheKey);
    const { z, wet, day: days } = k.frozen;
    let mask = null, n = 0, nWet = 0;
    if (day != null) { mask = new Uint8Array(z.length); for (let i = 0; i < z.length; i++) { if (Math.abs(days[i] - day) > purge) { mask[i] = 1; n += 1; nWet += wet[i]; } } }
    else { n = z.length; for (let i = 0; i < z.length; i++) nWet += wet[i]; }
    let out;
    if (n < minRows || nWet < minWet || n - nWet < minWet) out = { ...PRECIP_CAL_IDENTITY, n, wet: nWet };
    else {
      const f = probitFit(z, wet, mask);
      out = f ? { n, wet: nWet, a: f.a, b: f.b, written: true, iterations: f.iterations } : { ...PRECIP_CAL_IDENTITY, n, wet: nWet };
    }
    k.cache.set(cacheKey, out);
    return out;
  }
}

/** Self-test: a synthetic too-dry forecast is recovered (a > 0 pulls the low end up; identity data give a ≈ 0, b ≈ 1). */
export function selfTest(seed = 7) {
  let s = seed >>> 0; const rnd = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const n = 40000, z = new Float64Array(n), wet = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const zt = -2 + 3 * rnd(); z[i] = zt; const pTrue = Phi(0.4 + 1.2 * zt); wet[i] = rnd() < pTrue ? 1 : 0; }
  const f = probitFit(z, wet);
  const zi = new Float64Array(n), wi = new Uint8Array(n);
  for (let i = 0; i < n; i++) { zi[i] = -2 + 3 * rnd(); wi[i] = rnd() < Phi(zi[i]) ? 1 : 0; }
  const g = probitFit(zi, wi);
  return { recovered: f, identity: g, ok: !!f && Math.abs(f.a - 0.4) < 0.06 && Math.abs(f.b - 1.2) < 0.08 && !!g && Math.abs(g.a) < 0.05 && Math.abs(g.b - 1) < 0.06 };
}
