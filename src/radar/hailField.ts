/**
 * Hagel-Layer (Phase HA1) — reine Darstellungs- und Aufbereitungslogik.
 *
 * Zwei Quellen, zwei Aussagen, bewusst **nicht** vermischt (D-04):
 *   CH — MeteoSchweiz **MESHS** (erwartete max. Korngröße, **mm**) bzw. **POH**
 *        (Hagelwahrscheinlichkeit, Anteil 0…1) als Raster → RGBA für eine
 *        MapLibre-`image`-Source (Ecken-Warp, kein Shader).
 *   DE — DWD **KONRAD3D**: Zellen mit `hail_flag > 0` als GeoJSON-Fläche, mit
 *        Hagelfläche, Großhagelfläche und Hagel-Echotop aus dem `hymec`-Block.
 *
 * Alles hier ist rein und headless prüfbar (D-12): keine Karte, kein DOM, keine
 * Uhr, kein Netz. Der Verifier `scripts/verify-hail.mjs` fährt genau diese
 * Funktionen gegen echte Fixtures.
 */

import type { Konrad3dCell, Konrad3dRun } from './konrad3d';
import type { HailProduct } from '../sources/meteoSwissHail';

/** Farbstufe: ab `v` (Produkteinheit) gilt `rgba`. Aufsteigend sortiert. */
export interface HailStop { v: number; rgba: [number, number, number, number] }

/**
 * MESHS in **mm**. MeteoSchweiz gibt das Produkt ab ~2 cm aus; die Stufen folgen
 * der üblichen Schadensstaffel (2 cm Blüten/Lack · 3 cm Karosserie · 4 cm Dach ·
 * ≥ 5 cm Großhagel). Bewusst eigene, von Regen/Radar klar getrennte Palette:
 * Eisblau → Türkis → Amber → Rot → Violett.
 */
export const MESHS_STOPS: HailStop[] = [
  { v: 20, rgba: [150, 205, 235, 205] },
  { v: 30, rgba: [ 90, 190, 190, 220] },
  { v: 40, rgba: [235, 175,  60, 230] },
  { v: 50, rgba: [205,  75,  55, 240] },
  { v: 60, rgba: [140,  45, 120, 245] },
];

/** POH als **Anteil 0…1** (nicht %). Unter 10 % bleibt es transparent — darunter
 *  ist das Produkt Rauschen und würde eine Aussage vortäuschen. */
export const POH_STOPS: HailStop[] = [
  { v: 0.1, rgba: [180, 215, 240, 150] },
  { v: 0.3, rgba: [120, 190, 210, 185] },
  { v: 0.5, rgba: [235, 190,  85, 215] },
  { v: 0.7, rgba: [215, 105,  60, 235] },
  { v: 0.9, rgba: [140,  45, 120, 245] },
];

export function stopsFor(product: HailProduct): HailStop[] {
  return product === 'meshs' ? MESHS_STOPS : POH_STOPS;
}

/** Kleinster Wert, ab dem überhaupt gezeichnet wird. */
export function hailFloor(product: HailProduct): number {
  return stopsFor(product)[0].v;
}

/** Farbe für einen physikalischen Wert; `null` = nichts zeichnen. */
export function hailColor(product: HailProduct, value: number): [number, number, number, number] | null {
  if (!Number.isFinite(value)) return null;
  const stops = stopsFor(product);
  if (value < stops[0].v) return null;
  let hit = stops[0];
  for (const s of stops) if (value >= s.v) hit = s;
  return hit.rgba;
}

/**
 * Raster → RGBA (row-major, Zeile 0 = Nord, wie ODIM liefert).
 * `NaN` (außerhalb der Radarabdeckung) und Werte unter der Schwelle werden
 * vollständig transparent — eine leere Fläche heißt „nichts erkannt", nicht „0".
 */
export function hailRasterToRGBA(
  values: ArrayLike<number>, width: number, height: number, product: HailProduct,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const c = hailColor(product, values[i]);
    if (!c) continue;
    const o = i * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
  }
  return out;
}

/** Legenden-Enden je Produkt (klein/groß) — hält Legende und Palette zusammen. */
export function hailLegendEnds(product: HailProduct): [string, string] {
  return product === 'meshs' ? ['2 cm', '≥ 6 cm'] : ['10 %', '≥ 90 %'];
}

/** MESHS-Wert (mm) → Anzeigetext in cm, deutsche Dezimaltrennung. */
export function meshsLabel(mm: number): string {
  if (!Number.isFinite(mm) || mm <= 0) return 'kein Hagel erwartet';
  return `${(mm / 10).toFixed(1).replace('.', ',')} cm`;
}

/** POH-Anteil (0…1) → Prozenttext. */
export function pohLabel(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return 'keine Hagelwahrscheinlichkeit';
  return `${Math.round(fraction * 100)} %`;
}

// ---------------------------------------------------------------------------
// Deutschland: KONRAD3D-Zellen mit Hagel
// ---------------------------------------------------------------------------

export interface HailCellProperties {
  id: number;
  /** `hail_flag` 0/1/2 — steuert die Farbe. */
  flag: number;
  /** Fläche mit Hagelsignal (km²) bzw. mit **Groß**hagelsignal (km²). */
  areaHail: number | null;
  areaLargeHail: number | null;
  echoTopHail: number | null;
  dbzMax: number | null;
  refMs: number;
  headline: string;
  detail: string;
}

/** Hat die Zelle ein Hagelsignal? */
export function hasHail(cell: Konrad3dCell): boolean {
  return (cell.hailFlag ?? 0) > 0 || (cell.largeHailAreaKm2 ?? 0) > 0 || (cell.hailAreaKm2 ?? 0) > 0;
}

/**
 * Kurzzeile einer Hagelzelle — konservative Wortwahl (D-19).
 * „Radar erkennt Hagel", nie „es hagelt", nie „Warnung"/„Gefahr"/„Unwetter".
 */
export function hailCellHeadline(cell: Konrad3dCell): string {
  const large = (cell.largeHailAreaKm2 ?? 0) > 0 || (cell.hailFlag ?? 0) >= 2;
  const head = large ? 'Radar erkennt Hagel, Hinweis auf Großhagel' : 'Radar erkennt Hagel in der Zelle';
  return `Zelle ${cell.id} · ${head}`;
}

/** Zweite Zeile: die belegten Größen, jede nur wenn vorhanden. */
export function hailCellDetail(cell: Konrad3dCell): string {
  const parts: string[] = [];
  if ((cell.hailAreaKm2 ?? 0) > 0) parts.push(`Hagelfläche ~${Math.round(cell.hailAreaKm2 as number)} km²`);
  if ((cell.largeHailAreaKm2 ?? 0) > 0) parts.push(`davon Großhagel ~${Math.round(cell.largeHailAreaKm2 as number)} km²`);
  if (cell.hailEchoTopM != null) parts.push(`Hagel-Obergrenze ~${(Math.round(cell.hailEchoTopM / 100) / 10).toFixed(1).replace('.', ',')} km`);
  return parts.join(' · ');
}

/**
 * Lauf → GeoJSON **nur der Hagelzellen** (Umriss + Klickpunkt).
 * Ohne Zugspur und ohne Unsicherheits-Trichter — das ist der Zellbahnen-Layer;
 * hier geht es um „wo ist Hagel und wie groß", nicht um „wohin zieht die Zelle".
 */
export function buildHailCellFeatures(run: Konrad3dRun): GeoJSON.FeatureCollection {
  const areas: GeoJSON.Feature[] = [];
  const dots: GeoJSON.Feature[] = [];

  for (const cell of run.cells) {
    if (!hasHail(cell)) continue;
    const props: HailCellProperties = {
      id: cell.id,
      flag: cell.hailFlag ?? ((cell.largeHailAreaKm2 ?? 0) > 0 ? 2 : 1),
      areaHail: cell.hailAreaKm2,
      areaLargeHail: cell.largeHailAreaKm2,
      echoTopHail: cell.hailEchoTopM,
      dbzMax: cell.dbzMax,
      refMs: cell.refMs,
      headline: hailCellHeadline(cell),
      detail: hailCellDetail(cell),
    };

    if (cell.hull.length >= 3) {
      const first = cell.hull[0];
      const last = cell.hull[cell.hull.length - 1];
      const ring = first[0] === last[0] && first[1] === last[1] ? cell.hull : [...cell.hull, first];
      areas.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { ...props, kind: 'area' },
      });
    }
    dots.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] },
      properties: { ...props, kind: 'dot' },
    });
  }

  return { type: 'FeatureCollection', features: [...areas, ...dots] };
}
