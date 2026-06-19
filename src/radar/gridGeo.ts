/**
 * Geometrie-Helfer für Radar-Gitter (gemeinsam von Zell-Tracking, Akkumulation
 * und Coverage genutzt). Rein, keine Abhängigkeiten außer dem Eck-Typ.
 *
 * Gitter-Konvention überall: north-up, Zeile 0 = Norden, Spalte 0 = Westen,
 * Eckreihenfolge [NW, NE, SE, SW] (wie MapLibre-image-Source / RainLayer).
 */

import type { QuadCorners } from '../scalar/RainLayer';

/** Bilineare Position im Quad. u ∈ [0,1] West→Ost, v ∈ [0,1] Nord→Süd → [lon,lat]. */
export function quadLerp(corners: QuadCorners, u: number, v: number): [number, number] {
  const [nw, ne, se, sw] = corners;
  const topLon = nw[0] + (ne[0] - nw[0]) * u;
  const topLat = nw[1] + (ne[1] - nw[1]) * u;
  const botLon = sw[0] + (se[0] - sw[0]) * u;
  const botLat = sw[1] + (se[1] - sw[1]) * u;
  return [topLon + (botLon - topLon) * v, topLat + (botLat - topLat) * v];
}

/** Äquirektangulär-Distanz in km zwischen zwei [lon,lat]-Punkten. */
export function distKm(a: [number, number], b: [number, number]): number {
  const latMid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(latMid);
  const dy = (b[1] - a[1]) * 110.57;
  return Math.hypot(dx, dy);
}

/** Kompass-Peilung (° meteo: 0=N, 90=O) von a nach b. */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const latMid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(latMid); // Ost-Komponente
  const dy = b[1] - a[1];                       // Nord-Komponente
  let deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** Peilung → Himmelsrichtungs-Kürzel (de). */
export function compass8(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((deg % 360) / 45) % 8];
}
