/**
 * DWD ICON-D2 — Rotationspotenzial (Feature F5) als natives 2,2-km-Gitter für den
 * Experten-Karten-Layer „Rotation". Fusioniert DREI ICON-D2-Konvektionsfelder je
 * Zelle zu EINEM 0–100-Verdachts-Score (siehe `src/radar/rotationPotential.ts`)
 * und **glättet** ihn über die Nachbarschaft:
 *
 *   uh_max (2–5 km) ⊕ uh_max_low (0–3 km)  → |UH|-Stärke rotierender Aufwinde
 *   sdi_2 (Supercell Detection Index)        → Superzellen-Signatur (Korroboration)
 *
 * ⚠️ EHRLICHKEIT (audit/rotationspotenzial.md §0): **Modell-VERDACHT**, kein
 * amtliches Warnprodukt, kein Ereignis. Das Score-Grid wird geglättet (§0.3),
 * damit kein Einzelpixel Präzision vortäuscht. Kalibrierung an der gemessenen
 * ICON-D2-Skala (§8.4), großzügige Aktivierungsschwelle (Under-Paint).
 *
 * Gleiche GRIB2-Pipeline wie Temp/Böen (`resolveLatestRun` + `fetchStepField`
 * über den durable-gecachten `/_dwd_grib`-Edge-Pfad, reguläres lat-lon-Gitter
 * GDT 0, DACH — audit §8.1 belegt). Bewusst NICHT `fetchIconD2Grid` (Uint8-
 * quantisiert, einkanalig — untauglich für die 3-Feld-Rohfusion; würde
 * `gribGridDecode.ts` anfassen). KEINE DEM-Höhenkorrektur, KEIN EPS-/
 * icosahedraler Pfad, KEIN Decode-Eingriff.
 *
 * `uh_max`/`uh_max_low` sind **Intervall-Maxima** → am Analyse-Schritt degeneriert;
 * geladen werden Schritte **1..12** (`minStepHours=1`, Muster lpi_max/Böen), die
 * Slider-Zeitwahl macht die MapView per `bracketAtValidTime(…, 1)`. Die drei Felder
 * stammen aus DEMSELBEN Lauf/Step → gemeinsame Gültigkeitszeit strukturell garantiert;
 * `uh_max` ist Pflicht-Domänenanker, `uh_max_low`/`sdi_2` dürfen fehlen (→ 0).
 *
 * LAZY: der Aufrufer (MapView) startet den Loader erst beim Aktivieren des Layers —
 * Kaltstart der Karte bleibt unberührt. CC BY 4.0, kein API-Key.
 */

import {
  resolveLatestRun, fetchStepField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { buildRotationRgba, ROTATION_VMIN, ROTATION_VMAX } from './scalarFrameBuild';
export { ROTATION_VMIN, ROTATION_VMAX } from './scalarFrameBuild';
import { resolveRepackForRun, loadScalarStep, uvBoundsOf, REPACK_CONCURRENCY } from './repackSource';
import { stepsForNowWindow } from './frameAtValidTime';

export const ICON_D2_ROTATION_ATTRIBUTION =
  'Rotationspotenzial: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> (uh_max · uh_max_low · sdi_2) · CC BY 4.0 · Modell-Verdacht, kein Warnprodukt';

/** Horizont-Cap (h) — ehrlicher Konvektions-Horizont (~0–12 h). Über den Slider
 *  hinaus zeigt `bracketAtValidTime` den nächstliegenden Frame. */
const MAX_STEP = 12;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für ein Raster Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Schritte (je Schritt 3 Felder; bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 3;
/** Physikalischer Wertebereich des Index (0..100) — Normierung des Werte-Canvas. */
// ROTATION_VMIN/ROTATION_VMAX leben seit BW-6a in `scalarFrameBuild.ts` (geteilt mit dem Producer).

export interface IconD2RotationFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = geglätteter Score/100 (0..1), A = Maske (0 außerhalb Domäne). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Rotation {
  runAt: Date;
  frames: IconD2RotationFrame[];
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

let sdiSignLogged = false;

/**
 * Baut das RGBA-Werte-Bild eines Schritts: pro (subgesampelter) Zelle den fusionierten
 * Rotations-Score, dann NACHBARSCHAFTS-GLÄTTUNG (§0.3), dann R = Score/100, A = Maske.
 * `uh_max` ist der Domänenanker (NaN dort → NaN → alpha 0 → transparent, nie 0).
 * Grid-Mismatch eines Nebenfeldes → dieses Feld als 0 behandeln (keine Korroboration).
 */
function buildRotationImage(uh: GribField, uhLow: GribField | null, sdi: GribField | null, ss: number): Omit<IconD2RotationFrame, 'validAt' | 'stepHours'> {
  // Dev-Diagnose (einmalig): Vorzeichen/Bereich des dekodierten sdi_2 belegen
  // (audit §8.2). Bleibt HIER (Client), nicht im geteilten Modul (kein `import.meta.env` in Node).
  const sdiOk = !!sdi && sdi.ni === uh.ni && sdi.nj === uh.nj;
  if (import.meta.env.DEV && !sdiSignLogged && sdiOk && sdi) {
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < sdi.values.length; k++) {
      const v = sdi.values[k];
      if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    // eslint-disable-next-line no-console
    console.debug(`[rotation] sdi_2 decode min=${mn.toExponential(2)} max=${mx.toExponential(2)} (|·|-Signatur, vorzeichen-invariant)`);
    sdiSignLogged = true;
  }
  const { rgba, width, height } = buildRotationRgba(uh, uhLow, sdi, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-Rotationspotenzial-Gitter des jüngsten Laufs (1–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Rotation(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Rotation) => void,
  /** H13 (BW-8): im Nur-Jetzt-Modus der Karte (`START_NOW_ONLY`) NUR das Fenster
   *  „jetzt" … „jetzt + aheadHours" laden (`stepsForNowWindow`), wie Wind/Temp/Böen —
   *  ohne die Option alle Schritte, wie bisher. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Rotation> {
  // uh_max ist der Rotations-/Domänenanker & immer publizierter Param → löst Lauf/Steps auf.
  const { runStr, runAt, steps } = await resolveLatestRun('uh_max', signal, 'rotation');
  // Intervall-Maximum → Analyse-Schritt 0 degeneriert überspringen (minStepHours=1).
  const capped = steps.filter((s) => s >= 1 && s <= MAX_STEP);
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;
  if (wanted.length === 0) throw new Error('ICON-D2 Rotation: keine Schritte im Horizont');

  // BW-6c: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft
  // gegen `runStr`, den Lauf, den die Auflösung wirklich geliefert hat (§22.4).
  // Mit Abschnitt entfällt der GRIB-Abruf, der sonst nur der Geometrie diente.
  const section = await resolveRepackForRun(runStr, 'rotation', wanted);
  let uvBounds: [number, number, number, number];
  if (section) {
    uvBounds = uvBoundsOf(section);
  } else {
    const gridRef = await fetchStepField(runStr, 'uh_max', wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
    // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — über
    // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
    // nördlich (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
  }
  const ssOf = (g: GribField) => Math.max(1, Math.ceil(g.ni / TARGET_WIDTH));

  const frames: IconD2RotationFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // Die drei Felder desselben Laufs/Schritts parallel. uh_max_low/sdi_2 dürfen
      // fehlen (→ als 0 behandelt); uh_max ist Pflicht (Rotations-/Domänenanker).
      // BW-6c: EIN fertiges, geglättetes Score-Bild statt DREI GRIBs (s. Gewitter).
      const png = section ? await loadScalarStep(section, 'rotation', step, signal) : null;
      const built = png
        ? { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height }
        : await (async () => {
          const [uh, uhLow, sdi] = await Promise.all([
            fetchStepField(runStr, 'uh_max', step, signal, D2_GRIB_PROXY_BASE),
            fetchStepField(runStr, 'uh_max_low', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
            fetchStepField(runStr, 'sdi_2', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
          ]);
          return buildRotationImage(uh, uhLow, sdi, ssOf(uh));
        })();
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: ROTATION_VMIN, vMax: ROTATION_VMAX });
    } catch {
      // uh_max des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
    }
  };

  // Bounded-Concurrency-Pump über die Schritte (je Schritt 3 Felder).
  let ptr = 0;
  const workers = Array.from({ length: Math.min(section ? REPACK_CONCURRENCY : CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Rotation: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: ROTATION_VMIN, vMax: ROTATION_VMAX };
}
