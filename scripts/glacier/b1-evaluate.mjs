#!/usr/bin/env node
/**
 * GL-2 / Gate B1 — evaluation of the satellite line against the frozen criteria (audit/gletscher/claims-frozen.md B1-1 … B1-6 and
 * the evaluation protocol of audit/gletscher/sat-method-frozen.md; nothing here is tuned on the result).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/b1-evaluate.mjs \
 *        --obs=<sat-out dir> --truth=<truth.json from b1_truth.py> --data=<v1 dir> [--out=<report.json>]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeasonRows } from './sat-scan.mjs';
import { glacierSatClass, obsProblems, glacierFlagsOfMask } from '../../src/glacier/glacierSatContract.ts';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const obsDir = arg('obs'), truthPath = arg('truth'), dataDir = arg('data'), outPath = arg('out');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const index = J(join(dataDir, 'index.json'));
const cat = J(join(dataDir, 'static', index.static.build, 'catalog.json')).glaciers;
const byId = new Map(cat.map((g) => [g.id, g]));
const truth = J(truthPath);

// all obs docs
const docs = [];
for (const y of existsSync(join(obsDir, 'obs')) ? readdirSync(join(obsDir, 'obs')) : []) for (const t of readdirSync(join(obsDir, 'obs', y))) for (const f of readdirSync(join(obsDir, 'obs', y, t))) docs.push(J(join(obsDir, 'obs', y, t, f)));
const years = [...new Set(docs.map((d) => d.date.slice(0, 4)))].sort();
const rowsByYear = Object.fromEntries(years.map((y) => [y, buildSeasonRows(docs.filter((d) => d.date.startsWith(y)))]));

const median = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
const r0 = (x) => (x == null ? null : Math.round(x));

/** End-of-season snow line: median of the snowline-state rows in [from, to] without the derived new-snow flag; ≥ 2 rows. */
function eos(id, year, from = '08-25', to = '10-10', { withNewSnow = false } = {}) {
  const rows = rowsByYear[year]?.get(id) ?? [];
  const use = rows.filter((r) => r[0] >= `${year}-${from}` && r[0] <= `${year}-${to}` && r[3] === 1 && r[4] != null && (withNewSnow || !glacierFlagsOfMask(r[8]).includes('neuschnee')));
  return use.length >= 2 ? { sla: median(use.map((r) => r[4])), n: use.length } : { sla: null, n: use.length };
}

const report = { generated: new Date().toISOString(), docs: docs.length, years };

// B1-1 / B1-2
const pairs = [];
for (const [id, byYear] of Object.entries(truth.glamos)) {
  const g = byId.get(id);
  if (glacierSatClass(g) !== 'A') continue;
  for (const [year, v] of Object.entries(byYear)) {
    if (!v.counted) continue;
    const ours = eos(id, year);
    const ts = truth.tsla[id];
    const clim = ts ? Object.entries(ts.eos).filter(([y]) => Number(y) >= 2000 && Number(y) <= 2022).map(([, x]) => x) : [];
    pairs.push({ id, year: Number(year), ela: v.ela, aar: v.aar, ours: ours.sla, nScenes: ours.n, clim: clim.length >= 10 ? clim.reduce((s, x) => s + x, 0) / clim.length : null });
  }
}
const counted = pairs.filter((p) => p.ours != null);
const d = counted.map((p) => p.ours - p.ela);
report.b11 = {
  glacierYearsInTruth: pairs.length, counted: counted.length,
  medianAbs: r0(median(d.map(Math.abs))), p90Abs: r0(pct(d.map(Math.abs), 0.9)), bias: r0(median(d)), meanAbs: r0(d.reduce((s, x) => s + Math.abs(x), 0) / (d.length || 1)),
  cases: counted.map((p) => ({ id: p.id.replace('gl_ch_', ''), y: p.year, ela: p.ela, ours: r0(p.ours), d: r0(p.ours - p.ela), n: p.nScenes })).sort((a, b) => (a.id < b.id ? -1 : a.y - b.y)),
  notCounted: pairs.filter((p) => p.ours == null).map((p) => `${p.id.replace('gl_ch_', '')} ${p.year} (${p.nScenes} Szene${p.nScenes === 1 ? '' : 'n'})`),
};
report.b11.pass = report.b11.counted >= 12 && report.b11.medianAbs <= 150 && report.b11.p90Abs <= 400;
const both = counted.filter((p) => p.clim != null);
report.b12 = {
  nBoth: both.length, ours: r0(median(both.map((p) => Math.abs(p.ours - p.ela)))), baseline: r0(median(both.map((p) => Math.abs(p.clim - p.ela)))),
  baselineBias: r0(median(both.map((p) => p.clim - p.ela))),
};
report.b12.pass = report.b12.nBoth >= 5 && report.b12.ours < report.b12.baseline;

// B1-3 TSLA 2025
const t3 = [];
for (const [id, ts] of Object.entries(truth.tsla)) {
  const g = byId.get(id);
  if (!g || glacierSatClass(g) !== 'A' || ts.eos['2025'] == null) continue;
  const o = eos(id, '2025');
  if (o.sla != null) t3.push({ id, tsla: ts.eos['2025'], ours: o.sla, n: o.n });
}
const d3 = t3.map((x) => x.ours - x.tsla);
report.b13 = { n: t3.length, medianAbs: r0(median(d3.map(Math.abs))), p90Abs: r0(pct(d3.map(Math.abs), 0.9)), bias: r0(median(d3)), tslaGlaciersA2025: Object.entries(truth.tsla).filter(([id, ts]) => glacierSatClass(byId.get(id) ?? { country: 'DE', area: { km2: 0 } }) === 'A' && ts.eos['2025'] != null).length };
report.b13.pass = report.b13.n >= 10 && report.b13.medianAbs <= 150;

// B1-4 completeness (class A, 20.08.–10.10.)
const aIds = cat.filter((g) => glacierSatClass(g) === 'A').map((g) => g.id);
report.b14 = {};
for (const y of ['2025', '2026']) {
  const have = aIds.filter((id) => (rowsByYear[y]?.get(id) ?? []).some((r) => r[0] >= `${y}-08-20` && r[0] <= `${y}-10-10`));
  const missing = aIds.filter((id) => !have.includes(id));
  report.b14[y] = { classA: aIds.length, withScene: have.length, share: Math.round((100 * have.length) / aIds.length * 10) / 10, missing: missing.slice(0, 20) };
  // reasons for the glaciers without any valid scene
  const why = {};
  for (const id of missing) {
    const reasons = new Set();
    for (const doc of docs.filter((x) => x.date.startsWith(y) && x.date >= `${y}-08-20` && x.date <= `${y}-10-10`)) for (const s of doc.skipped) if (s.id === id) reasons.add(s.reason.replace(/\d+/g, 'N'));
    const key = [...reasons].sort().join(' | ') || 'keine Szene gelesen';
    why[key] = (why[key] ?? 0) + 1;
  }
  report.b14[y].why = why;
}
report.b14.pass = ['2025', '2026'].every((y) => report.b14[y].share >= 90);

// B1-5 impossibles / quarantine
const catMap = new Map(cat.map((g) => [g.id, g]));
const problems = docs.flatMap((dd) => obsProblems(dd, catMap));
const quarantine = {};
for (const dd of docs) for (const s of dd.skipped) if (/Quarantäne/.test(s.reason)) quarantine[s.reason.replace(/\d+/g, 'N')] = (quarantine[s.reason.replace(/\d+/g, 'N')] ?? 0) + 1;
const skipTotals = {};
for (const dd of docs) for (const s of dd.skipped) { const k = s.reason.replace(/\d+/g, 'N').replace(/\[.*\]/, ''); skipTotals[k] = (skipTotals[k] ?? 0) + 1; }
report.b15 = { values: docs.reduce((s, x) => s + Object.keys(x.items).length, 0), rulesViolated: problems.length, sample: problems.slice(0, 5), quarantine, skipTotals, pass: problems.length === 0 };

// info: seasonal behaviour of the lead glaciers (sanity)
report.info = {
  aarOutOfRange: docs.reduce((s, x) => s + Object.values(x.items).filter((v) => v.aar != null && (v.aar < 0 || v.aar > 1)).length, 0),
  states: docs.reduce((a, x) => { for (const v of Object.values(x.items)) a[v.state] = (a[v.state] ?? 0) + 1; return a; }, {}),
};
console.log(JSON.stringify(report, null, 1));
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 1));
