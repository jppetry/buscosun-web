/**
 * Pure (DOM-freier) Kern des generischen ICON-D2-Gitter-Loaders (fetchIconD2Grid
 * in iconD2Precip.ts): GRIB2-Decode + Akkumulations-Differenz + Uint8-
 * Quantisierung — extrahiert, damit derselbe Code off-main im gribGridWorker
 * läuft. Vorher liefen `decodeGrib2` (~15-50 ms/Feld, ICON-D2-Gitter 1215×746)
 * UND die O(ni·nj)-Diff/Quantisierungs-Schleife auf dem Main Thread; über die
 * ~27 Schritte von Niederschlag/Wolken/CAPE kumuliert das zu ~1,5-2,5 s
 * blockiertem Main Thread (gemessen, 4×-CPU-Throttle) — trotz eines
 * Main-Thread-Yields pro Konsumenten-Schritt, weil mehrere Fetches parallel
 * (FETCH_CONCURRENCY) auflösen und ihre Decode-Callbacks als Mikrotasks
 * hintereinander laufen, BEVOR der nächste Yield greift.
 */

import { decodeGrib2, gribCorners, type GribField } from './gribDecode';
import { precipToU8, cloudToU8, capeToU8 } from '../scalar/RainLayer';

/** Welche physikalische Uint8-Quantisierung anzuwenden ist — Funktionen sind
 *  nicht strukturiert klonbar, daher ein Diskriminator statt eines Callbacks. */
export type GridToU8Kind = 'precip' | 'cloud' | 'cape';

function pickToU8(kind: GridToU8Kind): (value: number) => number {
  if (kind === 'precip') return precipToU8;
  if (kind === 'cloud') return cloudToU8;
  return capeToU8;
}

export interface DecodedGridStep {
  /** Kompaktes Uint8-Werte-Grid (north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
  /** Rohe dekodierte Modell-Werte (Scan-Reihenfolge) — als `ref` für den
   *  NÄCHSTEN Akkumulations-Schritt gebraucht, ohne das Feld erneut zu dekodieren. */
  rawValues: Float32Array;
  corners: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Dekodiert ein GRIB2-Feld + baut das kompakte Werte-Grid — der teure Kern
 * (Decode + O(ni·nj)-Diff/Quantisierung) in einem Aufruf, off-main lauffähig.
 * `refRawValues`: das vorige Schritts-Feld (nur für `accumulate: true` nötig).
 */
export function decodeGridStep(
  bytes: Uint8Array,
  refRawValues: Float32Array | null,
  accumulate: boolean,
  kind: GridToU8Kind,
): DecodedGridStep {
  const field: GribField = decodeGrib2(bytes);
  const corners = gribCorners(field);
  const toU8 = pickToU8(kind);
  const { ni, nj, values: cur } = field;
  const out = new Uint8Array(ni * nj);
  for (let j = 0; j < nj; j++) {
    const dst = (nj - 1 - j) * ni; // S→N → north-up
    const src = j * ni;
    for (let i = 0; i < ni; i++) {
      const raw = accumulate
        ? Math.max(0, cur[src + i] - (refRawValues ? refRawValues[src + i] : 0))
        : cur[src + i];
      out[dst + i] = toU8(raw);
    }
  }
  return { values: out, width: ni, height: nj, rawValues: cur, corners };
}
