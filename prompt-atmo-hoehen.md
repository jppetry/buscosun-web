# Kickoff prompt — Phase AM: Atmosphäre auf echte Höhendaten (DWD v1), stage 1 (AM-0 … AM-5) in auto mode on a feature branch (19.10.2026)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`, started in **auto mode**.
> Prompts to Claude Code are in English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).
> Background (German): the survey of `opendata.dwd.de/weather/` from 19.10.2026 (Projekt-Doc
> `dwd-opendata-weather-atmosphaere-2026-10-19`); its facts are in §„Befunde vom 19.10." below.
> Jan's rule for this phase: **everything is developed on `feat/atmo-hoehen` — nothing lands on `main` without him.**
> AM-1 is built as ONE self-contained commit so Jan can cherry-pick it to `main` before 30.11.2026.

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely before anything else — it is the
constitution of this repo. Then read, in this order:

1. §„Befunde vom 19.10." in this prompt — a source survey, not a measurement you may copy. Re-measure every number in AM-0;
   the directory decides (CLAUDE.md: „Was in den Daten liegt, entscheidet").
2. The Atmosphäre code as it is today:
   - `src/atmosphere/*` — `AtmospherePage`, `AtmosphereDeck` (lenses `hoehenwind | inversion | gonogo | foehn | thermik`),
     `atmosphereStore`, `atmosphereState` (+0…+48 h), `AtmosphereProfile`, `profile-derivations`, `thermalField`,
     `ThermalMap`, `foehn` (`PRESSURE_GATE_NOTE`), `FoehnPanel`, `verdict`, `TalwindPanel`, `GoNoGoReport`;
   - `src/threed/{crossSection,buildCrossSection,dynamics,goNoGo,soundingMath,SoundingPanel,SkewTChart,SectionChart}.ts(x)`;
   - `src/sources/iconEuSounding.ts` (old ICON-EU tree, 10 pressure levels, ≈ 40 files / ≈ 40 MB per point) and
     `src/sources/gfsSounding.ts` (same `SoundingProfile` shape, fallback).
3. Why the current values are estimates: `audit/dashboard.md` P67–P80 (wind per level „n. v.", power law α = 0.2 in
   `crossSection.ts`), the header comments of `thermalField.ts` (one ICON-EU profile + fixed 3 K superheat) and `foehn.ts`
   (pressure gate open).
4. The deadline and who owns what: `QUELLENMATRIX.md` §6 (30.11.2026), `MANUELLE-SCHRITTE.md` E-EX-5 (phase NS owns the
   point producer and the Kartenlinie — **not this phase**).
5. Patterns to reuse before you write anything:
   - `scripts/glacier/lib/dwdNew.mjs` and `audit/gletscher.md` §2.7 — reader for the new tree, `CLAT`/`CLON`, measured cost
     per field (~740 KB, ~0.3 s), run completeness times, **D-GL-6** (`hzerocl` censored to model orography);
   - `src/sources/gribDecode.ts` (CCSDS/AEC, template 3.101 decodes unchanged), `scripts/verify-aec.mjs`,
     `src/sources/iconD2EpsSource.ts` (triangular grid in the client);
   - `src/point/{cubeFormat,profileColumn}.ts`, `src/nowcast/heightTime/*` — how profile columns are encoded and read today;
   - `audit/seewetter-plan.md`, `audit/seewetter.md`, `scripts/sea/*` — guarded data workflow, publish healing, V-SW-18;
     `audit/gletscher-plan.md` §2 — own data repo pattern; `bandbreite.md` §33 — BW-14 publisher (`--force-with-lease`);
   - `src/road/*` — the repo's own BUFR decoder (candidate for radiosonde BUFR);
   - `src/sources/dwdKonrad3d.ts` + the radar mirror — how a DWD file without CORS reaches the data repo.

## Step 0 — set up the branch (before anything else)

- Another Claude Code session may be working in `C:\dev\buscosun-web` on `main` right now. In that working tree:
  never switch branches, commit, stash, reset, clean or run a dev server; read git state only with
  `git --no-optional-locks status`; write paths with forward slashes in shell commands.
- Worktree (pattern `.wt-gl`):
  - `git fetch origin`
  - `git worktree add --no-track -b feat/atmo-hoehen C:/dev/buscosun-web/.wt-am origin/main`
  - add `.wt-am/` to `.git/info/exclude`. From now on work only inside `C:/dev/buscosun-web/.wt-am`.
- `npm ci` in the worktree (own `node_modules`, no junction). Dev server `npx vite --port 5193 --strictPort` (next free
  port if taken). Playwright/CDP outputs with absolute paths inside the worktree.
- This prompt was written into the main working tree on 19.10.2026 as the **untracked** file `prompt-atmo-hoehen.md`.
  Copy it into the worktree, commit it first (`docs(atmo): kickoff for phase AM`), `git push -u origin feat/atmo-hoehen`,
  then delete exactly that untracked copy from the main working tree.

## Goal (Jan, 19.10.2026)

The Atmosphäre feature (`/atmosphaere`) and the 3D sounding panel run on real vertical model data instead of estimates,
and keep working after the DWD change on 30.11.2026:

- **Profile / Emagramm in < 2 s** instead of „~20 s" (today ≈ 40 full-domain ICON-EU files per point).
- **Höhenwind from model U/V per level** instead of v10·(z/10)^0.2.
- **Thermik from ICON-D2 `HTOP_DC` and the real profile** instead of one ICON-EU profile + fixed 3 K superheat;
  Cu base from `HBAS_SC`.
- **Föhn with a cross-barrier pressure difference** (model PMSL) instead of the open pressure gate.
- **Measured radiosonde profiles** (DWD, German stations) as an overlay — measured next to model, never blended.

**This session:** stage 1 — AM-0 to AM-5 — in auto mode, plus the data line running in shadow. Stage 2 (RUC, dust,
satellite cloud tops, irradiance, SYNOP station pressure) is **measured only** in AM-0 and handed to Jan as E-points.
If the session ends early, the audit must let the next session continue from the last green package.

## Befunde vom 19.10. (survey, re-measure in AM-0)

Measured live on 19.10.2026 ≈ 17 UTC with direct requests (`cache: 'no-store'`). **Trap:** fetch layers and proxy caches
served directory listings that were days to weeks old (radiosonde listings ending 06.10., BUFR ending 10.08.) while the
live directory was current — always measure with an uncached direct request and the `latest` aliases.

| Product | Path under `https://opendata.dwd.de/weather/` | Facts seen |
|---|---|---|
| New model tree | `nwp/v1/m/<model>/p/<PARAM>/[lvt1/<type>/lv1/<level>/]r/<ISO run>/s/PT<HHH>H<MM>M.grib2` | plain `.grib2` with CCSDS packing, grid template **3.101** (triangular), HTTP Range answers 206. ICON-D2 542 040 cells, ICON-EU 768 608 (GL), ICON-ART-EU 1 013 404 |
| ICON-D2 v1 | `nwp/v1/m/icon-d2/p/…` | runs 3-hourly, steps PT000–PT048 hourly. `T` has `lvt1/100` (pressure, Pa: 20000 25000 30000 40000 50000 60000 70000 85000 95000 97500 100000 = **11 levels**) and `lvt1/150` (**65 model levels**). Params include `U V W OMEGA T QV QC QI RELHUM CLC TKE P HHL FI`, single-level `HTOP_DC HBAS_SC HTOP_SC CEILING CLDEPTH HZEROCL SNOWLMT CAPE_ML CIN_ML PMSL PS HSURF ASWDIR_S ASWDIFD_S SYNMSG_BT_CL_IR10.8`. **No `VIS`** in ICON-D2 v1 |
| ICON-EU v1 | `nwp/v1/m/icon-eu/p/T/lvt1/100/lv1/<Pa>/…` | **20 pressure levels**: 5000 7000 10000 15000 20000 25000 30000 40000 50000 60000 70000 77500 80000 82500 85000 87500 90000 92500 95000 100000 Pa; also `HBAS_CON HTOP_CON HTOP_DC CAPE_CON` |
| Old tree (ends 30.11.) | `nwp/icon-eu/grib/`, `nwp/icon-d2/grib/` | still served today — the only window for an old-vs-new comparison |
| ICON-D2-RUC | `nwp/v1/m/icon-d2-ruc/` (+ `-eps`) | hourly runs, PT000–PT027; `LAPSE_RATE SRH WSHEAR_U WSHEAR_V CAPE_MU CIN_MU VIS ECHOTOPinM` + hail fields — **stage 2** |
| ICON-ART-EU | `nwp/v1/m/icon-art-eu/p/TAOD_DUST`, `DUST_TOTAL_MC`, `CEIL_BSC_DUST`, `VIS` | dust forecast PT000–PT120, runs 00/06/12 seen — **stage 2** (the code has no Himmel lens; the card needs a home) |
| Radiosonde tracks | `weather_reports/radiosonde/trajectories/Sondenflug_<launch>_<WMO>_<ts>.json` (+ `.kmz`) | 15 stations: 10035 10113 10184 10238 10304 10393 10410 10548 10618 10739 10741 10771 10868 10954 10962; mostly 00/12 UTC; ~48 h retention. JSON `{date, serial, station{wigosStationIdentifier, name, heightNN "484,00", lat 4824.4547, lon 1155.2474, launchtimes, startTimes}, gps:[[lon, lat, alt_m, epoch_ms], …]}` — **station lat/lon are DDMM.mmmm, `heightNN` uses a decimal comma**; GPS every 2 s up to ~32 km **including the descent**; **no T/RH** (wind only via drift) |
| Radiosonde BUFR | `weather_reports/radiosonde/bufr/Z__C_EDZW_<ts>_bda01,temp_bufr_999999_999999__MW_<n>.bin`, alias `Z__C_EDZW_latest_…__MW_XXX.bin` | high-resolution TEMP (T, Td, wind), messages up to ~1 MB, ~48 h retention; station mix unknown |
| SYNOP | `weather_reports/synoptic/international/` (BUFR + `gda01-synop-*.txt`), `…/germany/geojson/*.geojson.gz` (decoded BUFR) | stage 2: station pressure for Föhn pairs (coverage of Lugano/Zürich/Innsbruck/Bozen not checked) |
| Satellite | `satellite/clouds/CTH/` (cloud-top height IR10.8 + opacity, 15 min, `nEU` 10 min), `satellite/radiation/sis|sid/`, `SISfc…_fc+18h-DE.nc`, `weather_reports/derived/duett/` | stage 2 |

## Jan's authorizations for this phase

They override the matching CLAUDE.md rules for this phase only — nothing else.

1. **Auto mode, no questions.** Work through without asking. Where CLAUDE.md says STOP & ASK or „Jans Gate" for something
   listed here, decide yourself: take this prompt's recommendation unless your measurements contradict it, otherwise the
   safest reversible option. Record every such decision with evidence in `audit/atmo-hoehen.md` (section „Entscheidungen
   im Auto-Modus"). Gates A, B and C (E-AM-1 … E-AM-n) are delegated to you on exactly these terms. **Freeze all decision
   rules and gate criteria with sha256 in AM-0, before any comparison run**; they may only be stricter than this prompt's
   guide values. A real blocker never stops the session: record it, take the fallback, continue with the next package.
2. **Git on the feature branch.** Small commits whenever a step is green, Conventional Commits with scope `atmo`, in
   English; `git push origin feat/atmo-hoehen` after each finished step. Never push or merge into `main`, never open or merge
   a pull request, never `--force` on this branch, never rebase after the first push. `git merge origin/main` before every
   gate. Commit hashes go into the audit.
3. **Data line — location decided in Gate A by measurement:**
   - (a) `buscosun-data/atmo/v1/` if the chosen layout fits the measured jsDelivr headroom with ≥ 30 % margin. Rules as
     for `sea/`: touch only `atmo/` and its workflow, every publish copies the complete `atmo/` set (healing against the
     force-push of the Kartenlinie), never `--force`, never touch other lines or workflows.
   - (b) otherwise a new repo `jppetry/buscosun-atmo`, created exactly like `buscosun-glacier` (GL prompt authorization 3:
     `.gitattributes` first, README with sources and attribution, no LICENSE, `PRODUCER_REF=feat/atmo-hoehen` with the
     ls-remote guard). It holds only the rolling product, so its `main` may follow the BW-14 publisher pattern
     (`--force-with-lease` + Neuaufsetzen) to cap history growth — measure the growth and freeze a cap in AM-0.
   - Both: pull before every commit, concurrency group `atmo-publish`, ≤ 20 MB per file, package within the measured
     limit; after every push verify the file via `raw.githubusercontent.com` or `@<sha>` (never probe a new path on `@main`
     early), the workflow run green, and the radar/point/road/sea publishes still fresh. Anything broken: `git revert`, push,
     log. CDN purges only for `atmo` paths, logged.
   - Fallback if pushing workflow files is refused: record `gh auth refresh -s workflow` as Jan's step and run the producer
     locally meanwhile.
4. **Read-only:** every other line of `buscosun-data`, `buscosun-archiv`, `C:\dev\buscosun-hindcast`. Never write there,
   never dispatch their workflows.
5. **External data:** only `opendata.dwd.de` (CC BY 4.0, „Datenbasis: Deutscher Wetterdienst"). No accounts, no keys.
   Sequential downloads, `If-Modified-Since`, stream-decode instead of storing; local cache only under
   `C:/dev/buscosun-atmo-cache/` (outside every repo, never committed, cap 20 GB).
6. **Tools and dependencies:** no new runtime dependency (the verifier checks the list). Charts: the existing
   `SkewTChart`/`SectionChart`, `@nivo/*` already in the bundle. eccodes (pinned, outside `package.json`) is allowed **only**
   as a cross-check in the spike and in verifiers — the producer path uses `gribDecode.ts`.

## What stays Jan's, even in auto mode

- `main` of `buscosun-web`: merge, push, pull requests, the cherry-pick of AM-1. The new client path stays behind
  `ATMO_CUBE_LIVE = false` (opt-in `?ac=1`); with the flag off the page behaves byte-identically to today plus AM-1.
- Do **not** edit `CLAUDE.md` or `MANUELLE-SCHRITTE.md` on the branch. Status and Jan's steps go into
  `audit/atmo-hoehen.md` §0 and §„Jans Schritte".
- No changes to: buscosun Fusion (`src/pointForecast/fusion/**`, release register); the point line (`src/point/**`,
  `scripts/point/**`, `CUBE_VARS`); the Punktarchiv (`scripts/punktarchiv/**`); repack, Kartenlinie and their producers
  (phase NS); warm crons, Edge Functions, `netlify.toml` proxies; other data lines and their workflows.
- Shared code: a v1 reader may be lifted out of `scripts/glacier/lib/dwdNew.mjs` into a shared module **only additively**,
  with the glacier verifiers proving identical behaviour. Document it so phase NS can reuse it.
- Honesty rules:
  - model values: „Modell (ICON-D2 2,2 km, Lauf hh UTC)" or the actual source; measured values: „gemessen: Radiosonde
    ‹Station›, ‹d› km, vor ‹h› h"; never blend sonde and model, never call a model value measured;
  - Föhn ΔP: „Modell-Druckdifferenz, keine Stationsmessung", thresholds with literature source, labelled Richtwert —
    no own warning level;
  - every remaining estimate (fallbacks) keeps the word „Schätzung" and its reason;
  - censored fields (`HZEROCL`, `HTOP_DC`, `HBAS_SC`, `CEILING` at or below the model ground — D-GL-6 pattern, measured
    per field, not assumed) are never shown as heights;
  - inversions thinner than 200 m are marked as possibly unresolved; „Thermik" stays a model height, never a climb rate.

## The deadline (read before planning)

On 30.11.2026 the DWD removes `nwp/icon-eu/grib/` and `nwp/icon-d2/grib/` (regular grid). `iconEuSounding.ts` reads the
old ICON-EU tree, so the Emagramm, the Föhn index, the thermal field and the 3D sounding panel break on that day unless AM-1
lands first. Until then both trees exist — use that window for the old-vs-new comparison in AM-0.

## Procedure (Diagnose-First; each package ends with verifier output and a written gate)

1. **AM-0 spike (measure, no product code):**
   - a. **Inventory v1** for ICON-D2 and ICON-EU: which of `T RELHUM QV U V W TKE CLC P HHL` exist on model levels
     (`lvt1/150`) and pressure levels (`lvt1/100`), level lists, runs, steps, file sizes, time from run start to
     completeness; the single-level fields of the goal list. Units and reference (above MSL or above ground) of `HTOP_DC`,
     `HBAS_SC`, `HTOP_SC`, `CEILING`; their censoring behaviour at Alpine and lowland points.
   - b. **Decode check:** `gribDecode.ts` on multi-level files; cross-check several fields against eccodes; negative control.
   - c. **Old vs new:** the same ICON-EU run from the old regular grid and from v1 (nearest cell) at ≥ 20 points (lowland,
     Alpine valleys, summits), per level.
   - d. **Three source options**, measured per run: download volume, runner time, output size per layout, vertical spacing
     0–4 km above ground in the lowland and in the Alps (pressure levels lie below ground there):
     S1 ICON-D2 model levels (subset ground → ~6 km), S2 ICON-D2 pressure levels (11), S3 ICON-EU pressure levels (20).
   - e. **Layout candidates:** horizontal spacing (native nearest cell vs 0.025/0.05/0.1°), steps (hourly 0–48 vs hourly
     0–24 + 3-hourly), quantisation, tiling so that one request delivers one column for all hours and a 100 km section
     needs ≤ 4 requests. Remap rule: **nearest cell for profile fields — never average profile fields** (CLAUDE.md).
   - f. **Budgets:** current jsDelivr package size and headroom of `buscosun-data`; history growth per day; Actions runtime
     per run; latency of a profile and of a 100 km section on desktop and with 4G throttling.
   - g. **Radiosondes:** trajectories JSON (fields, cadence, stations, retention, the DDMM.mmmm trap, ascent vs descent,
     burst detection); BUFR (does the `src/road` decoder read TEMP BUFR, which descriptors, which stations are inside);
     the `latest` aliases.
   - h. **Föhn:** PMSL in the model at Lugano/Zürich and Bozen/Innsbruck (+ a Nordföhn pair if the literature supports
     one); thresholds with literature citation.
   - i. **Stage 2, measure only** (each one becomes an E-point for Jan, no build): ICON-D2-RUC (`LAPSE_RATE`, `VIS`, `SRH`,
     `WSHEAR_*`, `CAPE_MU`) for Inversion and Go/No-Go; ICON-ART-EU dust (needs a home — no Himmel lens in the code);
     `CTH`; `SIS`/`SISfc`/DUETT (also the missing irradiance truth of the Fusion); SYNOP-international station pressure.
   - Then **freeze** (sha256 in the audit): the decision rule for S1/S2/S3 and the layout (budget limits + quality rule of
     Gate B), the latency targets, the sonde overlay radius and age (guide: ≤ 150 km, ≤ 12 h), the Föhn thresholds.
2. **Gate A (auto):** source option, layout, data-line location, Föhn pairs and thresholds — E-AM-1 … with evidence.
3. **AM-1 insurance — ONE commit on top of `origin/main`, cherry-pickable:**
   - `iconEuSounding.ts` treats a 404 of the old tree as a finding (an abort is not absence — CLAUDE.md) and falls back to
     `gfsSounding`; from 2026-11-30 00 UTC it no longer tries the old tree (use the `SCHEDULED_CHANGES` register if it fits);
   - `AtmosphereProfile` and `SoundingPanel` show the actual source and run (no „ICON-EU" label on GFS data);
   - verifier `verify:atmo-sounding-guard` with a simulated 404, a simulated abort and a negative control;
   - the commit hash goes into the audit and the summary for Jan.
4. **AM-2 producer and contract:**
   - `src/atmosphere/atmoContract.ts` — format, version, units, and checkers that block implausible values in producer
     **and** client (T range per height, RH 0–100 %, wind ceiling, monotonic heights, run age, censoring flags);
   - `scripts/atmo/atmo-build.mjs` (streamed download → `gribDecode` → nearest-cell remap → quantise → tiles + manifest),
     `scripts/atmo/atmo-publish.mjs`, workflow template `scripts/atmo/workflow-atmo.yml` (sparse checkout with every file
     the producer reads — V-SW-18; skip if the run is already published; cadence from Gate A);
   - 2D fields alongside the columns: `HTOP_DC HBAS_SC HTOP_SC CEILING HZEROCL SNOWLMT CAPE_ML CIN_ML PMSL` and
     `ASWDIR_S`/`ASWDIFD_S`, each with its measured censoring flag;
   - `verify:atmo-contract`, `verify:atmo-build` (stored real fixtures, sample columns byte-exact against a direct decode,
     negative control);
   - data line live in shadow: the workflow green on consecutive runs.
5. **AM-3 radiosondes:**
   - `scripts/atmo/sonde-mirror.mjs`: the latest ascents → `atmo/v1/sonde/…` as reduced profiles (height, T and Td from
     BUFR if decodable, otherwise absent; wind from GPS drift on the ascent only, smoothing window documented; station,
     launch time, source line). Keep a rolling 14 days; a long-term archive is Jan's E-point.
   - `verify:atmo-sonde` with real fixtures, including the DDMM.mmmm and decimal-comma traps.
6. **Gate B (auto) — model against measurement:** for every ascent collected in the session, compare the chosen option
   (and the other S-options where computed, the old ICON-EU path while it exists, and GFS) at the shortest available lead:
   T, Td, wind speed and direction — bias and RMSE in the bands 0–1.5, 1.5–3 and 3–6 km above ground — plus the hit rate of
   inversion base/top. Criterion (frozen in AM-0): the chosen option is not worse than today's ICON-EU path in any band
   beyond the frozen tolerance. Red ⇒ next option by the decision rule; if none passes, ship only AM-1 and say so plainly.
   State the sample size; a few days of ascents is a small sample and the audit says so.
7. **AM-4 client (behind `ATMO_CUBE_LIVE`, opt-in `?ac=1`):**
   - reader `src/atmosphere/atmoCube.ts` (lazy chunk, one request per column, cache); fallback chain cube → GFS (AM-1);
   - Emagramm/profile (`AtmosphereProfile`, `profile-derivations`, `soundingMath`, Skew-T, nerd mode with raw levels) and
     the 3D `SoundingPanel` on the cube;
   - Höhenwind and section (`crossSection`, `buildCrossSection`): U/V/T along the line from cube columns; the power law
     remains only as the labelled fallback;
   - Thermik (`thermalField`, `ThermalMap`): `HTOP_DC` field + real profile, Cu base from `HBAS_SC`; the 3 K superheat
     only as fallback;
   - Inversion lens on model levels; thin inversions flagged;
   - Föhn (`foehn.ts`, `FoehnPanel`): ΔPMSL pairs with documented, configurable thresholds; replace `PRESSURE_GATE_NOTE`;
   - Go/No-Go: wind at flight altitude from the cube instead of the power law, criteria otherwise unchanged; `TKE` is shown
     as information only — turning it into a criterion is Jan's E-point;
   - radiosonde overlay in Emagramm and Höhenwind within the frozen radius/age, distinct line style, label with station,
     distance and age;
   - attribution strings updated (DWD, CC BY 4.0); mobile, tablet and desktop; `npm run budget` (state the eagerJs growth);
   - `verify:atmo-client`: reader, fallback chain, labels, and **flag off = today's behaviour** (plus AM-1).
8. **AM-5 Gate C preparation (no switch-on):**
   - `git merge origin/main`; all `verify:atmo-*`, `npm run typecheck`, `build`, `budget`, `verify:route-3d`,
     `verify:routing`, `verify:share`, `verify:dashboard`;
   - latency against the frozen targets (profile, 100 km section; desktop and 4G throttle), before/after;
   - `git diff --stat origin/main...HEAD -- src/pointForecast src/point scripts/point scripts/punktarchiv` must be empty;
   - screenshots of all lenses at 1440×900 and 390×844 (DPR 3), flag off and `?ac=1`;
   - the five self-verification questions from CLAUDE.md in writing with evidence. A regression anywhere else means the
     phase has failed.

## Deliverables

- `audit/atmo-hoehen.md` with: §0 status (current state only); the AM-0 measurements next to this prompt's survey numbers;
  the frozen criteria with sha256; „Entscheidungen im Auto-Modus"; the log per package with verifier output; every commit
  hash (branch, data line); gate tables A–C; §„Jans Schritte":
  - cherry-pick AM-1 to `main` **before 30.11.2026** (hash, what it changes, how to check it);
  - the merge path of the branch, the flag flip, the CLAUDE.md row and the MANUELLE-SCHRITTE section to carry over;
  - the stage-2 E-points with measured numbers (RUC, dust + where it would live, CTH, irradiance/DUETT, SYNOP pressure,
    TKE as Go/No-Go criterion, sonde archive);
  - a coordination note for phase NS (shared v1 reader, what this phase already measured about the new tree).
- Branch `feat/atmo-hoehen` pushed: `src/atmosphere/atmoCube.ts`, `atmoContract.ts`, `scripts/atmo/*`, verifiers with npm
  aliases in the repo style.
- The data line running in shadow (location per Gate A) with a green workflow.
- A short German summary for Jan at the end: what was built and runs, what was measured differently from this prompt, which
  decisions you took, whether Gate B is green and on how many ascents, and what is left for him — AM-1 first.
