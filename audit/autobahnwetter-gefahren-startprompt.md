# Phase AW, AW-7/AW-8 – Gefahren-Leiste und Detailansicht – start prompt

Phase AW is already live: AW-0…AW-5, the daily archive AW-6a and the route forecast AW-6.1/AW-6.1b run in production, `ROAD_LIVE = true`. This session adds **AW-7** (hazards per motorway segment as a data product) and **AW-8** (hazard rail and detail view), both in shadow mode behind a **new switch** `ROAD_HZ_LIVE = false` / `?roadhz=1`. With the switch off, the existing page must stay exactly as it is.

## 0. Read first, in this order

1. `CLAUDE.md`, `agents.md` (if present).
2. `audit/autobahnwetter.md`: §0, §1 (decisions E-AW-1…31, rights, working environment: worktree, parallel sessions, sparse data clone), §3 (contract `road/v1`, flags, kill switch), §4, §14–§18 (`road/fc/v1`, archive, measurement anchor, open items). The Phase-AW section of `MANUELLE-SCHRITTE.md`.
3. `audit/autobahnwetter-datenpruefung.md` (findings D-1…D-9 of 06.10.).
4. `audit/autobahnwetter-gefahren.md` (binding for AW-7/AW-8, incl. "Stand im Repo und Voraussetzungen"), the new section at the end of `audit/autobahnwetter-plan.md`, section "Gefahren-Leiste und Detailansicht" in `reference/README-autobahnwetter.md`. Render `reference/autobahnwetter-gefahren.dc.html` and `reference/autobahnwetter-gefahren-detail.dc.html` like the other boards and look at them.
5. Code: `src/road/*` (roadContract, roadClasses, roadFlag, roadFc, roadClient, the deck components), `scripts/road/*` (road-derive, road-forecast, build-corridors, build-fc-points), `scripts/radar-mirror/*`, the existing `@nivo/line` usage.

Precedence: CLAUDE.md > this prompt > `audit/autobahnwetter-gefahren.md` > decisions in `audit/autobahnwetter.md` > plan > konzept. Where the gefahren document does not fit how the code really works, follow the established contracts in the code and record the deviation as a V-AW (from V-AW-47).

## 1. Pre-flight – STOP and ask Jan if one fails

- `audit/autobahnwetter-gefahren.md` contains "Stand im Repo und Voraussetzungen" and uses E-AW-32…37.
- The work of 05./06.10. (§18: seven commits on `main`, data package §18.4) is on `origin/main` and in the data repo. If not, report what is missing.
- `git status` of the main working tree: do not touch uncommitted work of other sessions; never switch its branch.

## 2. Decisions (pre-set by Jan – change only via a STOP)

E-AW-32 segments junction-to-junction on the existing corridors, names from OSM `highway=motorway_junction` (ODbL), 5–25 km · E-AW-33 hazards computed in the derive of the radar mirror, forecast inputs from `road/fc/v1` · E-AW-34 forecast levels capped at Stufe 2 and labelled "in Erprobung" until Gate F (road-dependent Glätte until Gate D) · E-AW-35 `@nivo/heatmap`, `@nivo/bullet`, `@nivo/polar-bar` · E-AW-36 Staub/Sand observe-only · E-AW-37 behind the switch, the right column starts with the hazard rail; the station readout lives on inside the detail. New decisions you need get numbers from E-AW-38.

## 3. Permissions

**Data repo `jppetry/buscosun-data`** – as in `audit/autobahnwetter.md` §1.2, plus the new paths:
- May create and modify `road/v1/hz/**`, `road/v1/static/segments.json`, the hazard part of `road/v1/state.json`, and additive fields in `road/fc/v1` runs (schema bump per the rules in `roadFc.ts`).
- Push protocol unchanged: wait for running `build`/`point` jobs, fetch, rebase, push, up to 4 retries, **never force-push**; check after the next `build` run that your commit survived. Measure file sizes before the first push of `hz/` and project them against jsDelivr limits (20 MB per file, 150 MB per package).
- Purge jsDelivr only for the paths you changed; dispatching `radar.yml` and `road-fc.yml` is allowed, cancelling running jobs is not.
- Workflow files (`road-fc.yml` and all others): no edits from here. If one is needed, put the copy under `scripts/road/workflow-*.yml` and an entry in `MANUELLE-SCHRITTE.md` (repo convention).
- Not allowed: `runs/`, `radar/` data, `point/`, `index.json`, `hsurf-v1.png`, `build.yml`, `point.yml`, `radar-watchdog.yml`, secrets, history rewrites.

**buscosun-web:**
- New branch `feat/autobahnwetter-gefahren` in its own worktree (pattern `audit/autobahnwetter.md` §1.3). One commit per work package.
- Merging to `main` is allowed for code behind `ROAD_HZ_LIVE = false` once all verifiers are green, `npm run budget` is within limits and the existing page is unchanged with the switch off (pixel diff against today's page). Never set `ROAD_HZ_LIVE = true`, never touch `ROAD_LIVE`.
- Not allowed: the semantics of the Fusion engine, Edge Functions, WebGL, changing what the existing page shows (that includes D-1…D-4 fixes – see §4).

**Dependencies:** exactly `@nivo/heatmap`, `@nivo/bullet`, `@nivo/polar-bar`, pinned to the installed `@nivo/line`/`@nivo/core` version. Nothing else, no upgrades. Peer conflicts → STOP.

**Sources:** only open sources from konzept and gefahren; blocked stays blocked. OSM via Overpass with local cache (one query per motorway at most) as in `build-fc-points.mjs`. Unclear licence (e.g. elevation model): mark "blockiert", continue without the field.

## 4. Order of work

1. **AW-7.0 diagnosis** (read and measure, change nothing): status of D-1…D-9 in code and in a live slot; which quantities `road/fc/v1` already carries and which are missing (gust and direction, cloud cover, snow line, T850, fresh snow, thunder/lightning potential, MOSMIX visibility); does the KONRAD3D XML carry a hail flag; segments from `static/corridors.json` + OSM junctions (count, lengths); expected `hz/` size; installed nivo version.
   - **If D-1…D-4 are still open:** write a fix proposal with measured effect (replay over the archive since 03.10.) and ask Jan. Do not change the live page yourself. Continue meanwhile with 2–3 and AW-8 against fixtures. AW-7.3 may run in shadow, but Gate E needs D-1…D-4 done.
2. **AW-7.1** `build-segments.mjs` → `road/v1/static/segments.json` (axes per 1 km, support points = `road/fc` axis points, site features with source and licence per field); missing forecast quantities added in `road-forecast.mjs`, additive.
3. **AW-7.2** `src/road/roadHazards.ts` (catalogue, `set` thresholds, aggregation, checkers), sun position (NOAA), `roadNarrative.ts`, fixtures, `verify:road-hazards`. **Replay** of the rules over the archived slots since 03.10.: counts per hazard and level per day, 20 samples per hazard with their `why` – into the audit.
4. **AW-7.3** derive step after each `obs` slot: `hz/<slot>.json`, season state in `state.json`, balance in `status.json`, watchdog check extended. Runs in shadow.
5. **AW-8.0** measure the bundle baseline; **AW-8.1** hazard rail (matrix, period switch, filters, list); **AW-8.2** detail view (cross-section, timetable, temperatures, thresholds, wind, site features, measuring points, warning, "Nicht messbar"); **AW-8.3** segment layer on the map, shared hourly time state, mobile bottom sheet.
6. Final report.

**Done means:** `hz/` slots and `segments.json` publish without manual help; `road/fc` carries the added quantities; with `?roadhz=1` the page matches the two boards; with the switch off it is unchanged; all verifiers green; a new section "§19 AW-7/AW-8" in `audit/autobahnwetter.md` with a handoff for the gate session.

## 5. Data and validation rules (non-negotiable)

- One contract `src/road/roadHazards.ts`, imported by derive, client and verifier. Rules and thresholds live only there, each `set` threshold a named constant with its origin.
- D-04: missing or rejected input → "unknown", never 0. A rejected GMA without a valid one within 10 km makes road-dependent hazards "unknown" now; the model must not fill the gap.
- Evidence `m` / `d` / `p` as specified; future hours are never `m`; `p` levels capped at Stufe 2 (E-AW-34). Every level ≥ 1 carries `why`. Site features never trigger a level alone.
- v1 covers DE only (E-AW-12). AT/CH rows in the boards are an outlook.
- Times: UTC in data, Europe/Berlin in the UI. Units: °C, km/h, mm, m. Air temperature of the stations is labelled "Luft", not "Luft 2 m" (D-6).
- Detail texts from rule-based templates, never from a language model; every sentence names value, source and time. Banned: imperatives and alarm words ("Achtung", "Gefahr!", "unbedingt"), all-clear words ("frei", "sicher"), numbers without source. Golden texts per scenario.
- Official warnings only verbatim; they never change a level.
- Attribution "© OpenStreetMap-Mitwirkende, ODbL" for segment names and site features in the Quellen tab and the data-repo README; `segments.json` under ODbL.
- Forecasts name the buscosun Fusion release they were built with (E-FR-1).

## 6. UI rules

- Command-Deck as the existing page; tokens `--aw-sev-0…3` additive; fonts from `src/fonts.css` only.
- Behind the switch: right column with tabs Gefahren · Strecke · Quellen; "Gefahren" with the states Lage and Detail; one shared hourly time state (0–6) for map, band, matrix and detail.
- nivo per `audit/autobahnwetter-gefahren.md`: matrix and timetable `@nivo/heatmap` (custom `cellComponent`), temperatures `@nivo/line` (custom layers), thresholds `@nivo/bullet`, wind `@nivo/polar-bar` (road axis as custom layer or overlay). Row strips and cross-section stay custom SVG. One theme `roadNivoTheme.ts`; animations off under `prefers-reduced-motion`; detail charts lazy.
- Accessibility: rows and cells are buttons, ↑/↓, Enter, Esc, focus on the detail heading, `role="img"` + summary + visually hidden table per chart, levels never by colour alone, touch targets ≥ 44 px.
- Pixel comparison at 1440 × 900 and iPhone 12 Pro against both boards; charts judged on structure, scales, colours and labels.
- Budget: eagerJs unchanged; record the size of the road chunk and the detail chunk; first paint of the hazard list < 1.5 s on desktop.

## 7. Verification

`verify:road-hazards` (new: one fixture per hazard, NOAA sun positions within 0.5°, missing input → unknown, measurement gap → unknown, cap at Stufe 2, golden texts), `verify:road-fc` (extended: new fields, file equals direct computation), `verify:road-contract`, `verify:road-ui` (extended: switch off = unchanged, switch on = boards, keyboard, both breakpoints, clean console), `typecheck`, `build`, `npm run budget`. Close with the five self-verification questions from CLAUDE.md.

## 8. Stop conditions – stop, document, ask Jan

- Pre-flight fails (§1).
- D-1…D-4 open and a fix would change the live page (proposal only, §4).
- A workflow change, a secret, a force-push or a forbidden path would be needed.
- nivo versions do not fit or demand upgrades.
- Projected sizes exceed jsDelivr limits.
- After one of your pushes, `build`, `point`, `radar` or `road-fc` runs fail or the data repo looks wrong.
- With the switch off, the existing page or any other feature changes.

## 9. Final report (in German)

Stand je Arbeitspaket · Befund AW-7.0 (D-1…D-9, fehlende Größen, Hagelkennung, Abschnitte, Größen) · Replay-Zahlen je Gefahr · Messwerte (Chunk-Größen, Laufzeiten) · Entscheidungen mit Beleg · Abweichungen mit Grund (V-AW ab 47) · offene Fragen an Jan · was die Gate-Sitzung prüfen muss · Commits, Screenshots.

---

# Folgeprompt Gate-Sitzung (frühestens 7 Tage nach Start von `hz/` im Schatten)

Read §19 of `audit/autobahnwetter.md` (handoff) and `audit/autobahnwetter-gefahren.md`. Evaluate Gate E from the `status.json` series and the archive: D-1…D-4 done, no consistency violation, missing inputs in ≤ 2 % of slots, a sample of 50 entries with Stufe ≥ 2 checked against the measurements without a wrong justification. Run all verifiers and the pixel comparison for Gate C+. Report in German with evidence and **wait for Jan's explicit OK in chat before setting `ROAD_HZ_LIVE = true`**. Permissions and stop conditions of the start prompt apply unchanged.
