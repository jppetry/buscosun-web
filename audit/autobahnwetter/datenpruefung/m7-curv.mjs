// M7 (D-8): curvature of the air temperature per step in a road/fc run — where do the dips cluster?
// node audit/autobahnwetter/datenpruefung/m7-curv.mjs [run] [outDir]   (run default: newest in index.json)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/road/fc/v1';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
const get = async (p) => {
  const f = `${out}/${p.replace(/\//g, '_')}`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const r = await fetch(`${RAW}/${p}`);
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  const t = await r.text();
  writeFileSync(f, t);
  return JSON.parse(t);
};
const idx = await (await fetch(`${RAW}/index.json`)).json();
console.log('runs', idx.runs.map((r) => r.run).join(' '));
const run = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : idx.runs.map((r) => r.run).sort().at(-1);
const where = await get(`${run}/where.json`);
const files = [...new Set(Object.values(where.stations ?? where.map ?? where))].filter((k) => typeof k === 'string');
const pts = [];
let file0;
for (const k of files) {
  const p = k.startsWith('c/') ? `${run}/c/${k.slice(2)}.json` : `${run}/s/${k.slice(2)}.json`;
  let j;
  try { j = await get(p); } catch (e) { console.log('skip', p, e.message); continue; }
  file0 ??= j;
  for (const q of j.points) pts.push({ ...q, file: k, t0Ms: j.t0Ms });
}
// axis points live only in corridor files; where.json lists stations — add every corridor file named there
console.log('run', run, 't0', new Date(file0.t0Ms).toISOString(), 'engine', JSON.stringify(file0.engine).slice(0, 300));
console.log('points', pts.length);
const byHour = new Map(), q0 = new Map();
const worst = [];
for (const p of pts) {
  const t = p.v.t.map((x) => (x == null ? null : x / 10));
  for (let i = 1; i < t.length - 1; i++) {
    if (t[i - 1] == null || t[i] == null || t[i + 1] == null) continue;
    const c = t[i] - (t[i - 1] + t[i + 1]) / 2;
    const h = new Date(p.t0Ms + i * 3_600_000).getUTCHours();
    const day = new Date(p.t0Ms + i * 3_600_000).toISOString().slice(5, 13);
    if (c < -2) {
      byHour.set(day, (byHour.get(day) ?? 0) + 1);
      const k = `${day} q${p.v.q[i - 1]}/${p.v.q[i]}/${p.v.q[i + 1]}`;
      q0.set(k, (q0.get(k) ?? 0) + 1);
    }
    worst.push({ id: p.id, kind: p.kind, i, h, day, c, s: [t[i - 1], t[i], t[i + 1]], q: [p.v.q[i - 1], p.v.q[i], p.v.q[i + 1]], lat: p.lat, lon: p.lon, h_m: p.h, anc: p.anc, mos: p.mos });
  }
}
console.log('dips < -2 K by valid UTC day-hour:', JSON.stringify([...byHour].sort()));
console.log('by origin codes:', JSON.stringify([...q0].sort((a, b) => b[1] - a[1]).slice(0, 20)));
worst.sort((a, b) => a.c - b.c);
for (const w of worst.slice(0, 25)) console.log(w.id, w.kind, w.day, 'i', w.i, 'c', w.c.toFixed(1), w.s.join(' · '), 'q', w.q.join('/'), w.lat, w.lon, w.h_m, 'anc', JSON.stringify(w.anc), 'mos', JSON.stringify(w.mos));
writeFileSync(`${out}/worst-${run}.json`, JSON.stringify(worst.slice(0, 400)));
