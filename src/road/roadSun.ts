/**
 * AW-7.2 — Sun position for the hazard `sonne` (tiefstehende Sonne), `audit/autobahnwetter-gefahren.md`: elevation and
 * azimuth of the sun for a UTC instant and a place, after the NOAA Solar Calculator (Jean Meeus, "Astronomical
 * Algorithms", as implemented in NOAA's spreadsheet `NOAA_Solar_Calculations_day.xls`): Julian century, geometric mean
 * longitude and anomaly, equation of centre, obliquity with nutation, equation of time, declination, hour angle. Stated
 * accuracy of that algorithm: ≈ 0.01° between −72 and +72° latitude — far below the 0.5° tolerance of `verify:road-hazards`.
 *
 * Importfree; runs in the derive (Node) and in the page (detail text, the "ab 08:15" of the rail).
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Elevation above the horizon (°), geometric, with the NOAA refraction correction applied. */
  elevationDeg: number;
  /** Azimuth (° clockwise from north). */
  azimuthDeg: number;
  /** Declination (°) and equation of time (min) — exposed for the verifier. */
  declinationDeg: number;
  eqTimeMin: number;
}

/** Julian day of a UTC instant (ms since 1970). */
export const julianDay = (ms: number) => ms / 86_400_000 + 2_440_587.5;

/** NOAA solar position. `lat`/`lon` in degrees (east positive). */
export function sunPosition(ms: number, lat: number, lon: number): SunPosition {
  const jd = julianDay(ms);
  const t = (jd - 2_451_545) / 36_525;                                   // Julian century
  const l0 = ((280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360 + 360) % 360;   // geometric mean longitude
  const m = 357.52911 + t * (35_999.05029 - 0.0001537 * t);              // geometric mean anomaly
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);          // eccentricity
  const mr = m * RAD;
  const c = Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * mr) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;   // mean obliquity
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);                     // corrected obliquity
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = 4 * DEG * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(mr) + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * mr));   // minutes
  const minutesUtc = ((ms % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  const trueSolarMin = (minutesUtc + eqTime + 4 * lon) % 1440;
  const ha = trueSolarMin / 4 < 0 ? trueSolarMin / 4 + 180 : trueSolarMin / 4 - 180;   // hour angle
  const latR = lat * RAD, declR = decl * RAD, haR = ha * RAD;
  const cosZenith = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith))) * DEG;
  // Azimuth (NOAA): from the zenith and the hour angle, measured clockwise from north.
  let az: number;
  const denom = Math.cos(latR) * Math.sin(zenith * RAD);
  if (Math.abs(denom) < 1e-12) az = ha > 0 ? 180 : 0;
  else {
    const azr = Math.acos(Math.max(-1, Math.min(1, (Math.sin(latR) * Math.cos(zenith * RAD) - Math.sin(declR)) / denom))) * DEG;
    az = ha > 0 ? (azr + 180) % 360 : (540 - azr) % 360;
  }
  const elevGeom = 90 - zenith;
  // Atmospheric refraction (NOAA): only near the horizon it matters for "tiefstehende Sonne" (0–15°).
  let refr = 0;
  if (elevGeom <= 85) {
    const te = Math.tan(elevGeom * RAD);
    if (elevGeom > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elevGeom > -0.575) refr = 1735 + elevGeom * (-518.2 + elevGeom * (103.4 + elevGeom * (-12.79 + elevGeom * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  return { elevationDeg: elevGeom + refr, azimuthDeg: az, declinationDeg: decl, eqTimeMin: eqTime };
}

/** Smallest angle (°, 0…180) between two bearings. */
export const bearingDiffDeg = (a: number, b: number) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

/**
 * Low sun in the driver's eyes (gefahren, `sonne` Stufe 1): the sun stands 0–15° above the horizon and at most
 * `maxOffAxisDeg` beside the driving direction. `headingDeg` = bearing the driver looks at.
 */
export function sunInEyes(sun: Pick<SunPosition, 'elevationDeg' | 'azimuthDeg'>, headingDeg: number, maxElevationDeg = 15, maxOffAxisDeg = 25): boolean {
  return sun.elevationDeg >= 0 && sun.elevationDeg <= maxElevationDeg && bearingDiffDeg(sun.azimuthDeg, headingDeg) <= maxOffAxisDeg;
}
