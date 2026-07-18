# prompt-performance.md — Kickoff Prompt: 2D-Layer Rendering-Performance

Copy the block below into a fresh Claude Code session (working directory `C:\dev\buscosun-web`) to start the runtime/rendering performance work on the 2D weather map. Make sure `npm run dev` is running first (needed for MCP performance traces).

---

## ▶ 2D Wetterkarte — Improve rendering performance (mobile + desktop)

**TASK**
Improve the runtime rendering performance (FPS, frame time, battery/thermal) of the 2D weather map on both mobile (iPhone 12 Pro, 390×844, DPR 3) and desktop, **without changing which data is shown, removing any layer/function, or degrading visual correctness beyond an agreed quality budget**. This is a rendering-loop / quality-governance task, NOT a network task.

**CONTEXT — what's already optimized (do not regress):**
- Slider input is RAF-coalesced to ≤1 state update per frame (`MapView.tsx:340–346`).
- Mobile renders at capped DPR 1.5 instead of 3 (`MapView.tsx:584`, `pixelRatio: coarsePointer ? Math.min(dpr, 1.5) : dpr`).
- bz2/GRIB decode and wind-frame blending run in Web Workers, off the main thread (`src/sources/decompress.ts`, worker pools).
- A `FrameGovernor` (`src/wind/perfGovernor.ts`) adapts **particle density** via EMA + hysteresis. Per CLAUDE.md this is THE sanctioned lever — route new tuning through it, don't bypass it.

**DIAGNOSE FIRST (write to `audit/performance-2d.md` before any code):**
Use Chrome DevTools MCP performance traces at iPhone 12 Pro emulation AND a desktop profile. Capture three scenarios: (a) idle with wind layer visible, (b) all heavy layers on (wind + temp + precip + clouds) idle, (c) dragging the forecast-hour slider across the full range. For each: record avg/min FPS, longest task, per-frame breakdown (scripting vs GPU/raster vs compositing), and how many repaints/sec occur when nothing is being interacted with. This baseline is what the fix must beat. NOTE: emulator WebGL is not representative of real-device GPU behavior (documented project pitfall) — flag "real-device check required" for any GPU-timing conclusion.

**CANDIDATE LEVERS (verify each against the trace before implementing; keep them mobile/desktop-isolated where behavior differs):**
1. **Cap the wind animation repaint rate.** `WindLayer.ts:1144` requests `map.triggerRepaint()` every frame, pinning MapLibre to an uncapped 60 fps loop whenever wind is visible. Introduce a governed max-FPS for the wind animation (e.g. ~30 fps on mobile / coarse pointer, configurable on desktop) via a frame-time gate driven by `perfGovernor`, NOT by editing shader code or the RGBA8 packing path. Verify particle motion still looks smooth.
2. **Extend quality governance to the scalar heatmaps.** The `FrameGovernor` currently throttles only particle density; temp/precip/cloud `ScalarLayer`/`RainLayer`/`CloudLayer` render at full resolution every dirty frame. On mobile / low tier, allow the governor to reduce their cost (e.g. coarser sampling or lower internal resolution during pan/low-FPS), reverting to full quality when idle.
3. **Idle-stop the repaint loop.** When wind is the only animated layer and the user hasn't interacted, ensure there is a sane frame cap (from lever 1) rather than a permanent 60 fps loop — measure battery/CPU impact in the trace.
4. **Reduce per-slider-tick main-thread cost.** `precipComposite.ts:196–219` build() + texture upload run together per forecastHour change. Confirm in the trace whether this exceeds the frame budget on mobile; if so, memoize build() output per (forecastHour, source) and/or move the gather off-main.

**HARD RULES (from CLAUDE.md):**
- Do NOT edit shader source, the RGBA8 position-packing path, or rely on `EXT_color_buffer_float`. Keep explicit `highp`.
- Route all quality/perf tuning through the `AdaptiveQualityController`/`FrameGovernor` and existing config knobs (particle density, DPR cap, `upsample`, `reduceMotionOnMove`, new FPS cap) — do not add ad-hoc bypass paths.
- **STOP & ASK** before any change to the WebGL pipeline internals beyond frame-scheduling/quality knobs, before Fusion-engine changes, and before anything irreversible.
- No layer/function removed or hidden. Desktop and mobile must remain visually correct; any intentional mobile quality reduction must be documented and revert to full quality when idle.

**VERIFY:** Re-run the exact three baseline scenarios. Show before/after avg FPS, longest task (must stay ≤ 200 ms), and idle repaints/sec in `audit/performance-2d.md`. Confirm: all 12 layers + radar still render, wind particles still animate smoothly, model-switch DE/AT/CH and Fusion⇄Native unchanged, no new console errors, desktop visually unchanged. Flag which conclusions need a real iOS-device check. Small commits, Conventional Commits, scope `wetterkarte` or `wind`. Docs in German, code/commits in English.
