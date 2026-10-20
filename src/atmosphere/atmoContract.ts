/**
 * atmoContract.ts — the form of the height cube `atmo/v1` in `buscosun-data` (one module, two runtimes: the producer
 * `scripts/atmo/atmo-build.mjs` under Node `--experimental-strip-types` and the client import the SAME file).
 *
 * Source (spike 19.10.2026): ICON-D2 v1 model levels (`nwp/v1/m/icon-d2/p/<T|QV|U|V>/lvt1/150/lv1/<n>/…`), the only
 * option with real vertical resolution near the ground: 14 levels in 0–1 km above ground in the lowland AND on summits,
 * because model levels follow the terrain. ICON-D2 pressure levels have 3 levels below 1 km in the lowland and lie
 * below ground in the Alps; ICON-EU pressure levels add 6.5 km grid spacing and ~2.6 h later completeness.
 *
 * One tile file holds every column of a `TILE_CELLS × TILE_CELLS` block for all steps 0–48 h: one request per profile.
 * Columns are the NEAREST ICON cell to each grid point — profile fields are never averaged.
 *
 * Tile container (little endian):
 *   u32 magic 'BSAT' · u16 schema · u16 reserved · u32 header length · header JSON (utf8) · deflate-raw payload.
 * Payload = Int16 values, `MISSING` = −32768:
 *   per column: hsurf, z[level]                                           (static for the run, metres above MSL)
 *   per var (VARS order), per column, per level: series over STEPS, coded by `encodePayload` (wrapping int16)
 * and finally the whole payload byte-shuffled (all low bytes, then all high bytes) before deflate.
 *
 * Surface fields `atmo/v1/<run>/sfc/<ty>_<tx>.bin` (same container, header `kind: 'sfc'`): the DWD thermal fields on a
 * finer 0.02° grid (≈ ICON-D2 spacing; nearest cell, never averaged), same 0.5° tile blocks as the cube:
 *   HTOP_DC — top of dry convection (m above MSL; ≤ HSURF = no dry convection),
 *   HBAS_SC — base of shallow convection cloud = cumulus base (m above MSL; 0 = no cumulus),
 *   HTOP_SC — top of shallow convection cloud (m above MSL; 0 = no cumulus),
 *   CEILING — ceiling (m above MSL), HZEROCL — freezing level (m above MSL), SNOWLMT — snow limit (m above MSL),
 *   CAPE_ML / CIN_ML — mixed-layer CAPE / CIN (J/kg; DWD fill −999.9 for CIN = no free convection ⇒ MISSING).
 * Values cut off at the model ground carry `CAPPED` (= at or below the model terrain; measured 20.10.2026: HZEROCL is
 * set to HSURF, SNOWLMT becomes NaN close above or ≥ HSURF + 10, CEILING sits on the lowest model level in fog).
 * The var list of a tile is its header's `vars` (older runs carry fewer). Payload: per cell hsurf, then per var, per
 * cell the series over STEPS (time delta, zigzag), shuffled, deflate-raw.
 *
 * Foehn pressure `atmo/v1/<run>/foehn.json`: ICON-D2 PMSL (hPa) over STEPS at the nearest cell of the FOEHN_STATIONS
 * (cross-Alpine pairs Lugano–Zürich and Bozen–Innsbruck).
 */

import { DACH_VIEW } from '../countryProfiles';

export const ATMO_SCHEMA = 1;
export const ATMO_MAGIC = 0x54415342; // 'BSAT' read as u32 LE
export const ATMO_DIR = 'atmo/v1';
export const ATMO_INDEX_PATH = `${ATMO_DIR}/index.json`;
export const MISSING = -32768;
/** Surface fields only: value cut off at the model ground (see the sfc section). */
export const CAPPED = -32767;

export const ATMO_MODEL = 'icon-d2';
export const ATMO_SOURCE_LABEL = 'ICON-D2 (DWD, 2,2 km, Modellflächen)';
export const ATMO_ATTRIBUTION = 'Datenbasis: Deutscher Wetterdienst (ICON-D2, CC BY 4.0)';

/**
 * ICON-D2 full model levels (1 = top ≈ 21 km, 65 = lowest ≈ 10 m above ground), lowest first. Every level up to 32
 * (≈ 4.3 km above ground in the lowland), then every second level up to 14 (≈ 10 km above MSL everywhere).
 */
export const ATMO_LEVELS: readonly number[] = Object.freeze([
  ...Array.from({ length: 65 - 32 + 1 }, (_, i) => 65 - i),
  30, 28, 26, 24, 22, 20, 18, 16, 14,
]);

/** Forecast steps in hours after the run. */
export const ATMO_STEPS: readonly number[] = Object.freeze(Array.from({ length: 49 }, (_, i) => i));

/**
 * Published cadence: every second ICON-D2 run (00/06/12/18 UTC). Measured 19.10.: 6.45 GB from DWD and ≈ 65 MB output
 * per run — 3-hourly would double both for a profile that is at most 3 h fresher.
 */
export const ATMO_RUN_EVERY_H = 6;

/** Stored per level and step; value = q / scale. */
export interface AtmoVar { id: 'p' | 't' | 'rh' | 'u' | 'v'; unit: string; scale: number; min: number; max: number }
export const VARS: readonly AtmoVar[] = Object.freeze([
  { id: 'p', unit: 'hPa', scale: 10, min: 150, max: 1090 },
  { id: 't', unit: '°C', scale: 10, min: -95, max: 50 },
  { id: 'rh', unit: '%', scale: 1, min: 0, max: 100 },
  { id: 'u', unit: 'm/s', scale: 5, min: -120, max: 120 },
  { id: 'v', unit: 'm/s', scale: 5, min: -120, max: 120 },
]);

/** Regular output grid over DACH (the same box as the map and the point cube). */
export const ATMO_GRID = Object.freeze({
  latMin: DACH_VIEW.bounds.latMin,
  latMax: DACH_VIEW.bounds.latMax,
  lonMin: DACH_VIEW.bounds.lngMin,
  lonMax: DACH_VIEW.bounds.lngMax,
  step: 0.1,
});
export const GRID_NY = Math.round((ATMO_GRID.latMax - ATMO_GRID.latMin) / ATMO_GRID.step) + 1;
export const GRID_NX = Math.round((ATMO_GRID.lonMax - ATMO_GRID.lonMin) / ATMO_GRID.step) + 1;
export const TILE_CELLS = 5;
export const TILES_Y = Math.ceil(GRID_NY / TILE_CELLS);
export const TILES_X = Math.ceil(GRID_NX / TILE_CELLS);

export const gridLat = (iy: number) => +(ATMO_GRID.latMin + iy * ATMO_GRID.step).toFixed(4);
export const gridLon = (ix: number) => +(ATMO_GRID.lonMin + ix * ATMO_GRID.step).toFixed(4);

/** Nearest grid point to a location, or null outside the grid. */
export function gridCellOf(lat: number, lon: number): { iy: number; ix: number } | null {
  const iy = Math.round((lat - ATMO_GRID.latMin) / ATMO_GRID.step);
  const ix = Math.round((lon - ATMO_GRID.lonMin) / ATMO_GRID.step);
  if (iy < 0 || ix < 0 || iy >= GRID_NY || ix >= GRID_NX) return null;
  return { iy, ix };
}

export function tileExtent(ty: number, tx: number): { y0: number; x0: number; ny: number; nx: number } {
  const y0 = ty * TILE_CELLS, x0 = tx * TILE_CELLS;
  return { y0, x0, ny: Math.min(TILE_CELLS, GRID_NY - y0), nx: Math.min(TILE_CELLS, GRID_NX - x0) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Run name `YYYYMMDDHH` (UTC). */
export const runName = (ms: number) => new Date(ms).toISOString().slice(0, 13).replace(/[-T]/g, '');
export const runMs = (run: string) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
/** Paths RELATIVE to the repo root — the only place they are put together. */
export const tilePath = (run: string, ty: number, tx: number) => `${ATMO_DIR}/${run}/t/${pad2(ty)}_${pad2(tx)}.bin`;
export const runManifestPath = (run: string) => `${ATMO_DIR}/${run}/run.json`;

export interface AtmoTileHeader {
  schema: number;
  run: string;
  model: string;
  tile: [number, number];
  /** Grid offset and size of this tile. */
  y0: number; x0: number; ny: number; nx: number;
  levels: number[];
  steps: number[];
  vars: Array<{ id: string; unit: string; scale: number }>;
  /** Chosen ICON cell per column (degrees), column order iy-major. */
  cellLat: number[];
  cellLon: number[];
}

export interface AtmoColumn {
  lat: number; lon: number;
  cellLat: number; cellLon: number;
  /** Model orography of the cell (m above MSL). */
  hsurf: number;
  /** Full-level heights above MSL, lowest first. */
  z: Float32Array;
  /** `values[var][step * nLevels + level]`, physical units, NaN = missing. */
  values: Record<AtmoVar['id'], Float32Array>;
}

/** Payload length in int16 for a tile with `nCols` columns. */
export const payloadLength = (nCols: number, nLev = ATMO_LEVELS.length, nSteps = ATMO_STEPS.length) =>
  nCols * (1 + nLev) + VARS.length * nCols * nLev * nSteps;

const wrap16 = (x: number) => ((x + 32768) & 0xffff) - 32768;

/**
 * In place, producer side: per (var, column) block of `nLev × nSteps` series — time delta, then the delta against the
 * same step of the level below (also at step 0), then zigzag. Measured on run 2026101918: 100.5 → 64.8 MB per run
 * together with the scales in VARS (wind 0.2 m/s, RH 1 %).
 */
export function encodePayload(p: Int16Array, nCols: number, nLev: number, nSteps: number): void {
  const st = nCols * (1 + nLev);
  for (let s = 0, ns = VARS.length * nCols * nLev; s < ns; s++) {
    const o = st + s * nSteps;
    for (let t = nSteps - 1; t > 0; t--) p[o + t] = wrap16(p[o + t] - p[o + t - 1]);
  }
  for (let b = 0, nb = VARS.length * nCols; b < nb; b++) {
    for (let l = nLev - 1; l > 0; l--) {
      const o = st + (b * nLev + l) * nSteps, ob = o - nSteps;
      for (let t = 0; t < nSteps; t++) p[o + t] = wrap16(p[o + t] - p[ob + t]);
    }
  }
  for (let i = st; i < p.length; i++) p[i] = ((p[i] << 1) ^ (p[i] >> 15)) << 16 >> 16;
}
export function decodePayload(p: Int16Array, nCols: number, nLev: number, nSteps: number): void {
  const st = nCols * (1 + nLev);
  for (let i = st; i < p.length; i++) { const u = p[i] & 0xffff; p[i] = (u >>> 1) ^ -(u & 1); }
  for (let b = 0, nb = VARS.length * nCols; b < nb; b++) {
    for (let l = 1; l < nLev; l++) {
      const o = st + (b * nLev + l) * nSteps, ob = o - nSteps;
      for (let t = 0; t < nSteps; t++) p[o + t] = wrap16(p[o + t] + p[ob + t]);
    }
  }
  for (let s = 0, ns = VARS.length * nCols * nLev; s < ns; s++) {
    const o = st + s * nSteps;
    for (let t = 1; t < nSteps; t++) p[o + t] = wrap16(p[o + t] + p[o + t - 1]);
  }
}
export function shuffle(p: Int16Array): Uint8Array {
  const b = new Uint8Array(p.buffer, p.byteOffset, p.byteLength), n = p.length, out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { out[i] = b[2 * i]; out[n + i] = b[2 * i + 1]; }
  return out;
}
export function unshuffle(b: Uint8Array): Int16Array {
  const n = b.length >> 1, out = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { out[2 * i] = b[i]; out[2 * i + 1] = b[n + i]; }
  return new Int16Array(out.buffer);
}

/** Container around an already deflate-raw-compressed payload. */
export function packTile(header: AtmoTileHeader | AtmoSfcHeader, deflated: Uint8Array): Uint8Array {
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(12 + h.length + deflated.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, ATMO_MAGIC, true); dv.setUint16(4, ATMO_SCHEMA, true); dv.setUint32(8, h.length, true);
  out.set(h, 12); out.set(deflated, 12 + h.length);
  return out;
}
export function unpackTile<H = AtmoTileHeader>(bytes: Uint8Array): { header: H; deflated: Uint8Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== ATMO_MAGIC) throw new Error('atmo: kein BSAT-Container');
  const schema = dv.getUint16(4, true);
  if (schema !== ATMO_SCHEMA) throw new Error(`atmo: Schema ${schema}, Leser kennt ${ATMO_SCHEMA}`);
  const hl = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hl))) as H;
  return { header, deflated: bytes.subarray(12 + hl) };
}

/** Decoded payload → columns. `inflated` = the deflate-raw output (still shuffled and delta-coded). */
export function columnsOf(header: AtmoTileHeader, inflated: Uint8Array): AtmoColumn[] {
  const nCols = header.ny * header.nx, nLev = header.levels.length, nSteps = header.steps.length;
  const p = unshuffle(inflated);
  if (p.length !== payloadLength(nCols, nLev, nSteps)) throw new Error(`atmo: Nutzlast ${p.length} ≠ ${payloadLength(nCols, nLev, nSteps)}`);
  decodePayload(p, nCols, nLev, nSteps);
  const f = (q: number, scale: number) => (q === MISSING ? NaN : q / scale);
  const cols: AtmoColumn[] = [];
  for (let c = 0; c < nCols; c++) {
    const o = c * (1 + nLev);
    const z = new Float32Array(nLev);
    for (let l = 0; l < nLev; l++) z[l] = f(p[o + 1 + l], 1);
    const values = {} as AtmoColumn['values'];
    VARS.forEach((v, vi) => {
      const a = new Float32Array(nSteps * nLev);
      const base = nCols * (1 + nLev) + (vi * nCols + c) * nLev * nSteps;
      for (let l = 0; l < nLev; l++) for (let t = 0; t < nSteps; t++) a[t * nLev + l] = f(p[base + l * nSteps + t], v.scale);
      values[v.id] = a;
    });
    const iy = header.y0 + Math.floor(c / header.nx), ix = header.x0 + (c % header.nx);
    cols.push({ lat: gridLat(iy), lon: gridLon(ix), cellLat: header.cellLat[c], cellLon: header.cellLon[c], hsurf: f(p[o], 1), z, values });
  }
  return cols;
}

/** Browser and Node ≥ 18: inflate with the platform stream (no dependency). */
export async function decodeAtmoTile(bytes: Uint8Array): Promise<{ header: AtmoTileHeader; columns: AtmoColumn[] }> {
  const { header, deflated } = unpackTile(bytes);
  const stream = new Blob([deflated as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  return { header, columns: columnsOf(header, inflated) };
}

/**
 * Plausibility of one column at one step (producer refuses to publish, client refuses to show). Returns the reasons,
 * empty = fine. Heights must rise and pressure must fall with the level; values inside the var ranges.
 */
export function checkColumnStep(z: ArrayLike<number>, get: (id: AtmoVar['id'], l: number) => number, nLev: number): string[] {
  const bad: string[] = [];
  for (let l = 0; l < nLev; l++) {
    for (const v of VARS) {
      const x = get(v.id, l);
      if (!Number.isFinite(x)) { bad.push(`${v.id}[${l}] fehlt`); continue; }
      if (x < v.min || x > v.max) bad.push(`${v.id}[${l}]=${x}`);
    }
    if (l > 0) {
      if (!(z[l] > z[l - 1])) bad.push(`z[${l}] steigt nicht`);
      if (!(get('p', l) < get('p', l - 1))) bad.push(`p[${l}] fällt nicht`);
    }
  }
  return bad;
}

/** `atmo/v1/index.json` — the pointer the client reads first. */
export interface AtmoIndex {
  schema: number;
  model: string;
  attribution: string;
  updatedAt: string;
  grid: typeof ATMO_GRID & { ny: number; nx: number; tileCells: number; tilesY: number; tilesX: number };
  levels: number[];
  steps: number[];
  vars: Array<{ id: string; unit: string; scale: number }>;
  /** Surface-field grid (thermal); absent in indexes written before it existed. */
  sfc?: { step: number; ny: number; nx: number; tileCells: number; tilesY: number; tilesX: number; vars: Array<{ id: string; unit: string; scale: number }> };
  /** Newest first. `sfcTiles` > 0 ⇔ the run carries the surface fields. */
  runs: Array<{ run: string; runAt: string; tiles: number; bytes: number; builtAt: string; sfcTiles?: number; sfcBytes?: number; foehn?: boolean }>;
}

// ── Foehn pressure (PMSL at the cross-Alpine station pairs) ─────────────────────────────────────────────────────────
export interface FoehnStation { id: 'lugano' | 'zuerich' | 'bozen' | 'innsbruck'; name: string; lat: number; lon: number }
export const FOEHN_STATIONS: readonly FoehnStation[] = Object.freeze([
  { id: 'lugano', name: 'Lugano', lat: 46.004, lon: 8.960 },
  { id: 'zuerich', name: 'Zürich-Kloten', lat: 47.480, lon: 8.536 },
  { id: 'bozen', name: 'Bozen', lat: 46.498, lon: 11.354 },
  { id: 'innsbruck', name: 'Innsbruck', lat: 47.260, lon: 11.357 },
]);
/** Luv–Lee pairs for south foehn: Δp = south − north (positive = south foehn pressure gradient). */
export const FOEHN_PAIRS = Object.freeze([
  { id: 'ch', south: 'lugano', north: 'zuerich', label: 'Lugano–Zürich' },
  { id: 'brenner', south: 'bozen', north: 'innsbruck', label: 'Bozen–Innsbruck' },
] as const);
export const foehnPath = (run: string) => `${ATMO_DIR}/${run}/foehn.json`;
export interface AtmoFoehnFile {
  schema: number;
  run: string;
  model: string;
  param: 'PMSL';
  unit: 'hPa';
  steps: number[];
  stations: Array<FoehnStation & { cellLat: number; cellLon: number; hsurf: number }>;
  /** `pmsl[station id][step index]`, hPa, one decimal; null = missing. */
  pmsl: Record<string, Array<number | null>>;
}

// ── Surface fields (DWD thermal fields) ──────────────────────────────────────────────────────────────────────────────
export const SFC_STEP = 0.02;
export const SFC_NY = Math.round((ATMO_GRID.latMax - ATMO_GRID.latMin) / SFC_STEP) + 1;
export const SFC_NX = Math.round((ATMO_GRID.lonMax - ATMO_GRID.lonMin) / SFC_STEP) + 1;
/** 25 × 0.02° = 0.5°: the same tile blocks as the cube. */
export const SFC_TILE_CELLS = 25;
export const SFC_TILES_Y = Math.ceil(SFC_NY / SFC_TILE_CELLS);
export const SFC_TILES_X = Math.ceil(SFC_NX / SFC_TILE_CELLS);

export type SfcVarId = 'htop_dc' | 'hbas_sc' | 'htop_sc' | 'ceiling' | 'hzerocl' | 'snowlmt' | 'cape_ml' | 'cin_ml';
export interface SfcVar {
  id: SfcVarId; param: string; unit: string; scale: number; min: number; max: number;
  /** Height field cut off at the model ground: value ≤ HSURF + groundCapM ⇒ CAPPED. */
  groundCapM?: number;
}
/** Append only — the order is the payload order of new runs. */
export const SFC_VARS: readonly SfcVar[] = Object.freeze([
  { id: 'htop_dc', param: 'HTOP_DC', unit: 'm', scale: 1, min: -1000, max: 15000 },
  { id: 'hbas_sc', param: 'HBAS_SC', unit: 'm', scale: 1, min: 0, max: 15000 },
  { id: 'htop_sc', param: 'HTOP_SC', unit: 'm', scale: 1, min: 0, max: 20000 },
  { id: 'ceiling', param: 'CEILING', unit: 'm', scale: 1, min: -500, max: 25000, groundCapM: 20 },
  { id: 'hzerocl', param: 'HZEROCL', unit: 'm', scale: 1, min: -500, max: 8000, groundCapM: 1 },
  { id: 'snowlmt', param: 'SNOWLMT', unit: 'm', scale: 1, min: -500, max: 8000, groundCapM: 10 },
  { id: 'cape_ml', param: 'CAPE_ML', unit: 'J/kg', scale: 1, min: 0, max: 15000 },
  { id: 'cin_ml', param: 'CIN_ML', unit: 'J/kg', scale: 1, min: -1500, max: 1500 },
]);
/** SNOWLMT NaN while the freezing level is less than this above the model ground ⇒ snow limit below ground (CAPPED). */
export const SNOWLMT_CAP_HZEROCL_M = 500;

export const sfcLat = (iy: number) => +(ATMO_GRID.latMin + iy * SFC_STEP).toFixed(4);
export const sfcLon = (ix: number) => +(ATMO_GRID.lonMin + ix * SFC_STEP).toFixed(4);
export function sfcTileExtent(ty: number, tx: number): { y0: number; x0: number; ny: number; nx: number } {
  const y0 = ty * SFC_TILE_CELLS, x0 = tx * SFC_TILE_CELLS;
  return { y0, x0, ny: Math.min(SFC_TILE_CELLS, SFC_NY - y0), nx: Math.min(SFC_TILE_CELLS, SFC_NX - x0) };
}
export const sfcTilePath = (run: string, ty: number, tx: number) => `${ATMO_DIR}/${run}/sfc/${pad2(ty)}_${pad2(tx)}.bin`;

export interface AtmoSfcHeader {
  schema: number;
  kind: 'sfc';
  run: string;
  model: string;
  tile: [number, number];
  y0: number; x0: number; ny: number; nx: number;
  gridStep: number;
  steps: number[];
  vars: Array<{ id: string; unit: string; scale: number }>;
}

export interface AtmoSfcTile {
  header: AtmoSfcHeader;
  /** Model orography per cell (m above MSL), cell order iy-major. */
  hsurf: Float32Array;
  /** `values[var][cell * nSteps + step]` in the var's unit, NaN = missing; a CAPPED value reads as the cell's HSURF. */
  values: Partial<Record<SfcVarId, Float32Array>>;
  /** 1 = cut off at the model ground (same index as `values`). */
  capped: Partial<Record<SfcVarId, Uint8Array>>;
}

export const sfcPayloadLength = (nCells: number, nSteps = ATMO_STEPS.length, nVars = SFC_VARS.length) => nCells + nVars * nCells * nSteps;

export function encodeSfcPayload(p: Int16Array, nCells: number, nSteps: number): void {
  const nVars = (p.length - nCells) / (nCells * nSteps);
  for (let s = 0, ns = nVars * nCells; s < ns; s++) {
    const o = nCells + s * nSteps;
    for (let t = nSteps - 1; t > 0; t--) p[o + t] = wrap16(p[o + t] - p[o + t - 1]);
  }
  for (let i = nCells; i < p.length; i++) p[i] = ((p[i] << 1) ^ (p[i] >> 15)) << 16 >> 16;
}
export function decodeSfcPayload(p: Int16Array, nCells: number, nSteps: number): void {
  const nVars = (p.length - nCells) / (nCells * nSteps);
  for (let i = nCells; i < p.length; i++) { const u = p[i] & 0xffff; p[i] = (u >>> 1) ^ -(u & 1); }
  for (let s = 0, ns = nVars * nCells; s < ns; s++) {
    const o = nCells + s * nSteps;
    for (let t = 1; t < nSteps; t++) p[o + t] = wrap16(p[o + t] + p[o + t - 1]);
  }
}

export async function decodeAtmoSfcTile(bytes: Uint8Array): Promise<AtmoSfcTile> {
  const { header, deflated } = unpackTile<AtmoSfcHeader>(bytes);
  if (header.kind !== 'sfc') throw new Error('atmo: keine Bodenfeld-Kachel');
  const stream = new Blob([deflated as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const p = unshuffle(new Uint8Array(await new Response(stream).arrayBuffer()));
  const nCells = header.ny * header.nx, nSteps = header.steps.length, nVars = header.vars.length;
  if (p.length !== sfcPayloadLength(nCells, nSteps, nVars)) throw new Error(`atmo: Bodenfeld-Nutzlast ${p.length} ≠ ${sfcPayloadLength(nCells, nSteps, nVars)}`);
  decodeSfcPayload(p, nCells, nSteps);
  const hsurf = new Float32Array(nCells);
  for (let c = 0; c < nCells; c++) hsurf[c] = p[c] === MISSING ? NaN : p[c];
  const values: AtmoSfcTile['values'] = {}, capped: AtmoSfcTile['capped'] = {};
  header.vars.forEach((v, vi) => {
    const a = new Float32Array(nCells * nSteps), m = new Uint8Array(nCells * nSteps), o = nCells + vi * nCells * nSteps;
    for (let i = 0; i < a.length; i++) {
      const q = p[o + i];
      if (q === CAPPED) { a[i] = hsurf[Math.floor(i / nSteps)]; m[i] = 1; } else a[i] = q === MISSING ? NaN : q / v.scale;
    }
    values[v.id as SfcVarId] = a; capped[v.id as SfcVarId] = m;
  });
  return { header, hsurf, values, capped };
}
