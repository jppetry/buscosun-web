/**
 * Inverse bilineare Interpolation auf einem Quad mit vier WGS84-Eckpunkten.
 *
 * Wir nutzen sie, um Radar-Pixel-Grids an einer geographischen Position zu
 * sampeln, ohne die spezifische Projektion (Polar-Stereografisch bei
 * RADOLAN, Lambert-Konform bei INCA, Swiss-LV95 bei MeteoSwiss rzc)
 * explizit zu invertieren. Für DACH-große Quads bei 1-km-Pixel-Auflösung
 * liegt der Fehler der Bilinear-Approximation deutlich unter einem Pixel —
 * und ist damit weit unter unserer Sample-Genauigkeit (GPS + Track-Sampling).
 *
 * Eck-Convention (wie {@link QuadCorners}): [NW, NE, SE, SW] jeweils [lon, lat].
 * (u=0, v=0) = NW; (u=1, v=0) = NE; (u=1, v=1) = SE; (u=0, v=1) = SW.
 *
 * Newton-Iteration konvergiert auf gut-geformten Quads in 3–5 Schritten.
 */

import type { QuadCorners } from '../scalar/RainLayer';

export interface QuadUV {
  u: number;
  v: number;
}

/** Vorwärts-Bilinear: (u,v) ∈ [0,1]² → (lon, lat). */
function forwardBilinear(c: QuadCorners, u: number, v: number): [number, number] {
  const [nw, ne, se, sw] = c;
  const omu = 1 - u, omv = 1 - v;
  const lon = omu * omv * nw[0] + u * omv * ne[0] + u * v * se[0] + omu * v * sw[0];
  const lat = omu * omv * nw[1] + u * omv * ne[1] + u * v * se[1] + omu * v * sw[1];
  return [lon, lat];
}

/**
 * Inverse: für (lat, lon) finde (u, v) ∈ [0,1]² oder null, wenn der Punkt
 * außerhalb des Quads liegt. Eine kleine Toleranz an den Rändern erlaubt
 * Punkte, die durch Floating-Point-Rauschen geringfügig draußen wären.
 */
export function inverseBilinear(
  corners: QuadCorners, lat: number, lon: number,
  maxIter = 8, tolDeg = 1e-7,
): QuadUV | null {
  const [nw, ne, se, sw] = corners;

  // Schneller Vor-Filter via axis-aligned Bbox der 4 Ecken.
  const lonMin = Math.min(nw[0], ne[0], se[0], sw[0]);
  const lonMax = Math.max(nw[0], ne[0], se[0], sw[0]);
  const latMin = Math.min(nw[1], ne[1], se[1], sw[1]);
  const latMax = Math.max(nw[1], ne[1], se[1], sw[1]);
  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return null;

  let u = 0.5, v = 0.5;
  for (let iter = 0; iter < maxIter; iter++) {
    const [lonHat, latHat] = forwardBilinear(corners, u, v);
    const dlon = lonHat - lon;
    const dlat = latHat - lat;
    if (Math.abs(dlon) < tolDeg && Math.abs(dlat) < tolDeg) break;
    const omu = 1 - u, omv = 1 - v;
    // Jacobian.
    const dLonDu = -omv * nw[0] + omv * ne[0] + v * se[0] - v * sw[0];
    const dLonDv = -omu * nw[0] - u * ne[0] + u * se[0] + omu * sw[0];
    const dLatDu = -omv * nw[1] + omv * ne[1] + v * se[1] - v * sw[1];
    const dLatDv = -omu * nw[1] - u * ne[1] + u * se[1] + omu * sw[1];
    const det = dLonDu * dLatDv - dLonDv * dLatDu;
    if (Math.abs(det) < 1e-12) return null;
    // (du, dv) = J⁻¹ · (dlon, dlat).
    const du = (dLatDv * dlon - dLonDv * dlat) / det;
    const dv = (-dLatDu * dlon + dLonDu * dlat) / det;
    u -= du;
    v -= dv;
  }
  // Kleine Rand-Toleranz, sonst clamp + return.
  if (u < -0.002 || u > 1.002 || v < -0.002 || v > 1.002) return null;
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
}

/**
 * Sampelt einen Radar-Frame an (lat, lon).
 *
 * Konvention der Radar-Frames im Repo: `values` ist ein north-up uint8-Grid;
 * `0` = außerhalb der Radar-Abdeckung bzw. unter dem Erkennungs-Limit,
 * `1..255` = `wert/255 · vMax` in mm/h. Wir geben `null` für Punkte
 * außerhalb des Quads zurück, `0` für Punkte mit „kein Niederschlag".
 */
export function sampleRadarQuad(
  values: Uint8Array, width: number, height: number,
  corners: QuadCorners, lat: number, lon: number,
  vMax = 20,
): number | null {
  const uv = inverseBilinear(corners, lat, lon);
  if (!uv) return null;
  const col = Math.min(width - 1, Math.max(0, Math.round(uv.u * (width - 1))));
  const row = Math.min(height - 1, Math.max(0, Math.round(uv.v * (height - 1))));
  const raw = values[row * width + col];
  if (raw === 0) return 0;
  return (raw / 255) * vMax;
}
