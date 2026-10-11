/**
 * GL-3 — pure core of the melt line: the enhanced temperature index per 50 m band (Pellicciotti et al. 2005) exactly as calibrated in
 * `scripts/glacier/py/gate_c.py` (the verifier compares the two on a real glacier-year), the clear-sky radiation with the cloud factor for the forecast
 * chain, and the scenario sums (no quantiles added). No network, no files.
 *
 * Every constant below is either `literature`, `set` (documented in audit/gletscher/gate-c-method-frozen.md) or comes from the calibration (`params.json`).
 */
export const MELT = Object.freeze({
  gamma: -0.0065,        // K/m, standard lapse (literature)
  bIce: 0.85,            // damping of positive temperatures over the glacier (literature)
  tT: 1.0,               // °C melt threshold (literature)
  fsWarm: 2.0, fsCold: 0.0,   // solid fraction = clip((2 − T)/2, 0, 1) (set)
  pGrad: 0.04,           // precipitation increase per 100 m (set)
  aFresh: 0.85, aFirnSnow: 0.55, aIce: 0.30, aFirn: 0.50, // literature
  tauH: 6 * 24,          // snow albedo decay (literature)
  sweMin: 5.0,           // mm: below, the surface is ice or firn
});

/** Bands of one glacier from the hypsometry (`z0`, `a` km² per 50 m): mid elevations and area weights (bands without area dropped). */
export function bandsOf(h) {
  const zb = [], a = [];
  h.a.forEach((v, i) => { if (v > 0) { zb.push(h.z0 + 50 * (i + 0.5)); a.push(v); } });
  const s = a.reduce((x, y) => x + y, 0);
  return { zb, w: a.map((v) => v / s) };
}

/** Initial snow state: no snow, snow albedo at the aged value. */
export const emptyState = (nb) => ({ swe: new Float64Array(nb), aS: new Float64Array(nb).fill(MELT.aFirnSnow) });

/**
 * One run of the band model over `n` hours.
 *   t, g, p     hourly temperature [°C] at the reference elevation zT, global radiation [W m⁻²], precipitation [mm] at zP (NaN = missing)
 *   pf, TF, SRF parameters (`model: 'ddf'` uses `ddf` instead)
 * Returns the glacier-wide hourly melt (mm w.e.), the band balance (solid precipitation − melt), the end state and the glacier-wide melt sum.
 */
export function simulate({ bands, ela, t, g, p, zT, zP, pf, TF, SRF, ddf = null, state, model = 'eti', accumulateOnly = false }) {
  const nb = bands.zb.length, n = t.length;
  const swe = Float64Array.from(state.swe), aS = Float64Array.from(state.aS);
  const bal = new Float64Array(nb);
  const meltH = new Float64Array(n);
  const decay = Math.exp(-1 / MELT.tauH);
  const aBare = bands.zb.map((z) => (z < ela ? MELT.aIce : MELT.aFirn));
  const corr = bands.zb.map((z) => 1 + (MELT.pGrad * (z - zP)) / 100);
  for (let h = 0; h < n; h++) {
    const th = t[h], ph = Number.isFinite(p[h]) ? p[h] : 0, gh = Number.isFinite(g?.[h]) ? g[h] : 0;
    let mh = 0;
    for (let b = 0; b < nb; b++) {
      const Tb = th + MELT.gamma * (bands.zb[b] - zT);
      const fs = Number.isNaN(Tb) ? 0.5 : Math.min(1, Math.max(0, (MELT.fsWarm - Tb) / (MELT.fsWarm - MELT.fsCold)));
      const S = pf * ph * corr[b] * fs;
      swe[b] += S;
      aS[b] = S > 0 ? aS[b] + (MELT.aFresh - aS[b]) * Math.min(1, S / 5) : MELT.aFirnSnow + (aS[b] - MELT.aFirnSnow) * decay;
      let melt = 0;
      if (!accumulateOnly && !Number.isNaN(th)) {
        if (model === 'eti') {
          const Ti = Tb <= 0 ? Tb : MELT.bIce * Tb;
          const alb = swe[b] > MELT.sweMin ? aS[b] : aBare[b];
          melt = Ti > MELT.tT ? TF * Ti + SRF * (1 - alb) * gh : 0;
        } else melt = ddf * (swe[b] > 0 ? 1 : 1.6) * Math.max(Tb, 0);
      }
      swe[b] -= Math.min(swe[b], melt);
      bal[b] += S - melt;
      mh += bands.w[b] * melt;
    }
    meltH[h] = mh;
  }
  const meltSum = meltH.reduce((x, y) => x + y, 0);
  return { meltH, bal, state: { swe, aS }, meltSum, balance: bands.w.reduce((s, w, b) => s + w * bal[b], 0) };
}

// --- radiation for the forecast chain (no measured radiation there) -------------------------------------------------------------

/** cos of the solar zenith angle at lat/lon [deg] and time [ms UTC] (declination and equation of time after Spencer 1971). */
export function cosZenith(latDeg, lonDeg, tMs) {
  const d = new Date(tMs);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  const gam = (2 * Math.PI / 365) * (doy - 1 + (d.getUTCHours() - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(gam) - 0.032077 * Math.sin(gam) - 0.014615 * Math.cos(2 * gam) - 0.040849 * Math.sin(2 * gam));
  const decl = 0.006918 - 0.399912 * Math.cos(gam) + 0.070257 * Math.sin(gam) - 0.006758 * Math.cos(2 * gam) + 0.000907 * Math.sin(2 * gam) - 0.002697 * Math.cos(3 * gam) + 0.00148 * Math.sin(3 * gam);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const solarMin = minutes + eqt + 4 * lonDeg;
  const ha = ((solarMin / 4) - 180) * Math.PI / 180;
  const lat = latDeg * Math.PI / 180;
  return Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
}
/** Clear-sky global radiation on a horizontal surface (Haurwitz 1945) with a mild elevation gain, W m⁻² (`set`). */
export function clearSky(cosz, zM) {
  if (!(cosz > 0.01)) return 0;
  return 1098 * cosz * Math.exp(-0.059 / cosz) * (1 + 6e-5 * Math.max(0, zM));
}
/** Cloud factor after Kasten & Czeplak (1980): N cloud fraction 0…1. */
export const cloudFactor = (n) => 1 - 0.75 * Math.pow(Math.min(1, Math.max(0, n)), 3.4);

// --- scenario sums (no addition of quantiles) ----------------------------------------------------------------------------------------

/** Deterministic xorshift for the scenario seeds (a run is reproducible from its id). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function gauss(r) { return Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r()); }
/**
 * T-paths for the scenarios: T_s(h) = T50(h) + σ(h) · z_s(h) with an AR(1) noise of hourly correlation `rho` (`set`). The sum of a scenario is the melt of
 * ITS path; the spread of the sums is the quantile of the sums, never a sum of hourly quantiles.
 */
export function scenarioPaths(t50, sigma, k, rho, seed) {
  const r = rng(seed);
  const out = [];
  for (let s = 0; s < k; s++) {
    const path = new Float64Array(t50.length);
    let z = gauss(r);
    for (let h = 0; h < t50.length; h++) { z = rho * z + Math.sqrt(1 - rho * rho) * gauss(r); path[h] = t50[h] + (sigma[h] ?? 0) * z; }
    out.push(path);
  }
  return out;
}
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
