# fusionV2 — Phase 5: Uncertainty σ layer (eq. 15) — Rule 3b approved

> You approved the PNG-contract change (Rule 3b): wire the fifth σ PNG as an optional layer and
> document the contract in the spec. Done, validated live, gate passing on synthetic **and** real data.

## What was implemented (eq. 15)

- **Optional fifth σ PNG.** `fusionV2.uncertainty` (requires `oi`) emits a per-hour temperature
  σ layer. **Off by default → the four existing layers are byte-identical** (additive, optional):
  `FusedHour.layers.uncertainty?` / `DwdForecastResult.hours[].layers.uncertainty?`.
  - Analysis (τ=0): `σ_a = √(varRatio)·σ_b`, varRatio = 1 − ρ_cᵀC⁻¹ρ_c straight from `oi.ts`
    (0 at a station, growing with metric distance).
  - Forecast (τ>0): `σ² = σ_a²·e^{−2τ/T} + σ_b²(1−e^{−2τ/T})` — σ_a relaxing toward σ_b with lead.
  - Encoding: R = σ/σ_max·255 with **fixed** σ_max = 6 °C (R comparable across hours), G=B=0,
    alpha = temp-background coverage; variable tag `uncertainty_t2m`.
- **σ_b, T_v are provisional priors** (`OI_PRIORS.t2m`: 1.5 K, 4 h); a single inflation factor is
  admitted and now measured by the harness.
- **Documented deviation (Rule 8):** the literal multi-model spread term Σ_m w_m(x̃_m−x_b)² is
  provisionally approximated by σ_b²(1−e^{−2τ/T}) until per-model grids are carried. Spelled out in
  `docs/fusion-forecast-spec.md` §9.1 (the 5th-PNG contract).
- **Spread–skill / calibration in the harness** (`loso.ts:spreadSkill`, surfaced in `verify-loso`):
  corr(σ, |error|), coverage@1σ, fitted inflation, and a 10-bin PIT rank histogram.

## Gate results (Phase 5)

| gate criterion | result |
|----------------|--------|
| spread–skill corr > 0 on the fixture set | ✅ **synthetic 0.385, real session 0.303** |
| PNG contract documented in the spec | ✅ `fusion-forecast-spec.md` §9 table + §9.1 |
| single inflation factor fitted | ✅ measured (synthetic 0.69, real **1.75** → σ under-dispersed with the 1.5 prior) |
| existing 4-layer contract unchanged when off | ✅ live-verified |

Real-session calibration: coverage@1σ = 0.555 (target ≈ 0.683), rank histogram U-shaped
[56,25,22,19,24,33,33,27,32,55] → σ under-dispersed with the prior σ_b; the fitted inflation ≈1.75
(≈ real σ_b 1.95 / prior 1.5) is exactly the correction the archive fit will bake in. The **gate
metric (positive spread–skill) passes on real data now**; parameters remain provisional.

## Bug caught by the live smoke test

The result-cache key encoded only the `oi` flag, so toggling `uncertainty` (or `incrementPersist`)
returned a stale cached result without σ. Fixed: the key now encodes **all** fusionV2 sub-flags
(`o/p/u/b/d`). Live re-test then confirmed: flag-off → no σ (4 layers intact); flag-on → σ at every
hour, `{vMin:0, vMax:6, variable:'uncertainty_t2m'}`.

## Verification

- `npm run typecheck` clean; `npm run build` clean.
- `npm run fusion:verify` → 11/11 (OI) + 15/15 (background) + 15/15 (Phase 4/5).
- `verify-loso` synthetic → PASS (now includes the spread–skill gate).
- Live in-browser: `loadFusedForecast({ fusionV2:{ oi:true, uncertainty:true }})` emits the σ layer
  per hour; `{ oi:true }` alone does not.

## Files changed / added

- **changed:** `src/fusion/fusionEngine.ts` (σ flag + emission), `src/fusion/loadFusedForecast.ts`
  (cache-key fix), `src/wind/brightSkySource.ts` (optional `uncertainty` in `DwdForecastResult`),
  `src/fusion/loso.ts` (`spreadSkill`), `scripts/verify-loso.mjs` (spread–skill gate),
  `docs/fusion-forecast-spec.md` (§9 + §9.1 σ contract)
- (Phase-5 machinery `src/fusion/uncertainty.ts` was added in the prior run.)

## Status & remaining

Phase 5 σ-layer is **wired and gate-passing on the fixture set** with provisional priors. Remaining
is archive-gated / approval-gated, unchanged:
- Refit σ_b / T_v / inflation from the maturing archive (replaces the priors; `verify-loso` already
  reports the inflation to apply).
- Rendering the σ layer as a live **2D map layer** is part of the Phase 6 per-variable cutover (the
  2D layers currently use native ICON-D2) and needs your explicit go.

## Proposed commit messages (append to the existing list)

- `feat(fusionV2): optional fifth σ PNG uncertainty layer (eq 15) behind fusionV2.uncertainty`
- `fix(fusionV2): encode all v2 sub-flags in the result-cache key (σ/persist were aliased)`
- `feat(fusionV2): spread–skill + rank-histogram + fitted inflation in LOSO harness (Phase 5 gate)`
- `docs(fusionV2): document the 5th σ-PNG contract in fusion-forecast-spec §9.1`
