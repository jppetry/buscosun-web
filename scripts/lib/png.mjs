/**
 * Minimaler PNG-Codec für die Repack-Linie (BW-1) — Node-only, keine Dependency.
 *
 * Warum handgeschrieben: das Repo hat **7 Runtime-Dependencies** und eine
 * D-06-Regel dagegen; `scripts/build-clc-mask.mjs:81-106` trägt bereits einen
 * Graustufen-Encoder nach demselben Muster. Hier ist er auf die drei Farbtypen
 * geweitet, die die Repack-Linie braucht, plus einen **strengen Decoder** für
 * den Verifier.
 *
 * Der Decoder ist bewusst eine EIGENE Implementierung des Un-Filterns und keine
 * Rückrechnung des Encoders: nur so misst `verify:repack` wirklich den
 * Rundlauf. Er prüft jede Chunk-CRC — ein kaputtes PNG darf nicht durchrutschen,
 * sonst bewiese der Verifier die Byte-Gleichheit zweier Fehler.
 *
 * Unterstützt: Bittiefe 8, Farbtyp 0 (Grau), 4 (Grau+Alpha), 2 (RGB), 6 (RGBA),
 * kein Interlace.
 * Das deckt alles ab, was der Producer schreibt; alles andere wirft.
 *
 * PNG ist verlustfrei — Filterwahl und Kompressionsstufe ändern die
 * dekodierten Bytes NICHT, nur die Dateigröße. Deshalb darf hier optimiert
 * werden, ohne die Byte-Identität zu gefährden.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** channels → PNG-Farbtyp (IHDR Byte 9). */
const COLOUR_TYPE = { 1: 0, 2: 4, 3: 2, 4: 6 };
const CHANNELS_OF = { 0: 1, 2: 3, 4: 2, 6: 4 };

// --- CRC-32 (PNG-Polynom, Tabelle einmalig) --------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) crc = CRC_TABLE[(crc ^ buf[n]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Kodiert ein 8-bit-Bild als PNG.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Uint8ClampedArray|Buffer} data  width·height·channels Bytes, Zeile 0 oben
 * @param {1|2|3|4} channels
 * @returns {Buffer}
 */
export function encodePng(width, height, data, channels) {
  const ct = COLOUR_TYPE[channels];
  if (ct === undefined) throw new Error(`encodePng: channels ${channels} nicht unterstützt (1, 2, 3 oder 4)`);
  const need = width * height * channels;
  if (data.length !== need) throw new Error(`encodePng: ${data.length} Bytes, erwartet ${need}`);

  const src = Buffer.from(data.buffer ?? data, data.byteOffset ?? 0, data.length);
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const line = Buffer.alloc(stride);      // Kandidat
  const best = Buffer.alloc(stride);      // bisher bester Kandidat
  let prev = Buffer.alloc(stride);        // vorherige Zeile, unbearbeitet

  for (let y = 0; y < height; y++) {
    const cur = src.subarray(y * stride, (y + 1) * stride);
    let bestScore = Infinity, bestType = 0;
    // Standard-Heuristik (PNG-Spec 12.8): kleinste Summe der Beträge gewinnt.
    for (let type = 0; type <= 4; type++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? cur[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        let v;
        switch (type) {
          case 0: v = cur[i]; break;
          case 1: v = cur[i] - a; break;
          case 2: v = cur[i] - b; break;
          case 3: v = cur[i] - ((a + b) >> 1); break;
          default: v = cur[i] - paeth(a, b, c);
        }
        v &= 0xff;
        line[i] = v;
        score += v < 128 ? v : 256 - v;   // signierte Beträge
      }
      if (score < bestScore) { bestScore = score; bestType = type; line.copy(best); }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
    prev = cur;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // Bittiefe
  ihdr[9] = ct;   // Farbtyp
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // Deflate, adaptives Filtern, kein Interlace
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Dekodiert ein 8-bit-PNG (Farbtyp 0/2/4/6, kein Interlace) und prüft jede CRC.
 * @returns {{width:number,height:number,channels:number,data:Uint8Array}}
 */
export function decodePng(buffer) {
  const buf = Buffer.from(buffer);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('decodePng: keine PNG-Signatur');

  let pos = 8, ihdr = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    const want = buf.readUInt32BE(pos + 8 + len);
    const got = crc32(buf.subarray(pos + 4, pos + 8 + len));
    if (got !== want) throw new Error(`decodePng: CRC-Fehler im Chunk ${type}`);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') { pos += 12 + len; break; }
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('decodePng: IHDR fehlt');

  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], ct = ihdr[9], interlace = ihdr[12];
  if (depth !== 8) throw new Error(`decodePng: Bittiefe ${depth} nicht unterstützt`);
  if (interlace !== 0) throw new Error('decodePng: Interlace nicht unterstützt');
  const channels = CHANNELS_OF[ct];
  if (!channels) throw new Error(`decodePng: Farbtyp ${ct} nicht unterstützt`);
  if (!idat.length) throw new Error('decodePng: kein IDAT');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) {
    throw new Error(`decodePng: ${raw.length} Rohbytes, erwartet ${(stride + 1) * height}`);
  }

  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const o = y * stride, up = o - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[o + i - channels] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = y > 0 && i >= channels ? out[up + i - channels] : 0;
      let v;
      switch (type) {
        case 0: v = row[i]; break;
        case 1: v = row[i] + a; break;
        case 2: v = row[i] + b; break;
        case 3: v = row[i] + ((a + b) >> 1); break;
        case 4: v = row[i] + paeth(a, b, c); break;
        default: throw new Error(`decodePng: Filtertyp ${type} unbekannt (Zeile ${y})`);
      }
      out[o + i] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Dekodiertes PNG → RGBA-Bytes, genau wie der Browser sie aus `getImageData`
 * liefert: Grau wird auf R=G=B expandiert, fehlendes Alpha zu 255 ergänzt.
 */
export function toRgba({ width, height, channels, data }) {
  if (channels === 4) return data;
  const out = new Uint8Array(width * height * 4);
  for (let p = 0, s = 0, d = 0; p < width * height; p++, s += channels, d += 4) {
    if (channels === 3) {
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = 255;
    } else {                                   // 1 = Grau, 2 = Grau + Alpha
      out[d] = out[d + 1] = out[d + 2] = data[s];
      out[d + 3] = channels === 2 ? data[s + 1] : 255;
    }
  }
  return out;
}
