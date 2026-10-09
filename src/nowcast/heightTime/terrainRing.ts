/**
 * Phase HZS (`audit/hoehen-zeit-schnitt.md` §3): terrain within 10 km of the point — valley (min) to ridge (max).
 *
 * Own small fetch on purpose: the reader of buscosun Fusion (`point/client/terrain.ts`) samples z11/z8 internally and
 * is part of the Fusion input (cache key, model features) — it is not touched. Terrarium z10 (≈ 105 m/px at 47° N,
 * one tile ≈ 27 km wide ⇒ 1–4 tiles), a disc sampled on a ≈ 250 m grid (≈ 5 000 samples). Sea/below-zero ⇒ 0 m.
 */
import { loadElevationLookup } from '../../fusion/elevation';
import { terrainStatsOf, type TerrainStats } from './heightTimeModel';

export const HZS_TERRAIN_RADIUS_KM = 10;
export const HZS_TERRAIN_ZOOM = 10;
export const HZS_TERRAIN_STEP_KM = 0.25;

/** Sample points of the disc (lon, lat). Pure — the verifier counts them. */
export function discPoints(lat: number, lon: number, radiusKm = HZS_TERRAIN_RADIUS_KM, stepKm = HZS_TERRAIN_STEP_KM): Array<[number, number]> {
  const kmLat = 111.32, kmLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  const n = Math.ceil(radiusKm / stepKm);
  const out: Array<[number, number]> = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const dx = i * stepKm, dy = j * stepKm;
      if (dx * dx + dy * dy > radiusKm * radiusKm) continue;
      out.push([lon + dx / kmLon, lat + dy / kmLat]);
    }
  }
  return out;
}

const CACHE = new Map<string, TerrainStats | null>();

export async function loadTerrainRing(lat: number, lon: number, signal?: AbortSignal): Promise<TerrainStats | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (CACHE.has(key)) return CACHE.get(key) ?? null;
  const r = HZS_TERRAIN_RADIUS_KM;
  const dLat = r / 111.32, dLon = r / (111.32 * Math.cos((lat * Math.PI) / 180));
  const grid = await loadElevationLookup({ latMin: lat - dLat, latMax: lat + dLat, lngMin: lon - dLon, lngMax: lon + dLon }, HZS_TERRAIN_ZOOM, signal);
  const samples = discPoints(lat, lon).map(([x, y]) => grid.sample(x, y));
  const stats = terrainStatsOf(samples, r, HZS_TERRAIN_ZOOM);
  CACHE.set(key, stats);
  return stats;
}
