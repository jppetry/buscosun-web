/**
 * Phase 3 gate: does the fitted minimum-variance background (eq. 2) score ≤ the
 * heuristic (equal-weight) background under LOSO, on every variable? Runs on the
 * real archive.
 *
 *   node --experimental-strip-types scripts/phase3-gate.mjs [fixtures/]
 *
 * The gate is judged per variable (Decision A: per-variable outcomes are OK).
 * A single analysis capture only carries τ=0 truth and effN≈1 per station, so
 * the full "h=0..6, fitted ≤ heuristic on every variable" gate is STOPPED with
 * diagnosis "archive too short" until the archive matures (constraint C2 — never
 * re-tune to force a pass). This script prints the τ=0 picture and the STOP.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { trainBackground } from '../src/fusion/background.ts';
import { idwAtPoint } from '../src/fusion/predictors.ts';
import { crpsGaussian } from '../src/fusion/crps.ts';

const dir = process.argv[2] ?? 'fixtures';
const files = readdirSync(dir).filter((f) => /^session-[^.]+\.json$/.test(f));
if (!files.length) { console.error(`no session-*.json in ${dir}`); process.exit(2); }
const fixtures = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((fx) => Array.isArray(fx.stations) && Array.isArray(fx.background));

const times = fixtures.map((f) => f.meta.validTime).sort();
const art = trainBackground(fixtures, { window: { from: times[0], to: times[times.length - 1], sessions: fixtures.length } });
const models = art.models;
const M = models.length;
const equal = new Array(M).fill(1 / M);
const VARS = ['t2m', 'windSpeed', 'precip', 'cloud'];

const weightedBg = (bySrc, weights, x, y, elev, v) => {
  let wsum = 0, vsum = 0;
  for (let m = 0; m < models.length; m++) {
    const est = idwAtPoint(bySrc[models[m]] ?? [], x, y, elev, v);
    if (est === est) { wsum += weights[m]; vsum += weights[m] * est; }
  }
  return wsum > 0 ? vsum / wsum : NaN;
};

const lcg = (s) => () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
const rnd = lcg(11);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

console.log(`\nPhase 3 gate — fitted min-var vs heuristic (equal) background, LOSO τ=0`);
console.log(`  archive: ${fixtures.length} session(s), models [${models.join(', ')}]\n`);
console.log(`  ${'variable'.padEnd(10)} ${'fit MAE'.padEnd(9)} ${'heur MAE'.padEnd(9)} ${'gain'.padEnd(9)} ${'95% CI'.padEnd(20)} ok effN`);
console.log(`  ${'-'.repeat(10)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(20)} -- ----`);

let anyEffShort = false;
for (const v of VARS) {
  const wFit = art.perVariable[v].weights['0'];
  const effN = art.perVariable[v].effectiveSampleSize;
  if (effN < 10) anyEffShort = true;
  const dFit = [], dHeur = [];
  for (const fx of fixtures) {
    const bySrc = {};
    for (const m of models) bySrc[m] = fx.background.filter((s) => s.source === m);
    for (const st of fx.stations) {
      const y = st.truth[v];
      if (y == null || y !== y) continue;
      const f = weightedBg(bySrc, wFit, st.x, st.y, st.elev, v);
      const h = weightedBg(bySrc, equal, st.x, st.y, st.elev, v);
      if (f === f) dFit.push(Math.abs(f - y));
      if (h === h) dHeur.push(Math.abs(h - y));
    }
  }
  if (!dFit.length) { console.log(`  ${v.padEnd(10)} (no truth)`); continue; }
  const maeFit = mean(dFit), maeHeur = mean(dHeur);
  // paired bootstrap on gain = heur − fit
  const paired = dFit.map((d, i) => dHeur[i] - d);
  const boot = [];
  for (let b = 0; b < 1000; b++) { let s = 0; for (let i = 0; i < paired.length; i++) s += paired[(rnd() * paired.length) | 0]; boot.push(s / paired.length); }
  boot.sort((a, z) => a - z);
  const lo = boot[25], hi = boot[975];
  const gain = maeHeur - maeFit;
  const ok = maeFit <= maeHeur + 1e-9;     // fitted ≤ heuristic (per-variable gate)
  console.log(`  ${v.padEnd(10)} ${maeFit.toFixed(4).padEnd(9)} ${maeHeur.toFixed(4).padEnd(9)} ${gain.toFixed(4).padEnd(9)} ${`[${lo.toFixed(4)}, ${hi.toFixed(4)}]`.padEnd(20)} ${ok ? '✓' : '✗'} ${effN}`);
}

console.log(`\n  ── GATE VERDICT ──`);
console.log(`  A single analysis capture provides only τ=0 truth (no h=1..6) and effN≈1 per station.`);
console.log(`  The full Phase 3 gate ("fitted ≤ heuristic on every variable at h=0..6") therefore`);
console.log(`  cannot be met on this archive.`);
console.log(`\n  ⛔ STOP — DIAGNOSIS: ARCHIVE TOO SHORT${anyEffShort ? ' (effN < 10)' : ''}.`);
console.log(`     Not a method failure and NOT to be worked around by re-tuning (constraint C2).`);
console.log(`     Refit + re-gate is one command as the archive grows:  node …/phase3-gate.mjs fixtures/\n`);
