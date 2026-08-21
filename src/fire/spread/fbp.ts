/**
 * FBP — the published equations of the Canadian Forest Fire Behaviour Prediction
 * System, transcribed, nothing invented.
 *
 * Source: Forestry Canada Fire Danger Group (1992), Information Report ST-X-3
 * ("FCFDG 1992"), with the revisions of Wotton, Alexander & Taylor (2009),
 * NRCan Information Report GLC-X-10. Transcribed from the reference
 * implementation `cffdrs` (R package: R/rate_of_spread.r, R/Slopecalc.r,
 * R/length_to_breadth.r, R/distance_at_time.r), which carries the equation
 * numbers in its source. Equation numbers below are those of ST-X-3 unless a
 * comment names Wotton 2009.
 *
 * This is the second half of the CFFDRS whose first half already lives in
 * `../fwi/fwi.ts` (FWI System, verified against cffdrs vectors). The two share
 * `FFMC_COEFFICIENT` and the ISI definition — FBP does not redefine them, it
 * builds on them, which is why `isi()` is imported rather than re-derived.
 *
 * What this module deliberately does NOT model (see audit/waldbrand-ausbreitung.md §4.4):
 *  • the buildup effect (BE, Eq. 54) — BUI does not exist in Stufe 1, so every
 *    spread rate here is a LOWER BOUND, and every caller has to say so;
 *  • the acceleration phase after ignition (Eqs. 71/72) — it models a POINT
 *    IGNITION, while every fire we draw an arrow for is already burning and has
 *    that phase behind it. Applying it would understate the distance;
 *  • crown fire — CFB is 0 throughout;
 *  • the mixedwood types M-1/M-2, whose coefficients in Table 6 are zero: they
 *    are weighted means of C-2 and D-1 over the conifer share PC, and PC would
 *    be an invented number. D-1 carries the slow end instead — it has its own
 *    published coefficients.
 */

import { FFMC_COEFFICIENT, isi } from '../fwi/fwi';

// ---------------------------------------------------------------------------
// Fuel types — ST-X-3 Table 6 (a, b, c), transcribed from cffdrs
// ---------------------------------------------------------------------------

export type FbpFuel = 'D1' | 'C2' | 'C3' | 'O1B';

export interface FbpFuelCoeff {
  /** Eq. 26 asymptotic rate of spread (m/min). */
  a: number;
  /** Eq. 26 ISI coefficient. */
  b: number;
  /** Eq. 26 exponent. */
  c: number;
  /** Grass types take the curing factor (Eq. 36) and their own LB (Eq. 80). */
  grass: boolean;
  /** German label for the UI — the fuel is an assumption and is always named. */
  label: string;
}

/**
 * The four types this product reasons over. Each one has its OWN published
 * coefficients; none is derived, blended or scaled by us.
 */
export const FBP_FUEL: Readonly<Record<FbpFuel, FbpFuelCoeff>> = Object.freeze({
  D1:  { a: 30,  b: 0.0232, c: 1.6, grass: false, label: 'Laubwald (D-1)' },
  C2:  { a: 110, b: 0.0282, c: 1.5, grass: false, label: 'dichter Nadelwald (C-2)' },
  C3:  { a: 110, b: 0.0444, c: 3.0, grass: false, label: 'Kiefernforst (C-3)' },
  O1B: { a: 250, b: 0.0350, c: 1.7, grass: true,  label: 'Gras/Offenland (O-1b)' },
});

/** Slowest to fastest — the order the reach span is read in. */
export const FBP_FUELS: readonly FbpFuel[] = ['D1', 'C2', 'C3', 'O1B'] as const;

/**
 * The single type used when ONE fuel must be named (the arrow direction on
 * slopes, the headline number). Mature pine stand — the closest published type
 * to a Central European managed conifer forest.
 */
export const REFERENCE_FUEL: FbpFuel = 'C3';

/**
 * Degree of curing for grass, percent. 80 is the default of the `cffdrs`
 * package's `fbp()` — a cited default, not a value we picked. It only enters
 * the O-1b branch.
 */
export const GRASS_CURING_PCT = 80;

/** Eq. 39 caps the slope factor at this slope (percent). */
export const SLOPE_CAP_PCT = 70;

const finite = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));

// ---------------------------------------------------------------------------
// Rate of spread
// ---------------------------------------------------------------------------

/**
 * Eqs. 35a/35b (Wotton 2009) — curing factor for grass, pivoting at 58.8 %.
 * Defined for grass only; other fuels never call it.
 */
export function curingFactor(ccPct: number): number {
  if (!finite(ccPct)) return NaN;
  return ccPct < 58.8
    ? 0.005 * (Math.exp(0.061 * ccPct) - 1)
    : 0.176 + 0.02 * (ccPct - 58.8);
}

/**
 * Eq. 26 (Eq. 36 for grass) — initial rate of spread, m/min, WITHOUT the
 * buildup effect. `isiValue` is the FWI System's ISI, i.e. already
 * wind-modified; for the slope path it is ISZ (zero-wind ISI) instead.
 */
export function rsi(fuel: FbpFuel, isiValue: number): number {
  const f = FBP_FUEL[fuel];
  if (!f || !finite(isiValue) || isiValue < 0) return NaN;
  const base = f.a * Math.pow(1 - Math.exp(-f.b * isiValue), f.c);
  return f.grass ? base * curingFactor(GRASS_CURING_PCT) : base;
}

// ---------------------------------------------------------------------------
// Slope — the half of the system that turns the arrow away from the wind
// ---------------------------------------------------------------------------

/** Eq. 39 — spread factor from ground slope in percent, capped at 10 (GS ≥ 70). */
export function slopeFactor(slopePct: number): number {
  if (!finite(slopePct) || slopePct < 0) return NaN;
  return slopePct >= SLOPE_CAP_PCT ? 10 : Math.exp(3.533 * Math.pow(slopePct / 100, 1.2));
}

/**
 * Eqs. 41a/41b (Wotton 2009), and 43a/43b for grass — the slope-equivalent ISI:
 * the ISI that would produce, on flat ground with wind, the spread rate that
 * the slope produces without wind.
 *
 * The `>= 0.01` guard is cffdrs'; without it a slope steep enough to drive RSF
 * past the fuel's asymptote `a` takes the logarithm of a negative number. The
 * floor `ln(0.01)/(−b)` is the published saturation value, not a clamp we chose.
 */
export function isfFromRsf(fuel: FbpFuel, rsf: number): number {
  const f = FBP_FUEL[fuel];
  if (!f || !finite(rsf) || rsf < 0) return NaN;
  const scale = f.grass ? curingFactor(GRASS_CURING_PCT) * f.a : f.a;
  const inner = 1 - Math.pow(rsf / scale, 1 / f.c);
  return inner >= 0.01 ? Math.log(inner) / -f.b : Math.log(0.01) / -f.b;
}

/** Eq. 46 — moisture content from FFMC (the FWI System's Eq. 10). */
export function moistureFromFfmc(ffmc: number): number {
  if (!finite(ffmc)) return NaN;
  return FFMC_COEFFICIENT * (101 - ffmc) / (59.5 + ffmc);
}

/** Eq. 45 — the fine fuel moisture function f(F). */
export function ffFromMoisture(m: number): number {
  if (!finite(m)) return NaN;
  return 91.9 * Math.exp(-0.1386 * m) * (1 + Math.pow(m, 5.31) / 49300000);
}

/**
 * f(F) recovered from a wind-loaded ISI (Eqs. 24–26 solved for f(F)). Used when
 * only ISI and the wind that produced it are known — the raster case.
 */
export function ffFromIsi(isiValue: number, wKmh: number): number {
  if (!finite(isiValue, wKmh) || isiValue <= 0) return NaN;
  return isiValue / (0.208 * Math.exp(0.05039 * wKmh));
}

/** ISZ — the zero-wind ISI belonging to an f(F) (Eq. 26 with f(W) = 1). */
export function iszFromFf(ff: number): number {
  if (!finite(ff)) return NaN;
  return 0.208 * ff;
}

/** f(F) from a zero-wind ISI — the inverse of `iszFromFf`. */
export function ffFromIsz(iszValue: number): number {
  if (!finite(iszValue)) return NaN;
  return iszValue / 0.208;
}

/**
 * Eqs. 24–26 — ISI from f(F) and a wind speed (km/h). The FBP head fire uses it
 * with the NET effective wind WSV, which is why it takes f(F) rather than FFMC.
 */
export function isiFromFf(ff: number, wKmh: number): number {
  if (!finite(ff, wKmh)) return NaN;
  return 0.208 * ff * Math.exp(0.05039 * wKmh);
}

/**
 * Eqs. 44a–44c (Wotton 2009) — the wind speed (km/h) that is equivalent to the
 * slope. Above 40 km/h the 2009 revision takes over; `112.45` is the published
 * ceiling of that branch.
 */
export function wseFromIsf(isf: number, ff: number): number {
  if (!finite(isf, ff) || ff <= 0) return NaN;
  const base = 0.208 * ff;
  if (isf <= 0 || base <= 0) return NaN;
  let wse = Math.log(isf / base) / 0.05039;                                    // Eq. 44a
  if (wse > 40) {
    wse = isf < 0.999 * 2.496 * ff
      ? 28 - Math.log(1 - isf / (2.496 * ff)) / 0.0818                          // Eq. 44b
      : 112.45;                                                                // Eq. 44c
  }
  return wse;
}

// ---------------------------------------------------------------------------
// Fire shape and distance
// ---------------------------------------------------------------------------

/**
 * Eq. 79, and Eqs. 80a/80b (Wotton 2009) for grass — length-to-breadth ratio of
 * the fire ellipse from the net effective wind speed (km/h). 1 = a circle.
 */
export function lengthToBreadth(fuel: FbpFuel, wsvKmh: number): number {
  const f = FBP_FUEL[fuel];
  if (!f || !finite(wsvKmh) || wsvKmh < 0) return NaN;
  if (f.grass) return wsvKmh >= 1 ? 1.1 * Math.pow(wsvKmh, 0.464) : 1;
  return 1 + 8.729 * Math.pow(1 - Math.exp(-0.03 * wsvKmh), 2.155);
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread).
// Published reference values live in the verifier script, not here.
// ---------------------------------------------------------------------------

export interface FbpCheck { name: string; ok: boolean; detail?: string }

export function verifyFbp(): { checks: FbpCheck[]; passed: number; total: number } {
  const checks: FbpCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (x: number, y: number, eps = 1e-9) => Math.abs(x - y) <= eps;

  // --- Table 6: the four types carry their own published coefficients.
  add('vier Brennstofftypen mit eigenen Koeffizienten (ST-X-3 Tab. 6)',
    FBP_FUELS.length === 4 && FBP_FUELS.every((f) => FBP_FUEL[f].a > 0 && FBP_FUEL[f].b > 0 && FBP_FUEL[f].c > 0));
  add('kein Mischtyp M-1/M-2 (Koeffizienten dort sind 0, PC wäre erfunden)',
    !(FBP_FUELS as readonly string[]).includes('M1') && !(FBP_FUELS as readonly string[]).includes('M2'));
  add('Referenztyp ist einer der vier', FBP_FUELS.includes(REFERENCE_FUEL));
  add('nur O-1b ist Gras', FBP_FUELS.filter((f) => FBP_FUEL[f].grass).join() === 'O1B');

  // --- Eq. 26: monotone in ISI, asymptotic to a.
  add('Gl. 26: RSI wächst monoton mit ISI',
    rsi('C3', 5) < rsi('C3', 10) && rsi('C3', 10) < rsi('C3', 20));
  add('Gl. 26: RSI(0) = 0', rsi('C2', 0) === 0);
  add('Gl. 26: RSI bleibt unter der Asymptote a',
    rsi('C2', 500) < FBP_FUEL.C2.a && rsi('C2', 500) > 0.99 * FBP_FUEL.C2.a);
  add('Gl. 36: Gras trägt den Kurungsfaktor',
    near(rsi('O1B', 10), FBP_FUEL.O1B.a * Math.pow(1 - Math.exp(-FBP_FUEL.O1B.b * 10), FBP_FUEL.O1B.c) * curingFactor(GRASS_CURING_PCT)));

  // --- Eq. 35: the curing factor pivots at 58.8 % and is continuous there.
  // Der veröffentlichte Satz ist am Knick NICHT exakt stetig (Sprung ≈ 4·10⁻⁴).
  // Das ist eine Eigenschaft von Wotton 2009, kein Übertragungsfehler — die
  // Prüfung hält die Größenordnung fest, statt eine Stetigkeit zu behaupten.
  add('Gl. 35a/b: am Knick 58,8 % springt der veröffentlichte Satz um < 10⁻³',
    near(curingFactor(58.79999), curingFactor(58.8), 1e-3)
    && !near(curingFactor(58.79999), curingFactor(58.8), 1e-5),
    `Sprung ${Math.abs(curingFactor(58.8) - curingFactor(58.79999)).toExponential(2)}`);
  add('Gl. 35b: CC = 80 % ⇒ 0,176 + 0,02·21,2', near(curingFactor(80), 0.176 + 0.02 * 21.2, 1e-12));

  // --- Eq. 39: cap at 70 %, monotone below.
  add('Gl. 39: Hangfaktor bei 0 % ist 1', near(slopeFactor(0), 1));
  add('Gl. 39: Hangfaktor wächst monoton', slopeFactor(10) < slopeFactor(30) && slopeFactor(30) < slopeFactor(60));
  add('Gl. 39: Deckel 10 ab 70 % Hangneigung',
    slopeFactor(70) === 10 && slopeFactor(120) === 10, `SF(69,9) = ${slopeFactor(69.9).toFixed(3)}`);

  // --- Eqs. 41/43: ISF is the inverse of Eq. 26 — the round trip must close.
  for (const fuel of FBP_FUELS) {
    const isiIn = 8;
    const back = isfFromRsf(fuel, rsi(fuel, isiIn));
    add(`Gl. 41/43: ISF ist die Umkehrung von Gl. 26 (${fuel})`, near(back, isiIn, 1e-9), `${back.toFixed(9)}`);
  }
  add('Gl. 41b: jenseits der Asymptote greift der veröffentlichte Boden',
    near(isfFromRsf('C2', 10 * FBP_FUEL.C2.a), Math.log(0.01) / -FBP_FUEL.C2.b));

  // --- Eqs. 24–26 inverted: f(F) and ISZ.
  const ffmc = 88, wind = 17;
  add('f(F) aus ISI zurückgerechnet trifft Gl. 45',
    near(ffFromIsi(isi(ffmc, wind), wind), ffFromMoisture(moistureFromFfmc(ffmc)), 1e-9));
  add('ISZ = ISI bei Windstille',
    near(iszFromFf(ffFromMoisture(moistureFromFfmc(ffmc))), isi(ffmc, 0), 1e-9));

  // --- Eq. 44: WSE inverts the wind modification on flat-equivalent ground.
  const ffTest = ffFromMoisture(moistureFromFfmc(ffmc));
  add('Gl. 44a: WSE(ISF = ISZ) = 0 — kein Hang, kein Ersatzwind',
    near(wseFromIsf(iszFromFf(ffTest), ffTest), 0, 1e-9));
  add('Gl. 44a: WSE wächst mit ISF',
    wseFromIsf(2, ffTest) < wseFromIsf(6, ffTest));
  add('Gl. 44c: Deckel 112,45 km/h bei gesättigtem ISF',
    near(wseFromIsf(2.496 * ffTest, ffTest), 112.45));

  // --- Eqs. 79/80: shape.
  add('Gl. 79: LB(0) = 1 (Kreis ohne Wind)', near(lengthToBreadth('C3', 0), 1));
  add('Gl. 79: LB wächst mit dem Netto-Wind',
    lengthToBreadth('C3', 5) < lengthToBreadth('C3', 20) && lengthToBreadth('C3', 20) < lengthToBreadth('C3', 40));
  add('Gl. 80b: Gras unter 1 km/h bleibt kreisförmig', lengthToBreadth('O1B', 0.5) === 1);
  add('Gl. 80a: Gras ab 1 km/h folgt 1,1·WSV^0,464',
    near(lengthToBreadth('O1B', 16), 1.1 * Math.pow(16, 0.464)));

  // --- Eqs. 71/72: distance.
  // --- Refusals: no guessing on bad input.
  add('unsinnige Eingaben liefern NaN, keine Zahl',
    Number.isNaN(rsi('C3', NaN)) && Number.isNaN(slopeFactor(-1)) && Number.isNaN(lengthToBreadth('C3', NaN))
    && Number.isNaN(wseFromIsf(1, -1)));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
