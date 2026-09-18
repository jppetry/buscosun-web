# Kickoff-Prompt — Phase FI, Etappen AP12 · AP11 (hinter dem Flag) · Befunde V-FI-21/17/24/11

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`, **parallel** zur AP9-Session (deren Kickoff bleibt
> `prompt.md`). Geschrieben am 2026-09-18 nach PA3 (§9.12, Commit `9c49317`). Prompts an Claude Code auf Englisch
> (CLAUDE.md, Sprache & Konventionen). Reihenfolge und Umfang: Jans Auswahl vom 18.09. — alles, was ohne den
> Backtest lösbar ist. Findings dieser Session zählen ab **V-FI-40** (AP9 zählt V-FI-32…39).

```
You are continuing phase FI ("buscosun Fusion on the point cube, 0–336 h, answer < 2 s") in
C:\dev\buscosun-web. Jan's goal: finish buscosun Fusion so that only AP10 (calibration from the
archive, needs ≥ 30 days) remains. This session takes everything that does NOT depend on the
backtest, in this order, ONE stage at a time, each with its own diagnosis, gate and section:

  1. AP12   mobile hardening — bytes off the critical path                → §9.14
  2. AP11   the point panel reads v2 behind a URL flag, default stays live → §9.15
  3. V-FI-21 compact codec for PointForecastV2                             → §9.16.1
  4. V-FI-17 z0 from WorldCover ⇒ wind blending (PAP 5) becomes active     → §9.16.2
  5. V-FI-24 `elevationM` option on the live path                          → §9.16.3
  6. V-FI-11 Zugspitze +0 h 12.6 °C on the live path — diagnosis           → §9.16.4

A SECOND session runs AP9 (the backtest, kickoff in prompt.md) in the SAME working tree at the
same time. The coordination rules below are binding; read them before touching anything.

Read first, in this order:
1. The status block at the top of CLAUDE.md (rules, gates, tool traps).
2. audit/fusion-implementierung.md: §3 (precompute/runtime cut, budget table §3.2, §3.3 what
   would blow the budget), §4 rows AP11/AP12, §6 (latency method and acceptance), §2 (v2 output
   form), §9.0–§9.2 (AP0 baseline, AP1 reader: IndexedDB cache, worker pool, deadlines, fetch
   priorities), §9.5–§9.11 (algorithm stages; §9.11.4 names V-FI-22), §9.12 (PA3: schema 2,
   E-F-12 station height ≤ 250 m, V-FI-24/31).
3. Code: src/point/client/{readPoint,cubePoint,store,cache,decodePool,terrain,staticPoint,
   nowcastPoint,stationPoint,resolve}.ts (the reader), src/pointForecast/cubeSource.ts
   (fuseCubePoint, cubeInputFromBundle, registerPointSource — registration, no static import),
   src/pointForecast/fusion/{output,uncertainty,terrainTerms,grid,vertical}.ts,
   src/pointForecast/{pointForecast,types}.ts (options incl. `pointSource`, v2 on the result),
   src/pointForecast/PointForecastPanel.tsx + src/MapView.tsx (the only consumer today),
   scripts/verify-pv-latency.mjs + scripts/pv-latency/lab.ts (the harness; flags --gate --only=
   --places= --profiles= --quick; results under audit/fusion-implementierung/latency/),
   scripts/verify-pv-cube.mjs (204), scripts/verify-point-client.mjs (118),
   scripts/verify-pv-fusion.mjs (227), budget.json.
Check `git status` first: the tree is clean at 9c49317 unless the AP9 session has started. Do not
revert, reformat or stash anything you did not write.

────────────────────────────────────────────────────────────────────────────
Ground rules
────────────────────────────────────────────────────────────────────────────
• One stage at a time: diagnosis in the phase document → plan → code → verify → gate, then the
  next. Never two stages open at once. A failed gate stops the session until Jan decides.
• Measure, never extrapolate: every latency number comes from verify:pv-latency, before AND after
  on the same day and machine (performance-anchor rule: one isolate per variant, `prime` per
  profile, HIT and MISS reported as two populations). Cost gates in verify:pv-cube go red when the
  other session runs verifiers — rerun alone before calling anything red.
• Function preservation: without the flag, the live path and the current panel stay byte- and
  pixel-identical (verify:pv-fusion 227/227 unchanged; desktop screenshot diff for the panel).
• Rule 2: everything new is default-off behind `pointSource: 'cube'` or the new URL switch, with a
  named fallback for every path.
• eagerJs 107.9 KB has 0 KB headroom: all point/cube code stays in lazy chunks (dynamic import,
  registration); the text probe in the verifier proves it. typecheck, build and budget after every
  change to src/.
• Provenance: nothing is shown as measured that is `set`; the panel labels `calib: set` visibly.
• STOP & ASK (Jan): changes to src/pointForecast/fusion/* beyond what a stage names explicitly,
  shader/WebGL, edge functions, cron/publisher/mirror workflows, the cube schema (E-F-3 8×8 chunks
  is a schema change — NOT in this session; report with numbers if ranges do not suffice), anything
  irreversible, purges or dispatches against production. Warm-up GETs are fine.
• Commits, pushes, copies into the data/archive repos are Jan's. Verifiers run without asking;
  PowerShell never with 2>&1; Bash truncates at ≈ 8 KB → large files via the Write tool; `npm run`
  swallows `--` arguments → call scripts directly with
  `node --experimental-strip-types --import ./scripts/lib/register-ts.mjs …`.
• Documentation German, code/comments English; the algorithm is always called "buscosun Fusion".
  Command-Deck design (D-27); breakpoints 767/1439 px only; touch targets ≥ 44 px; safe-area.

────────────────────────────────────────────────────────────────────────────
Coordination with the AP9 session (same tree, same time)
────────────────────────────────────────────────────────────────────────────
• Off-limits for you: scripts/punktarchiv/**, scripts/verify-pv-score.mjs,
  scripts/verify-punktarchiv.mjs, audit/fusion-implementierung/scorecards/**, §9.13 of the phase
  document, prompt.md, MANUELLE-SCHRITTE.md §15/§16.
• Yours: §9.14, §9.15, §9.16 (+ subsections), src/point/client/**, PointForecastPanel.tsx,
  MapView.tsx, fusion/output.ts, a new codec module, scripts/verify-pv-latency.mjs, lab.ts,
  verify-pv-cube.mjs and verify-point-client.mjs (append blocks, never renumber existing checks),
  MANUELLE-SCHRITTE.md §17. Findings: number from V-FI-40 upward (AP9 uses V-FI-32…39).
• Shared: the CLAUDE.md status block — re-read immediately before editing, change only your own
  rows, keep the edit minimal. src/pointForecast/cubeSource.ts: the AP9 collector CALLS it; extend
  it additively only (optional fields/options); never change existing output without a flag.
• The codec (stage 3) is what AP9 part (a) needs to store the cube path compactly. Before building
  it, grep for an existing one (`v2codec`, `encodeV2`, `compact`); if the AP9 session already wrote
  one, extend theirs instead of duplicating. If the AP9 session asks for it, pull stage 3 forward.

────────────────────────────────────────────────────────────────────────────
Stage 1 — AP12 mobile hardening (§9.14)
────────────────────────────────────────────────────────────────────────────
Today (§9.11, lab `--gate`, 4 places): desktop cold p50 ≈ 1.0 s / p95 1.9 s green, warm 0.4 s;
mobile-4G cold 2.5–2.9 s RED, the core alone 2.1–2.4 s and bytes-bound (≈ 733 KB of chunks +
station bundle up to 151 KB + static products + terrain tiles); fast-3G ≈ 8.7 s. Deadlines today:
progressive products 1 800 ms from start, obs 1 500 ms + 500 ms grace. Levers, in this order, each
its own variant measured against the same-day baseline:
  a. Baseline: `verify:pv-latency --gate` for desktop-none, desktop-4g, mobile-4g, fast-3g (the
     10-place list if time permits) → latency/<date>-before.json. Record per product the bytes and
     ms that actually gate `doneAt` on mobile-4G — the diagnosis is that table.
  b. V-FI-22: the static products (point/static/hmodel, urban) sit on the end-to-end critical path
     but v1 does not use them (terrain terms inactive). Take them off the path: fetch in parallel,
     never awaited before the first output; provenance keeps them when they arrive. Negative
     control: output byte-equal with and without them.
  c. Progressive planes: the chunk prefix (732 B, measured) is the complete plane directory and
     jsDelivr serves Range requests (206, cached). Load the CORE planes first — exactly what the
     first output needs (derive the list from cubeSource's `wanted`: t2m/td2m/u/v/gust/precip/
     cloud family + their σ/q10/q90/srcCount + profile fields + hModEff), emit the first
     PointForecastV2, then complete the remaining planes in the background and re-emit (or mark
     what is missing). Beware: jsDelivr keeps one cache entry per Accept-Encoding variant AND per
     range — measure HIT/MISS of ranges at the edge before deciding; the IndexedDB cache is keyed
     per file, so a range scheme needs its own key and assembly; the whole-file path stays as the
     named fallback. If ranges save < 20 % on mobile (plan §3.3 expected that for the FULL
     algorithm), say so with numbers and stop — do not propose E-F-3 without a measurement that
     shows it would be needed.
  d. V-FI-20: the hourly axis costs +100–200 ms on mobile (CPU 4×). Profile output.ts: quantiles
     only on native steps, interpolate the quantiles, no per-hour bisection; algoMs before/after.
  e. Anything else the baseline names with a number (station bundle, terrain tiles, worker start,
     decode) — only then.
  Not in this stage (S&F): V-FI-7 radar warm-up in the mirror workflow, E-F-8 latest.json,
  E-F-3 8×8 chunks, E-F-5 gazetteer. Note them in the report if the numbers point there.
Gate (§6): mobile-4G cold p50 < 2.0 s and p95 < 5.0 s, warm < 0.5 s; desktop unchanged or better
(a regression fails the stage); fast-3G reported (≤ 5 s is the goal, not blocking);
verify:point-client 118+n, verify:pv-cube 204+n, verify:pv-fusion 227 unchanged, typecheck, build,
budget with eagerJs 107.9; console clean. Results as latency/<date>-after.json plus a
before/after table in §9.14.

────────────────────────────────────────────────────────────────────────────
Stage 2 — AP11 panel behind the flag (§9.15)
────────────────────────────────────────────────────────────────────────────
The app has NO URL switch today: `pointSource` is only an option, and only the lab sets it.
Introduce `?pf=cube` (query parameter; absent or anything else = live) read where the panel
requests its forecast; register the cube source via dynamic import so eagerJs stays 107.9; add
`?pflog=1` for a timing/provenance block (fetch/decode/terrain/algo/total, files, bytes, HIT/MISS)
the way the lab reads it. The default stays live — no flip in this session (that is the AP9 gate).
The panel renders PointForecastV2 (§2): per hour p50 with the p10–p90 band, σ-kind, the confidence
score with its three factors, members with weight/run/age (provenance), flags per step
(interpolated, extrapolatedBelowModel, inversionBody, stdLapseFallback, chunkBorderTruncated,
belowGround925, nowcastFallbackModel, climatologyOnly, stale), the climatology tail visibly
separated, `hTrue:station` and every `calib: set` shown as "vorläufige Bandbreite" / "Setzung".
Honesty is the product principle: nothing hidden, nothing smoothed. Units as in the cube manifest.
Command-Deck: light, sand/ink, League Spartan, the existing tokens of the point panel; mobile only
via media queries (767/1439), touch targets ≥ 44 px, safe-area. Without `?pf=cube` the panel must
be pixel-identical on desktop (screenshot diff 1440×900 via scripts/lib/headlessShot.mjs or the
Chrome DevTools MCP; iPhone 12 Pro 390×844 DPR 3 for mobile).
Gate: the five self-verification questions with evidence (function preservation per feature,
desktop pixel-identical, touch targets, console clean, long tasks — state explicitly that long
tasks are not measurable in headless-shell and list the real-device run as Jan's step in §17);
verifiers as above; budget unchanged. Mass callers (route, event scan, 3D) stay live (E-F-7).

────────────────────────────────────────────────────────────────────────────
Stage 3 — V-FI-21 compact codec (§9.16.1)
────────────────────────────────────────────────────────────────────────────
PointForecastV2 as JSON is 1.1 MB per point (337 hourly steps). Build a pure, dependency-free
codec, e.g. src/pointForecast/fusion/v2codec.ts (`encodeV2` / `decodeV2`): per step and variable
integer tuples on the plane scale (`quantStep` from the cube manifest — the archive already stores
planes that way), members as indices into a per-forecast member table, flags as a bitmask, the
dist family as an enum with quantised parameters, axis/provenance/timing once. Round trip: values
within half a quantisation step, flags/members/axis exact. Report the measured size per point
(native 109 steps and hourly 337). The archive will add it for 405 points per slot — state the slot
growth in MiB gz and keep it proportionate (today ≈ 18 MiB per slot). Verifier netzfrei (a new
block in verify-pv-cube or `verify:pv-codec`): round trip on the real fixture, negative control
(a flipped bit is detected), size gate on the fixture. Nothing in the app uses it yet.

────────────────────────────────────────────────────────────────────────────
Stage 4 — V-FI-17 z0 from WorldCover (§9.16.2)
────────────────────────────────────────────────────────────────────────────
The bundle carries no z0, so the two-stage wind blending in fusion/terrainTerms.ts is inactive.
The reader gets z0 at the point from the existing WorldCover mirror (loader pattern in
src/fire/detail/worldCover.ts; the class→z0 table lives in src/point/terrainPoint.ts), loaded in
parallel with the terrain tiles and cached like them (timeless), never on the critical path:
without the tile (deadline) blending stays inactive, with a flag. Activating it changes the
cube-path wind (behind the flag); the blending parameters (z0 table, d0 from urban, blending
height) are `set` → in `calib`, visible in the panel. Verifier: negative control (no z0 ⇒
byte-equal to today), the synthetic cases from the plan (water: no +135 % wind; city vs open
land), and the latency harness shows no regression on mobile-4G (same-day before/after).

────────────────────────────────────────────────────────────────────────────
Stage 5 — V-FI-24 `elevationM` on the live path (§9.16.3)
────────────────────────────────────────────────────────────────────────────
`getPointForecast` takes no elevation; the live path uses its own z9 DEM height (bilinear), at
summit stations up to 270 m too low (Arber −237, Klippeneck −241, §9.12.4). Add
`elevationM?: number | null` to the options: when set it replaces the DEM height for the live
path (including every step that reads `query.elevation`: anchor, lapse) and goes into
`pfCacheKey`; unset ⇒ byte-equal to today (verify:pv-fusion 227 unchanged + one new check with
and without). Do NOT edit scripts/punktarchiv/collect.mjs (AP9 owns it) — hand the one-line call
change (`elevationM: p.elev`) to the AP9 session in your report and in §9.16.3.

────────────────────────────────────────────────────────────────────────────
Stage 6 — V-FI-11 Zugspitze (§9.16.4), diagnosis only
────────────────────────────────────────────────────────────────────────────
The live path returns 12.6 °C at +0 h for Zugspitze (47.421 N, 10.985 E, 2 962 m; §9.5.4).
Reproduce in Node (the collector runs the live path through scripts/punktarchiv/lib/nodeShims.mjs
— read it, do not change it) and test the hypotheses in order, each with a number: (1) which
station BrightSky/MOSMIX delivers there (Zugspitze 10961 exists in MOSMIX — is it used, or a
valley station?), (2) the anchor: which observation, at which height, corrected how, (3) the DEM
height the live path uses (z9 bilinear, see stage 5), (4) the lapse/vertical step. If it is a
plain defect in a reader (wrong station, missing height correction), fix it with a negative
control; if the cure changes buscosun Fusion's behaviour broadly, write the V-entry with the
proposal and stop (Jan's gate).

────────────────────────────────────────────────────────────────────────────
Reporting
────────────────────────────────────────────────────────────────────────────
Each stage closes its section with: diagnosis, what changed (files), the numbers (before/after
tables), gates with counts, findings V-FI-n (from V-FI-40), what is deliberately left open.
Update the CLAUDE.md status block rows for AP12/AP11 (status, not chronicle) and write
MANUELLE-SCHRITTE.md §17 with Jan's gates from this session (push of main; real-device run for
long tasks; decisions, if any). End with a report that stands on its own: numbers first, then
what Jan has to do. If a stage's gate fails, say so with the numbers and do not start the next
stage until Jan decides.
```
