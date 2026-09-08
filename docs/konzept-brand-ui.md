# Brandfeature UI-Redesign — Phase 1: Bestandsaufnahme

> Stand: 2026-09-05 · Bereich `src/fire/` · **Design-Only, keine Implementierung**
> Phase 2 (Design-Spezifikation) beginnt erst nach ausdrücklichem OK.

## 0. Vorbemerkung zur Vollständigkeit — ehrlich

`src/fire/` ist **73 Dateien** in 8 Unterordnern; die drei UI-Träger allein sind
`FirePage.tsx` (2 194 Z.), `FireFootprintPanel.tsx` (1 150 Z.) und `FireMap.tsx` (≈1 700 Z.).

Vollständig gelesen: `fireState.ts`, `fireTime.ts`, `FireAnomalyPanel.tsx`,
`FireFootprintPanel.tsx` (Z. 1–1000), `fireModel.ts` (Struktur), `dangerViews.ts`, `fireModel.ts`,
`footprint/history.ts`, `history/historyArtifacts.ts`, `brandradarMeta.ts`, `anomaly/*`, `activity/*`
(Signaturen).
Strukturell erfasst (gezielte Symbol-/JSX-Suche, nicht Zeile für Zeile): `FirePage.tsx`,
`FireMap.tsx`, `FireDossier.tsx`, `FireHistoryPanel.tsx`, `FireDriverCharts.tsx`,
`FireHistoryChart.tsx`, `FirePassChart.tsx`, `FireSatImagery.tsx`, `FireCogViewer.tsx`,
`FireMiniMap.tsx`, `FireLayerCard.tsx`, `fireDeck.css`.

**Was das für Phase 2 heißt:** Die Tabelle unten deckt die Bühnen, Reiter, Layer, Zeitachsen,
Karten-Interaktionen, Listen, Filter, Detailkarten und Zustände ab. Für die letzten ~15 % —
einzelne `title`-Tooltips in den tief liegenden Dossier-Zeilen und die Achsenbeschriftungen der
fünf Chart-Komponenten — brauche ich vor Phase 2 entweder Ihr OK zum vollständigen Durchlesen
dieser sechs Dateien (ca. eine weitere Session) oder Sie akzeptieren, dass das Design diese
Zeilen als „übernehmen wie vorhanden" markiert, statt sie einzeln neu zu spezifizieren.
**Nichts davon habe ich geraten:** Zeilen, die ich nicht belegen kann, stehen unten unter
§3 „Nicht abschließend erfasst".

---

## 1. Inventar

### 1.1 Rahmen — Bühne, Reiter, Navigation

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Bühnen-Umschalter „Karte / Dossier" | `FirePage.tsx:1948` (`stageSeg`) | schaltet die MITTE zwischen Karte und Brand-Dossier | `stage`-State, Hash `ds` | `map` (Std.) · `dossier`; mobil koppelt an `mobileTab` |
| Readout-Reiter „Brände / Thermalanomalien" | `FirePage.tsx:1860` (`br-fires-seg`), `:1902` (`br-tabs`) | wählt den Inhalt des rechten Readouts | `readoutTab`-State, Hash `fp`/`ta` | `fires` (Std.) · `anomalies`; `aria-pressed` |
| Layer-Reiter (Dock) vs. Readout | `FirePage.tsx:1902` | dritter Reiter „Layer" mit den Steckbriefen | lokal | aktiv/inaktiv |
| Mobile-Tab-Leiste | `FirePage.tsx:235` (`mobileTab`), `openTab` | Karte · Layer · Brände · Zeit | `MobileTab` | vier Werte; Deep-Link über `fp`/`ta` |
| Bottom-Sheet (mobil) | `FirePage.tsx:101,1107` | Snap-Punkte über `BottomSheet` | `mobile/BottomSheet` | Start `half`; weitere Snaps aus der Komponente |
| Preset-Umschalter | `fireModel.ts:241` | „Überblick" (`FIRE_DEFAULT_LAYERS`) · „Aktuelle Lage" (`fireDanger`, `fireHotspots`, `fireWeather`) | `FIRE_PRESETS` | zwei Presets |
| Basiskarten-Umschalter | `FirePage.tsx:1573`, `:1935` | Straßen / Satellit | `basemap`-State | `streets` (Std.) · Satellit; im Dock-Fuß **und** über der Karte |
| Permalink `#wb=` | `fireState.ts:1–210` | Ort, Layer-Bits, Tag, Fenster, Sub-Ansicht, Körbe, Bodentiefe, Panel, Reiter, Historie, Dossier, Stunde | Hash | standard-still (Std. verlängert den Hash nicht); zurückgezogene Bits reserviert |

### 1.2 Layer-Dock — 10 aktive Layer in 4 Gruppen

`FIRE_DECK_GROUPS` (`fireModel.ts:277`), Zeile gerendert in `FirePage.tsx:1384` (`layerRow`).

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Gruppe „Gefahrenlage" (terracotta) | `fireModel.ts:282` | enthält `fireDanger` (amber) | — | Kopfzeile `br-group-head` |
| `fireDanger` — EU-Gefahrenindex | `fireModel.ts:284`, Zeit `fireTime.ts:FIRE_LAYER_TIME` | FWI-Fläche, ~8 km; **5 Sub-Ansichten** | Copernicus EMS **GWIS** (ECMWF), WMS-TIME | `forecast`, maxDay **9**; an/aus; Ladezustand |
| Gruppe „Aktuelle Lage" (steel) | `fireModel.ts:288` | Hotspots · Footprints · Anomalien · Feuerwetter | — | — |
| `fireHotspots` — Detektionen | `fireModel.ts:290` | Thermalanomalie-Punkte, Radius zoomabhängig | **NASA FIRMS** (VIIRS), Rückfall **GWIS** | `window`, Fenster **24 h / 168 h**; ortsfest ⇒ grau |
| `fireFootprints` — Brandflächen je Brand | `fireModel.ts:293` | Registry-Polygone (Convex Hull / EFFIS) | `footprint/fireRegistry.ts` | `window`, teilt das Hotspot-Fenster |
| `fireAnomalies` — Standorte Wärmequellen | `fireModel.ts:297` | Raute je Standort, 4 Varianten A/B/C/dev | `public/fire/ta/thermal-sites-v1.json` | `instant`; Bit 15 |
| `fireWeather` — Feuerwetter-Treiber | `fireModel.ts:298` | rel. Feuchte 2 m | **ICON-D2** (DWD) | `forecast` maxDay **1**, `maxHour` **6** |
| Gruppe „Aus der Wetterkarte" (steel) | `fireModel.ts:305` | Bodentrockenheit (+ Wind, zurückgezogen) | — | — |
| `fireSoilDryness` — Bodentrockenheit | `fireModel.ts:308` | SMI, **2 Tiefen** | ICON-D2 `smi` | `forecast` maxDay 1, `maxHour` 6; Segment `FirePage.tsx:1320` |
| Gruppe „Ausbaustufe 2" (slate) | `fireModel.ts:315` | Brennmaterial · frühere Brandflächen · Schutzgebiete | — | — |
| `fireFuel` — Brennmaterial | `fireModel.ts:317` | — | (vorbelegt) | `instant`; **im UI ohne Datenquelle** |
| `fireBurnt` — frühere Brandflächen | `fireModel.ts:318` | EFFIS-Polygone, **3 Zeitkörbe** | EFFIS (Copernicus EMS) | `instant`; **Standard-an** (Codec `fb`) |
| `fireContext` — Schutzgebiete | `fireModel.ts:319` | Natura 2000 | EEA | `instant`; CH fehlt |
| Layer-Schalter | `FirePage.tsx:1400` | `role="switch"`, Icon + Label + Unterzeile | `active`-Set | an/aus; Tablet nutzt `shortLabel` |
| Steckbrief-Knopf „i" | `FirePage.tsx:1419` | klappt den Layer-Steckbrief auf | `openInfo` | `aria-label="Steckbrief …"` |
| Nachlauf-Hinweis | `FirePage.tsx:1441,1447` (`br-layer-lag`) | „folgt dem Regler nicht" / „nur Tageswert" | `followsSlider`, `hourFollow` | dreistufig `hourly`/`daily`/`none` |
| Layer-Notiz / Kartierungs-/Link-Notiz | `FirePage.tsx:1451,1454,1461` | Quellenstand, Kartierungslücke, Fremdlinks | Loader-`note` | nur bei `load.kind === 'ok'` |
| Zeitkörbe-Segment (Brandflächen) | `FirePage.tsx:1344` | Saison · Archiv · letzte 7 Tage | `burntBuckets` | Bit 1/2/4; Std. **Saison** |
| Tagesschieber der 7-Tage-Historie | `FirePage.tsx:1363–1376` | `input[range]`, ein Tag aus 7 | `burntDay` | `null` = alle 7 Tage (Std.); Notiz + Latenzhinweis |

### 1.3 Zeitachse — eine Achse, zwei Einheiten, plus Historie

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Einheiten-Umschalter Tage/Stunden | `fireTime.ts:timeUnit` | eine Achse, zwei Einheiten | `time.unit`, Hash `h` | Std. **Tage**; Stunden nur mit `maxHour`-Layer; **erzwungen** derzeit von keinem Layer |
| Tagesregler | `FirePage.tsx` (`dayForLayers`, `committedDay`) | 0 … `sharedMaxDay` | `sharedMaxDay` | klemmt auf den **kleinsten gemeinsamen** Horizont; `instant`/`window` zählen nicht mit |
| Stundenregler | `fireTime.ts:HOUR_AXIS_MAX = 6` | jetzt … +6 h | `sharedMaxHour` | `hourLabel`: „jetzt", „+3 h" |
| Playback | `FirePage.tsx:1123` (`play`), `firePlayback.ts` | Abspielen der Achse | `defaultPlayback()` | läuft/pausiert |
| Rückblick-Fenster | `FirePage.tsx:1605` (`br-td-window`) | 24 h / 7 Tage | `windowChoices` | leer, wenn kein `window`-Layer aktiv |
| Stand-Anzeige „lädt …" | `FirePage.tsx:1666,1692` | `committedDay !== dayForLayers` | — | Pending-Zustand |
| **Historie-Fenster** | `FirePage.tsx:246`, `history/historyArtifacts.ts:32` | **Monat** (Kalendermonat) · **Saison** (1.3.–31.10.) | `index-month-v1.json`, `index-season-v1.json` (R2) | Hash `bh`; Std. **Live**; `historyEnabled()`-Flag |
| Ladezustand Historie | `FirePage.tsx:247` (`historyLoad`) | `idle`/… | — | eigener Zustand |
| „Vier Zeitfenster" — Befund | — | **24 h** und **7 Tage** sind Live-Fenster (`windowsH`); **Monat** und **Saison** sind ein *anderer* Modus (`historyWindow`), keine vierte Stufe derselben Achse. Dazu quer: EFFIS-Umfang „7 Tage / ganze Saison" (`effisScope`) und die Körbe Saison/Archiv/Woche. | `fireTime.ts`, `historyArtifacts.ts`, `FireFootprintPanel.tsx` | **Kollision, siehe §4/K-1** |

### 1.4 Karte — Interaktion, Popups, Auswahl

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Klick-Kette | `FireMap.tsx:686` | **eine** `map.on('click')`, Reihenfolge: Historie → Standorte → Registry-Flächen → Cluster-Hüllen → Hotspots → EFFIS-Flächen → Zone | `queryRenderedFeatures` je Layer | „Dossier geöffnet" ⇒ **kein** Popup (`FireMap.tsx:213,757,826,844`) |
| Hit-Target Hotspots | `FireMap.tsx:1351,1670` | `circle-radius` aus `radius`-Prop bzw. zoom-interpoliert (×0,55 @z4 … ×1,4 @z11) | FIRMS-Props | **kein** separater unsichtbarer Trefferlayer für Punkte |
| Unsichtbarer Treffer-/Auswahlring | `FireMap.tsx:1570,1576,1681` | `circle-radius: 15` transparent mit Ink-Kontur; daneben ein Layer mit `circle-radius: 0` | — | dient als **Auswahl-Ring**, nicht als generelles 44-px-Target |
| Cursor-Rückmeldung | `FireMap.tsx:855–859` | `mousemove` → `cursor: pointer` über allen klickbaren Layern | — | Desktop; **kein Hover-Highlight auf der Karte** |
| Überlappung | `FireMap.tsx:759,821` | `hits.length` / `bHits.length` wird ins Popup geschrieben („n Treffer") | — | Popup nennt die Zahl; **keine Auswahlliste, kein Spiderfy** |
| Cluster-Auswahl | `FireMap.tsx:741–755` | Klick auf Hülle wählt Cluster; Klick daneben hebt auf | `fireClusters.ts` | `selectedClusterId`; **kein** Zoom-on-Cluster |
| Fokus / Fly-to | `FireMap.tsx:900–910` | `fitBounds` auf `focusBbox` bzw. Cluster-`bbox`, Padding 24, `focusNonce` als Auslöser | — | Zoom-Deckel gegen „max. Zoom auf 375-m-Pixel" |
| Hover-Kopplung Liste → Karte | `FireMap.tsx:980–988` | eigener Mini-Effekt setzt `fire-footprints-hover-line` | `hoverFootprintId` | bidirektional mit der Liste (`onHover`) |
| Auswahl-Kontur | `FireMap.tsx:505–526` | `setFilter` auf `…-sel-line` für Cluster, Footprints, Anomalien, Historie | `selected*Id` | vier getrennte Auswahl-Layer |
| Popup Hotspot | `FireMap.tsx:807`, `hotspotPopupHtml:1024` | Steckbrief einer Detektion: Trefferzahl, kartierte Fläche, Einordnung, Land, Zone, Flächenschätzung | FIRMS + Registry | `maxWidth 280px`, `closeButton` |
| Popup EFFIS-Fläche | `FireMap.tsx:830`, `burntPopupHtml:1189` | Polygon + Korb + Trefferzahl | EFFIS | `maxWidth 300px` |
| Popup Zone | `FireMap.tsx:846`, `zonePopupHtml:1138` | Zonenwerte; Treffer über **Modell** (`zoneAt`), nicht `queryRenderedFeatures` | `fireZones.ts` | `maxWidth 300px` |
| Quellen-Pille | `FirePage.tsx:1533` | aktiver Primär-Layer + Quelle/Auflösung | `BR_LAYER` | `role="status"`; Tablet kürzt |
| Sub-Ansichten-Chips | `FirePage.tsx:1544` | Index · Einordnung · Trockenheit · Ausbreitung · Zündbereitschaft | `dangerViews.ts` | `aria-label="Ansicht des EU-Index"` |
| Kartennotiz | `FirePage.tsx:1563` | `role="status"` | — | kontextabhängig |
| Legende (Desktop) | `FirePage.tsx:1638–1671` | Klassen der aktiven Sub-Ansicht + Punkte (Detektion, ortsfest) + Stand + „Farben abgeleitet — nicht amtlich" | `DANGER_VIEW_CODE`, `FWI_STEPS` | Leerfall: „EU-Gefahrenindex aus — keine Klassenlegende" |
| Legende (mobil) | `FirePage.tsx:1701–1721` | Balken + Labels + Punktzeile inkl. „Ausbreitung" | — | Karte im Sheet |

### 1.5 Readout „Brände" (Registry)

`FireFootprintPanel.tsx`.

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Kopf „Registry · Fenster" | `:~300` (`br-fires-head`) | „n von m gezeigt" bzw. „gefiltert · gezeigt" | `total`, `records`, `shown` | ohne Quelle „—" |
| Sortier-Chips | `SORTS`, `:~290` | Fläche · Aktualität · **Detektionen** · **Stärke** · Status | `RecordSort` + lokal | `aria-pressed`, `title` je Sorte |
| Umfang-Chips | `:~330` | „7 Tage" · „ganze Saison" | `effisScope` | Saison **deaktiviert**, wenn Korb nicht geladen (mit `title`-Grund) |
| Filter-Aufklapper | `:~345` | Knopf „Filter ·" | `filtersOpen` | `aria-expanded`; Punkt zeigt aktive Filter |
| Filter Mindestfläche | `:~355` | alle · ≥1 · ≥5 · ≥20 ha | `filter.minAreaHa` | `title` erklärt Geltung für Obergrenzen |
| Filter Status | `:~365` | aktiv · kein Signal · aus | `FireStatusKind` | Mehrfachauswahl; Farbpunkt je Status |
| Filter Land | `:~378` | DE · AT · CH | `filter.countries` | „unbekannt bleibt" als Hinweis mit `title` |
| Veraltet-Kasten | `:~392` | Detektion > 6 h, EFFIS > 4 d | `DETECTION_STALE_MS`, `EFFIS_STALE_MS` | `role="status"` |
| **Leerzustand: kein Layer** | `:~250` | nennt beide Layer + Knopf „Brandflächen einschalten" | — | mit **Grund** |
| **Leerzustand: Fehler** | `:~258` | „Ausfall, nicht Leerstand" + evtl. EFFIS-Restbestand | `state.load` | `loadMessage` optional |
| **Leerzustand: lädt** | `:~266` | „Detektionen werden geladen …" | — | nur wenn 0 Detektionen |
| **Leerzustand: Notbetrieb GWIS** | `:~268` | erklärt, warum ohne FIRMS keine Flächen/Rangfolge möglich sind | `state.provider` | eigener Text |
| **Leerzustand: Cluster** | `:~278` | „Detektionen da — Einträge werden gebildet …" | `clustersReady` | — |
| **Leerzustand: leer** | `:~280` | „keine Detektion in … und keine kartierte Fläche …" (+ EFFIS-Fehlschlag) | `total === 0` | — |
| Brandkarte (Listenzeile) | `:~430` | Name · Badge · Region; **4 Kennzahlen immer**; Statuszeile; Kontextzeile; AT-Warnkontext; Methoden-Chips; Bewertungs-Chip | `FireRecord` | `is-sel`, `is-static`; Hover/Focus/Blur → `onHover` |
| `RecordStats` | `:~195` | **Fläche** (Herkunft: EFFIS kartiert / geschätzt / Obergrenze / keine) · **Detektionen** (letzte vor X, Überflüge) · **Stärke** (ΣFRP, Ausdehnung, Farbpunkt) · **Tendenz** (wachsend/stabil/abnehmend/kein Signal + Beobachtung) | `activity/*`, `fireClusters` | fehlend = „—" **mit Grund im `title`**, nie 0 |
| Kontextzeile | `:~440` | Landbedeckung (CORINE) · EMS-Aktivierung (offen/geschlossen/vorhanden, Code) · „vermutlich Industrieanlage" · Standort-Einordnung (Anlage / Abweichung) | `landcover`, `sources.ems`, `anomaly` | jede Aussage mit „eigene Ableitung, kein Nachweis" |
| AT-Warnkontext | `:~470` | GeoSphere-Warnungen mit Typ + Stufe, „Kontext, keine Brandbestätigung" | `geosphereWarnContext.ts` | nur AT |
| Deckel „Weitere N laden" | `:~500` | `CLUSTER_PAGE = 50`, nennt gezeigt/gesamt | — | **ausgesprochen** (V-246) |
| Zusammenfassung | `:~510` | „N Brände aus M Detektionen der letzten …" + Zählregel | — | nur mit Detektionen |
| Vorbehalt | `:~520` | „Detektionsgruppe, keine amtliche Meldung"; Kartierung läuft 1–3 d nach | — | immer |
| Stärke-Skala | `:~530` | `CLUSTER_FRP_STOPS` als Legende, „ab N MW" | `fireClusters` | dieselben Stopps wie der Punkt |
| Notizen | `:~545` | `CLUSTER_NOTE`, `registryNote`, GeoNames-Zeile (CC BY, Entfernung, Kreis-Vorbehalt) | — | GeoNames nur wenn `placesLoaded` |
| Quellenzeile | `:~560` | „● NASA FIRMS · EFFIS · Copernicus EMS · CORINE · GeoSphere-Kontext" | — | immer |

### 1.6 Detailkarte / Dossier (BD1–BD3)

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| `FireDossier.tsx` | ganze Datei | Bühne „Dossier" in der Mitte; Karten der BD2-Form | teilt Bausteine mit dem Panel | offen über `stage`/`ds` |
| Karten-Karte im Dossier | `FirePage.tsx:1965` | „Karte · markiert" + `FireMiniMap`; Rücksprung „↗ Bühne zurück" | — | Leerfall: „Kein Brand markiert — DACH-Überblick" |
| `DetailSubline` | `FireFootprintPanel.tsx:~700` | Region · Koordinate · `id` · zuvor N× · zusammengewachsen · hervorgegangen aus | `FireRecord` | Herkunft der Kennung |
| `DetailKennzahlenRows` | `:~715` | Status · Fläche (inkl. Obergrenzen-Erklärung „Pixel deckt 14–60 ha") · Kartierung · Schätzung · Erst-/Letztdetektion · Hotspots/Überflüge/Satelliten | Registry + `activity/estimate` | jede Lücke mit `missingReason` |
| `MappingRow` | `:~660` | EFFIS-Fläche, Branddatum, Ende, Stand, Link, weitere Kartierungen — **oder** den Grund (`mappingGapText`) | EFFIS | eine Stelle gegen die widerlegte „ab 30 ha"-Regel |
| `DetailConfidenceRows` | `:~790` | FIRMS-Konfidenz · Bewertung · Begründungsliste · Methode | `fireAssessment.ts` | Lücke mit Grund |
| `spreadConfidenceNote` | `:~810` | löst **auf**, warum keine Ausbreitungsrichtung: <3 Überflüge / Pendeln / <200 m Gitterrauschen | `activity/dynamics` | nie „entweder/oder" |
| `DetailFrpRows` | `:~830` | ΣFRP (Fenstersumme, „Leistung, keine Fläche") + FRP je Überflug | `overpasses.ts` | — |
| `WeatherBlock` | `:~600` | Zusammenfassung · bei Erstdetektion · bei letzter Detektion · Brandtag (Tmax/RHmin/Böen/mm) · Vortage (24 h vor Erstdetektion, `rainLabelLive`) · jetzt · Notizen · Quellenzeile | `detail/fireWeatherAtPoint.ts`; **Rückfall ERA5** | `loading` → „Modellwerte … werden geladen"; ein Abruf je Brand/Sitzung |
| `DriversBlock` / `DriversView` | `:~640`, `:~680` | Einstufung (`driverRating`) mit Punktsumme + Begründungsliste (±) · Windrose · vorherrschender Wind (Vektormittel, Beständigkeit) · Ausbreitung-gegen-Wind (Winkeldiff.) · FFMC/ISI bei Erstdetektion · Zeitreihe | `detail/fireDrivers.ts` | Leerfall: „Keine Stundenreihe … weder Windrose noch Einstufung"; ERA5-Hinweis |
| `fireWindowAnchor` + `EFFIS_ANCHOR_NOTE` | `:~575` | Zeitanker Detektion **oder** EFFIS-Branddatum — und sagt welcher | Registry | zwei `kind`s, Hinweistext bei `effis` |
| `FeaturesRow` | `:~555` | versionierter Merkmalsatz `v1` als Liste + „JSON kopieren" | `activity/features.ts` | `kopiert ✓` 1,5 s; ohne Detektion/EFFIS **nicht gerendert** |
| Charts | `FireDriverCharts.tsx` (`WindRoseChart`, `DriverSeriesChart`), `FirePassChart.tsx`, `FireHistoryChart.tsx` | Windrose, Treiber-Zeitreihe (mit Detektionsspanne + Index), Überflug-Chart, Historien-Chart | s. Dateien | **Achsen/Einheiten/Empty-States nicht abschließend erfasst → §3** |
| Satellitenbild / COG | `FireSatImagery.tsx`, `FireCogViewer.tsx`, `detail/{fireSatImagery,cogTiff,burnScar,burnIndex,sentinelGeo,worldCover}.ts` | Sentinel-Vorschau, Brandnarbe/dNBR, WorldCover | R2 / COG | **nicht abschließend erfasst → §3** |

### 1.7 Readout „Thermalanomalien"

`FireAnomalyPanel.tsx` (vollständig gelesen).

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Kopf | `:118` | „Thermalanomalien · Archiv 2020–2026 + N-Fenster" + „n von m" | `ThermalSitesIndex` | ohne Liste „—" |
| Sortier-Chips | `:105` | Signal · Aktualität · Häufigkeit · Name | lokal | je `title` |
| Klassen-Chips | `:135` | A · B · C mit `SITE_CLASS_LABEL` | `thermalSites.ts:152` | Mehrfachauswahl |
| „nur mit Signal im Fenster" | `:141` | Filter + Zähler | `byRecord` | `aria-pressed` |
| Kopplung zur Brandliste | `:148` | „N Einträge mit Anlagenmuster stehen grau auch / nicht in der Brandliste" + Umschalter | `hiddenFromFires` | zwei Textfassungen |
| Standort-Zeile | `:165` | Name · Badge (ANLAGE/ABWEICHUNG) · Klasse · Land; Art + Quelle + Abstand; Ø Tage/Jahr · Jahre · zuletzt (Archiv); im Fenster: Detektionen/ΣFRP/zuletzt **oder** „kein Signal" | `thermalSites.ts` | `is-cls-*`, `is-static`, `is-sel` |
| Abweichungs-Hinweis | `:195` | „steht als Brand im Reiter Brände" | `anomaly.kind` | nur `site-deviating` |
| Deckel | `:205` | „Weitere N Standorte laden" (`CLUSTER_PAGE`) | — | ausgesprochen |
| Fußnote | `:212` | Archivregel (≥2 Jahre × ≥5 Tage), Join-Radius, E-PRTR/MaStR/BFE + Lizenzen, Lücken (neu/stillgelegt), Klasse C ≠ Wärmequelle | — | immer; Link „Zu den Layern" |
| Leerzustand: abgeschaltet | `:129` | „(`?ta=0`) — die Brandliste verhält sich wie vor TA" | — | `disabled` |
| Leerzustand: lädt | `:130` | „Standortliste wird geladen … (statische Datei, einmal je Sitzung)" | — | — |
| Leerzustand: Filter leer | `:160` | „Kein Standort entspricht der Auswahl — Chips zurücksetzen" | — | — |
| `AnomalySiteCards` | `:230` | 3 Karten: **Standort & Anlage** (Kennung/Zellen, Klasse, Anlage+Lizenz+Abstand+Detail, Betreiber, weitere Anlage, Einordnung, Landbedeckung, Lage) · **Signatur im Archiv** (Detektionen/Tage, Nachtanteil, NASA-„statisch"-Anteil, zuletzt; Tage je Jahr; FRP p50/p95/max) · **Im Fenster & Prüfung** (Detektionen/Überflüge/ΣFRP/Abzeichen; Signaturprüfung 4 Häkchen; Begründungen) | `thermalSites`, `anomaly/classify` | Leerfall „kein Signal — Beobachtungslücke oder kein Betrieb, keine Aussage" |
| `siteStatTiles` | `:288` | 4 Kacheln: Klasse · Archiv · Nachtanteil · Im Fenster | — | „—" mit Grund |

### 1.8 Readout „Historie"

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| `FireHistoryPanel.tsx` | ganze Datei | Ereignisliste des Monats/der Saison | `history/*`, R2-Artefakte | `historyLoad`; **nicht abschließend erfasst → §3** |
| Fenster-Umschalter | `historyArtifacts.ts:132,142` | „August 2026" · „Saison 2026 (1.3.–31.10.)"; außerhalb der Saison die **abgeschlossene** | R2 | `current: true/false` |
| Auswahl | `FirePage.tsx:248` | `selectedHistory` + Karten-Layer `HISTORY_SEL_LAYER_ID` | — | eigener Auswahl-Layer |
| `historyStatTiles` | `history/historyDetail.ts` | Kachelform, die `siteStatTiles` spiegelt | — | — |

### 1.9 Kennzahl-Kacheln, Skalen, Quellen (Karten-Readout)

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Detektions-Kacheln | `FirePage.tsx:1733` | Detektionen · Ortsfest · **Brände** oder **Kartiert** | Zähler | „—", wenn Layer aus |
| Karten-Lead | `FirePage.tsx:1742` | Quelle, jüngste Aufnahme, Erklärung „ortsfeste Quellen grau" | `latestAge` | — |
| Sub-Ansicht-Wechsel im Text | `FirePage.tsx:1757` | Link auf `companionView(dangerView)` | `dangerViews.ts` | — |
| **Nationale Skalen** | `FirePage.tsx:1766–1793` | DE·DWD (5 Stufen, 484 Stationen) und CH·BAFU (5 Stufen, Warnregionen) **nebeneinander, nie umgerechnet**; „geringe Gefahr" = DE 2 / CH 1; **AT-Lücke ausgewiesen** | `fireModel.ts:373,391` | zwei Notiz-Absätze |
| FWI-Klassen | `fireModel.ts:406–411` | 6 Klassen Low … Very Extreme mit Grenzen | GWIS | Legende |
| Quellenzeile | `FirePage.tsx:1810` | „Copernicus EMS GWIS · NASA FIRMS · DWD ICON-D2 · EFFIS · BAFU · keine Tracker" | — | Tablet gekürzt |
| Nachlauf-Kasten | `FirePage.tsx:1929` (`br-box is-lag`) | Layer, die dem Reglerstand nicht folgen | `laggingLayers` | nur wenn welche |

### 1.10 Querschnitt: Performance, Worker, Flags

| Element | Datei:Zeile | Was es anzeigt/kann | Datenquelle | Zustände |
|---|---|---|---|---|
| Performance-Tier | `FirePage.tsx:1122` | `tier` steuert Darstellungsaufwand | `PerfTier` | `high` (Std.) |
| Ereignis-Worker | `fireEventsWorker.ts`, `fireEventsClient.ts` | Clusterbildung ausgelagert | Worker | `clustersReady` |
| Feature-Flags | `estimate.ts:127` (`areaEstEnabled`), `thermalSites.ts:172` (`thermalSitesEnabled`), `historyEnabled()` | Flächenschätzung / Standortliste / Historie abschaltbar | Query/Env | an/aus; `?ta=0` |
| Routen-Preset | `FirePage.tsx:1244`, `fireRouteView.ts` | Deep-Link auf Reiter/Historie | — | setzt `mobileTab` |
| Selbst-Verifikation | jede `verify*()`-Funktion | headless Prüfläufe (D-12) | — | `verify:fire-model`, `verify:fire-time` |

---

## 2. Felder im Datenmodell, die das UI **nicht** zeigt

| Feld / Modul | Quelle | Warum es fehlt (Befund, nicht Vermutung) |
|---|---|---|
| `fireFuel` — Brennmaterial | `fireModel.ts:317`, `FIRE_LAYER_TIME` „WB4 — Werte vorbelegt" | Layer existiert, Zeitmodell existiert, **keine Datenquelle angebunden** |
| `AreaModel` / `predictInterval` (Kalibrierung) | `activity/calibration.ts`, `estimate.ts:120` | Modell wird geladen (`/fire/af/area-estimate-v1.json`), aber Konfidenzintervall (`lowHa`/`highHa`) erscheint nur im `title`, nicht als Chart |
| `LogLogFit`-Diagnostik (`r2`, `looRmseLn`, `tLast`, `sigma`) | `calibration.ts:60` | vorhanden, **nirgends dargestellt** |
| `FireFeatures` vollständig (`FEATURE_KEYS`) | `activity/features.ts:210` | nur `featuresSummary` als Liste + JSON-Kopie; kein Chart, keine Historie (kein Speicher) |
| `FireLabelTarget` / `FireLabelPair` / `isEligiblePair` | `features.ts:114,132,196` | Trainings-Zielgrößen — **reine Vorbereitung**, kein UI |
| `SpreadConfidence.meanStepM` / `passes` | `activity/dynamics.ts:81` | nur als Satz in `spreadConfidenceNote`, nicht als Zahl/Chart |
| `Dynamics` im Detail (`extendsBeyond`, `windAgreement`) | `dynamics.ts:121,248` | Ergebnis fließt in „Tendenz"/„Ausbreitung gegen Wind"; Zwischengrößen unsichtbar |
| `Intensity.freLabel` / `DAYNIGHT_LABEL` | `activity/intensity.ts:95,107` | importiert im Panel, Darstellungsort im gelesenen Bereich **nicht gefunden** — Verdacht auf toten Import (prüfen) |
| `ObservationIndex` / `observationFor` Radius 150 km | `activity/observation.ts:39` | nur als Wort „Sicht gegeben / nicht beobachtbar"; Radius und Überflug-Zellen unsichtbar |
| `ThermalSiteStats.frp.p50/p95/max` | `thermalSites.ts:76` | im Standort-Dossier als Text, **nicht** als Verteilung/Chart |
| `ThermalSite.cells` (Zellenraster) | `thermalSites.ts:88` | nur die Anzahl („N Zellen à 0,01°"), keine Geometrie auf der Karte |
| `facilityAlt` | `thermalSites.ts` | eine Zeile im Dossier, nicht auf der Karte |
| `previousIds` / `mergedFrom` / `splitFrom` | Registry | nur als Klammerzusatz in `DetailSubline`; **keine Verlaufsdarstellung** |
| `sources.effisExtra` | Registry | Textzusatz „N weitere Kartierungen im selben Cluster", nicht auflösbar |
| `emsActivations.ts` (`closed`, `code`) | `sources/emsActivations.ts` | offen/geschlossen als Wort, **kein Link auf die Aktivierung** |
| `dwdFireIndex.ts` (484 Stationen) | `sources/dwdFireIndex.ts` | Skala wird erklärt, aber der **Layer der amtlichen Stufe ist zurückgezogen** (`FIRE_BIT_ORDER[1] = null`) |
| `bafuFire.ts` | `sources/bafuFire.ts` | dito — CH-Stufe erklärt, Layer zurückgezogen |
| `euContext.ts` `BurntBucket 'archive'` | `fireState.ts:DEFAULT_BURNT_BUCKETS` | wählbar, aber **nicht Standard** (4,8 MB) — im UI nur als Chip |
| `clcMask.ts` | `clcMask.ts`, `FirePage.tsx:310` | geladen; sichtbarer Ausdruck im gelesenen Bereich nur indirekt über `landcover` |
| `fireCorroboration.ts` `LANDCOVER_COLOR` | dort | Farben definiert, im gelesenen UI nur `LANDCOVER_LABEL` verwendet |
| `swissProjection.ts`, `wfsAxis.ts` | `sources/` | Transport-Hilfen, kein UI (korrekt) |
| zurückgezogene Layer: `fireWind` (Bit 14?), `fireSpread`, amtliche Stufen | `fireModel.ts:60–74`, `fireTime.ts` Kommentar | **7 reservierte Bit-Plätze**; Ausbreitung ist in der Vorlage B1 gezeichnet, im Code aber zurückgezogen — **Kollision, siehe K-2** |

---

## 3. Nicht abschließend erfasst (vor Phase 2 zu klären)

1. `FireDossier.tsx` — Kartenreihenfolge und jede Zeile (habe die geteilten Bausteine, nicht die Komposition).
2. `FireHistoryPanel.tsx` + `FireHistoryChart.tsx` — Zeilen, Achsen, Einheiten, Empty-States.
3. `FireDriverCharts.tsx`, `FirePassChart.tsx` — Achsenbeschriftung, Einheiten, Farblogik, Empty-States.
4. `FireSatImagery.tsx`, `FireCogViewer.tsx` + `detail/{burnScar,burnIndex,cogTiff,sentinelGeo,worldCover}.ts` — Bedienelemente, Ladezustände, Fehlerfälle.
5. `FireLayerCard.tsx` — der aufgeklappte Steckbrief Zeile für Zeile.
6. `fireDeck.css` — die bestehenden Tokens (CSS-Variablen `--br-*`), Breakpoints und Sheet-Snaps.
7. `FirePage.tsx` Z. 1000–2194 — der Rest der Komposition (Dossier-Fuß, Sheet-Segmente, Mobile-Karten).

---

## 4. Kollisionen mit dem Auftrag — melden, nicht umbauen

**K-1 · „Vier Zeitfenster (24 h, 7 Tage, dieser Monat, Saison)" gibt es so nicht.**
Im Code sind das **drei verschiedene Achsen**: das Live-Rückblickfenster (24 h / 168 h,
`FIRE_LAYER_TIME.windowsH`), der Historie-**Modus** (`month` / `season` aus eigenen
R2-Artefakten, Hash `bh`) und quer dazu der EFFIS-**Umfang** in der Liste (`7 Tage` /
`ganze Saison`) plus die **Körbe** des Layers „frühere Brandflächen" (Saison / Archiv / Woche).
Ein gemeinsamer Vier-Stufen-Regler würde vier semantisch verschiedene Dinge verschmelzen.
→ Entscheidung von Ihnen nötig, **bevor** ich das Design zeichne.

**K-2 · Der Ausbreitungs-Layer ist zurückgezogen.**
`fireSpread` (und `fireWind`) sind im Code entfernt, ihre Bit-Plätze reserviert
(`fireModel.ts:60–74`); seither erzwingt **kein** Layer mehr die Stundenachse. Die
Command-Deck-Vorlage B1/B3/B4 zeigt aber „Ausbreitung (Modell)" als Gruppe und den
Ausbreitungspfeil auf der Karte. → Soll das Design ihn als **geplant** führen (leerer Layer mit
Grund) oder weglassen?

**K-3 · MUI + Recharts kollidiert mit dem Bestand.**
Es gibt **kein** UI-Framework im Feature: alles ist eigenes CSS (`fireDeck.css`, Klassen `br-*`)
plus handgeschriebene SVG-Charts (`FireDriverCharts`, `FirePassChart`, `FireHistoryChart`,
`FireMiniMap`) und ein bestehendes Token-System (`--br-*`, `src/designTokens.css`).
MUI danebenzusetzen bedeutet: zweite Styling-Engine (Emotion), ~90–110 kB gzip zusätzlich,
doppelte Tokens und ein Bruch im „Sand-and-ink"-Look. Recharts ~95 kB gzip für Charts, die
heute in ~15 kB eigenem SVG stehen und Empty-States mit Begründung tragen — die Recharts nicht
mitbringt. Meine Empfehlung steht in Phase 2 §2c; ich brauche dafür Ihr Ja zum Weiterlesen von
`fireDeck.css`.

**K-4 · „Keine Laufzeit-Requests" trifft nicht zu.**
Das Feature ruft heute zur Laufzeit ab: GWIS-WMS (`gwisFwi.ts`), FIRMS (`firmsHotspots.ts`),
ICON-D2 (`iconD2Relhum`, `iconD2Smi`), EFFIS, GeoSphere, Open-Meteo/ERA5
(`fireWeatherAtPoint.ts` — pro Brand beim Öffnen der Detailkarte). Nur `thermal-sites-v1.json`,
`area-estimate-v1.json` und die Historien-Indizes sind vorberechnete Artefakte.
→ Wenn Phase 2 „alles aus R2" annehmen soll, entwerfe ich ein UI für eine Datenlage, die es
nicht gibt. Bitte klarstellen: gilt die Regel **für Neues** oder ist der Umbau Teil des Auftrags?

**K-5 · Hit-Targets: 44 × 44 px sind heute nicht erfüllt.**
Hotspot-Punkte haben `circle-radius` 4 … ~5,6 px (zoomabhängig); der einzige 15-px-Ring ist der
**Auswahl**-Ring, kein Treffer-Layer. Es gibt keinen unsichtbaren Trefferradius für Punkte und
keine Auswahlliste bei Überlappung — nur eine Trefferzahl im Popup. Das ist genau Ihr
Kernproblem und in Phase 2 §2a zu lösen; ich nenne es hier, damit es als **Ist-Zustand**
dokumentiert ist und nicht als Designfehler von mir gelesen wird.

---

## 5. Offene Fragen (blockierend für Phase 2)

1. **K-1**: Wie sollen die vier Zeitbegriffe zusammengeführt werden — eine Achse mit
   Modus-Umschalter, oder bleiben Live / Historie / EFFIS-Umfang getrennt?
2. **K-2**: Ausbreitung als geplanter Layer führen oder weglassen?
3. **K-4**: Gilt „nur vorberechnete Artefakte" für den Bestand oder nur für Neues?
4. **§3**: Darf ich die sieben nicht abschließend erfassten Dateien vollständig lesen
   (≈ eine Session), oder trage ich sie als „unverändert übernehmen" ins Design?
5. Primär-Testgerät Android/Portrait: welche Breite als Referenz (360 / 390 / 412 px)?
6. Dark-Mode: gibt es ihn heute irgendwo in buscosun, oder wäre er neu?

---

**STOPP nach Phase 1.** Phase 2 (Karten-Interaktion, Detailansicht, Design-System, Wireframes,
Komponentenbaum, Zustandstabellen, Tokens, Umsetzungsreihenfolge) beginne ich erst auf Ihr OK
und nach Beantwortung der blockierenden Fragen 1–4.
