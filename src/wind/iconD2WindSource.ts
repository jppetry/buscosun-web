/**
 * DWD ICON-D2 — 10-m-Wind (u_10m / v_10m) als natives 2,2-km-Gitter für den
 * Wind-Partikel-Layer der Kartenansicht.
 *
 * Ersetzt die bisherige Open-Meteo-Punktgrid-Quelle (20×16, ratenlimitiert,
 * nicht-kommerziell) durch das native DWD-ICON-D2-Gitter (reguläres lat-lon
 * 0,02°, ~2,2 km, DE + Umfeld) direkt aus den GRIB2-Rohdaten — dieselbe
 * Pipeline wie Niederschlag/Bewölkung (`iconD2Precip`/`iconD2Clouds`):
 * resolveLatestRun → fetchStepField (bz2 im Worker) → decodeGrib2.
 *
 * Wind braucht ZWEI Parameter (u + v) → wir kombinieren sie pro Schritt zu
 * einem RG-Canvas (R = u, G = v, north-up), den der WindLayer direkt als
 * Textur nutzt. Pro Frame eigene u/v-Normierung (wie die bisherige Quelle).
 * CC BY 4.0, kein API-Key.
 */

import { resolveLatestRun, fetchStepField, gribCorners, type GribField } from '../sources/iconD2Precip';

export const ICON_D2_WIND_ATTRIBUTION =
  'Wind: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> · CC BY 4.0';

/** Horizont-Cap (h). Wind = primär „aktuell"; naher Bereich reicht (Slider clamp).
 *  u+v verdoppeln die Fetch-Last ggü. Precip → bewusst kürzerer Horizont. */
const MAX_STEP = 12;
/** Ziel-Breite nach Subsampling (das 1215er-Nativgitter ist für Partikel-Viz Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;

export interface IconD2WindFrame {
  validAt: Date;
  stepHours: number;
  /** RG-Canvas (R = u, G = v, north-up) als Textur-Quelle. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

export interface IconD2Wind {
  runAt: Date;
  frames: IconD2WindFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

/** Kombiniert ein u- und v-Feld zu einem subsampelten, north-up RG-Canvas + Normierung.
 *  Modell-unabhängig (ICON-D2-Surface wie ICON-EU-Druckfläche) → exportiert. */
export function buildWindFrame(u: GribField, v: GribField): Omit<IconD2WindFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = u;
  const ss = Math.max(1, Math.ceil(ni / TARGET_WIDTH));
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);

  const us = new Float32Array(w * h);
  const vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      let uVal = u.values[k]; let vVal = v.values[k];
      if (!Number.isFinite(uVal)) uVal = 0;     // außerhalb der Domain → Windstille
      if (!Number.isFinite(vVal)) vVal = 0;
      const o = jj * w + ii;
      us[o] = uVal; vs[o] = vVal;
      if (uVal < uMin) uMin = uVal; if (uVal > uMax) uMax = uVal;
      if (vVal < vMin) vMin = vVal; if (vVal > vMax) vMax = vVal;
    }
  }
  // Mindest-Spanne gegen Division durch 0 im Shader.
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let jj = 0; jj < h; jj++) {
    const y = h - 1 - jj;                        // Quelle: jj=0 = Süden → north-up flippen
    for (let ii = 0; ii < w; ii++) {
      const o = jj * w + ii;
      const idx = (y * w + ii) * 4;
      img.data[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
      img.data[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
      img.data[idx + 2] = 0;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h, uMin, uMax, vMin, vMax };
}

/**
 * Lädt das native ICON-D2-10-m-Windgitter (u+v) des jüngsten Laufs für 0–MAX_STEP h.
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Wind(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Wind) => void,
): Promise<IconD2Wind> {
  const { runStr, runAt, steps } = await resolveLatestRun('u_10m', signal);
  const wanted = steps.filter((s) => s <= MAX_STEP);

  const frames: IconD2WindFrame[] = [];
  let uvBounds: [number, number, number, number] | null = null;

  const loadStep = async (step: number): Promise<void> => {
    try {
      const [u, v] = await Promise.all([
        fetchStepField(runStr, 'u_10m', step, signal),
        fetchStepField(runStr, 'v_10m', step, signal),
      ]);
      if (!uvBounds) {
        const c = gribCorners(u);               // [NW, NE, SE, SW] in [lon,lat]
        uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
      }
      const built = buildWindFrame(u, v);
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress && uvBounds) onProgress({ runAt, frames: [...frames], uvBounds });
    } catch {
      // Einzelner Schritt fehlt (z. B. v noch nicht publiziert) → überspringen.
    }
  };

  // Bounded-Concurrency-Pump über die Schritte.
  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      const step = wanted[ptr++];
      await loadStep(step);
    }
  });
  await Promise.all(workers);

  if (!uvBounds || frames.length === 0) throw new Error('ICON-D2 Wind: keine Frames erzeugt');
  return { runAt, frames, uvBounds };
}

/** Nächster Frame zur Vorlauf-Stunde (clamp). */
export function windFrameAtHour(wind: IconD2Wind, hour: number): IconD2WindFrame {
  let best = wind.frames[0], bd = Infinity;
  for (const f of wind.frames) { const d = Math.abs(f.stepHours - hour); if (d < bd) { bd = d; best = f; } }
  return best;
}

// ---------------------------------------------------------------------------
// Zeit-Interpolation zwischen Stunden-Frames (wie Windy: „smooth scrubbing").
// Die u/v-Normierung unterscheidet sich PRO Frame → ein naives Byte-Lerp der
// RG-Canvas wäre falsch. Korrekt: beide Frames in echte m/s dekodieren, die
// Geschwindigkeiten lerpen, neu normieren+kodieren. Ergebnis-Frame wird gecacht
// (gleiche Slider-Position → kein Neuaufbau).
// ---------------------------------------------------------------------------

let _blendCache: { key: string; frame: IconD2WindFrame } | null = null;

function blendWindFrames(a: IconD2WindFrame, b: IconD2WindFrame, t: number): IconD2WindFrame {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = a.image.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const db = b.image.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  const aUs = a.uMax - a.uMin, aVs = a.vMax - a.vMin, bUs = b.uMax - b.uMin, bVs = b.vMax - b.vMin;
  const us = new Float32Array(w * h), vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    for (let ii = 0; ii < w; ii++) {
      const ia = (jj * a.width + ii) * 4, ib = (jj * b.width + ii) * 4;
      const uA = a.uMin + (da[ia] / 255) * aUs, vA = a.vMin + (da[ia + 1] / 255) * aVs;
      const uB = b.uMin + (db[ib] / 255) * bUs, vB = b.vMin + (db[ib + 1] / 255) * bVs;
      const u = uA + (uB - uA) * t, v = vA + (vB - vA) * t;
      const o = jj * w + ii;
      us[o] = u; vs[o] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
  }
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let o = 0; o < w * h; o++) {
    const idx = o * 4;
    img.data[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
    img.data[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
    img.data[idx + 2] = 0;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const validAt = new Date(a.validAt.getTime() + (b.validAt.getTime() - a.validAt.getTime()) * t);
  return { validAt, stepHours: a.stepHours + (b.stepHours - a.stepHours) * t, image: canvas, width: w, height: h, uMin, uMax, vMin, vMax };
}

/**
 * Geschwindigkeitsraum-interpolierter Frame zur (gebrochenen) Vorlaufstunde —
 * smooth Scrubbing wie Windy, konsistent mit Niederschlag/Temperatur. Auf einer
 * exakten Stunde (oder am Rand) wird der Originalframe ohne Neuaufbau geliefert.
 */
export function windFrameInterpolated(wind: IconD2Wind, hour: number): IconD2WindFrame {
  const frames = wind.frames;
  if (frames.length < 2) return frames[0];
  const minH = frames[0].stepHours, maxH = frames[frames.length - 1].stepHours;
  const hr = Math.max(minH, Math.min(maxH, hour));
  let a = frames[0], b = frames[frames.length - 1];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].stepHours <= hr) a = frames[i];
    if (frames[i].stepHours >= hr) { b = frames[i]; break; }
  }
  const span = b.stepHours - a.stepHours;
  const frac = span > 0 ? (hr - a.stepHours) / span : 0;
  if (frac < 0.02) return a;
  if (frac > 0.98) return b;
  const key = `${a.stepHours}|${b.stepHours}|${frac.toFixed(2)}`;
  if (_blendCache?.key === key) return _blendCache.frame;
  const frame = blendWindFrames(a, b, frac);
  _blendCache = { key, frame };
  return frame;
}

/**
 * Wie `windFrameInterpolated`, aber NACH GÜLTIGKEITSZEIT (now-indexiert) statt
 * nach Vorlauf-Schritt — behebt den Valid-Time-Versatz (QA-Befund D1). Die
 * Zielzeit (Date.now() + Slider-Stunde·3600s) wird relativ zum Lauf in eine
 * gebrochene Vorlaufstunde umgerechnet; die Geschwindigkeitsraum-Interpolation
 * (smooth Scrubbing) bleibt unverändert.
 */
export function windFrameAtValidTime(wind: IconD2Wind, targetMs: number): IconD2WindFrame {
  const hour = (targetMs - wind.runAt.getTime()) / 3600_000;
  return windFrameInterpolated(wind, hour);
}

// ---------------------------------------------------------------------------
// Sofort-Erstpaint-Cache: den „jetzt"-Frame (Schritt 0) des letzten Laufs in
// localStorage ablegen, damit der Wind-Layer beim nächsten Seitenaufruf SOFORT
// rendert (statt ~2 s auf den Netz-Fetch zu warten). Wird vom frischen nativen
// Gitter ersetzt, sobald es geladen ist. Das Gitter ist standort-unabhängig
// (immer dieselbe ICON-D2-DACH-Domäne), darum ein einziger globaler Key.
// ---------------------------------------------------------------------------

const WIND_CACHE_KEY = 'bc_wind_now_v2';
/** Cache ignorieren, wenn älter (paar h alter Wind als 2-s-Platzhalter ist ok). */
const WIND_CACHE_MAX_AGE_MS = 24 * 3_600_000;

export interface CachedWindNow {
  image: HTMLImageElement;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  uvBounds: [number, number, number, number];
}

/** Den „jetzt"-Frame als PNG-DataURL + Normierung/Bounds persistieren. */
export function saveWindNowCache(frame: IconD2WindFrame, uvBounds: [number, number, number, number]): void {
  try {
    const payload = {
      dataUrl: frame.image.toDataURL('image/png'),
      width: frame.width, height: frame.height,
      uMin: frame.uMin, uMax: frame.uMax, vMin: frame.vMin, vMax: frame.vMax,
      uvBounds, savedMs: Date.now(),
    };
    localStorage.setItem(WIND_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage voll/nicht verfügbar (Private Mode) → still ignorieren.
  }
}

/** Gecachten „jetzt"-Frame laden (Image aus DataURL dekodiert, kein Netz). */
export async function loadWindNowCache(): Promise<CachedWindNow | null> {
  try {
    const raw = localStorage.getItem(WIND_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.dataUrl || Date.now() - (p.savedMs ?? 0) > WIND_CACHE_MAX_AGE_MS) return null;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('wind cache decode failed'));
      img.src = p.dataUrl;
    });
    return {
      image, width: p.width, height: p.height,
      uMin: p.uMin, uMax: p.uMax, vMin: p.vMin, vMax: p.vMax, uvBounds: p.uvBounds,
    };
  } catch {
    return null;
  }
}
