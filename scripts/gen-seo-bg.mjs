// Generates public/seo-bg-dach.svg: the start page's DACH map background (src/DachMapBackground.tsx) as ONE static
// SVG for the JS-free SEO pages (scripts/seo). Same projection, colours and cut (centred on 11.4° E, top at 53.75° N);
// roads/rivers/cities are left out to keep the file small. Opacity is baked in (CSS cannot fade a background image).
// Run: node scripts/gen-seo-bg.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const LON0 = 4.0, LAT1 = 54.9, K = 100;
const KX = K * Math.cos((50 * Math.PI) / 180);
const px = (lon) => (lon - LON0) * KX;
const py = (lat) => (LAT1 - lat) * K;
const CENTER_LON = 11.4, TOP_LAT = 53.75, HALF_W = 560, BOTTOM_LAT = 45.4;

const load = (iso) => JSON.parse(readFileSync(new URL(`../public/countries/${iso}.geojson`, import.meta.url), 'utf8'));
const rings = (g) => g.geometry.type === 'Polygon' ? g.geometry.coordinates : g.geometry.coordinates.flat();
const pathOf = (g) => rings(g).map((r) => r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`).join('') + 'Z').join('');

const dach = pathOf(load('DACH'));
const borders = pathOf(load('AT')) + pathOf(load('CH'));
const x0 = px(CENTER_LON) - HALF_W, y0 = py(TOP_LAT), h = py(BOTTOM_LAT) - y0;
let cross = '';
for (let lon = 4; lon <= 19; lon++) for (let lat = 45; lat <= 54; lat++) cross += `M${(px(lon) - 2).toFixed(1)} ${py(lat).toFixed(1)}h4M${px(lon).toFixed(1)} ${(py(lat) - 2).toFixed(1)}v4`;
const labels = [['DEUTSCHLAND', 9.0, 50.75], ['ÖSTERREICH', 14.2, 47.35], ['SCHWEIZ', 7.9, 46.62]]
  .map(([t, lon, lat]) => `<text x="${px(lon).toFixed(1)}" y="${py(lat).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${t}</text>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${HALF_W * 2} ${h.toFixed(1)}" preserveAspectRatio="xMidYMin meet">
<defs><path id="l" d="${dach}"/><pattern id="d" width="3.6" height="3.6" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="0.55" fill="#2C2A26" fill-opacity="0.08"/></pattern></defs>
<g opacity="0.4">
<path d="${cross}" fill="none" stroke="#2C2A26" stroke-opacity="0.16" stroke-width="0.5"/>
<use href="#l" transform="translate(2 3)" fill="#E0D6BE" fill-opacity="0.5"/>
<use href="#l" fill="#ECE5D3"/>
<use href="#l" fill="url(#d)"/>
<path d="${borders}" fill="none" stroke="#2C2A26" stroke-opacity="0.26" stroke-width="0.6" stroke-dasharray="3 5" stroke-linecap="round"/>
<use href="#l" fill="none" stroke="#2C2A26" stroke-opacity="0.42" stroke-width="0.8" stroke-linejoin="round"/>
<g font-family="'League Spartan',system-ui,sans-serif" font-size="10" font-weight="600" letter-spacing="4.5" fill="#2C2A26" fill-opacity="0.15">${labels}</g>
</g>
</svg>
`;
writeFileSync(new URL('../public/seo-bg-dach.svg', import.meta.url), svg);
console.log(`public/seo-bg-dach.svg ${(svg.length / 1024).toFixed(1)} KB`);
