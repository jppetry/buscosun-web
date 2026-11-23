#!/usr/bin/env node
/**
 * Phase GM, GM-3 — writes the calibration table `scripts/glacier/snow-calibration.json` from the three reports (A precipitation, B density, C bridge) and puts
 * the reports next to the frozen method in audit/gletscher-schneemodell/. No fitting here: the table states what the reports found, with origins.
 *
 *   node scripts/glacier/snowcal-table.mjs --a=<report-A.json> --b=<report-B.json> --c=<report-C.json> [--explore=<report-A-explore.json>] [--run1=<first scored report A>]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { snowCalibrationProblems, SNOWCAL_KIND, SNOWCAL_BOUNDS, SNOW_PRECIP_DEFAULT } from './lib/snowcal.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const ROOT = join(import.meta.dirname, '..', '..');
const AUDIT = join(ROOT, 'audit', 'gletscher-schneemodell');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000, r1 = (v) => Math.round(v * 10) / 10;

export function buildTable(A, B, C) {
  const red = Object.entries(A.verdict).filter(([, v]) => !v.pass).map(([k]) => k.split(' ')[0]);
  const regions = {};
  for (const t of A.table) {
    const own = t.n.glaciers > 0;
    regions[t.region] = { F: r3(t.F), gu: r4(t.gu), go: r4(t.go), fOrigin: own && t.fFrom !== 'all' ? 'measured' : 'transferred', gOrigin: own ? 'measured' : 'transferred', fFrom: t.fFrom, gFrom: t.gFrom, glaciers: t.n.glaciers, winters: t.n.winters };
    if (t.country === 'DE') Object.assign(regions[t.region], { fOrigin: 'transferred', gOrigin: 'transferred', glaciers: 0, winters: 0 });
  }
  const bridge = (x) => ({ ratioOfSums: r3(x.ratioOfSums), glaciers: x.glaciers, ratioMedian: r3(x.ratioMedian), ratioP10: r3(x.ratioP10), ratioP90: r3(x.ratioP90) });
  const d = B.selection.chosen;
  const density = { rule: d, origin: d === 'D0' || d === 'D1' ? 'literature' : 'measured', span: { p10: r1(B.measured.all.p10), p50: r1(B.measured.all.p50), p90: r1(B.measured.all.p90) }, events: B.data.events, sites: B.data.sitesWithEvents, against: 'SLF-Messfelder: Neuschneehöhe und Wasserwert des Neuschnees auf demselben Brett, 06 UTC (CC BY 4.0)', mae: { D0: r3(B.D0.mae), D1: r3(B.D1.mae), D2lso: r3(B.D2.lsoMae), D3lso: r3(B.D3.lsoMae) }, bias: { D0: r3(B.D0.bias), D1: r3(B.D1.bias), D2lso: r3(B.D2.lsoBias), D3lso: r3(B.D3.lsoBias) } };
  if (d === 'D2') density.rhoNew = B.D2.rho;
  if (d === 'D3') Object.assign(density, { a: B.D3.a, b: B.D3.b, clip: B.constants.d3.clip });
  if (B.austria) density.transferAT = { events: B.austria.events, sites: B.austria.sites, water: 'Niederschlagsmesser (unterschätzt Schnee)', D0: { mae: r3(B.austria.D0.mae), bias: r3(B.austria.D0.bias) }, chosen: { mae: r3(B.austria.chosen.mae), bias: r3(B.austria.chosen.bias) } };
  return {
    schema: 1, kind: SNOWCAL_KIND, generated: A.generated,
    method: { ...A.method, amendments: ['audit/gletscher-schneemodell/gm3-method-frozen-amendment-1.md (explorativ, ändert weder Auswahl noch Urteil)'] },
    // true only when the producer switch of the precipitation factor is ON by default (GM-3b; `verify:glacier-snowcal` G1 holds the two together)
    usedByProducer: SNOW_PRECIP_DEFAULT !== 'gate-c',
    precip: {
      against: { CH: 'MeteoSchweiz RhiresD, Tagesgitter 1 km (CC BY 4.0, Quelle: MeteoSchweiz)', AT: 'GeoSphere Austria INCA-Analyse stündlich, 1 km (inca-v1-1h-1km, CC BY 4.0)' },
      truth: 'Winterbilanz je Höhenstufe: GLAMOS Release 2025 (Schweiz), WGMS FoG 2026-02-10 (Österreich), hydrologische Jahre 2012–2025',
      form: A.selection.chosen.form, levels: { F: A.selection.chosen.fLevel, g: A.selection.chosen.gLevel }, floor: SNOWCAL_BOUNDS.floor,
      n: { winters: A.data.winters, glaciers: A.data.glaciers, CH: A.data.CH, AT: A.data.AT, unusable: A.data.unusable.length },
      regions,
      bridge: { value: 1, origin: 'set', applied: false, measured: { window: C.window, AT: bridge(C.AT), CH: bridge(C.CH) }, meaning: 'value = Faktor, der den Niederschlag von buscosun Fusion auf die Analyse bringt (Analyse / Fusion); measured.ratioOfSums = Fusion / Analyse', note: 'buscosun Fusion gegen dieselben Analysen; gemessen, nicht angewandt (Methode §A.8, §C)' },
      scores: { unit: 'mm w. e.', lgo: Object.fromEntries(['s1', 's2', 's3', 's4'].map((k) => [k, r1(A.chosen.lgo.all[k])])), today: Object.fromEntries(['s1', 's2', 's3', 's4'].map((k) => [k, r1(A.baselines.B0.scores.all[k])])), raw: Object.fromEntries(['s1', 's2', 's3', 's4'].map((k) => [k, r1(A.baselines.B1.scores.all[k])])) },
      verdict: A.verdict, gate: A.gate,
      ...(A.gate ? {} : { reason: `${red.join(', ')} rot: die Höhe des Faktors ist bestimmt, der Verlauf mit der Höhe nicht belastbar (Vorzeichen hängt am Gradtagfaktor der Winterschmelze, Empfindlichkeit S1)` }),
      sensitivity: Object.fromEntries(Object.entries(A.sensitivity).map(([k, v]) => [k, { F: Object.fromEntries(Object.entries(v.full.F).map(([c, x]) => [c, r3(x)])), g: r4(Object.values(v.full.gu)[0]), lgoS1: r1(v.lgoS1) }])),
    },
    density,
    undercatch: { applied: false, gaugeOverBoard: r3(B.undercatch.all), events: B.undercatch.events, byWind: B.undercatch.byWind.map((w) => ({ from: w.from, to: w.to, n: w.n, ratio: r3(w.ratio) })), note: 'Niederschlagsmesser der SwissMetNet-Station gegen den Wasserwert des Neuschnees auf dem Messfeld, dieselben Ereignistage' },
    reports: ['audit/gletscher-schneemodell/gm3-report-A.json', 'audit/gletscher-schneemodell/gm3-report-B.json', 'audit/gletscher-schneemodell/gm3-report-C.json'],
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const A = J(arg('a')), B = J(arg('b')), C = J(arg('c'));
  const table = buildTable(A, B, C);
  const problems = snowCalibrationProblems(table, A.table.map((t) => t.region));
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  writeFileSync(join(ROOT, 'scripts', 'glacier', 'snow-calibration.json'), JSON.stringify(table, null, 1) + '\n');
  // reports next to the method; the per-site rows of C are large and kept (the measurement is short enough to be redone only with the same runs)
  copyFileSync(arg('a'), join(AUDIT, 'gm3-report-A.json'));
  copyFileSync(arg('b'), join(AUDIT, 'gm3-report-B.json'));
  copyFileSync(arg('c'), join(AUDIT, 'gm3-report-C.json'));
  if (arg('explore') && existsSync(arg('explore'))) copyFileSync(arg('explore'), join(AUDIT, 'gm3-report-A-explore.json'));
  if (arg('run1') && existsSync(arg('run1'))) copyFileSync(arg('run1'), join(AUDIT, 'gm3-report-A-run1.json'));
  console.log(`table: form ${table.precip.form}, F ${table.precip.levels.F}, g ${table.precip.levels.g}, gate ${table.precip.gate}; density ${table.density.rule}${table.density.rhoNew ? ` ${table.density.rhoNew} kg/m³` : ''}; ${Object.keys(table.precip.regions).length} regions`);
}
