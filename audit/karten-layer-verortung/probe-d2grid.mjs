/**
 * Sonde: die ECHTEN Gitterparameter des ICON-D2-`regular-lat-lon`-Feldes.
 * Ausgangspunkt jeder Versatz-Rechnung — geraten wird nichts.
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/karten-layer-verortung/probe-d2grid.mjs
 */
import bz2 from 'bz2';
import { decodeGrib2, gribCorners } from '../../src/sources/gribDecode.ts';

const dir = 'https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/t_2m/';
const list = await (await fetch(dir)).text();
const m = list.match(/href="(icon-d2_germany_regular-lat-lon_single-level_\d+_000_2d_t_2m\.grib2\.bz2)"/);
if (!m) { console.log('kein Feld gefunden'); process.exit(1); }
const r = await fetch(dir + m[1]);
const packed = new Uint8Array(await r.arrayBuffer());
const raw = bz2.decompress(packed);
const f = decodeGrib2(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
console.log(m[1]);
console.log(JSON.stringify({
  ni: f.ni, nj: f.nj, lat1: f.lat1, lon1: f.lon1, lat2: f.lat2, lon2: f.lon2,
  di: f.di, dj: f.dj, scanMode: f.scanMode, corners: gribCorners(f),
}, null, 2));
