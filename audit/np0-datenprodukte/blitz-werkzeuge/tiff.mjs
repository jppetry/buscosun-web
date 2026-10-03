// Minimal-TIFF-Leser (nur node:zlib): II/MM, Strips oder Tiles, Kompression 1 (keine) oder 8/32946 (Deflate),
// Predictor 1/2/3 nicht unterstützt außer 1 (wirft), SampleFormat 1/2/3, 8/16/32/64 Bit, Chunky-Planar.
import { inflateSync } from 'node:zlib';

export function readTiff(buf) {
  const le = buf[0] === 0x49;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('kein klassisches TIFF');
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = {};
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const bytes = size[type] * cnt;
    const off = bytes <= 4 ? e + 8 : u32(e + 8);
    const vals = [];
    for (let k = 0; k < cnt; k++) {
      const o = off + k * size[type];
      if (type === 3) vals.push(u16(o));
      else if (type === 4) vals.push(u32(o));
      else if (type === 12) vals.push(le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
      else if (type === 2 || type === 1 || type === 7) vals.push(buf[o]);
      else vals.push(null);
    }
    tags[tag] = type === 2 ? Buffer.from(vals).toString('latin1').replace(/\0+$/, '') : vals;
  }
  const W = tags[256][0], H = tags[257][0];
  const bps = tags[258][0], spp = tags[277]?.[0] ?? 1, comp = tags[259]?.[0] ?? 1;
  const fmt = tags[339]?.[0] ?? 1, pred = tags[317]?.[0] ?? 1;
  if (pred !== 1) throw new Error(`Predictor ${pred} nicht unterstützt`);
  const bpp = (bps / 8) * spp;
  const raw = Buffer.alloc(W * H * bpp);
  const dec = (b) => (comp === 1 ? b : comp === 8 || comp === 32946 ? inflateSync(b) : (() => { throw new Error(`Kompression ${comp}`); })());
  if (tags[322]) { // Tiles
    const tw = tags[322][0], th = tags[323][0], offs = tags[324], cnts = tags[325];
    const across = Math.ceil(W / tw);
    offs.forEach((o, t) => {
      const d = dec(buf.subarray(o, o + cnts[t]));
      const tx = (t % across) * tw, ty = Math.floor(t / across) * th;
      for (let y = 0; y < th && ty + y < H; y++) {
        const w = Math.min(tw, W - tx);
        d.copy(raw, ((ty + y) * W + tx) * bpp, y * tw * bpp, (y * tw + w) * bpp);
      }
    });
  } else {
    const offs = tags[273], cnts = tags[279];
    let pos = 0;
    offs.forEach((o, s) => { const d = dec(buf.subarray(o, o + cnts[s])); d.copy(raw, pos); pos += d.length; });
  }
  const out = new Float64Array(W * H * spp);
  for (let i = 0; i < W * H * spp; i++) {
    const o = i * (bps / 8);
    let v;
    if (fmt === 3) v = bps === 64 ? (le ? raw.readDoubleLE(o) : raw.readDoubleBE(o)) : (le ? raw.readFloatLE(o) : raw.readFloatBE(o));
    else if (bps === 8) v = fmt === 2 ? raw.readInt8(o) : raw[o];
    else if (bps === 16) v = fmt === 2 ? (le ? raw.readInt16LE(o) : raw.readInt16BE(o)) : (le ? raw.readUInt16LE(o) : raw.readUInt16BE(o));
    else v = fmt === 2 ? (le ? raw.readInt32LE(o) : raw.readInt32BE(o)) : (le ? raw.readUInt32LE(o) : raw.readUInt32BE(o));
    out[i] = v;
  }
  return { W, H, spp, bps, fmt, comp, data: out, tags };
}
