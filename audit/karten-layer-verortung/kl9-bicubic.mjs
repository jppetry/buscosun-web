// KL9-Beleg (2026-08-26): bikubische Verfeinerung 64² → N² gegen die direkte Inverse an allen Knoten — Messgrundlage für §15.4.
import { DE1200_CORNERS, psFwd, psInv } from '../../src/sources/radolanGeo.ts';
import { cellCentersToEdges, incaFwd, incaInv } from '../../src/sources/geosphereIncaGeo.ts';
import { rzcFwd, rzcInv } from '../../src/sources/meteoSwissGeo.ts';
const R = 6371.0088;
const distKm = (lo1, la1, lo2, la2) => { const dl = (la2 - la1) * Math.PI / 180, dn = (lo2 - lo1) * Math.PI / 180; const a = Math.sin(dl / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const projLinear = (C, fwd, inv, bilin) => { const P = C.map(([lo, la]) => fwd(lo, la)); if (bilin) return (u, v) => inv((1 - u) * (1 - v) * P[0][0] + u * (1 - v) * P[1][0] + u * v * P[2][0] + (1 - u) * v * P[3][0], (1 - u) * (1 - v) * P[0][1] + u * (1 - v) * P[1][1] + u * v * P[2][1] + (1 - u) * v * P[3][1]); const west = (P[0][0] + P[3][0]) / 2, ost = (P[1][0] + P[2][0]) / 2, nord = (P[0][1] + P[1][1]) / 2, sued = (P[2][1] + P[3][1]) / 2; return (u, v) => inv(west + u * (ost - west), nord + v * (sued - nord)); };
const AT_C = cellCentersToEdges([[8.09813404083252, 49.362918853759766], [17.74226951599121, 49.396671295166016], [17.430356979370117, 45.53426742553711], [8.468643188476562, 45.50288391113281]], 701, 431);
const CH_C = [[2.689419984817505, 49.3744010925293], [12.462300300598145, 49.36330032348633], [11.955599784851074, 43.61899948120117], [3.1687800884246826, 43.62900161743164]];
// Catmull-Rom
const cr = (t) => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2];
function refine(truth, nc, n) {
  const t0 = performance.now();
  const S = nc + 3; // Geisterring ±1
  const coarse = new Float64Array(S * S * 2);
  for (let j = -1; j <= nc + 1; j++) for (let i = -1; i <= nc + 1; i++) { const ll = truth(i / nc, j / nc); const k = ((j + 1) * S + (i + 1)) * 2; coarse[k] = ll[0]; coarse[k + 1] = ll[1]; }
  const t1 = performance.now();
  const out = new Float64Array((n + 1) * (n + 1) * 2);
  for (let j = 0; j <= n; j++) {
    const fy = j / n * nc, cy = Math.min(nc - 1, Math.floor(fy)), ty = fy - cy, wy = cr(ty);
    for (let i = 0; i <= n; i++) {
      const fx = i / n * nc, cx = Math.min(nc - 1, Math.floor(fx)), tx = fx - cx, wx = cr(tx);
      let lo = 0, la = 0;
      for (let b = 0; b < 4; b++) { let rlo = 0, rla = 0; const row = (cy + b) * S; for (let a = 0; a < 4; a++) { const k = (row + cx + a) * 2; rlo += wx[a] * coarse[k]; rla += wx[a] * coarse[k + 1]; } lo += wy[b] * rlo; la += wy[b] * rla; }
      const k = (j * (n + 1) + i) * 2; out[k] = lo; out[k + 1] = la;
    }
  }
  const t2 = performance.now();
  // Vergleich mit direkter Inverse an ALLEN Knoten
  let w = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const ll = truth(i / n, j / n); const k = (j * (n + 1) + i) * 2; w = Math.max(w, distKm(out[k], out[k + 1], ll[0], ll[1])); }
  // Float32-Boden zum Vergleich: Knoten selbst in Float32 gerundet
  let f32 = 0; for (let j = 0; j <= n; j += 7) for (let i = 0; i <= n; i += 7) { const ll = truth(i / n, j / n); f32 = Math.max(f32, distKm(Math.fround(ll[0]), Math.fround(ll[1]), ll[0], ll[1])); }
  return { grob: (t1 - t0).toFixed(1), fein: (t2 - t1).toFixed(1), maxMm: (w * 1e6).toFixed(3), f32mm: (f32 * 1e6).toFixed(0) };
}
for (const [name, truth, n] of [['DE1200', projLinear(DE1200_CORNERS, psFwd, psInv, true), 320], ['INCA', projLinear(AT_C, incaFwd, incaInv, false), 128], ['rzc', projLinear(CH_C, rzcFwd, rzcInv, false), 160]]) {
  for (const nc of [32, 64]) console.log(name, `nc=${nc} → n=${n}:`, JSON.stringify(refine(truth, nc, n)));
}
