/**
 * DWD ICON-D2 — 2-m-Temperatur (`t_2m`) als natives 2,2-km-Gitter für den
 * Temperatur-Heatmap-Layer der Kartenansicht.
 *
 * Ersetzt die bisherige Fusion-Temperatur (Open-Meteo/IDW) durch das native
 * DWD-ICON-D2-Gitter (reguläres lat-lon 0,02°, DE + Umfeld) direkt aus den
 * GRIB2-Rohdaten — dieselbe Pipeline wie Wind/Wolken/Niederschlag.
 *
 * Höhenkorrektur (wie der Fusion-Layer): der `ScalarLayer` macht ein per-Pixel-
 * Lapse-Refinement. Dazu trägt der GRÜN-Kanal des Werte-Bilds die Referenzhöhe
 * (ICONs Modell-Orographie `hsurf`, normiert auf DEM_MAX) und ein hochaufgelöstes
 * DEM-Bild (Terrarium, über DENSELBEN Bounds) liefert die echte Terrainhöhe pro
 * Pixel. t_2m gilt physikalisch auf `hsurf` → der Shader rechnet von dort mit
 * dem Lapse-Rate auf das tatsächliche Terrain (Täler wärmer, Gipfel kälter).
 * CC BY 4.0, kein API-Key.
 */

import {
  resolveLatestRun, fetchStepField, fetchInvariantField, subsampledCorners,
  D2_GRIB_PROXY_BASE,
  type GribField,
} from './iconD2Precip';
import { loadElevationLookup } from '../fusion/elevation';
import { stepsForNowWindow } from './frameAtValidTime';
import { buildTempRgba, TEMP_DEM_MAX, TEMP_VMIN, TEMP_VMAX } from './tempFrameBuild';
import {
  resolveRepackForRun, loadHsurfGrey, loadTempStep, uvBoundsOf, repackUsable,
  type RepackSection,
} from './repackSource';
import type { ForecastBounds } from './openMeteoForecast';

// Die Normierung lebt in `tempFrameBuild.ts` (DOM-frei, von Client UND
// Repack-Producer importiert). Hier nur weitergereicht, damit die bisherigen
// Importeure (`scalar/confidenceImage.ts`) unverändert bleiben.
export { TEMP_VMIN, TEMP_VMAX } from './tempFrameBuild';

export const ICON_D2_TEMP_ATTRIBUTION =
  'Temperatur: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> · CC BY 4.0';

/** Horizont-Cap (h) — deckt den Slider ab. */
const MAX_STEP = 24;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für eine Heatmap Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;
/** Max-Höhe (m), die als 1.0 in Grün-Kanal & DEM kodiert wird (= ScalarLayer demMax).
 *  EINE Quelle mit dem Werte-Bild — das DEM und der Grün-Kanal müssen dieselbe
 *  Skala benutzen, sonst rechnet der Shader die Höhendifferenz falsch. */
const DEM_MAX = TEMP_DEM_MAX;
/** Terrarium-Zoom der DEM-Quelle (QA-Knopf D2). z7 ≈ 1,2 km — gute Balance
 *  (~50 Tiles über die ICON-Domäne, einmalig pro Bounds gecacht). z8 (~0,6 km)
 *  löst scharfe 3000er (Sonnblick/Zugspitze) besser auf, kostet aber ~4× Tiles/
 *  Bandbreite beim Erststart → bewusst nicht Default. */
const DEM_ZOOM = 7;

export interface IconD2TempFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = norm. Temp, G = norm. hsurf-Referenzhöhe, A = Maske. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Temp {
  runAt: Date;
  frames: IconD2TempFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
  vMin: number;
  vMax: number;
  /** Hochaufgelöstes DEM-Bild (R = Höhe/DEM_MAX) über DENSELBEN uvBounds. */
  demImage: HTMLCanvasElement;
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Modul-Cache: DEM (Terrain) ist statisch → pro Bounds nur einmal bauen. */
const demCache = new Map<string, HTMLCanvasElement>();

/**
 * Baut ein hochaufgelöstes DEM-Bild (Terrarium) über die ICON-Bounds, north-up,
 * R = Höhe/DEM_MAX. Sampling-Raster proportional zum Bounds-Seitenverhältnis.
 */
async function buildDemImage(bounds: ForecastBounds, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const key = `${bounds.lngMin.toFixed(2)},${bounds.latMin.toFixed(2)},${bounds.lngMax.toFixed(2)},${bounds.latMax.toFixed(2)}`;
  const cached = demCache.get(key);
  if (cached) return cached;

  // QA-Fix D2/D3: Bei z5 (~5 km) + Bilinear wurden Extremgipfel (Zugspitze,
  // Monte Rosa) stark geglättet → DEM-Höhe zu niedrig → Lapse-Korrektur zu
  // schwach → Gipfel zu warm bzw. Schneegrenze verfehlt. Feinere Quelle (z7
  // ≈ 1,2 km) + peak-erhaltende MAX-Aggregation über ein 3×3-Subraster je Zelle
  // heben die Gipfelhöhe an. DEM ist statisch + pro Bounds gecacht → Einmalkosten.
  const lookup = await loadElevationLookup(bounds, DEM_ZOOM, signal);
  const rows = 700;
  const lonSpan = bounds.lngMax - bounds.lngMin;
  const latSpan = Math.max(0.01, bounds.latMax - bounds.latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  // Zellmitten, NICHT Randpunkte (KL6): der ScalarLayer liest das DEM mit derselben
  // `uv` wie die Werte-Textur, und `texture2D` legt die Texelmitten auf (i+0,5)/n.
  // Mit `span/(n−1)` und Start auf `latMin` lag das DEM eine halbe DEM-Zelle
  // (1,2 km) neben seiner Zeichenfläche — die Höhenkorrektur je Pixel rechnete
  // damit mit Gelände aus der Nachbarschaft (audit/karten-layer-verortung.md, B6).
  const dLat = latSpan / rows, dLng = lonSpan / cols;
  const grid = new Float32Array(cols * rows); // j=0 = Süden (latMin)
  // Max über ein 3×3-Subraster INNERHALB der Zelle (±0,3 Zellbreite). Bewusst
  // kein Übergriff in Nachbarzellen (vorher ±0,4) — das hob Gipfel an, verzerrte
  // aber rolliges Flachland nach oben (QA-Fix D3-Refinement). So bleibt die
  // Gipfelhöhe erhalten, ohne entfernte Hügel einzufangen.
  const subs = [-0.3, 0, 0.3];
  for (let j = 0; j < rows; j++) {
    const lat0 = bounds.latMin + (j + 0.5) * dLat;
    for (let i = 0; i < cols; i++) {
      const lng0 = bounds.lngMin + (i + 0.5) * dLng;
      let peak = -Infinity;
      for (const sj of subs) for (const si of subs) {
        const e = lookup.sample(lng0 + si * dLng, lat0 + sj * dLat);
        if (Number.isFinite(e) && e > peak) peak = e;
      }
      grid[j * cols + i] = peak > -Infinity ? peak : NaN;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cols, rows);
  for (let j = 0; j < rows; j++) {
    const y = rows - 1 - j; // Süd→Nord flippen → Canvas-Zeile 0 = Norden
    for (let i = 0; i < cols; i++) {
      const e = grid[j * cols + i];
      const idx = (y * cols + i) * 4;
      img.data[idx] = Math.round(clamp01(e / DEM_MAX) * 255);
      img.data[idx + 1] = 0;
      img.data[idx + 2] = 0;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  demCache.set(key, canvas);
  return canvas;
}

/** RGBA-Bytes → Canvas. Der einzige DOM-Schritt, den beide Wege teilen: der
 *  GRIB-Weg rechnet die Bytes (`buildTempRgba`), der CDN-Weg lädt sie fertig. */
function rgbaToCanvas(rgba: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

/** Baut das RGBA-Werte-Bild eines Schritts: R = norm. °C, G = norm. hsurf, A = Maske.
 *  Die Rechnung selbst steht DOM-frei in `tempFrameBuild.ts` (geteilt mit dem
 *  Repack-Producer); hier bleibt nur der Canvas-Transport. */
function buildTempImage(t2m: GribField, hsurf: GribField | null, ss: number): Omit<IconD2TempFrame, 'validAt' | 'stepHours'> {
  const { rgba, width, height } = buildTempRgba(t2m, hsurf, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-2-m-Temperaturgitter (+ hsurf + DEM) des jüngsten Laufs.
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Temp(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Temp) => void,
  /** `nowOnly` (Testmodus „startnow", MapView): lädt NUR das Fenster von „jetzt"
   *  bis „jetzt + aheadHours" (`stepsForNowWindow`); 0 = Jetzt-Bracket. DEM/hsurf
   *  (invariant, fürs Rendering nötig) laden unverändert. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Temp> {
  const { runStr, runAt, steps } = await resolveLatestRun('t_2m', signal);
  const capped = steps.filter((s) => s <= MAX_STEP);
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;

  // BW-3: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft wird
  // gegen `runStr`, also gegen den Lauf, den die Auflösung wirklich geliefert
  // hat — der Directory-Scan kann am Manifest vorbeigehen (§22.4).
  let section: RepackSection | null = await resolveRepackForRun(runStr, 'temp');
  // Orographie: EINE Datei je Commit statt 647 KB GRIB je Lauf. Scheitert sie,
  // ist der ganze Weg als kaputt vermerkt → sauber auf GRIB zurückfallen,
  // statt 25 Schritte ohne Höhenkorrektur zu zeichnen.
  const hsurfGrey = section ? await loadHsurfGrey(section, signal) : null;
  if (section && !repackUsable()) section = null;

  // hsurf als GRIB-Feld: im Repack-Pfad gar nicht, sonst einmalig — und dort
  // erst, wenn ein Schritt den Fallback wirklich braucht. Phase T2-2: wie die
  // Schritt-Felder über den durable-gecachten Edge-Pfad.
  let hsurfGribP: Promise<GribField | null> | null = null;
  const hsurfGrib = (): Promise<GribField | null> => {
    if (!hsurfGribP) hsurfGribP = fetchInvariantField(runStr, 'hsurf', signal, D2_GRIB_PROXY_BASE).catch(() => null);
    return hsurfGribP;
  };

  let uvBounds: [number, number, number, number];
  let bounds: ForecastBounds;
  if (section) {
    // Die Ecken stehen im Abschnitt; der Producer hat sie mit derselben
    // `subsampledCorners()` gefüllt, die der GRIB-Zweig unten rechnet. Das
    // spart hier den einzigen GRIB-Abruf, der sonst allein der Geometrie diente.
    uvBounds = uvBoundsOf(section);
    const g = section.grid.corners;
    bounds = { lngMin: g.nw[0], lngMax: g.ne[0], latMin: g.se[1], latMax: g.nw[1] };
  } else {
    // Ein Feld für Bounds/Grid brauchen wir sicher: hsurf hat dasselbe Gitter,
    // sonst das erste t_2m-Feld holen.
    const gridRef = (await hsurfGrib()) ?? await fetchStepField(runStr, 't_2m', wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): `buildTempImage`
    // nimmt `min(n−1, k·ss)`, also den ERSTEN Punkt jedes Blocks — über `gribCorners`
    // gespannt landete jeder Wert eine halbe Nativzelle zu weit nördlich
    // (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
    // DEM über DIESELBEN Ecken — der Shader liest Werte- und DEM-Textur mit
    // derselben `uv`; verschiedene Bounds wären ein Versatz in der Höhenkorrektur.
    bounds = { lngMin: c[0][0], lngMax: c[1][0], latMin: c[2][1], latMax: c[0][1] };
  }
  const demImage = await buildDemImage(bounds, signal);

  const frames: IconD2TempFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // BW-3: 98 KB fertiges Bild statt 1 050 KB GRIB + Decode. `null` heißt
      // immer „nimm GRIB“ — Schritt nicht abgelegt, Frist abgelaufen, Weg aus.
      const png = section ? await loadTempStep(section, step, hsurfGrey, signal) : null;
      const built = png
        ? { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height }
        : await (async () => {
          const t2m = await fetchStepField(runStr, 't_2m', step, signal, D2_GRIB_PROXY_BASE);
          return buildTempImage(t2m, await hsurfGrib(), Math.max(1, Math.ceil(t2m.ni / TARGET_WIDTH)));
        })();
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: TEMP_VMIN, vMax: TEMP_VMAX, demImage });
    } catch {
      // Einzelner Schritt fehlt → überspringen.
    }
  };

  // Bounded-Concurrency-Pump über die Schritte.
  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Temp: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: TEMP_VMIN, vMax: TEMP_VMAX, demImage };
}

// Hinweis: Frame-Wahl nach Vorlauf-Schritt (`tempFrameAtHour`) wurde entfernt.
// Frames werden jetzt zentral nach Gültigkeitszeit gewählt — siehe
// `frameAtValidTime` (sources/frameAtValidTime.ts), now-indexiert (QA-Fix D1).

// ---------------------------------------------------------------------------
// Zeitversetztes ICON-D2-Ensemble (Lauf-zu-Lauf-Spread) — echte Vorhersage-
// Unsicherheit für den Temperatur-Schleier. Vergleicht den JÜNGSTEN Lauf mit dem
// VORHERIGEN (3 h älter) bei GLEICHER Gültigkeitszeit (Schritt s vs s+3). Wo die
// Läufe auseinanderlaufen, ist die Vorhersage unsicher (Lagged-Ensemble-Methode).
// Der jüngste Lauf ist dank Decompressed-Cache i. d. R. ein Treffer → Mehrkosten
// ≈ ein zusätzlicher Lauf, nur an wenigen Stützstellen (alle 6 h).
// ---------------------------------------------------------------------------

/** Maximaler Lauf-zu-Lauf-Unterschied (K), der als „1" (volle Unsicherheit) kodiert wird. */
export const TEMP_SPREAD_MAX = 5;
const SPREAD_TARGET_WIDTH = 300;
function p2(n: number) { return String(n).padStart(2, '0'); }

export interface IconD2TempSpreadFrame { validAt: Date; stepHours: number; image: HTMLCanvasElement; width: number; height: number }
export interface IconD2TempSpread {
  frames: IconD2TempSpreadFrame[];
  uvBounds: [number, number, number, number];
  spreadMax: number;
  /** Kennung der verglichenen Läufe (für Status/Debug). */
  runs: { latest: string; prev: string };
}

/** Baut das Spread-Bild eines Schritts: R = |ΔT| / spreadMax (norm.), A = Maske. */
function buildSpreadImage(cur: GribField, prev: GribField, ss: number): Omit<IconD2TempSpreadFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = cur;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up (deckt sich mit dem Temp-Bild)
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const a = cur.values[k], b = prev.values[k];
      const idx = (y * w + ii) * 4;
      if (!Number.isFinite(a) || !Number.isFinite(b)) { img.data[idx + 3] = 0; continue; }
      const spread = Math.abs(a - b); // Kelvin-Differenz = °C-Differenz
      img.data[idx] = Math.round(clamp01(spread / TEMP_SPREAD_MAX) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt das Lauf-zu-Lauf-Spread-Feld (jüngster vs. vorheriger ICON-D2-Lauf) an
 * Stützstellen alle 6 h. Liefert null, wenn der vorherige Lauf nicht auflösbar
 * ist → der Schleier nutzt dann weiter nur die Klimatologie-Anomalie.
 */
export async function fetchTempRunSpread(signal?: AbortSignal): Promise<IconD2TempSpread | null> {
  const latest = await resolveLatestRun('t_2m', signal);
  const prevAt = new Date(latest.runAt.getTime() - 3 * 3_600_000);
  const prevStr =
    `${prevAt.getUTCFullYear()}${p2(prevAt.getUTCMonth() + 1)}${p2(prevAt.getUTCDate())}${p2(prevAt.getUTCHours())}`;
  const wantSteps = latest.steps.filter((s) => s <= MAX_STEP && s % 6 === 0);

  const frames: IconD2TempSpreadFrame[] = [];
  let uvBounds: [number, number, number, number] | null = null;
  let ss = 1;
  for (const s of wantSteps) {
    let cur: GribField, prev: GribField;
    try {
      [cur, prev] = await Promise.all([
        fetchStepField(latest.runStr, 't_2m', s, signal, D2_GRIB_PROXY_BASE),  // i. d. R. Cache-Treffer
        // Vorheriger Lauf, gleiche Gültigkeit — nicht gewärmt, aber der Edge-Pfad
        // reicht auch ungewärmte erlaubte Dateien durch (und cacht sie on-demand).
        fetchStepField(prevStr, 't_2m', s + 3, signal, D2_GRIB_PROXY_BASE),
      ]);
    } catch { continue; } // Schritt im Vorlauf fehlt → überspringen
    if (cur.ni !== prev.ni || cur.nj !== prev.nj) continue;
    if (!uvBounds) {
      ss = Math.max(1, Math.ceil(cur.ni / SPREAD_TARGET_WIDTH));
      const c = subsampledCorners(cur, ss);   // abgetastete Punkte, nicht Nativgitter (KL3)
      uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
    }
    frames.push({
      validAt: new Date(latest.runAt.getTime() + s * 3_600_000),
      stepHours: s, ...buildSpreadImage(cur, prev, ss),
    });
  }
  if (!uvBounds || frames.length === 0) return null;
  return { frames, uvBounds, spreadMax: TEMP_SPREAD_MAX, runs: { latest: latest.runStr, prev: prevStr } };
}

// Hinweis: `spreadFrameAtHour` entfernt — der Spread-Frame wird jetzt ebenfalls
// zentral nach Gültigkeitszeit via `frameAtValidTime` gewählt (QA-Fix D1).
