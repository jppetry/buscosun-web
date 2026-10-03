# Autobahnwetter – Implementierungsplan (Phase AW)

> Stand 03.10.2026, Export des Plan-Dokuments (claude.ai Doc „Autobahnwetter – Implementierungsplan“).
> Eingangsdokument für Claude Code. Die Phasen-Diagnose und das Protokoll entstehen in `audit/autobahnwetter.md`.
> Konzept und Datenlage: `audit/autobahnwetter-konzept.md`. UI-Vorgabe: `reference/autobahnwetter-desktop.dc.html`, `reference/autobahnwetter-mobile.dc.html`, `reference/README-autobahnwetter.md`.

## Ziel und Umfang

Phase **AW** baut die Kachel und Seite „Autobahnwetter“ (`/autobahnwetter`) auf Basis der DWD-Glättemeldeanlagen. Die Daten kommen ausschließlich vorverarbeitet aus `buscosun-data`. Unplausibles erreicht den Nutzer nicht, weil **ein gemeinsamer Vertrag mit Prüfern** im Producer die Veröffentlichung sperrt und im Client die Anzeige.

**Im Umfang**

- Neue Kachel auf der Startseite plus Eintrag in der ⌘K-Palette.
- Route `/autobahnwetter` mit SEO-Shell, Lazy-Chunk `src/road/` im Command-Deck (D-27).
- Automatischer Ingest alle 15 min nach `buscosun-data/road/`, inklusive Stationskatalog und Korridoren.
- Plausibilitätsprüfung auf Wert-, Stations- und Slot-Ebene mit Veröffentlichungs-Sperre.
- Externer Wächter, der das ausgelieferte Ergebnis prüft.
- Prognose +1/+3/+6 h und Prognosepunkte AT/CH als zweite Stufe hinter eigenem Gate.

**Nicht im Umfang:** Verkehrsmeldungen und Webcams (Autobahn-API ohne Lizenz, blockiert), eigene Warnungen, modellierte Fahrbahntemperatur (RoadSurf), Push-Benachrichtigungen.

**Arbeitsweise wie im Repo:** Diagnose in `audit/autobahnwetter.md` → Plan → Umsetzung per Claude Code → Verifier → Gate. Neue Pfade kommen hinter das Flag `?road=1`, voreingestellt aus. Kein Secret, kein Backend. (Rechte am Daten-Repo regelt der Startprompt.)

## Ausgangslage im Code

Fast alles, was AW braucht, gibt es schon als Muster: Der Radar-Spiegel ingestiert bereits Fremdprodukte im Minutentakt, `radarImg.ts` zeigt, wie ein Vertrag Producer, Client und Verifier bindet. Geprüft am Stand vom 02.10.2026.

| Bereich | Stand heute | Folge für AW |
| --- | --- | --- |
| Startseite | `src/SearchPage.tsx`: handgelegtes Bento-Raster, `FEATURE`-Tabelle als einzige Quelle der Ziele, `TOOL_TILE_COUNT = 10`, Palette mit 11 Einträgen. Waldbrand hängt bewusst am Ende, Farben inline, weil `eagerCss` keinen Spielraum hat | Kachel 11 ans Ende, Inline-Farben, Zähler auf 11, Palette-Eintrag 12 |
| Routing | `FeatureId` in `App.tsx`, `RouteId` + `ROUTES` mit SEO-Meta und Unterseiten in `routes.ts`, `FEATURE_PATH`, Lazy-Seiten in `router.tsx` | neue Feature-Id `road`, Route `autobahnwetter`, Seite `pages/RoadRoute` |
| Daten-Repo | drei Linien: `runs/` (8× täglich), `radar/` (1–2 min), `point/` (3 Jobs). Workflows sind Kopien von Vorlagen aus `buscosun-web`, Producer werden sparse aus `buscosun-web/main` geklont, kein Secret | vierte Linie `road/`, Producer-Code liegt in `buscosun-web` |
| Radar-Spiegel | ein Dauerlauf (345 min, Poll 10 s) mit Selbstverkettung und Wachhund. Spiegelt schon INCA und rzc, rechnet per Kindprozess `radar-derive.mjs` mit Client-Modulen, `publish()` heilt: fetch → reset → kompletter Bestand → push, 4 Versuche | Ingest als weiteres Produkt im Spiegel (E-AW-1) |
| Kartenlinie / Punktlinie | `build.yml` und der Punkt-Publisher force-pushen eine frische Historie; was zwischen Klon und Push ankommt, ist weg | jede Veröffentlichung muss den ganzen `road/`-Bestand neu einkopieren |
| Vertrags-Muster | `src/sources/radarImg.ts`: eine Datei für Client, Producer und Verifier mit Pfaden, Meta-Schema, Prüfern, Zeit-Gates, Kill-Switch; versionierter Pfad `v1` | `src/road/roadContract.ts` nach demselben Muster |
| Wächter | `health.yml` prüft stündlich das ausgelieferte Ergebnis von außen; Rot erzeugt die GitHub-Fehlermail | Prüfung für `road/` ergänzen |
| UI-Vorlage | Brandradar `src/fire/`: Command-Deck, `fireDeck.css` nur im Lazy-Chunk, Breakpoints 767/1439 | `src/road/` + `roadDeck.css` analog |

## Arbeitspakete im Überblick

Sieben Arbeitspakete in zwei Strängen. Der Daten-Strang geht vor, weil Kachel und Seite ohne geprüfte Daten nichts zu zeigen haben; Kachel und Route können nach dem Spike parallel starten, die Seite arbeitet bis Gate B mit Fixtures aus AW-1.

```
Daten-Repo und Producer
  AW-0 Spike ──▶ (A) ──▶ AW-1 Vertrag ──▶ AW-2 Derive ──▶ AW-3 Pipeline ──▶ (B)
                  │      Schema, Prüfer    Katalog         im Radar-Spiegel    │
                  │      Fixtures          Korridore       + Wächter           │ Daten live
                  ▼                                                            ▼
App (buscosun-web)                                                             
                 AW-4 Kachel ──▶ AW-5 Seite ─────────────────────────▶ (C) ──▶ AW-6 Prognose ──▶ (D)
                 Startseite      Deck, Karte, Band, Readout                    +1/+3/+6 h, AT/CH

(A) Spike entschieden · (B) 7 Tage Schattenbetrieb · (C) Seite live · (D) Backtest bestanden
```

**AW-0 Spike** klärt in `audit/autobahnwetter.md`, bevor Code entsteht: Inhalt und Takt der QA-XML-Dateien gegen die BUFR-Bulletins, Codetabelle des Fahrbahnzustands aus der DWD-Formatbeschreibung, Autobahn-Anteil der Stationsliste, Ankunftszeit der `LATEST`-Dateien je Ordner, Dateigrößen für die Budgetrechnung und Startwerte der Prüfer-Schwellen aus dem 48-h-Fenster des DWD (mehr hält der Server nicht vor).

## AW-2 und AW-3: Datenpipeline nach buscosun-data

Der Ingest läuft als weiteres Produkt im Radar-Spiegel, nicht als eigener Cron. Der Spiegel läuft ohnehin durchgehend, pollt im 10-s-Takt und hat die heilende Veröffentlichung gegen den Force-Push schon gelöst. Ein eigener 15-min-Cron wäre dagegen an GitHubs gemessenen Startverzug von 7–31 min gebunden (BW-9). Das weicht bewusst vom Konzept ab, das noch einen eigenen Cron `road.yml` vorsah; Entscheidung E-AW-1.

**Ablauf je 15-min-Slot**

1. **Erkennen.** HEAD auf die `…_LATEST`-Datei jeder aktiven Gruppe, alle 30 s ab Slot-Beginn; neu ist, was ein jüngeres Last-Modified trägt. Fehlende Gruppen bekommen eine Frist bis Slot + 12 min, dann wird ohne sie veröffentlicht und sie stehen als `stale` im Status.
2. **Laden.** Nur geänderte Gruppen, ≈ 22 Dateien zu 1–37 KB je Slot.
3. **Ableiten.** Kindprozess `scripts/road/road-derive.mjs` aus dem `buscosun-web`-Klon, wie `radar-derive.mjs`: dekodieren, in SI/°C normieren, Prüfer aus AW-1, Zuordnung über den Katalog, Zustandsklassen, atomar schreiben (tmp + rename).
4. **Sperren oder freigeben.** Die Slot-Prüfung aus AW-1 entscheidet; bei Rot wird nichts Neues veröffentlicht, der letzte gute Slot bleibt stehen.
5. **Veröffentlichen.** `publish()` heilt künftig `radar/` UND `road/`: fetch, reset auf `origin/main`, beide Bestände komplett einkopieren, commit `road: <slot>`, push mit Wiederholung.

**Dateilayout (versioniert, ein Formatwechsel heißt `v2`)**

```
road/v1/status.json               Job, letzter Slot, je Gruppe Stand und Alter, Prüfer-Bilanz, Sperre, Kill-Switch
road/v1/obs/<YYMMDDHHMM>.json     alle GÜLTIGEN Messpunkte des Slots: Werte, Klasse, Herkunft, Alter
road/v1/h24/<Ordner>.json         24-h-Ring je DWD-Ordner (96 Slots) für den Verlauf im Readout
road/v1/fc/<YYMMDDHHMM>.json      Ableitung +1/+3/+6 h je Messpunkt und Prognosepunkt (AW-6)
road/v1/quarantine/<slot>.json    verworfene Werte mit Regel und Rohwert, nur für die Diagnose
road/v1/static/stations.json      Stationskatalog aus sws_stations_xls (zeitlos)
road/v1/static/corridors.json     Korridore, km-Achse, Grenzpunkte, Prognosepunkte AT/CH (zeitlos)
```

Slot-Dateien sind inhaltlich unveränderlich, deshalb vertragen sie `@main` am CDN. Der Client liest kein veränderliches Manifest, sondern rechnet den erwarteten Slot aus der Uhr (Zeit-Gate wie beim Radar) und tritt bei 404 einen Slot zurück. `status.json` dient Wächter und Diagnose.

**Aufbewahrung** nach der Altersregel des Daten-Repos: `obs/` und `fc/` höchstens 3 h, mindestens 2 Slots; `quarantine/` 24 h; `static/` zeitlos. Kommt nach einem Force-Push ein Slot im Ring abhanden, füllt der Spiegel ihn aus dem 48-h-Fenster des DWD nach.

**Stationskatalog.** Einmal täglich das ETag von `sws_stations_xls.xlsx` prüfen; nur bei Änderung neu bauen (`scripts/road/road-catalog.mjs`, schlanker XLSX-Leser auf `node:zlib`, keine neue Abhängigkeit). Schlägt der Bau fehl, bleibt der alte Katalog und der Status meldet `catalog: stale`, statt still weiterzulaufen.

**Korridore** baut `scripts/road/build-corridors.mjs` monatlich oder bei Bedarf: Autobahnachsen aus BKG DLM250 (dl-de/by-2.0), AT aus GIP.at (CC BY 4.0), CH aus OSM, bis die ASTRA-Lizenz geklärt ist. Je Station Korridor, Richtung und Kilometer, dazu AT/CH-Prognosepunkte alle 10–15 km.

**Dokumentation und Kopien:** README-Abschnitt „Straßenwetter — `road/`“ im Daten-Repo, Budgetrechnung gegen die jsDelivr-Grenzen (20 MB je Datei, 150 MB je Paket) im Spike gemessen. `radar-mirror.mjs` und README im Daten-Repo sind Kopien aus `buscosun-web`.

## AW-1: Validierung und Plausibilität

Ein Wert, der eine Prüfung nicht besteht, steht nie in `obs/`; er landet mit Regel und Rohwert in `quarantine/`. Die Regeln leben in **einer** Datei, `src/road/roadContract.ts`, die Derive, Client und Verifier gleichermaßen importieren. So kann der Client nichts anzeigen, was der Producer nicht hätte veröffentlichen dürfen.

**Vier Sperren hintereinander**

1. **Wert- und Stationsprüfer im Derive.** Jeder Wert wird geprüft, bevor er geschrieben wird.
2. **Slot-Sperre vor dem Push.** Der Slot als Ganzes muss bestehen, sonst bleibt der letzte gute Slot stehen.
3. **Client-Prüfer vor der Anzeige.** Schema, Alter und Kill-Switch; im Zweifel „keine Daten“ statt eines falschen Werts.
4. **Wächter von außen.** Prüft stündlich, was jsDelivr tatsächlich ausliefert.

**Regeln** (Schwellen mit `set` sind begründete Startwerte; harte Regeln – Grenzen, −60 °C, DWD-Flag, hängender Sensor – gelten ab Tag 1; die statistischen Regeln – Sprung, Nachbarn, Cube-Abgleich – laufen zunächst im Beobachtungsmodus, protokollieren nur und werden nach ≥ 14 Tagen Schattenbetrieb kalibriert scharf geschaltet)

| Ebene | Regel | Folge |
| --- | --- | --- |
| Wert | physikalische Grenzen: Fahrbahn −40…+75 °C, Luft −40…+45 °C, Feuchte 0–100 %, Wind 0–60 m/s, Wasserfilm 0–10 mm (`set`) | verworfen |
| Wert | Temperatur unter −60 °C (Geräteplatzhalter wie −75,00 °C) | verworfen |
| Wert | Taupunkt > Luft + 0,5 K, Böe < Mittelwind | verworfen |
| Wert | DWD-Flag `qualityInformationAwsData` meldet „suspect“ | verworfen |
| Wert | 24 identische Werte in Folge (6 h); Ausnahme Fahrbahn −10…0 °C bei Luft innerhalb ±10 K um 0 °C (Tauplateau, Salzlake) | verworfen |
| Wert | Sprung der Fahrbahntemperatur zum Vorslot größer als die gemessene Schwelle (statistisch) | verworfen |
| Wert | unbekannter Zustandscode | Zustand „unbekannt“, nie „trocken“ |
| Station | keine Katalogzeile oder Koordinaten außerhalb DE | verworfen |
| Station | Luft weicht mehr als 8 K (`set`) von T2m des Fusion-Cubes am Ort ab (statistisch) | Station verworfen |
| Station | Fahrbahn weicht um mehr als k·MAD vom Median der Nachbarn ≤ 25 km gleicher Höhenklasse ab (statistisch, k gemessen) | verworfen |
| Station | Messzeit in der Zukunft (> Slot + 5 min) oder älter als 3 h | verworfen |
| Station | mehrere Sensoren: kältester plausibler Wert, Spanne > 5 K | Kennzeichen „Sensoren uneinig“ |
| Slot | weniger aktive Gruppen als die Basis aus dem Spike minus Toleranz | nicht veröffentlicht |
| Slot | mehr als 10 % der Werte verworfen (`set`) | nicht veröffentlicht |
| Slot | geschriebene Datei besteht den Schema-Prüfer nicht (Rundlauf) | nicht veröffentlicht |
| Client | Slot älter als 45 min | Punkte grau „veraltet“ |
| Client | Slot älter als 3 h oder Kill-Switch gesetzt | Seite zeigt „derzeit keine Messdaten“ |

Drei Zustände je Wert, wie die Provenienzregel der Punktlinie: `ok` (der DWD hat geprüft und nichts beanstandet, unsere Prüfer bestanden), `unchecked` (unsere Prüfer bestanden, der DWD hat nicht geprüft – der Normalfall) und `derived` (Ableitung, AW-6). `suspect` gibt es im ausgelieferten Bestand nicht.

**Bilanz statt Blindflug:** `status.json` zählt je Slot die verworfenen Werte je Regel und je Gruppe (im Beobachtungsmodus: „wäre verworfen“). Der Wächter schlägt an, wenn eine Regel plötzlich viel mehr verwirft als üblich – das ist meist ein Formatwechsel beim DWD, kein Wetter.

## AW-4: Startseiten-Kachel und Routing

Die Kachel „11 · Autobahnwetter“ kommt ans Ende des Bento-Rasters, wie Waldbrand in WB1: Die Reihenfolge der bestehenden Kacheln bleibt unangetastet. Sie lädt keine Daten, damit die Startseite nicht langsamer wird.

| Datei | Änderung |
| --- | --- |
| `src/App.tsx` | `FeatureId` um `road` erweitern |
| `src/router/routes.ts` | `RouteId` `autobahnwetter`, Pfad `/autobahnwetter`, Aliase `/strassenwetter` und `/glaette`, SEO-Meta (Titel, Beschreibung, H1, Lead), optional Unterseiten je Autobahn (E-AW-4); `FEATURE_PATH.road` |
| `src/router/router.tsx` | Lazy-Seite `pages/RoadRoute` |
| `src/SearchPage.tsx` | `FEATURE.road`, Kachel 11 am Ende von `BentoGrid`, Kategorie „Planen“, `TOOL_TILE_COUNT` 10 → 11, Palette-Eintrag „12 · Autobahnwetter“ |
| `src/SearchPage.css` | nur falls E-AW-5 das Raster ändert; sonst bestehende Klassen der Waldbrand-Kachel, Farben inline |
| `netlify.toml` | 301 für die Aliase |
| `src/seo/subRouteTexts.ts`, `scripts/generate-seo.mjs` | statische Shell und Sitemap-Einträge |
| `og-meta` Edge Function, `scripts/render-og-app-cards.mjs` | Route wird teilbar, eigene Vorschaukarte (Edge Function = STOPP-Zone, nur mit Jans Freigabe) |
| MobileTabBar, DeckFooter | prüfen, ob sie Features aufzählen; wenn ja, ergänzen |

**Kachel-Inhalt (Entwurf)**

- Eyebrow: `11 · AUTOBAHNWETTER`
- Titel: „Ist die Strecke glatt?“
- Text: „Fahrbahntemperatur und -zustand von rund 1.000 Glättemeldeanlagen des DWD, alle 15 Minuten — je Autobahn als Streckenband, mit Prognose für deine Abfahrt.“
- Vorbehalt: „Kein amtliches Warnprodukt. Österreich und Schweiz nur als Prognose, ohne Fahrbahnmessung.“
- Icon: Straßen-Glyph als Inline-SVG in Autobahn-Blau, Farben inline wie bei Waldbrand.

**Prüfungen:** `verify:routing` (neue Route, Aliase, Unterseiten), `verify:seo`, `verify:share`, `npm run budget` (eagerJs darf nicht wachsen; die Kachel liegt im Chunk der Startseite), `typecheck`, `build`. Desktop-Pixelvergleich der Startseite oberhalb der neuen Kachel: unverändert.

## AW-5: Feature-Seite im Command-Deck

Die Seite folgt dem Brandradar: Rail, Topbar, Dock links, Karte, Readout rechts, dazu das Streckenband über dem Kartenfuß. Die Vorlage liegt als `reference/autobahnwetter-desktop.dc.html` (dazu `reference/autobahnwetter-mobile.dc.html` und `reference/README-autobahnwetter.md`) und wird wie beim Dashboard per Pixelvergleich abgenommen.

| Modul in `src/road/` | Aufgabe |
| --- | --- |
| `roadContract.ts` | Vertrag aus AW-1: Pfade, Schema, Prüfer, Zeit-Gate, Kill-Switch |
| `roadClasses.ts` | Zustandsklassen, mit dem Derive geteilt (eine Regel, zwei Verbraucher) |
| `roadClient.ts` | Slot aus der Uhr bestimmen, `obs/` + `static/` laden, bei 404 zurückgehen, jsDelivr mit Ausweich auf `raw.githubusercontent.com` wie `fetchImgRes` (V-FI-5), Client-Prüfer |
| `roadState.ts` | URL-Zustand `/autobahnwetter/a8?st=irs&t=0&dir=1` über `urlState.ts` |
| `RoadPage.tsx` | Deck-Gerüst, Lazy-Chunk |
| `RoadMap.tsx` | MapLibre: GeoJSON-Quellen für Korridore und Messpunkte, Kreis-Layer nach Klasse, Ringe für Prognosepunkte, Auswahl, `fitBounds` je Korridor |
| `RoadDock.tsx` | Suche, Länderfilter, Autobahnliste mit Status, Ebenen, blockierte Quellen sichtbar, Datenlage je Land |
| `RoadBand.tsx` | Streckenband nach Kilometer, Lücken schraffiert, Grenzmarke |
| `RoadReadout.tsx` | Reiter Station, Strecke, Quellen; Verlauf aus `h24/`; Warnungen über `dwdCapAlerts.ts`, wörtlich |
| `roadDeck.css` | nur aus `RoadPage` importiert; Tokens `--aw-*` additiv in `designTokens.css` |

**Zustände ohne Daten** („keine Daten“ darf nie wie „trocken“ aussehen, D-04):

- CDN nicht erreichbar oder Kill-Switch: Seite lädt, Karte ohne Punkte, Hinweis mit Grund.
- Gruppe tot: Abschnitt im Band schraffiert, Autobahnliste nennt die Lücke.
- Messpunkt veraltet (> 45 min): grau, Alter im Readout.
- AT/CH ohne AW-6: Korridor endet an der Grenze mit Hinweis „ab hier keine offene Fahrbahnmessung“.

**Bedienung und Geräte:** Touch-Ziele ≥ 44 px, Breakpoints 767 und 1439, mobil Bottom-Sheet in zwei Stufen. Erstanzeige gemessen wie beim Dashboard (`dashboard-latency.mjs` als Muster); Ziel unter 1,5 s auf Desktop, für Mobil-4G im Gate festlegen.

**Wiederverwendung statt Neubau:** Teilen-Knopf aus `src/share`, Datenalter aus `dataAge.ts`, Basiskarte und Kartensteuerung wie `FireMap.tsx`, Warn-Zitatregel wie im Warn-Layer.

## AW-6: Prognose und AT/CH-Prognosepunkte

Die Ableitung +1/+3/+6 h entsteht im Derive, nicht im Browser: Der Spiegel hat den Fusion-Cube (`point/`) ohnehin im Klon, und der Client müsste sonst für jeden Korridor ein Dutzend Punktabfragen rechnen. Sichtbar wird sie erst nach Gate D; bis dahin zeigt die Seite nur Messungen.

**Methode (Startfassung, jede Konstante begründet oder gefittet)**

- Grundlage: T2m, Td, Niederschlag und Schneefallgrenze der Stufe 1 an den Zellen der Messpunkte.
- Fahrbahn = Cube-T2m plus die zuletzt gemessene Differenz Fahrbahn − Luft, die mit einer Zeitkonstante τ abklingt; τ wird im Backtest gefittet, nicht gesetzt.
- Klasse wie in den Zustandsregeln, nur mit abgeleiteten Werten; Herkunft `derived`.
- Prognosepunkte AT/CH aus `corridors.json`: Klasse aus Cube-T2m/Td/Niederschlag, Anker die nächste TAWES- bzw. SwissMetNet-Station ≤ 15 km (Luft, 5-cm-Temperatur). Abruf gebündelt einmal je Slot, also 4 von 240 erlaubten GeoSphere-Anfragen je Stunde.

**Backtest als Gate D:** Frostgefahr +1/+3/+6 h gegen die später gemessene Klasse an denselben Anlagen, Brier-Score sowie Treffer- und Fehlalarmquote je Vorlauf, Pflicht-Baseline Persistenz. Dafür reicht der 24-h-Ring nicht. Vorschlag: `road/v1/obs/` täglich in `buscosun-archiv` ablegen (E-AW-6). Genug Frostlagen für eine belastbare Messung gibt es typischerweise erst ab November – Gate D fällt daher voraussichtlich in den Dezember.

## Verifikation, Gates und Abnahme

Jedes Arbeitspaket endet mit einem Verifier im Repo-Stil (`npm run verify:*`, Headless, kein Test-Framework) und einem belegten Gate.

| Verifier | Prüft |
| --- | --- |
| `verify:road-contract` | jeder Prüfer gegen gute und schlechte Fixtures: −75,00 °C, hängender Sensor, Tauplateau, Sprung, Zukunftszeit, unbekannter Code, Doppelstation, Slot unter Basis |
| `verify:road-decode` | Dekodierung eines eingefrorenen Slots aller Gruppen gegen eine Referenz (eccodes- bzw. wetterdienst-Ausgabe als Fixture), Abweichung 0 |
| `verify:road-derive` | Ende-zu-Ende gegen ein lokales Bare-Repo wie beim Radar-Spiegel: atomares Schreiben, Aufbewahrung, Slot-Sperre, Heilung nach simuliertem Force-Push |
| `verify:road-ui` | Zustände ohne Daten, Auswahl, Zeitregler, beide Breakpoints, Touch-Ziele, Konsole |
| `verify:routing`, `verify:seo`, `verify:share` | neue Route, Aliase, Shell, Vorschaukarte |
| `npm run health` (erweitert) | von außen: Slot-Alter < 45 min, Gruppen ≥ Basis, verworfener Anteil unter Schwelle |
| `typecheck`, `build`, `budget` | wie bei jeder Änderung an `src/` |

| Gate | Kriterium | Beleg |
| --- | --- | --- |
| A – Spike | E-AW-1 bis E-AW-3 entschieden, Codetabelle Fahrbahnzustand geklärt, Autobahn-Anteil gezählt, Startwerte der Schwellen aus dem 48-h-Fenster | `audit/autobahnwetter.md` |
| B – Schattenbetrieb | 7 Tage Produktion in `buscosun-data` bei Flag aus: keine Lücke > 30 min außer bei DWD-Ausfall, Slot-Alter p95 < 25 min, Stichprobe von 50 verworfenen Werten ohne Fehlalarm; statistische Prüfer nach ≥ 14 Tagen kalibriert und scharf | `status.json`-Reihe, Health-Protokoll |
| C – Seite live | fünf Selbstverifikations-Fragen (CLAUDE.md), Desktop 1440 und iPhone 12 Pro, Pixelvergleich gegen die Vorlage, Erstanzeige im Ziel | Screenshots, Verifier-Ausgaben |
| D – Prognose | Ableitung schlägt Persistenz signifikant bei Frostgefahr, je Vorlauf | Backtest-Skript und Report |

Erst nach Gate C geht das Flag für Messungen an, erst nach Gate D für die Prognose.

## Entscheidungen und Risiken

| Nr. | Frage | Optionen | Empfehlung |
| --- | --- | --- | --- |
| E-AW-1 | Wo läuft der Ingest? | Produkt im Radar-Spiegel · eigener Workflow mit Selbstverkettung | Radar-Spiegel: Dauerlauf, heilende Veröffentlichung, kein Cron-Verzug |
| E-AW-2 | Welches Rohformat? | QA-XML aus `quality-assured/` (bz2) · BUFR mit eigenem TS-Decoder · BUFR mit eccodes (Python im Job) | XML, wenn der Spike Vollständigkeit und Takt bestätigt; sonst eigener Decoder für das eine Template, eccodes nur als Referenz im Verifier |
| E-AW-3 | Bundes- und Landesstraßen? | nur Autobahnen · alle Anlagen | alle im Datensatz; die Seite zeigt Autobahnen, B- und L-Straßen als zuschaltbare Ebene |
| E-AW-4 | Unterseiten je Autobahn für SEO? | keine · Auswahl · alle | Auswahl, z. B. die 20 Autobahnen mit den meisten Anlagen |
| E-AW-5 | Platz der Kachel? | volle Breite am Ende · Paar mit Waldbrand | volle Breite am Ende: kein Eingriff in `SearchPage.css`, kein Risiko für `eagerCss` |
| E-AW-6 | Archiv für den Backtest? | Tagesablage in `buscosun-archiv` · keins | Tagesablage; ohne sie ist Gate D nicht messbar |

Der aktuelle Status der Entscheidungen steht im Startprompt bzw. in `audit/autobahnwetter.md`.

| Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- |
| Spiegel fällt aus | Radar und Straßenwetter gleichzeitig weg | bestehender Wachhund; Health prüft `road/` getrennt |
| DWD ändert Format oder Dateinamen (wie beim RV-Wechsel bis 20.10.2026) | Dekodierung liefert Müll | Prüfer-Bilanz, Slot-Sperre, Alarm; versionierter Pfad `v1` |
| Force-Push der Karten- oder Punktlinie verschluckt Commits | Lücke im 24-h-Ring | heilende Veröffentlichung, Nachfüllen aus dem 48-h-Fenster des DWD |
| jsDelivr liefert kurz 403 oder alten Stand | leere Karte | Zeit-Gate, Schritt zurück, Ausweich auf GitHub raw |
| Prüfer zu scharf | echte Glätte verworfen, etwa auf dem Tauplateau | Beobachtungsmodus, Schwellen messen, Stichprobe in Gate B, Bilanz je Regel |
| Nutzer verlässt sich auf „trocken“ | Sicherheits- und Haftungsfrage | Vorbehalt auf Kachel und Seite, keine Entwarnungssprache, „Messpunkt, nicht Strecke“ |
