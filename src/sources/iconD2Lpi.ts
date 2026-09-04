/**
 * DWD ICON-D2 — Blitz-Vorhersage (Feature F2) als natives 2,2-km-Gitter für den
 * Karten-Layer „Blitzprognose". Rendert den **Lightning Potential Index**
 * (`lpi_max`, J/kg) flächig als Blitz-RISIKO über DACH und läuft über den
 * Zeit-Slider 0–12 h in die ZUKUNFT.
 *
 * ABGRENZUNG (Verwechslungsgefahr, Spec §0): Dies ist eine **Prognose**, NICHT
 * der bestehende „Blitze"-Layer (`src/sources/dwdLightning.ts`,
 * `Accumulated_Flash_Area`), der GEMESSENE Einschläge der letzten 60 Min zeigt.
 * Beide koexistieren, optisch getrennt. `dwdLightning.ts` wird NICHT angefasst.
 *
 * Gleiche GRIB2-Pipeline wie Temp/Böen (`resolveLatestRun` + `fetchStepField`
 * über den durable-gecachten `/_dwd_grib`-Edge-Pfad, reguläres lat-lon-Gitter
 * GDT 0, DE + Umfeld) — ein EIN-Feld-Layer, exakt das Böen-Muster (`vmax_10m` →
 * ein `ScalarLayer` mit eigener Rampe). Bewusst NICHT `fetchIconD2Grid`
 * (Uint8-quantisiert, kein `'max'`-Kind, `'cape'`-Quantisierung zerquetscht
 * LPIs feinen 0..~30-J/kg-Bereich — Diagnose §8.4). KEINE DEM-Höhenkorrektur,
 * KEIN EPS-/icosahedraler Pfad, KEIN Decode-Eingriff.
 *
 * `lpi_max` ist das Maximum des LPI über das Ausgabeintervall → am Analyse-
 * Schritt t+0 strukturell 0 (wie `vmax_10m`). Der Loader lädt daher erst ab
 * Schritt 1; die Frame-Wahl im MapView nutzt zusätzlich `minStepHours = 1`
 * (`frameAtValidTime.ts` QA-Befund D4), sonst wäre der Layer bei „jetzt" leer.
 * Fallback bei lückenhaftem `lpi_max`: das instantane `lpi` (kein t+0-Sonderfall,
 * verpasst aber kurze Peaks) — hier dokumentiert, nicht automatisch geschaltet.
 *
 * LAZY: der Aufrufer (MapView) startet den Loader erst beim Aktivieren des
 * Layers — Kaltstart der Karte bleibt unberührt. CC BY 4.0, kein API-Key.
 */

import {
  resolveLatestRun, fetchStepField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { buildLpiRgba, LPI_VMIN, LPI_VMAX } from './scalarFrameBuild';
export { LPI_VMIN, LPI_VMAX } from './scalarFrameBuild';
import { resolveRepackForRun, loadScalarStep, uvBoundsOf, REPACK_CONCURRENCY } from './repackSource';
import { stepsForNowWindow } from './frameAtValidTime';

export const ICON_D2_LPI_ATTRIBUTION =
  'Blitz-Vorhersage: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> (lpi_max) · CC BY 4.0';

/** Horizont-Cap (h) — ehrlicher NWP-Blitzhorizont (~0–12 h, §2.4). Über den
 *  Slider hinaus zeigt `bracketAtValidTime` den nächstliegenden Frame. */
const MAX_STEP = 12;
/** Der Loader lässt t+0 weg: `lpi_max` ist als Intervall-Maximum dort strukturell
 *  0 (Diagnose §8.2). Der Render-Effekt filtert es zusätzlich via minStepHours=1. */
const MIN_STEP = 1;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für ein Raster Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Schritte (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 4;
/** Physikalischer Wertebereich der Normierung (J/kg). LPI liegt typ. 0..~30+;
 *  30 als Deckel („extrem") kalibriert die Rampe (§3), höhere Werte klemmen. */
// LPI_VMIN/LPI_VMAX leben seit BW-6a in `scalarFrameBuild.ts` (geteilt mit dem Producer).

export interface IconD2LpiFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = lpi/LPI_VMAX (0..1, geklemmt), A = Maske (0 außerhalb Domäne). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Lpi {
  runAt: Date;
  frames: IconD2LpiFrame[];
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

/**
 * Baut das RGBA-Werte-Bild eines Schritts aus dem rohen `lpi_max`-Feld:
 * R = lpi/LPI_VMAX (linear normiert, geklemmt), A = Maske (0 = außerhalb der
 * ICON-D2-Domäne). Nicht-endliche Zellen (Bitmap-Maske, `gribDecode.ts` → NaN)
 * → alpha 0 → transparent (nie 0). Ruhige In-Domänen-Zellen (LPI 0) sind endlich
 * → gerendert, aber vom ScalarLayer-`visRange` unter ~1 J/kg ausgeblendet.
 */
function buildLpiImage(lpi: GribField, ss: number): Omit<IconD2LpiFrame, 'validAt' | 'stepHours'> {
  const { rgba, width, height } = buildLpiRgba(lpi, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-`lpi_max`-Gitter des jüngsten Laufs (1–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Lpi(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Lpi) => void,
  /** H13 (BW-8): im Nur-Jetzt-Modus der Karte (`START_NOW_ONLY`) NUR das Fenster
   *  „jetzt" … „jetzt + aheadHours" laden (`stepsForNowWindow`), wie Wind/Temp/Böen —
   *  ohne die Option alle Schritte, wie bisher. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Lpi> {
  const { runStr, runAt, steps } = await resolveLatestRun('lpi_max', signal, 'lightningfc');
  // t+0 auslassen: `lpi_max` ist dort als Intervall-Maximum strukturell 0.
  const capped = steps.filter((s) => s >= MIN_STEP && s <= MAX_STEP);
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;
  if (wanted.length === 0) throw new Error('ICON-D2 Blitz-Vorhersage: keine Schritte im Horizont');

  // BW-6c: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft
  // gegen `runStr`, den Lauf, den die Auflösung wirklich geliefert hat (§22.4).
  // Mit Abschnitt entfällt der GRIB-Abruf, der sonst nur der Geometrie diente.
  const section = await resolveRepackForRun(runStr, 'lightningfc', wanted);
  let uvBounds: [number, number, number, number];
  if (section) {
    uvBounds = uvBoundsOf(section);
  } else {
    const gridRef = await fetchStepField(runStr, 'lpi_max', wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
    // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — über
    // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
    // nördlich (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
  }
  const ssOf = (g: GribField) => Math.max(1, Math.ceil(g.ni / TARGET_WIDTH));

  const frames: IconD2LpiFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // BW-6c: fertiges Bild aus dem Daten-CDN, sonst GRIB (s. Böen).
      const png = section ? await loadScalarStep(section, 'lightningfc', step, signal) : null;
      const built = png
        ? { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height }
        : await (async () => {
          const lpi = await fetchStepField(runStr, 'lpi_max', step, signal, D2_GRIB_PROXY_BASE);
          return buildLpiImage(lpi, ssOf(lpi));
        })();
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: LPI_VMIN, vMax: LPI_VMAX });
    } catch {
      // `lpi_max` des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
    }
  };

  // Bounded-Concurrency-Pump über die Schritte.
  let ptr = 0;
  const workers = Array.from({ length: Math.min(section ? REPACK_CONCURRENCY : CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Blitz-Vorhersage: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: LPI_VMIN, vMax: LPI_VMAX };
}
