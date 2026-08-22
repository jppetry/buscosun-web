/**
 * Sonde: die ECHTEN Gitterparameter der beiden GRIB-Gitter, die die Wetterkarte
 * rendert — ICON-D2 (alle Flächen-Layer) und ICON-EU (Wind auf Druckflächen).
 * Ausgangspunkt jeder Versatz-Rechnung — geraten wird nichts.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/karten-layer-verortung/probe-d2grid.mjs
 */
import bz2 from 'bz2';
import { decodeGrib2, gribCorners } from '../../src/sources/gribDecode.ts';

const FAELLE = [
  ['ICON-D2', 'https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/t_2m/',
    /href="(icon-d2_germany_regular-lat-lon_single-level_\d+_000_2d_t_2m\.grib2\.bz2)"/],
  ['ICON-EU', 'https://opendata.dwd.de/weather/nwp/icon-eu/grib/00/t_2m/',
    /href="(icon-eu_europe_regular-lat-lon_single-level_\d+_000_T_2M\.grib2\.bz2)"/],
];

for (const [name, dir, re] of FAELLE) {
  try {
    const m = (await (await fetch(dir)).text()).match(re);
    if (!m) { console.log(`${name}: kein Feld gefunden`); continue; }
    const packed = new Uint8Array(await (await fetch(dir + m[1])).arrayBuffer());
    const raw = bz2.decompress(packed);
    const f = decodeGrib2(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
    const ss = Math.max(1, Math.ceil(f.ni / 700));   // TARGET_WIDTH aller Raster-Quellen
    const W = Math.ceil(f.ni / ss), H = Math.ceil(f.nj / ss);
    console.log(`\n=== ${name}  (${m[1]})`);
    console.log(`    ni ${f.ni} · nj ${f.nj} · lon1 ${f.lon1.toFixed(3)} · lat1 ${f.lat1.toFixed(3)}`
      + ` · di ${f.di} · dj ${f.dj} · scanMode ${f.scanMode}`);
    console.log(`    gribCorners (Außenkanten): ` + JSON.stringify(gribCorners(f).map((c) => c.map((v) => +v.toFixed(4)))));
    console.log(`    Subsampling ss=${ss} → Ausgabe ${W}×${H}, Ausgabezelle ${(ss * f.di).toFixed(4)}° `
      + `≈ ${(ss * f.di * 111.32 * Math.cos(50 * Math.PI / 180)).toFixed(2)} × ${(ss * f.dj * 111.13).toFixed(2)} km`);
    console.log(`    ⇒ halbe NATIVzelle (Nordversatz) = ${(f.dj / 2 * 111.13).toFixed(2)} km`);
  } catch (e) {
    console.log(`${name}: ${e.message}`);
  }
}
