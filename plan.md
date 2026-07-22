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
**Gate GT2:** Bytes je Param identisch (Proxy vs. direkt), Durable-Header, Manifest-Gate eliminiert Directory-Scans + spekulative Fehl-Fetches je Layer, Output visuell/numerisch identisch, Konsole/Typecheck grün, `/_dwd_opendata`+`/_dwd_wind` unberührt (Diff-Beleg).
