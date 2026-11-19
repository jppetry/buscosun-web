#!/usr/bin/env node
/**
 * Fixture of verify:glacier-hugonnet (phase GH): REAL rows of the per-glacier table of Hugonnet et al. 2021 (doi:10.6096/13, CC BY 4.0) in the
 * published shape, the real bridge pairs and the real catalogue rows of a handful of glaciers — one per case of the 1 : 1 rule — plus what the
 * full local run made of them (`expect`). Nothing is invented; the table rows are a small extract (seven periods of seven RGI glaciers), the
 * table itself stays outside the repo.
 *
 *   node scripts/glacier/make-hugonnet-fixture.mjs --table=<dh_11_rgi60_pergla_rates.csv> --bridge=<bridge.json> --catalog=<catalog.json> \
 *        --dir=<package of hugonnet.mjs> [--out=scripts/lib/fixtures/glacier/hugonnet-extract.json]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const OUT = arg('out', 'scripts/lib/fixtures/glacier/hugonnet-extract.json');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = J(arg('catalog')), bridge = J(arg('bridge'));
const dir = join(arg('dir'), 'static', catalog.build, 'dhdt');
const report = J(join(dir, 'report.json'));
const byId = new Map(catalog.glaciers.map((g) => [g.id, g]));
const blockOf = (id) => J(join(dir, `${byId.get(id).region}.json`)).glaciers[id] ?? null;
const none = new Map(report.none.map((n) => [n[0], n]));

// one glacier per case, chosen by a rule (the first by id), never by hand-picked values
const firstNone = (why) => report.none.find((n) => n[1] === why)[0];
const pick = {
  trend: 'gl_ch_grosser-aletschgletscher',           // class A, value far outside its uncertainty
  rangeTotal: 'gl_de_blaueis',                       // uncertainty larger than the value in 2000–2019 (and in every five-year period)
  noValue: firstNone('no-value'),
  noRgi: firstNone('no-rgi'),
  partOfRgi: firstNone('part-of-rgi'),
  severalRgi: firstNone('several-rgi'),
  notMutual: firstNone('not-mutual'),
};
// the glacier that owns the RGI glacier of the not-mutual case (it must be in the fixture, or the case would turn into a match)
const nmRgi = none.get(pick.notMutual)[2];
const owner = bridge.pairs.filter((p) => p[1] === nmRgi).sort((a, b) => b[2] - a[2])[0][0];
pick.owner = owner;

const ids = [...new Set(Object.values(pick))];
const rgi = new Set(bridge.pairs.filter((p) => ids.includes(p[0])).map((p) => p[1]));
// every pair of every RGI glacier involved AND restricted to the fixture's glaciers would change "mutual"; so keep the pairs of the fixture's glaciers
// and add the catalogue rows of nobody else: the owner above is the only outside glacier that decides a case
const pairs = bridge.pairs.filter((p) => ids.includes(p[0]));
const lines = readFileSync(arg('table'), 'utf8').split('\n');
const KEEP = new Set(['2000-01-01_2020-01-01', '2000-01-01_2005-01-01', '2005-01-01_2010-01-01', '2010-01-01_2015-01-01', '2015-01-01_2020-01-01', '2000-01-01_2010-01-01', '2018-01-01_2019-01-01']);
// table rows only of the RGI glacier with the largest intersection per fixture glacier (the only rows the rule can ever ask for)
const top = new Set(ids.map((id) => pairs.filter((p) => p[0] === id).sort((a, b) => b[2] - a[2])[0]?.[1]).filter(Boolean));
const rows = lines.filter((l) => { const c = l.split(','); return top.has(c[0]) && KEEP.has(c[1]); });
const csv = [lines[0].trim(), ...rows.map((r) => r.trim())].join('\n') + '\n';

const expect = {};
for (const id of ids) expect[id] = blockOf(id) ? { block: blockOf(id) } : { why: none.get(id)[1], rgi: none.get(id)[2] };
const body = { pick, catalog: { schema: 1, kind: 'glacier/catalog', build: catalog.build, builtAt: catalog.builtAt, glaciers: ids.map((id) => byId.get(id)) }, bridge: { schema: 1, kind: 'glacier/rgi-bridge', build: bridge.build, pairs }, csv, expect };
const out = {
  schema: 1, kind: 'glacier/hugonnet-extract',
  from: { build: catalog.build, table: 'dh_11_rgi60_pergla_rates.csv', tableSha256: report.table.sha256, fullRun: { glaciers: report.glaciers, matched: report.matched, why: report.why } },
  source: 'Hugonnet, R. et al. (2021). Accelerated global glacier mass loss in the early twenty-first century - Dataset. Theia. https://doi.org/10.6096/13 (CC BY 4.0) — Auszug der Originalzeilen',
  ...body, sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ out: OUT, glaciers: ids.length, rgi: rgi.size, tableRows: rows.length, pairs: pairs.length, pick, expect: Object.fromEntries(Object.entries(expect).map(([k, v]) => [k, v.why ?? 'block'])) }));
