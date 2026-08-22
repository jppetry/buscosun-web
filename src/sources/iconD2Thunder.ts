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
import { thunderScore } from '../radar/thunderPotential';

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
export const THUNDER_VMIN = 0;
export const THUNDER_VMAX = 100;

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

let cinSignLogged = false;

/**
 * Baut das RGBA-Werte-Bild eines Schritts aus den drei Roh-Feldern:
 * R = Gewitterpotenzial-Score/100, A = Maske (0 = außerhalb der ICON-D2-Domäne).
 * Domänenanker ist `cape_ml`: ist es dort NaN (Bitmap-Maske, `gribDecode.ts:299`),
 * liefert `thunderScore` NaN → alpha 0 → transparent (nie 0). Grid-Mismatch
 * eines Nebenfeldes → dieses Feld als 0 behandeln (kein Deckel/keine Auslösung).
 */
function buildThunderImage(cape: GribField, cin: GribField | null, lpi: GribField | null, ss: number): Omit<IconD2ThunderFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = cape;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const cinOk = !!cin && cin.ni === ni && cin.nj === nj;
  const lpiOk = !!lpi && lpi.ni === ni && lpi.nj === nj;

  // Dev-Diagnose (einmalig): min/max des dekodierten cin_ml bestätigt die
  // Vorzeichen-Konvention zur Laufzeit (siehe Diagnose §8.2). Die Fusion ist
  // per `Math.abs` bereits vorzeichen-invariant — dies ist nur Beleg.
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

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const span = THUNDER_VMAX - THUNDER_VMIN; // 100
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const score = thunderScore(
        cape.values[k],
        cinOk ? cin!.values[k] : 0,
        lpiOk ? lpi!.values[k] : 0,
      );
      if (!Number.isFinite(score)) { img.data[idx + 3] = 0; continue; } // außerhalb Domäne → transparent
      img.data[idx] = Math.round(((score - THUNDER_VMIN) / span) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { image: canvas, width: w, height: h };
}

/**
 * Lädt das native ICON-D2-Gewitterpotenzial-Gitter des jüngsten Laufs (0–12 h).
 * Progressiv: `onProgress` feuert pro fertigem Frame (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2Thunder(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Thunder) => void,
): Promise<IconD2Thunder> {
  // cape_ml ist der Energieanker & immer publizierte Param → löst Lauf/Steps auf.
  const { runStr, runAt, steps } = await resolveLatestRun('cape_ml', signal);
  const wanted = steps.filter((s) => s <= MAX_STEP);
  if (wanted.length === 0) throw new Error('ICON-D2 Gewitter: keine Schritte im Horizont');

  // Ein cape-Feld für Bounds/Grid/Subsampling sicher holen.
  const gridRef = await fetchStepField(runStr, 'cape_ml', wanted[0], signal, D2_GRIB_PROXY_BASE);
  const ss = Math.max(1, Math.ceil(gridRef.ni / TARGET_WIDTH));
  // Ecken der ABGETASTETEN Punkte statt des nativen Gitters (KL3): der Bau
  // nimmt `min(n-1, k*ss)`, also den ERSTEN Punkt jedes Blocks — ueber
  // `gribCorners` gespannt landete jeder Wert eine halbe Nativzelle zu weit
  // noerdlich (audit/karten-layer-verortung.md, B3).
  const c = subsampledCorners(gridRef, ss); // [NW, NE, SE, SW] in [lon,lat]
  const uvBounds: [number, number, number, number] = [
    lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1]),
  ];

  const frames: IconD2ThunderFrame[] = [];

  const loadStep = async (step: number): Promise<void> => {
    try {
      // Die drei Felder desselben Laufs/Schritts parallel. cin_ml/lpi dürfen
      // fehlen (→ als 0 behandelt); cape_ml ist Pflicht (Energieanker).
      const [cape, cin, lpi] = await Promise.all([
        fetchStepField(runStr, 'cape_ml', step, signal, D2_GRIB_PROXY_BASE),
        fetchStepField(runStr, 'cin_ml', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
        fetchStepField(runStr, 'lpi', step, signal, D2_GRIB_PROXY_BASE).catch(() => null),
      ]);
      frames.push({
        validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step,
        ...buildThunderImage(cape, cin, lpi, ss),
      });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress) onProgress({ runAt, frames: [...frames], uvBounds, vMin: THUNDER_VMIN, vMax: THUNDER_VMAX });
    } catch {
      // cape_ml des Schritts fehlt → Schritt überspringen (Muster Böen/Temp).
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

  if (frames.length === 0) throw new Error('ICON-D2 Gewitter: keine Frames erzeugt');
  return { runAt, frames, uvBounds, vMin: THUNDER_VMIN, vMax: THUNDER_VMAX };
}
