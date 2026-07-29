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
  resolveLatestRun, fetchStepField, gribCorners,
  D2_GRIB_PROXY_BASE, type GribField,
} from './iconD2Precip';
import { rotationScore, smoothScores } from '../radar/rotationPotential';

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
export const ROTATION_VMIN = 0;
export const ROTATION_VMAX = 100;

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
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

let sdiSignLogged = false;

/**
 * Baut das RGBA-Werte-Bild eines Schritts: pro (subgesampelter) Zelle den fusionierten
 * Rotations-Score, dann NACHBARSCHAFTS-GLÄTTUNG (§0.3), dann R = Score/100, A = Maske.
 * `uh_max` ist der Domänenanker (NaN dort → NaN → alpha 0 → transparent, nie 0).
 * Grid-Mismatch eines Nebenfeldes → dieses Feld als 0 behandeln (keine Korroboration).
 */
function buildRotationImage(uh: GribField, uhLow: GribField | null, sdi: GribField | null, ss: number): Omit<IconD2RotationFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = uh;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const lowOk = !!uhLow && uhLow.ni === ni && uhLow.nj === nj;
  const sdiOk = !!sdi && sdi.ni === ni && sdi.nj === nj;

  // Dev-Diagnose (einmalig): Vorzeichen/Bereich des dekodierten sdi_2 belegen
  // (audit §8.2 — |sdi_2| ist betragsmäßig winzig; die Fusion ist per Math.abs
  // vorzeichen-invariant, dies ist nur Beleg für §7.3).
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

  // 1) Score-Grid (north-up) — NaN außerhalb der Domäne (Anker uh_max).
  const scores = new Float32Array(w * h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      scores[y * w + ii] = rotationScore(
        uh.values[k],
        lowOk ? uhLow!.values[k] : 0,
        sdiOk ? sdi!.values[k] : 0,
      );
    }
  }

  // 2) Nachbarschafts-Glättung (§0.3) — dämpft Einzelpixel, erhält Flächen + NaN-Maske.
  const smooth = smoothScores(scores, w, h);

  // 3) Rasterisieren: R = Score/100, A = Maske.
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const span = ROTATION_VMAX - ROTATION_VMIN; // 100
  for (let p = 0; p < w * h; p++) {
    const s = smooth[p];
    const idx = p * 4;
    if (!Number.isFinite(s)) { img.data[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
    img.data[idx] = Math.round(clamp01((s - ROTATION_VMIN) / span) * 255);
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt das native ICON-D2-Rotationspotenzial-Gitter des jüngsten Laufs (1–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Rotation(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Rotation) => void,
): Promise<IconD2Rotation> {
  // uh_max ist der Rotations-/Domänenanker & immer publizierter Param → löst Lauf/Steps auf.
  const { runStr, runAt, steps } = await resolveLatestRun('uh_max', signal);
  // Intervall-Maximum → Analyse-Schritt 0 degeneriert überspringen (minStepHours=1).
  const wanted = steps.filter((s) => s >= 1 && s <= MAX_STEP);
  if (wanted.length === 0) throw new Error('ICON-D2 Rotation: keine Schritte im Horizont');

  // Ein uh_max-Feld für Bounds/Grid/Subsampling sicher holen.
  const gridRef = await fetchStepField(runStr, 'uh_max', wanted[0], signal, D2_GRIB_PROXY_BASE);
  const c = gribCorners(gridRef); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));

  const frames: IconD2RotationFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // Die drei Felder desselben Laufs/Schritts parallel. uh_max_low/sdi_2 dürfen
      // fehlen (→ als 0 behandelt); uh_max ist Pflicht (Rotations-/Domänenanker).
      const [uh, uhLow, sdi] = await Promise.all([
        fetchStepField(runStr, 'uh_max', step, signal, D2_GRIB_PROXY_BASE),
        fetchStepField(runStr, 'uh_max_low', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
        fetchStepField(runStr, 'sdi_2', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
      ]);
      frames.push({
        validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step,
        ...buildRotationImage(uh, uhLow, sdi, ss),
      });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: ROTATION_VMIN, vMax: ROTATION_VMAX });
    } catch {
      // uh_max des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
    }
  };

  // Bounded-Concurrency-Pump über die Schritte (je Schritt 3 Felder).
  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (frames.length === 0) throw new Error('ICON-D2 Rotation: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: ROTATION_VMIN, vMax: ROTATION_VMAX };
}
