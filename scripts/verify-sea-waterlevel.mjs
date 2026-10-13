/**
 * verify:sea-waterlevel — Phase WL (`audit/wasserstand-bsh.md`): the rules of the BSH water level line.
 * Endpoint discipline (E-WL-3), the parsers against the measured type traps (V-WL-2), the catalogue rules
 * incl. the placeholder finding (V-WL-7), the quoting rules for the official category and text (E-WL-6/8),
 * the attribution (E-WL-5) and the switch (E-WL-1) — each with a negative control, so a check that claims an
 * absence has to prove it can fail.
 *
 * Fixtures are the REAL answers of three gauges (North Sea with curve + events, Baltic with curve only,
 * North Sea with events only) and the catalogue our own producer built from the live service.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-waterlevel.mjs [--live]
 *
 * `--live` additionally asks the real service (CORS, form, licence field, timestamps) — not in CI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WL_ATTRIBUTION, WL_ATTRIBUTION_POST, WL_ATTRIBUTION_PRE, WL_BBOX, WL_CATALOG_PATH, WL_CATALOG_PRODUCT,
  WL_COLLECTION, WL_CURVE_STALE_MS, WL_FORECAST_STALE_MS, WL_LANG, WL_LICENCE, WL_LICENCE_URL, WL_PARAM_DOC,
  WL_REGION_LABEL, WL_SERVICE, WL_SERVICE_PAGE, WL_WARN_DEFAULT, WL_WARN_LEVELS, WL_WARN_SERVICE,
  wlAt, wlCatalogProblems, wlDistKm, wlForecastOf, wlGaugeOf, wlGaugePage, wlHasCategory, wlIsDefaultWarning,
  WL_AT_TOLERANCE_MS, WL_MOS_SYSTEMS, WL_MOS_WHY, wlCurveEnd,
  wlItemUrl, wlItemsUrl, wlNearest, wlNextEvents, wlNum, wlRefPair, wlStr, wlText, wlTime,
  wlFill, wlFillScale,
} from '../src/sea/waterLevel.ts';
import { seaWaterLevelFrom } from '../src/sea/seaFlag.ts';
import { WL_MIN_GAUGES, buildCatalog } from './sea/sea-gauges.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'lib', 'fixtures', 'sea', 'waterlevel');
const SRC = join(HERE, '..', 'src', 'sea');
const read = (f) => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const src = (f) => readFileSync(join(SRC, f), 'utf8');

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const readoutSrc = src('SeaReadout.tsx');
const cux = read('cuxhaven_steubenhoeft.json');   // Nordsee: Kurve + Hoch-/Niedrigwasser
const warn = read('warnemuende.json');            // Ostsee: nur Kurve, keine Gezeit
const amrum = read('amrum_odde.json');            // Nordsee: nur Ereignisse, keine Kurve
const cat = read('gauges.json');

// --- A: endpoint and parameters (E-WL-3, V-WL-1) ----------------------------------------------------
add('A1 Nur die offizielle OGC API; Sammlung und Dienst wie vermessen',
  WL_SERVICE === 'https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast' && WL_COLLECTION === 'waterlevelforecastdata'
  && wlItemUrl('cuxhaven_steubenhoeft') === `${WL_SERVICE}/collections/${WL_COLLECTION}/items/cuxhaven_steubenhoeft?f=json&lang=de`,
  wlItemUrl('cuxhaven_steubenhoeft'));
add('A2 V-WL-1: jede URL nennt lang= (der 301-Hop ohne CORS entfällt)',
  wlItemsUrl().includes(`lang=${WL_LANG}`) && wlItemUrl('x').includes(`lang=${WL_LANG}`) && WL_LANG === 'de',
  wlItemsUrl());
add('A3 Seitenweise Abfrage mit limit/offset; Kennungen werden kodiert',
  wlItemsUrl(1000, 0) === `${WL_SERVICE}/collections/${WL_COLLECTION}/items?f=json&lang=de&limit=1000`
  && wlItemsUrl(500, 500).endsWith('&limit=500&offset=500') && wlItemUrl('a/b?c').includes('a%2Fb%3Fc'),
  wlItemUrl('a/b?c'));
add('A4 Lizenz, Lizenzlink, Parameterdoku und amtlicher Warndienst als Konstanten',
  WL_LICENCE === 'CC BY 4.0' && WL_LICENCE_URL.startsWith('https://creativecommons.org/licenses/by/4.0/')
  && WL_PARAM_DOC === 'https://www2.bsh.de/aktdat/wvd/api/parameter_documentation.pdf'
  && WL_WARN_SERVICE === 'https://www.sturmflutwarndienst.de' && WL_SERVICE_PAGE.startsWith(WL_SERVICE),
  WL_WARN_SERVICE);
add('A5 Attribution wörtlich wie beauftragt, und die zwei Hälften ergeben wieder das Ganze (E-WL-5)',
  WL_ATTRIBUTION === 'Wasserstandsvorhersage: Bundesamt für Seeschifffahrt und Hydrographie (BSH), CC BY 4.0, eigene Darstellung'
  && `${WL_ATTRIBUTION_PRE}${WL_LICENCE}${WL_ATTRIBUTION_POST}` === WL_ATTRIBUTION,
  WL_ATTRIBUTION);

// --- B: parsers against the measured type traps (V-WL-2) --------------------------------------------
add('B1 wlNum liest Zahl UND Zahlenstring; "", "nan", null, Unsinn werden null — nie 0',
  wlNum(676) === 676 && wlNum('685') === 685 && wlNum('-12') === -12 && wlNum(0) === 0
  && wlNum('') === null && wlNum('nan') === null && wlNum('NaN') === null && wlNum(null) === null
  && wlNum(undefined) === null && wlNum('685 cm') === null && wlNum(NaN) === null && wlNum(Infinity) === null,
  `${wlNum('685')} / ${wlNum('nan')}`);
add('B2 wlStr: "nan" und Leerstring sind Abwesenheit, kein Name',
  wlStr('Elbe') === 'Elbe' && wlStr(' Elbe ') === 'Elbe' && wlStr('nan') === null && wlStr('') === null && wlStr(5) === null, '');
add('B3 wlTime liest den Dienst-Stempel mit Leerzeichen und Offset; Unsinn wird null',
  wlTime('2026-10-12 15:03:00+02:00') === Date.parse('2026-10-12T15:03:00+02:00')
  && wlTime('2026-10-12T15:03:00Z') === Date.parse('2026-10-12T15:03:00Z')
  && wlTime('') === null && wlTime('morgen') === null && wlTime(null) === null,
  String(wlTime('2026-10-12 15:03:00+02:00')));
add('B4 E-WL-8: wlText nimmt die Auszeichnung weg und lässt die Wörter unverändert',
  wlText('Am Montag <b>1 bis 3 dm </b><b>höher</b> als das mittlere Hochwasser.') === 'Am Montag 1 bis 3 dm höher als das mittlere Hochwasser.'
  && wlText({ de: 'Text <b>fett</b>', en: 'ignored' }) === 'Text fett'
  && wlText('a<br>b') === 'a b' && wlText('&amp;&lt;&gt;&nbsp;x') === '&<> x'
  && wlText({ de: '' }) === null && wlText('') === null && wlText('<b></b>') === null,
  String(wlText('a<br>b')));
add('B5 Gegenkontrolle: ein Parser, der Strings NICHT liest, würde den echten Pegelstand verlieren',
  typeof cux.properties.curve[0].tidal_prediction === 'string' && typeof cux.properties.curve[0].measurement === 'string'
  && typeof cux.properties.high_water_low_water[0].forecast_value === 'number'
  && typeof cux.properties.high_water_low_water[0].tidal_prediction_value === 'string'
  && Number(cux.properties.curve[0].tidal_prediction) > 0,
  `curve.tidal_prediction=${typeof cux.properties.curve[0].tidal_prediction}, forecast_value=${typeof cux.properties.high_water_low_water[0].forecast_value}`);

// --- C: no other source than the official API (G-WL-2) ---------------------------------------------
const seaSources = readdirSync(SRC).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, src(f)]);
const FORBIDDEN = [/wasserstand\.bsh\.de\/[a-z]/i, /www2\.bsh\.de\/aktdat\/wvd\/api\/[a-z]+\.(json|php)/i, /pegelonline\.wsv\.de\/webservices/i];
const offenders = seaSources.filter(([, t]) => FORBIDDEN.some((re) => re.test(t.replace(/wlGaugePage|WL_PARAM_DOC/g, ''))));
add('C1 Kein Abruf gegen wasserstand.bsh.de, interne Endpoints oder PEGELONLINE-Webservices',
  offenders.length === 0, offenders.map(([f]) => f).join(', '));
add('C1b Gegenkontrolle: das Muster erkennt einen solchen Abruf',
  FORBIDDEN.some((re) => re.test("fetch('https://wasserstand.bsh.de/cuxhaven_steubenhoeft')")), '');
const client = src('waterLevelClient.ts');
add('C2 Der Leser holt die Vorhersage ausschließlich über wlItemUrl, den Katalog über fetchSea',
  /loadGaugeForecast/.test(client) && /doFetch\(wlItemUrl\(id\)/.test(client) && /fetchSea\(WL_CATALOG_PATH/.test(client)
  && !/https?:\/\//.test(client.replace(/^\s*\*.*$/gm, '')),
  '');
add('C3 wlGaugePage ist ein Deep-Link, kein Abrufpfad (nur href)',
  wlGaugePage('cuxhaven_steubenhoeft') === 'https://wasserstand.bsh.de/cuxhaven_steubenhoeft'
  && /href=\{doc\.url\}/.test(src('SeaReadout.tsx')) && !new RegExp('fetch\\([^)]*wlGaugePage').test(seaSources.map(([, t]) => t).join('\n')),
  '');

// --- D: catalogue rules (E-WL-2, V-WL-7) ------------------------------------------------------------
add('D1 Der gespiegelte Katalog trägt Produkt, Herkunft, Lizenz und Attribution in der Datei',
  cat.product === WL_CATALOG_PRODUCT && cat.licence === WL_LICENCE && cat.attribution === WL_ATTRIBUTION
  && cat.source.startsWith(WL_SERVICE) && typeof cat.about === 'string' && cat.about.includes('OGC API')
  && typeof cat.copyright === 'string' && cat.copyright.includes('BSH'),
  cat.source);
add('D2 136 Pegel, Nordsee/Ostsee getrennt, alle innerhalb der Dienst-BBox, keine Regelverletzung',
  cat.gauges.length === 136 && cat.gauges.filter((g) => g.region === 'north_sea').length === 82
  && cat.gauges.filter((g) => g.region === 'baltic_sea').length === 54
  && cat.gauges.length >= WL_MIN_GAUGES && wlCatalogProblems(cat.gauges).length === 0,
  `${cat.gauges.length} Pegel, ${wlCatalogProblems(cat.gauges).length} Probleme`);
const good = cat.gauges[0];
const bad = wlCatalogProblems([
  good, { ...good },
  { ...good, id: 'ohneName', name: '' },
  { ...good, id: 'draussen', lon: WL_BBOX[2] + 1 },
  { ...good, id: 'revier', region: 'mediterranean' },
  { ...good, id: 'verdreht', mhwCm: 300, mlwCm: 400 },
  { ...good, id: 'leer', has: { curve: false, events: false } },
]);
add('D3 Regeln melden: doppelt, ohne Name, außerhalb der BBox, falsches Revier, MHW unter MNW, ohne jeden Inhalt',
  bad.some((p) => p.includes('doppelt')) && bad.some((p) => p.includes('ohneName: Name fehlt'))
  && bad.some((p) => p.includes('draussen: außerhalb')) && bad.some((p) => p.includes('revier: Revier'))
  && bad.some((p) => p.includes('verdreht: MHW 300 unter MNW 400')) && bad.some((p) => p.includes('leer: weder Kurve')),
  bad.join(' | '));
add('D4 V-WL-7: gleiches MThw/MTnw ist in der tidenlosen Ostsee ERLAUBT (prerow 500/500), 0/0 wird zur Abwesenheit',
  wlCatalogProblems([{ ...good, id: 'ostsee', mhwCm: 500, mlwCm: 500 }]).length === 0
  && wlRefPair(500, 500)[0] === 500 && wlRefPair(0, 0)[0] === null && wlRefPair(0, 0)[1] === null
  && wlRefPair(656, 366)[0] === 656 && wlRefPair(null, 0)[1] === 0,
  '');
const prerow = cat.gauges.find((g) => g.id === 'prerow');
const danish = cat.gauges.filter((g) => ['fynshav', 'sonderborg'].includes(g.id));
add('D4b Am echten Katalog: prerow behält 500/500, die zwei dänischen Pegel tragen keine Bezugshöhen mehr',
  prerow?.mhwCm === 500 && prerow?.mlwCm === 500 && prerow?.zeroNhnCm === -498
  && danish.length === 2 && danish.every((g) => g.mhwCm === null && g.mlwCm === null && g.state === null),
  `prerow ${prerow?.mhwCm}/${prerow?.mlwCm}, dänisch ${danish.map((g) => `${g.id}:${g.mhwCm}`).join(',')}`);
add('D5 Producer: eine Antwort ohne Pegel oder mit fremder Lizenz wird nicht veröffentlicht',
  buildCatalog([], Date.now(), null).doc.gauges.length === 0 && WL_MIN_GAUGES >= 100
  && buildCatalog([{ id: 'x', properties: {} }], Date.now(), null).dropped.length === 1,
  '');
add('D6 Lage und Entfernung: der nächste Pegel wird nach Großkreis gewählt, nicht interpoliert (E-WL-7)',
  Math.round(wlDistKm(54.0, 8.0, 54.0, 8.0)) === 0 && Math.abs(wlDistKm(53.867778, 8.7175, 54.0, 8.7175) - 14.7) < 0.3
  && wlNearest(cat.gauges, 53.8678, 8.7175)?.gauge.id === 'cuxhaven_steubenhoeft'
  && wlNearest([], 54, 8) === null && !/interpol/i.test(src('waterLevel.ts').replace(/No interpolation[^\n]*/g, '')),
  String(wlNearest(cat.gauges, 53.8678, 8.7175)?.gauge.id));

// --- E: the official category is quoted, never computed (E-WL-6) ------------------------------------
add('E1 Die Kategorien stehen wörtlich wie in der Parameterdoku (Tab. 5), Normalfall benannt',
  WL_WARN_LEVELS.length === 9 && WL_WARN_LEVELS[0] === WL_WARN_DEFAULT && WL_WARN_DEFAULT === 'Wasserstandsvorhersage'
  && WL_WARN_LEVELS.includes('Sturmflut') && WL_WARN_LEVELS.includes('Sehr schwere Sturmflut')
  && WL_WARN_LEVELS.includes('Erhoehter Wasserstand') && WL_WARN_LEVELS.includes('Sehr schweres Niedrigwasser'),
  WL_WARN_LEVELS.join(' | '));
add('E2 Keine Schwelle im Code: nirgends wird aus +1,5 m eine Kategorie gerechnet',
  !/WL_WARN_LEVELS\s*\[\s*[1-8]/.test(src('waterLevel.ts')) && !/1\.5|2\.5|3\.5|0\.75/.test(src('waterLevel.ts').replace(/^\s*\*.*$/gm, ''))
  && !/WL_WARN_LEVELS/.test(src('SeaReadout.tsx')),
  '');
const fcCux = wlForecastOf(cux, Date.parse('2026-10-12T15:30:00Z'));
add('E3 Am echten Pegel ist der Normalfall gemeldet ⇒ keine Kategorie über den Zahlen (V-WL-3)',
  fcCux.warningLevel === 'Wasserstandsvorhersage' && wlHasCategory(fcCux) === null
  && wlIsDefaultWarning('Wasserstandsvorhersage') && wlIsDefaultWarning(null) && wlIsDefaultWarning(undefined),
  String(fcCux.warningLevel));
const storm = { ...cux, properties: { ...cux.properties, official_warning_level_region: 'Schwere Sturmflut' } };
const stormEvent = {
  ...cux,
  properties: {
    ...cux.properties,
    high_water_low_water: cux.properties.high_water_low_water.map((e, i) => (i === 1 ? { ...e, forecast_automated_event_warning: 'Sturmflut' } : e)),
  },
};
add('E4 V-WL-3: der Warnfall wird aus den Daten erkannt — Gebiet, Pegel und Einzelereignis',
  wlHasCategory(wlForecastOf(storm)) === 'Schwere Sturmflut'
  && wlHasCategory(wlForecastOf(stormEvent)) === 'Sturmflut'
  && wlHasCategory(wlForecastOf({ ...cux, properties: { ...cux.properties, automated_gauge_warning: 'Niedrigwasser' } })) === 'Niedrigwasser'
  && !wlIsDefaultWarning('Sturmflut'),
  '');
const readout = src('SeaReadout.tsx');
add('E5 Die Anzeige nennt die Kategorie als BSH-Wortlaut, sagt dass sie nicht pegelgenau gilt, und verlinkt den amtlichen Dienst',
  /Kategorie des BSH, wörtlich/.test(readout) && /nicht für diesen\s*\n?\s*Pegel/.test(readout)
  && /WL_WARN_SERVICE/.test(readout) && /buscosun warnt nicht/.test(readout),
  '');
add('E5b Der amtliche Warndienst ist IMMER verlinkt, nicht nur im Warnfall (Auftrag 5)',
  (readout.match(/WL_WARN_SERVICE/g) ?? []).length >= 2 && /WaterLevelFooter/.test(readout)
  && /href=\{WL_WARN_SERVICE\}/.test(readout.slice(readout.indexOf('function WaterLevelFooter'))),
  '');
add('E6 Kein eigener Warnton: die Karte nutzt keine Warnklasse der Seite für den Wasserstand',
  !/sw-wl-cat[^\n]*is-warn/.test(readout) && !/is-warn[^\n]*sw-wl-cat/.test(readout)
  && /sw-wl-cat/.test(src('seaDeck.css')) && !/#B5482E|#8A3320/.test(src('seaDeck.css').slice(src('seaDeck.css').indexOf('.sw-wl-cat'), src('seaDeck.css').indexOf('.sw-disclaimer a'))),
  '');
/** Code without comments — a rule about the code must not trip over a comment that names the rule. */
const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
add('E7 Der Text wird zitiert, nie ausgespielt: kein dangerouslySetInnerHTML in der Seewetter-Linie',
  !seaSources.some(([, t]) => /dangerouslySetInnerHTML/.test(bare(t)))
  && /dangerouslySetInnerHTML/.test(src('waterLevel.ts')),
  'Gegenkontrolle: der Kommentar nennt es, der Code nicht');

// --- F: the live forecast against the real answers (V-WL-6) ----------------------------------------
add('F1 Nordsee-Pegel: Kurve UND Ereignisse, Stempel, Einheiten, Lizenz je Datensatz',
  fcCux.id === 'cuxhaven_steubenhoeft' && fcCux.region === 'north_sea' && fcCux.area === 'Elbe'
  && fcCux.curve.length === 120 && fcCux.events.length === 23
  && fcCux.forecastAt === Date.parse(cux.properties.forecast_timestamp.replace(' ', 'T'))
  && fcCux.curveAt === Date.parse(cux.properties.automated_curveforecast_timestamp.replace(' ', 'T'))
  && fcCux.mhwCm === 656 && fcCux.mlwCm === 366 && fcCux.zeroNhnCm === -503 && fcCux.chartDatumCm === 302
  && fcCux.licence === WL_LICENCE && fcCux.copyright.includes('SeeAufG'),
  `${fcCux.curve.length} Punkte, ${fcCux.events.length} Ereignisse`);
add('F2 Die Kurve ist sortiert, trägt nur belegte Zeilen, und Strings sind Zahlen geworden',
  fcCux.curve.every((p, i, a) => i === 0 || p.t >= a[i - 1].t)
  && fcCux.curve.every((p) => p.tide != null || p.forecast != null || p.measured != null)
  && fcCux.curve.every((p) => [p.tide, p.forecast, p.measured].every((v) => v == null || typeof v === 'number'))
  && fcCux.curve.some((p) => p.measured != null) && fcCux.curve.some((p) => p.forecast != null) && fcCux.curve.some((p) => p.tide != null),
  '');
const ev0 = fcCux.events[0];
add('F3 Ereignis: Art, Höhe, Unsicherheit als Zahl; die Abweichung bleibt der zitierte Text',
  (ev0.kind === 'HW' || ev0.kind === 'NW') && typeof ev0.forecast === 'number' && typeof ev0.uncertaintyCm === 'number'
  && ev0.deviation === '+0,2 m' && ev0.warning === 'Wasserstandsvorhersage' && ev0.forecastAt != null
  && fcCux.events.every((e) => e.kind === 'HW' || e.kind === 'NW')
  && fcCux.events.filter((e) => e.kind === 'HW').length > 0 && fcCux.events.filter((e) => e.kind === 'NW').length > 0,
  `${ev0.kind} ${ev0.forecast} ±${ev0.uncertaintyCm} "${ev0.deviation}"`);
// V-WL-8: the official height stops at about +21 h; beyond it only MOS carries a number. Measured on the
// whole collection: official −4,5 … +20,9 h, MOS −13,2 … +133,6 h, 732 of 1 863 events MOS-only.
const late = fcCux.events.filter((e) => e.forecast == null && e.mosCm != null);
const early = fcCux.events.filter((e) => e.forecast != null);
add('F3b V-WL-8: der amtliche Wert endet nach ≈ 1 Tag, danach trägt nur MOS eine Zahl — beides getrennt gelesen',
  early.length > 0 && late.length > 0 && early.length + late.length <= fcCux.events.length
  && early.every((e) => e.uncertaintyCm != null) && late.every((e) => e.uncertaintyCm == null)
  && late.every((e) => e.mosSystem !== null && WL_MOS_SYSTEMS.includes(e.mosSystem))
  && Math.max(...early.map((e) => e.t)) < Math.min(...late.map((e) => e.t)),
  `${early.length} amtlich (mit ±), ${late.length} nur MOS, Systeme ${[...new Set(late.map((e) => e.mosSystem))].join('/')}`);
add('F3c Der MOS-Wert wird als erster verfügbarer von r0 … r5 gelesen, mit genanntem System (Tab. 3)',
  wlForecastOf({ id: 'x', properties: { high_water_low_water: [{ event_timestamp: '2026-10-12 15:03:00+02:00', event: 'HW', mos_forecast_r3_value: 512, mos_forecast_r3_deviation: '-0,1 m' }] } }).events[0].mosSystem === 'r3'
  && wlForecastOf({ id: 'x', properties: { high_water_low_water: [{ event_timestamp: '2026-10-12 15:03:00+02:00', event: 'HW', mos_forecast_r0_value: 500, mos_forecast_r3_value: 512 }] } }).events[0].mosCm === 500
  && wlForecastOf({ id: 'x', properties: { high_water_low_water: [{ event_timestamp: '2026-10-12 15:03:00+02:00', event: 'HW' }] } }).events[0].mosSystem === null
  && WL_MOS_SYSTEMS.length === 6 && Object.keys(WL_MOS_WHY).length === 6 && WL_MOS_WHY.r0 === 'Hauptsystem',
  '');
add('F3d Die Anzeige nennt die Herkunft je Zeile und sagt, wo die amtliche Höhe endet',
  /automatisch \(MOS \$\{e\.mosSystem\}\)/.test(readoutSrc) && /'amtlich'/.test(readoutSrc)
  && /Die amtliche Höhe gibt das BSH etwa einen Tag voraus/.test(readoutSrc)
  && /nur den Zeitpunkt, keine Höhe/.test(readoutSrc) && /nur Zeit, kein Wert/.test(readoutSrc),
  '');
const fcWarn = wlForecastOf(warn);
add('F4 Ostsee-Pegel: Kurve ohne Gezeit, keine Ereignisse, 15-min-Schritt',
  fcWarn.region === 'baltic_sea' && fcWarn.events.length === 0 && fcWarn.curve.length === 337
  && fcWarn.curve.every((p) => p.tide === null) && fcWarn.curve[1].t - fcWarn.curve[0].t === 900_000
  && WL_REGION_LABEL[fcWarn.region] === 'Ostsee',
  `${fcWarn.curve.length} Punkte`);
const fcAmrum = wlForecastOf(amrum);
add('F5 V-WL-6: Pegel ohne Kurve — nur Ereignisse, leere Kurve, kein erfundener Wert',
  fcAmrum.curve.length === 0 && fcAmrum.events.length === 23 && wlAt(fcAmrum.curve, Date.now()) === null
  && !('curve' in amrum.properties), `${fcAmrum.events.length} Ereignisse`);
add('F6 Unbrauchbare Antworten werden null, nicht halbleer',
  wlForecastOf(null) === null && wlForecastOf({}) === null && wlForecastOf({ id: 'x' }) === null
  && wlGaugeOf({ id: 'x', properties: {} }) === null && wlGaugeOf(null) === null
  && wlGaugeOf({ id: 'x', properties: { latitude: 54, longitude: 8 } })?.lat === 54,
  '');
const t0 = Date.parse('2026-10-12T06:00:00+02:00');
const cEnd = wlCurveEnd(fcCux.curve);
add('F7 wlAt nimmt den Punkt AUF oder VOR der Stunde, nie den danach',
  wlAt(fcCux.curve, t0)?.t <= t0 && (wlAt(fcCux.curve, t0 + 1) ?? {}).t <= t0 + 1
  && wlAt(fcCux.curve, fcCux.curve[0].t - 1) === null,
  '');
add('F7b Jenseits des Verlaufs gibt es KEINEN Wert — der letzte Punkt wird nicht als Wert späterer Stunden ausgegeben',
  wlAt(fcCux.curve, cEnd) ?.t === cEnd
  && wlAt(fcCux.curve, cEnd + WL_AT_TOLERANCE_MS) ?.t === cEnd
  && wlAt(fcCux.curve, cEnd + WL_AT_TOLERANCE_MS + 1) === null
  && wlAt(fcCux.curve, Date.parse('2030-01-01T00:00:00Z')) === null
  && WL_AT_TOLERANCE_MS === 3_600_000 && wlCurveEnd([]) === null,
  `Verlauf endet ${new Date(cEnd).toISOString()}, Toleranz ${WL_AT_TOLERANCE_MS / 60_000} min`);
add('F7c Der Fall tritt im Betrieb auf: die Zeitachse der Seite reicht weiter als der Verlauf des BSH',
  // SEA_MAX_T = 78 h (seaState.ts); der Verlauf endete am Messtag median +54,6 h.
  cEnd - Date.parse(cux.properties.automated_curveforecast_timestamp.replace(' ', 'T')) < 78 * 3_600_000,
  '');
add('F8 wlNextEvents gibt nur künftige, in Zeitfolge, höchstens n',
  wlNextEvents(fcCux.events, 0, 4).length === 4 && wlNextEvents(fcCux.events, 0, 4).every((e, i, a) => i === 0 || e.t > a[i - 1].t)
  && wlNextEvents(fcCux.events, Date.parse('2030-01-01T00:00:00Z')).length === 0
  && wlNextEvents(fcCux.events, fcCux.events[2].t)[0].t === fcCux.events[2].t,
  '');
add('F10 Frischegrenzen getrennt (Modellkurve 3 h, amtliche Vorhersage 12 h), weil die Kurve viel jünger ist',
  WL_CURVE_STALE_MS === 3 * 3_600_000 && WL_FORECAST_STALE_MS === 12 * 3_600_000
  && WL_CURVE_STALE_MS < WL_FORECAST_STALE_MS && fcCux.curveAt > fcCux.forecastAt
  && fcCux.curveAt - fcCux.forecastAt > 3 * 3_600_000,
  `Kurve ${Math.round((fcCux.curveAt - fcCux.forecastAt) / 60_000)} min jünger als die amtliche Vorhersage`);

// --- F11: fill level of the gauge (WL-5, Jan 13.10.2026) — every number a delivered value or a subtraction
// in the same reference (cm above gauge zero); words by region (tide only in the North Sea).
const fWin = fcCux.curve.filter((p) => p.t >= t0 - 6 * 3_600_000 && p.t <= t0 + 48 * 3_600_000);
const fPt = wlAt(fcCux.curve, t0);
const cuxRefs = { region: fcCux.region, mhwCm: fcCux.mhwCm, mlwCm: fcCux.mlwCm, zeroNhnCm: fcCux.zeroNhnCm };
const fl = wlFill(fPt, fWin, cuxRefs);
add('F11 Füllstand: der Wert ist der Kurvenpunkt der Stunde, cm über Pegelnull, unverändert; Herkunft benannt',
  !!fl && fl.cm === (fPt.forecast ?? fPt.measured) && fl.kind === (fPt.forecast != null ? 'forecast' : 'measured') && fl.t === fPt.t,
  fl ? `${fl.cm} cm (${fl.kind}) um ${new Date(fl.t).toISOString()}` : 'kein Füllstand');
add('F11b Skala in Zehnern, umfasst Wert, Fenster und Bezugshöhen; Lage 0 … 1; Rundung wie das Diagramm',
  !!fl && fl.lo % 10 === 0 && fl.hi % 10 === 0 && fl.lo < fl.hi
  && fl.lo <= Math.min(fl.cm, 366, ...fWin.flatMap((p) => [p.forecast, p.measured, p.tide]).filter((v) => v != null))
  && fl.hi >= Math.max(fl.cm, 656, ...fWin.flatMap((p) => [p.forecast, p.measured, p.tide]).filter((v) => v != null))
  && fl.frac >= 0 && fl.frac <= 1 && Math.abs(fl.frac - (fl.cm - fl.lo) / (fl.hi - fl.lo)) < 1e-9
  && JSON.stringify(wlFillScale([100, 200])) === '[80,220]' && JSON.stringify(wlFillScale([0, 1000])) === '[-120,1120]',
  fl ? `${fl.lo} … ${fl.hi}, frac ${fl.frac.toFixed(3)}` : '');
add('F11c Marken Nordsee: MThw 656, MTnw 366 und NHN bei 503 cm (Pegelnull 503 cm unter NHN); Wort „Tidehub“',
  !!fl && fl.marks.some((m) => m.label === 'MThw' && m.cm === 656) && fl.marks.some((m) => m.label === 'MTnw' && m.cm === 366)
  && fl.marks.some((m) => m.label === 'NHN' && m.cm === 503) && fl.marks.length === 3
  && fl.highLabel === 'MThw' && fl.lowLabel === 'MTnw' && fl.spanLabel === 'Tidehub',
  fl ? fl.marks.map((m) => `${m.label} ${m.cm}`).join(', ') : '');
add('F11d Differenzen = Subtraktion im selben Bezug (gegen MThw, MTnw, NHN); Lage und Füllgrad des Tidehubs konsistent',
  !!fl && fl.vsHigh === fl.cm - 656 && fl.vsLow === fl.cm - 366 && fl.nhnCm === fl.cm - 503
  && fl.band === (fl.cm < 366 ? 'below' : fl.cm > 656 ? 'above' : 'within')
  && Math.abs(fl.spanFrac - (fl.cm - 366) / 290) < 1e-9,
  fl ? `${fl.cm - 656} / ${fl.cm - 366} / ${fl.cm - 503} cm, ${fl.band}, Füllgrad ${(fl.spanFrac * 100).toFixed(0)} %` : '');
const wPt = fcWarn.curve[Math.floor(fcWarn.curve.length / 2)];
const flW = wlFill(wPt, fcWarn.curve.slice(0, 60), { region: fcWarn.region, mhwCm: fcWarn.mhwCm, mlwCm: fcWarn.mlwCm, zeroNhnCm: fcWarn.zeroNhnCm });
add('F11e Ostsee: MHW/MNW statt MThw/MTnw, „Spanne MNW–MHW“ statt Tidehub, NHN-Marke bei 498 cm',
  !!flW && flW.highLabel === 'MHW' && flW.lowLabel === 'MNW' && flW.spanLabel === 'Spanne MNW–MHW'
  && flW.marks.some((m) => m.label === 'MHW' && m.cm === 617) && flW.marks.some((m) => m.label === 'MNW' && m.cm === 407)
  && flW.marks.some((m) => m.label === 'NHN' && m.cm === 498) && !flW.marks.some((m) => /MT/.test(m.label)),
  flW ? flW.marks.map((m) => `${m.label} ${m.cm}`).join(', ') : 'kein Füllstand');
const tideless = wlFill({ t: 1, tide: null, forecast: 512, measured: null }, [], { region: 'baltic_sea', mhwCm: 500, mlwCm: 500, zeroNhnCm: -498 });
const noRefs = wlFill({ t: 1, tide: null, forecast: 512, measured: null }, [], { region: 'north_sea', mhwCm: 0, mlwCm: 0, zeroNhnCm: null });
add('F11f Ohne Punkt oder Wert kein Glas; MHW = MNW (tidenlos) ⇒ eine Marke „MW“, keine Spanne; 0/0 ⇒ keine Marken (V-WL-7)',
  wlFill(null, [], cuxRefs) === null && wlFill({ t: 1, tide: 5, forecast: null, measured: null }, [], cuxRefs) === null
  && !!tideless && tideless.marks.length === 2 && tideless.marks.some((m) => m.label === 'MW' && m.cm === 500) && tideless.marks.some((m) => m.label === 'NHN')
  && tideless.band === null && tideless.spanFrac === null && tideless.vsHigh === 12
  && !!noRefs && noRefs.marks.length === 0 && noRefs.band === null && noRefs.vsHigh === null && noRefs.nhnCm === null && noRefs.cm === 512,
  '');
const high = wlFill({ t: 1, tide: null, forecast: 700, measured: null }, [], cuxRefs);
const low = wlFill({ t: 1, tide: null, forecast: 300, measured: null }, [], cuxRefs);
const meas = wlFill({ t: 1, tide: 400, forecast: null, measured: 420.5 }, [], cuxRefs);
add('F11g Wert über/unter der Spanne: Lage above/below, Füllgrad > 1 bzw. < 0, Lage auf der Skala bleibt 0 … 1; Messung ohne Vorhersage gilt als gemessen',
  !!high && high.band === 'above' && high.spanFrac > 1 && high.frac <= 1 && high.vsHigh === 44
  && !!low && low.band === 'below' && low.spanFrac < 0 && low.frac >= 0 && low.vsLow === -66
  && !!meas && meas.kind === 'measured' && meas.cm === 420.5,
  `${high?.band} ${high?.spanFrac?.toFixed(2)} / ${low?.band} ${low?.spanFrac?.toFixed(2)}`);
add('F11h Die Karte zeichnet das Glas aus wlFill und benennt den Rückfall auf den letzten Wert, wenn die Stunde jenseits der Kurve liegt',
  /<WaterLevelFill fill=\{fill\}/.test(readoutSrc) && /wlFill\(fillPt, window/.test(readoutSrc)
  && /letzter Wert, nicht die gewählte Stunde/.test(readoutSrc) && /beyond \? wlAt\(doc\.curve, nowMs\)/.test(readoutSrc)
  && /Füllstand · /.test(readoutSrc) && !/Tidehub/.test(readoutSrc.replace(/spanLabel/g, '')),
  '');

// --- G: the page (E-WL-1, E-WL-5, Auftrag 1/3) ------------------------------------------------------
const dock = src('SeaDock.tsx');
add('G1 Der gesperrte Eintrag ist weg: kein „blockiert“, kein Schloss, kein „Lizenz ungeklärt“ in der Linie',
  !seaSources.some(([, t]) => /blockiert|Lizenz ungeklärt|BSH-Vorhersage gesperrt/.test(t))
  && !/is-blocked/.test(dock), '');
add('G2 Stattdessen ein echter Schalter, voreingestellt an (E-WL-1), mit CC BY 4.0 im Untertitel',
  /\['water', 'Wasserstand-Vorhersage', 'BSH · Pegel, CC BY 4\.0'\]/.test(dock)
  && /water: boolean/.test(dock) && /water: true/.test(src('SeaPage.tsx')) && /seaWaterLevelFrom\(\)/.test(src('SeaPage.tsx')),
  '');
add('G3 Schalter ?wl: Voreinstellung an, ?wl=0 aus, kaputte Query ändert nichts',
  seaWaterLevelFrom('') === true && seaWaterLevelFrom('?wl=0') === false && seaWaterLevelFrom('?wl=1') === true
  && seaWaterLevelFrom('?x=1') === true && seaWaterLevelFrom('?wl=') === true,
  '');
add('G4 Der Quellen-Reiter nennt den Status erlaubt mit Lizenz, Datensatz-Art und API-Weg',
  /erlaubt · \$\{WL_LICENCE\}/.test(readout) && /EU High-Value-Dataset/.test(readout)
  && /ohne Registrierung, kommerziell nutzbar/.test(readout) && /ausschließlich über die offizielle OGC API/.test(readout),
  '');
add('G5 Attribution sichtbar an der Karte, mit Link auf Lizenz UND Quelle (E-WL-5, Auftrag 4)',
  /WL_ATTRIBUTION_PRE/.test(readout) && /href=\{WL_LICENCE_URL\}/.test(readout) && /href=\{WL_SERVICE_PAGE\}/.test(readout)
  && /Quelle \(OGC API\)/.test(readout) && /keine Gewähr/.test(readout)
  && /Verbindlich ist die amtliche Veröffentlichung des BSH/.test(readout),
  '');
add('G5b Zahlen deutsch: die Zentimeter gehen durch einen de-DE-Formatierer, nicht als Rohzahl in den Text',
  /const cmText = \(cm: number\) => cm\.toLocaleString\('de-DE'/.test(readoutSrc)
  && /\$\{cmText\(cm\)\} cm/.test(readoutSrc) && /± \$\{cmText\(e\.uncertaintyCm\)\} cm/.test(readoutSrc),
  '');
add('G5c Reicht der Verlauf nicht bis zur gewählten Stunde, sagt die Karte es (statt den letzten Wert zu wiederholen)',
  /Der Verlauf des BSH reicht bis/.test(readoutSrc) && /wlCurveEnd/.test(readoutSrc) && /const beyond =/.test(readoutSrc),
  '');
add('G6 Die Karte zeigt die Stempel beider Vorhersagen (Auftrag 3: Zeitstempel sichtbar)',
  /Modellkurve \{doc\.curveAt == null/.test(readout) && /amtliche Vorhersage \{doc\.forecastAt == null/.test(readout)
  && /älter als 3 h/.test(readout) && /älter als 12 h/.test(readout),
  '');
add('G7 Pegel auf der Karte als eigene Form (Raute), wählbar, Auswahl hervorgehoben',
  /sw-gauges/.test(src('SeaMap.tsx')) && /gaugeImage/.test(src('SeaMap.tsx'))
  && /onGaugeRef\.current/.test(src('SeaMap.tsx')) && /sw-gauge-sel/.test(src('SeaMap.tsx'))
  && /selectedGaugeId/.test(src('SeaPage.tsx')),
  '');
add('G8 Ohne Schalter kein Abruf und keine Ebene: der Katalog wird erst beim Einschalten geholt',
  /useEffect\(\(\) => \{\s*if \(!water\) return;/.test(src('SeaPage.tsx'))
  && /if \(!water \|\| !gaugeId\) \{ setWlDoc\(null\); return; \}/.test(src('SeaPage.tsx'))
  && /water && wlCat\.gauges\.length/.test(src('SeaPage.tsx')),
  '');
add('G9 Jeder leere Zustand wird benannt, nie still (Ehrlichkeitsregel)',
  /Pegelkatalog liegt noch nicht im Daten-Repo/.test(src('SeaPage.tsx'))
  && /nicht lesbar\. Das heißt nicht, dass der Wasserstand unauffällig ist/.test(src('SeaPage.tsx'))
  && /führt keine Hoch-\/Niedrigwasserzeiten/.test(readout) && /keinen Verlauf/.test(readout),
  '');
add('G10 Watt-Sätze verweisen auf die Karte statt auf die Sperre',
  /Karte „Wasserstand“/.test(src('seaView.ts')) && /Karte „Wasserstand“ weiter unten/.test(readout)
  && !/gesperrt/.test(src('seaView.ts')), '');

// --- H: live (not in CI) ---------------------------------------------------------------------------
if (process.argv.includes('--live')) {
  const url = wlItemUrl('cuxhaven_steubenhoeft');
  const r = await fetch(url, { headers: { origin: 'https://buscosun.com' }, signal: AbortSignal.timeout(60_000) });
  const j = r.ok ? await r.json() : null;
  add('H1 Der Dienst antwortet 200 mit CORS * (ohne 301-Hop, V-WL-1)',
    r.ok && r.headers.get('access-control-allow-origin') === '*' && !/lang=en/.test(r.url),
    `${r.status} acao=${r.headers.get('access-control-allow-origin')} url=${r.url}`);
  const live = j ? wlForecastOf(j, Date.now()) : null;
  add('H2 Die Antwort hält den Vertrag: Form, Lizenz, Stempel, Einheiten',
    !!live && live.id === 'cuxhaven_steubenhoeft' && live.licence === WL_LICENCE && live.region === 'north_sea'
    && live.curve.length > 100 && live.events.length > 0 && live.forecastAt != null && live.curveAt != null
    && live.curve.every((p) => [p.tide, p.forecast, p.measured].every((v) => v == null || Number.isFinite(v))),
    live ? `${live.curve.length} Punkte, ${live.events.length} Ereignisse, Kurve ${new Date(live.curveAt).toISOString()}` : 'keine Antwort');
  add('H3 Die Kategorie kommt aus den Daten und steht in der dokumentierten Liste',
    !!live && (live.warningLevel === null || WL_WARN_LEVELS.includes(live.warningLevel)),
    live ? String(live.warningLevel) : '');
  const all = await fetch(wlItemsUrl(), { headers: { origin: 'https://buscosun.com' }, signal: AbortSignal.timeout(90_000) }).then((x) => x.json());
  const built = buildCatalog(all.features, Date.now(), null);
  add('H4 Der Katalog von heute hält alle Regeln und hat mindestens 100 Pegel',
    built.doc.gauges.length >= WL_MIN_GAUGES && wlCatalogProblems(built.doc.gauges).length === 0 && built.dropped.length === 0,
    `${built.doc.gauges.length} Pegel, ${wlCatalogProblems(built.doc.gauges).length} Probleme, ${built.dropped.length} verworfen`);
  add('H5 Die Lizenz steht noch an jedem Datensatz (sonst darf nichts veröffentlicht werden)',
    all.features.every((f) => f?.properties?.licence === WL_LICENCE),
    `${all.features.filter((f) => f?.properties?.licence === WL_LICENCE).length}/${all.features.length}`);
}

const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:sea-waterlevel — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
