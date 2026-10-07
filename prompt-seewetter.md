# Kickoff prompt — Phase SW: Seewetter, stage 1 (SW-0 … SW-6) in auto mode (07.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`, started in **auto mode**.
> Prompts to Claude Code are in English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo. Then read, in this order:

1. `audit/seewetter-plan.md` — the plan for phase SW. Your work order is SW-0 to SW-6 (stage 1).
2. `audit/seewetter-datenpruefung.md` — what the source analysis measured on 07.10.2026 (grids, sea-point counts,
   traps, arrival times, text formats, spot sample). Reproduce these numbers or correct them with evidence.
3. `audit/seewetter-konzept.md` — the feature concept (direction; where it differs from the plan, the plan wins —
   the deviations are listed at the top).
4. `audit/seewetter/fixtures/README.md` and the five raw DWD bulletins next to it (byte-exact, with SHA-256).
5. `reference/README-seewetter.md`, `reference/seewetter-desktop.dc.html`, `reference/seewetter-mobile.dc.html` — the
   UI target for SW-4 … SW-6 and the pixel diff.
6. Patterns to reuse before you write anything: `audit/autobahnwetter-plan.md` and `audit/autobahnwetter.md` (same
   phase structure, data-repo and archive practice), `src/road/*`, `scripts/road/*`, `scripts/radar-mirror/`,
   `src/sources/gribDecode.ts`, `src/sources/radarImg.ts`, `scripts/lib/{bz2,png,register-ts}.mjs`.

## Goal (Jan, 07.10.2026)

A new tile and page „Seewetter“ (`/seewetter`, tile 12, palette 13) for the German North Sea and Baltic coast: wave
fields from DWD CWAM, spot time series with wind and gusts from buscosun Fusion, the official DWD sea-weather texts and
warning status verbatim, profiles (kite, wing, SUP, dinghy, yacht, motorboat, angling) with open limits. Data come
pre-processed from `buscosun-data`; one shared contract with checkers blocks implausible values in producer and client.

**This session:** all of stage 1 — SW-0 to SW-6 — in auto mode, plus starting the shadow run (Gate B) and the daily
archive needed for Gate D. SW-7 (EWAM holiday areas) and SW-8 are out of scope.

## Jan's authorizations for this session

They override the matching CLAUDE.md rules for this phase only — nothing else.

1. **Auto mode, no questions.** Work through without asking. Where CLAUDE.md or the plan says STOP & ASK or „Jans
   Gate“ for something listed here, decide yourself: take the plan's recommendation unless your measurements
   contradict it, otherwise the safest reversible option. Record every such decision with evidence in
   `audit/seewetter.md` (section „Entscheidungen im Auto-Modus“) and list it in `MANUELLE-SCHRITTE.md` for Jan's
   review. Gate A (E-SW-1 … E-SW-9) is delegated to you on exactly these terms. A real blocker never stops the whole
   session: record it, take the fallback, continue with the next package.
2. **Data and archive repos.** You may commit and push to `buscosun-data` and `buscosun-archiv` on your own whenever the
   work needs it: the `sea/` line, the workflow(s) of the sea line, README sections, static files (spot catalogue,
   mask hashes), and a daily archive `sea/v1/` in `buscosun-archiv` (spot series per run, the POI observations the
   spots are checked against, the text issues) like `road/v1/`. Rules:
   - Pull/rebase before every commit; never `--force`, never rewrite history, never delete archive days.
   - Touch only `sea/`, the sea workflow files and the README section. Never change or delete other lines (`runs/`,
     `radar/`, `point/`, `road/`) or their workflows — the one exception is the guarded radar-mirror registration
     below.
   - Every publish copies the complete `sea/` set (healing against the force-push of the map and point lines, like
     `road/`). Stay within the jsDelivr limits measured in SW-0 (20 MB per file, 150 MB per package); if `sea/` does
     not fit, reduce steps or crop — do not create a new repository.
   - After every push verify: file reachable via jsDelivr/raw, workflow run green (`gh run list` / `gh run view`),
     and the latest radar, point and road publishes still fresh. If anything broke: `git revert` at once, push, log it.
   - Conventional Commits with scope `sea`; every data-repo and archive commit hash goes into the audit.
3. **nivo for charts and tables.** Visualisations — charts and tabular views — should preferably use nivo.
   `@nivo/line` is already in the bundle; further `@nivo/*` packages at the same version as `@nivo/core` (e.g.
   `@nivo/heatmap`, `@nivo/bar`) are approved for this phase — this lifts the dependency stop for `@nivo/*` only. Keep
   them in the lazy chunk of `src/sea/`, run `npm run budget`, raise a limit only with a written note. The Verlauf is two
   stacked `@nivo/line` charts on one time axis (wind with gust band in kn; Hs total, wind sea, swell in m — never
   stacked areas, Hs² = Hs_ws² + Hs_sw²). The Stundenband may be a nivo grid (e.g. heatmap cells coloured by profile
   class) if it keeps: numbers printed in the cells, sticky label column, horizontal scroll, click and keyboard select
   the hour, day separators, night shading, table semantics for screen readers. If nivo cannot meet that, use a plain
   table and say why.

## What stays Jan's, even in auto mode

- **No commits or pushes in `buscosun-web`.** Leave all changes there uncommitted (Jan's gate, as in every phase).
- **`SEA_LIVE` stays `false`**; `noindex`, no sitemap. Jan switches the page on after Gates B–D.
- No shader/WebGL pipeline changes (the Hs surface is coloured on the CPU and handed to MapLibre as an image), no
  changes to the buscosun Fusion engine (read its output only), no Edge Functions, warm crons or manifest mechanics,
  no dependency changes other than `@nivo/*`, no deleting components, no CDN purges, no manual dispatch of other
  lines' crons.
- Honesty rules: every value keeps its provenance (model / Fusion / measured / official); WAM model wind is never shown
  as wind; official texts only verbatim with issue time and number; „passt“ is never „sicher“; no data is never drawn
  as calm sea.

## The producer-on-main dependency (read before SW-2)

Workflows in the data repo sparse-clone their producer code from `buscosun-web/main`, and you may not push
`buscosun-web`. Therefore:

- Every sea workflow you push must check that its producer script exists in the clone; if not, it logs „producer not
  on main yet“ and exits 0 — no red runs, no partial publish. It then starts on its own after Jan's push.
- To build and verify the page against real data before that, run the producer locally and push its output to
  `buscosun-data` (allowed).
- The radar mirror is production-critical. Change its copy in `buscosun-data` only additively, with a guarded dynamic
  import so that a missing sea module is a no-op, and only after the mirror tests (`scripts/radar-mirror-test/`) pass
  with and without the module. If you cannot prove that, run the text line as its own guarded workflow and record the
  deviation (E-SW-4).

## Procedure (Diagnose-First; each package ends with verifier output and a written gate)

1. **SW-0 spike** exactly as in the plan: anchors verified in `audit/seewetter.md`; CWAM decoded in Node with
   `gribDecode.ts` (if the bitmap or row order is wrong, an additive fix with its own verifier is allowed — record it);
   arrival times from `content.log.bz2`; budget of one full run encoded to `f/` and `c/`; size of `buscosun-data`
   against the jsDelivr limits; text collector `scripts/sea/spike/collect-text.mjs` (raw bytes + SHA-256 into
   `audit/seewetter/fixtures/collected/`, keep it running for the session); open questions (CAP coast/lake warnings in
   the CAP data the repo already reads, sea-area geometry and licence, Fusion cube coverage at the spots, CWAM water
   level). Be gentle with the DWD server: sequential downloads.
2. **Gate A (auto):** decide E-SW-1 … E-SW-9 per authorization 1.
3. **SW-1** `src/sea/seaContract.ts` + `verify:sea-contract`, `verify:sea-decode`, `verify:sea-text` (npm aliases in
   the repo style). Rules exactly as in the plan's table; text end markers as in the datenpruefung §6. Add
   `audit/seewetter/fixtures/** -text` to `.gitattributes` (create it if missing) so Git never rewrites the fixtures.
4. **SW-2** field line `scripts/sea/sea-derive.mjs` (+ `verify:sea-derive` against a local bare repo, like
   `verify:road-derive`), layout `sea/v1/…` as in the plan, budget held. **SW-3** text line (mirror product or own
   workflow, see above). Push the guarded workflow(s) and a first locally produced run to `buscosun-data`; set up the
   archive workflow in `buscosun-archiv`.
5. **Gate B starts:** note in the audit when the guarded workflows will pick up the producer (after Jan's push of
   `buscosun-web`) and what Jan checks after 7 days (plan, Gate B criteria). Do not wait idle for it.
6. **SW-4** entry: tile 12, palette 13, rail icon, route `/seewetter` + aliases, `seaFlag.ts` (`?sea=1`), share/OG.
   **SW-5** page modules as in the plan (`SeaPage`, `SeaMap`, `SeaDock`, `SeaBand`, `SeaReadout`, `seaClient`,
   `seaState`, `seaDeck.css`, tokens `--sw-*` additive in `src/designTokens.css`). **SW-6** profiles, classes, windows,
   shore angle exactly as in the plan's table; limits editable and stored locally. Every value needs its source label.
7. **Gate C preparation:** `verify:sea-ui`, `sea-ui-diff.mjs` against the reference at 1440×900 and 390×844 (DPR 3),
   `npm run typecheck`, `build`, `budget`, the routing/SEO/share verifiers, the five self-verification questions from
   CLAUDE.md **and** the five Seewetter checks in the plan, all in writing with evidence. Desktop regression anywhere
   else = phase failed. `SEA_LIVE` stays off.
8. **Gate D preparation:** the archive collects spot wind (Fusion) and POI measurements (Arkona 10091 delivers; check
   which other coastal POI stations do) so that the 14-day comparison can run later; write the evaluation script now.

## Deliverables

- `audit/seewetter.md`: anchors, SW-0 measurements next to the datenpruefung values, „Entscheidungen im Auto-Modus“,
  implementation log per package with verifier output, every data-repo and archive commit hash, gate tables A–D.
- `src/sea/*`, `scripts/sea/*`, verifiers with npm aliases — all uncommitted in `buscosun-web`.
- Commits in `buscosun-data` (`sea/` line, guarded workflow(s), README section) and `buscosun-archiv` (`sea/v1/`
  archive workflow), each verified after push.
- `MANUELLE-SCHRITTE.md`: new section „Seewetter (Phase SW)“ — your auto decisions for review, the `buscosun-web`
  push that activates the shadow run, what to check after 7 and 14 days, the `SEA_LIVE` switch.
- `CLAUDE.md`: one status row for phase SW (current state only, no chronicle).
- A short German summary for Jan at the end: what was built, what is live in the data repos, what was measured
  differently from the analysis, which decisions you took and what is left for him.
