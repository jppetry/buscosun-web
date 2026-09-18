/**
 * decodeWorker.ts — ein Cube-Chunk abseits des Hauptthreads entpacken (Phase FI, AP1).
 *
 * Der Chunk kommt als Kopie herein (der Aufrufer behält seine Bytes — sie liegen im
 * Cache), die entpackten Ebenen gehen als Transfer zurück (ein t1-Chunk sind 57 × 49 ×
 * 256 × 2 B ≈ 1,4 MB — eine Kopie davon wäre die Hälfte der Ersparnis). Gerechnet wird
 * mit DERSELBEN Funktion wie im Hauptthread (`decodeCubeChunk`), damit es nichts gibt,
 * was der Worker anders macht als der Rückfall.
 */
/// <reference lib="webworker" />

import { decodeCubeChunk } from '../cubeFormat';

interface Req {
  id: number;
  buf: ArrayBuffer;
  planes: string[];
  wanted?: string[];
  /** AP12 (c): aus Bereichen zusammengesetzt ⇒ keine CRC über die ganze Nutzlast. */
  checkCrc?: boolean;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, buf, planes, wanted, checkCrc } = e.data;
  try {
    const chunk = await decodeCubeChunk(new Uint8Array(buf), { planes: planes.map((p) => ({ id: p })), wanted, ...(checkCrc === false ? { checkCrc: false } : {}) });
    const { planes: arrays, ...header } = chunk;
    const bufs = arrays.map((a) => (a.byteOffset === 0 && a.byteLength === a.buffer.byteLength ? a.buffer : a.slice().buffer) as ArrayBuffer);
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void })
      .postMessage({ id, ok: true, header, planes: bufs }, bufs);
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
