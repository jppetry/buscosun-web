# GM-10b, Größenmessung vor dem Bau — ist der Größenterm von C2 ein Gitterartefakt? Methode, eingefroren vor dem ersten gewerteten Lauf

Stand 25.11.2026. **Post hoc:** diese Messung folgt dem Befund V-GM-118 aus Schritt 0b (der Gewinn von C2 kommt zu einem großen Teil vom Flächenterm an sehr kleinen Gletschern); sie ist im Audit so markiert. Auftrag: E-GM-43 (Jan, 25.11.). Diese Datei wird nach dem Einfrieren nicht mehr geändert; Änderungen kommen als Nachtrag mit eigenem Hash (`gm10b-size-method-frozen.sha256`). Werkzeug `audit/gletscher-schneemodell/gm10b-size.mjs` (Modus `score` läuft nur bei passendem Hash dieser Datei; sein eigener Hash und der Hash der Zellendatei stehen im Bericht), Zellen `gm10b-cells.py`. Urteile, Wahl und Mindestgröße rechnet das Werkzeug, nicht der Autor, und nicht Jan.

**Bekannt beim Einfrieren — ehrlich:** alle Zahlen von Schritt 0 und 0b, **auch die Zeilen je Gletscher von 0b** (s2 von G1, C1, C2 je Eichgletscher, im lokalen Bericht `report-0b.json`, in dieser Sitzung gelesen). Damit sind die Klassenzahlen der Variante A (= C2) vor dem Einfrieren aus 0b ablesbar; neu sind nur B und C, die Wahl und die Mindestgröße. Ebenfalls bekannt: die Größenverteilung aller Schweizer Gletscher aus `cells-ch.json` (liest keine Winterbilanz; 1 291 Gletscher, davon 627 mit höchstens einer Zelle im Umriss, 329 mit keiner) und der synthetische Test dieser Runde (§9). Wo ich zwischen zwei gleich guten Festlegungen wählen musste, habe ich die genommen, die Jans Wortlaut am nächsten ist („gleiche Wertung“), nicht die, deren Ausgang ich aus 0b hätte ablesen können.

## 1. Daten, Wahrheit, Schmelze, Kennzahl — wie Schritt 0 und 0b

Unverändert aus `gm10-factor.mjs` importiert (`loadAll`, `predictors`, `lgo`): dieselben **32 Schweizer Eichgletscher** mit allen nutzbaren Wintern (377), derselbe Schmelzkern (`eti`, `TF` 0,12, `SRF` 0,005455), dieselbe Kennzahl **s2** = |T(F) − BW| in mm Wasserwert, gemittelt über die Gletscherwinter, **exakt mit dem Kern**. Nur die Schweiz; Österreich und Deutschland sind nicht Teil dieser Messung.

## 2. Größe in Gitterzellen

`nIn` = Zahl der 250-m-Zellen des Q20-Gitters (Version 1.1, Nordwert ohne Verschiebung, Reihenfolge aus den Koordinaten), deren **Mittelpunkt im L1-Umriss** liegt — dieselbe Regel wie `gm10-q20.py`. `nIn = 0` ist erlaubt (Q20 nimmt dann die nächste Zelle). Gegenprobe: an allen Schweizer Gletschern der Wahrheit gleich der Zellzahl von Schritt 0 (Version 1.0 + 2 000 m), sonst bricht `gm10b-cells.py` ab. Als Prädiktor **`lnCells = ln(1 + nIn)`** — die Eins, weil `nIn = 0` vorkommt; damit ist der Prädiktor nach unten beschränkt (ein Gletscher ohne eigene Zelle ist gleich klein wie jeder andere ohne eigene Zelle), während `ln Fläche` unter einer Zelle weiter fällt. Fläche = Katalogfläche (SGI2023), wie in Schritt 0.

## 3. Varianten — genau diese

Jede Variante sagt `ln F̂_g = c_CH + Σ β_j · z_jg` voraus wie in 0b §2 (zentriert und skaliert mit den Trainings-Gletschern, Anpassung auf s2, Nelder–Mead, zwei Neustarts, `F̂` an 0,30 / 5,00 gekappt, **keine Schrumpfung**).

| Variante | Prädiktoren |
|---|---|
| **A** = C2 wie gemessen | x1 + zMed + north + lnArea |
| **B** = C2 mit Zellen | x1 + zMed + north + lnCells |
| **C** = C2 ohne Größe | x1 + zMed + north |
| Referenz G1 | x1 (muss 0b wiedergeben: 334,8 mm) |
| Referenzen a, a′, b | wie 0b |

## 4. Wertung je Variante — gleiche Wertung wie 0b

Gegen **G1**, mit den Funktionen von 0b (`runCandidate`, `carries`, unverändert importiert): ein **Gletscher** ausgelassen; Gewinn gegen G1 exakt; **eine Vertauschung** (Startwert 42) und **200 Vertauschungen** (Startwerte 1000 …) NUR der zu G1 hinzugefügten Prädiktoren (die ganze Zeile eines Gletschers wandert zusammen, x1 bleibt); 1 000 Ziehungen der Gletscher (Startwert 42), p10. **Trägt** = alle vier Bedingungen von 0b §5 (Gewinn ≥ 5 % des Fehlers von G1; eine Vertauschung < 5 %; p ≤ 0,05; p10 > 0). Mont Collon (eigener Faktor an der Suchgrenze 5) **bleibt in der Wertung** (gleiche Wertung); ohne ihn wird nur beschreibend berichtet.

## 5. Wahl (vom Werkzeug)

`m` = 0,05 · s2(G1). S = Menge der tragenden Varianten.

1. S leer ⇒ **G1**.
2. Größenvariante: tragen A und B, gilt **B**, außer s2(A) ≤ s2(B) − m (dann A). Trägt nur eine, gilt sie. Begründung für B bei Gleichstand: `lnCells` ist nach unten beschränkt und beschreibt das vermutete Artefakt (was die 250-m-Zelle sieht) direkt; `ln Fläche` würde bei Zielgletschern unter der kleinsten Eichfläche weiter extrapolieren.
3. Trägt C: gilt **C**, außer die Größenvariante aus 2 schlägt C um mindestens m (s2(Größe) ≤ s2(C) − m). Trägt C nicht, gilt die Größenvariante aus 2.

Das ist dieselbe Vorliebe für die einfachere Form wie in 0b (C1 vor C2).

## 6. Größenklassen und Mindestgröße (vom Werkzeug)

**Klassen nach `nIn`:** K1 = eine Zelle (`nIn` 0 oder 1 — Q20 sieht den Gletscher in einer einzigen Zelle), K2 = 2–4 Zellen, K3 = ≥ 5 Zellen. Je Klasse: Gletscher, Winter, s2 (Mittel über die Gletscherwinter der Klasse, aus denselben ausgelassenen Vorhersagen) von a′, G1, A, B, C und b. **Benannt** in jeder Variante: Pizolgletscher, Schwarzwasserfirn, Glacier du Sex Rouge (vorhergesagter Faktor und s2 je Variante).

**Mindestgröße** für die gewählte Form W (≠ G1): von der größten Klasse abwärts **qualifiziert** eine Klasse, wenn sie mindestens **3** Eichgletscher hat und s2(W) ≤ s2(G1) in dieser Klasse. Die Mindestgröße ist die untere Grenze (in `nIn`) der kleinsten Klasse dieser ununterbrochenen Kette. Darunter rechnet der Bau **G1 allein**. Qualifiziert schon K3 nicht, wird **G1** gebaut. Eine Größenvariante gilt außerdem nie unter ihrem kleinsten Eichgletscher im eigenen Größenprädiktor (berichtet als `sizeFloor`; für B ist das `nIn = 0`, also keine Grenze).

## 7. Schutz (E-GM-43; alle `set`) — beschreibend gewertet

Für die gewählte Form, innerhalb desselben Auslassens, in dieser Reihenfolge: (i) ausgelassener Gletscher unter der Mindestgröße aus §6, oder (bei einer Größenvariante) kleiner als jeder Trainings-Gletscher im Größenprädiktor der Form ⇒ Vorhersage von **G1**; (ii) sonst ein Nicht-Größen-Prädiktor der Form (x1, zMed, north) außerhalb [min, max] der Trainings-Gletscher ⇒ **Landeswert** a′ desselben Durchgangs; (iii) danach der Faktor an [min, max] der **eigenen Faktoren der Trainings-Gletscher, ohne Gletscher an der Suchgrenze** (0,30 / 5,00) gekappt. Exakt gewertet, gegen G1 und gegen die Form ohne Schutz, je Klasse; Zahl der Gletscher je Schutzregel und gekappt. **Kein Teil der Wahl** — die Mindestgröße kommt aus dem vollen Lauf, im Auslassen ist sie also nicht unabhängig; das ist die Zahl, die der Bau ungefähr erwarten lässt.

## 8. Größenverteilung

Alle Schweizer Katalog-Gletscher (`20261120-1`, 1 291) aus `cells-ch.json`: **Eichgletscher** (die 32) neben **Zielgletschern** (alle ohne eigenen Faktor, d. h. ohne die 35 Schweizer Gletscher von GM-5b): Zahl je Klasse (und `nIn` 0 / 1 getrennt), Quantile der Fläche, Median von `nIn`; je benanntem Gletscher, wie viele Zielgletscher höchstens so groß sind (Fläche und `nIn`); wie viele Zielgletscher kleiner sind als der kleinste Eichgletscher (Fläche).

## 9. Synthetischer Wiederfindungstest (vor dem Einfrieren gelaufen)

Echte Prädiktoren der 32 Gletscher, echte Tabellen, erfundene Winterbilanzen `BW = T(F_wahr · e^ε)`, ε ~ N(0; 0,2) je Winter (Startwert 7), auf der Tabelle gewertet, 100 Vertauschungen. **ohne Größe:** `F_wahr = 1,8 · exp(0,25 z(x1) − 0,15 z(zMed) + 0,10 z(north))` ⇒ erwartet: C gewählt. **Zellen:** dazu `− 0,20 z(lnCells)` ⇒ erwartet: B gewählt. Ergebnis im Diagnosedokument.

## 10. Nicht Teil dieses Schritts

Kein Producer-Code, keine Tabelle für den Runner, kein Producer-Lauf, keine Mutationsrunde, nichts in `buscosun-data` oder `buscosun-archiv`, kein Push; keine abgeleitete Tabelle je Gletscher im Repo (Lizenzfrage GLAMOS offen) — Werte je Gletscher nur im lokalen Bericht `C:\dev\buscosun-glacier-cache\gm10\report-size.json`. x1 kommt noch aus den GLAMOS-Höhenstufen (Q20 v1.0 = v1.1, V-GM-110); die Neuanpassung mit der Hypsometrie des Builds ist der nächste Schritt (E-GM-43), nicht dieser.
