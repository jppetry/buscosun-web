/**
 * Web-Worker: dekomprimiert bz2-/gzip-Puffer abseits des Main-Threads, damit
 * das Laden der RADOLAN-/ICON-D2-Frames die UI nicht blockiert (und über einen
 * Pool parallel über mehrere Kerne läuft).
 *
 * Die `bz2`-Lib hängt sich an `window` (sonst an `module.exports`). Im Worker
 * gibt es kein `window` → wir spiegeln `globalThis` als `window`, BEVOR die Lib
 * (dynamisch) importiert wird, sodass sie `globalThis.bz2` setzt.
 */
/// <reference lib="webworker" />

(globalThis as unknown as { window: unknown }).window = globalThis;

import BZip2 from 'bzip2-wasm';

// WASM-bzip2 (Emscripten) — ~100× schneller als die pure-JS-`bz2`-Lib. Lazy einmal
// initialisiert. Schlägt die WASM-Last fehl (z.B. Bundling im Worker), liefert
// getWasmBz2() null → automatischer Fallback auf pure-JS.
let wasmBz2Promise: Promise<BZip2 | null> | null = null;
function getWasmBz2(): Promise<BZip2 | null> {
  if (!wasmBz2Promise) {
    wasmBz2Promise = (async () => {
      try {
        const bz = new BZip2();
        // Timeout: lädt die WASM nicht (z.B. Bundling-Problem), NICHT hängen
        // bleiben, sondern auf pure-JS zurückfallen.
        await Promise.race([
          bz.init(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('wasm init timeout')), 4000)),
        ]);
        return bz;
      } catch { return null; }
    })();
  }
  return wasmBz2Promise;
}
/** Ziel-Puffergrößen fürs WASM-Entpacken (Leiter mit Auto-Vergrößerung).
 *  ICON-D2-Felder < 2 MB → erste Stufe (8 MB) reicht und ist schnell. Der
 *  RADOLAN-RV-Tar entpackt aber auf ~66 MB (25 Frames × 1100×1200×2 B) und
 *  sprengte bisher den 8-MB-Puffer → er fiel auf die ~100× langsamere pure-JS-
 *  bz2-Lib zurück (das war der Kaltstart-Engpass des Regenradars). Bei
 *  BZ_OUTBUFF_FULL probieren wir die nächstgrößere Stufe, bevor pure-JS greift. */
const WASM_DEST_STEPS = [8 * 1024 * 1024, 96 * 1024 * 1024];

// Pure-JS-bz2 als Fallback (hängt sich an globalThis.bz2).
let bz2Promise: Promise<{ decompress: (u: Uint8Array) => Uint8Array }> | null = null;
function getBz2() {
  if (!bz2Promise) {
    bz2Promise = import('bz2').then(
      () => (globalThis as unknown as { bz2: { decompress: (u: Uint8Array) => Uint8Array } }).bz2,
    );
  }
  return bz2Promise;
}

/** Entpackt einen bz2-Puffer: WASM bevorzugt, pure-JS als Fallback. */
async function decompressBz2(bytes: Uint8Array): Promise<Uint8Array> {
  const wasm = await getWasmBz2();
  if (wasm) {
    for (const dest of WASM_DEST_STEPS) {
      try { return wasm.decompress(bytes, dest); }
      catch { /* Zielpuffer zu klein → nächste Stufe, sonst pure-JS */ }
    }
  }
  return (await getBz2()).decompress(bytes);
}

interface Req { id: number; buf: ArrayBuffer }

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, buf } = e.data;
  try {
    const bytes = new Uint8Array(buf);
    let out: Uint8Array;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      // gzip — nativ im Worker verfügbar
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      out = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      out = await decompressBz2(bytes);
    }
    // exaktgroßen Puffer transferieren (bz2 liefert evtl. eine subarray-View)
    const exact = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength ? out : out.slice();
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void })
      .postMessage({ id, ok: true, result: exact.buffer }, [exact.buffer]);
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
