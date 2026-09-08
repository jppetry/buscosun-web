# Brand-Dossier — Detailansicht: Ist-Zustand und MUI-Spezifikation

> Stand: 2026-09-06 · Ergänzung zu `docs/konzept-brand-ui.md` (Phase 1) · **Design-Only**
> Gelesen: `FireDossier.tsx` (197 Z., vollständig), `FireFootprintPanel.tsx` (Bausteine, vollständig),
> `FirePassChart.tsx` (116 Z., vollständig), `FireDriverCharts.tsx` (vollständig, Symbolebene),
> `detail/{fireWeatherAtPoint,fireDrivers,passTimeline}.ts` (Signaturen).

## Vorbemerkung — die MUI-Entscheidung

Sie haben MUI gewählt; ich baue darauf. Einmal der Preis, damit er dokumentiert ist und nicht
später überrascht: das Feature hat heute **kein** Framework — eigenes CSS (`fireDeck.css`,
Klassen `br-*`), Tokens `--br-*`, fünf handgeschriebene SVG-Charts (≈15 kB). MUI v6 +
Emotion + MUI X Charts kosten **≈ 180–210 kB gzip** zusätzlich. Der Gegenwert: einheitliche
Komponenten, `Skeleton`/`Alert`/`Tooltip` fertig, Tastatur und ARIA fertig, Dark-Mode über ein
Theme statt über 40 CSS-Variablen.

**Chart-Bibliothek: MUI X Charts, nicht Recharts.** Recharts wäre eine zweite Fremd-Optik neben
MUI und bringt kein Theming aus dem MUI-Theme. MUI X Charts (`@mui/x-charts`) nimmt
`theme.palette` direkt, hat `slots`/`slotProps` für Achsen und Tooltips und kann alle fünf
Diagramme unten — mit **einer** Ausnahme, die ich unten begründe (Windrose bleibt SVG).

---

## 1. Ist-Zustand — die Detailansicht Zeile für Zeile

Zwei Orte, **eine** Quelle: `FireDossier.tsx` rendert die Bühne in der Mitte, das Readout die
Inline-Detailkarte — beide aus denselben Bausteinen in `FireFootprintPanel.tsx`. Konfidenz und
Methode stehen im Dossier unter „Einordnung", in der Detailkarte unter „Kennzahlen" —
*sortiert, nicht gestrichen*.

### 1.1 Leerzustand

`FireDossier.tsx:66` — Karte mit Eyebrow „Dossier" und dem Satz: „**Kein Brand markiert.** Ein
Klick auf einen Brand in der Registry links oder auf der Karte öffnet hier sein Dossier —
Kennzahlen, Verlauf je Überflug, Wetterlage am Brandort, Einordnung und Merkmale."
Mobil entfällt „links". Das `aside` (Minikarte + Legende) wird auch im Leerfall gerendert.

### 1.2 Kopf (`br-ds-head`)

| Zeile | Quelle | Inhalt |
|---|---|---|
| Titel | `recordName(r)` + `<Badge>` | Ortsname (oder „bei X", oder Koordinate) + Abzeichen AKTIV/BEOBACHTET/ORTSFEST/ABGEKLUNGEN/ANLAGE/ABWEICHUNG |
| Unterzeile | `DetailSubline` | Region · Koordinate (3 Dez.) · `<code>id</code>` · „zuvor N×" · „zusammengewachsen aus N Detektionsgruppen dieser Sitzung" · „aus `id` hervorgegangen" |
| Chips rechts | `r.method`, `r.confidence.assessment` | Methoden-Chips (`METHOD_LABEL`) + Bewertungs-Chip (`LEVEL_LABEL`, `title` = Begründungen) |
| 4 Kennzahlen | `RecordStats wide` | **Fläche** · **Detektionen** · **Stärke** · **Tendenz** — je Wert Label, Zahl, Untertitel; fehlend „—" **mit Grund im `title`**, nie 0 |
| Kennzahlen-Zeilen | `DetailKennzahlenRows` | Status · Fläche (inkl. „ein Pixel deckt 14–60 ha", Obergrenze/kartiert/Schätzung) · **Kartierung** (`MappingRow`: EFFIS-Fläche, Branddatum, Ende, Stand, Link, weitere Kartierungen — **oder** `mappingGapText` als Grund) · Schätzung (`estimateLabel` + Vergleich zur Kartierung) · Erstdetektion · Letzte Detektion (+ Alter) · Hotspots/Überflüge/Satelliten |
| FRP-Zeilen | `DetailFrpRows` | ΣFRP (Fenstersumme, „Leistung, summiert über Pixel und Überflüge, keine Fläche") · Ausbreitung (Richtung, m/h über N h, „Verlagerung zwischen Momentaufnahmen, nicht Frontgeschwindigkeit") · Konfidenz der Richtung (Überflüge, Detektionen, Zeitspanne, mittlerer Schritt + `spreadConfidenceNote`) · FRE (`freLabel`) · Überflüge (`DAYNIGHT_LABEL`, mittlere Pixelbreite, Schwadrand-Hinweis) · **Je Überflug**: Liste der letzten 8 von N (Zeitstempel, Satellit, ☀/☾, Px, MW) mit Fußnote „10-min-Regel, kein Speicher über Sitzungen" |

**Die vier Kennzahlen im Detail** (`RecordStats`, `FireFootprintPanel.tsx:195`):

| Kachel | Wert | Untertitel | Farbe / `title` |
|---|---|---|---|
| Fläche | `areaValue(r)` („128 ha") oder „—" | `areaOrigin(r)`: „EFFIS kartiert" (Sage) / „geschätzt" / „Obergrenze (Raster)" / „keine Fläche"; `wide` ergänzt das Intervall | `title` = Schätzintervall bzw. `areaLabel` |
| Detektionen | `r.hotspots` oder „—" | „letzte vor X" (+ „N Überflüge" bei `wide`) / „keine im Fenster" | `title` = Überflüge + Satelliten bzw. `missingReason` |
| Stärke | `strengthLabel(cluster)` | „ΣFRP · N km Ausdehnung" | Farbpunkt `clusterColorOf` bzw. `STATIC_GREY`; `title` erklärt „Leistung, keine Fläche/Energie; Hülle ≠ verbrannte Fläche" |
| Tendenz | `STATE_LABEL` (wachsend/stabil/abnehmend) / „kein Signal" / „—" | „N Überflüge" bzw. „Sicht gegeben"/„nicht beobachtbar"/„Beobachtung unbestimmt" | Klasse `is-${state}`; `title` = `stateNote`/`observationNote` |

### 1.3 Raster (`br-ds-grid`) — sechs bis acht Karten

| Karte | Komponente | Inhalt | Leerzustand |
|---|---|---|---|
| **Verlauf** (rot) | `DetailVerlauf` → `FirePassChart wide` | „ΣFRP je Überflug · log-Achse · Lücken > 6 h schraffiert" | `passTimeline` = `null` ⇒ **nichts** gerendert |
| **Wetterlage am Brandort** (steel) | `WeatherBlock` | Zusammenfassung · Kachel „Bei Erstdetektion" · „Bei letzter Detektion" · „Brandtag" (Tmax/RHmin/Böen max/mm, „bis jetzt" bei `partial`) · „Vortage" (mm in den 24 h vor Erstdetektion, `rainLabelLive`) · „Jetzt" · Notizen-Liste · Quellenzeile mit dem Satz „das Gitter kennt den Brand nicht" | `loading` ⇒ „Modellwerte für den Brandort werden geladen …"; ERA5-Rückfall mit eigenem Satz |
| **Wetterführung** (terra) | `DriversBlock` → `DriversView` | Einstufung `DRIVER_LABEL` + „abgeleitete Einstufung aus N Modellstunden, Punktsumme ±N" · Begründungsliste mit ±Punkten · `DRIVER_RULE_TEXT` · **Windrose** · Zeilen: Vorherrschender Wind (Vektormittel, Beständigkeit vs. `STEADY_MIN`) / Ausbreitung gegen Wind (Winkeldifferenz + `spreadVsWindLabel`) / FFMC · ISI bei Erstdetektion (+ Vorlauf-Hinweis, übersprungene Stunden) · **Zeitreihe** · `FIRE_INDEX_NOTE` · Hinweis „Gesamt-FWI steht bewusst nicht hier" + GWIS-Link · Quellenzeile | `windowHours.length === 0` ⇒ „Keine Stundenreihe für das Brandzeitfenster — ohne sie gibt es weder Windrose noch Einstufung" (+ erste Notiz); `rating === null` ⇒ „Keine Einstufung — für den Zeitraum der Detektionen liegt keine Modellstunde vor" |
| **Satellitenbild** (stone) | `SatImageryBlock` | „Vorher · während · nachher — wenn die Wolken es zulassen" | nur wenn `satEnabled()` |
| **Standort & Anlage** ×3 (`extra`) | `AnomalySiteCards` | Standort & Anlage · Signatur im Archiv · Im Fenster & Prüfung (s. Phase 1 §1.7) | nur bei `r.anomaly` |
| **Einordnung & Bestätigung** (stone) | `DetailConfidenceRows` + `DetailEinordnungRows` + `CauseText` | Konfidenz (FIRMS + Bewertung + Begründungsliste) · Methode · Ort (Quelle + Entfernung + GeoNames-Lizenz) · Landbedeckung (bis 4 Anteile mit Farbschwatch, „EFFIS/CORINE") · „Anlage?" · Kartierung (EFFIS-Kennung, Branddatum, Stand, % Natura 2000) · Copernicus EMS (Code, Name, offen/geschlossen, **Link auf die Aktivierung**) · GeoSphere-Kontext (**wörtliches Zitat** in `<q>`, „keine Brandbestätigung") · Kasten **Ursache** | Ursache immer: „**keine Quelle** — Brandursachen ermitteln Polizei und Forstbehörden …" + Einordnungshilfen, sonst „auch keine Einordnungshilfe" |
| **Merkmale** (stone) | `FeaturesRow` | Merkmalsatz `v1` als Schlüssel/Wert-Liste + Knopf „JSON kopieren" (→ „kopiert ✓", 1,5 s) + Erklärzeile | ohne Detektion **und** ohne EFFIS: **nicht gerendert** |
| `aside` | `FireMiniMap` + `DossierMapNote` + `DossierLegend` | Desktop: eigene Spalte rechts; Tablet/Mobil: im Raster | Kartennotiz sagt, **was** gezeichnet ist (Kartierung / Detektionsraster / nur Ort / umschließender Kasten) |

### 1.4 Die fünf Diagramme im Ist-Zustand

| # | Chart | Datei | Achsen / Einheiten | Farblogik | Leerzustand |
|---|---|---|---|---|---|
| D1 | ΣFRP je Überflug (Balken) | `FirePassChart.tsx` | X = Zeit (`ticks`, Tageslinien), Y = **log**, MW | Tag `#D4632E`, Nacht `#5C5447`, ohne FRP = weißer Kreis mit Kontur | `null` ⇒ nichts |
| D2 | Beobachtungslücken | dito (Overlay) | Schraffur 45°, `#C9B98F`, > `GAP_HOURS` (6 h) | — | Label erst ab 110 Einheiten Breite |
| D3 | Windrose | `FireDriverCharts.tsx` | 8–16 Sektoren, Radius = Stundenzahl, 2 Ringe | 4 Stärkeklassen `--sand-300 … --stone-600`; gestrichelt = vorherrschende Richtung; **roter Pfeil = wohin** sich der Schwerpunkt verlagert (andere Konvention, deshalb eigener Zeiger) | `maxSector === 0` ⇒ keine Ringe |
| D4 | Treiber-Zeitreihe (5 Zeilen) | dito | Zeilen: Wind km/h (+ Böen gestrichelt) · Temperatur °C · rel. Feuchte % (0–100) · Niederschlag mm (Balken) · ISI (ohne Einheit); X = Stunden, Tageslinien | `--br-slate` / `--br-terra` / `--br-steel` / `--br-steel` / `--br-red`; Detektionsspanne als Band | **Stunden ohne Wert sind Lücken in der Linie, keine Nullen** |
| D5 | Historien-Chart | `FireHistoryChart.tsx` | *nicht abschließend erfasst* | — | — |

---

## 2. MUI-Spezifikation der Detailansicht

### 2.1 Komponentenbaum (Typen, keine Implementierung)

```
<FireDossier>                          Stack | Grid (spacing={2})
├─ DossierLead                         Stack direction=row  (mobil: IconButton ← + ToggleButtonGroup)
├─ DossierHeader                       Card > CardHeader + CardContent
│  ├─ title                            Typography variant="h5" + <StatusBadge>
│  ├─ subline                           Typography variant="body2" color="text.secondary"
│  ├─ chips                             Stack direction=row spacing={0.5} → Chip size="small"
│  ├─ <KeyStats>                        Grid container columns={{xs:2, md:4}} → <StatTile>
│  └─ <FactList>                        dl-Ersatz: Stack von <FactRow> (s. 2.3)
└─ DossierGrid                         Grid container columns={{xs:1, md:2, lg:3}}
   ├─ <CourseCard>        Card  ─ BarChart (D1)
   ├─ <WeatherCard>       Card  ─ Grid von <WeatherTile>
   ├─ <DriversCard>       Card  ─ <DriverVerdict> + <WindRose> + <FactList> + LineChart (D4)
   ├─ <SatImageryCard>    Card  ─ ImageList | Tabs (vorher/während/nachher)
   ├─ <SiteCards>         Card ×3
   ├─ <AssessmentCard>    Card  ─ <FactList> + <CauseAlert>
   └─ <FeaturesCard>      Card  ─ Table size="small" + CopyButton
   aside: <MiniMapCard>   Card  ─ MapLibre + <MapNote> + <Legend>
```

**Props-Signaturen** (nur Typen):

```ts
interface FireDossierProps {
  record: FireRecord | null;
  nowMs: number;
  atContext?: AtWarnContext | null;
  detections?: readonly FirmsRow[] | null;
  breakpoint: 'mobile' | 'tablet' | 'desktop';   // ersetzt compact/mobile
  aside?: React.ReactNode;
  lead?: React.ReactNode;
  extra?: React.ReactNode;
}
interface StatTileProps {
  label: string; value: React.ReactNode; caption?: React.ReactNode;
  tone?: 'mapped' | 'estimate' | 'none' | 'growing' | 'stable' | 'declining';
  dotColor?: string; reason?: string;            // → Tooltip, nie stiller Wert
}
interface FactRowProps { term: string; children: React.ReactNode; reason?: string; wide?: boolean }
interface DriverVerdictProps { level: DriverLevel; hours: number; score: number; reasons: { text: string; points: number }[]; note?: string }
```

### 2.2 MUI-Mapping je Ist-Element

| Ist (`br-*`) | MUI | Begründung / Props |
|---|---|---|
| `.br-ds-card` | `Card variant="outlined"` | `sx={{ borderColor: 'divider', borderRadius: 2 }}` — die Vorlage hat 1 px Rahmen, keine Elevation |
| `.br-ds-cardhead` + `Eyebrow` | `CardHeader` mit `title={<Overline>}` und `subheader` | Eyebrow = `Typography variant="overline"` mit `color` je Ton (`red/steel/stone/warn/terra`) |
| `.br-ds-title` + `Badge` | `Typography variant="h5"` + `Chip size="small" color=…` | Badge-Farben aus `BR_BADGE_LABEL` → `theme.palette.fire.*` |
| `.fire-fp-src`, `.fire-fp-assess` | `Chip size="small" variant="outlined"` | `title` → `Tooltip` |
| `.br-stat` (4 Kacheln) | `Grid` + `Card variant="outlined"` oder `Paper` | Label `overline`, Wert `h4`, Untertitel `caption`; `dot` = `Box` 8 px `borderRadius="50%"` |
| `dl.fire-fp-dl` | **kein** `dl` mehr: `Stack divider={<Divider flexItem />}` von `FactRow` | `FactRow` = `Grid` 2-spaltig (`term` 34 %, Wert 66 %), mobil gestapelt — ein `dl` bricht auf 360 px unschön |
| `title="…"` (überall) | `Tooltip enterTouchDelay={0} describeChild` | **Pflicht**: die Gründe hinter „—" sind heute nur `title` und auf Touch unerreichbar → auf Mobil zusätzlich als `caption` unter dem Wert |
| `.br-empty` (Leerzustände) | `Alert severity="info"` / `"warning"` mit `action={<Button>}` | „Brandflächen einschalten" = `action`; „Ausfall, nicht Leerstand" = `severity="warning"` |
| „… werden geladen" | `Skeleton variant="rounded"` in Chart-Maß + `Typography` | kein Spinner: die Karte behält ihre Höhe, kein Layout-Sprung |
| `.br-box` (Vorbehalt) | `Alert severity="info" icon={false} variant="outlined"` | Ton Sand, nicht MUI-Blau → `sx` aus dem Theme |
| `.br-ds-cause` | `Alert severity="warning" variant="outlined"` mit `AlertTitle="Ursache"` | der Satz „keine Quelle" ist die wichtigste Ehrlichkeitszeile — sie braucht Rahmen |
| `.br-more` | `Button fullWidth variant="text" endIcon={<ExpandMore/>}` | Deckel bleibt ausgesprochen |
| `FeaturesRow` Liste | `Table size="small"` + `IconButton` `<ContentCopy/>` → `Snackbar` „kopiert" | ersetzt den 1,5-s-Textwechsel |
| „Je Überflug" (letzte 8) | `Table size="small" stickyHeader` in `TableContainer` mit `maxHeight` | Spalten: Zeit · Satellit · ☀/☾ · Px · MW; darunter `Typography variant="caption"` |
| `.br-ds-mapnote`, `.br-ds-legend` | `CardContent` + `Stack` von `Chip size="small" icon={<Box/>}` | Legende als Chips statt Punkte-Spans |
| `.br-ds-grid` | `Grid container size={{ xs: 12, md: 6, lg: 4 }}` | Karten sind ungleich hoch → **`Masonry` aus `@mui/lab`** für Desktop, `Grid` mobil |

### 2.3 Umgang mit fehlenden Daten — die Regel, die nicht fallen darf

Bei DACH-Bränden ist Fehlen der Normalfall. Drei Stufen, konsequent:

1. **Wert fehlt, Grund bekannt** → `<StatTile value="—" reason={missingReason(r,'…')} />`
   Desktop: `Tooltip`. Mobil: `caption` sichtbar unter dem Wert. **Nie 0, nie leer.**
2. **Ganzer Block fehlt, Grund bekannt** → `Alert severity="info" variant="outlined"` mit dem
   bestehenden Satz (z. B. „Keine Stundenreihe für das Brandzeitfenster — ohne sie gibt es weder
   Windrose noch Einstufung"). **Kein leeres Chart**, kein „0 mm"-Achsenkreuz.
3. **Block ist nicht anwendbar** → Karte **nicht rendern** (heute schon so bei `FeaturesRow`
   ohne Detektion und `satEnabled() === false`). Kein Platzhalter-Rahmen.

Für MUI X Charts heißt das: `null` in Datenreihen bleibt `null` (`connectNulls={false}`) —
Lücken sind Lücken. Vor jedem Chart steht ein Guard, der bei leerer Reihe Stufe 2 rendert.

---

## 3. Die Diagramme in MUI X Charts

### D1 · Verlauf — ΣFRP je Überflug

```ts
<BarChart
  height={220}
  dataset={bars}                        // { atMs, frpMw, pixels, satellite, day, hasFrp }
  xAxis={[{ dataKey: 'atMs', scaleType: 'time',
            valueFormatter: (ms, ctx) => ctx.location === 'tick' ? dayTick(ms) : stamp(ms) }]}
  yAxis={[{ scaleType: 'log', label: 'ΣFRP (MW)', min: 0.1 }]}
  series={[{ dataKey: 'frpMw', label: 'ΣFRP je Überflug',
             valueFormatter: (v, { dataIndex }) => frpTooltip(bars[dataIndex]) }]}
  slotProps={{ legend: { hidden: true } }}
/>
```
- **Farbe je Balken** über `colorMap` bzw. `series.color` + `sx` auf `.MuiBarElement-root`:
  Tag `palette.fire.day` (#D4632E), Nacht `palette.fire.night` (#5C5447).
- **Überflug ohne FRP** ist kein Balken der Höhe 0 — das wäre eine Falschaussage. Lösung:
  zweite `ScatterSeries` mit `markerSize` 6, weiß gefüllt, Kontur `stone.500`, y = Achsenminimum,
  Tooltip „N Px ohne FRP-Angabe".
- **Beobachtungslücken (D2)** kann MUI X nicht als Serie: als `children` in den Chart-Slot ein
  `<rect fill="url(#hatch)">` je Lücke, positioniert über `useXScale()` — der einzige Ort, an dem
  ich in MUI X eigenes SVG einhänge. Legende dafür in der `figcaption`-Zeile darunter.
- **„jetzt"-Linie**: `ChartsReferenceLine x={nowMs}` mit `lineStyle={{ strokeDasharray: '4 4', stroke: palette.fire.alert }}` und `label="jetzt"`.
- **Achsenbeschriftung entzerren** (heute handgerechnet: Stempel ab 76 px Abstand, MW ab 34 px):
  in MUI X über `xAxis.tickInterval` + `tickLabelInterval` deklarativ statt gerechnet.
- **Caption bleibt wörtlich**: „Zwischen zwei Überflügen ist nichts beobachtet — die Balken sind
  Messpunkte, keine Kurve."

### D3 · Windrose — **bleibt eigenes SVG**

MUI X hat kein Polarchart. `RadarChart` (v8) kann keine gestapelten Sektoren mit
Stärkeklassen und keinen zweiten Zeiger mit **anderer Konvention** (Rose = woher, Pfeil = wohin).
Diese Unterscheidung ist der inhaltliche Kern der Grafik; sie zu verlieren wäre ein
Informationsverlust. **Empfehlung:** `WindRoseChart` als SVG übernehmen, nur die Farben aus
`theme.palette` ziehen und die Legende auf `Chip` umstellen. Aufwand ≈ 0, Gewinn: keine
Fremdoptik.

### D4 · Treiber-Zeitreihe — fünf Zeilen

Heute ein SVG mit fünf Zeilen à 40 px, jede mit eigener Skala. In MUI X **nicht** in einem
Chart mit fünf Y-Achsen (unlesbar), sondern:

```ts
// fünf gestapelte LineCharts mit geteilter X-Achse
<Stack spacing={0}>
  {rows.map(r => (
    <SparkLineChart | LineChart
      key={r.key} height={64}
      xAxis={[{ data: hoursMs, scaleType: 'time', ...(r.last ? {} : { tickLabelStyle: { display: 'none' } }) }]}
      yAxis={[{ min: r.min, max: r.max, label: r.unit, width: 48 }]}
      series={[
        { data: r.values, color: r.color, connectNulls: false, curve: 'linear', showMark: false },
        ...(r.second ? [{ data: r.second.values, color: r.color,
                          connectNulls: false, showMark: false,
                          lineStyle: { strokeDasharray: '4 3' } }] : []),
      ]}
    />
  ))}
</Stack>
```
- Zeilen wörtlich wie heute: **Wind** km/h (+ **Böen** gestrichelt) · **Temperatur** °C ·
  **rel. Feuchte** % (0–100 fest) · **Niederschlag** mm als `BarChart` · **ISI** (ohne Einheit).
- **Detektionsspanne** als `ChartsReferenceLine`-Paar bzw. `<ChartsAxisHighlight>`-Band in
  `palette.fire.alert` mit 12 % Deckkraft, in **jeder** Zeile.
- **Tageslinien** über `xAxis.colorMap` oder `ChartsReferenceLine` je Mitternacht.
- **`connectNulls: false` ist Pflicht.** Der heutige Satz „Stunden ohne Wert sind Lücken in der
  Linie, keine Nullen" ist eine Zusage; ein `connectNulls: true` würde sie brechen.
- Ein gemeinsamer `ChartsTooltip trigger="axis"` über alle fünf Zeilen (MUI X:
  `<ChartDataProvider>` um den Stack) — heute gibt es keinen synchronen Tooltip, das wäre ein
  echter Gewinn.

### D5 · Neu vorgeschlagen (nur mit Ihrem OK, sonst nicht bauen)

| Chart | Daten liegen vor | Warum |
|---|---|---|
| **Flächenentwicklung** | nur bei ≥2 EFFIS-Ständen — heute **nicht** vorgehalten | ohne Speicher über Sitzungen nicht möglich → **würde ein leeres Chart** ⇒ ich empfehle: **weglassen**, stattdessen die Zeile „Kartierung läuft 1–3 Tage nach" |
| **Detektionen pro Tag** | `r.passes` (im Fenster) | ableitbar, aber D1 zeigt dasselbe feiner. Nur sinnvoll im Saison-Umfang → offene Frage 3 |
| **Konfidenz-Verteilung** | `confidence.firms` je Detektion — heute nur aggregiert im Record | brauchte die Rohzeilen (`FirmsRow[]`, liegen für das Satellitenbild schon vor) → machbar als `PieChart` low/nominal/high, aber **erst nach Ihrem OK**, weil FIRMS-Konfidenz ≠ Brandwahrscheinlichkeit und die Grafik genau das suggerieren würde |
| **FRP-Verteilung des Standorts** | `ThermalSiteStats.frp.p50/p95/max` | heute nur Text; als `BoxPlot`-artige Skala mit dem Live-ΣFRP als Marker **sehr** aussagekräftig („liegt im Anlagenrahmen") → empfohlen |

---

## 4. Layout je Breakpoint

### Desktop ≥ 1280 px
```
┌──────────────┬──────────────────────────────────────────┬───────────────┐
│ Registry     │ KOPF: Titel+Badge · Chips                │ Minikarte     │
│ (Liste)      │       4 Kacheln │ Faktenliste            │ Kartennotiz   │
│              ├────────────────────┬─────────────────────┤ Legende       │
│ virtualisiert│ Verlauf (D1/D2)    │ Wetterlage          │ (sticky)      │
│              ├────────────────────┼─────────────────────┤               │
│              │ Wetterführung      │ Satellitenbild      │               │
│              │ Rose+D4 (2 Zeilen) │                     │               │
│              ├────────────────────┴─────────────────────┤               │
│              │ Einordnung & Bestätigung (volle Breite)  │               │
│              │ Merkmale                                 │               │
└──────────────┴──────────────────────────────────────────┴───────────────┘
```
`Masonry columns={2}` im Mittelteil; „Einordnung" und „Merkmale" mit `sx={{ gridColumn: '1 / -1' }}`.
Chart-Breite 360 SVG-Einheiten wie heute (12-px-Schrift rendert als 12 px).

### Tablet 768–1279 px
Zwei Spalten, `aside` **im** Raster als erste Karte der zweiten Spalte (wie heute `compact`).
Chart-Breite 420. Faktenlisten bleiben zweispaltig.

### Mobile < 768 px (Android Portrait, Referenz 412 px)
- **Kein** verkleinertes Desktop. Das Dossier ist ein **eigener Screen**, nicht ein Sheet-Segment:
  `AppBar` mit `IconButton ←` „Brände" + `ToggleButtonGroup` Karte/Dossier (heute `lead`).
- Kopf: Titel, Badge, Unterzeile, dann **4 Kacheln 2×2** (`Grid columns={2}`).
- Faktenlisten **gestapelt** (`term` als `overline` über dem Wert) — nicht zweispaltig.
- Die sechs Karten als **`Accordion`**-Stapel, **Verlauf und Wetterlage per Default offen**,
  Wetterführung / Satellitenbild / Einordnung / Merkmale zu. Grund: die Wetterführung allein ist
  auf 412 px ≈ 900 px hoch — als offene Karte begräbt sie alles darunter.
- Charts: `height` 180, Chart-Breite 340; D4 als **zwei** Zeilen (Wind, rel. Feuchte) mit
  `Button` „Alle fünf Größen zeigen" — die anderen drei bleiben erreichbar, nicht gestrichen.
- Tabelle „Je Überflug" → `Stack` von `ListItem` (Tabelle mit 5 Spalten bricht auf 412 px).
- Alle `Tooltip`-Gründe **zusätzlich** als sichtbare `caption` (Touch hat kein Hover).
- Minikarte: `height: 200`, unter dem Kopf, `Legend` als Chip-Reihe darunter.

---

## 5. Theme — Tokens nach MUI

`theme.palette` ergänzen (Werte aus `fireModel.ts` und `brandradarMeta.ts`, unverändert):

| Token | Wert | Verwendung |
|---|---|---|
| `fire.low` | `#8FBF6B` | FWI 1 / Low |
| `fire.moderate` | `#D6D24E` | FWI 2 |
| `fire.high` | `#E9A33C` | FWI 3 |
| `fire.veryHigh` | `#D4632E` | FWI 4 · **Tag-Balken D1** |
| `fire.extreme` | `#A32B1E` | FWI 5 · „jetzt"-Linie · Detektion |
| `fire.veryExtreme` | `#6B1410` | FWI 6 |
| `fire.night` | `#5C5447` | Nacht-Balken D1 |
| `fire.static` | `STATIC_GREY` | ortsfeste Quellen |
| `fire.hatch` | `#C9B98F` | Beobachtungslücken |
| `background.default` | `#EDE6D3` | Sand |
| `background.paper` | `#FAF6EA` | Karten |
| `text.primary` | `#2C2A26` | Ink |
| `text.secondary` | `#5C5447` / `#8B7355` | Untertitel / Muted |
| `divider` | `#E0D6BE` | Rahmen |

**Colorblind-safe:** Die FWI-Rampe grün→gelb→orange→rot ist für Deuteranopie **nicht**
trennscharf zwischen Stufe 1 und 2. Sie ist aber die **GWIS-Rampe** und damit die Konvention der
Quelle. Vorschlag: Rampe behalten (Wiedererkennung), zusätzlich **Musterung** je Stufe auf der
Karte als schaltbare Option und im Dossier **immer den Klassennamen** neben der Farbe („High
(21,3–38,0)") — er steht heute schon dort. Ein Umfärben würde die Karte von der amtlichen
Vorlage entkoppeln; das halte ich für den größeren Schaden.

**Typografie:** `League Spartan` als `typography.fontFamily`. Wichtig aus dem Ist-Zustand
übernehmen: `font-family` **explizit an jedem SVG-`<text>`** — MUI X setzt sie auf dem
`<svg>`-Wrapper, ein `<text>` erbt sie dann korrekt; bei eigenen SVG-Kindern (Schraffur-Labels,
Windrose) bleibt die explizite Angabe Pflicht (Befund B1).

**Motion:** `theme.transitions` — Karten-Hover 120 ms `ease-out`, Accordion 200 ms,
Chart-Einblendung **keine** (eine animierte Balkenreihe suggeriert Verlauf, wo Messpunkte stehen).
`prefers-reduced-motion` respektieren.

**Dark-Mode:** existiert heute nirgends in buscosun. Mit MUI wäre er ein `colorSchemes`-Eintrag —
aber die FWI-Rampe ist auf Sand kalibriert und verliert auf Ink an Kontrast (Stufe 1/2 gegen
`#12161C` unter 3:1). Empfehlung: **erst nach dem Redesign**, als eigener Schritt mit einer
zweiten, für Dunkel kalibrierten Rampe. Nicht in diesem Auftrag.

---

## 6. Was aus dem Ist-Zustand **nicht** verloren gehen darf

Prüfliste für die Umsetzung — jede Zeile ist heute vorhanden und trägt Bedeutung:

1. „—" mit Grund statt 0 (alle vier Kennzahlen, alle Faktenzeilen).
2. Fläche mit **Herkunft** (kartiert / geschätzt / Obergrenze / keine).
3. „ein Pixel deckt 14–60 ha" bei Obergrenzen.
4. ΣFRP-Erklärung „Leistung, keine Fläche und keine Energie".
5. Ausbreitung = „Verlagerung zwischen Momentaufnahmen, nicht Frontgeschwindigkeit".
6. `spreadConfidenceNote` **aufgelöst** (nie „entweder/oder").
7. Log-Achse in D1 + „Balken sind Messpunkte, keine Kurve".
8. Schraffur > 6 h + längste Lücke in der Caption.
9. `connectNulls: false` in D4 + der Satz dazu.
10. Windrose: zwei Konventionen (woher/wohin) getrennt.
11. „Gesamt-FWI steht bewusst nicht hier" + GWIS-Link.
12. ERA5-Rückfall **benannt** („kein ICON-Archiv; Reanalyse ist gröber").
13. Zeitanker Detektion vs. EFFIS-Branddatum (`EFFIS_ANCHOR_NOTE`).
14. GeoSphere-Warntext als **wörtliches Zitat**, „keine Brandbestätigung".
15. Ursache: „keine Quelle" + Einordnungshilfen mit Herkunft.
16. „eigene Ableitung, kein Nachweis" bei Anlage/Abweichung.
17. Merkmalsatz-Version + „kein Speicher über Sitzungen".
18. Kartennotiz sagt, **was** gezeichnet ist.
19. „Farben abgeleitet — nicht amtlich".
20. Deckel „letzte 8 von N Überflügen" ausgesprochen.

---

## 7. Offene Fragen zur Detailansicht

1. **Mobile-Accordion**: einverstanden, dass Wetterführung/Satellitenbild/Einordnung/Merkmale
   auf Mobil zugeklappt starten? (Alternative: alles offen, ~4 500 px Scrolltiefe.)
2. **D4 auf Mobil**: zwei Zeilen + „alle fünf zeigen" — oder alle fünf gestapelt?
3. **Neue Charts**: FRP-Verteilung des Standorts (empfohlen) und Konfidenz-Verteilung
   (bedenklich, s. §3 D5) — bauen oder nicht?
4. **Flächenentwicklung**: bestätigen Sie, dass sie **entfällt** (keine Historie je Brand)?
5. **Windrose als SVG** behalten — einverstanden?
6. **`@mui/lab` Masonry**: darf die Lab-Abhängigkeit dazu, oder Grid mit fester Kartenhöhe?
7. Bleibt es bei **MUI X Charts** (statt Recharts), wie in §0 empfohlen?

---

**Nicht enthalten** (nächster Schritt, auf Ihr OK): Interaktions-Zustandstabelle Karte ↔ Dossier,
Hit-Target-Strategie (§2a des Ursprungsauftrags), `FireHistoryChart` (D5) und
`FireSatImagery`/`FireCogViewer` im Detail — für die drei brauche ich die in Phase 1 §3 genannte
Leseerlaubnis.
