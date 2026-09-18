# buscosun Fusion — Kalibrierung aus fremden Archiven (Recherche)

> **Stand: 2026-09-18, Recherche ohne Code.** Frage von Jan: Kann die Kalibrierung (AP10) mit fremden Archivdaten
> vorgezogen werden, bis `buscosun-archiv` genug Slots trägt? Alle Angaben sind am 18.09. live geprüft (Sonden,
> Verzeichnislisten, Lizenzseiten) oder als **Doku** gekennzeichnet. Nichts hier ist umgesetzt; der Vorschlag steht
> in §5 und wartet auf Jans Entscheidungen E-F-23…25.

## 0 Ergebnis

**Ja, für den größeren Teil der Parameter, und für zwei Kästen sogar dauerhaft.** Open-Meteo archiviert die
Vorhersagen aller Cube-Quellen je Punkt: ICON-D2, ICON-EU und ICON global seit **24.11.2022**, IFS 0,25° seit
**03.02.2024**, ICON-CH1/CH2 seit **29.07.2025**; ganze Läufe mit vollem Horizont bis 336 h seit **02.04.2026**. Die
Beobachtungen aller drei Länder liegen frei und kommerziell nutzbar zurück bis 1992 und weiter (DWD CDC, GeoSphere,
MeteoSwiss OGD). Daraus lässt sich ein **Hindcast** bauen: Quellen je Punkt nachrechnen, gegen Stationswahrheit
bewerten, Parameter fitten. Das liefert

- **jetzt** σ_sys für alle Vorlauf-Bins bis 336 h (das eigene Archiv: 14.–28.10.),
- **jetzt** L_d, L_h und κ-λ über die Nachbarzellen (eigenes Archiv: 30 Tage nach dem ersten Block-Slot),
- **drei Winter statt eines** für A, A_uhi, f_rad, φ und z_b (eigenes Archiv: frühestens Ende November, belastbar
  im Winter 2026/27),
- **überhaupt erst** die Bias-Korrektur je Quelle und die Σ-Gewichte je Quellenpaar für PAP 2 — das eigene Archiv
  speichert keine Einzelquellen (E-D-1), der Fremdweg ist hier der einzige.

**Nicht ersetzbar:** c(p,f), weil kein freies Archiv die Ensemble-Streuung hält (Open-Meteo spiegelt nur die
Niederschlagswahrscheinlichkeit, TIGGE ist NC-lizenziert); die Konfidenz-Abschläge, weil sie an unseren Flags
hängen; der Schmelzversatz nur teilweise (DWD-Niederschlagsform an vielen Stationen seit 2012 nicht mehr gemeldet).

Die Werte aus dem Fremdweg sind **nicht am eigenen Produkt gemessen** (anderes Regridding, keine Quantisierung, keine
Modelllevel-Profile). Sie brauchen eine eigene Provenienzklasse `hindcast`, die wirkt, aber gekennzeichnet ist, und
die AP10 später durch `measured` ersetzt (E-F-23).

## 1 Was AP10 je Parameter braucht, und was der Fremdweg davon liefert

Registry aus `audit/fusion-vollform.md` §2.5. „Eigenes Archiv ab" = schreibbar laut Plan.

| Parameter | Braucht | Eigenes Archiv ab | Fremdweg | Bewertung |
|---|---|---|---|---|
| σ_sys(v, Lead-Bin) | Cube-Vorhersage je Lead vs Wahrheit, ≥ 30 Tage je Bin | 14.10. (0–6 h) … 28.10. (246–336 h) | Pseudo-Cube aus Open-Meteo-Läufen (Single Runs seit 02.04.2026, ≈ 165 Tage, alle Bins) + CDC/GeoSphere/SMN | **voll**, als `hindcast`; Gewinn nur 4–6 Wochen, aber alle Bins auf einmal |
| c(p,f) Spread/Skill | σ_ens je Schritt vs Fehler | 14.–28.10. | ECMWF IFS ENS (51 Member, 0,25°, seit 01.04.2024, 1 Lauf/Tag) und AIFS ENS (seit 02.07.2025) bei **dynamical.org**, CC BY 4.0. DWD-EPS, C-LAEF und ICON-CH-EPS: nirgends frei archiviert (Open-Meteo-Member 3 Tage; TIGGE ohne DWD und CC BY-NC) | **t3 und ECMWF-Anteil von t2: voll**; **t1: nein** — eigenes Archiv |
| Konfidenz-Abschläge | unsere Flags je Fall | ≈ 200 Fälle je Flag | Flags entstehen nur in unserer Pipeline | **nein** (Fall C und Chunk-Rand ließen sich im Hindcast nachbilden — Teilwert) |
| L_d, L_h, κ-λ | 2×2-Block je Stufe vs Wahrheit | 30 Tage nach erstem Block-Slot (Nov.) | vier Zellmitten je Punkt aus der Zeitreihe seit 11/2022 | **voll**, dreieinhalb Jahre statt 30 Tage |
| z_b Wind-Blending | Wind obs/mod je z0-Klasse | 30 Tage | Modellwind 10 m je Quelle seit 11/2022 | **voll** |
| A, f_rad (a, v_ref, ε) | obs − Modell an Muldenstationen in Strahlungsnächten | ≥ 20 Nächte × ≥ 10 Stationen, Winter | ICON-D2 Tag-0-Vorhersage seit 11/2022 = 3 Winter; Bewölkung/Wind aus obs oder Modell | **voll**, relativ zur ICON-D2-Zelle (nicht zum fusionierten, vertikal korrigierten Wert — §3.1) |
| A_uhi | Stadt gegen Umland, Strahlungsnächte | wie A | DWD `climate_urban/hourly` (Stadtstationen) + Umland aus CDC | **voll**, 3 Winter |
| φ-Stützstellen, poolDepth | Fall-B-Stationspaare, Inversionsform | ≥ 15 Nächte, Winter | Radiosonden IGRA2 (19 aktive DACH-Stationen) geben die Form direkt; Stationspaare am Hang aus CDC/TAWES | **voll, beobachtungsbasiert** — kein Modell nötig |
| dzMin, gammaDepthM | Modelllevel-Profile (V-FI-71: nicht im Archiv) | nie | Radiosonden: Inversionsdicke und -tiefe als Klimatologie | **voll** für die Schwelle als Beobachtungsgröße; Producer-Übernahme = S&F |
| meltOffset | Niederschlagsart vs Feuchtkugel | Winter, ab POI-Spalten in Schema 3 (V-FI-76) | DWD `hourly/precipitation` WRTR: an Station 20 nur 2004–2012, 2026 `-999`; tägliche Neuschneehöhe (KL) als grobe Phase | **teilweise** |
| tpiSigma | Gelände | sofort | — | — (AP13) |
| Bias-Korrektur je Quelle (PAP 2 U1) | Quelle vs Wahrheit über Monate | **nie** (keine Einzelquellen im Slot, E-D-1) | Open-Meteo je Quelle seit 11/2022 bzw. 02/2024 | **einziger Weg** |
| Σ je Quellenpaar (PAP 2 U2) | Fehlerkovarianz der Quellen | **nie** (wie oben) | wie oben | **einziger Weg** |
| σ_clima stündlich (V-PV-18) | Mehrjahres-Klimatologie | AP10-Nebenprodukt | ERA5-Land im Open-Meteo-Spiegel (seit 1950) + CDC | **voll** |

## 2 Geprüfte Quellen

| Quelle | Inhalt | Zeitraum | Zugang | Lizenz | Prüfung 18.09. |
|---|---|---|---|---|---|
| **Open-Meteo Historical Forecast API** | Tag-0-Zeitreihe je Modell und Punkt; Druckflächen nur bei den 0,25°-Modellen | ICON-D2/EU/global ab 24.11.2022, IFS 0,25° ab 03.02.2024, IFS HRES 9 km ab 2017, ICON-CH1/CH2 ab 29.07.2025 (Doku) | HTTPS, kein Schlüssel | Daten CC BY 4.0; API frei nur nicht-kommerziell (10 000 Aufrufe/Tag), kommerziell ab 99 €/Monat (Doku) | Sonde München ICON-D2 15.01.2023 liefert Werte; IFS 0,25° 925/850/700 hPa am 01.03.2024 liefert Werte |
| **Open-Meteo Previous Runs API** | Werte mit Vorlauf 1–7 Tage (`_previous_day1…7`), nur Oberflächenvariablen | meist ab 01/2024 (Doku) | wie oben | wie oben | Doku gelesen |
| **Open-Meteo Single Runs API** | **ganzer Lauf mit vollem Horizont**, alle Variablen und Druckflächen, `run=` | IFS HRES ab 14.03.2024, **alle anderen Modelle ab 02.04.2026** (Doku) | wie oben | wie oben | Doku gelesen |
| **Open-Meteo auf AWS Open Data** (`s3://openmeteo`, us-west-2) | `data/<modell>/<variable>/chunk_*.om` = Zeitreihe unbegrenzt; `data_run/<modell>/<lauf>/` = ganze Läufe, 3 Monate; `om`-Format mit TS/Python-Lesern | ICON-D2 `temperature_2m`: 242 Zeitscheiben; `data_run` 06–09/2026 für ICON-D2 und IFS 0,25° | S3 anonym, keine API-Grenzen | **CC BY 4.0** | Listen gezogen; Ensemble-Ordner (`dwd_icon_d2_eps`, `ecmwf_ifs025_ensemble`) tragen **nur `precipitation_probability`** |
| **DWD CDC** | stündlich T, Td, Wind, Bewölkung, Niederschlag (R1, RS_IND, WRTR); 10-min T, Wind, Böen, Niederschlag, Solar; `climate_urban/hourly` (Stadt) | Jahrzehnte; 10-min ab ≈ 2000 | opendata.dwd.de, ZIP je Station | GeoNutzV: frei, auch kommerziell, mit Quellenvermerk | Verzeichnisse gelistet; Station 20: WRTR-Meldung 2004–2012, 2026 `-999` |
| **GeoSphere Data Hub** `klima-v2-10min` | TAWES 10-min | ab 1992 | REST-API | CC BY 4.0 | Doku gelesen |
| **MeteoSwiss OGD** `ch.meteoschweiz.ogd-smn` | SMN 10-min und stündlich, `historical`/`recent`/`now` | ab Messbeginn (Jahrzehnte) | STAC-API data.geo.admin.ch | CC BY 4.0, „Source: MeteoSwiss", kommerziell erlaubt | Doku gelesen |
| **IGRA2 (NOAA)** | Radiosonden, tägliche Aktualisierung | ab 1905 | FTP/HTTPS | frei | Stationsliste gezogen: 19 aktive DACH-Stationen (AT: Linz, Wien, Innsbruck, Graz; DE: Schleswig, Norderney, Greifswald, Bergen, Meppen, Lindenberg, Essen, Meiningen, Idar-Oberstein, Stuttgart, Kümmersbruck, Oberschleißheim, Altenstadt, Hohenpeißenberg; CH: Payerne) |
| **ERA5-Land** im Open-Meteo-Spiegel | t2m, Td, Schneehöhe, Boden | ab 1950 | S3 | CC BY 4.0 | 155 Zeitscheiben gelistet |
| CERRA 5,5 km (1984–2021), COSMO-REA6 6 km (1995–2019) | Regionale Reanalysen | abgeschlossen | CDS / Uni Bonn | frei | nur Suche; für uns nachrangig (Analyse, kein Vorhersagefehler) |

**Nicht verwendbar:**
- **TIGGE** (Ensembles seit 2006): CC BY-NC 4.0 ⇒ NC-Klausel, nach Projektregel nur Deep-Link.
- **ECMWF Open Data** (auch der AWS-Spiegel `ecmwf-forecasts`): nur die letzten 12 Läufe.
- **`buscosun-data`-Historie:** 116 Commits, nur 2 berühren `point/2026091*`; die Kartenlinie schreibt die Historie um.
  Kein Hindcast aus dem eigenen Daten-Repo.
- **MOSMIX:** kein öffentliches Archiv ⇒ B2 bleibt nur ab dem eigenen Archiv.

## 3 Drei Wege

### 3.1 Weg A — Hindcast aus Open-Meteo je Quelle (Hauptweg)

Je Archivpunkt (405) und je Quelle die Zeitreihe seit 11/2022 bzw. 02/2024 holen, daraus den **Pseudo-Cube** bauen
(gleichgewichtetes Mittel je Stufe wie der Producer, Höhenkorrektur wie PAP 4), gegen die Wahrheit der drei Netze
bewerten, fitten. Für Lead-Bins > 24 h: Single Runs seit 02.04.2026 (≈ 165 Tage) oder `data_run` (3 Monate).

Was er kann: σ_sys je Bin (Näherung), L_d/L_h/λ (vier Zellmitten je Punkt anfragen), z_b, A/A_uhi/f_rad über drei
Winter, **Bias je Quelle und Σ je Quellenpaar** (PAP 2 U1/U2).

Was er nicht exakt trifft, deshalb `hindcast` und nicht `measured`:
- Open-Meteo regriddet und interpoliert selbst; die API rechnet zudem eine Höhenkorrektur auf ein 90-m-DEM
  (Antwort nennt `elevation`). Für Rohzellwerte `cell_selection=nearest` und `elevation` abschalten — **im Kickoff
  gegen einen bekannten Zellwert verifizieren**, die Sonde mit `elevation=nan` nannte weiterhin 2 177 m.
- Keine Modelllevel-Profile: PAP 4 im Hindcast nur mit Standard-Lapse oder mit den IFS-Druckflächen (t2/t3-Ersatz).
  A und A_uhi sind damit relativ zur ICON-D2-Zelle mit grober Höhenkorrektur bestimmt, nicht zum fusionierten Wert.
- Keine Quantisierung (σ_quant fehlt), keine Nowcast-Member, kein Anker.
- Lizenzweg: **S3-Spiegel** (CC BY 4.0, keine Aufrufgrenzen, `om`-Leser in TypeScript vorhanden) statt API, dann stellt
  sich die Frage kommerziell/nicht-kommerziell der API nicht (E-F-24).

### 3.2 Weg B — nur Beobachtungen (kein Modell)

- **φ(u) und poolDepth:** Radiosonden zeigen die Form der Inversion direkt (T(z) zwischen z_base und z_inv); 19
  DACH-Stationen, Jahrzehnte. Dazu Stationspaare am Hang aus CDC/TAWES/SMN.
- **dzMin, gammaDepthM:** Klimatologie der Inversionsdicke und Bestimmungstiefe aus Radiosonden — hebt V-FI-71 auf
  die Beobachtungsseite; die Übernahme in den Producer bleibt S&F.
- **A, A_uhi als Obergrenze:** Muldenstation minus Referenzstation (TPI ≈ 0) in beobachteten Strahlungsnächten
  (f_rad aus obs-Bewölkung und -Wind). Modellunabhängig, deshalb Obergrenze: das Modell löst einen Teil der Mulde
  selbst auf.
- **f_saison:** Jahresgang der Spreizung aus derselben Rechnung, statt Nachtlängen-Setzung (E-F-4).
- **σ_clima stündlich** (V-PV-18): aus CDC/ERA5-Land.
- **meltOffset:** nur grob (tägliche Neuschneehöhe gegen Tagesniederschlag, WRTR wo vorhanden).

### 3.3 Weg C — Reanalyse (ERA5-Land, CERRA)

Lange Klimatologien für Strahlungsnacht-Statistik und f_saison; keine Vorhersagefehler, deshalb nur Ergänzung zu B.

## 4 Was der Fremdweg nicht kann

- **c(p,f) für t1:** keine freie Historie der DWD-Ensembles (ICON-D2-EPS, ICON-EU-EPS), von C-LAEF und ICON-CH-EPS.
  Open-Meteo hält Member nur 3 Tage (Sonde 18.09.: erster Wert 15.09. bei `past_days` 3, 14 und 60), TIGGE führt
  kein DWD und ist NC. Bleibt beim eigenen Archiv (σ_ens liegt seit 14.09. im Slot), schreibbar 14.–28.10.
  **Für t3 und den ECMWF-Anteil** gibt es dagegen **dynamical.org**: IFS ENS 15 Tage, 0,25°, alle 51 Member, seit
  01.04.2024, ein Lauf je Tag, 3-stündlich bis 144 h, dann 6-stündlich; AIFS ENS seit 02.07.2025; Zarr/Icechunk
  auf AWS, CC BY 4.0 plus ECMWF Terms of Use. Dazu ICON-EU deterministisch seit 10.02.2026.
- **Konfidenz-Abschläge:** an unsere Flags gebunden.
- **σ_sys des echten Produkts:** der Hindcast ist eine Näherung; AP10 ersetzt ihn ab Mitte Oktober je Bin.
- **meltOffset:** nur teilweise; die POI-Spalten in Schema 3 (V-FI-76) bleiben der saubere Weg.
- **B2 (MOSMIX) und B5/B6 (Live-Pfad):** keine Historie ⇒ die Backtest-Basislinien kommen weiter aus dem eigenen Archiv.

## 5 Vorschlag: AP10a „Fremdkalibrierung" nach AP13

**Voraussetzung, jetzt an AP13 melden:** der Fit-Kern (`src/point/calibFit.ts`) muss seine Fälle aus einer
abstrakten Quelle nehmen (eigenes Archiv **oder** Hindcast), und die Registry braucht je Eintrag ein Feld `source`
(`own-archive` | `hindcast:open-meteo` | `obs-only:cdc/igra`) und die Provenienzklasse `hindcast`.

| Schritt | Inhalt | Aufwand | Gate |
|---|---|---|---|
| 1 Wahrheit | Leser für CDC (ZIP je Station), GeoSphere-API, MeteoSwiss-STAC → ein Wahrheitsformat wie `truth.mjs`; 405 Punkte, seit 2022-11 | S–M | lokal |
| 2 Hindcast-Leser | `om`-Leser gegen `s3://openmeteo` (Zeitreihe + `data_run`); je Punkt Zellmitte und vier Nachbarn; Verifikation: Rohzellwert = Wert der Zellmitte | M | lokal; Lizenzweg E-F-24 |
| 3 Pseudo-Cube | Gleichgewichtsmittel je Stufe, PAP 4 mit Standard-Lapse / IFS-Druckflächen, `calib`-Flags | S | lokal |
| 4 Fits | Registry aus AP13 mit `source: hindcast`; σ_sys je Bin, L_d/L_h/λ, z_b, A/A_uhi/f_rad (3 Winter), Bias je Quelle, Σ je Paar | M | lokal |
| 5 Obs-only | Radiosonden → φ, dzMin, gammaDepthM; Stationspaare → A-Obergrenze, f_saison; σ_clima | M | lokal |
| 6 Ausgabe | `calib.hindcast.json` (Schema 2 + `source`), Client liest `hindcast` **nur mit Kennzeichnung** (E-F-23); Producer-Übernahme von dzMin/gammaDepthM = S&F | S | **J** |

Summe ≈ 4–6 Sitzungen. Nutzen gegenüber Warten: alle Lead-Bins sofort statt Ende Oktober; drei Winter für die
Terrain-Terme statt Winter 2026/27; PAP 2 U1/U2 überhaupt.

**Entscheidungen für Jan:**
- **E-F-23** Provenienzklasse `hindcast`: wirkt mit Kennzeichnung, wird je Parameter durch `measured` ersetzt, sobald
  das eigene Archiv n_min erreicht. Empfehlung: ja.
- **E-F-24** Datenweg Open-Meteo: S3-Spiegel (CC BY 4.0) statt API (nicht-kommerzielle Freistufe). Empfehlung: S3.
- **E-F-25** AP10a als eigene Etappe nach AP13, parallel zu AP14–AP17 möglich (keine gemeinsamen Dateien außer
  der Registry). Empfehlung: ja, weil die Winterfrage sonst ein Jahr kostet.

## 6 Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| RK1 | Open-Meteo-Werte sind nicht die Cube-Werte (Regridding, Höhenkorrektur, keine Quantisierung) | Provenienz `hindcast`; Rohzellwert-Verifikation; Ablösung je Parameter durch AP10 |
| RK2 | A/A_uhi aus dem Hindcast sind relativ zu einer groben Höhenkorrektur bestimmt | im Hindcast dieselbe PAP-4-Regel wie im Produkt (Standard-Lapse / Druckflächen-Ersatz, AP15) verwenden; Differenz zum Modelllevel-Profil in t1 als Unsicherheit ausweisen |
| RK3 | API-Lizenz (nicht-kommerzielle Freistufe) | S3-Weg (E-F-24) |
| RK4 | Datenmenge: 405 Punkte × 4 Zellen × ≈ 6 Quellen × 3,5 Jahre stündlich | `om`-Chunks je Punkt sind klein (1–4 KiB je Zugriff laut Doku); lokal cachen, nicht ins Repo |
| RK5 | Wahrheit dreier Netze mit verschiedenen Konventionen (TAWES/SMN 10-min-Rate, POI Stundensumme — PA2-Falle) | dasselbe `truth`-Format und dieselben Umrechnungen wie der Sammler |
| RK6 | Radiosonden nur an 19 Orten, 00/12 UTC | φ als Form (nicht je Ort); Stationspaare ergänzen |

## 7 Quellen

- Open-Meteo Historical Forecast API: https://open-meteo.com/en/docs/historical-forecast-api
- Open-Meteo Previous Runs API: https://open-meteo.com/en/docs/previous-runs-api
- Open-Meteo Single Runs API (Ankündigung): https://openmeteo.substack.com/p/single-runs-api
- Open-Meteo Ensemble API: https://open-meteo.com/en/docs/ensemble-api
- Open-Meteo Terms: https://open-meteo.com/en/terms
- Open-Meteo auf AWS Open Data: https://github.com/open-meteo/open-data · https://registry.opendata.aws/open-meteo/
- ECMWF Open Data auf AWS: https://registry.opendata.aws/ecmwf-forecasts/
- DWD CDC Open Data: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/ · https://www.dwd.de/DE/leistungen/cdc/climate-data-center.html
- GeoSphere Austria `klima-v2-10min`: https://data.hub.geosphere.at/en/dataset/klima-v2-10min
- MeteoSwiss Open Data: https://opendatadocs.meteoswiss.ch/general/download · https://opendatadocs.meteoswiss.ch/general/terms-of-use
- IGRA2: https://www.ncei.noaa.gov/products/weather-balloon/integrated-global-radiosonde-archive
- TIGGE (Lizenz): https://apps.ecmwf.int/datasets/licences/tigge/
- COSMO-REA: https://reanalysis.meteo.uni-bonn.de/
