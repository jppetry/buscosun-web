/**
 * decodePool.ts — Cube-Chunks in einem Pool von Web-Workern entpacken, mit
 * Hauptthread-Rückfall (Phase FI, AP1). Muster: `src/sources/decompress.ts`.
 *
 * ── Warum ─────────────────────────────────────────────────────────────────
 * Ein t1-Chunk hat 57 Ebenen à ≈ 25 KB deflate; entpacken + Zeilendifferenz kosten in
 * Node 74 ms, im Browser mit `DecompressionStream` ähnlich — auf einem 4×-gedrosselten
 * Mobilgerät sind das ≈ 300 ms je Chunk, drei Chunks plus ein Stationsbündel über eine
 * Sekunde Hauptthread. Das ist ein Long Task (§6: kein Long Task > 200 ms) und läuft
 * nicht parallel zum Netz. Im Pool laufen die Chunks nebeneinander auf mehreren Kernen,
 * während die nächsten Bytes noch kommen.
 *
 * ── Vertrag ───────────────────────────────────────────────────────────────
 * `decodeChunkPooled(bytes, { planes, wanted })` liefert GENAU das, was
 * `decodeCubeChunk` liefert — der Verifier vergleicht beide Wege Ebene für Ebene. Ohne
 * `Worker` (Node, alte Browser) oder nach einem Worker-Fehler rechnet der Hauptthread;
 * `decodePoolInfo()` sagt, welcher Weg gefahren wurde (der Laufzeit-Harnisch berichtet es).
 *
 * `configureDecodePool({ workers: 0 })` erzwingt den Hauptthread — für die
 * Vorher/Nachher-Messung auf demselben Harnisch.
 */

import { decodeCubeChunk, type CubeChunk, type CubeChunkHeader } from '../cubeFormat';

export interface DecodeOpts {
  planes: readonly { id: string }[];
  wanted?: readonly string[];
}

export type ChunkDecoder = (bytes: Uint8Array, opts: DecodeOpts) => Promise<CubeChunk>;

/** Der Hauptthread-Weg, unverändert. */
export const decodeChunkMain: ChunkDecoder = (bytes, opts) => decodeCubeChunk(bytes, { planes: opts.planes, wanted: opts.wanted });

interface Pending {
  resolve: (c: CubeChunk) => void;
  reject: (e: Error) => void;
  bytes: Uint8Array;
  opts: DecodeOpts;
  timer: ReturnType<typeof setTimeout>;
}

interface PoolConfig {
  workers: number;
  createWorker: (() => Worker) | null;
  /** Nach dieser Frist übernimmt der Hauptthread eine hängende Worker-Antwort. */
  jobTimeoutMs: number;
}

const defaultWorkers = () => {
  const hc = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(hc, 3));
};

const config: PoolConfig = {
  workers: defaultWorkers(),
  createWorker: null,
  jobTimeoutMs: 15_000,
};

let workers: Worker[] = [];
let usable = typeof Worker !== 'undefined';
let inited = false;
let rr = 0;
let nextId = 1;
const pending = new Map<number, Pending>();
const info = { decoded: 0, viaWorker: 0, viaMain: 0, fallbacks: 0, errors: [] as string[] };

export function configureDecodePool(opts: Partial<PoolConfig>): void {
  // Unverändert ⇒ nichts tun: ein Neuaufbau lädt das Worker-Skript neu (im Lab auf 3G
  // gemessen 3 s je Aufruf — ein Artefakt, das kein Nutzer sehen soll).
  const same = inited
    && (opts.workers === undefined || opts.workers === config.workers)
    && (opts.createWorker === undefined || opts.createWorker === config.createWorker);
  Object.assign(config, opts);
  if (same) return;
  // Neu konfigurieren heißt: Pool neu aufbauen.
  for (const w of workers) { try { w.terminate(); } catch { /* egal */ } }
  workers = [];
  inited = false;
  usable = typeof Worker !== 'undefined' && config.workers > 0;
}

function spawn(): Worker {
  if (config.createWorker) return config.createWorker();
  // Vite löst `new URL('./decodeWorker.ts', import.meta.url)` in einen eigenen Chunk auf;
  // das esbuild-Lab bedient denselben Pfad selbst.
  return new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' });
}

function failAllToMain(): void {
  for (const [id, p] of pending) {
    pending.delete(id);
    clearTimeout(p.timer);
    info.fallbacks += 1;
    decodeChunkMain(p.bytes, p.opts).then(p.resolve, p.reject);
  }
}

function init(): void {
  if (inited) return;
  inited = true;
  if (!usable || config.workers <= 0) { usable = false; return; }
  try {
    for (let i = 0; i < config.workers; i++) {
      const w = spawn();
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; header?: CubeChunkHeader; planes?: ArrayBuffer[]; error?: string }>) => {
        const { id, ok, header, planes, error } = e.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        clearTimeout(p.timer);
        if (ok && header && planes) {
          info.viaWorker += 1;
          p.resolve({ ...header, planes: planes.map((b) => new Int16Array(b)) });
        } else {
          info.fallbacks += 1;
          if (error) info.errors.push(error);
          decodeChunkMain(p.bytes, p.opts).then(p.resolve, p.reject);
        }
      };
      w.onerror = (ev) => {
        usable = false;
        info.errors.push(String((ev as ErrorEvent)?.message ?? 'worker error'));
        failAllToMain();
      };
      workers.push(w);
    }
  } catch (err) {
    usable = false;
    info.errors.push(String((err as Error)?.message ?? err));
    workers = [];
  }
}

/** Entpackt einen Chunk im Pool; fällt still, aber gezählt, auf den Hauptthread zurück. */
export const decodeChunkPooled: ChunkDecoder = (bytes, opts) => {
  init();
  info.decoded += 1;
  if (!usable || workers.length === 0) {
    info.viaMain += 1;
    return decodeChunkMain(bytes, opts);
  }
  const w = workers[rr++ % workers.length];
  const id = nextId++;
  return new Promise<CubeChunk>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      info.fallbacks += 1;
      info.errors.push(`Worker-Antwort nach ${config.jobTimeoutMs} ms ausgeblieben`);
      decodeChunkMain(bytes, opts).then(resolve, reject);
    }, config.jobTimeoutMs);
    pending.set(id, { resolve, reject, bytes, opts, timer });
    try {
      // Kopie senden, nicht transferieren: die Bytes gehören dem Aufrufer (Cache).
      const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
      w.postMessage({ id, buf, planes: opts.planes.map((p) => p.id), wanted: opts.wanted ? [...opts.wanted] : undefined });
    } catch (err) {
      pending.delete(id);
      clearTimeout(timer);
      info.fallbacks += 1;
      info.errors.push(String((err as Error)?.message ?? err));
      decodeChunkMain(bytes, opts).then(resolve, reject);
    }
  });
};

export function decodePoolInfo(): { mode: 'worker' | 'main'; workers: number; decoded: number; viaWorker: number; viaMain: number; fallbacks: number; errors: string[] } {
  return { mode: usable && workers.length > 0 ? 'worker' : 'main', workers: workers.length, ...info, errors: [...info.errors] };
}
