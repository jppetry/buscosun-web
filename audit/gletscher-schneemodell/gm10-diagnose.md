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

## 12. GM-10b, Größenmessung vor dem Bau (25.11.2026, **post hoc** — folgt V-GM-118; nur Messung)

> Auftrag E-GM-43 (Jan, 25.11.): vor dem Bau von C2 messen, ob der Größenterm ein Gitterartefakt ist — A = C2 wie gemessen, B = C2 mit `ln(1 + Zellen im Umriss)` statt Fläche, C = C2 ohne Größe; gleiche Wertung wie 0b; Fehler je Größenklasse; Pizol, Schwarzwasserfirn, Sex Rouge benannt; Größenverteilung der Zielgletscher. Die gebaute Variante wählt die Regel. Anhalten vor dem Bau.
>
> Werkzeuge (neu): `gm10b-cells.py` (Zellen im L1-Umriss aller 1 291 Schweizer Gletscher, Q20 v1.1; Gegenprobe an 36 Gletschern der Wahrheit gleich Schritt 0), `gm10b-size.mjs` (importiert Wertung und Bedingungen unverändert aus `gm10b-combine.mjs`). Regel `gm10b-size-method-frozen.md`, sha256 `d45627b2184e1cfefc848552b514795ae31620ebeaa5be433bf47e6a5116748a`, eingefroren 25.11. 11:23:41 UTC; Werkzeug sha256 `16bb6b94…`. Bericht mit Werten je Gletscher NUR lokal: `C:\dev\buscosun-glacier-cache\gm10\report-size.json`.

### 12.1 Reihenfolge

1. Zellen gezählt (liest keine Winterbilanz). 2. **Synthetischer Test** vor dem Einfrieren (`gm10\synthetic-size.json`): ohne Größeneffekt ⇒ **C** gewählt (A/B/C je 282 mm, G1 364); mit Zelleneffekt (−0,20) ⇒ **B** gewählt (β gefunden −0,19; B 274, A 280, C 375, G1 478). A und B sind synthetisch kaum zu trennen. 3. Regel eingefroren. 4. Erster gewerteter Lauf 11:23 UTC vom System wegen Speichermangel abgebrochen (während B, nichts geschrieben, keine Zahl gesehen); auf Jans Wort neu gestartet 12:18–12:32 UTC mit derselben Regel.

### 12.2 Varianten (32 Gletscher, 377 Winter; s2 mm, exakt; a 402,3 · a′ 406,1 · **G1 334,8** · b 207,7)

| Variante | s2 | gegen G1 | eine Vertauschung | p (200) | p10 | besser / schlechter als G1 | β (x1, zMed, north, Größe) | Urteil |
|---|---|---|---|---|---|---|---|---|
| A = C2 (ln Fläche) | **276,4** | 17,4 % | −3,5 % | 0,005 | 6,9 % | 22 / 10 | 0,24 / −0,06 / 0,06 / −0,10 | trägt |
| B = C2 mit ln(1 + Zellen) | 285,2 | 14,8 % | −4,0 % | 0,005 | 3,9 % | 21 / 11 | 0,24 / −0,07 / 0,06 / −0,08 | trägt |
| **C** = ohne Größe | 297,2 | 11,2 % | −2,0 % | 0,005 | 0,6 % | 22 / 10 | 0,22 / −0,10 / 0,08 | trägt |

**Wahl des Werkzeugs: C** — „A schlägt B nur um 8,8 mm < 16,7 mm ⇒ B; B schlägt C nur um 12,0 mm < 16,7 mm ⇒ C“. A gibt Schritt 0b genau wieder (276,4).

### 12.3 Größenklassen (s2 mm; Klasse nach Zellen im Umriss)

| Klasse | Gletscher / Winter | a′ | G1 | A | B | C | b |
|---|---|---|---|---|---|---|---|
| K1 eine Zelle (0–1) | 4 / 37 | 489,2 | 521,1 | **194,8** | 239,0 | 362,4 | 156,7 |
| K2 2–4 Zellen | 6 / 60 | 658,2 | **470,8** | 495,3 | 517,1 | 514,6 | 315,5 |
| K3 ≥ 5 Zellen | 22 / 280 | 341,1 | 281,0 | 240,3 | 241,6 | 242,0 | 191,4 |

**Mindestgröße (Werkzeug): 5 Zellen** — K3 qualifiziert (C 242,0 ≤ G1 281,0), K2 nicht (C 514,6 > G1 470,8), die Kette bricht dort ab. Ohne Mont Collon (beschreibend; er liegt in K2): K2 G1 343,4 · A 351,9 · B 360,6 · **C 316,6** — dann hätte auch K2 qualifiziert, und C wäre in K1 ebenfalls besser als G1 (362,4 gegen 521,1).

**Mit Schutz (beschreibend, §7 der Regel):** C an 22 Gletschern, G1 an 10 (unter der Mindestgröße), kein Gletscher außerhalb der Spanne von x1/zMed/north, 2 gekappt: **314,2 mm, 6,1 % besser als G1** (K3 249,0 gegen 281,0; K1 und K2 = G1).

**Die drei benannten Gletscher** (Werte nur im lokalen Bericht): Pizolgletscher (K1, 1 Zelle) und Schwarzwasserfirn (K1, keine eigene Zelle) werden in jeder Variante deutlich besser als mit G1, am meisten mit A, am wenigsten mit C; Glacier du Sex Rouge (K2, 3 Zellen) wird in **jeder** Variante deutlich schlechter als mit G1 — auch in C, also nicht nur durch den Größenterm.

**Streuung des Vorhersagefehlers** ln(F̂ / F_eigen), ohne Mont Collon: G1 0,20 · A 0,13 · B 0,14 · C 0,16.

### 12.4 Größenverteilung

| | Zahl | 0 Zellen | 1 Zelle | K1 | K2 | K3 | Fläche q25 / q50 / q75 (km²) | Median Zellen |
|---|---|---|---|---|---|---|---|---|
| Eichgletscher | 32 | 1 | 3 | 4 | 6 | 22 | 0,208 / 1,896 / 5,305 | 28,5 |
| Zielgletscher (ohne die 35 mit eigenem Faktor) | 1 256 | 328 | 295 | **623** | 302 | **331** | 0,031 / 0,086 / 0,292 | 2 |

Höchstens so klein wie Pizol (0,014 km²) — und damit kleiner als jeder Eichgletscher: **94** Zielgletscher; wie Schwarzwasserfirn (0,029 km²): 296; wie Sex Rouge (0,222 km²): 876 (in Zellen: 867 mit ≤ 3 Zellen).

### 12.5 Lesart (meine, nach dem Lauf)

- Nach der Regel wird **C** gebaut, ab **5 Zellen**; darunter G1. Das trifft **331 von 1 256** Schweizer Zielgletschern; 925 rechnen mit G1. An den Eichgletschern erwartet: 6 % besser als G1 statt 17 % mit A ohne Schutz.
- Der Größenterm ist nicht nur Artefakt, aber auch nicht sauber: A schlägt C um 20,8 mm (über der Schwelle); die Regel kam an A nicht vorbei, weil sie bei Gleichstand B vorzieht und B C nicht schlägt (V-GM-122). Der Gewinn von A sitzt in K1 — vier Gletscher.
- Die Mindestgröße hängt an Mont Collon (V-GM-123). Halb so viele Zielgletscher, wie es gibt, liegen in einer Klasse, über die vier Eichgletscher urteilen (V-GM-124).

### 12.6 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-122 | Die Wahl ging A → B → C: A schlägt C um 20,8 mm (> 16,7), wurde aber vorher von B verdrängt (Vorliebe für die beschränkte Größe) | ehrliche Lesart der Wahl · nur mit neuer Regel und Jans Wort anders; mit x1 aus der Hypsometrie neu messen (V-GM-113), bevor der Größenterm ganz fällt |
| V-GM-123 | Die Mindestgröße 5 Zellen kommt aus K2, und K2 kippt an Mont Collon (ohne ihn wäre C in K2 und K1 besser als G1 ⇒ keine Mindestgröße) | eine Grenze, die nicht an einem Gletscher an der Suchgrenze hängt · V-GM-116 in die nächste Regel: Gletscher an der Grenze vorab aus der Klassenprüfung |
| V-GM-124 | 623 von 1 256 Zielgletschern haben höchstens eine Zelle, 94 sind kleiner als jeder Eichgletscher; unter den Eichgletschern sind es 4 bzw. 0 | wissen, wofür die Eichung spricht · Klassen K1/K2 bleiben bei G1 (Regel), bis mehr kleine Gletscher mit Winterbilanz vorliegen |
| V-GM-125 | Sex Rouge wird in jeder Variante schlechter als mit G1, auch ohne Größenterm | eine Grenze des Geländeteils · nach dem Bau im lokalen Bericht verfolgen; ggf. Exposition/Höhe am Plateaugletscher prüfen |

Kein Producer-Code, keine Mutationsrunde, nichts im Daten- oder Archiv-Repo, kein Push. Committet auf Jans Wort (E-GM-44); V-GM-122 und V-GM-123 ergeben keine neue Regel (E-GM-44, Punkt 2: beide Abweichungen gingen in die vorsichtige Richtung).

### 12.7 Tabelle je Größenklasse vor dem Bau (E-GM-44 Punkt 3; beschreibend)

Werkzeug `gm10b-shrunk.mjs` (neu, importiert Daten, Kern, Prädiktoren und Auslassen unverändert); einziger neu gewerteter Lauf: **C geschrumpft** = halber Weg von C zum Landeswert in ln (`ln F = 0,5 · ln F̂_C + 0,5 · ln a′` desselben Durchgangs, wie die vorsichtige Form E-GM-42), dann an [min, max] der eigenen Faktoren der Trainings-Gletscher ohne Suchgrenze gekappt (wie §7 der Größenregel); ein Gletscher ausgelassen, s2 exakt mit dem Kern. Wiedergabe geprüft: a′, G1, C, b je Klasse gleich `report-size.json` (±0,05 mm), mit und ohne Mont Collon — sonst bricht das Werkzeug ab. Ohne Mont Collon: seine Zeilen fehlen in den Mitteln, die Anpassungen bleiben (wie die Empfindlichkeit in §12.3). Gekappt: 0 Gletscher. Werte je Gletscher nur lokal (`C:\dev\buscosun-glacier-cache\gm10\report-shrunk.json`).

s2 in mm Wasserwert. **a** = heutiger Landeswert 1,79 (Live), a′ = Landeswert desselben Auslassens, b = eigener Faktor.

| Klasse | Mont Collon | Gletscher / Winter | a (Landeswert) | a′ | G1 | C | **C geschrumpft** | b (eigener Faktor) |
|---|---|---|---|---|---|---|---|---|
| K1 eine Zelle | mit = ohne | 4 / 37 | 491,0 | 489,2 | 521,1 | 362,4 | **357,4** | 156,7 |
| K2 2–4 Zellen | mit | 6 / 60 | 660,3 | 658,2 | 470,8 | 514,6 | **540,6** | 315,5 |
| K2 2–4 Zellen | ohne | 5 / 53 | 412,5 | 412,7 | 343,4 | 316,6 | **310,0** | 227,8 |
| K3 ≥ 5 Zellen | mit = ohne | 22 / 280 | 335,3 | 341,1 | 281,0 | 242,0 | 270,0 | 191,4 |
| alle | mit | 32 / 377 | 402,3 | 406,1 | 334,8 | 297,2 | 321,6 | 207,7 |
| alle | ohne | 31 / 370 | 361,9 | 366,2 | 314,0 | 264,7 | 284,4 | 193,1 |

Je Gletscher (Zählung, keine Werte): C geschrumpft besser als a an 3 von 4 Gletschern in K1 (schlechter: Pizolgletscher) und an 5 von 6 in K2 (schlechter: Glacier du Sex Rouge). Zielgletscher kleiner als jeder Eichgletscher (Fläche unter Pizol): 94, alle in K1.

**Jans Regel E-GM-44 Punkt 4, angewendet (Jans Entscheidung, kein Urteil eines Skripts):** C geschrumpft schlägt den Landeswert in K1 (357,4 gegen 491,0) und in K2 (540,6 gegen 660,3; ohne Mont Collon 310,0 gegen 412,5) — mit a wie mit a′. Damit fiele der Bau für Gletscher unter 5 Zellen auf **C geschrumpft**, außer den 94 Zielgletschern unter der kleinsten Eichfläche (Landeswert). Angehalten vor dem Bau; Jans Wort steht aus.

## 13. GM-10b — Bau: vorhergesagter Faktor für Schweizer Gletscher (25.11.2026)

> Auftrag (Jan, 25.11., E-GM-44): entscheiden, bauen, prüfen in einem Zug; nur die Schweiz (Österreich und Deutschland behalten den Landeswert); buscosun Fusion nur gelesen; Schalter aus; Tabelle nur im lokalen Zwischenspeicher (GLAMOS-Lizenz offen). **Nachtrag 25.11. abends: GLAMOS hat die Nutzung bestätigt; die Tabelle liegt jetzt im Repo (§13.9).**
>
> Werkzeuge: `scripts/glacier/snowcal-predict.mjs` (Modi `forcing`, `x1`, `check-x1`, `table`), `scripts/glacier/py/snowcal_predictors.py` (Q20 v1.1 und Exposition je Gletscher), Vertrag und Leser `scripts/glacier/lib/snowcalPredict.mjs`, synthetische Fixture `scripts/lib/fixtures/glacier/snowcal-predicted.json`; Messwerkzeuge in diesem Ordner: `gm10b-shrunk.mjs` (Schritt 1), `gm10b-refit.mjs` (Neuanpassung nach der eingefrorenen Größenregel), `gm10b-pairs-factor.mjs` (3e), `gm10b-pairs24.mjs` (V-GM-107), `gm10b-mutations.mjs` (3f). Werte je Gletscher NUR lokal: `C:\dev\buscosun-glacier-cache\gm10\predict\` (`table.json`, `table-report.json`, `refit.json`), Volläufe `…\gm10\full\`.

### 13.1 Schritt 1 — Tabelle je Größenklasse und Jans Regel

Die Tabelle steht in §12.7 (s2 in mm, ein Gletscher ausgelassen; a = Landeswert 1,79, b = eigener Faktor):

| Klasse | Mont Collon | a | G1 | C | **C geschrumpft** | b |
|---|---|---|---|---|---|---|
| K1 eine Zelle | mit = ohne | 491,0 | 521,1 | 362,4 | **357,4** | 156,7 |
| K2 2–4 Zellen | mit | 660,3 | 470,8 | 514,6 | **540,6** | 315,5 |
| K2 2–4 Zellen | ohne | 412,5 | 343,4 | 316,6 | **310,0** | 227,8 |
| K3 ≥ 5 Zellen | mit = ohne | 335,3 | 281,0 | 242,0 | 270,0 | 191,4 |

**Angewandt — Jans Entscheidung (E-GM-44, 25.11.), kein Urteil eines Skripts:** C geschrumpft schlägt den Landeswert in beiden kleinen Klassen ⇒ unter 5 Zellen wird **C geschrumpft** gebaut (halber Weg zum Landeswert in ln), ab 5 Zellen **C** voll; kleiner als jeder Eichgletscher (unter Pizol, 0,0143 km²) ⇒ Landeswert; x1, Medianhöhe oder Exposition außerhalb der Eichspanne ⇒ Landeswert; jeder vorhergesagte Faktor an die eigenen Faktoren der Eichgletscher (ohne Mont Collon an der Suchgrenze, 1,107–3,558) gekappt; Gletscher mit eigenem Faktor behalten ihn (GM-5b). Alle Schwellen `set` (`SNOW_FACTOR_RULE` in `lib/snowcalPredict.mjs`). Die Regel des Zustands der kleinen Gletscher steht in der Tabelle (`smallClasses.rule = 'shrunk'` mit den Zahlen von Schritt 1).

### 13.2 Antrieb und x1 für alle Schweizer Gletscher (wie in der Eichung)

- **Q20 v1.1 und Exposition** für alle 1 291 Schweizer Katalog-Gletscher (`snowcal_predictors.py`, 18 s für die Eichgletscher, rund 4 min für alle). **Gegenprobe:** an den 36 Gletschern der Wahrheit Exposition 36 von 36 gleich `terrain.json` (Schritt 0), Zellen gleich `cells-ch.json`, 292 Winterwerte gleicher Fenster gleich Schritt 0 (v1.0 + 2 000 m).
- **Antrieb** nach der Stationsregel von GM-3 (nächste SwissMetNet-Station ≤ 30 km, ≤ 1 800 m Höhenunterschied, ≥ 90 % der Stunden der zehn Q20-Winter), Temperatur und Strahlung derselben Station, RhiresD an der nächsten 1-km-Zelle: **alle 1 291 Gletscher haben eine Station** (49 Stationen). An drei der 32 Eichgletscher wählt die Regel jetzt eine andere Station als GM-3 (Schwarzwasserfirn, St. Annafirn: GUE → ANT; Vadret Pers: COV → BEH), weil sie nach der Katalog-Medianhöhe und den Q20-Wintern urteilt (V-GM-126).
- **x1 des Builds:** die Bänder der Hypsometrie des Builds (50 m), das feste Fenster 1. Oktober 00 UTC … 1. Mai 00 UTC (ein Gletscher ohne Messung hat kein Wahrheitsfenster), Schmelzkern des Betriebs. Die Suche nach k läuft als Bisektion auf demselben Gitter (`kForLazy`): **Gegenprobe an den 36 Gletschern der Wahrheit mit GLAMOS-Stufen und Wahrheitsfenstern: x1 = Schritt 0 an 36 von 36** (rund 8 statt 236 Kernläufe je Winter). Ergebnis: 1 287 von 1 291 Gletschern mit x1 (4 mit weniger als drei Gitterwintern), 76 von 12 910 Gletscherwintern wegen Lücken im Antrieb nicht nutzbar, 10 gekappt.
- **x1 des Builds gegen Schritt 0** an den 32 Eichgletschern: r = 0,813, mittlere Abweichung −0,045; die größte bei Mont Collon (1,446 → 0,388).

### 13.3 Neuanpassung nach der eingefrorenen Größenregel (STOPP-Prüfung 3)

`gm10b-refit.mjs`: Regel `gm10b-size-method-frozen.md` unverändert (Hash geprüft), einziger Unterschied x1 aus §13.2. Der erste Anlauf wurde vom System wegen Speichermangels beendet (15:21 MEZ, zweiter solcher Stopp am Tag); auf Jans Wort neu gestartet, allein gelaufen (15:26–15:40 MEZ, Prozess ≈ 240 MB, frei 1,0–2,6 GB).

| Schweiz (32 Gletscher, 377 Winter) | s2 | gegen G1 | eine Vertauschung | p (200) | p10 | besser / schlechter als G1 | Urteil |
|---|---|---|---|---|---|---|---|
| a / a′ | 402,3 / 406,1 | | | | | | |
| G1 (x1 des Builds) | 358,3 | — | | | | | |
| A = C2 | 295,1 | 17,6 % | −2,4 % | 0,005 | 7,3 % | 22 / 10 | trägt |
| B | 298,4 | 16,7 % | −2,6 % | 0,005 | 6,1 % | 22 / 10 | trägt |
| **C** | **313,1** | **12,6 %** | +0,4 % | 0,005 | 2,0 % | 21 / 11 | **trägt** |

**Wahl des Werkzeugs: C** („A schlägt B nur um 3,3 mm < 17,9 mm ⇒ B; B schlägt C nur um 14,7 mm < 17,9 mm ⇒ C“). **Das Urteil der eingefrorenen Regel ändert sich nicht ⇒ kein STOPP.** G1 wird mit dem x1 des Builds schlechter (358,3 statt 334,8; vor allem Mont Collon). Klassen: K1 C 305,8 gegen G1 497,6 (a 491,0); K2 610,2 gegen 615,1 (a 660,3); K3 250,4 gegen 284,8 (a 335,3). Koeffizienten der Endanpassung (alle 32, je Streuung des Prädiktors): c = 0,599 (e^c = 1,82), β x1 +0,153, Medianhöhe −0,127, Nord +0,082.

### 13.4 Die Tabelle (lokal, `table.json`, sha256 `fadea420…`)

| Grundlage | Gletscher | Fläche km² | Anteil der Schweizer Gletscherfläche (860,1 km²) |
|---|---|---|---|
| `own` (eigener Faktor, GM-5b) | 34 | 184,6 | 21,5 % |
| `predicted` (C, ≥ 5 Zellen) | 249 | 495,5 | 57,6 % |
| `predicted-shrunk` (C halb zum Landeswert, < 5 Zellen) | 416 | 38,2 | 4,4 % |
| `country` (Landeswert 1,793) | 592 | 141,7 | 16,5 % |

Gründe für den Landeswert: außerhalb der Eichspanne 493 (Medianhöhe unter 2 668 m 211, x1 unter −0,098 184, Exposition unter −0,683 128; über der Spanne 18 / 6 / 31; Mehrfachnennung möglich), kleiner als jeder Eichgletscher 94, zu wenige Gitterwinter 4, eigener Faktor an der Suchgrenze 1 (Mont Collon). Kein vorhergesagter Faktor erreicht die Kappung. Faktor je Grundlage p10 / Median / p90: `predicted` 1,39 / 1,88 / 2,38, `predicted-shrunk` 1,57 / 1,85 / 2,14. Jede Zeile trägt Grundlage, Faktor, Spanne (`q`, aus dem Paar ihrer Grundlage) und Zellenzahl; Herkunft `computed`, `verified: false`.

**Spanne je Grundlage (gemessen, ein Gletscher ausgelassen; `own`: ein Winter ausgelassen)** — p10 / p90 von F / F_eigen: `own` 0,986 / 1,016 (n 370 Winter; die Schätzgenauigkeit des eigenen Faktors, nicht sein Fehler auf dem Eis), `predicted` 0,798 / 1,191 (Std. in ln 0,16), `predicted-shrunk` 0,800 / 1,231 (0,17), `country` 0,721 / 1,433 (0,26); je 31 Gletscher ohne Mont Collon.

### 13.5 Verdrahtung (Rule 2: aus, benannter Rückfall)

| Teil | Wo | Was |
|---|---|---|
| Schalter | `melt.mjs`, `lib/snowcalGlaciers.mjs` | `--glacier-factor=off\|on\|predicted` (`GLACIER_SNOW_GLACIER_FACTOR`), Voreinstellung `off` unverändert; `predicted` braucht `--glacier-factor-table=<json>` (`GLACIER_SNOW_GLACIER_FACTOR_TABLE`). Ohne Tabelle, mit unlesbarer, mit einer Tabelle gegen eine andere eigene Tabelle, mit anderem Landeswert, eigenem Faktor als „predicted“, Gletscher außerhalb des Katalogs, ungekapptem Faktor oder Herkunft „measured“: Abbruch mit Grund, nichts geschrieben. Das Dokument nennt Tabelle (Hash), Regel, Herkunft `computed`, Zahlen und Zeilen je Grundlage (`params.precip.glaciers.predicted`), die Statuszeile zählt sie |
| V-GM-91 | `melt.mjs`, `glacierMeltContract.ts` | `melt/state.json` trägt mit dem Faktor-Schalter (`on` oder `predicted`) `fac` = { Regel `<Wort>:<16 hex der Tabelle>`, Faktor je Gletscher, der nicht auf dem Landeswert läuft }. Ein Gletscher, dessen Faktor sich seitdem geändert hat (auch beim Abschalten), beginnt neu (`state.respun`), nie mit Schnee aus zwei Faktoren. Ohne Schalter und ohne `fac` ändert sich kein Byte |
| Neu-Einschwingen | `snowpack-seed.mjs` | `--melt-respin=<melt/state.json>`: die Gletscher, deren Faktor sich mit der neuen Regel ändert, ab 1. Oktober mit dem Kern des Betriebs auf demselben Analyse-Antrieb wie der Startzustand der Schneedecke bis zur Stunde des Zustands neu gerechnet; alle anderen behalten ihren Eintrag Byte für Byte; ohne Antrieb fällt ein Gletscher heraus (der Producer beginnt ihn neu und sagt es) |
| V-GM-86 | `melt.mjs`, `lib/snowpackcore.mjs`, `glacierSnowpackContract.ts`, `snowpack-seed.mjs` | Mit dem Faktor-Schalter rechnet die Schneedecke jeden Gletscher mit dem Faktor seines Schmelzlaufs (auch bei `on`; die Form je Band bleibt beim Schmelzlauf). Der Zustand nennt die Regel (`rules.factor`); ein Lauf setzt nur einen Zustand derselben Regel fort; neuer Startzustand ab 1. Oktober mit `snowpack-seed.mjs --glacier-factor=…`. Mit Spannen nennt der Kopf neben dem einen Paar der Laufstunde das gemessene Paar jeder Grundlage (`now.bases`) |

Die Tabelle geht nicht ins Repo; im Repo stehen Werkzeug, Vertrag, Leser und die synthetische Fixture (erfundene Gletscher des Test-Katalogs).

### 13.6 Prüfung

**a) Wie gebaut, ein Gletscher ausgelassen (32 Gletscher, 377 Winter, s2 mm, exakt mit dem Kern; die Regel in jedem Durchgang):**

| | Gletscher | Landeswert | G1 | C ohne Regel | **wie gebaut** | eigener Faktor |
|---|---|---|---|---|---|---|
| alle | 32 | 396,1 | 358,3 | 313,1 | **353,4** | 190,7 |
| K1 | 4 | 494,0 | 497,6 | 305,8 | **471,7** | 137,8 |
| K2 | 6 | 654,9 | 615,1 | 610,2 | **637,7** | 295,8 |
| K3 | 22 | 327,7 | 284,8 | 250,4 | **276,9** | 175,1 |
| alle ohne Mont Collon | 31 | 355,6 | 318,1 | 267,9 | **310,5** | 175,7 |

(Der Landeswert ist hier der des Betriebs, 1,793; §12.7 nennt 402,3 aus den Zeilen von GM-5b mit 1,821.) Wie gebaut schlägt der Landeswert in jeder Klasse und G1 knapp gesamt (353,4 gegen 358,3) — STOPP-Fall 1 tritt nicht ein. Der Abstand zu C ohne Regel kommt von der Spannen-Regel: im Auslassen liegen die Gletscher am Rand der Eichspanne außerhalb der übrigen 31 und fallen auf den Landeswert (Silvretta x1 höchster ⇒ 950,6 statt G1 498,5; Jöri, Hohsaas, Alphubel N, Pizol) (V-GM-127).

**9 von 32 Gletschern werden schlechter als mit dem Landeswert:** Glacier de la Plaine Morte +232,2 mm (K3, C 2,42 gegen eigen 1,97), Vadret dal Murtèl +213,1 (K3, C 1,42 gegen 1,99), Mont Collon +82,6 (K2, eigener Faktor an der Grenze), dann Sex Rouge +48,4, Schwarzberg +42,4, Allalin +42,2, Otemma +30,7, Gries +8,9, Plan Névé +6,7.

**Glacier du Sex Rouge (V-GM-125):** 3 Zellen (K2), 0,222 km², x1 0,408 (Rang 17 von 32), Medianhöhe 2 789 m (Rang 7, tief), Nord 0,741 (Rang 25, nordseitig). Tiefe Lage und Nordexposition heben die Form C an (2,41 roh, geschrumpft 2,08), sein eigener Faktor liegt aber beim Landeswert (1,82) — ein flacher, windexponierter Plateaugletscher (Diablerets), wie Plaine Morte, der zweite Plateaugletscher unter den schlechter gewordenen. Ihm ähnlich (alle drei Prädiktoren innerhalb ±0,5 Streuung der Eichgletscher): **75 Zielgletscher** (24 `predicted`, 41 `predicted-shrunk`, 10 Landeswert; 27 km²); innerhalb ±1 Streuung 310 (141,8 km²).

**b) Prüfer:** `verify:glacier-snowcal` **54/54** (neu Block I, I1–I7: Vertrag mit 36 Negativkontrollen, Leser von Hand, Regel je Grundlage samt Grenze 5 Zellen, Kappung, Schrumpfung, Spannen- und Flächenregel, x1-Suche gegen die volle Tabelle an 440 Fällen, Anpassung findet bekannte β, Paare von Hand, x1 des Werkzeugs), `verify:glacier-melt` **85/85** (neu Block L, L1–L7: vorhergesagte Faktoren von Hand am Schneezustand, aus = dieselben Bytes auch mit kaputter Tabellendatei daneben, 11 Abbrüche ohne stillen Rückfall, Umgebungsvariablen, V-GM-91 an einer Kette über zwei Läufe in drei Stellungen, Regeln von `fac`, die Kommandozeile reicht die Tabelle durch), `verify:glacier-snowpack` **75/75** (I14 neu: V-GM-86 — Alphas Zeile mit eigenem Faktor 2,5 ist die eines Laufs mit Regionswert 2,5; I15 Verweigerung fremder Faktorregeln; I16 vorhergesagte Faktoren und `now.bases`; I17 Neu-Einschwingen des Schmelzzustands von Hand).

**c) Voller lokaler Lauf, Schalter aus** (Lesesicht `gm4\view-stn`, Cube 21.11., Uhr 21.11. 17:50 UTC, Schalter des Runners: Schneedecke, Paare, Spannen; Code aus Schnappschüssen): HEAD (`git archive`) gegen Arbeitsbaum **33 von 33 Dateien Byte für Byte gleich, Zeiger und Statuszeile gleich**. Negativkontrolle: derselbe Arbeitsbaum mit `predicted` (unten d) unterscheidet sich in 5 Dateien. Das Einschwing-Werkzeug ohne Schalter gibt `seed-1121` an allen 2 019 Gletschern wieder (nur der Bauzeitstempel im Kopf ist anders).

**d) Voller lokaler Lauf, Schalter an** (`--glacier-factor=predicted`, Lesesicht mit dem Startzustand der Schneedecke derselben Regel, `seed-pred`, Regel `predicted:fadea420fc2273ef`): anders sind **genau** `melt/2026112117.json`, `melt/state.json`, `snowpack/2026112117.json`, `snowpack/state.json`, `snowpack/pairs/2026112117.json`; die 28 übrigen (alle Wetterdateien) gleich, Zeiger gleich. Geändert: 8 Schmelzzeilen, 247 Schmelzzustände, 706 Schneedecken-Zeilen — **keine außerhalb der Gletscher mit eigenem oder vorhergesagtem Faktor**. Statuszeile `glacier: { factor 42, shape 0, predicted 249, predictedShrunk 416 }`; `fac` nennt 707 Gletscher (42 eigene inkl. Österreich, 665 vorhergesagt). Faktor gegen den Landeswert an den 699 Schweizer Gletschern mit anderem Faktor: p10 0,834 · Median 1,033 · p90 1,258. Die zehn größten Änderungen: Silvretta +98 % (eigen 3,558), Verstanclagletscher +81 % (vorhergesagt 3,24), Grialetsch W +76 %, Grialetsch E +65 %, Hohsaas −38 % (eigen), Zenbächen −37 % (vorhergesagt 1,13), Sarsura +57 %, Chessjen NW +54 % (eigen), Porchabella +52 %, Glatt Firn +51 %. **Schneehöhe in der Medianhöhe zur Laufstunde** (Schweizer Zeilen, p10 / Median / p90, cm): alle 41,2 / 113,7 / 180,8 → 46,0 / 114,1 / 180,7; `predicted` 48,8 / 120,7 / 176,1 → 61,4 / 122,3 / 173,1; `predicted-shrunk` 39,7 / 108,2 / 160,6 → 45,3 / 107,0 / 157,3; `own` 54,7 / 118,3 / 206,5 → 71,9 / 118,2 / 213,7; `country` unverändert. Laufzeit gleich (386 / 385 s). Der Schmelzzustand begann in dieser Lesesicht kalt (der Zustand der Ansicht liegt 6 h nach der Laufstunde) — die Kette über zwei Läufe prüft L5.

**e) Schattenpaare (nur Plausibilität; die Station steht neben dem Eis):** Die Lesesicht vom 21.11. trägt noch keine IMIS-Stationen (kamen mit GI am 22.11.) ⇒ lokal **ein einziges** Schweizer Paar mit Stationswert (Stand 57,7 → 59,0 cm gegen 29 cm Station; 24-h-Änderung +3,2 → +3,3 gegen −1 cm). Die archivierten Runner-Paare (24.11. 17 und 23 UTC; 335 Schweizer Paare an 64 Stationen) sind mit dem Landeswert gerechnet; nach der Grundlage, die der Gletscher bekäme (Lauf 23 UTC, Modell / Station Median): `own` 1,78 (16 Paare), `predicted` 1,71 (109), `predicted-shrunk` 1,88 (97), `country` 1,82 (113); der neue Faktor läge dort im Median beim 1,03- / 1,05- / 1,06-fachen. Rangkorrelation (Station / Modell) gegen (neuer Faktor / Landeswert) an den 206 vorhergesagten Paaren: +0,18 — die Richtung stimmt schwach, Gleichlauf in 53 %. Stand und 24-h-Änderung mit dem neuen Faktor an diesen Stunden sind **nicht gerechnet**: dazu bräuchte es einen Schattenlauf mit dem Schalter (Cube und Zustände dieser Stunden) (V-GM-129). Den Stand auf dem Eis beweist das nicht.

**f) Mutationsrunde** auf einer Kopie des Baums (`C:\dev\buscosun-glacier-cache\gm10\mut\code`), `gm10b-mutations.mjs`: 46 eingebaute Fehler in Schalter, Producer, V-GM-91, V-GM-86, Leser, Vertrag, Regel, x1-Suche, Werkzeug und Neu-Einschwingen: **43 von 46 bemerkt** in der ersten Runde (keiner nur als Abbruch), Prüfer danach grün. Drei übersehen — und jede zeigte eine echte Lücke: (1) „Spanne einer Zeile passt nicht“: der Vertrag prüft beide Enden, aber kein Fall verletzte nur das untere; (2) „Landeswert-Zeile mit anderem Wert“ fiel nur über die nicht passende Spanne auf; (3) „Stunde ohne Antrieb als null gerechnet“: I17 hatte keine aus einem Wetterlauf gefüllte Stunde. Ergänzt: I1 um drei Negativkontrollen (nur unteres Ende, nur oberes Ende, Landeswert mit passender Spanne; jetzt 36), I17 um eine gefüllte Stunde mit Niederschlag. **Wiederholung: 3 von 3 bemerkt**, Prüfer danach grün (`gm10b-mutations.json`, `gm10b-mutations-rerun.json`). Die Kopie war vor der Runde Datei für Datei gleich dem Arbeitsbaum. Typecheck grün, Build 281/281, Budget unverändert (totalJs 2 118,1 / 2 121 KB, unter `src/` nur Verträge).

Die fünf Fragen: (1) Funktionserhalt — ohne Schalter jede Datei des vollen Laufs Byte für Byte wie HEAD, alle Prüfer grün; (2)–(5) keine Anzeige liest etwas Neues, unter `src/` nur zwei Verträge (Typen und Regeln), Build und Budget unverändert.

### 13.7 Befunde

| Nr. | Befund | Mehrwert · Skizze |
|---|---|---|
| V-GM-126 | Die Stationsregel wählt für 3 der 32 Eichgletscher eine andere Station als GM-3 (sie urteilt jetzt nach Katalog-Medianhöhe und Q20-Wintern); x1 des Builds korreliert mit Schritt 0 nur 0,81, Mont Collon 1,45 → 0,39; G1 wird dadurch schlechter (358 statt 335) | ein Prädiktor, der für alle gleich entsteht, ist der ehrliche — die Eichung auf das Build-x1 umstellen ist geschehen; die alten Zahlen von Schritt 0 gelten für das GLAMOS-x1 |
| V-GM-127 | Die Spannen-Regel schickt 493 von 1 256 Zielgletschern (16 % der Fläche) auf den Landeswert, vor allem tiefe (Medianhöhe < 2 668 m) und solche mit x1 < −0,10; im Auslassen kostet sie viel (wie gebaut 353 statt C 313 mm) | Jans Entscheidung, ob ein Rand (z. B. 10 % der Spanne) oder das Abschneiden des Prädiktors an der Spanne statt des Rückfalls gilt — neue eingefrorene Regel nötig |
| V-GM-128 | Sex Rouge und Plaine Morte (flache, windexponierte Plateaugletscher) werden mit C schlechter; 75 Zielgletscher sind Sex Rouge ähnlich | ein Windexpositionsterm, der trägt (tpi1k trug in Schritt 0 nicht); vorher nichts ändern |
| V-GM-129 | Die Schattenpaare können den neuen Faktor erst prüfen, wenn ein Lauf mit dem Schalter läuft; lokal fehlen der Lesesicht vom 21.11. die IMIS-Stationen | Schattenlauf mit `predicted` auf dem Runner (eigener Pfad, nicht veröffentlicht) oder eine Lesesicht ab dem 22.11. |
| V-GM-130 | Die Szenarien der Spannen ziehen den Faktor weiter mit σ 0,25 für jede Grundlage; nur der Kopf nennt die Paare je Grundlage | σ je Grundlage aus der Tabelle (own 0,01, predicted 0,16, shrunk 0,17, country 0,26) — eine Regeländerung der Spannen, auf Jans Wort |
| V-GM-131 | Ohne vorheriges Neu-Einschwingen beginnen beim Einschalten die 665 + 42 Gletscher im Schmelzzustand kalt (im Winter hebt das die Kachel „Fläche ohne Schneedecke“, vgl. GM-3d) | Einschalten immer zusammen mit `snowpack-seed.mjs --melt-respin` auf den Zustand im Daten-Repo und dem neuen Startzustand der Schneedecke |
| V-GM-132 | `main` des Einschwing-Werkzeugs ist von keinem Prüfer gedeckt (Netz-Eingänge); ein Fehler in der Reihenfolge (`respin` vor seiner Deklaration) fiel erst im echten Lauf auf; ebenso reichte die Kommandozeile von `melt.mjs` `--glacier-factor-table` zuerst nicht durch (jetzt L7) | ein Prüfer, der `main` an einem Zwischenspeicher-Fixture laufen lässt |
| V-GM-133 | `fac` vermerkt nur den Faktor; ein Umschalten der Form je Band mischt weiter zwei Rechnungen im Schmelzzustand | die Form in dieselbe Regel aufnehmen, wenn E-GM-38 die Form einschaltet |
| V-GM-134 | Die drei Schweizer Gletscher von GM-5b ohne Gitter-x1 in Schritt 0 (Vorab, Segnas, Tiefen) haben jetzt ein Build-x1, stehen aber nicht in der Anpassung (Menge der eingefrorenen Regel) | in der nächsten Runde mitnehmen (neue Regel) |

### 13.9 Nachtrag 25.11. abends — Tabelle ins Repo (GLAMOS hat die Nutzung bestätigt)

Jans Auftrag nach der Mail von GLAMOS (25.11.2026, `audit/gletscher/licences.md` „GLAMOS — Bestätigung 25.11.2026“): die Tabelle
vorhergesagter Faktoren kommt mit Quellenangabe ins Repo, `snow-calibration-glaciers.json` bleibt, wie sie ist.

- **Quellenblock im Code:** `SNOW_FACTOR_SOURCES` in `lib/snowcalPredict.mjs` (Vermerk „abgeleitete Modellgrößen … keine Zeile und
  kein Messwert der Quelldateien“; GLAMOS Release 2025 mit DOI, CC BY 4.0, dem **empfohlenen Zitat wörtlich** und dem Vermerk der
  Bestätigung; SLF-Schneedatensatz Q20 v1.1, MeteoSchweiz, Copernicus GLO-30). Das Werkzeug schreibt ihn, der Vertrag der Tabelle
  verlangt genau ihn (`verify:glacier-snowcal` I1: zwei Negativkontrollen mehr, zusammen 38; neu I8 prüft die Datei im Repo).
- **Neu gebaut** 17:13:57–17:16:47 UTC im Vordergrund (frei 1,2 von 19,7 GB, Chrome hielt 10,5 GB; ein Vordergrundlauf ist vor dem
  Speicher-Reaper sicher), derselbe Aufruf wie um 14:02. **Feld für Feld gleich dem Bau von 14:06 außer `builtAt`, `sources` und
  `inputs.tool`** (Hash des geänderten Werkzeugs); der Bericht (`table-src.out.json`) ohne Pfad, Hash und Zeitstempel gleich.
  Datei `scripts/glacier/snow-factor-predicted-ch.json`, sha256 `8fa1833ce90c771b…` (vorher lokal `fadea420…`). Die Faktoren sind
  dieselben; die Volläufe 3c/3d liefen mit `fadea420` — mit der neuen Datei heißt die Regel `predicted:8fa1833ce90c771b`.
- Prüfer: `-snowcal` **55/55**, `-melt` 85/85, `-snowpack` 75/75. Gegenprobe auf der Kopie: „Vertrag verlangt die Quellenangabe
  der Tabelle nicht“ — bemerkt von I1, Prüfer danach grün (`gm10b-mutations-sources.json`). `src/` unverändert seit dem Gate
  (Typecheck, Build, Budget nicht neu gerechnet).
- Der Schalter `predicted` bleibt aus, bis V-GM-127 gemessen ist (Jan). Kommen Faktoren in die Anzeige, gehört das Zitat von GLAMOS
  in die Quellen-Kachel.

### 13.8 V-GM-107 — erste 24-h-Änderung aus den Schattenpaaren des Runners

Nur gelesen, 25.11. 18:30 UTC, kein voller lokaler Lauf aktiv. Werkzeug `gm10b-pairs24.mjs`, Bericht
`C:\dev\buscosun-glacier-cache\gm10\runner\v107-2517.json`. Lauf A = `pairs-2026112417` (Ablage), Lauf B = `pairs/2026112517.json`
aus dem Daten-Repo (Commit `9dc7e990`, 17:28:59 UTC, über raw an diesem Commit gelesen; **die Ablage-Kopie von 2517 gibt es erst nach dem
Archivlauf 23:10 UTC** — der Vergleich mit ihr steht aus). Regel wie GM-4 §3h.3: Schneefall = Station ≥ +3 cm in 24 h, ruhig =
|Station| < 1 cm, Verhältnis = mittlere Modelländerung / mittlere Stationsänderung (nur bei |Station| ≥ 1 cm). 465 Paare in beiden Läufen.

| Teilmenge | Paare (Stationen) | Station cm | Modell cm | Verhältnis | MAE cm | r |
| --- | --- | --- | --- | --- | --- | --- |
| alle, Schneefall | 98 (17) | +6,5 | +1,0 | **0,15** | 6,1 | 0,33 |
| alle, ohne Schneefall | 367 (74) | −4,4 | −0,7 | 0,15 | 4,6 | 0,28 |
| alle, ruhig | 89 (15) | +0,1 | −0,5 | — | 1,9 | −0,07 |
| CH, Schneefall (IMIS 96 von 97) | 97 (16) | +6,5 | +1,0 | 0,15 | 6,1 | 0,32 |
| CH, ohne Schneefall (IMIS) | 238 (48) | −5,6 | 0,0 | 0,00 | 5,8 | 0,45 |
| AT, ohne Schneefall (Tirol 94, Hydro 26, Bozen 8) | 129 (27) | −2,0 | −1,8 | 0,93 | 2,4 | 0,04 |
| AT, ruhig | 56 (8) | +0,2 | −1,7 | — | 1,9 | 0,17 |

**Lesart (ein Fenster, 17 Stationen mit Schneefall — kein Urteil):** Am Schneefall nimmt die Schneedecke des Runners in 24 h nur
**0,15** der Stationsänderung auf; GM-4 maß im Fenster 22./23.11. mit Analysen und Startzustand **0,76**. Fast alle Schneefallpaare
sind IMIS-Stationen der Schweiz. Dort sinkt die Station an den übrigen Paaren um 5,6 cm, das Modell bleibt bei 0,0 — Setzung oder
Verfrachtung an der Station, die das Modell in 24 h nicht zeigt. In Österreich folgt das Modell der Abnahme (0,93), an ruhigen
Paaren sinkt es um 1,7 cm, wo die Station steht. Zwei Ursachen lassen sich aus einem Fenster nicht trennen: der Antrieb (der
Runner rechnet mit dem Niederschlag von buscosun Fusion, GM-4 mit Analysen) und der Kern (Setzung). Der vorhergesagte Faktor ist
aus — diese Zahlen sind die des Landeswerts. Befund **V-GM-135**.

| V-… | Befund | Mehrwert · Skizze |
| --- | --- | --- |
| V-GM-135 | Im ersten 24-h-Fenster aus den Runner-Paaren (24.11. 17 → 25.11. 17 UTC) nimmt die Schneedecke am Schneefall nur 0,15 der Stationsänderung auf (GM-4: 0,76); an den IMIS-Stationen ohne Schneefall sinkt die Station 5,6 cm, das Modell 0 | weiß, ob die Schneedecke Neuschnee im Betrieb verschluckt · dieselbe Ablesung über sieben Fenster (bis 02.12.) und je Fenster den Niederschlag von buscosun Fusion an der Station gegen RhiresD/IMIS legen, damit Antrieb und Kern getrennt werden; nichts ändern, bevor sieben Fenster dasselbe sagen |

