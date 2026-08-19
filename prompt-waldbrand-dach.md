# prompt-waldbrand-dach.md — Kickoff Prompt: Waldbrand DACH (feature `fire`, phases WB0–WB5)

> **Stand: 2026-08-14.** Standalone kickoff **next to** `prompt.md` (which holds L5/L6) — same
> pattern as `prompt-zellbahnen-v2.md` and `prompt-warnungen-ch.md`. Preceded by the analysis
> session of 2026-08-14 (Gate **GWB-A**, no code): `architecture.md` §14 ·
> `docs/DATA_SOURCES.md` §W · `plan.md` §Phase WB · `checklist.md` §GWB0–GWB5 ·
> `tests.md` §V-WALDBRAND · `context.md` §Session-Log 2026-08-14.
>
> **Execution:** open a fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from
> `## ▶` to the end as the first turn. Chrome DevTools MCP must be available. A dev server is
> required from WB1 onwards (`npm run dev`); **WB0 needs no dev server and writes no product code**.
> Recommended: start with `/plan`.
>
> **Do not run this in parallel with L5/L6.** `CLAUDE.md`: ein Thema = eine Phase = ein Gate.
> Which feature goes first is Jan's call.

---

## ▶ Implementation Session: Waldbrand DACH — one phase at a time, WB0 first

**MISSION**
Build a new map view **„Waldbrand DACH"** (feature id `fire`, hash `#wb=`) that shows the factors
driving wildfire danger in DE/AT/CH as switchable layers on a shared day-stepped time slider. It is
a **second map view with its own MapLibre instance**, following the precedent of
`src/nowcast/NowcastRadarMap.tsx` + `src/radar/RadarMap.tsx` — **not** new `LayerKey`s in
`MapView.tsx`.

**The source analysis is finished.** This session implements against a written source matrix
(`docs/DATA_SOURCES.md` §W). Do not re-open source selection. If a source turns out to be
unavailable, say so and stop — do not substitute a source that failed the constraint check.

**This is six phases with six gates.** WB0 must be green before WB1 starts, and so on.

---

**READ FIRST — confirm in writing that you have read each one, in this order:**

1. `CLAUDE.md` — constitution: hard rules, STOP & ASK triggers, the five self-verification questions
2. `architecture.md` §14 — why a separate map view, data flow per layer type, time model, transport
3. `docs/DATA_SOURCES.md` §W — the source matrix, the constraint check, the licence obligations
4. `plan.md` §Phase WB — phase cut and effort
5. `checklist.md` §GWB0–GWB5 — the gates you must tick with evidence
6. `tests.md` §V-WALDBRAND — the verification protocol (V-ALL applies on top, in full)
7. `context.md` §Session-Log 2026-08-14 — feature, user problem, scope, the eight open risks
8. `src/radar/radarModel.ts` + `src/nowcast/NowcastRadarMap.tsx` — **the structural template**
9. `src/fusion/modelSource.ts` — the per-country selection cascade to copy as a pattern
10. `src/warnings/warnField.ts` — how per-country scales are kept apart; **the decisive precedent**
11. `src/scalar/ScalarLayer.ts` — the GL primitive you will reuse unchanged
12. `src/dataAge.ts` + `src/officialSources.ts` — honesty machinery, both need extending

---

## PRECONDITION — Gate GWB0 · ✅ **DONE 2026-08-14, the phase was not stopped**

> **Do not run this again.** The probe ran with `Origin: https://buscosun.com` and
> `maps.effis.emergency.copernicus.eu` answered **`Access-Control-Allow-Origin: *`** on WMS *and*
> WFS, preflight 200, `GetMap ecmwf.fwi` → PNG 512×512 in 36–364 ms. **No rewrite needed;
> `netlify.toml` stays untouched.** Diagnosis `audit/waldbrand-transport.md` · evidence
> `audit/l0/cors-waldbrand.json` + `audit/l0/waldbrand-payloads.json` · protocol `tests.md` §WB-T0 ·
> gate ticked in `checklist.md` §GWB0. Re-run only with
> `node scripts/l0/probe-cors.mjs --group fire …` if you suspect the sources have moved.
>
> **Three assumptions in this prompt were refuted by that run — the tables above and below are
> already corrected, do not restore them from memory:** the EFFIS hotspot endpoint is frozen at
> Oct 2021 (live: GWIS `.today`/`.week`, but **without `frp`**), the DWD index arrives as **484
> per-station files** plus a `stations_list.txt` that carries the only coordinates, and the BAFU
> features carry **no colour** — only `level` and `valid_from`. Details: `docs/DATA_SOURCES.md` §W.8.
>
> **Start this session at WB1.**

The original instruction, kept for the record:

**Before any product code**, run the transport probe. The whole concept rests on one unverified
assumption: that `maps.effis.emergency.copernicus.eu` sends `Access-Control-Allow-Origin`. MapLibre
uploads raster tiles as WebGL textures and needs CORS for that.

1. Extend `scripts/l0/probe-cors.mjs` with the Waldbrand endpoints (EFFIS WMS + WFS, GWIS WMS,
   EDO WMS, EEA discomap, `data.geo.admin.ch`, `opendata.dwd.de/…/fire_danger_index/`).
   Write `audit/l0/cors-waldbrand.json`.
2. Do one real `GetMap` and one real `GetFeature` per endpoint with the production origin. Record
   status, size, response time, `access-control-allow-origin`.
3. Fetch one WBI station CSV through `/_dwd_opendata` and prove the columns
   `Stationsid;Termin;wbi_0…wbi_6`.
4. Re-check `grids_germany/daily/fire_danger_index/` — expected **404**. If the DWD has published
   the 1 km raster in the meantime, **stop and tell Jan**: the plan changes materially for the
   better and the interpolation work disappears.

**If EFFIS/GWIS has no CORS: STOP.** A new rewrite in `netlify.toml` is a STOP & ASK zone. Write up
the finding, propose the rewrite, and hand it to Jan. Do not implement it.

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Do not touch `MapView.tsx`** beyond one mechanical change in WB1: lift `LayerKey` into
  `src/map/layerTypes.ts` and re-export it from `MapView.tsx`. Behaviour must stay byte-identical;
  prove it with a pixel-equal desktop screenshot diff.
- **No new runtime dependency (D-06).** That rules out NetCDF and GeoTIFF decoders — so DWD soil
  moisture grids, HYRAS and CGLS are out of scope. Do not add `sharp`, `pmtiles`, `netcdfjs`,
  a chart library, or a state library.
- **No backend, no state carried across days (D-01).** Therefore **no self-computed FWI**: FFMC, DMC
  and DC are cumulative codes with multi-week memory. The ICON-D2 layer is a **driver**
  (`fireWeather`), never an index. The cumulative codes come ready-made from EFFIS/GWIS.
- **No scale conversion between national levels.** German level 2 and Swiss level 1 are both
  labelled „geringe Gefahr" and mean different things. Keep separate tables per source
  (pattern: `warnField.ts:65-109`), separate legends, separate source labels. Never map, average or
  harmonise them.
- **Austria has no open official index.** Do not invent one, do not stretch a German or Swiss value
  across the border, do not present the EU model value as official. Show the gap, label it, and
  deep-link the official Austrian source.
- **The Waldbrand layers are not an official warning product.** Every layer profile says so in
  writing. This is not `warnings` — no warning language, no escalation wording.
- **No durable cache on the official national levels.** Short TTL only, data age visible, and on
  error switch the layer **off** and link the official source. Stale danger levels are worse than
  none.
- **Respect `geo.admin.ch` fair use.** One fetch per session, in-memory TTL ≥ 1 h, no polling.
- **`FrameGovernor` is the only performance lever (D-09).** No special paths.
- **Flag-gating (Rule 2):** anything that could regress an existing path ships default-off behind a
  flag with a named fallback.
- **Desktop regression on the weather map = phase failed.** Breakpoints 767 px / 1439 px only.

---

## PHASE WB1 — scaffold, no data (Gate GWB1)

- `src/map/layerTypes.ts`: move `LayerKey` out of `MapView.tsx`, re-export for compatibility.
- `src/fire/fireModel.ts` (pure, DOM-free, headless-verifiable): `FireLayerId`, presets, z-band
  order, selection cascade `overrides ?? perCountry ?? global`, per-country scale tables
  `FIRE_SOURCE_DE` / `FIRE_SOURCE_CH` / `FIRE_SOURCE_EU`.
- `src/fire/fireTime.ts` (pure): day steps, modes `instant | window | forecast`, clamp to the
  smallest shared horizon across active layers. **Do not build or anticipate `layerTime.ts`** —
  that belongs to L5 and would couple the two phases (see V-193).
- `src/fire/FireMap.tsx` + `FirePage.tsx`: own MapLibre instance, DACH view, `countryMask`,
  Command-Deck shell (D-27), lazy chunk in `App.tsx`, `#wb=` hash with its **own** bit order
  (do not reuse `LAYER_ORDER` — and do not repeat its mistake, see V-191).
- **Entry points — Jan decided on 2026-08-14: a 10th bento tile AND a 10th rail entry.** A tile is
  **seven** wiring points, not one: `App.tsx` `FeatureId` · `SearchPage.tsx` `FEATURE` (~:69-80) ·
  `PALETTE` (~:83-95) · the bento grid (~:556+) · the **hardcoded** counter `09 WERKZEUGE` at
  `SearchPage.tsx:539` · the category assignment for the filter chips ·
  `featureRail.tsx` `RailFeature` + `FEATURE_RAIL_ITEMS` + a new `IconRailFire` matching the nine
  existing icons.
  **Two regression traps here, treat them as blocking:** (a) the bento grid was hand-curated by Jan
  in phase SA1 — inserting a tenth tile must not move or displace an existing tile; diff desktop
  **and** 390×844 against the baseline. (b) `FEATURE_RAIL_ITEMS` is rendered by **every** command
  deck (Route, Event, Radar, Konfidenz, Historie, Atmosphäre) — a tenth icon changes rail height
  everywhere. Check all six decks at both viewports (`tests.md` T1-7…T1-13). Derive the counter from
  the list length instead of hardcoding 10, so it does not drift again at the eleventh tool.
- Verifiers: `npm run verify:fire-model`, `npm run verify:fire-time`.

**Gate:** page loads, map renders, toggles switch empty layers, slider moves, `eagerJs` unchanged,
weather map pixel-equal, console clean.

---

## PHASE WB2 — MVP layers (Gate GWB2)

| Layer id | Source | Render path |
|---|---|---|
| `fireDanger` | GWIS `ecmwf.fwi` (WMS, +1…+9 d, 6 classes) | MapLibre `raster` source, `TIME` from `fireTime` |
| `fireIndexNational` | DE: DWD WBI/GLFI CSV.gz via `/_dwd_opendata` (**484 files, one per station** + `stations_list.txt`) · CH: BAFU GeoJSON · AT: gap | DE `circle` (stations) · CH `fill` + `line`, colour **derived from `level`** (`colorOrigin: 'derived'` — the features carry no `color`) |
| `fireHotspots` | **GWIS** WFS `ms:viirs.hs.today` / `ms:viirs.hs.week` GeoJSON, 24 h / 7 d | `circle`, **uniform size** — `frp` is not served live |
| `fireWeather` | ICON-D2 `relhum_2m` (**new loader**) + existing `t_2m` / `vmax_10m` / `tot_prec` | `ScalarLayer` |
| `fireBans` | BAFU `…praeventionsmassnahmen_kantone` GeoJSON (CH) | `fill` + `line`, hatched |

Copy the single-field loader pattern from `src/sources/iconD2Lpi.ts` for `relhum_2m` — it documents
itself as „exactly the gust pattern". **Adding `relhum_2m` to the warm cron is STOP & ASK (Jan):**
`scripts/warm-grib.mjs` is at 90.8 MB per run today. Until Jan decides, the layer resolves the run
by directory scan like the pre-manifest path does.

Mandatory in this phase, not optional: layer profiles with „kein amtliches Warnprodukt" and a
deep-link; visible data age per layer (Swiss layer must read as **age** at weekends, since BAFU
publishes Mon–Fri after midday); complete attribution; `scripts/seo/licenses.mjs`
§`NON_MODEL_SOURCES` extended; `officialSources.ts` extended with a fire branch (see V-195) and
`npm run verify:official-sources` green again.

**If you render an interpolated WBI surface:** the support points stay visible and the layer says
„eigene Interpolation aus Stationswerten — der DWD veröffentlicht kein offenes Raster". The official
statement is the point value.

---

## PHASE WB3 — time slider, playback, mobile (Gate GWB3)

rAF playback (pattern `NowcastRadarMap.tsx:269-279`, **not** `setInterval`), day-frame prefetch
inside the `FrameGovernor` tier, bottom sheet, touch targets ≥ 44 px, and the border check:
the EU surface must run through DE/AT/CH without a seam, while the national levels stop at the
border — visibly on purpose, with an explanatory line.

---

## PHASES WB4 / WB5 — only after Jan's go-ahead

WB4: `fireDrought` (EDO `smian`/`smand`), `fireVegetation` (EDO `fpanv`), `fireFuel`
(EFFIS `fuel_map` / CLC2018 / HRL DLT or DLR Tree Species), `fireBurnt` (EFFIS `modis.ba.poly`),
`fireContext` (Natura 2000 — **no CH coverage, say so**; forest areas; WUI), reuse of the existing
`lightning` layer for DE. OSM forest ships **only as a rendered layer**, never as a queryable
GeoJSON endpoint (ODbL share-alike). FNEWS only if Thünen has confirmed the licence in writing.

WB5: permalink, SEO page, budget check, closing note.

---

## VERIFICATION — what must be green

`npm run typecheck` · `npm run budget` · `npm run verify:official-sources` · the new
`verify:fire-*` verifiers · every existing `verify:*` unchanged · `tests.md` §V-WALDBRAND
protocols WB-T0…WB-T6 with evidence paths under `audit/`.

Before each gate, answer the five self-verification questions from `CLAUDE.md` in writing with
evidence: (1) function preservation item by item, (2) desktop pixel-equal, (3) touch targets ≥ 44 px,
(4) console clean, (5) no long tasks > 200 ms.

---

## STOP & ASK (Jan) — raise these early, do not decide them

**Settled on 2026-08-14 — do not re-open these:**

1. ~~**No CORS on EFFIS/GWIS**~~ ⇒ **measured: CORS is present.** No rewrite, `netlify.toml`
   untouched. The transport zone is not entered in WB1–WB3.
2. ~~**`relhum_2m` in the warm cron**~~ ⇒ **decided: no.** WB2 resolves the run by directory scan
   through the existing `/_dwd_grib`. Warm budget (90,8 MB/run), manifest mechanics and prod
   dispatch stay untouched. Adding it later remains possible at any time.
3. **FNEWS licence** — unchanged, but **WB4 only**. Decision: do not build the layer; put the written
   query to Thünen (`fnews@thuenen.de`) before WB4, not now.
4. **Entry points** ⇒ **decided: 10th bento tile + 10th rail entry**, category `erkunden`, title
   „Wie trocken ist der Wald?", visible all year (no seasonal hiding — that would be a function
   removal). Seven wiring points, see `plan.md` §WB1.
5. **`fireHotspots` without `frp`** ⇒ **decided: build it without.** Uniform dot size, 24 h / 7 d
   windows from GWIS `.today`/`.week`, and the profile says in writing that fire radiative power is
   not served by the open interface. The FIRMS CSV stays what §W.6 calls it — a fallback, never the
   primary source.
6. **484 WBI files** ⇒ **decided:** `stations_list.txt` once per session, value CSVs loaded per
   viewport and capped at **60 concurrent**, day TTL. **No condensing warm cron** — that would be
   cron/transport zone and needs its own release.

**Still open:**

7. **Interpolating the WBI** — turning an official point product into a surface is a new class of
   decision (V-197). Propose the wording, let Jan decide whether it becomes a project rule.
8. **Phase order against L5/L6** — which feature runs first. Pure scheduling question.
9. **GeoSphere SPARTACUS** (if ever wanted): 240 req/h forces an edge proxy ⇒ transport zone.
10. **EDO sends a duplicate `access-control-allow-origin`** (`*, *`) — a browser may reject that.
    WB4 only; verify in a real browser before building `fireDrought`/`fireVegetation`.

---

## AFTER EACH PHASE

Tick `checklist.md` with evidence · log the verification in `tests.md` · append a 3–5 sentence note
to `context.md` §Session-Log · record every improvement found as a `V-NN` entry in `improvements.md`
with value and implementation sketch (D-28) · Conventional Commits, scope `fire`, no commit without
an order.

---

## WHAT NOT TO DO

- Do not add Waldbrand layers to `MapView.tsx`.
- Do not build a general layer registry or a general time model — that is L1/L2/L5.
- Do not compute an FWI from ICON-D2.
- Do not convert between national danger scales.
- Do not show anything for Austria that pretends to be official.
- Do not use a source marked BLOCKED in `docs/DATA_SOURCES.md` §W, and do not look for a workaround
  around a MAP_KEY, a login, a rate limit or a non-commercial clause.
- Do not durable-cache official danger levels.
- Do not change `CLAUDE.md`, `netlify.toml`, the edge functions or the warm crons without Jan.
