# Kickoff-Prompt — Phase FI, Etappen AP-PA2 und AP12a

> Für eine neue Claude-Code-Session in `C:\dev\buscosun-web`. Geschrieben am 2026-09-16 nach AP1 (§9.2).
> Prompts an Claude Code auf Englisch (CLAUDE.md, Sprache & Konventionen).

```
You are continuing phase FI ("buscosun Fusion on the point cube, 0–336 h, answer < 2 s") in
C:\dev\buscosun-web. Read first, in this order: the status block at the top of CLAUDE.md,
then `audit/fusion-implementierung.md` §4 (work packages), §7.4 (decisions E-F-1…10), §9.0–§9.2
(AP0/AP1 protocol — especially V-FI-1, V-FI-5, V-FI-6, V-FI-7), then
`audit/punktdaten-umsetzungsplan.md` (the archive PA1). Check `git status`: AP1 may still be
uncommitted — that is expected. Do not commit or push anything in this session.

This session has TWO packages, in this order. Both are small, both touch things that need
Jan's push at the end, and both start a clock — that is why they come before AP2.

────────────────────────────────────────────────────────────────────────────
Package 1 — AP-PA2: fill the archive with AT and CH points (decision E-F-9)
────────────────────────────────────────────────────────────────────────────
Why: `scripts/punktarchiv/points.mjs` selects MOSMIX catalog ∩ DWD-POI ids ∩ WMO blocks
10/11/06 ∩ cube box ⇒ 243 points: DE 208, AT 23, "CH" 12 — and block 06 includes NL/DK/LU,
only 6 are real SMN stations. The POI requirement is a DE filter that starves AT and CH.
The truth collectors for TAWES (GeoSphere) and SMN (MeteoSwiss) already exist in
`scripts/punktarchiv/collect.mjs`. Every day without PA2 is a day of missing AT/CH cases for
the backtest (AP9) — the archive cron runs once a day at 23:10 UTC and clones
`buscosun-web/main`, so the change is only live after Jan pushes `main`.

Do:
1. Diagnosis first (write it as §9.3 in `audit/fusion-implementierung.md` before code):
   which TAWES and SMN stations have hourly truth the collector can read, which lie in the
   cube box (45.5–55.5 °N / 5.5–17.5 °E), how the collector maps a point to the MOSMIX
   station product today (nearest catalog station = the point itself, otherwise a note) and
   what that means for points whose id is a TAWES/SMN id. Measure, do not assume: count the
   candidates, check the truth endpoints for a handful of ids, note the rr1 trap
   (TAWES/SMN rr1 = 10-min rate × 6 vs POI hourly sums — see plan §1.2) and how PA1 handles it.
2. Extend the selection rule in `points.mjs` (pure function + self-test, as now): keep DE
   unchanged; add AT points whose truth is TAWES and CH points whose truth is SMN, without
   the POI requirement; unique by id and by rounded position; DEM finite; inside the box.
   Target density: at least what DE has (208 points on 357 000 km² ⇒ AT ≥ 50, CH ≥ 25) —
   report the actual counts per country and per truth source; if a country has fewer
   usable stations, say so with the reason, do not pad.
3. Regenerate `points.json`, run the collector ONCE locally into a scratch directory or the
   local clone `C:\dev\buscosun-archiv` WITHOUT pushing, and report: slot size before/after
   (today ≈ 10 MiB gz for 243 points), per-point coverage (cube t1/t2/t3, station product,
   nowcast, truth), errors. The slot must stay proportionate — give the measured bytes per
   point and the projected size per year.
4. Verifier: extend `npm run verify:punktarchiv` (today 56/56) with checks for the new rule,
   including negative controls (a point outside the box, a point without a truth source, a
   duplicate position ⇒ rejected). `npm run typecheck` 0.
5. Document in §9.3: counts, sizes, what a PA2 point looks like in the slot, what Jan has to
   do (push `buscosun-web/main` before 23:10 UTC so tonight's slot already carries the
   points) and from which slot on the AT/CH cases start.

────────────────────────────────────────────────────────────────────────────
Package 2 — AP12a: CDN warm-up and manifest purge in the point publisher (decision E-F-1)
────────────────────────────────────────────────────────────────────────────
Why: `scripts/point/publish-point.mjs` purges only `point/index.json` after the push
(around line 439, `purgeIndexUntilFresh`). `point/<run>/run.json` is merged per tier and
pruned, so the `@main` copy at the CDN is stale for up to 12 h (V-FI-1 — the client now
reads it pinned, the purge is still owed). The chunks of a fresh run are an edge MISS for the
first user: TTFB p50 0.64 s / p90 2.6 s (§9.0.1), 0.9–2.3 s in the AP1 matrix, and jsDelivr
sometimes answers 403 after 1–8 s instead of 200 or 404 (V-FI-5). Warm-up after the push is
the only cure for the cold case; the reader's hedge/raw fallback only limits the damage.

Do:
1. Diagnosis first (§9.4): read `warmCdnFiles`, `purgeUrlOf`, `purgeIndexUntilFresh` in
   `scripts/lib/repackManifest.mjs` (the LZ1 pattern: browser-like `Accept-Encoding`, because
   the CDN caches one variant per encoding — `Vary: Accept-Encoding`) and the publish flow in
   `publish-point.mjs`; list exactly which files a tier job touches (chunks of the tier,
   `run.json` of that run AND of every run dir the merge/prune touched, stations bundles and
   `stations.json` when the stations step ran, changed static products, `index.json`).
   Measure the warm-up cost against the LIVE run files (GET only — that is harmless and is
   the goal): bytes, duration with the existing concurrency, count of 200 / 403 / timeouts.
2. Implement, reusing the helpers (no second copy — if `warmCdnFiles` needs something,
   change it additively):
   • purge every `run.json` the job touched, then `index.json` (existing), then verify
     freshness the way `purgeIndexUntilFresh` does;
   • warm all files of the published tier with the browser encoding header; treat 403 and
     timeouts as FAILURES (V-FI-5): retry with backoff, count them, and print ok/403/timeout
     and the duration in the job log. No new artifact in the data repo (R10: 307 MiB, no
     room; the log is the record).
   • keep it inside the job budget: `JOB_MAX_MIN_BY_TIER` {20, 15, 10}, measured t1 build max
     11.1 min — the warm-up must fit in the remaining margin; measure and state it.
   • a kill switch (env, like the other `POINT_*` switches) and a dry-run flag.
3. Template `workflow-point.yml` (the copy into the data repo is Jan's push — prepare the
   exact diff and the copy command in MANUELLE-SCHRITTE.md style, do not copy yourself).
   `npm run verify:point-data` (today 947/947) reads the template and the publisher: add
   checks that the publisher purges every touched run.json and warms after a successful
   push, with negative controls (a publisher without the purge fails; 403 counted as
   failure). `npm run typecheck` 0. NEVER run a purge against the live CDN from this
   machine — purging is a production action and is Jan's gate; GET warm-ups are fine.
4. Acceptance is a measurement, not a claim: (a) locally, the dry warm-up report against the
   live run; (b) after Jan's push and the first cron run with the new publisher, run
   `npm run verify:pv-latency -- --only=bundle --profiles=desktop-none` and compare the
   cold-new HIT/MISS counts and the core p50 with the AP1 matrix
   (`audit/fusion-implementierung/latency/2026-09-16T14-33-41-921Z.json`: cold core p50
   1 458 ms, 37 MISS in 10 places). Write §9.4 with before/after; if (b) cannot happen in
   this session, say so and leave the exact command for the next one.

────────────────────────────────────────────────────────────────────────────
Rules for the whole session
────────────────────────────────────────────────────────────────────────────
• Diagnosis → plan → implement → verify → gate. Every number in the phase document is
  measured or marked as set. No constants without justification, no accuracy claims.
• STOPP & FRAGEN stays: do not touch `src/pointForecast/fusion/*`, no dependency changes,
  no purge/dispatch against production, no commits, no pushes. Jan's gates: push of
  `buscosun-web/main`, copy of the workflow template into `buscosun-data`, archive pushes.
• Run typecheck and the verifiers yourself, without asking. PowerShell: never start a
  verifier with `2>&1`. The Bash tool truncates commands at ≈ 8 KB — write large files with
  the Write tool.
• End with a report that stands on its own: what was measured, what changed (files), the
  gate results with numbers, what is Jan's to do (with the exact commands and the 23:10 UTC
  deadline for the archive), and what is deliberately left open. Then update the status
  block in CLAUDE.md (keep it a status, not a chronicle).
```
