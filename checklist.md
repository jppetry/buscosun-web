# checklist.md — Gates & Fortschritt

Regel: Ein Kästchen wird nur mit Beleg abgehakt (Screenshot-Pfad, Trace-Datei oder Konsolen-Auszug in `audit/` referenzieren). Nächste Phase erst nach vollständigem Gate.

## Phase 0 — Fundament (G0)
- [x] Chrome DevTools MCP: iPhone-12-Pro-Emulation (390×844, DPR 3, Touch) verifiziert — `audit/screenshots/baseline/emulation-test-searchpage-mobile.png`, Details in `audit/phase0-fundament.md` §2
- [x] Breakpoint-Bestandsaufnahme dokumentiert, Konvention festgelegt (`max-width:767px` mobil / 768–1024px Tablet / >1024px Desktop) — `audit/phase0-fundament.md` §3
- [x] Viewport-Meta geprüft (`viewport-fit=cover`, kein `user-scalable=no`) — Befund: `viewport-fit=cover` fehlte, ergänzt in `index.html`; `audit/phase0-fundament.md` §4
- [x] Baseline-Screenshots mobil: alle 8 Seiten in `audit/screenshots/baseline/<feature>/mobile.png`
- [x] Baseline-Screenshots Desktop (1440×900): alle 8 Seiten in `audit/screenshots/baseline/<feature>/desktop.png`
- [x] Konsolen-Baseline pro Seite dokumentiert — `audit/phase0-fundament.md` §6 (vorbestehendes a11y-Issue auf 6/8 Seiten dokumentiert, keine Errors)
- [x] BottomSheet-, MobileToolbar-, Safe-Area-Primitives angelegt und sichtbar testbar — `src/mobile/*`, Testroute `#mobiletest`, Screenshots `mobile-primitives-test*.png`
- [x] Kein Eingriff ins Produktions-Layout erfolgt — nur additive Dateien/Route, `npm run typecheck` grün; `audit/phase0-fundament.md` §8

## Phase 1 — Wetterkarte (G1)
- [x] Diagnose in `audit/wetterkarte.md` abgeschlossen (vor jeder Code-Änderung)
- [x] Alle Layer auf Mobile schaltbar — 12/12 per Skript verifiziert, `audit/wetterkarte.md` §5 Punkt 6
- [x] Model-Switcher DE/AT/CH voll funktionsfähig — unverändert funktional, Touch-Targets vergrößert
- [x] Fusion⇄Native-Toggle voll funktionsfähig (inkl. Fallback-Verhalten) — nicht angefasst, `ms-offline`-Fallback intakt
- [x] Legenden erreichbar und lesbar — unverändert (conditional `.map-legends`, kein Eingriff)
- [x] Windpartikel: konservativer Quality-Tier auf Mobile aktiv, keine Shader-Änderung — WindLayer/Shader nicht berührt
- [x] Gesten: Karte vs. Sheet/Controls konfliktfrei — Sheet jetzt mit half/full-Snap, Karte im half-Zustand interaktiv (Scrim `pointer-events:none`)
- [x] Touch-Targets ≥ 44 px (Audit-Liste) — 23→4 begründete Ausnahmen (Footer-Attribution), `audit/wetterkarte.md` §3.1/§5
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — `audit/wetterkarte.md` §6
- [x] Desktop-Screenshot-Diff: unverändert — `verify-desktop-after.png` vs. Baseline
- [x] Vorher/Nachher-Screenshots abgelegt — `audit/screenshots/wetterkarte/`
- [x] Zusatzfund behoben: Landscape 844×390 Overlap-Bug (nicht in ursprünglicher Checkliste, aus V-ALL Schritt 9 aufgedeckt), `audit/wetterkarte.md` §3.3/§4.3
- [x] Follow-up (2026-07-08, nach G1): Getrennte Layer-/Modell-FABs statt kombiniertem FAB + Karte fest auf obere 2/3 des Viewports begrenzt (Control-Dock im unteren Drittel) — `audit/wetterkarte.md` §8, Desktop/Landscape-Regression erneut geprüft (grün)

## Phase 2 — Regenradar (G2)
- [ ] Diagnose in `audit/regenradar.md` abgeschlossen
- [ ] Scrubber daumentauglich (≥ 44 px, volle Breite)
- [ ] Alle Zeitschritte erreichbar, Play/Pause funktioniert
- [ ] Scrubbing ohne Stottern (Performance-Trace als Beleg)
- [ ] Touch-Targets ≥ 44 px
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 3 — Vorhersage (G3)
- [ ] Diagnose in `audit/vorhersage.md` abgeschlossen
- [ ] Alle Parameter/Panels ohne horizontales Seiten-Scrollen erreichbar
- [ ] Modellvergleich vollständig nutzbar
- [ ] Konfidenz-Anzeigen erhalten und lesbar
- [ ] Chart-Details per Tap (keine Hover-Only-Infos)
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 4 — Tourenplanung (G4)
- [ ] Diagnose in `audit/tourenplanung.md` abgeschlossen
- [ ] GPX-Upload in Emulation funktionsfähig; Real-iOS-Check als TODO an Jan notiert
- [ ] Karte + Tour-Details gleichzeitig nutzbar (Sheet-Pattern)
- [ ] Abfahrtszeit-Optimierer voll bedienbar
- [ ] Wegpunkt-/Segmentinfos vollständig erreichbar
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 5 — Event-Planung (G5)
- [ ] Diagnose in `audit/event.md` abgeschlossen
- [ ] Formulare ohne iOS-Auto-Zoom (font-size ≥ 16 px) und mit passenden inputmodes
- [ ] Kompletter Flow Eingabe → Best-Day-Ergebnis durchführbar
- [ ] Ergebnisdarstellung vollständig (kein Informationsverlust ggü. Desktop)
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 6 — Historie (G6)
- [ ] Diagnose in `audit/historie.md` abgeschlossen
- [ ] Alle Zeiträume/Vergleiche erreichbar
- [ ] Charts lesbar, Datenpunkte per Tap explorierbar
- [ ] Kein Gestenkonflikt Chart vs. Seiten-Scroll
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 7 — Atmosphäre (G7)
- [ ] Diagnose in `audit/atmosphaere.md` abgeschlossen
- [ ] Alle 3 Linsen × alle 3 Disclosure-Tiefen per Touch erreichbar
- [ ] Inhaltsumfang je Tiefe unverändert (Abgleich gegen Desktop)
- [ ] Linsen-Wechsel ohne Layout-Sprünge
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 8 — 3D Globus (G8)
- [ ] Diagnose in `audit/globus.md` abgeschlossen
- [ ] Touch-Orbit/Zoom funktioniert, kein Konflikt mit Seiten-Scroll
- [ ] Mobile-Quality-Default über AdaptiveQualityController (keine Shader-Änderung)
- [ ] Pixel-Ratio-Handling auf DPR 3 geprüft
- [ ] Kein neuer Konsolen-Error, kein WebGL-Context-Loss im Test
- [ ] Real-Device-Stichprobe als expliziter TODO für Jan notiert
- [ ] Selbstverifikation 1–5 beantwortet
- [ ] Desktop-Diff unverändert, Screenshots abgelegt

## Phase 9 — Gesamtregression (G9)
- [ ] Kurzprotokoll V-ALL für alle 8 Features grün
- [ ] Desktop-Diff aller 8 Seiten gegen Phase-0-Baseline: keine Abweichung
- [ ] Konsolen-Abgleich: keine neuen Errors/Warnings ggü. Baseline
- [ ] Stichprobe 360×800 und 430×932: Layout stabil
- [ ] Abschlussbericht im Session-Log (context.md) geschrieben
- [ ] Liste empfohlener Real-Device-Tests (iPhone Safari) an Jan übergeben
