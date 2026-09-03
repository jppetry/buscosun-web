/**
 * Geometrie des DWD-RADOLAN-Gitters DE1200 — polar-stereografische Projektion,
 * Eckkoordinaten und Warp-Mesh.
 *
 * Eigenes Modul (aus `radolan.ts` herausgelöst, das die Fetcher/Decoder trägt):
 * reine Mathematik, als einziger Import das ebenso reine `quadWarpMesh`, kein DOM, kein Worker, kein Netz. Damit ist
 * die Verortung sowohl im Worker (`precipIndexMap`) als auch headless im
 * Verifier (`scripts/verify-radar-sampling.mjs`) importierbar — und vor allem:
 * **Rendering und Punktabfrage rechnen mit denselben Formeln** (RP1, s.
 * `audit/radar-punktverortung.md`). `radolan.ts` re-exportiert alles unverändert,
 * bestehende Importpfade bleiben also gültig.
 */

import { warpMeshFromProjection } from '../scalar/quadWarpMesh';

/**
 * Exakte WGS84-Eckkoordinaten des DE1200-Gitters (aus den ODIM-`/where`-
 * Attributen der RY-HDF5, die auf demselben Gitter wie RV liegt). Reihenfolge
 * für MapLibres `image`-Source: [top-left, top-right, bottom-right, bottom-left]
 * = [NW, NE, SE, SW]. Norden ist oben (wir flippen die Zeilen beim Dekodieren).
 *
 * Das Gitter ist polar-stereografisch (lat_0=90, lat_ts=60, lon_0=10, WGS84);
 * linear zwischen diesen vier Ecken zu interpolieren verschiebt Zellen im
 * Inneren um bis zu ~40 km — deshalb `psFwd`/`de1200WarpMesh` (s. u.).
 */
export const DE1200_CORNERS: [
  [number, number], [number, number], [number, number], [number, number],
] = [
  [1.46330151, 55.86208711],   // NW / top-left
  [18.73161645, 55.84543856],  // NE / top-right
  [16.58086935, 45.68460578],  // SE / bottom-right
  [3.566994635, 45.69642538],  // SW / bottom-left
];

// ---------------------------------------------------------------------------
// Polar-stereografische Verortung des DE1200-Gitters (WGS84, lat_ts=60, lon_0=10).
//
// Die Breitenkreise des PS-Gitters sind gekrümmt → ein naiver 4-Eck-Warp (linear
// in lon/lat) verschiebt Zellen im Inneren um bis zu ~40 km (Mittel ~15 km),
// wachsend von 0 an den Ecken zu den Kantenmitten. IM PS-RAUM ist das Gitter
// dagegen achsparallel und regulär — wer dorthin projiziert, rechnet exakt.
// Genau das tun: `de1200WarpMesh` (Rendering), `buildIndexMap(…, ps=true)`
// (Karten-Komposit) und `sampleRadarQuad(…, psFwd)` (Punktabfrage).
// ---------------------------------------------------------------------------
const PS_A = 6378137, PS_E = 0.081819190842622;
const PS_LON0 = 10 * Math.PI / 180, PS_PHIC = 60 * Math.PI / 180;
const psT = (phi: number) => { const es = PS_E * Math.sin(phi); return Math.tan(Math.PI / 4 - phi / 2) * Math.pow((1 + es) / (1 - es), PS_E / 2); };
const psM = (phi: number) => Math.cos(phi) / Math.sqrt(1 - PS_E * PS_E * Math.sin(phi) * Math.sin(phi));
const PS_TC = psT(PS_PHIC), PS_MC = psM(PS_PHIC);

/** WGS84 (lon, lat) → polar-stereografische Metrik (x, y) des DE1200-Gitters. */
export function psFwd(lonDeg: number, latDeg: number): [number, number] {
  const phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180;
  const rho = PS_A * PS_MC * psT(phi) / PS_TC;
  return [rho * Math.sin(lam - PS_LON0), -rho * Math.cos(lam - PS_LON0)];
}

/** Umkehrung von {@link psFwd}: (x, y) → [lon, lat] in Grad. */
export function psInv(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y), t = rho * PS_TC / (PS_A * PS_MC);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) { const es = PS_E * Math.sin(phi); phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - es) / (1 + es), PS_E / 2)); }
  return [(PS_LON0 + Math.atan2(x, -y)) * 180 / Math.PI, phi * 180 / Math.PI];
}

/**
 * Unterteilungen des Warp-Mesh je Achse ((N+1)² Knoten). 352 → Mercator-Rest
 * ≈ 0,8 m (`audit/karten-layer-verortung.md` §15.3; 32 waren 87 m, 320 lagen
 * mit 1,0 m genau auf der Grenze). Projizierte Gitter krümmen sich in BEIDEN
 * Richtungen, deshalb N² und nicht nur Zeilen.
 */
export const DE1200_WARP_N = 352;
let _de1200Mesh: Float32Array | null = null;

/** Exakte lon/lat-Lage des DE1200-Gitterpunkts (u, v) — auch knapp außerhalb [0,1]. */
export function de1200Node(u: number, v: number): [number, number] {
  const [NW, NE, SE, SW] = DE1200_CORNERS;
  const pNW = psFwd(NW[0], NW[1]), pNE = psFwd(NE[0], NE[1]), pSE = psFwd(SE[0], SE[1]), pSW = psFwd(SW[0], SW[1]);
  // Gitter ist in PS regulär → Knoten = bilineare Mischung der Eck-PS-Koordinaten.
  const x = (1 - u) * (1 - v) * pNW[0] + u * (1 - v) * pNE[0] + (1 - u) * v * pSW[0] + u * v * pSE[0];
  const y = (1 - u) * (1 - v) * pNW[1] + u * (1 - v) * pNE[1] + (1 - u) * v * pSW[1] + u * v * pSE[1];
  return psInv(x, y);
}

/**
 * Fein unterteiltes Warp-Mesh des DE1200-Gitters: (N+1)² lon/lat-Paare, Index
 * `(j*(N+1)+i)*2`, mit i = u (0 = West … 1 = Ost) und j = v (0 = Nord … 1 = Süd) —
 * passend zur uv-Konvention des RainLayer (uv(0,0)=NW). Knoten polar-
 * stereografisch verortet: 64² exakt, dazwischen bikubisch (≤ 18 mm gegen die
 * direkte Inverse, `warpMeshFromProjection`; direkt wären 320² · psInv = 211 ms).
 * Memoisiert (Gitter ist konstant).
 */
export function de1200WarpMesh(): Float32Array {
  if (_de1200Mesh) return _de1200Mesh;
  _de1200Mesh = warpMeshFromProjection(de1200Node, DE1200_WARP_N);
  return _de1200Mesh;
}
