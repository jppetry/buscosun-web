# audit/brandflaeche-vorlaeufig.md — Diagnose VB0

> **Phase VB0** (Plan „Vorläufige Brandfläche", Gate **GVB1**). Diagnose, kein Produktcode.
> **Stand: 2026-08-19.** Alle Zahlen aus `scripts/fire/geometry-eval.mjs` — der Lauf ist
> **netzfrei** (Cache aus AF4) und reproduzierbar. Ausgaben:
> `data/fire/vb/geometry-eval.report.json` und `.pairs.jsonl` (618 Zeilen, je ein Paar).
>
> Auftrag Jan (2026-08-19): „eine Brandfläche von neuen Feuern, wenn EFFIS noch nicht da ist;
> sie wird später durch die EFFIS-Logik ersetzt". Jans drei Vorentscheidungen: Formregel
> **gemessen** statt angenommen · das Wort „vorläufige Brandfläche (geschätzt)" ist erlaubt ·
> Rollout default-off hinter `?vbArea=1`.

---

## 0. Ergebnis

**Keine der vier Kandidatenregeln schlägt das Detektionsraster.** Das vorab festgelegte
Abbruchkriterium greift: die geplanten Phasen VB1–VB3 werden **in der vorgesehenen Form nicht
gebaut**. Eine eigene Fläche zu zeichnen, deren Größe der AF4-Schätzung entspricht, macht die
Übereinstimmung mit der späteren Kartierung nicht besser, sondern **schlechter** — und erzeugt
in einem Viertel bis einem Drittel der Fälle eine Form, die die tatsächliche Brandfläche
**gar nicht mehr berührt**.

| Regel (Produktsicht) | IoU-Median | IoU = 0 | Fläche/EFFIS | Versatz |
|---|---|---|---|---|
| **R0 Detektionsraster** | **0,095** | **1,0 %** | 6,10 | 261 m |
| R1b Erosion auf die Schätzfläche | 0,092 | 3,9 % | 5,48 | 262 m |
| R2b FRP-gewichteter Kern | 0,088 | 5,0 % | 5,48 | 266 m |
| R3b Kreis am FRP-Schwerpunkt | 0,090 | 6,0 % | 5,48 | 262 m |

Und dort, wo die Regeln **ohne** Schutzregel greifen (also wirklich geschrumpft wird), ist der
Abstand deutlich:

| Regel (nur wo anwendbar) | IoU-Median | IoU = 0 | Fläche/EFFIS |
|---|---|---|---|
| R1 Erosion | 0,079 | **23,6 %** | 1,03 |
| R2 FRP-Kern | 0,064 | **29,9 %** | 1,03 |
| R3 Kreis | 0,062 | **35,8 %** | 1,03 |

Die Flächenzahl wird durch das Schrumpfen praktisch exakt richtig (1,03 statt 6,10) — **und
genau dabei geht die Überlappung verloren.** Das ist der ganze Befund in einer Zeile.

---

## 1. Aufbau der Messung

**Datenlage.** Der AF4-Cache liegt vollständig lokal (`.cache/firms-archive/`): EFFIS-Kartierungen
2020–2025 als Jahreslayer, 2026 als Saison-Korb, dazu 619 VIIRS-SP-CSV-Dateien. Kein Netzabruf,
kein FIRMS-Schlüssel, keine Belastung fremder Server.

**Paarbildung identisch zu AF4** — Zeitfenster (`FIREDATE − 3 d` … `FINALDATE + 7 d`), Ortsfenster
(Bbox + 3 km), `type ≠ 0`-Filter und dieselbe Modulkette (`parseFirmsCsv` → `dedupe` →
`buildFireClusters` → `buildFireZones` → `reconcileZones` → `buildFireRegistry` → `featuresOf`).
Ausgewertet wird nur der Registry-Eintrag, den der Client aus denselben Detektionen bauen würde.

**Der Fidelitätsnachweis** steht nicht als Behauptung da, sondern als Zahl: die Paarzahl je Jahr
reproduziert die AF4-Berichte **exakt**.

| Jahr | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 | Σ |
|---|---|---|---|---|---|---|---|---|
| Paare VB0 | 34 | 45 | 174 | 59 | 57 | 162 | 87 | **618** |
| Paare AF4 | 34 | 45 | 174 | 59 | 57 | 162 | 87 | 618 |

Damit ist ausgeschlossen, dass hier auf Paaren gemessen wird, die im Betrieb nie entstehen — die
Lehre aus AF4 (`audit/aktivfeuer.md` §15).

**Vergleich ohne Polygon-Arithmetik.** Beide Formen werden auf **dasselbe** metrische Gitter
gerastert (lokale äquidistante Projektion, die Konstanten aus `fireZones.ts`); Zellgröße aus der
Bbox-Fläche, Untergrenze 5 m, Deckel 120 000 Zellen je Paar. Daraus IoU, Flächenverhältnis und
Schwerpunktversatz. Keine neue Dependency, kein Boolean-Operator, keine Näherung mit freiem
Parameter.

**Die vier Regeln** (alle deterministisch; das Schrumpfmaß wird *gelöst*, nicht gewählt):

| | Form |
|---|---|
| **R0** | Vereinigung der Pixelrechtecke — das heutige Detektionsraster, die Nullhypothese |
| **R1** | R0 von außen erodiert (Chamfer-Distanz zum Rand), bis die Fläche der AF4-Schätzung entspricht |
| **R2** | Zellen nach FRP-Dichte absteigend, bis die Schätzfläche erreicht ist (Gleichstand über den Randabstand gelöst) |
| **R3** | Kreis am FRP-gewichteten Schwerpunkt mit der Schätzfläche |
| **+ R0b** | Schutzregel für R1–R3: Zielfläche < mittlere Einzelpixelfläche ⇒ **nicht schrumpfen** |

Gemessen wurde jede Regel zweimal: **nur wo anwendbar** (die Güte der Regel) und in der
**Produktsicht** (mit R0b und mit Rückfall auf R0) — nur letztere ist das, was Nutzer sähen.

---

## 2. Selbstprüfung der Messung

Ein negatives Ergebnis muss gegen den Verdacht bestehen, das Messwerkzeug sei kaputt. Zwei
unabhängige Gegenproben:

| Prüfung | Erwartung | Gemessen |
|---|---|---|
| Gerasterte EFFIS-Fläche ÷ amtliche `AREA_HA` | ≈ 1 | **0,992** (p10 0,876 · p90 1,072) |
| Gerastertes Detektionsraster ÷ Zonenfläche der Registry | = 1 | **1,000** |
| Zellgröße | fein genug | Median **5,0 m**, Maximum 35,7 m |

Die Rasterung gibt die amtliche Hektarzahl auf 1 % genau wieder und die projekteigene Zonenfläche
exakt. Der Befund ist keine Artefaktfrage.

---

## 3. Die Zahlen nach Größenklasse

| Klasse | n | R0 IoU | R1 IoU (roh) | R1b IoU | R0 IoU=0 | R1 IoU=0 | Raster/EFFIS | Versatz |
|---|---|---|---|---|---|---|---|---|
| 0–2 ha | 82 | 0,017 | 0,007 | 0,017 | 1,2 % | **43,9 %** | 42,5 | 208 m |
| 2–20 ha | 332 | 0,071 | **0,077** | 0,075 | 1,5 % | **29,2 %** | 8,8 | 234 m |
| 20–200 ha | 178 | **0,235** | 0,102 | 0,224 | 0 % | 7,3 % | 2,4 | 297 m |
| > 200 ha | 26 | **0,404** | 0,149 | 0,227 | 0 % | 0 % | 1,02 | 515 m |

Nur **eine** Zelle dieser Tabelle spricht für das Schrumpfen: bei 2–20 ha steigt der IoU-Median
von 0,071 auf 0,077 (+8 %). Erkauft wird das damit, dass der Anteil der Fälle, in denen die
gezeichnete Form die kartierte Fläche **überhaupt nicht mehr trifft**, von 1,5 % auf 29,2 %
steigt — das Zwanzigfache. Für einen Gewinn von 0,006 IoU ist das kein Handel, den man einem
Nutzer anbieten kann.

Bei den großen Bränden, wo eine Fläche am meisten zählt, ist der Befund am deutlichsten: das
Raster ist dort ohnehin schon **flächenrichtig** (1,02) und trifft mit IoU 0,404; jede
Schrumpfung halbiert das.

---

## 4. Warum es scheitert — drei Befunde

**(a) 85,4 % aller Fälle sind Sub-Pixel.** Bei 528 von 618 Paaren ist die geschätzte Brandfläche
**kleiner als ein einziges VIIRS-Pixel** (13,7–59,3 ha je Pixel; Median der Detektionen je Brand:
2 in der Klasse 0–2 ha, 3 bei 2–20 ha). Eine Form in dieser Größe innerhalb eines Pixels zu
zeichnen, behauptet eine Ortsauflösung, die die Messung nicht hat — und die Messung bestätigt es:
genau dort steigt der Totalausfall (IoU = 0) auf 44 %.

**(b) Der Schwerpunktversatz beträgt rund ein Pixel.** Zwischen Detektionsraster und kartierter
Fläche liegen im Median **208–515 m** (gesamt 261 m). VIIRS sieht die **Flammenfront zum
Überflugzeitpunkt**, das Rapid Damage Assessment kartiert die **Brandnarbe danach** — dazu kommt
die Geolokationsunsicherheit von ±375 m. Keine Regel, die nur aus den Detektionen rechnet, kann
einen systematischen Lageversatz dieser Größe beheben; schrumpfen macht ihn im Gegenteil
sichtbarer, weil die kleinere Form ihn nicht mehr überdeckt.

**(c) Der Punktwert der AF4-Schätzung regressiert zur Mitte.** In-sample gegen dieselben Paare:

| Klasse | 0–2 ha | 2–20 ha | 20–200 ha | > 200 ha |
|---|---|---|---|---|
| Schätzung ÷ echte Fläche (Median) | **7,45** | 1,46 | 0,29 | **0,17** |

Das ist kein Fehler des Modells, sondern die erwartete Wirkung eines log-log-Fits mit σ = 1,33:
der bedingte Erwartungswert zieht die Extreme zur Mitte. Für die **Zeile** ist das unschädlich,
weil sie nie ohne Intervall steht (80 %, LOO-Abdeckung 78,8 %). Für eine **Fläche** wäre es
fatal: man zeichnete bei kleinen Bränden das Siebenfache und bei großen ein Sechstel — als Form,
die Genauigkeit suggeriert.

---

## 5. Was daraus für die Bauphasen folgt

| Plan-Phase | Status nach VB0 |
|---|---|
| **VB1** Geometriemodul `provisional.ts` | **gestoppt** — es gibt keine Formregel, die das Raster schlägt. Die Extraktion von `unionRects` aus `fireZones.ts` entfällt damit ebenfalls; sie war nur für diese Geometrie nötig. |
| **VB2** Registry-Anbindung (`geometry.kind: 'estimate'`) | **gestoppt** — ohne eigene Form gibt es keine vierte Geometrie-Art. Die Rangfolge bleibt `effis > raster > hull > point`. |
| **VB3** Darstellung und Ehrlichkeit | **umgesetzt in reduziertem Umfang** (Jans Entscheidung 2026-08-19) — §6. Kein neues Flag nötig, weil keine neue Geometrie entsteht. |
| **VB4** Güte sichtbar machen | unverändert offen |

**Was Jans Auftrag trotzdem erfüllt — ohne eine Form zu erfinden.** Das Ziel war: „eine
Brandfläche für neue Feuer, die später durch EFFIS ersetzt wird." Der Ersetzungsmechanismus
existiert bereits (`reconcile.ts` + Rangfolge in der Registry, Kennung stabil über `carryIds`).
Was fehlt, ist nicht die Geometrie — die liegt mit dem Detektionsraster vor und ist, wie
gemessen, die **beste verfügbare** —, sondern **die Sprache und die Zahl an dieser Geometrie**:

1. **Die vorhandene Form benennen.** Der Eintrag ohne Kartierung trägt heute „bis 59 ha —
   vom Satelliten abgedeckt, Obergrenze, keine Brandfläche". Er könnte tragen: „**vorläufige
   Brandfläche (geschätzt): ≈ 8,9 ha (1,6–49 ha) — der Brand liegt in der gezeichneten Fläche,
   seine genaue Lage darin ist unbekannt**". Das ist nach Jans Entscheidung 2 zulässig, sagt die
   Wahrheit (Einschluss ja, Lage nein) und behauptet keine Kontur.
2. **Das Karten-Popup trägt die Schätzung.** Heute steht sie nur in der Detailkarte des Panels;
   der Klick-Steckbrief auf der Karte nennt sie nicht — derselbe Brand hat dort zwei
   verschiedene Auskünfte. Das ist ein echter Widerspruch im Bestand, unabhängig von dieser Phase.

Beides ist reine Text- und Zusammenführungsarbeit an bestehenden Bausteinen: keine neue
Geometrie, kein neues Flag, kein neuer Layer, kein Perf-Risiko.

---

## 6. Gate GVB1 — was gebaut wurde

Kein neues Modul, kein Flag, kein Layer, keine neue Geometrie: **eine** Textquelle, drei Orte.

| Baustein | Datei |
|---|---|
| `provisionalAreaText(est, coverageHa)` + `provisionalArea(record)` — die Aussage in einem Stück, mit der Messbegründung im Kopfkommentar | `src/fire/footprint/fireRegistry.ts` |
| `estimateValueText` / `estimateSourceText` — der Zahlenwert getrennt von der Herkunft; `estimateLabel` setzt sich seither aus beiden zusammen, damit zwei Orte nie zwei Formatierungen zeigen | `src/fire/activity/estimate.ts` |
| Detailkarte: „Fläche" und „Schätzung" sind für Einträge **ohne** Kartierung EINE Zeile; mit Kartierung bleibt beides wie bisher | `src/fire/FireFootprintPanel.tsx` |
| Beide Karten-Steckbriefe (Detektionspunkt **und** Detektionsraster) tragen dieselbe Aussage; sie steht vor dem Rasterblock, weil das Raster die Auflösung ist und nicht die Antwort | `src/fire/FireMap.tsx` |
| `zoneEstimates` (Zone → Schätzung) als Prop; das 2,5-KB-Modell lädt jetzt auch, wenn nur die Karte offen ist (vorher nur mit dem Panel-Reiter) | `src/fire/FirePage.tsx` |
| `.fire-pop-prov` — durchgezogener Rand statt gestrichelt, damit sich Schätzkasten und Rasterkasten unterscheiden | `src/fire/fireDeck.css` |

**Belege (2026-08-19, Dev-Server, Desktop 1440×900):**

- `npm run typecheck` grün · `verify:fire-registry` **81/81** · `verify:fire-activity` **171/171** ·
  `verify:fire-footprint` 73/73 · `verify:fire-zones` 52/52 · `verify:fire-corroboration` 82/82
- **Messfallstrick, teuer bezahlt:** Der Perf-Deckel der Registry (`3 000 Detektionen + 300 Flächen
  < 150 ms`, bester von 3 Läufen) schlug während der Arbeit wiederholt fehl — 151, 158, 168, 181,
  193, 244 ms — und sah nach einer vorbestehenden Regression aus. Er war keine: Bei geschlossenem
  Browser-Tab misst derselbe Lauf **85–92 ms**. Die App im Vordergrund (FIRMS-Abrufe, MapLibre,
  React-Dev) verdreifacht die Zahl. **Perf-Anker gehören auf eine unbelastete Maschine gemessen**,
  sonst schreibt man der eigenen Phase Bestand zu — dieselbe Lehre wie V-WF-13, hier andersherum.
- Panel, Eintrag „bei Buch (4,9 km) · Landkreis Neu-Ulm":
  `Fläche: Vorläufige Brandfläche (geschätzt): ≈ 8,9 ha (1,6–49 ha, 80 %) — Der Brand liegt in der
  gezeichneten Fläche (59 ha Satellitenabdeckung); seine genaue Lage darin ist unbekannt. Kein
  Ersatz für eine Kartierung. Modell v1, EFFIS-kalibriert (604 Paare 2020–2026), aus der Zahl der
  Detektionen` — die frühere Doppelzeile „bis 59 ha" + „Schätzung" ist verschwunden.
- Karten-Steckbrief desselben Brands (Punkt **und** Raster): **wortgleich**.
  Screenshot `scratchpad/vb3-popup-buch.png`.
- **Funktionserhalt** an einem kartierten Eintrag geprüft (Calasca-Castiglione, 208 ha):
  `Fläche: 208 ha kartiert — von EFFIS gemessen` und darunter unverändert
  `Schätzung: … · zum Vergleich kartiert: 208 ha (die Kartierung gilt)`.
- Konsole ohne neue Meldungen; die 16 verbleibenden 404 stammen aus dem GeoSphere-Warn-Kontext
  (`warnungen.zamg.at`) und bestehen unabhängig von dieser Phase (s. V-VB-5).

---

## 7. Nebenbefunde (V-Kandidaten)

- **V-VB-1** — Der Klick-Steckbrief auf der Karte (`zonePopupHtml`) kennt die AF4-Schätzung nicht;
  Panel und Karte sagen für denselben Brand Unterschiedliches. Mehrwert: eine Auskunft statt zwei.
- **V-VB-2** — Der Punktwert der Flächenschätzung regressiert an den Rändern stark zur Mitte
  (7,45× bei 0–2 ha, 0,17× bei > 200 ha). Kandidat für Modell v2: Schätzung im log-Raum
  entzerren oder die Klassengrenzen im Text nennen. **Kein** Anlass, die Zeile zu entfernen —
  das Intervall trägt.
- **V-VB-3** — Der systematische Versatz Raster ↔ Kartierung (Median 261 m, bei > 200 ha 515 m)
  ist eine messbare, bisher nirgends genannte Eigenschaft. Kandidat für den Layer-Text: „der
  Punkt ist die Pixelmitte zum Überflugzeitpunkt, nicht der Schwerpunkt der Brandnarbe".
- **V-VB-5** — `inAustriaBox` ist ein Rechteck (`geosphereWarnContext.ts:51`), das Südbayern
  einschließt. Der Brand bei Buch (48,18 N / 10,17 E, Landkreis Neu-Ulm) bekommt deshalb den
  AT-Kontext und die Links „Einsatzübersicht Oberösterreich · Burgenland" — und löst 404-Abfragen
  gegen `warnungen.zamg.at` aus. Vorbestehend, unabhängig von VB. Mehrwert: keine österreichischen
  Einsatzlinks an einem bayerischen Brand; Umsetzung: dieselbe Punkt-in-Polygon-Prüfung wie bei
  `country` verwenden statt der Box.
- **V-VB-4** — `scripts/fire/geometry-eval.mjs` dupliziert `dropNonFireTypes` aus
  `pairs-from-archive.mjs` (dort nicht exportierbar, weil das Skript beim Import `main()` startet).
  Die Paarzahl-Gegenprobe deckt eine Abweichung auf, aber sauberer wäre ein gemeinsames Modul
  unter `scripts/lib/`.

---

## Belege

- Skript: `scripts/fire/geometry-eval.mjs` (netzfrei, reproduzierbar; Optionen `--years`,
  `--limit`, `--cap`, `--min-cell`)
- Ergebnisse: `data/fire/vb/geometry-eval.report.json` · `data/fire/vb/geometry-eval.pairs.jsonl`
- Eingangsdaten: `.cache/firms-archive/` (EFFIS 2020–2026, 619 VIIRS-SP-CSV) — gitignored
- Modell: `public/fire/af/area-estimate-v1.json` (v1, 604 zulässige Paare)
- Gegenproben: gerasterte EFFIS-Fläche ÷ `AREA_HA` = 0,992 · gerastertes Raster ÷ Zonenfläche = 1,000
