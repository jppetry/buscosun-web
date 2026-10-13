import { readFileSync } from 'node:fs';
const load = (c) => { const g = JSON.parse(readFileSync(`public/countries/${c}.geojson`, 'utf8')).geometry; const r = []; if (g.type === 'Polygon') r.push(...g.coordinates); else for (const p of g.coordinates) r.push(...p); return r; };
const R = { DE: load('DE'), AT: load('AT'), CH: load('CH') };
const pip = (rings, lng, lat) => { let inside = false; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside; } return inside; };
// near-border cells: 0.01° grid cells touched by any segment of any ring (expanded ±2 cells)
const step = 0.0025, coarse = 0.01, near = new Set();
const key = (x, y) => `${Math.floor(x / coarse)},${Math.floor(y / coarse)}`;
for (const c of Object.keys(R)) for (const ring of R[c]) for (let i = 0; i < ring.length - 1; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[i + 1]; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / coarse) + 1; for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) near.add(`${Math.floor(x / coarse) + dx},${Math.floor(y / coarse) + dy}`); } }
let gap = 0, over = 0, liCells = 0; const overBy = {}; const gapAt = {};
const cellKm2 = (lat) => (step * 111.32 * Math.cos(lat * Math.PI / 180)) * (step * 110.57);
for (const k of near) {
  const [cx, cy] = k.split(',').map(Number);
  for (let x = cx * coarse + step / 2; x < (cx + 1) * coarse; x += step) for (let y = cy * coarse + step / 2; y < (cy + 1) * coarse; y += step) {
    const d = pip(R.DE, x, y), a = pip(R.AT, x, y), c = pip(R.CH, x, y); const n = d + a + c;
    if (n === 2) { over += cellKm2(y); const p = d && a ? 'DE-AT' : d && c ? 'DE-CH' : 'AT-CH'; overBy[p] = (overBy[p] ?? 0) + cellKm2(y); }
    else if (n === 0) {
      // "gap" = outside all, but inside at least two countries within 3 km ⇒ seam between two countries (excludes outer borders)
      const nb = (r) => [0.03, -0.03].some(dx => [0, 0.027, -0.027].some(dy => pip(r, x + dx, y + dy))) || [0.027, -0.027].some(dy => pip(r, x, y + dy));
      const m = nb(R.DE) + nb(R.AT) + nb(R.CH);
      if (m >= 2) { gap += cellKm2(y); const g = `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`; gapAt[g] = (gapAt[g] ?? 0) + cellKm2(y); }
    }
  }
}
console.log('overlap km² (even-odd ⇒ sand on land):', over.toFixed(0), overBy);
console.log('seam gap km² (no country, two countries within 3 km):', gap.toFixed(0));
console.log('largest gap cells (0.1° bins, km²):', Object.entries(gapAt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join(' | '));
