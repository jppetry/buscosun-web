/**
 * zip.mjs — minimal ZIP reader for the DWD CDC archives (E-PS-10: own reader on `node:zlib`, no dependency).
 * End-of-central-directory → central directory → local header; methods 0 (stored) and 8 (deflate). Sizes and CRC come
 * from the CENTRAL directory, so bit 3 (data descriptor) needs no special handling; the data offset is read from the
 * LOCAL header (its name/extra lengths differ from the central ones). Every entry is CRC-checked.
 */
import { inflateRawSync } from 'node:zlib';

let TABLE = null;
export function crc32(buf) {
  if (!TABLE) { TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function unzip(buf) {
  let e = buf.length - 22;
  const lo = Math.max(0, buf.length - 22 - 65535);
  while (e >= lo && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < lo) throw new Error('zip: no end-of-central-directory record');
  const n = buf.readUInt16LE(e + 10), cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
  if (n === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) throw new Error('zip: zip64 not supported');
  const out = [];
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) throw new Error('zip: zip64 entry');
    if (flags & 1) throw new Error('zip: encrypted');
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nl);
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('zip: bad local header');
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`zip: method ${method}`);
    if (data.length !== usize) throw new Error(`zip: ${name} size ${data.length} != ${usize}`);
    const got = crc32(data);
    if (got !== crc) throw new Error(`zip: ${name} crc ${got.toString(16)} != ${crc.toString(16)}`);
    out.push({ name, method, crc, usize, data });
    p += 46 + nl + xl + cl;
  }
  return out;
}
