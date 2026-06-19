/* Headless-Verify-Entry für die ML-Kernmodule.
 *   npx esbuild src/ml/_verify.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env.DEV=false --outfile=src/ml/_verify.mjs && node src/ml/_verify.mjs
 */
import { verifyIsotonic } from './isotonic';
import { verifyMetrics } from './metrics';
import { verifyClimatology } from './climatology';
import { verifyMosModel } from './mosModel';
import { verifySnowModel } from './snowModel';
import { verifyAnalogEnsemble } from './analogEnsemble';
import { verifyConvNet } from './convNet';
import { verifyRadarNowcastNet } from './radarNowcastNet';
import { verifyConfidenceField } from './confidenceField';
import { verifyClimaField } from './climaField';
import { verifySnowLine } from '../scalar/snowLine';
import { verifyOpticalFlow } from './opticalFlowNowcast';
import { verifyFlowEnsemble, verifyEnsembleCalibration } from './flowEnsemble';
import { verifyRadarHindcast } from './radarHindcast';

const suites: Array<[string, () => { checks: Array<{ name: string; ok: boolean; detail?: string }>; passed: number; failed: number }]> = [
  ['isotonic', verifyIsotonic],
  ['metrics', verifyMetrics],
  ['climatology', verifyClimatology],
  ['mosModel', verifyMosModel],
  ['snowModel', verifySnowModel],
  ['analogEnsemble', verifyAnalogEnsemble],
  ['convNet', verifyConvNet],
  ['radarNowcastNet', verifyRadarNowcastNet],
  ['confidenceField', verifyConfidenceField],
  ['climaField', verifyClimaField],
  ['snowLine', verifySnowLine],
  ['opticalFlow', verifyOpticalFlow],
  ['flowEnsemble', verifyFlowEnsemble],
  ['ensembleCalibration', verifyEnsembleCalibration],
  ['radarHindcast', verifyRadarHindcast],
];

let tp = 0, tf = 0;
for (const [name, fn] of suites) {
  const r = fn();
  tp += r.passed; tf += r.failed;
  console.log(`\n=== ${name}: ${r.passed}/${r.passed + r.failed} ===`);
  for (const c of r.checks) if (!c.ok) console.log(`  ✗ ${c.name}${c.detail ? ` [${c.detail}]` : ''}`);
}
console.log(`\nTOTAL: ${tp} passed, ${tf} failed`);
if (tf > 0) (globalThis as { process?: { exit: (n: number) => void } }).process?.exit(1);
