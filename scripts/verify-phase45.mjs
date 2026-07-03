/**
 * Phase 4/5 machinery checks: increment persistence (eq 10), wind rescale
 * (eq 14), uncertainty (eq 15).
 *   node --experimental-strip-types scripts/verify-phase45.mjs
 */
import { verifyPhase45 } from '../src/fusion/phase45.verify.ts';

const { checks, passed, failed } = verifyPhase45();
const pad = (s, n) => String(s).padEnd(n);
console.log('\nPhase 4/5 machinery (eqs 10 / 14 / 15) — provisional prior params:\n');
console.log(`  ${pad('check', 40)} ${pad('expected', 12)} ${pad('got', 12)} ok`);
console.log(`  ${'-'.repeat(40)} ${'-'.repeat(12)} ${'-'.repeat(12)} --`);
for (const c of checks) console.log(`  ${pad(c.name, 40)} ${pad(c.expected, 12)} ${pad(c.got, 12)} ${c.ok ? '✓' : '✗ FAIL'}`);
console.log(`\n  ${passed}/${checks.length} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
