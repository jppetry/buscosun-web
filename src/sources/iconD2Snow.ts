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
  resolveLatestRun, fetchStepField, gribCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { freshSnowCmFromSwe } from '../nowcast/alpineSplit';

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
export const SNOW_DEPTH_VMAX_CM = 150;
export const SNOW_FRESH_VMAX_CM = 50;

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
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Schneedecke: `h_snow` (m) → R = clamp01(cm / 150). NaN (außerhalb Domäne,
 * Bitmap-Maske) → alpha 0 → transparent (nie 0). h_snow=0 (schneefrei) ist
 * endlich → R=0 → durch `snowRamp`-0-Stop + `visRange` (< ~1 cm) ausgeblendet.
 */
function buildDepthImage(hsnow: GribField, ss: number): Omit<IconD2SnowFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = hsnow;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const v = hsnow.values[k];
      if (!Number.isFinite(v)) { img.data[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
      const cm = v * 100; // m → cm
      img.data[idx] = Math.round(clamp01(cm / SNOW_DEPTH_VMAX_CM) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Neuschnee: akkumulierter Schneefall `snow_gsp`(+`snow_con`) [kg/m² = mm SWE]
 * → cm via `freshSnowCmFromSwe` (alpineSplit-Reuse, `rho_snow` bevorzugt). R =
 * clamp01(cm / 50). Domänenanker ist `snow_gsp`: dort NaN → alpha 0 → transparent.
 * `snow_con`/`rho_snow` dürfen fehlen (→ 0 bzw. 10:1-Näherung). Grid-Mismatch eines
 * Nebenfelds → dieses Feld als „nicht vorhanden" behandeln.
 */
function buildFreshImage(gsp: GribField, con: GribField | null, rho: GribField | null, ss: number): Omit<IconD2SnowFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = gsp;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const conOk = !!con && con.ni === ni && con.nj === nj;
  const rhoOk = !!rho && rho.ni === ni && rho.nj === nj;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const g = gsp.values[k];
      if (!Number.isFinite(g)) { img.data[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
      const c = conOk ? con!.values[k] : 0;
      const sweMm = g + (Number.isFinite(c) ? c : 0); // kg/m² = mm SWE (akkumuliert)
      const rhoV = rhoOk ? rho!.values[k] : undefined;
      const cm = freshSnowCmFromSwe(sweMm, Number.isFinite(rhoV as number) ? (rhoV as number) : undefined);
      img.data[idx] = Math.round(clamp01(cm / SNOW_FRESH_VMAX_CM) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt das native ICON-D2-Schnee-Gitter des jüngsten Laufs im gewählten Modus.
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Snow(
  mode: SnowMode,
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Snow) => void,
): Promise<IconD2Snow> {
  const vMax = mode === 'depth' ? SNOW_DEPTH_VMAX_CM : SNOW_FRESH_VMAX_CM;
  // Lauf/Steps über den jeweils Pflicht-Param auflösen (immer publiziert).
  const anchorParam = mode === 'depth' ? 'h_snow' : 'snow_gsp';
  const { runStr, runAt, steps } = await resolveLatestRun(anchorParam, signal);
  // Neuschnee: Step 0 ist als Akkumulation strukturell 0 → auslassen (minStepHours=1).
  const wanted = steps.filter((s) => s <= MAX_STEP && (mode === 'depth' || s >= 1));
  if (wanted.length === 0) throw new Error('ICON-D2 Schnee: keine Schritte im Horizont');

  // Ein Anker-Feld für Bounds/Grid/Subsampling sicher holen.
  const gridRef = await fetchStepField(runStr, anchorParam, wanted[0], signal, D2_GRIB_PROXY_BASE);
  const c = gribCorners(gridRef); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));

  const frames: IconD2SnowFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      let built: Omit<IconD2SnowFrame, 'validAt' | 'stepHours'>;
      if (mode === 'depth') {
        const hsnow = await fetchStepField(runStr, 'h_snow', step, signal, D2_GRIB_PROXY_BASE);
        built = buildDepthImage(hsnow, ss);
      } else {
        // snow_gsp Pflicht (Domänenanker); snow_con/rho_snow optional.
        const [gsp, con, rho] = await Promise.all([
          fetchStepField(runStr, 'snow_gsp', step, signal, D2_GRIB_PROXY_BASE),
          fetchStepField(runStr, 'snow_con', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
          fetchStepField(runStr, 'rho_snow', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
        ]);
        built = buildFreshImage(gsp, con, rho, ss);
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
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Schnee: keine Frames erzeugt');
  return { runAt, mode, frames, uvBounds, vMin: 0, vMax };
}
