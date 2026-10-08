/**
 * RD3/LE3 — Graustufen-PNG → 1 Byte je Pixel, ohne Canvas.
 *
 * Warum nicht `createImageBitmap` + `getImageData` (der Weg des ICON-Repacks)?
 * Weil die Radar-Frames 25× so groß sind: 1100 × 1200 je Bild, 33 MPixel je Lauf.
 * Canvas liefert IMMER RGBA — das sind 132 MB Zwischenpuffer, aus denen wir jeden
 * vierten Wert wieder herausziehen. **Gemessen am echten Frame (2026-09-03):
 * Canvas 627 ms, dieser Weg 206 ms — Faktor 3, bei byte-gleichem Ergebnis.**
 * Für die kleinen ICON-Bilder (608 × 373) lohnt der Unterschied nicht; dort
 * bleibt der Canvas-Weg unverändert.
 *
 * Kann NUR, was der Spiegel schreibt: PNG, 8 bit, Farbtyp 0 (Graustufen), keine
 * Interlace. Alles andere ist ein benannter Fehler — der Aufrufer fällt dann auf
 * den Canvas-Weg zurück (Rule 2), statt still etwas Falsches zu liefern.
 *
 * DOM-frei: läuft im Worker wie im Hauptthread (nur `DecompressionStream`).
 */

export class GrayPngUnsupported extends Error {}

export interface GrayPng { width: number; height: number; values: Uint8Array }
/** Phase HD-3: Dual-PNG des Spiegels (Farbtyp 4 = Grau + Alpha): Kanal 1 = v1-Byte, Kanal 2 = Log-Ebene. */
export interface GrayAlphaPng { width: number; height: number; values: Uint8Array; values2: Uint8Array }

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Phase HD-3: Dual-PNG (Farbtyp 4, 8 bit, 2 Byte je Pixel) → zwei Ebenen. Derselbe Weg wie `decodeGrayPng`
 * (Chunks, natives Deflate, Un-Filter je Zeile — hier mit 2 Byte je Pixel: der linke Nachbar liegt 2 Byte zurück).
 * Kein Canvas-Rückfall: der würde den zweiten Kanal als Alpha vormultiplizieren.
 */
export async function decodeGrayAlphaPng(bytes: Uint8Array): Promise<GrayAlphaPng> {
  const { width, height, raw } = await inflatePng(bytes, 4);
  const bpp = 2, stride = width * bpp;
  if (raw.length < height * (stride + 1)) throw new GrayPngUnsupported('Datenstrom zu kurz');
  const line = new Uint8Array(stride * height);
  let s = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[s++];
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[row + x - bpp] : 0;
      const b = y > 0 ? line[prev + x] : 0;
      const c = x >= bpp && y > 0 ? line[prev + x - bpp] : 0;
      let pred = 0;
      switch (ft) {
        case 0: pred = 0; break;
        case 1: pred = a; break;
        case 2: pred = b; break;
        case 3: pred = (a + b) >> 1; break;
        case 4: { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break; }
        default: throw new GrayPngUnsupported(`Filter ${ft}`);
      }
      line[row + x] = (raw[s + x] + pred) & 255;
    }
    s += stride;
  }
  const values = new Uint8Array(width * height), values2 = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i++) { values[i] = line[i * 2]; values2[i] = line[i * 2 + 1]; }
  return { width, height, values, values2 };
}

/** Chunks lesen, Farbtyp prüfen, IDAT nativ entpacken — geteilt von beiden Lesern. */
async function inflatePng(bytes: Uint8Array, wantColourType: number): Promise<{ width: number; height: number; raw: Uint8Array }> {
  if (bytes.length < 8) throw new GrayPngUnsupported('zu kurz');
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new GrayPngUnsupported('keine PNG-Signatur');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0, height = 0;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const body = pos + 8;
    if (body + len > bytes.length) throw new GrayPngUnsupported('Chunk hinter dem Puffer');
    if (type === 'IHDR') {
      width = dv.getUint32(body);
      height = dv.getUint32(body + 4);
      const bitDepth = bytes[body + 8];
      const colourType = bytes[body + 9];
      const interlace = bytes[body + 12];
      if (bitDepth !== 8) throw new GrayPngUnsupported(`${bitDepth} bit (erwartet 8)`);
      if (colourType !== wantColourType) throw new GrayPngUnsupported(`Farbtyp ${colourType} (erwartet ${wantColourType})`);
      if (interlace !== 0) throw new GrayPngUnsupported('Interlace');
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(body, body + len));
    } else if (type === 'IEND') {
      break;
    }
    pos = body + len + 4;
  }
  if (!(width > 0 && height > 0) || idat.length === 0) throw new GrayPngUnsupported('kein Bild im Datenstrom');
  let comp: Uint8Array;
  if (idat.length === 1) {
    comp = idat[0];
  } else {
    let total = 0;
    for (const p of idat) total += p.length;
    comp = new Uint8Array(total);
    let o = 0;
    for (const p of idat) { comp.set(p, o); o += p.length; }
  }
  const stream = new Blob([comp as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  return { width, height, raw };
}

/**
 * Dekodiert ein Graustufen-PNG. Wirft `GrayPngUnsupported`, wenn die Datei nicht
 * exakt die Bauart des Spiegels hat.
 */
export async function decodeGrayPng(bytes: Uint8Array): Promise<GrayPng> {
  // Chunks + natives Deflate in `inflatePng` (seit HD-3 geteilt mit dem Dual-Leser; Farbtyp 0 = Grau).
  const { width, height, raw } = await inflatePng(bytes, 0);
  if (raw.length < height * (width + 1)) throw new GrayPngUnsupported('Datenstrom zu kurz');

  // Un-Filter je Zeile (PNG-Filter 0…4) — bei 1 Byte/Pixel ist der linke Nachbar
  // genau ein Byte zurück, das macht die Schleifen so knapp.
  const values = new Uint8Array(width * height);
  let s = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[s++];
    const row = y * width;
    const prev = row - width;
    switch (ft) {
      case 0:
        values.set(raw.subarray(s, s + width), row);
        break;
      case 1: {                                  // Sub
        let a = 0;
        for (let x = 0; x < width; x++) { a = (raw[s + x] + a) & 255; values[row + x] = a; }
        break;
      }
      case 2:                                    // Up
        if (y === 0) values.set(raw.subarray(s, s + width), row);
        else for (let x = 0; x < width; x++) values[row + x] = (raw[s + x] + values[prev + x]) & 255;
        break;
      case 3: {                                  // Average
        let a = 0;
        for (let x = 0; x < width; x++) {
          const b = y === 0 ? 0 : values[prev + x];
          a = (raw[s + x] + ((a + b) >> 1)) & 255;
          values[row + x] = a;
        }
        break;
      }
      case 4: {                                  // Paeth
        let a = 0, c = 0;
        for (let x = 0; x < width; x++) {
          const b = y === 0 ? 0 : values[prev + x];
          const p = a + b - c;
          const pa = p > a ? p - a : a - p;
          const pb = p > b ? p - b : b - p;
          const pc = p > c ? p - c : c - p;
          const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          a = (raw[s + x] + pred) & 255;
          c = b;
          values[row + x] = a;
        }
        break;
      }
      default:
        throw new GrayPngUnsupported(`Filter ${ft}`);
    }
    s += width;
  }
  return { width, height, values };
}
