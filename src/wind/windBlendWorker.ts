/**
 * Web-Worker: Geschwindigkeitsraum-Blend zweier Wind-Stunden-Frames + Upsample/
 * Glätten + GPU-Format-Pack (s. windBlendRefine.ts) — läuft off-main, damit ein
 * Slider-Drag (der pro Tick einen neuen Zwischen-Frame braucht) den Main
 * Thread nicht blockiert. Nur DOM-freie Importe → sauber im Worker lauffähig.
 */
/// <reference lib="webworker" />

import { blendAndRefine, type FrameNorm } from './windBlendRefine';
import type { DataTextureFormat } from './glUtil';

interface Req {
  id: number;
  aBuf: ArrayBuffer; aWidth: number; aHeight: number; aNorm: FrameNorm;
  bBuf: ArrayBuffer; bWidth: number; bHeight: number; bNorm: FrameNorm;
  t: number;
  upsample: number;
  kind: DataTextureFormat['kind'];
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, aBuf, aWidth, aHeight, aNorm, bBuf, bWidth, bHeight, bNorm, t, upsample, kind } = e.data;
  try {
    const out = blendAndRefine({
      aPx: new Uint8ClampedArray(aBuf), aWidth, aHeight, aNorm,
      bPx: new Uint8ClampedArray(bBuf), bWidth, bHeight, bNorm,
      t, upsample, kind,
    });
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
      {
        id, ok: true,
        dataBuf: out.packed.data.buffer, packedKind: out.packed.kind,
        width: out.width, height: out.height,
        uMin: out.uMin, uMax: out.uMax, vMin: out.vMin, vMax: out.vMax,
      },
      [out.packed.data.buffer],
    );
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
