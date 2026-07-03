# fusionV2 — Cumulative Summary (through Phase 2)

## How far we got

- **Phase 0 — Diagnosis & mapping: COMPLETE.** All 17 paper equations mapped to modify/new/offline/
  exists/oos in `docs/fusionV2-plan.md`; seam, param-artifact format, risk list defined. Gate passed.
  Two decisions surfaced and were resolved by you: (A) cutover deferred to Phase 6, per-variable,
  with the native ICON-D2 fields scored as a separate LOSO baseline from Phase 2 on; (B) no
  Vitest — gates run via Node `--experimental-strip-types` + in-browser dev globals.
- **Phase 1 — Observation operator H, terrain metric B, local OI: COMPLETE.** `src/fusion/oi.ts`
  implements eqs (3)/(7)/(8) with SOAR B; wired into the temperature path behind `fusionV2.oi`,
  IDW path byte-identical when off. All three gates green:
  - (i) 11/11 closed-form + limit unit checks,
  - (ii) synthetic inversion (valley obs warms ridge 0.09× vs 1.00× isotropic control),
  - (iii) perf full-run 1.11–1.17×, steady-state ~1.01× (gate ≤ 1.5×).
  Typecheck + build clean.
- **Phase 2 — Verification harness (LOSO/CRPS/Desroziers) FIRST: harness COMPLETE, gate pending real
  capture.** `crps.ts` (17), `loso.ts` (16, block-bootstrap CIs), `desroziers.ts` (9), predictors
  (OI vs IDW ablation vs native-ICON-D2 baseline per Decision A), cross-source drift check, and a
  dev browser `captureFixture` hook. Proven offline on a deterministic synthetic fixture; typecheck +
  build clean. **STOP:** the gate requires a *recorded real session* and Phase 3 fitting on synthetic
  data would be circular — awaiting your capture (`window.__captureFusionFixture`).

## v1-vs-v2 score table (synthetic proof, not real data)

From `scripts/verify-loso.mjs` on the synthetic fixture — MAE (OI vs the IDW ablation = "v1"):
t2m 0.369 vs 0.602, windSpeed 0.189 vs 0.300, cloud 2.755 vs 4.515, precip ~tie. OI also beats the
native ICON-D2 baseline on t2m/windSpeed/cloud. These validate that the harness discriminates; the
**real** v1-vs-v2 table needs the captured fixture(s) and lands as Phase 3 proceeds.

## Every file touched

- **added:** `docs/fusionV2-plan.md`, `docs/reports/fusionV2-phase0.md`,
  `docs/reports/fusionV2-phase1.md`, `docs/reports/fusionV2-summary.md`,
  `src/fusion/oi.ts`, `src/fusion/oi.verify.ts`, `scripts/verify-oi.mjs`, `scripts/perf-oi.mjs`
- **changed:** `src/fusion/fusionEngine.ts` (fusionV2 flag + temperature OI branch),
  `src/fusion/loadFusedForecast.ts` (flag plumbing + result-cache key)
- **memory:** `…/memory/fusionv2-effort.md` (+ MEMORY.md index line)

No git commits made (Rule 1 — you commit). No existing engine path deleted (Rule 2). PNG texture
contract unchanged (Rule 3). No new npm dependency (Rule 5).

## Proposed Conventional Commits (ordered)

1. `docs(fusionV2): add Phase 0 diagnosis plan mapping paper eqs (1)-(17) to modules`
2. `docs(fusionV2): add Phase 0 report with gate checklist and resolved decisions`
3. `feat(fusionV2): add local-OI core (oi.ts) — eqs 3/7/8, SOAR B, per-cell Cholesky`
4. `feat(fusionV2): wire temperature OI behind fusionV2.oi flag; IDW path intact when off`
5. `test(fusionV2): OI closed-form + inversion harness (verify-oi) and perf harness (perf-oi)`
6. `docs(fusionV2): Phase 1 report (gates i/ii/iii green, k=16 deviation noted)`

## What remains

- **Phase 2 real capture** — run `window.__captureFusionFixture({ useOpenMeteo: true })` in the dev
  app, drop `session-*.json` into `fixtures/`, and score offline. Unblocks Phase 3.
- **Phases 3–5** — multi-model min-variance background (eqs 2/4, replacing the Phase-1 prior `r` with
  the Desroziers estimate), increment persistence + wind speed (eqs 10/14), uncertainty 5th PNG
  (eq 15). Each gated on the Phase 2 harness against real fixtures.
- **Phase 6** — per-variable, evidence-gated cutover; hard stop for your explicit go (Rule 3c).

## Next action requested

Capture one or more real sessions (steps in `fusionV2-phase2.md`) and send me the `verify-loso` /
`desroziers` outputs (or commit the fixture). Then I start Phase 3 fitting the background weights
(eqs 2/4) and the Desroziers `r` against real innovations, gated on LOSO CRPS ≤ heuristic per
variable at h=0..6.
