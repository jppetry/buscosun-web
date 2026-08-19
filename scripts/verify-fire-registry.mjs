/**
 * Headless-Verifikation „Brand-Registry" (Phase BP1, Gate **GBP1**).
 *
 *   npm run verify:fire-registry
 *
 * Prüft das ECHTE Modul `src/fire/footprint/fireRegistry.ts` über seine
 * eingebettete Selbstverifikation und ergänzt die Sonden aus
 * `audit/brandflaechen-panel.md` §4 (BP1) und `prompt-brandflaechen-panel.md`:
 *
 *   (a) ein weiterer Überflug lässt die Kennung stehen (Anker),
 *   (b) Merge erbt die ältere Kennung, Split behält sie am Anker-Teil,
 *   (c) nie zwei Geometrien je Eintrag, keine kartierte Fläche für zwei Einträge,
 *   (d) „erloschen" nur mit Quelle, „bestätigt" nur mit EFFIS/EMS, keine ha ohne Art,
 *   (e) die Registry ist Komposition — kein zweites Clustering, kein zweiter Abgleich,
 *   (f) `fireClusters.ts` liefert den Anker additiv (BC1-Bestand unverändert).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireRegistry, buildFireRegistry, carryIds, assertRegistry, footprintsToGeoJSON,
  sortRecords, filterRecords, DEFAULT_FILTER, STATUS_LABEL, METHOD_LABEL,
} from '../src/fire/footprint/fireRegistry.ts';
import { buildFireClusters, fixtureRow, verifyFireClusters } from '../src/fire/fireClusters.ts';
import { buildFireZones } from '../src/fire/fireZones.ts';
import { reconcileZones, fixturePoly } from '../src/fire/footprint/reconcile.ts';
import { verifyPlaces, buildPlaceIndex, nearestPlace, MAX_KM } from '../src/fire/footprint/places.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireRegistry().checks) add(`[registry] ${c.name}`, c.ok, c.detail);
// Der Cluster-Bestand (BC1) muss unverändert grün bleiben — der Anker ist additiv.
const cl = verifyFireClusters();
add('[clusters] BC1-Selbstverifikation bleibt vollständig grün', cl.passed === cl.total, `${cl.passed}/${cl.total}`);

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
const reg = code['footprint/fireRegistry.ts'];

// (e) Komposition, kein Neubau
add('die Registry führt KEIN eigenes Union-Find/Clustering (spatialClusters bleibt die eine Stelle)',
  !/spatialClusters|unionFind|find\(parent|LINK_RADIUS_M/.test(reg));
add('die Registry rechnet KEINEN eigenen Flächenabgleich — sie liest `reconciled.confirmed`',
  /reconciled\.confirmed/.test(reg) && !/nearPolygon\(|pointInPolygon\(|distanceToPolygonM\(/.test(reg));
add('die Bewertung kommt aus fireAssessment.assess(), nicht aus einer zweiten Regel',
  /assess\(\{/.test(reg) && !/'bestaetigt'\s*:/.test(reg.replace(/STATUS_RANK[\s\S]*?\};/, '')));
add('kein Date.now() in der Registry (D-12)', !/Date\.now\(\)/.test(reg));
add('der Anker steht additiv in fireClusters.ts und wird dort aus derselben Schleife gefüllt',
  /anchorKey/.test(code['fireClusters.ts']) && (code['fireClusters.ts'].match(/for \(const r of part\)/g) ?? []).length === 1);

// (a)–(d) an einem konstruierten Lauf mit vielen Sätzen — reproduzierbar, kein Math.random
const T = Date.UTC(2026, 7, 16, 12, 0);
const H = 3_600_000; const D = 24 * H;
let worst = null;
for (let seed = 0; seed < 60 && !worst; seed++) {
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const g = i % 5;
    const base = [[50, 10], [50.5, 11], [51.2, 12.4], [47.3, 8.6], [48.9, 13.4]][g];
    rows.push(fixtureRow(base[0] + r(i) * 0.02, base[1] + r(i + 7) * 0.03, T - Math.floor(r(i + 3) * 30) * H, 2 + r(i + 11) * 20));
  }
  const polys = [];
  for (let i = 0; i < 6; i++) {
    polys.push(fixturePoly(`p${seed}-${i}`, 8 + r(i + 30) * 6, 47 + r(i + 40) * 5, 0.005 + r(i + 50) * 0.02, T - Math.floor(r(i + 60) * 6) * D, 1 + r(i + 70) * 100));
  }
  const clusters = buildFireClusters(rows);
  const zones = buildFireZones(rows);
  const recs = buildFireRegistry({
    clusters, zones, reconciled: reconcileZones(zones, polys), polys,
    effisWindow: { fromMs: T - 7 * D, toMs: T + D }, emsActs: [], nowMs: T,
  });
  const a = assertRegistry(recs);
  if (!a.ok) { worst = `seed ${seed}: ${a.problem}`; break; }
  // Ein Überflug dazu: jede bestehende Kennung überlebt (Anker), oder wird per carryIds weitergereicht.
  const more = [...rows, ...rows.slice(0, 5).map((x) => fixtureRow(x.lat + 0.001, x.lon + 0.001, T - 30 * 60_000, 3))];
  const c2 = buildFireClusters(more); const z2 = buildFireZones(more);
  const recs2 = carryIds(buildFireRegistry({
    clusters: c2, zones: z2, reconciled: reconcileZones(z2, polys), polys,
    effisWindow: { fromMs: T - 7 * D, toMs: T + D }, emsActs: [], nowMs: T,
  }), recs);
  const lost = recs.filter((x) => x.id.startsWith('fire:')).filter((x) => !recs2.some((y) => y.id === x.id || y.mergedFrom.includes(x.id)));
  if (lost.length) { worst = `seed ${seed}: ${lost.length} Kennungen verloren (${lost[0].id})`; break; }
  const b = assertRegistry(recs2);
  if (!b.ok) { worst = `seed ${seed} (Lauf 2): ${b.problem}`; break; }
  // GeoJSON: eine Form je Eintrag, jede Kennung höchstens einmal.
  const fc = footprintsToGeoJSON(recs2, { effis: false, raster: false, hull: false });
  const ids = fc.features.map((f) => f.properties.id);
  if (new Set(ids).size !== ids.length) { worst = `seed ${seed}: doppelte Form`; break; }
  // Filter/Sort verlieren nichts.
  if (sortRecords(recs2, 'area').length !== recs2.length || filterRecords(recs2, DEFAULT_FILTER).length !== recs2.length) {
    worst = `seed ${seed}: Sortierung/Filter verändern die Menge`; break;
  }
}
add('60 reproduzierbare Sätze: Zusicherung hält, ein Überflug verliert keine Kennung, eine Form je Eintrag', worst == null, worst ?? '');

// BP3 — Ortsverzeichnis: Fixture-Selbstprüfung + die echte Datei (Bestand, Lizenz, Größe, Suche)
for (const c of verifyPlaces().checks) add(`[places] ${c.name}`, c.ok, c.detail);
{
  const file = join(ROOT, 'public', 'fire', 'places-dach.json');
  let raw = null;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { /* fehlt */ }
  add('[places] public/fire/places-dach.json existiert und nennt GeoNames CC BY 4.0',
    !!raw && /GeoNames/.test(raw.source) && /CC BY 4.0/.test(raw.source));
  if (raw) {
    const idx = buildPlaceIndex(raw);
    add('[places] Verzeichnis: DE, AT und CH enthalten, > 5 000 Orte, jeder Ort mit Land',
      idx.places.length > 5000 && ['DE', 'AT', 'CH'].every((cc) => idx.places.some((x) => x.country === cc))
      && idx.places.every((x) => x.country === 'DE' || x.country === 'AT' || x.country === 'CH'),
      `${idx.places.length} Orte`);
    add('[places] Datei unter 400 KB unkomprimiert (Lazy-Load beim Panel-Öffnen)',
      readFileSync(file).length < 400 * 1024, `${Math.round(readFileSync(file).length / 1024)} KB`);
    const b = nearestPlace(idx, 52.52, 13.405);
    add('[places] Berlin wird bei 52,52 N / 13,405 E gefunden (< 2 km)', b?.name === 'Berlin' && b.distanceKm < 2, JSON.stringify(b));
    const w = nearestPlace(idx, 48.2082, 16.3738);
    add('[places] „Wien", nicht „Vienna" (deutscher Name)', w?.name === 'Wien', w?.name);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) nearestPlace(idx, 46 + (i % 90) * 0.1, 6 + Math.floor(i / 90) * 0.5);
    const dt = performance.now() - t0;
    add('[places] 2 000 Nachschläge < 100 ms', dt < 100, `${Math.round(dt)} ms`);
    add('[places] mitten in der Nordsee: kein Ort (MAX_KM ' + MAX_KM + ')', nearestPlace(idx, 54.9, 6.5) === null);
  }
}

// Sprache
add('Statusbeschriftungen sind genau die drei Wörter aktiv / kein Signal / erloschen',
  Object.values(STATUS_LABEL).join('|') === 'aktiv|kein Signal|erloschen');
add('Methodenbeschriftungen nennen die Quelle (Satellit, EFFIS, EMS)',
  /VIIRS/.test(METHOD_LABEL['viirs-cluster']) && /EFFIS/.test(METHOD_LABEL['effis-rda']) && /EMS/.test(METHOD_LABEL['ems-activation']));
add('das Wort „Brandfläche" fällt in der Registry nur für kartierte Flächen oder mit Verneinung',
  !/Obergrenze[^.]*(?<!keine )Brandfläche/.test(reg));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
