/**
 * Punktabtastung von Radar-Frames — die EINE Stelle, die weiß, in welchem Raum
 * das jeweilige Landesgitter regulär ist und was seine Ecken bezeichnen
 * (RP1 = DE, RP2 = AT + CH; s. `audit/radar-punktverortung.md`).
 *
 * Vorher rief jeder Aufrufer `sampleRadarQuad` direkt auf und interpolierte
 * damit linear in lon/lat. Alle drei Landesgitter sind aber projiziert, keines
 * ist in lon/lat regulär — die Punktabfrage las dadurch einen anderen Ort, als
 * die Karte zeichnet: **DE 13–36 km**, **AT 5–11 km**, **CH 7–8 km**. Wer hier
 * durchgeht, verortet automatisch so wie die Karte.
 *
 * Gitterlage je Quelle (jeweils am Datenfeld verifiziert, s. die Geo-Module):
 *
 * | Quelle | Projektion | Ecken |
 * |---|---|---|
 * | `radolan_rv` (DE1200) | polar-stereografisch, `psFwd` | Außenkanten (1100 km / 1100 Zellen) |
 * | `inca_grid` (AT) | Lambert EPSG:31287-Geometrie auf WGS84, `incaFwd` | Außenkanten (beim Laden aus den Zellmitten gerechnet) |
 * | `meteoswiss_rzc` (CH) | LV95/somerc laut `/where.projdef`, `rzcFwd` | Außenkanten (710 km / 710 Zellen) |
 */

import { psFwd } from '../sources/radolanGeo';
import { incaFwd } from '../sources/geosphereIncaGeo';
import { rzcFwd } from '../sources/meteoSwissGeo';
import { sampleRadarQuad, type CellAnchor, type ProjectXY } from './quadSampler';
import type { QuadCorners } from '../scalar/RainLayer';

/** Quellen-Kennung der Radar-Gitter (deckungsgleich mit `radar/radarFrames.ts`). */
export type RadarGridSource = 'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc';

interface GridGeometry {
  /** Vorwärtsprojektion in den Raum, in dem das Gitter regulär ist. */
  project: ProjectXY;
  /** Was die vier Ecken bezeichnen (halbe Zelle Unterschied). */
  anchor: CellAnchor;
}

/** Gitterlage je Quelle — die einzige Stelle, an der diese Zuordnung getroffen wird. */
const GEOMETRY: Record<RadarGridSource, GridGeometry> = {
  radolan_rv:     { project: psFwd,   anchor: 'edge' },
  inca_grid:      { project: incaFwd, anchor: 'edge' },
  meteoswiss_rzc: { project: rzcFwd,  anchor: 'edge' },
};

/** Vorwärtsprojektion des Quellgitters. */
export function projectionFor(source: RadarGridSource): ProjectXY {
  return GEOMETRY[source].project;
}

/** Eck-Konvention des Quellgitters (`'center'` = Zellmitten, `'edge'` = Außenkanten). */
export function anchorFor(source: RadarGridSource): CellAnchor {
  return GEOMETRY[source].anchor;
}

/**
 * Sampelt ein Radar-Werte-Grid der gegebenen Quelle an (lat, lon) — mm/h, `0`
 * für „kein Niederschlag", `null` außerhalb des Gitters. Das Grid darf gröber
 * sein als das Originalraster (z. B. das Flow-Gitter der PoP-Berechnung),
 * solange es dieselbe Fläche abdeckt.
 */
export function sampleRadarPoint(
  source: RadarGridSource,
  values: Uint8Array, width: number, height: number,
  corners: QuadCorners, lat: number, lon: number,
  vMax = 20,
): number | null {
  const g = GEOMETRY[source];
  return sampleRadarQuad(values, width, height, corners, lat, lon, vMax, g.project, g.anchor);
}
