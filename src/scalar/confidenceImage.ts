/**
 * Baut die Confidence-Textur für den {@link ConfidenceLayer} aus dem nativen
 * ICON-D2-Temperaturframe. Der Frame trägt pro Pixel R = norm. °C, G = norm.
 * hsurf-Höhe, A = Maske (siehe `iconD2TempSource`). Daraus wird je Zelle:
 *   value (°C) + Höhe → Klimatologie ({@link ClimaField}) → z-Score →
 *   {@link cellConfidence} (× leadWeight). Ergebnis: ein Canvas mit R =
 *   confidence·255, A = Maske, über DENSELBEN uvBounds wie der Temp-Layer.
 *
 * Bewusst gröber aufgelöst als der Temp-Frame (der Schleier ist interpretativ,
 * kein zellenscharfes Wahrheitsmaß) — hält die Neuberechnung pro Slider-Schritt
 * im Millisekundenbereich.
 */

import { TEMP_VMIN, TEMP_VMAX, type IconD2TempFrame } from '../sources/iconD2TempSource';
import type { ScalarMeta } from './ScalarLayer';
import type { ClimaField } from '../ml/climaField';
import { cellConfidence, type ClimaCell } from '../ml/confidenceField';
import { leadWeight } from '../ml/mosModel';

const DEM_MAX = 4500; // muss zur Kodierung in iconD2TempSource passen
const OUT_WIDTH = 220; // Zielbreite des Schleiers

// Stations-Deckung: bis COVER_FULL_KM volle Aussage, darüber blendet der
// Schleier weich aus (bei ~0,6°-Stationsraster ist die nächste Station in DACH
// meist < 40 km; außerhalb/an dünnen Rändern wächst die Distanz → Klimatologie
// extrapoliert → keine belastbare Referenz → Schleier ausfaden statt Artefakt).
const COVER_FULL_KM = 60;
const COVER_FADE_KM = 150;

/** Deckungsgewicht 0..1 aus der Distanz zur nächsten Station (smoothstep-Abfall). */
function coverageWeight(km: number): number {
  if (km <= COVER_FULL_KM) return 1;
  if (km >= COVER_FADE_KM) return 0;
  const t = (km - COVER_FULL_KM) / (COVER_FADE_KM - COVER_FULL_KM);
  return 1 - t * t * (3 - 2 * t);
}

/** Tag-des-Jahres (1..366) aus einem Datum (lokal). */
function doyOf(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export interface ConfidenceImageResult { image: HTMLCanvasElement; meta: ScalarMeta }

/**
 * Cache der klimatologischen Referenz pro Out-Zelle. Sie hängt nur von Geometrie
 * (uvBounds, Auflösung) + Tag-des-Jahres ab — NICHT vom Frame-Wert oder Vorlauf.
 * Beim Scrubben innerhalb eines Tages wird so nur noch die billige z→Confidence-
 * Rechnung neu ausgeführt (die teuren 3-NN-Stationssuchen entfallen).
 */
let climaCache: { key: string; cells: (ClimaCell | null)[]; amp: Float32Array; cover: Float32Array } | null = null;

function climaCells(
  ow: number, oh: number, uvBounds: [number, number, number, number], doy: number, clima: ClimaField,
  srcW: number, srcH: number, srcData: Uint8ClampedArray,
): { cells: (ClimaCell | null)[]; amp: Float32Array; cover: Float32Array } {
  const key = `${ow}x${oh}|${uvBounds.map((v) => v.toFixed(4)).join(',')}|${doy}|${clima.size}`;
  if (climaCache && climaCache.key === key) return climaCache;
  const [x0, y0, x1, y1] = uvBounds;
  const cells = new Array<ClimaCell | null>(ow * oh);
  const amp = new Float32Array(ow * oh);   // Tagesgang-Halbamplitude je Zelle
  const cover = new Float32Array(ow * oh);
  for (let j = 0; j < oh; j++) {
    const v = (j + 0.5) / oh;
    const sj = Math.min(srcH - 1, Math.floor(v * srcH));
    const lat = 90 - (y0 + v * (y1 - y0)) * 180;
    for (let i = 0; i < ow; i++) {
      const o = j * ow + i;
      const u = (i + 0.5) / ow;
      const si = Math.min(srcW - 1, Math.floor(u * srcW));
      const k = (sj * srcW + si) * 4;
      if (srcData[k + 3] < 13) { cells[o] = null; cover[o] = 0; continue; }
      const elevM = (srcData[k + 1] / 255) * DEM_MAX;
      const lon = (x0 + u * (x1 - x0)) * 360 - 180;
      const s = clima.sample(lat, lon, doy, elevM);
      cells[o] = { mean: s.tempMean, std: s.tempStd };
      amp[o] = s.diurnalAmp;
      cover[o] = coverageWeight(s.nearestKm);
    }
  }
  climaCache = { key, cells, amp, cover };
  return climaCache;
}

/** Tagesgang-Spitze (lokale Stunde) — tmax ~15 Uhr, tmin ~3 Uhr (Cosinus-Modell). */
const PEAK_HOUR = 15;
/** Skala (K) für die Lauf-zu-Lauf-Übereinstimmung: agree = exp(−spread/SCALE). */
const RUN_AGREE_SCALE = 3;

/** Optionales Lauf-zu-Lauf-Spread-Feld (zeitversetztes ICON-D2-Ensemble). */
export interface SpreadInput { image: HTMLCanvasElement | HTMLImageElement; width: number; height: number; spreadMax: number }

/**
 * @param leadDays Vorlauf in Tagen (Slider-Stunde / 24) — steuert den Zeit-Term.
 * @param spread Optionales Lauf-zu-Lauf-Spread-Feld: wo die ICON-D2-Läufe
 *   auseinanderlaufen, sinkt die Confidence zusätzlich (echte Vorhersage-Unsicherheit).
 */
export function buildConfidenceImage(
  frame: IconD2TempFrame,
  uvBounds: [number, number, number, number],
  leadDays: number,
  clima: ClimaField,
  spread?: SpreadInput,
): ConfidenceImageResult | null {
  const src = document.createElement('canvas');
  src.width = frame.width; src.height = frame.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(frame.image, 0, 0);
  const sd = sctx.getImageData(0, 0, frame.width, frame.height).data;

  // Spread-Feld (gleiche uvBounds, evtl. andere Auflösung) einlesen.
  let spd: Uint8ClampedArray | null = null;
  let spw = 0, sph = 0;
  if (spread) {
    const sc = document.createElement('canvas');
    sc.width = spread.width; sc.height = spread.height;
    const sctx2 = sc.getContext('2d', { willReadFrequently: true });
    if (sctx2) { sctx2.drawImage(spread.image, 0, 0); spd = sctx2.getImageData(0, 0, spread.width, spread.height).data; spw = spread.width; sph = spread.height; }
  }

  const ow = Math.min(OUT_WIDTH, frame.width);
  const oh = Math.max(1, Math.round(ow * frame.height / frame.width));
  const doy = doyOf(frame.validAt);
  const span = TEMP_VMAX - TEMP_VMIN;

  // Teurer Teil (Stations-Klimatologie + Tagesgang-Amplitude je Zelle) gecacht —
  // hängt nur von Geometrie + Tag-des-Jahres ab, NICHT von der Stunde.
  const { cells, amp, cover } = climaCells(ow, oh, uvBounds, doy, clima, frame.width, frame.height, sd);

  // Tagesgang-Term der Frame-Stunde: erwartete Temperatur = Tagesmittel +
  // amp·cos(2π(h−15)/24). Entfernt den Tag/Nacht-Bias (eine kalte Nacht ist
  // klimatologisch normal → kein Fehlalarm), sodass der z-Score echte Anomalie misst.
  const cosTerm = Math.cos((2 * Math.PI * (frame.validAt.getHours() - PEAK_HOUR)) / 24);

  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const octx = out.getContext('2d');
  if (!octx) return null;
  const img = octx.createImageData(ow, oh);

  for (let j = 0; j < oh; j++) {
    const sj = Math.min(frame.height - 1, Math.floor((j + 0.5) / oh * frame.height));
    for (let i = 0; i < ow; i++) {
      const o = j * ow + i;
      const idx = o * 4;
      const cell = cells[o];
      const si = Math.min(frame.width - 1, Math.floor((i + 0.5) / ow * frame.width));
      const k = (sj * frame.width + si) * 4;
      if (sd[k + 3] < 13 || !cell) { img.data[idx + 3] = 0; continue; }
      const celsius = TEMP_VMIN + (sd[k] / 255) * span;
      // Erwartete Stunden-Temperatur statt Tagesmittel.
      const expected = cell.mean + amp[o] * cosTerm;
      let conf = cellConfidence({ value: celsius, clima: { mean: expected, std: cell.std }, leadDays, kind: 'value' }).confidence;
      // Echtes Ensemble: Lauf-zu-Lauf-Übereinstimmung dämpft die Confidence dort,
      // wo aufeinanderfolgende ICON-D2-Läufe auseinanderlaufen (Vorhersage-Unsicherheit).
      if (spd) {
        const spi = Math.min(spw - 1, Math.floor((i + 0.5) / ow * spw));
        const spj = Math.min(sph - 1, Math.floor((j + 0.5) / oh * sph));
        const sp4 = (spj * spw + spi) * 4;
        if (spd[sp4 + 3] >= 13) {
          const spreadK = (spd[sp4] / 255) * spread!.spreadMax;
          conf *= Math.exp(-spreadK / RUN_AGREE_SCALE);
        }
      }
      img.data[idx] = Math.round(Math.max(0, Math.min(1, conf)) * 255);
      img.data[idx + 3] = Math.round(cover[o] * 255); // Stations-Deckung → weiches Ausfaden
    }
  }
  octx.putImageData(img, 0, 0);

  return { image: out, meta: { width: ow, height: oh, vMin: 0, vMax: 1, uvBounds } };
}

// ---------------------------------------------------------------------------
// Variante: Regenwahrscheinlichkeit (PoP) — wenn der Niederschlags-Layer aktiv ist
// ---------------------------------------------------------------------------

/** Geo-Ecken eines ICON-D2-Frames: [NW, NE, SE, SW] in [lon, lat]. */
export type QuadCornersLite = [[number, number], [number, number], [number, number], [number, number]];

/** Frame-Form, die der PoP-Builder braucht (entkoppelt von IconD2-Typen). */
export interface PrecipFrameLite { values: Uint8Array; width: number; height: number; validAt: Date }

/** Cache der klimatologischen Nassrate + Stations-Deckung je Out-Zelle. */
let wetCache: { key: string; wet: Float32Array; cover: Float32Array } | null = null;

/**
 * Confidence-Textur aus einem ICON-D2-**Niederschlags**-Frame. Der Schleier
 * zeigt hier die Sicherheit der REGENvorhersage:
 *   • Nass-Indikator je Zelle (Byte>0 ⇔ ≥0,06 mm/h), über den Quell-Block
 *     gemittelt → weiche Ränder (Niederschlagskanten ≈ 0,5 = displacement-
 *     unsicher);
 *   • MOS-Blend mit der Orts-Nassrate: `pop = leadWeight·nass + (1−leadWeight)·klima`
 *     (kurzer Vorlauf → Modell, langer → Klimatologie);
 *   • {@link cellConfidence} `kind:'prob'` → Entropie: solider Regenkern/klar
 *     trocken = sicher, Kanten & ferne Vorhersagen = unsicher.
 */
export function buildPrecipConfidenceImage(
  frame: PrecipFrameLite,
  corners: QuadCornersLite,
  leadDays: number,
  clima: ClimaField,
): ConfidenceImageResult | null {
  const { values: src, width: sw, height: sh } = frame;
  if (!sw || !sh || src.length < sw * sh) return null;

  const ow = Math.min(OUT_WIDTH, sw);
  const oh = Math.max(1, Math.round(ow * sh / sw));
  const doy = doyOf(frame.validAt);

  // uvBounds aus den Ecken (NW = [w,n], SE = [e,s]); Werte sind north-up.
  const [nw, , se] = corners;
  const w = nw[0], n = nw[1], e = se[0], s = se[1];
  const uvBounds: [number, number, number, number] = [
    (w + 180) / 360, (90 - n) / 180, (e + 180) / 360, (90 - s) / 180,
  ];
  const [x0, y0, x1, y1] = uvBounds;

  // Klimatologische Nassrate + Stations-Deckung je Out-Zelle (gecacht).
  const key = `${ow}x${oh}|${uvBounds.map((v) => v.toFixed(4)).join(',')}|${doy}|${clima.size}`;
  let cache = wetCache && wetCache.key === key ? wetCache : null;
  if (!cache) {
    const wet = new Float32Array(ow * oh);
    const cover = new Float32Array(ow * oh);
    for (let j = 0; j < oh; j++) {
      const lat = 90 - (y0 + (j + 0.5) / oh * (y1 - y0)) * 180;
      for (let i = 0; i < ow; i++) {
        const lon = (x0 + (i + 0.5) / ow * (x1 - x0)) * 360 - 180;
        const sample = clima.sample(lat, lon, doy);
        wet[j * ow + i] = sample.wetProb;
        cover[j * ow + i] = coverageWeight(sample.nearestKm);
      }
    }
    cache = wetCache = { key, wet, cover };
  }
  const { wet, cover } = cache;

  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const octx = out.getContext('2d');
  if (!octx) return null;
  const img = octx.createImageData(ow, oh);
  const lw = leadWeight(leadDays);

  for (let j = 0; j < oh; j++) {
    const sj0 = Math.floor(j / oh * sh), sj1 = Math.max(sj0 + 1, Math.floor((j + 1) / oh * sh));
    for (let i = 0; i < ow; i++) {
      const o = j * ow + i;
      // Quell-Block mitteln → Nass-Anteil 0..1 (weiche Niederschlagskanten).
      const si0 = Math.floor(i / ow * sw), si1 = Math.max(si0 + 1, Math.floor((i + 1) / ow * sw));
      let nWet = 0, nTot = 0;
      for (let sj = sj0; sj < sj1 && sj < sh; sj++) {
        const row = sj * sw;
        for (let si = si0; si < si1 && si < sw; si++) { nTot++; if (src[row + si] > 0) nWet++; }
      }
      const wetFrac = nTot ? nWet / nTot : 0;
      const pop = lw * wetFrac + (1 - lw) * wet[o];                 // MOS-Blend
      const conf = cellConfidence({ value: pop, clima: { mean: wet[o], std: 1 }, leadDays, kind: 'prob' }).confidence;
      const idx = o * 4;
      img.data[idx] = Math.round(Math.max(0, Math.min(1, conf)) * 255);
      img.data[idx + 3] = Math.round(cover[o] * 255); // Stations-Deckung → weiches Ausfaden
    }
  }
  octx.putImageData(img, 0, 0);

  return { image: out, meta: { width: ow, height: oh, vMin: 0, vMax: 1, uvBounds } };
}

/**
 * Confidence-Textur aus einer ECHTEN Ensemble-Regenwahrscheinlichkeit (Flow-
 * Ensemble, {@link advectEnsembleProb}): je Zelle Confidence = Übereinstimmung
 * der Member (1 − Entropie via {@link cellConfidence} `kind:'prob'`). prob ist
 * north-up über die Radar-Domäne (`corners`). Ersetzt im PoP-Modus die Entropie-
 * Heuristik auf einem Einzelfeld durch einen echten Verlagerungs-Ensemble-Spread.
 */
export function buildEnsembleConfidenceImage(
  prob: Float32Array, w: number, h: number, corners: QuadCornersLite, leadDays: number,
): ConfidenceImageResult | null {
  if (prob.length < w * h) return null;
  const [nw, , se] = corners;
  const uvBounds: [number, number, number, number] = [
    (nw[0] + 180) / 360, (90 - nw[1]) / 180, (se[0] + 180) / 360, (90 - se[1]) / 180,
  ];
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return null;
  const img = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const conf = cellConfidence({ value: prob[i], clima: { mean: 0, std: 1 }, leadDays, kind: 'prob' }).confidence;
    const idx = i * 4;
    img.data[idx] = Math.round(Math.max(0, Math.min(1, conf)) * 255);
    img.data[idx + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return { image: out, meta: { width: w, height: h, vMin: 0, vMax: 1, uvBounds } };
}

/**
 * Wahrscheinlichkeits-Raster für einen ScalarLayer: kalibrierte Regenwahrschein-
 * lichkeit (0..1) aus dem Flow-Ensemble ({@link advectEnsembleProb}) → R = prob·255,
 * A = 255. Die Farbrampe + visRange des Layers kodieren den Wahrscheinlichkeits-
 * grad und blenden sehr niedrige Werte aus. `corners` = Radar-Domäne, north-up.
 */
export function buildPopImage(
  prob: Float32Array, w: number, h: number, corners: QuadCornersLite,
): ConfidenceImageResult | null {
  if (prob.length < w * h) return null;
  const [nw, , se] = corners;
  const uvBounds: [number, number, number, number] = [
    (nw[0] + 180) / 360, (90 - nw[1]) / 180, (se[0] + 180) / 360, (90 - se[1]) / 180,
  ];
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return null;
  const img = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    img.data[idx] = Math.round(Math.max(0, Math.min(1, prob[i])) * 255);
    img.data[idx + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return { image: out, meta: { width: w, height: h, vMin: 0, vMax: 1, uvBounds } };
}
