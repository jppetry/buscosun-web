# wetterkarte-desktop-spec.md — Verbindliche Umsetzungs-Spezifikation: Desktop-Redesign der 2D-Wetterkarte

**Status:** Bindend. Diese Datei ist die maßgebliche Vorgabe für Phase D1 (Gate GD1). Die Kurzfassung in `plan.md`/`prompt.md` verweist hierauf.

**Visuelle Referenz:** `audit/mockups/wetterkarte-desktop.html` (statisches Mockup, 1440×860, echte Brand-Tokens + IBM Plex Mono für Instrument-Ziffern). Das Mockup zeigt das Ziel; diese Spec bindet es an den echten Code.

**Grundprinzip:** *Informationsarchitektur ändern, Marke und Funktion erhalten.* Kein Layer, keine Funktion, kein Datenpfad wird entfernt. Die sechs heute frei über der Karte schwebenden Steuer-Cluster werden in **drei bewusste Zonen** zusammengeführt. Das Brand-Token-System (Sand/Cream/Ink + Terracotta/Steel/Sage) bleibt 1:1.

---

## §0 Sicherheits-Rahmen (aus CLAUDE.md, gilt unverändert)

- **KEINE** Änderungen an Shadern, der WebGL-Pipeline, `WindLayer.ts`, dem RGBA8-Packing-Pfad. Kein Verlass auf `EXT_color_buffer_float`, explizite `highp` bleiben.
- **KEINE** Änderungen an der Fusion-Engine (`src/fusion/**`). Der Fusion⇄Native-Toggle wird nur *verschoben/umgruppiert*, nie in seiner Logik angefasst.
- **KEINE** entfernten oder versteckten Funktionen. Umgruppieren in die drei Zonen ist erlaubt; Weglassen nicht.
- **STOPP & FRAGEN** vor allem Irreversiblen, vor Datenpfad-/Fusion-Eingriffen, vor Abhängigkeits-Upgrades.
- **Achsen-Inversion ggü. den bisherigen Phasen:** Bisher war Desktop eingefroren und Mobile wurde geändert. **Jetzt ist es umgekehrt:** Desktop wird redesignt, die **Mobile-Ansicht (`@media (max-width:767px)` bzw. `max-height:430px` landscape) bleibt pixel- und funktionsgleich** und ist die neue „nicht regredieren"-Seite. Die Phase-1-C-Mobilarbeit (persistentes Bottom-Sheet, Segment-Switcher, Snap-Zustände) darf nicht beschädigt werden.

---

## §1 Ist-Code-Mapping (was heute wo rendert — vor jeder Code-Änderung verifizieren)

Alle Anker in `src/MapView.tsx` (Render-Block ~2439–2917) und `src/MapView.css` (Desktop 1–~1400, Mobile-Block danach), Stand der Diagnose. **Zeilennummern vor dem Umbau erneut prüfen** — sie driften.

| # | Cluster (heute) | JSX-Anker `MapView.tsx` | Container-Klasse | Ziel-Zone |
|---|---|---|---|---|
| a | 12 Layer-Toggles | ~2462 ff., aus `LAYER_OPTIONS` (208–221) | `.layer-switch` / `.left-rails` | **A** (links) |
| b | Modell-Switcher (Desktop) | ~2468–2475 `variant="rail"` | `ModelSwitcher` `src/map/ModelSwitcher.tsx` | **A** (links, unten) |
| c | Wind-Feinsteuerung | ~2556–2621 | `.wind-particle-switch` | **A** (inline unter aktivem Wind-Layer) |
| d | Satellit-Produktwahl | ~2494–2508 | `.sat-product-switch` | **A** (inline unter aktivem Sat-Layer) |
| e | Legenden (4 Blöcke) | ~2515–2553 | `.map-legends` (confidence/snowline/flownowcast/poprob) | **B** (Ribbon-Legendenstreifen) |
| f | Vorhersage-Slider / Timeline | ~2642–2694, State `forecastHour` (330), RAF-Coalescing (335–350) | `.forecast-slider` | **B** (Ribbon-Zeitachse) |
| g | Daten-/Quellen-Badge | ~2623–2640 | `.data-badge` | **A**-Fuß + **B** (Quellenzeile) |
| h | Topbar (Marke/Ort/Zurück) | ~2441–2461 | `.map-topbar` | **Top** (bleibt weitgehend) |
| i | Punkt-Vorhersage (PFC) | ~2699–2707, Bedingung `!embedded && !overview && !isMobileMap` | `PointForecastPanel` `src/pointForecast/PointForecastPanel.tsx` | **C** (rechts) |

**Farbskalen (Single Source of Truth für die neue Ribbon-Legende):**
- Temperatur-Rampe: `src/scalar/ScalarLayer.ts` ~317–331 (12 Stops).
- Niederschlags-Rampe: `src/scalar/RainLayer.ts` ~303–315 (11 Stops, 0–20 mm/h).
- Wolken-Rampe: `src/scalar/RainLayer.ts` ~329–336.
- Layer-Chip-Punktfarben: `LAYER_CHIP_DOT` `MapView.tsx` ~242–255.

---

## §2 Ziel-Architektur: drei Zonen

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOP (schlank): Marke · Ortssuche ······················· Zoom + / −   │
│ ┌───────────────┐                                    ┌──────────────┐ │
│ │  ZONE A       │                                    │  ZONE C      │ │
│ │  Ebenen &     │            K A R T E               │  Punkt-      │ │
│ │  Modell       │        (vollflächig)               │  Dossier     │ │
│ │  ~276px       │                                    │  ~344px      │ │
│ │               │                                    │              │ │
│ │  [Layer]      │                                    │  18°  …      │ │
│ │  [aktiv→Regler]│                                   │  Tabs        │ │
│ │  [Modell]     │        ┌── ZONE B ──────────┐      │  Warnung     │ │
│ └───────────────┘        │ Instrument-Ribbon  │      └──────────────┘ │
│  [Quellen-Badge]         │ Trend·Zeit·Legende │                       │
│                          └────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
```

Alle drei Zonen sind Glass-Surfaces (`--surface-glass`, `backdrop-filter: blur(6px)`, `--border-default`, `--shadow-float`) über der vollflächigen Karte (`inset:0`).

---

## §3 Zone A — Panel „Ebenen & Modell" (links, ~276px)

**Container:** neue Klasse `.wx-panel` (nur Desktop). Ersetzt das visuelle Layout von `.left-rails`/`.layer-switch`, **behält aber deren gesamte Funktion**.

**Kopf:** Titel „EBENEN & MODELL" + Zähler aktiver Layer (`n aktiv`).

**Layer-Liste (alle 12, gruppiert):** Reihenfolge & Labels exakt aus `LAYER_OPTIONS`. Gruppierung ausschließlich visuell (Überschriften-Zeilen), keine Funktionsänderung:
- **Wind:** wind (Wind), gust (Böen)
- **Niederschlag & Radar:** nowcast (Niederschlag), flownowcast (Flow-Nowcast), poprob (Regen-Chance)  — Radar-Toggle bleibt im Modell-Block (§8-Semantik), nicht duplizieren.
- **Temperatur & Luft:** temp (Temperatur), snowline (Schneegrenze)
- **Beobachtung:** clouds (Wolken), sat (Satellit), lightning (Blitze), stations (Stationen)
- **Vertrauen:** confidence (Sicherheit)

Jede Zeile: Chip-Punkt in `LAYER_CHIP_DOT`-Farbe · Label · optionaler Meta-Text rechts (z. B. Sat „Meteosat", Blitze „60 min"). Aktiver Zustand = kräftigerer Hintergrund/Border. Toggle-Verhalten unverändert (gleiche Handler wie heute `.layer-switch`).

**Inline-Regler des aktiven Layers** (ersetzt die schwebenden `.wind-particle-switch`/`.sat-product-switch`): Wenn ein Layer aktiv ist, klappt **direkt unter seiner Zeile** sein Steuerblock auf:
- **Temperatur/Scalar:** Höhen-Segment (10m · 850 · 700 · 500) + horizontale Farbskala-Vorschau. (Falls der Ist-Code keine Höhenwahl für temp hat, nur die vorhandenen Regler zeigen — nichts erfinden; Diagnose entscheidet.)
- **Wind:** die **komplette** heutige Wind-Feinsteuerung (Aus/Normal/Intensiv, Dichte, ggf. Höhe) 1:1 aus `.wind-particle-switch` — nur umplatziert.
- **Satellit:** die **komplette** `.sat-product-switch`-Produktwahl.

**Modell-Block (unten):** `ModelSwitcher` weiterverwenden. Prüfen, ob `variant="rail"` optisch in die neue Panel-Breite passt; falls nötig eine **neue** `variant="panel"` einführen (additiv, `variant='rail'|'sheet'|'panel'`), **ohne** die Sheet-Variante der Mobilansicht zu verändern. Enthält unverändert: DE/AT/CH-Tabs, Native/Fusion-Toggle, Modellkatalog-Disclosure, Radar-Toggle, Attributionszeilen.

**Panel-Fuß:** kompakte Quellenzeile aus `.data-badge` (Land · Modell · Stand HH:MM). Der vollständige Badge-Inhalt darf zusätzlich als eigenständige `.data-badge`-Kapsel unten links erhalten bleiben (siehe Mockup: „DE · ICON-D2 …").

---

## §4 Zone B — „Instrument-Ribbon" (unten zentriert, Signatur-Element)

**Container:** neue Klasse `.wx-ribbon`. Zentriert über der Kartenunterkante, Breite ~660px (fluid, max). Drei gestapelte Streifen:

1. **Trend-Sparkline am aktiven Punkt:** kleine SVG-Kurve des aktiven Skalars über den Vorhersagezeitraum am gewählten Kartenpunkt, mit Min/Max-Markern. Datenquelle = derselbe Punkt-Forecast, der Zone C speist (kein neuer Fetch — an bestehende PFC-Daten andocken). Wenn kein Punkt gewählt: leerer/ruhender Zustand.
2. **Zeitachse:** die heutige Vorhersage-Timeline. **`forecastHour`-State, `scheduleForecastHour()` und das RAF-Coalescing (MapView.tsx 335–350) bleiben unverändert** — nur die visuelle Hülle wird der Ribbon-Optik angepasst (Ink-Play-Button, Terracotta-Füllstand, Tick-Beschriftung jetzt→+27h, Tagesmarken, „jetzt"-Reset). Der `<input type="range">`-Kern bleibt für Tastatur/A11y erhalten.
3. **Live-Legende des aktiven Layers:** die **dauerhaft sichtbare** Farbskala. Das ist die zentrale Neuerung — „welche Farbe = welcher Wert" ist nicht mehr im Hover versteckt. Gradient + Einheiten + Min/Max aus der jeweiligen Rampe (§7). Cursor-Bubble zeigt live den Wert am gehovten/gewählten Kartenpunkt.

Die vier heutigen `.map-legends`-Blöcke (confidence/snowline/flownowcast/poprob) wandern hierher: bei aktivem Spezial-Layer zeigt der Legendenstreifen dessen Legende statt (oder zusätzlich zu) der Skalar-Rampe. **Kein Legenden-Inhalt geht verloren.**

**Quellenzeile:** kompakte Attribution (Modell · Stand) am Ribbon-Fuß, gespeist aus denselben Daten wie `.data-badge`.

---

## §5 Zone C — „Punkt-Dossier" (rechts, ~344px)

**Container:** `PointForecastPanel` weiterverwenden, in eine neue rechte Dock-Hülle `.wx-dossier` gesetzt. **Keine Änderung an der PFC-Logik/den Sub-Tabs.**

Erhält unverändert: Ortsname + LIVE-Indikator + Aktualisierungszeit + Höhe, große aktuelle Temperatur, Gefühlt/H/T/Taupunkt, Vitals-Grid (Wind/Regen/Wolken), Vertrauensbalken, **Sub-Tabs Übersicht/Diagramme/Tabelle** (State `view: overview|charts|table`), Warn-Alerts (z. B. Windwarnung).

**Mount-Bedingung** wie heute (`!embedded && !overview && !isMobileMap`). Wenn kein Punkt gewählt: ruhender/leerer Zustand oder Aufforderung „Punkt auf der Karte wählen" — **nicht** die Funktion entfernen.

---

## §6 Top-Kontext (schlank)

`.map-topbar` bleibt funktional: Marke/Zurück, Ortssuche, Zoom +/−. Nur optisch an die neue Sprache angleichen (Glass-Kapseln, siehe Mockup). Keine neue Suchfunktion erfinden — nur die vorhandene stylen.

---

## §7 Legenden-Datenmodell (persistente Ribbon-Legende)

Single Source of Truth = die vorhandenen Rampen. Kein Hardcoding neuer Farben, wenn eine Rampe existiert:
- **temp** → `ScalarLayer.ts`-Rampe, Einheit °C, Min/Max aus den Stops.
- **nowcast/poprob** → `RainLayer.ts`-Niederschlagsrampe, Einheit mm/h bzw. %.
- **clouds** → `RainLayer.ts`-Wolkenrampe, Einheit %.
- **wind/gust** → falls eine Rampe existiert, diese; sonst die im Mockup genutzte Wind-Gradient-Definition als benannte Konstante zentral anlegen (mit Kommentar, dass sie die Legende speist, nicht den Shader).
- **confidence/snowline/flownowcast/sat/lightning/stations** → bestehende `.map-legends`-Inhalte bzw. kategoriale Legende; keine kontinuierliche Rampe erfinden.

Empfehlung: eine kleine Registry `legendForLayer(activeLayer) → { gradientCss, unit, min, max, kind }` an einer Stelle, die sowohl Ribbon-Legende als auch die Inline-Skala-Vorschau in Zone A speist.

---

## §8 Motion & Interaktion

- Panel-/Dossier-Ein-/Ausblenden und Layer-Inline-Aufklappen über `transform`/`opacity`, nicht über `height`/`max-height` (CLS ≈ 0). `prefers-reduced-motion` respektieren.
- Karte bleibt jederzeit voll bedienbar (Pan/Zoom); die Zonen dürfen die Karten-Gesten nicht blockieren (`pointer-events` gezielt).
- Keine neue Dauer-Repaint-Schleife einführen. Die Trend-Sparkline und Live-Legende aktualisieren nur bei Dat/Hover-Änderung, nicht pro Frame.

---

## §9 CSS-Strategie

- Neue Desktop-Zonen als **neue Klassen** (`.wx-panel`, `.wx-ribbon`, `.wx-dossier`) im **Desktop-Bereich** von `MapView.css`. Bevorzugt in einem klar markierten Block `/* === Desktop-Redesign D1 === */`.
- Die alten Cluster-Klassen (`.left-rails`, `.layer-switch`, `.wind-particle-switch`, `.sat-product-switch`, `.forecast-slider`, `.map-legends`, `.data-badge`) werden **nicht gelöscht, solange die Mobile-Media-Query sie nutzt.** Zuerst prüfen, welche davon der Mobile-Block referenziert; nur eindeutig desktop-tote Regeln entfernen.
- **Der Mobile-Block (`@media (max-width:767px)` / landscape) bleibt unangetastet.** Jede neue Desktop-Regel muss so gescopet sein, dass sie unter 768px nicht greift (z. B. in einer `@media (min-width:768px)`-Klammer oder durch Klassen, die mobil nicht gerendert werden).
- Design-Tokens aus `src/designTokens.css` verwenden, **keine** neuen Hex-Werte hardcoden, außer für die Legenden-Gradienten (die spiegeln die Daten-Rampen).

---

## §10 Preservation-Contract (jede Desktop-Funktion muss erhalten bleiben)

Vor Gate GD1 Funktion für Funktion einzeln auslösen und belegen:

1. Alle **12 Layer** einzeln an-/abschaltbar (Toggle-Verhalten wie vorher).
2. **Wind-Feinsteuerung** vollständig (Aus/Normal/Intensiv, Dichte, ggf. Höhe).
3. **Satellit-Produktwahl** vollständig.
4. **Modell-Switcher:** DE/AT/CH-Wechsel, Native/Fusion-Toggle, Modellkatalog-Disclosure, Radar-Toggle, Attribution.
5. **Vorhersage-Timeline:** ganzer Bereich scrubbar, Tastatur-Bedienung, Play/Reset; `forecastHour` treibt alle Layer korrekt.
6. **Legenden:** alle heutigen Legenden-Inhalte (confidence/snowline/flownowcast/poprob **plus** die neue persistente Skalar-Legende) erreichbar/lesbar.
7. **Punkt-Vorhersage (PFC):** alle Sub-Tabs (Übersicht/Diagramme/Tabelle), Warnungen, Vitals — kein Informationsverlust ggü. heute.
8. **Daten-/Quellen-Badge:** Land, aktive Layer, Stand-Zeit, Modell-Attribution sichtbar.
9. **Ortssuche + Zoom** funktionsfähig.
10. **Windpartikel** rendern unverändert (kein Shader-/WindLayer-Eingriff).
11. **Mobile-Ansicht** (≤767px + Landscape): pixel- und funktionsgleich zu vorher — Phase-1-C-Sheet intakt.
12. Keine neuen Konsolen-Errors/Warnings.

---

## §11 frontend-design-Skill verwenden (ausdrückliche Auflage)

Die CLI-Session ruft **vor** der visuellen Umsetzung die `frontend-design`-Skill auf und arbeitet nach deren Leitlinien:
- Das **Signatur-Element ist die Instrument-Ribbon** — dort Sorgfalt/Boldness konzentrieren, die restlichen Zonen ruhig und diszipliniert halten.
- Die **Marke bleibt der Brief:** Sand/Cream/Ink + Terracotta/Steel/Sage, IBM Plex Mono für Instrument-/Datenziffern, System-Sans für UI. Keine der KI-Default-Optiken; das bestehende Token-System gewinnt.
- Screenshots zur Selbstkritik nutzen (Chrome DevTools MCP), Zone für Zone gegen `wetterkarte-desktop.html` prüfen.
- Responsive-Untergrenze & A11y wahren: sichtbarer Tastatur-Fokus, `prefers-reduced-motion`, ausreichende Kontraste.

---

## §12 Verifikation (Belege für Gate GD1)

Chrome DevTools MCP, Desktop-Profil (mind. 1440×900; zusätzlich 1280×800 und 1680×1050 Stichprobe):
1. Preservation-Contract §10 Punkt für Punkt mit Beleg (Screenshot/Skript/Konsole).
2. **Mobile-Regression:** 390×844 (DPR 3) — Screenshot-Diff gegen Phase-1-C-Nachher-Baseline, muss identisch sein; Sheet/Segmente/Snap funktionieren.
3. Performance-Trace Desktop: Layer-Wechsel, Timeline-Scrubbing über den ganzen Bereich, Punktwahl — **kein Long Task > 200 ms**, keine neue Dauer-Repaint-Schleife (Repaints/s im Leerlauf nicht höher als vorher).
4. Vorher/Nachher-Screenshots Desktop aller drei Zonen unter `audit/screenshots/wetterkarte-desktop/`.
5. Konsole frei von neuen Errors/Warnings.
6. Selbstverifikations-Fragen aus CLAUDE.md schriftlich in `audit/wetterkarte-desktop.md` beantworten.

---

## §13 Umsetzungs-Reihenfolge (empfohlen, kleine Commits)

1. **Diagnose** → `audit/wetterkarte-desktop.md`: Ist-Mapping §1 gegen echten Code verifizieren (Zeilen aktualisieren), Preservation-Punkte im Ist-Zustand einmal durchklicken/belegen. *Kein Code vorher.*
2. **Gerüst:** neue Zonen-Container `.wx-panel`/`.wx-ribbon`/`.wx-dossier` additiv rendern (leere/portierte Hüllen), hinter einem Desktop-Scope; Mobile unberührt.
3. **Zone A:** Layer-Liste (gruppiert) + Inline-Regler (Wind/Sat) + ModelSwitcher (ggf. `variant="panel"`) + Quellen-Fuß umziehen. Alte schwebende Cluster erst entfernen, wenn die neuen die Funktion tragen.
4. **Zone C:** PFC in `.wx-dossier` docken.
5. **Zone B (Signatur, zuletzt & am sorgfältigsten):** Zeitachse (State unverändert) → persistente Legende (§7-Registry) → Trend-Sparkline (an PFC-Daten).
6. **Top-Kontext** angleichen.
7. **CSS-Aufräumung** (§9) — nur eindeutig desktop-tote Regeln.
8. **Verifikation** §12, Gate GD1 in `checklist.md`, Session-Log in `context.md`.

Commits: Conventional Commits, Scope `wetterkarte`. Doku Deutsch, Code/Kommentare/Commits Englisch.
