# fusionV2 — Phase 0 Report: Diagnosis & Mapping

> Scope: read the paper + existing fusion code completely; produce `docs/fusionV2-plan.md`.
> **No code changes.** Gate: the plan covers all 17 equations with no "TBD".

## What was done

- Read `docs/fusion-forecast-paper.md` (equations (1)–(17)), `docs/fusion-forecast-spec.md`,
  and `docs/fusion-forecast-overview.md` in full.
- Read the entire fusion core: `src/fusion/fusionEngine.ts`, `spatialInterp.ts`,
  `loadFusedForecast.ts`, `elevation.ts`, plus `countryProfiles.ts` and the `ForecastGrid` /
  `DwdForecastResult` types.
- Mapped how the 2D layers consume the fused result (`src/MapView.tsx`) and inventoried the
  existing verification harnesses and script-runner tooling.
- Wrote `docs/fusionV2-plan.md`: full equation→module table, the `run()` seam, the client
  parameter-artifact format, the verification instrument, and the risk list.

## Key diagnostic findings

1. **The current engine is a Barnes/IDW successive-correction scheme** — structurally the
   *imposed-weight* approximation of the paper's derived-weight OI (paper Sect. 3.1). The seam to
   replace is `applySpatialKernel`'s per-cell `Σ(w·v)/Σw` with the OI analysis (3).

2. **Two paper equations are already implemented and reusable as-is:**
   - Eq. (6) lapse-rate shrinkage = `spatialInterp.ts:estimateLapseRate` (identical math, already
     tested by `verifyLapseShrinkage()`).
   - Eq. (14) wind speed-preservation = `fusionEngine.ts:338–350` (separate scalar speed analysis +
     per-cell rescale, cap 4×).

3. **The 2D map layers do not currently render through the fusion engine.** Verified in
   `src/MapView.tsx`: `wind/gust/temp/clouds` render from **native ICON-D2** decoded grids,
   `nowcast/flownowcast/poprob` from the radar `PrecipCompositor`, `confidence/snowline` derive from
   the native ICON-D2 temp grid. The fused PNGs are used only as (a) a transient temperature
   first-paint fallback (`MapView.tsx:1561–1570`, gated on `!iconD2TempRef.current`), (b) the temp
   layer DEM image, and (c) a permanently-hidden `precip-forecast` layer. Fused `wind`/`clouds` PNGs
   are computed and dropped. → "ALL 2D layers exclusively through fusionV2" is a re-migration, not a
   swap. **Decision A.**

4. **No unit-test runner exists.** No `vitest`/`jest`/`ts-node`/`vite-node`; `tsx` is only an
   optional vite peer, not installed. The repo's "tests" are pure functions returning
   `{checks,passed,failed}`, run either in-browser via `window.__*` dev globals (`verifySamples.ts`,
   `__bsQA`→`src/qa/layerQA.ts`) or under Node `--experimental-strip-types` (`scripts/verify-aec.mjs`
   importing `.ts` directly) / Playwright (`scripts/qa-layers.mjs`). The prompt's "full Vitest suite"
   has no home here. **Decision B.**

5. **Rendering contracts** referenced by the prompt: `defaultProjectionData.mainMatrix` is real and
   used by every custom WebGL layer (`WindLayer.ts:17,295,726` et al.) — must be preserved.
   `RepaintScheduler` is a **convention**, not a class (only `docs/…` + a comment in
   `radar/RadarMap.tsx`); honoured via guarded `triggerRepaint()`. `gl.bindVertexArray(null)` — the
   custom layers use **no VAOs** (grep-clean in `src/`); the "bind null before yielding" contract is
   vacuously satisfied but I will keep any new GL state self-contained regardless.

## Gate checklist

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All 17 equations mapped to modify / new / offline / exists / oos | ✅ PASS | `fusionV2-plan.md` §2 table, rows (1)–(17) |
| No equation left "TBD" | ✅ PASS | The only out-of-scope items — `d_coast`, `LU`, radar cascade (11)–(13) — are documented data-constraint omissions with named fallbacks, not open questions |
| Seam into `run()` defined | ✅ PASS | `fusionV2-plan.md` §3 |
| Client parameter-artifact format defined | ✅ PASS | `fusionV2-plan.md` §4 |
| Risk list (numerical / perf / visual) | ✅ PASS | `fusionV2-plan.md` §6 |
| No code changes in Phase 0 | ✅ PASS | Only `docs/` files added |

**Phase 0 gate: PASSED.**

## Continue / stop decision

**STOP.** The Phase 0 gate passed, but the autonomy conditions require *no open questions and no
DECISION NEEDED items* before advancing. Two genuine, user-owned decisions surfaced (below), one of
which (A) is an architectural conflict between the prompt premise and the as-built code, and the
other (B) is blocked by Rule 5 (no new dependency without asking) and Rule 4 (must run the test
suite — which does not exist). Both must be resolved before Phase 1 writes code. Neither undermines
the plan: Phases 1–5 (the estimation engine) are identical regardless of how A and B resolve.

## Files added

- `docs/fusionV2-plan.md`
- `docs/reports/fusionV2-phase0.md` (this file)

## Proposed commit messages

- `docs(fusionV2): add Phase 0 diagnosis plan mapping paper eqs (1)-(17) to modules`
- `docs(fusionV2): add Phase 0 report with gate checklist and open decisions`

---

## DECISION NEEDED — RESOLVED 2026-07-01

**Resolution:** A → **defer to Phase 6, per-variable, evidence-gated** — plus: from Phase 2 the LOSO
harness scores raw native ICON-D2 as a separate per-variable baseline, and Phase 6 cutover claims a
layer only where v2 beats native on **both** LOSO and perf (per-variable outcome acceptable).
B → **Node `--experimental-strip-types` + in-browser dev globals** (no new dependency). Phase 1 is
unblocked. Original decision text preserved below for the record.


### A. Cutover target — what does "ALL 2D layers through fusionV2" mean, given the layers already bypass the engine?

The 2D layers were deliberately migrated to native ICON-D2 grids (the recent `perf/2d-layer-mobile`
line of commits). Making them render *exclusively* through fusionV2 reverses that. Options:

- **(i)** Wire fusionV2 to feed the existing layer classes (WindLayer/ScalarLayer/CloudLayer/
  RainLayer), replacing the native ICON-D2 installers. Largest scope; highest visual + mobile-perf
  regression risk; directly undoes recent perf work.
- **(ii)** Scope "all layers" to the layers the fusion engine legitimately owns — temperature (+ the
  new uncertainty layer) — and keep native ICON-D2 for wind/clouds and radar for nowcast. Smallest,
  safest; but narrower than the prompt's wording.
- **(iii) [recommended]** Build the estimation engine now (Phases 1–5) behind the flag, feeding the
  temperature path first, and **defer the cutover-target choice to the Phase 6 gate** — which is
  already a mandatory hard stop (Rule 3c). Phases 1–5 are identical under (i) or (ii), so this loses
  no time and keeps the decision where the evidence (LOSO tables, perf tables) will actually be.

**My recommendation: (iii).** It unblocks all the statistical work immediately and puts the
architectural call in front of you at Phase 6 with data in hand.

### B. Test runner — "full Vitest suite" vs. the repo's actual harness pattern

There is no Vitest (or any unit-test runner) in the repo, and Rule 5 forbids adding an npm
dependency without your go-ahead. Options:

- **(i) [recommended]** Implement Phase gates as pure `.ts`/`.mjs` harnesses run via Node
  `--experimental-strip-types` (the existing `scripts/verify-aec.mjs` precedent) + in-browser dev
  globals for OI unit checks (the `verifySamples.ts`/`__bsQA` precedent). Zero new dependencies;
  matches the codebase; satisfies the *intent* of "the suite is green" (a runnable, exit-coded
  gate). Deviates from the literal word "Vitest".
- **(ii)** Add `vitest` (+ jsdom) as a devDependency and author real `*.test.ts`. Matches the
  prompt literally; introduces a new toolchain the rest of the repo doesn't use.

**My recommendation: (i).** Please confirm, or tell me to add Vitest.

I will not start Phase 1 until A and B are answered.
