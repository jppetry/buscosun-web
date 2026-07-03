/**
 * Accumulate Desroziers innovation statistics (eq. 9) from a fixture and write
 * the artifact JSON. Phase 3 promotes this to `public/params/oi-v1.json`.
 *
 *   node --experimental-strip-types scripts/desroziers.mjs [fixtures/session-XXXX.json] [out.json]
 *
 * With no fixture arg it runs the synthetic fixture and writes
 * `fixtures/desroziers-synthetic.json`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { generateSyntheticFixture } from '../src/fusion/fixture.ts';
import { accumulateDesroziers } from '../src/fusion/desroziers.ts';

const inPath = process.argv[2];
const fixture = inPath ? JSON.parse(readFileSync(inPath, 'utf8')) : generateSyntheticFixture();
// Output name must NOT match session-*.json (else the archive loader ingests it).
const out = process.argv[3] ?? (inPath
  ? join(dirname(inPath), 'desroziers-' + basename(inPath).replace(/^session-/, ''))
  : 'fixtures/desroziers-synthetic.json');

const art = accumulateDesroziers(fixture);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(art, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nDesroziers (eq. 9) — ${inPath ?? 'SYNTHETIC'} → ${out}\n`);
console.log(`  ${pad('variable', 10)} ${pad('σ_b', 9)} ${pad('network', 9)} ${pad('σ_o', 9)} ${pad('r=σ_o²/σ_b²', 12)} n`);
console.log(`  ${'-'.repeat(10)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(12)} ---`);
for (const [v, st] of Object.entries(art.perVariable)) {
  for (const [net, ns] of Object.entries(st.perNetwork)) {
    console.log(`  ${pad(v, 10)} ${pad(st.sigmaB.toFixed(3), 9)} ${pad(net, 9)} ${pad(ns.sigmaO.toFixed(3), 9)} ${pad(ns.r.toFixed(4), 12)} ${ns.n}`);
  }
}
console.log('');
