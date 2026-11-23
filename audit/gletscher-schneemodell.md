# Phase GM — Schneemodell am Gletscher („virtueller Schneesensor“)

> Stand 23.11.2026: GM-0 (Diagnose, Quellen, M-1), GM-1 (Schneekern, §3a) und GM-2 (drei Höhen im Producer, eigene Schneefallgrenze, §3b) gebaut, committet und seit 23.11. ≈ 15:50 UTC auf `origin/main` (Jans Push, §3e.7), nichts im Daten- oder Archiv-Repo. Der Schalter von GM-2 ist **ein** (E-GM-6, Jan 22.11. „einschalten und committen“, §3b.7); er wirkt mit dem Push von `main`.
> **GM-3 (Eichung, §3c) gebaut, lokal committet (`d09aecf6`):** Tabelle `scripts/glacier/snow-calibration.json` nach eingefrorener Methode — Niederschlagsfaktor 1,79 (Schweiz) / 2,33 (Österreich) statt 1,289, Urteil **rot** (K-2, K-4: kein belastbarer Höhenverlauf), Neuschneedichte 96 statt 68 kg/m³.
> **GM-3b (E-GM-7 + E-GM-8, §3d) gebaut 23.11., committet (`d09aecf6`, `1df1a160`) und gepusht, beide Schalter AN (E-GM-12, Jan 23.11. „committe, schalte ein“, §3e):** der Schmelzlauf rechnet ab Werk mit dem Faktor je Land (`country`, ohne Höhenverlauf), der Schneekern mit 96 kg/m³ und der Spanne 65–148 (`board`, zweiter Konstantensatz, noch ohne Leser im Betrieb). Auf `origin/main` seit 23.11. ≈ 15:50 UTC; der erste Schmelzlauf des neuen Producers (`2026112317`, 17:23 UTC) ist grün und rechnet mit `country` (§3e.7). Der Rückfall `--precip=gate-c` schreibt die Bytes wie vor GM-3b und öffnet die Tabelle nicht. E-GM-13 ist bestätigt (Jan 23.11.); E-GM-9 … E-GM-11 warten auf Jan.
> **GM-3c (§3f) gebaut 23.11., auf `origin/main` (`c4b45c9e`), Schalter auf dem Runner AN seit 23.11. 19:27 UTC (E-GM-18, §3f.8; im Code bleibt die Voreinstellung `off`):** der Schneekern läuft im Schmelzlauf je Gletscher an Zunge, Medianhöhe und Oberkante und schreibt hinter `--snowpack=shadow` das Schattenprodukt `glacier/v1/snowpack/` (Schneehöhe, Wasserwert, Neuschnee; alles „berechnet“) mit einem Zustand, der nicht an der Taktung hängt. Startzustand ab 1.10. aus Analysen mit `snowpack-seed.mjs` (E-GM-14), alle 2 084 Gletscher (E-GM-16), die ungenannte Dichte folgt dem Faktor (E-GM-15), Publisher mit Präfix `snowpack` (E-GM-17). Mit dem Schalter aus sind am lokalen Volllauf 338 von 338 Dateien Byte für Byte gleich. Eingeschaltet über den Workflow `glacier-melt` im Daten-Repo (`GLACIER_SNOWPACK: shadow`, `3a119833`), Startzustand vom 23.11. 17:00 UTC eingespielt (`4ae73e46`); der erste Lauf mit Schalter steht aus (§3f.8).
> **GM-3d (§3g, V-GM-32) gebaut 23.11. abends, uncommitted, Schalter AUS:** der Zustand des Schmelzlaufs steht hinter `--melt-state=run-hour` an der Laufstunde und trägt 18 Stunden Antrieb; der nächste Lauf rechnet ihn bis zu seiner Stunde nach, gleich in welchem Abstand. Heute verwirft jeder Lauf, der 3 Stunden nach dem vorigen kommt, den Zustand — die Kachel „Fläche ohne Schneedecke“ springt dann im Mittel um rund 21 Punkte (gemessen). Ohne Schalter 338 von 338 Dateien Byte für Byte gleich. Einschalten ist Jans Entscheidung (E-GM-19).
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
| E-GM-12 | **`country` einschalten — wann?** Dafür: der größte bekannte Fehler (im Mittel fehlen 0,58 m Winterbilanz) ist erst damit behoben. Dagegen: Brücke eine Woche alt (V-GM-24); der Schmelzindex ändert sich sofort an rund 9 % der Gletscher (§3d.4); `TF`/`SRF` gehören zur alten Schneedecke (V-GM-26). Empfehlung wie in E-GM-7: nach 30 Niederschlagstagen Brücke, und vor der Schmelzsaison 2027 Gate C mit festem `F` nachrechnen. Wege: Voreinstellung `SNOW_PRECIP_DEFAULT = 'country'` (wirkt mit dem Push; dabei die Tabelle mit `snowcal-table.mjs` neu schreiben, sonst meldet G1 `usedByProducer`), oder ohne Code `GLACIER_SNOW_PRECIP: country` im Workflow `glacier-melt` des Daten-Repos | **entschieden: Jan 23.11., ein** (über die Voreinstellung, §3e) |
| E-GM-13 | **Regel „`board` nur mit `country`“** ist meine Setzung aus §3c.5 (96 kg/m³ gelten für wahres Wasser). Bestätigen oder die Dichte unabhängig schaltbar machen? | **bestätigt: Jan 23.11. „ja passt so“** (§3e.7) |
| V-GM-26 | `TF` und `SRF` der Schmelze sind in Gate C zusammen mit `pf = 1,289` geeicht. Mit `country` liegt mehr Schnee, die Schneedecke hält länger, die Schmelze fällt kleiner aus (gemessen: Summe der Index-Mediane −4,7 %, an keinem Gletscher höher). Mehrwert: die Sommerschmelze passt zur neuen Schneedecke. Skizze: die 75 Gletscherjahre von Gate C mit festem `F` je Land und ohne Gradient neu durch `gate-c.mjs`, nur `TF`/`SRF` neu fitten, vor Mai 2027 | offen |
| V-GM-27 | Der fortgeschriebene Zustand kennt seinen Faktor nicht: nach dem Einschalten liegt Schnee aus beiden Rechnungen übereinander, und nach 30 Stunden ohne Lauf beginnt er ohnehin bei null (§2, Punkt 7). Mehrwert: eine Schneedecke aus einer Rechnung. Skizze: mit dem Einschwingen aus GM-5 (Rückrechnung ab 1. Oktober) zusammen einschalten, oder `precip` in `state.json` vermerken und bei einem Wechsel kalt starten | GM-5 |
| V-GM-28 | Mit `country` bleibt `params.pf = 1,289` mit Herkunft `measured` im Dokument stehen, obwohl es nicht galt (ältere Stände der Seite verwerfen ein Dokument ohne die Zahl); der Block nennt es (`replaces: pf`). Skizze: sobald kein alter Seitenstand mehr unterwegs ist, `pf` unter `country` weglassen und den Vertrag der Seite lockern | offen |
| V-GM-29 | „Wetter am Gletscher“ zeigt Neuschnee in mm Wasserwert **ohne** Faktor. Mit `country` wächst die Schneedecke des Schmelzlaufs 1,4- bis 1,8-mal so schnell wie die angezeigte Neuschneesumme. Für GM-7 heißt das: die Anzeige in cm muss dasselbe Wasser nehmen wie der Schneekern (hinter `F`), sonst passen 96 kg/m³ nicht. Skizze: `weathercore.mjs` bekommt denselben Schalter, oder die Anzeige liest künftig den Schneekern | GM-7 (Jan) |
| V-GM-30 | Das Budget ist an HEAD rot (totalJs 2 118,1 / 2 118 KB), seit den Brand-Korrekturen vom 22.11. abends; diese Phase ändert kein Bundle-Byte. Skizze: Grenze mit Notiz auf 2 119 heben (Jans Regel vom 30.09.) in der Linie, die es verursacht hat | **erledigt 23.11.:** Grenze von Hand 2 118 → 2 121 (Jan „hebe auf 3 kb“, gelesen als 3 KB Luft), Budget grün (§3e.7) |

## 3e. Einschalten: Faktor je Land und Neuschneedichte (E-GM-12, Jan 23.11. „committe, schalte ein“)

Jans Wort vom 23.11.: committen und einschalten. Umgesetzt in zwei Commits, damit das Einschalten einzeln zurückgenommen werden kann: `d09aecf6` trägt GM-3 und GM-3b wie gebaut (beide Schalter aus), der Commit danach legt nur die Voreinstellungen um und passt die Prüfer an. Kein Push, nichts am Daten- oder Archiv-Repo, kein Workflow geändert, buscosun Fusion nur gelesen.

Damit ist E-GM-12 entschieden, und zwar früher als meine Empfehlung (erst 30 Niederschlagstage Brücke, erst Gate C mit festem Faktor nachrechnen). Was das heißt, steht in §3e.4.

### 3e.1 Was umgelegt ist

| Stelle | vorher | jetzt |
|---|---|---|
| `SNOW_PRECIP_DEFAULT` (`scripts/glacier/lib/snowcal.mjs`) | `gate-c` | `country` |
| `SNOW_DENSITY_SOURCE_DEFAULT` (ebenda) | `helfricht` | `board` |
| `usedByProducer` in `snow-calibration.json` | `false` | `true` |

Sonst kein Code: Schmelzlauf, beide Kerne und der Vertrag sind die von GM-3b. Die Tabelle ist Zeichen für Zeichen die Ausgabe von `buildTable` aus den drei Berichten (verglichen; Gegenprobe: gegen die Tabelle des Commits davor weicht genau eine Zeile ab).

**Wirkung:** mit dem Push von `main`, weil der Runner den Producer von dort holt (`GLACIER_PRODUCER_REF = main`). Ab dem ersten Schmelzlauf danach rechnet die Akkumulation mit 1,79 (Schweiz), 2,33 (Österreich), 1,85 (Deutschland, übertragen) und ohne die 4 % je 100 m; das Dokument trägt `params.precip`, die Statuszeile `precip: country`. Die Dichte 96 kg/m³ wirkt erst, wenn ein Producer den Schneekern rechnet (heute keiner).

**Was der Runner dafür braucht:** die Datei `scripts/glacier/snow-calibration.json`. Der Workflow `glacier-melt` holt `scripts` als Ganzes (Vorlage `workflow-glacier-melt.yml`, Zeile 61; ebenso der lokale Klon des Daten-Repos vom 04.11.). Den Workflow, der dort läuft, habe ich vor dem Einschalten nicht gelesen; nach dem Push gelesen, er holt `scripts` als Ganzes und setzt keinen Schalter (§3e.7). Die Tabelle kennt alle 26 Regionen des Katalogs (E2, und der Volllauf am echten Katalog vom 21.11.). Kommt mit einem neuen Katalog-Build eine Region dazu, die die Tabelle nicht kennt, endet der Lauf rot und nennt die Region (H6) — dann die Tabelle ergänzen oder zurückschalten.

### 3e.2 Prüfer

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-melt` | **49/49**. Die Blöcke bis G rechnen von Hand mit dem Faktor von Gate C und 4 % je 100 m; sie nennen jetzt den Rückfall (`GATE_C`). H1 neu: ohne Angabe dieselben Bytes wie mit `country`; `gate-c` schreibt andere Dateien und braucht die Tabelle nicht (ohne Tabellendatei dieselben Bytes); ohne Angabe und ohne Tabellendatei Abbruch; ohne `--snowcal` liest der Lauf die Tabelle des Repos (Abbruch mit der Region des Testkatalogs). H5 umgekehrt: `GLACIER_SNOW_PRECIP=gate-c` = der Rückfall, ein Schalter `country` daneben gewinnt |
| `verify:glacier-snowcal` | **37/37**. G1 beide Voreinstellungen an, die Tabelle sagt dasselbe; G2 `gate-c` allein wird abgelehnt (die Dichte der Voreinstellung wird nicht still mitgestellt, V-GM-31), der Rückfall mit beiden Wörtern geht; G5 ohne Angabe der zweite Konstantensatz, `board` ohne Tabelle bricht ab |
| `verify:glacier-weather` | **41/41**. Die Läufe nennen den Rückfall: die Tabelle kennt die Regionen der Testkataloge nicht, und die Wetterfelder lesen den Faktor nicht (belegt in §3e.3: 336 Dateien gleich) |
| `verify:glacier-snowcore` | 24/24, unverändert |
| übrige Prüfer | `glacier-contract` 64/64, `glacier-publish` 34/34, `glacier-snow-view` 19/19, `glacier-dossier-heute` 21/21, `glacier-stations` 77/77 |
| Gegenprobe der Prüfer | `gm3b-mutations.mjs` mit umgekehrten Mutationen (Voreinstellungen und Tabellenfeld zurück auf aus) und einer neuen (die Voreinstellung liest eine andere Tabellendatei): **24 von 24 bemerkt**, eine nur als Abbruch (die Tabelle wird auch bei `gate-c` geöffnet — wie in §3d.5); Prüfer danach grün (`gm3b-mutations.json`) |
| Gegenprobe GM-3 gegen den geänderten Prüfer | `gm3-mutations.mjs` wiederholt: 19 von 19 bemerkt, Prüfer danach grün; Hash der eingefrorenen Methode unverändert (E1) |
| `npm run typecheck` | grün |
| Build, Budget | der Einschalt-Commit ändert keine Datei unter `src/`; Stand wie §3d.5 (Budget an HEAD rot, V-GM-30) |

### 3e.3 Messung am lokalen Volllauf

Derselbe Aufbau wie §3d.4 (Cube vom 21.11., Lauf `2026112117`, 2 094 Gletscher, `--now=2026-11-21T17:50:00Z --always`, Kaltstart des Zustands), Ausgaben unter `C:\dev\buscosun-glacier-cache\gm3c\`.

| Lauf | verglichen mit | Ergebnis |
|---|---|---|
| `--precip=gate-c` | Lauf „aus“ aus §3d.4 (= Stand vor GM-3b) | **338 von 338 Dateien Byte für Byte gleich**, Zeiger-Patch gleich, Statuszeile gleich bis auf die Laufzeit |
| ohne Angabe | Lauf `country` aus §3d.4 (lief ohne Wetterteil, 13 Dateien) | alle 13 gleich, darunter das Dokument (648 684 B) und der Zustand |
| ohne Angabe | `--precip=gate-c` (Negativkontrolle) | genau **2 von 338** Dateien verschieden: Dokument und Zustand. Die 336 anderen (Wetter am Gletscher, ältere Läufe) gleich; die Statuszeile nennt `precip: country`, das Dokument den Block mit 26 Regionen, `gate: false`, Brücke 1, Gradient 0 |

Die Zahlen aus §3d.4 gelten damit für den eingeschalteten Stand: Schmelzindex an 182 von 2 094 Gletschern anders (höchstens 11 Punkte, an keinem höher), Schneezuwachs in Österreich 1,77-fach, in Deutschland 1,43-fach.

### 3e.4 Was das Einschalten vor der Empfehlung heißt

- **Die Seite zeigt es sofort:** der Schmelzindex fällt an rund 9 % der Gletscher (tief liegende), sobald der erste Lauf nach dem Push veröffentlicht ist. Gemessen an einer Wetterlage im November; im Sommer ist die Wirkung größer und ungemessen.
- **`TF` und `SRF` gehören zur alten Schneedecke (V-GM-26):** bis Gate C mit festem Faktor nachgerechnet ist, schmilzt das Modell eine dickere Schneedecke mit Schmelzfaktoren, die an einer dünneren geeicht sind. Vor Mai 2027 nachziehen.
- **Der Zustand auf dem Runner mischt (V-GM-27):** der dort fortgeschriebene Schnee stammt aus 1,289, der neue aus 1,79 / 2,33. Der Zeitpunkt ist günstig (die Winterdecke beginnt gerade), eine Rückrechnung ab 1. Oktober gibt es erst mit GM-5.
- **Das Urteil der Eichung bleibt rot** und steht so im Dokument (`gate: false` mit Grund). Die Brücke zu buscosun Fusion ist 1 (`set`), gemessen an einer Woche (V-GM-24).
- **Anzeige und Schmelzlauf rechnen mit verschiedenem Wasser (V-GM-29):** „Wetter am Gletscher“ zeigt Neuschnee ohne Faktor.

### 3e.5 Rückfall

- **Mit Code:** den Einschalt-Commit zurücknehmen (`git revert`), oder die zwei Konstanten und die Zeile der Tabelle zurückstellen (G1 hält die drei zusammen).
- **Ohne Code:** im Workflow `glacier-melt` des Daten-Repos `GLACIER_SNOW_PRECIP: gate-c` setzen (eine Workflow-Änderung, Jans Gate). Der Lauf schreibt dann die Dateien wie vor GM-3b (H5; Volllauf §3e.3, erste Zeile).
- Der Zustand trägt nach einem Rückfall Schnee aus beiden Rechnungen (V-GM-27); nach 30 Stunden ohne Lauf oder mit dem nächsten Satelliten-Abgleich verliert sich das.

### 3e.6 Entscheidungen und Befunde

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-12 | `country` (und mit ihm `board`) einschalten | **entschieden: Jan 23.11., ein** — vor den Bedingungen meiner Empfehlung |
| E-GM-13 | Regel „`board` nur mit `country`“ | **bestätigt: Jan 23.11. „ja passt so“** — `board` nur zusammen mit `country` |
| V-GM-31 | Seit die Dichte ab Werk `board` ist, lehnt `snowSwitchesOf` ein alleiniges `gate-c` ab: ein Producer, der beide Schalter liest, braucht für den Rückfall beide Wörter. Der Schmelzlauf liest nur den Faktor und ist nicht betroffen. Mehrwert: ein Rückfall mit einem Wort, wenn es eilt. Skizze: in GM-5 entscheiden, ob die ungenannte Dichte dem Faktor folgt (und die Statuszeile sagt, was galt) oder ob es bei der strengen Regel bleibt | GM-5 |

Nicht geprüft (Stand beim Einschalten; was nach dem Push dazukam, steht in §3e.7): kein Lauf auf dem Runner (der erste nach dem Push ist die Prüfung); der dort laufende Workflow nicht gelesen; kein Browser; kein Sommerlauf; die Dichte hat keinen Leser im Betrieb.

### 3e.7 Nach dem Push (23.11.)

Jan 23.11., auf die sieben nächsten Schritte: „2. so wie du es für richtig hältst 3. hebe auf 3kb 4. ja passt so. es ist alles gepusht“.

- **Push:** `origin/main` = `main` = `c961a0f6` (gelesen 23.11. 15:52 UTC; der Commit ist von 15:49 UTC). Er trägt `d09aecf6` und `1df1a160`.
- **Der Workflow, der im Daten-Repo läuft** (`.github/workflows/glacier-melt.yml` auf `main`, gelesen 15:52 UTC, 8 603 B): holt den Producer mit `git sparse-checkout set --no-cone scripts src package.json public/climaGrid.json` (Zeile 61) — die Eichtabelle ist dabei; der Aufruf von `melt.mjs` (Zeile 133) trägt kein `--precip`, die Datei setzt kein `GLACIER_SNOW_PRECIP` — es gilt die Voreinstellung `country`. Cron `20 2,5,8,11,14,17,20,23 * * *`.
- **Stand vor dem ersten Lauf:** `glacier/v1/status.json` um 15:52 UTC: `lines.melt.at = 2026-11-23T11:23:58Z`, 2 094 Gletscher, kein Feld `precip` (ein Lauf des alten Producers). Der erste Lauf mit dem neuen Producer ist der Cron von 17:20 UTC.
- **Budget (V-GM-30):** Build an `c961a0f6`: totalJs 2 118,1 KB. Grenze von Hand 2 118 → 2 121 mit Notiz in `budget.json` („hebe auf 3 kb“ gelesen als 3 KB Luft über der alten Grenze); `npm run budget` danach grün (eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 118,1 / 2 121). Uncommitted.
- **E-GM-13:** bestätigt — `board` gibt es nur zusammen mit `country`.
- **Der erste Schmelzlauf des neuen Producers (gelesen 23.11. 17:28 UTC am Commit `3420e65f` des Daten-Repos, „glacier(melt): 2026-11-23T17:25Z“; nur gelesen):** Lauf `2026112317`, `runAt` 17:23:21 UTC, buscosun Fusion 14, Cube t1 `2026112315` / t2 `2026112312` / t3 `2026112300`.

  | Stelle | erwartet (§118 Punkt 2, §116 Punkt 2) | gelesen |
  |---|---|---|
  | `status.json`, `lines.melt` | `precip: country` | `precip: country`, 2 094 Gletscher, 0 übersprungen, `unit: false`, **143 s** (der Lauf davor: 46 s) |
  | `melt/2026112317.json`, `params.precip` | 26 Regionen, `gate: false` mit Grund, Brücke 1, Gradient 0 | `rule: country`, `replaces: pf`, **26 Regionen**, `gate: false` („K-2, K-4 rot: …“), `bridge: 1`, `gradient: 0`, Herkunft beider `set`, Methode `cf4c001b…`; die Faktoren 2,326 / 1,793 / 1,854; `pf` 1,289 steht daneben (V-GM-28) |
  | Schmelzdokument | 2 094 Gletscher | 2 094 Zeilen, 0 übersprungen, 648 052 B; Zustand „carried“, Alter 0, Abgleich an 327 Gletschern |
  | `lines.weather.levels` (GM-2) | Zeilen um 957, 0 Rückfälle | `rule: answers`, **957 Zeilen, 0 Rückfälle**, 32 begrenzte Stunden (0 nass), 83 s für die Zusatzabrufe; 2 084 Wetterzeilen, 10 übersprungen, 27 Dateien, 6,9 MB |

  Um 17:47 UTC noch einmal über `main` gelesen (`raw.githubusercontent.com/…/main/…`, ohne Commit-Angabe): dieselben Werte, der Zeiger `index.melt.run` nennt `2026112317`.

  **Schmelzindex, eingeordnet** (Summe der 14 Tages-Mediane über alle 2 094 Gletscher · Gletscher mit einem Tag über 0 · Eisanteil im Mittel):

  | Lauf | Summe | Gletscher mit Index über 0 | Eisanteil |
  |---|---|---|---|
  | Runner, neuer Producer, `2026112317` (`country`) | 6 335 | 614 | 2 % |
  | Runner, alter Producer, `2026112311` (1,289 und 4 % je 100 m) | 7 704 | 780 | 2 % |
  | lokal 21.11., `country` | 2 932 | 450 | 34 % |
  | lokal 21.11., `gate-c` | 3 076 | 452 | 34 % |

  Die Richtung passt zur lokalen Messung (mit `country` niedriger, an keinem Gletscher höher: lokal −4,7 %, 182 von 2 094 Zeilen anders). Die −18 % zwischen den zwei Läufen auf dem Runner sind **nicht** dem Schalter zuzuschreiben: es sind zwei Läufe im Abstand von sechs Stunden mit einem neuen Cube (t2 `2026112312` statt `…06`), und ein Lauf mit `gate-c` zur selben Stunde liegt nicht vor. Der Unterschied zwischen Runner und lokal (Eisanteil 2 gegen 34 %, höhere Summen) kommt aus dem Zustand: lokal ein Kaltstart, auf dem Runner der fortgeschriebene Schnee und eine andere Wetterlage. Wie viele Zeilen sich auf dem Runner durch den Schalter geändert haben, ist damit nicht gezählt.

  Der Job ist grün, der Rückfall (§118 Punkt 3) nicht nötig. Die Laufzeit auf dem Runner ist mit drei Antworten von 46 auf 143 s gestiegen (lokal 80 auf 185–200 s); die Zeitgrenze des Jobs liegt bei 40 Minuten. Damit ist §116 Punkt 2 und §118 Punkt 2 erledigt.

Die fünf Fragen: (1) Funktionserhalt — der Rückfall schreibt 338 von 338 Dateien wie vor GM-3b, die 41 alten Prüfungen des Schmelzlaufs laufen auf ihm; (2) Desktop pixelgleich — kein Byte im Bundle geändert, nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert. Die Seite zeigt nach dem Push einen anderen Schmelzindex an rund 9 % der Gletscher; das ist die gewollte Wirkung, kein Nebeneffekt.

## 3f. GM-3c: Schneedecke je Höhe als Schattenprodukt `snowpack/` (23.11.)

Auftrag (Jan, 23.11.): den Schneekern als Schattenprodukt in einen Producer verdrahten — je Gletscher und Höhe (Zunge, Medianhöhe, Oberkante) aus den Antworten von buscosun Fusion, die der Wetterteil schon holt: Schneehöhe in cm, Wasserwert in mm, Neuschnee, dazu ein fortgeschriebener Zustand. Vertrag `src/glacier/glacierSnowpackContract.ts` (V-GM-8). Herkunft jedes Werts: „berechnet“, nie „gemessen“. Der Name des Pakets ist **GM-3c** (es zieht die Verdrahtung und das Einschwingen aus GM-5 vor; Verteilung, Szenarien und Spannen bleiben GM-5).

Werkzeuge und Belege: `audit/gletscher-schneemodell/gm3c-spinup-probe.mjs` mit `gm3c-spinup-probe.json`; Zwischenspeicher `C:\dev\buscosun-glacier-cache\gm3c-snowpack\` (gelesene Dateien des Daten-Repos unter `live\`, INCA-Abrufe unter `inca\`). Aus dem Daten-Repo ist nur gelesen worden.

### 3f.1 Diagnose (vor dem Code)

**A. Wo der Schritt sitzt.** Es gibt einen Producer, `melt.mjs`; der Wetterteil ist ein Abschnitt darin. Nur dort liegen die drei Antworten je Gletscher (`levelOf`, GM-2), der Schneeanteil je Höhe nach der Regel des Laufs (`levelShares`, mit „unten nie mehr als oben“), der Niederschlag und der Faktor je Region (`precip.factorOf`, GM-3b). Der Schritt gehört also in `melt.mjs`, hinter die Wetterzeile des Gletschers. Er braucht den Wetterteil (`--weather=0` ⇒ kein Schneedecken-Dokument, mit Grund).

Der Schmelzlauf selbst taugt nicht als Massenquelle für die drei Höhen: er rechnet je 50-m-Band aus EINER Antwort (Medianhöhe) mit festem Gradienten und der Rampe 0–2 °C; die Wetterzeile rechnet seit GM-2 mit der eigenen Antwort je Höhe. Der Schritt führt deshalb eine eigene Masse an den drei Höhen — mit denselben Formeln wie der Schmelzkern (Zuwachs = Faktor × Niederschlag × Schneeanteil, Schmelze nach dem Temperatur-Strahlungs-Index mit `TF`/`SRF`, Albedo wie dort), aber mit Temperatur und Schneeanteil der Wetterzeile. Ein Prüfer hält die Formel am Schmelzkern fest (gleiche Eingaben ⇒ gleicher Wasserwert).

**B. Der fortgeschriebene Zustand — gemessen am Daten-Repo.** `melt/state.json` steht immer 6 Stunden hinter der Laufstunde und gilt bis 30 Stunden. Alle 152 Schmelzläufe seit 12.10. liegen im Repo (V-GS-2); gelesen sind die Abstände und der Block `state` jedes Laufs, der nicht 6 Stunden nach dem vorigen kam:

| Abstand zum vorigen Lauf | Läufe | Zustand laut Dokument | Folge |
|---|---|---|---|
| 6 h | 100 | übernommen, Alter 0 | richtig |
| 3 h | 20 | **`cold`** | der Zustand liegt 3 h in der Zukunft und wird verworfen: Start bei null |
| 9 / 12 / 15 h | 13 / 10 / 8 | übernommen, Alter 3 / 6 / 9 h | 3–9 Stunden Schneefall und Schmelze fehlen |

Dazu greift der Satelliten-Abgleich in jedem Lauf neu (`nudged` 172–502 Gletscher je Lauf in den letzten 40 Läufen; M-18 der Qualitätsprüfung). Für den Schmelzindex ist das verkraftbar, für eine Schneedecke, die über den Winter wächst, nicht: jeder 3-Stunden-Abstand würfe sie weg (zuletzt am 8.11., fünfmal in Folge am 24./25.10.). Befund V-GM-32. Der neue Zustand darf an der Taktung nicht hängen.

**C. Einschwingen — welcher Antrieb vom 1. Oktober bis heute vorhanden ist.**

| Quelle | Was sie trägt | Zeitraum, gemessen am 23.11. | Für das Einschwingen |
|---|---|---|---|
| Wetterläufe von buscosun Fusion im Daten-Repo (`melt/wx/<lauf>/<region>.json`) | Stundenwerte je Gletscher mit eigenem Antrieb | **erst ab 15.11. 17 UTC** (31 Läufe); drei Antworten je Gletscher erst ab dem Lauf nach dem Push vom 23.11. | reicht nicht zurück; brauchbar als Höhenbezug der Temperatur |
| `buscosun-archiv`, `glacier/v1/<Tag>/melt-<lauf>.json.gz` | Schmelzindex der Leitgletscher je Lauf | ab 11.10. | kein Antrieb (weder Niederschlag noch Temperatur) |
| `buscosun-archiv`, Punktarchiv und Hindcast | Eingaben und Läufe an Stationspunkten | ab 14.09. | keine Gletscherpunkte; ein Nachrechnen von buscosun Fusion an Gletschern bräuchte die Cubes, die nicht archiviert sind |
| `melt/state.json` (Runner) | Schneewasser je Band | laufend | keine Rechnung aus einem Guss: 20 Kaltstarts, Abgleich 250 mm / 0, Schnee aus zwei Faktoren (V-GM-27) |
| GeoSphere Austria `inca-v2-1h-1km` (Q13, CC BY 4.0) | stündlich Niederschlag, Temperatur, Globalstrahlung, 1 km | **1.10.2026 00 UTC bis heute, lückenlos** (1 285 Stunden an drei Probepunkten ohne Lücke) | Österreich, Deutschland und die Schweiz östlich von 8,1° E (Grenze des Datensatzes); 599 von 934 Gletschern mit eigenem Antrieb |
| MeteoSchweiz Tagesgitter (Q14, CC BY 4.0) | RhiresD (Oktober, endgültig), RprelimD (ab 24.9. täglich), TabsD / TminD / TmaxD, relative Sonnenscheindauer | 54 Tage vom 1.10. bis 23.11.: **zwei fehlen an der Quelle** (17.11., 23.11.) | ganze Schweiz; Tageswerte (06–06 UTC), die Eichung von GM-3 hat sie gleichmäßig auf 24 Stunden verteilt |
| `glacier/v1/stn` (Stationen), `glacier/v1/snow` (SNOWGRID) | gemessene Schneehöhe; Analyse je österreichischem Gletscher | ab 21.11. bzw. 14.11. | Prüfgröße, kein Antrieb |

Die Analysen sind genau die Datensätze, gegen die der Faktor der Eichung steht (INCA für Österreich, RhiresD für die Schweiz). Für das Einschwingen gilt die Brücke zu buscosun Fusion also nicht.

**D. Messung M-4: wie gut ein Einschwingen aus der Analyse ist, und was ohne es dasteht.** Sonde `gm3c-spinup-probe.mjs`: Schneekern (96 kg/m³) mit INCA vom 1.10. 00 UTC bis 23.11. 12 UTC, Zuwachs und Schmelze nach den Formeln des Schmelzkerns, Strahlung gemessen (INCA). Die Analyse gilt in der Höhe ihrer 1-km-Zelle, die die Schnittstelle nicht nennt; die Temperatur wird deshalb um den Median der Differenz zu einer Temperatur verschoben, die in der gesuchten Höhe bekannt ist — an einer Station ihre eigene Messung (Stundendateien der letzten 72 h), am Gletscher die Antwort von buscosun Fusion in der Medianhöhe (Wetterläufe seit 15.11.).

*An Stationen* (223 Stationen mit gemessener Schneehöhe im INCA-Gebiet, 23.11. 12 UTC; Verschiebung im Median 0,5 K, Streuung 0,7 K):

| Höhe | Stationen | gemessen | Kaltstart | Kern, Faktor 1, 96 kg/m³ | Fehler im Mittel / Betrag | Kern mit Gletscher-Faktor |
|---|---|---|---|---|---|---|
| alle | 223 | 28,4 cm | 0 cm | 25,4 cm | −3,0 / 11,5 cm (r = 0,70) | 50,2 cm (+20,5) |
| unter 1 500 m | 26 | 2,0 cm | 0 | 6,3 cm | +4,4 / 5,3 cm | |
| 1 500–2 000 m | 55 | 22,6 cm | 0 | 22,8 cm | +0,3 / 8,7 cm | |
| 2 000–2 500 m | 117 | 34,0 cm | 0 | 29,4 cm | −4,6 / 13,1 cm | |
| 2 500–3 000 m | 24 | 43,4 cm | 0 | 31,3 cm | −12,1 / 16,4 cm | |

Mit 68 kg/m³ statt 96: +2,9 / 13,5 cm. Je Netz: Tirol −4,1 / 10,1 cm (118), IMIS −2,4 / 15,0 cm (81), Südtirol 0,0 / 6,8 cm (24).

*An österreichischen Gletschern gegen SNOWGRID* (316 Gletscher, Tag 22.11., Medianhöhe):

| | SNOWGRID | Kern, Faktor 1 | Fehler im Mittel / Betrag | Kern mit Faktor 2,33 |
|---|---|---|---|---|
| Schneehöhe | 50,6 cm | 53,6 cm | +3,0 / 10,5 cm | 113,1 cm |
| Wasserwert | 92,1 mm | 97,7 mm | +5,6 / 22,6 mm | 251,8 mm |

*An 573 Gletschern mit eigenem Antrieb im INCA-Gebiet, Stand 23.11. 12 UTC, mit dem Faktor je Land* (p10 / Median / p90):

| | Zunge | Medianhöhe | Oberkante |
|---|---|---|---|
| Schneehöhe aus dem Einschwingen | 44 / 96 / 133 cm | 46 / 109 / 148 cm | 51 / 120 / 165 cm |
| Wasserwert aus dem Einschwingen | 54 / 171 / 290 mm | 63 / 199 / 349 mm | 66 / 238 / 394 mm |
| davon geschmolzen seit 1.10. | 10 / 45 / 79 mm | 12 / 35 / 80 mm | 8 / 29 / 81 mm |
| Schneewasser im Zustand des Runners (23.11. 17 UTC) | 0,1 / 35 / 296 mm | 42 / 298 / 357 mm | 60 / 305 / 371 mm |
| Zustand des Runners minus Einschwingen | −225 / −74 / +157 mm | −127 / +56 / +220 mm | −147 / +22 / +212 mm |

Befunde:
- **Ohne Einschwingen steht 0 cm, wo im Mittel 28 cm gemessen sind** (34 cm zwischen 2 000 und 2 500 m, 43 cm darüber). Ein Schattenprodukt aus einem Kaltstart wäre für den ganzen Winter um den Frühwinter zu niedrig; die Schattenpaare für GM-4 und GM-8 wären damit wertlos.
- **Antrieb und Kern stimmen ohne Faktor:** −3 cm gegen 223 Stationen, +3 cm gegen SNOWGRID an 316 Gletschern, mittlerer Fehler 10–12 cm. Über 2 500 m liegt der Kern 12 cm zu niedrig (24 Stationen).
- **Der Gletscher-Faktor verdoppelt die Schneedecke gegenüber Station und SNOWGRID** (109 cm in der Medianhöhe gegen 51 cm bei SNOWGRID). Das ist gewollt — der Faktor steht für die Winterbilanz auf dem Gletscher, nicht für ein Messfeld —, aber heute gegen nichts nachmessbar: auf dem Eis gibt es im November keine Messung. Das Urteil der Eichung ist rot (§3c); das Dokument muss das sagen. Befund V-GM-33.
- **Den Zustand des Runners zu übernehmen scheidet aus:** er ist zweigipflig (Abgleich 250 mm oder 0) und weicht an der Zunge im Median um −74 mm, in der Spanne um −225 … +157 mm vom Einschwingen ab.
- Die Temperaturverschiebung am Gletscher streut (p10 −2,2 K, p90 +1,7 K, Stundenstreuung 1,3 K): die Zellhöhe der Analyse liegt bis rund 300 m neben der Medianhöhe.

Nicht gemessen: die Schweiz westlich von 8,1° E (335 Gletscher mit eigenem Antrieb, nur Tagesgitter); ob INCA und RhiresD in der Ostschweiz dieselbe Menge geben (der Schweizer Faktor steht gegen RhiresD); ein Einschwingen mit Tageswerten gegen eines mit Stundenwerten.

Nachtrag nach dem Bau (§3f.5, Messung M-5): die ersten zwei Punkte sind nachgemessen. INCA bringt an Schweizer Gletschern nur 39 % des Niederschlags des Schweizer Gitters — die Schweizer Anteile der Tabellen oben (256 Gletscher, 80 IMIS-Stationen) beruhen auf INCA und gelten nicht; für Österreich bleiben sie.

**E. V-GM-31.** `snowSwitchesOf({ precip: 'gate-c' })` wirft, weil die Dichte ab Werk `board` ist und `board` nur mit `country` gilt (E-GM-13). Der neue Schritt liest beide Schalter. Ein Rückfall, der zwei Wörter braucht, ist im Ernstfall eine Fehlerquelle; da E-GM-13 nur EINE Dichte zu `gate-c` erlaubt, ist „die ungenannte Dichte folgt dem Faktor“ eindeutig. Ein ausdrücklich genanntes `board` neben `gate-c` bleibt abgelehnt.

**F. Was das Produkt tragen muss, damit GM-4 und GM-7 ohne Schemawechsel darauf bauen.**
- GM-7 (Höhenleiter in cm): je Höhe die Schneehöhe jetzt, den Wasserwert jetzt, Neuschnee der letzten 24 / 48 / 72 h (gesetzt, wie ein Schneebrett), je Tag der Vorhersage die Schneehöhe am Tagesende und den Neuschnee des Tages; die Regeln im Kopf (Faktor mit Urteil der Eichung, Dichte mit Spanne, Phase, Schmelze), der Vermerk „berechnet, noch nicht nachgemessen“, seit wann die Rechnung läuft und wie viele Stunden ohne Antrieb sie hat.
- GM-4 (Kopplung): die Höhen in Metern je Zeile (eine Station liegt zwischen zwei Höhen), Schneehöhe und Neuschnee-Fenster wie oben (Tirol misst die Änderung über 24 / 48 / 72 h); die Kopplung selbst kommt als zusätzliches Feld, ohne die vorhandenen zu ändern.
- GM-5 (Spannen, Verteilung je Band): die Zeile trägt die Höhen als Liste, die Spannen kommen als eigene Felder daneben. Das Dokument nennt, dass es Erwartungswerte ohne Spanne sind.

**G. Kosten und Gewicht — Schätzung vor dem Code** (gemessen in §3f.4): reine Rechnung auf den vorhandenen Antworten, rund 1 Mio. Schritte des Kerns je Lauf (957 Gletscher × 3 Höhen × 336 Stunden), also Sekunden und kein weiterer Abruf. Dokument je Lauf rund 100 Zahlen je Gletscher (≈ 0,6 MB roh), Zustand rund 0,5 MB. Im Daten-Repo wird heute kein Schmelz- oder Wetterlauf gelöscht (V-GS-2) — für `snowpack/` braucht es eine Aufbewahrungsregel.

**H. Was beim Bauen mitbricht, wenn man es nicht bedenkt.**
- Der Publisher lässt die Linie `melt` nur unter `melt/` schreiben (`checkPackage` wirft bei jeder anderen Datei, der Job wird rot und veröffentlicht NICHTS, auch keinen Schmelzlauf). Ein Produkt unter `glacier/v1/snowpack/` braucht den Präfix in `GLACIER_LINES.melt`. Das ist ein Skript dieses Repos, kein Workflow; der Runner holt es mit `scripts` von `main`.
- Der Workflow holt `glacier/` ganz in die Lese-Ansicht — der Zustand unter `snowpack/` liegt dem Producer also ohne Workflow-Änderung vor.
- `verify:glacier-snowcal` F1 behauptet „außer dem Schmelzlauf liest kein Producer die Tabelle“; G2 hält die strenge Regel aus V-GM-31 fest. Beides ändert sich mit diesem Paket.

### 3f.2 Entwurf

1. **Schalter** `--snowpack=off|shadow` an `melt.mjs` (oder `GLACIER_SNOWPACK`), Voreinstellung `SNOWPACK_DEFAULT = 'off'` in `scripts/glacier/lib/snowpackcore.mjs`. `off` ist der benannte Rückfall: nichts wird gelesen (kein Zustand, keine Dichte), nichts geschrieben, alle Dateien Byte für Byte wie heute. `shadow` schreibt Dokument und Zustand; keine Seite liest sie. Ein unbekanntes Wort beendet den Lauf, bevor etwas gelesen wird.
2. **Höhen und Antrieb:** Zunge, Medianhöhe, Oberkante — dieselben drei Höhen wie die Wetterzeile, mit ihrer Temperatur und ihrem Schneeanteil (Regel des Laufs, „unten nie mehr als oben“). Niederschlag × Faktor des Laufs: mit `country` das `F` der Region ohne Verlauf, mit `gate-c` 1,289 und +4 % je 100 m wie der Schmelzkern.
3. **Masse und Dicke:** Zuwachs, Albedo und Schmelze nach den Formeln des Schmelzkerns (`TF`, `SRF` aus `melt-calibration.json`, Strahlung des Laufs); Dicke aus dem Schneekern mit dem Konstantensatz des Dichteschalters (`snowCoreSetup`).
4. **Zustand `snowpack/state.json`, unabhängig von der Taktung:** er steht an der LAUFSTUNDE (nicht 6 h dahinter) und trägt je Gletscher die Schneedecke der drei Höhen, die Schneealbedo und den Antrieb der nächsten 18 Stunden (`set`: größter gemessener Abstand 15 h). Der nächste Lauf rechnet von dort mit diesem gespeicherten Antrieb bis zu seiner eigenen Laufstunde und dann mit seinen eigenen Antworten weiter. Jede Stunde des Winters ist damit genau einmal gerechnet, mit der jeweils jüngsten Vorhersage; ein Abstand von 3 h wirft nichts weg, ein längerer als 18 h zählt die fehlenden Stunden (`holes`) und nennt sie im Dokument. Ein Zustand aus der Zukunft beendet den Schritt mit Grund.
5. **Eine Schneedecke aus einer Rechnung (V-GM-27):** der Zustand nennt Faktor-Regel und Dichtequelle, mit denen er gerechnet ist. Ein Lauf mit anderen Schaltern setzt ihn nicht fort, sondern endet mit Grund; ein Wechsel braucht einen neuen Startzustand. Der Zustand nennt, seit wann die Rechnung läuft (`since`), je Gletscher seinen eigenen Beginn, wenn er später dazukam.
6. **Start:** ohne Zustand schreibt `shadow` nichts und nennt den Grund — es sei denn, der Lauf sagt ausdrücklich `--snowpack-start=cold`. Der Startzustand aus dem Einschwingen (E-GM-14) ist dieselbe Datei, gebaut von einem lokalen Werkzeug mit derselben Schrittfunktion.
7. **Fehler im Schritt** (kein Zustand, Zustand aus anderer Rechnung, Wetterteil aus, Vertragsverstoß): das Schneedecken-Dokument wird nicht geschrieben, der vorhandene Zustand bleibt, die Statuszeile nennt den Grund; Schmelz- und Wetterdokument bleiben, wie sie sind (dieselbe Regel wie beim Wetterteil). Nie ein stiller Ersatzwert. Das ist meine Setzung der Vorgabe „ein fehlender Eingang beendet den Lauf mit Grund“: beendet wird der Schritt, nicht die Veröffentlichung des Schmelzlaufs. Fehler der Schalter selbst (unbekanntes Wort, `board` neben `gate-c`) beenden den ganzen Lauf.
8. **Dokument `snowpack/<lauf>.json`** (Vertrag `glacierSnowpackContract.ts`): Kopf mit `origin: 'computed'`, Stand von buscosun Fusion, Regeln mit Herkunft, Zustand (`since`, Quelle, Stunden ohne Antrieb), Vermerk „berechnet, noch nicht nachgemessen“; je Gletscher die drei Höhen in Metern, Schneehöhe (cm) und Wasserwert (mm) zur Laufstunde, Neuschnee der letzten 24 / 48 / 72 h (cm), je Tag der 14 Tage Schneehöhe am Tagesende und Neuschnee des Tages (cm). Nur Gletscher mit eigenem Antrieb (E-GM-16).
9. **Publisher:** die Linie `melt` darf zusätzlich unter `snowpack/` schreiben; Laufdokumente älter als 72 h werden dort entfernt (der Zustand bleibt). Mit `off` entsteht keine Datei unter `snowpack/`, der Publisher tut dasselbe wie heute.
10. **V-GM-31:** die ungenannte Dichte folgt dem Faktor (`gate-c` ⇒ `helfricht`, `country` ⇒ `board`), die Statuszeile nennt beide (E-GM-15).
11. Nicht angefasst: buscosun Fusion, Workflows, die Seite außer der neuen Vertragsdatei, `meltcore.mjs`, `snowcore.mjs`, Daten- und Archiv-Repo.

### 3f.3 Jans Entscheidungen (23.11., nach der Diagnose, vor dem Code)

| Nr. | Frage | Entscheidung (Jan, 23.11.) | Folge im Bau |
|---|---|---|---|
| E-GM-14 | Womit startet der Zustand? Analyse ganz DACH · Analyse nur im INCA-Gebiet · Kaltstart | **Analyse, ganz DACH** | Werkzeug `snowpack-seed.mjs`: INCA für Österreich und Deutschland, Tagesgitter der MeteoSchweiz für die ganze Schweiz (gegen das der Schweizer Faktor geeicht ist). Der Startzustand geht erst auf Jans Wort ins Daten-Repo |
| E-GM-15 | V-GM-31: folgt die ungenannte Dichte dem Niederschlagsschalter? | **Dichte folgt** | `gate-c` allein = `gate-c` + `helfricht`, `country` allein = `country` + `board`; ein ausdrückliches `board` neben `gate-c` bleibt abgelehnt; Dokument, Zustand und Statuszeile nennen beide |
| E-GM-16 | Für welche Gletscher? Nur eigener Antrieb (957) · alle | **Alle Gletscher** — gegen meine Empfehlung | die 1 127 Gletscher mit Nachbar-Antrieb bekommen die drei Antworten des Nachbarn auf ihre eigenen Höhen gelegt (Temperatur und Schneeanteil nach der Regel der Wetterzeile), die Zeile nennt den Nachbarn (`f`) |
| E-GM-17 | Pfad: `snowpack/` mit Änderung am Publisher · unter `melt/snowpack/` ohne | **`snowpack/` + Publisher** | `GLACIER_LINES.melt = ['melt', 'snowpack']`, Aufbewahrung der Laufdokumente 72 h; kein Workflow geändert |

Abweichung vom Entwurf §3f.2 Punkt 8 durch E-GM-16: das Dokument trägt alle Gletscher mit Wetterzeile, `coverage` zählt eigene, Nachbar- und Hochrechnungs-Zeilen.

### 3f.4 Umsetzung

| Datei | Änderung |
|---|---|
| `src/glacier/glacierSnowpackContract.ts` (neu) | Vertrag von Dokument und Zustand: Pfade, Konstanten (14 Tage, Fenster 24 / 48 / 72 h, 18 h gespeicherter Antrieb), Typen, `snowpackProblems`, `snowpackStateProblems`. Kein Import in der Seite, kein Byte im Bundle |
| `scripts/glacier/lib/snowpackcore.mjs` (neu, rein) | Schalter (`SNOWPACK_DEFAULT = 'off'`, `snowpackModeOf`, `snowpackStartOf`); Stundenschritt einer Höhe `stepLevel` (Formeln des Schmelzkerns + `stepPack`); `driveOf` (Antrieb in der Auflösung des Zustands); `normalizeLevel`; `advanceEntry` (vom Zustand zur Laufstunde mit dem gespeicherten Antrieb); `snowpackOfGlacier` (Zeile + Eintrag); `placeLevels` (Antworten eines Nachbarn auf eigenen Höhen); `stateRefusal` |
| `scripts/glacier/melt.mjs` | Schalter `--snowpack` / `GLACIER_SNOWPACK`, `--snowpack-start` / `GLACIER_SNOWPACK_START`, `--density` / `GLACIER_SNOW_DENSITY` (nur mit `shadow` gelesen); Zustand lesen und prüfen; je Gletscher der Schritt hinter der Wetterzeile in eigenem `try`; `writeSnowpack`; Einträge `snowpack` in Zeiger, Statuszeile und Rückgabe — alles nur mit `shadow` |
| `scripts/glacier/lib/weathercore.mjs` | `weatherOfGlacier` gibt zusätzlich die Schneeanteile (`shares`) und den Bezug der drei Antworten (`ctx`) zurück (in kein Dokument geschrieben); `shareAtElevation` exportiert, `tempAtElevation` neu, beide über dieselbe innere Funktion (die Rechnung der eigenen Schneefallgrenze ist dieselbe) |
| `scripts/glacier/lib/snowcal.mjs` | E-GM-15: `SNOW_DENSITY_FOLLOWS`, `snowSwitchesOf` stellt die ungenannte Dichte nach dem Faktor |
| `scripts/glacier/glacier-publish.mjs` | E-GM-17: Präfix `snowpack` für die Linie `melt`, Aufbewahrung der Laufdokumente unter `snowpack/` 72 h |
| `scripts/glacier/snowpack-seed.mjs` (neu) | Einschwing-Werkzeug (lokal): reiner Teil `seedOfForcing`, `hourlyFromDaily`, `shiftOf`; Abrufe INCA, Tagesgitter (über `py/snowcal_grid.py`), Wetterläufe; schreibt `snowpack/state.json` und einen Bericht nach `--out` |
| `scripts/glacier/make-snowpack-seed-fixture.mjs` (neu), `scripts/lib/fixtures/glacier/snowpack-seed.json` (neu, 35 KB) | Fixture aus einem echten Lauf des Werkzeugs: INCA-Antwort für zwei Punkte (720 h), Tageswerte eines Schweizer Gletschers (82 Tage, mit dem an der Quelle fehlenden 17.11.) |
| `scripts/verify-glacier-snowpack.mjs` (neu), `package.json` (eine Zeile) | Prüfer `verify:glacier-snowpack` |
| `scripts/verify-glacier-snowcal.mjs` | F1 (das Einschwing-Werkzeug liest die Tabelle, der Kern der Schneedecke nicht), G2 (E-GM-15) |
| `audit/gletscher-schneemodell/gm3c-*.mjs` | Sonde M-4, Auswertung der Vollläufe, Gegenprobe der Prüfer |

Der Zustand, ein Eintrag je Gletscher: `[Beginn (Stunde seit 1970), Stunden ohne Antrieb, Schneedecke je Höhe (Altschnee und frische Schichten, 0,1 mm / 0,1 cm), Schneealbedo je Höhe, gespeicherter Antrieb (Temperatur 0,1 °C und fester Niederschlag 0,01 mm je Höhe, Strahlung) oder null]`. Der Antrieb wird VOR dem ersten Schritt auf diese Auflösung gerundet, und die Schneedecke der Laufstunde ist genau die gespeicherte — der nächste Lauf geht also Schicht für Schicht den Weg, den dieser vorhergesagt hat.

Die Zeile des Dokuments: `id`, `z` (drei Höhen in m), `f` (`own` oder Kennung des Nachbarn), `lv: lapse` (nur wenn nicht auf drei Antworten gerechnet), `hs` und `swe` zur Laufstunde, `hn` (24 / 48 / 72 h je Höhe), `hsd` und `hnd` (14 Tage je Höhe), `gap` (Stunden ohne Antrieb, falls welche), `from` (eigener Beginn, falls später als der der Kette).

### 3f.5 Messungen nach dem Bau

**M-5: der Schweizer Weg des Einschwingens** (Sonde `gm3c-swiss-probe.mjs` → `gm3c-swiss-probe.json`). Tagesgitter der MeteoSchweiz durch `hourlyFromDaily` und `seedOfForcing`, Faktor 1 und 96 kg/m³, gegen gemessene Schneehöhe an 129 IMIS-Stationen am 23.11. 12 UTC. Je Station 30 Stunden ohne Antrieb (der an der Quelle fehlende 17.11. und sechs Stunden am Ende; für Stationen gibt es keinen Wetterlauf zum Auffüllen).

| | Stationen | gemessen | Modell | Fehler im Mittel / Betrag | r |
|---|---|---|---|---|---|
| alle | 129 | 54,4 cm | 43,9 cm | −10,5 / 18,9 cm | 0,81 |
| westlich von 8,15° E | 49 | 79,4 cm | 69,3 cm | −10,1 / 24,6 cm | 0,74 |
| östlich davon | 80 | 39,2 cm | 28,3 cm | −10,8 / 15,4 cm | 0,73 |
| 1 500–2 000 m | 16 | 53,4 cm | 52,3 cm | −1,1 / 21,6 cm | |
| 2 000–2 500 m | 80 | 49,7 cm | 40,5 cm | −9,2 / 16,0 cm | |
| ab 2 500 m | 31 | 68,9 cm | 49,4 cm | −19,5 / 25,7 cm | |

Dazu die zwei Analysen gegeneinander, wo es beide gibt (268 Schweizer Gletscher mit eigenem Antrieb östlich von 8,15° E, Niederschlag 1.10. bis 21.11., ohne den 17.11.): **INCA 63,5 mm gegen 163,9 mm im Schweizer Gitter** — Verhältnis der Summen 0,39, je Gletscher im Median 0,31 (p10 0,12, p90 0,92). An 35 von 585 Punkten nahe dem Westrand antwortet INCA mit einer Zelle, die mehr als 1,5 km entfernt liegt (bis 15 km).

Befunde:
- **INCA taugt in der Schweiz nicht als Antrieb** (V-GM-34). Die Schweizer Zahlen der Messung M-4 (256 Gletscher, 80 IMIS-Stationen) beruhen auf INCA und gelten nicht; E-GM-14 („Schweizer Gitter für die ganze Schweiz“) ist damit auch durch Messung gedeckt. Warum INCA an den 80 östlichen IMIS-Stationen trotzdem auf −2,8 cm kam, erklärt diese Messung nicht.
- **Der Schweizer Weg liegt ohne Faktor 10 cm (19 %) zu niedrig**, über 2 500 m 20 cm; die Rangfolge der Stationen stimmt (r = 0,81). Ein Teil ist der fehlende 17.11. (V-GM-35).

**Der fehlende Tag.** Am 17.11. hat die Quelle kein Gitter. Der erste Startzustand ließ die 24 Stunden als Stunden ohne Antrieb; in der Medianhöhe der Schweizer Gletscher standen 102 cm. Mit dem Antrieb von buscosun Fusion aus den Wetterläufen dieses Tages (an 1 175 von 1 218 Gletschern vorhanden) stehen dort 117 cm: der Tag trug im Median rund 15 cm. Das Werkzeug nimmt deshalb für jede Stunde, die der Analyse fehlt, den Antrieb des Wetterlaufs dieser Stunde, wo das Daten-Repo einen hält, und der Zustand nennt es (`seed.filled`); wo keiner da ist, bleibt die Stunde gezählt.

**Startzustand, lokal gebaut für den 21.11. 17 UTC** (`snowpack-seed.mjs`, Ansicht und Wetterläufe vom 21.11., 1 241 Stunden ab 1.10.; Bericht `C:\dev\buscosun-glacier-cache\gm3c-snowpack\seed-1121-report.json`): 2 019 von 2 094 Gletschern (797 in Österreich, 1 218 in der Schweiz, 4 in Deutschland); 10 ohne geordnete Höhen (dieselben, die die Wetterzeile überspringt), 65 ohne Höhenbezug der Temperatur — Gletscher, die erst mit dem Katalog vom 21.11. dazukamen und am Stichtag weniger als 24 Stunden Wetterzeilen hatten (V-GM-40). Verschiebung der Analysentemperatur p10 / Median / p90: −2,1 / −0,2 / +1,4 K. Größe 954 KB.

| Schneehöhe im Startzustand (p10 / Median / p90) | Zunge | Medianhöhe | Oberkante |
|---|---|---|---|
| Österreich (797) | 67 / 98 / 137 cm | 82 / 110 / 148 cm | 89 / 121 / 160 cm |
| Schweiz (1 218) | 43 / 100 / 171 cm | 53 / 117 / 185 cm | 61 / 129 / 196 cm |
| Deutschland (4) | 57 / 70 / 84 cm | 72 / 95 / 115 cm | 92 / 115 / 131 cm |

**Der Weg des Einschaltens, einmal durchlaufen (23.11. 17:25 UTC, nichts eingespielt):** `snowpack-seed.mjs --fetch-wx=1` ohne `--end` — Ansicht vom 21.11. (derselbe Katalog `20261120-1` wie im Daten-Repo), die Wetterläufe ab 21.11. 17 UTC aus dem Daten-Repo gelesen (7 Läufe, 189 Dateien, 41 MB). Ergebnis: Startzustand vom 1.10. bis 23.11. 16 UTC (1 288 Stunden) für **alle 2 084 Gletscher** mit geordneten Höhen (kein Gletscher ohne Höhenbezug mehr), 972 KB; in der Schweiz 34 Stunden aus den Wetterläufen übernommen (der 17.11. und die zehn Stunden nach dem Ende des Gitters um 06 UTC), keine Stunde ohne Antrieb; der Ausgabeordner trägt nur `snowpack/state.json`, der Bericht liegt daneben (`seed-live-report.json`). Schneehöhe in der Medianhöhe im Median: Österreich 115 cm, Schweiz 142 cm, Deutschland 99 cm.

**Lokaler Volllauf** (Aufbau wie §3b.4: Cube und Ansicht vom 21.11., `--now=2026-11-21T17:50:00Z --always`, Lauf `2026112117`, 2 094 Gletscher; Ausgaben unter `C:\dev\buscosun-glacier-cache\gm3c-snowpack\`, Auswertung `gm3c-analyse.mjs` → `gm3c-analyse.json`). Alle Läufe mit dem Endstand des Codes.

| Lauf | verglichen mit | bestehende Dateien | Schneedecke |
|---|---|---|---|
| ohne Schalter (`out-off`) | Referenzlauf vom 23.11. mit dem Code vor diesem Paket (`gm3c\out-default`) | **338 von 338 Byte für Byte gleich**, Zeiger gleich, Statuszeile gleich bis auf die Laufzeit | kein Ordner `snowpack/`, kein Eintrag |
| `--snowpack=shadow` vom Startzustand (`out-shadow`) | ohne Schalter | 338 von 338 gleich; Zeiger und Statuszeile gleich bis auf die eigenen Einträge | 2 neue Dateien; 2 084 Zeilen (957 eigene Antworten, 1 127 Nachbar, 0 Hochrechnung), 10 übersprungen (`elevations`); Zustand „seed“ seit 1.10., 65 Gletscher beginnen bei null, 43 mit 24 Stunden ohne Antrieb |
| `--snowpack=shadow --snowpack-start=cold` (`out-cold`) | ohne Schalter | 338 von 338 gleich | 2 neue Dateien; alle 2 084 Zeilen zur Laufstunde bei 0 |
| Folgelauf 6 h später mit dem Zustand des Schattenlaufs (`out-next`, `--now=…T23:50`) | Schattenlauf | (andere Laufstunde: 30 Dateien verschieden, 28 nur dort — die Negativkontrolle des Vergleichs) | Zustand „carried“, Alter 6 h, alle 6 Stunden aus dem gespeicherten Antrieb, 0 Gletscher neu begonnen, dieselben 43 Lücken; Schneehöhe in der Medianhöhe −0,8 cm im Median gegen 6 h zuvor (Setzung; p10 −1,4, p90 −0,3) |

Was im Dokument steht (Schattenlauf vom Startzustand, p10 / Median / p90 über 2 084 Gletscher):

| | Zunge | Medianhöhe | Oberkante |
|---|---|---|---|
| Schneehöhe zur Laufstunde | 44 / 97 / 157 cm | 56 / 112 / 169 cm | 65 / 123 / 182 cm |
| Wasserwert zur Laufstunde | 60 / 183 / 342 mm | 85 / 222 / 381 mm | 106 / 258 / 430 mm |
| Neuschnee 24 h · 72 h | | 1,7 / 11 / 24 cm · 14 / 34 / 67 cm | |
| Schneehöhe am Ende von Tag 14 | | 78 / 124 / 180 cm | |
| dasselbe aus dem Kaltstart | | 35 / 49 / 65 cm | |
| Summe des Neuschnees über 14 Tage | | 51 / 77 / 114 cm | |

Der Kaltstart zeigt zur Laufstunde überall 0 cm und nach 14 Tagen 49 statt 124 cm in der Medianhöhe: was dem Schattenprodukt ohne Einschwingen den ganzen Winter fehlte.

Kosten und Gewicht (gemessen, statt der Schätzung in §3f.1 G):

| | Wert |
|---|---|
| Rechenzeit des Schritts | 9 s je Lauf (2 084 Gletscher); ganzer Lauf 203 s mit, 194 s ohne (drei Läufe nacheinander auf derselben Maschine, keine getrennte Zeitmessung) |
| Abrufe von buscosun Fusion | keine zusätzlichen |
| Dokument `snowpack/<lauf>.json` | 1,25 MB roh · 0,31 MB gzip · 0,23 MB brotli |
| Zustand `snowpack/state.json` | 1,81–1,85 MB roh · 0,33–0,34 MB gzip (frische Schichten von 72 h und 18 h Antrieb je Gletscher und Höhe) |
| im Baum des Daten-Repos | Laufdokumente der letzten 72 h (rund 12 × 1,25 MB) und ein Zustand; je Lauf kommen in der Historie rund 0,65 MB gepackt dazu |

Das ist doppelt so viel wie geschätzt, weil nach E-GM-16 alle 2 084 Gletscher eine Zeile tragen und im Zustand fast jede Höhe zwölf frische Schichten hält (V-GM-37).

Nicht gemessen: kein Lauf auf dem Runner (Laufzeit, Speicher, Publisher mit echtem Push); eine Wetterlage (kalt); der Startzustand für den Tag des Einschaltens ist nicht gebaut; die Güte auf dem Eis (dort misst niemand, V-GM-33); der Publisher ist mit dem neuen Präfix nur über seine Prüfer gelaufen, nicht gegen ein Repo mit einem Ordner `snowpack/`.

### 3f.6 Gate (23.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snowpack` (neu) | **31/31** |
| A1–A5 Kern | Masse einer Höhe = `simulate` des Schmelzkerns auf einem Band (echte Temperatur und echter Niederschlag, nach 3, 5, 8 und 14 Tagen, unter und über der Gleichgewichtslinie, dazu eine Stunde von Hand); Dicke ohne Masse; Antrieb in der Auflösung des Zustands, Temperaturlücke bricht ab; die Schneedecke, wie der Zustand sie hält; Schalter und Voreinstellung `off` |
| B1–B5 Zustand | ein Lauf 0 / 3 / 6 / 9 / 15 / 18 h später steht Schicht für Schicht dort, wo der frühere die Stunde vorhergesagt hat; jenseits von 18 h wird gezählt; sechs Läufe im 3-Stunden-Takt = ein Lauf über 18 h (bis auf die Rundung); ein Zustand aus anderer Rechnung, ein fehlender, einer aus der Zukunft wird nicht fortgesetzt |
| C1–C6 Zeile und Vertrag | echte Antworten an drei Höhen (Fixture `weather-levels.json`), Handrechnung an der Oberkante; Neuschnee-Fenster aus den Schichten; 33 Verletzungen des Dokument-Vertrags und 17 des Zustands-Vertrags, jede gemeldet (darunter Herkunft „measured“, fehlender Vermerk, „board“ ohne „country“); Antworten eines Nachbarn auf eigenen Höhen, auch unter `psnow` |
| D1–D9 Ende zu Ende (`melt.mjs`, echte Antworten als Fusion-Stub) | aus = nichts gelesen und nichts geschrieben (auch ein unlesbarer Zustand und unsinnige Wörter stören nicht); `shadow` lässt alle bestehenden Dateien Byte für Byte; ohne Zustand kein Dokument, mit Grund; das Dokument; Folgelauf 18 h und 30 h später, Lauf vor der Stunde des Zustands; eine Schneedecke aus einer Rechnung und E-GM-15, `gate-c` von Hand; der Wetterteil als Quelle; fehlende, neue und entfallene Gletscher |
| E1 Publisher | Linie `melt` darf nach `snowpack/`, sonst nirgends hin; Aufbewahrung nur dort, der Zustand bleibt |
| F1–F4 Einschwingen | reiner Teil des Werkzeugs gegen die Handrechnung, mit dem Antrieb in der Form der Quellen (Fixture aus einem echten Lauf); Tagesgitter auf Stunden; Verschiebung nur ab 24 gemeinsamen Stunden; ein Lauf setzt einen Startzustand fort |
| G1 | Kern, Werkzeug und Vertrag importieren nichts aus buscosun Fusion |
| Gegenprobe der Prüfer | `gm3c-mutations.mjs`: 55 Mutationen an Kern, Schmelzlauf, Wetterkern, Schaltern, Publisher, Werkzeug und Vertrag. **Erster Durchgang: 52 von 55** — unbemerkt blieben „Albedo vor dem Neuschnee der Stunde entschieden“ und „Schneeanteil auf fremder Höhe ohne den Versatz der Antworten“, eine Mutation fand ihr Muster nicht mehr; fünf fielen nur als Abbruch auf. Daraufhin: eine Stunde von Hand in A1, die Probe unter `psnow` in C6, ein Abbruch in einem Block wird zu einer benannten Prüfung. **Zweiter Durchgang: 55 von 55, keine nur als Abbruch**, Prüfer danach grün (`gm3c-mutations.json` ist dieser Durchgang) |
| `verify:glacier-snowcal` | **37/37** — F1 neu gefasst (der Kern der Schneedecke liest die Tabelle nicht, das Einschwing-Werkzeug schon), G2 auf E-GM-15 umgestellt |
| übrige Prüfer | `glacier-melt` 49/49, `glacier-weather` 41/41, `glacier-snowcore` 24/24, `glacier-contract` 64/64, `glacier-publish` 34/34, `glacier-snow-view` 19/19, `glacier-dossier-heute` 21/21, `glacier-stations` 77/77 — alle nach dem letzten Durchgang der Gegenprobe noch einmal gelaufen |
| lokaler Volllauf | §3f.5: aus = 338 von 338 Dateien Byte für Byte der Referenzlauf; `shadow` lässt dieselben 338 Dateien gleich und fügt zwei hinzu; Negativkontrolle: der Folgelauf weicht in 30 Dateien ab |
| geschützte Pfade | `git diff origin/main` für `src/pointForecast`, `src/point`, `scripts/point`, `scripts/punktarchiv`: leer; `meltcore.mjs` und `snowcore.mjs` unverändert |
| `npm run typecheck` | grün |
| `npm run build` | grün (281/281) |
| `npm run budget` | grün: eagerJs 116,2 / 117, largestChunk 278,4 / 302, totalJs 2 118,1 / 2 121 KB — derselbe Wert wie vor dem Paket, der neue Vertrag liegt nicht im Bundle |

Nicht geprüft: kein Lauf auf dem Runner; der Publisher nicht gegen ein echtes Repo mit `snowpack/`; kein Browser (keine Anzeige liest das Produkt); eine Wetterlage, kein Sommerlauf; die älteren Gegenproben (`gm2-`, `gm3-`, `gm3b-mutations.mjs`) sind gegen die geänderten Prüfer nicht wiederholt; `verify:glacier-ui` (bricht an HEAD ab, V-GH-6). Seit den Vollläufen ist kein Producer-Code mehr geändert worden; am Einschwing-Werkzeug danach nur der Ort des Berichts.

Die fünf Fragen: (1) Funktionserhalt — Volllauf ohne Schalter 338 von 338 Dateien gleich, D1, D2, die 49 Prüfungen des Schmelzlaufs und die 41 des Wetterteils; (2) Desktop pixelgleich — kein Byte im Bundle geändert (Budget gleich), nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

**Gate GM-3c: gebaut und geprüft, Schalter aus. Ohne den Schalter schreibt der Producer dieselben Bytes wie vorher.** Offen bei Jan: Commit, Push und das Einschalten (E-GM-18). — Nachtrag 23.11. abends: committet und gepusht (`c4b45c9e`), eingeschaltet (§3f.8).

### 3f.7 Entscheidungen und Befunde aus GM-3c

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-14 … E-GM-17 | Einschwingen aus Analysen für ganz DACH · die ungenannte Dichte folgt dem Faktor · alle Gletscher · `snowpack/` mit Publisher | **entschieden: Jan 23.11.** (§3f.3) |
| E-GM-18 | **Einschalten des Schattenprodukts — wann und wie?** Es braucht drei Schritte in dieser Reihenfolge: Push von `buscosun-web`, Startzustand für den Tag bauen und nach `glacier/v1/snowpack/state.json` einspielen, Schalter umlegen. Zwei Wege für den Schalter: `GLACIER_SNOWPACK: shadow` im Workflow `glacier-melt` des Daten-Repos (ohne Code, einzeln zurücknehmbar) oder `SNOWPACK_DEFAULT = 'shadow'` (wirkt mit dem Push). Empfehlung: der Workflow-Weg — der Startzustand muss ohnehin vor dem ersten Lauf liegen, und ein Schalter im Workflow lässt sich ohne Push zurücknehmen | **entschieden und umgesetzt: Jan 23.11. abends** („ja starte das“, „ich gebe dir die Genehmigung im Daten-Repo“) — Workflow-Weg, §3f.8 |
| V-GM-8 | Vertrag und Pfad der Schneedecke | **erledigt** (`glacierSnowpackContract.ts`, `glacier/v1/snowpack/`) |
| V-GM-27 | Eine Schneedecke aus einer Rechnung | **für das Schattenprodukt erledigt:** eigener Zustand, eingeschwungen ab 1.10. mit dem Faktor des Laufs; der Zustand nennt seine Regeln, ein Lauf mit anderen setzt ihn nicht fort. Der Zustand des Schmelzlaufs (`melt/state.json`) mischt weiter; die Schneedecke liest ihn nicht |
| V-GM-29 | Die Anzeige zeigt Neuschnee ohne Faktor | bleibt bis GM-7; das Schattenprodukt rechnet mit dem Wasser der Wetterzeile × Faktor (von Hand geprüft, D5) |
| V-GM-31 | Rückfall mit zwei Wörtern | **erledigt** (E-GM-15). Neu zu wissen: ein Rückfall auf `gate-c` passt nicht zu einem Zustand aus `country` — der Schritt schreibt dann nichts und nennt es; die Schneedecke läuft erst nach einem neuen Startzustand (`--precip=gate-c`) weiter |
| V-GM-32 | **Der Zustand des Schmelzlaufs wird bei jedem Lauf verworfen, der 3 h nach dem vorigen kommt** (20 von 151 Übergängen seit 12.10.), und verliert 3–9 Stunden bei 31 weiteren (§3f.1 B). Mehrwert: der Schmelzindex springt nicht mehr auf „kein Schnee“ zurück, wenn ein Cube-Lauf nachgeliefert wird. Skizze: den Schmelzzustand nach demselben Muster an die Laufstunde legen und den Antrieb der nächsten Stunden mitspeichern. Das ändert Schmelzdokumente | offen (Jan) |
| V-GM-33 | Der Gletscher-Faktor verdoppelt die Schneedecke gegenüber Stationen und SNOWGRID (109 gegen 51 cm), und auf dem Eis misst im Winter niemand: die Zahl des Schattenprodukts ist bis zu den Frühjahrssondierungen nicht prüfbar. Mehrwert: eine Aussage, wie weit man der Zahl trauen darf, bevor sie angezeigt wird. Skizze: GM-4 koppelt an die Änderung der Schneehöhe der Stationen; die Sentinel-2-Schneegrenze als ja/nein-Probe an der Zunge; Abnahme in GM-8 | GM-4, GM-8 |
| V-GM-34 | INCA bringt an Schweizer Gletschern 39 % des Niederschlags des Schweizer Gitters und antwortet am Westrand mit entfernten Zellen. Mehrwert: kein zu trockener Startzustand in der Schweiz. Umgesetzt: das Werkzeug nimmt INCA nur für Österreich und Deutschland. Für die vier deutschen Gletscher ist INCA ungeprüft (Skizze: gegen RADOLAN oder HYRAS vergleichen) | umgesetzt; Deutschland offen |
| V-GM-35 | Der Schweizer Weg (Tagesgitter) liegt an 129 Stationen 10 cm zu niedrig, über 2 500 m 20 cm. Mehrwert: ein Startzustand ohne Schlagseite. Skizze: die Tagessumme nach dem Stundenverlauf von buscosun Fusion verteilen statt gleichmäßig (wo Wetterläufe vorliegen); Kopplung an die Stationen in GM-4 | GM-4 |
| V-GM-36 | Zwischen dem Ende des Startzustands und dem ersten Lauf liegen Stunden ohne Antrieb (INCA endet eine Stunde vor jetzt, das Schweizer Gitter bis zu 33 Stunden; aufgefüllt wird nur, wo ein Wetterlauf die Stunde trägt). Sie stehen an jeder Zeile (`gap`). Mehrwert: keine Lücke an der Naht. Skizze: den Startzustand unmittelbar vor dem Einschalten bauen (§119); später kann der Producer die Naht selbst aus den Wetterläufen schließen | §119 |
| V-GM-37 | Gewicht: Dokument 1,25 MB und Zustand 1,8 MB roh je Lauf (zusammen rund 0,65 MB gepackt), der Zustand wird bei jedem Lauf neu geschrieben. Mehrwert: weniger Wachstum der Historie im Daten-Repo. Skizze: Schichtzeiten relativ zur Laufstunde speichern (rund −0,3 MB), Tageswerte der Vorhersage auf ganze Zentimeter (rund −0,2 MB), frische Schichten ohne nennenswerte Masse zusammenlegen | offen |
| V-GM-38 | Mit 96 kg/m³ kommt Neuschnee dichter an als die Übergabedichte des Kerns (81 kg/m³): das Neuschnee-Setzungsgesetz (rund 1 % je Stunde) greift nie, frischer Schnee setzt sich nur nach Δsnow. Die Eichung der Dichte (Regel D2) ist mit genau diesem Verhalten gerechnet, die Fenster 48 h und 72 h sind es nicht. Mehrwert: verlässliche „Neuschnee 72 h“. Skizze: in GM-4 gegen die gemessene Änderung der Schneehöhe über 24 / 48 / 72 h (Tirol) prüfen | GM-4 |
| V-GM-39 | Die CI von `buscosun-web` ruft `verify:glacier-snowpack`, `-snowcal` und `-snowcore` nicht auf (nur `verify:glacier-melt` und andere). Mehrwert: ein Bruch fällt beim Push auf. Skizze: drei Zeilen in `.github/workflows/ci.yml` — eine Workflow-Änderung, Jans Wort | **umgesetzt 23.11. abends (Jan: „mache V-GM-39“), uncommitted:** drei Zeilen im Schritt „Gletscher (Vertrag, Baum, Publisher)“. Beleg: frischer Auscheck von `6949fa17` mit LF-Zeilenenden (nur verfolgte Dateien), über `ci-run.mjs`: `-snowcore` 24/24 (1 s), `-snowcal` 37/37 (4 s), `-snowpack` 31/31 (6 s). **Nachtrag:** gepusht mit `5fb86b4f`, der CI-Lauf dazu (Start 23.11. 19:53 UTC) ist grün — die drei Prüfer laufen auf dem Linux-Runner |
| V-GM-43 | **Der CI-Lauf zu `c4b45c9e` war rot, nicht wegen des Schneemodells:** `verify:pv-cube`, Prüfung (12) „ohne Frist wartet der Leser (≥ 600 ms)“ meldete „600 ms“ und fiel durch. Ursache gemessen: ein `setTimeout(600)` endet gelegentlich, bevor auf `performance.now()` 600 ms vergangen sind (lokal 9 von 200 Timern, frühester 599,08 ms) — die Prüfung verglich hart mit 600. Dieselbe Form steht in Prüfung (14). Behoben in `scripts/verify-pv-cube.mjs`: beide vergleichen gegen 600 ms minus 5 ms (`TIMER_SLACK_MS`); ein Leser, der nicht wartet, kommt nach rund 150 ms zurück und fällt weiter durch. `verify:pv-cube` danach 453/453 (613 ms, 666 ms). Nachtrag 23.11. abends: dieselbe Form auch in (14) „die Nachlieferung kommt EINMAL“ (`P.update.ms >= 600`) — ebenfalls auf `600 − TIMER_SLACK_MS`. Mit `CI=1` dreimal grün (453/453 bzw. 452/453 mit einer nicht gewerteten Kostenmessung); ohne `CI` fielen lokal unter Last (8)/(9) „Kosten PAP 3/4 ≤ 5 ms“ — bekannte Zeitprüfungen, auf dem Runner nicht gewertet. buscosun Fusion selbst ist nicht angefasst, nur sein Prüfer | **behoben, auf `origin/main` mit `5fb86b4f`**; Gegenprobe gefahren (Kopie des Prüfers ohne die 600-ms-Verzögerung): (12) fällt mit 50 ms, die drei Prüfungen in (14) fallen (375 ms) — die Luft lässt einen Leser, der nicht wartet, nicht durch. Die frühe Auslösung selbst ließ sich am Abend in 140 Timern nicht nachstellen (frühester 600,12 ms); der CI-Wert „600 ms“ (gerundet) und die Messung vom Nachmittag stehen |
| V-GM-44 | Derselbe CI-Lauf warnt: `actions/checkout@v4` und `actions/setup-node@v4` zielen auf Node 20 und werden von GitHub auf Node 24 gezwungen. Mehrwert: kein plötzlicher Bruch der CI, wenn GitHub die Übergangsregel beendet. Skizze: beide Aktionen in `ci.yml` (und in den Workflow-Vorlagen des Daten-Repos) auf die nächste Hauptversion heben — Workflow-Änderung, Jans Wort | offen (Jan) |
| V-GM-40 | Ein Gletscher ohne mindestens 24 gemeinsame Stunden mit den Wetterläufen bekommt keinen Eintrag im Startzustand (keine geratene Verschiebung); er beginnt im ersten Lauf bei null und nennt seinen Beginn (`from`). Am Stichtag 21.11. waren das 65 neue Gletscher des Katalogs vom selben Tag. Mehrwert: kein falscher Nullwert nach einem Katalog-Build. Skizze: nach jedem Katalog-Build den Startzustand für die neuen Gletscher nachbauen (`--only`), oder der Producer schwingt fehlende Einträge selbst nach | offen |
| V-GM-41 | Die Vorhersage rechnet mit Erwartungswerten: in der zweiten Woche fällt an jedem Tag etwas „Neuschnee“ (Summe über 14 Tage im Median 77 cm), ohne Spanne. Mehrwert: die Anzeige behauptet keine einzelnen Schneefälle für Tag 8–14. Skizze: Szenarien und Spannen (GM-5) vor der Anzeige (GM-7); das Dokument sagt heute `spread: none` | GM-5, GM-7 |
| V-GM-42 | Die Schmelze der Schneedecke nutzt `TF`/`SRF` des Schmelzlaufs (V-GM-26: an der alten, dünneren Schneedecke geeicht) und die Strahlung aus Bewölkung statt Messung. Mehrwert: richtige Ausaperung an der Zunge im Frühjahr. Skizze: mit V-GM-26 zusammen vor Mai 2027 | offen |

### 3f.8 Einschalten des Schattenprodukts (E-GM-18, Jan 23.11. abends)

Jans Wort: „ja starte das“ (Startzustand bauen und einspielen), danach „ich gebe dir die Genehmigung im Daten-Repo“. Der Schalter liegt im Workflow, nicht im Code: `SNOWPACK_DEFAULT` bleibt `off`, ein lokaler Lauf ohne Schalter schreibt weiter die Bytes wie vorher.

| Schritt | Was | Beleg |
|---|---|---|
| Commit und Push von `buscosun-web` (Jan) | GM-3c auf `origin/main` | `c4b45c9e`, Arbeitsbaum danach sauber |
| Startzustand gebaut | `snowpack-seed.mjs`, 23.11. 18:06 UTC, 153 s; Katalog `20261120-1` (derselbe wie im Zeiger des Daten-Repos) | Stand **23.11. 17:00 UTC**, 1 289 Stunden ab 1.10., 2 084 Gletscher (10 ohne Höhen übersprungen), Regeln `country`/`board`, 968 551 Bytes; Stunden ohne Antrieb 0 in allen drei Ländern; Schweiz 35 Stunden aus den Wetterläufen von buscosun Fusion gefüllt (Tagesgitter für 17.11. und 23.11. fehlt); Verschiebung gegen buscosun Fusion aus 32 Wetterläufen, p10 / Median / p90 −2,2 / −0,3 / +1,4 K. Bericht `C:\dev\buscosun-glacier-cache\gm3c-snowpack\seed-2311-report.json` |
| Startzustand geprüft | Vertrag und Annahmeregel | `snowpackStateProblems` 0 Befunde; `stateRefusal` für einen Lauf um 20 UTC mit `country`/`board`: keine Ablehnung |
| Startzustand eingespielt | Publisher `--line=melt` aus dem Ordner mit nur dieser Datei, ohne `--force` | Daten-Repo `4ae73e46`, 23.11. 19:23 UTC, eine Datei `glacier/v1/snowpack/state.json` (968 551 Bytes), Versuch 1. Damit ist der Publisher einmal gegen das echte Repo mit `snowpack/` gelaufen (stand in §3f.6 unter „nicht geprüft“) |
| Schalter | `GLACIER_SNOWPACK: shadow` unter `jobs.melt.env` in `.github/workflows/glacier-melt.yml` (drei Zeilen: zwei Kommentare, ein Wert) | Daten-Repo `3a119833`, 23.11. 19:27 UTC; nur diese Datei geändert; der erste Versuch wurde abgelehnt, weil `main` inzwischen weitergelaufen war, der zweite setzte auf dem neuen Stand auf (kein `--force`). Auf `main` nachgelesen: Zeile 42 trägt den Wert, `snowpack/state.json` liegt daneben |
| Vorlage nachgezogen | `scripts/glacier/gen-workflows.py` + erzeugte `workflow-glacier-melt.yml` (uncommitted) | Vorlage und Live-Datei unterscheiden sich nur im Zeilenende; `verify:glacier-publish` 34/34 |

Mindestgegenprobe vor dem Einspielen, am Code gelesen: der Publisher legt Dateien nur dazu und löscht unter `snowpack/` allein Laufdokumente mit Zeitstempel im Namen, die älter als 72 h sind — ein Lauf mit Schalter aus hätte den Zustand liegen lassen. Der Workflow kopiert `glacier/v1` von `main` in die Lesesicht, der Producer findet den Zustand dort unter `snowpack/state.json`.

**Erster Lauf mit Schalter: steht aus.** Erster Blick 23.11. 20:38 UTC: der Job des Crons 20:20 UTC lief mit dem neuen Workflow (Start 20:23 UTC, 51 s, grün) und hat wie erwartet nicht gerechnet — kein neuer Cube-Lauf t2/t3 (t2 weiter `2026112312`), `lines.melt.at` unverändert 17:23 UTC, unter `snowpack/` nur der Startzustand. Belegt ist damit nur, dass der Job mit der neuen Zeile grün endet. Der Schmelzlauf rechnet nur bei einem neuen Cube-Lauf der Stufen t2/t3 und höchstens viermal am Tag; der Cron um 20:20 UTC kann leer ausgehen, der nächste folgt um 23:20 UTC. Die Stunden zwischen 17:00 UTC und der Laufstunde zählt der Lauf als Stunden ohne Antrieb (`state.gaps`, V-GM-36). Zu lesen in `glacier/v1/status.json`, Zeile `lines.snowpack`: `mode: shadow`, `glaciers` um 2 084, `state.source: seed`, `seconds`, `bytes`, `stateBytes` — oder `error` mit Grund.

Zurück: die Zeile `GLACIER_SNOWPACK` im Workflow entfernen oder auf `off` setzen. Der Lauf schreibt dann nichts mehr unter `snowpack/`, die Laufdokumente verschwinden nach 72 h, der Zustand bleibt liegen und wird nicht gelesen.

Nicht geprüft: der Lauf auf dem Runner selbst (steht aus); ob der Zustand nach mehreren Läufen in Folge richtig fortgeschrieben wird (lokal einmal mit +6 h belegt, §3f.5).

## 3g. GM-3d: Zustand des Schmelzlaufs an der Laufstunde (V-GM-32; 23.11. abends)

Auftrag (Jan, 23.11. abends, Auswahl „V-GM-32 bauen“): der Zustand des Schmelzlaufs bekommt das Muster der Schneedecke. Diagnose zuerst, Bau hinter einem Schalter, der aus bleibt. buscosun Fusion wird nur gelesen. Kein Push, kein Workflow, kein Eingriff im Daten-Repo.

Werkzeug und Beleg der Diagnose: `audit/gletscher-schneemodell/gm32-coldstart-probe.mjs` mit `gm32-coldstart-probe.json` (liest Schmelzläufe aus dem Klon des Daten-Repos, Stand `main` vom 23.11. abends, 153 Läufe 12.10. … 23.11.).

### 3g.1 Diagnose (vor dem Code)

**A. Der Mechanismus, am Code gelesen (`scripts/glacier/melt.mjs`).** Jeder Lauf rechnet den Schneezustand je Band 6 Stunden voraus (`MELT_STATE_ADVANCE_H`, `runGlacier`: `adv`) und schreibt ihn mit der Zeit „Laufstunde + 6 h“ nach `melt/state.json`. Der nächste Lauf nimmt ihn nur, wenn er zwischen 0 und 30 Stunden ALT ist (`stateAgeH >= 0 && <= MELT_STATE_MAX_AGE_H`):

| Abstand zum vorigen Lauf | Alter des Zustands | was der Lauf tut | Läufe seit 12.10. |
|---|---|---|---|
| 6 h | 0 | übernimmt, richtig | 101 |
| 3 h | −3 (liegt in der Zukunft) | **verwirft, beginnt bei null** (`cold`) | 20 |
| 9 / 12 / 15 h | 3 / 6 / 9 | übernimmt, die Stunden dazwischen fehlen (kein Schneefall, keine Schmelze) | 13 / 10 / 8 |

Die 3-Stunden-Abstände kommen in Serien, fast immer als Paar 02 → 05 UTC (zuletzt 1., 2., 6., 7. und 8.11.).

**B. Was ein Kaltstart am veröffentlichten Dokument ändert — gemessen.** Die Kachel „Fläche ohne Schneedecke“ der Seite (`ice`, Anteil der Fläche unter der Medianhöhe ohne Schnee im Zustand; `GlacierHeuteBoard.tsx`, `GlacierSheetTabs.tsx`) liest genau diesen Zustand. Verglichen sind der Lauf davor, der Kaltstart und der Lauf danach an den 2 199 gemeinsamen Gletschern:

| Kaltstart | Mittel der Kachel davor → Kaltstart → danach | Gletscher mit +20 Punkten |
|---|---|---|
| 2026110105 | 35,5 → 35,5 → 33,3 % | 0 (der Lauf davor stand selbst kurz nach einem Kaltstart) |
| 2026110205 | 30,9 → 35,8 → 35,8 % | 200 |
| 2026110605 | 33,9 → 36,1 → 36,1 % | 93 |
| 2026110705 | **22,4 → 36,2 → 36,2 %** | **593** |
| 2026110805 | 34,4 → 36,2 → 36,2 % | 72 |

Ein Kaltstart setzt die Kachel auf rund 36 % im Mittel — das ist der Wert „kein Schnee im Modell, nur der Satelliten-Abgleich“. Seit dem letzten Kaltstart am 8.11. hat der Zustand 15 Tage getragen: am 15.11. stand die Kachel im Mittel bei 3,6 % (1 723 von 2 199 Gletschern bei 0 %), heute (Lauf `2026112317`) bei **2,3 %** (1 785 von 2 094 bei 0 %). **Der nächste 3-Stunden-Abstand würfe sie mitten im Winter von 2 % auf rund 36 % zurück**, mit dem Vermerk „Modellzustand neu begonnen“. Meine Einschätzung vom selben Abend („im Winter wirkt der Fehler kaum“) war eine Annahme und ist damit widerlegt: der Schmelzindex selbst ist im Winter klein, die Kachel springt trotzdem.

Die Summe der 7-Tage-Indizes ändert sich an denselben Übergängen um −4 … +17 % (z. B. 6 547 → 7 659 am 7.11.), das ist aber von der neuen Vorhersage des Laufs nicht zu trennen.

**C. Was es braucht.** Dasselbe Muster wie bei der Schneedecke (§3f.2): der Zustand steht an der LAUFSTUNDE (das, womit der Lauf selbst begonnen hat), und die Datei trägt den Antrieb der nächsten Stunden mit. Der nächste Lauf rechnet daraus bis zu seiner eigenen Stunde — gleich, ob er 3, 6 oder 15 Stunden später kommt. Erst Stunden jenseits des mitgespeicherten Antriebs fehlen, und die nennt das Dokument (`ageH`, wie heute).

Verworfene Alternative: Schnappschüsse zu +3, +6, … +18 h in der Datei. Das wäre bei einem 6-Stunden-Abstand Byte für Byte wie heute, kostet aber die sechsfache Datei (1,3 statt 0,2 MB je Lauf) und passt nur auf Abstände in 3-Stunden-Schritten.

### 3g.2 Entwurf

- **Schalter** `--melt-state=ahead|run-hour` bzw. `GLACIER_MELT_STATE`; Voreinstellung `MELT_STATE_DEFAULT = 'ahead'` = der heutige Weg und der benannte Rückfall. Ein anderes Wort bricht den Lauf mit Grund ab. Mit `ahead` schreibt der Lauf jedes Byte wie bisher.
- **Datei** `melt/state.json`, mit `run-hour`: `atMs` = Laufstunde, `g` = Zustand je Gletscher an der Laufstunde (nach dem Satelliten-Abgleich, dieselbe Form und Auflösung wie heute), dazu `pend`: der Antrieb der nächsten 18 Stunden (`MELT_STATE_PEND_H`, wie bei der Schneedecke) je ANTRIEBSGEBER — Temperatur an dessen Bezugshöhe, Nullgradgrenze, Strahlung, Niederschlag, auf 0,01 K / 1 m / 1 W/m² / 0,01 mm — und die Zuordnung der Gletscher, die mit dem Antrieb eines Nachbarn rechnen (Klasse C). `schema` bleibt 1: der alte Leser nimmt die Datei (er liest nur `atMs` und `g`).
- **Lesen** mit `run-hour`: Datei mit `pend` ⇒ Abstand = Laufstunde − `atMs`; die ersten min(Abstand, 18) Stunden werden mit dem gespeicherten Antrieb und dem Schmelzkern (`simulate`, dieselben Bänder und Parameter wie im Lauf) nachgerechnet, der Rest fehlt und steht als `ageH` im Dokument; mehr als 30 fehlende Stunden ⇒ Kaltstart wie heute. Datei ohne `pend` (alte Form, der erste Lauf nach dem Einschalten) ⇒ die heutige Regel. Ein Gletscher, dessen Antriebsgeber in der Datei fehlt, behält seinen Zustand ohne Nachrechnen und wird gezählt.
- **Übergänge:** der Rückfall `ahead` liest eine neue Datei ohne Absturz (er sieht einen Zustand mit dem Alter des Abstands; die Stunden dazwischen fehlen und sind benannt).
- **Dokument:** `state.source` und `state.ageH` behalten ihre Bedeutung (`ageH` = Stunden, die dem Zustand fehlen); mit `run-hour` kommen `state.mode: 'run-hour'` und `state.replayedH` dazu. Die Seite liest nur `source`.
- **Nicht in diesem Paket:** der Schmelzzustand hat kein Einschwingen (er beginnt bei null und füllt sich aus Vorhersagen und dem Satelliten-Abgleich) und mischt Rechnungen (V-GM-27). Das sauberere Ziel — der Schmelzlauf liest die Schneedecke aus `snowpack/` — hängt am Urteil von GM-4.

### 3g.3 Umsetzung

| Datei | Was |
|---|---|
| `scripts/glacier/lib/meltstate.mjs` (neu, rein) | `MELT_STATE_MODES`, `MELT_STATE_DEFAULT = 'ahead'`, `meltStateModeOf` (unbekanntes Wort wirft), `meltStateVerdict(state, mode, t0Ms, maxAgeH)` → übernehmen ja/nein, Alter, nachzurechnende Stunden, Form der Datei; `pendOfForcing` / `forcingOfPend` (Antrieb in der Auflösung der Datei und zurück, Lücke = `null` = NaN); `stateRowOf` / `stateOfRow` |
| `scripts/glacier/melt.mjs` | Schalter `--melt-state` / `GLACIER_MELT_STATE` (gelesen, bevor irgendetwas gelesen oder geschrieben wird); das Urteil über die Zustandsdatei kommt aus `meltStateVerdict` (mit `ahead` dieselbe Regel wie bisher); `mk` rechnet mit `run-hour` den Zustand je Gletscher mit `meltOfForcing` über die Stunden bis zur Laufstunde nach — eigene Bänder, eigene Gleichgewichtslinie, eigene Parameter (`paramsOf`, also der Faktor des Laufs), Antrieb des Antriebsgebers — und bringt ihn auf die Auflösung der Datei, DANACH greift der Satelliten-Abgleich; geschrieben wird der Zustand, mit dem der Lauf begonnen hat, samt `pend`; die Datei wird vor dem Schreiben gegen den Vertrag geprüft; Dokument `state.mode` / `replayedH` / `held`, Statuszeile `lines.melt.state` — beides nur mit `run-hour` |
| `src/glacier/glacierMeltContract.ts` | `GLACIER_MELT_STATE_PEND_H = 18`; Typen (`pend` an der Zustandsdatei, die drei freiwilligen Felder an `state`); `meltStateProblems` prüft `pend`, wenn vorhanden (Stundenzahl, Länge und Werte der Reihen, keine negative Strahlung, kein negativer Niederschlag, jeder Gletscher des Zustands hat einen Antriebsgeber). Kein Byte im Bundle erwartet (die Seite ruft die Funktion nicht) |
| `scripts/verify-glacier-melt.mjs` | Block I, 13 Prüfungen (I1–I13) |
| `audit/gletscher-schneemodell/gm32-*.mjs` | Messung der Kaltstarts, Gegenprobe, Auswertung der Vollläufe |

Was mit dem Schalter gleich bleibt: der Lauf selbst rechnet seine 14 Tage wie bisher aus dem Zustand an der Laufstunde; die 6-Stunden-Vorausrechnung (`adv`) läuft weiter mit, wird mit `run-hour` aber nicht mehr gespeichert. Ein Gletscher, der in einem Lauf übersprungen wird, verliert wie bisher seinen Zustand.

### 3g.4 Messung am vollen lokalen Lauf (23.11. abends)

Aufbau: `C:\dev\buscosun-glacier-cache\gm32\` (Skript `C:\dev\buscosun-glacier-cache\gm32-run.ps1`, Auswertung `audit/gletscher-schneemodell/gm32-analyse.mjs` → `gm32-analyse.json`). Cube und Lesesicht wie in GM-3c (`gs\cube`, `gs\view\glacier\v1`, Katalog `20261120-1`, 2 094 Gletscher). Nichts davon ist eingespielt.

**A. Ohne Schalter Byte für Byte, mit Negativkontrolle.** Derselbe Lauf wie die Referenz aus GM-3c (`--now=2026-11-21T17:50:00Z --always`, Referenzbaum `gm3c-snowpack\out-off`, vor dieser Änderung geschrieben):

| Vergleich | gleiche Dateien | anders |
|---|---|---|
| ohne Schalter gegen die Referenz | **338 von 338** | — |
| `--melt-state=run-hour` gegen ohne Schalter (Negativkontrolle) | 336 von 338 | `melt/2026112117.json` (nur der Block `state`: alle 2 094 Gletscherzeilen sind gleich) und `melt/state.json` |

**B. Die Kette, um die es geht.** Lauf A zur Stunde, zu der der Zustand der Lesesicht gehört (21.11. 23 UTC), B drei Stunden später, C sechs Stunden später; B und C lesen beide den Zustand von A. Je einmal mit `ahead` und mit `run-hour` (ohne Wetterteil, er ändert das Schmelzdokument nicht):

| Lauf | Abstand | `ahead` (heute) | `run-hour` | Gletscherzeilen gleich |
|---|---|---|---|---|
| A `2026112123` | — | übernommen, Kachel im Mittel 12,5 %, 0 % an 1 283 Gletschern | übernommen (Datei alter Form, alte Regel), 12,5 %, 1 283 | 2 094 von 2 094 |
| B `2026112202` | **3 h** | **`cold`**, Kachel im Mittel **33,8 %**, 0 % nur noch an 346 Gletschern | **`carried`**, 3 h nachgerechnet, **12,5 %**, 0 % an 1 284 | 1 135 von 2 094 (Kachel anders an 949, bis 100 Punkte; Index anders an 44, bis 9 Punkte) |
| C `2026112205` | 6 h | übernommen, 12,5 %, 1 284 | übernommen, 6 h nachgerechnet, 12,5 %, 1 284 | **2 094 von 2 094** |

Lesart: beim 6-Stunden-Abstand ändert der Schalter keine Zeile des Dokuments (der nachgerechnete Zustand führt auf dieselben Zahlen wie der vorausgerechnete); beim 3-Stunden-Abstand bleibt die Kachel, wo sie war, statt um 21 Punkte im Mittel zu springen — an 949 Gletschern steht sonst ein anderer Wert.

**C. Gewicht.** `melt/state.json` wächst von 209 KB auf 626 KB roh (gepackt 46 → 132 KB): 957 Antriebsgeber × 18 Stunden × 4 Größen, 1 137 Gletscher mit Nachbar-Antrieb zugeordnet. Die Nullgradgrenze ist an 17 193 von 17 226 Stellen leer (Winter) und trägt allein rund 86 KB roh (V-GM-46). Laufzeit: kein messbarer Unterschied (A, B: 110 / 100 und 98 / 100 s).

### 3g.5 Prüfer und Gegenprobe

`verify:glacier-melt` **63/63** (vorher 49), Block I = 14 Prüfungen:

| Prüfung | Inhalt |
|---|---|
| I1 | das Urteil über die Zustandsdatei als Tabelle: beide Modi, Dateien mit und ohne Antrieb, Abstände −3 … 49 h, halbe Stunde, fehlende Datei |
| I2 | gespeicherter Antrieb: Auflösung, Lücke als `null` und zurück, unbrauchbare Zeilen |
| I3 | Schalter: ohne Angabe = `ahead` = dieselben Bytes; `run-hour` zweimal gerechnet dieselben Bytes; unbekanntes Wort bricht ab; Umgebungsvariable, Schalter gewinnt |
| I4 | Form der Datei mit `run-hour` und was Dokument und Statuszeile nennen |
| I5 | **3-Stunden-Abstand:** `ahead` verwirft (Gegenprobe), `run-hour` beginnt mit dem Schnee von genau 3 Stunden — von Hand an allen Bändern von vier Gletschern, auch am Gletscher mit Nachbar-Antrieb |
| I6 | 6-Stunden-Abstand: beide Wege derselbe Zustand und dieselben Gletscherzeilen |
| I7 | 15 h (`ahead` verliert 9 Stunden), 24 h (18 nachgerechnet, 6 fehlen), 48 h, 49 h (Kaltstart) |
| I8 | die Taktung ist gleichgültig: 3 + 3 = 6, viermal 3 = 12 |
| I9 | beide Übergänge: einschalten (Datei alter Form) und zurückfallen (Datei neuer Form) |
| I10 | Nachrechnen MIT Schmelze gegen den direkt gerufenen Kern, drei Arten von Antrieb, vier Gegenproben |
| I14 | dünne Schneedecke: Albedo der blanken Fläche nach der Gleichgewichtslinie des Gletschers |
| I11 | Gletscher ohne Antrieb in der Datei: Zustand gehalten und gezählt |
| I12 | der Satelliten-Abgleich greift nach dem Nachrechnen |
| I13 | Vertrag der Datei: elf Verletzungen, jede gemeldet |

Die Fixtures sind die des bestehenden Prüfers (Testkatalog mit eigenem, fremdem und fehlendem Antrieb); die echte Datenform ist am vollen Lauf belegt (§3g.4), die geschriebene Datei besteht dort den Vertrag (der Lauf prüft sie vor dem Schreiben).

**Gegenprobe** `gm32-mutations.mjs` → `gm32-mutations.json`: 34 eingebaute Fehler in `meltstate.mjs`, `melt.mjs` und dem Vertrag. Erste Runde: 32 von 34 bemerkt. Übersehen: (1) Nachrechnen mit der Gleichgewichtslinie 0 — die Prüfungen hatten nie so wenig Schnee, dass die Albedo der blanken Fläche zählt ⇒ I14 ergänzt; (2) der Zustand wird nach dem Nachrechnen nicht auf die Auflösung der Datei gebracht — ohne sichtbare Folge, weil die Datei beim Schreiben ohnehin rundet (der Lauf beginnt dann mit bis zu 0,05 mm anderem Schnee; gleichwertig auf der Auflösung der Datei und des Dokuments). Zwei Fehler fielen nur als Absturz des Prüfers auf ⇒ Block I meldet einen Absturz jetzt als benannte rote Prüfung. **Zweite Runde: 33 von 34 bemerkt, keiner nur als Absturz, Prüfer danach grün**; der eine Überlebende ist (2).

### 3g.6 Gate

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-melt` | 63/63 |
| `verify:glacier-weather` · `-snowpack` · `-snowcal` · `-snowcore` | 41/41 · 31/31 · 37/37 · 24/24 |
| `verify:glacier-contract` · `-publish` · `-sheet` · `-static` | 64/64 · 34/34 · 45/45 · 7/7 |
| `verify:glacier-snow-view` · `-dossier-heute` · `-stations` · `-feed` | 19/19 · 21/21 · 77/77 · 22/22 (`-feed` brach beim ersten Aufruf am Start des Browsers ab — „kein DevTools-Endpunkt“, während andere Prüfer liefen —, beim zweiten grün; er liest keine der geänderten Dateien) |
| `npm run typecheck` | grün |
| `npm run build` · `npm run budget` | 281/281 · totalJs 2 118,1 / 2 121 KB, unverändert (kein Byte im Bundle) |
| Geschützte Pfade (`src/pointForecast`, `src/point`, `scripts/point`, `scripts/punktarchiv`) | Diff gegen `origin/main` leer |
| Voller Lauf ohne Schalter | 338 von 338 Dateien Byte für Byte wie die Referenz; Negativkontrolle mit Schalter: 2 Dateien anders (§3g.4) |
| Gegenprobe | 33 von 34 |

Die fünf Fragen: (1) Funktionserhalt — ohne Schalter jede Datei gleich, die 49 bisherigen Prüfungen des Schmelzlaufs unverändert grün; (2) Desktop pixelgleich — kein Byte im Bundle geändert, nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

Nicht geprüft: kein Lauf auf dem Runner; nur eine Wetterlage (21./22.11., kaum Schmelze — die Schmelze beim Nachrechnen ist nur im Prüfer belegt, I10/I14); keine Kette über mehr als drei volle Läufe am echten Katalog (im Prüfer fünf); der Publisher mit der größeren Zustandsdatei (er behandelt sie wie jede Datei unter `melt/`); kein Browser; `verify:glacier-ui` (bricht an HEAD ab, V-GH-6).

**Gate GM-3d: gebaut und geprüft, Schalter aus. Ohne den Schalter schreibt der Producer dieselben Bytes wie vorher.** Offen bei Jan: Commit, Push und das Einschalten (E-GM-19).

### 3g.7 Entscheidungen und Befunde aus GM-3d

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-19 | **Einschalten von `run-hour` — wann und wie?** Es braucht keinen Startzustand: der erste Lauf mit dem Schalter liest die Datei alter Form nach der alten Regel und schreibt die neue. Zwei Wege wie bei E-GM-18: `GLACIER_MELT_STATE: run-hour` im Workflow `glacier-melt` des Daten-Repos (ohne Code, einzeln zurücknehmbar) oder `MELT_STATE_DEFAULT = 'run-hour'` (wirkt mit dem Push). Empfehlung: der Workflow-Weg, und erst nachdem der erste Lauf der Schneedecke (E-GM-18) gelesen ist, damit zwei Änderungen am selben Lauf nicht zusammenfallen. Zurück: die Zeile entfernen — `ahead` liest die neue Datei ohne Absturz (ein Lauf mit dem Alter des Abstands) | offen (Jan; `MANUELLE-SCHRITTE.md` §120) |
| V-GM-32 | Zustand des Schmelzlaufs wird bei 3-Stunden-Abständen verworfen | **gebaut (GM-3d), Schalter aus;** Wirkung gemessen: die Kachel „Fläche ohne Schneedecke“ springt dann im Mittel um rund 21 Punkte (§3g.1 B, §3g.4 B) |
| V-GM-45 | Der Schmelzzustand hat kein Einschwingen: nach einem Kaltstart (oder nach mehr als 30 fehlenden Stunden) beginnt er bei null und füllt sich nur aus Vorhersagen und dem Satelliten-Abgleich; die Schneedecke unter `snowpack/` ist dagegen seit 1.10. eingeschwungen. Mehrwert: nach einem Ausfall steht die Kachel sofort richtig, und Schmelze und Schneedecke stammen aus EINER Rechnung (V-GM-27). Skizze: der Schmelzlauf liest den Schnee je Band aus dem Zustand der Schneedecke (drei Höhen ⇒ Bänder dazwischen interpoliert) — nach dem Urteil von GM-4, hinter einem Schalter | offen (GM-4) |
| V-GM-46 | Die Zustandsdatei wächst mit `run-hour` von 209 auf 626 KB roh (46 → 132 KB gepackt) je Lauf; die Nullgradgrenze ist im Winter fast überall leer und trägt rund 86 KB. Mehrwert: weniger Wachstum der Historie im Daten-Repo. Skizze: eine ganz leere Reihe als ein `null` speichern; Strahlung nicht speichern, sondern beim Lesen aus Ort, Zeit und gespeicherter Bewölkung neu rechnen | offen |
| V-GM-47 | `verify:glacier-feed` bricht ab, wenn der Browser unter Last nicht rechtzeitig startet („Browser meldete keinen DevTools-Endpunkt“), und nennt dabei keine rote Prüfung. Mehrwert: kein falscher Alarm in einer Prüfreihe. Skizze: ein zweiter Startversuch in `scripts/lib/headlessShot.mjs` — fremde Linie, nicht angefasst | offen |

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
| GM-1 | Kern `snowcore.mjs` (Dichte, Setzung, Schichten), Verifier `verify:glacier-snowcore` 23/23, Messung M-2 (§3a) | erledigt 22.11., lokal committet (`65ca6a03`) |
| GM-2 | Antrieb an drei Höhen im Producer (Schalter `--heights=three`), Schneeanteil je Höhe aus der eigenen Antwort, eigene Schneefallgrenze `slo`/`slk`; Kaltluftlage zu K-2 nachgestellt (§3b) | erledigt 22.11., lokal committet, Schalter ein (E-GM-6, §3b.7); wirkt mit dem Push |
| GM-3 | Eichung an vergangenen Wintern: Niederschlag je Region und Höhe (Q13, Q14, Q17–Q19, Q21, Q22), Dichte (Q6, Q7), Brücke zu buscosun Fusion (§3c) | erledigt 22.11., lokal committet (`d09aecf6`): Tabelle `snow-calibration.json` (Urteil rot), `verify:glacier-snowcal`; Q20 (SLF-Datensatz 250 m) nicht benutzt |
| GM-3b | E-GM-7 Faktor je Land im Schmelzlauf (`--precip=country`, ohne Verlauf) und E-GM-8 Neuschneedichte 96 kg/m³ als zweiter Konstantensatz des Schneekerns (`board`) (§3d) | erledigt 23.11., lokal committet, **beide Schalter ein** (E-GM-12, §3e); wirkt mit dem Push |
| GM-3c | Schneekern im Producer als Schattenprodukt `glacier/v1/snowpack/` (Schalter `--snowpack=shadow`, aus), Vertrag `glacierSnowpackContract.ts`, Zustand unabhängig von der Taktung, Einschwingen ab 1.10. aus Analysen (`snowpack-seed.mjs`), alle Gletscher (§3f) | erledigt 23.11., auf `origin/main` (`c4b45c9e`); auf dem Runner eingeschaltet seit 23.11. abends (E-GM-18, §3f.8), erster Lauf steht aus |
| GM-4 | Kopplung an Stationen, Abweichungstabelle, Nachbar-Übertrag; Satelliten-Abgleich einmal je Szene (behebt M-18) | gekoppelter Zustand |
| GM-3d | Zustand des SCHMELZLAUFS an der Laufstunde mit 18 Stunden Antrieb (Schalter `--melt-state=run-hour`, aus), unabhängig von der Taktung (V-GM-32, §3g) | erledigt 23.11. abends, uncommitted, Schalter aus; Einschalten E-GM-19 |
| GM-5 | Verteilung aus Sentinel-2, Szenarien und Spannen (das Einschwingen ist mit GM-3c vorgezogen) | vollständiges Produkt |
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
- E-GM-12, E-GM-13 und V-GM-26 … V-GM-30: §3d.6; das Einschalten (E-GM-12 entschieden) und V-GM-31: §3e; Push, Budget, E-GM-13 bestätigt: §3e.7.
- Q20 (SLF-Schneedatensatz 250 m, 6,3 GB) ist in GM-3 nicht benutzt. Er gäbe eine zweite, modellgestützte Wahrheit für alle Schweizer Gletscher (auch die ohne Messung) und damit eine Prüfung, ob sich der Landesfaktor überträgt.
- V-GM-6: Durchfeuchtung und Wiedergefrieren fehlen im Kern; die Schneehöhe wird damit im Frühjahr zu hoch ausfallen. Vor dem Frühjahr 2027 an IMIS-Reihen nachziehen.
- V-GM-7: Die Schichtdauer von 6 Stunden begrenzt die Schärfe von „Neuschnee 24 h“; angeschnittene Schichten zählen anteilig. Kürzere Schichten kosten Zustandsgröße (mit V-GM-4 messen).
- V-GM-8: Der Vertrag `glacierSnowpackContract.ts` und der Pfad `glacier/v1/snowpack/` entstehen mit der Verdrahtung im Producer (GM-2/GM-5), nicht mit dem Kern. — **erledigt mit GM-3c (§3f).**
- E-GM-14 … E-GM-18 und V-GM-32 … V-GM-42: §3f.7. E-GM-18 ist umgesetzt (§3f.8); offen dazu: der erste Lauf mit Schalter. V-GM-39 (Prüfer in die CI) ist umgesetzt, V-GM-43 (roter CI-Lauf durch eine Zeitprüfung in `verify:pv-cube`) behoben — beides auf `origin/main` (`5fb86b4f`), CI grün. Offen bei Jan: V-GM-44 (Aktionen der CI auf Node 24).
- V-GM-32 ist mit GM-3d gebaut (§3g), Schalter aus; E-GM-19 (Einschalten von `run-hour`) und V-GM-45 … V-GM-47: §3g.7. Offen bei Jan: Commit und Push von GM-3d, E-GM-19.
- V-GM-4 (Speicherbedarf des Zustandsarchivs): der Zustand wiegt 1,8 MB roh je Lauf (§3f.5); ein Archiv gibt es noch nicht (GM-6).
- V-GM-7 (Schichtdauer 6 h): im Zustand hält fast jede Höhe zwölf frische Schichten; kürzere Schichten würden ihn entsprechend vergrößern (V-GM-37).
