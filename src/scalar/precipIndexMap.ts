/**
 * Reiner (DOM-freier) Kern der Zelle→Quellgitter-Index-Map für den
 * Niederschlags-Komposit (s. precipComposite.ts, PrecipCompositor). Eigenes
 * Modul, damit derselbe Code off-main im precipIndexWorker läuft — der
 * Newton-Solver (invBilinear, 8 Iterationen über 307.200 Zellen) kostet
 * ~250-370 ms je Quelle (4×-CPU-Throttle, gemessen) und lief bisher synchron
 * im build()-Render-Pfad, sobald eine Quelle (RADOLAN/INCA/rzc/ICON-D2) neu
 * zuschaltet.
 */

import { psFwd } from '../sources/radolan';
import type { QuadCorners } from './RainLayer';

/** DACH-Komposit-Gitter (reguläres lat/lon, ~0,02° ≈ 2 km). */
export const G = { lonMin: 5.5, lonMax: 17.4, latMin: 45.3, latMax: 55.5, w: 600, h: 512 };

type XY = [number, number];

/** Inverse Bilinear: Punkt P im Viereck (NW,NE,SE,SW) → (u,v) im Einheitsquadrat
 *  (u: 0=West…1=Ost, v: 0=Nord…1=Süd — wie die RainLayer-uv-Konvention). Newton. */
function invBilinear(nw: XY, ne: XY, se: XY, sw: XY, px: number, py: number): [number, number] {
  let u = 0.5, v = 0.5;
  for (let it = 0; it < 8; it++) {
    const bx = (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + u * v * se[0] + (1 - u) * v * sw[0];
    const by = (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + u * v * se[1] + (1 - u) * v * sw[1];
    const rx = bx - px, ry = by - py;
    const dux = (1 - v) * (ne[0] - nw[0]) + v * (se[0] - sw[0]);
    const duy = (1 - v) * (ne[1] - nw[1]) + v * (se[1] - sw[1]);
    const dvx = (1 - u) * (sw[0] - nw[0]) + u * (se[0] - ne[0]);
    const dvy = (1 - u) * (sw[1] - nw[1]) + u * (se[1] - ne[1]);
    const det = dux * dvy - duy * dvx;
    if (Math.abs(det) < 1e-12) break;
    u -= (dvy * rx - dvx * ry) / det;
    v -= (-duy * rx + dux * ry) / det;
  }
  return [u, v];
}

/** Baut die Zelle→Quellgitter-Index-Map (−1 = außerhalb des Quellgitters).
 *  `ps`=true → Verortung im polar-stereografischen Raum (RADOLAN). */
export function buildIndexMap(
  corners: QuadCorners, sCols: number, sRows: number,
  lat: Float32Array, lon: Float32Array, ps: boolean,
): Int32Array {
  const [NW, NE, SE, SW] = corners;
  const cNW: XY = ps ? psFwd(NW[0], NW[1]) : [NW[0], NW[1]];
  const cNE: XY = ps ? psFwd(NE[0], NE[1]) : [NE[0], NE[1]];
  const cSE: XY = ps ? psFwd(SE[0], SE[1]) : [SE[0], SE[1]];
  const cSW: XY = ps ? psFwd(SW[0], SW[1]) : [SW[0], SW[1]];
  const out = new Int32Array(lat.length);
  for (let i = 0; i < out.length; i++) {
    let px = lon[i], py = lat[i];
    if (ps) { const p = psFwd(lon[i], lat[i]); px = p[0]; py = p[1]; }
    const [u, v] = invBilinear(cNW, cNE, cSE, cSW, px, py);
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) { out[i] = -1; continue; }
    const col = Math.min(sCols - 1, Math.max(0, Math.round(u * (sCols - 1))));
    const row = Math.min(sRows - 1, Math.max(0, Math.round(v * (sRows - 1))));
    out[i] = row * sCols + col;
  }
  return out;
}

/** Regeneriert das feste DACH-Komposit-Gitter (lat/lon je Zelle) aus den paar
 *  G-Zahlen — reine Arithmetik. Der Worker baut lat/lon lokal neu auf statt sie
 *  entgegenzunehmen: die Arrays sind groß (~1,2 MB je Array) UND main-seitig
 *  von allen 4 Quellen geteilt/wiederverwendet — ein Transfer würde sie dort
 *  neutern. */
export function gridLatLon(): { lat: Float32Array; lon: Float32Array } {
  const lat = new Float32Array(G.w * G.h);
  const lon = new Float32Array(G.w * G.h);
  for (let r = 0; r < G.h; r++) {
    const latV = G.latMax - (r / (G.h - 1)) * (G.latMax - G.latMin);
    for (let c = 0; c < G.w; c++) {
      const i = r * G.w + c;
      lat[i] = latV;
      lon[i] = G.lonMin + (c / (G.w - 1)) * (G.lonMax - G.lonMin);
    }
  }
  return { lat, lon };
}

/** Worker-taugliche Fassade von buildIndexMap: baut lat/lon lokal neu statt sie
 *  entgegenzunehmen (s. gridLatLon) — der Aufruf braucht nur
 *  `corners`/`sCols`/`sRows`/`ps` (klein, strukturiert klonbar). */
export function buildCompositeIndexMap(
  corners: QuadCorners, sCols: number, sRows: number, ps: boolean,
): Int32Array {
  const { lat, lon } = gridLatLon();
  return buildIndexMap(corners, sCols, sRows, lat, lon, ps);
}
