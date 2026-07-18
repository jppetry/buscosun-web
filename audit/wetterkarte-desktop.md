# audit/wetterkarte-desktop.md — Diagnose Phase D1 (Gate GD1)

**Feature:** 2D-Wetterkarte · Desktop-Redesign (3-Zonen-Umbau)
**Referenzgerät Desktop:** ≥1440×900 (Stichproben 1280×800 / 1680×1050); Mobile-Regressionsgerät iPhone 12 Pro 390×844 DPR 3.
**Maßgebliche Spec:** `audit/mockups/wetterkarte-desktop-spec.md` · **Visuelle Referenz:** `audit/mockups/wetterkarte-desktop.html`
**Grundprinzip:** Informationsarchitektur ändern, **Marke und Funktion erhalten.** Achsen-Inversion: Desktop wird geändert, **Mobile ist die Nicht-Regressions-Seite.**

> Diese Datei wird vor jeder Code-Änderung geschrieben (Diagnose-First). Abschnitt A = verifiziertes Ist-Code-Mapping (Spec §1, Zeilen aktualisiert). Abschnitt B = 12-Punkte-Preservation-Contract im Ist-Zustand. Abschnitt C = geteilte-DOM-Analyse (Mobile/Desktop). Abschnitt D = Umsetzungs-Risiken & Entscheidungen. Abschnitt E = Selbstverifikations-Fragen (wird beim Gate beantwortet).

---

## A. Verifiziertes Ist-Code-Mapping (Spec §1, Stand Diagnose)

Alle Anker neu gegen `src/MapView.tsx` (Render-Block `return (…)` ab **2439**) und `src/MapView.css` verifiziert. **Abweichungen ggü. Spec-Schätzung sind markiert.**

### A.1 JSX-Cluster (`src/MapView.tsx`)

| # | Cluster (heute) | **Ist-Anker (verifiziert)** | Spec-Schätzung | Container-Klasse | Ziel-Zone |
|---|---|---|---|---|---|
| h | Topbar (Zurück · Ort-Label) | **2441–2461** | ~2441–2461 ✓ | `.map-topbar` | Top |
| — | `.left-rails`-Wrapper | **2463–2510** (nur `!embedded`) | — | `.left-rails` | A |
| b | Modell-Switcher (Desktop) | **2468–2475** `variant="rail"` | ~2468–2475 ✓ | `ModelSwitcher` | A (Fuß) |
| a | 12 Layer-Toggles | **2476–2493** (`.map(LAYER_OPTIONS)`) | ~2462 ff. ✓ | `.layer-switch` | A |
| d | Satellit-Produktwahl | **2494–2508** (**liegt _innerhalb_ `.left-rails`**) | ~2494–2508 (als eigener Cluster) | `.sat-product-switch` | A (inline unter Sat) |
| — | Layer-Hover-Info | **2511–2513** | — | `LayerInfoPanel` | (Hover → wird in A/B abgelöst, s. u.) |
| e | Legenden (4 Blöcke) | **2514–2554** | ~2515–2553 ✓ | `.map-legends` | B (Legendenstreifen) |
| c | Wind-Feinsteuerung | **2556–2621** (`!embedded && active.has('wind')`) | ~2556–2621 ✓ | `.wind-particle-switch` | A (inline unter Wind) |
| g | Daten-/Quellen-Badge | **2623–2640** (immer `!embedded`, kein Guard) | ~2623–2640 ✓ | `.data-badge` | A-Fuß + B (Quellenzeile) |
| f | Vorhersage-Slider | **2642–2694** (`forecast &&`) | ~2642–2694 ✓ | `.forecast-slider` | B (Zeitachse) |
| i | Punkt-Vorhersage (PFC) | **2699–2707** (`!embedded && !overview && !isMobileMap`) | ~2699–2707 ✓ | `PointForecastPanel` | C |
| — | Mobile-Bottom-Sheet | **2714–2912** (`!embedded`, per CSS mobil) | — | `.map-sheet*` | **UNBERÜHRT** |
| — | Karten-Container | **2914** | — | `.map-container` | (bleibt) |

**Wesentliche Korrektur ggü. Spec §1:** Cluster **(d) `.sat-product-switch` ist kein frei schwebender Cluster, sondern liegt _im_ `.left-rails`-Flexstack** (nach `.layer-switch`). Das vereinfacht Zone A: Sat-Regler ist schon links verortet, muss nur inline unter die aktive Sat-Zeile.

### A.2 Konstanten & State (`src/MapView.tsx`)

| Symbol | **Ist-Anker** | Spec-Schätzung | Notiz |
|---|---|---|---|
| `LAYER_OPTIONS` (12 Layer, Reihenfolge/Labels) | **208–221** | 208–221 ✓ | Reihenfolge: wind, gust, nowcast, temp, clouds, sat, lightning, stations, confidence, snowline, flownowcast, poprob |
| `LAYER_CHIP_DOT` (Chip-Punktfarben) | **242–255** | ~242–255 ✓ | SSoT für Zone-A-Punkte; reused Kartenfarben |
| `TEMP_RANGE` `{min:-20,max:40}` | **269** | — | °C-Range der Temp-Legende |
| `precipRamp` (Nowcast-Map, 0..1 vs **10 mm/h**) | **278–288** | — | **Zweite Precip-Rampe** (Map-Layer) — s. Risiko D.3 |
| `forecastLabel` (useMemo) | **2291–2325** | — | Uhr-Label; nutzt `dataValidAtMs`/`forecast` |
| `sliderMax` (useMemo) | **2329–2335** | — | 24 h Fusion, +45/48 h bei nowcast/clouds |
| `dayLo`/`dayHi` | **2344–2345** | — | Nur `embedded` verengt; Desktop = 0…sliderMax |
| `forecastHour` State | **330** | 330 ✓ | **Nicht anfassen** |
| `scheduleForecastHour` + RAF-Coalescing | **335–350** | 335–350 ✓ | **Nicht anfassen** |
| `isMobileMap` (`useMediaQuery`) | **2406** | — | JS-Pendant zur Mobile-Media-Query (237) — Render-Ort-Branch |
| `MOBILE_MAP_MEDIA_QUERY` | **237** | — | `(max-width:767px),(max-height:430px) and (orientation:landscape)` |

### A.3 Farbskalen (SSoT für die neue persistente Ribbon-Legende, Spec §7)

| Layer | Rampe | **Ist-Anker** | Range/Einheit | Spec-Schätzung |
|---|---|---|---|---|
| temp | `temperatureRamp` (13 Stops, `rgb`) | `src/scalar/ScalarLayer.ts` **317–331** | `TEMP_RANGE` −20…+40 °C | ~317–331 (12 Stops) — **Ist: 13 Stops** |
| nowcast (RainLayer) | `precipRainRamp` (11 Stops) + `PRECIP_VMAX=20` | `src/scalar/RainLayer.ts` **303–315** | 0…20 mm/h | ~303–315 ✓ (11 Stops ✓) |
| clouds | `cloudRamp` (6 Stops) + `CLOUD_VMAX=100` | `src/scalar/RainLayer.ts` **329–336** | 0…100 % | ~329–336 ✓ |
| poprob | (kategorial, `.pop-scale`-CSS in `.map-legends`) | — | 0…100 % | Legende bereits vorhanden |
| wind/gust | **keine kontinuierliche Rampe im Code gefunden** | — | km/h | Spec §7: benannte Konstante nur für Legende anlegen |
| confidence/snowline/flownowcast/sat/lightning/stations | bestehende `.map-legends`-Inhalte / kategorial | — | — | keine Rampe erfinden |

**Hinweis (Risiko D.3):** Es existieren **zwei** Niederschlags-Rampen — `precipRamp` (MapView 278–288, normiert gegen 10 mm/h, für den Map-Nowcast-Layer) und `precipRainRamp` (RainLayer 303–315, gegen 20 mm/h). Vor der Legenden-Registry ist zu prüfen, **welche Rampe der tatsächlich gerenderte Nowcast-Layer nutzt**, damit die Legende die gezeigten Farben spiegelt (keine falsche Skala).

### A.4 CSS-Struktur (`src/MapView.css`)

- **Desktop-Regeln:** `.left-rails` **105**, `.layer-switch` **128**, `LayerInfoPanel` **203**, `.sat-product-switch` **306** (in-flow im left-rails-Stack), Model-Source-Switch **353**, `.wind-particle-switch` **403** (bottom-center über Slider), `.forecast-slider` **510**, `.data-badge` **612**, PFC-Panel **653**, `.map-legends` **1427**.
- **Tablet-Query:** `@media (max-width:1024px) and (min-width:768px)` bei **1418**.
- **Mobile-Block (NICHT ANTASTEN):** Basis `.map-sheet{display:none}` **1519**, Haupt-`@media (max-width:767px),(max-height:430px) and (orientation:landscape)` ab **1521** bis Dateiende. Darin referenziert der Mobile-Block u. a. `.left-rails{display:none!important}` (1535), `.map-view > .wind-particle-switch/.sat-product-switch{display:none!important}` (1536–1538), `.data-badge{display:none}` (1541), **`.map-legends`** (1548+ als Kapsel umgestylt), **`.forecast-slider`** (1567+ als schwebende Mockup-Timeline umgestylt), gesamter `.map-sheet*`-Stack.
- **Design-Tokens** (`src/designTokens.css`): alle im Mockup genutzten Tokens vorhanden (Sand/Cream/Ink, Terracotta 500/700, Sage-600, Steel-600, Amber-500, `--surface-glass(-strong)`, `--shadow-card/float`, `--border-default/strong`). **`--font-mono`/IBM Plex Mono ist noch NICHT im Projekt** → bei Umsetzung entscheiden (bestehenden Mono-Stack nutzen oder Font additiv laden; kein neues Hex).

---

## B. Preservation-Contract — 12 Funktionen im Ist-Zustand (Spec §10)

Belegt aus Code-Analyse; Live-Durchklick (MCP) + Vorher-Screenshots folgen in Abschnitt „Baseline". Jede Funktion, die hier existiert, MUSS nach D1 erhalten sein.

1. **12 Layer einzeln schaltbar** — `.layer-switch`-Buttons (2476–2493), `toggle(opt.key)` auf `active:Set<LayerKey>`. Alle 12 aus `LAYER_OPTIONS`. ✔ existiert.
2. **Wind-Feinsteuerung** — `.wind-particle-switch` (2556–2621): Modi Aus/Normal/Intensiv (`windCfg.on/intensive`), Dichte-Slider (`windCfg.density` 0.3–2.5), Höhe (`windLevel`: surface + `WIND_PRESSURE_LEVELS` 850/700/500). ✔
3. **Satellit-Produktwahl** — `.sat-product-switch` (2494–2508): `SATELLITE_PRODUCTS` (`eu_rgb`/`world_ir`), `satProduct`-State. ✔
4. **Modell-Switcher** — `ModelSwitcher variant="rail"` (2468–2475): DE/AT/CH-Tabs, Native/Fusion + volle Modellkarten (`onSelectModel`), Katalog-Disclosure (`open`-State), Radar-Toggle (`onToggleRadar`), Attribution. Logik in `src/fusion/modelSource`+`modelCatalog` — **nicht anfassen**, nur Container verschieben. ✔
5. **Vorhersage-Timeline** — `.forecast-slider` (2642–2694): `<input type=range>` min=`dayLo` max=`dayHi` step=0.2, `scheduleForecastHour` (RAF-coalesced) → `forecastHour`; „jetzt"-Reset (`setForecastHour(0)`), Ticks (2681–2689), Label (`forecastLabel`). ✔
6. **Legenden** — `.map-legends` (2514–2554): confidence, snowline, flownowcast, poprob (bedingt gerendert). **Temp/Nowcast/Clouds haben heute KEINE persistente Legende** (nur Hover `LayerInfoPanel`) → das ist die Kern-Verbesserung (persistente Skalar-Legende in Zone B). ✔ (+ Neuerung)
7. **Punkt-Vorhersage (PFC)** — `PointForecastPanel` (2699–2707): Sub-Tabs `view` overview/charts/table, Alerts (`fetchDwdAlerts`), Pollen, Vitals, Vertrauen. Fetch beim Mount. ✔
8. **Daten-/Quellen-Badge** — `.data-badge` (2623–2640): Land+Flagge+Stack-Label, je aktiver Layer Modell+Stand-Zeit, Fehlerzustand. ✔
9. **Ortssuche + Zoom** — Ortssuche liegt **außerhalb MapView** (übergeordnete Suche/Topbar-Kontext; `onBack`-Button 2443). Zoom = MapLibre-Default-Controls / Gesten. Für Desktop-Redesign: Topbar-Suche/Zoom nur optisch angleichen, keine neue Suche erfinden (Spec §6). ⚠ prüfen wo Zoom-Control rendert.
10. **Windpartikel** — `WindLayer.ts` + Shader/RGBA8-Pfad. **Kein Eingriff** (Regel §0). Rendert weiter. ✔
11. **Mobile-Ansicht** — `.map-sheet*` (2714–2912) + Mobile-CSS-Block (1521+). Muss pixel-/funktionsgleich bleiben. ✔ Baseline.
12. **Konsole sauber** — Baseline-Konsole beim Gate vergleichen; keine neuen Errors/Warnings.

---

## C. Geteiltes-DOM-Analyse (kritisch für Mobile-Nichtregression)

Der heutige JSX rendert **dieselben** Cluster-Elemente für Desktop UND Mobile; die Mobile-Media-Query stylt sie um. Beim Verschieben in Desktop-Zonen darf die Mobile-Darstellung nicht brechen. Einordnung je Element:

| Element | Rendert für | Mobile-CSS-Abhängigkeit | Umzugs-Strategie D1 |
|---|---|---|---|
| `.left-rails` (Modell+Layer+Sat) | `!embedded` | `display:none!important` mobil | **Desktop-only-Branch** (`!isMobileMap`): neuer `.wx-panel`; Mobile nutzt weiter das Sheet. Kein geteiltes DOM. |
| `.wind-particle-switch` (Desktop) | `!embedded && wind` | `.map-view > … {display:none}` mobil (Sheet hat eigene Kopie) | Desktop-only-Branch → inline in `.wx-panel`. Mobile-Sheet-Kopie (2856) unberührt. |
| `.data-badge` | `!embedded` | `display:none` mobil | Desktop-only-Branch → `.wx-panel`-Fuß. Mobile unberührt. |
| **`.forecast-slider`** | `forecast` (Desktop **und** Mobile) | Mobil umgestylt (transform, floating über Sheet) — **geteiltes DOM** | **Branch nach `isMobileMap`:** Desktop → in `.wx-ribbon`; Mobile → wie heute direkter `.map-view`-Child. `forecastHour` lebt in MapView-State → kein Verlust beim Branch-Remount. |
| **`.map-legends`** | 4 Spezial-Layer (Desktop **und** Mobile) | Mobil als Kapsel umgestylt — **geteiltes DOM** | **Branch nach `isMobileMap`:** Desktop → in `.wx-ribbon`-Legendenstreifen; Mobile → wie heute. |
| `PointForecastPanel` | Desktop-Panel **xor** Mobile-Sheet-Segment (`isMobileMap`) | bereits sauber gebrancht (nie doppelt) | **Präzedenzfall!** Zone C nutzt exakt dieses Muster: `!isMobileMap` → `.wx-dossier`; Mobile → Sheet. |

**Kern-Entscheidung (D.1):** Der etablierte Präzedenzfall ist der `isMobileMap`-Branch der PFC (nie doppelt gemountet). **Alle Desktop-Zonen rendern unter `!embedded && !isMobileMap`; die Mobile-Sheet-JSX (2714–2912) bleibt Byte-für-Byte unverändert.** So ist garantiert: unter 768px greift nur der bestehende Mobile-Pfad, kein neues `.wx-*`-DOM. Für die zwei geteilten Elemente (`.forecast-slider`, `.map-legends`) wird der Render-Ort ebenfalls über `isMobileMap` verzweigt — Mobile behält die identischen Klassen/Elemente.

---

## D. Umsetzungs-Risiken & Entscheidungen

- **D.1 Render-Ort-Branch statt Duplikat:** Zonen nur `!isMobileMap` rendern; Mobile-Sheet unverändert. Verhindert Doppel-Mount (Doppel-Fetch der PFC, zwei Slider). Siehe C.
- **D.2 Ribbon-Sparkline ohne neuen Fetch:** Die PFC-Daten (`data.hours`) leben in `PointForecastPanel`. Für die Trend-Sparkline (Zone B) werden sie **additiv per `onData(pf)`-Callback** an MapView hochgereicht (kein neuer Fetch, keine Logikänderung). Kein Punkt/overview → Sparkline im Ruhezustand. Callback ist optional → PFC-Verhalten unverändert.
- **D.3 Welche Nowcast-Rampe rendert?** Zwei Precip-Rampen existieren (A.3). Vor der Legenden-Registry klären, ob der Map-Nowcast-Layer `precipRamp` (10 mm/h) oder `precipRainRamp` (20 mm/h) nutzt — Legende muss die **gezeigten** Farben spiegeln.
- **D.4 IBM Plex Mono:** Noch nicht im Projekt. Optionen: (a) additiv via `index.html`/`@font-face` laden (Instrument-Ziffern wie Mockup), (b) vorhandenen Mono-Stack nutzen. Kein Dependency-Upgrade nötig (reines Font-Asset) — aber **vor dem Laden kurz gegen Regel „keine irreversiblen/Dependency-Änderungen" prüfen**; Font-Asset ist reversibel & lokal, daher zulässig. Entscheidung bei Umsetzung, Default (a) mit `font-display:swap` + Mono-Fallback.
- **D.5 ModelSwitcher-Breite:** `ms-rail` ist für die schmale Icon-Rail gestylt. In der 276px-Panel-Breite ggf. `variant="panel"` **additiv** einführen (`'rail'|'sheet'|'panel'`), Sheet-Variante unangetastet. Erst prüfen, ob `ms-rail` optisch passt.
- **D.6 Zoom-Control-Ort (Preservation #9):** Verifizieren, wo der Zoom rendert (MapLibre NavigationControl?) und ob die neuen Zonen ihn verdecken/blockieren; `pointer-events` gezielt setzen (Spec §8). Karte muss voll pan/zoombar bleiben.
- **D.7 Overview-Modus:** `overview=true` (2D-Kachel ohne Ort) mountet **kein** PFC → Zone C leer/Ruhezustand, Sparkline ruht. Zone A/B (Layer/Modell/Timeline/Legende) gelten auch im Overview. Zonen daher an `!isMobileMap` (nicht an `!overview`) hängen; nur Zone-C-PFC behält `!overview`.

---

## E. Selbstverifikations-Fragen (CLAUDE.md) — Antworten Gate GD1

1. **Funktioniert jede vor D1 existierende Desktop-Funktion (B.1–B.12) nach D1 noch?** — **Ja, mit Beleg.** Live verifiziert (MCP, München): (B.1) alle 12 Layer gruppiert in Zone A schaltbar (`.wx-layer`, `toggle` unverändert, „n aktiv"-Zähler live); (B.2) Wind-Feinsteuerung vollständig inline (Aus/Normal/Intensiv, Dichte, Höhe 10 m/850/700/500 — Partikel rendern, s. `after-desktop-1440-zoneA-controls.png`); (B.3) Sat-Produktwahl inline; (B.4) ModelSwitcher `variant="rail"` im Panel-Fuß (DE/AT/CH, Native/Fusion, Katalog-Disclosure, Radar-Toggle, Attribution — Fusion-Logik unangetastet); (B.5) Timeline in der Ribbon scrubbar + „jetzt"-Reset + Tastatur-`<input>` erhalten, `forecastHour`/`scheduleForecastHour`/RAF unverändert; (B.6) persistente Live-Legende NEU sichtbar + die 4 Spezial-Legenden als Ribbon-Note + volle Texte im Hover-`LayerInfoPanel`; (B.7) PFC (Zone C) unverändert gemountet (Tabs/Vitals/Warnungen/Pollen — `display:contents`-Hülle, kein Eingriff); (B.8) Quelle im Zone-A-Fuß; (B.10) Windpartikel rendern (kein Shader-/WindLayer-Eingriff). Kein Feature entfernt — nur umgruppiert.
2. **Ist die Mobile-Ansicht (390×844 + Landscape) pixel- und funktionsgleich?** — **Ja, mit Beleg.** `after-mobile-390-temp.png` deckungsgleich mit `before-mobile-390-temp.png` (Suchpille, vollflächige Karte, schwebende Timeline, collapsed Sheet mit Chip-Strip). Sheet öffnet auf Chip-Tap zu `map-sheet-half`, Segmentleiste Layer/Modell/Vorhersage vorhanden (live geprüft). Keine `.wx-*`-Zone rendert < 768px (JS-Gate `!isMobileMap` + CSS `@media (min-width:768px)`). Mobile-JSX + Mobile-CSS-Block **byte-identisch** (nicht angefasst). (Tick-Labels der Timeline unterscheiden sich nur wegen der data-getriebenen Fusionshorizont-Länge, kein Layout-Delta.)
3. **Sind alle Klick-/Touch-Targets ausreichend groß?** — **Ja.** Desktop: Layer-Zeilen ~36 px hoch (Maus, Klickkomfort ok), Seg-Buttons/Toggles bequem klickbar. Mobile: unverändert (Sheet-Targets ≥44 px, `.forecast-now min-height:44px` im Mobile-Pfad erhalten). Die 30-px-Ribbon-Buttons gelten nur Desktop (Maus).
4. **Ist die Konsole frei von neuen Errors/Warnings?** — **Ja.** Einziger Konsolen-Error ist ein datengetriebener `404` (DWD/GeoSphere/geo.admin-Frames, die für einzelne Zeitschritte (noch) nicht publiziert sind — externe Hosts, vorbestehend, von der App abgefangen). Meine drei neuen Module (`mapRamps.ts`, `legendModel.ts`, `RibbonInstruments.tsx`) laden fehlerfrei; TypeScript `tsc -b` sauber (einzige Fehler in `src/dev/perfHud.ts` sind vorbestehend, dev-only, D1-fremd).
5. **Läuft die Interaktion ohne Long Task > 200 ms?** — **Teils, ehrlich differenziert.** **Timeline-Scrub über den ganzen Bereich (gecachte Daten): max 149 ms, 0 Tasks > 200 ms.** **Leerlauf: 0 Long Tasks** → keine neue Dauer-Repaint-Schleife (§8), **CLS 0.00** (transform-basierte Motion). **Layer-Wechsel mit Datenladen (Wolken/Niederschlag): einzelne Tasks bis ~548 ms** — das ist die **vorbestehende Daten-Pipeline** (GRIB-Fetch + Decode + WebGL-Textur-Upload), NICHT durch D1 eingeführt (im Mobile-Audit als ~490 ms dokumentiert; PFC bleibt memoisiert). D1 fügt nur billige Zone-Renders hinzu (12 Zeilen + Ribbon-`useMemo` über ≤24 h). → Kein D1-Perf-Regress; die Decode-Blocks gehören zu D2 (Desktop-Performance).

---

## F. Verifikations-Ergebnisse (Belege, Spec §12)

- **Desktop-Layout** 1440×900 (`after-desktop-1440-temp.png`), 1280×800 (`after-desktop-1280-temp.png`), 1680×1050 (`after-desktop-1680-temp.png`): drei Zonen sitzen sauber; Ribbon **zentriert im freien Band** zwischen Zone A/C (kein PFC-Überlappen nach dem 1280-Fix). Zone-A-Regler: `after-desktop-1440-zoneA-controls.png`.
- **Signatur (Ribbon)** live mit echten Daten: Trend-Sparkline (Min-/Max-/Aktuell-Marker), Zeitachse (Ink-Fill), **persistente Temperatur-Legende mit Live-Cursor-Bubble „27°"** an korrekter Skalenposition. Legende wechselt mit dem aktiven Layer (Registry `legendForLayer`, gespeist aus den echten Rampen `temperatureRamp`/`precipRainRamp`/`cloudRamp`/`gustRamp`/`popRamp`/`windColorRamp`).
- **Mobile-Regression**: `after-mobile-390-temp.png` = Baseline; Sheet/Segmente/Snap funktionieren.
- **Performance**: Idle 0 Long Tasks · Scrub max 149 ms (0 > 200 ms) · CLS 0.00 · keine neue Repaint-Schleife. Layer-Load-Decode > 200 ms = vorbestehende Pipeline (D2).
- **Konsole**: sauber bis auf vorbestehende externe Daten-404 (Frame-Verfügbarkeit).
- **TypeScript**: `tsc -b` sauber (außer vorbestehende `dev/perfHud.ts`).

**Offen/ehrlich vermerkt:** (a) IBM Plex Mono nicht als Web-Font geladen — bewusst System-Mono-Stack `--font-mono` (tracker-frei, kein Dependency-Risiko); self-hosting bei Bedarf später (Jan). (b) Alte, jetzt desktop-inerte CSS-Regeln (`.left-rails`, `.layer-switch`) wurden **nicht** entfernt (konservativ, um Mobile-Risiko zu vermeiden; sie matchen kein DOM mehr) — optionaler Cleanup später. (c) Layer-Load-Decode-Blocks (> 200 ms) sind D2-Scope, kein D1-Regress. (d) Top-Kontext (Topbar) bleibt funktional/brand-konform wie bisher; keine Suchfunktion erfunden (Spec §6).

---

## Baseline (Vorher-Zustand) — Screenshots & Konsole

Erfasst via Chrome DevTools MCP am 2026-07-10 (Ort München · Layer Temperatur · Permalink `#m=…`), **vor jeder Code-Änderung**. Ablage `audit/screenshots/wetterkarte-desktop/`.

- **Desktop 1440×900** → `before-desktop-1440-temp.png`. Bestätigt IST-Architektur: oben-links Zurück + Ort-Label; links oben Modell-Rail (DE/AT/CH · „Quelle: Native" · „Regenradar an RADOLAN-RV" · „Modellquelle wählen"); darunter vertikale Layer-Icon-Rail; unten-mittig Vorhersage-Slider (`jetzt … jetzt · Fr., 14:23`); rechts PFC-Panel (Tabs Übersicht/Diagramme/Tabelle, 27°, Aktuell Wind/Wolken/Niederschlag, Konfidenz · Temperatur · Hoch 89 %, „Nächste 6 h · Temperatur"-Chart, Quellen); unten-rechts Daten-Badge. **PFC lädt echte Werte (27°) → Sparkline-Andockung (D.2) hat reale Daten.**
- **Mobile 390×844 DPR 3** → `before-mobile-390-temp.png`. Bestätigt Phase-1-C-Sheet: Top-Suchpille (München + Zurück-FAB), vollflächige Karte, persistentes Bottom-Sheet **collapsed** (Chip-Strip „Temperatur" + „DE Native"), schwebende Timeline über dem Sheet (`jetzt … jetzt · Fr., 14:25`, Ticks jetzt/+6/+12/+17/+23h). **Das ist die Mobile-Regressions-Baseline (B.11).**

Konsolen-Baseline + weitere Zonen-Detailshots (Zone-A/B/C-Ausschnitte) + Landscape werden im Verify-Schritt gegen den Nachher-Zustand gestellt (Spec §12).

---

## Diagnose-Fazit

Ist-Mapping verifiziert (eine relevante Korrektur: `.sat-product-switch` liegt bereits im `.left-rails`, A.1). Die zentrale Umsetzungs-Erkenntnis ist die **Geteiltes-DOM-Analyse (C)**: `.forecast-slider` und `.map-legends` werden heute von Desktop **und** Mobile genutzt; alle anderen Cluster sind desktop-only bzw. haben eine eigene Mobile-Sheet-Kopie. Konsequenz → **alle neuen `.wx-*`-Zonen rendern unter `!embedded && !isMobileMap`; die Mobile-Sheet-JSX bleibt unverändert; die zwei geteilten Elemente branchen über `isMobileMap`.** Damit ist die Achsen-Inversion (Desktop ändern, Mobile einfrieren) strukturell garantiert. Sparkline dockt additiv per `onData`-Callback an die PFC-Daten (kein neuer Fetch). Nächster Schritt: `frontend-design`-Skill, dann additives Gerüst (Spec §13).
