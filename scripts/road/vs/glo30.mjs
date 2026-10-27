/**
 * glo30.mjs — window reader for the Copernicus DEM GLO-30 COGs on AWS (AW-6.2.2, `audit/autobahnwetter.md` §20.8).
 *
 * Source: `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_<N|S>yy_00_<E|W>xxx_00_DEM/…_DEM.tif`
 * (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and
 * ESA; licence: free use with attribution — "Copernicus DEM" notice). Measured 27.10.2026 on N50/E008: classic TIFF,
 * 2 400 × 3 600 px (0.000417° × 0.000278° ≈ 30 m), 12 tiles of 1 024², float32, Deflate, **floating-point predictor 3**
 * (the project's `scripts/lib/tiff.mjs` refuses predictor ≠ 1, so this file decodes it), overviews in IFD1–3.
 * Only the header (256 KB) and the tiles a window touches are fetched (HTTP Range); tiles are cached on disk.
 * A DSM: trees and buildings are part of the surface — for the horizon of a road that is the wanted quantity (a forest
 * edge shades), for the road's own height it is not (`zAt` may see an overpass).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

export const GLO30_BASE = 'https://copernicus-dem-30m.s3.amazonaws.com';
export const GLO30_ATTRIBUTION = 'Copernicus DEM GLO-30 — © DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018, bereitgestellt durch die Europäische Union und ESA (Copernicus)';
const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

export function glo30TileName(latFloor, lonFloor) {
  const ns = latFloor >= 0 ? 'N' : 'S', ew = lonFloor >= 0 ? 'E' : 'W';
  const n = `Copernicus_DSM_COG_10_${ns}${String(Math.abs(latFloor)).padStart(2, '0')}_00_${ew}${String(Math.abs(lonFloor)).padStart(3, '0')}_00_DEM`;
  return `${GLO30_BASE}/${n}/${n}.tif`;
}

/** Parses IFD0 of a classic TIFF from its first bytes: geometry, tiling, offsets. Throws on anything it cannot read. */
export function parseCogHeader(buf) {
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  if (!le && !(buf[0] === 0x4d && buf[1] === 0x4d)) throw new Error('GLO-30: keine Byte-Ordnung');
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(2) !== 42) throw new Error('GLO-30: kein klassisches TIFF');
  const ifd = u32(4), n = u16(ifd), tags = {};
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), size = SZ[type];
    if (!size) continue;
    const off = size * cnt <= 4 ? e + 8 : u32(e + 8);
    if (off + size * cnt > buf.length) throw new Error(`GLO-30: Kopf zu kurz für Tag ${tag}`);
    const vals = new Array(cnt);
    for (let k = 0; k < cnt; k++) { const o = off + k * size; vals[k] = type === 3 ? u16(o) : type === 4 ? u32(o) : type === 12 ? (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o)) : buf[o]; }
    tags[tag] = vals;
  }
  const W = tags[256]?.[0], H = tags[257]?.[0], bps = tags[258]?.[0], comp = tags[259]?.[0], pred = tags[317]?.[0] ?? 1, fmt = tags[339]?.[0] ?? 1;
  const tw = tags[322]?.[0], th = tags[323]?.[0], offs = tags[324], cnts = tags[325];
  if (!W || !H || !tw || !offs) throw new Error('GLO-30: nicht gekachelt');
  if (bps !== 32 || fmt !== 3) throw new Error(`GLO-30: ${bps} bit Format ${fmt}, erwartet float32`);
  if (comp !== 8 && comp !== 32946) throw new Error(`GLO-30: Kompression ${comp} nicht unterstützt`);
  if (pred !== 1 && pred !== 3) throw new Error(`GLO-30: Prädiktor ${pred} nicht unterstützt`);
  const [sx, sy] = tags[33550], tp = tags[33922];
  return { le, W, H, tw, th, offs, cnts, pred, comp, across: Math.ceil(W / tw), ox: tp[3] - tp[0] * sx, oy: tp[4] + tp[1] * sy, sx, sy };
}

/**
 * Decodes one tile (Deflate + floating-point predictor 3 of libtiff `fpAcc`: per row the bytes are delta-coded, then
 * stored as four byte planes, most significant first). Returns Float32Array(tw·th).
 */
export function decodeTile(bytes, { tw, th, pred }) {
  const raw = inflateSync(bytes);
  const out = new Float32Array(tw * th);
  const rowBytes = tw * 4;
  const view = new DataView(out.buffer);
  for (let y = 0; y < th; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    if (row.length < rowBytes) break;
    if (pred === 3) {
      for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 0xff;
      for (let x = 0; x < tw; x++) {
        // planes 0..3 = big-endian bytes of the float.
        const b0 = row[x], b1 = row[tw + x], b2 = row[2 * tw + x], b3 = row[3 * tw + x];
        view.setUint32((y * tw + x) * 4, (b0 << 24 | b1 << 16 | b2 << 8 | b3) >>> 0, false);
        // setUint32 wrote big-endian bytes into the Float32Array's buffer; read back as a native float below.
      }
    } else {
      for (let x = 0; x < tw; x++) view.setFloat32((y * tw + x) * 4, new DataView(row.buffer, row.byteOffset + x * 4, 4).getFloat32(0, true), true);
    }
  }
  if (pred === 3) {
    // The buffer holds big-endian floats; convert in place to native order.
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, false);
  }
  return out;
}

/**
 * A reader with a tile cache: `zAt(lat, lon)` = DSM height (m) at the nearest pixel, NaN outside the fetched coverage or
 * on a missing tile. Degree tiles and their headers are fetched on demand; tile bytes are cached under `cacheDir`.
 */
export function glo30Reader({ cacheDir, maxTiles = 48, fetchImpl = fetch, log = () => {} } = {}) {
  const headers = new Map();      // degree key → header | null (404)
  const tiles = new Map();        // tile key → Float32Array (LRU by insertion)
  const stats = { headerFetches: 0, tileFetches: 0, tileCacheHits: 0, bytes: 0, missingDegrees: 0 };
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });

  const fetchRange = async (url, from, to) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetchImpl(url, { headers: { Range: `bytes=${from}-${to}` }, signal: AbortSignal.timeout(60_000) });
        if (r.status === 404) return null;
        if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
        const b = Buffer.from(await r.arrayBuffer());
        stats.bytes += b.length;
        return b;
      } catch (e) { if (i === 2) throw e; await new Promise((res) => setTimeout(res, 1000 * (i + 1))); }
    }
    return null;
  };

  async function headerOf(latF, lonF) {
    const k = `${latF}:${lonF}`;
    if (headers.has(k)) return headers.get(k);
    const url = glo30TileName(latF, lonF);
    const f = cacheDir ? join(cacheDir, `${latF}_${lonF}.hdr`) : null;
    let buf = f && existsSync(f) ? readFileSync(f) : null;
    if (!buf) {
      stats.headerFetches++;
      buf = await fetchRange(url, 0, 262_143);
      if (!buf) { headers.set(k, null); stats.missingDegrees++; log(`GLO-30 ${latF}/${lonF}: keine Kachel (404)`); return null; }
      if (f) writeFileSync(f, buf);
    }
    const h = { ...parseCogHeader(buf), url, latF, lonF };
    headers.set(k, h);
    return h;
  }

  async function tileOf(h, tx, ty) {
    const k = `${h.latF}:${h.lonF}:${tx}:${ty}`;
    const hit = tiles.get(k);
    if (hit) { tiles.delete(k); tiles.set(k, hit); stats.tileCacheHits++; return hit; }
    const t = ty * h.across + tx;
    const f = cacheDir ? join(cacheDir, `${h.latF}_${h.lonF}_${tx}_${ty}.bin`) : null;
    let bytes = f && existsSync(f) ? readFileSync(f) : null;
    if (!bytes) {
      stats.tileFetches++;
      bytes = await fetchRange(h.url, h.offs[t], h.offs[t] + h.cnts[t] - 1);
      if (!bytes) return null;
      if (f) { writeFileSync(`${f}.tmp`, bytes); renameSync(`${f}.tmp`, f); }
    }
    const tile = decodeTile(bytes, h);
    tiles.set(k, tile);
    if (tiles.size > maxTiles) tiles.delete(tiles.keys().next().value);
    return tile;
  }

  /** Makes sure every tile a lat/lon box touches is loaded; returns false when a degree tile is missing. */
  async function prefetch(latMin, latMax, lonMin, lonMax) {
    let ok = true;
    for (let la = Math.floor(latMin); la <= Math.floor(latMax); la++) for (let lo = Math.floor(lonMin); lo <= Math.floor(lonMax); lo++) {
      const h = await headerOf(la, lo);
      if (!h) { ok = false; continue; }
      const px = (lon) => Math.min(h.W - 1, Math.max(0, Math.floor((lon - h.ox) / h.sx)));
      const py = (lat) => Math.min(h.H - 1, Math.max(0, Math.floor((h.oy - lat) / h.sy)));
      const tx0 = Math.floor(px(Math.max(lonMin, lo)) / h.tw), tx1 = Math.floor(px(Math.min(lonMax, lo + 1 - 1e-9)) / h.tw);
      const ty0 = Math.floor(py(Math.min(latMax, la + 1 - 1e-9)) / h.th), ty1 = Math.floor(py(Math.max(latMin, la)) / h.th);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) await tileOf(h, tx, ty);
    }
    return ok;
  }

  /** Synchronous lookup from the cache (call `prefetch` for the box first). NaN when not loaded. */
  function zAt(lat, lon) {
    const h = headers.get(`${Math.floor(lat)}:${Math.floor(lon)}`);
    if (!h) return NaN;
    const x = Math.floor((lon - h.ox) / h.sx), y = Math.floor((h.oy - lat) / h.sy);
    if (x < 0 || y < 0 || x >= h.W || y >= h.H) return NaN;
    const tx = Math.floor(x / h.tw), ty = Math.floor(y / h.th);
    const tile = tiles.get(`${h.latF}:${h.lonF}:${tx}:${ty}`);
    if (!tile) return NaN;
    return tile[(y - ty * h.th) * h.tw + (x - tx * h.tw)];
  }

  return { headerOf, tileOf, prefetch, zAt, stats };
}
