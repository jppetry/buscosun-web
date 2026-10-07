# Kickoff prompt — Phase F10: autonomous development of buscosun Fusion 10 (4 h, auto mode, expert team) (07.10.2026)

> **Before you paste this (Jan):** commit all pending phases in `buscosun-web` (PS/PA5 with the bench, FR-2, SW, …) so
> that `git status` is clean under `src/`, `scripts/` and `audit/pruefstand/` — the bench registers a version only at a
> commit with a clean `src/`, and the session must not sweep your work into its commits. Then start a fresh Claude Code
> session in `C:\dev\buscosun-web` in **auto mode** and paste the block below.
> Prompts to Claude Code are in English; all documentation the session writes stays German (CLAUDE.md, Sprache &
> Konventionen).

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo — and `agents.md` (team operating model). Then read, in this order:

1. `audit/fusion10-vorbereitung/README.md` and every file it lists — the material of the analysis session of 07.10.2026
   (evaluation of Fusion 9, improvement hints, per-cell metrics, station density of the new archive, historical data
   sources). **Findings and hints, not a specification.** Verify what you use; where code or data say otherwise, follow
   the code and the data.
2. The bench: `audit/pruefstand/README.md`, `.claude/skills/pruefe-fusion/SKILL.md`, `audit/pruefstand-plan.md` §10, the
   header of `scripts/pruefstand/run.mjs`, `scripts/pruefstand/lib/{register,replay,protokoll,urteil}.mjs`,
   `src/pruefstand/adapter.ts`, `scripts/pruefstand/protokoll/p1/{protokoll,tresor}.json`,
   `scripts/pruefstand/register/fusion-9.json`.
3. How a new stand is added: `src/pointForecast/fusion/fusionRelease.ts` and `audit/fusion-release.md` §4.
4. The engine and its history: `src/pointForecast/fusion/` (start with `fuse.ts`, `dist.ts`, `uncertainty.ts`,
   `priors.ts`, `stationValue.ts`, `anchor.ts`), `audit/fusion-lernphase.md` (fit pipeline, V-FL-23/24),
   `audit/fusion-ausbau.md` (switches AX-7 … AX-11 and V-AX-19), `audit/fusion-expertenbericht-2026-09-29.md` §5,
   `fusion-verbesserungen-2026-09-29.md`.

## Goal (Jan, 07.10.2026)

Develop **buscosun Fusion 10** — a stand that is measurably better than the champion **buscosun Fusion 9** — and test it
on the Prüfstand (protocol P1). You have **4 hours of wall-clock time**. You work as the head of an expert department and
coordinate specialist agents that pursue this goal together.

**What counts as success (say honestly which level you reached):**

- **Level 1 (minimum):** Fusion 10 is registered at a commit; the full test (`--modus=voll`, development set) prints a
  progress index against Fusion 9 above 0 whose 95 % interval lies above 0; the gate hints G2–G4 are green; no
  overfitting warning.
- **Level 2 (target):** the single final `--modus=abnahme` prints on track R (the vault) a progress index against
  Fusion 9 whose 95 % interval lies above 0, with G2, G3 and G4 green — verdict „Kandidat“. G1 says „nicht nachweisbar“
  because track P is empty on the freeze day; that is expected. If track R is significantly *worse*, G1 turns red and the
  verdict is „abgelehnt“ — report it as it is. The champion decision is Jan's, after at least 4 mature track-P days.
- Neither level reached: a clean „nicht nachweisbar“ with documented learnings is a valid result. Never tune towards the
  vault, never present a development-set gain as proof.

## Preconditions — check first

- `git status`: no uncommitted changes under `src/`, `scripts/` or `audit/pruefstand/` that are not yours. If there are:
  do **not** commit, stash or discard them. Record it in the audit, skip every bench call, build and pre-screen the
  candidates in worktrees with the fit pipeline's own scorers, and say so plainly in the summary.
- `git diff 0ad0615 HEAD -- src/pointForecast src/pruefstand`: everything committed after Fusion 9's register commit is
  part of your comparison. List it in the diagnosis; your identity check (authorization 2) runs against the branch base
  (`HEAD` at start), and you state separately whether that base still computes exactly Fusion 9.
- `git -C C:\dev\buscosun-archiv pull --ff-only` once (read only). The first bench run refreshes truth W1 (network); pass
  `--offline` to every later run of the session.

## Time box (4 h, hard)

Write the start time (`Get-Date`, and the UTC date — the freeze date is in UTC) into `audit/fusion-10.md` and check the
clock at every phase boundary.

| Time | Phase |
|---|---|
| 0:00–0:30 | Orientation and diagnosis (Diagnose-First). Right at the start, launch the warm-up in the background: `--modus=vergleich --versionen=fusion-8,fusion-9` on the development set — it refreshes W1 and fills the conserves of the new archive days for the bench's versions and references (several minutes). |
| 0:30–0:45 | Department kick-off: each specialist proposes at most two candidates (expected gain, which bench set and which **core** cells can show it, effort, risk); the red team critiques; you pick a portfolio of at most four and write down why. |
| 0:45–2:15 | Build and screen: specialists build in their own worktrees; the verification role screens one candidate at a time (one id, one runner — screening is serial; budget about 12 min per `voll` run, less for `schnell`). |
| 2:15–2:45 | Integrate what showed gain into one stand; `voll` again (interactions); decide on the final `abnahme`. |
| 2:45–3:45 | Final `abnahme` — the only opening of the vault, about one hour (70 vault issues, development set, A/A self-check, determinism). Start it only if Level 1 holds and the registration printed „Spur R sauber“. If it cannot start by 2:45, skip it and say so. |
| 3:45–4:00 | Documentation, `MANUELLE-SCHRITTE.md`, summary. Stop at 4:00 even if work is unfinished; document the state. |

Runtimes from the `pruefe-fusion` skill: about 30 s per archive day and version, about 15 s per vault issue and version.

## The expert department

Spawn the specialists as subagents (agent teams if enabled). Ownership is disjoint (`agents.md` §1, §3). Every
implementing specialist works in its own git worktree on its own branch; **nobody but you touches the main checkout**,
and you change it only between bench runs (see „Bench discipline“).

| Role | Owns | Delivers |
|---|---|---|
| **Coordinator (you)** | plan, clock, portfolio, integration branch `fusion-10` in the main checkout, the `FUSION_RELEASES` entry, commits and tags | decisions with evidence, integrated stand, summary |
| **Statistics & calibration** | blending towards climatology by lead time, σ scaling (EMOS-like), gust bias, distribution of cloud cover; branch `f10/stat` | candidates as new modules + minimal hooks |
| **Terrain & downscaling** | points without own station (role B): weighting of the neighbour anchor and station value by distance and terrain similarity, night/cold-pool term, lapse rate and inversions; branch `f10/terrain` | candidates, effect per country (CH first) |
| **Long range & ensembles** | ensemble mean in t3, weight ramps across the seams 48/120/180 h, the built but default-off switches; branch `f10/range` | candidates |
| **Data & pipeline** | fits and tables outside the vault window, longer station climatologies if feasible in time, any change in `buscosun-data`/`buscosun-archiv`, feasibility notes on large sources (HOSTRADA, ICON-DREAM-EU, INCA-v1 deadline); branch `f10/data` | tables with sha256 and fit window, data-repo hashes, notes |
| **Verification & red team** | the **only** role that runs `scripts/pruefstand/run.mjs` (registration included, on your instruction); leak and overfitting checks; adversarial review of every claim | run log, veto on integration |

Each specialist starts with a diagnosis of at most 15 lines in its section of `audit/fusion-10.md` (anchors with
`Datei:Zeile`), builds behind an option with a named fallback, runs `npm run typecheck`, and hands over the expected
effect and the bench set and core cells where it should show.

## Bench mechanics (verified against the code — read before the first candidate)

- Call form (PowerShell, in the repo, never `npm run`, never `2>&1`):
  `node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs <args>`
- **Registration** needs `FUSION_CURRENT === 10` in committed code and a clean `src/` (`run.mjs` registerNew). A
  `FUSION_RELEASES` entry carries exactly one option, so Fusion 10 is **one** combined option (for example a numeric level
  that switches the bundle of sub-features); sub-feature constants live in code. Only `fusion.client.json`,
  `stack.client.json` and `stations.json` can be registered as new tables (`--tabellen=<dir>`); `loso` stays the
  champion's. Flow per candidate: you commit on `fusion-10` and tag it (`f10-lauf-<n>`, so a later squash merge cannot
  orphan it); verification runs `--registriere=fusion-10 --neu --freeze=<UTC session date> [--tabellen=… --fit-learned=von..bis --fit-stack=von..bis]`
  and then `--kandidat=fusion-10 --modus=schnell` (screening) or `--modus=voll`. No ids with letters (`fusion-10a`
  becomes „buscosun Fusion NaN“).
- The register's `freezeNote` will say „von Jan bei der Registrierung genannt“ (hardcoded). Add a line to its `notes`
  that the freeze was set under authorization 4 (notes are not part of the model hash).
- `--fit-*` copies `source`/`what` from the champion, and the contamination check sees only those windows: a fit you
  bake into code or a stack fitted on the hindcast escapes it. Verification checks every fit window by hand against the
  vault rule below and writes the result into the audit.
- `schnell` prints only the progress index for role B and A — no gates, cells or report. `voll` and `abnahme` write
  `audit/pruefstand/berichte/fusion-10/<date>-<mode>/` and overwrite it on the same day: copy the folder after every run
  to `audit/fusion-10/laeufe/<n>-<mode>/`.
- **Exit codes** (they override the skill's „STOPP, keinen Workaround“ only as written here): 2 → answer with
  authorization 4; 3 (self-check of the bench failed) → stop using the bench, report, never patch the bench; 4 (adapter
  contract) → change the candidate so it keeps the engine interface; a new adapter generation only if unavoidable and only
  if `scripts/pruefstand/treue.mjs` proves the champion's stored rows unchanged; 5 (G4 red) → the candidate is rejected,
  fix it; 1 → report the message verbatim.
- Log every run in `audit/fusion-10.md`: command, mode, sets and days, progress index with interval, gates, best and
  worst core cells, warnings, report copy.

## Bench discipline

- While a bench run is going, nobody changes the main checkout: when a commit's `src/` equals `HEAD`'s, the engine is
  imported from the live checkout, and cached results are never recomputed.
- Before re-registering `fusion-10` at a new commit, remove the old engine worktree with
  `git worktree remove --force C:\dev\buscosun-pruefstand\worktrees\fusion-10` — the only deletion allowed under
  `C:\dev\buscosun-pruefstand`. No junctions into worktrees; nothing else there is touched by hand.
- Read only, never modified: `C:\dev\buscosun-hindcast` (its `features/points.v1.json` is part of every model hash — an
  edit forces a recompute of all versions), the archive slots, truth W1, the register entries of Fusion 5e … 9.

## Jan's authorizations for this session

They override the matching rules in CLAUDE.md, `audit/pruefstand-plan.md` §10 and the `pruefe-fusion` skill for this
phase only — nothing else.

1. **Auto mode, no questions.** Where a rule says STOP & ASK or „Jans Gate“ for something listed here, decide yourself:
   the safest reversible option that serves the goal. Record every such decision with evidence in `audit/fusion-10.md`
   („Entscheidungen im Auto-Modus“) and list it in `MANUELLE-SCHRITTE.md`. A blocker never stops the session: record it,
   take the fallback, continue with the next candidate.
2. **Fusion engine and fit pipeline changes are allowed** (normally STOP & ASK; plan §10 forbids them for the bench
   build), under Rule 2: every new path sits behind the Fusion 10 option with a named fallback, and with the option off the
   engine computes exactly what the branch base computes. Prove it with a verifier (e.g. `verify:fusion10-identity`:
   branch base against `fusion-10`, option off, at least three archive slots, all points, byte-identical) **including a
   negative control** (option on must differ).
3. **Bench modes:** `schnell` and `voll` freely; `vergleich` on the development set allowed; `abnahme` **exactly once**,
   for the final Fusion 10 — it is logged before it computes, so there is no retry. No `vergleich --tresor`.
4. **Register:** register `fusion-10` with freeze = the UTC session date (a setting — say so in the register notes and the
   audit) and the fit windows you actually used. Status stays „kandidat“; never set „champion“; never touch the entries of
   Fusion 5e … 9.
5. **Data and archive repos** — only where it serves the goal:
   - `buscosun-data`: additive new paths only (name them in the audit), never change what the live product reads in a
     way that changes today's output; the map line force-pushes the repo, so verify after every push and do not rely on
     the files for the bench.
   - `buscosun-archiv`: only if indispensable; additive only, never touch existing day folders, never push between
     22:30 and 23:59 UTC (the archive cron runs at 23:10 UTC and clones `buscosun-web/main`, so collector changes take
     effect only after Jan's push — do not rely on them in this session).
   - Pull/rebase before every commit; never `--force`, never rewrite history, never delete anything. After every push
     verify: file reachable (jsDelivr/raw), workflow runs green (`gh run list`), radar, point, road and sea lines still
     fresh. If anything broke: `git revert` at once, push, log it. Conventional Commits with scope `fusion`; every hash
     into the audit.
6. **Local data:** at most 20 GB of new data, outside all Git repos (e.g. `C:\dev\buscosun-fusion10-data`); sequential,
   gentle downloads from DWD, GeoSphere and MeteoSwiss.

## What stays Jan's, even in auto mode

- **No push and no merge to `buscosun-web/main`.** Commits only on local branches (`fusion-10`, `f10/*`). The commit with
  the `n: 10` entry switched on would switch every part of the platform to Fusion 10 once it is on `main` — Jan decides.
- Champion status, live switch, CDN purges, cron dispatches of other lines.
- Protocol P1, the station network, the vault and truth W1 stay sealed. Ideas for a fairer bench go into the audit as a
  P2 proposal.
- No dependency changes, no shader/WebGL pipeline, no Edge Functions or warm crons, no deleting components
  (Funktionserhalt).
- Honesty: no accuracy claim without a run; „nicht nachweisbar“ stays „nicht nachweisbar“; every number with its set.

## Leakage rules (the vault)

- Vault window 2024-04-01 … 2025-08-31 (`scripts/pruefstand/protokoll/p1/tresor.json`): no fit, table, climatology or
  tuning may use data whose issue or valid time lies inside it — with 14-day leads that excludes issues from 2024-03-18.
  Climatologies only if their period ends before 2024-03-18 (e.g. 1991–2020 normals) or excludes the window; declare
  them in the register notes.
- Fusion 9's track-R results were already opened on 05.10. and appear in the preparation material
  (`fusion9-bewertung.md`, the `spurR` rows of `kennzahlen-fusion9.csv`). Use them as context only: choose and tune
  candidates on development-set evidence, and say in the audit that the vault test of Fusion 10 is therefore not fully
  blind. Track P stays the clean judge.
- Do not look at Fusion 10's vault results before the final `abnahme`, and change nothing after it.
- The development set contains the stack-fit days (14.–28.09.) and every archive day you fit on; declare every fit window.

## Hints from the analysis session (not a specification)

Details, evidence and pitfalls: `audit/fusion10-vorbereitung/hinweise-fuer-fusion10.md`. In short:

1. **What moves the index:** core cells are temperature, dew point, wind, gust up to 48 h, precipitation amount and
   „wet“; cloud cover, wind direction and gust after 48 h are side cells (`protokoll.json`). Long-range losses in gust
   and cloud cover matter for the product, not for the index.
2. **Long range below climatology:** on the development set wind falls to −17 % (120–240 h) and −54 % (240–336 h) CRPS
   skill against station climatology; the climatology step is off since Fusion 6 (`priorShrink: false`); V-FL-23
   (climatology missing as predictor). A lead-dependent blend towards climatology is the most promising cleanly
   measurable candidate (wind, temperature and dew point are core cells there).
3. **Ensemble mean in t3** (expert report §5 rank 4; AX-7 planes in the archive since 30.09.) — check first whether the
   hindcast slots of track R carry the needed ensemble data; otherwise its effect is only visible on the development set.
4. **Calibration:** wind too narrow from 48 h, gust (0–48 h) and precipitation amount too wide.
5. **Points without own station:** role B at 0–6 h (always night in the bench) is worse than the nearest raw cell
   (1.49 vs 1.45 K) and far behind MOSMIX-L at the station (0.85 K); Switzerland gains nothing over the raw cell. Suspect:
   neighbour anchor and station value from unrepresentative stations. Measurable only on the development set.
6. **Already measured, skip:** the 1991–2020 climate grid (AX-9) moves 0 of 72 cells in stage `fs` (V-AX-19). The other
   default-off switches (AX-7 `ensMember`, AX-8 `stationSource`, AX-10 `incaAnchor`, `priorShrink`) are cheap to try if
   the replay passes them through.
7. **Archive schema 5** (since 05.10.: 957 temperature and 2 001 precipitation stations) is too short to fit on; at most a
   plausibility check.

Selection heuristic for 4 hours: prefer candidates that change core cells which track R can show (long range,
calibration, cube downscaling at 0–6 h and from 51 h) over what only the development set can hint at.

## Deliverables

- `audit/fusion-10.md` (German): start time and time log, preconditions, diagnosis, portfolio with reasons, candidate log
  with every bench run (and copies under `audit/fusion-10/laeufe/`), „Entscheidungen im Auto-Modus“, leak checks of every
  fit window, final verdict, open points, improvement entries `V-F10-n` with Mehrwert and Umsetzungsskizze (D-28), a P2
  proposal if you have one.
- Code on branch `fusion-10` (and `f10/*`), tags `f10-lauf-<n>` for every registered commit; `npm run typecheck`, the
  identity verifier, `npm run verify:fusion-release` and `npm run verify:pruefstand` green; `npm run build` +
  `npm run budget` before the integration gate (CLAUDE.md, Verifikation).
- Register entry `fusion-10` (status „kandidat“) and the bench reports.
- Data-repo and archive commits, if any, each verified after push, hashes in the audit.
- `MANUELLE-SCHRITTE.md`: new section „buscosun Fusion 10 (Phase F10)“ — what Jan must review, how to merge, from which
  date track P allows a real `abnahme`, the champion and live-switch steps.
- `CLAUDE.md`: one status row for phase F10 (current state only, no chronicle).
- A short German summary for Jan at the end, in the fixed answer format of the `pruefe-fusion` skill, plus: what was
  tried, what worked, what did not, and what to do next.
