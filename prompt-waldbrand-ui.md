# prompt-waldbrand-ui.md — Kickoff Prompt: Phase WBU1 — Waldbrand deck in Wetterkarte optics

> **Stand: 2026-08-14.** Standalone kickoff **next to** `prompt.md` — same pattern as
> `prompt-zellbahnen-v2.md` (Z2) and `prompt-waldbrand-dach.md` (WB0–WB5, done except GWB4).
> This is a **pure presentation phase** on the existing feature `fire`: no new data path, no new
> byte on the wire — the Z2 precedent applies verbatim.
>
> **Execution:** fresh Claude Code session in `C:\dev\buscosun-web`, copy everything from `## ▶`
> as the first turn. Dev server (`npm run dev`) and Chrome DevTools MCP required. Recommended: `/plan`.

---

## ▶ Presentation Session: Waldbrand deck — same optics as the Wetterkarte (Gate **GWBU1**)

**MISSION (Jan, 2026-08-14, verbatim intent)**
Restyle the Waldbrand view so it looks and feels like the 2D Wetterkarte:

1. **Layer toggles on the LEFT**, in the exact optics of the weather map dock rows.
2. **Layer explanations on the RIGHT**, in the exact optics of the weather map's `LayerInfoPanel`.
3. **Time slider bottom CENTER**, in the exact optics of the weather map's time deck.
4. **Every other element** (topbar, basemap switch, presets, status stamps, data-age chips,
   attribution, mobile sheet) matches the weather map's Command-Deck look.

This phase changes **markup and CSS only**. `src/fire/sources/*`, `fireTime.ts`, `firePlayback.ts`
and the data logic in `fireModel.ts` stay untouched — adding **presentation metadata** to
`fireModel.ts` (group, accent token, icon id per `FireLayerId`) is allowed, changing behaviour is not.

---

**READ FIRST — confirm in writing, in this order:**

1. `CLAUDE.md` — hard rules; especially D-27 (Command-Deck), Diagnose-First, Funktionserhalt
2. `mobile-design-guidelines.md` — breakpoints 767/1439, safe-area, sheet patterns
3. `src/fire/FirePage.tsx` + `src/fire/fireDeck.css` — the CURRENT fire UI you are restyling
4. `src/MapView.tsx` — ONLY the UI sections (grep, do not read the whole 316 KB file):
   `layerRowDeck` (~:4459-4493) · time deck (~:4613-4671) · `DECK_GROUPS` (~:5542-5615) —
   line numbers drift, search by symbol name
5. `src/map/mapDeck.css` — the `.mdk-` optics you are replicating (do NOT import it, see below)
6. `src/components/LayerInfoPanel.tsx` + `LayerInfoPanel`-CSS — the right-hand profile optics
7. `src/components/LayerIcon.tsx` — the icon style (stroke 1.5/1.6, currentColor, 24×24 viewBox)
8. `src/designTokens.css` — the shared tokens both decks must draw from
9. `checklist.md` §Phase WB — what is already green; GWB4 is partly blocked, leave it alone

---

## DIAGNOSIS FIRST (no code before this exists)

Write `audit/waldbrand-ui.md`:

- Side-by-side screenshots Wetterkarte vs. Waldbrand, desktop 1440×900 and 390×844.
- An **element mapping table** — every current `fire-*` element → its target optic, e.g.:

  | Fire today | Target optic (weather map) |
  |---|---|
  | `.fire-layer` row with `.fire-layer-dot` | `layerRowDeck` row: SVG icon + label + sublabel + status stamp, `role="switch"`, per-group accent |
  | inline `.fire-layer-note` / `.fire-layer-info` | right-hand `LayerInfoPanel` (eyebrow, title, accent, desc, source, legend, trust) |
  | `.fire-time` block | bottom-center time deck: play button, day ticks, `<input type="range">`, label — keep day steps and the „lädt …" pending state |
  | `.fire-topbar`, `.fire-basemap`, `.fire-dock-presets`, `.fire-dock-later` | Command-Deck topbar / chip optics |

- List every element that has NO weather-map counterpart (e.g. „Ausbaustufe 2" list, AT-gap marker)
  and propose how it inherits the optics without inventing a new pattern.

---

## HARD CONSTRAINTS — a violation invalidates the phase

- **Zero new requests.** Before/after network capture must show identical request sets (Z2 proof
  pattern: „kein neuer Datenpfad, kein zusätzliches Byte").
- **Do NOT import `mapDeck.css` and do not put `.mdk-` classes into fire markup.** Repo convention:
  every deck copies the pattern into its own stylesheet with its own prefix (`.fire-` stays), drawing
  only on `designTokens.css`. The two decks must remain independently changeable.
- **`LayerInfoPanel` reuse — decision rule:** preferred path is an **additive** optional prop
  (`info?: Record<string, Info>`, defaulting to the existing `LAYER_INFO`) so the fire deck injects
  its own profiles. Condition: the weather map stays **pixel-equal** (screenshot diff). If the diff
  is not clean, copy the component into `src/fire/` instead and say so in the audit.
- **Icons:** new `src/fire/fireIcons.tsx` in the `LayerIcon` drawing style (stroke geometry,
  currentColor, 24×24). Do **not** extend the `switch` in `LayerIcon.tsx` — that file stays untouched.
- **Do not touch:** `MapView.tsx`, `mapDeck.css`, `src/fire/sources/*`, `fireTime.ts`,
  `firePlayback.ts`, edge functions, warm crons.
- **Honesty content survives the restyle.** Every Steckbrief keeps „kein amtliches Warnprodukt",
  the AT gap stays visible, data-age chips stay per layer, the interpolation notice stays. If the
  new right-hand panel shows one layer at a time, the AT-gap hint must still be reachable without
  opening a profile.
- **Desktop regression anywhere = phase failed.** Breakpoints 767/1439 only; touch targets ≥ 44 px;
  safe-area via `env(safe-area-inset-*)`.
- **Mobile:** ≤ 767 px the left dock becomes a bottom sheet in the weather map's sheet optics
  (`big` rows); the time deck stays visible above the sheet.

---

## VERIFICATION — what must be green (protocol into `tests.md` §V-WALDBRAND-UI)

1. V-ALL base protocol, both viewports.
2. **Optics parity:** side-by-side screenshots per element class (layer row, info panel, time deck,
   topbar, chips) Wetterkarte vs. Waldbrand — same fonts, same radii, same spacing rhythm, same
   token colors. File them under `audit/waldbrand-ui/`.
3. **Zero-request proof:** network capture before/after, request lists identical.
4. **Weather map pixel-equal** at 1440×900 — mandatory, since `LayerInfoPanel` may be touched.
5. All existing `verify:fire-*` runs green and unchanged; `npm run typecheck`; `npm run budget`
   (eagerJs unchanged — fire stays a lazy chunk).
6. Console clean; no long tasks > 200 ms while scrubbing the day slider.
7. The five self-verification questions from `CLAUDE.md`, in writing, with evidence.

---

## STOP & ASK (Jan)

- Pixel parity would require changing `mapDeck.css`, `designTokens.css` values, or `MapView.tsx`.
- The `LayerInfoPanel` prop route produces any visible diff on the weather map.
- Any element where „same optics" and „honesty content" conflict (e.g. the AT-gap marker has no
  weather-map counterpart and would have to be dropped to look identical) — propose, don't decide.

---

## AFTER THE PHASE

Add Gate **GWBU1** to `checklist.md` (with evidence paths), protocol `tests.md` §V-WALDBRAND-UI,
3–5-sentence Fazit in `context.md` §Session-Log, improvements as `V-NN` (D-28). Conventional
Commits, scope `fire`. No commit without Jan's order.

## WHAT NOT TO DO

- No new layers, no data changes, no GWB4 work (its two blocked layers stay blocked).
- No shared stylesheet abstraction between the decks — copy the pattern, keep the prefix.
- No redesign of the weather map „while you're at it".
