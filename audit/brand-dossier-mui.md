# Brand-Dossier auf MUI — Umsetzung und Gate (BDM)

> Stand: 2026-09-06 · Auftrag: `docs/PROMPT-brand-dossier-mui.md`
> Spezifikation: `docs/konzept-brand-ui.md` (Phase 1, Inventar) und
> `docs/konzept-brand-detail.md` (Ist-Zustand Zeile für Zeile + MUI-Spezifikation)
> Vorlage: `reference/brandradar-detail.dc.html`, Variante **1a**
> (Bühnenwechsel Karte ⇄ Dossier, Karte als Miniatur) in den drei Größen
> `1a-desktop` 1440×1000 · `1a-tablet` 1024×768 · `1a-mobile` 390×844.

## 0. Was dieser Umbau ist — und was er nicht ist

Das Brand-Dossier trägt jetzt **MUI Material** als Komponentenschicht und **MUI X Charts**
als Diagrammschicht. Die Form ist neu, der **Inhalt Zeile für Zeile unverändert**: jede
Kennzahl, jeder Untertitel, jeder Grund hinter einem „—", jede Ehrlichkeitszeile kommt
weiterhin aus den Bausteinen in `FireFootprintPanel.tsx`. Das Dossier selbst führt keine
eigene Fachaussage (das prüft `verify:fire-detail`).

**Der Preis ist gemessen, nicht geschätzt:** +170,7 KB gzip, vollständig im lazy
`FireRoute`-Chunk. Der Erstbild-Pfad wächst **nicht** (eagerJs unverändert 106,3 KB).

**Diese Entscheidung kehrt D-06 („SVG von Hand, keine Chart-Bibliothek") für dieses
Feature um.** Sie ist Jans Entscheidung vom 2026-09-06 und in `verify:fire-detail`
festgehalten, damit die Umkehr benannt bleibt und nicht als Versehen gelesen wird.

## 1. Drei Stellen, an denen die Spezifikation so nicht läuft

Alle drei sind an der Bibliothek gemessen, nicht vermutet.

### K-A · `BarChart` mit `scaleType: 'time'` gibt es in MUI X nicht

`docs/konzept-brand-detail.md` §3 D1 zeichnet den Verlauf als `<BarChart>` mit einer
Zeitachse. MUI X v9 wirft dafür (`BarChart/checkBarChartScaleErrors.js`):

> „Bar charts require a band scale for the category axis to properly position and size the bars."

Eine **Band**-Achse verteilt die Überflüge **gleichmäßig**. Genau das darf dieser Chart
nicht: seine Kernaussage ist der zeitliche Abstand — *„Zwischen zwei Überflügen ist nichts
beobachtet — die Balken sind Messpunkte, keine Kurve."* Auf einer Band-Achse verschwände
die 11-h-Lücke zwischen zwei Nachbarbalken, und die Schraffur (D2) hätte keinen Ort mehr.
Damit fielen die Prüflistenpunkte 7 und 8.

**Gebaut:** `ChartsContainer` mit echter `time`-Achse und `log`-Y-Achse; Achsen, Ticks,
Gitter, Referenzlinie und Theme kommen von MUI X, die **Balken zeichnet die Komponente
selbst** über `useXScale()`/`useYScale()` — dieselbe Technik, die die Spezifikation für die
Lücken ohnehin vorsieht. Belegt in `verify:fire-detail`
(„Balken auf der Zeitachse (keine Band-Achse)").

Zwei Nebenwirkungen, beide behandelt:

* **log-Achse:** MUI X setzt je Dekade auch 2/3/5 — acht Marken auf 160 px, die sich
  überlagern. `tickInterval` lässt nur Zehnerpotenzen durch; die Aussage der Achse ist die
  Größenordnung.
* **Balkenbreite:** eine feste Breite ließ fünf Nachtüberflüge innerhalb einer Stunde zu
  einem Block verschmelzen — man sah *einen* breiten Balken statt *fünf* Messpunkten. Der
  kleinste Abstand deckelt jetzt die Breite (Boden 4 px).

### K-B · Fünf gestapelte Charts teilen sich keinen `ChartsTooltip`

§3 D4 schlägt „ein gemeinsamer `ChartsTooltip trigger="axis"` über alle fünf Zeilen
(`<ChartDataProvider>` um den Stack)" vor. Ein Datenkontext gehört in MUI X zu **einer**
Zeichenfläche; fünf Charts haben fünf Kontexte, ein Provider darüber verbindet sie nicht.

**Gebaut** — und dabei mehr als der Vorschlag: `DriverSeriesChart` führt den Zeitpunkt
selbst. Ein `pointermove` über dem Stapel bestimmt die Stunde, **jede** Zeile bekommt sie
als `ChartsReferenceLine`, und **über** dem Stapel steht eine Ablesezeile mit **allen fünf**
Werten dieser Stunde. Fehlt ein Wert, steht dort „—", nie eine Null.

Der Niederschlag musste dafür ebenfalls von `BarChart` weg (K-A): eine Band-Achse hat andere
Ränder als die Zeitachse der vier Linienzeilen — die Regenzeile stünde verschoben unter
ihnen, und der geteilte Zeiger zeigte dort auf die falsche Stunde.

### K-C · Feste Chart-Breiten je Breakpoint laufen auf dem Tablet über

Der Auftrag nennt 360 / 620 / 340 SVG-Einheiten. Gemessen bleibt der Mitte auf 1024 px mit
Dock **und** Readout nur **~440 px** — 620 lief über den Rand.

**Gebaut:** die Charts messen ihre Karte (MUI X ohne `width`, ResizeObserver); die genannten
Zahlen sind nur noch **Obergrenzen** am `<figure>`. Das Argument der Spezifikation
(„12-px-Schrift rendert als 12 px") entfällt dabei von selbst: MUI X rechnet in echten
Pixeln, nicht in skalierten viewBox-Einheiten.

## 2. Zwei Fehler, die die Umsetzung selbst erzeugt hat — und ihre Ursache

**F-1 · Die Minikarte lag über dem Verlauf.** Ich hatte ein zweites Kartenraster als Inline-
`sx` gebaut, während `fireDeck.css` die Anordnung der Vorlage 1a bereits trägt
(`.br-ds-aside { grid-column: 2; grid-row: 1 / span 2 }` …). Zwei Quellen für dieselbe
Anordnung, und die CSS-Zeilenzuweisung gewann. **Kur:** das vorhandene `.br-ds-grid` wird
benutzt, das Inline-Raster ist weg; `DossierCard` setzt keine Rasterposition mehr. Die Sonde
„die Kartenanordnung steht NUR in fireDeck.css" hält das fest.

**F-2 · Mobil schob sich die Seite quer (1 146 px in einem 390-px-Bild).** Ein Grid-Kind ist
`minmax(auto, 1fr)`; ohne `min-width: 0` wächst es auf seine **Min-Content**-Breite. Die
Desktop-Karten trugen `br-ds-card` mit `min-width: 0`, die Mobil-`Accordion`s nicht.
**Kur:** `.br-ds-grid > * { min-width: 0; }` — für **jedes** Kind, nicht nur für die Karten.

**F-3 · Vier unsichtbare Steuerzeichen im Verifier.** Beim Schreiben der neuen Sonden wurde
`\b` (Wortgrenze) als Backspace-Byte in die Datei geschrieben. Drei der vier Sonden fielen
dadurch still **schwächer** aus als gemeint, eine schlug fehl. Gefunden durch die
fehlschlagende, repariert in allen vieren. *Lehre: eine Sonde, die grün ist, ohne dass man
gesehen hat, wie sie rot wird, ist kein Beleg.*

## 3. Entscheidungen, die vom Auftrag abweichen

| Punkt | Auftrag | Gebaut | Grund |
|---|---|---|---|
| Masonry oder Grid | „ENTSCHEIDE selbst" | **Grid** (`align-items: start`), `@mui/lab` bleibt draußen | Masonry ordnet die DOM-Reihenfolge nach Kachelhöhe um — Lesereihenfolge und Tabulator-Weg folgen dann der Höhe statt dem Inhalt. Das Dossier hat eine gemeinte Reihenfolge (Verlauf → Wetterlage → Einordnung → Merkmale), und die Karten voller Breite („Einordnung", „Merkmale") stünden in einer Masonry-Spalte gar nicht. `align-items: start` löst das eigentliche Problem — ungleich hohe Karten — ohne diese Kosten und ohne neue Abhängigkeit. |
| Schrift | „(a) Google-Font ergänzen oder (b) mappen" | **(a′) Bestand** | League Spartan ist seit 2026-08-01 vollständig selbst gehostet (`src/fonts.css`, Schnitte 300–800, Preload für 500). Die Google-Einbindung wurde damals bewusst entfernt (V-102/D-02). Jan hat den Bestandsweg gewählt. |
| Chart-Breite | 360 / 620 / 340 fest | gemessen, Zahlen als Obergrenze | K-C |
| D1 als `BarChart` | ja | `ChartsContainer` + eigene Balken | K-A |
| „ScatterSeries" für Überflüge ohne FRP | ja | weiße Marke am Achsenboden, gezeichnet wie die Balken | Die Aussage („kein Balken der Höhe 0 — das hieße *0 MW gemessen*, und gemessen wurde nichts") ist erhalten; eine echte Serie hätte eine zweite Tooltip-Mechanik neben den `<title>`-Marken der Balken gebracht. |
| Mobile-AppBar mit `IconButton ←` + `ToggleButtonGroup` | MUI-Komponenten | bestehende Kopfzeile aus `FirePage.tsx` (`br-m-dshead`) | Sie ist bereits Command-Deck, erfüllt 44 px und ist verifiziert (`verify:fire-detail` [bd2]). Ein Austausch hätte Vorlagentreue nicht erhöht, aber vier Sonden angefasst. |
| FRP-Verteilung des Standorts (neuer Chart) | „nur wenn Zeit bleibt" | **nicht gebaut** | Der Auftrag stellt sie hinten an; die drei Kollisionen oben und die zwei Layout-Fehler hatten Vorrang. |

**Nicht gebaut, wie beauftragt:** Flächenentwicklung (es gibt keine Historie je Brand — das
Chart wäre immer leer; die Zeile „Kartierung läuft 1–3 Tage nach" bleibt), Konfidenz-
Verteilung (FIRMS-Konfidenz ist **nicht** Brandwahrscheinlichkeit; ein Kreisdiagramm würde
genau das suggerieren), D5 Historien-Chart (`FireHistoryChart.tsx` unangetastet).

## 4. Gate GBDM — Belege

| Prüfung | Stand |
|---|---|
| `npm run typecheck` | grün |
| `npm run verify:fire-detail` | **436/436** (vorher 415, +21 neue Sonden) |
| `npm run verify:fire-model` | 123/123 |
| `npm run verify:fire-events` | 42/42 |
| `npm run verify:fire-anomalies` | 56/56 |
| `npm run verify:fire-fwi` | 43/43 |
| `npm run verify:routing` | 153/153 |
| `npm run build` | grün (inkl. SEO-Generator + 153/153 Routing) |
| `npm run budget` | alle Budgets eingehalten |

**Vorbestehend rot, nicht von diesem Umbau** (an den unberührten Dateien nachgewiesen,
`git diff` leer für `footprint/fireRegistry.ts`, `activity/*`, `detail/passTimeline.ts`):

* `verify:fire-clusters` 110/117 — die 7 sind der in den Session-Memories dokumentierte
  Altbestand. Die achte (Abhängigkeitsliste) ist **behoben**: sie stand seit RT1 auf einer
  Liste ohne `react-router` und führt jetzt den tatsächlichen Stand samt Begründung.
* `verify:fire-activity` 174/176 — (f) Windabgleich in `FirePage` (der Sampler ging mit dem
  Rückzug von `fireWind` 2026-08-22), plus die Registry-Selbstprüfung unten.
* `verify:fire-registry` 80/81 und die Registry-Selbstprüfung in `fire-activity` —
  **ein Leistungsanker**, gemessen 257/289/408 ms gegen eine 150-ms-Grenze, bei laufendem
  Browser, Dev-Server und Build. Das ist die bekannte Falle „ein Leistungsanker misst immer
  auch die Maschine mit"; das gemessene Modul ist von diesem Umbau nicht berührt.
* `verify:fire-time` 113/114, `verify:fire-footprint` 72/73, `verify:fire-history` 112/113 —
  Sonden auf `FirePage`-Stellen aus früheren, noch nicht committeten Rückzügen.

### Bundle (gemessen, nicht geschätzt)

| Metrik | vorher | nachher | Grenze |
|---|---|---|---|
| `eagerJs` | 106,3 KB | **106,3 KB** (unverändert) | 107,9 KB ✓ |
| `eagerCss` | 2,4 KB | **2,4 KB** | 2,5 KB ✓ |
| `largestChunk` (FireRoute) | — | **279,9 KB** | 292,3 KB ✓ |
| `totalJs` | — | **1 316,9 KB** | 1 150 → **1 330 KB** (angehoben, im Diff sichtbar) |

**Messmethode für den MUI-Anteil:** temporärer `manualChunks`-Split auf
`node_modules/@mui` + `@emotion`, ein Build, danach zurückgesetzt (`vite.config.ts` ist
unverändert). Ergebnis: **MUI + Emotion + Icons + X Charts = 170,7 KB gzip**, FireRoute ohne
MUI 112,0 KB. Der Erstbild-Pfad ist unberührt; teurer wird nur der **erste** Aufruf der
Waldbrand-Route.

### Ansichten (MCP, Live-Daten: 72 Brände, 447 Detektionen)

| Vorlage | Viewport | Screenshot |
|---|---|---|
| B7 = `1a-desktop` | 1440×900 | `B7-desktop-1440.png` (Kopf + Kennzahlen), `B7-desktop-1440-verlauf.png` (Verlauf + Minikarte) |
| B8 = `1a-tablet` | 1024×768 | `B8-tablet-1024.png`, `mcp-tablet-1024-drv.png` (Wetterführung, Rose + Chip-Legende) |
| B9 = `1a-mobile` | 390×844, mobile+touch | `B9-mobile-390-dossier.jpeg` (Kopf, Kartenstreifen, Kacheln), `B9-mobile-390.png` (Faktenzeilen gestapelt), `mcp-mobile-390-acc.png` (Accordion, Verlauf offen), `mcp-mobile-390-drv.png` (D4-Umschalter) |

Alle Pfade relativ zu `audit/brand-dossier-mui/`. Die Aufnahmen `mcp-desktop-1440-grid.png`
(Minikarte über dem Verlauf) und `mcp-desktop-1440-chart.png` (Achsen-Ticks und Balkenbreite
vor der Korrektur) sind absichtlich behalten — sie belegen F-1 und die Chart-Nachbesserung.

Interaktiv geprüft: Brand wechseln (Liste → Dossier, Permalink `ds=1`), „↗ Bühne zurück"
(schaltet zurück auf die Karte, `ds` fällt aus dem Hash), Tooltip-Grund an der Kachel
„Stärke" (Desktop), „JSON kopieren" → `Snackbar` „kopiert" mit 44×44-Ziel, Accordion auf/zu,
D4-Umschalter „Alle fünf Größen zeigen (3 weitere)" auf Mobil.

**Tastatur und Screenreader:** die drei Diagramme tragen einen Namen (`<figure aria-label>`);
`role="img"` wurde bewusst NICHT gesetzt — es hätte den Teilbaum präsentational gemacht,
während MUI X darin eigene fokussierbare `role="none"`-Elemente für die Tastatur hält. Die
wären dann anspringbar, aber unbenannt gewesen. Die 39 Fokusziele des Dossiers sind alle
erreichbar; unter 44 px sind nur die Bedienelemente der Satellitenbild-Karte, die auf Mobil
per Media Query auf 44 px gehen (`fireDeck.css`, unverändert).

**Konsole sauber:** die React-Warnung „does not recognize the `hideLegend` prop" war echt
(`hideLegend` an `ChartsContainer` weitergereicht) und ist behoben. Verblieben sind
Ressourcenfehler der Satelliten-/Kartenkacheln, die es auch auf der Kartenbühne gibt.

**Kein horizontaler Überlauf:** auf 390 px `document.body.scrollWidth === 390`, und **0**
Elemente ragen über den Rand außerhalb der absichtlich scrollbaren Behälter
(`.br-sat-days`, MapLibre-Attribution).

## 5. Die Prüfliste §6 — Punkt für Punkt

| # | Zusage | Ort |
|---|---|---|
| 1 | „—" mit Grund statt 0 | `FireFootprintPanel.tsx` `recordStatTiles()` (`title` je Kachel); `dossier/DossierPrimitives.tsx` `StatTile`/`FactRow`/`Missing` — Desktop `Tooltip`, **mobil zusätzlich sichtbar** |
| 2 | Fläche mit Herkunft | `recordStatTiles()` Kachel „Fläche" → `areaOrigin()`; Zeile „Fläche" in `DetailKennzahlenRows` |
| 3 | „ein Pixel deckt 14–60 ha" | `DetailKennzahlenRows`, Zeile „Fläche", `kind === 'upper-bound'` |
| 4 | ΣFRP „Leistung, keine Fläche und keine Energie" | `DetailFrpRows` + Kachel-`title` „Stärke" |
| 5 | Ausbreitung = Verlagerung, nicht Frontgeschwindigkeit | `DetailVerlauf`, Zeile „Ausbreitung" (im Text **und** als `reason`) |
| 6 | `spreadConfidenceNote` aufgelöst | `FireFootprintPanel.tsx` `spreadConfidenceNote()`, gerendert in „Konfidenz der Richtung" |
| 7 | Log-Achse + „Messpunkte, keine Kurve" | `FirePassChart.tsx` `scaleType: 'log'` + `figcaption` |
| 8 | Schraffur > 6 h + längste Lücke | `FirePassChart.tsx` `GapLayer` (`GAP_HOURS`) + `figcaption` `tl.maxGapH` |
| 9 | `connectNulls: false` + der Satz | `dossier/DriverSeriesChart.tsx`, jede Linienserie + `figcaption` |
| 10 | Windrose: woher / wohin getrennt | `FireDriverCharts.tsx` (bleibt SVG — MUI X hat kein Polarchart) |
| 11 | „Gesamt-FWI steht bewusst nicht hier" + GWIS-Link | `DriversView` |
| 12 | ERA5-Rückfall benannt | `WeatherBlock` und `DriversView` (`w.source === 'era5'`) |
| 13 | Zeitanker Detektion vs. EFFIS | `fireWindowAnchor()` + `EFFIS_ANCHOR_NOTE` |
| 14 | GeoSphere wörtlich, „keine Brandbestätigung" | `DetailEinordnungRows`, `<q>` |
| 15 | Ursache „keine Quelle" + Einordnungshilfen | `CauseText` / `causeHintsOf`, im `Alert severity="warning"` mit `AlertTitle="Ursache"` |
| 16 | „eigene Ableitung, kein Nachweis" | `DetailEinordnungRows`, Zeile „Anlage?" |
| 17 | Merkmalsatz-Version + „kein Speicher über Sitzungen" | `FeaturesRow` |
| 18 | Kartennotiz sagt, WAS gezeichnet ist | `DossierMapNote` in `FireDossier.tsx` |
| 19 | „Farben abgeleitet — nicht amtlich" | `DossierLegend` in `FireDossier.tsx` |
| 20 | Deckel „letzte 8 von N" | `DetailVerlauf`, unter der Tabelle „Je Überflug" |
| + | Satellitenbild-Vorbehalt „ein fehlendes Bild heißt ‚Wolken'" | `FireSatImagery.tsx` (unangetastet) |

Elf davon sind zusätzlich als Sonde in `verify:fire-detail` festgeschrieben (Block
„MUI-Umbau des Brand-Dossiers"), damit sie ein späterer Umbau nicht still verliert.

**Farben:** die FWI-Rampe bleibt die GWIS-Rampe (Wiedererkennung schlägt Deuteranopie-
Trennschärfe zwischen Stufe 1 und 2), der Klassenname steht überall neben der Farbe. Beim
Übertragen in das Theme fiel auf, dass die Schraffurfarbe `#C9B98F` nie ein Token war —
sie steht jetzt als `--br-hatch` in `designTokens.css`. Eine Sonde hält fest, dass **jede**
Theme-Farbe auch in den vorhandenen Tokens steht.

**Kein Dark-Mode** (eigener Schritt mit zweiter Rampe, `docs/konzept-brand-detail.md` §5) —
als Sonde festgehalten, damit er nicht nebenbei entsteht.

## 6. Offene Punkte (V-Einträge; `improvements.md` fehlt im Arbeitsverzeichnis)

* **V-BDM-1 — FRP-Verteilung des Standorts.** `ThermalSiteStats.frp.p50/p95/max` steht heute
  nur als Text. Als Skala mit dem Live-ΣFRP als Marker sagt sie „liegt im Anlagenrahmen"
  auf einen Blick. *Mehrwert:* die häufigste Frage bei einem grauen Eintrag beantwortet
  sich ohne Lesen. *Skizze:* ein `ChartsContainer` mit linearer X-Achse, drei
  `ChartsReferenceLine` (p50/p95/max) und einer Marke; in `AnomalySiteCards`, Karte
  „Signatur im Archiv".
* **V-BDM-2 — Leistungsanker `fire-registry` misst die Maschine mit.** 257–408 ms gegen eine
  150-ms-Grenze bei laufendem Browser. *Mehrwert:* ein Prüfmittel, dem man glaubt.
  *Skizze:* entweder die Grenze mit genannter Last kalibrieren oder den Anker relativ
  messen (Verhältnis zu einer Referenzschleife im selben Lauf) — die Lehre der SAT2h-Linie.
* **V-BDM-3 — die Registry-Liste ist noch Deck-CSS.** Kacheln, Chips und Leerzustände der
  Liste im Readout sind unverändert; im Dossier daneben stehen MUI-Kacheln. *Mehrwert:*
  eine Optik statt zwei. *Skizze:* `Stat` auf `StatTile` heben — die Werte kommen bereits
  aus `recordStatTiles()`, es ist reine Form. **Nicht in diesem Auftrag**, weil er die
  Detailansicht nennt und die Liste eigene verifizierte Maße hat.
* **V-BDM-4 — `@mui/icons-material` für zwei Symbole.** Gebraucht werden `ExpandMore` und
  `ContentCopy`. *Mehrwert:* weniger Deploy-Größe. *Skizze:* die beiden Pfade als eigenes
  SVG; am gemessenen Bundle nachprüfen, ob das Tree-Shaking sie ohnehin schon auf zwei
  Symbole reduziert (dann entfällt der Posten).
