/**
 * Headless-Verifikation „Sub-Ansichten des EU-Index" (Phase E3, Gate GWBE1).
 *
 *   npm run verify:fire-danger-views
 *
 * Prüft das ECHTE Modul `src/fire/dangerViews.ts` über seine eingebettete
 * Selbstverifikation und ergänzt Sonden gegen die Fehler, die der Kickoff
 * ausdrücklich benennt:
 *
 *   (a) jede Sub-Ansicht trägt eine EIGENE Legende — eigene Klassengrenzen,
 *       eigene Einheit, eigene Bezugsangabe; keine geteilte Legende,
 *   (b) `dc` heißt nie „Bodenfeuchte" — als String geprüft, über ALLES, was
 *       die Ansicht ausgibt, und die blockierte EDO-Bodenfeuchte bleibt als
 *       blockiert benannt (DC tritt nicht an ihre Stelle),
 *   (c) `ranking` nennt seine Referenzperiode — so, wie die Quelle sie nennt,
 *   (d) der Index steht nie allein: Begleiter Einordnung, auf Karte und Karte,
 *   (e) kein neuer Top-Level-Layer — die Sub-Ansichten leben IN `fireDanger`,
 *   (f) Permalink kennt die Sub-Ansicht, alte Links bleiben byte-gleich,
 *   (g) der Prefetch folgt der Sub-Ansicht (sonst wärmt er falsche Kacheln).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyDangerViews, DANGER_VIEWS, DANGER_VIEW_ORDER } from '../src/fire/dangerViews.ts';
import { FIRE_BIT_ORDER, FIRE_LAYER_ORDER } from '../src/fire/fireModel.ts';
import { encodeFireState, decodeFireState } from '../src/fire/fireState.ts';
import { gwisTileUrl, gwisPrefetchUrls } from '../src/fire/sources/gwisFwi.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyDangerViews().checks) add(`[views] ${c.name}`, c.ok, c.detail);

const read = (p) => readFileSync(join(ROOT, 'src', 'fire', p), 'utf8');
const strip = (s) => {
  const t = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = t.search(/export function verify\w*\s*\(/);
  return i < 0 ? t : t.slice(0, i);
};
const card = read('FireLayerCard.tsx');
const page = strip(read('FirePage.tsx'));
const map = strip(read('FireMap.tsx'));

// (a) Eigene Legende je Ansicht — im Steckbrief per Komponente je View, nicht
//     ein gemeinsamer Farbbalken.
add('Steckbrief rendert die Klassen JE Ansicht (DangerClasses view=…), keinen geteilten Balken',
  /function DangerClasses\(/.test(card) && /<DangerClasses view=\{view\}/.test(card)
    && !/DANGER = 'linear-gradient/.test(card));
add('jede Klasse steht mit ihrer Grenze UND die Einheit dazu',
  /fire-li-cls-range/.test(card) && /fire-li-unit/.test(card) && /fire-li-ref/.test(card));

// (b) dc ≠ Bodenfeuchte — als String über die komplette Definition.
const dc = DANGER_VIEWS.dc;
const dcShown = [dc.label, dc.title, dc.answers, dc.unit, dc.reference].join(' | ');
add('dc: „Bodenfeuchte" kommt in Label, Titel, Antwort, Einheit und Bezug nicht vor',
  !/bodenfeucht/i.test(dcShown), dcShown.slice(0, 120));
// In der Grenze darf das Wort nur als NAME des blockierten EDO-Layers stehen —
// und nur zusammen mit der Verneinung, dass DC dessen Größe sei.
const limitWithoutName = dc.limitation.replace(/\(Bodenfeuchte-Anomalie\)/g, '');
add('dc: in der Grenze steht „Bodenfeuchte" NUR als Name der EDO-Größe',
  !/bodenfeucht/i.test(limitWithoutName) && /keine gemessene oder modellierte Feuchte des Erdbodens/.test(dc.limitation)
    && /ersetzt sie nicht/.test(dc.limitation), dc.limitation);
add('dc: Titel ist wörtlich „Trockenheit der Streuauflage (Modellwert)"',
  DANGER_VIEWS.dc.title === 'Trockenheit der Streuauflage (Modellwert)');
// 2026-08-22: die EDO-Layer sind zurückgezogen — der Steckbrief führt sie nicht mehr.
add('die EDO-Layer sind zurückgezogen: kein fireDrought/fireVegetation im Steckbrief',
  !/fireDrought:/.test(card) && !/fireVegetation:/.test(card));

// (c) ranking-Baseline
add('ranking: die Referenzperiode steht IN der Bezugsangabe der Legende (nicht nur im Kommentar)',
  /40-jährig/.test(DANGER_VIEWS.ranking.reference) && /Vitolo/.test(DANGER_VIEWS.ranking.reference));

// (d) Index nie allein — Karte (Begleit-Notiz) und Steckbrief (zweite Legende).
// Brandradar Command-Deck (2026-08-22): der Ein-Klick-Wechsel steht als Verweis im Steckbrief (Vorlage).
add('Steckbrief: Ein-Klick-Wechsel Index ↔ Einordnung',
  /br-link/.test(page) && /companionView\(dangerView\)/.test(page));
add('Steckbrief des Index trägt die Einordnung als zweite Legende (und umgekehrt)',
  /partner && \(/.test(card) && /Dazu gehört die Einordnung/.test(card) && /Dazu gehört der Index/.test(card));

// (e) Kein neuer Top-Level-Layer FÜR E3.
//
// Diese Prüfung stand bis 2026-08-15 als `FIRE_LAYER_ORDER.length === 10`. Das
// war eine fest eingetragene Zahl an Stelle der Aussage, die gemeint war — und
// sie schlug fehl, sobald eine ANDERE Phase einen Layer legitim anhängte (WW1
// Wind, WT1 Bodentrockenheit). Ein Verifier, der bei jeder erlaubten Änderung
// rot wird, wird irgendwann weggeklickt statt gelesen.
//
// Geprüft wird jetzt, was E3 wirklich zugesichert hat:
//   1. Keine der fünf Sub-Ansichten ist ein eigener Layer geworden — aus
//      DANGER_VIEW_ORDER abgeleitet, nicht als handgeschriebene Regex daneben.
//   2. Die zehn BIT-PLÄTZE, die es zum Zeitpunkt von E3 gab, stehen unverändert
//      VORNE (Bit-Stabilität, V-191). Neue Layer dürfen nur angehängt werden.
//      2026-08-19: `fireIndexNational` (Bit 1) und `fireBans` (Bit 4) sind
//      zurückgezogen; ihre Plätze bleiben als `null` besetzt, damit geteilte
//      Links weiter dieselben Layer öffnen.
//      2026-08-22: auch `fireDrought` (Bit 5) und `fireVegetation` (Bit 6)
//      sind zurückgezogen — Plätze bleiben `null`.
const E3_SLOTS = [
  'fireDanger', null, 'fireHotspots', 'fireWeather', null,
  null, null, 'fireFuel', 'fireBurnt', 'fireContext',
];
add('keine Sub-Ansicht des Index ist ein eigener Layer geworden',
  !FIRE_LAYER_ORDER.some((l) => DANGER_VIEW_ORDER.some((v) => l.toLowerCase().includes(v.toLowerCase()))),
  FIRE_LAYER_ORDER.filter((l) => DANGER_VIEW_ORDER.some((v) => l.toLowerCase().includes(v.toLowerCase()))).join(',') || 'keine');
add('die zehn Bit-Plätze aus E3 stehen unverändert vorne — Späteres wurde nur ANGEHÄNGT',
  FIRE_BIT_ORDER.slice(0, 10).join(',') === E3_SLOTS.join(','),
  FIRE_BIT_ORDER.slice(0, 10).join(','));
// Brandradar Command-Deck (2026-08-22): die 5 Ansichten sind Chips auf der Karte, nur bei aktivem Index.
add('Sub-Ansichten-Umschalter mit 5 Ansichten auf der Karte (nur bei aktivem Index)',
  /DANGER_VIEW_ORDER\.map/.test(page) && DANGER_VIEW_ORDER.length === 5
    && /viewChips = active\.has\('fireDanger'\) && \(/.test(page));

// (f) Permalink
const base = { location: null, layers: ['fireDanger'], day: 0, windowH: 24 };
add('Permalink: Standardansicht ändert den Hash NICHT',
  encodeFireState(base) === encodeFireState({ ...base, dangerView: 'fwi' }));
add('Permalink: Sub-Ansicht überlebt Round-Trip',
  decodeFireState(encodeFireState({ ...base, dangerView: 'isi' }))?.dangerView === 'isi');

// (g) Raster + Prefetch folgen der Ansicht.
add('Raster-Quelle trägt den Layer der Sub-Ansicht (Schlüssel Tag|Layer)',
  /DANGER_VIEWS\[s\.dangerView\]\.layer/.test(map) && /rasterKey/.test(map));
for (const v of DANGER_VIEW_ORDER) {
  const url = gwisTileUrl({ isoDate: '2026-08-15', layer: DANGER_VIEWS[v].layer });
  add(`GetMap-URL der Ansicht „${v}" trägt LAYERS=${DANGER_VIEWS[v].layer} und den Tag`,
    url.includes(`LAYERS=${DANGER_VIEWS[v].layer}&`) && url.includes('TIME=2026-08-15'));
}
const dach = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
add('Prefetch folgt der Sub-Ansicht',
  gwisPrefetchUrls('2026-08-16', dach, 6, 40, 'ecmwf.dc').every((u) => u.includes('LAYERS=ecmwf.dc'))
    && /DANGER_VIEWS\[dangerView\]\.layer/.test(map));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
