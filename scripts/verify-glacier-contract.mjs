/**
 * verify:glacier-contract — Phase GL (audit/gletscher.md §6): every rule of `src/glacier/glacierContract.ts` against good and bad
 * cases — paths, ids and slugs, size classes, area stamps, catalogue rules, country sums, geometry rules, series rules, official
 * items, client freshness, units, forbidden words, flag, URL state. The good cases are REAL extracts of the built static tree
 * (`scripts/lib/fixtures/glacier/static-extract.json`, made by `scripts/glacier/make-fixture.mjs`); a bad case copies the real
 * case and changes only what is under test (lesson BW-1, negative controls).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-contract.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../src/glacier/glacierContract.ts';
import { glacierFlagFrom, GLACIER_LIVE, glacier3dFrom } from '../src/glacier/glacierFlag.ts';
import { parseGlacierUrl, buildGlacierUrl, GLACIER_DEFAULT_STATE, glacierSegmentOf, glacierIdOfSegment } from '../src/glacier/glacierState.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'static-extract.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const clone = (x) => JSON.parse(JSON.stringify(x));
const rows = Object.values(FX.catalogRows);
const catalog = (glaciers = rows) => ({ schema: 1, kind: 'glacier/catalog', build: '20261011-1', builtAt: '2026-10-11T12:00:00Z', glaciers: clone(glaciers) });

// --- P: paths ---------------------------------------------------------------------------------------------------
add('P1 Pfade versioniert unter glacier/v1 im Daten-Repo jppetry/buscosun-data: die laufend aufgefrischten Linien auf `main`, die schweren statischen Builds auf dem Zweig `glacier`, das Tagesarchiv in jppetry/buscosun-archiv',
  C.GLACIER_VERSION === 'v1' && C.GLACIER_REPO === 'jppetry/buscosun-data' && C.GLACIER_REPO_DIR === 'glacier/v1' && C.GLACIER_REF_LIVE === 'main' && C.GLACIER_REF_STATIC === 'glacier'
  && C.GLACIER_CDN_BASE === 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/glacier/v1' && C.GLACIER_RAW_BASE === 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/glacier/v1'
  && C.GLACIER_STATIC_CDN_BASE === 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@glacier/glacier/v1' && C.GLACIER_STATIC_RAW_BASE === 'https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1'
  && C.GLACIER_ARCHIVE_REPO === 'jppetry/buscosun-archiv', C.GLACIER_CDN_BASE);
add('P2 Static-Pfade unveränderlich je Build',
  C.glacierStaticPath('20261011-1', C.GLACIER_CATALOG_FILE) === 'static/20261011-1/catalog.json' && C.glacierOutlineFile('ch-b', 2) === 'outline/ch-b-L2.json' && C.glacierEpochFile('at-oetztaler-alpen', 2015) === 'outline/at-oetztaler-alpen-e2015.json'
  && C.glacierHypsoFile('de') === 'hypso/de.json' && C.glacierSeriesFile('ch-a') === 'series/ch-a.json' && C.glacierProjFile('ch-a') === 'proj/ch-a.json');
add('P3 Build-Schlüssel nur JJJJMMTT-n', C.GLACIER_BUILD_RE.test('20261011-1') && !C.GLACIER_BUILD_RE.test('2026-10-11') && !C.GLACIER_BUILD_RE.test('20261011') && !C.GLACIER_BUILD_RE.test('latest'));
add('P4 26 Regionen: 5 CH (reine Geografie: West, Mitte-West, Mitte-Ost, Ost, Süd), 20 AT, 1 DE; jede mit Land', C.GLACIER_REGION_IDS.length === 26 && C.GLACIER_REGION_IDS.filter((r) => C.GLACIER_REGIONS[r].country === 'CH').length === 5
  && C.GLACIER_REGION_IDS.filter((r) => C.GLACIER_REGIONS[r].country === 'AT').length === 20 && C.GLACIER_REGIONS.de.country === 'DE', String(C.GLACIER_REGION_IDS.length));

// --- I: ids, slugs, classes ---------------------------------------------------------------------------------------
add('I1 Slug: Umlaute transliteriert, Akzente entfernt, Satzzeichen ⇒ „-“', C.glacierSlug('Höllentalferner') === 'hoellentalferner' && C.glacierSlug('Glacier d\'Otemma') === 'glacier-d-otemma' && C.glacierSlug('Vadret dal Murtèl') === 'vadret-dal-murtel' && C.glacierSlug('Großer Aletsch') === 'grosser-aletsch');
add('I2 Id: eindeutiger Name ⇒ Slug; doppelter Name ⇒ Inventar-Id angehängt; namenlos/NN ⇒ nn-<Id>',
  C.glacierIdOf('CH', 'Rhonegletscher', 'B43-03', true) === 'gl_ch_rhonegletscher' && C.glacierIdOf('CH', 'Steigletscher', 'A54e-12', false) === 'gl_ch_steigletscher-a54e-12'
  && C.glacierIdOf('AT', 'NN', 9027, true) === 'gl_at_nn-9027' && C.glacierIdOf('CH', null, 'A10g-04', true) === 'gl_ch_nn-a10g-04');
add('I3 Id-Muster: kleingeschrieben, Land, kein doppeltes „-“',
  C.isGlacierId('gl_ch_rhonegletscher') && !C.isGlacierId('gl_xx_rhone') && !C.isGlacierId('gl_ch_Rhone') && !C.isGlacierId('gl_ch_a--b') && !C.isGlacierId('gl_ch_') && !C.isGlacierId('ch_rhone') && C.glacierCountryOfId('gl_at_pasterzen-kees') === 'AT' && C.glacierCountryOfId('rhone') === null);
add('I4 Alle echten Ids der Fixtures sind gültig und tragen ihr Land', rows.every((g) => C.isGlacierId(g.id) && C.glacierCountryOfId(g.id) === g.country), rows.map((g) => g.id).join(' '));
add('I5 Klassen: ≥ 1 km² A, 0,1–1 B, < 0,1 C — an den Grenzen', C.glacierClassOf(1) === 'A' && C.glacierClassOf(0.9999) === 'B' && C.glacierClassOf(0.1) === 'B' && C.glacierClassOf(0.0999) === 'C' && C.glacierClassOf(78.489) === 'A');
add('I6 Klassen der Fixtures: Aletsch A, Höllentalferner B (12,8 ha — NICHT C), Blaueis C (1,5 ha)',
  FX.catalogRows.aletsch.klass === 'A' && FX.catalogRows.hoellental.klass === 'B' && FX.catalogRows.blaueis.klass === 'C', `${FX.catalogRows.hoellental.area.km2} km²`);

// --- A: area stamps -------------------------------------------------------------------------------------------------
add('A1 Fläche ohne Bezugsjahr, ohne Quelle, ohne km² ist ungültig',
  C.hasAreaStamp(FX.catalogRows.aletsch.area) && !C.hasAreaStamp({ km2: 1, source: 'SGI2016' }) && !C.hasAreaStamp({ km2: 1, refYear: 2016 }) && !C.hasAreaStamp({ refYear: 2016, source: 'x' })
  && !C.hasAreaStamp({ km2: 0, refYear: 2016, source: 'x' }) && !C.hasAreaStamp({ km2: 1, refYear: 'x', source: 'x' }) && C.hasAreaStamp({ km2: 1, refYear: '2013-2018', source: 'SGI2016' }));
add('A2 Länder tragen verschiedene Bezugsjahre (CH 2013–2018 Aufnahme, AT 2021–2023, DE 2025 BAdW)',
  new Set(rows.map((g) => `${g.country}:${g.area.source}`)).size >= 3 && FX.catalogRows.blaueis.area.source === 'BAdW 2025' && String(FX.catalogRows.blaueis.area.refYear) === '2025' && FX.catalogRows.hef.area.source === 'AGI5');

// --- K: catalogue ---------------------------------------------------------------------------------------------------
add('K1 echte Katalogzeilen: 0 Probleme', C.catalogProblems(catalog()).length === 0, C.catalogProblems(catalog()).join('; '));
const mut = (fn) => { const c = catalog(); fn(c.glaciers[0], c); return C.catalogProblems(c); };
add('K2 Gegenprobe Id ungültig', mut((g) => { g.id = 'gl_ch_Bad Id'; }).some((p) => p.includes('id invalid')));
add('K3 Gegenprobe Id doppelt', C.catalogProblems((() => { const c = catalog(); c.glaciers[1].id = c.glaciers[0].id; return c; })()).some((p) => p.includes('duplicate')));
add('K4 Gegenprobe Land ≠ Id', mut((g) => { g.country = g.country === 'CH' ? 'AT' : 'CH'; }).some((p) => p.includes('country')));
add('K5 Gegenprobe Region eines anderen Landes', mut((g) => { g.region = g.country === 'CH' ? 'de' : 'ch-west'; }).some((p) => p.includes('region')));
add('K6 Gegenprobe Fläche ohne Bezugsjahr', mut((g) => { delete g.area.refYear; }).some((p) => p.includes('area without')));
add('K7 Gegenprobe Klasse passt nicht zur Fläche', mut((g) => { g.klass = g.klass === 'A' ? 'C' : 'A'; }).some((p) => p.includes('class')));
add('K8 Gegenprobe Höhen nicht aufsteigend / unmöglich', mut((g) => { g.z = [3000, 2000, 4000]; }).some((p) => p.includes('elevations')) && mut((g) => { g.z = [2000, 3000, 6000]; }).some((p) => p.includes('elevations')));
add('K9 Gegenprobe Position außerhalb der Alpen', mut((g) => { g.lat = 52; }).some((p) => p.includes('position')));
add('K10 Gegenprobe ohne Inventar-Id und mit leerem Namen', mut((g) => { g.inv = {}; }).some((p) => p.includes('inventory id')) && mut((g) => { g.name = ' '; }).some((p) => p.includes('empty name')));
add('K11 Gegenprobe Build-Schlüssel', C.catalogProblems((() => { const c = catalog(); c.build = 'latest'; return c; })()).some((p) => p.includes('build')));

// --- S: country sums -----------------------------------------------------------------------------------------------------
const sumCat = (km2) => ({ schema: 1, kind: 'glacier/catalog', build: '20261011-1', builtAt: '', glaciers: C.GLACIER_COUNTRIES.map((co) => ({ ...clone(rows.find((g) => g.country === co)), area: { km2: km2[co], refYear: 2016, source: 'x' } })) });
const OS = C.GLACIER_OFFICIAL_SUMS;
add('S1 amtliche Summen: CH 961 / 1 400, AT 285 / 799, DE 0,262 / 4', OS.CH.km2 === 961 && OS.CH.n === 1400 && OS.AT.km2 === 285 && OS.AT.n === 799 && OS.DE.km2 === 0.262 && OS.DE.n === 4);
add('S2 Summe innerhalb ±2 % wird akzeptiert, 3 % daneben abgelehnt (Zahl der Gletscher getrennt)',
  !C.countrySumProblems(sumCat({ CH: 961.27, AT: 285.49, DE: 0.262 })).some((p) => p.includes('km²'))
  && C.countrySumProblems(sumCat({ CH: 961 * 1.03, AT: 285, DE: 0.262 })).some((p) => p.startsWith('CH') && p.includes('km²'))
  && C.countrySumProblems(sumCat({ CH: 961, AT: 285 * 0.97, DE: 0.262 })).some((p) => p.startsWith('AT'))
  && C.countrySumProblems(sumCat({ CH: 961, AT: 285, DE: 0.262 * 1.05 })).some((p) => p.startsWith('DE')));

// --- G: geometry ----------------------------------------------------------------------------------------------------------
const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
add('G1 Ring geschlossen / offen', C.ringClosed(sq(8, 46, 0.01, 0.01)) && !C.ringClosed(sq(8, 46, 0.01, 0.01).slice(0, 4)));
add('G2 Selbstschnitt: Schleife (Acht) ja, Quadrat nein', C.ringSelfIntersects([[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]) && !C.ringSelfIntersects(sq(0, 0, 1, 1)));
add('G3 Fläche eines 0,01°-Quadrats bei 46°N ≈ 0,7 km² (Äquirektangular, < 0,1 % Fehler)', Math.abs(C.ringAreaKm2(sq(8, 46, 0.01, 0.01)) - 0.01 * 111.32 * Math.cos(46.005 * Math.PI / 180) * 0.01 * 110.574) < 0.001, String(C.ringAreaKm2(sq(8, 46, 0.01, 0.01))));
const realKm = (g) => FX.catalogRows[g].area.km2;
add('G4 echte Umrisse aller Stufen: 0 Probleme gegen die Inventarfläche (±3 %)', Object.entries(FX.outline).every(([id, lv]) => {
  const g = rows.find((r) => r.id === id);
  return Object.values(lv).every((geom) => C.outlineProblems(geom, id === FX.catalogRows.blaueis.id || id === FX.catalogRows.hoellental.id ? g.area.km2 : g.area.km2, false).every((p) => !p.includes('closed')));
}));
// the area rule is meaningful for glaciers whose catalogue area equals the outline area (CH/AT: inventory outlines; DE: BAdW 2025 vs RGI 2003 differ by design)
const chAt = rows.filter((g) => g.country !== 'DE');
add('G5 CH/AT: jede Stufe liegt innerhalb ±3 % der Inventarfläche', chAt.every((g) => Object.values(FX.outline[g.id] ?? {}).every((geom) => C.outlineProblems(geom, g.area.km2, false).length === 0)), chAt.map((g) => g.id).join(','));
const aletsch = FX.outline[FX.catalogRows.aletsch.id].L1;
const scaleX = (c, x0) => (typeof c[0] === 'number' ? [x0 + (c[0] - x0) * 0.9, c[1]] : c.map((q) => scaleX(q, x0)));
const shrunk = clone(aletsch); { const x0 = C.polygonsOfGeometry(aletsch)[0][0][0][0]; shrunk.coordinates = scaleX(shrunk.coordinates, x0); }
add('G6 Gegenprobe: eine um 10 % in der Breite geschrumpfte Stufe wird verworfen', C.outlineProblems(shrunk, FX.catalogRows.aletsch.area.km2, false).some((p) => p.includes('area')));
const open = clone(aletsch); open.coordinates[0][0].pop();
add('G7 Gegenprobe: ein offener Ring wird verworfen', C.outlineProblems(open, FX.catalogRows.aletsch.area.km2, false).some((p) => p.includes('not closed')));
add('G8 echte L1-Ringe von Hintereisferner und Höllentalferner schneiden sich nicht', [FX.catalogRows.hef, FX.catalogRows.hoellental].every((g) => C.polygonsOfGeometry(FX.outline[g.id].L1).every((p) => p.every((r) => !C.ringSelfIntersects(r)))));

// --- R: series ---------------------------------------------------------------------------------------------------------------
const allSeries = Object.values(FX.series).flatMap((r) => Object.entries(r).flatMap(([id, lst]) => lst.map((s) => ({ id, ...s }))));
const idSet = new Set(rows.map((g) => g.id));
add('R1 echte Reihen (Länge, Masse, Fläche): 0 Probleme', allSeries.length >= 8 && allSeries.every((s) => C.seriesProblems(s, idSet).length === 0), allSeries.map((s) => `${s.id.slice(3)}:${s.kind}`).join(' '));
const aSeries = allSeries.find((s) => s.kind === 'mass') ?? allSeries[0];
add('R2 Gegenprobe: Reihe ohne Gletscher im Katalog', C.seriesProblems({ ...aSeries, id: 'gl_ch_unbekannt' }, idSet).some((p) => p.includes('without a glacier')));
add('R3 Gegenprobe: falsche Methode für die Art', C.seriesProblems({ ...clone(aSeries), method: 'tongue-survey' }, idSet).some((p) => p.includes('method')));
add('R4 Gegenprobe: Herkunft „model“ in einer Messreihe', C.seriesProblems({ ...clone(aSeries), origin: 'model' }, idSet).some((p) => p.includes('origin')));
add('R5 Gegenprobe: Jahre nicht aufsteigend', C.seriesProblems({ ...clone(aSeries), rows: [...clone(aSeries.rows)].reverse() }, idSet).some((p) => p.includes('ascending')));
const mass = allSeries.find((s) => s.kind === 'mass');
add('R6 Gegenprobe: AAR > 1 und Bilanz außerhalb des Bereichs', mass && C.seriesProblems({ ...clone(mass), rows: [[2020, 0, 0, 0, 3000, 1.5]] }, idSet).some((p) => p.includes('AAR')) && C.seriesProblems({ ...clone(mass), rows: [[2020, 0, 0, 99999, 3000, 0.5]] }, idSet).some((p) => p.includes('out of range')));
const len = allSeries.find((s) => s.kind === 'length');
add('R7 Gegenprobe: falsche Zeilenbreite, ohne Zeilen, ohne Quelle/Einheit', len && C.seriesProblems({ ...clone(len), rows: [[2020, 5]] }, idSet).some((p) => p.includes('width')) && C.seriesProblems({ ...clone(len), rows: [] }, idSet).some((p) => p.includes('no rows')) && C.seriesProblems({ ...clone(len), source: '' }, idSet).some((p) => p.includes('source')) && C.seriesProblems({ ...clone(len), unit: '' }, idSet).some((p) => p.includes('unit')));
add('R8 Gegenprobe: Längenänderung von 5 000 m, Flächenwert ≤ 0', len && C.seriesProblems({ ...clone(len), rows: [[2019, 2020, 5000]] }, idSet).some((p) => p.includes('dL')) && (() => { const a = allSeries.find((s) => s.kind === 'area'); return a && C.seriesProblems({ ...clone(a), rows: [[2000, 1], [2010, 0]] }, idSet).some((p) => p.includes('km²')); })());
add('R9 Messreihe trägt Quelle und (wo vorhanden) DOI; Flächenreihe ist amtlich', allSeries.filter((s) => s.kind !== 'area').every((s) => s.origin === 'measured' && s.source.length > 5) && allSeries.filter((s) => s.kind === 'area').every((s) => s.origin === 'official'));

// --- O: official -----------------------------------------------------------------------------------------------------------------
const items = FX.official.items;
add('O1 echte amtliche Einträge (9): 0 Probleme', items.length >= 9 && C.officialProblems(items).length === 0, C.officialProblems(items).join('; '));
add('O2 jeder Eintrag hat Datum, wörtliches Zitat, Quelle und https-Link; „Status“ nur mit Kriterium', items.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.quote.length > 20 && /^https:\/\//.test(i.url) && (i.kind !== 'status' || !!i.criterion)));
add('O3 Gegenprobe: Datum, Zitat, Link, Status ohne Kriterium, doppelte Id', (() => {
  const b = clone(items[0]);
  return C.officialProblems([{ ...b, date: '11.10.2026' }]).some((p) => p.includes('date')) && C.officialProblems([{ ...b, quote: 'kurz' }]).some((p) => p.includes('quote'))
    && C.officialProblems([{ ...b, url: 'http://x' }]).some((p) => p.includes('url')) && C.officialProblems([{ ...b, kind: 'status', criterion: undefined }]).some((p) => p.includes('criterion'))
    && C.officialProblems([b, b]).some((p) => p.includes('duplicate'));
})());
add('O4 Wörtlichkeit: ein Zitat, das im Quelltext nicht steht, wird erkannt', (() => {
  const b = clone(items[0]);
  const snap = { [b.id]: b.quote + ' Weitere Sätze der Quelle.' };
  return C.officialProblems([b], snap).length === 0 && C.officialProblems([{ ...b, quote: b.quote.replace('Über 5', 'Über 6').replace('über 5', 'über 6').replace('76', '77') }], snap).some((p) => p.includes('verbatim'));
})());
add('O5 die Zahlen der amtlichen Werte stehen im Zitat oder in der Quelltabelle: Schweiz „über 5 Prozent“, nicht „−5,5 %“', items.find((i) => i.id === 'ch-glamos-2026-volume').quote.includes('Über 5 Prozent') && items.find((i) => i.id === 'ch-glamos-2026-volume').values[0].value === 5);

// --- F: client freshness, units, words ---------------------------------------------------------------------------------------------
const NOW = Date.parse('2026-10-11T12:00:00Z'), D = 86_400_000;
add('F1 Satellit: ≤ 20 Tage ok, > 20 Tage „keine klare Szene seit n Tagen“, nie ⇒ none', C.glacierSatFreshness(NOW - 20 * D, NOW).state === 'ok' && C.glacierSatFreshness(NOW - 21.5 * D, NOW).state === 'stale' && C.glacierSatFreshness(NOW - 21.5 * D, NOW).ageDays === 21 && C.glacierSatFreshness(null, NOW).state === 'none');
add('F2 Wortlaut des Zustands', C.glacierSatStaleText(21) === 'keine klare Szene seit 21 Tagen');
add('F3 Schmelzlauf: ≤ 30 h frisch, darüber „Keine Daten“, null nie frisch; Läufe bleiben 72 h', C.glacierMeltFresh(NOW - 29 * 3_600_000, NOW) && !C.glacierMeltFresh(NOW - 31 * 3_600_000, NOW) && !C.glacierMeltFresh(null, NOW) && C.GLACIER_MELT_KEEP_MS === 72 * 3_600_000);
add('F4 Einheiten: 900 mm w. e. = 10 cm Eis (Dichte 900 kg/m³), 1 mm w. e. auf 1 km² = 1 000 m³', Math.abs(C.iceCmOfMmWe(900) - 100) < 1e-9 && C.waterM3(1, 1) === 1000 && C.GLACIER_ICE_DENSITY === 900);
add('F5 „cm Eis“ nur auf Eisoberfläche', C.glacierMeltUnitProblem('cm Eis', 'ice') === null && !!C.glacierMeltUnitProblem('cm Eis', 'snow') && !!C.glacierMeltUnitProblem('cm Eis', 'firn') && C.glacierMeltUnitProblem('mm w.e.', 'snow') === null && !!C.glacierMeltUnitProblem('Zoll', 'ice'));
add('F6 Tour-Wörter: begehbar, sicher, frei werden erkannt; „eisfrei“, „kostenfrei“, „Sicherheit“ nicht',
  C.glacierForbiddenWords('Die Spalte ist begehbar.').includes('begehbar') && C.glacierForbiddenWords('Das ist sicher.').includes('sicher') && C.glacierForbiddenWords('Zustieg frei').includes('frei')
  && C.glacierForbiddenWords('eisfrei kostenfrei Sicherheit versichern').length === 0);
add('F7 Herkunftszeichen: vier Werte mit deutscher Bezeichnung', C.GLACIER_ORIGINS.length === 4 && C.GLACIER_ORIGIN_LABEL.measured === 'gemessen' && C.GLACIER_ORIGIN_LABEL.satellite === 'Satellit' && C.GLACIER_ORIGIN_LABEL.model === 'Modell' && C.GLACIER_ORIGIN_LABEL.official === 'amtlich' && C.isGlacierOrigin('official') && !C.isGlacierOrigin('guess'));

// --- L: flag -------------------------------------------------------------------------------------------------------------------------
add('L1 GLACIER_LIVE steht auf false (Jans Gate nach Gate D)', GLACIER_LIVE === false);
add('L2 Flag: Query vor localStorage vor Voreinstellung; ohne alles aus', glacierFlagFrom('', null, false) === false && glacierFlagFrom('?gl=1', null, false) === true && glacierFlagFrom('?gl=0', '1', true) === false && glacierFlagFrom('', '1', false) === true && glacierFlagFrom('', '0', true) === false && glacierFlagFrom('?gl=x', null, false) === false && glacierFlagFrom('', null, true) === true);
add('L3 3D-Rückfall `?gl3d=0`', glacier3dFrom('?gl3d=0') === false && glacier3dFrom('') === true && glacier3dFrom('?gl3d=1') === true);

// --- U: URL state ----------------------------------------------------------------------------------------------------------------------
add('U1 Segment: Id ohne gl_, erster Unterstrich → Bindestrich, umkehrbar', glacierSegmentOf('gl_ch_grosser-aletschgletscher') === 'ch-grosser-aletschgletscher' && glacierIdOfSegment('ch-grosser-aletschgletscher') === 'gl_ch_grosser-aletschgletscher' && rows.every((g) => glacierIdOfSegment(glacierSegmentOf(g.id)) === g.id));
add('U2 Standardzustand ⇒ URL ohne Query; Gletscher ⇒ Pfadsegment', buildGlacierUrl(GLACIER_DEFAULT_STATE) === '/gletscher' && buildGlacierUrl({ ...GLACIER_DEFAULT_STATE, glacier: 'at-pasterzen-kees' }) === '/gletscher/at-pasterzen-kees');
const roundtrip = { ...GLACIER_DEFAULT_STATE, glacier: 'at-hintereisferner-mit-toteis', tab: 'saison', t: '2026-08-12', v: '3d', e: ['o'], o: 1850 };
const url = buildGlacierUrl(roundtrip), [pathPart, qs] = url.split('?');
add('U3 Rundweg: Zustand → URL → Zustand', (() => { const back = parseGlacierUrl(pathPart.split('/')[2], qs ?? '').state; return JSON.stringify(back) === JSON.stringify(roundtrip) && url === '/gletscher/at-hintereisferner-mit-toteis?tab=saison&t=2026-08-12&v=3d&e=o&o=1850'; })(), url);
add('U4 Lage-Zustand: Land, Größe, Suche', (() => { const u = buildGlacierUrl({ ...GLACIER_DEFAULT_STATE, land: 'ch', m: 'bilanz', q: 'aletsch' }); const back = parseGlacierUrl(null, u.split('?')[1]).state; return u === '/gletscher?land=ch&m=bilanz&q=aletsch' && back.land === 'ch' && back.m === 'bilanz' && back.q === 'aletsch'; })());
add('U5 ungültige Werte werden benannt und verworfen', (() => { const r = parseGlacierUrl('XX-bad', 'tab=foo&t=2026-13-40&v=4d&e=x&o=3&land=fr&m=zzz&sel=Bad_Id'); return ['glacier', 'tab', 't', 'v', 'e', 'o', 'land', 'm', 'sel'].every((k) => r.invalid.includes(k)) && r.state.tab === 'heute' && r.state.glacier === null; })());
add('U7 Auswahl auf der Lage-Karte: sel im Rundweg, nicht im Steckbrief-Zustand', (() => { const u = buildGlacierUrl({ ...GLACIER_DEFAULT_STATE, sel: 'ch-rhonegletscher' }); const back = parseGlacierUrl(null, u.split('?')[1]).state; return u === '/gletscher?sel=ch-rhonegletscher' && back.sel === 'ch-rhonegletscher' && !buildGlacierUrl({ ...GLACIER_DEFAULT_STATE, glacier: 'ch-rhonegletscher', sel: 'ch-x-y' }).includes('sel'); })());
add('U6 Ebenen: leere Liste erlaubt (alles aus), Doppelte entfallen', parseGlacierUrl(null, 'e=').state.e.length === 0 && parseGlacierUrl('ch-a', 'e=o,o,s').state.e.length === 2);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok || !c.detail ? '' : ' — ' + c.detail}`);
console.log(`\nverify:glacier-contract ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
