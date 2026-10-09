/**
 * Phase R250 (`audit/radar-250m.md` §2/§5) — DWD site product `px250`: the Cartesian 250-m reflectivity image of
 * every DWD radar site (precipitation scan, "PX_Product250_top_view"), ODIM_H5 V2.3.
 *
 *   weather/radar/sites/px250/<site>/rab02-tt_<WMO>-<YYYYMMDDHHMM>00-de<site>-hd5      (+ `…-latest-…`)
 *
 * Measured on the files of 2026-10-09 17:20 UTC (all 17 sites; `audit/radar-250m/diag-sites.json`):
 *   - `/where`: xsize = ysize = 1600, xscale = yscale = 250 m, `projdef` = the polar-stereographic projection of the
 *     RV composite (lat_ts 60, lon_0 10, WGS84 ellipsoid) with a site-specific false easting/northing `+x_0/+y_0`;
 *     the corner attributes are the OUTER edges of the edge pixels, so pixel (a, b) has its centre at
 *     X_off = a · 250, Y_off = −b · 250 in the offset frame (true X = X_off − x_0, true Y = Y_off − y_0).
 *   - `dataset1/data1/data` uint16, ONE chunk 1600 × 1600, gzip; `what`: quantity DBZH, gain 0,002929…, offset −64,003,
 *     nodata 65535 (outside range / blocked), undetect 0 (no echo).
 *   - `/what` date/time = scan time (the slot); `dataset1/what` prodpar 0,8 (elevation °), product PPI.
 *   - 80–760 KB per file, ≈ 6,5 MB per slot; on the server ≈ 75 s after the scan; 48 h retention.
 *
 * Two ways to the values (as `rvHdf5.ts`): the fast path reads the single deflate chunk itself (`DecompressionStream`),
 * anything else goes through jsfive. DOM-free: runs in the mirror (`radar-derive.mjs`) and in the verifier.
 */

import { File as H5File } from 'jsfive';

/** The 17 DWD radar sites of the precipitation scan (directory `sites/px250/`, 2026-10-09) with their WMO ids
 *  (part of the file name) — the `/what source` attribute of each file names the same pair. */
export const PX250_SITES: readonly { id: string; wmo: number }[] = Object.freeze([
  { id: 'asb', wmo: 10103 }, { id: 'boo', wmo: 10132 }, { id: 'drs', wmo: 10488 }, { id: 'eis', wmo: 10780 },
  { id: 'ess', wmo: 10410 }, { id: 'fbg', wmo: 10908 }, { id: 'fld', wmo: 10440 }, { id: 'hnr', wmo: 10339 },
  { id: 'isn', wmo: 10873 }, { id: 'mem', wmo: 10950 }, { id: 'neu', wmo: 10557 }, { id: 'nhb', wmo: 10605 },
  { id: 'oft', wmo: 10629 }, { id: 'pro', wmo: 10392 }, { id: 'ros', wmo: 10169 }, { id: 'tur', wmo: 10832 },
  { id: 'umd', wmo: 10356 },
]);

export const PX250_SIZE = 1600;
export const PX250_CELL_M = 250;
export const PX250_BASE_URL = 'https://opendata.dwd.de/weather/radar/sites/px250';

/** File name of a site's image for the slot `YYMMDDHHMM` (RV stamp) — the DWD name carries seconds `00`. */
export function px250FileName(site: { id: string; wmo: number }, rvStamp: string): string {
  if (!/^\d{10}$/.test(rvStamp)) throw new Error(`px250: RV-Stempel ${rvStamp} unlesbar`);
  return `rab02-tt_${site.wmo}-20${rvStamp}00-de${site.id}-hd5`;
}
export function px250Url(site: { id: string; wmo: number }, rvStamp: string): string {
  return `${PX250_BASE_URL}/${site.id}/${px250FileName(site, rvStamp)}`;
}

/** One decoded site image: dBZ per cell (row 0 = north), `NaN` = nodata, `-Infinity` = no echo (undetect). */
export interface Px250Grid {
  site: string;
  /** scan time (`/what` date/time), ms UTC */
  timeMs: number;
  size: number;
  cellM: number;
  /** false easting / northing of the file's projection (`+x_0`, `+y_0`) */
  x0: number;
  y0: number;
  /** radar position */
  lon: number;
  lat: number;
  dbz: Float32Array;
  /** raw uint16 codes (for the verifier: gain/offset applied by the caller) */
  gain: number;
  offset: number;
}

interface H5DataObjects {
  filter_pipeline?: Array<Map<string, unknown>> | null;
  _chunks?: number[];
  _chunk_address?: number | bigint;
  _get_chunk_params?: () => void;
}
interface H5Node { attrs: Record<string, unknown>; value?: ArrayLike<number>; shape?: number[]; dtype?: unknown; _dataobjects?: H5DataObjects }

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined' || typeof Blob === 'undefined') return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Fast path for exactly the measured layout: uint16 LE, one chunk = the field, single deflate filter, mask 0. */
async function fastRawU16(buf: ArrayBuffer, ds: H5Node, cells: number): Promise<Uint16Array | null> {
  try {
    const o = ds._dataobjects;
    if (!o || ds.dtype !== '<u2' || !Array.isArray(ds.shape) || ds.shape.length !== 2) return null;
    o._get_chunk_params?.();
    const chunks = o._chunks, fp = o.filter_pipeline;
    if (!chunks || chunks.length !== 2 || chunks[0] !== ds.shape[0] || chunks[1] !== ds.shape[1]) return null;
    if (!fp || fp.length !== 1 || Number(fp[0].get('filter_id')) !== 1) return null;
    const at = Number(o._chunk_address);
    const v = new DataView(buf);
    if (!(at > 0) || at + 64 > buf.byteLength) return null;
    if (v.getUint32(at, false) !== 0x54524545) return null;                       // 'TREE'
    if (v.getUint8(at + 4) !== 1 || v.getUint8(at + 5) !== 0 || v.getUint16(at + 6, true) !== 1) return null;
    const key = at + 24;
    const size = v.getUint32(key, true), mask = v.getUint32(key + 4, true);
    if (mask !== 0) return null;
    for (let i = 0; i < 3; i++) if (v.getUint32(key + 8 + i * 8, true) !== 0 || v.getUint32(key + 12 + i * 8, true) !== 0) return null;
    const addrLo = v.getUint32(key + 32, true), addrHi = v.getUint32(key + 36, true);
    if (addrHi !== 0 || addrLo + size > buf.byteLength) return null;
    const out = await inflateZlib(new Uint8Array(buf, addrLo, size));
    if (!out || out.byteLength !== cells * 2) return null;
    if (out.byteOffset % 2 === 0 && LITTLE_ENDIAN) return new Uint16Array(out.buffer, out.byteOffset, cells);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength), raw = new Uint16Array(cells);
    for (let k = 0; k < cells; k++) raw[k] = dv.getUint16(k * 2, true);
    return raw;
  } catch { return null; }
}

const str = (v: unknown): string => String(v ?? '').replace(/\0+$/, '').trim();
const num = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`px250: ${what} fehlt oder ist keine Zahl`);
  return n;
};
function projParam(projdef: string, key: string): number {
  const m = new RegExp(`\\+${key}=([-+0-9.eE]+)`).exec(projdef);
  if (!m) throw new Error(`px250: projdef ohne +${key}`);
  return Number(m[1]);
}

/** The projection every px250 file (and the RV composite) must carry — anything else is a different product. */
export function px250ProjectionOk(projdef: string): boolean {
  return /\+proj=stere\b/.test(projdef) && projParam(projdef, 'lat_ts') === 60 && projParam(projdef, 'lat_0') === 90
    && projParam(projdef, 'lon_0') === 10 && Math.abs(projParam(projdef, 'a') - 6378137) < 1e-3
    && Math.abs(projParam(projdef, 'b') - 6356752.3142451802) < 1e-3;
}

export interface Px250Options { reader?: 'auto' | 'jsfive'; name?: string }

export async function decodePx250(buf: ArrayBuffer, opts: Px250Options = {}): Promise<Px250Grid> {
  const f = new H5File(buf, opts.name ?? 'px250.h5') as unknown as { get(path: string): H5Node | undefined };
  const where = f.get('where')?.attrs, top = f.get('what')?.attrs, dWhat = f.get('dataset1/data1/what')?.attrs;
  const ds = f.get('dataset1/data1/data');
  if (!where || !top || !dWhat || !ds) throw new Error('px250: Gruppe /where, /what oder dataset1 fehlt');
  const size = num(where.xsize, 'xsize');
  if (num(where.ysize, 'ysize') !== size || size !== PX250_SIZE) throw new Error(`px250: Maße ${where.xsize}×${where.ysize}`);
  const cellM = num(where.xscale, 'xscale');
  if (cellM !== PX250_CELL_M || num(where.yscale, 'yscale') !== PX250_CELL_M) throw new Error(`px250: Zelle ${where.xscale}×${where.yscale} m`);
  const projdef = str(where.projdef);
  if (!px250ProjectionOk(projdef)) throw new Error(`px250: fremde Projektion ${projdef}`);
  if (str(dWhat.quantity) !== 'DBZH') throw new Error(`px250: Größe ${str(dWhat.quantity) || '?'} statt DBZH`);
  const cells = size * size;
  const data: ArrayLike<number> | undefined = (opts.reader === 'jsfive' ? null : await fastRawU16(buf, ds, cells)) ?? ds.value;
  if (!data || data.length !== cells) throw new Error(`px250: ${data?.length ?? 0} Werte für ${size}×${size}`);
  const gain = num(dWhat.gain, 'gain'), offset = num(dWhat.offset, 'offset');
  const nodata = num(dWhat.nodata, 'nodata'), undetect = num(dWhat.undetect, 'undetect');
  const d = str(top.date), t = str(top.time).padStart(6, '0');
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) throw new Error(`px250: /what date/time unlesbar (${d} ${t})`);
  const timeMs = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
  const src = str(top.source);
  const nod = /NOD:de([a-z]{3})/.exec(src);
  const dbz = new Float32Array(cells);
  for (let k = 0; k < cells; k++) {
    const r = data[k];
    dbz[k] = r === nodata ? NaN : r === undetect ? -Infinity : r * gain + offset;
  }
  return {
    site: nod ? nod[1] : '', timeMs, size, cellM,
    x0: projParam(projdef, 'x_0'), y0: projParam(projdef, 'y_0'),
    lon: num(where.lon, 'lon'), lat: num(where.lat, 'lat'),
    dbz, gain, offset,
  };
}
