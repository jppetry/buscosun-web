#!/usr/bin/env node
/**
 * Phase GM, GM-3, part C — the bridge: precipitation of buscosun Fusion at the glaciers against the precipitation analyses the calibration is built on.
 * A MEASUREMENT only (method §C): no value of it goes into the tables.
 *
 *   node scripts/glacier/snowcal-bridge.mjs --catalog=<catalog.json> --cache=<dir> --out=<report.json> [--from=2026-11-16 --to=2026-11-21] [--step=fetch|score]
 *
 * buscosun Fusion: the hourly chunks of the weather runs kept in the data repo (`glacier/v1/melt/wx/<run>/<region>.json`, `p` in mm/h from the run hour), read
 * only; of every run the hours up to the next run. Analyses: INCA hourly (Austria, `inca-v2-1h-1km` `tp` — the dataset of the current weeks), RprelimD /
 * RhiresD daily (Switzerland; the grid is read by `py/snowcal_grid.py` between the two steps). Days are 06 UTC … 06 UTC, the day of the Swiss grid.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GEOSPHERE } from './snowcal-forcing.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/glacier/v1/melt/wx';
const API = 'https://api.github.com/repos/jppetry/buscosun-data/contents/glacier/v1/melt/wx?ref=main';
const H = 3_600_000;
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
async function getJson(url, file) {
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let k = 0; ; k++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'node' } }); if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`); const t = await r.text(); if (file) writeFileSync(file, t); return JSON.parse(t); }
    catch (e) { if (k >= 3) throw e; await new Promise((res) => setTimeout(res, 2000 * (k + 1))); }
  }
}

async function main() {
  const cache = join(arg('cache'), 'bridge'), step = arg('step', 'fetch');
  mkdirSync(cache, { recursive: true });
  const fromMs = Date.parse(arg('from', '2026-11-16') + 'T06:00:00Z'), toMs = Date.parse(arg('to', '2026-11-21') + 'T06:00:00Z') + 24 * H;
  const cat = new Map(JSON.parse(readFileSync(arg('catalog'), 'utf8')).glaciers.map((g) => [g.id, g]));
  const nH = Math.round((toMs - fromMs) / H);

  // --- buscosun Fusion: hours of each run up to the next run ---------------------------------------------------------------------
  const listing = await getJson(API, join(cache, 'runs.json'));
  const runs = listing.map((e) => e.name).filter((n) => /^\d{10}$/.test(n)).sort();
  const fusion = new Map();      // id → Float64Array(nH) with NaN
  const used = [];
  for (let i = 0; i < runs.length; i++) {
    const r0 = runMs(runs[i]), r1 = i + 1 < runs.length ? runMs(runs[i + 1]) : r0 + 6 * H;
    if (r1 <= fromMs || r0 >= toMs) continue;
    const daily = await getJson(`${RAW}/${runs[i]}.json`, join(cache, `daily-${runs[i]}.json`));
    if (!daily) continue;
    used.push({ run: runs[i], engine: daily.engine?.name, hours: Math.round((r1 - r0) / H) });
    for (const region of daily.regions) {
      const c = await getJson(`${RAW}/${runs[i]}/${region}.json`, join(cache, `h-${runs[i]}-${region}.json`));
      if (!c) continue;
      for (const [id, row] of Object.entries(c.glaciers)) {
        if (!row.p) continue;
        if (!fusion.has(id)) fusion.set(id, new Float64Array(nH).fill(NaN));
        const a = fusion.get(id);
        for (let k = 0; k < Math.min(row.p.length, Math.round((r1 - r0) / H)); k++) { const j = Math.round((r0 + k * H - fromMs) / H); if (j >= 0 && j < nH) a[j] = row.p[k]; }
      }
    }
    console.log('run', runs[i], 'glaciers so far', fusion.size);
  }
  const ids = [...fusion.keys()].filter((id) => cat.has(id) && !fusion.get(id).some(Number.isNaN));
  console.log(`buscosun Fusion: ${fusion.size} glaciers with own forcing, ${ids.length} with every hour of the window, ${used.length} runs`);
  const points = ids.map((id) => ({ key: id, lat: cat.get(id).lat, lon: cat.get(id).lon }));
  writeFileSync(join(cache, 'points-ch.json'), JSON.stringify(points.filter((p) => cat.get(p.key).country === 'CH')));

  // --- Austria: INCA hourly at the nearest cell ----------------------------------------------------------------------------------------
  const at = points.filter((p) => cat.get(p.key).country === 'AT');
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16);
  const inca = new Map();
  for (let i = 0; i < at.length; i += 20) {
    const part = at.slice(i, i + 20), file = join(cache, `inca-${i}.json`);
    const j = await getJson(`${GEOSPHERE}/timeseries/historical/inca-v2-1h-1km?parameters=tp&start=${iso(fromMs + H)}&end=${iso(toMs)}&${part.map((p) => `lat_lon=${p.lat},${p.lon}`).join('&')}&output_format=geojson`, file);
    if (!j?.features) continue;
    j.features.forEach((f, k) => { const d = f.properties.parameters.tp.data; const perDay = []; for (let x = 0; x < d.length; x += 24) { const part24 = d.slice(x, x + 24); perDay.push(part24.length === 24 && part24.every((v) => v != null) ? part24.reduce((s, v) => s + v, 0) : null); } inca.set(part[k].key, perDay); });
    await new Promise((res) => setTimeout(res, 300));
  }
  console.log(`INCA: ${inca.size} of ${at.length} Austrian glaciers`);
  if (step === 'fetch') {  console.log('next: py/snowcal_grid.py --points points-ch.json --files <RprelimD/RhiresD of the days> --out grid-ch.json, then --step=score'); if (!existsSync(join(cache, 'grid-ch.json'))) return; }

  // --- Switzerland: daily grid read by the Python step -------------------------------------------------------------------------------
  const grid = JSON.parse(readFileSync(join(cache, 'grid-ch.json'), 'utf8'));
  const days = []; for (let ms = fromMs; ms < toMs; ms += 24 * H) days.push(new Date(ms).toISOString().slice(0, 10));
  const dayIdx = days.map((d) => grid.dates.indexOf(d));
  const fusionDay = (id, k) => { let s = 0; const a = fusion.get(id); for (let h = k * 24; h < (k + 1) * 24; h++) s += a[h]; return s; };
  const rows = [], daysUsed = { CH: days.filter((d, k) => dayIdx[k] >= 0), AT: null };
  for (const id of ids) {
    const g = cat.get(id);
    let f = 0, a = 0, n = 0;
    if (g.country === 'CH') { const p = grid.points[id]?.p; if (!p) continue; days.forEach((d, k) => { const i = dayIdx[k]; if (i >= 0 && p[i] != null) { f += fusionDay(id, k); a += p[i]; n++; } }); if (n !== daysUsed.CH.length) continue; }
    else if (g.country === 'AT') { const x = inca.get(id); if (!x) continue; days.forEach((d, k) => { if (x[k] != null) { f += fusionDay(id, k); a += x[k]; n++; } }); if (n < days.length) continue; daysUsed.AT = days; }
    else continue;
    rows.push({ id, country: g.country, region: g.region, days: n, fusion: Math.round(f * 10) / 10, analysis: Math.round(a * 10) / 10 });
  }
  const st = (r) => { const wet = r.filter((x) => Math.max(x.fusion, x.analysis) >= 5), q = wet.map((x) => (x.fusion + 0.5) / (x.analysis + 0.5)); return { glaciers: r.length, fusionSum: r.reduce((s, x) => s + x.fusion, 0), analysisSum: r.reduce((s, x) => s + x.analysis, 0), ratioOfSums: r.reduce((s, x) => s + x.fusion, 0) / r.reduce((s, x) => s + x.analysis, 0), wetGlaciers: wet.length, ratioMedian: quant(q, 0.5), ratioP10: quant(q, 0.1), ratioP90: quant(q, 0.9) }; };
  const report = { kind: 'glacier/snowcal-report-C', generated: new Date().toISOString(), window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), days, daysUsed, dayMeaning: '06 UTC … 06 UTC' }, runs: used, applied: false, note: 'Messung, kein Wert geht in die Tabelle (Methode §C); Verhältnis je Gletscher mit +0,5 mm auf beiden Seiten', AT: st(rows.filter((r) => r.country === 'AT')), CH: st(rows.filter((r) => r.country === 'CH')), byRegion: Object.fromEntries([...new Set(rows.map((r) => r.region))].sort().map((k) => [k, st(rows.filter((r) => r.region === k))])), rows };
  writeFileSync(arg('out'), JSON.stringify(report, null, 1));
  for (const c of ['AT', 'CH']) console.log(c, JSON.stringify(report[c]));
}
await main();
