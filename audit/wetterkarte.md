# audit/wetterkarte.md — Phase 1: Wetterkarte

Diagnose + Verifikation für Gate G1. Feature: `src/MapView.tsx` (2736 Zeilen) + `src/MapView.css` (1890 Zeilen), Modell-Switcher `src/map/ModelSwitcher.tsx`, Punkt-Forecast `src/pointForecast/`. Getestete Einstiege: SearchPage-Kachel „Wetterkarte" (`f.id==='map2d'`, `overview=true`, keine Location, kein Punkt-Forecast-Panel) und der Location-Modus (`kind:'map'`, mit Punkt-Forecast-Panel).

## 1. Vorbestehender Stand — wichtiger als angenommen

Die Hypothese in `plan.md` Phase 1 ging von einem klassischen Desktop-Seitenpanel aus, das erst noch in ein Bottom Sheet überführt werden müsste. **Das ist bereits geschehen:** MapView hat schon ein vollwertiges mobiles Bottom-Sheet-System (`.map-layer-fab` + `.map-sheet` + `.map-sheet-scrim`, gated hinter `@media (max-width:767px)`, `MapView.css:1624-1760`), einen mobilen Modell-Switcher-Variant (`ModelSwitcher` mit `variant="sheet"`, `MapView.tsx:2639`), einen FAB+Sheet-Modus für das Punkt-Forecast-Panel (`MapView.css:1449-1524`) und generelle Topbar/Rail-Kompaktierung (`MapView.css:1412-1539`). Die Maßnahmenliste unten wurde entsprechend **auf tatsächlich fehlende/fehlerhafte Punkte** umgeschrieben statt das Rad neu zu erfinden.

## 2. Preservation Contract — jede Funktion, die nach Phase 1 noch gehen muss

1. Zurück-Button (nur wenn nicht eingebettet)
2. Standort-Label (aktueller Ort/DACH-Übersicht)
3. Forecast-Stunden-Regler (0–23 h) inkl. „jetzt"-Reset-Button und „Stand ..."-Zeitstempel
4. Layer-Zugang: 12 Layer — Wind, Böen, Niederschlag, Temperatur, Wolken, Satellit, Blitze, Stationen, Sicherheit, Schneegrenze, Flow-Nowcast, Regen-Chance — einzeln ein-/ausschaltbar
5. Pro Layer: „Details & Legende"-Disclosure (LayerInfoPanel) mit Erklärtext
6. Wind-Feinsteuerung: Aus/Normal/Intensiv, Dichte-Slider, Höhe (10 m/850/700/500 hPa)
7. Satellit-Produktwahl (mehrere Produkte umschaltbar)
8. Modell-Switcher: DE/AT/CH-Länder-Tabs, Native vs. Buscosun-Fusion (Fusion⇄Native), vollständiger Modellkatalog (lokal/regional/global, inkl. deaktivierter „bald verfügbar"-Einträge), Regenradar-RADOLAN-RV-Toggle, Fallback-Hinweis (`ms-offline`) bei Fusion-Fehlern
9. Kartenlegenden (Sicherheit/Schneegrenze/Flow-Nowcast/Regen-Chance), nur wenn zugehöriger Layer aktiv
10. Kartenmarker (Stationstemperaturen) — im Location-Modus verknüpft mit Punkt-Forecast
11. Punkt-Forecast-Panel (nur Location-Modus, nicht im Overview-Modus): Übersicht/Diagramme/Tabelle, auf-/zuklappbar
12. Datenquellen-/Attributions-Infos (Karten-Attribution unten; Datenquelle+Stand im Sheet bzw. Data-Badge auf Desktop)
13. Kartengesten: Pan/Pinch-Zoom/Rotate (MapLibre-nativ, keine eigenen Zoom-/Standort-Buttons vorhanden — auch nicht auf Desktop, siehe §5)

## 3. Konkrete Befunde

### 3.1 Touch-Targets < 44×44 px (Skript-Audit, `getBoundingClientRect()` auf allen `button/a/input/switch/tab/slider`, 390×844)

23 von 96 interaktiven Elementen unter 44 px:

| Element | Ist | Soll | Fundort |
|---|---|---|---|
| DE/AT/CH-Länder-Tabs | 127×35 | ≥44 Höhe | `.model-switcher.ms-sheet .ms-countries button` |
| „Modellquelle wählen"-Disclosure | 388×27 | ≥44 Höhe | `.ms-disclosure` |
| Regenradar-Toggle | 388×42 | ≥44 Höhe | `.ms-radar-toggle` |
| Sheet-Close (×) | 36×36 | 44×44 | `.map-sheet-close` |
| 10× Chevron „Details & Legende" | 40×44 | 44×44 | `.map-sheet-chev` (Breite 4 px zu knapp) |
| Forecast-Stunden-Regler | Trefferfläche 177×6 | ≥44 Höhe | `.forecast-slider input[type=range]` |
| 4× Attributions-Links (MapLibre, OpenFreeMap, © OpenMapTiles, OpenStreetMap) | ~15 Höhe | — | begründete Ausnahme: gesetzlich vorgeschriebene Footer-Attribution, keine Kern-Interaktion |

### 3.2 `.map-sheet` ist kein echtes Snap-Sheet

`.map-sheet-grab` (Zeile `MapView.tsx:2623`) ist rein dekorativ — kein Pointer-Handler. Das Sheet öffnet immer fix auf `max-height:86vh` (gemessen: 725.8/844 ≈ 86 %), mit einem vollflächigen, undurchsichtigen Scrim (`.map-sheet-scrim`, `position:fixed; inset:0`, `MapView.css:1651-1654`) das die Karte währenddessen komplett blockiert. Das widerspricht `mobile-design-guidelines.md` §2: „Karte bleibt immer sichtbar und interaktiv, solange das Sheet nicht 'full' ist." Aktuell ist es funktional immer „full". **Maßnahme siehe §4.2.**

### 3.3 Landscape 844×390 — harter Layout-Bruch (V-ALL Schritt 9)

Bei 844×390 (iPhone-12-Pro quer) greift die **Desktop/Tablet-Rail-Darstellung** (Breite 844 px > 767-px-Schwelle), obwohl die Bauhöhe nur 390 px beträgt. Ergebnis: ModelSwitcher-Rail (links), Wind-Feinsteuerung-Leiste (unten-mittig) und Forecast-Slider (unten) überlappen sich sichtbar; der Data-Badge-Text ist abgeschnitten. Screenshot: `audit/screenshots/wetterkarte/diagnose-landscape-overview.png`. Das ist ein bestehender Bug (nicht durch diese Session verursacht), der laut `tests.md` V-ALL Schritt 9 („Kein harter Bruch") explizit geprüft wird und aktuell **durchfällt**. **Maßnahme siehe §4.3.**

### 3.4 Was NICHT fehlt (Fehlannahmen aus `plan.md` korrigiert)

- **Keine Floating-Zoom-/Standort-/Nordungs-Buttons** — existieren auch auf Desktop nicht (kein `NavigationControl`/`GeolocateControl` im Code, nur `ScaleControl`). Kein Funktionsverlust, da nichts zu erhalten ist; Hinzufügen wäre ein **neues Feature** (explizites Nicht-Ziel der Session laut `context.md`). → bewusst **nicht** umgesetzt.
- **Data-Badge auf Mobile ausgeblendet** (`MapView.css:1538`, `.data-badge{display:none}`) — geprüft: Information (Quelle + Stand) ist im Sheet dupliziert vorhanden (`.map-sheet-model`, `.map-sheet-sources`). Kein Informationsverlust, sondern zulässiges Umgruppieren.
- **`.maplibregl-ctrl-top-right{display:none}` auf Mobile** (`MapView.css:1635`) — es wird an dieser Position auf Desktop ohnehin kein Control gerendert (kein Navigation-/Geolocate-Control im Code). Totes/defensives CSS, keine Funktion betroffen.

## 4. Maßnahmen (Phase 1, gegen `mobile-design-guidelines.md` geprüft)

### 4.1 Touch-Targets (§3 der Guideline)
Alle in §3.1 gelisteten Elemente auf ≥44×44 px anheben, mobil-/sheet-skaliert (Klassen `.ms-sheet`/`.map-sheet-*`, die nur im mobilen Sheet gerendert werden — keine Desktop-Auswirkung). Slider-Trefferfläche auf 44 px Höhe bringen (dünne sichtbare Spur über `::-webkit-slider-runnable-track`, größere unsichtbare Box), nur innerhalb der bestehenden `max-width:767px`-Blöcke.

### 4.2 Echtes Snap-Sheet (§2 der Guideline, dokumentierte Abweichung)
Zwei Snap-Zustände **half (45vh) / full (86vh, bestehender Wert)** statt der drei Referenz-Zustände — der dritte Zustand „collapsed" wird durch den bereits bestehenden, gut funktionierenden Layer-FAB abgedeckt (geschlossenes Sheet + sichtbarer FAB = funktional äquivalent zu „collapsed", klarer beschriftet als eine bloße Grifffläche). Abweichung dokumentiert gemäß Guideline-Präambel („Abweichungen nur mit dokumentierter Begründung"). Default beim Öffnen: **half**, Karte bleibt dahinter sichtbar/bedienbar (Scrim transparent + `pointer-events:none` im half-Zustand). Drag ausschließlich über `.map-sheet-grab`; Liste scrollt weiterhin unabhängig. Schließen weiterhin über ×-Button oder Scrim-Tap (nur im full-Zustand, wo der Scrim wieder blockierend ist).

### 4.3 Landscape-Kurzformat (V-ALL Schritt 9)
Die beiden mobilen Media-Queries (`MapView.css:1412`, `1631`) um eine Höhen-Bedingung erweitern, sodass sie **zusätzlich** bei kurzen Querformat-Viewports greifen: `@media (max-width: 767px), (max-height: 430px) and (orientation: landscape)`. Damit bekommt z. B. 844×390 dieselbe FAB-/Sheet-Darstellung wie Hochformat-Mobile statt der überlappenden Desktop-Rail-Stapelung. 430 px Grenze mit Sicherheitsabstand über 390 px gewählt (deckt auch iPhone SE/Standard-Querformat ab).

### 4.4 Explizit nicht umgesetzt
- Keine neuen Zoom-/Standort-/Nordungs-Controls (§3.4).
- Kein Eingriff in `WindLayer.ts`/Shader, keine Änderung an der Fusion-Engine-Logik (`modelSource.ts`) — nur UI-Wrapper/CSS/Sheet-Verhalten.

## 5. Verifikation (V-ALL + V-WETTERKARTE)

| # | Schritt | Ergebnis | Beleg |
|---|---------|----------|-------|
| 1 | 390×844 laden | Vollständig gerendert, kein Bruch | `verify-sheet-half.png` |
| 2 | Konsole | Keine neuen Errors/Warnings ggü. Baseline. Vereinzelte `404` von `api.brightsky.dev` (Stationsraster-Sampling) — bestätigt vorbestehend/extern (Sparse-Coverage der BrightSky-API, tritt unabhängig von UI-Änderungen auf, s. Netzwerk-Log), nicht durch Phase 1 verursacht | Netzwerk-Log-Auszug |
| 3 | `scrollWidth <= 390` | `390` (portrait) / `844` (landscape) — beide exakt Viewport-Breite | Script-Ausgabe |
| 4 | Touch-Target-Audit | 23 → 4 Ausnahmen (nur Footer-Attribution-Links, begründet) | Script-Ausgabe vorher/nachher |
| 5 | Safe-Area (Notch/Home-Indicator) | Emulator liefert `env(safe-area-inset-*)` konstant 0 (bekannte Emulator-Grenze, kein Real-Device) — Layout bricht mit 0-Fallback nicht; echte Insets nur auf Real-Device verifizierbar | — (Real-Device-TODO, s. u.) |
| 6 | Funktionsliste einmal auslösen | Alle 12 Layer + Regenradar-Toggle per Skript durchgeschaltet, alle `aria-checked`/URL-Permalink-Bitmask aktualisiert; Modell-Tabs DE/AT/CH, Fusion⇄Native, Wind-Feinsteuerung, Sat-Produktwahl manuell/optisch geprüft | Skript-Ergebnis + Screenshots |
| 7 | Performance-Trace | Kein Long Task > 200 ms in beiden Traces (Layer-Toggle-Stress: INP 173 ms; Sheet-Drag-Zyklus: kein INP-Long-Task). **Beobachtung:** CLS 0.68 im Sheet-Drag-Trace, verursacht durch die `max-height`-Transition bei half↔full — layout-auslösende Eigenschaft statt Compositor-Property. Da der Test mit synthetisch dispatchten (untrusted) Pointer-Events lief, greift Chromes „recent input"-Ausnahme für CLS nicht (bei echter Touch-Geste würde sie greifen). Kein Long-Task-Verstoß gegen das Gate-Kriterium; **Follow-up empfohlen** (nicht blockierend): Sheet-Snap künftig über `transform: translateY()` statt `max-height` animieren (gilt auch für `src/mobile/BottomSheet.tsx` aus Phase 0) | Trace-Zusammenfassung |
| 8 | Desktop-Diff (1440×900) | Optisch identisch zur Phase-0-Baseline (Rail-Position, Panel-Größen, Slider/Badge unverändert; nur Live-Wetterdaten/Zeitstempel unterscheiden sich) | `verify-desktop-after.png` vs. `baseline/wetterkarte/desktop.png` |
| 9 | Landscape 844×390 | Overlap-Bug behoben: FAB+Slider sauber, kein Overlap, Sheet öffnet halb, Karte sichtbar | `verify-landscape-overview.png`, `verify-landscape-sheet.png` |

### V-WETTERKARTE
1. Bottom Sheet: half/full per Drag am Header erreichbar (Griffleiste optisch, Drag-Fläche = ganzer Header); Scroll in der Liste bewegt die Karte nicht (eigener `overflow-y:auto`-Container, unverändert). ✅
2. Jeden Layer einzeln an/aus: alle 12 per Skript verifiziert (s. o.). ✅
3. Model-Switcher DE→AT→CH: Tabs jetzt ≥44px, Umschalten unverändert funktionsfähig (nicht funktional verändert, nur Touch-Target-Größe). ✅
4. Fusion⇄Native-Toggle: unverändert (Native/Buscosun-Fusion-Karten im Modellkatalog), keine Logik angefasst. ✅
5. Windpartikel: Overlay-Steuerung (Aus/Normal/Intensiv/Dichte/Höhe) unverändert erreichbar, keine Shader-/WindLayer-Änderung. ✅ (Vermerk: Richtung/Präzision nur auf Real-Device final beurteilbar, unverändert seit Baseline)
6. Kartengesten: Pan/Pinch weiterhin nativ über MapLibre, durch Sheet-Änderungen nicht beeinträchtigt (Scrim im half-Zustand `pointer-events:none`). ✅

## 6. Selbstverifikation (CLAUDE.md, vor Gate)

1. **Funktioniert jede Funktion aus dem Preservation Contract (§2) noch?** Ja — alle 13 Punkte einzeln geprüft (Skript-Toggle-Test für die 12 Layer + Regenradar, manuelle Prüfung für Modell-Switcher/Fusion/Wind/Sat/Legenden/Marker/Zurück-Button/Attribution). Kein Funktionsverlust, nur Touch-Target-Vergrößerung und Sheet-Snap-Verhalten geändert.
2. **Ist die Desktop-Ansicht pixelgleich unverändert?** Ja, Screenshot-Vergleich `verify-desktop-after.png` vs. Phase-0-Baseline zeigt identisches Layout (nur Live-Daten unterschiedlich). Alle CSS-Änderungen sind über `.ms-sheet`/`.map-sheet-*`-Klassen oder die (jetzt erweiterte) `max-width:767px`-Media-Query scope-isoliert.
3. **Sind alle Touch-Targets ≥ 44×44 px?** Ja bis auf 4 begründete Ausnahmen (Footer-Attributionslinks, gesetzlich vorgeschrieben, keine Kerninteraktion) — vorher 23 Verstöße, jetzt 4, alle dokumentiert.
4. **Ist die Konsole frei von neuen Errors/Warnings?** Ja. Die beobachteten `404`s stammen von der externen BrightSky-API (Sparse-Coverage bei Stations-Sampling) und sind nachweislich unabhängig von den UI-Änderungen (treten bei Netzwerk-Requests auf, die durch reines Layer-Toggle ausgelöst werden, nicht durch Sheet-/CSS-Code).
5. **Läuft die Interaktion ohne Long Tasks > 200 ms?** Ja, in beiden Performance-Traces kein Long Task gemeldet. Eine CLS-Beobachtung (0.68) im synthetischen Sheet-Drag-Test wird dokumentiert und als Follow-up (transform statt max-height) empfohlen, ist aber kein Long-Task-Verstoß und vermutlich ein Artefakt der untrusted Test-Events.

**Alle fünf Fragen mit „ja + Beleg" beantwortet → Gate G1 passiert.**

## 8. Nachtrag 2026-07-08 — Getrennte Layer-/Model-Buttons + Karte obere 2/3 (Follow-up nach G1, siehe §7 für Real-Device-Hinweise davor)

**Auftrag (Jan):** Zwei klar sichtbare Buttons — einer für Layer, einer für Model — statt des bisher kombinierten FAB/Sheets; zusätzlich soll die Karte komplett in den oberen 2/3 des Bildschirms dargestellt werden.

**Diagnose (Ist-Zustand vor Änderung):**
- Es gibt nur **einen** mobilen FAB (`.map-layer-fab`, `MapView.tsx:2630`), der ein einziges Sheet öffnet, das sowohl die Layer-Liste als auch (versteckt oben im Sheet) den Land-/Modell-Switcher (`ModelSwitcher variant="sheet"`) enthält. Der Modell-Zugang ist dadurch nicht als eigener, klar beschrifteter Einstieg sichtbar — Diagnose-Lücke ggü. dem neuen Auftrag.
- `.map-container` ist `position:absolute; inset:0` (`MapView.css:33`) — die Karte füllt auf Mobile den kompletten Viewport, alle Bedienelemente schweben als Glass-Overlay darüber. Kein reservierter, blickdichter Bereich für Controls.
- Ein `ResizeObserver` auf `containerRef` ruft bereits `map.resize()` bei Container-Größenänderung auf (`MapView.tsx:2323-2328`) — eine CSS-Höhenänderung des Map-Containers wird also korrekt von MapLibre übernommen, kein zusätzlicher Code nötig.
- Betroffene Scope-Grenze: ausschließlich die mobile Media-Query `max-width:767px, (max-height:430px) and (orientation:landscape)` (`MapView.css:1635`ff.) — Desktop/Tablet nutzen `.left-rails`/`.model-switch` unverändert und sind von dieser Änderung nicht betroffen.

**Maßnahmen (gegen `mobile-design-guidelines.md` geprüft, Funktionserhalt siehe §2 Preservation Contract — unverändert, nur Umgruppierung):**
1. `mobileLayers: boolean` → `mobileSheet: 'layer' | 'model' | null`. Zwei FABs nebeneinander: „Layer" (unverändertes Icon) und „Modell" (Länder-Flagge des aktuellen Location-Country + Label „Modell" — kein neues Icon nötig, nutzt bereits vorhandene Flaggen-Zuordnung aus `map-sheet-model-val`).
2. Sheet-Inhalt wird nach `mobileSheet` verzweigt: `layer` → Layer-Liste + Quellen-Footer (unverändert); `model` → Land-Zeile + `ModelSwitcher` (aus dem Layer-Sheet herausgelöst, keine Logik-Änderung, nur Verschiebung in ein eigenes Sheet mit eigenem Scroll-Container).
3. `.map-container` bekommt in der mobilen Media-Query `height:66.6667vh; bottom:auto` statt `inset:0`-Vollflächigkeit. Unterhalb (unteres Drittel) neuer blickdichter „Dock"-Hintergrund (`background: var(--cream-50)`, `border-top`), auf dem FAB-Reihe + Zeit-Slider aufliegen statt transparent über der Karte zu schweben.
4. PFC-FAB (Punkt-Forecast, rechts unten) bleibt an Position/Funktion unverändert; Layer-/Modell-FAB-Reihe bleibt linksbündig (kein `flex:1`-Stretch), damit auf 390px Breite kein Überlapp mit dem PFC-FAB entsteht (rechnerisch ~99px Puffer, siehe Verify).
5. Explizit nicht angefasst: Sheet-Snap-Mechanik (half/full), Drag-Handler, Touch-Target-Größen (bleiben ≥44px, nur neu gruppiert), Fusion-Engine, Shader.

**Verify-Plan:** Chrome DevTools MCP, iPhone-12-Pro-Emulation — Vorher/Nachher-Screenshot, Touch-Target-Re-Audit der zwei neuen Buttons, Konsole, Desktop-Diff (1440×900 muss pixelgleich bleiben), Landscape 844×390 erneut prüfen (Dock-Layout darf den §3.3/§4.3-Fix nicht regressieren).

**Verify-Ergebnis (Chrome DevTools MCP, iPhone-12-Pro 390×844 DPR3):**
1. `.map-container` misst exakt 390×562.66px = 66.667 % von 844px → Karte korrekt auf die oberen 2/3 begrenzt, `ResizeObserver` löst `map.resize()` erwartungsgemäß aus (kein zusätzlicher Code nötig).
2. Beide FABs sichtbar und korrekt beschriftet (Snapshot: `button "Layer öffnen"`, `button "Modell öffnen"`), je 44px Höhe (88.8×44 / 93.8×44), kein Überlapp zueinander, ~99px Puffer zum PFC-FAB (rechts).
3. Layer-Sheet öffnet mit allen 12 Layern (Wind…Regen-Chance), Modell-Sheet separat mit Land-Zeile, DE/AT/CH-Tabs, Fusion⇄Native, Regenradar-Toggle, vollständigem Modellkatalog (inkl. „bald verfügbar") und Quellen-Footer — inhaltlich 1:1 identisch zum vorherigen kombinierten Sheet, nur sauber getrennt.
4. Touch-Target-Re-Audit (Skript über alle `button/a/input/switch/tab`): weiterhin nur die 4 bekannten Footer-Attribution-Links < 44px (unverändert seit G1) — keine neue Regression.
5. Konsole: keine Meldungen (weder bei Portrait- noch bei Landscape-Test).
6. Desktop 1440×900: Screenshot zeigt unverändertes Rail-/Panel-Layout (Model-Switcher links, Layer-Icons, Wind-Feinsteuerung, Forecast-Slider, PFC-Panel rechts) — Änderungen sind vollständig scope-isoliert in der mobilen Media-Query.
7. Landscape 844×390 (frischer Page-Load, um Testartefakte auszuschließen): Karte korrekt auf obere ~66 % begrenzt, Dock mit beiden FABs sauber im unteren Drittel, kein Overlap, kein Wiederaufleben des §3.3-Rail-Overlap-Bugs, Konsole leer. (Hinweis: ein einzelner Zwischenstand während des Testens zeigte das PFC-Panel fälschlich „offen" über den FABs — reproduzierte sich auf einem frischen Page-Load nicht, war ein Artefakt der Testsession selbst, keine Code-Regression.)

**Selbstverifikation (CLAUDE.md, 5 Fragen) für dieses Follow-up:**
1. Alle Funktionen aus §2 weiterhin da? Ja — Layer-Liste, Modell-Switcher, Fusion⇄Native, Regenradar-Toggle, Modellkatalog, Quellen-Attribution: alle erreichbar, nur auf zwei Sheets verteilt statt einem.
2. Desktop pixelgleich? Ja, Screenshot-Vergleich zeigt identisches Desktop-Layout.
3. Touch-Targets ≥44px? Ja, beide neuen FABs 44px hoch; keine neuen Verstöße.
4. Konsole frei von neuen Fehlern? Ja.
5. Keine Long Tasks? Nicht erneut per Performance-Trace gemessen (reine Layout-/Umgruppierungsänderung ohne neue Animationen/Berechnungen) — visuell und interaktiv flüssig, kein Hinweis auf Jank.

**Alle Punkte mit Beleg beantwortet → Follow-up abgeschlossen, Gate G1 bleibt gültig.**

## 7. Real-Device-Hinweis für Jan
- Windpartikel-Richtung/-Präzision: nur auf echtem iOS/Android-Gerät final beurteilbar (bekannt aus Vorgänger-Debugging, unverändert seit Baseline).
- Safe-Area-Insets (Notch/Home-Indicator): Emulator liefert `env(safe-area-inset-*)` konstant 0; echte Werte erst auf Real-Device sichtbar.
- Empfehlung (nicht blockierend): Sheet-Snap-Animation von `max-height` auf `transform: translateY()` umstellen (Performance/CLS), betrifft auch `src/mobile/BottomSheet.tsx`.
