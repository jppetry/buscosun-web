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

// 3) Solid 60 fps (16.7 ms, vsync-capped WITH headroom) must climb to the TOP —
//    this is the core "stuck below full quality on a smooth device" bug fix.
{
  const g = new FrameGovernor({ startLevelIndex: 0 });
  feedN(g, 16.7, 400);
  check(g.levelIndex === g.levelCount - 1, `solid 60fps climbs from floor to top (got index ${g.levelIndex}, ema ${g.ema.toFixed(1)})`);
}

// 3b) Dead band: steady ~48 fps (21 ms, between upMs 18 and downMs 24) → holds.
{
  const g = new FrameGovernor({ startLevelIndex: 2 });
  feedN(g, 21, 400);
  check(g.levelIndex === 2, `steady 48fps holds in the dead band (got index ${g.levelIndex}, ema ${g.ema.toFixed(1)})`);
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

// ---------------------------------------------------------------------------
// FPS-TARGET MODE (Phase P — cross-device parity). The governor regulates the
// FPS TARGET (mobile ladder 20/24/30) from the measured per-frame RENDER
// DURATION, NOT a particle multiplier. Thresholds are re-based to the ACTIVE
// target interval: down at > downFactor×(1000/targetFps), up at < upFactor×.
// Ladder [20,24,30] → target ms {50, 41.7, 33.3}; defaults down 1.3 / up 0.9 →
// down thresholds {65, 54.2, 43.3}, up thresholds {45, 37.5, 30}.
const LADDER = [20, 24, 30];

// F1) Over-budget render duration (45 ms) from the top tier (30 fps, budget
//     33.3 ms) → step DOWN to 24 fps and SETTLE there (45 is inside 24's dead
//     band 37.5..54.2). Proves the FPS lever engages and does not overshoot.
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 2 });
  feedN(g, 45, 400);
  check(g.levelIndex === 1 && g.targetFps === 24, `render 45ms from 30fps → settles at 24fps (got idx ${g.levelIndex}, fps ${g.targetFps}, ema ${g.ema.toFixed(1)})`);
}

// F2) Comfortable render duration (10 ms) from the floor (20 fps) → climb all the
//     way to the TOP tier (30 fps = the un-governed mobile reference).
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 0 });
  feedN(g, 10, 400);
  check(g.levelIndex === LADDER.length - 1 && g.targetFps === 30, `render 10ms from floor → climbs to 30fps top (got idx ${g.levelIndex}, fps ${g.targetFps})`);
}

// F3) Sustained heavy render duration (80 ms) → all the way to the FLOOR (20 fps)
//     and no lower (there is no cheaper tier — particle count stays full).
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 2 });
  feedN(g, 80, 600);
  check(g.levelIndex === 0 && g.targetFps === 20, `render 80ms → floor 20fps, particle count untouched (got idx ${g.levelIndex}, fps ${g.targetFps})`);
}

// F4) Dead band: steady 41 ms at 24 fps (between up 37.5 and down 54.2) → holds,
//     no oscillation of the FPS target.
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 1 });
  feedN(g, 41, 120);
  const settled = g.levelIndex;
  let changed = false;
  for (let i = 0; i < 300; i++) { g.feed(41); if (g.levelIndex !== settled) changed = true; }
  check(!changed && settled === 1, `steady 41ms holds 24fps in the dead band (held idx ${settled}, ema ${g.ema.toFixed(1)})`);
}

// F5) CRITICAL self-sabotage guard: a HEALTHY capped device whose wall-clock
//     interval sits at the cap (~33 ms @ 30 fps) but whose actual render work is
//     cheap (8 ms) must NOT be dragged down. Feeding render duration (not the
//     capped interval) keeps it pinned at the top tier.
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 2 });
  feedN(g, 8, 400); // render work is cheap; the ~33 ms interval is the CAP, not slowness
  check(g.levelIndex === 2 && g.targetFps === 30, `cheap render under an active cap stays at 30fps top (got idx ${g.levelIndex}, fps ${g.targetFps})`);
}

// F6) Cooldown in FPS mode: after the first down-step, no second step within
//     cooldownFrames even under continued load.
{
  const g = new FrameGovernor({ fpsLadder: LADDER, startLevelIndex: 2, cooldownFrames: 45, warmupFrames: 30 });
  let stepAt = -1, prev = g.levelIndex;
  for (let i = 0; i < 200; i++) {
    g.feed(80);
    if (g.levelIndex !== prev) { stepAt = i; break; }
    prev = g.levelIndex;
  }
  const afterStep = g.levelIndex;
  feedN(g, 80, 40); // < cooldown 45 → must NOT step again
  check(stepAt >= 0 && g.levelIndex === afterStep, `FPS mode: no second step within cooldown (step@${stepAt}, idx ${afterStep}→${g.levelIndex})`);
}

// F7) A fresh FPS-mode governor starts at the TOP tier (= requested cap / mobile
//     reference); legacy mode has no FPS target (targetFps 0).
check(new FrameGovernor({ fpsLadder: LADDER }).targetFps === 30, 'FPS governor default starts at top tier (30fps)');
check(new FrameGovernor({ startLevelIndex: 3 }).targetFps === 0, 'legacy governor reports targetFps 0 (no FPS mode)');

console.log(`\n${failures === 0 ? 'ALLE CHECKS PASS' : `${failures} CHECK(S) FEHLGESCHLAGEN`}`);
process.exit(failures === 0 ? 0 : 1);
