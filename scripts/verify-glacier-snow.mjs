#!/usr/bin/env node
/**
 * verify-glacier-snow.mjs — Phase GN (`audit/gletscher-snowgrid.md`): the snow analysis SNOWGRID per Austrian glacier as a product of
 * its own (`glacier/v1/snow/`), data only. No network: the answers in `scripts/lib/fixtures/glacier/snow/` are the byte-exact bodies
 * of the GeoSphere API (21.11.2026) for one small area at the main ridge of the Ötztal Alps; the glacier entries and outlines are a
 * real excerpt of the catalogue.
 *
 *   A  fixtures are byte-exact (sha256), with a negative control
 *   B  reader: days, cells, units (m → cm), a different unit stops the run
 *   C  cells per glacier: centre inside the outline, else the nearest cell with data; a glacier outside the grid
 *   D  climatology: percentiles of the reference years by hand, 29 February, too few years
 *   E  place of a value in the spread: a number, with flags outside every reference year
 *   F  daily run end to end: documents, pointer, missing day, value outside the limits, published once, revised, request cap, size limit
 *   G  coverage: Austria only — Swiss and German glaciers have no entry, and the document says so
 *   H  an analysis, never a measurement; no page reads the product; buscosun Fusion and `obs/v1` are not involved; the raster is not stored
 *   I  publisher line, pruning, no archive, workflow template, README
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-snow.mjs
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/glacier/glacierSnowContract.ts';
import { glacierForbiddenWords } from '../src/glacier/glacierContract.ts';
import { runSnowCells, runSnowClim, runSnowDay, snowCatalogUrl, snowGridUrl, snowOutlineUrl, snowReadme, SNOW_GRID_CELLS_PER_REQUEST } from './glacier/snow.mjs';
import { GLACIER_LINES, GLACIER_POLICIES, checkPackage, pruneList } from './glacier/glacier-publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FX = join(HERE, 'lib', 'fixtures', 'glacier', 'snow');
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (dir, base = dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split('\\').join('/')])) : []);
const thrown = async (fn) => { try { await fn(); return ''; } catch (e) { return String(e.message ?? e); } };
const tmp = mkdtempSync(join(tmpdir(), 'glacier-snow-'));
const DAY = 86_400_000;
/** Clock of the run: the evening of the recording. */
const NOW = Date.parse('2026-11-21T23:55:00Z');
const BUILD = '20261120-1';

// ── A: fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const FIXTURES = {
  'metadata.json': 'dcd9c1f985661fe379452e3f6e5450978a81dd69db76664c9bcb467f9db23ee8',
  'grid.json': '4c342bb1901be4733d386ce859a323f24b666f61bd45c7293b78a87dbcee019c',
  'week.json': 'f0f0a7dc667203acba43e8ea916f1aa958f1a88fc5d9fecaeb009fa006b08b8f',
  'ref.json': 'cccc6a1ad602a195d764101d3d0ade2695085b29f96066da388eed4bf68d8f68',
};
const REC = readJson(join(FX, 'recorded.json'));
{
  const got = Object.fromEntries(Object.keys(FIXTURES).map((f) => [f, sha(readFileSync(join(FX, f)))]));
  add('A1 die vier aufgezeichneten Antworten der GeoSphere-API (Metadaten, ein Tag des Rasters, eine Woche und die Referenzjahre der Zeitreihe) sind Byte für Byte die des Dienstes (sha256, dieselben Werte wie im Protokoll der Aufzeichnung); das Repo wandelt ihre Zeilenenden nicht um (`-text`)',
    Object.entries(FIXTURES).every(([f, h]) => got[f] === h && REC.files[f].sha256 === h && REC.files[f].bytes === readFileSync(join(FX, f)).length) && /^scripts\/lib\/fixtures\/glacier\/snow\/\*\* -text\r?$/m.test(src('.gitattributes')),
    JSON.stringify(got));
  add('A1 Gegenprobe: ein geändertes Byte ergibt einen anderen Hash', sha(Buffer.concat([readFileSync(join(FX, 'metadata.json')), Buffer.from(' ')])) !== FIXTURES['metadata.json']);
}
const META = readJson(join(FX, 'metadata.json')), GRID = readJson(join(FX, 'grid.json')), WEEK = readJson(join(FX, 'week.json')), REF = readJson(join(FX, 'ref.json'));
const EX = readJson(join(FX, 'glaciers.json'));
const outlineOf = (id) => { for (const f of Object.values(EX.outlines)) { const x = f.features.find((y) => y.properties.id === id); if (x) return x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates; } return undefined; };
const HEF = 'gl_at_hintereisferner-mit-toteis', HJF = 'gl_at_hochjoch-ferner', VWS = 'gl_at_vernaglwand-ferner-s';

// ── B: reader ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const week = S.parseSnowAnswer(WEEK), grid = S.parseSnowAnswer(GRID);
{
  const f0 = WEEK.features[0], s0 = week.series[0];
  add('B1 Leser der Zeitreihe: sieben Tage (14.–20.11.2026) als `yyyymmdd`, 14 Zellen mit ihrem Mittelpunkt; die Schneehöhe der Quelle steht in METERN und wird in cm geschrieben (0,30 m → 30 cm, 0,37 → 37), der Wasserwert in kg/m² bleibt in mm (57 → 57); die Metadaten nennen den neuesten Tag 20.11.2026',
    week.days.join() === '20261114,20261115,20261116,20261117,20261118,20261119,20261120' && week.series.length === 14 && f0.properties.parameters.snow_depth.unit === 'm' && f0.properties.parameters.snow_depth.data.join() === '0.3,0.28,0.28,0.28,0.28,0.35,0.37'
    && s0.hs.join() === '30,28,28,28,28,35,37' && s0.swe.join() === '57,57,57,58,58,64,66' && s0.key === S.snowCellKey(f0.geometry.coordinates[1], f0.geometry.coordinates[0]) && s0.key === '46.77486,10.82488'
    && S.snowEndDay(META) === '20261120' && S.snowCmOf(0.07) === 7 && S.snowCmOf(3.31) === 331 && S.snowIsoOf('20261120') === '2026-11-20' && S.snowDayOf('2026-11-20T00:00+00:00') === '20261120', `${week.days.join()} ${JSON.stringify(s0)}`);
  const otherUnit = clone(WEEK); otherUnit.features[0].properties.parameters.snow_depth.unit = 'cm';
  const otherTime = clone(WEEK); otherTime.timestamps[0] = '2026-11-14T06:00+00:00';
  const short = clone(WEEK); short.features[0].properties.parameters.swe_tot.data.pop();
  add('B2 der Leser rät nicht: eine andere Einheit (cm statt m), ein Zeitstempel, der kein Tagesstempel ist, eine Reihe mit weniger Werten als Tagen, eine Antwort ohne Punkte und Metadaten ohne `end_time` brechen ab — ein Lauf mit falscher Umrechnung schreibt nichts',
    /snow_depth in cm statt m/.test(await thrown(() => S.parseSnowAnswer(otherUnit))) && /unerwarteter Zeitstempel/.test(await thrown(() => S.parseSnowAnswer(otherTime))) && /6 Werten für 7 Tage/.test(await thrown(() => S.parseSnowAnswer(short)))
    && /ohne Zeitstempel oder Punkte/.test(await thrown(() => S.parseSnowAnswer({ detail: 'x' }))) && /ohne end_time/.test(await thrown(() => S.snowEndDay({}))));
  const nulls = GRID.features.filter((f) => f.properties.parameters.snow_depth.data[0] == null).length;
  add('B3 Raster: 90 Zellen im Ausschnitt, 36 davon ohne Wert (jenseits der Staatsgrenze) — der Leser gibt dort `null`, keine 0',
    grid.series.length === 90 && nulls === 36 && grid.series.filter((c) => c.hs[0] === null).length === 36 && grid.series.filter((c) => c.hs[0] === 0).length === 0 && grid.days.join() === '20261120', `${grid.series.length}/${nulls}`);
}

// ── C: cells per glacier ───────────────────────────────────────────────────────────────────────────────────────────────
const gridCells = grid.series.filter((c) => c.hs[0] != null).map((c) => ({ lat: c.lat, lon: c.lon }));
const glaciersIn = EX.glaciers.map((g) => ({ id: g.id, region: g.region, lat: g.lat, lon: g.lon, outline: outlineOf(g.id) }));
const cellsDoc = S.buildSnowCells(glaciersIn, gridCells, { file: `${BUILD}.1`, build: BUILD, builtAt: new Date(NOW).toISOString(), gridDay: '20261120' });
// a glacier outside the grid: the Hochjochferner moved across the border, onto the cell without a value that lies furthest from every cell with one
const hj = glaciersIn.find((g) => g.id === HJF);
const RAD = Math.PI / 180, kmOf = (a, b) => Math.hypot((b.lon - a.lon) * RAD * Math.cos(a.lat * RAD), (b.lat - a.lat) * RAD) * 6371;
const empty = grid.series.filter((c) => c.hs[0] === null).map((c) => ({ c, d: Math.min(...gridCells.map((g) => kmOf(c, g))) })).sort((a, b) => b.d - a.d)[0];
const dLat = empty.c.lat - hj.lat, dLon = empty.c.lon - hj.lon;
const moved = { ...hj, id: 'gl_at_verschoben', lat: hj.lat + dLat, lon: hj.lon + dLon, outline: hj.outline.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + dLon, y + dLat]))) };
{
  const hef = cellsDoc.glaciers[HEF], vws = cellsDoc.glaciers[VWS];
  const valued = new Set(gridCells.map((c) => S.snowCellKey(c.lat, c.lon)));
  add('C1 Zellen am echten Auszug (sechs Gletscher am Hintereisferner): zwei Gletscher haben Zellen, deren Mittelpunkt im Umriss liegt (Hintereisferner, Hochjochferner — jede dieser Zellen liegt wirklich im Umriss), vier kleine bekommen die nächste Zelle zum Katalogpunkt (höchstens 1 km, mit Abstand); zusammen 14 Zellen — dieselbe Zählung wie bei der Aufzeichnung; keine Zelle ohne Wert wird benutzt',
    JSON.stringify(cellsDoc.report) === JSON.stringify({ glaciers: 6, outline: 2, nearest: 4, outside: 0, cells: 14 }) && JSON.stringify(cellsDoc.report) === JSON.stringify(REC.cells) && hef.how === 'outline' && hef.cells.length >= 4
    && hef.cells.every((c) => S.snowInOutline(outlineOf(HEF), c[0], c[1])) && cellsDoc.glaciers[HJF].how === 'outline' && vws.how === 'nearest' && vws.cells.length === 1 && vws.km <= S.SNOW_NEAREST_MAX_KM && vws.km > 0
    && cellsDoc.cells.every((c) => valued.has(S.snowCellKey(c[0], c[1]))) && S.snowCellsProblems(cellsDoc).length === 0 && Object.values(cellsDoc.glaciers).every((e) => e.region === 'at-oetztaler-alpen'),
    `${JSON.stringify(cellsDoc.report)} HEF ${hef.cells.length} Zellen, VWS ${vws.km} km`);
  const withMoved = S.buildSnowCells([...glaciersIn, moved], gridCells, { file: `${BUILD}.1`, build: BUILD, builtAt: 'x', gridDay: '20261120' });
  const allCells = grid.series.map((c) => ({ lat: c.lat, lon: c.lon }));
  const ifNullsCounted = S.buildSnowCells([moved], allCells, { file: `${BUILD}.1`, build: BUILD, builtAt: 'x', gridDay: '20261120' });
  add('C2 Gletscher außerhalb des Gitters: derselbe Hochjochferner, über die Grenze auf eine Zelle ohne Wert verschoben (die nächste Zelle mit Wert liegt über 1 km entfernt), hat im Umkreis von 1 km keine Zelle mit Wert — er steht unter `outside` mit dem Grund und bekommt keinen Eintrag; die sechs echten bleiben unverändert. Gegenprobe: zählte man die Zellen ohne Wert mit, bekäme er welche',
    !('gl_at_verschoben' in withMoved.glaciers) && withMoved.outside.length === 1 && withMoved.outside[0][0] === 'gl_at_verschoben' && /keine Zelle mit Wert/.test(withMoved.outside[0][1]) && withMoved.report.outside === 1
    && JSON.stringify(withMoved.glaciers[HJF]) === JSON.stringify(cellsDoc.glaciers[HJF]) && 'gl_at_verschoben' in ifNullsCounted.glaciers && empty.d > S.SNOW_NEAREST_MAX_KM, `${JSON.stringify(withMoved.outside)} nächste Zelle mit Wert ${empty.d.toFixed(2)} km`);
  const noOutline = S.buildSnowCells([{ ...glaciersIn.find((g) => g.id === HEF), outline: undefined }], gridCells, { file: `${BUILD}.1`, build: BUILD, builtAt: 'x', gridDay: 'x' });
  const broken = clone(cellsDoc); broken.glaciers[VWS].km = 3;
  const lost = clone(cellsDoc); lost.cells.pop();
  add('C3 Regeln der Zellendatei: ohne Umriss gilt die nächste Zelle (eine, mit Abstand); eine „nächste“ Zelle weiter als 1 km, eine Zelle, die in der Liste fehlt, und ein Dateiname, der nicht zum Build passt, werden bemerkt',
    noOutline.glaciers[HEF].how === 'nearest' && noOutline.glaciers[HEF].cells.length === 1 && S.snowCellsProblems(broken).some((x) => /zu weit/.test(x)) && S.snowCellsProblems(lost).some((x) => /fehlt in der Liste/.test(x))
    && S.snowCellsProblems({ ...cellsDoc, file: '20260101-1.1' }).some((x) => /Dateiname/.test(x)) && S.SNOW_NEAREST_MAX_KM === 1);
}

// ── mocks of the services ──────────────────────────────────────────────────────────────────────────────────────────────
const asked = [];
const weekUrl = REC.files['week.json'].url, refUrl = REC.files['ref.json'].url, gridUrl = REC.files['grid.json'].url;
/** `week` = what the time-series request of the week answers; `catalog` = glaciers of the catalogue. */
const getOf = ({ weekDoc = WEEK, meta = META, catalog = EX.glaciers, fail = false, extraOutlines = [] } = {}) => async (url) => {
  asked.push(url);
  if (fail) throw new Error('HTTP 503');
  if (url === S.SNOWGRID_METADATA_URL) return meta;
  if (url === snowCatalogUrl(BUILD)) return { schema: 1, kind: 'glacier/catalog', build: BUILD, glaciers: catalog };
  for (const [region, doc] of Object.entries(EX.outlines)) if (url === snowOutlineUrl(BUILD, region)) return { ...doc, features: [...doc.features, ...extraOutlines] };
  if (url.startsWith(S.SNOWGRID_GRID_URL)) return GRID;
  if (url === refUrl) return REF;
  if (url === weekUrl) return weekDoc;
  throw new Error(`unerwartete Adresse ${url.slice(0, 200)}`);
};
const mkStore = (name, { cells = true, clim = false } = {}) => {
  const d = join(tmp, name); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: BUILD } }));
  if (cells) { mkdirSync(join(d, S.GLACIER_SNOW_CELLS_DIR), { recursive: true }); writeFileSync(join(d, S.glacierSnowCellsPath(`${BUILD}.1`)), JSON.stringify(cellsDoc) + '\n'); }
  if (clim) cpSync(join(climOut, S.GLACIER_SNOW_CLIM_DIR), join(d, S.GLACIER_SNOW_CLIM_DIR), { recursive: true });
  return d;
};

// ── D: climatology ─────────────────────────────────────────────────────────────────────────────────────────────────────
const climOut = join(tmp, 'clim-out');
const resClim = await runSnowClim({ storeDir: mkStore('store-clim'), outDir: climOut, nowMs: NOW, get: getOf(), pauseMs: 0 });
const climDoc = readJson(join(climOut, S.glacierSnowClimPath(`${BUILD}.1`, 'at-oetztaler-alpen')));
const ref = S.parseSnowAnswer(REF);
{
  const refAt = new Map(ref.days.map((d, i) => [d, i]));
  // by hand, for a glacier with ONE cell: the 30 values of a calendar day, sorted, percentiles by linear interpolation
  const cell = cellsDoc.glaciers[VWS].cells[0], ser = ref.series.find((x) => x.key === S.snowCellKey(cell[0], cell[1])).hs;
  const yearsOf = (mmdd) => Array.from({ length: 30 }, (_, i) => ser[refAt.get(`${1991 + i}${mmdd}`)]);
  const pct = (vals) => { const s = [...vals].sort((a, b) => a - b); return [0, 10, 25, 50, 75, 90, 100].map((p) => { const x = (p / 100) * (s.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return Math.round(s[lo] + (s[hi] - s[lo]) * (x - lo)); }); };
  const row1120 = climDoc.hs[VWS][climDoc.days.indexOf('1120')];
  add('D1 Klimatologie aus der echten Antwort der Referenzjahre (ein Abruf für 14 Zellen × 10 958 Tage, unter dem Limit von 1 000 000 Werten; die Adresse ist die der Aufzeichnung): je Gletscher 366 Kalendertage × sieben Stützwerte (0, 10, 25, 50, 75, 90, 100 %) in cm; von Hand nachgerechnet für den 20.11. an einem Gletscher mit einer Zelle — dieselben sieben Zahlen',
    resClim.requests === 1 && asked.filter((u) => u === refUrl).length === 1 && resClim.days === 10958 && ref.days.length === 10958 && 14 * 10958 < S.SNOWGRID_MAX_VALUES_PER_REQUEST && resClim.glaciers === 6
    && Object.keys(climDoc.hs).length === 6 && Object.values(climDoc.hs).every((rows) => rows.length === 366 && rows.every((r) => Array.isArray(r) && r.length === 7 && r.every(Number.isInteger) && r.every((x, i) => i === 0 || x >= r[i - 1])))
    && JSON.stringify(row1120) === JSON.stringify(pct(yearsOf('1120'))) && yearsOf('1120').length === 30 && climDoc.ref.join() === '1991,2020' && climDoc.pcts.join() === '0,10,25,50,75,90,100' && climDoc.unit === 'cm' && climDoc.file === `${BUILD}.1`
    && S.SNOW_REF_YEARS.join() === '1991,2020' && climDoc.days.length === 366 && climDoc.days[0] === '0101' && climDoc.days[59] === '0229' && climDoc.days[365] === '1231',
    `${JSON.stringify(row1120)} gegen ${JSON.stringify(pct(yearsOf('1120')))}`);
  // 29 February by hand: the day itself in leap years, else the mean of 28 Feb and 1 Mar
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const feb29 = Array.from({ length: 30 }, (_, i) => { const y = 1991 + i; return leap(y) ? ser[refAt.get(`${y}0229`)] : (ser[refAt.get(`${y}0228`)] + ser[refAt.get(`${y}0301`)]) / 2; });
  const onlyLeap = feb29.filter((_, i) => leap(1991 + i));
  const row0229 = climDoc.hs[VWS][59];
  const vOf = (y, mmdd) => { const i = refAt.get(`${y}${mmdd}`); return i == null ? null : ser[i]; };
  add('D2 Klimatologie am 29. Februar: der Tag trägt 30 Werte wie jeder andere — in den acht Schaltjahren der Referenz der 29.02. selbst, sonst das Mittel aus 28.02. und 01.03. desselben Jahres (von Hand nachgerechnet, dieselben sieben Zahlen). Gegenprobe: nur aus den acht Schaltjahren gerechnet ergäbe eine andere Zeile, und ein Kalendertag mit weniger als 20 Jahren trägt gar keine',
    JSON.stringify(row0229) === JSON.stringify(pct(feb29)) && onlyLeap.length === 8 && JSON.stringify(pct(onlyLeap)) !== JSON.stringify(row0229) && S.snowRefValues(vOf, '0229').length === 30 && S.snowRefValues(vOf, '0228').length === 30
    && S.snowRefValues((y, mmdd) => (mmdd === '0229' ? vOf(y, mmdd) : null), '0229').length === 8 && S.snowClimRow(onlyLeap) === null && S.snowClimRow(feb29).length === 7 && refAt.get('19920229') != null && refAt.get('19910229') == null,
    `${JSON.stringify(row0229)} · nur Schaltjahre ${JSON.stringify(pct(onlyLeap))}`);
  // a glacier with several cells: the mean over its cells per day, then the percentiles
  const hefCells = cellsDoc.glaciers[HEF].cells.map((c) => ref.series.find((x) => x.key === S.snowCellKey(c[0], c[1])).hs);
  const hefYears = Array.from({ length: 30 }, (_, i) => { const k = refAt.get(`${1991 + i}0301`); return hefCells.reduce((a, s) => a + s[k], 0) / hefCells.length; });
  add('D3 ein Gletscher mit mehreren Zellen: erst je Tag das Mittel seiner Zellen, dann die Stützwerte über die Jahre (Hintereisferner, 01.03., von Hand); die Perzentil-Funktion interpoliert linear (Median von 1, 2, 3, 10 ist 2,5)',
    JSON.stringify(climDoc.hs[HEF][climDoc.days.indexOf('0301')]) === JSON.stringify(pct(hefYears)) && hefCells.length === cellsDoc.glaciers[HEF].cells.length && S.snowPercentile([1, 2, 3, 10], 50) === 2.5 && S.snowPercentile([5], 90) === 5 && S.snowPercentile([0, 10], 25) === 2.5,
    JSON.stringify(climDoc.hs[HEF][climDoc.days.indexOf('0301')]));
}

// ── E: place ───────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const row = [20, 40, 60, 100, 140, 180, 260];
  const p = (v, r = row) => S.snowPlace(v, r);
  add('E1 Lage eines Werts in der Spanne als ZAHL 0–100: genau auf einem Stützwert dessen Prozentzahl (100 cm → 50), dazwischen linear (80 cm zwischen 60 und 100 → 38; 30 cm zwischen 20 und 40 → 5), monoton; unter dem kleinsten Wert aller Referenzjahre 0 mit `below`, über dem größten 100 mit `above` — sonst kein Kennzeichen und nie ein Wort',
    p(100).place === 50 && p(80).place === 38 && p(30).place === 5 && p(20).place === 0 && !p(20).below && p(260).place === 100 && !p(260).above && JSON.stringify(p(19)) === JSON.stringify({ place: 0, below: true }) && JSON.stringify(p(261)) === JSON.stringify({ place: 100, above: true })
    && Array.from({ length: 300 }, (_, v) => p(v).place).every((x, i, a) => i === 0 || x >= a[i - 1]) && Object.keys(p(80)).join() === 'place' && typeof p(80).place === 'number',
    `${p(80).place} ${p(30).place} ${JSON.stringify(p(19))}`);
  const flat = [0, 0, 0, 0, 5, 20, 40];
  add('E2 flache Stelle (Sommer: mehrere Stützwerte gleich): 0 cm bei einer Zeile 0, 0, 0, 0, 5, 20, 40 liegt in der Mitte der Stützwerte, die den Wert teilen (25), nicht bei 0 und nicht bei 50; 3 cm liegt zwischen 50 und 75',
    p(0, flat).place === 25 && !p(0, flat).below && p(3, flat).place === 65 && p(41, flat).above === true && p(0, [0, 0, 0, 0, 0, 0, 0]).place === 50, `${p(0, flat).place} ${p(3, flat).place}`);
}

// ── F: daily run ───────────────────────────────────────────────────────────────────────────────────────────────────────
const store1 = mkStore('store1', { clim: true }), out1 = join(tmp, 'out1'), patch1 = join(tmp, 'patch1');
const a0 = asked.length;
const res1 = await runSnowDay({ storeDir: store1, outDir: out1, patchDir: patch1, nowMs: NOW, get: getOf(), pauseMs: 0 });
const day1 = readJson(join(out1, 'snow', '20261120.json'));
{
  const reqs = asked.slice(a0);
  const files = walk(out1).sort();
  add('F1 ein Lauf aus den Aufzeichnungen: zwei Abrufe (Metadaten, EINE Zeitreihe für alle 14 Zellen und sieben Tage — die Adresse ist Zeichen für Zeichen die der Aufzeichnung), der Baum liegt nur unter `snow/` (sieben Tagesdokumente 14.–20.11. und die README); jedes Dokument besteht die eigenen Regeln',
    reqs.join(' ') === [S.SNOWGRID_METADATA_URL, weekUrl].join(' ') && res1.requests === 2 && files.join() === 'snow/20261114.json,snow/20261115.json,snow/20261116.json,snow/20261117.json,snow/20261118.json,snow/20261119.json,snow/20261120.json,snow/README.md'
    && files.filter((f) => /\d{8}\.json$/.test(f)).every((f) => S.snowDayProblems(readJson(join(out1, f))).length === 0) && res1.written.length === 7 && res1.day === '20261120' && res1.sourceEnd === '20261120',
    `${reqs.length} Abrufe | ${files.join()}`);
  // by hand: the Hintereisferner on 20.11. = mean over its cells of the raw answer (m → cm), its place from the climatology row of 20.11.
  const i = week.days.indexOf('20261120');
  const raw = cellsDoc.glaciers[HEF].cells.map((c) => WEEK.features.find((f) => S.snowCellKey(f.geometry.coordinates[1], f.geometry.coordinates[0]) === S.snowCellKey(c[0], c[1])).properties.parameters);
  const hs = Math.round(raw.reduce((a, p) => a + Math.round(p.snow_depth.data[i] * 100), 0) / raw.length), swe = Math.round(raw.reduce((a, p) => a + p.swe_tot.data[i], 0) / raw.length);
  const row = climDoc.hs[HEF][climDoc.days.indexOf('1120')], pl = S.snowPlace(hs, row);
  const r = day1.glaciers[HEF];
  add('F2 das Tagesdokument: je Gletscher `[Schneehöhe cm, Wasserwert mm, Lage, Kennzeichen]` — Hintereisferner am 20.11. von Hand: das Mittel seiner Zellen aus der rohen Antwort (m × 100), die Lage aus seiner Zeile der Klimatologie für den 20.11.; sechs Gletscher, keiner fehlt; das Dokument nennt Quelle, Lizenz, DOI, Einheiten, Grenzen, die Zellendatei und die Klimatologie',
    JSON.stringify(r) === JSON.stringify([hs, swe, pl.place, pl.below ? -1 : pl.above ? 1 : 0]) && raw.length === cellsDoc.glaciers[HEF].cells.length && day1.count === 6 && day1.missing.length === 0 && day1.cols.join() === 'hs,swe,place,flag'
    && day1.source.licence === 'CC BY 4.0' && day1.source.doi === 'https://doi.org/10.60669/fsxx-6977' && day1.source.note === 'GeoSphere Austria' && day1.cells === `${BUILD}.1` && day1.clim === `${BUILD}.1` && day1.ref.join() === '1991,2020'
    && day1.limits.hs.join() === '0,1500' && /cm/.test(day1.unit.hs) && /mm/.test(day1.unit.swe) && day1.day === '20261120', `${JSON.stringify(r)} von Hand ${JSON.stringify([hs, swe, pl])}`);
  const idx = readJson(join(patch1, 'index-patch.json')), st = readJson(join(patch1, 'status-patch.json'));
  add('F3 Zeiger und Status: `index.snow` nennt den neuesten Tag, die Zahl der Gletscher, Zellendatei und Klimatologie; der Status nennt das Ende der Quelle, die Zahl der Abrufe und was geschrieben wurde; kein anderer Schlüssel des Zeigers wird berührt',
    JSON.stringify(idx) === JSON.stringify({ snow: { day: '20261120', builtAt: new Date(NOW).toISOString(), n: 6, cells: `${BUILD}.1`, clim: `${BUILD}.1` } }) && st.lines.snow.sourceEnd === '20261120' && st.lines.snow.requests === 2
    && st.lines.snow.written.length === 7 && st.lines.snow.revised.length === 0 && st.lines.snow.noData.length === 0 && Object.keys(st.lines).join() === 'snow' && !('stale' in st.lines.snow), JSON.stringify(idx));
}
// second run on a store that holds the days: published once; a later difference of the source is reported, not written
{
  const store2 = mkStore('store2', { clim: true });
  cpSync(join(out1, 'snow'), join(store2, 'snow'), { recursive: true });
  writeFileSync(join(store2, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: BUILD }, snow: readJson(join(patch1, 'index-patch.json')).snow }));
  const res2 = await runSnowDay({ storeDir: store2, outDir: join(tmp, 'out2'), patchDir: join(tmp, 'patch2'), nowMs: NOW + 5 * 3_600_000, get: getOf(), pauseMs: 0 });
  const p2 = readJson(join(tmp, 'patch2', 'index-patch.json')).snow;
  // the source now says 5 cm more on 18.11. at one cell of the Hintereisferner
  const changed = clone(WEEK); const cHef = cellsDoc.glaciers[HEF].cells[0];
  const fHef = changed.features.find((f) => S.snowCellKey(f.geometry.coordinates[1], f.geometry.coordinates[0]) === S.snowCellKey(cHef[0], cHef[1]));
  fHef.properties.parameters.snow_depth.data[4] = Math.round((fHef.properties.parameters.snow_depth.data[4] + 0.3) * 100) / 100;
  const before = readFileSync(join(store2, 'snow', '20261118.json'));
  const res3 = await runSnowDay({ storeDir: store2, outDir: join(tmp, 'out3'), patchDir: join(tmp, 'patch3'), nowMs: NOW + 6 * 3_600_000, get: getOf({ weekDoc: changed }), pauseMs: 0 });
  add('F4 ein Tag wird EINMAL veröffentlicht: ein zweiter Lauf auf einem Speicher, der die Woche hält, schreibt kein Tagesdokument, der Zeiger nennt weiter die veröffentlichte Fassung (deren `builtAt`). Liefert die Quelle später für einen veröffentlichten Tag etwas anderes (Hintereisferner, 18.11., +30 cm an einer Zelle), bleibt die Datei Byte für Byte, und der Tag steht mit der Zahl der betroffenen Gletscher unter `revised` — Gegenprobe: ohne Änderung ist `revised` leer',
    res2.written.length === 0 && res2.held.length === 7 && walk(join(tmp, 'out2')).length === 0 && p2.day === '20261120' && p2.builtAt === new Date(NOW).toISOString() && res2.revised.length === 0
    && JSON.stringify(res3.revised) === JSON.stringify([['20261118', 1]]) && res3.written.length === 0 && Buffer.compare(before, readFileSync(join(store2, 'snow', '20261118.json'))) === 0
    && JSON.stringify(readJson(join(tmp, 'patch3', 'status-patch.json')).lines.snow.revised) === JSON.stringify([['20261118', 1]]), `${JSON.stringify(res2.revised)} | ${JSON.stringify(res3.revised)}`);
  // a store that holds 14.–18.11.: the run adds 19. and 20.
  const store4 = mkStore('store4', { clim: true });
  mkdirSync(join(store4, 'snow'), { recursive: true });
  for (const d of ['20261114', '20261115', '20261116', '20261117', '20261118']) cpSync(join(out1, 'snow', `${d}.json`), join(store4, 'snow', `${d}.json`));
  const res4 = await runSnowDay({ storeDir: store4, outDir: join(tmp, 'out4'), patchDir: join(tmp, 'patch4'), nowMs: NOW, get: getOf(), pauseMs: 0 });
  add('F5 Nachholen: hält der Speicher die Tage bis zum 18.11., schreibt der Lauf genau den 19. und den 20.11. — nicht mehr und nichts doppelt',
    res4.written.map((x) => x[0]).join() === '20261119,20261120' && walk(join(tmp, 'out4')).filter((f) => /\d{8}\.json$/.test(f)).join() === 'snow/20261119.json,snow/20261120.json' && S.SNOW_BACKFILL_DAYS === 7, JSON.stringify(res4.written));
}
// missing day, value outside the limits
{
  // the source carries the stamp of 20.11. but no value yet (every cell null on the last day)
  const noLast = clone(WEEK); for (const f of noLast.features) for (const q of Object.values(f.properties.parameters)) q.data[6] = null;
  const resM = await runSnowDay({ storeDir: mkStore('storeM', { clim: true }), outDir: join(tmp, 'outM'), patchDir: join(tmp, 'patchM'), nowMs: NOW, get: getOf({ weekDoc: noLast }), pauseMs: 0 });
  const pM = readJson(join(tmp, 'patchM', 'index-patch.json')).snow;
  // one cell of a small glacier alone is missing on one day
  const oneNull = clone(WEEK); const cV = cellsDoc.glaciers[VWS].cells[0];
  // the two Vernaglwand glaciers are smaller than a cell and share the same one
  const share = Object.keys(cellsDoc.glaciers).filter((id) => cellsDoc.glaciers[id].cells.some((c) => S.snowCellKey(c[0], c[1]) === S.snowCellKey(cV[0], cV[1]))).sort();
  oneNull.features.find((f) => S.snowCellKey(f.geometry.coordinates[1], f.geometry.coordinates[0]) === S.snowCellKey(cV[0], cV[1])).properties.parameters.snow_depth.data[6] = null;
  const outN = join(tmp, 'outN');
  await runSnowDay({ storeDir: mkStore('storeN', { clim: true }), outDir: outN, patchDir: join(tmp, 'patchN'), nowMs: NOW, get: getOf({ weekDoc: oneNull }), pauseMs: 0 });
  const dN = readJson(join(outN, 'snow', '20261120.json'));
  add('F6 fehlender Tag: trägt die Quelle für den jüngsten Tag noch keinen Wert, entsteht für ihn KEIN Dokument (kein Dokument voller Lücken, keine 0) — er steht unter `noData`, der Zeiger nennt den Tag davor, die sechs Tage davor werden geschrieben. Fehlt nur EINE Zelle, fehlen genau die Gletscher, die sie brauchen (zwei kleine Nachbarn teilen sich hier eine Zelle), mit dem Grund `nodata` — Gegenprobe: im vollständigen Lauf stehen sie',
    JSON.stringify(resM.noData) === JSON.stringify(['20261120']) && !existsSync(join(tmp, 'outM', 'snow', '20261120.json')) && existsSync(join(tmp, 'outM', 'snow', '20261119.json')) && resM.written.length === 6 && pM.day === '20261119' && resM.day === '20261119'
    && !(VWS in dN.glaciers) && JSON.stringify(dN.missing) === JSON.stringify(share.map((id) => [id, 'nodata'])) && share.length === 2 && dN.count === 4 && VWS in day1.glaciers && S.snowDayProblems(dN).length === 0,
    `${JSON.stringify(resM.noData)} | ${JSON.stringify(dN.missing)}`);
  // 20 m of snow at the one cell of a small glacier; 15 m is the limit and passes
  const high = clone(WEEK), edge = clone(WEEK);
  const at = (doc) => doc.features.find((f) => S.snowCellKey(f.geometry.coordinates[1], f.geometry.coordinates[0]) === S.snowCellKey(cV[0], cV[1])).properties.parameters;
  at(high).snow_depth.data[6] = 20; at(edge).snow_depth.data[6] = 15; at(edge).swe_tot.data[6] = 8000;
  const outH = join(tmp, 'outH'), outE = join(tmp, 'outE');
  await runSnowDay({ storeDir: mkStore('storeH', { clim: true }), outDir: outH, patchDir: join(tmp, 'patchH'), nowMs: NOW, get: getOf({ weekDoc: high }), pauseMs: 0 });
  await runSnowDay({ storeDir: mkStore('storeE', { clim: true }), outDir: outE, patchDir: join(tmp, 'patchE'), nowMs: NOW, get: getOf({ weekDoc: edge }), pauseMs: 0 });
  const dH = readJson(join(outH, 'snow', '20261120.json')), dE = readJson(join(outE, 'snow', '20261120.json'));
  const bad = clone(day1); bad.glaciers[VWS][0] = 2000;
  add('F7 Wert außerhalb der benannten Grenzen: 20 m Schneehöhe (2 000 cm) an einer Zelle — die zwei Gletscher, die sie brauchen, stehen nicht im Dokument, sondern mit dem Grund `range` unter `missing`, die anderen vier bleiben; der Grenzwert selbst (15 m, 8 000 mm) gilt und liegt über jedem Referenzjahr (Kennzeichen 1, Lage 100); ein Dokument mit einem solchen Wert würden die Regeln des Vertrags verwerfen',
    !(VWS in dH.glaciers) && JSON.stringify(dH.missing) === JSON.stringify(share.map((id) => [id, 'range'])) && dH.count === 4 && JSON.stringify(dH.glaciers[HEF]) === JSON.stringify(day1.glaciers[HEF])
    && JSON.stringify(dE.glaciers[VWS]) === JSON.stringify([1500, 8000, 100, 1]) && S.snowDayProblems(bad).some((x) => /außerhalb der Grenzen/.test(x)) && S.SNOW_LIMITS.hs.join() === '0,1500' && S.SNOW_LIMITS.swe.join() === '0,8000',
    `${JSON.stringify(dH.missing)} | ${JSON.stringify(dE.glaciers[VWS])}`);
}
// without a climatology, with a climatology of other cells, a stale build
{
  const outC = join(tmp, 'outC');
  await runSnowDay({ storeDir: mkStore('storeC'), outDir: outC, patchDir: join(tmp, 'patchC'), nowMs: NOW, get: getOf(), pauseMs: 0 });
  const dC = readJson(join(outC, 'snow', '20261120.json')), stC = readJson(join(tmp, 'patchC', 'status-patch.json')).lines.snow;
  const storeO = mkStore('storeO');
  cpSync(join(climOut, S.GLACIER_SNOW_CLIM_DIR, `${BUILD}.1`), join(storeO, S.GLACIER_SNOW_CLIM_DIR, `${BUILD}.7`), { recursive: true });
  const outO = join(tmp, 'outO');
  await runSnowDay({ storeDir: storeO, outDir: outO, patchDir: join(tmp, 'patchO'), nowMs: NOW, get: getOf(), pauseMs: 0 });
  const dO = readJson(join(outO, 'snow', '20261120.json')), stO = readJson(join(tmp, 'patchO', 'status-patch.json')).lines.snow;
  const storeS = mkStore('storeS', { clim: true });
  writeFileSync(join(storeS, 'index.json'), JSON.stringify({ schema: 1, kind: 'glacier/index', static: { build: '20270115-1' } }));
  const resS = await runSnowDay({ storeDir: storeS, outDir: join(tmp, 'outS'), patchDir: join(tmp, 'patchS'), nowMs: NOW, get: getOf(), pauseMs: 0 });
  const noCells = await thrown(() => runSnowDay({ storeDir: mkStore('storeX', { cells: false }), outDir: join(tmp, 'outX'), patchDir: join(tmp, 'patchX'), nowMs: NOW, get: getOf(), pauseMs: 0 }));
  add('F8 Wert und Einordnung aus DENSELBEN Zellen: ohne Klimatologie im Speicher trägt jeder Gletscher seinen Wert, die Lage ist `null` (Kennzeichen 0) und der Status sagt es; eine Klimatologie, die zu einer ANDEREN Zellendatei gehört, wird nicht benutzt (Lage `null`, Grund im Status); nach einem neuen Katalog-Build rechnet der Lauf weiter mit den alten Zellen und meldet es (`stale`); ohne Zellendatei bricht er mit dem Grund ab',
    Object.values(dC.glaciers).every((r) => r[2] === null && r[3] === 0) && dC.clim === null && JSON.stringify(dC.glaciers[HEF].slice(0, 2)) === JSON.stringify(day1.glaciers[HEF].slice(0, 2)) && /keine Klimatologie/.test(stC.clim) && S.snowDayProblems(dC).length === 0
    && Object.values(dO.glaciers).every((r) => r[2] === null) && dO.clim === null && /gehört nicht zur Zellendatei/.test(stO.clim) && /Zellen aus Build 20261120-1, der Katalog ist 20270115-1/.test(resS.stale) && resS.written.length === 7
    && /keine Zellendatei im Speicher/.test(noCells) && !existsSync(join(tmp, 'outX')), `${stC.clim} | ${stO.clim} | ${resS.stale}`);
}
// request cap, size limit, service down
{
  // 1 900 cells need 13 point requests: the run stops at the cap
  const many = clone(cellsDoc); many.cells = Array.from({ length: 1900 }, (_, i) => [46 + i / 1e4, 10 + i / 1e4]);
  const storeK = mkStore('storeK', { cells: false }); mkdirSync(join(storeK, S.GLACIER_SNOW_CELLS_DIR), { recursive: true }); writeFileSync(join(storeK, S.glacierSnowCellsPath(`${BUILD}.1`)), JSON.stringify(many));
  let sent = 0;
  const synth = async (url) => { sent++; if (url === S.SNOWGRID_METADATA_URL) return META; const pts = [...url.matchAll(/lat_lon=([\d.]+),([\d.]+)/g)]; return { timestamps: WEEK.timestamps, features: pts.map((m) => ({ geometry: { coordinates: [Number(m[2]), Number(m[1])] }, properties: { parameters: { snow_depth: { unit: 'm', data: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] }, swe_tot: { unit: 'kg m-2', data: [20, 20, 20, 20, 20, 20, 20] } } } })) }; };
  const cap = await thrown(() => runSnowDay({ storeDir: storeK, outDir: join(tmp, 'outK'), patchDir: join(tmp, 'patchK'), nowMs: NOW, get: synth, pauseMs: 0 }));
  add('F9 Abruf-Deckel: ein Lauf sendet höchstens zwölf Abrufe (`SNOW_MAX_REQUESTS_PER_RUN`, gesetzt; gebraucht werden bei 756 Zellen sieben) — bräuchte er mehr (1 900 Zellen = 13 Punktabrufe), bricht er beim zwölften ab und schreibt nichts; 150 Punkte je Abruf, 300 ms Pause, eine Wiederholung je Abruf',
    /Abruf-Deckel 12 erreicht/.test(cap) && sent === 12 && !existsSync(join(tmp, 'outK')) && S.SNOW_MAX_REQUESTS_PER_RUN === 12 && S.SNOW_POINTS_PER_REQUEST === 150 && 1 + Math.ceil(756 / 150) === 7 && S.SNOW_REQUEST_PAUSE_MS === 300
    && /retries = 1/.test(src('scripts/glacier/snow.mjs')) && S.SNOWGRID_REQUESTS_PER_HOUR === 240, `${cap} nach ${sent} Abrufen`);
  // size limit: 4 000 glaciers on the same 14 cells make a document above the limit; 300 stay below
  const fat = (n) => { const d = clone(cellsDoc); for (let i = 0; i < n; i++) d.glaciers[`gl_at_erfunden-mit-einem-sehr-langen-namen-${String(i).padStart(5, '0')}`] = clone(cellsDoc.glaciers[VWS]); return d; };
  const mk = (name, n) => { const d = mkStore(name, { cells: false }); mkdirSync(join(d, S.GLACIER_SNOW_CELLS_DIR), { recursive: true }); writeFileSync(join(d, S.glacierSnowCellsPath(`${BUILD}.1`)), JSON.stringify(fat(n))); return d; };
  const big = await thrown(() => runSnowDay({ storeDir: mk('storeBig', 4000), outDir: join(tmp, 'outBig'), patchDir: join(tmp, 'patchBig'), nowMs: NOW, get: getOf(), pauseMs: 0 }));
  const okRes = await runSnowDay({ storeDir: mk('storeOk', 300), outDir: join(tmp, 'outOk'), patchDir: join(tmp, 'patchOk'), nowMs: NOW, get: getOf(), pauseMs: 0 });
  const bytes1 = readFileSync(join(out1, 'snow', '20261120.json')).length;
  add('F10 Größe des Dokuments: höchstens 200 000 Bytes (`GLACIER_SNOW_DAY_MAX_BYTES`, gesetzt; das echte Dokument mit 799 Gletschern hat rund 30 KB) — ein Dokument darüber (4 000 erfundene Gletscher) bricht den Lauf ab, eines mit 306 Gletschern geht durch',
    /über 200000 Bytes/.test(big) && okRes.written.length === 7 && okRes.written[6][1] === 306 && S.GLACIER_SNOW_DAY_MAX_BYTES === 200_000 && bytes1 < 2000, `${big} | ${bytes1} B`);
  const down = await thrown(() => runSnowDay({ storeDir: mkStore('storeD', { clim: true }), outDir: join(tmp, 'outD'), patchDir: join(tmp, 'patchD'), nowMs: NOW, get: getOf({ fail: true }), pauseMs: 0 }));
  add('F11 die Quelle antwortet nicht: der Lauf bricht mit dem Fehler ab (der Job wird rot) und schreibt weder Dokument noch Zeiger', /HTTP 503/.test(down) && !existsSync(join(tmp, 'outD')) && !existsSync(join(tmp, 'patchD')), down);
}

// ── G: coverage ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const ch = { ...EX.glaciers[0], id: 'gl_ch_grosser-aletschgletscher', country: 'CH', region: 'ch-mitte-west' }, de = { ...EX.glaciers[1], id: 'gl_de_noerdlicher-schneeferner', country: 'DE', region: 'de' };
  const outG = join(tmp, 'outG');
  const resG = await runSnowCells({ storeDir: mkStore('storeG', { cells: false }), outDir: outG, nowMs: NOW, get: getOf({ catalog: [...EX.glaciers, ch, de] }), pauseMs: 0 });
  const cG = readJson(join(outG, S.glacierSnowCellsPath(`${BUILD}.1`)));
  // the same run with the glacier that lies across the border in the catalogue
  const movedCat = { ...EX.glaciers.find((g) => g.id === HJF), id: moved.id, lat: moved.lat, lon: moved.lon };
  const movedFeature = { type: 'Feature', properties: { id: moved.id }, geometry: { type: 'MultiPolygon', coordinates: moved.outline } };
  const outG2 = join(tmp, 'outG2');
  const resG2 = await runSnowCells({ storeDir: mkStore('storeG2', { cells: false }), outDir: outG2, nowMs: NOW, get: getOf({ catalog: [...EX.glaciers, movedCat], extraOutlines: [movedFeature] }), pauseMs: 0 });
  const cG2 = readJson(join(outG2, S.glacierSnowCellsPath(`${BUILD}.1`)));
  add('G2 der Lauf, der die Zellen festlegt, zählt nur Zellen MIT Wert: der über die Grenze verschobene Gletscher im Katalog steht in der Zellendatei unter `outside` (außerhalb des Gitters) und bekommt keine Zelle — die Zellen ohne Wert der Rasterantwort sind keine Zellen; im täglichen Lauf steht er mit dem Grund `outside` unter `missing`',
    resG2.outside === 1 && resG2.glaciers === 7 && JSON.stringify(cG2.outside.map((x) => x[0])) === JSON.stringify([moved.id]) && !(moved.id in cG2.glaciers) && JSON.stringify(cG2.cells) === JSON.stringify(cellsDoc.cells)
    && JSON.stringify(S.buildSnowDay({ day: '20261120', builtAt: 'x', cellsDoc: cG2, clim: null, byKey: new Map(week.series.map((x) => [x.key, x])), index: 6, climRow: () => null }).missing) === JSON.stringify([[moved.id, 'outside']]), JSON.stringify(resG2));
  const withCh = clone(day1); withCh.glaciers['gl_ch_grosser-aletschgletscher'] = [50, 100, 50, 0]; withCh.count++;
  add('G1 Abdeckung Österreich: der Lauf, der die Zellen festlegt, liest aus dem Katalog NUR österreichische Gletscher — ein Schweizer und ein deutscher Gletscher im selben Katalog bekommen keinen Eintrag (auch nicht unter `outside`); das Ergebnis ist die Zellendatei aus C. Das Tagesdokument sagt selbst, warum sie fehlen (`coverage: AT` mit Satz), und die Regeln des Vertrags verwerfen ein Dokument mit einem Schweizer Gletscher',
    resG.glaciers === 6 && JSON.stringify([cG.glaciers, cG.cells, cG.outside]) === JSON.stringify([cellsDoc.glaciers, cellsDoc.cells, cellsDoc.outside]) && !JSON.stringify(cG).includes('gl_ch_') && !JSON.stringify(cG).includes('gl_de_') && cG.coverage === 'AT'
    && day1.coverage === 'AT' && day1.coverageNote === 'SNOWGRID deckt nur Österreich ab. Gletscher in der Schweiz und in Deutschland haben keinen Eintrag.' && S.snowDayProblems(withCh).some((x) => /außerhalb der Abdeckung/.test(x))
    && S.snowDayProblems({ ...day1, coverageNote: '' }).some((x) => /Abdeckung/.test(x)) && resG.gridRequests === 1 && SNOW_GRID_CELLS_PER_REQUEST === 25_000 && resG.gridDay === '20261120', JSON.stringify(resG));
}

// ── H: an analysis, no page, no Fusion, no raster ───────────────────────────────────────────────────────────────────────
{
  const contract = src('src/glacier/glacierSnowContract.ts'), producer = src('scripts/glacier/snow.mjs');
  const srcFiles = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx|css)$/.test(f));
  const NEEDLE = /glacierSnowContract|glacier\/snow\.mjs|SNOWGRID|snowgrid|['"`]snow\/|index\.snow\b/;
  const users = srcFiles.filter((f) => f !== 'glacier/glacierSnowContract.ts' && NEEDLE.test(readFileSync(join(ROOT, 'src', f), 'utf8')));
  add('H1 eine Analyse, keine Messung: Herkunft des Produkts ist `analysis` (im Dokument und im Vertrag, mit Satz); nirgends im Vertrag oder Producer steht `measured` oder `data-origin`; ein Dokument mit anderer Herkunft verwerfen die Regeln des Vertrags',
    S.SNOW_ORIGIN === 'analysis' && day1.origin === 'analysis' && /keine Messung am Gletscher/.test(day1.originNote) && !/measured|data-origin/.test(code(contract) + code(producer)) && S.snowDayProblems({ ...day1, origin: 'measured' }).some((x) => /Herkunft/.test(x)));
  // Phase GV (audit/gletscher-schnee-anzeige.md) shows the product on the dossier level "Heute": exactly these files may name it — the
  // client's reader, the pure view rules, the lazy ladder, the brief that mounts it and the page that passes the pointer on. Any other file is still a failure.
  const DISPLAY = ['glacier/GlacierBrief.tsx', 'glacier/GlacierPage.tsx', 'glacier/GlacierSnowLadder.tsx', 'glacier/glacierClient.ts', 'glacier/glacierSnowView.ts'];
  add('H2 Anzeige nur an benannter Stelle (Phase GV): außer dem Vertrag nennen genau der Leser im Client, die Regeln der Anzeige, die Leiter des Dossiers, der Steckbrief, der sie einhängt, und die Seite (Zeiger `index.snow`) das Produkt — jede dieser Dateien tut es, keine andere Datei unter `src/`; Quellenvermerk und Lizenzzeile kommen aus dem Vertrag (GeoSphere Austria, CC BY 4.0, DOI) — und das Suchmuster findet den Vertrag selbst',
    JSON.stringify([...users].sort()) === JSON.stringify([...DISPLAY].sort()) && srcFiles.length > 300 && NEEDLE.test(contract) && S.GLACIER_SNOW_SOURCE.note === 'GeoSphere Austria' && S.GLACIER_SNOW_SOURCE.licence === 'CC BY 4.0' && S.GLACIER_SNOW_SOURCE.doi === 'https://doi.org/10.60669/fsxx-6977'
    && S.glacierSnowSourceRow().id === 'snow-snowgrid' && /Analyse, keine Messung/.test(S.glacierSnowSourceRow().used) && /^Von buscosun bearbeitet: Schneehöhe von m in cm umgerechnet/.test(S.glacierSnowSourceRow().changes), users.join(' '));
  const dirs = ['src/pointForecast', 'src/point', 'src/sources', 'src/fusion', 'src/ml', 'src/nowcast', 'scripts/point', 'scripts/obs', 'scripts/pruefstand'];
  const hits = dirs.flatMap((d) => walk(join(ROOT, d)).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f)).filter((f) => NEEDLE.test(readFileSync(join(ROOT, d, f), 'utf8'))).map((f) => `${d}/${f}`));
  add('H3 buscosun Fusion und `obs/v1` sind nicht beteiligt: keine Datei des Motors, der Punkt-Leser, der Quellen, des Punkt-Crons, des Messspiegels oder des Prüfstands nennt das Produkt; der Vertrag importiert nur den Gletscher-Vertrag; der Producer liest und schreibt nichts unter `obs/` und schreibt nur unter `snow/` und in die zwei Zeiger-Patches',
    hits.length === 0 && [...contract.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).join() === './glacierContract' && !/OBS_RAW|obs\/v1\/|['"]obs\//.test(code(producer))
    && walk(out1).every((f) => f.startsWith('snow/')) && walk(patch1).sort().join() === 'index-patch.json,status-patch.json' && walk(climOut).every((f) => f.startsWith('snow/static/clim/')), hits.join(' '));
  add('H4 das Raster wird nie gespeichert: der Producer lädt keine NetCDF-Datei und schreibt keine Rasterantwort — die Zellendatei trägt nur Koordinaten der gebrauchten Zellen (14 von 90 des Ausschnitts), keine Werte; die Klimatologie trägt Stützwerte je Gletscher, keine Zellreihen',
    !/\.nc\b|netcdf|filelisting/i.test(code(producer)) && cellsDoc.cells.length === 14 && cellsDoc.cells.every((c) => c.length === 2) && !JSON.stringify(cellsDoc).includes('snow_depth') && Object.keys(climDoc).sort().join() === 'build,builtAt,days,file,hs,kind,pcts,ref,region,rule,schema,unit'
    && Object.keys(climDoc.hs).every((id) => id.startsWith('gl_at_')));
  const texts = [snowReadme(), S.SNOW_COVERAGE_NOTE, S.SNOW_ORIGIN_NOTE, ...Object.values(S.SNOW_MISSING_TEXT), ...Object.values(S.SNOW_UNITS), S.GLACIER_SNOW_SOURCE.changes, S.glacierSnowSourceRow().used];
  add('H5 kein Urteil: kein Satz des Produkts (README, Vermerke, Gründe, Einheiten) enthält eines der gesperrten Wörter (`glacierForbiddenWords`) oder ein Wort über Spalten, Schneebrücken oder Gefahr; die Lage ist eine Zahl ohne Wort — und die Prüfung schlägt an einem Satz mit „begehbar“ an',
    texts.every((t) => glacierForbiddenWords(t).length === 0 && !/spalte|schneebrücke|gefahr|gefährlich|warnung|schneearm|schneereich|überdurchschnittlich|unterdurchschnittlich/i.test(t)) && glacierForbiddenWords('Der Gletscher ist begehbar.').join() === 'begehbar'
    && !/schneearm|schneereich|durchschnittlich|normal\b/i.test(code(contract)) && texts.length >= 10);
}

// ── I: publisher line, pruning, no archive, workflow, README ───────────────────────────────────────────────────────────
{
  const pkg = checkPackage('snow', out1), pkgClim = checkPackage('snow', climOut);
  const badTree = join(tmp, 'badtree'); mkdirSync(join(badTree, 'stn'), { recursive: true }); writeFileSync(join(badTree, 'stn', 'x.json'), '{}');
  const obsTree = join(tmp, 'obstree'); mkdirSync(join(obsTree, 'obs'), { recursive: true }); writeFileSync(join(obsTree, 'obs', 'x.json'), '{}');
  const err = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
  add('I1 Linie `snow` des Gletscher-Publishers: sie darf nur `snow/` schreiben — der Baum des Laufs und der der Klimatologie gehen durch, eine Datei unter `stn/` oder `obs/` wird abgewiesen; die anderen Linien dürfen `snow/` nicht schreiben',
    GLACIER_LINES.snow.join() === 'snow' && pkg.files.length === 8 && pkgClim.files.length === 1 && /außerhalb der Linie snow/.test(err(() => checkPackage('snow', badTree))) && /außerhalb der Linie snow/.test(err(() => checkPackage('snow', obsTree)))
    && ['sat', 'melt', 'feed', 'static', 'stations'].every((l) => /außerhalb der Linie/.test(err(() => checkPackage(l, out1)))));
  const names = { snow: ['20251015.json', '20251017.json', '20261120.json', 'README.md', 'static', 'fremd.json', '2025101.json'], 'snow/static/cells': ['20261011-1.1.json', '20261120-1.1.json', '20261120-1.2.json'], 'snow/static/clim': ['20261011-1.1', '20261120-1.1', '20261120-1.2'] };
  const pruned = pruneList((p) => names[p] ?? [], GLACIER_POLICIES.snow, Date.parse('2026-11-21T00:00:00Z'));
  add('I2 Aufbewahrung: Tagesdokumente älter als 400 Tage gehen (15.10.2025 — 402 Tage; nicht der 17.10.2025 — genau 400), die zwei neuesten Zellendateien und Klimatologien bleiben; README, das Verzeichnis `static` und fremde Namen werden nicht angefasst',
    pruned.sort().join() === 'snow/20251015.json,snow/static/cells/20261011-1.1.json,snow/static/clim/20261011-1.1' && S.GLACIER_SNOW_KEEP_DAYS === 400, pruned.join());
  const arch = [src('scripts/glacier/glacier-archive.mjs'), src('scripts/glacier/stations-archive.mjs'), src('scripts/glacier/workflow-glacier-archiv.yml'), src('scripts/glacier/workflow-glacier-stations-archiv.yml')].join('\n');
  add('I3 keine Ablage: kein Archiv-Skript und keine Archiv-Vorlage der Gletscher-Linie nennt das Produkt — die Quelle hält die ganze Reihe', !/snow\/|snow\.mjs|glacier-snow|SNOWGRID/i.test(arch));
  const wf = src('scripts/glacier/workflow-glacier-snow.yml'), pub = src('scripts/glacier/glacier-publish.mjs');
  const body = wf.replace(/^#.*$/gm, '').replace(/^\s*- name:.*$/gm, '');
  add('I4 Workflow-Vorlage: zweimal am Tag (10:25 und 15:25 UTC, nach dem Erscheinen des Vortags gegen 09:10 UTC), ohne Secrets und Token, Producer frisch aus `buscosun-web` mit Leerlauf, solange er, die Linie oder die Zellendatei fehlen, Kill-Schalter, `set -o pipefail` vor `tee`, Veröffentlichen nur über `glacier-publish.mjs --line=snow`, nie `--force`, eigene Concurrency-Gruppe; kein Schritt baut Zellen oder Klimatologie und keiner schreibt nach `obs/`',
    /cron: '25 10,15 \* \* \*'/.test(wf) && !/secrets\./.test(wf) && !/token/i.test(wf) && /producer not on \$REF yet/.test(wf) && /set -o pipefail/.test(wf) && !/git push|--force(?!-)/.test(body) && /--line=snow --src=out/.test(wf) && /Kill switch/.test(wf)
    && /scripts\/glacier\/snow\.mjs --mode=day --store=\.\.\/data\/glacier\/v1 --out=\.\.\/out --patch=\.\.\/patch/.test(wf) && /group: glacier-snow\n/.test(wf.replace(/\r/g, '')) && /snow\/static\/cells\/\*\.json/.test(wf) && !/--mode=(cells|clim)/.test(body) && !/obs\/v1/.test(body)
    && /snow: \['snow'\]/.test(pub) && /grep -q "snow: \\\['snow'\\\]"/.test(wf) && /steps\.run\.outputs\.wrote != '0'/.test(wf));
  const readme = snowReadme();
  add('I5 README beim Produkt: Namensnennung, Lizenz mit Adresse, DOI und „Geändert“ stehen neben den Daten (CC BY 4.0), dazu die Herkunft (Analyse, keine Messung), die Abdeckung (nur Österreich), die Einheiten und Grenzen, die Referenzjahre und die Regel für den 29.02.; erzeugt aus dem Vertrag und Byte für Byte die Datei des Laufs',
    readme === readFileSync(join(out1, 'snow', 'README.md'), 'utf8') && readme.includes('**GeoSphere Austria**') && readme.includes('[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)') && readme.includes('https://doi.org/10.60669/fsxx-6977') && readme.includes('Geändert: Schneehöhe von m in cm umgerechnet')
    && readme.includes('keine Messung am Gletscher') && readme.includes('SNOWGRID deckt nur Österreich ab') && readme.includes('1991–2020') && readme.includes('29.02.') && readme.includes('buscosun Fusion liest diese Dateien nicht') && readme.includes('Das Raster selbst liegt hier nicht.') && !readme.includes('undefined'));
  const pkgJson = readJson(join(ROOT, 'package.json'));
  add('I6 Einbindung: `npm run verify:glacier-snow` ist angelegt und steht in der CI; der Vertrag nennt Grenzen, Referenzjahre, Stützwerte und Deckel als benannte Konstanten',
    /verify-glacier-snow\.mjs$/.test(pkgJson.scripts['verify:glacier-snow'] ?? '') && /verify:glacier-snow/.test(src('.github/workflows/ci.yml')) && S.SNOW_CLIM_PCTS.join() === '0,10,25,50,75,90,100' && S.SNOWGRID_MAX_VALUES_PER_REQUEST === 1_000_000);
}

rmSync(tmp, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-snow ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
