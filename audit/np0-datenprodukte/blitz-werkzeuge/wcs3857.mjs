// WCS 2.0.1 GetCoverage direkt auf EPSG:3857-Raster (nearest), Werte-/Farbmenge zählen.
// node wcs3857.mjs <bd|mtg> <TIME> <x0> <y0> <x1> <y1> <w> <h> <tag> [interp=nearest-neighbor]
import { readTiff } from './tiff.mjs';
import { writeFileSync } from 'node:fs';
const [src, T, x0, y0, x1, y1, w, h, tag, interp = 'nearest-neighbor'] = process.argv.slice(2);
const base = src === 'bd'
  ? 'https://maps.dwd.de/geoserver/dwd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=dwd__Blitzdichte'
  : 'https://view.eumetsat.int/geoserver/mtg_fd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mtg_fd__li_afa';
const crs = 'http://www.opengis.net/def/crs/EPSG/0/3857';
const url = `${base}&format=image/tiff&geotiff:compression=Deflate&subset=time("${T}")`
  + `&subsettingCrs=${crs}&outputCrs=${crs}&subset=X(${x0},${x1})&subset=Y(${y0},${y1})`
  + `&scalesize=i(${w}),j(${h})&interpolation=http://www.opengis.net/def/interpolation/OGC/1/${interp}`;
const t0 = Date.now();
const r = await fetch(url);
const b = Buffer.from(await r.arrayBuffer());
const ms = Date.now() - t0;
if (!r.ok || b[0] === 0x3c) { console.log(tag, r.status, ms + 'ms', b.toString('utf8', 0, 700).replace(/\s+/g, ' ')); process.exit(1); }
writeFileSync(`wcs-${tag}.tif`, b);
const t = readTiff(b);
const cols = new Map();
for (let i = 0; i < t.W * t.H; i++) {
  const k = Array.from(t.data.subarray(i * t.spp, i * t.spp + t.spp)).join(',');
  cols.set(k, (cols.get(k) || 0) + 1);
}
const mt = t.tags[33922] ?? t.tags[34264];
console.log(`${tag} ${r.status} ${b.length}B ${ms}ms ${t.W}x${t.H} spp=${t.spp} bps=${t.bps} fmt=${t.fmt} distinct=${cols.size} geo=${JSON.stringify(t.tags[33550] ?? null)} tie=${JSON.stringify(mt ? mt.slice(0, 6) : null)}`);
console.log('  ' + [...cols.entries()].sort((a, c) => c[1] - a[1]).slice(0, 24).map(([k, n]) => `${k}:${n}`).join(' '));
