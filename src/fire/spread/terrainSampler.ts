/**
 * Slope and aspect at the fires — the „Untergrund" half of the question.
 *
 * Nothing here is new physics: `terrainContext` (`../../pointForecast/terrainPhysics`)
 * already derives slope, aspect and sink depth from a DEM lookup, and
 * `loadElevationLookup` (`../../fusion/elevation`) already fetches Terrarium
 * tiles. This module only decides **how often** and **for how many** — which is
 * the whole engineering problem, because DEM tiles are the one network cost the
 * arrows add.
 *
 * Three decisions:
 *
 *  • **Bundled by map cell, not by fire.** Fires are quantised to a 0.25° cell
 *    and share one lookup. Two hotspots of the same fire complex cost one fetch.
 *  • **Capped, and the cap is reported.** `MAX_DEM_CELLS` cells are loaded, in
 *    the order the caller ranks the fires. Everything beyond is returned in
 *    `skipped` — the caller turns that into „Gelände nicht geladen", never into
 *    flat ground.
 *  • **No caller signal inside the shared cache.** A cached promise that hangs
 *    on the first caller's `AbortController` dies for everyone when that caller
 *    unmounts — React's double effects in dev make this reproducible (Lehre BP1
 *    §9.3). The load therefore runs unsignalled and the caller checks its own
 *    signal after awaiting; a failed cell is evicted so a later run may retry.
 *
 * Both dependencies are imported dynamically: they are only needed once the
 * layer is on, and `elevation.ts` would otherwise sit in the FirePage chunk.
 */

import type { SlopeInput } from './spreadVector';

/** Terrarium zoom: ~150 m per pixel — about three pixels per gradient step. */
export const DEM_ZOOM = 10;
/** Edge length of the shared lookup cell, degrees. */
export const DEM_CELL_DEG = 0.25;
/** Margin so a fire near the cell edge still has its gradient ring covered. */
export const DEM_CELL_PAD_DEG = 0.03;
/** Upper bound on lookups per run — the network cost of the whole layer. */
export const MAX_DEM_CELLS = 12;

export interface FirePoint {
  id: string;
  lat: number;
  lon: number;
}

export interface SlopeResult {
  byId: Map<string, SlopeInput>;
  /** How many DEM cells were actually loaded. */
  cellsLoaded: number;
  /** Fire ids left without terrain — beyond the cap or the lookup failed. */
  skipped: string[];
}

/** Stable key of the 0.25° cell a point falls into. Pure — the verifier walks it. */
export function demCellKey(lat: number, lon: number): string {
  const iy = Math.floor(lat / DEM_CELL_DEG);
  const ix = Math.floor(lon / DEM_CELL_DEG);
  return `${iy}:${ix}`;
}

/** The padded bounds of a cell key. */
export function demCellBounds(key: string): { lngMin: number; lngMax: number; latMin: number; latMax: number } {
  const [iy, ix] = key.split(':').map(Number);
  return {
    latMin: iy * DEM_CELL_DEG - DEM_CELL_PAD_DEG,
    latMax: (iy + 1) * DEM_CELL_DEG + DEM_CELL_PAD_DEG,
    lngMin: ix * DEM_CELL_DEG - DEM_CELL_PAD_DEG,
    lngMax: (ix + 1) * DEM_CELL_DEG + DEM_CELL_PAD_DEG,
  };
}

type Sampler = (lng: number, lat: number) => number;
const cellCache = new Map<string, Promise<Sampler | null>>();

/** Test seam: drop the shared cache (used by the verifier, never in the app). */
export function resetTerrainCache(): void {
  cellCache.clear();
}

async function samplerForCell(key: string): Promise<Sampler | null> {
  const cached = cellCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<Sampler | null> => {
    try {
      const { loadElevationLookup } = await import('../../fusion/elevation');
      const grid = await loadElevationLookup(demCellBounds(key), DEM_ZOOM);
      return (lng: number, lat: number) => grid.sample(lng, lat);
    } catch {
      return null;
    }
  })();
  cellCache.set(key, p);
  const r = await p;
  if (!r) cellCache.delete(key);   // a failure must not be cached forever
  return r;
}

/**
 * Slope and upslope azimuth for the given fires, in the order they are ranked.
 * Fires beyond the cap, outside DEM coverage or in a failed cell come back in
 * `skipped` — they must be shown as „terrain not loaded", never as flat.
 */
export async function slopesForFires(points: readonly FirePoint[], signal?: AbortSignal): Promise<SlopeResult> {
  const byId = new Map<string, SlopeInput>();
  const skipped: string[] = [];
  if (points.length === 0) return { byId, cellsLoaded: 0, skipped };

  // Cells in rank order: the cap bites the least important fires.
  const order: string[] = [];
  const members = new Map<string, FirePoint[]>();
  for (const p of points) {
    const key = demCellKey(p.lat, p.lon);
    if (!members.has(key)) { members.set(key, []); order.push(key); }
    members.get(key)!.push(p);
  }

  const { terrainContext } = await import('../../pointForecast/terrainPhysics');
  let cellsLoaded = 0;

  for (const key of order) {
    const group = members.get(key)!;
    if (cellsLoaded >= MAX_DEM_CELLS) { skipped.push(...group.map((p) => p.id)); continue; }
    if (signal?.aborted) { skipped.push(...group.map((p) => p.id)); continue; }
    const sample = await samplerForCell(key);
    if (signal?.aborted) { skipped.push(...group.map((p) => p.id)); continue; }
    if (!sample) { skipped.push(...group.map((p) => p.id)); continue; }
    cellsLoaded++;
    for (const p of group) {
      const ctx = terrainContext(sample, p.lon, p.lat);
      const slope = slopeFromContext(ctx);
      if (slope) byId.set(p.id, slope); else skipped.push(p.id);
    }
  }
  return { byId, cellsLoaded, skipped };
}

/**
 * `TerrainContext` → FBP inputs. Aspect is the direction the ground FALLS to,
 * so the upslope azimuth is its opposite — the fire runs uphill, and getting
 * this backwards would point every arrow into the valley.
 */
export function slopeFromContext(ctx: { slopeRad: number; aspectRad: number }): SlopeInput | null {
  if (!Number.isFinite(ctx.slopeRad) || !Number.isFinite(ctx.aspectRad)) return null;
  const slopePct = Math.tan(ctx.slopeRad) * 100;
  if (!Number.isFinite(slopePct) || slopePct < 0) return null;
  const downslopeDeg = (ctx.aspectRad * 180) / Math.PI;
  return { slopePct, upslopeAzDeg: ((downslopeDeg + 180) % 360 + 360) % 360 };
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread).
// Network-free: only the pure cell arithmetic and the context conversion.
// ---------------------------------------------------------------------------

export interface TerrainCheck { name: string; ok: boolean; detail?: string }

export function verifyTerrainSampler(): { checks: TerrainCheck[]; passed: number; total: number } {
  const checks: TerrainCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Cell keys are stable, and the cell contains its own points.
  add('gleicher Punkt ⇒ gleicher Zellschlüssel', demCellKey(48.137, 11.575) === demCellKey(48.137, 11.575));
  add('zwei Punkte derselben 0,25°-Zelle teilen den Schlüssel',
    demCellKey(48.01, 11.01) === demCellKey(48.24, 11.24));
  add('benachbarte Zellen haben verschiedene Schlüssel',
    demCellKey(48.01, 11.01) !== demCellKey(48.26, 11.01));
  const b = demCellBounds(demCellKey(48.137, 11.575));
  add('die Zellgrenzen enthalten ihren Punkt mit Rand',
    b.latMin < 48.137 && b.latMax > 48.137 && b.lngMin < 11.575 && b.lngMax > 11.575);
  add('der Rand deckt die Gradienten-Schrittweite (0,0045°) mit ab',
    DEM_CELL_PAD_DEG > 0.0045 * 2);
  add('negative Breiten/Längen runden nach unten, nicht zur Null hin',
    demCellKey(-0.1, -0.1) === '-1:-1');

  // --- Aspect → upslope: the direction must flip by exactly 180°.
  const south = slopeFromContext({ slopeRad: Math.atan(0.2), aspectRad: Math.PI });   // falls to S
  add('Hang fällt nach Süden ⇒ hinauf nach Norden',
    !!south && Math.abs(south.upslopeAzDeg - 0) < 1e-9, south ? `${south.upslopeAzDeg}°` : 'null');
  const north = slopeFromContext({ slopeRad: Math.atan(0.2), aspectRad: 0 });         // falls to N
  add('Hang fällt nach Norden ⇒ hinauf nach Süden', !!north && Math.abs(north.upslopeAzDeg - 180) < 1e-9);
  add('Neigung wird als Prozent geliefert (tan·100)',
    !!south && Math.abs(south.slopePct - 20) < 1e-9, south ? `${south.slopePct.toFixed(2)} %` : 'null');
  add('ebener Grund bleibt 0 %, nicht null',
    slopeFromContext({ slopeRad: 0, aspectRad: 0 })?.slopePct === 0);
  add('unbrauchbarer Kontext ⇒ null, nicht 0',
    slopeFromContext({ slopeRad: NaN, aspectRad: 0 }) === null);

  // --- The cap exists and is a number the UI can name.
  add('Deckel der DEM-Zellen ist gesetzt und klein', MAX_DEM_CELLS > 0 && MAX_DEM_CELLS <= 24);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
