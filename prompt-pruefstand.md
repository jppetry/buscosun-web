# Kickoff — Prüfstand (fixed verification bench for buscosun Fusion)

You are working in the `buscosun-web` repo. Goal: build, once, a fixed and deterministic verification routine that
scores every new buscosun Fusion version against real station measurements (DWD, GeoSphere, MeteoSwiss) by always the
same criteria, and compares it with the champion and all earlier versions. After the build, Jan only runs
`/pruefe-fusion <n>` (or `/pruefe-fusion 5e 6 7 8 vergleich`) — the routine itself is fixed code, never re-derived.

## Read first
1. `CLAUDE.md` (conventions, runner factor, `npm run` swallows `--` arguments).
2. `audit/pruefstand-plan.md` — the plan. Authoritative, written in German. Phases PS-0 … PS-4, each with steps, a
   gate, and hard limits (§10).
3. `audit/pruefstand-konzept.md` — the concept (German transcript of Jan's Claude Doc). Details behind "Konzept §n".
   On conflict, the plan wins.

## How to work
- Execute **one phase per session**. Start with **PS-0 (diagnosis only)**. No code in the repo during PS-0; throwaway
  probes go to a scratch folder outside all repos.
- **Answer D-PS-2 first** (archive: is `cube` stored per point or as a grid, which cells per point, how many station
  network sites are covered in all three tiers, are anchor values at issue time in the slot, bytes per point and slot).
  Post the result immediately as a short German interim note for Jan, because E-PS-11 (extending the archive point
  list) is time-critical: every day the archive does not store a station is a test day lost for good. Then continue.
- D-PS-7 covers versions 5e, 6, 7 and 8: per version commit/tag, whether the fitted tables exist at that commit in this
  repo or only lived in `buscosun-data`, live fetches at runtime, schema-3 compatibility, determinism, stored outputs
  for a fidelity check. Use a `git worktree` outside the repo and `npm ci`; run on 1 archive slot × 3 points.
- Section §1 of the plan is built from project notes, not from the code. Verify every anchor; list every deviation as an
  anchor correction in §14.
- Write results into §14 and add measured values to the decision table §9 (leave Jan's column empty). MD content in
  German, like the other files in `audit/`. Follow the codebase's naming conventions; German names in the plan are
  proposals.
- At the end of each phase: run its gate checks, fill its gate table in §14, give Jan a short German summary (what was
  done, gate status, open decisions), then **STOP**. Jan reviews, commits and pushes.
- When Jan says „weiter mit PS-<k>“, execute exactly that phase per the plan and stop at its gate.

## Hard limits (summary of plan §10 — the plan wins on conflict)
- Do not modify buscosun Fusion: `src/pointForecast/**`, its tables, options, `FUSION*` switches or the fit pipeline.
  Call it only. If replay or anchor masking needs an engine change: STOP and ask.
- `buscosun-archiv`, `buscosun-hindcast` and `C:\dev\buscosun-data` are read-only (`git pull --ff-only` in the archive
  clone is allowed). No pushes, no commits, no workflows in other repos.
- No new dependency without asking (E-PS-10).
- Never invent constants: every number in protocol P1 is measured in PS-0 or marked as Jan's decision.
- Never filter truth by a forecast. Never open the vault (Tresor) or track P outside mode `abnahme`.
- Never reconstruct an old version with substitute tables or a refit; if its tables are gone, mark it
  "nicht rekonstruierbar".
- No accuracy claim without a run; if data cannot support a statement, say so explicitly.

## Deliverables of PS-0
- Interim note on D-PS-2 (early, see above).
- Plan §14 filled (D-PS-1 … D-PS-11 with evidence, anchor corrections to §1, verdict per old version).
- Plan §9 with measured values per option and your recommendation; Jan's column left empty.
- CLAUDE.md document map: entries for `audit/pruefstand-plan.md`, `audit/pruefstand-konzept.md`, `prompt-pruefstand.md`.
- A short German summary for Jan: findings that change the plan, risks for gate G-PS2 (replay fidelity), open questions.
