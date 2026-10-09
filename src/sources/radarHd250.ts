/**
 * Phase R250 (`audit/radar-250m.md`) — contract and algebra of the 250-m precipitation product for Germany:
 * the RV analysis (1 km, official DWD composite) downscaled to the 250-m structure measured by the 17 DWD site
 * radars (`px250`, `dwdPx250.ts`). ONE file for the producer (`scripts/radar-mirror/radar-derive.mjs hd250`), the
 * client (`src/scalar/radarHd250.ts`, `MapView`) and the verifier (`verify:radar-250m`).
 *
 * Product (per RV slot, only the ANALYSIS — the extrapolation 5…120 min stays 1 km):
 *   radar/img/v1/rv-past/<YYMMDDHHMM>/hd250.json                  meta (schema 1, builder/checker below)
 *   radar/img/v1/rv-past/<YYMMDDHHMM>/h<ty><tx>.png               up to 16 tiles 1100 × 1200, grey 8 bit = `precipToU8Log`
 *                                                                 (dry tiles are not written; the meta lists the present ones)
 *
 * Grid: the DE1200 grid of RV divided by four — 4400 × 4800 cells of 250 m in the same polar-stereographic plane; tile
 * (tx, ty) covers columns tx·1100 … and rows ty·1200 … of it, i.e. exactly the quarter (tx/4 … (tx+1)/4, ty/4 … (ty+1)/4)
 * of the DE1200 footprint (`de1200Node`). 1-km cell (i, j) = the 4 × 4 block of 250-m cells (4i … 4i+3, 4j … 4j+3).
 *
 * Algebra (§3/§4 of the audit, every constant with its origin):
 *   1. each site image is shifted into the target grid (same projection, same scale: a pure translation — the nearest
 *      cell, offset ≤ 125 m, no interpolation);
 *   2. per 250-m cell the value of the NEAREST site that covers it (lowest beam; `set`, the usual compositing rule);
 *   3. dBZ → mm/h with Z = 256 · R^1,42 (the DWD parameters, wradlib documentation) — used only as a RATIO inside a
 *      1-km cell: the exponent sets the contrast, not the amount;
 *   4. anchoring: every 250-m cell = RV(1-km cell) · R(cell) / mean R over the covered cells of the block; a block with no
 *      site echo keeps the flat 1-km value; RV dry ⇒ dry. The block mean equals RV exactly (float).
 *   5. log quantisation 0,06 … 200 mm/h (`precipToU8Log`, the HD-3 plane), tiles 1100 × 1200.
 */

import { precipToU8Log, PRECIP_LOG_MIN, PRECIP_LOG_MAX, PRECIP_LOG_STEPS } from '../scalar/RainLayer';
import { psFwd } from './radolanGeo';
import { rvPastDir } from './radolanRuns';
import type { Px250Grid } from './dwdPx250';

// --- grid ---------------------------------------------------------------------------------------------------------
/** 250-m cells per 1-km cell and axis. */
export const HD250_FACTOR = 4;
export const HD250_CELL_M = 250;
export const HD250_COLS = 1100 * HD250_FACTOR;   // 4400
export const HD250_ROWS = 1200 * HD250_FACTOR;   // 4800
/** Tiles per axis and tile size (each tile is one RV-sized texture). */
export const HD250_TILES_X = 4;
export const HD250_TILES_Y = 4;
export const HD250_TILE_W = HD250_COLS / HD250_TILES_X;   // 1100
export const HD250_TILE_H = HD250_ROWS / HD250_TILES_Y;   // 1200
/**
 * False easting/northing of the RV composite's projection (`/where projdef` of `composite_rv_*`, 2026-09-29 … 10-09:
 * `+x_0=543196.83521776402 +y_0=3622588.8619310022`). With them the 1-km cell (i, j) has its centre at the true
 * polar-stereographic coordinates X = i · 1000 − RV_X0, Y = −j · 1000 − RV_Y0 (ODIM corners = outer edges, §3.1).
 */
export const RV_X0 = 543196.83521776402;
export const RV_Y0 = 3622588.8619310022;
/** DWD Z-R parameters (wradlib: "DWD uses a=256, b=1.42"). Only the ratio inside a 1-km block uses them. */
export const HD250_ZR = Object.freeze({ a: 256, b: 1.42 });

/** True polar-stereographic centre of the 250-m cell (k, l): quarter cells of the 1-km cell, centres at ±125/±375 m. */
export function hd250CellXY(k: number, l: number): [number, number] {
  return [HD250_CELL_M * k - 375 - RV_X0, -HD250_CELL_M * l + 375 - RV_Y0];
}

/** Integer shift of a site image into the target grid (column/row of target = site column/row + shift) and the
 *  sub-cell remainder in cells (|frac| ≤ 0,5 ⇔ ≤ 125 m). */
export function px250Shift(g: Pick<Px250Grid, 'x0' | 'y0'>): { dk: number; dl: number; fracX: number; fracY: number } {
  const kx = (RV_X0 - g.x0 + 375) / HD250_CELL_M, ly = (g.y0 - RV_Y0 + 375) / HD250_CELL_M;
  const dk = Math.round(kx), dl = Math.round(ly);
  return { dk, dl, fracX: kx - dk, fracY: ly - dl };
}

// --- composite ----------------------------------------------------------------------------------------------------
export interface Hd250Composite {
  /** mm/h from Z-R per 250-m cell (0 = no echo), NaN = no site covers the cell */
  rate: Float32Array;
  /** distance to the site that supplied the cell (m), +Infinity = not covered */
  dist: Float32Array;
  /** index into `sites` of the supplying site, −1 = none */
  siteIdx: Int8Array;
  sites: string[];
}

/** dBZ → mm/h with Z = a · R^b; no echo → 0; NaN stays NaN. */
export function zrRate(dbz: number, zr: { a: number; b: number } = HD250_ZR): number {
  if (Number.isNaN(dbz)) return NaN;
  if (dbz === -Infinity) return 0;
  return Math.pow(Math.pow(10, dbz / 10) / zr.a, 1 / zr.b);
}

/** Nearest-site composite of the site images on the 250-m target grid (§4 step 1–3). */
export function compositePx250(grids: Px250Grid[]): Hd250Composite {
  const n = HD250_COLS * HD250_ROWS;
  const rate = new Float32Array(n).fill(NaN);
  const dist = new Float32Array(n).fill(Infinity);
  const siteIdx = new Int8Array(n).fill(-1);
  const sites: string[] = [];
  grids.forEach((g, si) => {
    sites.push(g.site);
    const { dk, dl } = px250Shift(g);
    const [sx, sy] = psFwd(g.lon, g.lat);
    const S = g.size;
    const a0 = Math.max(0, -dk), a1 = Math.min(S, HD250_COLS - dk);
    const b0 = Math.max(0, -dl), b1 = Math.min(S, HD250_ROWS - dl);
    if (a1 <= a0 || b1 <= b0) return;
    // squared distance from the site to every target column (x part) once per site
    const dx2 = new Float64Array(a1 - a0);
    for (let a = a0; a < a1; a++) { const X = HD250_CELL_M * (a + dk) - 375 - RV_X0 - sx; dx2[a - a0] = X * X; }
    for (let b = b0; b < b1; b++) {
      const l = b + dl;
      const Y = -HD250_CELL_M * l + 375 - RV_Y0 - sy, dy2 = Y * Y;
      const rowSrc = b * S, rowDst = l * HD250_COLS + dk;
      for (let a = a0; a < a1; a++) {
        const v = g.dbz[rowSrc + a];
        if (Number.isNaN(v)) continue;                      // nodata: this site does not cover the cell
        const d = Math.sqrt(dx2[a - a0] + dy2);
        const t = rowDst + a;
        if (d < dist[t]) { dist[t] = d; siteIdx[t] = si; rate[t] = v === -Infinity ? 0 : Math.pow(Math.pow(10, v / 10) / HD250_ZR.a, 1 / HD250_ZR.b); }
      }
    }
  });
  return { rate, dist, siteIdx, sites };
}

// --- anchoring ----------------------------------------------------------------------------------------------------
export interface Hd250Field {
  /** mm/h per 250-m cell, 0 = dry (also outside the RV domain) */
  rate: Float32Array;
  /** 1-km cells that are wet in RV / that received 250-m structure / that stayed flat (no site echo in the block) */
  wetBlocks: number;
  structuredBlocks: number;
  flatBlocks: number;
}

/**
 * §4 step 4: RV analysis (1100 × 1200 mm/h, NaN outside the radar domain) + composite → 250-m rates whose 4 × 4 block
 * mean equals RV exactly. Pure; the verifier checks mean/dry/flat on synthetic and real inputs.
 */
export function anchorToRv(rv: Float32Array, comp: Hd250Composite): Hd250Field {
  if (rv.length !== 1100 * 1200) throw new Error(`hd250: RV-Feld mit ${rv.length} Zellen`);
  const out = new Float32Array(HD250_COLS * HD250_ROWS);
  let wet = 0, structured = 0, flat = 0;
  const F = HD250_FACTOR;
  for (let j = 0; j < 1200; j++) {
    for (let i = 0; i < 1100; i++) {
      const v = rv[j * 1100 + i];
      if (!(v > 0)) continue;                               // dry or NaN ⇒ all 16 cells stay 0
      wet++;
      // mean of the Z-R rates over the covered cells of the block
      let sum = 0, cnt = 0;
      for (let dy = 0; dy < F; dy++) {
        const row = (j * F + dy) * HD250_COLS + i * F;
        for (let dx = 0; dx < F; dx++) { const r = comp.rate[row + dx]; if (!Number.isNaN(r)) { sum += r; cnt++; } }
      }
      if (cnt > 0 && sum > 0) {
        structured++;
        const mean = sum / cnt;
        for (let dy = 0; dy < F; dy++) {
          const row = (j * F + dy) * HD250_COLS + i * F;
          for (let dx = 0; dx < F; dx++) { const r = comp.rate[row + dx]; out[row + dx] = Number.isNaN(r) ? v : v * (r / mean); }
        }
      } else {
        flat++;
        for (let dy = 0; dy < F; dy++) { const row = (j * F + dy) * HD250_COLS + i * F; for (let dx = 0; dx < F; dx++) out[row + dx] = v; }
      }
    }
  }
  return { rate: out, wetBlocks: wet, structuredBlocks: structured, flatBlocks: flat };
}

// --- encoding + tiles ----------------------------------------------------------------------------------------------
export interface Hd250Tile { tx: number; ty: number; data: Uint8Array; wet: boolean }

/** Log bytes (`precipToU8Log`) of the field, split into the 4 × 4 tiles (row-major within each tile). */
export function hd250Tiles(field: Float32Array): Hd250Tile[] {
  if (field.length !== HD250_COLS * HD250_ROWS) throw new Error(`hd250: Feld mit ${field.length} Zellen`);
  const tiles: Hd250Tile[] = [];
  for (let ty = 0; ty < HD250_TILES_Y; ty++) for (let tx = 0; tx < HD250_TILES_X; tx++) {
    const data = new Uint8Array(HD250_TILE_W * HD250_TILE_H);
    let wet = false;
    for (let y = 0; y < HD250_TILE_H; y++) {
      const src = (ty * HD250_TILE_H + y) * HD250_COLS + tx * HD250_TILE_W, dst = y * HD250_TILE_W;
      for (let x = 0; x < HD250_TILE_W; x++) { const u = precipToU8Log(field[src + x]); data[dst + x] = u; if (u) wet = true; }
    }
    tiles.push({ tx, ty, data, wet });
  }
  return tiles;
}

/** The 1-km cell (i, j) of a 250-m target cell (k, l). */
export function hd250Parent(k: number, l: number): [number, number] { return [Math.floor(k / HD250_FACTOR), Math.floor(l / HD250_FACTOR)]; }

// --- contract ------------------------------------------------------------------------------------------------------
export const HD250_META_FILE = 'hd250.json';
export function hd250TileFile(tx: number, ty: number): string { return `h${ty}${tx}.png`; }
export function hd250Dir(rvStamp: string): string { return rvPastDir(rvStamp); }

export interface Hd250MetaTile { tx: number; ty: number; file: string; bytes: number }
export interface Hd250Meta {
  schema: 1; source: 'hd250'; stamp: string; validAtMs: number;
  cols: number; rows: number; cellM: number; factor: number;
  tile: { nx: number; ny: number; w: number; h: number };
  log: { min: number; max: number; steps: number };
  zr: { a: number; b: number };
  anchor: 'rv';
  /** sites whose image went into the composite / sites of the table that were missing for this slot */
  sites: string[]; missing: string[];
  /** 1-km blocks: wet in RV, with 250-m structure, flat */
  blocks: { wet: number; structured: number; flat: number };
  tiles: Hd250MetaTile[];
}

export function makeHd250Meta(stamp: string, validAtMs: number, sites: string[], missing: string[], field: Hd250Field, tiles: Hd250MetaTile[]): Hd250Meta {
  return {
    schema: 1, source: 'hd250', stamp, validAtMs,
    cols: HD250_COLS, rows: HD250_ROWS, cellM: HD250_CELL_M, factor: HD250_FACTOR,
    tile: { nx: HD250_TILES_X, ny: HD250_TILES_Y, w: HD250_TILE_W, h: HD250_TILE_H },
    log: { min: PRECIP_LOG_MIN, max: PRECIP_LOG_MAX, steps: PRECIP_LOG_STEPS },
    zr: { ...HD250_ZR }, anchor: 'rv', sites, missing,
    blocks: { wet: field.wetBlocks, structured: field.structuredBlocks, flat: field.flatBlocks },
    tiles,
  };
}

/** Strict checker — the ONE rejection point of the client: constants must match, tiles well-formed and unique. */
export function parseHd250Meta(j: unknown): Hd250Meta | null {
  const m = j as Hd250Meta | null;
  if (!m || typeof m !== 'object' || m.schema !== 1 || m.source !== 'hd250') return null;
  if (typeof m.stamp !== 'string' || !/^\d{10}$/.test(m.stamp) || !Number.isFinite(m.validAtMs)) return null;
  if (m.cols !== HD250_COLS || m.rows !== HD250_ROWS || m.cellM !== HD250_CELL_M || m.factor !== HD250_FACTOR) return null;
  if (!m.tile || m.tile.nx !== HD250_TILES_X || m.tile.ny !== HD250_TILES_Y || m.tile.w !== HD250_TILE_W || m.tile.h !== HD250_TILE_H) return null;
  if (!m.log || m.log.min !== PRECIP_LOG_MIN || m.log.max !== PRECIP_LOG_MAX || m.log.steps !== PRECIP_LOG_STEPS) return null;
  if (!m.zr || m.zr.a !== HD250_ZR.a || m.zr.b !== HD250_ZR.b || m.anchor !== 'rv') return null;
  if (!Array.isArray(m.sites) || !Array.isArray(m.missing) || !m.sites.every((s) => typeof s === 'string')) return null;
  if (!m.blocks || !Number.isInteger(m.blocks.wet) || !Number.isInteger(m.blocks.structured) || !Number.isInteger(m.blocks.flat)) return null;
  if (!Array.isArray(m.tiles) || m.tiles.length > HD250_TILES_X * HD250_TILES_Y) return null;
  const seen = new Set<string>();
  for (const t of m.tiles) {
    if (!t || !Number.isInteger(t.tx) || !Number.isInteger(t.ty) || t.tx < 0 || t.tx >= HD250_TILES_X || t.ty < 0 || t.ty >= HD250_TILES_Y) return null;
    if (t.file !== hd250TileFile(t.tx, t.ty) || !Number.isFinite(t.bytes) || t.bytes <= 0) return null;
    if (seen.has(t.file)) return null;
    seen.add(t.file);
  }
  return m;
}
