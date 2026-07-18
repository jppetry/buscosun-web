# prompt.md — Kickoff Prompt for Claude Code

Copy the relevant block below into a fresh Claude Code session (working directory `C:\dev\buscosun-web`). For UI phases (D1/R1) make sure `npm run dev` is running first (Chrome DevTools MCP verification). For the transport phase (T1) use `netlify dev` (runs the Edge Function + client locally).

---

## ▶ Phase T1: Wind Transport — Caching-Proxy + Manifest-Warm (infra, no UI)

**TASK**
Take DWD off the critical path for the 2D map's **wind layer** and give it a shared cache, **without a precompute/ingest pipeline** and **without touching decode / `buildWindRgba` / `blendWindFrames` / per-frame normalization / shaders**. This is **Phase T1**, tracked by **Gate GT1** in `checklist.md`. Work **local-first (`netlify dev`), then deploy to Netlify.**

**PROBLEM (diagnosis already exists — do not re-derive, confirm + measure):** One wind load = 5 near-horizon steps × (`u_10m`+`v_10m`) = **10 raw `.grib2.bz2` (~1.1 MB) fetched live** from DWD through the `/_dwd_opendata` rewrite. Trace: 1 cache hit (314 ms), 9 live (~5 s), **origin-bound** (HTTP/2-multiplexed, DWD is the bottleneck). The client already stages/prefetches and has an IndexedDB "now" cache, so the 5 s is a **cold-start + cross-user** problem. See `context.md` → "Infrastruktur-Strang" and `plan.md` → Phase T1.

**APPROACH (three small, additive steps):**
1. **T1.1 — Caching proxy (Netlify Edge Function):** replace `/_dwd_opendata` *for wind* with an Edge Function that fetches DWD server-side and sets `Netlify-CDN-Cache-Control: public, durable, max-age=<retention>, immutable`. The per-(run,step) filenames are immutable, so the URL is a safe cache key. Verify **locally with `netlify dev`**: bytes identical to a direct DWD fetch (hash/size), cache headers present.
2. **T1.2 — Warm-cron (GitHub Action):** poll DWD every ~10–15 min → newest **complete** run? → `curl` the wind URLs **through the proxy** (fills the cache) → **only then** flip a small `latest-wind.json` (run + steps). No eccodes, no decode. Early-exit when the manifest is already current; idempotent so a failed run self-heals next tick.
3. **T1.3 — Manifest-gated client:** change `resolveLatestRun` to read `latest-wind.json` instead of scanning the DWD directory. This (a) means the client only ever requests **already-warmed** runs (no visitor hits the cold 5 s) and (b) removes the **~1.9 s directory listing** from the critical path. Keep the rest of `src/wind/iconD2WindSource.ts` (`fetchStepBytes`, worker decode, blend, norm) untouched.

**HARD CONSTRAINTS**
- **Output equality:** wind particles must render **numerically and visually identical** afterwards (vectors, density, FPS-cap). The rebuild changes *where/how fast* the same bytes arrive — nothing else.
- **No RG8/WebP ingest in T1** — it is deliberately deferred and measure-gated (only after a real-iPhone measurement post-T1 shows payload/decode still hurts; if built later, it MUST be *lossless* WebP + a per-frame-norm sidecar).
- **Wind only.** The `/_dwd_opendata` proxy stays for radar (RADOLAN, 5-min cadence — wrong for a 3h/manifest pattern) and other DWD sources. Do not claim the proxy "disappears."
- **Graceful degrade is a design invariant:** if the warmer fails / the schedule is disabled, the manifest just doesn't advance and the client serves the last warmed run — **stale, never cold**. Add visibility on manifest age.
- Do not touch Fusion (`src/fusion/**`), shaders, RGBA8-packing, or the IndexedDB now-cache path. HARD STOP + ask Jan before anything irreversible (secrets, DNS, production redirect changes).

**PROCEDURE (Diagnose-First):**
1. DIAGNOSE: write the finding + a fresh cold baseline measurement into `audit/wind-transport.md` before any code.
2. IMPLEMENT: T1.1 → T1.2 → T1.3, small commits, scope `wind`/`transport`. Verify each **locally (`netlify dev`)** first.
3. VERIFY: run `tests.md` → **V-WIND-TRANSPORT** (L = local correctness, N = Netlify latency/cache). Confirm wind output equality + graceful degrade.
4. GATE: tick every GT1 item in `checklist.md` with evidence, append a Session-Log entry to `context.md`, answer the five self-verification questions (CLAUDE.md, applied to transport) in `audit/wind-transport.md`.

**Docs in German; code/comments/commits in English (Conventional Commits, scope `wind` or `transport`).**

---

## ▶ Phase D1: Wetterkarte — Desktop-Redesign (3-Zonen-Umbau)


**TASK**
Redesign the DESKTOP view of the 2D weather map (`Wetterkarte`) by consolidating today's ~6 floating control clusters into **three deliberate zones**, without changing which data is shown, without removing or hiding any layer/function, and while keeping the existing brand identity (Sand/Cream/Ink + Terracotta/Steel/Sage). This is **Phase D1**, tracked by **Gate GD1** in `checklist.md`.

The three zones:
- **Zone A — left panel „Ebenen & Modell"**: all 12 layers grouped, the active layer expands its own inline controls, the model switcher (DE/AT/CH · Native⇄Fusion · catalogue · radar toggle) moves into the panel foot.
- **Zone B — bottom „Instrument-Ribbon" (the signature element)**: fuses the forecast timeline + a trend sparkline at the selected point + a **permanently visible color legend** of the active layer (today "which color = which value" is hidden in hover — this is the core improvement).
- **Zone C — right „Punkt-Dossier"**: the point forecast (PFC) with its sub-tabs, warnings and vitals.

**FIRST STEP — invoke the `frontend-design` skill** before any visual implementation, and follow its guidelines. The signature is the Instrument-Ribbon; concentrate the boldness there and keep the other zones quiet. The brand token system is the brief — do not drift toward generic AI-default looks.

**AUTHORITATIVE SPEC & REFERENCES — read these first, confirm you have read them:**
1. `audit/mockups/wetterkarte-desktop-spec.md` — the binding 13-section implementation spec (safety frame §0, ist-code mapping §1 [file:line anchors — re-verify, they drift], target 3-zone architecture §2, Zone A §3, Zone B/Ribbon §4, Zone C §5, top context §6, legend data model §7, motion §8, CSS strategy §9, 12-point preservation contract §10, frontend-design usage §11, verification §12, implementation order §13).
2. `audit/mockups/wetterkarte-desktop.html` — the static visual target (1440×860, real brand tokens + IBM Plex Mono for instrument numerals).
3. `CLAUDE.md` (hard rules), `context.md` (current status), `plan.md` (Phase D1), `checklist.md` (GD1).

**PROCEDURE (Diagnose-First — no exceptions)**
1. DIAGNOSE: Verify spec §1's ist-code mapping against the real `MapView.tsx` / `MapView.css` (update the line numbers), and confirm the current behavior of all 12 preservation points (spec §10). Write this into `audit/wetterkarte-desktop.md` **before writing any code**.
2. IMPLEMENT: Follow the implementation order in spec §13. Additive scaffold first, then move each cluster into its zone, remove the old floating cluster only once its zone carries the function. The Instrument-Ribbon (§4) is the highest-craft part — build it last and most carefully. Small, desktop-scoped, breakpoint-isolated commits.
3. VERIFY: Chrome DevTools MCP at desktop (≥1440×900, plus 1280×800 and 1680×1050 spot-checks). Walk the 12-point preservation contract function by function. **Crucially, verify the MOBILE view has NOT regressed** — 390×844 DPR 3 must be pixel- and function-identical to the Phase-1-C baseline (the mobile bottom-sheet stays intact). Performance trace: no Long Task > 200 ms, no new permanent repaint loop. Capture before/after desktop screenshots of all three zones under `audit/screenshots/wetterkarte-desktop/`.
4. GATE: Tick off every GD1 item in `checklist.md` with evidence, append a 3–5 sentence Session-Log entry to `context.md`, answer the five self-verification questions from `CLAUDE.md` in writing in `audit/wetterkarte-desktop.md`.

**HARD RULES (from CLAUDE.md — still in force):**
- No shader / WebGL-pipeline / `WindLayer.ts` / RGBA8-packing changes. Keep explicit `highp`, no reliance on `EXT_color_buffer_float`.
- No Fusion-engine (`src/fusion/**`) changes — the Fusion⇄Native toggle is only *moved*, never re-logicked.
- No function removed or hidden — regrouping into the three zones only.
- **Axis inversion vs. previous phases:** desktop is now the side being changed; the **mobile view (`@media max-width:767px` / landscape) must stay pixel- and function-identical** — it is the new "do not regress" side. Do not damage the Phase-1-C mobile sheet.
- HARD STOP and ask Jan before anything irreversible, before touching data pipelines/Fusion, before dependency upgrades.

**Documentation you write** (audits, summaries) in German; code, comments, and commits in English (Conventional Commits, scope `wetterkarte`).
