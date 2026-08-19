/**
 * Kalibrierung „Detektionen/FRE → Fläche" (Phase AF4, Gate GAF4).
 *
 *   npm run fire:calibrate -- --in data/fire/af/pairs-effis-2020-2025.jsonl \
 *                             --in data/fire/af/pairs-effis-2026.jsonl \
 *                             --out public/fire/af/area-estimate-v1.json [--now 2026-08-19T00:00:00Z]
 *
 * Eingang: Trainingsdaten aus `data/` (nicht ausgeliefert). Ausgang: das Modell nach
 * `public/` — das ist die einzige Datei, die der Client lädt.
 *
 * Liest Labelpaare (`FireLabelPair` je Zeile), filtert mit `isEligiblePair`
 * (dieselbe Regel wie im Client), fittet die zwei Modelle aus
 * `src/fire/activity/calibration.ts` (DIESELBE Datei, die der Client zum
 * Schätzen benutzt — Parität per Konstruktion) und schreibt die Modelldatei.
 * Verweigert den Fit unter 25 Paaren. Kein Netz, keine Abhängigkeit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { isEligiblePair, FEATURE_VERSION, INTERVAL_LEVEL, MIN_PAIRS_FOR_FIT } from '../../src/fire/activity/features.ts';
import { fitLogLog, MODEL_VERSION } from '../../src/fire/activity/calibration.ts';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const ins = []; for (let i = 0; i < args.length; i++) if (args[i] === '--in' && args[i + 1]) ins.push(args[++i]);
const out = opt('out', 'public/fire/af/area-estimate-v1.json');
const nowIso = opt('now', null);
const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
if (ins.length === 0) { console.error('Nutzung: --in <pairs.jsonl> [--in …] --out <model.json> [--now ISO]'); process.exit(2); }

const pairs = [];
for (const f of ins) {
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t) continue;
    try { pairs.push(JSON.parse(t)); } catch { console.warn(`übersprungen (kein JSON): ${t.slice(0, 60)}`); }
  }
}
const eligible = pairs.filter((p) => p?.features?.featureVersion === FEATURE_VERSION && isEligiblePair(p));
const sources = new Set(eligible.map((p) => p.target.source));
if (sources.size > 1) { console.error(`Gemischte Labelquellen ${[...sources].join(', ')} — bitte je Quelle ein Modell.`); process.exit(2); }
const labelSource = [...sources][0] ?? 'effis-rda';

const frePairs = eligible.filter((p) => p.features.freMj != null && p.features.freMj > 0).map((p) => ({ x: p.features.freMj, y: p.target.areaNetHa }));
const detPairs = eligible.filter((p) => p.features.nDetections != null && p.features.nDetections > 0).map((p) => ({ x: p.features.nDetections, y: p.target.areaNetHa }));
const fre = fitLogLog(frePairs, INTERVAL_LEVEL, MIN_PAIRS_FOR_FIT);
const det = fitLogLog(detPairs, INTERVAL_LEVEL, MIN_PAIRS_FOR_FIT);
// Trainingsjahre = Brandjahre (asOfMs = Fensterende ≈ Branddatum + 7 d), nicht das EFFIS-LASTUPDATE (Nachprozessierung).
const years = [...new Set(eligible.map((p) => new Date(p.features.asOfMs).getUTCFullYear()))].sort((a, b) => a - b);

const model = {
  modelVersion: MODEL_VERSION,
  featureVersion: FEATURE_VERSION,
  labelSource,
  intervalLevel: INTERVAL_LEVEL,
  trainedAtMs: nowMs,
  years,
  pairsTotal: pairs.length,
  pairsEligible: eligible.length,
  models: { fre, det },
  caveats: [
    'Gilt nur für vom Satelliten detektierte Brände (Stichprobe ist detektionsbedingt: VIIRS sieht bevorzugt große, heiße Feuer) — nie auf die Gesamtheit hochrechnen.',
    labelSource === 'effis-rda'
      ? 'Zielgröße = EFFIS Rapid Damage Assessment (JRC-Kartierung, seit 2020/21 Sentinel-2-gestützt); kein Trennbarkeitsmaß, kein Flächenintervall je Label.'
      : 'Zielgröße = eigene dNBR-Kartierung (BA-Linie) mit Trennbarkeit ≥ 1,5.',
    'Prädiktionsintervall 80 %: 1 von 5 wahren Flächen liegt außerhalb — das ist die erwartete Streuung, kein Fehler.',
    'Keine Vorhersage außerhalb des Prädiktorbereichs des Trainings (keine Extrapolation) — bei quadratischem Glied umso wichtiger.',
    'Grad der Regression datengetrieben gewählt (Leave-one-out): die Gerade unterschätzte große Brände systematisch.',
    'Merkmale gelten innerhalb des FIRMS-Fensters des Trainings (Detektionen bis 7 Tage nach der Kartierung).',
  ],
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(model, null, 2) + '\n');

const fmt = (f) => f ? `n=${f.n} Grad ${f.degree} β=[${f.coeffs.map((c) => c.toFixed(4)).join(', ')}] R²=${f.r2.toFixed(3)} σ=${f.sigma.toFixed(3)} Bereich ${f.xMin}…${f.xMax} LOO-RMSE(ln)=${f.looRmseLn.toFixed(3)} Abdeckung ${(f.looCoverage * 100).toFixed(1)} %` : `kein Modell (< ${MIN_PAIRS_FOR_FIT} Paare)`;
console.log(`Paare gelesen: ${pairs.length}, zulässig: ${eligible.length} (${labelSource}), Jahre ${years.join(', ')}`);
console.log(`M-FRE (ln area ~ ln FRE):          ${fmt(fre)}`);
console.log(`M-DET (ln area ~ ln Detektionen):  ${fmt(det)}`);
console.log(`geschrieben: ${out}`);
if (!fre && !det) { console.error('Kein Modell — zu wenige Paare.'); process.exit(1); }
