# plan.md — Phasenplan: Mobile-Optimierung buscosun

Jede Phase folgt dem Zyklus **Diagnose → Plan → Implement → Verify → Gate** (siehe CLAUDE.md). Die Maßnahmenlisten unten sind Hypothesen aus dem Vorwissen — die verbindliche Maßnahmenliste entsteht erst aus der jeweiligen Diagnose und wird hier pro Phase nachgetragen.

---

## Phase 0 — Fundament & Baseline (Gate G0)

**Ziel:** Gemeinsame Grundlagen schaffen, bevor das erste Feature angefasst wird.

1. Chrome DevTools MCP verifizieren: iPhone-12-Pro-Emulation (390×844, DPR 3, Touch, mobiler UA) funktionsfähig; Test-Screenshot der Startseite.
2. Bestandsaufnahme Breakpoints: Welche Media Queries / Breakpoint-Konstanten existieren im Projekt? Konvention festlegen und in CLAUDE.md-Abschnitt "Harte Regeln" bestätigen oder korrigieren.
3. Viewport-Meta prüfen: `viewport-fit=cover`, korrektes `initial-scale`, kein `user-scalable=no`.
4. **Baseline-Screenshots aller 8 Feature-Seiten** im iPhone-12-Pro-Viewport → `audit/screenshots/baseline/`. Zusätzlich Desktop-Screenshots (1440×900) als Regressions-Referenz.
5. Geteilte Mobile-Primitives anlegen (nur Gerüst, Feinschliff in Phase 1):
   - `<BottomSheet>` (snappend: collapsed/half/full, Griffleiste, Scroll-Isolation)
   - `<MobileToolbar>` / Floating-Control-Stack
   - Safe-Area-Utility (CSS-Custom-Properties oder Hook)
   - `useIsMobile()` bzw. bestehenden Mechanismus identifizieren und wiederverwenden
6. Konsolen-Baseline: bestehende Warnings/Errors pro Seite dokumentieren, damit später "neu" von "vorbestehend" unterscheidbar ist.

**Gate G0:** Emulation läuft, Baselines liegen vollständig vor, Primitives kompilieren und sind per Storybook/Testroute sichtbar, keine Änderung am Produktions-Layout.

---

## Phase 1 — Wetterkarte (Gate G1)

**Diagnose-Ergebnis (siehe `audit/wetterkarte.md`):** Die Hypothese unten war überholt — MapView hat bereits ein vollwertiges mobiles Bottom-Sheet/FAB-System (Layer, Modell-Switcher, Punkt-Forecast). Tatsächliche Lücken: (1) 23 Touch-Targets < 44 px im Sheet/Modell-Switcher/Slider, (2) `.map-sheet` ist kein echtes Snap-Sheet — fix auf ~86vh mit blockierendem Vollflächen-Scrim, Karte dahinter nicht erreichbar, (3) Landscape 844×390 lädt die Desktop-Rail-Stapelung (Breite>767px) trotz nur 390px Höhe → sichtbarer Overlap-Bug.

**Umgesetzte Maßnahmen:**
1. Touch-Targets auf ≥44×44 px: Länder-Tabs, „Modellquelle wählen"-Disclosure, Regenradar-Toggle, Sheet-Close, Chevron-Buttons, Forecast-Slider-Trefferfläche — alle Änderungen scope-isoliert auf `.ms-sheet`/`.map-sheet-*`-Klassen (nur im mobilen Sheet gerendert, keine Desktop-Auswirkung).
2. Snap-Sheet mit zwei Zuständen **half (45vh, Default) / full (86vh)** statt der Referenz-3-Stufen — der dritte Zustand „collapsed" wird bewusst durch den bereits vorhandenen, klar beschrifteten Layer-FAB abgedeckt (dokumentierte Abweichung von der Guideline-Vorlage, siehe `mobile-design-guidelines.md`-Präambel). Karte bleibt im half-Zustand sichtbar/bedienbar (Scrim transparent + inert).
3. Landscape-Fix: mobile Media-Queries um `(max-height: 430px) and (orientation: landscape)` ergänzt, damit kurze Querformat-Viewports (z. B. 844×390) dieselbe FAB-/Sheet-Darstellung wie Hochformat-Mobile bekommen statt der überlappenden Desktop-Rail-Stapelung.
4. Explizit nicht umgesetzt: keine neuen Zoom-/Standort-/Nordungs-Controls (kein Desktop-Äquivalent vorhanden → wäre neues Feature, nicht Funktionserhalt); kein Eingriff in Wind-Shader/Fusion-Engine.

**Verify:** tests.md → Protokoll V-ALL + V-WETTERKARTE.
**Gate G1:** Alle Layer schaltbar, Model-Switcher & Fusion-Toggle voll funktionsfähig, Karte flüssig bedienbar, Desktop unverändert.

**Follow-up 2026-07-08 (nach G1, siehe `audit/wetterkarte.md` §8):** Jan möchte statt des kombinierten FAB/Sheets zwei getrennte, klar sichtbare Buttons (Layer / Modell) und die Karte fest auf die oberen 2/3 des Viewports begrenzt (unteres Drittel = blickdichtes Control-Dock statt transparentem Overlay über der Karte). Umsetzung ausschließlich innerhalb der bestehenden mobilen Media-Query, keine Änderung an Sheet-Snap-Mechanik/Touch-Targets/Fusion-Engine.

---

## Phase 2 — Regenradar (Gate G2)

**Diagnose-Fokus:** Timeline/Scrubber-Bedienung mit Daumen, Frame-Wechsel-Performance, Nowcast-Ladeverhalten auf simuliertem Mobilnetz.

**Erwartete Maßnahmen (Hypothese):**
- Scrubber: volle Breite, ≥ 44 px Griffhöhe, große Play/Pause, klare Zeitanzeige.
- Frame-Preloading gegen Ruckeln beim Scrubben prüfen.
- Steuerungen ins Bottom-Sheet-Pattern aus Phase 1 überführen.

**Verify:** V-ALL + V-REGENRADAR.
**Gate G2:** Scrubbing flüssig (kein Frame-Drop-Stottern im Trace), alle Zeitschritte erreichbar, Animation steuerbar.

---

## Phase 3 — Vorhersage (Gate G3)

**Diagnose-Fokus:** Datenpanels, Modellvergleich, Konfidenz-Darstellung auf 390 px; Chart-Interaktion ohne Hover.

**Erwartete Maßnahmen (Hypothese):**
- Mehrspaltige Panels → vertikaler Stapel bzw. Tab-Struktur.
- Charts: Tap-Details statt Hover-Tooltips; Zeitraum-Chips statt Pinch, falls Konflikt mit Scroll.
- Modellvergleich: Karten-Stapel oder horizontal scrollbare Vergleichsspalten mit fixierter Parameterspalte.

**Verify:** V-ALL + V-VORHERSAGE.
**Gate G3:** Alle Parameter, Modelle und Konfidenzinfos erreichbar; kein horizontales Seiten-Scrollen; Chart-Details per Tap.

---

## Phase 4 — Tourenplanung (Gate G4)

**Diagnose-Fokus:** GPX-Upload auf iOS (Datei-Picker-Verhalten), Karte + Ergebnispanel gleichzeitig, Abfahrtszeit-Optimierer-Bedienung.

**Erwartete Maßnahmen (Hypothese):**
- Zweispalt-Layout (Karte | Panel) → Karte oben + Bottom Sheet mit Tour-Details/Optimierer.
- Upload-Button prominent, ≥ 44 px, `accept=".gpx"` und iOS-Files-App-Kompatibilität verifizieren.
- Abfahrtszeit-Optimierer: Slider/Zeitwahl daumentauglich.
- Wegpunkt-/Segmentliste als scrollbare Sheet-Sektion.

**Verify:** V-ALL + V-TOURENPLANUNG.
**Gate G4:** GPX-Upload funktioniert (Emulation + Hinweis für Real-iOS-Check durch Jan), komplette Tour-Analyse ohne Funktionsverlust bedienbar.

---

## Phase 5 — Event-Planung (Gate G5)

**Diagnose-Fokus:** Formulareingaben (Ort, Datum/Zeitraum), Ergebnisdarstellung Best-Day-Ranking.

**Erwartete Maßnahmen (Hypothese):**
- Formularfelder: `font-size ≥ 16px`, passende `inputmode`, native Date-Picker nutzen.
- Ergebnisliste als Karten-Stapel mit klarer Best-Day-Hervorhebung.
- Mehrschritt-Eingabe ggf. als vertikaler Flow statt Nebeneinander.

**Verify:** V-ALL + V-EVENT.
**Gate G5:** Kompletter Flow Eingabe → Ergebnis auf 390 px ohne Zoom-Zwang durchführbar.

---

## Phase 6 — Historie (Gate G6)

**Diagnose-Fokus:** Lange Zeitreihen-Charts, Zeitraumauswahl, Vergleichsansichten.

**Erwartete Maßnahmen (Hypothese):**
- Charts auf volle Breite, Höhe angepasst; Achsenbeschriftung mobil lesbar.
- Zeitraum-Navigation über Chips/Segmente statt Drag-Zoom, falls Gestenkonflikt.
- Statistik-Kacheln einspaltig oder 2er-Grid.

**Verify:** V-ALL + V-HISTORIE.
**Gate G6:** Alle Zeiträume und Vergleiche erreichbar, Charts lesbar und per Tap explorierbar.

---

## Phase 7 — Atmosphäre (Gate G7)

**Diagnose-Fokus:** Linsen-Wechsel (Fliegen / Berg & Weg / Himmel), drei Progressive-Disclosure-Tiefen auf Touch.

**Erwartete Maßnahmen (Hypothese):**
- Linsen als sticky segmentierte Kontrolle / Chip-Reihe.
- Disclosure-Tiefen als vertikale Expansion oder Sheet-Stufen; alle drei Tiefen erreichbar.
- Inhaltliche Dichte pro Tiefe unverändert — nur Anordnung mobilisiert.

**Verify:** V-ALL + V-ATMOSPHAERE.
**Gate G7:** Alle drei Linsen × alle drei Tiefen vollständig per Touch erreichbar, Wechsel ohne Layout-Sprünge.

---

## Phase 8 — 3D Globus (Gate G8)

**Diagnose-Fokus:** Touch-Orbit-Controls, GPU-Last/Speicher auf Mobile, Quality-Tier-Verhalten, volumetrische Wolken.

**Erwartete Maßnahmen (Hypothese):**
- Touch-Gesten: Ein-Finger-Orbit, Zwei-Finger-Zoom/Pan sauber gemappt; kein Konflikt mit Seiten-Scroll (Canvas `touch-action: none` prüfen).
- Mobile-Default-Quality über AdaptiveQualityController (Ray-March-Steps, Render-Scale) — nur Konfiguration, keine Shader-Änderung.
- Pixel-Ratio-Handling auf DPR 3 gegen Controller-Logik abgleichen.
- UI-Overlays des Globus in Daumenzone / Bottom Sheet.
- **STOPP-Punkt:** Falls die Diagnose Shader-Änderungen nahelegt → anhalten, Befund dokumentieren, Jan fragen.

**Verify:** V-ALL + V-GLOBUS. Zwingend Hinweis auf Real-Device-Stichprobe (Emulator-GPU nicht repräsentativ).
**Gate G8:** Globus auf Mobile bedienbar und stabil im Trace; Desktop-Rendering unverändert.

---

## Phase 9 — Gesamtregression & Abschluss (Gate G9)

1. Alle 8 Features nochmals im iPhone-12-Pro-Viewport durchklicken (Kurzprotokoll V-ALL je Feature).
2. Desktop-Screenshot-Diff aller 8 Seiten gegen Phase-0-Baseline → keine Abweichungen.
3. Konsolen-Abgleich gegen Phase-0-Baseline → keine neuen Errors/Warnings.
4. Cross-Viewport-Stichprobe: 360×800 (kleines Android) und 430×932 (iPhone Pro Max) — Layout darf nicht brechen.
5. Abschlussbericht in `context.md` (Session-Log): Was wurde geändert, offene Punkte, empfohlene Real-Device-Tests für Jan (iPhone Safari!).

**Gate G9 = Session abgeschlossen.**
