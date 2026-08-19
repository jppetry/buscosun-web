# prompt.md — Kickoff Prompt: Implementation of L5 (time model + playback) and L6 (radar retrospect + motion vectors)

> **Stand: 2026-08-05.** Replaces the completed planning kickoff (Agent-Teams Strategic Planning,
> Gate GS1) and the L5/L6 spec kickoff (`prompt-2d-zuglinien.md`, Gate GLS) — both done.
>
> **Execution:** open a fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from
> `## ▶` to the end as the first turn. A dev server **is** required this time (`npm run dev`) —
> this is the first implementation session of the 2D layer extension. Chrome DevTools MCP must be
> available. Recommended: start with `/plan` so the first turn finishes the reading order before
> anything is written.

---

## Weitere Kickoff-Prompts (Stand 2026-08-15)

Diese Datei hält den Kickoff für **L5 + L6**. Eigenständige Kickoffs für andere Phasen liegen
daneben — Muster wie schon bei `prompt-zellbahnen-v2.md`:

| Datei | Phase |
|---|---|
| `prompt-zellbahnen-v2.md` | Z2 — Zellbahnen lesbar machen (abgeschlossen) |
| `prompt-warnungen-ch.md` | W2 — amtliche Warnungen Schweiz (abgeschlossen) |
| `prompt-waldbrand-dach.md` | WB0–WB5 — Waldbrand DACH (umgesetzt 2026-08-14; GWB4 teilblockiert) |
| `prompt-waldbrand-ui.md` | WBU1 — Waldbrand-Deck in Wetterkarten-Optik (abgeschlossen 2026-08-14) |

Alle Kickoffs dieser Tabelle sind **abgearbeitet**; die Waldbrand-Folgephasen F0–F2, E0–E3, GWBA1, GWT1 und
GWW1 liefen ohne eigene Kickoff-Datei (Aufträge im Chat, Belege in `audit/waldbrand-*.md`). **Offen ist damit nur
noch dieser Kickoff (L5/L6)** und die noch nicht geplante Phase W3 (AT-Warnlayer). `CLAUDE.md`: ein Thema =
eine Phase = ein Gate — **nicht parallel** fahren. Welche Phase zuerst läuft, entscheidet Jan.

---

## ▶ Implementation Session: 2D map — phases L5 and L6, one phase at a time

**MISSION**
Implement **L5** (unified layer time model + `TimelinePlayer`) and then **L6** (Regenradar
retrospect view + Niederschlagszuglinien, levels E1 + E2) exactly as specified in
`docs/zuglinien-radar-spec.md`. **The design work is finished** — this session writes code against
a written spec, it does not re-open design questions. Where the spec leaves something to Jan, it
says so and names the default that applies without a decision.

**This is two phases with two gates, not one.** L5 must be fully green (Gate **GL5** in
`checklist.md`) before a single line of L6 is written. `CLAUDE.md`: ein Thema = eine Phase = ein Gate.

---

**READ FIRST — confirm in writing that you have read each one, in this order:**

1. `CLAUDE.md` — constitution: hard rules, STOP & ASK triggers, the five self-verification questions
2. `agents.md` §§1–7 — workflow, conflict zones, Definition of Done, known agent traps
3. **`docs/zuglinien-radar-spec.md` — the specification you are implementing. Read it completely.**
4. `checklist.md` — Gates **GL5** and **GL6** (these are your acceptance criteria, verbatim)
5. `tests.md` — protocols **V-TIMELINE** and **V-ZUGLINIEN** (these are your verification steps)
6. `decisions.md` — D-04, D-09, D-11, D-12, D-14, D-19, D-27; open proposals **O-09…O-19**
7. `docs/LAYER_SYSTEM.md` §2–§6 · `docs/MAP.md` §3, §7 · `docs/niederschlag-architektur.md` §5
8. `improvements.md` — **V-134, V-136, V-138, V-139, V-140, V-143, V-144, V-145**

**Then read the code before changing any of it** — at minimum:
`src/map/` (existing deck files) · `src/mapState.ts` · `src/nowcast/precipSource.ts` (read only —
you will not change it) · `src/scalar/precipComposite.ts` (read only) · `src/radar/radarFrames.ts` ·
`src/radar/RadarTimeline.tsx` · `src/nowcast/NowcastRadarMap.tsx:200-280` (the playback engine you
are extracting) · `src/ml/opticalFlowNowcast.ts` · `src/sources/geosphereIncaGrid.ts` ·
`src/sources/radolan.ts` · `src/wind/perfGovernor.ts` · the visibility/`moveLayer` blocks and the
slider block in `src/MapView.tsx` · `package.json`.

Every doc↔code contradiction you find goes into `context.md` §Session-Log **and** gets the doc
corrected in place (`agents.md` §1.3: code wins).

---

## PRECONDITION — check this before writing anything

`docs/2d-layer-erweiterung.md` §12 puts **L0 → L1 → L2 before L5**: golden baseline, layer registry,
applier. **Verify whether L0–L2 have been implemented.**

**Known as of 2026-08-05:** L0 **tooling** exists on disk but is **untracked and unrun** —
`scripts/l0/{capture-layer-matrix.js, gen-baseline-urls.mjs, probe-contracts.mjs, probe-cors.mjs,
README.md}` and `scripts/verify-layer-matrix.mjs`. There is **no `audit/l0/`** directory, i.e. no
baseline has been captured and no CORS inventory has been recorded. Read
`scripts/l0/README.md` first and reuse that tooling rather than writing your own.
⚠️ It still cites the stale "zwei 48-Zeilen-Duplikate"; the measured figure is **47 lines at
`MapView.tsx:1103-1149` ≡ `:2813-2859`** — correct it when you touch the file.

If L0–L2 have not been implemented:

- **STOP and ask Jan.** Do not silently build L5 on the un-refactored `MapView.tsx`.
- Present the two options with their cost, then wait: **(a)** run L0 first (golden baseline +
  CORS inventory, 1–2 days) and then L1/L2, or **(b)** build L5 directly against today's
  `MapView.tsx`, accepting that the time-slider changes land in the locked file without a
  baseline to diff against.
- If Jan chooses (b), the **first** work item becomes a golden screenshot baseline of all 16 layers
  (desktop 1440×900 + iPhone 12 Pro 390×844) — that is not negotiable, because Gate GL5 asks for a
  pixel-diff and you cannot diff against nothing.

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Funktionserhalt is the top directive.** No existing function is removed, hidden or
  "simplified" — not on desktop, not on mobile. Regrouping yes, omitting no.
- **`src/nowcast/precipSource.ts` is not touched.** `layerTime.ts` *calls*
  `precipRadarHorizonHours`, it does not absorb it (spec §3.6). Proof at the gate:
  `npm run verify:precip-source` is green **and the list of its 22 check names is byte-identical
  to the pre-phase state** — a green exit alone is not the proof.
- **`src/scalar/precipComposite.ts` is not touched in L5/L6.** The generalisation (V-137) is L8.
  Should you nonetheless need to change it, `verify:composite-equivalence` must exist and be green
  **before** the change, with a red-test proof.
- **D-14 stands.** No model substitute beyond the radar horizon, in any mode. The new `rainradar`
  layer is an *additional* view on the same compositor — if any part of your work implies bringing
  the model half back, stop and ask.
- **No WebGL/shader zone.** Motion vectors are GeoJSON `symbol`/`line` layers. The crossfade is a
  CPU blend in a pure module. A shader `mix()` would be better and is explicitly **STOP & ASK**
  (O-19), not a decision you make. Same for `netlify.toml`, edge functions, warm-crons,
  `package.json` dependencies.
- **Flag-gating (D-11):** `motionWarp` (flow-warp instead of crossfade) ships **default off** with
  the crossfade as the named fallback. Any other new compute path follows the same rule.
- **Purity boundary (D-12):** `layerTime.ts`, `timelineModel.ts`, `frameBudget.ts`,
  `fetchScheduler.ts`, `frameBlend.ts` and `motionField.ts` are pure, DOM-free and headless-testable.
  React holds no decision logic.
- **FrameGovernor is the only performance lever (D-09).** It gets no new logic — it only supplies
  its tier. The disable order is fixed (spec §9.3): `motionWarp` → crossfade → playback FPS →
  arrow density. Particle count is never a lever.
- **Command-Deck (D-27):** all new UI uses the existing `--mdk-*` token namespace in
  `src/map/mapDeck.css`. No new design system, no legacy-theme extension.
- **Honesty (D-04 / D-19):** country asymmetries are named, never papered over. The measured↔forecast
  break carries three simultaneous signals (colour **and** dashing **and** a labelled marker).
  Conservative wording on the motion layer — never "trifft", "Warnung", "Unwetter", "Gefahr",
  never "Tornado".
- **Improvement duty (D-28):** every improvement found is registered immediately as a `V-NN` entry
  in `improvements.md` (next free number: **V-148**) with a plain-language **Mehrwert** and a
  concrete **Umsetzungsskizze**.
- **Language:** documentation in **German**, code identifiers, comments and commits in **English**
  (Conventional Commits, scope = phase name). **No commits without Jan's instruction.**

---

## PHASE L5 — time model and playback

Build, in this order (each step should leave the app working):

1. **`src/map/layerTime.ts`** — spec §3. Four modes, `LayerTimeSpec`, `LayerAvailability`,
   `sliderRange()`, `resolveLayerTime()`, `PAST_WINDOW_H = 1`. Frame selection goes over the
   **absolute valid time**, never over the lead index.
2. **`scripts/verify-layer-time.mjs` + `npm run verify:layer-time`** — spec §14.1, 9 assertions.
   Write the verifier **with** the module, not after it.
3. **`src/map/timelineModel.ts` + `verify:timeline`** — spec §4.2 / §14.2. Extract the playback
   engine out of `NowcastRadarMap.tsx:269-279` (V-145); `BASE_FPS = 2.5` and the loop behaviour
   stay unchanged or the existing radar view changes visibly.
4. **`src/map/TimelinePlayer.tsx`** — spec §4.3 / §4.4. Port the measured↔forecast break from
   `RadarTimeline.tsx:148-175` into `--mdk-*` tokens. Controlled component, no own state.
5. **`src/mapState.ts` + `scripts/verify-mapstate.mjs` + alias** — spec §5. Freeze the 18-bit order,
   export `ALL_LAYER_KEYS` as a runtime list from `MapView.tsx` (the verifier cannot see the type),
   allow negative `h`, keep a frozen legacy hash as a regression case. **Red-test required.**
6. **`src/map/frameBudget.ts` + `verify:frame-budget`** — spec §6.2 / §14.5. Tier mapping from
   `initialTier` + `coarsePointer`; the governor gets no new logic.
7. **`src/map/fetchScheduler.ts`** — spec §6.4. Priority classes P0–P4, max 3 concurrent, one
   `AbortController` per (layerKey, runId).
8. **V-144 — the Austria time offset.** `fetchIncaGrid` supplies `refMs` from the NetCDF root
   attribute `last_forecast_reftime`; frames carry `validAtMs = refMs + lead`;
   `radarFrames.loadAt` stops anchoring at `Date.now()`. ⚠️ This is a **visible** behaviour change
   for AT — it is STOP & ASK item S-6. Raise it, then implement it once Jan confirms.
9. **Wire it into `MapView.tsx`** — the slider reads `sliderRange()`, the time deck renders
   `TimelinePlayer`. Keep the change surface as small as the un-refactored file allows.

**Gate GL5 is the checklist in `checklist.md`, verbatim.** Do not abbreviate it.

---

## PHASE L6 — radar retrospect and motion vectors

Only after GL5 is fully green.

1. **`src/map/frameBlend.ts`** — spec §9.3. Convex `blendU8`; verify convexity headless.
2. **`rainradar` layer** — spec §9. 60 min retrospect; `DE_PAST_SEED_FRAMES` 9 → 12;
   `RV_TAR_CACHE_MAX = 14` must not drop (contract, spec §9.2); soft mutual exclusion with
   `nowcast` per O-12 (last activated wins, with a visible hint — never a hard lock).
3. **`src/radar/motionField.ts` + `src/radar/motionWorker.ts` + `verify:motion-field`** — spec §10 /
   §14.3. Flow grid 150×128, `iters: 60`, EMA α = 0.4, thresholds 0.5 mm/h and 0.2 px/interval,
   four zoom classes, hard cap 1 200 features **with a log line for what was dropped**.
   The flow is computed from **measured analyses only** — never from RV forecast frames (circular).
4. **`motion` rendering** — spec §10.5. Two native symbol layers, z-band `vector` (before
   `STATIONS_LAYER_ID`), arrow sprite via `map.addImage` from a canvas (no external asset).
5. **Interaction, empty states, country behaviour** — spec §10.6 / §10.7. AT arrows come from two
   consecutive INCA **runs** and are labelled "aus der INCA-Analyse abgeleitet". **CH gets no
   arrows** — gap text + deep link via `src/officialSources.ts`.
6. **Honesty surface** — spec §12. Country ribbons on the timeline, data-age chip, offline
   last-state with stale badge, the six `LayerFailure` texts.
7. **`scripts/verify-composite-equivalence.mjs` + alias** — spec §14.4. Build it even though
   `precipComposite.ts` is not being changed; it is the safety net for L8 and worth more before
   the change than after.
8. **`scripts/verify-radar.mjs` + alias** — binds the existing but unwired `src/radar/_verify.ts`
   to npm and resolves **V-143** (the `RADAR_PRESETS.length >= 4` assertion is red today).

**Gate GL6 is the checklist in `checklist.md`, verbatim — and §0 (honesty) is worked first and is
gate-blocking.**

---

## VERIFICATION — what must be green

```
npm run typecheck
npm run verify:layer-time            (new)      npm run verify:timeline              (new)
npm run verify:mapstate              (new)      npm run verify:frame-budget          (new)
npm run verify:motion-field          (new, L6)  npm run verify:composite-equivalence (new, L6)
npm run verify:radar                 (new, L6)
npm run verify:precip-source         (unchanged — same 22 check names)
npm run verify:governor              npm run verify:datenalter
```

**Red-test duty (V-99 / O-02):** every new verifier must have been made to fail once on purpose,
and the proof belongs in the gate. A verifier that cannot fail proves nothing.

**UI verification** via Chrome DevTools MCP: desktop 1440×900 and iPhone 12 Pro 390×844 DPR 3,
protocols **V-TIMELINE** and **V-ZUGLINIEN** in `tests.md`.
⚠️ **The FPS criterion of GL6 is not verifiable via MCP** — emulation throttles rAF
(`agents.md` §7). Without a real device that point stays **open**, not "passed". Say so plainly;
do not report an emulated FPS number as evidence.

**Before each gate, answer the five self-verification questions in writing, with evidence:**
(1) Funktionserhalt **individually per layer**, (2) desktop pixel-identical, (3) touch targets
≥ 44 px, (4) console clean, (5) no long tasks > 200 ms.

---

## STOP & ASK (Jan) — raise these early, do not decide them

| # | Item |
|---|---|
| P-0 | **L0–L2 not implemented?** — see PRECONDITION above. Blocking |
| S-6 | The AT time-offset fix (V-144) visibly changes what the map shows for Austria |
| S-5 | `DE_PAST_SEED_FRAMES` 9 → 12 follows O-10, which is a proposal, not a decision |
| S-1 / O-19 | Shader crossfade instead of the CPU blend (WebGL zone) |
| S-2 | GPU streamlines instead of GeoJSON arrows (WebGL zone) |
| S-3 | KONRAD3D polling (~7.2 MB/h) over the existing `/_dwd_opendata` rewrite — L11, but decide early |
| S-4 / O-17 | A warm-cron for the RV retrospect (cron/budget zone; blocked behind A10/V-80) |
| — | Anything else in `CLAUDE.md` §Harte Regeln, and the missing weak Android test device |

Also outstanding for Jan: decisions **O-09…O-19**. The spec names a default for each of O-15…O-19,
so none of them blocks you — but none of them is decided either.

---

## AFTER EACH PHASE

- `checklist.md` — tick the gate boxes **with evidence paths**, never bare.
- `context.md` §Session-Log — a 3–5 sentence conclusion (date, phase, result, open points) plus
  every doc↔code contradiction found.
- `improvements.md` — every improvement as `V-NN` with Mehrwert + Umsetzungsskizze (next: V-148).
- `tests.md` — record the actual protocol run, not the plan.
- Update the affected specs in place if the implementation revealed the spec to be wrong. **A spec
  that turns out to be wrong is a finding, not a failure** — record it, correct it, say why.

---

## WHAT NOT TO DO

- Do not touch `precipSource.ts` or `precipComposite.ts`.
- Do not revise D-14 or resurrect the model half of the precipitation view.
- Do not write a shader, a second `WindLayer`, or any GPU code.
- Do not add a runtime dependency, and do not touch edge functions, warm-crons or manifests.
- Do not remove, hide or "simplify" any existing function — including on mobile.
- Do not start L6 before Gate GL5 is fully green.
- Do not report an emulated FPS number as evidence for the GL6 performance criterion.
- Do not commit anything unless Jan asks for it.
