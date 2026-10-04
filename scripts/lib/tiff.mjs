/**
 * tiff.mjs — minimaler GeoTIFF-Leser für den Blitz-Spiegel (NP-0a, audit/np0-datenprodukte.md §8). Nur `node:zlib`,
 * keine Abhängigkeit (harte Regel). Kann, was die WCS-Antworten der zwei Quellen brauchen (diag-b §1, §2): klassisches
 * TIFF II/MM, Strips oder Tiles, Kompression keine/Deflate (8, 32946), Predictor 1, SampleFormat 1/2/3, 8/16/32/64 bit,
 * Chunky-Planar. Alles andere wirft — lieber kein Frame als ein falscher.
 */
import { inflateSync } from 'node:zlib';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

/** Liest das erste IFD. Liefert {W, H, spp, bps, fmt, data: Float64Array (W·H·spp, Zeile für Zeile), tags}. */
export function readTiff(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length < 8) throw new Error('TIFF: zu kurz');
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  if (!le && !(buf[0] === 0x4d && buf[1] === 0x4d)) throw new Error('TIFF: keine Byte-Ordnung');
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('TIFF: kein klassisches TIFF (BigTIFF nicht unterstützt)');
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = {};
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    const off = size * cnt <= 4 ? e + 8 : u32(e + 8);
    const vals = [];
    for (let k = 0; k < cnt; k++) {
      const o = off + k * size;
      if (type === 3) vals.push(u16(o));
      else if (type === 4) vals.push(u32(o));
      else if (type === 12) vals.push(le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
      else if (type === 11) vals.push(le ? buf.readFloatLE(o) : buf.readFloatBE(o));
      else if (type === 1 || type === 2 || type === 7) vals.push(buf[o]);
      else vals.push(null);
    }
    tags[tag] = type === 2 ? Buffer.from(vals).toString('latin1').replace(/\0+$/, '') : vals;
  }
  const W = tags[256]?.[0], H = tags[257]?.[0];
  if (!W || !H) throw new Error('TIFF: ohne Breite/Höhe');
  const bps = tags[258]?.[0] ?? 1, spp = tags[277]?.[0] ?? 1, comp = tags[259]?.[0] ?? 1;
  const fmt = tags[339]?.[0] ?? 1, pred = tags[317]?.[0] ?? 1, planar = tags[284]?.[0] ?? 1;
  if (pred !== 1) throw new Error(`TIFF: Predictor ${pred} nicht unterstützt`);
  if (planar !== 1) throw new Error('TIFF: nur Chunky-Planar');
  if (![8, 16, 32, 64].includes(bps)) throw new Error(`TIFF: ${bps} bit nicht unterstützt`);
  const bpp = (bps / 8) * spp;
  const raw = Buffer.alloc(W * H * bpp);
  const dec = (b) => {
    if (comp === 1) return b;
    if (comp === 8 || comp === 32946) return inflateSync(b);
    throw new Error(`TIFF: Kompression ${comp} nicht unterstützt`);
  };
  if (tags[322]) {
    const tw = tags[322][0], th = tags[323][0], offs = tags[324], cnts = tags[325];
    const across = Math.ceil(W / tw);
    offs.forEach((o, t) => {
      const d = dec(buf.subarray(o, o + cnts[t]));
      const tx = (t % across) * tw, ty = Math.floor(t / across) * th;
      const w = Math.min(tw, W - tx);
      for (let y = 0; y < th && ty + y < H; y++) d.copy(raw, ((ty + y) * W + tx) * bpp, y * tw * bpp, (y * tw + w) * bpp);
    });
  } else {
    const offs = tags[273], cnts = tags[279];
    if (!offs || !cnts) throw new Error('TIFF: ohne Strips');
    let pos = 0;
    offs.forEach((o, s) => { const d = dec(buf.subarray(o, o + cnts[s])); d.copy(raw, pos); pos += d.length; });
  }
  const step = bps / 8;
  const out = new Float64Array(W * H * spp);
  for (let i = 0; i < out.length; i++) {
    const o = i * step;
    let v;
    if (fmt === 3) v = bps === 64 ? (le ? raw.readDoubleLE(o) : raw.readDoubleBE(o)) : (le ? raw.readFloatLE(o) : raw.readFloatBE(o));
    else if (bps === 8) v = fmt === 2 ? raw.readInt8(o) : raw[o];
    else if (bps === 16) v = fmt === 2 ? (le ? raw.readInt16LE(o) : raw.readInt16BE(o)) : (le ? raw.readUInt16LE(o) : raw.readUInt16BE(o));
    else if (bps === 32) v = fmt === 2 ? (le ? raw.readInt32LE(o) : raw.readInt32BE(o)) : (le ? raw.readUInt32LE(o) : raw.readUInt32BE(o));
    else throw new Error('TIFF: 64-bit-Ganzzahl nicht unterstützt');
    out[i] = v;
  }
  return { W, H, spp, bps, fmt, comp, data: out, tags };
}

/**
 * Geo-Transformation (Pixelkante oben links + Schritt) aus ModelPixelScale (33550) + ModelTiepoint (33922) oder
 * ModelTransformation (34264). GeoServer schreibt für EPSG:4326 x = Länge. `sy` < 0 bei Norden oben.
 */
export function tiffGeo(t) {
  const tags = t.tags;
  if (tags[33550] && tags[33922]) {
    const [sx, sy] = tags[33550];
    const tp = tags[33922];
    // Tiepoint (i, j, k, x, y, z): Rasterpunkt (i, j) ↔ Modellpunkt (x, y).
    return { ox: tp[3] - tp[0] * sx, oy: tp[4] + tp[1] * sy, sx, sy: -sy };
  }
  if (tags[34264]) {
    const m = tags[34264];
    if (m[1] !== 0 || m[4] !== 0) throw new Error('TIFF: gedrehte Transformation nicht unterstützt');
    return { ox: m[3], oy: m[7], sx: m[0], sy: m[5] };
  }
  throw new Error('TIFF: keine Geo-Transformation');
}
