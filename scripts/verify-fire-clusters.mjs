/**
 * Headless-Verifikation „Brand-Cluster" (Phase BC1, Gate GBC1).
 *
 *   npm run verify:fire-clusters
 *
 * Prüft das ECHTE Modul `src/fire/fireClusters.ts` über seine eingebettete
 * Selbstverifikation und ergänzt die Sonden gegen die Fehler, die genau diese
 * Phase teuer machen:
 *
 *   (a) es entsteht KEIN zweites Clustering — die Verkettung kommt aus
 *       `fireEvents.ts`, und deren Vorgabe-Radius bleibt unangetastet (an ihm
 *       hängt die Ortsfest-Einstufung aus F2),
 *   (b) die Hülle heißt nirgends „Brandfläche" und behauptet keine Bestätigung,
 *   (c) ein Cluster ohne Fläche zeigt „—" statt einer 0,
 *   (d) die Stärke-Farbskala hat EIGENE Stützstellen (ΣFRP ≠ FRP),
 *   (e) die Verdrahtung hängt am Hotspot-Schalter — kein neuer Layer im Modell,
 *   (f) das bestehende Readout-Panel ist nicht umgebaut worden,
 *   (g) keine neue Runtime-Dependency, kein `Date.now()` in der Rechenlogik.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireClusters, buildFireClusters, clustersToGeoJSON, convexHull, ringAreaKm2,
  withCountries, countryLabel, extentLabel, strengthLabel, clusterColor, fixtureRow,
  CLUSTER_RADIUS_M, CLUSTER_PAGE, CLUSTER_FRP_STOPS, CLUSTER_NOTE,
} from '../src/fire/fireClusters.ts';
import { buildFireEvents, spatialClusters, LINK_RADIUS_M } from '../src/fire/fireEvents.ts';
import { FRP_STOPS } from '../src/fire/sources/firmsHotspots.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireClusters().checks) add(`[clusters] ${c.name}`, c.ok, c.detail);

// --- Quelltexte (Kommentare raus, Selbstverifikation ab) ----------------------
const strip = (s) => {
  const t = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = t.search(/export function verify\w*\s*\(/);
  return i < 0 ? t : t.slice(0, i);
};
const fireDir = join(ROOT, 'src', 'fire');
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
walk(fireDir);
const code = Object.fromEntries(files.map((p) => [p.slice(fireDir.length + 1).replace(/\\/g, '/'), strip(readFileSync(p, 'utf8'))]));
const src = code['fireClusters.ts'];

// ---------------------------------------------------------------------------
// (a) Genau EIN Clustering im Projekt
// ---------------------------------------------------------------------------
add('die Cluster benutzen die Verkettung aus fireEvents.ts',
  /import \{ spatialClusters \} from '\.\/fireEvents'/.test(src) && /spatialClusters\(rows, radiusM\)/.test(src));
add('fireClusters.ts hat KEIN eigenes Gitter/Union-Find/Abstandsmaß',
  !/Union-Find|parent\[|find\(|metersBetween|Math\.floor\(lat/.test(src));
add('der Vorgabe-Radius der EREIGNISSE ist unverändert 1 500 m (F2 hängt daran)',
  LINK_RADIUS_M === 1500, String(LINK_RADIUS_M));
add('spatialClusters ohne Argument clustert wie vorher (Regressionsanker)', (() => {
  const T = Date.UTC(2026, 7, 16, 12, 0);
  // Zwei Punkte 1,8 km auseinander: mit 1 500 m getrennt, mit 2 000 m zusammen.
  const rows = [fixtureRow(48, 11, T), fixtureRow(48 + 1800 / 110574, 11, T)];
  return spatialClusters(rows).length === 2 && spatialClusters(rows, 2000).length === 1;
})());
add('buildFireEvents bleibt bei der Vorgabe (kein Radius-Argument im Aufruf)',
  /spatialClusters\(rows\)/.test(code['fireEvents.ts']));
add('die Ereignisbildung ist unverändert reihenfolgeunabhängig', (() => {
  const T = Date.UTC(2026, 7, 16, 12, 0);
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(fixtureRow(50 + (i % 5) * 0.004, 10 + (i % 7) * 0.006, T + i * 60_000));
  const a = buildFireEvents(rows, T + 3_600_000);
  const b = buildFireEvents([...rows].reverse(), T + 3_600_000);
  return a.length === b.length && a.map((e) => e.pixels).sort().join(',') === b.map((e) => e.pixels).sort().join(',');
})());

// ---------------------------------------------------------------------------
// (b) Ehrlichkeit: die Hülle ist keine Brandfläche
// ---------------------------------------------------------------------------
add('das Wort „Brandfläche" behauptet die Hülle nirgends',
  !/(?<!nicht die verbrannte |keine )Brandfläche(?!n?\s*(kommt|von EFFIS|ist))/.test(
    src.replace(/nicht die verbrannte Fläche/g, '')));
add('das Modul behauptet nirgends eine Bestätigung',
  !/\b(bestätigt|verifiziert|nachgewiesen)\b/i.test(src));
add('der Pflichthinweis grenzt gegen die verbrannte UND die abgedeckte Fläche ab',
  /nicht die verbrannte Fläche/.test(CLUSTER_NOTE) && /abgedeckte/.test(CLUSTER_NOTE));
add('der Pflichthinweis nennt FRP als Leistung, nicht als Fläche',
  /Leistung, keine Fläche/.test(CLUSTER_NOTE));
// BP5: die Liste ist in `FireFootprintPanel` aufgegangen (je Brand statt je
// Detektionsgruppe). Die Sonden prüfen dieselbe ABSICHT am neuen Ort — sie
// wurden nachgezogen, nicht gestrichen.
add('die Liste zeigt den Hinweis IMMER (auch im Leerzustand)', (() => {
  const panel = code['FireFootprintPanel.tsx'] ?? '';
  // Der Hinweis muss UNBEDINGT gerendert werden — auch wenn keine Zeile
  // existiert. Geprüft an der Einrückung: sechs Leerzeichen heißt direktes Kind
  // des Panel-Wurzelelements, also außerhalb jedes `&&`- oder Ternär-Zweigs.
  // Und er steht VOR der Liste, statt hinter mehreren hundert Zeilen Scrollweg.
  const line = '      <p className="fire-clist-note">{CLUSTER_NOTE}</p>';
  const note = panel.indexOf(line);
  return note > 0 && note < panel.indexOf('fire-fplist');
})());

// ---------------------------------------------------------------------------
// (c) Flächenlos ist flächenlos — keine erfundene Null
// ---------------------------------------------------------------------------
const T = Date.UTC(2026, 7, 16, 12, 0);
const single = buildFireClusters([fixtureRow(48, 11, T)]);
add('ein Punkt ⇒ ein Cluster ohne Hülle', single[0].hull.length === 0 && single[0].hullKm2 === 0);
add('flächenlos wird als „—" geschrieben, nie als „0 km²"',
  extentLabel(single[0]) === '—' && !/0,0 km²/.test(extentLabel(single[0])));
add('flächenlose Cluster erzeugen KEIN Polygon auf der Karte',
  clustersToGeoJSON(single).features.length === 0);
add('zwei Punkte spannen ebenfalls keine Fläche auf',
  buildFireClusters([fixtureRow(48, 11, T), fixtureRow(48.001, 11, T)])[0].hullKm2 === 0);
add('sehr kleine Flächen werden als „< 0,1 km²" ausgewiesen, nicht auf 0 gerundet', (() => {
  const d = 150 / 110_574; // ~150 m Kantenlänge ⇒ ~0,015 km²
  const c = buildFireClusters([
    fixtureRow(48, 11, T), fixtureRow(48 + d, 11, T), fixtureRow(48 + d, 11 + d * 1.5, T),
  ])[0];
  return c.hullKm2 > 0 && extentLabel(c) === '< 0,1 km²';
})());

// ---------------------------------------------------------------------------
// (d) Die Stärke-Skala ist eine EIGENE
// ---------------------------------------------------------------------------
add('ΣFRP hat eigene Stützstellen (nicht die Einzelpunkt-Skala)',
  CLUSTER_FRP_STOPS.map(([mw]) => mw).join(',') !== FRP_STOPS.map(([mw]) => mw).join(','),
  `${CLUSTER_FRP_STOPS.map(([mw]) => mw).join('/')} gegen ${FRP_STOPS.map(([mw]) => mw).join('/')}`);
add('die Farbreihe bleibt die des Layers (eine Bildsprache)',
  CLUSTER_FRP_STOPS.map(([, c]) => c).join(',') === FRP_STOPS.map(([, c]) => c).join(','));
add('die Stützstellen steigen streng monoton',
  CLUSTER_FRP_STOPS.every(([mw], i) => i === 0 || mw > CLUSTER_FRP_STOPS[i - 1][0]));
add('Karte und Liste lesen dieselbe Farbe',
  clustersToGeoJSON(buildFireClusters([
    fixtureRow(48, 11, T, 100), fixtureRow(48.01, 11, T, 100), fixtureRow(48.01, 11.01, T, 100),
  ]))
    .features[0].properties.color === clusterColor(300));

// ---------------------------------------------------------------------------
// (e) Verdrahtung in der Karte
// ---------------------------------------------------------------------------
const mapSrc = code['FireMap.tsx'] ?? '';
add('FireMap führt eigene GL-Layer für die Hüllen',
  /'fire-clusters-fill'/.test(mapSrc) && /'fire-clusters-line'/.test(mapSrc) && /'fire-clusters-sel-line'/.test(mapSrc));
add('die Hüllen hängen am Hotspot-Schalter (kein neuer Layer-Eintrag im Modell)',
  !/fireCluster/.test(code['fireModel.ts'] ?? '')
  && /fireHotspots: \[\s*'fire-clusters-fill'/.test(mapSrc));
add('die Hüllen liegen UNTER Raster, Footprints und Punkten', (() => {
  const list = mapSrc.slice(mapSrc.indexOf('fireHotspots: ['), mapSrc.indexOf('fireWeather:'));
  return list.indexOf('fire-clusters-fill') < list.indexOf('fire-hotspots-zone-fill')
    && list.indexOf('fire-hotspots-zone-fill') < list.indexOf('fire-hotspots-points');
})());
add('die Hüllen-Quelle wird wie die Punkte mit der Attribution des Providers versorgt',
  /'fire-hotspots-zone', 'fire-clusters'\]/.test(mapSrc));
add('die Hüllen tragen eine GESTRICHELTE Kante — die scharfe Kontur bleibt der EFFIS-Fläche',
  /'fire-clusters-line'[\s\S]{0,400}line-dasharray/.test(mapSrc));
add('die Markierung läuft über einen Filter, der bei jedem applyState gesetzt wird',
  /setFilter\('fire-clusters-sel-line'/.test(mapSrc));
add('ein Kartenklick öffnet KEIN Popup für die Hülle (die Popup-Kette bleibt, wie sie war)',
  !/clusterPopupHtml/.test(mapSrc)
  && (mapSrc.match(/popupRef\.current = new maplibregl\.Popup/g) ?? []).length === 3);
add('die Karte fährt nur auf `focusNonce`, nicht auf jede Auswahl',
  /\}, \[focusNonce\]\)/.test(mapSrc) && /fitBounds/.test(mapSrc));
add('setData bleibt referenzgesichert (V-220): die Hüllen kommen aus einem useMemo',
  /const clusterFc = useMemo\(/.test(mapSrc));

// ---------------------------------------------------------------------------
// (f) Das bestehende Panel ist NICHT umgebaut worden
// ---------------------------------------------------------------------------
const pageSrc = code['FirePage.tsx'] ?? '';
add('der Steckbrief-Stapel steht unverändert im Readout',
  /fire-ro-layerinfo/.test(pageSrc) && /Steckbriefe der aktiven Layer/.test(pageSrc));
add('Skalen-Trio, AT-Lücke und Saison-Hinweis sind unverändert vorhanden',
  /fire-scales/.test(pageSrc) && /fire-at-gap/.test(pageSrc) && /fire-season/.test(pageSrc));
add('der Layer-Steckbrief (FireLayerCard) wurde für diese Phase nicht angefasst',
  !/[Cc]luster/.test(code['FireLayerCard.tsx'] ?? ''));
add('das Readout startet auf „Layer" — der Bestand ist der Startzustand',
  // BP5: der Startwert ist „layers", sofern kein Permalink (`fp=1`) die Liste verlangt.
  /useState<'layers' \| 'fires'>\([\s\S]{0,400}?initial\?\.footprintPanel \? 'fires' : 'layers',/.test(pageSrc));
add('die Liste sitzt im Readout und nicht in der Karte',
  /readoutTab === 'fires' \? footprintPanel\(inSheet\)/.test(pageSrc)
  && !/fire-fplist|fire-fprow/.test(mapSrc));

// Der Deckel ist eine Leistungsgrenze — und er wird AUSGESPROCHEN (kein stiller Schnitt).
add('die Kopfzeile nennt immer die VOLLE Zahl, nicht die gezeigte',
  /p\.total === records\.length \? `\$\{p\.total\}` : `\$\{records\.length\} von \$\{p\.total\}`/
    .test(code['FireFootprintPanel.tsx'] ?? ''));
add('die Liste sagt, wie viele Einträge sie zeigt, und bietet die nächsten an',
  /gezeigt: \{p\.shown\} von \{records\.length\} Einträgen/.test(code['FireFootprintPanel.tsx'] ?? '')
  && /weitere anzeigen/.test(code['FireFootprintPanel.tsx'] ?? ''));
add('der Deckel ist begründet und benannt (CLUSTER_PAGE)',
  CLUSTER_PAGE === 50 && /253 ms/.test(readFileSync(join(ROOT, 'src/fire/fireClusters.ts'), 'utf8')));
add('ein von der Karte markierter Eintrag wird aufgeklappt, statt unsichtbar zu bleiben',
  /const rank = panelRecordsRef\.current\.findIndex/.test(pageSrc) && /Math\.max\(n, Math\.ceil/.test(pageSrc));
add('der Deckel wird bei einer neuen Liste zurückgesetzt',
  /setShownFootprints\(CLUSTER_PAGE\); \}, \[records\]\)/.test(pageSrc));

// ---------------------------------------------------------------------------
// (g) Reinheit, Abhängigkeiten, Mengengerüst
// ---------------------------------------------------------------------------
add('kein Date.now() in der Cluster-Rechenlogik (D-12)', !/Date\.now\(\)/.test(src));
add('kein DOM/fetch im Modul (headless prüfbar)', !/document|window|fetch\(/.test(src));
add('keine neue Runtime-Dependency (D-06): nur projektinterne Importe',
  (src.match(/^import .*from '(?!\.)/gm) ?? []).length === 0);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
add('package.json führt weiterhin genau die bekannten Runtime-Dependencies',
  Object.keys(pkg.dependencies ?? {}).sort().join(',') === 'bz2,bzip2-wasm,jsfive,maplibre-gl,react,react-dom',
  Object.keys(pkg.dependencies ?? {}).join(','));
add('der Verifier ist als npm-Skript hinterlegt', !!pkg.scripts['verify:fire-clusters']);

// Raster und Cluster teilen sich EINE Worker-Nachricht (keine zweite Kopie).
add('Raster und Cluster fahren in einer Worker-Nachricht',
  /kind === 'zones'[\s\S]{0,400}buildFireClusters/.test(code['fireEventsWorker.ts'] ?? '')
  && /computeZonesAndClusters/.test(code['fireEventsClient.ts'] ?? ''));
add('der Hauptthread-Rückfall rechnet dasselbe',
  /const onMain = \(\)[\s\S]{0,200}buildFireClusters/.test(code['fireEventsClient.ts'] ?? ''));

// Der Ortsfest-Vorbehalt: dieselbe Schlüsselmenge, die die Punkte grau macht.
add('die Einordnung kommt in einem ZWEITEN Lauf, nach der Klassifikation (V-222)',
  /kind === 'clusters'[\s\S]{0,300}buildFireClusters\(rows, radiusM, new Set/.test(code['fireEventsWorker.ts'] ?? '')
  && /export async function computeFireClusters/.test(code['fireEventsClient.ts'] ?? ''));
add('Liste und Karte lesen DIESELBE Schlüsselmenge (kein zweiter Zustand)', (() => {
  const page = code['FirePage.tsx'] ?? '';
  // `keys` speist `toRun` (die grauen Punkte) und `computeFireClusters` (die Zeilen).
  // Prefix statt voller Argumentliste: die Absicht ist „dieselbe `keys`-Menge",
  // nicht die Stelligkeit von `toRun` (die wuchs 2026-08-19 um die Zählung der
  // fehlgeschlagenen Abrufe). Am Klammerende zu prüfen machte den Check zu einem
  // Signatur-Test, der bei einer harmlosen Erweiterung fehlschlägt.
  const grey = page.indexOf('toRun(displayed.rows, displayed.windowH, at, displayed.skipped, keys');
  const list = page.indexOf('computeFireClusters(displayed.rows, keys');
  return grey > 0 && list > grey && list - grey < 600;
})());
add('die Zeile wird grau, wo die Karte grau zeichnet',
  /clusterColorOf/.test(code['FireFootprintPanel.tsx'] ?? '')
  && /STATIC_GREY/.test(code['FireFootprintPanel.tsx'] ?? '')
  && /STATIC_GREY = '#9A9186'/.test(src)
  && /'#9A9186'/.test(mapSrc));
add('ein ortsfester Eintrag wird markiert, nicht entfernt',
  !/filter\([^)]*mostlyStatic/.test(code['FirePage.tsx'] ?? '')
  && !/filter\([^)]*suspectedStatic/.test(code['FireFootprintPanel.tsx'] ?? '')
  && /ortsfest/.test(code['FireFootprintPanel.tsx'] ?? ''));

// BP5 — die Verschmelzung: alles, was die Cluster-Seite trug, ist in der
// Brand-Liste angekommen. Jede Zeile hier ist eine Funktion, die sonst still
// verschwunden wäre (Funktionserhalt, oberste Direktive).
{
  const panel = code['FireFootprintPanel.tsx'] ?? '';
  add('[BP5] Stärke (ΣFRP) steht in der Brand-Zeile', /strengthLabel\(r\.sources\.cluster\)/.test(panel));
  add('[BP5] die Ausdehnung der Hülle steht dort ebenfalls', /extentLabel\(r\.sources\.cluster\)/.test(panel));
  add('[BP5] die Stärke-Skala (CLUSTER_FRP_STOPS) liegt über der Liste', /CLUSTER_FRP_STOPS\.map/.test(panel));
  add('[BP5] die Rangfolge „nach Stärke" ist wählbar', /'area', 'strength', 'recency', 'status'/.test(panel));
  add('[BP5] ohne Detektion gibt es KEINE erfundene Leistung, sondern „—" mit Grund',
    /keine Leistung/.test(panel) && /missingReason\(r, 'hotspots'\)/.test(panel));
  add('[BP5] der Notbetrieb sagt, dass eine Rangfolge nach Stärke erfunden wäre',
    /Rangfolge „nach Stärke" wäre in diesem Zustand erfunden/.test(panel));
  add('[BP5] die Auswahl einer Zeile markiert auch die Hülle ihrer Detektionsgruppe',
    /setSelectedCluster\(r\?\.sources\.cluster\?\.id \?\? null\)/.test(pageSrc));
  add('[BP5] ein Klick auf eine Hülle markiert den Brand, der sie enthält',
    /r\.sources\.cluster\?\.id === id/.test(pageSrc));
  add('[BP5] es gibt nur noch ZWEI Reiter, und der zweite heißt „Brände"',
    /\[\['layers', 'Layer'\], \['fires', 'Brände'\]\] as const/.test(pageSrc));
  add('[BP5] das Overlay am linken Kartenrand ist entfallen',
    !/className="fire-fpanel"/.test(pageSrc) && !/fire-fpanel-tab/.test(pageSrc));
  add('[BP5] der alte Permalink `fp=1` zeigt weiterhin die Liste',
    /initial\?\.footprintPanel \? 'fires' : 'layers'/.test(pageSrc)
    && /footprintPanel: readoutTab === 'fires'/.test(pageSrc));
}

// Land: die Grobzuordnung der Karte (countryGuess) darf hier NICHT benutzt werden.
add('die Landeszuordnung nutzt Umrisse, nicht die DE-Rückfall-Heuristik',
  !/countryGuess/.test(src) && /inRings/.test(src));
add('ohne Umrisse behauptet die Liste kein Land',
  withCountries(buildFireClusters([fixtureRow(48, 11, T)]), null)[0].country === null
  && countryLabel(null) === '—');

const bulk = [];
for (let i = 0; i < 6000; i++) {
  bulk.push(fixtureRow(46 + (i % 100) * 0.08, 6 + Math.floor(i / 100) * 0.15, T - (i % 50) * 3_600_000));
}
const t0 = Date.now();
const built = buildFireClusters(bulk);
const ms = Date.now() - t0;
add('6 000 Detektionen (7-Tage-Größenordnung) unter 400 ms', ms < 400, `${ms} ms, ${built.length} Cluster`);
add('die Liste ist absteigend nach Stärke sortiert',
  built.every((c, i) => i === 0 || built[i - 1].sumFrp >= c.sumFrp));
add('Hülle und Fläche sind reproduzierbar (zweimal derselbe Aufruf ⇒ identisch)',
  JSON.stringify(buildFireClusters(bulk.slice(0, 500))) === JSON.stringify(buildFireClusters(bulk.slice(0, 500))));
add('convexHull/ringAreaKm2 sind gegen Entartung robust',
  convexHull([]).length === 0 && ringAreaKm2([[0, 0], [1, 0]]) === 0);
add('Stärke ohne FRP wird benannt, nicht als 0 MW ausgegeben',
  strengthLabel(buildFireClusters([fixtureRow(48, 11, T, null)])[0]) === 'ohne FRP-Angabe');
add('der Vorgabe-Radius der LISTE ist 2 000 m (Auftrag)', CLUSTER_RADIUS_M === 2000);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
