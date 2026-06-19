/**
 * Decompress-Pool: lagert bz2-/gzip-Entpacken in einen Pool von Web-Workern
 * aus (parallel über mehrere Kerne, ohne den Main-Thread zu blockieren). Fällt
 * transparent auf Main-Thread-Entpacken zurück, falls Worker nicht verfügbar
 * sind.
 *
 * Hintergrund: ein ICON-D2-tot_prec-`.bz2` entpackt zu ~6,5 MB; bei ~46
 * Schritten waren das ~3,8 s reines bz2 auf dem Main-Thread (= Kaltstart-Ruckler).
 */

import 'bz2'; // Main-Thread-Fallback hängt sich an window.bz2

declare global {
  interface Window {
    bz2: { decompress: (u: Uint8Array) => Uint8Array };
  }
}

interface Pending {
  resolve: (u: Uint8Array) => void;
  reject: (e: Error) => void;
  /** Originalpuffer für den Fallback, falls die Worker-Antwort fehlschlägt. */
  buf: ArrayBuffer;
}

const POOL_SIZE = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4));
let workers: Worker[] = [];
let usable = true;
let inited = false;
let rr = 0;
let nextId = 1;
const pending = new Map<number, Pending>();

function init() {
  if (inited) return;
  inited = true;
  try {
    for (let i = 0; i < POOL_SIZE; i++) {
      const w = new Worker(new URL('./bz2Worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: ArrayBuffer; error?: string }>) => {
        const { id, ok, result } = e.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        // Bei Worker-Fehler (z.B. bz2-Setup) NICHT hart abbrechen, sondern den
        // Originalpuffer auf dem Main-Thread entpacken — so läuft ICON-D2 auch
        // dann, wenn der Worker-bz2-Pfad in einer Umgebung nicht greift.
        if (ok && result) p.resolve(new Uint8Array(result));
        else mainThreadDecompress(p.buf).then(p.resolve, p.reject);
      };
      w.onerror = () => {
        usable = false;
        // hängende Anfragen auf den Main-Thread umleiten (Fallback).
        for (const [id, p] of pending) {
          pending.delete(id);
          mainThreadDecompress(p.buf).then(p.resolve, p.reject);
        }
      };
      workers.push(w);
    }
  } catch {
    usable = false;
    workers = [];
  }
}

async function mainThreadDecompress(buf: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return window.bz2.decompress(bytes);
}

/**
 * Entpackt einen bz2-/gzip-`ArrayBuffer`. Der Puffer wird (bei Worker-Pfad) an
 * den Worker transferiert — der Aufrufer darf ihn danach nicht weiterverwenden.
 */
export function decompress(buf: ArrayBuffer): Promise<Uint8Array> {
  init();
  if (!usable || workers.length === 0) return mainThreadDecompress(buf);
  const w = workers[rr++ % workers.length];
  const id = nextId++;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject, buf });
    try {
      // Eingabe (~20 KB) per Structured-Clone senden, NICHT transferieren —
      // so bleibt `buf` für den Main-Thread-Fallback erhalten. Der teure Teil
      // (entpackte ~6,5 MB) wird vom Worker zurück-transferiert.
      w.postMessage({ id, buf });
    } catch {
      pending.delete(id);
      mainThreadDecompress(buf).then(resolve, reject);
    }
  });
}
