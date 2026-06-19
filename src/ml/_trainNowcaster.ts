/* Offline-Training des Radar-Nowcasters (Node, headless) → schreibt die
 * gebündelten Gewichte nach src/ml/nowcasterWeights.json.
 *
 *   npx esbuild src/ml/_trainNowcaster.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env.DEV=false --outfile=src/ml/_train.mjs && node src/ml/_train.mjs
 *
 * EHRLICH: trainiert auf SIMULIERTEN Radar-Sequenzen (Architektur-Beweis).
 * Produktiv = dieselbe Architektur, offline auf dem DWD-RADOLAN-Archiv.
 */
import { writeFileSync } from 'node:fs';
import { trainNowcaster } from './radarNowcastNet';

const t0 = Date.now();
// Bewusst moderat (pure-JS-Training): reicht, um Persistenz klar zu schlagen,
// und läuft headless in ~1 min. Architektur identisch zum Default.
const r = trainNowcaster({ H: 22, W: 22, arch: { K: 3, channels: [10, 10] }, trainSeqs: 180, testSeqs: 50, epochs: 10, lr: 0.008, seed: 2024 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`Training fertig in ${secs}s`);
console.log(`Loss ${r.firstLoss.toFixed(4)} → ${r.lastLoss.toFixed(4)}`);
console.log(`OOS MSE Modell ${r.eval.mseModel.toFixed(4)} vs. Persistenz ${r.eval.msePersist.toFixed(4)} (−${r.eval.improvementPct}%)`);
console.log(`OOS CSI Modell ${r.eval.csiModel.toFixed(3)} vs. Persistenz ${r.eval.csiPersist.toFixed(3)}`);

// Sanity-Gate: ein divergiertes/kollabiertes Modell (CSI 0, MSE explodiert) wird
// NICHT ausgeliefert — lieber gar kein KI-Layer als ein kaputter.
if (!(r.eval.csiModel >= r.eval.csiPersist - 0.02) || r.eval.mseModel > r.eval.msePersist * 1.3) {
  console.error(`ABBRUCH: Modell nicht belastbar (CSI ${r.eval.csiModel.toFixed(3)} vs ${r.eval.csiPersist.toFixed(3)}, MSE ${r.eval.mseModel.toFixed(4)} vs ${r.eval.msePersist.toFixed(4)}). Keine Gewichte geschrieben.`);
  process.exit(1);
}

const out = {
  version: 1,
  arch: r.arch,
  note: 'Trainiert auf physikalisch simulierten Radar-Sequenzen (Architektur-Beweis). Produktiv: gleiche Architektur, offline auf DWD-RADOLAN-Archiv.',
  eval: {
    mseModel: round(r.eval.mseModel, 5), msePersist: round(r.eval.msePersist, 5),
    csiModel: round(r.eval.csiModel, 4), csiPersist: round(r.eval.csiPersist, 4),
    improvementPct: r.eval.improvementPct, nSamples: r.eval.nSamples,
  },
  weights: r.model.flatWeights().map((w) => round(w, 6)),
};
writeFileSync('src/ml/nowcasterWeights.json', JSON.stringify(out));
console.log(`Gewichte geschrieben: ${out.weights.length} Parameter → src/ml/nowcasterWeights.json`);

function round(v: number, d: number): number { const f = Math.pow(10, d); return Math.round(v * f) / f; }
