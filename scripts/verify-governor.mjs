/**
 * Deterministic verification of the adaptive wind-perf governor (no GPU / no wind
 * data needed — pure frame-time logic). Feeds synthetic frame-interval sequences
 * and asserts: converges DOWN under load, UP under headroom, STAYS in the dead
 * band (no oscillation), respects the cooldown, and desktop-top = quality 1.0.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-governor.mjs
 */
import { FrameGovernor, classifyGpu, initialTier, tierToLevelIndex } from '../src/wind/perfGovernor.ts';

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

const feedN = (g, dt, n) => { for (let i = 0; i < n; i++) g.feed(typeof dt === 'function' ? dt(i) : dt); };

// 1) Sustained slow frames (40 ms ≈ 25 fps) from the TOP → floor.
{
  const g = new FrameGovernor({ startLevelIndex: 3 });
  feedN(g, 40, 400);
  check(g.levelIndex === 0, `sustained 40ms → floor (got index ${g.levelIndex}, ema ${g.ema.toFixed(1)})`);
  check(g.tierName === 'low', `floor tier = low (got ${g.tierName})`);
}

// 2) Sustained fast frames (10 ms) from the FLOOR → top, quality exactly 1.0.
{
  const g = new FrameGovernor({ startLevelIndex: 0 });
  feedN(g, 10, 400);
  check(g.levelIndex === g.levelCount - 1, `sustained 10ms → top (got index ${g.levelIndex})`);
  check(g.quality === 1.0, `top level quality is exactly 1.0 (got ${g.quality})`);
}

// 3) Dead band: steady 16.7 ms (60 fps) from MID → never moves.
{
  const g = new FrameGovernor({ startLevelIndex: 2 });
  feedN(g, 16.7, 400);
  check(g.levelIndex === 2, `steady 60fps stays put (got index ${g.levelIndex}, ema ${g.ema.toFixed(1)})`);
}

// 4) Anti-oscillation: alternating 13/27 ms (avg 20, inside the dead band) → stable.
{
  const g = new FrameGovernor({ startLevelIndex: 2 });
  feedN(g, 40, 0); // noop
  const seq = (i) => (i % 2 === 0 ? 13 : 27);
  // run warmup+settle, then record level and confirm it never changes over 200 more frames
  feedN(g, seq, 120);
  const settled = g.levelIndex;
  let changed = false;
  for (let i = 0; i < 200; i++) { g.feed(seq(i)); if (g.levelIndex !== settled) changed = true; }
  check(!changed, `alternating 13/27ms does not oscillate (held index ${settled}, ema ${g.ema.toFixed(1)})`);
}

// 5) Cooldown: after the first down-step, no further step within cooldownFrames.
{
  const g = new FrameGovernor({ startLevelIndex: 3, cooldownFrames: 45, warmupFrames: 30 });
  // feed slow until the first step happens, capture frame index of the step
  let stepAt = -1, prev = g.levelIndex;
  for (let i = 0; i < 200; i++) {
    g.feed(40);
    if (g.levelIndex !== prev) { stepAt = i; break; }
    prev = g.levelIndex;
  }
  const afterStep = g.levelIndex;
  // feed 40 more frames (< cooldown 45) — must NOT step again
  feedN(g, 40, 40);
  check(stepAt >= 0 && g.levelIndex === afterStep, `no second step within cooldown (step@${stepAt}, index ${afterStep}→${g.levelIndex})`);
}

// 6) GPU classification heuristics.
check(classifyGpu('Apple M1 Pro') === 'strong', 'classify Apple M1 → strong');
check(classifyGpu('ANGLE (NVIDIA GeForce RTX 3070)') === 'strong', 'classify NVIDIA RTX → strong');
check(classifyGpu('Adreno (TM) 330') === 'weak', 'classify Adreno 330 → weak');
check(classifyGpu('Mali-G78') === 'mid', 'classify Mali-G78 → mid');
check(classifyGpu('Apple A15 GPU') === 'mid', 'classify Apple A15 → mid');
check(classifyGpu('') === 'unknown', 'classify empty → unknown');

// 7) Initial tier from caps.
check(initialTier({ dpr: 1, cores: 8, memoryGB: 8, coarsePointer: false, gpu: '', gpuClass: 'unknown' }) === 'high', 'desktop (fine pointer, unknown GPU) → high');
check(initialTier({ dpr: 1, cores: 4, memoryGB: 8, coarsePointer: false, gpu: 'Intel UHD', gpuClass: 'weak' }) === 'high', 'desktop with weak integrated GPU still → high (no desktop regression)');
check(initialTier({ dpr: 3, cores: 8, memoryGB: 4, coarsePointer: true, gpu: 'Adreno (TM) 505', gpuClass: 'weak' }) === 'low', 'weak-GPU phone → low');
check(initialTier({ dpr: 2, cores: 6, memoryGB: 6, coarsePointer: true, gpu: 'Mali-G72', gpuClass: 'mid' }) === 'mid', 'mid-GPU phone → mid');

// 8) tierToLevelIndex maps to the 4-level ladder ends/middle.
check(tierToLevelIndex('high') === 3 && tierToLevelIndex('low') === 0 && tierToLevelIndex('mid') === 2, 'tierToLevelIndex maps high/low/mid → 3/0/2');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
