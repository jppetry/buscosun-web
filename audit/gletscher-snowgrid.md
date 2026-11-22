# Phase GN — SNOWGRID als eigenes Produkt `glacier/v1/snow/` (nur Daten)

Diagnose, Umsetzung und Gate der Phase. Auftrag Jan 21.11.2026 (Prompt „Phases GI + GN“): die Schneehöhe und der Schneewasserwert
der Analyse „SNOWGRID Klima v2.1“ von GeoSphere Austria je österreichischem Gletscher als tägliches Dokument, dazu einmal gebaut die
Spanne früherer Winter je Kalendertag. **Keine Anzeige in dieser Phase** — die Darstellung („Schneeverlauf gegen frühere Winter“)
kommt nach Jans Wahl der Mockup-Variante. Begonnen nach dem grünen Gate der Phase GI (`audit/gletscher-imis.md`).

## 1 Anker (am Code und an den Daten gelesen, 21./22.11.2026)

- **Gletscher-Linie:** `glacier/v1/` auf `main` des Daten-Repos, EIN Publisher (`scripts/glacier/glacier-publish.mjs`) mit benannten
  Linien (`static|sat|melt|feed|stations`): jede Linie darf nur ihre Unterpfade schreiben, Zeiger `index.json` und `status.json`
  werden gepatcht, nie `--force`. Der ausgelieferte Stand der Seite prüft am Zeiger nur `kind` und `static.build` — ein zusätzlicher
  Schlüssel stört ihn nicht (so kam `stations` dazu).
- **Katalog:** Build `20261120-1`, 799 österreichische Gletscher, je Gletscher EIN Punkt (`lat`, `lon`) und die Höhenspanne
  `z = [unten, Median, oben]` — die Lage von Zunge und Oberkante steht nicht im Katalog. Umrisse `outline/<region>-L1.json`.
- **Wettervertrag:** führt Modell-Neuschnee in mm Wasserwert. SNOWGRID liefert die Schneehöhe in **Metern** (nicht in cm, wie der
  Auftrag annahm) und den Wasserwert in kg/m² (= mm).

## 2 Schritt 0 — Messungen (21.11.2026 23:33–23:55 UTC)

Werkzeug: `audit/gletscher-snowgrid/schritt0.mjs` (liest den Katalog, die L1-Umrisse und drei Antworten der Raster-API für den
20.11.2026, die zusammen alle österreichischen Gletscher decken; die Antworten liegen nur im Scratchpad der Sitzung).

### 2.1 Der Datensatz

| Punkt | Messwert |
|---|---|
| Datensatz | „SNOWGRID Klima v2.1“ (`snowgrid_cl-v2-1d-1km`), GeoSphere Austria, DOI `10.60669/fsxx-6977`, Lizenz **CC BY 4.0** (`license_id` der Metadaten), Zitat `https://doi.org/10.3390/atmos11121330`. Beschreibung: „liefert Analysen von Schneehöhe, Schneewasserwert (SWE) auf einem österreichweiten 1x1km-Gitter“ |
| Größen und Einheiten | `snow_depth` „total snow depth“ in **m** (zwei Nachkommastellen = cm) · `swe_tot` „total snow water equivalent“ in **kg m-2** (ganze Zahlen) |
| Zeit | täglich, Stempel `…T00:00+00:00`, 01.01.1961 bis 20.11.2026 (Stand 21.11. 23:33 UTC). Was der Stempel innerhalb des Tages meint (Zustand um 00 UTC oder Tageswert), nennen die Metadaten nicht |
| Gitter | 1 km, EPSG:3416 (Austria Lambert), Grenzen 46,16–49,18° N, 9,39–17,38° E; Zellen außerhalb Österreichs tragen `null` (14 929 von 42 183 Zellen im Ausschnitt der Gletscher) |
| Verzug | Die Metadaten und die Jahresdatei 2026 wurden am 21.11. um 09:09 UTC geschrieben und enden am 20.11. ⇒ **der Vortag erscheint gegen 09:10 UTC** |
| Abruflimits (Antwortköpfe) | 5 Abrufe je Sekunde, **240 je Stunde** (`X-RateLimit-Limit-Second/-Hour`) |
| Größe je Abruf | **höchstens 1 000 000 Werte** (Größen × Punkte × Tage) — gemessen: „The data slice you requested is too large. The limit is 1000000 data points. You requested 2165850.“ |
| Das verlinkte PDF | „Limitierungen Gitterdaten“ (`Limitierungen_Gitterdaten_DACH.pdf`) handelt NICHT von Abruflimits, sondern von der Aussagekraft der Gitterwerte: die effektive Auflösung ist „deutlich gröber als die Maschenweite, oft sogar ein Vielfaches davon“; ein Gitterwert hat „nicht das Klima von Punktwerten“, sondern das eines Gebietsmittels; Extreme sind geglättet. Empfehlung: auf größeren Raumskalen lesen |

### 2.2 Die drei Zugriffswege

| Weg | Form | gemessen |
|---|---|---|
| Dateien | `https://public.hub.geosphere.at/datahub/resources/snowgrid_cl-v2-1d-1km/filelisting/<größe>/SNOWGRID-CL_<größe>_<jahr>.nc` — eine NetCDF-Datei je Jahr und Größe | 132 Dateien, 8,3–17,8 MB, zusammen 1,78 GB; die Datei des laufenden Jahres wird täglich GANZ neu geschrieben (8,3 MB am 21.11.) |
| Raster-API | `…/v1/grid/historical/snowgrid_cl-v2-1d-1km?parameters=&start=&end=&bbox=s,w,n,e&output_format=geojson\|netcdf` | je Zelle ein Punkt mit Länge, Breite und Wert; 4,0 MB für 21 000 Zellen und einen Tag |
| Zeitreihen-API | `…/v1/timeseries/historical/snowgrid_cl-v2-1d-1km?parameters=&start=&end=&lat_lon=<lat>,<lon>&lat_lon=…&output_format=geojson\|csv` | MEHRERE Punkte je Abruf; die Antwort nennt je Punkt die Koordinaten der getroffenen ZELLE (der Punkt rastet auf die nächste Zelle ein) und `datapoints`; 1,1 KB für zwei Punkte und elf Tage |

### 2.3 Zellen je Gletscher und Kosten

Rasterantwort für 2026-11-20T00:00+00:00: 42183 Zellen, davon ohne Wert 14929; Österreichs Gletscher im Katalog: 799

#### Zellen je Gletscher (Mittelpunkt der 1-km-Zelle im L1-Umriss)

| Zellen | Gletscher |
|---|---|
| keine Zelle mit Mittelpunkt im Umriss (nächste Zelle zum Katalogpunkt) | 649 |
| 1 Zelle | 99 |
| 2–5 Zellen | 41 |
| 6–20 Zellen | 10 |
| über 20 Zellen | 0 |

Gletscher ohne Zelle im Umriss: 649; Abstand der nächsten Zelle zum Katalogpunkt: Median 0.41 km, größter 0.69 km; über 0,75 km (außerhalb des Gitters oder am Rand): 0

Verschiedene Zellen, die mindestens ein Gletscher braucht: **763** (ohne Wert am Messtag: 18); größter Gletscher: Gepatsch Ferner 14, Pasterzen Kees 13, Mittelberg Ferner 9
Gletscher unter 1 km² (eine Zelle = 1 km²): 732 von 799

#### Kosten

| Weg | Abrufe | Werte | Menge |
|---|---|---|---|
| ein Tag über die Zeitreihen-API (alle Zellen, zwei Größen, 150 Punkte je Abruf) | 6 | 1526 | rund 0,2 MB |
| sieben Tage (Nachlesen der letzten Woche) | 6 | 10682 | rund 0,5 MB |
| Referenz 1991–2020 über die Zeitreihen-API (10 958 Tage, eine Größe, 91 Zellen je Abruf = 997 178 Werte) | 9 | 8360954 | rund 42 MB |
| ein Tag aus den Jahresdateien (zwei NetCDF-Dateien des laufenden Jahres) | 2 | — | 17–35 MB je Tag |
| Referenz aus den Jahresdateien (30 Jahre × eine Größe) | 30 | — | rund 360 MB |

Schneehöhe der gebrauchten Zellen am 2026-11-20T00:00+00:00: Minimum 0.06 m, Median 0.41 m, 90 % 0.65 m, Maximum 3.31 m; Zellen mit 0 m: 0

#### Je Region

| Region | Gletscher | mit Zellen im Umriss | nächste Zelle | außerhalb des Gitters |
|---|---|---|---|---|
| at-allgaeuer-alpen | 1 | 0 | 1 | 0 |
| at-ankogel-hochalmspitzgruppe | 43 | 7 | 36 | 0 |
| at-dachstein | 8 | 2 | 6 | 0 |
| at-defreggergruppe | 6 | 0 | 6 | 0 |
| at-glocknergruppe | 74 | 19 | 55 | 0 |
| at-goldberggruppe | 30 | 3 | 27 | 0 |
| at-granatspitzgruppe | 23 | 0 | 23 | 0 |
| at-hochkoenig | 2 | 1 | 1 | 0 |
| at-karnische-alpen | 1 | 0 | 1 | 0 |
| at-lechtaler-alpen | 11 | 0 | 11 | 0 |
| at-oetztaler-alpen | 185 | 49 | 136 | 0 |
| at-raetikon | 2 | 1 | 1 | 0 |
| at-rieserfernergruppe | 5 | 1 | 4 | 0 |
| at-samnaungruppe | 3 | 0 | 3 | 0 |
| at-schobergruppe | 16 | 2 | 14 | 0 |
| at-silvrettagruppe | 40 | 7 | 33 | 0 |
| at-stubaier-alpen | 108 | 17 | 91 | 0 |
| at-venedigergruppe | 88 | 21 | 67 | 0 |
| at-verwallgruppe | 27 | 3 | 24 | 0 |
| at-zillertaler-alpen | 126 | 17 | 109 | 0 |

**Günstigster Weg:** die Zeitreihen-API mit den Mittelpunkten der gebrauchten Zellen — ein Tag sind 6 Abrufe und rund 0,2 MB (gegen
17–35 MB aus den Jahresdateien), die Referenz 1991–2020 einmalig 9 Abrufe. Die Raster-API braucht es nur EINMAL: um die Zellen zu
finden, deren Mittelpunkt in einem Umriss liegt.

### 2.4 Werden vergangene Tage überarbeitet?

Am Verzeichnis gelesen: die Jahresdateien 1961–2022 tragen alle das Datum 15.06.2023 (Auslieferung der Version 2.1), die Dateien
2023, 2024 und 2025 je ein Datum Anfang Januar des Folgejahres — **abgeschlossene Jahre wurden danach nicht mehr geschrieben**. Die
Datei des laufenden Jahres wird täglich ganz neu geschrieben; ob sich darin schon veröffentlichte Tage ändern, lässt sich am
Verzeichnis nicht lesen und an einem einzigen Abend nicht messen. ⇒ Der Producer liest bei jedem Lauf die letzten sieben Tage und
vergleicht mit den veröffentlichten Dokumenten; eine Abweichung steht in der Statuszeile (`revised`). Die Antwort ist damit nach
einer Woche Betrieb da (§9, Frage an Jan dann).

## 3 Diagnose

1. **Die meisten Gletscher sind kleiner als eine Zelle.** 732 von 799 liegen unter 1 km², bei 649 liegt kein Zellmittelpunkt im
   Umriss. Drei Punkte je Gletscher (Zunge, mittlere Höhe, Oberkante) fielen fast immer in dieselbe Zelle oder ihre Nachbarin — und
   der Katalog kennt die Lage dieser Punkte gar nicht. Das Infoblatt von GeoSphere, MeteoSchweiz und DWD sagt dasselbe von der anderen
   Seite: ein Gitterwert ist ein Gebietsmittel, Unterschiede von Zelle zu Zelle sind keine Auflösung. ⇒ **ein Wert je Gletscher: das
   Mittel der Zellen, deren Mittelpunkt im Umriss liegt, sonst die nächste Zelle zum Katalogpunkt** — mit der Zahl der Zellen und
   der Art im Produkt.
2. **Der Wert und seine Einordnung müssen aus DENSELBEN Zellen kommen.** Die Zellen je Gletscher werden deshalb einmal festgelegt
   (statische Datei) und sowohl vom täglichen Lauf als auch von der Klimatologie gelesen.
3. **Eine Analyse ist keine Messung.** Der Wert gilt für eine Zelle von 1 km² mit eigener, uns unbekannter Modellhöhe; an einem
   Kargletscher mischt sie Fels und Eis. Im Vertrag steht deshalb `origin: 'analysis'`; `measured` ist für dieses Produkt nicht
   vorgesehen und der Prüfer hält das fest.
4. **Einheiten:** das Produkt führt die Schneehöhe in cm (ganze Zahlen — die Quelle löst auf cm auf) und den Wasserwert in mm. Die
   Umrechnung m → cm steht im Vermerk „Geändert“.
5. **Asymmetrie:** SNOWGRID endet an der Staatsgrenze. Schweizer und deutsche Gletscher haben keinen Eintrag; das Dokument sagt es
   selbst (`coverage: 'AT'` mit Satz). 18 der gebrauchten Zellen an der Grenze trugen am Messtag keinen Wert — dort zählt die nächste
   Zelle MIT Wert innerhalb eines Kilometers, sonst hat der Gletscher keinen Eintrag („außerhalb des Gitters“).
6. **Die Einordnung als Zahl braucht mehr als drei Perzentile.** Gespeichert werden je Gletscher und Kalendertag sieben Stützwerte
   der Jahre 1991–2020 (kleinster, 10 %, 25 %, 50 %, 75 %, 90 %, größter); der Platz des Tageswerts ist die stückweise lineare
   Lage zwischen ihnen (0–100), unter dem kleinsten bzw. über dem größten mit eigenem Kennzeichen.
7. **Der 29. Februar** hat in 30 Jahren nur acht Werte. Regel (gesetzt): je Referenzjahr zählt der 29.02., wo es ihn gibt, sonst
   das Mittel aus 28.02. und 01.03. — so trägt auch dieser Tag 30 Werte.
8. **Der Runner holt den Producer von `origin/main`** von `buscosun-web`. Bis zu Jans Push läuft der neue Workflow leer; die
   statischen Dateien und der erste Tag kommen aus einem lokalen Lauf über den Publisher.

## 4 Plan

| Schritt | Inhalt |
|---|---|
| GN-1 Vertrag | `src/glacier/glacierSnowContract.ts` (rein): Pfade, Quelle und Lizenzzeile (nur vorbereitet), Einheiten, Grenzen, Leser der API-Antwort, Zellregel, Klimatologie (Perzentile, 29.02., Platz), Dokumentregeln |
| GN-2 Producer | `scripts/glacier/snow.mjs` mit drei Arten: `cells` (einmal, lokal), `clim` (einmal, lokal), `day` (täglich im Workflow): neuester Tag aus den Metadaten, fehlende Tage der letzten Woche, Vergleich mit Veröffentlichtem |
| GN-3 Publisher | Linie `snow: ['snow']`, Aufbewahrung der Tagesdokumente; Workflow-Vorlage `workflow-glacier-snow.yml` |
| GN-4 Prüfer | `verify:glacier-snow` (Fixture Byte für Byte aus echten API-Antworten, Gletscher außerhalb des Gitters, fehlender Tag, Wert außerhalb benannter Grenzen, 29.02., Größe des Dokuments, Gegenproben) |

Nicht angefasst: die Seite (keine Karte, kein Diagramm, kein Import des Vertrags in einer Anzeige), `obs/v1`, buscosun Fusion, Edge
Functions, Shader, Abhängigkeiten. Kein Raster im Daten- oder Archiv-Repo, keine Ablage der Tagesdokumente.

## 5 Entscheidungen im Auftrag (E-GN)

| Nr. | Entscheidung | Warum | Alternative |
|---|---|---|---|
| E-GN-1 | **Ein Wert je Gletscher: Mittel der Zellen im Umriss, sonst nächste Zelle** (`how: 'outline' \| 'nearest'`, Zahl der Zellen im Produkt) | §3.1 | Zunge / mittlere Höhe / Oberkante: bräuchte die Lage dieser Punkte (Höhenmodell) und läse an 92 % der Gletscher dieselbe Zelle dreimal |
| E-GN-2 | **Zeitreihen-API**, Zellen einmal über die Raster-API bestimmt | §2.3: 6 Abrufe je Tag | Jahresdateien: 17–35 MB je Tag und ein NetCDF-Leser im Producer |
| E-GN-3 | **Schneehöhe in cm, Wasserwert in mm** (ganze Zahlen) | die Stationen der Karte nebenan liefern cm; die Quelle löst auf cm auf | m wie die Quelle. Jans Entscheidung cm oder mm für die spätere Anzeige bleibt offen — das Produkt trägt beide Größen |
| E-GN-4 | **Referenz 1991–2020**, sieben Stützwerte je Kalendertag (0, 10, 25, 50, 75, 90, 100 %), ungeglättet (`SNOW_REF_YEARS`, `SNOW_CLIM_PCTS`, beides `set`) | Klimanormalperiode der WMO; 30 Werte je Tag | 1961–1990 oder alle Jahre seit 1961; geglättet über ±n Tage |
| E-GN-5 | **Platz als Zahl 0–100** aus den Stützwerten, dazu `below` / `above`, wenn der Wert außerhalb aller Referenzjahre liegt; kein Wort | Auftrag: „as a number, no wording“ | Rang unter den 30 Jahren (bräuchte alle 30 Werte je Tag: rund 30 MB) |
| E-GN-6 | **29.02.:** der Tag selbst in Schaltjahren, sonst das Mittel aus 28.02. und 01.03. | §3.7 | nur die acht Schaltjahre |
| E-GN-7 | **Grenzen** (alle `set`): Schneehöhe 0 … 1 500 cm, Wasserwert 0 … 8 000 mm; ein Wert außerhalb steht nicht im Dokument, sondern mit Grund unter `missing` | lieber kein Eintrag als ein kaputter Wert | — |
| E-GN-8 | **Höchstens 12 Abrufe je Lauf** (`SNOW_MAX_REQUESTS_PER_RUN`, `set`; gebraucht: 7), 300 ms Pause zwischen zwei Abrufen | Limit 5/s und 240/h | — |
| E-GN-9 | **Tagesdokumente bleiben 400 Tage** im Daten-Repo, keine Ablage | die Quelle hält die ganze Reihe; ein Winter soll später lesbar sein | kürzer; oder eine Saisondatei je Region, sobald die Anzeige feststeht (V-GN) |
| E-GN-10 | **Lauf täglich 10:25 und 15:25 UTC** (zweiter Lauf fängt einen späten Tag) | Vortag erscheint gegen 09:10 UTC | einmal am Tag |
| E-GN-11 | **Ein veröffentlichter Tag wird nicht überschrieben**; weicht die Quelle später ab, steht der Tag unter `revised` in der Statuszeile | Auftrag: melden und fragen | überschreiben |
| E-GN-12 | **Zellen und Klimatologie hängen am Katalog-Build.** Nach einem neuen statischen Build baut der tägliche Lauf weiter mit den Zellen des alten Builds (neue Gletscher fehlen, die Statuszeile sagt es), bis beide lokal neu gebaut sind | zwei lokale Läufe von zusammen 10 Abrufen; auf dem Runner wären es dieselben, aber der Bau soll gesehen werden | im Workflow neu bauen |

## 6 Umsetzung

### 6.1 Dateien

| Datei | Inhalt |
|---|---|
| `src/glacier/glacierSnowContract.ts` | Vertrag (rein, nur der Gletscher-Vertrag als Import): Pfade, Quelle und vorbereitete Lizenzzeile, Einheiten und Grenzen, Leser der API-Antworten (`parseSnowAnswer`), Zellregel (`buildSnowCells`, `snowInOutline`), Mittel je Gletscher, Klimatologie (`snowRefValues`, `snowClimRow`, `snowPercentile`), Lage (`snowPlace`), Tagesdokument (`buildSnowDay`), Dokumentregeln |
| `scripts/glacier/snow.mjs` | Producer mit drei Arten (`--mode=cells \| clim \| day`), README des Produkts |
| `scripts/glacier/glacier-publish.mjs` | Linie `snow: ['snow']`, Aufbewahrung (Tagesdokumente 400 Tage, je zwei Zellendateien und Klimatologien) |
| `scripts/glacier/workflow-glacier-snow.yml` | Vorlage des Workflows (10:25 und 15:25 UTC) |
| `scripts/glacier/make-snow-fixture.mjs`, `scripts/lib/fixtures/glacier/snow/*` | Aufzeichnung (vier Abrufe) und ihre Dateien: Metadaten, ein Tag des Rasters, eine Woche und die Referenzjahre der Zeitreihe — Byte für Byte —, dazu sechs Katalogeinträge mit Umrissen |
| `scripts/verify-glacier-snow.mjs`, `package.json`, `.github/workflows/ci.yml`, `.gitattributes` | Prüfer und Einbindung |
| `audit/gletscher-snowgrid/schritt0.mjs` | Messung aus §2.3 |

Nicht geändert: jede Datei der Seite (`src/` nennt das Produkt nur im Vertrag selbst), buscosun Fusion, `obs/v1`, Edge Functions, Shader,
Abhängigkeiten, die Ablage.

### 6.2 Das Produkt

```
glacier/v1/snow/<yyyymmdd>.json                         ein Tag: glaciers { id: [Schneehöhe cm, Wasserwert mm, Lage 0–100 | null, Kennzeichen −1|0|1] }, missing [[id, Grund]]
glacier/v1/snow/static/cells/<build>.<n>.json           Gletscher → Zellen [[lat, lon]…], how: outline | nearest (+ km), region; outside [[id, Grund]]
glacier/v1/snow/static/clim/<build>.<n>/<region>.json   je Gletscher 366 Kalendertage × [0, 10, 25, 50, 75, 90, 100 %] der Schneehöhe 1991–2020 in cm
glacier/v1/snow/README.md                               Quelle, Lizenz, „Geändert“, Herkunft, Abdeckung (aus dem Vertrag erzeugt)
glacier/v1/index.json → snow                            { day, builtAt, n, cells, clim }
glacier/v1/status.json → lines.snow                     { day, checkedAt, sourceEnd, requests, written, revised, noData, stale?, clim? }
```

Jedes Tagesdokument trägt `origin: 'analysis'` mit Satz, `coverage: 'AT'` mit Satz, Quelle mit Lizenz und DOI, Einheiten, Grenzen und die
Namen der Zellendatei und der Klimatologie, aus denen Wert und Lage kommen. Die Klimatologie trägt denselben Namen wie ihre
Zellendatei; passt sie nicht dazu, bleibt die Lage leer.

| Benannt (alle `set`) | Wert |
|---|---|
| `SNOW_LIMITS` | Schneehöhe 0 … 1 500 cm · Wasserwert 0 … 8 000 mm |
| `SNOW_NEAREST_MAX_KM` | nächste Zelle mit Wert höchstens 1 km vom Katalogpunkt |
| `SNOW_REF_YEARS`, `SNOW_CLIM_PCTS` | 1991–2020 · 0, 10, 25, 50, 75, 90, 100 %; unter 20 Jahren keine Zeile |
| `SNOW_POINTS_PER_REQUEST`, `SNOW_MAX_REQUESTS_PER_RUN`, `SNOW_REQUEST_PAUSE_MS` | 150 Punkte je Abruf · höchstens 12 Abrufe je Lauf · 300 ms Pause; je Abruf eine Wiederholung |
| `SNOW_BACKFILL_DAYS` | 7 Tage zurück nachholen und nachlesen |
| `GLACIER_SNOW_KEEP_DAYS`, `GLACIER_SNOW_DAY_MAX_BYTES` | 400 Tage · 200 000 Bytes |

## 7 Gate

### 7.1 `verify:glacier-snow` — 37/37

| Block | Inhalt |
|---|---|
| A | die vier Aufzeichnungen Byte für Byte (sha256, gleich dem Protokoll der Aufzeichnung), mit Gegenprobe |
| B | Leser: Tage, Zellen, Meter → cm; eine andere Einheit, ein anderer Zeitstempel, eine zu kurze Reihe brechen ab; Zellen ohne Wert bleiben `null` |
| C | Zellen am echten Auszug (zwei Gletscher mit Zellen im Umriss, vier mit nächster Zelle); **Gletscher außerhalb des Gitters** (über die Grenze verschoben) mit Gegenprobe; Regeln der Zellendatei |
| D | Klimatologie aus der echten Antwort, von Hand nachgerechnet (eine Zelle; mehrere Zellen); **29. Februar** von Hand, Gegenprobe „nur Schaltjahre“; unter 20 Jahren keine Zeile |
| E | Lage als Zahl: Stützwerte, linear dazwischen, monoton, `below` / `above`, flache Stelle |
| F | Lauf Ende zu Ende: zwei Abrufe (die Adresse Zeichen für Zeichen die der Aufzeichnung), Dokument von Hand, Zeiger und Status; einmal veröffentlicht, `revised`; Nachholen; **fehlender Tag**; **Wert außerhalb der benannten Grenzen**; ohne bzw. mit fremder Klimatologie, alter Build, ohne Zellendatei; Abruf-Deckel; **Größe des Dokuments**; Quelle antwortet nicht |
| G | Abdeckung: nur österreichische Gletscher, Dokument sagt warum; der Zellen-Lauf zählt nur Zellen mit Wert |
| H | Herkunft `analysis`, nie `measured`; keine Datei der Seite nennt das Produkt; buscosun Fusion und `obs/v1` unbeteiligt; kein Raster gespeichert; keine gesperrten Wörter |
| I | Publisher-Linie, Aufbewahrung, keine Ablage, Workflow-Vorlage, README, Einbindung |

**Gegenproben am Prüfer selbst** (Code verändert, ein Lauf je Fehler, Datei danach wiederhergestellt): 20 eingebaute Fehler, alle bemerkt —
Schneehöhe bleibt in Metern → B1, F2, F4, F7; Zellen ohne Wert zählen mit → G2 (zuerst unbemerkt, der Prüfpunkt kam dafür dazu);
nächste Zelle bis 5 km → C2, C3; 29.02. nur aus Schaltjahren → D1, D2; Perzentil ohne Interpolation → D1–D3; kein Kennzeichen unter
jedem Referenzjahr → E1; leerer Tag wird geschrieben → F6; veröffentlichter Tag wird überschrieben → F4, F5; Abweichung der Quelle
nicht gemeldet → F4; kein Abruf-Deckel → F9; keine Größengrenze → F10; Herkunft `measured` → H1; Klimatologie fremder Zellen → F8;
erste Zelle statt Mittel → F2; Linie darf `stn` schreiben → I1, I4; Aufbewahrung 30 Tage → I2; durch Abbruch mit Exit ≠ 0: keine
Grenzprüfung und Lage als Wort (der Producer verwirft sein eigenes Dokument), Katalog ohne Länderfilter und Zelle im Loch des
Umrisses (die Adresse der Aufzeichnung passt nicht mehr).

### 7.2 Lokale Läufe gegen die echte API (21.11.2026 abends, UTC)

| Lauf | Ergebnis |
|---|---|
| 23:46 `--mode=cells`, 13 s | Rastertag 20.11.2026 in zwei Abrufen (22 936 Zellen mit Wert); **799 Gletscher: 150 mit Zellen im Umriss, 649 mit der nächsten Zelle, keiner außerhalb**; 756 Zellen; Abstand der nächsten Zelle im Median 0,41 km, größter 0,78 km; Datei 106 KB (gepackt 18 KB). 748 Gletscher lesen genau EINE Zelle; **342 Gletscher teilen sich ihre Zelle mit mindestens einem Nachbarn** (155 Zellen, bis zu vier Gletscher je Zelle) |
| 23:46–23:49 `--mode=clim`, 128 s | neun Abrufe (je 91 Zellen × 10 958 Tage), 20 Regionsdateien, zusammen 7,6 MB roh / 2,2 MB gzip / 1,4 MB Brotli, größte `at-oetztaler-alpen` 1,7 MB; keine Zeile leer. Pasterze am 01.01.: 51 / 84 / 100 / 114 / 126 / 141 / 214 cm |
| 23:49 `--mode=day`, 19 s | sieben Abrufe; sieben Tagesdokumente 14.–20.11. (der erste Lauf holt die Woche nach), je 30,5 KB roh / 7,7 KB gepackt, 799 Gletscher, keiner fehlt. 20.11.: Schneehöhe 6 … 331 cm, Median 42 cm; Lage im Median 13, 104 Gletscher unter jedem Referenzjahr, keiner darüber. Pasterze `[63, 120, 16, 0]`, Hintereisferner `[39, 69, 7, 0]` |

Zusammen 22 Abrufe bei GeoSphere für diese drei Läufe, dazu Schritt 0 und die Aufzeichnung (zusammen rund 15); das Stundenlimit von
240 wurde nie erreicht (`X-RateLimit-Remaining-Hour` zuletzt 211).

### 7.3 Pushs

Beide in `buscosun-data` `main`, ohne Force, je vom aktuellen `origin/main`; `buscosun-archiv` unberührt (keine Ablage). Autor der Commits
ist die Kennung der Gletscher-Workflows (`buscosun-glacier[bot]`).

| Commit | Zeit (UTC, 22.11.2026) | Inhalt | Geprüft nach dem Push |
|---|---|---|---|
| `dd73a63809f7991a897d70b16c9e598c54fb967e` | 00:05 | über den Publisher (Linie `snow`, ein Versuch): 29 Dateien unter `glacier/v1/snow/` — Zellendatei `static/cells/20261120-1.1.json`, 20 Regionsdateien `static/clim/20261120-1.1/`, sieben Tagesdokumente `20261114.json` … `20261120.json`, `README.md` —, dazu `index.json` (neuer Schlüssel `snow`) und `status.json` (neue Zeile `lines.snow`); 7,9 MB | der Commit liegt auf `origin/main`; alle 29 Dateien über `raw.githubusercontent.com/<commit>/…` Byte für Byte die lokalen (sha256); in `index.json` und `status.json` sind alle anderen Schlüssel bzw. Zeilen gegenüber dem Eltern-Commit unverändert, `killed` ist `false` |
| `fcb0d83bbdb6b145ed237e572522cc905004f874` | 00:06 | `.github/workflows/glacier-snow.yml` (die Vorlage `scripts/glacier/workflow-glacier-snow.yml`) | der Commit liegt auf `origin/main`; die Datei ist Byte für Byte die Vorlage; `index.snow` steht weiter im Zeiger |

Der erste Versuch des zweiten Pushs wurde abgewiesen (ein Cron hatte dazwischen gepusht, „non-fast-forward“) — nichts erzwungen, nichts
zurückzunehmen; der zweite Versuch setzte den Commit auf den dann aktuellen Stand (`checkout --detach origin/main` → `cherry-pick` →
`push HEAD:main`). Kein Push wurde zurückgenommen.

Der Workflow läuft ab 22.11. 10:25 UTC. Bis `main` von `buscosun-web` gepusht ist, endet er grün im Leerlauf („producer not on $REF
yet“); danach holt der erste Lauf die Tage seit dem 20.11. nach (bis zu sieben).

### 7.4 Übrige Prüfungen

| Prüfung | Ergebnis (22.11.2026, Endstand des Codes) |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün (Shell-Prüfung 281/281) |
| `npm run budget` | grün, gegenüber dem Stand nach Phase GI unverändert: eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 097,9 / 2 099 — die Phase bringt nichts ins Bundle |
| `verify:glacier-snow` | 37/37 (in der CI eingetragen) |
| `verify:glacier-contract` · `-publish` · `-sat` · `-melt` · `-weather` · `-sheet` · `-feed` · `-hugonnet` · `-stations` | 64/64 · 34/34 · 28/28 · 41/41 · 33/33 · 45/45 · 22/22 · 41/41 · 77/77 |
| `verify:glacier-ui`, Blick in den Browser | entfällt — die Phase ändert keine Anzeige |

Die fünf Fragen: **1 Funktionserhalt** — keine Datei der Seite ist geändert; der Zeiger bekommt einen Schlüssel, den der ausgelieferte
Stand nicht liest. **2 Desktop pixelgleich** — keine Anzeige geändert. **3 Touch-Ziele**, **4 Konsole**, **5 Long Tasks** — entfallen
(kein Code im Bundle; `budget` unverändert).

## 8 Befunde und Verbesserungen (V-GN)

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GN-1 | **748 von 799 Gletschern lesen genau eine Zelle, 342 teilen sie mit einem Nachbarn** und tragen dann denselben Wert. Eine Anzeige je Gletscher darf keine Auflösung je Gletscher vortäuschen. | In der späteren Anzeige: „Analyse für das Gebiet um den Gletscher (1 km)“; die Zahl der Zellen und `how` stehen in der Zellendatei. |
| V-GN-2 | Am 20.11. liegt die Analyse an den Gletscherzellen tief in ihrer eigenen Spanne (Lage im Median 13, 104 Gletscher unter jedem Jahr 1991–2020). Nicht gegen Stationen geprüft. | Vor der Anzeige an den Tiroler und Kärntner Stationen aus `glacier/v1/stn/` gegenlesen (Schneehöhe Station gegen Zelle). |
| V-GN-3 | Die Klimatologie ist je Region 12 KB bis 1,7 MB groß (zusammen 7,6 MB). Für EINEN Gletscher lüde eine Anzeige die ganze Region. | Mit der gewählten Darstellung neu schneiden: je Gletscher (rund 9 KB) oder nur die Stützwerte, die das Diagramm zeigt. |
| V-GN-4 | Ein Diagramm „Schneeverlauf“ bräuchte je Winter bis zu 270 Tagesdokumente. | Saisondatei je Region (täglich neu geschrieben), sobald die Darstellung feststeht (E-GN-9). |
| V-GN-5 | Ob GeoSphere schon veröffentlichte Tage des laufenden Jahres ändert, ist offen (§2.4). | `status.lines.snow.revised` nach einer Woche lesen; dann die Frage an Jan: melden oder überschreiben (E-GN-11). |
| V-GN-6 | Was der Tagesstempel meint (Zustand um 00 UTC oder Tageswert), steht nirgends. | Frage an `datahub.support@geosphere.at` (§9). |
| V-GN-7 | Nach einem neuen Katalog-Build fehlen neue Gletscher, bis Zellen und Klimatologie lokal neu gebaut sind (`stale` in der Statuszeile). | Zwei Befehle, zusammen 11 Abrufe (§9); oder beides in den Workflow nehmen, wenn Jan es will (E-GN-12). |
| V-GN-8 | Läuft der Workflow länger als sieben Tage nicht, fehlen Tage (der Lauf holt eine Woche nach). Die Quelle hält sie. | `SNOW_BACKFILL_DAYS` für einen Handlauf höher setzen (bis rund 600 Tage passt in das Limit von einer Million Werten je Abruf). |
| V-GN-9 | Ein Lauf ohne neuen Tag veröffentlicht nichts — auch nicht seine Statuszeile. `revised` erscheint erst mit dem nächsten geschriebenen Tag. | Statuszeile auch ohne Dokument veröffentlichen (zwei Commits am Tag mehr). |
| V-GN-10 | Das Limit von 240 Abrufen je Stunde zählt vermutlich je Adresse; die Runner von GitHub teilen Adressen. Ein Lauf kann an einem fremden Verbrauch scheitern (rot), der zweite Lauf des Tages fängt ihn. | Bei gehäuften Ausfällen: API-Schlüssel bei GeoSphere erfragen oder dritter Lauf. |
| V-GN-11 | Der Gesundheitswächter kennt `status.lines.snow` nicht. | Eine Zeile: `snow.day` älter als drei Tage ⇒ Meldung. |
| V-GN-12 | Die Lage gibt es nur für die Schneehöhe; der Wasserwert hat keine Klimatologie. | Zweite Größe in `--mode=clim` (neun weitere Abrufe, doppelte Dateien), wenn die Anzeige sie braucht. |
| V-GN-13 | Die Aufzeichnung der Referenzjahre liegt mit 1,0 MB im Repo (die API liefert ungepackt). | Kleinerer Ausschnitt (zwei Gletscher) wäre 0,3 MB; dann fehlte der Fall „zwei Nachbarn teilen eine Zelle“. |
| V-GN-14 | Schweiz und Deutschland haben kein Gegenstück in diesem Produkt. | Für die Schweiz gäbe es Stationswerte (Phase GI); ein offenes Schweizer Schneeraster habe ich nicht geprüft. |

## 9 Jans Schritte

`MANUELLE-SCHRITTE.md` §111: Push von `main` (damit läuft der Workflow), erster Lauf ansehen, Entscheidung cm oder mm für die Anzeige,
Wahl der Darstellung, nach einer Woche `revised` lesen, Frage an GeoSphere zum Tagesstempel, Entscheidungen E-GN-1 … 12, Rückfall.

Commit dieser Phase auf `main` (lokal, nicht gepusht): siehe `git log` — `feat(glacier): SNOWGRID snow analysis per Austrian glacier as its own product (phase GN, data only)`.
