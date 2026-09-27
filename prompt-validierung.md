# Kickoff-Prompt — Phase FV: Abschlussvalidierung von buscosun Fusion (Stand Fit 5e)

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`. Geschrieben am 2026-09-27 nach Phase FX (`audit/fusion-forschung.md` §6.5).
> Ziel: ein ehrliches, vorab festgelegtes Urteil, wie gut buscosun Fusion ist — gegen die Scorecard-4-Tabellen, die Rohmodelle, den heutigen
> Cube, die Klimatologie, MOSMIX und das heutige Live-Produkt. `prompt.md` (AP9) bleibt unberührt.
> Prompts an Claude Code auf Englisch (CLAUDE.md, Sprache & Konventionen); Doku auf Deutsch.

```
You are starting phase FV ("Finalvalidierung") of buscosun Fusion in C:\dev\buscosun-web. Jan wants to
finalise buscosun Fusion and asked for an INTENSIVE validation that shows how well it really works — against
the Scorecard-4 tables, the raw models, MOSMIX and today's products. Your job is an HONEST verdict, not a
proof: every claim is fixed BEFORE the scorecards are read, a result that says "worse" is reported as
prominently as one that says "better", and every number names its rows, its period and its leak rule.

Read first, in this order:
1. CLAUDE.md — the status block (rows "Phase FL" and "Phase FX") and the hard rules.
2. audit/fusion-forschung.md — §6.3 (Fit/Scorecard 5a/5b), §6.4 (FX-4: estimated μ_c, leave-station-out),
   §6.5 (FX-5: Fit 5e, rule fx5, stage 3, A3), §7 (V-FX-1…47 — especially V-FX-1/2 scorer measures, V-FX-33
   reference tables, V-FX-36 scorer cost, V-FX-40 wind gain = speed law, V-FX-43 table + product together,
   V-FX-44 row thinning = point selection), §8 (E-FX-*).
3. audit/fusion-lernphase.md — §3 (forms P/K, the claims A/B), §6 (G-FL-1…4), §11.8–11.11.
4. audit/fusion-forschung/fx5-decision-5e.md (the last decision document) and diag-fx5-a3.md.
5. Code: scripts/fusionfit/{fit.mjs, score.mjs, compare.mjs, build-cases.mjs, clima-product.mjs,
   lib/{rowFeatures,casesio,slotAdapter,stats,clientTables,climaCandidates}.mjs}; src/point/fusionFit/*
   (predict.ts, tables.ts climaColumnsFor, climaProduct.ts); src/pointForecast/cubeSource.ts (fuseCubePoint,
   CubeIo.learnedSource/climaSource, the station member = MOSMIX-L, l.≈381); audit/fusion-forschung/
   {fx4-decision.mjs (--rule=fx4|fx5), fx5-negcheck.mjs, diag-fx5-a3.mjs (mix32 thinning)}.
6. The archive: scripts/punktarchiv/{collect.mjs, lib/*} and the local clone C:\dev\buscosun-archiv
   (read only; `git pull` is allowed, NEVER push — the remote is Jan's).

────────────────────────────────────────────────────────────────────────────
Facts measured on 27.09.2026 (re-check each one in stage 0 before you rely on it)
────────────────────────────────────────────────────────────────────────────
• Current candidate = Fit 5e: C:\dev\buscosun-hindcast\fit\2026-09-27-fx5e\{fusion.hindcast.json,
  fusion.client.json} (fusionFit@3, half-month folds, μ_c column only for t/td/gust, μ_c ESTIMATED leave-
  station-out = fit\2026-09-26-fx4\clima.loso.ridgeTx.json). Scorecard 4 tables = fit\2026-09-25-ap8c (month
  folds, no μ_c, stride 6, default flags). Fit 5a = fit\2026-09-25-fx5a (half folds only). All three were fitted
  on hindcast months 2025-09 … 2026-09. Climatology product: product\2026-09-27\clima\v1\stations.json.
• Hindcast: C:\dev\buscosun-hindcast — cases\v1\<month>\t{1,2,3}.cas.gz (13 months, 40,8 M rows, 6 805 912 with
  truth at stride 6), truth and slots end 2026-09-21. The case rows carry the truth, the cube member, today's
  engine (`f_*`), the per-source raw values at model height (`s<k>_*`, height-corrected by rowFeatures) — the
  raw-model comparison lives HERE. No MOSMIX in the hindcast (E-FL-4).
• V-FX-44: `fit.mjs` and `score.mjs` thin rows with `(validAtH + pointIdx) % stride`. t3 valid hours are
  6-hourly, t2 3-hourly ⇒ at stride 6 this is a POINT selection: t3 (bins 4/5) 65 of 389 stations, t2 (bin 3)
  130, t1 259. Every fit and scorecard since Fit 4 learned and scored the long bins on 65 stations.
  `diag-fx5-a3.mjs` already uses a real mixer (`mix32`); a product/XOR with odd factors is NOT enough (it keeps
  the parity — measured).
• Archive C:\dev\buscosun-archiv: 13 daily slots 2026-09-14 … 2026-09-26 (one per day, ≈ 23:20 UTC; 14.09.
  20:46). Schema 1 on 14.–17.09. (243 points on 14./15.), schema 2 from 18.09. (405 points), codeHash
  36f2bbb (PA4 schema 3 is not yet in the archive). Per slot: `cube.{t1,t2,t3}` (runs, ages, planes — nearest
  cell; the 2×2 block is schema 4 = AP9, not there), `stations` = the MOSMIX-L station product (run ≈ 21 UTC,
  leads 1…247 h, byPoint 405, notMapped 7; fields station/planes/empty), `nowcast`, `hmodel`, `live` = today's
  production point forecast (`getPointForecast`, distribution, 240 h), `truth` = 25 h window per slot
  (POI DE ends 22:00, TAWES/SMN carry 23:00 — the 23-UTC hour appears in two slots: deduplicate by point and
  stamp), `plan`, `stats`. Slot size ≈ 18,5 MB gz. The truth of a forecast at lead L comes from the slot
  ≥ issue + L ⇒ with 13 days only leads ≤ ≈ 12 d exist, and the long bins have ONE or no issue day.
• Overlap: hindcast (fit data) ends 21.09., archive runs to 26.09. Archive issue days 22.–26.09. are fully
  outside every fit; 16.–21.09. are inside the fit months but out of fold via the half-month fold β
  (`entry.folds['2026-09b']`, its neighbour 2026-09a purged); 14./15.09. = fold 2026-09a.
• The learned tables were trained WITHOUT MOSMIX (the hindcast has none); the product chain fuses the learned
  cube member with the MOSMIX station member in `fuseCubePoint` — this chain (A6, V-FX-9) has never been scored.

────────────────────────────────────────────────────────────────────────────
Rules
────────────────────────────────────────────────────────────────────────────
• Diagnosis → plan → implement → verify → gate; phase document `audit/fusion-validierung.md` (German), written
  BEFORE the runs: §1 diagnosis (facts above re-measured), §2 pre-registered claims and decision rules (below —
  refine in stage 0, then FREEZE with a timestamp before the first scorecard exists), §3 protocol, §4 verdict.
• Engine (`src/pointForecast/**`, `dist.ts`, `v2codec.ts`) untouched — STOP & ASK. Fit/scorer changes only
  behind flags, default byte-identical, each with a verifier check and a negative control (`verify:fusion-fit`).
• Ownership: if the AP9 line is active (check CLAUDE.md and `git status`), `scripts/punktarchiv/**` and
  `scripts/verify-pv-score.mjs` are theirs — build the archive evaluation under `scripts/fusionfit/` and read
  the archive read-only.
• No commit, no push, no purge, no copy to buscosun-data or buscosun-archiv, no publisher run, no cron dispatch.
• Machine: 4 cores, 20 GB RAM; a fit ≈ 2,5 h (pass A peaks in RAM), a scorecard ≈ 3 h (+≈ 1 h per reference
  table, V-FX-36). One process at a time. Start long chains detached (PowerShell
  `Start-Process -FilePath "C:\Program Files\Git\bin\bash.exe" -ArgumentList "<script>" -WindowStyle Hidden`, log
  file per chain) and follow them with a Monitor on the log — the harness kills background shells under memory
  pressure (V-FX-34). Node paths as C:/…, never /c/…; write patches as .mjs files (Bash eats backticks and ${});
  `cubeSource.ts` has CRLF. PowerShell verifiers never with `2>&1`.
• Honesty (CLAUDE.md): provenance `hindcast` is never `measured`; say "at station points", "65 stations",
  "5 days", "DE only (clouds)" wherever it applies. Significance = DM (HAC on daily means) + Benjamini–Hochberg
  over all tests of a card; an effect without significance is "n.s.", never "better".

────────────────────────────────────────────────────────────────────────────
Stage 0 — diagnosis (no long runs yet)
────────────────────────────────────────────────────────────────────────────
1. Re-measure the facts above (counts, dates, schema per slot, MOSMIX planes and units, station-to-point
   distance of the MOSMIX mapping, truth networks per country, the lead coverage matrix issue day × lead bin ×
   country of the archive, overlap with the fit months).
2. Decide how archive slots become engine inputs: does `slotAdapter.mjs` read an archive slot (schema 1 and 2)
   as it reads a hindcast slot? What is missing (block cells ⇒ PAP 3 nearest-only, named; station product;
   nowcast; obs for the anchor as of slotAt)? Write the adapter as a flag/new file, never by changing the
   hindcast path.
3. Name the leak rules per candidate (below) and the negative controls, and put them in §2.

────────────────────────────────────────────────────────────────────────────
Stage 1 — hindcast, the large sample (all 389 stations, 13 months)
────────────────────────────────────────────────────────────────────────────
• Flag `--thin=hash` in fit.mjs AND score.mjs (mix32 of validAtH and pointIdx; default = today's rule, byte-
  identical; verifier: every point survives at stride 6/12 for t1/t2/t3, negative control = the old rule loses
  points on t3). Re-fit Fit 4' (default flags), Fit 5a' (--folds=half) and Fit 5e' (the Fit-5e flags:
  --stride=6 --folds=half --climaCols=station --rhoTarget=cv --speedGrid=v4 --speedBands=1 --scaleVars=clct
  --climaMu=<ridgeTx LOSO> --climaVars=t,td,gust) — all with --thin=hash and explicit --stride. Check with
  `fx5-negcheck.mjs` that 5e' u/v/clct/precip equal 5a'.
• Scorecard FV-H = score.mjs on 5e' with --thin=hash --refTables=4=<4'>,5a=<5a'>: candidates fl-K (5e'), fl-K@4,
  fl-K@5a, fl-P, cube (today's engine), mmm, every src:<model>, clima, persist, apersist. Everything the scorer
  already writes (CRPS, MAE, bias, RMSE, rms spread/skill, randomised PIT, Brier + reliability at
  precip 0,1/1/5 mm/h, T < 0 °C, gust ≥ 14 m/s, wind ≥ 8 m/s, ETS; strata all/country/band/route/dnn/lead/season;
  crossing hours). Add, as flags: reliability diagrams per threshold in the markdown, and the region/band
  holdout skill of every stratum (`entry.cv.region/band`, claim B) as a table.
• Compare with the old cards (4, 5a, 5e) only as context: after the thinning change they are NOT like-for-like;
  the like-for-like numbers are the pairs inside FV-H.

────────────────────────────────────────────────────────────────────────────
Stage 2 — archive, the real inputs (14.–26.09., MOSMIX and today's products)
────────────────────────────────────────────────────────────────────────────
Per slot, point and valid hour, all candidates as of the slot time (nothing later than slotAt enters any input):
• product@5e — the FULL client chain: fuseCubePoint with learned tables 5e (fold β of the valid time's
  half-month for 14.–21.09. rows, full β after 21.09.), μ_c from the LOSO estimate of the point (NOT the
  product built with the station itself — that is a leak), learnedSpeed/learnedPrecip as in the tables' notes
  (decide and freeze in stage 0), the MOSMIX station member, anchor from obs ≤ slotAt;
• product@4 — the same chain with the Scorecard-4 tables (month fold 2026-09 β);
• cube — fuseCubePoint without learned tables (today's cube path), with station member;
• fl-K@5e — the learned stage alone on the cube member (as in the hindcast scorer), for the link to stage 1;
• mosmix — MOSMIX-L at the mapped station, deterministic (CRPS = MAE), plus its own probabilities where the
  planes carry them (e.g. precipitation probability → Brier);
• live — the archived production forecast (`live.byPoint`, its distribution where present);
• raw models at the point (height-corrected like rowFeatures), mmm, clima, persist.
Truth: the archive truth blocks, joined across slots, 23-UTC hour deduplicated, networks named. Scores as in
stage 1 per variable × lead bin (0–6, 7–24, 25–48, 51–120, 126–240 h; 246–336 h only if any row exists — say
so), strata country/band, DM on DAILY means (n_eff = issue days ≈ 12 — say it), day-block bootstrap CI.
Leak control: the same scorer with full-table β instead of fold β must look better on 14.–21.09. (proves the
fold switch works); a truth shifted by +1 h must destroy persist at lead 1.

────────────────────────────────────────────────────────────────────────────
Pre-registered claims (refine in stage 0, then freeze)
────────────────────────────────────────────────────────────────────────────
H1 fl-K (5e') is better than fl-K@4 (Scorecard-4 tables) — per variable × bin; the claim holds if no cell is
   significantly worse by > 1 % and the long bins (126–336 h) of T/Td/gust are significantly better.
H2 fl-K beats every single raw model and the multi-model mean per variable × bin (G-FL-1 against src:*/mmm).
H3 fl-K beats today's cube engine per variable × bin.
H4 calibration: rms spread/skill 0,85–1,2 and randomised PIT edge 0,15–0,25 (G-FL-2) — list every miss.
H5 against the station climatology: the crossing hour per variable (report, no pass/fail).
H6 archive: product@5e is better than MOSMIX at 0–48 h and 51–120 h for T, Td, wind, gust (point MAE AND CRPS,
   DE and wherever MOSMIX is mapped) — indicative only (≈ 12 issue days).
H7 archive: product@5e is better than live (today's product) and than product@4.
H8 no layer (country, band) worse than the reference by > 2 % in any of H1–H3.
For each claim: the rule, the exact candidates, rows and period, and the words the verdict will use
("signifikant besser", "gleichauf (n.s.)", "schlechter").

────────────────────────────────────────────────────────────────────────────
Deliverables
────────────────────────────────────────────────────────────────────────────
1. audit/fusion-validierung.md (+ audit/fusion-validierung/ for scripts, decision files, logs): diagnosis,
   frozen claims, protocol with run times and paths, the verdict per claim with the tables that back it, and a
   one-page German summary for Jan: what buscosun Fusion can honestly say today (where it is better, where
   not, on which data), and what would still be missing before the product claim.
2. Scorecards: C:\dev\buscosun-hindcast\score\<date>-fv-h (stage 1) and ...\score\<date>-fv-a (stage 2).
3. Findings V-FV-1… with value and sketch; decisions E-FV-1… in the phase document and MANUELLE-SCHRITTE.md
   (new section), CLAUDE.md status row replaced (not extended).
4. Gates on a free machine: typecheck, verify:fusion-fit (new blocks for --thin and the archive adapter, each
   with a negative control), verify:pv-cube, verify:point-client, verify:calib-fit, verify:pv-fusion 229/229,
   build, budget (state the totalJs; E-FL-11 is Jan's).

Out of scope (name only): new engine families, the anchor σ (M9), a new fit design, publishing anything,
switching the learned stage on in production (E-FX-10/11).
```
