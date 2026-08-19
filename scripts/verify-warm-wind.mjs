/**
 * verify-warm-wind.mjs — netzfreie Verifikation der Warm-Entscheidungslogik des
 * Wind-Crons (V-81). Importiert die ECHTEN Funktionen aus `warm-wind.mjs`
 * (kein Copy — die Lehre aus V-91/V-94: ein Oracle, das die Logik nachbaut,
 * prüft sich selbst).
 *
 *   npm run verify:warm-wind
 *
 * Geprüft werden die beiden Zusicherungen, die V-81 verlangt:
 *
 *   (W.1) Early-Exit nur bei Lauf UND vollständiger Step-Abdeckung.
 *         ICON-D2 publiziert progressiv; die alte Prüfung sah nur den Lauf und
 *         fror das Manifest auf dem ersten Tick ein (Steps 0–4 statt 0–12).
 *   (W.2) Innerhalb eines Laufs gehen nie Steps verloren.
 *         Seit dem Nachwärmen läuft der Schreibpfad auch bei bekanntem Lauf —
 *         ein einzelner fehlgeschlagener Fetch darf das Manifest nicht schrumpfen.
 *
 * Die Warm-Skripte standen bisher vollständig außerhalb jeder Verifikation
 * (`architecture.md` §11 nennt sie ausdrücklich als ungetestet).
 */
import { manifestCovers, mergeSteps } from './warm-wind.mjs';

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── (W.1) Early-Exit-Logik ───────────────────────────────────────────────────
const latest = { run: '2026080306', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

add('kein Manifest → wärmen',
  manifestCovers(null, latest) === false);

add('anderer Lauf → wärmen',
  manifestCovers({ run: '2026080303', steps: latest.steps }, latest) === false);

add('DER V-81-FALL: gleicher Lauf, nur Steps 0–4 → NACHWÄRMEN (vorher: Early-Exit)',
  manifestCovers({ run: '2026080306', steps: [0, 1, 2, 3, 4] }, latest) === false);

add('gleicher Lauf, alle Steps → Early-Exit',
  manifestCovers({ run: '2026080306', steps: latest.steps }, latest) === true);

add('gleicher Lauf, mehr Steps als warmbar → Early-Exit (Superset ist Abdeckung)',
  manifestCovers({ run: '2026080306', steps: [...latest.steps, 13, 14] }, latest) === true);

add('gleicher Lauf, eine Lücke in der Mitte → nachwärmen',
  manifestCovers({ run: '2026080306', steps: latest.steps.filter((s) => s !== 7) }, latest) === false);

add('kaputtes Manifest ohne steps-Array → wärmen (kein Absturz)',
  manifestCovers({ run: '2026080306' }, latest) === false);

add('steps kein Array → wärmen (kein Absturz)',
  manifestCovers({ run: '2026080306', steps: 'kaputt' }, latest) === false);

// ── (W.2) Kein Step-Verlust innerhalb eines Laufs ────────────────────────────
add('Nachwärmen erweitert 0–4 auf 0–12',
  eq(mergeSteps({ run: 'R1', steps: [0, 1, 2, 3, 4] }, 'R1', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));

add('Teilfehler beim Nachwärmen SCHRUMPFT das Manifest nicht',
  eq(mergeSteps({ run: 'R1', steps: [0, 1, 2, 3, 4] }, 'R1', [0, 1, 2, 5, 6]), [0, 1, 2, 3, 4, 5, 6]),
  'aus [0..4] + frisch [0,1,2,5,6] → [0..6], nicht [0,1,2,5,6]');

add('neuer Lauf übernimmt KEINE alten Steps',
  eq(mergeSteps({ run: 'R0', steps: [0, 1, 2, 3, 4] }, 'R1', [0, 1]), [0, 1]),
  'Steps eines anderen Laufs sind andere Dateien');

add('ohne Vor-Manifest genau die frisch gewärmten Steps',
  eq(mergeSteps(null, 'R1', [0, 1, 2]), [0, 1, 2]));

add('Ergebnis ist sortiert und duplikatfrei',
  eq(mergeSteps({ run: 'R1', steps: [4, 0, 2] }, 'R1', [2, 1, 3]), [0, 1, 2, 3, 4]));

const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
