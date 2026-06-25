# context.md — Atmosphäre · Grundwahrheit (P0)

> Diagnose des bestehenden Design-Systems + der bestehenden Features, an die das
> neue „Atmosphäre"-Feature andockt. Erstellt in P0. Kein Feature-Code in P0.

## Design System Inventory (v1.8)

**Tokens:** zentral in `src/designTokens.css` als CSS Custom Properties im `:root`,
konsumiert via `var(--token)`. **Kein Tailwind, kein Theme-Objekt.**

- Sand/Cream: `--sand-50..300` (#F5F1E8 … #D9CEB0), `--cream-50` (#FAF6EA)
- Ink/Stone: `--ink-900` (#2C2A26), `--ink-800`, `--stone-600/500/400`, `--slate-500`
- Akzente: `--terracotta-500` (#C97B47) + `-700/-50`, `--sage-600` (#7A9466) + `-50`,
  `--steel-600` (#3A6FA8) + `-50`, `--amber-500` (#D4A373)
- Border: `--border-default/-medium/-strong`; Shadow: `--shadow-card/-float/-hover`
- Font: `--font-base`; Hero-Padding: `--hero-pad-x-desktop/-tablet/-mobile`
- Geteilte Primitive in `designTokens.css`: `.eyebrow`, `.live-dot`, `.pulse-dot`

**Geteiltes Theme:** `src/route/tourTheme.css` definiert die `rt-*`-Shell, die ALLE
Feature-Seiten nutzen: `.rt-page`, `.rt-container`, `.rt-nav`, `.rt-intro`,
`.rt-eyebrow`, `.rt-section`, `.rt-card`, `.rt-cols-2`, `.rt-badge`, `.rt-strip`.
Jedes Feature hat eine eigene `*.css` mit eigenem Prefix und lokalen Akzent-Vars
(z. B. `.td-page { --td-blue }`, `.nc-page { --nc-blue }`).

**Breakpoints (real, verstreut — KEIN zentrales System):** häufigste sind
`900px` (Split → gestapelt), `760px` (Nav kompakt), `640px`, `560px`, `520px`,
`480px`, `420px`. Für Atmosphäre nutzen wir die Layout-Schematik des Prompts und
mappen auf die real existierenden Werte (Desktop > 1024 / Tablet 768–1024 / Mobile
< 768), umgesetzt mit den bestehenden Query-Stufen.

**Wiederverwendbare UI-Primitive (pro Feature kopiert, nicht zentralisiert):**
- Segmented Control: Muster `.{prefix}-seg` + `.{prefix}-seg-btn.is-active`,
  `role="tablist"`/`role="tab"` (Beispiele: `.ev-seg`, `.fc-seg`, `.td-toggle`)
- Card/Panel: `.rt-card` (+ Feature-Overrides)
- Range-Slider/Scrubber: `input[type=range]` + `accent-color: var(--akzent)`,
  Container `.nc-scrubber` / `.td-time` mit „jetzt"-Tick + relativem Zeit-Label
  (`relTimeLabel`), Play-Loop alle 650 ms (`TerrainView.tsx`, `GlobePage.tsx`)

## Existing Feature Anatomy

**Rendering-Backbone:** **MapLibre GL `^5.6.0`** + Custom-WebGL-Layer. **Kein
Three.js, kein WebGPU-Renderer** (Three nicht in `package.json`). 3D entsteht über
MapLibre-Custom-Layer: `src/threed/CurtainLayer.ts` (3D-Atmosphären-Vorhang über
Terrain), `src/wind/WindLayer.ts` (GPGPU-Partikel). WebGL-Capability-Check:
`supportsWebGL()` in `ThreeDMap.tsx`.

**3D-Feature (`src/threed/*`, ~21 Dateien):**
- `ThreeDPage.tsx` Seiten-State (Ort/Punkte/`timeMs`/Layer) + `#3d=`-Permalink
- `ThreeDMap.tsx` Schnittlinien-Editor (MapLibre), `TerrainMap.tsx` + `CurtainLayer.ts`
  3D-Gelände-Vorhang, `SectionView.tsx` + `SectionChart.tsx` 2D-Schnitt (SVG+Canvas)
- Daten: `buildCrossSection.ts` (DEM + `getPointForecast`-Anker), `crossSection.ts`
  (Vertikalstruktur **heuristisch** aus 10-m-Wind via Potenzgesetz `α=0.2`, Lapse
  0.0065 K/m, Grenzschicht 1500 m AGL — ehrlich gekennzeichnet, US-N7)
- `SoundingPanel.tsx` + `SkewTChart.tsx` + `soundingMath.ts` (CAPE/CIN/LCL/LFC/EL)
- `dynamics.ts` (Föhn/Talwind/Bearing), `goNoGo.ts`/`GoNoGoPanel.tsx`
- `threedState.ts` Hash-Codec (`encodeState/decodeState/hasThreeDHash`)

**Globe-Feature (`src/globe/*`):** MapLibre Globe-Projektion + `WindLayer`-Partikel
+ GFS-GRIB2 im Worker (`gfsWorker.ts`, DRT 3 Complex Packing). Permalink `#g=`.

**LLM-Meteorologe (`src/assistant/*`) — vollständig implementiert, produktionsreif:**
- `engine.ts` WebGPU-Check + `CreateWebWorkerMLCEngine` (`@mlc-ai/web-llm ^0.2.84`),
  Lazy-Load, Token-Streaming, Abort, Thinking-Model-Filter
- `model.ts`/`MODELS.md` aktives Modell `Qwen3.5-4B-q4f16_1-MLC`
- `prompt.ts` strenger deutscher System-Prompt (keine Halluzination, Physik-Anker)
- `grounding.ts` 6 Phänomen-Builder (Föhn, Inversion, Wolkenbasis, Höhenwind,
  Modell-Spread, Lee-Wellen) — fehlende Werte werden weggelassen, nie geschätzt
- `weatherFacts.ts` koordiniert `getPointForecast` + `prepareCrossSection` +
  `fetchMultiModelForecast`; `useWeatherDescriber.ts` Hook; `weatherLLM.worker.ts`
- UI: `AssistantPage.tsx` (Ortssuche, Download-Progress, Phänomen-Chips, Streaming)

**State/Routing:** `App.tsx` `FeatureId`-Union + Hash-Router (`#3d=`, `#g=`, `#h=`,
`#ev`, `#m=`, `#val`). Feature-Seiten sind `({ onBack })` + `rt-page`-Shell, eigener
`useState`-State, Permalink via `history.replaceState`. **Kein globaler Store** —
State ist pro Feature lokal; „aktive Zeit" (`timeMs`/`fhour`) ist je Feature isoliert.

**Daten-Pipelines:** `getPointForecast` (Multi-Quellen-Blend: MOSMIX, AROME, INCA,
Radar), `loadElevationLookup` (Mapzen-Terrarium-DEM), `fetchMultiModelForecast`
(Modell-Spread), `iconEuSounding.fetchSoundingAtPoint` (Druckflächen), `gfsSounding`.

**Charting:** durchweg **handgerolltes SVG (+ Canvas-Heatmaps)** — keine Charting-Lib.
Vorbilder: `SkewTChart.tsx`, `SectionChart.tsx`, `PointForecastCharts.tsx`.

## Reusable vs New

| Baustein | Wiederverwenden | Neu für Atmosphäre |
|---|---|---|
| Tokens / `rt-*`-Shell / Card / Eyebrow | ✅ direkt | `.atm-*`-CSS + lokale Akzent-Var |
| Segmented Control (Linsen-Umschalter) | ✅ Muster | `.atm-seg` (Fliegen/Berg&Weg/Himmel) |
| Range-Scrubber + Play-Loop + „jetzt"-Tick | ✅ Muster | geteilter `activeHour`-Store (P1) |
| `getPointForecast`, DEM, `buildCrossSection`, `sectionAtTime`, `crossSection` | ✅ direkt | dünner Säulen-Selektor falls nötig |
| `iconEuSounding` + `soundingMath` + `SkewTChart` | ✅ direkt | Vertikalprofil-Render (Meter/lineare Achse) |
| LLM: `engine`/`prompt`/`grounding`/`weatherFacts` | ✅ direkt | Atmosphäre-Grounding-Block + Verdict-Bezug |
| MapLibre Custom-Layer (`CurtainLayer`, `WindLayer`) | ✅ erweitern | Thermik-Overlay (P4), Isentropen-Ebene (P6b) |
| Hash-Codec-Muster (`threedState`) | ✅ Muster | `atmosphereState.ts` (`#atm=`) |

## Risks / Deviations (von den Prompt-Annahmen)

- **D1 — Rendering: MapLibre, nicht Three.js/WebGPU.** Der Prompt nimmt Three.js an.
  Die Leitplanken verbieten ein paralleles System → wir adoptieren MapLibre-Custom-
  Layer (wie `CurtainLayer`). P4/P6b werden entsprechend in MapLibre umgesetzt, kein
  Three.js. **Auflösbar, kein STOP.**
- **D2 — Keine nativen ICON-D2-Druckflächen (65 Levels).** Die bestehende ICON-D2-
  Pipeline lädt nur Oberflächenfelder. Echte Vertikalprofile liefern bestehende
  Pipelines via **ICON-EU-Sounding (7 km, 10 Druckflächen, +48 h)** + GFS-Fallback,
  ergänzt durch den abgeleiteten 3D-Schnitt (`crossSection`, heuristisch). Da die
  Daten aus **bestehenden Pipelines** stammen, ist das **kein Datenbedarf-Gate** —
  wir nutzen ICON-EU-Sounding als vertikale Quelle und kennzeichnen Auflösung/Alter
  ehrlich. Abweichung von „ICON-D2-Säulen" wird dokumentiert.
- **D3 — Kein Aerosol/Staub (CAMS/AOD/PM) in irgendeiner Pipeline.** → In P5 ist die
  Staub-Card ein **Entscheidungs-Gate**: ausblenden + STOP-Hinweis (per Prompt-Regel).
- **D4 — Kein expliziter Cross-Barrier-Stationsdruck.** Föhn ist heuristisch
  (`foehnDetector.ts`/`dynamics.ts`) + ICON-EU-`PS`. In P6a ggf. auf ICON-ableitbare
  Föhn-Indikatoren reduzieren (Gate-Regel), keine neue Stationsquelle.
- **R1 — Kein globaler State/Store.** P1 muss einen geteilten `activeHour`-Store/
  Context bauen (eine Quelle der Wahrheit für den Scrubber).
- **R2 — Breakpoints uneinheitlich.** Layout-Schematik auf bestehende Query-Stufen mappen.
