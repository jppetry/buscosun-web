# prompt.md — Kickoff Prompt for Claude Code

Copy the block below into Claude Code to start the session. Re-use the "Per-Phase Prompt" for each subsequent feature.

---

## Session Kickoff Prompt

**ROLE**
You are a senior frontend engineer specializing in mobile-first responsive design for WebGL/map-heavy React applications. You work methodically: diagnose first, implement second, verify with tooling — never by assumption.

**TASK**
Optimize all eight core features of the buscosun platform for mobile use, one feature at a time, in this fixed order: Wetterkarte, Regenradar, Vorhersage, Tourenplanung, Event-Planung, Historie, Atmosphäre, 3D Globus. Reference device: iPhone 12 Pro (390×844 CSS px, DPR 3). Every existing function must remain fully available — this is a re-layout and interaction redesign for mobile, not a feature reduction. Start now with **Phase 0 (Foundation & Baseline)** as defined in `plan.md`.

**CONTEXT**
Read these files in this order before doing anything else, and confirm you have read them:
1. `CLAUDE.md` — session rules, hard constraints, gate procedure
2. `context.md` — stack, feature table, known mobile GPU pitfalls
3. `mobile-design-guidelines.md` — binding UI patterns and budgets
4. `plan.md` — phase plan with per-phase measures and gates
5. `checklist.md` — gate checklists (you update this file)
6. `tests.md` — verification protocols (V-ALL plus per-feature protocols)

Key technical facts you must respect: mobile GPUs often lack `EXT_color_buffer_float`; shaders use explicit `highp` and RGBA8-packed position encoding — do not touch shader code or the fusion engine; the `AdaptiveQualityController` is the only sanctioned lever for mobile GPU performance tuning.

**RULES**
1. Strict phase discipline: Diagnose → Plan → Implement → Verify → Gate. Never write code before the diagnosis for the current feature is written to `audit/<feature>.md`.
2. Never modify desktop layout or behavior. Every mobile change must be isolated via the project's breakpoint convention (establish it in Phase 0).
3. Never remove, hide, or "simplify away" existing functionality. Regrouping into bottom sheets, tabs, or accordions is allowed; omission is not.
4. Verify using the Chrome DevTools MCP with iPhone 12 Pro emulation (390×844, DPR 3, touch enabled, mobile UA). Follow `tests.md` protocol V-ALL plus the feature-specific protocol. Attach evidence (screenshots, console output, traces) for every checklist item.
5. Emulation does not represent real GPU behavior. For GPU-critical findings (Wetterkarte particles, Regenradar rendering, 3D Globus), flag "real-device check required" instead of guessing.
6. HARD STOP and ask Jan before: any shader change, any fusion-engine change, deleting components, dependency upgrades, or anything irreversible.
7. Small commits, Conventional Commits, scope = feature name (e.g. `feat(vorhersage): stack model comparison as card list on mobile`).
8. After each phase: update `checklist.md` with evidence references, append a 3–5 sentence summary to the Session Log in `context.md`, then present the gate status and wait for approval before starting the next phase.
9. Documentation you write (audits, summaries) in German; code, comments, and commits in English.

**OUTPUT**
For Phase 0, deliver:
1. Confirmation that all six documents were read, plus any conflicts you detected between them.
2. Verified MCP emulation setup (test screenshot of the start page at 390×844/DPR 3).
3. Breakpoint inventory of the codebase and the convention you will use.
4. Baseline screenshots (mobile + desktop) of all eight feature pages under `audit/screenshots/baseline/`.
5. Console baseline per page.
6. Scaffolded shared primitives (BottomSheet, MobileToolbar/floating controls, safe-area utility) with a visible test route — no production layout changes.
7. Updated `checklist.md` (Phase 0) with evidence, and the gate G0 status.

Then stop and wait for my approval to begin Phase 1 (Wetterkarte).

---

## Per-Phase Prompt (template for Phases 1–8)

**TASK**
Execute Phase {N} — {Feature} exactly as defined in `plan.md`, under the rules of `CLAUDE.md`.

**PROCEDURE**
1. DIAGNOSE: Load the {Feature} page in the iPhone 12 Pro viewport via Chrome DevTools MCP. Capture screenshots, console state, a touch-target audit, and a performance trace. Enumerate every existing function of this feature (this list becomes the preservation contract). Write the full findings to `audit/{feature}.md`. Do not write any code yet.
2. PLAN: Derive the concrete measure list from the diagnosis, check each measure against `mobile-design-guidelines.md`, and record it under Phase {N} in `plan.md`. Present the plan and wait for approval if it deviates from the hypotheses in `plan.md` in any risky way (shaders, engine, deletions → hard stop).
3. IMPLEMENT: Small, isolated commits. Mobile-only via the established breakpoint convention.
4. VERIFY: Run protocol V-ALL plus V-{FEATURE} from `tests.md`. Walk the preservation contract function by function. Answer the five self-verification questions from `CLAUDE.md` in writing with evidence.
5. GATE: Update `checklist.md` with evidence references, append the phase summary to the Session Log, report gate status, and stop.

**OUTPUT**
`audit/{feature}.md` (diagnosis + verification + self-verification), before/after screenshots, updated `plan.md` and `checklist.md`, commit list, gate status.
