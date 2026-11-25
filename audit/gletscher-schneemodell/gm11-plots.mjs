#!/usr/bin/env node
/**
 * GM-11 step 1.2b — the SLF observer plots (Q6) as the truth for new snow, against the precipitation of buscosun Fusion WITHOUT the factor.
 * Read only (the plot values come from the public SLF API, the forcing from the local cache of gm11-save-runs.mjs).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-plots.mjs \
 *     [--cache=C:\dev\buscosun-glacier-cache\gm11] [--static=C:\dev\buscosun-glacier-cache\sgi2023\pkg\static\20261120-1] [--out=<json>] [--fetch]
 *
 * 1. Which plots lie inside the station window of a glacier — the rule of the station mapping (`buildStnMapDoc`): distance to the L1 outline
 *    ≤ STN_MAP_KM (5 km, 0 on the ice) and plot elevation inside [lowest − STN_MAP_DZ, highest + STN_MAP_DZ] of the glacier (±300 m).
 * 2. Per plot and day (24 h ending 06 UTC): measured `HN_1D` (cm) and `HNW_1D` (mm, water of the new snow on the board) against the summed
 *    precipitation `p` of buscosun Fusion of the glacier the plot belongs to (the nearest glacier of the window with its OWN forcing; the Fusion
 *    answer is at the glacier point with flat terrain at its median elevation — not at the plot itself), each hour taken from the latest run at
 *    or before it (the hours the snowpack would replay). A day counts only when every hour is covered by a cached run.
 * `--fetch` reads the last seven days of each plot in the window from measurement-api.slf.ch (period_in_days=7) into `<cache>/slf/`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stnOutlineKm, STN_MAP_KM, STN_MAP_DZ, STN_OUTLINE_LEVEL } from '../../src/glacier/glacierStationContract.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const cache = args.cache ?? 'C:\\dev\\buscosun-glacier-cache\\gm11';
const stat = args.static ?? 'C:\\dev\\buscosun-glacier-cache\\sgi2023\\pkg\\static\\20261120-1';
const H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const runMs = (r) => Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10));
const slfDir = join(cache, 'slf'); mkdirSync(slfDir, { recursive: true });
if (args.fetch || !existsSync(join(slfDir, 'stations.json'))) writeFileSync(join(slfDir, 'stations.json'), await (await fetch('https://measurement-api.slf.ch/public/api/study-plot/stations')).text());
const plots = J(join(slfDir, 'stations.json'));
const cat = J(join(stat, 'catalog.json')).glaciers;
const outlines = new Map();
for (const f of readdirSync(join(stat, 'outline')).filter((x) => x.endsWith(`-L${STN_OUTLINE_LEVEL}.json`))) for (const ft of J(join(stat, 'outline', f)).features ?? []) { const c = ft.geometry?.coordinates; if (ft.properties?.id && c) outlines.set(ft.properties.id, ft.geometry.type === 'Polygon' ? [c] : c); }
// 1. window
const inWin = [];
for (const pl of plots) {
  const hits = [];
  for (const g of cat) {
    if (Math.abs(g.lat - pl.lat) > 0.1 || Math.abs(g.lon - pl.lon) > 0.15) continue;
    const ol = outlines.get(g.id); if (!ol) continue;
    const km = stnOutlineKm(ol, pl.lat, pl.lon);
    if (km <= STN_MAP_KM && pl.elevation >= g.z[0] - STN_MAP_DZ && pl.elevation <= g.z[2] + STN_MAP_DZ) hits.push({ id: g.id, km: Math.round(km * 10) / 10, z: g.z, klass: g.klass });
  }
  if (hits.length) inWin.push({ code: pl.code, label: pl.label, elev: pl.elevation, lat: pl.lat, lon: pl.lon, glaciers: hits.sort((a, b) => a.km - b.km) });
}
const nearKm = plots.map((pl) => ({ code: pl.code, elev: pl.elevation, km: Math.min(...cat.filter((g) => Math.abs(g.lat - pl.lat) < 0.3 && Math.abs(g.lon - pl.lon) < 0.4 && outlines.get(g.id)).map((g) => stnOutlineKm(outlines.get(g.id), pl.lat, pl.lon))) }));
// 2. values
if (args.fetch) for (const p of inWin) writeFileSync(join(slfDir, `${p.code}.json`), await (await fetch(`https://measurement-api.slf.ch/public/api/study-plot/station/${p.code}/measurements?period_in_days=7`)).text());
const runs = readdirSync(join(cache, 'runs')).filter((r) => /^\d{10}$/.test(r) && existsSync(join(cache, 'runs', r, 'wx'))).sort();
const chunkMemo = new Map();
const chunk = (run, id) => {
  if (!chunkMemo.has(run)) { const m = new Map(); for (const f of readdirSync(join(cache, 'runs', run, 'wx'))) for (const [k, g] of Object.entries(J(join(cache, 'runs', run, 'wx', f)).glaciers)) m.set(k, g); chunkMemo.set(run, m); }
  return chunkMemo.get(run).get(id);
};
const rowF = (run, id) => { const p = join(cache, 'runs', run, 'snowpack.json'); if (!existsSync(p)) return null; return J(p).glaciers.find((g) => g.id === id)?.f ?? null; };
/** Fusion precipitation of glacier `id` over [t0, t1): each hour from the latest run ≤ the hour; null when an hour has no run with a chunk. */
function fusionP(id, t0, t1) {
  let s = 0;
  for (let t = t0; t < t1; t += H) {
    const run = runs.filter((r) => runMs(r) <= t).pop(); if (!run) return null;
    const h = Math.round((t - runMs(run)) / H), c = chunk(run, id);
    if (!c?.p || h >= c.p.length) return null;
    s += c.p[h];
  }
  return s;
}
const rows = [];
for (const p of inWin) {
  const own = p.glaciers.find((g) => g.klass !== 'C' && chunk(runs[runs.length - 1], g.id)?.p) ?? null;
  const f = join(slfDir, `${p.code}.json`); if (!existsSync(f)) continue;
  for (const m of J(f)) {
    const t1 = Date.parse(m.measure_date), t0 = t1 - 24 * H;
    rows.push({ code: p.code, label: p.label, elev: p.elev, glacier: own?.id ?? null, km: own?.km ?? null, day: m.measure_date.slice(0, 10), HS: m.HS, HN: m.HN_1D, HNW: m.HNW_1D, pFusion: own ? fusionP(own.id, t0, t1) : null });
  }
}
const covered = rows.filter((r) => r.pFusion != null);
const out = { kind: 'gm11/plots', rule: { km: STN_MAP_KM, dz: STN_MAP_DZ, outline: `L${STN_OUTLINE_LEVEL}` }, plots: plots.length, inWindow: inWin.length, window: inWin, nearest: nearKm.sort((a, b) => a.km - b.km).slice(0, 12), runs, rows, covered: covered.length };
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ plots: plots.length, inWindow: inWin.map((p) => `${p.code} ${p.label} ${p.elev} m → ${p.glaciers.length} Gletscher, nächster ${p.glaciers[0].id} ${p.glaciers[0].km} km`), nearest: out.nearest, covered: covered.length }, null, 1));
for (const r of rows.sort((a, b) => (a.code + a.day).localeCompare(b.code + b.day))) console.log([r.code, r.label, r.elev, r.day, `HS ${r.HS}`, `HN ${r.HN}`, `HNW ${r.HNW}`, `Fusion ${r.pFusion == null ? '–' : r.pFusion.toFixed(1)}`, r.glacier].join(' | '));
