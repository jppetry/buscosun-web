/**
 * Punkt-Sampler je Raster-Layer — schließt die Beobachtbarkeits-Lücke (QA P1-1).
 *
 * Liefert den Wert AUS DEM DEKODIERTEN GITTER (vor dem GPU-Upload), now-indexiert
 * über `frameAtValidTime` — also exakt die Daten/Mathematik, die Shader und
 * Stadt-Labels rendern (kein Colormap-Verlust). Dient (a) der punktgenauen
 * Hover-Info und (b) dem automatisierten Layer-QA-Check (`runLayerQA`).
 *
 * Abgedeckt: die äquirektangulären ICON-D2-Nativ-Layer Temp/Böen/Wind/Wolken.
 * NICHT abgedeckt (eigene Projektion/abgeleitet, separat zu behandeln): das
 * Radar-Komposit (DE RADOLAN polar-stereo / AT INCA / CH rzc), Flow-Nowcast und
 * PoP (DE-Radar, gröberes Gitter) sowie Konfidenz (rekonstruiert). Diese geben
 * `null` zurück und sind bewusst nicht gegen ein NWP-Modell prüfbar.
 */
import { TemperatureSampler } from '../temperatureLabels';
import { frameAtValidTime } from '../sources/frameAtValidTime';
import type { IconD2Temp } from '../sources/iconD2TempSource';
import type { IconD2Gust } from '../sources/iconD2GustSource';
import type { IconD2CloudStack } from '../sources/iconD2Clouds';
import { decodeImage, bilinear, sampleWindAt, type WindSample } from '../wind/windPointSample';

/** Temperatur (°C, DEM-höhenkorrigiert) am Punkt — identisch zu Shader/Labels. */
export function sampleTempAt(temp: IconD2Temp | null, targetMs: number, lon: number, lat: number): number | null {
  if (!temp || temp.frames.length === 0) return null;
  const f = frameAtValidTime(temp.frames, targetMs);
  return new TemperatureSampler({
    tempImage: f.image, tempUvBounds: temp.uvBounds, vMin: temp.vMin, vMax: temp.vMax,
    demImage: temp.demImage, demUvBounds: temp.uvBounds, demMax: 4500, lapseRatePerM: 0.0065,
  }).sample(lon, lat);
}

/** Böe (m/s) am Punkt — ScalarLayer-Decode ohne DEM. minStepHours=1 (P0-2). */
export function sampleGustAt(gust: IconD2Gust | null, targetMs: number, lon: number, lat: number): number | null {
  if (!gust || gust.frames.length === 0) return null;
  const f = frameAtValidTime(gust.frames, targetMs, 1);
  return new TemperatureSampler({
    tempImage: f.image, tempUvBounds: gust.uvBounds, vMin: gust.vMin, vMax: gust.vMax,
    demImage: null, demUvBounds: gust.uvBounds, demMax: 4500, lapseRatePerM: 0,
  }).sample(lon, lat);
}

// --- generischer Bilinear-Sampler: seit AF2 in src/wind/windPointSample.ts (V-AF-4) ---
// Gleiche Mathematik, gleiche Signaturen; hier nur noch importiert/re-exportiert, damit
// die Brandansicht den Windvektor abfragen kann, ohne dieses QA-Modul (temperatureLabels)
// in ihren Chunk zu ziehen.
export { sampleWindAt, type WindSample };

/** Gelände-Höhe (m) am Punkt aus dem DEM des Temp-Layers — für die
 *  Schneegrenzen-Verifikation (P2-3: Linien-Höhe vs. OM-Frostgrenze). */
export function sampleDemAt(temp: IconD2Temp | null, lon: number, lat: number): number | null {
  if (!temp || !temp.demImage) return null;
  const [x0, y0, x1, y1] = temp.uvBounds;
  const ux = (lon + 180) / 360, uy = (90 - lat) / 180;
  const tu = (ux - x0) / (x1 - x0), tv = (uy - y0) / (y1 - y0);
  if (tu < 0 || tu > 1 || tv < 0 || tv > 1) return null;
  return (bilinear(decodeImage(temp.demImage), tu, tv, 0) / 255) * 4500; // DEM_MAX
}

export interface CloudSample { low: number; mid: number; high: number; }
/** Bewölkung tief/mittel/hoch (%) am Punkt — voll aufgelöstes RGBA-Gitter. */
export function sampleCloudsAt(cl: IconD2CloudStack | null, targetMs: number, lon: number, lat: number): CloudSample | null {
  if (!cl || cl.frames.length === 0) return null;
  const f = frameAtValidTime(cl.frames, targetMs);
  const w = cl.corners[0][0], e = cl.corners[1][0], n = cl.corners[0][1], s = cl.corners[2][1];
  const fu = (lon - w) / (e - w), fv = (n - lat) / (n - s); // north-up
  if (fu < 0 || fu > 1 || fv < 0 || fv > 1) return null;
  // Außenkanten-Konvention wie der CloudLayer-Shader (KL3): die nächste Texel-
  // Mitte zu `fu` ist `floor(fu·n)`, nicht `round(fu·(n−1))`.
  const x = Math.min(f.width - 1, Math.max(0, Math.floor(fu * f.width)));
  const y = Math.min(f.height - 1, Math.max(0, Math.floor(fv * f.height)));
  const i = (y * f.width + x) * 4;
  return {
    low: Math.round((f.values[i] / 255) * 100),
    mid: Math.round((f.values[i + 1] / 255) * 100),
    high: Math.round((f.values[i + 2] / 255) * 100),
  };
}
