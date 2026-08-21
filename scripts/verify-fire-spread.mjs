/**
 * Headless-Verifikation „Ausbreitungsrichtung aktiver Brände" (Phase SF1, Gate **GSF1**).
 *
 *   npm run verify:fire-spread
 *
 * Prüft die ECHTEN Module `src/fire/spread/*` über ihre eingebetteten
 * Selbstverifikationen und ergänzt die Anker aus `audit/waldbrand-ausbreitung.md`:
 *
 *   (a) FBP-Gleichungen gegen die veröffentlichten Werte (ST-X-3 Tab. 6, Gl. 26/39/41/79),
 *   (b) Vektor-Invarianten: eben ⇒ RAZ = Windrichtung, windstill ⇒ RAZ = hangaufwärts,
 *   (c) Ehrlichkeit: zu jeder Lücke ein Grund, nie eine Vorgaberichtung, Deckel ausgesprochen,
 *   (d) Verdrahtung als Quellprüfung: SPECS, Sprite-Wächter, layout-Erhalt, stateRef + Deps,
 *   (e) Rückzug `fireForecast`: Bit 13 bleibt null, die Datenquelle bleibt in Betrieb,
 *   (f) Herkunft: Quelle der Gleichungen genannt, kein MapView-Import, Gelände dynamisch.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyFbp, rsi, slopeFactor, isfFromRsf, lengthToBreadth, FBP_FUEL } from '../src/fire/spread/fbp.ts';
import { verifySpreadVector } from '../src/fire/spread/spreadVector.ts';
import { verifySpreadReach } from '../src/fire/spread/spreadReach.ts';
import { verifySpreadForecast, SPREAD_GAPS } from '../src/fire/spread/spreadForecast.ts';
import {
  verifySpreadText, gapText, SPREAD_CAVEAT, SPREAD_CAVEAT_SHORT, FAN_CAVEAT, FUEL_ASSUMPTION_NOTE,
} from '../src/fire/spread/spreadText.ts';
import { verifyIsiPointSample } from '../src/fire/spread/isiPointSample.ts';
import { verifyTerrainSampler } from '../src/fire/spread/terrainSampler.ts';
import { verifySpreadRun } from '../src/fire/spread/spreadRun.ts';
import { verifySpreadLayer } from '../src/fire/spread/spreadLayer.ts';
import { FIRE_BIT_ORDER, FIRE_LAYER_ORDER } from '../src/fire/fireModel.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFbp().checks) add(`[fbp] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadVector().checks) add(`[vektor] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadReach().checks) add(`[reichweite] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadForecast().checks) add(`[prognose] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadText().checks) add(`[text] ${c.name}`, c.ok, c.detail);
for (const c of verifyIsiPointSample().checks) add(`[isi-sampler] ${c.name}`, c.ok, c.detail);
for (const c of verifyTerrainSampler().checks) add(`[gelände] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadRun().checks) add(`[lauf] ${c.name}`, c.ok, c.detail);
for (const c of verifySpreadLayer().checks) add(`[layer] ${c.name}`, c.ok, c.detail);

// ---------------------------------------------------------------------------
// (a) Veröffentlichte Referenzwerte — die Gleichungen von ST-X-3 / GLC-X-10,
//     wie `cffdrs` sie führt. Quelle je Prüfung im Namen.
// ---------------------------------------------------------------------------
const near = (x, y, eps) => Math.abs(x - y) <= eps;

const TABLE6 = { D1: [30, 0.0232, 1.6], C2: [110, 0.0282, 1.5], C3: [110, 0.0444, 3.0], O1B: [250, 0.0350, 1.7] };
for (const [f, [a, b, c]] of Object.entries(TABLE6)) {
  add(`[ref] ST-X-3 Tab. 6: ${f} = (a ${a}, b ${b}, c ${c})`,
    FBP_FUEL[f].a === a && FBP_FUEL[f].b === b && FBP_FUEL[f].c === c);
}
add('[ref] Gl. 39: SF(70 %) = 10 (veröffentlichter Deckel)', slopeFactor(70) === 10);
add('[ref] Gl. 39: SF(30 %) = exp(3,533·0,3^1,2)',
  near(slopeFactor(30), Math.exp(3.533 * Math.pow(0.3, 1.2)), 1e-12), slopeFactor(30).toFixed(6));
add('[ref] Gl. 26: C-2 bei ISI 10 = 110·(1−e^(−0,0282·10))^1,5',
  near(rsi('C2', 10), 110 * Math.pow(1 - Math.exp(-0.282), 1.5), 1e-12), rsi('C2', 10).toFixed(4));
add('[ref] Gl. 26: C-3 bei ISI 10 = 110·(1−e^(−0,0444·10))^3',
  near(rsi('C3', 10), 110 * Math.pow(1 - Math.exp(-0.444), 3), 1e-12), rsi('C3', 10).toFixed(4));
add('[ref] Gl. 79: LB(20 km/h) = 1 + 8,729·(1−e^(−0,6))^2,155',
  near(lengthToBreadth('C3', 20), 1 + 8.729 * Math.pow(1 - Math.exp(-0.6), 2.155), 1e-12),
  lengthToBreadth('C3', 20).toFixed(4));

let roundTripMax = 0;
for (const f of Object.keys(TABLE6)) {
  for (let i = 0.5; i <= 30; i += 0.5) roundTripMax = Math.max(roundTripMax, Math.abs(isfFromRsf(f, rsi(f, i)) - i));
}
add('[ref] Gl. 41/43: die Umkehrung schließt sich über ISI 0,5…30 für alle vier Typen',
  roundTripMax < 1e-9, `max. Abweichung ${roundTripMax.toExponential(2)}`);

// ---------------------------------------------------------------------------
// Quellprüfungen — Kommentare raus, Selbstverifikation ab (Muster fire-activity)
// ---------------------------------------------------------------------------
const strip = (t) => {
  const x = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = x.search(/export function verify\w*\s*\(/);
  return i < 0 ? x : x.slice(0, i);
};
const readRaw = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const read = (rel) => strip(readRaw(rel));

const fmap = read('src/fire/FireMap.tsx');
const page = read('src/fire/FirePage.tsx');
const panel = read('src/fire/FireFootprintPanel.tsx');
const card = read('src/fire/FireLayerCard.tsx');
const model = read('src/fire/fireModel.ts');
const producer = readRaw('src/sources/iconD2FireWeather.ts');
const spreadDir = join(ROOT, 'src', 'fire', 'spread');
const spreadFiles = readdirSync(spreadDir).filter((f) => f.endsWith('.ts'));
const spreadSrc = Object.fromEntries(spreadFiles.map((f) => [f, read(join('src/fire/spread', f))]));
const allSpread = Object.values(spreadSrc).join('\n');

// --- (d) Verdrahtung ---------------------------------------------------------
add('[verdrahtung] GL_LAYERS führt Lizenzträger, Fächer und Pfeile',
  /fireSpread: \[[\s\S]{0,220}fire-spread-attrib[\s\S]{0,220}SPREAD_ARROW_LAYER_ID/.test(fmap));
add('[verdrahtung] es gibt einen SPECS-Eintrag für die Pfeile (sonst entsteht still ein Fill-Platzhalter)',
  /\[SPREAD_ARROW_LAYER_ID\]: \{[\s\S]{0,120}type: 'symbol'/.test(fmap));
add('[verdrahtung] die SPECS-Schleife ERHÄLT das layout der Spec',
  /layout: \{ \.\.\.\(\(spec as \{ layout\?: Record<string, unknown> \}\)\.layout \?\? \{\}\), visibility: 'none' \}/.test(fmap));
add('[verdrahtung] die Sprites werden mit hasImage-Wächter registriert (Neuanlage nach Basemap-Wechsel)',
  /if \(map\.hasImage\(imageId\)\) continue;/.test(fmap) && /map\.addImage\(imageId, img, \{ pixelRatio: 2 \}\)/.test(fmap));
add('[verdrahtung] fehlt ein Sprite, sagt es die Konsole UND der Layer entsteht nicht',
  /console\.warn\('\[buscosun\] Ausbreitung: Pfeil-Sprite fehlt/.test(fmap)
    && /gl === SPREAD_ARROW_LAYER_ID && !spritesReady\) continue/.test(fmap));
add('[verdrahtung] die Quelle steht in der Liste der leeren GeoJSON-Quellen',
  /SPREAD_SOURCE_ID\]\) \{/.test(fmap));
add('[verdrahtung] die Quelle wird in applyState gefüttert',
  /\[SPREAD_SOURCE_ID, s\.spreadFc\]/.test(fmap));
add('[verdrahtung] spreadFc steht in BEIDEN stateRef-Literalen',
  (fmap.match(/wind, soil, spreadFc, fireEvents/g) ?? []).length === 2,
  String((fmap.match(/wind, soil, spreadFc, fireEvents/g) ?? []).length));
add('[verdrahtung] spreadFc steht in der applyState-Dep-Liste',
  /weather, wind, soil, spreadFc, day,/.test(fmap));
add('[verdrahtung] die Pfeile sind anklickbar und zeigen den Zeigefinger',
  /queryRenderedFeatures\(ev\.point, \{ layers: \[SPREAD_ARROW_LAYER_ID\] \}\)/.test(fmap)
    && /'fire-footprints-fill', SPREAD_ARROW_LAYER_ID/.test(fmap));
const iconSizeExpr = (fmap.split('\n').find((l) => l.includes("'icon-size':")) ?? '');
add('[verdrahtung] icon-size hängt NUR am Zoom — kein Kanal, der eine Entfernung behauptet',
  /\['zoom'\]/.test(iconSizeExpr) && !/\['get'/.test(iconSizeExpr), iconSizeExpr.trim());
add('[verdrahtung] die Punktkurve hängt am Ausbreitungslayer und geht mit dem Rückzug nicht verloren',
  /onPointForecastRef\.current && s\.active\.has\('fireSpread'\)/.test(fmap));
add('[verdrahtung] beide Ladeschranken kennen fireSpread',
  /!active\.has\('fireWind'\) && !active\.has\('fireSpread'\)/.test(page)
    && /if \(!active\.has\('fireSpread'\)\) return;/.test(page));
add('[verdrahtung] der Lauf ist entprellt, abbrechbar und generationsgesichert',
  /window\.setTimeout\(/.test(page) && /gen !== spreadGenRef\.current/.test(page) && /ac\.abort\(\)/.test(page));
add('[verdrahtung] die GeoJSON-Sammlung ist memoisiert (V-220: setData nur bei neuer Referenz)',
  /const spreadFc = useMemo\(\(\) => \(spread \? spreadToGeoJSON\(spread\) : null\), \[spread\]\)/.test(page));
add('[verdrahtung] das Panel bekommt denselben Lauf wie die Karte',
  /spread=\{spread\}/.test(page) && /spread\?: SpreadRun \| null/.test(panel));

// --- (e) Rückzug der Rasterfläche -------------------------------------------
add('[rückzug] Bit 13 bleibt als null reserviert, Bit 14 trägt die Ausbreitung',
  FIRE_BIT_ORDER[13] === null && FIRE_BIT_ORDER[14] === 'fireSpread');
add('[rückzug] kein lebender Layer heißt mehr fireForecast',
  !FIRE_LAYER_ORDER.includes('fireForecast'));
add('[rückzug] in src/fire steht fireForecast nur noch in Kommentaren',
  !/fireForecast/.test(fmap + page + panel + card + model + allSpread));
add('[rückzug] kein toter ScalarLayer der Rasterfläche',
  !/fire-forecast-scalar|forecastLayerRef/.test(fmap));
add('[rückzug] die DATENQUELLE bleibt in Betrieb — der ISI speist die Pfeile',
  /fetchIconD2FireWeather/.test(page) && /iconD2FireWeather/.test(allSpread));
add('[rückzug] der Producer schreibt ISZ in den freien G-Kanal',
  /export const ISZ_VMAX/.test(producer) && /img\.data\[idx \+ 1\]/.test(producer));

// --- (c) Ehrlichkeit in der Oberfläche ---------------------------------------
add('[ehrlichkeit] der Pflichtsatz steht in Kartennotiz, Steckbrief UND Detailkarte',
  /SPREAD_CAVEAT/.test(page) && /SPREAD_CAVEAT/.test(card) && /SPREAD_CAVEAT/.test(panel));
add('[ehrlichkeit] die Detailkarte zeigt bei fehlender Aussage den benannten Grund',
  /gapText\(spread\.reason\)/.test(panel));
add('[ehrlichkeit] die beobachtete Zeile ist als beobachtet benannt',
  /Ausbreitung bisher \(beobachtet\)/.test(panel));
add('[ehrlichkeit] die gerechnete Zeile ist als gerechnet benannt',
  /Ausbreitungsrichtung \(gerechnet, nächste Stunden\)/.test(panel));
add('[ehrlichkeit] der Deckel wird ausgesprochen (V-246)',
  /capNote\(/.test(page) && /MAX_SPREAD_FIRES/.test(readRaw('src/fire/spread/spreadRun.ts')));
add('[ehrlichkeit] keine Warnsprache in src/fire/spread',
  !/Gefahr für|Evakuier|amtliche Warnung|Alarmstufe/.test(allSpread));
// Auf den WERTEN geprüft, nicht am Quelltext: ein Zeilenumbruch mitten im
// String machte die Textsonde blind (gemessen 2026-08-19).
const spokenText = [SPREAD_CAVEAT, SPREAD_CAVEAT_SHORT, FAN_CAVEAT, FUEL_ASSUMPTION_NOTE,
  ...SPREAD_GAPS.map(gapText)].join(' ');
add('[ehrlichkeit] „Brandfront" kommt in den ausgegebenen Texten nur verneint vor',
  (spokenText.match(/Brandfront/g) ?? []).length === (spokenText.match(/keine Brandfront/g) ?? []).length);
add('[ehrlichkeit] die ausgegebenen Texte tragen keine Warnsprache',
  !/Gefahr für|Evakuier|amtliche Warnung|Alarmstufe/.test(spokenText));
add('[ehrlichkeit] kein Date.now() in den reinen Modulen (Determinismus)',
  !/Date\.now\(\)/.test([spreadSrc['fbp.ts'], spreadSrc['spreadVector.ts'], spreadSrc['spreadReach.ts'],
    spreadSrc['spreadForecast.ts'], spreadSrc['spreadText.ts']].join('\n')));
add('[ehrlichkeit] zu jeder Lücke gibt es einen Satz',
  SPREAD_GAPS.every((g) => gapText(g).length > 20));

// --- (f) Herkunft der Gleichungen -------------------------------------------
const fbpSrc = readRaw('src/fire/spread/fbp.ts');
add('[herkunft] fbp.ts nennt Quelle, Jahre und die Referenzimplementierung',
  /ST-X-3/.test(fbpSrc) && /GLC-X-10/.test(fbpSrc) && /cffdrs/.test(fbpSrc));
add('[herkunft] src/fire/spread importiert NICHT aus MapView',
  !/from '.*MapView'/.test(allSpread));
const terrain = readRaw('src/fire/spread/terrainSampler.ts');
add('[herkunft] das Gelände kommt per dynamischem Import (kein Ballast im FirePage-Chunk)',
  /await import\('\.\.\/\.\.\/fusion\/elevation'\)/.test(terrain)
    && /await import\('\.\.\/\.\.\/pointForecast\/terrainPhysics'\)/.test(terrain));

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
