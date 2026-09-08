/**
 * buscosun Fusion — the point engine, and the project-wide name for it.
 *
 * This is not a weather model. It is a **combination rule**: it takes what
 * several independent systems say about one spot on the earth, decides how much
 * each of them can possibly know about *that* spot, and produces one calibrated
 * probability distribution per variable and hour.
 *
 * ── The chain, in five steps ───────────────────────────────────────────────
 *
 *   1. GEOMETRY   Move every source onto the query point: lapse-rate correction
 *                 for temperature, micro-climate correction for the sources
 *                 that cannot see the local terrain.
 *   2. ERROR      Give every source an error bar made of two independent parts:
 *                    σ² = σ_skill(τ)²  +  σ_rep(point)²
 *                 σ_skill comes from the anomaly correlation ρ(τ) — how much of
 *                 the departure from climatology this source gets right at this
 *                 lead. σ_rep comes from geometry — how much the source's cell
 *                 or station can differ from this point for reasons no forecast
 *                 improvement will ever fix.
 *   3. COMBINE    Minimum-variance combination *with the error correlations*.
 *                 Three models that share an analysis do not count as three
 *                 opinions. A station does.
 *   4. SHRINK     Treat the climatology as a prior and the combined estimate as
 *                 a measurement of the truth. The posterior converges to the
 *                 climatology exactly as fast as the sources lose skill — no
 *                 decay constant, no floor, nothing set by hand.
 *   5. SHAPE      Put the result into the distribution family the variable
 *                 actually has: Rice for wind speed, censored log-normal for
 *                 precipitation, censored normal for bounded percentages.
 *                 Then widen it where the meteorology says the outcome is
 *                 genuinely bimodal (cold pool, föhn, phase transition).
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 * `FAMILY_CURVES`, `VARIABLE_MULTIPLIER`, `spatialWeight`, `ANCHOR_TOL_C`,
 * `SKILL_DECAY`, the family bonus and the `confidence` heuristic — about 45
 * hand-set numbers — collapse into two measurable quantities per source
 * (`priors.ts`). Nothing here is weighted by hand; the weights fall out of the
 * variances.
 *
 * Pure: no DOM, no network, no randomness, no clock (D-12). The caller supplies
 * the context. Headless-checkable via {@link verifyFuse}.
 */

import type { PointSourceSample, SourceFamily } from '../types';
import { combine, type Member } from './combine';
import {
  ACC, accAt, amplitudeAt, CLIMA_SIGMA_FALLBACK, CORR_SHRINK, DEWPOINT_DEPRESSION_K,
  DEWPOINT_LAPSE_PER_M, familyErrorCorrelation, TD_T_CORR_ERROR, TD_T_CORR_CLIMA,
  FOOTPRINT_FALLBACK_M, FOOTPRINT_M, GUST_FACTOR_DECOUPLED, GUST_FACTOR_NEUTRAL,
  PHASE_RH_BLEND, PHASE_RH_SATURATED, pointPairCorrelation, PRECIP_OCC_TAIL, PRECIP_WET_CLIMA,
  REGIME, REP, REP_MISC,
  WET_HOURS_PER_WET_DAY, WIND_DIR_MIN_CONCENTRATION, windSigmaAt, type FusionVariable,
} from './priors';
import { spreadAtFootprint, tpiAt, type TerrainScales } from './terrainScale';
import {
  assessRegime, dewPointC, radiativeCloudPct, rhFromDewPoint, snowProbability,
  type RegimeAssessment,
} from './meteo';
import { cdfOf, inflate, meanOf, phi, Phi, PhiInv, quantileOf, type Dist } from './dist';

/** Climatological reference at the query point for one hour. */
export interface ClimaRef {
  /** Hourly climatological mean temperature at the query elevation (°C). */
  tempMeanC: number;
  /** Climatological temperature anomaly spread (K). */
  tempSigmaC: number;
  /** Climatological probability of a wet DAY (>= 1 mm), as `climaGrid.json` stores it. */
  wetProbDaily: number;
}

export interface FusionContext {
  elevationM: number;
  lapseRatePerM: number;
  terrain: TerrainScales;
  skyView: number;
  /** Depth below the surroundings (m) — from `terrainPhysics.terrainContext`. */
  sinkDepthM: number;
  /** Micro-climate temperature offset for this hour (K), from `terrainPhysics`. */
  terrainDeltaC: number;
  solarElevDeg: number;
  foehnScore: number | null;
  clima: ClimaRef | null;
  /**
   * Climatological reference at an ARBITRARY time (K-1). A sample that is valid
   * at another time than the target hour — a station measurement reused for
   * h = 1…5 — forms its anomaly against the climatology of ITS OWN time; the
   * posterior then adds the climatology of the target hour. That is anomaly
   * persistence. Without it the diurnal cycle of the climatology leaks into the
   * "anomaly" and the station drags the morning rise down by up to 1,4 K
   * (measured at h = 2). Optional: a caller without it gets the old behaviour,
   * which is exact only when the climatology does not vary with the hour.
   */
  climaAt?: (ms: number) => ClimaRef | null;
  /** Micro-climate temperature offset at an arbitrary time (K) — same reasoning. */
  terrainDeltaAt?: (ms: number) => number;
}

export interface FusedVariable {
  dist: Dist;
  /** Combined estimate before the climatological shrinkage, for diagnostics. */
  rawMu: number;
  /** Error sd of that estimate. */
  rawSigma: number;
  /** How many independent "best sources" the combination is worth. */
  equivalentSources: number;
  /** Source tags that carried more than 5 % of the weight. Empty when this is climatology only. */
  contributors: string[];
  /**
   * No source contributed any more — this distribution IS the climatology.
   *
   * Not an error and not a stopgap: beyond the last model horizon what we know
   * really is only what is usual at this place at this time of year. Emitting a
   * gap instead would be worse — we would be holding that knowledge and throwing
   * it away. But it MUST be visible, or it reads like a forecast (honesty rule).
   */
  climatologyOnly: boolean;
}

export interface FusedPoint {
  temperature: FusedVariable | null;
  /** Taupunkt (°C) — die eigentlich fusionierte Feuchtegröße. */
  dewPoint: FusedVariable | null;
  humidity: FusedVariable | null;
  clouds: FusedVariable | null;
  precipitation: FusedVariable | null;
  /** Wind speed (m/s) as a Rice distribution derived from the u/v combination. */
  windSpeed: FusedVariable | null;
  /** Meteorological direction the wind comes FROM (deg), from the combined mean vector. */
  windDirectionDeg: number | null;
  gust: FusedVariable | null;
  /** Probability that precipitation, if any, falls as snow. */
  pSnow: number | null;
  regime: RegimeAssessment;
  /**
   * Where the climatological prior came from. `'grid'` = `climaGrid.json` for
   * this place and day. `'fallback'` = the fixed constants (8 °C, 6 K, 30 % wet
   * days) — a legitimate anchor for the shrinkage while sources are present,
   * but the further out the hour, the more the answer IS that made-up number:
   * measured, MOSMIX 25 °C in July came out as 18,5 °C at lead 200 h (K-3).
   * The adapter (`attach.ts`) refuses to run without the grid; this marker is
   * for direct callers and for the honesty of the record.
   */
  climaSource: 'grid' | 'fallback';
}

// ---------------------------------------------------------------------------
// Representativeness — how much this source can know about THIS point
// ---------------------------------------------------------------------------

function footprintOf(s: PointSourceSample): number {
  return FOOTPRINT_M[s.source] ?? FOOTPRINT_FALLBACK_M[s.family] ?? 5_000;
}

/**
 * Representativeness error of one sample for one variable, in the variable's
 * working units (log1p(mm/h) for precipitation).
 *
 * Every term here is geometry, not skill: it does not shrink at short lead and
 * it does not grow at long lead.
 */
export function representativeness(
  variable: FusionVariable,
  s: PointSourceSample,
  ctx: FusionContext,
): number {
  const L = footprintOf(s);
  const spread = spreadAtFootprint(ctx.terrain, L);
  // NaN would propagate all the way to sigma and silently DELETE the member —
  // and beyond h ~ 6 in DE that member is the only source there is.
  const d = Number.isFinite(s.distanceMeters) ? Math.max(0, s.distanceMeters as number) : 0;
  const dz = s.sourceElevation != null ? Math.abs(s.sourceElevation - ctx.elevationM) : 0;
  const knowsOwnHeight = s.sourceElevation != null;
  const lapse = ctx.lapseRatePerM > 1e-4 ? ctx.lapseRatePerM : 0.0065;
  // How much the terrain between here and the source breaks the assumption that
  // "nearby" means "similar". Flat ⇒ 1; inner-alpine ⇒ up to 4.
  const complexity = d > 0
    ? 1 + Math.min(REP.distComplexityMax, spreadAtFootprint(ctx.terrain, 2 * d) / REP.distComplexityRefM)
    : 1;

  switch (variable) {
    case 'temperature': {
      // The cell averages terrain; what survives the lapse correction is the
      // sub-footprint spread (fully, if the source never told us its height).
      const terrainTerm = lapse * spread * (knowsOwnHeight ? REP.correctedFraction : 1);
      const lapseTerm = REP.lapseResidualPerM * dz;
      const distTerm = REP.tempPerDecorrK * (d / REP.tempDecorrM) * complexity;
      return Math.hypot(terrainTerm, lapseTerm, distTerm);
    }
    case 'dewpoint': {
      // Gleiche Geometrie wie die Temperatur, aber mit dem Taupunkt-Gradienten —
      // der Taupunkt faellt mit der Hoehe rund dreimal langsamer.
      const terrainTerm = DEWPOINT_LAPSE_PER_M * spread * (knowsOwnHeight ? REP.correctedFraction : 1);
      const lapseTerm = 0.4 * REP.lapseResidualPerM * dz;
      const distTerm = 0.8 * REP.tempPerDecorrK * (d / REP.tempDecorrM) * complexity;
      return Math.hypot(terrainTerm, lapseTerm, distTerm, 0.3);
    }
    case 'humidity': {
      const terrainTerm = REP.humidityPerK * Math.min(1.6, spread / REP_MISC.humidityScaleM);
      const distTerm = REP_MISC.humidityDistPct * (d / REP.tempDecorrM) * complexity;
      return Math.hypot(terrainTerm, distTerm, REP_MISC.humidityFloorPct);
    }
    case 'clouds': {
      const fp = Math.min(22, REP.cloudPerFootprintM * L);
      const distTerm = REP_MISC.cloudDistPct * (d / REP.tempDecorrM);
      return Math.hypot(fp, distTerm, REP_MISC.cloudFloorPct);
    }
    case 'precipitation':
    case 'precipOcc': {
      // In log1p space: a coarse cell reports an area average, the point can be
      // a factor of several off in either direction. The same geometry serves
      // the occurrence stage in its probit space — both have unit-order spread,
      // and a cell that averages showers over 28 km cannot say whether THIS
      // point is under one.
      const fp = REP_MISC.precipFootprintLog * (L / (L + REP.precipHalfM));
      const distTerm = REP_MISC.precipDistLog * (d / REP_MISC.precipDistRefM);
      return Math.hypot(fp, distTerm, REP_MISC.precipFloorLog);
    }
    case 'wind': {
      // What is left AFTER the shelter/speed-up has been applied to the mean:
      // a fraction of the shift we just made, because a correction of that size
      // is itself uncertain. Before, the whole exposure mismatch lived here as
      // pure spread — which, against a zero-mean prior, silently became "calm".
      const f = windTerrainFactor(s, ctx);
      const distTerm = REP_MISC.windDistMs * (d / REP_MISC.windDistRefM) * complexity;
      return Math.hypot(REP.windShiftResidualFrac * Math.abs(1 - f) * 12, distTerm, REP.windFloorMs);
    }
    case 'gust':
      return REP.gustFactorOverWind * representativeness('wind', s, ctx);
  }
}

/**
 * Terrain shelter (< 1) or speed-up (> 1) for the wind at this point, relative
 * to what the source's footprint can resolve.
 *
 * A valley floor well below its surroundings is genuinely sheltered; a ridge is
 * genuinely faster. Both are systematic and both belong on the mean. The factor
 * is scaled by how much of the local terrain the source already sees, so a
 * co-located anemometer is left alone and a 28-km cell gets the full correction.
 */
export function windTerrainFactor(s: PointSourceSample, ctx: FusionContext): number {
  const L = footprintOf(s);
  const tpi = tpiAt(ctx.terrain, Math.max(L, REP_MISC.windMinFootprintM));
  const unresolved = 1 - microResolution(s, ctx);
  const raw = tpi >= 0
    ? 1 + Math.min(REP.windSpeedupMax, tpi * REP.windSpeedupPerM)
    : Math.max(REP.windShelterMin, Math.exp(tpi / REP.windShelterScaleM));
  return 1 + (raw - 1) * unresolved;
}

/**
 * How much of the local micro-climate this source already sees.
 *
 * 1 = it measures the very spot (a station in the same hollow) — do not apply a
 * micro-climate correction on top of it. 0 = it has no idea (a 28-km cell) —
 * apply the correction in full. This generalises the old single
 * `anchorAttenuation` (one global factor for all sources) to a per-source
 * property, which is what it always should have been: a station 30 km away and
 * 600 m higher knows no more about this valley's cold pool than the model does.
 */
export function microResolution(s: PointSourceSample, ctx: FusionContext): number {
  const d = Number.isFinite(s.distanceMeters) ? Math.max(0, s.distanceMeters as number) : 0;
  const dz = s.sourceElevation != null ? Math.abs(s.sourceElevation - ctx.elevationM) : null;

  // Point sources — a station measurement or a station FORECAST (MOSMIX). Both
  // are valid for one spot, so what matters is how far that spot is from ours.
  //
  // Two different scales on purpose: a measurement of the cold pool in the same
  // hollow (≤ 2 km, ≤ 150 m) really does contain it, so nothing must be added.
  // A station FORECAST is a different thing — it carries the model's view plus a
  // local MOS correction that belongs to ITS site, so it stops representing our
  // micro-climate sooner. Before this distinction MOSMIX had footprint 0, which
  // read as "perfectly co-located" and silently cancelled the whole cold-pool
  // correction for the source that dominates most leads.
  if (s.family === 'obs' || footprintOf(s) === 0) {
    const dScale = s.family === 'obs' ? 2_000 : 5_000;
    const zScale = s.family === 'obs' ? 150 : 250;
    const dzUse = dz ?? 400;
    return Math.exp(-((d / dScale) ** 2)) * Math.exp(-((dzUse / zScale) ** 2));
  }
  const L = footprintOf(s);
  return Math.exp(-((L / 3_000) ** 2));
}

// ---------------------------------------------------------------------------
// One scalar variable
// ---------------------------------------------------------------------------

interface ScalarOptions {
  /** Value extractor in the working space; null skips the sample. */
  value: (s: PointSourceSample) => number | null;
  /** Climatological prior mean and spread in the same space. */
  climaMean: number;
  climaSigma: number;
  /** Additive micro-climate offset, applied per source scaled by 1 − microResolution. */
  microDelta?: number;
  /**
   * Prior mean at another time than the target hour (K-1), for samples that
   * carry `validAtMs`. Without it every sample is taken as valid for the target
   * hour — exact for model output, wrong for a reused measurement.
   */
  climaMeanAt?: (ms: number) => number;
  /** Micro-climate offset at another time, same purpose. */
  microDeltaAt?: (ms: number) => number;
  /** Extra variance from the meteorological regime, added at the end. */
  extraVar?: number;
  /**
   * Precipitation only: a source reporting 0 mm is a CENSORED observation —
   * it says "z ≤ 0", not "z = 0". Feeding the boundary value straight in biases
   * the estimate wet, because 0 is the *upper* edge of the dry region. The
   * conditional mean of a normal truncated above zero is −0,798·σ, and that is
   * what a dry report is worth.
   */
  dryCensor?: boolean;
  /**
   * Value-dependent skill (tail dependence): returns a boost in [0,1) that
   * raises the source's correlation toward 1 for THIS sample, ρ' = ρ + (1−ρ)·b.
   * Used for precipitation occurrence, where a heavy signal is a more reliable
   * wet call than drizzle (K-2). Priors only; see `PRECIP_OCC_TAIL`.
   */
  rhoBoost?: (s: PointSourceSample) => number;
  /**
   * The value is already a quantile of the truth's own climatology (Gaussian
   * anamorphosis, K-2 stage A): its amplitude is 1 by construction, whatever
   * the family's amplitude prior says about raw amounts.
   */
  unitAmplitude?: boolean;
}

/** Minimum anomaly correlation below which a source carries no information. */
const RHO_FLOOR = 0.02;

export function fuseScalar(
  samples: PointSourceSample[],
  variable: FusionVariable,
  leadH: number,
  ctx: FusionContext,
  opt: ScalarOptions,
): FusedVariable | null {
  const members: Member<PointSourceSample>[] = [];
  const curves = ACC[variable];
  const sc = opt.climaSigma;
  const sc2 = sc * sc;

  for (const s of samples) {
    const raw = opt.value(s);
    if (raw == null || !Number.isFinite(raw)) continue;
    const curve = curves[s.family as SourceFamily];
    if (!curve) continue;
    // Skill and fade-out are two different things. ρ is the source's anomaly
    // correlation — it calibrates the member (anomaly/ρα) and sets the skill
    // variance. The fade-out before the horizon only says "trust it less": it
    // inflates the member's variance by 1/taper, so the weight goes to zero
    // linearly while the member mean stays the calibrated one. Folding the
    // taper into ρ itself (the previous design) made the mean grow like 1/ρ
    // toward the horizon and stepped the fused value by 0,25–0,29 K per hour
    // in the hand-over once the MOS amplitude was corrected (H-1).
    const rhoSkill = accAt(curve, leadH, false);
    const rhoTapered = accAt(curve, leadH);
    if (rhoTapered <= RHO_FLOOR || !(rhoSkill > 0)) continue;
    const taper = Math.min(1, rhoTapered / rhoSkill);
    // Value-dependent skill (tail dependence), if the variable asks for it.
    const boost = opt.rhoBoost ? Math.max(0, Math.min(0.95, opt.rhoBoost(s))) : 0;
    const rho = rhoSkill + (1 - rhoSkill) * boost;
    const alpha = opt.unitAmplitude ? 1 : amplitudeAt(s.family as SourceFamily, rho);

    const sigRep = representativeness(variable, s, ctx);
    if (!Number.isFinite(sigRep)) continue;

    // ── Calibrate the member so that "estimate = truth + independent error"
    // holds by construction.
    //
    // A source with anomaly correlation ρ and anomaly amplitude α·σ_c predicts
    // the truth's anomaly with slope ρ·α. Dividing by that slope turns it into
    // an UNBIASED estimate of our anomaly, and the whole machinery downstream —
    // minimum-variance combination, climatological prior — is then exactly the
    // textbook case. Skipping this step is the classic over-shrinkage trap: it
    // silently assumes α = 1/ρ, i.e. that the model swings wider than reality,
    // and pulls a medium-range anomaly ~40 % too far toward the climatology.
    const slope = rho * alpha;
    const sigma = Math.sqrt((alpha * alpha * sc2 * (1 - rho * rho) + sigRep * sigRep) / taper) / slope;
    if (!Number.isFinite(sigma) || sigma <= 0) continue;

    // The climatology the SOURCE effectively reports against: it already
    // contains as much of the local micro-climate as it can resolve — and it is
    // the climatology of the time the value is VALID FOR. A station measurement
    // reused for a later hour is anomaly persistence only if its anomaly is
    // taken at the measurement time (K-1); taken against the target hour's
    // climatology it would be value persistence dressed up in anomaly units,
    // and the diurnal rise of the climatology would enter the "anomaly".
    const atMs = s.validAtMs;
    const timed = atMs != null && Number.isFinite(atMs);
    const baseMean = timed && opt.climaMeanAt ? opt.climaMeanAt(atMs) : opt.climaMean;
    const micro = timed && opt.microDeltaAt ? opt.microDeltaAt(atMs) : (opt.microDelta ?? 0);
    const resolved = micro ? micro * microResolution(s, ctx) : 0;
    const sourceClimaMean = baseMean + resolved;

    let anomaly: number;
    if (opt.dryCensor && raw === 0) {
      // A dry report is a CENSORED observation: it says z ≤ 0, not z = 0.
      // Feeding the boundary value in biases the estimate wet — and anchoring
      // the correction at 0 instead of at the climatological mean made the best
      // precipitation product (radar seeing no echo) return the LOWEST dry
      // probability of all sources. What a dry report is actually worth is the
      // conditional moment of the truncation, taken against the PREDICTIVE
      // spread √(σ_c² + σ_err²), not against the error spread alone. The error
      // read against the censoring is the representativeness part of the member
      // (the skill part is what the prior already carries) — written directly,
      // so that it stays well-defined for α < 1 (it is identical to
      // √(σ² − σ_c²(1−ρ²)/slope²) at α = 1, and that form goes negative below).
      const sigErr = sigRep / (slope * Math.sqrt(taper));
      const sigT = Math.hypot(sc, sigErr);
      const dTrunc = -sourceClimaMean / sigT;
      const lam = Math.min(6, phi(dTrunc) / Math.max(1e-9, Phi(dTrunc)));
      const varEff = Math.max(1e-6, sigT * sigT - sc2 * lam * (lam + dTrunc));
      // Value and spread chosen so that combining this member with the
      // climatological prior reproduces the exact truncated-normal posterior.
      anomaly = -lam * (sc2 + varEff) / sigT;
      members.push({ mu: anomaly, sigma: Math.sqrt(varEff), tag: s.source, src: s });
      continue;
    }

    anomaly = (raw - sourceClimaMean) / slope;
    members.push({ mu: anomaly, sigma, tag: s.source, src: s });
  }

  if (members.length === 0) {
    // No source carries anything any more — then the prior is the answer. It is
    // a complete, valid distribution, not a crutch: mean and spread of the
    // climatology for this place, this hour, this day of the year.
    //
    // But ONLY if there is a real climatology. Without `ctx.clima` the callers
    // fall back to fixed constants (8 °C, 30 % wet days) so that the shrinkage
    // has something to pull against while sources are still present. As a
    // stand-alone answer those constants are a made-up number for an arbitrary
    // point in the DACH area, and a made-up number is worse than a gap.
    if (!ctx.clima) return null;
    return {
      dist: { kind: 'normal', mu: opt.climaMean + (opt.microDelta ?? 0), sigma: Math.sqrt(sc2 + (opt.extraVar ?? 0)) },
      rawMu: opt.climaMean + (opt.microDelta ?? 0),
      rawSigma: sc,
      equivalentSources: 0,
      contributors: [],
      climatologyOnly: true,
    };
  }

  const c = combine(
    members,
    (i, j) => {
      const a = members[i].src, b = members[j].src;
      if (!a || !b) return 0.5;
      if (a.family === b.family && (a.family === 'obs' || a.family === 'mosmix')) {
        // Point sources of the same kind: their errors are the same missed
        // weather change, and how much they share depends on how far apart they
        // are — not on a single table entry.
        const da = Number.isFinite(a.distanceMeters) ? (a.distanceMeters as number) : 0;
        const db = Number.isFinite(b.distanceMeters) ? (b.distanceMeters as number) : 0;
        return pointPairCorrelation(Math.abs(da - db) + 1_000);
      }
      return familyErrorCorrelation(a.family, b.family);
    },
    CORR_SHRINK,
  );
  if (!c) return null;

  // ── The climatology is the prior, the combined anomaly estimate is a
  // measurement of it. Both limits fall out and neither is hard-coded:
  //   σ_est → 0  (a station, here, now)  ⇒  the measurement wins outright
  //   σ_est → ∞  (no skill left)         ⇒  the climatology wins outright
  const se2 = c.sigma * c.sigma;
  const beta = sc2 / (sc2 + se2);
  const climaMean = opt.climaMean + (opt.microDelta ?? 0);
  const mu = climaMean + beta * c.mu;
  const varPost = (sc2 * se2) / (sc2 + se2);
  const sigma = Math.sqrt(Math.max(1e-9, varPost + (opt.extraVar ?? 0)));

  const total = c.weights.reduce((a, w) => a + Math.abs(w), 0) || 1;
  const seen = new Set<string>();
  const contributors: string[] = [];
  for (const x of members
    .map((m, i) => ({ tag: m.tag, w: Math.abs(c.weights[i]) / total }))
    .sort((a, b) => b.w - a.w)) {
    if (x.w <= 0.05 || seen.has(x.tag)) continue;
    seen.add(x.tag);
    contributors.push(x.tag);
  }

  return {
    dist: { kind: 'normal', mu, sigma },
    rawMu: climaMean + c.mu,
    rawSigma: c.sigma,
    equivalentSources: c.equivalentSources,
    contributors,
    climatologyOnly: false,
  };
}

// ---------------------------------------------------------------------------
// The full hour
// ---------------------------------------------------------------------------

const DIURNAL_PEAK_HOUR = 15;

/** Median of one cloud layer across the sources that carry it. */
function medianLayer(
  samples: PointSourceSample[], key: 'cloudLow' | 'cloudMid' | 'cloudHigh',
): number | null {
  const xs = samples.map((s) => s[key]).filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : 0.5 * (xs[m - 1] + xs[m]);
}

/**
 * Hourly climatological mean temperature from the daily mean plus the diurnal
 * half-amplitude — the shape `climaField` documents.
 */
export function hourlyClimaTemp(dailyMeanC: number, diurnalAmpC: number, localHour: number): number {
  return dailyMeanC + diurnalAmpC * Math.cos((2 * Math.PI * (localHour - DIURNAL_PEAK_HOUR)) / 24);
}

export function fuseHour(
  samples: PointSourceSample[],
  leadH: number,
  ctx: FusionContext,
): FusedPoint {
  const clima = ctx.clima;
  const climaTemp = clima ? clima.tempMeanC : 8;
  const climaTempSigma = clima ? Math.max(1, clima.tempSigmaC) : CLIMA_SIGMA_FALLBACK.temperature;
  // The climatology stores the probability of a wet DAY. Used unchanged as an
  // hourly prior it claims about seven wet hours per day; the real rate is
  // 0,06…0,12. Rain does not fall independently hour by hour, so the conversion
  // uses an effective number of trials per wet day, not 24.
  const wetProbDay = clima ? Math.min(0.95, Math.max(0.02, clima.wetProbDaily)) : 0.30;
  const wetProb = 1 - Math.pow(1 - wetProbDay, 1 / WET_HOURS_PER_WET_DAY);
  // Prior temperature at an arbitrary time, for samples valid at another time
  // than this hour (K-1). Falls back to this hour's value when the reference
  // cannot be resolved, which is the pre-K-1 behaviour.
  const climaAt = ctx.climaAt;
  const climaTempAt = climaAt
    ? (ms: number): number => { const r = climaAt(ms); return r ? r.tempMeanC : climaTemp; }
    : undefined;

  // --- clouds first: the regime assessment needs them, and they need nothing.
  const cloudsRaw = fuseScalar(samples, 'clouds', leadH, ctx, {
    value: (s) => {
      const parts = [s.cloudLow, s.cloudMid, s.cloudHigh].filter((v): v is number => v != null && Number.isFinite(v));
      return parts.length ? Math.min(100, parts.reduce((a, b) => a + b, 0)) : null;
    },
    // DACH annual mean total cover is around 65 %, not 51 %. The wetness term
    // still modulates it — a place that is wet often is cloudy far more often —
    // but the base had to move, or the medium range comes out systematically
    // too sunny and, through the cold-pool gate, with too many clear nights.
    climaMean: 62 + 25 * (wetProbDay - 0.3),
    climaSigma: CLIMA_SIGMA_FALLBACK.clouds,
  });
  // Cover is a percentage: a normal distribution puts real mass above 100 % and
  // below 0 %, which is where "q90 = 109 % cloud cover" comes from.
  const clouds: FusedVariable | null = cloudsRaw && cloudsRaw.dist.kind === 'normal'
    ? { ...cloudsRaw, dist: { kind: 'censoredNormal', mu: cloudsRaw.dist.mu, sigma: cloudsRaw.dist.sigma, lo: 0, hi: 100 } }
    : cloudsRaw;
  const cloudPct = clouds ? quantileOf(clouds.dist, 0.5) : null;
  // For the RADIATION balance the layers do not count equally: low stratus
  // closes the sky, cirrus barely dims it. Summing them and testing one
  // threshold switches the cold pool off for 40 % cirrus plus 30 % stratus.
  const cloudRadPct = radiativeCloudPct(
    medianLayer(samples, 'cloudLow'), medianLayer(samples, 'cloudMid'), medianLayer(samples, 'cloudHigh'),
  ) ?? cloudPct;

  // --- wind: u and v are combined separately, the SPEED follows from the pair.
  // The climatological spread of a wind component is not one number for all of
  // DACH: a sheltered basin scatters by ~2 m/s over the year, an exposed ridge by
  // 8–10. It is also what a long-range forecast converges to, so too small a
  // value crushes a strong synoptic signal on its way through the shrinkage.
  const windSigmaC = windSigmaAt(ctx.elevationM, tpiAt(ctx.terrain, 4_000));
  const windU = fuseScalar(samples, 'wind', leadH, ctx, {
    value: (s) => (s.u == null || !Number.isFinite(s.u) ? null : s.u * windTerrainFactor(s, ctx)),
    climaMean: 0, climaSigma: windSigmaC,
  });
  const windV = fuseScalar(samples, 'wind', leadH, ctx, {
    value: (s) => (s.v == null || !Number.isFinite(s.v) ? null : s.v * windTerrainFactor(s, ctx)),
    climaMean: 0, climaSigma: windSigmaC,
  });

  let windSpeed: FusedVariable | null = null;
  let windDirectionDeg: number | null = null;
  let speedMedian: number | null = null;
  if (windU && windV && windU.dist.kind === 'normal' && windV.dist.kind === 'normal') {
    const mu = Math.hypot(windU.dist.mu, windV.dist.mu);
    const compSigma = Math.sqrt(0.5 * (windU.dist.sigma ** 2 + windV.dist.sigma ** 2));
    windSpeed = {
      dist: { kind: 'rice', nu: mu, sigma: compSigma },
      rawMu: Math.hypot(windU.rawMu, windV.rawMu),
      rawSigma: Math.sqrt(0.5 * (windU.rawSigma ** 2 + windV.rawSigma ** 2)),
      equivalentSources: 0.5 * (windU.equivalentSources + windV.equivalentSources),
      contributors: Array.from(new Set([...windU.contributors, ...windV.contributors])),
      climatologyOnly: windU.climatologyOnly && windV.climatologyOnly,
    };
    speedMedian = quantileOf(windSpeed.dist, 0.5);
    // Both components carry the same shrinkage factor, so the bearing is
    // invariant under it — at lead 300 h the mean vector has essentially
    // vanished (ν/σ ≈ 0,04, circular spread near uniform) and the number would
    // still be reported to the degree. Below a concentration of ~1 the honest
    // answer is that there is no direction.
    if (mu / Math.max(1e-9, compSigma) >= WIND_DIR_MIN_CONCENTRATION) {
      const dirMath = (Math.atan2(-windU.dist.mu, -windV.dist.mu) * 180) / Math.PI;
      windDirectionDeg = (dirMath + 360) % 360;
    }
  }

  // Cold air collects in wide basins as much as in narrow valleys, and a 2,5-km
  // ring reports ~0 for the Swiss plateau or the Danube lowlands — exactly where
  // the classic frost-hollow errors live. Take the deepest depression any scale
  // sees.
  const basinDepthM = Math.max(ctx.sinkDepthM, ...ctx.terrain.tpiM.map((v) => -v));

  // --- regime: needs wind and cloud, supplies the variance inflation for the
  //     temperature. Computed before the temperature, without circularity.
  const regimePre = assessRegime({
    solarElevDeg: ctx.solarElevDeg,
    sinkDepthM: basinDepthM,
    skyView: ctx.skyView,
    windMs: speedMedian,
    cloudPct: cloudRadPct,
    foehnScore: ctx.foehnScore,
    pSnow: null,
  });

  const temperature = fuseScalar(samples, 'temperature', leadH, ctx, {
    value: (s) => {
      if (s.temperature == null || !Number.isFinite(s.temperature)) return null;
      if (s.sourceElevation == null) return s.temperature;
      // Lapse-correct from the source's own reference height to the query point.
      return s.temperature + (s.sourceElevation - ctx.elevationM) * (ctx.lapseRatePerM || 0.0065);
    },
    climaMean: climaTemp,
    climaSigma: climaTempSigma,
    microDelta: ctx.terrainDeltaC,
    climaMeanAt: climaTempAt,
    microDeltaAt: ctx.terrainDeltaAt,
    extraVar: regimePre.tempExtraVar,
  });

  // ── Feuchte über den TAUPUNKT.
  //
  // Fusioniert wird der Taupunkt, nicht die relative Feuchte. Der Taupunkt ist
  // unbeschränkt, additiv und höhenkorrigierbar — RH ist keins davon, und eine
  // Normalverteilung darauf erzeugt Quantile über 100 %. Er folgt außerdem der
  // Luftmasse und ist damit fast so gut vorhersagbar wie die Temperatur, während
  // RH als Quotient die Fehler beider Größen erbt.
  //
  // Quellen, die nur RH melden (Stationen, MOSMIX), werden exakt umgerechnet;
  // GFS liefert den Taupunkt direkt und trägt ihn bis 372 h — vorher endete die
  // Feuchte bei 229 h, weil ihn niemand geholt hat.
  const dewPoint = fuseScalar(samples, 'dewpoint', leadH, ctx, {
    value: (s) => {
      let td: number;
      if (s.dewPoint != null && Number.isFinite(s.dewPoint)) {
        td = s.dewPoint;
      } else {
        if (s.temperature == null || !Number.isFinite(s.temperature)) return null;
        if (s.relativeHumidity == null || !Number.isFinite(s.relativeHumidity)) return null;
        // At the SOURCE's height — the conversion is exact there.
        td = dewPointC(s.temperature, s.relativeHumidity);
      }
      // Lapse-correct the dew point like the temperature (H-2), with its own,
      // three times weaker gradient: it follows the moisture, not the adiabat.
      // Without this a station 800 m below the point carried its dew point up
      // unchanged while the temperature was corrected by 5 K, and the derived
      // humidity came out ~5 points too high (measured: 86,6 % instead of 81 %).
      if (s.sourceElevation == null) return td;
      return td + (s.sourceElevation - ctx.elevationM) * DEWPOINT_LAPSE_PER_M;
    },
    climaMean: climaTemp - DEWPOINT_DEPRESSION_K,
    climaSigma: CLIMA_SIGMA_FALLBACK.dewpoint,
    climaMeanAt: climaTempAt ? (ms) => climaTempAt(ms) - DEWPOINT_DEPRESSION_K : undefined,
  });

  // RH is DERIVED, not fused: RH = f(T, Td), linearised about the two medians.
  //
  // Both uncertainties are propagated, and they are NOT independent. Treating
  // them as independent looks conservative but is simply wrong: at long lead,
  // where both fall back to the climatology, it produced sigma(RH) = 44 % — an
  // interval so wide it says nothing, on a quantity whose climatological spread
  // is around 15 %. The cross term is what makes RH predictable at all: warmer
  // air is usually also moister, so RH moves far less than either T or Td.
  //
  // The correlation is not one number. Between the two ERRORS of two forecasts
  // it is moderate (same boundary-layer scheme, but partly separate mistakes);
  // between the two CLIMATOLOGIES it is high (one air mass carries both). We
  // interpolate with beta — the shrinkage weight that already says how much of
  // the answer is measurement and how much is prior — recovered from the two
  // sigmas: var_post = beta · var_est.
  let humidity: FusedVariable | null = null;
  if (dewPoint && temperature) {
    const tMed = quantileOf(temperature.dist, 0.5);
    const dMed = Math.min(tMed, quantileOf(dewPoint.dist, 0.5));   // Td <= T, always
    const rh = rhFromDewPoint(tMed, dMed);
    const A = 17.62, B = 243.12;
    const dRHdTd = rh * (A * B) / ((B + dMed) * (B + dMed));
    const dRHdT = -rh * (A * B) / ((B + tMed) * (B + tMed));
    const sT = (temperature.dist as { sigma: number }).sigma;
    const sD = (dewPoint.dist as { sigma: number }).sigma;
    const betaOf = (v: FusedVariable) => {
      const est = v.rawSigma;
      if (!Number.isFinite(est) || est <= 0) return 1;
      const post = (v.dist as { sigma?: number }).sigma;
      if (post == null || !Number.isFinite(post)) return 1;
      return Math.max(0, Math.min(1, (post * post) / (est * est)));
    };
    const beta = 0.5 * (betaOf(temperature) + betaOf(dewPoint));
    const r = TD_T_CORR_ERROR + (TD_T_CORR_CLIMA - TD_T_CORR_ERROR) * beta;
    const varRH = dRHdTd * dRHdTd * sD * sD
      + dRHdT * dRHdT * sT * sT
      + 2 * dRHdTd * dRHdT * r * sD * sT;
    const sRH = Math.sqrt(Math.max(1, varRH));
    humidity = {
      dist: { kind: 'censoredNormal', mu: rh, sigma: sRH, lo: 0, hi: 100 },
      rawMu: rh,
      rawSigma: sRH,
      equivalentSources: dewPoint.equivalentSources,
      contributors: dewPoint.contributors,
      climatologyOnly: dewPoint.climatologyOnly && temperature.climatologyOnly,
    };
  } else {
    // Fallback path: nothing carries humidity in any form, and there is no
    // climatology either — otherwise the two blocks above always answer.
    const humidityRaw = fuseScalar(samples, 'humidity', leadH, ctx, {
      value: (s) => s.relativeHumidity,
      climaMean: 75, climaSigma: CLIMA_SIGMA_FALLBACK.humidity,
    });
    humidity = humidityRaw && humidityRaw.dist.kind === 'normal'
      ? { ...humidityRaw, dist: { kind: 'censoredNormal', mu: humidityRaw.dist.mu, sigma: humidityRaw.dist.sigma, lo: 0, hi: 100 } }
      : humidityRaw;
  }
  const rhMedian = humidity ? quantileOf(humidity.dist, 0.5) : null;

  // --- precipitation: TWO stages (K-2).
  //
  //  A  OCCURRENCE, in a probit latent space. A priori y ~ N(0,1), and the hour
  //     is wet iff y > θ = Φ⁻¹(1 − p₀), p₀ the climatological hourly wet
  //     probability. Every source's reading is mapped through the point's
  //     climatological cdf (atom p₀ at zero, lognormal amounts above it) to its
  //     latent quantile — "5 mm/h" becomes "a 2,7-σ hour" — and enters with the
  //     source's OCCURRENCE correlation (`ACC.precipOcc`), raised for large
  //     amounts (tail dependence). A dry report is a censored observation,
  //     y ≤ θ. This is the same calibrate → combine → shrink chain as for every
  //     other variable, run on z = y − θ with prior N(−θ, 1); P(wet) = P(z > 0).
  //  B  AMOUNT, CONDITIONAL ON WET, in ln space (a lognormal): the sources that
  //     report rain are combined with the AMOUNT correlation
  //     (`ACC.precipitation`) and shrunk toward the climatology of WET hours —
  //     not toward dryness. A dry report says nothing about how much it rains
  //     if it does rain.
  //
  //  One correlation for both questions (the previous design) crushed the
  //  amounts: the hourly-amount ACC of ~0,55 at day 1 is mostly timing and
  //  intensity error inside wet spells, and used as the occurrence skill it
  //  turned a 5-mm/h forecast into "41 % dry, median 0,22 mm/h". After the
  //  split the same forecast reads ≈ 80 % wet, median given wet ≈ 3 mm/h.
  //
  //  The result is a hurdle distribution: pDry from A, (mu, sigma) from B.
  //  `rawMu`/`rawSigma` carry the occurrence latent (stage A) for diagnostics.
  const theta = PhiInv(1 - wetProb);
  const wetClim = PRECIP_WET_CLIMA;
  const wetSignal = (r: number) => 1 - Math.exp(-r / PRECIP_OCC_TAIL.refMmH);
  const occurrence = fuseScalar(samples, 'precipOcc', leadH, ctx, {
    value: (s) => {
      if (s.precipitation == null || !Number.isFinite(s.precipitation)) return null;
      const r = Math.max(0, s.precipitation);
      if (r === 0) return 0;                                   // censored (dryCensor)
      // Climatological cdf at r: the dry atom plus the wet-hour lognormal.
      const fWet = Phi((Math.log(r) - wetClim.muLog) / wetClim.sigmaLog);
      const f = Math.min(1 - 1e-9, 1 - wetProb * (1 - fWet));
      return PhiInv(f) - theta;
    },
    climaMean: -theta,
    climaSigma: 1,
    dryCensor: true,
    // The latent is a quantile of the truth's climatology: amplitude 1 by
    // construction. The MOS-amplitude prior (H-1) is about amounts, not this.
    unitAmplitude: true,
    rhoBoost: (s) => PRECIP_OCC_TAIL.boost * wetSignal(Math.max(0, s.precipitation ?? 0)),
  });
  const amount = fuseScalar(samples, 'precipitation', leadH, ctx, {
    value: (s) => (s.precipitation == null || !Number.isFinite(s.precipitation) || !(s.precipitation > 0)
      ? null : Math.log(s.precipitation)),
    climaMean: wetClim.muLog,
    climaSigma: wetClim.sigmaLog,
  });
  let precipitation: FusedVariable | null = null;
  if (occurrence && occurrence.dist.kind === 'normal' && amount && amount.dist.kind === 'normal') {
    const pDry = Math.max(0, Math.min(1, Phi(-occurrence.dist.mu / Math.max(1e-9, occurrence.dist.sigma))));
    precipitation = {
      dist: { kind: 'hurdleLogNormal', pDry, mu: amount.dist.mu, sigma: amount.dist.sigma },
      rawMu: occurrence.rawMu,
      rawSigma: occurrence.rawSigma,
      equivalentSources: occurrence.equivalentSources,
      contributors: Array.from(new Set([...occurrence.contributors, ...amount.contributors])),
      climatologyOnly: occurrence.climatologyOnly && amount.climatologyOnly,
    };
  }

  // --- gusts: use the sources that carry them; otherwise derive from the wind.
  let gust = fuseScalar(samples, 'gust', leadH, ctx, {
    value: (s) => (s.gust == null || !Number.isFinite(s.gust) ? null : s.gust * windTerrainFactor(s, ctx)),
    climaMean: 6, climaSigma: CLIMA_SIGMA_FALLBACK.gust + 0.6 * (windSigmaC - CLIMA_SIGMA_FALLBACK.wind),
  });
  if (!gust && windSpeed) {
    // The gust factor is not a constant. 1,45 is the open-terrain, neutral value;
    // in a decoupled radiation night the ratio falls to ~1,15, because the
    // surface layer no longer exchanges momentum with the air above it. The
    // convective end (2–3 in a downdraft) needs the thunderstorm index and is
    // deliberately not attempted here.
    const gf = GUST_FACTOR_NEUTRAL
      + (GUST_FACTOR_DECOUPLED - GUST_FACTOR_NEUTRAL) * regimePre.coldPool;
    const nu = (windSpeed.dist as { nu: number }).nu;
    const sg = (windSpeed.dist as { sigma: number }).sigma;
    gust = {
      dist: { kind: 'censoredNormal', mu: gf * nu, sigma: Math.hypot(gf * sg, 0.25 * nu + 0.6), lo: 0, hi: 90 },
      rawMu: gf * windSpeed.rawMu,
      rawSigma: gf * windSpeed.rawSigma,
      equivalentSources: windSpeed.equivalentSources,
      contributors: windSpeed.contributors,
      climatologyOnly: windSpeed.climatologyOnly,
    };
  } else if (gust && gust.dist.kind === 'normal') {
    gust = { ...gust, dist: { kind: 'censoredNormal', mu: gust.dist.mu, sigma: gust.dist.sigma, lo: 0, hi: 90 } };
  }
  // A gust is a maximum: it can never sensibly sit below the mean wind.
  if (gust && speedMedian != null && quantileOf(gust.dist, 0.5) < speedMedian) {
    const g = gust.dist as { kind: 'censoredNormal'; mu: number; sigma: number; lo: number; hi: number };
    gust = { ...gust, dist: { ...g, mu: speedMedian * 1.15 } };
  }

  // --- phase, and the second regime pass that knows about it
  // The phase question is only ever asked about an hour in which it precipitates,
  // and precipitating air below cloud base is close to saturated. Using the
  // unconditional humidity — which converges to a climatological 75 % at long
  // lead — moves the dry-bulb 50 % line by 1,7 K, i.e. the snow line by ~250 m,
  // always in the same direction.
  const rhPhase = rhMedian == null
    ? PHASE_RH_SATURATED
    : (1 - PHASE_RH_BLEND) * rhMedian + PHASE_RH_BLEND * PHASE_RH_SATURATED;
  const pSnow = temperature ? snowProbability(temperature.dist, rhPhase) : null;
  const regime = assessRegime({
    solarElevDeg: ctx.solarElevDeg,
    sinkDepthM: basinDepthM,
    skyView: ctx.skyView,
    windMs: speedMedian,
    cloudPct: cloudRadPct,
    foehnScore: ctx.foehnScore,
    pSnow,
  });

  // Föhn also widens the wind; apply it to the component sigma of the Rice law.
  const windSpeedFinal = windSpeed && regime.windExtraVar > 0
    ? { ...windSpeed, dist: inflate(windSpeed.dist, regime.windExtraVar) }
    : windSpeed;

  // The phase-edge term can only be known AFTER the phase has been computed, and
  // the phase needs the temperature. So the first regime pass runs without it
  // and the temperature is widened afterwards — otherwise the term is computed,
  // reported, and never applied, which is what happened before. `inflate` on a
  // normal distribution is mean-preserving, so this only opens the interval.
  const phaseVar = REGIME.phaseVarK2 * regime.phaseEdge;
  const temperatureFinal = temperature && phaseVar > 0
    ? { ...temperature, dist: inflate(temperature.dist, phaseVar) }
    : temperature;

  return {
    temperature: temperatureFinal,
    dewPoint,
    humidity,
    clouds,
    precipitation,
    windSpeed: windSpeedFinal,
    windDirectionDeg,
    gust,
    pSnow,
    regime,
    climaSource: clima ? 'grid' : 'fallback',
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface FuseCheck { name: string; ok: boolean; detail?: string }
export interface FuseVerifyResult { checks: FuseCheck[]; passed: number; failed: number }

function mkSample(over: Partial<PointSourceSample> & { source: string; family: SourceFamily }): PointSourceSample {
  return {
    temperature: null, sourceElevation: null, u: null, v: null, gust: null,
    relativeHumidity: null, snowLine: null, cloudLow: null, cloudMid: null,
    cloudHigh: null, precipitation: null, uvIndex: null, distanceMeters: 0,
    ...over,
  };
}

function flatCtx(over: Partial<FusionContext> = {}): FusionContext {
  const flat: TerrainScales = {
    elevationM: 300,
    ringMeanM: [300, 300, 300, 300, 300, 300],
    spreadM: [0, 0, 0, 0, 0, 0],
    tpiM: [0, 0, 0, 0, 0, 0],
    horizonRad: [0, 0, 0, 0, 0, 0, 0, 0],
    sampledCount: 48,
  };
  return {
    elevationM: 300, lapseRatePerM: 0.0065, terrain: flat, skyView: 1,
    sinkDepthM: 0, terrainDeltaC: 0, solarElevDeg: 20, foehnScore: 0,
    clima: { tempMeanC: 10, tempSigmaC: 6, wetProbDaily: 0.25 },
    ...over,
  };
}

export function verifyFuse(): FuseVerifyResult {
  const checks: FuseCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  // --- A station at the point, right now, must dominate completely.
  {
    const s = [
      mkSample({ source: 'dwd_obs', family: 'obs', temperature: 3.0, sourceElevation: 300, distanceMeters: 200 }),
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 7.0, sourceElevation: 300 }),
    ];
    const r = fuseHour(s, 0, flatCtx());
    const mu = (r.temperature!.dist as { mu: number }).mu;
    const sd = (r.temperature!.dist as { sigma: number }).sigma;
    add('h = 0: ko-lokalisierte Station schlägt das Modell', mu < 3.6, mu.toFixed(3));
    add('h = 0: Streuung klein', sd < 0.9, sd.toFixed(3));
  }

  // --- The same station, three days later, must be nearly worthless.
  {
    const s = [
      mkSample({ source: 'dwd_obs', family: 'obs', temperature: 3.0, sourceElevation: 300, distanceMeters: 200 }),
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 7.0, sourceElevation: 300 }),
    ];
    const r = fuseHour(s, 72, flatCtx());
    const mu = (r.temperature!.dist as { mu: number }).mu;
    add('h = 72: das Modell übernimmt', mu > 6.3, mu.toFixed(3));
  }

  // --- Uncertainty must grow with lead and end at the climatology.
  {
    const s = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 7.0, sourceElevation: 300 })];
    const sds: number[] = [];
    for (const h of [0, 24, 72, 168, 240]) {
      const r = fuseHour(s, h, flatCtx());
      sds.push((r.temperature!.dist as { sigma: number }).sigma);
    }
    let mono = true;
    for (let i = 1; i < sds.length; i++) if (sds[i] < sds[i - 1] - 1e-9) mono = false;
    add('Streuung wächst monoton mit dem Vorlauf', mono, sds.map((x) => x.toFixed(2)).join(' → '));
    add('Streuung bleibt unter der Klimatologie (6 K)', sds[sds.length - 1] < 6, sds[sds.length - 1].toFixed(3));

    // Beyond every source horizon the model has nothing left to say — but the
    // climatology still does. The answer must then BE the climatology: the
    // climatological mean, no contributor, and the marker set. Any other value
    // there would be an invented forecast.
    const far = fuseHour(s, 400, flatCtx());
    const t = far.temperature;
    add('jenseits aller Quellen-Horizonte: Klimatologie statt einer erfundenen Aussage',
      t != null && t.climatologyOnly === true && t.contributors.length === 0
      && Math.abs((t.dist as { mu: number }).mu - 10) < 1e-9,
      t ? (t.dist as { mu: number }).mu.toFixed(6) + ' °C, ' + (t.climatologyOnly ? 'markiert' : 'NICHT markiert') : 'null');
    // Negative control for exactly that: the source value was 24 °C, so a leak
    // would be visible as a mean well above the climatological 10 °C.
    add('Negativkontrolle: der Quellenwert (24 °C) sickert nicht durch',
      t != null && Math.abs((t.dist as { mu: number }).mu - 24) > 13);
  }

  // --- The mean must converge to the climatology, not to a floor.
  {
    const s = [mkSample({ source: 'gfs', family: 'global', temperature: 25, sourceElevation: 300 })];
    const near0 = fuseHour(s, 6, flatCtx());
    const far = fuseHour(s, 330, flatCtx());
    const muNear = (near0.temperature!.dist as { mu: number }).mu;
    const muFar = (far.temperature!.dist as { mu: number }).mu;
    add('kurzfristig folgt der Wert der Quelle', muNear > 22, muNear.toFixed(2));
    // Bei Lead 330 h überlebt nur noch der großskalige Anteil: die Anomalie muss
    // deutlich geschrumpft, aber nicht ausgelöscht sein — genau das leistet die
    // langsame Komponente der ACC-Kurve.
    const keptFar = (muFar - 10) / 15;
    add('langfristig zieht er zur Klimatologie (10 °C)', muFar < 16 && muFar > 10, muFar.toFixed(2));
    add('bei Lead 330 h überlebt weniger als die Hälfte der Anomalie',
      keptFar < 0.5 && keptFar > 0.05, (keptFar * 100).toFixed(0) + ' %');
  }

  // --- Terrain: the SAME three models must be trusted less in the Alps.
  {
    const alpine: TerrainScales = {
      elevationM: 1000,
      ringMeanM: [1050, 1120, 1250, 1400, 1500, 1550],
      // Inner-alpine valley floor: the walls rise 500 m within a kilometre.
      spreadM: [80, 180, 350, 550, 700, 800],
      tpiM: [-90, -220, -450, -700, -850, -950],
      horizonRad: [0.02, 0.5, 0.7, 0.5, 0.02, 0.5, 0.7, 0.5],
      sampledCount: 48,
    };
    const s = [
      mkSample({ source: 'arome_at', family: 'highres', temperature: 5 }),
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 5, sourceElevation: 1000, distanceMeters: 18_000 }),
    ];
    const sFlat = [
      mkSample({ source: 'arome_at', family: 'highres', temperature: 5 }),
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 5, sourceElevation: 300, distanceMeters: 18_000 }),
    ];
    const flat = fuseHour(sFlat, 12, flatCtx());
    const alps = fuseHour(s, 12, flatCtx({
      terrain: alpine, elevationM: 1000, sinkDepthM: 250, skyView: 0.75,
    }));
    const sdFlat = (flat.temperature!.dist as { sigma: number }).sigma;
    const sdAlps = (alps.temperature!.dist as { sigma: number }).sigma;
    add('gleiche Modelle, komplexes Gelände ⇒ ehrlich breitere Verteilung',
      sdAlps > sdFlat * 1.4, `${sdFlat.toFixed(2)} → ${sdAlps.toFixed(2)} K`);
  }

  // --- Correlated models must not manufacture certainty.
  {
    const one = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 5, sourceElevation: 300 })];
    const three = [
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 5, sourceElevation: 300 }),
      mkSample({ source: 'icon_d2', family: 'highres', temperature: 5 }),
      mkSample({ source: 'arome_at', family: 'highres', temperature: 5 }),
    ];
    const withObs = [
      ...one,
      mkSample({ source: 'dwd_obs', family: 'obs', temperature: 5, sourceElevation: 300, distanceMeters: 500 }),
    ];
    const sd1 = (fuseHour(one, 2, flatCtx()).temperature!.dist as { sigma: number }).sigma;
    const sd3 = (fuseHour(three, 2, flatCtx()).temperature!.dist as { sigma: number }).sigma;
    const sdObs = (fuseHour(withObs, 2, flatCtx()).temperature!.dist as { sigma: number }).sigma;
    add('drei verwandte Modelle bringen nur wenig Sicherheit',
      sd3 > sd1 * 0.6, `${sd1.toFixed(3)} → ${sd3.toFixed(3)}`);
    add('eine unabhängige Station bringt mehr als zwei weitere Modelle',
      sdObs < sd3, `${sdObs.toFixed(3)} < ${sd3.toFixed(3)}`);
  }

  // --- Wind: light and uncertain must never produce a negative quantile.
  {
    const s = [
      mkSample({ source: 'mosmix', family: 'mosmix', u: 0.3, v: -0.2, sourceElevation: 300 }),
      mkSample({ source: 'icon_d2', family: 'highres', u: -0.4, v: 0.5 }),
    ];
    const r = fuseHour(s, 48, flatCtx());
    const q10 = quantileOf(r.windSpeed!.dist, 0.1);
    add('Flaute: q10 der Windgeschwindigkeit ≥ 0', q10 >= 0, q10.toFixed(4));
    add('Flaute: Verteilung ist rechtsschief', quantileOf(r.windSpeed!.dist, 0.5) < 3);
    // Bei Flaute mit widersprüchlichen Quellen ist der Mittelvektor praktisch
    // null — eine Gradzahl wäre eine erfundene Zahl.
    add('Flaute: keine Windrichtung statt einer erfundenen', r.windDirectionDeg === null);
    const strong = fuseHour([
      mkSample({ source: 'mosmix', family: 'mosmix', u: -9, v: -3, sourceElevation: 300 }),
      mkSample({ source: 'icon_d2', family: 'highres', u: -8.4, v: -3.4 }),
    ], 6, flatCtx());
    add('kräftiger Wind: Richtung wird gemeldet',
      strong.windDirectionDeg != null && strong.windDirectionDeg > 45 && strong.windDirectionDeg < 135,
      String(strong.windDirectionDeg?.toFixed(0)));
  }

  // --- A synoptic storm must survive the shrinkage.
  //     The wind prior is a ZERO vector (there is no wind climatology), so any
  //     spread that is too small, or any representativeness that only widens,
  //     turns "the model cannot know" into "probably calm". A 15 m/s storm came
  //     out at 5 m/s before the shelter was moved onto the mean.
  {
    const storm = [
      mkSample({ source: 'mosmix', family: 'mosmix', u: -15, v: -5, sourceElevation: 300, distanceMeters: 11_000 }),
      mkSample({ source: 'icon_d2', family: 'highres', u: -14.2, v: -5.6 }),
    ];
    const flat = fuseHour(storm, 6, flatCtx());
    const med = quantileOf(flat.windSpeed!.dist, 0.5);
    add('Sturm in der Ebene überlebt die Schrumpfung',
      med > 13 && med < 17, `${med.toFixed(1)} m/s (Quellen ~15,6)`);
    add('Sturm: q10 deutlich über Windstille', quantileOf(flat.windSpeed!.dist, 0.1) > 10,
      quantileOf(flat.windSpeed!.dist, 0.1).toFixed(1));
    add('Sturm: Richtung wird gemeldet', flat.windDirectionDeg != null);

    // Same storm on a sheltered valley floor: reduced, but not annihilated.
    const sheltered: TerrainScales = {
      elevationM: 600,
      ringMeanM: [700, 900, 1200, 1500, 1700, 1800],
      spreadM: [80, 180, 350, 550, 700, 800],
      tpiM: [-100, -300, -600, -900, -1100, -1200],
      horizonRad: [0.02, 0.6, 0.8, 0.6, 0.02, 0.6, 0.8, 0.6],
      sampledCount: 48,
    };
    const valley = fuseHour(storm, 6, flatCtx({ terrain: sheltered, elevationM: 600, skyView: 0.6, sinkDepthM: 400 }));
    const vMed = quantileOf(valley.windSpeed!.dist, 0.5);
    add('derselbe Sturm im tiefen Tal: abgeschirmt, aber nicht ausgelöscht',
      vMed > 4 && vMed < med, `${vMed.toFixed(1)} m/s statt ${med.toFixed(1)}`);
    add('Tal: die Verteilung ist dabei breiter als in der Ebene',
      (quantileOf(valley.windSpeed!.dist, 0.9) - quantileOf(valley.windSpeed!.dist, 0.1))
      > (quantileOf(flat.windSpeed!.dist, 0.9) - quantileOf(flat.windSpeed!.dist, 0.1)));

    // On a ridge the same synoptic wind must come out FASTER.
    const ridge: TerrainScales = {
      elevationM: 2000,
      ringMeanM: [1900, 1750, 1500, 1300, 1200, 1150],
      spreadM: [60, 140, 260, 400, 500, 560],
      tpiM: [100, 250, 500, 700, 800, 850],
      horizonRad: [0, 0, 0, 0, 0, 0, 0, 0],
      sampledCount: 48,
    };
    const top = fuseHour(storm, 6, flatCtx({ terrain: ridge, elevationM: 2000, skyView: 1, sinkDepthM: 0 }));
    add('derselbe Sturm auf dem Kamm: schneller als in der Ebene',
      quantileOf(top.windSpeed!.dist, 0.5) > med + 1,
      `${quantileOf(top.windSpeed!.dist, 0.5).toFixed(1)} vs ${med.toFixed(1)} m/s`);
  }

  // --- Gust must never fall below the mean wind.
  {
    const s = [
      mkSample({ source: 'mosmix', family: 'mosmix', u: -8, v: 0, gust: 4, sourceElevation: 300 }),
    ];
    const r = fuseHour(s, 6, flatCtx());
    const qw = quantileOf(r.windSpeed!.dist, 0.5);
    const qg = quantileOf(r.gust!.dist, 0.5);
    add('Böe nie unter dem Mittelwind', qg >= qw - 1e-6, `${qg.toFixed(2)} ≥ ${qw.toFixed(2)}`);
  }

  // --- Precipitation: dry probability and amount stay consistent.
  {
    const dry = [mkSample({ source: 'mosmix', family: 'mosmix', precipitation: 0, sourceElevation: 300 })];
    const wet = [mkSample({ source: 'mosmix', family: 'mosmix', precipitation: 3.5, sourceElevation: 300 })];
    const rd = fuseHour(dry, 6, flatCtx()).precipitation!;
    const rw = fuseHour(wet, 6, flatCtx()).precipitation!;
    const pDry = 1 - Math.max(0, Math.min(1, 1 - cdf0(rd.dist)));
    add('trockene Prognose ⇒ hohe Trockenwahrscheinlichkeit', cdf0(rd.dist) > 0.7, cdf0(rd.dist).toFixed(3));
    // Eine EINZELNE Modellstunde mit 3,5 mm/h lässt bei Lead 6 ehrlich noch reichlich
    // Raum für „doch trocken" — Zeitversatz von ±1 h ist der Normalfall. Geprüft wird
    // deshalb der Kontrast, nicht eine gesetzte Schwelle.
    add('nasse Prognose senkt die Trockenwahrscheinlichkeit deutlich',
      cdf0(rw.dist) < cdf0(rd.dist) - 0.4, `${cdf0(rd.dist).toFixed(3)} → ${cdf0(rw.dist).toFixed(3)}`);
    add('nasse Prognose ⇒ q90 deutlich über 0', quantileOf(rw.dist, 0.9) > 1, quantileOf(rw.dist, 0.9).toFixed(2));
    add('Niederschlagsquantile nie negativ', quantileOf(rw.dist, 0.01) >= 0 && quantileOf(rd.dist, 0.99) >= 0);
    void pDry;
  }

  // --- Radar in the first hours must beat the model on precipitation.
  {
    const s = [
      mkSample({ source: 'mosmix', family: 'mosmix', precipitation: 0, sourceElevation: 300 }),
      mkSample({ source: 'radolan', family: 'nowcast', precipitation: 4 }),
    ];
    const now = fuseHour(s, 1, flatCtx()).precipitation!;
    const later = fuseHour(s, 12, flatCtx()).precipitation!;
    add('h = 1: Radar dominiert den Niederschlag', cdf0(now.dist) < 0.35, cdf0(now.dist).toFixed(3));
    add('h = 12: das Radar ist raus, das Modell übernimmt', cdf0(later.dist) > 0.6, cdf0(later.dist).toFixed(3));
  }

  // --- Cold pool widens; a windy night does not.
  {
    const s = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 2, sourceElevation: 800, u: 0.2, v: 0, cloudLow: 5 })];
    const basin = flatCtx({ elevationM: 800, sinkDepthM: 220, skyView: 0.7, solarElevDeg: -25 });
    const windy = flatCtx({ elevationM: 800, sinkDepthM: 220, skyView: 0.7, solarElevDeg: -25 });
    const sWindy = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 2, sourceElevation: 800, u: 8, v: 0, cloudLow: 5 })];
    const a = (fuseHour(s, 6, basin).temperature!.dist as { sigma: number }).sigma;
    const b = (fuseHour(sWindy, 6, windy).temperature!.dist as { sigma: number }).sigma;
    add('Kaltluftsee-Nacht ist unsicherer als eine windige Nacht', a > b, `${a.toFixed(2)} vs ${b.toFixed(2)} K`);
  }

  // --- Phase probability reacts to humidity, not just to temperature.
  {
    const dryAir = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 2, relativeHumidity: 35, precipitation: 1, sourceElevation: 300 })];
    const wetAir = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 2, relativeHumidity: 95, precipitation: 1, sourceElevation: 300 })];
    const pd = fuseHour(dryAir, 3, flatCtx()).pSnow!;
    const pw = fuseHour(wetAir, 3, flatCtx()).pSnow!;
    add('+2 °C, trockene Luft ⇒ eher Schnee', pd > pw + 0.15, `${pd.toFixed(3)} vs ${pw.toFixed(3)}`);
  }

  // --- THE shrinkage slope: β must be ρ, not ρ² — for RAW model output (α = 1).
  //     Writing a source as "truth plus independent noise" implicitly assumes it
  //     swings wider than reality, which no forecast system does — and shrinks a
  //     medium-range anomaly ~40 % too far toward the climatology.
  {
    const climaT = 10, sigC = 6;
    for (const h of [24, 72, 168]) {
      const rho = accAt(ACC.temperature.global, h);
      const s1 = [mkSample({ source: 'gfs', family: 'global', temperature: climaT + 10, sourceElevation: 300 })];
      const r = fuseHour(s1, h, flatCtx())!;
      const mu = (r.temperature!.dist as { mu: number }).mu;
      const slope = (mu - climaT) / 10;
      add(`Schrumpfung bei h = ${h} folgt ρ, nicht ρ² (rohes Modell)`,
        Math.abs(slope - rho) < 0.02, `β = ${slope.toFixed(3)}, ρ = ${rho.toFixed(3)}, ρ² = ${(rho * rho).toFixed(3)}`);
      // Restunsicherheit muss σ_c·√(1−ρ²) sein.
      const sd = (r.temperature!.dist as { sigma: number }).sigma;
      add(`Restunsicherheit bei h = ${h} ist σ_c·√(1−ρ²)`,
        Math.abs(sd - sigC * Math.sqrt(1 - rho * rho)) < 0.15,
        `${sd.toFixed(3)} vs ${(sigC * Math.sqrt(1 - rho * rho)).toFixed(3)}`);
    }
    // H-1: a MOS product is already damped. Under the prior exponent ½ its net
    // slope is ρ/α = √ρ — visibly LESS shrinkage than ρ — and the residual
    // spread is unchanged, because α cancels in the variance.
    for (const h of [72, 168]) {
      const rho = accAt(ACC.temperature.mosmix, h);
      const s1 = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: climaT + 10, sourceElevation: 300 })];
      const r = fuseHour(s1, h, flatCtx())!;
      const slope = ((r.temperature!.dist as { mu: number }).mu - climaT) / 10;
      add(`H-1: MOSMIX bei h = ${h} wird um √ρ geschrumpft, nicht um ρ`,
        Math.abs(slope - Math.sqrt(rho)) < 0.02 && slope > rho + 0.03,
        `Steigung ${slope.toFixed(3)}, √ρ = ${Math.sqrt(rho).toFixed(3)}, ρ = ${rho.toFixed(3)}`);
      const sd = (r.temperature!.dist as { sigma: number }).sigma;
      add(`H-1: Restunsicherheit von MOSMIX bei h = ${h} bleibt σ_c·√(1−ρ²)`,
        Math.abs(sd - sigC * Math.sqrt(1 - rho * rho)) < 0.15,
        `${sd.toFixed(3)} vs ${(sigC * Math.sqrt(1 - rho * rho)).toFixed(3)}`);
    }
  }

  // --- the best precipitation source must give the HIGHEST dry probability
  {
    const dry = (src: string, fam: SourceFamily, lead: number) => cdf0(
      fuseHour([mkSample({ source: src, family: fam, precipitation: 0, sourceElevation: 300 })], lead, flatCtx()).precipitation!.dist,
    );
    const radar = dry('radolan', 'nowcast', 0);
    const model = dry('icon_d2', 'highres', 0);
    const global = dry('gfs', 'global', 0);
    add('Radar ohne Echo ist die STÄRKSTE Trockenaussage',
      radar > model && model >= global - 0.01,
      `Radar ${radar.toFixed(3)} > ICON ${model.toFixed(3)} ≥ GFS ${global.toFixed(3)}`);
    add('eine trockene Meldung macht es trockener als die Klimatologie',
      radar > 0.9, radar.toFixed(3));
  }

  // --- no step at a source horizon
  {
    const s1 = [
      mkSample({ source: 'icon_d2', family: 'highres', temperature: 20 }),
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 20, sourceElevation: 300 }),
      mkSample({ source: 'gfs', family: 'global', temperature: 20, sourceElevation: 300 }),
    ];
    let worst = 0, at = 0;
    let prev = (fuseHour(s1, 40, flatCtx()).temperature!.dist as { mu: number }).mu;
    for (let h = 41; h <= 250; h++) {
      const cur = fuseHour(s1, h, flatCtx()).temperature;
      if (!cur) break;
      const mu = (cur.dist as { mu: number }).mu;
      if (Math.abs(mu - prev) > worst) { worst = Math.abs(mu - prev); at = h; }
      prev = mu;
    }
    add('kein Sprung, wenn eine Quelle ihren Horizont erreicht',
      worst < 0.25, `größter Stundenschritt ${worst.toFixed(3)} K bei h = ${at}`);
  }

  // --- NEGATIVE CONTROL: without sources AND without a climatology there must
  //     be nothing. The fixed fallback constants (8 °C, 30 % wet) exist so the
  //     shrinkage has something to pull against while sources are present; as a
  //     stand-alone answer they would be an invented number.
  {
    const empty = fuseHour([], 6, flatCtx({ clima: null }));
    add('Negativkontrolle: ohne Quellen UND ohne Klimatologie keine Verteilung',
      empty.temperature === null && empty.dewPoint === null && empty.humidity === null
      && empty.precipitation === null && empty.windSpeed === null && empty.gust === null
      && empty.clouds === null);
  }

  // --- CLIMATOLOGY AS THE LAST MEMBER: with a climatology but no source we must
  //     answer, and the answer must be recognisable as the climatology.
  {
    const c = fuseHour([], 6, flatCtx());
    const t = c.temperature;
    add('ohne Quellen, aber mit Klimatologie: es gibt eine Verteilung', t != null);
    if (t) {
      const mu = (t.dist as { mu: number }).mu;
      const sd = (t.dist as { sigma: number }).sigma;
      add('Klimatologie-Fall ist als solcher markiert', t.climatologyOnly === true);
      add('Klimatologie-Fall nennt keine Quelle', t.contributors.length === 0 && t.equivalentSources === 0);
      add('Klimatologie-Mittel ist das klimatologische Mittel', Math.abs(mu - 10) < 1e-9, mu.toFixed(6));
      // The raw value must be the climatological spread EXACTLY; the emitted
      // distribution may be a little wider, because the regime terms (phase
      // edge, cold pool) apply to the climatology as well — a 10 °C climatology
      // with a 6 K spread really does put mass near the rain/snow boundary.
      add('Klimatologie-Streuung ist exakt die klimatologische Streuung', Math.abs(t.rawSigma - 6) < 1e-9, t.rawSigma.toFixed(6));
      add('Regime-Aufschläge verbreitern sie höchstens leicht', sd >= 6 && sd < 6.5, sd.toFixed(6));
    }
    add('Klimatologie trägt alle sechs Größen',
      c.dewPoint != null && c.humidity != null && c.precipitation != null
      && c.windSpeed != null && c.gust != null && c.clouds != null);
    // Derived RH must not blow up when both inputs are the climatology. With T
    // and Td treated as independent this came out at 44 % — wider than the
    // variable's whole plausible range.
    if (c.humidity) {
      const sRH = (c.humidity.dist as { sigma: number }).sigma;
      add('Klimatologie-RH bleibt in der Nähe der klimatologischen Streuung',
        sRH > 8 && sRH < 26, sRH.toFixed(2) + ' %');
    }
    // The dry probability must stay the climatological one, not drift.
    if (c.precipitation) {
      const pDry = cdf0(c.precipitation.dist);
      const wetHour = 1 - Math.pow(1 - 0.25, 1 / 6);
      add('Klimatologie-Nässe entspricht der klimatologischen Stundenrate',
        Math.abs((1 - pDry) - wetHour) < 0.02, ((1 - pDry) * 100).toFixed(2) + ' % vs ' + (wetHour * 100).toFixed(2) + ' %');
    }
  }

  // --- The marker must be FALSE as long as anything real contributes.
  {
    const s = [mkSample({ source: 'icon_eu', family: 'global', temperature: 5.0 })];
    const r = fuseHour(s, 24, flatCtx());
    add('mit Quelle ist die Verteilung nicht als Klimatologie markiert',
      r.temperature?.climatologyOnly === false && (r.temperature?.contributors.length ?? 0) > 0);
  }

  // --- The time axis must no longer end with the last source.
  {
    const s = [mkSample({ source: 'icon_eu', family: 'global', temperature: 5.0, u: 3, v: 1, precipitation: 0.2, relativeHumidity: 70, cloudLow: 40 })];
    const far = fuseHour(s, 336, flatCtx());
    const names: Array<[string, FusedVariable | null]> = [
      ['Temperatur', far.temperature], ['Taupunkt', far.dewPoint], ['Feuchte', far.humidity],
      ['Niederschlag', far.precipitation], ['Wind', far.windSpeed], ['Böen', far.gust],
      ['Bewölkung', far.clouds],
    ];
    const missing = names.filter(([, v]) => v == null).map(([n]) => n);
    add('336 h: jede Größe trägt eine Verteilung', missing.length === 0,
      missing.length ? 'fehlt: ' + missing.join(', ') : 'alle sieben');
  }

  // --- The long range must converge to the climatology FROM BOTH SIDES. A wind
  //     forecast that merely decays looks the same from above and is wrong: a
  //     storm has to come down to the climatological wind, and a flat calm has
  //     to come UP to it. This is the property that separates a shrinkage from
  //     a fade-out, and it is only visible with two opposite starting points.
  {
    const at = (h: number, u: number) => {
      const src = h <= 372
        ? [mkSample({ source: 'gfs', family: 'global', u, v: 0 })]
        : [];
      const r = fuseHour(src, h, flatCtx());
      return r.windSpeed ? quantileOf(r.windSpeed.dist, 0.5) : null;
    };
    const stormNear = at(0, 12), stormFar = at(336, 12);
    const calmNear = at(0, 1), calmFar = at(336, 1);
    add('336 h: der Sturm kommt von oben zur Klimatologie herunter',
      stormNear != null && stormFar != null && stormFar < stormNear - 4,
      `${stormNear?.toFixed(2)} → ${stormFar?.toFixed(2)} m/s`);
    add('336 h: die Flaute kommt von unten zur Klimatologie herauf',
      calmNear != null && calmFar != null && calmFar > calmNear + 1,
      `${calmNear?.toFixed(2)} → ${calmFar?.toFixed(2)} m/s`);
    add('336 h: beide landen auf demselben Wert (die Klimatologie)',
      stormFar != null && calmFar != null && Math.abs(stormFar - calmFar) < 0.6,
      `Δ = ${Math.abs((stormFar ?? 0) - (calmFar ?? 0)).toFixed(3)} m/s`);
    // Negative control: a pure decay would fail the second check, so state the
    // number the wind must NOT fall to.
    add('336 h: die Windgeschwindigkeit fällt nicht gegen null',
      stormFar != null && stormFar > 3, `${stormFar?.toFixed(2)} m/s`);
  }

  // --- The direction is gated by concentration, not by a horizon: it ends when
  //     the mean vector is no longer long compared to its spread. That is why it
  //     ends EARLIER for a weak wind than for a strong one — a horizon cannot do
  //     that, and a fixed lead cut-off would be a lie in both directions.
  {
    const lastDir = (u: number) => {
      let last = -1;
      for (let h = 0; h <= 400; h++) {
        const src = h <= 372 ? [mkSample({ source: 'gfs', family: 'global', u, v: 0 })] : [];
        if (fuseHour(src, h, flatCtx()).windDirectionDeg != null) last = h;
      }
      return last;
    };
    const strong = lastDir(12), weak = lastDir(3);
    add('Windrichtung: starker Wind trägt sie länger als schwacher',
      strong > weak, `12 m/s bis ${strong} h, 3 m/s bis ${weak} h`);
    add('Windrichtung endet vor der Geschwindigkeit (Konzentrations-Gate greift)',
      strong < 372 && strong > 100, `${strong} h`);
  }

  // --- K-1: a station reused for h > 0 is ANOMALY persistence, which needs the
  //     climatology of the MEASUREMENT hour. With a diurnal climatology the two
  //     differ by kelvins within one morning; against the target hour's
  //     climatology the station would drag the rise down.
  {
    const t0 = Date.UTC(2026, 3, 15, 6, 0, 0);            // 06 UTC; lng 0 ⇒ local = UTC
    const at = (ms: number): ClimaRef => {
      const d = new Date(ms);
      const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
      // 10 °C at 06, half-amplitude 4 K, maximum at 15 ⇒ 11,79 °C at 08, 14,0 °C at 11.
      const shape = (x: number) => Math.cos((2 * Math.PI * (x - 15)) / 24);
      return { tempMeanC: 10 + 4 * (shape(hr) - shape(6)), tempSigmaC: 6, wetProbDaily: 0.25 };
    };
    const h = 2, tsH = t0 + h * 3_600_000;
    const ctxH = flatCtx({ clima: at(tsH), climaAt: at });
    const obs = mkSample({ source: 'dwd_obs', family: 'obs', temperature: 8, sourceElevation: 300, distanceMeters: 300, validAtMs: t0 });
    const mos = mkSample({ source: 'mosmix', family: 'mosmix', temperature: 12, sourceElevation: 300, distanceMeters: 5_000 });
    const rho = accAt(ACC.temperature.obs, h);
    const persist = at(tsH).tempMeanC + rho * (8 - 10);   // anomaly −2 K carried forward ⇒ 9,84 °C
    const alone = (fuseHour([obs], h, ctxH).temperature!.dist as { mu: number }).mu;
    add('K-1: Station allein bei h = 2 ist Anomaliepersistenz (≈ 9,84 °C)',
      Math.abs(alone - persist) < 0.15, `${alone.toFixed(3)} vs ${persist.toFixed(3)}`);
    const both = (fuseHour([obs, mos], h, ctxH).temperature!.dist as { mu: number }).mu;
    add('K-1: Station + MOSMIX bei h = 2 liegt zwischen beiden, nahe MOSMIX',
      both > 11.0 && both < 12.0, both.toFixed(3));
    // NEGATIVE CONTROL: without `validAtMs` the value is taken as valid for the
    // target hour — value persistence — and the station pulls the morning down
    // by more than a kelvin. If this ever stops failing, K-1 is back.
    const obsNoTime = mkSample({ source: 'dwd_obs', family: 'obs', temperature: 8, sourceElevation: 300, distanceMeters: 300 });
    const oldAlone = (fuseHour([obsNoTime], h, ctxH).temperature!.dist as { mu: number }).mu;
    const oldBoth = (fuseHour([obsNoTime, mos], h, ctxH).temperature!.dist as { mu: number }).mu;
    add('K-1 Negativkontrolle: ohne Gültigkeitszeit bleibt es Wertpersistenz (≈ 8 °C, Fusion < 11)',
      oldAlone < 8.5 && oldBoth < 11.0, `${oldAlone.toFixed(2)} / ${oldBoth.toFixed(2)}`);
    // With a flat climatology there is nothing to correct: both must be identical.
    const flatA = (fuseHour([obs, mos], h, flatCtx()).temperature!.dist as { mu: number }).mu;
    const flatB = (fuseHour([obsNoTime, mos], h, flatCtx()).temperature!.dist as { mu: number }).mu;
    add('K-1: bei flacher Klimatologie ändert die Gültigkeitszeit nichts', Math.abs(flatA - flatB) < 1e-9);
    // And at the measurement hour itself the two readings coincide by construction.
    const ctx0 = flatCtx({ clima: at(t0), climaAt: at });
    const now0 = (fuseHour([obs, mos], 0, ctx0).temperature!.dist as { mu: number }).mu;
    const old0 = (fuseHour([obsNoTime, mos], 0, ctx0).temperature!.dist as { mu: number }).mu;
    add('K-1: bei h = 0 (Messzeit = Zielstunde) identisch', Math.abs(now0 - old0) < 1e-9);
  }

  // --- K-3: the origin of the climatological prior is visible on the result.
  {
    const s = [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 25, sourceElevation: 300 })];
    add('K-3: mit Klimatologie ist die Quelle „grid"', fuseHour(s, 200, flatCtx()).climaSource === 'grid');
    const fb = fuseHour(s, 200, flatCtx({ clima: null }));
    add('K-3: ohne Klimatologie ist der Rückfall markiert', fb.climaSource === 'fallback');
    // Negative control: the fallback really does pull toward 8 °C — an unmarked
    // result would be a plausible-looking forecast that is kelvins wrong.
    const mu = (fb.temperature!.dist as { mu: number }).mu;
    add('K-3 Negativkontrolle: der Rückfall zieht 25 °C messbar Richtung 8 °C (darum der Marker)',
      mu < 24 && fb.temperature!.climatologyOnly === false, mu.toFixed(2));
  }

  // --- H-2: the dew point is lapse-corrected like the temperature, with its
  //     own gradient (1,8 K/km) — a station 800 m below the point must not
  //     carry its dew point up unchanged.
  {
    const mk = (elev: number) => [mkSample({ source: 'mosmix', family: 'mosmix', temperature: 15, relativeHumidity: 60, sourceElevation: elev, distanceMeters: 8_000 })];
    const high = flatCtx({
      elevationM: 1100, terrain: { ...flatCtx().terrain, elevationM: 1100 },
      clima: { tempMeanC: 5, tempSigmaC: 6, wetProbDaily: 0.3 },
    });
    const tdStation = dewPointC(15, 60);                                  // 7,29 °C at 300 m
    const tdFrom300 = quantileOf(fuseHour(mk(300), 3, high).dewPoint!.dist, 0.5);
    const tdFrom1100 = quantileOf(fuseHour(mk(1100), 3, high).dewPoint!.dist, 0.5);
    add('H-2: Taupunkt einer 800 m tieferen Station wird um ≈ 1,4 K abgesenkt',
      tdFrom1100 - tdFrom300 > 1.0 && tdFrom1100 - tdFrom300 < 1.8,
      `${tdFrom300.toFixed(2)} (Station ${tdStation.toFixed(2)}) vs ${tdFrom1100.toFixed(2)} bei gleicher Höhe`);
    const rh = quantileOf(fuseHour(mk(300), 3, high).humidity!.dist, 0.5);
    add('H-2: abgeleitete Feuchte am Punkt bleibt unter 85 %', rh < 85, rh.toFixed(1) + ' %');
  }

  // --- K-2: "whether" and "how much, if so" are two questions with two skills.
  //     With one amount correlation for both, a 5-mm/h forecast at day 1 came
  //     out as 41 % dry with a median of 0,22 mm/h.
  {
    const fc = (src: string, fam: SourceFamily, mm: number, lead: number) =>
      fuseHour([mkSample({ source: src, family: fam, precipitation: mm, sourceElevation: fam === 'mosmix' ? 300 : null })], lead, flatCtx()).precipitation!;
    const pWet = (v: FusedVariable) => 1 - cdf0(v.dist);
    const condMedian = (v: FusedVariable) => Math.exp((v.dist as { mu: number }).mu);
    const r24 = fc('mosmix', 'mosmix', 5, 24);
    add('K-2: MOSMIX 5 mm/h bei 24 h ⇒ P(nass) ≥ 0,7 (vorher 59 %)', pWet(r24) >= 0.7, (pWet(r24) * 100).toFixed(0) + ' %');
    add('K-2: … Median ≥ 1,5 mm/h (vorher 0,22)', quantileOf(r24.dist, 0.5) >= 1.5, quantileOf(r24.dist, 0.5).toFixed(2));
    add('K-2: … bedingter Median (nass) 2–5 mm/h — zur Nassstunden-Klimatologie geschrumpft, nicht zur Trockenheit',
      condMedian(r24) >= 2 && condMedian(r24) <= 5, condMedian(r24).toFixed(2));
    const r48 = fc('mosmix', 'mosmix', 10, 48);
    add('K-2: 10 mm/h bei 48 h ⇒ P(nass) ≥ 0,65 und Median ≥ 2 mm/h (vorher 49 % trocken, 0,03 mm/h)',
      pWet(r48) >= 0.65 && quantileOf(r48.dist, 0.5) >= 2,
      `${(pWet(r48) * 100).toFixed(0)} %, Median ${quantileOf(r48.dist, 0.5).toFixed(2)} mm/h`);
    const radar = fc('radolan', 'nowcast', 5, 1);
    add('K-2: Radar 5 mm/h bei 1 h ⇒ Mittel ≥ 3,5 mm/h (vorher 2,85)', meanOf(radar.dist) >= 3.5, meanOf(radar.dist).toFixed(2));
    // Tail dependence: a heavy signal is a more certain wet call than drizzle.
    const light = fc('mosmix', 'mosmix', 0.1, 24);
    add('K-2: 0,1 mm/h ist eine deutlich schwächere Nass-Aussage als 5 mm/h',
      pWet(light) < pWet(r24) - 0.2, `${(pWet(light) * 100).toFixed(0)} % vs ${(pWet(r24) * 100).toFixed(0)} %`);
    // NEGATIVE CONTROL: a dry source must not touch the amount stage — given
    // that it rains anyway, the amount is the wet-hour climatology, exactly.
    const dry = fc('mosmix', 'mosmix', 0, 6);
    add('K-2 Negativkontrolle: trockene Quelle lässt die Menge|nass exakt bei der Klimatologie',
      Math.abs((dry.dist as { mu: number }).mu - PRECIP_WET_CLIMA.muLog) < 1e-12 && cdf0(dry.dist) > 0.9,
      `mu = ${(dry.dist as { mu: number }).mu.toFixed(3)} (Klima ${PRECIP_WET_CLIMA.muLog}), P(trocken) ${cdf0(dry.dist).toFixed(3)}`);
    // The two stages must agree in the output distribution.
    add('K-2: P(0 mm) der Ausgabe = P(trocken) der Auftretensstufe', Math.abs(cdfOf(r24.dist, 0) - cdf0(r24.dist)) < 1e-12);
    add('K-2: kein Loch zwischen Atom und Menge (q(pDry + ε) > 0)', quantileOf(r24.dist, cdf0(r24.dist) + 1e-3) > 0);
    // Disagreement: radar wet vs. MOSMIX dry at h = 1 — the radar's occurrence
    // skill in the first hour must carry the day, not merely edge it.
    const both = fuseHour([
      mkSample({ source: 'mosmix', family: 'mosmix', precipitation: 0, sourceElevation: 300 }),
      mkSample({ source: 'radolan', family: 'nowcast', precipitation: 4 }),
    ], 1, flatCtx()).precipitation!;
    add('K-2: Radar 4 mm/h gegen MOSMIX trocken bei h = 1 ⇒ P(nass) ≥ 0,75', pWet(both) >= 0.75, (pWet(both) * 100).toFixed(0) + ' %');
  }

  // --- Determinism: the same input must give a bit-identical result.
  {
    const s = [
      mkSample({ source: 'mosmix', family: 'mosmix', temperature: 4.2, u: 3, v: -1, precipitation: 0.4, relativeHumidity: 70, sourceElevation: 300 }),
      mkSample({ source: 'icon_d2', family: 'highres', temperature: 5.1, u: 2.4, v: -1.5, precipitation: 0.9 }),
    ];
    const a = JSON.stringify(fuseHour(s, 9, flatCtx()));
    const b = JSON.stringify(fuseHour(s, 9, flatCtx()));
    add('deterministisch (bit-gleich bei gleicher Eingabe)', a === b);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

/** P(no precipitation) of a fused precipitation distribution. */
function cdf0(d: Dist): number {
  if (d.kind === 'hurdleLogNormal') return Math.max(0, Math.min(1, d.pDry));
  return d.kind === 'logCensored'
    ? Math.max(0, Math.min(1, Phi((0 - d.mu) / Math.max(1e-9, d.sigma))))
    : 0;
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyFuse: typeof verifyFuse }).__verifyFuse = verifyFuse;
}
