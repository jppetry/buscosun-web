# Kickoff-Prompt — Phase FI, Etappe AP9 (Backtest gegen das Archiv)

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`. Geschrieben am 2026-09-17 nach der Gegenprüfung von AP2–AP8 (§9.11.4); aktualisiert am Abend nach PA3 (§9.12: Archiv-Schema 2, 405 Punkte) — AP9 schreibt §9.13.
> Prompts an Claude Code auf Englisch (CLAUDE.md, Sprache & Konventionen). Der vorige Kickoff (AP2–AP8) ist erledigt.

```
You are continuing phase FI ("buscosun Fusion on the point cube, 0–336 h, answer < 2 s") in
C:\dev\buscosun-web. This session builds AP9, THE BACKTEST: the first honest accuracy statement
about the cube path — scored against station observations from the archive, with baselines,
as-of discipline and a leak guard. AP11 (consumer), AP12 (mobile hardening) and AP10
(calibration fit) are NOT in scope; AP10 needs ≥ 30 days of archive and comes later.

Read first, in this order:
1. The status block at the top of CLAUDE.md.
2. `audit/fusion-implementierung.md`: §5 (verification strategy — data basis, baselines B0–B6,
   metrics, lead bins, stratification, gates, abort rules), §1.2 (what the archive holds per
   point and slot, when a lead is scorable), §2 (`PointForecastV2`), §9.5.4 (the 10-place
   comparison and V-FI-11…14 — the questions the backtest must answer), §9.8 (σ rules), §9.10
   (anchor, nowcast, hourly axis), §9.11 (`fuseCubePoint`, output, V-FI-21 size, §9.11.4 findings).
3. `audit/punktvorhersage-14tage/verifikation.md` (metrics, gates §7.0, abort rules §7.2/7.3) and
   the existing scorer `scripts/verify-pv-score.mjs` (V-A₁: MAE/Bias/RMSE, CRPS, PIT, spread/skill,
   Brier, Diebold-Mariano with HAC, block bootstrap, FDR, leak guard with negative control) — REUSE
   its metric code, do not write a second implementation.
4. The archive: `audit/punktdaten-umsetzungsplan.md` (PA1 data model v1), §9.3 (PA2: `rr1h`),
   §9.12 (PA3: archive schema 2 with history in `lib/punktarchiv.mjs`, 405 points, station height
   `elev` as the plan height, `fxh`, `ageAtSlotH`, `stats.warnings`, truth window from the hour
   floor — slots up to 16.09. are schema 1, later ones schema 2; both must stay readable), `scripts/punktarchiv/{collect.mjs,points.mjs,lib/punktarchiv.mjs,lib/truth.mjs}`,
   the local clone `C:\dev\buscosun-archiv` (run `git pull` there first — it is behind; slots since
   2026-09-14, one per day at 23:10 UTC; the remote is Jan's, never push).
5. The cube path: `src/pointForecast/cubeSource.ts` (`fuseCubePoint(input, opts)` is a PURE
   function of the bundle data, calib, nowMs and options; `cubeInputFromBundle`; `CubeIo` for
   Node), `src/point/client/readPoint.ts` (bundle shape), `scripts/lib/pvCubeFixtures.mjs`.
Check `git status`: the tree may carry Jan's uncommitted work — do not revert, do not commit.

────────────────────────────────────────────────────────────────────────────
Ground rules
────────────────────────────────────────────────────────────────────────────
• Diagnosis first (§9.13 in the phase document before code — §9.12 is PA3); number your findings
  V-FI-32…39 (a parallel session, kickoff prompt-ap12-ap11.md, owns AP12/AP11 and V-FI-40+ — it
  must not touch scripts/punktarchiv/**; you must not touch src/point/client/**, the panel, the
  latency harness or §9.14–§9.16; a v2 codec, if it exists first there, is yours to import): which slots exist, which points
  have truth (POI hourly; TAWES/SMN `rr1h` since PA2), which leads are scorable today (slot N
  + ⌈h/24⌉ days), how many (point, lead) cases that gives per bin — and whether the archived
  cube planes + station + nowcast + hmodel are enough to rebuild the bundle `fuseCubePoint`
  needs (terrain is timeless: decide, with a measurement, whether to compute it per point once
  and keep it in the archive repo's point list or recompute; no new artifact in `buscosun-data`).
• Wahrheit = Stationsmessung, nie Modellanalyse. As-of t₀: the replay may only see what the
  slot at t₀ saw (its cube runs, its station run, its nowcast slot, obs up to t₀). Leak guard:
  a shifted-time negative control that MUST fail. Truth from LATER slots only.
• Truth dedupe: TAWES/SMN deliver the 23-UTC hour within ≤ 25 min, so since PA3 it sits in two
  consecutive slots (end of slot N, start of slot N+1); POI carries each hour once. Key truth by
  (point, stamp), count it once, assert equal values where both exist.
• No accuracy claim without a scorecard; every number in §9.12 comes from the scorer output.
  Report what is not yet scorable (t2/t3 bins) as "not yet", never extrapolate.
• Engine and reader stay as they are; if a defect surfaces, name it as V-FI-n and fix only if
  it is in the scorer/collector. Anything touching `src/pointForecast/fusion/*` behaviour ⇒
  stop and ask.
• No commits, no pushes, nothing into the data or archive repo (a `git pull` of the archive
  clone is fine). Verifiers run without asking; PowerShell never with `2>&1`; Bash truncates at
  ≈ 8 KB — large files via the Write tool.

────────────────────────────────────────────────────────────────────────────
Deliverables
────────────────────────────────────────────────────────────────────────────
1. Collector, part (a): `scripts/punktarchiv/collect.mjs` records the CUBE-PATH forecast per
   point per slot — `getPointForecast({ pointSource: 'cube' })` in Node through `CubeIo`
   (store/clima/nowMs as `verify:pv-cube` does), so future truth scores exactly what a user
   would have seen. Store it COMPACT (V-FI-21: v2 is 1.1 MB JSON per point — encode per hour
   and variable as integer tuples on the plane scale, members as index, flags as bitmask);
   measure the slot growth (today ≈ 18 MiB gz for 405 points; E-U-13) and keep it
   proportionate — say the number. Keep `live` as it is (B5 baseline). Kill switch, no
   behaviour change without the flag. Bump the archive schema to 3 with a history entry
   (schemas 1–3 readable, as PA3 did for 2). `verify:punktarchiv` (87/87) grows with negative controls.
2. Scorer, part (b): `npm run verify:pv-score -- --archive` (new mode in the existing script,
   or a sibling `scripts/punktarchiv/score-archive.mjs` that imports the metric functions —
   one implementation): replay `fuseCubePoint` from the archived cube planes for every slot
   and point, as-of the slot time, and score against truth from the following slots. Baselines
   per bin (§5.2): B0 nearest cube cell raw, B1 B0 + standard lapse to h_true, B2 MOSMIX-L
   station as-of, B3 (anomaly) persistence, B4 climatology, B5 live path (`live.fields`),
   B6 old fusion (`live.fusion` q10/q50/q90 — CRPS as 3-quantile approximation, same for all,
   labelled). Metrics per §5.3; lead bins 0–6 · 7–24 · 25–48 · 51–120 · 126–240 · 246–336 h;
   stratification by height band, TPI class, day/night, inversion (zInv > zBase), country.
   Output: `audit/fusion-implementierung/scorecards/<date>.json` + a table in §9.13. Replay
   ≤ 10 min per slot locally (measure it).
3. First scorecard: 0–48 h from the slots available today (14./15./16.09. → truth from
   15./16./17.09.). DE is the core; AT/CH only from slots after Jan's push (PA2). Answer, with
   numbers and significance: does the cube path beat B5 (the live path) and B2 (MOSMIX) in the
   0–6, 7–24, 25–48 h bins for T, wind, precipitation (Brier at 0.1/1/5 mm/h), clouds? Is the
   spread/skill of the cube path closer to 1 than the live path's 0.5–0.6 (V-A₁)? What does the
   score say about V-FI-13 (cube member < 5 % at mountain sites — right or wrong?), V-FI-12
   (Rice median wind bias) and the anchor (with vs without, `anchorMode`)? Note V-FI-25: until Jan
   approves the dew-point fix, B5 carries no MOSMIX humidity — stratify B5 by collector commit
   (the slot records it) and say so next to any td/rh number.
4. Verifier for the scorer itself: netzfrei against a synthetic archive (two slots, known
   truth, one baseline deliberately better) — the metrics must recover the known ordering,
   the leak guard must fail on shifted time, the as-of rule must exclude later runs.
5. §9.13 with diagnosis, what changed (files), the scorecard table, findings V-FI-n, what is
   deliberately left open (t2/t3 bins until 30.09./end of October; AP10 fit needs ≥ 30 days),
   and the CLAUDE.md status block updated (status, not chronicle). End with a report that
   stands on its own: numbers first, then what Jan has to do (push of `main` so the collector
   starts recording the cube path — every day without it is a day without cube-path cases).

Not in this session, but note it in the report if you see it: V-FI-22 (static products on the
end-to-end critical path though unused by v1 — AP12), V-FI-7 (radar slots MISS at the edge),
Mobil-4G red (AP12: plane ranges / progressive loading).
```
