/**
 * Gate für die Deep-Links auf amtliche Fremdquellen (V-17 / V-119).
 *
 *   npm run verify:official-sources
 *
 * Importiert das TS-Modul direkt (kein Copy) — was hier grün ist, ist exakt das
 * Mapping, das die Punkt-Vorhersage im Browser rendert. Netzunabhängig und
 * deterministisch, also PR-gate-tauglich (O-02 Option B).
 *
 * Der wichtigste Check ist nicht die URL, sondern die Länder-Asymmetrie:
 * `dwdAlerts.ts` liefert Warnungen NUR für Deutschland. Solange das so ist,
 * MUSS `hasOwnWarnings()` für AT/CH false melden — sonst verschwindet der
 * Hinweis, und eine Datenlücke sähe wieder aus wie eine Entwarnung.
 *
 * ⚠️ Seit Phase W2 gibt es ZWEI Abdeckungen, und sie sind verschieden:
 *   · `hasOwnWarnings()`    — Punkt-Vorhersage, Basis `dwdAlerts.ts`: DE
 *   · `hasOwnMapWarnings()` — 2D-Karten-Layer `warnings`:            DE + CH
 * Das Schutznetz wurde deshalb nicht umgedreht, sondern **verdoppelt**: es
 * bewacht jetzt beide Flächen einzeln. Österreich bleibt in beiden ohne eigene
 * Daten — der Deep-Link samt Dauersiedlungsraum-Vorbehalt bleibt Pflicht, bis
 * Phase W3 ihn ablöst.
 *
 * Red-Test-Nachweis (V-99): Setzt man in `officialSources.ts` `hasOwnWarnings`
 * auf `return true`, meldet dieser Harness
 *   ✗ AT/CH dürfen in der PUNKT-Vorhersage keine eigenen Warnungen melden …
 * und beendet mit Exit 1. Verifiziert am 2026-08-01, erneut am 2026-08-08.
 */
import { verifyOfficialSources, warningsSourceFor, hasOwnWarnings, hasOwnMapWarnings } from '../src/officialSources.ts';

const { checks, passed, failed } = verifyOfficialSources();

console.log('\nAmtliche Fremdquellen (Warnungen DE/AT/CH):\n');
for (const c of ['DE', 'AT', 'CH']) {
  const s = warningsSourceFor(c);
  console.log(`  · ${c}: ${s.name} — ${s.operator}`);
  console.log(`      ${s.url}`);
  console.log(`      eigene Daten — Karte: ${hasOwnMapWarnings(c) ? 'ja' : 'NEIN'}`
    + ` · Punkt-Vorhersage: ${hasOwnWarnings(c) ? 'ja' : 'NEIN'}`);
  if (s.caveat) console.log(`      Einschränkung: ${s.caveat}`);
}

console.log('');
if (failed.length) for (const f of failed) console.log(`  ✗ ${f}`);
console.log(`\n  ${passed}/${checks} passed, ${failed.length} failed\n`);

process.exit(failed.length === 0 ? 0 : 1);
