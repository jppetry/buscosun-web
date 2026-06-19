/**
 * Niederschlags-Komposit über DACH — länderrichtiges Radar unabhängig vom
 * gesuchten Ort.
 *
 * Bisher wählte der Niederschlags-Layer EINE Quelle nach `location.country`
 * (DE→RADOLAN, AT→INCA, CH→rzc, sonst ICON-D2). Folge: schaut man von einem
 * DE-Ort auf Österreich, lief die DE-Kette — RADOLAN deckt AT aber nicht ab →
 * kein Radar über AT. Dieser Compositor mischt stattdessen pro Karten-Zelle die
 * fachlich richtige Quelle ein:
 *   • DE-Fläche  → RADOLAN-RV  (0–2 h)
 *   • AT-Fläche  → GeoSphere INCA (0–3 h)
 *   • CH-Fläche  → MeteoSchweiz rzc (nur „jetzt")
 *   • sonst / jenseits des jeweiligen Nowcast-Horizonts → ICON-D2 (Forecast)
 * Die Länderzuordnung nutzt dieselbe Box-Heuristik wie der Punktforecast
 * ({@link pickCountry}) und partitioniert jede Zelle eindeutig — INCA übermalt
 * also nicht mehr Süddeutschland/Schweiz.
 *
 * Gerendert wird EIN reguläres lat/lon-Gitter über DACH (ein RainLayer-Frame).
 * Die Zelle→Quellgitter-Zuordnung ist geometrisch fix → wird je Quelle EINMAL
 * vorberechnet (Index-Map); pro Slider-Schritt nur noch Array-Gather (flüssig).
 * RADOLAN ist polar-stereografisch → exakte Inverse über `psFwd`; INCA/rzc/
 * ICON-D2 über inverse Bilinear-Interpolation ihrer vier Geo-Ecken.
 */

import { pickCountry } from '../pointForecast/clustering';
import { psFwd } from '../sources/radolan';
import type { QuadCorners } from './RainLayer';
import type { RvNowcast } from '../sources/radolan';
import type { IncaGrid } from '../sources/geosphereIncaGrid';
import type { RadarFrame } from '../sources/meteoSwissRadar';
import type { IconD2Precip } from '../sources/iconD2Precip';

/** DACH-Komposit-Gitter (reguläres lat/lon, ~0,02° ≈ 2 km). */
const G = { lonMin: 5.5, lonMax: 17.4, latMin: 45.3, latMax: 55.5, w: 600, h: 512 };
/** Ecken [NW, NE, SE, SW] für RainLayer.setFrame (north-up). */
export const COMPOSITE_CORNERS: QuadCorners = [
  [G.lonMin, G.latMax], [G.lonMax, G.latMax], [G.lonMax, G.latMin], [G.lonMin, G.latMin],
];

/** Nowcast-Horizonte je Land (Stunden) — jenseits davon ICON-D2. */
export const RV_MAX_H = 2;     // DE RADOLAN-RV
export const INCA_MAX_H = 3;   // AT GeoSphere INCA
export const RZC_MAX_H = 0.5;  // CH rzc (nur „jetzt")

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
function buildIndexMap(
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

export interface CompositeSources {
  rv?: RvNowcast | null;
  inca?: IncaGrid | null;
  rzc?: RadarFrame | null;
  d2?: IconD2Precip | null;
}

export interface CompositeFrame {
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
}

/**
 * Hält das feste Komposit-Gitter + die je Quelle einmalig berechneten Index-Maps
 * und mischt pro Slider-Stunde den Frame zusammen.
 */
export class PrecipCompositor {
  readonly width = G.w;
  readonly height = G.h;
  readonly corners = COMPOSITE_CORNERS;
  private readonly lat = new Float32Array(G.w * G.h);
  private readonly lon = new Float32Array(G.w * G.h);
  private readonly country = new Uint8Array(G.w * G.h); // 0=DE, 1=AT, 2=CH
  private deIdx: Int32Array | null = null; private deKey = '';
  private atIdx: Int32Array | null = null; private atKey = '';
  private chIdx: Int32Array | null = null; private chKey = '';
  private d2Idx: Int32Array | null = null; private d2Key = '';

  constructor() {
    for (let r = 0; r < G.h; r++) {
      const lat = G.latMax - (r / (G.h - 1)) * (G.latMax - G.latMin);
      for (let c = 0; c < G.w; c++) {
        const i = r * G.w + c;
        const lon = G.lonMin + (c / (G.w - 1)) * (G.lonMax - G.lonMin);
        this.lat[i] = lat; this.lon[i] = lon;
        const cc = pickCountry(lat, lon);
        this.country[i] = cc === 'AT' ? 1 : cc === 'CH' ? 2 : 0;
      }
    }
  }

  private ensureDe(rv: RvNowcast) {
    const f = rv.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.deKey && this.deIdx) return;
    this.deIdx = buildIndexMap(rv.corners, f.width, f.height, this.lat, this.lon, true);
    this.deKey = key;
  }
  private ensureAt(inca: IncaGrid) {
    const f = inca.frames[0]; const key = `${f.width}x${f.height}:${inca.corners[0][0]}`;
    if (key === this.atKey && this.atIdx) return;
    this.atIdx = buildIndexMap(inca.corners, f.width, f.height, this.lat, this.lon, false);
    this.atKey = key;
  }
  private ensureCh(rzc: RadarFrame) {
    const key = `${rzc.width}x${rzc.height}:${rzc.corners[0][0]}`;
    if (key === this.chKey && this.chIdx) return;
    this.chIdx = buildIndexMap(rzc.corners, rzc.width, rzc.height, this.lat, this.lon, false);
    this.chKey = key;
  }
  private ensureD2(d2: IconD2Precip) {
    const f = d2.frames[0]; const key = `${f.width}x${f.height}`;
    if (key === this.d2Key && this.d2Idx) return;
    this.d2Idx = buildIndexMap(d2.corners, f.width, f.height, this.lat, this.lon, false);
    this.d2Key = key;
  }

  /** Komposit-Frame für Vorlaufstunde `h` (nowMs = aktuelle Zeit für ICON-D2-Wahl). */
  build(h: number, s: CompositeSources, nowMs: number): CompositeFrame {
    const out = new Uint8Array(G.w * G.h);

    const rv = h <= RV_MAX_H + 1e-6 && s.rv?.frames.length ? nearestBy(s.rv.frames, (f) => Math.abs(f.leadMinutes - h * 60)) : null;
    const inca = h <= INCA_MAX_H + 1e-6 && s.inca?.frames.length ? nearestBy(s.inca.frames, (f) => Math.abs(f.leadHours - h)) : null;
    const rzc = h < RZC_MAX_H && s.rzc ? s.rzc : null;
    const d2 = s.d2?.frames.length ? nearestBy(s.d2.frames, (f) => Math.abs(f.validAt.getTime() - (nowMs + h * 3600_000))) : null;

    if (rv) this.ensureDe(s.rv!);
    if (inca) this.ensureAt(s.inca!);
    if (rzc) this.ensureCh(s.rzc!);
    if (d2) this.ensureD2(s.d2!);

    for (let i = 0; i < out.length; i++) {
      const c = this.country[i];
      let v = 0; let filled = false;
      if (c === 0 && rv && this.deIdx) { const j = this.deIdx[i]; if (j >= 0) { v = rv.values[j]; filled = true; } }
      else if (c === 1 && inca && this.atIdx) { const j = this.atIdx[i]; if (j >= 0) { v = inca.values[j]; filled = true; } }
      else if (c === 2 && rzc && this.chIdx) { const j = this.chIdx[i]; if (j >= 0) { v = rzc.values[j]; filled = true; } }
      if (!filled && d2 && this.d2Idx) { const j = this.d2Idx[i]; if (j >= 0) v = d2.values[j]; }
      out[i] = v;
    }
    return { values: out, width: G.w, height: G.h, corners: COMPOSITE_CORNERS };
  }
}

function nearestBy<T>(arr: T[], dist: (x: T) => number): T {
  let best = arr[0], bd = dist(arr[0]);
  for (const x of arr) { const d = dist(x); if (d < bd) { bd = d; best = x; } }
  return best;
}
