# Phase GO — Hochalpine Stationsmessungen (Tirol, Südtirol) für `/gletscher`

Diagnose, Umsetzung und Gate der Phase. Auftrag Jan 21.11.2026 (Prompt „Phase GO“): die Messnetze des Landes Tirol und der Provinz
Bozen als eigenes Produkt im Daten-Repo, die nächste Station je Größe im Gletscher-Steckbrief neben den Modellwerten von „Wetter am
Gletscher“, ohne Schalter an für alle (Jans Entscheidung, Ausnahme von Regel 2), direkt auf `main`.

## 1 Anker (am Code und an den Daten gelesen, 21.11.2026)

- **Modellwerte:** `src/glacier/GlacierWeatherCard.tsx` (Phase GW) zeigt Temperatur an Zunge, mittlerer Höhe und oben sowie Wind, Böe,
  Niederschlag, Neuschnee, Bewölkung als Werte von buscosun Fusion (`melt/wx/<lauf>.json`), `data-origin="model"`, Vermerk
  „Modell, im Hochgebirge noch nicht nachgemessen“. Eine Messung gibt es im Steckbrief bisher nicht.
- **Messungen im Daten-Repo:** `obs/v1/` (Phase OB, `scripts/obs/obs-mirror.mjs`) trägt DWD, TAWES und SwissMetNet; **buscosun Fusion
  liest genau diese zwei Dateien** (`obs/v1/stations.json`, `obs/v1/latest.json`, Leser `src/sources/obsStore.ts`, `OBS_DIR`). Was dort
  steht, wird Anker und Stationswert. Ab 2 000 m stehen dort 42 Stationen (CH 29, AT 11, DE 2).
- **Gletscher-Linie im Daten-Repo:** `glacier/v1/` auf `main`, Zeiger `index.json`, vier Linien (`static|sat|melt|feed`) über EINEN
  Publisher (`scripts/glacier/glacier-publish.mjs`: jeder Versuch vom aktuellen `origin/main`, nur die eigenen Unterpfade, Zeiger frisch
  gelesen und gepatcht, nie `--force`). Ablage in `buscosun-archiv` unter `glacier/v1/<Tag>/` (nur Hinzufügen).
- **Katalog:** Build `20261120-1`, **2 094 Gletscher** (CH 1 291, AT 799, DE 4), je Gletscher ein Punkt (`lat`, `lon`) und die
  Höhenspanne `z = [unten, Median, oben]`.

## 2 Schritt 0 — Messungen (21.11.2026 07:18–07:30 UTC)

Werkzeug: `audit/gletscher-stationen/schritt0.mjs` (liest die wortgleich aufgezeichneten Antworten in
`scripts/lib/fixtures/glacier/stations/`, den Katalog des Builds und den Katalog von `obs/v1`).

### 2.1 Tirol — die OGD-Datei

| Punkt | Messwert |
|---|---|
| Datensatz | data.gv.at `bb43170b-30fb-48aa-893f-51c60d27056f` „Wetterstationsdaten Tirol“, Herausgeber Land Tirol (Lawinenwarndienst Tirol, Hydrographischer Dienst Tirol), Lizenz der Ressource **CC BY 4.0** (`https://creativecommons.org/licenses/by/4.0/`). Die alte CKAN-Adresse (`/katalog/api/3/action/package_show`) gibt 404; die Metadaten liegen unter `https://www.data.gv.at/api/hub/search/datasets/<id>` |
| Ressource | `https://lawine.tirol.gv.at/data/produkte/ogd.geojson` → **301** nach `https://wiski.tirol.gv.at/lawine/produkte/ogd.geojson` (200, `application/geo+json`, 182 KB, `Access-Control-Allow-Origin: *`, ETag, `Last-Modified`) |
| Form | GeoJSON, je Station ein Punkt `[lon, lat, Höhe m]`, `id` (UUID), `properties`: `name`, `operator`, `operatorLink`, `plot`, `LWD-Nummer`, `LWD-Region`, `Beobachtungsbeginn`, `date` (ISO mit Zeitzone, z. B. `2026-11-21T08:10:00+01:00`) und die Werte. `plot` ist NICHT eindeutig (160 verschiedene bei 221 Stationen), `id` ist es |
| Felder und Einheiten | `LT` Lufttemperatur °C (+ `LT_MAX`/`LT_MIN` der letzten 24 h), `TD` Taupunkt °C, `RH` relative Feuchte %, `OFT` Oberflächentemperatur °C, `WG` Wind **km/h**, `WG_BOE` Böe **km/h**, `WR` Windrichtung °, `HS` Schneehöhe cm (+ `HSD24/48/72` Differenzen), `GS_O`/`GS_U` Globalstrahlung W/m² (oben/unten), `N6`/`N24`/`N48`/`N72` Niederschlagssumme mm über 6/24/48/72 h (in der Beschreibung des Datensatzes nicht genannt, in der Datei vorhanden). **Kein stündlicher Niederschlag, kein Luftdruck** (`LD` steht nur im Feed fremder Betreiber) |
| Takt | Die Beschreibung sagt „stündlich“; gemessen wird die Datei **etwa alle 10 Minuten** neu geschrieben (`Last-Modified` 07:18:02 und 07:27:46 UTC). Um 07:29 UTC trugen 129 von 221 Stationen den Stempel 07:20 UTC, 44 den von 07:00 UTC, 7 den von 05:00 UTC, 2 keinen ⇒ Verzug meist 7–30 min, einzelne Stationen Stunden |
| Rohdaten | ungeprüft: `RH` bis 100,9 %, `HS` bis −1,0 cm in dieser einen Datei |

#### Tirol: Stationen je Betreiber und Höhenband (221 Stationen)

| Betreiber | < 1500 | 1500–1999 | 2000–2499 | 2500–2999 | ≥ 3000 | Summe |
|---|---|---|---|---|---|---|
| LWD Tirol | 1 | 28 | 60 | 37 | 10 | 136 |
| HD Tirol | 43 | 25 | 9 | 1 | 0 | 78 |
| LWD Tirol/WLV | 0 | 0 | 2 | 0 | 0 | 2 |
| LWD Tirol/ÖBB | 0 | 1 | 0 | 1 | 0 | 2 |
| LWD Tirol/TIWAG | 0 | 0 | 0 | 1 | 0 | 1 |
| LWD Tirol/GeoSphere Austria | 0 | 1 | 0 | 0 | 0 | 1 |
| LWD Tirol/HD Tirol | 0 | 1 | 0 | 0 | 0 | 1 |

Die Datei enthält nur Stationen des LWD Tirol und des HD Tirol, sieben davon mit einem zweiten Namen im Betreiberfeld (`LWD Tirol/…`).

#### Tirol: Stationen mit Wert je Größe und Höhenband

| Größe (Feld) | < 1500 | 1500–1999 | 2000–2499 | 2500–2999 | ≥ 3000 | Summe |
|---|---|---|---|---|---|---|
| t (LT) | 43 | 55 | 70 | 39 | 10 | 217 |
| wind (WG) | 0 | 14 | 29 | 29 | 10 | 82 |
| gust (WG_BOE) | 0 | 12 | 29 | 29 | 10 | 80 |
| snow (HS) | 26 | 42 | 40 | 12 | 0 | 120 |
| precip (N24) | 40 | 26 | 9 | 2 | 0 | 77 |
| rad (GS_O) | 1 | 21 | 31 | 8 | 0 | 61 |

Stempel: neuester 2026-11-21T07:15:00.000Z; Abstand der Stationen zum neuesten Stempel: 0 min: 4, 10–60 min: 208, 61–180 min: 7, > 180 min: 0; ohne Stempel: 2

#### OGD-Datei gegen den Feed `static.avalanche.report/weather_stations/stations.geojson`

Feed: 355 Stationen von 25 Betreibern (u. a. Südtirol 40, Trentino 30, Meteomont 19, Tiroler Wasserkraft AG 12, ÖBB INFRA 7, Verbund 5,
Universität Innsbruck 7, BFW 3, Eurac 3, IGF/ÖAW 3, BOKU 1, Nationalpark Hohe Tauern 1). **Alle 221 Stationen der OGD-Datei stehen mit
derselben `id` im Feed, und zum selben Zeitpunkt waren alle 221 Einträge Feld für Feld gleich** (Geometrie und `properties`); der Filter
„Betreiber = `HD Tirol` oder beginnt mit `LWD Tirol`“ auf dem Feed ergibt genau diese 221. Der Feed ist damit ein gleichwertiger Rückfall,
solange der Filter greift; die übrigen 134 Stationen sind nicht lizenziert und werden nie gespeichert — auch nicht als Fixture: der
Prüfer baut den Feed aus der aufgezeichneten OGD-Datei und einem erfundenen Eintrag eines fremden Betreibers.

### 2.2 Südtirol — der Dienst der Provinz

| Punkt | Messwert |
|---|---|
| Dienst | `https://geoservices.buergernetz.bz.it/services/meteo/v1/` — `stations` (GeoJSON, 230 Stationen, 95 KB), `sensors` (der neueste Wert JEDES Sensors in EINER Antwort, 993 Zeilen, 184 KB; auch `?station_code=` / `?sensor_code=`), `timeseries?station_code=&sensor_code=&date_from=yyyymmdd&date_to=yyyymmdd` (ohne Datum die letzten 24 h; `date_to` ausschließlich). Ohne Schlüssel, `Access-Control-Allow-Origin: *`, Lizenz CC0 |
| Stationen | `SCODE`, `NAME_D/I/L/E`, `ALT` (m), `LAT`, `LONG` (Grad); die Geometrie selbst steht in UTM 32N |
| Sensoren und Einheiten | `LT` °C, `LF` relative Feuchte %, `WG` Wind **m/s**, `WG.BOE` Böe **m/s**, `WR` °, `HS` Schneehöhe cm, `N` Niederschlag mm je **5 min**, `GS` Globalstrahlung W/m², `SD` Sonnenscheindauer s, `LD.RED` Luftdruck hPa; dazu Pegel (`W`, `Q`, `WT`, `W.ABST`, `SSTF`), die das Produkt nicht liest |
| Zeit | `DATE` als `2026-11-21T08:10:00CET` (im Sommer `CEST`) — kein ISO-Versatz; ein Sensor ohne Wert hat weder `DATE` noch `VALUE` |
| Takt | 10 min (Niederschlag 5 min); um 07:29 UTC trugen 92 von 98 Temperatursensoren den Stempel 07:10 UTC ⇒ Verzug 10–20 min. Einzelne Sensoren stehen Monate still (Sonnenscheindauer zweier Stationen mit Stempel vom 30.07.) |

#### Südtirol: 230 Stationen, davon 97 mit mindestens einer Wettergröße; je Größe und Höhenband

| Größe (Sensor) | < 1500 | 1500–1999 | 2000–2499 | 2500–2999 | ≥ 3000 | Summe |
|---|---|---|---|---|---|---|
| t (LT) | 46 | 16 | 22 | 7 | 6 | 97 |
| wind (WG) | 38 | 11 | 22 | 7 | 5 | 83 |
| gust (WG.BOE) | 38 | 11 | 22 | 7 | 5 | 83 |
| snow (HS) | 0 | 6 | 17 | 1 | 1 | 25 |
| precip (N) | 46 | 12 | 2 | 0 | 0 | 60 |
| rad (GS) | 40 | 10 | 2 | 0 | 0 | 52 |

#### Südtirol: Stationen ab 2 000 m mit Wettersensoren (35)

| Kennung | Name | Höhe m | Sensoren | Stempel |
|---|---|---|---|---|
| 34200WS | Signalgipfel Wilder Freiger | 3399 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 06040WS | Sulden Schöntaufspitze | 3328 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 24170WS | Ulten Weißbrunnspitz | 3253 | LT WR WG WG.BOE LF | 11-21T08:00 |
| 15050WS | Schnals Grawand | 3220 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 50400WS | Prettau Lengspitze | 3105 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 15000SF | Schnals Teufelsegg | 3035 | LT LF HS | 11-21T08:10 |
| 61720WS | Abtei Piz Pisciadù | 2985 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 00700WS | Graun Elferspitze | 2926 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 20720WS | Pfelders Rauhjoch | 2926 | LT WR WG WG.BOE LF | 11-21T08:00 |
| 91210WS | Toblach Hochebenkofel | 2906 | LT WR WG WG.BOE LF | 11-21T08:00 |
| 06090SF | Sulden Madritsch | 2825 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 66000WS | Pfunders Dannelspitz | 2808 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 45100WS | Gsies Regelspitze | 2747 | LT WR WG WG.BOE LF | 11-21T05:30 |
| 07740WS | Trafoi Zaufenkofel | 2475 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 69900MS | Plose | 2472 | LT WR WG WG.BOE LF GS | 11-21T08:10 |
| 02700SF | Schleis Kloangruebes | 2460 | LT N WR WG WG.BOE LF HS | 11-21T08:10 |
| 01080SF | Melag Pratznerberg | 2450 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 54100SF | Rein i.T. Tristenboden | 2450 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 42830SF | Prags Rossalm | 2340 | LT WR WG WG.BOE LF HS |  |
| 62270SF | Campill Kreuzkofeljoch | 2297 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 82500WS | Rittner Horn | 2260 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 24300SF | Ulten Rossbänke | 2255 | LT WR WG WG.BOE LF HS | 11-21T08:00 |
| 20050SF | Timmelsalm | 2230 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 53200SF | Weissenbach Fadner Alm | 2155 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 45200SF | Gsies Pfinnalm | 2152 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 35100WS | Jaufenkamm | 2145 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 90005SF | Proveis Samerberg | 2142 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 78480SF | Deutschnofen Obereggen | 2125 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 80100SF | Pens Tramintal | 2100 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 74200MS | Seiser Alm Zallinger | 2055 | LT N WR WG WG.BOE LF HS GS | 11-21T08:10 |
| 61690SF | Abtei Piz La Ila | 2050 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 66100SF | Pfunders Stutzenalm | 2050 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 00390SF | Graun Schöneben | 2040 | LT WR WG WG.BOE LF HS | 11-21T08:10 |
| 20690SF | Pfelders Grünboden | 2015 | LT WR WG WG.BOE LF | 11-21T08:10 |
| 50360SF | Prettau Merbalm | 2006 | LT WR WG WG.BOE LF HS | 11-21T08:10 |

Niederschlag und Strahlung gibt es in Südtirol ab 2 000 m nur an zwei Stationen; die Gipfelstationen messen Temperatur, Feuchte und Wind.

### 2.3 Zuordnung Gletscher → nächste Station je Größe

Regel der Messung: Abstand vom Katalogpunkt des Gletschers zur Station ≤ 5 km, Stationshöhe innerhalb der Höhenspanne des Gletschers
±300 m (beides `set`, Vorgabe des Auftrags); je Größe die nächste Station, die diese Größe führt. Netze: Tirol, Südtirol und die
10-min-Stationen aus `obs/v1` (DWD, TAWES, SwissMetNet).

#### Zuordnung: nächste Station je Größe innerhalb 5 km und ±300 m gegen die Höhenspanne des Gletschers (2094 Gletscher)

| Land / Region | Gletscher | mit Station | Temperatur | Wind | Böe | Schneehöhe | Niederschlag | Strahlung | Treffer je Netz |
|---|---|---|---|---|---|---|---|---|---|
| alle | 2094 | 401 | 378 | 358 | 358 | 217 | 171 | 185 | bz 75, obs:AT 245, obs:CH 521, obs:DE 12, tirol 814 |
| Land AT | 799 | 285 | 285 | 265 | 265 | 132 | 63 | 100 | bz 75, obs:AT 245, tirol 790 |
| Land CH | 1291 | 114 | 91 | 91 | 91 | 83 | 106 | 83 | obs:CH 521, tirol 24 |
| Land DE | 4 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | obs:DE 12 |
| at-allgaeuer-alpen | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-ankogel-hochalmspitzgruppe | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-dachstein | 8 | 8 | 8 | 8 | 8 | 8 | 8 | 8 | obs:AT 48 |
| at-defreggergruppe | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-glocknergruppe | 74 | 14 | 14 | 14 | 14 | 4 | 4 | 4 | obs:AT 24, tirol 30 |
| at-goldberggruppe | 30 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | obs:AT 60 |
| at-granatspitzgruppe | 23 | 10 | 10 | 9 | 9 | 10 | 5 | 10 | obs:AT 19, tirol 34 |
| at-hochkoenig | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-karnische-alpen | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-lechtaler-alpen | 11 | 6 | 6 | 6 | 6 | 3 | 3 | 3 | obs:AT 18, tirol 9 |
| at-oetztaler-alpen | 185 | 90 | 90 | 74 | 74 | 49 | 30 | 37 | bz 32, obs:AT 76, tirol 246 |
| at-raetikon | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-rieserfernergruppe | 5 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | bz 4 |
| at-samnaungruppe | 3 | 2 | 2 | 2 | 2 | 1 | 0 | 1 | tirol 8 |
| at-schobergruppe | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| at-silvrettagruppe | 40 | 23 | 23 | 23 | 23 | 2 | 0 | 2 | tirol 73 |
| at-stubaier-alpen | 108 | 75 | 75 | 73 | 73 | 29 | 3 | 13 | bz 27, tirol 239 |
| at-venedigergruppe | 88 | 16 | 16 | 15 | 15 | 4 | 0 | 4 | bz 12, tirol 42 |
| at-verwallgruppe | 27 | 22 | 22 | 22 | 22 | 9 | 0 | 6 | tirol 81 |
| at-zillertaler-alpen | 126 | 8 | 8 | 8 | 8 | 2 | 0 | 2 | tirol 28 |
| ch-mitte-ost | 256 | 27 | 27 | 27 | 27 | 27 | 27 | 27 | obs:CH 162 |
| ch-mitte-west | 494 | 32 | 28 | 28 | 28 | 28 | 32 | 28 | obs:CH 172 |
| ch-ost | 272 | 11 | 11 | 11 | 11 | 3 | 3 | 3 | obs:CH 18, tirol 24 |
| ch-sued | 79 | 11 | 11 | 11 | 11 | 11 | 11 | 11 | obs:CH 66 |
| ch-west | 190 | 33 | 14 | 14 | 14 | 14 | 33 | 14 | obs:CH 103 |
| de | 4 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | obs:DE 12 |

„Treffer je Netz“ zählt Gletscher × Größe. **401 von 2 094 Gletschern** haben mindestens eine Station; in Österreich 285 von 799 (davon
die allermeisten über Tirol), in der Schweiz 114 von 1 291 (SwissMetNet; 24 Treffer an der Grenze über Tiroler Stationen), in
Deutschland 2 von 4. Regionen ohne jede Station im Fenster: Ankogel-Hochalmspitz, Schober, Defregger, Hochkönig, Rätikon, Karnische und
Allgäuer Alpen.

Zum Vergleich ein weiteres Fenster (nicht gewählt, E-GO-1):

#### Zuordnung: nächste Station je Größe innerhalb 10 km und ±500 m gegen die Höhenspanne des Gletschers (2094 Gletscher)

| Land / Region | Gletscher | mit Station | Temperatur | Wind | Böe | Schneehöhe | Niederschlag | Strahlung | Treffer je Netz |
|---|---|---|---|---|---|---|---|---|---|
| alle | 2094 | 1031 | 940 | 933 | 933 | 803 | 701 | 760 | bz 313, obs:AT 778, obs:CH 1934, obs:DE 12, tirol 2033 |
| Land AT | 799 | 613 | 613 | 606 | 606 | 483 | 291 | 442 | bz 298, obs:AT 772, obs:CH 7, tirol 1964 |
| Land CH | 1291 | 416 | 325 | 325 | 325 | 318 | 408 | 316 | bz 15, obs:AT 6, obs:CH 1927, tirol 69 |
| Land DE | 4 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | obs:DE 12 |

## 3 Diagnose

1. **Die Trennung von buscosun Fusion ist eine Frage des Pfads.** Der Motor liest Messungen nur über `obsStore.ts` aus `obs/v1/`. Ein
   Produkt außerhalb dieses Verzeichnisses erreicht ihn nicht; ein Eintrag in `obs/v1/stations.json` würde dagegen sofort Anker und
   Stationswert ändern (ungeprüfte Rohdaten, Gipfelstationen mit Vereisung). ⇒ eigenes Verzeichnis, eigener Vertrag, kein Import aus
   `src/pointForecast`, `src/point` oder `obsStore.ts` heraus; der Beweis läuft als Prüfpunkt mit Gegenprobe.
2. **Die Rohdaten sind ungeprüft** (Feuchte über 100 %, negative Schneehöhe, stehende Sensoren, Stationen ohne Stempel). Ohne benannte
   Grenzen, Sprung- und Stillstandsprüfung und ein Höchstalter stünde ein kaputter Fühler als Messung neben dem Modellwert.
3. **Die zwei Netze liefern verschiedene Einheiten und Formen** (km/h gegen m/s, Niederschlag als 6-/24-h-Summe gegen 5-min-Werte, ISO-Zeit
   gegen `CET`/`CEST`). Das Produkt trägt je Größe EINE Einheit — die von `obs/v1` (°C, %, m/s, °, cm, W/m², mm).
4. **Der Steckbrief soll nicht 565 KB `obs/v1/latest.json` laden**, um einen Wert einer TAWES- oder SwissMetNet-Station zu zeigen. Der
   Producer kopiert die Werte der zugeordneten `obs/v1`-Stationen in dieselbe Stundendatei; die Seite liest eine kleine Datei.
5. **Eine Station steht auf Fels oder Grat, nicht auf dem Eis** — und bis 5 km entfernt, bis 300 m über oder unter dem Gletscher. Die
   Messung steht deshalb NEBEN dem Modellwert, mit Name, Höhe, Abstand, Höhenunterschied und Alter; sie ersetzt oder korrigiert ihn nie.

## 4 Plan

| Schritt | Inhalt |
|---|---|
| GO-1 Vertrag | `src/glacier/glacierStationContract.ts` (rein): Netze, Größen und Einheiten, Leser der drei Antworten, Betreiber-Filter, Grenzen, Sprung/Stillstand, Höchstalter, Zuordnungsregel, Dokumentformen, Quellenvermerk |
| GO-2 Producer | `scripts/glacier/stations.mjs`, stündlich: Tirol + Südtirol (+ `obs/v1` für zugeordnete Stationen) → `glacier/v1/stn/h/<yyyymmddhh>.json` (unveränderlich je Stunde, 72 h im Daten-Repo), Katalog `stn/stations.json`, Zuordnung `stn/map/<datei>.json`, Zeiger `index.stations`; fünfte Linie `stations` des Gletscher-Publishers |
| GO-3 Ablage | `scripts/glacier/stations-archive.mjs` → `buscosun-archiv` `glacier/v1/<Tag>/stn-<stunde>.json.gz` (nur Hinzufügen), eigener Workflow |
| GO-4 Anzeige | Karte „Wetter am Gletscher“: Abschnitt „Gemessen in der Nähe“ je Größe (`data-origin="measured"`), fester Satz „Station auf Fels oder Grat, nicht auf dem Eis“, Quellenvermerk |
| GO-5 Prüfer | `verify:glacier-stations` (Fixtures wortgleich, fremder Betreiber, alt/unplausibel, Gletscher ohne Station, Byte-Gleichheit von buscosun Fusion mit Gegenprobe) |

## 5 Entscheidungen im Auftrag (E-GO)

Jan hat die Phase im Auto-Modus beauftragt; die folgenden Punkte habe ich entschieden und hier offengelegt. Jede ist umkehrbar.

| Nr. | Entscheidung | Warum | Alternative |
|---|---|---|---|
| E-GO-1 | Fenster der Zuordnung **5 km und ±300 m** (`STN_MAP_KM`, `STN_MAP_DZ`, `set`) — die Vorgabe „start with“ | so steht eine Messung wirklich neben dem Gletscher | 10 km / ±500 m gäbe 1 031 statt 401 Gletschern eine Station (§2.3); eine Zeile im Vertrag, danach `stations.mjs --map` |
| E-GO-2 | Ort des Produkts: **`glacier/v1/stn/`**, fünfte Linie `stations` des Gletscher-Publishers — nicht `obs/v1` und kein neues Netz darin | buscosun Fusion liest `obs/v1`; ein eigener Pfad ist die Trennung, die sich beweisen lässt (§7 H). Der Publisher bringt die geprüften Regeln mit (nur eigene Pfade, nie Force, Zeiger frisch gelesen) | eigenes Wurzelverzeichnis `obs-alpine/v1/` mit eigenem Publisher |
| E-GO-3 | Die sieben Tiroler Stationen mit zweitem Namen im Betreiberfeld (`LWD Tirol/TIWAG`, `…/ÖBB`, `…/WLV`, `…/GeoSphere Austria`, `…/HD Tirol`) **bleiben** | sie stehen in der OGD-Datei unter CC BY 4.0, und der Auftrag nennt `LWD Tirol*`. Die 12 Stationen des Betreibers „Tiroler Wasserkraft AG“ im Feed sind etwas anderes und bleiben draußen | nur exakt `LWD Tirol` und `HD Tirol` (214 statt 221 Stationen); Frage steht in der Mail an das Land (§9) |
| E-GO-4 | Niederschlag als **Summe über 24 Stunden** (Tirol liefert nur 6- und 24-h-Summen; Südtirol aus den 5-min-Werten; `obs/v1` aus `rr24h`), sonst 6 h, sonst 1 h; die Karte nennt den Zeitraum | eine Größe, die alle drei Netze tragen | stündliche Summe nur für Südtirol und `obs/v1` |
| E-GO-5 | Grenzen, Sprung, Stillstand, Höchstalter — alle `set`, benannt im Vertrag (Tabelle §6.2) | Rohdaten ungeprüft; lieber „Keine Daten“ als ein kaputter Fühler | aus der Ablage messen, sobald 14 Tage da sind (V-GO-6) |
| E-GO-6 | Stationen aus `obs/v1` zählen mit dem, was sie **jetzt** liefern (`obsVarsNow`), nicht mit der Größenliste des Katalogs; die Zuordnung wird **einmal am Tag** neu gerechnet (`STN_MAP_REFRESH_MS`) | der Katalog nennt jede Größe, die eine Station je in irgendeinem Produkt hatte (Zugspitze: Schneehöhe und Niederschlag aus Tagesdateien) — die Karte hätte dort dauerhaft „Keine Daten“ gezeigt. Folge für die Zahlen: **387** statt 401 Gletscher mit Station (§7.3), Schneehöhe 123 statt 217, Niederschlag 80 statt 171 | Größenliste des Katalogs (Zahlen aus §2.3) |
| E-GO-7 | Schneehöhe und Strahlung unter null zeigt die Seite als **0** (im Dokument steht der Messwert) | Ultraschall-Geber streuen um den Nullpunkt (−1,0 cm in der Aufzeichnung); die Karte sagt es im Kleingedruckten | Werte unter null verwerfen |
| E-GO-8 | Der Workflow hat eine **eigene Concurrency-Gruppe** | in `glacier-publish` hält GitHub nur EINEN wartenden Lauf; ein Stundenlauf würde von Schmelze, Satellit oder Feed verdrängt | gemeinsame Gruppe |
| E-GO-9 | Der Feed wird **nicht als Fixture gespeichert** | 134 seiner 355 Stationen sind nicht lizenziert — auch nicht für ein Test-Verzeichnis. Der Prüfer baut ihn aus der OGD-Aufzeichnung und 14 erfundenen Einträgen echter fremder Betreibernamen | — |
| E-GO-10 | Kein Schalter (Jans Wort). Rückfall ohne Deploy: den Schlüssel `stations` im Zeiger `glacier/v1/index.json` entfernen | — | — |

## 6 Umsetzung

### 6.1 Dateien

| Datei | Inhalt |
|---|---|
| `src/glacier/glacierStationContract.ts` | Vertrag (rein, nur der Gletscher-Vertrag als Import): Pfade, Quellenvermerke, Betreiber-Filter, Leser Tirol / Südtirol / `obs/v1`-Eintrag, Niederschlagssummen, Grenzen und Prüfungen (`checkReading`), Zuordnung (`buildStnMap`), Dokumentregeln |
| `src/glacier/glacierStationView.ts` | reine Anzeige-Regeln: welche Station, welcher Wert, welcher Grund für „Keine Daten“; `null` ohne Station |
| `src/glacier/GlacierStationCard.tsx` | Karte „Gemessen in der Nähe“ (lädt Zuordnung und Stunde; `GlacierStationBlock` ohne Laden für den Prüfer) |
| `src/glacier/glacierClient.ts` | `loadStationMap`, `loadStationHour`, Zeiger `GlacierIndex.stations` |
| `src/glacier/GlacierBrief.tsx`, `GlacierPage.tsx`, `GlacierSheetTabs.tsx` | Einbau unter „Wetter am Gletscher“ (Blatt und Dossier), Zeilen in der Lizenzliste |
| `src/glacier/glacierSheet.css` | Regeln `gl-stn-*`, mobil in der Media Query der Seite |
| `scripts/glacier/stations.mjs` | Producer (stündlich), README des Produkts |
| `scripts/glacier/stations-archive.mjs` | Ablage der Stundendateien |
| `scripts/glacier/glacier-publish.mjs` | Linie `stations: ['stn']`, Aufbewahrung 72 h / zwei Zuordnungen |
| `scripts/glacier/workflow-glacier-stations.yml`, `workflow-glacier-stations-archiv.yml` | Vorlagen der zwei Workflows |
| `scripts/glacier/make-stations-fixture.mjs`, `scripts/lib/fixtures/glacier/stations/*` | Aufzeichnungen (wortgleich) und der Auszug aus Katalog und `obs/v1` |
| `scripts/verify-glacier-stations.mjs`, `package.json`, `.github/workflows/ci.yml`, `.gitattributes` | Prüfer und Einbindung |

### 6.2 Das Produkt

```
glacier/v1/stn/stations.json         Katalog (Form von obs/v1/stations.json + operator, ref)
glacier/v1/stn/h/<yyyymmddhh>.json   Werte einer Stunde je Station (Form eines Eintrags von obs/v1/latest.json), dazu sources, rules, rejected
glacier/v1/stn/map/<build>.<n>.json  Gletscher → [Station, km, Höhenunterschied zur mittleren Höhe] je Größe, Stationen, Bericht
glacier/v1/stn/README.md             Quellen, Lizenzen, „Geändert“, Grenzen (aus dem Vertrag erzeugt)
glacier/v1/index.json → stations     { hour, builtAt, n, map, mapAt }
```

Kennungen: `tirol:<UUID>` (die ganze UUID — die Datei trägt fortlaufende UUIDs mit gleichen ersten acht Stellen, und `plot` teilen sich mehrere
Stationen; ein erster Lauf mit acht Stellen brach genau daran ab), `bz:<SCODE>`, `at:`/`ch:`/`de:` wie in `obs/v1`.

Einheiten wie `obs/v1`: `t`, `td` °C · `rh` % · `ff`, `fx` m/s · `dd` ° · `snow` cm · `gr` W/m² · `rr1h`, `rr6h`, `rr24h` mm.

| Prüfung (alle `set`) | Regel |
|---|---|
| Höchstalter | 3 h gegen die Uhr des Producers UND der Seite (`STN_MAX_AGE_MS`); Stempel > 15 min in der Zukunft fällt heraus |
| Grenzen | `t` −45 … 40 °C · `td` −60 … 30 · `rh` 1 … 105 % · `ff` 0 … 75 m/s · `fx` 0 … 90 · `dd` 0 … 360 · `snow` −5 … 1 000 cm · `gr` −10 … 1 500 W/m² · `rr1h` 0 … 150 mm · `rr6h` 0 … 400 · `rr24h` 0 … 700 |
| Sprung | gegen den letzten angenommenen Wert der Station (≤ 3 h alt): `t` 15 K, `td` 20 K, `snow` 60 cm je Stunde |
| Stillstand | derselbe Wert in dieser und sechs früheren Stunden mit je eigenem Stempel: Temperatur; Wind und Böe ungleich null; Windstille nur bei ≤ 0 °C (vereister Geber) |
| Widerspruch | Taupunkt > Temperatur + 1 K; Böe < Mittelwind − 0,5 m/s |
| Summe | Südtirol: unter 90 % der 5-min-Werte ist die Summe unvollständig und fällt heraus |

Was herausfällt, steht mit Station, Größe und Grund unter `rejected` — und nirgends sonst. Die Geschichte für Sprung und Stillstand sind die
eigenen Stundendateien der letzten acht Stunden; es gibt keine Zustandsdatei.

### 6.3 Anzeige

Karte „Gemessen in der Nähe“ direkt unter „Wetter am Gletscher“, im Blatt (Reiter „Heute“) und im Dossier (Ebene Heute). Je Station ein Block:
links die **Höhenleiter** (Höhenspanne des Gletschers als Balken, Strich = mittlere Höhe, Punkt = Station), daneben Name, Höhe, Alter, der Satz
„x km entfernt, y m über/unter der mittleren Höhe des Gletschers. ‹Betreiber›.“ und die Größen dieser Station. Jeder Wert `data-origin="measured"`.
Fester Satz „Station auf Fels oder Grat, nicht auf dem Eis.“ Kein Vergleich mit dem Modellwert, keine Differenz, kein Wort über Verhältnisse.
Ohne Station im Fenster rendert die Karte nichts. Gestaltet mit dem Skill `frontend-design` im Command-Deck: einzige Akzentfarbe ist das Grün der
Herkunft „gemessen“, alle Farben aus den Gletscher-Tokens.

**Ich habe die Karte nicht im Browser gesehen** (Vorgabe des Auftrags). Geprüft ist das gerenderte Markup ohne Browser (§7 G) und die Lesekette
gegen die echten Adressen in Node (§7.3).

## 7 Gate

### 7.1 `verify:glacier-stations` — 56/56

| Block | Inhalt |
|---|---|
| A | die vier Aufzeichnungen Byte für Byte (sha256), mit Gegenprobe |
| B | Tirol: 221 Stationen, Einheiten, UUID-Kennung, **fremder Betreiber im Feed verworfen** (14 erfundene Einträge echter fremder Betreibernamen; Gegenprobe: ohne Filter stünden sie im Ergebnis) |
| C | Südtirol: 97 von 230 Stationen, `CET`/`CEST`, Niederschlagssummen |
| D | Plausibilität: **alt**, Zukunft, **außerhalb der Grenzen**, Sprung, Stillstand, Widerspruch, unvollständige Summe — je mit einem Wert, der daneben durchgeht |
| E | Zuordnung am echten Auszug (10 Gletscher, 22 `obs/v1`-Stationen), Fenster mit Gegenproben, **Gletscher ohne Station** (4 von 10), Lieferung statt Katalogliste |
| F | Producer Ende zu Ende aus den Aufzeichnungen: Stundendokument, Katalog, Zuordnung, Zeiger; alte und unplausible Werte nie weitergereicht (mit Gegenprobe 55 °C / 130 %); zweite Stunde; Rückfall auf den Feed; ein Netz fällt aus; beide fallen aus ⇒ Abbruch |
| G | Seite: Werte, „Keine Daten“ mit Grund, nichts ohne Station, `data-origin="measured"`, fester Satz, Quellenvermerke wörtlich, `glacierForbiddenWords`, kein Schalter, nur Token-Farben |
| H | **buscosun Fusion Byte für Byte gleich** (siehe 7.2) |
| I | Publisher-Linie, Aufbewahrung, Ablage (ausgepackt Byte für Byte die veröffentlichte Datei), Workflow-Vorlagen, README |

Gegenproben am Prüfer selbst (Code verändert, Prüfer muss rot werden): Betreiber-Filter lässt alles durch → 3 rote Punkte; Höchstalter 30 h → 4;
Fenster 10 km → 6; Wert als Modell markiert → 1; Producer schreibt unter `obs/` → Abbruch am Publisher-Wächter; leere Karte statt nichts → 1.

### 7.2 Byte-Gleichheit von buscosun Fusion (Block H)

Der Cube-Pfad des Clients (`getPointForecastFromCube` mit dem echten `fetchCubeObs`, Cube-Fixture München, 73 Stunden, dichter Messsatz) rechnet
gegen ein Daten-Repo im Speicher:

| Lauf | Daten-Repo | Ergebnis (sha256 über Stunden, Flags, Herkunft) |
|---|---|---|
| Basis, zweimal | `obs/v1` (echter Auszug) | gleich — die Rechnung ist wiederholbar |
| mit den neuen Dateien | `obs/v1` + `glacier/v1/index.json` mit Zeiger + `glacier/v1/stn/*` aus dem Producer-Lauf | **gleich der Basis**; gelesen werden nur `obs/v1/stations.json` und `obs/v1/latest.json` |
| Gegenprobe 1 | ohne `obs/v1` | **anders** — die Messungen wirken |
| Gegenprobe 2 | dieselben Tiroler Werte als vier Stationen IN `obs/v1` neben dem Punkt | **anders** — die Gleichheit kommt vom Ort der Dateien |

Dazu: keine Datei unter `src/pointForecast`, `src/point`, `src/sources`, `src/fusion`, `src/ml`, `src/nowcast`, `scripts/point`, `scripts/obs`,
`scripts/pruefstand` nennt den Vertrag, den Producer oder den Pfad (das Suchmuster findet den Vertrag selbst); der Producer schreibt nur unter
`stn/`. An buscosun Fusion, an Edge Functions und an Shadern ist nichts geändert; keine neue Abhängigkeit.

Eine Falle der Messung: mit Stempeln VOR der ersten Stunde der Cube-Achse fand der Anker kein Paar („Messungen da, aber kein Paar“) — die Basis
war dann gleich dem Lauf ohne Messungen und Gegenprobe 1 blind. Die Stempel des Auszugs stehen deshalb auf der ersten Stunde der Achse.

### 7.3 Läufe und Pushs

**Lokale Producer-Läufe gegen die echten Dienste (21.11.2026):**

| Lauf (UTC) | Ergebnis |
|---|---|
| 07:36, Probelauf ohne Veröffentlichung | 342 Stationen (Tirol 219, Südtirol 95, `obs/v1` 28), 9 Werte verworfen (eine Südtiroler Station älter als 3 h, vier unvollständige 24-h-Summen); Zuordnung nach der Katalogliste: 401 von 2 094 Gletschern — dieselben Zahlen wie Schritt 0 (§2.3). Ein Versuch davor brach an doppelten Kennungen ab (acht Stellen der UUID) |
| 08:01, Stunde `2026112108`, veröffentlicht | 335 Stationen, 41 Werte verworfen (acht Stationen mit Stempeln älter als 3 h, vier unvollständige Summen), Stundendatei 22 KB roh / 11,7 KB gepackt, Katalog 318 Stationen |
| 08:13, `--map`, veröffentlicht | Zuordnung `20261120-1.2` nach E-GO-6: **387 von 2 094 Gletschern** mit Station (AT 285 von 799, CH 100 von 1 291, DE 2 von 4); Temperatur 367, Wind 348, Böe 348, Schneehöhe 123, Niederschlag 80, Strahlung 174; Treffer je Netz: Tirol 822, `obs/v1` 543, Südtirol 75; 88 Stationen genannt. Die Stunde 08 blieb, wie sie war (eine Stunde wird einmal veröffentlicht) |
| 09:00, Stunde `2026112109`, veröffentlicht und abgelegt | 342 Stationen (Tirol 221 gelesen, Südtirol 97, `obs/v1` 28), 10 Werte verworfen; die Prüfungen lasen die Stunde 08 als Geschichte; Katalog und Zuordnung unverändert und nicht neu geschrieben; Stundendatei 11,7 KB gepackt |

**Lesekette mit dem Code der Seite** (Node, echte Adressen, 08:10 UTC): `loadIndex` → Zeiger `stations`, `loadStationMap` (401 Gletscher, 89 Stationen),
`loadStationHour` (335 Stationen) in 2,4 s; kein Gletscher der Zuordnung fehlt im Katalog. Beispiel Alpeiner Ferner: „Nockwand Wind 3 092 m, 3,7 km,
+27 m: Temperatur −10,1 °C; Wind 13 km/h aus W; Böe 54 km/h“ und „Schöckbichl 2 520 m, 4,2 km, −545 m: Schneehöhe 29 cm; Globalstrahlung 72 W/m²“;
Großer Aletschgletscher: nichts.

**Pushs** (jeder Versuch vom aktuellen `origin/main`, nie Force, kein Rebase; nach jedem Push geprüft: der Commit liegt auf `origin/main`, die Dateien
sind über `raw.githubusercontent.com/<commit>/…` Byte für Byte die lokalen, die übrigen Schlüssel von `index.json` sind unverändert; kein Push
abgewiesen, keiner zurückgenommen):

| Repo | Commit | Inhalt |
|---|---|---|
| `buscosun-data` | `318e7ddd` | erste Stunde, Katalog, Zuordnung `.1`, README, Zeiger `stations`, Statuszeile (6 Dateien, alle unter `glacier/v1/`) |
| `buscosun-data` | `abdd42c6` | `.github/workflows/glacier-stations.yml` |
| `buscosun-data` | `72c7a0ce` | Zuordnung `.2`, Katalog, Zeiger |
| `buscosun-data` | `47a8dce4` | Stunde `stn/h/2026112109.json`, Zeiger, Statuszeile (3 Dateien) |
| `buscosun-archiv` | `4631fd57` | `2026-11-21/stn-2026112108.json.gz` (ausgepackt Byte für Byte die veröffentlichte Datei), `stn-stations-20261121T080156Z.json.gz`, Tageszeile im Index |
| `buscosun-archiv` | `3af738cc` | `.github/workflows/glacier-stations-archiv.yml`, README der Ablage |
| `buscosun-archiv` | `4a602889` | `2026-11-21/stn-2026112109.json.gz` (ausgepackt Byte für Byte die veröffentlichte Datei), `stn-stations-20261121T081324Z.json.gz` (Katalog nach der Ergänzung von 08:13), Tageszeile im Index |

**Erster Lauf auf einem GitHub-Runner** (öffentliche Actions-API, 21.11. 08:29 UTC, Lauf `44885142140`, `schedule`): `glacier-stations.yml` endete nach 11 s **grün im Leerlauf** — Schritt „Checkout producer“ erfolgreich, die vier Schritte danach übersprungen (der Producer liegt noch nicht auf `origin/main` von `buscosun-web`). `glacier-stations-archiv.yml` hatte bis 09:01 UTC noch keinen Lauf (nächster 12:53 UTC).

### 7.4 Übrige Prüfungen

| Prüfung | Ergebnis (21.11.2026, letzter Stand des Codes) |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün (Shell-Prüfung des Builds 281/281) |
| `npm run budget` | **rot**: totalJs 2 069,4 KB bei einer Grenze von 2 054 KB. Ohne die Karte dieser Phase (Einbau im Steckbrief auskommentiert, sonst gleicher Arbeitsbaum) 2 065,7 KB — also schon vorher rot, die Phase kostet **3,7 KB**. eagerJs 114,9 / 115, largestChunk 278,4 / 302 unverändert. Grenze nicht angehoben |
| `verify:glacier-stations` | 56/56 (auch über `scripts/ci-run.mjs`; in der CI eingetragen) |
| `verify:glacier-contract` · `-static` · `-publish` · `-sat` · `-melt` · `-weather` · `-sheet` · `-feed` · `-hugonnet` | 64/64 · 7/7 (Fixture) · 34/34 · 28/28 · 41/41 · 21/21 · 45/45 · 22/22 · 41/41 |
| `verify:glacier-ui` | **nicht gelaufen** — Browser-Prüfer gegen einen laufenden Server; bricht schon an HEAD ab (V-GH-8) |
| Workflow-Vorlagen | als YAML gelesen (je sechs Schritte), Textregeln im Prüfer (I4); **kein Lauf mit dem Producer auf einem Runner** — er liegt erst nach dem Push von `buscosun-web` auf `origin/main` |

Die fünf Fragen: **1 Funktionserhalt** — „Wetter am Gletscher“ ist unverändert (`verify:glacier-weather` 21/21), die Lizenzliste behält ihre
Zeile wörtlich (`verify:glacier-hugonnet` 41/41; ein erster Stand hatte sie verändert, W3 wurde rot, behoben). **2 Desktop pixelgleich** — nicht
gemessen (kein Bild, Vorgabe); ohne Zeiger `index.stations` oder ohne Station rendert die Karte nichts, die Seite ist dann wie zuvor. **3 Touch-Ziele**
— die Karte hat keine Bedienelemente außer den Quellen-Links im Fließtext. **4 Konsole** — nicht geprüft (kein Browser). **5 Long Tasks** — nicht
gemessen; die Karte lädt zwei kleine JSON-Dateien (Zuordnung 38 KB, Stunde 22 KB roh) und rechnet nichts.

## 8 Befunde und Verbesserungen (V-GO)

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GO-1 | Der Abstand zählt vom EINEN Katalogpunkt des Gletschers. Am Großen Aletschgletscher steht das Jungfraujoch am Rand des Eises, aber über 5 km vom Punkt — keine Station. | Lange Gletscher bekämen ihre Station: Abstand zum Umriss (L1) statt zum Punkt; die Umrisse liegen im statischen Build. |
| V-GO-2 | Die Größenliste der Tiroler und Südtiroler Stationen wächst nur (Vereinigung über die Zeit). Ein Fühler, der für immer ausfällt, behält seine Zuordnung und zeigt dauerhaft „Keine Daten“. | Regel „Größe seit n Tagen nicht gesehen ⇒ nicht mehr geführt“ (ein `seen` je Größe im Katalog). |
| V-GO-3 | Ablage: 11,7 KB je Stunde gepackt ⇒ rund 0,28 MB am Tag, **rund 100 MB im Jahr** in `buscosun-archiv`; dieselbe Menge wächst in der Historie von `buscosun-data` (die Stundendateien gehen nach 72 h, die Commits bleiben). | Eine Tagesdatei mit den Stunden als Spalten wäre grob ein Viertel; Preis: sie entsteht erst am Folgetag. |
| V-GO-4 | (in der Phase behoben) Ein zweiter Lauf in derselben Stunde hätte die Stundendatei im Daten-Repo ersetzt, während das Archiv die erste Fassung hält. | Eine Stunde wird jetzt EINMAL veröffentlicht: hält der Speicher sie schon, schreibt der Lauf keine Stundendatei (Prüfpunkt F5). Folge: verspätet GitHub einen Lauf um mehr als eine Stunde, fehlt die Stunde davor. |
| V-GO-5 | Die Tiroler Datei erscheint alle 10 Minuten, der Producer läuft stündlich — ein Wert auf der Seite ist bis gut eine Stunde alt (das Alter steht dabei). | Lauf alle 20 oder 30 Minuten; Preis: mehr Commits im Daten-Repo. |
| V-GO-6 | Grenzen, Sprung und Stillstand sind gesetzt, nicht gemessen. | Nach 14 Tagen Ablage zählen, wie oft welche Regel greift und ob ein echter Föhnsprung oder eine echte Windstille verworfen wurde; `rejected` in jeder Stundendatei ist die Datenbasis. |
| V-GO-7 | Die Seite liest den Zeiger beim Laden. Bleibt der Tab offen, altern die Werte und stehen nach drei Stunden als „Keine Daten“. | Zeiger stündlich neu lesen, solange der Steckbrief offen ist. |
| V-GO-8 | Der Workflow läuft leer, bis `main` von `buscosun-web` gepusht ist (der Producer liegt dort). Die Stunden zwischen meinen lokalen Läufen und dem Push fehlen in Daten-Repo und Archiv. | Push = Start der lückenlosen Reihe (§9). |
| V-GO-9 | Jetzt gibt es Messungen an Grat- und Gipfelstationen bis 3 399 m im Archiv — die Grundlage, „Modell, im Hochgebirge noch nicht nachgemessen“ zu prüfen. | `scripts/glacier/highelev-score.mjs` auf die Ablage erweitern: Modellwert der Höhe gegen die Station, je Vorlauf; erst danach darf der Vermerk fallen. |
| V-GO-10 | `verify:glacier-ui` (Browser) ist nicht gelaufen — er bricht schon an HEAD ab (V-GH-8). Die neue Karte ist in keinem echten Browser geprüft. | Wenn der Prüfer repariert ist: ein Block „Gemessen in der Nähe“ mit dem Auszug dieser Phase. |
| V-GO-11 | Budget: totalJs war ohne diese Phase schon über der Grenze; die Phase kostet 3,7 KB (Karte, Sicht, Dokumentregeln im Lazy-Chunk des Steckbriefs). | Grenze nicht angehoben (die Datei `budget.json` trägt fremde, nicht committete Änderungen). |
| V-GO-12 | Der Gesundheitswächter (`health-watch.yml`) kennt `status.lines.stations` nicht: fällt ein Netz aus, steht es nur im Status. | Eine Zeile im Wächter: `stations.checkedAt` älter als 3 h oder eine Quelle mit `error` ⇒ Meldung. |
| V-GO-13 | Die Beschreibung des Tiroler Datensatzes sagt „stündlich“ und nennt die Felder `N6`…`N72` nicht; sieben Stationen tragen einen zweiten Betreibernamen. | Mail an das Land (§9): Takt, Niederschlagsfelder, Lizenz der gemeinsam betriebenen Stationen. |
| V-GO-14 | Südtirol: Niederschlag und Strahlung ab 2 000 m nur an zwei Stationen; für die Gletscher am Hauptkamm kommen von dort nur Temperatur, Wind, Böe, Schneehöhe. | Kein Handlungsbedarf; steht hier, damit niemand es sucht. |
| V-GO-15 | Die README an der Wurzel von `buscosun-data` (Abschnitt Gletscher) nennt `glacier/v1/stn/` nicht; das Verzeichnis trägt seine eigene README mit Quellen und Lizenzen. | Beim nächsten Lauf der Beschreibungen einen Satz mit Verweis ergänzen. |
| V-GO-16 | Werkzeugfalle dieser Phase: ein eigenes Doku-Skript öffnete `CLAUDE.md` zum Schreiben, bevor es die Datei gelesen hatte — sie war im Arbeitsbaum rund zehn Minuten leer (21.11. 09:01–09:12 UTC). Wiederhergestellt aus dem committeten Stand plus den zwei nicht committeten Zeilen (SW · WL, SL) aus der Datei-Historie der Sitzungen; geprüft: der Diff gegen HEAD zeigt wieder genau diese zwei Zeilen und die GL-Zeile, die SW · WL-Zeile hat die Länge von vorher (16 644 Zeichen), nach der Sicherung gab es keine weitere aufgezeichnete Änderung an diesen Zeilen. Git war nie betroffen. | Regel für Skripte: erst lesen, dann die Zieldatei öffnen (`with` um das Schreiben); Sammeldateien wie `CLAUDE.md` nur über Edit ändern. Eine andere Sitzung, die in diesen Minuten `CLAUDE.md` las, sah eine leere Datei. |

## 9 Jans Schritte

`MANUELLE-SCHRITTE.md` §106: Push von `main` (startet den Stundenlauf), Ansehen (fünf Beispiel-Gletscher), Mail an `opendata@tirol.gv.at`
(Vorschlag im Wortlaut), Entscheidungen E-GO-1 / 3 / 4 / 7, Rückfall ohne Deploy.

Commit dieser Phase auf `main` (lokal, nicht gepusht): siehe `git log` — `feat(glacier): station measurements next to "Wetter am Gletscher" (phase GO)`.

## 10 Halbstundentakt (GO-2, Jans Wort 21.11. abends: „dann machen wir alle 30 Minuten“)

### 10.1 Diagnose (vor dem Code)

Stand am Daten-Repo, 21.11. 16:31 UTC: der erste Lauf MIT dem Producer auf einem GitHub-Runner (`44924927663`, Cron :27, gestartet 16:30:25)
schrieb `stn/h/2026112116.json` (342 Stationen, 10 Werte verworfen, Tirol über die OGD-Datei). Alter der Werte beim Abruf:
Tirol Median 11 min, Südtirol 21 min, TAWES und SwissMetNet 11 min, DWD 41 min. Die Quellen schreiben alle rund 10 Minuten neu —
bei einem Lauf je Stunde liest die Seite also Werte, die rund 11 bis 75 Minuten alt sind; bei einem Lauf je halbe Stunde rund 11 bis 45.

Was an der Stunde hängt (am Code gelesen):

| Stelle | heute | Folge für 30 min |
|---|---|---|
| Schlüssel `stnHourOf` und Dateiname `h/<yyyymmddhh>.json` | eine Datei je Stunde, EINMAL veröffentlicht | braucht einen Schlüssel je halbe Stunde |
| Leser der Seite (`loadStationHour`, seit dem Push live) | nimmt nur zehnstellige Schlüssel und prüft `doc.hour === Schlüssel` | ein ausgelieferter (auch zwischengespeicherter) Stand der Seite darf nicht ohne Werte dastehen |
| Stillstand-Prüfung | „jetzt + sechs frühere Dokumente mit verschiedenem Stempel“ | zählte bei 30 min nur noch drei Stunden — die Regel würde still schärfer |
| Geschichte der Prüfungen | die acht jüngsten Dokumente | wären nur noch vier Stunden |
| Aufbewahrung im Publisher | Muster auf zehn Ziffern | eine Halbstunden-Datei hätte keinen Stempel und bliebe liegen |
| Ablage `buscosun-archiv` | jede Datei aus `h/` | doppelte Menge (rund 200 statt 100 MB im Jahr) |
| Cron `27 * * * *` | startet gemessen um :30 (GitHub-Verzug rund 3 min) | :27/:57 läge genau auf der Slot-Grenze: je nach Verzug zwei Läufe in einem Slot und keiner im nächsten |

### 10.2 Plan

1. **Slot statt Stunde, alte Namen bleiben.** Der Schlüssel der vollen Stunde bleibt `yyyymmddhh`, die halbe Stunde heißt `yyyymmddhh30`
   (als Zeichenkette zeitlich sortiert). Bestehende Dateien, die Ablage und jeder ausgelieferte Stand der Seite bleiben gültig.
2. **Zeiger mit zwei Feldern:** `stations.hour` = jüngste VOLLE Stunde (liest der Stand der Seite vor diesem Schritt), `stations.slot` =
   jüngster Slot (liest der neue Stand). `builtAt` und `n` gehören zum Slot.
3. **Stillstand in Zeit statt in Dokumenten:** derselbe Wert in allen früheren Ablesungen der letzten sechs Stunden, mindestens sechs mit
   verschiedenem Stempel, die älteste mindestens 5,5 h zurück. Mit Stundendateien fällt dieselbe Menge heraus wie bisher; drei Stunden
   Gleichstand im Halbstundentakt reichen NICHT. Geschichte = alle Dokumente der letzten acht Stunden.
4. **Ablage bleibt stündlich** (E-GO-11): abgelegt wird die volle Stunde; die halbe nur, wenn ihre volle Stunde weder im Daten-Repo noch in
   der Ablage liegt (ausgefallener Lauf) — die Reihe bekommt so keine Lücke und wächst nicht auf das Doppelte.
5. **Cron `12,42 * * * *`:** 18 Minuten Abstand zur Slot-Grenze; abseits von glacier-melt (:20) und glacier-sat (:48).
6. Aufbewahrung, README, Vorlagen, Prüfer nachziehen. Keine Änderung an Grenzen, Höchstalter, Zuordnung, Anzeige-Regeln, buscosun Fusion.

Reihenfolge ohne Risiko: der neue Cron mit dem ALTEN Producer schreibt um :12 die Stunde und um :42 nichts (die Stunde liegt schon);
der neue Producer mit dem alten Cron schreibt einen Slot je Stunde. Beides ist der heutige Zustand, nur nicht besser.
