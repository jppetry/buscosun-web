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

Gitter und Gelände zusammen; die Form je Stufe; Gletscher ohne Messung (nichts gerechnet); der Winter 2025/26; Q20 Version 1.1. Kein Producer-Lauf, keine Mutationsrunde, nichts im Daten- oder Archiv-Repo, kein Commit.
