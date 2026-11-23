#!/usr/bin/env node
/**
 * Phase GM, GM-3c — measurement M-5 (audit §3f.5): the spin-up path of Switzerland (MeteoSwiss DAILY grids through `hourlyFromDaily` and `seedOfForcing` of
 * `snowpack-seed.mjs`) against measured snow depth at stations, west and east of 8.15° E, and the two analyses against each other where both exist.
 * A PROBE: reads the caches of the seed run and of the probe M-4, writes gm3c-swiss-probe.json. Factor 1 (a station field is no glacier).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm3c-swiss-probe.mjs \
 *        --cache=C:/dev/buscosun-glacier-cache/gm3c-snowpack --python=<python with h5py> [--end=2026-11-22T06:00]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SNOW, SNOW_ORIGIN } from '../../scripts/glacier/lib/snowcore.mjs';
import { snowCoreSetup } from '../../scripts/glacier/lib/snowcal.mjs';
import { hourlyFromDaily, seedOfForcing, shiftOf } from '../../scripts/glacier/snowpack-seed.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CACHE = arg('cache'), PY = arg('python', 'python'), H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FROM = Date.parse('2026-10-01T00:00Z'), END = Date.parse(arg('end', '2026-11-22T06:00') + 'Z'), HOURS = Math.round((END - FROM) / H);
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 10);
const r1 = (x) => Math.round(x * 10) / 10;
const cal = J('scripts/glacier/melt-calibration.json').fit, table = J('scripts/glacier/snow-calibration.json');
const c = snowCoreSetup({ density: 'board', base: SNOW, baseOrigin: SNOW_ORIGIN, table }).c;

// stations of Switzerland with a snow depth at END and a temperature in the hours before
const cat = J(join(CACHE, 'live', 'stn', 'stations.json'));
const meta = [...Object.values(cat.stations), ...Object.values(cat.ext?.stations ?? {})].filter((s) => s.country === 'CH');
const hours = readdirSync(join(CACHE, 'live', 'stn', 'h')).filter((f) => /^\d{10}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((s) => s <= stamp(END)).sort().map((s) => { const t = readFileSync(join(CACHE, 'live', 'stn', 'h', `${s}.json`), 'utf8'); if (!t) return null; const d = JSON.parse(t); return { ms: Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10)), e: { ...d.stations, ...(d.ext?.stations ?? {}) } }; }).filter(Boolean);
const last = hours.find((h) => h.ms === END)?.e;
if (!last) throw new Error(`Stundendatei ${stamp(END)} fehlt im Zwischenspeicher`);
const stations = meta.filter((s) => Number.isFinite(last[s.id]?.v?.snow)).map((s) => ({ key: s.id, lat: s.lat, lon: s.lon, elev: s.elev, net: s.networks[0], hs: last[s.id].v.snow }));
const dir = join(CACHE, 'swiss-probe'); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'points.json'), JSON.stringify(stations));
const grid = join(CACHE, 'seed', 'chgrid'), files = readdirSync(grid).filter((f) => f.endsWith('.nc'));
const VARS = { p: /\.(rhiresd|rprelimd)_/, t: /\.tabsd_/, tn: /\.tmind_/, tx: /\.tmaxd_/, sun: /\.sreld_/ };
const days = []; for (let ms = FROM - 24 * H; ms < END; ms += 24 * H) days.push(new Date(ms).toISOString().slice(0, 10));
const daily = {};
for (const [v, re] of Object.entries(VARS)) {
  const out = join(dir, `grid-${v}.json`);
  execFileSync(PY, ['scripts/glacier/py/snowcal_grid.py', '--points', join(dir, 'points.json'), '--files', files.filter((f) => re.test(f)).sort((a, b) => (/(\d{14})_\d{14}\.nc$/.exec(a)[1] < /(\d{14})_\d{14}\.nc$/.exec(b)[1] ? -1 : 1)).map((f) => join(grid, f)).join(','), '--out', out], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
  const g = J(out), at = new Map(g.dates.map((d, i) => [d, i]));
  daily[v] = Object.fromEntries(stations.map((s) => [s.key, days.map((d) => { const i = at.get(d); const x = i == null ? null : g.points[s.key]?.p[i]; return x == null ? null : x; })]));
}
const rows = [];
for (const s of stations) {
  const series = hourlyFromDaily({ day0: days[0], p: daily.p[s.key], t: daily.t[s.key], tn: daily.tn[s.key], tx: daily.tx[s.key], sun: daily.sun[s.key], lat: s.lat, lon: s.lon, z: s.elev, fromMs: FROM, hours: HOURS });
  const known = new Array(HOURS).fill(null); for (const h of hours) { const i = Math.round((h.ms - FROM) / H), v = h.e[s.key]?.v?.t; if (i >= 0 && i < HOURS && Number.isFinite(v)) known[i] = v; }
  const dT = shiftOf(known, series.t);
  if (dT == null) continue;
  const st = seedOfForcing({ glaciers: [{ id: s.key, z: [s.elev, s.elev, s.elev], ela: s.elev, F: 1, series, dT }], fromMs: FROM, hours: HOURS, cal, c, rules: { precip: 'country', density: 'board' } });
  const row = st.g[s.key][2][1], hs = (row[1] + row.slice(2).reduce((a, v, i) => a + (i % 3 === 1 ? v : 0), 0)) / 10;
  rows.push({ id: s.key, net: s.net, lon: s.lon, elev: s.elev, hs: s.hs, model: hs, dT: r1(dT), holes: st.g[s.key][1], psum: r1(daily.p[s.key].reduce((a, v) => a + (v ?? 0), 0)) });
}
const stat = (x) => { if (!x.length) return null; const d = x.map((r) => r.model - r.hs), me = x.reduce((s, r) => s + r.hs, 0) / x.length, mo = x.reduce((s, r) => s + r.model, 0) / x.length; const cov = x.reduce((s, r) => s + (r.model - mo) * (r.hs - me), 0), va = x.reduce((s, r) => s + (r.model - mo) ** 2, 0), vb = x.reduce((s, r) => s + (r.hs - me) ** 2, 0); return { n: x.length, measured: r1(me), model: r1(mo), bias: r1(d.reduce((s, v) => s + v, 0) / d.length), mae: r1(d.reduce((s, v) => s + Math.abs(v), 0) / d.length), r: va > 0 && vb > 0 ? Math.round((cov / Math.sqrt(va * vb)) * 100) / 100 : null }; };
const cls = [['< 1 500 m', 0, 1500], ['1 500–2 000 m', 1500, 2000], ['2 000–2 500 m', 2000, 2500], ['≥ 2 500 m', 2500, 9999]];
const report = {
  kind: 'glacier/gm3c-swiss-probe', generated: new Date().toISOString(), window: { from: new Date(FROM).toISOString(), to: new Date(END).toISOString() }, forcing: 'MeteoSchweiz Tagesgitter (RhiresD/RprelimD, TabsD, TminD, TmaxD, SrelD), CC BY 4.0', factor: 1, density: 'board',
  stations: stations.length, used: rows.length, holesH: [...new Set(rows.map((r) => r.holes))], all: stat(rows), west: stat(rows.filter((r) => r.lon < 8.15)), east: stat(rows.filter((r) => r.lon >= 8.15)),
  byElevation: Object.fromEntries(cls.map(([n, lo, hi]) => [n, stat(rows.filter((r) => r.elev >= lo && r.elev < hi))])), byNet: Object.fromEntries([...new Set(rows.map((r) => r.net))].sort().map((k) => [k, stat(rows.filter((r) => r.net === k))])),
};
// the two analyses against each other at the Swiss glaciers the probe M-4 ran INCA for (east of 8.15° E): precipitation 1.10. 06 UTC … END, the missing Swiss days left out of both
try {
  const own = [], view = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1', build = J(join(view, 'index.json')).static.build, glaciers = J(join(view, 'static', build, 'catalog.json')).glaciers;
  const hyp = new Map(), hypOf = (region) => { if (!hyp.has(region)) hyp.set(region, J(join(view, 'static', build, 'hypso', `${region}.json`)).glaciers ?? {}); return hyp.get(region); };
  for (const g of glaciers) { if (g.klass === 'C' || !(g.lon >= 8.15 && g.lon <= 17.6 && g.lat >= 45.6 && g.lat <= 49.4)) continue; if (!hypOf(g.region)[g.id]?.a?.some((v) => v > 0)) continue; own.push(g); }   // the list and the order of the probe M-4
  const gp = J(join(grid, 'grid-p.json')), at = new Map(gp.dates.map((d, i) => [d, i])), START4 = Date.parse('2026-10-01T00:00Z'), ratios = []; let si = 0, ss = 0;
  for (let i = 0; i < own.length; i += 20) {
    const j = J(join(CACHE, 'inca', `gl-${i}.json`));
    j.features.forEach((f, k) => {
      const g = own[i + k]; if (g.country !== 'CH' || !gp.points[g.id]) return;
      let a = 0, b = 0;
      for (const d of days.slice(1)) { const x = at.has(d) ? gp.points[g.id].p[at.get(d)] : null; if (x == null) continue; const h0 = Math.round((Date.parse(`${d}T06:00:00Z`) - START4) / H); let s = 0, ok = true; for (let h = h0 + 1; h <= h0 + 24; h++) { const v = f.properties.parameters.tp.data[h]; if (v == null) ok = false; else s += v; } if (!ok) continue; a += s; b += x; }
      if (b > 20) { ratios.push(a / b); si += a; ss += b; }
    });
  }
  ratios.sort((x, y) => x - y);
  report.incaAgainstSwissGrid = { glaciers: ratios.length, ratioOfSums: Math.round((si / ss) * 100) / 100, median: Math.round(ratios[ratios.length >> 1] * 100) / 100, p10: Math.round(ratios[Math.floor(ratios.length * 0.1)] * 100) / 100, p90: Math.round(ratios[Math.floor(ratios.length * 0.9)] * 100) / 100, meanInca: r1(si / ratios.length), meanSwiss: r1(ss / ratios.length) };
} catch (e) { report.incaAgainstSwissGrid = { error: String(e?.message ?? e) }; }
writeFileSync('audit/gletscher-schneemodell/gm3c-swiss-probe.json', JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
