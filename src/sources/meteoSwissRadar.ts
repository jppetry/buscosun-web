/**
 * MeteoSwiss — Radar-Niederschlag `RR` (rzc, Regenrate) für die Schweiz.
 *
 * Das offene MeteoSwiss-Nowcasting (INCA, 0–6 h Vorhersage) ist in der OGD
 * (Collection `ch.meteoschweiz.ogd-nowcasting`) aktuell NICHT als Grid
 * publiziert. Verfügbar ist das Radar-Analyseprodukt `rzc` (Produktcode `RR`,
 * Regenrate, 1 km / 5 min) — das CH-Pendant zur DE-RADOLAN-RY-Analyse. Es
 * liefert nur „jetzt"/Vergangenheit, KEINEN Forecast; die 0–6 h-Vorhersage über
 * der Schweiz kommt daher aus ICON-D2 (deckt CH geografisch ab).
 *
 * Quelle (CC BY 4.0, kein Key, CORS-frei):
 *   STAC-Tagesitem `…/ogd-radar-precip/items/<YYYYMMDD>-ch` listet alle
 *   5-Min-Assets; die rzc-Dateien liegen direkt unter
 *   `data.geo.admin.ch/ch.meteoschweiz.ogd-radar-precip/<YYYYMMDD>-ch/rzc….h5`.
 *
 * Format: ODIM-HDF5. `dataset1/data1/data` = Regenrate in mm/h (gain 1,
 * offset 0, NaN = außerhalb der Abdeckung, 0 = kein Regen). `/where` liefert
 * die 4 WGS84-Ecken (Gitter ist Swiss-LV95/`somerc`). Daten sind north-up
 * (Zeile 0 = Nord) — kein Flip nötig.
 */

import { File as H5File } from 'jsfive';
import { precipToU8, type QuadCorners } from '../scalar/RainLayer';

const STAC_ITEM = (day: string) =>
  `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;

export const METEOSWISS_RADAR_ATTRIBUTION =
  'Radar: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> ' +
  'rzc (RR) · CC BY 4.0';

export interface RadarFrame {
  values: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
  validAt: Date;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

/** Liefert die href des jüngsten rzc-Assets aus dem STAC-Tagesitem (heute, sonst gestern). */
async function resolveLatestRzcHref(signal?: AbortSignal): Promise<string> {
  const now = new Date();
  for (const day of [utcDay(now), utcDay(new Date(now.getTime() - 24 * 3600_000))]) {
    let res: Response;
    try {
      res = await fetch(STAC_ITEM(day), { signal });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const item = (await res.json()) as { assets?: Record<string, { href: string }> };
    const rzc = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
    if (rzc.length) return item.assets![rzc[rzc.length - 1]].href;
  }
  throw new Error('MeteoSwiss rzc: kein Asset gefunden');
}

/** Lädt den jüngsten rzc-Frame, dekodiert das HDF5 und baut das Uint8-Werte-Grid. */
export async function fetchRzcLatest(signal?: AbortSignal): Promise<RadarFrame> {
  const href = await resolveLatestRzcHref(signal);
  const res = await fetch(href, { signal });
  if (!res.ok) throw new Error(`MeteoSwiss rzc fetch: ${res.status}`);
  const buf = await res.arrayBuffer();

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
  let validAt = new Date();
  try {
    const what = (f.get('what') as { attrs: Record<string, unknown> }).attrs;
    const date = String(what.date); // YYYYMMDD
    const time = String(what.time).padStart(6, '0'); // HHMMSS
    validAt = new Date(Date.UTC(
      +date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8),
      +time.slice(0, 2), +time.slice(2, 4),
    ));
  } catch { /* Fallback: jetzt */ }

  return { values, width, height, corners, validAt };
}
