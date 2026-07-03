# fusionV2 — Phase 3 SCAFFOLD Report (multi-model background, eqs 2 & 4)

> Scope requested: build the Phase 3 machinery — fit scripts, artifact format, loading path,
> shrinkage tests on synthetic — **everything except the actual fit on real innovations**, which
> waits on the captured fixture archive. This report covers the scaffold; the real fit + LOSO gate
> land once `fixtures/session-*.json` are committed. The three binding constraints C1/C2/C3 are
> implemented and tested.

## Binding constraints — how each is enforced in code

- **C1 (licence split).** `FixtureSample.provenance` tags every sample; `captureFixture` marks the
  Open-Meteo ICON-D2 baseline `'open-meteo'`; `archive.stripNonCommercial` drops such samples before
  training; `archive.assertNoOpenMeteo` is the hard guard `trainBackground` calls **before writing** —
  a non-commercial sample cannot reach a shipped artifact. `train-background.mjs` also strips
  defensively and logs the count. Tests C1a/C1b prove throw-on-tainted and strip-then-safe.
- **C2 (short archive).** Off-diagonal Σ is opt-in (`bgOffDiag`, default **false**); eq. (4) shrinkage
  pulls sparse stations to regional priors; `effectiveSampleSize` is recorded per variable and
  `train-background.mjs` prints a loud **"C2 SHORT ARCHIVE"** warning when effN < 10. The Phase 3
  gate logic (to run on real data) treats a sample-size failure as a **STOP with diagnosis "archive
  too short"**, never a re-tune.
- **C3 (versioned archive).** `train-background.mjs` (and the LOSO driver) accept a **directory** of
  `session-*.json`; `archive.buildErrorArchive` combines innovations across sessions; re-fitting the
  growing archive is one command.

## What was implemented (eq references)

- **`src/fusion/params.ts`** — artifact schema + client loader. `BackgroundParams`
  (`background-v1.json`: Σ(τ), min-var `weights` (eq 2), bias tables (eq 4), `shrinkageK/Lambda`,
  `offDiagonal`, `effectiveSampleSize`) and `OiParamsArtifact` (`oi-v1.json`: Desroziers r (eq 9),
  L_h/L_v/T_v/inflation). `loadJsonArtifact` (graceful null on failure), `resolveBackgroundWeights`,
  `sourceWeightsFromBackground` (bridge to the engine's `SourceWeights`), named priors `OI_PRIORS` /
  `R_PRIOR_BY_NETWORK` for the fallback path (paper Sect. 6).
- **`src/fusion/archive.ts`** — `stripNonCommercial`, `assertNoOpenMeteo`, `archiveModels`,
  `buildErrorArchive` (per session×station model-minus-obs errors e_m via elevation-aware H).
- **`src/fusion/background.ts`** — `minVarWeights` (eq 2, Cholesky reused from `oi.ts`; diagonal ⇒
  inverse-MSE; discounts correlated members), `shrinkBias` (eq 4), `trainBackground` (archive →
  artifact; asserts C1), `combineBackground` (NaN-skipping renormalised blend).
- **`src/fusion/fusionEngine.ts`** — `FusionV2Flags.bgMinVar` / `bgOffDiag` added (inert until the
  artifact ships + is validated; Rule 2 fallback).
- **`src/fusion/captureFixture.ts`, `fixture.ts`** — provenance tagging (C1).
- **`src/fusion/background.verify.ts`** + **`scripts/verify-background.mjs`** — closed-form tests.
- **`scripts/train-background.mjs`** — directory fit driver (C1/C2/C3).

## Gate results (scaffold — synthetic only)

`node --experimental-strip-types scripts/verify-background.mjs` → **15/15 pass**:

| group | checks |
|-------|--------|
| eq. (4) shrinkage | large-n keeps local (1.984), small-n→regional (0.222), n=0→exactly regional |
| eq. (2) weights | diagonal Σ→inverse-MSE [0.8,0.2]; equal-indep→⅓; **correlated pair discounted** [0.256,0.256,0.487] |
| combine | weighted mean + renormalise on missing member |
| C1 licence | assertNoOpenMeteo throws on tainted; strip removes (stripped=1) then safe |
| smoke | 3-session synthetic → models [arome,mosmix], weights Σ=1 finite, effN=3, off-diagonal off |
| bridge | fitted weight → `SourceWeights`; unknown source → null |

`node …/train-background.mjs --synthetic 3` produces a valid artifact (mosmix ~0.57 / arome ~0.43,
mosmix denser ⇒ lower error variance ⇒ more weight) and fires the C2 short-archive warning at effN=3.

Static gates: `npm run typecheck` clean, `npm run build` clean (~10 s).

## Explicitly NOT done (awaits real fixtures)

- The **actual fit on real innovations** and the shipped `public/params/background-v1.json` /
  `oi-v1.json` (train scripts write synthetic to `fixtures/…` only — never `public/params/`).
- The **Phase 3 gate** — "LOSO CRPS with fitted weights ≤ heuristic on every variable at h=0..6" —
  runs on the real archive; on synthetic it would be circular (constraint acknowledged).
- **Wiring fitted weights into `loadFusedForecast`** (flip `bgMinVar` on): the bridge helper is built
  + tested, but the live override stays off until the real artifact is validated by LOSO.

## Continue / stop decision

**STOP — awaiting the captured fixture archive** (the dependency you accepted). Scaffold is complete
and green on synthetic; nothing further can be validated without real innovations, and forcing a fit
on synthetic data would violate C2's spirit. When you commit `fixtures/session-*.json`:

```
node --experimental-strip-types scripts/train-background.mjs fixtures/      # → public/params/background-v1.json (+ C2 warning if short)
node --experimental-strip-types scripts/verify-loso.mjs      fixtures/…json # OI vs IDW vs ICON-D2 on real data
node --experimental-strip-types scripts/desroziers.mjs       fixtures/…json # r per network → oi-v1.json seed
```

I then: refit, wire `bgMinVar` to consume the artifact, and run the real Phase 3 gate per variable —
reporting honestly (including "archive too short" if that is what the numbers say).

## Files added / changed

- **added:** `src/fusion/params.ts`, `src/fusion/archive.ts`, `src/fusion/background.ts`,
  `src/fusion/background.verify.ts`, `scripts/verify-background.mjs`, `scripts/train-background.mjs`,
  `docs/reports/fusionV2-phase3-scaffold.md`, `fixtures/background-synthetic.json` (inspection)
- **changed:** `src/fusion/fixture.ts` (provenance), `src/fusion/captureFixture.ts` (tagging),
  `src/fusion/fusionEngine.ts` (bgMinVar/bgOffDiag flags), `docs/fusionV2-plan.md` (C1/C2/C3)

## Proposed commit messages

- `feat(fusionV2): parameter artifact schema + client loader (params.ts)`
- `feat(fusionV2): session archive loader + Open-Meteo licence guard (archive.ts, C1)`
- `feat(fusionV2): multi-model min-variance weights (eq 2) + bias shrinkage (eq 4) (background.ts)`
- `feat(fusionV2): provenance tagging for the training/verification split (C1)`
- `feat(fusionV2): bgMinVar/bgOffDiag flags (inert until artifact validated)`
- `test(fusionV2): background eqs 2/4 + licence-split checks; directory train driver (C2/C3)`
- `docs(fusionV2): Phase 3 scaffold report`
