/**
 * Pure (DOM-freier) Kern der Slider-Scrub-Pipeline: Geschwindigkeitsraum-Blend
 * zweier Stunden-Frames (wie die frühere `blendWindFrames` in
 * iconD2WindSource.ts) + Upsample/Glätten (windRefine.ts) + GPU-Format-Packing
 * (glUtil.ts) — alles ohne Canvas-Zwischenschritt, in EINEM Aufruf. Läuft
 * off-main im windBlendWorker; dieselbe Funktion dient als Main-Thread-
 * Fallback, wenn der Worker nicht verfügbar ist (identisches Muster wie
 * decodeWindFrameOffMain/buildWindOnMain in iconD2WindSource.ts).
 *
 * Vorher lief pro Slider-Tick: blendWindFrames (Pixel-Loop → Bytes → Canvas)
 * GEFOLGT von WindLayer.decodeAndRefine (Canvas → Bytes → Upsample → Glätten)
 * GEFOLGT von createDataTexture (Half-Float-Pack) — drei getrennte Main-Thread-
 * Schritte mit zwei verlustbehafteten 8-Bit-Requantisierungen dazwischen.
 * Diese Funktion blendet direkt in Float-Genauigkeit und packt einmalig.
 */

import { refineNormalizedUV } from './windRefine';
import { packRgbaFloats, type DataTextureFormat, type PackedTexture } from './glUtil';

export interface FrameNorm {
  uMin: number; uMax: number; vMin: number; vMax: number;
}

export interface BlendRefineInput {
  aPx: Uint8ClampedArray | Uint8Array; aWidth: number; aHeight: number; aNorm: FrameNorm;
  bPx: Uint8ClampedArray | Uint8Array; bWidth: number; bHeight: number; bNorm: FrameNorm;
  /** 0 = reines a, 1 = reines b. */
  t: number;
  upsample: number;
  /** Ziel-GPU-Format, vorab von WindLayer bestimmt (kein GL im Worker verfügbar). */
  kind: DataTextureFormat['kind'];
}

export interface BlendRefineOutput {
  packed: PackedTexture;
  width: number;
  height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

/** Geschwindigkeitsraum-Blend zweier normierter RG-Frames → normiertes RG-Byte-Feld
 *  + neue Norm-Grenzen. Portiert aus der früheren `blendWindFrames`, nur ohne
 *  Canvas-I/O (Ein-/Ausgabe sind reine Byte-Arrays). */
function blendNormalizedUV(input: BlendRefineInput): { px: Uint8ClampedArray; width: number; height: number; uMin: number; uMax: number; vMin: number; vMax: number } {
  const { aPx, aWidth, aHeight, aNorm, bPx, bWidth, bHeight, bNorm, t } = input;
  const w = Math.min(aWidth, bWidth), h = Math.min(aHeight, bHeight);
  const aUs = aNorm.uMax - aNorm.uMin, aVs = aNorm.vMax - aNorm.vMin;
  const bUs = bNorm.uMax - bNorm.uMin, bVs = bNorm.vMax - bNorm.vMin;
  const us = new Float32Array(w * h), vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    for (let ii = 0; ii < w; ii++) {
      const ia = (jj * aWidth + ii) * 4, ib = (jj * bWidth + ii) * 4;
      const uA = aNorm.uMin + (aPx[ia] / 255) * aUs, vA = aNorm.vMin + (aPx[ia + 1] / 255) * aVs;
      const uB = bNorm.uMin + (bPx[ib] / 255) * bUs, vB = bNorm.vMin + (bPx[ib + 1] / 255) * bVs;
      const u = uA + (uB - uA) * t, v = vA + (vB - vA) * t;
      const o = jj * w + ii;
      us[o] = u; vs[o] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
  }
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
  const px = new Uint8ClampedArray(w * h * 4);
  for (let o = 0; o < w * h; o++) {
    const idx = o * 4;
    px[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
    px[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
    px[idx + 2] = 0;
    px[idx + 3] = 255;
  }
  return { px, width: w, height: h, uMin, uMax, vMin, vMax };
}

/** Blend (Geschwindigkeitsraum) + Upsample/Glätten + GPU-Format-Pack in einem
 *  Schritt — die vollständige Slider-Scrub-Pipeline, off-main lauffähig. */
export function blendAndRefine(input: BlendRefineInput): BlendRefineOutput {
  const blended = blendNormalizedUV(input);
  const refined = refineNormalizedUV(blended.px, blended.width, blended.height, input.upsample);
  const packed = packRgbaFloats(refined.rgba, input.kind);
  return {
    packed, width: refined.width, height: refined.height,
    uMin: blended.uMin, uMax: blended.uMax, vMin: blended.vMin, vMax: blended.vMax,
  };
}
