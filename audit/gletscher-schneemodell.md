# Phase GM — Schneemodell am Gletscher („virtueller Schneesensor“)

> Stand 22.11.2026 kurz vor Mitternacht: GM-0 (Diagnose, Quellen, M-1), GM-1 (Schneekern, §3a) und GM-2 (drei Höhen im Producer, eigene Schneefallgrenze, §3b) gebaut und lokal committet (nicht gepusht), nichts im Daten- oder Archiv-Repo. Der Schalter von GM-2 ist **ein** (E-GM-6, Jan 22.11. „einschalten und committen“, §3b.7); er wirkt mit dem Push von `main`.
> **GM-3 (Eichung, §3c) gebaut, uncommitted:** Tabelle `scripts/glacier/snow-calibration.json` nach eingefrorener Methode — Niederschlagsfaktor 1,79 (Schweiz) / 2,33 (Österreich) statt 1,289, Urteil **rot** (K-2, K-4: kein belastbarer Höhenverlauf), Neuschneedichte 96 statt 68 kg/m³.
> **GM-3b (E-GM-7 + E-GM-8, §3d) gebaut 23.11., uncommitted, beide Schalter AUS:** der Schmelzlauf kann mit dem Faktor je Land rechnen (`--precip=country`, ohne Höhenverlauf), der Schneekern mit 96 kg/m³ und der Spanne 65–148 (`board`, zweiter Konstantensatz). Ohne Schalter schreibt der Producer dieselben Bytes wie vorher und öffnet die Tabelle nicht. E-GM-9 … E-GM-13 warten auf Jan.
> Ausgangspunkt: `audit/qualitaetspruefung-seewetter-gletscher-2026-11-22.md` (K-2, K-3, M-17, M-18, G-26) und die Recherche vom selben Tag.

## 1. Auftrag und Jans Entscheidungen

Ziel (Jan, 22.11.): auf der vorhandenen Datengrundlage das beste Modell für Schneehöhe, Neuschnee und die übrigen Wettergrößen an einem Gletscher bauen, jetzt vollständig einbauen und im nächsten Jahr verifizieren. Grundlage ist buscosun Fusion 14.

| Nr. | Entscheidung (Jan, 22.11.2026) | Wortlaut |
|---|---|---|
| E-GM-1 | Anzeige ab dem ersten Tag, nicht erst nach einem Schattenbetrieb | „ab eins“ |
| E-GM-2 | Neue Daten in `buscosun-data` und `buscosun-archiv` sind für diese Phase freigegeben | „ja das müssen wir updaten auf jeden Fall, du hast alle Genehmigungen“ |
| E-GM-3 | Eigene Phase mit Diagnose, eingefrorenem Protokoll und Verifier (kein Schnellmodus) | „ja okay“ |
| E-GM-4 | Jan prüft die Quellenliste (§4) selbst | „schreib alle benötigten Quellen zusammen, ich prüfe sie“ |

Grenze, die bleibt: buscosun Fusion (`src/pointForecast/**`) wird nicht geändert. Das Schneemodell ist ein nachgelagertes Produkt, wie der virtuelle Fahrbahnsensor (`road/vs/v1`), der die Fusion-Ausgabe nur liest.

## 2. Diagnose: was es gibt und was fehlt

**Vorhanden**
- Schmelzkern `scripts/glacier/lib/meltcore.mjs`: Schneewasser je 50-m-Band (mm), fortgeschrieben je Lauf, in `glacier/v1/melt/state.json`. Kein Client liest die Datei, sie wird nicht archiviert.
- Akkumulation `S = pf · P · corr[b] · fs` mit `pf = 1,289` (an GLAMOS-Winterbilanzen geeicht), Gradient +4 % je 100 m (`set`), Phase als Rampe 0–2 °C (`set`).
- „Wetter am Gletscher“ (`weathercore.mjs`): Neuschnee = Niederschlag × Schneeanteil je Höhe, ohne `pf` und ohne Gradient. Am 22.11. waren bei 935 von 957 Gletschern alle drei Höhen gleich.
- Messungen im Speicher: Stations-Schneehöhe (Tirol, Südtirol, IMIS, obs/v1), Änderung der Schneehöhe (Tirol), SNOWGRID (Österreich), Sentinel-2-Schneegrenze und Schneeanteil.

**Fehlt**
1. Schneedichte und Setzung, also Schneehöhe und Neuschnee in cm.
2. Kopplung an gemessene Schneehöhen. Einzige Kopplung ist der Satelliten-Abgleich (250 mm / 0), der in jedem Lauf neu greift.
3. Niederschlag je Region und Höhe geeicht statt eines Faktors für alle.
4. Verteilung auf dem Gletscher (Wind, Lawinen): nicht einmal statistisch.
5. Prüfstand, Schattenpaare und Archiv für den Schneezustand.
6. Spannen für den Schneezustand (die 40 Szenarien streuen nur die Temperatur).
7. Einschwingen: nach 30 Stunden ohne Lauf startet der Zustand bei null.

**Bekannte Güte:** Gate C (26 Schweizer Gletscher, 75 Gletscherjahre 2023–2025, Stationsantrieb): Winterbilanz-MAE 0,364 m w. e. gegen die Schwelle 0,35; Einzelfehler −888 … +1 272 mm. Nie je Höhenband und nie mit Fusion-Antrieb geprüft.

## 3. Messung M-1: buscosun Fusion an drei Höhen desselben Gletschers

Frage: Liefert der Aufruf des Producers (flaches Gelände in der gewünschten Höhe) an Zunge, Mitte und Oberkante verschiedene Werte, oder muss weiter hochgerechnet werden?

Werkzeug: `gm-three-heights.mjs` (Scratchpad, wird in GM-1 als `scripts/glacier/` übernommen), Cube aus dem lokalen Klon `C:\dev\buscosun-data` (Stand 04.11.2026, t1 `2026110409`), Uhr auf 04.11. 10:30 UTC, 48 Stunden, ohne Radar.

| Gletscher | Höhe | T Mittel | Taupunkt | Niederschlag | Schneefallgrenze | P(Schnee) |
|---|---|---|---|---|---|---|
| Pasterze | 2 077 m | 4,4 °C | −12,5 °C | 0,5 mm | 1 940 m | 0,3 |
| | 3 016 m | −1,1 °C | −15,3 °C | 0,5 mm | 1 913 m | 0,9 |
| | 3 658 m | −4,6 °C | −17,1 °C | 0,5 mm | 1 911 m | 1,0 |
| Aletsch | 1 639 m | 3,8 °C | −6,1 °C | 1,7 mm | 1 840 m | 0,3 |
| | 3 147 m | −5,5 °C | −9,6 °C | 1,8 mm | 1 819 m | 1,0 |
| | 4 119 m | −11,4 °C | −12,0 °C | 1,7 mm | 1 847 m | 1,0 |
| Hintereisferner | 2 400 m | −0,2 °C | −6,5 °C | 0,3 mm | 1 749 m | 0,8 |
| | 3 066 m | −4,1 °C | −9,7 °C | 0,3 mm | 1 794 m | 1,0 |
| | 3 715 m | −7,7 °C | −10,8 °C | 0,3 mm | 1 804 m | 1,0 |
| Nördl. Schneeferner | 2 492 m | 1,4 °C | −9,1 °C | 0,2 mm | 1 959 m | 0,7 |
| | 2 583 m | 0,9 °C | −9,5 °C | 0,2 mm | 1 959 m | 0,8 |
| | 2 835 m | −0,6 °C | −10,4 °C | 0,2 mm | 1 959 m | 0,9 |

Befunde:
- **Temperatur, Taupunkt, Wind, Böe und P(Schnee) ändern sich mit der Höhe.** Der Gradient liegt bei 5,5–6,2 K/km statt der 6,5 K/km der heutigen Hochrechnung. Drei Abfragen ersetzen die Hochrechnung.
- **Der Niederschlag ändert sich nicht mit der Höhe** (0,5/0,5/0,5 mm). Die Höhenzunahme muss das Schneemodell selbst tragen.
- **Die Schneefallgrenze hängt nicht von der Abfragehöhe ab** und lag in dieser trockenen Lage bei plausiblen 1 750–1 960 m. Die Werte bis 10 m vom 22.11. (K-2) treten also nicht immer auf; die Kaltluftlage ist in GM-2 gezielt nachzustellen.
- **Kosten:** rund 0,1 s je zusätzlicher Abfrage, sobald die Kachel geladen ist (erste Abfrage 0,8 s). Drei Abfragen für 2 094 Gletscher sind unkritisch.
- **Nebenbefund:** An der Pasterze (2 077 m) trägt ein MOSMIX-Stationswert 65 % des Temperaturgewichts. Welche Station das ist und ob das in dieser Höhe sinnvoll ist, klärt GM-2 (nur lesen, keine Änderung an buscosun Fusion).

Einschränkung: eine Lage (Hochdruck, fast trocken), vier Gletscher, Cube vom 04.11. Keine Aussage über Niederschlagslagen.

## 3a. GM-1: Schneekern und Messung M-2 (22.11.)

**Gebaut:** `scripts/glacier/lib/snowcore.mjs` (rein, ohne Netz und ohne buscosun Fusion) und `verify:glacier-snowcore` (23/23). Noch nicht im Producer verdrahtet, nichts veröffentlicht.

Der Kern führt je Höhenband eine Schneedecke aus einer Altschneeschicht und frischen Schichten von je höchstens 6 Stunden, die 72 Stunden getrennt bleiben. Er fügt dem Wasserwert des Schmelzkerns nur die Dicke hinzu, nie Masse.

| Schritt | Regel | Quelle |
|---|---|---|
| Neuschneedichte | 68 kg/m³, Spanne 56–80 (p10–p90 aus der Standardabweichung 9) | Helfricht et al. 2018, gemessenes Stundenmittel an vier Alpenstationen |
| Setzung von Neuschnee | rund 1 % je Stunde bei 0 °C, langsamer bei Kälte, bis 81 kg/m³ | Anderson 1976, wie in Helfricht et al. 2018 (Gl. 1a) gedruckt |
| Setzung von Altschnee | Viskosität wächst mit der Dichte, Last = Schnee darüber | Winkler et al. 2021 (Δsnow, Gl. 1), geeichte Werte |
| Stauchung durch neue Last | sofort beim Schneefall, nur für Schichten ab 81 kg/m³ | Winkler et al. 2021 (Gl. 2) |
| Schmelze | nimmt Masse und Dicke von oben | Menge kommt aus dem Schmelzkern |

Gesetzt (`set`) sind: die Übergabe bei 81 kg/m³, die Schichtdauer 6 h, die Haltezeit 72 h, die Untergrenze 50 kg/m³ und die Dichte 250 kg/m³ für einen übernommenen Altbestand. Zweite Dichteregel im Kern, nicht Voreinstellung: Vionnet et al. 2012 (Temperatur und Wind).

Abweichung von der Quelle, benannt: Δsnow ist für Tagesschritte und Stationen auf 590–1 780 m geeicht; der Kern rechnet stündlich und in Gletscherhöhe.

**Messung M-2:** der Kern mit GEMESSENEM Tagesniederschlag und gemessener Temperatur gegen GEMESSENE Schneehöhe und gemessenen Neuschnee (GeoSphere `klima-v2-1d`, Q7), 1.11.2025–28.2.2026, ohne jede Eichung.

| Station | Tage mit Neuschnee ≥ 3 cm | Neuschnee gemessen | Modell | Abweichung / mittlerer Fehler | gemessene Tagesdichte |
|---|---|---|---|---|---|
| Obergurgl (1 941 m) | 19 | 11,5 cm | 8,9 cm | −2,6 / 3,1 cm | 64 kg/m³ |
| Pitztaler Gletscher (2 864 m) | 33 | 11,4 cm | 8,3 cm | −3,0 / 3,3 cm | 52 kg/m³ |
| Sonnblick (3 109 m) | 37 | 16,1 cm | 14,2 cm | −1,9 / 5,0 cm | 81 kg/m³ |
| zusammen | 89 | | | −2,5 / 3,9 cm | 68 kg/m³ |

Befunde:
- **Die Neuschneedichte stimmt.** Niederschlag geteilt durch gemessene Neuschneehöhe ergibt an Tagen unter −1 °C im Mittel 68 kg/m³, genau der Literaturwert. Je Station 52–81.
- **Neuschnee je Schneefalltag liegt 2,5 cm (rund 20 %) zu niedrig**, mittlerer Fehler 3,9 cm. Ob das an der Setzung des ersten Tags oder am Minderfang der Niederschlagsmesser liegt, trennt diese Messung nicht.
- **Die Schneehöhe ist mit gemessenem Niederschlag nicht zu treffen** (über elf Stationen ab 1 400 m: gemessen 53 cm, Modell 33 cm, mittlerer Fehler 29 cm). Am Pitztaler Gletscher fielen laut Messer 150 mm in vier Monaten bei im Mittel 1 m Schnee; am Sonnblick liegt das Modell 17 cm zu hoch (Windabtrag am Gipfel). Der Niederschlag ist die bestimmende Fehlerquelle, nicht Dichte oder Setzung. Das bestätigt die Reihenfolge der Pakete: Eichung des Niederschlags (GM-3) und Kopplung an gemessene Schneehöhen (GM-4) entscheiden über die Güte.
- **Zwei Fehler im ersten Entwurf des Kerns, durch die Messung gefunden:** Δsnow allein setzte stündlichen Neuschnee am ersten Tag um den Faktor 1,6 zu stark (behoben durch das Neuschnee-Gesetz der Quelle); das 24-Stunden-Fenster ließ die erste Schicht des Tages aus (behoben, angeschnittene Schichten zählen anteilig).

Einschränkung: drei bis elf Stationen, ein Winter, Tageswerte gleichmäßig auf 24 Stunden verteilt, Phase über das Tagesmittel ≤ 1 °C (Prüfregel, nicht die Produktregel).

**Nebenbefund:** Die offene Schnittstelle der SLF-Messfelder (Q6) liefert nur den jeweils letzten Tag, keine Historie. Für die Eichung braucht es entweder die historischen Dateien des SLF-Datenservice oder eine eigene tägliche Ablage ab sofort (V-GM-5).

## 3b. GM-2: drei Höhen im Producer, eigene Schneefallgrenze (22.11.)

Werkzeuge und Belege: `audit/gletscher-schneemodell/` (`gm2-probe.mjs` + Ausgabe, `gm2-m3.mjs` + Ausgabe, `gm2-analyse.mjs`, `gm2-mutations.mjs`). Cube für alle Messungen: `489c0e4` vom 21.11. 17:43 UTC (t1 `2026112115`, t2 `2026112112`, t3 `2026112100`), Uhr auf 21.11. 17:50 UTC, Stand buscosun Fusion 14.

### 3b.1 Diagnose (vor dem Code)

**Ist-Stand.** `melt.mjs` fragt buscosun Fusion je Gletscher mit eigenem Antrieb einmal (flaches Gelände in der Medianhöhe). Zunge und Oberkante bekommen die Temperatur über einen Gradienten (an die Nullgradgrenze gehängt, sonst 6,5 K/km), den Schneeanteil über die Rampe 0–2 °C. Die Schneefallgrenze der Karte ist der Wert `snowline` der Antwort.

**K-2 nachgestellt** (Sonde an 12 Gletschern, je drei Abfragen, 120 Stunden):

| Gletscher | Stunde | Schneefallgrenze der Antwort | Zunge | Mitte | Oberkante | pSnow an allen drei |
|---|---|---|---|---|---|---|
| Pasterze (2 075 / 3 016 / 3 625 m) | +38 h | 138 m | −6,2 °C | −11,5 °C | −14,9 °C | 1 |
| | +41 h | 45 m | −6,6 °C | −12,8 °C | −16,8 °C | 1 |
| Hallstätter Gletscher (2 275 / 2 579 / 2 825 m) | +35 h | 51 m | −7,4 °C | −9,3 °C | −10,8 °C | 1 |
| | +38 h | 3 m | −9,7 °C | −11,6 °C | −13,2 °C | 1 |
| Aletsch (1 725 / 3 147 / 4 125 m) | +6 h | 1 732 m | 3,1 °C (Feuchte 12 %, Feuchtkugel −2,8 °C) | −4,6 °C | −9,5 °C | 0,60 / 1 / 1 |
| | +18 h | 1 822 m | 4,2 °C (Feuchtkugel 0,6 °C) | −4,8 °C | −10,4 °C | 0,18 / 1 / 1 |

Befunde:
- **Die Werte „10 m“ sind kein Rechenfehler des Producers.** `snowline` ist der Zellwert `snowlmt` der Modelle (in `output.ts` unverändert aus der Zelle gelesen), er hängt nicht von der Abfragehöhe ab. In einer Luftsäule ohne Schmelzschicht läuft das Modellfeld gegen null. Gemeint ist „Schnee bis in jede Höhe“, gezeigt wird eine Meterzahl. Im Volllauf sind 339 von 58 196 Stundenwerten unter 100 m, 1 364 unter 500 m. Nach +46 h gibt es nur noch vereinzelt Werte, nach +115 h keine.
- **Grenze und Phase widersprechen sich selten in der Richtung.** In 572 Stunden liegt die Grenze der Antwort unter der Zunge; nur in 9 davon ist pSnow an der Zunge unter 0,5. Der Widerspruch aus K-2 („Grenze unter der Zunge, aber Regen an der Zunge“) entsteht durch die Rampe 0–2 °C auf der trockenen Temperatur: bei trockener Luft liegt die Feuchtkugel 5–6 K darunter (Aletsch +6 h).
- **pSnow fällt in allen 1 150 geprüften Stunden mit der Höhe nicht ab.** Die Temperatur schon: am Gepatschferner ist die Zunge nachts kälter als die Oberkante (−9,7 gegen −6,5 °C), buscosun Fusion rechnet dort eine Inversion.
- **pSnow gibt es nicht überall stündlich.** Ohne MOSMIX-Station (Gepatschferner) steht es nach +46 h nur an den 3-Stunden-Schritten; `fillPhase` überbrückt bis 6 Stunden.

**V-GM-1 beantwortet, Messung M-3.** Die Station ist die nächste MOSMIX-Station bis 15 km: Großglockner (3 797 m, 2,5 km) für die Pasterze, Jungfraujoch (3 571 m, 4,2 km) für den Aletsch. Sie trägt 55–96 % des Temperaturgewichts an der Zunge. Die eigene Regel von buscosun Fusion (±100 m Höhenunterschied) wird nicht geprüft, weil der Producer keine Punkthöhe für die Stationswahl übergibt (`terrain: false`, Hinweis „Höhenkriterium NICHT geprüft“ in der Antwort). M-3 misst, ob das schadet: 158 Bergstationen ab 1 800 m aus `glacier/v1/stn`, Stunde 21.11. 17 UTC, Abfrage wie der Producer in Stationshöhe.

| Abfrage | Abweichung im Mittel | mittlerer Fehler |
|---|---|---|
| A: wie heute, Höhenkriterium nicht geprüft | −0,32 K | 1,27 K |
| B: Punkthöhe übergeben, Station über ±100 m verworfen | +0,61 K | 1,22 K |
| nur die 121 Stationen, an denen sich A und B unterscheiden | A −0,49 K / B +0,72 K | A 1,28 K / B 1,22 K |

Kein Unterschied, der eine Änderung trägt (eine Stunde, eine Lage). Der Aufruf bleibt, wie er ist; der Befund steht als V-GM-9.

### 3b.2 Entwurf

1. **Schalter** `--heights=median|three` an `melt.mjs` (oder `GLACIER_WEATHER_HEIGHTS`), Voreinstellung `WEATHER_HEIGHTS_DEFAULT` in `weathercore.mjs` — gebaut mit `'median'` (ohne den Schalter rechnet der Lauf wie bisher), seit E-GM-6 `'three'` (§3b.7); `median` ist der Rückfall.
2. **Drei Antworten:** mit `three` zwei weitere Abfragen je Gletscher mit eigenem Antrieb (flaches Gelände in Höhe der Zunge und der Oberkante). Nur der Wetterteil liest sie; der Schmelzlauf bleibt bei der Medianhöhe.
3. **Temperatur** an Zunge und Oberkante ist die der eigenen Antwort.
4. **Schneeanteil** je Höhe nach der Regel des Laufs an der eigenen Antwort: `temperature` = Rampe auf der Temperatur dieser Höhe, `psnow` = das pSnow dieser Höhe (statt der Verschiebung von der Medianhöhe aus Phase GS).
5. **Reihenfolge** (`order: not-more-below`): unten nie mehr Schneeanteil als oben. Grund: Schnee, der in einer milden Schicht geschmolzen ist, kommt darunter nicht wieder; und der Leser der Seite verwirft ein ganzes Dokument, das an der Zunge mehr Neuschnee nennt als oben. Geänderte Stunden werden gezählt.
6. **Eigene Schneefallgrenze** `slo` neben der unveränderten `sl` der Antwort: die Höhe, in der der Schneeanteil der Regel ½ ist. Zwischen den Antworten linear in der Temperatur, außerhalb mit dem Gradienten der zwei nächsten Antworten (begrenzt auf −9 … −3 K/km, `set`). Genannt wird sie nur im Gletscher und bis 500 m darunter oder darüber (`set`); jenseits davon steht kein Wert, sondern die Seite (`slk`: 1 im Gletscher, 2 unter der Zunge, 3 unter der Reichweite, 4 über der Oberkante, 5 über der Reichweite). Je Tag die mittlere Stunde in dieser Reihenfolge, kein Mittel.
7. **Nachbar-Antrieb** unverändert: nur Temperatur, über den Gradienten.
8. **Rückfall:** fehlt eine der zwei Antworten, entsteht die Zeile wie bisher und trägt `lv: lapse`.

Die erste Fassung schrieb die eigene Grenze in das Feld `sl`. Am Volllauf zeigte sich, dass sie in der Kaltlage vom 21.11. in 98 % der Stunden „unter der Reichweite“ ohne Zahl ist; die heutige Anzeige hätte fast nur Lücken gezeigt. Deshalb steht sie jetzt daneben, und `sl` bleibt.

### 3b.3 Umsetzung

Geändert: `src/glacier/glacierWeatherContract.ts` (additiv), `scripts/glacier/lib/weathercore.mjs`, `scripts/glacier/melt.mjs`, `scripts/verify-glacier-weather.mjs` (Block H). Neu: `scripts/glacier/make-weather-levels-fixture.mjs`, Fixture `scripts/lib/fixtures/glacier/weather-levels.json` (echte Antworten an drei Höhen für Hallstätter Gletscher und Grossen Aletschgletscher, 84 KB). Nicht angefasst: buscosun Fusion (`src/pointForecast/**`, `src/point/**` nur gelesen), Publisher, Workflows, Seite, Daten- und Archiv-Repo.

| Feld | Dokument | Inhalt |
|---|---|---|
| `rules.levels` | Tagesdokument | `{ rule: answers, snowline: half-share, reach: 500, order: not-more-below, daily: median, origin: set }`; fehlt ohne den Schalter |
| `tn`, `tx`, `t` an Zunge und Oberkante | beide | Temperatur der eigenen Antwort dieser Höhe (Feldnamen wie bisher) |
| `sn`, `snq`, `s` | beide | Schneeanteil der Regel des Laufs je Höhe aus der eigenen Antwort |
| `slo` | Tageszeile (14), Stundenzeile (120) | eigene Schneefallgrenze in m auf 10, `null` außerhalb der Reichweite |
| `slk` | Tageszeile (14 Ziffern), Stundenzeile (120 Ziffern) | Art jedes Werts von `slo` (0–5) |
| `lv: lapse` | Tageszeile | Rückfall: eine der zwei Antworten fehlte, Zeile wie bisher |
| `heights: three` | Eintrag in `melt/wx/phase.json` | der Regelvergleich dieses Laufs lief auf drei Antworten |
| `weather.levels` | Statuszeile | Zeilen mit drei Antworten, Rückfälle, geänderte Stunden (alle / mit Niederschlag), Sekunden der Zusatzabrufe |

`sl` (Schneefallgrenze der Antwort) und alle übrigen Felder bleiben, wie sie sind. `rules.lapse` bleibt `freezing-level`: der Leser der Seite verlangt das Wort, und es gilt weiter für die Zeilen mit Nachbar-Antrieb und für Rückfälle. Die zwei Prüfer, die die Seite aufruft (`weatherProblems`, `weatherHourlyProblems`), sind unverändert; die neuen Felder prüfen zwei eigene Funktionen (`weatherLevelProblems`, `weatherHourlyLevelProblems`), die nur der Producer aufruft.

Gesetzt (`set`): Reichweite 500 m, Gradient außerhalb −9 … −3 K/km (Standard −6,5 K/km, wenn die zwei Antworten weniger als 100 m auseinanderliegen), 18 von 24 Stunden für die Grenze eines Tages, die Regel „unten nie mehr als oben“, die Zählschwelle 0,02 für eine geänderte Stunde.

### 3b.4 Messung am lokalen Volllauf

`melt.mjs` am Cube vom 21.11., `--now=2026-11-21T17:50:00Z --always`, Lauf `2026112117`: 2 094 Gletscher, 2 084 Wetterzeilen (957 eigener Antrieb, 1 127 Nachbar), 10 übersprungen (`elevations`, wie im Live-Lauf). Vier Schalterstellungen und eine Wiederholung; Auswertung `gm2-analyse.mjs`, Ergebnis `gm2-analyse.json`. Eine Wetterlage (kalt, fast aller Niederschlag als Schnee).

**Funktionserhalt**
- Ohne Schalter sind alle 27 Wetterdateien **Byte für Byte** die des Standes vor GM-2 (Vergleichslauf aus Phase GS, `gs/out-temp`). Gegenprobe: mit `three` weicht das Tagesdokument ab.
- Schmelzdokument und Zustand sind in allen vier Stellungen dieselben Bytes.
- Die Schneefallgrenze der Antwort (`sl`) ist mit `three` an allen 957 Zeilen je Tag und je Stunde dieselbe wie ohne.
- Ein zweiter Lauf mit `three` schreibt dieselben 27 Dateien.
- Kein Vertragsverstoß in keiner Stellung, weder mit den neuen Prüfern noch mit der eingefrorenen Kopie des Lesers vor Phase GS.

**Kosten**

| | ohne Schalter | `three` |
|---|---|---|
| Laufzeit, ruhige Maschine | 79–87 s | 185–201 s |
| Laufzeit unter Fremdlast | 109 s | 244–302 s |
| Tagesdokument roh / brotli | 2 379 774 / 320 614 B | 2 476 223 / 314 682 B (+4 % / −2 %) |
| 26 Stunden-Chunks roh / brotli | 3 797 175 / 456 945 B | 4 501 696 / 466 213 B (+19 % / +2 %) |
| Abrufe von buscosun Fusion | rund 970 | rund 2 900 (zwei mehr je Gletscher mit eigenem Antrieb) |

Rund 105 Sekunden mehr je Lauf auf dieser Maschine (Statuszeile `weather.levels.seconds`: 104–106 in drei ruhigen Läufen); der Runner brauchte für den Lauf ohne Schalter zuletzt 54 s. Kein Rückfall (`lv: lapse`) an 957 Zeilen.

**Temperatur: drei Antworten gegen die Hochrechnung** (957 Gletscher × 48 Stunden)

| | Unterschied im Mittel | mittlerer Betrag | p10 … p90 | über 2 K |
|---|---|---|---|---|
| Zunge | −0,15 K | 0,21 K | −0,5 … +0,1 K | 0,7 % der Stunden |
| Oberkante | +0,18 K | 0,22 K | −0,1 … +0,5 K | 1,3 % der Stunden |

Der Gradient Zunge → Oberkante (Gletscher ab 300 m Höhenspanne) liegt im Median bei −6,2 K/km (p10 −6,9, p90 −4,7) statt fest bei −6,5; in 1 % der Stunden ist die Zunge kälter als die Oberkante.

**Neuschnee, Summe über 957 Gletscher und 14 Tage (mm Wasserwert)**

| Stellung | Zunge | Medianhöhe | Oberkante | Gletscher mit gleicher Summe an Zunge und Oberkante |
|---|---|---|---|---|
| eine Antwort, `temperature` (heute) | 40 734,6 | 41 004,5 | 41 008,3 | 789 |
| drei Antworten, `temperature` | 40 911,6 | 41 003,7 | 41 006,0 | 899 |
| eine Antwort, `psnow` | 40 059,8 | 40 698,6 | 40 861,8 | 66 |
| drei Antworten, `psnow` | 40 439,2 | 40 696,6 | 40 806,1 | 207 |

Befund: **drei Antworten ändern den Neuschnee um weniger als 1 %.** Der Niederschlag ist an allen drei Höhen derselbe (M-1), in dieser Kaltlage fällt er fast überall ganz als Schnee. „Gleiche Neuschneewerte an allen Höhen“ aus der Qualitätsprüfung behebt GM-2 also nicht; das trägt erst die Höhenzunahme des Niederschlags (GM-3).

**Eigene Schneefallgrenze** (957 Gletscher × 120 Stunden = 114 840 Stundenwerte)

| | im Gletscher | unter der Zunge, bis 500 m | unter der Reichweite (kein Wert) | über der Oberkante |
|---|---|---|---|---|
| Regel `temperature` | 128 | 1 623 | 113 085 | 4 |
| Regel `psnow` | 18 | 605 | 114 217 | 0 |
| zum Vergleich: Grenze der Antwort | 58 196 Werte, davon 58 189 unter der Zunge und 339 unter 100 m; 56 644 Stunden ohne Wert | | | |

Je Tag (13 398 Gletscher-Tage): unter `temperature` 5 im Gletscher, 104 unter der Zunge, 13 289 unter der Reichweite. Die eigene Grenze sagt in dieser Lage fast immer nur „der ganze Gletscher liegt im Schneefall“. Kein Wert liegt weiter als 495 m unter einer Zunge.

**Regel „unten nie mehr als oben“.** Gezählt wird eine Stunde ab einem Unterschied von 0,02 im Schneeanteil (darunter liegt das Rundungsrauschen von pSnow; die erste Fassung zählte jeden Unterschied und kam unter `psnow` auf 10 571 Stunden). Im Volllauf, 321 552 Gletscher-Stunden: unter `temperature` 19 Stunden, davon 2 mit mindestens 0,1 mm/h; unter `psnow` 212, davon 142 mit Niederschlag. Stichprobe zur Größe (`gm2-order.mjs`, 117 Gletscher, 39 312 Stunden, `psnow`): in 944 Stunden irgendein Unterschied, in 27 mehr als 0,02, größter 0,10 (bei 0,04 mm Niederschlag); weggenommener Neuschnee zusammen 0,5 mm. Die Dokumente sind nach der Umstellung des Zählers Byte für Byte dieselben (zwei Nachläufe, je 27 Dateien).

**Regelvergleich der Phase GS mit drei Antworten:** Verschiebung `psnow` gegen `temperature` 1,03 % an der Zunge (mit einer Antwort 1,50 %), 0,62 % in der Medianhöhe, 0,39 % an der Oberkante.

### 3b.5 Gate (22.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-weather` | **41/41** (33 wie vorher + Block H mit 8 Prüfungen) |
| H1 echte Antworten | Fixture `weather-levels.json`: K-2 an echten Werten (Grenze der Antwort unter 200 m bei unter −5 °C an allen drei Höhen) |
| H2 Kern | Temperatur und Schneeanteil je Höhe aus der eigenen Antwort; `sl` unverändert; ohne drei Antworten keines der neuen Felder |
| H3, H4 Handrechnung | Grenze bei 1 °C an fünf Lagen, begrenzter Gradient, Inversion, Tag als mittlere Stunde |
| H5 echte Antworten | Art jeder Stunde passt zu den Schneeanteilen derselben Zeile, kein Wert jenseits der Reichweite, wiederholbar |
| H6 Schalter Ende zu Ende | gebaut: ohne Schalter und mit `median` dieselben Bytes; seit E-GM-6: ohne Schalter dieselben Bytes wie `three`, `median` (Schalter oder Umgebungsvariable) die Dokumente wie vor GM-2; `three` = drei Abrufe je Gletscher; unbekanntes Wort ⇒ kein Wetterdokument; Schmelzdokument in jeder Stellung gleich |
| H7 Nachbar, Rückfall, alter Leser | Nachbarzeile unverändert; Rückfall mit `lv: lapse`; eingefrorener Vertrag vor GS nimmt die Dokumente an |
| H8 Negativkontrollen | 13 Verletzungen am Tagesdokument, 5 am Stunden-Chunk, jede gemeldet |
| Gegenprobe des Prüfers | `gm2-mutations.mjs`: 11 Mutationen am Producer-Code. Im ersten Durchgang fielen 10 auf; die elfte (Schneeanteil der Zunge aus der Antwort der Medianhöhe) blieb grün, dafür kam eine Prüfung in H6 dazu, danach rot. Der Durchgang liegt in `gm2-mutations.json` |
| lokaler Volllauf | §3b.4 |
| übrige Prüfer | `glacier-melt` 41/41, `glacier-snow-view` 19/19, `glacier-publish` 34/34, `glacier-contract` 64/64, `glacier-snowcore` 23/23, `glacier-dossier-heute` 21/21 |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281) |
| `npm run budget` | grün: eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 117,2 / 2 118 KB — derselbe Wert wie vor GM-2, die neuen Vertragsprüfer liegen nicht im Bundle |

Nicht geprüft: kein Lauf auf dem Runner, keine Anzeige (die Seite liest keines der neuen Felder), kein Browser, `verify:glacier-ui` (bricht an HEAD ab, V-GH-6). Gemessen an einer Wetterlage; eine Lage mit Regen bis in Gletscherhöhe fehlt (lokal liegt kein Sommer-Cube).

Die fünf Fragen: (1) Funktionserhalt — Byte-Vergleiche in §3b.4, H6, H7; (2) Desktop pixelgleich — kein Byte im Bundle geändert (Budget gleich), nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

### 3b.6 Entscheidung und Befunde aus GM-2

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-6 | Schalter einschalten (`WEATHER_HEIGHTS_DEFAULT = 'three'`)? Dafür: die Temperatur an Zunge und Oberkante kommt aus buscosun Fusion statt aus einem festen Gradienten, und `slo`/`slk` laufen für GM-7 ab sofort mit. Dagegen: rund 2 Minuten mehr je Lauf, viermal am Tag; gemessen an einer Lage. Die heutige Anzeige ändert sich nur in den Temperaturen (0,2 K im Mittel) und im Schneeanteil an Zunge und Oberkante. Empfehlung: einschalten | **entschieden: ein** (Jan 22.11. „einschalten und committen“), §3b.7 |
| V-GM-9 | An Gletscherpunkten trägt die nächste MOSMIX-Station bis 15 km das Temperaturgewicht, auch wenn sie 1 700 m höher steht; die ±100-m-Regel von buscosun Fusion läuft ins Leere, weil der Producer keine Punkthöhe übergibt. M-3 zeigt an einer Stunde keinen klaren Schaden. Mehrwert einer Klärung: die Temperatur an der Zunge hängt nicht an einem Gipfel. Skizze: M-3 über viele Stunden aus `glacier/v1/stn` wiederholen; die Höhe ließe sich ohne Änderung an buscosun Fusion über einen vorbelegten Gelände-Cache mitgeben, das ändert aber auch den Schmelzantrieb (Jans Entscheidung) | offen |
| V-GM-10 | `melt/wx/phase.json` zählt Läufe mit einer und mit drei Antworten zusammen; der Eintrag nennt `heights`, das Urteil trennt nicht. Skizze: Urteil je `heights` | offen; mit E-GM-6 relevant — vor einem Wechsel auf `psnow` (E-GS-3) das Urteil nur aus Läufen mit `heights: three` lesen |
| V-GM-11 | Die Anzeige zeigt weiter die Grenze der Antwort, also auch Werte unter 100 m (K-2 a). Mit `slk` kann sie sagen „Schneefall am ganzen Gletscher“ und den Modellwert als Angabe fürs Tal behandeln | GM-7 |
| V-GM-12 | Die 1 127 Zeilen mit Nachbar-Antrieb bleiben beim Gradienten. Skizze: eigene Abrufe auch für Klasse C (rund 3 400 mehr) oder die drei Antworten des Nachbarn auf die eigenen Höhen legen | offen |
| V-GM-13 | Die Reichweite von 500 m ist gesetzt; im Winter liegt die Grenze fast immer darunter. Eine Talhöhe je Gletscher (tiefster Punkt des Geländes im Umkreis) ergäbe „bis ins Tal“ statt einer festen Reichweite | GM-7 |
| V-GM-14 | „Zunge“ und „Oben“ sind weiter die Mitten des untersten und obersten 50-m-Bands (G-26 der Qualitätsprüfung) | offen |

### 3b.7 Einschalten (E-GM-6, Jan 22.11. „einschalten und committen“)

Eine Zeile: `WEATHER_HEIGHTS_DEFAULT = 'three'` in `scripts/glacier/lib/weathercore.mjs`. Der Workflow übergibt keinen Schalter, der Runner holt den Producer von `main` — der Schalter wirkt also mit dem Push (Jans Gate), nicht mit dem Commit. `median` bleibt der benannte Rückfall: als Schalter, als Umgebungsvariable `GLACIER_WEATHER_HEIGHTS` im Workflow (ohne Code) oder als Voreinstellung.

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-weather` | 41/41. H6 prüft jetzt: ohne Angabe dieselben Bytes wie `three` (neun Abrufe für drei Gletscher), `median` als Schalter und als Umgebungsvariable die Dokumente wie vor GM-2 (drei Abrufe), beide Stellungen verschieden (Negativkontrolle). Die Blöcke A–G laufen unverändert mit der neuen Voreinstellung |
| Gegenprobe `gm2-mutations.mjs` | gegen den angepassten Prüfer wiederholt: 11 von 11 bemerkt (die Mutation „Voreinstellung“ ist jetzt der Weg zurück auf `median`); `gm2-mutations.json` ist dieser Durchgang |
| Volllauf ohne Schalterangabe | 338 Dateien, Byte für Byte der Lauf `three` aus §3b.4 (0 Unterschiede, auch `phase.json`); `weather.levels`: 957 Zeilen, 0 Rückfälle, 19 begrenzte Stunden (2 nass) |
| Volllauf mit `--heights=median` | Byte für Byte der Lauf ohne GM-2-Schalter aus §3b.4 (0 Unterschiede) — der Rückfall schreibt die alten Dateien |
| Negativkontrolle | Voreinstellung gegen `median`: 28 Dateien verschieden (Tagesdokument, 26 Stunden-Chunks, `phase.json`) |
| übrige Prüfer | `glacier-melt` 41/41, `glacier-publish` 34/34, `glacier-snow-view` 19/19, `glacier-contract` 64/64, `glacier-snowcore` 23/23, `glacier-dossier-heute` 21/21 |
| `typecheck`, `build`, `budget` | grün, 281/281, totalJs 2 117,2 / 2 118 KB (unverändert) |

Die Laufzeiten dieser beiden Läufe (302 s und 103 s) sind keine Messung: Build und Prüfer liefen daneben. Es gelten die Zahlen aus §3b.4 (185 statt 80 s lokal).

Nicht geprüft, wie in §3b.5: kein Lauf auf dem Runner (die Mehrzeit dort ist ungemessen, Zeitgrenze des Jobs 40 min), keine Anzeige, eine Wetterlage. Nach dem Push den ersten Lauf ansehen (`MANUELLE-SCHRITTE.md` §116).

## 3c. GM-3: Eichung an vergangenen Wintern (22.11.)

Werkzeuge: `scripts/glacier/snowcal-truth.mjs`, `snowcal-forcing.mjs`, `py/snowcal_grid.py`, `snowcal-fit.mjs` (A, E), `snowcal-density.mjs` (B, D), `snowcal-bridge.mjs` (C), `snowcal-table.mjs`, Tabellenvertrag `lib/snowcal.mjs`, Fixture-Werkzeug `make-snowcal-fixture.mjs`. Ergebnis: `scripts/glacier/snow-calibration.json`. Belege in `audit/gletscher-schneemodell/`: `gm3-method-frozen.md` (+ `.sha256`), `gm3-method-frozen-amendment-1.md` (+ `.sha256`), `gm3-report-A.json`, `gm3-report-A-run1.json`, `gm3-report-A-explore.json`, `gm3-report-B.json`, `gm3-report-C.json`. Rohdaten und Zwischenstände liegen lokal unter `C:\dev\buscosun-glacier-cache\gm3\` (2,2 GB, nicht im Repo).

**Kein Producer liest die Tabelle.** GM-3 liefert Tabellen und einen Bericht; das Verdrahten ist ein eigener Schritt mit eigenem Schalter (E-GM-7 … E-GM-10 unten).

### 3c.1 Diagnose (vor dem Code)

**Was heute gilt.** Der Schmelzkern rechnet den Zuwachs als `pf · P · (1 + 4 % je 100 m ab zP) · Schneeanteil` mit `pf = 1,289`. Zwei Dinge daran sind nicht gemessen:
- **V-GM-15.** `pf` wurde in Gate C mit dem Niederschlag einer **Talstation** geeicht, der mit +4 % je 100 m ab der **Stationshöhe** hochgerechnet wurde (bis 1 800 m Höhenunterschied, also bis × 1,7 obendrauf). Im Betrieb steht an derselben Stelle der Niederschlag von buscosun Fusion am Gletscherpunkt, und die 4 % zählen ab der Höhe dieses Punkts (`zP: forcing.zRef` in `melt.mjs`). Der Faktor wird also auf einen anderen Niederschlag angewandt als den, an dem er geeicht ist.
- Die 4 % je 100 m sind gesetzt, nie an Stufenwerten geprüft (Gate C kannte nur die Bilanz des ganzen Gletschers).

**Was es an Wahrheit gibt.** Winterbilanz je Höhenstufe: GLAMOS (Schweiz, 36 Gletscher) und WGMS (Österreich, 8 Gletscher), hydrologische Jahre 2012–2025, zusammen 488 Gletscherwinter. Nach E-GL-17 dienen die GLAMOS-Dateien nur intern als Wahrheit; keine Zeile davon steht im Repo (die Fixture trägt das Spaltenformat mit den Werten aus dem WGMS FoG).

**Was es an Antrieb für vergangene Winter gibt.** buscosun Fusion gab es in diesen Wintern nicht. Geeicht wird deshalb gegen die Niederschlagsanalysen, die es damals wie heute gibt: RhiresD (MeteoSchweiz, Tagesgitter 1 km, seit 1961, offen) und INCA (GeoSphere, stündlich, seit 2011). Der Schritt von der Analyse zu buscosun Fusion ist eine eigene Messung (Brücke, C).

- **V-GM-16.** Die Quellenliste nennt für INCA `inca-v2-1h-1km`. Dieser Datensatz beginnt am 1.10.2026. Die vergangenen Winter stehen unter `inca-v1-1h-1km` (dasselbe Produkt, läuft bis heute weiter, CC BY 4.0 wie der Data Hub). Benutzt; Jan bitte bestätigen (E-GM-11).
- **V-GM-17 (erledigt V-GM-5).** Die SLF-Messfelder haben doch eine Historie: `measurement-data.slf.ch/study-plot/` hält je Messfeld die Tageswerte seit den 1930er-Jahren, mit Neuschneehöhe UND Wasserwert des Neuschnees vom selben Brett. Eine eigene tägliche Ablage braucht es nicht.

### 3c.2 Methode (eingefroren vor dem ersten gewerteten Lauf)

`gm3-method-frozen.md`, sha256 `cf4c001b…`, 22.11. 22:05 UTC. Zum Zeitpunkt des Einfrierens waren nur Daten geladen und gezählt. Kurzfassung:

- **A Niederschlag:** je Gletscherwinter und Höhenstufe die Rechnung des Schmelzkerns (Schneeanteil 0–2 °C, Gradtag-Schmelze 0,165 mm je K und Stunde, Eis × 1,6), Zuwachs `F · Verlauf · P`. Drei Formen des Verlaufs (linear, bis zur Medianhöhe, zwei Steigungen), `F` und Steigung je für alle, je Land oder je Region. Entschieden am Stufenfehler mit ausgelassenem Gletscher (LGO): eine feinere Stellung gilt nur ab 3 % Gewinn. Urteil K-1 … K-4.
- **B Neuschneedichte:** der Schneekern auf leerem Brett, 24 Stunden, mit dem gemessenen Wasserwert des Neuschnees; vier Dichteregeln (68 wie heute, Vionnet, eine Konstante, linear in der Temperatur), entschieden mit ausgelassenem Messfeld (LSO), 5 % Gewinn.
- **C Brücke** buscosun Fusion ↔ Analysen, **D** Minderfang der Messer, **E** Höhenverlauf aus Punktmessungen: Messungen ohne Auswahl.

Nachtrag 1 (`gm3-method-frozen-amendment-1.md`, sha256 `50458a28…`), geschrieben **nach** dem ersten gewerteten Lauf und als explorativ gekennzeichnet: Faktor je Gletscher, Gesamtsteigung statt Rest-Steigung, Winterschmelze frei. Er ändert weder Auswahl noch Urteil.

### 3c.3 Daten

| | Zahl |
|---|---|
| Gletscherwinter in der Wahrheit | 488 (Schweiz 398 / 36 Gletscher, Österreich 90 / 8); 9 verworfen (4 ohne Mitteldatum, 4 Stufen ohne Fläche, 1 Winter von 485 Tagen); 20 österreichische Winter mit Stufenflächen des Nachbarjahrs |
| nutzbar | **481** (Schweiz 394, Österreich 87); 7 nicht nutzbar (6 mit über 15 % fehlender Temperatur, 1 mit 71 % fehlendem INCA) |
| Temperaturstationen | 19 SwissMetNet, 7 GeoSphere; Abstand 0,2–26,6 km, Höhenunterschied bis 1 789 m (`stations.json` im Cache, Zuordnung im Bericht A) |
| Niederschlag | RhiresD: 15 Jahresdateien (2,2 GB), nächste Zelle 0,07–0,61 km; INCA: nächste Zelle 0,32–0,67 km |
| Messfelder (B) | 135, davon 31 mit einer SwissMetNet-Station bis 3 km / 200 m, 18 mit Ereignistagen; **2 362 Ereignistage** (verworfen: 7 772 ohne Wasserwert, 922 zu warm, 285 ohne Temperatur, 26 mit unmöglicher Dichte) |

### 3c.4 Ergebnis A — Niederschlag

Kennzahlen in mm Wasserwert, je Gletscherwinter gebildet und gemittelt: **s1** Stufenfehler, **s2** Fehler der Winterbilanz des Gletschers, **s3** Bias, **s4** Formfehler.

| Stellung (Form \| F \| Steigung) | LGO s1 | LGO s2 | LGO s4 | LYO s1 | Voll-Fit |
|---|---|---|---|---|---|
| **B0 heute** (1,289; +4 %) | 648 | 614 | 158 | – | Bias −580 |
| B1 roh (1; kein Verlauf) | 841 | – | – | – | – |
| P1 \| alle \| alle | 453,6 | 425,7 | 127,7 | 448,6 | F 1,854; g −2,0 % je 100 m |
| P2 \| alle \| alle | 456,7 | 422,2 | 138,4 | 450,3 | F 1,864; g +0,9 % (nur unter der Medianhöhe) |
| P3 \| alle \| alle | 442,9 | 410,2 | 135,2 | 435,2 | F 1,976; unten +2,5 %, oben −6,7 % |
| **P1 \| Land \| alle** (gewählt) | **433,1** | **403,0** | 127,9 | 426,9 | **F Schweiz 1,793, Österreich 2,326; g −2,0 %** |
| P1 \| Region \| alle | 434,6 | 403,9 | 127,8 | 405,8 | F 1,55 (ch-mitte-west) … 2,71 (at-oetztaler-alpen) |
| P1 \| Land \| Land | 433,7 | 403,1 | 129,2 | 426,6 | g Schweiz −2,2 %, Österreich −0,9 % |
| P0 \| Land \| – (ohne Verlauf) | 433,6 | 401,4 | 132,8 | 428,5 | F 1,793 / 2,323 |

Auswahl nach der Regel: P3 gewinnt 2,4 % gegen P1 (unter 3 %) ⇒ P1 bleibt. `F` je Land gewinnt 4,5 % ⇒ angenommen. `F` je Region gewinnt nichts (−0,3 %) ⇒ verworfen; im LYO wäre es 5 % besser, die Regionswerte übertragen sich aber nicht auf einen ausgelassenen Gletscher. Steigung je Land gewinnt nichts.

**Urteil**

| Nr. | Kriterium | Wert | |
|---|---|---|---|
| K-1 | LGO-s1 mindestens 10 % besser als die Konstanten von heute | 433 gegen 648, **33 % besser** | grün |
| K-2 | LGO-s2 ≤ 0,35 m w. e. | **0,403** | **ROT** |
| K-3 | \|Bias\| je Land ≤ 0,10 m w. e. | Schweiz −0,074, Österreich −0,095 | grün |
| K-4 | Formfehler mindestens 10 % besser als ohne Verlauf | 127,9 gegen 132,8, **3,7 %** | **ROT** |

**Die Tabelle trägt `gate: false`.** In Worten: die **Höhe** des Faktors ist bestimmt und klar besser als heute; ein **Verlauf mit der Höhe** über das hinaus, was Schneeanteil und Schmelze schon erklären, ist aus diesen Daten nicht belastbar.

**Empfindlichkeit** (ändert die Auswahl nicht)

| Variante | F Schweiz / Österreich | g je 100 m | LGO s1 |
|---|---|---|---|
| gewählt | 1,793 / 2,326 | −2,0 % | 433 |
| S1 Gradtagfaktor × 0,5 | 1,604 / 2,117 | +0,3 % | 374 |
| S1 Gradtagfaktor × 1,5 | 1,989 / 2,540 | −3,9 % | 508 |
| S2 Schwelle des Schneeanteils −1 K | 1,845 / 2,384 | −2,6 % | 444 |
| S2 Schwelle +1 K | 1,757 / 2,285 | −1,5 % | 424 |
| S3 nur Stufen mit Schmelze unter 50 mm (176 Winter) | 1,548 / 1,908 | −3,9 % | 344 |
| S4 Temperaturgradient −5,5 K/km | 1,882 / 2,450 | −1,6 % | 456 |

Das **Vorzeichen der Steigung hängt am Gradtagfaktor der Winterschmelze**; `F` schwankt zwischen den Varianten um ±12 %.

**E Punktmessungen** (WGMS, 109 Gletscherwinter an 21 Gletschern): relative Steigung der Winterbilanz im Median **+9,4 % je 100 m** (p10 −0,2, p90 +22). Gegen die −2,0 % aus A steht nach der eingefrorenen Regel ein **Widerspruch**. Er ist zum Teil ein Fehler meiner Regel (V-GM-22): die Punkte messen die **gesamte** Zunahme (Regen statt Schnee und Schmelze unten eingeschlossen), `g` aus A nur den Rest nach Abzug von Schneeanteil und Schmelze. Der Vergleich gleicher Größen steht im Nachtrag (N1-b).

### 3c.5 Ergebnis B und D — Neuschneedichte, Minderfang

Gemessene Dichte auf dem Brett nach 24 Stunden (Wasserwert / Neuschneehöhe, 2 362 Tage): **Median 100 kg/m³, p10 65, p90 148**, Mittel 104. Unter 1 500 m 94, darüber 100; kälter als −8 °C im Tagesmittel 84, wärmer 100. Weissfluhjoch (2 536 m, 707 Tage): 100.

| Regel | Fehler der Neuschneehöhe (cm) | Bias (cm) | |
|---|---|---|---|
| D0 heute: 68 kg/m³ | **8,07** | **+7,04** | 3–10 cm: +2,2 · 10–25 cm: +5,5 · über 25 cm: +14,0 |
| D1 Vionnet (Temperatur, Wind) | 5,51 | −4,02 | 2 325 Tage mit Wind; D0 an denselben Tagen 8,00 |
| **D2 eine Konstante: 96 kg/m³** | **4,49** (LSO) | −0,20 | je ausgelassenem Messfeld 95–97; 3–10 cm: +0,3 · 10–25 cm: 0,0 · über 25 cm: −1,3 |
| D3 linear: 102 + 1,5 · T | 4,52 (LSO) | +0,02 | kein Gewinn gegen D2 |

**Gewählt: D2, 96 kg/m³** (44 % weniger Fehler als heute). Der Schneekern rechnet Neuschnee mit 68 kg/m³ im Mittel 7 cm zu hoch. Neue Spanne der Dichte: **65–148** (gemessene Quantile) statt 56–80.

**D Minderfang:** an denselben Tagen fängt der Niederschlagsmesser der Station **70 %** des Wasserwerts auf dem Brett (2 317 Tage; unter 2 m/s 71 %, 2–4 m/s 61 %, darüber 75 %).

Damit löst sich der offene Punkt aus M-2 („Neuschnee 20 % zu niedrig — Setzung oder Minderfang?“): M-2 rechnete mit Messer-Niederschlag. 68 kg/m³ passten dort nur, weil der Messer 30 % zu wenig Wasser liefert; 68 / 0,70 = 97.

**Übertragung nach Österreich** (keine Anpassung; 2 225 Tage an 51 Stationen ab 1 000 m, Wasser aus dem Messer, schwacher Wind): Dichte aus dem Messer im Median 66 kg/m³. D0 trifft dort (Bias −0,4 cm), D2 liegt 3,1 cm zu niedrig. Das ist dieselbe Aussage von der anderen Seite: mit Messer-Wasser stimmt 68, mit wahrem Wasser 96. Im Modell steht hinter dem Faktor `F` wahres Wasser.

Grenzen: Die Messfelder liegen auf 580–2 536 m, die Gletscher auf 2 500–4 000 m. Den Wasserwert misst das SLF fast nur ab 10 cm Neuschnee (83 % der Tage, V-GM-20); für kleine Schneefälle ist die Dichte kaum belegt. Bei Kälte unter −8 °C ist der Schnee leichter (84), die Temperaturregel D3 gewann trotzdem nichts.

### 3c.6 Ergebnis C — Brücke buscosun Fusion ↔ Analysen (gemessen, nicht angewandt)

24 Wetterläufe aus dem Daten-Repo (16.–22.11.), je Lauf die Stunden bis zum nächsten Lauf; 920 Gletscher mit eigenem Antrieb und jeder Stunde des Fensters. Tage 06–06 UTC.

| | Gletscher | Tage | buscosun Fusion | Analyse | Verhältnis der Summen | je Gletscher: Median (p10–p90) |
|---|---|---|---|---|---|---|
| Österreich (INCA) | 337 | 6 | 8 837 mm | 7 373 mm | **1,20** | 1,14 (0,76–1,91) |
| Schweiz (RprelimD) | 580 | 5 (der 17.11. fehlt an der Quelle) | 30 161 mm | 24 280 mm | **1,24** | 1,34 (0,87–2,06) |

Je Region 0,44 (Allgäuer Alpen, ein Gletscher) bis 1,69 (Silvretta); Ötztaler und Stubaier Alpen 1,50. buscosun Fusion gab in dieser Woche also rund ein Fünftel mehr Niederschlag als die Analysen, regional sehr verschieden. Eine Woche in einer Wetterlage trägt keinen Faktor; in der Tabelle steht `bridge.value = 1` (`set`). Nähme man die Woche als Maß, wäre der Faktor auf den Niederschlag von buscosun Fusion 1,79 / 1,24 = **1,45** (Schweiz) und 2,33 / 1,20 = **1,94** (Österreich) gegen heute 1,289.

### 3c.7 Nachtrag 1 (explorativ, nach dem ersten gewerteten Lauf)

**N1-a Faktor je Gletscher** (ein Winter ausgelassen, 478 Winter an Gletschern mit mindestens vier Wintern):

| | s1 | s2 (Winterbilanz) | Bias |
|---|---|---|---|
| Landeswert (LGO des gewerteten Laufs, dieselben Winter) | 429 | 399 | −85 |
| **eigener Faktor des Gletschers** | **272** | **227** | −36 |

Die Faktoren der 44 Gletscher reichen von 1,31 (p10) über 1,87 (Median) bis 2,70 (p90). **Der größte Teil des Fehlers ist eine feste Eigenschaft des Gletschers** (Lage zum Wind, Lawinen, Relief), kein Rauschen von Jahr zu Jahr. Mit einem eigenen Faktor läge die Winterbilanz bei 0,23 m statt 0,40 m Fehler.

**N1-b Gesamtsteigung der Winterbilanz über die Stufen** (396 Gletscherwinter mit mindestens 300 m Höhenspanne, je 100 m):

| | Median | p10 … p90 |
|---|---|---|
| Wahrheit (Stufen) | +5,1 % | −2,3 … +14,1 % |
| Modell, gewählte Stellung (g −2,0 %) | +4,7 % | +0,6 … +16,3 % |
| Modell ohne Verlauf (g 0) | +7,2 % | +2,8 … +19,3 % |
| Punktmessungen (E) | +9,4 % | −0,2 … +22,1 % |

Schneeanteil und Winterschmelze allein ergeben im Modell schon **mehr** Zunahme mit der Höhe (+7,2 %), als die Stufenwerte zeigen (+5,1 %). Deshalb fällt die Rest-Steigung des Niederschlags negativ aus. Die Punktmessungen zeigen mehr Zunahme als die Stufen; sie stehen häufiger im unteren und mittleren Teil.

**N1-c Winterschmelze frei** (Gradtagfaktor × …; Stellung `F` je Land):

| Gradtagfaktor | Form | F Schweiz / Österreich | Steigung je 100 m | LGO s1 | LGO s2 | LGO s4 |
|---|---|---|---|---|---|---|
| × 0 (keine Winterschmelze) | P1 | 1,429 / 1,923 | +2,9 % | 337 | 300 | 130 |
| × 0 | ohne Verlauf | 1,431 / 1,927 | – | 343 | 300 | 138 |
| × 0 | P3 | 1,557 / 2,071 | unten +8,5 %, oben −3,6 % | 322 | 288 | 122 |
| × 0,25 | P1 | 1,514 / 2,017 | +1,6 % | 353 | 318 | 125 |
| × 0,25 | ohne Verlauf | 1,515 / 2,019 | – | 355 | 318 | 126 |
| × 0,25 | P3 | 1,641 / 2,163 | unten +7,0 %, oben −4,4 % | 336 | 305 | 121 |
| × 0,5 | P1 | 1,604 / 2,117 | +0,3 % | 374 | 342 | 122 |
| × 0,5 | ohne Verlauf | 1,604 / 2,117 | – | 373 | 342 | 120 |
| × 0,5 | P3 | 1,727 / 2,256 | unten +5,3 %, oben −5,2 % | 360 | 329 | 122 |
| × 0,75 | P1 | 1,697 / 2,220 | −0,9 % | 401 | 371 | 123 |
| × 0,75 | ohne Verlauf | 1,697 / 2,219 | – | 400 | 370 | 123 |
| × 0,75 | P3 | 1,816 / 2,353 | unten +3,8 %, oben −5,9 % | 390 | 357 | 127 |
| × 1 (gewerteter Lauf) | P1 | 1,793 / 2,326 | −2,0 % | 433 | 403 | 128 |
| × 1,5 (S1) | P1 | 1,989 / 2,540 | −3,9 % | 508 | – | – |

Je weniger Winterschmelze die Eichung ansetzt, desto besser trifft sie die Stufenwerte: ohne Schmelze 337 statt 433 mm, die Winterbilanz 0,30 m statt 0,40 m. Der Gradtag-Ansatz der Eichung (Faktor aus der Sommer-Basislinie von Gate C, Temperatur einer bis zu 27 km entfernten Station mit −6,5 K/km) rechnet im Oktober und April zu viel Schmelze. Gleichzeitig wandert `F` von 1,43 / 1,92 bis 1,79 / 2,33 — **die Höhe des Faktors ist nur bis auf rund ±12 % bestimmt, solange die Winterschmelze nicht feststeht.** Ohne Winterschmelze zeigt die Form mit zwei Steigungen ein Bild, das zur Messpraxis passt (Zunahme bis zur Medianhöhe, Abnahme darüber) und den Formfehler um 12 % senkt; das ist nach dem Lauf gesehen und kein Urteil. Der Betrieb rechnet die Schmelze ohnehin anders (Temperatur und Strahlung, erst ab +1 °C); eine neue Runde müsste diese Schmelze nehmen (E-GM-10).

Der Faktor je Gletscher reicht von 1,03 (Hohsaasgletscher) bis 3,58 (Silvrettagletscher); Mont Collon liegt an der Obergrenze 5 (V-GM-19).

### 3c.8 Was das für die zwei Befunde der Qualitätsprüfung heißt

- **„Gleiche Neuschneewerte an allen Höhen“:** Die Eichung stützt **keine** allgemeine Zunahme des Niederschlags mit der Höhe innerhalb eines Gletschers. Die Unterschiede zwischen Zunge und Oberkante in der Winterbilanz kommen aus Regen statt Schnee und aus Schmelze unten — beides rechnet der Producer seit GM-2 je Höhe aus der eigenen Antwort von buscosun Fusion. In einer Kaltlage, in der überall Schnee fällt, sind gleiche Neuschneewerte an allen Höhen nach diesen Daten die ehrliche Aussage. Die Annahme aus §3b.4 („das trägt erst die Höhenzunahme des Niederschlags“) ist damit widerlegt.
- **Schneehöhe und Neuschnee in cm:** Der Schneekern braucht 96 statt 68 kg/m³, sonst zeigt er Neuschnee im Mittel 7 cm zu hoch.

### 3c.9 Gate (22.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snowcal` | **31/31** |
| A1–A4 Wahrheit | GLAMOS-Spaltenformat (Werte aus dem WGMS FoG) und WGMS in mm, Flächenmittel und Medianhöhe wie von Hand, Regeln (ohne Mitteldatum verworfen, Stufenfläche vom Nachbarjahr genannt) |
| B1–B5 Antrieb und Rechnung | RhiresD-Tag 06–06 UTC; die schnelle Rekursion der Eichung ist die Rechnung des Schmelzkerns (an zwei echten Wintern höchstens 1e-6 mm Unterschied, Gegenprobe mit verschobenem Faktor über 10 mm); Rekursion, Verlauf und Stunde von Hand |
| C1–C6 Fit | findet bekannte Werte wieder (F je Region, Steigung, zwei Steigungen), Rückhaltung im LGO, Kennzahlen s1–s4 von Hand, Grenzen von F, Punktmessungen; C4b stellt V-GM-25 an einer bekannten Wahrheit nach |
| D1–D3 Dichte | Brett und Schneekern an echten Messfeld-Tagen (68 zu hoch, 96 näher, Gegenprobe 200 zu niedrig), Regel D3 mit Grenzen |
| E1–E11 Tabelle und Berichte | Hash der eingefrorenen Methode in Datei, Hash-Datei, Berichten und Tabelle gleich; Tabelle = Voll-Fit der gewählten Stellung; **Urteil und Auswahl neu gerechnet aus den Zahlen der Berichte** (K-1 … K-4, 3 %-Regel, Dichte 5 %), nicht aus dem gemeldeten Ergebnis gelesen; Brücke gemessen und nicht angewandt; 15 Verletzungen der Tabelle, jede gemeldet |
| F1 Abwesenheit | kein Producer liest die Tabelle; Gegenprobe: dasselbe Muster trifft das Tabellen-Werkzeug |
| Gegenprobe des Prüfers | `gm3-mutations.mjs`: 19 Mutationen an Eichcode, Tabellenregeln, Tabelle, eingefrorener Methode und Producer — **19 von 19 bemerkt**, keine als Abbruch, Prüfer danach grün (`gm3-mutations.json`, 22.11. 22:48 UTC). Der erste Durchgang wurde bei der neunten Mutation von außen beendet (alle Node-Prozesse der Maschine wurden gestoppt); die mutierte Zeile in `snowcal-fit.mjs` blieb stehen, der Prüfer meldete sie als C3 (30/31). Von Hand zurückgesetzt, Durchgang ganz wiederholt. Danach: Hash der eingefrorenen Methode `cf4c001b…` unverändert, `weathercore.mjs` ohne Unterschied zu HEAD |
| übrige Prüfer | `glacier-weather` 41/41, `glacier-melt` 41/41, `glacier-snowcore` 23/23, `glacier-contract` 64/64, `glacier-publish` 34/34, `glacier-snow-view` 19/19, `glacier-dossier-heute` 21/21 |
| `npm run typecheck` | grün |
| `npm run build`, `npm run budget` | nicht gelaufen: keine Datei unter `src/` geändert (`git status`: nur `scripts/glacier/**`, `scripts/verify-glacier-snowcal.mjs`, Fixtures, `package.json` mit einer Skriptzeile, Doku) |

Nicht geprüft: kein Lauf auf dem Runner und kein Browser (nichts ist verdrahtet, keine Anzeige liest die Tabelle); `verify:glacier-ui` (bricht an HEAD ab, V-GH-6). Der Prüfer rechnet auf Fixtures und auf den Berichten im Repo — die Eichläufe selbst (5–25 min, 2,2 GB Zwischenspeicher) wiederholt er nicht; wer die Berichte neu erzeugen will, braucht den lokalen Cache. Die Brücke beruht auf einer Woche.

Die fünf Fragen: (1) Funktionserhalt — kein Producer, kein Vertrag und keine Seite geändert (F1 mit Gegenprobe, übrige Prüfer grün); (2) Desktop pixelgleich — kein Byte unter `src/` geändert; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

**Gate GM-3: die Eichung ist geliefert und geprüft; ihr eigenes Urteil ist ROT (K-2, K-4), die Tabelle trägt `gate: false` und bleibt unverdrahtet, bis Jan über E-GM-7 … E-GM-11 entschieden hat.**

### 3c.10 Entscheidungen und Befunde aus GM-3

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-7 | **Niederschlagsfaktor je Land in den Producer** (hinter Schalter, Voreinstellung aus)? Dafür: K-1 klar grün, heute fehlt im Mittel 0,58 m Winterbilanz. Dagegen: K-2 rot (0,40 gegen 0,35 m); der Faktor gilt gegenüber den Analysen, die Brücke zu buscosun Fusion ist eine Woche alt. Empfehlung: bauen, **ohne Verlauf** (`g = 0`, Herkunft `set` — K-4 ist rot und das Vorzeichen nicht belastbar), mit `bridge = 1`; Einschalten erst nach 30 Niederschlagstagen Brücke | **Jan 22.11. nachts: „ich starte E-GM-7 und 8 in einer neuen Session“** ⇒ bauen wie empfohlen (hinter Schalter, aus, ohne Verlauf, `bridge = 1`); über das Einschalten ist nichts gesagt. **Gebaut 23.11. (§3d), Schalter `--precip=country`, aus** |
| E-GM-8 | **Neuschneedichte 96 kg/m³** und Spanne 65–148 in den Schneekern (`SNOW.rhoNew`, Herkunft `measured`)? Der Kern ist nicht verdrahtet, keine Anzeige ändert sich. Empfehlung: ja, zusammen mit E-GM-7, weil 96 nur mit wahrem Wasser (hinter `F`) stimmt | **Jan 22.11. nachts: zusammen mit E-GM-7 in einer neuen Sitzung. Gebaut 23.11. (§3d) auf Jans Wort „beide aus“: nicht als neuer Wert von `SNOW.rhoNew`, sondern als zweiter Konstantensatz hinter dem Schalter `board`, aus** |
| E-GM-9 | **Faktor je Gletscher** für die 44 vermessenen Gletscher (N1-a: 0,23 statt 0,40 m)? Braucht eine neue eingefrorene Regel (Mindestzahl Winter, Schrumpfung zum Landeswert) und ist die stärkste Verbesserung, die diese Daten hergeben; für die übrigen 2 050 Gletscher ist die Kopplung an Stationen (GM-4) der Weg zum selben Ziel | offen (Jan) |
| E-GM-10 | **Winterschmelze** in einer neuen eingefrorenen Runde so ansetzen wie im Betrieb (ETI) oder mit-eichen, und am Winter 2025/26 prüfen (GLAMOS Release 2026)? N1-c zeigt, dass der Gradtag-Ansatz der Eichung die Winterbilanz verschlechtert | offen (Jan) |
| E-GM-11 | `inca-v1-1h-1km` als Quelle für die vergangenen Winter bestätigen (V-GM-16) | offen (Jan) |
| V-GM-15 | `pf = 1,289` ist an einem anderen Niederschlag geeicht als dem, auf den er im Betrieb angewandt wird (§3c.1). Mehrwert: die Schneedecke des Schmelzkerns startet nicht mehr zu dünn in den Sommer. Skizze: E-GM-7 | gebaut (§3d), behoben erst mit dem Einschalten (E-GM-12) |
| V-GM-16, V-GM-17 | §3c.1 | E-GM-11 / erledigt |
| V-GM-18 | MeteoSchweiz veröffentlicht die **Totalisatoren** offen (`ch.meteoschweiz.ogd-tot`, CC BY): gemessener Jahresniederschlag im Hochgebirge, nicht in der Quellenliste. Mehrwert: eine direkte Messung für die Höhe des Faktors in Gletschernähe. Skizze: Stationsliste lesen, Jahreswerte gegen RhiresD an derselben Zelle | offen (Quelle erst freigeben) |
| V-GM-19 | Ein Gletscher (Mont Collon, drei Stufen um 2 300 m) liegt im LGO 2,7 m daneben und zieht s1 und s2; die Methode kennt keine Ausreißerregel. Skizze: in der nächsten eingefrorenen Runde Gletscher unter einer Mindestfläche oder mit weniger als vier Stufen getrennt führen | offen |
| V-GM-20 | Wasserwert des Neuschnees fast nur ab 10 cm gemessen: die Dichte kleiner Schneefälle ist kaum belegt. Skizze: Tage mit 3–10 cm getrennt ausweisen (403 Tage, Bias mit 96 kg/m³ +0,3 cm) | offen |
| V-GM-21 | Die vorläufigen Schweizer Tagesgitter (RprelimD) stehen nur rund 59 Tage an der Quelle und der 17.11. fehlt dort. Skizze: die Brücke monatlich mit den endgültigen Monatsdateien nachmessen; die Wetterläufe im Daten-Repo bleiben liegen (V-GS-2) | GM-6 |
| V-GM-22 | Kriterium E der Methode verglich Gesamt- mit Rest-Steigung. Skizze: in der nächsten Runde die Gesamtsteigung des Modells gegen die der Punkte (N1-b) | offen |
| V-GM-23 | Die Temperatur kommt für 10 von 44 Gletschern von einer Station mit über 1 500 m Höhenunterschied (z. B. Disentis 1 197 m für den Medelgletscher 2 953 m). S4 zeigt mäßige Empfindlichkeit (s1 456 statt 433). Skizze: Stationswahl nach Höhe vor Abstand, oder das Temperaturgitter TabsD mit seiner Zellhöhe | offen |
| V-GM-25 | Verlauf und Niveau sind nicht getrennt bestimmt: trägt ein Gletscher einen Landeswert, der nicht seiner ist, gleicht die Form mit zwei Steigungen das aus und verbiegt die gemeinsamen Steigungen (im Prüfer an einer bekannten Wahrheit nachgestellt, C4b). Folge: Höhenverlauf und Faktor je Gletscher gehören in dieselbe Eichrunde (E-GM-9 mit E-GM-10) | offen |
| V-GM-24 | Die Brücke streut je Region von 0,44 bis 1,69. Mehrwert einer Klärung: der Faktor für den Betrieb hängt daran. Skizze: je Region und Monat aus den liegenden Wetterläufen, ab 30 Niederschlagstagen | GM-6 |

## 3d. GM-3b: Faktor je Land und Neuschneedichte hinter Schaltern, beide aus (E-GM-7, E-GM-8; 23.11.)

Auftrag (Jan, 23.11.): „E-GM-7 und E-GM-8 bauen: Faktor je Land und Dichte, beide aus.“

### 3d.1 Diagnose (vor dem Code)

**Wo der Faktor heute sitzt.** `simulate` in `lib/meltcore.mjs` rechnet den Zuwachs je Band als `pf · P · corr[b] · fs` mit `corr[b] = 1 + MELT.pGrad · (z_b − zP) / 100`. `melt.mjs` gibt `pf = cal.fit.pf` (1,289 aus `melt-calibration.json`) und `zP = forcing.zRef` (die Medianhöhe des Katalogs) hinein, über `meltOfForcing`. Derselbe Weg trägt den fortgeschriebenen Schneezustand (`melt/state.json`) und alle 40 Szenarien. Sonst liest niemand `pf`: „Wetter am Gletscher“ (`weathercore.mjs`) rechnet Neuschnee ohne Faktor und ohne Gradient, die Seite liest `params` nur über den Vertragsprüfer (`pf` muss eine Zahl sein).

**Was die Eichung dafür liefert.** `snow-calibration.json`: `precip.regions[<Region>].F` (Schweiz 1,793, Österreich 2,326, Deutschland 1,854 übertragen), Steigung −2,0 % je 100 m (K-4 rot, Vorzeichen nicht belastbar), `bridge.value = 1` (`set`). Der Leser `precipFactorOf` der Tabelle multipliziert den Verlauf der Tabelle ein — für E-GM-7 („ohne Verlauf“) fehlt ein Leser, der nur die Höhe des Faktors gibt.

**Was „ohne Verlauf“ im Kern heißt.** Die Eichung ersetzt das ganze Produkt `pf · (1 + 4 % je 100 m)` durch `F · Verlauf(d)`, mit `d` ab der Medianhöhe. Ohne Verlauf muss also auch der gesetzte Gradient des Kerns (4 % je 100 m) auf null; sonst stünde `F` auf einem Verlauf, gegen den es nie geeicht wurde. `simulate` kennt dafür heute keinen Parameter (`MELT.pGrad` ist fest).

**Wo die Dichte sitzt.** `SNOW.rhoNew = 68` in `lib/snowcore.mjs`, Spanne aus Mittel und Standardabweichung (56–80). Alle Funktionen des Kerns nehmen den Konstantensatz als letzten Parameter `c`; nur `stepPack` greift mit seiner Voreinstellung der Dichte am Parameter vorbei auf `SNOW`. Kein Producer ruft den Kern. Die Eichung selbst (`snowcal-density.mjs`, Regel D0) und `verify:glacier-snowcore` rechnen mit `SNOW.rhoNew` als dem Wert von heute — die Konstante im Kern darf also nicht überschrieben werden, solange der Schalter aus ist.

**Was beim Bauen mitbricht, wenn man es nicht bedenkt.**
- `verify:glacier-snowcal` F1 behauptet „kein Producer liest die Tabelle“ und die Tabelle trägt `usedByProducer: false`. Beides gilt künftig nur für die Voreinstellung.
- `melt.mjs` hängt dann an `lib/snowcal.mjs`, das mit GM-3 noch uncommitted ist: GM-3 und GM-3b gehören in denselben Commit (sonst bricht der Producer beim Import, und `verify:glacier-melt` in der CI wird rot).
- Der Workflow holt `scripts/` ganz (`sparse-checkout set … scripts …`), die Tabelle liegt also beim Producer, sobald sie committet ist.

### 3d.2 Entwurf

| Teil | Schalter | Stellungen | Voreinstellung | Wirkung |
|---|---|---|---|---|
| E-GM-7 Niederschlagsfaktor | `--precip=` / `GLACIER_SNOW_PRECIP` (`SNOW_PRECIP_DEFAULT` in `lib/snowcal.mjs`) | `gate-c` = 1,289 und +4 % je 100 m wie bisher · `country` = `F` der Region aus der Tabelle × Brücke (1), **kein** Verlauf | `gate-c` | nur der Schmelzlauf: Zuwachs je Band, Schneezustand, Szenarien |
| E-GM-8 Neuschneedichte | `--density=` / `GLACIER_SNOW_DENSITY` (`SNOW_DENSITY_SOURCE_DEFAULT`) | `helfricht` = 68 kg/m³, Spanne 56–80 wie bisher · `board` = 96 kg/m³ und gemessene Spanne 65–148 aus der Tabelle | `helfricht` | Konstantensatz des Schneekerns; heute ohne Leser im Betrieb (der Kern ist unverdrahtet) — die Stelle, an der GM-5 anschließt |

Regeln:
- **Aus heißt: nichts gelesen.** Mit `gate-c` öffnet der Producer die Tabelle nicht und schreibt dieselben Bytes wie vorher. Mit `country` liest er sie, prüft sie gegen ihre Regeln und gegen die Regionen des Katalogs und **bricht mit Grund ab**, wenn sie fehlt, verletzt ist oder eine Region nicht kennt (kein stiller Rückfall auf 1,289).
- **Der Lauf nennt, womit er gerechnet hat.** Mit `country` trägt das Schmelzdokument `params.precip` (Regel, `F` je Region mit Herkunft, Gradient 0 `set`, Brücke 1 `set`, Urteil der Eichung `gate: false` mit Grund, Hash der eingefrorenen Methode); `params.pf` bleibt als Zahl stehen, weil ältere Stände der Seite das Dokument sonst verwerfen, gilt dann aber nicht. Die Statuszeile nennt `precip: country`.
- **96 nur mit wahrem Wasser.** `board` ohne `country` wird abgelehnt (`snowSwitchesOf`): 96 kg/m³ sind am Wasserwert auf dem Brett gemessen, 68 passen zu Messer-Wasser (§3c.5).
- Der Kern bleibt rein: `snowcore.mjs` kennt die Tabelle nicht; `lib/snowcal.mjs` baut aus `SNOW` und der Tabelle einen zweiten Konstantensatz.
- Nicht angefasst: buscosun Fusion, `weathercore.mjs` (Neuschnee der Anzeige bleibt ohne Faktor), Publisher, Workflows, Daten- und Archiv-Repo, die Tabelle selbst.

### 3d.3 Umsetzung

| Datei | Änderung |
|---|---|
| `scripts/glacier/lib/meltcore.mjs` | `simulate` nimmt `pGrad` (Voreinstellung `MELT.pGrad`, die gesetzten 4 % je 100 m) |
| `scripts/glacier/lib/snowcal.mjs` | Schalter (`SNOW_PRECIP_RULES`, `SNOW_PRECIP_DEFAULT = 'gate-c'`, `SNOW_DENSITY_SOURCES`, `SNOW_DENSITY_SOURCE_DEFAULT = 'helfricht'`, `snowPrecipOf`, `snowDensitySourceOf`, `snowSwitchesOf` mit der Regel „board nur mit country“); Leser ohne Verlauf `precipLevelOf`; `precipRunOf` (Faktor je Region, Block fürs Dokument, bricht bei unbrauchbarer Tabelle ab); `meltPrecipProblems` (Regeln des Blocks); `snowConstantsOf`, `snowOriginOf`, `snowCoreSetup` (zweiter Konstantensatz des Schneekerns) |
| `scripts/glacier/melt.mjs` | Schalter `--precip` / `GLACIER_SNOW_PRECIP`, `--snowcal=<json>`; je Gletscher `pf = F(Region)`, `pGrad = 0`; `params.precip` im Dokument, `precip` in Statuszeile und Rückgabe — alles nur mit `country` |
| `scripts/glacier/lib/snowcore.mjs` | `newSnowDensitySpan` nimmt gemessene Quantile, wenn der Konstantensatz beide trägt; `stepPack` legt Neuschnee ohne Angabe mit der Dichte des benutzten Satzes ab (bisher immer `SNOW.rhoNew`; mit dem eigenen Satz dasselbe). `SNOW` selbst unverändert |
| `scripts/glacier/snowcal-table.mjs` | `usedByProducer` folgt der Voreinstellung des Schalters (heute `false`, die Tabelle ist nicht neu geschrieben) |
| `src/glacier/glacierMeltContract.ts` | nur der Typ: `params.precip?` mit Kommentar. Kein Laufzeit-Byte; die Regeln des Blocks prüft der Producer |
| `scripts/verify-glacier-melt.mjs` | A7 (Gradient als Parameter), Block H (Schalter Ende zu Ende, 7 Prüfungen) |
| `scripts/verify-glacier-snowcal.mjs` | F1 neu gefasst (der Schmelzlauf darf, hinter dem Schalter), Block G (6 Prüfungen) |
| `scripts/verify-glacier-snowcore.mjs` | A4 (Konstantensatz mit eigener Dichte) |
| `audit/gletscher-schneemodell/gm3b-mutations.mjs`, `gm3b-analyse.mjs` | Gegenprobe der Prüfer, Auswertung der Vollläufe |

Der Block im Schmelzdokument (nur mit `country`):

```json
"params": { "pf": 1.2889…, "TF": …, "SRF": …, "origin": {…}, "report": "…",
  "precip": { "rule": "country", "replaces": "pf",
    "regions": { "ch-ost": { "F": 1.793, "origin": "measured", "from": "CH" }, "de": { "F": 1.854, "origin": "transferred", "from": "all" }, … },
    "gradient": 0, "bridge": 1, "origin": { "gradient": "set", "bridge": "set" },
    "against": { "CH": "MeteoSchweiz RhiresD …", "AT": "GeoSphere Austria INCA …" },
    "gate": false, "reason": "K-2, K-4 rot: …", "method": "cf4c001b…" } }
```

### 3d.4 Messung am lokalen Volllauf

Aufbau wie in §3b.4: Cube und Ansicht vom 21.11. (`C:\dev\buscosun-glacier-cache\gs\`), `--now=2026-11-21T17:50:00Z --always`, Lauf `2026112117`, 2 094 Gletscher. Ausgaben unter `…\gm3b\`, Auswertung `gm3b-analyse.mjs` → `gm3b-analyse.json`. Eine Wetterlage (kalt), Kaltstart des Schneezustands (der Zustand der Ansicht ist älter als 30 h; 600 Gletscher vom Satelliten gesetzt).

**A — Schalter aus gegen den Stand vor GM-3b.** Lauf ohne Schalterangabe gegen `gm2\out-default` (derselbe Aufruf mit dem Code vom 22.11., §3b.7):

| | Ergebnis |
|---|---|
| Dateien | 338 gegen 338, dieselben Namen, **0 verschieden** (Schmelzdokument, Zustand, Tagesdokument, 26 Stunden-Chunks, `phase.json`, die mitgeführten älteren Läufe) |
| Zeiger (`index-patch.json`) | dieselben Bytes |
| Statuszeile (`status-patch.json`) | gleich bis auf die zwei Laufzeit-Felder |

**B — `--precip=country` gegen aus** (derselbe Aufruf mit `--weather=0`; das Wetterdokument liest den Faktor nicht):

| | aus | `country` |
|---|---|---|
| Schmelzdokument | 646 477 B | 648 684 B (+2 207 B: der Block `params.precip` mit 26 Regionen) |
| Zeilen | 2 094 | 2 094, davon **191 mit einem Unterschied** |
| geänderte Felder | – | `idx` an 182 Gletschern, `ix7` an 11, `ix14` an 34; `ice`, `zf`, `zs`, `nf`, `f` an keinem |
| größter Unterschied im Tagesindex | – | 11 Punkte |
| Summe der 14 Tages-Mediane über alle Gletscher | 3 076 | 2 932 (−4,7 %); an 29 Gletschern niedriger, an keinem höher |
| Schneezustand nach 6 h | – | an 436 Gletschern anders (Österreich 320 von 799, Schweiz 112 von 1 291, Deutschland 4 von 4) |
| Zuwachs in den 6 Stunden, Bänder ab 0,3 mm | Österreich 0,60 mm (19 Gletscher), Deutschland 0,63 mm (4) | 1,07 mm und 0,90 mm: **Verhältnis 1,77 und 1,43** |

Erwartet in der Medianhöhe: 2,326 / 1,289 = 1,80 (Österreich), 1,854 / 1,289 = 1,44 (Deutschland), 1,793 / 1,289 = 1,39 (Schweiz); die Abweichung kommt aus dem entfallenen Gradienten und der Rundung der Zustandsdatei auf 0,1 mm. In der Schweiz fiel in den sechs Stunden an keinem Gletscher 0,3 mm; die Rechnung selbst prüft Block H an allen Bändern von Hand.

Der Index sinkt dort, wo im November noch Schmelze gerechnet wird: tief liegende kleine Gletscher (größte Änderung Chilchbalm, 1 649–1 837 m: 277 → 233; Boggenei-Kees, 1 880–2 259 m: 138 → 98). Mehr Schnee heißt früher eine Schneedecke über 5 mm und damit die Albedo von Schnee statt Eis. **Mit dem Schalter ändert sich also auch im Winter eine Zahl, die die Seite zeigt** (Schmelzindex an rund 9 % der Gletscher, höchstens 11 Punkte an diesem Tag).

Die beiden Läufe liefen vor der letzten Härtung der Prüfer (§3d.5); der Producer-Weg ist seither nur um eine Prüfung des eigenen Blocks strenger geworden, die Ausgaben sind dieselben (Block H vor und nach der Härtung grün).

### 3d.5 Gate (23.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-melt` | **49/49** (41 wie vorher + A7 + H1–H7) |
| A7 | Gradient des Niederschlags als Parameter des Kerns: ohne Angabe 4 % je 100 m, mit 0 an allen Höhen gleich |
| H1 aus = nichts gelesen | ohne Angabe, mit `gate-c` und **ohne Tabellendatei** dieselben Bytes (Dokument, Zustand, Zeiger, Statuszeile); Gegenprobe: `country` schreibt andere |
| H2, H3 Rechnung von Hand | Schneezustand nach 6 Stunden an drei Gletschern und allen Bändern: aus = `1,2 · (1 + 4 % je 100 m)`, `country` = `F` der eigenen Region ohne Gradient (auch mit Nachbar-Antrieb); je zwei Gegenproben |
| H4 das Dokument nennt den Faktor | Block mit Regel, `F` je Region samt Herkunft, Gradient 0 (`set`), Brücke 1 (`set`), Urteil der Eichung und Hash der Methode; der Vertrag der Seite nimmt das Dokument |
| H5 Umgebungsvariable | `GLACIER_SNOW_PRECIP=country` = dieselben Bytes wie der Schalter; ein Schalter daneben gewinnt |
| H6 kein stiller Rückfall | unbekanntes Wort, fehlende Tabelle, Tabelle ohne eine Region, Tabelle gegen ihre Regeln (zwei Arten) ⇒ Abbruch mit Grund, nichts geschrieben |
| H7 Regeln des Blocks | acht Verletzungen, jede gemeldet; ein Lauf mit `country` ohne Block ist ein Vertragsverstoß |
| `verify:glacier-snowcal` | **37/37** (31 + G1–G6; F1 neu gefasst: außer dem Schmelzlauf liest kein Producer die Tabelle, Gegenprobe trifft den Schmelzlauf) |
| G1, G2 Schalter | beide Voreinstellungen aus, die Tabelle sagt dasselbe (`usedByProducer`), unbekanntes Wort bricht ab; `board` ohne `country` abgelehnt |
| G3, G4 Faktor | Leser ohne Verlauf gegen den Leser mit Verlauf; Lauf-Paket für alle 26 Regionen; Abbruch bei fehlender Region und verletzter Tabelle |
| G5, G6 Dichte | zweiter Konstantensatz 96 und 65 / 96 / 148,1, der Satz des Kerns bleibt 68 und unberührt; der Kern mit dem zweiten Satz rechnet an echten Messfeld-Tagen genau das Brett der Regel D2 der Eichung |
| `verify:glacier-snowcore` | **24/24** (23 + A4: Konstantensatz mit eigener Dichte und Quantilen) |
| Gegenprobe der Prüfer | `gm3b-mutations.mjs`: 23 Mutationen an Schaltern, Lesern, Producer, beiden Kernen und der Tabelle — **23 von 23 bemerkt**, eine nur als Abbruch (die Tabelle wird auch bei `gate-c` geöffnet: der Prüfer bricht im älteren Block G ab, weil die echte Tabelle die Regionen des Testkatalogs nicht kennt). Erster Durchgang: 23 von 23, drei nur als Abbruch; daraufhin zwei Prüfungen gehärtet und die Blockprüfung des Producers verschärft, zweiter Durchgang in `gm3b-mutations.json` |
| Gegenprobe GM-3 gegen den geänderten Prüfer | `gm3-mutations.mjs` wiederholt: 19 von 19 bemerkt; Hash der eingefrorenen Methode `cf4c001b…` unverändert |
| lokaler Volllauf | §3d.4: aus = 338 Dateien Byte für Byte der Stand vor GM-3b |
| übrige Prüfer | `glacier-weather` 41/41, `glacier-contract` 64/64, `glacier-publish` 34/34, `glacier-snow-view` 19/19, `glacier-dossier-heute` 21/21 |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281) |
| `npm run budget` | **rot, schon an HEAD:** totalJs 2 118,1 / 2 118 KB. Gegengeprüft mit einem Kontroll-Build ohne die Typ-Zeile dieser Phase: derselbe Wert, alle 186 JS-Dateien beider Builds mit gleichem Namen (Inhalts-Hash) und gleicher Größe. Seit der letzten Messung (2 117,2 in §3b.7) sind unter `src/` nur die vier `fix(fire)`-Commits vom 22.11. 23:15–23:32 dazugekommen; die 0,9 KB sind ihnen zuzuordnen, einzeln gemessen habe ich sie nicht. Grenze nicht angehoben (V-GM-30) |

Nicht geprüft: kein Lauf auf dem Runner; kein Browser (keine Anzeige liest etwas Neues); `country` an einer Wetterlage und aus einem Kaltstart gemessen, kein Sommerlauf; der Dichte-Schalter hat keinen Leser im Betrieb (`snowCoreSetup` ist der Einstieg für GM-5); `verify:glacier-ui` (bricht an HEAD ab, V-GH-6).

Die fünf Fragen: (1) Funktionserhalt — Volllauf A (338 Dateien gleich), H1, H2, die 41 alten Prüfungen des Schmelzlaufs; (2) Desktop pixelgleich — kein Byte im Bundle geändert (Kontroll-Build), nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

**Gate GM-3b: gebaut und geprüft, beide Schalter aus. Mit der Voreinstellung schreibt der Producer dieselben Bytes wie vorher.** Offen bleibt das Budget (rot an HEAD, nicht aus dieser Phase).

### 3d.6 Entscheidungen und Befunde aus GM-3b

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-12 | **`country` einschalten — wann?** Dafür: der größte bekannte Fehler (im Mittel fehlen 0,58 m Winterbilanz) ist erst damit behoben. Dagegen: Brücke eine Woche alt (V-GM-24); der Schmelzindex ändert sich sofort an rund 9 % der Gletscher (§3d.4); `TF`/`SRF` gehören zur alten Schneedecke (V-GM-26). Empfehlung wie in E-GM-7: nach 30 Niederschlagstagen Brücke, und vor der Schmelzsaison 2027 Gate C mit festem `F` nachrechnen. Wege: Voreinstellung `SNOW_PRECIP_DEFAULT = 'country'` (wirkt mit dem Push; dabei die Tabelle mit `snowcal-table.mjs` neu schreiben, sonst meldet G1 `usedByProducer`), oder ohne Code `GLACIER_SNOW_PRECIP: country` im Workflow `glacier-melt` des Daten-Repos | offen (Jan) |
| E-GM-13 | **Regel „`board` nur mit `country`“** ist meine Setzung aus §3c.5 (96 kg/m³ gelten für wahres Wasser). Bestätigen oder die Dichte unabhängig schaltbar machen? | offen (Jan) |
| V-GM-26 | `TF` und `SRF` der Schmelze sind in Gate C zusammen mit `pf = 1,289` geeicht. Mit `country` liegt mehr Schnee, die Schneedecke hält länger, die Schmelze fällt kleiner aus (gemessen: Summe der Index-Mediane −4,7 %, an keinem Gletscher höher). Mehrwert: die Sommerschmelze passt zur neuen Schneedecke. Skizze: die 75 Gletscherjahre von Gate C mit festem `F` je Land und ohne Gradient neu durch `gate-c.mjs`, nur `TF`/`SRF` neu fitten, vor Mai 2027 | offen |
| V-GM-27 | Der fortgeschriebene Zustand kennt seinen Faktor nicht: nach dem Einschalten liegt Schnee aus beiden Rechnungen übereinander, und nach 30 Stunden ohne Lauf beginnt er ohnehin bei null (§2, Punkt 7). Mehrwert: eine Schneedecke aus einer Rechnung. Skizze: mit dem Einschwingen aus GM-5 (Rückrechnung ab 1. Oktober) zusammen einschalten, oder `precip` in `state.json` vermerken und bei einem Wechsel kalt starten | GM-5 |
| V-GM-28 | Mit `country` bleibt `params.pf = 1,289` mit Herkunft `measured` im Dokument stehen, obwohl es nicht galt (ältere Stände der Seite verwerfen ein Dokument ohne die Zahl); der Block nennt es (`replaces: pf`). Skizze: sobald kein alter Seitenstand mehr unterwegs ist, `pf` unter `country` weglassen und den Vertrag der Seite lockern | offen |
| V-GM-29 | „Wetter am Gletscher“ zeigt Neuschnee in mm Wasserwert **ohne** Faktor. Mit `country` wächst die Schneedecke des Schmelzlaufs 1,4- bis 1,8-mal so schnell wie die angezeigte Neuschneesumme. Für GM-7 heißt das: die Anzeige in cm muss dasselbe Wasser nehmen wie der Schneekern (hinter `F`), sonst passen 96 kg/m³ nicht. Skizze: `weathercore.mjs` bekommt denselben Schalter, oder die Anzeige liest künftig den Schneekern | GM-7 (Jan) |
| V-GM-30 | Das Budget ist an HEAD rot (totalJs 2 118,1 / 2 118 KB), seit den Brand-Korrekturen vom 22.11. abends; diese Phase ändert kein Bundle-Byte. Skizze: Grenze mit Notiz auf 2 119 heben (Jans Regel vom 30.09.) in der Linie, die es verursacht hat | offen (Jan / Brand-Linie) |

## 4. Quellenliste (zur Prüfung durch Jan)

Spalte „Stand“: **da** = schon im Betrieb, **neu** = käme mit dieser Phase dazu. Spalte „Lizenz“: **belegt** = am 22.11. an der Quelle gelesen; **wie bisher** = unverändert aus der bestehenden Linie; **offen** = von mir nicht geprüft.

### 4.1 Antrieb

| Nr. | Quelle | Wofür | Stand | Lizenz |
|---|---|---|---|---|
| Q1 | buscosun Fusion 14 über den Punkt-Cube (darin DWD ICON, MeteoSchweiz ICON-CH1/CH2, GeoSphere C-LAEF, ECMWF, MOSMIX) | Temperatur, Feuchte, Wind, Niederschlag, Bewölkung, P(Schnee) an drei Höhen | da | wie bisher |

### 4.2 Messungen für Kopplung und Schattenpaare (laufend)

| Nr. | Quelle | Was | Stand | Lizenz |
|---|---|---|---|---|
| Q2 | SLF IMIS, `measurement-api.slf.ch/public/api/imis` | Schneehöhe halbstündlich; 207 Stationen, 78 ab 2 500 m, höchste 3 345 m | da (Phase GI) | CC BY 4.0, belegt |
| Q3 | Land Tirol (LWD Tirol, HD Tirol), `data.tirol.gv.at` | Schneehöhe, Änderung 24/48/72 h | da (Phase GO) | CC BY 4.0, wie bisher |
| Q4 | Provinz Bozen | Schneehöhe | da | CC0, wie bisher |
| Q5 | `obs/v1`: GeoSphere TAWES (285 Stationen mit Schneehöhe, 11 ab 2 000 m), MeteoSchweiz SMN (102 / 13) und NIME (270 / 5), DWD | Schneehöhe | da (`obs.yml`) | wie bisher |
| Q6 | SLF Beobachter-Messfelder, `measurement-api.slf.ch/public/api/study-plot` | gemessener Neuschnee (`HN_1D`), Schneehöhe, Wasserwert des Neuschnees, täglich 6 UTC; 100 Stationen, 3 ab 2 500 m, höchste 2 690 m. **GM-3:** die Historie je Messfeld steht unter `measurement-data.slf.ch/study-plot/` (V-GM-17) | neu | CC BY 4.0, belegt (die Seite des SLF-Datenservice nennt „manual measurement sites, historical and live“) |
| Q7 | GeoSphere `klima-v2-1d` | Schneehöhe (`sh`, `sh_manu`) und Neuschnee von Hand (`shneu_manu`), täglich | neu | offen (Data Hub, vermutlich CC BY 4.0) |
| Q8 | Euregio-Feed `static.avalanche.report`, übrige Betreiber: Trentino (30), Meteomont (19), TIWAG (12), ÖBB (7), Verbund (5), Universität Innsbruck (7), BFW (3), Eurac (3) | Schneehöhe und Wetter in Hochlagen, darunter Stationen der Universität Innsbruck am Hintereisferner | neu | offen, je Betreiber; bisher bewusst ausgeschlossen |
| Q9 | Lawinenwarndienste Salzburg, Kärnten, Vorarlberg, Steiermark (über `lawis.at`) | Schneehöhe für die Hohen Tauern, Silvretta, Dachstein | neu | offen; Endpunkt von mir nicht geprüft |
| Q10 | Lawinenwarndienst Bayern | Schneehöhe am Zugspitzplatt für die vier deutschen Gletscher | neu | offen; Endpunkt nicht geprüft |

### 4.3 Analysen und zweite Meinung

| Nr. | Quelle | Wofür | Stand | Lizenz |
|---|---|---|---|---|
| Q11 | GeoSphere SNOWGRID Klima v2.1 (`snowgrid_cl-v2-1d-1km`) | Schneehöhe und Wasserwert täglich, Österreich; Historie ab 1961 für die Eichung | da (Phase GN) | CC BY 4.0, wie bisher |
| Q12 | GeoSphere `nwp-v2-1h-1km` und `ensemble-v2-1h-1km` | Schneefallmenge (`sf`), Schneefallgrenze (`snowlmt`), Niederschlagsart (`pt`), je mit p10/p50/p90 | neu | offen (Data Hub, vermutlich CC BY 4.0) |
| Q13 | GeoSphere INCA (`inca-v2-1h-1km`) | stündliche Niederschlagsanalyse 1 km, für die Eichung an vergangenen Wintern in Österreich. **GM-3:** `v2` beginnt am 1.10.2026; die vergangenen Winter stehen unter `inca-v1-1h-1km` (V-GM-16, E-GM-11) | neu | offen (wie Q12) |
| Q14 | MeteoSchweiz Niederschlagsanalyse (CombiPrecip liegt im Radar-Spiegel; Tagesgitter in den offenen Daten nicht geprüft) | dasselbe für die Schweiz | teils da | offen |
| Q15 | Sentinel-2 L2A (Copernicus) | Schneegrenze, Schneeanteil, Reihenfolge des Ausaperns je Höhenband | da | wie bisher |
| Q16 | Copernicus Schnee-Produkte (Schneebedeckung 20 m, nasser/trockener Schnee) | Zustand der Schneedecke zwischen den klaren Szenen | neu, optional | offen; Endpunkt nicht geprüft |

### 4.4 Wahrheit für Eichung und Prüfung (einmalig bzw. jährlich)

| Nr. | Quelle | Was | Stand | Lizenz |
|---|---|---|---|---|
| Q17 | GLAMOS Massenbilanz, `doi.glamos.ch` (Release 2025) | Winter- und Jahresbilanz gletscherweit **und je Höhenstufe** | teils da (Gate C nutzte nur gletscherweit) | CC BY 4.0, belegt |
| Q18 | GLAMOS Punktmessungen (`massbalance_point`) | Schneesondierungen im April/Mai mit Lage und Höhe | neu | CC BY 4.0, belegt |
| Q19 | WGMS Fluctuations of Glaciers | Winterbilanzen österreichischer und deutscher Gletscher, teils je Höhenband | da (Reihen) | wie bisher |
| Q20 | SLF-Schneedatensatz 2016–2025, 250 m, Zenodo `10.5281/zenodo.17313889` | tägliche Schneehöhe und Wasserwert für die Schweiz, zehn Winter; zehn Archive, zusammen rund 6,3 GB | neu | CC BY 4.0, belegt (Zenodo-Eintrag) |
| Q21 | MeteoSchweiz SwissMetNet, Stundenwerte | gemessener Antrieb für die Eichung an vergangenen Wintern | da (Gate C) | wie bisher |
| Q22 | Universität Innsbruck, Hintereisferner | Fremdtest wie in Gate C | da | wie bisher |

### 4.5 Gelände und Umrisse

| Nr. | Quelle | Stand |
|---|---|---|
| Q23 | swissALTI3D, DGM Österreich, Copernicus GLO-30; Umrisse SGI2023, AGI5, RGI | da |

### 4.6 Nur als Link (keine Daten)

Lawinenbulletin des SLF, Lawinenwarndienste je Region, amtliche Wetterwarnungen. Behebt zugleich M-19 der Prüfliste.

### 4.7 Was Jan prüfen muss

Offen waren Q7, Q8, Q9, Q10, Q12, Q13, Q14, Q16.

**E-GM-5 (Jan, 22.11.2026, „diese Quellen sind auf jeden Fall frei“):**

| Nr. | Quelle | Kommerziell frei | Lizenz und Auflage |
|---|---|---|---|
| Q7 | GeoSphere `klima-v2-1d` | ja | CC BY 4.0 |
| Q12 | GeoSphere `nwp-v2-1h-1km`, `ensemble-v2-1h-1km` | ja | CC BY 4.0 |
| Q13 | GeoSphere INCA `inca-v2-1h-1km` | ja | CC BY 4.0 |
| Q14 | MeteoSchweiz Tagesgitter (RhiresD, RprelimD) | ja | CC BY 4.0, „Quelle: MeteoSchweiz“ |
| Q16 | Copernicus Schnee-Produkte (CLMS) | ja | Copernicus-Datenpolitik, Quellenvermerk |

**Weiter offen: Q8, Q9, Q10** (übrige Betreiber im Euregio-Feed, Lawinenwarndienste Salzburg/Kärnten/Vorarlberg/Steiermark, Lawinenwarndienst Bayern). Bis zu einer Freigabe werden sie nicht gelesen. Sie entscheiden, wie viele österreichische Gletscher außerhalb Tirols eine Schneestation bekommen.

Nicht vorgesehen: Sentinel-1-Schneehöhe (fachlich umstritten, nur trockener Schnee), das laufende Schneemodell des SLF (kein offener Endpunkt gefunden).

## 5. Modellentwurf

Kette je Gletscher und Lauf:

1. **Antrieb:** buscosun Fusion 14 an Zunge, Mitte und Oberkante (drei Abfragen, flaches Gelände in der jeweiligen Höhe); dazwischen linear je 50-m-Band.
2. **Phase:** P(Schnee) der Antwort je Höhe (Regel `psnow`, im Producer gebaut und aus). Daraus eine eigene Schneefallgrenze, die zur Temperatur der Karte passt.
3. **Niederschlag:** Faktor und Höhengradient je Region, geeicht an den Winterbilanzen je Höhenstufe (Q17, Q19).
4. **Schneedecke je Band:** Neuschneeschicht und Altschnee mit Dichte und Setzung; Regen auf Schnee; Schmelze aus dem bestehenden Kern. Ausgabe: Schneehöhe cm, Wasserwert mm, Neuschnee cm über 24/48/72 h.
5. **Verteilung:** relativer Zuschlag je Band aus der Reihenfolge des Ausaperns in den Sentinel-2-Saisons 2023–2026.
6. **Kopplung:** gemessene Änderung der Schneehöhe an den zugeordneten Stationen korrigiert den Niederschlag des Gletschers, mit Abklingen und einer Tabelle der typischen Abweichung je Station; Nachbar-Übertrag für Gletscher ohne Station. SNOWGRID als schwache Randbedingung in Österreich. Satelliten-Schneegrenze einmal je Szene.
7. **Spannen:** Szenarien über Niederschlag, Phase und Dichte; p10–p90 je Größe.
8. **Einschwingen:** Start des Zustands aus einer Rückrechnung ab 1. Oktober statt bei null.

Alle Konstanten tragen ihre Herkunft (`measured`, `literature`, `set`).

## 6. Arbeitspakete

| Paket | Inhalt | Ergebnis |
|---|---|---|
| GM-0 | Diagnose, Quellen, Messung M-1 (dieses Dokument) | erledigt 22.11. |
| GM-1 | Kern `snowcore.mjs` (Dichte, Setzung, Schichten), Verifier `verify:glacier-snowcore` 23/23, Messung M-2 (§3a) | erledigt 22.11., uncommitted |
| GM-2 | Antrieb an drei Höhen im Producer (Schalter `--heights=three`), Schneeanteil je Höhe aus der eigenen Antwort, eigene Schneefallgrenze `slo`/`slk`; Kaltluftlage zu K-2 nachgestellt (§3b) | erledigt 22.11., lokal committet, Schalter ein (E-GM-6, §3b.7); wirkt mit dem Push |
| GM-3 | Eichung an vergangenen Wintern: Niederschlag je Region und Höhe (Q13, Q14, Q17–Q19, Q21, Q22), Dichte (Q6, Q7), Brücke zu buscosun Fusion (§3c) | erledigt 22.11., uncommitted: Tabelle `snow-calibration.json` (Urteil rot), `verify:glacier-snowcal`; Q20 (SLF-Datensatz 250 m) nicht benutzt |
| GM-3b | E-GM-7 Faktor je Land im Schmelzlauf (`--precip=country`, ohne Verlauf) und E-GM-8 Neuschneedichte 96 kg/m³ als zweiter Konstantensatz des Schneekerns (`board`) (§3d) | erledigt 23.11., uncommitted, **beide Schalter aus** |
| GM-4 | Kopplung an Stationen, Abweichungstabelle, Nachbar-Übertrag; Satelliten-Abgleich einmal je Szene (behebt M-18) | gekoppelter Zustand |
| GM-5 | Verteilung aus Sentinel-2, Szenarien und Spannen, Einschwingen | vollständiges Produkt |
| GM-6 | Betrieb: Workflow, Archiv des Zustands, tägliche Schattenpaare | läuft im Daten- und Archiv-Repo |
| GM-7 | Anzeige im Dossier (Höhenleiter in cm mit Spanne, „berechnet, noch nicht nachgemessen“, Schalter), Vorbehalt auf jeder Ebene | sichtbar (E-GM-1) |
| GM-8 | Prüfstand mit eingefrorenem Protokoll; Abnahme im Frühjahr 2027 gegen GLAMOS und WGMS | Gate |

Reihenfolge: GM-1 und GM-2 zuerst (sie hängen an keiner offenen Quelle), GM-3 parallel mit den belegten Quellen, GM-4 nach Jans Quellenprüfung.

## 7. Prüfprotokoll (Entwurf, vor dem Einschalten einzufrieren)

- **Täglich:** Schneehöhe des Modells in der Höhe der Station gegen die Messung (IMIS, Tirol, Südtirol, TAWES, SMN); Neuschnee 24 h gegen die Änderung der Schneehöhe und, wo vorhanden, gegen gemessenen Neuschnee (Q6, Q7). Kennzahlen: Bias, MAE, Anteil innerhalb der Spanne.
- **Rückwirkend:** Winter 2023–2025 mit gemessenem Antrieb gegen GLAMOS je Höhenstufe (Q17), gegen die Sondierungen (Q18) und gegen den SLF-Datensatz (Q20). Gegenüberstellung mit dem heutigen Kern (MAE 0,364).
- **Abnahme 2027:** Winterbilanz 2026/27 je Höhenstufe mit Fusion-Antrieb. Schwellen werden vor GM-6 gesetzt und versiegelt.
- **Negativkontrolle:** dieselben Kennzahlen ohne Kopplung; die Kopplung muss sie schlagen.

## 8. Grenzen, die das Modell nicht aufhebt

- Kein Wert für eine Stelle auf dem Eis; Wind und Lawinen nur als Mittel je Höhenband.
- Keine Aussage über Spalten oder Schneebrücken. Die Anzeige darf nicht wie eine Tour-Aussage klingen.
- Über rund 3 300 m gibt es keine Station zur Kopplung.
- Stationen stehen neben dem Eis, bis 300 m versetzt.

## 9. Offen

- V-GM-1: Welche MOSMIX-Station trägt an Gletscherpunkten das Temperaturgewicht (Nebenbefund M-1)? — beantwortet in §3b.1 (die nächste bis 15 km, ohne Höhenprüfung); weiter als V-GM-9.
- V-GM-9 … V-GM-14 und E-GM-6: §3b.6.
- V-GM-2: Der lokale Klon `C:\dev\buscosun-data` steht auf dem 04.11.; für GM-3 und GM-6 braucht es einen frischen Stand. — GM-3 kam ohne aus (die Wetterläufe der Brücke sind über `raw.githubusercontent.com` gelesen); für GM-6 bleibt der Punkt.
- V-GM-3: Fenster der Stationszuordnung (5 km) nur für die Schneehöhe weiter fassen? Hängt mit E-GO-1 zusammen.
- V-GM-4: Speicherbedarf des Zustandsarchivs (2 094 Gletscher × Bänder × Tage) vor GM-6 messen.
- V-GM-5: Tägliche Ablage der SLF-Messfelder (gemessener Neuschnee) sofort beginnen, weil die Schnittstelle keine Historie hält; historische Dateien beim SLF-Datenservice suchen. — **erledigt (V-GM-17):** die Historie steht offen unter `measurement-data.slf.ch/study-plot/`, eine eigene Ablage braucht es nicht.
- E-GM-7 … E-GM-11 und V-GM-15 … V-GM-24: §3c.10.
- E-GM-12, E-GM-13 und V-GM-26 … V-GM-30: §3d.6.
- Q20 (SLF-Schneedatensatz 250 m, 6,3 GB) ist in GM-3 nicht benutzt. Er gäbe eine zweite, modellgestützte Wahrheit für alle Schweizer Gletscher (auch die ohne Messung) und damit eine Prüfung, ob sich der Landesfaktor überträgt.
- V-GM-6: Durchfeuchtung und Wiedergefrieren fehlen im Kern; die Schneehöhe wird damit im Frühjahr zu hoch ausfallen. Vor dem Frühjahr 2027 an IMIS-Reihen nachziehen.
- V-GM-7: Die Schichtdauer von 6 Stunden begrenzt die Schärfe von „Neuschnee 24 h“; angeschnittene Schichten zählen anteilig. Kürzere Schichten kosten Zustandsgröße (mit V-GM-4 messen).
- V-GM-8: Der Vertrag `glacierSnowpackContract.ts` und der Pfad `glacier/v1/snowpack/` entstehen mit der Verdrahtung im Producer (GM-2/GM-5), nicht mit dem Kern.
