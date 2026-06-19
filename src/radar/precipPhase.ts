/**
 * Niederschlagsart (Schnee/Regen) + Schneefallgrenzen-Linie fürs Regenradar.
 *
 * RADOLAN/INCA/rzc tragen KEINE Phase. Wir leiten sie — wie `alpineSplit` am
 * Punkt — flächig ab: Niederschlag, der über der (regionalen) Schneefallgrenze
 * fällt, ist Schnee. Pro Radar-Pixel wird die Geländehöhe (DEM, Terrarium) gegen
 * `snowLineM` gestellt; ein weicher Übergangsband macht den Schnee/Regen-Saum
 * natürlich. Eine Höhenlinie auf `snowLineM` (Marching Squares) zeigt die Grenze.
 *
 * Ehrliche Grenze: EINE regionale Schneefallgrenze über die ganze Radarszene —
 * keine pixelweise Temperatur. Reicht für „wo fällt Schnee", nicht fürs Gramm.
 */

import type { QuadCorners } from '../scalar/RainLayer';
import type { ElevationGrid } from '../fusion/elevation';

/** Schnee-Palette (t = mm/h ÷ RADAR_VMAX). Weiß→Blau, halbdeckend. */
export const snowRamp: Record<number, string> = {
  0.0: 'rgba(214,232,250,0)',
  0.015: 'rgba(224,238,253,0.82)',
  0.06: 'rgba(172,207,244,0.88)',
  0.15: 'rgba(120,166,230,0.92)',
  0.35: 'rgba(92,120,210,0.94)',
  1.0: 'rgba(70,96,190,0.95)',
};

/** Graupel/Schneeregen-Palette (Mix-Zone) — Violett/Pink. */
export const graupelRamp: Record<number, string> = {
  0.0: 'rgba(214,160,235,0)',
  0.015: 'rgba(220,170,238,0.82)',
  0.1: 'rgba(186,110,210,0.9)',
  0.4: 'rgba(150,70,180,0.93)',
  1.0: 'rgba(120,48,150,0.95)',
};

/** Hagel-Palette (Heuristik) — Magenta/Rot, signalstark. */
export const hailRamp: Record<number, string> = {
  0.0: 'rgba(255,120,170,0)',
  0.02: 'rgba(255,120,170,0.9)',
  0.2: 'rgba(240,60,110,0.94)',
  0.6: 'rgba(200,20,80,0.96)',
  1.0: 'rgba(150,8,60,0.97)',
};

export interface BBox { lngMin: number; lngMax: number; latMin: number; latMax: number; }

/** Achsenparalleles Hüll-Rechteck der Radar-Quad-Ecken. */
export function quadBBox(c: QuadCorners): BBox {
  const lngs = c.map((p) => p[0]); const lats = c.map((p) => p[1]);
  return { lngMin: Math.min(...lngs), lngMax: Math.max(...lngs), latMin: Math.min(...lats), latMax: Math.max(...lats) };
}

/** Pixel-UV (0..1) → (lng,lat) per bilinearer Quad-Interpolation (NW,NE,SE,SW)
 *  — exakt die Abbildung, die der RainLayer zum Rendern nutzt (deckungsgleich). */
function quadLerp(c: QuadCorners, u: number, v: number): [number, number] {
  const [nw, ne, se, sw] = c;
  const tx = nw[0] + (ne[0] - nw[0]) * u, ty = nw[1] + (ne[1] - nw[1]) * u;
  const bx = sw[0] + (se[0] - sw[0]) * u, by = sw[1] + (se[1] - sw[1]) * u;
  return [tx + (bx - tx) * v, ty + (by - ty) * v];
}

export interface RadarTerrain {
  width: number; height: number; corners: QuadCorners;
  /** Geländehöhe (m) je Radar-Pixel, full-res, row-major. */
  elevFull: Float32Array;
  /** Grobe Höhenmatrix (für die Schneefallgrenzen-Linie). */
  ceElev: Float32Array; cw: number; ch: number;
}

/** Baut die Gelände-Höhenmatrix für ein Radar-Gitter (einmalig je Stack).
 *  DEM grob abtasten (cap CW), dann bilinear auf Radar-Auflösung hochrechnen —
 *  spart ~99 % der DEM-Lookups bei optisch identischem Ergebnis. */
export function buildTerrain(corners: QuadCorners, width: number, height: number, dem: ElevationGrid): RadarTerrain {
  const MAXD = 224;
  const cw = Math.min(MAXD, width), ch = Math.min(MAXD, height);
  const ce = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    const v = ch > 1 ? j / (ch - 1) : 0;
    for (let i = 0; i < cw; i++) {
      const u = cw > 1 ? i / (cw - 1) : 0;
      const [lng, lat] = quadLerp(corners, u, v);
      const e = dem.sample(lng, lat);
      ce[j * cw + i] = Number.isFinite(e) ? e : 0;
    }
  }
  // Bilinear auf volle Radar-Auflösung.
  const elevFull = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = height > 1 ? (y / (height - 1)) * (ch - 1) : 0;
    const j0 = Math.floor(fy), j1 = Math.min(ch - 1, j0 + 1), ty = fy - j0;
    for (let x = 0; x < width; x++) {
      const fx = width > 1 ? (x / (width - 1)) * (cw - 1) : 0;
      const i0 = Math.floor(fx), i1 = Math.min(cw - 1, i0 + 1), tx = fx - i0;
      const e0 = ce[j0 * cw + i0] + (ce[j0 * cw + i1] - ce[j0 * cw + i0]) * tx;
      const e1 = ce[j1 * cw + i0] + (ce[j1 * cw + i1] - ce[j1 * cw + i0]) * tx;
      elevFull[y * width + x] = e0 + (e1 - e0) * ty;
    }
  }
  return { width, height, corners, elevFull, ceElev: ce, cw, ch };
}

/** Hagel-Schwelle (mm/h): nur extrem-konvektive Intensität in Warmluft gilt als
 *  Hagel-Verdacht. Heuristik — QPE-Radar trägt keine Hydrometeor-Klasse. */
export const HAIL_MMH = 15;

export interface PhaseBuffers {
  rain: Uint8Array; snow: Uint8Array; graupel: Uint8Array; hail: Uint8Array;
}

/** Teilt ein Niederschlags-Frame in die vier Phasen auf (jede als eigenes
 *  Werteraster für einen RainLayer). Pro Pixel anhand Geländehöhe vs.
 *  Schneefallgrenze + Intensität:
 *    • dh ≥ +band                → Schnee
 *    • −band < dh < +band        → Graupel/Schneeregen (Mix, Heuristik)
 *    • dh ≤ −band & i ≥ Hagel-T   → Hagel (Heuristik, Warmluft + extrem)
 *    • dh ≤ −band sonst          → Regen
 *  Ohne Schneefallgrenze/Gelände → alles Regen (bzw. Hagel bei extremer i).
 *  Schreibt in die übergebenen Puffer (kein Re-Alloc). */
export function classifyPhases(
  frame: Uint8Array, elevFull: Float32Array | null, snowLineM: number | null,
  vmax: number, out: PhaseBuffers, bandM = 150, hailMmH = HAIL_MMH,
): void {
  const n = frame.length;
  const hailT = Math.round((hailMmH / vmax) * 255);
  const haveTerrain = !!elevFull && snowLineM != null && Number.isFinite(snowLineM);
  for (let i = 0; i < n; i++) {
    out.rain[i] = 0; out.snow[i] = 0; out.graupel[i] = 0; out.hail[i] = 0;
    const v = frame[i];
    if (v === 0) continue;
    if (!haveTerrain) { if (v >= hailT) out.hail[i] = v; else out.rain[i] = v; continue; }
    const dh = elevFull![i] - (snowLineM as number);
    if (dh >= bandM) out.snow[i] = v;
    else if (dh <= -bandM) { if (v >= hailT) out.hail[i] = v; else out.rain[i] = v; }
    else out.graupel[i] = v;
  }
}

/** Schneefallgrenzen-Höhenlinie (Marching Squares auf der groben Höhenmatrix)
 *  als GeoJSON-LineString-Features. Leer, wenn keine Grenze. */
export function snowLineGeoJSON(t: RadarTerrain, snowLineM: number | null): GeoJSON.Feature[] {
  if (snowLineM == null) return [];
  const { ceElev: g, cw, ch, corners } = t;
  const seg: Array<[[number, number], [number, number]]> = [];
  const at = (gi: number, gj: number): [number, number] => quadLerp(corners, cw > 1 ? gi / (cw - 1) : 0, ch > 1 ? gj / (ch - 1) : 0);
  const interp = (gi0: number, gj0: number, v0: number, gi1: number, gj1: number, v1: number): [number, number] => {
    const tt = Math.abs(v1 - v0) < 1e-6 ? 0.5 : (snowLineM - v0) / (v1 - v0);
    return at(gi0 + (gi1 - gi0) * tt, gj0 + (gj1 - gj0) * tt);
  };
  for (let j = 0; j < ch - 1; j++) {
    for (let i = 0; i < cw - 1; i++) {
      const tl = g[j * cw + i], tr = g[j * cw + i + 1], br = g[(j + 1) * cw + i + 1], bl = g[(j + 1) * cw + i];
      let idx = 0;
      if (tl > snowLineM) idx |= 8; if (tr > snowLineM) idx |= 4; if (br > snowLineM) idx |= 2; if (bl > snowLineM) idx |= 1;
      if (idx === 0 || idx === 15) continue;
      // Kantenschnittpunkte (Top, Right, Bottom, Left) in Gitterkoordinaten.
      const top = () => interp(i, j, tl, i + 1, j, tr);
      const right = () => interp(i + 1, j, tr, i + 1, j + 1, br);
      const bottom = () => interp(i, j + 1, bl, i + 1, j + 1, br);
      const left = () => interp(i, j, tl, i, j + 1, bl);
      const push = (a: [number, number], b: [number, number]) => seg.push([a, b]);
      switch (idx) {
        case 1: case 14: push(left(), bottom()); break;
        case 2: case 13: push(bottom(), right()); break;
        case 3: case 12: push(left(), right()); break;
        case 4: case 11: push(top(), right()); break;
        case 5: push(left(), top()); push(bottom(), right()); break;
        case 6: case 9: push(top(), bottom()); break;
        case 7: case 8: push(left(), top()); break;
        case 10: push(left(), bottom()); push(top(), right()); break;
      }
    }
  }
  return seg.map((s) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [s[0], s[1]] } }));
}
