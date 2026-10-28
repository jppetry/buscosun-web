// Unabhängige Gegenprobe zur Zugrichtung der realen Serie: Schwerpunkt der nassen Maske je Analyse, Überlappung
// der nassen Masken bei Verschiebung 0 gegen die beste ganzzahlige Verschiebung, je Paar; dazu translationBetween.
import { readFileSync, readdirSync } from 'node:fs';
import { decodePng } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { translationBetween } from 'file:///C:/dev/buscosun-web/src/sources/radarNowcastExtrap.ts';
const root = process.argv[2];
const slots = readdirSync(root).filter((d) => /^\d{8}T\d{4}$/.test(d)).sort();
const frames = slots.map((s) => decodePng(readFileSync(`${root}/${s}/frame.png`)));
const w = frames[0].width, h = frames[0].height;
const cen = (p) => { let sx = 0, sy = 0, n = 0; for (let i = 0; i < p.length; i++) if (p[i]) { sx += i % w; sy += Math.floor(i / w); n++; } return [sx / n, sy / n, n]; };
const overlap = (a, b, dx, dy) => { let n = 0; for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++) for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x++) if (a[y * w + x] && b[(y + dy) * w + x + dx]) n++; return n; };
for (let i = 0; i < frames.length; i++) { const c = cen(frames[i].data); console.log(slots[i], 'centroid', c[0].toFixed(2), c[1].toFixed(2), 'wet', c[2]); }
for (let i = 0; i + 1 < frames.length; i++) {
  const a = frames[i].data, b = frames[i + 1].data;
  let best = { n: -1 }; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const n = overlap(a, b, dx, dy); if (n > best.n) best = { n, dx, dy }; }
  const t = translationBetween(a, b, w, h, 4);
  console.log(`${slots[i]} → ${slots[i + 1]}: overlap@0 ${overlap(a, b, 0, 0)} · best integer shift (${best.dx},${best.dy}) overlap ${best.n} · translationBetween u ${t?.u.toFixed(2)} v ${t?.v.toFixed(2)} score ${t?.score.toFixed(4)}`);
}
