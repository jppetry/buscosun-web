/**
 * Web-Worker: dekodiert die RV-Frames off-main — ein Auftrag (der RADOLAN-Tar-Auftrag `tarBuf` ging mit E-HDR-7,
 * Phase HDR; das HDF5-Tar liest `hdf5Worker`):
 *
 *  · `pngs`    die Frame-PNGs des Daten-Repo-Spiegels (RD3). Sie hier zu dekodieren
 *              ist der Grund, warum der Bild-Weg sich anfühlt wie der Tar-Weg: 33
 *              MPixel je Lauf gehören nicht auf den Hauptthread, sonst steht die
 *              Karte still, während sie ankommen (§14.7).
 *              Phase HD-3: ein Eintrag mit `dual: true` ist das Dual-PNG des Spiegels
 *              (Grau + Alpha) — Kanal 1 = v1-Byte, Kanal 2 = Log-Ebene (`values2Buf`).
 *
 * Gibt die fertigen Werte-Grids zurück (transferiert).
 * Nur DOM-freie Importe → läuft sauber im Worker.
 */
/// <reference lib="webworker" />

import { decodeGrayPng, decodeGrayAlphaPng } from './grayPng';

interface Req {
  id: number;
  /** RD3: je Frame die PNG-Bytes + der Lead, für den sie stehen. */
  pngs?: { leadMinutes: number; validAtMs: number; buf: ArrayBuffer; dual?: boolean }[];
}

const post = (m: unknown, t?: Transferable[]) =>
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(m, t);

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, pngs } = e.data;
  try {
    if (pngs) {
      const out: { leadMinutes: number; validAtMs: number; width: number; height: number; valuesBuf: ArrayBuffer; values2Buf?: ArrayBuffer }[] = [];
      for (const p of pngs) {
        if (p.dual) {
          const g = await decodeGrayAlphaPng(new Uint8Array(p.buf));
          out.push({ leadMinutes: p.leadMinutes, validAtMs: p.validAtMs, width: g.width, height: g.height, valuesBuf: g.values.buffer, values2Buf: g.values2.buffer });
          continue;
        }
        const g = await decodeGrayPng(new Uint8Array(p.buf));
        out.push({
          leadMinutes: p.leadMinutes, validAtMs: p.validAtMs,
          width: g.width, height: g.height, valuesBuf: g.values.buffer,
        });
      }
      post({ id, ok: true, runAtMs: 0, frames: out }, out.flatMap((f) => (f.values2Buf ? [f.valuesBuf, f.values2Buf] : [f.valuesBuf])));
      return;
    }
    throw new Error('radolanWorker: Auftrag ohne pngs');
  } catch (err) {
    post({ id, ok: false, error: String(err) });
  }
};
