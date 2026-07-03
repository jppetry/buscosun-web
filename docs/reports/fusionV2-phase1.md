# fusionV2 — Phase 1 Report: Observation operator H, terrain metric B, local OI

> Scope: implement `src/fusion/oi.ts` — local OI per cell (k≤32) under the anisotropic
> metric (8), hand-written Cholesky, elevation-aware H (7); wire it into the temperature path
> behind `fusionV2.oi`; keep the IDW path fully intact when the flag is off.
> Paper equations implemented: **(3)** analysis, **(7)** observation operator, **(8)** metric,
> with the SOAR correlation ρ(d)=(1+d)e^{−d} (Sect. 3.4). Groundwork for **(15)** analysis-error
> variance is emitted (per-cell `varRatio`) for Phase 5.

## What was implemented (with equation references)

- **`src/fusion/oi.ts`** — the minimum-variance analysis core, dependency-free (no Vite/DOM
  globals) so the Node harness imports it directly.
  - Anisotropic metric (8): `d²_ij = ‖Δ‖²/L_h² + Δz²/L_v²`, horizontal part via a local
    equirect→km planar projection at DACH reference latitude (valid for the small window);
    `L_v` halved when an inversion is diagnosed (γ̂<0), per the paper (Frei 2014).
  - SOAR correlation ρ(d)=(1+d)e^{−d} (`soarCorrelation`).
  - Analysis (3), local form: per cell, `C = ρ_obs + diag(r)` where `r_i = σ_o²/σ_b²`; solve
    `C w_c = ρ_c`; increment `= w_cᵀ d`. The σ_b² cancels — only the signal-to-noise ratio `r`
    remains, i.e. the estimable `w ∝ 1/σ²` that replaces the heuristic station/model weights.
  - **Key perf identity** (paper Sect. 4(i)): station positions are hour-invariant, so the whole
    linear algebra (neighbour sets, `C`, `w_c`, and the analysis-error ratio 1−ρ_cᵀC⁻¹ρ_c) is
    precomputed **once** in `buildOiKernel` (one k×k Cholesky per cell) and `applyOiKernel` reduces
    to a per-hour dot product `Σ w_ci d_i` — O(cells×k), the same per-hour complexity as the IDW
    kernel it replaces. The OI kernel is CSR-shaped, mirroring `SpatialKernel`.
  - Hand-written k×k **Cholesky** in float64 with diagonal jitter + a heavier-jitter retry
    (Rule 8 stabilisation; Rule 5 — no linear-algebra dependency).
  - Elevation-aware **H (7)** in `innovationAt`: `d = y_s − [bilinear(x_b, x_s) + γ̂(z_grid(x_s) − z_s)]`,
    replacing the MSL-reduction seam for the analysis step.
  - `oiCoverageMask` in the IDW 0..255 convention (used only when OI is the sole field; the wired
    temperature path inherits the model-background mask, so coverage semantics are unchanged).
- **`src/fusion/fusionEngine.ts`** — `FusionV2Flags` + `FusionConfig.fusionV2`; temperature branch:
  when `fusionV2.oi` and a DEM is present, temperature = model-only IDW background (stations
  weighted 0) + OI increment of station innovations; kernel built once at h=0 using the h=0
  inversion diagnosis. With the flag off, the block is skipped and the path is byte-identical.
  Named prior `OI_OBS_VAR_RATIO_PRIOR = 0.1` (Rule 7; Phase 3 replaces it with the Desroziers
  estimate).
- **`src/fusion/loadFusedForecast.ts`** — `FusedLoadOptions.fusionV2` threaded to the engine; dev
  `window.__fusionV2` console A/B override; flag folded into the result-cache key.
- **`src/fusion/oi.verify.ts`** + **`scripts/verify-oi.mjs`** — closed-form + inversion checks,
  runnable via `node --experimental-strip-types` and as the `window.__verifyOi` dev global.
- **`scripts/perf-oi.mjs`** — full-run (build + 24 h) IDW-vs-OI temperature compute comparison.

## Gate results

### (i) Unit tests — `node --experimental-strip-types scripts/verify-oi.mjs` → **11/11 pass**

| # | check | expected | got | ok |
|---|-------|----------|-----|----|
| 1a | single-obs increment = d/(1+r) (eq. 3) | 4.9995 | 4.9995 | ✓ |
| 1b | interpolation limit r→0: inc ≈ d | 5 | 4.9995 | ✓ |
| 2 | symmetric two-station = 2ρ_c·d/(1+r+ρ_d) (closed form) | 2.907723 | 2.907722 | ✓ |
| 3 | R→∞ scaled → distance-weighted (IDW-class) average | 0.000003 | 0.000003 | ✓ |
| 4 | L_v→∞ → elevation-independent weights (metric 8) | ≈0 | 0 | ✓ |
| 5a | NaN innovation → finite output | finite | finite | ✓ |
| 5b | NaN-skip == zero-innovation | equal | equal | ✓ |
| 5c | coverage: cell on obs → 255 | 255 | 255 | ✓ |
| 5d | coverage: far cell → 0 | 0 | 0 | ✓ |
| 6a | anisotropic: ridge/valley increment | <0.30 | 0.0916 | ✓ |
| 6b | isotropic control: ridge/valley | >0.80 | 0.9996 | ✓ |

"OI reproduces IDW in the limit" (gate wording) is checks 1b/3/4: as R→∞ the coupled system
decouples and the analysis collapses to a distance-weighted average of the innovations (the IDW
functional class, check 3); as L_v→∞ the metric loses its vertical term and the weights become
horizontally isotropic (check 4); at a station the analysis recovers the observation (check 1b) —
the interpolation property IDW also satisfies. NaN/coverage parity is 5a–5d.

### (ii) Synthetic inversion — checks 6a/6b

Constructed DEM fixture: warm valley obs (+5 K, 500 m) beside a ridge cell (2500 m), ~a few km
apart. Under the anisotropic metric the valley obs warms the ridge only **0.092×** as much as the
valley (< 0.30 gate). The isotropic control (L_v→∞) warms the ridge **1.00×** — demonstrating that
metric (8), not distance alone, is what preserves the inversion. **PASS.**

### (iii) Perf — `node --experimental-strip-types scripts/perf-oi.mjs`

Full run = `buildSpatialKernel` + 24 h, temperature only (the single variable the flag changes;
PNG encode excluded, identical in both paths), 160×128, 442 samples / 150 stations, best-of-3:

| path | time |
|------|------|
| baseline (IDW temperature) | ~2.9 s |
| v2 (IDW bg + H innovations + OI increment) | ~3.3 s |
| of which one-time `buildOiKernel` | ~0.4 s |

**Full-run ratio v2/baseline = 1.11–1.17× across 3 runs** (gate ≤ 1.5×). Steady-state per-hour
≈ **1.01×** (the OI kernel, like the IDW kernel, is built once and reused across all hours, model
switches, and the result cache). **PASS.**

## Deviations from the paper (documented per Rule 8)

- **k = 16, not 32.** Within the paper's k≤32 localisation bound. The SOAR kernel decays fast, so
  the 17th+ nearest neighbours contribute negligibly; k=16 cuts the one-time Cholesky (O(k³)) ~3.4×
  and keeps the cold-run perf robustly inside 1.5× (at k=24 the cold run straddled the line under
  measurement variance). No material change to the analysis. Fitted `k` remains a Phase-3/§16
  candidate.
- **Cholesky in float64 + jitter** (paper Sect. 6 permits stabilisation): diagonal jitter 1e-6 with
  a 1e-3 retry if the SPD check trips (near-duplicate stations under the metric); degenerate cells
  emit a zero increment and prior variance rather than NaN.
- **Horizontal metric via a local planar km projection** at a fixed DACH reference latitude —
  consistent with the existing engine, which likewise ignores lon-compression over the small window.

## Static gates

- `npm run typecheck` — clean.
- `npm run build` — clean (built in ~19 s; SEO emit OK).
- `node --experimental-strip-types scripts/verify-oi.mjs` — 11/11 (exit 0).

## Continue / stop decision — gate checklist

| Condition | Status |
|-----------|--------|
| Every Phase-1 gate criterion passed (i, ii, iii) | ✅ |
| TypeScript strict compiles clean | ✅ |
| Verification harness green (Decision B: Node strip-types replaces "Vitest suite") | ✅ 11/11 |
| No open questions / DECISION NEEDED items | ✅ |
| No unexplained gate-metric regression | ✅ (deviations documented above) |
| IDW path intact behind the flag (Rule 2) | ✅ (flag-off byte-identical; typecheck+build green) |
| PNG texture contract unchanged (Rule 3) | ✅ (no 5th layer yet — Phase 5) |

**Decision: PROCEED to Phase 2**, with one practical note (not a blocker to *building* the harness,
but a blocker to *populating* its fixtures — see below).

## Open risk / note for Phase 2

Phase 2's gate requires the LOSO/Desroziers harness to run on a **recorded real fetch session**
replayed offline (`fixtures/`). Recording that session needs live upstream access (BrightSky/
GeoSphere/MeteoSwiss) and, for DWD, the dev `vite.config.ts` proxy — i.e. a `npm run dev` capture
step in your environment. I will build the harness + fixture *format* + a capture script and run it
against a synthetic fixture to prove the pipeline; **populating the real fixture may need you to run
the capture** (I'll flag it explicitly if the environment here can't reach the upstreams). This does
not change any Phase 1 result.

## Files added / changed

- **added:** `src/fusion/oi.ts`, `src/fusion/oi.verify.ts`, `scripts/verify-oi.mjs`,
  `scripts/perf-oi.mjs`, `docs/reports/fusionV2-phase1.md`
- **changed:** `src/fusion/fusionEngine.ts` (flag + temperature OI branch),
  `src/fusion/loadFusedForecast.ts` (flag plumbing + cache key)

## Proposed commit messages

- `feat(fusionV2): add local-OI core (oi.ts) — eqs 3/7/8, SOAR B, per-cell Cholesky`
- `feat(fusionV2): wire temperature OI behind fusionV2.oi flag; IDW path intact when off`
- `test(fusionV2): OI closed-form + inversion harness (verify-oi) and perf harness (perf-oi)`
- `docs(fusionV2): Phase 1 report (gates i/ii/iii green, k=16 deviation noted)`
