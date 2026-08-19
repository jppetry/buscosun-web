# prompt-zellbahnen-v2.md — Kickoff Prompt: Phase Z2 (storm-cell tracks — readability and location relevance)

> **Stand: 2026-08-07.** Standalone kickoff for a single phase. `prompt.md` (L5 + L6) stays
> untouched and remains the assignment after this one — same pattern as the former
> `prompt-2d-zuglinien.md`.
>
> **Execution:** open a fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from
> `## ▶` to the end as the first turn. A dev server **is** required (`npm run dev`), and Chrome
> DevTools MCP must be available — this phase is verified on the screen, not only in the harness.
> Recommended: start with `/plan` so the first turn finishes the reading order before anything is
> written.

---

## ▶ Implementation Session: Phase Z2 — make the `cells` layer readable

**MISSION**
Phase **Z1** built the `cells` layer on DWD KONRAD3D: official data, correct geometry, clean
honesty surface. **That data path is right and is not touched.** What is missing is readability —
today the map draws objects but answers no question. Phase **Z2** changes only **how** the
existing data is drawn and labelled, and it connects the cells to the chosen location.

**Zero new bytes.** No new source, no new request, no change to `dwdKonrad3d.ts` or `konrad3d.ts`.
Every number this phase renders is already in the file the map loads.

The written diagnosis is **`audit/zellbahnen-karte.md`** — it is the specification for this
session. It was produced before this prompt, per `CLAUDE.md` §Harte Regeln (Diagnose-First), and
its measurements were taken from `scripts/fixtures/konrad3d-sample.xml` and the code itself.

---

**READ FIRST — confirm in writing that you have read each one, in this order:**

1. `CLAUDE.md` — constitution: hard rules, STOP & ASK triggers, the five self-verification questions
2. `agents.md` §§1–7 — workflow, conflict zones, Definition of Done, known agent traps
3. **`audit/zellbahnen-karte.md` — the diagnosis you are implementing. Read it completely.**
4. `audit/zellbahnen.md` — the Z1 diagnosis this builds on, especially §3 (the deliberate
   "no `symbol`/`text-field`" decision) and §4 (the honesty surface you must not weaken)
5. `checklist.md` — Gate **GZ2** (these are your acceptance criteria, verbatim)
6. `tests.md` — protocol **V-ZELLBAHNEN-KARTE** (these are your UI verification steps)
7. `decisions.md` — D-04, D-11, D-12, D-19, D-27
8. `improvements.md` — **V-148, V-159, V-160, V-161, V-162, V-163**
9. `docs/zuglinien-radar-spec.md` §10.5 — the `map.addImage` arrow-sprite pattern already
   approved in this repo; §11 for the E3 background

**Then read the code before changing any of it:**
`src/radar/cellPolygons.ts` (this is where almost all of your work goes) ·
`src/radar/konrad3d.ts` (read only — you will not change it) ·
`src/sources/dwdKonrad3d.ts` (read only) ·
`scripts/verify-cells.mjs` (you extend it, you do not rewrite it) ·
in `src/MapView.tsx`: the `CELLS_*` constants around `:343-370`, `renderCellPopup` at `:174`,
the source/layer creation and the `moveLayer` block, both visibility blocks (`:1518`), the
KONRAD3D polling effect at `:2656`, the `location` prop and the marker at `:1132`, the
`overview` prop at `:546`.

Every doc↔code contradiction you find goes into `context.md` §Session-Log **and** gets the doc
corrected in place (`agents.md` §1.3: code wins).

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Funktionserhalt is the top directive.** Nothing existing is removed, hidden or "simplified".
  `coneRing()` and `etaMinutesToPoint()` stay exported and stay verified — they are the named
  fallback. The cell outline is never thinned away; only the *additional* geometry is.
- **No new data path, no new request.** `konrad3d.ts` and `dwdKonrad3d.ts` are read-only for this
  phase. Proof at the gate: **zero additional network requests** compared to the Z1 state.
- **Purity boundary (D-12).** All geometry and all decisions live in `src/radar/cellPolygons.ts`,
  pure, DOM-free, headless-verifiable. `MapView.tsx` receives layer definitions and wiring only —
  no computation in React, nothing in a repaint path.
- **The honesty surface of Z1 is not weakened, only extended** (`audit/zellbahnen-karte.md` §5).
  Arrow, time marks and cone steps are all *forecast* and must carry the same optical language as
  the dashed track. An arrow may not look more solid than the line it sits on.
- **ETA is a range, never a point value.** It comes from the official `uncertainty_ellipse`.
  No ellipse ⇒ no ETA — not an estimated one.
- **Wording (D-19) unchanged:** "Zelle", "erreicht dich in ~", "zieht vorbei". Never "trifft",
  "Warnung", "Gefahr", "Unwetter", "Tornado". The sentence "kein amtliches Warnprodukt, kein
  Warnersatz — maßgeblich sind die DWD-Warnungen" stays at all four existing places.
- **One speed, not two.** The displayed number comes from the same geometry as the drawn track
  (diagnosis §2.5) and is rounded to 5 km/h steps.
- **No WebGL/shader zone.** Everything here is native MapLibre `fill`/`line`/`circle`/`symbol`.
  No canvas overlay, no custom layer.
- **Command-Deck (D-27):** any new UI uses the existing `--mdk-*` tokens in `src/map/mapDeck.css`.
- **Improvement duty (D-28):** every improvement found is registered as a `V-NN` entry in
  `improvements.md` (next free number: **V-164**) with a plain-language Mehrwert and a concrete
  Umsetzungsskizze.
- **Language:** documentation in **German**, code identifiers, comments and commits in **English**
  (Conventional Commits, scope `cells`). **No commits without Jan's instruction.**

---

## STOP & ASK (Jan) — raise these in the first turn, do not decide them

| # | Item |
|---|---|
| **S-Z2-1** | **`symbol`/`icon-image` for arrow and time marks.** Z1 wrote down "deliberately without `symbol`" (`audit/zellbahnen.md` §3). That rule guards against missing **glyphs** — it targets `text-field`. `icon-image` from `map.addImage` needs no glyph source, and `docs/zuglinien-radar-spec.md` §10.5 already prescribes exactly that pattern. Recommend path A; path B (glyph-free: triangle polygon + graduated circles) is documented in diagnosis §3 and must stay implementable. **Ask, then build.** |
| **S-Z2-2** | **The displayed cell speed changes visibly** — from `cell_speed` to the track-derived value, roughly 1–7 % lower, rounded to 5 km/h. Deliberate change to an existing readout, not a bugfix. |
| **S-Z2-3** | **The location relevance highlights one cell.** A map that singles something out makes a claim about relevance. Wording and the `hitRadiusKm` threshold need Jan's read-through before they go live. |

Nothing in `CLAUDE.md` §STOPP & FRAGEN is touched: no shader/WebGL, no fusion, no deletion, no
dependency change, no edge function / cron / manifest change, nothing irreversible.

---

## BUILD ORDER — each step leaves the app working

1. **Golden baseline first.** Screenshots of the `cells` layer, desktop 1440×900 and iPhone 12 Pro
   390×844 DPR 3, with a convective situation on the map (or the fixture replayed). Gate GZ2 asks
   for a pixel-diff and you cannot diff against nothing. Store under
   `audit/screenshots/zellbahnen-karte/before/`.

2. **`src/radar/cellPolygons.ts` — the pure functions** (diagnosis §4). Write each one **together
   with** its verifier check, not afterwards:
   - `conePolygons(cell)` — one ellipse polygon per forecast step, `leadMin` as a property
   - `trackSpeedKmh(cell)` — speed derived from the drawn track
   - `trackBearing(cell, leadMin?)` — bearing across segments; `null` without a track
   - `arrowAnchor(cell)` — position + rotation for the arrowhead
   - `timeMarks(cell, leads)` — points for +15/+30/+60
   - `etaWindowToPoint(cell, target)` — `{ earliestMin, latestMin, distanceKm }`
   - `passByToPoint(cell, target)` — `{ missKm, atLeadMin }` when the cell passes by
   
   `coneRing()` and `etaMinutesToPoint()` remain untouched and remain verified.

3. **Extend `buildCellFeatures()`** with `kind='cone-step'`, `kind='arrow'`, `kind='mark'`.
   One FeatureCollection, discriminated by `kind` — the Z1 pattern is continued, not replaced.

4. **Extend `scripts/verify-cells.mjs`.** The existing **64 checks must stay green and unchanged** —
   that is your Z1 regression proof. Add the checks listed in diagnosis §8.
   **Red-test duty (V-99/O-02):** break it once on purpose, keep the evidence for the gate.

5. **Wire it into `MapView.tsx`, additively.** New layers join `CELLS_LAYER_IDS` in draw order and
   are hoisted by the same `moveLayer` block. Register the arrow sprite via `map.addImage` in the
   same `initOverlays` block as the sources, guarded by `hasImage()`.

6. **Location relevance.** Uses the existing `location` prop. `overview === true` ⇒ no location
   relevance at all, no placeholder. The affected cell gets `affects: true` and a heavier line via
   a `case` expression — **not** a second layer.

7. **Thinning.** `minzoom` per layer plus a `filter` on `sev`. The outline is exempt.
   `log()` what was dropped — silent truncation reads as "everything is shown".

8. **Legend and layer text.** Name the thinning, name the ETA range, keep the four existing
   "kein amtliches Warnprodukt" placements.

---

## VERIFICATION — what must be green

```
npm run verify:cells        (extended — the 64 existing checks unchanged and green)
npm run verify:hail         (55/55, unchanged — shares konrad3d.ts)
npm run verify:warnings     (101/101, unchanged)
npm run typecheck
npm run build
```

**UI verification** via Chrome DevTools MCP, protocol **V-ZELLBAHNEN-KARTE** in `tests.md`:
arrow direction recomputed against the bearing on one cell · time marks on the track and in order ·
cone visibly fading toward +60 · location in the path ⇒ range appears · location abeam ⇒ pass-by
statement · `overview` ⇒ neither · **zero additional network requests versus Z1** · touch targets
≥ 44 px · console clean · no long tasks > 200 ms · feature counts before/after thinning **measured**.

**Before the gate, answer the five self-verification questions in writing, with evidence:**
(1) Funktionserhalt **individually per layer**, (2) desktop pixel-identical outside the `cells`
layer, (3) touch targets ≥ 44 px, (4) console clean, (5) no long tasks > 200 ms.

---

## AFTER THE PHASE

- `checklist.md` — tick Gate **GZ2** with evidence paths, never bare.
- `context.md` §Session-Log — 3–5 sentences (date, phase, result, open points) plus every
  doc↔code contradiction found.
- `improvements.md` — every improvement as `V-NN` with Mehrwert + Umsetzungsskizze (next: V-164).
- `tests.md` — record the protocol **as run**, not as planned.
- `audit/zellbahnen-karte.md` — correct it in place where implementation proved it wrong.
  **A diagnosis that turns out to be wrong is a finding, not a failure.**

---

## WHAT NOT TO DO

- Do not touch `konrad3d.ts`, `dwdKonrad3d.ts` or the polling rule.
- Do not add a data source, a request, or a runtime dependency.
- Do not remove `coneRing()` or `etaMinutesToPoint()`.
- Do not put an ETA on the map without an official ellipse behind it.
- Do not weaken the measured↔forecast separation to make the map look cleaner.
- Do not rewrite `scripts/verify-cells.mjs` — extend it, so the 64 Z1 checks keep their value.
- Do not touch the Regenradar (`NowcastRadarMap.tsx`, `cellTracking.ts`) — that is V-159/V-162/V-163
  and a separate phase.
- Do not start on the Steckbrief rebuild (V-160) or the measured past track (V-161) in this phase.
- Do not commit anything unless Jan asks for it.
