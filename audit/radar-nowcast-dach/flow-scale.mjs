// Messung: wie viel der wahren Verschiebung findet der Horn–Schunck-Fluss (Faktor 4, α 0,5, 100 Iterationen) wieder?
// Gauß-Blobs verschiedener Größe, wahre Verschiebung 1 … 8 px/Schritt, Serie aus 4 Bildern; Maß = Geschwindigkeit aus
// motionStats (über nasse Grobzellen) gegen die wahre; dazu die Schwerpunktverschiebung nach 24 Advektionsschritten.
import { flowFromSeries, motionStats, advectPlane } from 'file:///C:/dev/buscosun-web/src/sources/radarNowcastExtrap.ts';
const W = 256, H = 192, F = 4;
const blob = (cx, cy, s) => { const p = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s)); if (v > 0.1) p[y * W + x] = Math.round(20 + 200 * v); } return p; };
const centroid = (p) => { let sx = 0, sy = 0, n = 0; for (let i = 0; i < p.length; i++) if (p[i]) { sx += i % W; sy += Math.floor(i / W); n++; } return [sx / n, sy / n]; };
for (const sigma of [4, 8, 16]) for (const dx of [1, 2, 4, 8]) {
  const frames = [0, 1, 2, 3].map((k) => blob(60 + k * dx, 96, sigma));
  const { flow, pairs } = flowFromSeries(frames, W, H, F);
  const m = motionStats(flow, frames[3], W, H, 5, pairs);
  const out = new Uint8Array(W * H); advectPlane(frames[3], W, H, flow, 24, out);
  const c0 = centroid(frames[3]), c1 = centroid(out);
  const trueKmh = dx * 12;
  console.log(`σ ${String(sigma).padStart(2)} px · wahr ${String(dx).padStart(2)} px/Schritt = ${String(trueKmh).padStart(3)} km/h → gemessen ${m.speedKmh.toFixed(1).padStart(5)} km/h aus ${m.fromDeg}° (Anteil ${(m.speedKmh / trueKmh).toFixed(2)}) · Schwerpunkt nach 24 Schritten +${(c1[0] - c0[0]).toFixed(1)} px statt +${24 * dx}`);
}
