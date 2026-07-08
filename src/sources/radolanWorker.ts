/**
 * Web-Worker: entpackt + dekodiert einen bereits bz2-entpackten RADOLAN-RV-Tar
 * (25 Frames × DE1200-Gitter) off-main (s. radolanDecode.ts). Bekommt die
 * entpackten Tar-Bytes, gibt die fertigen Werte-Grids zurück (transferiert).
 * Nur DOM-freie Importe → läuft sauber im Worker.
 */
/// <reference lib="webworker" />

import { decodeRvTar } from './radolanDecode';

interface Req { id: number; tarBuf: ArrayBuffer }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, tarBuf } = e.data;
  try {
    const { runAtMs, frames } = decodeRvTar(new Uint8Array(tarBuf));
    const out = frames.map((f) => ({
      leadMinutes: f.leadMinutes, validAtMs: f.validAtMs, width: f.width, height: f.height,
      valuesBuf: f.values.buffer,
    }));
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
      { id, ok: true, runAtMs, frames: out },
      out.map((f) => f.valuesBuf),
    );
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
