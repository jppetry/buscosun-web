/**
 * Headless-Verifikation der Blitz-Vorhersage-Rampe (Feature F2) — reine
 * Rampenlogik, kein GPU / kein Fetch / keine GRIB-Daten nötig. Fährt den in
 * `src/radar/lightningPotential.ts` gepflegten Selbsttest (`verifyLpiRisk`) und
 * spiegelt sein PASS/FAIL nach stdout + Exit-Code — Muster der übrigen
 * `verify-*.mjs`-Harnesses (kein Vitest).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-lpi.mjs
 *
 * (Der register-ts-Hook erlaubt den extensionslosen `./convectiveIndex`-Import
 *  aus dem App-Source.)
 */
import { verifyLpiRisk } from '../src/radar/lightningPotential.ts';

const { checks, passed, failed } = verifyLpiRisk();
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
}
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
