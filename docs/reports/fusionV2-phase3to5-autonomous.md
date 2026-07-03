# fusionV2 — Autonomous run: equivalence gate, scheduler, real fit path, Phase 4/5 machinery

> You authorized me to do all of it. This report covers: (1) the browser capture + equivalence gate
> via Chrome DevTools, (2) verifying the scheduled task actually works, (3) the full pipeline on the
> live archive with a one-command refit + self-judged readiness, and (4) archive-independent Phase
> 4/5 machinery on provisional priors. No commits (Rule 1); ordered commit list at the end.

## 1. Browser capture + equivalence gate — PASSED

- Started the dev server, drove Chrome via the DevTools MCP, force-loaded the lazy fusion chunk, and
  ran the real capture in-page (saved to `fixtures/browser-ref.json` via `evaluate_script filePath`).
- First run vs the scheduled Node session **FAILED one check**: station truth 99/1596 out of tolerance
  — because the two captures were ~5 min apart in wall-clock, so live obs (gusty wind) drifted. That
  is exactly the "fetch-timing" difference the gate is meant to isolate, **not** a structural defect.
- I did **not** weaken tolerances. Instead I re-captured browser + Node **near-simultaneously** (fired
  in parallel). Result — **all 10 checks pass:**

  | check | result |
  |-------|--------|
  | schema / bounds / validTime / provenance | ✓ |
  | station-id overlap | ✓ 100% (338 common, 0/0 only-side) |
  | common-station positions exact | ✓ |
  | station truth within timing tolerance | ✓ 0/1597 |
  | background overlap | ✓ 100% |
  | **background DEM elev parity (node vs browser)** | ✓ **0/292 > 2 m** |
  | background values within tolerance | ✓ 0/1692 |

  The DEM parity check validates the dependency-free `node:zlib` Terrarium decoder against the
  browser's canvas decode — pixel-equivalent. The gate wrote `fixtures/.equivalence-passed`, which
  **unlocks shipping** (`train-background` now writes `public/params/`).

## 2. Scheduled task — verified working (not just registered)

- Triggered `BuscosunFusionCapture` on demand (`schtasks /Run`) rather than waiting for the hour.
- **LastResult = 0**, `fixtures/capture.log` shows `OK`, and it produced a second real session
  (`session-…15-00…json`). The archive now grows on its own. Fixed one latent issue found while
  testing: PowerShell 5.1 was treating Node's stderr warning as a terminating error → wrapper now sets
  `NODE_NO_WARNINGS` and judges success by exit code.

## 3. Full pipeline on the live archive + one-command refit

Archive = 2 real sessions (14:00Z, 15:00Z). With the equivalence marker present:

- **`train-background fixtures/` → `public/params/background-v1.json`** (155 KB) — min-var weights
  fit; effN=2, prior-dominated (C2 warning fires). **Archive-limited; shipped-but-provisional** — the
  client does not consume it yet (`bgMinVar` off).
- **`phase3-gate fixtures/`** → t2m fitted min-var beats heuristic (+0.05, was significant at 1
  session); wind a tie; **⛔ STOP: ARCHIVE TOO SHORT** (τ=0 only, effN≈2). Left exactly as measured
  — no re-tuning (C2).
- **`desroziers`** → real `r` refreshed: wind r≈0.57–0.69, precip dwd r≈0.57 — confirms wind/precip
  obs should be trusted far less than the 0.1 prior (what Phase 3/4 fitting will apply).
- **`archive-status fixtures/`** (new) → self-judged readiness: sessions, validTime span, diurnal
  regime coverage, effN per variable (cloud excluded — no station truth), **VERDICT: NOT READY**
  (need effN ≥ 10; ~8 more hourly sessions). This is the "judge archive readiness yourself" tool.

**Refit + re-gate is one command each** (npm scripts added): `npm run fusion:train`,
`npm run fusion:gate`, `npm run fusion:status`, `npm run fusion:desroziers`, `npm run fusion:loso`,
`npm run capture`, `npm run fusion:verify`.

## 4. Phase 4/5 machinery (archive-independent, provisional priors)

- **`src/fusion/increment.ts`** — eq. (10) `persistenceFactor` (e^{−τ/T_v}) + `addPersistedIncrement`;
  eq. (14) `rescaleWindToSpeed` (cap 4×). **Increment persistence wired into the engine** behind
  `fusionV2.incrementPersist` (requires `oi`): the h=0 analysis increment is captured once and decayed
  into τ>0 with the **provisional prior T_v** from `OI_PRIORS` (4 h for t2m) until the archive fits it.
- **`src/fusion/uncertainty.ts`** — eq. (15) `analysisSigma` (√ratio·σ_b, using the OI `varRatio`
  `oi.ts` already emits), `multiModelSpread2`, `forecastSigma2` (analysis→spread relaxation), and a σ
  PNG encoder. **PLUMBING ONLY** — the existing 4-PNG output is untouched; a live fifth σ layer
  changes the texture contract and is a **Rule-3 hard stop for your approval**, so it is not wired.
- **`src/fusion/phase45.verify.ts`** + `scripts/verify-phase45.mjs` → **15/15 pass**.
- The eq-14 rescale port is available for the future wind-OI path; I left the engine's existing
  allocation-free IDW rescale loop untouched to avoid a hot-loop GC regression.

## Verification (this run)

- `npm run typecheck` clean; `npm run build` clean.
- `npm run fusion:verify` → **11/11 (OI) + 15/15 (background) + 15/15 (phase 4/5)**.
- **Live in-browser integration smoke** (Chrome MCP): `loadFusedForecast({ fusionV2:{ oi:true,
  incrementPersist:true }})` produced 6 hours with temperature + precipitation PNG layers and the
  correct fused model tag — the OI + persistence path executes end-to-end through the real engine
  (canvas encode included).

## State of the flags (all default OFF; IDW path byte-identical when off)

| flag | status |
|------|--------|
| `fusionV2.oi` | implemented + validated (Phase 1); live-smoke OK |
| `fusionV2.incrementPersist` | implemented (Phase 4), **provisional prior T_v** |
| `fusionV2.bgMinVar` / `bgOffDiag` | artifact + bridge built; **not wired live** until Phase 3 gate passes on a mature archive |
| σ fifth layer (eq 15) | plumbing built; **Rule-3 gated**, not wired |

## What unblocks completion (archive-gated)

`archive-status` will flip to **READY** at effN ≥ 10 across ≥ 2 diurnal regimes (≈8+ more hourly
sessions; the task is collecting them). At that point, in one pass: refit → if `phase3-gate` passes
per variable, wire `bgMinVar` live for the passing variables; fit real `T_v`/`r` (replacing the
provisional priors — the wind `r` fix should turn the wind result positive); then Phase 5 σ-layer
(needs your Rule-3 go for the 5th PNG) and Phase 6 per-variable cutover (needs your explicit go).

## Files added / changed (this run)

- **added:** `src/fusion/fixtureBuild.ts`, `src/fusion/increment.ts`, `src/fusion/uncertainty.ts`,
  `src/fusion/phase45.verify.ts`, `scripts/capture-fixture.mjs`, `scripts/equivalence-check.mjs`,
  `scripts/phase3-gate.mjs`, `scripts/archive-status.mjs`, `scripts/verify-phase45.mjs`,
  `scripts/capture-hourly.ps1`, `scripts/capture-hourly.sh`, `scripts/lib/nodeElevation.mjs`,
  `scripts/lib/ts-hooks.mjs`, `scripts/lib/register-ts.mjs`, `fixtures/.gitignore`,
  `fixtures/session-2026-07-02T14-00-00-000Z.json`, `fixtures/session-2026-07-02T15-00-00-000Z.json`,
  `public/params/background-v1.json` (provisional), `docs/reports/fusionV2-phase3to5-autonomous.md`
- **changed:** `src/fusion/fusionEngine.ts` (incrementPersist wiring), `src/fusion/captureFixture.ts`
  (shared build), `scripts/train-background.mjs` (equivalence-marker gate + glob/shape fixes),
  `scripts/desroziers.mjs` (artifact naming), `package.json` (npm scripts)
- **system:** registered Task Scheduler `BuscosunFusionCapture` (remove: `schtasks /Delete /TN BuscosunFusionCapture /F`)

## Proposed commit messages (ordered)

1. `feat(fusionV2): shared grid→fixture builder for browser/Node capture parity (fixtureBuild.ts)`
2. `feat(fusionV2): Node capture on the real adapters + zlib Terrarium DEM (no new dep)`
3. `feat(fusionV2): equivalence gate — browser≡Node blocks shipping a fit (enforced in code)`
4. `feat(fusionV2): hourly capture scheduler (Task Scheduler ps1 + cron sh)`
5. `feat(fusionV2): archive-status readiness reporter + phase3-gate (fitted vs heuristic)`
6. `feat(fusionV2): increment persistence (eq 10) wired behind fusionV2.incrementPersist (prior T_v)`
7. `feat(fusionV2): wind speed-rescale (eq 14) + uncertainty (eq 15) machinery — plumbing, no 5th PNG`
8. `test(fusionV2): phase 4/5 machinery checks (verify-phase45, 15/15)`
9. `fix(fusionV2): archive glob + Desroziers artifact naming; short-archive guard`
10. `chore(fusionV2): capture/train/loso/status/gate npm scripts; fixtures/.gitignore`
11. `chore(fusionV2): provisional background-v1.json (archive-limited) + first session seeds`
12. `docs(fusionV2): autonomous-run report (equivalence, scheduler, Phase 4/5 machinery)`
