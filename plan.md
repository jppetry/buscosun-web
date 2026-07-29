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

## Phase 1-C — Wetterkarte Mobile-Redesign „Variante C" (Gate G1-C)

**Auslöser:** Jan wollte eine hochprofessionelle Mobilansicht der 2D-Wetterkarte und hat aus drei ausgearbeiteten Layout-Varianten **Variante C** gewählt: **ein** Bottom-Sheet mit Segment-Umschalter `Layer · Modell · Vorhersage`, Karte vollflächig, drei Snap-Zustände (collapsed / half / full).

**Bewusste Abweichung ggü. dem §8-Follow-up:** Variante C führt die zwei getrennten „Layer"/„Modell"-FABs wieder in ein Sheet zusammen und integriert die Punkt-Vorhersage als drittes Segment (vereinheitlicht die heute zwei getrennten Sheet-Systeme `.map-sheet` + `.pfc-body`). Von Jan mit der Wahl von Variante C freigegeben — im Audit als gewollte Änderung, nicht als Regression, dokumentieren.

**Verbindliche Umsetzungs-Spezifikation:** `audit/mockups/wetterkarte-c-spec.md` (Ist-Code-Mapping, Ziel-State `sheetSnap`/`sheetSegment`, Zustandsautomat, Maße/Tokens, Segment-Inhalte, Motion-Vorgabe `transform` statt `max-height`, CSS-Aufräumauftrag, 13-Punkte-Preservation-Contract, Verifikationsprotokoll). **Diese Datei ist die maßgebliche Vorgabe — die Punkte unten sind nur die Kurzfassung.**

**Visuelle Referenz-Mockups (echte Tokens, iPhone 12 Pro 390×844):**
- `audit/mockups/wetterkarte-mobile.html` — Varianten-Vergleich A/B/C (Entscheidungsgrundlage).
- `audit/mockups/wetterkarte-c-detail.html` — fünf Zielzustände Z1–Z5 (collapsed, half·Layer, full·Layer-Wind-expandiert, half·Modell, half·Vorhersage).

**Diagnose-First gilt unverändert:** Vor Code erst den Ist-Stand gegen die Spec prüfen und Abweichungen/Risiken (v. a. PFC-Integration, §9 der Spec) in `audit/wetterkarte.md` (neuer Abschnitt §9/„Variante C") festhalten.

**Kern-Maßnahmen (Kurzfassung, Details in der Spec):**
1. State-Umbau: `mobileSheet` → `sheetSnap: 'collapsed'|'half'|'full'` + `sheetSegment: 'layer'|'model'|'fc'`; Sheet **persistent** gerendert; Karte zurück auf `inset:0`; alte FABs/`.mobile-dock-*` entfernen.
2. Segment-Control (`Layer · Modell · Vorhersage`) + Chip-Strip im collapsed-Zustand (aktive Layer + Modell-Badge).
3. Segment-Inhalte umziehen (kein Funktionsverlust): Layer-Liste + Feinsteuerung (Wind/Sat), `ModelSwitcher variant="sheet"` inkl. Radar-Toggle, Punkt-Vorhersage als Segment `fc` (nur Location-Modus).
4. Motion über `transform: translateY()` (behebt CLS-0.68-Beobachtung), Scrim nur im full-Zustand.
5. CSS-Konsolidierung: die zwei doppelten Mobile-Media-Queries (`MapView.css:1412`/`:1638`) zusammenführen, tote `.left-rails`-Mobilregeln entfernen; sichtbare Legende-Kapsel statt `.map-legends{display:none}`.

**Verify:** tests.md → V-ALL + V-WETTERKARTE, plus Spec §13 (Touch-Audit, `scrollWidth≤390`, Funktionsliste §12, Konsole, Performance-Trace mit CLS≈0, Desktop-Diff pixelgleich, Landscape 844×390, Vorher/Nachher-Screenshots aller fünf Zustände).
**Gate G1-C:** Alle 13 Preservation-Punkte erreichbar, drei Snap-Zustände + Segment-Wechsel flüssig, Desktop unverändert, keine neuen Konsolenfehler, kein Long Task > 200 ms.

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

**Reihenfolge-Ausnahme (2026-07-08):** Jan hat diese Phase bewusst vor Abschluss von Phase 2–4 vorgezogen. Explizite Freigabe, siehe `context.md` Session-Log. Phase 2–4 bleiben offen und werden danach in ursprünglicher Reihenfolge nachgeholt.

**Zusätzlicher Auftrag von Jan:** Mehrschritt-Formular auf Mobile — Eingaben (Ort, Anlass, Zeitraum/Datum, ggf. weitere Parameter) werden auf **getrennte Seiten/Schritte** aufgeteilt statt auf einer einzigen überladenen Seite, damit der Nutzer auf Mobile nicht überfordert wird. Wird Teil der Diagnose/Plan-Maßnahmenliste unten.

**Diagnose-Ergebnis (siehe `audit/event.md`):** Schritt 1 (Ort) ist bereits eine eigene Seite. Danach folgen alle 4 verbleibenden Abschnitte (Anlass, Zeitfenster, Phasen, Plan B) gestapelt auf einer einzigen ~3–3,5-Bildschirmlängen-Seite — das ist die Ursache der von Jan beschriebenen Überforderung. Zusätzlich: 4 Formularfelder mit `font-size` < 16px (iOS-Auto-Zoom-Risiko), 24/36 interaktive Elemente unter 44×44px.

**Umzusetzende Maßnahmen:**
1. **Mobile Multi-Step-Wizard** (nur `useIsMobile()`, Desktop unverändert einspaltig wie bisher): nach Ortswahl je ein Schritt für Anlass → Zeitfenster → Phasen → Plan B (inkl. finalem CTA). Fortschrittsanzeige („Schritt 2 von 4 · Anlass") + sticky Back/Weiter-Fußzeile (safe-area-gepolstert). „Weiter" pro Schritt gated durch vorhandene Validierung (`isWindowValid`, Phasen-Hours-Check); Plan B bleibt optional, letzter Schritt zeigt den bestehenden CTA statt „Weiter". Zusammenfassungs-Kacheln (`ev-tiles`) bleiben auf jedem Schritt sichtbar als Kontext.
2. Formularfelder auf `font-size: 16px` anheben (`.ev-date`, `.ev-phase-name`, `.ev-tune-hr`, `.ev-phase-hr`) — scope-isoliert in der mobilen Media-Query, kein Effekt auf Desktop-Optik.
3. Touch-Targets ≥ 44px für: `.ev-loc-change`, `.ev-seg-btn`, `.ev-preset-btn`, `.ev-phase-name`, `.ev-phase-hr`, `.ev-tune-hr`, `.ev-add-btn.ev-phase-add` — ebenfalls nur in der mobilen Media-Query.
4. Explizit nicht umgesetzt: `EventResult`/Ergebnisdarstellung (Best-Day-Ranking) wird in dieser Runde nicht angefasst — Fokus ist der Eingabe-Flow, wie von Jan gewünscht; Ergebnis-Mobile-Check kann als Nachtrag folgen, falls gewünscht.

**Verify:** V-ALL + V-EVENT — kompletter Wizard-Durchlauf (alle 4 Schritte + Zurück-Navigation + Validierungs-Gates), Desktop-Diff (Screenshot 1440×900 unverändert), Konsole sauber.
**Gate G5:** Kompletter Flow Eingabe → Ergebnis auf 390 px ohne Zoom-Zwang durchführbar, jeder Schritt einzeln erreichbar/verlassbar, kein Informationsverlust ggü. der bisherigen Einzelseite.

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

---

## Querschnitt-Phase P — WebGL Cross-Device-Parität (Gate GP)

**Nicht eine der 8 Feature-Phasen**, sondern ein querschnittliches Performance-/Parität-Vorhaben an der Wind-Animation (betrifft primär die Wetterkarte, wirkt aber auf jeden WindLayer-Nutzer inkl. Globus).

**Maßgebliche Vorgabe:** `audit/webgl-cross-device.md` (Verifikation der externen Fachmann-Einschätzung, Fillrate-Diagnose, Entscheidung, Umsetzungs-Spec P-1…P-4, harte-Regeln-Nachweis, ehrliche Decke). **Die Punkte hier sind nur die Kurzfassung.**

**Ziel:** Partikel*dichte* auf jedem Gerät identisch (Desktop = Mobile); Performance-Parität über **partikel-neutrale** Hebel statt über Partikel-Reduktion.

**Diagnose-Ergebnis (Code-Analyse, siehe Audit §2):** Die zwei Full-Screen-Trail-Pässe (~2,2 MPix/Frame) sind partikel-unabhängig; die Advektion (der einzige partikel-skalierende Pass) kostet ~440× weniger. ⇒ Partikelzahl ist der schwächste Perf-Hebel — der Governor drosselt heute ausgerechnet diesen. DPR-Cap 1,5 und CSS-flächen-gekoppelte Dichte sind bereits vorhanden.

**Entscheidung (Jan): Governor regelt FPS statt Partikel.** Partikel-Multiplikator aus dem Partikelpfad entfernen (volle, flächengleiche Zahl überall); Governor-Ausgang auf die Wind-FPS umhängen (mobil z. B. 30→24→20 bei Einbruch), Desktop ungedeckelt/gepinnt = Referenz. Governor bleibt aktiv (Regel „nutzen, nicht umgehen" erfüllt).

**Umzusetzende Maßnahmen (Kurzfassung, Details Audit §4):**
1. **P-1** `getEffectiveParticleCount()` — `governor.quality`-Faktor entfernen (Parität der Zahl).
2. **P-2** Governor-Level → FPS-Leiter, auf `maxParticleFps`/`scheduleParticleRepaint` legen. **Kritisch:** Governor mit echter Render-Dauer füttern (nicht dem gecappten Wall-Clock-Intervall) und `downMs`/`upMs` relativ zum aktiven FPS-Ziel re-basieren, sonst sabotiert der Cap die Regelung.
3. **P-3** `scripts/verify-governor.mjs` auf FPS-Ziel-Semantik erweitern (kein Vitest, Node-strip-types, deterministisch).
4. **P-4** DPR-Cap 1,5 bestätigen (kein Code).

**Explizit nicht in diesem Vorhaben:** Trail-Buffer-Downscale (Hebel 2, RGBA8-Pfad → separates STOPP-gegateter Vorhaben); Shader-/Fusion-/Packing-Eingriff.

**Verify:** tests.md → V-PARITY (+ Governor-Harness). 🔴 Real-Device-Pflichtcheck iPhone 12 Pro **und** schwaches Android.
**Gate GP:** Partikelzahl Desktop↔Mobile nachweislich gleich, Einbruch senkt FPS (nicht Partikel), Bewegung dt-normalisiert unverändert, Desktop byte-identisch, Governor-Harness grün, keine neuen Konsolenfehler. **Status: umgesetzt** (§9 im Audit), bis auf 🔴 Real-Device grün.

---

## Querschnitt-Phase P2 — Trail-Res-Governance / Hebel 2 (Gate GP2)

**Fortsetzung von Phase P.** Maßgebliche Vorgabe: `audit/webgl-cross-device.md` **§10**. **UMGESETZT am 2026-07-19 auf `main`** (Verifikation §11, Gate GP2 bis auf 🔴 Real-Device grün, Harness 35/35) — Details/Selbstverifikation §11.

**STOPP-Gate bewusst geöffnet (Jan):** Hebel 2 fasst den RGBA8-Trail-*Color*-Pfad an (Auflösung + Filter der `background`/`screen`-Trail-Buffer). **Nicht** betroffen: das Partikel-State-Positions-Packing (bleibt voll aufgelöst, `NEAREST`, byte-exakt) und die Shader-GLSL.

**Ziel:** Auf sehr schwachen GPUs die **volle Partikelzahl + Flüssigkeit** halten, indem als **letzter** Hebel — nach ausgereiztem FPS-Abbau — die Trail-Auflösung auf 0,5× fällt (spart ~1,1 MPix/Frame am partikel-unabhängigen Fillrate-Killer). Ein monotoner Governor-Ladder: `[fps30] > [fps24] > [fps20] > [fps20,trail0,5]`. Capable Mobiles (iPhone) erreichen die Trail-Sprosse nie → volle Schärfe; Desktop nie im FPS-Modus → byte-identisch.

**Umzusetzende Maßnahmen (Kurzfassung, Details §10.1):**
1. **P2-1** Governor-Ladder um Sprosse `{targetFps:20, trailScale:0.5}` erweitern; `verify-governor.mjs` +Checks.
2. **P2-2** `allocScreenTextures` skaliert Trail-Dimensionen mit `trailScale`; `_epr` bleibt volle Ratio (nicht doppelt cappen).
3. **P2-3** Trail-Texturen auf `gl.LINEAR` (Upscale beim Composite nicht blockig).
4. **P2-4** Point-Size mit `trailScale` multiplizieren (CSS-Dicke nach Upscale konstant).
5. **P2-5** Viewport folgt automatisch über `screenWidth/Height`.

**Explizit außerhalb:** Shader-GLSL-Edit, Float-Target, Packing/Encoding-Pfad, Fusion. Trail-Targets bleiben RGBA8.

**Verify:** tests.md → V-PARITY-2. 🔴 Real-Device Pflicht: iPhone (Trail-Sprosse nie erreicht → scharf) **und** schwaches Android (Sprosse erreicht, volle Zahl gehalten, Weichheit visuell bewerten — **visueller Sign-off Pflicht**).
**Gate GP2:** Trail-Sprosse greift nur am FPS-Floor + fortgesetztem Einbruch; iPhone bleibt scharf; volle Partikelzahl auch auf der Sprosse; Desktop byte-identisch; Governor-Harness grün; RGBA8-Packing-Pfad nachweislich unberührt (Diff-Beleg); keine neuen Konsolenfehler.

---

## Querschnitt-Phase P3 — Repaint-Disziplin / Hebel 5 (Gate GP3)

> **UMGESETZT 2026-07-19 auf `main`** (Verifikation `audit/webgl-cross-device.md` §12.4, Gate GP3 grün — im Emulator live belegt: hidden/offscreen stoppt den Loop 0/s, Resume startet neu; Diff = 1 File `WindLayer.ts`; Governor-Harness 35/35 unverändert). 🔴 Real-Device Akku/Thermik nur nice-to-have. **Alle 5 Fachmann-Hebel abgeschlossen.**

**Abschluss der 5 Fachmann-Hebel** (1/3 waren schon gelöst, 4 = Phase P, 2 = Phase P2, **5 = diese Phase**). Maßgebliche Vorgabe: `audit/webgl-cross-device.md` **§12**. Umsetzung separat über die CLI.

**Niedrigstes Risiko aller Hebel** — reine Event-Listener-/Repaint-Scheduling-Logik, **kein** Shader-/RGBA8-/Pipeline-/Fusion-Eingriff, **kein** STOPP-Gate.

**Ziel:** Den selbst-perpetuierenden Wind-Repaint-Loop (`scheduleParticleRepaint`, der einzige Dauerloop der 2D-Karte, `performance-2d.md` §1a „Akku/Thermik-Treiber Nr. 1") **pausieren, wenn nichts sichtbar ist** → weniger Hitze → weniger thermisches Throttling → Zielrate hält länger, Governor steppt seltener runter (inkl. seltener die P2-Trail-Sprosse). Direkt „gleich performant über Zeit".

**Umzusetzende Maßnahmen (Kurzfassung, Details §12.1):**
1. **P3-1** `visibilitychange`-Pause (Haupt-Win): `document.hidden` → Loop stoppen; sichtbar → einmal `triggerRepaint`. Listener in `onAdd`/`onRemove`.
2. **P3-2** Offscreen-Pause via `IntersectionObserver` auf das Karten-Canvas (`ratio===0` → pausieren).
3. **P3-3** Ein `paused`-Flag (hidden ∨ offscreen) gated **nur** `scheduleParticleRepaint`; `render()` bleibt für MapLibre-eigene Repaints korrekt.
4. **P3-4** Resume-Hygiene: `clearOnNextFrame` beim Fortsetzen (kein Alt-Trail-Aufblitzen).

**Explizit außerhalb:** Shader/RGBA8/Trail-Ladder (P/P2 unberührt), Fusion. „Map-idle-Pause" entfällt (animierte Ebene ist nie idle); opakes DOM-Overlay wird von IO nicht erkannt (akzeptierte kleine Lücke).

**Verify:** tests.md → V-PARITY-3 — **grösstenteils emulator-belastbar** (Loop-Stopp ist JS-beobachtbar, anders als FPS/Thermik). 🔴 Real-Device nur noch für den Akku-/Thermik-Gewinn (nice-to-have, nicht gate-blockierend).
**Gate GP3:** hidden/offscreen stoppt die Repaint-Anforderungen, sichtbar/onscreen startet neu; sichtbar+aktiv byte-identisch (keine Desktop-Regression); Konsole/Typecheck grün.

---

## Infrastruktur-Phase T2 — Layer-Transport / Caching für alle ICON-D2-Layer (Gate GT2)

**Nebengleis (Transport/Datenschicht), Fortsetzung von T1 (Wind-Transport, `audit/wind-transport.md`).** Maßgebliche Vorgabe: `audit/layer-transport.md`. Umsetzung separat über die CLI; Prod-Deploy + Cron = **Jans Gate**.

**Ziel:** Das T1-Muster (Durable-Edge-Proxy + GitHub-Action-Warm-Cron + Manifest-Gate), das den Wind-Layer vom kritischen DWD-Pfad genommen hat, auf **alle passenden Kartenlayer** ausrollen. **Output-identisch** — dieselben GRIB-Bytes, nur Herkunft/Latenz ändern sich.

**Diagnose (2 Code-Analysen, Audit §A/§B):** Temp (`t_2m`+`hsurf`), Gust (`vmax_10m`), Precip (`tot_prec`), Clouds (`clcl/clcm/clch/clct`) sind alle ICON-D2-GRIB über `fetchStepField`/`fetchStepBytes` mit Default-`base` → passen direkt. Der Edge-`ALLOWED_PREFIX` ist **schon** generisch. **Radar passt nicht** (5-Min-Kadenz, Tar-Bündel, eigener Rewrite/Cache, Live-WMS); **Confidence** hat keinen eigenen Transport. Der Refresh-Koordinator fächert die Layer bereits auf → kein Umbau.

**Umzusetzende Maßnahmen (Kurzfassung, Details Audit §C):**
1. **T2-1** Generische Edge-Route `/_dwd_grib/*` (`netlify/edge-functions/dwd-grib.ts`, Kopie von `dwd-wind.ts`), additiv.
2. **T2-2** Temp/Gust/Precip/Clouds-Quellen mit eigenem `base = '/_dwd_grib/...'` routen (kein Decode-Eingriff).
3. **T2-3** Kombiniertes `public/latest-grib.json` (per-Param Step-Listen); Client-Resolver generalisieren (24h-Guard + Scan-Fallback).
4. **T2-4** `scripts/warm-grib.mjs` + `.github/workflows/warm-grib.yml` (poll→warm→atomares Manifest→commit-back, `SITE_URL`-Var).
5. **T2-5** Vite-Dev-Proxy `/_dwd_grib`-Eintrag.
6. **T2-6** `scripts/verify-layer-transport.mjs` (Node strip-types, kein Vitest).
7. **T2-7** (optional/vertagt) Per-Layer-IndexedDB-Now-Cache.

**Explizit außerhalb:** Radar/Nowcast/PoP, Confidence, Wind (T1), Decode/Norm/Shader/Fusion, `/_dwd_opendata`- und `/_dwd_wind`-Pfade.

**Verify:** tests.md → V-TRANSPORT-2 (+ Verifier-Skript). 🔴 Latenz/Durable-Cache-`hit` erst nach Netlify-Deploy belastbar (Jan).
**Gate GT2:** Bytes je Param identisch (Proxy vs. direkt), Durable-Header, Manifest-Gate eliminiert Directory-Scans + spekulative Fehl-Fetches je Layer, Output visuell/numerisch identisch, Konsole/Typecheck grün, `/_dwd_opendata`+`/_dwd_wind` unberührt (Diff-Beleg). **Status: umgesetzt + lokal verifiziert** (§G), bis auf 🔴 Prod-Deploy grün.

---

## Infrastruktur-Phase T2b — EPS/icosahedral-Transport (Gate GT2b)

**Fortsetzung von T2.** Maßgebliche Vorgabe: `audit/layer-transport.md` **§H**. Umsetzung via CLI; Prod-Deploy = Jans Gate.

**Auslöser (Prod-Traffic):** Der Kaltload-Flaschenhals sind **nicht** die T2-Layer, sondern die **ICON-D2-EPS-Dateien** (icosahedral, Fusion-Engine) mit **4–15 s je Datei** — sie laufen über `/_dwd_opendata` **ohne** Durable-Cache, weil der Edge-`ALLOWED_PREFIX` nur `icon-d2/grib/` matcht, nicht `icon-d2-eps/grib/`. Zusätzlich ~16 MB entpackt + teurer icosahedraler Decode.

**Ziel:** Die EPS-Byte-Fetches genauso durch den Durable-Proxy + Warm-Cron ziehen (Kern, rein Transport), optional das icosahedrale Resampling in den Cron verlagern.

**Umzusetzende Maßnahmen (Kurzfassung, Details §H.1):**
1. **T2b-1** `dwd-grib.ts` `ALLOWED_PREFIX` → Liste inkl. `weather/nwp/icon-d2-eps/grib/`; Verifier erweitern.
2. **T2b-2** `iconD2EpsSource.ts`: Byte-Fetches über `/_dwd_grib`-EPS-Base (Directory-Listing bleibt auf `/_dwd_opendata`); kein Decode-Eingriff.
3. **T2b-3** `warm-grib.mjs`: EPS-Params (eigener EPS-Lauf, bis Cap 6) mitwarmen.
4. **T2b-4** (OPTIONAL, größer) Vor-Resampling icosahedral→coarse im Cron → kompaktes Artefakt; **Output-Äquivalenz** (nicht -Identität) → numerischer Beweis Pflicht.

**Explizit außerhalb:** *Wann/ob* Fusion EPS auf den kritischen Pfad lädt (Deferral) = Fusion-Verhaltensänderung → **STOPP & FRAGEN**, nur Vermerk. `/_dwd_opendata`+`/_dwd_wind`+Fusion-Blend-Logik unberührt.

**Verify:** tests.md → V-TRANSPORT-2b. 🔴 Latenz/Durable-`hit` erst nach Deploy.
**Gate GT2b:** EPS-Bytes je Param identisch (Proxy vs. direkt), Durable-Header, EPS-Kaltload nicht mehr über `/_dwd_opendata` (die 4–15-s-Fetches verschwinden bei warmem Edge), Fusion-Ergebnis unverändert, Konsole/Typecheck grün; (T2b-4 falls umgesetzt: vor-resampelte Grid numerisch == Client).

---

## Diagnose-Phase T-AUDIT — Live-Netzwerk-Audit pro Layer (Prod)

**Reine Diagnose gegen die deployte Produktion, kein Code.** Maßgebliche Vorgabe + Ergebnis-Ablage: `audit/live-network-audit.md`. Ausführung durch die CLI (Chrome DevTools MCP).

**Ziel-URL:** `https://buscosun.com/#m={"l":[50.2,10.5,"Deutschland · Österreich · Schweiz","DE"],"b":0,"h":0}` (Karten-Ansicht mit Ort → Punkt-Vorhersage + eager Fusion inkl. EPS).

**Auftrag:** Bare-Cold-Load + **jeden Layer einzeln** durchschalten, **kompletten Netzwerk-Traffic** erfassen (Route je Request: `/_dwd_wind` · `/_dwd_grib` · `/_dwd_opendata` · Tiles · brightsky/…; Bytes, Dauer, **Cache-Status-Header** = Edge-HIT vs. Origin-MISS), dann **priorisierte Verbesserungen** je Layer ableiten. Verifiziert nebenbei, ob T2b deployt ist (EPS via `/_dwd_grib`).

**Methodik-Eckpunkte (Details Audit §1/§2):** Client-Cache leeren (IndexedDB/Cache-API/HTTP) vor der Baseline; Server-Edge nicht leerbar → Header-basiert HIT/MISS interpretieren; Netzwerk ist emulator-belastbar (kein Real-Device nötig).

**Ergebnis:** gefüllte Tabellen §3 + priorisierte Maßnahmenliste §4 in `audit/live-network-audit.md`. **Keine Code-Änderung** — Findings speisen Folge-Phasen; Fusion-Lade-Timing nur benennen (STOPP).
**Gate GT-AUDIT:** Bare-Load + alle UI-Layer einzeln erfasst, je Request Route+Bytes+Dauer+Cache-Status protokolliert, Top-Auffälligkeiten + priorisierte Hebel schriftlich belegt. **Status: durchgeführt** (`audit/live-network-audit.md` §3/§4).

---

## Feature-Phase F1 — Gewitterpotenzial-Layer (Gate GF1)

**Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der ursprünglichen Mobile-Mission (dort ist „neue Features" Nicht-Ziel), analog zu T2/Command-Deck als bewusste Scope-Erweiterung.** Maßgebliche Vorgabe: `audit/gewitterpotenzial.md`. Umsetzung separat über die CLI.

**Ziel:** Ein standardmäßig **inaktiver** Layer „Gewitterpotenzial", der aus drei ICON-D2-Feldern einen 0–100-Index je Zelle bildet und flächig über DACH rendert — flächige Gewitter-Vorwarnung 0–12 h **vor** dem ersten Radarecho:
- `cape_ml` = Energie/Potenzial · `cin_ml` = Deckel/Hemmung · `lpi` = Blitzbereitschaft/Auslösung.

**Diagnose-Kern (siehe Spec §2):** Alle drei Felder sind reguläre ICON-D2-2,2-km-Gitter (kein icosahedraler EPS-Pfad) → **derselbe Decode wie Temp/Böen**. `cape_ml` wird bereits punktweise geladen (`iconD2Cape.ts`), `convectiveIndex.ts` liefert wiederverwendbare Rampen/Schwellen. Der Edge-`ALLOWED_PREFIX` deckt `icon-d2/grib/` schon ab → kein Transport-Umbau.

**Zwingend (Jans Vorgabe): Lazy-Load wie alle anderen Layer** — `active.has('thunder') && !ref` → `installThunderRef` (Muster Clouds/Gust); **kein** Eager-Fetch am Kartenstart, nicht im `initialActive`-Default.

**Diagnose-Befund 2026-07-24 (Details `audit/gewitterpotenzial.md` §8) — am Code verifiziert, kein STOPP:**
- **Reguläres Gitter bestätigt** (Dateiname `regular-lat-lon`; `gribDecode.ts` akzeptiert nur GDT 0 regulär + GDT 101 icosahedral=EPS) → Decode wie `t_2m`/`vmax_10m`, **kein Eingriff**.
- **CIN-Vorzeichen sign-agnostisch gelöst:** `cinGate(Math.abs(cin))` deckt beide DWD-Konventionen ab (§3-`|CIN|`); Harness testet beide Vorzeichen. Kein Blocker.
- **Domänenmaske:** `decodeGrib2` → `NaN` bei Bitmap-Maske (`gribDecode.ts:299`); Builder `alpha=0` bei nicht-finitem `cape` → Rand transparent, nie 0.
- **Architektur-Entscheidung:** Loader nutzt **`fetchStepField`** (rohes `GribField`, wie `iconD2TempSource` `t_2m`+`hsurf`→ein Canvas), **nicht** `fetchIconD2Grid` (Uint8-quantisiert, einkanalig — für die 3-Feld-Rohfusion untauglich); bewusste, in §8.4 begründete Abweichung von F1-1-Wortlaut, gleiche Pipeline/dieselbe Datei.
- **Rampen-Reuse:** `ramp`/`capeScore` in `convectiveIndex.ts` werden `export`iert (rein additiv, keine Verhaltensänderung).
- **Toggle-Herkunft korrigiert:** Dock **und** Mobile-Sheet rendern aus **`DECK_GROUPS`** (nicht direkt `LAYER_OPTIONS`) → ein additiver `DECK_GROUPS`-Eintrag (Gruppe „Niederschlag") liefert den Toggle auf Desktop+Mobile. Zusätzliche Typecheck-Seams: `statuses`-Init, `LAYER_INFO` (=Tooltip), `LayerIcon`-Case.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §5):**
1. **F1-1** `src/sources/iconD2Thunder.ts` — Grid-Loader `cape_ml`/`cin_ml`/`lpi` (Reuse `fetchIconD2Grid`/`frameAtValidTime`), CIN-Vorzeichen im Decode verifizieren.
2. **F1-2** `src/radar/thunderPotential.ts` — reine Fusion (§3) + `verifyThunderPotential()`-Harness.
3. **F1-3** `thunderRamp` + `visRange` (fünfstufig, < Score ~8 transparent).
4. **F1-4** `MapView.tsx` — die 7 additiven Seams (LayerKey/Option/Ref/Init/Visibility/Refresh/**Lazy-Effekt**, Spec §4).
5. **F1-5** Legende + Tooltip mit Ehrlichkeits-Hinweisen (Domänenrand, Horizont, Potenzial≠Auslösung).
6. **F1-6** `scripts/verify-thunder.mjs` (Node strip-types, kein Vitest).
7. **F1-7** Mobile-Sichtprüfung (Toggle im Sheet-Layer-Segment, Touch-Target, Legende) — keine Sonderregel.

**Explizit außerhalb:** Wind-Shader/RGBA8/Fusion-Engine/EPS/Radar/Decode; `warm-grib`-Vorwärmung der drei Params (optional/vertagt, bis der Layer sich bewährt).

**Verify:** tests.md → V-GEWITTER (+ Fusion-Harness). **STOPP & FRAGEN**, falls `lpi`/`cin_ml` nicht regulär-gegittert sind oder der Decode angefasst werden müsste.
**Gate GF1:** Harness grün, Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung), Fusion plausibel gegen eine echte Lage, Domänenrand ehrlich maskiert, additiver Diff, Mobile-Toggle sauber, Desktop unverändert, Konsole/Typecheck grün.

---

## Feature-Phase F2 — Blitz-Vorhersage-Layer / LPI (Gate GF2) — ✅ UMGESETZT (2026-07-24, GF2 grün)

> **Ergebnis:** Additiv umgesetzt wie geplant. Abweichung von der Wortlaut-Vorgabe F2-1: `fetchStepField` statt `fetchIconD2Grid` (letzteres hat kein `'max'`-Kind; `'cape'`-Quantisierung zerquetscht LPIs Feinbereich — Diagnose §8.4, wie F1). `minStepHours=1` + Loader-Steps 1–12 lösen das t+0-Intervallmaximum ohne Decode-/`frameAtValidTime`-Eingriff. Lazy-Load MCP-belegt (0 `lpi_max` vor Toggle, Steps 001–012 via `/_dwd_grib` danach). F2-5 mitgeliefert (`lightningPotential.ts` + `verify-lpi.mjs`, 6/6). Belege: `audit/blitz-vorhersage.md` §9, `checklist.md` GF2. Uncommitted → Commit ist Jans Gate.

**Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der Mobile-Mission, analog F1/T2.** Maßgebliche Vorgabe: `audit/blitz-vorhersage.md`. Umsetzung separat über die CLI. **Unabhängig von F1** umsetzbar.

**Ziel:** Ein standardmäßig **inaktiver** Layer „Blitz-Vorhersage", der den ICON-D2 **Lightning Potential Index** (`lpi_max`) flächig als Blitzrisiko-Raster über DACH rendert und über den Zeit-Slider in die Zukunft (0–12 h) läuft — echte Prognose statt nur gemessener Sferics. USP: kaum ein Consumer-Dienst zeigt einen Blitz-*Prognose*-Layer.

**Abgrenzung (Spec §0) — drei getrennte Blitz-Dinge:** `lightning` (bestehend) = *gemessene* Blitze letzte 60 Min (DWD-WMS, bleibt unverändert); **`lightningfc` (dieser Layer)** = *prognostiziertes* Blitzrisiko (ICON-D2 LPI); `thunder` (F1) = fusionierter Gewitterindex. F2 macht LPI als **eigenständigen** Layer sichtbar (in F1 ist LPI nur interne Fusions-Zutat) — komplementär, kein Widerspruch.

**Diagnose-Kern (Spec §2):** `lpi`/`lpi_max` sind reguläre ICON-D2-2,2-km-Gitter (kein EPS-Pfad) → **Einfeld-ScalarLayer**, gleicher Decode wie Temp/Böen; alle Bausteine (`fetchIconD2Grid`, `frameAtValidTime`, `ScalarLayer`, Lazy-Muster) vorhanden. **Feld-Wahl: `lpi_max`** (Peak-Risiko/Stunde) mit **`minStepHours = 1`** (Intervall-Max ist bei t+0 strukturell 0 — wie Böen); `lpi` instantan als Fallback.

**Zwingend (Jans Vorgabe): Lazy-Load wie alle anderen Layer** — `active.has('lightningfc') && !ref → installLightningFcRef` (Muster Clouds/Gust); **kein** Eager-Fetch am Kartenstart, nicht im `initialActive`-Default.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §5):**
1. **F2-1** `src/sources/iconD2Lpi.ts` — Grid-Loader `lpi_max` (Reuse `fetchIconD2Grid`), Frame-Wahl `minStepHours = 1`.
2. **F2-2** `lpiRamp` + `visRange` (fünfstufig, < ~1 J/kg transparent), Palette klar getrennt von der Blitzortung.
3. **F2-3** `MapView.tsx` — die 7 additiven Seams (LayerKey/Option/Ref/Init/Visibility/Refresh/**Lazy-Effekt**, Spec §4).
4. **F2-4** Legende + Tooltip mit Ehrlichkeits-Hinweisen + Abgrenzung zum Beobachtungs-Layer.
5. **F2-5** (optional, leichtgewichtig) `lpiRisk()`-Rampe + `scripts/verify-lpi.mjs` — nur ohne Mehraufwand.
6. **F2-6** Mobile-Sichtprüfung (Toggle im Sheet-Layer-Segment, Touch-Target, Legende).

**Explizit außerhalb:** bestehender `dwdLightning.ts`/`Accumulated_Flash_Area`-Layer, Wind-Shader/RGBA8/Fusion/EPS/Radar/Decode; `warm-grib`-Vorwärmung von `lpi_max` (optional/vertagt).

**Verify:** tests.md → V-BLITZ-VORHERSAGE. **STOPP & FRAGEN**, falls `lpi_max` nicht regulär-gegittert ist oder Decode/`frameAtValidTime` über `minStepHours` hinaus angefasst werden müsste.
**Gate GF2:** Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung), t+0 nicht leer, Slider-Vorausschau funktioniert, klar von „Blitze" abgegrenzt, Domänenrand ehrlich maskiert, additiver Diff, Mobile-Toggle sauber, Desktop unverändert, Konsole/Typecheck grün.

---

## Feature-Phase F3 — Simuliertes-Radar-Layer / dbz_cmax (Gate GF3) — ⛔ STILLGELEGT ZUGUNSTEN N1 (2026-07-24)

> **Stillgelegt.** Der Sim-Radar-Layer wurde in **Phase N1** (Niederschlag-Vereinheitlichung) restlos entfernt, da die 2–12-h-Modellhälfte der Fusion-/Modell-Niederschlag (mm/h) bleibt, nicht `dbz_cmax`. Historie unten erhalten; aktuelle Vorgabe: `audit/niederschlag-vereinheitlichung.md`.

**Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der Mobile-Mission, analog F1/F2/T2.** Maßgebliche Vorgabe: `audit/simuliertes-radar.md`. Umsetzung separat über die CLI. **Unabhängig von F1/F2.**

**Ziel:** Ein standardmäßig **inaktiver** Layer „Simuliertes Radar", der die ICON-D2-Composite-Reflektivität `dbz_cmax` flächig **in der gewohnten Radar-dBZ-Optik** über DACH rendert und über den Zeit-Slider 0–12 h in die Zukunft läuft — verlängert das Regenradar **über den 2-h-Nowcast-Horizont hinaus**. USP: gewohntes Radarbild dort, wo es sonst keins gibt.

**Abgrenzung (Spec §0):** F3 ist **Modell**-Reflektivität, keine Messung. `nowcast`/Regenradar (RADOLAN-RV/INCA/MeteoSchweiz) sind in 0–2 h präziser und bleiben **unverändert**; F3 ergänzt die Vorwärtsschau. Klar als „simuliert/Modell" labeln. Unterschied zur mm/h-Ansicht: dBZ zeigt Zellstruktur (Hagel-/Graupel-Signatur) in Radar-Optik.

**Diagnose-Kern (Spec §2/§3):** `dbz_cmax` ist reguläres ICON-D2-2,2-km-Gitter (kein EPS) → gleicher Decode wie Temp/Böen; **instantan pro Step → gültig bei t+0, kein `minStepHours` nötig**. **Schlüssel-Reuse: `src/radar/radarModel.ts`** hat die dBZ↔mm/h-Umrechnung + die Radar-Paletten schon → `dbz_cmax` → mm/h → **dieselbe `precipRainRamp` wie das Regenradar** → optisch konsistent, keine neue Palette (daher Aufwand Mittel, nicht Komplex).

**Zwingend (Jans Vorgabe): Lazy-Load wie alle anderen Layer** — `active.has('simradar') && !ref → installSimRadarRef` (Muster Clouds/Gust); **kein** Eager-Fetch am Kartenstart, nicht im `initialActive`-Default.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §5):**
1. **F3-1** `src/sources/iconD2Dbz.ts` — Grid-Loader `dbz_cmax` (Reuse `fetchIconD2Grid`); dBZ→mm/h über `radarModel.ts` (nicht duplizieren).
2. **F3-2** Rendering an die bestehende Radar-Palette hängen (`precipRainRamp`/`radarModel`); < ~5–10 dBZ transparent.
3. **F3-3** `MapView.tsx` — die 7 additiven Seams (LayerKey/Option/Ref/Init/Visibility/Refresh/**Lazy-Effekt**, Spec §4); **`nowcast`/RainLayer/RADOLAN NICHT anfassen.**
4. **F3-4** Legende + Tooltip mit „simuliert/Modell", Horizont/Domäne + Verweis auf echtes Radar als 0–2-h-Referenz.
5. **F3-5** (optional/vertagt) `echotop` als Punkt-Readout/Tooltip (Gewitter-Schwere) — kein eigenes Raster.
6. **F3-6** Mobile-Sichtprüfung (Toggle im Sheet-Layer-Segment, Touch-Target, Legende).

**Explizit außerhalb:** bestehender `nowcast`/RainLayer/RADOLAN-Pfad + Regenradar-Feature, `radarModel.ts`-Verhalten (nur lesen/wiederverwenden), Wind-Shader/RGBA8/Fusion/EPS; `warm-grib`-Vorwärmung von `dbz_cmax` (optional/vertagt).

**Verify:** tests.md → V-SIM-RADAR. **STOPP & FRAGEN**, falls die dBZ→mm/h-Wiederverwendung eine Verhaltensänderung an `radarModel.ts` erzwingt oder `dbz_cmax` nicht regulär-gegittert ist.
**Gate GF3:** Lazy-Load im Waterfall belegt (0 Requests vor Aktivierung), Optik konsistent zur bestehenden Radar-Palette, t+0 nicht leer, Horizont-Mehrwert jenseits 2 h sichtbar, klar als „simuliert" abgegrenzt, additiver Diff (radarModel.ts unberührt), Mobile-Toggle sauber, Desktop unverändert, Konsole/Typecheck grün.

---

## Feature-Phase F4 — Schneehöhe-&-Neuschnee-Layer (Gate GF4)

**Funktionserweiterung (neuer Kartenlayer), von Jan beauftragt — außerhalb der Mobile-Mission, analog F1/F2/F3/T2.** Maßgebliche Vorgabe: `audit/schnee.md`. Umsetzung separat über die CLI. **Unabhängig von F1/F2/F3.**

**Ziel:** Ein standardmäßig **inaktiver** Layer „Schnee" mit zwei Modi (Umschalter analog Satelliten-Produkt): **Schneedecke** (`h_snow`, cm) + **Neuschnee** (cm) — Schneemenge als Fläche statt nur der Schneegrenzen-Linie.

**Abgrenzung (Spec §0):** Der bestehende `snowline`-Layer (ML-**Linie**) bleibt **unverändert**; F4 zeigt die **Menge als Raster**. `snowlmt`-Linie ist durch `snowline` abgedeckt → in F4 nicht dupliziert.

**⚠️ Kritischer Diagnose-Fund (Spec §2.2):** `freshsnw` ist **NICHT** „Neuschnee in cm", sondern der ICON-**Schnee-Frische-/Albedo-Alterungsfaktor** (0..1). Neuschneemenge korrekt aus **akkumuliertem Schneefall `snow_gsp`(+`snow_con`)** → mm SWE → cm (bzw. `h_snow`-Δ). Vor Code die `freshsnw`-Semantik im Decode verifizieren.

**Diagnose-Kern (Spec §2):** `h_snow`/`snow_gsp` sind reguläre ICON-D2-2,2-km-Gitter (kein EPS) → gleicher Decode wie Temp/Böen. `h_snow` instantan → t+0 gültig, kein `minStepHours`; Neuschnee ist Akkumulation → `minStepHours=1` (wie `tot_prec`). **Reuse:** `src/nowcast/alpineSplit.ts` (SWE→cm ~10:1, `freshSnowCm`) + `src/radar/precipPhase.ts` `snowRamp` sind vorhanden.

**Zwingend (Jans Vorgabe): Lazy-Load wie alle anderen Layer** — `active.has('snow') && !ref → installSnowRef` (Muster Clouds/Gust); **kein** Eager-Fetch, nicht im `initialActive`-Default; Modus-Wechsel lädt das jeweilige Feld lazy nach.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §5):**
1. **F4-1** `src/sources/iconD2Snow.ts` — `h_snow` (Schneedecke, m→cm, t+0); zuerst `freshsnw`-Semantik verifizieren.
2. **F4-2** Neuschnee-Modus: `snow_gsp`(+`snow_con`) akkumuliert → cm via `alpineSplit.ts` (`rho_snow` bevorzugt), `minStepHours=1`.
3. **F4-3** Rendering über `snowRamp` (Reuse); < ~1 cm transparent.
4. **F4-4** `MapView.tsx` — additive Seams inkl. Modus-Umschalter (analog `SAT_PRODUCT`) + **Lazy-Effekt**; `snowline`/ML-Pfad NICHT anfassen.
5. **F4-5** Legende + Tooltip (cm, Modus-Label, Domäne/Horizont, Verhältnis-Näherung).
6. **F4-6** Mobile-Sichtprüfung (Toggle + Modus-Switch, Touch-Targets, Legende).

**Explizit außerhalb:** bestehender `snowline`-ML-Layer/`climaField`, `alpineSplit.ts`/`precipPhase.ts`-Verhalten (nur lesen/wiederverwenden), Wind-Shader/RGBA8/Fusion/EPS/Radar; `warm-grib`-Vorwärmung (optional/vertagt); `freshsnw` als optische Anreicherung (vertagt).

**Verify:** tests.md → V-SCHNEE. **STOPP & FRAGEN**, falls `freshsnw` doch amount-artig kodiert ist, `h_snow`/`snow_gsp` nicht regulär-gegittert sind oder die SWE→cm-Wiederverwendung `alpineSplit.ts` verändern würde.
**Gate GF4:** `freshsnw`-Korrektur dokumentiert, Lazy-Load belegt (0 Requests vor Aktivierung, Modus-Wechsel lazy), Schneedecke t+0 gefüllt + Neuschnee `minStepHours=1`, cm-Werte plausibel, klar von `snowline` abgegrenzt, additiver Diff, Mobile sauber, Desktop unverändert, Konsole/Typecheck grün.

---

## Feature-Phase F5 — Superzellen-/Rotationspotenzial-Layer (Gate GF5)

**Funktionserweiterung (neuer Experten-Kartenlayer), von Jan beauftragt — außerhalb der Mobile-Mission, analog F1–F4/T2.** Maßgebliche Vorgabe: `audit/rotationspotenzial.md`. Umsetzung separat über die CLI. **Unabhängig von F1–F4.**

**⚠️ Heikelster Layer — Ehrlichkeits-Leitplanken (Spec §0) sind gate-blockierend:** zeigt **Modell-Verdachtsflächen** für rotierende Aufwinde, **kein** Warnprodukt. Verpflichtend: „kein Warnersatz" (Verweis DWD-Warnungen), „Verdacht ≠ Ereignis", Sprache nie „Tornado" (immer „Rotationspotenzial/Verdacht"), hohe Fehlalarmrate benannt, Darstellung **geglättet** (kein Einzelpixel-Alarmismus), als Experten-Layer gekennzeichnet. Falls seriöse Darstellung nicht möglich → STOPP & FRAGEN.

**Ziel:** Ein standardmäßig **inaktiver** Experten-Layer „Rotationspotenzial", der aus `uh_max`(+`uh_max_low`) + `sdi_2` Verdachtsflächen für Superzellen/rotierende Gewitter (Großhagel/Tornado-Potenzial) flächig über DACH rendert (0–12 h). USP: Storm-Chaser-Nische, kaum ein Consumer-Dienst.

**Diagnose-Kern (Spec §2):** `uh_max`/`sdi_2` sind reguläre ICON-D2-2,2-km-Gitter (kein EPS) → gleicher Decode wie Temp/Böen. `uh_max`/`uh_max_low` sind Intervall-**Maxima** → t+0 strukturell 0 → **`minStepHours=1`**; `sdi_2`-Vorzeichen/Bereich im Decode verifizieren. „Komplex" liegt an Schwellen-**Kalibrierung** + **Nachbarschafts-Glättung** des rauschigen UH-Felds + **Fusion** + **Ehrlichkeits-Labeling** — nicht am Laden.

**Zwingend (Jans Vorgabe): Lazy-Load wie alle anderen Layer** — `active.has('rotation') && !ref → installRotationRef` (Muster Clouds/Gust); **kein** Eager-Fetch, nicht im `initialActive`-Default.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §5):**
1. **F5-1** `src/sources/iconD2Rotation.ts` — Loader `uh_max`(+`uh_max_low`,`sdi_2`); Feld-Semantik/Vorzeichen/Einheiten verifizieren, `minStepHours=1`.
2. **F5-2** `src/radar/rotationPotential.ts` — reine Fusion (§3) + Nachbarschafts-Glättung + `verifyRotationPotential()`-Harness.
3. **F5-3** `rotationRamp` + `visRange` (dezent, eigene Palette, großzügige Aktivierungsschwelle).
4. **F5-4** `MapView.tsx` — die 7 additiven Seams inkl. **Lazy-Effekt** (Spec §4).
5. **F5-5** Legende + Tooltip mit den Ehrlichkeits-Leitplanken §0 + Verweis auf DWD-Warnungen.
6. **F5-6** `scripts/verify-rotation.mjs` (Node strip-types, kein Vitest).
7. **F5-7** Mobile-Sichtprüfung (Toggle im Sheet-Layer-Segment, Touch-Target, Legende).

**Explizit außerhalb:** `dwdAlerts`/`convectiveIndex.ts`-Verhalten (nur lesen/verweisen/wiederverwenden), bestehende Konvektions-/Radar-Layer, Wind-Shader/RGBA8/Fusion/EPS; `warm-grib`-Vorwärmung (optional/vertagt); `uh_max_med`/`w_ctmax` (vertagt).

**Verify:** tests.md → V-ROTATION. **STOPP & FRAGEN**, falls keine seriöse Darstellung möglich ist, `uh_max`/`sdi_2` nicht regulär-gegittert sind oder die Feld-Semantik unklar bleibt.
**Gate GF5:** Harness grün, Lazy-Load belegt (0 Requests vor Aktivierung), Feld-Semantik/`minStepHours` verifiziert, **Ehrlichkeits-Leitplanken §0 im UI umgesetzt** (kein Warnersatz, Verdachts-Sprache, Glättung), Domänenrand ehrlich maskiert, additiver Diff, Mobile sauber, Desktop unverändert, Konsole/Typecheck grün.

---

## Konsolidierungs-Phase N1 — Eine Niederschlags-Ansicht (Radar↔Modell, 0–12 h) (Gate GN1)

**Konsolidierung/Refactor + Stilllegung von SIM-Radar (F3), von Jan beauftragt.** Maßgebliche Vorgabe: `audit/niederschlag-vereinheitlichung.md`. Umsetzung separat über die CLI.

**Design-Entscheidung Jan (2026-07-24):** Die 2–12-h-Modellhälfte bleibt der bestehende **Fusion-/Modell-Niederschlag (mm/h)** — *nicht* dbz_cmax-Reflektivität. Damit wird SIM-Radar stillgelegt.

**Kernbefund der Diagnose:** Der Radar→Modell-Blend **existiert bereits** als `nowcast`-Layer (0–2 h Radar per Land: DE RADOLAN-RV / AT INCA / CH rzc; >2 h Fusion-Modell; gemeinsame `precipRainRamp`). Die Umschaltung ist heute nur über `precipFrameReady()` + Sichtbarkeits-Booleans verstreut. Aufgabe = konsolidieren, nicht neu bauen.

**Ziel:** Eine Ansicht „Niederschlag" jetzt … +12 h, nahtlos, UI ohne Radar/Modell-Kenntnis.

**Umzusetzende Maßnahmen (Kurzfassung, Details Spec §6):**
1. **N1-1** `src/nowcast/precipSource.ts` — `resolvePrecipSource(hour, country, avail)` (reine Abstraktion, zieht `precipFrameReady` + Radar/Modell-Visibility zusammen).
2. **N1-2** `scripts/verify-precip-source.mjs` (Node strip-types, kein Vitest).
3. **N1-3** `MapView.tsx` — Sichtbarkeit `NOWCAST_LAYER_ID` ↔ `precip-forecast` **ausschließlich** aus `resolvePrecipSource`.
4. **N1-4** Seam-Crossfade (~2 h) + Lücken-Sicherung (nie leer) + volle 0–12-h-Timeline.
5. **N1-5** SIM-Radar restlos entfernen (Spec §5: ~15 Seams + `iconD2Dbz.ts`; F3-Doku als „stillgelegt" markieren).
6. **N1-6** `nowcast`-Label/Tooltip → „Niederschlag · jetzt–12 h (Radar → Modell, nahtlos)".
7. **N1-7** Doku (README/`docs/niederschlag-architektur.md`): Architektur, Datenfluss, Quellen, Umschaltlogik, 0–12 h.

**Explizit außerhalb / Erhalt:** Fusion-Engine-**Logik** (`src/fusion/*`), Loader/Decode, `RainLayer`/`ScalarLayer`-Renderer (nur Sichtbarkeit koordinieren, kein neuer Renderer), `flownowcast`, `poprob`, Model-Switcher DE/AT/CH, Fusion⇄Native, `radarModel.ts`, Regenradar-Feature. **STOPP & FRAGEN**, falls die Konsolidierung einen Eingriff in die Fusion-*Berechnung* nahelegt.

**Autorisierte STOPP-Punkte (durch Jans Auftrag):** Löschen der SIM-Radar-Komponente; Berühren der Radar-/Fusion-*Verdrahtung* (nicht -Logik).

**Verify:** tests.md → V-NIEDERSCHLAG.
**Gate GN1:** Abstraktion grün + zentral, Slider 0–12 h nahtlos (Seam weich, keine Lücke), Output-Identität belegt, SIM-Radar restlos entfernt, Fusion-Logik/`flownowcast`/`poprob`/Model-Switcher unverändert, UI ohne Radar/Modell-Kenntnis, Doku aktualisiert, Konsole/Typecheck grün, Desktop bis auf gewollte Änderungen unverändert.

---

## Infrastruktur-Phase T2c — Prod-Manifest-Advance-Fix (Gate GT2c)

**Top-Hebel aus dem Live-Audit (Finding 1).** Maßgebliche Vorgabe: `audit/layer-transport.md` **§J**. Umsetzung via CLI (Code-Seite); Prod-Verifikation = Jans Gate.

**Befund:** Der `warm-grib`-Cron wärmt in Prod den aktuellen Lauf (18z), aber Prod liefert weiter den einkommitteten **localhost-Seed** `latest-grib.json` (2D-Lauf 15z) → alle Clients laden die **ungewärmten** 15z-Dateien (117/117 `fwd=stale`, ~100 MB/Session). Wind advanced korrekt. `warmedThroughProxy: localhost` ⇒ der Prod-Cron hat das Grib-Manifest **nie** committet.

**Prime-Hypothese:** Push-Race — `warm-wind.yml` + `warm-grib.yml` identisch, beide `git push` **ohne** `pull --rebase`, **gleicher `*/15`-Zeitplan**; Grib ist langsamer → pusht nach Wind in ein bewegtes `main` → non-fast-forward-Reject, kein Retry → landet nie.

**Umzusetzende Maßnahmen (Kurzfassung, Details §J.1):**
1. **T2c-1** Ursache aus GitHub-Actions-Logs bestätigen (Race / Branch-Protection / Fail-Safe / nie gelaufen).
2. **T2c-2** Commit-Back race-sicher: `git fetch + rebase origin/main` + Retry vor `push`, in **beiden** Workflows (disjunkte Dateien → konfliktfrei); optional Cron-Zeitpläne entzerren.
3. **T2c-3** (optional, robust) Manifest via **Netlify Blobs** statt Repo-Commit — kein Race/Rebuild/Branch-Protection.
4. **T2c-0** (interim) erster Advance-Commit überschreibt den Seed; `workflow_dispatch` erzwingt die erste Landung.

**Explizit außerhalb:** Client-Code (`gribManifest.ts`/Loader), Decode/Shader/Fusion. Output-identisch (nur frischerer Lauf).

**Verify:** tests.md → V-TRANSPORT-2c. 🔴 Jans Gate: Branch-Protection + Live-Cron-Zyklus.
**Gate GT2c:** Prod-`latest-grib.json` = aktueller Lauf + `warmedThroughProxy`=Prod-URL (nicht localhost); 2D-Kaltload = Edge-HITs (nicht `fwd=stale`); 2D-Lauf == Wind-Lauf; keine `git push`-Rejects mehr.
