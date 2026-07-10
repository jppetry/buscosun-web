# prompt.md — Kickoff Prompt for Claude Code

Copy the block below into a fresh Claude Code session (working directory `C:\dev\buscosun-web`) to start the implementation. Make sure `npm run dev` is running first (needed for MCP verification).

---

## ▶ Phase 1-C: Wetterkarte Redesign „Variante C"

**TASK**
Implement the mobile redesign "Variante C" for the 2D Wetterkarte. This is **Phase 1-C** in `plan.md`, tracked by **Gate G1-C** in `checklist.md`. Phase 1 already passed (G1) and a §8 follow-up shipped two separate Layer/Modell FABs — Variante C deliberately **merges those back into one bottom sheet** with a segment switcher (Layer · Modell · Vorhersage) and three snap states (collapsed/half/full). This merge is approved by Jan; do not treat it as a regression.

**AUTHORITATIVE SPEC & REFERENCES — read these first, confirm you have read them:**
1. `audit/mockups/wetterkarte-c-spec.md` — the binding 14-section implementation spec (ist-code mapping §1, target React state §2, state machine §3, layout/measures §4, sheet header/segment §5, chip-strip §6, Layer segment §7, Modell segment §8, Vorhersage/PFC integration §9 [preservation-critical], motion §10, CSS cleanup §11, 13-point preservation contract §12, verification §13, implementation order §14)
2. `audit/mockups/wetterkarte-c-detail.html` — the 5 target states Z1–Z5 with dimension annotations
3. `audit/mockups/wetterkarte-mobile.html` — A/B/C comparison (C is the chosen one)
4. `CLAUDE.md`, `context.md` (current status), `plan.md` (Phase 1-C), `checklist.md` (G1-C)

**PROCEDURE (Diagnose-First — no exceptions)**
1. DIAGNOSE: Map the current `MapView.tsx` / `MapView.css` state against spec §1 and write the diagnosis into `audit/wetterkarte.md` **before writing any code**. Confirm the current behavior of all 13 preservation points (spec §12).
2. IMPLEMENT: Follow the implementation order in spec §14. Small, mobile-only, breakpoint-isolated commits. The Punkt-Vorhersage integration (spec §9) is the highest-risk part — prefer the incremental wrapper-move approach first.
3. VERIFY: Chrome DevTools MCP at iPhone 12 Pro (390×844, DPR 3). Walk the 13-point preservation contract function by function, confirm three snap states + segment switching, transform-based motion (CLS ≈ 0), touch-targets ≥ 44px, desktop pixel-identical to baseline. Capture before/after screenshots of all five states Z1–Z5 under `audit/screenshots/wetterkarte/`.
4. GATE: Tick off every G1-C item in `checklist.md` with evidence, append a 3–5 sentence Session-Log entry to `context.md`, answer the five self-verification questions from `CLAUDE.md` in writing.

**HARD RULES (from CLAUDE.md):** No shader / WindLayer / Fusion-engine changes. No desktop layout change. No function removed or hidden — regrouping only. HARD STOP and ask Jan before anything irreversible.

**Documentation you write** (audits, summaries) in German; code, comments, and commits in English (Conventional Commits, scope `wetterkarte`).
