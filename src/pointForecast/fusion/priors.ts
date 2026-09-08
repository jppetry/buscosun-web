/**
 * Named priors for buscosun Fusion.
 *
 * ── The one idea this file encodes ──────────────────────────────────────────
 * The old engine had ~45 hand-set numbers spread over three files (family
 * weights, variable multipliers, skill decay, anchor tolerance, spatial weight,
 * family bonus). They were calibrated against individual anecdotes and could
 * not be measured, optimised or falsified.
 *
 * They are replaced here by exactly TWO quantities per source, both of which
 * operational meteorology already measures every day:
 *
 *   ρ_m(τ)      the ANOMALY CORRELATION of source m at lead τ — the standard
 *               NWP skill score (ACC). It says how much of the departure from
 *               climatology this source actually gets right.
 *   σ_rep(m,s)  the REPRESENTATIVENESS error at the query point — how much the
 *               source's value can differ from the truth at *this* spot for
 *               reasons that have nothing to do with forecast skill (the model
 *               cell averages a mountain and a valley; the station is 30 km away
 *               and 800 m lower).
 *
 * Everything else in the engine is derived from these two. Weights are not set,
 * they fall out of the variances. See `fuse.ts` for the chain.
 *
 * ── Status of the numbers ──────────────────────────────────────────────────
 * ⚠️ Every value here is a **PRIOR**, chosen to reproduce the shape of published
 * ACC curves and of the error magnitudes the existing code was implicitly
 * assuming. **None of them is fitted to a measurement yet.** They are the
 * starting point that `verify:pv-fusion` and, later, the retrospective scoring
 * (`audit/punktvorhersage-14tage/verifikation.md`) will replace. The whole
 * point of the parameterisation is that they *can* be replaced: `params.ts`
 * overrides any of them from a fitted artifact without touching the algorithm.
 */

import type { SourceFamily } from '../types';

export type FusionVariable =
  | 'temperature' | 'dewpoint' | 'humidity' | 'clouds' | 'precipitation' | 'precipOcc' | 'wind' | 'gust';

/**
 * Anomaly-correlation curve — TWO time scales.
 *
 *   rho(tau) = rho0 · [ (1-w)·exp(-(tau/T)^k) + w·exp(-tau/T_slow) ]
 *
 * ── Why two ────────────────────────────────────────────────────────────────
 * A single exp(-(tau/T)^k) cannot set "how good at day 1" and "how fast it dies
 * at day 14" independently. That bit us for real: shortening T for humidity and
 * cloud — correct for the short range, on meteorological advice — killed the
 * tail with it, and 2 m humidity ended up with rho(336 h) = 0,002. The fault was
 * the function family, not the parameters.
 *
 * The two scales are physical, not cosmetic. What a model gets right at day 1 is
 * partly the LARGE-SCALE REGIME and partly the LOCAL DETAIL. The detail is gone
 * within days; the regime — blocking, a persistent trough, a wet spell — decays
 * over weeks. Real ACC curves have exactly this long tail, and it is the only
 * thing that still carries information at day 14.
 *
 * The tail is honest but WEAK: rho ~ 0,07 for precipitation at 336 h means 7 %
 * model and 93 % climatology. That is the right answer, not a good one — genuine
 * day-14 skill needs an ensemble, which is a separate piece of work.
 *
 * Sources that are pure persistence or pure extrapolation (obs, nowcast) carry
 * NO large-scale component: they know nothing about the regime beyond what they
 * measured. They get w = 0 and end hard at their horizon.
 */
export interface AccCurve {
  /** Correlation at tau = 0. Below 1 even for a perfect model: it also carries the observation error of the verification. */
  rho0: number;
  /** e-folding-like time constant of the FAST (local detail) component, hours. */
  tauH: number;
  /** Shape exponent of the fast component. k > 1 = long flat start then a steeper fall. */
  k: number;
  /** Beyond this lead the source contributes nothing (its own horizon). */
  maxLeadH: number;
  /** Share of the correlation carried by the slow, large-scale component (0..1). */
  w?: number;
  /** e-folding time of the slow component, hours. */
  tauSlowH?: number;
}

/** Default share and time scale of the large-scale component. Priors, like everything here. */
const SLOW_W = 0.18;
const SLOW_TAU_H = 500;

/**
 * Hours over which a source is faded out before its horizon.
 *
 * Cutting rho vertically at maxLeadH produced a measured 1,0 K step between two
 * neighbouring hours — ICON-D2 still has rho = 0,90 at +60 h and 0 at +61 h. The
 * forecast must not jump because a model ran out; it must hand over.
 *
 * The window is a FRACTION of the horizon, never a fixed number of hours: eight
 * fixed hours would start fading the radar (horizon 6 h) at lead 0 and never let
 * it reach full strength — the one source that has to dominate the first hours.
 * And it has to be long where the source is still skilful at its end: MOSMIX
 * carries rho ~ 0,5 at +246 h, so its departure is a real change of information
 * and deserves a day to happen, not an hour.
 */
const TAPER_H = 24;

/**
 * Anomaly correlation of a curve at lead `leadH`. With `withTaper` (default) the
 * value is faded out over the window before the horizon; `false` returns the
 * bare skill curve, which is what the amplitude (`amplitudeAt`) must see.
 */
export function accAt(c: AccCurve, leadH: number, withTaper = true): number {
  if (leadH > c.maxLeadH) return 0;
  const t = Math.max(0, leadH) / c.tauH;
  const w = c.w ?? SLOW_W;
  const tauSlow = c.tauSlowH ?? SLOW_TAU_H;
  const fast = Math.exp(-Math.pow(t, c.k));
  const slow = Math.exp(-Math.max(0, leadH) / tauSlow);
  const rho = Math.max(0, Math.min(c.rho0, c.rho0 * ((1 - w) * fast + w * slow)));
  if (!withTaper) return rho;
  // The fade-out window must be a FRACTION of the source's horizon, never a
  // fixed number of hours: a fixed 8 h would start fading the radar (horizon
  // 6 h) at lead 0 and never let it reach full strength — the one source that
  // is supposed to dominate the first hours.
  //
  // How the fade acts is decided in `fuse.ts` (`fuseScalar`): it inflates the
  // member's VARIANCE by 1/taper, so the source loses weight linearly while its
  // mean stays the calibrated one. Letting the tapered ρ itself enter the
  // calibration (anomaly/ρ) was the previous design; it made the member mean
  // grow like 1/ρ toward the horizon and, once the MOS amplitude was no longer
  // over-damped (H-1), produced a 0,25–0,29-K step per hour in the hand-over.
  const taperH = Math.min(TAPER_H, 0.15 * c.maxLeadH);
  const taper = taperH > 0 ? Math.max(0, Math.min(1, (c.maxLeadH - leadH) / taperH)) : 1;
  return rho * taper;
}

/**
 * Amplitude of a source's anomaly relative to the truth's, α = sd(f)/sd(y).
 *
 * This is the parameter that decides HOW FAR an anomaly is shrunk. Writing a
 * source as "truth plus independent noise" implicitly assumes α = 1/ρ — that the
 * forecast swings WIDER than reality, which no forecast system does. Under that
 * assumption the optimal shrinkage is ρ²; under the realistic α = 1 it is ρ. At
 * ρ = 0,6 the difference is 0,36 versus 0,60 — a medium-range heat wave arrives
 * 40 % too flat.
 *
 * α = 1 for raw model output and measurements. A statistically calibrated
 * product (a MOS, an ensemble mean) is already damped: for an ideal per-lead
 * regression Var(f) = ρ²·Var(y), i.e. α = ρ, and the optimal slope on it is
 * ρ/α = 1 — no shrinkage at all. Treating MOSMIX as raw output (α = 1) shrinks
 * it a SECOND time. Measured (Audit H-1, 2026-09-07): +8 K of MOSMIX anomaly
 * came out as +5,56 K at lead 168 h.
 *
 * MOSMIX is not an ideal per-lead regression either — at short lead the model
 * predictors carry almost all of the weight and the amplitude is close to 1.
 * Until the retrospective scoring measures α(τ) = sd(MOSMIX anomaly) /
 * sd(observed anomaly), the prior is the geometric middle between "raw" and
 * "ideal MOS": α = ρ^½ (see `AMPLITUDE_RHO_EXPONENT`). At ρ ≈ 1 nothing
 * changes; at ρ = 0,695 (day 7) the net slope becomes √ρ = 0,83 instead of 0,70.
 * The residual spread is unaffected — α cancels in the variance.
 */
export const AMPLITUDE: Readonly<Record<SourceFamily, number>> = Object.freeze({
  obs: 1, nowcast: 1, highres: 1, mosmix: 1, global: 1,
});

/**
 * Exponent of the SKILL correlation in the amplitude: α(τ) = AMPLITUDE · ρ(τ)^e.
 * 0 = raw output (amplitude independent of skill), 1 = ideal MOS, ½ = the prior
 * for MOSMIX until measured. Only statistically post-processed families carry a
 * non-zero exponent. The ρ used here is the UNTAPERED skill (`accAt(…, false)`):
 * the fade-out before a source's horizon is a weighting device, not a change of
 * the product's amplitude — using the tapered value would let α → 0 at the
 * horizon and undo the fade.
 */
export const AMPLITUDE_RHO_EXPONENT: Readonly<Record<SourceFamily, number>> = Object.freeze({
  obs: 0, nowcast: 0, highres: 0, mosmix: 0.5, global: 0,
});

/** Anomaly amplitude of a family at skill correlation `rhoSkill`. */
export function amplitudeAt(family: SourceFamily, rhoSkill: number): number {
  const base = AMPLITUDE[family] ?? 1;
  const e = AMPLITUDE_RHO_EXPONENT[family] ?? 0;
  return e > 0 ? base * Math.pow(Math.max(0, Math.min(1, rhoSkill)), e) : base;
}

/**
 * ρ(τ) per source family and variable.
 *
 * `obs` is special: a measurement is perfect **at its own time**, and using it
 * for a later time is persistence. Because this engine works in ANOMALY space
 * (departure from an hourly climatology), that persistence is anomaly
 * persistence — which decays smoothly and does not have to fight the diurnal
 * cycle. That is why the observation can stay useful for many hours here while
 * a naive "temperature stays the same" would be wrong by 10 K overnight.
 */
export const ACC: Readonly<Record<FusionVariable, Readonly<Record<SourceFamily, AccCurve>>>> = Object.freeze({
  temperature: {
    // A measurement is nearly perfect at its own time; what decays afterwards is
    // ANOMALY persistence, which is smooth because the diurnal cycle is already
    // in the climatology.
    // k = 1,05 lässt die Kurve sofort mit Steigung 1/T fallen; echte
    // Anomaliepersistenz ist in der ersten Stunde flach. Mit k = 1,35 liegt der
    // Übergabepunkt an MOSMIX bei ~2,5 h statt bei 0,6 h — das ist der operativ
    // beobachtete Wert für eine ko-lokalisierte Station.
    obs:      { rho0: 0.999,  tauH: 30,  k: 1.35, maxLeadH: 36, w: 0 },
    nowcast:  { rho0: 0.985,  tauH: 40,  k: 1.15, maxLeadH: 8, w: 0 },
    // A forecast is NOT as good as a measurement at lead 0 — ICON-D2 at its own
    // analysis time still misses a station by ~1 K. That gap is the whole reason
    // the observation anchor exists.
    highres:  { rho0: 0.975,  tauH: 260, k: 1.75, maxLeadH: 60 },
    mosmix:   { rho0: 0.985,  tauH: 300, k: 1.80, maxLeadH: 246 },
    global:   { rho0: 0.960,  tauH: 280, k: 1.70, maxLeadH: 384 },
  },
  dewpoint: {
    // Der Taupunkt folgt der Luftmasse und ist damit fast so gut vorhersagbar wie
    // die Temperatur — deutlich besser als die relative Feuchte, die als Quotient
    // beide Fehler erbt. Genau deshalb wird er fusioniert und RH daraus abgeleitet.
    obs:      { rho0: 0.999,  tauH: 26,  k: 1.30, maxLeadH: 30, w: 0 },
    nowcast:  { rho0: 0.970,  tauH: 30,  k: 1.10, maxLeadH: 8, w: 0 },
    highres:  { rho0: 0.960,  tauH: 210, k: 1.55, maxLeadH: 60 },
    mosmix:   { rho0: 0.968,  tauH: 235, k: 1.60, maxLeadH: 246 },
    global:   { rho0: 0.940,  tauH: 215, k: 1.50, maxLeadH: 384 },
  },
  humidity: {
    obs:      { rho0: 0.999,  tauH: 20,  k: 1.05, maxLeadH: 30, w: 0 },
    nowcast:  { rho0: 0.950,  tauH: 26,  k: 1.10, maxLeadH: 8, w: 0 },
    highres:  { rho0: 0.930,  tauH: 90,  k: 1.50, maxLeadH: 60 },
    mosmix:   { rho0: 0.940,  tauH: 100, k: 1.50, maxLeadH: 246 },
    global:   { rho0: 0.900,  tauH: 95,  k: 1.45, maxLeadH: 384 },
  },
  clouds: {
    // Cloud cover is the worst-observed and worst-forecast of the standard
    // variables: an automatic station infers it, and the models disagree wildly.
    obs:      { rho0: 0.950,  tauH: 9,   k: 1.00, maxLeadH: 18, w: 0 },
    nowcast:  { rho0: 0.880,  tauH: 12,  k: 1.00, maxLeadH: 8, w: 0 },
    highres:  { rho0: 0.800,  tauH: 95,  k: 1.10, maxLeadH: 60 },
    mosmix:   { rho0: 0.820,  tauH: 105, k: 1.10, maxLeadH: 246 },
    global:   { rho0: 0.780,  tauH: 100, k: 1.05, maxLeadH: 384 },
  },
  precipitation: {
    // Hourly precipitation AMOUNT is the hardest field there is. Even at lead 1
    // an NWP correlates only ~0,7 with a point gauge, while radar extrapolation
    // is close to 0,85 — and then falls off a cliff. Getting this ordering right
    // is what makes the nowcast take over the first hours and hand back cleanly.
    obs:      { rho0: 0.750,  tauH: 2.0, k: 1.00, maxLeadH: 6, w: 0 },
    nowcast:  { rho0: 0.970,  tauH: 3.5, k: 1.60, maxLeadH: 6, w: 0 },
    highres:  { rho0: 0.720,  tauH: 60,  k: 0.90, maxLeadH: 60 },
    mosmix:   { rho0: 0.750,  tauH: 70,  k: 0.90, maxLeadH: 246 },
    global:   { rho0: 0.680,  tauH: 65,  k: 0.85, maxLeadH: 384 },
  },
  precipOcc: {
    // OCCURRENCE (K-2, stage A): whether the hour is wet at all is predicted far
    // better than the amount — the amount correlation above is dominated by
    // timing and intensity errors INSIDE wet spells. Priors: a wet/dry hit rate
    // of ~0,7–0,8 at day 1 with base rates of 5–10 % is a tetrachoric
    // correlation of ~0,8; radar extrapolation is close to 0,95 in the first
    // hour; the slow tail keeps a wet SPELL predictable longer than any one
    // hour's amount. These curves are used in the probit latent space, where
    // the prior spread is 1 by construction.
    obs:      { rho0: 0.800,  tauH: 1.5, k: 1.00, maxLeadH: 4, w: 0 },
    nowcast:  { rho0: 0.970,  tauH: 6.0, k: 1.60, maxLeadH: 6, w: 0 },
    highres:  { rho0: 0.830,  tauH: 90,  k: 1.00, maxLeadH: 60 },
    mosmix:   { rho0: 0.820,  tauH: 100, k: 1.00, maxLeadH: 246 },
    global:   { rho0: 0.750,  tauH: 95,  k: 0.95, maxLeadH: 384 },
  },
  wind: {
    obs:      { rho0: 0.998,  tauH: 14,  k: 1.00, maxLeadH: 24, w: 0 },
    nowcast:  { rho0: 0.920,  tauH: 18,  k: 1.05, maxLeadH: 8, w: 0 },
    highres:  { rho0: 0.930,  tauH: 175, k: 1.40, maxLeadH: 60 },
    mosmix:   { rho0: 0.940,  tauH: 190, k: 1.40, maxLeadH: 246 },
    global:   { rho0: 0.900,  tauH: 185, k: 1.35, maxLeadH: 384 },
  },
  gust: {
    obs:      { rho0: 0.990,  tauH: 8,   k: 1.00, maxLeadH: 18, w: 0 },
    nowcast:  { rho0: 0.860,  tauH: 12,  k: 1.00, maxLeadH: 8, w: 0 },
    highres:  { rho0: 0.880,  tauH: 140, k: 1.30, maxLeadH: 60 },
    mosmix:   { rho0: 0.900,  tauH: 150, k: 1.30, maxLeadH: 246 },
    global:   { rho0: 0.850,  tauH: 145, k: 1.25, maxLeadH: 384 },
  },
});

/**
 * Effective horizontal footprint of a source, in metres — the scale over which
 * it averages the terrain. Drives the representativeness error (see
 * `terrainScale.ts`): a 13-km global cell in the Alps cannot know whether the
 * query point is a summit or a valley floor; a 1-km nowcast almost can.
 *
 * Keyed by the source tag the adapters emit (`pointForecast/types.ts`), with a
 * per-family fallback for tags this table does not know.
 */
export const FOOTPRINT_M: Readonly<Record<string, number>> = Object.freeze({
  dwd_obs: 0, tawes: 0, smn: 0,                  // point measurements
  inca: 1_000,
  arome_at: 2_500,
  icon_d2: 2_200,
  icon_ch1: 1_000,
  mosmix: 0,                                     // station forecast — reports its own height
  gfs: 28_000,
  ecmwf_ifs: 28_000,
  radolan: 1_000, rzc: 1_000,
});

export const FOOTPRINT_FALLBACK_M: Readonly<Record<SourceFamily, number>> = Object.freeze({
  obs: 0, nowcast: 1_500, highres: 2_500, mosmix: 0, global: 28_000,
});

/**
 * Representativeness coefficients.
 *
 * The temperature terrain term is NOT a fitted constant — it is derived:
 * a source that averages terrain over a footprint L reports a value valid for
 * the mean elevation of that footprint, so the error at a specific point inside
 * it is about  γ · σ_z(L),  the lapse rate times the sub-footprint elevation
 * spread. On the North German Plain σ_z ≈ 10 m ⇒ 0,07 K (the model is trusted
 * completely). In an alpine valley σ_z ≈ 250 m ⇒ 1,6 K (the model is
 * automatically distrusted, with no flag and no threshold anywhere).
 */
/**
 * Climatological dew-point depression (K) — the prior gap between temperature and
 * dew point when nothing else is known. ~4 K is the DACH annual mean; it is a
 * prior like everything here, and only matters where no source carries humidity.
 */
export const DEWPOINT_DEPRESSION_K = 4.0;

/**
 * Lapse rate of the dew point (K per metre). The dew point falls far more slowly
 * with height than the temperature does — about 1,8 K/km in a mixed boundary
 * layer against 6,5 K/km — because it follows the moisture, not the adiabat.
 * Using the temperature lapse rate here would dry the mountains out.
 */
export const DEWPOINT_LAPSE_PER_M = 0.0018;

/**
 * Correlation between the temperature and the dew-point uncertainty.
 *
 * Relative humidity is derived from both, and how wide that answer comes out
 * depends almost entirely on this number — the two partial derivatives have
 * opposite signs, so the cross term SUBTRACTS. Physically that is the reason RH
 * is forecastable at all: an air mass that arrives warmer usually arrives
 * moister as well, and RH barely moves while T and Td both move several kelvin.
 *
 * Two regimes, because it is genuinely two different correlations:
 *   ERROR  — between the errors of two forecasts of the same hour. The models
 *            take T and Td from the same boundary-layer scheme, so the errors
 *            share a cause, but not completely.
 *   CLIMA  — between the climatological anomalies. One air mass carries both;
 *            this is the high end.
 * Both are ASSUMPTIONS (priors), not measured here. Their effect is bounded and
 * one-directional: too low widens RH, too high narrows it. Cross-checked only
 * against the sanity requirement that a pure-climatology hour must land near
 * the ~15 % climatological RH spread rather than at 44 %.
 */
export const TD_T_CORR_ERROR = 0.55;
export const TD_T_CORR_CLIMA = 0.88;

export const REP = Object.freeze({
  /** Residual uncertainty of the lapse-rate correction itself, K per metre of |Δz|. */
  lapseResidualPerM: 0.0035,
  /** Fraction of the sub-footprint elevation spread that survives the correction
   *  when the source reports its own reference height (stations, MOSMIX). */
  correctedFraction: 0.35,
  /** Horizontal decorrelation of the temperature anomaly field over FLAT ground, metres. */
  tempDecorrM: 60_000,
  /** Temperature anomaly difference per metre of horizontal decorrelation, K. */
  tempPerDecorrK: 1.1,
  /**
   * Terrain complexity multiplier on every distance term.
   *
   * Two points 20 km apart on the North German Plain see almost the same
   * weather. Two points 20 km apart in the Alps may be in different valley
   * systems, on opposite sides of a ridge, in different air masses. The
   * horizontal decorrelation length of the temperature field is therefore not a
   * constant — it collapses in complex terrain, and a station forecast that is
   * "only" 18 km away can be worth far less there than a coarse model cell.
   *
   * Multiplier = 1 + min(max, σ_z(2·d) / refM). Flat ⇒ 1 (unchanged);
   * inner-alpine ⇒ up to 1 + max.
   */
  distComplexityRefM: 220,
  distComplexityMax: 6,
  /**
   * Wind: how strongly the terrain shelters or exposes the point relative to what
   * the source's cell can see.
   *
   * This has to act on the MEAN, not only on the spread. A valley floor 400 m
   * below its surroundings really is sheltered — the model's cell average is not
   * the wind at the bottom — and a ridge really is faster. Expressing that as a
   * pure widening around a ZERO-mean prior turns "the model cannot know" into
   * "probably calm": a measured 15 m/s storm came out as 5 m/s, because the
   * shrinkage had nowhere to shrink to but stillness.
   *
   * shelterScaleM  e-folding depth of the sheltering, metres
   * speedupPerM    ridge speed-up per metre of positive terrain position
   * speedupMax     cap on the ridge speed-up
   * shelterMin     floor on the shelter factor — a valley is never perfectly calm
   * residualFrac   fraction of the applied shift that stays as uncertainty
   */
  windShelterScaleM: 800,
  windSpeedupPerM: 1 / 600,
  windSpeedupMax: 0.8,
  windShelterMin: 0.35,
  windShiftResidualFrac: 0.35,
  /** Wind: floor, m/s — even a co-located anemometer is not the query point. */
  windFloorMs: 0.35,
  /** Gust representativeness is coarser than the mean wind. */
  gustFactorOverWind: 2.0,
  /** Precipitation decorrelates fast; this is the footprint at which the
   *  representativeness error reaches half of the amount itself, metres. */
  precipHalfM: 9_000,
  /** Cloud cover, percent, per metre of footprint (weak — cloud fields are large). */
  cloudPerFootprintM: 0.0006,
  /** Relative humidity, percent, scaled like temperature through the lapse term. */
  humidityPerK: 4.5,
});

/**
 * Correlation between the ERRORS of two sources.
 *
 * This is the piece that makes "three models agree" mean the right thing.
 * ICON-D2, MOSMIX and ICON-EU share initial conditions and physics: when they
 * agree, that is largely because they are the same system, not because the
 * atmosphere is easy today. Treating them as independent is exactly how a
 * forecast becomes overconfident — and it is what the old `familyBonus`
 * (+0,05 per extra family) did.
 *
 * Values are keyed by family pair. Same family ⇒ high; NWP families among
 * themselves ⇒ moderate (shared analysis); observation vs. model ⇒ low.
 */
const CORR_PAIRS: Readonly<Record<string, number>> = Object.freeze({
  'obs|obs': 0.85,            // distance-dependent at runtime, see pointPairCorrelation
  'obs|nowcast': 0.30,        // the nowcast is initialised from observations
  'obs|highres': 0.10,
  'obs|mosmix': 0.15,         // MOSMIX is bias-corrected ON stations
  'obs|global': 0.05,
  'nowcast|nowcast': 0.80,
  'nowcast|highres': 0.25,
  'nowcast|mosmix': 0.20,
  'nowcast|global': 0.15,
  'highres|highres': 0.75,    // ICON-D2 and AROME: different models, same analysis era
  'highres|mosmix': 0.60,     // MOSMIX is statistically derived from ICON
  'highres|global': 0.45,
  'mosmix|mosmix': 0.90,
  'mosmix|global': 0.45,
  'global|global': 0.70,
});

export function familyErrorCorrelation(a: SourceFamily, b: SourceFamily): number {
  if (a === b) return CORR_PAIRS[`${a}|${a}`] ?? 0.7;
  return CORR_PAIRS[`${a}|${b}`] ?? CORR_PAIRS[`${b}|${a}`] ?? 0.4;
}

/**
 * Error correlation between two POINT sources of the same kind, as a function of
 * their separation.
 *
 * Two nearby stations do not make two independent errors. Used as an anchor at
 * h = 0 they are both a measurement — but used for h = 1…5 they are both
 * ANOMALY PERSISTENCE, and what they get wrong is the same missed weather
 * change. The 0,35 that the pair table carried confused correlation of the
 * WEATHER with correlation of the ERROR; six DWD stations within 30 km then
 * counted as ~2,6 independent opinions and the spread shrank by √2,6 for
 * nothing. Six stations in the first hours are the rule here, not the exception
 * (`pointForecast.ts` appends the whole station list to hours 0…5).
 */
export function pointPairCorrelation(distanceM: number): number {
  const d = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  return 0.45 + 0.45 * Math.exp(-d / 40_000);
}

/**
 * Shrinkage of the correlation matrix toward its diagonal before inversion.
 *
 * Minimum-variance weights with strongly correlated members can be large and of
 * opposite sign — mathematically correct, but brittle when the correlations are
 * priors rather than measurements. Shrinking toward the diagonal (Ledoit-Wolf
 * in spirit) keeps the matrix well-conditioned and the weights sane, at the
 * price of a slightly conservative combined variance. Conservative is the right
 * side to err on here.
 */
export const CORR_SHRINK = 0.85;

/**
 * Climatological anomaly spread per variable, used when the climatology field
 * cannot supply one. Temperature and precipitation come from `climaGrid.json`
 * at runtime; the rest are priors.
 */
export const CLIMA_SIGMA_FALLBACK: Readonly<Record<FusionVariable, number>> = Object.freeze({
  temperature: 6.0,      // K — DACH annual anomaly spread, overridden by climaGrid
  dewpoint: 5.0,         // K — follows the air mass, scatters a little less than T
  humidity: 16,          // %
  clouds: 34,            // % — bimodal field, the sd is large by construction
  precipitation: 1.0,    // in log1p(mm/h) space (legacy single-stage; stage B uses PRECIP_WET_CLIMA)
  precipOcc: 1.0,        // probit latent — unit variance by construction
  wind: 3.2,             // m/s per component at sea level — see windSigmaAt
  gust: 5.5,             // m/s
});

/**
 * Climatological spread of a wind COMPONENT at a given site (m/s).
 *
 * A single number for all of DACH is wrong by a factor of three: a wind
 * component in a sheltered basin scatters by ~2 m/s over the year, on an exposed
 * alpine ridge by 8–10. And because the prior is what a long-range forecast
 * converges to, too small a value also crushes any strong synoptic signal on its
 * way through the shrinkage.
 */
export function windSigmaAt(elevationM: number, tpiM: number): number {
  return CLIMA_SIGMA_FALLBACK.wind
    + 0.0016 * Math.max(0, elevationM)
    + 0.004 * Math.max(0, tpiM);
}

/**
 * Regime variance inflation — the meteorological part.
 *
 * These are situations in which every model is systematically less reliable and
 * the honest answer is a wider distribution, not a different mean:
 *
 *  coldPool  a radiatively decoupled valley. Whether the inversion forms and how
 *            deep it gets is a knife-edge on wind and cloud; the outcome spread
 *            is genuinely bimodal. Widen.
 *  foehn     föhn either breaks through to the valley floor or it does not, and
 *            the two outcomes are several K apart. Widen.
 *  phase     near the rain/snow transition a small temperature error flips the
 *            precipitation type. Widen the temperature, and let `meteo.ts`
 *            report the phase as a probability rather than a class.
 */
export const REGIME = Object.freeze({
  /**
   * Extra temperature variance (K²) at the cold pool's TIPPING POINT — the
   * parabola 4s(1−s) peaks at s = ½, where "will it decouple?" is genuinely open.
   */
  coldPoolVarK2: 2.6,
  /**
   * Extra temperature variance (K²) that scales with cold-pool strength itself.
   * A fully decoupled valley is not a well-forecast valley: it is where the
   * models are most reliably too warm.
   */
  coldPoolFloorVarK2: 1.8,
  /** Extra temperature variance (K²) at full föhn score. */
  foehnVarK2: 3.2,
  /** Extra temperature variance (K²) inside the rain/snow transition band. */
  phaseVarK2: 0.5,
  /** Extra wind-component variance (m²/s²) at full föhn score — föhn is gusty. */
  foehnWindVar: 1.4,
});

/**
 * Converting the climatological WET-DAY probability into a wet-HOUR probability.
 *
 * `climaGrid.json` carries P(daily total ≥ 1 mm) — 0,25…0,40 in DACH. Used
 * unchanged as an hourly prior that claims about seven wet hours per day; the
 * real hourly rate is 0,06…0,12. Rain does not fall independently hour by hour,
 * so the conversion uses an effective number of independent hourly trials per
 * wet day rather than 24: p_h = 1 − (1 − p_d)^(1/n_eff).
 */
export const WET_HOURS_PER_WET_DAY = 6;

/**
 * Climatology of the AMOUNT in a wet hour (K-2, stage B): ln(mm/h) ~ N(mu, s²),
 * i.e. a lognormal — median 0,6 mm/h, q90 ≈ 3,2 mm/h, q99 ≈ 12 mm/h, the shape
 * of DACH hourly gauge records. This is what a rain amount is shrunk toward
 * when the sources lose skill: "if it rains, it rains like it usually does
 * here" — NOT toward dryness, which is a separate question (stage A). Natural
 * log, not log1p: a normal in log1p space puts real mass on negative amounts.
 * A PRIOR: `climaGrid.json` carries only the daily wet probability; the hourly
 * amount climatology is to be fitted from DWD CDC / GeoSphere `klima-v2-1h` /
 * MeteoSchweiz SMN (V-PV-17).
 */
export const PRECIP_WET_CLIMA = Object.freeze({ muLog: -0.51, sigmaLog: 1.30 });

/**
 * Tail dependence of the occurrence skill (K-2, stage A): a source reporting a
 * LARGE amount is a more reliable wet call than one reporting drizzle — heavy
 * hours are large-scale and well timed, light ones are showers that miss the
 * point. The occurrence correlation is raised toward 1 by `boost · s(r)` with
 * s(r) = 1 − exp(−r / refMmH). A Gaussian copula has no tail dependence of its
 * own; this is the cheapest honest substitute, and both numbers are priors.
 */
export const PRECIP_OCC_TAIL = Object.freeze({ boost: 0.35, refMmH: 0.5 });

/**
 * Relative humidity used for the precipitation PHASE, blended toward saturation.
 *
 * The phase question is only ever asked about an hour in which it precipitates,
 * and precipitating air below cloud base is close to saturated. Feeding the
 * unconditional forecast humidity — which converges to a climatological ~75 % at
 * long lead — puts the dry-bulb 50 % line at 2,8 °C instead of 1,1 °C. That is
 * 1,7 K, or about 250 m of snow line, every time, always in the same direction.
 */
export const PHASE_RH_SATURATED = 92;
export const PHASE_RH_BLEND = 0.65;

/**
 * Gust factor over the mean wind when no source carries gusts.
 *
 * 1,45 is the open-terrain, neutral-stability value. It is wrong at both ends:
 * in a decoupled radiation night the ratio falls to ~1,15, in a convective
 * downdraft it exceeds 2. Only the stability end is corrected here — the
 * convective end needs the thunderstorm index and is left for later, openly.
 */
export const GUST_FACTOR_NEUTRAL = 1.45;
export const GUST_FACTOR_DECOUPLED = 1.15;

/**
 * Minimum concentration ν/σ of the wind vector below which a direction is not
 * reported. At ν/σ < 1 the circular spread exceeds ~60°, and a compass bearing
 * would be a made-up number: at lead 300 h the mean vector is essentially zero
 * and the "direction" is whatever noise survived.
 */
export const WIND_DIR_MIN_CONCENTRATION = 1.0;

/** Representativeness constants that used to sit loose inside `fuse.ts`. */
export const REP_MISC = Object.freeze({
  humidityFloorPct: 1.5,
  humidityScaleM: 200,
  humidityDistPct: 6,
  cloudFloorPct: 4,
  cloudDistPct: 8,
  precipFootprintLog: 0.9,
  precipDistLog: 0.7,
  precipDistRefM: 20_000,
  precipFloorLog: 0.12,
  windDistMs: 1.2,
  windDistRefM: 30_000,
  windMinFootprintM: 2_000,
});
