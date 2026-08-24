/**
 * GeoSphere Austria — INCA Nowcast als GITTER für den Niederschlags-Layer (AT).
 *
 * INCA ist das offizielle alpine Nowcasting-System: 1 km / 15 min, Horizont
 * 0–3 h, Update alle 15 min. CC BY 4.0, kein API-Key.
 *
 * Quelle (Grid-API, NetCDF):
 *   https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km
 *     ?parameters=rr&output_format=netcdf&bbox=<lat,lon,lat,lon>
 *   - `bbox` ist Pflicht (sonst HTTP 422). Wir verwenden die INCA-Extent knapp
 *     innen (Boundary-Rejection-Quirk wie beim timeseries-Endpoint).
 *   - Antwort = EIN NetCDF-4 (HDF5) mit allen 12 Lead-Frames (+0.25…+3 h).
 *
 * Format-Eigenheiten (verifiziert 2026-05):
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
import { shareInFlight } from './shareInFlight';

const GRID_URL =
  'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km';
// INCA-Extent [45.503..49.478, 8.098..17.742], ein paar Hundertstel innen.
const BBOX = '45.51,8.11,49.47,17.73';
const RR_SCALE = 0.01; // kg m-2 pro int16-Zähler (jsfive liest die Attribute nicht)
const RR_FILL = -999;
const PER_STEP_TO_MMH = 4; // 15-min-Summe → mm/h

export interface IncaFrame {
  /** Vorlaufzeit in Stunden (0.25 … 3.0). */
  leadHours: number;
  /** Kompaktes Werte-Grid (1 Byte/Zelle, north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface IncaGrid {
  frames: IncaFrame[];
  corners: QuadCorners;
}

export const GEOSPHERE_INCA_ATTRIBUTION =
  'Nowcast: <a href="https://www.geosphere.at" target="_blank" rel="noopener">GeoSphere Austria</a> ' +
  'INCA (RR) · CC BY 4.0';

/** Lädt den jüngsten INCA-Nowcast-Lauf und baut Uint8-Werte-Grids (0.25–3 h). */
export async function fetchIncaGrid(signal?: AbortSignal): Promise<IncaGrid> {
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig, und die
  // GeoSphere-API sendet keinen Cache-Header — gemessen 2 × 721 713 B, also 34 %
  // der gesamten AT-Kaltsitzung (`audit/bandbreite.md` §24.3).
  return shareInFlight('geosphere-inca-grid', () => loadIncaGrid(), signal);
}

async function loadIncaGrid(): Promise<IncaGrid> {
  const url = `${GRID_URL}?parameters=rr&output_format=netcdf&bbox=${BBOX}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoSphere INCA grid: ${res.status}`);
  const buf = await res.arrayBuffer();

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

  const frames: IncaFrame[] = [];
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
  if (frames.length === 0) throw new Error('GeoSphere INCA: keine Frames');
  return { frames, corners };
}
