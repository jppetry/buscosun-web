/**
 * Web-Worker: decodiert ein ICON-D2-u+v-GRIB-Paar (`decodeGrib2`) und baut den
 * RG-Wind-Frame (RGBA-Bytes) ABSEITS des Main-Threads — bisher lief beides pro
 * geladenem Frame (×~26 am Kaltstart) auf dem Main-Thread. Bekommt die ENTPACKTEN
 * GRIB-Bytes (fetch + bz2 macht weiter der Aufrufer/bz2-Worker-Pool), gibt den
 * fertigen RGBA-Puffer + Normierung + Gitter-Ecken zurück (transferiert).
 *
 * Nur DOM-freie Importe (gribDecode, windFrameBuild) → läuft sauber im Worker.
 */
/// <reference lib="webworker" />

import { decodeGrib2, gribCorners } from '../sources/gribDecode';
import { buildWindRgba } from './windFrameBuild';

interface Req { id: number; uBuf: ArrayBuffer; vBuf: ArrayBuffer; targetWidth: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, uBuf, vBuf, targetWidth } = e.data;
  try {
    const u = decodeGrib2(new Uint8Array(uBuf));
    const v = decodeGrib2(new Uint8Array(vBuf));
    const built = buildWindRgba(u, v, targetWidth);
    const corners = gribCorners(u);
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
      {
        id, ok: true,
        rgba: built.rgba.buffer, width: built.width, height: built.height,
        uMin: built.uMin, uMax: built.uMax, vMin: built.vMin, vMax: built.vMax, corners,
      },
      [built.rgba.buffer],
    );
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
