# Diagnose — Bodentrockenheit im Brandradar (Phase WT1)

> Auftrag (Jan, 2026-08-15): „einen Trockenheits-Layer inkludieren und diesen unter den
> Windlayer packen; wenn die Daten dafür noch nicht vorhanden sind, kannst du diese nutzen:
> `https://opendata.dwd.de/weather/`".
> Nach Rückfrage entschieden: **Bodentrockenheit aus ICON-D2 `smi`**, umschaltbar zwischen
> Oberboden und Wurzelzone (Muster Schnee-Layer). Gate **GWT1**.

> **Ehrlichkeit zur Reihenfolge:** Die *Messung* lief vollständig vor dem ersten Produktcode
> (drei Sonden, Belege in `audit/l0/waldbrand-boden-smi*.json`). Dieser Fließtext ist danach
> entstanden. Die Diagnose-First-Regel ist damit im Kern gewahrt — kein Code auf Vermutung —,
> aber nicht in der Form. Beim nächsten Mal zuerst schreiben.

## 1. Warum die Frage gestellt werden musste

„Trockenheit" gab es in dieser Ansicht bereits **dreimal**:

| Bestand | Was es ist | Zustand |
|---|---|---|
| `fireWeather` „Feuerwetter-Treiber" | Trockenheit der **Luft** (ICON-D2 `relhum_2m`) | gebaut, aktiv |
| Sub-Ansicht „Trockenheit" des EU-Index | **Drought Code** der FWI-Familie | gebaut, aktiv |
| `fireDrought` „Bodenfeuchte-Anomalie" | Copernicus **EDO** SMA | **blockiert** (doppelter CORS-Header) |

`CLAUDE.md` warnt namentlich vor genau der Verwechslung, die hier drohte („DC an Stelle der
Bodenfeuchte"). Ein vierter Layer ohne Nachfrage wäre entweder eine Dublette oder das falsche
Produkt geworden. Jans Antwort: der **Boden**, neu aus DWD — also die Größe, die als einzige
fehlt und die der blockierte EDO-Layer offen lässt.

## 2. Quellenwahl: `smi`, nicht `w_so`

`opendata.dwd.de/weather/nwp/icon-d2/grib/` führt beide:

* **`w_so`** — Wassergehalt in kg/m². Ohne Bodenart-Nachschlag wertlos: 20 kg/m² sind in Sand
  nahe der Sättigung und in Ton nahe dem Welkepunkt. Eine Karte daraus vergliche Unvergleichbares.
* **`smi`** — Soil Moisture Index, **bereits normiert**: 0 = Welkepunkt, 1 = Feldkapazität.
  Über Bodenarten hinweg vergleichbar, ohne dass wir eine Bodenkunde nachbauen.

`smi` liegt als `regular-lat-lon` vor (392 Dateien je Lauf), also im selben Gitterformat wie alle
bestehenden Layer. **Kein Eingriff an der Edge Function nötig**: `dwd-grib.ts` filtert nach
Pfad-Präfix (`weather/nwp/icon-d2/grib/`), nicht nach Variable — der Boden-Baum ist bereits
erlaubt. Damit fällt diese Phase **nicht** unter STOPP & FRAGEN.

## 3. Was die Messung ergab — und was ohne sie schiefgegangen wäre

Sonden: `scripts/l0/probe-waldbrand-boden{,2,3}.mjs`, Lauf **2026081515**, Belege unter
`audit/l0/`. Dekodiert wurde mit **unserem eigenen** GRIB2-Decoder, nicht mit eccodes — was hier
grün ist, ist das, was der Browser ausführt.

**Grundlage (Sonde 1):** Decoder liest den `soil-level`-Baum ohne Anpassung. Gitter 1215×746 —
**identisch** zu `relhum_2m`. Schritte 0…48, Ebenen 0/1/3/9/27/81/243/729. Zwischen +0 h und
+24 h ändern sich **67 %** der Zellen der 9-cm-Ebene: der Layer ist echt zeitabhängig, ein
Tagesregler bewegt wirklich etwas.

### Befund A — `smi` verlässt 0..1 in **beide** Richtungen

Gemessen: **−0,93 … +2,15**. Unter 0 heißt „trockener als der Welkepunkt", über 1 „nasser als
Feldkapazität". Beides ist physikalisch echt, kein Füllwert (Sonde 2 fand **keinen** Sentinel;
die scheinbare Massierung bei exakt 0 aus einem Zwischenstand war ein Artefakt meiner eigenen
`toFixed(4)`-Bucketierung — die dritte Sonde weist über echte Böden **0,0 %** Exakt-Null aus).

Die naheliegende Reaktion — den Rohwert auf 0..1 klemmen — hätte **genau die Aussage
abgeschnitten, für die der Layer da ist**. Geklemmt wird deshalb erst die *Anzeigeachse*
(`drynessFromSmi`), der physikalische Wert bleibt unangetastet. Ein Verifier hält das fest
(`(b) der Rohwert wird NICHT vorab auf 0..1 geklemmt`).

### Befund B — Wasserzellen tragen Werte

Die NaN-Maske der Datei deckt **nur** den Modellrand: 151 528 NaN-Zellen, davon **0 über Land**
(Gegenprobe gegen `fr_land`). Zusätzlich liegen aber **212 735** Zellen mit gültigem `smi` auf
`soiltyp = 9` (Wasser). Ohne eigene Maske hätten Nord- und Ostsee und jeder größere See eine
Trockenheitsfarbe bekommen.

Deshalb wird `soiltyp` (zeitinvariant, **ein** Abruf je Lauf) mitgeladen; gezeichnet wird nur auf
wasserführenden Böden (3…8). Eis (170 Zellen) und Fels (70) fallen mit heraus — dort ist SMI
nicht definiert.

### Befund C — die tiefen Ebenen sind nicht unabhängig

Werte-Prüfsummen der Ebenen bei Schritt 0:

| Ebene | Werte-Hash |
|---|---|
| 9 | `a0c783f6…` |
| 27 | `936ff5a6…` |
| 81 | `80011c68…` |
| 243 | `766bb606…` |
| 729 | `766bb606…` ← **gleich** |

243 und 729 tragen **dasselbe Feld** (verschiedene Dateien, gleiche Werte). Sie als getrennte
Auswahl anzubieten wäre eine Unterscheidung, die es in den Daten nicht gibt. Der
Wurzelzonen-Modus nimmt deshalb **81 cm**.

### Befund D — die Verteilung, die über die Rampe entscheidet

Über echte Böden (`soiltyp` 3…8, n = 541 887), Schritt 0:

| Ebene | p5 | p25 | p50 | p75 | p95 | Zellen < 0 |
|---|---|---|---|---|---|---|
| 0 cm | −0,62 | −0,30 | −0,19 | 0,00 | 0,50 | 403 934 |
| 3 cm | −0,10 | −0,03 | 0,00 | 0,15 | 0,56 | 264 226 |
| **9 cm** | **0,00** | **0,03** | **0,13** | **0,29** | **0,63** | **34 608** |
| 27 cm | 0,13 | 0,27 | 0,47 | 0,62 | 0,87 | 546 |
| **81 cm** | **0,62** | **0,77** | **0,85** | **0,97** | **1,19** | **650** |

Der Tiefengradient ist exakt der physikalisch erwartete: oben nahe am Welkepunkt, unten feucht.
**Das ist die Aussage des Layers** — und der Grund, warum zwei Modi mehr sind als eine Spielerei.

Daraus die Modiwahl: **9 cm** (Streu- und Grasnarbenzone, guter Kontrast) und **81 cm** (tiefste
Ebene, die sich noch vom Rest unterscheidet).

## 4. Die Skala: physikalisch verankert statt tageskalibriert

Verlockend war, die Rampe an der gemessenen Verteilung auszurichten (p5…p95 des Messtags) — das
sähe kontrastreicher aus. Bewusst **nicht** gemacht: 0 und 1 sind definierte Punkte (Welkepunkt,
Feldkapazität) und gelten im Februar wie im August. Eine an einem Augusttag ausgerichtete Skala
wäre im Winter eine Lüge — dieselbe Falle, in die der Rotations-Layer F5 fast gelaufen wäre.

Fünf benannte Klassen, deren Grenzen in Legende **und** Farbe aus derselben Konstante kommen
(`SOIL_DRYNESS_CLASSES`): gesättigt ≥ 1,0 · feucht 0,7–1,0 · mittel 0,4–0,7 · trocken 0,2–0,4 ·
sehr trocken 0,0–0,2. Erdtöne, nicht die Sandtöne des Luft-Treibers: zwei Trockenheiten
übereinander müssen unterscheidbar bleiben (Verifier `(c)`).

## 5. Zeitmodell

`mode: 'forecast', maxDay: 1` — anders als der Wind (`instant`) ist das ein echter
Vorhersage-Layer (67 % Zelländerung in 24 h). **1 und nicht 2**, obwohl `smi` bis +48 h vorliegt:
Der Regler zielt auf den **Mittag** des gewählten Tages; aus einem 00z-Lauf liegt der Mittag von
Tag 2 bei +60 h, also jenseits des Horizonts. Ein Horizont, der je nach Lauf mal gilt und mal
nicht, ist keiner. Identisch zum Luft-Treiber — beide zusammen behalten denselben Regler.

**Folge, die benannt gehört:** Wer den Boden zuschaltet, klemmt den gemeinsamen Regler von 9 auf
1 Tag. Das ist das etablierte, ehrliche Verhalten (`fireWeather` tut es seit WB2 genauso), aber
es ist eine spürbare Änderung für den, der vorher den EU-Index über neun Tage gezogen hat.

## 6. Einordnung in die Karte

* **Dock:** direkt unter dem Wind, Gruppe „Aus der Wetterkarte" (Jans Auftrag).
* **Z-Band 55:** als *Fläche* tief einsortiert — über dem Luft-Treiber (50), unter den
  CH-Verbotsflächen (60) und weit unter den Windpartikeln (75). Dock-Reihenfolge und Z-Ordnung
  sind zwei verschiedene Dinge; „unter den Wind" gilt in beiden, aber aus verschiedenen Gründen.
* **Unter der DACH-Maske** — außerhalb DE/AT/CH abgedunkelt, wie der Luft-Treiber.
* **Lizenzträger** `fire-soil-attr` nach dem WW1-Muster (Custom-Layer haben keine Source und
  könnten ihre Attribution sonst nicht beitragen).

## 7. Was diese Phase NICHT anfasst

* `MapView.tsx`, `src/wind/*`, Edge Functions, Warm-Crons, Manifest-Mechanik — null Zeilen.
* Der blockierte `fireDrought` (EDO) bleibt blockiert und sichtbar. Er ist **nicht** dasselbe:
  EDO liefert eine **Anomalie** gegen eine Klimatologie, `smi` einen **Zustand**. Der neue Layer
  ersetzt ihn nicht, er füllt eine andere Lücke.
* Temperatur und Niederschlag im Brandradar — eigene Phasen.

## 8. Gate GWT1 — Bedingungen

1. `typecheck` + `build` grün; `verify:fire-boden` neu und grün, übrige fire-Verifier unverändert grün.
2. Layer links unter dem Wind ein-/ausschaltbar, Tiefe umschaltbar, Modus im Permalink.
3. Wasserflächen bleiben **leer** — kein trockenes Meer.
4. Die zwei Modi zeigen sichtbar Verschiedenes (Oberboden trocken, Wurzelzone feucht).
5. Attribution DWD sichtbar, nur solange der Layer an ist.
6. Konsole sauber.
