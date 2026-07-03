# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

buscosun is a tracker-free weather web app focused on **DACH** (Germany · Austria · Switzerland):
elevation-corrected forecasts blended from official sources, plus tour planning, event-day
planning, nowcast, 3D atmosphere, and a global wind globe. React 19 + Vite 6 + TypeScript,
rendered with MapLibre GL 5.6 (no Three.js). No backend — everything runs client-side.

## Commands
- `npm run dev` — Vite dev server (http://localhost:5173). Upstream proxies live here (see below); `window.__bsQA()` exists only in the dev build.
- `npm run typecheck` — `tsc -b --noEmit`. First static gate.
- `npm run build` — `tsc -b && vite build && node scripts/generate-seo.mjs`. Second gate; also emits the SEO pages into `dist/`.
- `npm run qa:layers` — headless layer-QA runner (`scripts/qa-layers.mjs`): drives the running dev server with Playwright, calls `window.__bsQA()`, exits non-zero on a decode/valid-time/unit regression. Requires `npm i -D playwright && npx playwright install chromium` and a running `npm run dev`.
- `npm run verify:seo` / `npm run seo:logs` — validate generated SEO output / parse crawler logs.

There is **no lint script** and **no unit-test runner**. "Tests" are runtime verification harnesses: `qa:layers`, `src/route/verifySamples.ts`, and `scripts/verify-aec.mjs`. The static gate for any change is `npm run typecheck` + `npm run build`.

## Conventions
- Implementation code + comments in **English**; all user-facing text in **German**.
- Adopt the v1.8 design system: CSS variables from `src/designTokens.css` (sand/cream/stone/terracotta palette) and the shared `.rt-*` page shell from `src/route/tourTheme.css`. **No new color system, no hardcoded hex values.**
- Meteorology lives in pure, tested modules; deterministic math only (the former browser-LLM assistant was removed — verdicts/explanations are computed, never generated). Meters + km/h + linear scales for vertical data.
- Only use the **existing data pipelines** (ICON-D2/EU, GeoSphere AROME/INCA, MeteoSwiss, BrightSky, GFS, Terrarium DEM). Do not add a new external source, fetch/ingest path, or third-party adapter. If a datum is missing, reduce/hide the feature rather than build a pipeline for it.

## Architecture

**App shell** (`src/App.tsx`, `src/main.tsx`) — hash-routed SPA. Only `SearchPage` loads eagerly; every feature page is `lazy()`-imported as its own chunk (MapLibre and the WebGL globe are heavy, so they must stay out of the initial bundle). Permalink hashes deep-link into a view: `#3d=`/`#atm=` → atmosphere, `#h=` → history, `#val` → validation, `#g=` → globe, event hashes → event, encoded map state → 2D map. Every page takes an `onBack` prop. `FeatureId` (in `App.tsx`) enumerates the routes.

**Data layer** — the core value of the app.
- `src/sources/` — one adapter per upstream, each normalizing into the shared `ForecastGrid` type (`src/sources/openMeteoForecast.ts`). DWD is the licensing backbone (BrightSky MOSMIX/current stations + native GRIB2 grids decoded in-browser via `gribDecode.ts`/`decompress.ts`, RADOLAN radar). GeoSphere covers AT (AROME, INCA, TAWES stations); MeteoSwiss covers CH (SMN, radar). OpenMeteo is opt-in only. SMHI/DMI/IPMA adapters exist but are hard-disabled (outside DACH).
- `src/fusion/` — `loadFusedForecast.ts` orchestrates: pick a `countryProfiles.ts` profile, fetch enabled sources in parallel (cached ~10 min), feed each into `FusionEngine` (`fusionEngine.ts`) with per-variable weights (live obs dominate hour 0). The engine builds IDW `SpatialKernel`s (`spatialInterp.ts`), interpolates onto a dense DACH grid, applies elevation/lapse-rate correction (`elevation.ts`, Terrarium DEM), and encodes per-hour PNG textures. `frameInterp.ts` lerps textures for sub-hour slider positions.
- **Rendering layers** — `src/wind/WindLayer.ts` (GPU particle wind, MapLibre custom WebGL layer + `shaders.ts`), `src/scalar/` (`ScalarLayer`/`CloudLayer`/`RainLayer`/`ConfidenceLayer` heatmaps + `snowLine.ts`).

**2D map** — `src/MapView.tsx` (lazy, heavy). Orchestrates the WebGL layers, fused forecasts, and embeds the point-forecast panel. `LayerKey` = `'wind' | 'gust' | 'nowcast' | 'temp' | 'clouds' | 'sat' | 'lightning' | 'stations' | 'confidence' | 'snowline' | 'flownowcast' | 'poprob'`.

**Feature pages** (each `src/<feature>/<Feature>Page.tsx`):
- `route/` — tour weather: upload GPX/TCX/FIT/KML/KMZ → validate → parse → per-km weather at actual arrival time. Models: `speedModel.ts` + `movementModels.ts` (grade × movement type), `tourTiming.ts`/`breaks.ts`/`startTime.ts` (schedule/ETAs), `windEffect.ts`/`windSampling.ts` (head/tailwind), `ebikeBattery.ts` (SoC).
- `pointForecast/` — shared forecast engine (consumed by MapView, event, astro, photo, nowcast; not directly routed). `clustering.ts`, `foehnDetector.ts`, `apparentTemperature.ts`, `precipType.ts`, `uvClearSky.ts`.
- `nowcast/` — rain in the next 6h; `nowcastEngine.ts` fuses radar (0–2h) + ICON-D2 (2–6h) into a 15-min series.
- `event/` — "which day fits best?"; `eventScoring.ts` ranks days with activity presets + Plan-B logic.
- `atmosphere/` — 3D atmosphere (MapLibre custom WebGL layer, per-lens mount/unmount, mobile/tablet/WebGPU fallbacks). Lens switcher + progressive disclosure (Verdict / Profile / Skew-T). Vertical source is ICON-EU sounding (no native ICON-D2 pressure levels). Migrated from the older `src/threed/`.
- `globe/` — full-screen nullschool-style earth: live-GFS wind particles + overlays at multiple pressure levels (`gfs.ts`/`gfsClient.ts`).
- `confidence/` (the `forecast` route) — multi-model spread + honest uncertainty (`multiModel.ts`, `ensemble.ts`, `hitRateModel.ts`).
- `history/` — ERA5 climate retrospective via Open-Meteo Archive (`historyModel.ts`).
- `validation/` — live radar hindcast scoring the flow-ensemble against real RADOLAN (`ml/radarHindcast.ts`).
- Support features (not routed): `astro/`, `photo/`, `notifications/` (pure IO-free trigger engine), `ml/` (MOS calibration, optical-flow nowcast, metrics), `radar/` (WebGL rain raster; used by nowcast/event, no standalone page).

**CORS / proxy** — GeoSphere, MeteoSwiss, and S3 (Terrarium DEM, GFS) allow browser CORS. `opendata.dwd.de` **blocks it** — proxied in dev via `vite.config.ts` (`/_dwd_opendata`, `/_gfs`). Production needs an equivalent same-origin server-side proxy/mirror; there is no such backend in this repo yet.

**Build notes** (`vite.config.ts`) — ESM workers (the bz2 decompress worker uses dynamic `import`), `bzip2-wasm` excluded from optimizeDeps (keep glue next to its `.wasm`), `maplibre-gl` split into its own shared chunk. `scripts/generate-seo.mjs` runs post-build, is pure Node ESM with no app import (can't break the app bundle), and writes programmatic geo/explainer pages + sitemap into `dist/`.

## Working process (from the Atmosphäre phase; applies broadly)
- Diagnose before writing; verify after writing. Verification suite: typecheck + build (+ QA harnesses where they exist) → Context7 for API consistency → Chrome DevTools for runtime/perf at 3 breakpoints → atomic commit.
- Auto-advance on green verification. **Stop** only on a red check or one of three decision gates: (1) a new heavy dependency, (2) a data need outside existing pipelines, (3) an unresolvable conflict with the design system / architecture.
- Layout: mobile / tablet portrait+landscape / desktop; split on desktop & tablet-landscape, otherwise stacked. Label probabilistic forecasts with model-run age; mark thin inversions (<200 m) as under-resolved.
- For features carrying their own docs, keep the seven-file doc set current: CLAUDE.md, plan.md, checklist.md, prompt.md, context.md, architecture.md, tests.md.
