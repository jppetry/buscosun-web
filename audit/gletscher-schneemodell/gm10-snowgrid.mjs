#!/usr/bin/env node
/**
 * Phase GM-10, step 0 — snow water equivalent of SNOWGRID Klima v2.1 (GeoSphere Austria, CC BY 4.0, DOI 10.60669/fsxx-6977) on the Austrian
 * glaciers of the GM-5b truth and on the cells of all catalogue glaciers of their five regions (region reference). Measurement only.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm10-snowgrid.mjs \
 *        --truth=<gm3/truth/gy.json> --cells=<cells-20261120-1.1.json> --dir=<gm10/snowgrid>
 *
 * Cells = the cells file of phase GN (`glacier/v1/snow/static/cells/20261120-1.1.json`, read from the data repo, nothing written there).
 * Time-series API, one quantity (`swe_tot`, kg m-2), 150 points per request, at most 1 000 000 values per request (both measured in GN),
 * 1 s pause, raw answers kept in the cache. Rule as for Q20: SWE(t1 + 1) − SWE(t0); a glacier value = mean over its cells.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnowAnswer, snowSeriesUrl, snowCellKey, SNOW_POINTS_PER_REQUEST, SNOWGRID_MAX_VALUES_PER_REQUEST } from '../../src/glacier/glacierSnowContract.ts';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const truth = JSON.parse(readFileSync(arg('truth'), 'utf8')).gy.filter((o) => o.country === 'AT');
const cellsDoc = JSON.parse(readFileSync(arg('cells'), 'utf8'));
const dir = arg('dir');
const START = '20110901', END = '20250601';
const nDays = Math.round((Date.parse('2025-06-01') - Date.parse('2011-09-01')) / 864e5) + 1;

const regions = new Set(truth.map((o) => cellsDoc.glaciers[o.catId]?.region).filter(Boolean));
const regionCells = new Map();
for (const e of Object.values(cellsDoc.glaciers)) if (regions.has(e.region)) { if (!regionCells.has(e.region)) regionCells.set(e.region, new Set()); for (const c of e.cells) regionCells.get(e.region).add(snowCellKey(c[0], c[1])); }
const all = [...new Set([...regionCells.values()].flatMap((s) => [...s]))].map((k) => k.split(',').map(Number));
const per = Math.min(SNOW_POINTS_PER_REQUEST, Math.floor(SNOWGRID_MAX_VALUES_PER_REQUEST / nDays));
console.error(`${regions.size} Regionen, ${all.length} Zellen, ${nDays} Tage, ${per} Punkte je Abruf, ${Math.ceil(all.length / per)} Abrufe`);

const byKey = new Map(); let days = null;
for (let i = 0, r = 0; i < all.length; i += per, r++) {
  const raw = join(dir, `raw-${r}.json`);
  if (!existsSync(raw)) {
    const url = snowSeriesUrl(all.slice(i, i + per), START, END, ['swe_tot']);
    const res = await fetch(url, { headers: { 'User-Agent': 'buscosun-glacier-gm10 (+https://buscosun.com)', Accept: 'application/json' }, signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(raw, await res.text());
    console.error(`Abruf ${r}: ${res.headers.get('x-ratelimit-remaining-hour') ?? '?'} übrig je Stunde`);
    await new Promise((s) => setTimeout(s, 1000));
  }
  const ans = parseSnowAnswer(JSON.parse(readFileSync(raw, 'utf8')));
  days ??= ans.days;
  if (ans.days.join() !== days.join()) throw new Error('Tage der Abrufe verschieden');
  // the answer names the cell it snapped to; the request asked for cell centres, so both keys must agree
  ans.series.forEach((s, j) => { const want = snowCellKey(...all[i + j]); if (s.key !== want) throw new Error(`Zelle ${want} ⇒ ${s.key}`); byKey.set(s.key, s.swe); });
}
const di = new Map(days.map((d, i) => [d, i]));
const ymd = (iso) => iso.replaceAll('-', '');
const plus1 = (iso) => new Date(Date.parse(iso) + 864e5).toISOString().slice(0, 10);
const meanAt = (keys, day) => { const i = di.get(day); let s = 0, n = 0; for (const k of keys) { const v = byKey.get(k)?.[i]; if (v != null) { s += v; n++; } } return n ? { v: s / n, n } : null; };

const out = { kind: 'gm10/snowgrid-at', source: 'SNOWGRID Klima v2.1, GeoSphere Austria (CC BY 4.0, DOI 10.60669/fsxx-6977), swe_tot', cellsFile: cellsDoc.file, cellKm: 1,
  rule: 'swe(t1+1) - swe(t0); mean over the GN cells of the glacier', regions: Object.fromEntries([...regionCells].map(([r, s]) => [r, { nCells: s.size }])), glaciers: {} };
for (const o of truth) {
  const e = cellsDoc.glaciers[o.catId]; if (!e) continue;
  const g = (out.glaciers[o.key] ??= { catId: o.catId, country: 'AT', how: e.how, nCells: e.cells.length, km: e.km ?? null, region: e.region, winters: {} });
  const keys = e.cells.map((c) => snowCellKey(c[0], c[1])), reg = regionCells.get(e.region);
  const d0 = ymd(o.t0), d1 = ymd(plus1(o.t1));
  const a0 = meanAt(keys, d0), a1 = meanAt(keys, d1), r0 = meanAt(reg, d0), r1 = meanAt(reg, d1);
  g.winters[o.year] = { t0: o.t0, t1p1: plus1(o.t1), swe0: a0?.v ?? null, swe1: a1?.v ?? null, regSwe0: r0 ? Math.round(r0.v * 10) / 10 : null, regSwe1: r1 ? Math.round(r1.v * 10) / 10 : null };
}
writeFileSync(join(dir, 'at-glaciers.json'), JSON.stringify(out, null, 1));
for (const [k, g] of Object.entries(out.glaciers)) console.log(k, g.how, g.nCells, g.region, Object.entries(g.winters).slice(0, 4).map(([y, v]) => `${y}:${v.swe0}>${v.swe1}(${v.regSwe0}>${v.regSwe1})`).join(' '));
