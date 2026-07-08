/**
 * Pure (DOM-freier) Kern von WindLayer.decodeAndRefine: dekodiert normierte
 * RG-Bytes (R=u, G=v, je 0..255) zu kontinuierlichen Floats, upsamplet
 * bilinear und glättet leicht (3×3) — identischer Algorithmus/Output wie das
 * frühere Inline-decodeAndRefine, nur ohne die Canvas/Image-Beschaffung der
 * Eingabe-Bytes. Dadurch off-main lauffähig (s. windBlendRefine.ts /
 * windBlendWorker.ts) UND von WindLayer selbst wiederverwendbar — eine
 * einzige Implementierung statt zweier, die auseinanderdriften könnten.
 */

export interface RefinedUV {
  /** RGBA-Floats (R=u, G=v normiert [0,1], B=0, A=1) für den Textur-Upload. */
  rgba: Float32Array;
  width: number;
  height: number;
}

/**
 * `px`: RGBA-Bytes (R=u, G=v, normiert 0..255), Breite `sw` × Höhe `sh`.
 * `upsample`: CPU-Upsampling-Faktor vor dem Textur-Upload (1 = aus).
 */
export function refineNormalizedUV(
  px: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  upsample: number,
): RefinedUV {
  // Quell-u/v normiert (0..1).
  const su = new Float32Array(sw * sh);
  const sv = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    su[i] = px[i * 4] / 255;
    sv[i] = px[i * 4 + 1] / 255;
  }

  const f = Math.max(1, Math.min(4, Math.round(upsample)));
  const dw = sw * f;
  const dh = sh * f;

  // Bilineares Upsampling. Längengrad wrappt (zyklisch), Breitengrad geklemmt.
  const sampleSrc = (arr: Float32Array, fx: number, fy: number): number => {
    const gx = fx * sw - 0.5;
    const gy = fy * sh - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const wrapX = (x: number) => ((x % sw) + sw) % sw;
    const clampY = (y: number) => Math.max(0, Math.min(sh - 1, y));
    const x1 = wrapX(x0 + 1);
    const x0w = wrapX(x0);
    const y0c = clampY(y0);
    const y1c = clampY(y0 + 1);
    const a = arr[y0c * sw + x0w];
    const b = arr[y0c * sw + x1];
    const c = arr[y1c * sw + x0w];
    const d = arr[y1c * sw + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  const uu = new Float32Array(dw * dh);
  const vv = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) / dh;
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) / dw;
      const di = y * dw + x;
      uu[di] = sampleSrc(su, fx, fy);
      vv[di] = sampleSrc(sv, fx, fy);
    }
  }

  // Leichte 3×3-Glättung (zyklisch in X), um Interpolations-Kanten zu brechen.
  const smooth = (arr: Float32Array): Float32Array => {
    const out = new Float32Array(arr.length);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        let sum = 0;
        let wsum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.max(0, Math.min(dh - 1, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = ((x + dx) % dw + dw) % dw;
            const w = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
            sum += arr[yy * dw + xx] * w;
            wsum += w;
          }
        }
        out[y * dw + x] = sum / wsum;
      }
    }
    return out;
  };
  const us = f > 1 ? smooth(uu) : uu;
  const vs = f > 1 ? smooth(vv) : vv;

  const rgba = new Float32Array(dw * dh * 4);
  for (let i = 0; i < dw * dh; i++) {
    rgba[i * 4] = us[i];
    rgba[i * 4 + 1] = vs[i];
    rgba[i * 4 + 2] = 0;
    rgba[i * 4 + 3] = 1;
  }
  return { rgba, width: dw, height: dh };
}
