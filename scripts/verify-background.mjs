/**
 * Phase 3 scaffold gate: closed-form checks for the multi-model background fit
 * (eqs 2 & 4), combineBackground, and the C1 licence-split enforcement.
 *
 *   node --experimental-strip-types scripts/verify-background.mjs
 */
import { verifyBackground } from '../src/fusion/background.verify.ts';

const { checks, passed, failed } = verifyBackground();
const pad = (s, n) => String(s).padEnd(n);
console.log('\nMulti-model background verification (eqs 2 / 4, C1 licence split):\n');
console.log(`  ${pad('check', 46)} ${pad('expected', 16)} ${pad('got', 14)} ok`);
console.log(`  ${'-'.repeat(46)} ${'-'.repeat(16)} ${'-'.repeat(14)} --`);
for (const c of checks) {
  console.log(`  ${pad(c.name, 46)} ${pad(c.expected, 16)} ${pad(c.got, 14)} ${c.ok ? '✓' : '✗ FAIL'}`);
}
console.log(`\n  ${passed}/${checks.length} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
