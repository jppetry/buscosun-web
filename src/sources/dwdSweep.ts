/**
 * Phase SE (`audit/radar-stoerecho.md` §2) — DWD site product "sweep of the precipitation scan" (`sweep_pcp_*`),
 * ODIM_H5 V2.2, one polar sweep per file:
 *
 *   weather/radar/sites/sweep_pcp_rhohv/<site>/unfiltered/ras07-pcpng01_sweeph5onem_urhohv_00-<YYYYMMDDHHMMSSss>-<site>-<WMO>-hd5
 *   weather/radar/sites/sweep_pcp_z/<site>/hdf5/filter_polarimetric/ras07-pcpng01_sweeph5onem_dbzh_00-…
 *
 * Measured on the files of 2026-10-12 22:30/22:35 UTC (Offenthal, Neuheilenbach; `audit/radar-stoerecho.md` §2.3):
 *   - `dataset1/data1/data` uint16 360 × 600 (rays × bins), `dataset1/where`: nbins 600, nrays 360, rscale 250 m,
 *     rstart 0 km, elangle ≈ 0,8° (terrain-following: `dataset1/how/startelA` per ray 0,5 … 1,8°), a1gate.
 *   - `dataset1/how/startazA`/`stopazA`: the true azimuth interval of each ray (ray 0 is NOT north-aligned to 0,1°).
 *   - `dataset1/data1/what`: quantity URHOHV (gain 1/65534, offset −gain, nodata 65535, undetect 0) or DBZH.
 *   - `/what` date/time = nominal cycle start (the RV/px250 slot); the scan itself starts ≈ 4 s later
 *     (`dataset1/what starttime`), the seconds in the file NAME are its end. Slot S ⇔ the file whose name minute is S
 *     (px250 of 22:35 equals the dbzh sweep "2235…": 90 % same echo cells, 57 % of the values to 0,05 dB; the
 *     neighbouring sweeps 55 % / 2 %).
 *   - `/how/radar_system/dBZ0_H_pw<k>`: reflectivity at 1 km that equals the noise (SNR 0 dB) per pulse width.
 *   - ≈ 470 KB (URHOHV) / ≈ 90 KB (DBZH) per file; on the server ≈ 45 s after the scan end; 48 h retention.
 *
 * DOM-free (mirror, verifier, measurement scripts). Values through the one-chunk fast path of `dwdPx250.ts`
 * (`h5SingleChunkU16`), jsfive as the fallback.
 */

import { File as H5File } from 'jsfive';
import { h5SingleChunkU16, type H5Node, type InflateFn } from './dwdPx250.ts';

export const SWEEP_BASE_URL = 'https://opendata.dwd.de/weather/radar/sites';
/** Directory of a site's sweeps of one moment (relative to `SWEEP_BASE_URL`, with trailing slash). */
export const SWEEP_DIRS = Object.freeze({
  rhohv: (site: string): string => `sweep_pcp_rhohv/${site}/unfiltered/`,
  dbzh: (site: string): string => `sweep_pcp_z/${site}/hdf5/filter_polarimetric/`,
});
export const SWEEP_KEYS = Object.freeze({ rhohv: 'urhohv', dbzh: 'dbzh' });

/** The sweep file names of a directory listing, keyed by their minute stamp `YYYYMMDDHHMM` (newest wins). */
export function sweepNamesFromListing(html: string, key: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(`href="([^"/]*_${key}_00-(\\d{12})\\d{4}-[a-z]{3}-\\d+-hd5)"`, 'g');
  for (const m of html.matchAll(re)) out.set(m[2], m[1]);
  return out;
}
/** Name of the "latest" alias of a site's sweep (the DWD keeps one per directory). */
export function sweepLatestName(key: string, site: { id: string; wmo: number }): string {
  return `ras07-pcpng01_sweeph5onem_${key}_00-LATEST-${site.id}-${site.wmo}-hd5`;
}

export interface PolarSweep {
  site: string;
  quantity: string;
  /** nominal cycle start (`/what` date/time) = the slot of RV and px250, ms UTC */
  slotMs: number;
  nrays: number;
  nbins: number;
  /** bin length (m) and range of the first bin's near edge (m) */
  rscaleM: number;
  rstartM: number;
  /** per ray: azimuth interval (degrees, clockwise from north) and elevation (degrees) */
  startAz: Float32Array;
  stopAz: Float32Array;
  elDeg: Float32Array;
  lon: number;
  lat: number;
  heightM: number;
  /** physical values, rays × bins; `NaN` = nodata, `-Infinity` = undetect (no signal) */
  values: Float32Array;
  /** reflectivity at 1 km with SNR 0 dB for the pulse width of this sweep (dBZ), `NaN` if the file does not say */
  dbz0: number;
  pulseWidthUs: number;
}

const str = (v: unknown): string => String(v ?? '').replace(/\0+$/, '').trim();
const num = (v: unknown, what: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`sweep: ${what} fehlt oder ist keine Zahl`);
  return n;
};
const arr = (v: unknown, n: number, what: string): Float32Array => {
  const a = v as ArrayLike<number> | undefined;
  if (!a || typeof a === 'string' || a.length !== n) throw new Error(`sweep: ${what} fehlt oder hat nicht ${n} Einträge`);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Number(a[i]);
  return out;
};

/**
 * DWD pulse-width table of the EEC DWSR-5001C signal processor: index k of `dBZ0_H_pw<k>` ⇔ pulse width.
 * Measured: the precipitation scan runs 0,81 µs and the files carry pw0 (−35,4 dBZ) and pw2 (−41,3 dBZ) —
 * the longer pulse is the more sensitive one, so 0,8 µs ⇔ pw2 (`audit/radar-stoerecho.md` §2.3 checks this against
 * the weakest echoes per range).
 */
function dbz0For(sys: Record<string, unknown> | undefined, pulseUs: number): number {
  if (!sys) return NaN;
  const key = pulseUs >= 0.6 ? 'dBZ0_H_pw2' : 'dBZ0_H_pw0';
  const v = Number(sys[key]);
  return Number.isFinite(v) ? v : NaN;
}

export async function decodeSweep(buf: ArrayBuffer, opts: { name?: string; inflate?: InflateFn; reader?: 'auto' | 'jsfive' } = {}): Promise<PolarSweep> {
  const f = new H5File(buf, opts.name ?? 'sweep.h5') as unknown as { get(path: string): H5Node | undefined };
  const top = f.get('what')?.attrs, where = f.get('where')?.attrs;
  const dw = f.get('dataset1/where')?.attrs, dh = f.get('dataset1/how')?.attrs, q = f.get('dataset1/data1/what')?.attrs;
  const ds = f.get('dataset1/data1/data');
  if (!top || !where || !dw || !dh || !q || !ds) throw new Error('sweep: Gruppe /what, /where oder dataset1 fehlt');
  if (str(top.object) !== 'SCAN') throw new Error(`sweep: Objekt ${str(top.object) || '?'} statt SCAN`);
  const nrays = num(dw.nrays, 'nrays'), nbins = num(dw.nbins, 'nbins');
  // the same one-chunk layout as px250 (measured: chunk 360 × 600, one deflate filter) — jsfive's own inflate takes ≈ 170 ms
  const data: ArrayLike<number> | undefined = (opts.reader === 'jsfive' ? null : await h5SingleChunkU16(buf, ds, nrays * nbins, opts.inflate)) ?? ds.value;
  if (!data || data.length !== nrays * nbins) throw new Error(`sweep: ${data?.length ?? 0} Werte für ${nrays}×${nbins}`);
  const gain = num(q.gain, 'gain'), offset = num(q.offset, 'offset'), nodata = num(q.nodata, 'nodata'), undetect = num(q.undetect, 'undetect');
  const values = new Float32Array(nrays * nbins);
  for (let k = 0; k < values.length; k++) {
    const r = data[k];
    values[k] = r === nodata ? NaN : r === undetect ? -Infinity : r * gain + offset;
  }
  const d = str(top.date), t = str(top.time).padStart(6, '0');
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) throw new Error(`sweep: /what date/time unlesbar (${d} ${t})`);
  const slotMs = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
  const nod = /NOD:de([a-z]{3})/.exec(str(top.source));
  const elangle = num(dw.elangle, 'elangle');
  const startEl = dh.startelA ? arr(dh.startelA, nrays, 'startelA') : null;
  const stopEl = dh.stopelA ? arr(dh.stopelA, nrays, 'stopelA') : null;
  const elDeg = new Float32Array(nrays);
  for (let i = 0; i < nrays; i++) elDeg[i] = startEl && stopEl ? (startEl[i] + stopEl[i]) / 2 : elangle;
  const pulseWidthUs = Number(dh.pulsewidth);
  return {
    site: nod ? nod[1] : '', quantity: str(q.quantity), slotMs, nrays, nbins,
    rscaleM: num(dw.rscale, 'rscale'), rstartM: num(dw.rstart, 'rstart') * 1000,
    startAz: arr(dh.startazA, nrays, 'startazA'), stopAz: arr(dh.stopazA, nrays, 'stopazA'), elDeg,
    lon: num(where.lon, 'lon'), lat: num(where.lat, 'lat'), heightM: num(where.height, 'height'),
    values, dbz0: dbz0For(f.get('how/radar_system')?.attrs, pulseWidthUs), pulseWidthUs,
  };
}

/** Azimuth (tenth of a degree, 0 … 3599) → ray index, −1 where no ray covers the direction. */
export function sweepRayLut(s: Pick<PolarSweep, 'nrays' | 'startAz' | 'stopAz'>): Int16Array {
  const lut = new Int16Array(3600).fill(-1);
  for (let ray = 0; ray < s.nrays; ray++) {
    const a = s.startAz[ray];
    let b = s.stopAz[ray];
    if (b < a) b += 360;
    if (b - a > 5) continue;   // a ray wider than 5° is a recording fault, not a ray
    for (let t = Math.ceil(a * 10 - 1e-6); t < b * 10 - 1e-6; t++) lut[((t % 3600) + 3600) % 3600] = ray;
  }
  // close the gaps a jittering antenna leaves between stop and next start (≤ 0,3°) with the nearer neighbour
  const src = lut.slice();
  for (let t = 0; t < 3600; t++) {
    if (src[t] >= 0) continue;
    for (let d = 1; d <= 3; d++) {
      const lo = src[(t - d + 3600) % 3600], hi = src[(t + d) % 3600];
      if (lo >= 0) { lut[t] = lo; break; }
      if (hi >= 0) { lut[t] = hi; break; }
    }
  }
  return lut;
}
