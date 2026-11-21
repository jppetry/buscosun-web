/**
 * verify:glacier-weather — Phase GW ("Wetter am Gletscher"): the contract with negative controls, the band temperature against a hand
 * calculation, the phase split against the melt core, `melt.mjs` end to end with a stubbed buscosun Fusion in the real data shape
 * (class C omission, engine name from the answer, skips with a reason, the melt document byte-identical with and without weather,
 * retention, chunk paths, the publisher's package guard), the daily values recomputed from the hourly rows of a REAL run
 * (`scripts/lib/fixtures/glacier/weather-extract.json`), and the view rules of the card.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-weather.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, simulate, emptyState } from './glacier/lib/meltcore.mjs';
import { solidFraction, weatherSeriesOf, weatherOfGlacier, prevailingDir, phaseProbability, phaseShares, sumSpreads, weatherPhaseOf, phaseDocWith, WEATHER_PHASE_DEFAULT } from './glacier/lib/weathercore.mjs';
import { weatherProblems as oldWeatherProblems, weatherHourlyProblems as oldWeatherHourlyProblems } from './lib/fixtures/glacier/weather-contract-before-gs.ts';
import { tempAt, main } from './glacier/melt.mjs';
import { checkPackage } from './glacier/glacier-publish.mjs';
import { fusionStageNote, fusionStage, fusionName, fusionVersionOfNotes, FUSION_CURRENT } from '../src/pointForecast/fusion/fusionRelease.ts';
import {
  GLACIER_WEATHER_DAYS, GLACIER_WEATHER_HOURS, GLACIER_WEATHER_NOTE, GLACIER_WEATHER_WIND_NOTE, GLACIER_WEATHER_OMIT_NEIGHBOUR, GLACIER_WEATHER_FRESH_MS,
  glacierWeatherRunPath, glacierWeatherHourlyPath, weatherProblems, weatherHourlyProblems,
  GLACIER_WEATHER_SNOWLINE_HOURS, GLACIER_WEATHER_PHASE_PATH, GLACIER_WEATHER_PHASE_LIMIT, GLACIER_WEATHER_PHASE_MIN_DAYS, GLACIER_WEATHER_PHASE_KEEP_DAYS,
  GLACIER_WEATHER_SPREAD_K, GLACIER_WEATHER_SPREAD_RHO, phaseVerdict, weatherSnowProblems, weatherHourlySnowProblems,
} from '../src/glacier/glacierWeatherContract.ts';
import { weatherView, compassOf } from '../src/glacier/glacierWeatherView.ts';
import { glacierWeatherFrom, GLACIER_WEATHER_LIVE } from '../src/glacier/glacierFlag.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const clone = (x) => JSON.parse(JSON.stringify(x));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FX = J(join(HERE, 'lib', 'fixtures', 'glacier', 'weather-extract.json'));
const tmp = mkdtempSync(join(tmpdir(), 'glacier-weather-'));

// --- A: contract on the real extract, with negative controls ------------------------------------------------------------------------
{
  const d0 = weatherProblems(FX.daily), h0 = weatherHourlyProblems(FX.hourly, FX.daily);
  const own = FX.daily.glaciers.findIndex((r) => r.f === 'own'), nb = FX.daily.glaciers.findIndex((r) => r.f !== 'own');
  add('A1 Echter Ausschnitt (Lauf am lokalen Cube): Tagesdokument und Stunden-Chunk bestehen den Vertrag; zwei Zeilen mit eigenem, zwei mit fremdem Antrieb',
    d0.length === 0 && h0.length === 0 && FX.daily.glaciers.filter((r) => r.f === 'own').length === 2 && FX.daily.glaciers.filter((r) => r.f !== 'own').length === 2, JSON.stringify({ d0, h0 }));
  const mut = (fn) => { const d = clone(FX.daily); fn(d); return weatherProblems(d).length > 0; };
  const cases = {
    'Herkunft measured': (d) => { d.origin = 'measured'; },
    'Name passt nicht zum Stand': (d) => { d.engine.name = `buscosun Fusion ${d.engine.version + 1}`; },
    'Stand fehlt': (d) => { delete d.engine.version; },
    'Vermerk Hochgebirge fehlt': (d) => { d.verified.highElevation = true; },
    'Summen mit Spanne': (d) => { d.rules.sums = 'scenarios'; },
    'Minimum über Maximum': (d) => { d.glaciers[own].tn[1][0] = d.glaciers[own].tx[1][0] + 1; },
    'Temperatur nicht auf 0,1': (d) => { d.glaciers[own].tx[2][3] += 0.04; },
    'Wind nicht ganzzahlig': (d) => { d.glaciers[own].w[0] += 0.5; },
    'Neuschnee über Niederschlag': (d) => { d.glaciers[own].sn[1][2] = d.glaciers[own].p[2] + 1; },
    'Tag fehlt': (d) => { d.glaciers[own].c.pop(); },
    'fremder Antrieb mit Wind': (d) => { d.glaciers[nb].w = d.glaciers[own].w; },
    'fremder Antrieb ohne Grund': (d) => { delete d.glaciers[nb].omit; },
    'eigener Antrieb mit Auslassung': (d) => { d.glaciers[own].omit = GLACIER_WEATHER_OMIT_NEIGHBOUR; },
    'Null in der Temperatur': (d) => { d.glaciers[nb].tn[0][5] = null; },
    'doppelte Zeile': (d) => { d.glaciers.push(d.glaciers[own]); },
    'übersprungen ohne Grund': (d) => { d.skipped.push({ id: 'x', reason: '' }); },
  };
  const missed = Object.entries(cases).filter(([, fn]) => !mut(fn)).map(([k]) => k);
  add(`A2 Negativkontrollen des Tagesvertrags: jede von ${Object.keys(cases).length} Verletzungen wird gemeldet`, missed.length === 0, `nicht gemeldet: ${missed.join(', ')}`);
  const hm = (fn) => { const d = clone(FX.hourly); fn(d); return weatherHourlyProblems(d, FX.daily).length > 0; };
  const idOwn = FX.daily.glaciers[own].id, idNb = FX.daily.glaciers[nb].id;
  const hc = {
    'anderer Lauf': (d) => { d.run = '2020010100'; },
    'anderer Stand': (d) => { d.engine.version += 1; d.engine.name = `buscosun Fusion ${d.engine.version}`; },
    'Region nicht im Tagesdokument': (d) => { d.region = 'xx-nirgends'; },
    'Stunde fehlt': (d) => { d.glaciers[idOwn].t[1].pop(); },
    'fremder Antrieb mit Niederschlag': (d) => { d.glaciers[idNb].p = d.glaciers[idOwn].p; },
    'Schneeanteil über 100': (d) => { d.glaciers[idOwn].s[0] = 101; },
    'Zeile ohne Tageszeile': (d) => { d.glaciers.fremd = d.glaciers[idNb]; },
  };
  const hMissed = Object.entries(hc).filter(([, fn]) => !hm(fn)).map(([k]) => k);
  add(`A3 Negativkontrollen des Stundenvertrags: jede von ${Object.keys(hc).length} Verletzungen wird gemeldet`, hMissed.length === 0, `nicht gemeldet: ${hMissed.join(', ')}`);
}

// --- B: band temperature against a hand calculation ---------------------------------------------------------------------------------
{
  const n = 336, fill = (v) => new Float64Array(n).fill(v);
  // 5 °C at 3000 m, freezing level 4000 m ⇒ lapse 5 K / 1000 m = 0.005 K/m ⇒ 2800 m: 6.0 °C, 3400 m: 3.0 °C
  const f = { t: fill(5), zRef: 3000, fz: fill(4000) };
  const lo = tempAt(f, 2800), hi = tempAt(f, 3400), mid = tempAt(f, 3000);
  // −2 °C: no usable freezing level above ⇒ standard lapse 0.0065 K/m ⇒ 3400 m: −2 − 0.0065 · 400 = −4.6 °C
  const g = { t: fill(-2), zRef: 3000, fz: fill(NaN) };
  const cold = tempAt(g, 3400);
  const w = weatherOfGlacier({ id: 'x', z: [2800, 3000, 3400], tz: [lo, mid, hi], from: 'n', p: fill(0), n: fill(0), wx: null });
  add('B1 Bandtemperatur, Handrechnung: 5 °C in 3000 m mit Nullgradgrenze 4000 m ⇒ 6,0 °C in 2800 m und 3,0 °C in 3400 m; −2 °C ohne Nullgradgrenze ⇒ Standardgradient, −4,6 °C in 3400 m; die Zeile trägt genau diese Werte',
    near(lo[0], 6, 1e-9) && near(hi[0], 3, 1e-9) && near(mid[0], 5, 1e-12) && near(cold[0], -4.6, 1e-9) && w.row.tn[0][0] === 6 && w.row.tx[2][13] === 3 && w.row.tn[1][7] === 5,
    `${lo[0]} ${hi[0]} ${cold[0]} ${JSON.stringify([w.row.tn[0][0], w.row.tx[2][13]])}`);
}

// --- C: phase split = the rule of the melt core --------------------------------------------------------------------------------------
{
  const pts = [[2, 0], [0, 1], [1, 0.5], [-5, 1], [3, 0], [1.5, 0.25]];
  add('C1 Schneeanteil: 0 bei 2 °C und wärmer, 1 bei 0 °C und kälter, linear dazwischen (1 °C ⇒ 0,5; 1,5 °C ⇒ 0,25)', pts.every(([t, f]) => near(solidFraction(t), f, 1e-12)) && MELT.fsWarm === 2 && MELT.fsCold === 0, JSON.stringify(pts.map(([t]) => solidFraction(t))));
  const n = 336, t = Float64Array.from({ length: n }, (_, i) => 1 + 2.5 * Math.sin(i / 5)), p = Float64Array.from({ length: n }, (_, i) => (i % 7 === 0 ? 1.3 : 0.2));
  // the melt core accumulates snow per band; ONE band at the reference elevation, no factor, no melt ⇒ its snow water is Σ p · share(T)
  const sim = simulate({ bands: { zb: [3000], w: [1] }, ela: 2900, t, g: new Float64Array(n), p, zT: 3000, zP: 3000, pf: 1, TF: 0, SRF: 0, state: emptyState(1), accumulateOnly: true });
  const wx = { w: new Float64Array(n).fill(3), g: new Float64Array(n).fill(5), g10: new Float64Array(n).fill(4), g90: new Float64Array(n).fill(6), d: new Float64Array(n).fill(NaN), t10: Float64Array.from(t, (v) => v - 1), t90: Float64Array.from(t, (v) => v + 1), sl: new Float64Array(n).fill(NaN) };
  const w = weatherOfGlacier({ id: 'x', z: [3000, 3000, 3000], tz: [t, t, t], from: 'own', p, n: new Float64Array(n).fill(0.4), wx });
  const sum = w.row.sn[1].reduce((a, b) => a + b, 0), pSum = w.row.p.reduce((a, b) => a + b, 0);
  add('C2 Neuschnee je Tag = Niederschlag × Schneeanteil aus der Bandtemperatur: die Summe über 14 Tage trifft den Schneezuwachs des Schmelzkerns (ein Band, ohne Faktor) auf die Rundung genau, und sie liegt unter der Niederschlagssumme (Gegenprobe: nicht einfach der Niederschlag)',
    near(sum, sim.state.swe[0], 14 * 0.05 + 1e-9) && sum < pSum - 5, `Zeile ${sum} Kern ${sim.state.swe[0]} Niederschlag ${pSum}`);
  add('C3 Windrichtung: mit der Geschwindigkeit gewichtetes Vektormittel (350° und 10° ⇒ 0°, nicht 180°); unter 6 Stunden mit Richtung kein Wert', prevailingDir(Float64Array.from([350, 10, 350, 10, 350, 10]), Float64Array.from([5, 5, 5, 5, 5, 5]), 0, 6) === 0 && prevailingDir(Float64Array.from([350, 10, NaN, NaN, NaN, NaN]), Float64Array.from([5, 5, 5, 5, 5, 5]), 0, 6) === null);
}

// --- D: melt.mjs end to end with a stubbed Fusion in the real data shape -------------------------------------------------------------
const NOW = Date.parse('2026-10-10T04:30:00Z');
const T0 = Math.floor(NOW / H) * H;
const RUN = '2026101004';
const mkTree = (root) => {
  const data = join(root, 'data'), cube = join(root, 'cube'), build = '20261011-9', region = 'ch-test';
  mkdirSync(join(data, 'static', build, 'hypso'), { recursive: true });
  mkdirSync(join(cube, 'point'), { recursive: true });
  mkdirSync(join(data, 'melt'), { recursive: true });
  const cat = [
    { id: 'gl_ch_alpha', name: 'Alpha', country: 'CH', region, klass: 'A', area: { km2: 3 }, z: [2400, 2600, 2800], lat: 46.5, lon: 8.4, lead: true },
    { id: 'gl_ch_beta', name: 'Beta', country: 'CH', region, klass: 'B', area: { km2: 0.5 }, z: [2500, 2700, 2900], lat: 46.52, lon: 8.45 },
    { id: 'gl_ch_gamma', name: 'Gamma', country: 'CH', region, klass: 'C', area: { km2: 0.05 }, z: [2600, 2800, 3000], lat: 46.51, lon: 8.42 },
    { id: 'gl_ch_far', name: 'Far', country: 'CH', region: 'ch-far', klass: 'C', area: { km2: 0.05 }, z: [2600, 2800, 3000], lat: 46.0, lon: 9.9 },
  ];
  writeFileSync(join(data, 'static', build, 'catalog.json'), JSON.stringify({ build, glaciers: cat }));
  const hyp = (z0) => ({ z0, a: [0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1], zr: [z0, z0 + 400], cov: 1 });
  writeFileSync(join(data, 'static', build, 'hypso', `${region}.json`), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region, bandM: 50, glaciers: { gl_ch_alpha: hyp(2400), gl_ch_beta: hyp(2500), gl_ch_gamma: hyp(2600) } }));
  writeFileSync(join(data, 'static', build, 'hypso', 'ch-far.json'), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region: 'ch-far', bandM: 50, glaciers: { gl_ch_far: hyp(2600) } }));
  writeFileSync(join(data, 'index.json'), JSON.stringify({ schema: 1, static: { build }, updatedAt: '2026-10-10T00:00:00Z' }));
  writeFileSync(join(cube, 'point', 'index.json'), JSON.stringify({ latestByTier: { t1: { run: '2026101003' }, t2: { run: '2026101000' }, t3: { run: '2026101000' } } }));
  writeFileSync(join(root, 'cal.json'), JSON.stringify({ schema: 1, fit: { pf: 1.2, TF: 0.05, SRF: 0.008 }, gate: { unit: false, reason: 'Test' }, report: 'test' }));
  return { data, cube, cal: join(root, 'cal.json'), ids: cat.map((g) => g.id) };
};
/** A Fusion answer in the shape measured at a glacier point: 337 hourly steps, quantiles for t2m/wind/gust/precip/clct, a direction at part of the hours, the snowfall line hourly for two days and three-hourly up to day 5. */
const synthFc = ({ notes, noWind = false } = {}) => ({
  cube: {
    notes: notes ?? [fusionStageNote(fusionStage(), '')], cells: [],
    v2: {
      point: { hTrue: 2700 },
      provenance: { runs: { t1: { run: '2026101003' }, t2: { run: '2026101000' }, t3: { run: '2026101000' }, stations: { run: '2026101003' } } },
      axis: { steps: Array.from({ length: 337 }, (_, i) => {
        const t = 1 + 3 * Math.sin((2 * Math.PI * ((i + 6) % 24)) / 24) - 0.005 * i, w = 4 + 2 * Math.sin(i / 9), g = w + 3 + (i % 5);
        const q = (m, s) => ({ mean: m, p10: m - 1.28 * s, p50: m, p90: m + 1.28 * s, sigma: s });
        return {
          validAtMs: T0 + i * H, leadH: i, tier: i < 47 ? 't1' : i < 121 ? 't2' : 't3', interpolated: false,
          vars: {
            t2m: q(t, 1.5), precip: q(i % 6 === 0 ? 0.8 : 0.05, 0.1), clct: q(40 + 30 * Math.sin(i / 11), 20),
            wind: noWind ? null : q(w, 1), gust: noWind ? null : q(g, 2), windDir: i < 40 || i % 5 === 0 ? { mean: (200 + i) % 360, p10: null, p90: null, sigma: null } : null,
            snowline: i < 47 || (i < 116 && i % 3 === 0) ? { mean: 2100 + 3 * i, p10: null, p90: null, sigma: null } : null,
          },
        };
      }) },
    },
  },
});
const okIo = () => ({ clima: async () => ({}), store: null });
const run = (tr, out, extra = {}) => main({ data: tr.data, cube: tr.cube, out, calibration: tr.cal, now: new Date(NOW).toISOString(), forecast: async () => synthFc(), ioFactory: okIo, always: true, ...extra });

const root1 = join(tmp, 't1'), tr1 = mkTree(root1), out1 = join(root1, 'out');
const r1 = await run(tr1, out1);
const dailyPath = join(out1, glacierWeatherRunPath(RUN));
const doc = existsSync(dailyPath) ? J(dailyPath) : null;
const chunk = (region) => { const f = join(out1, glacierWeatherHourlyPath(RUN, region)); return existsSync(f) ? J(f) : null; };
const by = Object.fromEntries((doc?.glaciers ?? []).map((r) => [r.id, r]));
{
  const patch = J(join(root1, 'patch', 'index-patch.json')), status = J(join(root1, 'patch', 'status-patch.json'));
  const chTest = chunk('ch-test'), chFar = chunk('ch-far');
  add('D1 Lauf Ende zu Ende: Tagesdokument unter melt/wx/<Lauf>.json und je Region ein Stunden-Chunk unter melt/wx/<Lauf>/<Region>.json, beide bestehen den Vertrag (mit Katalog), der Zeiger `weather` steht im Index-Patch, die Statuszeile nennt Zeilen, Dateien und Bytes',
    doc && r1.run === RUN && weatherProblems(doc, new Set(tr1.ids)).length === 0 && chTest && chFar && weatherHourlyProblems(chTest, doc).length === 0 && weatherHourlyProblems(chFar, doc).length === 0
    && JSON.stringify(doc.regions) === JSON.stringify(['ch-far', 'ch-test']) && patch.weather?.run === RUN && patch.melt?.run === RUN && status.lines.weather.glaciers === 4 && status.lines.weather.files === 3 && status.lines.weather.bytes > 0,
    JSON.stringify({ run: r1.run, weather: r1.weather, problems: doc ? weatherProblems(doc, new Set(tr1.ids)).slice(0, 3) : 'kein Dokument' }));
  const g = by.gl_ch_gamma, a = by.gl_ch_alpha, far = by.gl_ch_far, hg = chTest?.glaciers.gl_ch_gamma, ha = chTest?.glaciers.gl_ch_alpha;
  const wxKeys = ['tq', 'w', 'gx', 'wd', 'p', 'sn', 'c', 'sl', 'pq', 'snq', 'gq'];
  add('D2 Klasse C mit dem Antrieb des Nachbarn: nur die Temperatur an den eigenen Höhen, Wind, Niederschlag, Neuschnee, Bewölkung, Schneefallgrenze und alle Spannen fehlen mit benanntem Grund (auch im Stunden-Chunk, dort auch Schneefallgrenze und Neuschnee je Stunde); der Nachbar selbst und der Gletscher mit eigenem Punkt tragen alles (Gegenprobe)',
    g && g.f === 'gl_ch_alpha' && g.omit === GLACIER_WEATHER_OMIT_NEIGHBOUR && JSON.stringify(Object.keys(g)) === '["id","z","f","tn","tx","omit"]' && JSON.stringify(Object.keys(hg)) === '["t"]'
    && JSON.stringify(g.z) === '[2625,2800,2975]' && g.tn[1][0] !== a.tn[1][0]
    && a.f === 'own' && wxKeys.every((k) => Array.isArray(a[k])) && ['t', 'w', 'g', 'd', 'p', 's', 'c', 'sl', 'sn'].every((k) => Array.isArray(ha[k])) && far.f === 'own' && Array.isArray(far.w),
    JSON.stringify({ gamma: g && { f: g.f, omit: g.omit, keys: Object.keys(g), z: g.z }, hg: hg && Object.keys(hg) }));
  add('D3 Richtung und Schneefallgrenze nur, wo die Antwort sie trägt: Richtung an Tagen mit mindestens 6 Stunden (Tag 0 ja, Tag 13 mit 5 Stunden nein), Schneefallgrenze in den ersten fünf Tagen, danach null — nie ein aufgefüllter Wert',
    a.wd[0] != null && a.wd[13] === null && a.sl.slice(0, 4).every((v) => v != null) && a.sl.slice(5).every((v) => v === null) && ha.d.filter((v) => v === null).length > 0,
    JSON.stringify({ wd: a.wd, sl: a.sl }));
}
{
  // the answer names another stand than the code's current one ⇒ the document carries THAT stand
  const notes = [fusionStageNote(fusionStage((r) => r.n === FUSION_CURRENT), '')];
  const v = fusionVersionOfNotes(notes);
  const root = join(tmp, 't2'), tr = mkTree(root);
  await run(tr, join(root, 'out'), { forecast: async () => synthFc({ notes }) });
  const d = J(join(root, 'out', glacierWeatherRunPath(RUN)));
  const src = ['src/glacier/GlacierWeatherCard.tsx', 'src/glacier/glacierWeatherContract.ts', 'src/glacier/glacierWeatherView.ts', 'scripts/glacier/lib/weathercore.mjs'].map((f) => readFileSync(join(HERE, '..', f), 'utf8'));
  add('D4 Name des Stands kommt aus der Antwort: eine Antwort des vorigen Stands ergibt dessen Namen im Dokument (nicht den aktuellen des Codes), der Lauf mit dem aktuellen Stand nennt diesen; Karte, Vertrag und Kern enthalten keine feste Nummer von buscosun Fusion',
    Number.isInteger(v) && v !== FUSION_CURRENT && d.engine.version === v && d.engine.name === fusionName(v) && d.engine.stageCurrent === false
    && doc.engine.version === FUSION_CURRENT && doc.engine.name === fusionName(FUSION_CURRENT) && src.every((s) => !/Fusion \d/.test(s)) && /daily!\.engine\.name/.test(src[0]),
    JSON.stringify({ v, engine: d.engine, current: doc.engine }));
}
{
  const root = join(tmp, 't3'), tr = mkTree(root);
  const r = await run(tr, join(root, 'out'), { forecast: async () => synthFc({ notes: [] }) });
  const status = J(join(root, 'patch', 'status-patch.json')), patch = J(join(root, 'patch', 'index-patch.json'));
  add('D5 Antwort ohne benannten Stand: kein Wetterdokument (nichts unter melt/wx), der Grund steht in der Statuszeile, kein Zeiger im Index-Patch — der Schmelzlauf selbst ist geschrieben',
    !existsSync(join(root, 'out', 'melt', 'wx')) && /Stand/.test(status.lines.weather.error) && patch.weather === undefined && patch.melt.run === RUN && existsSync(join(root, 'out', 'melt', `${RUN}.json`)) && r.weather.error,
    JSON.stringify({ weather: r.weather, status: status.lines.weather }));
}
{
  const root = join(tmp, 't4'), tr = mkTree(root);
  await run(tr, join(root, 'out'), { forecast: async (o) => synthFc({ noWind: Math.abs(o.lat - 46.52) < 1e-6 }) });
  const d = J(join(root, 'out', glacierWeatherRunPath(RUN))), ch = J(join(root, 'out', glacierWeatherHourlyPath(RUN, 'ch-test')));
  const melt = J(join(root, 'out', 'melt', `${RUN}.json`));
  add('D6 Fehlender Wind an einem Gletscher: er wird mit Grund übersprungen (few-hours:wind), bekommt weder Tages- noch Stundenzeile und nirgends einen Ersatzwert; die anderen bleiben, seine Schmelzzeile auch',
    d.skipped.some((s) => s.id === 'gl_ch_beta' && s.reason === 'few-hours:wind') && !d.glaciers.some((r) => r.id === 'gl_ch_beta') && ch.glaciers.gl_ch_beta === undefined && d.glaciers.length === 3
    && !JSON.stringify(d.glaciers).includes('null,null,null,null,null,null,null,null,null,null,null,null,null,null') && melt.glaciers.some((r) => r.id === 'gl_ch_beta'),
    JSON.stringify({ skipped: d.skipped, rows: d.glaciers.map((r) => r.id) }));
}
{
  const root = join(tmp, 't5'), tr = mkTree(root);
  await run(tr, join(root, 'out'), { weather: '0' });
  const a = readFileSync(join(out1, 'melt', `${RUN}.json`), 'utf8'), b = readFileSync(join(root, 'out', 'melt', `${RUN}.json`), 'utf8');
  const sA = readFileSync(join(out1, 'melt', 'state.json'), 'utf8'), sB = readFileSync(join(root, 'out', 'melt', 'state.json'), 'utf8');
  const ctl = await (async () => { const rr = join(tmp, 't5c'), t = mkTree(rr); await run(t, join(rr, 'out'), { weather: '0', forecast: async () => { const f = synthFc(); f.cube.v2.axis.steps.forEach((s) => { s.vars.t2m.mean += 0.5; }); return f; } }); return readFileSync(join(rr, 'out', 'melt', `${RUN}.json`), 'utf8'); })();
  add('D7 Funktionserhalt: Schmelzdokument und Zustand sind mit und ohne Wetter Byte für Byte gleich; mit --weather=0 entsteht nichts unter melt/wx; Negativkontrolle: eine um 0,5 K wärmere Antwort ändert das Schmelzdokument',
    a === b && sA === sB && !existsSync(join(root, 'out', 'melt', 'wx')) && existsSync(join(out1, 'melt', 'wx')) && ctl !== a, `gleich ${a === b} Zustand ${sA === sB} Kontrolle ${ctl !== a}`);
}
{
  const root = join(tmp, 't6'), tr = mkTree(root);
  const old = { '2026100622': false, '2026100705': true, '2026100916': true };   // 78 h, 71 h, 12 h before the run
  for (const id of Object.keys(old)) { mkdirSync(join(tr.data, 'melt', 'wx', id), { recursive: true }); writeFileSync(join(tr.data, 'melt', 'wx', `${id}.json`), '{}'); writeFileSync(join(tr.data, 'melt', 'wx', id, 'ch-test.json'), '{}'); }
  await run(tr, join(root, 'out'));
  const kept = readdirSync(join(root, 'out', 'melt', 'wx')).sort();
  add('D8 Aufbewahrung 72 h: der Lauf von vor 78 h fällt heraus (Dokument und Chunk-Ordner), die von vor 71 h und 12 h bleiben, der neue kommt dazu',
    Object.entries(old).every(([id, keep]) => kept.includes(`${id}.json`) === keep && kept.includes(id) === keep) && kept.includes(`${RUN}.json`) && kept.includes(RUN) && existsSync(join(root, 'out', 'melt', 'wx', '2026100705', 'ch-test.json')), kept.join(' '));
  let outside = false;
  mkdirSync(join(root, 'bad', 'weather'), { recursive: true }); writeFileSync(join(root, 'bad', 'weather', 'x.json'), '{}');
  try { checkPackage('melt', join(root, 'bad')); } catch { outside = true; }
  let pkg = null; try { pkg = checkPackage('melt', join(root, 'out')); } catch (e) { pkg = { error: String(e.message) }; }
  add('D9 Pfade: alles liegt unter dem Präfix der Schmelzlinie — der Paketwächter des Publishers nimmt den Ausgabebaum an (keine Änderung an Publisher oder Workflow nötig); Gegenprobe: eine Datei unter weather/ lehnt er ab',
    pkg && !pkg.error && pkg.files.some((f) => f === glacierWeatherRunPath(RUN)) && pkg.files.some((f) => f === glacierWeatherHourlyPath(RUN, 'ch-test')) && outside
    && glacierWeatherRunPath('2026110411') === 'melt/wx/2026110411.json' && glacierWeatherHourlyPath('2026110411', 'at-dachstein') === 'melt/wx/2026110411/at-dachstein.json', JSON.stringify(pkg?.error ?? pkg?.files?.slice(0, 6)));
}

// --- E: daily values recomputed from the hourly rows of the real run ------------------------------------------------------------------
{
  const bad = [];
  for (const r of FX.daily.glaciers) {
    const h = FX.hourly.glaciers[r.id];
    for (let d = 0; d < GLACIER_WEATHER_HOURS / 24; d++) {
      const sl = (a) => a.slice(24 * d, 24 * d + 24), sum = (a) => a.reduce((x, y) => x + y, 0);
      for (let lv = 0; lv < 3; lv++) { if (Math.min(...sl(h.t[lv])) !== r.tn[lv][d] || Math.max(...sl(h.t[lv])) !== r.tx[lv][d]) bad.push(`${r.id} T Ebene ${lv} Tag ${d}`); }
      if (r.f !== 'own') continue;
      if (!near(sum(sl(h.w)) / 24, r.w[d], 1)) bad.push(`${r.id} Wind Tag ${d}`);
      if (Math.max(...sl(h.g)) !== r.gx[d]) bad.push(`${r.id} Böe Tag ${d}`);
      if (!near(sum(sl(h.p)), r.p[d], 24 * 0.05 + 0.05)) bad.push(`${r.id} Niederschlag Tag ${d}: ${sum(sl(h.p))} gegen ${r.p[d]}`);
      const snow = sl(h.p).reduce((x, v, i) => x + (v * sl(h.s)[i]) / 100, 0);
      if (!near(snow, r.sn[1][d], 24 * 0.05 + 0.005 * sum(sl(h.p)) + 0.1)) bad.push(`${r.id} Neuschnee Tag ${d}: ${snow} gegen ${r.sn[1][d]}`);
      if (!near(sum(sl(h.c)) / 24, r.c[d], 1)) bad.push(`${r.id} Bewölkung Tag ${d}`);
    }
  }
  const ctl = (() => { const r = clone(FX.daily.glaciers.find((x) => x.f === 'own')); r.gx[0] += 3; return Math.max(...FX.hourly.glaciers[r.id].g.slice(0, 24)) !== r.gx[0]; })();
  add('E1 Echter Lauf: die Tageswerte der ersten zwei Tage folgen aus den Stundenzeilen — Minimum/Maximum je Höhe und stärkste Böe exakt, Wind, Niederschlag, Neuschnee und Bewölkung innerhalb der Rundung; Negativkontrolle: eine um 3 km/h verstellte Böe fällt auf',
    bad.length === 0 && ctl, bad.slice(0, 4).join('; '));
  const d = FX.daily;
  add('E2 Echter Lauf: Herkunft model, Vermerk „im Hochgebirge nicht nachgemessen“, Summen als Erwartungswert, Phasenregel des Schmelzkerns im Dokument; Neuschnee nur als Wasserwert (kein Zentimeterfeld)',
    d.origin === 'model' && d.verified.highElevation === false && d.verified.note === GLACIER_WEATHER_NOTE && d.rules.sums === 'expected' && d.rules.phase.warm === MELT.fsWarm && d.rules.phase.cold === MELT.fsCold && !/"cm"|snowCm|depth/.test(JSON.stringify(d)), JSON.stringify(d.rules));
}

// --- F: view rules of the card, flag, wording -----------------------------------------------------------------------------------------
{
  const runMs = Date.parse(FX.daily.runAt), id = FX.daily.glaciers[0].id;
  const ok = weatherView(FX.daily, id, runMs + 5 * H + 60_000), late = weatherView(FX.daily, id, runMs + 26 * H);
  const stale = weatherView(FX.daily, id, runMs + GLACIER_WEATHER_FRESH_MS + H), none = weatherView(null, id, runMs);
  const sk = weatherView(FX.daily, FX.daily.skipped[0].id, runMs + H), gone = weatherView(FX.daily, 'gl_xx_nirgends', runMs + H);
  add('F1 Karte: frischer Lauf ⇒ Zeile, Stunde und Tag ab Laufstunde; älter als 18 h ⇒ „Keine Daten“ mit Alter und Grenze (auch wenn die Zeile da ist); kein Dokument, übersprungener Gletscher (mit seinem Grund) und fehlende Zeile sagen es in Worten',
    'row' in ok && ok.hour === 5 && ok.day === 0 && 'why' in late && /26 Stunden alt \(Grenze 18 Stunden\)/.test(late.why) && 'why' in stale && 'why' in none && /nicht ladbar/.test(none.why)
    && 'why' in sk && /Höhenbänder/.test(sk.why) && 'why' in gone && /keine Zeile/.test(gone.why), JSON.stringify({ ok: 'row' in ok ? [ok.hour, ok.day] : ok, late, sk, gone }));
  const card = readFileSync(join(HERE, '..', 'src', 'glacier', 'GlacierWeatherCard.tsx'), 'utf8');
  const css = readFileSync(join(HERE, '..', 'src', 'glacier', 'glacierSheet.css'), 'utf8');
  add('F2 Schalter und Wortlaut: an (`GLACIER_WEATHER_LIVE`), `?glw=0` schaltet ab, `?glw=1` an; die Karte setzt die festen Sätze des Vertrags, zeigt kein „typisch ±“ (keine gemessene Zahl für den aktuellen Stand), kein Wort zu Begehbarkeit, Sicherheit oder Gefahr; Aufklapper mit 44 px Tippfläche; Kompass aus Grad',
    GLACIER_WEATHER_LIVE === true && glacierWeatherFrom('') === true && glacierWeatherFrom('?glw=0') === false && glacierWeatherFrom('?glw=1', false) === true
    && GLACIER_WEATHER_NOTE === 'Modell, im Hochgebirge noch nicht nachgemessen' && GLACIER_WEATHER_WIND_NOTE === 'freie Höhe, nicht die Gletscherfläche'
    && /GLACIER_WEATHER_NOTE/.test(card) && /GLACIER_WEATHER_WIND_NOTE/.test(card) && !/typisch/i.test(card) && !/begehbar|sicher|gefahr|gefährlich|warnung/i.test(card.replace(/^\s*(\/\/|\*|\/\*).*$/gm, ''))
    && /\.gl-wx-more > summary \{[^}]*min-height: 44px/.test(css) && compassOf(0) === 'N' && compassOf(225) === 'SW' && compassOf(359) === 'N' && compassOf(100) === 'O', '');
  const cells = (card.match(/data-origin="model"/g) ?? []).length, chips = (card.match(/<OriginChip origin="model"/g) ?? []).length;
  add('F3 Herkunft an jedem Wert: die Karte setzt data-origin="model" an Kennzahlen, Tabellenzellen und Zeilen und den Chip „Modell“ an Kopf, Kennzahlen und beiden Aufklappern', cells >= 6 && chips >= 4, `data-origin ${cells}, Chips ${chips}`);
}

// --- G: phase GS — snow fields from a REAL answer of buscosun Fusion ------------------------------------------------------------------
const AX = J(join(HERE, 'lib', 'fixtures', 'glacier', 'weather-answer.json'));
const AX_T0 = Date.parse(AX.t0);
const f64 = (a) => Float64Array.from(a, (v) => v ?? NaN);
/** The answer of the fixture as `melt.mjs` gets it (the values the weather core and the forcing read). */
const fcOf = (g) => ({
  cube: {
    notes: AX.notes, cells: [],
    v2: {
      provenance: { runs: AX.runs },
      axis: { steps: g.answer.h.map((h, i) => {
        const a = g.answer, v = (o, k) => o[k][i];
        return {
          validAtMs: AX_T0 + h * H, leadH: h, interpolated: !!a.interpolated[i],
          vars: {
            t2m: { mean: v(a.t2m, 'mean'), sigma: v(a.t2m, 'sigma'), p10: v(a.t2m, 'p10'), p90: v(a.t2m, 'p90') }, rh: { p50: v(a.rh, 'p50') },
            precip: { mean: v(a.precip, 'mean'), p10: v(a.precip, 'p10'), p90: v(a.precip, 'p90'), dist: v(a.precip, 'dist') }, clct: { mean: v(a.clct, 'mean') },
            wind: { mean: v(a.wind, 'mean') }, windDir: v(a.windDir, 'mean') == null ? null : { mean: v(a.windDir, 'mean') },
            gust: { mean: v(a.gust, 'mean'), p10: v(a.gust, 'p10'), p90: v(a.gust, 'p90') },
            snowline: v(a.snowline, 'mean') == null ? null : { mean: v(a.snowline, 'mean') }, pSnow: v(a.pSnow, 'mean') == null ? null : { mean: v(a.pSnow, 'mean') },
          },
        };
      }) },
    },
  },
});
/** The core on one glacier of the fixture, with the forcing the producer derived from the same answer. */
const coreOf = (g, extra = {}) => {
  const f = { t: f64(g.forcing.t), sg: f64(g.forcing.sg), p: f64(g.forcing.p), n: f64(g.forcing.n), fz: f64(g.forcing.fz), zRef: g.zRef };
  const tz = g.z.map((zz) => tempAt(f, zz)), wx = weatherSeriesOf(fcOf(g), { t0Ms: AX_T0, hours: AX.hours });
  return { f, tz, wx, out: weatherOfGlacier({ id: g.id, z: g.z, tz, from: 'own', p: f.p, n: f.n, wx, sg: f.sg, seed: 7, ...extra }) };
};
const OLD_ROW = ['id', 'z', 'f', 'tn', 'tx', 'tq', 'w', 'gx', 'wd', 'p', 'sn', 'c', 'sl'], OLD_HOURLY = ['t', 'w', 'g', 'd', 'p', 's', 'c'];
const pick = (o, keys) => JSON.stringify(Object.fromEntries(keys.map((k) => [k, o[k]])));
const [gHigh, gLow] = AX.glaciers;   // a glacier with long stretches without a snowfall line, and a low one with mixed phase
const cT = AX.glaciers.map((g) => coreOf(g, { phase: 'temperature' })), cP = AX.glaciers.map((g) => coreOf(g, { phase: 'psnow' }));
{
  const hoursWith = (g, k, sub = 'mean') => g.answer.h.filter((_, i) => g.answer[k][sub][i] != null);
  const shape = AX.glaciers.map((g) => {
    const sl = hoursWith(g, 'snowline'), ps = hoursWith(g, 'pSnow'), pd = hoursWith(g, 'precip', 'dist');
    return sl.filter((h) => h <= 46).length === 47 && sl.every((h) => h <= 115) && sl.filter((h) => h > 46).every((h) => (h - 49) % 3 === 0)
      && ps.filter((h) => h <= 245).length === 246 && ps.filter((h) => h > 245).every((h) => (h - 247) % 6 === 0) && ps.length < 336
      && pd.filter((h) => h <= 245).length === 246 && pd.length < 336 && hoursWith(g, 'precip', 'p90').length === 336 && hoursWith(g, 'gust', 'p10').length === 336 && hoursWith(g, 'gust', 'p90').length === 336;
  });
  add('G1 Echte Antwort (zwei Gletscher, Fixture aus `make-weather-answer-fixture.mjs`): Schneefallgrenze stündlich bis +46 h, danach nur an 3-Stunden-Schritten bis höchstens +115 h, dann keine; pSnow und Niederschlagsverteilung stündlich bis +245 h, danach nur an den 6-Stunden-Schritten; Niederschlag- und Böen-Quantile an allen 336 Stunden',
    shape.every(Boolean) && AX.glaciers.length === 2 && AX.hours === 336 && fusionVersionOfNotes(AX.notes) != null, JSON.stringify(shape));
  const same = AX.glaciers.map((g, i) => pick(cT[i].out.row, OLD_ROW) === pick(g.before.row, OLD_ROW) && pick(cT[i].out.hourly, OLD_HOURLY) === pick(g.before.hourly, OLD_HOURLY));
  const moved = pick(cP[1].out.row, OLD_ROW) !== pick(gLow.before.row, OLD_ROW);
  add(`G2 Funktionserhalt an der echten Antwort: mit der Regel „temperature“ sind alle alten Felder der Tages- und der Stundenzeile Byte für Byte die des Kerns vor der Phase (Commit ${AX.beforeFrom}); die Voreinstellung ist diese Regel; Negativkontrolle: mit „psnow“ ändern sie sich am tiefen Gletscher`,
    same.every(Boolean) && WEATHER_PHASE_DEFAULT === 'temperature' && weatherPhaseOf(undefined) === 'temperature' && moved && !!AX.beforeFrom, JSON.stringify({ same, moved }));
}
{
  const bad = [];
  let nulls = 0, vals = 0;
  for (const [i, g] of AX.glaciers.entries()) {
    const sl = cT[i].out.hourly.sl, at = new Map(g.answer.h.map((h, k) => [h, g.answer.snowline.mean[k]]));
    if (sl.length !== GLACIER_WEATHER_SNOWLINE_HOURS) bad.push(`${g.id}: Länge ${sl.length}`);
    for (let h = 0; h < sl.length; h++) {
      const v = at.get(h) ?? null;
      if (v == null ? sl[h] !== null : sl[h] !== Math.round(v / 10) * 10) bad.push(`${g.id} +${h} h: ${sl[h]} gegen ${v}`);
      if (sl[h] == null) nulls++; else vals++;
    }
  }
  const slH = cT[0].out.hourly.sl, gapH = slH.slice(47, 91);
  add('G3 Schneefallgrenze je Stunde (120 Werte): genau der Wert der Antwort auf 10 m, wo sie einen hat, sonst null — auch zwischen zwei 3-Stunden-Werten wird nichts aufgefüllt; am hohen Gletscher bleibt der Vorlauf +47 … +90 h ganz ohne Wert; das Tagesmittel ist das alte (G2)',
    bad.length === 0 && nulls > 0 && vals > 100 && gapH.every((v) => v === null) && slH.slice(0, 47).every((v) => v != null) && slH[91] != null && slH[92] === null && slH[93] === null && slH[94] != null,
    bad.slice(0, 4).join('; ') || JSON.stringify({ nulls, vals, gap: gapH.filter((v) => v != null).length }));
}
{
  const bad = [];
  const r2 = (x) => Math.round(x * 100) / 100 + 0;
  let wet = 0, split = 0;
  for (const [i] of AX.glaciers.entries()) {
    const { f, tz, out } = cT[i];
    for (let lv = 0; lv < 3; lv++) for (let h = 0; h < GLACIER_WEATHER_HOURS; h++) {
      const want = r2(Math.max(0, f.p[h]) * solidFraction(tz[lv][h]));
      if (out.hourly.sn[lv][h] !== want) bad.push(`+${h} h Ebene ${lv}: ${out.hourly.sn[lv][h]} gegen ${want}`);
      if (out.hourly.sn[lv][h] > out.hourly.p[h] + 0.06) bad.push(`+${h} h Ebene ${lv}: über dem Niederschlag`);
    }
    for (let h = 0; h < GLACIER_WEATHER_HOURS; h++) { if (out.hourly.sn[0][h] > out.hourly.sn[2][h] + 0.011) bad.push(`+${h} h: Zunge über Oberkante`); if (out.hourly.sn[2][h] > 0) wet++; }
    // the elevations differ where it is warm enough (in this run only later than the hourly window: counted on the daily sums)
    split += out.row.sn[0].filter((v, d) => v < out.row.sn[2][d] - 0.2).length;
    for (let d = 0; d < 2; d++) for (let lv = 0; lv < 3; lv++) {
      const s = out.hourly.sn[lv].slice(24 * d, 24 * d + 24).reduce((a, b) => a + b, 0);
      if (!near(s, out.row.sn[lv][d], 24 * 0.005 + 0.051)) bad.push(`Tag ${d} Ebene ${lv}: Stundensumme ${s} gegen ${out.row.sn[lv][d]}`);
    }
  }
  const txt = JSON.stringify([cT[0].out, cP[1].out]);
  add('G4 Neuschnee je Stunde an Zunge, Median und Oberkante (48 h, mm Wasserwert in 0,01): = Niederschlag × Schneeanteil der Höhe (nachgerechnet), nie über dem Niederschlag, an der Zunge nie mehr als oben; die Stundenwerte summieren sich innerhalb der Rundung zur Tagessumme; an wärmeren Tagen des Laufs fällt an der Zunge weniger als oben; kein Zentimeterfeld, keine Schneehöhe',
    bad.length === 0 && wet > 5 && split > 0 && !/"cm"|snowCm|depth|hs"/.test(txt), bad.slice(0, 4).join('; ') || JSON.stringify({ wet, split }));
}
{
  const { out, tz, f, wx } = cP[1], ps = gLow.answer.pSnow.mean, hIdx = new Map(gLow.answer.h.map((h, k) => [h, k]));
  const sAnswer = Array.from({ length: GLACIER_WEATHER_HOURS }, (_, h) => Math.round(100 * ps[hIdx.get(h)]));
  const mixed = sAnswer.filter((v) => v > 2 && v < 98).length;
  // one mixed hour with precipitation, by hand: share at the tongue = pSnow + phase function(T tongue) − phase function(T median)
  const sh = phaseShares({ rule: 'psnow', tz, sg: f.sg, rh: wx.rh, ps: wx.ps, p: f.p });
  let hand = null;
  for (let h = 0; h < 336 && !hand; h++) {
    const pm = wx.ps[h];
    if (!(f.p[h] > 0.05 && pm > 0.1 && pm < 0.9)) continue;
    const want = Math.min(1, Math.max(0, pm + phaseProbability(tz[0][h], f.sg[h], wx.rh[h]) - phaseProbability(tz[1][h], f.sg[h], wx.rh[h])));
    hand = { h, pm, tongue: sh.share[0][h], want, top: sh.share[2][h] };
  }
  const ordered = (() => { for (let h = 0; h < 336; h++) if (sh.share[0][h] > sh.share[1][h] + 1e-9 || sh.share[1][h] > sh.share[2][h] + 1e-9) return false; return true; })();
  let threw = false; try { weatherPhaseOf('schnee'); } catch { threw = true; }
  add('G5 Schalter der Phasenregel, beide Richtungen am Kern: „psnow“ ⇒ der Schneeanteil je Stunde in der Medianhöhe IST das pSnow der Antwort; an Zunge und Oberkante verschoben um die Differenz der Phasenfunktion des Motors (eine Mischstunde von Hand), Zunge ≤ Median ≤ Oberkante; „temperature“ ⇒ die alte Stundenreihe (G2); die Phasenfunktion fällt mit der Temperatur (−10 °C ⇒ Schnee, +8 °C ⇒ Regen); ein unbekanntes Wort ist ein Fehler, kein stiller Ersatz',
    JSON.stringify(out.hourly.s) === JSON.stringify(sAnswer) && mixed >= 3 && JSON.stringify(cT[1].out.hourly.s) === JSON.stringify(gLow.before.hourly.s) && JSON.stringify(out.hourly.s) !== JSON.stringify(gLow.before.hourly.s)
    && hand && near(hand.tongue, hand.want, 1e-12) && hand.tongue < hand.pm && hand.top >= hand.pm && ordered && sh.fallback === 0
    && phaseProbability(-10, 1, 80) > 0.99 && phaseProbability(8, 1, 80) < 0.01 && phaseProbability(0.5, 1, 80) > phaseProbability(1.5, 1, 80) && threw && weatherPhaseOf('psnow') === 'psnow',
    JSON.stringify({ mixed, hand, ordered, fallback: sh.fallback }));
  // hours without pSnow late in the run: linear between the 6-hour values, never beyond 6 hours
  const gap = phaseShares({ rule: 'psnow', tz, sg: f.sg, rh: wx.rh, ps: Float64Array.from(wx.ps, (v, h) => (h >= 100 && h < 120 ? NaN : v)), p: f.p });
  add('G6 Stunden ohne pSnow: zwischen den 6-Stunden-Werten spät im Lauf linear (kein Rückfall an der echten Antwort); eine Lücke von 20 Stunden wird nicht überbrückt — diese Stunden rechnen mit der Temperaturregel und werden gezählt; ohne jedes pSnow wird der Gletscher unter „psnow“ mit Grund übersprungen',
    sh.fallback === 0 && gap.fallback === 20 && near(gap.share[1][105], solidFraction(tz[1][105]), 1e-12)
    && weatherOfGlacier({ id: 'x', z: gLow.z, tz, from: 'own', p: f.p, n: f.n, wx: { ...wx, ps: new Float64Array(336).fill(NaN) }, sg: f.sg, phase: 'psnow' }).skip === 'few-hours:psnow', `Rückfall ${sh.fallback}/${gap.fallback}`);
}
{
  const { out, f, wx } = cT[1], row = out.row;
  const again = coreOf(gLow, { phase: 'temperature' }).out.row, other = coreOf(gLow, { phase: 'temperature', seed: 8 }).out.row;
  const ok = row.pq.length === 14 && row.pq.every((q) => q[0] <= q[1]) && row.snq.every((lv) => lv.every((q, d) => q[0] <= q[1] && q[1] <= row.pq[d][1] + 0.15)) && row.snq[0].every((q, d) => q[1] <= row.snq[2][d][1] + 0.15);
  // not a sum of hourly quantiles: on wet days the p90 of the day's sum is another number than the sum of the hourly p90 (above it where most
  // hours are dry in nine of ten cases, below it in steady precipitation)
  const p90h = gLow.answer.precip.p90, hIdx = new Map(gLow.answer.h.map((h, k) => [h, k]));
  const sumQ = Array.from({ length: 14 }, (_, d) => { let s = 0; for (let h = 24 * d; h < 24 * d + 24; h++) s += p90h[hIdx.get(h)] ?? 0; return s; });
  const wetDays = sumQ.map((s, d) => [s, d]).filter(([s]) => s >= 2), below = wetDays.filter(([s, d]) => row.pq[d][1] < s - 0.2).length, differs = wetDays.filter(([s, d]) => Math.abs(row.pq[d][1] - s) > 0.2).length;
  // the gust: p10/p90 of the hour with the strongest gust
  const gOk = row.gq.every((q, d) => {
    let at = 24 * d; for (let h = 24 * d; h < 24 * d + 24; h++) if (wx.g[h] > wx.g[at]) at = h;
    return q[0] === Math.min(Math.round(wx.g10[at] * 3.6), row.gx[d]) && q[1] === Math.max(Math.round(wx.g90[at] * 3.6), row.gx[d]) && q[0] <= row.gx[d] && row.gx[d] <= q[1] && q[0] < q[1];
  });
  // hand cases of the scenario sums: a certain 0.5 mm every hour ⇒ 12 mm a day in every scenario; cold ⇒ all of it snow, warm ⇒ none; always dry ⇒ 0
  const n = 336, fill = (v) => new Float64Array(n).fill(v), cold = [fill(-10), fill(-10), fill(-10)], warm = [fill(10), fill(10), fill(10)];
  const sure = new Array(n).fill({ kind: 'hurdleLogNormal', pDry: 0, mu: Math.log(0.5), sigma: 0 }), dry = new Array(n).fill({ kind: 'hurdleLogNormal', pDry: 1, mu: 0, sigma: 1 });
  const a = sumSpreads({ p: fill(0.5), pDist: sure, tz: cold, sg: fill(1), rule: 'temperature', seed: 3 }), b = sumSpreads({ p: fill(0.5), pDist: sure, tz: warm, sg: fill(1), rule: 'temperature', seed: 3 });
  const c = sumSpreads({ p: fill(0), pDist: dry, tz: cold, sg: fill(1), rule: 'temperature', seed: 3 });
  // a real spread: 50 % dry hours ⇒ p10 below, p90 above the expected 12 mm of the day (and the two differ)
  const half = sumSpreads({ p: fill(0.5), pDist: new Array(n).fill({ kind: 'hurdleLogNormal', pDry: 0.5, mu: 0, sigma: 0.3 }), tz: cold, sg: fill(1), rule: 'temperature', seed: 3 });
  add(`G7 Spanne der Tagessummen und der Böe: Niederschlag und Neuschnee als p10/p90 der Summen von ${GLACIER_WEATHER_SPREAD_K} Szenarien (Korrelation ${GLACIER_WEATHER_SPREAD_RHO}) — an der echten Antwort geordnet, Neuschnee nie über dem Niederschlag, an jedem nassen Tag eine andere Zahl als die Summe der Stunden-p90 (also keine Summe von Stundenquantilen); derselbe Lauf ergibt dieselben Zahlen, ein anderer Keim andere (Gegenprobe); Handfälle: sicher 0,5 mm je Stunde ⇒ [12, 12], kalt alles Schnee, warm keiner, immer trocken ⇒ [0, 0], halb trocken ⇒ p10 < p90; Böe = p10/p90 der Stunde mit der stärksten Böe und schließt sie ein`,
    ok && JSON.stringify(again) === JSON.stringify(row) && JSON.stringify(other.pq) !== JSON.stringify(row.pq) && pick(other, OLD_ROW) === pick(row, OLD_ROW) && wetDays.length >= 2 && below >= 1 && differs === wetDays.length && gOk
    && a.pq.every((q) => q[0] === 12 && q[1] === 12) && a.snq.every((lv) => lv.every((q) => q[0] === 12 && q[1] === 12)) && b.snq.every((lv) => lv.every((q) => q[0] === 0 && q[1] === 0)) && b.pq[0][1] === 12
    && c.pq.every((q) => q[0] === 0 && q[1] === 0) && half.pq.every((q) => q[0] < q[1]) && half.pq.some((q) => q[0] < 12 && q[1] > 12),
    JSON.stringify({ ok, wetDays: wetDays.length, below, gOk, a: a.pq[0], b: b.snq[1][0], c: c.pq[0], half: half.pq.slice(0, 3), pq: row.pq.slice(0, 4), sumQ: sumQ.slice(0, 4).map((v) => Math.round(v * 10) / 10) }));
  // a glacier on a neighbour's forcing: the temperature only, as before
  const tzN = [2000, 2100, 2300].map((zz) => tempAt({ ...f, zRef: gLow.zRef }, zz));
  const nb = weatherOfGlacier({ id: 'n', z: [2000, 2100, 2300], tz: tzN, from: gLow.id, p: f.p, n: f.n, wx, sg: f.sg, phase: 'psnow' });
  add('G8 Nachbar-Antrieb an der echten Antwort: die Zeile trägt nur Kennung, Höhen, Antrieb, Temperatur und den benannten Grund, die Stundenzeile nur die Temperatur — keines der neuen Felder, kein Vergleichsblock, unter beiden Regeln',
    JSON.stringify(Object.keys(nb.row)) === '["id","z","f","tn","tx","omit"]' && nb.row.omit === GLACIER_WEATHER_OMIT_NEIGHBOUR && JSON.stringify(Object.keys(nb.hourly)) === '["t"]' && nb.cmp === undefined, JSON.stringify(Object.keys(nb.row)));
}
// end to end with the real answer as the stubbed buscosun Fusion: the switch both ways, the old reader, the comparison file
const AX_NOW = AX.at, AX_RUN = AX.t0.replace(/[-:T]/g, '').slice(0, 10);
const runAx = async (name, extra = {}, prep = null) => {
  const root = join(tmp, name), tr = mkTree(root), out = join(root, 'out');
  if (prep) prep(tr);
  const res = await main({ data: tr.data, cube: tr.cube, out, calibration: tr.cal, now: AX_NOW, forecast: async () => fcOf(gLow), ioFactory: okIo, always: true, ...extra });
  const rd = (rel) => (existsSync(join(out, rel)) ? J(join(out, rel)) : null);
  return { root, tr, out, res, daily: rd(glacierWeatherRunPath(AX_RUN)), chunk: rd(glacierWeatherHourlyPath(AX_RUN, 'ch-test')), phase: rd(GLACIER_WEATHER_PHASE_PATH), status: J(join(root, 'patch', 'status-patch.json')), raw: (rel) => readFileSync(join(out, rel), 'utf8') };
};
const eT = await runAx('g-temp'), eP = await runAx('g-psnow', { phase: 'psnow' });
{
  const ids = new Set(eT.tr.ids);
  const valid = (e) => e.daily && e.chunk && weatherProblems(e.daily, ids).length === 0 && weatherHourlyProblems(e.chunk, e.daily).length === 0 && weatherSnowProblems(e.daily).length === 0 && weatherHourlySnowProblems(e.chunk, e.daily).length === 0;
  const a = eT.daily?.glaciers.find((r) => r.id === 'gl_ch_alpha'), b = eP.daily?.glaciers.find((r) => r.id === 'gl_ch_alpha');
  const ha = eT.chunk?.glaciers.gl_ch_alpha, hb = eP.chunk?.glaciers.gl_ch_alpha;
  process.env.GLACIER_WEATHER_PHASE = 'psnow';
  const eEnv = await runAx('g-env');
  delete process.env.GLACIER_WEATHER_PHASE;
  const eBad = await runAx('g-bad', { phase: 'schnee' });
  add('G9 Schalter Ende zu Ende (echte Antwort als Fusion-Stub): ohne Angabe nennt das Dokument die Regel „temperature“, mit --phase=psnow „psnow“, und Schneeanteil und Neuschnee unterscheiden sich; die Umgebungsvariable GLACIER_WEATHER_PHASE ergibt Byte für Byte dasselbe wie der Schalter; ein unbekanntes Wort schreibt kein Wetterdokument, nennt den Grund in der Statuszeile und lässt den Schmelzlauf stehen; beide Regeln bestehen den Vertrag; das Schmelzdokument ist unter beiden Regeln dasselbe',
    valid(eT) && valid(eP) && eT.daily.rules.phase.rule === 'temperature' && eP.daily.rules.phase.rule === 'psnow' && eT.daily.rules.phase.warm === MELT.fsWarm && eT.daily.rules.sums === 'expected'
    && eT.daily.rules.spread.sums === 'scenarios' && eT.daily.rules.spread.k === GLACIER_WEATHER_SPREAD_K && JSON.stringify(ha.s) !== JSON.stringify(hb.s) && JSON.stringify(a.sn) !== JSON.stringify(b.sn) && JSON.stringify(a.p) === JSON.stringify(b.p)
    && eEnv.raw(glacierWeatherRunPath(AX_RUN)) === eP.raw(glacierWeatherRunPath(AX_RUN)) && eEnv.raw(glacierWeatherHourlyPath(AX_RUN, 'ch-test')) === eP.raw(glacierWeatherHourlyPath(AX_RUN, 'ch-test'))
    && !existsSync(join(eBad.out, 'melt', 'wx')) && /schnee/.test(eBad.status.lines.weather.error) && existsSync(join(eBad.out, 'melt', `${AX_RUN}.json`))
    && eT.raw(`melt/${AX_RUN}.json`) === eP.raw(`melt/${AX_RUN}.json`) && eT.raw(`melt/${AX_RUN}.json`) === eBad.raw(`melt/${AX_RUN}.json`),
    JSON.stringify({ t: eT.daily?.rules, problems: eT.daily ? weatherProblems(eT.daily, ids).slice(0, 3) : 'kein Dokument', bad: eBad.status.lines.weather }));
  // the reader of the page before the phase (frozen copy of the contract) on the NEW documents, and the new reader on the OLD document
  const oldOk = (e) => oldWeatherProblems(e.daily, ids).length === 0 && oldWeatherHourlyProblems(e.chunk, e.daily).length === 0;
  const ctl = (() => { const d = clone(eT.daily); d.rules.sums = 'scenarios'; return oldWeatherProblems(d, ids).length > 0; })();
  const view = weatherView(eT.daily, 'gl_ch_alpha', Date.parse(AX_NOW) + H);
  add('G10 Alter Leser, neues Dokument — und umgekehrt: der Vertragsprüfer der Seite vor der Phase (eingefrorene Kopie) nimmt die neuen Tages- und Stundendokumente unter beiden Regeln an, die Kartenregel findet die Zeile; die zwei Prüfer, die die Seite aufruft, sind Zeichen für Zeichen die von vorher (die Schneefelder prüfen zwei eigene Funktionen); Negativkontrolle: hieße die Summenregel nicht mehr „expected“, verwürfe er das Dokument; das alte Dokument (ohne Regel der Spanne, ohne Phasenwort, ohne neue Felder) besteht den neuen Vertrag',
    oldOk(eT) && oldOk(eP) && ctl && 'row' in view && weatherProblems(FX.daily).length === 0 && weatherHourlyProblems(FX.hourly, FX.daily).length === 0
    && weatherSnowProblems(FX.daily).length === 0 && weatherHourlySnowProblems(FX.hourly, FX.daily).length === 0
    && weatherProblems.toString() === oldWeatherProblems.toString() && weatherHourlyProblems.toString() === oldWeatherHourlyProblems.toString()
    && FX.daily.rules.spread === undefined && FX.daily.rules.phase.rule === undefined && FX.daily.glaciers.every((r) => r.pq === undefined) && Object.values(FX.hourly.glaciers).every((r) => r.sl === undefined && r.sn === undefined),
    JSON.stringify({ old: oldWeatherProblems(eT.daily, ids).slice(0, 3), oldH: oldWeatherHourlyProblems(eT.chunk, eT.daily).slice(0, 3), ctl }));
  // negative controls of the new contract rules
  const own = eT.daily.glaciers.findIndex((r) => r.f === 'own'), nbI = eT.daily.glaciers.findIndex((r) => r.f !== 'own');
  const idOwn = eT.daily.glaciers[own].id, idNb = eT.daily.glaciers[nbI].id;
  const dCases = {
    'Spanne verkehrt herum': (d) => { d.glaciers[own].pq[0] = [2, 1]; },
    'Neuschnee-Spanne über der des Niederschlags': (d) => { d.glaciers[own].snq[1][0] = [0, d.glaciers[own].pq[0][1] + 1]; },
    'Spanne an der Zunge über der oben': (d) => { d.glaciers[own].pq[0] = [0, 50]; d.glaciers[own].snq[0][0] = [0, 40]; d.glaciers[own].snq[2][0] = [0, 20]; },
    'Böen-Spanne ohne die stärkste Böe': (d) => { d.glaciers[own].gq[0] = [d.glaciers[own].gx[0] + 5, d.glaciers[own].gx[0] + 9]; },
    'Spanne ohne benannte Regel': (d) => { delete d.rules.spread; },
    'Regel ohne Spanne an der Zeile': (d) => { delete d.glaciers[own].gq; },
    'zu wenige Szenarien': (d) => { d.rules.spread.k = 5; },
    'unbekannte Phasenregel': (d) => { d.rules.phase.rule = 'schnee'; },
    'fremder Antrieb mit Spanne': (d) => { d.glaciers[nbI].pq = d.glaciers[own].pq; },
    'Tag fehlt in der Spanne': (d) => { d.glaciers[own].snq[2].pop(); },
  };
  const hCases = {
    'Schneefallgrenze mit falscher Länge': (d) => { d.glaciers[idOwn].sl.pop(); },
    'Schneefallgrenze nicht auf 10 m': (d) => { d.glaciers[idOwn].sl[0] = 2105; },
    'Neuschnee je Stunde über dem Niederschlag': (d) => { d.glaciers[idOwn].sn[2][0] = d.glaciers[idOwn].p[0] + 0.5; },
    'je Stunde mehr an der Zunge als oben': (d) => { d.glaciers[idOwn].p[1] = 1; d.glaciers[idOwn].sn[0][1] = 0.9; d.glaciers[idOwn].sn[2][1] = 0.3; },
    'Neuschnee nicht auf 0,01': (d) => { d.glaciers[idOwn].p[2] = 1; d.glaciers[idOwn].sn.forEach((lv) => { lv[2] = 0.123; }); },
    'fremder Antrieb mit Schneefallgrenze': (d) => { d.glaciers[idNb].sl = d.glaciers[idOwn].sl; },
    'fremder Antrieb mit Neuschnee': (d) => { d.glaciers[idNb].sn = d.glaciers[idOwn].sn; },
  };
  const dMiss = Object.entries(dCases).filter(([, fn]) => { const d = clone(eT.daily); fn(d); return weatherProblems(d, ids).length + weatherSnowProblems(d).length === 0; }).map(([k]) => k);
  const hMiss = Object.entries(hCases).filter(([, fn]) => { const d = clone(eT.chunk); fn(d); return weatherHourlyProblems(d, eT.daily).length + weatherHourlySnowProblems(d, eT.daily).length === 0; }).map(([k]) => k);
  add(`G11 Negativkontrollen der neuen Vertragsregeln: jede von ${Object.keys(dCases).length} Verletzungen am Tagesdokument und jede von ${Object.keys(hCases).length} am Stunden-Chunk wird gemeldet`, dMiss.length === 0 && hMiss.length === 0, `nicht gemeldet: ${[...dMiss, ...hMiss].join(', ')}`);
}
{
  // the comparison of the two rules: one line per run, the same numbers whichever rule is active, the verdict needs 7 days and the limit
  const eA = eT.phase?.runs?.[0], eB = eP.phase?.runs?.[0];
  const mkDoc = (days, f) => ({ schema: 1, kind: 'glacier/weather-phase', limit: GLACIER_WEATHER_PHASE_LIMIT, minDays: GLACIER_WEATHER_PHASE_MIN_DAYS, runs: Array.from({ length: days * 2 }, (_, i) => ({ run: `202611${String(10 + (i >> 1)).padStart(2, '0')}${i % 2 ? '17' : '05'}`, rule: 'temperature', n: 900, mm: { temperature: [1000, 2000, 3000], psnow: [1000 * f[0], 2000 * f[1], 3000 * f[2]] }, wet: 400, moved: 20, max: 3.2 })) });
  const v6 = phaseVerdict(mkDoc(6, [1.02, 1.01, 1])), v7 = phaseVerdict(mkDoc(7, [1.02, 1.01, 1])), vBad = phaseVerdict(mkDoc(7, [0.8, 1.01, 1])), vNone = phaseVerdict(null);
  const prev = mkDoc(7, [1.02, 1.01, 1]);
  prev.runs.unshift({ ...prev.runs[0], run: '2026101005' });   // older than the keep time ⇒ goes
  const grown = await runAx('g-cmp', {}, (tr) => { mkdirSync(join(tr.data, 'melt', 'wx'), { recursive: true }); writeFileSync(join(tr.data, GLACIER_WEATHER_PHASE_PATH), JSON.stringify(prev)); });
  const twice = phaseDocWith(grown.phase, { ...grown.phase.runs.at(-1), n: 1 }, Date.parse(AX_NOW));
  let pkg = null; try { pkg = checkPackage('melt', grown.out); } catch (e) { pkg = { error: String(e.message) }; }
  add(`G12 Vergleich der zwei Regeln: jeder Lauf schreibt eine Zeile nach ${GLACIER_WEATHER_PHASE_PATH} (Summe des Neuschnees je Höhe unter beiden Regeln, nasse Gletscher-Tage, verschobene Tage) — dieselben Zahlen, egal welche Regel der Lauf nutzt; die Datei wächst über die Läufe, Zeilen älter als ${GLACIER_WEATHER_PHASE_KEEP_DAYS} Tage fallen heraus, derselbe Lauf ersetzt seine Zeile; Urteil: 6 Tage reichen nicht, 7 Tage reichen, Grenze ${GLACIER_WEATHER_PHASE_LIMIT * 100} % je Höhe (Negativkontrolle: −20 % an der Zunge ⇒ nicht innerhalb); die Statuszeile nennt Regel und Urteil; die Datei liegt im Präfix der Schmelzlinie`,
    eA && eB && eA.run === AX_RUN && eA.rule === 'temperature' && eB.rule === 'psnow' && JSON.stringify(eA.mm) === JSON.stringify(eB.mm) && eA.n === 3 && eA.mm.temperature.every((v) => v > 0) && JSON.stringify(eA.mm.temperature) !== JSON.stringify(eA.mm.psnow) && eA.wet > 0
    && !v6.enough && v6.days === 6 && v7.enough && v7.within && v7.shift[0] === 0.02 && v7.movedShare === 0.05 && vBad.enough && !vBad.within && vBad.shift[0] === 0.2 && vNone.days === 0 && !vNone.enough
    && grown.phase.runs.length === 15 && grown.phase.runs.at(-1).run === AX_RUN && !grown.phase.runs.some((r) => r.run === '2026101005') && twice.runs.length === 15 && twice.runs.at(-1).n === 1
    && grown.status.lines.weather.phase.rule === 'temperature' && grown.status.lines.weather.phase.days === 8 && grown.status.lines.weather.phase.enough === true && eT.status.lines.weather.phase.days === 1 && eT.status.lines.weather.phase.enough === false
    && pkg && !pkg.error && pkg.files.includes(GLACIER_WEATHER_PHASE_PATH) && eT.status.lines.weather.files === 3,
    JSON.stringify({ eA, v6, v7, vBad, runs: grown.phase?.runs?.length, status: grown.status.lines.weather.phase, pkg: pkg?.error }));
}

rmSync(tmp, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-weather ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
