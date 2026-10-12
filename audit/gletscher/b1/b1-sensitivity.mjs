// Post-hoc, INFORMATION ONLY (Gate B1 is judged by the frozen protocol): how the 29 glacier-years of the GLAMOS comparison behave under other end-of-season statistics.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeasonRows } from 'file:///C:/dev/buscosun-web/.wt-gl/scripts/glacier/sat-scan.mjs';
import { glacierFlagsOfMask } from 'file:///C:/dev/buscosun-web/.wt-gl/src/glacier/glacierSatContract.ts';
const C = 'C:/dev/buscosun-glacier-cache';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rep = J(`${C}/b1/out/report.json`);
const docs = [];
for (const y of readdirSync(`${C}/sat-out/obs`)) for (const t of readdirSync(`${C}/sat-out/obs/${y}`)) for (const f of readdirSync(`${C}/sat-out/obs/${y}/${t}`)) docs.push(J(`${C}/sat-out/obs/${y}/${t}/${f}`));
const years = [...new Set(docs.map((d) => d.date.slice(0, 4)))];
const rowsByYear = Object.fromEntries(years.map((y) => [y, buildSeasonRows(docs.filter((d) => d.date.startsWith(y)))]));
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
const q = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(p * v.length))]; };
const stats = {
  'Protokoll: Median 25.08.–10.10. ohne Neuschnee': (rows, y) => { const r = rows.filter((x) => x[0] >= `${y}-08-25` && x[0] <= `${y}-10-10`); return r.length >= 2 ? med(r.map((x) => x[4])) : null; },
  'Maximum 15.07.–10.10. ohne Neuschnee': (rows, y) => { const r = rows.filter((x) => x[0] >= `${y}-07-15` && x[0] <= `${y}-10-10`); return r.length >= 2 ? Math.max(...r.map((x) => x[4])) : null; },
  '75. Perzentil 15.07.–10.10.': (rows, y) => { const r = rows.filter((x) => x[0] >= `${y}-07-15` && x[0] <= `${y}-10-10`); return r.length >= 2 ? q(r.map((x) => x[4]), 0.75) : null; },
  'Median 10.08.–10.09.': (rows, y) => { const r = rows.filter((x) => x[0] >= `${y}-08-10` && x[0] <= `${y}-09-10`); return r.length >= 2 ? med(r.map((x) => x[4])) : null; },
};
for (const [name, f] of Object.entries(stats)) {
  const d = [];
  for (const c of rep.b11.cases) {
    const id = `gl_${c.id.includes('_') ? c.id : c.id}`;
    const gid = Object.keys(Object.fromEntries([...(rowsByYear[c.y]?.keys() ?? [])].map((k) => [k, 1]))).find((k) => k.endsWith(c.id));
    const rows = (rowsByYear[c.y]?.get(gid) ?? []).filter((r) => r[3] === 1 && r[4] != null && !glacierFlagsOfMask(r[8]).includes('neuschnee'));
    const v = f(rows, c.y);
    if (v != null) d.push(v - c.ela);
  }
  const a = d.map(Math.abs);
  console.log(name.padEnd(48), 'n', d.length, 'median|Δ|', Math.round(med(a)), 'p90', Math.round(q(a, 0.9)), 'bias', Math.round(d.reduce((s, x) => s + x, 0) / d.length));
}
