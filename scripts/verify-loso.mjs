/**
 * Phase 2 acceptance instrument: leave-one-station-out scoring (eqs 16/17) of
 * IDW-vs-OI (and the native ICON-D2 + background baselines) on a recorded
 * fixture, replayed OFFLINE.
 *
 *   node --experimental-strip-types scripts/verify-loso.mjs [fixtures/session-XXXX.json]
 *
 * With no argument it runs the deterministic SYNTHETIC fixture (proves the whole
 * pipeline with no live-API dependence — the Phase 2 gate) and asserts the
 * harness discriminates (OI must beat IDW / ICON-D2 / background on the
 * anomaly-bearing synthetic t2m field, and must not drift from all sources).
 * With a captured fixture it prints the same tables for the real session.
 */
import { readFileSync } from 'node:fs';
import { generateSyntheticFixture } from '../src/fusion/fixture.ts';
import { runLoso, spreadSkill } from '../src/fusion/loso.ts';
import { crpsGaussian } from '../src/fusion/crps.ts';

// ── CRPS(17) self-check: σ→0 reduces to MAE; N(0,1) at y=0 is 2φ(0)−1/√π ──────
const c1 = crpsGaussian(0, 0, 2);                 // = |2−0| = 2
const c2 = crpsGaussian(0, 1, 0);                 // = 2·0.39894 − 0.56419 = 0.23369
const crpsOk = Math.abs(c1 - 2) < 1e-9 && Math.abs(c2 - 0.233691) < 1e-4;
console.log(`CRPS(17) self-check: MAE-limit=${c1.toFixed(4)} N(0,1)@0=${c2.toFixed(5)}  ${crpsOk ? '✓' : '✗ FAIL'}`);

const path = process.argv[2];
const fixture = path
  ? JSON.parse(readFileSync(path, 'utf8'))
  : generateSyntheticFixture();
console.log(`\nfixture: ${path ?? 'SYNTHETIC (seed 42)'}  —  ${fixture.stations.length} stations, ${fixture.background.length} bg samples, ${fixture.icond2.length} ICON-D2 samples\n`);

const res = runLoso(fixture);

const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 3) => (x == null || x !== x) ? '—' : x.toFixed(d);

// ── Scores (terrain = all) ──────────────────────────────────────────────────
console.log('LOSO scores (terrain=all):');
console.log(`  ${pad('variable', 10)} ${pad('predictor', 12)} ${pad('n', 5)} ${pad('MAE', 9)} ${pad('CRPS', 9)}`);
console.log(`  ${'-'.repeat(10)} ${'-'.repeat(12)} ${'-'.repeat(5)} ${'-'.repeat(9)} ${'-'.repeat(9)}`);
for (const s of res.scores.filter((s) => s.terrain === 'all')) {
  console.log(`  ${pad(s.variable, 10)} ${pad(s.predictor, 12)} ${pad(s.n, 5)} ${pad(num(s.mae), 9)} ${pad(num(s.crps), 9)}`);
}

// ── OI vs baselines, with block-bootstrap 95% CI on the MAE gain ────────────
console.log('\nOI vs baseline — MAE gain (baseline−OI), 95% block-bootstrap CI:');
console.log(`  ${pad('variable', 10)} ${pad('terrain', 8)} ${pad('baseline', 12)} ${pad('gain', 9)} ${pad('95% CI', 20)} sig`);
console.log(`  ${'-'.repeat(10)} ${'-'.repeat(8)} ${'-'.repeat(12)} ${'-'.repeat(9)} ${'-'.repeat(20)} ---`);
for (const c of res.comparisons.filter((c) => c.terrain === 'all' || c.terrain === 'alpine')) {
  const ci = `[${num(c.ciLow)}, ${num(c.ciHigh)}]`;
  console.log(`  ${pad(c.variable, 10)} ${pad(c.terrain, 8)} ${pad(c.baseline, 12)} ${pad(num(c.gain), 9)} ${pad(ci, 20)} ${c.significant ? '✓' : ' '}`);
}

// ── Cross-source consistency ────────────────────────────────────────────────
console.log('\nCross-source deviation (OI − raw source, t2m):');
for (const cs of res.crossSource) {
  console.log(`  ${pad(cs.source, 12)} meanDev=${pad(num(cs.meanDev) + ' K', 10)} (n=${cs.n})`);
}
console.log(`  drift flags (OI same-sign >3 K from ALL sources): ${res.driftFlags}`);

// ── Phase 5: spread–skill + calibration of the OI σ (eq. 15) ─────────────────
const ss = spreadSkill(fixture, 't2m');
console.log('\nUncertainty σ (eq. 15) — spread–skill + calibration (t2m):');
console.log(`  corr(σ, |error|) = ${num(ss.corr)}  (must be > 0)`);
console.log(`  coverage@1σ = ${num(ss.coverage68)} (target ≈ 0.683)   fitted inflation = ${num(ss.inflation)}`);
console.log(`  rank hist (10 bins, flat≈calibrated): [${ss.rankHist.join(', ')}]  n=${ss.n}`);

// ── Gate ────────────────────────────────────────────────────────────────────
let ok = crpsOk && ss.corr > 0;   // Phase 5 gate: spread–skill positive
if (!path) {
  // Synthetic sanity: OI must beat every baseline on t2m (all) and not drift.
  const mae = (pred) => res.scores.find((s) => s.terrain === 'all' && s.variable === 't2m' && s.predictor === pred)?.mae ?? Infinity;
  const oi = mae('oi'), idw = mae('idw'), icon = mae('icond2'), bg = mae('background');
  const beats = oi < idw && oi < icon && oi < bg;
  const noDrift = res.driftFlags === 0;
  console.log(`\nsynthetic gate: OI(${oi.toFixed(3)}) < IDW(${idw.toFixed(3)}) < ICON-D2(${icon.toFixed(3)}) & bg(${bg.toFixed(3)}) → ${beats ? '✓' : '✗'}; no-drift → ${noDrift ? '✓' : '✗'}; spread-skill(${ss.corr.toFixed(3)})>0 → ${ss.corr > 0 ? '✓' : '✗'}`);
  ok = ok && beats && noDrift;
} else {
  console.log('\n(real fixture — tables printed; no synthetic sanity assertion applied)');
}
console.log(ok ? '\nPASS\n' : '\nFAIL\n');
process.exit(ok ? 0 : 1);
