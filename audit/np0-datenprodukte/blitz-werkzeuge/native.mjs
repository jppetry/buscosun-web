// Nativer WCS-Ausschnitt (keine Umprojektion, keine Skalierung) + eigene Nearest-Abbildung auf ein festes
// EPSG:3857-Raster. node native.mjs <bd|mtg> <TIME> [tag] → Dauer, Bytes, Werte/Klassen, Ziel-PNG-Größe.
import { readTiff } from './tiff.mjs';
import { encodePng } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { writeFileSync } from 'node:fs';

const [src, T, tag = src] = process.argv.slice(2);
const R = 6378137;
// Vorschlag Ziel-Raster: DACH 5,5–17,5 °E · 45,5–55,5 °N, 2 000 m Mercator-Pixel (≈ 1,29 km am Boden bei 50 °N).
export const GRID = { x0: 612257, y1: 7459517, px: 2000, w: 668, h: 880 };
const LAT = [45.5, 55.5], LON = [5.5, 17.5];
const url = src === 'bd'
  ? `https://maps.dwd.de/geoserver/dwd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=dwd__Blitzdichte&format=image/tiff&geotiff:compression=Deflate&subset=time("${T}")&subset=Lat(${LAT[0]},${LAT[1]})&subset=Long(${LON[0]},${LON[1]})`
  : `https://view.eumetsat.int/geoserver/mtg_fd/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=mtg_fd__li_afa&format=image/tiff&geotiff:compression=Deflate&subset=time("${T}")&subset=Lat(${LAT[0]},${LAT[1]})&subset=Long(${LON[0]},${LON[1]})`;
const t0 = Date.now();
const r = await fetch(url);
const b = Buffer.from(await r.arrayBuffer());
const ms = Date.now() - t0;
if (!r.ok || b[0] === 0x3c) { console.log(tag, r.status, ms + 'ms', b.toString('utf8', 0, 500).replace(/\s+/g, ' ')); process.exit(1); }
writeFileSync(`native-${tag}.tif`, b);
const t = readTiff(b);
// Geo-Transformation aus ModelPixelScale (33550) + ModelTiepoint (33922) oder ModelTransformation (34264).
let ox, oy, sx, sy;
if (t.tags[33550] && t.tags[33922]) { [sx, sy] = t.tags[33550]; ox = t.tags[33922][3]; oy = t.tags[33922][4]; sy = -sy; }
else { const m = t.tags[34264]; sx = m[0]; ox = m[3]; sy = m[5]; oy = m[7]; }
// GeoServer schreibt für EPSG:4326 lon/lat (x = lon). Pixel-Mitte i: lon = ox + (i + 0,5)·sx (PixelIsArea).
const out = new Uint8Array(GRID.w * GRID.h * 4);
let miss = 0, outside = 0;
const classes = new Map();
const MTG_G = [249, 243, 236, 229, 222, 213, 200, 186, 173, 160, 147, 130, 110, 86, 68, 51, 30, 16, 6, 0];
for (let row = 0; row < GRID.h; row++) {
  const y = GRID.y1 - (row + 0.5) * GRID.px;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
  const j = Math.floor((lat - oy) / sy);
  for (let col = 0; col < GRID.w; col++) {
    const lon = (GRID.x0 + (col + 0.5) * GRID.px) / R * 180 / Math.PI;
    const i = Math.floor((lon - ox) / sx);
    const o = (row * GRID.w + col) * 4;
    if (i < 0 || j < 0 || i >= t.W || j >= t.H) { outside++; continue; } // A = 0: keine Abdeckung
    const p = (j * t.W + i) * t.spp;
    if (src === 'bd') {
      const v = t.data[p];
      if (v === 9999) { continue; }                   // Nodata ⇒ A = 0
      if (v < 0 || v > 127 || v !== Math.round(v * 2) / 2) miss++;
      out[o] = Math.round(v); out[o + 3] = 255;
      classes.set(v, (classes.get(v) || 0) + 1);
    } else {
      const rgb = [t.data[p], t.data[p + 1], t.data[p + 2]];
      if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) { out[o + 3] = 255; classes.set(0, (classes.get(0) || 0) + 1); continue; }
      const k = MTG_G.indexOf(rgb[1]) + 1;
      if (k === 0) { miss++; continue; }
      out[o] = k; out[o + 3] = 255;
      classes.set(k, (classes.get(k) || 0) + 1);
    }
  }
}
const png = encodePng(GRID.w, GRID.h, out, 4);
writeFileSync(`grid-${tag}.png`, png);
console.log(`${tag} ${T} WCS ${r.status} ${b.length}B ${ms}ms native ${t.W}x${t.H}x${t.spp} geo ox=${ox} oy=${oy} sx=${sx} sy=${sy} · Ziel ${GRID.w}x${GRID.h} PNG ${png.length}B · ausserhalb=${outside} unbekannt=${miss} · Klassen ${[...classes.entries()].sort((a, c) => a[0] - c[0]).map(([k, n]) => `${k}:${n}`).join(' ')}`);
