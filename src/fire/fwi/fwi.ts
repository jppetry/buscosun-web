/**
 * Canadian Forest Fire Weather Index (FWI) System — pure equations.
 *
 * Phase WF1 (`audit/waldbrand-forecast.md` §9, decision §13 (a), 2026-08-19).
 * Nothing in here is a buscosun-invented weight: every equation is transcribed
 * from the published, operational reference implementation and checked against
 * its own test vectors (`scripts/verify-fire-fwi.mjs`, ≤ 4 significant digits).
 *
 * References (URLs in `audit/waldbrand-forecast.md` §12):
 *  • Van Wagner, C.E.; Pickett, T.L. (1985) Equations and FORTRAN program for
 *    the Canadian Forest Fire Weather Index System. For. Tech. Rep. 33 — the
 *    daily equations (numbers "Eq. n" below follow that report).
 *  • Van Wagner, C.E. (1987) Development and structure of the CFFWI System.
 *    For. Tech. Rep. 35 — startup values 85 / 6 / 15, day-length tables.
 *  • Van Wagner, C.E. (1977) A method of computing fine fuel moisture content
 *    throughout the diurnal cycle. Inf. Rep. PS-X-69 — hourly FFMC.
 *  • cffdrs (Wang, Anderson & Suddaby 2015, NOR-X-424; R package, GitHub
 *    cffdrs/cffdrs_r) — `.ffmcCalc`, `.dmcCalc`, `.dcCalc`, `.ISIcalc`,
 *    `.buiCalc`, `.fwiCalc`, `hourly_fine_fuel_moisture_code` (main, fetched
 *    2026-08-19). The 1985 report prints the FF-scale constant rounded (147.2);
 *    cffdrs uses the exact `250·59.5/101 = 147.2772…` in the daily FFMC, the ISI
 *    and the hourly FFMC alike, and its test vectors are computed with it — so
 *    do we (a rounded 147.2 misses the vectors by ~0.04 FFMC / 0.07 ISI).
 *
 * Units — FWI convention, callers convert:
 *   temperature °C · relative humidity % · wind km/h at 10 m ·
 *   rain mm (daily: 24 h to noon LST; hourly: the last hour).
 *
 * Honesty rules baked in:
 *   • Non-finite input ⇒ `NaN` (never a silent 0 — 0 would read "no danger").
 *   • A temperature above 100 is treated as a Kelvin slip and yields `NaN`.
 *   • No `ffmcDiurnalStart` yet (Lawson & Armitage 2008 tables) — that start
 *     path only makes sense with yesterday's codes and comes with WF5. Until
 *     then the hourly chain starts from the equilibrium band (`ffmcEquilibrium`)
 *     and the product says "ohne Vortagsgedächtnis".
 *   • Snow: `snowMasked()` is a mask, not a weight — under snow there is no
 *     index (FWI convention: the system is not run over snow).
 *
 * Pure: no DOM, no fetch, no Date. Verified headless (D-10/D-12).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export interface DailyCodes { ffmc: number; dmc: number; dc: number }

/** Standard startup values (Van Wagner 1987): FFMC 85, DMC 6, DC 15. */
export const FWI_STARTUP: Readonly<DailyCodes> = Object.freeze({ ffmc: 85, dmc: 6, dc: 15 });

/**
 * DMC day-length factors Le, months 1..12, latitude ≥ 30° N (Canadian standard
 * table 46 °N; cffdrs `ell01`). DACH lies at 45–55 °N ⇒ this table.
 */
export const DMC_DAY_LENGTH: readonly number[] = [6.5, 7.5, 9, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8, 7, 6];

/** DC day-length factors Lf, months 1..12, latitude > 20° N (cffdrs `fl01`). */
export const DC_DAY_LENGTH: readonly number[] = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5, 2.4, 0.4, -1.6, -1.6];

/** Snow depth (m) from which the index is masked out. Named, not tuned. */
export const SNOW_MASK_M = 0.01;

/**
 * FF-scale constant of Eq. 1/10 (moisture ↔ code): exact 250·59.5/101, so that
 * FFMC 101 is exactly 0 % moisture. 1985 printed it rounded as 147.2; cffdrs
 * (daily, ISI and hourly) uses the exact value — as do its reference vectors.
 */
export const FFMC_COEFFICIENT = 250 * 59.5 / 101;

const finite = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));
/** A "temperature" above 100 °C is a Kelvin slip — refuse instead of guessing. */
const tempOk = (t: number): boolean => Number.isFinite(t) && t <= 100;
const monthOk = (m: number): boolean => Number.isInteger(m) && m >= 1 && m <= 12;

// ---------------------------------------------------------------------------
// Fine Fuel Moisture Code — daily (Van Wagner & Pickett 1985; cffdrs .ffmcCalc)
// ---------------------------------------------------------------------------

/**
 * Daily FFMC from yesterday's FFMC and today's noon weather.
 * @param prev  yesterday's FFMC (0..101)
 * @param t     noon temperature °C
 * @param rh    noon relative humidity %
 * @param w     noon wind km/h
 * @param r24   rain mm over the last 24 h
 */
export function ffmcDaily(prev: number, t: number, rh: number, w: number, r24: number): number {
  if (!finite(prev, rh, w, r24) || !tempOk(t)) return NaN;
  // Eq. 1 — moisture content from yesterday's code
  let wmo = FFMC_COEFFICIENT * (101 - prev) / (59.5 + prev);
  // Eq. 2 — rain reduction for canopy interception; Eqs. 3a/3b — rain effect
  if (r24 > 0.5) {
    const ra = r24 - 0.5;
    wmo = wmo > 150
      ? wmo + 0.0015 * (wmo - 150) * (wmo - 150) * Math.sqrt(ra)
        + 42.5 * ra * Math.exp(-100 / (251 - wmo)) * (1 - Math.exp(-6.93 / ra))
      : wmo + 42.5 * ra * Math.exp(-100 / (251 - wmo)) * (1 - Math.exp(-6.93 / ra));
  }
  // real pine-litter moisture tops out around 250 %
  if (wmo > 250) wmo = 250;
  // Eq. 4 — equilibrium moisture content for drying
  const ed = 0.942 * Math.pow(rh, 0.679) + 11 * Math.exp((rh - 100) / 10)
    + 0.18 * (21.1 - t) * (1 - 1 / Math.exp(rh * 0.115));
  // Eq. 5 — equilibrium moisture content for wetting
  const ew = 0.618 * Math.pow(rh, 0.753) + 10 * Math.exp((rh - 100) / 10)
    + 0.18 * (21.1 - t) * (1 - 1 / Math.exp(rh * 0.115));
  let wm = wmo;
  if (wmo < ed && wmo < ew) {
    // Eq. 7a/7b — log wetting rate at 21.1 °C, temperature effect; Eq. 8
    const z = 0.424 * (1 - Math.pow((100 - rh) / 100, 1.7))
      + 0.0694 * Math.sqrt(w) * (1 - Math.pow((100 - rh) / 100, 8));
    const x = z * 0.581 * Math.exp(0.0365 * t);
    wm = ew - (ew - wmo) / Math.pow(10, x);
  } else if (wmo > ed) {
    // Eq. 6a/6b — log drying rate at 21.1 °C, temperature effect; Eq. 9
    const z = 0.424 * (1 - Math.pow(rh / 100, 1.7))
      + 0.0694 * Math.sqrt(w) * (1 - Math.pow(rh / 100, 8));
    const x = z * 0.581 * Math.exp(0.0365 * t);
    wm = ed + (wmo - ed) / Math.pow(10, x);
  }
  // Eq. 10 — back to code; constrain 0..101
  let f = (59.5 * (250 - wm)) / (FFMC_COEFFICIENT + wm);
  if (f > 101) f = 101;
  if (f < 0) f = 0;
  return f;
}

// ---------------------------------------------------------------------------
// Duff Moisture Code — daily (cffdrs .dmcCalc)
// ---------------------------------------------------------------------------

/**
 * Daily DMC. `month` 1..12 selects the day-length factor (table ≥ 30° N).
 * @param r24 rain mm over the last 24 h
 */
export function dmcDaily(prev: number, t: number, rh: number, r24: number, month: number): number {
  if (!finite(prev, rh, r24) || !tempOk(t) || !monthOk(month)) return NaN;
  const tc = t < -1.1 ? -1.1 : t;
  // Eq. 16 — log drying rate
  const rk = 1.894 * (tc + 1.1) * (100 - rh) * DMC_DAY_LENGTH[month - 1] * 1e-4;
  let pr = prev;
  if (r24 > 1.5) {
    // Eq. 11 — net rain; Eq. 12 (cffdrs form) — moisture from yesterday's code
    const rw = 0.92 * r24 - 1.27;
    const wmi = 20 + 280 / Math.exp(0.023 * prev);
    // Eqs. 13a/13b/13c
    const b = prev <= 33
      ? 100 / (0.5 + 0.3 * prev)
      : prev <= 65 ? 14 - 1.3 * Math.log(prev) : 6.2 * Math.log(prev) - 17.2;
    // Eq. 14 — moisture after rain; Eq. 15 (cffdrs form)
    const wmr = wmi + 1000 * rw / (48.77 + b * rw);
    pr = 43.43 * (5.6348 - Math.log(wmr - 20));
    if (pr < 0) pr = 0;
  }
  const dmc = pr + rk;
  return dmc < 0 ? 0 : dmc;
}

// ---------------------------------------------------------------------------
// Drought Code — daily (cffdrs .dcCalc)
// ---------------------------------------------------------------------------

/** Daily DC. `month` 1..12 selects the day-length factor (table > 20° N). */
export function dcDaily(prev: number, t: number, r24: number, month: number): number {
  if (!finite(prev, r24) || !tempOk(t) || !monthOk(month)) return NaN;
  const tc = t < -2.8 ? -2.8 : t;
  // Eq. 22 — potential evapotranspiration, capped at 0 for winter values
  let pe = (0.36 * (tc + 2.8) + DC_DAY_LENGTH[month - 1]) / 2;
  if (pe < 0) pe = 0;
  let dr = prev;
  if (r24 > 2.8) {
    // Eq. 18 — effective rain; Eq. 19 — moisture equivalent; Eq. 21 (cffdrs form)
    const rw = 0.83 * r24 - 1.27;
    const smi = 800 * Math.exp(-prev / 400);
    dr = prev - 400 * Math.log(1 + 3.937 * rw / smi);
    if (dr < 0) dr = 0;
  }
  const dc = dr + pe;
  return dc < 0 ? 0 : dc;
}

// ---------------------------------------------------------------------------
// Initial Spread Index, Buildup Index, Fire Weather Index
// ---------------------------------------------------------------------------

/** ISI from FFMC and wind km/h (Eqs. 24–26; no FBP wind modification). */
export function isi(ffmc: number, w: number): number {
  if (!finite(ffmc, w)) return NaN;
  const fm = FFMC_COEFFICIENT * (101 - ffmc) / (59.5 + ffmc);           // Eq. 10
  const fW = Math.exp(0.05039 * w);                                  // Eq. 24
  const fF = 91.9 * Math.exp(-0.1386 * fm) * (1 + Math.pow(fm, 5.31) / 49300000); // Eq. 25
  return 0.208 * fW * fF;                                            // Eq. 26
}

/** BUI from DMC and DC (Eqs. 27a/27b). */
export function bui(dmc: number, dc: number): number {
  if (!finite(dmc, dc)) return NaN;
  let b = dmc === 0 && dc === 0 ? 0 : 0.8 * dc * dmc / (dmc + 0.4 * dc);   // Eq. 27a
  if (b < dmc) {                                                             // Eq. 27b
    const p = dmc === 0 ? 0 : (dmc - b) / dmc;
    const cc = 0.92 + Math.pow(0.0114 * dmc, 1.7);
    b = dmc - cc * p;
    if (b < 0) b = 0;
  }
  return b;
}

/** FWI from ISI and BUI (Eqs. 28a/28b, 29, 30a/30b). */
export function fwi(isiValue: number, buiValue: number): number {
  if (!finite(isiValue, buiValue)) return NaN;
  const bb = buiValue > 80
    ? 0.1 * isiValue * (1000 / (25 + 108.64 / Math.exp(0.023 * buiValue)))
    : 0.1 * isiValue * (0.626 * Math.pow(buiValue, 0.809) + 2);
  return bb <= 1 ? bb : Math.exp(2.72 * Math.pow(0.434 * Math.log(bb), 0.647));
}

/** Daily Severity Rating (Van Wagner 1987): 0.0272 · FWI^1.77. */
export function dsr(fwiValue: number): number {
  return Number.isFinite(fwiValue) ? 0.0272 * Math.pow(fwiValue, 1.77) : NaN;
}

export interface DailyObs { t: number; rh: number; w: number; r24: number; month: number }
export interface DailyFwi extends DailyCodes { isi: number; bui: number; fwi: number; dsr: number }

/** One daily update of the whole system from yesterday's codes and noon obs. */
export function dailyFwi(prev: DailyCodes, obs: DailyObs): DailyFwi {
  const f = ffmcDaily(prev.ffmc, obs.t, obs.rh, obs.w, obs.r24);
  const p = dmcDaily(prev.dmc, obs.t, obs.rh, obs.r24, obs.month);
  const d = dcDaily(prev.dc, obs.t, obs.r24, obs.month);
  const i = isi(f, obs.w);
  const b = bui(p, d);
  const x = fwi(i, b);
  return { ffmc: f, dmc: p, dc: d, isi: i, bui: b, fwi: x, dsr: dsr(x) };
}

// ---------------------------------------------------------------------------
// Hourly FFMC — Van Wagner 1977 as implemented in cffdrs `hffmc`
// ---------------------------------------------------------------------------

/** Equilibrium moisture contents (drying `ed`, wetting `ew`) — Eqs. 4/5. */
function equilibria(t: number, rh: number): { ed: number; ew: number } {
  const ed = 0.942 * Math.pow(rh, 0.679) + 11 * Math.exp((rh - 100) / 10)
    + 0.18 * (21.1 - t) * (1 - Math.exp(-0.115 * rh));
  const ew = 0.618 * Math.pow(rh, 0.753) + 10 * Math.exp((rh - 100) / 10)
    + 0.18 * (21.1 - t) * (1 - Math.exp(-0.115 * rh));
  return { ed, ew };
}

/**
 * Hourly FFMC for ONE time step (default 1 h) — Van Wagner 1977 / cffdrs.
 * @param prev    FFMC at the previous step
 * @param t       °C · @param rh % · @param w km/h · @param r1h rain mm in the step
 * @param dtHours step length in hours (cffdrs `time.step`; 1 for the forecast chain)
 */
export function hffmc(prev: number, t: number, rh: number, w: number, r1h: number, dtHours = 1): number {
  if (!finite(prev, rh, w, r1h, dtHours) || !tempOk(t)) return NaN;
  let mo = FFMC_COEFFICIENT * (101 - prev) / (59.5 + prev);
  if (r1h > 0) {
    // rain effect — no canopy reduction in the hourly form (cffdrs: rf <- ro)
    const rf = r1h;
    let mr = mo + 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf));
    if (mo > 150) mr += 0.0015 * (mo - 150) * (mo - 150) * Math.sqrt(rf);
    if (mr > 250) mr = 250;
    mo = mr;
  }
  const { ed, ew } = equilibria(t, rh);
  let m: number;
  if (mo > ed) {
    const ko = 0.424 * (1 - Math.pow(rh / 100, 1.7)) + 0.0694 * Math.sqrt(w) * (1 - Math.pow(rh / 100, 8));
    const kd = ko * 0.0579 * Math.exp(0.0365 * t);
    m = ed + (mo - ed) * Math.pow(10, -kd * dtHours);
  } else if (mo < ew) {
    const k1 = 0.424 * (1 - Math.pow((100 - rh) / 100, 1.7))
      + 0.0694 * Math.sqrt(w) * (1 - Math.pow((100 - rh) / 100, 8));
    const kw = k1 * 0.0579 * Math.exp(0.0365 * t);
    m = ew - (ew - mo) * Math.pow(10, -kw * dtHours);
  } else {
    m = mo; // inside the hysteresis band: no change
  }
  const f = 59.5 * (250 - m) / (FFMC_COEFFICIENT + m);
  return f <= 0 ? 0 : f;
}

export interface HourObs { t: number; rh: number; w: number; r1h: number }

/** Chain of hourly FFMC values; `out[i]` is the FFMC at the END of hour i. */
export function hffmcChain(ffmc0: number, hours: readonly HourObs[]): Float64Array {
  const out = new Float64Array(hours.length);
  let prev = ffmc0;
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    prev = hffmc(prev, h.t, h.rh, h.w, h.r1h);
    out[i] = prev;
  }
  return out;
}

/**
 * Equilibrium FFMC band for constant (T, RH): the fuel neither dries nor wets
 * anywhere between the wetting and drying equilibria, so the whole band
 * [F(ed), F(ew)] is a steady state. Returned as `{ lo, hi, mid }` in FFMC units
 * (`lo` = F(ed), the moister edge; `hi` = F(ew), the drier edge).
 */
export function ffmcEquilibriumBand(t: number, rh: number): { lo: number; hi: number; mid: number } {
  if (!finite(rh) || !tempOk(t)) return { lo: NaN, hi: NaN, mid: NaN };
  const { ed, ew } = equilibria(t, rh);
  const toF = (m: number) => Math.max(0, 59.5 * (250 - m) / (FFMC_COEFFICIENT + m));
  // ed > ew (drying equilibrium is the moister edge) ⇒ F(ed) is the LOWER code.
  const lo = toF(ed);
  const hi = toF(ew);
  return { lo, hi, mid: 0.5 * (lo + hi) };
}

/**
 * Start value WITHOUT yesterday's memory (Stufe 1): the middle of the
 * equilibrium band at the first hour's (T, RH). Neither the dry nor the wet
 * edge — an unknown initial state gets the neutral steady state, and the chain
 * relaxes from there. Named so the product can say what it is.
 */
export function ffmcEquilibrium(t: number, rh: number): number {
  return ffmcEquilibriumBand(t, rh).mid;
}

/** ISI (and FWI when a daily BUI is available) for one hour of the chain. */
export function hourlyIndices(ffmcH: number, w: number, buiDaily: number | null): { isi: number; fwi: number | null } {
  const i = isi(ffmcH, w);
  return { isi: i, fwi: buiDaily == null ? null : fwi(i, buiDaily) };
}

/** Snow mask: index is not computed under a snow cover (FWI convention). */
export function snowMasked(hSnowM: number): boolean {
  return Number.isFinite(hSnowM) && hSnowM > SNOW_MASK_M;
}

// ---------------------------------------------------------------------------
// Self-verification (structural; the reference vectors live in the verifier)
// ---------------------------------------------------------------------------

export interface FwiCheck { name: string; expected: string; got: string; ok: boolean }
export interface FwiVerifyResult { checks: FwiCheck[]; passed: number; total: number }

export function verifyFwi(): FwiVerifyResult {
  const checks: FwiCheck[] = [];
  const add = (name: string, ok: boolean, expected = 'true', got = String(ok)) =>
    checks.push({ name, expected, got, ok });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Startup day of the 1985 test data (April 13: 17 °C, 42 %, 25 km/h, 0 mm).
  const d1 = dailyFwi(FWI_STARTUP, { t: 17, rh: 42, w: 25, r24: 0, month: 4 });
  add('day 1 FFMC ≈ 87.65', near(d1.ffmc, 87.65, 0.01), '87.65', d1.ffmc.toFixed(3));
  add('day 1 DMC ≈ 8.545', near(d1.dmc, 8.545, 0.005), '8.545', d1.dmc.toFixed(3));
  add('day 1 DC ≈ 19.01', near(d1.dc, 19.01, 0.01), '19.01', d1.dc.toFixed(3));
  add('day 1 ISI ≈ 10.78', near(d1.isi, 10.78, 0.01), '10.78', d1.isi.toFixed(3));
  add('day 1 BUI ≈ 8.49', near(d1.bui, 8.49, 0.01), '8.49', d1.bui.toFixed(3));
  add('day 1 FWI ≈ 10.04', near(d1.fwi, 10.04, 0.01), '10.04', d1.fwi.toFixed(3));

  // Physical monotonicity.
  add('higher RH ⇒ lower daily FFMC', ffmcDaily(85, 20, 30, 10, 0) > ffmcDaily(85, 20, 70, 10, 0));
  add('rain lowers hourly FFMC', hffmc(88, 20, 40, 10, 5) < hffmc(88, 20, 40, 10, 0));
  add('ISI grows with wind', isi(88, 30) > isi(88, 5));
  add('FWI grows with BUI', fwi(10, 80) > fwi(10, 10));

  // Chain relaxes into the equilibrium band under constant conditions.
  const band = ffmcEquilibriumBand(22, 45);
  const chain = hffmcChain(60, Array.from({ length: 48 }, () => ({ t: 22, rh: 45, w: 8, r1h: 0 })));
  const last = chain[chain.length - 1];
  add('constant weather: chain ends inside the equilibrium band (±0.5)',
    last >= band.lo - 0.5 && last <= band.hi + 0.5, `[${band.lo.toFixed(2)}, ${band.hi.toFixed(2)}]`, last.toFixed(2));
  add('equilibrium mid lies inside the band', band.mid >= band.lo && band.mid <= band.hi);

  // Honesty guards.
  add('NaN input ⇒ NaN (no silent 0)', Number.isNaN(hffmc(NaN, 20, 40, 10, 0)) && Number.isNaN(isi(85, NaN)));
  add('Kelvin slip ⇒ NaN', Number.isNaN(ffmcDaily(85, 293.15, 40, 10, 0)) && Number.isNaN(hffmc(85, 293.15, 40, 10, 0)));
  add('snow mask: 0.5 cm free, 2 cm masked', !snowMasked(0.005) && snowMasked(0.02));
  add('hourlyIndices without BUI gives fwi=null', hourlyIndices(88, 10, null).fwi === null);
  add('month outside 1..12 ⇒ NaN', Number.isNaN(dmcDaily(6, 20, 40, 0, 13)) && Number.isNaN(dcDaily(15, 20, 0, 0)));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
