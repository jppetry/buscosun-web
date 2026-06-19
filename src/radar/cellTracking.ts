/**
 * Sturmzellen-Erkennung & -Verfolgung (§7) — rein client-seitig aus den
 * vorhandenen RADOLAN-/INCA-Frame-Gittern, KEIN neuer Daten-Feed.
 *
 * Pipeline (alles pur, headless prüfbar via {@link verifyCellTracking}):
 *  1. Gröbern: u8-Frame → coarse mm/h-Gitter (Block-Mittel) für Tempo.
 *  2. Erkennen: Schwellen + Connected-Components (Union-Find) → Zellen-Blobs.
 *  3. Bewegung: Block-Matching der Zellen-Umgebung zwischen zwei Frames
 *     (minimale SAD über ein Suchfenster) → Verschiebung → km/h + Peilung.
 *  4. Trend: mittlere Intensität jetzt vs. an der Herkunftsposition im Vorframe.
 *  5. ETA-zu-Punkt: nächste Annäherung der mit konstanter Geschwindigkeit
 *     ziehenden Zelle an einen Standort (Trichter/§7 „erreicht dich in …").
 */

import type { QuadCorners } from '../scalar/RainLayer';
import { quadLerp, distKm, bearingDeg, compass8 } from './gridGeo';

const VMAX = 20; // u8/255·VMAX = mm/h (Konvention der Pipeline)

export interface GridFrame {
  values: Uint8Array; // u8, north-up
  width: number;
  height: number;
  /** Validitätszeit in ms (für die Geschwindigkeit aus zwei Frames). */
  timeMs: number;
}

export type CellTrend = 'intensifying' | 'steady' | 'weakening' | 'unknown';

export interface StormCell {
  id: number;
  lat: number;
  lon: number;
  meanMmH: number;
  peakMmH: number;
  areaKm2: number;
  /** effektiver Radius (km) aus der Fläche — für ETA-Trichter & „erreicht dich". */
  radiusKm: number;
  /** Zuggeschwindigkeit (km/h) und Richtung, in die sie zieht (° meteo). */
  speedKmh: number;
  bearingDeg: number;
  compass: string;
  trend: CellTrend;
  /** Prognostizierte Schwerpunkte in +15/+30/+60 min ([lon,lat]). */
  cone: Array<{ leadMin: number; lat: number; lon: number; radiusKm: number }>;
}

export interface CellAnalysisOptions {
  /** Gröbungsfaktor (Gitterzellen je Block). Default 12. */
  coarse?: number;
  /** Erkennungsschwelle in mm/h (Default 2 = „stark"). */
  thresholdMmH?: number;
  /** Mindestfläche einer Zelle in km² (Default 8). */
  minAreaKm2?: number;
  /** Suchradius für Block-Matching in coarse-Zellen (Default 6). */
  searchRadius?: number;
  /** Maximale Zellenzahl (stärkste zuerst). Default 12. */
  maxCells?: number;
}

export interface CellAnalysis {
  cells: StormCell[];
  coarse: number;
  cWidth: number;
  cHeight: number;
}

// ---------------------------------------------------------------------------

/** u8-Frame → coarse mm/h-Gitter (Block-Mittel). */
function coarsen(f: GridFrame, factor: number): { g: Float32Array; w: number; h: number } {
  const w = Math.max(1, Math.floor(f.width / factor));
  const h = Math.max(1, Math.floor(f.height / factor));
  const g = new Float32Array(w * h);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      let sum = 0, n = 0;
      const y0 = cy * factor, x0 = cx * factor;
      for (let dy = 0; dy < factor; dy++) {
        const yy = y0 + dy; if (yy >= f.height) break;
        const base = yy * f.width;
        for (let dx = 0; dx < factor; dx++) {
          const xx = x0 + dx; if (xx >= f.width) break;
          sum += f.values[base + xx]; n++;
        }
      }
      g[cy * w + cx] = n ? (sum / n) * (VMAX / 255) : 0; // mm/h
    }
  }
  return { g, w, h };
}

/** Connected-Components über der Schwelle (4-Nachbarschaft, Union-Find). */
function components(g: Float32Array, w: number, h: number, thr: number): number[][] {
  // parent[i] === -1 → keine Zelle (trocken); parent[i] === i → Wurzel.
  const parent = new Int32Array(w * h).fill(-1);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const wet = (i: number) => g[i] >= thr;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!wet(i)) continue;
      if (parent[i] < 0) parent[i] = i; // markiere als eigene Wurzel
      if (x + 1 < w && wet(i + 1)) { if (parent[i + 1] < 0) parent[i + 1] = i + 1; union(i, i + 1); }
      if (y + 1 < h && wet(i + w)) { if (parent[i + w] < 0) parent[i + w] = i + w; union(i, i + w); }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < g.length; i++) {
    if (parent[i] < 0) continue;
    const r = find(i);
    let arr = groups.get(r); if (!arr) { arr = []; groups.set(r, arr); }
    arr.push(i);
  }
  return [...groups.values()];
}

/** Block-Matching: Verschiebung (dx,dy) coarse, sodass prev(x-d) ≈ cur(x) im Fenster. */
function matchShift(
  prev: Float32Array, cur: Float32Array, w: number, h: number,
  cx: number, cy: number, half: number, search: number,
): { dx: number; dy: number } {
  let best = { dx: 0, dy: 0 };
  let bestErr = Infinity;
  for (let sy = -search; sy <= search; sy++) {
    for (let sx = -search; sx <= search; sx++) {
      let err = 0, n = 0;
      for (let yy = -half; yy <= half; yy++) {
        for (let xx = -half; xx <= half; xx++) {
          const cxX = cx + xx, cyY = cy + yy;
          const pxX = cxX - sx, pyY = cyY - sy;
          if (cxX < 0 || cxX >= w || cyY < 0 || cyY >= h) continue;
          if (pxX < 0 || pxX >= w || pyY < 0 || pyY >= h) continue;
          err += Math.abs(cur[cyY * w + cxX] - prev[pyY * w + pxX]); n++;
        }
      }
      if (n > 0) { err /= n; if (err < bestErr) { bestErr = err; best = { dx: sx, dy: sy }; } }
    }
  }
  return best;
}

/**
 * Erkennt und verfolgt Sturmzellen. `prev` ist optional — ohne ihn werden
 * Zellen ohne Bewegungsvektor (speed 0) zurückgegeben.
 */
export function detectAndTrackCells(
  prev: GridFrame | null,
  cur: GridFrame,
  corners: QuadCorners,
  opts: CellAnalysisOptions = {},
): CellAnalysis {
  const factor = opts.coarse ?? 12;
  const thr = opts.thresholdMmH ?? 2;
  const minArea = opts.minAreaKm2 ?? 8;
  const search = opts.searchRadius ?? 6;
  const maxCells = opts.maxCells ?? 12;

  const { g: cg, w, h } = coarsen(cur, factor);
  const pg = prev ? coarsen(prev, factor).g : null;
  const dtH = prev ? Math.max(1 / 60, (cur.timeMs - prev.timeMs) / 3_600_000) : 0;

  // Fläche einer coarse-Zelle (km²) ~ aus zwei benachbarten Geo-Punkten.
  const cellCenterGeo = (cx: number, cy: number): [number, number] =>
    quadLerp(corners, (cx + 0.5) / w, (cy + 0.5) / h);
  const km = distKm(cellCenterGeo(0, Math.floor(h / 2)), cellCenterGeo(1, Math.floor(h / 2)));
  const cellAreaKm2 = km * km;

  const comps = components(cg, w, h, thr);
  const raw: StormCell[] = [];
  let id = 1;
  for (const comp of comps) {
    const areaKm2 = comp.length * cellAreaKm2;
    if (areaKm2 < minArea) continue;
    // Schwerpunkt (intensitätsgewichtet) + Peak/Mean.
    let sw = 0, sx = 0, sy = 0, peak = 0, sum = 0;
    for (const i of comp) {
      const v = cg[i];
      const x = i % w, y = (i - x) / w;
      sx += x * v; sy += y * v; sw += v; sum += v;
      if (v > peak) peak = v;
    }
    const cx = sw ? sx / sw : 0;
    const cy = sw ? sy / sw : 0;
    const [lon, lat] = quadLerp(corners, (cx + 0.5) / w, (cy + 0.5) / h);
    const meanMmH = sum / comp.length;
    const radiusKm = Math.sqrt(areaKm2 / Math.PI);

    // Bewegung via Block-Matching der Zellen-Umgebung.
    let speedKmh = 0, bearing = 0, trend: CellTrend = 'unknown';
    if (pg && dtH > 0) {
      const half = Math.max(2, Math.round(radiusKm / km));
      const { dx, dy } = matchShift(pg, cg, w, h, Math.round(cx), Math.round(cy), half, search);
      const from = quadLerp(corners, (cx - dx + 0.5) / w, (cy - dy + 0.5) / h);
      const to: [number, number] = [lon, lat];
      const movedKm = distKm(from, to);
      speedKmh = movedKm / dtH;
      bearing = movedKm > 0.1 ? bearingDeg(from, to) : 0;
      // Trend: Intensität jetzt vs. an der Herkunftsposition im Vorframe.
      const px = Math.round(cx - dx), py = Math.round(cy - dy);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const prevV = pg[py * w + px];
        trend = peak > prevV * 1.2 ? 'intensifying' : peak < prevV * 0.8 ? 'weakening' : 'steady';
      }
    }

    // Prognose-Trichter: konstante Geschwindigkeit, wachsende Unsicherheit.
    const cone = [15, 30, 60].map((leadMin) => {
      const f = leadMin / 60;
      // Versatz entlang der Peilung in Grad umrechnen.
      const distF = speedKmh * f;
      const latRad = lat * (Math.PI / 180);
      const dLat = (distF * Math.cos((bearing * Math.PI) / 180)) / 110.57;
      const dLon = (distF * Math.sin((bearing * Math.PI) / 180)) / (111.32 * Math.cos(latRad) || 1e-6);
      return { leadMin, lat: lat + dLat, lon: lon + dLon, radiusKm: radiusKm + distF * 0.25 };
    });

    raw.push({ id: id++, lat, lon, meanMmH, peakMmH: peak, areaKm2, radiusKm, speedKmh, bearingDeg: bearing, compass: compass8(bearing), trend, cone });
  }

  raw.sort((a, b) => b.peakMmH - a.peakMmH || b.areaKm2 - a.areaKm2);
  return { cells: raw.slice(0, maxCells), coarse: factor, cWidth: w, cHeight: h };
}

/**
 * ETA bis eine Zelle einem Standort am nächsten kommt („erreicht dich in …").
 * Liefert Minuten bis zur nächsten Annäherung, wenn sie den Standort auf
 * `radiusKm + reachKm` heranzieht; sonst null (zieht vorbei / weg).
 */
export function etaToPoint(cell: StormCell, lat: number, lon: number, reachKm = 0): { etaMin: number; missKm: number } | null {
  if (cell.speedKmh < 1) return null;
  // Lokale km-Ebene um den Standort.
  const latRad = lat * (Math.PI / 180);
  const toKm = (dLon: number, dLat: number): [number, number] => [dLon * 111.32 * Math.cos(latRad), dLat * 110.57];
  const P = toKm(cell.lon - lon, cell.lat - lat); // Zellenposition relativ zum Punkt
  const v = (cell.speedKmh) * (1 / 60); // km/min
  const dir = (cell.bearingDeg * Math.PI) / 180;
  const V: [number, number] = [Math.sin(dir) * v, Math.cos(dir) * v]; // [Ost, Nord] km/min
  const vv = V[0] * V[0] + V[1] * V[1];
  if (vv <= 0) return null;
  // t* = -(P·V)/|V|²  (Punkt am nächsten)
  const tStar = -(P[0] * V[0] + P[1] * V[1]) / vv;
  if (tStar <= 0) return null; // entfernt sich bereits
  const closest: [number, number] = [P[0] + V[0] * tStar, P[1] + V[1] * tStar];
  const missKm = Math.hypot(closest[0], closest[1]);
  if (missKm > cell.radiusKm + reachKm) return null; // zieht vorbei
  return { etaMin: Math.round(tStar), missKm: Math.round(missKm * 10) / 10 };
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface CtCheck { name: string; ok: boolean; detail?: string }
export interface CtVerifyResult { checks: CtCheck[]; passed: number; failed: number }

/** Erzeugt einen Frame mit einem gaußschen Blob bei (bx,by) [Pixel]. */
function blobFrame(w: number, h: number, bx: number, by: number, peakMmH: number, sigma: number, timeMs: number): GridFrame {
  const values = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d2 = (x - bx) ** 2 + (y - by) ** 2;
      const mmH = peakMmH * Math.exp(-d2 / (2 * sigma * sigma));
      values[y * w + x] = Math.max(0, Math.min(255, Math.round((mmH / VMAX) * 255)));
    }
  }
  return { values, width: w, height: h, timeMs };
}

// Achsparalleles Test-Quad (1° ≈ 111 km), Norden oben.
const TEST_CORNERS: QuadCorners = [[10, 51], [11, 51], [11, 50], [10, 50]];

export function verifyCellTracking(): CtVerifyResult {
  const checks: CtCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const W = 240, H = 240;
  const t0 = 1_700_000_000_000;
  // Blob zieht in 5 min um +40 px nach Osten (Spalte wächst = Ost).
  const prev = blobFrame(W, H, 80, 120, 8, 14, t0);
  const cur = blobFrame(W, H, 120, 120, 8, 14, t0 + 5 * 60_000);

  const a = detectAndTrackCells(prev, cur, TEST_CORNERS, { coarse: 8, thresholdMmH: 2, minAreaKm2: 1, searchRadius: 8 });
  add('erkennt genau eine Zelle', a.cells.length === 1, `${a.cells.length}`);
  const c = a.cells[0];
  if (c) {
    // 40 px von 240 über 1°(=111km) Breite in 5 min → (40/240)*111 km / (5/60) h ≈ 222 km/h
    add('Geschwindigkeit > 100 km/h', c.speedKmh > 100, `${c.speedKmh?.toFixed(0)} km/h`);
    add('zieht nach Osten (O)', c.compass === 'O' || c.bearingDeg > 60 && c.bearingDeg < 120, `${c.bearingDeg.toFixed(0)}° ${c.compass}`);
    add('Peak ~8 mm/h', Math.abs(c.peakMmH - 8) < 2.5, `${c.peakMmH.toFixed(1)}`);
    add('Trichter hat 3 Stufen', c.cone.length === 3);
    add('Trichter wächst (Radius +)', c.cone[2].radiusKm > c.cone[0].radiusKm);
    // ETA: Punkt östlich im Pfad → muss getroffen werden.
    const ahead = quadLerp(TEST_CORNERS, 200 / W, 120 / H); // weit östlich auf gleicher Höhe
    const eta = etaToPoint(c, ahead[1], ahead[0], 0);
    add('ETA zu Punkt im Pfad vorhanden', eta != null && eta.etaMin > 0, eta ? `${eta.etaMin} min, miss ${eta.missKm} km` : 'null');
    // Punkt nördlich abseits → kein Treffer.
    const aside = quadLerp(TEST_CORNERS, 200 / W, 20 / H);
    add('kein ETA für Punkt abseits', etaToPoint(c, aside[1], aside[0], 0) == null);
  }

  // Trend: stärker werdender Blob.
  const prev2 = blobFrame(W, H, 120, 120, 4, 14, t0);
  const cur2 = blobFrame(W, H, 120, 120, 9, 14, t0 + 5 * 60_000);
  const a2 = detectAndTrackCells(prev2, cur2, TEST_CORNERS, { coarse: 8, thresholdMmH: 2, minAreaKm2: 1 });
  add('Trend intensifying erkannt', a2.cells[0]?.trend === 'intensifying', a2.cells[0]?.trend);

  // Leeres Feld → keine Zellen.
  add('leeres Feld → 0 Zellen', detectAndTrackCells(null, blobFrame(W, H, 0, 0, 0, 1, t0), TEST_CORNERS).cells.length === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyCellTracking: typeof verifyCellTracking }).__verifyCellTracking = verifyCellTracking;
}
