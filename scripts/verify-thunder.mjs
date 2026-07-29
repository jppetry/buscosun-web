/**
 * Headless-Verifikation der Gewitterpotenzial-Fusion (Feature F1) — reine
 * Fusionslogik, kein GPU / kein Fetch / keine GRIB-Daten nötig. Fährt den in
 * `src/radar/thunderPotential.ts` gepflegten Selbsttest (`verifyThunderPotential`)
 * und spiegelt sein PASS/FAIL nach stdout + Exit-Code — Muster der übrigen
 * `verify-*.mjs`-Harnesses (kein Vitest).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-thunder.mjs
 *
 * (Der register-ts-Hook erlaubt den extensionslosen `./convectiveIndex`-Import
 *  aus dem App-Source.)
 */
import { verifyThunderPotential } from '../src/radar/thunderPotential.ts';

const { checks, passed, failed } = verifyThunderPotential();
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail != null ? `  (${c.detail})` : ''}`);
}
console.log(`\n${failed === 0 ? `ALLE ${passed} CHECKS PASS` : `${failed} von ${checks.length} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failed === 0 ? 0 : 1);
