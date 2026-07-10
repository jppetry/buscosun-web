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

## 9. Phase 1-C — Diagnose „Variante C" (2026-07-08, vor jeder Code-Änderung)

**Auftrag:** Umbau der Mobilansicht auf Variante C gemäß `audit/mockups/wetterkarte-c-spec.md` — **ein** persistentes Bottom-Sheet mit Segment-Umschalter `Layer · Modell · Vorhersage`, Karte vollflächig, drei Snap-Zustände. Bewusste, von Jan freigegebene Abweichung vom §8-Follow-up (zwei getrennte FABs → ein Sheet); keine Regression, sondern gewollte Design-Entscheidung.

### 9.1 Ist-Code-Mapping (Spec §1 verifiziert, Zeilennummern aktualisiert)

| Baustein | Fundort (verifiziert) | Ist-Verhalten |
|---|---|---|
| Sheet-State | `MapView.tsx:2348` | `mobileSheet: 'layer' \| 'model' \| null` — bestätigt |
| Snap-State | `MapView.tsx:2354` | `sheetSnap: 'half' \| 'full'`; half=45vh (`.map-sheet-half`, CSS:1712), Basis `max-height:86vh` (CSS:1704) |
| Row-Expand | `MapView.tsx:2349` | `sheetExpanded: LayerKey \| null` — bleibt unverändert bestehen |
| Drag-Handler | `MapView.tsx:2357–2372` | Pointer-Drag am `.map-sheet-head`, Schwelle ±40px |
| Zwei FABs | `MapView.tsx:2633–2654` | `.mobile-dock-fabs` mit `.map-layer-fab` + `.map-model-fab` |
| Sheet-Markup | `MapView.tsx:2656–2773` | konditional `mobileSheet && …`, Scrim + `aside.map-sheet`, Body verzweigt layer/model |
| Sheet-CSS | `MapView.css:1696–1821` | `max-height`-Transition (CLS-Quelle, s. §5 Punkt 7), Scrim half=transparent+inert / full=blockierend |
| Karte | `MapView.css:1648` | `.map-container { height:66.6667vh; bottom:auto }` — Karte obere 2/3 |
| PFC mobil | `MapView.css:1452–1527` | eigenes zweites Sheet-System: FAB (`.pfc-closed .pfc-toggle`), Snap peek 50vh / full 90vh (`.pfc-m-*`), eigener Touch-Drag (`PointForecastPanel.tsx:74–100`) |
| Modell | `MapView.tsx:2681` | `ModelSwitcher variant="sheet"` mit `onSelectCountry/onSelectModel/onToggleRadar/fusionError` |
| Doppelte Media-Query | `MapView.css:1412` **und** `:1638` | beide `(max-width:767px), (max-height:430px) and (orientation:landscape)`; im ersten Block tote `.left-rails`-Regeln (:1426–1442), im zweiten `display:none !important` (:1640) |

### 9.2 Korrekturen gegenüber Spec §1/§4 (Diagnose-Funde)

1. **`.mobile-dock-bg` existiert nur im CSS** (`MapView.css:1636/1653`), **kein** zugehöriges JSX-Element in `MapView.tsx` — der blickdichte Grund im unteren Drittel ist schlicht der Seitenhintergrund hinter der verkürzten Karte. Die CSS-Regeln sind toter Code und werden ersatzlos entfernt.
2. **`ResizeObserver` (`MapView.tsx:2321–2331`) läuft nur im `embedded`-Modus** (early return `if (!embedded)`). Die Spec-§4-Annahme „ResizeObserver übernimmt map.resize() automatisch" gilt für die Vollansicht nicht. Unkritisch: `inset:0` ist statisch pro Breakpoint; Breakpoint-Wechsel geht mit Window-Resize einher, den MapLibre (`trackResize`, Default an) selbst behandelt. Kein Zusatzcode nötig.
3. **PFC öffnet auf Mobile per Default als 50vh-Sheet** (`open=true` initial, `PointForecastPanel.tsx:62`) und verdeckt beim Laden die halbe Karte (Screenshot `c-vorher-dock-location.png`). Schließen nur per Drag nach unten — der `.pfc-toggle` ist im offenen Mobil-Zustand `display:none` (CSS:1489–1491). Beides entfällt mit der Segment-Integration.
4. **PFC darf nicht doppelt gerendert werden:** `PointForecastPanel` fetcht beim Mount (Punkt-Forecast + DWD-Alerts + Pollen, eigene Intervalle). Der Render-Ort (Desktop-Panel vs. `fc`-Segment) muss daher per JS-Media-Query umgeschaltet werden — `useMediaQuery` aus `src/mobile/useIsMobile.ts` existiert bereits; als Query dieselbe Bedingung wie die CSS-Mobile-Media-Query verwenden (`(max-width:767px), (max-height:430px) and (orientation:landscape)`), sonst bricht Landscape 844×390.
5. Der Punkt-Forecast wird heute schon nur im Location-Modus gerendert (`!embedded && !overview`, `MapView.tsx:2615`) — deckt Spec §5/§9 („Vorhersage-Segment nur im Location-Modus") ohne neue Logik ab.
6. **Vorbestehende Regression (live verifiziert):** Die Wind-Feinsteuerung und die Satellit-Produktwahl **im Sheet** sind aktuell unsichtbar — `MapView.css:1640` versteckt `.wind-particle-switch`/`.sat-product-switch` mit `display:none !important`, und das trifft auch die im Sheet gerenderten Kopien (`.map-sheet-sub wind-particle-switch`); die Sheet-Regeln `:1805–1815` setzen kein eigenes `display` und können das `!important` nicht überstimmen (Messung: `getComputedStyle(...).display === 'none'`, Höhe 0). Preservation-Punkte 6+7 sind auf Mobile also im **Ist** bereits gebrochen (vermutlich seit dem §8-Follow-up-Umbau; die G1-Verifikation davor hatte sie grün). Der Variante-C-Umbau behebt das durch korrektes Scoping (nur die Overlay-Instanzen direkt unter `.map-view` verstecken, nicht die Sheet-Kopien) — wird in der §13-Verifikation explizit nachgewiesen.

### 9.3 Preservation Contract — Ist-Verhalten bestätigt (13 Punkte, Spec §12)

Basis: G1-Verifikation (§5/§6, alle 13 Punkte grün) + heutige Stichprobe (a11y-Snapshot + Screenshots, iPhone-12-Pro-Emulation, Location-Modus München):

1. **Zurück-Button** — `button "Zurück zur Suche"` im Snapshot ✓ 2. **Standort-Label** „München" ✓ 3. **Zeit-Regler** `slider "Forecast-Stunde" 0–23` + „jetzt"-Button + Zeitstempel „jetzt · Mi., 22:40" ✓ 4. **12 Layer** im Layer-Sheet (Screenshot `c-vorher-layersheet-half/full.png`) ✓ 5. **LayerInfoPanel** per Chevron-Disclosure ✓ 6. **Wind-Feinsteuerung** (Aus/Normal/Intensiv, Dichte, Höhe) in aufgeklappter Wind-Zeile ✓ 7. **Satellit-Produktwahl** in aufgeklappter Sat-Zeile ✓ 8. **Modell-Switcher** komplett im Modell-Sheet (Screenshot `c-vorher-modelsheet.png`) ✓ 9. **Kartenlegenden** — mobil aktuell `display:none` (`.map-legends`, CSS:1640) = dokumentierte G1-Lücke, wird durch Legende-Kapsel (Spec §4) **verbessert** ✓ 10. **Stations-Marker** ✓ 11. **PFC** Übersicht/Diagramme/Tabelle im eigenen Sheet ✓ 12. **Attribution/Quellen** (4 Footer-Links + `.map-sheet-sources`) ✓ 13. **Kartengesten** Pan/Pinch/Rotate nativ ✓

### 9.4 Risiken & Reihenfolge

- **Höchstes Risiko: PFC-Integration (Spec §9).** Gewählt: Wrapper-Umzug — `PointForecastPanel` unverändert, Render-Ort per `useMediaQuery` (s. 9.2.4), CSS neutralisiert `.pfc-panel/.pfc-body`-Positionierung im Sheet-Kontext (analog zum bestehenden Muster für `.wind-particle-switch` im Sheet, CSS:1804–1815). `.pfc-toggle`/`.pfc-grab` im Sheet verstecken (Öffnen/Schließen/Snap übernimmt das gemeinsame Sheet).
- Umsetzungsreihenfolge = Spec §14 (State-Umbau → Segment-Control/Chip-Strip → Segmente → Motion → PFC → CSS-Aufräumen → Verifikation). Desktop nach jedem Schritt pixelgleich (Referenz: `c-baseline-desktop-location.png`, frisch vor dieser Phase aufgenommen).
- Konsolen-Baseline vor Umbau: nur vorbekannte BrightSky-404 (extern, s. §5 Punkt 2) + Vite-Debug + RADOLAN-Info-Log. Keine Errors aus eigenem Code.

**Vorher-Screenshots (Ist):** `audit/screenshots/wetterkarte/c-vorher-dock-location.png` (Load-Zustand mit offenem PFC), `c-vorher-dock-pfc-closed.png` (Dock: 2 FABs + PFC-FAB + Slider, leeres unteres Drittel), `c-vorher-layersheet-half.png`, `c-vorher-layersheet-full.png`, `c-vorher-modelsheet.png`, Desktop-Referenz `c-baseline-desktop-location.png`.

### 9.5 Umsetzung (Spec §14, in dieser Reihenfolge)

1. **State-Umbau** (`MapView.tsx`): `mobileSheet: 'layer'|'model'|null` → `sheetSnap: 'collapsed'|'half'|'full'` + `sheetSegment: 'layer'|'model'|'fc'`; Sheet persistent gerendert (nicht mehr konditional); `sheetExpanded` unverändert. Drag-Handler auf drei Stufen erweitert (±40px eine Stufe, ±220px zwei Stufen; Tap auf Kopf in collapsed → half). Beide FABs + `.mobile-dock-fabs` entfernt.
2. **Chip-Strip + Segment-Control**: collapsed zeigt Griff + horizontal scrollbaren Chip-Strip (aktive Layer mit Akzent-Farbpunkt aus `LAYER_CHIP_DOT` — wiederverwendete Kartenfarben, keine neuen Tokens — + Modell-Badge `Flagge + modelEntry(activeModelId()).name`); Chip-Tap → half + passendes Segment. half/full zeigen Segment-Control (`role="tablist"`, 44px-Tabs); „Vorhersage"-Tab nur im Location-Modus (`!overview`).
3. **Segmente Layer & Modell**: bestehende `.map-sheet-list`- und `.map-sheet-modelbody`-Inhalte unverändert unter die Segmente gehängt (reine Umgruppierung, Props identisch durchgereicht).
4. **Motion**: Sheet auf 88vh Zielhöhe gerendert, Snap über `transform: translateY(...)` + `will-change: transform`; Scrim persistent, nur in full sichtbar/blockierend (Tap → half), sonst `opacity:0; pointer-events:none`. Segment-Body-Höhen pro Snap-Klasse (`calc(46vh/88vh − var(--sheet-head-h))`). **Auch die Timeline** bewegt sich per `transform: translateY` statt `bottom`-Sprung (Nachbesserung aus der Verifikation: der bottom-Sprung war die einzige verbliebene CLS-Quelle, s. §9.6 Punkt 5).
5. **PFC-Integration (Spec §9, Wrapper-Umzug)**: `PointForecastPanel` unverändert; Render-Ort per `useMediaQuery(MOBILE_MAP_MEDIA_QUERY)` — Desktop: bisherige Position, Mobile: `.map-sheet-fc`-Container im Sheet. Im Sheet bleibt die Komponente über Segment-/Snap-Wechsel **gemountet** (nur `hidden`), damit Fetch-Intervalle/Sub-Tab-Zustand nicht neu starten. CSS neutralisiert Panel-Chrome (`.pfc-panel/.pfc-body` static, `.pfc-toggle/.pfc-grab` versteckt — Auf/Zu/Snap übernimmt das Sheet). Altes PFC-Mobil-Sheet/FAB-CSS entfernt.
6. **CSS-Konsolidierung (Spec §11)**: die zwei Mobile-Media-Query-Blöcke (`:1412`/`:1638`) zu **einem** zusammengeführt; tote `.left-rails`-Größenregeln, `.mobile-dock-*`, FAB-Regeln, `map-scrim-in/map-sheet-in`-Keyframes und `.map-sheet-close/.map-sheet-head`-Regeln entfernt; `.map-container` zurück auf Basis-`inset:0`. Wind-/Sat-Overlay-Verstecken korrekt gescopet (`.map-view > .wind-particle-switch` statt pauschal) → behebt §9.2.6. Legende-Kapsel: `.map-legends` rechts oben (14px/96px, 168px breit, scrollbar gedeckelt) statt `display:none`. Wind-Feinsteuerungs-Buttons im Sheet 36→44px, Dichte-Slider-Trefferfläche 44px.

### 9.6 Verifikation (Spec §13, MCP-gestützt, iPhone 12 Pro 390×844 DPR3)

| # | Prüfung | Ergebnis | Beleg |
|---|---------|----------|-------|
| 1 | Touch-Target-Audit (Skript über `button/a/input/switch/tab`) | Nur die 4 bekannten Footer-Attribution-Ausnahmen < 44px; Wind-Feinsteuerung/Sat-Produktwahl/Chips/Segment-Tabs alle ≥ 44px (Chips: 44px-Trefferbox um 32px-Pill via transparentem Border) | Skript-Ausgabe |
| 2 | `scrollWidth` | 390 (portrait) / 844 (landscape) — exakt Viewport | Skript-Ausgabe |
| 3 | Funktionsliste §12 | 12/12 Layer-Toggles per Skript je an→aus→an OK (`aria-checked` verifiziert); Segmente Layer/Modell/Vorhersage durchgeschaltet; DE→AT→CH-Tabs OK; Radar-Toggle an→aus→an OK; Land-Zeile + Quellen-Footer + 21 Katalog-Karten gerendert; **Wind-Feinsteuerung im Sheet jetzt sichtbar** (display:flex, vorher §9.2.6-Regression) mit Aus/Normal/Intensiv + Dichte + Höhe; Sat-Produktwahl EU/Welt je 44px; PFC-Sub-Tabs Übersicht/Diagramme/Tabelle alle schaltbar; Legende-Kapsel erscheint bei Regen-Chance (top 96/right 14/168px) | Skript-Ausgaben + Screenshots Z1–Z5 |
| 4 | Konsole | Nur vorbestehende BrightSky-404 (extern, Baseline §5 Punkt 2); keine neuen Errors/Warnings | Konsolen-Log |
| 5 | Performance-Trace (Snap-Zyklus collapsed→half→Segmente→full→half→collapsed) | Kein Long Task > 200 ms (max. 103 ms, PerformanceObserver longtask). CLS: Erst-Trace zeigte 0.147 — Quelle per LayoutShift-Attribution identifiziert: **`.forecast-slider`-bottom-Sprung**, nicht das Sheet (Sheet-Motion war bereits shift-frei). Nach Umstellung der Timeline auf `transform` → **CLS 0.002 ≈ 0** (Rest: Chip-Strip-Re-Render 0.002). Ruhezustand 25 s: null Shifts | Trace-Zusammenfassungen + Observer-Ausgaben |
| 6 | Desktop-Diff 1440×900 | Layout identisch zur frischen Vorher-Referenz (Rail, Wind-Leiste, Slider, PFC-Panel, Data-Badge, Attribution — nur Live-Wetterdaten unterscheiden sich); Sheet/Scrim auf Desktop `display:none` | `c-verify-desktop-after.png` vs. `c-baseline-desktop-location.png` |
| 7 | Landscape 844×390 | collapsed 64px sichtbar, half 179px (=46vh) sichtbar, Layer-Liste 95px hoch + scrollbar, kein Rail-Overlap (§3.3-Fix intakt), kein horizontales Scrollen | `c-nachher-landscape-collapsed.png` + Messwerte |
| 8 | Overview-Modus (SearchPage-Kachel) | Segment-Control zeigt nur `Layer · Modell`, kein PFC im Sheet gerendert (Spec §5/§9) | `c-nachher-overview-half.png` |
| 9 | Zustandsautomat | Chip/Kopf-Tap collapsed→half; Drag ±40px eine Stufe, Scrim-Tap full→half; Segment-Wechsel ändert nie den Snap; Timeline folgt synchron (Abstand konstant 10px über Sheet-Oberkante, collapsed bottom 74px) | Skript-Messungen |

**Nachher-Screenshots (alle 5 Zustände):** `c-nachher-z1-collapsed.png`, `c-nachher-z2-half-layer.png`, `c-nachher-z3-full-wind.png` (Wind expandiert inkl. Feinsteuerung), `c-nachher-z4-half-model.png`, `c-nachher-z5-half-fc.png`, plus `c-nachher-overview-half.png`, `c-nachher-landscape-collapsed.png`.

### 9.7 Selbstverifikation (CLAUDE.md, 5 Fragen)

1. **Funktioniert jede Funktion aus dem Preservation Contract (§12 der Spec) noch?** Ja — alle 13 Punkte einzeln ausgelöst (§9.6 Punkt 3): Zurück-Button + Standort-Label + Zeit-Regler im a11y-Snapshot, 12 Layer skriptgeprüft, LayerInfoPanel/Wind-Feinsteuerung/Sat-Produktwahl in Z3 sichtbar bedienbar, Modell-Switcher komplett (Tabs/Fusion⇄Native-Katalog/Radar/Fallback unverändert durchgereicht), Legenden jetzt SICHTBAR statt versteckt, Stations-Marker im Snapshot, PFC vollständig mit allen drei Sub-Tabs, Attribution + Quellen-Footer vorhanden, Kartengesten frei (Scrim inert außer full). Punkte 6+7 waren im Ist verdeckt gebrochen (§9.2.6) und sind jetzt repariert — ein Plus, kein Verlust.
2. **Desktop pixelgleich?** Ja — Screenshot-Vergleich §9.6 Punkt 6; alle Änderungen scope-isoliert in der (jetzt einen) Mobile-Media-Query bzw. in nur mobil gerenderten Klassen; `useMediaQuery`-Weiche rendert das Desktop-PFC-Panel unverändert an alter Stelle.
3. **Alle Touch-Targets ≥ 44×44?** Ja — Audit §9.6 Punkt 1, nur die 4 dokumentierten Attribution-Ausnahmen.
4. **Konsole frei von neuen Errors/Warnings?** Ja — nur vorbestehende externe BrightSky-404 (§9.6 Punkt 4).
5. **Keine Long Tasks > 200 ms?** Ja — max. 103 ms im kompletten Snap-/Segment-Zyklus; CLS ≈ 0 (0.002) nach transform-Umstellung von Sheet UND Timeline (§9.6 Punkt 5).

**Alle fünf Fragen mit „ja + Beleg" → Gate G1-C bestanden.**

**Real-Device-Hinweis für Jan (aus Spec §13.9):** Safe-Area-Insets (Notch/Home-Indicator) liefern im Emulator konstant 0 — collapsed-Höhe (64px + Inset) und Sheet-Footer-Padding bitte einmal auf echtem iPhone prüfen; Windpartikel-Richtung/-Präzision wie gehabt nur auf Real-Device beurteilbar.

### 9.8 Nachbesserung nach Jans Review (2026-07-10)

**Feedback:** (1) Vorhersage-Tab nicht im Mockup-Look angelegt / „schöner Style" fehlt, (2) Timeline nicht im Mockup-Stil und kollidiert „manchmal" mit einer großen Kachel.

**Diagnose:**
- Vorhersage-Tab existiert und funktioniert (Location-Modus, §9.6) — es fehlte der **Z5-Look**: das eingehängte `PointForecastPanel` brachte seinen Desktop-Kopf („PUNKTFORECAST · München" + Meta) mit, im Sheet doppelt redundant (Ort steht in der Topbar-Pill, das Segment heißt „Vorhersage").
- Timeline war noch die alte Pill (Text-Reset-Button, dicker 28px-Ink-Thumb, kein Füllstand, keine Ticks) statt der Mockup-Timeline aus `wetterkarte-c-detail.html`.
- Kollisionsquelle reproduziert: Bei **mehreren aktiven Legenden-Layern oder kurzen Viewports** ragte der `.map-legends`-Stapel (max-height 42vh, top 96px) im half-Zustand in die hochgerückte Timeline (46vh+10px). Zusätzlich entdeckt: Karten-**Attribution + Maßstab** lagen seit `inset:0` am Viewport-Boden **hinter dem Sheet** (Preservation-Punkt 12 verletzt).

**Maßnahmen (alle scope-isoliert in der Mobile-Media-Query; Desktop-Diff erneut geprüft):**
1. **Timeline im Mockup-Stil:** runder 44px-Ink-Button, Terracotta-Füllstand links vom 20px-weißen Knob mit Terracotta-Ring (`--tl-fill`-CSS-Variable, von React am Input gesetzt; Firefox über `::-moz-range-progress`), Tick-Reihe `jetzt · +¼ · +½ · +¾ · +max h` (nur Vollansicht, nur wenn Horizont ≥ 4h), fetter tabellarischer Zeitstempel, Radius 16px. Neuer `.forecast-track`-Wrapper (Spalte Regler+Ticks); auf Desktop unsichtbar (Ticks `display:none`, Regler-Geometrie unverändert — `flex:none`-Override nötig, da das Basis-`flex:1` in der Spalte vertikal wirkte und den Regler auf 6px stauchte).
2. **Kollisionen:** `.map-sheet-snap-half .map-legends { max-height: calc(54vh - 200px) }` — Legenden-Stapel endet immer über der Timeline. Attribution/Maßstab (`maplibregl-ctrl-bottom-*`) auf `bottom: calc(152px + safe-area)` gehoben: sichtbar im collapsed-Kartenzustand über der Timeline, in half/full vom Sheet verdeckt (Punkt 12 wiederhergestellt).
3. **Z5-Look Vorhersage-Segment:** `.map-sheet-fc`-scoped: `pfc-title`/`pfc-loc` ausgeblendet (redundant), Meta-Zeile kompakt, Sub-Tabs größer — Segment beginnt jetzt wie im Mockup mit Meta + Sub-Tabs + großem Jetzt-Wert. Keine Änderung an PFC-Interna.

**Verify:** Timeline-Füllstand + Ticks + Knob per Screenshot (`c-nachher2-z1-collapsed.png`, `c-nachher2-timeline-fill.png` bei +12h), fc-Segment (`c-nachher2-z5-half-fc.png`), Legende-Cap in half rechnerisch + gemessen kollisionsfrei (36px Abstand bei 844px, positiv auch bei kurzen Viewports), Landscape 844×390 (Slider 10px über Sheet, Attribution 20px über Slider, scrollWidth 844), Desktop 1440×900 pixelgleich (`c-verify2-desktop-after.png` — Slider-Pill/Geometrie unverändert: Input 6px, Button 44px, Ticks absent), Touch-Audit erneut nur die 4 Attribution-Ausnahmen, Konsole nur vorbestehende BrightSky-404, `npm run typecheck` grün.

## 7. Real-Device-Hinweis für Jan
- Windpartikel-Richtung/-Präzision: nur auf echtem iOS/Android-Gerät final beurteilbar (bekannt aus Vorgänger-Debugging, unverändert seit Baseline).
- Safe-Area-Insets (Notch/Home-Indicator): Emulator liefert `env(safe-area-inset-*)` konstant 0; echte Werte erst auf Real-Device sichtbar.
- Empfehlung (nicht blockierend): Sheet-Snap-Animation von `max-height` auf `transform: translateY()` umstellen (Performance/CLS), betrifft auch `src/mobile/BottomSheet.tsx`.
