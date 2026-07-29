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
  resolveLatestRun, fetchStepField, gribCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';

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
export const LPI_VMIN = 0;
export const LPI_VMAX = 30;

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
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Baut das RGBA-Werte-Bild eines Schritts aus dem rohen `lpi_max`-Feld:
 * R = lpi/LPI_VMAX (linear normiert, geklemmt), A = Maske (0 = außerhalb der
 * ICON-D2-Domäne). Nicht-endliche Zellen (Bitmap-Maske, `gribDecode.ts` → NaN)
 * → alpha 0 → transparent (nie 0). Ruhige In-Domänen-Zellen (LPI 0) sind endlich
 * → gerendert, aber vom ScalarLayer-`visRange` unter ~1 J/kg ausgeblendet.
 */
function buildLpiImage(lpi: GribField, ss: number): Omit<IconD2LpiFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = lpi;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const span = LPI_VMAX - LPI_VMIN; // 30
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const v = lpi.values[k];
      if (!Number.isFinite(v)) { img.data[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
      img.data[idx] = Math.round(clamp01((v - LPI_VMIN) / span) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt das native ICON-D2-`lpi_max`-Gitter des jüngsten Laufs (1–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Lpi(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Lpi) => void,
): Promise<IconD2Lpi> {
  const { runStr, runAt, steps } = await resolveLatestRun('lpi_max', signal);
  // t+0 auslassen: `lpi_max` ist dort als Intervall-Maximum strukturell 0.
  const wanted = steps.filter((s) => s >= MIN_STEP && s <= MAX_STEP);
  if (wanted.length === 0) throw new Error('ICON-D2 Blitz-Vorhersage: keine Schritte im Horizont');

  // Ein Feld für Bounds/Grid/Subsampling sicher holen.
  const gridRef = await fetchStepField(runStr, 'lpi_max', wanted[0], signal, D2_GRIB_PROXY_BASE);
  const c = gribCorners(gridRef); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));

  const frames: IconD2LpiFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      const lpi = await fetchStepField(runStr, 'lpi_max', step, signal, D2_GRIB_PROXY_BASE);
      frames.push({
        validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step,
        ...buildLpiImage(lpi, ss),
      });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: LPI_VMIN, vMax: LPI_VMAX });
    } catch {
      // `lpi_max` des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
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

  if (frames.length === 0) throw new Error('ICON-D2 Blitz-Vorhersage: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: LPI_VMIN, vMax: LPI_VMAX };
}
