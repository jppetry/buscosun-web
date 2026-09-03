/**
 * ET — DEM-Abrufe der Terrain-Bühne (Browser-Seite).
 *
 * Die Mathematik lebt in `eventTerrain.ts` (pur); hier steht nur das Beschaffen
 * der Höhen über den vorhandenen Terrarium-Abtaster `sampleElevations`
 * (`src/route/enrichElevation.ts` — Browser-only: createImageBitmap/Canvas).
 * Je Aufgabe genau EIN Abruf-Batch; die Kachel-Deckel sind die E4-Entscheidung
 * aus `audit/event-terrain.md` §7.
 */

import { sampleElevations } from '../route/enrichElevation';
import type { EventZone, ZonePoint } from './eventZone';
import {
  HORIZON_MAX_TILES, ZONE_GRID_MAX_TILES,
  horizonAngles, horizonRayPoints, zoneGrid, zoneTerrainMetrics,
  type ZoneTerrainMetrics,
} from './eventTerrain';

/**
 * ET3: Gelände-Kennzahlen der Zone — ein `sampleElevations`-Aufruf über das
 * Raster. `null` = Höhenmodell nicht erreichbar oder zu lückig (der Aufrufer
 * sagt das, statt still nichts zu zeigen). AbortError wird durchgereicht.
 */
export async function loadZoneTerrain(
  zone: EventZone,
  signal?: AbortSignal,
): Promise<ZoneTerrainMetrics | null> {
  const grid = zoneGrid(zone);
  const elevations = await sampleElevations(grid.points, signal, { maxTiles: ZONE_GRID_MAX_TILES });
  if (!elevations) return null;
  return zoneTerrainMetrics(zone, grid, elevations);
}

/**
 * ET4: Horizontlinie um den Ankerpunkt — ein `sampleElevations`-Aufruf über
 * [Anker, …alle Strahl-Stützen]. Index 0 liefert die Standhöhe, der Rest füllt
 * die Strahlen. `null` bei Totalausfall oder wenn schon der Anker keine Höhe
 * trägt (ohne Standhöhe ist jeder Horizontwinkel erfunden).
 */
export async function loadHorizon(
  origin: ZonePoint,
  signal?: AbortSignal,
): Promise<{ anglesDeg: number[]; originElevM: number } | null> {
  const { rays, distancesM } = horizonRayPoints(origin);
  const flat: ZonePoint[] = [origin];
  for (const ray of rays) flat.push(...ray);
  const elev = await sampleElevations(flat, signal, { maxTiles: HORIZON_MAX_TILES });
  if (!elev) return null;
  const originElevM = elev[0];
  if (!Number.isFinite(originElevM)) return null;
  const perRay = distancesM.length;
  const rayElevations: number[][] = rays.map((_, a) =>
    elev.slice(1 + a * perRay, 1 + (a + 1) * perRay),
  );
  return { anglesDeg: horizonAngles(originElevM, distancesM, rayElevations), originElevM };
}
