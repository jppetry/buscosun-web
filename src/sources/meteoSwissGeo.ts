/**
 * Geometrie des MeteoSchweiz-Radargitters (CH, `rzc`) — schiefachsige
 * Zylinderprojektion LV95/CH1903+ (`somerc`) und Warp-Mesh.
 *
 * Reines Modul (keine Imports, kein DOM/Worker/Netz) — dieselbe Rolle wie
 * `radolanGeo.ts` (DE) und `geosphereIncaGeo.ts` (AT): Rendering,
 * Karten-Komposit und Punktabfrage benutzen DIESELBEN Formeln
 * (RP2, s. `audit/radar-punktverortung.md` §11).
 *
 * **Die Quelle nennt die Projektion selbst.** Das ODIM-Attribut `/where.projdef`
 * des rzc-Produkts lautet
 *   `+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1
 *    +x_0=2600000 +y_0=1200000 +ellps=bessel
 *    +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m`
 * — genau diese Konstanten stehen unten. Gegenprobe an den vier gelieferten
 * WGS84-Ecken: sie landen in LV95 auf **2 255 000 / 2 965 000 East** und
 * **840 000 / 1 480 000 North**, also auf vollen Kilometern, achsparallel auf
 * **< 1 m**, mit einer Spannweite von 709 997 × 640 006 m — das passt auf
 * ≤ 6 m zu `xsize·xscale = 710 × 1000` und `ysize·yscale = 640 × 1000`.
 * Ohne Projektion (linear in lon/lat) lagen Karte und Punktabfrage 7–8 km
 * auseinander.
 *
 * **Eck-Konvention:** die vier `/where`-Ecken sind die **Außenkanten** des
 * Gitters (710 Zellen × 1000 m Spannweite) — wie bei RADOLAN, anders als bei
 * INCA (Zellmitten).
 */

import { warpMeshFromProjection } from '../scalar/quadWarpMesh';

const D = Math.PI / 180;

// Bessel-Ellipsoid + LV95-Konstanten (aus /where.projdef, s. Kopfkommentar).
const B_A = 6377397.155, B_F = 1 / 299.1528128;
const B_E2 = 2 * B_F - B_F * B_F, B_E = Math.sqrt(B_E2);
const PHI_0 = 46.95240555555556 * D, LAM_0 = 7.439583333333333 * D;
const X_0 = 2600000, Y_0 = 1200000;
/** Radius der Zwischenkugel (Rosenmund-Projektion). */
const R_S = B_A * Math.sqrt(1 - B_E2) / (1 - B_E2 * Math.sin(PHI_0) ** 2);
const ALPHA = Math.sqrt(1 + (B_E2 / (1 - B_E2)) * Math.cos(PHI_0) ** 4);
const B_0 = Math.asin(Math.sin(PHI_0) / ALPHA);
const K_C = Math.log(Math.tan(Math.PI / 4 + B_0 / 2))
  - ALPHA * Math.log(Math.tan(Math.PI / 4 + PHI_0 / 2))
  + ALPHA * (B_E / 2) * Math.log((1 + B_E * Math.sin(PHI_0)) / (1 - B_E * Math.sin(PHI_0)));

// Datumsübergang WGS84 → CH1903+ (Bessel), 3-Parameter aus dem projdef.
const T_X = 674.374, T_Y = 15.056, T_Z = 405.346;
const W_A = 6378137, W_F = 1 / 298.257223563, W_E2 = 2 * W_F - W_F * W_F;

/** WGS84 (lon, lat) → Bessel/CH1903+ (lam, phi) in Radiant, Höhe 0. */
function wgs84ToBessel(lonDeg: number, latDeg: number): [number, number] {
  const phi = latDeg * D, lam = lonDeg * D;
  const n = W_A / Math.sqrt(1 - W_E2 * Math.sin(phi) ** 2);
  const X = n * Math.cos(phi) * Math.cos(lam) - T_X;
  const Y = n * Math.cos(phi) * Math.sin(lam) - T_Y;
  const Z = n * (1 - W_E2) * Math.sin(phi) - T_Z;
  const p = Math.hypot(X, Y);
  let phi2 = Math.atan2(Z, p * (1 - B_E2));
  for (let i = 0; i < 8; i++) {
    const n2 = B_A / Math.sqrt(1 - B_E2 * Math.sin(phi2) ** 2);
    phi2 = Math.atan2(Z + B_E2 * n2 * Math.sin(phi2), p);
  }
  return [Math.atan2(Y, X), phi2];
}

/** Bessel/CH1903+ (lam, phi) in Radiant → WGS84 (lon, lat) in Grad, Höhe 0. */
function besselToWgs84(lam: number, phi: number): [number, number] {
  const n = B_A / Math.sqrt(1 - B_E2 * Math.sin(phi) ** 2);
  const X = n * Math.cos(phi) * Math.cos(lam) + T_X;
  const Y = n * Math.cos(phi) * Math.sin(lam) + T_Y;
  const Z = n * (1 - B_E2) * Math.sin(phi) + T_Z;
  const p = Math.hypot(X, Y);
  let phi2 = Math.atan2(Z, p * (1 - W_E2));
  for (let i = 0; i < 8; i++) {
    const n2 = W_A / Math.sqrt(1 - W_E2 * Math.sin(phi2) ** 2);
    phi2 = Math.atan2(Z + W_E2 * n2 * Math.sin(phi2), p);
  }
  return [Math.atan2(Y, X) / D, phi2 / D];
}

/** WGS84 (lon, lat) → LV95 (East, North) in Metern. */
export function rzcFwd(lonDeg: number, latDeg: number): [number, number] {
  const [lam, phi] = wgs84ToBessel(lonDeg, latDeg);
  const s = ALPHA * Math.log(Math.tan(Math.PI / 4 + phi / 2))
    - ALPHA * (B_E / 2) * Math.log((1 + B_E * Math.sin(phi)) / (1 - B_E * Math.sin(phi))) + K_C;
  const b = 2 * (Math.atan(Math.exp(s)) - Math.PI / 4);
  const l = ALPHA * (lam - LAM_0);
  const lBar = Math.atan2(Math.sin(l), Math.sin(B_0) * Math.tan(b) + Math.cos(B_0) * Math.cos(l));
  const bBar = Math.asin(Math.cos(B_0) * Math.sin(b) - Math.sin(B_0) * Math.cos(b) * Math.cos(l));
  return [
    R_S * lBar + X_0,
    R_S / 2 * Math.log((1 + Math.sin(bBar)) / (1 - Math.sin(bBar))) + Y_0,
  ];
}

/** Umkehrung von {@link rzcFwd}: LV95 (East, North) → [lon, lat] in Grad. */
export function rzcInv(east: number, north: number): [number, number] {
  const lBar = (east - X_0) / R_S;
  const bBar = 2 * (Math.atan(Math.exp((north - Y_0) / R_S)) - Math.PI / 4);
  const b = Math.asin(Math.cos(B_0) * Math.sin(bBar) + Math.sin(B_0) * Math.cos(bBar) * Math.cos(lBar));
  const l = Math.atan2(Math.sin(lBar), Math.cos(B_0) * Math.cos(lBar) - Math.sin(B_0) * Math.tan(bBar));
  const lam = LAM_0 + l / ALPHA;
  // Isometrische Breite zurück auf die geodätische (Newton, konvergiert < 5 Schritte).
  const s = (Math.log(Math.tan(Math.PI / 4 + b / 2)) - K_C) / ALPHA;
  let phi = 2 * (Math.atan(Math.exp(s)) - Math.PI / 4);
  for (let i = 0; i < 8; i++) {
    const corr = (B_E / 2) * Math.log((1 + B_E * Math.sin(phi)) / (1 - B_E * Math.sin(phi)));
    phi = 2 * (Math.atan(Math.exp(s + corr)) - Math.PI / 4);
  }
  return besselToWgs84(lam, phi);
}

/** Unterteilungen des Warp-Mesh je Achse ((N+1)² Knoten). 160 → Mercator-Rest
 *  0,78 m (`audit/karten-layer-verortung.md` §15.3; 16 waren 78 m). */
export const RZC_WARP_N = 160;

/**
 * Warp-Mesh des rzc-Gitters aus seinen vier WGS84-Ecken: (N+1)² lon/lat-Paare,
 * Index `(j*(N+1)+i)*2`, i = u (West→Ost), j = v (Nord→Süd) — uv-Konvention des
 * RainLayer. Die Ecken sind bereits Außenkanten, es wird nicht extrapoliert.
 */
export function rzcWarpMesh(corners: RzcCorners): Float32Array {
  const hit = _rzcMesh.get(corners);
  if (hit) return hit;
  const out = warpMeshFromProjection(rzcNodeFn(corners), RZC_WARP_N);
  _rzcMesh.set(corners, out);
  return out;
}
type RzcCorners = [[number, number], [number, number], [number, number], [number, number]];
/** Memoisiert je Ecken-Referenz (der RainLayer baut den GL-Puffer nur bei neuer Referenz). */
const _rzcMesh = new WeakMap<RzcCorners, Float32Array>();

/** Exakte lon/lat-Lage des rzc-Gitterpunkts (u, v) — auch knapp außerhalb [0,1]. */
export function rzcNodeFn(corners: RzcCorners): (u: number, v: number) => [number, number] {
  const [nw, ne, se, sw] = corners.map(([lo, la]) => rzcFwd(lo, la));
  const west = (nw[0] + sw[0]) / 2, ost = (ne[0] + se[0]) / 2;
  const nord = (nw[1] + ne[1]) / 2, sued = (sw[1] + se[1]) / 2;
  return (u, v) => rzcInv(west + u * (ost - west), nord + v * (sued - nord));
}
