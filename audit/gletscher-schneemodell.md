# Phase GM — Schneemodell am Gletscher („virtueller Schneesensor“)

> Stand 23.11.2026: GM-0 (Diagnose, Quellen, M-1), GM-1 (Schneekern, §3a) und GM-2 (drei Höhen im Producer, eigene Schneefallgrenze, §3b) gebaut, committet und seit 23.11. ≈ 15:50 UTC auf `origin/main` (Jans Push, §3e.7), nichts im Daten- oder Archiv-Repo. Der Schalter von GM-2 ist **ein** (E-GM-6, Jan 22.11. „einschalten und committen“, §3b.7); er wirkt mit dem Push von `main`.
> **GM-3 (Eichung, §3c) gebaut, lokal committet (`d09aecf6`):** Tabelle `scripts/glacier/snow-calibration.json` nach eingefrorener Methode — Niederschlagsfaktor 1,79 (Schweiz) / 2,33 (Österreich) statt 1,289, Urteil **rot** (K-2, K-4: kein belastbarer Höhenverlauf), Neuschneedichte 96 statt 68 kg/m³.
> **GM-3b (E-GM-7 + E-GM-8, §3d) gebaut 23.11., committet (`d09aecf6`, `1df1a160`) und gepusht, beide Schalter AN (E-GM-12, Jan 23.11. „committe, schalte ein“, §3e):** der Schmelzlauf rechnet ab Werk mit dem Faktor je Land (`country`, ohne Höhenverlauf), der Schneekern mit 96 kg/m³ und der Spanne 65–148 (`board`, zweiter Konstantensatz, noch ohne Leser im Betrieb). Auf `origin/main` seit 23.11. ≈ 15:50 UTC; der erste Schmelzlauf des neuen Producers (`2026112317`, 17:23 UTC) ist grün und rechnet mit `country` (§3e.7). Der Rückfall `--precip=gate-c` schreibt die Bytes wie vor GM-3b und öffnet die Tabelle nicht. E-GM-13 ist bestätigt (Jan 23.11.); E-GM-9 … E-GM-11 warten auf Jan.
> **GM-3c (§3f) gebaut 23.11., auf `origin/main` (`c4b45c9e`), Schalter auf dem Runner AN seit 23.11. 19:27 UTC (E-GM-18, §3f.8; im Code bleibt die Voreinstellung `off`):** der Schneekern läuft im Schmelzlauf je Gletscher an Zunge, Medianhöhe und Oberkante und schreibt hinter `--snowpack=shadow` das Schattenprodukt `glacier/v1/snowpack/` (Schneehöhe, Wasserwert, Neuschnee; alles „berechnet“) mit einem Zustand, der nicht an der Taktung hängt. Startzustand ab 1.10. aus Analysen mit `snowpack-seed.mjs` (E-GM-14), alle 2 084 Gletscher (E-GM-16), die ungenannte Dichte folgt dem Faktor (E-GM-15), Publisher mit Präfix `snowpack` (E-GM-17). Mit dem Schalter aus sind am lokalen Volllauf 338 von 338 Dateien Byte für Byte gleich. Eingeschaltet über den Workflow `glacier-melt` im Daten-Repo (`GLACIER_SNOWPACK: shadow`, `3a119833`), Startzustand vom 23.11. 17:00 UTC eingespielt (`4ae73e46`); erster Lauf `2026112323` (23.11. 23:23 UTC) grün: 2 084 Gletscher, Vertrag ohne Befund, Werte gleich dem Startzustand, weil dieser keinen Antrieb trägt (sechs Stunden ohne Antrieb an jeder Zeile, §3f.8); zweiter Lauf `2026112405` (24.11. 05:24 UTC): Zustand fortgeschrieben (`carried`, 6 von 6 Stunden nachgerechnet, keine neuen Lücken, Vertrag ohne Befund).
> **GM-3d (§3g, V-GM-32) gebaut 23.11. abends, auf `origin/main` (`b7a0e859`), Schalter auf dem Runner AN seit 23.11. 21:13 UTC (E-GM-19, §3g.8; im Code bleibt die Voreinstellung `ahead`):** der Zustand des Schmelzlaufs steht hinter `--melt-state=run-hour` an der Laufstunde und trägt 18 Stunden Antrieb; der nächste Lauf rechnet ihn bis zu seiner Stunde nach, gleich in welchem Abstand. Heute verwirft jeder Lauf, der 3 Stunden nach dem vorigen kommt, den Zustand — die Kachel „Fläche ohne Schneedecke“ springt dann im Mittel um rund 21 Punkte (gemessen). Ohne Schalter 338 von 338 Dateien Byte für Byte gleich. Eingeschaltet über den Workflow `glacier-melt` im Daten-Repo (`GLACIER_MELT_STATE: run-hour`, `3c871488`); erster Lauf `2026112323` wie erwartet (übernommen, Alter 0, neue Form geschrieben, Kachel unverändert 2,3 %; §3g.8); zweiter Lauf `2026112405`: nachgerechnet (`replayedH 6`, `held 0`), Kachel an keinem Gletscher anders; ein Lauf im 3-Stunden-Abstand kam noch nicht vor.
> **GM-5 (§3i, §3j) — 24.11., von Jan committet und gepusht am 24.11. 16:35 UTC (`b448d652`), alle neuen Schalter aus:** die Verteilung aus Sentinel-2 ist nicht gebaut (die Saisonzeilen tragen nur eine Schneegrenze je Szene; E-GM-30). **GM-5a:** hinter `--snowpack-spread=scenarios` trägt die Schneedecke p10/p90 aus 100 Szenarien je Höhe und Tag, die Summe der Tage 8–14 als eine Spanne, Nachbar-Zeilen den Vermerk „ohne Spanne“ und im Kopf EIN Paar zur Unsicherheit des Faktors; ohne Schalter 32 von 32 Dateien des vollen Laufs Byte für Byte gleich. **GM-5b:** Eichrunde 2 nach eingefrorener Regel mit dem Schmelzkern des Betriebs — Faktor je Gletscher (Winterbilanz 233 statt 402 mm) und Form je Höhenstufe (Formfehler 74 statt 132 mm) tragen; eigene Tabelle `snow-calibration-glaciers.json` (43 Gletscher), im Schmelzlauf hinter `--glacier-factor` und `--glacier-shape`; die Schneedecke liest sie nicht. Offen bei Jan: E-GM-36, **E-GM-37 (vor dem Commit)**, E-GM-38.
> **GM-4 (§3h) — Diagnose 23.11. abends, danach GM-4a gebaut, von Jan committet und gepusht am 24.11. 05:27 UTC (`019ab63c`), beide Schalter aus:** die Daten tragen heute KEINE Kopplung an Stationen (der Stand in Stationshöhe ist der Faktor, 1,86 × Station; die 24-h-Änderung bei Schneefall 0,76 × Station; Gratstationen verlieren beim Schneefall Schnee; die Abweichung der Änderung überträgt sich nicht auf Nachbarn), und mit dem Antrieb von buscosun Fusion gibt es noch keinen Lauf. Auf Jans Wort (E-GM-20 … E-GM-23) gebaut: Schattenpaare `snowpack/pairs/<lauf>.json` hinter `--snowpack-pairs=on` (Modell in Stationshöhe neben der Station, nichts gekoppelt), ihr Archiv (`glacier-archive.mjs --pairs`, Vorlage nachgezogen) und der Satelliten-Abgleich einmal je Szene im Schmelzlauf hinter `--sat-nudge=once`; kein Übertrag. Ohne Schalter 338 von 338 Dateien Byte für Byte gleich.
> **GM-5c (§3k, §3l) — 24.11. abends, auf `origin/main` (`32b400df`, Jans Push 24.11. 21:24 UTC), kein neuer Schalter, beide Gates geschlossen; die Spanne ist auf dem Runner AN seit 24.11. 21:29 UTC (E-GM-36: Jan „on, K = 100“, Daten-Repo `2d208df2`, §3i.4d):** der erste Runner-Lauf mit Schattenpaaren (`2026112417`) ist gelesen (§3h.17: 468 Paare, 465 mit Stationswert; das Archiv legte sie um 18:48 UTC noch nicht ab — die fehlende Repo-Variable ist seit 19:47 UTC gesetzt, und der Archivlauf vom 25.11. 00:55 UTC hat beide Paar-Dateien des Tages abgelegt, V-GM-96 erledigt). **V-GM-79:** in einem Lauf mit Spanne tragen die Paare die Vorhersage in Stationshöhe für +24 / +48 / +72 h (Erwartungswert an jedem Paar, p10/p90 wo die Zeile eine Spanne hat — das Quantil der je Szenario in Stationshöhe gelesenen Werte). **V-GM-81:** die Statuszeile des Schmelzlaufs trägt `mem` { `rssMb`, `heapMb`, `heapLimitMb` } (lokal 3 217 / 2 830 / 4 144 MB). Prüfer grün (`-snowpack` 72/72, `-melt` 78/78); voller lokaler Lauf am endgültigen Baum: mit ausgeschalteter Spanne 33 von 33 Dateien Byte für Byte wie `b448d652`, mit beiden Schaltern genau zwei Dateien anders (279 Paare mit Spanne), das Schneedecken-Dokument gleich dem von `b448d652` mit der Spanne allein; Gegenprobe 58 von 58 bemerkt. **Jan 24.11. abends: E-GM-39 (A, wie gebaut), E-GM-40 (wie gebaut, kein Schalter), E-GM-37 (A: die Tabelle je Gletscher bleibt im Repo, mit Quellenangabe GLAMOS und WGMS im Tabellenkopf und in `audit/gletscher/licences.md`).** **Erster Runner-Lauf mit Spanne (`2026112423`, 24.11. 23:23 UTC, grün): `spread` = `k` 100 · `rows` 957 · `none.neighbour` 1 127 · 86 s; `pairs.spread` 279; `mem` 3 315 / 2 830 / 4 144 MB; Verträge ohne Befund (§3k.7, §3l.5); neu V-GM-109.**
> **GM-9 (§3m) — 24.11. nachts, geschlossen:** gemessen, ob eine Regel aus Temperatur und Wind die feste Neuschneedichte von 96 kg/m³ schlägt — nein (eingefrorene Regel, Urteil vom Skript); nichts gebaut, die Dichte bleibt 96 (E-GM-41). Die 52–81 kg/m³ aus §3a waren Messer-Wasser (Minderfang 0,70 ⇒ ≈ 97). Lokal committet, nicht gepusht.
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
- **Die Neuschneedichte stimmt.** Niederschlag geteilt durch gemessene Neuschneehöhe ergibt an Tagen unter −1 °C im Mittel 68 kg/m³, genau der Literaturwert. Je Station 52–81. *(Berichtigt 24.11., §3m.8: das ist Messer-Wasser; mit dem Minderfang 0,70 wird daraus ≈ 97 kg/m³ — die 52–81 sind keine Neuschneedichten.)*
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
| E-GM-9 | **Faktor je Gletscher** für die 44 vermessenen Gletscher (N1-a: 0,23 statt 0,40 m)? Braucht eine neue eingefrorene Regel (Mindestzahl Winter, Schrumpfung zum Landeswert) und ist die stärkste Verbesserung, die diese Daten hergeben; für die übrigen 2 050 Gletscher ist die Kopplung an Stationen (GM-4) der Weg zum selben Ziel | **Jan 24.11.: ja** — zusammen mit E-GM-31 (Verteilung je Band) in EINER eingefrorenen Eichrunde (§3i) |
| E-GM-10 | **Winterschmelze** in einer neuen eingefrorenen Runde so ansetzen wie im Betrieb (ETI) oder mit-eichen, und am Winter 2025/26 prüfen (GLAMOS Release 2026)? N1-c zeigt, dass der Gradtag-Ansatz der Eichung die Winterbilanz verschlechtert | **Jan 24.11.: wie im Betrieb (ETI)**, nicht mit-eichen; Prüfung am Winter 2025/26, sobald GLAMOS ihn veröffentlicht |
| E-GM-11 | `inca-v1-1h-1km` als Quelle für die vergangenen Winter bestätigen (V-GM-16) | **Jan 24.11.: bestätigt** |
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
| V-GM-36 | Zwischen dem Ende des Startzustands und dem ersten Lauf liegen Stunden ohne Antrieb (INCA endet eine Stunde vor jetzt, das Schweizer Gitter bis zu 33 Stunden; aufgefüllt wird nur, wo ein Wetterlauf die Stunde trägt). Sie stehen an jeder Zeile (`gap`). Mehrwert: keine Lücke an der Naht. Skizze: den Startzustand unmittelbar vor dem Einschalten bauen (§119); später kann der Producer die Naht selbst aus den Wetterläufen schließen. **Nachtrag 24.11. (erster Lauf, §3f.8):** an der Naht 17 → 23 UTC fehlen allen 2 084 Gletschern sechs Stunden (Schweiz Median 1,2 mm, p90 6,5 mm Wasserwert nach der Vorhersage); 108 Schweizer Gletscher tragen schon aus dem Startzustand 24 Stunden ohne Antrieb — der Bericht des Werkzeugs zeigt das nicht, weil er nur p10 / Median / p90 nennt (Skizze: Anzahl und Höchstwert in den Bericht) | §119 |
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
| Startzustand gebaut | `snowpack-seed.mjs`, 23.11. 18:06 UTC, 153 s; Katalog `20261120-1` (derselbe wie im Zeiger des Daten-Repos) | Stand **23.11. 17:00 UTC**, 1 289 Stunden ab 1.10., 2 084 Gletscher (10 ohne Höhen übersprungen), Regeln `country`/`board`, 968 551 Bytes; Stunden ohne Antrieb: 0 an 1 976 Gletschern, **24 an 108 Schweizer Gletschern** (Berichtigung 24.11.: hier stand „0 in allen drei Ländern“ — der Bericht nennt je Land nur p10 / Median / p90, und die sind 0; am eingespielten Zustand nachgezählt, welcher Tag fehlt, ist nicht untersucht); Schweiz 35 Stunden aus den Wetterläufen von buscosun Fusion gefüllt (Tagesgitter für 17.11. und 23.11. fehlt); Verschiebung gegen buscosun Fusion aus 32 Wetterläufen, p10 / Median / p90 −2,2 / −0,3 / +1,4 K. Bericht `C:\dev\buscosun-glacier-cache\gm3c-snowpack\seed-2311-report.json` |
| Startzustand geprüft | Vertrag und Annahmeregel | `snowpackStateProblems` 0 Befunde; `stateRefusal` für einen Lauf um 20 UTC mit `country`/`board`: keine Ablehnung |
| Startzustand eingespielt | Publisher `--line=melt` aus dem Ordner mit nur dieser Datei, ohne `--force` | Daten-Repo `4ae73e46`, 23.11. 19:23 UTC, eine Datei `glacier/v1/snowpack/state.json` (968 551 Bytes), Versuch 1. Damit ist der Publisher einmal gegen das echte Repo mit `snowpack/` gelaufen (stand in §3f.6 unter „nicht geprüft“) |
| Schalter | `GLACIER_SNOWPACK: shadow` unter `jobs.melt.env` in `.github/workflows/glacier-melt.yml` (drei Zeilen: zwei Kommentare, ein Wert) | Daten-Repo `3a119833`, 23.11. 19:27 UTC; nur diese Datei geändert; der erste Versuch wurde abgelehnt, weil `main` inzwischen weitergelaufen war, der zweite setzte auf dem neuen Stand auf (kein `--force`). Auf `main` nachgelesen: Zeile 42 trägt den Wert, `snowpack/state.json` liegt daneben |
| Vorlage nachgezogen | `scripts/glacier/gen-workflows.py` + erzeugte `workflow-glacier-melt.yml` (uncommitted) | Vorlage und Live-Datei unterscheiden sich nur im Zeilenende; `verify:glacier-publish` 34/34 |

Mindestgegenprobe vor dem Einspielen, am Code gelesen: der Publisher legt Dateien nur dazu und löscht unter `snowpack/` allein Laufdokumente mit Zeitstempel im Namen, die älter als 72 h sind — ein Lauf mit Schalter aus hätte den Zustand liegen lassen. Der Workflow kopiert `glacier/v1` von `main` in die Lesesicht, der Producer findet den Zustand dort unter `snowpack/state.json`.

**Erster Lauf mit Schalter: `2026112323`, 23.11. 23:23 UTC — gerechnet, kein `error`.** Gelesen 23:37 UTC am Commit `326b1a3c` des Daten-Repos, nur gelesen. Die Vertragsprüfung lief mit dem Code von `dc982141` (aus `git archive`, nicht aus dem Arbeitsbaum, in dem GM-4 gerade ändert). Sonde, Ergebnis und die gelesenen Dateien: `C:\dev\buscosun-glacier-cache\gm3c-snowpack\run-2026112323\` (`check.mjs`, `check.json`, `data\`).

| Was | Wert |
|---|---|
| `lines.snowpack` | `mode: shadow`, 2 084 Gletscher, 10 übersprungen (alle `elevations`), Antrieb 957 eigene Antworten / 1 127 Nachbar / 0 Hochrechnung, `precip: country`, `density: board`, 7 s, Dokument 1 271 764 Bytes, Zustand 1 840 739 Bytes |
| übernommener Zustand | `source: seed`, `since` 1.10., `ageH 6`, `replayedH 0`, `started 0`, `gaps` = 2 084 Gletscher, Höchstwert 30 |
| Vertrag | `snowpackProblems` 0 Befunde (Katalog = die 2 094 Kennungen des Schmelzdokuments desselben Laufs), `snowpackStateProblems` 0 Befunde |
| Dateien unter `snowpack/` | `2026112323.json` und `state.json` (Stand 23:00 UTC = Laufstunde, `source: run`, 2 084 Einträge, jeder mit 18 Stunden Antrieb; Dokument und Zustand tragen dieselben Gletscher) |
| Schneehöhe und Wasserwert gegen den Startzustand | p10 / Median / p90 je Land und Höhe **auf 0,1 gleich dem Bericht des Startzustands** (Medianhöhe: Österreich 87,8 / 115,0 / 152,5 cm, Schweiz 65,0 / 141,9 / 211,8 cm, Deutschland 74,0 / 98,4 / 113,0 cm) |
| Neuschnee 24 h, Medianhöhe | Österreich 0,2 / 3,6 / 10,0 cm · Schweiz 5,1 / 25,2 / 44,7 cm · Deutschland 0,4 / 3,2 / 6,0 cm (72 h: Österreich 12,2 / 24,1 / 40,9 · Schweiz 13,0 / 59,2 / 85,8) |
| Vorhersage | 14 Tage je Höhe; Schneehöhe am Ende von Tag 1 gegen jetzt −6,8 / −3,1 / −1,5 cm (Setzung); Neuschnee über 14 Tage in der Medianhöhe 31,6 / 46,0 / 88,1 cm (Erwartungswerte ohne Spanne, V-GM-41) |
| Schmelzlauf daneben | `lines.melt.seconds` 175 (Lauf 17 UTC: 143), davon 7 für die Schneedecke; 2 094 Gletscher, 0 übersprungen |

Lesart:
- **Die Werte von 23 UTC sind die des Startzustands von 17 UTC.** Der Startzustand trägt keinen Antrieb (`pend` leer an allen 2 084 Einträgen), der Lauf konnte also nichts nachrechnen: sechs Stunden ohne Schneefall, Setzung und Schmelze. Das steht an jeder Zeile (`gap: 6`, an 108 Schweizer Zeilen `gap: 30`) und war angekündigt (V-GM-36). Wie viel fehlt, aus der Vorhersage des Wetterlaufs 17 UTC für diese sechs Stunden gerechnet (eine Vorhersage, keine Messung; Medianhöhe, Gletscher mit eigenen Antworten): Schweiz (617) Median 1,2 mm, p90 6,5 mm Wasserwert mit Faktor, das ist rund 1 bzw. 7 cm frischer Schnee; Österreich (337) Median 0,1 mm, p90 0,9 mm; Deutschland 0. Klein gegen 142 cm, aber die Masse fehlt der Kette dauerhaft.
- Ab dem nächsten Lauf trägt der Zustand 18 Stunden Antrieb. Erwartet dort: `source: carried`, `replayedH` = Abstand in Stunden, keine neuen Stunden ohne Antrieb (`gap` bleibt 6 bzw. 30).

Erster Blick 23.11. 20:38 UTC (vor diesem Lauf): der Job des Crons 20:20 UTC lief mit dem neuen Workflow (Start 20:23 UTC, 51 s, grün) und hat wie erwartet nicht gerechnet — kein neuer Cube-Lauf t2/t3 (t2 weiter `2026112312`), `lines.melt.at` unverändert 17:23 UTC, unter `snowpack/` nur der Startzustand. Belegt ist damit nur, dass der Job mit der neuen Zeile grün endet. Der Schmelzlauf rechnet nur bei einem neuen Cube-Lauf der Stufen t2/t3 und höchstens viermal am Tag; der Cron um 20:20 UTC kann leer ausgehen, der nächste folgt um 23:20 UTC. Die Stunden zwischen 17:00 UTC und der Laufstunde zählt der Lauf als Stunden ohne Antrieb (`state.gaps`, V-GM-36). Zu lesen in `glacier/v1/status.json`, Zeile `lines.snowpack`: `mode: shadow`, `glaciers` um 2 084, `state.source: seed`, `seconds`, `bytes`, `stateBytes` — oder `error` mit Grund.

Zurück: die Zeile `GLACIER_SNOWPACK` im Workflow entfernen oder auf `off` setzen. Der Lauf schreibt dann nichts mehr unter `snowpack/`, die Laufdokumente verschwinden nach 72 h, der Zustand bleibt liegen und wird nicht gelesen.

**Zweiter Lauf: `2026112405`, 24.11. 05:24 UTC — der Zustand ist fortgeschrieben.** Gelesen 05:33 UTC am Commit `703619c6` des Daten-Repos, nur lesend; Vertragscode von `dc982141` (der Lauf begann vor dem Push von `019ab63c` um 05:27 UTC). Werkzeug und Dateien: `C:\dev\buscosun-glacier-cache\gm3c-snowpack\run-2026112405\` (`check.mjs` → `check.json`).

| | Lauf `2026112405` |
|---|---|
| `lines.snowpack.state` | `source: carried`, `ageH 6`, **`replayedH 6`**, `started 0`, `gaps` 2 084 / max 30 — wie erwartet |
| Stunden ohne Antrieb | an keinem der 2 084 Gletscher mehr als im Lauf davor (6 an 1 976, 30 an 108): **keine neuen Lücken** |
| `snowpackProblems` / `snowpackStateProblems` | 0 / 0 Befunde; 2 084 Zeilen, 10 übersprungen (`elevations`), 6 s, 1 270 302 und 1 735 778 Bytes |
| Zustand | Stand 05:00 UTC, `source: run`, 2 084 Einträge, jeder mit 18 h Antrieb |
| Nachrechnen gegen den gespeicherten Antrieb | Änderung des Wasserwerts in der Medianhöhe minus fester Niederschlag der sechs gespeicherten Stunden: an **2 084 von 2 084** Gletschern innerhalb 1 mm (p10 / Median / p90 0 / 0 / 0) — der Lauf ist genau den Weg gegangen, den der vorige gespeichert hat |
| Was sich bewegt hat (Medianhöhe, Median) | Wasserwert AT +0,1 mm, CH +0,1 mm (p90 +0,5), DE 0; Schneehöhe AT −0,6 cm, CH −1,4 cm, DE −0,9 cm (Setzung); Neuschnee 24 h CH 14,9 cm (vorher 25,2: das Fenster wandert) |
| Schmelzlauf im selben Lauf | 144 s (vorher 175 s) |

Nicht geprüft: das Protokoll des Jobs selbst (gelesen sind Statuszeile, Zeiger und Dateien); welche 24 Stunden den 108 Schweizer Gletschern im Startzustand fehlen; ein Lauf mit anderem Abstand als 6 Stunden.

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
| E-GM-19 | **Einschalten von `run-hour` — wann und wie?** Es braucht keinen Startzustand: der erste Lauf mit dem Schalter liest die Datei alter Form nach der alten Regel und schreibt die neue. Zwei Wege wie bei E-GM-18: `GLACIER_MELT_STATE: run-hour` im Workflow `glacier-melt` des Daten-Repos (ohne Code, einzeln zurücknehmbar) oder `MELT_STATE_DEFAULT = 'run-hour'` (wirkt mit dem Push). Empfehlung: der Workflow-Weg, und erst nachdem der erste Lauf der Schneedecke (E-GM-18) gelesen ist, damit zwei Änderungen am selben Lauf nicht zusammenfallen. Zurück: die Zeile entfernen — `ahead` liest die neue Datei ohne Absturz (ein Lauf mit dem Alter des Abstands) | **entschieden und umgesetzt: Jan 23.11. abends** („es ist gepusht, schalte es ruhig direkt ein“ — gegen meine Empfehlung, den ersten Lauf der Schneedecke abzuwarten) — Workflow-Weg, §3g.8 |
| V-GM-32 | Zustand des Schmelzlaufs wird bei 3-Stunden-Abständen verworfen | **gebaut (GM-3d), Schalter aus;** Wirkung gemessen: die Kachel „Fläche ohne Schneedecke“ springt dann im Mittel um rund 21 Punkte (§3g.1 B, §3g.4 B) |
| V-GM-45 | Der Schmelzzustand hat kein Einschwingen: nach einem Kaltstart (oder nach mehr als 30 fehlenden Stunden) beginnt er bei null und füllt sich nur aus Vorhersagen und dem Satelliten-Abgleich; die Schneedecke unter `snowpack/` ist dagegen seit 1.10. eingeschwungen. Mehrwert: nach einem Ausfall steht die Kachel sofort richtig, und Schmelze und Schneedecke stammen aus EINER Rechnung (V-GM-27). Skizze: der Schmelzlauf liest den Schnee je Band aus dem Zustand der Schneedecke (drei Höhen ⇒ Bänder dazwischen interpoliert) — nach dem Urteil von GM-4, hinter einem Schalter | offen (GM-4) |
| V-GM-46 | Die Zustandsdatei wächst mit `run-hour` von 209 auf 626 KB roh (46 → 132 KB gepackt) je Lauf; die Nullgradgrenze ist im Winter fast überall leer und trägt rund 86 KB. Mehrwert: weniger Wachstum der Historie im Daten-Repo. Skizze: eine ganz leere Reihe als ein `null` speichern; Strahlung nicht speichern, sondern beim Lesen aus Ort, Zeit und gespeicherter Bewölkung neu rechnen | offen |
| V-GM-47 | `verify:glacier-feed` bricht ab, wenn der Browser unter Last nicht rechtzeitig startet („Browser meldete keinen DevTools-Endpunkt“), und nennt dabei keine rote Prüfung. Mehrwert: kein falscher Alarm in einer Prüfreihe. Skizze: ein zweiter Startversuch in `scripts/lib/headlessShot.mjs` — fremde Linie, nicht angefasst | offen |

### 3g.8 Einschalten von `run-hour` (E-GM-19, Jan 23.11. abends)

| Schritt | Was | Beleg |
|---|---|---|
| Commit und Push von `buscosun-web` (Jan) | GM-3d auf `origin/main` | `b7a0e859`, Arbeitsbaum danach sauber; `MELT_STATE_DEFAULT` bleibt `ahead` |
| Schalter | `GLACIER_MELT_STATE: run-hour` unter `jobs.melt.env` in `.github/workflows/glacier-melt.yml` des Daten-Repos (drei Zeilen: zwei Kommentare, ein Wert), ohne `--force` | Daten-Repo `3c871488`, 23.11. 21:13 UTC, erster Versuch; nur diese Datei geändert. Auf `main` nachgelesen: Zeile 42 `GLACIER_SNOWPACK: shadow`, Zeile 45 `GLACIER_MELT_STATE: run-hour`; `melt/state.json` (alte Form, 212 692 Bytes) und `snowpack/state.json` liegen unverändert |
| Vorlage nachgezogen | `scripts/glacier/gen-workflows.py` + erzeugte `workflow-glacier-melt.yml` (uncommitted) | `verify:glacier-publish` 34/34 |

**Erster Lauf mit beiden Schaltern: `2026112323`, 23.11. 23:23 UTC — wie erwartet.** Gelesen 23:37 UTC am Commit `326b1a3c` des Daten-Repos (Sonde und Dateien wie in §3f.8). `lines.melt.state: run-hour`; Schmelzdokument `state` = `carried`, `ageH 0`, `nudged 307`, `mode run-hour`, `replayedH 0`, `held 0`; 2 094 Gletscher, 0 übersprungen. Kachel „Fläche ohne Schneedecke“: Mittel 2,3 %, 0 % an 1 785 von 2 094 — an keiner der 2 094 Zeilen anders als im Lauf 17 UTC. `melt/state.json`: 621 563 Bytes (vorher 212 692), Stand 23:00 UTC = Laufstunde, 2 094 Gletscher, `pend.h 18`, 957 Antriebsgeber, 1 137 zugeordnet, jede Reihe 18 Stunden, Frostgrenze `null` an 17 214 von 17 226 Werten (V-GM-46); `meltStateProblems` 0 Befunde (Vertragscode von `dc982141`). Belegt ist damit der Übergang von der alten zur neuen Form auf dem Runner. **Nicht belegt:** das Nachrechnen selbst (`replayedH` > 0) — das zeigt erst der nächste Lauf; und der Fall, für den GM-3d gebaut ist (ein Lauf 3 Stunden nach dem vorigen), erst wenn er vorkommt.

**Zweiter Lauf: `2026112405`, 24.11. 05:24 UTC — das Nachrechnen ist belegt.** Gelesen 05:33 UTC am Commit `703619c6` (Werkzeug wie §3f.8, zweiter Lauf). Schmelzdokument `state` = `carried`, `ageH 0`, `mode run-hour`, **`replayedH 6`**, `held 0`, `nudged 251`; 2 094 Gletscher. Kachel „Fläche ohne Schneedecke“: an keiner der 2 094 Zeilen anders als im Lauf 23 UTC (Mittel 2,3 %, 0 % an 1 785). `melt/state.json`: 618 539 Bytes, Stand 05:00 UTC, `pend.h 18`, 957 Antriebsgeber, 1 137 zugeordnet; `meltStateProblems` 0 Befunde. **Weiter nicht belegt:** der Fall, für den GM-3d gebaut ist (ein Lauf 3 Stunden nach dem vorigen) — beide Abstände bisher waren 6 Stunden; er zeigt sich, wenn er vorkommt (`replayedH 3` statt eines verworfenen Zustands).

Vor dem Lauf erwartet: der Lauf liest die Zustandsdatei alter Form nach der alten Regel (sie steht bei 23:00 UTC ⇒ übernommen, Alter 0, nichts nachgerechnet) und schreibt die neue. Zu lesen: `lines.melt.state: run-hour` in `status.json`; im Schmelzdokument `state` = `carried`, `ageH 0`, `mode run-hour`, `replayedH 0`, `held 0`; `melt/state.json` um 0,6 MB mit `pend` (18 Stunden, um 957 Antriebsgeber) und `atMs` = Laufstunde. Ab dem Lauf danach nennt `replayedH` den Abstand in Stunden. Schneedecke und Schmelzzustand werden damit im selben Lauf zum ersten Mal scharf; beide Schritte sind getrennt abgesichert (ein Fehler der Schneedecke hält den Schmelzlauf nicht auf; ein unbekanntes Wort am Zustandsschalter bricht den Lauf vor dem Lesen ab).

Zurück: die Zeile `GLACIER_MELT_STATE` im Workflow entfernen oder auf `ahead` setzen (§3g.2, Übergänge).

## 3h. GM-4: Kopplung an Stationen — Diagnose (23.11. abends, vor jedem Code)

Auftrag (Jan, 23.11. abends): die berechnete Schneedecke an die Stationsmessungen koppeln, mit Abweichungstabelle, Übertrag auf Gletscher ohne Station und dem Satelliten-Abgleich einmal je Szene (M-18). Zuerst die Diagnose, nichts als gegeben. buscosun Fusion und die Stationslinie `glacier/v1/stn/` werden nur gelesen.

Werkzeuge und Belege: Messregel `audit/gletscher-schneemodell/gm4-method-frozen.md`, eingefroren 23.11. 21:30 UTC vor dem ersten gewerteten Lauf (sha256 `71709ce6…`, `gm4-method-frozen.sha256`); Sonde `gm4-probe.mjs` → `gm4-probe.json` (zwei Durchläufe, gleiches Ergebnis). Gelesene Kopien des Daten-Repos (Stand `c0f4686f`, 23.11. 21:25 UTC): `C:\dev\buscosun-glacier-cache\gm4\live\` (105 Slot-Dateien `stn/h/` vom 21.11. 08 UTC bis 23.11. 21 UTC, Zuordnung `20261120-1.4`, Stationskatalog, Startzustand, Saisonzeilen 2023–2026). Nichts geschrieben außer in diesem Repo und im Zwischenspeicher.

### 3h.0 Schritt 0 — was auf dem Runner steht (23.11. 21:26 UTC)

Der erste Lauf mit beiden Schaltern ist noch nicht gelaufen (Cron 23:20 UTC; eine andere Sitzung liest ihn, §3f.8 / §3g.8). `glacier/v1/status.json`: **keine Zeile `lines.snowpack`**; `lines.melt` = Lauf 17:23 UTC (`2026112317`, 2 094 Gletscher, 143 s, `precip: country`, ohne `state`). Unter `snowpack/` liegt nur der Startzustand (`4ae73e46`), **null Laufdokumente**; `melt/state.json` hat noch die alte Form (212 692 Bytes). Alles, was einen Lauf von buscosun Fusion mit Schneedecke braucht, ist deshalb in dieser Diagnose nicht gemessen.

### 3h.1 Womit gemessen wird, wenn es noch keinen Schattenlauf gibt

Der Startzustand ist eine Rechnung vom 1.10. bis 23.11. 17:00 UTC mit derselben Schrittfunktion wie der Producer (Faktor je Land, 96 kg/m³), angetrieben von Analysen (INCA in Österreich, Tagesgitter in der Schweiz, die zwei fehlenden Schweizer Tage aus Wetterläufen von buscosun Fusion). Die Sonde rechnet diese Bahn mit den Lesefunktionen des Einschwing-Werkzeugs selbst nach (über einen erzeugten Shim, nur Importpfade geändert; die zwei Schweizer Tage, die beim Bau fehlten, bleiben draußen) und zeichnet die letzten 72 Stunden auf. **Gültigkeit belegt: der Endzustand der Sonde ist an allen 2 084 Gletschern Byte für Byte der eingespielte Startzustand.** Gemessen wird also die Schneedecke, mit der das Schattenprodukt beginnt — mit Analyse-Antrieb, nicht mit dem Antrieb von buscosun Fusion.

Modell in der Höhe der Station: linear zwischen den zwei benachbarten der drei Höhen; unter der Zunge der Wert der Zunge, über der Oberkante der der Oberkante (keine Hochrechnung). Station: nur angenommene Werte der Linie, Stempel höchstens 60 min vor der Stunde.

### 3h.2 (a) Was die Stationen über einen Gletscher sagen können — Messung M-6

| | Wert |
|---|---|
| Gletscher mit Schneestation (Zuordnung `20261120-1.4`, Abschnitt `ext`) | **469 von 2 094**; 92 verschiedene Stationen; ein Paar fällt weg (Gletscher ohne geordnete Höhen) ⇒ 468 Paare |
| je Land | Österreich 133 Paare (29 Stationen), Schweiz 335 (64), Deutschland 0 |
| je Netz | IMIS 334 · Tirol 98 · TAWES (`at`) 26 an drei Stationen (Pitztaler Gletscher, Dachstein, Sonnblick) · Südtirol 8 · SwissMetNet 2 |
| „Änderung der Schneehöhe“ (`hsd`, nur Tirol, wie geliefert) | 102 Gletscher |
| Lage der Station zum Gletscher | **322 von 468 Paaren unter der Zunge**, 27 über der Oberkante, 119 dazwischen; Höhe der Station gegen die Medianhöhe p10 / Median / p90 −566 / −293 / +46 m; Abstand zum Umriss Median 3,1 km, p90 4,7 km |
| Höhe | keine Schneestation ab 3 000 m außer Schnals Teufelsegg (3 035 m) und Sonnblick (3 109 m); IMIS-Schneestationen enden unter 3 000 m (§2.2 von `gletscher-imis.md`) |
| Alter und Prüfung | an der Stunde T (23.11. 17 UTC) haben alle 468 Paare einen Wert; in 105 Slots verwarf die Linie 87-mal eine Schneehöhe als `stale`, sonst nichts |
| Geschichte | Tirol, Südtirol, TAWES ab 21.11. 08 UTC in der Kopie; **IMIS erst seit dem Push von GI (22.11.)** — eine 48-h-Änderung gibt es in der Schweiz an einem Paar |

Vergleichbar ist überhaupt nur die Schneehöhe und ihre Änderung. Wasserwert, Dichte und Neuschnee misst keine der Linien (IMIS `HN_1D` ist ein Modellwert, E-GI-3).

**Befund aus der Kopie, nicht aus der Messregel:** exponierte Stationen VERLIEREN während des Schneefalls 20.–23.11. Schnee, geschützte gewinnen. Schneehöhe alle 6 Stunden von 21.11. 08 UTC an:

| Station | Höhe | Verlauf (cm) |
|---|---|---|
| Schnals Teufelsegg (`bz`) | 3 035 m | 59 · 50 · 44 · 41 · 42 · 43 · 32 · 24 · 25 |
| Dachstein-Schladminger Gletscher (`at`) | 2 520 m | 28 · 28 · 16 · 13 · 13 · 16 · 11 · 8 · 7 |
| Sonnblick (`at`) | 3 109 m | 44 · 52 · 45 · 41 · 36 · 38 · 34 · 44 · 34 |
| Grimsel Hospiz (`ch`) | 1 980 m | — · — · — · 45 · 46 · 59 · 89 · 96 · 99 |

Eine Station auf Grat oder Gipfel misst Windumlagerung, nicht Schneefall. Die Linie weiß nicht, welche Station ein Messfeld ist (die IMIS-Typen `SNOW_FLAT`/`WIND` stehen nicht im Katalog der Linie). V-GM-55.

### 3h.3 (b) Berechnet gegen gemessen — Messung M-7

Stand zu T = 23.11. 17 UTC (Modell in der Höhe der Station, mit Faktor je Land; Verhältnis nur für Station ≥ 5 cm):

| | Paare / Stationen | Station (Median) | Modell (Median) | Abweichung im Mittel / Betrag | Verhältnis (Median) | r |
|---|---|---|---|---|---|---|
| alle | 468 / 92 | 59,3 cm | 112,3 cm | +54,2 / 56,2 cm | **1,86** | 0,74 |
| Österreich | 133 / 29 | 34,2 | 99,0 | +68,4 / 68,4 | 2,76 | **−0,08** |
| Schweiz | 335 / 64 | 66,6 | 117,6 | +48,5 / 51,4 | 1,70 | 0,82 |
| 2 000–2 499 m | 147 / 48 | 59,3 | 118,1 | +57,2 / 57,4 | 1,98 | 0,84 |
| ab 2 500 m | 317 / 41 | 58,2 | 105,8 | +53,2 / 56,2 | 1,80 | 0,71 |
| Station unter der Zunge | 322 / 86 | 59,3 | 109,7 | +53,5 / 55,5 | 1,94 | 0,81 |
| Station zwischen Zunge und Oberkante | 119 / 41 | 67,6 | 112,2 | +46,4 / 48,2 | 1,55 | 0,74 |

Änderung über 24 Stunden (22.11. 17 → 23.11. 17 UTC); „Ereignis“ = Station ≥ +3 cm:

| | Paare / Stationen | Station | Modell | Abweichung / Betrag | Verhältnis bei Ereignissen | r |
|---|---|---|---|---|---|---|
| Ereignisse alle | 362 / 71 | +17,1 cm | +13,1 cm | −3,9 / 8,0 cm | **0,76** | 0,59 |
| Ereignisse Österreich | 72 / 19 | +11,2 | +7,6 | −5,4 / 6,2 | 0,66 | 0,10 |
| Ereignisse Schweiz | 290 / 53 | +20,9 | +15,4 | −3,5 / 8,4 | 0,79 | 0,57 |
| Ereignisse 2 000–2 499 m | 136 / 41 | +21,6 | +22,8 | +0,1 / 7,0 | 1,07 | 0,55 |
| Ereignisse ab 2 500 m | 222 / 27 | +11,2 | +9,2 | −6,1 / 8,4 | 0,59 | 0,59 |
| Tirol, gelieferte `HSD24` / `HSD48` / `HSD72` | 98 / 23 | +8,0 / +8,4 / +7,5 | +5,7 / +11,5 / +14,9 | −1,1 / +2,6 / +4,8 | 0,69 / 1,02 / 1,21 | 0,43 / 0,53 / 0,62 |

Treffer: an 99 % der 362 Ereignis-Paare zeigt das Modell mindestens +1 cm. Ruhe-Paare (|Änderung| < 1 cm) gab es in diesem Fenster nur 7 an 2 Stationen.

**Urteile nach der eingefrorenen Regel** (vom Skript gerechnet):

| Behauptung | Wert | Urteil |
|---|---|---|
| B1 — der Stand trägt den Gletscher-Faktor (V-GM-33), Verhältnis in [1,5; 3,0] | 1,86 | **bestätigt** |
| B2 — die Änderung bei Ereignissen trägt den Faktor ebenfalls (F̄ = 1,90) | 0,76 | **„eins zu eins“** — sie trägt ihn NICHT |
| B3 — das Modell sieht die Ereignisse (Trefferquote ≥ 0,8) | 0,99 | **ja** |
| B4 — Setzung ohne Schneefall stimmt auf ±1 cm (V-GM-38) | 7 Paare | **zu wenig** |

Lesart:
- **Der Stand ist nicht koppelbar.** Er steht um den Faktor (Schweiz 1,7, Österreich 2,8) über den Stationen — gewollt, weil der Faktor die Winterbilanz auf dem Eis meint (V-GM-33). Ein Zug zum Stationsstand würde genau den Faktor wieder herausnehmen. In Österreich ordnet der Stand die Stationen nicht einmal (r = −0,08; V-GM-48).
- **Die Änderung bei Schneefall liegt beim 0,8-fachen der Station, obwohl der Faktor 1,9 darin steckt.** Nach 48 und 72 Stunden (nur Tirol) liegt sie beim 1,0- bzw. 1,2-fachen. Rechnerisch (0,76 / 1,9, ohne die Setzung) läge es ohne Faktor bei rund 0,4 der Station. Zwei Ursachen sind nicht zu trennen: der Niederschlag der Analysen (und an den zwei Schweizer Lückentagen der von buscosun Fusion) war für dieses Ereignis zu klein, oder die Dichte von 96 kg/m³ ist für frischen Schnee an Stationen zu hoch (gemessen 52–81, §3a). In beiden Fällen gilt: **eine Kopplung der Änderung in Zentimetern verschiebt Niederschlag und Dichte gemeinsam** (V-GM-50).
- Das ist EIN Ereignis (eine Wetterlage, zwei Tage, ein Antrieb aus Analysen). Für eine Kopplung mit dem Antrieb des Betriebs (buscosun Fusion) ist nichts gemessen.

### 3h.4 (c) Was gekoppelt werden darf, ohne den Fehler der Station zu übernehmen

| Weg | Was die Messung dazu sagt | Urteil |
|---|---|---|
| Stand zum Stationsstand ziehen | nimmt den Faktor heraus (B1); Österreich ohne Ordnung (r ≈ 0) | **nein** |
| Änderung in cm übernehmen (Station ersetzt das Modell im Ereignis) | Verhältnis 0,76 bei einem Faktor von 1,9; Gratstationen verlieren beim Schneefall bis 35 cm (§3h.2) | **nein** — trägt Windumlagerung und den Dichtefehler auf den Gletscher |
| Verhältnis der Änderung je Station als Korrektur des Niederschlags (Faktor bleibt), mit Schrumpfung gegen 1 | ein Ereignis; je Station streut log(Modell/Station) p10 / Median / p90 −0,91 / −0,28 / +0,50 (Faktor 0,4 … 1,6); Niederschlags- und Dichtefehler vermischt | **erst nach Messung mit dem Antrieb des Betriebs** (mindestens fünf Ereignisse je Station, §3h.7) |
| Ereignis ja / nein (Zeitpunkt, Phase) | Trefferquote 0,99; Fehlalarme nicht messbar (7 Ruhe-Paare) | nichts zu korrigieren, solange keine Fehlalarme gemessen sind |
| nur messen: je Lauf das Paar Modell-in-Stationshöhe / Station festhalten (Schattenpaare, §7 Prüfprotokoll „täglich“) | Voraussetzung für jede der Zeilen oben | **ja** |

Die Daten tragen heute eine Messinfrastruktur, keine Kopplung.

### 3h.5 (d) Übertrag auf Gletscher ohne Station — Messung M-8 (leave-one-station-out)

Je Station die Abweichung (Median ihrer Paare), vorhergesagt aus den anderen Stationen (inverse Distanz bis R) und gegen „keine Korrektur“ gestellt:

| Größe | Stationen | ohne Korrektur | Median aller anderen | Median des Landes | R = 15 km | R = 30 km | R = 60 km |
|---|---|---|---|---|---|---|---|
| Stand (Modell − Station, cm) | 92 | 52,1 | 25,7 | 25,0 (92) | 24,6 (85) · Gewinn 0,50 | **21,0 (90) · 0,58** | 21,6 (91) · 0,58 |
| Änderung bei Ereignissen, log(Modell/Station) | 71 | 0,50 | 0,46 | 0,48 (71) | 0,45 (63) · 0,02 | **0,41 (70) · 0,18** | 0,43 (71) · 0,15 |

B5 nach der Regel: Stand **„trägt“**, Änderung **„trägt nicht“**. Lesart: beim Stand kommt der Gewinn fast ganz aus dem gemeinsamen Versatz (der Faktor) — der Median aller anderen Stationen holt schon 25,7 der 52,1 cm, die Nachbarn bis 30 km nur 4,7 cm mehr (V-GM-54). Die Änderung, also das, was man koppeln dürfte, lässt sich von Station zu Station nicht übertragen: der Fehler mit Nachbarn (0,41) ist kaum kleiner als ohne jede Korrektur (0,50). **Für 1 625 Gletscher ohne Schneestation gibt es nach dieser Messung keinen belegten Übertrag.** Ein Ereignis; mit mehr Ereignissen kann sich das ändern.

### 3h.6 (e) Satelliten-Abgleich einmal je Szene — Messung M-9

Heute (am Code gelesen, `melt.mjs` `mk` → `nudgeState`): jeder Schmelzlauf nimmt je Gletscher die jüngste Saisonzeile, sofern sie höchstens 20 Tage alt ist (`MELT_SAT_MAX_AGE_DAYS`), und setzt je Band unter der Schneegrenze den Schnee auf 0, darüber auf mindestens 250 mm (`MELT_SNOW_NUDGE_MM`) — in JEDEM Lauf neu, bis die Szene 20 Tage alt ist; mit GM-3d nach dem Nachrechnen. Der Zustand merkt sich nicht, welche Szene schon gegriffen hat. „Einmal je Szene“ braucht im Zustand je Gletscher das Datum der zuletzt angewandten Zeile (beim Schmelzzustand in der Form von GM-3d ein Feld neben `g`/`pend`), und die Regel „nur eine Zeile, die jünger ist als die zuletzt angewandte“.

Die Regel des Schmelzlaufs auf die Schneedecke zu T angewandt (Wasserwert je Band linear zwischen den drei Höhen):

| | Gletscher |
|---|---|
| mit Saisonzeile | 921 |
| mit Satellitenklasse und Zeile ≤ 20 Tage (Alter der jüngsten Zeile an Gletschern mit Satellitenklasse p10 / Median / p90: 2,2 / 9,2 / 42,2 Tage) | 597 |
| davon würde die Regel ändern | **477** |
| … Schnee gesetzt (mindestens 250 mm) | 309 |
| … Schnee gelöscht (auf 0) | **349** |
| Änderung an der Medianhöhe p10 / Median / p90 | 0 / 0 / +78 mm |

Explorativ dazu: von den Zeilen bis 20 Tage tragen im November 466 den Zustand „Schneegrenze“ (356 davon ohne Höhe, Klasse B — die Grenze folgt aus dem Schneeanteil), 159 „schneebedeckt“, 10 „schneefrei“; die meisten sind vom 14. und 15.11., also VOR dem Schneefall vom 20.–23.11. Beispiel Griesgletscher: Szene 14.11., Grenze 2 491 m, die Zunge liegt bei 2 445 m — die Regel löschte dort die Schneedecke von heute.

Lesart: **die Schneedecke soll den Abgleich nicht übernehmen.** Er weiß nur „Schnee ja/nein“ je Band zu einem vergangenen Tag und überschreibt Masse, die der Kern seither gerechnet hat; an 349 Gletschern würde er Schnee löschen, der nach der Szene gefallen ist. Für den Schmelzlauf bleibt „einmal je Szene“ richtig (M-18): heute löscht dieselbe Szene bis zu 20 Tage lang in jedem Lauf wieder, was der Lauf dazwischen an Schnee gerechnet hat. Ob eine Szene älter als der letzte Schneefall noch greifen darf, ist eine zweite Regel (V-GM-49).

### 3h.7 (f) Wie viele Schattenläufe die Messung braucht

- Das Laufdokument trägt die Schneehöhe der drei Höhen zur Laufstunde; der Zustand steht an der Laufstunde und rechnet jede Stunde mit der jüngsten Vorhersage. Aus Dokumenten, die 24 Stunden auseinanderliegen, ergibt sich die Änderung mit dem Antrieb des Betriebs. Der Schmelzlauf rechnet höchstens viermal am Tag.
- **Schätzung, nicht gemessen:** für ein Verhältnis je Station mit Schrumpfung braucht es mindestens fünf Ereignisse je Station und ebenso viele trockene Tage (für V-GM-38); bei ein bis zwei Schneefällen je Woche sind das drei bis sechs Wochen. Das Prüfprotokoll (§7) nennt mindestens 14 Tage.
- **72 Stunden im Daten-Repo reichen nicht**: die Laufdokumente unter `snowpack/` werden nach 72 h gelöscht, die Stationsslots ebenso, und nichts davon wird archiviert (die Slots stündlich seit 21.11. in `buscosun-archiv`, die Schneedecke gar nicht, GM-6). Die Paare müssen also in jedem Lauf gebildet und aufbewahrt werden — von Hand kopieren reißt Lücken (V-GM-53). Der Workflow holt `glacier/` ganz in die Lesesicht: der Producer hat den Slot seiner Laufstunde vor sich und kann das Paar selbst bilden.

### 3h.8 (g) Der Startzustand

Der eingespielte Startzustand trägt alle 2 084 Gletscher mit geordneten Höhen (§3f.8) — V-GM-40 betrifft erst den nächsten Katalog-Build. Die Schweiz kommt aus dem Tagesgitter (nie INCA, V-GM-34); die gleichmäßige Verteilung des Tages auf 24 Stunden macht die 24-h-Änderung in der Schweiz in diesem Ereignis nicht schlechter als in Österreich (0,79 gegen 0,66). Eine Kopplung ändert den Startzustand nicht; ein neuer Startzustand mit Kopplung ist nicht vorgesehen.

### 3h.9 (h) Was das Produkt dann sagt

Jeder Wert der Schneedecke bleibt `computed`, nie `measured`; „berechnet, noch nicht nachgemessen“ bleibt bis zur Abnahme (GM-8). Ein Paar nennt die Station mit Netz, Abstand zum Umriss, Höhenunterschied zur Medianhöhe und zur nächsten der drei Höhen, die Lage (unter der Zunge / dazwischen / über der Oberkante), das Alter des Stationswerts und trägt den Stationswert als das, was er ist (gemessen, aus der Linie zitiert). Ein künftig gekoppelter Wert nennt dieselben Angaben und den Betrag der Korrektur.

### 3h.10 Entscheidungen für Jan (vor dem Code)

| Nr. | Frage | Empfehlung |
|---|---|---|
| E-GM-20 | Was GM-4 jetzt baut: **(A)** nur Schattenpaare — der Producer schreibt mit der Schneedecke je Lauf eine kleine Datei `snowpack/pairs/<lauf>.json` (je Gletscher × Schneestation: Modell in Stationshöhe, Station mit Alter, Abweichung, Lage), hinter einem eigenen Schalter (aus), die Schneedecke selbst unverändert; Kopplung erst nach der Messung mit dem Antrieb des Betriebs (GM-4b) · **(B)** zusätzlich eine Kopplung der Änderung je Station (Korrektur des Niederschlags, Schrumpfung gegen 1), hinter einem Schalter (aus) · **(C)** nur die Diagnose | **(A)** — die Messung trägt keine Kopplung (§3h.4) |
| E-GM-21 | Aufbewahrung für die Messung: **(A)** Paar-Dateien täglich ins Archiv `buscosun-archiv` (Workflow-Änderung im Archiv-Repo, dein Gate) · **(B)** Paar-Dateien UND Laufdokumente der Schneedecke archivieren (≈ 0,3 MB gepackt je Lauf) · **(C)** ich kopiere von Hand | **(A)** — klein, und die Laufdokumente sind aus Zustand + Paaren nicht nötig für die Kopplungsfrage |
| E-GM-22 | Satellit: **(A)** die Schneedecke nimmt den Abgleich nicht; der Schmelzlauf gleicht hinter einem Schalter (aus) nur noch einmal je Szene ab (Datum der angewandten Zeile im Zustand) · **(B)** auch die Schneedecke gleicht einmal je Szene ab · **(C)** so lassen | **(A)** — §3h.6: an 349 Gletschern würde er Schnee löschen, der nach der Szene gefallen ist |
| E-GM-23 | Übertrag auf Gletscher ohne Station: **(A)** keiner in GM-4, die Zeile sagt nichts über eine Kopplung · **(B)** Median des Landes · **(C)** Nachbarn bis 30 km | **(A)** — die Änderung überträgt sich nicht (Gewinn 0,18), beim Stand ist es nur der Faktor (§3h.5) |

### 3h.11 Befunde aus der Diagnose

| Nr. | Inhalt | Mehrwert · Skizze | Stand |
|---|---|---|---|
| V-GM-48 | In Österreich ordnet der Stand der Schneedecke in Stationshöhe die Stationen nicht (r = −0,08, 133 Paare an 29 Stationen; Schweiz 0,82) | ob die Unterschiede zwischen österreichischen Gletschern echt sind · je Gletscher gegen SNOWGRID (r) und gegen die INCA-Zelle der Station statt des Gletscherpunkts; die Temperaturverschiebung (§3f.1 D, ±2 K) als Ursache prüfen | offen |
| V-GM-49 | Der Satelliten-Abgleich wendet Szenen bis 20 Tage an, auch wenn seither Schnee gefallen ist (Griesgletscher: Szene 14.11. löscht die Zunge nach dem Schneefall vom 20.–23.11.) | kein gelöschter Neuschnee im Schmelzindex · einmal je Szene (E-GM-22) und eine Szene nur, wenn seither kein Schneefall gerechnet ist | E-GM-22 |
| V-GM-50 | Die 24-h-Änderung bei Schneefall liegt beim 0,76-fachen der Station, der Stand beim 1,86-fachen: Niederschlag und Neuschneedichte (96 gegen gemessen 52–81 kg/m³) sind in Zentimetern nicht zu trennen | eine Kopplung, die nicht die Dichte als Niederschlag verbucht · Wasserwert des Neuschnees an den SLF-Messfeldern (Q6, `HN_1D` dort gemessen) neben die Höhenänderung stellen | offen; Dichte-Teil gemessen in GM-9 (§3m.8: 96 im Mittel nicht zu dicht, die 52–81 waren Messer-Wasser); Rest über die Schattenpaare ab 25.11. 17 UTC (V-GM-107) |
| V-GM-51 | Im Fenster 20.–23.11. gab es nur 7 Ruhe-Paare: die Setzung ohne Schneefall (V-GM-38) bleibt ungemessen | verlässliches „Neuschnee 72 h“ · aus den Schattenpaaren der nächsten trockenen Tage | offen |
| V-GM-52 | IMIS-Schneehöhen stehen erst seit dem Push von GI (22.11.) in den Slots; die Schweiz hat keine 48-h-Änderung | — · wächst von selbst; die Ablage stündlich trägt sie seit dem Push | erledigt sich |
| V-GM-53 | Laufdokumente der Schneedecke und Stationsslots verschwinden nach 72 h; keiner von beiden ist für die Schneedecke archiviert | eine Messung über Wochen ohne Lücken · Paare im Lauf bilden und archivieren (E-GM-20, E-GM-21) | E-GM-21 |
| V-GM-54 | Der Übertrag des Stands auf Nachbarn ist fast nur der gemeinsame Versatz (Median aller 25,7 cm, Nachbarn bis 30 km 21,0 cm, ohne Korrektur 52,1 cm) | keine Scheinkopplung, die nur den Faktor zurücknimmt · keine | Hinweis |
| V-GM-55 | Gipfel- und Gratstationen verlieren beim Schneefall Schnee (Teufelsegg 59 → 24 cm, Dachstein 28 → 7 cm in 60 h), die Linie kennt die Art des Standorts nicht | eine Kopplung, die keinen Windabtrag auf den Gletscher überträgt · Standortart aus dem SLF-Katalog (`type`) in den Stationskatalog der Linie (Änderung an der Stationslinie, Jans Wort), für die anderen Netze eine gemessene Kennung „verliert bei Schneefall der Nachbarn“ in den Paaren | offen |

Nicht gemessen: alles mit dem Antrieb von buscosun Fusion (kein Schattenlauf); mehr als ein Ereignis; trockene Tage; die Wahrheit auf dem Eis; Deutschland (keine Schneestation an den vier Gletschern).

### 3h.12 Jans Entscheidungen (23.11. abends, nach der Diagnose, vor dem Code)

| Nr. | Entscheidung (Jan) | Folge im Bau |
|---|---|---|
| E-GM-20 | **Nur Schattenpaare** (Empfehlung) | Schalter `--snowpack-pairs=off\|on`, Datei `snowpack/pairs/<lauf>.json`; die Schneedecke selbst unverändert, keine Kopplung (GM-4b erst nach der Messung) |
| E-GM-21 | **Paare ins Archiv** (Empfehlung) | `glacier-archive.mjs --pairs`, Vorlage `workflow-glacier-archiv.yml` nachgezogen; das Einspielen in `buscosun-archiv` ist Jans Gate |
| E-GM-22 | **Schmelzlauf einmal je Szene** (Empfehlung) | Schalter `--sat-nudge=every\|once` im Schmelzlauf; die Schneedecke nimmt den Abgleich nicht (sie hat ihn nie genommen — gebaut ist nichts daran) |
| E-GM-23 | **Kein Übertrag** (Empfehlung) | nichts gebaut; Paare gibt es nur für Gletscher mit Schneestation |

### 3h.13 Umsetzung

| Datei | Was |
|---|---|
| `src/glacier/glacierSnowpackPairsContract.ts` (neu) | Vertrag der Paare: Pfad `snowpack/pairs/<lauf>.json`, Zeitfenster 60 min davor / 15 min danach (`set`), Lage `below`/`inside`/`above`, Gründe ohne Wert `no-value`/`stale`/`future`, Vermerk „Vergleich, keine Kopplung …“, Herkunft je Feld (`m`, `hn` = `computed`; `v`, `hsd` = `measured`), `snowpackPairsProblems`. Kein Import in der Seite |
| `scripts/glacier/lib/snowpackcore.mjs` | `SNOWPACK_PAIRS_MODES`, `SNOWPACK_PAIRS_DEFAULT = 'off'`, `snowpackPairsModeOf`; `atElevation` (linear zwischen den zwei Nachbarhöhen, außerhalb der Wert der nächsten Höhe, nie hochgerechnet); `pairsOf` (liest nur den Abschnitt `ext` der Zuordnung, wirft ohne ihn) |
| `scripts/glacier/lib/meltstate.mjs` | `SAT_NUDGE_MODES`, `SAT_NUDGE_DEFAULT = 'every'`, `satNudgeModeOf`, `satRowDue` |
| `scripts/glacier/melt.mjs` | Schalter `--snowpack-pairs` / `GLACIER_SNOWPACK_PAIRS` (nur mit der Schneedecke gelesen) und `--sat-nudge` / `GLACIER_SAT_NUDGE` (gelesen, bevor etwas gelesen oder geschrieben wird); `writeSnowpackPairs` (Zuordnung aus `index.stations.map`, Slot der Laufstunde, sonst der Stunde davor; prüft gegen den Vertrag vor dem Schreiben); Paare nur nach geschriebener Schneedecke, ein Fehler nennt den Grund in `lines.snowpack.pairs`; mit `once`: Vermerk je Gletscher im Zustand (`sat`), Dokument `state.sat` { applied, held }, Statuszeile `sat: once` |
| `src/glacier/glacierMeltContract.ts` | Typ `sat` an Zustandsdatei und Dokument; `meltStateProblems` prüft einen vorhandenen Vermerk (Datum, Gletscher mit Zustand). Kein Byte im Bundle |
| `scripts/glacier/glacier-publish.mjs` | Aufbewahrung `snowpack/pairs/` 72 h (wie die Laufdokumente) |
| `scripts/glacier/glacier-archive.mjs` | `archivePairs` hinter `--pairs`: je Lauf `pairs-<lauf>.json.gz` unter dem Tag des Laufs, nur Hinzufügen, ein Dokument gegen den Vertrag wird nicht abgelegt und genannt; ohne `--pairs` wie bisher |
| `scripts/glacier/gen-workflows.py` + `workflow-glacier-archiv.yml` | Vorlage: Lesesicht zusätzlich `/glacier/v1/snowpack/pairs/`, Aufruf mit `--pairs`; die anderen Vorlagen unverändert (neu erzeugt, kein Unterschied). Ein älteres Skript überliest `--pairs` |
| `scripts/glacier/make-snowpack-pairs-fixture.mjs` (neu), `scripts/lib/fixtures/glacier/snowpack-pairs.json` (neu) | Fixture aus der Kopie der Stationslinie (Zuordnung `20261120-1.4`, Slot `2026112321`): Tirol Adamsberg (2 431 m, mit `hsd`), IMIS Engstligenalp (2 304 m), Südtirol Schnals Teufelsegg (3 035 m), IMIS Bortelsee (2 517 m, in dieser Stunde ohne Schneehöhe) — Einträge wie geliefert |
| `scripts/verify-glacier-snowpack.mjs` | Block H (H1–H7), G1 um Vertrag und Fixture-Werkzeug erweitert |
| `scripts/verify-glacier-melt.mjs` | Block J (J1–J5) |
| `audit/gletscher-schneemodell/gm4-*` | Messregel + Hash, Sonde, Auswertung der Vollläufe, Gegenprobe |

Nicht angefasst: buscosun Fusion, die Stationslinie (`stations.mjs`, `glacierStationContract.ts` nur importiert), `snowcore.mjs`, `meltcore.mjs`, Workflows, Daten- und Archiv-Repo, die Seite.

### 3h.14 Messung am vollen lokalen Lauf

Aufbau `C:\dev\buscosun-glacier-cache\gm4-run.ps1` (Cube und Lesesicht wie GM-3c/GM-3d, `--now=2026-11-21T17:50:00Z --always`; für die Paare eine Lesesicht mit der Stationslinie der Kopie — Zuordnung `20261120-1.4`, Slots 21.11. 16/17 UTC — und dem Startzustand vom 21.11. 17 UTC), Auswertung `gm4-analyse.mjs` → `gm4-analyse.json`, Vergleich Byte für Byte mit `C:\dev\buscosun-glacier-cache\gm4\cmp-tree.mjs`.

| Vergleich | Ergebnis |
|---|---|
| Referenz zuerst geprüft: Lauf von HEAD `dc982141` ohne Schalter gegen `gm32\off` | **338 von 338** gleich |
| neuer Code ohne Schalter gegen `gm32\off` | **338 von 338** gleich |
| neuer Code ohne Schalter auf der Lesesicht mit Stationslinie gegen den Lauf ohne sie | 30 von 30 gemeinsamen Dateien gleich (die Lesesicht trägt keine alten Läufe, daher keine Kopien) |
| `--snowpack=shadow` gegen ohne Schalter (dieselbe Lesesicht) | 30 gleich, dazu `snowpack/2026112117.json` und `snowpack/state.json` |
| **`--snowpack=shadow --snowpack-pairs=on` gegen `--snowpack=shadow`** (Negativkontrolle der Paare) | **32 von 32 gleich**, dazu genau `snowpack/pairs/2026112117.json`; Zeiger-Patch gleich, Status-Patch anders (nur `lines.snowpack.pairs`) |
| **`--sat-nudge=once` gegen ohne Schalter** (Negativkontrolle) | 336 von 338 gleich; anders `melt/2026112117.json` (nur `state.sat`: alle 2 094 Zeilen gleich) und `melt/state.json` (Vermerk an 606 Gletschern) |

Die Paare am echten Katalog (Lauf `2026112117`): 468 Paare, 79 899 Bytes; **mit Wert nur 133** — 335 IMIS-Paare sind `no-value`, weil IMIS am 21.11. noch nicht in den Slots stand (V-GM-52); `hsd` an keinem Paar (Tirol liefert es erst seit GI). Alter der Werte p10 / Median / p90 −10 / 0 / +10 min. Modell / Station im Median 2,8 (Tirol 2,8, TAWES 3,6, Südtirol 1,7; Station über der Oberkante 3,7, dazwischen 1,8) — dieselbe Größenordnung wie M-7 in Österreich (2,76).

Kette des Satelliten-Schalters am echten Katalog (Lauf A 21.11. 23 UTC, B drei Stunden später, beide `run-hour`, ohne Wetterteil): mit `every` greift die Szene in B an 337 Gletschern wieder, mit `once` an keinem (606 gehalten). **Alle 2 094 Gletscherzeilen von B sind in beiden Wegen gleich**, die Kachel „Fläche ohne Schneedecke“ ebenso (12,5 %): in diesen drei Stunden fiel unter den Schneegrenzen der Szenen nichts, das der erneute Abgleich hätte löschen können. Die Wirkung von `once` zeigt sich erst nach Schneefall unterhalb einer Szene (§3h.6, Griesgletscher) — am echten Katalog ist sie damit **nicht gemessen**, nur im Prüfer (J3). Zustandsdatei mit Vermerk 652 statt 626 KB roh. Laufzeiten 81–371 s je Lauf; die Läufe liefen teils neben Build und Prüfern, ein Laufzeitvergleich ist daraus nicht zu lesen.

### 3h.15 Gate (23.11. nachts)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snowpack` | **39/39** (vorher 31; Block H = 8 Prüfungen: Schalter, alle anderen Dateien Byte für Byte, Paar von Hand an echten Stationseinträgen samt Lage unter/zwischen/über (alle drei Gletscher mit Schnee aus einem Startzustand), die Höhe der Station rein an beiden Abschnitten (H3b), Zeitfenster 61/60/−15/−16 min, fehlende Eingänge ohne stillen Ersatz — auch „ohne Startzustand keine Paare“ —, Vertrag mit 17 Verletzungen, Publisher und Archiv) |
| `verify:glacier-melt` | **68/68** (vorher 63; Block J = 5 Prüfungen: Schalter rein, ohne Angabe = `every` Byte für Byte in beiden Zustandsformen, dieselbe Szene im nächsten Lauf von Hand, jüngere Szene / verworfener Zustand / Form `ahead`, Vertrag des Vermerks) |
| `verify:glacier-weather` · `-snowcal` · `-snowcore` · `-contract` · `-publish` · `-stations` | 41/41 · 37/37 · 24/24 · 64/64 · 34/34 · 77/77 |
| `npm run typecheck` | grün |
| `npm run build` · `npm run budget` | 281/281 · totalJs 2 118,1 / 2 121 KB, unverändert (kein Byte im Bundle) |
| Geschützte Pfade | `src/pointForecast`, `src/point`, `scripts/point`, `scripts/punktarchiv`: kein Unterschied (G11 in `verify:glacier-melt`) |
| Voller Lauf ohne Schalter | 338 von 338 Byte für Byte; Negativkontrollen mit Schalter §3h.14 |
| Gegenprobe `gm4-mutations.mjs` | 39 eingebaute Fehler in Kern, Schmelzlauf, Verträgen, Publisher und Archiv. **Erste Runde: 34 von 39 bemerkt** (Protokoll `C:\devuscosun-glacier-cache\gm4\mut1.log`). Übersehen: (1) Hochrechnung unter der Zunge und (2) „immer zwischen Zunge und Mitte“ — die Testgletscher mit Station unter der Zunge hatten keinen Schnee, und keine Station lag im oberen Abschnitt ⇒ alle drei Testgletscher bekommen Schnee aus einem Startzustand, dazu H3b (rein, beide Abschnitte); (3–5) „gehaltene Szene nicht gezählt“, „Vermerk nicht weitergetragen“, „Vermerk gilt auch für einen verworfenen Zustand“ — **ein Fehler in meinem Prüfer**: in Block I ist `same()` ein Vergleich von LAUFERGEBNISSEN (`docRaw`, `stateRaw` …), für einfache Werte also immer wahr; Block J nutzte ihn für `state.sat` und den Vermerk und war dort blind (V-GM-59) ⇒ eigener Wertevergleich `eq()` in Block J, danach weiter 68/68 (das Verhalten war richtig, nur ungeprüft). **Zweite Runde: 39 von 39 bemerkt, keiner nur als Abbruch, Prüfer danach grün** (`gm4-mutations.json`); `melt.mjs` danach Byte für Byte wie vor der Runde |

Die fünf Fragen: (1) Funktionserhalt — ohne Schalter jede Datei gleich, alle bisherigen Prüfungen unverändert grün; (2) Desktop pixelgleich — kein Byte im Bundle, nicht angesehen; (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige geändert.

Nicht geprüft: kein Lauf auf dem Runner; die Paare nur mit den Slots vom 21.11. (ohne IMIS, ohne `hsd`) am echten Katalog — mit IMIS nur im Prüfer; die Wirkung von `once` am echten Katalog (§3h.14); das Archiv nicht gegen ein echtes `buscosun-archiv` (nur die Funktion im Prüfer); die Vorlage des Archiv-Workflows ist nicht gelaufen; kein Browser; `verify:glacier-ui` (bricht an HEAD ab, V-GH-6).

**Gate GM-4 (GM-4a): Diagnose geschrieben, Jans Entscheidungen gebaut, beide Schalter aus. Ohne Schalter schreibt der Producer dieselben Bytes wie vorher.** Offen bei Jan: Commit, Push, das Einschalten beider Schalter und das Einspielen der Archiv-Vorlage (MANUELLE-SCHRITTE §121).

### 3h.16 Entscheidungen und Befunde aus dem Bau

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-20 … E-GM-23 | Schattenpaare · Archiv · Satellit einmal je Szene · kein Übertrag | **entschieden: Jan 23.11.** (§3h.12) |
| E-GM-24 | **Einschalten — wann und wie?** Zwei Zeilen im Workflow `glacier-melt` des Daten-Repos (`GLACIER_SNOWPACK_PAIRS: on`, `GLACIER_SAT_NUDGE: once`), jede für sich zurücknehmbar, ohne Code; dazu die Archiv-Vorlage nach `buscosun-archiv`. Empfehlung: zuerst Push, dann Archiv-Vorlage, dann die Paare (sie sammeln erst, wenn das Archiv sie aufhebt); `once` getrennt danach, damit zwei Neuerungen nicht im selben Lauf zusammenfallen | **Paare an: Jan 24.11.** (§3h.17); `once` offen |
| V-GM-56 | Die Paare tragen das Modell nur zur Laufstunde; eine Änderung über 24 h braucht zwei Läufe, die genau 24 h auseinanderliegen (der Schmelzlauf läuft unregelmäßig, höchstens viermal am Tag). Mehrwert: Änderungen ohne Lücken an der Taktung. Skizze: die Paare tragen zusätzlich das Modell zu Laufstunde − 24/48/72 h aus der Bahn des Zustands (der Lauf rechnet sie ohnehin nach), oder die Auswertung nimmt das Neuschnee-Fenster `hn` gegen `hsd` | offen |
| V-GM-57 | Bis die Archiv-Vorlage eingespielt ist, verschwinden die Paare nach 72 h. Mehrwert: keine Lücke am Anfang der Reihe. Skizze: die Vorlage vor dem Einschalten der Paare einspielen (§121) | §121 |
| V-GM-58 | Die Wirkung von `once` ist am echten Katalog nicht gemessen: in der einzigen lokal nachstellbaren Kette (21.11. 23 → 02 UTC) fiel nichts, was der Abgleich hätte löschen können. Mehrwert: ein Beleg, wie oft die Kachel „Fläche ohne Schneedecke“ heute nach einem Schneefall wieder springt. Skizze: nach dem Einschalten die Zählung `state.sat` gegen `nudged` an Läufen nach einem Schneefall lesen, oder den Cube eines Schneefall-Tags lokal nachstellen | offen |
| V-GM-59 | In `verify:glacier-melt` heißt der Vergleich von Laufergebnissen in Block I `same()` — auf einfache Werte angewandt ist er immer wahr (`undefined === undefined`). Block J lief zuerst so und war an drei Stellen blind; die Gegenprobe fand es. Mehrwert: kein grüner Prüfer, der nichts prüft. Skizze: den Laufvergleich in `sameRun()` umbenennen und für Werte überall einen eigenen Vergleich nehmen; ältere Blöcke daraufhin durchsehen | offen (Block J behoben) |
| V-GM-96 | In `buscosun-archiv` fehlt die Repo-Variable `GLACIER_PRODUCER_REF`; `glacier-archiv.yml` holt den Archivierer vom Zweig `feat/gletscher` (15.11.), der `--pairs` nicht kennt. Die eingespielte Vorlage allein legt deshalb kein Paar ab. Mehrwert: die Reihe der Paare reißt nicht nach 72 h. Skizze: die Variable auf `main` setzen (Jan, ein Klick) oder den Zweig löschen; dauerhaft die Voreinstellung in `gen-workflows.py` auf `main` drehen | **gesetzt am 24.11. 19:47 UTC auf Jans Wort („mache das … du hast die Berechtigung“): Repo-Variable `GLACIER_PRODUCER_REF = main` in `buscosun-archiv`, über die GitHub-API angelegt (201) und zurückgelesen; vorher 404.** Der nächste Archivlauf (25.11. 00:47 UTC) holt den Archivierer von `main` (`b448d652`, kennt `--pairs`) und legt die Paare der letzten 72 h nach — nachsehen: `glacier/v1/2026-11-24/pairs-2026112417.json.gz`. Zurück: die Variable löschen. **Belegt am 25.11. 01:00 UTC:** der Archivlauf `glacier-archiv` Nr. 177 (geplant 00:47, gestartet 00:55:36 UTC, grün, Archiv-Commit `f44316ef`) hat `pairs-2026112417.json.gz` (15 042 B) und `pairs-2026112423.json.gz` (24 035 B) nach `glacier/v1/2026-11-24/` gelegt; entpackt sind beide Byte für Byte die Dateien des Daten-Repos (77 075 und 103 448 B), die zweite trägt die Vorhersage (279 Paare mit Spanne). Im Daten-Repo liegen genau diese zwei Paar-Dateien ⇒ keine fehlt. **Erledigt** |
| V-GM-97 | Ein Schalter mit der Stellung `on` ist in YAML 1.1 ein Wahrheitswert; käme „true“ an, bräche der Producer mit „unbekannte Stellung“ ab und der ganze Schmelzlauf fiele aus. Mehrwert: kein Ausfall durch die Schreibweise einer Zeile. Skizze: in Workflows `'on'` immer in Anführungszeichen (so eingespielt); in §121/§123 dieselbe Schreibweise für die noch offenen Schalter | umgesetzt für die Paare |

### 3h.17 Einschalten der Schattenpaare (24.11., Jans Wort „kannst du das jetzt schon machen?“)

- **Archiv-Vorlage:** `buscosun-archiv` `6282016` (16:42 UTC). Unterschied zum vorher eingespielten Stand: zwei Kommentarzeilen, der Sparse-Pfad `/glacier/v1/snowpack/pairs/`, der Name des Schritts, `--pairs=…`; der Blob ist derselbe wie `scripts/glacier/workflow-glacier-archiv.yml` in `b448d652` (`874af0cd`).
- **Schalter:** `buscosun-data` `4bec681a` (16:42 UTC), eine Zeile `GLACIER_SNOWPACK_PAIRS: 'on'` mit drei Kommentarzeilen unter `jobs.melt.env`; nach dem Push vom Remote gelesen und als YAML geparst (Wert ist die Zeichenkette `on`). Die Vorlage `gen-workflows.py` ist nachgezogen, die erzeugte Datei ist gleich dem eingespielten Workflow.
- **Vorher geprüft:** der Workflow kopiert `glacier/v1` ganz in die Lesesicht (Zuordnung und Stationsslots liegen darin), der Publisher räumt `snowpack/pairs` nach 72 h; ein Fehler der Paare schreibt nur die Paar-Datei nicht.
- **Nicht getrennt:** der Lauf von 17:20 UTC ist der erste mit dem Producer `b448d652` (GM-5a, GM-5b, Schalter aus) UND der erste mit den Paaren. Die Paare haben eine eigene Statuszeile und einen eigenen Fehlerweg; eine Abweichung an Schneedecke oder Schmelzlauf ginge auf den neuen Producer.
- **V-GM-96 (Archiv-Variable):** gesetzt am 24.11. 19:47 UTC (Jans Wort); belegt am Archivlauf vom 25.11. 00:55 UTC (beide Paar-Dateien des 24.11. abgelegt, Byte für Byte wie im Daten-Repo) — erledigt.

**Beleg des ersten Laufs `2026112417`** (gelesen 24.11. 17:29 UTC, nur lesend, alle Dateien an EINEM Commit des Daten-Repos, `6b71ddd5` „glacier(melt): 2026-11-24T17:26Z“; Workflow-Lauf 45448000677, gestartet 17:23:18, grün 17:27:07 UTC; Werkzeug `gm5c-runner-read.mjs` → `gm5c-runner-2026112417.json`):

| Was | Befund |
|---|---|
| `status.json` `lines.snowpack.pairs` | `{ pairs: 468, withValue: 465, map: "20261120-1.5", slot: "2026112417", bytes: 77075 }` — kein `error`; `bytes` = Größe der Datei |
| `snowpack/pairs/2026112417.json` gegen den Vertrag | **kein Befund** (`snowpackPairsProblems` mit den Zeilen der Schneedecke desselben Laufs); `atMs` 17:00 UTC, `snowpack` { `country`, `board` }, Zuordnung und Slot wie in der Statuszeile und im Zeiger `index.stations` |
| Paare aus den eigenen Eingängen nachgerechnet (`pairsOf` auf den Zeilen von `snowpack/2026112417.json`, Zuordnung `20261120-1.5`, Slot `2026112417`) | **dieselben 468 Paare und dieselbe Zählung** (JSON-gleich) |
| Zählung | Lage: 322 unter der Zunge, 119 dazwischen, 27 über der Oberkante; 92 Stationen; ohne Zeile der Schneedecke zugeordnet: 1. Netze: IMIS 334, Tirol 98, TAWES 26, Südtirol 8, SMN 2 |
| **Mit Stationswert: 465 von 468** (erwartet „weit über 133“) | IMIS 334 von 334, TAWES 26, Südtirol 8, SMN 2, Tirol 95 von 98. Ohne Wert: 3 Paare EINER Tiroler Station, Stempel 70 min vor der Laufstunde ⇒ `stale` (Fenster 60 min) — benannt, kein Wert erfunden |
| Alter der Werte | p10 / Median / p90: 0 / 0 / 0 min |
| Gelieferte Änderung der Schneehöhe (`hsd`) | an allen 98 Tiroler Paaren (am 21.11. an keinem) |
| Modell / Station (465 Paare mit Stationswert ≥ 5 cm), Median | **1,92** — die Größenordnung der Diagnose (M-7: 1,86 im Stand); keine Kopplung, nur gelesen |
| Schneedecke `snowpack/2026112417.json` | Vertrag ohne Befund; 2 084 Zeilen (957 eigener Antrieb, 1 127 Nachbar), 10 übersprungen; Zustand `carried`, 6 h alt, 6 h nachgerechnet, keiner neu begonnen; `rules.spread: "none"`; buscosun Fusion 14; Zustandsdatei an 17:00 UTC, 2 084 Gletscher, Vertrag ohne Befund; gegen den Lauf `2026112411` Schneehöhe an der Medianhöhe p10 / Median / p90 −1,6 / −0,8 / −0,4 cm (Setzung, kein Sprung) |
| Schmelzlauf `melt/2026112417.json` | Vertrag ohne Befund; 2 094 Zeilen, 0 übersprungen; Zustand `carried`, `run-hour`, 6 h nachgerechnet, 0 gehalten; `precip: country`, **kein Block `glaciers`** (GM-5b aus), kein `state.sat` (`once` aus); Zustandsdatei an 17:00 UTC mit Antrieb, ohne `sat`; 163 s |
| Der neue Producer `b448d652` | Schneedecke ohne Spanne, Schmelzlauf ohne Gletscher-Tabelle: beide neuen Rechenwege sind aus, wie eingestellt; Abweichung an Schneedecke oder Schmelzlauf: keine gefunden |
| **Archiv (V-GM-96)**, gelesen 17:24 und 19:20 UTC | um 17:24 UTC keine `pairs-*.json.gz` (der letzte Archivlauf war 12:49 UTC, vor dem Einschalten). **Der Archivlauf von 18:48 UTC (grün) hat `melt-2026112417.json.gz` abgelegt und KEINE `pairs-2026112417.json.gz`**, obwohl die Paar-Datei im Daten-Repo liegt ⇒ V-GM-96 ist bestätigt: der Archivierer kam vom alten Zweig, die Repo-Variable fehlte. **Seit 19:47 UTC ist sie gesetzt (`main`, Jans Wort);** die Paare dieses Laufs liegen bis 27.11. 17 UTC im Daten-Repo, der Archivlauf von 00:47 UTC am 25.11. sollte sie nachlegen (noch nicht gesehen) |

Nicht geprüft: ein Lauf im 3-Stunden-Abstand; ein Lauf, dessen Stationsslot noch fehlt (Slot der Stunde davor); die 24-h-Änderung (dafür braucht es den Lauf von morgen 17 UTC).

## 3i. GM-5: Verteilung, Szenarien und Spannen (23./24.11.)

Die Diagnose steht vollständig in `audit/gletscher-schneemodell/gm5-diagnose.md` (Messregel `gm5-method-frozen.md`, Werkzeuge `gm5-*.mjs`); hier das Ergebnis, Jans Entscheidungen, die Kostenmessung und der Bauplan.

### 3i.1 Ergebnis der Diagnose

- **Verteilung aus Sentinel-2: die Daten tragen sie nicht.** Die Saisonzeilen haben je Szene eine Schneegrenze, kein Feld je Höhenband; daraus folgt nur die Höhenfolge (205 von 205 Saisons). Der Zuschlag gewinnt −0,2 % gegen „linear zwischen drei Höhen“ an 300 Gletscherwintern (Urteil des Skripts: „trägt nicht“, gleichauf mit der Negativkontrolle).
- **Eine beständige Verteilung je Stufe gibt es:** die Stufenwerte von GLAMOS/WGMS sagen sie aus anderen Wintern mit 21 % weniger Formfehler voraus (CH 24 %, AT 6 %) — für die 44 vermessenen Gletscher.
- **Spannen:** die Schneedecke hat keine. Größte Unsicherheit ist der Faktor (σ_lnF 0,25 ⇒ ×0,73 … ×1,37, systematisch); die Neuschneedichte ist überwiegend zufällig je Ereignis (σ 0,32), zu rund einem Drittel systematisch (σ 0,12).
- **Zweite Woche (V-GM-41):** der Erwartungswert meldet an 99,98 % der Tage Neuschnee; im Wetterteil ist an 97 % dieser Tage „kein Schneefall“ das untere Ende der Szenarien.

### 3i.2 Jans Entscheidungen (24.11.)

| Nr. | Entschieden |
|---|---|
| E-GM-30 | Verteilung aus Sentinel-2 **nicht bauen**; die Erweiterung der Satellitenlinie je Band bleibt eine Idee (V-GM-71) |
| E-GM-31 | Verteilung je Band aus den Stufenwerten, 44 Gletscher, im Schmelzlauf hinter Schalter — **ja, in EINER Eichrunde mit E-GM-9 (Faktor je Gletscher: ja), E-GM-10 (Winterschmelze wie im Betrieb, ETI) und E-GM-11 (`inca-v1-1h-1km` bestätigt)** |
| E-GM-32 | Szenarien der Schneedecke: **erst die Kosten messen, dann bauen** (§3i.3) |
| E-GM-33 | „Jetzt“: **keine Spanne je Zeile**, im Kopf EIN Paar „Unsicherheit des Faktors ×0,73 … ×1,37, nicht nachgemessen“ |
| E-GM-34 | Zweite Woche: **Tage 8–14 als EINE Summe mit p10–p90** |
| E-GM-35 | 1 127 Nachbar-Gletscher: **benannt „ohne Spanne“** |

Jans Auftrag vom 24.11. morgens: eigenständig weiter — Messung auswerten, Spannen bauen (hinter Schalter, aus; Vertrag, Prüfer, Byte-Gleichheit ohne Schalter am vollen lokalen Lauf, Gegenprobe), danach die Eichrunde (zuerst Diagnose und eingefrorene Regel). Kein Commit, kein Push, kein Workflow, nichts im Daten- oder Archiv-Repo.

### 3i.3 Kostenmessung (E-GM-32) — Werkzeug `gm5-cost.mjs`, Nachtrag zur Messregel `gm5-method-frozen-b2.md`

Das Werkzeug rechnet die Szenarien eines Gletschers in dem Augenblick, in dem der Producer der Kopie `dc982141` seinen Schneedecken-Schritt aufruft, und behält nur Quantile und Zeiten. Probelauf an 12 Gletschern (9 eigene, 3 Nachbarn): fehlerfrei, das Nachrechnen des Erwartungswerts stimmt an 12 von 12 mit der Zeile des Producers überein.

| Lauf | Start (UTC) | Ende | Was er zeigt |
|---|---|---|---|
| 1 | 24.11. 05:23 | **von mir gestoppt** bei 600 von 2 084 Gletschern | Prozess von 1 065 MB (400) auf 2 387 MB (600), Maschine mit 3 GB frei. Zwischenstand, keine Messung: K = 40 kostet das 20,2-Fache des Erwartungswert-Schritts |
| 2 | 05:36, Grenze 1 700 MB (von mir gesetzt) | **Abbruch „heap out of memory“** kurz nach 800 Gletschern | nach vollständigem Aufräumen hält der Prozess bei 800 Gletschern 1 456 MB (rund 1,8 MB je Gletscher mit eigenem Antrieb); Zwischenstand K = 40: das 18,8-Fache. Der Producer hält die Antworten aller Gletscher mit eigenem Antrieb selbst (`forcings` in `melt.mjs`) — ob die 1,8 MB ihm gehören oder der Messung, klärt der Vergleichslauf |
| Vergleich | 05:56, Grenze 3 072 MB, `--baseline` | 06:04, durchgelaufen (612 s) | derselbe Producer, derselbe Haken, kein Szenario → `gm5-cost-baseline.json` |
| 3 | 06:04, Grenze 3 072 MB | 06:20, durchgelaufen (951 s) | **die Messung** → `gm5-cost.json` (Regel sha256 `a9964eb9…`, Nachtrag `e70c6eb8…`) |

**Ergebnis (Lauf 3; alle 2 084 Gletscher, davon 957 mit eigenem Antrieb; Lauf `2026112117`, eine Wetterlage; Maschine unter Last):**

| Frage | Messung |
|---|---|
| Rechnet das Werkzeug dasselbe wie der Producer? | ja: der Erwartungswert-Schritt des Werkzeugs gegen die Zeile des Producers im selben Lauf — an **2 084 von 2 084** Gletschern keine Abweichung (`hsd`, `hnd`, Medianhöhe) |
| **Zeit** | ein Szenario kostet das **0,47-Fache** eines Erwartungswert-Schritts (7,2 ms je Gletscher auf dieser Maschine). K = 10 / 20 / 40: das 5,0- / 9,6- / 18,8-Fache; in Sekunden für alle 2 084 Gletscher 75 / 144 / 282 s (Erwartungswert 15 s; zweiter Durchgang 0,88 des ersten). Die Zwischenstände der abgebrochenen Läufe lagen bei 20,2 und 18,8 |
| **Speicher über den Producer hinaus** | **keiner messbar.** Gehalten nach vollständigem Aufräumen, Vergleichslauf / Messung, bei 200 … 2 000 Gletschern: 93/95 · 132/131 · 410/414 · **1 463/1 468** · 172/180 · 190/203 · 250/265 · 252/268 · 254/272 · 256/275 MB; höchster Speicher des Prozesses 2 804 / 2 790 MB |
| Was den Speicher hält | **der Producer selbst**, vorübergehend: zwischen dem 600. und dem 1 000. Gletscher (solange Gletscher mit eigenem Antrieb gerechnet werden) steigt das Gehaltene auf knapp 1,5 GB und fällt danach auf 0,2 GB. An der Grenze 1 700 MB bricht schon der Producer ab (Lauf 2). Was genau gehalten wird, ist nicht untersucht (V-GM-81) |
| **Wie viele Szenarien** (§B.4, 209 Gletscher, Referenz K = 100) | Abweichung der Spannenbreite von der Referenz, Median: K = 10 **30 %**, K = 20 **22 %**, K = 40 **16 %** (p90 58 / 47 / 36 %). **Urteil des Skripts: keines der drei reicht** (Grenze 10 %) |
| Breite der Spanne p10–p90, K = 40, Medianhöhe, Median über die Gletscher | Schneehöhe Tag 1 / 7 / 14: **14 / 47 / 60 cm** (erwartet an Tag 14: 124 cm ⇒ Breite 0,48 des Werts); Neuschnee des Tages 21 / 2 / 6 cm; an Zunge und Oberkante fast gleich |
| Zerlegung (§B.5, 209 Gletscher), Schneehöhe Tag 1 / 7 / 14 | alle Quellen 14 / 48 / 60 cm · nur Niederschlag und Temperatur 13 / 45 / 57 cm · nur Faktor und Dichte 4 / 15 / 22 cm — **die Vorhersage-Spanne kommt überwiegend aus dem Wetter, nicht aus dem Faktor** |
| V-GM-41, Tage 8–14, 14 588 Gletscher-Tage | Erwartungswert ≥ 0,5 cm an **99,98 %**; p10 der Szenarien ≥ 0,5 cm an **13 %**; Median ≥ 0,5 cm an **19 %**; p90 ≥ 0,5 cm an 96 % — an 87 % der Tage ist „kein Schneefall“ das untere Ende, an 81 % zeigt selbst das mittlere Szenario keinen |
| Summe Tage 8–14 (E-GM-34), Medianhöhe, Median über die Gletscher | Summe der Erwartungswerte **26 cm**; Szenario-Summen p10 / Median / p90 **1 / 10 / 57 cm**. Der Erwartungswert liegt weit über dem mittleren Szenario (schiefe Verteilung) und an 99 % der Gletscher innerhalb der Spanne |
| Größe mit p10/p90 für `hsd` und `hnd` an ALLEN Gletschern | 1,25 → 2,88 MB roh (+129 %), 0,31 → 0,75 MB gepackt (**+142 %**) — die Schätzung der Diagnose (+31 % gepackt) war falsch, sie hatte die Erwartungswerte als Platzhalter gepackt (V-GM-83) |

**Lesart (meine, nicht vom Skript):**
- **K:** das Urteil „keines reicht“ steht. Die Grenze von 10 % war mit einer Referenz von nur 100 Szenarien aber nicht erreichbar: die Referenz streut selbst um rund 9 % (die gemessenen 30 / 22 / 16 % folgen dem 1/√K-Gesetz zweier unabhängiger Schätzungen). Mit K = 40 schwankt die Breite der Spanne von Lauf zu Lauf um rund ein Sechstel, mit K = 100 nach demselben Gesetz um rund ein Zehntel — das ist nicht gemessen. **Gebaut wird mit K = 100, der Zahl des Wetterteils** (V-GM-82).
- **Zeit auf dem Runner — Schätzung, keine Messung:** gebaut wird die Spanne nur für die 957 Gletscher mit eigenem Antrieb (E-GM-35). Das sind hier mit K = 100 rund 325 s, mit K = 40 rund 130 s. Der Schneedecken-Schritt läuft auf dem Runner in 6–7 s, hier ohne Last in 9 s und in dieser Messung in 15 s; damit auf dem Runner grob **2–2½ Minuten mit K = 100** (heute dauert der ganze Schmelzlauf dort 144 s), rund 1 Minute mit K = 40. Messen lässt es sich erst mit dem Schalter auf dem Runner (E-GM-36).
- **Speicher:** der Szenario-Schritt braucht keinen eigenen. Dass der Producer allein vorübergehend 1,5 GB hält, ist ein Befund am Betrieb, nicht an GM-5.

Nicht gemessen: eine zweite Wetterlage; K = 100 gegen eine größere Referenz; Zeit und Speicher auf dem Runner; die Spanne gegen Messungen (dafür braucht es die Schattenpaare, V-GM-79).

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-81 | Der Producer hält, solange er Gletscher mit eigenem Antrieb rechnet, vorübergehend knapp 1,5 GB (gemessen nach vollständigem Aufräumen bei Gletscher 800), danach 0,2 GB; an einer Grenze von 1 700 MB bricht er ab. Wie viel Luft der Runner hat, weiß niemand | kein roter Schmelzlauf, wenn der Katalog oder die Antworten wachsen · den Höchstwert des Speichers je Lauf in die Statuszeile schreiben (`lines.melt.rssMb`), dann die Ursache suchen (Zwischenspeicher des Cube-Lesers?) |
| V-GM-82 | Die Messregel §B.4 verglich gegen eine Referenz mit nur 100 Szenarien und verlangte 10 %: nicht erreichbar, die Referenz streut selbst so viel | richtige Urteile in künftigen Runden · Referenz mindestens zehnmal so groß wie das größte geprüfte K, oder die Streuung der Breite aus wiederholten Läufen mit anderem Startwert messen |
| V-GM-83 | Die Größenschätzung der Diagnose (+31 % gepackt) nahm Erwartungswerte als Platzhalter für die Quantile; echte Quantile packen schlechter (+142 %) | richtige Zahlen für Jan · Größen nur mit echten Werten messen |

**E-GM-36 (für Jan, nach dem Bau):** Einschalten der Spannen auf dem Runner — mit K = 100 (rund 2–2½ Minuten mehr je Lauf, geschätzt) oder K = 40 (rund 1 Minute, Breite der Spanne schwankt um ein Sechstel). Empfehlung: K = 100 einschalten und die Laufzeit in der Statuszeile lesen; der Rückfall ist eine Zeile im Workflow. **Entschieden: Jan 24.11. abends — an, K = 100; eingeschaltet am 24.11. 21:29 UTC (§3i.4d).**

### 3i.4 Bauplan GM-5a — Spannen der Schneedecke (hinter Schalter, aus)

- **Schalter:** `--snowpack-spread=off|scenarios` / `GLACIER_SNOWPACK_SPREAD`, Voreinstellung `off`, gelesen nur mit `--snowpack=shadow`. Aus = kein Szenario wird gerechnet, jede Datei Byte für Byte wie heute (Beweis am vollen lokalen Lauf, mit Gegenprobe „an“ ⇒ nur das Schneedecken-Dokument und die Statuszeile unterscheiden sich).
- **Ein Szenario** (Regel wie gemessen, §B.2 der Messregel, dazu der Ereignisteil der Dichte, V-GM-74): ein Niederschlagspfad und ein Temperaturpfad (AR(1), ρ 0,9 je Stunde, unabhängig; Niederschlag als Quantil der Verteilung der Antwort von buscosun Fusion, Schneeanteil über die Regelfunktionen des Wetterteils auf der verschobenen Temperatur, „unten nie mehr als oben“); fest je Szenario der Faktor (σ 0,25) und der systematische Teil der Dichte (σ 0,12); je Vorhersagetag neu der Ereignisteil der Dichte (σ 0,30 = √(0,32² − 0,12²)). Alle σ `measured` aus den Berichten von GM-3, als benannte Konstanten im Vertrag. Startwert je Gletscher aus Lauf und Kennung ⇒ ein Lauf ist wiederholbar.
- **Dokument** (`snowpack/<lauf>.json`, nur mit Schalter): `rules.spread` = Regelblock statt `'none'` (K, ρ, die σ mit Herkunft); je Zeile eines Gletschers mit eigenem Antrieb `hsq` und `hnq` (p10 und p90 je Höhe und Tag — Quantile der Szenario-Werte) und `hnw` (Summe des Neuschnees der Tage 8–14 je Höhe: p10, Median, p90 der Szenario-SUMMEN, E-GM-34); Nachbar-Zeilen tragen `sq: 'neighbour'` und keine Spanne (E-GM-35), im Kopf gezählt; im Kopf `now.factor` = { p10 0,73, p90 1,37, Herkunft, „nicht nachgemessen“ } (E-GM-33). Die Erwartungswerte bleiben unverändert in ihren Feldern.
- **Der Zustand ändert sich nicht** (alle Szenarien starten aus derselben Schneedecke der Laufstunde).
- **Speicher:** je Gletscher rechnen und verwerfen; behalten werden nur die Quantile.
- **Vertrag** `glacierSnowpackContract.ts`: beide Formen gültig; mit Regelblock: Zeilen mit eigenem Antrieb tragen alle drei Felder, Nachbarn keins; p10 ≤ p90, nichts negativ, Zählung im Kopf = Zeilen.
- **Prüfer** `verify:glacier-snowpack`, neuer Block: Regel und Vertrag; aus = Zeile wie ohne den Code; zweimal gerechnet = gleich; K = 1 ohne Streuung = Erwartungswert; Summenregel (Spanne der Summe ≠ Summe der Tages-Quantile); Nachbarn ohne Spanne. **Gegenprobe** `gm5-mutations.mjs` mit eingebauten Fehlern.
- **Nicht in GM-5a:** die Anzeige (GM-7), die Spanne in den Schattenpaaren (V-GM-79), das Einschalten auf dem Runner (Jans Entscheidung nach der Messung von Zeit und Speicher).

### 3i.4a Umsetzung GM-5a (24.11., Schalter aus; seit `b448d652` auf `origin/main`)

| Teil | Wo | Was |
|---|---|---|
| Vertrag | `src/glacier/glacierSnowpackContract.ts` | `GLACIER_SNOWPACK_SPREAD_RULE` (K 100, ρ 0,9, σ Faktor 0,25 / Dichte fest 0,12 / Dichte je Tag 0,30, Summe der Tage 8–14, p10/p90), `GLACIER_SNOWPACK_NOW_FACTOR` (×0,73 … ×1,37, `verified: false`), Zeilenfelder `hsq`, `hnq`, `hnw`, Vermerk `sq` (`neighbour` \| `no-distribution`), Kopf `spread` (Zählung) und `now.factor`; `snowpackProblems` nimmt beide Formen und meldet Spannen-Angaben ohne Regel |
| Kern | `scripts/glacier/lib/snowpackcore.mjs` | Schalterwort `snowpackSpreadModeOf` (`SNOWPACK_SPREAD_DEFAULT = 'off'`), `spreadOfGlacier` — K Szenarien aus derselben Schneedecke der Laufstunde, die unberührt bleibt; rein (kein Netz, keine Datei, kein buscosun Fusion) |
| Niederschlagsstufe | `scripts/glacier/lib/weathercore.mjs` | `precipAmountOf` — die Regel, die `sumSpreads` in seiner Schleife anwendet, als eigene Funktion; `sumSpreads` selbst ist nicht angefasst (V-GM-84) |
| Producer | `scripts/glacier/melt.mjs` | `--snowpack-spread=off\|scenarios` / `GLACIER_SNOWPACK_SPREAD`, gelesen nur mit der Schneedecke; Spanne nur an Zeilen mit eigenem Antrieb und Verteilung, sonst Vermerk; `rules.spread`, Kopf, Statuszeile `lines.snowpack.spread` { k, rows, none, seconds }; `opts.spreadRule` nur als Naht des Prüfers |
| Prüfer | `scripts/verify-glacier-snowpack.mjs`, Block I | I1 … I13 (Schalter und festgeschriebene Regel; Niederschlagsmenge von Hand; Szenario ohne Streuung = Erwartungswert in Kern und Producer; jede Quelle wirkt für sich; Quantil-Stufe; Summenregel; wiederholbar; aus = dieselben Bytes; an = nur Dokument und Statuszeile; Nachbarn und Antworten ohne Verteilung ohne Spanne; eigene Pfade je Gletscher und Lauf; Zeilen ohne drei Antworten unter „psnow“; 34 + 4 Negativkontrollen des Vertrags) |
| Gegenprobe | `audit/gletscher-schneemodell/gm5-mutations.mjs` | 47 eingebaute Fehler in Kern, Producer, Vertrag und Niederschlagsstufe |

Stand der Prüfer nach dem Bau: `verify:glacier-snowpack` **54/54**, `-melt` 68/68, `-weather` 41/41, `-snowcore` 24/24, `-snowcal` 37/37, `-publish` 34/34, Typecheck grün. Probelauf des Producers an 12 Gletschern: mit Schalter ist das Dokument ohne die Spannen-Felder Byte für Byte das ohne Schalter.

### 3i.4b Messung am vollen lokalen Lauf (24.11.)

Drei Läufe nacheinander auf derselben Lesesicht (Katalog `20261120-1`, Cube vom 21.11., Uhr 21.11. 17:50 UTC, `--snowpack=shadow`, Startzustand `seed-1121`): der committete Stand `019ab63c` (aus `git archive`), der Arbeitsbaum ohne Schalter, der Arbeitsbaum mit `--snowpack-spread=scenarios`. Werkzeuge `C:\dev\buscosun-glacier-cache\gm5\build\full-runs.sh` und `compare.mjs` → `compare.json`.

| Vergleich | Ergebnis |
|---|---|
| committeter Stand gegen Arbeitsbaum **ohne Schalter** | **32 von 32 Dateien des Ausgabebaums Byte für Byte gleich** (Schmelzdokument und -zustand, Wetterdokumente und Stunden-Chunks, Schneedecke und ihr Zustand); Zeiger gleich, Statuszeile gleich (ohne die Laufzeiten) |
| ohne Schalter gegen **mit Schalter** (Gegenprobe: der Vergleich merkt Unterschiede) | 31 von 32 gleich; **nur `snowpack/2026112117.json` ist anders**. Ohne die Spannen-Felder (`hsq`, `hnq`, `hnw`, `sq`, Kopf `spread`/`now`, Regel) ist es Byte für Byte das Dokument ohne Schalter; der Zustand ist gleich; die Statuszeile unterscheidet sich nur um `spread` und `bytes` |
| Zeilen | 957 mit Spanne (eigener Antrieb), 1 127 mit Vermerk `neighbour`, 0 `no-distribution`; Vertrag ohne Befund |
| **Zeit** | Spannen 233 s für 957 Gletscher mit K = 100 (243 ms je Gletscher); der Schneedecken-Schritt ohne Spanne brauchte in den drei Läufen 17–20 s, der ganze Lauf 329 / 474 / 524 s (Maschine unter wechselnder Last — die Läufe untereinander sind nicht vergleichbar) |
| **Größe** | Dokument 1,25 → 2,07 MB roh (+65 %), 0,31 → 0,54 MB gepackt (+74 %); der Zustand unverändert |
| Breite p10–p90 der Schneehöhe, Medianhöhe, Median über 957 Gletscher | Tag 1 / 7 / 14: **18 / 53 / 64 cm** (die Messung in §3i.3 ohne den Tagesteil der Dichte und mit K = 40: 14 / 47 / 60) |
| Summe Tage 8–14, Medianhöhe, Median | Erwartungswerte 26 cm; Szenario-Summen p10 / Median / p90 **1 / 10 / 61 cm** |
| Erwartungswert außerhalb der Spanne (Schneehöhe Tag 14, Medianhöhe) | an 0 von 957 Gletschern |

**Wiederholt am endgültigen Code** (nach dem Umbau der Zeilen ohne drei Antworten in die Kernfunktion `shiftLevels`, 24.11. 07:28 UTC): Arbeitsbaum ohne Schalter gegen den committeten Stand wieder **32 von 32 Dateien gleich**, mit Schalter wieder nur das Schneedecken-Dokument anders, dessen Bytes dieselben wie im ersten Durchgang (2 072 978); Spannen 173 s bei 9 s für den Schritt ohne Spanne (weniger Last als im ersten Durchgang).

**Zeit auf dem Runner, neu geschätzt (keine Messung):** der Schritt ohne Spanne läuft dort in 6–7 s, hier in 9 bzw. 17–20 s, die Spannen in 173 bzw. 233 s; im selben Verhältnis wären sie dort rund **1½ bis 2 Minuten** (K = 40: 40 Sekunden bis knapp 1 Minute). Die Schätzung in §3i.3 (2–2½ Minuten) ging vom Messwerkzeug aus, das auch die Nachbarn rechnete.

`npm run build` grün (281/281), Budget unverändert (totalJs 2 118,1 / 2 121 KB — keine Seite liest das Produkt).

### 3i.4c Gate GM-5a (24.11.)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snowpack` | **56/56** (Block I: I1, I1b, I2, I3, I4, I4b, I4c, I4d, I5, I6, I7 … I13) |
| übrige Prüfer | `verify:glacier-melt` 68/68, `-weather` 41/41, `-snowcore` 24/24, `-snowcal` 37/37, `-publish` 34/34 |
| `npm run typecheck`, `npm run build`, `npm run budget` | grün; 281/281; totalJs 2 118,1 / 2 121 KB unverändert (unter `src/` ist nur der Vertrag geändert, keine Seite importiert ihn) |
| Byte-Gleichheit ohne Schalter, voller lokaler Lauf | 32 von 32 Dateien gleich dem committeten Stand, am endgültigen Code wiederholt (§3i.4b) |
| Gegenprobe des Vergleichs | mit Schalter ist genau eine Datei anders (das Schneedecken-Dokument), und ohne die Spannen-Felder ist sie Byte für Byte die ohne Schalter |
| Gegenprobe des Prüfers, `gm5-mutations.mjs` | **Runde 1: 42 von 47 bemerkt.** Übersehen: (1) Pfade ohne Gedächtnis — keine Prüfung hing an der stündlichen Korrelation ⇒ I4c; (2) bei Zeilen ohne drei Antworten „unten mehr Schnee als oben möglich“ — im Producer nicht prüfbar ⇒ die Rechnung dieser Zeilen in die Kernfunktion `shiftLevels` gezogen und von Hand geprüft (I4d); (3–5) drei Vertrags-Verletzungen (Spanne an einer Nachbar-Zeile, unbekannter Vermerk, „neighbour“ an einer eigenen Zeile), die in meinen Negativkontrollen nur die Zählung im Kopf mit abfing ⇒ jede Kontrolle so gestellt, dass nur ihre eigene Regel sie melden kann. **Runde 2: 49 von 50 bemerkt**, Prüfer danach grün (`gm5-mutations.json`). Übersehen: „Anteil über 1 möglich“ (mein Handbeispiel ließ die Obergrenze von der Ordnung verdecken); und fünf wurden nur als Abbruch des Prüfblocks bemerkt, nicht als benannte Prüfung (fehlt das Dokument, warf der Block) ⇒ Handbeispiel geschärft, Prüfungen gegen ein fehlendes Dokument gesichert, Block umbenannt. **Diese sechs einzeln wiederholt: 6 von 6 bemerkt, keiner als Abbruch** (`gm5-mutations-rerun.json`). Die volle Runde ist nach dieser letzten Härtung nicht noch einmal gelaufen |
| Runner | nicht gelaufen: der Schalter ist aus, nichts ist gepusht |

Die fünf Fragen: (1) Funktionserhalt — ohne Schalter jede Datei des vollen Laufs Byte für Byte wie vorher, alle Prüfer grün; (2) Desktop pixelgleich, (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige liest das Produkt, unter `src/` ist nur der Vertrag der Schneedecke geändert (Build und Budget unverändert).

Nicht geprüft: kein Lauf auf dem Runner (Zeit und Speicher dort sind geschätzt bzw. unbekannt, V-GM-81); eine zweite Wetterlage; die Spanne gegen Messungen — ob 80 % der gemessenen Änderungen in p10–p90 liegen, zeigt erst der Vergleich mit den Schattenpaaren (V-GM-79, E-GM-24); K = 100 gegen eine größere Referenz (V-GM-82); kein Browser.

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-84 | Die Regel „Niederschlag einer Stunde auf der Stufe eines Szenarios“ steht jetzt zweimal im Wetterkern: in `sumSpreads` (unverändert, damit kein Byte des Wetterteils wandert) und als `precipAmountOf` für die Schneedecke | eine Regel an einer Stelle · `sumSpreads` auf `precipAmountOf` umstellen und am vollen Lauf Byte für Byte beweisen |
| V-GM-92 | Die Spannen der Schneedecke und die des Wetterteils (`snq`, mm Wasser) ziehen eigene Pfade: am selben Gletscher und Tag können „Neuschnee-Wasser p90“ und „Neuschnee cm p90“ aus verschiedenen Szenarien stammen | stimmige Zahlen nebeneinander in der Anzeige (GM-7) · denselben Startwert und dieselben zwei Pfade in beiden Rechnungen ziehen, oder die Anzeige zeigt nur eine der beiden Spannen |
| V-GM-93 | Der Erwartungswert des Neuschnees eines Tages liegt in der zweiten Woche oft ÜBER dem p90 der Szenarien (schiefe Verteilung: wenige Szenarien mit viel Schnee tragen den Mittelwert) | keine Anzeige, die einen Wert außerhalb seiner eigenen Spanne zeigt · in GM-7 für Tage 8–14 nur die Summe mit Spanne (E-GM-34), nie Tageswert neben Tagesspanne |

**Gate GM-5a: gebaut und geprüft; von Jan committet und gepusht am 24.11. 16:35 UTC (`b448d652`). E-GM-36 entschieden (Jan 24.11. abends: an, K = 100) und auf dem Runner eingeschaltet am 24.11. 21:29 UTC — §3i.4d; im Code bleibt die Voreinstellung `off`.**

### 3i.4d Einschalten auf dem Runner (E-GM-36, Jan 24.11. abends: „on, K = 100“)

Jans Auftrag nach seinem Push von `main` (`32b400df`, 24.11. 21:24 UTC): im Workflow `glacier-melt` des Daten-Repos unter `jobs.melt.env` die Zeile `GLACIER_SNOWPACK_SPREAD: scenarios`; kein anderer Schalter.

| Schritt | Beleg |
|---|---|
| Vorher | die Datei im Daten-Repo (`origin/main` `c419e1ab`, 21:28 UTC) ist Byte für Byte die Vorlage `scripts/glacier/workflow-glacier-melt.yml` von `32b400df`; die Statuszeile nennt den Lauf von 17:24 UTC (kein `mem`, kein `spread` — der Lauf von 20:20 UTC hat nicht gerechnet) |
| Vorlage | `gen-workflows.py`: fünf Zeilen im Block `melt` (vier Zeilen Kommentar, eine Zeile Schalter); der Generator erzeugt die vier anderen Vorlagen unverändert, `workflow-glacier-melt.yml` weicht von der Datei im Daten-Repo genau um diese fünf Zeilen ab |
| YAML vor dem Einspielen | geparst (PyYAML 6.0.3): `jobs.melt.env` hat fünf Einträge, alle Zeichenketten; ohne den neuen Eintrag ist das ganze Dokument gleich dem vorigen |
| Einspielen | Commit auf dem Stand von `origin/main`, Push als `main` ohne `--force`; erster Versuch abgewiesen (`main` war weitergelaufen), zweiter angenommen: **`2d208df2`, 24.11. 21:29 UTC**, eine Datei, fünf Zeilen dazu |
| Zurückgelesen | über Git (`origin/main` nach erneutem Holen) und über die GitHub-API (`ref=main`): beide Byte für Byte die erzeugte Vorlage; geparst: `GLACIER_SNOWPACK_SPREAD` = `scenarios`, die vier anderen Einträge unverändert (`GLACIER_PRODUCER_REF`, `GLACIER_SNOWPACK: shadow`, `GLACIER_MELT_STATE: run-hour`, `GLACIER_SNOWPACK_PAIRS: 'on'`) |
| K | 100 — die Konstante `GLACIER_SNOWPACK_SPREAD_RULE.k` im Vertrag; der Workflow nennt keine Zahl |
| Rückfall | die Zeile entfernen; der nächste Lauf schreibt Schneedecke und Paare wieder ohne Spannen (am vollen lokalen Lauf Byte für Byte belegt, §3k.4) |
| Erster Lauf | `2026112423` (24.11. 23:23 UTC, Actions-Lauf 354 grün, Daten-Repo `1c9ae206`): `lines.snowpack.spread` = `k` 100, `rows` 957, `none.neighbour` 1 127, `seconds` 86; `lines.snowpack.pairs.spread` 279; Schmelzlauf 206 s (17 UTC: 163 s); beide Dokumente gegen den Vertrag ohne Befund (§3k.7), Speicherzeile §3l.5 |

Was sich mit dieser einen Zeile ändert: das Schneedecken-Dokument trägt die Spannen (§3i.4a), und weil die Paare an sind, tragen sie die Vorhersage in Stationshöhe (§3k, V-GM-98). Derselbe Lauf ist der erste des Producers `32b400df` und schreibt deshalb auch zum ersten Mal `lines.melt.mem` (§3l).

### 3i.5 Plan GM-5b — Eichrunde (E-GM-31 mit E-GM-9, E-GM-10, E-GM-11)

Eigenes Paket nach GM-5a: zuerst Diagnose und eingefrorene Regel (Mindestzahl Winter, Schrumpfung des Faktors je Gletscher zum Landeswert, Form je Band mittelwertfrei, Winterschmelze mit dem ETI-Ansatz des Betriebs, ein Winter jeweils ausgelassen), dann Tabellen, danach `corr[b]` und der Faktor je Gletscher im Schmelzlauf hinter Schalter (aus). Für die übrigen rund 2 050 Gletscher die benannte Regel „kein Zuschlag, Landeswert“. **Ausgeführt am 24.11.: §3j.**

## 3j. GM-5b: Eichrunde 2 — Faktor je Gletscher und Form je Band, Winterschmelze wie im Betrieb (24.11.)

Diagnose, Stand und alle Zahlen: `audit/gletscher-schneemodell/gm5b-diagnose.md`. Regel: `gm5b-method-frozen.md` (sha256 `c5242e51…`, eingefroren 24.11. 07:26 UTC vor dem ersten Lauf auf echten Wintern; das Werkzeug fand vorher an erfundenen Wintern bekannte Faktoren auf 1,5 % wieder). Bericht: `gm5b-report.json`. Hier das Wesentliche.

### 3j.1 Diagnose

- **„Winterschmelze wie im Betrieb“ (E-GM-10) ist für vergangene Winter nur für Formel und Konstanten erfüllbar:** gerechnet wird mit dem Schmelzkern des Betriebs selbst (`simulate`, Modell `eti`, `TF` 0,12 und `SRF` 0,005455 aus `melt-calibration.json`); Temperatur und Strahlung kommen aber von einer Station — buscosun Fusion gab es in diesen Wintern nicht (V-GM-85). Strahlung: gemessen an derselben Station wie die Temperatur (Schweiz `gre000h0`, lag schon im Zwischenspeicher; Österreich `cglo` aus `klima-v2-1h` nachgeladen, 7 Stationen), mit dem Höhenzuschlag des Klarhimmels des Betriebs; eine Stunde ohne Messung bekommt Klarhimmel × 0,55.
- Wahrheit, Temperatur und Niederschlag wie in der ersten Runde: 481 nutzbare Gletscherwinter 2012–2025, gewertet 478 an 43 Gletschern mit mindestens vier Wintern. `inca-v1-1h-1km` ist von Jan bestätigt (E-GM-11).

### 3j.2 Ergebnis nach eingefrorener Regel (ein Winter ausgelassen; mm Wasserwert; Urteile vom Werkzeug)

| Variante | Stufenfehler s1 | Winterbilanz s2 | Formfehler s4 |
|---|---|---|---|
| V0 Landeswert (der Betrieb heute) | 432,7 | 402,2 | 131,7 |
| V1 Faktor je Gletscher (E-GM-9) | 281,3 | **233,0** | 132,0 |
| V2 Faktor + Form je Stufe (E-GM-31) | **249,5** | 233,0 | **73,7** |
| V3 Landeswert + Form | 411,8 | 402,4 | 76,7 |
| Negativkontrolle (fremde Form) | 294,7 | 232,9 | 158,5 |

| Urteil | Wert | |
|---|---|---|
| K-5 Schmelze des Betriebs gegen Gradtag (Landeswert, LGO-s1) | 432,7 gegen 429,0 | **gleich** |
| K-6 Faktor je Gletscher | Winterbilanz −42,1 % (p10 −34,6 %) | **trägt** |
| K-7 Form je Stufe | Formfehler −44,1 % (p10 −39,8 %); die fremde Form verschlechtert um 20 % | **trägt** |
| K-8 Winterbilanz ≤ 350 mm | 233,0 (Schweiz 204, **Österreich 362**) | erreicht — in Österreich nicht |

Landeswerte mit der Schmelze des Betriebs: Schweiz 1,821, Österreich 2,416 (erste Runde 1,793 / 2,326). Der eigene Faktor ist ohne Schrumpfung am besten (`n₀ = 0`), die Form mit `n₀ˢ = 2`. Die Höhe des Faktors hängt weiter an der Winterschmelze (halbe Schmelze: 1,62 / 2,17 und besser; anderthalbfache: 2,03 / 2,67 und schlechter), und mit der gemessenen Stationsstrahlung trifft die Rechnung schlechter als mit pauschalem Klarhimmel × 0,55 — die Winterschmelze des Betriebs ist eher zu groß (V-GM-89). In Österreich bringt der eigene Faktor wenig (V-GM-90). Mont Collon liegt wieder an der Obergrenze 5 des Suchbereichs: kein Messwert, der Eintrag trägt `atBound` und wird nicht benutzt (Nachtrag nach dem Lauf, ändert kein Urteil).

### 3j.3 Umsetzung (beide Schalter aus; seit `b448d652` auf `origin/main`)

| Teil | Wo | Was |
|---|---|---|
| Strahlung | `scripts/glacier/snowcal-radiation.mjs` | Stationsstrahlung auf dem Stundenraster der Temperaturdateien, nur in den lokalen Zwischenspeicher |
| Runde | `scripts/glacier/snowcal-fit2.mjs` | Tabellen über den Multiplikator mit dem Schmelzkern des Betriebs, Schätzer mit ausgelassenem Winter, Varianten, Urteile, Empfindlichkeiten, Werte für die Tabelle |
| Tabelle | `scripts/glacier/snow-calibration-glaciers.json` (aus `snowcal-table2.mjs`), Vertrag und Leser `scripts/glacier/lib/snowcalGlaciers.mjs` | EIGENE Datei — die erste Tabelle bleibt Byte für Byte. 43 Gletscher (Schweiz 35, Österreich 8): Faktor, Zahl der Winter, Form als Stützstellen alle 50 m mit Schrumpfung, Urteile, `gate.factor` / `gate.shape`; Faktor p10 / Median / p90 = 1,38 / 1,97 / 2,91 |
| Kern | `scripts/glacier/lib/meltcore.mjs` | `simulate` nimmt optional einen Multiplikator je Band (`corr`); ohne ihn jede Zahl wie vorher |
| Producer | `scripts/glacier/melt.mjs` | `--glacier-factor=off\|on` / `GLACIER_SNOW_GLACIER_FACTOR` und `--glacier-shape=off\|on` / `GLACIER_SNOW_GLACIER_SHAPE`, beide aus, beide nur neben `--precip=country`: ein Gletscher mit Eintrag rechnet mit SEINEM Faktor bzw. verteilt den Zuwachs nach seiner Form (flächengewichtet mittelwertfrei); alle anderen behalten den Wert ihrer Region; das Dokument nennt die Gletscher (`params.precip.glaciers.applied`), die Statuszeile zählt sie (`lines.melt.glacier`). **Die Schneedecke (drei Höhen) liest die Tabelle nicht** (V-GM-86) |
| Vertrag der Seite | `src/glacier/glacierMeltContract.ts` | nur der Typ des neuen, optionalen Blocks |
| Prüfer | `verify:glacier-melt` Block K (K1 … K7), `verify:glacier-snowcal` Block H (H1 … H8, H6b, H6c), `verify:glacier-snowpack` I14 | Schalter, aus = dieselben Bytes, Faktor und Form von Hand am Schneezustand, nie ein stiller Rückfall (zehn Abbrüche), Kern von Hand; Tabelle = Funktion des Berichts, Urteile und Schrumpfung aus den Zahlen des Berichts neu gerechnet, 21 Negativkontrollen des Vertrags, Leser von Hand, das Werkzeug an erfundenen Wintern, kein Winter in seiner eigenen Vorhersage; die Schneedecke bleibt unberührt |

Stand der Prüfer nach dem Bau: `verify:glacier-melt` **75/75**, `-snowcal` **47/47**, `-snowpack` **57/57**, `-weather` 41/41, `-snowcore` 24/24, `-publish` 34/34; Typecheck, Build (281/281) grün, Budget unverändert (2 118,1 / 2 121 KB).

### 3j.4 Gate

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-melt` | **75/75** (Block K: K1 … K7) |
| `verify:glacier-snowcal` | **47/47** (Block H: H1 … H8, H6b, H6c) |
| `verify:glacier-snowpack` | **57/57** (I14: die Schneedecke bleibt von den zwei Schaltern unberührt) |
| übrige Prüfer | `-weather` 41/41, `-snowcore` 24/24, `-publish` 34/34 |
| `npm run typecheck`, `npm run build`, `npm run budget` | grün; 281/281; totalJs 2 118,1 / 2 121 KB unverändert |
| **Byte-Gleichheit ohne Schalter**, voller lokaler Lauf am endgültigen Arbeitsbaum (GM-5a und GM-5b zusammen) gegen den committeten Stand `019ab63c` | **32 von 32 Dateien gleich**, Zeiger und Statuszeile gleich (`C:\dev\buscosun-glacier-cache\gm5\build\compare2.json`) |
| **Gegenprobe des Vergleichs:** derselbe Lauf mit `--glacier-factor=on --glacier-shape=on` | 30 von 32 gleich; anders sind genau `melt/2026112117.json` und `melt/state.json`. Das Schmelzdokument unterscheidet sich NUR um den Block `params.precip.glaciers` (42 Gletscher mit eigenem Faktor, 43 mit Form; der eine an der Grenze ohne Faktor) — **keine Zeile des Schmelzindex ist in diesem Winterlauf anders**; im Zustand unterscheiden sich 23 Gletscher, alle aus der Tabelle, keiner außerhalb. Schneedecke, ihr Zustand und alle Wetterdateien sind gleich; die Statuszeile nur um `glacier: { factor: 42, shape: 43 }` |
| Gegenprobe des Prüfers, `gm5b-mutations.mjs` (46 eingebaute Fehler in Kern, Leser, Vertrag, Producer, Eichwerkzeug, Tabellen-Werkzeug) | **46 von 46 bemerkt**, Prüfer danach grün (`gm5b-mutations.json`). **Vier davon nur als Abbruch des Prüfers**, nicht als benannte Prüfung (Voreinstellung eines Schalters „an“, Tabelle ohne Schalter geöffnet, Dokument ohne die Gletscher: ältere Prüfungen griffen in ein fehlendes Ergebnis) ⇒ zwei Stellen in `verify:glacier-melt` und eine in `-snowpack` gegen ein fehlendes Ergebnis gesichert; diese vier einzeln wiederholt (`gm5b-mutations-rerun.json`): **4 von 4 bemerkt, einer jetzt als benannte Prüfung (K2, K3), drei weiter nur als Abbruch** — bei einer falschen Voreinstellung oder einer ohne Schalter geöffneten Tabelle bricht schon der ältere Block G des Prüfers ab, weil er den Producer ohne Fangnetz aufruft; der Prüfer endet rot mit dem Grund im Fehlertext („… gelten nur mit dem Niederschlagsfaktor country“), aber ohne die Liste der Prüfungen (V-GM-95). Nicht umgebaut |
| Runner | nicht gelaufen: beide Schalter sind aus, nichts ist gepusht |

Die fünf Fragen: (1) Funktionserhalt — ohne Schalter jede Datei des vollen Laufs Byte für Byte wie am committeten Stand, alle Prüfer grün; (2) Desktop pixelgleich, (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige liest etwas Neues, unter `src/` sind nur zwei Verträge geändert (Typen und Regeln, Build und Budget unverändert).

Nicht geprüft: kein Lauf auf dem Runner; die Wirkung auf den Schmelzindex außerhalb dieser einen Winterlage (im Lauf vom 21.11. ändert sich keine Zeile — der Unterschied steht erst im Zustand und wirkt, wenn der Schnee schmilzt, V-GM-94); der Winter 2025/26; kein Browser.

**Gate GM-5b: Runde gerechnet (Urteile K-6 und K-7 tragen), Tabelle und Verdrahtung gebaut und geprüft, beide Schalter aus; von Jan committet und gepusht am 24.11. 16:35 UTC (`b448d652`), mit der Tabelle. E-GM-37 hat Jan am 24.11. abends entschieden ((A) mit Quellenangabe, §3j.5). Offen bei Jan: E-GM-38 (MANUELLE-SCHRITTE §123).**

### 3j.5 Entscheidungen und Befunde

| Nr. | Frage / Befund | Empfehlung · Skizze |
|---|---|---|
| **E-GM-37** | Die Tabelle je Gletscher trägt für 35 Schweizer Gletscher Faktor und FORM, abgeleitet aus den Stufenwerten von GLAMOS. E-GL-17 hält fest, dass GLAMOS-Dateien nur intern als Wahrheit dienen und keine Zeile davon im Repo steht. Die Faktoren je Gletscher stehen seit der ersten Runde schon im Repo (`gm3-report-A-explore.json`); die Form je 50 m ist neu und näher an den Daten | **vor dem Commit entscheiden**: (A) Tabelle committen wie gebaut (abgeleitete Modellgrößen, keine Messwerte) · (B) die Form nur für die acht österreichischen Gletscher (WGMS, offen) ins Repo, die Schweizer Formen bleiben lokal und der Producer bekommt sie nicht · (C) bei GLAMOS nachfragen. Empfehlung: (A) mit Quellenangabe, wenn die Lizenz von GLAMOS abgeleitete Größen erlaubt — das habe ich nicht geprüft. **Entschieden: Jan 24.11. abends — (A).** Die Tabelle bleibt im Repo (sie liegt seit `b448d652` auf `origin/main`); Quellenangabe für GLAMOS (CC BY 4.0, Q17) und WGMS im Kopf der Tabelle und in `audit/gletscher/licences.md`; nur abgeleitete Modellgrößen, keine GLAMOS-Zeile — E-GL-17 gilt weiter. **Umgesetzt 24.11.:** Block `sources` (`SNOWCAL_GLACIERS_SOURCES` in `lib/snowcalGlaciers.mjs`: Vermerk „abgeleitete Modellgrößen … keine Zeile und kein Messwert der Quelldateien“, GLAMOS Release 2025 doi:10.18750/massbalance.2025.r2025 und WGMS FoG 2026-02-10 doi:10.5904/wgms-fog-2026-02-10, je mit Lizenz), vom Generator `snowcal-table2.mjs` geschrieben, vom Vertrag der Tabelle verlangt (H4: sechs weitere Negativkontrollen, zusammen 27; ein eingebauter Fehler „Vertrag verlangt die Quellenangabe nicht“ auf einer Kopie: bemerkt). Die Tabelle ist aus dem committeten Bericht neu gebaut und ohne den Block Feld für Feld die bisherige (19 neue Zeilen); der Block des Schmelzdokuments ändert sich nicht. `verify:glacier-snowcal` 47/47, `-melt` 78/78, `-snowpack` 72/72. **Festgehalten, nicht von mir entschieden:** `licences.md` führt für GLAMOS weiter den Widerspruch zwischen den DOI-Seiten (CC BY 4.0) und dem Impressum („scientific and non-commercial use“, V-GL-10); Q17 „belegt“ meint die DOI-Seiten. **Nachlese 24.11. abends (Jans Folgeauftrag; Wortlaute und Prüfsummen in `audit/gletscher/licences.md`, „GLAMOS — Nachlese 24.11.2026“):** selbst gelesen — die Datenrichtlinie (`doi.glamos.ch/GLAMOS_publication_and_data_policy.pdf`, GLAMOS Office, 28.02.2020) nennt alle Produkte CC BY 4.0 und sich selbst „binding for all use of GLAMOS data and data products“, der DOI-Index sagt dasselbe (beides wie von Cowork gelesen). **Aber: der Wortlaut „scientific and non-commercial use“ ist nicht der ältere** — er steht in der ersten Zeile aller vier CSV-Dateien genau des Release 2025 (Dateidatum 14.11.2025, heute von der DOI-Seite geladen; die zwei Dateien mit den Höhenstufen sind Byte für Byte die, aus denen die Tabelle stammt) und im Impressum von heute. Stand im Register: CC BY 4.0 nach Richtlinie und DOI-Release 2025, daneben der andere Wortlaut, Bestätigung von GLAMOS wird angefragt (Mail: Jan, MANUELLE-SCHRITTE §123 Punkt 8) — **nicht aufgelöst**. Kein Code, keine Änderung an der Tabelle. **Aufgelöst 25.11.2026:** GLAMOS hat Jan per Mail schriftlich bestätigt, dass die Daten wie angefragt genutzt werden dürfen (abgeleitete Modellparameter in einem kostenlosen Webdienst; die Mail liegt bei Jan, nicht im Repo). Die Quellenangabe nach CC BY 4.0 bleibt Pflicht |
| **E-GM-38** | Einschalten im Schmelzlauf: Faktor je Gletscher und Form je Band für 42 bzw. 43 Gletscher | erst nach E-GM-37 und nach einem Blick auf V-GM-91 (der Schmelzzustand mischt beim Einschalten zwei Faktoren); der Rückfall ist je eine Zeile im Workflow. **Seit 24.11. abends mit einem benannten offenen Punkt:** solange die Antwort von GLAMOS fehlt (MANUELLE-SCHRITTE §123 Punkt 8), ist das Einschalten Jans Entscheidung in Kenntnis der nicht aufgelösten Lizenzfrage. **25.11.2026: der Lizenzpunkt ist erledigt (Bestätigung von GLAMOS, E-GM-37).** Jan will NUR Faktor und Form der gemessenen Gletscher einschalten (`on`/`on`, nicht `predicted`); der Ablauf mit Neu-Einschwingen, Startzustand und Rückweg steht in MANUELLE-SCHRITTE §127 — vorbereitet, nicht ausgeführt |
| V-GM-102 | Die Datenrichtlinie von GLAMOS (§3.2) verlangt für Daten den empfohlenen Zitierwortlaut der DOI-Seite („GLAMOS (2025). Swiss Glacier Mass Balance, release 2025, Glacier Monitoring Switzerland, doi:10.18750/massbalance.2025.r2025.“); der Kopf der Tabelle nennt Name, DOI und Lizenz in eigener Form | eine Quellenangabe, an der GLAMOS nichts auszusetzen hat · den Wortlaut als Feld `citation` in `SNOWCAL_GLACIERS_SOURCES` aufnehmen und über den Generator schreiben (nicht gebaut: Jans Vorgabe vom 24.11. „keine Änderung an der Tabelle“; in der Mail an GLAMOS mitfragen). **25.11.:** die Tabelle vorhergesagter Faktoren trägt den Wortlaut (`SNOW_FACTOR_SOURCES`, vom Vertrag verlangt); `snow-calibration-glaciers.json` bleibt nach Jans Wort, wie sie ist — für sie bleibt der Punkt offen |
| V-GM-85 | „Wie im Betrieb“ gilt für Formel und Konstanten; Temperatur und Strahlung der Eichung kommen von einer Station | benannt; die Prüfung am Winter 2025/26 mit dem Antrieb des Betriebs (GM-8) |
| V-GM-86 | Im Schmelzlauf der Faktor des Gletschers, in der Schneedecke desselben Gletschers der Landeswert | für die Schneedecke ein eigener Schritt mit neuem Startzustand (`rules.precip` des Zustands müsste die Regel nennen) |
| V-GM-87 | `cglo` der sieben österreichischen Stationen nachgeladen (dieselbe freigegebene Quelle, ein Parameter mehr) | erledigt |
| V-GM-88, V-GM-89 | Die Winterschmelze des Betriebs ist eher zu groß (`TF` an der Grenze, Gate C rot); die Höhe jedes Faktors hängt daran | `TF`/`SRF` an Winter und Sommer gemeinsam neu eichen (V-GM-26, vor Mai 2027); danach diese Runde wiederholen |
| V-GM-90 | In Österreich bringt der Faktor je Gletscher wenig (Winterbilanz 362 statt 425 mm) | Streuung des Faktors von Winter zu Winter je Gletscher ansehen; SNOWGRID-Wasserwert als zweite Analyse |
| V-GM-91 | Der Schmelzzustand kennt die Rechnung nicht, aus der sein Schnee stammt: nach dem Einschalten liegt an den Gletschern mit Eintrag Schnee aus zwei Faktoren übereinander | beim Einschalten den Schmelzzustand dieser Gletscher neu einschwingen, oder die Regel im Zustand vermerken (wie die Schneedecke es tut) |
| V-GM-95 | `verify:glacier-melt` ruft den Producer in seinen älteren Blöcken ohne Fangnetz auf: ein Fehler dort beendet den ganzen Prüfer rot, aber ohne die Liste der Prüfungen (drei eingebaute Fehler der Gegenprobe fielen nur so auf) | ein roter Prüfer, der sagt, WELCHE Regel gebrochen ist · die Blöcke wie in `verify:glacier-snowpack` in `block()` fassen und Ergebnisse vor dem Zugriff prüfen |
| V-GM-94 | Die Eichung prüft den Winter; ob Faktor und Form die SCHMELZE im Sommer (Kachel „Fläche ohne Schneedecke“, Schmelzindex) verbessern, ist nicht gemessen | vor dem Einschalten oder im Sommer 2027: Ausaperung gegen die Sentinel-2-Saisonzeilen der 43 Gletscher mit und ohne Schalter |

## 3k. GM-5c: die Schattenpaare tragen die Spanne in Stationshöhe (V-GM-79; 24.11. abends)

Jans Auftrag vom 24.11. abends: V-GM-79 bauen — die Schattenpaare tragen die Spanne der Schneedecke (p10/p90) in Stationshöhe, wenn `--snowpack-spread=scenarios` an ist; zuerst die Diagnose, dann der Code; mit ausgeschalteter Spanne bleibt jede Datei Byte für Byte, bewiesen am vollen lokalen Lauf mit Negativkontrolle; Vertrag, Prüfer, Gegenprobe. Kein Commit, kein Push, kein Workflow, nichts im Daten- oder Archiv-Repo. buscosun Fusion wird nur gelesen.

### 3k.1 Diagnose (vor dem Code)

**Was fehlt.** Die Spanne der Schneedecke (GM-5a) steht nur im Laufdokument `snowpack/<lauf>.json`, und das wird nach 72 h gelöscht und nicht archiviert (V-GM-53). Archiviert werden die Paare — sie tragen aber nur Werte zur Laufstunde (`m`, `hn`). Ob 80 % der gemessenen Änderungen in p10–p90 liegen (Prüfprotokoll §7, `gm5-diagnose.md` B5), lässt sich deshalb nach drei Tagen nicht mehr nachrechnen.

**Was „Spanne in Stationshöhe“ heißen kann.** Zur Laufstunde hat die Schneedecke je Zeile keine Spanne (E-GM-33: nur das eine Paar zum Faktor im Kopf). Die Spanne gibt es für die Vorhersage: Schneehöhe am Ende von Tag 1 … 14 an Zunge, Mitte, Oberkante. Das Paar kann also nur die **Vorhersage** in Stationshöhe tragen. Geprüft wird die Änderung: gemessen `v(t0 + 24 h) − v(t0)` gegen `[p10 − m, p90 − m]` — alle Szenarien starten aus derselben Schneedecke der Laufstunde, `m` steht schon im Paar. Dazu gehört der **Erwartungswert** der Vorhersage in Stationshöhe: ohne ihn ist weder der Fehler der Vorhersage noch die Lage der Spanne zum Wert lesbar (V-GM-93: der Erwartungswert kann außerhalb seiner Spanne liegen), und auch er verschwindet nach 72 h.

**Woher die Messung zu +24 h kommt.** Aus dem Paar eines späteren Laufs zur selben Stunde (sein `v`; bei Tirol auch direkt die gelieferte Änderung `hsd.h24/h48/h72`) — oder, wenn zu dieser Stunde kein Lauf lief (der Workflow startet alle drei Stunden, der Wiederholungsschutz lässt nur Läufe mit neuem Cube zu), aus der stündlichen Stationsablage `stn-<stunde>.json.gz` in `buscosun-archiv`. Das Paar muss also nur die Vorhersage tragen; die Wahrheit ist in beiden Fällen da.

**Welche Vorlaufzeiten.** V-GM-79 nennt +24 h. Die Stationslinie liefert die Änderung über 24 / 48 / 72 h, die Paare tragen den Neuschnee in denselben drei Fenstern (`GLACIER_SNOWPACK_WINDOWS`). Was das Paar heute nicht mitschreibt, ist später nicht wiederzubekommen. ⇒ **+24, +48 und +72 h** (Tage 1–3 der Zeile), gesetzt; mehr nicht (E-GM-39).

**Wie viele Paare es betrifft** (lokaler Lauf `2026112117`, Paare aus `gm4\sp-pairs`, Spannen aus `gm5\build\full-on`): von 468 Paaren liegen **279 auf Zeilen mit Spanne** (eigener Antrieb; 75 Stationen), 189 auf Nachbar-Zeilen (ohne Spanne, E-GM-35). Lage der 279: 180 unter der Zunge, 92 zwischen Zunge und Oberkante, 7 darüber.

**Die Regel für das Quantil.** Unter der Zunge und über der Oberkante ist der Wert in Stationshöhe der der nächsten Höhe (nie hochgerechnet) — dort IST das Quantil das der Zeile (`hsq`). Dazwischen wird linear zwischen zwei Höhen gelesen, und das Quantil eines gemischten Werts ist nicht die Mischung zweier Quantile (dieselbe Regel wie bei Summen: Quantil der Szenario-Werte, nie eine Rechnung auf Quantilen). An Zunge und Mitte fällt im selben Szenario nicht immer gleich viel Schnee (Regen unten, Schnee oben). ⇒ der Wert in Stationshöhe wird **je Szenario** zwischen den Höhen gelesen, danach das Quantil genommen. Dafür muss der Szenario-Schritt die Stationshöhe kennen, die Zuordnung also VOR der Gletscherschleife gelesen sein (heute liest sie erst der Paar-Schritt danach). Wie weit beide Wege an den 92 Paaren auseinanderliegen, wird am vollen Lauf gemessen (§3k.4).

**Was sich nicht ändern darf (Rule 2).**
- Spanne aus (heute auf dem Runner): Paar-Datei, Schneedecke, Zustand, Schmelz- und Wetterdateien Byte für Byte wie vorher; die Zuordnung wird nicht früher gelesen.
- Spanne an, Paare aus: das Schneedecken-Dokument Byte für Byte wie heute mit Spanne.
- Beide an: das Schneedecken-Dokument ist Byte für Byte das mit Spanne allein — der Zusatz zieht keine Zufallszahl und steht nicht in der Zeile; die Paar-Datei ist ohne die neuen Felder Byte für Byte die ohne Spanne.
- Kein neuer Schalter: die zwei vorhandenen zusammen ergeben den Zusatz (Jans Auftrag). Zurück = `GLACIER_SNOWPACK_SPREAD` aus.

**Wer die Datei sonst liest.** Nur der Archivierer (`archivePairs` prüft gegen den Vertrag, legt die Bytes unverändert ab). Die neuen Felder sind zusätzlich und wahlfrei; ein älterer Archivierer prüft sie nicht und legt das Dokument ab (im Prüfer nachgestellt mit dem Vertrag von `b448d652`). `schema` bleibt 1.

**Kosten.** Kein zusätzliches Szenario; je Szenario drei Zwischenwerte. Größe geschätzt +70 Bytes je Paar mit Spanne, +25 je Paar ohne — gemessen wird am vollen Lauf.

**Was die Prüfung an Stationen nicht leisten kann** steht unverändert in `gm5-diagnose.md` B5: die Stationen stehen neben dem Eis, der Faktor steckt in der Spanne; und eine Nachbar-Zeile hat keine Spanne.

### 3k.2 Entwurf

- **Paar** (nur in einem Lauf mit Spanne): `fm` = berechnete Schneehöhe in Stationshöhe zu +24 / +48 / +72 h (Erwartungswert, aus `hsd` der Zeile wie `m` aus `hs`) an JEDEM Paar; `fq` = `[p10 ×3, p90 ×3]` an Paaren auf Zeilen mit Spanne; sonst `sq` mit dem Vermerk der Zeile (`neighbour` \| `no-distribution`). Alle Felder hinten angehängt.
- **Kopf:** `forecast` = { `hours` [24, 48, 72], Regel der Spanne (K, Quantile, „je Szenario zwischen den Höhen“), Zählung `pairs` (mit `fq`) und `none` je Grund }; `origins` nennt `fm` und `fq` als `computed`.
- **Kern** `spreadOfGlacier`: wahlfreier Eingang `at` { Höhen der Zeile, Stationshöhe, Zahl der Tage }; gibt dann zusätzlich `at` = [p10 je Tag, p90 je Tag] zurück. Ohne `at` jede Zahl und jedes Feld wie vorher.
- **Producer:** nur mit beiden Schaltern die Zuordnung vor der Schleife lesen (ein Fehler dabei lässt die Schneedecke unberührt — der Paar-Schritt nennt ihn danach wie bisher); die Quantile je Gletscher neben den Zeilen halten, nicht IN der Zeile; `pairsOf` setzt sie ein. Fehlt zu einer Zeile mit Spanne das Quantil in Stationshöhe, wird KEINE Paar-Datei geschrieben und der Grund genannt — nie ein Ersatz aus den Quantilen der Zeile.
- **Vertrag** `glacierSnowpackPairsContract.ts`: beide Formen gültig; Vorhersage-Felder ohne Kopfblock (und umgekehrt) sind eine Verletzung; mit Kopfblock trägt jedes Paar `fm` und genau eines von `fq` / `sq`; p10 ≤ p90, nichts negativ, Zählung = Paare.
- **Statuszeile** `lines.snowpack.pairs.spread` = Zahl der Paare mit Spanne (nur mit Spanne).

### 3k.3 Umsetzung (24.11.; kein neuer Schalter; lokal committet)

| Teil | Wo | Was |
|---|---|---|
| Vertrag | `src/glacier/glacierSnowpackPairsContract.ts` | `GLACIER_SNOWPACK_PAIRS_FC_HOURS` = [24, 48, 72] (`set`), `GLACIER_SNOWPACK_PAIRS_FC_ELEVATION`; Paarfelder `fm`, `fq`, `sq`; Kopfblock `forecast` { `hours`, `origin`, `spread` { `rule`, `k`, `quantiles`, `elevation` }, `pairs`, `none` }; `origins.fm` / `origins.fq`. `snowpackPairsProblems` nimmt beide Formen, meldet Felder ohne Kopfblock und umgekehrt, und prüft mit dem neuen dritten Eingang (die Zeilen der Schneedecke) das Paar GEGEN die Zeile: Vermerk = der der Zeile, unter der Zunge / über der Oberkante Vorhersage und Spanne genau die der Zeile an dieser Höhe. Kein Import in der Seite |
| Kern | `scripts/glacier/lib/snowpackcore.mjs` | `spreadOfGlacier` mit wahlfreiem `at` { `z`, `zs`, `days` } → zusätzlich `at` = [p10 je Tag, p90 je Tag] der je Szenario in `zs` gelesenen Schneehöhe; `pairsOf` mit wahlfreiem `forecast` { `days`, `at` } → `fm` an jedem Paar, `fq` oder `sq`, Zählung; wirft, wenn zu einer Zeile mit Spanne die Spanne in genau dieser Stationshöhe fehlt; `stationLevelsOf` (Stationshöhe je Gletscher aus dem Abschnitt `ext`) |
| Producer | `scripts/glacier/melt.mjs` | nur mit BEIDEN Schaltern: Stationshöhen vor der Schleife lesen (Fehler ⇒ ohne; der Paar-Schritt nennt ihn danach), `at` mit den Höhen der ZEILE an den Szenario-Schritt, das Ergebnis neben den Zeilen halten (`spAtQ`), nicht in der Zeile; `writeSnowpackPairs` mit wahlfreiem `forecast` → Kopfblock, Herkunft, Prüfung gegen die Zeilen vor dem Schreiben; Statuszeile `pairs.spread` |
| Prüfer | `scripts/verify-glacier-snowpack.mjs`, Block J (J1 … J15) | Regel festgeschrieben; Kern: ohne Angabe kein Feld und dieselben Zahlen, unter / über / auf einer Höhe genau deren Spanne, ein Szenario von Hand, **Quantil der gelesenen Werte und nicht die Mischung zweier Quantile** (Schnee entweder an der Zunge oder an der Mitte ⇒ dazwischen fast keine Spanne), unbrauchbare Angabe bricht ab; Paare von Hand, kein stiller Ersatz; Producer: jede Kombination der zwei Schalter Byte für Byte, das Paar von Hand, Szenario ohne Streuung = Erwartungswert auch in Stationshöhe, ohne Verteilung, unbrauchbare Zuordnung; Vertrag mit 22 + 7 + 5 Negativkontrollen; Archiv |
| Gegenprobe | `audit/gletscher-schneemodell/gm5c-mutations.mjs` | eingebaute Fehler in Kern, Paaren, Producer und Vertrag (und an der Speicherzeile, §3l) |
| Werkzeuge der Messung | `gm5c-runner-read.mjs` (Schritt 0), `gm5c-analyse.mjs`; außerhalb des Repos `C:\dev\buscosun-glacier-cache\gm5c\full-runs.sh` | volle lokale Läufe aus Code-Schnappschüssen (`code-head` = `git archive` von `b448d652`, `code-work` / `code-final` = Arbeitsbaum, `code-mut` = Kopie für die Gegenprobe), nie aus dem lebenden Checkout |

Nicht angefasst: buscosun Fusion, die Stationslinie, `snowcore.mjs`, `meltcore.mjs`, `weathercore.mjs`, der Archivierer, der Publisher, Workflows, Daten- und Archiv-Repo, die Seite.

### 3k.4 Messung am vollen lokalen Lauf (24.11. abends)

Aufbau: Lesesicht `C:\dev\buscosun-glacier-cache\gm4\view-stn` (Katalog `20261120-1`, Stationslinie mit Zuordnung `20261120-1.4`, Startzustand `seed-1121`; nur gelesen), Cube vom 21.11., Uhr 21.11. 17:50 UTC, alle Läufe mit `--snowpack=shadow`, nacheinander, Code aus Schnappschüssen (nie aus dem lebenden Checkout). Auswertung `gm5c-analyse.mjs` → `gm5c-analyse.json` (erster Schnappschuss) und `gm5c-analyse-final.json` (endgültiger Baum).

| Lauf | Code | Schalter | Stand |
|---|---|---|---|
| `head-pairs` | `b448d652` (`git archive`) | `--snowpack-pairs=on` | 267 s |
| `work-pairs` | Arbeitsbaum, Schnappschuss 17:41 UTC (V-GM-79 gebaut) | `--snowpack-pairs=on` | 297 s |
| `final-pairs` | **endgültiger Arbeitsbaum**, Schnappschuss 18:23 UTC (V-GM-79 und V-GM-81) | `--snowpack-pairs=on` | 445 s |
| `final-both` | derselbe | `--snowpack-pairs=on --snowpack-spread=scenarios` | 913 s (Spannen 414 s) |
| `head-spread` | `b448d652` | `--snowpack-spread=scenarios` | 759 s (Spannen 343 s) |

**Der Weg dahin:** gegen 17:55 UTC stoppte das System beide Hintergrund-Aufträge der Sitzung (die Läufe und die Gegenprobe) wegen Speichermangel auf der Maschine — nicht wegen eines Fehlers der Läufe; daneben lief ein fremder Build. Ein Lauf mit beiden Schaltern aus dem ersten Schnappschuss kam nicht zu Ende; sein Prozess lief als Rest weiter (3,0 GB), ich habe genau ihn beendet (Kommandozeile vorher gelesen) und nach der Vorgabe des Systems nichts von selbst neu gestartet. Auf Jans Wort („starte neu“, 18:22 UTC) liefen die drei letzten Läufe — gleich aus dem endgültigen Baum, einzeln. Die Maschine war dabei fremd ausgelastet (CPU um 97 %): **die Laufzeiten sind untereinander nicht vergleichbar** und keine Messung für den Runner.

| Vergleich | Ergebnis |
|---|---|
| **Spanne aus: `head-pairs` gegen `final-pairs`** (der Stand auf dem Runner heute gegen den endgültigen Code; ebenso gegen `work-pairs`) | **33 von 33 Dateien des Ausgabebaums Byte für Byte gleich** — Schmelzdokument und -zustand, Wetterdokumente und Stunden-Chunks, Schneedecke und ihr Zustand, **und die Paar-Datei** (79 899 Bytes, 468 Paare, kein Feld der Vorhersage, Herkunft nur der vier alten Felder, Vertrag ohne Befund); Zeiger gleich, Statuszeile gleich (ohne die Laufzeiten und ohne `mem`, §3l) |
| **Negativkontrolle: `final-pairs` gegen `final-both`** | 31 von 33 gleich; **anders sind genau `snowpack/2026112117.json` und `snowpack/pairs/2026112117.json`**. Die Paar-Datei ist OHNE die neuen Felder (`forecast`, `origins.fm/fq`, `fm`, `fq`, `sq`) Byte für Byte die ohne Spanne. Zeiger gleich; die Statuszeile unterscheidet sich nur in `snowpack.spread`, `snowpack.bytes`, `snowpack.pairs.spread`, `snowpack.pairs.bytes` |
| **Das Schneedecken-Dokument mit beiden Schaltern gegen `head-spread`** (der committete Code mit der Spanne allein) | **Byte für Byte gleich** (2 072 978 Bytes) — der Zusatz zieht keine Zufallszahl und steht in keiner Zeile. Alle 32 gemeinsamen Dateien gleich, dazu kommt nur die Paar-Datei; die Statuszeile unterscheidet sich nur um `snowpack.pairs`. Es ist auch Byte für Byte das Dokument, das GM-5a am Morgen gemessen hat (`gm5\build\full-on`, eine Datei von vor diesem Paket) |
| Die neuen Felder am echten Katalog | **279 Paare mit Spanne** (75 Stationen; 180 unter der Zunge, 92 dazwischen, 7 über der Oberkante), **189 mit dem Vermerk `neighbour`**, 0 `no-distribution` — wie aus den alten Läufen vorhergesagt; jedes der 468 Paare trägt `fm`; Vertrag ohne Befund, auch gegen die Zeilen geprüft; Statuszeile `pairs.spread: 279` |
| Breite p10–p90 in Stationshöhe, Median über die 279 Paare | +24 / +48 / +72 h: **21 / 63 / 57 cm** (an den Zeilen selbst dieselbe Folge: der Schneefall des zweiten Tags öffnet die Spanne, die Setzung danach schließt sie etwas). Änderung gegen die Laufstunde, +24 h: p10 −3,6 · erwartet +4,1 · p90 +17,3 cm; +72 h: −9,0 · +14,5 · +46,1 cm. Erwartungswert außerhalb seiner Spanne: an keinem Paar |
| **„Je Szenario gelesen“ gegen „Quantile zweier Höhen gemischt“** (die 92 Paare zwischen den Höhen, je 6 Werte = 552) | an **184 Werten (33 %) verschieden** (≥ 0,1 cm), an 22 um mindestens 1 cm, höchstens **11,1 cm**; Median 0, p90 0,3 cm. Die Regel ist also nicht nur Grundsatz |
| Größe der Paar-Datei | 79 899 → **106 090 Bytes** (+33 %), gepackt 14 665 → 23 618 (+61 %); geschätzt waren +24 KB roh |
| Der Archivierer von `b448d652` (sein Vertrag kennt die neuen Felder nicht) | legt das Dokument mit Vorhersage ab: `2026-11-21/pairs-2026112117.json.gz`, nichts verweigert |
| Paare mit Spanne UND Stationswert in diesem Lauf | 76 — die Lesesicht ist vom 21.11., IMIS stand damals noch nicht in den Slots; auf dem Runner trugen am 24.11. 465 von 468 Paaren einen Wert (§3h.17) |

Nicht gemessen: eine zweite Wetterlage; Zeit und Größe auf dem Runner; die Spanne gegen Messungen.

### 3k.5 Gate GM-5c / V-GM-79 (24.11. abends)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-snowpack` | **72/72** (vorher 57; Block J = 15 Prüfungen) |
| `verify:glacier-melt` | **78/78** (vorher 75; Block L = 3 Prüfungen, §3l) |
| übrige Prüfer | `-weather` 41/41, `-snowcore` 24/24, `-snowcal` 47/47, `-publish` 34/34, `-contract` 64/64, `-stations` 77/77 |
| `npm run typecheck`, `npm run build`, `npm run budget` | grün; 281/281; totalJs 2 118,1 / 2 121 KB unverändert (unter `src/` ist nur der Vertrag der Paare geändert, keine Seite importiert ihn) |
| **Byte-Gleichheit mit ausgeschalteter Spanne**, voller lokaler Lauf am endgültigen Arbeitsbaum | **33 von 33 Dateien** gleich dem Stand `b448d652`, die Paar-Datei eingeschlossen; Zeiger und Statuszeile gleich (§3k.4) |
| **Negativkontrolle am vollen Lauf** | mit beiden Schaltern sind genau zwei Dateien anders; die Paar-Datei ohne die neuen Felder ist die ohne Spanne; das Schneedecken-Dokument ist Byte für Byte das von `b448d652` mit der Spanne allein (§3k.4) |
| **Gegenprobe** `gm5c-mutations.mjs` — 58 eingebaute Fehler (48 an V-GM-79 in Kern, Paaren, Producer und Vertrag; 10 an der Speicherzeile); jedes Muster trifft seine Datei genau einmal | **58 von 58 bemerkt, keiner nur als Abbruch, Prüfer danach grün** (`gm5c-mutations.json`). Der Weg: ein erster Anlauf im Arbeitsbaum wurde nach 15 Fehlern vom System gestoppt und ließ `snowpackcore.mjs` verändert zurück (aus der Sicherung wiederhergestellt, gegen sie verglichen, Prüfer grün). Auf Jans Wort neu, jetzt auf einer KOPIE des Baums (V-GM-100, `--root`; vor jedem Teil vergleicht das Werkzeug Zieldateien und Prüfer Byte für Byte mit dem Arbeitsbaum) und in sieben Teilen. **In dieser Runde zuerst übersehen: „eine Zeile ohne Spanne und ohne Vermerk bekommt eine Spanne“** — mein Handbeispiel in J7 reichte für diese Zeile keine Spanne, also fing eine andere Regel den Fehler ab ⇒ J7 reicht jetzt eine Spanne für genau diese Stationshöhe, damit nur die Regel über die ZEILE ablehnen kann; wiederholt: bemerkt (J7). Die 19 davor bemerkten Fehler liefen mit dem Prüfer vor dieser Schärfung, die 39 danach mit dem geschärften |
| Was die Gegenprobe zeigt | „Mischung der Quantile zweier Höhen“ fällt NUR durch J4 auf; „zieht eine Zufallszahl“ durch J2 und J9; „Kopfblock nennt das K der Voreinstellung“ nur durch J11; „Zuordnung nicht lesbar bricht die Schneedecke ab“ nur durch J13; die 16 Fehler am Vertrag alle durch J14 |
| Runner | beim Schließen des Gates nicht gelaufen (nichts gepusht, Spanne aus). Seit 24.11. 21:24 UTC gepusht (`32b400df`), Spanne an seit 21:29 UTC (E-GM-36, §3i.4d); der erste Lauf: §3k.7 |

Die fünf Fragen: (1) Funktionserhalt — mit ausgeschalteter Spanne jede Datei des vollen Laufs Byte für Byte wie am committeten Stand, alle Prüfer grün; (2) Desktop pixelgleich, (3) Touch-Flächen, (4) Konsole, (5) Long Tasks — keine Anzeige liest das Produkt, Build und Budget unverändert.

Nicht geprüft: dass die Zuordnung nur mit beiden Schaltern vorab gelesen wird, ist am Code gelesen — kein Prüfer kann es sehen (keine Ausgabe hängt daran); kein Lauf auf dem Runner; eine zweite Wetterlage; die Spanne gegen Messungen (dafür braucht es Läufe mit Spanne UND die Messung 24 h später); kein Browser.

**Gate GM-5c (V-GM-79): gebaut und geprüft, kein neuer Schalter, committet am 24.11. (`32b400df`) und von Jan gepusht am 24.11. 21:24 UTC. Ohne die Spanne schreibt der Producer dieselben Bytes wie vorher. E-GM-39 entschieden (wie gebaut). Die neuen Felder kommen mit E-GM-36 — eingeschaltet am 24.11. 21:29 UTC (§3i.4d), erster Lauf §3k.7.**

### 3k.6 Entscheidungen und Befunde

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-39 | Was das Paar von der Vorhersage trägt: (A) wie gebaut — +24 / +48 / +72 h, an jedem Paar der Erwartungswert, dazu p10/p90 wo die Zeile eine Spanne hat; (B) nur +24 h (der Wortlaut von V-GM-79). Gebaut ist (A): die Stationslinie liefert die Änderung über dieselben drei Zeiten, und was das Paar nicht mitschreibt, ist nach 72 h nicht wiederzubekommen | **entschieden: Jan 24.11. abends — (A), wie gebaut** |
| V-GM-98 | Die neuen Felder gibt es erst, wenn die Spanne auf dem Runner an ist (E-GM-36); bis dahin schreibt der Runner die Paare wie heute. Mehrwert: die Reihe, an der sich die Spanne prüfen lässt, beginnt mit dem Einschalten. Skizze: beim Einschalten von `GLACIER_SNOWPACK_SPREAD` in `lines.snowpack.pairs.spread` die Zahl der Paare mit Spanne lesen (erwartet um 279) | **erledigt 24.11. 23:23 UTC:** der erste Lauf mit Spanne (`2026112423`) trägt die Felder, `pairs.spread` = 279 (§3k.7) |
| V-GM-99 | 189 der 468 Paare sitzen auf Nachbar-Zeilen und tragen keine Spanne (E-GM-35) — vier von zehn Stationsvergleichen prüfen nur den Erwartungswert. Mehrwert: mehr Stationen für die Prüfung der Spanne. Skizze: für Nachbar-Zeilen MIT Schneestation die Szenarien des Nachbarn auf die eigenen Höhen legen (kostet Zeit nur für diese Zeilen) | offen |
| V-GM-100 | Ein vom System gestoppter Hintergrund-Auftrag ließ zwei Reste zurück: den Prozess des laufenden Volllaufs (3 GB) und eine von der Gegenprobe veränderte Datei im Arbeitsbaum — uncommittete Arbeit, die `git` nicht zurückholen kann. Mehrwert: kein veränderter Code im Baum, wenn eine Runde abbricht. Skizze: die Gegenprobe rechnet auf einer KOPIE des Baums (wie die Volläufe) und lässt sich in Teilen fortsetzen | **umgesetzt** in `gm5c-mutations.mjs` (`--root`, `--max`, Fortschrittsdatei); die älteren Gegenproben (`gm2` … `gm5b`) verändern weiter den Arbeitsbaum |

### 3k.7 Erster Lauf auf dem Runner mit Spanne (`2026112423`, 24.11. 23:23 UTC)

Der erste Schmelzlauf nach dem Einschalten (§3i.4d) ist der geplante von 23:20 UTC: Actions-Lauf 354, **grün**, 23:22:29 → 23:27:03 UTC (4 min 34 s; der Lauf von 17 UTC ohne Spanne 3 min 49 s), Producer `32b400df` über `GLACIER_PRODUCER_REF = main`, veröffentlicht mit dem Daten-Repo-Commit `1c9ae206` (23:26:57 UTC). Gelesen an genau diesem Commit mit `gm5c-runner-read.mjs` (→ `gm5c-runner-2026112423.json`) und dem neuen Lesewerkzeug `gm5c-runner-spread.mjs` (→ `gm5c-runner-spread-2026112423.json`; liest nur, rechnet mit Kern und Verträgen des Arbeitsbaums = `32b400df` für diese Dateien).

**Die Statuszeile** (`glacier/v1/status.json`, wörtlich):

| Zeile | Wert | erwartet (lokal, §3i.4b / §3k.4) |
|---|---|---|
| `lines.snowpack.spread` | `{ "k": 100, "rows": 957, "none": { "neighbour": 1127 }, "seconds": 86 }` | `k` 100, `rows` um 957, `none.neighbour` um 1 127 — **trifft genau** |
| `lines.snowpack.pairs.spread` | `279` (von 468 Paaren, alle 468 mit Stationswert; `bytes` 103 448) | um 279 — **trifft genau** (V-GM-98) |
| `lines.melt.mem` | `{ "rssMb": 3315, "heapMb": 2830, "heapLimitMb": 4144 }` | §3l.5 |
| `lines.melt.seconds` · `lines.snowpack.seconds` | 206 · 91 (17 UTC ohne Spanne: 163 · 7) | geschätzt +1½ bis 2½ min; gemessen sind 86 s für die Spannen, der ganze Lauf ist 43 s länger als der von 17 UTC (die Läufe davor 144–163 s) |

| Prüfung an den veröffentlichten Dateien | Ergebnis |
|---|---|
| Schneedecken-Dokument `snowpack/2026112423.json` gegen den Vertrag | ohne Befund; 2 076 739 Bytes (= Statuszeile; der Lauf von 17 UTC 1 263 452, +64 %); Kopfblock `rules.spread`: `scenarios`, `k` 100, `rho` 0,9, Quantile 10/90, `neighbour: none` |
| Zeilen mit Spanne | 957 mit `hsq`, 1 127 mit dem Vermerk `neighbour`, keine mit beidem, keine mit keinem — gleich der Statuszeile |
| Paar-Dokument `snowpack/pairs/2026112423.json` gegen den Vertrag, auch gegen die ZEILEN des Schneedecken-Dokuments | ohne Befund; 103 448 Bytes (17 UTC: 77 075, +34 %), gepackt 24 035; Kopfblock `forecast`: Stunden 24/48/72, `per-scenario-linear-between-levels-clamped`, `pairs` 279, `none.neighbour` 189; Herkunft `fm`/`fq` = `computed` |
| Paare OHNE die neuen Felder, neu gerechnet aus Zeilen + Zuordnung `20261120-1.5` + Stationsslot `2026112423` desselben Commits | **dieselben 468 Paare**, dieselben Zähler — die neuen Felder haben an den alten nichts verändert |
| `fm` an allen 468 Paaren neu aus den Zeilen gerechnet | 0 Abweichungen; der Vermerk ist an jedem Paar der der Zeile |
| Paare mit Spanne | **279** (75 Stationen; 180 unter der Zunge, 92 dazwischen, 7 über der Oberkante — dieselbe Aufteilung wie lokal), 189 `neighbour`, 0 `no-distribution`; alle 279 tragen in diesem Lauf auch einen Stationswert (lokal waren es 76, die Lesesicht war älter als IMIS) |
| Breite p10–p90 in Stationshöhe, Median über die 279 Paare | +24 / +48 / +72 h: **9,4 / 26,8 / 25,8 cm** (lokal am 21.11.: 21 / 63 / 57 — andere Wetterlage, dieselbe Folge). Änderung gegen die Laufstunde, +24 h: p10 −3,4 · erwartet −0,7 · p90 +5,3 cm; +72 h: −10,2 · +0,6 · +13,9 cm. An den Zeilen (Medianhöhe, Median über 957): Tag 1 / 2 / 3 / 7 / 14 = 6,8 / 27 / 26,5 / 27,5 / 46 cm |
| **Erwartungswert außerhalb seiner Spanne** | an **3 Paaren** bei +24 h (um 0,1–0,4 cm über p90; die Spanne ist dort 0–0,2 cm breit), an keinem bei +48 / +72 h. An den Zeilen: **95 von 40 194 Werten** (38 Gletscher), **alle ÜBER p90, keiner unter p10**; 74 an Tag 1 (Median 0,2 cm), 21 an den Tagen 9–14 (bis **6,3 cm**, Brennkogelkees Tag 10: erwartet 94,3 cm bei p10–p90 58,4–88,0), 10 Werte um mindestens 1 cm. Der Vertrag verlangt es nicht anders (er prüft nur p10 ≤ p90); lokal war nur Tag 14 an der Medianhöhe gezählt worden (0 von 957, §3i.4b) ⇒ V-GM-109 |

Nicht geprüft: die Spanne gegen Messungen — das erste Paar dafür entsteht mit dem Lauf vom 25.11. 23 UTC (Vorhersage +24 h dieses Laufs gegen den Stationswert jenes Laufs) und braucht Wochen; ein zweiter Lauf mit Spanne (schwankt `seconds`?).

**Nachtrag 25.11. 01:00 UTC — Archiv (V-GM-96):** der Archivlauf `glacier-archiv` Nr. 177 (gestartet 00:55:36 UTC, grün, Archiv-Commit `f44316ef`) hat die Paar-Datei dieses Laufs mit Vorhersage abgelegt: `glacier/v1/2026-11-24/pairs-2026112423.json.gz`, 24 035 B (genau die Größe, die `gm5c-runner-spread.mjs` vorab gerechnet hatte), entpackt 103 448 B und Byte für Byte die veröffentlichte Datei aus `1c9ae206` (468 Paare, 279 mit `fq`). Daneben `pairs-2026112417.json.gz` (15 042 B, entpackt Byte für Byte `snowpack/pairs/2026112417.json` des Daten-Repos). Der Ordner trägt 31 Dateien (vorher 23: dazu `melt-2026112423`, zwei Paar-Dateien, fünf Stationsstunden). Nicht geprüft: ob die Dateien im Archiv bleiben, wenn das Daten-Repo sie nach seiner Aufbewahrung löscht (dafür ist das Archiv da; zu sehen frühestens nach 72 h).

| Nr. | Inhalt | Stand |
|---|---|---|
| V-GM-109 | Der Erwartungswert der Schneehöhe liegt an einzelnen Werten ÜBER dem p90 seiner eigenen Szenarien (95 von 40 194 Zeilenwerten im ersten Runner-Lauf, bis 6,3 cm; nie unter p10). Vermutung, nicht geprüft: der Erwartungswert rechnet mit der erwarteten Niederschlagsmenge, die bei kleiner Regenchance über dem p90 der Szenarien liegt (schiefe Verteilung) — das erklärt Tag 1, die Tage 9–14 mit bis 6 cm sind damit nicht belegt. Mehrwert: eine spätere Anzeige („8 von 10 Szenarien“) zeigt sonst einen erwarteten Wert außerhalb ihres eigenen Bands. Skizze: die 95 Werte nach Ursache trennen (Tag 1 gegen Woche 2, Wert der Regenchance), dann entscheiden: so lassen und benennen, oder die Anzeige nimmt den Median der Szenarien | offen (vor jeder Anzeige, GM-7) |

## 3l. V-GM-81: Höchstwert des Speichers in der Statuszeile des Schmelzlaufs (eigenes kleines Paket; 24.11. abends)

### 3l.1 Diagnose (vor dem Code)

**Was bekannt ist** (§3i.3): der Schmelzlauf hält lokal vorübergehend knapp 1,5 GB (nach vollständigem Aufräumen gemessen), der Prozess belegte höchstens 2,8 GB; an einer von mir gesetzten Grenze von 1 700 MB brach er mit „heap out of memory“ ab. **Was niemand weiß:** wie viel Luft der Runner hat. Das sind zwei verschiedene Grenzen:
- der **Arbeitsspeicher der Maschine** — dagegen steht der Höchstwert des Prozesses (RSS);
- die **Obergrenze des JavaScript-Speichers** von Node (V8) — an ihr starb Lauf 2. Sie hängt von der Node-Version und vom Arbeitsspeicher der Maschine ab (hier 4 144 MB; mit `--max-old-space-size=1700` 1 748 MB) und ist für den Runner nirgends festgehalten.

Eine Zahl allein („`rssMb`“, die Skizze von V-GM-81) beantwortet die Frage deshalb nicht: es braucht den Höchstwert UND die Grenze.

**Was sich messen lässt, ohne den Lauf zu ändern** (gemessen auf dieser Maschine, Node 22.17, `win32`):

| Zahl | Quelle | Was sie ist | Kosten |
|---|---|---|---|
| `rssMb` | `process.resourceUsage().maxRSS` (Kilobyte) | der Höchstwert des Prozesses, vom Betriebssystem geführt (Linux `ru_maxrss`, Windows „Peak Working Set“) — kein Abtasten. Probe: 400 MB belegt und freigegeben ⇒ `maxRSS` 484 MB bei aktuell 258 MB | ein Aufruf am Ende |
| `heapLimitMb` | `v8.getHeapStatistics().heap_size_limit` | die Grenze, an der Node abbricht | ein Aufruf am Ende |
| `heapMb` | höchstes `process.memoryUsage().heapUsed`, abgetastet einmal je Gletscher | der belegte JavaScript-Speicher an den Gletschergrenzen. **Eine Obergrenze des Gehaltenen:** noch nicht aufgeräumter Abfall zählt mit; „gehalten nach vollständigem Aufräumen“ (die 1,5 GB von §3i.3) ließe sich nur mit erzwungenem Aufräumen messen, das den Lauf verlangsamt | 2 094 Abtastungen = 3 ms |

**Was sich ändert.** Nur die Statuszeile: `lines.melt.mem = { rssMb, heapMb, heapLimitMb }`. Kein Dokument, kein Zustand, kein Zeiger. Die Statuszeile trägt schon heute eine Zahl, die von Lauf zu Lauf schwankt (`seconds`); die Prüfer vergleichen sie ohne diese — `mem` kommt dazu. Wer `status.json` liest: die Seite nur `kind` und `killed` (`glacierClient.ts`), der Publisher mischt die Zeile unbesehen ein, kein Vertrag prüft ihre Felder.

**Kein Schalter (E-GM-40).** Rule 2 gilt für Rechenwege; hier ändert sich keine gerechnete Zahl und keine Datei des Produkts — bewiesen am vollen Lauf (Ausgabebaum und Zeiger Byte für Byte, Statuszeile bis auf `mem` und die Laufzeiten). Ein Schalter, der ab Werk aus ist, bräuchte eine Zeile im Workflow, bevor die erste Zahl kommt; die Messung soll mit dem nächsten Push von selbst da sein. Zurück = die Zeile im Code entfernen.

**Was die Zahl nicht ist.** `rssMb` ist der Höchstwert des PROZESSES — auf dem Runner ist das der Lauf (ein Prozess je Lauf); im Prüfer, der viele Läufe in einem Prozess rechnet, nicht. Die Ursache der 1,5 GB (was hält der Producer, solange er Gletscher mit eigenem Antrieb rechnet?) ist damit nicht gefunden — das bleibt offen (V-GM-81, zweiter Teil).

### 3l.2 Entwurf

- `scripts/glacier/lib/runmem.mjs` (neu, rein, die drei Quellen als wahlfreie Eingänge für den Prüfer): `memWatch()` → `{ sample(), line() }`.
- `melt.mjs`: `sample()` einmal je Gletscher in der Schleife; `line()` beim Schreiben der Statuszeile.
- Prüfer `verify:glacier-melt`: die Zeile von Hand (drei Abtastungen ⇒ der höchste; Kilobyte ⇒ MB; die Grenze), im Lauf drei ganze Zahlen > 0 mit `heapMb ≤ heapLimitMb`; die Vergleiche „dieselben Bytes“ nehmen `mem` aus wie `seconds`.

### 3l.3 Umsetzung (24.11.; kein Schalter; lokal committet)

| Teil | Wo | Was |
|---|---|---|
| Messung | `scripts/glacier/lib/runmem.mjs` (neu) | `memWatch()` → `sample()` (eine Abtastung des belegten JavaScript-Speichers) und `line()` = { `rssMb`, `heapMb`, `heapLimitMb` }; die drei Quellen sind wahlfreie Eingänge |
| Producer | `scripts/glacier/melt.mjs` | `mem.sample()` einmal je Gletscher am Anfang der Schleife, `mem: mem.line()` als letztes Feld von `lines.melt` im Status-Patch; `opts.memWatch` nur als Naht des Prüfers. Kein Dokument, kein Zustand, kein Zeiger nennt die Zeile |
| Prüfer | `scripts/verify-glacier-melt.mjs`, Block L | L1 von Hand (Abtastungen 100 · 900 · 300 · 250 MB ⇒ 900; 2 871 296 kB ⇒ 2 804 MB; Grenze in Byte ⇒ MB); L2 im Lauf (genau drei ganze Zahlen über null, nur in der Statuszeile, Dokument / Zustand / Zeiger in zwei Läufen Byte für Byte gleich, eine Abtastung je Gletscher, eine untergeschobene Messung steht Zahl für Zahl da); L3 **Höchstwert, nicht der Stand von jetzt** (ein eigener Prozess belegt 300 MB, gibt sie frei, die Zeile nennt weiter den Stand mit ihnen). Die zwei Vergleiche „dieselben Bytes“ in `verify:glacier-melt` und die zwei in `verify:glacier-snowpack` nehmen `mem` aus wie `seconds` |
| Gegenprobe | `gm5c-mutations.mjs`, zehn Fehler an der Speicherzeile | 10 von 10 bemerkt (§3l.4) |

### 3l.4 Gate V-GM-81 (24.11. abends)

| Prüfung | Ergebnis |
|---|---|
| `verify:glacier-melt` | **78/78** (Block L: L1, L2, L3) |
| `verify:glacier-snowpack` und die übrigen | 72/72; `-weather` 41/41, `-snowcore` 24/24, `-snowcal` 47/47, `-publish` 34/34, `-contract` 64/64, `-stations` 77/77 |
| Typecheck, Build, Budget | grün; 281/281; 2 118,1 / 2 121 KB unverändert |
| **Voller lokaler Lauf am endgültigen Arbeitsbaum** (`final-pairs` gegen `head-pairs`, §3k.4) | **33 von 33 Dateien des Ausgabebaums Byte für Byte wie `b448d652`**, Zeiger gleich, Statuszeile gleich bis auf `mem` und die Laufzeiten — die Zeile von `b448d652` trägt kein `mem`, die neue genau die drei Zahlen |
| **Die drei Zahlen am echten Katalog** (2 094 Gletscher, diese Maschine, Node 22.17, `win32`) | Paare allein: `rssMb` **3 217**, `heapMb` **2 830**, `heapLimitMb` 4 144 · mit Spanne: 3 205 / 2 806 / 4 144. Der Höchstwert des Prozesses passt zu §3i.3 (dort 2 804 und 2 790 MB mit einem älteren Stand); **die Spanne kostet keinen eigenen Speicher** (wie dort gemessen). `heapMb` liegt weit über den 1,5 GB „gehalten nach vollständigem Aufräumen“ — es ist die Obergrenze, Abfall zählt mit; hier bei 68 % der Grenze |
| Gegenprobe (zehn Fehler an der Speicherzeile, §3k.5) | **10 von 10 bemerkt**, keiner nur als Abbruch: höchste statt letzter Abtastung, letzte Abtastung beim Schreiben, Kilobyte, Grenze (alle L1), **„Stand von jetzt statt Höchstwert“ (L3)**, Abtastung in der Schleife, Zeile fehlt, untergeschobene Messung (L2), Zeile im Schmelzdokument bzw. im Zeiger (L2 und die älteren Byte-Vergleiche H1, H5, K1, K5, I3, J2) |
| Linux | L3 lief nur auf dieser Maschine (`win32`: 351 MB während der Belegung, 51 MB danach, die Zeile nennt 351). Die Prüfung verlangt nur „`rssMb` ≥ Stand während der Belegung“ — das hält überall; ob sie auf dem CI-Runner auch den eingebauten Fehler „Stand von jetzt“ bemerkt, hängt daran, dass freigegebener Speicher dort an das System zurückgeht (nicht gemessen, V-GM-101) |
| Runner | beim Schließen des Gates nichts gepusht; gepusht am 24.11. 21:24 UTC (`32b400df`), die Zahlen des ersten Laufs: §3l.5 |

Die fünf Fragen: (1) Funktionserhalt — kein Dokument, kein Zustand, kein Zeiger ändert sich (voller Lauf 33 von 33, Prüfer L2), die Statuszeile bekommt ein Feld; (2)–(5) keine Anzeige geändert, kein Byte im Bundle.

**Was die drei Zahlen sagen werden** (nach dem Push im ersten Lauf zu lesen, `status.json` → `lines.melt.mem`): `heapLimitMb` ist die Grenze von Node auf dem Runner — sie ist dort vermutlich kleiner als hier, weil sie am Arbeitsspeicher der Maschine hängt (nicht gemessen). Node räumt vor der Grenze auf; `heapMb` wird dort also nicht 2,8 GB zeigen, sondern sich der Grenze von unten nähern. Kritisch wird es, wenn das GEHALTENE (lokal knapp 1,5 GB) an die Grenze kommt. `rssMb` steht gegen den Arbeitsspeicher der Maschine.

**Gate V-GM-81: gebaut und geprüft, ohne Schalter, committet am 24.11. (`32b400df`) und von Jan gepusht am 24.11. 21:24 UTC. E-GM-40 entschieden (wie gebaut). Die drei Zahlen des ersten Laufs: §3l.5.**

| Nr. | Inhalt | Stand |
|---|---|---|
| E-GM-40 | Speicherzeile ohne Schalter (gebaut) oder hinter `GLACIER_MELT_MEM`, ab Werk aus? Ohne Schalter ändert sich mit dem nächsten Push die Statuszeile jedes Schmelzlaufs um das eine Feld — sonst nichts | **entschieden: Jan 24.11. abends — wie gebaut, kein Schalter** |
| V-GM-81 | zweiter Teil bleibt: WAS der Producer hält, solange er Gletscher mit eigenem Antrieb rechnet (`forcings` in `melt.mjs` trägt die Antworten aller 957, dazu der Zwischenspeicher des Cube-Lesers?) | offen; die Zahlen vom Runner sind gelesen (§3l.5: 3 315 / 2 830 / 4 144 MB, Grenze wie lokal) — `heapMb` misst den Bedarf nicht |
| V-GM-101 | L3 unterscheidet Höchstwert und Stand von jetzt nur dort, wo ein Prozess freigegebenen Speicher an das System zurückgibt; gemessen nur unter Windows. Rot wird die Prüfung deshalb nirgends — sie könnte auf dem CI-Runner aber blind sein. Mehrwert: eine Prüfung, von der man weiß, was sie sieht. Skizze: im ersten CI-Lauf nach dem Push die Zahlen von L3 lesen (`during`, `now`), oder die Gegenprobe „Stand von jetzt“ einmal auf Linux laufen lassen | offen (nach dem Push) |

### 3l.5 Die drei Zahlen vom Runner (Lauf `2026112423`, 24.11. 23:23 UTC — der erste des Producers `32b400df`, zugleich der erste mit Spanne)

Runner: `ubuntu-latest` (von GitHub gestellt), Node 22 (`actions/setup-node`), ein Prozess je Lauf; der Schritt „Melt run“ dauerte 208 s.

| Zahl | Runner | lokal (§3l.4; `win32`, Node 22.17) | Was sie sagt |
|---|---|---|---|
| `heapLimitMb` | **4 144** | 4 144 | Die Grenze von Node ist auf dem Runner DIESELBE wie hier — meine Erwartung aus §3l.4 („vermutlich kleiner“) war falsch. Niemand setzt sie im Workflow (kein `--max-old-space-size`, kein `NODE_OPTIONS`) |
| `heapMb` | **2 830** (68 % der Grenze) | 2 830 (Paare allein) · 2 806 (mit Spanne) | Auf den MB dieselbe Zahl wie lokal, bei anderem Cube, anderem Betriebssystem und eingeschalteter Spanne. Das spricht dafür, dass die Zahl zeigt, bis wohin Node den Abfall wachsen lässt, bevor es aufräumt — nicht, was der Lauf braucht (nicht belegt; das Gehaltene nach vollständigem Aufräumen war lokal knapp 1,5 GB, §3i.3). Gegen die Grenze bleiben 1 314 MB |
| `rssMb` | **3 315** | 3 217 · 3 205 | Höchstwert des Prozesses. Der Arbeitsspeicher des Runners ist NICHT gemessen; GitHub nennt für diese Runner-Klasse in öffentlichen Repos 16 GB — dann wäre es ein Fünftel |

**Was daraus folgt.** Der Lauf ist auf dem Runner nicht knapper als lokal: dieselbe Grenze, derselbe Stand darunter. Die Frage von V-GM-81 („wie viel Luft hat der Runner?“) ist für die Grenze von Node beantwortet (wie lokal: an 1 700 MB brach der Lauf ab, bei 4 144 MB läuft er). Offen bleibt der zweite Teil (WAS der Producer hält) und dass `heapMb` den Bedarf nicht misst: wer wissen will, wie nah das Gehaltene der Grenze kommt, muss es mit erzwungenem Aufräumen messen (lokal, nicht im Betrieb). Die Spanne kostet auch auf dem Runner keinen sichtbaren eigenen Speicher (ein Lauf ohne Spanne mit diesem Producer fehlt zum Vergleich — der nächste käme nur nach dem Ausschalten).

Nicht gemessen: der Arbeitsspeicher des Runners; ein zweiter Lauf (schwanken die Zahlen?); V-GM-101 (L3 unter Linux) — der Schmelzlauf führt den Prüfer nicht aus.

## 3m. GM-9: Neuschneedichte aus Temperatur und Wind (V-GM-50) — Diagnose, Schritte 0 und 1, geschlossen (24.11. nachts)

Auftrag (Jan, 24.11. abends): zuerst messen, ob eine Regel aus Temperatur und Wind die feste Neuschneedichte von 96 kg/m³ schlägt, die Regel vor dem ersten gewerteten Lauf einfrieren, dann anhalten. Kein Code in `scripts/glacier/lib` oder `src`, kein voller lokaler Lauf, keine Gegenprobe (die Maschine lief am Abend in Speichermangel; erster Runner-Lauf mit Spanne um 23:20 UTC). buscosun Fusion und die Stationslinie nur gelesen.

Werkzeug `audit/gletscher-schneemodell/gm9-density.mjs` (Modus `count` zählt nur, `score` läuft nur bei passendem Hash der Regel). Regel `gm9-method-frozen.md`, sha256 `86004805…` (`gm9-method-frozen.sha256`), Werkzeug beim Einfrieren `6ffa40c1…`. Bericht `gm9-report.json` (35 s). Daten: Cache von GM-3 (`C:\dev\buscosun-glacier-cache\gm3\`, SLF-Messfelder, SwissMetNet, GeoSphere `klima-v2-1d`) und neu `C:\dev\buscosun-glacier-cache\gm9\dwd\` (DWD `water_equiv` und `kl`, 61 Stationen ab 800 m; Zugspitze). Nichts in `buscosun-data` oder `buscosun-archiv`.

Reihenfolge: (1) laden und zählen, (2) Selbstprüfung an erfundenen Ereignissen, (3) Regel einfrieren und hashen, (4) gewerteter Lauf. Hash und Lauf: 24.11. 21:57 UTC in einem Aufruf. **Schreibfehler in der eingefrorenen Datei:** sie nennt „gegen 22:10 UTC“; richtig ist 21:57 UTC (Hash-Datei und Bericht). Nach dem Lauf nicht korrigiert, weil das den Hash bräche.

### 3m.1 Daten (Zählung vor dem Einfrieren)

| Land | Wahrheit | Ereignisse | Rolle |
|---|---|---|---|
| CH | SLF-Messfelder: Neuschnee und sein Wasserwert vom selben Brett; SwissMetNet ≤ 3 km / 200 m, Stundenwerte T, Wind, Feuchte | 2 362 zugelassen wie in GM-3, **2 324 gewertet** (Wind an allen 24 h, Feuchte ≥ 20 h) an 18 Messfeldern, 14 Winter 2012–2025; 576 unter 1 500 m, 1 054 1 500–1 999 m, **694 ab 2 000 m (praktisch nur Weissfluhjoch, 2 536 m)** | gewertet |
| AT | `klima-v2-1d`: Neuschnee von Hand, Wasser aus dem **Messer** | 8 061 Tage an 57 Stationen ab 1 000 m, 2016–2025 | beschreibend |
| DE | DWD `water_equiv`: Wasserwert der ganzen Decke, Zuwachs zwischen zwei Messtagen | 775 Intervalle mit Temperatur an 18 Stationen mit Klimadaten (1 674 ohne) | beschreibend |

**DWD `water_equiv` (Jans Frage zuerst):** die Reihe endet **nicht** 2022 — `recent` reicht bis 23.11.2026 (1 177 Stationen in der Liste). Aber: gemessen wird meist montags, mittwochs und freitags, und zwar der Wasserwert der **ganzen** Schneedecke; die aktiven Stationen liegen höchstens auf 1 141 m (Hochgfäll), die höchsten der Geschichte auf 1 486 m (Feldberg, bis 2014) und 1 436 m (Großer Arber, bis 2016); die Zugspitze ist nicht dabei. Eine Neuschneedichte misst diese Reihe nicht (V-GM-106).

### 3m.2 Tabellen — gemessene Dichte je Ereignis (kg/m³, Zelle: Zahl / Median)

**Schweiz, Brett (wahres Wasser).** Alle 2 324 Tage: p10 / Median / p90 **65 / 100 / 147**; je Band 94 / 100 / 100.

Tagesmittel der Temperatur × Wind (Tagesmittel 10 m):

| Band | T | u < 2 m/s | 2–4 | ab 4 | zusammen |
|---|---|---|---|---|---|
| < 1 500 m | < −8 °C | 9 / 91 | 3 / 73 | 1 / – | 13 / 91 |
| | −8 … −3 | 132 / 90 | 72 / 92 | 44 / 90 | 248 / 91 |
| | ab −3 | 206 / 100 | 76 / 94 | 33 / 100 | 315 / 98 |
| 1 500–1 999 m | < −8 | 23 / 67 | 31 / 78 | 34 / 110 | 88 / 83 |
| | −8 … −3 | 261 / 89 | 204 / 90 | 123 / 106 | 588 / 91 |
| | ab −3 | 241 / 103 | 91 / 110 | 46 / 108 | 378 / 107 |
| ab 2 000 m | < −8 | 0 | 10 / 73 | **277 / 84** | 287 / 83 |
| | −8 … −3 | 1 / – | 28 / 84 | 296 / 109 | 325 / 107 |
| | ab −3 | 0 | 13 / 100 | 69 / 125 | 82 / 122 |

Feuchttemperatur × Wind: dasselbe Bild (ab 2 000 m: < −8 °C 87, −8 … −3 109, ab −3 127; 1 500–1 999 m windstill und kalt 70). Ein Wert „300“ in einer Zelle mit einem Tag ist ausgelassen. Zellen unter 10 Tagen tragen nur den Median.

**Österreich, Wasser aus dem Messer** (Minderfang; in der Schweiz fängt der Messer an denselben Tagen 70 % des Brettwassers, GM-3 D): alle 8 061 Tage 40 / **70** / 125. Ab 2 000 m: < −8 °C 62 (1 703 Tage, fast alle ab 4 m/s), −8 … −3 75, ab −3 95; bei Wind ab 4 m/s und ab −3 °C 103. Unter 1 500 m kaum ein Gang (57–65). Dieselbe Richtung wie in der Schweiz (kalt leicht, warm und windig dicht), auf einem um den Minderfang tieferen Niveau; der Minderfang hängt selbst am Wind, deshalb nicht gewertet.

**Deutschland, Zuwachs der ganzen Decke über 1–3 Tage:** 66 / **164** / 315 (unter 1 000 m 140, ab 1 000 m 204), fast nur Gipfelstationen (Brocken 135 Intervalle, Fichtelberg 96, Großer Arber 56), fast alle Intervalle bei Wind ab 4 m/s. Das ist die Dichte des Zuwachses nach Setzung des Altschnees, Windpressung und Regen, keine Neuschneedichte (V-GM-106); nicht gewertet.

**Wo 96 danebenliegt** (CH, mittlerer Fehler der Neuschneehöhe mit 96 im Kern; Ablagedichte ρ*, die genau trifft, Median):

| T | u < 2 | 2–4 | ab 4 |
|---|---|---|---|
| < −8 °C | 32 Tage: −3,3 cm, ρ* 67 | 44: −2,8 cm, ρ* 70 | 312: −1,1 cm, ρ* 82 |
| −8 … −3 | 394: −2,3 cm, ρ* 82 | 304: −2,2 cm, ρ* 82 | 463: +1,6 cm, ρ* 99 |
| ab −3 | 447: +0,8 cm, ρ* 95 | 180: +0,6 cm, ρ* 95 | 148: +1,7 cm, ρ* 104 |

Die Richtung ist da: kalt und windstill leichter, warm und windig dichter. Wie viel davon eine Regel aus Tagesmitteln voraussagen kann, sagt die Wertung.

### 3m.3 Wertung nach der eingefrorenen Regel (CH, 2 324 Tage, ein Winter ausgelassen)

Kennzahl: mittlerer Fehler der Neuschneehöhe (cm) des Schneekerns auf leerem Brett, 24 h, mit gemessenem Wasser. „Streuung erklärt“ = 1 − mittlerer |log(Brettdichte Modell / gemessen)| gegen die je Rückhaltung geschätzte Konstante C1 (in Klammern dasselbe als R² in log).

| Regel | Fehler | Bias | gegen C1 | gegen 96 | Streuung erklärt | Winter besser als C1 | ab 2 000 m (694 Tage) | trägt |
|---|---|---|---|---|---|---|---|---|
| C0 — 96 fest (heute) | **4,43** | −0,3 | +3,8 % | 0 | — | 12 / 14 | 3,03 | — |
| C1 — Konstante, geschätzt (88 kg/m³) | 4,60 | +1,2 | 0 | −4,0 % | 0 | — | 3,36 | — |
| **F1** log ρ = a + b·T + c·√u | 4,44 | +1,3 | **+3,6 %** | −0,2 % | 4,8 % (6,3 %) | 11 / 14 | **2,85** (+15 % gegen C1) | nein |
| F2 wie F1 mit Feuchttemperatur | 4,44 | +1,3 | +3,5 % | −0,3 % | 4,8 % (6,2 %) | 12 / 14 | 2,87 | nein |
| F3 nur Temperatur | 4,60 | +1,3 | +0,1 % | −3,8 % | 1,0 % | 8 / 14 | 3,55 | nein |
| F4 nur Wind | 4,58 | +1,1 | +0,6 % | −3,4 % | 0,9 % | 10 / 14 | 3,13 | nein |
| L1 Vionnet 2012 wie gedruckt | 5,51 | −4,0 | −19,7 % | −24,5 % | — | 4 / 14 | 3,68 | nein |
| L2 Anderson 1976 | 5,16 | −0,7 | −12,0 % | −16,5 % | — | 5 / 14 | 3,81 | nein |
| L3 Hedstrom & Pomeroy 1998 | 5,09 | +2,5 | −10,5 % | −14,8 % | — | 3 / 14 | 4,33 | nein |
| L1s k × Vionnet (k = 0,70) | 4,72 | +1,8 | −2,4 % | −6,5 % | 2,1 % | 6 / 14 | **2,71** | nein |
| L2s k × Anderson | 5,61 | +2,2 | −21,8 % | −26,6 % | — | 0 / 14 | 5,59 | nein |
| L3s k × Hedstrom & Pomeroy | 4,75 | +1,5 | −3,2 % | −7,3 % | — | 5 / 14 | 3,86 | nein |
| Negativkontrolle (F1 mit vertauschtem Wetter) | 4,61 | +1,1 | −0,1 % | −4,1 % | −0,1 % | 6 / 14 | 3,35 | besteht nicht ⇒ Urteil gültig |

Voll angepasst (alle Winter): F1 log ρ = 4,453 + 0,0396·T + 0,119·√u (ρ* bei −5 °C und 4 m/s: 89 kg/m³), F2 4,493 + 0,0402·Tw + 0,116·√u.

**Urteil des Skripts: NEIN.** Keine Form mit Temperatur und Wind trägt (F1, F2, L1, L1s). Die beste (F1) ist 3,6 % besser als eine gleich geschätzte Konstante (nötig: 5 %) und gleichauf mit 96 (−0,2 %). Temperatur und Wind erklären rund **5–6 %** der Streuung der Dichte von Tag zu Tag; jede für sich rund 1 %. Die Formen aus der Literatur wie gedruckt sind 10–25 % schlechter als 96. Die Negativkontrolle gewinnt nichts.

**Lesart (meine, nach dem Lauf):**
- Die Abhängigkeit ist echt (Tabellen §3m.2, Negativkontrolle bei 0), aber klein gegen die Streuung je Ereignis: die gemessene Dichte reicht an denselben Bedingungen von rund 65 bis 150 kg/m³. Eine Regel aus Tagesmitteln von Temperatur und Wind holt davon wenig heraus.
- **Fehler meiner Regel (V-GM-103):** angepasst wird auf den gewichteten Betrag in log ρ*, gewertet auf den Fehler der Neuschneehöhe in cm. Die beiden Ziele sind nicht gleich: die geschätzte Konstante landet bei 88 statt bei den 96, die den Fehler in cm klein machen (GM-3), und jede angepasste Form erbt rund +1,2 cm Bias. Bedingung 1 vergleicht Gleiches mit Gleichem (F1 gegen C1, beide mit demselben Ziel: 3,6 %) und entscheidet das Urteil für sich; Bedingung 2 (gegen 96) wird durch den Fehler benachteiligt. Ohne den Bias läge F1 grob 3–4 % unter 96 — auch das unter der Grenze von 5 %. Das ist eine Schätzung, kein Lauf.
- **Ab 2 000 m sieht es anders aus (V-GM-104, explorativ, nicht Teil des Urteils):** F1 2,85 cm, k × Vionnet 2,71 cm gegen 3,03 cm mit 96 (6 % bzw. 11 % besser). Die 694 Tage dort sind aber fast alle EIN Messfeld (Weissfluhjoch); ob das auf andere Höhenlagen und auf Gletscherhöhe übergeht, ist mit diesen Daten nicht zu prüfen.

### 3m.4 Was das für V-GM-50 heißt

V-GM-50: die 24-h-Änderung bei Schneefall liegt beim 0,76-Fachen der Station, der Stand beim 1,86-Fachen (§3h.3). Vermutung: 96 kg/m³ ist zu dicht.
- Nach dieser Messung ist 96 **im Mittel nicht zu dicht** (Brettmedian 100, ρ* 91; bester fester Wert für die Neuschneehöhe 96). Die Werte 52–81 aus §3a waren Dichten aus **Messer**-Wasser; 68 / 0,70 ≈ 97 (§3c.5). Österreich bestätigt das von der anderen Seite (Messer-Median 70).
- In einer kalten, windigen Lage wie 20.–23.11. (Zugspitze laut DWD-Tageswerten −8,5 bis −13,6 °C, Wind im Tagesmittel 5,6–11 m/s) liegt die Dichte, die trifft, in der Schweiz bei rund 82 (ab 2 000 m, unter −8 °C, ab 4 m/s: Brettmedian 84, 277 Tage). Mit 82 statt 96 wäre der Neuschnee um rund 17 % höher, das Verhältnis also rund 0,89 statt 0,76. **Rechnung aus einer Tabellenzelle, nicht am Ereignis gemessen.** Die Dichte kann damit höchstens einen kleinen Teil der Lücke erklären; das Verhältnis von 1,9, das der Faktor erwarten ließe (B2 in §3h.3), erreicht sie bei Weitem nicht. Der größere Teil bleibt beim Niederschlag des Antriebs (für 20.–23.11. Analysen und an zwei Schweizer Tagen buscosun Fusion) und bei der Setzung bzw. dem Windabtrag an den Stationen (V-GM-55).

**Schattenpaare (Schritt 0, letzter Punkt):** im Daten-Repo liegt genau eine Paar-Datei (`snowpack/pairs/2026112417.json`, gelesen 21:58 UTC über die GitHub-API, nur lesend), dazu die Schneedecken-Läufe `2026112323`, `…05`, `…11`, `…17` — keine zwei Läufe 24 h auseinander. Im Archiv liegt noch keine `pairs-*.json.gz` (Archivlauf 00:47 UTC steht aus, V-GM-96). **Eine 24-h-Änderung aus Schattenpaaren gibt es frühestens mit dem Lauf vom 25.11. 17 UTC** gegen `2026112417`. Das Ereignis 20.–23.11. liegt vor den Paaren; seine 0,76 stammen aus der nachgerechneten Bahn des Startzustands (Analyse-Antrieb, `gm4-probe.mjs`), nicht aus Paaren (V-GM-107).

### 3m.5 Referenzpaar Zugspitze

| Frage | Befund |
|---|---|
| Ist die DWD-Station Zugspitze dem Nördlichen Schneeferner zugeordnet? | **ja, aber nicht für Schnee:** Zuordnung `20261120-1.4` — `gl_de_noerdlicher-schneeferner` → `de:05792` (2 956 m, 0,2 km vom Umriss, +373 m über der Medianhöhe) für `t`, `wind`, `gust`, `rad`; ebenso Höllentalferner (0,4 km, +557 m). Kein Eintrag `snow`; Deutschland hat 0 Schneepaare (§3h.2) |
| Liefert sie eine Schneehöhe? | **nein.** In den Stationsslots kommt `de:05792` aus `dwd10` (10-min-Daten des DWD) mit `t`, `td`, `rh`, `ff`, `dd`, `fx`, `gr` — die 10-min-Reihen des DWD haben keine Schneehöhe. In den DWD-Tageswerten (`kl`, `recent`) steht die Schneehöhe `SHK_TAG` bis 1.2.2026 an jedem Tag, **seit 2.2.2026 an keinem** (ebenso der Niederschlag `RSK`); die Neuschneehöhe (`more_precip`, `NSH_TAG`) fehlt in der ganzen Datei |
| Was fehlt | eine Quelle für die Schneehöhe an der Zugspitze in `obs/v1` (Kandidaten: DWD-POI/SYNOP stündlich, Station 10961 — nicht geprüft; Q10 Lawinenwarndienst Bayern, Lizenz offen) und, für eine Neuschneedichte, ein Wasserwert. Die Stationslinie ist nicht geändert (V-GM-105) |

Stand und 24-h-Änderung dieses Paars können deshalb aus den Schattenpaaren nicht gezeigt werden.

### 3m.6 Vorschlag, was gebaut wird

Das Urteil ist „nein“. **Ich schlage vor, den Konstantensatz `tw` jetzt NICHT zu bauen.** Gebaut ergäbe er eine Regel, die nach der eigenen Messregel nicht trägt (gleichauf mit 96, 3,6 % gegen eine gleich geschätzte Konstante), hinter einem Schalter, den niemand einschalten sollte.

Stattdessen, in dieser Reihenfolge:
1. **GM-9b — Höhe messen statt schätzen (nur Messung, neue eingefrorene Regel):** die SLF-Messfelder zusätzlich mit IMIS-Stationen (Q2, freigegeben; Temperatur, Wind und Feuchte auf 2 000–3 000 m) paaren, damit ab 2 000 m mehr als ein Messfeld wertet; gewertet nur ab 2 000 m, ein Messfeld und ein Winter ausgelassen, Anpassung direkt auf den Fehler in cm (behebt V-GM-103). Trägt dort eine Form, dann `--density=tw` als dritter Konstantensatz wie im Auftrag (Schritte 2–4), mit Gültigkeit ab einer Höhe. Trägt nichts, bleibt 96 und GM-9 ist geschlossen.
2. **V-GM-50 über den Niederschlag beantworten:** Schritt 3 des Auftrags (die GM-4-Rechnung der 24-h-Änderung) braucht keine neue Dichte, um zu zeigen, wie viel die Dichte höchstens ausmacht: mit 82 und 96 an derselben Bahn des Startzustands gerechnet (Werkzeug `gm4-probe.mjs`, ohne Producer-Lauf), dazu ab 25.11. 17 UTC die Paare mit dem Antrieb von buscosun Fusion.
3. Die Zugspitze als Referenzpaar braucht eine Schneehöhe in `obs/v1` — Änderung an der Stationslinie, Jans Wort (V-GM-105).

### 3m.7 Befunde

| Nr. | Inhalt | Mehrwert · Skizze | Stand |
|---|---|---|---|
| V-GM-103 | Die eingefrorene Regel von GM-9 passt auf den gewichteten Betrag in log ρ* an, wertet aber den Fehler der Neuschneehöhe in cm. Die geschätzte Konstante landet bei 88 statt 96, jede angepasste Form trägt rund +1,2 cm Bias; der Vergleich mit 96 ist dadurch benachteiligt (Urteil bleibt „nein“: auch gegen die gleich geschätzte Konstante nur 3,6 %) | ein fairer Vergleich mit dem heutigen Wert · in der nächsten Runde direkt auf den Fehler in cm anpassen (Simplex über den Kern) oder den Achsenabschnitt danach auf den Median der Neuschneehöhe stellen | offen, in V-GM-108 |
| V-GM-104 | Ab 2 000 m (694 Tage, fast nur Weissfluhjoch) sind Temperatur-Wind-Formen 6–11 % besser als 96 (F1 2,85, k × Vionnet 2,71 gegen 3,03 cm) — nach dem Lauf gesehen, nicht Teil des Urteils | die Höhe, auf der die Gletscher liegen · GM-9b: Messfelder zusätzlich mit IMIS-Stationen paaren, nur ab 2 000 m werten, ein Messfeld ausgelassen | offen, in V-GM-108 |
| V-GM-105 | Die Zugspitze liefert keine Schneehöhe: `obs/v1` führt sie aus den 10-min-Daten des DWD (ohne Schneehöhe), die DWD-Tageswerte haben `SHK_TAG` seit 2.2.2026 nicht mehr, Neuschneehöhe nie. Deutschland hat damit kein Schneepaar | das einzige deutsche Referenzpaar (Nördlicher Schneeferner, Höllentalferner) · Schneehöhe der Zugspitze aus den stündlichen POI/SYNOP-Meldungen des DWD in `obs/v1` (Station 10961; Änderung an der Stationslinie, Jans Wort) oder Q10 (LWD Bayern, Lizenz offen) | offen |
| V-GM-106 | DWD `water_equiv` misst den Wasserwert der ganzen Decke, meist dreimal je Woche, an Stationen bis 1 141 m (keine Zugspitze); der Zuwachs zwischen zwei Messtagen hat im Median 164 kg/m³ (Setzung, Windpressung, Regen) | keine Fehleichung aus einer ungeeigneten Reihe · als Wahrheit für Neuschneedichte nicht verwenden; für die Setzung des Altschnees (V-GM-38) könnte sie taugen | Hinweis |
| V-GM-107 | Aus den Schattenpaaren gibt es noch keine 24-h-Änderung: eine Paar-Datei (`2026112417`), keine zwei Schneedecken-Läufe 24 h auseinander, im Archiv noch keine Paare; das Ereignis 20.–23.11. liegt vor den Paaren | V-GM-50 mit dem Antrieb des Betriebs · ab 25.11. 17 UTC Paare im 24-h-Abstand lesen; für das Ereignis die Bahn des Startzustands mit zwei Dichten rechnen (§3m.6 Punkt 2) | offen |

Nicht gemessen: die Dichte auf Gletscherhöhe (Bretter bis 2 690 m, gewertet bis 2 536 m); Schneefälle unter 10 cm (V-GM-20); das Ereignis 20.–23.11. selbst; Feuchttemperatur in Österreich (die Tagesdateien tragen keine Feuchte).

Stand nach Schritt 1 (24.11. nachts, vor Jans Wort): Schritte 0 und 1 erledigt, angehalten, nichts committet; offen E-GM-41.

### 3m.8 Jans Entscheidung E-GM-41 und Abschluss (24.11. nachts)

| Nr. | Entscheidung (Jan, 24.11.) |
|---|---|
| E-GM-41 | (1) `--density=tw` wird **nicht** gebaut; die Dichte bleibt 96 kg/m³ (Konstantensatz `board`). (2) **Kein GM-9b jetzt**; festgehalten als ein Befund (V-GM-108: IMIS-Paarung ab 2 000 m, ein Messfeld ausgelassen) mit dem gemessenen Hinweis vom Weissfluhjoch. (3) **Keine Nachrechnung von V-GM-50 mit 82 gegen 96** (§3m.6 Punkt 2 entfällt); die Frage bleibt offen, und die Schattenpaare beantworten sie ab 25.11. 17 UTC mit dem Antrieb von buscosun Fusion. Commit der GM-9-Dateien auf Jans Wort, kein Push. |

**Gate GM-9: gemessen, die Regel trägt nicht, nichts gebaut.** Beleg: `gm9-report.json` (Lauf 24.11. 21:57 UTC, Hash der Regel `86004805…` gegen `gm9-method-frozen.sha256`), Urteil vom Skript (§3m.3), Negativkontrolle ohne Gewinn. Kein Code unter `scripts/glacier/lib`, `scripts/glacier/*.mjs` oder `src`, kein Producer-Lauf, nichts im Daten- oder Archiv-Repo; buscosun Fusion und die Stationslinie nur gelesen. Die Zugspitze bleibt ohne Schneehöhe (V-GM-105 offen, die Stationslinie ist nicht angefasst).

**Berichtigte Lesart von §3a (M-2):** der Satz „Die Neuschneedichte stimmt … im Mittel 68 kg/m³, je Station 52–81“ rechnete mit dem Wasser des **Niederschlagsmessers**. Der Messer fängt an Schneefalltagen rund 70 % des Brettwassers (Minderfang, GM-3 D, §3c.5); die Dichte des Neuschnees aus wahrem Wasser liegt bei 68 / 0,70 ≈ 97 kg/m³ (SLF-Brett: Median 100, §3m.2). Die 52–81 sind deshalb **keine** gemessenen Neuschneedichten, und die Vermutung in V-GM-50 („96 gegen gemessen 52–81“) fällt mit ihnen: 96 ist im Mittel nicht zu dicht. Der Text von §3a bleibt als Stand vom 22.11. stehen; dort ist ein Verweis hierher nachgetragen.

**V-GM-50 nach GM-9:** die Dichte erklärt die 0,76 der 24-h-Änderung höchstens zu einem kleinen Teil (Tabellenrechnung §3m.4, keine Messung am Ereignis; auf Jans Wort nicht nachgerechnet). Offen bleibt, wie viel davon am Niederschlag des Antriebs und wie viel an Setzung und Windabtrag an den Stationen liegt. Antworten geben die Schattenpaare: ab dem Lauf vom 25.11. 17 UTC gegen `2026112417` gibt es die erste 24-h-Änderung mit dem Antrieb von buscosun Fusion (V-GM-107).

| Nr. | Inhalt | Mehrwert · Skizze | Stand |
|---|---|---|---|
| V-GM-108 | **GM-9b, nicht jetzt (E-GM-41):** ab 2 000 m wertet heute praktisch nur ein Messfeld (Weissfluhjoch, 2 536 m, 694 Tage); dort sind Temperatur-Wind-Formen gemessen 6–11 % besser als 96 (F1 2,85 cm, k × Vionnet 2,71 cm gegen 3,03 cm; nach dem Lauf gesehen, nicht Teil des Urteils, V-GM-104). Ob das auf Gletscherhöhe trägt, sagen diese Daten nicht | die Höhe, auf der die Gletscher liegen · SLF-Messfelder zusätzlich mit IMIS-Stationen paaren (Temperatur, Wind, Feuchte auf 2 000–3 000 m), nur ab 2 000 m werten, ein Messfeld und ein Winter ausgelassen, Anpassung direkt auf den Fehler in cm (behebt V-GM-103); neue eingefrorene Regel; erst danach über `tw` reden | offen (Jans Wort für den Start) |

Stand der übrigen Befunde: V-GM-103 und V-GM-104 gehen in V-GM-108 auf; V-GM-105 offen (Zugspitze, stündliche DWD-Meldungen der Station 10961 nicht geprüft); V-GM-106 Hinweis; V-GM-107 offen bis zum Lauf vom 25.11. 17 UTC.

**Stand GM-9: geschlossen (24.11. nachts).** Committet auf Jans Wort, nicht gepusht: `audit/gletscher-schneemodell/gm9-density.mjs`, `gm9-method-frozen.md`, `gm9-method-frozen.sha256`, `gm9-report.json`, dieses Audit, `CLAUDE.md`, `MANUELLE-SCHRITTE.md` (§125).

## 3n. GM-10, Schritt 0: Lässt sich der Faktor eines Gletschers vorhersagen? (25.11., nur Messung)

Diagnose, Inventar, Zahlen und Befunde: `audit/gletscher-schneemodell/gm10-diagnose.md`. Regel `gm10-method-frozen.md` (sha256 `d487643d…`, eingefroren 25.11. 07:36:45 UTC nach dem synthetischen Wiederfindungstest), Werkzeuge `gm10-q20.py`, `gm10-snowgrid.mjs`, `gm10-terrain.py`, `gm10-factor.mjs` (alle in diesem Ordner). Der volle Bericht mit Werten je Gletscher liegt nur lokal (`C:\dev\buscosun-glacier-cache\gm10\report.json`, Lizenzfrage GLAMOS offen). Kein Producer-Code, nichts im Daten- oder Archiv-Repo, kein Commit.

- **Daten:** Q20 (SLF, 250 m, Winter 2016–2025) lag vollständig im Zwischenspeicher, md5 stimmt; Version 1.0 mit um 2 000 m falsch beschriftetem Nordwert, korrigiert und am Höhenmodell geprüft (V-GM-110). SNOWGRID für Österreich in 3 Abrufen. Gewertet: Schweiz 32 von 35 Gletschern (377 Winter), Österreich 8 (87 Winter, 1-km-Zellen, vier Gletscher an einer Zelle).
- **Ergebnis (Winterbilanzfehler, ein Gletscher ausgelassen, exakt mit dem Kern):**

| Form | Land | Form | Landeswert a′ / a | eigener Faktor b | Gewinn gegen a′ | Lücke geschlossen | Vertauschung p | Urteil des Skripts |
|---|---|---|---|---|---|---|---|---|
| G1: Faktor, den das Gitter verlangt (Q20) | CH | **334,8** | 406,1 / 402,3 | 207,7 | **17,6 %** | 35 % | 0,005 | **trägt** |
| G1 (SNOWGRID) | AT | 341,1 | 411,3 / 425,3 | 361,8 | 17,1 % | 132 % | 0,005 | nicht entscheidbar (8 Gletscher) |
| T3: Höhe, Exposition, Fläche | CH + AT | 352,1 | 401,7 / 402,2 | 233,0 | 12,4 % | 30 % | 0,005 | trägt |
| G2: Schneewasser relativ zur Region | CH / AT | 420,6 / 455,8 | 406,1 / 411,3 | — | −3,6 / −10,8 % | — | 0,88 / 0,76 | (sekundär) nichts |

  Ohne Mont Collon: G1-CH 14,3 %. Fehler eines vorhergesagten Faktors (Std. in ln) 0,20 statt 0,27 mit dem Landeswert. Windexposition und Lawineneinzug tragen nichts.
- **Vorschlag:** bauen nur für die Schweiz mit G1, als eigenes Paket GM-10b hinter einem Schalter (aus), mit Q20 Version 1.1 und der Hypsometrie des Builds; Österreich und Deutschland behalten den Landeswert. Vor dem Bau: Lizenzfrage GLAMOS (wie E-GM-37/38), ob Gitter + Gelände zusammen gemessen werden (V-GM-112), Abhängigkeit von `TF`/`SRF` (V-GM-89).
- Befunde V-GM-110 … V-GM-117 (`gm10-diagnose.md` §9). Offen: Jans Entscheidung.
- **Stand Schritt 0:** committet auf Jans Wort (`5ae0800e`), nicht gepusht.

**Schritt 0b (25.11., nur Messung): Gitter + Gelände gegen das Gitter allein** — `gm10-diagnose.md` §11, Regel `gm10b-method-frozen.md` (sha256 `cffb09ee…`, eingefroren 09:52:19 UTC nach dem synthetischen Test), Werkzeug `gm10b-combine.mjs`; voller Bericht nur lokal (`gm10\report-0b.json`).

| Schweiz (32 Gletscher, gewertet) | s2 | gegen G1 | Lücke a → b | besser / schlechter als G1 | Vertauschung p | Urteil |
|---|---|---|---|---|---|---|
| G1 allein | 334,8 | — | 35 % | — | — | Referenz |
| C1 = G1 + Medianhöhe | 326,7 | +2,4 % | 39 % | 18 / 14 | 0,085 | trägt nicht |
| **C2 = G1 + T3** | **276,4** | **+17,4 %** | **65 %** | 22 / 10 | 0,005 | **trägt, gewählt** |

  Ohne Mont Collon: C1 +7,4 %, C2 +19,8 %. Fehler eines vorhergesagten Faktors (Std. in ln) 0,13 mit C2 statt 0,20 mit G1. Österreich (berichtet): C1 −2,9 %, C2 −29,6 % gegen G1; G1 vorsichtig (E-GM-42) 354,3 gegen a′ 411,3, an 6 von 8 Gletschern besser. Q20 v1.1 ändert keinen Prädiktor (V-GM-110 geschlossen, V-GM-121). Deutschland: Region `de` mit F = 1,854 (übertragen aus CH + AT).
- **Vorschlag:** Schweiz C2 (nach Neuanpassung mit x1 aus der Hypsometrie, V-GM-113/118); Österreich Landeswert, höchstens G1 vorsichtig hinter eigenem Schalter; Deutschland unverändert. Befunde V-GM-118 … V-GM-121.
- **Stand Schritt 0b:** committet auf Jans Wort (E-GM-43), nicht gepusht.

**Jans Entscheidung E-GM-43 (25.11.)**

| Nr. | Entscheidung |
|---|---|
| E-GM-43 | Schritt 0b committen. Dann **GM-10b**. **Schweiz:** C2 hinter einem Schalter, aus. Vor dem Bau eine weitere Messung mit eigener eingefrorener Regel (sha256 vor dem ersten gewerteten Lauf), im Audit als **post hoc** markiert, weil sie V-GM-118 folgt: Varianten C2 wie gemessen; C2 mit „Zahl der Gitterzellen im Umriss“ statt Fläche; C2 ohne Größenterm (G1 + Höhe + Exposition); gleiche Wertung, ein Gletscher ausgelassen, Vertauschung als Kontrolle; Fehler je Größenklasse (eine Zelle, 2–4 Zellen, mehr), Pizol, Schwarzwasserfirn und Sex Rouge in jeder Variante benannt; Größenverteilung aller Schweizer Zielgletscher neben der der 32 Eichgletscher (wie viele Ziele sind so klein wie die drei). Die gebaute Variante wählt die eingefrorene Regel, nicht Jan. Schutz in jeder Variante, alle `set`: vorhergesagten Faktor an die Spanne der geeichten Faktoren kappen; unter einer Mindestgröße aus dieser Messung G1 allein; außerhalb der Eichspanne der übrigen Prädiktoren der Landeswert. Danach `c` und `β` mit x1 aus der Hypsometrie des Builds neu anpassen, Q20 v1.1. **Österreich:** G1 in der vorsichtigen Form (halber Weg zum Landeswert, gekappt 1,9–3,1) hinter EIGENEM Schalter, aus; jede Zeile „vorhergesagt, nicht beurteilt“; nicht C1, nicht C2; nach dem Bau die drei Prüfungen aus E-GM-42 (ein Gletscher ausgelassen, voller lokaler Lauf mit Schalter an, Schattenpaare). **Deutschland:** keine Vorhersage, bleibt bei 1,854. Mitnehmen: V-GM-86 (die Schneedecke in drei Höhen liest denselben Faktor hinter denselben Schaltern, neuer Start ab 1. Oktober, der Zustand nennt die Regel) und V-GM-91 (der Schmelzzustand mischt nie zwei Faktorregeln). Tabelle je Gletscher bleibt im lokalen Zwischenspeicher, keine abgeleitete Tabelle im Repo, bis GLAMOS geantwortet hat. Rule 2, volle lokale Läufe nacheinander, Mutationsrunde auf einer Kopie des Baums, kein Push, nichts in `buscosun-data`. **Anhalten nach der Schweizer Größenmessung und berichten, vor dem Bau.** |

**GM-10b, Größenmessung vor dem Bau (25.11., post hoc nach V-GM-118, nur Messung)** — `gm10-diagnose.md` §12, Regel `gm10b-size-method-frozen.md` (sha256 `d45627b2…`, eingefroren 11:23:41 UTC nach dem synthetischen Test), Werkzeuge `gm10b-cells.py`, `gm10b-size.mjs`; Bericht nur lokal (`C:\dev\buscosun-glacier-cache\gm10\report-size.json`).

| Schweiz (32 Gletscher) | s2 | gegen G1 | Urteil |
|---|---|---|---|
| A = C2 (ln Fläche) | 276,4 | 17,4 % | trägt |
| B = C2 mit ln(1 + Zellen) | 285,2 | 14,8 % | trägt |
| **C** = G1 + Höhe + Exposition | 297,2 | 11,2 % | trägt, **gewählt** (A → B ohne Vorsprung, B → C ohne Vorsprung) |

  Mindestgröße **5 Zellen** (K2 mit Mont Collon schlechter als G1); mit Schutz 314,2 mm (6,1 % gegen G1). Zielgletscher: 1 256, davon 623 mit höchstens einer Zelle, 331 ab 5 Zellen. Befunde V-GM-122 … V-GM-125. Committet auf Jans Wort (E-GM-44). **Angehalten vor dem Bau.**

**Jans Entscheidung E-GM-44 (25.11.)**

| Nr. | Entscheidung |
|---|---|
| E-GM-44 | (1) Die Dateien der Größenmessung committen. (2) V-GM-122 und V-GM-123: **keine neue Regel** — die eingefrorene Regel steht; beide Abweichungen gingen in die vorsichtige Richtung. (3) Vor dem Bau aus dem lokalen Bericht je Größenklasse (eine Zelle, 2–4 Zellen, ≥ 5 Zellen) eine Tabelle zeigen: Fehler mit dem Landeswert, G1, C, C halb zum Landeswert geschrumpft und dem eigenen Faktor — je mit und ohne Mont Collon. Beschreibend; kein neuer gewerteter Lauf außer der geschrumpften Variante, gerechnet mit einem ausgelassenen Gletscher. (4) **Kleine Gletscher (unter 5 Zellen) — Jans Entscheidung, nicht Urteil eines Skripts:** schlägt das geschrumpfte C den Landeswert in BEIDEN kleinen Klassen, wird für sie das geschrumpfte C gebaut (halber Weg zum Landeswert, gekappt an die Spanne der geeichten Faktoren); sonst behalten sie den heutigen Landeswert; Zielgletscher, die kleiner sind als jeder Eichgletscher, behalten in jedem Fall den Landeswert. Der frühere Schutz „unter der Mindestgröße G1 allein“ (E-GM-43) ist **zurückgenommen**. Nach der Tabelle anhalten, nicht bauen. |

**Tabelle je Größenklasse (E-GM-44 Punkt 3, 25.11., beschreibend)** — `gm10-diagnose.md` §12.7, Werkzeug `gm10b-shrunk.mjs`. C geschrumpft (halb zum Landeswert, gekappt, ein Gletscher ausgelassen) gegen den Landeswert a: K1 357,4 gegen 491,0; K2 540,6 gegen 660,3 (ohne Mont Collon 310,0 gegen 412,5); K3 270,0 gegen 335,3 (dort baut die Regel C ungeschrumpft, 242,0). Nach Jans Regel fiele der Bau unter 5 Zellen auf C geschrumpft, die 94 Zielgletscher unter der kleinsten Eichfläche behalten den Landeswert. Nicht committet. **Angehalten vor dem Bau.**

## 3o. GM-10b: Bau des vorhergesagten Faktors für Schweizer Gletscher (25.11., Schalter aus)

Diagnose, Zahlen, Befunde: `audit/gletscher-schneemodell/gm10-diagnose.md` §13. Auftrag Jan 25.11. (E-GM-44): entscheiden, bauen, prüfen in einem Zug; nur die Schweiz; Tabelle nur lokal (`C:\dev\buscosun-glacier-cache\gm10\predict\table.json`, sha256 `fadea420…`), GLAMOS-Lizenz offen.

- **Schritt 1 und Jans Regel** (seine Entscheidung, kein Skript-Urteil): C geschrumpft schlägt den Landeswert in beiden kleinen Klassen (K1 357,4 / 491,0; K2 540,6 / 660,3, ohne Mont Collon 310,0 / 412,5) ⇒ unter 5 Zellen C halb zum Landeswert, ab 5 Zellen C; kleiner als jeder Eichgletscher, ohne x1 oder außerhalb der Eichspanne von x1 / Medianhöhe / Exposition ⇒ Landeswert; gekappt an 1,107–3,558; eigene Faktoren bleiben. Alles `set` (`SNOW_FACTOR_RULE`).
- **x1 des Builds** (Hypsometrie, festes Fenster 1.10.–1.5., Q20 v1.1, Stationsregel von GM-3 für alle 1 291 Schweizer Gletscher; Suche gegen Schritt 0 an 36 von 36 gleich): 1 287 mit x1. **Neuanpassung nach der eingefrorenen Größenregel: C trägt weiter** (313,1 mm, 12,6 % gegen G1 358,3, p 0,005, p10 2,0 %), Wahl C — kein STOPP.
- **Tabelle:** own 34 / predicted 249 / predicted-shrunk 416 / country 592 Gletscher = 21,5 / 57,6 / 4,4 / 16,5 % der Schweizer Gletscherfläche; Paare je Grundlage gemessen (predicted 0,80 / 1,19, shrunk 0,80 / 1,23, country 0,72 / 1,43, own 0,99 / 1,02).
- **Verdrahtet, aus:** `--glacier-factor=predicted` + `--glacier-factor-table=` (nie stiller Rückfall); V-GM-91 (`fac` im Schmelzzustand, Neubeginn bei Regelwechsel, Neu-Einschwingen `snowpack-seed.mjs --melt-respin`); V-GM-86 (Schneedecke mit demselben Faktor, `rules.factor`, Startzustand mit `--glacier-factor`, `now.bases`).
- **Prüfung:** 3a wie gebaut 353,4 mm gegen Landeswert 396,1 und G1 358,3, in jeder Klasse besser als der Landeswert (K1 471,7 / 494,0; K2 637,7 / 654,9; K3 276,9 / 327,7); 9 Gletscher schlechter, am meisten Plaine Morte (+232), Murtèl (+213), Mont Collon (+83). Prüfer `-snowcal` 54/54, `-melt` 85/85, `-snowpack` 75/75. Voller Lauf ohne Schalter 33 von 33 Dateien gleich HEAD; mit Schalter genau 5 Dateien anders, nichts außerhalb der betroffenen Gletscher. Mutationsrunde 43 von 46 bemerkt, die drei übersehenen zeigten Lücken der Prüfer (ergänzt), Wiederholung 3 von 3. Typecheck, Build 281/281, Budget unverändert.
- Befunde V-GM-126 … V-GM-134. Nichts im Daten- oder Archiv-Repo, kein Workflow, kein Push.
- **Nachtrag 25.11. abends:** GLAMOS hat Jan die Nutzung schriftlich bestätigt (E-GM-37 aufgelöst, Q17, `audit/gletscher/licences.md`). Die Tabelle liegt jetzt im Repo als `scripts/glacier/snow-factor-predicted-ch.json` (sha256 `8fa1833c…`), mit Quellenblock `SNOW_FACTOR_SOURCES` (empfohlenes Zitat des Release 2025, vom Vertrag verlangt); neu gebaut und Feld für Feld gleich dem Bau von 14:06 außer Zeitstempel, Quellenblock und Werkzeug-Hash (`gm10-diagnose.md` §13.9). `predicted` bleibt aus, bis V-GM-127 gemessen ist. E-GM-38 (`on`/`on` für die gemessenen Gletscher): Ablauf in MANUELLE-SCHRITTE §127, vorbereitet, nicht ausgeführt.

## 3p. V-GM-135: Wo blieb der Neuschnee? Zerlegung des ersten 24-h-Fensters (25.11. abends, nur gelesen)

Ein Fenster (24.11. 17 → 25.11. 17 UTC), beschreibend, kein Urteil, keine Regeländerung. buscosun Fusion nur gelesen; kein Producer-Lauf, nichts im Daten- oder Archiv-Repo. Werkzeug `audit/gletscher-schneemodell/v135-decompose.mjs` (rein, liest nur lokale Kopien), Bericht `C:\dev\buscosun-glacier-cache\v135\v135-decompose.json`.

**Gesichert** (25.11. ab 18:16 UTC, raw an `f2dcc36f` bzw. `9dc7e990`, jede Datei gegen den Blob-Hash geprüft, 0 Abweichungen; Liste `C:\dev\buscosun-glacier-cache\v135\GESICHERT.md`): `melt/wx/<lauf>` (Tag + 26 Stunden-Chunks) und `snowpack/<lauf>.json` der Läufe 2417, 2423, 2511, 2517 (dazu 2323/2405/2411 als Vorlauf), `snowpack/pairs/` 2417–2517, `status.json` (nur Lauf 2517, zwei Stände), `snowpack/state.json`, Stationsslots `stn/h/` 24.11. 12 → 25.11. 18 UTC, Zuordnung `20261120-1.6`, `precipsum/v1/2026112517-…` (1–48 h). Rund 62 MB. **Einen Lauf `2026112505` gibt es nicht**; die Statusstände der Läufe 2417/2423/2511 sind nach dem Force-Push nicht mehr erreichbar (der `state`-Block steht in jedem `snowpack/<lauf>.json`).

**Wie das Modell die 24 h rechnet.** Der Wert an der Laufstunde ist der Zustand des Vorlaufs, nachgespielt mit dessen gespeichertem Antrieb (`advanceEntry`, 18 h Vorrat): 17→23 UTC aus Lauf 2417 (Vorlauf 0–5 h), 23→11 UTC aus 2423 (0–11 h; 2505 fehlt), 11→17 UTC aus 2511 (0–5 h). Rekonstruiert: Fest = Faktor × `sn` des Chunks (`sn` = p · Anteil). Gegenprobe: Fest gegen ΔSWE der Zeilen im Mittel −0,02 mm, höchstens 0,8 mm (eine Zunge) — Schmelze ≈ 0; `m` der Paare gegen die Zeile in Stationshöhe ≤ 0,1 cm. 39 Paare rechnen auf dem Antrieb eines Nachbarn; dort steht der Anteil des Nachbarn in der nächsten Höhe (Näherung, im Bericht `approxShare`), die Gegenprobe ΔSWE hält auch dort (≤ 0,1 mm).

**Schritt 2 — Mittel über 98 Schneefallpaare (17 Stationen) und die Kontrolle** (je Schneefallstation die nächste Station desselben Netzes ohne Schneefall, 17 Stationen, 78 Paare); Werte in Stationshöhe, Zunge/Mitte/Oberkante in Klammern.

| Größe | Schneefall | Kontrolle |
|---|---|---|
| Höhen Gletscher · Station (m) | 2 676 / 2 887 / 3 140 · 2 636 (68 Paare unter der Zunge) | 2 596 / 2 949 / 3 349 · 2 528 |
| a) Niederschlag buscosun Fusion, vor dem Faktor | **4,7 mm** (× F 1,79: 8,5) | 3,9 mm (7,1) |
| b) Anteil fest · Temperatur · Schneefallgrenze | 1,00 (alle Höhen) · −6,3 °C (−5,9 / −7,1 / −8,5) · 900–1 690 m | 1,00 · −5,8 °C · 910–1 730 m |
| c) gebuchtes Neuschneewasser · frisch bei 96 kg/m³ · davon nach 24 h übrig (`hn` 24 h) | 8,4 mm · **+8,8 cm** · 8,6 cm | 7,0 mm · +7,3 cm · 7,1 cm |
| d) Schmelze · Setzung gesamt (neu / alt) | 0,0 · **−7,8 cm** (−0,2 / −7,6) | 0,0 · −6,0 cm |
| Modelländerung | **+1,0 cm** | +1,2 cm |
| e) Station: Änderung der Schneehöhe | **+6,5 cm** (erste 12 h +3,3, zweite +3,9) | −0,8 cm |
| e) Station: Niederschlag / Neuschnee | IMIS (16 von 17): keiner (unbeheizte Messer, `HN_1D` ist Modell); Gütsch `ch:GUE` 1,1 mm (144/144) bei +8 cm | — |
| f) unabhängig: 24-h-Summe precipsum (CH CombiPrecip, AT INCA) an der Stationszelle | **3,1 mm** (× F: 5,5) | 1,9 mm |
| Modelldecke · Station an der Laufstunde A (paargewichtet) | 139 cm · 85 cm; Modell-Neuschnee der 72 h davor 46,5 cm (48 h: 31,6) | 105 cm · 49 cm (stationsgewichtet) |

ICON-D2/ICON-CH1 als Rohglied des Cubes: die Cube-Läufe vom 24.11. sind nicht mehr im Daten-Repo (Aufbewahrung 9–24 h) und nicht in der Ablage — nicht gelesen.

**Aufteilung der Lücke (Station +6,5, Modell +1,0, Lücke 5,5 cm):**

| Teil | Anteil an der Lücke | Beleg | trennbar? |
|---|---|---|---|
| zu wenig Niederschlag | **keiner sichtbar** — das Modell bucht frisch 8,8 cm, mehr als die Station netto zeigt; buscosun Fusion gibt 1,5 × die CombiPrecip/INCA-Summe (Kontrolle 2 ×); mit F × precipsum wären es 3,1 cm weniger | a, c, f | nein: F × precipsum (5,5 mm ⇒ 5,8 cm bei 96) erklärt selbst ohne Setzung die +6,5 cm der Station nicht — precipsum zu niedrig in 2 300–2 600 m, Dichte unter 96 oder Verfrachtung an der Station; IMIS misst weder Niederschlag noch Neuschnee |
| Regen statt Schnee | **0** | Anteil 1,00 an allen Höhen, Grenze ≤ 1 690 m, Stundenhöchstwert der Temperatur über alle Zeilen und Höhen +2,4 °C, im Mittel −4,3 °C an der Zunge, Schmelze 0,0 | ja |
| Zeitpunkt (Schnee außerhalb des Fensters) | **0** im Modell | die 8,4 mm fallen im Fenster (Lauf A sah für dasselbe Fenster nur 6,2 mm vor); Fusion 2,8 / 2,0 mm in den Hälften, Station +3,3 / +3,9 cm; nach dem Fenster sagt Lauf B weitere 8,3 mm vorher — Station und Modell schneien weiter | ja |
| Dichte | nicht bestimmbar | Modell 96 kg/m³ ⇒ 8,8 cm; der neue Schnee setzt sich im Modell in 24 h nur um 0,2 cm | nein (kein Neuschnee an IMIS) |
| Setzung | **im Modell der ganze Verlust: −7,6 cm alte Decke** (5,6 % der Modelldecke je Tag) | d; Modelldecke doppelt so tief wie gemessen, mit 31,6 cm Neuschnee aus dem Startzustand (22.→23.11., Analysen) | nein für die Station: ihre Setzung ist unbekannt; am Vortag (23.→24.11.) fiel sie an denselben 17 Stationen um 6,8 cm, das Modell in 18 h um 3,9 |

Lesart des Modells: Lücke = (Neuschnee Station − 8,8) − (Setzung Station − 7,8). Messbar ist nur die Modellseite; die Station trennt Neuschnee und Setzung nicht.

**Schritt 3 — zwei Prüfungen ohne Physik.**

- *Zeit und Ausrichtung:* beide Seiten zählen dieselben 24 h. Zustand A an 24.11. 17:00 UTC (`atMs` 1795539600000), B an 25.11. 17:00 UTC; Stationsstempel A 0 min, B 0 min (95 Paare) bzw. 30 min (3 Paare `imis:BER2`, Wert 16:30). Kette 6 + 12 + 6 = 24 h nachgespielt (`replayedH` = `ageH` in jedem Lauf), an keiner Zeile neue Stunden ohne Antrieb (`gap` A = B; die 30 h stammen aus dem Startzustand). **Kein Versatz um einen Lauf.**
- *Eigener oder Nachbar-Antrieb:* eigen 59 Paare (14 Stationen) +6,2 / +1,0 cm, Verhältnis 0,16; Nachbar 39 Paare (12) +6,9 / +0,9 cm, 0,13; frisch 8,8 / 8,8 cm, Setzung 7,8 / 7,9 cm. **Die Art des Antriebs erklärt nichts.**
- Nebenbei: ohne `imis:BOR2` (s. V-GM-141) 91 Paare +5,45 / +0,78 cm, 0,14; je Station gewichtet +7,3 / +1,4 cm, 0,19.

**Befunde**

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-139 | Antrieb (`melt/wx/<lauf>`), Zeilen (`snowpack/<lauf>.json`) und Statusstand eines Schmelzlaufs liegen nur 72 h im Daten-Repo, `precipsum/v1` nur drei Läufe (3 h); die Ablage hält je Tag `melt-<lauf>` und `pairs-<lauf>` und die Stationsslots, aber keinen Antrieb und keine Schneedecken-Zeile — ein Schattenpaar lässt sich nach drei Tagen nicht mehr zerlegen | jedes Fenster bleibt erklärbar · im Archivlauf je Lauf eine Datei `snowpack-forcing-<lauf>.json.gz` mit `t p s sn sl` der 470 Gletscher mit Schneestation und ihrer 38 Antriebs-Besitzer (gemessen an 2517: ≈ 121 KB gz) und `z f hs swe hn` ihrer Zeilen (≈ 20 KB gz) plus `lines.snowpack` des Status; ≈ 0,56 MB/Tag. Dazu einmal täglich die 24-h-Summe von `precipsum` an den Zellen der Schneestationen (wenige KB). Reihenfolge wie bisher: nur hinzufügen |
| V-GM-140 | In diesem Fenster fehlt dem Modell kein Neuschnee: es bucht an den Schneefallstationen 8,8 cm frisch, mehr als die Station netto zeigt; der Verlust ist die Setzung der älteren Modelldecke (7,6 cm in 24 h). Die Modelldecke ist an diesen Stationshöhen rund doppelt so tief wie gemessen (139 gegen 85 cm) und trägt 31,6 cm Neuschnee aus dem Startzustand vom 22./23.11. | trennt Antrieb und Ausgangsdecke · je Fenster die Setzung der Modelldecke an Tagen ohne Schneefall gegen die Station legen (23.→24.11.: Station −6,8 cm in 24 h, Modell −3,9 in 18 h) und die Ausgangsdifferenz Modell − Station je Paar mitschreiben; nichts ändern, bevor sieben Fenster dasselbe sagen (V-GM-135) |
| V-GM-141 | `imis:BOR2` (Bortelsee, 2 517 m) springt zwischen 20 und 22 UTC von 67 auf 84 cm und bleibt dort; die Stationsprüfung (Sprung) lässt es durch. Mit 7 von 98 Paaren trägt die Station +20,2 cm ins Schneefallmittel | ein Sprung zählt nicht als Schneefall · die Sprunggrenze der Schneehöhe je Stunde in `stations.mjs` gegen diesen Fall prüfen (Grenze `set`); im Paar-Werkzeug zusätzlich je Station gewichten |
| V-GM-142 | buscosun Fusion gibt an den 17 Schneefallstationen 4,7 mm, CombiPrecip/INCA an der Stationszelle 3,1 mm; mit dem Faktor erklärt precipsum die +6,5 cm der Station selbst ohne Setzung nicht (5,8 cm bei 96 kg/m³). Die einzige Station mit Messer (Gütsch) misst 1,1 mm bei +8 cm | zeigt, dass Niederschlag allein hier nicht entscheidet · an Stationen mit Neuschneebrett oder beheiztem Messer (eine neue Quelle — Jans Wort) ließe sich Dichte von Setzung trennen; bis dahin precipsum je Fenster neben das Paar legen (V-GM-139) |
| V-GM-143 | Der Schmelzlauf `2026112505` fehlt (kein `melt/wx`, kein `snowpack`); die Stunden 23→11 UTC kamen aus Lauf 2423 mit Vorlauf bis 11 h. Die Buchung ist vollständig (Vorrat 18 h), aber ein Paar sagt nicht, welche Läufe seine 24 h trugen | macht die Zeitprüfung ohne Antrieb lesbar · im Paar-Dokument die Kette der Läufe nennen, die das Fenster seit dem Vorgänger nachgespielt hat (`replayedFrom`); warum 2505 ausfiel, ist nicht untersucht |

## 3q. GM-11, Phase 1: Wo sitzt der Fehler? (25.11. abends, nur Messung)

Auftrag Jan 25.11.: messen, nichts einschalten, nichts in `buscosun-data` oder `buscosun-archiv`, kein Workflow, kein Push; buscosun Fusion nur gelesen. Kein Urteil vor sieben Fenstern.

### 3q.1 V-GM-135 geschlossen, Quellen übernommen

Die Dateien von V-GM-135 und die Recherche hatte Jan schon als `b5a52514` committet. Übernommen (`44e7af13`): Q17a und Q18 in §4.4 als „geprüft von Jan, 25.11.“ (GLAMOS hat die Nutzung per Mail bestätigt, ausdrücklich auch für die Punktmessungen und Release 2026; `audit/gletscher/licences.md`, Abschnitt „Punktmessungen und Release 2026“, beide grün, Quellenangabe unverändert Pflicht), Q19a und Q24 … Q35 als Vorschlag, V-GM-136 … V-GM-138 in §9.

### 3q.2 Weiterlesen, aber Neuschnee und Setzung getrennt (1.2)

**a) Fenster-Werkzeug** `audit/gletscher-schneemodell/gm11-windows.mjs` (nur lesend). Liest jedes 24-h-Fenster 17 UTC gegen 17 UTC aus den abgelegten Paaren (`buscosun-archiv`, Blob-Hash geprüft; was die Ablage noch nicht hält, aus dem lokalen Cache) und schreibt die Tabelle unten neu — je Land, Netz und Gruppe (Schneefall = Station ≥ +3 cm, sonst „ohne“): Neuschnee des Modells, frisch gebuchter Schnee, Verlust der älteren Decke, Schmelze, Modell- und Stationsänderung, Niederschlag von buscosun Fusion ohne Faktor und precipsum an der Stationszelle, Anteil der Stationswerte in der p10–p90-Spanne, die Lauf A für den ersten Tag schrieb (erst ab Fenster A = 2517: der Lauf 2423 ist der erste mit Spanne, aber kein 17-UTC-Lauf), und die Ausgangsdifferenz der Decke. „Seed“ = Lauf A vor dem 26.11. 17 UTC (der 72-h-Neuschnee von A hält noch den Startzustand). Nie das Verhältnis allein.

Bis V-GM-139 im Archiv steht, sichert `audit/gletscher-schneemodell/gm11-save-runs.mjs` jeden neuen Lauf in `C:\dev\buscosun-glacier-cache\gm11\runs\<lauf>\` (Tag + Chunks, Schneedecken-Zeilen, Paare; Statusstand je Commit; precipsum mit Ende 17 UTC; Blob-Hash je Datei, Protokoll `saves.jsonl`). Gesichert am 25.11.: Läufe 2305 … 2517 (10 Läufe, der Lauf 2505 fehlt, s. V-GM-143).

**So läuft es an den nächsten Tagen** (je einmal nach 17:30 UTC; precipsum hält nur drei Stunden, deshalb vor 20 UTC):

```
node audit/gletscher-schneemodell/gm11-save-runs.mjs
node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-windows.mjs --fetch --audit=audit/gletscher-schneemodell.md --out=C:\dev\buscosun-glacier-cache\gm11\windows.json
```

<!-- gm11-windows:start -->
_Erzeugt von `gm11-windows.mjs` am 2026-11-25 19:27 UTC; Quellen der Paare je Fenster im Bericht. „frisch gebucht“, „Schmelze“ und „P Fusion“ nur, wo der Antrieb aller Läufe des Fensters im Cache liegt; sonst rechnet „Verlust“ mit `hn24` und enthält die Schmelze._

| Fenster (A → B) | Seed | Land · Netz | Gruppe | Paare | Neuschnee Modell `hn24` cm | frisch gebucht cm | Verlust alte Decke cm | Schmelze mm | Modell Δ cm | Station Δ cm | P Fusion mm (ohne F) | P precipsum mm | in p10–p90 | Decke Modell − Station bei A cm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 24.11. 17 → 25.11. 17 UTC | ja | AT · at | ohne | 26 | 0,9 | 1,0 | 2,8 | 0,0 | −1,9 | −0,3 | 0,4 | 0,1 | – | 111,1 |
| 24.11. 17 → 25.11. 17 UTC | ja | AT · bz | ohne | 8 | 2,9 | 2,9 | 3,1 | 0,0 | −0,2 | −1,4 | 1,2 | – | – | 75,1 |
| 24.11. 17 → 25.11. 17 UTC | ja | AT · imis | ohne | 1 | 0,5 | 0,5 | 3,3 | 0,0 | −2,8 | −2,1 | 0,1 | 0,0 | – | 63,0 |
| 24.11. 17 → 25.11. 17 UTC | ja | AT · tirol | Schneefall | 1 | 0,5 | 0,4 | 1,8 | 0,0 | −1,4 | 4,0 | 0,0 | 0,4 | – | 74,5 |
| 24.11. 17 → 25.11. 17 UTC | ja | AT · tirol | ohne | 94 | 1,1 | 1,1 | 3,1 | 0,0 | −2,0 | −2,5 | 0,4 | 0,2 | – | 56,1 |
| 24.11. 17 → 25.11. 17 UTC | ja | CH · ch | Schneefall | 1 | 6,2 | 6,2 | 5,7 | 0,1 | 0,4 | 8,0 | 3,2 | 0,9 | – | 51,9 |
| 24.11. 17 → 25.11. 17 UTC | ja | CH · ch | ohne | 1 | 4,1 | 4,2 | 7,8 | 0,0 | −3,6 | −2,0 | 2,0 | 0,4 | – | 24,2 |
| 24.11. 17 → 25.11. 17 UTC | ja | CH · imis | Schneefall | 96 | 8,7 | 8,9 | 7,9 | 0,0 | 1,0 | 6,5 | 4,8 | 3,2 | – | 54,6 |
| 24.11. 17 → 25.11. 17 UTC | ja | CH · imis | ohne | 237 | 6,6 | 6,8 | 6,8 | 0,0 | 0,0 | −5,7 | 3,7 | 1,7 | – | 50,2 |
| 24.11. 17 → 25.11. 17 UTC | ja | alle · alle | Schneefall | 98 | 8,6 | 8,8 | 7,8 | 0,0 | 1,0 | 6,5 | 4,7 | 3,1 | – | 54,7 |
| 24.11. 17 → 25.11. 17 UTC | ja | alle · alle | ohne | 367 | 4,7 | 4,8 | 5,5 | 0,0 | −0,7 | −4,4 | 2,5 | 1,2 | – | 56,5 |
<!-- gm11-windows:end -->

Lesart des ersten Fensters (kein Urteil): an den Schneefallpaaren der Schweiz (IMIS) fängt der Verlust der älteren Decke (7,9 cm) den frisch gebuchten Schnee (8,9 cm) fast ganz auf; an den Schweizer IMIS-Paaren ohne Schneefall sind beide Teile gleich groß (6,8 / 6,8 cm) — das Modell bleibt stehen, die Station sinkt um 5,7 cm. In Österreich bucht das Modell wenig (≈ 1 cm) und verliert 3 cm, die Station verliert 2,5 cm. Die Decke des Modells liegt an jedem Netz 50–110 cm über der Station.

**b) Die SLF-Messfelder (Q6) als Wahrheit für den Neuschnee.** Werkzeug `gm11-plots.mjs`, Regel der Stationszuordnung (Abstand zum L1-Umriss ≤ 5 km, Höhe in der Spanne des Gletschers ±300 m). **11 der 100 Messfelder liegen im Fenster eines Gletschers** (Arolla, Trübsee, Berninapass, La Creusaz, Corvatsch, Grindelwald Bort, Kühboden, Diavolezza, Grimsel Hospiz, Egginer, Grindel; 1 565–2 690 m; Egginer 0,5 km und Corvatsch 0,9 km am nächsten). Werte der letzten sieben Tage aus der öffentlichen Schnittstelle (`period_in_days=7`; die Tagesdateien des SLF enden am 23.11.). Verglichen wird mit dem Niederschlag von buscosun Fusion **ohne Faktor** am Gletscher des Fensters mit eigenem Antrieb — die Antwort von buscosun Fusion steht am Gletscherpunkt in seiner Medianhöhe, nicht am Messfeld; jede Stunde aus dem jüngsten Lauf davor, wie die Schneedecke sie nachspielt. Der gesicherte Antrieb deckt zwei Messtage:

| Tag (24 h bis 06 UTC) | Messfelder | Neuschnee gemessen (Mittel) | buscosun Fusion ohne Faktor (Mittel) | mit Wasserwert gemessen: Messfeld — HNW / Fusion |
|---|---|---|---|---|
| 24.11. | 10 | 5,3 cm | 10,3 mm | Trübsee 18 / 22,9 mm · Grindel 9 / 18,6 mm |
| 25.11. | 7 (2 ohne HN) | 2,9 cm | 2,4 mm | — |

Am 24.11. gibt buscosun Fusion schon **ohne Faktor** etwa doppelt so viel Wasser, wie das Messfeld als Neuschnee sieht (bei 96 kg/m³ wären 10,3 mm 10,7 cm; mit dem Faktor 1,79 19 cm); an den zwei Feldern mit Wasserwert 1,3- und 2,1-mal so viel. Am 25.11. liegen beide gleichauf. Der Wasserwert `HNW_1D` fehlt an den meisten Tagen. Zwei Tage, elf Felder, alle unter 2 700 m — eine Ablesung, kein Urteil. Der Tag bis 23.11. 06 UTC (Messfelder 26–40 cm Neuschnee, Wasserwerte 25–85 mm) ist nicht vergleichbar: dessen Antrieb ist nicht mehr gesichert, und die Schneedecke rechnete ihn aus dem Startzustand (Analysen).

**c) Archiv des Antriebs (V-GM-139) — vorbereitet, nicht eingespielt.** `scripts/glacier/glacier-archive.mjs` bekommt zwei Teile, beide nur mit Angabe aktiv: `--forcing=<glacier/v1>` legt je Lauf `forcing-<lauf>.json.gz` ab (Stundenwerte `t p s sn sl` der Gletscher mit Schneestation und ihrer Antriebs-Besitzer, Zeilen `z f hs swe hn gap`, Kopf mit Zustand, Faktor je Region und Dichte; lokal an zehn gesicherten Läufen: 7 abgelegt, **138 848 B im Mittel**, 3 ohne Schneedecken-Dokument genannt und nicht abgelegt); `--precipsum=<precipsum/v1>` legt für jeden precipsum-Lauf mit Ende 17 UTC die 24-h-Summe an jeder Schneestation ab. Nur hinzufügen, wie bei den Paaren. Die Vorlage `scripts/glacier/workflow-glacier-archiv.yml` liest dafür zusätzlich `/glacier/v1/snowpack/`, `/glacier/v1/stn/map/` und `/precipsum/v1/` und gibt beide Angaben weiter; ein älteres Skript überliest sie. Prüfer: `verify:glacier-snowpack` 76/76 (neu J16, mit Gegenproben: Gletscher ohne Station und ohne Besitz bleibt draußen, Lauf ohne Dokument wird genannt, zweiter Lauf hält), `-publish` 34/34, `-snow` 37/37 (I3: das Archiv nennt das SNOWGRID-Produkt nicht). **Was Jan tut** (MANUELLE-SCHRITTE): `buscosun-web` pushen, dann die Vorlage nach `.github/workflows/glacier-archiv.yml` in `buscosun-archiv` kopieren. Ablage ≈ 0,56 MB/Tag.

**d) Ursachen.**

- *V-GM-141* (Sprung an `imis:BOR2`): die Stationsprüfung lässt je Stunde bis **60 cm** Schneehöhen-Zunahme durch (`STN_JUMP_PER_H.snow = 60`, `set`, `src/glacier/glacierStationContract.ts`), gegen den letzten angenommenen Wert. BOR2: 20:30 UTC 65,9 cm, 21:00 kein Wert, 21:30 76,0, 22:00 84,4, 22:30 86,5, danach flach; Lufttemperatur −6 °C; buscosun Fusion gab an den zwei Gletschern dieser Station in diesen Stunden 0,1–0,3 mm/h. In den gesicherten 49 Slots (283 Stationen, 14 084 Schritte) steigen nur 25 Schritte um ≥ 8 cm/h, fast alle als einzelne halbe Stunde mit 4–5 cm (Rauschen, das zurückgeht); heraus stechen BOR2 (+18,5 cm in 1,5 h, bleibt) und `imis:VIN2` (+13,9 cm in 0,5 h). **Vorschlag, nicht geändert:** eine zweite Sprungregel für die Schneehöhe, „Stufe, die bleibt“: Zunahme ≥ 10 cm in ≤ 2 h, die danach ≥ 2 h nicht zurückgeht, gilt als Sprung, solange keine Nachbarstation desselben Netzes bis 20 km im selben Fenster mindestens die Hälfte zeigt (alles `set`; buscosun Fusion liest die Stationslinie nicht und umgekehrt — die Regel bleibt stationseigen). Vorher an einem Winter der Ablage `stn-<stunde>` zählen, wie oft sie Schneefall träfe.
- *V-GM-143* (kein Lauf `2026112505`): der Schmelz-Workflow lief um 05:24 UTC (Job `45553350411`), der Schritt „Melt run“ endete nach 2 s, Publish übersprungen — `repeatVerdict` (`melt.mjs`) sah t2/t3 unverändert seit Lauf 2423. Grund: der t2-Lauf des Punkt-Cubes von 00 UTC wurde gebaut (Workflow `point.yml`, Job `45547610153`, Bau 04:34–04:46 UTC), sein **Publish-Schritt schlug fehl** (04:47–04:51 UTC); t2 sprang erst um 10:48 UTC auf `2026112506`. Folge: die Stunden 23 → 11 UTC kamen aus Lauf 2423 mit Vorlauf bis 11 h; gebucht wurde vollständig (Vorrat 18 h). **Vorschlag, nicht geändert:** `repeatVerdict` zusätzlich fällig machen, wenn der letzte Lauf ≥ 6 h alt ist und t1 neuer ist (hält den 6-h-Takt, wenn ein t2-Publish ausfällt); die Ursache des Publish-Fehlers liegt im Workflow `point.yml` des Daten-Repos (Protokoll nur mit Anmeldung lesbar — Jan).

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-144 | An den SLF-Messfeldern im Fenster eines Gletschers gibt buscosun Fusion am 24.11. schon **ohne** Faktor rund das Doppelte des gemessenen Neuschnees; der Faktor 1,79 wurde mit Analysen als Antrieb geeicht (`bridge.value = 1`, `set`) und wirkt im Betrieb auf buscosun Fusion | prüft, ob der Faktor im Betrieb doppelt zählt · `gm11-plots.mjs` jeden Tag mitlaufen lassen (der Saver hält den Antrieb), nach sieben Messtagen mit Neuschnee die Brücke Fusion / Messfeld je Land lesen; nichts ändern vorher |
| V-GM-145 | Der Wasserwert des Neuschnees (`HNW_1D`) fehlt an den Messfeldern an den meisten Tagen (24./25.11.: 2 von 17 Messwerten); ohne ihn vergleicht der Abgleich Zentimeter mit Millimetern | ehrlicher Abgleich · Tage mit `HNW_1D` getrennt zählen und die Zentimeter-Tage nur als Richtung führen |

### 3q.3 V-GM-136 behoben: Zuordnung der WGMS-Reihen (1.3)

**Regel** (`scripts/glacier/snowcal-truth.mjs`, Österreich): zuerst die WGMS-ID, die der Katalog trägt (`inv.wgms`); dann die Kette `parent_glacier_id` (bis fünf Stufen); der Abstand (≤ 3 km zum Katalogpunkt) nur für eine Reihe, die weder das eine noch das andere hat. Eine Reihe, die einen Katalog-Gletscher nur über einen Vorfahren erreicht, misst einen **Teil** dieses Gletschers: sie nennt ihn (`catAncestor`), bekommt keinen Katalog-Gletscher (`catId: null`) und bleibt Wahrheit für den Landeswert und den Formpool. `region` (die Station des Antriebs) bleibt die des nächsten Eintrags, damit der Antrieb gleich bleibt.

**Entscheidung aus den Daten: die Reihe „Venediger K.“ (10460) fällt aus der Tabelle je Gletscher.** Kein Katalog-Gletscher trägt die WGMS-ID 10460. Ihr Elternteil 134291 (RGI60-11.00116) steht nicht im Katalog, dessen Elternteil 583 ist das **Obersulzbach Kees** (Katalog `inv.wgms` 583). Der WGMS-Punkt liegt **im** L1-Umriss des Obersulzbach Kees (0,00 km; Untersulzbach 0,25 km). Die Reihe misst aber 1,71 km² zwischen 2 500 und 3 400 m, das Obersulzbach Kees des Katalogs hat 7,79 km² zwischen 2 325 und 3 544 m: ein Fünftel des Gletschers. Ihm den Faktor und die Form dieses Fünftels zu geben, wäre derselbe Fehler wie beim Untersulzbach, nur kleiner. Die übrigen sieben österreichischen Reihen finden ihren Gletscher jetzt über `inv.wgms` (vorher über den Abstand, mit demselben Ergebnis).

**Wahrheit neu gebaut** (`C:\dev\buscosun-glacier-cache\gm11\v136\gy.json`): 488 Gletscherwinter wie vorher, 9 verworfen wie vorher; gegen die Wahrheit von GM-3 (`gm3\truth\gy.json`) ändert sich **nur die Reihe Venediger K. (11 Winter: `catId` Untersulzbach → keiner)**, jedes andere Feld jedes anderen Winters ist gleich.

**Tabelle neu gebaut über ihren Generator:** `snowcal-fit2.mjs` mit der neuen Wahrheit (25.11. 20:27–20:49 UTC, im Vordergrund; ein erster Lauf im Hintergrund wurde um 19:4x UTC vom System wegen Speichermangels beendet) → `C:\dev\buscosun-glacier-cache\gm11\v136\report-fit2.json`; gegen den Bericht von GM-5b sind `summary`, `verdicts`, `sensitivities` und alle 478 `perWinter`-Zeilen **gleich**, in `table` ändert sich nur 10460 (`catId` → `null`). `snowcal-table2.mjs` schreibt jetzt keine Zeile für eine Reihe ohne Katalog-Gletscher und nennt sie im Kopf (`withoutCatalogue`).

| Datei | geänderte Stellen |
|---|---|
| `scripts/glacier/snow-calibration-glaciers.json` | Zeile `gl_at_untersulzbach-kees` (F 1,91, 11 Winter, Form) **entfernt**; `withoutCatalogue` neu (10460 VENEDIGER K., AT, 11 Winter); `generated`. Alles andere — 42 Zeilen, Landeswerte 1,821 / 2,416, Werte, Urteile, `gate` — Byte für Byte gleich |
| `audit/gletscher-schneemodell/gm5b-report.json` | `generated`; `table.10460.catId` → `null` |

**Prüfer:** `verify:glacier-melt` 85/85, `verify:glacier-snowpack` 76/76, `verify:glacier-snowcal` **54/55** — I8 rot, weil die Tabelle vorhergesagter Faktoren den Hash der Eichtabelle trägt, aus der sie gebaut wurde (`inputs.ownTable` `271ce7fe…`, jetzt `95dd30c3…`).

**Was das für die Tabelle vorhergesagter Faktoren heißt** (nicht neu gebaut, Jans Vorgabe): kein Faktor ändert sich — sie gilt nur für die Schweiz, ist an 32 Schweizer Eichgletschern angepasst, und die Schweizer Zeilen der Eichtabelle sind gleich; nur ihr Eingangs-Hash ist veraltet. Beim nächsten Bau (`snowcal-predict.mjs --mode=table`) wird I8 wieder grün, mit denselben Faktoren.

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-149 (erledigt 25.11. abends: Tabelle neu gebaut, alle 1 291 Faktoren gleich, nur `builtAt` und `inputs.ownTable` anders; `verify:glacier-snowcal` 55/55) | Nach V-GM-136 trägt `snow-factor-predicted-ch.json` den Hash einer Eichtabelle, die es nicht mehr gibt; `verify:glacier-snowcal` I8 bleibt rot, bis sie neu gebaut ist | ein grüner Prüfer · Tabelle mit `--mode=table` neu bauen (Jans Wort), Faktoren vorher und nachher vergleichen (erwartet: gleich) |
| V-GM-150 | Das Venedigerkees hat 11 gemessene Winter je Stufe, aber keinen eigenen Platz im Katalog (AGI 5 führt es im Obersulzbach Kees) | ein Eichgletscher mehr in Österreich, wenn der Katalog es trennt · prüfen, ob AGI 5 / RGI 6 einen Teilumriss für RGI60-11.00116 hergibt; bis dahin Wahrheit nur für den Landeswert |

### 3q.4 Der ungesehene Winter 2025/26 (1.4; ein Winter)

**Regel vor dem Lauf eingefroren:** `audit/gletscher-schneemodell/gm11-winter26-frozen.md`, sha256 `f563fd0813b018ec…` (`gm11-winter26-frozen.sha256`); das Werkzeug `gm11-winter26.mjs` prüft den Hash und rechnet das Urteil. Nichts neu angepasst.

**Daten.** GLAMOS Release 2026 (`massbalance_2026_r2026.zip`, 506 763 B, sha256 `2994804f…`): **gleiches Format** wie Release 2025 (gleiche Kopf- und Spaltenzeilen), **gleicher Lizenzkopf** („scientific and non-commercial use“, durch die Bestätigung vom 25.11. gedeckt) — kein STOPP. 27 Schweizer Gletscherwinter 2026 (alle Stufen mit Winterbilanz). Antrieb neu gebaut in `C:\dev\buscosun-glacier-cache\gm11\w26\` mit den Werkzeugen der Eichung (`snowcal-forcing.mjs` 01.09.2024–01.06.2026, `py/snowcal_grid.py`, `snowcal-radiation.mjs`): SwissMetNet stündlich aus den Dekadendateien bis 31.12.2025, **Januar–November 2026 aus `…_h_recent.csv` im Cache angehängt** (gleicher Kopf, Stunden nach dem letzten Wert; 57 Stationen); RhiresD 2024, 2025 und Januar–Mai 2026 als Monatsdateien „last“ (882 Tage, keine Lücke; Dezember 2025 in „last“ und Jahresdatei an allen 28 Zellen gleich bis 0,1 mm). Strahlung fehlt an 3 von 55 Gletscherwintern in mehr als 2 % der Stunden, an keinem in mehr als 15 %.

**Gegenprobe (Winter 2025, Wahrheit von GM-3, eigener Faktor).** Erster Lauf **rot**: 26 von 27 Gletschern gleich auf 0,0 mm, **Vadret Pers 161 mm anders** — die Stationsregel wählt im Zeitraum 2024–2026 Passo del Bernina (4,8 km, 98 %), in der Eichung (2011–2025, dort unter 90 % der Stunden) Piz Corvatsch. Nach der Regel nicht gewertet (Bericht `winter26-run1-probe-red.json`; seine Zahlen habe ich gesehen, sie unterscheiden sich vom gewerteten Lauf nur an Pers um ≤ 1,5 mm im Mittel). Behoben, wie der Auftrag sagt („Antrieb wie in der Eichung“): im neuen Speicher tragen die Eichgletscher die Temperaturstation der Eichung (`stations.json`, Vermerk `assignFrom`; die Regelzuordnung 2024–2026 liegt daneben). Zweiter Lauf: **Gegenprobe grün, 27 von 27 gleich (0,0 mm)**.

**Ergebnis (gletscherweite Winterbilanz, `s2` in mm w. e.; Bias = mittleres `s3`, Modell − Messung):**

| Grundlage | Gletscherwinter 2026 | mittleres s2 2026 | Bias 2026 | Referenz (ausgelassen): Mittel | p10 … p90 des Mittels bei n Wintern | Regel hält? |
|---|---|---|---|---|---|---|
| Landeswert (F 1,793) | 27 | **458,9** | −413,4 | 397,1 (391) | 307,0 … 501,7 | **ja** |
| eigener Faktor | 25 | **388,0** | −388,0 | 204,3 (391) | 156,9 … 256,9 | **nein** |
| eigener Faktor + Form | 25 | **388,3** | −388,3 | 204,2 (391) | 155,5 … 257,5 | **nein** |
| vorhergesagt (Form C) | 27 | **389,7** | −359,8 | 313,1 (377) | 225,8 … 419,3 | **ja** |
| vorhergesagt, geschrumpft | 27 | **405,9** | −395,0 | 327,0 (377) | 244,4 … 427,3 | **ja** |
| wie gebaut (Tabelle) | 27 (own 25, predicted 2) | 391,0 | — | — | — | — |

**Lesart (ein Winter, kein Urteil über die Tabellen):** Der Winter 2025/26 liegt mit dem Stationsantrieb an fast jedem Gletscher **zu niedrig** — alle Grundlagen um 360–415 mm (gemessen im Mittel 998 mm); an allen 25 Gletschern mit eigenem Faktor ist sein Fehler negativ (von −19 mm an Alphubel N und Giétro bis −778 mm am Schwarzberg). Dieser gemeinsame Fehler des Winters ist größer als die Unterschiede der Grundlagen: der eigene Faktor ist 2026 nicht besser als die Vorhersage (388 gegen 390) und nur 15 % besser als der Landeswert; nach der Regel **hält er nicht**, weil seine Referenz (ein Winter ausgelassen) mit 204 mm eng ist — er kannte die übrigen Winter dieses Gletschers. Landeswert und Vorhersage halten, weil ihre Referenz breiter ist. Ob der Winter am Antrieb (RhiresD in der Höhe, Strahlung), an der Schmelze oder an der Messung (Stichtag 30.04.) liegt, sagt ein Winter nicht.

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-151 | Im ungesehenen Winter 2025/26 liegen alle fünf Grundlagen um 360–415 mm zu niedrig; der Jahresfehler ist größer als jeder Unterschied der Grundlagen, und der eigene Faktor hält seine Referenz nicht | warnt, dass die Spanne der Faktoren die Jahr-zu-Jahr-Streuung unterschätzt · die Spanne je Grundlage um einen Jahresanteil erweitern, bevor E-GM-38 einschaltet; am Winter 2026 RhiresD gegen die IMIS-/Messfeld-Neuschneesummen der Saison prüfen |
| V-GM-152 | Die Stationsregel der Eichung hängt am Zeitfenster: dieselbe Regel wählt für Pers 2011–2025 Piz Corvatsch, 2024–2026 Passo del Bernina (161 mm Unterschied in einem Winter) | jede neue Eichrunde rechnet mit denselben Stationen · die Zuordnung der Eichung als Datei festhalten und neu nur mit Vermerk ändern |

**Nachtrag 25.11. abends — E-GL-17 in einem Commit der Historie verletzt.** Commit `d1361864` enthielt in `audit/gletscher-schneemodell/gm11-winter26-report.json` die gemessene gletscherweite Winterbilanz 2026 (Feld `BW`) von 27 Schweizer Gletschern aus GLAMOS Release 2026; `3820bffa` nimmt sie heraus. Beide sind mit `44e7af13..2de69d0b` am 25.11. um 21:13 UTC auf `origin/main` gepusht (Jan); die Historie wird nicht umgeschrieben. Gedeckt durch CC BY 4.0 und die schriftliche Bestätigung von GLAMOS vom 25.11. (Release 2026, `audit/gletscher/licences.md`). **Geprüft: die Datei in `d1361864` nennt GLAMOS nicht als Quelle** (kein Vorkommen von „GLAMOS“, nur die Regel-Datei) — die Namensnennung fehlt dort; sie steht in diesem Abschnitt und in der eingefrorenen Regel. Der Baum an HEAD ist sauber (`BW` 0-mal).

### 3q.5 Hindcast-Prüfung, Stufe A: Diagnose (1.5; nichts gerechnet)

**a) Bestand.** Der Hindcast (`C:\dev\buscosun-hindcast`) hält je Slot und Stufe **nur die 405 Archivpunkte**, je Punkt die nächste Cube-Zelle (0,05°) und drei Nachbarn (Block 2 × 2, `cells\t1.json`); die Rohquellen sind nur für diese 8 680 Zellen ausgezogen. Es gibt keine Kacheln: ein Gletscher geht nur dort, wo seine Fläche nahe einer gespeicherten Zelle liegt. Abstand vom L1-Umriss zur nächsten gespeicherten Zellmitte, für die 43 Eichgletscher (Werkzeug im Scratchpad, Ergebnis `C:\dev\buscosun-glacier-cache\gm11\hindcast-inventory.json`):

| Gletscher | Höhen (Zunge/Median/Oberkante) | Zelle, Abstand | Modellhöhe ICON-D2 / ICON-CH1 / ICON-EU | Punkt | Winter 23/24 · 24/25 |
|---|---|---|---|---|---|
| Grosser Aletsch (CH) | 1 639 / 3 147 / 4 119 | 0 km (auf dem Eis) | 3 279 / 3 493 / 2 543 | 06730 Jungfraujoch | ja · ja |
| Kleinfleißkees (AT) | 2 740 / 2 854 / 3 052 | 0 km | 2 571 / 2 859 / 2 315 | 11146 Sonnblick | nein · nein (Stufen nur bis 2021) |
| Goldbergkees untere Teile (AT) | 2 394 / 2 659 / 2 755 | 1,0 km | dieselbe Zelle | 11146 | nein · nein |
| Basòdino (CH) | 2 585 / 2 917 / 3 193 | 1,5 km | 2 107 / 2 020 / 1 862 | 06751 | ja · ja |
| Murtèl (CH) | 3 027 / 3 159 / 3 298 | 1,6 km | 2 566 / 2 666 / 2 730 | 06791 Piz Corvatsch | ja · ja |
| Rhone (CH) | 2 209 / 2 964 / 3 619 | 1,9 km | 2 260 / 2 795 / 2 218 | 06744 | ja · ja |
| Corvatsch (CH) | 3 073 / 3 230 / 3 365 | 2,2 km | wie Murtèl | 06791 | ja · ja |
| Findelen (CH) | 2 552 / 3 324 / 3 902 | 2,5 km | 2 788 / 2 952 / 2 858 | 06748 | ja · ja |
| Vorab, Segnas (CH) | 2 624 … 3 040 | 2,2 / 3,3 km | 1 876 / 1 626 / 2 026 | 06682 | nein · nein |

Bis 10 km liegen 31 der 43 (darunter Jamtal 5,1 km, Mullwitz 5,5 km, Gries, Oberaar, Plaine Morte, Pers, Allalin, Corbassière, Clariden); 2 mit der Zellmitte auf dem Eis, 10 bis 3 km. Mit beiden Wintern in der Wahrheit und Zelle ≤ 3 km bleiben **sechs Schweizer Gletscher** (Aletsch, Basòdino, Murtèl, Rhone, Corvatsch, Findelen); Österreich hat bis 3 km keinen gemessenen Winter 2023/24 oder 2024/25 (Goldberg und Kleinfleiß: Stufen nur bis 2021). Quellen in jeder dieser Zellen: ICON-D2, ICON-CH1-EPS, ICON-EU, IFS HRES, AIFS. Die Modellhöhe liegt bis 1 000 m unter der Medianhöhe (Basòdino −810 m mit ICON-D2): der Wiederholungslauf setzt wie `melt.mjs` flaches Gelände in der Höhe des Bands, die Höhenkorrektur von buscosun Fusion trägt diese Lücke. **Winter vollständig in t1:** 2023/24 und 2024/25 je an jedem Tag Oktober–Mai ein Slot (00 UTC, Vorlauf 0–23 h). 2023/24 hat kein t2/t3 (ab 01.04.2024). „Echte“ t1-Läufe (Lauf-Route) erst ab 17.06.2026 — davor ist t1 nur Tag 0. Der Winter 2024/25 liegt im Tresor des Prüfstands (01.04.2024 … 31.08.2025): ein Fit an ihm verdirbt Spur R (`tresor.json`); eine reine Messung ohne Fit tut das nicht.

**b) Was der Wiederholungslauf braucht.** Der Prüfstand (`scripts\pruefstand\run.mjs`, Worker `replay-worker.mjs`, 3 Worker à 5 000 MB) ruft nicht `getPointForecastFromCube`, sondern direkt `fuseCubePoint` aus dem Worktree der Version (`lib\replay.mjs:39-54`); den Slot liest `readHindcastSlot` (`replay.mjs:177`), die Reihe baut `seriesFromSlotTier` (`scripts\fusionfit\lib\slotAdapter.mjs:23`), das Gelände kommt aus `features\points.v1.json`. Für einen Gletscher an einem Archivpunkt geht der Ruf in drei Höhen, indem `input.terrain` und `input.elevationM` überschrieben werden wie in `cubeSource.ts:3093-3095` — ein neuer Leser im Gletscher-Werkzeug, **keine Änderung an buscosun Fusion**. Gegen Fusion 14 fehlt im Hindcast: das RUC-Glied (kein RUC im Hindcast, `audit/niederschlag-ruc.md` §15: „der Prüfstand kann Fusion 14 nicht replayen“), Messungen (Anker, dichter Satz: im Hindcast wirkungslos, 12v ist dort rechnerisch 11), Stationsprodukt und Radar. Höchster nachspielbarer Stand: `fusion-12z`, auf dem Hindcast praktisch die Kette ohne Anker und Radar. **Zeit:** gemessen 11–22 ms je Ruf (Spur R), 4 ms mit kurzem Fenster; je Gletscherwinter 212 Slots × 3 Höhen × 2 Rufe ≈ 1 300 Rufe ≈ 25–60 s Rechenzeit, dazu das Lesen der Slots (1,1 MB gz je Winter-Slot, einmal für alle Gletscher). Sechs Gletscher × zwei Winter ≈ 10–15 min, Speicher wie der Prüfstand (ein Worker ≤ 5 GB; ein Lauf zur Zeit).

**c) Die Wahrheit.** Winterbilanz je Stufe: GLAMOS Release 2026 (Q17a), WGMS FoG 2026-02-10. **GLAMOS-Punktarchiv Release 2026** geladen (`massbalance_point_2026_r2026.zip`, 1 856 107 B, sha256 `daa45016…`, Q18): 54 Gletscher mit Winterdatei; **22 ohne Stufenwerte** (nach Namen gegen die Stufendatei 2026 abgeglichen, von Hand geprüft für Medel, Tortin, Chessjen NW, St. Anna, die Stufen haben), davon mit Winterpunkten 2012–2026 nur sechs: Schwarzbach 406, Unterer Grindelwald 70, Gurschen 45, Tödi 44, Alphubel Gipfel 34, Blauschnee 3. Punkte 2012–2026 an den Gletschern mit Stufen, die meisten: Findelen 8 788, Rhone 5 836, Tsanfleuron 5 777, Silvretta 2 698, Murtèl 1 873, Gries 1 477, Sex Rouge 1 443, Plaine Morte 1 425, Pers 1 191, Basòdino 1 044; im Winter 2026 an 26 Gletschern (Pers 315, Rhone 285, Findelen 254, Gries 243, Morteratsch 238 …). (Die Recherche nannte 24 ohne Stufen; Orny trägt im Release 2026 vier Jahre Stufen.) Zählung je Gletscher und Jahr: `C:\dev\buscosun-glacier-cache\gm11\points-2026.json`. **Österreich:** WGMS `mass_balance_point` Hintereis 2013–2025 (1–54 je Jahr, 286), Jamtal 2020 107, 2021 82, 2025 73; PANGAEA (einmal geladen, CC BY 4.0) Mullwitz 2007–2024 je 2–6 Schächte (65), Venediger 2012–2024 je 2–3 (37).

**d) Ohne Gletscher: der Kern ohne Faktor gegen Langreihen.** Alles erreichbar, ohne neue Quelle: **Weissfluhjoch** — SLF-Messfeld 5WJ0 (2 536 m) mit Schneehöhe täglich seit 1936 und Wasserwert des Neuschnees an 24 871 Tagen seit 1939 (Cache von GM-3, `gm3\slf\all-stations.csv`), dazu SwissMetNet WFJ stündlich (Cache `gm3\smn\raw-WFJ-*`); **Sonnblick** — GeoSphere `klima-v2-1d` Station 15411 (3 109 m, seit 1986) mit `sh`, `sh_manu`, `shneu_manu`, `rr`, `tl_mittel` (stündlich `klima-v2-1h`); **Zugspitze** — DWD `daily/kl` 05792 (seit 1900, `historical` bis 31.12.2025) und 20278 ab 01.02.2026, Schneehöhe `SHK_TAG`, ohne Wasserwert. Weissfluhjoch ist der sauberste Test von Setzung und Dichte: gemessener Neuschnee-Wasserwert als Eingang (kein Faktor, kein Modellniederschlag), gemessene Schneehöhe als Wahrheit.

**e) Plan mit Entwurf der Regel:** `audit/gletscher-schneemodell/gm11-hindcast-plan-draft.md` (nicht eingefroren). Kern: dieselben Gletscher, dieselben Winter, derselbe Faktor je Grundlage; Antrieb S (Station) gegen H (Hindcast über `fuseCubePoint` in drei Höhen); vier Läufe tauschen je eine Größe (Niederschlag, Phase, Temperatur/Schmelze, alles); Rest = Wechselwirkung; der Faktor als Verhältnis k*_H / k*_S (die „Brücke“); Setzung getrennt an Punkten mit Schneehöhe und an den Langreihen. „Der Antrieb ist der Hauptfehler“ hieße: `s2` von H mindestens 25 % über S mit p10 der Bootstrap-Differenz > 0, der Niederschlag trägt mindestens die Hälfte, und k*_H / k*_S außerhalb 0,8–1,25 (Grenzen `set`, Jans Wort). Negativkontrolle: der S-Antrieb durch denselben Weg geschickt trifft S Byte für Byte.

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-146 | Nur sechs Schweizer Eichgletscher haben eine Hindcast-Zelle ≤ 3 km und beide Winter; Österreich keinen | die Hindcast-Prüfung ist eine Stichprobe, keine Eichung · berichten je Gletscher; für mehr Gletscher müssten die Zellen der Gletscher in den Hindcast ausgezogen werden (Stunden je Quelle, Jans Wort) |
| V-GM-147 | Der Hindcast trägt kein RUC und keine Messungen; nachspielbar ist höchstens `fusion-12z` ohne Anker und Radar, nicht Fusion 14 | der Vergleich misst den Antrieb von buscosun Fusion ohne die Kurzfristglieder · den Stand im Bericht nennen; für die ersten 6 h ist der Unterschied am größten |
| V-GM-148 | Die Modellhöhe der Cube-Zellen liegt an den Kandidaten bis 1 000 m unter der Medianhöhe des Gletschers | der Wiederholungslauf prüft auch die Höhenkorrektur von buscosun Fusion · im Bericht je Gletscher die Höhendifferenz nennen und die Phase getrennt werten (Lauf 2) |

### 3q.6 Hindcast-Prüfung, Stufe A gerechnet (1b, 26.11.; nur Messung)

**Regel vor dem ersten gewerteten Lauf eingefroren:** `gm11-hindcast-frozen.md`, sha256 `77cd75866ab4fff7…` (`gm11-hindcast-frozen.sha256`); `gm11-hindcast.mjs` und `gm11-wfj.mjs` prüfen den Hash und rechnen das Urteil. Werkzeuge: `gm11-hindcast-forcing.mjs` (Antrieb H), `gm11-hindcast.mjs` (Läufe, Kontrollen, Urteil, Punkte), `gm11-wfj.mjs` (Weissfluhjoch). Bericht ohne gemessene Werte je Gletscherwinter: `gm11-hindcast-report.json` (E-GL-17: keine gemessene Bilanz, keine Modellbilanz, keine Punktwerte); alles andere in `C:\dev\buscosun-glacier-cache\gm11\hindcast\`. Nichts eingeschaltet, nichts in `buscosun-data`/`buscosun-archiv`, nichts gepusht, nichts geschrieben, was der Prüfstand liest.

**Bestand und Stand.** Stufe t1 ist Oktober–Mai in allen drei Wintern an den fünf Archivpunkten der sechs Gletscher lückenlos (243/244 Tage, jeder Slot 00 UTC mit 24 Stunden Temperatur und Niederschlag; `hindcast\t1-check.json`) — kein STOPP. Nachgespielt wird **buscosun Fusion 13 als `fusion-12x`** (Commit `2d0eb64e`, Worktree des Prüfstands, Tabellen des Registers mit sha256), auf dem Hindcast **ohne RUC, ohne Messungen, ohne Stationsprodukt, ohne Radar**, t1 „Tag 0“ mit Vorlauf 0–2 h; Fusion 14 ist nicht nachspielbar (V-GM-147). Aufruf von `fuseCubePoint` je Tag × 3-h-Block × drei Höhen (5 832 Rufe je Gletscherwinter, 2,2 ms je Ruf, ≈ 70 s), flaches Gelände in der Höhe wie `melt.mjs`; **keine Änderung unter `src/pointForecast`**. Speicher: ein Prozess, ein Gletscherwinter zur Zeit, vor jedem Schritt gemessen — nie unter 5,7 GB frei; kein Abbruch durch das System. **Gegen Antrieb S liegt 2025/26 im Fit-Zeitraum der Lernstufe 5e (Hindcast 01.09.2025–21.09.2026):** für H ist dieser Winter nicht ungesehen (V-GM-156); mit S wurde er einmal gesehen (§3q.4). 2024/25 liegt im Tresor des Prüfstands: nur gemessen.

**Kontrollen.** A: die Kopie von `simulate` (Phase und Schmelze getrennt) trifft `simulate`/`scoreOf` an allen 72 Gletscherwintern × Grundlagen bitgleich. B (Negativkontrolle): der S-Antrieb durch denselben Weg wie H (Reihen-Dokument → JSON → Datensatz → Kern → Wertung) trifft S an allen 72 bitgleich, Bandbilanzen eingeschlossen. Beide grün.

**Ergebnis, Hauptgrundlage eigener Faktor** (Mittel über die Gletscherwinter; `s2` = |Fehler der gletscherweiten Winterbilanz|, Bias = Modell − Messung, mm w. e.; buscosun Fusion 13 als `fusion-12x` ohne RUC/Messungen):

| Winter | n | s2 S | s2 H | Bias S | Bias H | p10 … p90 von s2_H − s2_S | k*_H / k*_S (Median) | Urteil des Skripts |
|---|---|---|---|---|---|---|---|---|
| 2023/24 | 6 | 171,3 | 519,9 | −157,0 | −7,0 | +260,5 … | 0,93 | H schlechter, aber nicht über Niederschlag/Faktor |
| 2024/25 (Tresor, nur gemessen) | 6 | 172,4 | 362,8 | −23,1 | +11,9 | +114,2 … | 0,88 | H schlechter, aber nicht über Niederschlag/Faktor |
| 2025/26 (einmal mit S gesehen; im Fit der Lernstufe) | 6 | 395,2 | 314,5 | −395,2 | −46,6 | −178,7 … | 0,69 | weder noch |
| alle drei | 18 | 246,3 | 399,1 | −191,8 | −13,9 | +105,0 … | 0,74 | **der Antrieb ist der Hauptfehler** |

Andere Grundlagen über alle drei Winter: Landeswert s2 247,5 → 346,3 (Bias −109 → +66), „weder noch“ (p10 −15,8); eigener Faktor + Form 248,7 → 395,1, „der Antrieb ist der Hauptfehler“; vorhergesagt 334,1 → 293,4 (Bias −265 → −135), „weder noch“, im Winter 2025/26 allein „der Antrieb ist besser“ (435,6 → 289,4).

**Lesart.** Mit H liegt das Modell **im Mittel richtig** (Bias −14 mm statt −192 mm), aber **je Gletscher weiter daneben** (s2 399 statt 246): an Aletsch, Murtèl und Corvatsch +110 … +600 mm zu hoch, an Rhone, Basòdino und Findelen −260 … −640 mm zu tief. Der Mittelwert ist ein Ausgleich von Fehlern beider Vorzeichen, kein Treffer. Der eigene Faktor ist mit S an den Wintern 2023/24 und 2024/25 **mitgeeicht** (Eichung 2011–2025) — dort ist S im Vorteil (V-GM-155); im Winter 2025/26, den keiner der Faktoren kannte, ist H besser (315 gegen 395 mm), und dort ist der Fehler mit S der bekannte gemeinsame Fehlbetrag (§3q.4).

**Woher die Differenz kommt (eigener Faktor, alle 18, Änderung des Bias gegen S):** Niederschlag **+267 mm**, Phase −44 mm, Temperatur/Schmelze −40 mm, Wechselwirkung −6 mm, zusammen +178 mm. In `s2`: S 246 → L1 (nur Niederschlag) 339 → L2 (+ Phase) 373 → L3 (nur Schmelze) 285 → L4 (alles) 399. Der Niederschlag trägt den größten Teil; mit `pSnow` statt der Rampe (L2b) 370 — die Phase entscheidet nichts.

**Niederschlag H gegen RhiresD am Gletscher (Wintersumme, H / RhiresD):** Aletsch 1,35 · 1,23 · 1,69; Murtèl 1,45 · 1,71 · 1,73; Corvatsch 1,50 · 1,76 · 1,79; Rhone 0,94 · 1,11 · 1,27; Basòdino 0,99 · 0,94 · 1,21; Findelen 0,68 · 0,57 · 1,29 (Winter 2023/24 · 2024/25 · 2025/26). Schneeanteil an der Medianhöhe in beiden 0,85–1,00, mit H an Rhone, Basòdino, Murtèl und Corvatsch 2–10 Punkte kleiner (H an der Medianhöhe 1,0–1,8 K wärmer an Rhone und Basòdino, deren Temperaturstationen 1 000 m tiefer stehen). Schneefallgrenze nasser Stunden (Mitte der Rampe, Median): S 1 400–2 080 m, H nach Standardgradient 1 510–2 210 m; aus den drei Antworten von buscosun Fusion selbst an Aletsch 500–850 m (die Zunge in 1 639 m ist in H kälter als der Gradient sagt), sonst 1 200–1 930 m. **Modellhöhe** `hModEff` der Zelle: 2 100–2 930 m, also 220–910 m unter der Medianhöhe (Rhone −730 … −870, Findelen −700 … −910, Basòdino −640 … −670, Murtèl/Corvatsch −520 … −720, Aletsch −220 … −270); je Quelle wie §3q.5 a (V-GM-148).

**Die Brücke k*_H / k*_S** (der für alle Bänder gleiche Faktor, der die Winterbilanz genau trifft; nicht benutzt): Aletsch 0,75 · 0,74 · 0,55; Murtèl 0,73 · 0,64 · 0,63; Corvatsch 0,71 · 0,62 · 0,63; Rhone 1,17 · 1,02 · 0,86; Basòdino 1,12 · 1,23 · 0,84; Findelen 1,43 · 1,81 · 0,74. Median 0,74, Spanne 0,55–1,81; keiner an einer Grenze. Mit H bräuchte das Modell im Mittel ein Viertel weniger Faktor — **der Faktor zählt im Betrieb dort doppelt, wo buscosun Fusion nasser ist als RhiresD** (Engadin, Aletsch); an Findelen, Rhone und Basòdino nicht. Die Brücke ist kein Wert, sondern eine Größe je Gletscher (V-GM-154).

**Punktmessungen (GLAMOS Punkte Release 2026, nie zuvor benutzt; eigener Faktor, ein Band in Punkthöhe vom 01.10. bis zum Messtag; nichts angepasst).** 2 606 Winterpunkte (April/Mai 2024, März–Mai 2025, April/Mai 2026), keiner weggelassen. Alle: S Bias −228 mm, MAE 384; H Bias −194, MAE 460. Je Höhenstufe (Bias S / H, n): 2 000–2 250 m −471 / −798 (47); 2 250–2 500 −124 / −244 (257); 2 500–2 750 −91 / −77 (286); 2 750–3 000 −376 / −434 (535); 3 000–3 250 −198 / +21 (888); 3 250–3 500 −303 / −334 (407); 3 500–3 750 −110 / −216 (178); 3 750–4 000 +884 / +523 (8). Je Winter MAE S / H: 2023/24 367 / 595, 2024/25 320 / 439, 2025/26 472 / 349. Gleiches Bild wie die Winterbilanz: S ist an den Punkten fast überall zu tief, H streut mehr und trifft nur 2025/26 besser.

**Weissfluhjoch (5WJ0, 2 536 m) — der Kern ohne Faktor** (Konstanten des Betriebs, Neuschneedichte 96 kg/m³, gemessener Wasserwert des Neuschnees als Eingang, SwissMetNet WFJ für Temperatur und Strahlung). 13 Winter gewertet (2014–2026); 2012 und 2013 nach der Regel nicht (15 bzw. 20 von 120/159 Schneefalltagen ohne `HNW_1D`); in den übrigen sind 0–11 Tage mit Neuschnee ohne Wasserwert mit dem gemessenen Mittel des Winters (Wasser je cm) gefüllt — diese Füllung nennt die Regel nicht, sie steht hier. Fehler der Schneehöhe (Bias, MAE in cm, je Monat): Okt −0,3/5; Nov −7,8/15; Dez −20,5/24; Jan −29,2/31; Feb −27,3/29; Mär −30,0/33; Apr −32,2/35; Mai −39,9/41; Jun −37,3/38. **Setzung nach Schneefall stimmt:** in den drei Tagen nach ≥ 10 cm Neuschnee −13,9 cm im Modell gegen −13,8 cm gemessen (n = 39, MAE 8,2). **Was nicht stimmt, ist die Schmelze im Hochwinter:** der Kern nimmt in 2 536 m im Mittel 37 mm im Dezember, 14 im Januar, 32 im Februar, 40 im März weg; ohne Schmelze (nur Diagnose) läge die Schneehöhe von Dezember bis März 15–26 cm zu hoch statt 20–30 cm zu tief. Mit H als Eingang (Archivpunkt 06780, flach auf 2 536 m, Faktor 1; drei Winter, 2024/25 Tresor, 2025/26 im Fit der Lernstufe): Schneefall-Wasser von buscosun Fusion **0,84 · 0,94 · 0,92 des gemessenen** (Wintersummen Oktober–Mai), Schneehöhe Dezember–Februar +9 … +24 cm (2023/24), +7 … +15 (2024/25), −12 … −28 (2025/26) gegen S mit +2 … +9, −7 … −16, −39 … −55. Setzungsfälle mit H nur 1–3 je Winter, ohne Aussage. Sonnblick und Zugspitze: nicht in dieser Runde.

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-153 | Mit dem Antrieb von buscosun Fusion (13 als `fusion-12x`, ohne RUC und Messungen) liegt die Winterbilanz der sechs Gletscher im Mittel richtig (−14 mm statt −192), aber je Gletscher weiter daneben (s2 399 statt 246); das Skript sagt über alle drei Winter „der Antrieb ist der Hauptfehler“, für 2025/26 allein „weder noch“ | der Mittelwert verdeckt Fehler beider Vorzeichen · je Gletscher berichten, nie das Mittel allein; vor jeder Änderung des Faktors im Betrieb mehr Gletscher in den Hindcast ziehen (V-GM-146) |
| V-GM-154 | Die Brücke k*_H / k*_S ist je Gletscher verschieden: 0,55–0,75 an Aletsch, Murtèl, Corvatsch (Fusion 23–79 % nasser als RhiresD), 0,74–1,81 an Rhone, Basòdino, Findelen; Median 0,74 | beantwortet V-GM-144 für diese sechs: der Faktor zählt dort doppelt, wo Fusion nasser ist · ein Faktor des Betriebs müsste gegen den Antrieb des Betriebs geeicht werden, nicht gegen RhiresD — aus sechs Gletschern keine Tabelle |
| V-GM-155 | Der eigene Faktor ist mit S an 2023/24 und 2024/25 mitgeeicht; der Vergleich S gegen H ist an diesen Wintern zugunsten von S verzerrt | die Wertung der Grundlagen „eigener Faktor“ und „+ Form“ an diesen Wintern ist kein fairer Vergleich · an Wintern außerhalb der Eichung wiederholen (2025/26 ist der einzige; der Landeswert ist schwächer betroffen) |
| V-GM-156 | Der Winter 2025/26 liegt im Fit-Zeitraum der Lernstufe 5e (Hindcast 01.09.2025–21.09.2026); für H ist er nicht ungesehen | genau der Winter, an dem H besser ist, kannte die Lernstufe · im Bericht vermerkt; ein sauberer Vergleich bräuchte einen Fit ohne diesen Winter (Jans Wort, Prüfstand) |
| V-GM-157 | Am Weissfluhjoch schmilzt der Kern im Hochwinter zu viel (Dez–Mär ≈ 120 mm in 2 536 m): die Schneehöhe liegt deshalb 20–30 cm zu tief, die Setzung stimmt (−13,9 gegen −13,8 cm, n = 39) | erster Kandidat für den gemeinsamen Fehlbetrag der Winter (§3q.4), der bisher dem Faktor zugeschrieben wurde · Albedo-Abfall auf 0,55 in sechs Tagen und Schwelle 1 °C an Sonnentagen prüfen, Strahlungsschmelze im Winter gegen das SLF-Messfeld messen; keine Änderung ohne Jans Wort |
| V-GM-158 | Am Weissfluhjoch liefert buscosun Fusion ohne Faktor 0,84–0,94 des gemessenen Neuschnee-Wassers je Winter — nicht das Doppelte wie am 24.11. (V-GM-144, ein Tag) | ein Faktor 1,79 wäre dort doppelt gezählt · V-GM-144 auf ganze Winter und mehr Messfelder ausdehnen, bevor er gedeutet wird |
| V-GM-159 | Die Schneefallgrenze aus den drei Antworten von buscosun Fusion liegt an Aletsch rund 1 000 m unter der des Standardgradienten (kalte Zunge in 1 639 m); die Modellhöhe der Zellen liegt 220–910 m unter der Medianhöhe | der Gradient des Kerns und die Höhenkorrektur von Fusion sagen am selben Gletscher Verschiedenes · im Wetterteil (`weathercore`) prüfen, welche Grenze angezeigt wird |
| V-GM-160 | An 2 606 Punktmessungen ist S fast überall zu tief (−228 mm), H streut mehr (MAE 460 gegen 384) und trifft nur 2025/26 besser (349 gegen 472) | zweite Wahrheit bestätigt die Winterbilanz · Punkte sind für die Form je Höhe zu nutzen, sobald der Kern (V-GM-157) geklärt ist |

### 3q.7 Winterschmelze des Kerns (1c, 26.11.; nur Messung, nach Schritt 3 GESTOPPT)

**Ablauf.** Die Arbeit von 1b lag schon als ein lokaler Commit vor (`0181b084`, nicht gepusht); kein weiterer Commit. Werkzeug `audit/gletscher-schneemodell/gm11-wintermelt.mjs` mit zwei Diagnose-Kopien (`stepLevelV` von `stepLevel`, `simulateV` von `simulate`) und den Varianten R1–R4; nichts unter `scripts/glacier/**`, `src/**`, kein Workflow, nichts in `buscosun-data`/`buscosun-archiv`. Bericht ohne Messwerte je Gletscherwinter: `gm11-wintermelt-report.json`; alles andere in `C:\dev\buscosun-glacier-cache\gm11\wintermelt\`. Ein Prozess, ein Messfeld zur Zeit, freier Speicher vor jedem Schritt 5,2–5,8 GB (nie unter 3 GB).

**STOPP nach Schritt 3:** nur ein SLF-Messfeld besteht die Paarungsregel (Auftrag: weniger als vier ⇒ Schritte 1–2 und 6 berichten, aufhören). **Schritte 4 und 5 sind nicht gerechnet, die Regel `gm11-wintermelt-frozen.md` ist nicht geschrieben und nicht eingefroren**; die Varianten R1–R4 stehen im Werkzeug, sind aber an keinem Messfeld und keinem Gletscher gewertet worden. Der Teil für Schritt 4/5 (`--step=glaciers`, `plots-rules`, `gatec`) bricht ohne eingefrorene Regel ab.

**Schritt 1 — nachgerechnet.** `gm11-wfj.mjs` trifft `hindcast\wfj.json` Byte für Byte (bis auf den Zeitstempel), wenn die SwissMetNet-Datei 2020–2029 aus `gm11\w26\smn` kommt (die in `gm3\smn` endet am 31.12.2025; damit fehlten im Winter 2026 4 351 Temperaturstunden). Schmelze Dez/Jan/Feb/Mär 36,7 / 14,4 / 31,9 / 40,4 mm — wie §3q.6.

**Kontrolle A:** die Kopie von `stepLevel` trifft das Original an allen 85 248 Stunden des Weissfluhjochs (Schmelze, Albedo, Wasserwert, Höhe je Stunde und die Schneedecke am Ende, `Object.is`) — grün. Die Kopie von `simulate` ist geschrieben, aber nicht geprüft, weil der Gletscherteil nicht lief.

**Schritt 2 — woher die Winterschmelze am Weissfluhjoch kommt** (5WJ0, 2 536 m, 13 Winter 2014–2026, Kern wie im Betrieb, gemessener Wasserwert des Neuschnees, SwissMetNet WFJ auf 2 536 m mit −6,5 K/km):

| Monat | Schmelzstunden je Winter | Schmelztage je Winter | mm je Winter | Anteil Temperaturglied | Anteil Strahlungsglied | Luft in den Schmelzstunden | Globalstrahlung | Albedo des Modells |
|---|---|---|---|---|---|---|---|---|
| Okt | 109 | 9,9 | 52,6 | 0,63 | 0,37 | 3,8 °C | 144 W/m² | 0,55 (654 Stunden auf Boden-Albedo 0,30) |
| Nov | 97 | 8,6 | 47,1 | 0,58 | 0,42 | 2,9 °C | 136 | 0,66 |
| Dez | 85 | 6,8 | 36,7 | 0,65 | 0,35 | 2,7 °C | 101 | 0,73 |
| Jan | 34 | 2,9 | 14,4 | 0,56 | 0,44 | 2,4 °C | 126 | 0,73 |
| Feb | 53 | 3,9 | 31,9 | 0,51 | 0,49 | 3,0 °C | 183 | 0,71 |
| Mär | 51 | 4,9 | 40,4 | 0,32 | 0,68 | 2,5 °C | 334 | 0,71 |
| Apr | 167 | 13,5 | 156,9 | 0,35 | 0,65 | 3,2 °C | 361 | 0,69 |

- Dezember–März zusammen **123 mm je Winter = 13 % des gemessenen Neuschnee-Wassers** einer Saison (958 mm im Mittel); mit Oktober–November 223 mm = 23 %.
- **Nicht an kalten Tagen:** nur 7,8 % der Dez–Mär-Schmelze fallen an Tagen mit Tagesmittel unter 0 °C, 5,0 % an Tagen nach einer Nacht unter −5 °C. Geschmolzen wird an milden Stunden — die Schwelle `Ti > 1 °C` heißt Luft über +1,18 °C; im Mittel liegt die Luft dann bei +2,4 … +3,0 °C.
- **Albedo:** an Schmelztagen hält das Modell 0,77–0,81 bis zwei Tage nach dem Schneefall, 0,71 nach 3–5 Tagen (53 mm je Winter, der größte Teil), 0,64 nach 6–10 Tagen (27 mm), 0,59 nach 11–20 Tagen (6,5 mm). Die Boden-Albedo greift im Hochwinter fast nie (4 Stunden, 0,4 mm).
- **Gemessene Oberfläche:** keine. Die SwissMetNet-Stundendateien von WFJ im Speicher tragen die Spalten langwellige Ausstrahlung (`olo000h0`), reflektierte Kurzwelle (`osr000h0`) und `ods000h0` 2010–2026 leer; eine Schneeoberflächentemperatur steht in keiner Quelle von §4. Nicht geholt.
- **Diagnose ohne Dez–Mär-Schmelze** (nur hier): Fehler der Schneehöhe Dez/Jan/Feb/Mär −13,1 / −13,6 / −8,3 / −1,3 cm statt −20,5 / −29,2 / −27,3 / −30,0; April +2,5 statt −32,2; Ausapern 7,0 statt 9,6 Tage zu früh (gemessen 10.06.–01.07., gekappt am 01.07. in 4 Wintern). Der Rest im Dezember/Januar ist die Schmelze von Oktober/November (100 mm), die weiterwirkt.

**Lesart.** Die Winterschmelze ist ein Temperaturfehler, kein Albedofehler: sie kommt an milden Stunden über einer Schneedecke, die in Wirklichkeit noch kalt ist (Kältereserve) und deren Schmelzwasser wieder gefriert — beides kennt der Kern nicht. Das Strahlungsglied wächst erst im März. Das passt zu R1 (Kältereserve) vor R2 (Albedo); R3 (weicher Einsatz) würde Schmelze *hinzufügen*. Dazu kommt ein Verdacht am Antrieb: die Station WFJ steht 155 m ÜBER dem Messfeld; die Abwärtskorrektur mit −6,5 K/km macht das Messfeld 1 K wärmer, bei Inversion ist es aber kälter (V-GM-163). Ob das an Gletschern genauso ist und wie viel vom Faktor es erklärt, ist **nicht gemessen** (Schritt 4 lief nicht). Grobe Hochrechnung, keine Messung: nähme der Kern auf Gletschern ebenfalls 13 % der Akkumulation im Hochwinter weg, wäre ein Faktor um rund 15 % zu hoch (1/0,87) — 1,79 hieße dann ≈ 1,56.

**Schritt 3 — Messfelder.** Paarungsregel: Anteil der Schneefalltage mit Wasserwert ≥ 90 % (2011–2026 zusammen), nächste SwissMetNet-Station des Speichers ≤ 10 km und ±300 m mit Temperatur und Globalstrahlung, ≥ 3 gewertete Winter (Wasserwert ≥ 90 % je Winter, Temperatur fehlt ≤ 10 % der Stunden). Von 116 Messfeldern der Datei: **besteht nur 5WJ0** (WFJ, 0,5 km, +155 m); 27 ohne jeden Wasserwert, 88 mit zu wenig — die meisten 15–40 %, die besten Innerferrera 61 %, Poschiavo 51 %, Landquart 42 % (Liste im Bericht). Die SLF-Messfelder messen den Wasserwert offenbar nur an einem Teil der Schneefalltage; die Frage „an wie vielen Orten“ lässt sich mit dieser Datei und dieser Regel nicht beantworten.

**Schritt 6 — Stationsantrieb 2025/26** (Wintersumme Oktober–April). Wie `gm11\w26` gebaut ist: RhiresD 2024 und 2025 als Jahresdateien, **Dezember 2025 bis Mai 2026 als Monatsdateien `…-last…`** (eine endgültige Jahresdatei 2026 gibt es im Speicher nicht); 2024/25 ist in der Eich-Datei (`gm3`) und in `w26` an allen 28 Punkten gleich (Verhältnis 1,000). Die Datei `w26\rhires.json` beginnt am 01.01.2024 — Oktober–Dezember 2023 fehlen ihr; 2023/24 kommt hier aus der Eich-Datei. Welche Stationen die „last“-Dateien tragen, sagen die Dateien nicht.

| Verhältnis 2025/26 zu 2024/25 | RhiresD am Gletscher | SwissMetNet-Regenmesser in der Nähe |
|---|---|---|
| Findelen | **0,31** | Zermatt 0,53 · Grächen 0,48 · Mottec 0,57 · Evolène 0,47 |
| Basòdino | 0,54 | Robièi 0,58 · Piotta 0,59 |
| Murtèl, Corvatsch | 0,59 | Piz Corvatsch 0,58 · Segl-Maria 0,60 · Samedan 0,57 |
| Aletsch | 0,69 | Grimsel Hospiz 1,02 · Ulrichen 0,73 · Simplon 0,49 |
| Rhone | 0,82 | Grimsel Hospiz 1,02 · Ulrichen 0,73 |
| alle 27 CH-Gletscher / alle 46 Messer | Median 0,69 (p10 0,36, p90 0,91) | Median 0,71 (0,48 … 1,02) |

Weissfluhjoch: Neuschnee-Wasser 1,29 (619 gegen 459 mm), Messer WFJ 1,18. Gegen das Mittel der beiden Vorwinter: RhiresD am Gletscher Median 0,55, Messer 0,52 (2023/24 war sehr nass). **Urteil:** der Winter 2025/26 war wirklich trocken (Messer und RhiresD sagen dasselbe, im Engadin und am Basòdino auf ±0,05); **nur an Findelen liegt RhiresD rund 40 % unter dem, was die Messer ringsum sagen** — dort ist ein Datenfehler der vorläufigen „last“-Dateien möglich, sicher sagen lässt es sich erst mit der endgültigen Datei (V-GM-165). Das passt zum Sprung von H/RhiresD an Findelen (0,57 → 1,29, §3q.6).

| V-… | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-161 | Am Weissfluhjoch fällt die Winterschmelze (123 mm Dez–Mär, 13 % des Neuschnee-Wassers) an milden Stunden (+2,4 … +3,0 °C), nur 8 % an Tagen mit Tagesmittel unter 0 °C; ohne sie läge die Schneehöhe Jan–Mär 1–14 cm statt 27–30 cm zu tief | der Kern lässt eine Schneedecke schmelzen, die in Wirklichkeit noch kalt ist; das ist die wahrscheinlichste Ursache des gemeinsamen Fehlbetrags · R1 (Kältereserve) zuerst prüfen; dafür braucht es mehr als ein Messfeld (V-GM-162) |
| V-GM-162 | Nur 1 von 116 SLF-Messfeldern hat an ≥ 90 % der Schneefalltage einen Wasserwert des Neuschnees; die Paarungsregel von Schritt 3 lässt sich nicht erfüllen | ohne mehr Orte bleibt jede Regel eine Weissfluhjoch-Regel · Jans Wahl: Schwelle senken und die fehlenden Tage aus dem Winter-Mittel Wasser je cm füllen (Innerferrera 61 %, Poschiavo 51 % kämen dazu, beide tief), Sonnblick (`shneu_manu`, GeoSphere, in §4) als zweiten Hochort, oder Messfelder nur mit Schneehöhe und dem Niederschlag der Station (dann wirkt wieder ein Faktor) |
| V-GM-163 | Die Station WFJ steht 155 m über dem Messfeld; die Korrektur mit −6,5 K/km macht das Messfeld 1 K wärmer, bei winterlicher Inversion ist es kälter | ein Teil der „Winterschmelze“ kann im Antrieb liegen, nicht im Kern · dieselben Läufe mit der Stationstemperatur ohne Höhenkorrektur als Gegenprobe (nur Diagnose) |
| V-GM-164 | Zwei Drittel der Dez–Mär-Schmelze fallen 3–10 Tage nach dem letzten Schneefall bei Modell-Albedo 0,64–0,71 | die Albedo ist eine Nebenursache · R2 als zweite Regel, nach R1 |
| V-GM-165 | RhiresD 2025/26 an Findelen = 0,31 des Vorwinters, die Regenmesser ringsum 0,47–0,57; sonst liegen RhiresD und Messer auf ±0,1 (Aletsch gemischt); Jan–Mai 2026 stammen aus vorläufigen Monatsdateien „last“ | ein Teil des Fehlbetrags 2025/26 an Findelen kann ein Datenfehler sein · die endgültige RhiresD 2026 holen, sobald MeteoSchweiz sie veröffentlicht, §3q.4/§3q.6 für Findelen wiederholen |
| V-GM-166 | Auch ohne Dez–Mär-Schmelze bleibt der Dezember 13 cm zu tief (Oktober/November 100 mm Schmelze, davon 654 Oktober-Stunden mit Boden-Albedo 0,30) und das Ausapern 7 Tage zu früh | eine zweite, kleinere Fehlerquelle liegt im Frühwinter und im Frühjahr · im nächsten Durchgang die Herbstschmelze auf dünner Decke getrennt werten |

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
| Q17 | GLAMOS Massenbilanz, `doi.glamos.ch` (Release 2025) | Winter- und Jahresbilanz gletscherweit **und je Höhenstufe** | teils da (Gate C nutzte nur gletscherweit) | CC BY 4.0, belegt; der Widerspruch zur Kopfzeile der CSV-Dateien („non-commercial“) ist **aufgelöst durch die schriftliche Bestätigung von GLAMOS (Mail an Jan, 25.11.2026: abgeleitete Modellparameter in einem kostenlosen Webdienst; die Mail liegt bei Jan)**; Quellenangabe bleibt Pflicht — empfohlenes Zitat des Release 2025 (`audit/gletscher/licences.md`, „GLAMOS — Bestätigung 25.11.2026“) |
| Q17a | GLAMOS Massenbilanz Release 2026 (doi:10.18750/massbalance.2026.r2026) | +1 Winter (2025/26) je Schweizer Gletscher; ungesehener Prüfwinter (V-GM-137) | neu | **geprüft von Jan, 25.11.**: Nutzung von GLAMOS per Mail bestätigt (`audit/gletscher/licences.md`, „Punktmessungen und Release 2026“), Quellenangabe Pflicht |
| Q18 | GLAMOS Punktmessungen (`massbalance_point`), Release 2026 (doi:10.18750/massbalance.point.2026.r2026) | Schneesondierungen im April/Mai mit Lage und Höhe an 54 Gletschern | neu | **geprüft von Jan, 25.11.**: CC BY 4.0, Nutzung von GLAMOS per Mail bestätigt, Quellenangabe Pflicht |
| Q19 | WGMS Fluctuations of Glaciers | Winterbilanzen österreichischer und deutscher Gletscher, teils je Höhenband | da (Reihen) | wie bisher |
| Q20 | SLF-Schneedatensatz 2016–2025, 250 m, Zenodo `10.5281/zenodo.17313889` | tägliche Schneehöhe und Wasserwert für die Schweiz, zehn Winter; zehn Archive, zusammen rund 6,3 GB | neu | CC BY 4.0, belegt (Zenodo-Eintrag) |
| Q21 | MeteoSchweiz SwissMetNet, Stundenwerte | gemessener Antrieb für die Eichung an vergangenen Wintern | da (Gate C) | wie bisher |
| Q22 | Universität Innsbruck, Hintereisferner | Fremdtest wie in Gate C | da | wie bisher |

**Neu aus der Recherche vom 25.11.** (`audit/gletscher-schneemodell/quellen-wahrheit-2026-11-25.md` §7, Wortlaute und Fundstellen dort). Alle Einträge **Vorschlag**, außer Q17a und Q18 (oben, geprüft von Jan, 25.11.).

| Nr. | Quelle | Was | Stand | Lizenz · Empfehlung |
|---|---|---|---|---|
| Q19a | WGMS Echtzeit-Datenbank `db.wgms.ch` | unbekannt (nicht abgefragt) | Vorschlag | wie Q19, „real-time data lacks a version or DOI“ · einmal nur lesend abfragen (Jans Freigabe), nichts Unversioniertes in die Eichung |
| Q24 | IGF ÖAW, Stubacher Sonnblickkees, Höhenzonen `bwaZ` 2017/18–2024/25 (PANGAEA 993864 ff.) | +1 Eichgletscher in Österreich (8 Winter) | Vorschlag | CC BY 4.0 · use |
| Q25 | IGF ÖAW, Winter-Punktbilanzen Mullwitzkees 2006–2024, Venedigerkees 2011/12–2024 | Prüfpunkte mit x/y/z | Vorschlag | CC BY 4.0 · use (Prüfung) |
| Q26 | IGF ÖAW, Weißseespitze (Gepatschferner), Schneehöhe am Pegel und SR50A 2017–2024 | Schattenpaar auf dem Eis, ohne Wasserwert | Vorschlag | CC BY 4.0 · use |
| Q27 | Universität Innsbruck, CRNS-SWE + Schächte Hintereisferner 2021–2024 (Zenodo 15019323) | SWE-Punkte auf dem Eis | Vorschlag | CC BY 4.0 · use (Prüfung) |
| Q28 | Universität Innsbruck, Jahresberichte HEF-KWF, Sondierungen je Jahr | ≈ 30 Punkte je Winter | Vorschlag | keine Lizenz · ask provider |
| Q29 | Hintereisferner ALS-DEMs (PANGAEA 875889) | Frühjahr − Herbst, ein Winter im Fenster | Vorschlag | CC BY 3.0 · drop |
| Q30 | Vernagtferner (BAdW), Winter je Stufe nach 2012 | +1 Eichgletscher, falls vorhanden | Vorschlag | Website NC · ask provider |
| Q31 | GeoSphere / Sonnblick Verein: Goldberg, Kleinfleiß, Wurten, Pasterze | Stufen nach 2021, Wurten nach 2011 | Vorschlag | nichts Offenes · ask provider |
| Q32 | DWD Zugspitze SHK_TAG (05792 bis 01.02.2026, 20278 ab dann) | Schneehöhe neben den vier deutschen Gletschern, täglich, ohne Wasserwert | Vorschlag | CC BY 4.0 · use (Schattenpaar, V-GM-138) |
| Q33 | EnviDat UAV-DSMs St. Annafirn, Findelen, Gries 2015–2016 | indirekte Schneehöhenfelder | Vorschlag | ODbL · drop |
| Q34 | SLF Flugzeug-Schneehöhenkarten (envidat.418, .62) | auf Gletschern maskiert | Vorschlag | ODbL · drop |
| Q35 | Zugspitze Pléiades-Schneehöhe 09.04.2021 (Zenodo 13475075) | ein Termin, Abdeckung ungeprüft | Vorschlag | CC BY 4.0 · use nur bei Abdeckung, sonst drop |

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
| GM-3c | Schneekern im Producer als Schattenprodukt `glacier/v1/snowpack/` (Schalter `--snowpack=shadow`, aus), Vertrag `glacierSnowpackContract.ts`, Zustand unabhängig von der Taktung, Einschwingen ab 1.10. aus Analysen (`snowpack-seed.mjs`), alle Gletscher (§3f) | erledigt 23.11., auf `origin/main` (`c4b45c9e`); auf dem Runner eingeschaltet seit 23.11. abends (E-GM-18, §3f.8), erster Lauf `2026112323` grün und nach Vertrag, zweiter Lauf `2026112405` schreibt den Zustand fort |
| GM-4 | Kopplung an Stationen, Abweichungstabelle, Nachbar-Übertrag; Satelliten-Abgleich einmal je Szene (behebt M-18) | **Diagnose 23.11. (§3h): keine Kopplung belegt.** Gebaut als GM-4a (E-GM-20 … E-GM-23, auf `origin/main` seit 24.11. `019ab63c`, Schalter aus): Schattenpaare + Archiv, Satellit einmal je Szene im Schmelzlauf, kein Übertrag. GM-4b (Kopplung) erst nach der Messung mit Schattenläufen (mindestens fünf Ereignisse je Station) |
| GM-3d | Zustand des SCHMELZLAUFS an der Laufstunde mit 18 Stunden Antrieb (Schalter `--melt-state=run-hour`, aus), unabhängig von der Taktung (V-GM-32, §3g) | erledigt 23.11. abends, auf `origin/main` (`b7a0e859`); auf dem Runner eingeschaltet seit 23.11. 21:13 UTC (E-GM-19, §3g.8), erster Lauf `2026112323` wie erwartet, im zweiten Lauf `2026112405` nachgerechnet (`replayedH 6`); der 3-Stunden-Fall kam noch nicht vor |
| GM-5 | Verteilung aus Sentinel-2, Szenarien und Spannen (das Einschwingen ist mit GM-3c vorgezogen) | **Diagnose 23./24.11.: die Verteilung aus Sentinel-2 tragen die Daten nicht (E-GM-30: nicht gebaut).** GM-5a gebaut 24.11. (§3i, Schalter aus, auf `origin/main` `b448d652`): Spannen der Schneedecke aus 100 Szenarien, Summe der Tage 8–14, Paar zum Faktor im Kopf. GM-5b gebaut 24.11. (§3j, Schalter aus, auf `origin/main` `b448d652`): Eichrunde 2 — Faktor je Gletscher und Form je Höhenstufe für 43 vermessene Gletscher, im Schmelzlauf verdrahtet |
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
- E-GM-14 … E-GM-18 und V-GM-32 … V-GM-42: §3f.7. E-GM-18 ist umgesetzt, der erste Lauf (`2026112323`) und der zweite (`2026112405`, Zustand fortgeschrieben) gelesen (§3f.8). V-GM-39 (Prüfer in die CI) ist umgesetzt, V-GM-43 (roter CI-Lauf durch eine Zeitprüfung in `verify:pv-cube`) behoben — beides auf `origin/main` (`5fb86b4f`), CI grün. Offen bei Jan: V-GM-44 (Aktionen der CI auf Node 24).
- V-GM-32 ist mit GM-3d gebaut (§3g), Schalter aus; E-GM-19 (Einschalten von `run-hour`) und V-GM-45 … V-GM-47: §3g.7. GM-3d ist gepusht (`b7a0e859`) und eingeschaltet (E-GM-19, §3g.8); der erste Lauf (`2026112323`) und der zweite (`2026112405`, nachgerechnet) sind gelesen (§3g.8); die nachgezogene Workflow-Vorlage ist mit `019ab63c` committet; offen dazu: ein Lauf im 3-Stunden-Abstand kam noch nicht vor.
- V-GM-4 (Speicherbedarf des Zustandsarchivs): der Zustand wiegt 1,8 MB roh je Lauf (§3f.5); ein Archiv gibt es noch nicht (GM-6).
- V-GM-7 (Schichtdauer 6 h): im Zustand hält fast jede Höhe zwölf frische Schichten; kürzere Schichten würden ihn entsprechend vergrößern (V-GM-37).
- GM-5a (§3i): E-GM-30 … E-GM-35 entschieden (Jan 24.11.) und gebaut (von Jan committet und gepusht am 24.11. 16:35 UTC (`b448d652`)); **E-GM-36 entschieden (Jan 24.11. abends: an, K = 100) und auf dem Runner eingeschaltet am 24.11. 21:29 UTC (Daten-Repo `2d208df2`, §3i.4d)**; offen V-GM-70 … V-GM-84, V-GM-92, V-GM-93 — darunter V-GM-81 (der Schmelzlauf hält vorübergehend 1,5 GB) als Befund am Betrieb.
- GM-5b (§3j): E-GM-9, E-GM-10, E-GM-11, E-GM-31 entschieden (Jan 24.11.), Runde gerechnet, Tabelle und Verdrahtung gebaut (Schalter aus; von Jan committet und gepusht am 24.11. 16:35 UTC (`b448d652`)); **E-GM-37 entschieden (Jan 24.11. abends: (A), Quellenangabe GLAMOS und WGMS im Tabellenkopf und in `audit/gletscher/licences.md`, auf `origin/main` `942ef226`)**; die GLAMOS-Lizenz am 24.11. abends nachgelesen und **nicht aufgelöst** (Richtlinie und DOI-Index: CC BY 4.0; Kopfzeile der CSV-Dateien des Release 2025 und Impressum: „non-commercial“) — offen die Mail an GLAMOS (Jan, MANUELLE-SCHRITTE §123 Punkt 8), **E-GM-38** (Einschalten, mit diesem offenen Punkt), V-GM-85 … V-GM-91, V-GM-94, V-GM-102.
- GM-4 (§3h): Diagnose, E-GM-20 … E-GM-23 entschieden und als GM-4a gebaut (Schalter aus, auf `origin/main` seit 24.11. `019ab63c`); offen die Archiv-Vorlage, E-GM-24 (Einschalten) und V-GM-48 … V-GM-59; GM-4b (Kopplung) wartet auf die Messung mit Schattenläufen.
- GM-4a auf dem Runner: Schattenpaare an seit dem Lauf `2026112417` (24.11. 17 UTC), Beleg §3h.17 (468 Paare, 465 mit Stationswert, Vertrag ohne Befund, aus den eigenen Eingängen nachgerechnet gleich); V-GM-96 behoben (Variable `GLACIER_PRODUCER_REF = main` gesetzt 24.11. 19:47 UTC; belegt am Archivlauf 25.11. 00:55 UTC: `pairs-2026112417` und `pairs-2026112423` liegen in `buscosun-archiv`, Byte für Byte wie im Daten-Repo, §3k.7 Nachtrag); offen `GLACIER_SAT_NUDGE`.
- GM-5c (§3k): V-GM-79 gebaut und geprüft (die Paare tragen in einem Lauf mit Spanne die Vorhersage in Stationshöhe; kein neuer Schalter, auf `origin/main` `32b400df` seit 24.11. 21:24 UTC): voller Lauf 33 von 33 mit ausgeschalteter Spanne, Negativkontrolle, Gegenprobe 58 von 58; E-GM-39 entschieden (wie gebaut); erster Lauf mit Spanne `2026112423` gelesen (§3k.7: 279 Paare mit Spanne, Verträge ohne Befund, Spannen 86 s); offen V-GM-99, V-GM-109 (Erwartungswert an 95 von 40 194 Zeilenwerten über p90).
- GM-9 (§3m, V-GM-50): **geschlossen 24.11. nachts** — gemessen, die Regel trägt nicht (F1 +3,6 % gegen eine gleich geschätzte Konstante, −0,2 % gegen 96), nichts gebaut; E-GM-41 entschieden (kein `tw`, kein GM-9b jetzt, keine Nachrechnung 82 gegen 96; §3m.8); offen V-GM-105 (Zugspitze ohne Schneehöhe), V-GM-107 (Paare ab 25.11. 17 UTC), V-GM-108 (GM-9b auf Jans Wort).
- V-GM-81 (§3l): Speicherzeile `lines.melt.mem` gebaut und geprüft (ohne Schalter, auf `origin/main` `32b400df` seit 24.11. 21:24 UTC; lokal 3 217 / 2 830 / 4 144 MB); E-GM-40 entschieden (wie gebaut); auf dem Runner 3 315 / 2 830 / 4 144 MB (§3l.5: dieselbe Grenze wie lokal); offen V-GM-101; die Ursache der 1,5 GB bleibt offen.
- V-GM-135 (§3p): **geschlossen 25.11. abends** — zerlegt: im Fenster 24.→25.11. bucht das Modell an den Schneefallstationen +8,8 cm frischen Schnee und verliert 7,6 cm durch Setzung einer älteren Decke, die doppelt so tief ist wie an der Station (139 gegen 85 cm) und noch 31,6 cm Neuschnee aus dem Startzustand vom 22./23.11. trägt; Folgebefunde V-GM-139 … V-GM-143 (§3p), weiter in GM-11 (§3q).
- **V-GM-136** (Vorschlag, Recherche 25.11., `quellen-wahrheit-2026-11-25.md` §1.3): die WGMS-Reihe „Venediger K.“ (10460) hängt am Katalog-Gletscher „Untersulzbach Kees“ (nächster Punkt, 0,69 km); ihr `parent_glacier_id` führt zum Obersulzbachkees. Behoben in GM-11 §3q.3.
- **V-GM-137** (Vorschlag, ebd. §2.3): GLAMOS Release 2026 der Massenbilanz liegt vor (Q17a, geprüft von Jan 25.11.); die Eichung nutzt Release 2025. Gemessen als ungesehener Winter in GM-11 §3q.4.
- **V-GM-138** (Vorschlag, ebd. §5): Q10 hat eine offene Antwort, die nicht der Lawinenwarndienst ist — DWD Zugspitze SHK_TAG (Q32), täglich, CC BY 4.0, mit dem Stationswechsel 05792 → 20278 am 01.02.2026.
