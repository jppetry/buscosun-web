/**
 * Phase HDR (`audit/hd-radar.md`, E-HDR-2) — DWD composite product `HX`: the 250-m maximum-reflectivity composite
 * of the 17 DWD precipitation scans ("HX_top_view", `camethod MAXIMUM`), ODIM_H5 V2.3, ONE file per 5-min slot.
 *
 *   weather/radar/composite/hx/composite_hx_<YYYYMMDD>_<HHMM>-hd5      (+ `composite_hx_LATEST-hd5`)
 *
 * Measured on the files of 2026-11-04 09:00 UTC (dry) and 2026-11-02 10:30 UTC (wet), audit §2:
 *   - `/where`: xsize 4400, ysize 4800, xscale = yscale = 250 m, `projdef` = the polar-stereographic projection of
 *     the RV composite (lat_ts 60, lon_0 10, WGS84 ellipsoid) with `+x_0 = RV_X0 + 375`, `+y_0 = RV_Y0 − 375`:
 *     the half-cell difference between a 1-km and a 250-m cell. The four corner attributes equal RV's to the last
 *     digit ⇒ HX cell (a, b) IS the 250-m target cell (k = a, l = b) of `radarHd250.ts`, with zero shift — the
 *     grid buscosun composited itself from the 17 `px250` site images (`dwdPx250.ts`) since Phase R250.
 *   - `dataset1/data1/data` uint16, ONE chunk 4800 × 4400, gzip level 6, no shuffle; `what`: quantity DBZH,
 *     gain 0,002929…, offset −64,003, nodata 65535 (outside every site's range), undetect 0 (no echo).
 *   - `/what` date/time = the slot (`103000`); `dataset1/what` start/endtime = the scan window (≈ 30 s);
 *     `/how nodes` = the sites that went in (`'deasb','deboo',…`), `incomplete_nodes`/`missing_nodes` the rest.
 *   - 150 KB – 1,6 MB per file (48-h listing of 04.11.2026), on the server ≈ 1,5 min after the slot; 48 h retention.
 *
 * The decoder shares the single-chunk fast path with `dwdPx250.ts` (same HDF5 layout, uint16) and falls back to
 * jsfive for anything else. DOM-free: runs in the mirror (`radar-derive.mjs hd250`) and in the verifier.
 */

import { File as H5File } from 'jsfive';
import { h5SingleChunkU16, px250ProjectionOk, type H5Node, type InflateFn } from './dwdPx250';
import { HD250_COLS, HD250_ROWS, HD250_CELL_M, RV_X0, RV_Y0 } from './radarHd250';

export const HX_BASE_URL = 'https://opendata.dwd.de/weather/radar/composite/hx';
export const HX_COLS = HD250_COLS;   // 4400
export const HX_ROWS = HD250_ROWS;   // 4800
export const HX_CELL_M = HD250_CELL_M;
/** False easting/northing HX must carry so that its cells coincide with the 250-m target grid (measured, see above):
 *  RV's values shifted by half a 1-km cell minus half a 250-m cell = 375 m. */
export const HX_X0 = RV_X0 + 1.5 * HX_CELL_M;
export const HX_Y0 = RV_Y0 - 1.5 * HX_CELL_M;
/** Tolerance on `+x_0/+y_0` in metres — the attributes are printed with 11 decimals (`assumption`: anything beyond
 *  a millimetre is another plane, not a rounding). */
export const HX_ORIGIN_TOL_M = 1e-3;

/** File name of the composite for the slot `YYMMDDHHMM` (RV stamp). */
export function hxFileName(rvStamp: string): string {
  if (!/^\d{10}$/.test(rvStamp)) throw new Error(`HX: RV-Stempel ${rvStamp} unlesbar`);
  return `composite_hx_20${rvStamp.slice(0, 6)}_${rvStamp.slice(6)}-hd5`;
}
export function hxUrl(rvStamp: string): string {
  return `${HX_BASE_URL}/${hxFileName(rvStamp)}`;
}

/** One decoded HX composite: dBZ per 250-m target cell (row 0 = north), `NaN` = nodata, `-Infinity` = no echo. */
export interface HxGrid {
  /** slot time (`/what` date/time), ms UTC */
  timeMs: number;
  cols: number;
  rows: number;
  cellM: number;
  x0: number;
  y0: number;
  /** the DWD sites that went into the composite (`/how nodes`, without the `de` prefix), sorted */
  sites: string[];
  dbz: Float32Array;
  gain: number;
  offset: number;
}

const str = (v: unknown): string => String(v ?? '').replace(/\0+$/, '').trim();
const num = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`HX: ${what} fehlt oder ist keine Zahl`);
  return n;
};
function projParam(projdef: string, key: string): number {
  const m = new RegExp(`\\+${key}=([-+0-9.eE]+)`).exec(projdef);
  if (!m) throw new Error(`HX: projdef ohne +${key}`);
  return Number(m[1]);
}

/** `'deasb','deboo',…` → `['asb', 'boo', …]` (sorted, unique). Anything that is not a DE site id is kept as written. */
export function hxNodes(nodes: unknown): string[] {
  const out = new Set<string>();
  for (const m of str(nodes).matchAll(/'([a-z0-9]+)'/g)) out.add(m[1].startsWith('de') ? m[1].slice(2) : m[1]);
  return [...out].sort();
}

/** Is the file on the 250-m plane of the target grid? (projection of RV, x_0/y_0 of HX, 4400 × 4800 × 250 m) */
export function hxGridOk(where: { projdef?: unknown; xsize?: unknown; ysize?: unknown; xscale?: unknown; yscale?: unknown }): boolean {
  const projdef = str(where.projdef);
  if (!px250ProjectionOk(projdef)) return false;
  if (Math.abs(projParam(projdef, 'x_0') - HX_X0) > HX_ORIGIN_TOL_M || Math.abs(projParam(projdef, 'y_0') - HX_Y0) > HX_ORIGIN_TOL_M) return false;
  return Number(where.xsize) === HX_COLS && Number(where.ysize) === HX_ROWS && Number(where.xscale) === HX_CELL_M && Number(where.yscale) === HX_CELL_M;
}

export interface HxOptions { reader?: 'auto' | 'jsfive'; name?: string; inflate?: InflateFn }

export async function decodeHx(buf: ArrayBuffer, opts: HxOptions = {}): Promise<HxGrid> {
  const f = new H5File(buf, opts.name ?? 'hx.h5') as unknown as { get(path: string): H5Node | undefined };
  const where = f.get('where')?.attrs, top = f.get('what')?.attrs, how = f.get('how')?.attrs, dWhat = f.get('dataset1/data1/what')?.attrs;
  const dsHow = f.get('dataset1/how')?.attrs;
  const ds = f.get('dataset1/data1/data');
  if (!where || !top || !dWhat || !ds) throw new Error('HX: Gruppe /where, /what oder dataset1 fehlt');
  if (str(top.object) !== 'COMP') throw new Error(`HX: Objekt ${str(top.object) || '?'} statt COMP`);
  if (!hxGridOk(where)) throw new Error(`HX: fremdes Gitter ${str(where.xsize)}×${str(where.ysize)} @ ${str(where.xscale)} m, ${str(where.projdef)}`);
  if (str(dWhat.quantity) !== 'DBZH') throw new Error(`HX: Größe ${str(dWhat.quantity) || '?'} statt DBZH`);
  const camethod = str(dsHow?.camethod);
  if (camethod && camethod !== 'MAXIMUM') throw new Error(`HX: Kompositregel ${camethod} statt MAXIMUM`);
  const cells = HX_COLS * HX_ROWS;
  const data: ArrayLike<number> | undefined = (opts.reader === 'jsfive' ? null : await h5SingleChunkU16(buf, ds, cells, opts.inflate)) ?? ds.value;
  if (!data || data.length !== cells) throw new Error(`HX: ${data?.length ?? 0} Werte für ${HX_COLS}×${HX_ROWS}`);
  const gain = num(dWhat.gain, 'gain'), offset = num(dWhat.offset, 'offset');
  const nodata = num(dWhat.nodata, 'nodata'), undetect = num(dWhat.undetect, 'undetect');
  const d = str(top.date), t = str(top.time).padStart(6, '0');
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) throw new Error(`HX: /what date/time unlesbar (${d} ${t})`);
  const timeMs = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
  const dbz = new Float32Array(cells);
  for (let k = 0; k < cells; k++) {
    const r = data[k];
    dbz[k] = r === nodata ? NaN : r === undetect ? -Infinity : r * gain + offset;
  }
  const projdef = str(where.projdef);
  return {
    timeMs, cols: HX_COLS, rows: HX_ROWS, cellM: HX_CELL_M,
    x0: projParam(projdef, 'x_0'), y0: projParam(projdef, 'y_0'),
    sites: hxNodes(how?.nodes), dbz, gain, offset,
  };
}
