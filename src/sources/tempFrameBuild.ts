/**
 * Pure, DOM-freie Kernlogik des Temperatur-Werte-Bilds: tastet ein decodiertes
 * `t_2m`-Feld (+ die invariante Orographie `hsurf`) auf das Anzeigeraster ab,
 * flippt north-up und kodiert normiert nach RGBA — OHNE Canvas/DOM.
 *
 * Ausgelagert nach dem Muster von `../wind/windFrameBuild.ts`, damit BEIDE
 * Seiten dieselbe Mathematik benutzen statt zwei gleich gemeinter Kopien:
 *   • der Client (`iconD2TempSource.ts`) setzt die Bytes danach nur noch per
 *     (billigem) `putImageData` in ein Canvas,
 *   • der Repack-Producer (`scripts/repack-icon-d2.mjs`, Node) schreibt sie
 *     unverändert in ein PNG.
 * Driften Producer und Client auseinander, zeichnet die Karte andere Werte, als
 * die Punktabfrage nennt — genau die Klasse Fehler, die `audit/karten-layer-
 * verortung.md` beschreibt. Ein gemeinsames Modul macht das Auseinanderdriften
 * strukturell unmöglich; `verify:repack` beweist es je Lauf am Byte.
 *
 * Kanalbelegung (Vertrag mit `ScalarLayer` und `snowLine.ts`):
 *   R = (°C − TEMP_VMIN) / (TEMP_VMAX − TEMP_VMIN), auf 0…255 gerundet
 *   G = hsurf / TEMP_DEM_MAX (ICONs Modell-Orographie = Bezugshöhe von t_2m)
 *   B = 0
 *   A = 255 im Gitter, 0 außerhalb (Bitmap-Maske) — die einzige Stelle, an der
 *       „kein Wert" von „0 °C" unterschieden wird.
 */

import type { GribField } from './gribDecode';

export interface TempRgba {
  /** w·h·4 Bytes, north-up (R = norm. °C, G = norm. hsurf, B = 0, A = Maske). */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Physikalischer Temperaturbereich der Normierung (muss zu MapView TEMP_RANGE passen). */
export const TEMP_VMIN = -20;
export const TEMP_VMAX = 40;
/** Max-Höhe (m), die als 1.0 in Grün-Kanal & DEM kodiert wird (= ScalarLayer demMax). */
export const TEMP_DEM_MAX = 4500;

const KELVIN = 273.15;

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Kelvin → Rot-Kanal-Byte. */
export function tempByte(kelvin: number): number {
  return Math.round(clamp01((kelvin - KELVIN - TEMP_VMIN) / (TEMP_VMAX - TEMP_VMIN)) * 255);
}

/** Höhe (m) → Grün-Kanal-Byte. `NaN` (außerhalb der Domäne) → 0, nicht „Meereshöhe". */
export function hsurfByte(metres: number): number {
  return Number.isFinite(metres) ? Math.round(clamp01(metres / TEMP_DEM_MAX) * 255) : 0;
}

/**
 * Subsamplet NUR die Orographie auf dasselbe Raster wie `buildTempRgba` und
 * gibt eine Graustufen-Ebene zurück (= der Grün-Kanal, ohne Temperaturmaske).
 *
 * Der Repack-Producer schreibt daraus EINE Datei je Lauf statt sie in jeden der
 * 25 Zeitschritte zu kopieren — `hsurf` ist zeitinvariant und (gemessen an drei
 * Läufen, `audit/bandbreite.md` §20) sogar LAUF-invariant. Bewusst ungemaskt:
 * die Maske kommt beim Zusammensetzen aus dem Alpha-Kanal des Zeitschritts,
 * damit das Ergebnis auch dann exakt `buildTempRgba` entspricht, wenn ICON
 * einmal andere Zellen maskiert als im Referenzschritt.
 */
export function buildHsurfGrey(hsurf: GribField, ss: number): { grey: Uint8Array; width: number; height: number } {
  const { ni, nj } = hsurf;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  const grey = new Uint8Array(w * h);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj;
    for (let ii = 0; ii < w; ii++) {
      grey[y * w + ii] = hsurfByte(hsurf.values[sj * ni + Math.min(ni - 1, ii * ss)]);
    }
  }
  return { grey, width: w, height: h };
}

/**
 * Subsamplet `t_2m` (+ `hsurf`) mit Faktor `ss`, flippt north-up und kodiert
 * normiert nach RGBA.
 *
 * Abgetastet wird der ERSTE Punkt jedes Blocks (`min(n−1, k·ss)`) — nicht die
 * Blockmitte. Das ist kein Detail: `subsampledCorners()` spannt die Bounds über
 * genau diese Punkte, damit die Karte jeden Wert auf SEINEM Abtastort zeichnet
 * (KL3). Wer hier die Abtastung ändert, muss dort mitziehen.
 */
export function buildTempRgba(t2m: GribField, hsurf: GribField | null, ss: number): TempRgba {
  const { ni, nj } = t2m;
  const w = Math.ceil(ni / ss);
  const h = Math.ceil(nj / ss);
  // hsurf nur verwenden, wenn es auf DEMSELBEN Gitter liegt — sonst zeigte der
  // Grün-Kanal die Höhe eines anderen Ortes. Fehlt es, bleibt G = 0: der Shader
  // rechnet dann ohne Höhenkorrektur statt mit einer falschen.
  const sameGrid = !!hsurf && hsurf.ni === ni && hsurf.nj === nj;

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss);
    const y = h - 1 - jj; // S→N → north-up (deckt sich mit dem DEM-Bild)
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss);
      const k = sj * ni + si;
      const idx = (y * w + ii) * 4;
      const kelvin = t2m.values[k];
      if (!Number.isFinite(kelvin)) { rgba[idx + 3] = 0; continue; }
      rgba[idx] = tempByte(kelvin);
      rgba[idx + 1] = sameGrid ? hsurfByte(hsurf!.values[k]) : 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 255;
    }
  }
  return { rgba, width: w, height: h };
}
