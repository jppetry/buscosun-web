/**
 * Fit the multi-model background artifact (eqs 2 & 4) from a DIRECTORY of session
 * fixtures (constraint C3 — a growing archive, one command to re-fit).
 *
 *   node --experimental-strip-types scripts/train-background.mjs [fixtures/]      → public/params/background-v1.json
 *   node --experimental-strip-types scripts/train-background.mjs --synthetic 3    → fixtures/background-synthetic.json (inspection only)
 *
 * Licence split (C1): every session is passed through `stripNonCommercial` and
 * `trainBackground` re-asserts no Open-Meteo sample survived before writing.
 * Short archive (C2): the effective sample size is reported and a loud warning is
 * printed when the fit is prior-dominated — early gains are expected to be small
 * and MUST NOT be treated as significant.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { trainBackground } from '../src/fusion/background.ts';
import { stripNonCommercial } from '../src/fusion/archive.ts';
import { generateSyntheticFixture } from '../src/fusion/fixture.ts';

const args = process.argv.slice(2);
let fixtures = [];
let out;
let synthetic = false;

if (args[0] === '--synthetic') {
  synthetic = true;
  const n = Number(args[1] ?? 3);
  for (let i = 0; i < n; i++) fixtures.push(generateSyntheticFixture(42));
  out = 'fixtures/background-synthetic.json';
} else {
  const dir = args[0] ?? 'fixtures';
  let files = [];
  try {
    // session-<validTime>.json only — the validTime has no dots (they are dashed
    // on write), so `[^.]+` excludes derived artifacts like *.desroziers.json.
    files = readdirSync(dir).filter((f) => /^session-[^.]+\.json$/.test(f));
  } catch {
    console.error(`[train-background] cannot read directory '${dir}'.`);
    process.exit(2);
  }
  if (!files.length) {
    console.log(`\n[train-background] no session-*.json in '${dir}'. Capture a real session first:`);
    console.log('  npm run dev → console: await window.__captureFusionFixture({ useOpenMeteo:false })');
    console.log('  move session-*.json into fixtures/, then re-run this.\n');
    process.exit(0);
  }
  fixtures = files.map((fn) => JSON.parse(readFileSync(join(dir, fn), 'utf8')))
    .filter((fx) => Array.isArray(fx.stations) && Array.isArray(fx.background));   // shape guard
  if (!fixtures.length) { console.error(`[train-background] no valid session fixtures in '${dir}'.`); process.exit(2); }
  // EQUIVALENCE GATE (user requirement): only ship to public/params/ once a
  // browser-vs-node capture has passed equivalence-check.mjs (marker present).
  // Otherwise write a PROVISIONAL artifact and refuse to ship — enforced in
  // code so it does not depend on anyone remembering.
  if (existsSync('fixtures/.equivalence-passed')) {
    out = 'public/params/background-v1.json';
  } else {
    out = 'fixtures/background-provisional.json';
    console.log('\n⚠  EQUIVALENCE GATE not passed (no fixtures/.equivalence-passed).');
    console.log('   Writing a PROVISIONAL artifact — NOT shipped to public/params/. Run');
    console.log('   scripts/equivalence-check.mjs <browser.json> <node.json> to unlock shipping.\n');
  }
}

// C1: strip Open-Meteo defensively; trainBackground also asserts as a hard guard.
let strippedTotal = 0;
fixtures = fixtures.map((fx) => {
  const { fixture, stripped } = stripNonCommercial(fx);
  strippedTotal += stripped;
  return fixture;
});
if (strippedTotal) console.log(`[train-background] C1: stripped ${strippedTotal} Open-Meteo sample(s) before fitting.`);

const times = fixtures.map((f) => f.meta.validTime).sort();
const art = trainBackground(fixtures, {
  window: { from: times[0], to: times[times.length - 1], sessions: fixtures.length },
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(art, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nbackground fit (${synthetic ? 'SYNTHETIC — inspection only' : 'real archive'}) → ${out}`);
console.log(`  sessions=${fixtures.length}  models=[${art.models.join(', ')}]\n`);
console.log(`  ${pad('variable', 10)} ${pad('weights (min-var, eq 2)', 28)} ${pad('effN', 6)}`);
console.log(`  ${'-'.repeat(10)} ${'-'.repeat(28)} ${'-'.repeat(6)}`);
// Variables with NO station truth (cloud — BrightSky current carries no cloud)
// can never gain effN and must not drag the archive-maturity verdict down.
// Before V-29 they did: cloud's effN=0 printed "SHORT ARCHIVE (effN=0)" while
// every other variable sat at 305. Same defect class as phase3-gate.mjs had.
let minEff = Infinity;
const noTruth = [];
for (const [v, pv] of Object.entries(art.perVariable)) {
  const w = pv.weights['0'].map((x) => x.toFixed(3)).join(', ');
  const eff = pv.effectiveSampleSize;
  console.log(`  ${pad(v, 10)} ${pad('[' + w + ']', 28)} ${pad(eff, 6)}${eff === 0 ? '  (no station truth — model-only)' : ''}`);
  if (eff === 0) { noTruth.push(v); continue; }
  minEff = Math.min(minEff, eff);
}
if (noTruth.length) console.log(`\n  excluded from the maturity verdict (no station truth): ${noTruth.join(', ')}`);
if (minEff !== Infinity && minEff < 10) {
  console.log(`\n  ⚠  C2 SHORT ARCHIVE (effN=${minEff} < 10): weights are heavily prior-shrunk.`);
  console.log('     Early LOSO gains are expected to be small / non-significant. Do NOT re-tune to');
  console.log('     force a pass — keep collecting sessions (radiation night / mixed / frontal).');
}
console.log('');
