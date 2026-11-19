/**
 * verify:glacier-hugonnet — Phase GH (audit/gletscher-hugonnet.md): elevation change per glacier after Hugonnet et al. 2021 —
 * the table reader on REAL rows in the published shape, the 1 : 1 rule on the real bridge pairs (one glacier per case), the block with
 * unchanged values, the document rules, the sheet's wording (value ± uncertainty, or the range only), the source row, and the wiring that
 * keeps a glacier without a block on today's page. Every rule with a negative control.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-hugonnet.mjs \
 *        [--dir=<package of hugonnet.mjs> --catalog=<catalog.json> [--table=<dh_11_rgi60_pergla_rates.csv>]]
 *
 * Without `--dir` only the real-extract fixture is checked (CI has neither the table nor a data repo); with `--dir` the complete local tree is.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLACIER_ELEV_PERIODS, GLACIER_ELEV_SOURCE, GLACIER_ELEV_END_YEAR, GLACIER_ELEV_REPORT_FILE, HUGONNET_RATES_COLUMNS, parseHugonnetRates, elevMatch, elevBlockOf, elevProblems, glacierElevFile,
} from '../src/glacier/glacierElevContract.ts';
import { GLACIER_MATCH_MIN_OVERLAP, GLACIER_REGIONS } from '../src/glacier/glacierContract.ts';
import { elevView, elevFigure, elevSentence, elevNum, elevDecimals, sourceRows } from '../src/glacier/glacierSheetModel.ts';
import { buildElev } from './glacier/hugonnet.mjs';
import { checkPackage, mergePatch } from './glacier/glacier-publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'hugonnet-extract.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const clone = (x) => JSON.parse(JSON.stringify(x));
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e?.message ?? e); } };
const P = FX.pick, PER = GLACIER_ELEV_PERIODS;

// F — fixture
{
  const body = { pick: FX.pick, catalog: FX.catalog, bridge: FX.bridge, csv: FX.csv, expect: FX.expect };
  const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const head = FX.csv.split('\n')[0].split(',');
  add('F1 Fixture: Prüfsumme stimmt; die Kopfzeile ist die der veröffentlichten Tabelle (16 Spalten); acht Gletscher, je einer pro Fall der Regel, und die Quelle mit Lizenz steht dabei',
    sha === FX.sha256 && head.length === 16 && head.every((c, i) => c === HUGONNET_RATES_COLUMNS[i]) && FX.catalog.glaciers.length === 8 && /10\.6096\/13/.test(FX.source) && /CC BY 4\.0/.test(FX.source),
    `${sha.slice(0, 12)} · ${head.length} Spalten · ${FX.catalog.glaciers.length} Gletscher`);
}

// T — the table reader
const table = parseHugonnetRates(FX.csv);
{
  const rows = FX.csv.trim().split('\n').slice(1);
  const kept = [...table.rows.values()].reduce((s, m) => s + m.size, 0);
  const other = rows.filter((r) => !PER.some((p) => r.split(',')[1] === p.key)).length;
  add('T1 Tabelle: fünf Zeiträume je Gletscher bleiben, die anderen Zeilen der Tabelle (hier 2000–2009 und 2018) fallen heraus',
    table.lines === rows.length && kept === table.glaciers * 5 && other === table.glaciers * 2 && [...table.rows.values()].every((m) => PER.every((p) => m.has(p.key))),
    `${table.lines} Zeilen, ${table.glaciers} RGI-Gletscher, ${kept} behalten, ${other} verworfen`);
  const nan = table.rows.get(FX.expect[P.noValue].rgi);
  const raw = rows.find((r) => r.startsWith(`${FX.expect[P.noValue].rgi},${PER[0].key},`)).split(',');
  add('T2 Tabelle: eine leere Zelle (so schreibt die Tabelle „kein Wert“) und „nan“ werden zu „kein Wert“, nie zu 0', raw[3] === '' && Number(raw[4]) > 0 && parseHugonnetRates(FX.csv.replace(raw.join(','), [...raw.slice(0, 3), 'nan', 'NaN', ...raw.slice(5)].join(','))).rows.get(raw[0]).get(PER[0].key).dhdt === null && nan.get(PER[0].key).dhdt === null && nan.get(PER[0].key).err === Number(raw[4]) && nan.get(PER[0].key).areaM2 > 0
    && elevBlockOf(raw[0], nan) === null, `${raw[0]} dhdt="${raw[3]}", err_dhdt="${raw[4]}" (die Tabelle nennt hier eine Unsicherheit ohne Wert)`);
  const e1 = throws(() => parseHugonnetRates(FX.csv.replace('err_dhdt', 'dhdt_err')));
  const e2 = throws(() => parseHugonnetRates(FX.csv.replace('rgiid,period,area,dhdt', 'rgiid,period,dhdt,area')));
  const lines = FX.csv.split('\n');
  const first = lines.findIndex((l) => l.split(',')[1] === PER[0].key);
  const e3 = throws(() => parseHugonnetRates([...lines.slice(0, first), lines[first].split(',').slice(0, 15).join(','), ...lines.slice(first + 1)].join('\n')));
  const e4 = throws(() => parseHugonnetRates([...lines.slice(0, first + 1), lines[first], ...lines.slice(first + 1)].join('\n')));
  add('T3 Gegenprobe: eine umbenannte Spalte, vertauschte Spalten, eine Zeile mit 15 Spalten und eine doppelte Zeile brechen ab (kein Raten)', e1 && e2 && e3 && e4 && !throws(() => parseHugonnetRates(FX.csv)), [e1, e2, e3, e4].map((e) => (e ? e.slice(0, 40) : 'KEIN ABBRUCH')).join(' | '));
}

// M — the 1 : 1 rule on the real bridge pairs
const ids = FX.catalog.glaciers.map((g) => g.id);
const match = elevMatch(ids, FX.bridge.pairs);
{
  const got = Object.fromEntries(ids.map((id) => { const m = match.get(id); return [id, m.ok ? `ok ${m.rgi}` : m.why]; }));
  const want = Object.fromEntries(ids.map((id) => { const e = FX.expect[id]; return [id, e.block ? `ok ${e.block.rgi}` : e.why === 'no-value' ? `ok ${e.rgi}` : e.why]; }));
  add('M1 Regel: jeder der acht Gletscher bekommt dasselbe Urteil wie im vollen Lauf — Treffer, kein RGI-Umriss, Teil eines RGI-Gletschers, über mehreren RGI-Gletschern, RGI gehört einem anderen',
    JSON.stringify(got) === JSON.stringify(want) && match.get(P.noRgi).why === 'no-rgi' && match.get(P.partOfRgi).why === 'part-of-rgi' && match.get(P.severalRgi).why === 'several-rgi' && match.get(P.notMutual).why === 'not-mutual',
    Object.values(got).join(' · '));
  const nm = match.get(P.notMutual), ow = FX.bridge.pairs.filter((p) => p[1] === nm.rgi).sort((a, b) => b[2] - a[2])[0];
  add('M2 Gletscher ohne Zuordnung: der RGI-Gletscher des Falls „gehört einem anderen“ liegt zu 84 % der eigenen Fläche darunter und bekommt trotzdem keinen Wert — die größere Schnittfläche hat der Nachbar',
    !nm.ok && nm.aG > 0.8 && ow[0] === P.owner && ow[0] !== P.notMutual, `aG ${nm.aG}, aR ${nm.aR}; größte Schnittfläche bei ${ow[0]}`);
  // negative controls on the thresholds: the real Aletsch pair, moved just below one half on either side
  const al = FX.bridge.pairs.find((p) => p[0] === P.trend && p[1] === FX.expect[P.trend].block.rgi);
  const swap = (aG, aR) => elevMatch([P.trend], FX.bridge.pairs.map((p) => (p === al ? [p[0], p[1], p[2], aG, aR] : p))).get(P.trend);
  const edge = swap(GLACIER_MATCH_MIN_OVERLAP, GLACIER_MATCH_MIN_OVERLAP), lowR = swap(al[3], 0.4999), lowG = swap(0.4999, al[4]);
  add('M3 Gegenprobe Schwelle: genau die Hälfte beider Flächen ist ein Treffer, 49,99 % der RGI-Fläche oder der eigenen Fläche keiner', edge.ok && !lowR.ok && lowR.why === 'part-of-rgi' && !lowG.ok && lowG.why === 'several-rgi', `${edge.ok} · ${lowR.why} · ${lowG.why}`);
  const rev = elevMatch(ids, [...FX.bridge.pairs].reverse());
  const tie = elevMatch(['gl_at_a', 'gl_at_b'], [['gl_at_b', 'RGI60-11.00001', 1, 0.9, 0.9], ['gl_at_a', 'RGI60-11.00001', 1, 0.9, 0.9]]);
  add('M4 Reihenfolge: dieselben Paare rückwärts ergeben dieselben Urteile; bei exakt gleicher Schnittfläche bekommt nur EIN Gletscher die Zeile',
    ids.every((id) => JSON.stringify(rev.get(id)) === JSON.stringify(match.get(id))) && tie.get('gl_at_a').ok && !tie.get('gl_at_b').ok && tie.get('gl_at_b').why === 'not-mutual', `${tie.get('gl_at_a').ok} / ${tie.get('gl_at_b').why}`);
  const noName = elevMatch(['gl_ch_grosser-aletschgletscher'], []);
  add('M5 Kein Raten: ohne Schnittfläche gibt es keine Zuordnung, auch wenn Name und Nummer bekannt sind', !noName.get('gl_ch_grosser-aletschgletscher').ok && noName.get('gl_ch_grosser-aletschgletscher').why === 'no-rgi', noName.get('gl_ch_grosser-aletschgletscher').why);
}

// B — block and documents
const built = buildElev({ catalog: FX.catalog, bridge: FX.bridge, table, builtAt: '2026-11-19T00:00:00Z' });
const blocks = Object.assign({}, ...[...built.docs.values()].map((d) => d.glaciers));
{
  const rows = FX.csv.trim().split('\n').slice(1).map((r) => r.split(','));
  let same = 0, n = 0;
  for (const [id, b] of Object.entries(blocks)) {
    PER.forEach((p, i) => { const r = rows.find((x) => x[0] === b.rgi && x[1] === p.key); n++; if (b.r[i] && String(b.r[i][0]) === String(Number(r[3])) && String(b.r[i][1]) === String(Number(r[4])) && Math.abs(b.km2 * 1e6 - Number(r[2])) < 0.5) same++; });
    if (JSON.stringify(b) !== JSON.stringify(FX.expect[id].block)) same = -99;
  }
  add('B1 Werte unverändert: jede Zahl der Blöcke steht Ziffer für Ziffer in der Tabellenzeile ihres RGI-Gletschers und Zeitraums; die Blöcke sind die des vollen Laufs', same === n && n === 15, `${same}/${n} Werte, ${Object.keys(blocks).length} Blöcke`);
  const mut = parseHugonnetRates(FX.csv.replace('-1.4243,0.0988', '-1.4244,0.0988'));
  const b2 = buildElev({ catalog: FX.catalog, bridge: FX.bridge, table: mut }).docs.get('ch-mitte-west').glaciers[P.trend];
  add('B1b Gegenprobe: eine geänderte Ziffer in der Tabelle ändert genau diesen Wert im Block', b2.r[0][0] === -1.4244 && b2.r[1][0] === blocks[P.trend].r[1][0], `${blocks[P.trend].r[0][0]} → ${b2.r[0][0]}`);
  const noneIds = built.report.none.map((x) => x[0]).sort();
  const wantNone = ids.filter((id) => !FX.expect[id].block).sort();
  add('B2 Gletscher ohne Zuordnung: fünf der acht haben KEINEN Block, jeder steht mit Grund im Bericht; der Gletscher mit „nan“ in der Tabelle bekommt keinen Block statt einer Null',
    JSON.stringify(noneIds) === JSON.stringify(wantNone) && built.report.matched === 3 && built.report.unmatched === 5 && built.report.why['no-value'] === 1 && !(P.noValue in blocks) && noneIds.every((id) => !(id in blocks)),
    JSON.stringify(built.report.why));
  const regions = new Set(FX.catalog.glaciers.map((g) => g.region));
  const empty = [...built.docs.values()].filter((d) => Object.keys(d.glaciers).length === 0).map((d) => d.region);
  add('B3 Jede Region des Katalogs bekommt ihr Dokument, auch eine ohne einen einzigen Block (der Client fragt je Region und darf keine fehlende Datei treffen)', built.docs.size === regions.size && [...regions].every((r) => built.docs.has(r)) && empty.length >= 1, `${built.docs.size} Dokumente, leer: ${empty.join(', ')}`);
  const idSet = new Set(ids);
  add('B4 Dokumente bestehen die Regeln des Vertrags; kein RGI-Gletscher gibt seine Zeile an zwei Gletscher', [...built.docs].every(([r, d]) => elevProblems(d, r, idSet).length === 0) && new Set(Object.values(blocks).map((b) => b.rgi)).size === Object.keys(blocks).length, [...built.docs.keys()].join(', '));
  const e1 = throws(() => buildElev({ catalog: FX.catalog, bridge: { ...FX.bridge, build: '20260101-1' }, table }));
  const e2 = throws(() => buildElev({ catalog: FX.catalog, bridge: { ...FX.bridge, pairs: [...FX.bridge.pairs, ['gl_at_fremd', 'RGI60-11.00001', 1, 1, 1]] }, table }));
  add('B5 Gegenprobe: eine Brücke eines anderen Builds oder mit einem Gletscher außerhalb des Katalogs bricht den Lauf ab', e1 && e2, `${(e1 ?? 'KEIN ABBRUCH').slice(0, 50)} | ${(e2 ?? 'KEIN ABBRUCH').slice(0, 50)}`);
  add('B6 Kein Block ohne Gesamtzeitraum: fehlt 2000–2019, gibt es nichts; fehlt ein Fünfjahreswert, bleibt genau der leer',
    elevBlockOf('RGI60-11.00001', new Map(PER.slice(1).map((p) => [p.key, { areaM2: 1e6, dhdt: -1, err: 0.2 }]))) === null
    && elevBlockOf('RGI60-11.00001', new Map(PER.map((p, i) => [p.key, { areaM2: 1e6, dhdt: i === 2 ? null : -1, err: 0.2 }]))).r.map((x) => (x ? 1 : 0)).join('') === '11011', '11011');
}

// P — document rules (negative controls)
{
  const doc = built.docs.get('ch-mitte-west'), idSet = new Set(ids);
  const bad = (fn) => { const d = clone(doc); fn(d); return elevProblems(d, 'ch-mitte-west', idSet).length > 0; };
  const cases = {
    'Unsicherheit 0': bad((d) => { d.glaciers[P.trend].r[0][1] = 0; }),
    'Gesamtzeitraum fehlt': bad((d) => { d.glaciers[P.trend].r[0] = null; }),
    'vier statt fünf Zeiträume': bad((d) => { d.glaciers[P.trend].r.pop(); }),
    'Zeiträume umbenannt': bad((d) => { d.periods[0].label = '2000–2020'; }),
    'Gletscher nicht im Katalog': bad((d) => { d.glaciers.gl_ch_fremd = d.glaciers[P.trend]; }),
    'Quelle ohne DOI': bad((d) => { d.source.attribution = 'Hugonnet et al. 2021'; }),
    'Lizenz fehlt': bad((d) => { d.source.licence = ''; }),
    'andere Einheit': bad((d) => { d.unit = 'm w.e./a'; }),
    'keine RGI-Nummer': bad((d) => { d.glaciers[P.trend].rgi = 'Aletsch'; }),
    'Wert nicht endlich': bad((d) => { d.glaciers[P.trend].r[2][0] = null; }),
  };
  add('P1 Gegenproben am Dokument: zehn Verstöße werden je für sich bemerkt (ein verletztes Dokument verwirft der Client ganz)', Object.values(cases).every(Boolean) && elevProblems(doc, 'ch-mitte-west', idSet).length === 0 && elevProblems(doc, 'ch-west', idSet).length > 0,
    Object.entries(cases).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'alle bemerkt');
  add('P2 Quelle: Lizenz CC BY 4.0, Zitiertext mit DOI des Datensatzes und der Veröffentlichung, Zeiträume enden 2019', GLACIER_ELEV_SOURCE.licence === 'CC BY 4.0' && GLACIER_ELEV_SOURCE.attribution.includes('https://doi.org/10.6096/13') && GLACIER_ELEV_SOURCE.attribution.includes('10.1038/s41586-021-03436-z') && GLACIER_ELEV_SOURCE.url === 'https://doi.org/10.6096/13'
    && GLACIER_ELEV_END_YEAR === 2019 && PER[0].to === 2019 && PER[4].to === 2019 && PER.length === 5 && PER.slice(1).every((p) => p.to - p.from === 4), GLACIER_ELEV_SOURCE.licence);
}

// V — what the sheet says
{
  const doc = built.docs.get('ch-mitte-west');
  const al = elevView(doc, blocks[P.trend]);
  const f = elevFigure(al.total), s = elevSentence(al);
  add('V1 Zahl mit Zeitraum und Unsicherheit: Aletsch „−1,4 m pro Jahr“ · „± 0,1“ · Zeitraum 2000–2019; der Satz nennt Richtung, Zeitraum und Unsicherheit',
    f.value === '−1,4 m pro Jahr' && f.note === '± 0,1' && al.total.label === '2000–2019' && !al.total.rangeOnly && /von 2000 bis 2019/.test(s) && /um 1,4 m pro Jahr gesunken/.test(s) && /± 0,1 m/.test(s), `${f.value} ${f.note} — ${s}`);
  const bl = elevView(built.docs.get('de'), blocks[P.rangeTotal]);
  const fb = elevFigure(bl.total), sb = elevSentence(bl);
  add('V2 Unsicherheit größer als der Wert (Blaueis, −0,35 ± 0,68): nur die Spanne „−1,0 bis +0,3 m pro Jahr“, kein einzelner Wert, kein „gesunken“ oder „gestiegen“',
    bl.total.rangeOnly && fb.value === '−1,0 bis +0,3 m pro Jahr' && !/±/.test(fb.note) && /Spanne/.test(fb.note) && !/gesunken|gestiegen/.test(sb) && /zwischen −1,0 und \+0,3 m pro Jahr/.test(sb) && bl.periods.every((r) => r.rangeOnly) && !fb.value.includes('0,35'), `${fb.value} — ${sb}`);
  const pi = elevView(built.docs.get(FX.catalog.glaciers.find((g) => g.id === P.owner).region), blocks[P.owner]);
  add('V3 Grenze an echten Zeilen: 2000–2004 mit −0,7108 ± 0,7392 zeigt nur die Spanne, 2005–2009 mit −0,6796 ± 0,6737 den Wert', pi.periods[0].rangeOnly && !pi.periods[1].rangeOnly && !pi.total.rangeOnly, pi.periods.map((r) => `${r.v}±${r.err}:${r.rangeOnly ? 'Spanne' : 'Wert'}`).join(' · '));
  const mk = (v, err) => elevView({ periods: doc.periods, ref: doc.ref, source: doc.source }, { rgi: 'RGI60-11.00001', km2: 1, r: [[v, err], null, null, null, null] });
  const eq = mk(-0.5, 0.5), just = mk(-0.5, 0.4999), gain = mk(0.8, 0.2), fine = mk(-0.26, 0.04);
  add('V4 Gegenproben: Unsicherheit GLEICH dem Wert ⇒ Spanne; knapp darunter ⇒ Wert; ein Anstieg heißt „gestiegen“ mit Pluszeichen; eine Unsicherheit unter 0,05 bekommt zwei Nachkommastellen (nie „± 0,0“)',
    eq.total.rangeOnly && !just.total.rangeOnly && elevFigure(gain.total).value === '+0,8 m pro Jahr' && /gestiegen/.test(elevSentence(gain)) && elevDecimals(0.04) === 2 && elevFigure(fine.total).value === '−0,26 m pro Jahr' && elevFigure(fine.total).note === '± 0,04',
    `${elevFigure(eq.total).value} · ${elevFigure(just.total).value} · ${elevFigure(gain.total).value} · ${elevFigure(fine.total).value} ${elevFigure(fine.total).note}`);
  add('V5 Zahlenformat: Komma, echtes Minuszeichen, Plus bei Zunahme; ein Wert, der auf 0 rundet, trägt kein Vorzeichen', elevNum(-1.4243, 1) === '−1,4' && elevNum(0.33, 1) === '+0,3' && elevNum(-0.04, 1) === '0,0' && elevNum(0.0988, 1, false) === '0,1' && elevNum(-2, 0, false) === '−2', [elevNum(-1.4243, 1), elevNum(0.33, 1), elevNum(-0.04, 1)].join(' '));
  add('V6 Ohne Block nichts: kein Dokument, kein Block oder ein Block ohne Gesamtzeitraum ergibt keine Ansicht (die Seite zeigt dann, was sie heute zeigt)', elevView(null, blocks[P.trend]) === null && elevView(doc, undefined) === null && elevView(doc, { rgi: 'RGI60-11.00001', km2: 1, r: [null, [-1, 0.1], null, null, null] }) === null, 'null · null · null');
  const g = FX.catalog.glaciers.find((x) => x.id === P.trend);
  const base = { g, hasLength: false, hasMass: false, area: null, melt: null, season: null, clima: false, proj: false, anomaly: false, mass: null, lengthSeries: null, nowMs: Date.parse('2026-11-19T12:00:00Z') };
  const withRow = sourceRows({ ...base, elev: al }), without = sourceRows(base);
  const row = withRow.find((r) => /Höhenänderung/.test(r.what));
  add('V7 Quellen: mit Block steht EINE Zeile mit Herkunft Satellit, Zeitraum, Ende der Reihe, Zitiertext mit DOI, Lizenz und RGI-Nummer; ohne Block keine',
    withRow.length === without.length + 1 && row && row.origin === 'satellite' && /2000–2019/.test(row.what) && /endet 2019/.test(row.stand) && row.source.includes('https://doi.org/10.6096/13') && row.source.includes('CC BY 4.0') && row.source.includes(al.rgi) && !without.some((r) => /Höhenänderung/.test(r.what)),
    row ? `${row.what} — ${row.stand}` : 'keine Zeile');
}

// W — wiring: asked for only when the pointer names this build; shown only with a block
{
  const src = (f) => readFileSync(join(ROOT, 'src', 'glacier', f), 'utf8');
  const data = src('glacierSheetData.ts'), tabs = src('GlacierSheetTabs.tsx'), brief = src('GlacierBrief.tsx'), page = src('GlacierPage.tsx'), client = src('glacierClient.ts'), charts = src('GlacierCharts.tsx');
  const gate = /a\.elevBuild === build \? guard\('Höhenänderung', loadElev\(build, g\.region, byId, signal, bases\)\) : Promise\.resolve\(null\)/;
  add('W1 Zeiger: die Datei wird nur gefragt, wenn der Zeiger genau diesen Build nennt (static.dhdt === static.build) — sonst kein Abruf, keine fehlende Datei in der Konsole',
    gate.test(data) && /elevBuild: index\.static\.dhdt \?\? null/.test(page) && (page.match(/elevBuild=\{d!?\.elevBuild\}/g) ?? []).length === 2 && /static: \{ build: string; dhdt\?: string \}/.test(client) && !gate.test(data.replace('a.elevBuild === build ?', 'true ?')),
    'Bedingung an beiden Stellen der Seite verdrahtet');
  add('W2 Zeiger-Flickwerk: der Producer setzt nur static.dhdt und lässt static.build stehen; ein späterer Build ohne Hugonnet-Schritt nennt dann einen anderen Build als dhdt',
    JSON.stringify(mergePatch({ static: { build: '20261012-1' }, sat: { a: 1 } }, { static: { dhdt: '20261012-1' } })) === JSON.stringify({ static: { build: '20261012-1', dhdt: '20261012-1' }, sat: { a: 1 } })
    && mergePatch({ static: { build: '20261012-1', dhdt: '20261012-1' } }, { static: { build: '20270101-1' } }).static.dhdt !== '20270101-1', 'dhdt bleibt beim alten Build');
  add('W3 Ohne Block unverändert: die Karte im Reiter Langzeit, die Zeile im Steckbrief und die Lizenzzeile hängen je an der Bedingung „Block vorhanden“; der geprüfte Client verwirft ein verletztes Dokument ganz',
    /\{elev && <ElevCard elev=\{elev\} \/>\}/.test(tabs) && /\{elevFig && <><dt>Höhenänderung \{elevFig\.label\}<\/dt>/.test(brief) && /const elevFig = data\?\.elev \? /.test(brief) && /sources=\{d\.elev && d\.sources \? \[\.\.\.d\.sources, d\.elev\.source\] : d\.sources\}/.test(brief)
    && /d && d\.build === build && elevProblems\(d, region, byId\)\.length === 0 \? d : null/.test(client) && !/\{elev && <ElevCard/.test(tabs.replace('{elev && <ElevCard', '{<ElevCard')),
    'vier Bedingungen gefunden');
  add('W4 Zeitraum und Herkunft an jeder Zahl: Karte und Steckbrief tragen data-origin="satellite", den Zeitraum, „endet“ und den Satz „nicht der Schmelzindex und keine Vorhersage“; die Grafik zeichnet für eine Spanne keinen gefüllten Balken',
    /HÖHENÄNDERUNG DER OBERFLÄCHE · \{elev\.total\.label\}/.test(tabs) && /Die Reihe endet \{elev\.total\.to\}/.test(tabs) && /nicht der Schmelzindex und keine Vorhersage/.test(tabs) && /Hugonnet et al\. 2021 · endet \{elevFig\.to\}/.test(brief)
    && (tabs.match(/data-origin="satellite"/g) ?? []).length >= 1 && /data-origin="satellite">\{elevFig\.value\}/.test(brief) && /r\.rangeOnly \? \(\s*<rect [^>]*strokeDasharray/.test(charts) && /className="gl-bars gl-elevbars"[^>]*data-origin="satellite"/.test(charts),
    'Texte und Herkunft gefunden');
  const css = src('glacierSheet.css');
  const used = [...new Set([...tabs.matchAll(/gl-elev[a-z-]*/g), ...charts.matchAll(/gl-elev[a-z-]*/g)].map((m) => m[0]))];
  const elevLines = css.split(/\r?\n/).filter((l) => l.includes('gl-elev'));
  add('W5 Stil: jede gl-elev-Klasse der Anzeige ist im Stylesheet definiert, nur mit --gl-Tokens (keine feste Farbe) und nicht in einer Media Query (Regeln auf oberster Ebene)', used.length >= 6 && used.every((c) => css.includes(`.${c}`)) && elevLines.length >= 6 && elevLines.every((l) => l.startsWith('.gl-') && !/#[0-9a-fA-F]{3,6}\b/.test(l)) && !elevLines.every((l) => !l.includes('var(--gl-')),
    used.join(' '));
}

// D — the complete local tree (optional)
const dir = arg('dir');
if (dir) {
  const catalog = JSON.parse(readFileSync(arg('catalog'), 'utf8'));
  const base = join(dir, 'static', catalog.build);
  const J = (f) => JSON.parse(readFileSync(join(base, f), 'utf8'));
  const report = J(GLACIER_ELEV_REPORT_FILE);
  const idSet = new Set(catalog.glaciers.map((g) => g.id)), regionOf = new Map(catalog.glaciers.map((g) => [g.id, g.region]));
  const regions = [...new Set(catalog.glaciers.map((g) => g.region))];
  let n = 0, problems = [], wrongRegion = 0; const rgi = new Set(); const all = {};
  for (const r of regions) {
    if (!existsSync(join(base, glacierElevFile(r)))) { problems.push(`${r}: Datei fehlt`); continue; }
    const d = J(glacierElevFile(r));
    problems.push(...elevProblems(d, r, idSet).map((p) => `${r}: ${p}`));
    for (const [id, b] of Object.entries(d.glaciers)) { n++; rgi.add(b.rgi); all[id] = b; if (regionOf.get(id) !== r) wrongRegion++; }
  }
  const files = readdirSync(join(base, 'dhdt'));
  add('D1 Voller Baum: je Region des Katalogs ein Dokument, alle bestehen den Vertrag, jeder Block in der Datei seiner Region, keine RGI-Zeile doppelt', problems.length === 0 && wrongRegion === 0 && rgi.size === n && files.length === regions.length + 1 && regions.every((r) => GLACIER_REGIONS[r]), `${regions.length} Regionen, ${n} Blöcke${problems.length ? ` — ${problems.slice(0, 3).join('; ')}` : ''}`);
  const noneIds = new Set(report.none.map((x) => x[0]));
  add('D2 Bericht: Treffer + ohne Zuordnung = Katalog; kein Gletscher in beiden Listen, keiner fehlt; die Gründe summieren sich', report.glaciers === catalog.glaciers.length && report.matched === n && report.matched + report.unmatched === report.glaciers && report.none.length === report.unmatched
    && catalog.glaciers.every((g) => (g.id in all) !== noneIds.has(g.id)) && Object.values(report.why).reduce((a, b) => a + b, 0) === report.unmatched, `${report.matched} von ${report.glaciers} (${JSON.stringify(report.why)})`);
  const pkg = checkPackage('static', dir);
  add('D3 Paket: nur Dateien der statischen Linie unter static/<build>/dhdt/, jede weit unter 20 MB', pkg.files.every((f) => f.startsWith(`static/${catalog.build}/dhdt/`)) && pkg.files.length === files.length && pkg.bytes < 2 * 1024 * 1024, `${pkg.files.length} Dateien, ${pkg.bytes} Bytes`);
  const tablePath = arg('table');
  if (tablePath) {
    const raw = readFileSync(tablePath);
    const t = parseHugonnetRates(raw.toString('utf8'));
    let same = 0, cells = 0;
    for (const b of Object.values(all)) PER.forEach((p, i) => { const x = t.rows.get(b.rgi).get(p.key); cells++; if (b.r[i] ? (b.r[i][0] === x.dhdt && b.r[i][1] === x.err) : (x.dhdt == null || x.err == null)) same++; });
    add('D4 Voller Baum gegen die Tabelle: jeder Wert jedes Blocks ist der der Tabelle; die Prüfsumme der Tabelle steht im Bericht', same === cells && createHash('sha256').update(raw).digest('hex') === report.table.sha256 && t.glaciers === report.table.glaciers, `${same}/${cells} Werte, ${t.glaciers} RGI-Gletscher in der Tabelle`);
  }
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n    ${c.detail}` : ''}`);
console.log(`\nverify:glacier-hugonnet ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
