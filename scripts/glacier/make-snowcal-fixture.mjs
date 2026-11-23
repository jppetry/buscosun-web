#!/usr/bin/env node
/**
 * Phase GM, GM-3 — fixture of `verify:glacier-snowcal`: REAL data in the form the calibration reads, cut to one Swiss and one Austrian glacier-winter and to
 * a few dozen real study-plot days. Nothing is invented; values are only cut out (and the hourly series clipped to September 2023 … May 2024).
 *
 *   node scripts/glacier/make-snowcal-fixture.mjs --raw=<raw dir with glamos/, wgms/x/data/> --cache=<gm3 cache> --catalog=<catalog.json>
 *
 * Sources: GLAMOS (2025) release 2025; WGMS FoG 2026-02-10; MeteoSwiss RhiresD and SwissMetNet (CC BY 4.0, Quelle: MeteoSchweiz); GeoSphere Austria INCA and
 * klima-v2-1h (CC BY 4.0); SLF study plots (CC BY 4.0).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvents } from './snowcal-density.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const raw = arg('raw'), cache = arg('cache');
const OUT = join(import.meta.dirname, '..', 'lib', 'fixtures', 'glacier', 'snowcal');
for (const d of ['truth-src/glamos', 'truth-src/wgms', 'cache']) mkdirSync(join(OUT, d), { recursive: true });
const YEAR = 2024, CH = 'Rhonegletscher', AT = 'HINTEREIS F.';
const FROM = Date.parse('2023-09-01T00:00:00Z'), TO = Date.parse('2024-06-01T00:00:00Z');

// truth sources: the head of each file and the rows of the two glaciers (two years, so that the year filter and the borrowed band area have something to do)
// Switzerland: NO row of a GLAMOS file goes into the repository (E-GL-17: those files serve internally as truth only). The fixture carries the column layout of
// `massbalance_fixdate_elevationbins.csv` with the values of the same glacier-years as published in the WGMS FoG (`mass_balance_band`), converted to mm and km².
const wb = readFileSync(join(raw, 'wgms', 'x', 'data', 'mass_balance_band.csv'), 'utf8').split(/\r?\n/).map((l) => l.split(','));
const rhone = wb.filter((c) => c[0] === 'CH' && c[1] === 'RHONE' && (c[3] === '2010' || c[3] === String(YEAR)) && c[7] !== '' && c[6] !== '');
const glHead = [
  '# Spaltenformat der GLAMOS-Datei massbalance_fixdate_elevationbins.csv; Werte aus dem WGMS FoG 2026-02-10 (mass_balance_band, Rhonegletscher), in mm w. e. und km².',
  'glacier name,glacier id,start date of observation,end date of winter observation,end date of observation,winter mass balance,summer mass balance,annual mass balance,area of elevation bin,lower elevation of bin,upper elevation of bin,observer',
];
const mm = (v) => (v === '' ? '' : String(Math.round(Number(v) * 1000)));
writeFileSync(join(OUT, 'truth-src/glamos/massbalance_fixdate_elevationbins.csv'), [...glHead, ...rhone.map((c) => `${CH},B43-03,${c[3] - 1}-10-01,${c[3]}-04-30,${c[3]}-09-30,${mm(c[7])},${mm(c[9])},${mm(c[11])},${(Number(c[6]) / 1e6).toFixed(5)},${c[4]},${c[5]}, WGMS FoG 2026-02-10`)].join('\n') + '\n');
const pick = (file, keep) => { const l = readFileSync(join(raw, 'wgms', 'x', 'data', file), 'utf8').split(/\r?\n/); writeFileSync(join(OUT, 'truth-src/wgms', file), [l[0], ...l.slice(1).filter(keep)].join('\n') + '\n'); };
pick('mass_balance_band.csv', (l) => l.startsWith(`AT,${AT},`) && /^AT,[^,]+,\d+,(2023|2024),/.test(l));
pick('mass_balance.csv', (l) => l.startsWith(`AT,${AT},`) && /^AT,[^,]+,\d+,[^,]*,(2023|2024),/.test(l));
pick('glacier.csv', (l) => /^AT,HINTEREIS F\.,/.test(l) || /^CH,RHONE,/.test(l));
const pts = readFileSync(join(raw, 'wgms', 'x', 'data', 'mass_balance_point.csv'), 'utf8').split(/\r?\n/);
writeFileSync(join(OUT, 'truth-src/wgms', 'mass_balance_point.csv'), [pts[0], ...pts.slice(1).filter((l) => /^AT,HINTEREIS F\.,\d+,2024,/.test(l) && /,winter,/.test(l))].join('\n') + '\n');

const cat = JSON.parse(readFileSync(arg('catalog'), 'utf8'));
const keep = cat.glaciers.filter((g) => ['gl_ch_rhonegletscher', 'gl_at_hintereisferner-mit-toteis', 'gl_ch_griesgletscher', 'gl_at_kesselwandferner'].includes(g.id));
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify({ schema: cat.schema, kind: cat.kind, build: cat.build, glaciers: keep }));
writeFileSync(join(OUT, 'regions.json'), JSON.stringify({ build: cat.build, regions: [...new Set(cat.glaciers.map((g) => g.region))].sort() }));

// forcing in the form of the cache, clipped
const st = JSON.parse(readFileSync(join(cache, 'stations.json'), 'utf8'));
const truth = JSON.parse(readFileSync(join(cache, 'truth', 'gy.json'), 'utf8')).gy;
const ch = truth.find((o) => o.name === CH && o.year === YEAR), at = truth.find((o) => o.name === AT && o.year === YEAR);
const fromMs = Date.parse(st.from), i0 = Math.round((FROM - fromMs) / 3_600_000), i1 = Math.round((TO - fromMs) / 3_600_000);
const assign = {};
for (const o of [ch, at]) {
  const a = st.assign[o.key]; assign[o.key] = a;
  const t = JSON.parse(readFileSync(join(cache, `temp-${a.temp.id}.json`), 'utf8'));
  writeFileSync(join(OUT, 'cache', `temp-${a.temp.id}.json`), JSON.stringify({ id: t.id, name: t.name, height: t.height, fromMs: FROM, hours: i1 - i0, t: t.t.slice(i0, i1) }));
}
const inca = JSON.parse(readFileSync(join(cache, `inca-${at.key}.json`), 'utf8'));
writeFileSync(join(OUT, 'cache', `inca-${at.key}.json`), JSON.stringify({ key: inca.key, name: inca.name, fromMs: FROM, hours: i1 - i0, cell: inca.cell, p: inca.p.slice(i0, i1) }));
const rh = JSON.parse(readFileSync(join(cache, 'rhires.json'), 'utf8'));
const d0 = Math.round((Date.parse('2023-09-01T00:00:00Z') - Date.parse(rh.day0 + 'T00:00:00Z')) / 86_400_000), d1 = Math.round((TO - Date.parse(rh.day0 + 'T00:00:00Z')) / 86_400_000);
writeFileSync(join(OUT, 'cache', 'rhires.json'), JSON.stringify({ kind: rh.kind, source: rh.source, day0: '2023-09-01', dayMeaning: rh.dayMeaning, points: { [ch.key]: { ...rh.points[ch.key], p: rh.points[ch.key].p.slice(d0, d1) } } }));
writeFileSync(join(OUT, 'cache', 'stations.json'), JSON.stringify({ from: new Date(FROM).toISOString(), to: new Date(TO).toISOString(), rule: st.rule, licences: st.licences, assign }));

// real study-plot days: the first 30 event days of three sites of winter 2024
const { events } = await loadEvents(cache, fromMs, Date.parse(st.to));
const sites = ['5WJ0', '1GH0', '4UL0'];
const ev = sites.flatMap((c) => events.filter((e) => e.code === c && e.hy === YEAR).slice(0, 30)).map((e) => ({ code: e.code, date: new Date(e.ms).toISOString(), z: e.z, hn: e.hn, hnw: e.hnw, t: e.t.map((v) => Math.round(v * 10) / 10), u: e.u, gauge: e.gauge == null ? null : Math.round(e.gauge * 10) / 10 }));
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ about: 'Echte Ereignistage dreier SLF-Messfelder (Weissfluhjoch, Grimsel Hospiz, Ulrichen), Winter 2023/24: Neuschneehöhe hn (cm) und Wasserwert hnw (mm) vom Brett, 06 UTC; t = Stundentemperatur der SwissMetNet-Station auf Messfeldhöhe (°C), u = Wind (m/s), gauge = Niederschlagsmesser der 24 Stunden (mm).', sources: ['SLF, https://measurement-data.slf.ch/study-plot, CC BY 4.0', 'MeteoSchweiz SwissMetNet, CC BY 4.0, Quelle: MeteoSchweiz'], events: ev }));
console.log(`fixture → ${OUT}: ${ch.name} ${YEAR} (${ch.bins.length} bins), ${at.name} ${YEAR} (${at.bins.length} bins), ${ev.length} study-plot days`);
