/**
 * Phase 2 acceptance instrument: leave-one-station-out scoring (eqs 16/17) of
 * IDW-vs-OI (and the native ICON-D2 + background baselines) on a recorded
 * fixture, replayed OFFLINE.
 *
 *   npm run fusion:loso                                  → SYNTHETIC (Phase 2 gate)
 *   npm run fusion:loso -- fixtures/session-XXXX.json     → real session
 *   npm run fusion:loso -- fixtures/session-XXXX.json --strict
 *
 * With no argument it runs the deterministic SYNTHETIC fixture (proves the whole
 * pipeline with no live-API dependence — the Phase 2 gate) and asserts the
 * harness discriminates (OI must beat IDW / ICON-D2 / background on the
 * anomaly-bearing synthetic t2m field, and must not drift from all sources).
 *
 * ── V-29 (2026-08-03): the real-fixture branch now asserts too ───────────────
 * It previously printed "no synthetic sanity assertion applied" and passed on
 * anything: computed confidence intervals, `driftFlags` and `coverage@1σ` fed
 * into no verdict at all. A harness that cannot fail is worse than none.
 *
 * Real fixtures are asserted against the properties that must hold on any real
 * session regardless of how good the day's data is:
 *   · CRPS(17) self-check                      (pure maths, always)
 *   · spread–skill corr(σ,|error|) > 0         (σ must carry information, eq 15)
 *
 * They are NOT asserted on "OI beats every baseline": a single real session can
 * legitimately be a day where the models already agree. Requiring a win per
 * session would invite exactly the re-tuning constraint C2 forbids.
 *
 * `driftFlags` and `coverage@1σ` are REPORTED, not gated — deliberately. Measured
 * across the real archive on 2026-08-03 they are: driftFlags 3…77 of ~320 stations
 * and coverage 0,34…0,54 against a 0,683 target (σ systematically under-dispersed,
 * U-shaped rank histogram). Gating them at 0 / 0,683 would paint every real run
 * red; gating them at the measured range would be fitting the threshold to the
 * data — the exact re-tuning C2 forbids. Their calibration is an open finding
 * (V-128) and their thresholds belong to the cutover spec (V-31).
 *
 * `--strict` adds the synthetic-grade discrimination gate (OI < IDW, ICON-D2 and
 * background on t2m) to a real fixture. Use it to interrogate a specific session,
 * not as a routine gate. The cutover decision lives in `fusion:gate` (V-31).
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

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const path = argv.find((a) => !a.startsWith('--'));
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
const mae = (pred) => res.scores.find((s) => s.terrain === 'all' && s.variable === 't2m' && s.predictor === pred)?.mae ?? Infinity;
const oi = mae('oi'), idw = mae('idw'), icon = mae('icond2'), bg = mae('background');
const beats = oi < idw && oi < icon && oi < bg;
const noDrift = res.driftFlags === 0;
const spreadOk = ss.corr > 0;

const checks = [
  ['CRPS(17) self-check', crpsOk],
  ['spread–skill corr(σ,|error|) > 0', spreadOk, ss.corr.toFixed(3)],
];
// Drift is a hard gate on the synthetic fixture (where it must be 0 by
// construction) but only REPORTED on real data — see the header for why.
if (!path) checks.push(['no drift (OI never >3 K same-sign off ALL sources)', noDrift, `driftFlags=${res.driftFlags}`]);
// Discrimination is asserted on the synthetic fixture always, and on a real one
// only when explicitly demanded (--strict). See the header for why.
if (!path || strict) {
  checks.push([`OI beats IDW/ICON-D2/background on t2m`, beats,
    `OI ${oi.toFixed(3)} vs IDW ${idw.toFixed(3)} / D2 ${icon.toFixed(3)} / bg ${bg.toFixed(3)}`]);
}

console.log(`\n── GATE (${path ? (strict ? 'real fixture, --strict' : 'real fixture') : 'SYNTHETIC — Phase 2 gate'}) ──`);
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
}
if (path) {
  console.log(`  · REPORTED, not gated (uncalibrated — V-128, thresholds belong to V-31):`);
  console.log(`      driftFlags=${res.driftFlags} of ${ss.n} · coverage@1σ=${num(ss.coverage68)} (target ≈ 0.683)`);
  if (!strict) {
    console.log(`  · discrimination (OI beats all baselines) NOT asserted on a single real session —`);
    console.log(`    re-run with --strict to demand it, or use "npm run fusion:gate" for the cutover gate.`);
  }
}

const ok = checks.every(([, pass]) => pass);
console.log(ok ? '\nPASS\n' : '\nFAIL\n');
process.exit(ok ? 0 : 1);
