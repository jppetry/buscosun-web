# Kickoff prompt — Phase GL: Gletscher-Monitor DACH, stage 1 (GL-0 … GL-5) in auto mode on a feature branch (11.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`, started in **auto mode**.
> Prompts to Claude Code are in English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).
> Jan's rule for this phase: **the whole feature is developed on the feature branch `feat/gletscher` first — nothing lands on `main`.**

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo. Then read, in this order:

1. `audit/gletscher-plan.md` — the plan for phase GL. §1 (deviations A1–A11) and §2 (branch and repo model) are binding.
   Your work order is GL-0 to GL-5 (stage 1).
2. `audit/gletscher-konzept.md` — the feature concept (direction; where it differs from the plan, the plan wins).
3. `reference/README-gletscher.md` and the four `reference/gletscher-*.dc.html` — the UI target and the pixel diff.
4. Patterns to reuse before you write anything:
   - `audit/seewetter-plan.md` and `audit/seewetter.md` — phase structure, guarded data workflows, V-SW-18;
   - `src/sea/*` and `scripts/sea/*` (`workflow-sea.yml`, `sea-publish.mjs`, `sea-ui-diff.mjs`);
   - `scripts/road/road-forecast.mjs` — buscosun Fusion in Node at thousands of points;
   - `src/fire/detail/{cogTiff,fireSatImagery,sentinelGeo,burnIndex,worldCover}.ts`, `src/fire/FireCogViewer.tsx`;
   - `src/point/{cubeFormat,profileColumn}.ts`, `src/nowcast/heightTime/*`;
   - `src/nowcast/cellTowers/TowerStage.tsx`, `src/event/EventTerrainMap.tsx`, `src/snowCap/*`;
   - `QUELLENMATRIX.md` §6 (DWD change on 30.11.2026).

## Step 0 — set up the branch (before anything else)

- Another Claude Code session may be working in `C:\dev\buscosun-web` on `main` right now. In that working tree:
  - never switch branches, commit, stash, reset, clean or run a dev server there;
  - read git state only with `git --no-optional-locks status`;
  - write paths with forward slashes (`C:/dev/...`) in shell commands.
- Create the worktree (the AF phase's pattern with `.wt-af`; it stays inside this session's working directory):
  - `git fetch origin`
  - `git worktree add --no-track -b feat/gletscher C:/dev/buscosun-web/.wt-gl origin/main` (from `origin/main`, not from the local `main`, which carries Jan's unpushed commits)
  - add the line `.wt-gl/` to `.git/info/exclude`

  From now on, work only inside `C:/dev/buscosun-web/.wt-gl`.
- `npm ci` in the worktree: its own `node_modules`, no junction (two Vite servers on junctioned worktrees share
  `node_modules/.vite`). Dev server: `npx vite --port 5191 --strictPort`. Playwright/CDP outputs with absolute paths
  inside the worktree.
- The planning documents were written into the main working tree on 11.10.2026 as **untracked** files:
  `audit/gletscher-plan.md`, `audit/gletscher-konzept.md`, `reference/README-gletscher.md`, `reference/gletscher-*.dc.html`
  (4), `reference/gletscher/` (17 images), `prompt-gletscher.md`.
  1. Copy them into the worktree.
  2. Commit them as the first commit (`docs(glacier): concept, plan, UI reference and kickoff for phase GL`).
  3. `git push -u origin feat/gletscher`.
  4. Delete exactly these untracked copies from the main working tree. If one of them is already tracked on `main`, leave it alone and note it in the audit.

## Goal (Jan, 11.10.2026)

A new tile and page „Gletscher“ (`/gletscher`, glacier sheet `/gletscher/<slug>`, tile 13, palette 14) that monitors all
glaciers in Germany, Austria and Switzerland:

- the DACH situation map with rankings and a feed „Was sich verändert hat“;
- per glacier the tabs Heute (melt 0–336 h with buscosun Fusion), Saison (snow line, AAR, albedo from Sentinel-2),
  Langzeit (outlines, length and mass series, projection range), Tour (freezing level against the glacier, links,
  disclaimer) and Quellen;
- following a glacier, a weekly card and downloads.

Every value carries its provenance (measured / satellite / model / official), every area its reference year.

**This session:** stage 1 — GL-0 to GL-5 — in auto mode, plus starting the data line in `buscosun-glacier`. Gate B2 (14 days
of winter operation) and Gate E (summer 2027) run after the session — **do not wait idle for them**. GL-6 is out of scope.
If the session ends before GL-5, the audit must let the next session continue from the last green package.

## Jan's authorizations for this phase

They override the matching CLAUDE.md rules for this phase only — nothing else.

1. **Auto mode, no questions.** Work through without asking. Where CLAUDE.md or the plan says STOP & ASK or „Jans Gate“
   for something listed here, decide yourself: take the plan's recommendation unless your measurements contradict it,
   otherwise the safest reversible option. Record every such decision with evidence in `audit/gletscher.md` (section
   „Entscheidungen im Auto-Modus“). Gates A, B1 and C (E-GL-1 … E-GL-12) are delegated to you on exactly these terms. The
   gate criteria are frozen with sha256 in GL-0 **before** the backfill and the hold-out run, may only be stricter than the
   plan's guide values and need a baseline (plan §5 item 12). E-GL-13 (when to merge) stays Jan's. A real blocker never
   stops the whole session: record it, take the fallback, continue with the next package.
2. **Git on the feature branch.**
   - Commit on `feat/gletscher` whenever a step is green: small commits, Conventional Commits with scope `glacier`, in English.
   - Push the branch after each finished step: `git push origin feat/gletscher`.
   - Never push or merge into `main`, never open or merge a pull request, never `--force`, never rebase after the first push.
   - To pick up `main`, run `git merge origin/main` into the branch: before every gate, and whenever `src/pointForecast/fusion/fusionRelease.ts` changes on `main`. Resolve conflicts on the branch, then re-run the gates.
   - Commit hashes go into the audit.
3. **New data repo `jppetry/buscosun-glacier`** (plan §2 and §6).
   - **Creation.** If it does not exist, create it with `gh repo create jppetry/buscosun-glacier --public` and a one-line description, then clone it to `C:/dev/buscosun-glacier`.
   - **First commit on `main`:** `.gitattributes` with `* -text` (before the first `add`), README with every source, its attribution and licence, and no LICENSE file (Jan decides).
   - **Default branch.** Push `main` first so it becomes the default branch, check with `gh repo view --json defaultBranchRef`, and only then create the orphan branch `archive`.
   - **What you may push:** `main` (data line `v1/`, the workflows `glacier-static.yml`, `glacier-sat.yml`, `glacier-melt.yml`, README) and `archive` (daily archive).
   - **Publishing rules:**
     - pull before every commit;
     - `glacier-publish.mjs` replaces only its own line's sub-path, never the whole `v1/`;
     - re-read, modify and write `index.json` on every attempt (≤ 6 attempts on a fresh base);
     - all three workflows share the concurrency group `glacier-publish`;
     - never `--force`, never rewrite history, never delete archive days;
     - stay within 20 MB per file and 150 MB per package (jsDelivr) and within the history growth cap from GL-0.
   - **`PRODUCER_REF`.** Set the repo variable `PRODUCER_REF=feat/gletscher`. Every workflow first checks the ref with `git ls-remote --exit-code --heads`, then sparse-clones `buscosun-web` at it and checks that its producer files exist. If either is missing it logs „producer not on <ref> yet“ and exits 0.
   - **After every push** verify:
     - the file via `raw.githubusercontent.com` or `@<sha>` — never probe a new path on `@main` early (it pins a 404 at the edge);
     - the workflow run is green (`gh run list` / `gh run view`).

     CDN purges are allowed for `buscosun-glacier` paths only, logged. If anything broke: `git revert` at once, push, log it.
   - **Fallback:** if pushing workflow files is refused (token without `workflow` scope), record it as Jan's step (`gh auth refresh -s workflow`) and keep running the producers locally.
4. **Read-only sources.** `buscosun-data` (point cube, `obs/v1`), `buscosun-archiv` (Punktarchiv truth), `C:\dev\buscosun-hindcast`
   (calibration). Never write there, never dispatch their workflows.
5. **External data and tools.**
   - **Downloads.** You may download the green and yellow sources of the concept's table „Zusätzliche Daten“ to `C:/dev/buscosun-glacier-cache/` (outside every repo, never committed, disk cap 40 GB).
     - Sentinel-2 bands are read in windows via HTTP range and discarded after evaluation.
     - GloGEM is downloaded once with its checksum checked; keep RGI region 11 only, then delete the original.
     - Only reduced, attributed products go into `buscosun-glacier`.
   - **Licences.** Check each licence at the original text before use and quote it in the audit. Red sources are never downloaded.
   - **No accounts, no logins, no keys.** RGI 7.0 (NSIDC Earthdata) and CAMS are Jan's steps; use RGI 6.0 from GLIMS meanwhile.
   - **Be gentle with servers:** sequential downloads, `If-Modified-Since`.
   - **Geometry tools.** For shapefiles, reprojection, overlap and simplification, a Python venv with pinned versions under `C:/dev/buscosun-glacier-cache/.venv` is allowed (pattern: `buscosun-hindcast`). This is not a dependency change of `buscosun-web`; `package.json` dependencies stay as they are.
6. **Charts.** `@nivo/line` (already in the bundle) plus plain SVG for bars. **No new npm dependency, `@nivo/bar` included**
   (plan A11). Keep everything in the lazy chunk of `src/glacier/`, run `npm run budget`. Raise a limit only with a written
   note; eagerJs will grow by about +0.3–0.4 KB for the route entry and the rail, as with AW and SW.

## What stays Jan's, even in auto mode

- `main` of `buscosun-web`: merge, push, pull requests. **`GLACIER_LIVE` stays `false`**; `noindex`, no sitemap.
- Do **not** edit `CLAUDE.md` or `MANUELLE-SCHRITTE.md` on the branch — both change on `main` every day (conflicts,
  section-number clashes). Status and Jan's steps go into `audit/gletscher.md` §0 and §„Jans Schritte“ (plan A9).
- No changes to:
  - buscosun Fusion (`src/pointForecast/fusion/**`, the release register);
  - the cube and point line (`src/point/**`, `scripts/point/**`; `CUBE_VARS` is a format contract);
  - the Punktarchiv producer (`scripts/punktarchiv/**`, AP9);
  - `buscosun-data`, `buscosun-archiv` or their workflows;
  - shaders or custom layers — 3D is built-in MapLibre only, as in `TowerStage.tsx`;
  - Edge Functions and the edge share bundle (`npm run edge:share` is Jan's), warm crons, manifest mechanics;
  - `src/favorites.ts` semantics (plan A8).

  Read Fusion and the cube only. Extra pressure levels (T600/T500) are a recommendation to Jan, never your change. The only allowed edits in shared Brandradar code are the additive ones of plan §7 (`parseS2CogCandidates` bands, exporting `STAC_URL`), with the fire verifiers proving byte-equal behaviour.
- No production CDN purges, no deleting components.
- Honesty rules:
  - every value with its provenance label;
  - model numbers never presented as measured or official;
  - without a passed calibration only a unitless melt index;
  - official texts and hazard notes only verbatim with source and time, no own hazard level;
  - the Tour tab never says „begehbar“, „sicher“ or „frei“;
  - projections only as a range per scenario;
  - „verschwunden“ only with the authority's criterion;
  - class-C glaciers (all four German ones) get no satellite numbers;
  - sums over time are never built from added quantiles (plan §8).

## Season reality and the DWD deadline (read before planning)

The 2026 melt season is over and the glaciers are snow-covered until June:

- **Gate B1** is the backfill of June–October 2025 and 2026 from the Sentinel-2 archive against measured equilibrium lines/AAR and TSLA; it blocks GL-3.
- **Gate B2** (14 days of winter operation) runs after the session.
- **Gate C** is a hold-out on the hindcast against the GLAMOS height-band balances — summer balance for the melt parameters, winter balance for the precipitation factor — plus a forecast-forced hindcast before any number with a unit is shown.

On 30.11.2026 the DWD ends the old ICON-D2/-EU URL scheme and the regular grid. Read `hzerocl` (and the ICON shortwave
for the comparison) from `/weather/nwp/v1/m/` (triangular grid, CCSDS) from the start.

## Procedure (Diagnose-First; each package ends with verifier output and a written gate)

1. **GL-0 spike** exactly as in plan §5:
   - tools venv; inventories counted per country and size class; licences quoted;
   - GLAMOS/WGMS/ÖAV series located with winter and summer balance; GloGEM reduced; ≈ 30 lead glaciers fixed;
   - Sentinel-2 scene counts summer 2026 with the SCL snow-versus-cloud check, COG throughput (one `workflow_dispatch` on a runner);
   - buscosun Fusion in Node at five lead glaciers with the country per glacier (`road-forecast.mjs` hard-codes `'DE'`) and the V-SW-18 counter-check;
   - `hzerocl` and ICON shortwave in the new scheme, checked against Jungfraujoch and Sonnblick;
   - what the hindcast truth holds at the 24 mountain stations; budget including yearly history growth.

   Then freeze the gate criteria.
2. **Gate A (auto):** decide E-GL-1 … E-GL-12 per authorization 1.
3. **GL-1** contract `src/glacier/glacierContract.ts` with the verifiers `verify:glacier-contract` and `verify:glacier-static`
   (npm aliases in the repo style). Then:
   - the static build → `v1/static/<build>/` in `buscosun-glacier`;
   - the entry: tile 13, palette 14, rail entry, route `/gletscher` + aliases, `subParam: 'glacier'`, `glacierFlag.ts` (`?gl=1`), the netlify.toml shell/alias entries, routing self-tests `[GL]`;
   - the DACH situation page with everything that needs no model; melt and snow-cover metrics visible but locked.
4. **GL-2** `scripts/glacier/sat-scan.mjs` (mask rule from GL-0, ≥ 70 % valid, snow line for class A only, AAR and albedo,
   winter state). Then the backfill 2025/2026, `verify:glacier-sat` with real stored scenes, and the workflow `glacier-sat.yml`
   live. **Gate B1 (auto).**
5. **GL-3** `scripts/glacier/melt.mjs`:
   - hourly ETI per 50 m band; band column from model ground and 700 hPa via `hypsometricHeight`, anchored at `hzerocl`;
   - damped on-glacier transfer and the measured height correction, both in the glacier job only;
   - clear-sky radiation split direct/diffuse × Fusion cloud factor; band state; scenario sums;
   - `melt-calibrate.mjs` with the hindcast, hold-out and forecast-forced hindcast; `verify:glacier-melt`;
   - workflow `glacier-melt.yml` (reads the cube, producer checkout includes `public/climaGrid.json`, repeat skip, runs kept 72 h) and the archive branch.

   **Gate C (auto)** — if red, ship the unitless index and say so.
6. **GL-4** the glacier sheet per plan §9: `GlacierBrief`, `GlacierMap`, `GlacierStage`, `GlacierCompare`, `GlacierCharts`,
   `glacierTour`, `glacierState`/`glacierView`, `glacierDeck.css` with the `--gl-*` tokens from the README.
7. **GL-5** feed, rankings, following (`gl.favs`), weekly card, CSV and image download.
8. **Gate D preparation (no switch-on).** Before the gate run, `git merge origin/main` once more. Then:
   - `verify:glacier-*` and `glacier-ui-diff.mjs` against the reference at 1440×900 and 390×844 (DPR 3);
   - `npm run typecheck`, `build`, `budget`, and the routing/SEO/share verifiers (name the known red share case until Jan rebuilds the edge bundle);
   - `git diff --stat origin/main...HEAD -- src/pointForecast src/point scripts/point scripts/punktarchiv` must be empty;
   - the five self-verification questions from CLAUDE.md **and** the five glacier checks in plan §11, in writing with evidence.

   A desktop regression anywhere else means the phase has failed.

## Deliverables

- `audit/gletscher.md` with:
  - §0 status (current state only);
  - anchors and GL-0 measurements next to the plan's assumptions;
  - the frozen criteria with their sha256;
  - „Entscheidungen im Auto-Modus“;
  - the implementation log per package with verifier output;
  - every commit hash (branch and `buscosun-glacier`);
  - gate tables A–D;
  - §„Jans Schritte“: the merge path of plan §2 (edge bundle on the branch, PR, `PRODUCER_REF=main` before deleting the branch, CLAUDE.md row and MANUELLE-SCHRITTE section to carry over, `GLACIER_LIVE`), what to check for B2, RGI 7 login, licence of the data repo.
- Branch `feat/gletscher` pushed with all code under `src/glacier/`, `scripts/glacier/`, verifiers and npm aliases.
- `buscosun-glacier` with README, `v1/` data line, three green workflows and the `archive` branch.
- A short German summary for Jan at the end:
  - what was built and what runs in `buscosun-glacier`;
  - what was measured differently from the plan;
  - which decisions you took;
  - what is left for him.
