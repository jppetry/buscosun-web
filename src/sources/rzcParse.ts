/**
 * MeteoSwiss rzc — der REINE Parser der ODIM-HDF5-Datei (LE2/H3).
 *
 * Herausgelöst aus `meteoSwissRadar.ts`, damit derselbe Code im Worker
 * (`hdf5Worker.ts`) UND als Hauptthread-Rückfall läuft. DOM-frei.
 *
 * Format: ODIM-HDF5. `dataset1/data1/data` = Regenrate in mm/h (gain 1,
 * offset 0, NaN = außerhalb der Abdeckung, 0 = kein Regen). `/where` liefert
 * die 4 WGS84-Ecken (Gitter ist Swiss-LV95/`somerc`). Daten sind north-up
 * (Zeile 0 = Nord) — kein Flip nötig.
 */

import { File as H5File } from 'jsfive';
import { precipToU8, type QuadCorners } from '../scalar/RainLayer';

export interface RzcParsed {
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
  /** Validitätszeit (ms UTC) aus `/what`; `null`, wenn die Datei keine trägt. */
  validAtMs: number | null;
}

export function parseRzcHdf5(buf: ArrayBuffer): RzcParsed {
  const f = new H5File(buf, 'rzc.h5');
  const where = (f.get('where') as { attrs: Record<string, number> }).attrs;
  const width = where.xsize;
  const height = where.ysize;
  const ds = f.get('dataset1/data1/data') as { value: ArrayLike<number> };
  const rate = ds.value; // mm/h, row-major, Zeile 0 = Nord (ODIM)

  const values = new Uint8Array(width * height);
  for (let k = 0; k < values.length; k++) values[k] = precipToU8(rate[k]);

  // Ecken: [NW, NE, SE, SW] = [UL, UR, LR, LL] (RainLayer-Reihenfolge).
  const corners: QuadCorners = [
    [where.UL_lon, where.UL_lat],
    [where.UR_lon, where.UR_lat],
    [where.LR_lon, where.LR_lat],
    [where.LL_lon, where.LL_lat],
  ];

  // Validitätszeit aus /what (date/time, UTC).
  let validAtMs: number | null = null;
  try {
    const what = (f.get('what') as { attrs: Record<string, unknown> }).attrs;
    const date = String(what.date); // YYYYMMDD
    const time = String(what.time).padStart(6, '0'); // HHMMSS
    const t = Date.UTC(
      +date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8),
      +time.slice(0, 2), +time.slice(2, 4),
    );
    if (Number.isFinite(t)) validAtMs = t;
  } catch { /* Fallback: Aufrufer nimmt „jetzt" */ }

  return { values, width, height, corners, validAtMs };
}
