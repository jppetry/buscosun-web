/**
 * Inverse bilineare Interpolation auf einem Quad mit vier Eckpunkten.
 *
 * Wir nutzen sie, um Raster-Grids an einer geographischen Position zu sampeln.
 * Die Interpolation ist nur dann exakt, wenn das Gitter IM VERWENDETEN RAUM
 * regulär ist:
 *   • reguläre lat/lon-Gitter (ICON-D2 `regular-lat-lon`) → direkt in lon/lat,
 *   • projizierte Gitter → erst `project` anwenden, dann interpolieren.
 *
 * Ohne `project` gilt für RADOLAN DE1200 (polar-stereografisch) NICHT die
 * frühere Annahme „Fehler unter einem Pixel": gemessen sind es 13–36 km
 * (Median 24 km, systematisch nach Norden) — die Punktabfrage las dadurch einen
 * anderen Ort als die Karte zeichnet (`audit/radar-punktverortung.md`, RP0).
 * Für RADOLAN ist `psFwd` zu übergeben; die Aufrufer tun das über die Fassade
 * `radarSample.ts`, die die Projektion aus der Quelle ableitet.
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

/**
 * Vorwärtsprojektion eines Gitters: (lon, lat) → (x, y) im Raum, in dem das
 * Gitter regulär ist. `psFwd` für RADOLAN DE1200; `null`/weglassen für reguläre
 * lat/lon-Gitter (dann ist (x, y) = (lon, lat)).
 */
export type ProjectXY = (lon: number, lat: number) => [number, number];

/**
 * Was die vier `corners` eines Gitters bezeichnen:
 *   • `'center'` — die MITTELPUNKTE der vier Eckzellen (INCA: 700 km auf 701
 *     Zellen; ICON-D2 `regular-lat-lon`). uv 0…1 spannt Mitte-zu-Mitte.
 *   • `'edge'`   — die AUSSENKANTEN des Gitters (RADOLAN DE1200: 1100 km auf
 *     1100 Zellen; rzc: 710 km auf 710 Zellen). uv 0…1 spannt die volle Fläche —
 *     dieselbe Konvention, mit der der RainLayer seine Textur aufzieht.
 * Die Unterscheidung ist eine halbe Zelle wert (bei 1-km-Radar bis zu 1 km) und
 * entscheidet, ob Punktabfrage und Karte dieselbe Zelle meinen.
 */
export type CellAnchor = 'center' | 'edge';

/** Vorwärts-Bilinear: (u,v) ∈ [0,1]² → (x, y) im Quad-Raum. */
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
  project?: ProjectXY | null,
  maxIter = 8, tol = project ? 1e-3 : 1e-7,
): QuadUV | null {
  // Mit Projektion wird IM PROJIZIERTEN RAUM interpoliert (dort ist das Gitter
  // regulär) — Ecken und Punkt gehen durch dieselbe Abbildung. `tol` ist dann
  // in Projektionseinheiten (Meter, 1 mm) statt in Grad.
  const c: QuadCorners = project
    ? (corners.map(([lo, la]) => project(lo, la)) as QuadCorners)
    : corners;
  const [px, py] = project ? project(lon, lat) : [lon, lat];
  const [nw, ne, se, sw] = c;

  // Schneller Vor-Filter via axis-aligned Bbox der 4 Ecken. Die Toleranz (1e-6
  // der Quad-Ausdehnung, bei DE1200 rund 1 m) hält den Filter mit der uv-Rand-
  // toleranz weiter unten konsistent: ein Punkt EXAKT auf der Gitterkante fiel
  // sonst je nach Gleitkommarundung heraus (`null` statt Randzelle) — sichtbar
  // an den Kanten von INCA/rzc, deren Ecken leicht schief sind.
  const lonMin = Math.min(nw[0], ne[0], se[0], sw[0]);
  const lonMax = Math.max(nw[0], ne[0], se[0], sw[0]);
  const latMin = Math.min(nw[1], ne[1], se[1], sw[1]);
  const latMax = Math.max(nw[1], ne[1], se[1], sw[1]);
  const bboxTol = 1e-6 * Math.max(lonMax - lonMin, latMax - latMin);
  if (px < lonMin - bboxTol || px > lonMax + bboxTol
    || py < latMin - bboxTol || py > latMax + bboxTol) return null;

  let u = 0.5, v = 0.5;
  for (let iter = 0; iter < maxIter; iter++) {
    const [lonHat, latHat] = forwardBilinear(c, u, v);
    const dlon = lonHat - px;
    const dlat = latHat - py;
    if (Math.abs(dlon) < tol && Math.abs(dlat) < tol) break;
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
 * `project` MUSS gesetzt sein, wenn das Quellgitter projiziert ist (RADOLAN
 * `psFwd`, INCA `incaFwd`, rzc `rzcFwd`) — sonst greift die Abtastung bis zu
 * 36 km daneben. `anchor` sagt, ob die Ecken Zellmitten oder Außenkanten sind.
 * Aufrufer gehen über `radarSample.ts`, das beides aus der Quelle ableitet.
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
  project?: ProjectXY | null,
  anchor: CellAnchor = 'center',
): number | null {
  const uv = inverseBilinear(corners, lat, lon, project);
  if (!uv) return null;
  const col = anchor === 'edge'
    ? Math.min(width - 1, Math.max(0, Math.floor(uv.u * width)))
    : Math.min(width - 1, Math.max(0, Math.round(uv.u * (width - 1))));
  const row = anchor === 'edge'
    ? Math.min(height - 1, Math.max(0, Math.floor(uv.v * height)))
    : Math.min(height - 1, Math.max(0, Math.round(uv.v * (height - 1))));
  const raw = values[row * width + col];
  if (raw === 0) return 0;
  return (raw / 255) * vMax;
}
