import { readFileSync } from 'node:fs';
const load = (c) => { const g = JSON.parse(readFileSync(`public/countries/${c}.geojson`, 'utf8')).geometry; const r = []; if (g.type === 'Polygon') r.push(...g.coordinates); else for (const p of g.coordinates) r.push(...p); return r; };
const R = { DE: load('DE'), AT: load('AT'), CH: load('CH') };
const pip = (rings, lng, lat) => { let inside = false; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside; } return inside; };
const all = [...R.DE, ...R.AT, ...R.CH];
for (const c of Object.keys(R)) console.log(c, 'rings', R[c].length, 'vertices', R[c].reduce((a, r) => a + r.length, 0), 'ring sizes', R[c].map(r => r.length).join(','));
const li = [['Vaduz', 9.521, 47.141], ['Schaan', 9.509, 47.166], ['Balzers', 9.502, 47.067], ['Ruggell', 9.531, 47.236], ['Malbun', 9.609, 47.103], ['Triesenberg', 9.543, 47.123]];
for (const [n, x, y] of li) console.log(n, 'DACH=', pip(all, x, y), 'DE', pip(R.DE, x, y), 'AT', pip(R.AT, x, y), 'CH', pip(R.CH, x, y));
// Shared-border sample: walk the AT and CH rings (and DE), densify to 100 m, and probe both sides ±d perpendicular for gap/overlap
const kmLon = (lat) => 111.32 * Math.cos(lat * Math.PI / 180), kmLat = 110.57;
function probeBorder(A, B, nameA, nameB, bbox) {
  const stats = { len: 0, gap: 0, over: 0, gapMax: 0, overMax: 0, maxGapAt: null, maxOverAt: null };
  const ds = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3]; // km
  for (const ring of R[A]) for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    if (x0 < bbox[0] || x0 > bbox[2] || y0 < bbox[1] || y0 > bbox[3]) continue;
    const segKm = Math.hypot((x1 - x0) * kmLon(y0), (y1 - y0) * kmLat);
    const n = Math.max(1, Math.ceil(segKm / 0.1));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      // normal (outward unknown): test both sides at 50 m, decide which side is "outside A"
      const nx = -(y1 - y0) * kmLat, ny = (x1 - x0) * kmLon(y);
      const L = Math.hypot(nx, ny) || 1; const ux = nx / L / kmLon(y), uy = ny / L / kmLat; // unit (deg per km)
      const inA_plus = pip(R[A], x + ux * 0.05, y + uy * 0.05);
      const s = inA_plus ? -1 : 1; // s points outward of A
      // is B anywhere near (within 3 km outward)? only then it's a shared border segment
      const nearB = ds.some(d => pip(R[B], x + s * ux * d, y + s * uy * d)) || pip(R[B], x - s * ux * 0.3, y - s * uy * 0.3);
      if (!nearB) continue;
      stats.len += 0.1;
      // gap: outward from A, distance until B starts
      let gap = 0; for (const d of ds) { if (pip(R[B], x + s * ux * d, y + s * uy * d)) break; gap = d; }
      if (!pip(R[B], x + s * ux * 0.05, y + s * uy * 0.05)) { stats.gap += 0.1; if (gap > stats.gapMax) { stats.gapMax = gap; stats.maxGapAt = [x.toFixed(3), y.toFixed(3)]; } }
      // overlap: inward into A, B still inside
      let over = 0; for (const d of ds) { if (!pip(R[B], x - s * ux * d, y - s * uy * d)) break; over = d; }
      if (pip(R[B], x - s * ux * 0.05, y - s * uy * 0.05)) { stats.over += 0.1; if (over > stats.overMax) { stats.overMax = over; stats.maxOverAt = [x.toFixed(3), y.toFixed(3)]; } }
    }
  }
  console.log(`${nameA}→${nameB}: shared ≈ ${stats.len.toFixed(0)} km; gap-side ${stats.gap.toFixed(0)} km (max ≥ ${stats.gapMax} km at ${stats.maxGapAt}); overlap-side ${stats.over.toFixed(0)} km (max ≥ ${stats.overMax} km at ${stats.maxOverAt})`);
}
probeBorder('AT', 'CH', 'AT', 'CH', [9.4, 46.8, 10.6, 47.7]);
probeBorder('AT', 'DE', 'AT', 'DE', [9.4, 47.2, 13.9, 49.1]);
probeBorder('CH', 'DE', 'CH', 'DE', [7.4, 47.3, 9.8, 47.9]);
// LI: AT–CH gap width across LI at Vaduz latitude
for (const lat of [47.07, 47.10, 47.14, 47.18, 47.22]) { let a = null, c = null; for (let x = 9.40; x < 9.70; x += 0.001) { if (pip(R.CH, x, lat)) c = x; if (pip(R.AT, x, lat) && a === null) a = x; } console.log('lat', lat, 'CH east edge', c?.toFixed(3), 'AT west edge', a?.toFixed(3), 'gap km', a && c ? ((a - c) * kmLon(lat)).toFixed(1) : '?'); }
