# GM-5 — Verteilung aus Sentinel-2, Szenarien und Spannen: Diagnose (23./24.11.2026)

> Nur Diagnose. Keine bestehende Datei geändert, kein Code unter `scripts/` oder `src/`, kein Eingriff in Daten- oder Archiv-Repo. Der Text wandert als eigener Abschnitt ins Haupt-Audit, wenn GM-4 abgeschlossen ist.
> Code-Stand jeder Messung: **`dc982141`** (`git archive` nach `C:\dev\buscosun-glacier-cache\gm5\code`, `node_modules` als Verweis). Daten: Kopie des Daten-Repos von GM-4 (`gm4\live`, Commit `c0f4686f`, 23.11. 21:25 UTC, nur gelesen), Katalog/Hypsometrie Build `20261120-1`, Wahrheit `gm3\truth\gy.json` (GLAMOS/WGMS je 100-m-Stufe, wie GM-3), Cube und Ansicht vom 21.11. (`gs\`).
> Messregel: `gm5-method-frozen.md`, eingefroren 23.11. 22:37 UTC vor dem ersten gewerteten Lauf, sha256 **`a9964eb9bdac7cbff0689f67c0d5606e5e37e617e48eb239ee69160bc6e5b98b`** (`gm5-method-frozen.sha256`). Jedes Werkzeug prüft den Hash, bevor es rechnet. Urteile rechnen die Skripte.

## Ergebnis zuerst

- **Verteilung aus Sentinel-2: die Daten tragen sie nicht.** Die Saisonzeilen haben kein Feld je Band — nur EINE Schneegrenze je Szene (Klasse A). Daraus folgt eine Reihenfolge des Ausaperns, die genau die Höhenfolge ist (205 von 205 Saisons, kein gegenläufiges Bandpaar). Der Rest der Form ist zwischen den Jahren nur schwach stabil (ρ 0,28 gegen 0,00 bei fremden Gletschern) und verbessert die Winterbilanz je Stufe nicht: **−0,2 %** gegen „linear zwischen drei Höhen“ an 300 Gletscherwintern (Urteil des Skripts: „trägt nicht“). Eine beständige Verteilung je Stufe GIBT es aber — die Stufenwerte selbst sagen sie aus anderen Wintern mit **21 % weniger Formfehler** voraus; die Satellitenzeilen sehen sie nur nicht.
- **Spannen:** Die Schneedecke hat heute keine. Der Wetterteil hat 100 Szenarien (Niederschlag aus der Verteilung von buscosun Fusion, Temperatur), aber nur für die 957 Gletscher mit eigenen Antworten. Der **Faktor** ist die größte, systematische Unsicherheit (×0,73 … ×1,37); die **Dichte** ist überwiegend zufällig je Ereignis, nicht systematisch. In der zweiten Woche zeigt eine Spanne an 97 % der Tage „kein Schneefall“ als unteres Ende, wo der Erwartungswert heute an 99,98 % der Tage Neuschnee meldet (V-GM-41).
- **Nicht gemessen:** Kosten der Szenarien (K = 10/20/40) — die Messung wurde vom System wegen knappen Arbeitsspeichers gestoppt, nicht neu gestartet. Größe gemessen: +140 % roh, +31 % gepackt.

## A — Verteilung über den Gletscher

### A1 Was die Saisonzeilen tragen — Werkzeug `gm5-inventory.mjs` → `gm5-inventory.json`

Eine Saisonzeile ist `[Datum, Klaranteil, Schneeanteil, Zustand, Schneegrenze|null, AAR|null, Albedo Schnee, Albedo Eis, Marken]` (`glacierSatContract.ts`). **Es gibt kein Feld je Höhenband.** Je Szene und Gletscher stehen EIN Schneeanteil und — nur in Klasse A (≥ 0,5 km²) im Zustand „Schneegrenze“ — EINE Schneegrenze (Höhe, ab der die Schnee-Pixel oberhalb und die übrigen unterhalb am besten getrennt sind, `satcore.mjs` `snowLine`). Klasse B trägt nur den Anteil; der Schmelzlauf macht daraus eine Grenze über die Hypsometrie (`impliedSnowline`), also wieder reine Höhe.

| Jahr | Gletscher mit Zeilen | Land | Klasse A / B / C | Zeilen | davon mit Schneegrenze | Marke `neuschnee` |
|---|---|---|---|---|---|---|
| 2023 | 26 | nur CH | 20 / 6 / – | 198 | 167 | 2 |
| 2024 | 26 | nur CH | 20 / 6 / – | 157 | 114 | 37 |
| 2025 | 236 | AT 71, CH 165 | 204 / 32 / – | 2 316 | 2 076 | 344 |
| 2026 | 917 | AT 311, CH 606 | 204 / 643 / 70 | 10 978 | 3 641 | 1 143 |

- 921 Gletscher haben überhaupt eine Zeile. 2023 und 2024 sind ein Nachlauf nur für die 26 Schweizer GLAMOS-Gletscher.
- Klasse A mit Zeilen: 207 Gletscher, davon 20 mit vier Jahren, 181 mit zwei, 6 mit einem. Klasse B hat fast nur 2026 (Schweiz 374 von 400 mit einem Jahr).
- Szenen mit Schneegrenze je Gletscher und Sommer (Juni–September, Klasse A, Median): 2023 CH 7, 2024 CH 5, 2025 CH 8 / AT 4, 2026 CH 12 / AT 7. Größte Lücke zwischen zwei klaren Szenen im Median 10–18 Tage, p90 bis 25 Tage (Wolken).

### A2 Lässt sich eine Reihenfolge des Ausaperns je Band ableiten, und ist sie stabil? — Werkzeug `gm5-distribution.mjs` → `gm5-distribution.json`, Nachtrag `gm5-order-explore.mjs` → `gm5-order-explore.json`

Regel (A.1–A.4): Tag des Ausaperns je 50-m-Band = erster Tag, an dem die Schneegrenze über dem Band liegt und in der nächsten Szene dort bleibt; Muster einer Saison = Rest gegen eine Gerade in der Höhe.

| | Wert |
|---|---|
| Saisons mit Zeilen | 1 205 |
| mit mindestens 4 brauchbaren Zeilen (1.5.–30.9., ohne Neuschnee-Marke, mit Grenze) | 548 |
| mit einem Muster (≥ 3 Bänder mit Tag, ≥ 150 m Spanne) | **205** (2023: 16, 2024: **0**, 2025: 63, 2026: 126; CH 147, AT 58) |
| Gletscher mit Muster / mit zwei Mustern | **154 / 35** |
| Saisons, in denen der Tag des Ausaperns mit der Höhe nie fällt | **205 von 205** |

**Die Reihenfolge des Ausaperns IST die Höhenfolge — aus einer Schneegrenze je Szene folgt das zwingend** (wer über einer Höhe liegt, liegt über jeder tieferen). Das eingefrorene Urteil „Reihenfolge trägt mehr als die Höhe“ (Spearman zwischen zwei Saisons im Median 0,91 statt ≥ 0,99) ist ein Fehler meiner Regel: zwischen zwei Szenen apern mehrere Bänder am selben Tag aus, Bindungen drücken Spearman. Nachtrag, nach dem gewerteten Lauf und als explorativ gekennzeichnet: über 61 Saisonpaare und 3 266 Bandpaare ist **kein einziges Paar gegenläufig**, 42 % sind gebunden (je Saison im Median nur ein Drittel verschiedene Tage). Die Reihenfolge trägt also keine Information jenseits der Höhe.

Was übrig bleibt, ist die **Form** von D(z) (wo die Grenze schneller oder langsamer steigt). Ihr Rest gegen die Gerade, auf zehn Punkten der normierten Höhe:

| | Paare | Spearman-ρ Median (p10 … p90) |
|---|---|---|
| derselbe Gletscher, zwei Jahre | 35 | **0,28** (−0,23 … 0,79) |
| verschiedene Gletscher, dieselben Jahre (Kontrolle) | 755 | 0,00 |
| je Jahrespaar gleich / fremd | 2023–25: 6 / 72 · 2023–26: 6 / 83 · 2025–26: 23 / 600 | 0,10 / −0,20 · 0,20 / 0,00 · 0,30 / 0,00 |

**Urteil (Skript): „schwach“** (ρ_gleich − ρ_fremd = 0,28 ≥ 0,1, aber ρ_gleich < 0,5). Mit 2024 ohne ein einziges Muster gibt es nur drei Jahrespaare, für 2023/24 keines.

Was die Zeilen tragen müssten: eine Schneebedeckung **je Höhenband und Szene** (z. B. Schneeanteil der klaren Pixel je 50-m-Band). Der Satelliten-Scanner hat die Pixelkarte (`snowMap`) und die Höhe je Pixel schon in der Hand; ein Feld je Band wäre eine Änderung der Satellitenlinie (Vertrag `glacierSatContract.ts`, Szenendokument und Saisonzeile, Nachlauf der Jahre) — eine andere Linie und Jans Entscheidung (E-GM-30). Damit wären auch Muster sichtbar, die NICHT der Höhe folgen (Lawinenkegel an der Zunge, ausgeblasene Rücken). Dieser Zweig endet hier für die vorhandenen Zeilen.

### A3 Trifft eine so abgeleitete Verteilung die Wahrheit je Höhenstufe? — Werkzeug `gm5-distribution.mjs`

Gemessen, obwohl A2 schon wenig erwarten ließ, weil die Form von D(z) (nicht die Reihenfolge) noch Information tragen könnte. Regel A.5: Form der Winterbilanz d = bw/bw̄ − 1 je 100-m-Stufe; **V0** „linear zwischen drei Höhen“ mit den Stützen der Wahrheit selbst (Zunge, Medianhöhe, Oberkante — gemessen wird also nur, was ZWISCHEN den drei Höhen liegt); **V1** V0 + k · Satellitenmuster (mittelwertfrei: das Mittel des Gletschers bleibt), Muster nur aus Saisons ≠ Winterjahr, k ohne den Gletscher geschätzt; **V2** Negativkontrolle mit dem Muster eines anderen Gletschers; **V3** Referenz: das beständige Muster der Wahrheit selbst aus den anderen Wintern desselben Gletschers.

Gewertet: **300 Gletscherwinter an 24 Gletschern** (2012–2025; CH 239 / 19, AT 61 / 5). Übersprungen: 132 Klasse B, 37 Klasse C, 18 ohne brauchbare Saison, 1 nur mit der Saison desselben Jahres.

| Variante | mittlerer Fehler der Form (mm w. e.) | Gewinn gegen V0 |
|---|---|---|
| C0 flach (keine Form) | 209 | — |
| C1 linear nur Zunge–Oberkante | 409 | — |
| **V0 linear zwischen drei Höhen** | **131,2** | 0 |
| **V1 + Satellitenmuster** | **131,4** | **−0,2 %** (p10 −0,6 %, p90 +0,2 %; 1 000 Ziehungen der Gletscher) |
| V2 Negativkontrolle (fremdes Muster) | 131,4 | −0,1 % |
| V3 beständiges Muster aus GLAMOS/WGMS selbst (270 Winter mit ≥ 3 anderen) | 103,6 gegen 130,8 | **+20,8 %** (CH +24,1 %, AT +6,1 %) |

k (gemeinsam) = 0,00086 je Tag: zehn Tage späteres Ausapern bedeuteten 0,9 % mehr Winterschnee in der Stufe; die Korrelation von Satellitenrest und Wahrheitsrest über alle Stufen ist 0,09. Nur 2023–2025: V1 −0,2 %, V3 +22,7 %.

**Urteil (Skript): „trägt nicht“** — Gewinn −0,2 % < 5 % und p10 des Gewinns ≤ 0. Die Negativkontrolle liegt gleichauf: das Satellitenmuster ist von einem fremden nicht zu unterscheiden.

Lesart:
- **Es gibt eine beständige Verteilung je Stufe** — die Wahrheit selbst sagt sie mit 21 % weniger Formfehler aus den anderen Wintern voraus (Wind, Lawinen, Relief; dasselbe Bild wie der Faktor je Gletscher in GM-3 N1-a). **Die Saisonzeilen sehen sie nicht**, weil eine Schneegrenze je Szene nur die Höhe kennt.
- Zum Einordnen der Höhen (explorativ, nach dem Lauf, `gm5-shape-explore.mjs` → `gm5-shape-explore.json`, 319 Gletscherwinter): die **oberste 100-m-Stufe** trägt im Median 0,35 % der Fläche und **13 % weniger Winterschnee als die Stufe darunter** (p10 −33 %); die unterste 6 % weniger als die darüber. Eine Gerade nur durch Zunge und Oberkante (C1) ist deshalb schlechter als gar keine Form. Der Wert „Oberkante“ des Schneedecken-Produkts steht für einen sehr kleinen, oft ausgeblasenen Teil des Gletschers (V-GM-72).
- Sondierungen (Q18) liegen lokal nicht vor und sind nicht gemessen; die Stufenwerte sind das Flächenmittel genau dieser Sondierungen.

### A4 Wo ein Zuschlag landen würde

- **Schmelzlauf (50-m-Bänder):** der Schmelzkern hat die Stelle schon — `simulate` rechnet den Zuwachs je Band als `pf · P · corr[b] · fs` mit `corr[b] = 1 + pGrad · (z − zP)/100` (mit `country` ist `pGrad = 0`, also `corr = 1`). Ein Zuschlag je Band wäre `corr[b]` = 1 + flächengewichtet mittelwertfreier Zuschlag. Nur dort ist „Umverteilen bei gleichem Mittel“ überhaupt definiert, weil nur dort die Fläche je Band bekannt ist.
- **Schneedecke (drei Höhen):** sie rechnet an drei Punkten ohne Flächengewicht; ein Zuschlag dort würde die drei Werte selbst verschieben, nicht umverteilen, und das Mittel des Gletschers ist im Produkt nicht definiert. Für das Schneedecken-Produkt gibt es keinen sinnvollen Ort, solange es nur drei Höhen führt.
- **Gletscher ohne Muster:** mit der heutigen Messung bekäme kein Gletscher einen Zuschlag. Würde einer gebaut (V3-Muster für die 44 Gletscher mit Stufenwerten, E-GM-31), gilt für die übrigen ≈ 2 050 eine benannte Regel „kein Zuschlag“ (`dist: 'none'` in der Zeile, im Kopf gezählt), nie ein stiller Rückfall.

## B — Szenarien und Spannen der Schneedecke

**Was gelaufen ist:** `gm5-scenarios.mjs` hat am 23.11. 23:47–23:54 UTC den Producer der Kopie `dc982141` einmal voll gerechnet (`--snowpack=shadow`, Cube und Ansicht vom 21.11., `--now=2026-11-21T17:50:00Z --always`, Startzustand `seed-1121`, Ausgabe nur unter `gm5\out-sp`, `gm5\patch-sp`) und dabei über einen Lade-Haken (`gm5-hook-*.mjs`, keine Datei der Kopie geändert) die Eingänge des Schneedecken-Schritts aufgezeichnet. **Die anschließende Szenario-Phase desselben Prozesses (K = 10 / 20 / 40, Referenz K = 100, Zerlegung) hat das System wegen knappen Arbeitsspeichers gestoppt** (Claude Code beendet Hintergrundbefehle bei Speichernot; 5,7 von 19,7 GB frei danach). Ich habe sie nicht neu gestartet. **Gemessen ist deshalb nur, was die geschriebenen Dokumente und die Berichte von GM-3 tragen** (`gm5-light.mjs` → `gm5-light.json`); §B.3–§B.5 der Messregel sind **nicht gemessen**. Der Haken hielt alle Eingänge aller 2 084 Gletscher im Speicher — für eine Wiederholung muss das Werkzeug je Gletscher rechnen und verwerfen (V-GM-77).

### B1 Was es gibt und was es streut (Code `dc982141` gelesen, Zahlen aus dem Lauf `2026112117`)

| Was | Wo | Was es streut | Für wen |
|---|---|---|---|
| 40 Szenarien des Schmelzindex | `melt.mjs` `runGlacier` → `meltcore.scenarioPaths` | **nur die Temperatur** (σ der Antwort, AR(1) ρ je Stunde gesetzt); Niederschlag und Schnee sind Erwartungswerte | alle Gletscher, je 50-m-Band |
| 100 Szenarien des Wetterteils (Phase GS) | `weathercore.sumSpreads`, `WEATHER_SPREAD_RULE` {k 100, ρ 0,9} | Niederschlag als Quantil der Verteilung der Antwort von buscosun Fusion (ein Pfad je Szenario, ρ 0,9) **und** Temperaturfehler (eigener Pfad) → Phase; Spanne der **Tagessummen** `pq` und Neuschnee je Höhe `snq` (mm Wasser) | **nur 957 Gletscher mit eigenen Antworten**; die 1 127 Nachbar-Gletscher tragen keine Spanne (`omit`) |
| Quantile je Stunde in der Antwort | `weatherSeriesOf`: `t10/t90`, `g10/g90`, Verteilung `precip.dist` | Einzelstunden — nie zu summieren | Wetterteil |
| Schneedecke | `snowpackcore.snowpackOfGlacier` | **nichts**: `rules.spread: 'none'`, jeder Wert ein Erwartungswert | 2 084 Gletscher × 3 Höhen |

Größe der vorhandenen Spanne (Wetterteil, Medianhöhe, Median über 957 Gletscher): Neuschnee-Wasser Tag 1 erwartet 5,1 mm, Spanne p10–p90 **13,1 mm**; Tag 7 0,9 / 1,0 mm; Tag 14 2,1 / 3,1 mm.

### B2 Welche Unsicherheiten in die Spanne gehören — Werkzeug `gm5-light.mjs` (σ aus den Berichten von GM-3)

| Quelle | Art | gemessen | Größe | Folge für die Regel |
|---|---|---|---|---|
| Niederschlag (Menge, Zeitpunkt) | zufällig je Lauf, in der Zeit korreliert | Verteilung der Antwort je Stunde | Tag 1 im Median 13 mm Breite bei 5 mm Erwartung (oben) | ein Pfad je Szenario wie `sumSpreads`; Summen nur als Summen der Szenarien |
| Phase (Temperatur) | zufällig, korreliert | σ der Antwort je Höhe | nicht gemessen (Szenario-Phase gestoppt); im Lauf vom 21.11. eine kalte Lage | derselbe Temperaturpfad, Schneeanteil über `shareAtElevation` auf der verschobenen Temperatur, „unten nie mehr als oben“ |
| **Faktor** (Eichfehler) | **systematisch** je Gletscher, mittelt sich über 14 Tage nicht | Faktor je Gletscher / Landesfaktor, 43 Gletscher (GM-3 N1-a) | p10 0,73, p90 1,37 ⇒ **σ_lnF = 0,25** | fest je Szenario gezogen |
| **Neuschneedichte** | **überwiegend zufällig je Ereignis**, nur zum kleinen Teil systematisch | 2 362 Ereignistage: p10 65, p90 148 ⇒ σ = 0,32 je Ereignis; Mediane der 16 Messfelder mit ≥ 20 Ereignissen: p10 82, p90 111 ⇒ **σ = 0,12 systematisch** | die Annahme „Dichte ist systematisch“ stimmt nur zu rund einem Drittel (V-GM-74) | systematischer Teil fest je Szenario, Ereignisteil je Schneefalltag neu ziehen; mit dem Faktor nicht verwechseln |

Summenregel, wie im Wetterteil und im Schmelzlauf: die Spanne von „Neuschnee 24/48/72 h“, von Tageswerten und jeder Summe ist p10/p90 der **Szenario-Summen**, nie eine Summe stündlicher Quantile. Schneehöhe am Tagesende ist ein Zustand, ihre Spanne die der Szenario-Zustände.

### B3 Was die Spanne „jetzt“ heißt — **Schätzung**, nicht gerechnet (`gm5-light.json`, `nowEstimate`)

Der Zustand zur Laufstunde trägt keine Vorhersage-Spanne: alle Szenarien starten aus derselben Schneedecke. Seit dem 1.10. trägt er aber den Fehler des Faktors (und der Dichte). Multiplikativ geschätzt (Zuwachs ∝ Faktor; die Schmelze seit Oktober ist klein, M-4 §3f.1 D: im Median 35 von 199 mm):

| Medianhöhe, Median über 2 084 Gletscher | Wert | Spanne p10–p90 (Schätzung) |
|---|---|---|
| Schneehöhe | 112 cm | ×0,73 … ×1,37 ⇒ Breite rund **72 cm** |
| Wasserwert | 222 mm | Breite rund 143 mm |
| Neuschnee 72 h | 34 cm | Breite rund 24 cm (Faktor und systematische Dichte) |

Die Spanne „jetzt“ ist also fast so breit wie die Hälfte des Werts, und sie ist **auf dem Eis nicht nachprüfbar** (V-GM-33). Was das Produkt dort sagen sollte: keine Zahlen-Spanne je Zeile, sondern im Kopf EIN Paar „Unsicherheit des Faktors ×0,73 … ×1,37, nicht nachgemessen“ mit Herkunft (E-GM-33). Würde man sie rechnen statt schätzen, müsste das Einschwingen mit gezogenem Faktor wiederholt werden (Startzustand je Szenario) — das kostet die K-fache Zustandsdatei.

### B4 Kosten — **nicht gemessen**

Gemessen ist nur der Erwartungswert-Schritt in diesem einen Lauf: **16 s** für 2 084 Gletscher (Schmelzlauf gesamt 370 s, davon 211 s die zusätzlichen Antworten; Maschine unter Speicherdruck — GM-3c maß 9 s unter anderer Last, die beiden Zahlen sind nicht vergleichbar). Laufzeit für K = 10 / 20 / 40 und das kleinste ausreichende K (§B.4) sind nicht gemessen; ein K-faches des Erwartungswert-Schritts ist eine Annahme, keine Zahl für Jan. Speicher ist ein eigener Befund: der Messprozess wurde abgebrochen (V-GM-77).

Gemessen ist die **Größe** (`gm5-light.json`, `size`; die Quantile durch die Erwartungswerte ersetzt, nur für die Bytes): Dokument heute 1,25 MB roh / 0,31 MB gzip; mit p10/p90 je Höhe für `hsd` und `hnd` (14 Tage) **3,01 MB roh / 0,41 MB gzip** (+140 % roh, +31 % gepackt). Der Zustand (1,81 MB) wächst nicht, solange „jetzt“ nicht je Szenario geführt wird.

### B5 Wie die Spanne geprüft werden kann

- **Größe:** Anteil der gemessenen 24-h-Änderungen der Schneehöhe an Stationen, die in der Spanne der vorhergesagten 24-h-Änderung in Stationshöhe liegen (Prüfprotokoll §7; Soll 80 % für p10–p90).
- **Was es dafür braucht:** (1) die Spanne der Schneehöhe am Ende von Tag 1 je Höhe im Laufdokument; (2) die Schattenpaare von GM-4 — sie tragen heute nur Werte zur Laufstunde (`m`, `hn`, `glacierSnowpackPairsContract.ts`), nicht die Vorhersage; das Paar müsste die Spanne in Stationshöhe für +24 h mitschreiben (V-GM-79), weil Laufdokumente nach 72 h gelöscht und nicht archiviert werden (V-GM-53); (3) die Archivierung der Paare (E-GM-21).
- **Ab wann:** ab dem ersten Lauf mit Spanne UND Paaren; mit der Schätzung von GM-4 (§3h.7: ≥ 5 Ereignisse je Station) drei bis sechs Wochen.
- **Was die Prüfung an Stationen nicht leisten kann:** die Stationen stehen auf Fels und Grat neben dem Eis; GM-4 maß dort beim Ereignis 20.–23.11. eine Änderung von 0,76 der Station, obwohl der Faktor 1,9 darin steckt (§3h.3). Eine Spanne, die den Faktor trägt, wird an Stationen zu breit oder schief aussehen. **Auf dem Eis nicht prüfbar:** die Höhe der Schneedecke und damit der systematische Teil der Spanne (Faktor) — erst mit den Frühjahrssondierungen und den Winterbilanzen 2027 (GM-8).

### B6 V-GM-41: was eine Spanne in der zweiten Woche zeigt (`gm5-light.json`, `vgm41`)

| Tage 8–14, Medianhöhe | Anteil der Gletscher-Tage |
|---|---|
| Schneedecke (Erwartungswert): Neuschnee ≥ 0,5 cm | **99,98 %** von 14 588 (Summe Tag 8–14 im Median 26 cm, p10 20, p90 43) |
| Wetterteil, Neuschnee-Wasser erwartet ≥ 0,5 mm | 99,2 % von 6 699 |
| … p10 der 100 Szenarien ≥ 0,5 mm | **2,9 %** |
| … p90 ≥ 0,5 mm | 95,1 % |

Der Erwartungswert verschmiert in der zweiten Woche die Möglichkeit eines Schneefalls zu „jeden Tag etwas“. Mit Szenarien zeigt fast jeder dieser Tage „0 bis x“: **an 97 % der Tage ist kein Schneefall das untere Ende**. Eine Spanne behebt die falsche Aussage nur, wenn die Anzeige dann nicht mehr den Erwartungswert je Tag in den Vordergrund stellt (E-GM-34). Gemessen am Wetterteil (mm Wasser, eigene Antworten); für die Schneedecke in cm ist es wegen der gestoppten Szenario-Phase nicht gerechnet.

## Was NICHT gemessen ist

- Laufzeit der Szenarien (K = 10 / 20 / 40), kleinstes ausreichendes K, Zerlegung zufällig / systematisch der Schneehöhe (§B.3–§B.5) — Prozess vom System gestoppt.
- Speicherbedarf eines Szenario-Schritts im Producer; kein Lauf auf dem Runner.
- Spanne „jetzt“ als Rechnung (nur Schätzung).
- Sondierungen (Q18); die Satellitenlinie mit einem Feld je Band (gibt es nicht).
- Alles mit mehr als einer Wetterlage (Lauf vom 21.11., kalt).

## Entscheidungen für Jan

| Nr. | Frage | Empfehlung |
|---|---|---|
| E-GM-30 | Verteilung aus Sentinel-2: **(A)** nicht bauen — die Saisonzeilen tragen nur die Höhe (A2), der Zuschlag gewinnt nichts (A3) · **(B)** die Satellitenlinie um einen Schneeanteil je 50-m-Band und Szene erweitern und die Jahre 2023–2026 nachrechnen (andere Linie, Vertragsänderung) und dann neu messen | **(A)**; (B) erst, wenn E-GM-31 zeigt, dass eine Verteilung je Band im Betrieb überhaupt etwas ändert |
| E-GM-31 | Beständige Verteilung je Band aus den Stufenwerten selbst (V3: −21 % Formfehler, Schweiz −24 %, Österreich −6 %) für die 44 vermessenen Gletscher, im Schmelzlauf als `corr[b]` (mittelwertfrei), hinter Schalter aus — **zusammen mit E-GM-9 (Faktor je Gletscher) und E-GM-10 in EINER eingefrorenen Eichrunde** (V-GM-25: Form und Niveau gehören zusammen) | ja, als nächste Eichrunde; die übrigen ≈ 2 050 Gletscher bekommen die benannte Regel „kein Zuschlag“ |
| E-GM-32 | Szenarien für die Schneedecke: **(A)** zuerst die Kostenmessung wiederholen (Werkzeug je Gletscher streamend, wenn die Maschine Luft hat), dann bauen · **(B)** gleich bauen hinter Schalter (aus) mit K = 40 · **(C)** nicht bauen | **(A)** — ohne gemessene Laufzeit und Speicher kein Bau; ich starte die Messung nur auf dein Wort |
| E-GM-33 | „Jetzt“: **(A)** keine Spanne je Zeile, im Kopf EIN Paar „Unsicherheit des Faktors ×0,73 … ×1,37, nicht nachgemessen“ · **(B)** Spanne je Zeile aus einem Einschwingen je Szenario · **(C)** nichts sagen | **(A)** — ehrlich, billig, nichts vorgetäuscht, was auf dem Eis niemand prüft |
| E-GM-34 | Zweite Woche (V-GM-41): **(A)** in GM-7 Tage 8–14 als EINE Szenario-Summe mit p10–p90 statt Tageswerten · **(B)** Tageswerte mit Spanne „0 bis x“ · **(C)** wie heute | **(A)** |
| E-GM-35 | Nachbar-Gletscher (1 127, E-GM-16): Spanne aus den Antworten des Nachbarn (wie ihr Erwartungswert) oder benannt „ohne Spanne“ wie im Wetterteil | „ohne Spanne“, benannt, bis die Spanne an eigenen Gletschern geprüft ist |

### Jans Entscheidungen (24.11.2026, „wir machen es so“ — alle sechs wie empfohlen)

| Nr. | Entschieden | Folge |
|---|---|---|
| E-GM-30 | **(A)** nicht bauen | der Zweig „Verteilung aus Sentinel-2“ ist geschlossen; die Erweiterung der Satellitenlinie je Band (V-GM-71) bleibt eine Idee, bis E-GM-31 etwas zeigt |
| E-GM-31 | **ja**, in EINER Eichrunde mit E-GM-9 / E-GM-10 | eigenes Paket mit neuer eingefrorener Regel (Faktor je Gletscher + Form je Band für die 44 vermessenen Gletscher), Tabellen, danach `corr[b]` im Schmelzlauf hinter Schalter (aus). **Jan 24.11. („das passt für mich“):** E-GM-9 ja; E-GM-10 Winterschmelze wie im Betrieb (ETI), nicht mit-eichen; E-GM-11 (`inca-v1-1h-1km`) bestätigt |
| E-GM-32 | **(A)** erst messen, dann bauen | Kostenmessung wiederholt mit `gm5-cost.mjs` (rechnen und verwerfen), Nachtrag zur Messregel `gm5-method-frozen-b2.md`; Ergebnis unten in §B4-N |
| E-GM-33 | **(A)** keine Spanne je Zeile | im Kopf des Dokuments EIN Paar „Unsicherheit des Faktors ×0,73 … ×1,37, nicht nachgemessen“ mit Herkunft — Teil des Baus |
| E-GM-34 | **(A)** Tage 8–14 als EINE Summe mit p10–p90 | das Laufdokument trägt die Szenario-Summe der Tage 8–14 je Höhe (Teil des Baus); die Anzeige ist GM-7 |
| E-GM-35 | benannt „ohne Spanne“ | die 1 127 Nachbar-Gletscher tragen keine Spanne, im Kopf gezählt, in der Zeile benannt — wie im Wetterteil |

## Befunde

| Nr. | Inhalt | Mehrwert · Skizze |
|---|---|---|
| V-GM-70 | Meine Regel A2 nahm Spearman ≥ 0,99 als „Reihenfolge = Höhe“; Bindungen (42 % der Bandpaare, Szenen 10–18 Tage auseinander) drücken ihn auf 0,91, obwohl kein Paar gegenläufig ist | richtige Urteile in künftigen Runden · Reihenfolge über strikt gegenläufige Paare prüfen, nicht über Rangkorrelation |
| V-GM-71 | Die Satellitenlinie verwirft die Lage des Schnees: je Szene bleibt nur eine Grenze, Lawinenkegel und ausgeblasene Rücken sind unsichtbar | eine Verteilung, die nicht der Höhe folgt · Schneeanteil je 50-m-Band in Szenendokument und Saisonzeile (E-GM-30 B) |
| V-GM-72 | Die oberste 100-m-Stufe trägt im Median 0,35 % der Fläche und 13 % weniger Winterschnee als die darunter (p10 −33 %, 319 Gletscherwinter); „Oberkante“ der Schneedecke steht für einen winzigen, oft ausgeblasenen Teil | keine Überschätzung oben in der Anzeige · in GM-7 die Oberkante als „höchster Punkt, wenig Fläche“ kennzeichnen oder eine flächengewichtete obere Höhe (z. B. 90 %-Fläche) statt des höchsten Bands |
| V-GM-73 | Die Saison 2024 liefert kein einziges Muster (37 Neuschnee-Marken, 114 Grenzen an 26 Gletschern) | — · bei einem Nachlauf der Satellitenlinie 2024 mit mehr Szenen |
| V-GM-74 | Die Neuschneedichte ist überwiegend zufällig je Ereignis (σ 0,32) und nur zu rund einem Drittel systematisch (σ 0,12 zwischen Messfeldern) | eine Spanne, die nicht zu breit wird · Ereignisteil je Schneefalltag ziehen, systematischen Teil je Szenario |
| V-GM-75 | Der Faktor dominiert die Unsicherheit der Schneedecke (σ_lnF 0,25 ⇒ ×0,73 … ×1,37) | Klarheit, was die Spanne „jetzt“ ist · E-GM-33; abbauen nur über E-GM-9/E-GM-31 und GM-8 |
| V-GM-76 | Der Wetterteil hat für 1 127 Nachbar-Gletscher keine Spanne; eine Schneedecken-Spanne erbt die Frage | einheitliche Regel · E-GM-35 |
| V-GM-77 | Eine Messung, die die Eingänge aller Gletscher im Speicher hält, wurde vom System gestoppt; der Speicherbedarf eines Szenario-Schritts ist unbekannt (Runner 7 GB) | kein roter Lauf auf dem Runner · Szenarien je Gletscher rechnen und verwerfen, Speicher vor dem Bau messen |
| V-GM-78 | Spannen für `hsd`/`hnd` machen das Dokument 2,4-mal so groß (gepackt +31 %) | weniger Wachstum der Historie · mit V-GM-37 (ganze cm in der Vorhersage) und nur p10/p90 an der Medianhöhe |
| V-GM-79 | Die Schattenpaare von GM-4 tragen nur Werte zur Laufstunde; eine Spanne der 24-h-Änderung ist nach 72 h nicht mehr da | prüfbare Spanne · das Paar schreibt p10/p90 der Schneehöhe in Stationshöhe für +24 h mit |
| V-GM-80 | Der Erwartungswert-Schritt kostete in diesem Lauf 16 s, in GM-3c 9 s — zwei Läufe unter verschiedener Last | — · Laufzeiten nur innerhalb eines Laufs vergleichen |

## Was ein Bau berühren würde (Dateien, die GM-4 gerade ändert)

`scripts/glacier/melt.mjs` (Szenario-Schritt hinter der Schneedecke; für E-GM-31 die Übergabe von `corr[b]`), `scripts/glacier/lib/snowpackcore.mjs` (Szenario-Lauf, Quantile), `src/glacier/glacierSnowpackContract.ts` (`rules.spread`, Felder `hsq`/`hnq`, Kopf-Paar „jetzt“), `scripts/verify-glacier-snowpack.mjs`, `src/glacier/glacierSnowpackPairsContract.ts` (V-GM-79), dazu `audit/gletscher-schneemodell.md`. Nicht in GM-4: `lib/weathercore.mjs` (die Pfad-Regel von `sumSpreads` als exportierte Funktion teilen statt kopieren), `lib/meltcore.mjs` (`corr[b]`, E-GM-31). buscosun Fusion wird nur gelesen.

## Werkzeuge und Belege

`gm5-method-frozen.md` (+ `.sha256`), `gm5-inventory.mjs` → `.json`, `gm5-distribution.mjs` → `.json`, `gm5-order-explore.mjs` → `.json` (explorativ, nach dem Lauf), `gm5-shape-explore.mjs` → `.json` (explorativ, nach dem Lauf), `gm5-scenarios.mjs` mit `gm5-hook-register.mjs`, `gm5-hook-loader.mjs`, `gm5-hook-snowpack.mjs`, `gm5-hook-weather.mjs` (Szenario-Phase nicht zu Ende gelaufen, kein `gm5-scenarios.json`), `gm5-light.mjs` → `.json`. Lauf-Ausgaben unter `C:\dev\buscosun-glacier-cache\gm5\` (`out-sp`, `patch-sp`, `view`, `scen.log`/`scen.err`).
