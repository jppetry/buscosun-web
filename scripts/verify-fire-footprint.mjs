/**
 * Headless-Verifikation „Brandflächen in Echtzeit" (Phasen BF3 + BF4, Gate **GBF1**).
 *
 *   npm run verify:fire-footprint
 *
 * Prüft die ECHTEN Module `src/fire/footprint/reconcile.ts` und
 * `src/fire/footprint/history.ts` über ihre eingebetteten Selbstverifikationen
 * und ergänzt die Sonden, die der Kickoff `prompt-brandflaechen-echtzeit.md`
 * §Verification verlangt:
 *
 *   (a) das Clustering ist stabil und reihenfolgeunabhängig,
 *   (b) der Abgleich gibt für EIN Feuer NIE beide Formen aus — als Zusicherung,
 *       nicht als Review-Disziplin, und gegen viele zufällige Sätze,
 *   (c) die Achsenprüfung schlägt bei gespiegelter Geometrie an,
 *   (d) keine Fläche trägt eine Hektarzahl ohne EFFIS-Quelle im selben Satz,
 *   (e) Kartierschwelle und Zeitspanne kommen AUS DEN DATEN, nie fest eingetragen,
 *   (f) die Historie ist ein Filter, kein zweiter Abruf.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyReconcile, reconcileZones, assertNeverBoth, replacedNote, fixtureZone, fixturePoly,
} from '../src/fire/footprint/reconcile.ts';
import {
  verifyHistory, historyIds, filterFeaturesById, historyNote, latestUpdateMs,
  HISTORY_DAYS, HISTORY_LATENCY_NOTE,
} from '../src/fire/footprint/history.ts';
import { buildFireZones, fixtureRow } from '../src/fire/fireZones.ts';
import { buildFireEvents } from '../src/fire/fireEvents.ts';
import { assertDachAxis, axisVerdict } from '../src/fire/sources/wfsAxis.ts';
import { burntUrl, BURNT_TYPENAME, fetchBucketOf } from '../src/fire/sources/euContext.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyReconcile().checks) add(`[reconcile] ${c.name}`, c.ok, c.detail);
for (const c of verifyHistory().checks) add(`[history] ${c.name}`, c.ok, c.detail);

// --- Quelltexte (Kommentare raus, Selbstverifikation ab) ---------------------
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

const T = Date.UTC(2026, 7, 14, 12, 0);

// ---------------------------------------------------------------------------
// (a) Clustering: stabil und reihenfolgeunabhängig
// ---------------------------------------------------------------------------
const rows = [];
for (let i = 0; i < 40; i++) {
  // Drei Nester plus Streupixel — deterministisch, ohne Zufall.
  const g = i % 4;
  const base = [[50, 10], [50.5, 11], [51.2, 12.4], [52 + i * 0.03, 13 + i * 0.05]][g];
  rows.push(fixtureRow(base[0] + (i % 3) * 0.004, base[1] + (i % 5) * 0.006, T + i * 60_000));
}
const zA = buildFireZones(rows);
const zB = buildFireZones([...rows].reverse());
add('Zonenbildung ist reihenfolgeunabhängig (Anzahl, Flächen, Kennungen)',
  zA.length === zB.length
  && zA.map((z) => z.areaHa).join(',') === zB.map((z) => z.areaHa).join(',')
  && zA.map((z) => z.id).sort().join(',') === zB.map((z) => z.id).sort().join(','),
  `${zA.length} Zonen`);
add('Zonenbildung ist stabil (zweimal derselbe Aufruf ⇒ identisch)',
  JSON.stringify(buildFireZones(rows)) === JSON.stringify(zA));
const evA = buildFireEvents(rows, T + 3_600_000);
const evB = buildFireEvents([...rows].reverse(), T + 3_600_000);
add('Ereignisbildung ist reihenfolgeunabhängig (fireEvents.ts, BF1-Bestand)',
  evA.length === evB.length
  && evA.map((e) => e.pixels).sort().join(',') === evB.map((e) => e.pixels).sort().join(','),
  `${evA.length} Ereignisse`);
add('BF1 ist NICHT neu gebaut worden — es gibt genau EIN Clustering-Modul',
  !!code['fireEvents.ts'] && !code['footprint/cluster.ts']
  && /LINK_RADIUS_M/.test(code['fireEvents.ts']));
add('kein Date.now() in der Ereignis-/Zonenlogik (D-12)',
  !/Date\.now\(\)/.test(code['fireEvents.ts']) && !/Date\.now\(\)/.test(code['fireZones.ts'])
  && !/Date\.now\(\)/.test(code['footprint/reconcile.ts']) && !/Date\.now\(\)/.test(code['footprint/history.ts']));

// ---------------------------------------------------------------------------
// (b) Der Abgleich gibt NIE beide Formen aus — gegen viele Sätze
// ---------------------------------------------------------------------------
let worst = null;
for (let seed = 0; seed < 200; seed++) {
  // Deterministischer Pseudo-Zufall (kein Math.random: der Lauf muss reproduzierbar sein).
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const zones = [];
  const polys = [];
  for (let i = 0; i < 6; i++) {
    zones.push(fixtureZone(`z${i}`, 8 + r(i) * 8, 46 + r(i + 10) * 8, 0.01 + r(i + 20) * 0.05, T));
  }
  for (let i = 0; i < 5; i++) {
    polys.push(fixturePoly(`p${i}`, 8 + r(i + 30) * 8, 46 + r(i + 40) * 8, 0.005 + r(i + 50) * 0.04,
      T + (r(i + 60) - 0.5) * 10 * 86_400_000));
  }
  const res = reconcileZones(zones, polys);
  const a = assertNeverBoth(zones, res);
  if (!a.ok) { worst = `seed ${seed}: ${a.problem}`; break; }
}
add('200 zufällige (aber reproduzierbare) Sätze: nie beide Formen, nie ein Verlust', worst == null, worst ?? '');
add('die Zusicherung ist im Produktivpfad verdrahtet, nicht nur im Test',
  /reconcileZones\(/.test(code['FirePage.tsx']));
// BP2: die Karte bekommt `mapZones` — eine TEILMENGE von `reconciled.estimated`
// (Zonen, die die Registry mit einer EFFIS-Fläche vertritt, fallen bei aktivem
// Brandflächen-Layer heraus; sonst identisch). Nie mehr als die geschätzten.
add('die Karte zeichnet NUR die geschätzten Zonen (bzw. eine Teilmenge davon, BP2)',
  /fireZones=\{mapZones\}/.test(code['FirePage.tsx'])
  && /return reconciled\.estimated;/.test(code['FirePage.tsx'])
  && /reconciled\.estimated\.filter\(/.test(code['FirePage.tsx'])
  && !/fireZones=\{fireZones\}|fireZones=\{reconciled\.confirmed/.test(code['FirePage.tsx']));
add('ist der Brandflächen-Layer aus, wird NICHTS ersetzt (Funktionserhalt)',
  /if \(!active\.has\('fireBurnt'\)\) return \[\]/.test(code['FirePage.tsx']));
add('der Steckbrief-Pfad liest aus derselben Liste (kein zweiter Zonenbestand)',
  (code['FireMap.tsx'].match(/s\.fireZones/g) ?? []).length >= 2
  && !/fireZonesAll|allZones/.test(code['FireMap.tsx']));

// ---------------------------------------------------------------------------
// (c) Achsenprüfung schlägt bei gespiegelter Geometrie an
// ---------------------------------------------------------------------------
const dachFeature = (lon, lat) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } });
add('Achsenprüfung: korrekte lon/lat-Geometrie passiert', (() => {
  try { assertDachAxis([dachFeature(10.4, 51.7), dachFeature(11.2, 48.3)], 'test'); return true; } catch { return false; }
})());
add('Achsenprüfung: GESPIEGELTE Geometrie wirft', (() => {
  try { assertDachAxis([dachFeature(51.7, 10.4), dachFeature(48.3, 11.2)], 'test'); return false; } catch { return true; }
})());
add('das Urteil beruht auf den ZURÜCKGEGEBENEN Koordinaten, nicht auf Zählständen',
  typeof axisVerdict === 'function'
  && axisVerdict([dachFeature(51.7, 10.4)]) !== axisVerdict([dachFeature(10.4, 51.7)]));
add('beide Brandflächen-Pfade rufen assertDachAxis',
  (code['sources/euContext.ts'].match(/assertDachAxis\(/g) ?? []).length >= 2);

// ---------------------------------------------------------------------------
// (d) Keine Hektarzahl ohne EFFIS-Quelle im selben Satz
// ---------------------------------------------------------------------------
const zone = fixtureZone('z', 10, 50, 0.02, T);
const poly = fixturePoly('p', 10, 50, 0.005, T, 5);
const note = replacedNote({ zone, poly });
add('die Ersetzungs-Zeile nennt EFFIS im selben Satz wie die Hektarzahl',
  /EFFIS[^.]*\d+ ha/.test(note), note);
// Jede „ha"-Ausgabe der Waldbrand-Ansicht muss entweder EFFIS nennen oder als
// Raster/Abdeckung ausgewiesen sein. Geprüft an den Textbausteinen, nicht am HTML.
const haSources = [
  ['reconcile.replacedNote', note],
  ['history.note', historyNote(3, T, null, T)],
  ['history.latency', HISTORY_LATENCY_NOTE],
];
const badHa = haSources.filter(([, s]) => /\d[\d.,]*\s*ha/.test(s)
  && !/EFFIS/.test(s) && !/Raster|Abdeckung|abgedeckt/i.test(s));
add('keine Hektarzahl ohne EFFIS oder Raster-Kennzeichnung im selben Text',
  badHa.length === 0, badHa.map(([n]) => n).join(','));
add('das Detektionsraster behauptet weiterhin keine Brandfläche',
  /keine Brandfläche/.test(code['fireZones.ts']) && !/Brandfläche: \$\{/.test(code['fireZones.ts']));

// ---------------------------------------------------------------------------
// (e) Kartierschwelle und Zeitspanne aus den Daten
// ---------------------------------------------------------------------------
add('minAreaHa/maxAreaHa werden aus den Features gelesen, nicht eingetragen',
  /minAreaHa/.test(code['sources/euContext.ts']) && !/minAreaHa\s*[:=]\s*\d/.test(code['sources/euContext.ts']));
add('keine fest eingetragene 30-ha-Schwelle irgendwo in der Ansicht',
  !Object.values(code).some((s) => /(≥|ab)\s?30\s?ha|30-ha-Schwelle/.test(s)));
add('die Zeitspanne kommt aus FIREDATE der Features (from/to je Lauf)',
  /from:\s*isoDay\(from\)/.test(code['sources/euContext.ts']));
add('die Latenz-Angabe der Historie ist die GEMESSENE Spanne',
  /0,3 bis 4,3 Tage/.test(HISTORY_LATENCY_NOTE));

// ---------------------------------------------------------------------------
// (f) Historie: ein Filter, kein zweiter Abruf
// ---------------------------------------------------------------------------
add('week und season zeigen auf VERSCHIEDENE Typenamen (die Quelle kennt beide)',
  BURNT_TYPENAME.week === 'ms:modis.ba.poly.week' && BURNT_TYPENAME.season === 'ms:modis.ba.poly.season');
add('der Anzeige-Korb `week` wird über den SAISON-Abruf bedient (kein zweiter Request)',
  fetchBucketOf('week') === 'season' && fetchBucketOf('season') === 'season' && fetchBucketOf('archive') === 'archive');
add('FirePage ruft nur die Abruf-Körbe ab, nicht die Anzeige-Körbe',
  /wanted\.map\(fetchBucketOf\)/.test(code['FirePage.tsx']));
add('fetchBurntWeek bleibt der EINE Zusatzabruf für die Bestätigung (V-225)',
  (code['FirePage.tsx'].match(/fetchBurntWeek\(/g) ?? []).length === 1);
add('der Wochen-Korb der Anzeige löst KEINEN fetchBurntAreas("week") aus',
  !/fetchBurntAreas\(\s*['"]week['"]/.test(code['FirePage.tsx']));
add('die Körbe überlappen sich nicht: season wird um das Wochenfenster beschnitten',
  /filterFeaturesById\(fc, windowIds, false\)/.test(code['FirePage.tsx']));
add('der Tagesschritt filtert NUR den Wochenkorb',
  /shownIds\s*=\s*burntDay == null \? windowIds/.test(code['FirePage.tsx']));
add('die Zeitachse läuft über FIREDATE, nicht über LASTUPDATE',
  /firedateMs/.test(code['footprint/history.ts'])
  && !/lastUpdateMs\s*>=\s*fromMs|inHistory[\s\S]{0,200}lastUpdateMs/.test(code['footprint/history.ts']));
add('LASTUPDATE erscheint als Frischestempel, getrennt benannt',
  /zuletzt bearbeitet/.test(historyNote(1, T, null, T)) && typeof latestUpdateMs === 'function');
add('das Fenster ist 7 Tage (wie der Server-Korb)', HISTORY_DAYS === 7);

// Filter-Eigenschaften an einem konstruierten Satz.
const polysH = [
  { id: 'a', firedateMs: T, lastUpdateMs: T + 86_400_000 },
  { id: 'b', firedateMs: T - 3 * 86_400_000, lastUpdateMs: T },
  { id: 'c', firedateMs: T - 30 * 86_400_000, lastUpdateMs: T },
].map((p) => ({ ...p, finaldateMs: null, areaHa: 3, country: 'DE', province: null, commune: null, percNa2k: 0, polys: [], bbox: [10, 50, 10.1, 50.1], landcover: { CONIFER: 100, BROADLEA: 0, MIXED: 0, SCLEROPH: 0, TRANSIT: 0, OTHERNATLC: 0, AGRIAREAS: 0, ARTIFSURF: 0, OTHERLC: 0 } }));
const fc = { type: 'FeatureCollection', features: polysH.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [10, 50] } })) };
const ids = historyIds(polysH, T + 3_600_000, null);
const inWeek = filterFeaturesById(fc, ids, true);
const rest = filterFeaturesById(fc, ids, false);
add('Filter teilt die Sammlung vollständig und überschneidungsfrei',
  inWeek.features.length + rest.features.length === fc.features.length
  && inWeek.features.length === 2 && rest.features.length === 1);
add('die 30 Tage alte Fläche landet im Rest, nicht in der Woche',
  rest.features[0].properties.id === 'c');

// Kein Server-Deckel auf dem Brandflächen-Pfad (V-224).
add('kein maxfeatures-Kleindeckel: der Notbremsen-Wert steht weit über dem Bestand',
  /maxfeatures=\$\{BURNT_MAX_FEATURES\}/.test(code['sources/euContext.ts'].replace(/\s+/g, ''))
  || /maxfeatures=\$\{BURNT_MAX_FEATURES\}/.test(code['sources/euContext.ts']));
add('burntUrl trägt die DACH-BBox in lat,lon (WFS 1.1.0)',
  /bbox=45\.5,5\.5,55\.5,17\.5,EPSG:4326/.test(burntUrl('week')));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
