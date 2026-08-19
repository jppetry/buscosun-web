# prompt-brandflaechen-panel.md — Kickoff Prompt: Phases BP1–BP4 (fire footprints as polygons + collapsible left panel)

> **Stand: 2026-08-17.** Standalone kickoff for the build phases that follow the diagnosis
> **`audit/brandflaechen-panel.md`** (Phase BP0, analysis only). Sibling of
> `prompt-brandflaechen-echtzeit.md` (BF0–BF5, live footprints — largely built) and
> `konzept-brandflaechen-modul.md` (Sentinel-2 dNBR batch mapping — **not part of this prompt**,
> it waits for three separate STOP-&-ASK decisions: cron, storage path, toolchain).
>
> **Released and executed 2026-08-17** (Jan: „ja du kannst phase2 starten"). Gate GBP1 protocol:
> `audit/brandflaechen-panel.md` §9. Open questions (a)–(h) were unanswered at build time — the
> defaults below were used (BC1 tab kept, relabelled „Cluster"; ids session-stable; EFFIS wins;
> confidence = FIRMS aggregate + assessment; FIRMS release stands). Kept as the record of the phase.
>
> **Execution:** open a fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from
> `## ▶` to the end as the first turn. Dev server required (`npm run dev`), Chrome DevTools MCP
> required. Gate: **GBP1**.

---

## ▶ Implementation Session: Phases BP1–BP4 — fire footprints + left panel

**MISSION**
The fire view draws detections (points, pixel raster, cluster hulls) and, separately, EFFIS burnt-area
polygons. The question the user asks — *which fires are there right now, how large, since when, and
where exactly?* — is answered nowhere in one place. Build:

1. **BP1 — a pure registry** (`src/fire/footprint/fireRegistry.ts`) that turns clusters, reconciled
   zones, EFFIS polygons and EMS activations into one `FireRecord[]` with an **overpass-stable id**,
   a status (`active` / `no-signal` / `out` — `out` only with a source), aggregated confidence, an
   area with its kind (`mapped` / `upper-bound`), and an in-window history. Verifier
   `npm run verify:fire-registry`.
2. **BP2 — the panel + map coupling**: a new `FireLayerId` `fireFootprints` (bit 12, appended;
   z-band 78), a collapsible **left overlay panel** (`FireFootprintPanel.tsx`) with list, sort,
   filters, legend, three explicit states, detail card; hover/select coupling both ways with the map
   via filter layers; mobile as a third readout tab in the bottom sheet.
3. **BP3 — place + district** from a **static** DACH gazetteer + simplified admin boundaries
   (`public/fire/places-dach.json`, build script) — no Nominatim per row.
4. **BP4 — Gate GBP1**: the five self-verification questions with evidence on the production build.

The written diagnosis **`audit/brandflaechen-panel.md`** is the specification. Its §2.1 lists every
hook with file:line, §2.4/§2.5 the id rule and the `FireRecord` schema, §3 the design decisions that
were cross-checked (overlay instead of a fourth flex column; parallel selection state instead of
generalising BC1's; filter layers instead of `feature-state`; no new time model).

---

**READ FIRST — confirm in writing that you have read each one, in this order:**

1. `CLAUDE.md` — constitution: hard rules, STOP & ASK triggers, the fire-line lessons 1–5, the five
   self-verification questions
2. `agents.md` §§1–7 — workflow, conflict zones, Definition of Done
3. **`audit/brandflaechen-panel.md` — the diagnosis you are implementing. Read it completely.**
4. `audit/brandflaechen-echtzeit.md` (BF0: why there is no calibratable hull factor, why the industry
   block is a real fire, `week ⊂ season`) and `audit/waldbrand-cluster.md` (BC1: one clustering in the
   project, the static-source caveat, the spoken list cap)
5. `src/fire/footprint/reconcile.ts`, `src/fire/fireClusters.ts`, `src/fire/fireEvents.ts`,
   `src/fire/fireZones.ts` — the modules the registry composes; do not rebuild any of them
6. `src/fire/FirePage.tsx` and `src/fire/FireMap.tsx` — the shell you extend (BC1 selection at
   `FirePage.tsx:497-530`, click chain at `FireMap.tsx:662-767`, focus effect `:810-830`, `applyState`
   `:403-611`, `installLayers` `:1171-1489`)

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Function preservation.** BC1 list (rank by ΣFRP, cap 50, static chip), area popup, raster popup,
  history slider, time baskets, old `#wb=` permalinks — all identical. Regrouping is allowed only if
  Jan answered question (d) with "move"; default: keep the BC1 tab and add a mutual footnote.
- **No desktop regression.** `.fire-body` flex, `.fire-dock`, `.fire-readout` widths untouched; the
  panel is an absolute overlay inside `.fire-center` (`bottom: 96px` keeps the time deck free).
  Breakpoints only 767 px / 1439 px. Touch targets ≥ 44 px.
- **Ids are appended, never inserted.** `fireFootprints` is bit 12 in `FIRE_LAYER_ORDER`;
  `verify:fire-model` asserts it. New `#wb=` fields are standard-silent (`fp` only when the panel is
  open).
- **One clustering, one reconciliation.** The registry composes `spatialClusters` results and
  `reconcileZones()`; it adds `anchorKey` to `FireCluster` additively and nothing else to the cluster
  pipeline. No `Date.now()` inside pure modules (D-12).
- **Never two shapes for one fire.** Precedence EMS > EFFIS > (own mapping, later) > raster > hull;
  the verifier asserts it on fixtures.
- **Wording.** "bestätigt" only with EFFIS or EMS named in the same sentence; "erloschen" only with a
  source (EFFIS `FINALDATE`, EMS closed); otherwise "kein Signal seit X". Upper-bound areas carry the
  chip and the note; no hectare figure without its kind.
- **V-220.** Every GeoJSON handed to the map is a memoised reference; new props go into the
  `applyState` dependency list (`FireMap.tsx:885`).
- **No new runtime dependency. No fetch per list row.** Nominatim stays what it is today (single,
  user-triggered lookups); the panel uses the static gazetteer from BP3 or shows "—" with a reason.
- **Hotspot pipeline, FWI layer, edge functions, warm crons: untouched.**

## STOP & ASK (Jan) — raise these in the first turn, do not decide them

- If any answer to diagnosis §7 (a)–(h) is still missing and would change the build (especially (d)
  BC1 list placement and (f) FIRMS under the new constraint).
- If the panel needs anything from the Sentinel-2 batch line (it must not).
- If a measured payload or long task on the production build exceeds the gate (list > 200 ms,
  bundle ratchet in `budget.json`) and the fix would touch a shared module.

## BUILD ORDER — each step leaves the app working

1. **BP1** `fireRegistry.ts` + `verify-fire-registry.mjs` (fixtures: new overpass ⇒ same id; merge
   inherits the older id; split keeps the id on the anchor part; never two geometries; `out` only
   with source; area kind always set). `fireClusters.ts` gets `anchorKey`. `npm run verify:fire-clusters`
   stays green.
2. **BP2a** `fireModel.ts` (`fireFootprints`, bit 12, z 78, dock group "Aktuelle Lage"),
   `fireState.ts` (`fp`), `FireLayerCard.tsx` (info + legend), `verify:fire-model` extended.
3. **BP2b** `FireMap.tsx`: sources/layers `fire-footprints-*`, selection block before the popup
   chain (`onSelectFootprintRef`), hover mini-effect, `focusBbox` in the focus effect, `mousemove`
   list. Basemap switch keeps selection (filter re-applied in `applyState`).
4. **BP2c** `FireFootprintPanel.tsx` + `--fp-*` tokens in `fireDeck.css` (additive rules only),
   `FirePage.tsx` state and wiring, mobile third tab (`readoutTab` falls back to `'fires'` when leaving
   mobile), three states, legend, sort/filters, cap 50 + "n weitere".
5. **BP3** `scripts/build-places-dach.mjs` → `public/fire/places-dach.json` (GeoNames `cities1000`
   DACH subset, CC BY 4.0) + simplified district polygons (VG250 / STATISTIK AUSTRIA /
   swissBOUNDARIES3D); lazy load on panel open; lookup in the worker; attribution in
   `scripts/seo/licenses.mjs`.
6. **BP4** Gate GBP1.

## VERIFICATION — what must be green

- `npm run typecheck` · `verify:fire-model` · `verify:fire-clusters` · `verify:fire-footprint` ·
  **`verify:fire-registry`** · `npm run build && npm run budget`.
- MCP desktop 1440×900: panel open/closed, hover list→map, click list→map (fitBounds), click
  map→list (no camera move), filters, basemap switch with an active selection, BC1 tab unchanged.
  1024 px: overlay width 264 px. iPhone 12 Pro 390×844: third tab, touch targets, sheet snap.
- Console clean; long tasks measured on the **production build**; screenshots under
  `audit/screenshots/brandflaechen-panel/`.
- The five self-verification questions answered in writing with evidence in
  `audit/brandflaechen-panel.md` §9 (new section) — and in `checklist.md` if that file exists again.

## AFTER THE PHASE

- Append the gate protocol to `audit/brandflaechen-panel.md` §9; if `checklist.md`/`context.md`
  exist again, add Gate GBP1 and a 3–5-sentence session note.
- Log improvements as `V-NN` in `improvements.md` if it exists; otherwise extend §8 of the diagnosis.
- Do **not** start the Sentinel-2 batch line; write down what BP1–BP4 learned that changes its plan.

## WHAT NOT TO DO

- Do not generalise `selectedCluster`/`selectFromMap`/`onSelectCluster` — run the footprint selection
  in parallel with mutual exclusion.
- Do not use `feature-state`, `content-visibility`, a fourth flex column, or a second time slider.
- Do not add PMTiles, R2, a proxy for EFFIS compression, or any Python — those are separate decisions.
- Do not call an unconfirmed footprint a confirmed fire, and do not print a hectare figure without
  its kind.
