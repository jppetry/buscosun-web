# Phase GM — Schneemodell am Gletscher („virtueller Schneesensor“)

> Stand 22.11.2026 nachts: GM-0 (Diagnose, Quellen, M-1), GM-1 (Schneekern, §3a) und GM-2 (drei Höhen im Producer, eigene Schneefallgrenze, §3b) gebaut und lokal committet (nicht gepusht), nichts im Daten- oder Archiv-Repo. Der Schalter von GM-2 ist **ein** (E-GM-6, Jan 22.11. „einschalten und committen“, §3b.7); er wirkt mit dem Push von `main`.
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
| Q6 | SLF Beobachter-Messfelder, `measurement-api.slf.ch/public/api/study-plot` | gemessener Neuschnee (`HN_1D`), Schneehöhe, Wasserwert des Neuschnees, täglich 6 UTC; 100 Stationen, 3 ab 2 500 m, höchste 2 690 m | neu | CC BY 4.0, belegt (die Seite des SLF-Datenservice nennt „manual measurement sites, historical and live“) |
| Q7 | GeoSphere `klima-v2-1d` | Schneehöhe (`sh`, `sh_manu`) und Neuschnee von Hand (`shneu_manu`), täglich | neu | offen (Data Hub, vermutlich CC BY 4.0) |
| Q8 | Euregio-Feed `static.avalanche.report`, übrige Betreiber: Trentino (30), Meteomont (19), TIWAG (12), ÖBB (7), Verbund (5), Universität Innsbruck (7), BFW (3), Eurac (3) | Schneehöhe und Wetter in Hochlagen, darunter Stationen der Universität Innsbruck am Hintereisferner | neu | offen, je Betreiber; bisher bewusst ausgeschlossen |
| Q9 | Lawinenwarndienste Salzburg, Kärnten, Vorarlberg, Steiermark (über `lawis.at`) | Schneehöhe für die Hohen Tauern, Silvretta, Dachstein | neu | offen; Endpunkt von mir nicht geprüft |
| Q10 | Lawinenwarndienst Bayern | Schneehöhe am Zugspitzplatt für die vier deutschen Gletscher | neu | offen; Endpunkt nicht geprüft |

### 4.3 Analysen und zweite Meinung

| Nr. | Quelle | Wofür | Stand | Lizenz |
|---|---|---|---|---|
| Q11 | GeoSphere SNOWGRID Klima v2.1 (`snowgrid_cl-v2-1d-1km`) | Schneehöhe und Wasserwert täglich, Österreich; Historie ab 1961 für die Eichung | da (Phase GN) | CC BY 4.0, wie bisher |
| Q12 | GeoSphere `nwp-v2-1h-1km` und `ensemble-v2-1h-1km` | Schneefallmenge (`sf`), Schneefallgrenze (`snowlmt`), Niederschlagsart (`pt`), je mit p10/p50/p90 | neu | offen (Data Hub, vermutlich CC BY 4.0) |
| Q13 | GeoSphere INCA (`inca-v2-1h-1km`) | stündliche Niederschlagsanalyse 1 km, für die Eichung an vergangenen Wintern in Österreich | neu | offen (wie Q12) |
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
| GM-3 | Eichung an vergangenen Wintern: Niederschlag je Region und Höhe (Q17–Q22), Dichte (Q6, Q7) | Tabellen mit Herkunft, Bericht |
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
- V-GM-2: Der lokale Klon `C:\dev\buscosun-data` steht auf dem 04.11.; für GM-3 und GM-6 braucht es einen frischen Stand.
- V-GM-3: Fenster der Stationszuordnung (5 km) nur für die Schneehöhe weiter fassen? Hängt mit E-GO-1 zusammen.
- V-GM-4: Speicherbedarf des Zustandsarchivs (2 094 Gletscher × Bänder × Tage) vor GM-6 messen.
- V-GM-5: Tägliche Ablage der SLF-Messfelder (gemessener Neuschnee) sofort beginnen, weil die Schnittstelle keine Historie hält; historische Dateien beim SLF-Datenservice suchen.
- V-GM-6: Durchfeuchtung und Wiedergefrieren fehlen im Kern; die Schneehöhe wird damit im Frühjahr zu hoch ausfallen. Vor dem Frühjahr 2027 an IMIS-Reihen nachziehen.
- V-GM-7: Die Schichtdauer von 6 Stunden begrenzt die Schärfe von „Neuschnee 24 h“; angeschnittene Schichten zählen anteilig. Kürzere Schichten kosten Zustandsgröße (mit V-GM-4 messen).
- V-GM-8: Der Vertrag `glacierSnowpackContract.ts` und der Pfad `glacier/v1/snowpack/` entstehen mit der Verdrahtung im Producer (GM-2/GM-5), nicht mit dem Kern.
