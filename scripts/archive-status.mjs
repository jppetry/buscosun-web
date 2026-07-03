/**
 * Archive readiness report — is fixtures/ mature enough to refit + wire live?
 *
 *   node --experimental-strip-types scripts/archive-status.mjs [fixtures/]
 *
 * Reports session count, validTime span, diurnal-regime coverage (a proxy for
 * radiation-night / mixed / afternoon-convective sampling — true frontal/GWL
 * regime tagging needs external classification we don't ingest), effective
 * sample size per variable, and a readiness verdict. "Refit is one command":
 *   node …/train-background.mjs fixtures/ && node …/phase3-gate.mjs fixtures/
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'fixtures';
const files = readdirSync(dir).filter((f) => /^session-[^.]+\.json$/.test(f));
const fixtures = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((fx) => Array.isArray(fx.stations));

if (!fixtures.length) { console.log(`\nno session-*.json in ${dir} — capture first (npm run capture).\n`); process.exit(0); }

const times = fixtures.map((f) => new Date(f.meta.validTime)).sort((a, b) => a - b);
const spanH = (times[times.length - 1] - times[0]) / 3.6e6;

// Diurnal buckets by UTC hour (DACH local ≈ UTC+1/2): night 21–04, morning 05–09,
// midday 10–14, afternoon 15–20 — a coarse regime proxy.
const bucket = (h) => (h >= 21 || h < 5) ? 'night' : h < 10 ? 'morning' : h < 15 ? 'midday' : 'afternoon';
const diurnal = {};
for (const t of times) { const b = bucket(t.getUTCHours()); diurnal[b] = (diurnal[b] ?? 0) + 1; }

// Effective sample size per variable = median #sessions a station is observed with
// a finite truth (same station recurs across sessions → grows with the archive).
const VARS = ['t2m', 'windSpeed', 'precip', 'cloud'];
const effN = {};
for (const v of VARS) {
  const perStation = new Map();
  for (const fx of fixtures) for (const s of fx.stations) {
    if (s.truth?.[v] != null && s.truth[v] === s.truth[v]) perStation.set(s.id, (perStation.get(s.id) ?? 0) + 1);
  }
  const counts = [...perStation.values()].sort((a, b) => a - b);
  effN[v] = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nArchive status — ${dir}\n`);
console.log(`  sessions:       ${fixtures.length}`);
console.log(`  validTime span: ${times[0].toISOString()} … ${times[times.length - 1].toISOString()}  (${spanH.toFixed(1)} h)`);
console.log(`  diurnal cover:  ${Object.entries(diurnal).map(([k, n]) => `${k}=${n}`).join('  ')}`);
console.log(`\n  ${pad('variable', 10)} effN (median sessions/station)`);
for (const v of VARS) console.log(`  ${pad(v, 10)} ${effN[v]}`);

// Readiness heuristic: fit is prior-dominated below effN≈10; wiring wants both a
// mature per-station sample AND ≥2 diurnal regimes (so weights aren't one-regime).
// Variables with NO station-truth source (cloud — BrightSky current carries no
// cloud) are model-only and excluded from the readiness metric (they can never
// gain obs effN); noted separately.
const truthVars = VARS.filter((v) => effN[v] > 0);
const noTruth = VARS.filter((v) => effN[v] === 0);
const minEff = truthVars.length ? Math.min(...truthVars.map((v) => effN[v])) : 0;
const regimes = Object.keys(diurnal).length;
if (noTruth.length) console.log(`\n  (no station truth — model-only, excluded from readiness: ${noTruth.join(', ')})`);
const ready = minEff >= 10 && regimes >= 2;
console.log(`\n  regimes covered: ${regimes}   min effN: ${minEff}`);
console.log(`  VERDICT: ${ready ? '✅ READY to refit + wire bgMinVar live' : '⛔ NOT READY — archive too short'}`);
if (!ready) {
  const need = [];
  if (minEff < 10) need.push(`effN ≥ 10 (have ${minEff} → ~${Math.max(0, 10 - minEff)} more hourly sessions)`);
  if (regimes < 2) need.push('≥ 2 diurnal regimes (let it run across a day/night)');
  console.log(`  need: ${need.join('; ')}`);
}
console.log('');
