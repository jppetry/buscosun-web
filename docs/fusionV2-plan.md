# Fusion Engine v2 — Diagnosis & Implementation Plan (Phase 0)

> Status: Phase 0 (diagnosis only, **no code changes**). Spec source: `docs/fusion-forecast-paper.md`
> ("A Minimum-Variance Fusion Framework…"), equations (1)–(17). Existing engine: `docs/fusion-forecast-spec.md`.
> Target: replace the heuristic IDW/weight-table core in `src/fusion/` with a minimum-variance
> analysis (OI) core, staged behind the `fusionV2` flag, one paper-equation concern per change set.

This document is the acceptance artifact for the Phase 0 gate ("the plan covers all 17 equations
with no TBD"). It maps every equation to its target module, defines the seam into
`FusionEngine.run()`, the client parameter-artifact format, and the risk list. Two blocking
decisions surfaced during diagnosis are recorded in §7 and in `docs/reports/fusionV2-phase0.md`;
they do **not** leave any equation unmapped — the engine work (Phases 1–5) is fully specified
regardless of how they resolve; they bite only at the Phase 6 cutover and at the choice of test
runner.

---

## 1. What the current engine actually is (as-built)

The pipeline in `src/fusion/` is a **Barnes/IDW successive-correction** scheme (paper Sect. 3.1
notes this is structurally an approximation of eq. (3) with *imposed* rather than *derived*
weights):

- `loadFusedForecast.ts` — orchestration: resolve country profile, fetch sources in parallel
  (10-min `sourceCache`), ingest each into `FusionEngine` with a **hand weight table**
  (`SourceWeights`, obs=5.0/3.0/2.0/4.0, MOSMIX=1.4, INCA=2.0, AROME=1.4…), then `engine.run()`,
  cache the `DwdForecastResult` (`fusedResultCache`).
- `fusionEngine.ts` — per hour: pull values into reused buffers → `estimateLapseRate` →
  `applySpatialKernel` per variable → speed-preserving wind rescale → temporal-median → encode
  4 PNGs (+ 1 DEM PNG).
- `spatialInterp.ts` — `buildSpatialKernel` (CSR neighbour lists + pure-distance weights,
  built **once**; positions are hour-invariant) / `applySpatialKernel` (per-cell
  `Σ(w·v)/Σw`, `w = distWeight·sourceWeight`, MSL-reduction seam for temperature, Barnes blur,
  NaN backfill). Also hosts `estimateLapseRate` (**already eq. (6)**).
- `elevation.ts` — Terrarium z5 DEM lookup + `buildGrid`. `STANDARD_LAPSE_RATE_PER_M = 0.0065`.
- `frameInterp.ts` — sub-hour PNG texel lerp (unchanged by v2; contract preserved).

**Critical as-built fact (verified in `src/MapView.tsx`):** the 2D map layers no longer render
from the fusion PNGs. `installWind/installTemp/installClouds/installGust` decode **native
ICON-D2 grids**; `nowcast` uses the radar `PrecipCompositor`; `confidence`/`snowline` derive from
the native ICON-D2 temp grid. The fused result is consumed only at `MapView.tsx:1541–1583` as
(a) a first-paint **temperature** fallback until native ICON-D2 temp arrives, (b) the temp layer's
DEM image, and (c) a permanently-hidden `precip-forecast` layer (`applyVisibility` forces it
`false`). `wind`/`clouds` fused PNGs are produced and dropped. → The prompt premise "ALL 2D layers
render exclusively through this engine" is a **re-migration** away from native ICON-D2, not a
drop-in swap. See §7 Decision A.

---

## 2. Equation → module map (all 17, no TBD)

Legend: **[modify]** existing module changed · **[new]** new module · **[offline]** Node training
script under `scripts/` shipping a JSON param artifact · **[exists]** already implemented, reused ·
**[oos]** out of scope for autonomous work (data/source constraint) — reason given.

| Eq | Paper subject | Target | Phase | Notes |
|----|---------------|--------|-------|-------|
| (1) | DEM covariate vector `Z(x)` = (z, TPI₅₀₀, TPI₂₀₀₀, ∇z, aspect·slope insolation, d_coast, LU) | **[new]** `src/fusion/terrainCovariates.ts` (z, TPI₅₀₀, TPI₂₀₀₀, ∇z, aspect/slope insolation from Terrarium DEM); **[exists]** `elevation.ts` supplies z | 1 (metric inputs), 3 (f) | `d_coast` and `LU` are **[oos]**: no coastline dataset and no land-use raster in the integrated pipelines; adding either violates the no-new-source rule. Documented omission (named prior), **not TBD** — DACH is largely landlocked so `d_coast`'s marginal CRPS is low; `LU` folded into the per-station bias term (4) instead. |
| (2) | Min-variance weights `w = Σ⁻¹1 / 1ᵀΣ⁻¹1` | **[modify]** `loadFusedForecast.ts` weight table → **[new]** `src/fusion/background.ts` (loads `Σ(τ)` from params, solves 2) | 3 | Diagonal-Σ first (= inverse-MSE), off-diagonal behind sub-flag `fusionV2.bgOffDiag`. Reuses the k×k Cholesky from `oi.ts`. |
| (3) | Analysis eq. `x_a = x_b + K(y−Hx_b)`, `K = BHᵀ(HBHᵀ+R)⁻¹` | **[new]** `src/fusion/oi.ts` (local OI per cell, k≤32) | 1 | Core of v2. Replaces `applySpatialKernel` for the residual analysis behind `fusionV2.oi`. |
| (4) | Bias shrinkage `b̂_m(s,τ) = ns/(ns+k)·ē_local + k/(ns+k)·ē_region` | **[offline]** `scripts/train-background.ts` → `public/params/background-v1.json`; **[modify]** `background.ts` applies tables | 3 | James–Stein hierarchical estimator. `k` fitted under (16). Absorbs the `LU` covariate from (1) as a regional class. |
| (5) | Regression-kriging decomposition `v = x_b + f(Z) + ε` | **structural** — spans `background.ts` (x_b), `terrainCovariates.ts`+`f` (Phase 3), `oi.ts` (ε) | 1+3 | The organising identity; no single module. Phase 1 delivers ε (OI residual) on the *current* IDW background; Phase 3 replaces x_b and adds f. |
| (6) | Lapse-rate shrinkage `γ̂ = α·γ_OLS + (1−α)γ₀`, `α = clip((Δz−300)/700)·clip((R²−0.3)/0.5)`, clamp [−8,+12]e-3 | **[exists]** `spatialInterp.ts:estimateLapseRate` — **already exactly eq. (6)** | 1 (reuse) | Becomes the vertical component of `f` and the γ̂ in H (7). No change to the math; only relocated into the OI path. `verifyLapseShrinkage()` already tests it. |
| (7) | Observation operator `H(x)\|s = x(x_s) + γ̂(z_grid − z_s)` | **[new]** `oi.ts` (elevation-aware H) — replaces the MSL-reduction seam in `applySpatialKernel` | 1 | Moves elevation physics into H so B stays isotropic in transformed space. |
| (8) | Anisotropic metric `d²ij = ‖x_i−x_j‖²/L_h² + (z_i−z_j)²/L_v²` | **[new]** `oi.ts` (neighbour search + B under this metric) | 1 | `L_h≈40–80 km`, `L_v≈300–800 m` fitted (16); `L_v` halved when γ̂<0 (inversion). SOAR correlation `ρ(d)=(1+d)e^{−d}`. |
| (9) | Desroziers diagnostics `σ̂_o² ≈ E[(y−Hx_a)(y−Hx_b)]`, `HBHᵀ ≈ E[(Hx_a−Hx_b)(y−Hx_b)]` | **[offline]** `scripts/desroziers.ts` → `public/params/desroziers-v1.json` | 2 | Accumulate innovation stats over the fixture archive; feeds σ_o, σ_b into `oi-v1.json`. |
| (10) | Increment persistence `v̂(x,τ) = x_b + f + [x_a−x_b]·e^{−τ/T_v}` | **[new]** `src/fusion/increment.ts` (applied in `run()` loop) | 4 | `T_v` from innovation-autocorrelation e-folding, estimated by the harness. |
| (11) | Optical flow `min_u ∫|R−R(x−uΔt)|² + λ∫‖∇u‖²` (radar motion) | **[exists]** `src/ml/` optical-flow + `src/radar/`; nowcast handled by `nowcastEngine`/`PrecipCompositor` **outside** fusionV2 | — | Not a fusionV2 phase (phase list is analysis+forecast, not the radar cascade). Integrating **RADOLAN-advection as a fusionV2 input is [oos]** — CONTEXT names it out of scope; propose+stop if a phase needs it. |
| (12) | Scale-dependent AR(1) cascade decay `φ_k(τ)=ρ_k^{τ/τ_k}` (S-PROG/STEPS) | **[oos]** — S-PROG spectral cascade is beyond the integrated nowcast; existing flow nowcast (`flownowcast`) is the simpler in-repo analogue | — | Propose in a phase report if radar nowcast is brought under fusionV2. Not required by Phases 1–6. |
| (13) | Radar↔NWP blend `α(τ)=σ_now⁻²/(σ_now⁻²+σ_nwp⁻²)` (scalar case of (2)) | **[exists]** `PrecipCompositor` blends radar↔NWP heuristically today; principle reused. fusionV2 precip **forecast** (τ>0) uses background+increment (2)/(10) | — | The min-variance blend *principle* is honoured by (2)/(13) sharing code, but the radar-nowcast crossover stays in the existing nowcast path unless Decision A brings it into v2. |
| (14) | Wind-speed preservation `u* = u_a·min(s_a/‖u_a‖, c_max)`, `c_max=4` | **[exists]** `fusionEngine.ts:338–350` — **already implemented**; **[modify]** port unchanged into the OI path | 4 | Speed analysed separately as scalar through the same OI, vector rescaled per cell, cap 4. |
| (15) | Uncertainty `σ_a² = σ_b²(1−bᵀ(HBHᵀ+R)⁻¹b)`, `σ_fc² = σ_a²e^{−2τ/T} + Σ w_m(x̃_m−x_b)²` | **[new]** `oi.ts` returns `σ_a²` (free by-product of the Cholesky solve) + `increment.ts` relaxation; **[modify]** `fusionEngine.ts` encodes a **5th PNG**; **[new]** optional 2D uncertainty layer | 5 | Rank-histogram + spread–skill calibration in the harness; one inflation factor per variable fitted (16). |
| (16) | LOSO-CRPS objective `θ̂ = argmin E_LOSO[CRPS]` | **[offline]** `scripts/verify-loso.ts` (acceptance instrument for all later phases) | 2 | Leave-one-station-out, per variable × lead × terrain class (TPI), paired block-bootstrap CIs. |
| (17) | Gaussian CRPS closed form `σ[z(2Φ(z)−1)+2φ(z)−1/√π]`, `z=(y−μ)/σ` | **[new]** `scripts/lib/crps.ts` (used by `verify-loso.ts`) | 2 | Reduces to MAE for σ→0 (deterministic). Pure function, unit-tested. |

Every equation has a concrete home. `d_coast`, `LU`, and the radar cascade ((11)–(13)) are the
only items marked out of scope; each is a documented data-constraint omission with a named
fallback, **not** an unresolved "TBD".

---

## 3. The seam into `FusionEngine.run()`

Today `run()` does, per hour (`fusionEngine.ts:270–361`):

```
pull values → estimateLapseRate → applySpatialKernel(kTemp/kWindCloud/kPrecip) → speed rescale → (temporalMedian3) → encode PNGs
```

fusionV2 inserts a **residual-analysis branch** that reuses the hour-invariant fast-path
infrastructure (`positions[]`, precomputed kernels) but swaps the estimator:

1. **Split `positions[]`** into *background* members (grid/MOSMIX sources: `isStation=false`) and
   *observations* (`isStation=true`). This is a one-time partition on the existing flat array.
2. **Background `x_b(x,τ)`** — Phase 1: reuse the current model-only weighted IDW as a placeholder
   background (stations excluded). Phase 3: replace with the min-variance combination (2) + bias
   correction (4) + covariate `f` (5)/(6).
3. **Innovations `d = y − H(x_b + f)`** at station locations, H per eq. (7) (elevation-aware).
4. **Local OI per cell** (`oi.ts`, eq. (3)): k≤32 nearest obs under metric (8), B = σ_b²·ρ(d),
   R diagonal per network; one k×k Cholesky per cell → increment + `σ_a²` (15).
   **Positions are hour-invariant ⇒ neighbour lists and Cholesky factors are built once and reused
   across all H hours** (paper Sect. 4 identity (i); this is what keeps the ≤1.5× perf budget).
5. **`x_a = x_b + increment`**; wind speed rescaled (14); increment persisted across τ (10).
6. Encode PNGs unchanged (byte-compatible contract) + optional 5th σ PNG (Phase 5).

**Flag surface.** New `FusionConfig.fusionV2?: { oi?: boolean; bgMinVar?: boolean; bgOffDiag?:
boolean; incrementPersist?: boolean; uncertainty?: boolean }` (all default `false`). Threaded from
`FusedLoadOptions.fusionV2` through `loadFusedForecast` → `FusionEngine`. A dev toggle
(`window.__fusionV2` / `?fusionV2=oi,bg`) flips sub-flags at runtime for A/B without a rebuild,
matching the repo's `import.meta.env.DEV` + `window.__*` convention. **When all sub-flags are off,
`run()` is byte-for-byte the current path** — this is the "keep the IDW path fully intact behind
the flag" guarantee (Rule 2).

**quickMode / Phase-A degradation.** The OI path honours `quickMode`: reduced `k` (≤8), skip the
Desroziers refresh (use shipped params as-is), skip off-diagonal Σ, skip the σ layer. Falls back to
the intact IDW path if params fail to load (graceful degradation, paper Sect. 6 "archive
dependence").

---

## 4. Client parameter-artifact format

The client performs **estimation, never learning** (paper Sect. 4). Offline Node scripts write
small versioned JSON to `public/params/`; the engine `fetch`es them once (cached like the DEM).

- **`public/params/oi-v1.json`** — `{ version, trainedWindow, perVariable: { t2m|wind|speed|precip|cloud: { Lh_km, Lv_m, invContractLv, sigma_b, Tv_h, inflation } }, perNetwork: { dwd|tawes|smn: { sigma_o } }, soarRho: "(1+d)e^{-d}" }`. From Desroziers (9) + LOSO (16).
- **`public/params/background-v1.json`** — `{ version, trainedWindow, sigmaTau: { variable: { [tau]: MxM matrix } }, shrinkageLambda, biasTables: { model: { station: { [tau]: e_bar } }, regionBias: { model: { terrainClass: { [tau]: e_bar } } } }, shrinkageK }`. From (2)/(4).
- **`public/params/desroziers-v1.json`** — raw innovation accumulators (audit/diagnostic; `oi-v1.json` is the distilled product).

Sizes: per-station bias tables + M×M covariances over 4 variables × 8 leads = kilobytes, well
under the paper's <1 MB budget. Filenames carry the version so a param refresh is a cache-busting
swap. Missing/short archive ⇒ shrinkage path falls back to named priors (`γ₀=0.0065`, `Lh=60 km`,
`Lv=500 m`, diagonal Σ = inverse-MSE).

---

## 5. Verification instrument (Phase 2, built before any fitting)

- `scripts/verify-loso.ts` — leave-one-station-out CRPS (17) + MAE, per variable × lead ×
  terrain class (TPI from DEM), paired block-bootstrap CIs over days. Runs on a **recorded fixture
  set** (`fixtures/` — one real fetch session captured, replayed offline; no live-API dependence).
- `scripts/desroziers.ts` — innovation-statistics accumulator (9) → JSON.
- **Baselines (Decision A):** the harness scores, per variable × lead × terrain class, at minimum:
  raw ICON-D2 bilinear, MOSMIX at its own stations, INCA (precip, AT, ≤4 h), persistence, the IDW
  ablation (v2 with B/R heuristic), **and the raw native ICON-D2 fields as the incumbent per-variable
  baseline** that Phase 6 cutover is judged against.
- **Cross-source check** — at common locations/hours compare v2 output against the untouched raw
  sources (MOSMIX points, AROME grid points, INCA in-domain, Open-Meteo if enabled); flag if v2
  drifts from *all* inputs simultaneously.
- This harness is the acceptance instrument for Phases 3–6 (every later gate is a LOSO table).

Execution model (see §7 Decision B): implemented as pure `.ts`/`.mjs` returning
`{checks, passed, failed}`, run via Node `--experimental-strip-types` (the existing
`scripts/verify-aec.mjs` precedent) plus in-browser dev globals for the OI unit checks — **no new
test-runner dependency**, unless the "Vitest" requirement is confirmed as literal (Rule 5).

---

## 6. Risk list

**Numerical.**
- k×k Cholesky ill-conditioning in float32 when two obs nearly coincide under metric (8) → add
  diagonal jitter (∝ σ_o²) and solve the k×k system in **float64** (paper allows this deviation,
  Rule 8; document in phase report). SOAR `ρ` is positive-definite so B is well-posed with jitter.
- log/logit transforms for precip/cloud (bounded, non-Gaussian): analyse precip in `log(1+p)`,
  cloud in logit with censoring at bounds; zero-rain as censored value. Deviation from raw-space
  IDW documented.
- Degenerate `L_v` during inversion halving must stay clamped > 0.

**Performance.**
- Naïve `O(n·k³)` per hour × 24 h would blow the budget. Mitigation = the hour-invariant identity:
  factorize each cell's k×k B once, reuse the Cholesky across all hours (only the RHS innovations
  change). Target: full 160×128 × 24 h ≤ **1.5×** current engine time (Phase 1 gate, before/after
  table required).
- Neighbour search under (8) precomputed once (static station positions), reusing the existing CSR
  machinery.

**Visual / behavioural regression.**
- OI field ≠ IDW field near sparse stations; coverage-mask (`alpha`) semantics must stay identical
  (Phase 1 gate asserts NaN/coverage parity). PNG channel encodings byte-compatible until Phase 5
  explicitly versions in the 5th layer (contract change ⇒ Rule 3 hard stop, needs approval).

**Architecture / data (decision-bearing).**
- 2D layers bypass the engine today (native ICON-D2) — §7 Decision A.
- No Vitest — §7 Decision B.
- `d_coast`/`LU` covariates, RADOLAN-advection, AIFS/AICON: out of scope (no integrated pipeline);
  any need triggers a propose-and-stop (Rule 3a).

---

## 7. Decisions (RESOLVED 2026-07-01)

**Decision A — cutover target: RESOLVED → defer to Phase 6, per-variable, evidence-gated.**
Build the estimation engine (Phases 1–5) behind the flag now; the final layer wiring is decided at
the Phase 6 hard-stop gate. Two binding additions from the decision:
- **From Phase 2 on, the LOSO harness must score the raw native ICON-D2 fields as a separate
  per-variable baseline** (alongside the raw-source baselines already required). This is the
  incumbent that fusionV2 must beat to earn a layer.
- **Phase 6 cutover rule:** fusionV2 takes over a given layer *only where it beats the native source
  it would replace on **both** LOSO score **and** perf budget*. A **per-variable** outcome is
  explicitly acceptable (e.g. v2 wins temperature but not wind) and must be reported as such — no
  all-or-nothing cutover.

**Decision B — test runner: RESOLVED → Node `--experimental-strip-types` + in-browser dev globals.**
No new dependency. Phase gates are pure `.ts`/`.mjs` harnesses returning `{checks,passed,failed}`
with a non-zero exit on failure (the `scripts/verify-aec.mjs` precedent), plus `window.__*` dev
globals for OI unit checks (the `verifySamples.ts` / `__bsQA` precedent). "The suite is green" =
these harnesses exit 0.

Both decisions leave the equation mapping and Phases 1–5 fully specified. The native-ICON-D2
baseline requirement is folded into §5 (Phase 2 verification instrument).

### Phase 3 binding constraints (2026-07-02)

- **C1 — Licensing: training vs verification split, enforced IN CODE.** Open-Meteo (free tier,
  non-commercial) data must **never** flow into a shipped parameter artifact
  (`background-v1.json` bias tables / Σ(τ), `oi-v1.json` Desroziers R). Fixtures are captured with
  `useOpenMeteo:false` for training; an Open-Meteo-tagged fixture is admissible for harness
  comparison / cross-source checks **only**. Implementation: every sample carries a `provenance`
  tag; `captureFixture` marks Open-Meteo samples `'open-meteo'`; the archive loader used by all
  training scripts strips them; the artifact writer **asserts** no `'open-meteo'` sample reached the
  fit (throws otherwise). Not dependent on the operator remembering.
- **C2 — Short-archive behaviour.** Start with 2–3 sessions, growing daily. With n≈1–5 innovations
  per station, eq. (4) shrinkage correctly pulls almost everything to regional priors ⇒ expect small
  / non-significant early LOSO gains. Rules: (a) the **off-diagonal Σ** sub-flag (`bgOffDiag`) stays
  **OFF** until the archive supports it; (b) if the Phase 3 gate fails **because of sample size**
  rather than method, that is a **STOP with the diagnosis "archive too short"** — never re-tune
  weights or weaken the gate to pass. The fit reports its per-cell effective sample size so the
  cause is unambiguous.
- **C3 — Fixtures are a versioned archive.** Session files live under `fixtures/` and are committed.
  All fit / LOSO scripts accept a **directory** of sessions (not a single file); re-fitting on the
  growing archive is one command. Bootstrap block key = session/day across the archive.
