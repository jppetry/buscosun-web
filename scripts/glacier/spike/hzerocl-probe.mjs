// GL-0 spike (plan §5.8): hzerocl + radiation from the NEW DWD scheme, checked against Jungfraujoch / Sonnblick / Zugspitze.
import { readFileSync } from 'node:fs';
import { newestRun, cellCoords, nearestCells, getField, net } from '../lib/dwdNew.mjs';
const OBS = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/obs/v1';
const J = async (p) => (await fetch(`${OBS}/${p}`)).json();
const model = process.argv[2] ?? 'icon-d2';
const t0 = Date.now();
const run = await newestRun(model, 'HZEROCL', model === 'icon-d2' ? 6 * 60 : 6 * 60);
console.log(model, 'newest run with step +6h:', new Date(run).toISOString(), 'probe ms', Date.now() - t0);
const t1 = Date.now();
const cells = await cellCoords(model, run);
console.log('cells', cells.n, 'in', Date.now() - t1, 'ms', 'lat range', Math.min(...cells.lat.slice(0, 5000)).toFixed(2), Math.max(...cells.lat.slice(0, 5000)).toFixed(2));
const cat = await J('stations.json'), latest = await J('latest.json');
const stations = cat.stations ?? cat;
const want = { Jungfraujoch: /jungfraujoch/i, Sonnblick: /sonnblick/i, Zugspitze: /zugspitze/i };
const pts = [];
for (const [k, rx] of Object.entries(want)) {
  const hit = Object.entries(stations).find(([id, s]) => rx.test(s.name ?? ''));
  if (hit) pts.push({ key: k, id: hit[0], ...hit[1] });
}
console.log('stations:', pts.map((p) => `${p.key}:${p.id}@${p.elev}m`).join(' '));
const idx = nearestCells(cells, pts);
const tNear = Date.now();
for (const h of [0, 1, 2, 3, 4, 5, 6]) {
  const tt = Date.now();
  const hz = await getField(model, 'HZEROCL', run, h * 60);
  const sw = await getField(model, 'ASWDIR_S', run, h * 60);
  const row = pts.map((p, i) => {
    const mod = hz.values[idx[i]];
    return `${p.key} hzerocl ${mod.toFixed(0)} m, dir ${sw?.values[idx[i]]?.toFixed(0) ?? '-'} W/m2`;
  });
  console.log(`+${h}h`, (Date.now() - tt) + ' ms', row.join(' | '));
}
const L = latest.v ? latest : { v: latest };
for (const p of pts) {
  const rec = (latest.stations ?? latest)[p.id] ?? null;
  console.log('obs', p.key, p.id, JSON.stringify(rec).slice(0, 220));
}
console.log('net', net.requests, 'req', (net.bytes / 1e6).toFixed(1), 'MB');
