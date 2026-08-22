/**
 * Point query on the hourly fire-weather raster — the counterpart of
 * `src/wind/windPointSample.ts`, same construction, same guarantees.
 *
 * It returns **ISZ**, the zero-wind ISI, because that is what the FBP slope
 * correction consumes (`fbp.ts`, Eqs. 41/44). The producer writes ISZ into the
 * frame's G channel (`iconD2FireWeather.ts`), so no inversion is needed and the
 * value stays consistent with the FFMC state of that very cell.
 *
 * One rule matters more than the interpolation: **the mask is read
 * nearest-neighbour on all four corners.** Bilinear blending of the alpha
 * channel would mix a masked cell (outside the domain, under snow, no data)
 * into a value and produce a number where the model has none. One masked corner
 * ⇒ `null`, and the caller names the gap.
 */

import { frameAtValidTime } from '../../sources/frameAtValidTime';
import { ISZ_VMAX, type IconD2FireWeather } from '../../sources/iconD2FireWeather';
import { bilinear, decodeImage, texelCoord, type Decoded } from '../../wind/windPointSample';

export interface IsiSample {
  /** Zero-wind ISI at the point. */
  iszValue: number;
  /** Valid time of the frame actually used (ms UTC) — the caller checks the distance. */
  validAtMs: number;
}

/** Byte of the G channel back to an ISZ value. */
export function iszFromChannel(byte: number): number {
  return (byte / 255) * ISZ_VMAX;
}

/** True when every one of the four surrounding cells carries data (alpha 255). */
export function maskIntact(d: Decoded, u: number, v: number): boolean {
  // MUSS dieselbe Texel-Konvention benutzen wie `bilinear` — sonst prüft die
  // Maske andere Zellen, als der Wert gemischt wird (KL3, `texelCoord`).
  const x = texelCoord(u, d.w), y = texelCoord(v, d.h);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(d.w - 1, x0 + 1), y1 = Math.min(d.h - 1, y0 + 1);
  const a = (xx: number, yy: number) => d.data[(yy * d.w + xx) * 4 + 3];
  return a(x0, y0) === 255 && a(x1, y0) === 255 && a(x0, y1) === 255 && a(x1, y1) === 255;
}

/**
 * ISZ at a point and time, or `null` when the point lies outside the grid or any
 * surrounding cell is masked.
 */
export function sampleIszAt(
  fw: IconD2FireWeather | null,
  targetMs: number,
  lon: number,
  lat: number,
): IsiSample | null {
  if (!fw || fw.frames.length === 0) return null;
  const f = frameAtValidTime(fw.frames, targetMs);
  const [x0, y0, x1, y1] = fw.uvBounds;
  const ux = (lon + 180) / 360, uy = (90 - lat) / 180;
  const tu = (ux - x0) / (x1 - x0), tv = (uy - y0) / (y1 - y0);
  if (!(tu >= 0 && tu <= 1 && tv >= 0 && tv <= 1)) return null;
  const d = decodeImage(f.image);
  if (!maskIntact(d, tu, tv)) return null;
  return { iszValue: iszFromChannel(bilinear(d, tu, tv, 1)), validAtMs: f.validAt.getTime() };
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread).
// Canvas-free: only the pure helpers are exercised here; the DOM path is
// covered by the source probes in the verifier and by the browser run.
// ---------------------------------------------------------------------------

export interface IsiSampleCheck { name: string; ok: boolean; detail?: string }

export function verifyIsiPointSample(): { checks: IsiSampleCheck[]; passed: number; total: number } {
  const checks: IsiSampleCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('Kanalwert 0 ist ISZ 0', iszFromChannel(0) === 0);
  add('Kanalwert 255 ist die Obergrenze ISZ_VMAX', iszFromChannel(255) === ISZ_VMAX);
  add('die Quantisierung bleibt unter 0,1 ISZ', ISZ_VMAX / 255 < 0.1, `${(ISZ_VMAX / 255).toFixed(3)}`);
  add('ISZ_VMAX deckt den physikalisch möglichen Bereich (0,208·91,9 = 19,1)',
    ISZ_VMAX >= 0.208 * 91.9);

  // Mask: a 2×2 field with one masked corner must be rejected as a whole.
  const field = (alphas: number[]): Decoded => ({
    w: 2, h: 2,
    data: Uint8ClampedArray.from(alphas.flatMap((a) => [0, 128, 0, a])),
  });
  add('alle vier Ecken mit Daten ⇒ Maske intakt', maskIntact(field([255, 255, 255, 255]), 0.5, 0.5));
  for (let i = 0; i < 4; i++) {
    const a = [255, 255, 255, 255];
    a[i] = 0;
    add(`eine maskierte Ecke (${i}) ⇒ kein Wert`, !maskIntact(field(a), 0.5, 0.5));
  }
  add('teilweise maskiert wird nicht weichgezeichnet: die Maske ist nearest-neighbour',
    !maskIntact(field([255, 255, 255, 254]), 0.5, 0.5));
  add('ohne Daten kein Wert', sampleIszAt(null, 0, 11, 48) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
