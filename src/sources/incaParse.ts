/**
 * GeoSphere INCA — der REINE Parser des NetCDF-4/HDF5-Grids (LE2/H3).
 *
 * Herausgelöst aus `geosphereIncaGrid.ts`, damit derselbe Code im Worker
 * (`hdf5Worker.ts`) UND als Hauptthread-Rückfall läuft — Bytes hinein, fertige
 * `Uint8Array`-Frames heraus. DOM-frei (kein `document`/`window`/`fetch`);
 * `precipToU8` stammt aus `RainLayer` wie schon im `radolanWorker`.
 *
 * Format-Eigenheiten (verifiziert 2026-05, Kommentar von dort übernommen):
 *   - NetCDF-4 ⇒ HDF5 ⇒ mit `jsfive` lesbar (kein separater NetCDF-Parser).
 *   - `rr` (12, ny, nx) int16, „precipitation sum" je 15-min-Schritt in
 *     kg m-2 (= mm). jsfive liefert KEINE Variablen-Attribute, daher sind
 *     scale_factor (0.01) und _FillValue (-999) als stabile Produktkonstanten
 *     hartkodiert. mm/h = Rohwert · 0.01 · 4.
 *   - `lat`/`lon` (ny, nx) float32 — Zellkoordinaten (Gitter ist Lambert
 *     EPSG:31287, also nicht achsparallel). Wir entnehmen die 4 Eckzellen und
 *     geben ihre AUSSENKANTEN aus (`cellCentersToEdges`, halbe Zelle) — die
 *     Projektion selbst steht in `geosphereIncaGeo.ts`.
 *   - `leadtime` (12,) in Stunden [0.25 … 3.0].
 *   - Zeile 0 = Süden ⇒ wir flippen für north-up (RainLayer-Konvention).
 */

import { File as H5File } from 'jsfive';
import { precipToU8, type QuadCorners } from '../scalar/RainLayer';
import { cellCentersToEdges } from './geosphereIncaGeo';

export const RR_SCALE = 0.01; // kg m-2 pro int16-Zähler (jsfive liest die Attribute nicht)
export const RR_FILL = -999;
export const PER_STEP_TO_MMH = 4; // 15-min-Summe → mm/h

export interface IncaParsedFrame {
  /** Vorlaufzeit in Stunden (0.25 … 3.0). */
  leadHours: number;
  /** Kompaktes Werte-Grid (1 Byte/Zelle, north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface IncaParsed {
  frames: IncaParsedFrame[];
  corners: QuadCorners;
}

/**
 * Parst die NetCDF-Bytes eines INCA-Laufs. Liefert 0 Frames, wenn die API einen
 * leeren Lauf schickt (V-RL-2) — die Entscheidung „Fehler oder Rückfall" trifft
 * der Aufrufer (`geosphereIncaGrid.ts`), nicht der Parser.
 */
export function parseIncaNetcdf(buf: ArrayBuffer): IncaParsed {
  const f = new H5File(buf, 'inca.nc');
  const rr = f.get('rr') as { shape: number[]; value: ArrayLike<number> };
  const [nt, ny, nx] = rr.shape;
  const v = rr.value;
  const lead = (f.get('leadtime') as { value: ArrayLike<number> }).value;
  const lat = (f.get('lat') as { value: ArrayLike<number> }).value;
  const lon = (f.get('lon') as { value: ArrayLike<number> }).value;

  const at = (r: number, c: number) => r * nx + c;
  // north-up Ecken [NW, NE, SE, SW]; Datenzeile 0 = Süden ⇒ Nord = Zeile ny-1.
  // `lat`/`lon` sind ZELLMITTELPUNKTE. Ausgegeben werden die AUSSENKANTEN des
  // Gitters (je halbe Zelle nach außen, in Lambert gerechnet) — dieselbe
  // Konvention wie RADOLAN und rzc. Nur so meinen Kartenraster, Komposit und
  // Punktabfrage dieselbe Zelle; vorher wichen sie um eine halbe Zelle ab
  // (RP2, s. `audit/radar-punktverortung.md` §11).
  const centers: QuadCorners = [
    [lon[at(ny - 1, 0)], lat[at(ny - 1, 0)]],
    [lon[at(ny - 1, nx - 1)], lat[at(ny - 1, nx - 1)]],
    [lon[at(0, nx - 1)], lat[at(0, nx - 1)]],
    [lon[at(0, 0)], lat[at(0, 0)]],
  ];
  const corners: QuadCorners = cellCentersToEdges(centers, nx, ny);

  const frames: IncaParsedFrame[] = [];
  for (let t = 0; t < nt; t++) {
    const base = t * ny * nx;
    const values = new Uint8Array(nx * ny);
    for (let r = 0; r < ny; r++) {
      const dstRow = (ny - 1 - r) * nx; // Süd→Nord flippen
      const srcRow = base + r * nx;
      for (let c = 0; c < nx; c++) {
        const raw = v[srcRow + c];
        const mmph = raw === RR_FILL ? NaN : raw * RR_SCALE * PER_STEP_TO_MMH;
        values[dstRow + c] = precipToU8(mmph);
      }
    }
    frames.push({ leadHours: lead[t], values, width: nx, height: ny });
  }
  return { frames, corners };
}
