/**
 * MeteoSchweiz — **Hagel-Radarprodukte** POH und MESHS (Collection
 * `ch.meteoschweiz.ogd-radar-hail`, CC BY 4.0, kein Key, CORS `*`).
 *
 *   POH  (`bzc…h5`, `quantity=POH`)  — Hagel*wahrscheinlichkeit*, **Anteil 0…1**
 *                                      (Waldvogel: 45-dBZ-Echotop − Nullgradgrenze)
 *   MESHS(`mzc…h5`, `quantity=MESH`) — **maximal erwartete Korngröße, `unit=mm`**
 *                                      (Treloar: 50-dBZ-Echotop − Nullgradgrenze)
 *
 * ⚠️ Zwei an der Datei gemessene Korrekturen gegenüber `docs/DATA_SOURCES.md` §5.1 H1
 * (Beleg: `audit/hagel.md` §2, Abruf 2026-08-05):
 *  - **MESHS ist mm, nicht cm.** Wer cm annimmt, zeigt Korngrößen 10× zu groß.
 *  - **POH ist ein Anteil 0…1, keine Prozentzahl.** Anzeige braucht ×100.
 *
 * Transport identisch zu `meteoSwissRadar.ts` (rzc): STAC-Tagesitem listet alle
 * 5-Minuten-Assets, die Ecken stehen als WGS84 in `/where` — es ist **keine**
 * Reprojektion des `somerc`-Gitters nötig, die Karte warpt über die vier Ecken.
 *
 * Saisonalität: Die Produkte laufen **1. April – 30. September**. Außerhalb
 * existieren die Dateien, enthalten aber keine Daten — das UI sagt „außerhalb der
 * Hagelsaison", nie „kein Hagel" (D-04).
 */

import { File as H5File } from 'jsfive';
import type { QuadCorners } from '../scalar/RainLayer';

const STAC_ITEM = (day: string) =>
  `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-hail/items/${day}-ch`;

export const METEOSWISS_HAIL_ATTRIBUTION =
  'Hagel CH: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> ' +
  'POH · MESHS · CC BY 4.0';

/** `meshs` = erwartete Korngröße (mm), `poh` = Hagelwahrscheinlichkeit (0…1). */
export type HailProduct = 'meshs' | 'poh';

/** Asset-Präfix je Produkt (im STAC-Tagesitem). */
const ASSET_PREFIX: Record<HailProduct, string> = { meshs: 'mzc', poh: 'bzc' };

export interface HailRaster {
  product: HailProduct;
  /** Rohwerte in Produkteinheit (MESHS mm · POH 0…1). `NaN` = außerhalb der Abdeckung. */
  values: Float32Array;
  width: number;
  height: number;
  /** [NW, NE, SE, SW] in WGS84 — direkt aus `/where` der Datei. */
  corners: QuadCorners;
  /** Messzeit aus `/what` (UTC) — NICHT die Abrufzeit (V-19). */
  validAt: Date;
  /** Größter endlicher Wert im Bild (0 = nichts erkannt; das ist ein Ergebnis, kein Fehler). */
  max: number;
  /** Dateiname des benutzten Assets (Statuszeile/Debug). */
  file: string;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

/**
 * Hagelsaison der CH-Produkte: 1. April bis 30. September (UTC-Monate 4…9).
 * Rein, damit der Verifier sie ohne Uhr prüfen kann.
 */
export function isSwissHailSeason(d: Date): boolean {
  const m = d.getUTCMonth() + 1;
  return m >= 4 && m <= 9;
}

/** href + Name des jüngsten Assets des Produkts (heute, sonst gestern). */
async function resolveLatestHref(
  product: HailProduct, signal?: AbortSignal,
): Promise<{ href: string; name: string }> {
  const prefix = ASSET_PREFIX[product];
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
    // Die Assetnamen tragen die Zeit (`bzc262172130vl.845.h5`) und sind damit
    // lexikografisch = chronologisch sortierbar.
    const names = Object.keys(item.assets ?? {}).filter((k) => k.startsWith(prefix)).sort();
    if (names.length) {
      const name = names[names.length - 1];
      return { href: item.assets![name].href, name };
    }
  }
  throw new Error(`MeteoSchweiz ${product}: kein Asset gefunden`);
}

/**
 * ODIM-HDF5 → `HailRaster`. **Rein** (kein Netz, kein DOM), damit
 * `scripts/verify-hail.mjs` genau diese Funktion gegen echte Fixtures fahren
 * kann (D-12) — dieselbe Funktion, die im Browser läuft.
 *
 * **Ein flächendeckend leeres Bild ist kein Fehler** — an einem hagelfreien Tag
 * ist genau das die richtige Antwort (`max === 0`).
 */
export function decodeSwissHail(buf: ArrayBuffer, product: HailProduct, name: string): HailRaster {
  const f = new H5File(buf, name);
  const where = (f.get('where') as { attrs: Record<string, number> }).attrs;
  const width = where.xsize;
  const height = where.ysize;

  const ds = f.get('dataset1/data1/data') as { value: ArrayLike<number> };
  const raw = ds.value;
  // gain/offset stehen in der Datei und sind bei beiden Produkten 1/0; sie werden
  // trotzdem gelesen, statt sie zu unterstellen.
  const dataWhat = (f.get('dataset1/data1/what') as { attrs: Record<string, unknown> }).attrs;
  const gain = Number(dataWhat.gain ?? 1) || 1;
  const offset = Number(dataWhat.offset ?? 0) || 0;

  const values = new Float32Array(width * height);
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const v = raw[i];
    // `nodata` ist in beiden Produkten NaN (gemessen) — außerhalb der Abdeckung.
    if (!Number.isFinite(v)) { values[i] = NaN; continue; }
    const phys = v * gain + offset;
    values[i] = phys;
    if (phys > max) max = phys;
  }

  const corners: QuadCorners = [
    [where.UL_lon, where.UL_lat],
    [where.UR_lon, where.UR_lat],
    [where.LR_lon, where.LR_lat],
    [where.LL_lon, where.LL_lat],
  ];

  let validAt = new Date();
  try {
    const what = (f.get('what') as { attrs: Record<string, unknown> }).attrs;
    const date = String(what.date);
    const time = String(what.time).padStart(6, '0');
    validAt = new Date(Date.UTC(
      +date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8),
      +time.slice(0, 2), +time.slice(2, 4),
    ));
  } catch { /* Fallback: jetzt */ }

  return { product, values, width, height, corners, validAt, max, file: name };
}

/** Lädt den jüngsten POH- bzw. MESHS-Frame und dekodiert ihn. */
export async function fetchSwissHail(product: HailProduct, signal?: AbortSignal): Promise<HailRaster> {
  const { href, name } = await resolveLatestHref(product, signal);
  const res = await fetch(href, { signal });
  if (!res.ok) throw new Error(`MeteoSchweiz ${product}: ${res.status}`);
  return decodeSwissHail(await res.arrayBuffer(), product, name);
}
