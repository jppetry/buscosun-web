// GL-0 spike: is the 20 m overview of the 10 m green band (B03) good enough for the NDSI? Compares bytes and the
// snow/no-snow decision (NDSI > 0.4) between [10 m halved] and [overview level 1] inside the glacier mask.
import { readFileSync } from 'node:fs';
import { stacSearch, assetGeo, readWindow, net } from '../lib/s2cog.mjs';
import { pixelBBox, rasterizeMask, halve } from '../lib/raster.mjs';
const OUTL = JSON.parse(readFileSync('C:/dev/buscosun-glacier-cache/spike/lead-outlines.json', 'utf8'));
const [key, day] = process.argv.slice(2);
const g = OUTL[key];
const item = (await stacSearch({ collections: ['sentinel-2-l2a'], bbox: g.bbox, datetime: `${day}T00:00:00Z/${day}T23:59:59Z`, limit: 5 }))[0];
const scl = assetGeo(item, 'scl'), b03 = assetGeo(item, 'green'), b11 = assetGeo(item, 'swir16');
const bb = pixelBBox(scl, g.geometry);
const px0 = Math.floor(bb.x0) - 1, py0 = Math.floor(bb.y0) - 1;
let W = Math.ceil(bb.x1) - px0 + 2, H = Math.ceil(bb.y1) - py0 + 2; W += W % 2; H += H % 2;
const mask = rasterizeMask(scl, g.geometry, px0, py0, W, H);
const B11 = await readWindow(b11, px0, py0, px0 + W, py0 + H);
let b0 = net.bytes;
const full = await readWindow(b03, 2 * px0, 2 * py0, 2 * (px0 + W), 2 * (py0 + H));
const bytesFull = net.bytes - b0; b0 = net.bytes;
const ov = await readWindow(b03, px0, py0, px0 + W, py0 + H, { level: 1 });
const bytesOv = net.bytes - b0;
const hf = halve(full.data, full.w, full.h);
let agree = 0, n = 0, snowF = 0, snowO = 0, sumAbs = 0;
for (let i = 0; i < W * H; i++) {
  if (!mask[i]) continue;
  const r11 = B11.data[i] * b11.scale + b11.offset;
  const rf = hf.data[i] * b03.scale + b03.offset, ro = ov.data[i] * b03.scale + b03.offset;
  const nf = (rf - r11) / (rf + r11 || 1), no = (ro - r11) / (ro + r11 || 1);
  n++; sumAbs += Math.abs(nf - no);
  const sf = nf > 0.4, so = no > 0.4; if (sf) snowF++; if (so) snowO++; if (sf === so) agree++;
}
console.log(key, day, 'mask px', n, '| bytes B03 full', (bytesFull / 1024).toFixed(0), 'KB, overview', (bytesOv / 1024).toFixed(0), 'KB | snow share full', (snowF / n).toFixed(3), 'overview', (snowO / n).toFixed(3), '| agreement', (agree / n).toFixed(4), '| mean |dNDSI|', (sumAbs / n).toFixed(4));
