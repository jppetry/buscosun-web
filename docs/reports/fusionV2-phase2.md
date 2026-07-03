# fusionV2 — Phase 2 Report: Verification harness FIRST (LOSO / CRPS / Desroziers)

> Scope: build the acceptance instrument before any statistical fitting —
> `verify-loso` (eqs 16/17), `desroziers` (eq 9), cross-source consistency, and the native
> ICON-D2 per-variable baseline (Decision A). Gate: harness runs on a recorded fixture set,
> replayed offline (no live-API dependence), and produces the IDW-vs-OI comparison table.

## What was implemented (with equation references)

Pure logic lives in `src/fusion/` (typechecked + browser-usable); thin `.mjs` drivers run it under
Node `--experimental-strip-types` (Decision B — no Vitest).

- **`src/fusion/crps.ts`** — Gaussian CRPS closed form **(17)** + MAE, normal cdf via A&S erf.
  Reduces to MAE as σ→0. Self-checked: `CRPS(N(·),σ=0)=|y−μ|=2`, `CRPS(N(0,1),y=0)=2φ(0)−1/√π=0.23369`.
- **`src/fusion/fixture.ts`** — the fixture schema (stations w/ truth, model `background`, native
  `icond2` field, meta) + a deterministic **synthetic generator**: a smooth synoptic field plus a
  mesoscale warm anomaly and a rain patch the coarse models omit and a valley inversion pocket —
  the exact sub-grid structure OI should recover from stations. No live API.
- **`src/fusion/predictors.ts`** — point predictors sharing ONE background + ONE innovation set,
  differing only in obs assimilation → the paper's ablation (Sect. 5, baseline v):
  `oi` (x_b + OI increment, eqs 3/7/8, + σ_a from eq. 15), `idw` (Barnes-weighted innovations = OI
  with B,R replaced by the heuristic weights), `icond2` (raw native ICON-D2 bilinear — Decision A),
  `background` (x_b only). Elevation-aware IDW-at-point for t2m.
- **`src/fusion/loso.ts`** — leave-one-station-out **(16)**: per variable × terrain class × predictor,
  MAE + CRPS, with **paired block-bootstrap 95% CIs** on the OI-vs-baseline MAE gain (block = station
  this session; = day for an archive). Terrain via a station-network **TPI proxy** (deviation, below).
  Plus the **cross-source consistency** check (OI − each raw source; flags same-sign >3 K drift from
  ALL sources at once).
- **`src/fusion/desroziers.ts`** — innovation statistics **(9)**: σ_o² per network, σ_b² (background),
  `r = σ_o²/σ_b²` → JSON. This is what Phase 3 promotes to `public/params/oi-v1.json` to replace the
  Phase-1 prior `r`.
- **`src/fusion/captureFixture.ts`** — dev-only browser hook `window.__captureFusionFixture()` that
  records a **real** session from the production adapters (BrightSky/GeoSphere/MeteoSwiss + optional
  Open-Meteo `icon_d2` baseline) and downloads it in the fixture schema. Reusing the real adapters
  avoids any Node re-implementation/drift.
- **Drivers:** `scripts/verify-loso.mjs`, `scripts/desroziers.mjs`.

## Gate results

### Harness runs offline on a fixture, produces the IDW-vs-OI table — **PASS (synthetic)**

`node --experimental-strip-types scripts/verify-loso.mjs` (no live API), 140 stations:

LOSO scores (terrain=all), MAE / CRPS:

| variable | OI | IDW (ablation) | ICON-D2 | background |
|----------|----|----|----|----|
| t2m | **0.369 / 0.286** | 0.602 / 0.602 | 1.028 | 1.134 |
| windSpeed | **0.189 / 0.139** | 0.300 | 0.477 | 0.506 |
| precip | 0.034 / 0.030 | 0.033 | 0.036 | 0.039 |
| cloud | **2.755 / 2.136** | 4.515 | 9.744 | 10.219 |

OI beats every baseline where stations carry recoverable signal (t2m, windSpeed, cloud); precip is a
near-tie in raw space (models under-resolve the patch; the log-transform is Phase 3). CRPS < MAE for
OI (probabilistic credit from σ_a). Block-bootstrap CIs exclude 0 for t2m/windSpeed/cloud vs all
baselines at `terrain=all`; alpine t2m-vs-IDW is **not** significant (CI [−0.013, 0.391], small n) —
reported honestly. Cross-source deviations: OI − {mosmix −0.59, arome −0.11, icon_d2 −0.37} K (OI
correctly tracks a cool bias-correction), **drift flags = 0**.

Desroziers (`scripts/desroziers.mjs` → `fixtures/desroziers-synthetic.json`): t2m σ_b≈1.39 K,
σ_o≈0.27–0.39 K, `r`≈0.04–0.08 (obs strongly trusted) — sensible, and the exact artifact Phase 3
consumes.

### Native ICON-D2 baseline (Decision A) — **DONE.** Scored as its own per-variable column above.

## Deviations (Rule 8)

- **Terrain class via station-network TPI proxy** (z_s − mean z of stations within 40 km), not DEM
  TPI: the Node harness has no PNG decoder for Terrarium tiles (Rule 5 — no new dep), and a
  network-relative TPI is arguably the more verification-relevant quantity at station scale.
- **Precip/cloud scored in raw space** (clamped to bounds); the log/logit transforms are Phase 3.
- **Single-session block = station**; an archive uses day-blocks (the block key is pluggable).

## Static gates

- `npm run typecheck` — clean.
- `npm run build` — clean (~11 s).
- `node …/verify-loso.mjs` — PASS (CRPS self-check + synthetic discrimination + no-drift).
- `node …/desroziers.mjs` — artifact written.

## Continue / stop decision — gate checklist

| Condition | Status |
|-----------|--------|
| Harness built + runs offline, IDW-vs-OI table produced | ✅ (synthetic) |
| CRPS(17)/MAE, LOSO(16), Desroziers(9), cross-source, ICON-D2 baseline | ✅ all present + validated |
| TypeScript strict clean; harnesses green | ✅ |
| **Gate clause "record one real fetch session to fixtures/"** | ⛔ **PENDING your capture** |

**Decision: STOP for the real-fixture capture.** The harness, the offline replay, and the IDW-vs-OI
table are complete and green on the synthetic fixture — but the gate explicitly requires a *recorded
real session*, and Phase 3's gate ("fitted weights ≤ heuristic on every variable") would be
**circular/meaningless if fit and scored on synthetic data**. Fitting the background weights (eqs
2/4) and the Desroziers `r` on real innovations is the whole point. So this is the correct place to
hand back — exactly the dependency flagged in the Phase 1 report, and the reason you chose "build
harness + capture script now."

## DECISION NEEDED / action requested

Capture one (ideally a few, across hours/regimes) real session so Phase 3 can fit and score:

1. `npm run dev`, open the app (any map view so the fusion chunk loads).
2. In the console: `await window.__captureFusionFixture({ useOpenMeteo: true })`
   (`useOpenMeteo` captures the ICON-D2 baseline via Open-Meteo; omit it if you'll substitute the
   native GRIB2 ICON-D2 grid). A `session-<validTime>.json` downloads.
3. Move it into `fixtures/`, then verify offline:
   `node --experimental-strip-types scripts/verify-loso.mjs fixtures/session-<…>.json`
   `node --experimental-strip-types scripts/desroziers.mjs   fixtures/session-<…>.json`
4. Send me the two console outputs (or commit the fixture) and I'll start Phase 3 fitting against it.

If you'd rather I attempt the capture from this environment, say so and I'll try (it needs live
upstream + the dev DWD proxy, which may not be reachable here).

## Files added / changed

- **added:** `src/fusion/crps.ts`, `src/fusion/fixture.ts`, `src/fusion/predictors.ts`,
  `src/fusion/loso.ts`, `src/fusion/desroziers.ts`, `src/fusion/captureFixture.ts`,
  `scripts/verify-loso.mjs`, `scripts/desroziers.mjs`, `docs/reports/fusionV2-phase2.md`,
  `fixtures/desroziers-synthetic.json` (generated)
- **changed:** `src/fusion/loadFusedForecast.ts` (dev-only side-effect import of the capture hook)

## Proposed commit messages

- `feat(fusionV2): CRPS(17)/MAE scoring + normal cdf (crps.ts)`
- `feat(fusionV2): fixture schema + deterministic synthetic session (fixture.ts)`
- `feat(fusionV2): LOSO predictors — OI vs IDW ablation vs ICON-D2 baseline (predictors.ts)`
- `feat(fusionV2): LOSO engine (16) with block-bootstrap CIs + cross-source check (loso.ts)`
- `feat(fusionV2): Desroziers (9) σ_o/σ_b accumulator (desroziers.ts)`
- `feat(fusionV2): dev browser capture hook for real verification fixtures (captureFixture.ts)`
- `test(fusionV2): verify-loso + desroziers drivers; synthetic gate green`
- `docs(fusionV2): Phase 2 report (harness green on synthetic; real capture pending)`
