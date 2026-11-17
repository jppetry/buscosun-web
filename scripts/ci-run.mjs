#!/usr/bin/env node
/**
 * ci-run.mjs — runs one npm script for the ci gate and, when it fails, names the failing checks as GitHub annotations.
 *
 * Why: the gate used to stop at its first red step, and what exactly failed stood only in the job log. A verifier that
 * went red therefore hid every verifier behind it (the gate was red from 2026-10-02 to 2026-11-17 while eleven verifiers
 * drifted unseen). `ci.yml` now runs every step even after a red one, and this wrapper puts the failing lines where the
 * run summary and the public checks API show them.
 *
 *   node scripts/ci-run.mjs verify:pv-cube
 *
 * The script's output passes through unchanged; the exit code is the script's own.
 */
import { spawn } from 'node:child_process';

const script = process.argv[2];
if (!script) { console.error('usage: node scripts/ci-run.mjs <npm script>'); process.exit(2); }

/** Lines that name a failed check or a crash, in the forms the verifiers print. */
const FAIL_LINE = /^\s*(FAIL\b|✗|✘)|^\s*\w*Error: |ENOENT|ERR_MODULE_NOT_FOUND/;
const MAX_LINES = 10, MAX_CHARS = 400;

const child = spawn('npm', ['run', '--silent', script], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
let text = '';
for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  stream.on('data', (d) => { text += d; out.write(d); });
}
child.on('error', (e) => { console.error(e); process.exit(1); });
child.on('close', (code) => {
  if (code !== 0) {
    const lines = text.split(/\r?\n/).filter((l) => FAIL_LINE.test(l));
    const shown = lines.length ? lines.slice(0, MAX_LINES) : text.split(/\r?\n/).filter((l) => l.trim()).slice(-3);
    // GitHub workflow command: one annotation per line (newlines and `%` must be escaped).
    const esc = (s) => s.trim().slice(0, MAX_CHARS).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    if (!shown.length) console.log(`::error title=${script}::beendet mit Exit ${code} ohne Ausgabe`);
    for (const l of shown) console.log(`::error title=${script}::${esc(l)}`);
    if (lines.length > MAX_LINES) console.log(`::error title=${script}::… und ${lines.length - MAX_LINES} weitere rote Zeilen`);
  }
  process.exit(code ?? 1);
});
