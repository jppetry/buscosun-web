/**
 * The wind–slope vector addition of the FBP System: the one step that turns
 * „where does the wind blow" into „where does the fire run".
 *
 * The chain (ST-X-3 Eqs. 39–51, Wotton 2009 for 41/43/44):
 *
 *   ISZ ──rsi──▶ RSZ ──×SF (Gl. 39/40)──▶ RSF ──Gl. 41/43──▶ ISF ──Gl. 44──▶ WSE
 *                                                                             │
 *   wind (WS, WAZ) ────────────────────────────────────────────────┐          │
 *                                                                  ▼          ▼
 *                                            Gl. 47–51: vector sum ⇒ WSV, RAZ
 *
 * WSE is the trick worth understanding: the slope is expressed as the wind
 * speed that would drive the same spread rate on flat ground. Only then can
 * wind and slope be added — they become the same kind of quantity.
 *
 * Two properties this module guarantees, because the product's honesty rests
 * on them (audit/waldbrand-ausbreitung.md §4.3):
 *
 *  1. **On flat ground RAZ is exactly the downwind direction**, for every fuel.
 *     The assumed fuel therefore cannot distort the direction where there is no
 *     slope — it only matters on a slope.
 *  2. **Without wind and without slope there is no direction at all.** The
 *     function returns `null`, never a zero that would read as „north".
 */

import { angleDiff } from '../activity/dynamics';
import {
  FBP_FUEL, ffFromIsz, isfFromRsf, isiFromFf, lengthToBreadth, rsi, slopeFactor, wseFromIsf,
  type FbpFuel,
} from './fbp';

/** Ground slope at the fire, and the direction the ground rises towards. */
export interface SlopeInput {
  /** Ground slope in percent (rise/run · 100), ≥ 0. */
  slopePct: number;
  /** Upslope azimuth in degrees (0 = N, 90 = E) — where the terrain rises to. */
  upslopeAzDeg: number;
}

/** Wind at the fire. `fromDeg` is the meteorological direction ("comes from"). */
export interface WindInput {
  speedKmh: number;
  fromDeg: number;
}

export interface SpreadVector {
  /** Net spread azimuth in degrees, "where to" (FBP RAZ, Eqs. 50/51). */
  razDeg: number;
  /** Net effective wind speed, km/h (FBP WSV, Eq. 49). */
  wsvKmh: number;
  /** The slope's wind-speed equivalent, km/h (FBP WSE, Eq. 44); 0 on flat ground. */
  wseKmh: number;
  /** How far the terrain turns the arrow away from plain downwind, degrees. */
  terrainTurnDeg: number;
  /** Length-to-breadth ratio of the fire ellipse (Eq. 79/80); 1 = circle. */
  lb: number;
  /** Head fire rate of spread, m/min — WITHOUT buildup effect, i.e. a lower bound. */
  rosMmin: number;
}

/** Below this net wind there is no preferred direction — calm on flat ground. */
export const CALM_WSV_KMH = 0.1;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/** Downwind direction ("where to") from a meteorological wind direction. */
export function downwindDeg(fromDeg: number): number {
  return norm360(fromDeg + 180);
}

/**
 * One fire, one hour, one fuel ⇒ the spread vector, or `null` when the inputs
 * do not support a statement (non-finite input, or calm on flat ground).
 *
 * @param iszValue zero-wind ISI at the point (ISZ) — NOT the wind-loaded ISI.
 */
export function spreadVector(i: {
  iszValue: number;
  wind: WindInput;
  slope: SlopeInput;
  fuel: FbpFuel;
}): SpreadVector | null {
  const { iszValue, wind, slope, fuel } = i;
  if (!FBP_FUEL[fuel]) return null;
  if (!Number.isFinite(iszValue) || iszValue <= 0) return null;
  if (!Number.isFinite(wind.speedKmh) || wind.speedKmh < 0 || !Number.isFinite(wind.fromDeg)) return null;
  if (!Number.isFinite(slope.slopePct) || slope.slopePct < 0 || !Number.isFinite(slope.upslopeAzDeg)) return null;

  const ff = ffFromIsz(iszValue);

  // --- Slope leg: Eqs. 39/40 → 41/43 → 44. Flat ground short-circuits to 0 so
  //     that the identity "flat ⇒ RAZ = downwind" holds exactly, not to 1e-16.
  let wseKmh = 0;
  if (slope.slopePct > 0) {
    const rsf = rsi(fuel, iszValue) * slopeFactor(slope.slopePct);   // Eqs. 26 → 39 → 40
    const isf = isfFromRsf(fuel, rsf);                              // Eqs. 41/43
    const wse = wseFromIsf(isf, ff);                                // Eq. 44
    if (!Number.isFinite(wse) || wse < 0) return null;
    wseKmh = wse;
  }

  // --- Vector sum: Eqs. 47–49. Azimuths are compass bearings, so sin carries
  //     the east component and cos the north component.
  const wazRad = downwindDeg(wind.fromDeg) * RAD;
  const sazRad = norm360(slope.upslopeAzDeg) * RAD;
  const wsx = wind.speedKmh * Math.sin(wazRad) + wseKmh * Math.sin(sazRad);
  const wsy = wind.speedKmh * Math.cos(wazRad) + wseKmh * Math.cos(sazRad);
  const wsvKmh = Math.hypot(wsx, wsy);

  // Calm on flat ground: a circle has no head. Say nothing rather than north.
  if (!(wsvKmh > CALM_WSV_KMH)) return null;

  // --- Eqs. 50/51.
  const razDeg = norm360((wsx < 0 ? 2 * Math.PI - Math.acos(wsy / wsvKmh) : Math.acos(wsy / wsvKmh)) * DEG);

  const rosMmin = rsi(fuel, isiFromFf(ff, wsvKmh));                  // Eqs. 26 with ISI(WSV), BE = 1
  if (!Number.isFinite(rosMmin)) return null;

  return {
    razDeg,
    wsvKmh,
    wseKmh,
    terrainTurnDeg: angleDiff(razDeg, downwindDeg(wind.fromDeg)),
    lb: lengthToBreadth(fuel, wsvKmh),
    rosMmin,
  };
}

/**
 * The direction span across a fuel set — the visible consequence of not knowing
 * the vegetation. `null` where the question does not arise: on flat ground every
 * fuel gives the same direction (see module head), and where no fuel yields a
 * vector at all.
 */
export function razBand(i: {
  iszValue: number;
  wind: WindInput;
  slope: SlopeInput;
  fuels: readonly FbpFuel[];
}): { minDeg: number; maxDeg: number; spanDeg: number } | null {
  if (i.slope.slopePct <= 0) return null;
  const dirs: number[] = [];
  for (const fuel of i.fuels) {
    const v = spreadVector({ iszValue: i.iszValue, wind: i.wind, slope: i.slope, fuel });
    if (v) dirs.push(v.razDeg);
  }
  if (dirs.length < 2) return null;
  // Directions are circular: measure the span against the first one and keep the
  // extremes as signed offsets, so a band straddling north does not become 359°.
  const ref = dirs[0];
  const offs = dirs.map((d) => {
    const raw = norm360(d - ref);
    return raw > 180 ? raw - 360 : raw;
  });
  const lo = Math.min(...offs);
  const hi = Math.max(...offs);
  return { minDeg: norm360(ref + lo), maxDeg: norm360(ref + hi), spanDeg: hi - lo };
}

/**
 * The angular width of the uncertainty fan: how far the direction moves over
 * the given hours, widened by the fuel band. Returns `null` for a single hour
 * without a fuel band — a fan needs something to be uncertain about.
 */
export function fanWidthDeg(razByHour: readonly number[], fuelSpanDeg: number): number | null {
  const dirs = razByHour.filter((d) => Number.isFinite(d));
  if (dirs.length === 0) return null;
  const ref = dirs[0];
  let lo = 0, hi = 0;
  for (const d of dirs) {
    const raw = norm360(d - ref);
    const off = raw > 180 ? raw - 360 : raw;
    lo = Math.min(lo, off);
    hi = Math.max(hi, off);
  }
  const width = (hi - lo) + Math.max(0, fuelSpanDeg);
  return width > 0 ? width : null;
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread)
// ---------------------------------------------------------------------------

export interface SpreadVectorCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadVector(): { checks: SpreadVectorCheck[]; passed: number; total: number } {
  const checks: SpreadVectorCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (x: number, y: number, eps = 1e-9) => Math.abs(x - y) <= eps;

  const isz = 3.5;                       // a plausible zero-wind ISI
  const flat: SlopeInput = { slopePct: 0, upslopeAzDeg: 0 };
  const wind: WindInput = { speedKmh: 18, fromDeg: 250 };

  // --- The load-bearing identity: flat ground ⇒ RAZ is exactly downwind.
  for (const fuel of ['D1', 'C2', 'C3', 'O1B'] as FbpFuel[]) {
    const v = spreadVector({ iszValue: isz, wind, slope: flat, fuel });
    add(`eben ⇒ RAZ ist exakt die Windrichtung (${fuel})`,
      !!v && near(v.razDeg, 70) && v.wseKmh === 0 && v.terrainTurnDeg === 0, v ? v.razDeg.toFixed(6) : 'null');
  }
  add('eben ⇒ kein Brennstoff-Richtungsband (die Annahme wirkt nicht)',
    razBand({ iszValue: isz, wind, slope: flat, fuels: ['D1', 'C2', 'C3', 'O1B'] }) === null);

  // --- Slope alone: without wind the fire runs straight uphill.
  const upslope: SlopeInput = { slopePct: 25, upslopeAzDeg: 135 };
  const calmOnSlope = spreadVector({ iszValue: isz, wind: { speedKmh: 0, fromDeg: 0 }, slope: upslope, fuel: 'C3' });
  add('windstill am Hang ⇒ RAZ ist die Hangaufwärtsrichtung',
    !!calmOnSlope && near(calmOnSlope.razDeg, 135, 1e-6) && calmOnSlope.wseKmh > 0,
    calmOnSlope ? `WSE ${calmOnSlope.wseKmh.toFixed(2)} km/h` : 'null');

  // --- Calm on flat ground: no statement at all.
  add('windstill auf ebenem Grund ⇒ null, nicht Nord',
    spreadVector({ iszValue: isz, wind: { speedKmh: 0, fromDeg: 0 }, slope: flat, fuel: 'C3' }) === null);

  // --- Wind ⊥ slope: the result lies strictly between the two.
  const cross = spreadVector({ iszValue: isz, wind: { speedKmh: 12, fromDeg: 270 }, slope: { slopePct: 30, upslopeAzDeg: 0 }, fuel: 'C3' });
  add('Wind quer zum Hang ⇒ RAZ liegt echt dazwischen und der Hang dreht sichtbar',
    !!cross && cross.razDeg > 0 && cross.razDeg < 90 && cross.terrainTurnDeg > 1,
    cross ? `RAZ ${cross.razDeg.toFixed(1)}°, Drehung ${cross.terrainTurnDeg.toFixed(1)}°` : 'null');

  // --- Monotonicity: steeper ⇒ more slope-equivalent wind; more wind ⇒ longer ellipse.
  const s10 = spreadVector({ iszValue: isz, wind: { speedKmh: 0.0, fromDeg: 0 }, slope: { slopePct: 10, upslopeAzDeg: 0 }, fuel: 'C3' });
  const s40 = spreadVector({ iszValue: isz, wind: { speedKmh: 0.0, fromDeg: 0 }, slope: { slopePct: 40, upslopeAzDeg: 0 }, fuel: 'C3' });
  add('steiler ⇒ größerer Ersatzwind WSE', !!s10 && !!s40 && s40.wseKmh > s10.wseKmh,
    s10 && s40 ? `${s10.wseKmh.toFixed(1)} → ${s40.wseKmh.toFixed(1)} km/h` : 'null');
  const w5 = spreadVector({ iszValue: isz, wind: { speedKmh: 5, fromDeg: 250 }, slope: flat, fuel: 'C3' });
  const w30 = spreadVector({ iszValue: isz, wind: { speedKmh: 30, fromDeg: 250 }, slope: flat, fuel: 'C3' });
  add('mehr Wind ⇒ längere Ellipse und schnellerer Kopf',
    !!w5 && !!w30 && w30.lb > w5.lb && w30.rosMmin > w5.rosMmin);

  // --- The fuel band exists on a slope and is a real angle.
  const band = razBand({ iszValue: isz, wind, slope: { slopePct: 35, upslopeAzDeg: 10 }, fuels: ['D1', 'C2', 'C3', 'O1B'] });
  add('am Hang gibt es ein Brennstoff-Richtungsband > 0',
    !!band && band.spanDeg > 0 && band.spanDeg < 180, band ? `${band.spanDeg.toFixed(1)}°` : 'null');

  // --- The fan does not wrap around north.
  add('Fächerbreite über Nord hinweg bleibt klein', (fanWidthDeg([350, 10, 20], 0) ?? -1) === 30);
  add('Fächer ohne Richtungen ist null', fanWidthDeg([], 0) === null);

  // --- Refusals.
  add('unbrauchbarer ISZ ⇒ null',
    spreadVector({ iszValue: 0, wind, slope: flat, fuel: 'C3' }) === null
    && spreadVector({ iszValue: NaN, wind, slope: flat, fuel: 'C3' }) === null);
  add('unbrauchbarer Wind oder Hang ⇒ null',
    spreadVector({ iszValue: isz, wind: { speedKmh: NaN, fromDeg: 0 }, slope: flat, fuel: 'C3' }) === null
    && spreadVector({ iszValue: isz, wind, slope: { slopePct: NaN, upslopeAzDeg: 0 }, fuel: 'C3' }) === null);
  add('downwindDeg dreht um 180° und bleibt in 0…360', downwindDeg(250) === 70 && downwindDeg(10) === 190);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
