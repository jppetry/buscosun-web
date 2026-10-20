/**
 * DWD thermal fields from the height cube's surface tiles (`atmo/v1/<run>/sfc/`, ICON-D2 on 0.02°):
 *   thermal top = HTOP_DC (top of dry convection, model height above MSL; ≤ model terrain = no dry convection),
 *   cumulus base = HBAS_SC (base of shallow convection cloud, above MSL; 0 = no cumulus).
 * `fields()` hands every other 2D field of the tile to the lenses, with the ground-capping flag.
 * Nearest cell, never averaged. Model heights, no climb rate. `null` = the field cannot serve this point/hour (older run
 * without surface tiles, outside the grid, beyond +48 h) — the caller falls back to the profile estimate and says so.
 */
import {
  ATMO_GRID, SFC_NX, SFC_NY, SFC_STEP, SFC_TILE_CELLS, decodeAtmoSfcTile, runMs, sfcTilePath, type AtmoSfcTile, type SfcVarId,
} from './atmoContract';
import { fetchTileBytes, loadAtmoIndex } from './atmoSounding';

export interface ThermalAt {
  /** Thermal top (m above MSL, model). */
  topM: number;
  /** Depth above the model terrain (m), ≥ 0. */
  depthM: number;
  /** Cumulus base (m above MSL), null = no cumulus. */
  cuBaseM: number | null;
  /** Model terrain of the cell (m above MSL). */
  hsurfM: number;
}

/** One 2D field value at a cell: `value` null = missing; `capped` = cut off at the model ground (value = model terrain). */
export interface SfcValue { value: number | null; capped: boolean }

export interface ThermalField {
  runAtMs: number;
  validMs: number;
  /** Nearest cell at a location; null outside the loaded tiles or missing. */
  at(lat: number, lon: number): ThermalAt | null;
  /** Every 2D field of the run at the nearest cell (HTOP_SC, CEILING, HZEROCL, SNOWLMT, CAPE_ML, CIN_ML, …); a field the
   *  run does not carry is absent. null outside the loaded tiles. */
  fields(lat: number, lon: number): (Partial<Record<SfcVarId, SfcValue>> & { hsurfM: number }) | null;
}

/** `?snd=eu` (the named fallback of the profile) also switches the thermal back to the estimate. */
function fieldOff(): boolean {
  try { return new URLSearchParams(window.location.search).get('snd') === 'eu'; } catch { return false; }
}

const tileCache = new Map<string, Promise<AtmoSfcTile>>();
function loadSfcTile(run: string, ty: number, tx: number, signal?: AbortSignal): Promise<AtmoSfcTile> {
  const path = sfcTilePath(run, ty, tx);
  let p = tileCache.get(path);
  if (!p) {
    p = fetchTileBytes(path, signal).then(decodeAtmoSfcTile);
    p.catch(() => tileCache.delete(path));
    tileCache.set(path, p);
    while (tileCache.size > 24) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

/**
 * The thermal field for the box at `validMs` (rounded to the hour). Throws only on abort; every other failure is `null`
 * plus `reason` (shown in the caption).
 */
export async function loadThermalField(
  box: { latMin: number; latMax: number; lonMin: number; lonMax: number }, validMs: number, signal?: AbortSignal,
): Promise<{ field: ThermalField | null; reason: string | null }> {
  if (fieldOff()) return { field: null, reason: 'abgeschaltet (?snd=eu)' };
  try {
    const index = await loadAtmoIndex(signal);
    const hourMs = Math.round(validMs / 3_600_000) * 3_600_000;
    const run = [...index.runs].filter((r) => (r.sfcTiles ?? 0) > 0).sort((a, b) => runMs(b.run) - runMs(a.run))
      .find((r) => { const s = (hourMs - runMs(r.run)) / 3_600_000; return s >= 0 && s <= 48; });
    if (!run) return { field: null, reason: 'kein Lauf mit DWD-Thermikfeld deckt diese Stunde' };
    const step = (hourMs - runMs(run.run)) / 3_600_000;
    const iy = (lat: number) => Math.round((lat - ATMO_GRID.latMin) / SFC_STEP);
    const ix = (lon: number) => Math.round((lon - ATMO_GRID.lonMin) / SFC_STEP);
    const y0 = Math.max(0, iy(box.latMin)), y1 = Math.min(SFC_NY - 1, iy(box.latMax));
    const x0 = Math.max(0, ix(box.lonMin)), x1 = Math.min(SFC_NX - 1, ix(box.lonMax));
    if (y0 > y1 || x0 > x1) return { field: null, reason: 'Ort außerhalb des DWD-Gitters (DACH)' };
    const tiles = new Map<string, AtmoSfcTile>();
    const jobs: Promise<void>[] = [];
    for (let ty = Math.floor(y0 / SFC_TILE_CELLS); ty <= Math.floor(y1 / SFC_TILE_CELLS); ty++) {
      for (let tx = Math.floor(x0 / SFC_TILE_CELLS); tx <= Math.floor(x1 / SFC_TILE_CELLS); tx++) {
        jobs.push(loadSfcTile(run.run, ty, tx, signal).then((t) => { tiles.set(`${ty}_${tx}`, t); }));
      }
    }
    await Promise.all(jobs);
    const cellOf = (lat: number, lon: number) => {
      const gy = iy(lat), gx = ix(lon);
      const t = tiles.get(`${Math.floor(gy / SFC_TILE_CELLS)}_${Math.floor(gx / SFC_TILE_CELLS)}`);
      if (!t) return null;
      const s = t.header.steps.indexOf(step);
      if (s < 0) return null;
      return { t, i: ((gy - t.header.y0) * t.header.nx + (gx - t.header.x0)) * t.header.steps.length + s, c: (gy - t.header.y0) * t.header.nx + (gx - t.header.x0) };
    };
    const field: ThermalField = {
      runAtMs: runMs(run.run), validMs: hourMs,
      fields(lat, lon) {
        const k = cellOf(lat, lon);
        if (!k) return null;
        const out: Partial<Record<SfcVarId, SfcValue>> & { hsurfM: number } = { hsurfM: k.t.hsurf[k.c] };
        for (const id of Object.keys(k.t.values) as SfcVarId[]) {
          const x = k.t.values[id]![k.i];
          out[id] = { value: Number.isFinite(x) ? x : null, capped: k.t.capped[id]![k.i] === 1 };
        }
        return out;
      },
      at(lat, lon) {
        const k = cellOf(lat, lon);
        if (!k || !k.t.values.htop_dc || !k.t.values.hbas_sc) return null;
        const top = k.t.values.htop_dc[k.i], cu = k.t.values.hbas_sc[k.i], hs = k.t.hsurf[k.c];
        if (!Number.isFinite(top) || !Number.isFinite(hs)) return null;
        return { topM: top, depthM: Math.max(0, top - hs), cuBaseM: Number.isFinite(cu) && cu > 0 ? cu : null, hsurfM: hs };
      },
    };
    return { field, reason: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { field: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** The thermal at one point (one tile). */
export async function fetchThermalAtPoint(lat: number, lon: number, validMs: number, signal?: AbortSignal): Promise<{ thermal: ThermalAt | null; runAtMs: number | null; reason: string | null }> {
  const { field, reason } = await loadThermalField({ latMin: lat, latMax: lat, lonMin: lon, lonMax: lon }, validMs, signal);
  if (!field) return { thermal: null, runAtMs: null, reason };
  const thermal = field.at(lat, lon);
  return { thermal, runAtMs: field.runAtMs, reason: thermal ? null : 'kein Feldwert am Ort' };
}
