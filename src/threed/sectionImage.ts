/**
 * 3D-Wetter · Schnitt-Heatmaps als Canvas-Bild (geteilt).
 *
 * Rendert das Wind- bzw. Wolkenfeld eines `CrossSection` in ein kleines Canvas
 * (Spalten × `WIND_IMG_ROWS` Zeilen). Wird sowohl vom 2D-SVG-Schnitt
 * (`SectionChart`, bilinear hochskaliertes <image>) als auch vom 3D-Gelände-
 * Vorhang (`CurtainLayer`, als GL-Textur) genutzt — eine Quelle, kein Duplikat.
 *
 * Konvention: Zeile 0 (oben) = `topM`, Zeile H−1 (unten) = 0 m ü. NN.
 * Zellen unter Grund bleiben transparent (Alpha 0) → das Gelände bzw. der
 * Vorhang-Rand verdeckt sie ohnehin.
 */

import {
  CLOUD_LAYER_BANDS, windRampRGB, tempRampRGB,
  type CrossSection, type SectionCell, type ColumnProfile,
} from './crossSection';

/** Vertikale Supersampling-Auflösung der Heatmap-Bilder. */
export const WIND_IMG_ROWS = 132;

/**
 * Rendert das Windfeld in ein kleines Canvas (Spalten × Höhenlevel) und gibt es
 * als Data-URL zurück. Die SVG skaliert es bilinear hoch → glatter Verlauf, und
 * statt ~440 DOM-Elementen pro Zeitschritt nur ein <image> (Performance, US-N2).
 * Zellen unter Grund bleiben transparent (Gelände wird darüber gezeichnet).
 */
export function buildWindImage(section: CrossSection, useGust: boolean): string | null {
  const cv = buildWindCanvas(section, useGust);
  return cv ? cv.toDataURL() : null;
}

/** Wie `buildWindImage`, gibt aber das Canvas selbst zurück (für GL-Texturen). */
export function buildWindCanvas(section: CrossSection, useGust: boolean): HTMLCanvasElement | null {
  const cols = section.columns;
  const w = cols.length, h = WIND_IMG_ROWS;
  const topM = section.topM;
  if (w < 2 || topM <= 0 || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let c = 0; c < w; c++) {
    const col = cols[c];
    for (let r = 0; r < h; r++) {
      const levelM = topM * (1 - r / (h - 1)); // oberste Zeile = topM
      const v = windAtLevel(col, levelM, useGust); // null = unter Grund
      if (v == null) continue;
      const [R, G, B] = windRampRGB(v);
      const o = (r * w + c) * 4;
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Wolkenstockwerke als weiche weiße Schicht-Heatmap (US-C2). Pro Spalte/Höhe
 * Summe der drei Bedeckungsbänder (tief/mittel/hoch) mit weicher Federung an
 * Ober-/Unterkante → wolkenartig statt flacher Rechtecke, klar getrennt vom
 * Windfeld. Wie die Wind-Heatmap als skaliertes <image>.
 */
export function buildCloudImage(section: CrossSection): string | null {
  const cv = buildCloudCanvas(section);
  return cv ? cv.toDataURL() : null;
}

/** Wie `buildCloudImage`, gibt aber das Canvas selbst zurück (für GL-Texturen). */
export function buildCloudCanvas(section: CrossSection): HTMLCanvasElement | null {
  const cols = section.columns;
  const w = cols.length, h = WIND_IMG_ROWS;
  const topM = section.topM;
  if (w < 2 || topM <= 0 || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const bands: Array<[number, number, number | undefined]> = [];
  for (let c = 0; c < w; c++) {
    const col = cols[c];
    bands.length = 0;
    bands.push([CLOUD_LAYER_BANDS.low.minAgl, CLOUD_LAYER_BANDS.low.maxAgl, col.surface.cloudLowPct]);
    bands.push([CLOUD_LAYER_BANDS.mid.minAgl, CLOUD_LAYER_BANDS.mid.maxAgl, col.surface.cloudMidPct]);
    bands.push([CLOUD_LAYER_BANDS.high.minAgl, CLOUD_LAYER_BANDS.high.maxAgl, col.surface.cloudHighPct]);
    for (let r = 0; r < h; r++) {
      const levelM = topM * (1 - r / (h - 1));
      if (levelM < col.terrainM) continue;
      let a = 0;
      for (const [minAgl, maxAgl, cov] of bands) {
        if (!cov || cov < 18) continue;
        const bot = col.terrainM + minAgl, top = col.terrainM + maxAgl;
        if (levelM < bot || levelM > top) continue;
        const frac = (levelM - bot) / (top - bot);          // 0..1 innerhalb des Bandes
        const feather = Math.sin(Math.PI * Math.min(1, Math.max(0, frac))); // weich an den Kanten
        a = Math.max(a, (cov / 100) * feather);              // dichteste Schicht gewinnt
      }
      if (a <= 0.02) continue;
      const o = (r * w + c) * 4;
      img.data[o] = 253; img.data[o + 1] = 252; img.data[o + 2] = 248; // weiches Weiß
      img.data[o + 3] = Math.round(Math.min(0.9, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Temperaturschichten als Heatmap-Canvas (3D-Vorhang). Färbt jede Höhe nach der
 * abgeleiteten Temperatur (`tempRampRGB`) — inversionsbewusst, da die Zellen-
 * Temperatur bereits den Kaltluftsee berücksichtigt. Unter Grund transparent.
 */
export function buildTempCanvas(section: CrossSection): HTMLCanvasElement | null {
  const cols = section.columns;
  const w = cols.length, h = WIND_IMG_ROWS;
  const topM = section.topM;
  if (w < 2 || topM <= 0 || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let c = 0; c < w; c++) {
    const col = cols[c];
    for (let r = 0; r < h; r++) {
      const levelM = topM * (1 - r / (h - 1));
      const t = tempAtLevel(col, levelM);
      if (t == null) continue;
      const [R, G, B] = tempRampRGB(t);
      const o = (r * w + c) * 4;
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Annotierte Vorhang-Textur (3D-Gelände, lesbarer Schnitt): Heatmap glatt
 * hochskaliert + eingebackene Skala/Marken, damit man echte Werte ablesen kann:
 *  • Höhen-Gitter alle 1000 m + Höhen-Labels (linke Kante)
 *  • Wert-Isolinien (Wind alle 15 km/h bzw. Temperatur alle 5 °C) mit Wertlabel
 *  • Inversionslinie (gestrichelt, terracotta) + „Inversion ~X m"
 *  • Wolkenbasis-Linie (gestrichelt), wenn Bewölkung vorhanden
 * north-up wie die Heatmap; topM oben. Reine Canvas-2D-Zeichnung → kein WebGL-Text.
 */
export function buildAnnotatedCurtain(section: CrossSection, opts: { useGust: boolean; temp: boolean; clouds: boolean }): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const base = opts.temp ? buildTempCanvas(section) : buildWindCanvas(section, opts.useGust);
  if (!base) return null;
  const topM = section.topM;
  const cols = section.columns;
  const W = 640, H = 420;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  // Heatmap glatt hochskalieren (+ optionale Wolkenschicht darüber).
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, W, H);
  if (opts.clouds) { const cl = buildCloudCanvas(section); if (cl) ctx.drawImage(cl, 0, 0, W, H); }

  const yOf = (m: number) => (1 - m / topM) * H;
  const xOf = (c: number) => (c / (cols.length - 1)) * W;
  const labelHalo = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
    ctx.textAlign = align; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(28,26,22,0.55)'; ctx.lineWidth = 3; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  };

  // 1) Höhen-Gitter + Labels (alle 1000 m).
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  for (let m = 1000; m < topM; m += 1000) {
    const y = yOf(m);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    labelHalo(`${(m / 1000)} km`, 6, y - 3, 'rgba(255,255,255,0.95)');
  }

  // 2) Wert-Isolinien (Wind km/h bzw. Temperatur °C) — je Spalte unterste Kreuzung.
  const fieldAt = (col: ColumnProfile, m: number): number | null =>
    opts.temp ? tempAtLevel(col, m) : windAtLevel(col, m, opts.useGust);
  const thresholds = opts.temp ? [-10, -5, 0, 5, 10, 15, 20, 25, 30] : [15, 30, 45, 60, 80];
  ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const t of thresholds) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      let prev: { m: number; v: number } | null = null;
      let cross: number | null = null;
      for (let m = Math.ceil(col.terrainM / 100) * 100; m <= topM; m += 100) {
        const v = fieldAt(col, m);
        if (v == null) { prev = null; continue; }
        if (prev && ((prev.v - t) * (v - t) <= 0) && prev.v !== v) {
          const f = (t - prev.v) / (v - prev.v);
          cross = prev.m + f * (m - prev.m); break;
        }
        prev = { m, v };
      }
      if (cross != null) pts.push({ x: xOf(c), y: yOf(cross) });
    }
    if (pts.length < 2) continue;
    ctx.strokeStyle = 'rgba(28,26,22,0.42)'; ctx.lineWidth = 1.3; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // Wertlabel am rechten Ende der Linie.
    const end = pts[pts.length - 1];
    labelHalo(opts.temp ? `${t}°` : `${t}`, Math.min(W - 4, end.x + 4), end.y, 'rgba(255,255,255,0.96)');
  }

  // 3) Inversionslinie.
  const inv = section.inversion;
  if (inv.present && inv.heightM != null) {
    const y = yOf(inv.heightM);
    ctx.setLineDash([8, 5]); ctx.lineWidth = 2.4; ctx.strokeStyle = '#C97B47';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
    labelHalo(`Inversion ~${Math.round(inv.heightM)} m`, W - 8, y - 4, '#FBE4CF', 'right');
  }

  // 4) Wolkenbasis-Linie (mittlere Basis der Spalten mit Bewölkung).
  const bases = cols.map((c) => c.cloudBaseM).filter((b): b is number => b != null);
  if (bases.length >= cols.length * 0.3) {
    const avg = bases.reduce((s, b) => s + b, 0) / bases.length;
    const y = yOf(avg);
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'top';
    labelHalo('Wolkenbasis', 6, y + 3, 'rgba(255,255,255,0.95)');
  }

  return cv;
}

/** Temperatur einer Spalte auf beliebiger Höhe — linear zwischen den Zellen. */
export function tempAtLevel(col: ColumnProfile, levelM: number): number | null {
  if (levelM < col.terrainM) return null;
  const cells = col.cells;
  if (!cells.length) return null;
  if (levelM <= cells[0].levelM) return cells[0].tempC;
  const last = cells[cells.length - 1];
  if (levelM >= last.levelM) return last.tempC;
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i], b = cells[i + 1];
    if (levelM >= a.levelM && levelM <= b.levelM) {
      const t = (levelM - a.levelM) / (b.levelM - a.levelM);
      return a.tempC * (1 - t) + b.tempC * t;
    }
  }
  return last.tempC;
}

/** Wind (oder Böe) einer Spalte auf beliebiger Höhe — linear zwischen den Zellen. */
export function windAtLevel(col: ColumnProfile, levelM: number, useGust: boolean): number | null {
  if (levelM < col.terrainM) return null;
  const cells = col.cells;
  if (!cells.length) return null;
  const val = (cell: SectionCell) => (useGust ? cell.gustKmh : cell.windKmh);
  if (levelM <= cells[0].levelM) return val(cells[0]);
  const last = cells[cells.length - 1];
  if (levelM >= last.levelM) return val(last);
  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i], b = cells[i + 1];
    if (levelM >= a.levelM && levelM <= b.levelM) {
      const t = (levelM - a.levelM) / (b.levelM - a.levelM);
      return val(a) * (1 - t) + val(b) * t;
    }
  }
  return val(last);
}
