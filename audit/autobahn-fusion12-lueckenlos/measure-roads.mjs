// Read-only measurement: DLM250 motorway axes (all of DE) against the live corridor catalogue.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , repo, corrFile, cacheFile] = process.argv;
const { fetchMotorwayAxes, roadsOf } = await import(pathToFileURL(`${repo}/scripts/road/build-corridors.mjs`).href);
const axes = await fetchMotorwayAxes(cacheFile);
const km = (a, b) => {
  const kx = 111.2 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.2);
};
const lineKm = (l) => { let s = 0; for (let i = 1; i < l.length; i++) s += km(l[i - 1], l[i]); return s; };
const byRoad = new Map();
let total = 0;
for (const f of axes.features) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const len = lines.reduce((s, l) => s + lineKm(l), 0);
  total += len;
  for (const r of roadsOf(f)) byRoad.set(r, (byRoad.get(r) ?? 0) + len);
}
const corr = JSON.parse(readFileSync(corrFile, 'utf8')).corridors;
const cByRoad = new Map();
for (const c of corr) cByRoad.set(c.road, (cByRoad.get(c.road) ?? 0) + c.lengthKm);
const rows = [...byRoad].map(([r, k]) => ({ r, dlm: k, cor: cByRoad.get(r) ?? 0 })).sort((a, b) => (b.dlm - b.cor) - (a.dlm - a.cor));
const sumDlm = rows.reduce((s, x) => s + x.dlm, 0), sumCor = rows.reduce((s, x) => s + x.cor, 0);
console.log('features', axes.features.length, 'axis km (features)', total.toFixed(0), 'per-road km', sumDlm.toFixed(0), 'corridor km', sumCor.toFixed(0));
console.log('roads DLM250', byRoad.size, 'with corridor', rows.filter((x) => x.cor > 0).length, 'without', rows.filter((x) => x.cor === 0).length);
console.log('without corridor:', rows.filter((x) => x.cor === 0).sort((a, b) => b.dlm - a.dlm).map((x) => `${x.r}:${x.dlm.toFixed(0)}`).join(' '));
console.log('km on roads without corridor', rows.filter((x) => x.cor === 0).reduce((s, x) => s + x.dlm, 0).toFixed(0));
console.log('largest shortfall on roads WITH corridor:', rows.filter((x) => x.cor > 0).slice(0, 25).map((x) => `${x.r}:${(x.dlm - x.cor).toFixed(0)}`).join(' '));
console.log('shortfall km on roads with corridor (>0 only)', rows.filter((x) => x.cor > 0).reduce((s, x) => s + Math.max(0, x.dlm - x.cor), 0).toFixed(0));
