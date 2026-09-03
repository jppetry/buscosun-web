/**
 * Web-Worker: dekodiert RADOLAN-RV off-main (s. radolanDecode.ts) — zwei Aufträge:
 *
 *  · `tarBuf`  ein bereits bz2-entpackter Tar (25 Frames × DE1200-Gitter) — der Weg
 *              seit BW-5.
 *  · `pngs`    die Frame-PNGs des Daten-Repo-Spiegels (RD3). Sie hier zu dekodieren
 *              ist der Grund, warum der Bild-Weg sich anfühlt wie der Tar-Weg: 33
 *              MPixel je Lauf gehören nicht auf den Hauptthread, sonst steht die
 *              Karte still, während sie ankommen (§14.7).
 *
 * Gibt in beiden Fällen die fertigen Werte-Grids zurück (transferiert).
 * Nur DOM-freie Importe → läuft sauber im Worker.
 */
/// <reference lib="webworker" />

import { decodeRvTar } from './radolanDecode';
import { decodeGrayPng } from './grayPng';

interface Req {
  id: number;
  tarBuf?: ArrayBuffer;
  /** RD3: je Frame die PNG-Bytes + der Lead, für den sie stehen. */
  pngs?: { leadMinutes: number; validAtMs: number; buf: ArrayBuffer }[];
}

const post = (m: unknown, t?: Transferable[]) =>
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(m, t);

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, tarBuf, pngs } = e.data;
  try {
    if (pngs) {
      const out = [];
      for (const p of pngs) {
        const g = await decodeGrayPng(new Uint8Array(p.buf));
        out.push({
          leadMinutes: p.leadMinutes, validAtMs: p.validAtMs,
          width: g.width, height: g.height, valuesBuf: g.values.buffer,
        });
      }
      post({ id, ok: true, runAtMs: 0, frames: out }, out.map((f) => f.valuesBuf));
      return;
    }
    const { runAtMs, frames } = decodeRvTar(new Uint8Array(tarBuf!));
    const out = frames.map((f) => ({
      leadMinutes: f.leadMinutes, validAtMs: f.validAtMs, width: f.width, height: f.height,
      valuesBuf: f.values.buffer,
    }));
    post({ id, ok: true, runAtMs, frames: out }, out.map((f) => f.valuesBuf));
  } catch (err) {
    post({ id, ok: false, error: String(err) });
  }
};
