/**
 * Temperature DEM image — the computation of `buildDemImage` (iconD2TempSource.ts) without
 * the 2-second main-thread block (audit/karte-ruckler.md, RK-1).
 *
 * Same result, byte for byte (`verify:dem-build`): peak over a 3 × 3 sub-raster per cell
 * (QA fix D2/D3), cell centres (KL6), bilinear Terrarium sampling as in `elevation.ts`.
 * What changed is only the repetition: the tile column depends on the longitude alone and
 * the tile row on the latitude alone, so both are computed once per sub-column (3 × cols)
 * and sub-row (3 × rows) instead of for all 7.2 M samples, and the tile is found by array
 * index instead of a string key. The row loop hands control back to the browser whenever
 * a slice exceeds `sliceMs`, so frames and input keep flowing while the image is built.
 *
 * DOM-free: the canvas step stays in `buildDemImage`.
 */
import type { ElevationTiles } from '../fusion/elevation';

export interface DemBounds { lngMin: number; lngMax: number; latMin: number; latMax: number }

export interface DemBuildOptions {
  /** Time budget per slice before yielding (ms). Default 8. */
  sliceMs?: number;
  signal?: AbortSignal;
  /** Injected for verifiers; default yields to the browser's event loop. */
  yieldFn?: () => Promise<void>;
}

// Same formulas as `elevation.ts` (checked word for word by `verify:dem-build`).
function lng2tileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * (1 << z);
}
function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z)
  );
}
function decodeTerrariumPixel(data: Uint8ClampedArray, idx: number): number {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return r * 256 + g + b / 256 - 32768;
}

// As in iconD2TempSource.ts (NaN passes through and ends up as 0 in the byte array).
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Yield to the event loop so a frame or an input event can run (not throttled like timers). */
function yieldToBrowser(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched && typeof sched.yield === 'function') return sched.yield();
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * RGBA bytes of the DEM image over `bounds`, north-up, R = height / demMax (0…255), A = 255.
 * `rows` sets the resolution; columns follow the aspect ratio of the bounds.
 */
export async function buildDemRgba(
  tiles: ElevationTiles,
  bounds: DemBounds,
  rows: number,
  demMax: number,
  opts: DemBuildOptions = {},
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const { zoom, x0, y0, nx, ny, data: tileData } = tiles;
  const sliceMs = opts.sliceMs ?? 8;
  const yieldFn = opts.yieldFn ?? yieldToBrowser;
  const signal = opts.signal;

  const lonSpan = bounds.lngMax - bounds.lngMin;
  const latSpan = Math.max(0.01, bounds.latMax - bounds.latMin);
  const cols = Math.max(64, Math.round(rows * (lonSpan / latSpan)));
  const dLat = latSpan / rows, dLng = lonSpan / cols;
  const subs = [-0.3, 0, 0.3];

  // Fractional tile coordinates per sub-column / sub-row — the same expressions
  // `sample(lng0 + si * dLng, lat0 + sj * dLat)` evaluated, hence the same doubles.
  const fxs = new Float64Array(cols * 3);
  for (let i = 0; i < cols; i++) {
    const lng0 = bounds.lngMin + (i + 0.5) * dLng;
    for (let s = 0; s < 3; s++) fxs[i * 3 + s] = lng2tileX(lng0 + subs[s] * dLng, zoom);
  }
  const fys = new Float64Array(rows * 3);
  for (let j = 0; j < rows; j++) {
    const lat0 = bounds.latMin + (j + 0.5) * dLat;
    for (let s = 0; s < 3; s++) fys[j * 3 + s] = lat2tileY(lat0 + subs[s] * dLat, zoom);
  }

  const sample = (fx: number, fy: number): number => {
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const cx = tx - x0, cy = ty - y0;
    const tile = cx >= 0 && cx < nx && cy >= 0 && cy < ny ? tileData[cy * nx + cx] : null;
    if (!tile) return NaN;
    // Sub-pixel bilinear within the tile (as in elevation.ts `sample`).
    const px = (fx - tx) * 256;
    const py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px)));
    const j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1);
    const j1 = Math.min(255, j0 + 1);
    const fxr = px - i0;
    const fyr = py - j0;
    const e00 = decodeTerrariumPixel(tile, (j0 * 256 + i0) * 4);
    const e10 = decodeTerrariumPixel(tile, (j0 * 256 + i1) * 4);
    const e01 = decodeTerrariumPixel(tile, (j1 * 256 + i0) * 4);
    const e11 = decodeTerrariumPixel(tile, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr;
    const e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  };

  const rgba = new Uint8ClampedArray(cols * rows * 4);
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let sliceStart = now();
  for (let j = 0; j < rows; j++) {
    const y = rows - 1 - j; // south→north flip: canvas row 0 = north
    for (let i = 0; i < cols; i++) {
      let peak = -Infinity;
      for (let sj = 0; sj < 3; sj++) {
        const fy = fys[j * 3 + sj];
        for (let si = 0; si < 3; si++) {
          const e = sample(fxs[i * 3 + si], fy);
          if (Number.isFinite(e) && e > peak) peak = e;
        }
      }
      // The old code stored the peak in a Float32Array before encoding — `Math.fround` is that rounding.
      const e = peak > -Infinity ? Math.fround(peak) : NaN;
      const idx = (y * cols + i) * 4;
      rgba[idx] = Math.round(clamp01(e / demMax) * 255);
      rgba[idx + 3] = 255;
    }
    if (now() - sliceStart >= sliceMs && j < rows - 1) {
      await yieldFn();
      if (signal?.aborted) throw abortError(signal);
      sliceStart = now();
    }
  }
  return { width: cols, height: rows, rgba };
}
