# Autobahnwetter – Konzept und Datenlage (Auszug für Phase AW)

> Stand 02./03.10.2026, Auszug aus dem claude.ai Doc „Autobahnwetter – Feature-Konzept buscosun“, ergänzt um die Rohbefunde der Recherche.
> **Abweichung zum Plan:** Das Konzept sah einen eigenen Cron `road.yml` vor; der Plan (`audit/autobahnwetter-plan.md`) ersetzt das durch den Ingest im Radar-Spiegel (E-AW-1). Bei Widerspruch gilt der Plan.

## 1. DWD-Quelle `weather/weather_reports/road_weather_stations/`

Die Quelle ist für den aktuellen Fahrbahnzustand hervorragend, für die Vorhersage gar nicht: Sie enthält nur Beobachtungen.

| Merkmal | Befund |
| --- | --- |
| Inhalt | Messungen der Glättemeldeanlagen (GMA) aus SWIS, dem Straßenwetter-System von DWD und Länder-Straßenbauverwaltungen |
| Stationen | ≈ 1.050 laut Kachelmannwetter (02.10.2026), 1.199 BUFR-Subsets in der wetterdienst-Auswertung |
| Takt | 15 min, je Ordner rollierendes 48-h-Fenster plus `LATEST`-Datei |
| Format | BUFR-Bulletins, 0,8–37 KB je Datei; daneben `quality-assured/observation_<ID>.xml.bz2` je Station (≈ 0,5–0,8 KB, Stand ≈ 15 min alt) |
| Stationsliste | `https://www.dwd.de/DE/leistungen/opendata/help/stationen/sws_stations_xls.xlsx?__blob=publicationFile&v=11`, Blatt `Tabelle1`, Spalten u. a. `Kennung`, `GMA-Name`, `Bundesland`, `Straße / Fahrtrichtung`, `Strecken-kilometer 100 m`, `Streckentyp`, `Streckenlage`, `Streckenbelag` (Register „Typen“), `Breite`/`Länge (Dezimalangabe)` mit Dezimalkomma, `Höhe in m über NN`, `GDS-Verzeichnis` (= Ordner), `außer Betrieb (gemeldet)` |
| Lizenz | GeoNutzV, entgeltfrei, ohne Registrierung, Quellenvermerk DWD; laut DWD „nicht abschließend qualitätsgesichert … für klimatologische Auswertungen nicht geeignet“ |

**Dateischema der Bulletins:** `swis2-ISXD70_DW<CC>_<DDHHMM>-<YYMMDDHHMM>-<KZ>---bin` plus `swis2-ISXD70_DW<CC>_LATEST-<KZ>---bin`. Der Code `<CC>` ist nicht immer das Ordnerkürzel (HJ enthält `DWKK…-HH`, KK enthält `DWKK…-SH`); FN enthält **zwei Reihen** (`DWFN…-BY`, `DWNB…-NB`). `<KZ>` sieht meist wie ein Länderkürzel aus (Deutung, nicht belegt).

**Ordnerstand 02.10.2026 ≈ 16 UTC:** 22 von 30 aktiv (DD, ER, FN, HJ, HL, HV, JA, JO, KA, KK, KM, KO, LH, MC, ND, NI, RB, RH, RP, SH, SP, WW); SD sporadisch (eine Datei vom 01.10. 11:56 UTC, Kennung `-BW`); leer: HS, JH, JS, LV, LW, MK, NC. SH lieferte erst ab 01.10. 12:30 UTC wieder. **Falle:** Verzeichnislisten kamen beim Abruf teils veraltet an (Cache); mit Query-Parameter (`?v=2`) waren sie aktuell. In Produktion `LATEST` per HEAD und Cache-Busting nutzen.

### Messgrößen (laut wetterdienst-Bibliothek, 14 Parameter)

| Parameter (BUFR-Name) | Einheit geliefert | Hinweis |
| --- | --- | --- |
| `roadSurfaceTemperature` | K | in der Sensor-Replikation, 0–4 Sensoren je Station |
| `roadSurfaceCondition` | Code | DWD-lokal `0 20 241` bzw. WMO `0 20 138` (je nach Layout); Codetabelle aus DWD-Formatbeschreibung übernehmen |
| `waterFilmThickness` | m | DWD-lokal `0 13 241` bzw. WMO `0 13 116`; in der Replikation |
| `airTemperature`, `dewpointTemperature` | K | außerhalb der Replikation, einmal je Station |
| `relativeHumidity` | % | |
| `horizontalVisibility` | m | |
| `precipitationType` | Flag-Tabelle `0 20 021` (30 bit) | Bit n hat den Wert `2^(30−n)`: 1 = Niederschlag unbekannter Art, 2 = flüssig, 3 = flüssig gefrierend, 4 = Sprühregen, 5 = Regen, 6 = fest, 7 = Schnee …; beobachtet nur einzelne Bits |
| `totalPrecipitationOrTotalWaterEquivalent` | kg m⁻² = mm | |
| `intensityOfPrecipitation` | kg m⁻² s⁻¹ = mm/s | |
| `windSpeed`, `windDirection`, `maximumWindGustSpeed`, `maximumWindGustDirection` | m/s, ° | |
| `qualityInformationAwsData` | Flag-Tabelle `0 33 005` | Bit 1 = „keine automatische Prüfung“ (bei 817 von 1.199 Subsets), Bit 7 = „ground temperature suspect“ (verifiziert gegen Fahrbahnwerte), Bit 30 = fehlend |

Mehrfachsensoren: Die Fahrbahngrößen kommen in einer verzögerten Replikation (`1 09 000`/`0 31 001`); kein Feld unterscheidet die Sensoren (`positionOfRoadSensors` ist 0 oder fehlend). Von 75 Stationen mit zwei Fahrbahntemperaturen wichen 68 voneinander ab (Median 0,3 K, 85 % innerhalb 1 K, 2 Stationen > 5 K).

### Datenqualität (Befunde der wetterdienst-Bibliothek)

- In einer Stichprobe lagen 21 von 887 Stationen mehr als 10 K neben ihrer Lufttemperatur, nur 4 davon DWD-geflaggt.
- Geräteplatzhalter `−75,00 °C` über Tage; `−30,00`/`−25,00 °C` als hängende Sensoren (aber im Winter real erreichbar – nicht per Wert verwerfen).
- Hängende Sensoren: funktionierende Sensoren hielten höchstens 14 (Luft), 17 (Taupunkt) bzw. 9 (Fahrbahn) gleiche Werte in Folge; defekte 86–96 von 96. Daraus die Regel 24 gleiche Werte (6 h), mit Ausnahme des Tauplateaus.
- Unplausible Warmwerte (79,8 °C nachts im September) sind mit einer Schwelle nicht von echten Sommerwerten trennbar – Nachbarschafts- und Cube-Abgleich nötig.

## 2. Österreich und Schweiz

In beiden Ländern messen die Autobahnbetreiber Straßenwetter, veröffentlichen es aber nicht offen.

| Quelle | Land | Inhalt | Zugang | Lizenz | Bewertung |
| --- | --- | --- | --- | --- | --- |
| ASFINAG Content Portal | AT | Verkehrsmeldungen (DATEX II) inkl. Unwetter-Ereignisse, keine Messwerte | Registrierung | CC BY 4.0 plus Zusatzpflichten | blockiert |
| ASFINAG Straßenwetterstationen | AT | ≈ 280 Stationen (Stand 2013) | nicht veröffentlicht | – | blockiert |
| GeoSphere TAWES | AT | 10 min: T, Td, Wind, Niederschlag, Schnee, 5-cm- und Bodentemperatur | ohne Key, max. 5/s und 240 Anfragen/h | CC BY 4.0 | nutzbar, nur gebündelt |
| GeoSphere INCA + Warnungen | AT | 1-km-Analyse stündlich; Warnungen u. a. Glatteis, Schnee | ohne Key | CC BY 4.0 | nutzbar |
| GIP.at | AT | Straßengeometrie inkl. A+S | Download | CC BY 4.0 | nutzbar |
| opentransportdata.swiss Traffic Situations | CH | Unfälle, Baustellen, Fluss, kein Wetter | API-Key, Rate-Limit | Rohdaten-Weitergabe verboten | blockiert |
| ASTRA-/Kantons-Glättewarnanlagen, strassenwetter.ch | CH | Belagstemperatur, Straßenzustand | nicht offen / Abo | – | blockiert |
| MeteoSchweiz SwissMetNet | CH | 10 min: T, 5-cm- und Bodentemperatur, Schneehöhe, Wind | ohne Key | CC BY 4.0 | nutzbar |
| ASTRA Nationalstrassenachsen | CH | Achsgeometrie | ohne Key | widersprüchlich | bedingt; bis zur Klärung OSM |
| Autobahn GmbH API | DE | Baustellen, Sperrungen, Webcams, kein Wetter | ohne Key | nicht angegeben | blockiert, nur Deep-Link |
| BKG DLM250, BASt BISStra | DE | Geometrie der Bundesfernstraßen | ohne Key | dl-de/by-2.0, CC BY 4.0 | nutzbar |

## 3. Fachliche Regeln aus dem Konzept

- **Zustandsklassen:** Glätte gemessen (Code Eis/Schnee/Reif) · Frostgefahr (Fahrbahn ≤ +1 °C und nass oder Fahrbahn ≤ Taupunkt) · Nass (Wasserfilm > 0 oder Zustand nass) · Trocken · Keine Daten. Schwellen sind `set` und werden kalibriert.
- **„Keine Daten“ sieht nie wie „trocken“ aus** (D-04, wie im Brandradar).
- **Hinweistexte:** regelbasiert, sachlich, Wert und Quelle im selben Satz, nie Warnsprache. Beispiel: „Fahrbahn −1,4 °C gemessen, Taupunkt −0,8 °C (GMA Irschenberg, 06:15). Reifbildung möglich.“ Trockene Messstellen nie als Entwarnung: „gilt für diesen Punkt, nicht für die Strecke“.
- **Amtliche Warnungen** nur als wörtliches Zitat (Warn-Layer-Regel).
- **Abfahrtsplaner:** Ankunftszeit je Messpunkt bei angenommenen 100 km/h (einstellbar); Zustand zur Ankunftszeit.

## Quellen (am 02.10.2026 geprüft)

- DWD Open Data: https://opendata.dwd.de/weather/weather_reports/road_weather_stations/
- wetterdienst, DWD Road: https://wetterdienst.readthedocs.io/en/latest/data/provider/dwd/road/15_minutes.html · Issue #1908: https://github.com/earthobservations/wetterdienst/issues/1908
- GDI-DE „Road Weather Stations of DWD“: https://gdk.gdi-de.org/geonetwork/srv/api/records/de.dwd.geoserver.fach.SWS_Beobachtungen
- DWD Copyright (GeoNutzV): https://www.wettergefahren.de/copyright.html
- DWD BUFR-Template Straßenwetter (nicht gelesen, robots.txt für Tools): https://www.dwd.de/DE/leistungen/opendata/help/schluessel_datenformate/bufr/bufr_templates_sws_national_pdf.pdf
- ASFINAG-Lizenz: https://contentportal.asfinag.at/assets/licenses/cc-by-40-asf/de/cc-by-40-asf.html
- GeoSphere Limits: https://dataset.api.hub.geosphere.at/v1/docs/user-guide/request-limit.html
- FEDRO-Bedingungen: https://opentransportdata.swiss/en/tac-fedro/
- MeteoSchweiz OGD: https://opendatadocs.meteoswiss.ch/general/terms-of-use
- Autobahn-API (OpenAPI): https://autobahn.api.bund.dev/openapi.yaml
- BKG DLM250: https://gdz.bkg.bund.de/index.php/default/open-data/digitales-landschaftsmodell-1-250-000-ebenen-dlm250-ebenen.html
- GIP.at: https://mobilitydata.gv.at/daten/gip-graphenintegrationsplattform-%C3%B6sterreich
