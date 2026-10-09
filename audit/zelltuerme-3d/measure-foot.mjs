// Phase ZT (audit/zelltuerme-3d.md V-ZT-5): which `maxzoom` for the tower source?
// MapLibre lifts an extrusion by the DEM at the ring vertex mean. With an overscaled source (`maxzoom` below the map zoom)
// the DEM is read at the CANONICAL tile zoom of the source ⇒ foot error = |DEM_z(mean) − DEM_12(mean)|.
// A lower `maxzoom` cuts fewer cells at tile borders (step in the tower foot, spike). This script measures both at the
// real cells of the three KONRAD3D fixtures (Terrarium tiles, bilinear like `get_elevation`).
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/zelltuerme-3d/measure-foot.mjs
import { readFileSync } from 'node:fs';
import { decodePng, toRgba } from '../../scripts/lib/png.mjs';
import { parseKonrad3d } from '../../src/radar/konrad3d.ts';
import { closedRing, ringVertexMean } from '../../src/nowcast/cellTowers/towerModel.ts';

const tiles = new Map();
async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!tiles.has(k)) tiles.set(k, (async () => {
    const r = await fetch(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${k}.png`);
    if (!r.ok) return null;
    return { data: toRgba(decodePng(Buffer.from(await r.arrayBuffer()))) };
  })());
  return tiles.get(k);
}
const merc = (lon, lat, z) => {
  const n = 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
async function elev(lon, lat, z) {
  const [fx, fy] = merc(lon, lat, z);
  const px = fx * 256 - 0.5, py = fy * 256 - 0.5;
  const x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
  const at = async (X, Y) => {
    const t = await tile(z, Math.floor(X / 256), Math.floor(Y / 256));
    const i = ((Y & 255) * 256 + (X & 255)) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const a = await at(x0, y0), b = await at(x0 + 1, y0), c = await at(x0, y0 + 1), d = await at(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
const cells = ['konrad3d-sample.xml', 'konrad3d-20261007T184500.xml', 'konrad3d-20261008T143000.xml']
  .flatMap((f) => parseKonrad3d(readFileSync(`scripts/fixtures/${f}`, 'utf8'), f).cells.map((c) => ({ f, c })));
const ZS = [7, 8, 9, 10];
const err = Object.fromEntries(ZS.map((z) => [z, []]));
const cut = Object.fromEntries(ZS.map((z) => [z, 0]));
for (const { c } of cells) {
  const ring = closedRing(c.hull);
  const m = ringVertexMean(ring);
  const ref = await elev(m[0], m[1], 12);
  for (const z of ZS) {
    err[z].push(Math.abs((await elev(m[0], m[1], z)) - ref));
    const ids = new Set(ring.map(([lon, lat]) => merc(lon, lat, z).map(Math.floor).join('/')));
    if (ids.size > 1) cut[z]++;
  }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`cells: ${cells.length} (3 fixtures; 3 alpine, 20 lowland)`);
for (const z of ZS) console.log(`maxzoom ${z}: foot error |DEM_z − DEM_12| median ${q(err[z], 0.5).toFixed(0)} m, p90 ${q(err[z], 0.9).toFixed(0)} m, max ${Math.max(...err[z]).toFixed(0)} m · cells cut by a tile border ${cut[z]}/${cells.length}`);
const alpine = cells.map((x, i) => i).filter((i) => cells[i].f === 'konrad3d-sample.xml');
for (const z of ZS) console.log(`  alpine (${alpine.length}) maxzoom ${z}: ${alpine.map((i) => err[z][i].toFixed(0)).join(' / ')} m`);
