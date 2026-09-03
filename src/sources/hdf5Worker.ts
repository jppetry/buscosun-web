/**
 * Web-Worker (LE2/H3): parst INCA-NetCDF und rzc-HDF5 off-main. Bekommt die
 * rohen Datei-Bytes, gibt die fertigen `Uint8Array`-Werte-Grids transferiert
 * zurück. Nur DOM-freie Importe (`incaParse`/`rzcParse` → jsfive, RainLayer-
 * Farbregel, Lambert-Ecken) — dasselbe Muster wie `radolanWorker.ts`.
 *
 * Gemessen (LE0 §2.4): INCA-Parse 2,5 s Hauptthread im Browser — jeder
 * fertige Radar-Frame wartete dahinter.
 */
/// <reference lib="webworker" />

import { parseIncaNetcdf } from './incaParse';
import { parseRzcHdf5 } from './rzcParse';

export interface Hdf5Req { id: number; kind: 'inca' | 'rzc'; buf: ArrayBuffer }

self.onmessage = (e: MessageEvent<Hdf5Req>) => {
  const { id, kind, buf } = e.data;
  const post = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void };
  try {
    if (kind === 'inca') {
      const { frames, corners } = parseIncaNetcdf(buf);
      const out = frames.map((f) => ({ leadHours: f.leadHours, width: f.width, height: f.height, valuesBuf: f.values.buffer }));
      post.postMessage({ id, ok: true, kind, corners, frames: out }, out.map((f) => f.valuesBuf));
    } else {
      const r = parseRzcHdf5(buf);
      post.postMessage(
        { id, ok: true, kind, width: r.width, height: r.height, corners: r.corners, validAtMs: r.validAtMs, valuesBuf: r.values.buffer },
        [r.values.buffer],
      );
    }
  } catch (err) {
    post.postMessage({ id, ok: false, error: String(err) });
  }
};
