/**
 * Phase 1 gate (i)/(ii) runner for the local-OI core.
 *
 *   node --experimental-strip-types scripts/verify-oi.mjs
 *
 * Imports the TS verification module directly (no copy) — what is green here is
 * exactly the code the fusionV2 temperature path runs in the browser. Exits
 * non-zero on any failed check, so it can gate CI / the build the same way
 * `qa:layers` does. Matches the `scripts/verify-aec.mjs` precedent (Decision B:
 * no Vitest — Node `--experimental-strip-types` harness).
 */
import { verifyOi } from '../src/fusion/oi.verify.ts';

const { checks, passed, failed } = verifyOi();

const pad = (s, n) => String(s).padEnd(n);
console.log('\nLocal-OI verification (eqs 3 / 7 / 8, SOAR B):\n');
console.log(`  ${pad('check', 44)} ${pad('expected', 16)} ${pad('got', 12)} ok`);
console.log(`  ${'-'.repeat(44)} ${'-'.repeat(16)} ${'-'.repeat(12)} --`);
for (const c of checks) {
  console.log(`  ${pad(c.name, 44)} ${pad(c.expected, 16)} ${pad(c.got, 12)} ${c.ok ? '✓' : '✗ FAIL'}`);
}
console.log(`\n  ${passed}/${checks.length} passed, ${failed} failed\n`);

process.exit(failed === 0 ? 0 : 1);
