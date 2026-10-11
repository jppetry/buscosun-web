// GL-0 spike: how many Sentinel-2 L2A scenes does Earth Search deliver per lead glacier in summer 2026,
// and which assets/metadata come with them. Plain fetch, no dependencies.
//   node scripts/glacier/spike/stac-scenes.mjs [from] [to]   (default 2026-06-01 .. 2026-10-10)
const STAC = 'https://earth-search.aws.element84.com/v1/search';
const from = process.argv[2] ?? '2026-06-01';
const to = process.argv[3] ?? '2026-10-10';

const GLACIERS = [
  { id: 'hintereisferner', lon: 10.78, lat: 46.80 },
  { id: 'aletsch', lon: 8.05, lat: 46.50 },
  { id: 'rhone', lon: 8.40, lat: 46.62 },
  { id: 'pasterze', lon: 12.70, lat: 47.09 },
  { id: 'noerdl-schneeferner', lon: 10.983, lat: 47.416 },
];

const out = {};
for (const g of GLACIERS) {
  const d = 0.02;
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: [g.lon - d, g.lat - d, g.lon + d, g.lat + d],
    datetime: `${from}T00:00:00Z/${to}T23:59:59Z`,
    limit: 200,
    sortby: [{ field: 'properties.datetime', direction: 'asc' }],
  };
  const r = await fetch(STAC, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'buscosun-glacier-spike/0.1' }, body: JSON.stringify(body) });
  const j = await r.json();
  const feats = j.features ?? [];
  out[g.id] = feats.map((f) => ({
    id: f.id,
    dt: f.properties.datetime,
    tile: f.properties['grid:code'] ?? f.properties['s2:mgrs_tile'] ?? null,
    cloud: f.properties['eo:cloud_cover'],
    snow: f.properties['s2:snow_ice_percentage'],
    nodata: f.properties['s2:nodata_pixel_percentage'],
    assets: Object.keys(f.assets),
  }));
  const byTile = {};
  for (const s of out[g.id]) byTile[s.tile] = (byTile[s.tile] ?? 0) + 1;
  const clear = out[g.id].filter((s) => s.cloud < 30).length;
  console.log(`${g.id.padEnd(20)} ${String(feats.length).padStart(3)} scenes  tiles ${JSON.stringify(byTile)}  cloud<30%: ${clear}  cloud<10%: ${out[g.id].filter((s) => s.cloud < 10).length}`);
}
console.log('asset keys of the first scene:', out.hintereisferner[0]?.assets.join(','));
import { writeFileSync } from 'node:fs';
writeFileSync('C:/dev/buscosun-glacier-cache/spike/stac-scenes-2026.json', JSON.stringify(out));
