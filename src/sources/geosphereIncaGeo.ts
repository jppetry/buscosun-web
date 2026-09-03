/**
 * Geometrie des GeoSphere-INCA-Nowcast-Gitters (AT) — Lambert-konforme Kegel-
 * projektion (EPSG:31287-Geometrie) und Warp-Mesh.
 *
 * Reines Modul (keine Imports, kein DOM/Worker/Netz) — dieselbe Rolle wie
 * `radolanGeo.ts` für DE: Rendering, Karten-Komposit und Punktabfrage benutzen
 * DIESELBEN Formeln (RP2, s. `audit/radar-punktverortung.md` §11).
 *
 * **Parameter am Datenfeld verifiziert, nicht angenommen.** Die INCA-Antwort
 * liefert `lat`/`lon` je Zelle (701×431 float32); projiziert man die vier
 * Eckzellen mit den EPSG:31287-Parametern (lat_1 46, lat_2 49, lat_0 47.5,
 * lon_0 13⅓, x_0 = y_0 = 400 000), ergibt sich ein achsparalleles Gitter mit
 * **999,99 m Zellbreite und 1000,00 m Zellhöhe** (Restschiefe der Kanten ≤ 26 m,
 * also ≤ 2,6 % einer Zelle). Auf dem **WGS84-Ellipsoid** — nicht auf Bessel:
 * mit Bessel liegt die Zellgröße bei 999,87 m, die Felder sind also bereits
 * datumsbereinigt geliefert. Ohne Projektion (linear in lon/lat) griff die
 * Punktabfrage 5–11 km daneben.
 *
 * **Eck-Konvention:** die NetCDF-Felder geben ZELLMITTELPUNKTE (700 km auf 701
 * Zellen). `cellCentersToEdges` rechnet sie EINMAL beim Laden auf die
 * Gitteraußenkanten um, damit im Rest der App eine einzige Konvention gilt —
 * dieselbe wie bei RADOLAN und rzc, und dieselbe, mit der der RainLayer seine
 * Textur aufzieht.
 */

import { warpMeshFromProjection } from '../scalar/quadWarpMesh';

const D = Math.PI / 180;

// EPSG:31287 (Austria Lambert), gerechnet auf WGS84 — s. Kopfkommentar.
const A = 6378137, E2 = 0.00669437999014, E = Math.sqrt(E2);
const LAT_1 = 46 * D, LAT_2 = 49 * D, LAT_0 = 47.5 * D;
const LON_0 = 13.333333333333334 * D;
const X_0 = 400000, Y_0 = 400000;

const mF = (p: number) => Math.cos(p) / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
const tF = (p: number) => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - E * Math.sin(p)) / (1 + E * Math.sin(p)), E / 2);
const N_C = Math.log(mF(LAT_1) / mF(LAT_2)) / Math.log(tF(LAT_1) / tF(LAT_2));
const F_C = mF(LAT_1) / (N_C * Math.pow(tF(LAT_1), N_C));
const RHO_0 = A * F_C * Math.pow(tF(LAT_0), N_C);

/** WGS84 (lon, lat) → Lambert-Metrik (x, y) des INCA-Gitters. */
export function incaFwd(lonDeg: number, latDeg: number): [number, number] {
  const rho = A * F_C * Math.pow(tF(latDeg * D), N_C);
  const theta = N_C * (lonDeg * D - LON_0);
  return [X_0 + rho * Math.sin(theta), Y_0 + RHO_0 - rho * Math.cos(theta)];
}

/** Umkehrung von {@link incaFwd}: (x, y) → [lon, lat] in Grad. */
export function incaInv(x: number, y: number): [number, number] {
  const dx = x - X_0, dy = RHO_0 - (y - Y_0);
  const sign = N_C < 0 ? -1 : 1;
  const rho = sign * Math.hypot(dx, dy);
  const theta = Math.atan2(sign * dx, sign * dy);
  const t = Math.pow(rho / (A * F_C), 1 / N_C);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const es = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - es) / (1 + es), E / 2));
  }
  return [(theta / N_C + LON_0) / D, phi / D];
}

/** Unterteilungen des Warp-Mesh je Achse ((N+1)² Knoten). 144 → Mercator-Rest
 *  ≈ 0,8 m (`audit/karten-layer-verortung.md` §15.3; 16 waren 58 m, 128 lagen
 *  mit 1,0 m genau auf der Grenze). */
export const INCA_WARP_N = 144;

type Corners4 = [[number, number], [number, number], [number, number], [number, number]];

/**
 * Rechnet die vier Eck-ZELLMITTEN des INCA-Gitters auf seine AUSSENKANTEN um
 * (je eine halbe Zelle nach außen, in Lambert gerechnet). Wird EINMAL beim Laden
 * angewandt (`geosphereIncaGrid.ts`), damit im Rest der App nur noch eine
 * Eck-Konvention existiert. `cols`/`rows` = Gitterdimensionen.
 */
export function cellCentersToEdges(centers: Corners4, cols: number, rows: number): Corners4 {
  const [nw, ne, se, sw] = centers.map(([lo, la]) => incaFwd(lo, la));
  // Das Gitter ist in Lambert achsparallel (Restschiefe ≤ 26 m) — die Kanten
  // werden aus je beiden Ecken gemittelt, statt eine davon zu bevorzugen.
  const west = (nw[0] + sw[0]) / 2, ost = (ne[0] + se[0]) / 2;
  const nord = (nw[1] + ne[1]) / 2, sued = (sw[1] + se[1]) / 2;
  const halfX = (ost - west) / (cols - 1) / 2;   // Mitte-zu-Mitte / (n−1) = Zellgröße
  const halfY = (nord - sued) / (rows - 1) / 2;
  const x0 = west - halfX, x1 = ost + halfX;
  const y0 = nord + halfY, y1 = sued - halfY;
  return [incaInv(x0, y0), incaInv(x1, y0), incaInv(x1, y1), incaInv(x0, y1)];
}

/**
 * Warp-Mesh des INCA-Gitters aus seinen vier Außenkanten-Ecken: (N+1)²
 * lon/lat-Paare, Index `(j*(N+1)+i)*2`, i = u (West→Ost), j = v (Nord→Süd) —
 * uv-Konvention des RainLayer. Knoten exakt Lambert-verortet.
 */
export function incaWarpMesh(corners: Corners4): Float32Array {
  const hit = _incaMesh.get(corners);
  if (hit) return hit;
  const out = warpMeshFromProjection(incaNodeFn(corners), INCA_WARP_N);
  _incaMesh.set(corners, out);
  return out;
}
/** Memoisiert je Ecken-Referenz (der RainLayer baut den GL-Puffer nur bei neuer Referenz). */
const _incaMesh = new WeakMap<Corners4, Float32Array>();

/** Exakte lon/lat-Lage des INCA-Gitterpunkts (u, v) — auch knapp außerhalb [0,1]. */
export function incaNodeFn(corners: Corners4): (u: number, v: number) => [number, number] {
  const [nw, ne, se, sw] = corners.map(([lo, la]) => incaFwd(lo, la));
  const west = (nw[0] + sw[0]) / 2, ost = (ne[0] + se[0]) / 2;
  const nord = (nw[1] + ne[1]) / 2, sued = (sw[1] + se[1]) / 2;
  return (u, v) => incaInv(west + u * (ost - west), nord + v * (sued - nord));
}
