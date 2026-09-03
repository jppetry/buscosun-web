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

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Dekodiert ein Graustufen-PNG. Wirft `GrayPngUnsupported`, wenn die Datei nicht
 * exakt die Bauart des Spiegels hat.
 */
export async function decodeGrayPng(bytes: Uint8Array): Promise<GrayPng> {
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
      if (colourType !== 0) throw new GrayPngUnsupported(`Farbtyp ${colourType} (erwartet 0 = Grau)`);
      if (interlace !== 0) throw new GrayPngUnsupported('Interlace');
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(body, body + len));
    } else if (type === 'IEND') {
      break;
    }
    pos = body + len + 4;                       // + CRC
  }
  if (!(width > 0 && height > 0) || idat.length === 0) throw new GrayPngUnsupported('kein Bild im Datenstrom');

  // zlib-gewrapptes Deflate (PNG-Vorgabe) — dasselbe native `deflate` wie im COG-Leser.
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
