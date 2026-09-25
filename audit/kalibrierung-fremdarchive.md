# buscosun Fusion — Kalibrierung aus fremden Archiven (Recherche)

> **Stand: 2026-09-18, Recherche ohne Code.** Frage von Jan: Kann die Kalibrierung (AP10) mit fremden Archivdaten
> vorgezogen werden, bis `buscosun-archiv` genug Slots trägt? Alle Angaben sind am 18.09. live geprüft (Sonden,
> Verzeichnislisten, Lizenzseiten) oder als **Doku** gekennzeichnet. Der Vorschlag steht in §5 (E-F-23…25).
> **Umsetzung AP10a (19.09.2026): §8** — Hindcast-Archiv lokal angelegt, Pilot mit V1–V8 abgenommen, der volle
> Zeitraum läuft als bewachte Hintergrundketten; wo §8 von §0–§6 abweicht (Zeiträume, Speicherauflösung, Wege), gilt §8.

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

## 8 AP10a Umsetzung — Protokoll (18.–19.09.2026)

> Umsetzung nach dem Kickoff `prompt-hindcast.md` (Fassung 19.09.). Zwei Sitzungen: die erste (18.09. 22:55 –
> 19.09. 09:17 UTC) baute Leser, Zellen und Slot-Bau und startete die Pulls; sie brach ab, alle Hintergrund-Pulls
> starben mit ihr. Die zweite (19.09. ab 09:26 UTC) setzte fort, fand und behob neun Fehler am Pilot (V-HC-5…13),
> machte die Hintergrundläufe sitzungsfest und nahm den Pilot ab. Code in `scripts/hindcast/` (Anleitung
> `scripts/hindcast/README.md`), Daten in `C:\dev\buscosun-hindcast\` (kein Git-Repo, Quellenvermerke dort in
> `README.md`). Alles hier ist Provenienz **`hindcast`**, nie `measured` (E-F-23). `src/`, `scripts/punktarchiv/**`,
> `scripts/point/**` und `package.json` sind unberührt.

### 8.0 Diagnose (gemessen, nicht hochgerechnet)

**Erste und letzte Daten der Quellen** (S3-Inventur 19.09. 01:05 UTC, `log/inventory-openmeteo-2026-09-19.json`;
dynamical-Sonde 18.09. 23:13 UTC). Letzte Daten = Stand der Messung, die Zeitreihen wachsen täglich.

| Quelle (Stufe) | Weg | erste Daten | Variablen mit abweichendem Beginn | Takt |
|---|---|---|---|---|
| ICON-D2 (t1) | S3 `data/` Tag-0 | 2023-05-24 04 UTC | 850/700 hPa ab 2023-12-06; **kein 925 hPa, kein Taupunkt, kein Bodendruck** | 1 h, Chunk 121 h |
| ICON-EU (t1, t2) | S3 `data/` Tag-0 | 2023-05-24 01 UTC | 925/850/700 hPa ab 2023-12-03 | 1 h, Chunk 193 h |
| ICON global (t2, t3) | S3 `data/` | 2023-05-25 02 UTC | Druckflächen ab 2023-11-30; keine Schneefallgrenze | 1 h, Chunk 253 h |
| IFS 0,25° (t1–t3) | S3 `data/` | 2024-01-25 | rh2m ab 2024-02-20, Böe ab 2024-11-06, **Bodendruck nur bis 2025-05-20** | 3 h, Chunk 312 h |
| AIFS Single (t1–t3) | S3 `data/` | 2025-02-05 | Druckflächen-rh ab 2025-02-23, keine Böe, Bodendruck nur bis 2025-05-24 | 6 h, Chunk 432 h |
| ICON-CH1 / CH2 | S3 `data/` | 2025-07-01 / 2025-06-29 | keine Druckflächen; gedrehter Pol | 1 h |
| alle sieben | S3 `data_run/` | ICON-D2/CH/ICON/AIFS 2026-06-17 00z, ICON-EU 06-16 21z, IFS 06-16 18z | läuft täglich aus (3 Monate); Niederschlag ohne Schritt 0 | 3 h (ICON-D2/CH1/EU), 6 h |
| IFS ENS (t2 Stellvertreter, t3 σ_ens) | dynamical Icechunk v2 | Init 2024-04-01 00z | 51 Member (0 = Kontrolllauf), kein 700 hPa, keine Feuchte auf Flächen | 00z, 0–360 h |
| AIFS Single | dynamical | 2024-04-01 | 4 Läufe/Tag, 6 h, keine Böe | 0–360 h |
| ICON-EU | dynamical | 2026-02-10 | keine Druckflächen, keine Schneefallgrenze | 4 Läufe/Tag, 0–120 h |

**Einzelmessungen:** ein om-Bereichslesen (3×3 Zellen × 121 h aus einem ICON-D2-Chunk, 34 MiB Datei): 6,2 KB in 4
Anfragen, 0,9 s (Öffnen 1,3 s, 112 B). Ein Icechunk-Lesen der DACH-Box für eine Variable und einen Lauf: IFS ENS
15,2 MiB in 5,1 s (Punkt allein 4,1 MiB, 1,4 s — die Chunks tragen alle 51 Member), AIFS 2,6 MiB in 1,3 s, ICON-EU
≈ 2 s. Bandbreite us-west-2 → hier: ein Strom 5,97 MB/s. **Die Pulls sind rechengebunden, nicht netzgebunden**
(4 Kerne bei 100 %, WLAN 5,7 MB/s bei drei parallelen Strömen).

**Benötigte Zellen** (405 Punkte, 2×2-Block je Stufe, dedupliziert): Cube-Zellen t1 1 384, t2 1 361, t3 914.
Quellzellen: ICON-D2 8 680 (in 447 Zeilen), ICON-EU 3 463, ECMWF 0,25° 914, ICON global 0,125° 1 684, ICON-CH1 920,
ICON-CH2 840.

**Kosten je Weg (gemessen am Pilot):** `data_run` ≈ 590 MB und 8–11 min je Tag und Strom (ICON-D2 allein 320 MB in
56 000 Bereichsanfragen); Tag-0-Reihe ≈ 1,7 GB und 31 min je 50 Tage (fünf Modelle); IFS ENS ≈ 14 min und ≈ 4,6 GB je
Monat (31 Läufe × 10 Variablen × 15 MiB), AIFS ≈ 10 min und ≈ 2,9 GB je Monat (gemessen: 613 Variable-Läufe
1,61 GB, Byte-Zähler seit 19.09.); Wahrheit 50 Tage 11,5 min.
Voller Zeitraum damit ≈ 12–15 h `data_run` (zwei Ströme), ≈ 7 h IFS ENS + 5 h AIFS, ≈ 10 h Tag-0-Reihe, dazu der
Slot-Bau (Lauf-Route 4–45 s je Slot, Tag 0 ≈ 7 s, dyn ≈ 1–4 s) — rund 1,5–2 Tage Rechnerzeit auf dieser Maschine.

### 8.1 Zellen (`cells.mjs`, V2)

Die Regel des Producers ist nicht „nächste Quellzelle" (V-HC-1): reguläre Gitter (ICON-D2, ICON-EU, ECMWF 0,25°)
werden als **Blockmittel** über alle Quellzellen gelesen, deren Mitte in die Cube-Zelle rundet, leere Blöcke aus der
nächsten gefüllten Cube-Zelle (≤ 3 Ringe); nur unstrukturierte Gitter (ICON global, ICON-CH) nehmen die nächste Zelle.
Open-Meteo führt ICON global auf 0,125° (CDO-Gewichte) und ICON-CH auf einem gedrehten Gitter (Pol 43 N / 170 W,
Ursprung rlat −4,06 / rlon −6,46; die vier Ecken treffen die BBOX von `meta.json` auf 2·10⁻⁵°). Für ICON-CH wählt
`cells.mjs` unter den gedrehten Punkten ±2 um die Cube-Mitte den, dessen Orographie der hmodel-Spalte gleicht (V-HC-3).

V2-Ergebnis (19.09.): Blockregel 0 Verstöße, nächste Zelle ≤ halbe Maschenweite 0 Verstöße, Drehpol-Rundweg
9,2·10⁻¹⁴°. **Unabhängiger Orographie-Beweis** gegen `point/static/hmodel/v1` (gepinnt am Index-Commit `beedc23`):
ICON-D2 1 280/1 280 Landzellen innerhalb 1 m (100 %, |Δ| p50 0,3 m); die um eine Quellzelle verschobene Rezeptur
trifft 8,8 %. Die ≥ 99 % des Kickoffs gelten **nur für ICON-D2** — Open-Meteo veröffentlicht für die übrigen Modelle
eine andere Orographie als die GRIB-Felder des Producers (V-HC-14): ICON-EU 76,7–78,6 % (|Δ| p50 0,5–1 m, p90 2–3 m),
AIFS 50–55 % (p50 1–2 m), IFS 39–55 % (p50 1–3 m), ICON global 12,6–22 % (p50 4–11 m, anderes Gitter). Dafür der
**Argmin-Beweis**: für jede der 13 Quelle-Stufen passt die unverschobene Rezeptur besser als jede der 24 um ±1…2
Quellzellen verschobenen (Median |Δ| 0,3–11 m gegen ≥ 14–71 m des besten Versatzes). ICON-CH: 683/901 (CH1) bzw.
608/828 (CH2) Zellen sind über die Orographie gewählt — dort ist die Gleichheit Bauart, kein Beweis; die übrigen
218/220 Zellen nehmen den nächsten gedrehten Punkt (|Δh| p50 43–49 m). Die Zellen außerhalb 1 m stehen mit Koordinaten
in `verify/<Datum>.json` (`results.V2table[].rest`).

### 8.2 Pilot (Ende zu Ende)

| Teil | Fenster | Ergebnis |
|---|---|---|
| data_run (alle 7 Modelle, alle Läufe) | 2026-09-14 … 09-19 (Archiv-Überlapp) | 41 Lauf-Slots (t1 41, t2 21, t3 10), 4 vom Wächter übersprungen (09-14 00/03: Vortagsläufe noch nicht gezogen; 09-19 12/18: Läufe noch nicht erschienen) |
| Tag-0-Reihe (5 Modelle) | 2026-06-01 … 06-16 und 2026-08-01 … 09-19 | 15 Tag-0-Slots (t1, 00 UTC) |
| dynamical (IFS ENS, AIFS, ICON-EU) | 2026-06-01 … 06-16 und 2026-08-01 … 09-19 | 60 dyn-t2- und 30 dyn-t3-Slots (02.–16.06., 00/06/12/18 UTC) |
| Wahrheit (CDC, TAWES/klima, SMN) + IGRA2 | 2026-08-01 … 09-19, danach voll 2023-05-24 … 2026-07-31 | 1 215 Tagesdateien, alle `final`; CDC 203/203 Punkte am Archiv bewiesen (8 davon > 2 km, per Überlapp); 43 055 IGRA2-Aufstiege an 19 Stationen |
| Schatten (V4) | 5 Archiv-Slots 14.–18.09. + 7 CDN-Läufe (t1 19.09. 06z, t2 18.09. 12/18z und 19.09. 00z, t3 18.09. 00/12z) | Tabellen 8.4 |

Am Pilot gefunden und behoben (8.5): V-HC-5 (Speicherauflösung), V-HC-6 (Druckflächen-Quellen), V-HC-7
(Regeländerung 16.09.), V-HC-8 (σ_ens-Stunden), V-HC-9 (dyn-Vorlaufachse), V-HC-10 (Routenkollision, Wächter),
V-HC-11 (Lücke 01.–13.09.), V-HC-12 (sitzungsfeste Läufe). Nach den Korrekturen wurden alle Pilot-Slots neu gebaut;
zwei Slots mit allen drei Stufen (16.09. 00z, 17.09. 12z) sind mit dem Endstand des Codes byte-gleich nachgebaut.

### 8.3 Abnahme V1–V8 (Pilot, 19.09.2026, `verify\2026-09-19.json`, Stempel in `index.json`)

Jede Prüfung mit Gegenprobe; eine Prüfung ohne Gegenprobe zählt nicht. 101 Slots (Lauf 41, Tag 0 15, dyn t2 60 / t3 30).

| | Prüfung | n | Ergebnis | Gegenprobe |
|---|---|---|---|---|
| V1 | Form: Schema 1, `hindcast/slot`, 57 Ebenen in CUBE_PLANES-Ordnung, Skalen; leadHours; Block = blockOffsets; nächste Zelle 57, Nachbarn genau die 31 PAP-3-Ebenen | 101 Slots, 71 685 Punkt-Stufen | **bestanden** (0 Abweichungen) | umbenannte Ebene abgewiesen; punktarchiv-Leser weist Hindcast ab und umgekehrt; echter Archiv-Slot abgewiesen |
| V2 | Zellen: Blockregel, Abstand ≤ ½ Maschenweite, Drehpol-Rundweg, Orographie-Beweis | 16 396 Zell-Quellen | **bestanden** (Rundweg 9,2·10⁻¹⁴°; ICON-D2 1 280/1 280; Argmin 13/13) | Rezeptur ±1 Zelle verschoben: 8,8 % statt 100 %; alle 24 Versätze schlechter |
| V3 | (a) 3 zufällige Slots neu gebaut byte-gleich · (b) Rundweg 1 %-Stichprobe gegen eine unabhängige Zweitimplementierung (`recompute.mjs`): Mittel ≤ Δ/2, σ_div ± Δ, srcCount, MISSING; Fakt-C-Ebenen über alle Slots · (c) Chunk-Arithmetik | 3 · 54 323 / 37 648 / 60 568 · 71 685 · 7 Modelle | **bestanden** (0 Abweichungen) | Neurechnung an der östlichen Nachbarzelle trifft 16,2 %; Chunk-Arithmetik mit Δt × 2 trifft nicht |
| V4 | Schatten gegen den echten Cube, exakt vergleichbare Ebenen | 25 Ebene-Stufen, 1 620 … 102 704 Paare | **bestanden** in der Speicherschranke (95,6–100 %); ±1 Schritt 26–63 % bei den Druckflächen (V-HC-5) | Druckflächen gegen die Zelle des nächsten Punkts: 16,4 % in der Schranke |
| V5 | Wahrheit: gleicher Strom ziffergleich, Produktrundung, Punktbeweis CDC, 23 UTC einmal, IGRA2 | 52 541 · 138 962 · 203 · 471 688 Reihen | **bestanden** | Stempel +1 h: t fällt auf 5,1–5,4 %; doppelte 23-UTC-Stunde und 10-min-Stempel erkannt |
| V6 | Stichtag: keine Quelle nach R, Schritte = R + Vorlauf, Wahrheitsfenster = Gültigkeitsstunden | 101 Slots | **bestanden** | Quelle 3 h nach R bzw. Tag-0-Stunden −1 h erkannt; Fenster 1 h zu früh erkannt |
| V7 | Wiederholung über fertige Bereiche: 0 Datenbytes; `index.json` = Platte; Bytes je Quelle und Route im Log | 18 Läufe, 101 Slots, 19 Quelle-Routen | **bestanden** (dynamical: 0 Byte Daten, 0,14 MB Katalog beim Öffnen) | 1 übertragenes Byte würde durchfallen |
| V8 | Quellenvermerke im README; jede Ebene mit Werten nennt ≥ 1 Quelle; jeder Stellvertreter im Slot; kein API-Aufruf in 5,6 MB Log | 177 Stufen-Blöcke | **bestanden** | README ohne „MeteoSwiss" fällt durch; Slot ohne Herkunft für t2m erkannt; API-Muster wird gefunden |

### 8.3b Abnahme über das ganze Archiv (23.09.2026, `verify\2026-09-23.json`, Stempel in `index.json`)

**4 314 Slots an 1 216 Tagen (7,24 GiB), Wahrheit 1 217 Tage, Cache 116 985 Dateien / 38,99 GiB.** Alle acht
Prüfungen bestanden: **V1 8 · V2 6 · V3 11 · V4 31 · V5 7 · V6 3 · V7 6 · V8 8** (Pilot: 8/6/9/27/7/3/4/7). Die
vier zusätzlichen V4-Prüfungen und die zwei zusätzlichen in V3/V7/V8 stammen aus V-HC-25 … V-HC-30.

Der Weg dorthin brauchte vier Anläufe, jeder mit einem eigenen Befund (8.5): V7 fiel an der Buchung von
Katalog-Bytes durch (V-HC-24), V3 (a) am Kopf und Code-Stempel der Slots ⇒ Neubau aller 4 314 (V-HC-26), V4 an einer
Schranke, die aus der Eigenbewegung des Archivs genommen werden sollte und dabei die Gegenprobe durchwinkte
(V-HC-25), V8 an seinem eigenen Beispielsatz im Log (V-HC-27), V3 (b) an zwei Fehlern der unabhängigen
Nachrechnung (V-HC-28/29) — und zuletzt an **einem echten Datenfehler im Archiv**, den nur der Zufall der
Stichprobe traf (V-HC-30). Seitdem prüft V3 (b) jeden Slotwert gegen den physikalischen Bereich seiner Größe.

**Was der Stempel nicht sagt:** `codeHash` lautet `911dff6-hindcast-dirty` — die Nacharbeiten vom 23.09. sind
uncommitted. Ein Commit und ein erneuter Neubau machten ihn eindeutig (V-HC-21/26).

### 8.4 V4 — Schatten gegen den echten Cube

**Exakt vergleichbar** (gleiche Quellen auf beiden Seiten; Läufe vor `717cc12` für hModEff/σ_ens ausgenommen, σ_ens
nur an den IFS-ENS-Stunden des Cubes). „Schranke" = ½ Open-Meteo-Speicherschritt + 1 Cube-Schritt (V-HC-5); ohne
Open-Meteo-Speicher (hModEff, σ_ens) = 1 Schritt.

| Stufe | Ebene | Paare | ±1 Schritt | Schranke | in der Schranke | MAE | Läufe |
|---|---|---|---|---|---|---|---|
| t1 | t925 | 88.032 | 36,3 % | 6 | **99,9 %** | 0,024 | 6 |
| t1 | t850 | 102.704 | 54,1 % | 7 | **99,9 %** | 0,015 | 6 |
| t1 | t700 | 102.704 | 43,8 % | 8 | **100,0 %** | 0,019 | 6 |
| t1 | rh925 | 88.032 | 37,1 % | 6 | **99,9 %** | 0,225 | 6 |
| t1 | rh850 | 102.704 | 63,0 % | 6 | **99,8 %** | 0,131 | 6 |
| t1 | rh700 | 102.704 | 57,7 % | 6 | **99,9 %** | 0,144 | 6 |
| t2 | t925 | 69.744 | 55,9 % | 6 | **99,8 %** | 0,015 | 8 |
| t2 | t850 | 69.744 | 51,6 % | 7 | **99,9 %** | 0,017 | 8 |
| t2 | t700 | 69.744 | 42,2 % | 8 | **99,9 %** | 0,021 | 8 |
| t2 | rh925 | 69.744 | 55,4 % | 6 | **99,7 %** | 0,153 | 8 |
| t2 | rh850 | 69.744 | 58,4 % | 6 | **99,7 %** | 0,146 | 8 |
| t2 | rh700 | 69.744 | 50,6 % | 6 | **99,8 %** | 0,171 | 8 |
| t3 | t925 | 72.900 | 47,0 % | 6 | **100,0 %** | 0,018 | 5 |
| t3 | t850 | 90.036 | 43,5 % | 7 | **99,9 %** | 0,020 | 7 |
| t3 | t700 | 72.900 | 34,9 % | 8 | **100,0 %** | 0,025 | 5 |
| t3 | rh925 | 72.900 | 28,3 % | 6 | **100,0 %** | 0,250 | 5 |
| t3 | rh850 | 90.036 | 26,4 % | 6 | **99,9 %** | 0,264 | 7 |
| t3 | rh700 | 72.900 | 27,1 % | 6 | **100,0 %** | 0,278 | 5 |
| t1 | hModEff | 79.380 | 98,1 % | 1 | **98,1 %** | 0,892 | 4 |
| t2 | hModEff | 58.320 | 97,2 % | 1 | **97,2 %** | 0,529 | 6 |
| t3 | hModEff | 72.900 | 95,6 % | 1 | **95,6 %** | 0,440 | 5 |
| t3 | t2m_sd_ens | 1.620 | 99,9 % | 1 | **99,9 %** | 0,002 | 1 |
| t3 | precip_sd_ens | 1.620 | 100,0 % | 1 | **100,0 %** | 0,000 | 1 |
| t3 | u10_sd_ens | 1.620 | 99,9 % | 1 | **99,9 %** | 0,001 | 1 |
| t3 | v10_sd_ens | 1.620 | 100,0 % | 1 | **100,0 %** | 0,001 | 1 |

Gegenprobe (Druckflächen-Temperatur gegen die Hindcast-Zelle des nächsten Punkts): 16,4 % in der Schranke, 3,9 % ±1 Schritt (n 738.508). Ausgenommen (Läufe vor 717cc12): t1 hModEff 2026091418/2026091521; t2 hModEff 2026091412/2026091518; t3 hModEff 2026091400/2026091512; t3 t2m_sd_ens 2026091400/2026091512; t3 precip_sd_ens 2026091400/2026091512; t3 u10_sd_ens 2026091400/2026091512; t3 v10_sd_ens 2026091400/2026091512.

**Nicht exakt vergleichbar** — die gemittelten Ebenen der Lauf-Route gegen den Cube (dem Hindcast fehlen C-LAEF, die EPS-Member, AICON; ICON global auf 0,125° und ICON-CH auf dem gedrehten Gitter statt nativ). Kein Schwellwert, nur benannt:

| Stufe | Ebene | Paare | MAE | Bias (Hindcast − Cube) | im Hindcast fehlt |
|---|---|---|---|---|---|
| t1 | t2m | 102.704 | 0,233 | 0,003 | icon_d2_eps, claef, claef_eps |
| t1 | td2m | 102.704 | 0,326 | 0,124 | icon_d2_eps, claef, claef_eps |
| t1 | u10 | 102.704 | 0,149 | -0,021 | icon_d2_eps, claef, claef_eps |
| t1 | gust | 102.704 | 0,309 | 0,015 | icon_d2_eps, claef, claef_eps |
| t1 | precip | 102.704 | 0,023 | -0,007 | icon_d2_eps, claef, claef_eps |
| t1 | clct | 102.704 | 5,821 | 3,478 | icon_d2_eps, claef, claef_eps |
| t1 | ps | 102.704 | 0,900 | 0,702 | icon_d2_eps, claef, claef_eps |
| t1 | snowlmt | 102.704 | 119,936 | -96,780 | icon_d2_eps, claef, claef_eps |
| t1 | t2m_sd | 88.032 | 0,192 | -0,058 | icon_d2_eps, claef, claef_eps |
| t2 | t2m | 69.744 | 0,287 | -0,006 | icon_eu_eps, aicon |
| t2 | td2m | 69.744 | 0,133 | -0,018 | icon_eu_eps, aicon |
| t2 | u10 | 69.744 | 0,148 | -0,005 | icon_eu_eps, aicon |
| t2 | gust | 69.744 | 0,212 | 0,025 | icon_eu_eps, aicon |
| t2 | precip | 69.744 | 0,008 | 0,003 | icon_eu_eps, aicon |
| t2 | clct | 69.744 | 1,117 | 0,035 | icon_eu_eps, aicon |
| t2 | ps | 69.744 | 2,308 | 0,264 | icon_eu_eps, aicon |
| t2 | snowlmt | 69.744 | 68,120 | -59,551 | icon_eu_eps, aicon |
| t2 | t2m_sd | 69.744 | 0,247 | -0,089 | icon_eu_eps, aicon |
| t3 | t2m | 90.036 | 0,162 | 0,001 | icon_eps_global, aicon, ifs_ens |
| t3 | td2m | 90.036 | 0,037 | -0,005 | icon_eps_global, aicon, ifs_ens |
| t3 | u10 | 90.036 | 0,082 | 0,031 | icon_eps_global, aicon, ifs_ens |
| t3 | gust | 90.036 | 0,028 | 0,001 | icon_eps_global, aicon, ifs_ens |
| t3 | precip | 90.036 | 0,005 | 0,002 | icon_eps_global, aicon, ifs_ens |
| t3 | clct | 90.036 | 0,146 | 0,005 | icon_eps_global, aicon, ifs_ens |
| t3 | ps | 90.036 | 0,990 | 0,423 | icon_eps_global, aicon, ifs_ens |
| t3 | t2m_sd | 90.036 | 0,138 | -0,068 | icon_eps_global, aicon, ifs_ens |

**(a) Stellvertreter IFS-ENS-Kontrolllauf (dynamical, Member 0) gegen IFS 0,25° (Open-Meteo data_run)** — 9 gleiche 00z-Läufe, jede 7. ECMWF-Zelle:

| Größe | 0–48 h | 51–120 h | 126–240 h | 246–360 h |
|---|---|---|---|---|
| t2m | MAE 0,025 · Bias -0,001 | MAE 0,024 · Bias 0,001 | MAE 0,023 · Bias 0,000 | MAE 0,022 · Bias 0,000 |
| u10 | MAE 0,026 · Bias 0,000 | MAE 0,026 · Bias 0,000 | MAE 0,026 · Bias -0,001 | MAE 0,026 · Bias 0,001 |
| v10 | MAE 0,025 · Bias 0,000 | MAE 0,025 · Bias 0,000 | MAE 0,026 · Bias 0,000 | MAE 0,026 · Bias 0,000 |
| t850 | MAE 0,032 · Bias 0,000 | MAE 0,032 · Bias 0,000 | MAE 0,033 · Bias 0,000 | MAE 0,032 · Bias 0,001 |
| t925 | MAE 0,033 · Bias -0,001 | MAE 0,032 · Bias 0,000 | MAE 0,033 · Bias -0,001 | MAE 0,032 · Bias 0,000 |
| clct | MAE 0,201 · Bias -0,008 | MAE 0,194 · Bias -0,007 | MAE 0,177 · Bias -0,013 | MAE 0,166 · Bias -0,009 |
| gust | MAE 0,031 · Bias 0,000 | MAE 0,032 · Bias 0,000 | MAE 0,032 · Bias 0,000 | MAE 0,033 · Bias 0,000 |

**(b) dyn-Route (AIFS + IFS-ENS-Kontrolllauf, ICON-EU ab 2026-02-10) gegen den Cube derselben Läufe** — der Unterschied ist die Quellenmenge (Cube t2: 7, t3: 4 Quellen):

| Stufe | Ebene | Paare | MAE | Bias |
|---|---|---|---|---|
| t2 | t2m | 69.744 | 0,887 | -0,026 |
| t2 | td2m | 69.744 | 1,049 | 0,305 |
| t2 | u10 | 69.744 | 0,493 | 0,064 |
| t2 | gust | 69.744 | 1,428 | 0,515 |
| t2 | precip | 69.744 | 0,033 | 0,015 |
| t2 | clct | 69.744 | 16,898 | -1,310 |
| t2 | ps | 69.744 | 6,444 | -2,844 |
| t3 | t2m | 90.036 | 1,022 | -0,150 |
| t3 | td2m | 90.036 | 1,023 | 0,164 |
| t3 | u10 | 90.036 | 0,691 | 0,350 |
| t3 | gust | 90.036 | 2,070 | 0,911 |
| t3 | precip | 90.036 | 0,023 | 0,010 |
| t3 | clct | 90.036 | 15,860 | 4,971 |
| t3 | ps | 90.036 | 1,737 | 0,066 |

**(c) Tag-0-Reihe gegen den vollen Lauf derselben Gültigkeitsstunde** (2026-09-14 … 2026-09-18, 20 Zellen je Stunde, Gleichheit der int16-Werte; Vorlauf = Stunde − Init des ersten gleichen Laufs):

| Modell | Größe | Stunden | Treffer je Vorlauf |
|---|---|---|---|
| dwd_icon_d2 | temperature_2m | 118 | 0 h: 40, 1 h: 39, 2 h: 39 |
| dwd_icon_d2 | precipitation | 118 | ohne: 1, 1 h: 39, 2 h: 39, 3 h: 39 |
| dwd_icon_d2 | wind_u_component_10m | 118 | 0 h: 40, 1 h: 39, 2 h: 39 |
| dwd_icon_eu | temperature_2m | 118 | 0 h: 40, 1 h: 39, 2 h: 39 |
| dwd_icon_eu | precipitation | 118 | ohne: 1, 1 h: 39, 2 h: 39, 3 h: 39 |
| dwd_icon_eu | wind_u_component_10m | 118 | 0 h: 40, 1 h: 39, 2 h: 39 |
| ecmwf_ifs025 | temperature_2m | 40 | 0 h: 20, 3 h: 20 |
| ecmwf_ifs025 | precipitation | 40 | ohne: 1, 3 h: 20, 6 h: 19 |
| ecmwf_ifs025 | wind_u_component_10m | 40 | 0 h: 20, 3 h: 20 |
| ecmwf_aifs025_single | temperature_2m | 20 | 0 h: 20 |
| ecmwf_aifs025_single | precipitation | 20 | ohne: 1, 6 h: 19 |
| ecmwf_aifs025_single | wind_u_component_10m | 20 | 0 h: 20 |
| meteoswiss_icon_ch1 | temperature_2m | 107 | 0 h: 34, 1 h: 33, 2 h: 33, 3 h: 1, 4 h: 1, 5 h: 1, 6 h: 1, 7 h: 1, 8 h: 1, 9 h: 1 |
| meteoswiss_icon_ch1 | precipitation | 107 | ohne: 2, 1 h: 33, 2 h: 33, 3 h: 33, 4 h: 1, 5 h: 1, 6 h: 1, 7 h: 1, 8 h: 1, 9 h: 1 |
| meteoswiss_icon_ch1 | wind_u_component_10m | 107 | 0 h: 34, 1 h: 33, 2 h: 33, 3 h: 1, 4 h: 1, 5 h: 1, 6 h: 1, 7 h: 1, 8 h: 1, 9 h: 1 |

### 8.5 Befunde V-HC-1 … V-HC-30

Jeder Befund mit Mehrwert (für Jan) und Umsetzung bzw. Skizze. „behoben" heißt: im Code dieser Etappe, am Pilot belegt.

| # | Befund | Mehrwert / Wirkung | Stand |
|---|---|---|---|
| V-HC-1 | Der Producer liest reguläre Gitter als Blockmittel mit Füllung, nicht „nächste Quellzelle" (Kickoff-Satz). | Hindcast-Werte sind die Werte, die der Cube an derselben Zelle gerechnet hätte | umgesetzt (`lib/grids.mjs`), V2 |
| V-HC-2 | Wertabhängige Lücken (z. B. maskierte Schneefallgrenze trockener Zellen, `fillNearest` über NaN) bildet der Hindcast nicht nach; Open-Meteos `snowfall_height` ist nicht DWDs SNOWLMT (V4: t1 −97 m Bias, t2 −60 m). | `snowlmt` aus dem Hindcast nicht für σ_sys verwenden | benannt; Skizze: Ebene im Fallbau ausschließen |
| V-HC-3 | ICON-CH liegt bei Open-Meteo auf einem gedrehten Gitter mit Nächster-Nachbar-Zuordnung der Dreiecke; die Zelle wird über die Orographie der hmodel-Spalte gewählt (683/901 bzw. 608/828), sonst der nächste gedrehte Punkt. | ICON-CH trägt am Punkt die Werte des richtigen Dreiecks, wo belegbar | umgesetzt, Stellvertreter im Slot benannt |
| V-HC-4 | ICON-EU 03/09/15/21 UTC: Registry 48 h, Open-Meteo 30 h, der Live-Cube las 28 Schritte; die Laufwahl (`LAG_H`) reproduziert jede Wahl des Live-Cubes vom 14.–17.09. | gleiche Quelle-Läufe wie das Produkt | umgesetzt |
| V-HC-5 | **Open-Meteo speichert int16 × scale_factor**: Druckflächen-Temperatur 9,14/8,29/6,57 je K (0,11/0,12/0,15 K), Feuchte 1 % (700 hPa 1,11 %), Schneefallgrenze 10 m, t2m 0,05 K, Wind 0,1 m/s. Das „±1 Cube-Schritt" des Kickoffs ist auf dem S3-Weg unerreichbar (26–63 %). | V4 prüft die Schranke ½·Speicherschritt + 1 Cube-Schritt (6–8 Schritte), berichtet ±1 daneben; für Γ-Fits zwischen 850/700 hPa ≈ 0,07 K/km Rundungsrauschen | umgesetzt (`shadow.mjs`) |
| V-HC-6 | Die Druckflächen kommen im Cube je Stufe nur aus bestimmten Quellen (t1 ICON-D2/ICON-EU/IFS/AIFS, t2 ICON-EU/IFS/AIFS, t3 IFS/AIFS — `provenance.pressure` der Archiv-Slots); der Hindcast mischte ICON global ein. | V4 t2/t3 Druckflächen 5–35 % → 99,7–100 % in der Schranke | **behoben** (`PRESSURE_SOURCES`) |
| V-HC-7 | Producer-Commit `717cc12` (16.09. 05:40 UTC, E-E-5/V-PD-57) änderte die hModEff-Regel und die ENS-Statistik; die Archiv-Slots 14./15.09. sind darin nicht vergleichbar (hModEff 10–46 % gegen 97–100 % danach). | der Hindcast bildet die heutige Regel nach; V4 nimmt die Läufe davor aus und nennt sie | umgesetzt (`RULE_CHANGE_MS`) |
| V-HC-8 | t3-σ_ens: der Cube nimmt es je Stunde aus EINER Quelle (144/168 h ICON-EPS global — nirgends frei —, ab 192 h IFS ENS auf dem 48-h-Raster); der Hindcast schreibt IFS-ENS-σ an jeder t3-Stunde. | mehr Fälle für c(p,f); cube-treu nur `ensemble.ifsEnsRasterHours` > 180 h (V4 dort 99,9–100 %) | umgesetzt, im Slot erklärt |
| V-HC-9 | dyn-Route veröffentlichte bei max(Quellläufe) = R − 6 h (vor ICON-EU 02/2026 keine Quelle mit Versatz 0) — die ganze Vorlaufachse lag 6 h zu früh (V4 t2 t2m MAE 3,8 K). | Vorlauf = ab R wie im Cube | **behoben** (publish = R; MAE 0,89 K) |
| V-HC-10 | Tag-0-/dyn-Slots im data_run-Fenster überschrieben Lauf-Slots (ein Pfad je R): Testslot 10.08., 52 Slots 01.–13.09.; die Wahl hing davon ab, was der Cache gerade hielt. | Route hängt am Datum (`RUN_WINDOW_FROM` 2026-06-17); **Vollständigkeitswächter**: ein Slot wird nur geschrieben, wenn jeder erwartete Speicher den Tag des benötigten Laufs gezogen hat | **behoben** |
| V-HC-11 | Der data_run-Pilot der ersten Sitzung deckte nur 14.–19.09.; 01.–13.09. fehlte (A/B enden am 31.08.). | Lücke geschlossen | Kette `dr-C` |
| V-HC-12 | Hintergrund-Pulls starben mit der Sitzung (09:17 UTC) und losgelöste Git-Bash-Ketten mehrfach still (Log endet bei START; frühere Logs „fork: retry … 0xC000026B"); der dynamical-Extraktor zählte keine Bytes; der Rechner schlief 8 h. | `detach.ps1` (WMI, `-Shell cmd`), `queue.mjs` (Node startet Python direkt), `watchdog.ps1` (Neustart bis „DONE", hält wach), Byte-Zähler über `zarr.storage.WrapperStore` | **behoben** |
| V-HC-13 | Open-Meteo führt keinen Taupunkt (Magnus a 17,62 / b 243,12 aus t2m + rh, wie der Producer für C-LAEF) und Bodendruck nur für IFS/AIFS bis 05/2025 (sonst aus MSL + HSURF barometrisch). | als Stellvertreter im Slot; V4: t1 td2m +0,12 K Bias, ps +0,7 hPa | benannt |
| V-HC-14 | Open-Meteos HSURF gleicht der hmodel-Spalte nur für ICON-D2; ICON-EU, IFS, AIFS, ICON global tragen eine andere Orographie (p50 0,5–11 m). | ps-Ableitung aus MSL nutzt Open-Meteos HSURF (konsistent mit seinem eigenen ps), hModEff das gepinnte hmodel | benannt, V2-Argmin |
| V-HC-15 | TAWES-Historie (`tawes-v1-10min`) beginnt erst 2026-06-19; davor `klima-v2-10min` mit **td = Magnus** (gegen TAWES td nur 4 % gleich, 62 % ≤ 0,1 K; p 39 % gleich, 96 % ≤ 0,2 hPa). | AT-td und -p vor 19.06.2026 sind abgeleitet — im Fit als eigene Schicht oder td weglassen | benannt (`truth/stations.json`) |
| V-HC-16 | POI (Archiv) und CDC sind zwei Produkte derselben Station: Wind in ganzen km/h, Bewölkung in Achteln, dd 0 ↔ 360; die Archiv-Slots Schema 1 tragen die PA3-Defekte (SMN t 98 %). | V5 in Klassen: gleicher Strom ziffergleich, Produkt innerhalb Rundung | umgesetzt |
| V-HC-17 | IGRA2 an den DACH-Stationen: keine relative Feuchte (nur Taupunktdifferenz), Lindenberg führt an 2 588/17 976 signifikanten Flächen eine Höhe. | φ aus t/td/p rechnen, Höhe hydrostatisch | für die Fit-Sitzung |
| V-HC-18 | dynamical.org meldet am alten Zarr-Endpunkt `Sunset: 2026-10-01` (Migration 2026). | der Extraktor nutzt bereits Icechunk v2 | benannt |
| V-HC-19 | IFS-ENS-Kontrolllauf (dynamical) gegen IFS 0,25° (Open-Meteo) am selben 00z-Lauf: MAE 0,022 K (t2m), 0,03 K (850/925), 0,026 m/s (Wind), 0,2 % (clct), Bias 0 über 0–360 h. | **der Stellvertreter ist brauchbar** (seit Cy48r1 ist der Kontrolllauf praktisch der HRES) | V4 (a) |
| V-HC-20 | Tag-0-Reihe = Lauf floor(Stunde, Takt): ICON-D2/EU Vorlauf 0–2 h (Niederschlag 1–3 h), IFS 0/3 h (3/6 h), AIFS 0 h (6 h), ICON-CH1 0–2 h mit einzelnen Lücken bis 9 h. | die Tag-0-Annahme ist am Überlapp gemessen (100 % der 118 Stunden ICON) | V4 (c) |
| V-HC-21 | `codeHash` der Slots ist `git rev-parse --short HEAD` + `-hindcast-dirty` — er nennt den Code-Stand nicht, solange `scripts/hindcast/` uncommitted ist. | Skizze: Inhalts-Hash der slot-relevanten Dateien in einen neuen Kopf `builder` (erst mit dem nächsten Neubau, sonst bricht V3 (a)) | offen |
| V-HC-22 | Die 16 Nachbarpunkte (DK, NL, LU, CZ, SK) haben keine freie stündliche Wahrheit in den zugelassenen Quellen. | im Fit nur Cube-Seite | benannt |
| V-HC-23 | Alte Open-Meteo-Chunks (vor ≈ 02/2025) liegen **flach** als `(ny·nx, nt)` statt `(ny, nx, nt)`; der Leser kannte nur die neue Form und warf `IndexError` für jeden Monat vor 2025-02. Die Kette lief 11 Neustarts lang leer (19.09. 22 UTC – 20.09. 08 UTC). | Leser beherrscht beide Formen (`flat`, `sel()`, `col()`), auch im `--check`-Direktvergleich; 10/2024 nachgeprüft: 14 Chunks, 0 Fehlschläge, Direktvergleich gleich | **behoben** (`extract_openmeteo.py`) |
| V-HC-24 | V7 fiel am vollen Archiv durch: die Wiederholung des Wahrheits-Extraktors übertrug 5,6 MB. Ursache **nicht** fehlende Wiederaufnahme, sondern Buchung — CDC-Stationslisten (7 × ≈ 0,76 MB, täglich neu veröffentlicht), CDC-Verzeichnislisting und GeoSphere-Datensatz-Metadaten zählten als Datenbytes. Im selben Lauf: 0 Stationsmonate gebaut, 0 Tage geschrieben, 31 Tage als final übersprungen. | Katalog-Abrufe zählen als `metaBytes` wie der Icechunk-Katalog des dynamical-Extraktors; V7 fordert 0 Datenbytes **und** 0 gebaute Datensätze **und** 0 geschriebene Tage, weist Katalog-Bytes getrennt aus; Gegenproben für beide Richtungen | **behoben** (`truthHist.mjs`, `rerun-check.mjs`, V7) |
| V-HC-25 | **hModEff wird gegen eine bewegliche Referenz gemessen.** Der Archivwert am selben (Punkt, Vorlaufstunde) unterscheidet sich zwischen Läufen um p50 2–8, max 218–411 Cube-Schritte — hModEff ist das Mittel über die BEITRAGENDEN Quellen, und die Zusammensetzung wechselt je Lauf (16.09. t1 ohne ICON-CH1, 17.09. mit). Eine Schranke aus dieser Spanne ist wertlos: die Gegenprobe (Zelle des Nachbarpunkts) ginge bei t1/t2 zu 100 % durch. | verglichen wird nur, wo der Archivwert über alle Läufe stillsteht (t1 38,8 %, t2 8,7 %, t3 3,2 % der Paare) — dort **100 % innerhalb ±1 Schritt** bei MAE 0,06–0,26, Gegenprobe 3,6/1,6/9,1 %; die Beweglichkeit steht als Zahl im Bericht | **behoben** (`shadow.mjs`, V4 31 statt 27 Prüfungen) |
| V-HC-26 | Slots vom 20.09. ließen sich nicht byte-gleich nachbauen: `scales.truth` bekam einen Eintrag `ps` (die Tabelle liegt in `scripts/punktarchiv/lib/punktarchiv.mjs`, also in der AP9-Linie, die sich unter dem Hindcast ändert), und `codeHash` wechselte mit Jans Commit der Hindcast-Skripte (22.09., `911dff6`). Werte unberührt. | alle 4 314 Slots einmal mit `--force` neu (Kette `rebuild`, ≈ 2,6 s/Slot, 3,5 h) ⇒ ein Code-Stempel und ein Kopf im ganzen Archiv; V3 (a) danach 3/3 byte-gleich. Damit ist V-HC-21 halb erledigt: der Stempel nennt jetzt einen echten Commit, bis zum Commit der Nacharbeiten mit Zusatz `-hindcast-dirty` | **behoben** |
| V-HC-27 | V8 vergiftete seinen eigenen Beweis: der Name der Gegenprobe enthielt den verbotenen API-Host wörtlich, die Kette schrieb ihn ins Log, und der nächste V8-Lauf fand ihn dort (1 Treffer in 35,2 MB, Ursprung: Abnahme vom 20.09.). | Prüfnamen nennen keinen Host mehr (nur der Ausdruck selbst), die Suche lässt eigene Zeilen aus — mit Gegenprobe, dass der Filter einen ECHTEN Aufruf stehen lässt | **behoben** |
| V-HC-28 | V3 (b) fand 16 von 109 907 Stichproben daneben, alle bei `ps`, bis 4,2 hPa (dazu 17 von 74 912 bei σ_div, dieselben Punkte); die Ausreißer lagen am 14.05. und 06.06.2025, an der Kante, an der Open-Meteos Bodendruck-Abdeckung endet. Ursache: `lib/recompute.mjs` wählte die ps-Grundlage **je Zelle**, `build-slots.mjs` je (Quelle, **Zeitschritt**) — es löst einen Spaltenleser je Schritt auf (`accessorsFor`) und leitet nur ab, wenn es keinen gibt. Wo die Abdeckung im Block geteilt ist, mischte die Nachrechnung gespeicherten und abgeleiteten Druck in EINEM Blockmittel. Ein Zwischenversuch „je Quell-Lauf" (`sr.has`) machte es schlimmer (290 Ausreißer), weil `has` nur das Verzeichnis prüft. | Regel je (Quelle, Schritt) wie im Slot-Bauer, Zellen ohne gespeicherten Wert fallen heraus; an beiden Grenztagen 32 804/32 804 bei 25-fach dichterer Stichprobe. Die Slots blieben unverändert — der Prüfer war falsch, nicht das Archiv. Fehlermeldung nennt jetzt Slot, Zeitpunkt und beide Werte | **behoben** (`recompute.mjs`) |
| V-HC-29 | `recompute.mjs` rechnete die Chunk-Nummer der Tag-0-Reihe aus einer **je Modell** fest verdrahteten Chunk-Länge; sie steht aber je **Variable** im Dateikopf (`chunkSeconds`). Für Variablen mit anderer Länge zeigte die Rechnung auf den falschen oder keinen Chunk. | Länge je (Modell, Variable) aus einem Chunk-Kopf gelesen, wie `store.mjs` es tut | **behoben** (beim Suchen von V-HC-28 gefunden) |
| V-HC-30 | **Ein kaputter Quellwert stand ungeprüft im Archiv.** Open-Meteos Tag-0-Reihe von AIFS führt die Bewölkung vom 21.–29.11.2025 auf einer 0…10000-Skala (`chunk_1134`, `scale` 1 wie überall sonst ⇒ kein Lesefehler). Der Slot-Bauer prüfte keine physikalischen Grenzen und mittelte 9 996 % mit drei gesunden Quellen zu **2 573,7 % Bewölkung**; σ_div lief über den Ebenenbereich und wurde MISSING — daran fiel es V3 (b) auf. Betroffen: 29 290 Werte (1,47 % der Variablen), 9 Tag-0-Slots. Ein Scan des ganzen Caches (26 Größen, 7 Modelle, beide Routen) fand **nur diesen einen Fleck**; RH > 100 % (ECMWF −7…129: Übersättigung, spektrales Ringing) und negative Schneefallgrenzen (Grenze unter NN) sind dagegen legitime Modellausgaben und werden NICHT beschnitten. | Plausibilitätsgrenze **nur für Bewölkung** (0…100 % ist die Definition der Größe) in `build-slots.mjs` UND `recompute.mjs`; Werte außerhalb zählen wie abwesend, `srcCount` nennt dann 3 statt 4. **Nicht** durch 100 geteilt — was die Quelle meinte, ist unbekannt, eine falsche Annahme wanderte still in den Fit. Neue Dauerprüfung V3 (b) „jeder Slotwert im physikalischen Bereich" über ALLE Slots (2,96 Mio. Werte) mit Gegenprobe; 44 Slots neu gebaut | **behoben** |

### 8.6 Entscheidungen für Jan (E-F-26 … E-F-30)

- **E-F-26 (entschieden 23.09.2026 = E-FL-3: nicht jetzt; Winter 7–48 h aus Archiv + Folgekette ab Dezember):** Open-Meteo-API kommerziell (≈ 99 €/Monat laut Doku) für die Lücken des S3-Wegs?
  Erreichbare Tage je Fit-Bin (Tabelle 8.7). Der S3/dynamical-Weg deckt die Bins 0–6 h (1 215 Tage, drei Winter),
  51–120 h und 126–336 h (≈ 900 Tage, zwei Winter) — aber **7–24 h und 25–48 h nur mit den 95 Sommertagen des
  data_run-Fensters, kein Winter**. Die API schlösse das: `previous-runs-api` (`_previous_day1/2`, ab 2024-01-19) gibt
  Vorläufe 24–27 h und 48–51 h für ≈ 970 Tage mit zwei Wintern (nicht die Mitte 7–23 h); `single-runs-api` (alle
  Modelle ab 2026-04-02) gäbe 76 zusätzliche Frühlingstage mit allen Vorläufen. Empfehlung: **nicht jetzt** — die
  Bins 7–48 h reifen im eigenen Archiv ab 14.10./28.10., und der Winter 2026/27 kommt dort ohnehin; die API lohnt nur,
  wenn σ_sys für 7–48 h im Winter vor Januar 2027 gebraucht wird.
- **E-F-27 (Annahme des Kickoffs, umgesetzt):** Python nur für die Leser (`requirements.txt`, venv 3.12); Node schreibt
  die Slots. Bestätigen.
- **E-F-28 (Vollform-Linie):** Feld `source` in der Fit-Registry (`calibFit.ts`) — der Hindcast markiert außerhalb von
  `src/` (Slot-Kopf `kind: hindcast/slot`, `provenance.class: hindcast`); der Leser `slotio.mjs` weist Archiv-Slots ab
  und umgekehrt.
- **E-F-29 (Setzung dieser Etappe):** Im data_run-Fenster (ab 17.06.2026) gibt es nur Lauf-Slots, keine Tag-0-Slots —
  die Tag-0-Information steckt dort in den ersten Stunden der Läufe (mit exaktem Vorlauf). Eine durchgehende
  Tag-0-Reihe 2023–2026 (für eine homogene 0–6-h-Schicht) wäre ein eigener Pfad `slots-day0\`. Empfehlung: so lassen.
- **E-F-30 (Setzung):** t3-σ_ens an jeder Stunde aus IFS ENS (nicht nur auf dem 48-h-Raster des Cubes, V-HC-8).
  Empfehlung: so lassen, der Fallbau filtert bei Bedarf.

### 8.7 Erreichbare Fälle je Fit-Bin (Grundlage für E-F-26)

Tage mit Hindcast-Vorhersage je `CALIB_BINS_H`-Bin, sobald die Hintergrundläufe fertig sind; Winter = Dez–Feb;
Punkt-Tage = Tage × 389 Punkte mit Wahrheit (DE 203, AT 84, CH/LI 102 — vor Abzug der Wahrheitslücken, 2026-08/09
je Netz 95–99,9 % der Stunden belegt). `CALIB_N_MIN` σ_sys verlangt n ≥ 1 000 und ≥ 30 Tage — jeder Bin erreicht
das, die Frage ist die **Jahreszeit**.

| Bin | Weg im Hindcast | Tage | Winter | Punkt-Tage | mit E-F-26 (API) zusätzlich |
|---|---|---|---|---|---|
| 0–6 h | Tag 0 2023-05-24 … 2026-06-16 + Lauf 2026-06-17 … 09-19 | 1 215 | 271 | 472 635 | — |
| 7–24 h | nur Lauf (data_run) | 95 | **0** | 36 955 | `previous_day1` (Vorlauf 24–27 h) 975 Tage / 222 Winter; `single-runs` 76 Frühlingstage |
| 25–48 h | nur Lauf | 95 | **0** | 36 955 | `previous_day1/2` (25–27 h, 48–51 h) 975 / 222; `single-runs` 76 |
| 51–120 h | dyn 2024-04-02 … 2026-06-16 + Lauf | 901 | 180 | 350 489 | `single-runs` 76 (alle Modelle) |
| 126–240 h | dyn 2024-04-01 … + Lauf | 902 | 180 | 350 878 | `single-runs` 76 |
| 246–336 h | dyn + Lauf | 902 | 180 | 350 878 | `single-runs` 76 |

Die Quellenmenge wechselt mit dem Weg (Tag 0: ICON-D2 + ICON-EU, IFS ab 2024-01-25, AIFS ab 2025-02-05, ICON-CH1 ab
2025-07-01; dyn: AIFS + IFS-ENS-Kontrolllauf, ICON-EU ab 2026-02-10; Lauf: alle sieben) — der Fallbau schichtet nach
`srcCount`/`sources`. c(p,f) nur für t3 (IFS ENS, 902 Tage); t1/t2 haben kein freies Ensemble-Archiv.

### 8.8 Hintergrundläufe und Wiederaufnahme

Alle langen Läufe sind Ketten von `queue.mjs`, gestartet und bewacht von `watchdog.ps1` (losgelöst über
`detach.ps1`, Priorität BelowNormal; der Wachhund startet eine Kette neu, bis ihr Log `DONE <modus>` trägt, und hält
den Rechner wach). Liste in `C:\dev\buscosun-hindcast\log\chains.json`, Logs `log\pull-<name>.log`, Neustarts in
`log\watchdog.log`.

| Kette | Inhalt | Abhängigkeit |
|---|---|---|
| `dr-A`, `dr-B`, `dr-C` | data_run 2026-06-21 … 07-25, 07-26 … 08-31, 09-01 … 09-13 (06-17 … 06-20 und 09-14 … 09-19 liegen schon) | — (**läuft aus**: die Front stand am 19.09. bei 2026-06-17) |
| `full-dyn` | IFS ENS + AIFS 2026-07 … 2024-04, ICON-EU 2026-07 … 2026-02 (neuester Monat zuerst) | — |
| `full-series` | Tag-0-Reihe 2026-05 … 2023-05, fünf Modelle | — |
| `runslots` | Slots 2026-06-17 … 2026-09-13 (Lauf-Route) | `dr-*` fertig und dyn 2026-06 |
| `preslots` | Slots 2023-05-24 … 2026-06-16, 00/06/12/18 UTC (Tag 0 + dyn) | `full-dyn` und `full-series` fertig |
| `truth-full` (Einzeljob) | Wahrheit 2023-05-24 … 2026-07-31 + IGRA2 | — ; bei Abbruch: `{"name":"truth-full2","mode":"truth","args":"2023-05-24 2026-07-31"}` in `chains.json` eintragen |
| `accept` | Abnahme V1–V8 über das ganze Archiv: Archiv-Klon `git pull`, rerun-check, shadow, truth `--verify` (Abdeckung 2023-05 … heute), index, verify-hindcast — **stempelt `index.json`** | alle anderen Ketten `DONE` und `truth-full` beendet |

**Folgekette `follow <von> <bis>` (der wachsende Rand; `queue.mjs:98–115`, nachgetragen 23.09. — CLAUDE.md zitierte sie,
der Text fehlte hier, V-FL-2):** je Tag im Bereich (1) `extract_openmeteo.py --route run` für die sieben Modelle
(`dwd_icon_d2`, `dwd_icon_eu`, `meteoswiss_icon_ch1`, `meteoswiss_icon_ch2`, `dwd_icon`, `ecmwf_ifs025`,
`ecmwf_aifs025_single`); (2) `extract_dynamical.py --ds ifs-ens` über den Bereich (t3-σ_ens auch im Lauf-Fenster, V-HC-8 —
ohne ihn überspringt der Vollständigkeitswächter die 00/12-UTC-t3-Slots); bei einem Fehlschlag kein Slot-Bau, der Wachhund
startet die Kette neu; (3) `extract_truth.mjs --from --to`; (4) `build-slots.mjs --from --to`. Die `data_run`-Frist ist ≈ 3
Monate: ein Tag, der nicht in dieser Zeit gezogen wird, ist für die Lauf-Route verloren. Die Kette läuft täglich auf Jans
Maschine, damit die Winterlücke 7–48 h sich schließt (E-FL-3, FL-AP7).

**Wiederaufnahme nach Neustart des Rechners:**
`powershell -File scripts\hindcast\detach.ps1 -Name watchdog -Shell cmd -Priority Normal -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\hindcast\watchdog.ps1"`
— er liest `chains.json` und startet, was nicht `DONE` ist. Danach Abnahme wie in `scripts/hindcast/README.md`
(rerun-check → shadow → truth `--verify` → index → verify-hindcast ohne `--only`), die `index.json` stempelt.

### 8.9 Was die nächste Sitzung (Fälle + Fit) braucht

1. **Fallbau aus den Slots** (`slotio.mjs` lesen, nie Archiv und Hindcast mischen — E-F-23/E-F-28): je (Punkt, Stufe,
   Schritt, Größe) Vorhersage aus `cube.<t>.byPoint[id].planes` (nächste Zelle, 57 Ebenen) und die drei Nachbarn
   (31 PAP-3-Ebenen) für L_d/L_h/κ-λ; Wahrheit aus `truth\<Tag>.json.gz` am **Stempel = Gültigkeitsstunde**
   (`byPoint[id].cdc|tawes|smn`, TRUTH_SCALES); CDC `fxh = fx`, TAWES/SMN `rr1h` = Sechsersumme.
2. **Vorlauf:** Lauf-Route und dyn: `leadHours` ab `runAt` (= Slotzeit R, V-HC-9). Tag 0: nur ein Intervall je Quelle
   (`leads[].cadenceH`; gemessen V-HC-20: ICON-D2/EU/CH1 0–2 h, IFS 0 oder 3 h, AIFS 0 h; Niederschlag der
   ICON-Familie 1–3 h, IFS 3/6 h, AIFS 6 h) — alles in Bin 0–6 h.
3. **PAP 3–5 auf dem Hindcast-Member:** `SigmaCase.mu` ist das Member NACH PAP 3–5. Die Profilebenen
   (gammaEff/zBase/zInv/dTInv) fehlen im Hindcast überall ⇒ PAP 4 läuft im Fallbau wie ohne Profil
   (Standard-Lapse/Druckflächen-Ersatz) — dieselbe Regel wie im Produkt ohne Profil, im Fall zu kennzeichnen.
4. **Nicht verwenden bzw. schichten:** `snowlmt` (V-HC-2), AT-td/p vor 2026-06-19 (V-HC-15), `ps` der ICON-Familie
   (abgeleitet, V-HC-13), Nachbarpunkte (V-HC-22); σ_ens nur t3 (V-HC-8).
5. **Registry-Feld `source`** (E-F-28, Vollform-Linie) und Provenienzklasse `hindcast` in `calibDoc.ts`, bevor ein
   Fit geschrieben wird.
6. **Abnahme-Stempel prüfen:** `index.json` → `verification` muss die volle Abnahme nach dem Ende aller Ketten
   tragen; bis dahin gilt die Pilot-Abnahme (8.3).

**Stand 23.09.2026:** Die Sitzung „Fälle + Fit" ist die Lernphase FL (`audit/fusion-lernphase.md`): Fallbau
`scripts/fusionfit/build-cases.mjs` (§5 dort), Fit `fit.mjs`, Scorer `score.mjs`; Einzelquellen je Zelle kommen aus dem
Cache über die producer-treuen Leser (`build-slots.mjs`, nur zusätzlich exportiert) mit Gegenprobe `recompute.mjs`.
Punkte 1–6 gelten unverändert; dazu: Stunde 0 der Tag-0-Slots (validAt = slotAt) fällt aus den Fällen; Provenienz
`hindcast` in `calibDoc.ts` ist FL-AP1.
