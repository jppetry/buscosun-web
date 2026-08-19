/**
 * Headless-Verifikation „Brandereignisse" (Phase F2, Gate GWBF1).
 *
 *   npm run verify:fire-events
 *
 * Prüft das ECHTE Modul `src/fire/fireEvents.ts` über seine eingebettete
 * Selbstverifikation und ergänzt Sonden gegen die zwei Fehler, die genau diese
 * Phase gefährlich machen:
 *
 *   (a) das Wort „bestätigt" darf aus der Gruppierung NIE entstehen —
 *       mehrere Überflüge machen eine Detektion wahrscheinlicher, nicht bestätigt,
 *   (b) die Ortsfestigkeits-Heuristik darf einen wachsenden Brand nicht
 *       ausgrauen, und sie muss als EIGENE Ableitung gekennzeichnet sein.
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  verifyFireEvents, buildFireEvents, eventLabel, staticNote, trendLabel,
  STATIC_MIN_DAYS, STATIC_MOVE_M, LINK_RADIUS_M,
} from '../src/fire/fireEvents.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

for (const c of verifyFireEvents().checks) add(`[events] ${c.name}`, c.ok, c.detail);

const src = readFileSync(join(ROOT, 'src', 'fire', 'fireEvents.ts'), 'utf8');
const code = (() => {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const i = s.search(/export function verify\w*\s*\(/);
  return i < 0 ? s : s.slice(0, i);
})();

// (a) Sprachregel. Gesucht wird „bestätigt" als eigenes Wort im AUSGEGEBENEN
//     Text — `unbestätigt` ist erlaubt und ausdrücklich gewollt.
const now = Date.UTC(2026, 7, 14, 12, 0);
const mk = (lat, lon, acqMs, frp = 5, sat = 'N') => ({
  lat, lon, acqMs, frp, confidence: 'nominal', brightTi4: 320, brightTi5: 290,
  scanKm: 0.4, trackKm: 0.4, satellite: sat, day: false, source: 'VIIRS_SNPP_NRT',
});
const DAY = 86_400_000;

const manyOverpasses = [];
for (let i = 0; i < 30; i++) manyOverpasses.push(mk(48, 11, now - i * 3_600_000));
const labels = [
  eventLabel(buildFireEvents([mk(48, 11, now)], now)[0]),
  eventLabel(buildFireEvents(manyOverpasses, now)[0]),
  trendLabel('growing'), trendLabel('steady'), trendLabel('quiet'),
];
const industry = [];
for (let d = 0; d < 6; d++) industry.push(mk(51.48, 6.72, now - d * DAY));
labels.push(staticNote(buildFireEvents(industry, now)[0]) ?? '');
const badWord = labels.filter((t) => /(^|[^n])bestätigt/i.test(t.replace(/unbestätigt/gi, '')));
add('kein ausgegebener Text behauptet „bestätigt"', badWord.length === 0,
  badWord.join(' | ') || `${labels.length} Texte geprüft`);
add('der Einzelüberflug wird ausdrücklich als unbestätigt ausgewiesen',
  /unbestätigt/.test(labels[0]), labels[0]);

// (b) Die Heuristik. Beide Bedingungen müssen im Produktivcode stehen — eine
//     Fassung, die nur Tage zählt, würde einen Großbrand ausgrauen.
add('die Ortsfestigkeit prüft BEIDE Bedingungen (Tage UND kein Wachstum)',
  /distinctDays|days\.size/.test(code) && /STATIC_MIN_DAYS/.test(code) && /!grew\(/.test(code));
add('Schwellen stehen als benannte Konstanten da',
  STATIC_MIN_DAYS === 5 && STATIC_MOVE_M === 1000 && LINK_RADIUS_M === 1500,
  `${STATIC_MIN_DAYS}/${STATIC_MOVE_M}/${LINK_RADIUS_M}`);
add('jedes Ereignis trägt origin=derived (die Einordnung ist unsere, nicht die der Quelle)',
  buildFireEvents(industry, now).every((e) => e.origin === 'derived'));

// Das Modul darf NICHTS abrufen — F2 ist ausdrücklich ohne zusätzliche Anfrage.
add('fireEvents.ts ruft nichts ab (kein fetch, keine URL)',
  !/\bfetch\s*\(/.test(code) && !/https?:\/\//.test(code));

// Und es darf aus der Leistung keine Fläche machen.
add('aus frp wird keine Fläche in Hektar abgeleitet',
  !/\bfrp\b[^\n]{0,60}(hektar|areaHa|\bha\b)/i.test(code));

// Der Gegentest noch einmal unabhängig von der Selbstverifikation: ein Brand,
// der sich über sechs Tage ausbreitet, bleibt normal eingefärbt.
const spreading = [];
for (let d = 0; d < 6; d++) {
  for (let k = 0; k <= d; k++) spreading.push(mk(48 + d * 0.004 + k * 0.002, 11, now - (5 - d) * DAY - k * 3_600_000, 60));
}
const spreadEv = buildFireEvents(spreading, now)[0];
add('unabhängiger Gegentest: ausbreitender Brand bleibt NICHT ausgegraut',
  spreadEv.suspectedStatic === false && spreadEv.distinctDays >= 5,
  `${spreadEv.distinctDays} Tage, ${spreadEv.extentKm} km`);

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
