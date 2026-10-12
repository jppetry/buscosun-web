// GL-0 spike: look at the data. For one glacier and some days, render [true colour | SCL overlay | rule overlay] so the
// snow-versus-cloud question (plan §5.6) is judged on pictures, not only on numbers.
//   overlay SCL : red = cloud (8/9/10), orange = shadow/dark (2/3), blue = snow (11)
//   overlay rule: red = cloud confirmed (SCL cloud AND B11 >= 0.15), green = SCL cloud but snow-like (NDSI > 0.4 AND B11 < 0.12),
//                 blue = snow (NDSI > 0.4 AND B11 < 0.12 AND not cloud), grey = rest; the glacier outline is drawn white
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/spike/render-scene.mjs <key> <day> [<day> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { stacSearch, assetGeo, readWindow, net } from '../lib/s2cog.mjs';
import { pixelBBox, rasterizeMask } from '../lib/raster.mjs';
import { encodePng } from '../lib/png.mjs';

const OUTL = JSON.parse(readFileSync('C:/dev/buscosun-glacier-cache/spike/lead-outlines.json', 'utf8'));
const [key, ...days] = process.argv.slice(2);
const g = OUTL[key];
const SCALE = 2;
for (const day of days) {
  const feats = await stacSearch({ collections: ['sentinel-2-l2a'], bbox: g.bbox, datetime: `${day}T00:00:00Z/${day}T23:59:59Z`, limit: 10 });
  const item = feats[0];
  const scl = assetGeo(item, 'scl'), b03 = assetGeo(item, 'green'), b11 = assetGeo(item, 'swir16'), tci = assetGeo(item, 'visual');
  const bb = pixelBBox(scl, g.geometry);
  const px0 = Math.floor(bb.x0) - 10, py0 = Math.floor(bb.y0) - 10;
  const W = Math.ceil(bb.x1) - px0 + 20, H = Math.ceil(bb.y1) - py0 + 20;
  const We = W + (W % 2), He = H + (H % 2);
  const mask = rasterizeMask(scl, g.geometry, px0, py0, We, He);
  const S = await readWindow(scl, px0, py0, px0 + We, py0 + He);
  const B11 = await readWindow(b11, px0, py0, px0 + We, py0 + He);
  const B03 = await readWindow(b03, 2 * px0, 2 * py0, 2 * (px0 + We), 2 * (py0 + He));
  const T = await readWindow(tci, 2 * px0, 2 * py0, 2 * (px0 + We), 2 * (py0 + He));
  const Wp = We * SCALE * 3, Hp = He * SCALE; // three panels
  const img = new Uint8Array(Wp * Hp * 3);
  const put = (x, y, r, gg, b) => { const o = (y * Wp + x) * 3; img[o] = r; img[o + 1] = gg; img[o + 2] = b; };
  const stats = { snowSCL: 0, cloudSCL: 0, cloudConfirmed: 0, cloudSnowLike: 0, snowRule: 0, n: 0 };
  for (let r = 0; r < He; r++) {
    for (let c = 0; c < We; c++) {
      const i = r * We + c;
      // true colour: average of the 2x2 block of the 10 m TCI
      let tr = 0, tg = 0, tb = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const o = ((2 * r + dy) * T.w + 2 * c + dx) * 3; tr += T.data[o]; tg += T.data[o + 1]; tb += T.data[o + 2]; }
      tr /= 4; tg /= 4; tb /= 4;
      const cls = S.data[i];
      const r11 = B11.data[i] * b11.scale + b11.offset;
      let r03 = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) r03 += B03.data[(2 * r + dy) * B03.w + 2 * c + dx]; r03 = (r03 / 4) * b03.scale + b03.offset;
      const ndsi = (r03 - r11) / (r03 + r11 || 1);
      const cloud = cls >= 8 && cls <= 10, shadow = cls === 2 || cls === 3, snowSCL = cls === 11;
      const snowlike = ndsi > 0.4 && r11 < 0.12;
      let ov2 = [0, 0, 0, 0], ov3 = [0, 0, 0, 0];
      if (cloud) ov2 = [255, 40, 40, 0.55]; else if (shadow) ov2 = [255, 150, 0, 0.5]; else if (snowSCL) ov2 = [40, 90, 255, 0.45];
      if (cloud && r11 >= 0.15) ov3 = [255, 40, 40, 0.55]; else if (cloud && snowlike) ov3 = [0, 200, 60, 0.55]; else if (!cloud && snowlike) ov3 = [40, 90, 255, 0.45]; else if (shadow) ov3 = [255, 150, 0, 0.5];
      if (mask[i]) { stats.n++; if (snowSCL) stats.snowSCL++; if (cloud) { stats.cloudSCL++; if (r11 >= 0.15) stats.cloudConfirmed++; else if (snowlike) stats.cloudSnowLike++; } if (snowlike && !cloud) stats.snowRule++; }
      const edge = mask[i] && (c === 0 || r === 0 || !mask[i - 1] || !mask[i - We] || !mask[i + 1] || !mask[i + We]);
      for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
        const x = c * SCALE + dx, y = r * SCALE + dy;
        const mix = (ov) => ov[3] ? [tr * (1 - ov[3]) + ov[0] * ov[3], tg * (1 - ov[3]) + ov[1] * ov[3], tb * (1 - ov[3]) + ov[2] * ov[3]] : [tr, tg, tb];
        put(x, y, tr, tg, tb);
        const m2 = mix(ov2), m3 = mix(ov3);
        put(x + We * SCALE, y, ...(edge ? [255, 255, 255] : m2));
        put(x + 2 * We * SCALE, y, ...(edge ? [255, 255, 255] : m3));
      }
    }
  }
  const file = `C:/dev/buscosun-glacier-cache/spike/render-${key}-${day}.png`;
  writeFileSync(file, encodePng(img, Wp, Hp, 3));
  console.log(day, item.id, 'sceneCloud', item.properties['eo:cloud_cover'], JSON.stringify(stats), file);
}
console.log((net.bytes / 1e6).toFixed(1), 'MB');
