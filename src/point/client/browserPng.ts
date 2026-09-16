/**
 * browserPng.ts — PNG → Pixel über den Decoder des Browsers (Phase FI, AP1).
 *
 * Die Leser dieser Linie bekommen ihren PNG-Decoder injiziert (`nowcastPoint.ts`,
 * `terrain.ts`), damit sie in Node UND im Browser laufen. Hier steht die Browser-Seite:
 * `createImageBitmap` + Canvas. `OffscreenCanvas` wo vorhanden (kein DOM, läuft auch
 * im Worker), sonst ein `<canvas>`.
 *
 * ⚠ Der Browser liefert IMMER RGBA (9.0.3). `sampleNowcastFrame` verlangt EINEN Kanal —
 * für ein Werte-PNG des Spiegels ist der Rotkanal der Grauwert. Ohne diese Zeile wirft
 * der erste INCA-Frame („f015.png hat 4 Kanäle").
 */

import type { DecodedGrayPng } from '../nowcastSample';

export interface DecodedRgba {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

async function toImageData(bytes: Uint8Array): Promise<ImageData> {
  const bmp = await createImageBitmap(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('browserPng: kein 2d-Kontext (OffscreenCanvas)');
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height);
    }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('browserPng: kein 2d-Kontext');
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } finally {
    bmp.close?.();
  }
}

/** RGBA, wie `getImageData` es liefert — für Terrarium-Kacheln. */
export async function decodeRgbaPngBrowser(bytes: Uint8Array): Promise<DecodedRgba> {
  const img = await toImageData(bytes);
  return { data: img.data, width: img.width, height: img.height };
}

/** Ein Kanal (Rotkanal) — für die Werte-PNGs des Radar-Spiegels. */
export async function decodeGrayPngBrowser(bytes: Uint8Array): Promise<DecodedGrayPng> {
  const img = await toImageData(bytes);
  const rgba = img.data;
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = rgba[j];
  return { data: gray, width: img.width, height: img.height, channels: 1 };
}
