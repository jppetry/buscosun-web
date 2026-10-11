// GL-0 spike (plan §5.6): Sen2Cor SCL on glaciers — how often is snow labelled cloud (classes 8/9/10), and what does a
// glacier window cost in bytes? For each lead glacier and a sample of summer-2026 scenes: SCL (20 m), B03 (10 m, halved
// to 20 m) and B11 (20 m) inside the outline; NDSI = (B03-B11)/(B03+B11); "snow-like" = NDSI > 0.40 and B11 < 0.15.
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/spike/scl-check.mjs [key ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { stacSearch, assetGeo, readWindow, cogHeader, net } from '../lib/s2cog.mjs';
import { pixelBBox, rasterizeMask, halve } from '../lib/raster.mjs';

const OUTL = JSON.parse(readFileSync('C:/dev/buscosun-glacier-cache/spike/lead-outlines.json', 'utf8'));
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(OUTL);
const SAMPLE = { hintereisferner: 22, aletsch: 6, rhone: 10, pasterze: 10, 'noerdl-schneeferner': 14 };

const out = [];
for (const key of keys) {
  const g = OUTL[key];
  const [lon0, lat0, lon1, lat1] = g.bbox;
  const feats = await stacSearch({
    collections: ['sentinel-2-l2a'], bbox: [lon0, lat0, lon1, lat1], datetime: '2026-06-01T00:00:00Z/2026-10-09T23:59:59Z', limit: 200,
    sortby: [{ field: 'properties.datetime', direction: 'asc' }],
  });
  // one item per day that fully covers the glacier bbox
  const byDay = new Map();
  for (const f of feats) {
    const day = f.properties.datetime.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, f);
  }
  const days = [...byDay.keys()];
  const n = Math.min(SAMPLE[key] ?? 8, days.length);
  const pick = Array.from({ length: n }, (_, i) => days[Math.floor((i * days.length) / n)]);
  console.log(`== ${key}: ${feats.length} items, ${days.length} days, sampling ${pick.length}`);
  for (const day of pick) {
    const item = byDay.get(day);
    const t0 = Date.now(), b0 = net.bytes, r0 = net.requests;
    try {
      const scl = assetGeo(item, 'scl'), b03 = assetGeo(item, 'green'), b11 = assetGeo(item, 'swir16');
      if (!scl || !b03 || !b11) throw new Error('assets missing');
      const bb = pixelBBox(scl, g.geometry);
      const px0 = Math.floor(bb.x0) - 1, py0 = Math.floor(bb.y0) - 1, w = Math.ceil(bb.x1) - px0 + 2, h = Math.ceil(bb.y1) - py0 + 2;
      const W = w + (w % 2), H = h + (h % 2); // even for the 10 m -> 20 m halving
      const mask = rasterizeMask(scl, g.geometry, px0, py0, W, H);
      const nMask = mask.reduce((s, v) => s + v, 0);
      const S = await readWindow(scl, px0, py0, px0 + W, py0 + H);
      const B11 = await readWindow(b11, px0, py0, px0 + W, py0 + H);
      const B03 = await readWindow(b03, 2 * px0, 2 * py0, 2 * (px0 + W), 2 * (py0 + H));
      const g20 = halve(B03.data, B03.w, B03.h);
      const cls = new Array(12).fill(0);
      let cloudN = 0, cloudSnowLike = 0, cloudB11 = 0, snowN = 0, snowNdsi = 0;
      for (let i = 0; i < W * H; i++) {
        if (!mask[i]) continue;
        const c = S.data[i]; cls[c] = (cls[c] ?? 0) + 1;
        const r11 = B11.data[i] * b11.scale + b11.offset, r03 = g20.data[i] * b03.scale + b03.offset;
        const ndsi = (r03 - r11) / (r03 + r11 || 1);
        if (c >= 8 && c <= 10) { cloudN++; cloudB11 += r11; if (ndsi > 0.4 && r11 < 0.15) cloudSnowLike++; }
        if (c === 11) { snowN++; snowNdsi += ndsi; }
      }
      const rec = {
        glacier: key, day, id: item.id, sceneCloud: item.properties['eo:cloud_cover'], px: nMask,
        scl: { nodata: (cls[0] + cls[1]) / nMask, dark: cls[2] / nMask, shadow: cls[3] / nMask, snow: cls[11] / nMask, cloud: (cls[8] + cls[9] + cls[10]) / nMask, veg_rock: (cls[4] + cls[5] + cls[7]) / nMask },
        cloudMeanB11: cloudN ? cloudB11 / cloudN : null, cloudSnowLikeFrac: cloudN ? cloudSnowLike / cloudN : null,
        snowMeanNdsi: snowN ? snowNdsi / snowN : null,
        bytes: net.bytes - b0, requests: net.requests - r0, ms: Date.now() - t0,
      };
      out.push(rec);
      const f = (x) => (x == null ? '  -  ' : (100 * x).toFixed(0).padStart(3) + '%');
      console.log(`${day} sc${String(rec.sceneCloud.toFixed(0)).padStart(3)}% px${String(nMask).padStart(6)} snow${f(rec.scl.snow)} cloud${f(rec.scl.cloud)} shad${f(rec.scl.shadow + rec.scl.dark)} nodata${f(rec.scl.nodata)}  cloud->snowlike ${f(rec.cloudSnowLikeFrac)} cloudB11 ${rec.cloudMeanB11?.toFixed(2) ?? '-'}  ${(rec.bytes / 1024).toFixed(0)} KB ${rec.requests} req ${rec.ms} ms`);
    } catch (e) {
      console.log(`${day} FAILED ${e.message}`);
    }
  }
}
writeFileSync('C:/dev/buscosun-glacier-cache/spike/scl-check.json', JSON.stringify(out));
console.log('total', (net.bytes / 1e6).toFixed(1), 'MB in', net.requests, 'requests');
