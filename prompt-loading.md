# prompt-loading.md — Kickoff Prompt: 2D-Layer Ladeoptimierung

Copy the block below into a fresh Claude Code session (working directory `C:\dev\buscosun-web`) to start the loading/caching optimization of the 2D weather map. Make sure `npm run dev` is running first (needed for MCP network traces).

---

## ▶ 2D Wetterkarte — Reduce redundant data loading

**TASK**
Reduce redundant network/data loading in the 2D weather map (`src/MapView.tsx` + `src/sources/*`, `src/wind/*`). Goal: never fetch the same thing twice, load static data once at startup and reuse it, and coordinate refreshes — **without changing which data is shown or removing any layer/function**.

**CONTEXT — the loading architecture is already partly good; do not regress it:**
- Layer switch does NOT refetch: each layer is ref-cached (`iconD2WindRef`, `iconD2TempRef`, `nowcastRef`, …) with `if (!…Ref.current)` guards. Keep this.
- `sharedRun` (`src/sources/iconD2Precip.ts:68`, 3-min TTL) de-duplicates model-run resolution across the 5 GRIB layers. Keep and extend this.
- Static data already loaded once & shared: DACH country mask (GeoJSON), Terrarium elevation tiles (`elevationPromise`, module scope in `src/fusion/loadFusedForecast.ts`), GRIB decompressed bytes (Browser Cache API `icon-d2-grib-decompressed-v1`, shared across all ICON-D2 params). Keep.

**DIAGNOSE FIRST (write findings to `audit/loading-optimization.md` before any code):**
Record a per-source table of: what URL/file each source fetches, size, when it fires (mount / layer-activate / refresh-interval), and what cache (if any) protects it. Capture a baseline Network trace (Chrome DevTools MCP, iPhone 12 Pro) of: cold start with default layers, then switching through temp → precip → clouds → wind → gust → radar, then idle for one refresh cycle. Count total requests + bytes. This baseline is what the fix must beat.

**CONCRETE TARGETS (verified redundancies — confirm each in the trace before fixing):**
1. **Coordinate refresh intervals** (`MapView.tsx:1414–1432`): Wind/Temp/Clouds/Precip/Gust each own a separate 30-min interval that independently calls `installXxx()` → `resolveLatestRun()`. Replace with a single refresh coordinator that resolves the latest run once per cycle, then fans out only the per-param fetches for layers that are actually loaded. Preserve the different cadences (nowcast 5 min, ICON-D2 30 min, sat 30, lightning/stations 10).
2. **Add an in-flight guard for temperature** (`MapView.tsx:1546–1556`): the eager `requestIdleCallback` load is guarded only by `!iconD2TempRef.current`, so it can race with an activation-triggered load. Add a `tempLoadingRef` boolean mirroring the existing `windLoadingRef` pattern.
3. **Wind "now" cache** (`src/wind/iconD2WindSource.ts:590–624`): stores frame 0 as a PNG DataURL, forcing an encode/decode round-trip on every reload. Store raw `ImageData`/ArrayBuffer instead to skip the PNG codec. Keep the 24h TTL and the instant-paint-before-network behavior.
4. **Short-cache WMS capture time** for satellite & lightning (`fetchWmsLatestTime`): add a module-level ~5-min cache keyed by layer name so refreshes reuse it.
5. **Fusion double-load**: verify whether `loadFusedForecast` Phase A+B runs at mount AND again on temp activation. If so, make temp activation reuse the mount result instead of recomputing (idempotent via `fusionRequestedRef`).

**HARD RULES (from CLAUDE.md):**
- Do NOT touch shader code, `WindLayer.ts`, the RGBA8 packing path, or the AdaptiveQualityController.
- **STOP & ASK before changing anything inside the Fusion *engine*** (`src/fusion/fusionEngine.ts`, `params.ts`, OI math). Optimizing the *loader/caching* (`loadFusedForecast.ts` fetch scheduling) is allowed; changing fusion *results* is not.
- No layer or function removed/hidden. No change to displayed data — same fields, same values, same freshness. This is purely a fetch/cache change.
- Desktop and mobile behavior identical after the change.

**VERIFY:** Re-run the exact baseline trace. Show before/after request count + total bytes in `audit/loading-optimization.md`. Confirm every layer still loads and renders (all 12 layers + radar), model-switch DE/AT/CH still works, Fusion⇄Native toggle unchanged, no new console errors, no long task > 200 ms. Small commits, Conventional Commits, scope `wetterkarte` or `sources`.

**Documentation you write** (audit, summary) in German; code, comments, commits in English.
