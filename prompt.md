# Kickoff-Prompt — Phase FI, Etappe AP9 (Backtest gegen das Archiv)

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`. Neu geschrieben am 2026-09-18 nach der Planung
> „Vollform ohne Archiv" (`audit/fusion-vollform.md`): die 15 Korrekturen aus V-FI-77 (§1.6 dort) sind eingearbeitet,
> dazu Jans Anforderungen an das Archiv (E-F-19 mit Bedingungen, V-FI-76, §6.1 dort). AP9 schreibt §9.13 in
> `audit/fusion-implementierung.md`. Parallel läuft die Linie AP13–AP17 (`audit/fusion-vollform.md`).
> Prompts an Claude Code auf Englisch (CLAUDE.md, Sprache & Konventionen).

```
You are continuing phase FI ("buscosun Fusion on the point cube, 0–336 h, answer < 2 s") in
C:\dev\buscosun-web. This session builds AP9, THE BACKTEST: the first honest accuracy statement
about the cube path — scored against station observations from the archive, with baselines,
as-of discipline and a leak guard — and it turns the archive collector into the data source
for the later calibration fit (AP10). AP10 itself, the fit core and all engine work are NOT in
scope: a parallel session builds AP13–AP17 (audit/fusion-vollform.md).

Read first, in this order:
1. The status block at the top of CLAUDE.md.
2. audit/fusion-vollform.md: §1.3 (chunk border, V-FI-69), §1.6 (V-FI-66…79 and the note on this
   prompt), §2.5 (the fit registry — what your case records must carry), §6.1 (Jan's decisions,
   E-F-19 with conditions (a) and (b)), §4 "Zuständigkeiten".
3. audit/fusion-implementierung.md: §5 (verification strategy — baselines B0–B6, metrics, lead
   bins, stratification, gates, abort rules), §1.2 (what the archive holds), §2 (PointForecastV2),
   §9.5.4 (10-place comparison, V-FI-11…14), §9.8 (σ rules), §9.10 (anchor, nowcast, hourly
   axis), §9.11 (fuseCubePoint, output), §9.12 (PA3: schema 2), §9.16.1 (v2 codec), §9.16.3
   (elevationM at the live call).
4. audit/punktvorhersage-14tage/verifikation.md (metrics, gates §7.0, abort rules §7.2/7.3) and
   scripts/verify-pv-score.mjs. FACTS: it exports NOTHING (top-level code, process.exit), its
   argument parser takes space-separated values, it has NO --archive mode, NO FDR correction, and
   Brier only at 0.1 mm/h (WET_MM). Reuse its metric code by EXPORTING it (you own the file) —
   do not write a second implementation; add FDR (Benjamini–Hochberg) and Brier at 1 and 5 mm/h.
   The distribution primitives live in src/pointForecast/fusion/dist.ts (crpsOf, pitOf,
   quantileOf, meanOf, cdfOf) — import them.
5. The archive: scripts/punktarchiv/{collect.mjs, points.mjs, points.json, lib/punktarchiv.mjs,
   lib/truth.mjs} and the local clone C:\dev\buscosun-archiv (git pull first; the remote is Jan's,
   never push). FACTS on 18.09.: 4 slots 14.–17.09., ALL schema 1 (the 17.09. slot too, codeHash
   9f4403e); the first schema-2 slot is the 18.09. 23:10 UTC run. Slots 14./15.09. carry 243
   points, 16./17.09. 410; points.json has 405 (5 empty POI stations removed in PA3). Slot
   14.09. was taken at 20:46; in schema 1 the POI 23-UTC hour is lost every day (collect.mjs
   ~478–480). Uncompressed, `live` dominates a slot (≈ 113 MB JSON); the cube part of the 17.09.
   slot is 10.33 MB raw / 2.45 MB gz (nearest cell only).
6. The cube path: src/pointForecast/cubeSource.ts — fuseCubePoint(input, opts) is pure;
   cubeInputFromBundle (l.148); getPointForecastFromCube(opts, io) (l.1217);
   registerCubePointSource(io) (l.1417) must run before getPointForecast({ pointSource: 'cube' })
   or that call throws (pointForecast.ts:267); CubeIo (l.1025) — in Node pass store, clima,
   nowMs, terrain/terrainOverride as verify-pv-cube.mjs does (l.239–241). src/point/client/
   {cubePoint.ts (readCubePoint, `neighbours` option), readPoint.ts}, src/pointForecast/fusion/
   {grid.ts (blockOffsets, GRID_NEAREST_ONLY), v2codec.ts}, scripts/lib/pvCubeFixtures.mjs.
Check `git status`: the tree may carry uncommitted work of the parallel line — never revert,
never commit.

────────────────────────────────────────────────────────────────────────────
Ownership (Jan, 18.09.) — binding while both sessions run
────────────────────────────────────────────────────────────────────────────
• YOU own: scripts/punktarchiv/**, scripts/verify-pv-score.mjs, scripts/verify-punktarchiv.mjs,
  §9.13 in audit/fusion-implementierung.md, findings V-FI-32…39.
• The parallel line owns: src/point/**, src/pointForecast/** (incl. calibration.ts),
  scripts/verify-pv-cube.mjs, scripts/verify-point-client.mjs, scripts/verify-calib-fit.mjs,
  audit/fusion-vollform.md (findings V-FI-80+). You IMPORT from src/, you do not edit it. If you
  need a change there, name it as V-FI-3x and ask.
• Shared, additive only: the flag tables in src/pointForecast/fusion/v2codec.ts (a codec table
  change bumps V2C_VERSION) and scripts/lib/pvCubeFixtures.mjs.
• New cube-path options (CubeIo.fuse, calibSource, pressureProfile, kappa, crossChunk …) arrive
  from the parallel line default-OFF. The collector sets every option explicitly and records
  what it set (options hash, below) — it never relies on a default.

────────────────────────────────────────────────────────────────────────────
Ground rules
────────────────────────────────────────────────────────────────────────────
• Diagnosis first (§9.13 before code): which slots exist, which points have truth, which leads
  are scorable today (slot N + ⌈(h+1)/24⌉ days), how many (point, lead) cases per bin, and
  whether the archived cube planes + station + nowcast + hmodel rebuild the bundle
  fuseCubePoint needs. Terrain is timeless: decide, with a measurement, whether to compute it
  once per point (kept in the archive repo's point list) or at replay time; no new artifact in
  buscosun-data.
• Truth = station measurement, never model analysis. As-of t₀: the replay only sees what the
  slot at t₀ saw (its cube runs, station run, nowcast slot, obs up to t₀). Leak guard: a
  shifted-time negative control that MUST fail. Truth from LATER slots only.
• Truth dedupe: TAWES/SMN deliver the 23-UTC hour within ≤ 25 min, so it sits in two
  consecutive slots (end of N, start of N+1); POI carries each hour once. Key truth by
  (point, stamp), count once, assert equal values where both exist.
• No accuracy claim without a scorecard. Report what is not yet scorable (t2/t3 bins) as "not
  yet", never extrapolate.
• Engine and reader stay as they are. A defect in src/ ⇒ V-FI-3x and ask; fix only what is in
  your files.
• No commits, no pushes, nothing into the data or archive repo (a git pull of the archive clone
  is fine). Verifiers run without asking, one at a time; PowerShell never with 2>&1; Bash
  truncates at ≈ 8 KB — large files via the Write tool; npm run swallows `--` args ⇒ call
  scripts with node --experimental-strip-types --import ./scripts/lib/register-ts.mjs ….

────────────────────────────────────────────────────────────────────────────
Deliverables
────────────────────────────────────────────────────────────────────────────
1. Collector → archive schema 3 (scripts/punktarchiv/collect.mjs, lib/punktarchiv.mjs, lib/truth.mjs)
   a. Cube-path forecast per point per slot: registerCubePointSource(io) once, then
      getPointForecast({ pointSource: 'cube', … }) — or getPointForecastFromCube(opts, io) —
      with io = { store, clima, nowMs: () => slotAtMs, terrain/terrainOverride, obs: null }
      (no z0: CubeIo.z0 stays unset; no onUpdate — it switches on progressive mode). Store it
      COMPACT: import { encodeV2, decodeV2, compareV2, V2C_VERSION } from
      src/pointForecast/fusion/v2codec.ts (flags/calib/tiers are index tables, not bitmasks);
      record V2C_VERSION in the slot. Native steps only vs hourly is V-FI-55 (Jan): measure both,
      store native-only unless Jan decides otherwise (+6.6 MB/slot measured in §9.16.1).
   b. The 2×2 block per tier, ACROSS chunk borders (E-F-19): for each point and tier, the cells
      of blockOffsets(lat − cellLat, lon − cellLon) (grid.ts). Read each neighbour cell in Node
      with readCubePoint at that cell's centre (cellCenter) — that fetches the neighbour chunk
      when the cell lies in another chunk; you do not need the parallel line's crossChunk
      option. Condition (a): neighbour cells carry ONLY the 31 planes PAP 3 averages — mean,
      _sd, _sd_ens of t2m td2m u10 v10 gust precip clct ps snowlmt (27), clcl clcm clch (3),
      hModEff (1); NO quantile, profile, pressure-level or count planes. The nearest cell stays
      complete (all planes). Per cell record iy, ix, chunk (cy, cx), centre, distKm, and
      whether it lies in the nearest cell's chunk (so the replay can reproduce the truncated
      product exactly AND the full block for the border finding).
   c. Condition (b): MEASURE the slot growth with the trimmed block on a real slot before schema
      3 is frozen — gz bytes of the cube part before/after, together with V-FI-55, GB/year and
      MONTHS until GitHub's 5-GB warning at one slot per day. Jan signs off that number; until
      then schema 3 is not frozen. (The 44 %/29 % in audit/fusion-vollform.md §6.1 are chunk-byte
      estimates, not slot measurements.)
   d. Provenance in the slot: options hash (the exact CubeIo/FuseCubeOptions the collector set),
      calib hash (sha256 of point/calib.json as read), WorldCover mirror SHA (WC_MIRROR_SHA from
      src/fire/detail/worldCover.ts), V2C_VERSION, collector commit.
   e. Live path: add elevationM: p.elev at BOTH live calls (collect.mjs:461 and :570; §9.16.3
      asks for it) and fix the caveat at ~l.451. Keep `live` otherwise as it is (B5). V-FI-25 is
      approved and implemented (17.09.): B5 carries MOSMIX dew point from the 18.09. slot on —
      stratify B5 by collector commit.
   f. Truth: lib/truth.mjs POI_COLS (l.37–47) reads 9 of 43 POI columns. Add present_weather,
      past_weather_1, past_weather_2 (code tables, int), depth_of_new_snow, total_snow_depth (cm)
      to POI_COLS and TRUTH_SCALES (V-FI-76 — with them meltOffset becomes fittable in winter;
      DE/POI only). Schema-2 truth rules stay (window from the hour floor, 23-UTC dedupe).
   g. Schema 3 with a history entry in lib/punktarchiv.mjs (schemas 1–3 readable). Update the
      self-tests: punktarchiv.mjs:298–303 today asserts that schema 3 is REJECTED (future.schema
      = 3) — move the "future" probe to 4; verify-punktarchiv.mjs:58 asserts ARCHIVE_SCHEMA === 2.
      verify:punktarchiv is 103/103 today and grows with negative controls. Kill switch; no
      behaviour change without the flag.
2. Replay + scorer
   a. A PURE, importable replay (e.g. scripts/punktarchiv/lib/replay.mjs, exported): slot →
      per point and tier the bundle fuseCubePoint needs → PointForecastV2 as-of the slot time,
      and → CASE RECORDS for the fit (the parallel line's src/point/calibFit.ts consumes them;
      fields per audit/fusion-vollform.md §2.5: point, slot day, lead, variable, μ, σ without
      σ_sys, σ_ens, obs, flags, tier, block cells with distM/dhM, f_rad/geometry terms, strata).
   b. REPLAY CHECK (Jan, 18.09.): replay with the trimmed neighbours (same-chunk cells only) must
      equal the product the collector stored — v2 byte-identical via compareV2 — BOTH with plane
      ranges off (all 57 planes decoded; quantiles averaged but unused) AND on
      (CubeIo.planeRanges: true); negative control: perturb ONE KEPT neighbour plane ⇒ must
      differ.
   c. Scorer: export the metric code of verify-pv-score.mjs and add an --archive mode (or a
      sibling that imports it — one implementation). Baselines per bin (§5.2): B0 nearest cell
      raw, B1 B0 + standard lapse to h_true, B2 MOSMIX-L station as-of, B3 (anomaly)
      persistence, B4 climatology, B5 live path, B6 old fusion (3-quantile CRPS approximation,
      labelled). Metrics per §5.3 incl. FDR and Brier 0.1/1/5 mm/h; lead bins 0–6 · 7–24 ·
      25–48 · 51–120 · 126–240 · 246–336 h; strata height band, TPI class, day/night,
      inversion (zInv > zBase), country, chunk border (truncated vs full block). Anchor with vs
      without = obs vs obs: null in CubeIo (anchorMode is a LIVE-path option; the cube path
      takes FuseCubeOptions.anchor once CubeIo.fuse exists). Output
      audit/fusion-implementierung/scorecards/<date>.json + a table in §9.13. Replay ≤ 10 min
      per slot locally (measure it).
3. First scorecard: 0–48 h from the slots available (14.–17.09., plus 18.09. if it is there),
   schema-1 caveats named. DE is the core; AT/CH from the 16.09. slot on. Answer with numbers and
   significance: does the cube path beat B5 and B2 in the 0–6, 7–24, 25–48 h bins for T, wind,
   precipitation, clouds? Is its spread/skill closer to 1 than the live path's 0.5–0.6 (V-A₁)?
   What does the score say about V-FI-13 (cube member < 5 % at mountain sites), V-FI-12 (Rice
   median wind) and the anchor?
4. Verifier for the scorer: netzfrei against a synthetic archive with the REAL slot shape (two
   slots, known truth, one baseline deliberately better) — metrics recover the ordering, the
   leak guard fails on shifted time, as-of excludes later runs, the replay check holds.
5. §9.13: diagnosis, files changed, the slot-growth number for Jan (condition b), the scorecard
   table, findings V-FI-32…39, what stays open (t2/t3 bins until ≈ end of October; AP10 needs
   ≥ 30 days). CLAUDE.md status block: status, not chronicle — coordinate, the parallel line
   edits it too (edit only the AP9 row). End with a report that stands on its own: numbers
   first, then what Jan has to do (push of main so the collector records schema 3 — every
   day without the block is a lost case for L_d/L_h/κ).
```
