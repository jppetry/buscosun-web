# GM-10, Schritt 0 — Lässt sich der Faktor eines Gletschers vorhersagen? Diagnose und Ergebnis (25.11.2026)

> Auftrag (Jan, 25.11.): nur messen, ob sich der Niederschlagsfaktor eines Gletschers aus Schneeanalysen im Gitter und aus dem Gelände gut genug vorhersagen lässt, um den Landeswert zu schlagen — go / no-go. Kein Producer-Code, keine Tabelle für den Runner, nichts veröffentlicht, kein Commit ohne Jans Wort. buscosun Fusion nur gelesen (hier gar nicht berührt).
>
> Werkzeuge (alle neu, nur in diesem Ordner): `gm10-q20.py` (Q20 je Gletscher), `gm10-snowgrid.mjs` (SNOWGRID je österreichischem Gletscher), `gm10-terrain.py` (Gelände), `gm10-factor.mjs` (Inventar, synthetischer Test, gewerteter Lauf). Regel: `gm10-method-frozen.md` (Hash in `gm10-method-frozen.sha256`). Voller Bericht mit Werten je Gletscher NUR lokal: `C:\dev\buscosun-glacier-cache\gm10\report.json` (Lizenzfrage GLAMOS offen); im Repo nur Summen.

## 1. Ausgangslage

- Arbeitsbaum sauber, `main` = `origin/main` (`545999ae`) beim Start.
- GM-5b (§3j): 43 Gletscher mit eigenem Faktor, Winterbilanzfehler (s2) 233,0 mm statt 402,2 mm mit dem Landeswert; Schweiz 204 / 397, Österreich 362 / 425. Rund 2 050 Gletscher rechnen mit dem Landeswert.
- Frage: trägt ein Faktor, der aus Gitter-Schneewasser und Gelände vorhergesagt wird, für Gletscher ohne Messung?

## 2. Quellen und Format (gemessen)

### 2.1 Q20 — SLF-Schneedatensatz 2016–2025

| Punkt | Befund |
|---|---|
| Laden | lag schon vollständig in `C:\dev\buscosun-glacier-cache\gm10\q20\` (Lauf vom 24.11. 22:16–22:31 UTC, `q20-download.log`): zehn Archive `OSHD_DATA_WY<Jahr>.zip` + `OSHD_MODEL_DOMAIN.tif`, 6,17 GB. **Alle elf md5-Summen stimmen** mit dem Zenodo-Eintrag |
| Version | lokal **1.0** (10.10.2025). Seit 09.11.2026 gibt es **1.1** (Record 24088217). Zenodo-Hinweis: in 1.0 ist der **Nordwert um −2 000 m (8 Zellen) falsch beschriftet**; Werte, Ostwerte und Höhenmodell sind richtig; Abhilfe: +2 000 m |
| Format | ein NetCDF-4 (HDF5) je Monat in jedem Zip; einzelne Monate lassen sich herausziehen, ohne alles zu entpacken. Größen `hs` (m), `swe` (kg m⁻², = mm), `scf`, `smro`, Anordnung (Ost, Nord, Zeit), 1 442 × 1 056 Zellen, 250 m, LV95 (EPSG:2056), gzip-Blöcke 481 × 352 × 10, täglich, Zeit „days since <Monat>-01T06:00:00 UTC+01:00“, Füllwert −9999 |
| Prüfung der Korrektur | Korrelation von ln SWE (30.04.2020) mit dem Höhenmodell des Datensatzes je Verschiebung des Nordwerts: 0 m 0,769 · 1 000 m 0,821 · **1 500 m 0,840 · 2 000 m 0,838** · 2 500 m 0,810 · 4 000 m 0,732. Das Maximum ist breit (250-m-Zellen); der dokumentierte Wert +2 000 m liegt darin und wird benutzt |
| Gletscher im Gitter | Gletscherzellen tragen Werte (Rhone Ende April ≈ 1 100 mm). Am 1. Oktober liegt auf den Gletscherzellen 0–60 mm: **kein mehrjähriger Firn** im Datensatz ⇒ ΔSWE = SWE(t1 + 1) − SWE(t0) ist sauber |
| Gebiet | Schweiz und angrenzende Einzugsgebiete bis 10,56° E; Jamtalferner (AT) liegt am Rand (9 von 35 Zellen mit Wert) und wird für Österreich NICHT aus Q20 genommen |
| Lesezeit | alle 20 benötigten Tage (1.10. und 1.5. der Winter 2016–2025) für die 44 Gletscher und alle 14 069 Zellen der 1 291 Schweizer Gletscher: 24 s |

### 2.2 SNOWGRID Klima v2.1 (Österreich)

Zeitreihen-API, eine Größe (`swe_tot`), 362 Zellen (alle Gletscher der fünf Regionen der acht Eichgletscher, aus der Zellendatei `20261120-1.1` der Phase GN), 1.9.2011–1.6.2025: **3 Abrufe** zu je ≤ 150 Punkten (753 450 Werte, unter der Grenze von 1 Mio.); Antworten im Zwischenspeicher, 237 von 240 Abrufen je Stunde blieben übrig. Jede Antwort rastete auf genau die angefragte Zelle. SNOWGRID deckt alle Winter 2012–2025.

### 2.3 Gelände

Katalog `20261120-1` (Medianhöhe, Spanne, Fläche) und Copernicus GLO-30 aus den 17 Kacheln im Zwischenspeicher (Neigung, Exposition, `tpi1k`, `aval`); 48 Gletscher (44 der Wahrheit + 4 deutsche) in 43 s.

## 3. Inventar

| Land | Gletscher mit eigenem Faktor (GM-5b) | mit Gitter-Prädiktor (≥ 3 Gitterwinter) | gewertete Gletscherwinter | davon mit Gitterwert | Gitter |
|---|---|---|---|---|---|
| Schweiz | 35 | **32** | 377 | 283 | Q20, 250 m, Winter 2016–2025 |
| Österreich | 8 | **8** | 87 | 86 | SNOWGRID, 1 km, Winter 2012–2025 |
| zusammen | 43 | **40** | 464 | 369 | |

- Schweiz ohne Gitter-Prädiktor: Vorab und Segnas (Wahrheit endet 2016: 1 Gitterwinter), Tiefengletscher (2). Orny hat 3 Winter und ist schon in GM-5b nicht gewertet.
- **Österreich, ehrlich gesagt:** acht Gletscher, 1-km-Zellen; vier hängen an EINER Zelle (Goldberg — nur die nächste Zelle, 0,4 km —, Hallstätter, Kleinfleiß, Seekarles), die übrigen an 3–7 Zellen. Die meisten österreichischen Gletscher sind kleiner als eine Zelle (GN: 649 von 799). Mit acht Gletschern ist ein Urteil nach der Regel (mindestens 10) **nicht entscheidbar**; die Zahlen werden trotzdem berichtet.
- Schweiz: vier Eichgletscher hängen an einer 250-m-Zelle (Jöri, Pizol, Schwarzwasserfirn [nächste Zelle], Alphubel N).
- Deutschland: kein Gletscher mit Winterbilanz in der Wahrheit; für die vier deutschen Gletscher gibt es nur Gelände. Sie liegen außerhalb der Spanne der Eichgletscher (Neigung 21–39° gegen 5–32°, `aval` 0,8–2,6 gegen 0–1,4, Medianhöhe 2 031–2 583 m gegen 2 579–3 781 m).

## 4. Reihenfolge und Belege

1. Laden und zählen (§2, §3); Prädiktoren aller Gletscher aus Gitter und Gelände — sie lesen keine Winterbilanz.
2. **Synthetischer Wiederfindungstest** (vor dem Einfrieren; echter Prädiktor x1 der 32 Schweizer Gletscher, echte Tabellen, erfundene Winterbilanzen, ε ~ N(0; 0,2) je Winter, 100 Vertauschungen; `C:\dev\buscosun-glacier-cache\gm10\synthetic.json`):

   | Fall | β wahr / gefunden (je Streuung) | Fehler ln F̂ − ln F_wahr (Std.) | mit Landeswert | s2 Form / a′ | Gewinn | p10 | Vertauschung p | Urteil |
   |---|---|---|---|---|---|---|---|---|
   | Wiederfinden | 0,30 / **0,30** | **0,001** | 0,308 | 266,5 / 423,5 | 37,1 % | 0,29 | 0,01 | trägt |
   | nichts zu finden | 0 / 0,003 | 0,004 | 0 | 276,4 / 275,7 | −0,2 % | −0,004 | 0,42 | trägt nicht |

   Ein erster Anlauf brach ab, weil `gm5b-report.json` im Repo die Zeilen je Winter nicht trägt (nur ihre Zahl, `perWinterRows: 478`); die Zeilen stehen im lokalen Original `gm3\report-fit2.json` (gleicher Hash der Regel `c5242e51…`, gleiche Zusammenfassung). Das Werkzeug verlangt seitdem diesen Hash; die Regel nennt die Datei. Ebenfalls vor dem Einfrieren berichtigt: Mont Collon trägt im Bericht kein Feld `atBound`; die Ausnahme in der Fehlerstreuung prüft deshalb den Wert (5,00).
3. **Regel eingefroren** 25.11. 07:36:45 UTC: `gm10-method-frozen.md`, sha256 `d487643d0a4ac746449d5a1ddb8e84de671179de38821abddfa5f7ee808fa317`; Werkzeug `gm10-factor.mjs` sha256 `723ba495…` (steht im Bericht).
4. **Gewerteter Lauf** 07:36:59–08:22:44 UTC (Tabellen 6 min, dann 6 Formen und 15 Einzelformen mit je 200 Vertauschungen), Bericht `C:\dev\buscosun-glacier-cache\gm10\report.json` (nur lokal). Die Grundlinien von GM-5b sind aus den Zeilen genau wiedergegeben: (a) **402,2**, (b) **233,0** mm.

## 5. Ergebnis nach eingefrorener Regel (Winterbilanzfehler s2, mm Wasserwert; ein Gletscher ausgelassen; alle Winter 2012–2025 der gewerteten Gletscher; exakt mit dem Kern)

**Primäre Formen**

| Form | Land | Gletscher / Winter | **Form** | a′ Landeswert (gleiche Größe) | a Landeswert GM-5b | b eigener Faktor | Gewinn gegen a′ | p10 / p90 | Lücke a → b geschlossen | Negativkontrolle (1 Vertauschung) | Vertauschung p (200) | **Urteil** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G1-CH (Q20: Faktor, den das Gitter verlangt) | CH | 32 / 377 | **334,8** | 406,1 | 402,3 | 207,7 | **17,6 %** | 5,2 / 28,7 % | **35 %** | 393,4 (+3,1 %) | 0,005 | **trägt** |
| G1-AT (SNOWGRID) | AT | 8 / 87 | 341,1 | 411,3 | 425,3 | 361,8 | 17,1 % | 5,7 / 26,1 % | 132 % | 391,2 (+4,9 %) | 0,005 | **nicht entscheidbar** (8 < 10) |
| Gitter gesamt (G1-CH + G1-AT) | beide | 40 / 464 | **336,0** | 407,1 | 406,6 | 236,6 | **17,5 %** | — | **41 %** | — | — | **trägt** (Gewinn ≥ 10 % und jedes entschiedene Land trägt — entschieden ist nur CH) |
| T3 (Gelände: Medianhöhe, Exposition Nord, ln Fläche) | CH + AT | 43 / 478 | **352,1** | 401,7 | 402,2 | 233,0 | **12,4 %** | 6,7 / 17,6 % | 30 % | 402,4 (−0,2 %) | 0,005 | **trägt** |
| T3 | CH | 35 / 391 | 346,9 | 399,6 | 397,1 | 204,3 | 13,2 % | 7,1 / 19,8 % | 26 % | 396,6 (+0,7 %) | 0,005 | **trägt** |
| T3 | AT | 8 / 87 | 375,2 | 411,3 | 425,3 | 361,8 | 8,8 % | −4,7 / 19,0 % | 79 % | 428,4 (−4,2 %) | 0,045 | **nicht entscheidbar** |

**Sekundäre Formen (kein Urteil)**

| Form | Land | Form / a′ | Gewinn | Vertauschung p |
|---|---|---|---|---|
| G2-CH (Schneewasser relativ zur Region) | CH | 420,6 / 406,1 | −3,6 % | 0,88 |
| G2-AT | AT | 455,8 / 411,3 | −10,8 % | 0,76 |
| T2w (Windexposition tpi1k, Lawineneinzug aval) | CH + AT | 406,4 / 401,7 | −1,2 % | 0,36 |

**Welche Prädiktoren tragen** (je einzeln, ein Gletscher ausgelassen, Gewinn gegen a′; beschreibend):

| Prädiktor | Gewinn | Vertauschung p | Lesart |
|---|---|---|---|
| x1 Faktor, den das Gitter verlangt | **17,6 % (CH)**, 17,1 % (AT) | 0,005 / 0,005 | trägt am meisten |
| zMed Medianhöhe | 9,8 % (CH + AT), 10,1 % (CH) | 0,005 | höher ⇒ kleinerer Faktor |
| north Exposition | 6,2 % (CH + AT), 13,2 % (AT) | 0,005 | nordseitig ⇒ größerer Faktor |
| lnArea | 3,1 % | 0,045 | schwach |
| zRange | 2,4 % | 0,075 | nichts |
| x2 relativ zur Region | −3,6 % (CH), −10,8 % (AT) | 0,88 / 0,76 | nichts |
| slope, tpi1k, aval | −5,3 %, −2,3 %, −1,1 % | 1,0 / 0,69 / 0,47 | nichts |

Koeffizienten (Median über die ausgelassenen Gletscher, je Streuung des Prädiktors): G1-CH **β = +0,26** (0,18 … 0,27), G1-AT +0,13 (0,09 … 0,15) — ein Gletscher, an dem das Gitter mehr Schnee verlangt, als der Antrieb bringt, hat auch einen größeren Faktor. T3: Medianhöhe −0,09, Nord +0,056, ln Fläche −0,022. Der Gitter-Prädiktor ist in der Schweiz von der Höhe unabhängig (r(x1, zMed) = −0,04, 32 Gletscher; Österreich −0,58, 8 Gletscher). Im Mittel verlangt Q20 auf den Schweizer Gletschern einen Faktor von 1,43 (GLAMOS: 1,82), SNOWGRID auf den österreichischen 0,98 (WGMS: 2,42) — das Niveau der Gitter liegt, wie erwartet, unter dem der Massenbilanz; benutzt wird nur das Muster.

**Streuung des Vorhersagefehlers** (`ln(F̂ / F_eigen)`, ohne Mont Collon): G1-CH Std. **0,20** (p10 −0,30, p90 +0,17) gegen 0,27 mit dem Landeswert; G1-AT 0,15 gegen 0,23; T3 0,21 gegen 0,26. In Faktoren: mit G1 liegt der vorhergesagte Faktor in der Schweiz typischerweise ±22 % neben dem eigenen (Landeswert ±31 %), mit Schwanz nach unten (p10 −26 %). Das wäre die Unsicherheit eines vorhergesagten Faktors.

**Empfindlichkeit ohne Mont Collon** (§7 der Regel; mit den gespeicherten Faktoren exakt nachgerechnet, ändert kein Urteil): G1-CH 314,0 gegen a′ 366,2 (**14,3 %**), Lücke 28 %; T3 gesamt 317,5 gegen 370,1 (14,2 %), CH 304,4 gegen 360,8 (15,6 %). Mont Collon allein hebt jeden Mittelwert um rund 40 mm.

**Urteil des Skripts:** Schweiz (G1-CH) **trägt**; Österreich **nicht entscheidbar** (8 Gletscher); Gitter gesamt **trägt**; Gelände allein (T3) **trägt** gesamt und in der Schweiz, in Österreich nicht entscheidbar.

## 6. Lesart (meine, nach dem Lauf)

- **Das Gitter trägt in der Schweiz, aber es schließt nur rund ein Drittel der Lücke.** Mit dem vorhergesagten Faktor fällt der Winterbilanzfehler von 402 auf 335 mm; der eigene Faktor eines vermessenen Gletschers liegt bei 208 mm. Für einen Gletscher ohne Messung ist das der erste belegte Schritt weg vom Landeswert — eine Messung ersetzt es nicht.
- **Was trägt, ist der Vergleich Gitter gegen Antrieb, nicht Gitter gegen Nachbarn.** x1 fragt: wie viel mehr Schnee liegt im Gitter, als unser Antrieb (RhiresD bzw. INCA, Stationstemperatur) durch denselben Kern bringt? Genau dafür steht der Faktor. Das Schneewasser relativ zur Region (x2) trägt nichts, in Österreich schadet es.
- **Gelände trägt etwas, vor allem Höhe und Exposition** (12 %). Windexposition und Lawineneinzug in meiner Näherung tragen nichts. Weil x1 in der Schweiz von der Höhe unabhängig ist, könnten Gitter und Gelände zusammen mehr bringen — nicht geprüft, nicht Teil der Regel (V-GM-112).
- **Österreich:** die Zahlen gehen in dieselbe Richtung (17 % Gewinn; der vorhergesagte Faktor ist sogar besser als der eigene, weil der eigene in Österreich von Winter zu Winter stark streut, V-GM-90), aber acht Gletscher an 1-km-Zellen, vier davon an einer einzigen, reichen nach der Regel nicht für ein Urteil.
- **Das Niveau bleibt bei GLAMOS/WGMS:** jede Form hat ein Landes-`c`, das an den Winterbilanzen hängt; das Gitter liefert nur die Abweichung davon.

## 7. Was das für die drei Gruppen heißt

| Gruppe | Befund | Folgerung |
|---|---|---|
| **Schweizer Gletscher ohne Messung** (≈ 1 250) | G1-CH trägt (17,6 %, p = 0,005, ohne Mont Collon 14,3 %); Q20 deckt alle Schweizer Gletscher (14 069 Zellen der 1 291 Gletscher gelesen) | bauen lohnt. Voraussetzung: für jeden Gletscher derselbe Antrieb wie in der Eichung (RhiresD am Gletscherpunkt, Stationstemperatur und -strahlung nach der Zuordnungsregel von GM-3) für die Winter 2016–2025 und die Höhenstufen aus der Hypsometrie des Builds statt aus GLAMOS (V-GM-113). Erwartung: Fehler eines vorhergesagten Faktors ±22 % statt ±31 % |
| **Österreichische Gletscher** (≈ 790) | Gitter (SNOWGRID) und Gelände nicht entscheidbar (8 Gletscher); Zahlen in derselben Richtung | nicht bauen; der Landeswert bleibt. Ein Urteil bräuchte mehr österreichische Winterbilanzen (in der Wahrheit gibt es keine weiteren mit ≥ 4 Wintern) |
| **Deutsche Gletscher** (4) | nur Gelände; T3 trägt an CH + AT, aber alle vier liegen außerhalb der Eichspanne (Medianhöhe 2 031–2 583 m gegen 2 579–3 781 m, Neigung bis 39°, Lawineneinzug bis 2,6); T3 sagt für tiefe Gletscher einen größeren Faktor voraus — das wäre eine Verlängerung über die Daten hinaus | nicht bauen; der Landeswert bleibt (V-GM-115) |

## 8. Vorschlag

**Bauen, nur für die Schweiz, mit G1 — als eigenes Paket GM-10b, Schalter aus:**
1. Antrieb für alle Schweizer Gletscher 2016–2025 nach der Regel von GM-3 (`snowcal_grid.py --points` für RhiresD, Stationszuordnung und Strahlung wie GM-5b), Tabellen über `k` mit der Hypsometrie des Builds (50-m-Bänder), x1 je Gletscher aus Q20 **Version 1.1** (V-GM-110). Gegenprobe: an den 32 Eichgletschern x1 aus der Hypsometrie gegen x1 aus den GLAMOS-Stufen.
2. `c_CH` und `β` aus allen 32 Gletschern nach derselben Regel; Faktor je Gletscher `F̂ = exp(c + β·z)`, Herkunft `computed`, mit Spanne aus der Streuung (Std. 0,20 in ln). Die 35 vermessenen Gletscher behalten ihren eigenen Faktor (E-GM-38).
3. Im Producer hinter einem eigenen Schalter (aus), wie GM-5b; nie stiller Rückfall; Byte-Gleichheit ohne Schalter.
4. **Vor dem Bau zu entscheiden:** (i) die Tabelle ist aus GLAMOS abgeleitet — dieselbe offene Lizenzfrage wie E-GM-37/38, sie bliebe bis zur Antwort von GLAMOS lokal; (ii) ob vorher Gitter + Gelände zusammen mit neuer eingefrorener Regel gemessen werden (V-GM-112); (iii) `c` und `β` hängen an `TF`/`SRF` (V-GM-89) — nach einer Neueichung der Schmelze ist die Runde zu wiederholen.

Für Österreich und Deutschland: nicht bauen, der Landeswert bleibt.

## 9. Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-110 | Q20 liegt lokal in Version 1.0 mit um 2 000 m falsch beschriftetem Nordwert; Version 1.1 (09.11.2026, Record 24088217) ist berichtigt. Die Prüfung am Höhenmodell hat ein breites Maximum (1 500 m 0,840, 2 000 m 0,838) — sie bestätigt die Richtung, trennt 1 500 und 2 000 m aber nicht | ein Bau ohne Handkorrektur · vor GM-10b Version 1.1 laden (6,3 GB) und an den 32 Gletschern x1 gegen diese Runde vergleichen |
| V-GM-111 | `gm5b-report.json` im Repo trägt die Zeilen je Winter nicht (`perWinterRows: 478`); die Grundlinien jeder Folgerunde hängen am lokalen Original `gm3\report-fit2.json` | eine nachrechenbare Grundlinie · die Zeilen (abgeleitete Fehlerwerte, keine GLAMOS-Zeile) nach der Lizenzantwort von GLAMOS ins Repo, oder die Grundlinien je Runde neu rechnen |
| V-GM-112 | x1 ist in der Schweiz unabhängig von der Höhe (r = −0,04); Gelände (Höhe, Exposition) trägt für sich 12 % — die Kombination ist nicht gemessen | vielleicht mehr als ein Drittel der Lücke · neue eingefrorene Regel: G1 + zMed + north, ein Gletscher ausgelassen, gegen G1 allein |
| V-GM-113 | x1 ist mit den Höhenstufen der Wahrheit (GLAMOS) gerechnet; ein Gletscher ohne Messung hat nur die Hypsometrie des Builds | ein Prädiktor, der für alle Gletscher gleich entsteht · in GM-10b mit der Hypsometrie rechnen und an den 32 vergleichen |
| V-GM-114 | Schneewasser relativ zur Region (x2) trägt nicht und schadet in Österreich | keine falsche Normierung im Bau · x2 nicht weiter verfolgen |
| V-GM-115 | Die vier deutschen Gletscher liegen in jeder Geländegröße außerhalb der Eichspanne | keine Verlängerung über die Daten · Deutschland behält den Landeswert, bis eine Winterbilanz vorliegt |
| V-GM-116 | Mont Collon (eigener Faktor an der Grenze 5) hebt jeden Mittelwert um rund 40 mm; die Urteile hängen nicht an ihm | ehrliche Zahlen · in künftigen Runden einen Gletscher an der Grenze vorab aus der Wertung nehmen (Regel) |
| V-GM-117 | Windexposition (tpi1k) und Lawineneinzug (D8-Näherung) tragen nichts — die Näherung ist grob (GLO-30 ist eine Oberfläche mit Eis, Fenster 3 km, kein Abgang) | nicht weiter verfolgen ohne besseres Modell |

## 10. Nicht gemessen

Gitter und Gelände zusammen; die Form je Stufe; Gletscher ohne Messung (nichts gerechnet); der Winter 2025/26; Q20 Version 1.1. Kein Producer-Lauf, keine Mutationsrunde, nichts im Daten- oder Archiv-Repo, kein Commit. (Gitter + Gelände und Q20 v1.1: gemessen in Schritt 0b, §11.)

## 11. Schritt 0b — Schlägt Gitter + Gelände das Gitter allein? (25.11.2026, nur Messung)

> Auftrag (Jan, 25.11.): an denselben 32 Schweizer und 8 österreichischen Gletschern messen, ob G1 + Medianhöhe (C1) oder G1 + T3 (C2) das Gitter allein schlägt, ein Gletscher ausgelassen. Schweiz gewertet, Österreich nur berichtet, dazu die vorsichtige Variante (E-GM-42). Nebenher Q20 Version 1.1. Kein Producer-Code, nichts veröffentlicht.
>
> Werkzeuge (neu, nur in diesem Ordner): `gm10b-combine.mjs` (synthetischer Test, gewerteter Lauf; importiert Daten, Prädiktoren, Anpassung und Auslassen unverändert aus `gm10-factor.mjs`), `gm10b-q20-versions.py` (Stichprobe v1.0 gegen v1.1); `gm10-q20.py` hat drei Schalter für v1.1 bekommen und liest die Nordwerte jetzt in beiden Reihenfolgen (mit v1.0 nachgerechnet: Ausgabe Byte für Byte gleich). Regel: `gm10b-method-frozen.md` (Hash in `gm10b-method-frozen.sha256`). Voller Bericht mit Werten je Gletscher NUR lokal: `C:\dev\buscosun-glacier-cache\gm10\report-0b.json`.

### 11.1 Reihenfolge und Belege

1. **Synthetischer Wiederfindungstest** (vor dem Einfrieren; echte x1 und zMed der 32 Schweizer Gletscher, echte Tabellen, erfundene Winterbilanzen, ε ~ N(0; 0,2), 100 Vertauschungen; `gm10\synthetic-0b.json`):

   | Fall | Kandidat | β gefunden (x1, zMed) | s2 Kandidat / G1 | Gewinn gegen G1 | eine Vertauschung | p | p10 | Urteil | Wahl |
   |---|---|---|---|---|---|---|---|---|---|
   | kombiniert (wahr 0,25 / 0,20) | C1 | **0,254 / 0,210** | 266,5 / 368,1 | 27,6 % | −2,2 % | 0,01 | 0,215 | trägt | **C1** (C2 vorn nur 0,2 mm < 18,4 mm) |
   | | C2 | 0,246 / 0,211 (north, lnArea 0,009 / 0,016) | 266,3 / 368,1 | 27,7 % | −5,0 % | 0,01 | 0,214 | trägt | |
   | nur Gitter (wahr 0,25 / 0) | C1 | 0,258 / 0,012 | 270,8 / 270,5 | −0,1 % | −0,1 % | 0,15 | −0,005 | trägt nicht | **G1** |
   | | C2 | — | 272,9 / 270,5 | −0,9 % | 0,0 % | 0,42 | −0,015 | trägt nicht | |

2. **Regel eingefroren** 25.11. 09:52:19 UTC: `gm10b-method-frozen.md`, sha256 `cffb09ee9c635f10c481951801f5587b852e88c466c436fd2440fa7c862afd31`; Werkzeug `gm10b-combine.mjs` sha256 `4351e161…` (steht im Bericht).
3. **Gewerteter Lauf** 09:52:25–10:01:58 UTC. G1 neu gerechnet gibt Schritt 0 genau wieder (CH 334,8, AT 341,1); T3 aus den Faktoren von Schritt 0 auf denselben Gletschern 347,0 (CH) und 375,2 (AT).

### 11.2 Schweiz (gewertet; 32 Gletscher, 377 Winter; s2 in mm Wasserwert, exakt mit dem Kern)

| Form | s2 | Gewinn gegen G1 | gegen a′ | Lücke a → b geschlossen | Lücke G1 → b geschlossen | besser / schlechter als G1 (Gletscher) | eine Vertauschung (nur Gelände) | Vertauschung p (200) | p10 / p90 (Ziehungen) | **Urteil** |
|---|---|---|---|---|---|---|---|---|---|---|
| a Landeswert GM-5b | 402,3 | | | | | | | | | |
| a′ Landeswert (gleiche Größe) | 406,1 | | | | | | | | | |
| T3 allein (Faktoren aus Schritt 0) | 347,0 | −3,6 % | 14,6 % | 28 % | — | 17 / 15 | | | | |
| G1 allein | 334,8 | 0 | 17,6 % | 35 % | 0 | — | | | | |
| **C1** G1 + Medianhöhe | 326,7 | 2,4 % | 19,6 % | 39 % | 6 % | 18 / 14 | −3,5 % | 0,085 | −7,7 / 12,0 % | **trägt nicht** (Gewinn < 5 %, p, p10) |
| **C2** G1 + T3 | **276,4** | **17,4 %** | 31,9 % | **65 %** | **46 %** | **22 / 10** | −3,5 % | **0,005** | 6,9 / 27,5 % | **trägt** |
| b eigener Faktor | 207,7 | | | | | | | | | |

**Urteil des Skripts: C2 trägt, C1 nicht; gewählt C2** („nur C2 trägt“). Koeffizienten von C2 (Median über die Auslassungen, je Streuung): x1 **+0,24**, Medianhöhe −0,06, Nord +0,06, **ln Fläche −0,10** — alle stabil über die 32 Auslassungen (p10–p90 je ≤ 0,02 breit). In C1: x1 +0,20, Medianhöhe −0,12.

**Beschreibend, ändert kein Urteil (aus den Zeilen je Gletscher des Berichts):**
- **Ohne Mont Collon** (Faktor an der Grenze 5): a′ 366,2 · G1 314,0 · C1 290,7 (**+7,4 %** gegen G1) · C2 251,7 (**+19,8 %**). C1 scheitert an der Regel also vor allem an Mont Collon (V-GM-116 wirkt hier); C2 trägt mit und ohne ihn.
- **Woher der Gewinn von C2 kommt:** verteilt — der größte Einzelbeitrag ist ein Viertel der Summe. Am meisten gewinnen die beiden kleinsten Gletscher (0,01 und 0,03 km², an EINER bzw. der nächsten 250-m-Zelle), an denen G1 den Faktor deutlich zu klein schätzt; ein Gletscher von 0,22 km² wird dagegen deutlich schlechter. Lesart: die Fläche korrigiert vor allem, was eine 250-m-Zelle an einem sehr kleinen Gletscher falsch sieht (V-GM-118).
- **Streuung des Vorhersagefehlers** `ln(F̂ / F_eigen)` ohne Mont Collon (31 Gletscher): Landeswert 0,27 · G1 0,20 · C1 0,17 · **C2 0,13** — in Faktoren ±14 % statt ±22 % (G1) und ±31 % (Landeswert).
- Die vorsichtige Variante (E-GM-42) auf die Schweiz angewandt (nur zum Vergleich): C2 vorsichtig 304,6, besser als a′ an 28 von 32 Gletschern; G1 vorsichtig 350,6.

### 11.3 Österreich (berichtet, nicht gewertet; 8 Gletscher, 87 Winter)

| Form | s2 | gegen G1 | gegen a′ (411,3) | gegen a (425,3) | besser / schlechter als G1 | eine Vertauschung | p (200) |
|---|---|---|---|---|---|---|---|
| G1 | 341,1 | 0 | 17,1 % | 19,8 % | — | | |
| C1 | 351,1 | −2,9 % | 14,6 % | 17,5 % | 5 / 3 | −6,1 % | 0,35 |
| C2 | 442,2 | **−29,6 %** | −7,5 % | −4,0 % | 3 / 5 | −29,6 % | 0,72 |
| T3 (Faktoren aus Schritt 0) | 375,2 | −10,0 % | 8,8 % | 11,8 % | 3 / 5 | | |

Fünf Parameter an sieben Trainings-Gletschern tragen nicht; das Gelände bringt in Österreich zu G1 nichts.

**Vorsichtige Variante (E-GM-42)** — `ln F = ½ ln F̂ + ½ ln F_Land`, gekappt an die eigenen Faktoren der sieben Trainings-Gletscher (Spanne 1,9–3,1):

| Grundlage | s2 | gegen a′ | gegen a | besser / schlechter als a′ (Gletscher) | gekappt | schlechter um (je Winter) |
|---|---|---|---|---|---|---|
| G1 vorsichtig | **354,3** | **13,9 %** | 16,7 % | **6 / 2** | 0 | 11 mm und 6 mm |
| C1 vorsichtig | 353,5 | 14,1 % | 16,9 % | 6 / 2 | 1 | 3 mm und 2 mm |
| C2 vorsichtig | 364,3 | 11,4 % | 14,3 % | 6 / 2 | 1 | 48 mm und 67 mm |

Die Liste je Gletscher steht im lokalen Bericht (`countries.AT.cautious.*.perGlacier`).

**Geteilte SNOWGRID-Zellen** (Zellendatei der Phase GN `20261120-1.1`): von 799 österreichischen Gletschern teilen sich **342** eine 1-km-Zelle mit einem anderen Gletscher. Unter den acht Eichgletschern teilen sich **keine zwei** eine Zelle; einer (Mullwitzkees) teilt eine seiner drei Zellen mit einem nicht vermessenen Gletscher; vier hängen an einer einzigen Zelle (Goldbergkees nur an der nächsten).

**Deutschland:** keine Vorhersage. Die vier deutschen Gletscher (Region `de`) rechnen heute mit **F = 1,854** aus `scripts/glacier/snow-calibration.json` (`fOrigin: transferred`, `fFrom: all` = aus Schweiz und Österreich zusammen übertragen), mal Brücke 1 (`applied: false`); zum Vergleich Schweiz 1,793, Österreich 2,326.

### 11.4 Q20 Version 1.1 (V-GM-110)

- Geladen nach `C:\dev\buscosun-glacier-cache\gm10\q20-v1.1\` (Record 24088217, Version 1.1 vom 09.11.2026): elf Dateien, 5,9 GB, **alle md5 stimmen**. Die Archive heißen jetzt `OSHD_DATA_WY_<Jahr>.zip`.
- **Stichprobe** (`gm10\q20-versions.json`; Oktober 2016, April 2020, Mai 2024, je erster, mittlerer, letzter Tag): Ostwerte gleich; **v1.1 speichert die Nordwerte aufsteigend** (v1.0 absteigend); an derselben Koordinate (v1.0 + 2 000 m) sind `swe` und `hs` **Zelle für Zelle gleich** (928 155 Zellen mit Wert, größte Abweichung 0, gleiche Maske); Gegenprobe ohne Verschiebung: mittlere Abweichung bis 94 mm SWE.
- **Prädiktoren neu gerechnet mit v1.1** (ohne Verschiebung): Zellen, Zellzahl, Zellhöhen, jeder SWE-Wert je Gletscher und Winter und alle Regionsmittel **gleich** an allen 44 Gletschern. Höhenprobe von v1.1: Maximum bei 0 m (0,838). ⇒ x1 und x2 ändern sich nicht; nach Regel §6 werden Schritt 0 und 0b **nicht** wiederholt. V-GM-110 ist geschlossen; für einen Bau Version 1.1 benutzen (keine Handkorrektur).

### 11.5 Lesart (meine, nach dem Lauf)

- **Gitter und Gelände zusammen tragen in der Schweiz deutlich mehr als jedes allein:** 276 mm statt 335 (G1) bzw. 347 (T3); zwei Drittel der Lücke zwischen Landeswert und eigenem Faktor sind geschlossen statt ein Drittel. Das ist mehr, als die beiden einzelnen Gewinne erwarten ließen — der Geländeteil wirkt hier vor allem als Korrektur von x1, nicht als eigene Information (ln Fläche allein 3 %, in C2 der stärkste Geländeterm).
- **Die Medianhöhe allein reicht nicht** (C1 +2,4 %, ohne Mont Collon +7,4 %).
- **Vorsicht vor dem Bau:** der Flächenterm hängt an der Zellgröße des Gitters (250 m in der Schweiz). Er ist mit x1 aus den GLAMOS-Höhenstufen gelernt; mit x1 aus der Hypsometrie des Builds (V-GM-113) kann er sich verschieben. Der eine stark verschlechterte Gletscher zeigt, dass einzelne Vorhersagen weit danebenliegen können.
- **Österreich:** keine Kombination trägt; die vorsichtige Variante von G1 ist an sechs von acht Gletschern besser als der Landeswert und an zwei nur wenig schlechter.

### 11.6 Vorschlag

- **Schweiz: C2 (G1 + Medianhöhe + Exposition + ln Fläche)** als Form von GM-10b, Schalter aus, wie in §8 beschrieben — mit zwei Ergänzungen: (i) vor dem Bau `c` und `β` mit x1 aus der Hypsometrie des Builds neu anpassen und an den 32 Gletschern gegen diese Runde vergleichen (V-GM-113, V-GM-118); (ii) Spanne des vorhergesagten Faktors aus der Streuung von C2 (0,13 in ln ohne Mont Collon), und die Spanne der Eichgletscher in Fläche, Höhe und x1 als Grenze — ein Gletscher außerhalb behält den Landeswert. Die 35 vermessenen behalten ihren eigenen Faktor; Lizenzfrage GLAMOS wie E-GM-37/38.
- **Österreich:** nicht entscheidbar; mein Vorschlag: Landeswert behalten. Falls dort überhaupt etwas, dann **nur G1 vorsichtig** (E-GM-42), hinter eigenem Schalter (aus) — nicht C1, nicht C2.
- **Deutschland:** keine Vorhersage; bleibt bei 1,854 (Region `de`).

### 11.7 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-118 | Der Gewinn von C2 kommt zu einem großen Teil vom Flächenterm, der x1 an sehr kleinen Gletschern korrigiert (dort sieht eine 250-m-Zelle den Gletscher kaum); ein mittelgroßer Gletscher wird dadurch deutlich schlechter | ein Bau, der nicht an einem Gitterartefakt hängt · in GM-10b x1 mit der Hypsometrie rechnen (V-GM-113), C2 neu anpassen und Fläche gegen „Zahl der Zellen im Umriss“ als Prädiktor vergleichen (neue eingefrorene Regel) |
| V-GM-119 | C1 scheitert an der Regel vor allem an Mont Collon (ohne ihn +7,4 % gegen G1, über der Schwelle) | ehrliche Lesart des Urteils · bestätigt V-GM-116: in der nächsten Regel Gletscher an der Suchgrenze vorab aus der Wertung nehmen |
| V-GM-120 | In Österreich schadet jedes zusätzliche Gelände (C2 −30 % gegen G1); fünf Parameter an sieben Trainings-Gletschern | keine Form, die nur an acht Gletschern hängt · in Österreich höchstens G1 vorsichtig; mehr erst mit weiteren Winterbilanzen |
| V-GM-121 | Q20 v1.1 speichert die Nordwerte aufsteigend; die Werte sind gleich v1.0 + 2 000 m; `gm10-q20.py` liest beide Reihenfolgen (v1.0 Byte für Byte gleich nachgerechnet) | ein Leser, der bei einer neuen Version nicht still falsche Zellen nimmt · im Bau die Reihenfolge aus den Koordinaten lesen, nie annehmen; V-GM-110 geschlossen |

### 11.8 Nicht gemessen

Schrumpfung (nach Regel bewusst keine); x1 aus der Hypsometrie des Builds; andere Geländekombinationen als C1/C2 (z. B. x1 + Fläche allein — wäre eine neue Regel); Gletscher ohne Messung. Kein Producer-Lauf, keine Mutationsrunde, nichts im Daten- oder Archiv-Repo, kein Workflow, kein Push, kein Commit.
