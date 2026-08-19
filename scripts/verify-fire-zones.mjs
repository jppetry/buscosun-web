/**
 * Headless-Verifikation „Detektionsraster" (Phase BA3, Gate GWBBZ1).
 *
 *   npm run verify:fire-zones
 *
 * Prüft das ECHTE Modul `src/fire/fireZones.ts` über seine eingebettete
 * Selbstverifikation und ergänzt die Sonden gegen die Fehler, die genau diese
 * Phase teuer machen:
 *
 *   (a) das Raster heißt nirgends „Brandfläche" und trägt nirgends das
 *       Bestätigungsvokabular — es ist die Gegenprobe zur EFFIS-Kartierung,
 *       nicht ihr Ersatz,
 *   (b) die Fläche wird NIE aus `frp` abgeleitet (die Regel aus F1, hier für
 *       die neue Zahl noch einmal verankert),
 *   (c) die Zone ist die Vereinigung genau der Rechtecke, die der
 *       Footprint-Layer zeichnet — dieselbe Funktion, keine zweite Formel,
 *   (d) überlappende Pixel zählen ihre Fläche nicht doppelt (der Fehler, der
 *       eine Zone stumm um Faktor 2–5 aufblähen würde),
 *   (e) es gibt keinen freien Parameter: keine Hüllen-Konkavität, kein
 *       DBSCAN-Radius, keine Glättung,
 *   (f) die Größenangabe steht nie ohne ihren Hinweis.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireZones, buildFireZones, zonesToGeoJSON, zoneAt, zoneAreaLabel, zoneAreaNote,
  polysAreaHa, fixtureRow, ZONE_NOTE, MAX_RECTS_PER_ZONE,
} from '../src/fire/fireZones.ts';
import { footprintRing } from '../src/fire/sources/firmsHotspots.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireZones().checks) add(`[zones] ${c.name}`, c.ok, c.detail);

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
const zonesSrc = code['fireZones.ts'];

// (a) Kein Brandflächen-Vokabular auf dem Raster.
add('fireZones.ts behauptet nirgends eine „Brandfläche"',
  !/(^|[^n])Brandfläche(?!n?[a-zäöü]*\s*(kommt|von EFFIS|wird|ist in aller|kartier))/.test(
    zonesSrc.replace(/keine Brandfläche/g, '')));
add('das Raster behauptet nirgends eine Bestätigung',
  !/\b(bestätigt|verifiziert|nachgewiesen)\b/i.test(zonesSrc));
add('der Verweis auf die amtliche Kartierung zeigt auf EFFIS, nicht auf das Raster',
  /amtlich kartiert wird er von EFFIS/.test(zonesSrc));

// (b) Keine Fläche aus Leistung — die Regel aus F1, für die neue Zahl verankert.
//     Die Prüfzeile `fixtureRow` baut eine vollständige FirmsRow und nennt die
//     Felder deshalb; gemeint ist die RECHNUNG, nicht die Erwähnung.
const zonesCalc = zonesSrc.replace(/export function fixtureRow[\s\S]*?\n}\n/, '');
add('die Fläche wird NICHT aus frp/Helligkeit abgeleitet',
  !/\bfrp\b|brightTi/.test(zonesCalc));
add('die Fläche kommt aus scan/track (den Pixelkanten)',
  /footprintRing/.test(zonesSrc) && !/scanKm\s*\*\s*\d|\d\s*\*\s*scanKm/.test(zonesSrc));

// (c) Identität mit dem gezeichneten Footprint — keine zweite Formel.
const row = fixtureRow(49.5, 11.2, Date.UTC(2026, 7, 14, 10, 0), 0.52, 0.47);
const ring = footprintRing(row);
const zone = buildFireZones([row])[0];
add('die Zone deckt sich mit dem Footprint-Rechteck des Layers (Ecken identisch)', (() => {
  const zr = zone.polys[0][0];
  const xs = new Set(zr.map((p) => p[0].toFixed(9)));
  const ys = new Set(zr.map((p) => p[1].toFixed(9)));
  const rx = new Set(ring.map((p) => p[0].toFixed(9)));
  const ry = new Set(ring.map((p) => p[1].toFixed(9)));
  return [...xs].every((v) => rx.has(v)) && [...ys].every((v) => ry.has(v)) && xs.size === 2 && ys.size === 2;
})());
add('Fläche des Einzelpixels = scan × track (0,52 × 0,47 km ⇒ 24,4 ha)',
  Math.abs(zone.areaHa - 0.52 * 0.47 * 100) < 0.3, `${zone.areaHa} ha`);
add('Zellsumme und Umriss stimmen auch bei nicht-quadratischen Pixeln überein',
  Math.abs(polysAreaHa(zone.polys, zone.lat) - zone.areaHa) / zone.areaHa < 0.01);

// (d) Der teure stille Fehler: doppelt gezählte Überlappung.
const T = Date.UTC(2026, 7, 14, 12, 0);
const stack = [];
for (let i = 0; i < 12; i++) stack.push(fixtureRow(50 + i * 0.00002, 10, T + i * 60_000));
const stacked = buildFireZones(stack);
// 12 Pixel, um je 2,2 m versetzt: die Zone darf nur um den Versatz wachsen
// (~1,5 ha), nicht um 12 Pixelflächen (192 ha).
add('zwölf fast deckungsgleiche Pixel ⇒ eine Zone knapp über einer Pixelfläche',
  stacked.length === 1 && stacked[0].pixels === 12 && stacked[0].areaHa < 18,
  stacked[0] ? `${stacked[0].areaHa} ha bei 12 Pixeln (12 × 16 ha wären 192)` : '—');
add('die Zonenfläche ist nie größer als die Summe der Einzelpixel', (() => {
  const sum = stacked[0].meanPixelHa * stacked[0].pixels;
  return stacked[0].areaHa <= sum + 0.01;
})());

// (e) Keine freien Parameter — der Grund, warum diese Zahl eine Messgröße ist.
add('kein Hüllen-/Clusterparameter im Modul (concavity, dbscan, alpha, epsilon)',
  !/concav|dbscan|alphaShape|epsilon|smoothing|tolerance/i.test(zonesSrc));
add('keine neue Runtime-Dependency (D-06): nur ein projektinterner Import',
  (zonesSrc.match(/^import .*from '(?!\.)/gm) ?? []).length === 0);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
add('package.json führt weiterhin genau die bekannten Runtime-Dependencies',
  Object.keys(pkg.dependencies ?? {}).sort().join(',') === 'bz2,bzip2-wasm,jsfive,maplibre-gl,react,react-dom',
  Object.keys(pkg.dependencies ?? {}).join(','));
add('der Deckel je Zone ist eine Notbremse, keine Mengensteuerung (≥ 1000)',
  MAX_RECTS_PER_ZONE >= 1000);

// (f) Zahl und Hinweis gehören zusammen — in der Karte wie im Modul.
add('die Beschriftung nennt immer die Pixelzahl neben den Hektar',
  /\d+ ha aus .*Pixel/.test(zoneAreaLabel(zone)), zoneAreaLabel(zone));
add('der Hinweis nennt die Einzelpixelgröße als Maßstab',
  /ein Pixel bedeckt hier/.test(zoneAreaNote(zone)));
add('FireMap zeigt die Fläche nie ohne den Hinweis',
  !/zoneAreaLabel/.test(code['FireMap.tsx']) || /zoneAreaNote/.test(code['FireMap.tsx']));
add('der Layer-Hinweis grenzt gegen EFFIS ab', /EFFIS/.test(ZONE_NOTE));

// (g) Verdrahtung: eigene GL-Layer, unter den Punkten, im Hotspot-Schalter.
if (code['FireMap.tsx']) {
  add('FireMap führt eigene GL-Layer für das Raster',
    /fire-hotspots-zone-fill/.test(code['FireMap.tsx']) && /fire-hotspots-zone-line/.test(code['FireMap.tsx']));
  add('das Raster hängt am Hotspot-Schalter (kein neuer Layer-Eintrag im Modell)',
    !/fireZone(?!s)/.test(code['fireModel.ts'] ?? ''));
}

// (h) Größenordnung an einem realen Fall: EMSR920/AOI02 Langenfeld, 24,1 ha
//     laut Copernicus-EMS-Delineation. Zwei Pixel sind bereits mehr.
const pxStep = 0.42 / 110.574; // genau eine Pixelhöhe — zwei Pixel Kante an Kante
const twoPx = buildFireZones([
  fixtureRow(51.11, 6.95, T, 0.42, 0.42),
  fixtureRow(51.11 + pxStep, 6.95, T, 0.42, 0.42),
]);
add('zwei benachbarte Nadirpixel decken mehr als die 24,1 ha des realen Referenzbrandes',
  twoPx[0].areaHa > 24.1, `${twoPx[0].areaHa} ha gegen 24,1 ha (EMSR920/AOI02)`);

// (i) Klickziel und GeoJSON.
add('zoneAt findet die Zone unter der Pixelmitte', zoneAt(11.2, 49.5, [zone]) === zone);
add('zoneAt liefert außerhalb null', zoneAt(11.3, 49.5, [zone]) === null);
add('GeoJSON ist ein MultiPolygon je Zone',
  zonesToGeoJSON([zone]).features[0].geometry.type === 'MultiPolygon');

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
