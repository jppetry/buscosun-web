// Post-hoc out-of-sample look: the AT glaciers with an ELA in their mass-balance series (FoG/UIBK) for 2023-2025 — NOT among the 29 GLAMOS cases the pattern was seen on.
import { readFileSync, readdirSync } from 'node:fs';
import { buildSeasonRows } from 'file:///C:/dev/buscosun-web/.wt-gl/scripts/glacier/sat-scan.mjs';
import { glacierFlagsOfMask } from 'file:///C:/dev/buscosun-web/.wt-gl/src/glacier/glacierSatContract.ts';
const C = 'C:/dev/buscosun-glacier-cache';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const build = readdirSync(`${C}/build-test/v1/static`).sort().pop();
const cat = J(`${C}/build-test/v1/static/${build}/catalog.json`).glaciers;
const rep = J(`${C}/b1/out/report.json`);
const used = new Set(rep.b11.cases.map((c) => `${c.id}|${c.y}`));
const docs = [];
for (const y of readdirSync(`${C}/sat-out/obs`)) for (const t of readdirSync(`${C}/sat-out/obs/${y}`)) for (const f of readdirSync(`${C}/sat-out/obs/${y}/${t}`)) docs.push(J(`${C}/sat-out/obs/${y}/${t}/${f}`));
const rowsByYear = Object.fromEntries([...new Set(docs.map((d) => d.date.slice(0, 4)))].map((y) => [y, buildSeasonRows(docs.filter((d) => d.date.startsWith(y)))]));
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
const out = [];
for (const region of readdirSync(`${C}/build-test/v1/static/${build}/series`)) {
  const s = J(`${C}/build-test/v1/static/${build}/series/${region}`);
  for (const [id, list] of Object.entries(s.glaciers)) {
    const g = cat.find((x) => x.id === id);
    if (!g || g.klass !== 'A' || g.country === 'DE') continue;
    const mass = list.find((x) => x.kind === 'mass');
    for (const r of mass?.rows ?? []) {
      if (![2023, 2024, 2025].includes(r[0]) || r[4] == null) continue;
      if (used.has(`${id.replace(/^gl_/, '')}|${r[0]}`) || [...used].some((u) => u.split('|')[1] === String(r[0]) && id.endsWith(u.split('|')[0]))) continue;
      const rows = (rowsByYear[r[0]]?.get(id) ?? []).filter((x) => x[3] === 1 && x[4] != null && !glacierFlagsOfMask(x[8]).includes('neuschnee'));
      const w = rows.filter((x) => x[0] >= `${r[0]}-08-25` && x[0] <= `${r[0]}-10-10`);
      const m = rows.filter((x) => x[0] >= `${r[0]}-07-15` && x[0] <= `${r[0]}-10-10`);
      if (m.length < 2 || w.length < 2) continue;
      out.push({ id, year: r[0], ela: r[4], median: med(w.map((x) => x[4])), max: Math.max(...m.map((x) => x[4])), n: m.length, src: mass.source.slice(0, 20) });
    }
  }
}
for (const o of out) console.log(o.id.slice(3).padEnd(34), o.year, 'ELA', o.ela, 'Median', Math.round(o.median), 'Max', Math.round(o.max), o.src);
const st = (k) => { const d = out.map((o) => o[k] - o.ela); const a = d.map(Math.abs); return `n ${d.length} median|Δ| ${Math.round(med(a))} bias ${Math.round(d.reduce((x, y) => x + y, 0) / d.length)}`; };
console.log('Protokoll-Median:', st('median')); console.log('Maximum        :', st('max'));
