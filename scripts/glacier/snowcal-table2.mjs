#!/usr/bin/env node
/**
 * Phase GM, GM-5b — writes the second calibration table `scripts/glacier/snow-calibration-glaciers.json` from the report of the second round
 * (`snowcal-fit2.mjs`) and puts the report (without its per-winter rows) next to the frozen method in audit/gletscher-schneemodell/. No fitting here:
 * the table states what the report found. The first table (`snow-calibration.json`) is not read and not written.
 * The head carries the source attribution (GLAMOS, WGMS; E-GM-37): the table holds derived model parameters, no row of a source file.
 *
 *   node scripts/glacier/snowcal-table2.mjs --report=<report-fit2.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snowGlaciersProblems, SNOWCAL_GLACIERS_KIND, SNOWCAL_GLACIERS_BOUNDS, SNOWCAL_GLACIERS_SOURCES } from './lib/snowcalGlaciers.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ROOT = join(import.meta.dirname, '..', '..');
const AUDIT = join(ROOT, 'audit', 'gletscher-schneemodell');

/** The table from the report. An entry whose factor sits at a bound of the search range is kept and marked (`atBound`): not a measurement of the factor. */
export function buildGlacierTable(R) {
  const [lo, hi] = SNOWCAL_GLACIERS_BOUNDS.F;
  const glaciers = {};
  // GM-11 (V-GM-136): a series without a catalogue glacier (it measures a part of one, `snowcal-truth.mjs`) stays in the fit, gets no row here
  const without = Object.entries(R.table).filter(([, g]) => !g.catId).map(([key, g]) => ({ key, name: g.name, country: g.country, winters: g.winters }));
  for (const g of Object.values(R.table).filter((x) => x.catId).sort((a, b) => (a.catId < b.catId ? -1 : 1))) {
    glaciers[g.catId] = { country: g.country, winters: g.winters, years: g.years, F: g.F, origin: 'measured', ...(g.F <= lo + 1e-9 || g.F >= hi - 1e-9 ? { atBound: true } : {}), shape: g.shape };
  }
  const s = R.summary, v = R.verdicts;
  return {
    schema: 1, kind: SNOWCAL_GLACIERS_KIND, generated: R.generated,
    method: { ...R.method, amendments: ['audit/gletscher-schneemodell/gm5b-diagnose.md §4b: ein Faktor an einer Grenze des Suchbereichs trägt „atBound“ und wird vom Producer nicht benutzt (nach dem Lauf geschrieben, ändert kein Urteil)'] },
    melt: R.melt,
    against: { CH: 'MeteoSchweiz RhiresD, Tagesgitter 1 km (CC BY 4.0, Quelle: MeteoSchweiz)', AT: 'GeoSphere Austria INCA-Analyse stündlich, 1 km (inca-v1-1h-1km, CC BY 4.0)' },
    truth: 'Winterbilanz je Höhenstufe: GLAMOS Release 2025 (Schweiz), WGMS FoG 2026-02-10 (Österreich), hydrologische Jahre 2012–2025',
    // E-GM-37: source attribution and the note that the table holds derived parameters only
    sources: SNOWCAL_GLACIERS_SOURCES,
    forcing: 'Temperatur und Globalstrahlung einer Station (SwissMetNet, GeoSphere klima-v2-1h), nicht die des Betriebs',
    n: { glaciers: s.glaciers, winters: s.winters, usable: R.data.usable },
    ...(without.length ? { withoutCatalogue: { note: 'Reihen der Eichung ohne eigenen Katalog-Gletscher (Teil eines Gletschers): im Landeswert und im Formpool, ohne Zeile', series: without } } : {}),
    shrink: { n0: s.n0, n0s: s.n0s }, country: s.countryFull, bounds: { F: SNOWCAL_GLACIERS_BOUNDS.F, floor: SNOWCAL_GLACIERS_BOUNDS.floor },
    scores: { unit: 'mm w. e.', leftOut: 'ein Winter', V0: s.V0.all, V1: s.V1.all, V2: s.V2.all, V3: s.V3.all, negative: s.N.all, byCountry: { CH: { V0: s.V0.CH, V1: s.V1.CH, V2: s.V2.CH }, AT: { V0: s.V0.AT, V1: s.V1.AT, V2: s.V2.AT } } },
    verdict: v, gate: { factor: v.K6.carries, shape: v.K7.carries },
    usedByProducer: false,
    glaciers,
    reports: ['audit/gletscher-schneemodell/gm5b-report.json'],
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const R = JSON.parse(readFileSync(arg('report'), 'utf8'));
  const table = buildGlacierTable(R);
  const problems = snowGlaciersProblems(table);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  writeFileSync(join(ROOT, 'scripts', 'glacier', 'snow-calibration-glaciers.json'), JSON.stringify(table, null, 1) + '\n');
  const { perWinter, ...slim } = R;   // the rows per glacier-winter stay in the local cache
  writeFileSync(join(AUDIT, 'gm5b-report.json'), JSON.stringify({ ...slim, perWinterRows: perWinter.length }, null, 1) + '\n');
  console.log(`table: ${Object.keys(table.glaciers).length} glaciers, ${Object.values(table.glaciers).filter((g) => g.atBound).length} at a bound; gate factor ${table.gate.factor}, shape ${table.gate.shape}; n0 ${table.shrink.n0}, n0s ${table.shrink.n0s}`);
}
