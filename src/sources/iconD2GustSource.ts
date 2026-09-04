/**
 * DWD ICON-D2 — Windböen (`vmax_10m`) als natives 2,2-km-Gitter für den
 * Böen-Raster-Layer der Kartenansicht (Windy-artig).
 *
 * `vmax_10m` ist die maximale 10-m-Windböe je Ausgabeintervall (m/s) — der
 * sicherheitsrelevante Spitzenwert, nicht das Stundenmittel. Eigene Schicht,
 * weil Böen (Drohne/Kran/Höhenarbeit, vgl. Go/No-Go) deutlich über dem Mittel
 * liegen und eine eigene Risiko-Aussage sind.
 *
 * Gleiche GRIB2-Pipeline wie Temp/Wind/Wolken (regular lat-lon, DE + Umfeld);
 * KEINE DEM-Höhenkorrektur (Böen sind ein 10-m-Diagnostik-Feld, das die
 * Orografie bereits enthält). CC BY 4.0, kein API-Key.
 */

import { resolveLatestRun, fetchStepField, subsampledCorners, D2_GRIB_PROXY_BASE, type GribField } from './iconD2Precip';
import { stepsForNowWindow } from './frameAtValidTime';
import { buildGustRgba, GUST_VMIN, GUST_VMAX } from './scalarFrameBuild';
export { GUST_VMIN, GUST_VMAX } from './scalarFrameBuild';
import { resolveRepackForRun, loadScalarStep, uvBoundsOf, REPACK_CONCURRENCY } from './repackSource';

export const ICON_D2_GUST_ATTRIBUTION =
  'Windböen: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> (vmax_10m) · CC BY 4.0';

/** Horizont-Cap (h) — deckt den Slider ab. */
const MAX_STEP = 24;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für ein Raster Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;
// GUST_VMIN/GUST_VMAX leben seit BW-6a in `scalarFrameBuild.ts` (geteilt mit dem Producer).

export interface IconD2GustFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = norm. Böe (m/s), A = Maske. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Gust {
  runAt: Date;
  frames: IconD2GustFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
  vMin: number;
  vMax: number;
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

/** RGBA-Bytes → Canvas (billiges `putImageData`; die Mathematik lebt in `scalarFrameBuild.ts`). */
function rgbaToCanvas(rgba: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

/** Baut das RGBA-Werte-Bild eines Schritts: R = norm. Böe (m/s), A = Maske. */
function buildGustImage(g: GribField, ss: number): Omit<IconD2GustFrame, 'validAt' | 'stepHours'> {
  const { rgba, width, height } = buildGustRgba(g, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-Windböen-Gitter des jüngsten Laufs (0–24 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Gust(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Gust) => void,
  /** `nowOnly` (Testmodus „startnow", MapView): lädt statt 0–24 h NUR das Fenster
   *  von „jetzt" bis „jetzt + aheadHours" (`stepsForNowWindow`); 0 = Jetzt-Bracket. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Gust> {
  const { runStr, runAt, steps } = await resolveLatestRun('vmax_10m', signal, 'gust');
  const capped = steps.filter((s) => s <= MAX_STEP);
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;

  // BW-6c: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft
  // gegen `runStr`, den Lauf, den die Auflösung wirklich geliefert hat (§22.4).
  // Mit Abschnitt entfällt der GRIB-Abruf, der sonst nur der Geometrie diente.
  const section = await resolveRepackForRun(runStr, 'gust', wanted);
  let uvBounds: [number, number, number, number];
  if (section) {
    uvBounds = uvBoundsOf(section);
  } else {
    const gridRef = await fetchStepField(runStr, 'vmax_10m', wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
    // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — über
    // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
    // nördlich (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
  }
  const ssOf = (g: GribField) => Math.max(1, Math.ceil(g.ni / TARGET_WIDTH));

  const frames: IconD2GustFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // BW-6c: 120 KB fertiges Bild statt 1 100 KB GRIB + Decode. `null` heißt
      // immer „nimm GRIB“ — Schritt nicht abgelegt, Frist abgelaufen, Weg aus.
      const png = section ? await loadScalarStep(section, 'gust', step, signal) : null;
      const built = png
        ? { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height }
        : await (async () => {
          const g = await fetchStepField(runStr, 'vmax_10m', step, signal, D2_GRIB_PROXY_BASE);
          return buildGustImage(g, ssOf(g));
        })();
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: GUST_VMIN, vMax: GUST_VMAX });
    } catch {
      // Einzelner Schritt fehlt → überspringen.
    }
  };

  let ptr = 0;
  const workers = Array.from({ length: Math.min(section ? REPACK_CONCURRENCY : CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Gust: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: GUST_VMIN, vMax: GUST_VMAX };
}

// Hinweis: `gustFrameAtHour` entfernt — Frames werden zentral nach
// Gültigkeitszeit via `frameAtValidTime` gewählt (now-indexiert, QA-Fix D1);
// Böen zusätzlich mit minStepHours=1 (vmax_10m@t0=0, QA-Fix D4).
