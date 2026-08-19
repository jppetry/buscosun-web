/**
 * Headless-Verifikation „Datenalter & Datenlage" (Phase R2 — V-19/V-20/V-21).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-datenalter.mjs
 *
 * Prüft die ECHTEN App-Module (kein Nachbau — V-94-Lehre):
 *   • `src/dataAge.ts`              — Formate, Schwellen, „keine Referenz ⇒ keine Behauptung"
 *   • `src/sources/manifestHealth.ts` — Zustände, Worst-of-Aggregation, Hörer
 * und ergänzt eine QUELL-SONDE über `src/MapView.tsx`, die den Rückfall verhindert,
 * den V-19 beschreibt: kein `updateStatus(..., ok:)` darf `Date.now()` als
 * Datenalter ausgeben. Erlaubt ist nur (a) eine echte Referenzzeit (`ref:`) oder
 * (b) eine ausdrückliche Begründung im Kommentar davor („keine Referenzzeit:").
 *
 * Netzfrei, dependency-frei, PR-tauglich.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyDataAge, dataAgeText, isStale, runLabel, ageText, oldestRef,
  STALE_RUN_H, MANIFEST_STALE_H,
} from '../src/dataAge.ts';
import {
  verifyManifestHealth, reportManifest, getManifestHealth, resetManifestHealth, stateFromUpdatedAt,
} from '../src/sources/manifestHealth.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Die in den Modulen eingebetteten Selbstverifikationen ---------------
for (const c of verifyDataAge().checks) add(`[dataAge] ${c.name}`, c.ok, c.detail);
for (const c of verifyManifestHealth().checks) add(`[manifestHealth] ${c.name}`, c.ok, c.detail);

// --- (2) Unabhängige Kontrollen gegen die exportierten Helfer ----------------
const now = Date.UTC(2026, 7, 1, 15, 0);
const H = 3_600_000;

add('Schwellen unverändert: 9 h Daten / 6 h Manifest',
  STALE_RUN_H === 9 && MANIFEST_STALE_H === 6, `${STALE_RUN_H}/${MANIFEST_STALE_H}`);

// Der ganze Zweck von V-19: ein alter Lauf darf NICHT frisch aussehen.
const oldRun = { atMs: now - 9.5 * H, kind: 'run' };
add('9,5-h-Lauf: Text nennt das Alter UND wird als stale markiert',
  dataAgeText(oldRun, now, now) === 'Lauf 05z · vor 9 h' && isStale(oldRun, now) === true,
  dataAgeText(oldRun, now, now));

// Ein gesunder Lauf am Ende seines Zyklus darf NICHT als Problem erscheinen.
add('6-h-Lauf (normaler Zyklus) ist nicht stale', isStale({ atMs: now - 6 * H, kind: 'run' }, now) === false);

// Die Ehrlichkeits-Kernregel, in beiden Richtungen.
add('Abrufzeit wird als Abrufzeit beschriftet, nie als Lauf/Stand',
  !dataAgeText(null, now, now).includes('Lauf') && !dataAgeText(null, now, now).includes('Stand'));
add('Referenzzeit verdrängt die Abrufzeit vollständig',
  !dataAgeText({ atMs: now, kind: 'run' }, now - 5 * H, now).includes('abgerufen'));

// Lauf-Kürzel folgt der meteorologischen UTC-Konvention (00/03/…/21z).
add('runLabel ist UTC-basiert (nicht lokalzeit-abhängig)',
  runLabel(Date.UTC(2026, 0, 1, 0)) === '00z' && runLabel(Date.UTC(2026, 6, 1, 21)) === '21z');

// Komposit-Regel: das Ganze ist so alt wie sein ältester Teil.
const de = { atMs: now - 8 * 60_000, kind: 'measured' };
const ch = { atMs: now - 22 * 60_000, kind: 'measured' };
add('DACH-Komposit erbt die ÄLTESTE Messzeit (konservativ)',
  dataAgeText(oldestRef([de, ch]), now, now).endsWith('vor 22 min'),
  dataAgeText(oldestRef([de, ch]), now, now));
add('Komposit ohne jede Messzeit (nur AT-INCA) behauptet nichts',
  dataAgeText(oldestRef([null, undefined]), now, now).startsWith('abgerufen '));

// Manifest: ein gesundes Manifest, dessen Param fehlt, ist KEIN Defekt.
resetManifestHealth();
reportManifest('/latest-grib.json', stateFromUpdatedAt(now - 20 * 60_000, now), now - 20 * 60_000);
add('gesundes Manifest ohne den angefragten Param ⇒ kein Hinweis',
  getManifestHealth().state === 'fresh', getManifestHealth().state);
resetManifestHealth();
add('Registry nach reset wieder unknown', getManifestHealth().state === 'unknown');

// --- (3) Quell-Sonde: MapView darf keine Abrufzeit als Datenalter ausgeben ---
const src = readFileSync(join(ROOT, 'src', 'MapView.tsx'), 'utf8');
const lines = src.split(/\r?\n/);

const okSites = [];
for (let i = 0; i < lines.length; i++) {
  if (!/updateStatus\([^)]*\{\s*ok:|ok:\s*\{\s*model:/.test(lines[i])) continue;
  if (!/\bok:\s*\{/.test(lines[i])) continue;
  okSites.push({ line: i + 1, text: lines[i] });
}
add('Sonde findet die ok-Aufrufe in MapView.tsx', okSites.length >= 20, `${okSites.length} Stellen`);

// Ein ok-Aufruf ist genau dann ehrlich, wenn er entweder eine Referenzzeit trägt
// oder in den drei Zeilen davor ausdrücklich begründet, warum es keine gibt.
const offenders = [];
for (const site of okSites) {
  if (/\bref:/.test(site.text)) continue;
  const before = lines.slice(Math.max(0, site.line - 4), site.line - 1).join('\n');
  if (/keine Referenzzeit:/.test(before)) continue;
  offenders.push(site.line);
}
add('kein ok-Status ohne Referenzzeit oder ausdrückliche Begründung',
  offenders.length === 0, offenders.length ? `Zeilen ${offenders.join(', ')}` : 'alle belegt');

// Die alte, unehrliche Formatierung darf nicht zurückkehren.
add('keine Anzeige von `fetchedAt` als Uhrzeit mehr',
  !/fmtTime\(\s*s?t?\.?ok\.fetchedAt/.test(src) && !/captured\s*\?\s*'Stand '/.test(src));
// Genau drei Flächen zeigen den Status: .data-badge, die Layer-Zeile im Dock
// und die Statuspille. Alle drei müssen denselben Formatierer benutzen, sonst
// laufen sie wieder auseinander (das war der Ausgangszustand).
add('alle drei Statusflächen gehen über den gemeinsamen `statusStamp`',
  (src.match(/statusStamp\(/g) ?? []).length >= 3,
  `${(src.match(/statusStamp\(/g) ?? []).length} Aufrufstellen`);

// --- (4) V-20/V-21: die Aussagen stehen tatsächlich in der UI ---------------
add('V-20: Manifest-Hinweis ist verdrahtet (Desktop-Pille + Mobil-Screen)',
  (src.match(/manifestNote/g) ?? []).length >= 4, `${(src.match(/manifestNote/g) ?? []).length} Vorkommen`);

const panel = readFileSync(join(ROOT, 'src', 'confidence', 'HitRatePanel.tsx'), 'utf8');
add('V-21: UI benennt den Analyse-Konsens als Referenz',
  /Konsens der Modell-Analysen/.test(panel) && /nicht eine Stationsmessung/.test(panel));
add('V-21: UI behauptet nicht mehr „echtes Wetter"', !/am echten Wetter/.test(panel));

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
