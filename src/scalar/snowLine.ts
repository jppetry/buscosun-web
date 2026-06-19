/**
 * Schneefallgrenze als Iso-Kontur (ML #2). Aus dem höhenkorrigierten ICON-D2-
 * Temperaturfeld wird pro Zelle `terrainTemp − T50` gebildet und die Null-Linie
 * (P(Schnee)=0,5-Übergang) per Marching-Squares extrahiert → GeoJSON-Linie für
 * einen nativen MapLibre-Line-Layer.
 *
 * T50 = physikalischer Anker (~+1 °C) + gelernte ML-#2-Orts-Korrektur
 * ({@link ClimaField.snowT50}). Die Kontur folgt dem Gelände (per-Pixel-DEM-Lapse
 * wie im Temp-Shader) → in Bergregionen die typische höhenabhängige Schneegrenze;
 * in milder Tieflandsluft existiert schlicht keine Null-Linie (alles Regen).
 *
 * Marching-Squares ist rein & headless prüfbar ({@link verifySnowLine}); der
 * DOM/Canvas-Teil ({@link buildSnowLine}) ist davon getrennt.
 */

import type { ClimaField } from '../ml/climaField';

// Muss zur Kodierung in iconD2TempSource passen (bewusst dupliziert statt
// importiert, damit dieses Modul ohne die GRIB/WASM-Pipeline bundlebar bleibt).
const TEMP_VMIN = -20;
const TEMP_VMAX = 40;
const DEM_MAX = 4500;
const LAPSE = 0.0065; // °C/m
// Konturauflösung. QA-Fix D3: 300 (~6 km) glättete winzige Hochgipfel-Kappen
// (z. B. Monte Rosa >4500 m) weg → keine Linie trotz Sub-0-°C-Gelände. 700
// (~2,5 km, real durch frame.width gekappt) löst die Kappen auf; die DEM-Höhe
// wird zusätzlich peak-erhaltend (Max über die Zell-Fläche) abgegriffen.
const OUT_WIDTH = 700;

export interface Seg { a: [number, number]; b: [number, number] }

/**
 * Marching-Squares: Iso-Linien-Segmente (in fraktionalen Gitterkoordinaten) für
 * den Schwellwert `iso`. Zellen mit nicht-endlichen Ecken werden übersprungen.
 */
export function marchingSquares(grid: Float32Array, w: number, h: number, iso: number): Seg[] {
  const segs: Seg[] = [];
  const at = (i: number, j: number) => grid[j * w + i];
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1);
      if (!(Number.isFinite(tl) && Number.isFinite(tr) && Number.isFinite(br) && Number.isFinite(bl))) continue;
      const aT = tl >= iso, aR = tr >= iso, aB = br >= iso, aL = bl >= iso;
      // Kantenkreuzungen (lineare Interpolation).
      const pts: Partial<Record<'T' | 'R' | 'B' | 'L', [number, number]>> = {};
      if (aT !== aR) pts.T = [i + (iso - tl) / (tr - tl), j];
      if (aR !== aB) pts.R = [i + 1, j + (iso - tr) / (br - tr)];
      if (aL !== aB) pts.B = [i + (iso - bl) / (br - bl), j + 1];
      if (aT !== aL) pts.L = [i, j + (iso - tl) / (bl - tl)];
      const keys = Object.keys(pts) as ('T' | 'R' | 'B' | 'L')[];
      if (keys.length === 2) {
        segs.push({ a: pts[keys[0]]!, b: pts[keys[1]]! });
      } else if (keys.length === 4) {
        // Sattelpunkt: Paarung über das Zellmittel auflösen.
        const avg = (tl + tr + br + bl) / 4;
        if (avg >= iso) { segs.push({ a: pts.T!, b: pts.R! }); segs.push({ a: pts.B!, b: pts.L! }); }
        else { segs.push({ a: pts.T!, b: pts.L! }); segs.push({ a: pts.B!, b: pts.R! }); }
      }
    }
  }
  return segs;
}

export interface TempFrameLite { image: HTMLCanvasElement | HTMLImageElement; width: number; height: number }

/** Modul-Cache des T50-Felds (nur Geometrie-abhängig, nicht zeit-/frame-abhängig). */
let t50Cache: { key: string; t50: Float32Array } | null = null;

/**
 * Baut die Schneefallgrenze als GeoJSON-FeatureCollection (eine MultiLineString-
 * Feature) über DENSELBEN uvBounds wie der Temperatur-Layer. `demImage` ist das
 * hochaufgelöste DEM (R = Höhe/DEM_MAX) aus `IconD2Temp.demImage`.
 */
export function buildSnowLine(
  frame: TempFrameLite,
  demImage: HTMLCanvasElement | HTMLImageElement,
  uvBounds: [number, number, number, number],
  clima: ClimaField,
): GeoJSON.FeatureCollection {
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  const read = (img: HTMLCanvasElement | HTMLImageElement, w: number, h: number): Uint8ClampedArray | null => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  };

  const td = read(frame.image, frame.width, frame.height);
  if (!td) return empty;
  const demW = ('width' in demImage ? (demImage as HTMLCanvasElement).width : frame.width) || frame.width;
  const demH = ('height' in demImage ? (demImage as HTMLCanvasElement).height : frame.height) || frame.height;
  const dd = read(demImage, demW, demH);
  if (!dd) return empty;

  const W = Math.min(OUT_WIDTH, frame.width);
  const H = Math.max(1, Math.round(W * frame.height / frame.width));
  const [x0, y0, x1, y1] = uvBounds;
  const span = TEMP_VMAX - TEMP_VMIN;

  // T50-Feld (Geometrie-gecacht).
  const key = `${W}x${H}|${uvBounds.map((v) => v.toFixed(4)).join(',')}|${clima.size}`;
  let t50 = t50Cache && t50Cache.key === key ? t50Cache.t50 : null;
  if (!t50) {
    t50 = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const lat = 90 - (y0 + j / (H - 1) * (y1 - y0)) * 180;
      for (let i = 0; i < W; i++) {
        const lon = (x0 + i / (W - 1) * (x1 - x0)) * 360 - 180;
        t50[j * W + i] = clima.snowT50(lat, lon);
      }
    }
    t50Cache = { key, t50 };
  }

  // Feld: terrainTemp − T50.
  const field = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const tv = j / (H - 1);
    const tj = Math.min(frame.height - 1, Math.round(tv * (frame.height - 1)));
    for (let i = 0; i < W; i++) {
      const o = j * W + i;
      const tu = i / (W - 1);
      const ti = Math.min(frame.width - 1, Math.round(tu * (frame.width - 1)));
      const k = (tj * frame.width + ti) * 4;
      if (td[k + 3] < 13) { field[o] = NaN; continue; }
      const tHsurf = TEMP_VMIN + (td[k] / 255) * span;
      const hsurf = (td[k + 1] / 255) * DEM_MAX;
      // Peak-erhaltende DEM-Höhe: Max über die DEM-Pixel, die diese (gröbere)
      // Kontur-Zelle abdeckt — sonst verfehlt das Nearest-Sampling scharfe Gipfel.
      // hsurf (Modell-Referenzhöhe) bleibt bewusst Nearest → korrekter Lapse-Term.
      const diC = tu * (demW - 1), djC = tv * (demH - 1);
      const halfI = Math.max(0.5, (demW - 1) / Math.max(1, W - 1) / 2);
      const halfJ = Math.max(0.5, (demH - 1) / Math.max(1, H - 1) / 2);
      const di0 = Math.max(0, Math.floor(diC - halfI)), di1 = Math.min(demW - 1, Math.ceil(diC + halfI));
      const dj0 = Math.max(0, Math.floor(djC - halfJ)), dj1 = Math.min(demH - 1, Math.ceil(djC + halfJ));
      let demByte = 0;
      for (let jj = dj0; jj <= dj1; jj++) for (let ii = di0; ii <= di1; ii++) {
        const b = dd[(jj * demW + ii) * 4]; if (b > demByte) demByte = b;
      }
      const demElev = (demByte / 255) * DEM_MAX;
      const terrainTemp = tHsurf + (hsurf - demElev) * LAPSE;
      field[o] = terrainTemp - t50[o];
    }
  }

  const segs = marchingSquares(field, W, H, 0);
  if (segs.length === 0) return empty;

  const toLngLat = (p: [number, number]): [number, number] => {
    const u = p[0] / (W - 1), v = p[1] / (H - 1);
    return [(x0 + u * (x1 - x0)) * 360 - 180, 90 - (y0 + v * (y1 - y0)) * 180];
  };
  const coordinates = segs.map((s) => [toLngLat(s.a), toLngLat(s.b)]);

  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } }],
  };
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface SlCheck { name: string; ok: boolean; detail?: string }
export interface SlVerifyResult { checks: SlCheck[]; passed: number; failed: number }

export function verifySnowLine(): SlVerifyResult {
  const checks: SlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Lineares Feld value(i,j) = i − 2 → Iso-0-Linie exakt bei i = 2 (vertikal).
  {
    const w = 6, h = 4;
    const g = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = i - 2;
    const segs = marchingSquares(g, w, h, 0);
    add('linear: Segmente erzeugt', segs.length === h - 1, `${segs.length}`);
    const allAtX2 = segs.every((s) => Math.abs(s.a[0] - 2) < 1e-9 && Math.abs(s.b[0] - 2) < 1e-9);
    add('linear: Kontur bei x = 2', allAtX2);
  }

  // Konstantes Feld ohne Kreuzung → keine Segmente.
  {
    const w = 5, h = 5;
    const g = new Float32Array(w * h).fill(3);
    add('konstant: keine Kontur', marchingSquares(g, w, h, 0).length === 0);
  }

  // Radialfeld (Senke) → geschlossene Kontur (≥ 4 Segmente).
  {
    const w = 9, h = 9, cx = 4, cy = 4;
    const g = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = Math.hypot(i - cx, j - cy) - 2.5;
    const segs = marchingSquares(g, w, h, 0);
    add('radial: geschlossene Kontur', segs.length >= 8, `${segs.length}`);
  }

  // NaN-Ecken → Zelle übersprungen.
  {
    const w = 3, h = 3;
    const g = new Float32Array([-1, 1, -1, 1, NaN, 1, -1, 1, -1]);
    const segs = marchingSquares(g, w, h, 0);
    add('NaN-Ecke: robust (kein Crash, endlich)', segs.every((s) => s.a.every(Number.isFinite) && s.b.every(Number.isFinite)));
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySnowLine: typeof verifySnowLine }).__verifySnowLine = verifySnowLine;
}
