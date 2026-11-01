/**
 * MGI / Austria Lambert (EPSG:31287) → WGS84 (EPSG:4326), rein und headless.
 *
 * GeoSphere liefert die Warngeometrien (`getWarnstatus`) als GeoJSON-Form, aber
 * in **Metern** in diesem Koordinatensystem. Ohne Umrechnung läge jede
 * österreichische Warnfläche im Ozean vor Afrika.
 *
 * Zwei Schritte, beide handgeschrieben (D-06, keine Projektionsbibliothek):
 *  1. Lambert-Kegel (2SP) auf dem Bessel-Ellipsoid, invers → Länge/Breite (MGI).
 *  2. Datumswechsel MGI → WGS84 (7-Parameter-Helmert, Positionsvektor-Konvention,
 *     EPSG:1618 „MGI to WGS 84 (3)"), ≈ 100–150 m Versatz, den man auf einer
 *     Gemeindefläche nicht mehr als Rundungsrauschen abtun sollte.
 *
 * Parameter EPSG:31287: φ0 = 47,5°, λ0 = 13°20′ E, φ1 = 49°, φ2 = 46°,
 * E0 = N0 = 400 000 m, Bessel 1841.
 */

const D2R = Math.PI / 180;

// Bessel 1841
const A_BESSEL = 6377397.155;
const F_BESSEL = 1 / 299.1528128;
// WGS84
const A_WGS = 6378137;
const F_WGS = 1 / 298.257223563;

const LAT0 = 47.5 * D2R;
const LON0 = (13 + 20 / 60) * D2R;
const LAT1 = 49 * D2R;
const LAT2 = 46 * D2R;
const E0 = 400000;
const N0 = 400000;

const e2B = 2 * F_BESSEL - F_BESSEL * F_BESSEL;
const eB = Math.sqrt(e2B);

const mOf = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e2B * Math.sin(phi) ** 2);
const tOf = (phi: number) =>
  Math.tan(Math.PI / 4 - phi / 2) / ((1 - eB * Math.sin(phi)) / (1 + eB * Math.sin(phi))) ** (eB / 2);

const m1 = mOf(LAT1), m2 = mOf(LAT2);
const t0 = tOf(LAT0), t1 = tOf(LAT1), t2 = tOf(LAT2);
const N = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const F = m1 / (N * t1 ** N);
const RHO0 = A_BESSEL * F * t0 ** N;

// EPSG:1618 — MGI → WGS84, Positionsvektor. Drehungen in Bogensekunden, Maßstab in ppm.
const TX = 577.326, TY = 90.129, TZ = 463.919;
const RX = 5.137 / 3600 * D2R, RY = 1.474 / 3600 * D2R, RZ = 5.297 / 3600 * D2R;
const SC = 2.4232e-6;

/** Lambert-Meter → (lon, lat) auf dem Bessel-Ellipsoid (MGI), Radiant. */
function lambertInverse(x: number, y: number): [number, number] {
  const dx = x - E0;
  const dy = RHO0 - (y - N0);
  const rho = Math.sign(N) * Math.hypot(dx, dy);
  const t = (rho / (A_BESSEL * F)) ** (1 / N);
  const theta = Math.atan2(dx, dy);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const s = eB * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * ((1 - s) / (1 + s)) ** (eB / 2));
  }
  return [theta / N + LON0, phi];
}

/** Geodätisch (Höhe 0) → geozentrisch kartesisch. */
function toEcef(lon: number, lat: number, a: number, f: number): [number, number, number] {
  const e2 = 2 * f - f * f;
  const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [nu * Math.cos(lat) * Math.cos(lon), nu * Math.cos(lat) * Math.sin(lon), nu * (1 - e2) * Math.sin(lat)];
}

/** Geozentrisch → geodätisch (Bowring, iteriert; Höhe verworfen). */
function fromEcef(X: number, Y: number, Z: number, a: number, f: number): [number, number] {
  const e2 = 2 * f - f * f;
  const lon = Math.atan2(Y, X);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const nu = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    lat = Math.atan2(Z + e2 * nu * Math.sin(lat), p);
  }
  return [lon, lat];
}

/** MGI / Austria Lambert (m) → WGS84 `[lon, lat]` in Grad. */
export function mgiLambertToWgs84(x: number, y: number): [number, number] {
  const [lon, lat] = lambertInverse(x, y);
  const [X, Y, Z] = toEcef(lon, lat, A_BESSEL, F_BESSEL);
  const k = 1 + SC;
  const X2 = TX + k * (X - RZ * Y + RY * Z);
  const Y2 = TY + k * (RZ * X + Y - RX * Z);
  const Z2 = TZ + k * (-RY * X + RX * Y + Z);
  const [lo, la] = fromEcef(X2, Y2, Z2, A_WGS, F_WGS);
  return [lo / D2R, la / D2R];
}
