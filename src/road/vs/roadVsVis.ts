/**
 * AW-6.2.6 — visibility of the virtual road sensor (`audit/autobahnwetter.md` §20.12): now from measurements (GMA after QC,
 * neighbours only within |Δz| ≤ 100 m and the same terrain class), ahead as PROBABILITIES P(V < 1 000 / 300 / 150 / 50 m) from a
 * logistic combination of (a) an own diagnosis V = min(V_Nebel, V_Feuchte, V_Niederschlag) on the forcing fields, (b) MOSMIX
 * visibility of the representative station (`vs` of road/fc) and (c) RUC VIS until 30.11.2026 (spike 20.2 i: removed by the
 * DWD afterwards, E-VS-6 extended §20.3). The weights are `set` until the logistic regression against the DWD hourly
 * visibility of the climate stations (CDC, 204 stations) has run (`fitVisLogistic`, 6.2.8); the file names them `uncalibrated`.
 * Fog level 3 (< 50 m) is never claimed from a model alone (Startprompt: „Nebel Stufe 3 nur aus Messung").
 */

export const VS_VIS_THRESHOLDS_M: readonly number[] = Object.freeze([1000, 300, 150, 50]);
/** Koschmieder: V = 3,912 / β (contrast 2 %). */
export const KOSCHMIEDER = 3.912;
/** Gultepe et al. (2006): V (km) = 1,002 / (LWC·N_d)^0,6473 with LWC in g/m³ and N_d in cm⁻³; N_d 200 cm⁻³ (Startprompt). */
export const VS_FOG = Object.freeze({ a: 1.002, b: 0.6473, ndCm3: 200 });
/** Rain β (km⁻¹) = 2,24·C^0,75, snow β = 10,36·C^0,7776 with C in mm/h (Startprompt, `literature`). */
export const VS_PRECIP_BETA = Object.freeze({ rainA: 2.24, rainB: 0.75, snowA: 10.36, snowB: 0.7776 });
/** Humidity haze (`set`, to replace by the CDC fit): V_Feuchte = 20 km above 2 K dew-point depression, falling linearly to 1 km at 0 K. */
export const VS_HAZE = Object.freeze({ clearKm: 20, spreadK: 2, wetKm: 1 });
/** Measurement neighbours (Startprompt): |Δz| ≤ 100 m and the same terrain class; radius `set`. */
export const VS_VIS_NEIGHBOUR = Object.freeze({ dzM: 100, radiusKm: 15 });
export const VS_VIS_MAX_M = 50_000;

/** Fog visibility (m) from the cloud-water mixing ratio (mg/kg) of the lowest model layer and the air density. */
export function fogVisibilityM(qcMgKg: number | null, rhoAir = 1.25): number | null {
  if (qcMgKg == null || !(qcMgKg > 0)) return null;
  const lwc = (qcMgKg / 1e6) * rhoAir * 1000; // g/m³
  const vKm = VS_FOG.a / Math.pow(lwc * VS_FOG.ndCm3, VS_FOG.b);
  return Math.round(Math.min(VS_VIS_MAX_M, vKm * 1000));
}
/** Visibility (m) in precipitation by Koschmieder over the rain/snow extinction. */
export function precipVisibilityM(rainMmH: number, snowMmH: number): number | null {
  let beta = 0;
  if (rainMmH > 0) beta += VS_PRECIP_BETA.rainA * Math.pow(rainMmH, VS_PRECIP_BETA.rainB);
  if (snowMmH > 0) beta += VS_PRECIP_BETA.snowA * Math.pow(snowMmH, VS_PRECIP_BETA.snowB);
  if (!(beta > 0)) return null;
  return Math.round(Math.min(VS_VIS_MAX_M, (KOSCHMIEDER / beta) * 1000));
}
export function hazeVisibilityM(tC: number | null, tdC: number | null): number | null {
  if (tC == null || tdC == null) return null;
  const spread = Math.max(0, tC - tdC);
  if (spread >= VS_HAZE.spreadK) return VS_HAZE.clearKm * 1000;
  return Math.round((VS_HAZE.wetKm + (VS_HAZE.clearKm - VS_HAZE.wetKm) * (spread / VS_HAZE.spreadK)) * 1000);
}
/** Own diagnosis V = min of the three (m); null when nothing is known. */
export function diagnoseVisibilityM(x: { qcMgKg: number | null; rain: number; snow: number; tC: number | null; tdC: number | null }): { vM: number | null; limiting: 'nebel' | 'feuchte' | 'niederschlag' | null } {
  const parts: Array<[number | null, 'nebel' | 'feuchte' | 'niederschlag']> = [[fogVisibilityM(x.qcMgKg), 'nebel'], [hazeVisibilityM(x.tC, x.tdC), 'feuchte'], [precipVisibilityM(x.rain, x.snow), 'niederschlag']];
  let best: [number, 'nebel' | 'feuchte' | 'niederschlag'] | null = null;
  for (const [v, who] of parts) if (v != null && (!best || v < best[0])) best = [v, who];
  return best ? { vM: best[0], limiting: best[1] } : { vM: null, limiting: null };
}

// --- Probabilities ---------------------------------------------------------------------------------

/** Logistic weights per threshold: P = σ(b0 + Σ b_i · ln(V_i / x)); v1 `set` equal weights, slope −1,5 per source, named uncalibrated. */
export interface VsVisModel { calibrated: boolean; thresholds: number[]; weights: Record<string, number[]>; intercept: number[] }
export const VS_VIS_DEFAULT_MODEL: VsVisModel = Object.freeze({
  calibrated: false, thresholds: [...VS_VIS_THRESHOLDS_M],
  weights: { diag: [-1.5, -1.5, -1.5, -1.5], mos: [-1.5, -1.5, -1.5, -1.5], ruc: [-1.5, -1.5, -1.5, -1.5] },
  intercept: [0, 0, 0, 0],
}) as VsVisModel;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export interface VsVisSources { diag: number | null; mos: number | null; ruc: number | null }
/**
 * P(V < x) per threshold from the available sources (missing sources drop out, the remaining weights are renormalised to the
 * same total as the full set so a single source still gives a usable probability). `null` when no source is there.
 */
export function visibilityProbabilities(src: VsVisSources, model: VsVisModel = VS_VIS_DEFAULT_MODEL): number[] | null {
  const keys = (Object.keys(src) as Array<keyof VsVisSources>).filter((k) => src[k] != null && Number.isFinite(src[k] as number) && (src[k] as number) > 0);
  if (!keys.length) return null;
  const all = Object.keys(model.weights).length;
  return model.thresholds.map((x, i) => {
    const total = Object.values(model.weights).reduce((s, w) => s + Math.abs(w[i]), 0);
    const present = keys.reduce((s, k) => s + Math.abs(model.weights[k][i]), 0);
    const scale = present > 0 ? total / present : 1;
    let z = model.intercept[i];
    for (const k of keys) z += model.weights[k][i] * scale * Math.log(Math.max(1, src[k] as number) / x);
    void all;
    return Math.round(sigmoid(z) * 1000) / 1000;
  });
}

/** Fog level 3 (< 50 m) only from a measurement: the forecast probability of the last threshold is capped (`set` 0,5). */
export const VS_VIS_P50_FORECAST_CAP = 0.5;
export function capForecastProbabilities(p: number[] | null): number[] | null {
  if (!p) return null;
  const out = [...p];
  out[3] = Math.min(out[3], VS_VIS_P50_FORECAST_CAP);
  return out;
}

// --- Now: measurements ---------------------------------------------------------------------------------

export interface VsVisObs { id: string; lat: number; lon: number; h: number | null; terrain: string; visM: number }
/** Visibility now at a point: own GMA value, else the nearest neighbour within reach, same terrain class and |Δz| ≤ 100 m. */
export function visibilityNow(me: { id: string; lat: number; lon: number; h: number | null; terrain: string }, obs: readonly VsVisObs[]): { visM: number; from: string; dKm: number } | null {
  const own = obs.find((o) => o.id === me.id);
  if (own) return { visM: own.visM, from: own.id, dKm: 0 };
  const cosLat = Math.cos((me.lat * Math.PI) / 180);
  let best: { visM: number; from: string; dKm: number } | null = null;
  for (const o of obs) {
    if (o.terrain !== me.terrain || me.h == null || o.h == null || Math.abs(o.h - me.h) > VS_VIS_NEIGHBOUR.dzM) continue;
    const dy = (o.lat - me.lat) * 111.2, dx = (o.lon - me.lon) * 111.2 * cosLat;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > VS_VIS_NEIGHBOUR.radiusKm) continue;
    if (!best || d < best.dKm) best = { visM: o.visM, from: o.id, dKm: Math.round(d * 10) / 10 };
  }
  return best;
}

// --- Calibration (6.2.8) -------------------------------------------------------------------------------

export interface VsVisPair { sources: VsVisSources; observedM: number }
/**
 * Logistic regression per threshold by gradient descent on pairs (source visibilities → observed visibility < x), one weight
 * per source on ln(V/x) plus an intercept; pairs lacking a source are skipped for that source's gradient (the renormalisation
 * of `visibilityProbabilities` handles missing sources at prediction time). Returns a calibrated model with Brier per threshold.
 */
export function fitVisLogistic(pairs: readonly VsVisPair[], { iterations = 400, rate = 0.05 } = {}): { model: VsVisModel; brier: number[]; n: number } {
  const keys: Array<keyof VsVisSources> = ['diag', 'mos', 'ruc'];
  const weights: Record<string, number[]> = { diag: [0, 0, 0, 0], mos: [0, 0, 0, 0], ruc: [0, 0, 0, 0] };
  const intercept = [0, 0, 0, 0];
  const brier = [0, 0, 0, 0];
  VS_VIS_THRESHOLDS_M.forEach((x, i) => {
    const rows = pairs.map((p) => ({ y: p.observedM < x ? 1 : 0, f: keys.map((k) => (p.sources[k] != null && (p.sources[k] as number) > 0 ? Math.log(Math.max(1, p.sources[k] as number) / x) : null)) }));
    let b0 = 0; const b = [0, 0, 0];
    for (let it = 0; it < iterations; it++) {
      let g0 = 0; const g = [0, 0, 0];
      for (const r of rows) {
        let z = b0; let used = 0;
        r.f.forEach((v, j) => { if (v != null) { z += b[j] * v; used++; } });
        if (!used) continue;
        const e = sigmoid(z) - r.y;
        g0 += e; r.f.forEach((v, j) => { if (v != null) g[j] += e * v; });
      }
      b0 -= (rate * g0) / rows.length; for (let j = 0; j < 3; j++) b[j] -= (rate * g[j]) / rows.length;
    }
    intercept[i] = Math.round(b0 * 1000) / 1000; keys.forEach((k, j) => { weights[k][i] = Math.round(b[j] * 1000) / 1000; });
    let bs = 0, n = 0;
    for (const r of rows) { let z = b0, used = 0; r.f.forEach((v, j) => { if (v != null) { z += b[j] * v; used++; } }); if (!used) continue; bs += (sigmoid(z) - r.y) ** 2; n++; }
    brier[i] = n ? Math.round((bs / n) * 10000) / 10000 : NaN;
  });
  return { model: { calibrated: pairs.length > 0, thresholds: [...VS_VIS_THRESHOLDS_M], weights, intercept }, brier, n: pairs.length };
}
