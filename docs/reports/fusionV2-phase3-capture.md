# fusionV2 — Phase 3 Capture & Real-Archive Report

> Scope (your authorization under Rule 5, narrowly): a Node capture hitting the same integrated
> endpoints; an equivalence gate (browser vs Node) that blocks the fit until it passes; hourly
> scheduled collection; then capture + run the real pipeline and the Phase 3 gate — expecting an
> "archive too short" STOP for the fit while continuing everything not blocked by archive size.

## 1. Node capture (`scripts/capture-fixture.mjs`) — same endpoints, zero drift

- Imports the **real app adapters** (`brightSkyCurrent`, `brightSkyForecast`, `geosphereArome`,
  `geosphereTawes`, `meteoSwissSmn`, and Open-Meteo only under `--with-openmeteo`) and the **shared**
  `assembleCapture` (`src/fusion/fixtureBuild.ts`, extracted from the browser hook), so a Node
  session and a browser session are structurally identical by construction. No new sources, no new
  npm dependency.
- The adapters use Vite-style extensionless imports; a built-in `node:module` resolve hook
  (`scripts/lib/{ts-hooks,register-ts}.mjs`, no dependency) lets Node import them unchanged.
- **DEM parity:** `scripts/lib/nodeElevation.mjs` decodes Terrarium tiles with the built-in
  `node:zlib` (a ~60-line PNG decoder — no dependency) and mirrors `elevation.ts`'s decode + bilinear
  exactly, so Node-filled model elevations match the browser's.
- `useOpenMeteo:false` is the default (training capture); `--with-openmeteo` tags the ICON-D2
  baseline `provenance:'open-meteo'` so it is stripped from training (C1) but usable for verification.
- New npm scripts: `capture`, `fusion:train`, `fusion:loso`, `fusion:desroziers`, `fusion:verify`.

**Live capture (2026-07-02T14:00Z):** 339 stations (dwd=59, tawes=200, smn=80), 292 background
samples (mosmix+arome), DEM 4 Terrarium tiles, ~3 s → `fixtures/session-…Z.json`.

## 2. Equivalence gate (`scripts/equivalence-check.mjs`) — enforced in code

Compares a browser reference and a Node capture for one validTime: schema, `meta.bounds`, provenance
distribution, station sets (id → position exact, truth within fetch-timing tolerance), and background
parity (positions + **DEM elevation** + values). On PASS it writes `fixtures/.equivalence-passed`;
`train-background.mjs` **refuses to write `public/params/`** without that marker (it emits a
`background-provisional.json` instead). So no fitted artifact can ship until browser≡Node is proven —
independent of anyone remembering. (Self-smoke confirmed the checker runs and gates; the marker was
removed — a real browser capture from you is still required to unlock shipping.)

**→ Action for you:** capture one browser reference (`await window.__captureFusionFixture()`), then
`node scripts/equivalence-check.mjs <browser.json> fixtures/session-<sameTime>.json`. If it passes,
shipping unlocks automatically.

## 3. Hourly scheduled collection (archive grows with no session running)

- Windows Task Scheduler task **`BuscosunFusionCapture`** registered (per-user, hourly, `Ready`,
  next run confirmed) → runs `scripts/capture-hourly.ps1` (sets `NODE_NO_WARNINGS`, judges success by
  exit code, logs to `fixtures/capture.log`). Remove with `schtasks /Delete /TN BuscosunFusionCapture /F`.
- Cron alternative: `scripts/capture-hourly.sh` (`0 * * * * /abs/path/scripts/capture-hourly.sh`).
- **Name separation:** real sessions are `session-<validTime>.json` (committed archive seed, C3);
  synthetic/derived files are `*-synthetic.json` / `background-provisional.json` / `desroziers-*.json`
  and are git-ignored (`fixtures/.gitignore`). The archive loader ingests `session-[^.]+\.json` only.

## 4. Real pipeline on the first session (τ=0)

**LOSO** (`fusion:loso`), 339 stations, MAE / CRPS:

| variable | OI | IDW ablation | background |
|----------|----|----|----|
| t2m | **1.015 / 0.784** | 1.303 | 1.588 |
| windSpeed | 1.405 / 1.155 | **1.308** | 1.437 |
| precip | 0.084 | 0.073 | **0.060** |

- **t2m: OI wins decisively** (vs IDW gain +0.288 CI [0.171,0.406]; alpine +0.559 CI [0.210,0.895]).
- **windSpeed: OI is *worse* than IDW** (gain −0.097, CI [−0.179,−0.012], significant) — with the
  Phase-1 prior `r=0.1` the OI over-trusts noisy wind obs.
- **precip:** OI/IDW slightly worse than raw background (raw space; log-transform is later).

**Desroziers** (`fusion:desroziers`) — real `r = σ_o²/σ_b²` per network:

| variable | σ_b | dwd r | tawes r | smn r |
|----------|-----|-------|---------|-------|
| t2m | 1.95 | 0.40 | 0.19 | 0.27 |
| windSpeed | 1.46 | 0.24 | 0.71 | 0.68 |
| precip | 0.41 | 1.47 | 0.003 | 0.000 |

This is the key finding: the **fitted wind `r` (0.24–0.71) is far above the 0.1 prior** — trusting wind
obs *less* is exactly what fixes the wind regression above. Phase 3's job (fit `r`) is validated by
its own diagnostic. (These estimates are network-pooled, so `r` is estimable from one session even
though per-station bias tables are not.)

## 5. Phase 3 gate (`scripts/phase3-gate.mjs`) — fitted min-var vs heuristic background

| variable | fit MAE | heur MAE | gain | 95% CI | fitted ≤ heur | effN |
|----------|---------|----------|------|--------|---------------|------|
| t2m | 1.5975 | 1.6489 | +0.051 | [0.027, 0.076] | ✓ | 1 |
| windSpeed | 1.4439 | 1.4413 | −0.003 | [−0.008, 0.003] | ✗ | 1 |
| precip | 0.0595 | 0.0596 | +0.0001 | [0.000, 0.0002] | ✓ | 1 |
| cloud | — | — | — | — | (no obs truth) | 0 |

Fitted min-variance weighting already beats equal-weight on t2m (significant); windSpeed is a
non-significant tie; cloud has no station truth this session.

### GATE VERDICT — ⛔ STOP: ARCHIVE TOO SHORT

A single analysis capture provides only τ=0 truth (no h=1..6) and effN≈1 per station, so the full
gate ("fitted ≤ heuristic on every variable at h=0..6") **cannot be met on this archive**. Per
constraint C2 this is the **expected STOP with diagnosis "archive too short" — NOT a method failure,
and not to be worked around by re-tuning** (the windSpeed non-pass is left exactly as measured). The
`background-provisional.json` is withheld from `public/params/` by the equivalence gate regardless.

## 6. What continues autonomously (not blocked by archive size)

Done this pass: capture tooling, DEM decoder, equivalence gate, scheduler, npm scripts, and the
provisional fit + honest gate. The scheduled task now grows the archive hourly. **Refit + re-gate is
a single repeatable command** as it matures:

```
npm run capture                 # (or wait for the hourly task)
node --experimental-strip-types scripts/phase3-gate.mjs fixtures/     # re-run the gate
node --experimental-strip-types scripts/train-background.mjs fixtures/ # refit (ships once equivalence-passed)
```

## Remaining (archive-blocked)

- The real Phase 3 fit/ship + wiring `bgMinVar` live — unlocked by (a) the equivalence gate passing
  with your browser reference and (b) the archive maturing (multi-session, ideally multi-lead across
  radiation-night / mixed / frontal regimes).
- Then Phases 4 (increment persistence + wind-speed, eqs 10/14 — the wind `r` refit should help), 5
  (uncertainty, eq 15), 6 (per-variable cutover).

## Files added / changed

- **added:** `src/fusion/fixtureBuild.ts`, `scripts/capture-fixture.mjs`, `scripts/equivalence-check.mjs`,
  `scripts/phase3-gate.mjs`, `scripts/capture-hourly.ps1`, `scripts/capture-hourly.sh`,
  `scripts/lib/nodeElevation.mjs`, `scripts/lib/ts-hooks.mjs`, `scripts/lib/register-ts.mjs`,
  `fixtures/.gitignore`, `fixtures/session-2026-07-02T14-00-00-000Z.json` (first real archive seed),
  `docs/reports/fusionV2-phase3-capture.md`
- **changed:** `src/fusion/captureFixture.ts` (uses shared build), `scripts/train-background.mjs`
  (dir glob fix + shape guard + equivalence-gate marker), `scripts/desroziers.mjs` (artifact naming),
  `package.json` (npm scripts). Registered Task Scheduler `BuscosunFusionCapture`.

## Proposed commit messages

- `feat(fusionV2): shared grid→fixture builder for browser/Node capture parity (fixtureBuild.ts)`
- `feat(fusionV2): Node capture hitting the real adapters + zlib Terrarium DEM (no new dep)`
- `feat(fusionV2): equivalence gate — browser≡Node blocks shipping a fit (enforced in code)`
- `feat(fusionV2): hourly capture scheduler (Task Scheduler + cron) growing fixtures/`
- `feat(fusionV2): Phase 3 gate script (fitted min-var vs heuristic, per-variable)`
- `fix(fusionV2): archive glob + Desroziers artifact naming; short-archive guard`
- `chore(fusionV2): capture/train/loso npm scripts; fixtures/.gitignore`
- `docs(fusionV2): Phase 3 capture report — real τ=0 results + archive-too-short STOP`
