/**
 * The meteorological layer of buscosun Fusion.
 *
 * Three things live here, and each of them replaces a hard classification with
 * something the atmosphere actually does:
 *
 *  1. **Precipitation phase from the WET-BULB temperature, as a probability.**
 *     Snow does not turn to rain at a dry-bulb threshold. A falling flake cools
 *     the air around it by evaporation, so the phase follows the wet-bulb
 *     temperature — which in dry air can be 2–3 K below the dry bulb. That is
 *     why it snows at +3 °C in a dry Föhn-free northerly and rains at +1 °C in
 *     saturated air. The old `precipType.ts` split on dry-bulb 0,5/2,5 °C.
 *     Here the phase is a probability, integrated over the predictive
 *     temperature distribution we already have — so a forecast that is unsure
 *     about the temperature is automatically unsure about the phase.
 *
 *  2. **Cold-air pooling as a regime, not a correction.** Whether a valley
 *     decouples on a given night is a knife-edge on wind and cloud. When the
 *     situation is close to that edge the honest answer is not a shifted mean
 *     but a WIDER distribution — the outcome really is bimodal. The mean shift
 *     stays (it is real physics, `terrainPhysics.ts`); what is added here is the
 *     spread that goes with it.
 *
 *  3. **Föhn as a spread inflater.** Föhn either reaches the valley floor or it
 *     does not, and the two outcomes are several kelvin and several m/s apart.
 *     A single number in the middle of a bimodal outcome is the least useful
 *     answer available.
 *
 * Pure. Headless-checkable via {@link verifyMeteo}.
 */

import { quantileOf, type Dist } from './dist';
import { REGIME } from './priors';

// ---------------------------------------------------------------------------
// Thermodynamics
// ---------------------------------------------------------------------------

/**
 * Wet-bulb temperature (°C) from dry bulb and relative humidity.
 * Stull (2011), empirical fit valid for −20…+50 °C and 5…99 % RH at sea-level
 * pressure — the range that matters for DACH surface weather.
 */
export function wetBulbC(tC: number, rhPct: number): number {
  const rh = Math.min(100, Math.max(1, rhPct));
  return (
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tC + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035
  );
}

/** Dew point (°C) via the Magnus formula (Sonntag coefficients over water). */
export function dewPointC(tC: number, rhPct: number): number {
  const a = 17.62, b = 243.12;
  const rh = Math.min(100, Math.max(1, rhPct));
  const gamma = (a * tC) / (b + tC) + Math.log(rh / 100);
  return (b * gamma) / (a - gamma);
}

/** Relative humidity (%) from dry bulb and dew point — the inverse of the above. */
export function rhFromDewPoint(tC: number, tdC: number): number {
  const a = 17.62, b = 243.12;
  const e = Math.exp((a * tdC) / (b + tdC));
  const es = Math.exp((a * tC) / (b + tC));
  return Math.min(100, Math.max(0, 100 * (e / es)));
}

// ---------------------------------------------------------------------------
// Precipitation phase
// ---------------------------------------------------------------------------

/**
 * Wet-bulb temperature at which snow and rain are equally likely (°C), and the
 * logistic width of the transition (K).
 *
 * The 0,6 °C centre is the value most commonly reported for wet-bulb phase
 * separation in mid-latitude continental precipitation; the 0,7 K width keeps
 * the band physically narrow (±1,5 K covers ~90 % of the transition) without
 * pretending the switch is instantaneous. **Prior, not fitted** — the same
 * caveat as every number in `priors.ts`.
 */
export const PHASE_TW50_C = 0.6;
export const PHASE_WIDTH_K = 0.7;

/** P(snow) for a known wet-bulb temperature. */
export function snowProbabilityFromWetBulb(twC: number): number {
  return 1 / (1 + Math.exp((twC - PHASE_TW50_C) / PHASE_WIDTH_K));
}

/**
 * P(snow) integrated over the predictive temperature distribution.
 *
 * This is the step that makes the phase honest: near the transition the answer
 * is not "snow" or "rain" but "58 % snow", and it widens automatically when the
 * temperature itself is uncertain — at long lead, in a valley, at the edge of a
 * cold pool.
 *
 * `nNodes` quantile nodes of the temperature distribution; 21 is far more than
 * the smoothness of the logistic requires.
 */
export function snowProbability(tempDist: Dist, rhPct: number | null, nNodes = 21): number {
  const rh = rhPct == null || !Number.isFinite(rhPct) ? 80 : rhPct;
  let acc = 0;
  for (let i = 0; i < nNodes; i++) {
    const p = (i + 0.5) / nNodes;
    const t = quantileOf(tempDist, p);
    acc += snowProbabilityFromWetBulb(wetBulbC(t, rh));
  }
  return acc / nNodes;
}

export type PhaseLabel = 'snow' | 'sleet' | 'rain';

/**
 * Label derived from the probability, with the mixed band reported honestly.
 * The thresholds are display conventions, not physics — the probability is the
 * result, the label is a courtesy.
 */
export function phaseLabel(pSnow: number): PhaseLabel {
  if (pSnow >= 0.75) return 'snow';
  if (pSnow <= 0.25) return 'rain';
  return 'sleet';
}

/**
 * Snow line (m) implied by the phase model: the elevation at which P(snow) = ½,
 * found from the point temperature by walking the lapse rate. Returns null when
 * the transition is not within a sensible band of the query point.
 */
export function impliedSnowLineM(
  tC: number, rhPct: number, elevM: number, lapsePerM: number,
): number | null {
  const lapse = lapsePerM > 1e-4 ? lapsePerM : 0.0065;
  // Solve wetBulb(T(z), rh) = PHASE_TW50_C for z, T(z) = tC − lapse·(z − elevM).
  let lo = elevM - 3000, hi = elevM + 3000;
  const f = (z: number) => wetBulbC(tC - lapse * (z - elevM), rhPct) - PHASE_TW50_C;
  if (f(lo) < 0 || f(hi) > 0) return null;             // transition outside the band
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  const z = 0.5 * (lo + hi);
  return z >= 0 && z <= 6000 ? z : null;
}

// ---------------------------------------------------------------------------
// Regimes
// ---------------------------------------------------------------------------

export interface RegimeInput {
  /** Solar elevation (deg) — negative at night. */
  solarElevDeg: number;
  /**
   * Depth below the surroundings (m), taken as the LARGEST over all terrain
   * scales. A 2,5-km ring alone reports ~0 for the Swiss plateau, the Alpine
   * foreland, the Danube and Upper Rhine lowlands — precisely the places where
   * the classic frost-hollow and low-stratus errors happen. Cold air collects in
   * wide basins as well as in narrow valleys.
   */
  sinkDepthM: number;
  /** Sky-view factor in [0,1] from `terrainScale.skyViewFactor`. */
  skyView: number;
  windMs: number | null;
  /**
   * Radiatively effective cloud cover (%) — low cloud counts fully, cirrus
   * barely. Summing the three layers and comparing that to a threshold means
   * 40 % cirrus plus 30 % stratus switches the cold pool off, although thin
   * high cloud hardly touches the longwave balance.
   */
  cloudPct: number | null;
  /** Föhn score in [0,1] from `foehnDetector`, or null when not assessed. */
  foehnScore: number | null;
  /** P(snow) — used to detect the phase-transition band. */
  pSnow: number | null;
}

export interface RegimeAssessment {
  /** 0…1 — how strongly the cold-pool mechanism is active. */
  coldPool: number;
  /** 0…1 — föhn score, passed through and clamped. */
  foehn: number;
  /** 0…1 — how close the situation is to the rain/snow transition. */
  phaseEdge: number;
  /** Extra variance to add to the temperature distribution (K²). */
  tempExtraVar: number;
  /** Extra variance to add to each wind component (m²/s²). */
  windExtraVar: number;
  /** Short machine-readable reasons, for the honesty text in the UI. */
  reasons: string[];
}

/**
 * Cold-pool strength in [0,1].
 *
 * Multiplicative gates, because the mechanism needs ALL of them: darkness (no
 * solar input), a basin to collect the cold air, an open sky to radiate to,
 * calm (mixing destroys the pool) and few clouds (they return the longwave).
 * A missing factor kills the whole term — which is exactly how the atmosphere
 * behaves. The sky-view factor enters twice over: a deep narrow valley collects
 * more cold air *and* radiates less efficiently, and the net effect on the
 * *spread* is what we want here.
 */
export function coldPoolStrength(i: RegimeInput): number {
  if (i.solarElevDeg > -1) return 0;
  if (i.sinkDepthM <= 5) return 0;
  const depth = Math.min(1, i.sinkDepthM / 250);
  const calm = Math.max(0, Math.min(1, (2.5 - (i.windMs ?? 0)) / 2.5));
  const clear = Math.max(0, Math.min(1, 1 - (i.cloudPct ?? 0) / 65));
  // The sky-view factor belongs in the RADIATION term, not in the basin term:
  // it says how much of the hemisphere the ground can radiate to. A wide open
  // basin has skyView ≈ 1 and pools the hardest — using (1 − skyView) as a
  // basin proxy had the sign of that effect backwards.
  const radiation = 0.7 + 0.3 * Math.max(0, Math.min(1, i.skyView));
  return depth * calm * clear * radiation;
}

/** Radiatively effective cloud cover from the three layers (%). */
export function radiativeCloudPct(
  low: number | null, mid: number | null, high: number | null,
): number | null {
  const l = low ?? 0, m = mid ?? 0, h = high ?? 0;
  if (low == null && mid == null && high == null) return null;
  return Math.min(100, 1.0 * l + 0.6 * m + 0.25 * h);
}

/**
 * Turn the regime scores into variance inflation.
 *
 * The peak of the uncertainty is not at the peak of the mechanism but at its
 * EDGE: a valley that is certainly decoupled behaves predictably, and so does
 * one that is certainly mixed. The uncertain case is the one in between. The
 * cold-pool term therefore uses 4·s·(1−s), which is 1 at s = ½ and 0 at both
 * ends — a genuinely different shape from a linear "more pooling = more
 * uncertainty", and the meteorologically correct one.
 *
 * Föhn is different: it is bimodal *whenever* it is possible, so its inflation
 * grows monotonically with the score.
 */
export function assessRegime(i: RegimeInput): RegimeAssessment {
  const coldPool = coldPoolStrength(i);
  const foehn = Math.max(0, Math.min(1, i.foehnScore ?? 0));
  const pSnow = i.pSnow;
  const phaseEdge = pSnow == null ? 0 : 4 * pSnow * (1 - pSnow);

  const coldEdge = 4 * coldPool * (1 - coldPool);
  const reasons: string[] = [];
  if (coldPool > 0.15) reasons.push('kaltluftsee');
  if (foehn > 0.3) reasons.push('foehn');
  if (phaseEdge > 0.4) reasons.push('phasenuebergang');

  return {
    coldPool,
    foehn,
    phaseEdge,
    // Two terms, because two different things are uncertain. The parabola is the
    // BIMODALITY — will it decouple or not — and peaks at the tipping point. The
    // linear term is the plain fact that the largest absolute model errors in
    // DACH occur in valleys that HAVE decoupled: the models are simply 3–8 K too
    // warm there. A fully decoupled valley is not as predictable as a windy
    // plain, and 4s(1−s) alone would claim exactly that.
    tempExtraVar:
      REGIME.coldPoolVarK2 * coldEdge
      + REGIME.coldPoolFloorVarK2 * coldPool
      + REGIME.foehnVarK2 * foehn
      + REGIME.phaseVarK2 * phaseEdge,
    windExtraVar: REGIME.foehnWindVar * foehn,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface MeteoCheck { name: string; ok: boolean; detail?: string }
export interface MeteoVerifyResult { checks: MeteoCheck[]; passed: number; failed: number }

export function verifyMeteo(): MeteoVerifyResult {
  const checks: MeteoCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // --- wet bulb: equals dry bulb at saturation, drops below it in dry air
  {
    const tSat = wetBulbC(10, 100);
    add('Feuchtkugel = Trockenkugel bei 100 % RH', near(tSat, 10, 0.35), tSat.toFixed(3));
    const tDry = wetBulbC(10, 40);
    add('Feuchtkugel deutlich unter Trockenkugel bei 40 % RH', tDry < 10 - 3, tDry.toFixed(2));
    let mono = true;
    for (let rh = 20; rh < 100; rh += 5) if (wetBulbC(5, rh) > wetBulbC(5, rh + 5)) mono = false;
    add('Feuchtkugel steigt monoton mit der Feuchte', mono);
  }

  // --- THE meteorological point: at +2 °C the phase depends on the humidity
  {
    const pDry = snowProbabilityFromWetBulb(wetBulbC(2, 35));
    const pWet = snowProbabilityFromWetBulb(wetBulbC(2, 95));
    add('bei +2 °C und trockener Luft überwiegt Schnee', pDry > 0.5, pDry.toFixed(3));
    add('bei +2 °C und feuchter Luft überwiegt Regen', pWet < 0.35, pWet.toFixed(3));
    add('Trockenkugel-Schwelle allein hätte beide gleich behandelt', pDry - pWet > 0.4,
      `Δp = ${(pDry - pWet).toFixed(3)}`);
  }

  // --- dew point round trip
  {
    const td = dewPointC(15, 60);
    add('Taupunkt < Temperatur', td < 15, td.toFixed(2));
    add('RH aus Taupunkt zurückgerechnet', near(rhFromDewPoint(15, td), 60, 0.5), rhFromDewPoint(15, td).toFixed(2));
  }

  // --- phase probability integrated over an uncertain temperature.
  //     The 50 % point lives in WET-BULB space, so the dry-bulb temperature that
  //     sits on the boundary depends on the humidity — find it rather than
  //     assuming it, which is the whole point of the module.
  {
    const rh = 90;
    let lo = -6, hi = 8;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (wetBulbC(mid, rh) < PHASE_TW50_C) lo = mid; else hi = mid;
    }
    const tBoundary = 0.5 * (lo + hi);
    const sharp: Dist = { kind: 'normal', mu: tBoundary, sigma: 0.2 };
    const vague: Dist = { kind: 'normal', mu: tBoundary, sigma: 4.0 };
    add('Grenztemperatur liegt bei 90 % RH über 0 °C', tBoundary > 0.6,
      `${tBoundary.toFixed(2)} °C ⇒ Feuchtkugel ${wetBulbC(tBoundary, rh).toFixed(2)} °C`);
    const pS = snowProbability(sharp, rh);
    const pV = snowProbability(vague, rh);
    add('an der Grenze liegt P(Schnee) nahe ½', near(pS, 0.5, 0.08), pS.toFixed(3));
    add('genau auf der Grenze bleibt auch eine unsichere Prognose bei ½',
      near(pV, 0.5, 0.05), `${pS.toFixed(3)} → ${pV.toFixed(3)}`);
    // Abseits der Grenze ist der Effekt der eigentliche: Unsicherheit zieht zur Mitte.
    {
      const sicher = snowProbability({ kind: 'normal', mu: tBoundary - 2.5, sigma: 0.2 }, rh);
      const unsicher = snowProbability({ kind: 'normal', mu: tBoundary - 2.5, sigma: 3.5 }, rh);
      add('unsichere Temperatur zieht P(Schnee) Richtung ½',
        unsicher < sicher - 0.1 && unsicher > 0.5,
        `${sicher.toFixed(3)} → ${unsicher.toFixed(3)}`);
    }
    const cold = snowProbability({ kind: 'normal', mu: -6, sigma: 1 }, 90);
    const warm = snowProbability({ kind: 'normal', mu: 12, sigma: 1 }, 60);
    add('deutlich unter null ⇒ P(Schnee) ≈ 1', cold > 0.98, cold.toFixed(4));
    add('deutlich über null ⇒ P(Schnee) ≈ 0', warm < 0.02, warm.toFixed(4));
    add('Label folgt der Wahrscheinlichkeit',
      phaseLabel(cold) === 'snow' && phaseLabel(warm) === 'rain' && phaseLabel(0.5) === 'sleet');
  }

  // --- implied snow line
  {
    const z = impliedSnowLineM(6, 80, 500, 0.0065);
    add('Schneefallgrenze über dem Punkt bei +6 °C im Tal', z != null && z > 500, z == null ? 'null' : z.toFixed(0));
    const z2 = impliedSnowLineM(-8, 80, 500, 0.0065);
    add('bei −8 °C liegt die Grenze nicht mehr im Band ⇒ null', z2 === null);
  }

  // --- cold pool gates
  {
    const base: RegimeInput = {
      solarElevDeg: -20, sinkDepthM: 200, skyView: 0.7,
      windMs: 0.5, cloudPct: 5, foehnScore: 0, pSnow: null,
    };
    add('Nacht + Senke + windstill + klar ⇒ Kaltluftsee aktiv', coldPoolStrength(base) > 0.5,
      coldPoolStrength(base).toFixed(3));
    add('Wind schaltet ihn ab', coldPoolStrength({ ...base, windMs: 6 }) === 0);
    add('Bewölkung schaltet ihn ab', coldPoolStrength({ ...base, cloudPct: 100 }) === 0);
    add('Tag schaltet ihn ab', coldPoolStrength({ ...base, solarElevDeg: 20 }) === 0);
    add('Ebene (keine Senke) schaltet ihn ab', coldPoolStrength({ ...base, sinkDepthM: 0 }) === 0);
  }

  // --- the edge, not the peak, carries the uncertainty
  {
    const mk = (wind: number) => assessRegime({
      solarElevDeg: -20, sinkDepthM: 200, skyView: 0.7,
      windMs: wind, cloudPct: 5, foehnScore: 0, pSnow: null,
    });
    const certainPool = mk(0);        // strongly decoupled
    const certainMixed = mk(4);       // certainly mixed
    const bim = (r: RegimeAssessment) => 4 * r.coldPool * (1 - r.coldPool);
    // Erste Komponente — die BIMODALITÄT: „kippt es oder nicht" ist dort am
    // offensten, wo die Kaltluftsee-Stärke bei ½ liegt, und an beiden Enden
    // entschieden. Geprüft als Eigenschaft über den ganzen Windbereich, nicht
    // an drei ausgesuchten Windwerten — der Kipppunkt liegt bei diesen Gates
    // nicht dort, wo man ihn naiv vermutet.
    let bestW = 0, bestBim = -1, bestPool = 0;
    for (let w = 0; w <= 4; w += 0.05) {
      const r = mk(w);
      if (bim(r) > bestBim) { bestBim = bim(r); bestW = w; bestPool = r.coldPool; }
    }
    add('Bimodalität ist dort maximal, wo die Kaltluftsee-Stärke bei ½ liegt',
      Math.abs(bestPool - 0.5) < 0.05 && bestBim > 0.99,
      `max bei ${bestW.toFixed(2)} m/s, Stärke ${bestPool.toFixed(3)}`);
    add('an beiden Enden ist die Bimodalität kleiner',
      bim(certainPool) < bestBim && bim(certainMixed) < bestBim,
      `${bim(certainPool).toFixed(2)} | ${bestBim.toFixed(2)} | ${bim(certainMixed).toFixed(2)}`);
    // Zweite Komponente — der SOCKEL: ein voll entkoppeltes Tal ist nicht
    // verlässlich vorhergesagt, dort sind die Modelle am zuverlässigsten zu warm.
    add('voll entkoppeltes Tal bleibt unsicherer als eine windige Nacht',
      certainPool.tempExtraVar > certainMixed.tempExtraVar + 1,
      `${certainPool.tempExtraVar.toFixed(2)} vs ${certainMixed.tempExtraVar.toFixed(2)}`);
    add('sicher durchmischt ⇒ keine Zusatzstreuung', certainMixed.tempExtraVar < 1e-9);
  }

  // --- foehn inflates both temperature and wind, monotonically
  {
    const none = assessRegime({ solarElevDeg: 10, sinkDepthM: 0, skyView: 1, windMs: 5, cloudPct: 20, foehnScore: 0, pSnow: null });
    const strong = assessRegime({ solarElevDeg: 10, sinkDepthM: 0, skyView: 1, windMs: 5, cloudPct: 20, foehnScore: 1, pSnow: null });
    add('Föhn verbreitert Temperatur', strong.tempExtraVar > none.tempExtraVar + 3, strong.tempExtraVar.toFixed(2));
    add('Föhn verbreitert Wind', strong.windExtraVar > none.windExtraVar + 1, strong.windExtraVar.toFixed(2));
    add('Föhn wird als Grund ausgewiesen', strong.reasons.includes('foehn'));
  }

  // --- NEGATIVE CONTROL: a quiet plain in daylight must produce NOTHING
  {
    const quiet = assessRegime({
      solarElevDeg: 30, sinkDepthM: 0, skyView: 1, windMs: 3, cloudPct: 40,
      foehnScore: 0, pSnow: 0.0,
    });
    add('Negativkontrolle: ruhige Ebene erzeugt keinerlei Aufweitung',
      quiet.tempExtraVar === 0 && quiet.windExtraVar === 0 && quiet.reasons.length === 0);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyMeteo: typeof verifyMeteo }).__verifyMeteo = verifyMeteo;
}
