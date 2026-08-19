/**
 * Phase 3 gate: does the fitted minimum-variance background (eq. 2) score ≤ the
 * heuristic (equal-weight) background on every gate-able variable? Runs on the
 * real archive and RETURNS A VERDICT — see exit codes below.
 *
 *   npm run fusion:gate              → fixtures/
 *   npm run fusion:gate -- <dir>     → other archive
 *   npm run fusion:gate -- --insample  additionally print the in-sample table
 *
 * ── Exit codes (V-29, 2026-08-03) ────────────────────────────────────────────
 *   0  PASS      archive mature AND every gate-able variable passes
 *   1  FAIL      archive mature, but ≥ 1 gate-able variable is not ≤ heuristic
 *   2  CANNOT    archive objectively too short — no judgement possible
 *
 * Before V-29 this script aggregated nothing, printed a hard-coded "⛔ STOP —
 * ARCHIVE TOO SHORT" verdict regardless of the data, and always exited 0. It
 * could therefore neither pass nor fail. Three things changed:
 *
 *  (1) The verdict is computed. Per-variable `ok` flags are aggregated; the
 *      maturity criteria are evaluated programmatically with the same rule as
 *      `archive-status.mjs:62` (min effN ≥ 10 over truth-carrying variables AND
 *      ≥ 2 diurnal regimes) instead of being asserted in prose.
 *
 *  (2) Scoring is OUT-OF-SAMPLE. The old script trained on all fixtures and
 *      scored the same stations of the same fixtures — in-sample, while the
 *      header claimed "LOSO". It now runs station-blocked K-fold cross-
 *      validation: a station's score always comes from weights fitted WITHOUT
 *      that station. In-sample flatters the fitted weights, so a gate built on
 *      it can go green on a method that loses out of sample (masterplan R2).
 *
 *  (3) Variables with no station truth are excluded from the verdict and named.
 *      `cloud` has no observational truth at all (BrightSky current carries no
 *      cloud cover, `archive-status.mjs:54-58`) — it can never be gated by this
 *      instrument, and the old code let its effN=0 trigger a global "effN < 10"
 *      message while every other variable sat at effN=304 (D-04).
 *
 * The pass criterion here is the one Phase 3 documented — fitted ≤ heuristic per
 * variable. The full cutover policy (which metric, which threshold, which sample
 * size, drift/coverage gates) is V-31 and deliberately NOT invented here. This
 * script judges; it does not decide the cutover.
 *
 * Constraint C2 stays binding: a red gate is never to be worked around by
 * re-tuning. It is a finding.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { trainBackground } from '../src/fusion/background.ts';
import { idwAtPoint } from '../src/fusion/predictors.ts';

const argv = process.argv.slice(2);
const showInSample = argv.includes('--insample');
const dir = argv.find((a) => !a.startsWith('--')) ?? 'fixtures';

const EXIT_PASS = 0, EXIT_FAIL = 1, EXIT_CANNOT = 2;
const VARS = ['t2m', 'windSpeed', 'precip', 'cloud'];
const FOLDS = 5;
const MIN_EFF_N = 10;      // == archive-status.mjs:62
const MIN_REGIMES = 2;     // == archive-status.mjs:62

const files = readdirSync(dir).filter((f) => /^session-[^.]+\.json$/.test(f));
if (!files.length) { console.error(`no session-*.json in ${dir}`); process.exit(EXIT_CANNOT); }
const fixtures = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((fx) => Array.isArray(fx.stations) && Array.isArray(fx.background));
if (!fixtures.length) { console.error(`no valid session fixtures in ${dir}`); process.exit(EXIT_CANNOT); }

const times = fixtures.map((f) => f.meta.validTime).sort();
const window = { from: times[0], to: times[times.length - 1], sessions: fixtures.length };

// ── Archive maturity, same rule as archive-status.mjs (no prose, no guessing) ──
const bucket = (h) => (h >= 21 || h < 5) ? 'night' : h < 10 ? 'morning' : h < 15 ? 'midday' : 'afternoon';
const regimes = new Set(fixtures.map((f) => bucket(new Date(f.meta.validTime).getUTCHours()))).size;

const effN = {};
for (const v of VARS) {
  const perStation = new Map();
  for (const fx of fixtures) for (const s of fx.stations) {
    if (s.truth?.[v] != null && s.truth[v] === s.truth[v]) perStation.set(s.id, (perStation.get(s.id) ?? 0) + 1);
  }
  const counts = [...perStation.values()].sort((a, b) => a - b);
  effN[v] = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
}
const gateable = VARS.filter((v) => effN[v] > 0);   // has station truth at all
const noTruth = VARS.filter((v) => effN[v] === 0);  // structurally not gate-able
const minEff = gateable.length ? Math.min(...gateable.map((v) => effN[v])) : 0;
const mature = gateable.length > 0 && minEff >= MIN_EFF_N && regimes >= MIN_REGIMES;

// ── Station-blocked folds: a station is scored only by weights fitted without it ──
const allStationIds = [...new Set(fixtures.flatMap((fx) => fx.stations.map((s) => s.id)))].sort();
const foldOf = new Map(allStationIds.map((id, i) => [id, i % FOLDS]));   // deterministic, no RNG

const weightedBg = (bySrc, models, weights, x, y, elev, v) => {
  let wsum = 0, vsum = 0;
  for (let m = 0; m < models.length; m++) {
    const est = idwAtPoint(bySrc[models[m]] ?? [], x, y, elev, v);
    if (est === est) { wsum += weights[m]; vsum += weights[m] * est; }
  }
  return wsum > 0 ? vsum / wsum : NaN;
};

/** Absolute-error pairs (fitted, heuristic) per variable, scored out-of-sample. */
function scoreCrossValidated() {
  const dFit = Object.fromEntries(VARS.map((v) => [v, []]));
  const dHeur = Object.fromEntries(VARS.map((v) => [v, []]));
  for (let fold = 0; fold < FOLDS; fold++) {
    // Train WITHOUT the held-out stations; background samples stay untouched
    // (they are model fields, not observations — only truth must be held out).
    const trainFx = fixtures.map((fx) => ({ ...fx, stations: fx.stations.filter((s) => foldOf.get(s.id) !== fold) }));
    if (!trainFx.some((fx) => fx.stations.length)) continue;
    const art = trainBackground(trainFx, { window });
    const models = art.models;
    const equal = new Array(models.length).fill(1 / models.length);
    for (const fx of fixtures) {
      const bySrc = {};
      for (const m of models) bySrc[m] = fx.background.filter((s) => s.source === m);
      for (const st of fx.stations) {
        if (foldOf.get(st.id) !== fold) continue;      // score held-out stations only
        for (const v of VARS) {
          const y = st.truth?.[v];
          if (y == null || y !== y) continue;
          const f = weightedBg(bySrc, models, art.perVariable[v].weights['0'], st.x, st.y, st.elev, v);
          const h = weightedBg(bySrc, models, equal, st.x, st.y, st.elev, v);
          if (f === f && h === h) { dFit[v].push(Math.abs(f - y)); dHeur[v].push(Math.abs(h - y)); }
        }
      }
    }
  }
  return { dFit, dHeur };
}

/** In-sample reference (what the pre-V-29 script reported) — diagnostic only. */
function scoreInSample() {
  const art = trainBackground(fixtures, { window });
  const models = art.models;
  const equal = new Array(models.length).fill(1 / models.length);
  const dFit = Object.fromEntries(VARS.map((v) => [v, []]));
  const dHeur = Object.fromEntries(VARS.map((v) => [v, []]));
  for (const fx of fixtures) {
    const bySrc = {};
    for (const m of models) bySrc[m] = fx.background.filter((s) => s.source === m);
    for (const st of fx.stations) {
      for (const v of VARS) {
        const y = st.truth?.[v];
        if (y == null || y !== y) continue;
        const f = weightedBg(bySrc, models, art.perVariable[v].weights['0'], st.x, st.y, st.elev, v);
        const h = weightedBg(bySrc, models, equal, st.x, st.y, st.elev, v);
        if (f === f && h === h) { dFit[v].push(Math.abs(f - y)); dHeur[v].push(Math.abs(h - y)); }
      }
    }
  }
  return { dFit, dHeur, models: art.models };
}

const lcg = (s) => () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/** Paired bootstrap CI on gain = heuristic − fitted (deterministic seed). */
function gainCI(dFit, dHeur) {
  const rnd = lcg(11);
  const paired = dFit.map((d, i) => dHeur[i] - d);
  const boot = [];
  for (let b = 0; b < 1000; b++) {
    let s = 0;
    for (let i = 0; i < paired.length; i++) s += paired[(rnd() * paired.length) | 0];
    boot.push(s / paired.length);
  }
  boot.sort((a, z) => a - z);
  return { lo: boot[25], hi: boot[975] };
}

const pad = (s, n) => String(s).padEnd(n);
const printTable = (title, dFit, dHeur) => {
  console.log(`\n  ${title}`);
  console.log(`  ${pad('variable', 10)} ${pad('fit MAE', 9)} ${pad('heur MAE', 9)} ${pad('gain', 9)} ${pad('95% CI', 22)} ${pad('n', 7)} ok`);
  console.log(`  ${'-'.repeat(10)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(22)} ${'-'.repeat(7)} --`);
  const rows = {};
  for (const v of VARS) {
    if (!dFit[v].length) { console.log(`  ${pad(v, 10)} (no station truth — not gate-able)`); rows[v] = null; continue; }
    const maeFit = mean(dFit[v]), maeHeur = mean(dHeur[v]);
    const { lo, hi } = gainCI(dFit[v], dHeur[v]);
    const ok = maeFit <= maeHeur + 1e-9;
    rows[v] = { maeFit, maeHeur, gain: maeHeur - maeFit, lo, hi, n: dFit[v].length, ok };
    console.log(
      `  ${pad(v, 10)} ${pad(maeFit.toFixed(4), 9)} ${pad(maeHeur.toFixed(4), 9)} ` +
      `${pad((maeHeur - maeFit).toFixed(4), 9)} ${pad(`[${lo.toFixed(4)}, ${hi.toFixed(4)}]`, 22)} ` +
      `${pad(dFit[v].length, 7)} ${ok ? '✓' : '✗'}`
    );
  }
  return rows;
};

console.log(`\nPhase 3 gate — fitted min-var vs heuristic (equal-weight) background`);
console.log(`  archive: ${fixtures.length} session(s) in ${dir}/  ·  ${window.from} … ${window.to}`);
console.log(`  maturity: min effN ${minEff} (need ≥ ${MIN_EFF_N})  ·  diurnal regimes ${regimes} (need ≥ ${MIN_REGIMES})  ⇒ ${mature ? 'MATURE' : 'TOO SHORT'}`);
if (noTruth.length) console.log(`  not gate-able (no station truth, excluded from the verdict): ${noTruth.join(', ')}`);

if (!mature) {
  console.log(`\n  ── GATE VERDICT ──`);
  console.log(`  ⛔ CANNOT JUDGE — archive objectively too short.`);
  const need = [];
  if (minEff < MIN_EFF_N) need.push(`effN ≥ ${MIN_EFF_N} (have ${minEff})`);
  if (regimes < MIN_REGIMES) need.push(`≥ ${MIN_REGIMES} diurnal regimes (have ${regimes})`);
  console.log(`     need: ${need.join('; ')}`);
  console.log(`     This is NOT a method failure and NOT to be worked around by re-tuning (C2).\n`);
  process.exit(EXIT_CANNOT);
}

if (showInSample) {
  const ins = scoreInSample();
  printTable('IN-SAMPLE (diagnostic only — trained and scored on the same stations):', ins.dFit, ins.dHeur);
}

const cv = scoreCrossValidated();
const rows = printTable(`OUT-OF-SAMPLE — station-blocked ${FOLDS}-fold CV (this is what the gate judges):`, cv.dFit, cv.dHeur);

const judged = gateable.filter((v) => rows[v]);
const failed = judged.filter((v) => !rows[v].ok);

console.log(`\n  ── GATE VERDICT ──`);
console.log(`  criterion: fitted MAE ≤ heuristic MAE, out-of-sample, per variable (Phase 3).`);
console.log(`  judged: ${judged.join(', ') || '(none)'}${noTruth.length ? `   ·   excluded: ${noTruth.join(', ')}` : ''}`);
if (!judged.length) {
  console.log(`\n  ⛔ CANNOT JUDGE — no variable carries station truth.\n`);
  process.exit(EXIT_CANNOT);
}
if (failed.length) {
  console.log(`\n  ✗ FAIL — ${failed.length} of ${judged.length} variable(s) not ≤ heuristic: ${failed.join(', ')}`);
  for (const v of failed) {
    const r = rows[v];
    const sig = r.hi < 0 ? 'significantly worse' : 'worse, but CI includes 0';
    console.log(`     ${pad(v, 10)} fit ${r.maeFit.toFixed(4)} > heur ${r.maeHeur.toFixed(4)}  (${sig})`);
  }
  console.log(`\n     C2: this is a finding, NOT a reason to re-tune until it passes.`);
  console.log(`     Threshold/cutover policy per variable is V-31 — this gate only judges the`);
  console.log(`     documented Phase 3 criterion.\n`);
  process.exit(EXIT_FAIL);
}
console.log(`\n  ✓ PASS — all ${judged.length} gate-able variable(s) ≤ heuristic out-of-sample.`);
console.log(`     Cutover remains Jan's decision per variable (D-11/D-13); flags stay off.\n`);
process.exit(EXIT_PASS);
