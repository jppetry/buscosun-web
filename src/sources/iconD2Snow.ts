/**
 * DWD ICON-D2 — Schnee (Feature F4) als natives 2,2-km-Gitter für den Karten-
 * Layer „Schnee". Zeigt die **Schneemenge als Fläche** (cm) in zwei Modi:
 *
 *   • „Schneedecke" — aktuelle Schneehöhe `h_snow` (m → cm), INSTANTAN → t+0 gültig.
 *   • „Neuschnee"    — akkumulierter Schneefall `snow_gsp` (+ `snow_con`), kg/m²
 *                      = mm SWE → cm via `freshSnowCmFromSwe` (alpineSplit-Reuse,
 *                      `rho_snow` bevorzugt). AKKUMULIERT seit Laufbeginn → Summe
 *                      wächst mit dem Horizont; Step 0 strukturell 0 → `minStepHours=1`.
 *
 * ABGRENZUNG (Verwechslungsgefahr, Spec §0): Dies ist die Schnee-**Menge** als
 * Raster — NICHT die Schneegrenzen-**Linie** (das ist der bestehende ML-Layer
 * `snowline`, `climaField`). Beide koexistieren, klar getrennt. `snowline`/
 * `climaField` werden NICHT angefasst.
 *
 * ⚠️ `freshsnw` (ICON Frische-/Albedo-Faktor 0..1) ist NICHT die Neuschneemenge
 * (Diagnose §8.2, am Feld belegt). Neuschnee kommt aus `snow_gsp`(+`snow_con`).
 *
 * Gleiche GRIB2-Pipeline wie Temp/Böen (`resolveLatestRun` + `fetchStepField`
 * über den durable-gecachten `/_dwd_grib`-Edge-Pfad, reguläres lat-lon-Gitter
 * GDT 0, DE + Umfeld). Bewusst NICHT `fetchIconD2Grid` (Uint8-quantisiert, kein
 * Schnee-Kind in `GridToU8Kind`; der Neuschnee-Modus fusioniert zudem mehrere
 * Roh-Felder je Zelle — Muster Gewitter/thunder). KEINE DEM-Höhenkorrektur,
 * KEIN EPS-/icosahedraler Pfad, KEIN Decode-Eingriff.
 *
 * LAZY: der Aufrufer (MapView) startet den Loader erst beim Aktivieren des
 * Layers (und bei Modus-Wechsel) — Kaltstart der Karte bleibt unberührt.
 * CC BY 4.0, kein API-Key.
 */

import {
  resolveLatestRun, fetchStepField, subsampledCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { buildSnowDepthRgba, buildSnowFreshRgba, SNOW_DEPTH_VMAX_CM, SNOW_FRESH_VMAX_CM } from './scalarFrameBuild';
export { SNOW_DEPTH_VMAX_CM, SNOW_FRESH_VMAX_CM } from './scalarFrameBuild';
import { resolveRepackForRun, loadScalarStep, uvBoundsOf, REPACK_CONCURRENCY } from './repackSource';
import { stepsForNowWindow } from './frameAtValidTime';

export type SnowMode = 'depth' | 'fresh';

export const ICON_D2_SNOW_ATTRIBUTION =
  'Schnee: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> (h_snow · snow_gsp) · CC BY 4.0';

/** Horizont-Cap (h) — deckt den Karten-Slider (0–24 h) ab; darüber nächstliegender Frame. */
const MAX_STEP = 24;
/** Ziel-Breite nach Subsampling (1215er-Nativgitter ist für ein Raster Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Schritte (Neuschnee lädt bis 3 Felder je Schritt; bz2-Decompress im Worker-Pool). */
const CONCURRENCY = 3;

/** Normierung (cm) je Modus — R-Kanal = clamp01(cm / VMAX). Schneedecke bis 150 cm
 *  (Gletscher sättigen), Neuschnee bis 50 cm (Stufen 1/5/10/25/50). vMin/vMax im
 *  Frame sind rein informativ (der Shader nutzt sie nur bei DEM-Refine = AUS). */
// SNOW_*_VMAX_CM leben seit BW-6a in `scalarFrameBuild.ts` (geteilt mit dem Producer).

export interface IconD2SnowFrame {
  validAt: Date;
  stepHours: number;
  /** RGBA-Canvas: R = clamp01(cm / VMAX), A = Maske (0 außerhalb Domäne). */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface IconD2Snow {
  runAt: Date;
  mode: SnowMode;
  frames: IconD2SnowFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
  vMin: number;
  /** Physikalischer Deckel der Normierung (cm) — modusabhängig. */
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
 * Schneedecke: `h_snow` (m) → R = clamp01(cm / 150). NaN (außerhalb Domäne,
 * Bitmap-Maske) → alpha 0 → transparent (nie 0). h_snow=0 (schneefrei) ist
 * endlich → R=0 → durch `snowRamp`-0-Stop + `visRange` (< ~1 cm) ausgeblendet.
 */
function buildDepthImage(hsnow: GribField, ss: number): Omit<IconD2SnowFrame, 'validAt' | 'stepHours'> {
  const { rgba, width, height } = buildSnowDepthRgba(hsnow, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Neuschnee: akkumulierter Schneefall `snow_gsp`(+`snow_con`) [kg/m² = mm SWE]
 * → cm via `freshSnowCmFromSwe` (alpineSplit-Reuse, `rho_snow` bevorzugt). R =
 * clamp01(cm / 50). Domänenanker ist `snow_gsp`: dort NaN → alpha 0 → transparent.
 * `snow_con`/`rho_snow` dürfen fehlen (→ 0 bzw. 10:1-Näherung). Grid-Mismatch eines
 * Nebenfelds → dieses Feld als „nicht vorhanden" behandeln.
 */
function buildFreshImage(gsp: GribField, con: GribField | null, rho: GribField | null, ss: number): Omit<IconD2SnowFrame, 'validAt' | 'stepHours'> {
  const { rgba, width, height } = buildSnowFreshRgba(gsp, con, rho, ss);
  return { image: rgbaToCanvas(rgba, width, height), width, height };
}

/**
 * Lädt das native ICON-D2-Schnee-Gitter des jüngsten Laufs im gewählten Modus.
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Snow(
  mode: SnowMode,
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Snow) => void,
  /** H13 (BW-8): im Nur-Jetzt-Modus der Karte (`START_NOW_ONLY`) NUR das Fenster
   *  „jetzt" … „jetzt + aheadHours" laden (`stepsForNowWindow`), wie Wind/Temp/Böen —
   *  ohne die Option alle Schritte, wie bisher. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Snow> {
  const vMax = mode === 'depth' ? SNOW_DEPTH_VMAX_CM : SNOW_FRESH_VMAX_CM;
  // Lauf/Steps über den jeweils Pflicht-Param auflösen (immer publiziert).
  const anchorParam = mode === 'depth' ? 'h_snow' : 'snow_gsp';
  const { runStr, runAt, steps } = await resolveLatestRun(anchorParam, signal);
  // Neuschnee: Step 0 ist als Akkumulation strukturell 0 → auslassen (minStepHours=1).
  const capped = steps.filter((s) => s <= MAX_STEP && (mode === 'depth' || s >= 1));
  const wanted = opts?.nowOnly ? stepsForNowWindow(capped, runAt, opts.aheadHours ?? 0) : capped;
  if (wanted.length === 0) throw new Error('ICON-D2 Schnee: keine Schritte im Horizont');

  // BW-6c: liegen die Bilder für GENAU DIESEN Lauf im Daten-CDN? Geprüft
  // gegen `runStr`, den Lauf, den die Auflösung wirklich geliefert hat (§22.4).
  // Mit Abschnitt entfällt der GRIB-Abruf, der sonst nur der Geometrie diente.
  const section = await resolveRepackForRun(runStr, mode === 'depth' ? 'snowDepth' : 'snowFresh', wanted);
  let uvBounds: [number, number, number, number];
  if (section) {
    uvBounds = uvBoundsOf(section);
  } else {
    const gridRef = await fetchStepField(runStr, anchorParam, wanted[0], signal, D2_GRIB_PROXY_BASE);
    const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
    // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
    // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — über
    // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
    // nördlich (audit/karten-layer-verortung.md, B3).
    const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
    uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
  }
  const ssOf = (g: GribField) => Math.max(1, Math.ceil(g.ni / TARGET_WIDTH));

  const frames: IconD2SnowFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      let built: Omit<IconD2SnowFrame, 'validAt' | 'stepHours'>;
      // BW-6c: fertiges Bild aus dem Daten-CDN (je Modus eigene Familie), sonst GRIB.
      const png = section ? await loadScalarStep(section, mode === 'depth' ? 'snowDepth' : 'snowFresh', step, signal) : null;
      if (png) {
        built = { image: rgbaToCanvas(png.rgba, png.width, png.height), width: png.width, height: png.height };
      } else if (mode === 'depth') {
        const hsnow = await fetchStepField(runStr, 'h_snow', step, signal, D2_GRIB_PROXY_BASE);
        built = buildDepthImage(hsnow, ssOf(hsnow));
      } else {
        // snow_gsp Pflicht (Domänenanker); snow_con/rho_snow optional.
        const [gsp, con, rho] = await Promise.all([
          fetchStepField(runStr, 'snow_gsp', step, signal, D2_GRIB_PROXY_BASE),
          fetchStepField(runStr, 'snow_con', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
          fetchStepField(runStr, 'rho_snow', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
        ]);
        built = buildFreshImage(gsp, con, rho, ssOf(gsp));
      }
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, mode, frames: [...frames], uvBounds, vMin: 0, vMax });
    } catch {
      // Anker-Feld des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
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

  if (frames.length === 0) throw new Error('ICON-D2 Schnee: keine Frames erzeugt');
  return { runAt, mode, frames, uvBounds, vMin: 0, vMax };
}
