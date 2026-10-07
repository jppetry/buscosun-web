/**
 * V-SW-10 — Web worker: colours one CWAM field for the map off the main thread (`seaView.colourField`, ≈ 0,6–1,2 Mio.
 * pixels per hour/layer change). Same function, same bytes as on the main thread (`verify:sea-ui` compares them).
 * Only DOM-free imports (`seaView.ts` is pure).
 */
/// <reference lib="webworker" />

import { colourField } from './seaView';
import type { SeaLayer } from './seaState';

export interface SeaFieldReq { id: number; rgba: Uint8ClampedArray; width: number; half: 0 | 1; layer: SeaLayer }
export interface SeaFieldReply { id: number; ok: boolean; out?: Uint8ClampedArray; error?: string }

const post = (m: SeaFieldReply, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage: (x: unknown, t?: Transferable[]) => void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<SeaFieldReq>) => {
  const { id, rgba, width, half, layer } = e.data;
  try {
    const out = colourField(rgba, width, half, layer);
    post({ id, ok: true, out }, [out.buffer]);
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
