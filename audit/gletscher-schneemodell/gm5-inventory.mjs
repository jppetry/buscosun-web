#!/usr/bin/env node
/**
 * GM-5 A1 — inventory of the Sentinel-2 season rows (counting only, nothing scored).
 * Reads (read-only): the GM-4 copy of the data repo (season/2023…2026), the static build 20261120-1 of the gs view (catalogue, hypsometry).
 * Writes: gm5-inventory.json next to this file.
 * Usage: node audit/gletscher-schneemodell/gm5-inventory.mjs
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = 'C:/dev/buscosun-glacier-cache/gm4/live';
const STATIC = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1/static/20261120-1';
const CODE_COMMIT = 'dc982141';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));

const cat = rd(join(STATIC, 'catalog.json')).glaciers;
const byId = new Map(cat.map((g) => [g.id, g]));
const klassOf = (g) => (g.country === 'DE' ? null : g.area.km2 >= 0.5 ? 'A' : g.area.km2 >= 0.1 ? 'B' : null);   // glacierClassOf thresholds, checked below against catalogue klass
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const doy = (d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${d.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000) + 1;

const seasons = {};   // year -> id -> rows
const files = [];
for (const y of readdirSync(join(LIVE, 'season'))) {
  for (const reg of readdirSync(join(LIVE, 'season', y))) {
    for (const f of readdirSync(join(LIVE, 'season', y, reg))) {
      const doc = rd(join(LIVE, 'season', y, reg, f));
      files.push({ year: +y, region: reg, stand: doc.stand, glaciers: Object.keys(doc.glaciers).length });
      for (const [id, rows] of Object.entries(doc.glaciers)) ((seasons[y] ??= {})[id] = rows);
    }
  }
}

// catalogue class check: catalogue klass vs. satellite class
const klassMismatch = cat.filter((g) => g.country !== 'DE' && ((g.klass === 'A') !== (klassOf(g) === 'A'))).length;

const perYear = {};
const glacierYears = [];
const allIds = new Set();
for (const [y, gl] of Object.entries(seasons)) {
  const acc = { glaciers: 0, byCountry: {}, byClass: {}, rows: 0, rowsWithSla: 0, states: { covered: 0, snowline: 0, free: 0 }, flags: { neuschnee: 0, schatten: 0, schutt: 0 }, rowsMay: 0, rowsJunSep: 0, rowsOctNov: 0 };
  for (const [id, rows] of Object.entries(gl)) {
    allIds.add(id);
    const g = byId.get(id);
    const k = g ? (g.klass === 'A' ? 'A' : g.klass === 'B' ? 'B' : g.klass) : 'missing';
    acc.glaciers++; acc.byCountry[g?.country ?? '?'] = (acc.byCountry[g?.country ?? '?'] ?? 0) + 1; acc.byClass[k] = (acc.byClass[k] ?? 0) + 1;
    const js = rows.filter((r) => r[0].slice(5, 7) >= '06' && r[0].slice(5, 7) <= '09');
    for (const r of rows) {
      acc.rows++; if (r[4] != null) acc.rowsWithSla++;
      acc.states[['covered', 'snowline', 'free'][r[3]]]++;
      if (r[8] & 1) acc.flags.neuschnee++; if (r[8] & 2) acc.flags.schatten++; if (r[8] & 4) acc.flags.schutt++;
      const m = r[0].slice(5, 7);
      if (m === '05') acc.rowsMay++; else if (m >= '06' && m <= '09') acc.rowsJunSep++; else if (m >= '10') acc.rowsOctNov++;
    }
    // gaps (cloud): largest interval between consecutive rows within 1 Jun – 30 Sep, and the number of rows there
    let maxGap = null;
    for (let i = 1; i < js.length; i++) { const d = doy(js[i][0]) - doy(js[i - 1][0]); if (maxGap == null || d > maxGap) maxGap = d; }
    glacierYears.push({ id, year: +y, country: g?.country ?? '?', klass: k, rows: rows.length, rowsJunSep: js.length, slaJunSep: js.filter((r) => r[4] != null).length, maxGapJunSep: maxGap, first: rows[0]?.[0] ?? null, last: rows.at(-1)?.[0] ?? null });
  }
  perYear[y] = acc;
}

const summarize = (sel) => {
  const g = glacierYears.filter(sel);
  return { glacierYears: g.length, rowsJunSep: { p10: pct(g.map((x) => x.rowsJunSep), 0.1), median: pct(g.map((x) => x.rowsJunSep), 0.5), p90: pct(g.map((x) => x.rowsJunSep), 0.9) },
    slaJunSep: { p10: pct(g.map((x) => x.slaJunSep), 0.1), median: pct(g.map((x) => x.slaJunSep), 0.5), p90: pct(g.map((x) => x.slaJunSep), 0.9) },
    maxGapJunSepDays: { p10: pct(g.filter((x) => x.maxGapJunSep != null).map((x) => x.maxGapJunSep), 0.1), median: pct(g.filter((x) => x.maxGapJunSep != null).map((x) => x.maxGapJunSep), 0.5), p90: pct(g.filter((x) => x.maxGapJunSep != null).map((x) => x.maxGapJunSep), 0.9) },
    withAtLeast6SlaJunSep: g.filter((x) => x.slaJunSep >= 6).length };
};
const cells = {};
for (const y of Object.keys(seasons)) for (const c of ['CH', 'AT']) for (const k of ['A', 'B']) { const s = summarize((x) => x.year === +y && x.country === c && x.klass === k); if (s.glacierYears) cells[`${y} ${c} ${k}`] = s; }

// how many catalogue glaciers have rows at all, per country and class; years per glacier
const yearsPer = new Map();
for (const x of glacierYears) yearsPer.set(x.id, (yearsPer.get(x.id) ?? 0) + 1);
const withRows = {};
for (const g of cat) { const n = yearsPer.get(g.id) ?? 0; const key = `${g.country} ${g.klass}`; withRows[key] ??= { catalogue: 0, withRows: 0, years: {} }; withRows[key].catalogue++; if (n) { withRows[key].withRows++; withRows[key].years[n] = (withRows[key].years[n] ?? 0) + 1; } }
// glaciers with a satellite class and at least one row in some year: per year with a class-A snow line
const classA4 = [...yearsPer.entries()].filter(([id]) => byId.get(id)?.klass === 'A');

const out = {
  kind: 'gm5/inventory', generated: new Date().toISOString(), codeCommit: CODE_COMMIT, dataRepoCommit: readFileSync(join(LIVE, 'COMMIT'), 'utf8').trim(), static: '20261120-1',
  rowColumns: ['date', 'clear', 'snow', 'state (0 covered, 1 snowline, 2 free)', 'sla|null', 'aar|null', 'albSnow|null', 'albIce|null', 'flags bitmask (1 neuschnee, 2 schatten, 4 schutt)'],
  perBandField: false,
  files, catalogue: cat.length, catalogueKlassMismatch: klassMismatch, glaciersWithRows: allIds.size,
  perYear, cells, withRows,
  classAGlaciersByYearsWithRows: classA4.reduce((m, [, n]) => ((m[n] = (m[n] ?? 0) + 1), m), {}),
};
writeFileSync(join(HERE, 'gm5-inventory.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ glaciersWithRows: out.glaciersWithRows, klassMismatch, perYear: Object.fromEntries(Object.entries(perYear).map(([y, a]) => [y, { glaciers: a.glaciers, byCountry: a.byCountry, byClass: a.byClass, rows: a.rows, sla: a.rowsWithSla, states: a.states, flags: a.flags }])), withRows, classA: out.classAGlaciersByYearsWithRows }, null, 1));
for (const [k, v] of Object.entries(cells)) console.log(k, JSON.stringify(v));
