/**
 * Pixel-wise linear interpolation between two equally-sized frame textures.
 *
 * Used by MapView to produce sub-hour slider positions without re-running the
 * full FusionEngine pipeline. Lerping the PNG textures is mathematically
 * correct here because each layer's value range is fixed (temperature is
 * always normalised against -20..+40 °C, precipitation against 0..10 mm/h,
 * clouds against 0..100 %), so a pixel's R-channel encodes the same physical
 * quantity in every hour-frame.
 *
 * Wind frames are NOT lerped — their `uMin/uMax/vMin/vMax` differ per hour,
 * so a per-pixel lerp would distort speed. Wind particle persistence already
 * smooths visual transitions between integer hours.
 */

/** Re-usable canvas to avoid the toDataURL/load overhead between frames. */
const cache = new Map<string, HTMLCanvasElement>();

function getCanvas(key: string, w: number, h: number): HTMLCanvasElement {
  let c = cache.get(key);
  if (c && (c.width !== w || c.height !== h)) c = undefined;
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    cache.set(key, c);
  }
  return c;
}

type Source = HTMLImageElement | HTMLCanvasElement;

function readPixels(img: Source, w: number, h: number): Uint8ClampedArray {
  // Scratch canvas just for getImageData; cached per-size.
  const scratch = getCanvas(`__scratch_${w}x${h}`, w, h);
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function srcWidth(s: Source): number {
  return s instanceof HTMLImageElement ? (s.naturalWidth || s.width) : s.width;
}
function srcHeight(s: Source): number {
  return s instanceof HTMLImageElement ? (s.naturalHeight || s.height) : s.height;
}

/**
 * Return an HTMLCanvasElement containing the pixel-wise interpolation
 * `(1-frac)·a + frac·b`. Result canvas has the same dimensions as `a`.
 */
export function lerpFrameImage(
  a: Source,
  b: Source,
  frac: number,
  cacheKey: string,
): HTMLCanvasElement {
  const w = srcWidth(a);
  const h = srcHeight(a);
  const f = Math.max(0, Math.min(1, frac));
  const dst = getCanvas(cacheKey, w, h);
  const ctx = dst.getContext('2d', { willReadFrequently: true })!;
  if (f === 0) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(a, 0, 0, w, h);
    return dst;
  }
  if (f === 1) {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(b, 0, 0, w, h);
    return dst;
  }
  const pa = readPixels(a, w, h);
  const pb = readPixels(b, w, h);
  const out = ctx.createImageData(w, h);
  const od = out.data;
  for (let i = 0; i < od.length; i++) {
    od[i] = pa[i] * (1 - f) + pb[i] * f;
  }
  ctx.putImageData(out, 0, 0);
  return dst;
}
