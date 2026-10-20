/**
 * Height cube `atmo/v1` along a section line: for every section column the cube column (ICON-D2 model levels) whose
 * model terrain is closest to the DEM terrain among the four grid points around it — wind (U/V) and temperature per
 * height for the vertical section instead of the power law. Loaded once with the section; `aloftAt` interpolates in
 * time (hourly steps) synchronously, so the time slider stays fluid.
 *
 * Every failure is a reason, not a throw: the section then falls back to the power law and says so.
 */
import { ATMO_GRID, GRID_NX, GRID_NY, TILE_CELLS, checkColumnStep, runMs, type AtmoColumn } from './atmoContract';
import { loadAtmoIndex, loadAtmoTile } from './atmoSounding';
import type { AloftProfile } from '../threed/crossSection';

export interface SectionAloft {
  run: string;
  runAtMs: number;
  steps: number[];
  nLev: number;
  /** Per section column (same order); null = no cube column there (outside the grid). */
  cols: Array<AtmoColumn | null>;
}

export type SectionAloftLoad = { aloft: SectionAloft; reason: null } | { aloft: null; reason: string };

/** `?snd=eu` (named fallback of the sounding) also switches the section back to the power law. */
function cubeOff(): boolean {
  try { return new URLSearchParams(window.location.search).get('snd') === 'eu'; } catch { return false; }
}

export async function loadSectionAloft(
  columns: ReadonlyArray<{ lat: number; lon: number; terrainM: number }>, signal?: AbortSignal,
): Promise<SectionAloftLoad> {
  if (cubeOff()) return { aloft: null, reason: 'abgeschaltet (?snd=eu)' };
  try {
    const index = await loadAtmoIndex(signal);
    const run = [...index.runs].sort((a, b) => runMs(b.run) - runMs(a.run))[0].run;
    const picks = columns.map((c) => {
      const fy = (c.lat - ATMO_GRID.latMin) / ATMO_GRID.step, fx = (c.lon - ATMO_GRID.lonMin) / ATMO_GRID.step;
      if (fy < 0 || fx < 0 || fy > GRID_NY - 1 || fx > GRID_NX - 1) return [];
      const out: Array<{ iy: number; ix: number }> = [];
      for (const iy of [Math.floor(fy), Math.floor(fy) + 1]) for (const ix of [Math.floor(fx), Math.floor(fx) + 1]) {
        if (iy < GRID_NY && ix < GRID_NX) out.push({ iy, ix });
      }
      return out;
    });
    const tileKeys = [...new Set(picks.flat().map((g) => `${Math.floor(g.iy / TILE_CELLS)}_${Math.floor(g.ix / TILE_CELLS)}`))];
    if (!tileKeys.length) return { aloft: null, reason: 'Linie außerhalb des Cube-Gitters' };
    const tiles = new Map(await Promise.all(tileKeys.map(async (k) => {
      const [ty, tx] = k.split('_').map(Number);
      return [k, await loadAtmoTile(run, ty, tx, signal)] as const;
    })));
    const colAt = (g: { iy: number; ix: number }) => {
      const t = tiles.get(`${Math.floor(g.iy / TILE_CELLS)}_${Math.floor(g.ix / TILE_CELLS)}`)!;
      return t.columns[(g.iy - t.header.y0) * t.header.nx + (g.ix - t.header.x0)] ?? null;
    };
    const cols = columns.map((c, i) => {
      const cand = picks[i].map(colAt).filter((x): x is AtmoColumn => !!x && Number.isFinite(x.hsurf));
      if (!cand.length) return null;
      const dist = (x: AtmoColumn) => Math.hypot(x.lat - c.lat, (x.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180));
      // Terrain first (alpine valleys), distance breaks ties.
      return cand.reduce((a, b) => {
        const da = Math.abs(a.hsurf - c.terrainM), db = Math.abs(b.hsurf - c.terrainM);
        return db < da || (db === da && dist(b) < dist(a)) ? b : a;
      });
    });
    const first = tiles.values().next().value!.header;
    return { aloft: { run, runAtMs: runMs(run), steps: first.steps, nLev: first.levels.length, cols }, reason: null };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { aloft: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Profile of one section column at time `tMs` (linear between the hourly steps); null outside the run or implausible. */
export function aloftAt(a: SectionAloft, colIndex: number, tMs: number): AloftProfile | null {
  const col = a.cols[colIndex];
  if (!col) return null;
  const h = (tMs - a.runAtMs) / 3_600_000;
  const s0 = Math.floor(h), s1 = Math.min(s0 + 1, a.steps.length - 1);
  if (s0 < 0 || s0 >= a.steps.length) return null;
  const f = s1 === s0 ? 0 : h - s0;
  const nL = a.nLev;
  for (const s of new Set([s0, s1])) {
    if (checkColumnStep(col.z, (id, l) => col.values[id][s * nL + l], nL).length) return null;
  }
  const at = (arr: Float32Array, k: number) => arr[s0 * nL + k] * (1 - f) + arr[s1 * nL + k] * f;
  const z: number[] = [], u: number[] = [], v: number[] = [], t: number[] = [];
  for (let k = 0; k < nL; k++) {
    z.push(col.z[k]); u.push(at(col.values.u, k)); v.push(at(col.values.v, k)); t.push(at(col.values.t, k));
  }
  return { z, u, v, t, hsurf: col.hsurf };
}
