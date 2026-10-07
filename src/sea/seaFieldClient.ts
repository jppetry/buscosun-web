/**
 * V-SW-10 — client of `seaFieldWorker.ts`: `colourFieldAsync` has the signature of `colourField` and returns a promise.
 * Without Worker support, or when the worker crashes, it falls back to the main thread (same bytes, `seaView.colourField`).
 * The source image is copied into the worker (the page keeps it for arrows and sampling).
 */
import { colourField } from './seaView';
import type { SeaLayer } from './seaState';
import type { SeaFieldReply } from './seaFieldWorker';

let worker: Worker | null = null;
let workerUsable = typeof Worker !== 'undefined';
let nextId = 1;
const pending = new Map<number, { resolve: (o: Uint8ClampedArray) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (!workerUsable) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./seaFieldWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SeaFieldReply>) => {
      const d = e.data;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok && d.out) p.resolve(d.out);
      else p.reject(new Error(d.error || 'sea field worker error'));
    };
    worker.onerror = () => {
      workerUsable = false;
      for (const [id, p] of pending) { pending.delete(id); p.reject(new Error('sea field worker crashed')); }
      worker = null;
    };
    return worker;
  } catch {
    workerUsable = false;
    return null;
  }
}

export function colourFieldAsync(rgba: Uint8ClampedArray | Uint8Array, width: number, half: 0 | 1, layer: SeaLayer, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  const w = getWorker();
  if (!w) return Promise.resolve(colourField(rgba, width, half, layer));
  const id = nextId++;
  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    signal?.addEventListener('abort', () => { pending.delete(id); reject(new Error('aborted')); }, { once: true });
    w.postMessage({ id, rgba, width, half, layer });
  }).catch((err: Error) => {
    if (signal?.aborted || err.message === 'aborted') throw err;
    return colourField(rgba, width, half, layer);
  });
}
