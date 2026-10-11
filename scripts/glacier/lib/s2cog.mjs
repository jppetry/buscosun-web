/**
 * Node-side Sentinel-2 COG window reader for the glacier producers (Phase GL).
 *
 * Reuses the app's DOM-free reader `src/fire/detail/cogTiff.ts` (IFD parser, tile maths, deflate decoders) — the
 * producer therefore reads exactly the files the browser viewer reads. Georeferencing comes from the STAC asset
 * (`proj:transform`, `proj:shape`, `proj:epsg`), never from GeoTIFF tags (same rule as the Brandradar viewer).
 *
 * Run through:  node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <script>
 */
import { COG_HEADER_BYTES, COG_HEADER_RETRY_BYTES, parseCogIfds, tilesFor, decodeTile, decodeTileU16 } from '../../../src/fire/detail/cogTiff.ts';
import { utmFwd, utmInv } from '../../../src/fire/detail/sentinelGeo.ts';

export const STAC_URL = 'https://earth-search.aws.element84.com/v1/search';
const UA = 'buscosun-glacier/0.1 (+https://buscosun.com; jppetry94@gmail.com)';

/** Counters so a spike or a job can report what a scan really cost. */
export const net = { requests: 0, bytes: 0 };

async function ranged(url, start, end, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { range: `bytes=${start}-${end}`, 'user-agent': UA } });
      if (r.status === 200 || r.status === 206) {
        const b = new Uint8Array(await r.arrayBuffer());
        net.requests++; net.bytes += b.length;
        return b;
      }
      last = new Error(`HTTP ${r.status} ${url}`);
      if (r.status === 403 || r.status === 404) break;
    } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw last;
}

/** Header IFDs of a COG (one ranged request, one retry with a larger window). */
export async function cogHeader(url) {
  let n = COG_HEADER_BYTES;
  for (let attempt = 0; attempt < 3; attempt++) {
    const b = await ranged(url, 0, n - 1);
    const h = parseCogIfds(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    if (h.kind === 'ok') return h.ifds;
    if (h.kind === 'unsupported') throw new Error('cog-unsupported: ' + h.reason);
    n = attempt === 0 ? COG_HEADER_RETRY_BYTES : h.upTo + 1024;
  }
  throw new Error('cog header not parsable: ' + url);
}

/**
 * A STAC asset → georeference of its full-resolution grid.
 * `transform` = [scaleX, 0, X0, 0, -scaleY, Y0], `shape` = [rows, cols].
 */
export function assetGeo(item, key) {
  const a = item.assets?.[key];
  if (!a?.href) return null;
  const transform = a['proj:transform'];
  const shape = a['proj:shape'];
  const epsg = item.properties?.['proj:epsg'] ?? a['proj:epsg'];
  if (!Array.isArray(transform) || !Array.isArray(shape) || !epsg) return null;
  const rb = a['raster:bands']?.[0] ?? {};
  return {
    href: a.href, epsg, transform, shape,
    scale: typeof rb.scale === 'number' ? rb.scale : 1, offset: typeof rb.offset === 'number' ? rb.offset : 0,
    mPerPx: Math.abs(transform[0]),
  };
}

/**
 * Reads the full-resolution window [px0, px1) x [py0, py1) of one asset (pixel coordinates of the asset grid) and
 * returns { data, w, h, bytes, tiles }. Out-of-raster parts are filled with `fill`. Typed array follows the asset
 * (uint8 for SCL and the TCI, uint16 for the band COGs); interleaved when the asset has several samples per pixel.
 */
export async function readWindow(geo, px0, py0, px1, py1, { fill = 0, ifds, level = 0 } = {}) {
  // `level` 0 = full resolution, 1 = first overview (2x coarser) ...; the window is then in the pixels of THAT level
  const levels = ifds ?? (await cogHeader(geo.href));
  const ifd = [...levels].sort((a, b) => b.width - a.width)[level];
  const x0 = Math.max(0, Math.floor(px0)), y0 = Math.max(0, Math.floor(py0));
  const x1 = Math.min(ifd.width, Math.ceil(px1)), y1 = Math.min(ifd.height, Math.ceil(py1));
  const w = Math.ceil(px1) - Math.floor(px0), h = Math.ceil(py1) - Math.floor(py0);
  const u16 = ifd.bitsPerSample === 16;
  const spp = ifd.samplesPerPixel || 1; // 3 for the TCI asset (uint8 RGB), 1 for the band COGs and SCL
  const out = u16 ? new Uint16Array(w * h * spp) : new Uint8Array(w * h * spp);
  if (fill) out.fill(fill);
  if (x1 <= x0 || y1 <= y0) return { data: out, w, h, bytes: 0, tiles: 0 };
  const refs = tilesFor(ifd, x0, y0, x1, y1);
  let bytes = 0;
  // fetch the tiles of one window in parallel, 4 at a time (gentle)
  const decoded = new Array(refs.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++; if (i >= refs.length) return;
      const t = refs[i];
      const raw = await ranged(geo.href, t.offset, t.offset + t.byteCount - 1);
      bytes += raw.length;
      decoded[i] = u16 ? await decodeTileU16(raw, ifd) : await decodeTile(raw, ifd);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (let i = 0; i < refs.length; i++) {
    const t = refs[i], d = decoded[i];
    const tx = t.col * ifd.tileW, ty = t.row * ifd.tileH;
    for (let r = 0; r < ifd.tileH; r++) {
      const gy = ty + r;
      if (gy < y0 || gy >= y1) continue;
      const cx0 = Math.max(tx, x0), cx1 = Math.min(tx + ifd.tileW, x1);
      if (cx1 <= cx0) continue;
      const srcOff = (r * ifd.tileW + (cx0 - tx)) * spp;
      const dstOff = ((gy - Math.floor(py0)) * w + (cx0 - Math.floor(px0))) * spp;
      out.set(d.subarray(srcOff, srcOff + (cx1 - cx0) * spp), dstOff);
    }
  }
  return { data: out, w, h, bytes, tiles: refs.length };
}

/** Lon/lat → fractional pixel of an asset. */
export function lonLatToPx(geo, lon, lat) {
  const p = utmFwd(lat, lon, geo.epsg);
  if (!p) return null;
  return { px: (p.e - geo.transform[2]) / geo.transform[0], py: (p.n - geo.transform[5]) / geo.transform[4] };
}

/** Pixel centre → lon/lat. */
export function pxToLonLat(geo, px, py) {
  const e = geo.transform[2] + px * geo.transform[0], n = geo.transform[5] + py * geo.transform[4];
  return utmInv(e, n, geo.epsg);
}

/** One STAC search page (POST), returns the features. */
export async function stacSearch(body) {
  const r = await fetch(STAC_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('STAC HTTP ' + r.status);
  return (await r.json()).features ?? [];
}
