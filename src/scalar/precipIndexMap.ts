/**
 * Reiner (DOM-freier) Kern der Zelle→Quellgitter-Index-Map für den
 * Niederschlags-Komposit (s. precipComposite.ts, PrecipCompositor). Eigenes
 * Modul, damit derselbe Code off-main im precipIndexWorker läuft — der
 * Newton-Solver (invBilinear, 8 Iterationen über 307.200 Zellen) kostet
 * ~250-370 ms je Quelle (4×-CPU-Throttle, gemessen) und lief bisher synchron
 * im build()-Render-Pfad, sobald eine Quelle (RADOLAN/INCA/rzc/ICON-D2) neu
 * zuschaltet.
 */

import { psFwd } from '../sources/radolanGeo';
import { incaFwd } from '../sources/geosphereIncaGeo';
import { rzcFwd } from '../sources/meteoSwissGeo';
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

/**
 * Quellgitter-Kennung — bestimmt Projektion UND Eck-Konvention. Ein String (kein
 * Funktions-Handle), damit der Wert strukturiert klonbar über die Worker-Grenze
 * geht. Die Zuordnung ist dieselbe wie in `pointForecast/radarSample.ts`, damit
 * Karte, Komposit und Punktabfrage EINE Verortung teilen (RP1/RP2, s.
 * `audit/radar-punktverortung.md`).
 */
export type GridKind = 'radolan' | 'inca' | 'rzc' | 'lonlat';

interface GridGeo { project: ((lon: number, lat: number) => XY) | null; edge: boolean }
const GRID_GEO: Record<GridKind, GridGeo> = {
  radolan: { project: psFwd,   edge: true },   // DE1200, polar-stereografisch, Ecken = Außenkanten
  inca:    { project: incaFwd, edge: true },   // AT, Lambert, Ecken = Außenkanten (s. geosphereIncaGrid)
  rzc:     { project: rzcFwd,  edge: true },   // CH, LV95/somerc, Ecken = Außenkanten
  // ICON-D2 `regular-lat-lon`: braucht KEINE Projektion — aber seine Ecken kommen
  // aus `gribCorners` und sind damit ebenfalls **Außenkanten**. Bis 2026-08-22 stand
  // hier `edge: false`; der Kommentar beantwortete nur die Projektionsfrage und
  // überging die Eck-Frage, wodurch bei 17 % der Orte die Nachbarzelle gelesen wurde
  // (bis 2,7 km, `audit/karten-layer-verortung.md` §7c).
  lonlat:  { project: null,    edge: true },
};

/** Baut die Zelle→Quellgitter-Index-Map (−1 = außerhalb des Quellgitters). */
export function buildIndexMap(
  corners: QuadCorners, sCols: number, sRows: number,
  lat: Float32Array, lon: Float32Array, grid: GridKind,
): Int32Array {
  const { project, edge } = GRID_GEO[grid];
  const [NW, NE, SE, SW] = corners;
  const pc = (c: [number, number]): XY => (project ? project(c[0], c[1]) : [c[0], c[1]]);
  const cNW = pc(NW), cNE = pc(NE), cSE = pc(SE), cSW = pc(SW);
  const out = new Int32Array(lat.length);
  for (let i = 0; i < out.length; i++) {
    let px = lon[i], py = lat[i];
    if (project) { const p = project(lon[i], lat[i]); px = p[0]; py = p[1]; }
    const [u, v] = invBilinear(cNW, cNE, cSE, cSW, px, py);
    if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) { out[i] = -1; continue; }
    const col = edge
      ? Math.min(sCols - 1, Math.max(0, Math.floor(u * sCols)))
      : Math.min(sCols - 1, Math.max(0, Math.round(u * (sCols - 1))));
    const row = edge
      ? Math.min(sRows - 1, Math.max(0, Math.floor(v * sRows)))
      : Math.min(sRows - 1, Math.max(0, Math.round(v * (sRows - 1))));
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
  // Zellmitten, nicht Randpunkte: `COMPOSITE_CORNERS` gehen als AUSSENKANTEN in
  // den RainLayer, dessen Shader die Texelmitten auf (i+0,5)/n legt. Mit dem
  // früheren `c/(w−1)` wurde jede Komposit-Zelle an einem Ort befüllt, der eine
  // halbe Zelle neben ihrer Zeichenfläche lag (0,5 km Median, bis 1,14 km —
  // `audit/karten-layer-verortung.md` §7).
  for (let r = 0; r < G.h; r++) {
    const latV = G.latMax - ((r + 0.5) / G.h) * (G.latMax - G.latMin);
    for (let c = 0; c < G.w; c++) {
      const i = r * G.w + c;
      lat[i] = latV;
      lon[i] = G.lonMin + ((c + 0.5) / G.w) * (G.lonMax - G.lonMin);
    }
  }
  return { lat, lon };
}

/** Worker-taugliche Fassade von buildIndexMap: baut lat/lon lokal neu statt sie
 *  entgegenzunehmen (s. gridLatLon) — der Aufruf braucht nur
 *  `corners`/`sCols`/`sRows`/`grid` (klein, strukturiert klonbar). */
export function buildCompositeIndexMap(
  corners: QuadCorners, sCols: number, sRows: number, grid: GridKind,
): Int32Array {
  const { lat, lon } = gridLatLon();
  return buildIndexMap(corners, sCols, sRows, lat, lon, grid);
}
