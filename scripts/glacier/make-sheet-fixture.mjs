#!/usr/bin/env node
/**
 * Fixture of the glacier sheet (GL-4): REAL documents of four glaciers cut from a full local tree —
 *   hef (class A, AT: outline L3, earlier outline GI4 2015, elevation grid, TSLA band, series, projection),
 *   bAt (class B, AT), cClassCh (class C, CH: no satellite number), blaueis (DE).
 * plus their rows of a real melt run (run stamp moved to the verifier's clock, nothing else changed).
 *
 *   node scripts/glacier/make-sheet-fixture.mjs --tree=<v1 of a full tree with melt/> [--out=scripts/lib/fixtures/glacier/sheet-extract.json]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const TREE = arg('tree');
const OUT = arg('out', 'scripts/lib/fixtures/glacier/sheet-extract.json');
if (!TREE) { console.error('--tree=<v1> fehlt'); process.exit(2); }
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const build = readdirSync(join(TREE, 'static')).sort().pop();
const S = (f) => J(join(TREE, 'static', build, f));
const T = (f) => { try { return S(f); } catch { return null; } };
const fx = J('scripts/lib/fixtures/glacier/static-extract.json');
const ids = { hef: fx.catalogRows.hef.id, bAt: fx.catalogRows.bAt.id, cClassCh: fx.catalogRows.cClassCh.id, blaueis: fx.catalogRows.blaueis.id };
const cat = S('catalog.json').glaciers;
const byId = new Map(cat.map((g) => [g.id, g]));
const out = { schema: 1, kind: 'glacier/sheet-extract', build, ids, glaciers: {}, melt: null, sha256: '' };
const report = S('report.json');
for (const [key, id] of Object.entries(ids)) {
  const g = byId.get(id);
  const region = g.region;
  const l3 = S(`outline/${region}-L3.json`).features.find((f) => f.properties.id === id);
  const epochs = [];
  for (const f of Object.keys(report.files)) {
    const m = new RegExp(`^outline/${region}-e(\\d{4})\\.json$`).exec(f);
    if (!m) continue;
    const d = S(f);
    const feat = d.features.find((x) => x.properties.ids?.includes(id));
    if (feat) epochs.push({ year: Number(m[1]), source: d.source ?? '', geometry: feat.geometry });
  }
  const dem = (() => { try { return S(`dem/${region}.json`).glaciers[id] ?? null; } catch { return null; } })();
  const clima = (() => { try { const c = S(`clima/${region}.json`); return c.glaciers[id] ? { doy0: c.doy0, bin: c.bin, entry: c.glaciers[id] } : null; } catch { return null; } })();
  out.glaciers[key] = {
    region, geometry: l3.geometry, epochs, dem, clima,
    hypso: T(`hypso/${region}.json`)?.glaciers[id] ?? null, series: T(`series/${region}.json`)?.glaciers[id] ?? [], proj: (() => { const p = T(`proj/${region}.json`); return p?.glaciers[id] ? { years: p.years, ssp: p.ssp, entry: p.glaciers[id] } : null; })(),
  };
}
const idx = J(join(TREE, 'index.json'));
const run = J(join(TREE, 'melt', `${idx.melt.run}.json`));
const rows = run.glaciers.filter((r) => Object.values(ids).includes(r.id));
out.melt = { ...run, run: '2026101110', runAt: '2026-10-11T10:30:00Z', glaciers: rows, skipped: [], note: `Zeilen des echten Laufs ${run.run} (${run.runAt}); nur der Laufstempel ist auf die Uhr des Prüfers gelegt` };
out.sha256 = createHash('sha256').update(JSON.stringify({ g: out.glaciers, m: out.melt })).digest('hex');
writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}: ${Math.round(JSON.stringify(out).length / 1024)} KB`, Object.fromEntries(Object.entries(out.glaciers).map(([k, v]) => [k, { epochs: v.epochs.length, dem: !!v.dem, clima: !!v.clima, series: v.series.length, proj: !!v.proj }])), 'melt rows', rows.length);
