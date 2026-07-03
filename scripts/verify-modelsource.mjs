/**
 * Gate für den Fusion⇄Native-Modellquellen-Resolver (Fusion→2D-Layer-Integration).
 *
 *   node --experimental-strip-types scripts/verify-modelsource.mjs
 *
 * Importiert das TS-Modul direkt (kein Copy) — was hier grün ist, ist exakt der
 * Resolver/Reducer, den MapView im Browser fährt. Deckt u. a. Deliverable-Test
 * (c) „nativer Pfad festgenagelt" und (e) „Per-Layer schlägt Global" sowie die
 * invertierte Punkt-Domäne (eingefrorener Default 'fusion'). Exit != 0 bei jedem
 * Fehlschlag → CI-/Build-gatebar wie `qa:layers`. Precedent: verify-oi.mjs
 * (Decision B: kein Vitest — Node `--experimental-strip-types`-Harness).
 */
import { verifyModelSource } from '../src/fusion/modelSource.ts';

const { checks, passed, failed } = verifyModelSource();

console.log('\nModellquellen-Resolver (Fusion⇄Native, global + Per-Layer + Punkt-Domäne):\n');
for (const c of checks) console.log(`  ${c.startsWith('PASS') ? '✓' : '✗'} ${c}`);
console.log(`\n  ${passed}/${checks.length} passed, ${failed} failed\n`);

process.exit(failed === 0 ? 0 : 1);
