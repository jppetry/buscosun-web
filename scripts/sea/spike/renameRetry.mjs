// V-SW-12: rename with retry/backoff for the spike collectors.
//
// On Windows a freshly written target can be locked for a moment (virus scanner, indexer, an editor
// reading index.json), and renameSync then fails with EPERM/EACCES/EBUSY. The collectors wrote their
// index through tmp + rename and lost the index three times on 07.10. This helper retries those
// transient codes with a doubling wait (25, 50, 100 … ms, at most `tries` attempts) and rethrows
// anything else at once.
//
// Self-check: node scripts/sea/spike/renameRetry.mjs --self-check

import { renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Rename `from` → `to`, retrying transient Windows lock errors. Returns the number of attempts used. */
export function renameRetrySync(from, to, { tries = 8, firstMs = 25, rename = renameSync, sleep = sleepSync } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      rename(from, to);
      return attempt;
    } catch (e) {
      if (!TRANSIENT.has(e?.code) || attempt >= tries) throw e;
      sleep(firstMs * 2 ** (attempt - 1));
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--self-check')) {
  const fail = (code, n) => { let left = n; return () => { if (left-- > 0) { const e = new Error(code); e.code = code; throw e; } }; };
  const waits = [];
  const sleep = (ms) => waits.push(ms);
  const checks = [];
  const ok = (name, cond) => { checks.push([name, !!cond]); };
  // R1: three EPERM, then success ⇒ 4 attempts, waits 25/50/100
  ok('R1 EPERM ×3 then ok', renameRetrySync('a', 'b', { rename: fail('EPERM', 3), sleep }) === 4 && waits.join() === '25,50,100');
  // R2: EBUSY/EACCES are transient too
  ok('R2 EBUSY retried', renameRetrySync('a', 'b', { rename: fail('EBUSY', 1), sleep }) === 2);
  ok('R3 EACCES retried', renameRetrySync('a', 'b', { rename: fail('EACCES', 1), sleep }) === 2);
  // R4 negative control: a permanent lock gives up after `tries` and rethrows EPERM
  let thrown = null;
  try { renameRetrySync('a', 'b', { rename: fail('EPERM', 99), sleep, tries: 5 }); } catch (e) { thrown = e.code; }
  ok('R4 gives up after tries (EPERM rethrown)', thrown === 'EPERM');
  // R5 negative control: ENOENT is not transient ⇒ no retry
  waits.length = 0; thrown = null;
  try { renameRetrySync('a', 'b', { rename: fail('ENOENT', 1), sleep }); } catch (e) { thrown = e.code; }
  ok('R5 ENOENT not retried', thrown === 'ENOENT' && waits.length === 0);
  for (const [n, p] of checks) console.log(`${p ? 'ok  ' : 'FAIL'} ${n}`);
  const passed = checks.filter(([, p]) => p).length;
  console.log(`renameRetry self-check ${passed}/${checks.length}`);
  process.exit(passed === checks.length ? 0 : 1);
}
