// Real slice of the satellite line for the UI verifier: the season documents (newest stand per region and year) of a scan, cut to the glaciers of
// the static-extract fixture, plus the `sat` pointer of the index. Fixtures carry the real data form (lesson BW-1).
//   node scripts/glacier/make-sat-extract.mjs <sat-out dir> [<out file>]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const satOut = process.argv[2];
const out = process.argv[3] ?? join(HERE, '..', 'lib', 'fixtures', 'glacier', 'sat-extract.json');
const fx = JSON.parse(readFileSync(join(HERE, '..', 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8'));
const ids = new Set(Object.values(fx.catalogRows).map((g) => g.id));
const regions = new Set(Object.values(fx.catalogRows).map((g) => g.region));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const seasons = {};
const index = { updatedAt: null, newest: {}, seasons: {} };
const sdir = join(satOut, 'season');
for (const y of existsSync(sdir) ? readdirSync(sdir) : []) for (const region of readdirSync(join(sdir, y))) {
  const stands = readdirSync(join(sdir, y, region)).sort();
  const stand = stands[stands.length - 1].replace(/\.json$/, '');
  if (!regions.has(region)) continue;
  const doc = J(join(sdir, y, region, `${stand}.json`));
  const keep = Object.fromEntries(Object.entries(doc.glaciers).filter(([id]) => ids.has(id)));
  if (!Object.keys(keep).length) continue;
  seasons[`${y}/${region}`] = { ...doc, glaciers: keep };
  (index.seasons[y] ??= {})[region] = stand;
  index.updatedAt = index.updatedAt && index.updatedAt > doc.builtAt ? index.updatedAt : doc.builtAt;
}
const odir = join(satOut, 'obs');
for (const y of existsSync(odir) ? readdirSync(odir) : []) for (const t of readdirSync(join(odir, y))) for (const f of readdirSync(join(odir, y, t))) {
  const date = f.replace(/\.json$/, '');
  if (!index.newest[t] || date > index.newest[t]) index.newest[t] = date;
}
writeFileSync(out, JSON.stringify({ schema: 1, kind: 'glacier/sat-fixture-extract', index, seasons }));
console.log('sat extract', out, Object.keys(seasons).join(', '), 'newest', Math.max(...Object.values(index.newest).map((d) => Date.parse(d))) && Object.values(index.newest).sort().pop());
