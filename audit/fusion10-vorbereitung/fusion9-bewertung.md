# buscosun Fusion 9 – Stärken, Schwächen & Wettbewerb

> Stand 07.10.2026 · Abschrift des Claude-Docs aus der Cowork-Sitzung vom 07.10.2026
> (https://claude.ai/code/artifact/b02dc649-31a2-4d34-97ea-25c9c07eb2e6). Die beiden Diagramme des Docs stehen hier als
> Tabellen; alle Zahlen je Zelle in `kennzahlen-fusion9.csv` (Skript `kennzahlen.mjs`).
> Grundlage: Prüfstand P1, `audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/scores.json` und
> `audit/pruefstand/vergleiche/2026-10-05*/`. Im Doc nichts neu gerechnet; MAE-Verhältnisse aus `scores.json` geteilt.
> **Achtung Tresor:** Dieses Dokument enthält Spur-R-Ergebnisse von Fusion 9 (Tresor, am 05.10. geöffnet). Für die
> Entwicklung von Fusion 10 nur als Kontext, nicht zum Auswählen oder Tunen von Kandidaten.

## Kurzfazit

Fusion 9 ist im Prüfstand nicht von Fusion 8 zu unterscheiden (±0,00 % auf Spur R und Entwicklungsmenge); der
Champion-Status ist eine Setzung, kein Messergebnis. Die Familie Fusion 6–9 ist gegenüber den Rohmodellen ein großer
Schritt und an Messstationen genauer als MOSMIX-L. Ohne eigene Station, also im eigentlichen Produktfall, liegt sie bei
Temperatur und Wind hinter MOSMIX-L, und nach 2 bis 5 Tagen fallen Böen, Bewölkung und Wind unter die Klimatologie.

| Vergleich | Ergebnis | Belastbarkeit |
| --- | --- | --- |
| Fusion 9 gegen Fusion 8 | ±0,00 % | sauber, aber die Änderung greift dort nicht |
| Fusion 6–9 gegen Rohcube | Güteindex +17,8 % gegen −41,2 % | sauber (Spur R, 70 Tage) |
| Gegen MOSMIX-L, mit Station | Temperatur-MAE bis 240 h 4–17 % besser | Entwicklungsmenge mit Fit-Tagen |
| Gegen MOSMIX-L, ohne Station | Temperatur-MAE bis 48 h 0,25–0,64 K schlechter | Entwicklungsmenge; Heimvorteil für MOSMIX |
| Gegen Klimatologie nach 2–5 Tagen | Böe und Bewölkung ab 48 h, Wind ab 120 h: −5 bis −24 % | sauber (Spur R) |

Die zwei größten Hebel: Downscaling an Punkten ohne Station und eine Langfrist, die zur Klimatologie zurückfindet.

## Datenbasis & Methodik

| Menge | Zeitraum | Ausgabetage | Sauber? | Was sie trägt |
| --- | --- | --- | --- | --- |
| Spur R (Hindcast-Tresor) | 08.04.2024 – 04.08.2025 | 70 | ja | Nachgebaute Eingaben ohne Stationsprodukt, Nowcast und Messung; Fenster 6–48 h leer. Fusion 6–9 rechnen hier identisch. |
| Spur P (Archiv nach Freeze) | ab 05.10.2026 | 0 | ja | Noch leer: Wahrheit reift 7 Tage, die Abnahme braucht mindestens 4 Tage. |
| Entwicklungsmenge | 14.09. – 04.10.2026 | 21 | nein | Der Stack-Fit (14.–28.09.) liegt darin. Einzige Menge mit MOSMIX-L und allen sechs Fenstern. |

- **Rolle A** = 270 Stationen, gerechnet mit eigener Messung und eigenem Stationsprodukt. **Rolle B** = 95 andere
  Stationen, an denen beides maskiert ist; sie stehen für einen Punkt ohne Station. Für das Produktversprechen
  „beliebiger Ort“ zählt Rolle B. A und B sind verschiedene Stationen.
- 389 Archivpunkte in DE/AT/CH, davon 365 bewertet (24 DE-Flugplätze ohne 10-min-Daten); Wahrheit W1 aus DWD CDC,
  GeoSphere klima-v2 und SwissMetNet. Alle waren im Fit; wirklich ungesehene Stationen gibt es erst mit Archiv-Schema 5.
- Scores: CRPS über 19 Quantile (5–95 %), Brier für „nass“, dazu MAE des Medians. Nicht bewertet: Globalstrahlung,
  Luftdruck, Sichtweite, Niederschlagsart, Schneefallgrenze, Tagessumme, Sprunghaftigkeit.
- Der Replay nimmt eine Cube-Zelle je Stufe, der Browser den 2×2-Block. Wie weit das ausgelieferte Produkt davon
  abweicht, ist nicht gemessen.
- Die Ausgabe liegt in beiden Mengen um 23 bzw. 00 UTC: das Fenster 0–6 h ist immer Nacht.

**Ergänzung zur Produktaussage:** Sie vergleicht den CRPS von Fusion mit dem MAE deterministischer Quellen. Ein perfekt
kalibrierter Normalverteilungs-Forecast schlägt seinen eigenen Median in diesem Maß schon um rund 26 % (bei 19
Quantilen; im stetigen CRPS 29 %). Deshalb steht zusätzlich der MAE des Fusion-Medians gegen den MAE der Quellen.

## Was Fusion 9 ist

Fusion 9 ist Fusion 8 plus eine einzige Änderung am Anker; die Rechenkette dahinter ist seit Fusion 6 unverändert
(Tabellen aus Daten-Repo-Commit `1aaec969`). An jedem Punkt ohne Messung und bei jeder Messung zur vollen Stunde rechnet
Fusion 9 exakt Fusion 8.

| Stand | Datum | Änderung | Gemessene Wirkung |
| --- | --- | --- | --- |
| Fusion 9 | 04.10.2026 | Anker am Messzeitpunkt: Modellwert zur Minute der Messung, linear zwischen zwei Achsenschritten, statt erster Schritt in ±30 min | Am Archiv nicht messbar (Stundenwerte). An Straßenstationen: Ankergewinn +30 % bei Messung um 16:00 gegen +1 % um 16:30 (V-AW-33). Prüfstand: ±0,00 % gegen Fusion 8 auf Spur R und Entwicklungsmenge. |
| Fusion 8 | 02.10.2026 | Radar-Member als Stundenmittel der 5-min-Bilder | Brier 1–2 h +9,8 % mit / +11,8 % ohne Station (Archiv 16.09.–01.10.). Entwicklungsmenge gegen Fusion 7: Niederschlag 0–6 h +3,7 %, „nass“ +4,8 % (signifikant). |
| Fusion 7 | 01.10.2026 | Wind-Anker über die Messdistanz gedämpft, e^(−(d/10 km)²) | Wind/Böe 0–6 h ohne Station +0,5/+0,6 %; Entwicklungsmenge gesamt +0,03 % gegen Fusion 6, nicht signifikant. |
| Fusion 6 | 30.09.2026 | Basis: Lernstufe Fit 5e (Hindcast 01.09.2025–21.09.2026, 40,8 Mio. Zeilen), Stationswert-Stack (14 Ausgabetage), gelernte Bewölkung, Klimatologie-Schritt aus | +3,1 % gegen Fusion 5e in Spur R (sauber, signifikant): der letzte große Sprung. |

- **Cube:** Stufe t1 0–48 h stündlich (Radar/INCA/CombiPrecip, ICON-D2, ICON-EU, MOSMIX-L), t2 51–120 h dreistündlich
  (ICON-EU, ICON, IFS), t3 126–336 h sechsstündlich (ICON, AICON, IFS HRES/ENS, AIFS). Ausgabe je Größe q10/q50/q90.
- **Tempo:** Punktabfrage im Replay im Median 62,6 ms (Grenze 300 ms).
- **Status:** „Champion“ seit 05.10. durch Jans Entscheidung (E-PS-14). Der Prüfstand selbst sagt „G1 nicht
  nachweisbar“, weil Spur P noch leer ist.

## Stärken

1. **Großer Abstand zu den Rohmodellen (sauber gemessen).** In Spur R liegt der Güteindex gegen die Klimatologie bei
   +17,8 % (95 %: +15,5 … +19,7 %). Cube roh kommt auf −41,2 %, Cube roh mit 0,65 K/100 m auf −32,9 %, die naive Fusion
   auf −15,9 %.
2. **An Stationen besser als MOSMIX-L.** Gleiche Stationen, gleiche Tage, MAE des Medians (Entwicklungsmenge, Rolle A):
   Temperatur 0,72 gegen 0,86 K (0–6 h), 0,88 gegen 0,95 K (6–24 h), 0,98 gegen 1,05 K (24–48 h). Der Taupunkt ist bis
   120 h 9–20 % besser. Beim Wind kommt der Vorsprung aus Österreich (+11 bis +27 % bis 120 h); in DE und CH ist es ein
   Gleichstand.
3. **Niederschlag ja/nein.** Brier-Skill für „nass“ gegen die Klimatologie (Rolle B): +49 % bei 0–6 h und +9 % bei
   48–120 h in Spur R, +48 % und +29 % in der Entwicklungsmenge. Fusion 8 hat mit dem Radar-Stundenmittel 0–6 h noch
   einmal +4,8 % gebracht.
4. **Gelände und Inversionen.** Bei der Temperaturdifferenz zwischen Tal- und Bergstation ist Fusion 9 in jeder Lage
   mindestens so gut wie der bessere von zwei naiven Ansätzen: nächste Zelle oder fester 0,65-K-Gradient. Der feste
   Gradient scheitert bei Inversion (6,47 K in Spur R), die nächste Zelle ohne Inversion (bis 5,85 K); Fusion 9 bleibt
   bei 1,4–2,9 K. Einzige Ausnahme: Taupunkt bei Inversion nach 48 h (2,36 gegen 2,24 K in Spur R).
5. **Bänder für Temperatur und Taupunkt brauchbar.** Bis 120 h liegt das Band q10–q90 in 75–86 % der Fälle (Soll 80 %,
   Entwicklungsmenge), in Spur R bei 73–90 %. Das enge Band des Gates G3 trifft das nicht überall, die Größenordnung
   stimmt aber.
6. **Technik und Methodik.** Die Rechnung ist deterministisch (gleicher Hash im zweiten Lauf), eine Punktabfrage dauert
   62,6 ms. Der Prüfstand besteht seinen A/A-Test (5,3 % Irrtum bei nominal 5 %) und alle fünf Negativkontrollen.

## Schwächen & Risiken

Die größte Schwäche ist der Punkt ohne eigene Station: Dort liegt Fusion 9 bei Temperatur und Wind deutlich hinter
MOSMIX-L, in der Schweiz am weitesten. Dazu kommen eine Langfrist, die nicht zur Klimatologie zurückfindet, und eine
Beweislage, die Fusion 9 gegenüber Fusion 8 nicht trägt.

**Diagramm 1 (als Tabelle): Skill gegen die Stationsklimatologie in %, Rolle B, alle Länder, Spur R (CRPS; „Regen
ja/nein“: Brier).** 6–48 h hat Spur R keine Fälle.

| Größe | 0–6 h | 48–120 h | 120–240 h | 240–336 h |
| --- | --- | --- | --- | --- |
| Temperatur | +62,6 | +38,5 | +24,0 | +7,0 |
| Taupunkt | +67,5 | +36,1 | +21,8 | +3,9 |
| Regen ja/nein | +49,2 | +9,1 | +2,1 | +1,9 |
| Wind | +20,8 | +3,0 | −7,8 | −13,8 |
| Böe | +38,1 | −5,0 | −23,8 | −20,0 |
| Bewölkung | +51,3 | −9,5 | −7,2 | −9,7 |

In der Entwicklungsmenge sind alle drei bei 48–120 h noch positiv und kippen erst nach 5 Tagen; Wind fällt dort bei
240–336 h auf −54 %. Der Klimatologie-Schritt ist seit Fusion 6 abgeschaltet (`priorShrink: false`).

1. **Fusion 9 ist nicht nachweisbar besser als Fusion 8.** Auf Spur R und Entwicklungsmenge ±0,00 %; Spur P hat noch
   keinen Tag. Die Änderung wirkt nur bei Messungen abseits der vollen Stunde; das Archiv hat Stundenwerte, gemessen ist
   sie bisher nur an Straßenstationen. Der Champion-Status beruht auf Jans Entscheidung, nicht auf einer Messung.
2. **Ohne eigene Station hinter MOSMIX-L und kurzfristig nicht vor dem Rohcube.** MAE des Medians, Rolle B: Temperatur
   1,49 gegen 0,85 K (0–6 h), 1,19 gegen 0,94 K (6–24 h), 1,29 gegen 1,03 K (24–48 h); Wind 0,95 gegen 0,63 m/s und Böe
   1,21 gegen 0,95 m/s (0–6 h). Bei der Böe liegt Fusion bis 240 h überall dahinter.
    - Bei 0–6 h ist die Temperatur sogar schlechter als die nächste Rohzelle (1,45 K), bei 6–24 h gleichauf mit
      Rohzelle plus festem Gradienten. Erst ab 24 h liegt Fusion rund 6 % vorn.
    - Schweiz, Temperatur 0–6 h: 1,86 gegen 0,76 K bei MOSMIX-L und 1,87 K in der nächsten Rohzelle, also kein Gewinn.
    - Die 270 Stationen mit eigener Messung (Rolle A) liegen bei 0,72 K. Das sind andere Stationen, der Abstand zeigt
      aber, wie viel die Messung trägt und wie wenig das Downscaling.
    - Die naive Fusion (Mittel aus Rohcube + Lapse und MOSMIX der Station) liegt ohne Station bei 1,11 K (0–6 h) — auch
      sie profitiert vom MOSMIX-Heimvorteil.
3. **Mittelfrist im Median kaum besser als roh.** In Spur R ist der Temperatur-Median bei 48–240 h 2–3 % schlechter als
   Cube roh mit festem Gradienten. Die +22 bis +23 % „besser als jede Einzelquelle“ (alle Länder) kommen dort fast ganz
   aus dem Wahrscheinlichkeits-Score.
4. **Regen ab Tag 5 ohne Information.** Für „nass“ ist die Brier-Auflösung bei 240–336 h (0,0002–0,0025) kleiner als
   der Zuverlässigkeitsfehler (0,0014–0,0054): schlechter als die Basisrate der Stichprobe. In Spur R gilt das schon ab
   120 h.
5. **Bänder an den Rändern falsch breit.** Zu schmal: Wind ab 48 h mit 73–77 % Abdeckung in Spur R und 68–78 % in der
   Entwicklungsmenge; Temperatur lang nur in der Entwicklungsmenge (63–67 %, Bias −1,69 K bei 240–336 h). Zu breit:
   Niederschlagsmenge in allen Fenstern der Entwicklungsmenge (91–98 %), Böe 0–48 h (84–90 %). Die Böe hat in Spur R ab
   120 h einen Bias von −1,2 bis −1,4 m/s. Das Bewölkungsband ist ab 48 h 83–99 Prozentpunkte breit und sagt damit
   wenig. G3 bleibt trotzdem grün, weil das Gate nur Verschlechterungen gegen den Champion zählt.
6. **Naht bei 180 h.** In der Entwicklungsmenge springt der Fehler der Temperaturänderung über die Naht auf 3,09 K
   (davor 1,32 K, danach 1,65 K); in Spur R ist sie unauffällig.
7. **Dünne Beweislage.** Anker, Radar und Stationsprodukt lassen sich bisher nur auf der Entwicklungsmenge messen, in der
   der Stack-Fit liegt. Sie umfasst drei Wochen September/Oktober ohne Winter, Gewitter oder Sturm; Spur R enthält zwar
   einen Winter, aber ohne diese drei Bausteine. Alle Stationen waren im Fit. Globalstrahlung, Druck, Sichtweite,
   Niederschlagsart und Schneefallgrenze zeigt das Produkt, bewertet werden sie nicht.
8. **Betriebsrisiken.** Die gelernten Tabellen sind statisch, obwohl IFS 50r1 am 12.05. mitten ins Fit-Fenster fiel und
   ICON-EPS seit 06.10. ein neues Gitter hat. Der Hindcast-Weg über Open-Meteo ist kostenlos nur nicht-kommerziell nutzbar.

## Wettbewerbsvergleich

An Stationen spielt Fusion 9 auf dem Niveau der besten veröffentlichten Postprocessing-Verfahren für Deutschland und
schlägt MOSMIX-L. Ohne Station liegt sie hinter MOSMIX-L, etwa auf EMOS-Niveau. Direkt gemessen ist nur MOSMIX-L; alle
anderen Vergleiche sind Größenordnungen.

**Diagramm 2 (als Tabelle): Temperatur, MAE des Medians in K, Entwicklungsmenge 14.09.–04.10.2026, DE/AT/CH.**
„Bester Rohwert“ = je Fenster der bessere von nächster Rohzelle und Rohzelle mit festem Gradienten (Stichprobe ohne
Station); MOSMIX-L auf derselben Stichprobe (bei 24–120 h nicht ganz gepaart).

| Reihe | 0–6 h | 6–24 h | 24–48 h | 48–120 h | 120–240 h |
| --- | --- | --- | --- | --- | --- |
| Fusion 9 mit Station (Rolle A) | 0,72 | 0,88 | 0,98 | 1,25 | 2,00 |
| Fusion 9 ohne Station (Rolle B) | 1,49 | 1,19 | 1,29 | 1,52 | 2,22 |
| MOSMIX-L an der Station | 0,85 | 0,94 | 1,03 | 1,29 | 2,05 |
| Bester Rohwert | 1,46 | 1,18 | 1,37 | 1,61 | 2,29 |

| Referenz | Größe, Frist | Referenzwert | Fusion 9 mit / ohne Station | Vergleichbarkeit |
| --- | --- | --- | --- | --- |
| [Rasp & Lerch 2018](https://arxiv.org/abs/1805.09091): ECMWF-ENS, 499 DE-Stationen, 2016 | Temperatur CRPS, 48 h | roh 1,16 · EMOS lokal 0,90 · bestes NN 0,78 K | 24–48 h: 0,74 / 0,99 K | Fusion: drei Herbstwochen statt ganzes Jahr, nutzt Messungen und MOSMIX |
| [Schulz & Lerch 2022](https://arxiv.org/abs/2106.09512): COSMO-DE-EPS, 175 DE-Stationen, 2016 | Böe CRPS, 0–21 h | roh 1,33 · EMOS 0,95 · DRN/BQN 0,84 m/s | 0–6 h: 0,66 / 0,91 · 6–24 h: 0,81 / 0,97 m/s | Fusion-Fenster ohne Sturmlagen |
| [meteoblue Monatsbericht](https://business.meteoblue.com/articles/forecast-transparency-meteoblue-monthly-accuracy-reports): Learning MultiModel | Temperatur MAE, Tag 1 / Tag 6 | 1,04 / 1,65 K | 6–24 h: 0,88 / 1,19 · 48–120 h: 1,25 / 1,52 K | Eigenangabe, global, über 100 000 Partnerstationen |
| [meteoblue Monatsbericht](https://business.meteoblue.com/articles/forecast-transparency-meteoblue-monthly-accuracy-reports): Learning MultiModel | Wind MAE, Tag 1 / Tag 7 | 0,81 / 0,99 m/s | 6–24 h: 0,72 / 1,00 · 120–240 h: 1,01 / 1,31 m/s | wie oben |
| [meteoblue Anbietervergleich 2021](https://content.meteoblue.com/en/research-education/weather-data-accuracy/air-temperature/): 475 METAR-Stationen | Temperatur MAE, 12–35 h | 1,29 K | 0,88–0,98 / 1,19–1,29 K | Flughafenstationen, anderes Jahr |

**Drei Schieflagen im eigenen MOSMIX-Vergleich:**

- Der Güteindex (+23,6 % gegen +6,1 %) wertet MOSMIX deterministisch; sein CRPS ist damit sein MAE. Im MAE schrumpft
  der Abstand an Stationen bei der Temperatur auf 4–17 %.
- Für „nass“ bekommt MOSMIX nur 0/1 aus der Menge (`scripts/pruefstand/lib/referenzen.mjs`). Seine eigenen
  Wahrscheinlichkeiten (R101, wwP in MOSMIX-L) nutzt der Prüfstand nicht, der Brier-Vorsprung von Fusion ist deshalb zu
  groß.
- Ohne Station hat MOSMIX den Heimvorteil. Die faire Referenz für einen beliebigen Ort wäre MOSMIX der nächsten anderen
  Station; die fehlt ebenso wie die MeteoSwiss-Lokalprognose E4, die `QUELLENMATRIX.md` als Schweizer Messlatte nennt.

Kachelmannwetter, WetterOnline, Windy und Bergfex veröffentlichen keine vergleichbare Verifikation;
[ForecastWatch](https://forecastwatch.com/2025/07/31/new-report-analysis-of-2024-one-to-five-day-out-forecasts/) rankt
nur Tageswerte und Niederschlagskategorien.

## Fazit-Protokoll

Fusion 9 ist eine saubere Korrektur am Anker, aber kein messbarer Fortschritt; der eigentliche Wert steckt in der
Rechenkette seit Fusion 6. „Beste Vorhersage im DACH-Raum für 0–336 h“ tragen die Daten heute nicht.

**Prüfstand-Kurzform** (Protokoll P1, Wahrheit W1, Spur R 70 Tage, Spur P 0 Tage)

- Status: Champion im Register durch Jans Setzung (E-PS-14); Urteil des Prüfstands: Kandidat ohne nachweisbaren
  Fortschritt.
- Fortschrittsindex gegen Fusion 8: +0,00 % auf Spur R und Entwicklungsmenge, Nachweisgrenze 0,0 %.
- Gates: G1 nicht nachweisbar · G2 grün · G3 grün · G4 grün.
- Produktaussage: 63 von 63 Kernzellen besser als jede Einzelquelle (Spur R), 76 von 99 (Entwicklungsmenge); im MAE des
  Medians deutlich weniger (siehe oben).
- Warnungen: Spur P leer; Spur R ohne Anker, Radar und Stationsprodukt; Entwicklungsmenge mit 1 955 197 unreifen Werten
  und den Fit-Tagen des Stacks.
- Bericht: `audit/pruefstand/berichte/fusion-9/2026-10-05-abnahme/bericht.html`

**Ehrliche Einschätzung**

- **Was trägt:** Gegenüber den Rohmodellen ist Fusion ein großer, sauber belegter Schritt. An Messstationen ist sie in
  den ersten fünf Tagen bei Temperatur und Taupunkt genauer als MOSMIX-L, beim Wind nur in Österreich. Das ist
  beachtlich, aber auch erwartbar, weil MOSMIX und die Messung Eingänge sind.
- **Was nicht trägt:** Am beliebigen Ort ohne Station, also im Kern des Produkts, liegt sie bei Temperatur, Wind und
  Böe hinter MOSMIX-L an dessen eigener Station und in den ersten 24 h nicht vor dem Rohcube. Nach 2 bis 5 Tagen fallen
  Böen, Bewölkung und Wind unter die Klimatologie.
- **Versionsnummern:** Fusion 7, 8 und 9 haben zusammen +0,21 % gebracht (Entwicklungsmenge; in Spur R 0).
- **Prüfstand:** stärkstes Werkzeug; zwei Darstellungen schönen die Produktaussage (CRPS gegen MAE, MOSMIX-„nass“ als 0/1).

**Nächste Schritte, nach Hebel geordnet** (Empfehlung der Sitzung, keine Vorgabe)

1. Abnahme erst mit mindestens 4 reifen Spur-P-Tagen.
2. Langfrist zur Klimatologie führen (Wind, Böe, Bewölkung ab 48 h) und Ensemblemittel in t3. Sauber messbar in Spur R.
3. Downscaling ohne Station (gridded MOS, Nacht-/Kaltluftterm), Messgröße Rolle B 0–48 h, Schweiz zuerst.
4. Prüfstand fairer machen (wäre P2): MOSMIX der nächsten Station, MOSMIX-Wahrscheinlichkeiten, E4, MAE neben CRPS,
   ungesehene Stationen aus Schema 5.
5. Bänder kalibrieren (σ je Größe × Fenster).
6. Vor öffentlichen Genauigkeitsaussagen einen Winter in Spur P sammeln.
