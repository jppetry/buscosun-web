/**
 * DEM elevation lookup built from Mapzen Terrarium tiles.
 *
 * Used by the FusionEngine's elevation-aware IDW: temperature samples are
 * reduced to sea-level equivalent (T + h·γ) before interpolation and the
 * lapse rate is re-applied to each dense grid cell using its actual DEM
 * altitude. This produces realistic alpine cooling without needing an
 * explicit topography term in the underlying NWP.
 *
 * Terrarium encoding (https://github.com/tilezen/joerd):
 *   elevation_meters = R · 256 + G + B / 256 − 32768
 */

import type { ForecastBounds } from '../sources/openMeteoForecast';

const TERRARIUM_TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Standard lapse rate (cooling per metre of altitude, °C). */
export const STANDARD_LAPSE_RATE_PER_M = 0.0065;

/**
 * Read elevation from a 256×256 terrarium tile pixel. `data` is a Uint8ClampedArray
 * in RGBA order (length 256·256·4).
 */
function decodeTerrariumPixel(data: Uint8ClampedArray, idx: number): number {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return r * 256 + g + b / 256 - 32768;
}

function lng2tileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * (1 << z);
}
function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z)
  );
}

interface TilePixels {
  z: number;
  x: number;
  y: number;
  data: Uint8ClampedArray;
}

async function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<TilePixels | null> {
  const url = TERRARIUM_TPL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  try {
    // fetch + createImageBitmap is more reliable than <img> + crossOrigin
    // for tainted-canvas situations: S3 returns CORS headers on the fetch
    // path but cached <img> requests sometimes don't carry them, leaving the
    // canvas tainted and getImageData throwing SecurityError.
    const res = await fetch(url, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    const imgData = ctx.getImageData(0, 0, 256, 256);
    return { z, x, y, data: imgData.data };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    return null;
  }
}

export interface ElevationGrid {
  /** Lookup elevation (m, NaN = no data) for arbitrary (lng, lat). */
  sample(lng: number, lat: number): number;
  /** Pre-computed dense elevation grid in row-major order (j*cols + i). */
  buildGrid(bounds: ForecastBounds, cols: number, rows: number): Float32Array;
}

/**
 * Build an elevation lookup by pre-loading all Terrarium tiles that cover
 * `bounds` at the chosen zoom. Zoom 4 (≈22.5° per tile) is the sweet spot
 * for continent-wide bounds: 4 tiles cover Europe, each ≈ 60 kB PNG.
 */
export async function loadElevationLookup(
  bounds: ForecastBounds,
  zoom = 4,
  signal?: AbortSignal,
): Promise<ElevationGrid> {
  const x0 = Math.floor(lng2tileX(bounds.lngMin, zoom));
  const x1 = Math.floor(lng2tileX(bounds.lngMax, zoom));
  const y0 = Math.floor(lat2tileY(bounds.latMax, zoom));
  const y1 = Math.floor(lat2tileY(bounds.latMin, zoom));
  const tilesNeeded: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tilesNeeded.push([x, y]);
    }
  }
  const loaded = await Promise.all(tilesNeeded.map(([x, y]) => loadTile(zoom, x, y, signal)));
  const tiles = new Map<string, TilePixels>();
  for (const t of loaded) {
    if (t) tiles.set(`${t.z}/${t.x}/${t.y}`, t);
  }

  function sample(lng: number, lat: number): number {
    const fx = lng2tileX(lng, zoom);
    const fy = lat2tileY(lat, zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const tile = tiles.get(`${zoom}/${tx}/${ty}`);
    if (!tile) return NaN;
    // Sub-pixel bilinear within the tile.
    const px = (fx - tx) * 256;
    const py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px)));
    const j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1);
    const j1 = Math.min(255, j0 + 1);
    const fxr = px - i0;
    const fyr = py - j0;
    const e00 = decodeTerrariumPixel(tile.data, (j0 * 256 + i0) * 4);
    const e10 = decodeTerrariumPixel(tile.data, (j0 * 256 + i1) * 4);
    const e01 = decodeTerrariumPixel(tile.data, (j1 * 256 + i0) * 4);
    const e11 = decodeTerrariumPixel(tile.data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr;
    const e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  }

  function buildGrid(b: ForecastBounds, cols: number, rows: number): Float32Array {
    const grid = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      const lat = b.latMin + (j / Math.max(1, rows - 1)) * (b.latMax - b.latMin);
      for (let i = 0; i < cols; i++) {
        const lng = b.lngMin + (i / Math.max(1, cols - 1)) * (b.lngMax - b.lngMin);
        const e = sample(lng, lat);
        // Sea pixels (encoded as 0..1 m sometimes) get clamped to 0
        grid[j * cols + i] = Number.isFinite(e) ? Math.max(0, e) : 0;
      }
    }
    return grid;
  }

  return { sample, buildGrid };
}
