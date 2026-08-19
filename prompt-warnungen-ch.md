# prompt-warnungen-ch.md — Kickoff Prompt: Phase W2 (official warnings — Switzerland)

> **Stand: 2026-08-08.** Standalone kickoff for a single phase, same pattern as
> `prompt-zellbahnen-v2.md`. `prompt.md` (L5 + L6) stays untouched and remains the assignment
> after the warning phases.
>
> **Phase split — deliberate.** `CLAUDE.md` §Harte Regeln says one topic = one phase = one gate.
> AT and CH are two different data formats, so they are **two phases**:
> **W2 = Switzerland** (this prompt) · **W3 = Austria** (sketch at the end, own prompt later).
> CH goes first because its source is CAP 1.2 — the same format the layer already parses. That
> makes the multi-source refactor small and testable before Austria adds a structurally
> different source on top.
>
> **Execution:** fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from `## ▶`
> to the end as the first turn. Dev server required (`npm run dev`); Chrome DevTools MCP must be
> available. Recommended: start with `/plan` so the first turn finishes the reading order and the
> STOP & ASK list before anything is written.

---

## ▶ Implementation Session: Phase W2 — Swiss warnings in the `warnings` layer

**MISSION**
Phase **W1** built `LayerKey 'warnings'` on DWD CAP: official texts quoted verbatim, official
colours, honest empty and failure states. **That is correct and stays.** What is wrong is the
map's edge: at the Swiss border the layer goes silent, and a user cannot tell whether there is no
warning or whether buscosun simply is not looking.

Phase **W2** makes the layer **multi-source** and adds Switzerland. Germany's rendering,
behaviour and byte path must come out of this phase **unchanged** — that is the regression proof.

The written diagnosis is **`audit/warnungen-at-ch.md`** — it is the specification for this
session. It was produced before this prompt per `CLAUDE.md` §Harte Regeln (Diagnose-First); every
claim in it was measured against live payloads on 2026-08-08.

---

**READ FIRST — confirm in writing that you have read each one, in this order:**

1. `CLAUDE.md` — constitution: hard rules, the Warn-Layer Sonderregel, STOPP & FRAGEN triggers,
   the five self-verification questions
2. `agents.md` §§1–7 — workflow, conflict zones, Definition of Done, known agent traps
3. **`audit/warnungen-at-ch.md` — the diagnosis you are implementing. Read it completely.**
4. `audit/wetterwarnungen.md` — the W1 diagnosis this builds on: §0 (quote, never rephrase),
   §5 (format traps), §7 (the honesty surface you must not weaken)
5. `checklist.md` — **Gate GW1** (W1's criteria — your regression contract; every box that is
   ticked there must still be true for DE at the end of W2)
6. `tests.md` — protocol **V-WARNUNGEN** (the W1 protocol; you extend it, you do not replace it)
7. `docs/API.md` §7 (licence obligations) and **§8.2** (MeteoAlarm — corrected 2026-08-08)
8. `docs/DATA_SOURCES.md` **§9.3** (CH — corrected 2026-08-08, entry C1)
9. `decisions.md` — D-04, D-06, D-12, D-19, D-27
10. `improvements.md` — **V-173** (this phase), V-17, V-19

**Then read the code before changing any of it:**
`src/warnings/capAlerts.ts` (ZIP reader + CAP parser — the two changes in §HARD CONSTRAINTS go
here) · `src/warnings/warnField.ts` (colours, time filter, GeoJSON, texts) ·
`src/sources/dwdCapAlerts.ts` (read as the pattern for the new source module — do not change its
behaviour) · `src/officialSources.ts` (**`verifyOfficialSources()` actively asserts that AT/CH
have no own warnings — see below**) · `scripts/verify-warnings.mjs` (you extend it, you do not
rewrite it) · `scripts/verify-official-sources.mjs` · in `src/MapView.tsx` the `warnings` layer:
source/layer creation, the popup slot, the polling effect, the legend and status line ·
`netlify.toml` and `vite.config.ts` (read only until S-W2-2 is answered).

**Record the current verifier counts in the first turn** (`verify:warnings`,
`verify:official-sources`, `verify:datenalter`, `verify:hail`, `verify:cells`). Those numbers are
your regression baseline for the gate — do not take them from any document, run them.

Every doc↔code contradiction goes into `context.md` §Session-Log **and** gets the doc corrected in
place (`agents.md` §1.3: code wins).

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Funktionserhalt is the top directive.** Germany's path is not refactored "while we're at it".
  `fetchDwdWarnings()` keeps its URL, its cache TTL and its return shape. The deep links in
  `officialSources.ts` **stay** — with own CH data they become the official primary source next to
  our rendering, not a leftover.
- **Warn-Layer Sonderregel (`CLAUDE.md`).** This layer *is* an official warning product. Swiss
  `headline`, `description` and `instruction` pass through **byte-identical**, exactly as the W1
  verifier already proves for DE. Nothing is summarised, sharpened or softened. MeteoSwiss's
  licence says the same in its own words: *"Warnings may only be reproduced and redistributed if
  this is done promptly and the content is not altered."*
- **⚠️ Height bands are metres for CH, feet for DE.** `capAlerts.ts:246` converts with
  `FEET_TO_M` unconditionally. Measured CH ceilings are round `800.0` / `600.0` / `3000`; 800 m is
  the official Swiss warning threshold. Converting them would turn *"gilt nur unterhalb 800 m"*
  into *"unterhalb 244 m"* — a **falsified official warning**. The unit must be carried **per
  source**, never assumed globally. A verifier check must fail if a CH ceiling is ever multiplied
  by 0.3048.
- **⚠️ Five `info` blocks per Swiss alert** (`en` `de` `fr` `it` `rm`). `parseCapAlert` at
  `capAlerts.ts:281` takes the first, which is `en`. Selection must go through `language` with a
  documented fallback — and the fallback must be *stated*, not silent.
- **Severity/colour is not shared blindly.** `warnColor()` falls back to `SEVERITY_FALLBACK_COLOR`
  when `AREA_COLOR` is absent — and the Swiss feed appears to carry **no** `AREA_COLOR`
  (measured: the only `eventCode` valueName is `NinjoWarnTypeId`; **verify this in turn one**).
  `SEVERITY_FALLBACK_COLOR` for `Severe`/`Extreme` is explicitly marked **unmeasured** in
  `warnField.ts:44`. So Swiss areas would be drawn in a DWD-derived colour that is not the
  official Swiss one. That is a D-04 problem: either source the official MeteoSwiss colours and
  cite them, or mark the colour as derived in the legend. **Do not quietly reuse the DWD palette.**
- **Purity boundary (D-12).** All parsing, unit handling, language selection and feature building
  stay in `src/warnings/*`, pure, DOM-free, headless-verifiable in `scripts/verify-warnings.mjs`.
  `MapView.tsx` gets wiring only.
- **No new runtime dependency (D-06).** No XML library, no HTTP client, no date library.
- **No durable cache for warnings (`docs/API.md` §7).** Whatever transport S-W2-2 lands on, it
  must not be a durable-cache proxy. The 60-second in-memory cache and the 5-minute poll are the
  pattern.
- **Attribution per source.** DE keeps *"Quelle: Deutscher Wetterdienst"*. CH needs its own
  constant: *"Quelle: MeteoSchweiz"* plus MeteoAlarm's *"Data provided by EUMETNET members"*.
  Note `a.license` will likely be empty for CH — the DE path relies on the `LICENSE` eventCode, so
  an empty string must not silently drop the attribution.
- **Command-Deck (D-27):** new UI uses existing `--mdk-*` tokens.
- **Improvement duty (D-28):** every improvement found is a `V-NN` entry in `improvements.md`
  (next free number: **V-174**) with plain-language Mehrwert and a concrete Umsetzungsskizze.
- **Language:** documentation German, code/comments/commits English (Conventional Commits, scope
  `warnings`). **No commits without Jan's instruction.**

---

## STOP & ASK (Jan) — raise these in the first turn, do not decide them

| # | Item |
|---|---|
| **S-W2-1** | **Atom or JSON for the CH feed.** `…/feeds/meteoalarm-legacy-atom-switzerland` is the officially maintained contract but its inner structure is **unverified** (the feed came back gzipped and could not be decoded during the diagnosis). `…/api/v1/warnings/feeds-switzerland` is **verified** but is the undocumented website backend and can break without notice. Recommendation: decode the Atom feed in turn one, then choose — and build the loser as the named fallback behind a flag (Rule 2). **Ask before building.** |
| **S-W2-2** | **New transport entry for `feeds.meteoalarm.org`.** The host sends no CORS header, so production needs a rewrite in `netlify.toml` (+ the same proxy in `vite.config.ts`). `CLAUDE.md` §STOPP & FRAGEN names *Edge Functions*, and a rewrite is not one — **but `improvements.md` V-01 explicitly calls adding Netlify rewrites the "STOPP&FRAGEN-Zone Edge/Transport".** The two readings disagree, so this is Jan's call, not yours. Do not touch `netlify.toml` before he answers. |
| **S-W2-3** | **How DE and CH warnings look side by side.** Two official colour systems on one map (DWD's per-alert `AREA_COLOR` vs. a CH scheme we have to source ourselves), plus Swiss `Extreme` severities that DE has never produced in the measured data. Whether the legend separates by country or by severity is a product decision. |
| **S-W2-4** | **`verifyOfficialSources()` currently asserts the opposite of this phase.** `src/officialSources.ts:94` fails the harness if `hasOwnWarnings()` returns true for AT or CH — deliberately, so a data gap could never look like an all-clear (see the file header). W2 has to invert that check for CH while keeping its intent for AT. That is a designed safety net being re-aimed, not a bug being removed — confirm the new wording with Jan. |

Untouched by this phase: shaders/WebGL, the fusion engine, component deletion, dependency
upgrades, warm crons, manifest mechanics.

---

## BUILD ORDER — each step leaves the app working

1. **Regression baseline first.** Run every verifier and record the counts. Screenshots of the
   `warnings` layer, desktop 1440×900 and iPhone 12 Pro 390×844 DPR 3, with a live German warning
   situation. Store under `audit/screenshots/warnungen-ch/before/`. You cannot prove
   "DE unchanged" against nothing.

2. **Capture a real CH fixture** into `scripts/fixtures/` — Atom *and* JSON, same minute, so the
   verifier runs offline and deterministically (O-02 Option B, the pattern of
   `konrad3d-sample.xml`). Answer S-W2-1 from this fixture, not from assumption.
   In the same pass, measure and write down: does the feed carry `AREA_COLOR`? does it carry a
   `LICENSE` eventCode? does it send `Last-Modified`? are superseded alerts still present
   (`msgType: "Update"` plus a `references` field — DE's full-stand semantics may not hold here,
   and if they do not, dedup is a real requirement, not a nicety)?

3. **Make `capAlerts.ts` multi-source — the two constrained changes only.**
   (a) altitude/ceiling unit as an explicit parameter of the parse call, defaulting to feet so the
   DE path is provably untouched; (b) `info` selection by `language` with a stated fallback.
   Write each change **together with** its verifier check, not afterwards.
   The **existing checks in `verify:warnings` must stay green and unchanged** — that is your W1
   regression proof. **Red-test duty (V-99/O-02):** break each new check once on purpose and keep
   the evidence for the gate.

4. **`src/sources/meteoAlarmCh.ts`** — modelled on `dwdCapAlerts.ts`: same `WarnRun` shape, same
   `dropped` accounting (*"0 Warnungen" must never mean "30 not read"*), same "empty is an answer,
   not a gap" contract. ⚠️ **Freshness in the empty case:** W1 leans on the file's `Last-Modified`
   (V-19). If MeteoAlarm does not send one, "no warnings in Switzerland" has **no** freshness
   evidence at all — then say so in the UI rather than showing a confident empty layer.

5. **`warnField.ts` — source-aware colours and labels.** Add the source to
   `WarnFeatureProperties` so the Steckbrief can name who issued the warning. Keep severity scales
   **source-pure**; map only through colour/severity, never through step numbers (DWD step 1 =
   yellow, CH step 1 = green — the numbers are not compatible).

6. **Wire into `MapView.tsx`, additively.** One layer, two sources. Poll rule unchanged: only with
   the layer active **and** the tab visible. Per-source failure: if CH fails and DE succeeds, the
   map must say *which* half is missing — a half-failure that reads as a whole-success is exactly
   the §7.3 defect W1 already fixed once for DE.

7. **`officialSources.ts` + its harness** per S-W2-4. AT keeps the Dauersiedlungsraum caveat and
   the deep link, and keeps asserting that we have no own AT warnings — until W3.

8. **Legend and layer text.** Name the country coverage (DE + CH, AT still via deep link), name
   the data age per source, name any derived colour as derived.

---

## VERIFICATION — what must be green

```
npm run verify:warnings           (extended — every pre-existing check unchanged and green)
npm run verify:official-sources   (adapted per S-W2-4, intent preserved for AT)
npm run verify:datenalter
npm run verify:hail               (unchanged)
npm run verify:cells              (unchanged)
npm run typecheck
npm run build
```

**UI verification** via Chrome DevTools MCP, extend protocol **V-WARNUNGEN** in `tests.md`:
a Swiss warning renders with correct geometry (spot-check one polygon's coordinates against the
named region — a `lat,lon` swap puts Ticino in Somalia and does not otherwise look broken) ·
German text in the Steckbrief, not English · a height band reads in **metres** and matches the
alert's own prose · DE areas pixel-identical to the baseline screenshots · CH-only failure is
labelled as a failure, not as an empty layer · time slider behaves for both sources · touch
targets ≥ 44 px · console clean · no long tasks > 200 ms.

**Before the gate, answer the five self-verification questions in writing, with evidence:**
(1) Funktionserhalt **individually per feature**, (2) desktop pixel-identical outside the
`warnings` layer, (3) touch targets ≥ 44 px, (4) console clean, (5) no long tasks > 200 ms.

---

## AFTER THE PHASE

- `checklist.md` — write **Gate GW2** and tick it with evidence paths, never bare. The gate does
  not exist yet: derive it from this prompt's constraints and from Gate GW1's structure, and get
  it reviewed before you tick anything.
- `context.md` §Session-Log — 3–5 sentences plus every doc↔code contradiction found.
- `improvements.md` — mark **V-173** as partially implemented (CH done, AT open) and add new
  findings from V-174 onward.
- `tests.md` — record protocol **V-WARNUNGEN** *as run*, not as planned.
- `audit/warnungen-at-ch.md` — correct it in place where implementation proved it wrong.
  **A diagnosis that turns out to be wrong is a finding, not a failure.** Its four open points
  (§6) are yours to close or to hand on explicitly.

---

## WHAT NOT TO DO

- Do not change `fetchDwdWarnings()`'s URL, cache TTL or return shape.
- Do not apply `feetToM()` to Swiss altitudes. This is the single most damaging possible mistake
  in this phase — it silently falsifies an official warning.
- Do not take the first `<info>` block for a Swiss alert.
- Do not paint Swiss areas in the DWD fallback palette without saying so.
- Do not touch `netlify.toml` or `vite.config.ts` before S-W2-2 is answered.
- Do not use the reverse-engineered MeteoSwiss app backend
  (`app-prod-ws.meteoswiss-app.ch`) — undocumented, PLZ-based, no polygons, no licence
  (`docs/DATA_SOURCES.md` §9.3).
- Do not register for the MeteoAlarm EDR API — it is token-gated and returns bounding boxes,
  which is worse for area rendering, not better.
- Do not rewrite `scripts/verify-warnings.mjs` — extend it, so the W1 checks keep their value.
- Do not start Austria in this phase. Reprojection EPSG:31287 → 4326 is W3.
- Do not commit anything unless Jan asks for it.

---

## NEXT PHASE (not this session): W3 — Austria, Gate GW3

Source is already rated **1** in `docs/DATA_SOURCES.md` §9.2 A1 and needs no further research:
`GET https://warnungen.zamg.at/wsapp/api/getWarnstatus` → FeatureCollection, MultiPolygon per
warning, CORS `*` ⇒ **no proxy**, CC BY 4.0, no key. The real work is three things:
**(1)** coordinates are **EPSG:31287 in metres** ⇒ inverse Lambert Conformal Conic + Bessel datum
shift, hand-written (~40 lines) rather than adding `proj4` (D-06);
**(2)** `getWarnstatus` carries **no official warning text** — that comes from
`getWarningsForCoords?lon=&lat=&lang=de`, so area and Steckbrief are two requests, and `warnid` is
**not joinable** between the two endpoints (GeoSphere issue #42);
**(3)** the Dauersiedlungsraum caveat must be visible — a warning-free Alpine area in AT means
*not covered*, not *no danger*.
