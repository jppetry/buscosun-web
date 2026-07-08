/**
 * Web-Worker: GRIB2-Decode + Akkumulations-Diff + Uint8-Quantisierung für den
 * generischen ICON-D2-Gitter-Loader (Niederschlag/Wolken/CAPE) — s.
 * gribGridDecode.ts. Läuft off-main, damit die ~27 Schritte eines Laufs nicht
 * mehr kumulativ ~1,5-2,5 s Main-Thread blockieren (4×-CPU-Throttle, gemessen).
 * Nur DOM-freie Importe → läuft sauber im Worker.
 */
/// <reference lib="webworker" />

import { decodeGridStep, type GridToU8Kind } from './gribGridDecode';

interface Req {
  id: number;
  bytesBuf: ArrayBuffer;
  /** Rohe Vorgänger-Werte (nur bei accumulate) — transferiert, nicht kopiert. */
  refBuf: ArrayBuffer | null;
  accumulate: boolean;
  kind: GridToU8Kind;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, bytesBuf, refBuf, accumulate, kind } = e.data;
  try {
    const bytes = new Uint8Array(bytesBuf);
    const ref = refBuf ? new Float32Array(refBuf) : null;
    const out = decodeGridStep(bytes, ref, accumulate, kind);
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
      {
        id, ok: true,
        valuesBuf: out.values.buffer, width: out.width, height: out.height,
        rawBuf: out.rawValues.buffer, corners: out.corners,
      },
      [out.values.buffer, out.rawValues.buffer],
    );
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
