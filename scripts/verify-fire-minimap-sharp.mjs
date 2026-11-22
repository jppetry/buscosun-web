/**
 * verify:fire-minimap-sharp — the dossier map "Karte · markiert" asks for raster tiles matching the
 * device pixel ratio (src/fire/rasterSharp.ts), only for the satellite basemap, unchanged at ratio 1.
 * Run: npm run verify:fire-minimap-sharp
 */
import { readFileSync } from 'node:fs';
import { sharpLevels, sharpRasterStyle, SHARP_IMAGERY_MAX_TILE_ZOOM } from '../src/fire/rasterSharp.ts';

let pass = 0;
let fail = 0;
function add(name, ok) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

// The real shape of `rasterStyle` in src/fire/FireMap.tsx (checked below against the source text).
const sat = () => ({
  version: 8,
  sources: { base: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'x' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

add('levels: 1 → 0, 1.25 → 0, 1.5 → 1, 2 → 1, 2.625 → 1, 3 → 2, 4 → 2',
  [[1, 0], [1.25, 0], [1.5, 1], [2, 1], [2.625, 1], [3, 2], [4, 2]].every(([r, k]) => sharpLevels(r) === k));
add('levels: NaN, 0, negative → 0', [NaN, 0, -2].every((r) => sharpLevels(r) === 0));

const s1 = sat();
add('pixel ratio 1: same object, desktop unchanged', sharpRasterStyle(s1, 1) === s1 && s1.sources.base.tileSize === 256);

const s2 = sat();
const o2 = sharpRasterStyle(s2, 2);
add('pixel ratio 2: tileSize 128, one level deeper', o2.sources.base.tileSize === 128);
add('pixel ratio 2: input not mutated', s2.sources.base.tileSize === 256 && s2.sources.base.maxzoom === undefined);

const o3 = sharpRasterStyle(sat(), 3);
add('pixel ratio 3 (phone): tileSize 64, two levels deeper', o3.sources.base.tileSize === 64);
add(`pixel ratio 3: maxzoom capped at ${SHARP_IMAGERY_MAX_TILE_ZOOM} (overzoom beyond)`, o3.sources.base.maxzoom === SHARP_IMAGERY_MAX_TILE_ZOOM);
add('pixel ratio 3: tiles, attribution, layers kept', o3.sources.base.tiles[0] === sat().sources.base.tiles[0]
  && o3.sources.base.attribution === 'x' && JSON.stringify(o3.layers) === JSON.stringify(sat().layers));

const url = 'https://tiles.openfreemap.org/styles/dark';
add('URL style (Straßen) unchanged', sharpRasterStyle(url, 3) === url);
const vec = { version: 8, sources: { v: { type: 'vector', url: 'x' } }, layers: [] };
add('vector-only style unchanged (same reference)', sharpRasterStyle(vec, 3) === vec);
const noSize = { version: 8, sources: { r: { type: 'raster', tiles: ['t'] } }, layers: [] };
add('raster without tileSize: MapLibre default 512 → 128 at ratio 3', sharpRasterStyle(noSize, 3).sources.r.tileSize === 128);

// Wiring: both setStyle calls of the dossier map go through miniBasemapStyle; only the satellite is sharpened.
const mini = readFileSync(new URL('../src/fire/FireMiniMap.tsx', import.meta.url), 'utf8');
const fireMap = readFileSync(new URL('../src/fire/FireMap.tsx', import.meta.url), 'utf8');
const setStyleCalls = [...mini.matchAll(/map\.setStyle\(([a-zA-Z]+)\(/g)].map((m) => m[1]);
add('FireMiniMap: two setStyle calls, both miniBasemapStyle', setStyleCalls.length === 2 && setStyleCalls.every((f) => f === 'miniBasemapStyle'));
// Counter-probe: the same pattern finds the bare call it guards against.
const probe = [...'map.setStyle(basemapStyle(basemap), {})'.matchAll(/map\.setStyle\(([a-zA-Z]+)\(/g)].map((m) => m[1]);
add('counter-probe: pattern sees a bare basemapStyle call', probe.length === 1 && probe[0] === 'basemapStyle');
add("FireMiniMap: only 'satellite' is sharpened", /b === 'satellite' \? sharpRasterStyle\(style, pixelRatio\) : style/.test(mini));
add('FireMap: rasterStyle still declares tileSize 256 (fixture shape)', /type: 'raster', tiles: \[url\], tileSize: 256/.test(fireMap));
add('FireMap (main map) not touched: no sharpRasterStyle there', !fireMap.includes('sharpRasterStyle'));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
