// Extracts a small REAL slice of a built static tree (catalogue rows, outline features of three levels, hypsometry, series,
// summary, projection, the official items and the sources) into the verifier fixture `scripts/lib/fixtures/glacier/static-extract.json`
// (lesson BW-1: fixtures carry the real data form, never invented values).
//   node scripts/glacier/make-fixture.mjs <v1 dir> [<out file>]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const v1 = process.argv[2];
const out = process.argv[3] ?? join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'lib', 'fixtures', 'glacier', 'static-extract.json');
const build = readdirSync(join(v1, 'static')).sort().pop();
const dir = join(v1, 'static', build);
const J = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const cat = J('catalog.json');
const byName = (rx, country) => cat.glaciers.find((g) => rx.test(g.name ?? '') && (!country || g.country === country));
const want = {
  aletsch: byName(/^Grosser Aletschgletscher$/, 'CH'),
  hef: byName(/^Hintereisferner/, 'AT'),
  hoellental: byName(/^Höllentalferner$/, 'DE'),
  blaueis: byName(/^Blaueis$/, 'DE'),
  pasterze: byName(/^Pasterzen Kees$/, 'AT'),
  rhone: byName(/^Rhonegletscher$/, 'CH'),
  dupCh: cat.glaciers.find((g) => g.country === 'CH' && /-g\d+e\d+n$/.test(g.id) && g.name),
  nnAt: cat.glaciers.find((g) => g.country === 'AT' && g.id.startsWith('gl_at_nn-')),
  cClassCh: cat.glaciers.find((g) => g.country === 'CH' && g.klass === 'C' && g.name),
  bAt: cat.glaciers.find((g) => g.id === 'gl_at_eis-ferner'),      // a real class-B glacier outside Germany (satellite values without a snow line)
};
for (const [k, v] of Object.entries(want)) if (!v) throw new Error('fixture glacier missing: ' + k);
const ids = Object.values(want).map((g) => g.id);
const levelsFull = new Set([want.hef.id, want.hoellental.id, want.blaueis.id, want.cClassCh.id]);
const pick = (doc, region) => doc.features.filter((f) => ids.includes(f.properties.id));
const outline = {};
for (const g of Object.values(want)) {
  for (const lv of [1, 2, 3]) {
    if (lv > 1 && !levelsFull.has(g.id)) continue;
    const d = J(`outline/${g.region}-L${lv}.json`);
    const f = d.features.find((x) => x.properties.id === g.id);
    (outline[g.id] ??= {})[`L${lv}`] = f.geometry;
  }
}
const regions = [...new Set(Object.values(want).map((g) => g.region))];
const pickRegion = (file) => Object.fromEntries(regions.map((r) => {
  try { const d = J(file(r)); return [r, Object.fromEntries(Object.entries(d.glaciers).filter(([id]) => ids.includes(id)))]; } catch { return [r, {}]; }
}));
const sum = J('summary.json');
const doc = {
  schema: 1, kind: 'glacier/fixture', from: { build, takenAt: new Date().toISOString() },
  catalogRows: Object.fromEntries(Object.entries(want).map(([k, g]) => [k, g])),
  outline,
  hypso: pickRegion((r) => `hypso/${r}.json`),
  series: pickRegion((r) => `series/${r}.json`),
  proj: pickRegion((r) => `proj/${r}.json`),
  summaryLatest: Object.fromEntries(ids.map((id) => [id, sum.latest[id] ?? null])),
  summaryCountries: sum.countries,
  official: J('official.json'),
  sources: J('sources.json'),
  catalogCounts: { n: cat.glaciers.length, byCountry: Object.fromEntries(['CH', 'AT', 'DE'].map((c) => [c, cat.glaciers.filter((g) => g.country === c).length])) },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc));
console.log('fixture', out, (JSON.stringify(doc).length / 1024).toFixed(0), 'KB; glaciers', Object.entries(want).map(([k, g]) => `${k}=${g.id}`).join(' '));
