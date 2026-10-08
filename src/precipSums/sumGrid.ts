/**
 * Phase NS (`audit/niederschlagssummen.md` §9.4): die Summen-Karte auf dem DACH-Gitter der Niederschlagskarte
 * (`G` in `scalar/precipIndexMap.ts`, 600 × 512, ≈ 2 km, Zellmitten) und ihr Bild für MapLibre.
 *
 * Erwartet (voraus), je Zelle über (now, end]:
 *   1. 0 … Ende des Nowcasts: der Radar-Nowcast DES LANDES der Zelle (dieselbe Länderregel wie die Niederschlagskarte und
 *      die Punktvorhersage, `countryRowPicker`, V-FR-11) — DE RADOLAN-RV, AT INCA; CH (rzc) hat keinen Nowcast.
 *   2. danach das Kartenfeld von buscosun Fusion (kumulierte Erwartung, t1, dahinter t2).
 *   Trägt das Radar das ganze Fenster (1 h), steht der Nowcast allein. Ohne Radar (CH, außerhalb der Radarsicht) trägt
 *   das Feld ab „jetzt". Reicht beides nicht über das ganze Fenster, ist die Zelle eine Lücke (NaN) — nie eine
 *   Teilsumme in der Karte (E-NS-5).
 * Gefallen (zurück): die amtlichen, angeeichten Flächensummen aus `precipsum/v1` (Stufe B2/B3: DE RADOLAN RW, AT INCA-
 *   Analyse, CH CombiPrecip; `pastSumFormat.ts`), außerhalb DE · AT · CH keine Aussage; ohne das Produkt ist die Fläche
 *   eine benannte Lücke. Die Stationen zeichnet die Karte zusätzlich als Punkte.
 *
 * Bild: Zeilen gleichabständig in Web-Mercator (eine MapLibre-`image`-Source interpoliert linear in Mercator — ein in
 * Grad reguläres Bild läge bis 30 km zu weit nördlich, `audit/karten-layer-verortung.md` §14). Lücken grau schraffiert,
 * gesättigte Radarzellen („mindestens") gepunktet.
 *
 * Rein (kein DOM, kein Netz).
 */

import { G, gridLatLon } from '../scalar/precipIndexMap';
import { countryRowPicker } from '../pointForecast/countryOfPoint';
import { sumColor, SUM_ALPHA } from './sumModel';
import type { RadarWindowSum } from './radarWindowSum';
import { decodePastSumPixel, pastSumCellState } from './pastSumFormat';
import { cumPixelOf, cumSpan, prepareCumAt, cumAtPix, type CumTier, type CumPrep } from './fieldCum';

export const FLAG_SATURATED = 1;
export const FLAG_RADAR = 2;
export const FLAG_FIELD = 4;
/** Gefallen: amtliche, angeeichte Flächensumme (`pastSumFormat.ts`). */
export const FLAG_MEASURED = 8;
/** Gefallen: außerhalb DE · AT · CH — keine Aussage, transparent statt schraffiert. */
export const FLAG_OUTSIDE = 16;

export interface SumGeometry {
  width: number;
  height: number;
  lat: Float32Array;
  lon: Float32Array;
  /** 0 = DE, 1 = AT, 2 = CH je Zelle. */
  country: Uint8Array;
}

let geomMemo: SumGeometry | null = null;
export function sumGeometry(): SumGeometry {
  if (geomMemo) return geomMemo;
  const { lat, lon } = gridLatLon();
  const country = new Uint8Array(G.w * G.h);
  for (let r = 0; r < G.h; r++) {
    const pick = countryRowPicker(lat[r * G.w]);
    for (let c = 0; c < G.w; c++) {
      const cc = pick(lon[r * G.w + c]);
      country[r * G.w + c] = cc === 'AT' ? 1 : cc === 'CH' ? 2 : 0;
    }
  }
  geomMemo = { width: G.w, height: G.h, lat, lon, country };
  return geomMemo;
}

/** Ein Landes-Nowcast mit seiner Index-Map (Zelle → Quellgitter, −1 = außerhalb). */
export interface RadarPart { sum: RadarWindowSum; idx: Int32Array; label: string }

export interface FutureSumInput {
  geom: SumGeometry;
  nowMs: number;
  endMs: number;
  /** Je Land (0 DE, 1 AT, 2 CH) der Nowcast oder `null`. */
  radar: [RadarPart | null, RadarPart | null, RadarPart | null];
  /** Stufen mit kumulierter Erwartung, feinste zuerst (t1, t2). */
  cum: CumTier[];
}

export interface SumGridResult {
  width: number;
  height: number;
  /** mm je Zelle; NaN = Lücke. */
  mm: Float32Array;
  flags: Uint8Array;
  stats: { cells: number; valid: number; radar: number; field: number; saturated: number; gap: number };
}

/** Vorbereitete Zeitpunkte je Stufe (die Zellschleife liest nur noch Bytes). */
function prepCache(cum: readonly CumTier[]): (k: number, tMs: number) => CumPrep | null {
  const memo = cum.map(() => new Map<number, CumPrep | null>());
  return (k, tMs) => {
    const m = memo[k];
    if (!m.has(tMs)) m.set(tMs, prepareCumAt(cum[k], tMs));
    return m.get(tMs) ?? null;
  };
}

/** Feld-Anteil über (aMs, bMs] an einer Zelle über die Stufen hinweg (t1 zuerst, dann t2 ab dem Ende von t1). */
function fieldPart(cum: readonly CumTier[], prep: (k: number, tMs: number) => CumPrep | null, pixByTier: ReadonlyArray<number | null>, aMs: number, bMs: number): number | null {
  if (bMs <= aMs) return 0;
  let cur = aMs, mm = 0;
  for (let k = 0; k < cum.length && cur < bMs - 1000; k++) {
    const pix = pixByTier[k];
    const span = cumSpan(cum[k]);
    if (!span || pix == null) continue;
    if (span.fromMs > cur + 1000 || span.toMs <= cur) continue;
    const to = Math.min(bMs, span.toMs);
    const pa = prep(k, cur), pb = prep(k, to);
    if (!pa || !pb) return null;
    const ca = cumAtPix(pa, pix), cb = cumAtPix(pb, pix);
    if (ca == null || cb == null) return null;
    mm += Math.max(0, cb - ca);
    cur = to;
  }
  return cur >= bMs - 1000 ? mm : null;
}

/** Die erwartete Summe je Zelle (s. Kopf). */
export function composeFutureSum(inp: FutureSumInput): SumGridResult {
  const { geom, nowMs, endMs, radar, cum } = inp;
  const n = geom.width * geom.height;
  const mm = new Float32Array(n).fill(NaN);
  const flags = new Uint8Array(n);
  const stats = { cells: n, valid: 0, radar: 0, field: 0, saturated: 0, gap: 0 };
  const pixByTier: Array<number | null> = cum.map(() => null);
  const prep = prepCache(cum);
  for (let i = 0; i < n; i++) {
    const lat = geom.lat[i], lon = geom.lon[i];
    for (let k = 0; k < cum.length; k++) pixByTier[k] = cumPixelOf(cum[k].grid, lat, lon);
    const rp = radar[geom.country[i]];
    const ri = rp ? rp.idx[i] : -1;
    let radarMm: number | null = null, radarTo = nowMs, sat = 0;
    if (rp && ri >= 0) { radarMm = rp.sum.mm[ri]; radarTo = Math.min(endMs, rp.sum.coveredToMs); sat = rp.sum.sat[ri]; }
    let total: number | null = null, f = 0;
    if (radarMm != null && radarTo >= endMs - 1000) {
      // Das Radar trägt das ganze Fenster (1 h; AT auch länger).
      total = radarMm; f |= FLAG_RADAR;
    } else {
      const field = fieldPart(cum, prep, pixByTier, radarMm != null ? radarTo : nowMs, endMs);
      if (field != null) {
        total = field + (radarMm ?? 0);
        f |= FLAG_FIELD | (radarMm != null ? FLAG_RADAR : 0);
      }
    }
    if (total == null) { stats.gap++; continue; }
    if (f & FLAG_RADAR && sat > 0) f |= FLAG_SATURATED;
    mm[i] = total;
    flags[i] = f;
    stats.valid++;
    if (f & FLAG_RADAR) stats.radar++;
    if (f & FLAG_FIELD) stats.field++;
    if (f & FLAG_SATURATED) stats.saturated++;
  }
  return { width: geom.width, height: geom.height, mm, flags, stats };
}

/** Leere Fläche (Gefallen in Stufe A): alles Lücke. */
export function emptySumGrid(geom: SumGeometry): SumGridResult {
  const n = geom.width * geom.height;
  return { width: geom.width, height: geom.height, mm: new Float32Array(n).fill(NaN), flags: new Uint8Array(n), stats: { cells: n, valid: 0, radar: 0, field: 0, saturated: 0, gap: n } };
}

/**
 * Gefallen: Gitter aus einem Bild von `precipsum/v1` (RGBA auf G, Zeile 0 = Norden). Lücke = NaN (schraffiert), außerhalb
 * DACH = NaN mit `FLAG_OUTSIDE` (nicht gezeichnet). Nie wird eine Lücke zu 0 mm.
 */
export function pastSumGridFromRgba(geom: SumGeometry, rgba: ArrayLike<number>, width: number, height: number): SumGridResult {
  if (width !== geom.width || height !== geom.height) throw new Error(`precipsum: Bild ${width}×${height} statt ${geom.width}×${geom.height}`);
  const n = width * height;
  const mm = new Float32Array(n), flags = new Uint8Array(n);
  let valid = 0, gap = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const state = pastSumCellState(rgba[o + 3]);
    if (state === 'outside') { mm[i] = NaN; flags[i] = FLAG_OUTSIDE; continue; }
    const v = state === 'value' ? decodePastSumPixel(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]) : null;
    if (v == null) { mm[i] = NaN; gap++; continue; }
    mm[i] = v; flags[i] = FLAG_MEASURED; valid++;
  }
  return { width, height, mm, flags, stats: { cells: n, valid, radar: 0, field: 0, saturated: 0, gap } };
}

/** Wert an (lat, lon) für den Hover — Zelle des Gitters, `undefined` außerhalb. */
export function sumGridAt(g: SumGridResult, lat: number, lon: number): { mm: number | null; flags: number } | undefined {
  const c = Math.floor(((lon - G.lonMin) / (G.lonMax - G.lonMin)) * G.w);
  const r = Math.floor(((G.latMax - lat) / (G.latMax - G.latMin)) * G.h);
  if (c < 0 || r < 0 || c >= G.w || r >= G.h) return undefined;
  const v = g.mm[r * G.w + c];
  return { mm: Number.isNaN(v) ? null : v, flags: g.flags[r * G.w + c] };
}

// --- Bild ---------------------------------------------------------------------------------------

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export const SUM_IMAGE_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [G.lonMin, G.latMax], [G.lonMax, G.latMax], [G.lonMax, G.latMin], [G.lonMin, G.latMin],
];

/** Bildhöhe, bei der eine Bildzeile in Mercator so hoch ist wie eine Spalte breit. */
export function sumImageHeight(width = G.w): number {
  const dx = ((G.lonMax - G.lonMin) * Math.PI) / 180;
  return Math.round((width * (mercY(G.latMax) - mercY(G.latMin))) / dx);
}

/**
 * RGBA in Mercator-Zeilen: Summe in der Summen-Palette; Lücke grau schraffiert (Diagonale + leichter Schleier);
 * „mindestens" gepunktet; trocken (< 0,1 mm) durchsichtig.
 */
export function renderSumRgba(g: SumGridResult, width = G.w): { data: Uint8ClampedArray; width: number; height: number } {
  const height = sumImageHeight(width);
  const data = new Uint8ClampedArray(width * height * 4);
  const y0 = mercY(G.latMax), y1 = mercY(G.latMin);
  const a = Math.round(SUM_ALPHA * 255);
  for (let r = 0; r < height; r++) {
    const lat = latOfMercY(y0 + ((r + 0.5) / height) * (y1 - y0));
    const gr = Math.min(G.h - 1, Math.max(0, Math.floor(((G.latMax - lat) / (G.latMax - G.latMin)) * G.h)));
    for (let c = 0; c < width; c++) {
      const gc = Math.min(G.w - 1, Math.floor(((c + 0.5) / width) * G.w));
      const i = gr * G.w + gc, o = (r * width + c) * 4;
      const v = g.mm[i];
      if (g.flags[i] & FLAG_OUTSIDE) continue;
      if (Number.isNaN(v)) {
        const line = (c + r) % 7 === 0;
        data[o] = 120; data[o + 1] = 112; data[o + 2] = 98; data[o + 3] = line ? 120 : 26;
        continue;
      }
      const col = sumColor(v);
      if (!col) continue;
      let [R, Gc, B] = col;
      if ((g.flags[i] & FLAG_SATURATED) && c % 4 === 0 && r % 4 === 0) { R = 30; Gc = 22; B = 48; }
      data[o] = R; data[o + 1] = Gc; data[o + 2] = B; data[o + 3] = a;
    }
  }
  return { data, width, height };
}
