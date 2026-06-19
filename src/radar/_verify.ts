/* Headless-Verify-Entry für die puren Radar-Logikmodule.
 * Bundeln & ausführen:
 *   npx esbuild src/radar/_verify.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env.DEV=false --outfile=src/radar/_verify.mjs && node src/radar/_verify.mjs
 */
import { verifyRadarModel } from './radarModel';
import { verifyCellTracking } from './cellTracking';
import { verifyAccumulation } from './accumulation';
import { verifyCoverage } from './coverageMask';
import { verifyRadarFrames } from './radarFrames';
import { verifyRadarState } from './radarState';

const suites: Array<[string, () => { checks: Array<{ name: string; ok: boolean; detail?: string }>; passed: number; failed: number }]> = [
  ['radarModel', verifyRadarModel],
  ['cellTracking', verifyCellTracking],
  ['accumulation', verifyAccumulation],
  ['coverage', verifyCoverage],
  ['radarFrames', verifyRadarFrames],
  ['radarState', verifyRadarState],
];

let totalPass = 0, totalFail = 0;
for (const [name, fn] of suites) {
  const r = fn();
  totalPass += r.passed; totalFail += r.failed;
  console.log(`\n=== ${name}: ${r.passed}/${r.passed + r.failed} ===`);
  for (const c of r.checks) {
    if (!c.ok) console.log(`  ✗ ${c.name}${c.detail ? ` [${c.detail}]` : ''}`);
  }
}
console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed`);
if (totalFail > 0) (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1);
