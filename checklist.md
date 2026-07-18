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

## Phase 1-C — Wetterkarte Redesign „Variante C" (G1-C)
Maßgebliche Vorgabe: `audit/mockups/wetterkarte-c-spec.md`. Visuelle Referenz: `audit/mockups/wetterkarte-c-detail.html` (Zustände Z1–Z5) + `audit/mockups/wetterkarte-mobile.html` (A/B/C-Vergleich). Bewusste Abweichung vom §8-Follow-up (zwei getrennte FABs → ein Sheet mit Segment-Switcher Layer·Modell·Vorhersage), von Jan durch Wahl der Variante C freigegeben.
- [x] Diagnose in `audit/wetterkarte.md` gegen Spec abgeschlossen (Ist-Code-Mapping §1, vor jeder Code-Änderung) — `audit/wetterkarte.md` §9.1–§9.4 inkl. Diagnose-Fund: Wind-/Sat-Steuerung im Sheet war im Ist verdeckt gebrochen (§9.2.6)
- [x] Alle 13 Preservation-Punkte (Spec §12) einzeln geprüft und erhalten — §9.6 Punkt 3 + §9.7 Frage 1 (12/12 Layer-Toggles skriptverifiziert, Rest einzeln ausgelöst; Punkte 6+7 durch den Umbau sogar repariert)
- [x] Drei Snap-Zustände (`collapsed`/`half`/`full`) + Segment-Wechsel (`layer`/`model`/`fc`) funktionsfähig (Spec §2/§3) — §9.6 Punkt 9, Screenshots Z1–Z5
- [x] Layer-Segment: alle 12 Layer + Wind-Detailsteuerung (Aus/Normal/Intensiv, Dichte, Höhe) schaltbar (Spec §7) — §9.6 Punkt 3, `c-nachher-z3-full-wind.png`
- [x] Modell-Segment: DE/AT/CH + Native/Fusion + Katalog + Radar-Toggle voll funktionsfähig (Spec §8) — §9.6 Punkt 3, `c-nachher-z4-half-model.png`
- [x] Vorhersage-Segment: Punkt-Vorhersage (PFC) vollständig integriert, kein Informationsverlust ggü. Desktop (Spec §9, preservation-kritisch) — Wrapper-Umzug, Sub-Tabs Übersicht/Diagramme/Tabelle skriptverifiziert, `c-nachher-z5-half-fc.png`
- [x] Transform-basierte Sheet-Motion (`translateY`, nicht `max-height`), CLS ≈ 0 (Spec §10) — CLS 0.002 (auch Timeline auf transform umgestellt), kein Long Task > 200 ms; §9.6 Punkt 5
- [x] CSS konsolidiert: tote `.left-rails`-Regeln + doppelte Media-Queries bereinigt (Spec §11) — ein Mobile-Block, Dock/FAB/PFC-Mobil-Altregeln entfernt; §9.5 Punkt 6
- [x] Touch-Targets ≥ 44 px im gesamten neuen Sheet (Spec §13) — nur die 4 bekannten Attribution-Ausnahmen; §9.6 Punkt 1
- [x] Selbstverifikations-Fragen 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet — §9.7
- [x] Desktop-Screenshot-Diff: pixelgleich zur Baseline — `c-verify-desktop-after.png` vs. `c-baseline-desktop-location.png`; §9.6 Punkt 6
- [x] Vorher/Nachher-Screenshots aller 5 Zustände (Z1–Z5) unter `audit/screenshots/wetterkarte/` — `c-vorher-*` (5) + `c-nachher-z1…z5` + Overview/Landscape

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

## Querschnitt-Phase P — WebGL Cross-Device-Parität (GP)
Maßgebliche Vorgabe: `audit/webgl-cross-device.md`. Entscheidung (Jan): Governor regelt FPS statt Partikel. Umsetzung erfolgt separat über die CLI.
- [x] Diagnose in `audit/webgl-cross-device.md` abgeschlossen (Fillrate-Bilanz + Verifikation der Fachmann-Einschätzung, vor jeder Code-Änderung) — **erledigt** (dieses Dokument)
- [x] P-1: `governor.quality` aus `getEffectiveParticleCount()` entfernt — Partikelzahl Desktop↔Mobile bei gleichem Viewport/Zoom nachweislich gleich (Beleg: Dichte Desktop 3683 vs. Mobile 3722 Part./MPix, Verhältnis 1,011; `effectiveCount = floor(_numParticles × 0,867)` GPU-klassen-unabhängig — Audit §9.2)
- [x] P-2: Governor-Ausgang auf FPS-Leiter umgehängt (`maxParticleFps` dynamisch); Einbruch senkt FPS (30→24→20), **nicht** Partikelzahl (Beleg: Mobile perfState `drivesFps=true/targetFps=30`; Harness F1/F3: 45 ms→24 fps, 80 ms→20 fps bei konstanter Partikelzahl)
- [x] P-2: Governor mit echter Render-Dauer gefüttert (nicht gecapptes Wall-Clock-Intervall); `downMs`/`upMs` relativ zum FPS-Ziel re-basiert (kein Selbst-Runterregeln bei aktivem Cap) (Beleg: Harness F5 „cheap render under an active cap stays at 30fps"; feed nach den Pässen mit `performance.now()`-Delta)
- [x] Desktop (Fine-Pointer): Top-Tier gepinnt → ungedeckelt → byte-identisch zur Referenz (Beleg: perfState `drivesFps=false/maxParticleFps=0/targetFps=0/level 3`, `q`-Faktor entfernt)
- [x] Bewegung/Trails dt-normalisiert unverändert (Partikel-Geschwindigkeit + Trail-Länge über FPS-Änderung konstant) (`frameDtScale`-Pfad nicht angefasst) — 🔴 visueller Real-Device-Gegencheck an Jan
- [x] P-3: `scripts/verify-governor.mjs` auf FPS-Ziel-Semantik erweitert und grün (kein Vitest, Node-strip-types) — **27/27 PASS** (19 Legacy + 8 FPS-Modus)
- [x] Harte Regeln eingehalten: kein Shader-/RGBA8-/Float-Target-/Fusion-Eingriff (Diff-Beleg: nur `perfGovernor.ts`, `WindLayer.ts`, `verify-governor.mjs`)
- [x] Selbstverifikation 1–5 (CLAUDE.md) schriftlich mit Beleg beantwortet (Audit §9.3)
- [x] Keine neuen Konsolen-Errors/-Warnings (Desktop + Mobile, MCP); Typecheck grün
- [ ] 🔴 Real-Device-Stichprobe iPhone 12 Pro **und** schwaches Android an Jan übergeben (Emulator-FPS nicht belastbar — `ema`=0 unter Emulation bestätigt rAF-Drosselung; FPS-Stepping/Thermik nur real messbar)

## Phase 9 — Gesamtregression (G9)
- [ ] Kurzprotokoll V-ALL für alle 8 Features grün
- [ ] Desktop-Diff aller 8 Seiten gegen Phase-0-Baseline: keine Abweichung
- [ ] Konsolen-Abgleich: keine neuen Errors/Warnings ggü. Baseline
- [ ] Stichprobe 360×800 und 430×932: Layout stabil
- [ ] Abschlussbericht im Session-Log (context.md) geschrieben
- [ ] Liste empfohlener Real-Device-Tests (iPhone Safari) an Jan übergeben
