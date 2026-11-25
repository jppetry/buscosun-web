# Phase GM — mehr Wahrheit für das Schneemodell am Gletscher (Quellengruppe A), Recherche 25.11.2026

> Reine Recherche. Kein Code, nichts in einem Repo außer dieser Datei, niemand kontaktiert. §4 von `audit/gletscher-schneemodell.md`
> ist **nicht** geändert: die neuen Einträge unten tragen Vorschlagsnummern **Q24 … Q35**, die Jan vor der Übernahme prüft.
> Form der Einträge wie §4 (Nr., Quelle, Wofür, Stand, Lizenz) und wie `audit/gletscher/licences.md` (Wortlaut, Fundstelle, Ampel).

**Warum:** Die Grenze des Modells ist nicht der Antrieb, sondern die Wahrheit, gegen die es geprüft werden kann — 43 Gletscher mit
gemessener Winterbilanz je Höhenstufe, davon nur 8 in Österreich und keiner in Deutschland (`scripts/glacier/snow-calibration-glaciers.json`).

## 0. Wie gelesen wurde

- **[lokal]** = in der Kopie gelesen, die schon im Cache liegt: WGMS FoG 2026-02-10 unter `C:\dev\buscosun-glacier-cache\raw\wgms\x\data\`
  (`mass_balance.csv`, `mass_balance_band.csv`, `mass_balance_point.csv`, `glacier.csv`, Dateidatum 23.02.2026), GLAMOS-Release 2025 unter
  `…\raw\glamos\`, Katalog `…\sgi2023\pkg\static\20261120-1\catalog.json` (2 094 Gletscher: AT 799, CH 1 291, DE 4).
- **[gelesen: URL]** = am 25.11.2026 an der Primärquelle gelesen (Landingpage, Metadaten, README, Kopfzeile). Geladen wurden nur
  Stichproben: Kopf und Inhaltsverzeichnis von Zip-Dateien per Range-Abruf (≤ 70 KB), PANGAEA-Textdateien von wenigen KB, DWD-Zips
  40 KB / 8 KB, eine PANGAEA-Flugdatentabelle, das Massenbilanz-Zip GLAMOS Release 2026 (506 KB, nur die Kopfzeilen gelesen).
  Kein vollständiger Datensatz. Werkzeuge und Stichproben liegen nur im Scratchpad der Sitzung.
- **[nicht geprüft]** = gesucht, aber an der Primärquelle nicht gelesen (Seite nicht erreichbar, Datei zu groß, Lizenzseite 404).
- Zwei Versuche sind **nicht** gemacht: eine nur lesende SQL-Abfrage an die Echtzeit-Datenbank des WGMS (`db.wgms.ch`, öffentlicher
  Lesezugang) hat das Berechtigungssystem dieser Sitzung abgelehnt; ich habe sie nicht umgangen. `bayerische-gletscher.de` scheiterte am
  TLS-Handshake.
- Lizenzwortlaute stehen in der Originalsprache in „…“. Wo zwei Stellen sich widersprechen, stehen beide da — nicht aufgelöst.

---

## 1. WGMS Fluctuations of Glaciers (Q19) — Österreich und Deutschland mit Winterbilanz

### 1.1 Version, Takt, Lizenz

| Punkt | Befund | Beleg |
|---|---|---|
| Neueste Version | **2026-02-10 ist die aktuelle**, DOI 10.5904/wgms-fog-2026-02-10, „Release date: 2026-02-10“; keine neuere FoG-DOI unter dem Präfix 10.5904 | [gelesen: https://wgms.ch/data_databaseversions/] (Fußzeile „last change 25/02/2026“), [gelesen: https://api.datacite.org/dois?prefix=10.5904&sort=-created] |
| Änderungen in 2026-02-10 | u. a. „Add mass_balance_point columns method and time_system.“; in 2025-02b „Fix column mass_balance_point.longitude, whose values were all equal to latitude.“ — keine Aussage zu österreichischen oder deutschen Reihen | [gelesen: https://wgms.ch/downloads/WGMS_DOI_2026-02-10.pdf] |
| Daneben | eine laufend aktualisierte Datenbank: „Browse the full relational database in real time … at dbgate.wgms.ch“, mit „Note that real-time data lacks a version or DOI“ (Seite geändert 28/10/2026). **Ob dort schon neue Winter- oder Banddaten liegen: nicht geprüft** (Abfrage abgelehnt, s. §0) | [gelesen: https://wgms.ch/data-exploration/] |
| FoG-Browser | Die CSV-Dateien je Gletscher (`https://wgms.ch/data/min-data-series/FoG_MB_<id>.csv`) stammen aus 2026-02-10 und tragen nur die gletscherweite Tabelle; für Vernagt (489), Kesselwand (507), Stubacher Sonnblick (573), Pasterze (566), Wurten (545), Zettalunitz/Mullwitz (578), Venediger (10460) und Schneeferner N (346) **dieselben Jahre wie unsere Kopie** | [gelesen: z. B. https://wgms.ch/data/min-data-series/FoG_MB_489.csv] |
| Takt | „A corresponding call-for-data is annually sent out …“, „Next deadline for data submission: Dec 1, 2026.“; „Snapshots of the database are published with an associated digital object identifier (DOI) at least annually.“ Bisherige Versionen 2023-09, 2024-01, 2025-02, 2025-02b, 2026-02-10. **Meine Folgerung, nicht WGMS:** die nächste Version mit dem Winter 2025/26 kommt frühestens im ersten Quartal 2027 | [gelesen: https://wgms.ch/data_submission/], [gelesen: https://wgms.ch/data-exploration/] |
| Lizenz, Datenrichtlinie | „All data submitted to the WGMS are considered public domain and are made digitally available (near-real time) through the operational services at no cost. Thus, WGMS data are open access under the requirement of correct citation (see database version), which corresponds to a CC BY 4.0 license by Creative Commons.“ · „The use of data and information from WGMS requires acknowledgement of the WGMS and/or the original investigators and sponsoring agencies according to the available meta-information.“ (Fußzeile „last change 12/06/2023“) | [gelesen: https://wgms.ch/data_policy/] |
| Lizenz, andere Stellen | Seite „data exploration“: „The data are distributed under the Creative Commons Attribution 4.0 license (see our data policy), meaning you are free to use and build upon the data as long as you cite the WGMS and (if using a subset) the original source(s).“ · Versionsseite: „Rights: Open access under the requirement of correct citation“ · Metadaten-PDF: „usageTerms Open access under the requirement of correct citation“ · Kopf der Browser-CSV: „Please cite the World Glacier Monitoring Service (WGMS) as below and/or the original sources listed in columns `investigators`; `agencies`; and `references`.“ · **DataCite führt für 2026-02-10 keine Lizenz** (nur für 2024-01: „Creative Commons Attribution 4.0 International“) | wie oben; [gelesen: https://api.datacite.org/dois?prefix=10.5904] |
| Kommerzielle Nutzung | Auf keiner gelesenen WGMS-Seite steht „commercial“ oder „non-commercial“; die Seitensuche `https://wgms.ch/?s=commercial` meldet „Nothing Found“. Nach dem Wortlaut CC BY 4.0 gedeckt, auch mit Werbung. Bulletin-PDFs nicht gelesen | [gelesen: https://wgms.ch/?s=commercial] |
| Zitat | „WGMS (2026): Fluctuations of Glaciers (FoG) Database. World Glacier Monitoring Service (WGMS), Zurich, Switzerland. https://doi.org/10.5904/wgms-fog-2026-02-10“, dazu je Reihe `investigators` / `agencies` / `references` | [gelesen: https://wgms.ch/data_databaseversions/] |

### 1.2 Alle österreichischen und deutschen Gletscher in FoG 2026-02-10 [lokal]

Spalten: Jahresbilanz; **Winter gletscherweit** (`mass_balance.winter_balance`); **Winter je Höhenstufe** (`mass_balance_band.winter_balance`);
Stufen-Winter im Fenster der Eichung (hydrologische Jahre 2012–2025); Winter-**Punktwerte** (`mass_balance_point`, `balance_code = winter`).

| WGMS-ID | Name in FoG | Jahresbilanz | Winter gletscherweit | Winter je Stufe | Stufen 2012–25 | Winter-Punkte | Unter unseren 8? |
|---|---|---|---|---|---|---|---|
| 480 | JAMTAL F. | 37: 1989–2025 | 37: 1989–2025 | 37: 1989–2025 | 14 | 262 (2020, 2021, 2025) | **ja** (13 Winter; 2012 unbrauchbar, 71 % Niederschlagsstunden fehlen) |
| 491 | HINTEREIS F. | 73: 1953–2025 | 13: 2013–2025 | 13: 2013–2025 | 13 | 286 (2013–2025; 1–54 je Jahr) | **ja** (10; 2013, 2014 Temperaturlücken) |
| 535 | HALLSTAETTER G. | 19: 2007–2025 | 19: 2007–2025 | 19: 2007–2025 | 14 | 0 | **ja** (12) |
| 578 | ZETTALUNITZ/MULLWITZ K. | 19: 2007–2025 | 19: 2007–2025 | 19: 2007–2025 | 14 | 0 | **ja**, als „Mullwitz Kees“ (13) |
| 10460 | VENEDIGER K. | 13: 2013–2025 | 13: 2013–2025 | 13: 2013–2025 | 13 | 0 | **ja**, aber als „Untersulzbach Kees“ — s. §1.3, Befund V-GM-136 |
| 10459 | SEEKARLES F. | 12: 2014–2025 | 12: 2014–2025 | 12: 2014–2025 | 12 | 0 | **ja** (12) |
| 1305 | GOLDBERG K. | 37: 1989–2025 | 22: 2001–2025 (im Fenster 2013–2022, 2025) | 20: 2001–2021 | 9 | 0 | **ja**, als „Goldbergkees untere Teile“ (8) |
| 547 | KLEINFLEISS K. | 27: 1999–2025 | 22: 2001–2025 (im Fenster 2013–2022, 2025) | 20: 2001–2021 | 9 | 0 | **ja** (8) |
| 489 | VERNAGT F. | 61: 1965–2025 | 59: 1966–2025 (im Fenster 13, davon 8 mit beiden Daten) | 47: 1966–**2012** | **1** | 244 (2012, 2013) | **nein** — im Fenster nur ein Stufen-Winter, Regel verlangt ≥ 4 |
| 545 | OE. WURTEN K. | 42: 1983–2024 | 29: 1983–**2011** | 29: 1983–2011 | 0 | 0 | **nein** — kein Winter nach 2011 |
| 573 | STUBACHER SONNBLICK K. | 74: 1949–2025 | 31: 1991–**2021** (im Fenster 10, **keiner** mit Begin- und Mitteldatum; `time_system` „stratigraphic“) | **keine** | 0 | 0 | **nein** — keine Höhenstufen, keine Daten des Winters. Im Katalog heißt es „Sonnblick Kees“ mit `wgms` 2675; 2675 ist in FoG „GRANATSPITZ K.“ („[flag] location: Approximate“) mit derselben RGI50-ID 11.00080 wie 573. Die Zuordnung über den Abstand (0,43 km) fände es trotzdem |
| 507 | KESSELWAND F. | 73: 1953–2025 | **keine** | keine | 0 | 0 (191 Jahres-Punkte 2012–2025) | **nein** — nur Jahresbilanz |
| 566 | PASTERZE | 39: 1980–2025 | **keine** | keine | 0 | 0 | **nein** — nur Jahresbilanz |
| 482 | VERMUNT G. | 9: 1991–1999 | 8: 1991–1998 | 5: 1991–1995 | 0 | 0 | nein — vor dem Fenster |
| 483 | OCHSENTALER G. | 9: 1991–1999 | 7: 1992–1998 | 4: 1992–1995 | 0 | 0 | nein — vor dem Fenster |
| 492 | HOCHJOCH F. | 5: 1991–1995 | 4: 1992–1995 | 4: 1992–1995 | 0 | 0 | nein — vor dem Fenster |
| 476, 486, 510, 3993, 4533 | Filleck K., Klostertaler N, Langtaler F., Hochkönig, Stubacher Weißsee K. | nur Jahresbilanz, alle vor 1999 | — | — | 0 | 0 | nein |
| **346** | **SCHNEEFERNER N** (DE) | 6: 1963–1968 | **keine** | keine | 0 | 0 | — |

**Deutschland:** kein deutscher Gletscher hat in FoG eine Winterbilanz. `glacier.csv` führt neun deutsche Einträge (Blaueis, Höllental,
Schneeferner N/S, Watzmann, vier RGI-Ziffern); Bilanzen hat nur der Nördliche Schneeferner, 1963–1968, Jahreswerte. Unser Build liest
Deutschland ohnehin nicht (`snowcal-truth.mjs` filtert `country === 'AT'`) — ohne Daten ändert das nichts.

**Die sechs ausdrücklich gefragten Gletscher:**

- **Vernagtferner — vorhanden, aber nicht nutzbar nach unserer Regel:** gletscherweite Winterbilanz bis 2025 (im Fenster 13 Winter, 8 mit
  beiden Daten), Höhenstufen nur bis 2012. Die Regel (`gm3-method-frozen.md` A.1, `gm5b-method-frozen.md`) verlangt die Winterbilanz je
  Stufe und ≥ 4 nutzbare Winter.
- **Kesselwandferner — nicht vorhanden:** nur Jahresbilanz. Laut Bericht HEF-KWF 2024/25 wird dort kein Winter gemessen (§4).
- **Stubacher Sonnblickkees — vorhanden ohne Stufen und ohne Datum:** gletscherweit 1991–2021; in FoG keine Stufen, kein Begin- und
  Mitteldatum. Stufenwerte 2017/18–2024/25 gibt es außerhalb von FoG (§6, Q24).
- **Pasterze — nicht vorhanden:** nur Jahresbilanz (2024 mit „[flag] Preliminary data“ im Browser).
- **Wurtenkees — vorhanden, aber vor dem Fenster:** Winter 1983–2011, danach nur Jahresbilanz (bis 2024).
- **Zettalunitzkees — vorhanden, und schon unter unseren acht:** FoG führt die Reihe „ZETTALUNITZ/MULLWITZ K.“ (578, `names`
  „Zettalunitzkees | Mullwitzkees“); unser Build ordnet sie dem Katalog-Gletscher „Mullwitz Kees“ zu (gleiche WGMS-ID 578). Laut
  Hartl et al. 2024 ist das Zettalunitzkees der untere Teil des Mullwitzkees [gelesen: https://essd.copernicus.org/articles/16/4077/2024/].

### 1.3 Befund V-GM-136 (Vorschlag): die Reihe „Venediger K.“ hängt am falschen Katalog-Gletscher

`snowcal-truth.mjs` (Z. 99–101) ordnet eine WGMS-Reihe dem **nächsten Katalogpunkt bis 3 km** zu. Für „VENEDIGER K.“ (10460, 47,125 N /
12,34 E) ist das „Untersulzbach Kees“ (`gl_at_untersulzbach-kees`, 0,69 km, im Katalog `wgms` 134247). In FoG trägt 10460 aber
`parent_glacier_id` 134291 = RGI60-11.00116, und dessen Elternteil ist **583 OBERSULZBACH K.** [lokal: `glacier.csv`]. Hartl et al. 2024:
„VK is a former tributary of Obersulzbachkees“ [gelesen: https://essd.copernicus.org/articles/16/4077/2024/]. RGI60-11.00116 steht nicht
im Katalog; „Obersulzbach Kees“ (`gl_at_obersulzbach-kees`, 7,79 km², `wgms` 583) liegt 2,46 km vom WGMS-Punkt.

- **Mehrwert für Jan:** Der Faktor und die Form, die in `snow-calibration-glaciers.json` unter „Untersulzbach Kees“ stehen, sind am
  Venedigerkees gemessen — einem anderen Gletscher. Sobald `--glacier-factor` / `--glacier-shape` an sind (E-GM-38), rechnet das
  Untersulzbachkees mit fremden Zahlen; Landeswert und Prüfung sind kaum berührt, der Einzelwert schon.
- **Skizze:** Zuordnung zuerst über die WGMS-ID im Katalog (`inv.wgms`), dann über `parent_glacier_id`, erst zuletzt über den Abstand;
  für 10460 entscheiden, ob die Reihe zum Obersulzbachkees gehört oder (weil der Katalog das Venedigerkees nicht einzeln führt)
  herausfällt. Die übrigen sieben Zuordnungen stimmen mit `inv.wgms` überein [lokal geprüft].

---

## 2. GLAMOS Punktmessungen (Q18)

| Punkt | Befund | Beleg |
|---|---|---|
| Neueste Fassung | „Swiss Glacier Point Mass Balance Observations (release 2026)“, DOI 10.18750/massbalance.point.2026.r2026; Zip `massbalance_point_2026_r2026.zip`, 1 856 107 B, „Last-Modified: Wed, 25 Nov 2026 13:26:45 GMT“ (Release 2025: 1 498 394 B) | [gelesen: https://doi.glamos.ch/data/massbalance_point/massbalance_point_2026_r2026.html], HEAD-Abruf |
| Beschreibung | „… at one up to several dozens of sites on more than 50 individual glaciers … Data are aggregated to three time periods - annual (… e.g. Oct.-Sept.), winter (referring to an entire winter season, e.g. Oct.-May), or intermediate …“ | Landingpage |
| Inhalt | `ReadMe.txt`, 60 × `annual/`, 55 Einträge `winter/` = **54 Gletscher** (dazu `limmern_winter.dat.o`), 55 × `intermediate/` | [gelesen: Inhaltsverzeichnis des Zip per Range-Abruf] |
| Spalten (ReadMe, Version 2025-10-28) | „name; date0; time0; date1; time1; period; date_quality; x_pos; y_pos; z_pos; position_quality; mb_raw; density; density_quality; mb_we; measurement_quality; measurement_type; mb_error; reading_err; density_err; error_evaluation_method; source“ — Lage „x-position of stake (LV03/CH1903)“, Höhe „elevation of stake (LN02)“; `measurement_type` u. a. „1: stake“, „2: depth probing (or snowpit / coring with unclear horizon)“, „3: marked or clearly defined horizon“, „4: ground-penetrating radar“, „7: Automatic cameras“; Dichte im Winter teils aus Regression „rho = 257.662 + 1.2169*DOY -0.0085*elevation + 0.1394*snow_depth“ | [gelesen: ReadMe aus dem Zip] |
| Takt | ein Release je Jahr (2020–2026); Abgabe der Messdaten „the 1st of December after the end of the observation period“ | [gelesen: https://doi.glamos.ch/], [gelesen: https://doi.glamos.ch/GLAMOS_publication_and_data_policy.pdf] |
| Daneben | Berichtsreihe „Winter snow accumulation on Swiss glaciers in 2026“, doi:10.18752/winterrep_2026, CC BY 4.0 („… measurements performed on Swiss glaciers in April/May 2026. A preliminary data evaluation …“); PDF nicht gelesen | [gelesen: https://doi.glamos.ch/pubs/winterrep/winterrep_2026.html] |

### 2.1 Sondierungen je Gletscher und Jahr

**Die GLAMOS-Datei selbst ist nicht geladen** (1,86 MB, über der Stichprobengrenze). Gezählt habe ich in der Kopie, die GLAMOS an das WGMS
meldet [lokal: FoG 2026-02-10 `mass_balance_point`, CH, `balance_code = winter`, Herkunft je Zeile „VAW / ETH Zürich, http://www.glamos.ch“;
alle Zeilen mit Breite, Länge, Höhe]. Diese Kopie endet mit dem Winter 2025 und kann weniger enthalten als GLAMOS (Limmern: FoG nur
1964–1984, GLAMOS-Datei mit Datum Oktober 2026).

8 396 Winterpunkte an 33 Gletschern, 1915–2025. Im Fenster 2012–2025, je Gletscher: Punkte / Jahre mit Punkten / Mittel je Jahr.

| Gletscher (FoG) | Punkte 2012–25 | Jahre | je Jahr | unter unseren 35? |
|---|---|---|---|---|
| Rhone | 1 004 | 12 | 84 | ja |
| Findelen | 791 | 14 | 57 | ja |
| Gries | 731 | 13 | 56 | ja |
| Silvretta | 658 | 13 | 51 | ja |
| Pers | 599 | 5 | 120 | ja |
| Allalin | 495 | 3 | 165 | ja |
| Murtèl | 447 | 13 | 34 | ja |
| Basòdino | 410 | 10 | 41 | ja |
| Plaine Morte | 376 | 13 | 29 | ja |
| Grosser Aletsch | 279 | 6 | 47 | ja |
| Tsanfleuron | 211 | 14 | 15 | ja |
| Sankt Anna | 158 | 12 | 13 | ja |
| Otemma | 157 | 5 | 31 | ja |
| Giétro | 106 | 2 | 53 | ja |
| Sex Rouge | 94 | 14 | 7 | ja |
| Claridenfirn | 78 | 14 | 6 | ja |
| Adler | 71 | 10 | 7 | ja |
| Hohlaub | 70 | 3 | 23 | ja |
| Pizol | 67 | 10 | 7 | ja |
| Corvatsch-S | 61 | 8 | 8 | ja |
| Plattas / Medel | 36 | 1 | 36 | ja |
| Chessjen-NW | 32 | 1 | 32 | ja |
| Hohsaas | 22 | 1 | 22 | ja |
| Tortin | 3 | 1 | 3 | ja |
| Plan Névé | 1 | 1 | 1 | ja |
| **Alphubel-S** | **64** | **1 (2025)** | 64 | **nein** |
| **Schwarzbach** | **20** | **8 (2013–2021)** | 3 | **nein** |
| Forno, Albigna, Limmern, Kessjen-E, Plattalva, Schwarzberg | 0 | — | — | nur vor 1985 (Schwarzberg ist unter den 35, Punkte nur 1956–1967) |

**Auf Gletschern, die nicht unter unseren 35 sind:** in der FoG-Kopie **84 Winterpunkte 2012–2025 an zwei Gletschern** (Alphubel-S 64,
Schwarzbach 20). In der GLAMOS-Datei Release 2026 tragen dazu **24 Gletscher eine Winterdatei, aber keine Winterbilanz je Stufe**
(nach dem Inhaltsverzeichnis; Größe unkomprimiert): Damma (240 KB), Limmern (307 KB, Datum Oktober 2026), Schwarzbach (60 KB),
Morteratsch (43 KB, Oktober 2026), Arolla (25 KB), Zinal (22 KB, Oktober 2025), Gorner (18 KB), Plattalva (17 KB), Untergrindelwald,
Forno, Albigna, Taelliboden, Gurschen, Felskinn (Oktober 2026), Tödi, Alphubeltop (Oktober 2025), Diablerets, Ofental, Rosatsch, Misaun,
Cantun, Blauschnee, Bertol, Err. Dazu Orny: Stufenwerte 2012–2025 in Release 2025 (21 Stufenzeilen), aber nicht unter den 35 (vermutlich
weniger als vier nutzbare Winter; der Grund ist im Bericht von GM-3 nicht einzeln genannt — nicht geprüft). **Wie viele Sondierungen je Jahr
in diesen Dateien stehen, ist nicht gezählt** — dafür muss das Zip (1,86 MB) einmal geladen werden (Jans Wort). Unter unseren 35 haben
**sechs keine** Winterdatei: Corbassière, Segnas, Jöri, Oberaar, Schwarzwasser, Vorab (Zuordnung Datei ↔ Gletscher nach Namen, z. B.
`alphubel_winter.dat` ↔ „Alphubelgletscher N“; nicht an den Koordinaten geprüft). Die Zählung 29 + 24 + Orny = 54 geht auf.

### 2.2 Lizenz — zwei Wortlaute, nicht aufgelöst

- Landingpage der Punktdaten: „Right / License — Creative Commons Attribution 4.0 International License (CC BY 4.0)“; Zitat „GLAMOS (2026).
  Swiss Glacier Point Mass Balance Observations, release 2026, Glacier Monitoring Switzerland. doi:10.18750/massbalance.point.2026.r2026.“
  [gelesen: Landingpage oben]. DOI-Index und Datenrichtlinie §3.1 wie in `audit/gletscher/licences.md`.
- ReadMe und die gelesenen Köpfe der Punktdateien tragen **keine** Lizenzzeile, nur „# GLAMOS / VAW-ETHZ; 20261111;
  doi:10.18750/massbalance.point.2026.r2026; http://www.glamos.ch“ (ältere: „production-date 20241029“) [gelesen].
- Dagegen die vier CSV-Köpfe der **Massenbilanz Release 2026** (nicht der Punktdaten): „The data of the Swiss Glacier Monitoring Network
  (GLAMOS) are freely available (https://www.glamos.ch) and may be used with indication of the source for scientific and non-commercial
  use.“ [gelesen: https://doi.glamos.ch/data/massbalance/massbalance_2026_r2026.zip], und das Impressum „… dürfen mit Angabe der Quelle
  für wissenschaftliche und nicht-kommerzielle Nutzungen verwendet …“ [gelesen: https://www.glamos.ch/impressum].
- Die schriftliche Bestätigung von GLAMOS vom 25.11.2026 (Mail bei Jan, von mir nicht gelesen) deckt laut Vermerk „derived model
  parameters in a free web service“. **Ob sie die Punktdaten als Prüfwahrheit mit einschließt, kann nur Jan aus der Mail lesen.**
  Bis dahin: gelb, so wie Q17 vor dem 25.11.

### 2.3 Befund V-GM-137 (Vorschlag): Release 2026 der Massenbilanz liegt vor

Die Eichung (GM-3, GM-5b, GM-10b) nutzt GLAMOS Release 2025. Release 2026 (`massbalance_2026_r2026.zip`, 506 KB) ist veröffentlicht
[gelesen: https://doi.glamos.ch/data/massbalance/massbalance_2026_r2026.html]; es sollte den Winter 2025/26 für die Schweizer Gletscher
tragen (Inhalt nicht ausgewertet). **Mehrwert:** ein Winter mehr je Schweizer Gletscher, und ein echter Vorhersage-Test: der Winter 2026
war beim Einfrieren der Regeln nicht bekannt. **Skizze:** Release 2026 in den Cache, `snowcal-truth.mjs --to=2026`, die eingefrorene
Regel unverändert gegen den einen neuen Winter laufen lassen; Lizenz wie Q17 (Bestätigung vom 25.11. nennt kein Release).

---

## 3. Schneehöhenkarten aus Befliegung oder Satellit

**Ergebnis: keine offene, klar lizenzierte, gemessene Schneehöhenkarte, die mehrere unserer Gletscher abdeckt.** Die großen SLF-Serien
sind offen, haben Gletscher aber ausdrücklich ausmaskiert; die einzige nutzbare Reihe auf dem Eis ist der Hintereisferner.

| Datensatz | Gebiet, Termine, Auflösung | Zugang | Lizenz (wörtlich) | Gletscher | Urteil |
|---|---|---|---|---|---|
| SLF „Snow depth mapping by airplane photogrammetry (2017 – ongoing)“, doi 10.16904/envidat.418 | Davos (≈ 9,74–10,07° E, 46,65–46,85° N); 16.03.2017, 11.04.2018, 16.03.2019, 06.04.2020, 16.04.2021, 23.03.2022, 22.03.2023, 11.04.2024 (ein Eintrag „2025-10-04“ wirkt wie ein Metadatenfehler, nicht geprüft); 0,5 m, UltraCam | GeoTIFF, 20 GB über envicloud.wsl.ch | `license_title` „ODbL with Database Contents License (DbCL)“ (ODbL-Text selbst nicht gelesen) | **ausmaskiert:** „We applied masks (high vegetation, settlements, water, glaciers)“; „…the calculated snow depths from 2017 to 2020 on glaciers are overestimated and therefore also masked out…“ | **auf Gletschern nicht nutzbar** — [gelesen: https://www.envidat.ch/api/action/package_show?id=snow-depth-mapping-by-airplane-photogrammetry-2017-ongoing], [gelesen: https://tc.copernicus.org/articles/17/3383/2023/] |
| SLF „Snow Depth Mapping“ (ADS80/100, Bühler et al. 2015), doi 10.16904/envidat.62 | Davos; 16.04.2010, 20.03.2012, 15.04.2013, 17.04.2014, 15.04.2015, 26.01.2016, 09.03.2016, 20.04.2016; 2 m | 8 GeoTIFF à ≈ 400 MB | ODbL/DbCL | ob Randgletscher (Scaletta, Grialetsch) drin sind: **nicht geprüft** | allenfalls Randgletscher — [gelesen: https://www.envidat.ch/api/action/package_show?id=snow-depth-mapping] |
| SLF Plattformvergleich Dischma 06.–11.04.2018, doi 10.16904/envidat.189 | Pléiades 2 m, UltraCam, UAV | 48 MB (Pléiades) | „WSL Data Policy“ — Policy-Seite 404, **Wortlaut nicht gelesen** | keiner | **blocked** (Lizenz unklar) |
| EnviDat „UAV-derived DSMs and orthoimages for three alpine glaciers“ | St. Annafirn, Findelen, Gries; 2015–2016, mit April-Flügen (z. B. `stanna_20150415`, `findelen_20150409`, `findelen_20160419`) | 0,8–2,9 GB je Datei | „ODbL with Database Contents License (DbCL)“ | drei unserer 35 | Schneehöhe nur indirekt (Winter- minus Herbst-DSM); nutzbar mit Namensnennung und Share-alike für veröffentlichte abgeleitete Datenbanken — [gelesen: https://www.envidat.ch/api/action/package_show?id=uav-datasets-for-three-alpine-glaciers] |
| PANGAEA 887718 „Multi-temporal ALS … Findelengletscher 2005–2010“ | enthält April 2010 gegen Oktober 2009 | — | „Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported (CC-BY-NC-SA-3.0)“ | Findelen | **blocked (NC)** — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.887718] |
| Findelen Heli-GPR + Lidar 10./11.04.2010 (Sold et al. 2013) | 1 m | keine Datenablage genannt | nur „Copyright © International Glaciological Society“ | Findelen | nichts offen — [gelesen: https://www.cambridge.org/core/journals/journal-of-glaciology/article/methodological-approaches-to-infer-endofwinter-snow-distribution-on-alpine-glaciers/5F60096FDFBC8727E2A73864146A0E44] |
| Aletsch Pléiades/TanDEM-X (Bannwart et al. 2024), Zenodo 11071899 | DEM 31.03.2021, keine Schneehöhe | — | „CC BY-NC 4.0: Pléiades DEMs“, „CC BY-NC-SA 4.0: TanDEM-X DEMs, dDEM files“ | Aletsch | **blocked (NC)** — [gelesen: https://zenodo.org/api/records/11071899] |
| **Hintereisferner ALS-DEMs**, PANGAEA 875889 (Sailer, Geist, Stötter, Strasser 2017) | 21 DEMs, 10 m (aus 1 m); Frühjahr **07.05.2002, 04.05.2003, 07.05.2009, 11.05.2012**; Herbst 11.10.2001, 18.09.2002, 09.09.2008, 04.10.2011 | GeoTIFF UTM32N, Zip 25 MB | „Creative Commons Attribution 3.0 Unported (CC-BY-3.0)“; „Always quote citation above when using data!“ | **nur Hintereisferner** (Ausdehnung je DEM nicht geprüft) | **usable**, aber: Oberflächen, keine Schneehöhe — die Differenz Frühjahr − Herbst enthält Emergenz/Submergenz und Firnsetzung; von den vier Wintern (2001/02, 2002/03, 2008/09, 2011/12) liegt nur 2011/12 in unserem Fenster — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.875889] |
| Hintereisferner permanenter Laserscanner (seit 2016, 66,5 % der Fläche) | — | „…will be made available by the authors, without undue reservation.“; „TLS data are available upon request from ACINN/Rainer Prinz“ | keine | Hintereisferner | **blocked** (nur auf Anfrage) — [gelesen: https://www.frontiersin.org/articles/10.3389/feart.2023.1085416], [gelesen: https://tc.copernicus.org/articles/18/849/2024/] |
| Zugspitze Pléiades-Schneehöhe 09.04.2021, 8 m (Koch et al., GRL 2024), Zenodo 13475075 | eine Szene, 1,8 MB | Zip | Zenodo: CC BY 4.0 | ob Schneeferner/Höllentalferner abgedeckt: **nicht geprüft** (Artikel 403, PDF nicht lesbar) | Kandidat, ein Termin — [gelesen: https://zenodo.org/api/records/13475075] |
| Schneeferner TLS stündlich 17.–23.04.2018, PANGAEA 941550 | ≈ 130 Epochen LAZ, ≈ 19 GB | — | „Creative Commons Attribution 4.0 International“ | Nördlicher Schneeferner (Skipiste) | keine schneefreie Referenz ⇒ keine Schneehöhe, nur Änderungen über sechs Tage — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.941550] |
| Land Tirol ALS | Landesbefliegungen 2006–2010, 2017–2023, Punktwolken gegen Gebühr; keine Winterbefliegung gefunden | — | — | — | **nicht geprüft** an der Primärquelle |
| ESA CCI Snow SWE (0,1°) | grob, Alpen laut CEDA maskiert | — | eigene CCI-Bedingungen, Wortlaut nicht gelesen | — | ungeeignet |
| Weisssee Kaunertal TLS 11/2014–05/2018, PANGAEA 896843 | Messfeld 2 464 m, eisfrei | — | CC BY 4.0 | keiner (neben dem Eis) | nur Dichte/Methodik, §6 |

Nicht gefunden: eine alpenweite gemessene Schneehöhenkarte; offene Karten für Plaine Morte, Rhone, Gries (außer den UAV-DSMs), Höllentalferner,
Watzmann; offene Rofental-ALS-Schneehöhen (Helfricht 2014, nur Dissertation).

---

## 4. Universität Innsbruck, Hintereisferner und Nachbarn (Q22)

| Quelle | Was | Lizenz (wörtlich) | Urteil |
|---|---|---|---|
| Jahresberichte HEF-KWF 2012/13–2024/25 (PDF, 2025: 8 MB) | Hintereisferner: Winterbilanz bW (2024/25: 802 mm w.e., Stichtag 30.04.), Tab. 7 Bilanz je 50-m-Stufe mit BW/bW, Tab. 13 Schneehöhensondierungen (30 Punkte, zwei Schächte). **Kesselwandferner:** Tab. 9 nur „gesamtes Jahr“, 7 Pegel und 1 Schacht nur für die Rücklage — **kein Winter** | keine Lizenz; „Basis- und Zwischenwerte werden bei Anfrage und für wissenschaftliche Verwendung von ACINN zur Verfügung gestellt.“ | Stufen sind schon in WGMS; die Sondierpunkte je Jahr: **beim Anbieter fragen** (kommerziell nicht gedeckt) — [gelesen: https://www.uibk.ac.at/en/acinn/research/ice-and-climate/projects/mass-balance-hintereisferner/], [gelesen: https://www.uibk.ac.at/media/filer_public/e3/22/e322c639-2577-4562-bc75-0cbdb76e92a2/bericht_hef-kwf2025.pdf] |
| Datenseite ACINN „glaciers“ | verweist für die Massenbilanz auf WGMS und BAdW | kein Lizenztext | — [gelesen: https://www.uibk.ac.at/en/acinn/research/ice-and-climate/open-air-laboratory/data/glaciers/] |
| **Zenodo 10.5281/zenodo.15019323** (Prinz, Schroeder et al. 2025) | SWE aus Neutronensensor (CRNS) an den Stationen HEF30 und HEF27 auf dem Eis; `Field_data.csv` = „Manual snow pit measurements done during 2021-2024“; Data.zip 24 MB. Höhen der Stationen nicht geprüft | Zenodo: CC BY 4.0 | **usable** als Punkt-SWE auf dem Eis, Winter 2021–2024 — [gelesen: https://zenodo.org/api/records/15019323 und README] |
| Zenodo 10.5281/zenodo.1326398 | Pegel HEF und Langenferner 2012–2014, laut Beschreibung nur Sommer | CC BY 4.0 | für den Winter nichts — [gelesen] |
| PANGAEA 818898 (Hintereisferner, Stufen) / 818757, 839463 (Kesselwandferner) | bis 2010/11 bzw. 2012/13; Kesselwand-Zonen nur `baZ` | CC BY 3.0 | vor dem Fenster bzw. ohne Winter — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.839463] |
| PANGAEA 876120 (Rofental) | Meteorologie, Abfluss, Jahresbilanzen, Laserscans (darin 875889, §3) | CC BY 3.0 | keine Winterbilanz — [gelesen] |
| Rofental-Stationen mit Schneehöhe, z. B. Latschbloder 2 919 m 2017–2020 (PANGAEA 928649), Bella Vista, Proviantdepot; GFZ 10.5880/fidgeo.2023.037 | Schneehöhe/SWE neben dem Eis | CC BY 4.0 | **usable** als „neben dem Eis“ (§6) — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.928649], [gelesen: https://essd.copernicus.org/articles/16/3579/2024/essd-16-3579-2024.html] |
| Zenodo 7081256 „Hintereisferner energy balance“ | ohne Winter | **keine Lizenz** | blocked |

**Rahmen für alle PANGAEA-Einträge** (gilt auch §5, §6): jede Datei trägt im Kopf `License: Creative Commons Attribution 4.0 International
(CC-BY-4.0)` bzw. `… 3.0 Unported (CC-BY-3.0)`; CC BY: „Share — … for any purpose, even commercially.“, Pflicht „Attribution — You must give
appropriate credit, provide a link to the license, and indicate if changes were made.“ [gelesen: https://creativecommons.org/licenses/by/4.0/].
Daneben die Nutzungsbedingungen von PANGAEA, **nicht aufgelöst**: §6.2 „the content will be published under the Creative Commons license
CC0 for metadata and CC-BY for data.“ und §5.5, das „the use of automated systems to extract data from the PANGAEA web pages for commercial
purposes“ untersagt (Ausnahme Suchindizes) [gelesen: https://www.pangaea.de/about/terms.php]. Folge für uns: einmal gezielt über
`?format=textfile` laden und im Cache halten, kein wiederholter Abruf aus einem Producer.

---

## 5. Bayerische Gletscher

**Ergebnis: keine offen verfügbare gemessene Winterbilanz und keine wiederholte Schneehöhen-Vermessung auf dem Eis. Es gibt nur geodätische
Mehrjahresänderungen (Oberfläche, Fläche, Volumen) und Radar-Eisdicken.**

| Quelle | Befund | Lizenz | Beleg |
|---|---|---|---|
| Bayerischer Gletscherbericht 2021 (BAdW/StMUV) | Oberflächenhöhe 2006/2009 → 2018, Eisdicke per Radar; ein Schneeschacht nur zur Radar-Kalibrierung („Daher graben wir einen Schneeschacht, messen die Schneedicke … und bestimmen die Dichte des Schnees. Damit können wir die Radarmessungen am Schneeschacht kalibrieren“); „Da für einzelne Gletscher keine genauen meteorologischen Daten vorliegen …“ | — | [gelesen: https://badw.de/fileadmin/user_upload/Files/BADW/Neuigkeiten/2021/04-21/Bayerischer_Gletscherbericht_2021_bf_low-DS_n.pdf] |
| Mayer, Weber, Wendt, Hagg, Polarforschung 89 (2021) | geodätisch + Radar; „Alle Daten sind auf http://www.bayerische-gletscher.de (letzter Zugriff: 11. März 2021) verfügbar.“ | Artikel CC BY 4.0; Daten: s. nächste Zeile | [gelesen: https://polf.copernicus.org/articles/89/1/2021/] |
| bayerische-gletscher.de | **nicht erreichbar** (TLS-Handshake), Inhalt und Lizenz unbekannt | — | **nicht geprüft** ⇒ ask provider |
| Vermessung Herbst 2025 (HM + BAdW, Pressemitteilung 19.03.2026) | Dickenänderung (1,6 m/a für 2023–2025), Fläche, Volumen; kein Schnee, kein Datenlink | keine | [gelesen: https://idw-online.de/de/news867916] |
| BAdW-Website (allgemein) | Impressum: „Die hier zur Verfügung gestellten Web-Seiten und Dokumente dürfen nur zu Informationszwecken verwendet werden. Diese Seiten und Dokumente dürfen nicht kommerziell verwertet werden.“ | **NC** | [gelesen: https://geo.badw.de/impressum.html] |
| PANGAEA / Zenodo | „Höllentalferner“, „Watzmanngletscher“: 0 Treffer; „Schneeferner“: nur 941550 (§3); „Blaueis“/„Watzmann“: Bodentemperatur im Vorfeld (998612/998619/998623, Moratorium bis 16.11.2028) | — | [gelesen: ws.pangaea.de, zenodo.org/api] |
| **DWD Zugspitze**, SHK_TAG (Schneehöhe täglich, cm) in `daily/kl` und `daily/more_precip`; „Schneepegel; Schneehöhenmessung, manuell“ seit 1948 | **Stationswechsel:** unter 05792 letzter gültiger Wert 01.02.2026, danach unter **20278 „Zugspitze_Plattform“** (kl ab 20260201; z. B. 01.04.2026: 365 cm, 01.11.2026: 25 cm). Metadaten nennen Gipfelkoordinaten (47,4210/10,9848, 2 956 m); dass der Pegel auf dem Platt steht, nur aus dem Gletscherbericht („Der Deutsche Wetterdienst meldet auf dem Zugspitzplatt …“), genaue Lage **nicht geprüft**. **Kein Wasserwert** (Zugspitze fehlt in `daily/water_equiv`). Takt: `recent` täglich, 500 Tage rollierend | „The Creative Commons BY 4.0 - Licence "CC BY 4.0" apply.“ (Beschreibung `water_equiv`; die des Datensatzes `kl` nicht geöffnet); Weiterverwendung „ausschließlich unter den Bedingungen der Creative-Commons-Lizenz BY 4.0“ | [gelesen: opendata.dwd.de …/daily/kl/recent/ und Stationslisten], [gelesen: https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/water_equiv/DESCRIPTION_f62e277b-00f5-4be8-95a4-0c598d869e5a_en.pdf], [gelesen: https://www.dwd.de/copyright] |
| Lawinenwarndienst Bayern (Q10) | kein Download, keine API; „Copyright © Lawinenwarndienst Bayern“, „ohne Gewähr“; Impressum erlaubt nur privaten Gebrauch, Vervielfältigung mit Genehmigung. LfU nennt eine Station „Zugspitzplatt (2.420 m)“ seit 2012, ohne Betreiber, Daten oder Lizenz | **blocked** | [gelesen: https://lawinenwarndienst.bayern.de/schnee-wetter-bayern/wetter-schnee-messstationen/], [gelesen: https://lawinenwarndienst.bayern.de/impressum/], [gelesen: https://www.lfu.bayern.de/wasser/hydrologischer_jahresbericht_2025/lawinen/winter_2425/index.htm] |
| UFS Schneefernerhaus | keine Schneehöhe, kein Download, nur „© 2026 UFS GmbH“ | blocked | [gelesen: https://schneefernerhaus.de/en/daten/aktuelle-messdaten/] |
| GKD Bayern | CC BY 4.0 je Download-Seite („This data is licensed under a Creative Commons Attribution 4.0 International License“), aber keine Station an Zugspitze oder Platt; Berchtesgaden nur Schneibsteinhaus, Jenner | CC BY 4.0 | [gelesen: https://gkd.bayern.de/en/meteo/snow/inn/schneibsteinhaus-43810000/download] |

**Befund V-GM-138 (Vorschlag):** Q10 (Schneehöhe am Zugspitzplatt) hat eine offene Antwort, die nicht der Lawinenwarndienst ist: DWD SHK_TAG,
täglich, CC BY 4.0 — mit dem Stationswechsel 05792 → 20278 am 01.02.2026. **Mehrwert:** die vier deutschen Gletscher bekämen eine gemessene
Schneehöhe in der Nähe (kein Wasserwert, also keine Eichung, aber ein Schattenpaar wie in GM-4). **Skizze:** prüfen, ob `obs/v1` die
Station schon führt und unter welcher Kennung; beide IDs als eine Reihe; Lage des Pegels an der Station bestätigen, bevor ein Abstand zum
Gletscher genannt wird.

---

## 6. Weitere offene Messungen von Schnee auf oder neben dem Eis (CH, AT, DE)

Nur Quellen mit klarer Lizenz; Eisfreies nur, wo es direkt neben einem Katalog-Gletscher liegt.

| Quelle | Was | Lage | Lizenz | Urteil |
|---|---|---|---|---|
| **IGF ÖAW, Stubacher Sonnblickkees**, Reihe PANGAEA 993864 (Gschwentner, Bertolotti, Seiser, Hartl, Stocker-Waldhuber, Wiesenegger, Fischer 2026); Höhenzonen 993888, 993891, 993894 (Titel-Tippfehler „2019/20208“), 993897, 993896, 993893, 993895, 993892 | **Winterbilanz je Höhenzone `bwaZ` 2017/18–2024/25** (8 Winter), Festdatum: „1st October to 30th September …; the accumulation during the winter is determined by 30th April“, aus „snow pits and soundings“. Auffällig: Spalte `bsaZ` doppelt; `BwaZ [10**6 kg]` passt nicht zu SaZ × bwaZ ⇒ nur `bwaZ` nutzen; die gletscherweiten Dateien (z. B. 993885) ohne Winterspalte; die „homogenisierte“ Reihe 2018–2025 (996112) gibt HTTP 401 | Stubacher Sonnblickkees (Katalog „Sonnblick Kees“, `wgms` 2675) | Kopf: „Creative Commons Attribution 4.0 International (CC-BY-4.0)“ | **usable** — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.993888?format=textfile, Kopf von mir nachgelesen; die übrigen IDs gelesen] |
| IGF ÖAW, **Mullwitzkees** Winter-Punktbilanzen „Fixed date winter (April 30) point mass balance (snow pits)“: 965726 (2006–2022), 971286 (2023), 983902 (2024); Zwischenwerte 965727, 971284, 983900 | je Punkt Name, Begin/Ende, x/y (EPSG:31255), z, Dichte, „MB point [mm w.e.]“, Messart, Unsicherheiten, Beobachter; 2025 im Index nicht gefunden | Mullwitzkees (mit Zettalunitzkees) | „Creative Commons Attribution 4.0 International (CC-BY-4.0)“ | **usable** als Prüfpunkte — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.965726, Kopf und Spalten von mir nachgelesen], [gelesen: …/983902] |
| IGF ÖAW, **Venedigerkees** Winter-Punktbilanzen: 965732 (2011/12–2022), 971274 (2023), 983877 (2024) | dasselbe Schema | Venedigerkees (s. V-GM-136) | CC BY 4.0 | **usable** — [gelesen: …/965732, …/983877] |
| IGF ÖAW, Höhenzonen mit `bwaZ` bis 2024/25: Jamtalferner 990869, Mullwitzkees 990836, Venedigerkees 990655, Hallstätter 990717 | dieselbe Herkunft wie die WGMS-Reihen; nichts zusätzlich. Bei Jamtal 2023/24 wirken Titel „Elevation zones“ (993714, 12 Zeilen) und „Glacier mass balance“ (993713, 98 Zeilen) vertauscht | — | CC BY 4.0 | Zweitbezug, falls WGMS fehlt — [gelesen] |
| IGF ÖAW, **Weißseespitze** (Gipfel des Gepatschferners, 3 499 m): Punktbilanz mit Schneehöhe am Pegel 2017–2024 (982345), AWS mit Ultraschall-Schneehöhe SR50A 2017–2024 (939830, 983918 ff.) | Schneehöhe, kein Wasserwert | auf dem Eis | CC BY 4.0 | **usable** — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.939830] |
| Weisssee-Messfeld Kaunertal, 2 464 m (Schöber et al. 2019): Dichte aus Schächten 2014–2018 (898226), Schneehöhe, TLS (896843, 921895) | Dichte/Schneehöhe | neben dem Eis | CC BY 4.0 | usable für Dichte — [gelesen: …/898226] |
| Hintereisferner CRNS + Schächte 2021–2024 (Zenodo 15019323) | SWE | auf dem Eis | CC BY 4.0 | usable (§4) |
| Aletsch GPR 1,8 km + Schacht + Kerne, 29.02.2024 (Ewigschneefeld), Zenodo 17077546 | Firnstratigrafie, ein Termin | auf dem Eis | CC BY 4.0 | als Punktreferenz Ende Februar 2024 — [gelesen: https://zenodo.org/api/records/17077546] |
| MeteoSchweiz Handstationen `ogd-nime` (= Q5 NIME): `hto000d0` Schneehöhe 6 UTC, `hns000d0` Neuschnee | ≈ 270 Stationen, 12 ab 1 800 m; Jungfraujoch **ohne** Schneegrößen; Säntis seit 06.01.1890 neben dem Blauschnee (GLAMOS-Winterdatei vorhanden, Abstand nicht geprüft) | neben dem Eis | STAC „CC-BY“; Nutzungsbedingungen „Creative Commons Licence CC BY 4.0“, „copy and redistribute … for any purpose, even commercially“, „Source: MeteoSwiss“ | schon in Q5; Säntis–Blauschnee als einziges Paar neu — [gelesen: https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-nime], [gelesen: https://opendatadocs.meteoswiss.ch/general/terms-of-use] |
| SLF-Schneeprofile | der Data Service nennt Profile nicht; offen nur ein Auszug von 742 Profilen (envidat.351, ODbL), nicht als „auf Gletschern“ ausgewiesen | — | — | Profile auf Gletschern: ask provider — [gelesen: https://www.wsl.ch/en/services-produkte/slf-data-service/] |
| Morteratsch-AWS (IMAU Utrecht), Zunge ≈ 2 100 m, 1994–2023 | Sensoren, Download, Lizenz nicht genannt | auf dem Eis | keine | ask provider — [gelesen: https://www.projects.science.uu.nl/iceclim/aws/alpine.php] |
| Goldbergkees, Kleinfleißkees, Wurtenkees, Pasterze (GeoSphere / Sonnblick Verein) | GeoSphere Data Hub (69 Datensätze) nur SNOWGRID; PANGAEA 0 Treffer; Jahrbücher des Sonnblick-Vereins nur bis ≈ 2014 gefunden (Inhalt, Lizenz nicht geprüft). KryoMon.AT (Uni Graz) zeigt Winterabweichungen 2015–2024 für Goldberg/Kleinfleiß mit Quelle FoG 2025-02b; zur Pasterze „Die aktuelle Massenbilanz der Pasterze bezieht sich nur auf Punktmessungen und ist als vorläufig anzusehen.“ | — | Bericht ohne Lizenz | ask provider — [gelesen: https://dataset.api.hub.geosphere.at/v1/datasets], [gelesen: https://static.uni-graz.at/fileadmin/_files/_cooperation_sites/_kryomonat/Zweiter_Bericht/Bericht_als_PDF/Gletscher.pdf] |
| **Vernagtferner (BAdW)** | PANGAEA 854681 (Reinwarth, Braun, Mayer 2015, CC BY 3.0) bis 2013/14, je Höhe nur Ablations-/Akkumulationsgebiet, kein Winter; Website-PDFs je 50-m-Stufe bis 2024/25 (`VF_MB2025_table.pdf`) laut Legende nur Ba, Bc, B — **kein Winter**; PDFs „© Kommission für Erdmessung und Glaziologie der BAdW München“ | — | Website NC (Impressum, §5) | Website **blocked**; Winter je Stufe nach 2012: ask provider — [gelesen: https://doi.pangaea.de/10.1594/PANGAEA.854681], [gelesen: https://geo.badw.de/vernagtferner-digital/massenbilanz.html] |

**KryoMon.AT gegen unsere FoG-Kopie:** der Bericht zeigt Winterwerte für Goldberg und Kleinfleiß bis 2024. Unsere Kopie hat für beide die
gletscherweiten Winter 2013–2022 und 2025 (nicht 2023, 2024) und Stufen nur bis 2021 [lokal]. Ob „Abweichung 2023/2024“ im Bericht ein
Wert oder eine Lücke ist, habe ich nicht gelesen — nicht aufgelöst.

---

## 7. Übersicht

Vorschlagsnummern für §4.4 (Jan prüft vor der Übernahme). „Zusatz“ = was die Quelle der Eichung bzw. der Prüfung bringen würde.

| Nr. | Quelle | Zusatz | Aufwand der Anbindung | Lizenz | Empfehlung |
|---|---|---|---|---|---|
| Q19 | WGMS FoG 2026-02-10 (Bestand) | nichts Neues; 2027 der Winter 2025/26 | — | CC BY 4.0 (Datenrichtlinie); DataCite ohne Lizenz für 2026-02-10 | use (wie bisher); V-GM-136 beheben |
| Q19a | WGMS Echtzeit-Datenbank `db.wgms.ch` | unbekannt (nicht abgefragt) | klein: eine SQL-Abfrage, nur lesen | wie Q19; „real-time data lacks a version or DOI“ | einmal abfragen (Jans Freigabe der Verbindung), nichts Unversioniertes in die Eichung |
| Q17a | GLAMOS Massenbilanz Release 2026 | **+1 Winter je Schweizer Gletscher** (≈ 35 Gletscherwinter), dazu ein ungesehener Prüfwinter | klein: Cache + `--to=2026` | CC BY 4.0 (Landingpage) gegen „non-commercial“ (Kopf, Impressum); Bestätigung 25.11. nennt kein Release | use, wenn Jan die Bestätigung so liest (V-GM-137) |
| Q18 | GLAMOS Punktmessungen Release 2026 | Prüfpunkte mit Lage und Höhe an 54 Gletschern; FoG-Kopie: 6 957 Winterpunkte 2012–2025 an 25 der 35, **84 an zwei weiteren**; dazu 24 weitere Gletscher mit Winterdatei (Zahl nicht gezählt) — **keine** zusätzlichen Eichgletscher (ohne Stufenwerte) | mittel: Zip laden (1,86 MB), LV03 → WGS84, Zuordnung zum Katalog, Messart/Dichte-Code filtern | CC BY 4.0 (Landingpage); Dateien ohne Lizenzzeile | use als Prüfwahrheit (Messung E), nach Jans Lesart der Bestätigung |
| Q24 | IGF ÖAW, Stubacher Sonnblickkees, Höhenzonen 2017/18–2024/25 (PANGAEA 993864) | **+1 Eichgletscher in Österreich** (8 Winter, im Fenster) | klein: 8 Textdateien, eigener Leser statt `mass_balance_band.csv`; Festdatum 01.10.–30.04.; `bwaZ` allein | CC BY 4.0 | **use** |
| Q25 | IGF ÖAW, Winter-Punktbilanzen Mullwitzkees 2006–2024, Venedigerkees 2011/12–2024 | Prüfpunkte an zwei der acht (Schächte, Sondierungen mit x/y/z) | klein bis mittel: EPSG:31255 → WGS84 | CC BY 4.0 | use (Prüfung) |
| Q26 | IGF ÖAW, Weißseespitze (Gepatschferner, 3 499 m), Schneehöhe am Pegel und SR50A 2017–2024 | Schattenpaar auf dem Eis, ein Punkt, ohne Wasserwert | klein | CC BY 4.0 | use (Schattenpaar) |
| Q27 | Universität Innsbruck, CRNS-SWE + Schächte Hintereisferner 2021–2024 (Zenodo 15019323) | SWE-Punkte auf dem Eis, zwei Stationen, drei bis vier Winter | mittel (24 MB, CRNS-Verarbeitung lesen) | CC BY 4.0 | use (Prüfung) |
| Q28 | Universität Innsbruck, Jahresberichte HEF-KWF (Sondierungen je Jahr) | ≈ 30 Sondierpunkte je Winter am Hintereisferner | — | keine Lizenz; „bei Anfrage und für wissenschaftliche Verwendung“ | ask provider |
| Q29 | Hintereisferner ALS-DEMs (PANGAEA 875889) | Schneehöhenfeld aus Frühjahr − Herbst für vier Winter (2001/02, 2002/03, 2008/09, 2011/12), nur 2011/12 im Fenster | groß: Emergenz und Firnsetzung abziehen | CC BY 3.0 | drop (Aufwand gegen einen Winter an einem schon gemessenen Gletscher) |
| Q30 | Vernagtferner (BAdW), Winter je Stufe nach 2012 | **+1 Eichgletscher**, falls es die Werte gibt (gletscherweit gibt es sie: 13 Winter 2012–2025 in FoG) | klein, sobald Daten da | Website NC; PANGAEA nur bis 2013/14 ohne Winter | ask provider (BAdW, Christoph Mayer) |
| Q31 | GeoSphere / Sonnblick Verein: Goldberg, Kleinfleiß (Stufen nach 2021), Wurten, Pasterze | Goldberg und Kleinfleiß je bis zu 4 Winter mehr; Wurten +1 Gletscher, falls nach 2011 im Winter gemessen; Pasterze vermutlich nicht (nur vorläufige Punkte) | klein, sobald Daten da | nichts Offenes gefunden | ask provider |
| Q32 | DWD Zugspitze SHK_TAG (05792 bis 01.02.2026, 20278 ab dann) | Schneehöhe neben den vier deutschen Gletschern, täglich, ohne Wasserwert | klein | CC BY 4.0 | use (Schattenpaar; V-GM-138) |
| Q33 | EnviDat UAV-DSMs St. Annafirn, Findelen, Gries 2015–2016 | Schneehöhenfelder (indirekt) an drei der 35, zwei Winter | groß (GB-Dateien, Herbstreferenz, Eisdynamik) | ODbL (Share-alike für veröffentlichte abgeleitete Datenbanken) | drop — die drei Gletscher haben schon dichte Sondierungen (Q18) |
| Q34 | SLF Flugzeug-Schneehöhenkarten (envidat.418, .62) | auf Gletschern nichts (maskiert) | — | ODbL | drop |
| Q35 | Zugspitze Pléiades-Schneehöhe 09.04.2021 (Zenodo 13475075) | ein Termin, Abdeckung der Gletscher ungeprüft | klein (1,8 MB) | CC BY 4.0 | use nur, wenn ein einmaliger Abruf zeigt, dass die Szene Schneeferner/Höllentalferner deckt; sonst drop |
| — | Rofental-Stationen, Weisssee-Messfeld, Säntis | Dichte bzw. Schneehöhe neben dem Eis | klein | CC BY 4.0 | use nur als Dichte-/Methodenreferenz |
| — | Lawinenwarndienst Bayern (Q10), UFS Schneefernerhaus, BAdW-Website, Findelen-ALS (PANGAEA 887718), Aletsch Pléiades (Zenodo 11071899), SLF envidat.189, HEF-Laserscanner, Zenodo 7081256 | — | — | NC, nur privat, keine oder unklare Lizenz | **blocked** |
| — | bayerische-gletscher.de, SLF-Profile auf Gletschern, IMAU-AWS Morteratsch | unbekannt | — | unbekannt | ask provider |

## 8. Wie viele Eichgletscher Österreich realistisch haben könnte

Heute acht — davon einer am falschen Katalog-Gletscher (V-GM-136: die Reihe ist das Venedigerkees, gebucht ist das Untersulzbachkees).
**Sicher dazu kommt einer: das Stubacher Sonnblickkees** mit acht Wintern je Höhenzone 2017/18–2024/25 (Q24, CC BY 4.0, ohne Rückfrage).
Das ergibt **neun**, oder acht richtig zugeordnete, falls das Venedigerkees im Katalog keinen eigenen Platz findet. Mit Rückfragen ist
**ein zehnter** möglich: der Vernagtferner, dessen gletscherweite Winterbilanz bis 2025 vorliegt, dessen Stufen nach 2012 aber nicht offen
sind (BAdW). Ein elfter (Wurtenkees) nur, wenn GeoSphere nach 2011 überhaupt im Winter gemessen hat — dafür fand ich keinen Hinweis.
Kesselwandferner und Pasterze kommen nicht in Frage: am Kesselwandferner wird kein Winter gemessen, an der Pasterze nur vorläufige Punkte.
Goldberg und Kleinfleiß gewinnen mit Rückfrage bis zu vier Winter, aber keinen Gletscher. **Realistisch also 9, mit Anbieter-Antworten 10,
mehr nicht** — der größere Gewinn für Österreich sind Prüfpunkte (Mullwitz, Venediger, Hintereisferner, Weißseespitze), nicht weitere
Eichgletscher.

## 9. Befunde und offene Punkte

- **V-GM-136** (Vorschlag) — Venedigerkees am falschen Katalog-Gletscher (§1.3).
- **V-GM-137** (Vorschlag) — GLAMOS Release 2026 der Massenbilanz liegt vor; die Eichung nutzt 2025 (§2.3).
- **V-GM-138** (Vorschlag) — Q10 hat eine offene Antwort: DWD Zugspitze SHK_TAG, Stationswechsel 05792 → 20278 am 01.02.2026 (§5).
- Für Jan: (1) Deckt die GLAMOS-Bestätigung vom 25.11. auch die Punktdaten (Q18) und Release 2026 (Q17a)? (2) Freigabe für eine nur lesende
  Abfrage der WGMS-Echtzeit-Datenbank (Q19a)? (3) Darf das GLAMOS-Punkt-Zip (1,86 MB) einmal in den Cache, damit die Sondierungen der
  24 Gletscher ohne Stufenwerte gezählt werden? (4) Rückfragen an BAdW (Vernagt, bayerische-gletscher.de), GeoSphere (Goldberg, Kleinfleiß,
  Wurten), ACINN (Sondierungen HEF) — das ist Kontakt nach außen und deshalb Jans Schritt.
- §4 der Hauptdatei ist nicht geändert.
