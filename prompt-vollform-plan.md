# Kickoff-Prompt — Planungssession „buscosun Fusion: Vollform ohne Archiv"

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`, **Plan-Modus, kein Code**. Geschrieben am 2026-09-18
> nach der Bestandsaufnahme gegen `ABLAUFPLAENE.md` (gebaut ≈ 85 %, wirksam ≈ 65 %): sechs Lücken lassen sich
> ohne das Archiv schließen, der Rest ist Kalibrierung (AP10). Die Session liefert den Plan dafür; die
> Umsetzung beginnt erst nach Jans Freigabe. Prompts an Claude Code auf Englisch (CLAUDE.md).

```
You are starting a PLANNING session for phase FI ("buscosun Fusion on the point cube, 0–336 h,
answer < 2 s") in C:\dev\buscosun-web. Work in plan mode. No code, no commits, nothing pushed,
nothing into the data or archive repo. Measurements are allowed and expected (verifiers, the
latency harness, reading the data repo and the source directories); changes are not.

Goal: a plan that brings the DESIGN FORM of buscosun Fusion (ABLAUFPLAENE.md, PAP 1–6) to
100 % for everything that does NOT need the archive. Six gaps were identified on 18.09.; the
plan turns them into work packages AP13… with measured numbers, gates and an order. What stays
archive-bound (Σ-weighted fusion and bias correction in PAP 2, L_d/L_h/κ strength in PAP 3, φ
in PAP 4, A/A_uhi in PAP 5, σ_sys/c/confidence discounts in PAP 6) is NOT in scope — name it
once in the plan as "AP10", do not redesign it.

Read first, in this order:
1. The status block at the top of CLAUDE.md (AP12/AP11/§9.16 are done; AP9 is next and may be
   running in a parallel session; the tree was clean on 18.09. — check `git status`, never revert).
2. ABLAUFPLAENE.md — PAP 1 (terrain stack incl. d_water), PAP 3 (κ, neighbours), PAP 4
   (profile fields, cases A/B/C), PAP 5 (wind blending, z0 of the model side), Offene Punkte.
3. audit/fusion-implementierung.md — §0.3 (named deviations from the design), §1.1 (PAP ↔ data
   table), §3.3 (what would break the budget: chunk-border rule), §4 (AP table; E-F-2 halo),
   §7.1 risks (R5 chunk border, R6 profile only in t1, R10 jsDelivr 150-MB package limit),
   §7.2 decisions E-F-1…12 (all used — you continue at E-F-13), §9.5–§9.11 (how AP2–AP8 built
   PAP 3–6 and what they marked as `set`), §9.14 (progressive output `onUpdate`, plane ranges,
   V-FI-44 "18 planes unread"), §9.16.2 (z0 from WorldCover, per-cell class field, V-FI-57/58).
   Findings are numbered V-FI-1…61; V-FI-32…39 are reserved for AP9 — you continue at V-FI-62.
4. audit/punktdaten-umsetzungsplan.md — the U-15 row (profile substitute in t2 from
   t925/t850/t700, `provenance: "pressure-derived"`, t3 marked) and E-U-12 (no ICON-EU model
   levels: ≈ 3.9 GiB per t2 run). audit/punktdaten-bereitschaft.md — the profile row (t3 850
   alone vs E-E-4). audit/punktdaten-druckflaechen.md — PD-E: which pressure planes exist per
   tier (E-E-4 decided 15.09.: t3 carries 925/850/700 too).
5. Code: src/point/cubeFormat.ts (plane list: `t925/t850/t700`, `rh925/rh850/rh700` exist in
   t2 AND t3; the profile planes `gammaEff/zBase/zInv/dTInv` exist in the schema for every tier
   but are NaN outside t1; `cellOf/chunkOf`, 16×16 cells per chunk),
   scripts/point/profile.mjs (producer: profile fields from model levels, sign convention
   Γ = −∂T/∂z, self-test, `dzMin`/`gammaDepthM` as named calibration parameters),
   scripts/point/build-point-cube.mjs and scripts/point/adapters/* (where planes are filled),
   src/pointForecast/fusion/vertical.ts (cases, `stdLapseFallback`, `gammaImplausible`),
   src/pointForecast/fusion/grid.ts (`GRID_SET.kappa = 1`, comment "no land use per cell"),
   src/pointForecast/cubeSource.ts (the `wanted` plane list near line 1082 EXCLUDES
   t850/t700/rh850/rh700 today; `hasProfile` near line 323; the z0 blending and the late
   `onUpdate` emissions), src/point/terrainPoint.ts (`DWATER_MAX_M = 20_000`,
   `WORLDCOVER_WATER = 80`, `WORLDCOVER_Z0`), src/point/client/z0Point.ts (WorldCover class
   field at the point AND per model cell for t1/t2/t3, `SAMPLE_STEP_M`, mirror tiles, cost
   measured 18.09.: 1–4 tiles ≈ 100 KB each), src/point/client/terrain.ts (header: "d_water
   stays AP5"), src/point/client/chunkRanges.ts (plane ranges, default off, V-FI-42).
6. prompt.md — the AP9 kickoff (collector records the cube path, scorer against the archive,
   synthetic verifier). Item 6 below builds ON it; do not re-plan AP9.
7. scripts/verify-pv-latency.mjs (`--gate --only= --places= --profiles= --quick`; scenarios
   cube-cold / cube-cold-prog; run fields totalMs/firstMs/coreMs) and budget.json (totalJs
   ratchet 1 430, measured 1 427.6 ⇒ 2.4 KB headroom for new client code — any client-side
   item needs either that headroom or a ratchet decision by Jan).

────────────────────────────────────────────────────────────────────────────
Ground rules
────────────────────────────────────────────────────────────────────────────
• Plan mode. The deliverable is the plan text; on Jan's approval it is copied into the repo as
  `audit/fusion-vollform.md` (German, title "buscosun Fusion — Vollform ohne Archiv"), with the
  same skeleton as the FI plan: §0 Vorprüfung (measured numbers with their source), §1 per-item
  analysis, §2 design, §3 runtime and bytes budget, §4 work packages AP13…, §5 verification,
  §6 decisions E-F-13…, §7 risks, §8 definition of done. Every number measured or marked `set`;
  nothing carried forward (BW-1).
• S&F zones stay S&F: producer/publisher/manifest/schema/cron changes are Jan's gate; the plan
  says for every item whether it is local, S&F or J. Fusion-engine behaviour changes are inside
  the phase's approved scope only when default-off behind a flag with a named fallback (Rule 2)
  and byte-identical without it (negative control in the verifier).
• Provenance rule: only `measured` acts silently; everything you introduce as a start value is
  `set` (or `literature` with the reference) and lands in `calib[]` of the v2 output.
• Coordination: an AP9 session may own scripts/punktarchiv/** and §9.13 concurrently; your plan
  must not require touching those files before AP9 lands, and any producer change must stay
  readable by `lib/punktarchiv.mjs` and the AP9 replay (schema history, no silent plane semantics
  change — the archive keeps the planes int-coded and replays bit-identically).
• Never purge the CDN, never dispatch a cron, never push. Warm-up GETs are fine. Verifiers run
  without asking; PowerShell never with `2>&1`; Bash truncates at ≈ 8 KB (large files via the
  Write tool); `npm run` swallows `--` args ⇒ call scripts directly with
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …`; run cost gates
  alone (parallel verifiers make them red).
• Naming: "buscosun Fusion" everywhere; docs German; findings V-FI-62+, decisions E-F-13+,
  work packages AP13+ (AP0–AP12 are taken).

────────────────────────────────────────────────────────────────────────────
The six items — what exists, what the plan must decide, and measure
────────────────────────────────────────────────────────────────────────────
1. d_water (PAP 1, local). Exists: the class field z0Point.ts already loads, the constants in
   terrainPoint.ts, a `dwater` mention in cubeFormat.ts. Decide: the consumer first — read
   ABLAUFPLAENE for what d_water feeds (PAP 5 wind over water / blending, anything in T?) and say
   plainly if today no term would consume it (then it is output only until AP10). Search
   strategy within 20 km at 10-m pixels (ring search with growing step; which tiles beyond the
   point tile; minimum water-body size — class 80 includes rivers), cost off the critical path
   (late emission like z0, or computed with z0 in one pass), cache key, verifier with an
   analytic field (point on a lake shore, inland > 20 km ⇒ `null` not 20 000), bytes 0.
2. Profile fields in t2 and t3 (PAP 2 → PAP 4, S&F). Exists: t925/t850/t700 and rh planes in t2
   AND t3 (no new planes, 0 bytes); `profile.mjs` with the model-level derivation; runtime
   `vertical.ts` falls back to standard lapse with `stdLapseFallback`. Decide between (a)
   producer fills gammaEff/zBase/zInv/dTInv for t2/t3 from the pressure planes
   (`provenance: pressure-derived` in run.json, one derivation, archive replay stays exact) and
   (b) runtime derivation in cubeSource from the pressure planes (no producer gate, but the
   `wanted` list must then read t850/t700 — count the decode cost and the V-FI-44 interplay).
   Define the height assignment of the levels (standard atmosphere vs hypsometric from ps and
   T — say which and why), the inversion rule (t850 > t925 per U-15; what about 925 below
   ground in the Alps — `belowGround925` exists as a flag), the new output flag replacing
   `stdLapseFallback` for pressure-derived profiles, and the acceptance: `inversionShare` in
   t2 night > day (the U-15 gate), cases A/B/C reachable to 336 h, negative control t1
   byte-identical. Measure on the current cube: how many t2/t3 cells have all three levels.
3. Neighbours across the chunk border (PAP 3). Exists: 4 neighbours within the chunk only, flag
   `chunkBorderTruncated`, E-F-2 halo (17×17, schema 6, +13 % bytes) deferred "after AP9".
   Measure: the share of affected points TODAY from `cellOf` over the 405 archive points and
   the 10 harness places (the plan quoted 12 %/23 % — recount). Options with cost: (a) halo in
   the producer (schema 6: every consumer of cubeFormat and the archive collector must read it;
   bytes per chunk and against the remote total vs the 150-MB limit R10), (b) reader fetches
   the neighbour chunk(s) only for points in the border row/column (1–3 extra chunks, 0.45–1.4
   MB; measure on `verify:pv-latency` at border places, cold and warm, and whether it can be a
   late `onUpdate` emission so first display is unaffected — note weights change values on the
   update, say whether that is acceptable). Recommend one, or "wait for AP9's border finding".
4. κ land-use similarity as a form (PAP 3, local). Exists: per-cell class shares for t1/t2/t3
   from z0Point.ts (behind `CubeIo.z0`), κ = 1 in `GRID_SET`. Decide the form (class groups
   water/urban/forest/open/bare/snow; κ = exp(−δ/λ) or a table), the strength `set` with
   `calib: kappa:set`, whether κ enters the first answer or only the late z0 emission (the
   class field is not on the critical path today — keep it that way), negative control κ = 1
   byte-identical, cost, and what changes at 5 synthetic cases (lake shore, city edge, forest
   edge, homogeneous plain ⇒ κ = 1, cell with unknown class ⇒ κ = 1).
5. z0 of the model side from GRIB (PAP 5, V-FI-58, S&F). Exists: the WorldCover approximation
   per model cell (`set`, §9.16.2). Measure at the directories which sources expose z0
   (ICON-D2 `z0`, ICON-EU, IFS open data, GFS `sfcr`) and how it varies in time (season, snow).
   Options: a plane per step (bytes per chunk × tiers) vs a static product per source like
   `static/hmodel` (one snapshot per run, tiny). Recommend, count bytes against R10, and say how
   `windBlendingFactor` consumes it (model z0 `measured`-from-model vs WorldCover fallback with
   flag) and how the archive keeps it.
6. Calibration tooling (item 7 in the table). AP9 already plans the collector with the cube
   path, the archive scorer and the synthetic verifier (prompt.md) — check that prompt.md is
   still consistent with the tree after §9.16 (v2 codec exists ⇒ import; `elevationM: p.elev`
   line at the collector's live call; archive schema 3) and list any correction as a note for
   Jan, do not rewrite it. What THIS plan adds is the FIT: `scripts/punktarchiv/fit-calib.mjs`
   designed before there is data — a parameter registry (σ_sys per variable and lead bin, c,
   L_d/L_h, κ strength, φ, A, A_uhi, f_rad parameters, dzMin, meltOffset) with, per parameter,
   the estimator (residual variance, spread/skill, spatially blocked CV, regression on
   cold-pool cases …), the minimum n, the stratification, the output form for
   `point/calib.json` (`provenance: measured`, n, period) and the hard abort "Archiv zu kurz"
   with a diagnosis. Plus a synthetic-archive verifier that must recover known parameters and
   must refuse a too-short archive. Say which parameters become fittable on which calendar
   date given one slot per day since 14.09. (0–48 h from now, t3 bins ≈ end of October).

Cross-cutting, for every item: runtime before/after on the same harness the same day (Desktop
cold/warm, Mobil-4G cold, first display AND whole window), bytes on the wire and in the data
repo (R10), bundle (eagerJs 107.9 unchanged, totalJs headroom 2.4 KB ⇒ E-F-n if exceeded),
verifier with negative control, flag and fallback, provenance marks, effort in sessions (S/M/L),
dependency on AP9/AP10, and — honestly — how the "gebaut/wirksam" percentages of 18.09. move
(built 85 → ≈ 95, effective 65 → ≈ 72 was the estimate; recount from your plan).

────────────────────────────────────────────────────────────────────────────
End of session
────────────────────────────────────────────────────────────────────────────
Present the plan for approval (ExitPlanMode). Then a report that stands on its own: the
recommended order (the 18.09. suggestion was: tooling first because every day without the
collector's cube path is a missing case, then U-15 + V-FI-58 as ONE producer stage with one
manifest bump, then d_water and κ locally, halo only after AP9's border finding), the decisions
Jan has to make (E-F-13…), the gates per item, and what remains archive-bound. Do not start
implementing anything in this session.
```
