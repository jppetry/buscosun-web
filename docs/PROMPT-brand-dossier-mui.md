# Implementierungs-Prompt — Brand-Dossier mit MUI Material + MUI X Charts

> Für Claude Code CLI. Im Repo-Root `claude` starten und den Block unten einfügen.
> Einmalige MCP-Einrichtung, falls nötig:
> `claude mcp add playwright -- npx -y @playwright/mcp@latest`

---

```
Ziel: Setze die Detailansicht eines Brands (Brand-Dossier) im Brandradar von buscosun mit
MUI Material und MUI X Charts um — für Desktop, Tablet und Mobile. Die Design-Vorlagen und die
Spezifikation sind VERBINDLICH. Kein bestehendes Datum, kein Ehrlichkeitssatz darf verloren
gehen. Arbeite eigenständig bis fertig.

════════════════════════════════════════════════════════════════════════
0 — QUELLEN, DIE GELTEN
════════════════════════════════════════════════════════════════════════
Spezifikation (lies BEIDE vollständig, sie sind die Wahrheit über den Ist-Zustand):
  docs/konzept-brand-ui.md       — Phase-1-Inventar des gesamten Brandfeatures
  docs/konzept-brand-detail.md   — die Detailansicht + MUI-Spezifikation (§1 Ist-Zustand
                                    Zeile für Zeile, §2 MUI-Mapping, §3 Charts, §4 Layout,
                                    §5 Theme-Tokens, §6 die 20-Punkte-Prüfliste)
Pixel-Vorlagen (Brandradar Command-Deck, Ansichten B7/B8/B9):
  B7 = Desktop-Dossier · B8 = Tablet-Dossier · B9 = Mobile-Dossier (Accordion)
  Öffne die Vorlage im Browser-MCP und präge dir jede der drei Ansichten ein.
Bestehender Code (lies vor jeder Änderung):
  src/fire/FireDossier.tsx            — die Bühne, 197 Z., rein präsentational
  src/fire/FireFootprintPanel.tsx     — ALLE Dossier-Bausteine (Badge, RecordStats,
                                        DetailSubline, DetailKennzahlenRows, MappingRow,
                                        DetailFrpRows, DetailConfidenceRows,
                                        DetailEinordnungRows, CauseText, FeaturesRow,
                                        WeatherBlock, DriversBlock, DriversView,
                                        fireWindowAnchor, spreadConfidenceNote)
  src/fire/FirePassChart.tsx          — D1/D2 (ΣFRP je Überflug + Lücken)
  src/fire/FireDriverCharts.tsx       — D3 Windrose, D4 Treiber-Zeitreihe
  src/fire/FireSatImagery.tsx, FireMiniMap.tsx, fireDeck.css
  src/fire/detail/{fireWeatherAtPoint,fireDrivers,passTimeline,fireSatImagery}.ts
  src/fire/footprint/fireRegistry.ts, src/fire/activity/*, src/fire/anomaly/classify.ts
  src/mobile/useIsMobile.ts, src/designTokens.css, src/App.tsx

REGEL: FireDossier.tsx und die Detailkarte im Readout teilen sich JEDE Zeile aus
FireFootprintPanel.tsx. Diese eine Quelle bleibt. Wenn du eine Zeile umbaust, änderst du sie
für beide Orte — es darf keine zweite Fassung entstehen.

════════════════════════════════════════════════════════════════════════
1 — CHART-BIBLIOTHEK: MUI X CHARTS, NICHT RECHARTS
════════════════════════════════════════════════════════════════════════
Nimm @mui/x-charts. Begründung, damit die Entscheidung nachvollziehbar bleibt:
 • zieht theme.palette direkt, kein zweites Farbsystem neben MUI
 • slots/slotProps für Achsen, Tooltips, Legenden — dieselbe Optik wie die Material-Teile
 • ChartsReferenceLine und ChartDataProvider lösen zwei Dinge, die heute handgerechnet sind
   („jetzt"-Linie, synchroner Tooltip über gestapelte Zeilen)
Recharts wäre eine dritte Optik (MUI + Sand-Deck + Recharts) ohne Theming-Anbindung.

Pakete: @mui/material @emotion/react @emotion/styled @mui/icons-material @mui/x-charts
        (@mui/lab NUR falls du Masonry nimmst — s. Schritt 4)
Bundle-Budget: MUI + Emotion + X Charts ≈ 180–210 kB gzip. Ersetzte SVG-Charts ≈ −15 kB.
Prüfe nach dem Build die Bundle-Größe und nenne sie im Abschlussbericht.

════════════════════════════════════════════════════════════════════════
2 — THEME ZUERST (bevor eine Komponente entsteht)
════════════════════════════════════════════════════════════════════════
Lege ein Theme an (src/theme/buscosunTheme.ts) und speise es AUS den bestehenden Werten —
erfinde keine Farbe. Werte stehen in fireModel.ts, brandradarMeta.ts, designTokens.css:

  palette.fire.low #8FBF6B · moderate #D6D24E · high #E9A33C · veryHigh #D4632E
  palette.fire.extreme #A32B1E · veryExtreme #6B1410
  palette.fire.day #D4632E (Tag-Balken) · night #5C5447 (Nacht-Balken)
  palette.fire.static (STATIC_GREY) · hatch #C9B98F (Beobachtungslücken)
  palette.fire.detection #FF6B3D · mark #FFB03D · spread #E9A33C
  background.default #EDE6D3 · background.paper #FAF6EA
  text.primary #2C2A26 · text.secondary #5C5447 · text.disabled #8B7355 · divider #E0D6BE

  typography.fontFamily = "'League Spartan', system-ui, sans-serif"
  shape.borderRadius = 12 ; Karten: variant="outlined", borderColor: 'divider', KEINE Elevation
  components.MuiCard.defaultProps = { variant: 'outlined' }
  transitions: Karten-Hover 120 ms ease-out, Accordion 200 ms
  Chart-Einblendung AUS (skipAnimation) — eine animierte Balkenreihe suggeriert Verlauf,
  wo Messpunkte stehen. prefers-reduced-motion respektieren.

Dark-Mode NICHT in diesem Auftrag: die FWI-Rampe ist auf Sand kalibriert, Stufe 1/2 fällt
auf Ink unter 3:1. Als eigener Schritt mit zweiter Rampe, später.

WICHTIG SVG-Schrift: jedes <text> in eigenen SVG-Kindern (Schraffur-Labels, Windrose) trägt
font-family AUSDRÜCKLICH. Ohne sie erbt ein SVG-Text die Browser-Standardschrift, nicht die
des Decks (dokumentierter Befund B1).

════════════════════════════════════════════════════════════════════════
3 — KOMPONENTENBAUM UND MUI-MAPPING
════════════════════════════════════════════════════════════════════════
Baue FireDossier.tsx auf MUI um, Struktur wie in der Vorlage:

<FireDossier>                       Stack spacing={2}
├─ DossierLead                      Stack row (mobil: IconButton ← + ToggleButtonGroup)
├─ DossierHeader                    Card > CardContent
│  ├─ Titel                          Typography variant="h5" + <StatusBadge> (Chip)
│  ├─ Unterzeile                     Typography variant="body2" color="text.secondary"
│  ├─ Chips                          Stack row spacing={0.5} → Chip size="small"
│  ├─ <KeyStats>                     Grid columns={{xs:2, md:4}} → <StatTile>
│  └─ <FactList>                     Stack divider={<Divider flexItem/>} → <FactRow>
└─ DossierGrid                      Grid container columns={{xs:1, md:2}}
   ├─ <CourseCard>       Card ─ BarChart (D1) + Lücken-Overlay (D2)
   ├─ <WeatherCard>      Card ─ Grid von <WeatherTile>
   ├─ <DriversCard>      Card ─ <DriverVerdict> + <WindRose> + <FactList> + LineCharts (D4)
   ├─ <SatImageryCard>   Card ─ Grid 3 Kacheln (vorher/während/nachher)
   ├─ <SiteCards>        Card ×3 (nur bei record.anomaly)
   ├─ <AssessmentCard>   Card ─ <FactList> + <CauseAlert>
   └─ <FeaturesCard>     Card ─ Table size="small" + Copy-IconButton
   aside: <MiniMapCard>  Card ─ MapLibre + <MapNote> + <Legend>

Props-Signaturen (Typen, keine Implementierung vorwegnehmen):
  interface FireDossierProps {
    record: FireRecord | null; nowMs: number;
    atContext?: AtWarnContext | null; detections?: readonly FirmsRow[] | null;
    breakpoint: 'mobile' | 'tablet' | 'desktop';   // ersetzt compact/mobile
    aside?: React.ReactNode; lead?: React.ReactNode; extra?: React.ReactNode;
  }
  interface StatTileProps {
    label: string; value: React.ReactNode; caption?: React.ReactNode;
    tone?: 'mapped'|'estimate'|'none'|'growing'|'stable'|'declining';
    dotColor?: string; reason?: string;            // reason → Tooltip, nie stiller Wert
  }
  interface FactRowProps { term: string; children: React.ReactNode; reason?: string; wide?: boolean }
  interface DriverVerdictProps {
    level: DriverLevel; hours: number; score: number;
    reasons: { text: string; points: number }[]; note?: string;
  }

Mapping der bestehenden Klassen:
  .br-ds-card          → Card variant="outlined"
  .br-ds-cardhead      → CardHeader, title = Typography variant="overline" (Ton je Sektion)
  .fire-fp-src/-assess → Chip size="small" variant="outlined"
  .br-stat             → Grid + Paper: label overline, Wert h4, Untertitel caption
  dl.fire-fp-dl        → KEIN dl mehr: FactRow als Grid 34/66, mobil gestapelt
  title="…"            → Tooltip enterTouchDelay={0} describeChild
  .br-empty            → Alert severity="info"|"warning" mit action={<Button>}
  „… werden geladen"   → Skeleton variant="rounded" IM Chart-Maß (kein Spinner, kein Sprung)
  .br-box (Vorbehalt)  → Alert severity="info" icon={false} variant="outlined"
  .br-ds-cause         → Alert severity="warning" variant="outlined" + AlertTitle="Ursache"
  .br-more             → Button fullWidth variant="text" endIcon={<ExpandMore/>}
  FeaturesRow          → Table size="small" + IconButton <ContentCopy/> → Snackbar „kopiert"
  „Je Überflug"        → TableContainer + Table size="small" stickyHeader, maxHeight;
                         mobil stattdessen List von ListItem (5 Spalten brechen auf 412 px)

════════════════════════════════════════════════════════════════════════
4 — LAYOUT JE BREAKPOINT
════════════════════════════════════════════════════════════════════════
Desktop ≥1280 px (Vorlage B7): Registry links · Dossier Mitte · aside rechts (sticky).
  Mitte 2-spaltig; Verlauf, Satellitenbild, Einordnung, Merkmale mit gridColumn:'1 / -1'.
  Karten sind ungleich hoch → Masonry (@mui/lab) ODER Grid mit alignItems:'start'.
  ENTSCHEIDE selbst und begründe im Bericht; wenn du @mui/lab vermeiden willst: Grid.
  Chart-Breite 360 SVG-Einheiten (12-px-Schrift rendert dann als 12 px).
Tablet 768–1279 px (B8): 2 Spalten, aside IM Raster als erste Karte der zweiten Spalte;
  Verlauf/Wetterführung/Satellitenbild/Einordnung/Merkmale volle Breite. Chart-Breite 620.
Mobile <768 px (B9), Referenz 412 px Android Portrait:
  Eigener Screen, KEIN Sheet-Segment: AppBar mit IconButton ← „Brände" + ToggleButtonGroup
  Karte/Dossier. Kacheln 2×2. FactRows gestapelt (term als overline über dem Wert).
  Die Karten als Accordion-Stapel: Verlauf und Wetterlage per defaultExpanded OFFEN,
  Wetterführung / Satellitenbild / Einordnung / Je Überflug / Merkmale ZU
  (offen wären es ≈ 4 500 px Scrolltiefe). Chart-Höhe 180, Breite 340.
  D4 auf Mobil zunächst ZWEI Zeilen (Wind, rel. Feuchte) + Button „Alle fünf Größen zeigen" —
  die anderen drei bleiben erreichbar, nicht gestrichen.
  Alle Tooltip-Gründe ZUSÄTZLICH als sichtbare caption (Touch hat kein Hover).
  Hit-Targets ≥ 44 px, src/mobile-Primitives + safeArea.css.
Koppel die Breakpoints an useIsMobile.ts, nicht an eigene Media-Queries.

════════════════════════════════════════════════════════════════════════
5 — DIE FÜNF DIAGRAMME
════════════════════════════════════════════════════════════════════════
D1 · Verlauf — ΣFRP je Überflug (BarChart)
  xAxis: scaleType 'time'; yAxis: scaleType 'log', label 'ΣFRP (MW)', min 0.1
  Balkenfarbe je Datum: Tag palette.fire.day, Nacht palette.fire.night (colorMap bzw. sx auf
  .MuiBarElement-root). Legende hidden; die Erklärzeile steht als Typography darunter.
  Überflug OHNE FRP ist KEIN Balken der Höhe 0 (Falschaussage) → zweite ScatterSeries,
  markerSize 6, weiß gefüllt, Kontur text.disabled, y = Achsenminimum,
  Tooltip „N Px ohne FRP-Angabe".
  „jetzt": ChartsReferenceLine x={nowMs}, strokeDasharray '4 4', palette.fire.extreme, label.
  Achsen entzerren über xAxis.tickInterval / tickLabelInterval — nicht handgerechnet.
D2 · Beobachtungslücken — kann MUI X nicht als Serie. Als children im Chart-Slot ein
  <rect fill="url(#hatch)"> je Lücke, positioniert über useXScale(). Das ist der EINZIGE Ort,
  an dem eigenes SVG in MUI X eingehängt wird. Schwelle GAP_HOURS (6 h) aus passTimeline.ts,
  Farbe palette.fire.hatch, längste Lücke in der Caption.
D3 · Windrose — BLEIBT eigenes SVG (FireDriverCharts.tsx übernehmen).
  MUI X hat kein Polarchart; RadarChart kann weder die gestapelten Stärkeklassen noch den
  zweiten Zeiger mit ANDERER Konvention (Rose = woher der Wind, roter Pfeil = wohin der
  Brandschwerpunkt wandert). Diese Unterscheidung ist der inhaltliche Kern der Grafik.
  Ändere nur: Farben aus theme.palette, Legende als Chip-Reihe. Aufwand ≈ 0.
D4 · Treiber-Zeitreihe — NICHT ein Chart mit fünf Y-Achsen (unlesbar), sondern fünf
  gestapelte Charts mit geteilter X-Achse in einem <ChartDataProvider> (gemeinsamer
  ChartsTooltip trigger="axis" — das ist neu und ein echter Gewinn):
    Wind km/h (+ Böen als zweite Serie, strokeDasharray '4 3') · Temperatur °C ·
    rel. Feuchte % (min 0, max 100 FEST) · Niederschlag mm als BarChart · ISI (ohne Einheit)
  Farben: --br-slate / --br-terra / --br-steel / --br-steel / --br-red → palette-Äquivalente.
  Detektionsspanne als Band in JEDER Zeile (ChartsReferenceLine-Paar bzw. AxisHighlight,
  palette.fire.extreme bei 7 % Deckkraft). Tageslinien je Mitternacht.
  connectNulls: false ist PFLICHT — „Stunden ohne Wert sind Lücken in der Linie, keine
  Nullen" ist eine Zusage an den Nutzer; connectNulls: true würde sie brechen.
D5 · Historien-Chart (FireHistoryChart.tsx): NICHT anfassen. Es ist nicht Teil der
  Spezifikation und nicht abschließend erfasst (konzept-brand-ui.md §3).

NEUE CHARTS — nur diese eine, und nur wenn Zeit bleibt:
  FRP-Verteilung des Standorts (ThermalSiteStats.frp p50/p95/max) als Skala mit dem
  Live-ΣFRP als Marker — sagt „liegt im Anlagenrahmen" auf einen Blick. Empfohlen.
NICHT bauen:
  • Flächenentwicklung — es gibt keine Historie je Brand (kein Speicher über Sitzungen);
    das Chart wäre immer leer. Stattdessen bleibt die Zeile „Kartierung läuft 1–3 Tage nach".
  • Konfidenz-Verteilung — FIRMS-Konfidenz ist NICHT Brandwahrscheinlichkeit; ein Pie würde
    genau das suggerieren. Erst nach ausdrücklicher Freigabe.

════════════════════════════════════════════════════════════════════════
6 — FEHLENDE DATEN: DREI STUFEN, KONSEQUENT
════════════════════════════════════════════════════════════════════════
Bei DACH-Bränden ist Fehlen der Normalfall. Kein leeres Chart, keine 0, kein Platzhalter.
 1) Wert fehlt, Grund bekannt → <StatTile value="—" reason={missingReason(r,'…')} />
    Desktop Tooltip, Mobil zusätzlich sichtbare caption. NIE 0, NIE leer.
 2) Ganzer Block fehlt, Grund bekannt → Alert severity="info" variant="outlined" mit dem
    BESTEHENDEN Satz, z. B. „Keine Stundenreihe für das Brandzeitfenster — ohne sie gibt es
    weder Windrose noch Einstufung". Vor jedem Chart ein Guard, der bei leerer Reihe hierher
    fällt.
 3) Block nicht anwendbar → Karte NICHT rendern (heute schon: FeaturesRow ohne Detektion,
    satEnabled() === false). Kein leerer Rahmen.

════════════════════════════════════════════════════════════════════════
7 — DIE 20 SÄTZE, DIE NICHT FALLEN DÜRFEN
════════════════════════════════════════════════════════════════════════
Prüfliste aus konzept-brand-detail.md §6. Gehe sie am Ende EINZELN durch und belege je Punkt
die Datei/Zeile in deinem Bericht:
 1 „—" mit Grund statt 0 (vier Kennzahlen, alle Faktenzeilen)
 2 Fläche mit Herkunft (kartiert / geschätzt / Obergrenze / keine)
 3 „ein Pixel deckt 14–60 ha" bei Obergrenzen
 4 ΣFRP „Leistung, keine Fläche und keine Energie"
 5 Ausbreitung „Verlagerung zwischen Momentaufnahmen, nicht Frontgeschwindigkeit"
 6 spreadConfidenceNote AUFGELÖST (nie „entweder/oder")
 7 Log-Achse D1 + „Balken sind Messpunkte, keine Kurve"
 8 Schraffur > 6 h + längste Lücke in der Caption
 9 connectNulls:false in D4 + der Satz dazu
10 Windrose: zwei Konventionen getrennt (woher / wohin)
11 „Gesamt-FWI steht bewusst nicht hier" + GWIS-Link
12 ERA5-Rückfall benannt („kein ICON-Archiv; Reanalyse ist gröber")
13 Zeitanker Detektion vs. EFFIS-Branddatum (EFFIS_ANCHOR_NOTE)
14 GeoSphere-Warntext als WÖRTLICHES Zitat, „keine Brandbestätigung"
15 Ursache: „keine Quelle" + Einordnungshilfen mit Herkunft
16 „eigene Ableitung, kein Nachweis" bei Anlage/Abweichung
17 Merkmalsatz-Version + „kein Speicher über Sitzungen"
18 Kartennotiz sagt, WAS gezeichnet ist
19 „Farben abgeleitet — nicht amtlich"
20 Deckel „letzte 8 von N Überflügen" ausgesprochen
Dazu aus der Vorlage: Satellitenbild-Vorbehalt „Ein fehlendes Bild heißt ‚Wolken', nicht
‚kein Brand'".

FARBEN: Die FWI-Rampe grün→gelb→orange→rot ist für Deuteranopie zwischen Stufe 1 und 2 nicht
trennscharf. Sie ist aber die GWIS-Rampe und damit die Konvention der Quelle. Rampe BEHALTEN,
dafür immer den Klassennamen neben der Farbe („High (21,3–38,0)") — steht heute schon dort.
Umfärben würde die Karte von der amtlichen Vorlage entkoppeln.

════════════════════════════════════════════════════════════════════════
8 — REIHENFOLGE (je Schritt eine Session)
════════════════════════════════════════════════════════════════════════
S1  Theme + StatTile/FactRow/Overline-Primitives; Kopf des Dossiers umgestellt. Lauffähig.
S2  Karten-Hüllen (Card/CardHeader/Alert/Skeleton) für alle Sektionen; Inhalte noch aus den
    bestehenden Bausteinen. Nach S2 ist die Optik MUI, der Text unverändert.
S3  D1 + D2 in MUI X BarChart inkl. Scatter für „ohne FRP" und Lücken-Overlay.
S4  D4 als fünf gestapelte Charts mit ChartDataProvider; Windrose nur umfärben.
S5  Responsive: Tablet-Raster, Mobile-Screen mit Accordion und Touch-Captions.
S6  Prüfliste §7 abarbeiten, Bundle messen, lint/typecheck.
Nach JEDEM Schritt: Dev-Server läuft, keine Konsolenfehler, Screenshot.

════════════════════════════════════════════════════════════════════════
9 — FONTS: EINMAL RÜCKFRAGEN
════════════════════════════════════════════════════════════════════════
Die Vorlage nutzt League Spartan als einzige Schrift. Frag mich EINMAL: (a) als Google-Font
global ergänzen oder (b) auf die bestehende App-Schrift mappen. Danach ohne weitere
Rückfrage weiterbauen.

════════════════════════════════════════════════════════════════════════
10 — STARTEN UND VISUELL PER MCP VERIFIZIEREN (Pflicht, iterativ)
════════════════════════════════════════════════════════════════════════
Dev-Server starten (npm run dev), Brandradar öffnen, einen Brand markieren, Bühne „Dossier".
Screenshots in DREI Viewports: Desktop 1440×900, Tablet 1024×768, Mobile 390×844.
Jeden Screenshot direkt mit B7 / B8 / B9 vergleichen: Kartenreihenfolge, Abstände,
Farben/Token, Typo-Größen, Kacheln, Chart-Achsen und -Einheiten, Legenden, Accordion-Zustände.
Abweichung = Fehler → fixen, erneut aufnehmen.
Interaktiv testen: Brand wechseln (Liste ↔ Karte ↔ Dossier), „↗ Bühne zurück", Tooltip-Gründe,
„JSON kopieren" → Snackbar, Accordion auf/zu, D4-Umschalter auf Mobil, Tastatur-Navigation
(Tab durch Chips/Accordion/Tabelle), Screenreader-Labels der Charts.
Konsole auf Fehler prüfen. lint + typecheck laufen lassen und alles beheben, was du eingebaut
hast. Schleife bis jede Ansicht pixelnah der Vorlage entspricht.

WICHTIG: Die Command-Deck-Vorlagen und ihre Laufzeit (support.js) sind Vorlage, NICHT App-Code
— nichts davon übernehmen.

════════════════════════════════════════════════════════════════════════
ABSCHLUSSBERICHT
════════════════════════════════════════════════════════════════════════
Nenne: geänderte/neue Dateien · Masonry-oder-Grid-Entscheidung mit Begründung ·
Bundle-Größe vorher/nachher · Font-Entscheidung · die Prüfliste §7 Punkt für Punkt mit
Datei:Zeile · was du NICHT gebaut hast und warum (Flächenentwicklung, Konfidenz-Verteilung,
D5) · die finalen MCP-Screenshots der drei Viewports neben B7/B8/B9.
```
