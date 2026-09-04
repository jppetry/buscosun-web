/**
 * DWD ICON-D2 — Gewitterpotenzial (Feature F1) als natives 2,2-km-Gitter für den
 * Karten-Layer „Gewitter". Fusioniert DREI ICON-D2-Felder je Zelle zu EINEM
 * 0–100-Index (siehe `src/radar/thunderPotential.ts`):
 *
 *   cape_ml (Energie) × cin_ml (Deckel) × lpi (Blitzbereitschaft)
 *
 * Gleiche GRIB2-Pipeline wie Temp/Böen (`resolveLatestRun` + `fetchStepField`
 * über den durable-gecachten `/_dwd_grib`-Edge-Pfad, reguläres lat-lon-Gitter,
 * DE + Umfeld) — analog zu `iconD2TempSource`, das `t_2m` + `hsurf` zu EINEM
 * Werte-Canvas fusioniert. Bewusst NICHT `fetchIconD2Grid` (Uint8-quantisiert,
 * einkanalig — untauglich für die 3-Feld-Rohfusion; Begründung Diagnose §8.4).
 * KEINE DEM-Höhenkorrektur, KEIN EPS-/icosahedraler Pfad, KEIN Decode-Eingriff.
 *
 * Die drei Felder stammen aus DEMSELBEN Lauf (identisches runStr + Step-Liste)
 * → gemeinsame Gültigkeitszeit ist per Step strukturell garantiert; je Step
 * werden alle drei parallel geholt und fusioniert (fehlt eines → Step
 * übersprungen). Die Slider-Zeitwahl macht der MapView per `bracketAtValidTime`.
 *
 * LAZY: der Aufrufer (MapView) startet den Loader erst beim Aktivieren des
 * Layers — Kaltstart der Karte bleibt unberührt. CC BY 4.0, kein API-Key.
 */

import {
  resolveLatestRun, fetchStepField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { buildThunderRgba, THUNDER_VMIN, THUNDER_VMAX } from './scalarFrameBuild';
export { THUNDER_VMIN, THUNDER_VMAX } from './scalarFrameBuild';
import { resolveRepackForRun, loadScalarStep, uvBoundsOf, REPACK_CONCURRENCY } from './repackSource';
import { stepsForNowWindow } from './frameAtValidTime';

export const ICON_D2_THUNDER_ATTRIBUTION =
  'Gewitterpotenzial: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> (cape_ml · cin_ml · lpi) · CC BY 4.0';

/** Horizont-Cap (h) — ehrlicher Konvektions-Horizont (~0–12 h, §2.3). Über den
 *  Slider hinaus zeigt `frameAtValidTime` den nächstliegenden (12-h-)Frame. */
const MAX_STEP = 12;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für ein Raster Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Schritte (je Schritt 3 Felder; bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 3;
/** Physikalischer Wertebereich des Index (0..100) — Normierung des Werte-Canvas. */
// THUNDER_VMIN/THUNDER_VMAX leben seit BW-6a in `scalarFrameBuild.ts` (geteilt mit dem Producer).

export interface IconD2ThunderFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = Score/100 (0..1), A = Maske (0 außerhalb Domäne). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Thunder {
  runAt: Date;
  frames: IconD2ThunderFrame[];
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

let cinSignLogged = false;

/**
 * Baut das RGBA-Werte-Bild eines Schritts aus den drei Roh-Feldern:
 * R = Gewitterpotenzial-Score/100, A = Maske (0 = außerhalb der ICON-D2-Domäne).
 * Domänenanker ist `cape_ml`: ist es dort NaN (Bitmap-Maske, `gribDecode.ts:299`),
 * liefert `thunderScore` NaN → alpha 0 → transparent (nie 0). Grid-Mismatch
 * eines Nebenfeldes → dieses Feld als 0 behandeln (kein Deckel/keine Auslösung).
 */
function buildThunderImage(cape: GribField, cin: GribField | null, lpi: GribField | null, ss: number): Omit<IconD2ThunderFrame, 'validAt' | 'stepHours'> {
  // Dev-Diagnose (einmalig): min/max des dekodierten cin_ml bestätigt die
  // Vorzeichen-Konvention zur Laufzeit (siehe Diagnose §8.2). Die Fusion ist
  // per `Math.abs` bereits vorzeichen-invariant — dies ist nur Beleg. Bleibt
  // bewusst HIER (Client) und nicht im geteilten Modul: in Node gibt es kein `import.meta.env`.
  const cinOk = !!cin && cin.ni === cape.ni && cin.nj === cape.nj;
  if (import.meta.env.DEV && !cinSignLogged && cinOk && cin) {
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < cin.values.length; k++) {
      const v = cin.values[k];
      if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    // eslint-disable-next-line no-console
    console.debug(`[thunder] cin_ml decode min=${mn.toFixed(1)} max=${mx.toFixed(1)} J/kg (|CIN|-Gate ist vorzeichen-invariant)`);
    cinSignLogged = true;
  }
  const { rgba, width, height } = buildThunderRgba(cape, cin, lpi, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-Gewitterpotenzial-Gitter des jüngsten Laufs (0–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Thunder(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Thunder) => void,
  /** H13 (BW-8): im Nur-Jetzt-Modus der Karte (`START_NOW_ONLY`) NUR das Fenster
   *  „jetzt" … „jetzt + aheadHours" laden (`stepsForNowWindow`), wie Wind/Temp/Böen —
   *  ohne die Option alle Schritte, wie bisher. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Thunder> {
  // cape_ml ist der Energieanker & immer publizierte Param → löst Lauf/Steps auf.
  const { runStr, runAt, steps } = await resolveLatestRun('cape_ml', signal, 'thunder');
  const capped = steps.filter((s) => s <= MAX_STEP);
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;
  if (wanted.length === 0) throw new Error('ICON-D2 Gewitter: keine Schritte im Horizont');

  // BW-6c: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft
  // gegen `runStr`, den Lauf, den die Auflösung wirklich geliefert hat (§22.4).
  // Mit Abschnitt entfällt der GRIB-Abruf, der sonst nur der Geometrie diente.
  const section = await resolveRepackForRun(runStr, 'thunder', wanted);
  let uvBounds: [number, number, number, number];
  if (section) {
    uvBounds = uvBoundsOf(section);
  } else {
    const gridRef = await fetchStepField(runStr, 'cape_ml', wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
    // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — über
    // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
    // nördlich (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
  }
  const ssOf = (g: GribField) => Math.max(1, Math.ceil(g.ni / TARGET_WIDTH));

  const frames: IconD2ThunderFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // Die drei Felder desselben Laufs/Schritts parallel. cin_ml/lpi dürfen
      // fehlen (→ als 0 behandelt); cape_ml ist Pflicht (Energieanker).
      // BW-6c: EIN fertiges Score-Bild (≈ 30 KB) statt DREI GRIBs (≈ 3 MB) —
      // der Score ist im Producer mit demselben `buildThunderRgba` gerechnet.
      const png = section ? await loadScalarStep(section, 'thunder', step, signal) : null;
      const built = png
        ? { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height }
        : await (async () => {
          const [cape, cin, lpi] = await Promise.all([
            fetchStepField(runStr, 'cape_ml', step, signal, D2_GRIB_PROXY_BASE),
            fetchStepField(runStr, 'cin_ml', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
            fetchStepField(runStr, 'lpi', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
          ]);
          return buildThunderImage(cape, cin, lpi, ssOf(cape));
        })();
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: THUNDER_VMIN, vMax: THUNDER_VMAX });
    } catch {
      // cape_ml des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
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

  if (frames.length === 0) throw new Error('ICON-D2 Gewitter: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: THUNDER_VMIN, vMax: THUNDER_VMAX };
}
