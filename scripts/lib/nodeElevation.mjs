/**
 * Node Terrarium DEM lookup — the Node twin of `src/fusion/elevation.ts`, so a
 * Node capture fills model-sample elevations identically to the browser one
 * (the equivalence gate checks this). Uses ONLY the built-in `node:zlib` for
 * PNG inflate — no new npm dependency (Rule 5). Minimal PNG decoder: 8-bit,
 * non-interlaced, colour types 2 (RGB) / 6 (RGBA) / 0 (grey), expanded to RGBA
 * so `decodeTerrariumPixel(data, idx*4)` and the bilinear match elevation.ts.
 */
import { inflateSync } from 'node:zlib';

const TERRARIUM_TPL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

const lng2tileX = (lng, z) => ((lng + 180) / 360) * (1 << z);
const lat2tileY = (lat, z) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z);
};
const decodeTerrariumPixel = (data, idx) => data[idx] * 256 + data[idx + 1] + data[idx + 2] / 256 - 32768;

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit non-interlaced PNG buffer → {width,height, rgba:Uint8Array}. */
function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8) throw new Error('unsupported bitDepth ' + bitDepth);
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error('unsupported colorType ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels, stride = width * bpp;
  const recon = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const inOff = y * (stride + 1) + 1, outOff = y * stride, prevOff = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const rawv = raw[inOff + x];
      const a = x >= bpp ? recon[outOff + x - bpp] : 0;
      const b = y > 0 ? recon[prevOff + x] : 0;
      const c = x >= bpp && y > 0 ? recon[prevOff + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = rawv; break;
        case 1: val = rawv + a; break;
        case 2: val = rawv + b; break;
        case 3: val = rawv + ((a + b) >> 1); break;
        case 4: val = rawv + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + filter);
      }
      recon[outOff + x] = val & 0xff;
    }
  }
  // Expand to RGBA (A=255) to match canvas getImageData layout.
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    if (channels === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = recon[s]; }
    else { rgba[d] = recon[s]; rgba[d + 1] = recon[s + 1]; rgba[d + 2] = recon[s + 2]; }
    rgba[d + 3] = 255;
  }
  return { width, height, rgba };
}

async function loadTile(z, x, y) {
  const url = TERRARIUM_TPL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { rgba } = decodePng(buf);
    return { z, x, y, data: rgba };
  } catch {
    return null;
  }
}

/** Build an elevation lookup (Node twin of loadElevationLookup). */
export async function loadNodeElevation(bounds, zoom = 5) {
  const x0 = Math.floor(lng2tileX(bounds.lngMin, zoom));
  const x1 = Math.floor(lng2tileX(bounds.lngMax, zoom));
  const y0 = Math.floor(lat2tileY(bounds.latMax, zoom));
  const y1 = Math.floor(lat2tileY(bounds.latMin, zoom));
  const need = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) need.push([x, y]);
  const loaded = await Promise.all(need.map(([x, y]) => loadTile(zoom, x, y)));
  const tiles = new Map();
  for (const t of loaded) if (t) tiles.set(`${t.z}/${t.x}/${t.y}`, t);

  function sample(lng, lat) {
    const fx = lng2tileX(lng, zoom), fy = lat2tileY(lat, zoom);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const tile = tiles.get(`${zoom}/${tx}/${ty}`);
    if (!tile) return NaN;
    const px = (fx - tx) * 256, py = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(px))), j0 = Math.max(0, Math.min(255, Math.floor(py)));
    const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
    const fxr = px - i0, fyr = py - j0;
    const e00 = decodeTerrariumPixel(tile.data, (j0 * 256 + i0) * 4);
    const e10 = decodeTerrariumPixel(tile.data, (j0 * 256 + i1) * 4);
    const e01 = decodeTerrariumPixel(tile.data, (j1 * 256 + i0) * 4);
    const e11 = decodeTerrariumPixel(tile.data, (j1 * 256 + i1) * 4);
    const e0 = e00 * (1 - fxr) + e10 * fxr, e1 = e01 * (1 - fxr) + e11 * fxr;
    return e0 * (1 - fyr) + e1 * fyr;
  }
  return { sample, tileCount: tiles.size };
}
